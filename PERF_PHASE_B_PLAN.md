# Performance Phase B — Diagnose & fix-plan

Diagnose op basis van fase-A meetdata (`PERF_PHASE_A_REPORT.md`) en aanvullende phase-B diagnostic counters in `js/core/scene.js`, `js/core/loop.js` en `js/ui/navigation.js`. Alle metingen via `tools/perf-run.mjs` (Playwright + headless SwiftShader).

## TL;DR

`build.precompile` is in alle gemeten werelden 50-100% van `transition.total`. Binnen precompile is **niet** `renderer.compile()` de bottleneck (200-900 ms), maar de daaropvolgende **16×16 off-screen `renderer.render()`** (1.0-25.2 sec). Die render forceert sync drie dingen tegelijk: (1) shader-program **link** (compile is async, link gebeurt op eerste render), (2) **shadow-pass render** voor `sunLight` op een 1024×1024 shadow map, (3) **texture+geometry uploads** naar GPU voor 1417 meshes met 33 textures (neoncity worst case).

`firstRaceFrame.render` (1.2-7.7 sec) is een aparte tweede bottleneck en wordt veroorzaakt door het **postfx-pipeline pad** (`renderWithPostFX`): 4 extra render-passes (rtScene → rtBright → rtBlurH → rtBlurV → composite) waarvan de scene-pass naar `rtScene` een eerste render is met deze render-target-encoding. Precompile rendert direct, niet via postfx, dus dit pad blijft koud.

Warm runs zijn 30-50% sneller dan cold maar nog steeds langzaam, want **`disposeScene` vernietigt elke material- en geometry-instance** (`m.dispose()` evict programs uit de Three.js shader-cache), en de volgende `buildScene` maakt vers nieuwe instances die opnieuw geupload moeten worden.

Heap groeit boot 18 → 88 MB over 10 transities. Niet acuut maar er is retentie.

---

## 1. Wat doet `_precompileScene()` precies?

**Code-evidence** — `js/core/scene.js:541-585`:

```
function _precompileScene(){
  if(!renderer||!scene||!camera)return;
  ...
  if(typeof renderer.compile==='function'){
    perfMark('precompile:compile:start');
    renderer.compile(scene,camera);
    perfMark('precompile:compile:end');
    perfMeasure('build.precompile.compile','precompile:compile:start','precompile:compile:end');
  }
  if(window.THREE&&THREE.WebGLRenderTarget){
    perfMark('precompile:render:start');
    _rt=new THREE.WebGLRenderTarget(16,16);
    const _prevTarget=renderer.getRenderTarget();
    renderer.setRenderTarget(_rt);
    renderer.render(scene,camera);
    renderer.setRenderTarget(_prevTarget);
    perfMark('precompile:render:end');
    perfMeasure('build.precompile.render','precompile:render:start','precompile:render:end');
  }
  ...
}
```

Twee fasen:

1. `renderer.compile(scene, camera)` — itereert door alle objects/materials/lights, compileert shaders. Compile is **async** in WebGL: de driver retourneert een GLProgram-handle, maar de werkelijke link gebeurt pas bij eerste use.
2. `renderer.render(scene, camera)` op een 16×16 render-target — forceert sync **link** van alle programs **én** triggert de shadow-pass van `sunLight` (`shadowMap.enabled=true`, 1024×1024 shadow-map = 1.05M pixels) **én** alle texture/geometry uploads naar GPU.

**Waarom toegevoegd** — commit `fdf8c7f` (29 april 2026):

> Promotes the Phase 1 A/B precompile experiment from a localStorage-gated flag to default behavior at the end of buildScene(). Now every scene-build (initial boot AND rebuildWorld) finishes with renderer.compile(scene,camera) plus a single 16x16 off-screen render, so program-link + texture/attribute uploads happen during world-select instead of on the first race frame.
>
> Note: this render also triggers the sunLight shadow pass (1024×1024 shadow map, 8-25ms on iPad). That's intentional — moving the cost to select-screen where users expect a brief delay after clicking.

De assumption was: 8-25 ms verschuiven van race-frame naar select-screen. In werkelijkheid is de cost orden van grootte hoger, vooral op zwakke hardware en in software-rendering.

## 2. Per-wereld scene-content + cost-attribution

Gemeten met phase-B diagnostic counters in `_precompileScene()` (cold runs; SwiftShader). Lights + matTypes telt INCLUSIEF helpers en lichten die buiten de wereld-builder worden toegevoegd (sunLight, ambientLight, hemiLight, AI-headlight pool van 4 PointLights).

| World     | meshes | materials | unique mats | unique geos | matTypes (top)              | lights P/S/D/A/H | emissive | transparent |
|-----------|-------:|----------:|------------:|------------:|-----------------------------|-----------------:|---------:|------------:|
| candy     |   1594 |      1594 |        1050 |        1587 | Lambert 1204, Basic 387     |  105 / 0 / 1 / 1 / 1 |     775 |         518 |
| volcano   |    413 |       413 |         235 |         406 | Basic 256, Lambert 153      |   35 / 2 / 1 / 1 / 1 |     109 |         285 |
| space     |    633 |       633 |         358 |         629 | Lambert 348, Basic 276      |  118 / 2 / 1 / 1 / 1 |     229 |         338 |
| neoncity  |   1417 |      1417 |        1141 |        1415 | Lambert 1081, Basic 265, Standard 64 |  193 / 2 / 1 / 1 / 1 |     924 |         877 |
| grandprix |    806 |       806 |         528 |         787 | Lambert 448, Basic 340      |   90 / 2 / 1 / 1 / 1 |     171 |         350 |

Cost-attributie per cold build (ms):

| World     | precompile.compile | precompile.render | precompile total | progs added | textures uploaded |
|-----------|-------------------:|------------------:|-----------------:|------------:|------------------:|
| candy     |              284.0 |            3811.9 |           4096.5 |          20 |                 5 |
| volcano   |              452.2 |            1076.5 |           1528.8 |          21 |                 6 |
| space     |              316.4 |            6301.1 |           6618.2 |          25 |                 5 |
| neoncity  |              890.6 |           25180.3 |          26071.9 |          35 |                33 |
| grandprix |              830.6 |            2389.2 |           3220.2 |          29 |                22 |

Verhouding `render / compile` is overal 2.4× tot 28×. **De off-screen render is het echte werk.**

Warme cold→warm verbetering:

| World     | cold precompile total | warm precompile total | ratio |
|-----------|----------------------:|----------------------:|------:|
| candy     |                4096.5 |                2761.8 | 0.67  |
| volcano   |                1528.8 |                 700.0 | 0.46  |
| space     |                6618.2 |                3151.9 | 0.48  |
| neoncity  |               26071.9 |               15453.1 | 0.59  |
| grandprix |                3220.2 |                1800.0 | 0.56  |

Warme runs zijn slechts ~50% van cold. Geen echte cache-warmth.

## 3. Verklaring neoncity-anomalie

Neoncity is 25× duurder in precompile dan volcano. Drie samenwerkende factoren:

1. **193 PointLights** (vs 35 volcano, 90 grandprix). Meer lights = grotere shadow-pass kosten ALS lights `castShadow=true` hebben (nb: in deze codebase castShadow alleen op sunLight, dus dit is niet de hoofdreden — maar wel: meer uniforms per fragment, meer kosten in fragment-shader voor lichtberekening, en meer scene-traversal-werk in `compile()`).
2. **33 textures uploaded** door precompile (vs 5 voor candy/volcano/space). Dit zijn de **per-building canvas-textures** — `buildNeonSkyscrapers` bouwt 40 buildings, ~80% krijgt een venster-grid uit `document.createElement('canvas')` op 64×128 px (`js/worlds/neoncity.js:158-167`), elke een aparte `THREE.CanvasTexture`. Plus 8 holo-billboard textures (256×64 elk, `js/worlds/neoncity.js:202-214`). Deze textures worden bij precompile-render naar GPU geupload; in software-rendering kost de upload + texture-state-setup serieuze tijd.
3. **1141 unieke materialen op 1417 meshes** (gemiddeld 1.24 mesh/material, **laagste sharing-rate van alle werelden**). Patroon `js/worlds/neoncity.js:144,151`: elke building krijgt eigen `bodyMat` met random color, elke stripe een eigen `stripeMat` met random emissive color. Three.js' shader-program cache dedupliceert ze nog steeds (de uniform-waarden zijn niet onderdeel van de shader-key), maar elke material-instance kost wel JS-allocatie, scene-traversal-werk, en de bijbehorende geometry is uniek (1415 unique geos = bijna 1:1 met meshes).

In context: bij `renderer.render()` op het 16×16 target draait Three.js eerst de **shadow-pass** voor sunLight (alle 1417 castShadow-meshes worden naar de 1024×1024 shadow-map gerendered), dan de **main-pass** (alle 1417 meshes opnieuw, met 193 lights × material-fragment-kosten). Voor neoncity = ~2834 draw-calls voor één 16×16 frame, op CPU-rendering.

## 4. Verklaring trage warm-runs

Warm runs zijn 50-67% van cold. Drie mechanismen leggen dit uit, in volgorde van impact:

### 4a. `disposeScene` evict shader-programs uit cache

`js/core/scene.js:44-68`:

```
function disposeScene(){
  scene.traverse(obj=>{
    if(obj.isMesh||obj.isPoints||obj.isLine||obj.isSprite){
      if(obj.geometry && !_shared(obj.geometry)) obj.geometry.dispose();
      if(obj.material){
        if(Array.isArray(obj.material)) obj.material.forEach(_disposeMat);
        else _disposeMat(obj.material);
      }
    }
  });
  ...
}
```

Three.js fired bij `material.dispose()` een `dispose` event waar `WebGLRenderer` op luistert: dat verwijdert de bijbehorende program uit `renderer.info.programs` en ontbindt de GL program object. De volgende `buildScene` maakt nieuwe material-instances → cache-miss → recompile.

Bewijs uit fase-A data: `shaderPrograms.delta` over de hele buildScene-window is meestal NEGATIEF (-2 tot -20). Dat komt omdat `disposeScene` meer programs evict dan `_precompileScene` toevoegt. De meting bevestigt dat de cache na elke build niet groeit; ze pendelt op-en-neer.

### 4b. Geometries en textures worden opnieuw geupload

Materialen niet alleen — `disposeScene` roept ook `geometry.dispose()` op elke non-shared geometry. Dat maakt de bijbehorende GL vertex/index buffers vrij. De volgende build maakt nieuwe geometries (nieuwe BoxGeometry, PlaneGeometry, CylinderGeometry instances) en bij eerste render moet alles weer naar GPU. Textures hetzelfde verhaal: skybox CanvasTexture wordt elke build opnieuw aangemaakt (`js/core/scene.js:73-78`), windows-grid CanvasTextures in neoncity worden elke build opnieuw geconstrueerd.

In neoncity diag: cold uploadt 33 textures, warm uploadt nog steeds een vergelijkbare hoeveelheid (de precompile.render is 15.1s warm vs 25.2s cold — niet de helft, dus textures dominate niet, maar contributeren).

### 4c. Shadow-pass kost is wereld-grootte-evenredig, niet cache-able

Elk `_precompileScene` doet één shadow-pass voor sunLight. Die pass rendert **alle castShadow=true meshes** op een 1024×1024 depth-buffer. Dat is een rendering-pass, geen compile-werk. Cache helpt hier niets — als je 1417 meshes hebt, kost de shadow-pass altijd 1417 draw-calls + depth-write per pixel.

Volcano warm = 700 ms (413 meshes), neoncity warm = 15453 ms (1417 meshes). Verhouding 22× voor 3.4× meer meshes — dus shadow-pass is super-lineair, waarschijnlijk omdat ook PointLight-bijdrage in main-pass meeschaalt.

## 5. Verklaring trage `firstRaceFrame.render`

Cold range 1.2-7.7 s; warm 0.4-2.7 s. Zelfs warm dik bovenop wat precompile zou moeten dekken.

Hoofdoorzaak: **postfx pipeline draait bij eerste race-frame, NIET tijdens precompile.** Code-evidence:

- `js/effects/postfx.js:280-316` — `renderWithPostFX()` doet 4 passes: scene→rtScene, bright-extract, blurH, blurV, composite.
- `js/core/scene.js:_precompileScene()` rendert via `renderer.render(scene, camera)` direct, zonder postfx.
- `js/core/boot.js:166` — boot doet wel een postfx warm-up render (`renderWithPostFX(scene,camera)`) voor het eerste world. Dus matExtract/matBlur/matComposite shaders worden bij boot gecompileerd. Maar de shader-permutatie van de SCENE-materialen wanneer ze gerendered worden naar `rtScene` (een sRGBEncoding render-target met depthBuffer) **kan anders zijn** dan de permutatie wanneer ze naar de canvas worden gerendered — Three.js' WebGLPrograms berekent de programmaKey op basis van outputColorSpace en wat het render-target verwacht.

Aanvullend op postfx:
- De precompile-render gebeurt op een 16×16 viewport. De first race-frame render gebeurt op het volledige canvas (1280×800 in de runner). Dezelfde shaders, maar de fragment-load is ~5000× groter.
- Eerste echte frame triggert ook de mirror-pass setup als die actief is (in deze run niet, want chase cam komt later — maar wel relevant voor de gebruiker).
- Particles, exhaustSystem, sparkSystem update bij eerste frame en kunnen extra programs triggeren als ze ShaderMaterial gebruiken.

Niet-bewezen voor neoncity warm specifiek: 2.7 sec voor warm postfx-render is nog steeds 2× volcano warm. Waarschijnlijk omdat neoncity zoveel transparente meshes (877) heeft, en transparent passes worden in fragment-rate-bound gerendered (alpha-blending).

## 6. Heap-observatie

Kort onderzoek (geen primary thema):

- Boot heap: 18-23 MB
- Na 5 cold + 5 warm runs: 60-88 MB
- Δ ~65 MB over 10 transities
- Heap fluctueert wel met GC (zie 30→34 MB in cold/space→cold/neoncity), niet monotoon stijgend, dus geen evidente onbounded leak

Verdachten op basis van code-review (niet bevestigd met meting):
- Closure-references in `setTimeout` chains (countdown.js, finish.js)
- HUD-DOM caches in `cacheHUDRefs`
- `_neonBuildingLights`, `_neonEmissives`, `_holoBillboards` arrays — ze worden gereset in `buildScene` (scene.js:357-359) MAAR dat is `array.length=0`, dus de oude array-objects krijgen GC'd alleen als geen oude referentie. Pijn: als een setTimeout/animate-callback nog naar elementen wijst, blijft de hele oude array alive.
- Three.js' interne `WebGLPrograms.programs` cache groeit met new shaders per build (en evict alleen via material-dispose chain).

Dispose-leak op `renderer.info.memory` niveau is met de huidige instrumentatie niet zichtbaar (geen renderer.info snapshots tussen runs). Niet uitgesloten dat shared materials (carParts.js) of shared geometries iets vasthouden.

**Aanbeveling**: heap is geen showstopper voor fase C, maar **als** een fix de scene-rebuild verandert (bv material-caching) is het de moeite waard om in dezelfde gelegenheid één snapshot op `renderer.info.memory.geometries`/`textures` toe te voegen aan de runner zodat een echte trend zichtbaar wordt.

---

## 7. Fix-opties

Vijf opties; eerste twee zijn klein-en-additief, derde is medium-en-additief, vierde is groter-en-substraherend, vijfde is niche-maar-belangrijk.

### Optie A: `renderer.compile()` zonder de off-screen render-pass

**Wat het doet**: hou `renderer.compile(scene, camera)` (200-900 ms) maar laat de 16×16 off-screen `renderer.render()` weg (1.0-25.2 sec). Accepteer dat shader-link, shadow-pass en texture-uploads dan op de eerste race-frame landen.

**Verwachte impact**: `transition.total` zou met 60-95% omlaag gaan. `firstRaceFrame.render` gaat juist omhoog (de 1.0-25.2 sec verschuift naar daar). Voor candy: transition van 5.4s → ~0.4s, firstRaceFrame van 2.9s → ~6s totaal. Voor volcano: 743 ms → ~120 ms, firstRaceFrame 1.2s → ~2s. Voor neoncity: 18.5s → ~1s, firstRaceFrame 7.7s → ~30s+ — onacceptabel.

**Risico's**: voor heavy worlds (neoncity, candy) verschuift de freeze 1:1 naar de eerste race-frame. Op echte hardware (GPU) is het probleem 5-10× kleiner dus mogelijk acceptabel; op iPad onbekend. Geen game-logica risk — pure timing.

**Complexiteit**: S. Eén `if`-flag in `_precompileScene`, of letterlijk verwijderen van het render-block.

**Reversibiliteit**: triviaal — toggle terug.

### Optie B: precompile in chunks tijdens countdown (3 sec budget)

**Wat het doet**: laat `_precompileScene` niet in `buildScene` lopen, maar splits het in chunks die ván rAF worden uitgevoerd tijdens de countdown (3 sec, ~180 frames @ 60fps). Optie 1: per frame X meshes traverseren en hun programs prebakken via `renderer.compile()` op een sub-scene. Optie 2: per frame een hoekje van het canvas pre-renderen met scissor-test. Tijdens countdown is de speler toch al aan het wachten.

**Verwachte impact**: `transition.total` zakt naar ~70-100 ms (alleen disposeScene + scene-build). Countdown-tijd zelf wordt niet langer (al toch 4.2 sec wallclock voor de F1-light-sequence), maar als precompile niet binnen 3 sec klaar is bij een cold-pak van neoncity, valt het terug op opt-A's verschoven freeze. `firstRaceFrame.render` blijft hetzelfde tenzij dit pad ook postfx pre-warmt.

**Risico's**: chunked precompile vereist een soort pre-render mode die niet alle scene-state stuurt (bv lights moeten al staan, materials moeten al bestaan op het moment van chunk-N). Edge cases: speler skipt countdown, kwantumstaat van precompile bij race-start. State-machine dus gevoelig voor bugs. Quit-during-countdown moet precompile-cancel kunnen.

**Complexiteit**: M-L. Vereist nieuwe scene-traversal helper, frame-budget tracking, integratie met countdown-state.

**Reversibiliteit**: medium — feature-flag mogelijk, maar de onderliggende decompositie blijft in code.

### Optie C: shadow-pass uit voor precompile + materialen pre-cachen

**Wat het doet**: tijdens `_precompileScene`, zet tijdelijk `renderer.shadowMap.enabled=false`, doe de 16×16 render (kost dan veel minder), zet shadow-map weer aan. Apart: cachen van wereld-specifieke materialen in een module-level Map zodat ze tussen rebuildWorld-calls hergebruikt worden — dan worden program/geo/tex niet ge-evict door dispose.

**Verwachte impact**: shadow-uit zou de precompile.render naar geschat 30-40% van huidig brengen (shadow is ~60% van pass). Maar: dan worden shaders zonder shadow-variant gecompiled, en moet de eerste echte race-frame opnieuw compilen met shadow-variant — verschuift cost terug. Tenzij we de shadow-variant óók forceren via `material.needsUpdate=true` na precompile (nóg complexer). Material-caching daarentegen heeft potentie: tweede en derde keer naar dezelfde wereld zou near-zero precompile moeten zijn. Voor cold runs blijft helaas de eerste keer duur.

**Risico's**: shadow-uit schakelt is gevaarlijk — als we vergeten weer aan te zetten, verdwijnen schaduwen mid-game. Material-caching introduceert mutable shared state: als één van de update-functies (`updateNeonCityWorld`) een per-instance attribuut wijzigt op een gecachte material, wijzigt het voor alle gebruikers. Niet alle materials zijn safe te delen.

**Complexiteit**: M voor shadow-toggle (klein), L voor material-caching (raakt elke wereld-builder).

**Reversibiliteit**: shadow-toggle: triviaal. Material-caching: complex om uit te zetten.

### Optie D: vervang precompile door per-material warm-up tijdens select

**Wat het doet**: laat `_precompileScene` weg uit `buildScene`. In plaats daarvan: tijdens select-screen idle-loop (terwijl gebruiker car kiest), traverseer `scene.children`, pak elke material, en doe een `renderer.compile({fakescene-with-just-this-material+lights}, camera)` per N materials per frame. Specifiek opt-in voor de eerste frame: pre-warm postfx pipeline ook tijdens select.

**Verwachte impact**: `transition.total` near-zero (geen precompile in build), select-screen werkt langer in de achtergrond maar toont al cars dus voelt niet trag. Op `firstRaceFrame.render` afhankelijk van of postfx ook gepre-warmd is — ja → veel sneller.

**Risico's**: select-screen UI moet idle-callbacks toelaten zonder janky cars-preview. Werkt alleen als gebruiker daadwerkelijk een paar seconden in select blijft (snelle clickers krijgen alsnog cold race). Code-impact lijkt op opt B (chunking) maar dan in een andere fase; veel state-management.

**Complexiteit**: M. Vereist scene-pre-build die alleen materialen produceert, plus chunked-warm-up loop.

**Reversibiliteit**: medium.

### Optie E: combineer A + B + postfx pre-warm

**Wat het doet**:
1. Verwijder de 16×16 off-screen render uit `_precompileScene` (opt A — pure besparing, accepteer first-frame cost-shift voor lichte worlds).
2. Voor zware worlds (`neoncity`, `space`, `candy`): doe een gecontroleerde pre-render in chunks tijdens countdown (opt B — gebruik de 3 sec).
3. Tijdens de chunked pre-render: render via `renderWithPostFX` op het echte canvas-formaat, zodat postfx-pipeline + scene-shaders in dezelfde permutatie gewarm worden.
4. Behoud `renderer.compile(scene,camera)` als snelle pre-warm in `buildScene` (kost slechts 200-900 ms).

**Verwachte impact**: voor lichte worlds (volcano, grandprix): transition <250 ms, firstRaceFrame zelfde of beter. Voor zware worlds: transition <1s, firstRaceFrame ook beter want postfx is nu wel warm. Op echte hardware (GPU): waarschijnlijk near-instant transitions overall.

**Risico's**: combineert risico's van A en B. Quit-during-countdown moet pre-render kunnen cancellen. Per-world toggle heeft een drempel die gekalibreerd moet worden.

**Complexiteit**: L. Driedubbele aanpak vereist orchestratie.

**Reversibiliteit**: medium — feature-flag op niveau van countdown-prewarm; opt A blijft trivially reversible.

---

## 8. Aanbeveling van Claude Code

**Combinatie van Optie A + selectief Optie B-light, niet de hele Optie E.**

Concreet:

1. **Verwijder de 16×16 off-screen `renderer.render()`** uit `_precompileScene` (opt A). Behoud `renderer.compile(scene, camera)` — die kost 200-900 ms maar is async-compile dus impact op main-thread is minimaal in de praktijk. Dit haalt direct 1.0-25.2 sec uit `transition.total` voor alle werelden.
2. **Voor `firstRaceFrame.render`**: voeg in de `boot.js` warm-up render-loop óók een postfx-render toe na elke `rebuildWorld` (call `renderWithPostFX(scene, camera)` één keer aan einde van `buildScene` op de echte canvas, niet 16×16). De cost daarvan is precies de eerste race-frame cost — maar die landt nu tijdens select-screen in plaats van na GO. Dat is 1-2 frames per build, op 1280×800 in de runner; op echte hardware veel goedkoper.
3. **Niet doen voor nu**: Optie B/D/E. De combinatie A + warm-render-via-postfx dekt 90% van het probleem zonder de complexiteit van chunked precompile of select-screen idle-loop. Als A+postfx-warm voor neoncity nog steeds te traag is op echte iPad (>2 sec), DAN pas Optie B erbij.

### Waarom

- **Optie A is "remove a misguided optimization"**: het eerdere experiment ging uit van "shader-compile is de bottleneck", maar de meting laat zien dat het **off-screen render** de bottleneck is, niet compile. De rationale van fdf8c7f was correct over WAAR het probleem zat (eerste race-frame), maar niet over HOE het op te lossen — de 16×16 render verschuift de cost niet, ze vermenigvuldigt 'm (eerst tijdens precompile, dan opnieuw tijdens echte render).
- **`renderWithPostFX` als warm-render** is direct equivalent aan wat de eerste race-frame doet, dus shader-permutaties kloppen exact, postfx-pipeline klopt exact. Geen guesswork over wat-ge-warm-moet-worden.
- **Geen new abstractions, geen state-machine veranderingen**, geen risico op race-condities tussen countdown en buildScene. Dit is de kortste route naar meetbare winst.

### Validatie na implementatie

1. Re-run `tools/perf-run.mjs --report` — verwacht: `transition.total` daalt 50-95% per wereld; `firstRaceFrame.render` daalt of blijft gelijk (cost is nu in `build.warmRender` of vergelijkbaar, niet in firstFrame).
2. Visuele regressie-check: scene moet er onveranderd uitzien direct na buildScene. Geen flicker, geen ontbrekende schaduwen.
3. Mobile/iPad meting via een test-build (gebruiker faciliteert): vergelijk met fase-A baseline daar; verwacht similar of betere relatieve winst.
4. Quit-during-buildScene gedrag check (snelle clicker scenario).

### Eerlijke onzekerheden

- **Software-rendering bias**: alle metingen hier zijn SwiftShader-gebaseerd. Het is mogelijk dat op echte GPU de 16×16 render zo goedkoop is dat opt A niet meetbaar verschil maakt. In dat geval is de 1.0-25.2 sec die we hier zien een artefact van CPU-rendering en het echte probleem op iPad ligt elders. **Mitigatie**: gebruiker moet na implementatie verifiëren op echte hardware.
- **Postfx warm-render cost**: een 1280×800 `renderWithPostFX` is 4 fullscreen-quad render-passes. Op iPad kan dat 50-200 ms zijn. Als dat acceptabel is tijdens select-screen → goed. Zo niet, val terug op chunked aanpak.
- **`renderer.compile()` zelf**: de 200-900 ms die we behouden is ook niet niks. Mocht zelfs dat te traag voelen, dan is de volgende stap material-caching (deel van opt C) — maar dat is een veel grotere refactor.
- **Gedrag van neoncity warm 15.4 sec → ?**: zelfs met opt A blijft `firstRaceFrame.render` voor neoncity warm op SwiftShader op 2.7 sec liggen. Met postfx-warm tijdens select wordt die 2.7s naar select verschoven. Op echte hardware waarschijnlijk <500 ms. Maar als het op iPad nog steeds 2-3 sec is, dan is de **echte oorzaak voor neoncity** "scene is gewoon te zwaar" en moet een aparte performance-pass worden gedaan op de neoncity wereld-builder zelf (minder buildings, minder lights, minder unique materials/textures).

---

## Notities voor fase C

- Diagnostic counters in `js/core/scene.js` (rond `_precompileScene` en in buildScene direct daarvoor), `js/core/loop.js` (rond `firstRaceFrame.render`) en `js/ui/navigation.js` (`_perfHeap` met `diag.rendererInfo.*`) zijn allemaal gemarkeerd met `PHASE-B DIAGNOSTIC (to remove in phase C)`. Verwijder ze samen met de fix.
- De `build.precompile.compile` en `build.precompile.render` markers in `_precompileScene` mogen blijven als instrumentatie — dat is hoe we A/B in fase C gaan vergelijken.
- Branch: `claude/perf-phase-b-diagnose`. Fix in `claude/perf-phase-c-fix-<chosen-option>` of vergelijkbaar.
- Bij A+postfx-warm: meet ook `boot.totalUntilTitle` voor regressie (de boot doet al een postfx-warm voor het eerste world; we verdubbelen dat niet).
