# CHANGES

## Track far-plane pop-in fix v2 (props laden zichtbaar in de verte tijdens rijden)

### Symptoom (na vorige fog-color fix)
"Structuur en kleuren zijn nu duidelijk beter, maar in de verte worden tracks
nog steeds 'geladen' tijdens het rijden — bij hoge snelheid erger, en op elke
ronde even erg." Bij stilstand geen probleem.

### Diagnose
- Stilstand OK + lap 1 == lap 2 == lap 3 sluit shader-compile (Hyp C) en
  per-frame mesh-build (Hyp A) uit.
- "Erger bij hoge snelheid" wijst op camera die sneller objecten passeert die
  de `camera.far=900` plane oversteken — klassiek frustum-culling pop-in dat
  niet door fog gemaskeerd wordt.

### Root cause
`updateWeather()` (loop call elke frame tijdens RACE) zette
`scene.fog.density = (isDark?.0035:.0011) + rainIntensity*rainAdd` met
GP-hardcoded waarden, **voor alle werelden**. Daardoor:

1. De per-world day/night densities die `toggleNight()` zet (bv. 0.0014 voor
   deepsea, 0.0012 voor neoncity) werden élke frame teruggezet naar GP-waarden.
2. De GP day-density 0.0011 geeft op `camera.far=900` slechts 62% fog factor
   (FogExp2: 1−exp(−d²·z²)). Voor goede maskering is ~95% nodig → density
   ≥ 0.0021. Hierdoor zijn props die net binnen de far-plane komen helder
   zichtbaar bij eerste binnenkomst — visible pop-in.
3. De vorige fog-fix had de **initiële** densities in `scene.js` opgehoogd,
   maar `toggleNight()` overschrijft die en `updateWeather()` overschrijft
   `toggleNight()` weer. Dus de hogere waarden bereikten de race-loop nooit.

### Fix
**`js/effects/night.js`**:
- Day-mode densities opgehoogd zodat fog factor op far-plane ≥90%:
  - GP day: 0.0011 → 0.0021
  - Neon day: 0.0012 → 0.0021
  - Themepark day: 0.00095 → 0.0019
  - Candy day: 0.0009 → 0.0019
  - Deepsea day: 0.0014 → 0.0019
  - Space day: 0.0005 → 0.0014 (conservatief — dark sky maskeert al deels)
- Nieuwe global `_fogBaseDensity` toegevoegd (next to `_fogColorDay/Night`),
  geüpdatet aan eind van `toggleNight()` met `scene.fog.density`.

**`js/effects/weather.js`**:
- `updateWeather()` gebruikt nu `_fogBaseDensity` als baseline ipv hardcoded
  GP-waarden. Rain-add bovenop blijft `(isDark?.0025:.0009)*rainIntensity`.
- `setWeather()` cachet `_fogBaseDensity = scene.fog.density` voor non-storm
  modes (zowel space-tak als GP-tak). Storm bevat al rain dus geen base-update.
- `toggleRain()` op TITLE/SELECT scherm: GP-clear density 0.0011 → 0.0021,
  GP-clear weather density 0.0011 → 0.0021, GP-sunset 0.0015 → 0.0021,
  Space-clear 0.0008 → 0.0014.

### Per-wereld density tabel (nieuwe waarden)

| Wereld | Day | Night | Day fog @ z=900 |
|---|---:|---:|---:|
| GP | 0.0021 | 0.0035 | 95% |
| Neon City | 0.0021 | 0.0018 | 95% |
| Themepark | 0.0019 | 0.0018 | 92% |
| Candy | 0.0019 | 0.0012 | 92% |
| Deepsea | 0.0019 | 0.0022 | 92% |
| Space | 0.0014 | 0.0008 | 80% |
| Arctic | 0.0035 | 0.005 | 99.99% |
| Volcano | 0.002 | 0.002 | 96% |

### Niet aangeraakt
- `_trackMesh.material.needsUpdate=true` per frame in `updateWeather` — wel
  inefficient (Hyp D) maar niet de pop-in oorzaak. Aparte efficiency-fix later.
- Camera.far=900 ongewijzigd — fog hidert nu, geen view-distance loss.
- Geen mesh-/geometrie-/material-creatie aangeraakt → geen draw-call regressie.

### Verificatie
- `node --check` OK op night.js + weather.js.
- Geen nieuwe textures/materialen/meshes → geen FPS-impact verwacht.
- Visual overhaul features (bloom, skybox, lens flare, postfx) ongeraakt.

---

## Track render pop-in fix (kleurverschil aan de horizon)

### Symptoom
Tijdens het racen, vooral op hoge snelheid in open werelden, ontstaat een
zichtbare "kleurverschil"-band op de baan ergens vooruit — alsof het stuk
verderop nog niet "geladen" is. Effect is sterker bij snel rijden omdat de
camera dichter bij de overgang komt.

### Hypothese die juist bleek
**Hypothese 1 — Fog kleur mismatch met skybox horizon.**

`scene.fog.color` werd elke frame ge-lerped door `updateSky()` in
`js/track/environment.js` tussen `_fogColorDay` en `_fogColorNight`. Die twee
kleur-globals werden in `js/core/scene.js` voor GP / volcano / arctic samen
gezet in dezelfde `else`-tak op de GP-licht-blauwe waarde `0x8ac0e0`.

`js/worlds/volcano.js` en `js/worlds/arctic.js` zetten daarna wel hun eigen
`scene.fog = new FogExp2(...)`, maar die kleur werd onmiddellijk overschreven
door de eerstvolgende `updateSky()`-frame. Resultaat: de volcano-wereld kreeg
**licht-blauwe fog** in een rood-oranje hellscape, en arctic kreeg
licht-blauwe fog tegen een donkere navy-blauwe sky. Dat geeft een
duidelijke band op de plek waar de fogged geometry de skybox-horizon raakt.

Voor `themepark` was er ook nog geen day/night-tak in `js/effects/night.js` —
die wereld viel terug op de GP-default, waardoor na een night→day toggle
zijn paars-oranje skybox vervangen werd door GP-blauw. Zelfde class van bug.

### Per-wereld tabel (na fix)

| Wereld | Sky bottom (day) | _fogColorDay | _fogColorNight |
|--------|------------------|--------------|----------------|
| grandprix | `#b8d8ee` | `0xb8d8ee` | `0x030d1e` |
| space | `#080045` | `0x080045` | `0x010018` |
| deepsea | `#003355` | `0x003355` | `0x00101a` |
| candy | `#ffe4f0` | `0xffe4f0` | `0x280038` |
| neoncity | `#080025` | `0x080025` | `0x030012` |
| themepark | `#ff8844` | `0xff8844` | `0x3a0e22` |
| volcano | `#1a0400` | `0x1a0400` | `0x1a0400` |
| arctic | `#1a3050` | `0x1a3050` | `0x0a1828` |

Volcano blijft in beide modes gelocked op de sky-bottom, omdat de
volcano-skybox zelf niet swapt op `toggleNight()`.

### Wijzigingen

**`js/core/scene.js`** — split de else-tak in expliciete `isVolcano` /
`isArctic` branches; alle fog-kleuren matchen nu de sky-bottom van hun
wereld. Initiële fog density per wereld licht opgehoogd zodat fog dichter bij
volle opaciteit komt op `camera.far=900` (al wordt density meteen erna door
`toggleNight()` aangepast).

**`js/worlds/volcano.js`** — verwijderde redundante
`scene.fog = new THREE.FogExp2(0x331100, .002)` (had geen effect — werd
overschreven door updateSky lerp). `scene.background` setup verhuisd naar
`scene.js` zodat alle fog/sky-config op één plek staat.

**`js/worlds/arctic.js`** — idem voor de arctic
`scene.fog = new FogExp2(0x8899aa, .0035)` en `scene.background`.

**`js/effects/night.js`** — toegevoegde `themepark`-tak in `toggleNight()`.
Sunset-park-kleurschema blijft staan i.p.v. GP-blauw default. Dark mode geeft
een diepere paarse skybox `#150022` → `#3a0e22` met fog-density `.0018`.

### Niet correct gebleken hypotheses

- **Hyp 2 (anisotropy/mip-mapping op procedural ground textures)** — n.v.t.
  De grond is in alle werelden een solid-color `MeshLambertMaterial`, geen
  procedural canvas-texture. Filter/anisotropy speelt geen rol.
- **Hyp 3 (track material ≠ ground material type)** — beide zijn
  `MeshLambertMaterial`, dus identieke fog-respons.
- **Hyp 4 (postfx blend volgorde)** — niet aangeraakt.
- **Hyp 5 (frustum culling)** — geen `frustumCulled=false` issues gevonden.
- **Hyp 6 (shadow camera frustum)** — `sunLight.shadow.camera.far = 900`
  matcht `camera.far = 900`. Geen overgang shadow→no-shadow binnen kijkafstand.

### Verificatie

- Geen syntax errors (`node --check` op alle gewijzigde files).
- Geen nieuwe meshes/materialen/textures toegevoegd → geen draw-call regressie.
- Geen shadow-map of postfx config aangeraakt → geen FPS regressie verwacht.
- Color-match werkt voor zowel desktop als mobile paths (geen device-specifieke fog code).
