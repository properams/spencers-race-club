# PROJECT_STATE.md

> Living document. Captures the current canonical state of Spencer's
> Race Club. Update at the end of any session that materially changes
> architecture, world list, pattern roster, or backlog.

Last updated: 2026-05-06

---

## 1. Vision and status

Spencer's Race Club is a browser-based 3D arcade racing game built on
Three.js, deployed via GitHub Pages. The game ships nine themed worlds
plus an experimental tenth world that introduces a new visual collection
("Cinematic"). It runs entirely in the browser with no build tools, no
bundler, no `package.json` — pure static HTML + JavaScript.

The project is a personal solo build. The single developer plays the
roles of builder, art director, playtester, and audio scaffolder. Design
tone is mature: atmospheric, moody, and ambitious where appropriate
rather than uniformly cheerful.

Status: **active development**. Recent direction is the introduction of
the Cinematic style (see worlds table) — a parallel collection of
moodier variants alongside the original worlds.

---

## 2. Active patterns

Cross-reference: see [`PATTERNS.md`](PATTERNS.md) for full per-pattern
documentation (when to apply, how, examples, anti-patterns).

| # | Pattern | One-line summary |
|---|---|---|
| P1 | World implementation rhythm (V1-V4) | Build a polished new world across four bounded sessions, not one mega-session |
| P2 | Stratified t-spawn | Replace `Math.random()` t-position with `((i+random())/count)%1` for even prop distribution |
| P3 | Per-world day-lighting helper | Single source of truth for day lighting per world — called from build-time and night.js day-toggle |
| P4 | PMREM env-cache for M-toggle | Cache day + night skybox + env on first toggle, swap by reference thereafter |
| P5 | Per-commit pushing | Push each commit immediately, never batch — enables per-commit rollback |
| P6 | Autonomy protocol | Bounded autonomous decision-making with explicit stop criteria |
| P7 | Handover protocol | Single mobile-friendly copy-paste block at end of every session |
| P8 | Config-driven shared helpers | Generic helpers in shared modules take options objects with sensible defaults |
| P9 | Soft-wall track-edge collision | Position push + brake penalty, not a hard stop |
| P10 | WORLD_TRACK_PALETTE table-lookup | Centralized per-world track colors with defensive `gp` fallback |
| P11 | `_isVoidWorld()` helper | Centralized check for `space` / `deepsea` (worlds with intentional fall-into-void mechanic) |
| P12 | InstancedMesh for identical meshes | Use InstancedMesh instead of separate meshes for any cluster of 6+ identical objects |

---

## 3. World status

Verified against `data/tracks.json` and `js/worlds/` directory at the
top-of-file timestamp.

| World | Key | Style | Status | Notes |
|---|---|---|---|---|
| Cosmic Circuit | `space` | Original | Stable | Void-world (no ground plane) |
| Deep Sea | `deepsea` | Original | Stable | Void-world; bioluminescent biome |
| Sugar Rush | `candy` | Original | Stable | Recently polished — pastel skybox + density + floating particles |
| Neon City | `neoncity` | Original | Stable | Cyberpunk biome with EMP zones |
| Volcano | `volcano` | Original | Stable | Lava rivers + geysers; bridge sub-module. Cinematic-collection candidate. |
| Arctic | `arctic` | Original | Stable | Aurora + iceberg + ice-shelf hazard. Cinematic-collection candidate. |
| Thrill Park | `themepark` | Original | Stable | Carousel + ferris wheel + coaster |
| Sandstorm Canyon | `sandstorm` | Original | Stable | Reference implementation for the V1-V4 rhythm. Rolling sandstorm hazard. |
| Pier 47 | `pier47` | Cinematic | Active development | First world in the Cinematic collection. Industrial harbour by night. Sessions 1 + 2 complete. |

**Removed**: a tenth world (Grand Prix) was removed in May 2026
(commit `1ba2c22`); only its palette fallback remains in
`WORLD_TRACK_PALETTE` for defensive lookup.

---

## 4. Technical stack

| Layer | Technology |
|---|---|
| Renderer | Three.js r160 (vendored at `assets/vendor/three-r160.min.js`) |
| Compat layer | `js/core/three-compat.js` — handles r134→r160 colorSpace + legacyLights deltas |
| Audio | Web Audio API (procedural synthesis; sample-based path scaffolded) |
| Scripting | Vanilla JS — mix of classic `<script>` files and a handful of ES modules (audio + persistence) |
| Build tools | None |
| Hosting | GitHub Pages |
| Mobile | Pixel ratio capped at 1.5; shadows off; `_mobCount()` halves prop counts |

Project layout:

```
index.html              Single-page entrypoint
js/
  core/                 Bootstrap, scene, renderer, loop, debug, perf
  worlds/               Per-world implementations (one file per world + sub-modules)
  track/                track.js (with WORLD_TRACK_PALETTE), ramps, collectibles
  effects/              night, postfx, weather, cinematic, particles, visuals
  cars/                 physics, build, AI, brands, parts
  gameplay/             collisions, wall-collision, race, finish, countdown, achievements
  audio/                engine + music + ambient + samples (mostly scaffolded)
  ui/                   HUD, select, pause, navigation, notifications, touch
  persistence/          save + progression (ES modules)
  assets/               loader (asset-bridge resolves manifest.json)
css/                    Six stylesheet modules
data/                   cars.json, tracks.json, prices.json
assets/                 manifest.json, models, textures, vendor, audio scaffolds
.claude/agents/         Workflow tooling (specialised reviewer agents)
```

---

## 5. Architecture decisions log

Cross-reference: see [`DECISIONS.md`](DECISIONS.md) for full ADR-light
entries (context, alternatives, consequences, status).

| # | Decision | Status |
|---|---|---|
| D1 | Modular `js/` structure (replaced monolithic `index.html`) | Active |
| D2 | Validate track waypoints via Python script | Active |
| D3 | Mobile-first object-count reduction (`_mobCount`, no shadows, 1.5× pixel cap) | Active |
| D4 | Sandstorm V1-V4 rhythm as world template | Active |
| D5 | `WORLD_TRACK_PALETTE` table replaces inline ternaries | Active |
| D6 | Cinematic collection as parallel to originals (suffix-based) | Active |
| D7 | Cinematic helpers in shared `js/effects/cinematic.js` | Active |
| D8 | World-select cinematic card via opt-in CSS class | Active |
| D9 | Autonomy protocol made explicit | Active |
| D10 | Handover protocol as required session output | Active |
| D11 | Persistent project docs (this file + PATTERNS + DECISIONS) | Active |

---

## 6. Backlog

Items captured from session retrospectives and recent direction. Loose
priority order; any item can be picked for the next session.

### High-value

- **Cinematic helper: `buildCinematicHeadlampPool`** — currently a stub
  in `js/effects/cinematic.js`. Implements wet-asphalt headlight pool
  on cars driving through cinematic worlds. Sits in
  `js/cars/build.js` territory which the foundation session deliberately
  did not touch.
- **First conversion of an original world to a Cinematic variant** —
  validates the foundation. Volcano-cinematic is the recommended first
  candidate (warmest emissive palette stress-tests the bloom path).
- **Real radial motion-blur pass in postfx** — current
  `applyCinematicMotionBlur` is bloom-multiplier-only. Needs a 5th
  render-target + composite shader rewrite. Postfx-dedicated session.
- **Pier 47 follow-up sessions (3 and 4)** — atmosphere refinements +
  optional wet-physics. Foundation is in place; sessions are smaller
  in scope than 1 + 2 were.

### Medium-value

- **Audio pass** — engine, music, SFX, ambient. Currently mostly
  scaffolded with procedural fallback paths. Deserves a dedicated session.
- **Tune cinematic foundation post-live-test** — likely candidates:
  lamp pool radius, bloom multiplier sweet spot, marker brightness vs
  distance, fog density. Small numeric tuning.
- **Cleanup stale tooling-references in code comments** — two
  comments (`js/core/debug.js`, `js/core/boot.js`) reference paths that
  no longer exist in this repo. Code is unaffected; comments are stale.
- **Public README polish** — current README is functional but minimal.
  Could grow with a screenshot, controls reference, world preview row.

### Low-value / speculative

- **Generalise `buildCinematicHorizonGlow`** — currently single-anchor
  city-glow sprite. Multi-anchor variant would unblock arctic-cinematic
  aurora-band glow.
- **Light pole `groundNormal` option** — for world variants that need
  poles on inclined terrain (e.g. volcano-cinematic on lava-rock
  inclines).
- **Adopt a `cinematic: true` flag in WORLDS config** — currently
  Cinematic-ness lives in CSS class + helper composition. Centralising
  via config flag would simplify card-styling logic.
- **Centralised WORLDS config object** — registration is currently
  spread across tracks.json, palette table, name lookups, surface
  defaults, bloom multipliers, and per-world branches in scene/night/
  loop. A single config object would unblock several other items.

---

## 7. Anti-backlog

Things deliberately **not** on the roadmap. Explicit non-goals so
they don't drift back in.

- **A1 — No frameworks.** Vanilla JS stays. No React / Vue / Svelte /
  Solid / etc.
- **A2 — No external runtime asset pipelines.** No bundlers, no npm
  runtime dependencies, no transpilers.
- **A3 — No scope creep within sessions.** Every session has explicit
  bounded scope — "ONLY this world, ONLY these files".
- **A4 — Audio postponed (intentional).** Audio deserves a dedicated
  session; not a side-effect of feature work.
- **A5 — No architecture work mixed into feature sessions.**
  Refactors are their own sessions.
- **A6 — No agents / multi-agent setups for now.** First persistent
  context (these docs); agent topology is later.
- **A7 — No hardcoded music/artist suggestions in code prompts.**
  Audio design lives outside code prompts until the audio session.
- **A8 — No quick hardcoding for one world.** Helpers are
  config-driven from the start; no one-world shortcuts that later
  become refactor debt.
- **A9 — No design constraints based on accessibility level alone.**
  Design tone may be mature, moody, ambitious as warranted.

---

## 8. Update protocol

This document is updated:

- At the end of any session that adds / removes a world
- When a new pattern is established (P-prefix entry in §2 +
  full entry in PATTERNS.md)
- When an architectural decision is made (D-prefix entry in §5 +
  full entry in DECISIONS.md)
- When backlog items are picked up or closed
- When the technical stack changes (Three.js version, new core lib)

Routine session work that doesn't change architecture, world list, or
pattern roster does **not** require an update — keep this document for
canonical state, not session log noise.
