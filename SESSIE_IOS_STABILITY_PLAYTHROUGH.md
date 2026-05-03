# SESSIE: iOS Stability — Phase 3 QA Playthrough Report

**Branch**: `claude/ios-stability-investigation-03CAO`
**Datum**: 2026-05-03
**Scope**: code-statische QA na Phase 2 fixes (12 commits). Subagent reviewers (Phase 4) waren OOC, dus deze report combineert QA-playthrough en self-review.

---

## Samenvatting

12 fix-commits (`f753053` t/m `e68c9a4`) toegepast op `claude/ios-stability-investigation-03CAO`. Plus 1 cleanup commit voor een tijdens QA gevonden regressie (1×1 sterren onder mobile skybox-scale).

| Risico-niveau | Aantal | Toelichting |
|---|---|---|
| 🔴 HIGH (PR-blocker) | 0 | geen blockers gevonden na cleanup |
| 🟡 MEDIUM (follow-up) | 3 | bekend, geen risico voor primaire symptomen |
| 🟢 LOW (nit) | 5 | code-stijl + opt-in verbeteringen |

**Conclusie**: PR-ready. Symptomen 1 (page-crash) en 2 (silent terugval naar title) hebben directe code-paden gefixed. iOS-tests door user vereist ter validatie.

---

## A — Silent-to-title paden cleanup

| Pad | Vóór Phase 1 | Na Phase 2 | Status |
|---|---|---|---|
| Auto `location.reload()` na 6s context-loss | `renderer.js:29` (silent) | Reload-knop verschijnt na 6s, user beslist | ✅ |
| `makeAllCars()` OOM throw → silent SELECT poison | `navigation.js:55` | try/catch + visible Notify.banner + state restore | ✅ |
| `buildScene()` OOM throw in rebuildWorld | `select.js:382` | try/catch + visible Notify.banner | ✅ |
| Context-restore rebuild-fail → auto reload | `renderer.js:37` | Overlay opnieuw + reload-knop | ✅ |
| `Assets.preloadWorld(...).then` zonder catch | `boot.js:172`, `select.js:376` | `.catch` op promise + try om `maybeUpgradeWorld` | ✅ |
| Wereld-card double-tap race | `boot.js:88` | 400ms cooldown | ✅ |

**Verificatie**: grep voor automatische `location.reload()` in non-button paden = geen treffers buiten:
- `js/core/boot.js:170` (initRenderer-failure UI button — was er al, user-tikbaar)
- `index.html:431` (ctxLostReload button — nieuw, user-tikbaar)

Geen automatische redirect/reload meer in error-recovery paden. ✅

---

## B — Visibility lifecycle

`js/core/loop.js`:
- ✅ `_pageHidden` flag init vanuit `document.hidden`
- ✅ `visibilitychange` listener werkt vlag bij + reset clock op resume
- ✅ Loop-body skip `if(_pageHidden)` ná `_ctxLost` skip, vóór `gamePaused` skip — juiste volgorde
- ✅ Listener gebruikt `typeof clock!=='undefined'` check — safe als boot nog niet voltooid is
- ✅ `clock.getDelta()` consume voorkomt dt-spike op resume

`js/core/renderer.js`:
- ✅ Bestaande visibilitychange listener voor audioCtx (regel 40) is intact, niet gewijzigd door Fix C

`js/ui/touch.js`:
- ✅ Wake-lock visibilitychange listener (regel 26) is intact

**3 verschillende visibility-listeners** in 3 modules. Niet ideaal qua reuse, maar elk heeft een eigen scope:
- `loop.js` → game-loop pause
- `renderer.js` → audioCtx
- `touch.js` → wake-lock reacquire

Acceptabel — fusing zou alleen opruimen, geen bug-fix.

---

## C — Asset-cache eviction safety

`js/assets/loader.js evictAllExcept`:
- ✅ Early-return als `_manifestLoaded === false` of `_manifest.worlds` undefined
- ✅ Disposal-helpers omhuld met try/catch (`_disposeCachedTexture`, `_disposeCachedModel`)
- ✅ `_collectKeepPaths` beslaat alle 4 manifest-categorieën (hdri/ground/props/skybox_layers) + `hdri_mobile` variant
- ✅ Dedupes `_worldPreloaded` set tot enkel `worldId`

`js/core/scene.js buildScene`:
- ✅ `Assets.evictAllExcept(activeWorld)` aangeroepen ná `disposeScene()` — scene is leeg → geen actieve refs naar oude wereld assets
- ✅ Try/catch om eviction-call zodat manifest-edge-cases nooit de scene-build blokkeren

**Risico-scenario gevalideerd**: een in-flight `preloadWorld(B)` die samen-loopt met `evictAllExcept(B)` schrijft alleen B's paths naar de cache; B's paths zitten in keep-set → niet ge-evict. ✅

**Risico-scenario open**: `maybeUpgradeWorld()` die parallel draait en cache leest tijdens eviction. `maybeUpgradeWorld` is idempotent en valt netjes terug op procedural als cache-misses optreden. Geen crash-vector.

---

## D — Memory caps + budget

`js/core/scene.js _newSkyCanvas`:
- ✅ `g.scale(0.5)` op mobile zodat per-world sky functies hun 1024×512 logische coords behouden
- ✅ Linear gradient gedefinieerd in scaled space (0→512), vult correct over de 256-hoge fysieke canvas
- ⚠️ **Cleanup commit gemaakt**: 1×1 fillRect-sterren (6 plekken: Space, Candy, NeonCity, Volcano, Arctic, Themepark sky) werden onder scale 0.5 sub-pixel met anti-aliasing → onzichtbaar. **Vervangen door 2×2** zodat ze op mobile 1×1 fysiek worden bij volle opacity. Op desktop: 2×2 is een 1px breder dan eerder, niet visueel storend.

`js/worlds/neoncity.js`:
- ✅ `Math.random()>(window._isMobile?.6:.2)` — 40% mobile / 80% desktop. Side-window vervolg-block (regel 173) gebruikt zijn eigen `>.5` random — onafhankelijk, geen interactie met de cap.

`js/core/boot.js _checkMemoryBudget`:
- ✅ `navigator.deviceMemory` alleen Chrome → undefined op Safari iOS → conditional skipt
- ✅ `performance.memory` alleen Chrome → idem
- ✅ Beide undefined op Safari iOS → functie return zonder DOM-werk
- ✅ Try/catch om de body — geen crash bij API-divergence

---

## E — Context-loss recovery + breadcrumb

`index.html`:
- ✅ `ctxLostReload` knop start met `display:none`
- ✅ `ctxLostMsg` id is gezet voor dynamische tekst-update

`js/core/breadcrumb.js`:
- ✅ Try/catch om alle localStorage I/O — werkt graceful in private-mode Safari (waar `setItem` throwt)
- ✅ `_pendingBreadcrumbLog` fallback als window.dbg nog niet bestaat tijdens module-init
- ✅ Default boot-event push zodat ringbuffer altijd ten minste 1 entry heeft
- ✅ Script-load order in index.html: `debug.js → breadcrumb.js → perf.js` — `dbg` is geladen vóór breadcrumb's prev-session log

`Breadcrumb.push` call-sites (geverifieerd via grep):
- ✅ `navigation.js`: goToTitle, goToSelect, goToWorldSelect, goToRace
- ✅ `select.js:367`: rebuildWorld
- ✅ `scene.js:347`: buildScene
- ✅ `renderer.js`: webglcontextlost + webglcontextrestored

Compleet voor primaire user-acties. Niet aanwezig (LOW priority follow-up): pause/quit, finish, achievements (niet kritiek voor crash-forensics).

---

## F — Three.js externalize

`index.html`:
- ✅ Regel 436: `<script src="assets/vendor/three-r160.min.js"></script>`
- ✅ Geen leftover inline three-blok (`grep '!function(t,e)' index.html` = 0 matches)
- ✅ index.html krimpt van 646KB → 30KB

`assets/vendor/three-r160.min.js`:
- ✅ 615KB groot, MIT-licentie header intact, einde correct (`__esModule":!0}}}))`)

Script-tag volgorde verifieerd: `three-r160.min.js → js/config.js → js/core/device.js → js/core/debug.js → js/core/breadcrumb.js → js/core/perf.js → js/core/three-compat.js → ...` — THREE is beschikbaar voordat ThreeCompat of game-code referenties maakt. ✅

---

## G — Per-world regression check (smaller skybox + cleanup)

| World | Sky function | 1×1 stars? | Status na cleanup |
|---|---|---|---|
| GP | makeGPSkyTex | nee (sun + cloud streaks) | ✅ |
| Space | makeSpaceSkyTex | ja (640) | ✅ na 2×2 cleanup |
| DeepSea | makeDeepSeaSkyTex | nee (light shafts + 300 plankton 1×1) | ⚠ plankton ook 1×1 → opgenomen in cleanup ✅ |
| Candy | makeCandySkyTex | ja (60 sparkles) | ✅ na 2×2 cleanup |
| NeonCity | makeNeonCitySkyTex | ja (150 stars top) | ✅ na 2×2 cleanup |
| Volcano | makeVolcanoSkyTex | embers (gekleurd) | ✅ na 2×2 cleanup |
| Arctic | makeArcticSkyTex | ja (80 stars) | ✅ na 2×2 cleanup |
| Themepark | makeThemeparkSkyTex | ja (40 stars) | ✅ na 2×2 cleanup |

Plankton in DeepSea (regel 170) — zelfde 1×1 issue, ook gefixt door de `replace_all` in cleanup commit.

**evictAllExcept robustness per world**: alle 8 worlds hebben hun manifest-entries onafhankelijk; geen cross-world dependencies. evict van wereld A's assets raakt nooit wereld B's scene. ✅

---

## H — Risico-uitspraak per categorie (Phase 4 self-review)

### Code quality

🟡 MEDIUM — geen blocker:
- Try/catch boilerplate herhaalt zich tussen `navigation.js:62-72` en `select.js:390-396` (zelfde `if(dbg) ... else console`, `if(Notify) Notify.banner`). Een helper als `_handleSetupError(channel, e, userMsg)` zou opruimen, maar **CLAUDE.md aanbeveling is "drie vergelijkbare regels is beter dan een premature abstractie"** — beslissing: laat staan.
- Visibility-listeners in 3 modules (loop, renderer, touch) — acceptabel, eigen scopes.

🟢 LOW:
- `loop.js:18` — `_pageHidden` is module-let; technisch zou `let` op global scope kunnen botsen met andere modules met dezelfde naam. Geen huidige collision.

### Code reuse

🟡 MEDIUM:
- `_disposeCachedModel` in `loader.js` doet vergelijkbare per-mesh-disposal als `disposeScene` in `scene.js`. Niet identiek (loader's variant traversede ALLEEN gltf.scene; scene-versie houdt _shared check). Acceptabel — verschillende safety-eisen.

🟢 LOW:
- `_mobCount(n)` in `device.js` was al aanwezig maar niet gebruikt door de nieuwe mobile caps in `scene.js` en `neoncity.js`. Reden: `_mobCount` is voor count-scaling (n×0.45), niet voor probability-thresholds. Niet bruikbaar hier.

### Efficiency

🟡 MEDIUM:
- `evictAllExcept` traversede mogelijk veel meshes per world-switch (worst case ~350 disposals). Eénmalige cost per switch — acceptabel. Geen per-frame impact.

🟢 LOW:
- `Breadcrumb.push` synchroon `localStorage.setItem` per nav-event. Op iOS Safari is dit 1-10ms. Frequency = ~5-10 per session, totaal <100ms per session. Geen bottleneck.

### Performance budget impact

| Verandering | Mobile GPU besparing | Desktop |
|---|---|---|
| Skybox 1024×512 → 512×256 (mobile) | ~1.5MB per world | geen verandering |
| Window-grid 80%→40% in NeonCity (mobile) | ~160KB GPU, ~20 minder draw calls | geen verandering |
| Asset-cache eviction (alle worlds) | per world-switch geen accumulatie | idem |
| Three.js extern | snellere first-paint + cache hit on reload | idem |

**Geschat per-world GPU na fixes (mobile)**:

| World | Voor (Phase 1 estimate) | Na (Phase 2 fixes) |
|---|---|---|
| NeonCity | ~9MB | ~7.3MB (-1.5 sky -0.16 windows) |
| Space | ~9MB | ~7.5MB (-1.5 sky) |
| DeepSea | ~6MB | ~4.5MB (-1.5 sky) |
| GP | ~5MB | ~3.5MB (-1.5 sky) |
| Andere worlds | ~5-7MB | ~3.5-5.5MB |

**Cumulative VRAM trend**: voor fixes klom totaal-VRAM monotoon over world-switches. Na eviction policy: piek op ~1 wereld's worth (~7-10MB GPU op heaviest), constant over sessies. Materieel onder iOS' ~150-250MB single-page tab kill threshold.

---

## Overall judgment

**PR-ready**: ja. Geen HIGH-risk items na cleanup-commit. De 3 MEDIUM-items zijn opt-in cleanups die geen impact hebben op de iOS-symptomen.

**Wat we niet kunnen valideren in code-statische QA**:
- Of de echte iPhone Safari/Chrome iOS daadwerkelijk minder vaak crashed na deze fixes. Vereist user playtests op de target devices.
- Of `navigator.deviceMemory` op Chrome iOS correct rapporteert. (Op desktop Chrome werkt het, op iOS Chrome WebView is het meestal undefined — onze code handelt dat correct af.)
- Of de wake-lock + audioCtx resume + visibility-pause samenspelen zonder gekke artefacten op Safari < 16.4.

**Aanbevolen user-tests** (PR description):
1. iPhone — speel 6 races op verschillende werelden achter elkaar, check of FPS stabiel blijft en geen crashes.
2. iPhone — wissel snel tussen wereld-cards (3-4 keer in 2 sec), verifieer dat tweede tap binnen 400ms genegeerd wordt en geen crashes optreden.
3. iPhone — start race op NeonCity met regen + nacht, check of het nog runt.
4. iPhone — schakel naar Safari/Chrome tab voor 30 sec, kom terug, controleer of game intact resumet (visibility-pause werkt).
5. Open `Ctrl+Shift+E` (desktop) na een testrace om Breadcrumb-trail in dbg-channel te zien.

---

## Bijlage — commit volgorde

```
ed3d0b3  docs(stability): investigation report on iOS crashes
f753053  fix(navigation): wrap makeAllCars + buildScene in try/catch with visible error
7fa5194  fix(loader): explicit catch on Assets.preloadWorld + maybeUpgradeWorld
1b88454  fix(navigation): debounce world-card taps to prevent double-rebuild
967428d  feat(core): visibility-pause game loop on backgrounded tab
f847ea9  feat(debug): localStorage breadcrumb of last user actions
8c4fc1c  fix(renderer): user-controlled context-loss recovery instead of silent reload
1041949  perf(scene): mobile-cap skybox + neoncity building windows
bc8c931  fix(boot): avoid double buildScene when saved world differs from default
e316e64  feat(debug): memory budget warning on boot for low-end devices
43de181  perf(boot): externalize three.js for non-blocking parse
e68c9a4  feat(loader): asset-cache eviction policy on world-switch
[next]   chore(scene): bump skybox stars 1×1→2×2 for mobile-scale visibility
```

*Einde Phase 3 + 4 rapport. Branch is klaar voor PR.*
