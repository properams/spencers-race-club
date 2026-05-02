# Perf — space cold goToRace.postfxWarm anomaly

Korte mini-analyse op basis van de Phase C2 SwiftShader meting. Geen fix — alleen onderzoek + hypothesen + suggestie voor follow-up.

## De anomalie

`goToRace.postfxWarm` cold per wereld (uit `tools/baselines/phase-c2-swiftshader.json`):

- candy: 108 ms
- volcano: 51 ms
- space: **929 ms**
- neoncity: 101 ms
- grandprix: 64 ms

Warm voor space = 46 ms (vergelijkbaar met andere worlds). Dus de penalty is volledig op de **eerste** post-buildScene-render voor space en niet bij volgende renders.

Voor context: het renderpad van `goToRace.postfxWarm` is identiek voor alle werelden (`renderWithPostFX(scene, camera)` ná `makeAllCars()` + race-cam reposition). Wat wisselt is dus niet de code maar wat er ge-rendered wordt.

## Wat is er anders aan space?

Vergeleken met de andere werelden (uit Phase B diagnostic counts + grep door `js/worlds/space.js`):

### Scene-content statistieken (Phase B baseline data)

- meshes: 633 (volcano 413, neoncity 1417, candy 1594) — middenmoot
- unique materials: 358 — middenmoot
- point lights: 118 (neoncity 193, candy 105, grandprix 90) — tweede-hoogste
- transparent materials: 338 — derde
- emissive materials: 229 — derde

Op pure aantallen niet de zwaarste wereld. Neoncity heeft méér van alles en kost slechts 101 ms.

### Unieke materiaal-properties (grep door world-builders)

- `polygonOffset` materialen: **2** in space (cyan + magenta track-edge ribbons, `space.js:347-349`). Track.js + ramps.js gebruiken het ook globaal. Per polygonOffset-variant compileert Three.js een aparte program-permutatie.
- `side: BackSide` of `side: DoubleSide`: **7** in space (vs candy 4, volcano 3, grandprix 1, neoncity 10). Per side-variant ook aparte permutatie.
- `vertexColors:true` op een mesh — **uniek voor space** (`space.js:287` planet met `MeshLambertMaterial({vertexColors:true})`). Vertexcolors is een #define-permutatie in Three.js.
- `additive blending` particles via PointsMaterial (`space.js:478-480`) — niet uniek maar in space prominenter.

### Verborgen/runtime-toegevoegde meshes

- `_spaceBeamMesh` (tractor beam) wordt aangemaakt met `visible=false` op `y=-100` (`space.js:594-598`). Three.js skipt invisible meshes bij rendering én compile, dus dit beamshader wordt NIET gewarmd door de goToRace warm-render. Geen impact op de meting hier — wel een potentieel mid-race spike wanneer een UFO de beam fired.
- Meteor-systeem creëert 5 meteor-meshes pre-allocated met `active:false`. Volgens code blijven ze in scene maar materials zijn standaard `MeshLambertMaterial` clones — moeten dus wel gecompileerd worden bij eerste render waarin ze visible zijn.
- `updateSpaceWorld` voegt nooit nieuwe meshes toe — alle mesh-creatie is in de builder. Dynamische rotatie/positie alleen.

### Lighting-setup uniek voor space

Uit `scene.js:427-443`:

- `sunLight` intensity = 0.06 voor space (vs grandprix 1.65, candy 1.5) — donkere directional
- `ambientLight` intensity = 0.18 (vs candy 0.65) — donker ambient
- `hemiLight` intensity = 0.14 (vs grandprix 0.36)

Lage intensiteiten zijn uniforms, geen #define — dus geen aparte permutatie. **Wel** de 118 PointLights én een subtle bias in scene.fog (FogExp2 met density `.0014`).

### Title-camera frustum-culling (vermoeden)

Title-camera fly-along (`loop.js:60-67`) bewegt langzaam (`_titleCamT += dt*.016`). In de 180 ms tussen `pickWorld()` en `startRace()` in de runner cycle, beweegt _titleCamT met ~0.003 — vrijwel geen camera-beweging. De title-cam staat dus op één fixe positie te kijken in zijn FOV.

Voor space specifiek: planeten op y=115/195/275 en z=±520-650 zijn extreme afstanden. Nebulae sferen op y=50-150 en z=±500-750. Mogelijk zijn deze deels of geheel buiten title-cam frustum. **De title-render warmt dan alleen de zichtbare meshes.** De goToRace race-cam (y+5.8 achter de player, FOV 62°) heeft een andere look-direction en frustum, en kan voor het eerst materialen in beeld brengen waarvan de shader nog niet warm is.

Dit is het meest plausibele primaire mechanisme. Niet bewezen — vereist een per-mesh "rendered count" meting tussen builder-call en warm-render om hard te maken.

## Waarom andere worlds dit gat niet hebben

- Grandprix: scene is platter (mountains x.z=±200-400 maar y±50, geen extreme uitschieters), title-cam ziet vrijwel alles in zijn frustum → race-cam heeft niets nieuws meer te warmen.
- Candy/Themepark/Volcano: geometrische dichtheid laag, props dicht bij de track en op redelijke hoogtes. Frustum-overlap tussen title-cam en race-cam groot.
- Neoncity: 40 buildings dichtbij de track, allemaal binnen ±60 units vanaf track-curve, hoogte 22-90 → meestal in title-cam frustum. Dat verklaart waarom neoncity ondanks zijn 1417 meshes en 193 lights "maar" 101 ms cold kost.

## Wat dit NIET is

Op basis van de data sluit ik volgende uit:

- Niet shader-program count: andere worlds hebben meer programs (neoncity 97-115) maar zijn sneller.
- Niet asset-bridge HDRI: manifest staat op 404 en `Assets.getHDRI` retourneert null → `maybeUpgradeWorld` is een no-op voor space.
- Niet de cars zelf: `makeAllCars` is per-world identiek (zelfde aantal cars, zelfde shared materials), dus car-cost is constant.
- Niet `_precompileScene`: precompile.cold voor space is 254 ms (vergelijkbaar met andere). Compile zelf is op orde.

## Aanbeveling voor follow-up (NIET nu doen)

Als deze 929 ms op iPad ook merkbaar blijkt (bv >300 ms cold race-start specifiek voor space), dan is de gerichte vervolg-meting:

1. **Per-mesh visible count tussen builder-call en warm-render.** Voeg in `_precompileScene` (na compile) en in `goToRace.postfxWarm` (voor render) een traversal toe die telt: `frustum.intersectsObject(mesh)` voor de huidige camera. Diff de twee counts. Voor space verwacht je in deze hypothese een groter verschil dan voor andere worlds.

2. **Force-render alle space-objecten tijdens precompile.** Tijdelijk in `_precompileScene` voor space een grotere FOV / breder frustum gebruiken, of expliciet door de scene traverseren met `mesh.frustumCulled=false` voor de duur van de compile-render. Meet of cold goToRace.postfxWarm dan zakt naar candy/neoncity bereik.

3. **Goedkoop alternatief**: compile de cars expliciet bij makeAllCars met `renderer.compile(scene, camera)` in plaats van te wachten op de warm-render. Dat is goedkoper dan een full postfx-render en zou car-shaders alleen warmen.

Geen van deze nu uitvoeren — eerst iPad-meting bevestigen of de anomalie echt is op echte hardware. SwiftShader blijft de joker-factor.
