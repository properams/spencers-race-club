# SESSIE: iOS Stability Investigation — Phase 1 Report

**Branch**: `claude/ios-stability-investigation-03CAO`
**Datum**: 2026-05-03
**Status**: Phase 1 (onderzoek) — geen code-wijzigingen.
**Symptomen**: regelmatige page-crashes ("Kan deze pagina niet openen") + soms stille terugval naar title-screen bij track-select op iOS Safari/Chrome.

---

## TL;DR — top 5 hypotheses, ranked

1. **Game-loop pauzeert niet wanneer de tab achtergrond wordt** (`js/core/loop.js:51`). Op iOS draait de loop op ~60 fps door tijdens TITLE/SELECT als de tab achtergrond is, drains battery, en iOS killt de tab veel sneller wegens "high CPU when backgrounded".
2. **`makeAllCars()` in `goToRace` heeft geen try/catch** (`js/ui/navigation.js:55`). Een OOM-throw in een car-builder zet `gameState` poison'd op `'SELECT'` (de transitie naar `'COUNTDOWN'` op regel 86 wordt nooit bereikt). Door het re-entry guard op regel 46 voelt elke volgende tap als no-op.
3. **WebGL context-loss reload-timer schiet na 6 sec naar `location.reload()`** (`js/core/renderer.js:29`). Reload boot je naar `gameState='TITLE'`. User-perceptie: "ik tikte op een track en kwam ineens op title". Geen error-modaal, geen breadcrumb.
4. **Inline Three.js r160 (~600KB) blokkeert main thread bij parse** (`index.html` regels ~445-454). Op iPhone 8/iPhone X kan synchronous parse 1.5-3 sec duren — combineer met audio-init en eerste `buildScene()` en de page kan >5 sec onresponsive zijn → iOS keurt 'm als "process under stress" en killt 'm bij memory-druk.
5. **Asset/GLTF cache wordt nooit geleegd** (`js/assets/loader.js:_modelCache`). Bij elke world-switch komen er nieuwe textures/models bij maar oude blijven via `userData._sharedAsset=true` in geheugen. Cumulatief drift loopt over 5-10 races richting de iOS tab-kill threshold (~250-400MB).

Hypotheses A en B (uit de mega-prompt) zijn beide aannemelijk; C is onwaarschijnlijk (preloads resolven altijd `null`); D is gedeeltelijk waar (guard bestaat, maar dubbele wereld-card taps zijn niet beschermd in `js/core/boot.js:87-99`).

---

## 1.1 — Memory-pressure audit per world

### Skybox-textures (alle worlds, `js/core/scene.js`)

Alle 8 worlds gebruiken **`_newSkyCanvas()` op 1024×512** (`scene.js:94`). Eén skybox = ~2 MB GPU (RGBA8 uncompressed). Niet alarmerend, maar geen mobile-cap.

| World | Skybox builder | Lijn |
|---|---|---|
| GP | `makeGPSkyTex` | scene.js:315 |
| Space | `makeSpaceSkyTex` (640 sterren + galaxy band) | scene.js:108 |
| DeepSea | `makeDeepSeaSkyTex` (lichtschachten + 300 plankton) | scene.js:143 |
| Candy | `makeCandySkyTex` (14 wolken + 60 sparkles) | scene.js:167 |
| NeonCity | `makeNeonCitySkyTex` (skyline + windows + 150 stars) | scene.js:191 |
| Volcano | `makeVolcanoSkyTex` (10 smoke clouds + 120 embers) | scene.js:227 |
| Arctic | `makeArcticSkyTex` (3 aurora bands) | scene.js:255 |
| Themepark | `makeThemeparkSkyTex` (12 sunset clouds) | scene.js:288 |

**Totaal skybox per world: ~2 MB GPU, niet de bottleneck.**

### InstancedMesh + canvas-textures per world (audit van subagent + verificatie)

| World | InstancedMesh count | CanvasTextures (extra) | Particles | Notable |
|---|---|---|---|---|
| **NeonCity** 🔴 | 120 stars; ~40 buildings | 512×512 sheen overlay, 64×128×40 building windows (~320KB), 256×64×8 holo-billboards | 200 steam + 350 dust | **~1.8 MB extra GPU** + EMP zones |
| **Space** 🔴 | varieert | warp tunnel sprites | 2200 stars + 400 horizon + 350 dust | **~2 MB**: 2200 sterren in een Points geometry |
| **DeepSea** 🟡 | 80 stars + 18 fish | 512×80 + 256×32 labels | 180 jellies + 400 plankton | Kelp + jellyfish via InstancedMesh |
| **GP** 🟢 | 380 night-stars (`environment.js:1044`) | 4 ad-boards 256×128 | n/a | 22 roadside-props (GLTF if cached) |
| **Themepark** 🟢 | 70 stars + ferris wheel rig | spectator crowd 512×192 | fireworks sprites | |
| **Candy** 🟢 | tree clusters | sprinkle texture | 600 sprinkles | |
| **Arctic** 🟢 | 200 blizzard particles | aurora canvas | 250 blizzard | |
| **Volcano** 🟢 | 60 stars + lava rivers | 1 emberhaze sky | 120 embers | |

🔴 = boven 1.5 MB extra GPU, **iOS-risico bij combo met racers + skidmarks + minimap**.

### Audio buffers

- `js/audio/samples.js`: alle slots leeg, manifest verwijst naar files die niet op disk staan (zie `CLAUDE.md`). **Effectieve audio-buffer = 0 MB voor sample-content.**
- `js/audio/music-stems.js`: per `samples.js` ook fallback. **Geen music-stems geladen.**
- Procedural music (`js/audio/music.js`, 952 regels) gebruikt veel oscillator-nodes. Op pause werd er ooit `audioCtx.suspend()` gedaan, maar dat is verwijderd (`pause.js:14`) i.v.m. setTimeout-issues. **Risico**: bij snelle world-switches blijven oude oscillators leven tot `_fadeOutMusic` ze stopt; eerder al gemerkt in PROJECT_STATE.

### GLTF/texture asset cache

- `js/assets/loader.js`: `_modelCache`, `_textureCache`, `_hdriCache` zijn `Map()`s die **nooit geleegd worden** (geen evict-pad).
- Geladen via `Assets.preloadWorld(world)` als fire-and-forget vanuit `js/ui/select.js:376` en `js/core/boot.js:172`.
- `disposeScene()` (`js/core/scene.js:36-78`) **skipt** alle textures/geometries met `userData._sharedAsset=true` — wat correct is voor de cache, maar het betekent dat de cache groeit zolang de tab leeft.
- **Cumulatief leak-vector**: speel je 8 verschillende werelden achter elkaar, dan zitten alle 8 wereld-asset-sets in cache. Op een iPad/iPhone met 1 GB GPU is dit een serieus issue na 5+ world switches.

### Render-time disposal-discipline

`disposeScene()` is verbazend grondig (3-laagse texture check op map/normalMap/roughnessMap, `_shared()` guard). **Risico's gevonden:**

- `_crowdMaterials` reset in `disposeScene` (`scene.js:72`) — defense-in-depth bestaat.
- `_propColliders` reset in `scene.js:66` — OK.
- **`renderer.renderLists.dispose()` op regel 77** — goed.
- `scene.environment` en `scene.background` worden ge-disposed mits niet `_shared` — OK.
- **Niet ge-disposed**: `_pendingRaceMusic` blijft staan als de user pauzeert tijdens countdown en quit (zie `navigation.js:108-112` voor pre-construct).

### MB-budget per world (geschat)

| World | Skybox | Extra textures | InstancedMesh + Points | Lights | Materials | **Totaal GPU** |
|---|---|---|---|---|---|---|
| GP | 2 | 1 (ads) | ~1 (380 stars+props) | 4 | ~30 | **~5 MB** |
| Space | 2 | 1.5 | 4 (2200+750+350 points) | 4 | ~25 | **~9 MB** |
| DeepSea | 2 | 1 | 2 | 4 | ~20 | **~6 MB** |
| NeonCity | 2 | **2** (sheen+windows+holo) | 1.5 | 6 | ~35 | **~9 MB** |
| Volcano | 2 | 0.5 | 1 | 4 | ~20 | **~5 MB** |
| Arctic | 2 | 0.5 | 1 | 4 | ~18 | **~5 MB** |
| Candy | 2 | 0.5 | 1 | 4 | ~22 | **~5 MB** |
| Themepark | 2 | 1 | 2 (rides) | 6 | ~28 | **~7 MB** |

**Plus** auto's (8× ~150KB textures × 8 bodyparts = ~10 MB), skidmarks (capped), HUD canvas (~1 MB), bloom RT op desktop (~16 MB), env-map-PMREM cube (cached, ~12 MB als HDRI geladen).

**Per race totaal: 25-50 MB GPU**, plus heap (Three.js + game state) ~30-60 MB JS heap.

**iOS Safari 250-400 MB tab-kill threshold halen we niet in één race**, maar **wel cumulatief** als asset-cache groeit en JIT-warmgemaakte shaders blijven hangen.

---

## 1.2 — WebGL context-loss audit

`js/core/renderer.js:23-38`:

```js
canvas.addEventListener('webglcontextlost',e=>{
  e.preventDefault();                                    // ✓ goed: zonder dit geen restore
  _ctxLost=true;
  window.dbg&&dbg.warn('renderer','webglcontextlost…');
  const ov=document.getElementById('ctxLostOverlay');if(ov)ov.style.display='flex';   // ✓ visuele feedback
  if(audioCtx&&audioCtx.state==='running')audioCtx.suspend().catch(()=>{});           // ✓
  _ctxLostReloadTimer=setTimeout(()=>{if(_ctxLost)location.reload();},CTX_LOSS_RELOAD_MS);  // ⚠ silent-to-title vector
});
canvas.addEventListener('webglcontextrestored',()=>{
  …
  try{if(scene&&activeWorld)buildScene();}catch(err){…location.reload();}             // ⚠ tweede silent-reload
});
```

**Bevindingen:**

| Check | Status | Details |
|---|---|---|
| `preventDefault()` op contextlost | ✓ | regel 24 |
| `webglcontextrestored` luistert | ✓ | regel 31 |
| Restore: scene rebuild | ✓ | regel 37, `buildScene()` |
| Restore-rebuild faalt → silent reload | ⚠ | regel 37 catch → `location.reload()` |
| 6-sec reload timeout | ⚠ | regel 22 — **dit is de eerste user-zichtbare "silent navigation to title"-vector** |
| Audio suspend/resume | ✓ | regels 28, 36 |
| `loop()` skipt frames bij `_ctxLost` | ✓ | `loop.js:53` |
| CanvasTextures opnieuw uploaden na restore | ⚠ | Three.js doet dit voor `Texture` met `needsUpdate=true`, maar onze `CanvasTexture`s (skybox, ads, holo) hebben dat niet flag-set. Worst case: blank textures totdat `buildScene` ze opnieuw aanmaakt — maar `buildScene()` wordt aangeroepen in restore, dus dat dekt het. ✓ |
| User-controle om te retry'en | ✗ | Geen knop "tik om te herstellen" — alleen automatische timer |

**Verdict**: handler is correct gewired qua mechaniek, maar **de silent reload na 6 sec is een directe oorzaak van de "stille terugval naar title"-perceptie**. Bovendien: als context herstelt en `buildScene()` faalt, krijg je een tweede silent reload zonder dat de user ooit de overlay heeft kunnen lezen.

---

## 1.3 — Stille navigatie naar title — root cause

### Alle expliciete `goToTitle()` callers

```
index.html:61    — worldSelBack onclick (user-initiated, expected)
index.html:354   — pauseBtn QUIT TO MENU (user-initiated, expected)
index.html:410   — finBtn MAIN MENU (user-initiated, expected)
js/core/boot.js:224 — perfHooks.goToTitle (test-mode only via ?perfauto=1)
```

**Geen automatische / catch-block goToTitle.** Geen `goToTitle` in error-recovery.

### Indirect: paden die "stille terugval naar title" lijken

Subagent-onderzoek + eigen verificatie hebben deze paden geïdentificeerd:

#### Pad A: WebGL context-loss reload-timer (`renderer.js:29`)

- Trigger: GPU memory exhausted tijdens `makeAllCars()` of `buildScene()` op iOS, of system-level GPU pressure (multitasking apps).
- 6-seconden timeout firet → `location.reload()` → page boot → `gameState='TITLE'` (default).
- **User-perceptie**: "Ik tikte op een track, scherm bevroor 6 sec, ineens ben ik weer op title".
- **Confidence**: HIGH. Dit is precies de combinatie die mensen op iOS rapporteren.

#### Pad B: `makeAllCars()` exception in `goToRace` (`navigation.js:55`)

```js
function goToRace(){
  if(gameState!=='SELECT')return;        // re-entry guard
  …
  makeAllCars();                          // ⚠ GEEN try/catch
  cacheHUDRefs();applyWorldHUDTint(activeWorld);   // niet bereikt bij throw
  …
  gameState='COUNTDOWN';                  // ⚠ niet bereikt bij throw → state blijft 'SELECT'
```

- Trigger: car-builder OOM-throw of branding-builder bug.
- Effect: `goToRace` halverwege afgebroken, `gameState='SELECT'` blijft staan.
- **Volgende tap op Race**: re-entry guard `if(gameState!=='SELECT')return` is `false` → opnieuw poging → opnieuw crash.
- **OF**: window.onerror overlay shows red banner (`index.html:28`). User kan tap-to-dismiss. UI lijkt dan "klaar voor select" maar is poison'd.
- **Confidence**: MEDIUM-HIGH. Dit verklaart de "tap doet niks" variant van het symptoom.

#### Pad C: Asset-preload promise zonder `.catch`

`js/core/boot.js:171-175` en `js/ui/select.js:376-380`:

```js
window.Assets.preloadWorld(window.activeWorld).then(()=>{
  if(typeof maybeUpgradeWorld==='function')maybeUpgradeWorld(window.activeWorld);
});  // GEEN .catch
```

- Loaders in `js/assets/loader.js` resolven altijd `null` op error (regels 141, 187, 214, 270, 308) — promise rejected nooit op load-failure.
- **MAAR**: als `maybeUpgradeWorld()` zelf throwt (bv. tijdens HDRI apply met PMREM oom), dan is dat een unhandled rejection.
- **Effect**: `index.html:31-33` window.unhandledrejection listener toont rode overlay. Niet stille terugval, dus dit is **niet** een silent-to-title vector. Maar wel een crash-vector als de user de overlay onbewust dismissed.
- **Confidence**: LOW als root-cause van symptoom 2; MEDIUM als bijdrage aan symptoom 1.

#### Pad D: Race condition op wereld-card dubbele tap

`js/core/boot.js:87-99` (wereld-cards onClick):

```js
card.addEventListener('click',()=>{
  const newWorld=card.dataset.world;
  …
  if(newWorld!==activeWorld){rebuildWorld(newWorld);}   // synchroon buildScene()
  setTimeout(()=>{
    document.getElementById('sWorld').classList.add('hidden');
    gameState='SELECT';
    …
  },220);
});
```

- Geen debounce/in-flight guard. Twee snelle taps op verschillende cards (bv. NeonCity → Space):
  1. Tap 1: `rebuildWorld('neoncity')` start → 1-3 sec synchrone build.
  2. Tijdens die build: Tap 2 wordt door browser ge-queued, maar tijdens een synchrone JS-run worden geen click-handlers fired (single-threaded).
  3. Na build: `setTimeout(220ms)` queuet UI-flip naar SELECT.
  4. Click-handler 2 wordt fired → `rebuildWorld('space')` → tweede 1-3 sec build met de SELECT-flip nog onderweg.
  5. Result: race-condition — UI kan twee keer flippen, of de tweede build kan corrupte state achterlaten.
- **Effect op symptoom 2**: niet direct silent-to-title, maar wel bron van inconsistente UI-state.
- **Confidence**: MEDIUM voor crash; LOW voor silent-to-title.

#### Pad E: Inline error-overlay in index.html (`index.html:18-48`)

Click-to-dismiss, **geen redirect**, geen reload. **Geen silent-to-title vector.** Wel een "user kan een crash verbergen door op overlay te tappen waarna game in poison-state staat".

### Welke hypothese klopt — A/B/C/D?

| Hypothese | Verdict | Bewijs |
|---|---|---|
| **A** (`buildScene` OOM → fallback to title) | DEELS waar | Geen expliciete fallback, maar `renderer.js:37` faalt-restore → `location.reload()` → effectief title |
| **B** (context-loss tijdens build → reload) | **WAAR (PRIMAIR)** | `renderer.js:29` 6-sec reload-timer, en `renderer.js:37` second-chance-reload |
| **C** (`_preloadWorld` rejection) | NEE | Loaders resolven altijd null. Eventuele throws gaan via `unhandledrejection` overlay, geen redirect |
| **D** (race condition double tap) | DEELS | Geen guard op wereld-cards (`boot.js:87`), geen guard op rebuildWorld zelf |

**Primary cause = combinatie van A+B**: GPU memory pressure → WebGL context-loss → 6-sec reload → user landt op title.

---

## 1.4 — iOS-specifieke risico's

### Page Visibility — **CRITICAL gap**

```
js/core/loop.js:54   if(gamePaused){clock.getDelta();return;}    ← alleen race-pause
js/core/loop.js:53   if(_ctxLost){clock.getDelta();return;}      ← alleen ctx-lost
                     ↑ GEEN check op document.hidden / visibilityState
```

- Game-loop draait door bij tab-background. Op iOS = drains battery → iOS killt tab eerder.
- **Bestaande visibility-listeners**:
  - `js/core/renderer.js:40` — suspend/resume audioCtx ✓
  - `js/ui/touch.js:26-28` — reacquire wake lock op visible ✓
- **Ontbreekt**: pauze van rAF-loop, pause van update-functies, pause van music-scheduler.

### Wake Lock (`js/ui/touch.js:19-24`)

```js
async function _acquireWakeLock(){
  try{if('wakeLock' in navigator&&!_wakeLock)_wakeLock=await navigator.wakeLock.request('screen');}catch(_){}
}
```

- ✓ Feature-detect via `'wakeLock' in navigator`.
- ✓ Try/catch swallowt rejection (iOS < 16.4 gooit geen API-error want het bestaat niet eens).
- ✓ Geen crash-risico.

### AudioContext lifecycle — **MINOR**

- `js/core/renderer.js:40` luistert visibilitychange → `audioCtx.suspend()/resume()` zonder state-check. Op iOS waar context al suspended is, is `suspend()` no-op. Op resume zonder user-gesture na lange pauze kan iOS de resume blokkeren — `_ensureAudio()` in `boot.js:78` is daar al voor.
- `js/audio/api.js:130` — `console.warn` zonder dbg-fallback (PROJECT_STATE bekend).
- `js/audio/music.js:52` — `console.warn` zonder dbg-fallback (PROJECT_STATE bekend).

### Inline Three.js parse-cost — **HIGH iOS**

- `index.html:445` heeft inline `<script>` blok met Three.js r160 minified. Het comment op `index.html:434-441` documenteert dat dit verplaatst kan worden naar externe vendor-file maar het is **niet gedaan**.
- File-size `index.html` = 631 KB. Het inline three-blok is praktisch alle van de bytes.
- **Impact iOS**: synchronous parse + JIT compile blokkeert main thread. Op iPhone 8 ~2-3 sec, op iPhone X ~1-2 sec, op nieuwe modellen ~0.5 sec.
- Externe `<script src="...">` zou parallel met HTML kunnen download'en + parser-cost wegnemen van first-paint.

### Long-running JS frames

- `buildScene()` in `js/core/scene.js:336-568` is **volledig synchroon**. Op GP/Space/NeonCity = 1-3 sec hard-blocked main thread. Op iOS = "page unresponsive" prompt-risico.
- `_precompileScene()` in `js/core/scene.js:580` is bewust verkleind (oude warm-render verhuisd) — ✓.
- **Cumulative-build risk**: `_restoreUserPrefs` in `js/core/boot.js:122-138` triggert een **double buildScene** als saved world `'space'` is (lines 123-126). De eerste build draaide al op default world; nu bouwt 'm opnieuw met space. Dat is **2× synchrone build op boot**.
- O(n²) loops in main update? Geen aangetroffen in `loop.js`. AI is gestaggered op mobile (`loop.js:75`).

### Touch event listeners

- `js/ui/touch.js:88-91` — pointerdown/up met `{passive:false}` (nodig voor preventDefault). ✓
- `js/core/boot.js:50-58` — `touchstart` listener met `{passive:false, capture:true}` filtert canvas-targets. ✓
- Geen scroll-jank risk gevonden.

### Skidmarks / minimap

- `js/effects/visuals.js` skidmarks — geometry capped op 80, ✓.
- HUD minimap — `js/ui/hud.js` (421 regels). CanvasTexture-update frequency need-confirmed in Phase 2.

### Postfx + bloom + shadows

- ✓ Bloom auto-disabled op mobile (`js/effects/postfx.js`).
- ✓ Antialias off mobile (`renderer.js:15`).
- ✓ Shadow maps off mobile (`renderer.js:43`).
- ✓ Pixel ratio max 1.5 mobile (`renderer.js:41`).
- ✓ Mirror render skipped op `_lowQuality` (`loop.js:176`).

---

## 1.5 — Reproduceerbaarheid

### Heaviest world-combinaties

Op basis van 1.1 audit:

1. **NeonCity + rain + night + 5 laps** — meest texture-zwaar (~9 MB GPU).
2. **Space + AI count >5 + meteorshower** — meest particle-vertex zwaar (2200 stars + meteoren).
3. **DeepSea + storm + Manta + whale spawn** — meest dynamische geometry.

### Cumulative-build patroon (LIKELY)

Asset-cache (`_modelCache`/`_textureCache`/`_hdriCache`) groeit per `Assets.preloadWorld()` call. Test-scenario:

1. Boot → GP loaded.
2. World-select → NeonCity → preloadWorld('neoncity') → cache groeit.
3. Race → finish.
4. Back → World-select → Space → preloadWorld('space') → cache groeit nog meer.
5. Race → finish.
6. ... 5-8 keer herhaald → cache van 8 worlds in geheugen.

Op iOS met andere apps in achtergrond: ergens tussen 4-8 world-switches kruipt totaal geheugengebruik over ~250 MB threshold → **WebGL context-loss event** → 6-sec reload-timer → user op title.

### Specifieke transitions

- **World-select → race-start**: `disposeScene()` (oude wereld weg) gebeurt synchroon in `buildScene()` op het moment dat de speler op de wereld-card tikt (`select.js:382` of `boot.js:92`). De daarop volgende `makeAllCars()` in `goToRace()` voegt 8 cars toe. Op het kortste moment (tussen disposeScene en makeAllCars) zit het oude geheugen al weg, maar JIT-compiled shaders + materialen voor de nieuwe wereld zijn nog niet gepiekt. Piek-VRAM = einde van `makeAllCars()`.
- **Storm/rain trigger mid-race**: `js/effects/weather.js` voegt particle-systeem toe → +memory tijdens race. **Niet getest in dit onderzoek**, maar potentiële trigger voor context-loss in een al stress-loaded race.

---

## 1.6 — Tooling-gap analyse

### Wat we al hebben

| Tool | Locatie | Werkt op iOS? |
|---|---|---|
| `dbg` ringbuffer + viewer | `js/core/debug.js` | ✓ (Ctrl+Shift+E op desktop, geen mobile-trigger) |
| `dbg.snapshot` | `js/core/debug.js` | ✓ |
| Inline error-overlay | `index.html:18-48` | ✓ |
| Perf overlay | `js/core/perf.js` | ⚠ heap = N/A op Safari (ok'd via `if (performance.memory)`) |
| Race-events markRaceEvent | `js/core/debug.js` | ✓ |
| `?debug` URL flag | `js/core/debug.js` | ✓ |
| `window.dbg.persistedErrors()` | `js/core/debug.js` | ✓ — errors blijven in localStorage cross-session |
| ctxLost overlay | `index.html` (regel ~430) | ✓ |
| WebGL context-loss listener | `js/core/renderer.js:23` | ✓ |
| `loadingScreen` boot fallback | `js/core/boot.js:150,163` | ✓ |
| Asset-status panel in pause | `js/ui/pause.js:21` | ✓ |

### Gaps (niet implementeren in Phase 1, alleen documenteren)

| Gap | Impact | Implementatie-locatie |
|---|---|---|
| **Geen visibility-pause op game-loop** | iOS-tab-kill na background | `js/core/loop.js:51` |
| **Geen debounce op wereld-card en track-select tap** | Race-condition bij dubbele tap | `js/core/boot.js:87`, `js/ui/select.js:1054` |
| **Geen breadcrumb in localStorage van laatste user-actie** | Na crash/reload onmogelijk te reconstrueren wat gebeurde | new file `js/core/breadcrumb.js` of inline in `js/core/debug.js` |
| **Geen budget-warning bij boot** | User weet niet dat z'n device kandidaat is voor crashes | `js/core/boot.js` na initRenderer |
| **Geen try/catch om `makeAllCars()`** | Silent SELECT-state poison na OOM | `js/ui/navigation.js:55` |
| **Geen try/catch om `rebuildWorld()`'s buildScene** | World-card click crashed silently | `js/ui/select.js:382` |
| **Geen `.catch` op `Assets.preloadWorld(...)`** | Onvolledige error-routing | `js/core/boot.js:172`, `js/ui/select.js:376` |
| **2 `console.error/warn` zonder dbg-fallback** | Bypass error-ringbuffer | `js/audio/api.js:130`, `js/audio/music.js:52` (PROJECT_STATE-bekend) |
| **Geen debug-trigger op mobile** voor `Ctrl+Shift+E` viewer | Tester kan errors niet inzien op iPhone | `js/core/debug.js` (5-vinger tap?) |
| **Asset-cache nooit geleegd cumulatief** | Geheugen-leak over lange sessies | `js/assets/loader.js` (eviction policy) |
| **`_savedWorld='space'` triggert double buildScene op boot** | 2× CPU-piek bij start | `js/core/boot.js:122-126` |
| **Inline three.js (~600KB) blokkeert main-thread parse** | iOS "page unresponsive" risico | `index.html:445` → externe file |

---

## Phase 2 — voorgestelde fixes (prioriteit)

Op basis van de bevindingen hierboven, hier de geprioriteerde fix-categorieën. Bij elke fix staat de bijhorende Phase 1 bevinding.

### Must-have (hoge confidence dat ze de symptomen raken)

**Fix A — Stille fallback elimineren** (raakt 1.3 paden A+B)

1. `try/catch` om `makeAllCars()` in `js/ui/navigation.js:55`. Bij failure: `dbg.error` + visuele toast "Race kon niet starten — probeer opnieuw" + reset `gameState='SELECT'`.
2. `try/catch` om `buildScene()` in `js/ui/select.js:382` (rebuildWorld). Bij failure: blijf op SELECT met error-toast.
3. `.catch()` op alle `Assets.preloadWorld()` calls (`boot.js:172`, `select.js:376`).
4. Debounce wereld-card click in `js/core/boot.js:88` en track-select-race in `js/ui/select.js:1054-1068` (300ms cooldown).
5. WebGL context-loss handler: vervang automatic `location.reload()` door **user-tikbare retry-knop** in de bestaande overlay (`index.html` ctxLostOverlay) — alleen reload als user expliciet kiest.

**Fix D — Page-visibility lifecycle** (raakt 1.4 #1)

1. `document.addEventListener('visibilitychange', ...)` in `js/core/loop.js`: zet een `_pageHidden` vlag, en `loop()` skipt body wanneer hidden (vergelijkbaar met `_ctxLost`/`gamePaused` op `loop.js:53-54`).
2. Bij `visibilitychange`-visible: forceer een `clock.getDelta()` reset zodat de eerste frame na resume niet een grote dt heeft.
3. Music scheduler ducken bij hidden (al gedeeltelijk via audioCtx suspend, maar niet voor stem-based scheduler).

**Fix E — Diagnostiek** (raakt 1.6 gaps)

1. Crash-breadcrumb in localStorage: bij elke navigatie (`goToTitle`, `goToSelect`, etc.), bij elke `buildScene` start/end, bij elke `makeAllCars` start/end → push naam + timestamp naar `localStorage.src_breadcrumb` (laatste 10). Bij boot: lees ze, push naar `dbg.persistedErrors`-channel zodat ze in `Ctrl+Shift+E` te zien zijn.
2. Memory-budget warning bij boot: lees `performance.memory.jsHeapSizeLimit` (Chrome iOS) of `navigator.deviceMemory` (Chrome Android), als `<2 GB` toon waarschuwing op title.
3. De 2 `console.error/warn` calls in `audio/api.js:130` en `audio/music.js:52` routeren via `dbg.warn` met fallback.

### Should-have (raakt cumulative-leak en parse-cost)

**Fix B — Memory-druk verlichten** (raakt 1.1 cumulative + heaviest worlds)

1. Mobile-cap op skybox canvas: 512×256 i.p.v. 1024×512 (`scene.js:94`). Bespaart ~1.5 MB per world.
2. NeonCity: building-windows render op `Math.ceil(buildings*0.5)` op mobile.
3. Asset-cache eviction: bij world-switch, evict cache-entries van werelden die de afgelopen 3 sessies niet bezocht zijn.
4. `_restoreUserPrefs` in `js/core/boot.js:122-126`: skip de double `buildScene` als de eerste al voor het saved-world was. Zet `activeWorld='space'` vóór de eerste `buildScene` in de boot-flow.

**Fix C — WebGL context-loss recovery met user-controle** (raakt 1.2 silent-reload)

1. `webglcontextlost` handler: toon overlay met "Tik om te herstellen" knop in plaats van automatische 6-sec reload.
2. `webglcontextrestored` handler: als rebuild faalt, toon "Reload-knop" in plaats van automatische `location.reload()`.

**Fix F — Three.js externalize** (raakt 1.4 parse-cost)

1. Verplaats inline three-blok naar `assets/vendor/three-r160.min.js` (volgens comment in `index.html:434-441`). Browser kan dan parallel parsen + caching werkt.
2. Risico: file:// hosting kan dat blokken. Vereist confirmatie van user dat dit acceptabel is.

### Nice-to-have

- 5-vinger tap op title trigger `dbg.showErrors()` zodat tester errors op iPhone kan zien.
- `dbg.snapshot` op elke `disposeScene` call zodat memory-trends per world meetbaar worden.

---

## Phase 2 — voorstel commit-volgorde

1. `docs(stability): investigation report on iOS crashes` — alleen dit rapport, geen code.
2. `fix(navigation): wrap makeAllCars + buildScene in try/catch with visible error` (Fix A.1, A.2).
3. `fix(loader): explicit catch on Assets.preloadWorld + maybeUpgradeWorld` (Fix A.3).
4. `fix(navigation): debounce world-card and race-start taps` (Fix A.4).
5. `feat(core): visibility-pause game loop on backgrounded tab` (Fix D).
6. `feat(debug): localStorage breadcrumb of last user actions` (Fix E.1).
7. `fix(audio): route api/music console.warn via dbg` (Fix E.3).
8. `fix(renderer): user-controlled context-loss recovery instead of silent reload` (Fix C).
9. `perf(scene): mobile-cap skybox + neoncity building windows` (Fix B.1, B.2).
10. `fix(boot): avoid double buildScene when saved world differs` (Fix B.4).
11. `chore(review): address parallel reviewer feedback`.

Optional (tegen het einde, alleen als user akkoord):

- `perf(boot): externalize three.js for non-blocking parse` (Fix F).
- `feat(loader): asset-cache eviction policy` (Fix B.3).

---

## Wat we NIET kunnen oplossen in deze sessie

- **Daadwerkelijke iOS device-test**: we werken code-statisch. Een fix die "lijkt te werken" moet de user op iPhone bevestigen.
- **WebGL backend-bug in iOS Safari/Chrome iOS WebView**: als iOS zelf de context killt onder ~150 MB GPU-pressure, kunnen we alleen de symptomen verzachten, niet de oorzaak.
- **Externe `three.js` zonder server**: bij file:// hosting werkt `<script src="...">` wel maar zonder caching. Bij https hosting werkt het optimaal. Hangt af van hosting-context.
- **Memory-target op exact MB**: zonder een echte iPhone die we kunnen profilen, is het schatten + budget. Phase 2 voegt budget-checks toe maar de drempels zijn educated guesses.

---

## Acceptance criteria voor Phase 2

- Geen `goToTitle()` of `location.reload()` in catch-blocks; alle exceptions → `dbg.error` + zichtbare UI-feedback (toast/overlay) + expliciete recovery-actie.
- Game-loop pauzeert volledig (rAF, audio, music-scheduler) bij `document.hidden`.
- `disposeScene` blijft werken (geen regressie); `_shared`-flag-discipline blijft intact.
- Op desktop: geen FPS-impact, geen visuele regressie op alle 8 werelden.
- `'use strict'` blijft staan in alle non-module scripts.
- Geen rauwe `console.error`/`console.warn` zonder dbg-fallback (de twee bekende plekken in `audio/api.js`, `audio/music.js` worden opgelost).

---

## Bijlagen

- **PROJECT_STATE.md** — feitelijke referentie van codebase-status.
- **`SESSIE_IOS_STABILITY_PLAYTHROUGH.md`** — wordt in Phase 3 geschreven na de fixes.
- **CHANGES.md** — wordt per Phase 2 commit bijgewerkt.

---

*Einde Phase 1 rapport. Klaar voor user-akkoord op Phase 2 fix-volgorde.*
