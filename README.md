# Spencer's Race Club

A browser-based 3D arcade racing game with nine themed worlds — ride
through cosmic circuits, deep-sea reefs, candy hills, neon cityscapes,
volcanic deserts, arctic tundras, theme parks, sandstorm canyons, and
the rain-soaked harbour of Pier 47.

[**▶ Play in your browser**](https://properams.github.io/spencers-race-club/)

## Running locally

No build tools required. Clone the repo and serve it as static files:

```sh
git clone https://github.com/properams/spencers-race-club.git
cd spencers-race-club
python3 -m http.server 8080
# open http://localhost:8080/
```

Or just open `index.html` directly in a modern browser (Chrome, Safari,
Firefox). Some asset slots require an HTTP server to load via fetch —
the game falls back to procedural visuals if assets fail to load.

## Tech stack

- **Three.js r160** — vendored inline in `assets/vendor/`
- **Vanilla JS** — no bundler, no transpiler, no `package.json`
- Mix of classic `<script>` files and a handful of ES modules
  (audio + persistence)
- **Web Audio API** for procedural engine + music synthesis
- **CSS-only HUD** — no UI framework

The game runs entirely in the browser. Mobile support via touch
controls; auto-degrades effects on lower-end devices.

## Asset attribution

3D models are CC0 from Quaternius / Kenney / KayKit packs. Full
attribution and licence stamps in [`assets/CREDITS.md`](assets/CREDITS.md).

The asset pipeline is documented in [`assets/README.md`](assets/README.md)
— including how to drop in optional HDRI / PBR / model upgrades.

## Project layout

```
index.html      Entry point — single-file game shell
js/             Game source (~83 .js files)
  ├── core/      bootstrapping, scene, renderer, loop
  ├── worlds/    nine world builders (one per theme)
  ├── cars/      vehicle AI, physics, build pipeline
  ├── effects/   weather, post-fx, cinematic helpers
  ├── gameplay/  countdown, race, finish, achievements
  ├── audio/     procedural engine + music synthesis
  ├── ui/        HUD, select, pause, navigation
  └── assets/    asset loader (HDRI / GLTF / PBR)
css/            Six stylesheet modules
data/           cars.json, tracks.json, prices.json
assets/         Models, audio stubs, textures, CREDITS, manifest
.claude/agents/ Specialised reviewer agents (project workflow tooling)
```

## Status

Active development. Features land per-world via session-based commits
on `claude/*` feature branches; production deploys from `master`.

## Licence

Game code: see repository licence.
3D assets: each pack's CC0 / CC-BY licence applies as documented in
`assets/CREDITS.md`.
