# Static Performance Hotspots — Project 7 Fase 1 (code-read)

Status: **Code-lezen, geen metingen.** Deze lijst is geen bewijs, alleen
kandidaten met regelnummers. Elk item moet in Fase 2 eerst met
DevTools-data bevestigd worden voor er een fix komt.

Doel: Jur kan tijdens zijn meet-sessie deze hotspots specifiek in de gaten
houden, en in Fase 2 weet Claude waar te kijken zonder weer 1054-regel
files te moeten doorploegen.

**Buiten scope** (al afgehandeld):
- H1 — wereld-specifieke shader-compile op race-start
  → `_precompileScene()` in `js/core/scene.js:534`
- H2 — `initEngine()` lazy op race-start
  → al gehoist naar countdown
- H3 — `RaceMusic`/`StemRaceMusic` constructor
  → al pre-construct
- H4 — HDRI/PBR async upgrade re-precompile
  → `_precompileScene` exposed via `window._precompileScene`
- Postfx mobile-fallback → `js/effects/postfx.js:40` skipt op `_isMobile`
- Shadow-map mobile-fallback → `js/core/renderer.js:43` skipt op `_isMobile`
- Pixel ratio mobile-cap → `js/core/renderer.js:41` cap 1.5

---

## Severity-rubriek

| Niveau | Betekenis |
|---|---|
| **HIGH** | Lijkt cumulatief of breed (alle werelden / alle frames) → kandidaat voor de top-3 |
| **MED** | Specifieke wereld of conditioneel pad |
| **LOW** | Eenmalig of verwaarloosbaar — alleen meenemen als baseline-cijfers ernaar wijzen |

---

## Hotspot #1 — Per-frame `new THREE.Vector3` in `updateDamageSmoke`

**Severity:** MED → HIGH zodra player ≥3 hits heeft (rest van de race).

**Locatie:** `js/effects/visuals.js:270-285`

**Wat er staat:**
```js
function updateDamageSmoke(){
  const car=carObjs[playerIdx];if(!car||!car.hitCount)return;
  const hits=car.hitCount;
  if(hits<3)return;
  const rate=hits>=6?0.38:0.18;
  if(Math.random()<rate){
    const fwd=new THREE.Vector3(0,0,-1).applyQuaternion(car.mesh.quaternion); // ← per-emit allocatie
    exhaustSystem.emit(...)
  }
}
```

**Waarom verdacht:** Loopt op elke RACE frame via `loop.js:110`. Bij ≥6
hits draait de Math.random-gate met rate 0.38 → ~22 allocaties/sec (op
60fps). Vector3 is small object, GC zou het normaal goed aankunnen, maar
in combinatie met andere allocaties (#2, #6) kan het de eerste die over de
GC-drempel duwt zijn. Het is dezelfde categorie als de pre-allocated scratch
vectors die fysica al gebruikt (`_plFwd`, `_plBk` in `js/cars/physics.js:7`).

**Fix-aanwijzing:** Promote naar module-level scratch vector zoals andere
files al doen:
```js
const _dmgFwd = new THREE.Vector3();
function updateDamageSmoke(){
  ...
  _dmgFwd.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
  exhaustSystem.emit(... _dmgFwd.x ... etc);
}
```

**Wat te meten in baseline:** rij 5 laps in storm-mode met crashes — kijk
of FPS gradueel zakt naarmate hitCount stijgt.

---

## Hotspot #2 — Per-frame `new THREE.Color` in `updateWeather`

**Severity:** HIGH zodra `_trackMesh.material.userData.baseColor` is gezet
(elke wereld behalve "tracks zonder baseColor" — vermoedelijk allemaal).

**Locatie:** `js/effects/weather.js:201-217`

**Wat er staat:**
```js
function updateWeather(dt){
  ...
  if(_trackMesh){
    const w=_rainIntensity;
    const base=_trackMesh.material.userData.baseColor;
    if(base!==undefined){
      const bc=new THREE.Color(base);  // ← elke frame, elke wereld
      bc.multiplyScalar(1.0-w*0.45);
      _trackMesh.material.color.copy(bc);
    }else{
      ...
    }
  }
  ...
}
```

**Waarom verdacht:** Loopt onvoorwaardelijk elke RACE frame via
`loop.js:87`. Eén `new Color()` per frame = 60 allocaties/sec.
Cumulatief over 5 laps van 90s = 27.000 Color-objecten voor één
zichtbaar effect. Three.js Color is heavier dan Vector3 (3 floats + extra
proto-methods).

**Plus:** `toggleRain()` op `weather.js:41-44` doet bij race-start nog twee
extra `new THREE.Color(base)` + `new THREE.Color(...)` allocaties. Niet hot,
maar wel onnodig.

**Fix-aanwijzing:**
```js
const _wxBaseColor = new THREE.Color();
const _wxEmissive = new THREE.Color();
function updateWeather(dt){
  ...
  if(base!==undefined){
    _wxBaseColor.set(base).multiplyScalar(1.0-w*0.45);
    _trackMesh.material.color.copy(_wxBaseColor);
  } ...
}
```

**Wat te meten:** 5-lap race met regen — kijk of heap monotoon stijgt
tussen lap-markers.

---

## Hotspot #3 — Veel PointLights in Neon City + Candy + Volcano + Themepark

**Severity:** HIGH op werelden waar het bij elkaar opstapelt (mogelijk reden
dat Neon City zwaar voelt in PROJECT_STATE.md sectie 12).

**Locaties (call-sites met `new THREE.PointLight`):**

| Bestand | Regels | Context | Geschatte count |
|---|---|---|---|
| `js/track/environment.js:1006` | `buildNightObjects` | 30 punten × 2 zijden = **60 PointLights** (`trackLightList` + verborgen lampposts) |
| `js/worlds/neoncity.js:181` | rooftop-loop | ~25 buildings, %4 → ~6 |
| `js/worlds/neoncity.js:228` | billboards | 1 per billboard |
| `js/worlds/neoncity.js:254` | barriers, %10 | ~8 per zijde |
| `js/worlds/neoncity.js:289` | track-tubes | 4-8 |
| `js/worlds/neoncity.js:335` | pillars, %2 | ~10 |
| `js/worlds/neoncity.js:373,400,520` | tubes/EMP | ~20 |
| `js/worlds/candy.js:140,274,313,416` | lollipops/candles | gokken: ~30+ totaal |
| `js/worlds/deepsea.js:110,239,302,346,379-380,454,576` | varied | ~15+ |
| `js/cars/car-parts.js` (plHeadL/R/Tail) | per car | 3 per player + 4 in `_aiHeadPool` (env) |
| Player `_boostLight` | `visuals.js:488` | 1 (lazy) |

**Ruwe schatting per wereld (met intensity > 0):**
- Grand Prix dag: ~5 (sun, ambient, hemi, headpool muted)
- Grand Prix nacht: ~65 (60 trackLightList + plHeadL/R + plTail + 4 AI)
- Neon City nacht: ~65 + ~50 wereld-specifiek = **~115**
- Candy nacht: ~65 + ~30 = ~95
- Volcano nacht: ~65 + ~10 = ~75

**Waarom verdacht:** Three.js WebGLRenderer evalueert in fragment-shader
voor élk fragment alle lights met intensity > 0. Boven ~16 lights wordt
de fragment-shader merkbaar zwaarder; boven ~50 wordt hij echt traag op
GPU's zonder unified-shader-clusters (oudere mobile GPUs). Plus: Three.js
recompileert shaders wanneer light-count over de drempel komt — dat verklaart
mogelijk progDelta spikes bij world-switch ondanks `_precompileScene()`.

Specifiek: de 60 PointLights uit `buildNightObjects()` worden wel gemaakt
maar de meeste hebben `intensity = 0` overdag. Kijk in baseline of
`renderer.info.programs.length` afwijkt tussen day↔night toggle.

**Fix-aanwijzingen (in volgorde van moeite):**

1. **Trim trackLightList op mobile.** `buildNightObjects` schaalt 30 niet
   met `_mobCount()`. Dat geeft op mobile dezelfde 60 lights als desktop.
   Pas `for(let i=0;i<30;i++)` aan naar `_mobCount(30)` (~15 op iPhone).
2. **Cull lights buiten frustum / op afstand.** Three.js doet dit niet
   automatisch. Voeg een eenvoudige distance-check toe per frame:
   `pl.intensity = (cameraDist < pl.distance*1.4) ? targetInt : 0`.
3. **Kunstmatige cap: max 20 actieve lights.** Sorteer per frame op
   distance-tot-camera, top 20 krijgen intensity, rest = 0. Dit kost een
   sort van ~100 entries per frame, peanuts.

**Wat te meten:** vergelijk `renderer.info.programs.length` tussen
`grandprix-day`, `grandprix-night`, `neoncity-night`, `candy-night`. Als
nacht-werelden 2-3× zoveel programs hebben → de hypothese is bevestigd.
Plus draw-call delta — meer lights ≠ meer draws, maar zwaardere fragment
zou min FPS doen zakken.

---

## Hotspot #4 — Particle-systeem 1-frame visual glitch + GPU upload elke frame

**Severity:** LOW (visueel) / MED (per-frame GPU upload).

**Locatie:** `js/effects/particles.js:26-53`

**Wat er staat:**
```js
update(dt){
  const pos=this.geo.attributes.position.array;
  ...
  for(let i=n-1;i>=0;i--){
    const p=this.alive[i];
    p.life-=dt/p.maxL;
    if(p.life<=0){
      const swapIdx=--n;
      this.alive[i]=this.alive[swapIdx];this.alive.length=n;
      // Zero GPU slot i (dead) en swapIdx (orphan)
      pos[i*3]=...=0;sz[i]=0;col[i*3]=...=0;
      pos[swapIdx*3]=...=0;...
    }else{
      p.x+=p.vx;p.y+=p.vy;p.z+=p.vz;p.vy-=.008;
      pos[i*3]=p.x;...;sz[i]=p.life*.7;col[i*3]=p.r;...
    }
  }
  if(n===0&&this.alive.length===0)return;
  this.geo.attributes.position.needsUpdate=true; // ← upload hele 300-particle buffer
  this.geo.attributes.color.needsUpdate=true;
  this.geo.attributes.size.needsUpdate=true;
}
```

**Waarom verdacht (twee dingen):**

1. **1-frame visual pop.** Wanneer een particle sterft en met de laatste
   levende geswapt wordt, krijgt `alive[i]` de data van de oude
   `alive[swapIdx]` particle. Maar daarna wordt `pos[i*3]=0` geset
   voor "slot i (dead)". Resultaat: de geswapte particle z'n GPU-slot
   wordt op (0,0,0) gezet voor 1 frame. Volgende frame klopt het weer.
   Effect: kleine flikkering bij heel veel sterfte — onzichtbaar tenzij
   je expres kijkt.
2. **`needsUpdate` op alle 3 attributes.** sparkSystem / exhaustSystem
   uploaden elk frame een buffer ter grootte `_mobCount(300)*3` floats =
   3.6KB per attribute × 3 attributes × 2 systems = ~22KB/frame GPU upload.
   Niet veel, maar onnodig als de buffer nauwelijks veranderde.

**Fix-aanwijzingen:**

- (1) Volgorde corrigeren: zero **eerst** swapIdx, **dan** schrijf live
  data naar slot i. Dat voorkomt de pop.
- (2) Use `setUsage(THREE.DynamicDrawUsage)` op de attributes. Three.js
  past dan een DYNAMIC_DRAW hint toe — niet een directe winst, wel een
  vingerwijzing aan de driver.
- (2) Track `_dirty` flag: alleen `needsUpdate` als `n > 0` of `pendingZeros > 0`.
  Nu staat de check `if(n===0&&this.alive.length===0)return;` — die laat
  geen ruimte voor "geen wijziging maar nog wel particles in beeld".
  Praktisch: nauwelijks een issue want particles zijn altijd in beweging.

**Wat te meten:** vergelijk frame-time tijdens nitro+drift (max particle
emission) versus stationair. Het verschil zou klein moeten zijn — als
het >2ms is, is dit hot-spot relevant.

---

## Hotspot #5 — World-switch leaks (lensFlare + godRays + canvas-textures)

**Severity:** MED (alleen relevant als 10× world-switch een meetbare
heap-groei laat zien — anders LOW).

**Locaties:**

- `js/track/environment.js:805-814` — `_ghostTex(rgb)` maakt elke build een
  nieuwe CanvasTexture. Als `buildLensFlareGhosts` 6 ghosts maakt elke
  GP-build, en disposeScene's traverse vangt Sprites correct → in theorie
  geen leak. Verifieer in baseline.
- `js/track/environment.js:752-773` — `_godRayTex()`: zelfde patroon, 4 rays.
- `js/track/environment.js:670-746` — `buildSunBillboard` maakt **inline**:
  - 1 `CanvasTexture` voor zon-disc (regel 680)
  - 1 `CanvasTexture` voor core (regel 700)
  - 1 `CanvasTexture` voor rays (regel 725)
  - 1 `CanvasTexture` voor halo (regel 739)
  Plus de SpriteMaterials. Sprite is `.isSprite` → traverse pakt dispose.
  Maar: `_disposeMat` in `scene.js:37-43` checkt alleen `m.map`,
  `m.normalMap`, `m.roughnessMap`. **SpriteMaterial.map** is `.map` ✓.
  → Lijkt safe.

**Vermoedelijke wel-leak: `_lensGhosts` en `_godRays` arrays.**

`_lensGhosts` is module-level. `buildLensFlareGhosts` (env.js:815) wordt
**alleen** aangeroepen vanuit `buildSunBillboard`. Werelden zonder zon
(space, deepsea, neoncity, themepark — `buildSunBillboard` alleen op
GP/arctic/volcano dag) krijgen geen rebuild.

Scenario: GP → space → GP. 
- GP build 1: `_lensGhosts` = 6 sprites toegevoegd aan scene.
- World-switch naar space: `disposeScene()` traverseert + dispose ghosts.
  Scene heeft ze nu niet meer; `_lensGhosts` array houdt nog 6 dangling
  refs naar disposed materials.
- Space build: geen `buildSunBillboard` call → `_lensGhosts` blijft die
  6 dangling refs.
- World-switch terug naar GP: `buildLensFlareGhosts` start met
  `_lensGhosts.forEach(g => g.material.dispose())` — **double-dispose**.
  Three.js logt geen error daarvoor maar het is fout. Dan
  `_lensGhosts.length=0` + 6 nieuwe.

→ **Geen heap-leak**, wel double-dispose. Three.js dispose() is
idempotent voor textures (vlag-check), voor materials minder strict.

**Echte vermoedelijke leak: `_godRays`.**

`_godRays` werkt zelfde als `_lensGhosts` maar de `_godRayTex()` wordt
niet ge-cloned tussen rays. In `buildGodRays:786`:
```js
const mat=new THREE.SpriteMaterial({
  map:tex.clone(),  // texture wordt gecloned per ray
  ...
});
```
4 ghost rays = 4 texture clones. Bij dispose: traverse roept
`_disposeMat` → `m.map.dispose()`. Maar `tex.clone()` deelt niet de
underlying canvas met de originele tex — dus 4 + 1 (oorspronkelijke
`tex`) textures elke build. De originele `tex` wordt nergens vrijgegeven,
alleen z'n clones via traverse. → mogelijke leak van 1 CanvasTexture per
GP/Volcano/Arctic-build die `buildSunBillboard` triggert.

**Wat te meten:** stress-scenario S1 (10× world-switch). Kijk in heap-
comparison of `CanvasTexture` instances groeien. Als het er ~5 per
GP-cycle bij komt → bevestiging.

**Fix-aanwijzing:**
```js
function buildGodRays(){
  ...
  const tex = _godRayTex();
  offsets.forEach(([dx,dz]) => {
    const mat = new THREE.SpriteMaterial({ map: tex, ... }); // share, niet clone
    ...
  });
}
```
SpriteMaterial-instances mogen prima één texture delen — opacity zit op
de material, niet de texture.

---

## Hotspot #6 — `MeshBasicMaterial` per skid mark op `addSkidMark`

**Severity:** LOW (al gedeeltelijk geoptimaliseerd, maar nog ruimte).

**Locatie:** `js/effects/visuals.js:447-455`

**Wat er staat:**
```js
const sharedGeo=_getSkidGeo();   // ✓ geometry is gedeeld
[-0.65,.65].forEach(s=>{
  const matOpts={color:skidCfg.color,...,opacity:baseOp,...};
  if(skidCfg.blend){matOpts.blending=THREE.AdditiveBlending;}
  const sm=new THREE.Mesh(sharedGeo,new THREE.MeshBasicMaterial(matOpts)); // ← per-mark
  ...
  if(skidMarks.length>80){const old=skidMarks.shift();old.mesh.material.dispose();...}
});
```

**Waarom verdacht:** Geometry wordt al gedeeld (goed!), maar elke
skidmark krijgt een eigen `MeshBasicMaterial` zodat de opacity-fade per
mark werkt. 80 marks max → 80 materials live tegelijk. Bij hard-driften
(80 marks worden snel vervangen) draait de allocator hard.

**Alternative pattern:** `InstancedMesh` met `instanceColor` (alpha in
.color via custom shader, of in `instanceMatrix.scale.y=opacity` hack).
Maar dat is een refactor — niet "kleine fix".

**Eenvoudiger:** gebruik 1 material met `vertexColors=true` en encode
per-mark opacity in een vertex-color attribute. `opacity` blijft 1, kleur
wordt `(r*op, g*op, b*op)`.

**Fix-aanwijzing:** wachten tot baseline aantoont dat dit een issue is.
Skid-marks zijn geclamped op 80 max; per frame verandert misschien 1-2.
Niet de eerste die opvalt.

---

## Hotspot #7 — `updateBoostTrail` doet 2 forEach-loops per frame, ratio<0.30 early-return ontbreekt voor tire-dust

**Severity:** LOW (waarschijnlijk in noise-margin).

**Locatie:** `js/effects/visuals.js:177-258`

**Observatie:** De functie doet zelfs bij stilstand werk via `tireCfg`
lookup en de `Math.random() < emitRate` gate. Net niet hot genoeg om uit
te lichten, maar het is een typisch geval van "early-return zou hier
helpen". Eén `if(ratio<0.30 && !nitroActive && !car.boostTimer) return;`
boven de tireCfg-blok scheelt de cfg-lookup + 2 multiplications per frame.

**Wat te meten:** verwaarloosbaar, niet apart meten. Pak alleen mee als
overig werk klaar is.

---

## Hotspot #8 — `updateSlipstreamVisuals` itereert alle cars elke frame, ook zonder slip

**Severity:** LOW.

**Locatie:** `js/effects/visuals.js:57-69`

**Wat er staat:**
```js
function updateSlipstreamVisuals(){
  carObjs.forEach((car,i)=>{
    if(i===playerIdx||!car.mesh||car.finished)return;
    if(Math.abs(car.speed)>car.def.topSpd*.6&&Math.random()>.74){
      _aiFwdRV.set(0,0,1).applyQuaternion(car.mesh.quaternion);
      sparkSystem.emit(...)
    }
  });
}
```

**Waarom verdacht:** loopt elke frame voor 7 AI-cars, doet quaternion-
operatie alleen wanneer Random gate slaagt. De gate cuts ~74% maar de
`forEach` + speed/topSpd check loopt wel altijd. Bij 7 AI cars × 60fps =
420 calls/sec — verwaarloosbaar in JS-termen.

**Niet fixen** tenzij baseline anders aantoont.

---

## Hotspot #9 — `_lensGhosts` updateLensFlare doet `forEach` met allocaties op `g.userData`

**Severity:** LOW.

**Locatie:** `js/track/environment.js:856-884`

**Observatie:** De forEach-body doet geen allocaties (alle scratches
zijn module-level: `_lfNDC`, `_lfFwd`, `_lfRight`, `_lfUp`). Goed.
Update is echter 6 sprites × 6 vector-operaties = 36 ops per frame —
prima.

**Niet fixen.** Aangenomen alleen ter completeness.

---

## Hotspot #10 — `loop.js` — `getPositions().findIndex` per frame

**Severity:** LOW → MED (allocaties + sort per frame).

**Locatie:** `js/core/loop.js:97`

**Wat er staat:**
```js
if(gameState==='RACE'){
  updateHUD(dt);updateSpeedOverlay();
  const _pp=getPositions().findIndex(c=>c.isPlayer)+1;
  ...
}
```

**Waarom verdacht:** `getPositions()` (waarschijnlijk in `gameplay/race.js`)
sorteert vermoedelijk de carObjs op progress en returnt een nieuw array.
Dat is per frame:
- 1 array-allocatie (length 8)
- 1 sort (vermoedelijk merge-sort, O(n log n) op 8 = ~24 comparisons)
- 1 findIndex (O(n))

Per frame is het peanuts maar als `getPositions()` ergens anders ook nog
draait wordt het dubbel gedaan. Check of `_pp` hergebruikt kan worden
binnen `Audio.updateCrowd(_pp)` + `Audio.updateMusicIntensity(_pp,...)`.

**Wat te meten:** in DevTools Performance tab zoeken naar `getPositions`
in self-time top 10. Als het vaker dan 1× per frame opduikt → cache ophalen
in een `let _cachedPositions;` één keer per frame.

**Niet de eerste prioriteit.**

---

## Samenvatting — top-3 voorgestelde Fase 2-targets (op basis van code-read)

Op basis van code-lezen alleen, zónder metingen:

| # | Hotspot | Severity | Verwacht winst | Risico |
|---|---|---|---|---|
| **1** | #3 PointLight count | HIGH | 5–15 fps op zware werelden (Neon, Candy) | LOW (mobile-trim is veilig; light-cull vraagt zorgvuldigheid) |
| **2** | #2 `new Color()` in updateWeather | HIGH | 1–3 fps consistency, minder GC-stutter | TRIVIAL |
| **3** | #1 `new Vector3()` in updateDamageSmoke | MED | 0–1 fps; minder GC pieken bij damage | TRIVIAL |

**Wat we niet vooraf zonder metingen aandurven**:
- #5 (godRays texture-clones) → goedkoop te fixen maar onduidelijke impact
- #4 (particle update) → onbekend zonder profiler-data
- #6/#7/#8/#9/#10 → te onzeker om zonder bewijs te raken

---

## Wat we **niet** gevonden hebben (verstandig)

- Geen render-loop allocaties in `cars/ai.js` — alle scratches zijn
  module-level (`_aiFwd`, `_aiToT`, etc., regel 7-11). Goed.
- Geen render-loop allocaties in `cars/physics.js` — `_plFwd/_plBk/_plRt/
  _slipFwd/_slipDir` zijn gepre-alloced (regel 7-8). Goed.
- Geen render-loop allocaties in `gameplay/camera.js` — `_camV1/_camV2`
  pre-alloced (regel 7). Goed.
- `disposeScene` (`core/scene.js:44`) handelt Mesh/Points/Line/Sprite
  correct, met `_shared(x)` guard tegen double-dispose van asset-cached
  textures. Goed.
- `RaceMusic.stop()` (`audio/music.js:517-525`) en `StemRaceMusic.stop()`
  (`audio/music-stems.js:88-106`) doen zorgvuldige disconnect van out-chain.
  Goed.
- `MusicLib._oscCount` (`audio/music.js:60-67`) heeft 'ended'-listener voor
  decrement → osc-leak via procedural pad lijkt afgedicht.
- `SimpleParticles` (`effects/particles.js`) doet O(1) swap-remove zonder
  array-realloc. Goed (modulo de 1-frame visual pop in #4).

→ De codebase heeft duidelijk al meerdere performance-passes gehad. De
overgebleven hotspots zijn fijnere kalibratie, geen grove fouten.

---

## Hoe deze lijst te gebruiken

1. **Tijdens je baseline-meting:** focus extra op de "Wat te meten"-velden
   van #1, #2, #3 om te bevestigen of ze de werkelijke bottleneck zijn.
2. **Bij het starten van Fase 2:** lees deze file als checklist. Pak de
   hotspot waarvan baseline-data het hardst leunt naar "ja, hier zit het".
3. **Wanneer een hotspot gefixt is:** verplaats naar `PERFORMANCE_FIXES.md`
   (Fase 2 deliverable per Project 7-spec) met voor/na cijfers.
4. **Wanneer baseline-data deze lijst tegenspreekt:** vertrouw de data, niet
   de lijst. Code-lezen heeft systematische blinde vlekken (timing, GPU-
   driver gedrag, mobile-specifieke quirks).

