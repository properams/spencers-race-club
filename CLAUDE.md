# CLAUDE.md — Spencer's Race Club

Project-conventies voor Claude Code sessies. Lees dit aan het begin van elke sessie.

## Architectuur in één alinea

Single HTML entry (`index.html`) met inline Three.js r160 blob. Geen build-tools, geen bundler, geen `package.json` — pure static HTML + JS, browser-only. Code in `js/` is een **mix** van non-module scripts (meerderheid, ~63 bestanden, gedeeld via global script scope) en een handvol ES modules (`js/persistence/*`, `js/audio/*` met uitzondering van `engine.js`/`sfx.js`/`ambient.js`). ES modules exposen hun API via `window.*` zodat non-module scripts erbij kunnen. State wordt cross-module gedeeld via `window.*` globals; `js/main.js` declareert top-level globals en roept `boot()` aan op het eind. Bootstrap zit in `js/core/boot.js`. Mobile fallbacks via `_isMobile` / `_isTablet` / `_isIPadLike` / `_isTouch` flags uit `js/core/device.js`.

## Harde conventies (niet afwijken zonder reden)

### Code-stijl
- Non-module scripts: `'use strict'` aan de top (63 / 70 .js-bestanden hebben dit)
- ES modules: impliciet strict, geen statement nodig
- Globals worden gezet via `window.X = ...` (niet via top-level `var X` zonder window-prefix, behalve in `main.js` waar dat bewust gebeurt)

### State
- State leeft in de consumer module die 'm gebruikt — niet in een gedeeld state-object
- Cross-module state via `window.*` globals, gegroepeerd per subsysteem (zie PROJECT_STATE.md sectie 6)
- `js/main.js` is de "nutsschuur" voor top-level state-declaraties

### Errors
- Errors gaan via `dbg.log/warn/error/snapshot()` in `core/debug.js`
- `console.error` / `console.warn` alleen in fallback-paden waar `window.dbg` mogelijk nog niet bestaat (bv. tijdens boot)
- Patroon: `if (window.dbg) dbg.warn('channel', ...); else console.warn(...);` (zie `core/boot.js:125,136,155` en `gameplay/countdown.js:43,49,54`)
- Pure `console.error` / `console.warn` zonder dbg-fallback omzeilt de error-ringbuffer en is een bug
- `index.html` heeft een eigen `console.error` interceptor (rode overlay) — los van het dbg-systeem

### Disposal
- Scenes opgebouwd via `buildScene()` (in `core/scene.js`) worden volledig vrijgegeven in `disposeScene()`
- Texture/geometry/material disposal: elke `new THREE.X()` moet matching `.dispose()` hebben bij world-switch
- Shared materials uit `getSharedCarMats()` mogen niet per-car ge-disposed worden (gebruik `disposeSharedCarMats()` op het juiste moment)

### Mobile
- Performance-zware paden krijgen een `if (_isMobile)` fallback
- Pixel ratio gecapt in `core/renderer.js`, antialias uit, shadow maps uit op mobile
- `_mobCount(n)` in `core/device.js` schaalt iteratie-counts voor mobile (gebruikt o.a. door `track/environment.js`)
- iOS-specifieke gesture-blockers in `core/boot.js`

## Audio-systeem

- **Procedural blijft de fallback. Samples zijn additief.**
- Sample-slots in `js/audio/samples.js` mogen leeg zijn — `_has*()` returns false dan, en de procedural pad neemt het over
- Op dit moment valt **alle** audio terug op procedural (manifest verwijst naar files die niet op disk staan; `samples.js` faalt graceful)
- Nieuwe audio-events worden eerst procedural geïmplementeerd in `audio/sfx.js` of `audio/music.js`, daarna eventueel sample-versie toegevoegd
- Shift+P forceert procedural pad ook als samples geladen zijn — gebruik dit voor A/B vergelijking

## Werelden

- 8 werelden, elk een eigen builder in `js/worlds/`
- Per-wereld extras (zoals lap-progressive bridges) in een eigen `js/worlds/<wereld>-<extra>.js` bestand (zie `candy-chocobridge.js`, `volcano-bridge.js`, `arctic-iceshelf.js`, `themepark-coaster.js`)
- Gemeenschappelijke environment-elementen in `js/track/environment.js` (1054 regels, alle reusable builders)
- World-builders volgen een vergelijkbare structuur (skybox setup → ground → barriers → props → lights). Houd dat aan.

## Debug-tooling (al aanwezig — gebruiken!)

- `?debug` in URL of `localStorage.src_debug='1'` activeert dbg-logger + visual badge overlay
- `localStorage.src_debug_channels='boot,scene,...'` filtert per channel (zie PROJECT_STATE.md sectie 8 voor lijst)
- `?` toetst opent help-overlay
- `Ctrl+Shift+E` opent error viewer (50-entry ringbuffer)
- `Ctrl+Shift+P` opent performance overlay (FPS, draws, triangles, heap)
- `Shift+P` toggle procedural ↔ sample audio (A/B vergelijking)
- `F3` toggle FPS-overlay

## Workflow

- Branches: `claude/<onderwerp>-<5char-suffix>` of `cleanup/<onderwerp>` voor poets-werk
- Commits per logische unit, niet per file
- Aan het eind van een sessie: één devlog-entry in standaard format (zie WERKWIJZE pagina in Notion)

## Patronen die wél in deze codebase passen

- Naam-collisions tussen modules vermijden
- Lap-progressive hazards: pattern staat 4× in worlds (`candy-chocobridge`, `volcano-bridge`, `arctic-iceshelf`, `themepark-coaster`) — gebruik deze als referentie voor nieuwe hazards
- World-builders volgen vergelijkbare structuur (zie boven)
- Reusable car-parts builders in `cars/car-parts.js` + per-brand body builders in `cars/brands.js`
- `dbg.log/warn/error` met channel-name als eerste argument
- `_mobCount()` voor scaled iteratie-counts op mobile

## Patronen die NIET in deze codebase passen

- Build-tools introduceren (Vite, Webpack, etc.)
- Bundlers, transpilers, TypeScript
- Externe runtime dependencies via npm
- Een centraal state-object in plaats van consumer-state
- `console.error` / `console.warn` zonder dbg-fallback in productie-paden
- Top-level `var X` zonder `window.X = ` (behalve in `main.js`)

## Bij twijfel

- Check eerst of een vergelijkbaar patroon al bestaat in de codebase, en kopieer dat
- Als je iets nieuws bedenkt: vraag eerst om bevestiging voordat je 't bouwt
- `PROJECT_STATE.md` is de feitelijke referentie van hoe de codebase er nu uitziet
