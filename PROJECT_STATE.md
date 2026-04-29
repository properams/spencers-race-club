# PROJECT_STATE.md — Spencer's Race Club

Feitelijke inventarisatie van de huidige codebase. Geen review, geen aanbevelingen.

## 1. Tech stack & runtime

- **Three.js**: r160 (commentaar in `index.html` zegt nog "r134 staat inline", maar de inline blob bevat r160-kenmerken — feitelijk geladen versie is gemarkeerd als r160 in de comments en er ligt een TODO/instructie om naar `assets/vendor/three-r160.min.js` te switchen). Three is **inline ge-embed** in een `<script>`-blok in `index.html`, geen CDN-link.
- **Andere libraries via CDN**: alleen Google Fonts (`fonts.googleapis.com`, Orbitron + Rajdhani). Geen andere `<script src="https://...">`.
- **Build tools**: geen. Er is geen `package.json`, geen `node_modules`, geen bundler. Pure static HTML + JS.
- **Module systeem**: **mix**.
  - Het merendeel van `js/` zijn non-module scripts die via global script scope hun let/const/var/function delen.
  - Een kleine groep is wel ES module (`type="module"`): `js/persistence/save.js`, `js/persistence/progression.js`, `js/audio/music.js`, `js/audio/samples.js`, `js/audio/music-stems.js`, `js/audio/engine-samples.js`, `js/audio/api.js`. Deze modules exposen hun API via `window.*` zodat non-module scripts erbij kunnen.
  - `js/main.js` is **non-module**, declareert top-level `var`/`let`/`const` als globals voor andere scripts.
- **Targets**: browser-only (geen Node). Mobile fallbacks via `window._isMobile` / `_isTablet` / `_isIPadLike` / `_isTouch` flags in `js/core/device.js`. iOS-specifieke gesture-blockers in `js/core/boot.js`.

## 2. File-structuur

```
.
├── .claude/agents/
├── assets/
│   ├── _inbox/             (drop-zone voor raw asset uploads)
│   ├── audio/
│   │   ├── engine/         (leeg)
│   │   ├── music/neoncity/ (leeg behalve .gitkeep)
│   │   └── sfx/            (leeg)
│   ├── hdri/               (leeg)
│   ├── models/
│   │   ├── arctic/         (1 .glb)
│   │   ├── city/           (~45 GLTF/bin pairs + 1 png)
│   │   ├── landmarks/      (1 .glb)
│   │   ├── nature/         (Quaternius pack: ~70 GLTF/bin + textures)
│   │   └── space/          (~16 .glb)
│   ├── textures/           (alleen .gitkeep)
│   ├── manifest.json       (per-wereld asset-slots)
│   ├── README.md, CREDITS.md, download_assets.sh
├── css/                    (5 .css files)
├── data/                   (cars.json, tracks.json, prices.json)
├── js/
│   ├── assets/loader.js
│   ├── audio/              (8 files)
│   ├── cars/               (5 files)
│   ├── core/               (8 files)
│   ├── effects/            (5 files)
│   ├── gameplay/           (16 files)
│   ├── persistence/        (2 files)
│   ├── track/              (4 files)
│   ├── ui/                 (8 files)
│   ├── worlds/             (12 files)
│   ├── config.js
│   └── main.js
├── index.html              (480 regels, met inline Three.js r160 blob)
├── CHANGES.md, CAR_SELECT_REDESIGN_DONE.md, SESSIE_HUD_REDESIGN_REPORT.md
└── .gitignore
```

Per top-level directory:
- `assets/` — visuele assets (modellen, textures, hdri, audio-slots) + manifest. De meeste audio-slots zijn nog leeg.
- `css/` — styling, gesplitst per scherm/HUD/wereld.
- `data/` — runtime game-data (cars, prices, track-waypoints) als JSON.
- `js/` — alle game-code, gegroepeerd per subsysteem.
- `index.html` — entry, bevat alle script-tags + ge-embedde Three.js.

**Bestand-tellingen:**
- `.js`: 70 (waarvan 68 in `js/`, 2 in dubbeltelling)
- `.css`: 5
- `.md`: 18 (waarvan veel in repo-root + `assets/README.md`, `CREDITS.md`)

## 3. Entry points & bootstrap

- **First load**: `index.html`. Geeft eerst een mini-error-overlay-script inline (regel 18), dan css-links en de DOM voor alle screens.
- Three.js r160 is inline ge-embed (start ~regel 378).
- Daarna script-tags in deze volgorde (samengevat):
  1. ES modules: `persistence/save.js`, `persistence/progression.js`, `audio/music.js`, `audio/samples.js`, `audio/music-stems.js`, `audio/engine-samples.js`, `audio/api.js`
  2. Core (non-module): `config.js`, `core/device.js`, `core/debug.js`, `core/perf.js`, `core/three-compat.js`
  3. `assets/loader.js`, `effects/asset-bridge.js`
  4. `effects/postfx.js`, `core/renderer.js`, `core/scene.js`, `core/loop.js`
  5. `audio/engine.js`, `audio/sfx.js`, `audio/ambient.js`
  6. Worlds (in deze volgorde): `grandprix`, `volcano-bridge`, `volcano`, `arctic-iceshelf`, `arctic`, `themepark-coaster`, `themepark`, `space`, `deepsea`, `neoncity`, `candy-chocobridge`, `candy`
  7. Effects/track/cars/effects: `particles`, `track/environment`, `track/track`, `track/ramps`, `track/collectibles`, `cars/car-parts`, `cars/brands`, `cars/build`, `cars/physics`, `cars/ai`, `effects/weather`, `effects/night`, `effects/visuals`
  8. Gameplay: `ghost`, `speedtrap`, `sectors`, `tires`, `combo`, `collisions`, `tracklimits`, `camera`, `pitstop`, `countdown`, `finish`, `achievements`, `spacefx`, `safetycar`, `race`
  9. UI: `hud`, `touch`, `select`, `pause`, `navigation`, `input`, `help`
  10. `core/boot.js` (definieert `boot()`)
  11. `js/main.js` (declareert globals + roept `boot()` aan op het eind)
- **Main entry**: `js/main.js` (242 regels). Bevat top-level `var`/`let`/`const` declaraties van alle gedeelde game-state globals (CAR_DEFS, TRACK_WP, scene/camera/renderer, carObjs, gameState, audioCtx, persistence-vars, etc.) en eindigt met `boot()`.
- **Bootstrap**: `boot()` in `js/core/boot.js` (183 regels) — laadt JSON-data, installeert iOS-blockers, initialiseert renderer/scene/audio, start music op eerste user-gesture, wired menu-knoppen, restoreert localStorage prefs, en start de main loop.

## 4. Modules

Lengte-categorieën: kort = <100, middel = 100–300, lang = >300. "Strict" = `'use strict'` in bestand. "Exposed" = hoe externe code het bereikt.

### Core (`js/core/`)

| Pad | Regels | Categorie | Wat | Exposed | Strict |
|---|---|---|---|---|---|
| `core/boot.js` | 183 | middel | App-bootstrap (`boot()`), iOS-gesture-blockers, audio-unlock op eerste tap | global `boot` | ja |
| `core/debug.js` | 261 | middel | `window.dbg` logger + error-ringbuffer + Ctrl+Shift+E error-viewer + visual badge bij `?debug` | `window.dbg`, `_dbgViewer`, `_updateDebugBadge` | ja |
| `core/device.js` | 23 | kort | iPad/touch/mobile detection + `_redetectDevice()` | `window._isMobile/_isTablet/_isIPadLike/_isTouch` | ja |
| `core/loop.js` | 147 | middel | Main render-loop, FPS-meting, dynamische quality-scaling | global `loop`, `_fpsShow` | ja |
| `core/perf.js` | 140 | middel | Perf-overlay (Ctrl+Shift+P): FPS, heap, draw calls, scene-stats | `window.showPerf/hidePerf/togglePerf` | ja |
| `core/renderer.js` | 72 | kort | `initRenderer()`, WebGL context-loss handler, mobile pixel-ratio | global `initRenderer` | ja |
| `core/scene.js` | 514 | lang | `disposeScene()`, sky-textures, `buildScene()` dispatcher per wereld | global `buildScene/disposeScene` | ja |
| `core/three-compat.js` | 128 | middel | Compat-shim voor verschillende Three-versies | `window.ThreeCompat` | ja |

### Audio (`js/audio/`)

| Pad | Regels | Categorie | Wat | Exposed | Strict |
|---|---|---|---|---|---|
| `audio/ambient.js` | 147 | middel | Thunder, crowd noise, ambient wind | globals `playThunder/updateThunder/initCrowdNoise/...` | ja |
| `audio/api.js` | 135 | middel | `Audio` facade die alle gameplay-calls routeert naar onderliggende implementaties | `window.Audio`, ES export | **nee** |
| `audio/engine-samples.js` | 105 | middel | Sample-based engine sound (per car-type RPM-banden) | `window.SampleEngine`, `_createSampleEngineForCarType` | **nee** |
| `audio/engine.js` | 222 | middel | Procedural 4-osc engine + wind + roll noise + boost glow updates | globals `initEngine/updateEngine/...` | ja |
| `audio/music-stems.js` | 171 | middel | Stem-based race music routing als samples geladen zijn | `window.StemRaceMusic`, `_createStemRaceMusicIfReady` | **nee** |
| `audio/music.js` | 944 | lang | Procedurele music-engine (TitleMusic / SelectMusic / RaceMusic + stems-fallback dispatcher), `_fadeOutMusic`, `_safeStartMusic`, `_applyMusicGain`, etc. | many `window.*` (zie globals) | **nee** |
| `audio/samples.js` | 317 | lang | Manifest-driven AudioBuffer loader + cache (music/engine/SFX/surface/ambient) | many `window._preload*/_has*/_get*` | **nee** |
| `audio/sfx.js` | 194 | middel | Procedurele SFX (boost, nitro, screech, jump, land, spin, collision, brake, victory, count, fanfare, recovery, collect, engineRev) | globals `play*Sound` | ja |

### Cars (`js/cars/`)

| Pad | Regels | Cat. | Wat | Exposed | Strict |
|---|---|---|---|---|---|
| `cars/ai.js` | 156 | middel | AI personality, near-miss cooldown, `_aiHeadPool`, AI-driving logic | globals | ja |
| `cars/brands.js` | 822 | lang | Per-brand body builders (Bugatti/Ferrari/Lambo/Porsche/Ford/Tesla/Koenigsegg/...) | `window.BRAND_BUILDERS`, `buildBugattiChiron`/`buildLamborghiniHuracan`/etc. | ja |
| `cars/build.js` | 179 | middel | High-level car-build orchestratie + LOD | `window.carLOD`, `addPart` | ja |
| `cars/car-parts.js` | 342 | lang | Reusable car-parts builders (wheels, headlights, taillights, exhausts, side skirts/vents, wheel arches, paint mats) | many `window.build*`, `getSharedCarMats`, `disposeSharedCarMats` | ja |
| `cars/physics.js` | 321 | lang | Player + AI physics, slip vectors, scratch-vector reuse | globals | ja |

### Effects (`js/effects/`)

| Pad | Regels | Cat. | Wat | Exposed | Strict |
|---|---|---|---|---|---|
| `effects/asset-bridge.js` | 257 | middel | Bridge tussen procedurele scene-builders en gecachte GLTF-assets | `window._assetBridge`, `spawnGLTFProp/spawnRoadsideProps/spawnGroundClutter` | ja |
| `effects/night.js` | 235 | middel | Day↔night smooth-transition, sun/ambient/hemi, stars, headlights | global `toggleNight` etc. | ja |
| `effects/particles.js` | 54 | kort | `SimpleParticles` class | global class | ja |
| `effects/postfx.js` | 316 | lang | Bloom + vignette + grading composer-pad, `renderWithPostFX` | global `renderWithPostFX` | ja |
| `effects/visuals.js` | 504 | lang | Drift/nitro/boost-trail/rev-limiter/speed-lines/floating-score/collision-flash/quick-restart/weather-forecast/rear-mirror visuals | globals + `_floatSlot/_RPM_*` | ja |
| `effects/weather.js` | 244 | middel | Rain/snow/storm/lightning, weather-transitions, `_rainIntensity` | globals | ja |

### Gameplay (`js/gameplay/`)

| Pad | Regels | Cat. | Wat | Exposed | Strict |
|---|---|---|---|---|---|
| `gameplay/achievements.js` | 152 | middel | ACHIEVEMENTS + DAILY_CHALLENGES, toast-UI | globals | ja |
| `gameplay/camera.js` | 185 | middel | Chase/heli/hood/bumper cams, victory orbit, intro pan, mirror, scratch-vectors | globals `setCamView` etc. | ja |
| `gameplay/collisions.js` | 39 | kort | Auto↔auto collision-respons | globals | ja |
| `gameplay/combo.js` | 37 | kort | Drift score/timer + combo multiplier | globals | ja |
| `gameplay/countdown.js` | 61 | kort | Race-start 3-2-1-GO countdown | globals | ja |
| `gameplay/finish.js` | 248 | middel | Finish-screen, podium, fastest lap, achievements eval | globals | ja |
| `gameplay/ghost.js` | 65 | kort | Ghost-car opname + replay | globals | ja |
| `gameplay/pitstop.js` | 57 | kort | Pit-stop trigger + duck audio | global `triggerPitStop` | ja |
| `gameplay/race.js` | 113 | middel | `_resetRaceState`, lap-timer, race-stats | globals | ja |
| `gameplay/safetycar.js` | 43 | kort | Safety car spawn tijdens recovery | globals | ja |
| `gameplay/sectors.js` | 22 | kort | Sector timing | globals | ja |
| `gameplay/spacefx.js` | 151 | middel | Space-wereld specifieke FX (gravity wells, warp tunnels) | globals | ja |
| `gameplay/speedtrap.js` | 18 | kort | Speed trap meting | globals | ja |
| `gameplay/tires.js` | 16 | kort | Tire temperature state | globals | ja |
| `gameplay/tracklimits.js` | 213 | middel | Off-track / wrong-way detection + recovery | globals | ja |

### Track (`js/track/`)

| Pad | Regels | Cat. | Wat | Exposed | Strict |
|---|---|---|---|---|---|
| `track/collectibles.js` | 306 | lang | Coin/star pickup spawning + animation | globals | ja |
| `track/environment.js` | 1054 | lang | Generieke environment-builders (ground, clouds, barriers, gantry, mountains, lake, gravel, trees, night, spectators, sun-billboard, advertising, corner boards, flags) | many `build*` globals | ja |
| `track/ramps.js` | 286 | lang | Jump-ramps, spin-pads, boost-pads, centerline-arrows | globals | ja |
| `track/track.js` | 330 | lang | `buildTrack()` — track curve, mesh, barriers, finish line | global `buildTrack` | ja |

### Persistence (`js/persistence/`)

| Pad | Regels | Cat. | Wat | Exposed | Strict |
|---|---|---|---|---|---|
| `persistence/save.js` | 133 | middel | localStorage save/load met schema-validatie. Storage key = `'spencerRC'` | `window.loadPersistent/savePersistent`, ES export | **nee** |
| `persistence/progression.js` | 99 | kort | Coins, unlocks, world-buy, car-buy, daily challenge bookkeeping | `window.awardCoins/buyCar/buyWorld/checkUnlocks/showUnlocks/showUnlockToast/updateTitleHighScore`, ES export | **nee** |

### UI (`js/ui/`)

| Pad | Regels | Cat. | Wat | Exposed | Strict |
|---|---|---|---|---|---|
| `ui/help.js` | 119 | middel | Help-overlay (?-knop) | `window.showHelp/hideHelp/toggleHelp` | ja |
| `ui/hud.js` | 392 | lang | HUD DOM-refs, leaderboard, gap, sector panel, tire dots, mini-map, popups, fmtTime | globals + `window.fmtTime` | ja |
| `ui/input.js` | 92 | kort | keydown/keyup hotkeys, HW-keyboard detection, Shift+P procedural-audio toggle | globals | ja |
| `ui/navigation.js` | 114 | middel | `goToTitle/goToSelect/goToWorldSelect/goToRace/rebuildWorld` | globals | ja |
| `ui/pause.js` | 39 | kort | Pause + mute toggles | globals `togglePause/toggleMute` | ja |
| `ui/select.js` | 512 | lang | Car-select scherm + preview + unlock-hints + summary | globals | ja |
| `ui/touch.js` | 115 | middel | Touch-controls, wake-lock, haptics | globals | ja |

### Assets (`js/assets/`)

| Pad | Regels | Cat. | Wat | Exposed | Strict |
|---|---|---|---|---|---|
| `assets/loader.js` | 360 | lang | GLTF/HDRI/texture preloader + `window.Assets` namespace + `_preloadWorld` (note: dezelfde naam als die in `audio/samples.js` — beide overschrijven elkaar als ze tegelijk laden) | `window.Assets` | ja |

### Root

| Pad | Regels | Cat. | Wat | Exposed | Strict |
|---|---|---|---|---|---|
| `js/config.js` | 22 | kort | TOTAL_LAPS, TW, BARRIER_OFF, RECOVER_DIST, WARN_DIST, DIFF_MULT, GRIP_BONUS_ZONES, CAR_COLOR_PRESETS | global cross-script | ja |
| `js/main.js` | 242 | middel | Top-level globals declaratie + roep `boot()` aan | globals | ja |

## 5. Werelden

8 werelden in `data/tracks.json` (waypoint-counts tussen haakjes).

| Wereld | Bestand | Waypoints | Unieke elementen | Lap-progressive hazard? |
|---|---|---|---|---|
| Grand Prix | `worlds/grandprix.js` | 19 | DRS-zone (detection + activation paint), tyre-barriers, water-puddles (3 stuks, grip-loss), GP track props | **nee** (DRS + water puddles zijn statisch / cooldown-based) |
| Space (Cosmic Circuit) | `worlds/space.js` | 17 | gravity zones, orbiting asteroids, warp tunnels, planets, nebula, asteroids, space orbs, space station, space gate, gravity wells, railguns, UFOs, meteor system, tractor beams, gravity-anomaly hazards | **nee** |
| Deep Sea | `worlds/deepsea.js` | 18 | sea floor, coral reefs, kelp, shipwreck, submarine station, sea gate, bioluminescent edges, jellyfish, sea creatures, bubbles, light rays, current streams, abyss cracks, treasure trail | **nee** |
| Candy (Sugar Rush) | `worlds/candy.js` (+ `candy-chocobridge.js`) | 17 | candy ground/sky, lollipop trees, candy canes, chocolate river, gum-drop mountains, cake building, candy gate, sprinkle particles, cotton-candy clouds, rainbow track stripes, candy barriers, ice-cream cones, cookie spectators, **chocobridge** | **ja** (chocolate-fountain bridge: lap1=glossy, lap2=drips/sag, lap3=alternating tilt+sag) |
| Neon City | `worlds/neoncity.js` | 16 | neon ground, skyscrapers, holo-billboards, neon barriers, tunnel, flyover, waterfront, street lamps, particles, sky-glow, night objects, EMP zones (TODO niet ge-wired), holo-walls (TODO niet ge-wired) | **nee** (signature audio aanwezig — enige wereld met music-stems) |
| Volcano | `worlds/volcano.js` (+ `volcano-bridge.js`) | 18 | volcano environment + **collapsing lava bridge** (lava-pool, geysers, deck panels, camera-shake) | **ja** (lava bridge: lap1=cool deck, lap2=cracks glow, lap3=alternating tilt 35°) |
| Arctic | `worlds/arctic.js` (+ `arctic-iceshelf.js`) | 16 | arctic environment + **cracking ice shelf** | **ja** (ice shelf is per-lap progressive — geverifieerd via grep "currentLap") |
| Themepark | `worlds/themepark.js` (+ `themepark-coaster.js`) | 17 | themepark environment + **collapsing overhead coaster bridge** | **ja** (coaster bridge is per-lap progressive — geverifieerd via grep "currentLap") |

Worlds met dedicated lap-progressive hazard bridge: **4 / 8** (candy, volcano, arctic, themepark).
Worlds zonder dedicated bridge: **4 / 8** (grandprix, space, deepsea, neoncity).

## 6. Globals

Lijst is gebaseerd op grep `window.X = ` in `js/`. Niet uitputtend (sommige globals worden in `main.js` als `var X` gedeclareerd zonder expliciete `window.X = ` toewijzing).

### State globals (mutable runtime state)
- `activeWorld`, `audioCtx`, `bestLapTime`, `difficulty`, `totalScore`
- `_coins`, `_totalCoinsEarned`, `_lastRaceCoins`, `_savedHS`, `_savedBL`
- `_raceCount`, `_podiumCount`, `_lapRecords`, `_trackRecords`, `_speedTrapAllTime`
- `_leaderExpanded`, `_musicMuted`, `_musicDuck`, `_forceProceduralAudio`
- `titleMusic`, `selectMusic`, `musicSched`
- `_isMobile`, `_isTablet`, `_isIPadLike`, `_isTouch` (set in `core/device.js`)
- `_headlightMats`, `_sampleEngine`

### Function globals (ES-module → window bridges of cross-script handlers)
- Music: `MusicLib`, `TitleMusic`, `SelectMusic`, `RaceMusic`, `StemRaceMusic`, `_createRaceMusicForWorld`, `_createStemRaceMusicIfReady`, `_safeStartMusic`, `_fadeOutMusic`, `_applyMusicGain`, `_ensureMusicMaster`, `_playCountdownRoll`, `_musicDebug`, `startTitleMusic`, `startSelectMusic`, `NF`
- Samples: `_preloadWorld`, `_preloadEngine`, `_preloadSFX`, `_preloadAmbient`, `_preloadSurface`, `_preloadSurfacesForWorld`, `_hasMusicStems`, `_hasEngineSamples`, `_hasSFXSample`, `_hasSurfaceSample`, `_hasAmbientSample`, `_getReadyBuffers`, `_getEngineBuffers`, `_getSFXBuffer`, `_getSurfaceBuffer`, `_getAmbientBuffer`, `_getCurrentSurface`, `_samplesDebug`
- Sample-engine: `SampleEngine`, `_createSampleEngineForCarType`
- Audio facade: `Audio`, `_assetBridge`, `Assets`
- Persistence: `loadPersistent`, `savePersistent`, `awardCoins`, `buyCar`, `buyWorld`, `checkUnlocks`, `showUnlockToast`, `showUnlocks`, `updateTitleHighScore`, `recordLapTime`
- UI: `showPerf`, `hidePerf`, `togglePerf`, `showHelp`, `hideHelp`, `toggleHelp`, `fmtTime`
- Cars: `BRAND_BUILDERS`, `buildBugattiChiron`, `buildLamborghiniHuracan`, `buildFordMustang`, `buildTeslaModelS`, `buildKoenigseggJesko`, `addPart`, `buildAllWheels`, `buildExhausts`, `buildHeadlights`, `buildTaillights`, `buildSideSkirts`, `buildSideVents`, `buildWheelArches`, `buildWheel`, `getSharedCarMats`, `disposeSharedCarMats`, `makePaintMats`, `syncHeadlights`
- Asset-bridge: `spawnGLTFProp`, `spawnRoadsideProps`, `spawnGroundClutter`, `maybeUpgradeWorld`
- Misc: `dbg`, `_dbgViewer`, `_updateDebugBadge`, `ThreeCompat`

### Config globals (manifests / constants)
- `MUSIC_MANIFEST`, `ENGINE_MANIFEST`, `SFX_MANIFEST`, `SURFACE_MANIFEST`, `AMBIENT_MANIFEST`, `WORLD_DEFAULT_SURFACE`
- `CAR_UNLOCK_RULES`, `WORLD_UNLOCK_THRESHOLDS`
- `CAR_PRICES`, `WORLD_PRICES`, `CAR_DEFS`, `_TRACKS`, `TRACK_WP`
- (Niet expliciet via `window.X=` maar via cross-script `let`/`const`): `TOTAL_LAPS`, `TW`, `BARRIER_OFF`, `RECOVER_DIST`, `WARN_DIST`, `DIFF_MULT`, `GRIP_BONUS_ZONES`, `CAR_COLOR_PRESETS`

### Scripts die meeste globals zetten
- `js/audio/samples.js` (manifests + 17 dispatch-functies)
- `js/audio/music.js` (alle music-subsysteem-bridges)
- `js/cars/brands.js` + `js/cars/car-parts.js` (build-functies)
- `js/persistence/save.js` + `progression.js`

### Geconsumeerd in
- Bijna elke gameplay-/world-/UI-file leest globals; main.js en boot.js zijn de "nutsschuren".
- Audio facade `Audio` (in `js/audio/api.js`) wordt door alle gameplay-modules gebruikt voor SFX/music-events.

## 7. Audio-systeem

### Sample-slots gedefinieerd in `js/audio/samples.js`

| Categorie | Slots | Aantal slots |
|---|---|---|
| Music (per wereld × 6 stems) | `intro`, `base`, `mid`, `lead`, `finalLap`, `nitroFx` × 8 werelden | 48 totaal (alleen `neoncity` heeft URLs ingevuld; rest is `{}`) |
| Engine (per car-type) | `super`, `f1`, `muscle`, `electric` (elk leeg `{}`) | 4 buckets, 0 banden gevuld |
| SFX | `brake`, `drift1`, `drift2`, `drift3`, `suspension`, `windHigh`, `impactLight`, `impactHard`, `glassScatter` | 9 |
| Surface | `asphalt`, `sand`, `ice`, `water`, `metal`, `dirt` | 6 |
| Ambient | `thunder1`, `thunder2`, `thunder3`, `crowdCheer`, `crowdLoop`, `windLoop` | 6 |

### Daadwerkelijk aanwezige sample-bestanden

- `assets/audio/music/neoncity/` is de **enige** wereld waarvan music-stems gedefinieerd zijn in het manifest. De directory bevat echter alleen `.gitkeep` — er staan **0 audio-bestanden**.
- `assets/audio/engine/` — leeg.
- `assets/audio/sfx/` — leeg.
- Geen `assets/audio/ambient/` of `assets/audio/surface/` directories aanwezig.

**Conclusie:** alle audio valt op dit moment terug op procedural. Manifest bevat URLs maar die files bestaan niet op disk. `samples.js` faalt graceful (returns `null`).

### Wereld-specifieke ambient events
Alleen geïmplementeerd:
- `playThunder()` + `updateThunder()` — globaal weather-driven (regen/storm)
- `initCrowdNoise()` / `updateCrowdNoise()` / `stopCrowdNoise()` / `playCrowdCheer()` — gekoppeld aan grandprix-spectators
- `startAmbientWind()` / `stopAmbientWind()` — generiek (volume gemoduleerd door night-cycle)

Per-wereld ambient events bestaan **niet** als aparte dispatch-functies. De `WORLD_DEFAULT_SURFACE` map koppelt elke wereld wel aan een tire-surface (asphalt/sand/ice/water/metal), maar de surface-loops zijn niet aanwezig op disk.

### Procedural fallback paden
- Music: `MusicLib` + `RaceMusic` in `audio/music.js` (944 regels) — volledig synth-based
- Engine: 4-osc synth in `audio/engine.js`
- SFX: alle `play*Sound()` in `audio/sfx.js` zijn synth-based
- Ambient: thunder + crowd + wind allemaal synth in `audio/ambient.js`

### Toggle
- Shift+P forceert procedural pad ook als samples geladen zijn (`window._forceProceduralAudio`). Mid-race music-switch wordt gerespecteerd via `_fadeOutMusic` + dispatcher restart.

## 8. Debug & dev tooling

### `dbg`-channels in gebruik

Alleen channels die daadwerkelijk geadresseerd worden in `dbg.log/warn/error/snapshot()` aanroepen (excl. `core/debug.js` zelf):

| Channel | Waar gebruikt |
|---|---|
| `boot` | `core/boot.js` (load + init failures) |
| `cars` | error-paden in cars-builders |
| `countdown` | `gameplay/countdown.js` |
| `pause` | `ui/pause.js` |
| `persist` | `persistence/save.js` (private-mode etc.) |
| `renderer` | `core/renderer.js` |
| `scene` | `core/scene.js` (incl. snapshot) |
| `three-compat` | `core/three-compat.js` |
| `asset-bridge` | `effects/asset-bridge.js` |
| `assets` | `assets/loader.js` |
| `env` | environment / world-builders |
| `audio` | `audio/*` warn-paden |
| `music` | `audio/music.js` |

### LocalStorage keys
Direct gebruikt in code:
- `src_debug` — enable dbg-logger
- `src_debug_channels` — comma-separated channel filter
- `src_world` — last-selected world
- `src_night` — night-mode toggle (`'0'` of `'1'`)
- `src_weather` — saved weather mode
- `src_fx` — FX toggle

Persistence-payload (in `persistence/save.js`):
- `spencerRC` — single JSON-blob met coins, unlocks, records, etc.

Andere zoekers in code: `'pause'`, `'persist'` worden aangetroffen maar zijn channel-namen, geen LS-keys.

### Debug URL params
- `?debug` — activeert `dbg.enabled` + visual badge overlay (camera/renderer state) (zie `core/debug.js` regels 26 en 229)

### Keyboard shortcuts
Verzameld uit `js/ui/input.js`, `js/ui/help.js`, `js/core/perf.js`, `js/core/debug.js`, `js/core/boot.js`:

| Shortcut | Actie |
|---|---|
| Space / Esc / P | Toggle pause (in race) |
| M | Toggle mute |
| F3 | Toggle FPS-overlay |
| C | Cycle camera (chase / heli / hood / bumper) |
| V | Toggle rear-mirror |
| L | Toggle leaderboard expanded/compact |
| H | Pit-stop trigger (op main-straight) |
| Shift+P | Toggle procedural-audio (A/B) |
| Ctrl+Shift+P | Toggle perf-overlay |
| Ctrl+Shift+E | Open error-viewer overlay |
| Enter (op title) | → car-select |
| `?` (helpscherm) | Toggle help-overlay |

## 9. Performance-relevante cijfers

- **Draw calls / triangle count**: niet runtime gemeten (er is een `perf-overlay` (Ctrl+Shift+P) die `renderer.info.render.calls` en `triangles` toont, maar dit document is een statische audit zonder browser-instantie). Schatting op basis van scene-builder traversals voor Grand Prix:
  - `track/environment.js` (1054 regels) bouwt: ground, clouds, barriers, gantry, mountains, lake, gravel, environment-trees, night-objects, spectators, sun-billboard, advertising boards, corner boards, track-flags. ~165 grep-hits van `scene.add`/`new THREE.Mesh`/`InstancedMesh` over `worlds/grandprix.js` + `track/environment.js`.
  - InstancedMesh wordt gebruikt voor herhaalde props; exacte aantallen kunnen alleen in browser geverifieerd worden.
- **Mobile-fallback paden**: bestanden waar `_isMobile` / `_isTablet` / `_isTouch` wordt geraadpleegd (gevonden via grep):
  - `js/core/device.js` (declaratie)
  - `js/core/scene.js`, `js/core/renderer.js`, `js/core/loop.js`, `js/core/debug.js`
  - `js/effects/weather.js`, `js/effects/postfx.js`
  - `js/assets/loader.js`
  - `js/audio/music.js`
  - `js/cars/build.js`, `js/cars/car-parts.js`
  - `js/track/environment.js`
  - `js/gameplay/camera.js`
  - `js/ui/hud.js`
  - Worlds: `arctic.js`, `neoncity.js`, `space.js`, `themepark.js`, `themepark-coaster.js`, `volcano.js`
- Worlds zonder mobile-pad in eigen bestand (per grep): `grandprix`, `deepsea`, `candy`, `volcano-bridge`, `arctic-iceshelf`, `candy-chocobridge`. Mobile-tuning daar zit grotendeels via `_mobCount()` in `core/device.js` wat door `track/environment.js` wordt aangeroepen.
- **Quality scaling**: `js/core/loop.js` heeft dynamic quality-scaling logica (FPS-meting in 1s moving avg).

## 10. Branches & laatste werk

```
$ git branch -a
* claude/codebase-audit-document-6bvSD
  master
  remotes/origin/claude/codebase-audit-document-6bvSD
  remotes/origin/master
```

```
$ git log --oneline -20
b4afd92 Merge pull request #37 from properams/claude/asset-rich-wiring
8c65e94 feat(visuals): multi-variant prop slots + per-world dispatcher enrichment
06ad44b Merge pull request #36 from properams/claude/inbox-sort-batch-1
4a7c7be feat(assets): sort inbox into nature/city/space folders + wire manifest
b0469de Add files via upload
8008fc9 Add files via upload
c8323bd Add files via upload
f6ccf0e Add files via upload
e526813 Add files via upload
2dadf82 Add files via upload
86734f5 Add files via upload
831f118 Merge pull request #34 from properams/claude/improve-track-visuals-9f5pm
b7eb990 Merge remote-tracking branch 'origin/master' into claude/improve-track-visuals-9f5pm
f34cd89 chore(assets): add _inbox drop zone for raw asset uploads
ea2c405 docs(assets): fix broken GLTF pack URLs — verified Quaternius/KayKit/Kenney/poly.pizza
5253ce1 docs(assets): add Poly Haven download script + per-world model recommendations
088720f Merge pull request #33 from properams/claude/mobile-car-selector-rvkO0
5d49753 Merge pull request #32 from properams/claude/fix-mobile-layout-rmM4f
a3810df Merge pull request #31 from properams/claude/fix-mobile-pause-button-XnTZR
b0418cb Merge pull request #30 from properams/claude/improve-track-visuals-9f5pm
```

## 11. Open TODOs / FIXMEs

Letterlijk uit grep `TODO|FIXME|HACK|XXX` over `js/`, `index.html`, `css/`:

- `js/worlds/neoncity.js:499` — `// TODO niet ge-wired: deze EMP-zones (3 stuks) en buildNeonHoloWalls`
- `js/track/environment.js:329` — `// TODO niet ge-wired: pit-gebouw builder (~45 regels) is gedefinieerd maar`

(Geen FIXME / HACK / XXX gevonden.)

## 12. Bekende afwijkingen van CLAUDE.md

> **Observatie:** er is **geen `CLAUDE.md`** in repo-root. De prompt verwijst er wel naar maar het bestand bestaat niet. De volgende observaties zijn dus afgemeten tegen conventies die in andere bestanden (header-comments) als "the way" worden beschreven.

### Bestanden zonder `'use strict'`
70 .js bestanden in `js/`, **63** hebben `'use strict'`, **7** niet — allemaal de ES-modules:
- `js/persistence/save.js`
- `js/persistence/progression.js`
- `js/audio/music.js`
- `js/audio/samples.js`
- `js/audio/api.js`
- `js/audio/music-stems.js`
- `js/audio/engine-samples.js`

(ES modules zijn al impliciet strict, dus dit is geen bug — alleen een observatie.)

### Plekken waar errors via `console.error` / `console.warn` lopen i.p.v. `dbg`
11 hits in totaal, waarvan een aantal in fallback-paden (when `window.dbg` not yet ready):

- `js/assets/loader.js:40` — `_warn(...)` heeft fallback naar `console.warn` als `window.dbg` ontbreekt
- `js/audio/api.js:130` — `console.warn('[Audio.play3D] niet geïmplementeerd (fallback)')` (geen dbg-fallback)
- `js/audio/music.js:52` — `console.warn('[music] start failed:',e.message)` (geen dbg-fallback)
- `js/gameplay/countdown.js:43,49,54` — bevat dbg-fallback patroon (`window.dbg ? dbg.error(...) : console.error(...)`)
- `js/core/boot.js:125,136,155` — idem dbg-fallback patroon
- `js/core/debug.js:66,71` — interne implementatie van `dbg.warn` / `dbg.error`, dus correct

Pure `console.error/warn` zonder dbg-fallback: `audio/api.js:130`, `audio/music.js:52`. Deze bypassen de error-ringbuffer.

### Externe assets vs. canvas-procedureel
De codebase mengt:
- **Procedural** scenes in `worlds/*.js` + `track/environment.js` (volledig Three.js geometry)
- **Externe GLTF/GLB-assets** via `assets/manifest.json` + `js/assets/loader.js` + `js/effects/asset-bridge.js` (`spawnGLTFProp`, `spawnRoadsideProps`, `spawnGroundClutter`)
- **Externe HDRI** envMap-paden in `manifest.json` (maar de `assets/hdri/` directory is **leeg**)
- **Externe textures** in `manifest.json` (maar `assets/textures/` is **leeg** behalve `.gitkeep`)

Alleen `assets/models/` bevat daadwerkelijk files. Het manifest verwijst naar HDRI's en textures die niet aanwezig zijn — `loader.js` zal deze graceful overslaan (wereld bouwt door op procedural).

### Plekken zonder mobile-fallback waar je 'm zou verwachten
- `js/worlds/space.js` heeft mobile-fallbacks; `js/worlds/deepsea.js` heeft géén lokale `_isMobile` references in eigen bestand (mobile-tuning loopt via `core/device.js` `_mobCount()` aanroepen vanuit `track/environment.js`).
- `js/effects/visuals.js` (504 regels, drift/nitro/boost/rev-limiter) — geen `_isMobile` references gevonden in dit bestand.

### Overige observaties
- Two distinct `_preloadWorld` functies bestaan: één in `js/audio/samples.js` (audio preloader) en één in `js/assets/loader.js` exposed via `window.Assets.preloadWorld(...)`. De call site in `core/boot.js` regel 147 gebruikt `window.Assets.preloadWorld`. De audio-versie zet `window._preloadWorld` direct. Niet zelfde naam maar wel naamsoverlap die verwarrend kan zijn.
- `index.html` regel 366 vermeldt nog "Three.js r134" in een commentaarblok, terwijl de inline Three blob volgens de andere comments r160 is.
- `js/main.js` heeft veel "ge-extracteerd naar X" comments die historische refactor-stappen documenteren (Fase 2.x). Dit is informatief, niet abnormaal.
- `index.html` heeft een eigen `console.error` interceptor (regel 35-43) die errors in een rode overlay toont — los van het `dbg`-systeem.

---

_Gegenereerd op 2026-04-29._
















