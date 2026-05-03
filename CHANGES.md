# CHANGES

## Car Visual Overhaul (sessie 6) — clearcoat paint + tier-based premium pattern

> Cars currently feel blocky and flat compared to the worlds they drive
> through.

12-car procedurele upgrade die de bestaande `js/cars/brands.js` builders
naar AAA-arcade-level pusht zonder GLB models, build-tools, of
module-migration. r134-only feature-set (geen iridescence — gedeferd tot
r135+ migratie).

### Phase 1 — Material foundation (uniform across all 12 cars)

- **Procedural envMap fallback** (`core/scene.js:_buildProceduralEnvMap`):
  512×256 sky→horizon→ground gradient + 2 sun-hotspots, via `PMREMGenerator`
  → cubemap. Eén singleton, `_sharedAsset` flagged. Vereiste prerequisite
  voor clearcoat — zonder envMap zou `MeshPhysicalMaterial.clearcoat` dof
  renderen i.p.v. wet-paint look. Werkt parallel aan de bestaande HDRI
  loader; echte HDRI overschrijft scene.environment indien ooit beschikbaar.
- **Paint upgrade** (`car-parts.js:makePaintMats`): desktop paint nu
  `MeshPhysicalMaterial` met `clearcoat:1.0, clearcoatRoughness:0.05`.
  Accent: `clearcoat:0.6`. Mobile pad onveranderd (Phong/Lambert).
  Signature uitgebreid naar `(def, opts)` waar `opts.flake` r135+ ready is.
- **Carbon-fiber shared material**: nieuwe `mats.carbon` met procedurele
  256×256 weave-textuur als diffuse map. Opt-in voor builders; momenteel
  alleen geregistreerd in `_carShared`, niet door builders aangeroepen.
- **Chrome upgrade**: `mats.chrome` van Standard naar Physical met
  `clearcoat:0.5`.
- **`_disposeMat` slot-coverage** (`core/scene.js`): refactored van 3
  hardcoded slots naar 16-slot array (`map`, `normalMap`, `roughnessMap`,
  `metalnessMap`, `aoMap`, `emissiveMap`, `bumpMap`, `displacementMap`,
  `alphaMap`, `lightMap`, `clearcoatMap`, `clearcoatNormalMap`,
  `clearcoatRoughnessMap`, `transmissionMap`, `thicknessMap`, `envMap`).
  `_shared()` guard preserved zodat shared textures (procEnv, _carbonTex,
  _softHeadlightTex) overleven.
- **Snap-scene env wiring** (`ui/select.js`): `_snapScene.environment`
  hergebruikt nu `window._buildProceduralEnvMap()` zodat car-select
  previews ook clearcoat-reflecties hebben.

### Phase 2 — Bugatti Chiron pilot (geometry pattern)

Pattern dat in Phase 3 werd uitgerold:
- **Body-subgroup wrap**: `body = new THREE.Group(); g.add(body)`. Alle
  body-meshes hangen aan body i.p.v. direct aan g. Wheels blijven op g
  (physics raakt enkel `g.userData.wheels`).
- **`_crownedSlabGeo(w, h, d)`** (`car-parts.js`): vervangt platte
  BoxGeometry voor hood/roof/engine cover met subtiel gewelfde 3×3 grid van
  vertices — leest als "auto met crown" i.p.v. "blokkige shoebox".
- **`buildPremiumHeadlights(group, mats, opts)`** (`car-parts.js`): inner
  emissive box + 4 LED-segment strip + transparante `MeshPhysicalMaterial`
  lens met `transmission:0.9, ior:1.4`. Mobile valt terug op de regular
  `buildHeadlights`.
- **Drilled brake disc + branded caliper** (`car-parts.js:buildWheel`): high
  LOD gebruikt RingGeometry met 8 hole-meshes geneest in de disc, plus
  caliper kleur via `g.userData._wheelOpts.caliperMatKey` (defaults naar
  `brakeRed`, premium tiers gebruiken `accent`).
- **Chrome window-trim**: dunne BoxGeometry strips langs cabin perimeter.
- **Player underbody glow**: additive disc onder de player car met
  `g.userData._signature.underglow` color. Leest als brand-accent halo.

### Phase 3 — Tiered rollout naar 11 cars

Generaliseerde de Phase 2 patroon over alle resterende builders, met
intentioneel verschillende coverage per tier:

| Tier | Cars | Pattern |
|---|---|---|
| **S/A** | Bugatti, Ferrari, Lamborghini, Porsche, McLaren, Koenigsegg | Volledig pattern: body-subgroup + crowned slabs + premium headlights + chrome trim + drilled discs + accent caliper + underglow |
| **B** | Audi, Maserati | Body-subgroup + crowned slabs + chrome trim. Geen premium headlights, geen drilled disc, geen underglow (Audi's "understated" karakter) |
| **C** | Mustang, Tesla | Body-subgroup wrap only. Muscle/smooth-sedan silhouette is karakter, niet een tekortkoming |
| **F1** | Red Bull, Mercedes | `_buildF1Common` refactored: returnt body-subgroup, beide team-builders gebruiken die. Crowned engine cover toegevoegd. Geen drilled disc, geen underglow — F1 heeft een aparte matte race-aesthetic distinct van glossy road cars |

`build.js:makeAllCars` underglow-pad gegeneraliseerd: van `def.brand === 'BUGATTI'` hardcode naar `mesh.userData._signature.underglow` flag-check. Cleaner extension point.

Porsche is een special-case: behoudt z'n custom round-cylinder headlights
(GT3 RS signature visual) + voegt 4 LED-accent boxes onder elke koplamp toe
i.p.v. `buildPremiumHeadlights` direct aan te roepen. Pattern-match met de
LED-strip uit de helper, behoud van de iconische ronde shape.

### Phase 4 — Polish & verification

- **Headlight beam vs premium lens** geverifieerd geen clipping issue:
  beam-cone base (radius 2.6, centered z=-1.9 in car-local) overlapt
  geometrisch met premium headlight lens (z=-1.95), maar dit is by-design.
  Lens heeft `opacity:0.4` (zichtbaar door additive cone heen), de cone
  representeert de glow OUT van de koplamp.
- **`syncHeadlights` flow** geverifieerd correct met nieuwe LED-strips:
  premium headlights gebruiken dezelfde `mats.head` shared material
  instance als regular headlights, dus night-mode bump van
  `emissiveIntensity` 0.4→1.2 raakt ze allemaal tegelijk.

### Mobile fallback (alle phases)

- `_carMat` mobile branch: `MeshLambertMaterial` (geen PBR-shader-cost).
- `makePaintMats` mobile branch: `MeshPhongMaterial` paint + Lambert accent.
- `carLOD()='low'` skipt: drilled disc holes, branded caliper, premium
  headlight lens, chrome window-trim, hood/roof/engine crown vertex-count
  bump.
- Procedurele envMap wel gebouwd op mobile (~5MB GPU) zodat eventuele
  PBR-meshes elders in de scene reflecties hebben — car-paint zelf is op
  mobile geen Physical en sampelt de env niet.

### Disposal hygiene

- Nieuwe shared assets met `_sharedAsset:true` flag: `_proceduralEnv` cubemap,
  `_carbonTex` weave canvas, `mats.carbon` material, `mats.chrome` (al
  flagged via `_carShared` loop).
- `_disposeMat` 16-slot loop catcht texture-leaks die Phase 1's `clearcoat`,
  Phase 2's `transmission` (lens), of toekomstige `transmissionMap` /
  `thicknessMap` zouden kunnen veroorzaken.
- `disposeSharedCarMats()` extended om `_carbonTex` apart vrij te geven.

### Files touched

| File | Lines | Functie |
|---|---|---|
| `js/core/scene.js` | +75 | `_buildProceduralEnvMap` + `_disposeMat` 16-slot |
| `js/cars/car-parts.js` | +200 | `_carbonTex`, `_crownedSlabGeo`, `buildPremiumHeadlights`, `buildWheel` upgrade, `makePaintMats(def, opts)`, materials |
| `js/cars/brands.js` | +431/-293 | All 12 builders restructured, body-subgroup pattern, tier features |
| `js/cars/build.js` | +12 | `_signature.underglow` underglow pattern |
| `js/ui/select.js` | +9 | Snap-scene env wiring |

### Acceptance gates passed (user-verified)

- 12 cars rebuild on desktop and mobile.
- Tier S/A visibly distinct from Tier B/C/F1 in the car-select preview.
- Bugatti race lap clean: no console errors, no `dbg.error` ringbuffer
  entries, no FPS regression, drilled discs spin met wheels.
- Mobile spotcheck: cars look ~unchanged from pre-Phase-1 (low-LOD pad
  slaat alle premium-features over).

### Known acceptable trade-offs

- **Visueel verschil per material-only Phase 1 is subtiel**. Procedural
  envMap zonder echte HDRI levert mild wet-paint look op, niet de dramatic
  studio-shine van real HDRI. Gedocumenteerd; als ooit echte HDRI assets
  worden toegevoegd, neemt asset-bridge.applyHDRI() automatisch over.
- **Iridescent paintFlake (originele Tier S feature) deferred** tot r135+
  migratie. `makePaintMats(def, opts)` signature is r135-ready.
- **Shader-program count** stijgt op desktop (MeshPhysicalMaterial vs
  Standard, plus per-instance lens material op Tier S/A). Niet gemeten
  in dit phase; voorzien voor follow-up als FPS-issues opduiken.

---

## Track Realism Overhaul (sessie 5d) — DeepSea / Space / Candy ook in pipeline

> "Is er toch niet een andere manier waarop je die op een veilige manier
> ook kan verwerken?"

Voor de drie werelden die in 5b/5c overgeslagen waren — DeepSea, Space,
Candy — alsnog gepaste, veilige integraties toegevoegd:

### Space — GLTF asteroid props (opt-in, no-op zonder cache)
- Manifest gain: `props.asteroid_small`, `props.asteroid_large`
- `js/worlds/space.js` roept `spawnRoadsideProps('space',...)` aan met
  ruimere offset-range (`BARRIER_OFF + 6..25`) zodat asteroids ruimtelijk
  voelen.
- Geen HDRI / silhouettes — cosmic skybox blijft procedureel by design.

### Candy — GLTF candy props + subtiele pastel silhouetten
- Manifest gain: `props.candy_lollipop`, `candy_cane`, `gumdrop` +
  `skybox_layers.mountains_far/_near`.
- `js/worlds/candy.js` dispatcht GLTF props (no-op zonder cache).
- Procedural pastel silhouet-palette (`#ffb3d4` far, `#cc6699` near) met
  zeer lage opacity (0.55-0.70) zodat ze als zachte sweet-mountain ridge
  achter de lollipops/gummies leggen, niet ervoor.

### DeepSea — subtiele dark-teal seafloor silhouetten
- Manifest gain: `skybox_layers.mountains_far/_near` voor textured
  override van rockwall art.
- Procedural palette (`#001a2a` far, `#000812` near) met low opacity
  (0.55-0.72). Combineert met deepsea fog density 0.0017 → ~21% blijft
  zichtbaar op straal 740m → leest als "rotsformaties die net door de
  stroming vaag worden". Bestaande sand-floor / kelp / jellyfish setup
  blijft intact.

### Veiligheidsanalyse
- Zonder asset-bestanden:
  - Space en Candy GLTF dispatchers no-op (geen cache).
  - DeepSea + Candy silhouet-cylinders verschijnen als zachte verre
    horizon-rand. Op deepsea bijna onzichtbaar door fog; op candy een
    pastel-suggestie achter de zoete props.
- Met dropped assets: GLTF asteroids / candy props / textured
  rockwalls + sweethills allemaal hookable via dezelfde shared helpers.

---

## Track Realism Overhaul (sessie 5c) — Auto-materialen PBR + mobile HDRI variant

### Lambert → Standard voor auto-materialen (desktop only)
**`js/cars/car-parts.js`** — alle 13 gedeelde auto-materialen + per-auto
paint en accent gaan nu via een nieuwe `_carMat()` helper die op desktop
`MeshStandardMaterial` retourneert en op mobile `MeshLambertMaterial`
(paint blijft Phong op mobile). Per-materiaal metalness/roughness/
envMapIntensity getuned:

| Material | metalness | roughness | envMapIntensity |
|---|---:|---:|---:|
| paint    | 0.65 | 0.22 | 0.85 |
| accent   | 0.50 | 0.35 | 0.65 |
| glass    | 0.00 | 0.05 | 0.85 |
| chrome   | 1.00 | 0.18 | 1.00 |
| rim      | 0.85 | 0.30 | 0.85 |
| brakeDisc| 0.70 | 0.40 | 0.65 |
| grille   | 0.40 | 0.55 | 0.40 |
| matBlk   | 0.00 | 0.85 | 0.25 |
| tire     | 0.00 | 0.95 | 0.10 |

Effect: zodra een HDRI op `scene.environment` staat zien we crisp
spiegelende reflectie op glas + chrome, mat-metallic gloss op de paint,
en vrijwel niets op rubber/matzwart. Zonder HDRI valt envMapIntensity
op een null-environment terug op een no-op — auto's renderen prima maar
zonder IBL-bijdrage.

### Self-review fix: shared car-mat cache survival
Pre-existing risico (sterker geworden door PBR-shaders): `_carShared`
materialen werden bij elke world-rebuild gedisposed maar de cache hield
de disposed references vast. Op desktop met Standard zou dat een
shader-recompile-hitch geven bij elk track-switch. Fix:
- Alle `_carShared.*` materialen worden nu geflagged met
  `userData._sharedAsset=true` zodat disposeScene ze overslaat.
- `getSharedCarMats()` reset `_headlightMats` array bij rebuild zodat
  duplicaten zich niet opstapelen.
- Nieuwe `disposeSharedCarMats()` aangeroepen voor full session reset
  (niet voor per-race rebuild) — header-comment was al oud, nu echt
  geïmplementeerd.

### `applyHDRI` envMapIntensity-loop respecteert per-component tuning
Het globale `envMapIntensity = 0.6` in `js/effects/asset-bridge.js` slaat
nu materialen over die `userData._carPBR=true` of
`userData._sharedAsset=true` dragen, zodat de zorgvuldig getunede waarden
voor chrome (1.0) en rim (0.85) niet teruggezet worden naar 0.6.

### Mobile 1K HDRI variant
**`assets/manifest.json`** — `hdri_mobile` slot toegevoegd voor 5
werelden (gp / neoncity / volcano / arctic / themepark) verwijzend naar
`*_1k.hdr`-paden. **`js/assets/loader.js` `_slot()`** — bij `dotPath ===
'hdri'` en `window._isMobile===true` retourneert de loader het
`hdri_mobile`-pad indien aanwezig, valt anders door naar het 2K-pad
zodat oudere manifests niets breken.

Mobiel geheugengebruik: 2K HDR ≈ 6MB textuur, 1K ≈ 1.5MB. Beide na
PMREM ≈ same envMap-omvang dus voornaamste winst zit in download +
decode-tijd op trage netwerken.

---

## Track Realism Overhaul (sessie 5b) — Procedurele silhouetten + GLTF props per wereld

> "Beide" — antwoord op of we per-wereld GLTF dispatchers wilden én
> procedurele silhouetten voor andere werelden dan GP.

### Per-wereld procedurele silhouetten
`_SILHOUETTE_PALETTES` in `js/track/environment.js` heeft nu 5 entries
(gp / neoncity / volcano / arctic / themepark) met paletten gestemd om
*achter* de bestaande rijke horizon-content te zitten:
- **GP**: blue-grey atmospheric haze (ongewijzigd).
- **Neon City**: deep blue-purple distant skyline ridge (lagere opacity).
- **Volcano**: rust-red silhouetten die in de ember haze verdwijnen.
- **Arctic**: koud blauw-misty mountains, lichter palette zodat ze
  blenden in de fog ipv eruit te springen.
- **Themepark**: dusk-purple ridges achter de fireworks.
- **DeepSea / Space / Candy** blijven uit (onderwater / cosmic /
  thematisch). Deepsea sand-floor PBR slot blijft beschikbaar.

Palette format uitgebreid met height + opacity per laag zodat per-wereld
de "verberg in fog of pop boven horizon"-tradeoff fijn af te stemmen is.

### Per-wereld GLTF prop dispatchers
**`js/effects/asset-bridge.js`** krijgt twee shared helpers:
- `spawnGLTFProp(proto, x, z, opts)` — clones een GLTF root, normaliseert
  schaal naar `opts.sizeHint`, plaatst in scene. Flagt geometry, material
  én alle map slots (`map`/`normalMap`/`roughnessMap`/`metalnessMap`/
  `emissiveMap`/`aoMap`/`bumpMap`) als `_sharedAsset` zodat disposeScene
  de cache niet stukmaakt.
- `spawnRoadsideProps(worldId, opts)` — leest beschikbare prop GLTFs uit
  cache, plaatst clusters langs de baan via `trackCurve`. Bailt direct
  als `BARRIER_OFF` ontbreekt of geen GLTF in cache zit.

**Per-wereld manifest slots + dispatch wiring:**
- volcano: `rock_basalt_small`, `rock_basalt_medium`, `lava_chunk`
- arctic: `iceberg_small`, `iceberg_medium`, `snow_rock`
- themepark: `traffic_cone`, `bollard`, `barrel`
- neoncity: `trashbin`, `bollard_neon`, `roadblock`
- deepsea: `coral_small`, `coral_medium`, `wreck_box`
- grandprix: ongewijzigd (`tree_pine` + `tree_birch` + `rock_*` +
  `haybale`); de oude lokale `_spawnGLTFProp` is verwijderd uit
  `grandprix.js`, dispatcher gebruikt nu `window.spawnGLTFProp`.

Elke `buildXEnvironment` roept `window.spawnRoadsideProps(world,...)`
aan aan het einde van zijn build. **Cache leeg → no-op**: zonder
gedropte assets zijn geen visuele wijzigingen tegenover de procedurele
omgeving.

### Self-review fix toegepast
- Eerdere `_spawnGLTFProp` flagde alleen het material als shared, niet
  de map slots. Op world-rebuild zou disposeScene de cached GLTF maps
  vernietigen → texturefout in volgende race van dezelfde wereld. Nu
  worden alle 7 map slots geflagged in zowel `spawnGLTFProp` als de
  GLTF tree-spawner. Pre-existing risico, blast-radius nu over 6
  werelden, dus opgelost.

### Veiligheidsanalyse
- Zonder asset-bestanden:
  - Procedurele silhouetten verschijnen op gp / neoncity / volcano /
    arctic / themepark als zachte ridge-line ver achter bestaande
    content. **Dit is een visuele wijziging** — bewust, want de gebruiker
    vroeg om realisme-richting voor alle tracks.
  - GLTF dispatchers zijn no-op (geen GLTFs in cache).
  - DeepSea / Space / Candy zien er identiek uit aan vóór.
- Met dropped assets: HDRI / ground PBR / GLTF props alle hookable.

---

## Track Realism Overhaul (sessie 5) — Roll-out naar alle werelden

> "Ziet er goed uit. Je mag nu verder met alle tracks."

Pipeline uit sessie 4 uitgerold over Neon City, Volcano, Arctic, Themepark
en DeepSea zonder gedrag te wijzigen totdat de gebruiker assets laat
landen. Procedurele paths en bestaande wereld-stijlen blijven volledig
intact — pas bij een gedropt bestand verandert wat er op het scherm
verschijnt.

### Aanpassingen

- **`assets/manifest.json`** — slots toegevoegd voor 5 werelden:
  - HDRI: neoncity / volcano / arctic / themepark
  - Ground PBR (color + normal + roughness): neoncity (wet asphalt),
    volcano (lava rock), arctic (snow/ice), themepark (pavement),
    deepsea (sand floor)
  - Skybox layers: neoncity / volcano / arctic / themepark
  - Space en candy blijven `{}` (geen baat bij PBR-realism)

- **Per-wereld proc-ground meshes getagd** (`_isProcGround=true`) zodat
  `asset-bridge.applyGround` ze kan herkennen wanneer PBR-textures
  geladen zijn:
  - `js/worlds/arctic.js` (ice plane)
  - `js/worlds/volcano.js` (rock plane)
  - `js/worlds/deepsea.js` (sand floor in `buildSeaFloor`)
  - `js/worlds/themepark.js` (pavement plane)
  - `js/worlds/neoncity.js` (asphalt base — overlay wet/sheen meshes
    blijven onaangetast bovenop de Standard ground)

- **`buildBackgroundLayers` gegeneraliseerd** in
  `js/track/environment.js`: leest nu `skybox_layers.mountains_far/_near`
  uit het manifest van de actieve wereld. Procedurele canvas-silhouetten
  blijven Grand-Prix-only (om bestaande rich horizons in andere werelden
  niet te overschrijven). Wireup in `js/core/scene.js` voegt de call toe
  aan neoncity / volcano / arctic / themepark zodat hun textured layers
  meegerenderd worden zodra ze in de cache zitten.

- **`assets/README.md`** uitgebreid met per-wereld activatie-tabel +
  HDRI-suggesties (Poly Haven CC0).

### Veiligheidsanalyse

- Zonder asset-bestanden: alle werelden zien er identiek uit aan main.
  `applyHDRI` / `applyGround` returnen `null` zonder cache hit;
  `buildBackgroundLayers` no-op't voor non-GP zonder textured layers.
- HDRI fog-overschrijving voor stylistische werelden (volcano red,
  neon purple) is een bewuste opt-in trade: wie een Poly Haven HDRI
  dropt accepteert dat de wereld richting realistic schuift. Stick met
  procedural om de stijlkleuren te behouden.

### Niet uitgerold deze sessie

- GLTF tree-pool en prop-pool blijven GP-only. Per-wereld prop
  dispatchers (volcano: rocks/ash; arctic: icebergs; themepark: traffic
  cones; neoncity: trash bins/bollards) zijn aparte sessies.
- Auto materials nog steeds Lambert. Materiaalupgrade naar Standard
  blijft een aparte beslissing.

---

## Track Realism Overhaul (sessie 4) — Spencer Grand Prix als pilot

> "Ik vind de ondergrond van de tracks echt heel goed. Maar ik zie nog steeds
> hoekige bomen op de horizon, lichtgekleurde blokken en pixel-achtige licht-
> stralen. Maak het richting realisme, dichter bij de baan, dynamischer."

Sessie sluit de visuele kloof tussen het asfalt (al sterk) en de rest van
GP via een **manifest-driven asset pipeline** met procedurele fallback,
analoog aan de audio-overhaul. Een verse clone zonder assets draait
identiek; assets zijn altijd een upgrade, nooit een vereiste.

### Fase A — Asset loader foundation
**`js/assets/loader.js`** (nieuw, +308 LOC) — `window.Assets` met
`preloadWorld`, `loadHDRI`, `loadTexture`, `loadGroundSet`, `loadGLTF`,
plus synchrone `getHDRI`/`getGLTF` getters die uit cache lezen. Lazy-laadt
`RGBELoader`/`GLTFLoader` van CDN (jsdelivr three@0.134.0/examples/js)
alleen wanneer de eerste betreffende asset wordt opgevraagd. Faillig laden
geeft `null`, nooit een throw.
**`assets/manifest.json`** (nieuw) — slot-definities per wereld; alleen
GP gevuld, andere zes werelden hebben lege `{}` reservering.
**`assets/README.md`** (nieuw) — per-slot Poly Haven/Quaternius/KayKit
suggesties (CC0 only) plus activatie-instructies.
**`js/effects/asset-bridge.js`** (nieuw) — `maybeUpgradeWorld(worldId)`
patcht HDRI en PBR ground in een al-gebouwde scene zodra preload klaar is.
**Pause-overlay status indicator** (`js/ui/pause.js` + `index.html`) —
toont per actieve wereld `HDRI ✓ GROUND 3/3 PROPS 5/5 LAYERS 2/2`.
**Preload triggers** — `js/core/boot.js` (default world bij start),
`js/ui/select.js` (op world-switch).

### Fase B — HDRI sky + environment voor Grand Prix
`scene.background` en `scene.environment` worden vervangen door een
PMREM-processed HDRI als die in cache zit. Fog-color wordt uit de
horizon-rij van de HDRI gesampled (via `RGBELoader.setDataType(FloatType)`
zodat het pixel-byte-stride vraagstuk uit de weg is). PBR materials
krijgen `envMapIntensity=0.6` waar `envMapIntensity` op het material
bestaat (Lambert negeert dit veld stilletjes — geen schade).
`disposeScene` herkent shared assets via `userData._sharedAsset` zodat
HDRI cache niet wordt vernietigd op world-rebuild.

### Fase C — Instanced GLTF vegetation
**Procedural fallback verdicht én ge-instanced.** Tree-count opgehoogd
van 142 (55×2 + 32 infield) naar ~250 op desktop / ~150 op mobile.
Drie InstancedMesh draw-calls i.p.v. 426 individuele meshes. Twee
density-ringen (close + far) plus 6 organische clusters van 2-4 trees.
**GLTF-pad** clusterd plaatsingen per (geometry, material) tuple uit de
GLTF prototypes en bouwt een InstancedMesh per slot. Geometry wordt per
spawn ge-cloned zodat instanceMatrix-buffers schoon worden vrijgegeven
op rebuild; materials blijven shared.

### Fase D — GLTF roadside props
`buildGPTrackProps` in `js/worlds/grandprix.js`: tire-stack-met-rode-cap
locaties (8 corners) krijgen nu een 2-3 prop cluster (haybale / rock_small
/ rock_medium) als die GLTFs in cache zitten. Box-fit normalisatie zorgt
dat verschillende GLTF-schalen passen. Zonder cache: originele tire
stack met rode cap.

### Fase E — PBR ground textures
`buildGround` tagt zijn proc-grass mesh met `_isProcGround=true`. Bij
preload-completion vervangt `applyGround` het `MeshLambertMaterial` door
`MeshStandardMaterial` met `map`/`normalMap`/`roughnessMap` uit cache,
40×40 tiling. Disposed netjes als ground assets niet aanwezig zijn — de
proc-grass canvas blijft.

### Fase F — Zachte volumetrische koplamp-cones
12-segment angular cone → 32×8 (16×4 op mobile) cone met radial alpha-
mask texture die V-as falloff doet (bright tip, fade naar 15% aan base).
Geen azimuthal modulatie meer (oude code produceerde per ongeluk twee
bright bands op de cone). Opacity flickert ~5% op 1.25 Hz met per-cone
phase offset; L/R cones zijn organisch desync.

### Fase G — Parallax background silhouettes
`buildBackgroundLayers` plaatst twee cylinder silhouet-lagen (`radius=740`
/ `540`, `height=110` / `78`) tussen de `buildMountains` peaks en de
skybox. Procedureel gegenereerd via `_silhouetteTex` (3-octave seeded
noise voor jagged ridge-line). Als `mountains_far.png` /
`mountains_near.png` in de asset-cache zitten worden die gebruikt i.p.v.
de canvas. Fog-doordringing zorgt dat de lagen natuurlijk in de horizon
zakken.

### Self-review pass — fixes na code-quality / efficiency / code-reuse review
- `RGBELoader` byte-stride: forceer `FloatType` zodat `_sampleHorizon`
  niet probeert RGBE bytes als float te lezen.
- `MeshLambertMaterial` + `instanceColor` werkt niet in r134 — leaf cones
  nu in 3 color-buckets, elk eigen InstancedMesh (3 leaf-buckets × 2
  cone-niveaus + 1 trunk = 7 draw-calls totaal).
- Headlight alpha-mask: azimuthal modulatie verwijderd (gaf dubbele
  bright bands op de cone).
- `disposeScene` rewrite: aparte `_shared(x)` check op mesh, material en
  elke texture-slot. Eerdere logica disposed shared headlight texture
  onbedoeld.
- InstancedMesh geometry per spawn ge-cloned (was geshared, gaf
  instanceMatrix buffer-leak op rebuild).
- Mobile-caps op tree count (60+28 ipv 90+48) en headlight cone segments
  (16×4 ipv 32×8) — fillrate-budget op mobile.

### Activeren
1. Drop assets in de paden uit `assets/manifest.json` (zie
   `assets/README.md` voor Poly Haven / Quaternius URLs).
2. Hard refresh (Ctrl+Shift+R).
3. Pause tijdens race → "ASSETS [GRANDPRIX]" regel toont coverage.

### Performance budget (procedural-only pad, geen assets)
| Metric | Voor (main) | Na (sessie 4) | Delta | Budget |
|---|---:|---:|---:|---:|
| Trees in GP | 142 (×3 meshes = 426 draw calls) | ~250 (×7 instanced = 7 draw calls) | **−419 draw calls** | ≤ +60 |
| Background layers | 0 | 2 cylinder meshes | +2 draw calls | n.v.t. |
| Headlight cone tris/car | 36 | 512 (256 op mobile) | +476 (+220 mobile) | (player only) |
| Heap delta on rebuild | baseline | ~+0.5 MB (canvas textures) | +0.5 MB | < 30 MB |

Tree-rewrite alleen al levert een netto draw-call winst van ~419 op,
ruim binnen budget om HDRI / silhouettes / soft-cones bij te tellen.

### Niet aangepast
- Andere werelden — manifest reserveert slots maar er worden geen
  builders gewijzigd voor Neon / Volcano / Arctic / Space / DeepSea /
  Candy / Themepark.
- Auto materials — blijven Lambert. Conversion naar Standard is een
  aparte beslissing met perf-implicaties; gedocumenteerd als follow-up.
- Three.js r134 → r160 migratie — ThreeCompat shim ongewijzigd qua API,
  alleen `applyTextureColorSpace` nu echt gebruikt.
- Audio, postfx, gameplay — out of scope.

### Follow-ups voor volgende sessies
1. Roll-out naar Neon / Volcano / Arctic — manifest entries vullen,
   per-wereld build-code aanpassen analoog aan GP.
2. GLTF cars (`cars.json` `model` veld) — vereist car-builder dispatcher
   net als de wereld-builder.
3. Auto material upgrade naar `MeshStandardMaterial` met
   `envMapIntensity=0.4-0.6` voor body, behoudt envMap reflecties van GP
   HDRI op de auto. Perf-impact testen op mobile.
4. Mobile 1K HDRI variant: `grandprix_dusk_1k.hdr` met device-detect in
   loader om kleinere variant te kiezen.

---

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
