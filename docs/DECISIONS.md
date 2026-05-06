# DECISIONS.md

> ADR-light entries for the architectural and process decisions that
> shape Spencer's Race Club. Each entry: date, context, decision,
> alternatives considered, consequences, status.
>
> Cross-reference: [`PROJECT_STATE.md`](PROJECT_STATE.md) section 5
> for the at-a-glance status table.

Last updated: 2026-05-06

---

## D1 — Modular `js/` structure (replaced monolithic `index.html`)

**Date.** Pre-2026-05 (predates the visible commit history snapshot).

**Status.** Active.

**Context.** The original implementation was a single-file `index.html`
of roughly 3,500 lines. As the world count grew past three or four,
locating world-specific code, isolating bugs, and reasoning about
cross-world helpers became increasingly painful.

**Decision.** Split runtime code into a modular `js/` directory tree
organised by concern:

- `js/core/` — bootstrap, scene, renderer, loop, debug, perf
- `js/worlds/` — per-world implementations
- `js/track/` — track build, ramps, collectibles
- `js/effects/` — night, postfx, weather, particles, cinematic
- `js/cars/` — physics, build, AI
- `js/gameplay/` — collisions, race, finish, achievements
- `js/audio/` — engine, music, ambient (mostly scaffolded)
- `js/ui/` — HUD, select, pause, navigation
- `js/persistence/` — save, progression (ES modules)

`index.html` becomes a thin shell that loads the modular scripts
in dependency order.

**Alternatives considered.**

- Keep monolithic. Rejected because per-world work was already
  starting to mean searching across multi-thousand-line spans for
  affected sites.
- Adopt a bundler (Vite, esbuild). Rejected — see D-implicit-no-build
  philosophy: vanilla JS + GitHub Pages with no build step is a
  hard constraint of the project.

**Consequences.**

- Per-world iteration is dramatically faster.
- Files are individually grep-able.
- Cross-script globals are still shared via classic `<script>`
  scope; ES modules are the exception (audio + persistence subsystems).
  This mix is documented in `js/main.js`.

---

## D2 — Validate track waypoints via Python script

**Date.** Pre-2026-05.

**Status.** Active.

**Context.** Several early worlds were committed with track-curve
defects that only became visible in playtesting:

- A 14-unit segment crossing in one world's polyline
- A 21-unit crossing in another
- A third world with a 140-unit closing gap and a 28-unit crossing

These produced unwanted intersections in the rendered ribbon and
edge cases in the off-track detection logic.

**Decision.** Every new world's waypoints get validated by a Python
script before commit. Validation rules:

- Closing gap (last waypoint → first waypoint) less than 80 units
- Minimum separation between adjacent waypoints greater than 35 units
- Maximum segment length less than 200 units
- No self-intersections (non-adjacent segment-segment crossings)

The boot path also runs a runtime validator
(`_validateTrackSchema()` in `js/core/boot.js`) that logs warnings
to the debug ringbuffer if any of these constraints are violated —
defence in depth against future regressions.

**Alternatives considered.**

- Visual inspection only. Rejected because the defects were small
  enough to pass casual review.
- A JS-side validator only. Rejected because the Python script can
  iterate quickly during waypoint design without page reload.

**Consequences.**

- No track-curve defects have shipped since the validator was
  introduced.
- Track design is slower (must run validator) but more reliable.

---

## D3 — Mobile-first object-count reduction

**Date.** Pre-2026-05.

**Status.** Active.

**Context.** Mobile is the hardest performance constraint for the
project. iPhone Safari with WebGL + a busy world drops FPS dramatically
when pushed past mid-tier desktop defaults.

**Decision.** Three layered mitigations:

- **`_mobCount(n)`** helper in `js/core/device.js` halves prop counts
  on mobile. World builders use `_mobCount(220)` instead of literal
  `220` for any iteratable visual.
- **Pixel ratio capped at 1.5** in `js/core/renderer.js` (vs.
  device-pixel-ratio default that can hit 3 or 4).
- **Shadows disabled on mobile** — `castShadow / receiveShadow` are
  skipped or no-op at the mobile-detect branch.

**Alternatives considered.**

- Per-device tuning matrix. Rejected — too many iOS variants to test
  individually.
- Quality slider in UI. Deferred — `_mobCount` covers the hot
  threshold automatically; explicit user-facing slider is later.

**Consequences.**

- Game is playable on mobile with ~30-60 FPS depending on world.
- Some visual richness is mobile-degraded (lamp counts, particle
  pools, prop densities).
- Hardware headroom remains for cinematic upgrades.

---

## D4 — Sandstorm V1-V4 rhythm as world template

**Date.** Sandstorm V1-V4 phases between 2026-05-05 and 2026-05-06.

**Status.** Active.

**Context.** Earlier worlds were built in single mega-prompts of
varying scope. Outcomes ranged from "good with rough edges" to
"shipped a regression that needed three follow-up commits". The
Sandstorm world was deliberately split across four phases, each
with bounded scope and its own commit chain.

**Decision.** Sandstorm V1-V4 is the canonical template for all
future worlds. Phase split:

- V1 — Boot / bugfix
- V2 — Visual identity
- V3 — Collision and gameplay
- V4 — Density and polish

See [`PATTERNS.md`](PATTERNS.md) P1 for the full prescription.

**Alternatives considered.**

- One mega-prompt per world. Rejected based on observed outcomes.
- Two-phase split (build + polish). Rejected — collision and density
  are different enough concerns that combining them produces noise.

**Consequences.**

- Pier 47 also uses a multi-session approach; sessions 1+2 follow
  the V1+V2 envelope.
- Sessions are smaller and individually rollback-able.
- Total time-per-world is similar; failure-cost-per-session is
  lower.

---

## D5 — `WORLD_TRACK_PALETTE` table replaces inline ternaries

**Date.** 2026-05-06 (commit `f92bf30` — refactor(track):
centralize per-world colors via WORLD_TRACK_PALETTE table).

**Status.** Active.

**Context.** Per-world track colors were spread across four separate
inline ternary chains (`buildTrack`, `buildCurbs`, `buildGantry`,
plus another). Adding a ninth world meant patching all four sites,
each with a slightly different fallback default.

**Decision.** Centralise in a single table at `js/track/track.js:66`:

```js
const WORLD_TRACK_PALETTE = {
  gp: { asphalt: 0x..., kerbA: [r,g,b], kerbB: [r,g,b], ... },
  space: { ... },
  // one entry per world
};
```

Lookup pattern: `WORLD_TRACK_PALETTE[activeWorld] ||
WORLD_TRACK_PALETTE.gp`. The `gp` fallback keeps unknown worlds from
crashing the track build.

**Alternatives considered.**

- Per-world config objects scattered across world files. Rejected —
  loses the "one place to see all colors" benefit.
- JSON file in `data/`. Rejected — these are render-time constants,
  not user-data.

**Consequences.**

- Adding a new world's track colors is a one-line addition.
- Net diff was -14 lines (4 ternary chains collapsed to 1 lookup).
- Same pattern is now used for `_BLOOM_WORLD_MUL` and
  `_OFFTRACK_WORLD_OVERRIDES` in `js/effects/postfx.js` and
  `js/cars/physics.js` respectively.

---

## D6 — Cinematic collection as parallel to originals

**Date.** 2026-05-06 (foundation commit `cb141d0` — feat(cinematic):
create reusable cinematic.js helpers + Pier 47 ground fog).

**Status.** Active.

**Context.** The Cinematic visual style (dark global lighting +
practical lights as heroes + atmospheric depth + silhouette
storytelling + cool palettes with warm accents) is a deliberate
counterpoint to the brighter original worlds. Two design questions:

1. Does the Cinematic style replace existing worlds, or coexist?
2. How is the distinction signalled in the codebase and UI?

**Decision.** Cinematic worlds are **parallel entries** alongside
existing originals, not replacements. Naming convention is the
suffix `-cinematic` for variants of existing worlds (e.g. a future
`volcano-cinematic`); standalone new worlds in the collection (like
Pier 47) keep clean keys and signal Cinematic-ness through:

- World-select card class `.cinematicCard` + `CINEMATIC` badge
- Explicit composition of `js/effects/cinematic.js` helpers in the
  world builder
- Tighter postfx values (lower bloom threshold, higher vignette)

**Alternatives considered.**

- Replace existing worlds with Cinematic versions. Rejected —
  preservation of the original brighter worlds is explicit goal.
- Style-toggle that swaps any world to its Cinematic variant at
  runtime. Rejected — multiplies QA surface and complicates
  per-world content.
- Suffix on every Cinematic world (including standalones). Rejected —
  Pier 47 has no original counterpart, so `pier47-cinematic` would
  be a redundant suffix.

**Consequences.**

- Codebase will grow more world entries over time, but the
  distinction is clear.
- Future Cinematic conversions (Volcano-cinematic, Arctic-cinematic,
  etc.) follow the suffix convention.

---

## D7 — Cinematic helpers in shared `js/effects/cinematic.js`

**Date.** 2026-05-06 (commit `cb141d0`).

**Status.** Active.

**Context.** First cinematic world (Pier 47) introduced six visual
effects: ground fog, sodium lamp poles with volumetric cones,
distant blinking markers, city-glow horizon, speed-scaled camera
shake, bloom enhancement. All six effects are intended for reuse
by future Cinematic worlds.

**Decision.** Generic effect helpers live in
`js/effects/cinematic.js`. World-specific implementations
(prop placement, palette pinning, count tuning) stay in
`js/worlds/<world>.js`.

Helpers are config-driven (P8) — every helper takes an options
object with sensible defaults. A future `volcano-cinematic` calls
the same helpers with `{ color: 0xff4422 }` instead of Pier 47's
`{ color: 0xff8830 }`.

**Alternatives considered.**

- Inline cinematic effects in `pier47.js`. Rejected — guarantees
  refactor work when the second cinematic world arrives.
- Per-effect files (`cinematic-fog.js`, `cinematic-lamp.js`).
  Rejected — six small files vs. one well-organised file is noise
  in the loader.

**Consequences.**

- First cinematic world is slightly more work (helper extraction
  upfront), every subsequent cinematic world is significantly
  cheaper.
- A central state registry (`_cinemaState`) in cinematic.js drains
  on world-switch — no per-effect cleanup boilerplate per world.

---

## D8 — World-select cinematic card via opt-in CSS class

**Date.** 2026-05-06 (commit `1dc833d` — feat(world-select):
cinematic card style for Pier 47 (B&W foundation)).

**Status.** Active.

**Context.** Cinematic worlds need visual distinction in the
world-select grid so the player can see "this is the cinematic
collection" at a glance.

**Decision.** Opt-in CSS class on the world card:

```html
<div class="worldBigCard cinematicCard" data-cinematic="1">
  ...
  <div class="cinematicBadge">CINEMATIC</div>
</div>
```

Styling defined once in `css/worlds.css` for `.worldBigCard.cinematicCard`:

- Filter desaturate + contrast bump (B&W silver-screen feel)
- White duotone border + black-inset shadow
- SVG-noise film-grain overlay (mix-blend-mode: overlay)
- Letter-spaced title with white outline glow
- Italic description
- Top-right CINEMATIC badge with white-bordered monospaced caps

Future cinematic worlds inherit the styling by adding the class +
badge HTML — no new CSS.

**Alternatives considered.**

- A `cinematic: true` flag in a centralised WORLDS config object.
  Rejected for now because that config object doesn't exist
  (registration is currently spread). Migration to a flag-based
  trigger is on the backlog.
- Per-world card styling. Rejected — defeats the "collection identity"
  goal.

**Consequences.**

- Adding a new cinematic world to the world-select grid is two
  lines of HTML.
- Card styling is theme-agnostic — the world's own
  `worldBg<World>` class supplies colour content; the cinematic
  layer adds the silver-screen treatment on top.

---

## D9 — Autonomy protocol made explicit

**Date.** 2026-05 (working-style preference, not tied to a single
commit).

**Status.** Active.

**Context.** Earlier sessions had a back-and-forth feel: agent asks
about a colour choice, owner answers, agent asks about a position,
owner answers, etc. Outcome was good but pace was too slow for
hands-off solo development.

**Decision.** The agent has explicit mandate to make autonomous
decisions on naming, colours within an established palette,
prop positions, performance trade-offs, implementation patterns,
configurability scope, file organisation, and commit-message
wording. Confirmation is requested only on three explicit stop
criteria: high-risk file changes, fundamental architectural
contradiction, or bugs in other worlds' code.

See [`PATTERNS.md`](PATTERNS.md) P6 for the full protocol.

**Alternatives considered.**

- Full autonomy with no stop criteria. Rejected — the three stop
  criteria catch the cases that genuinely benefit from a human in
  the loop.
- Tight check-in cadence (every commit asks). Rejected — that's
  the very pattern the protocol replaces.

**Consequences.**

- Sessions are faster. Multi-commit sessions complete without
  interruption.
- Some autonomous decisions are documented after the fact in the
  handover; owner reviews them at end-of-session.
- Quality requires the agent to actually reason about whether a
  decision crosses a stop threshold rather than defaulting to
  "ask anyway".

---

## D10 — Handover protocol as required session output

**Date.** 2026-05 (working-style preference).

**Status.** Active.

**Context.** Context-continuity between Claude Code sessions and
Claude chat sessions is expensive — without a handover, the chat
side has to re-read commits, retrace decisions, and reconstruct
context that the code side already had loaded.

**Decision.** Every session ends with a single mobile-friendly
copy-paste block in one outer markdown code fence (no nested
fences), structured into sections A-L:

A. Sessie identification
B. What was built (per-commit one-liners)
C. New helpers / files
D. Architecture state
E. Autonomous decisions made
F. What works well
G. What is complex / suboptimal
H. Skipped items
I. Recommendations for next session
J. Aanbevelingen voor de grotere collectie
K. Codebase observations
L. Open vragen voor eigenaar

See [`SESSION_HANDOVER_TEMPLATE.md`](SESSION_HANDOVER_TEMPLATE.md)
for the full template.

**Alternatives considered.**

- Free-form end-of-session message. Rejected — varied too much
  between sessions; the chat side always asked the same follow-ups.
- Multi-block summary. Rejected — mobile select-all picks up only
  the first block; rest gets dropped.

**Consequences.**

- Every session produces a self-contained handover.
- Subsequent sessions set up faster.
- Format constraint (no nested code blocks) enforces tildes `~~~`
  for any inner code blocks.

---

## D11 — Persistent project docs (`PROJECT_STATE`, `PATTERNS`, `DECISIONS`)

**Date.** 2026-05-06 (this docs commit chain).

**Status.** Active.

**Context.** Even with the handover protocol (D10), project state
that spans multiple sessions (the world list, the pattern roster,
the architecture decisions) was being reconstructed each time from
git log and chat memory. Both are imperfect references — git log
loses the "why", and chat memory drifts.

**Decision.** Three living documents in `docs/`:

- `PROJECT_STATE.md` — current canonical state (vision, world list,
  pattern roster, decision overview, backlog, anti-backlog)
- `PATTERNS.md` — full per-pattern documentation
- `DECISIONS.md` — full per-decision ADR-light entries (this file)

Plus a template:

- `SESSION_HANDOVER_TEMPLATE.md` — the canonical structure for
  end-of-session handover blocks (D10)

Update protocol: sessions that materially change the world list,
pattern roster, or architecture update the relevant doc. Routine
session work (a single bug fix, a single polish pass) does not.

**Alternatives considered.**

- Single `PROJECT.md` with everything. Rejected — `PATTERNS` and
  `DECISIONS` benefit from independent navigation; combined they'd
  be unwieldy.
- Living doc in the private workspace. Rejected for the public-facing
  parts (`PROJECT_STATE`, `PATTERNS`, `DECISIONS`) — these document
  technical conventions and are appropriate to share. Private
  workspace holds the dev-context that doesn't belong public.

**Consequences.**

- One-time investment in the doc set.
- Each subsequent session can start by reading these docs and skip
  reconstructing project state.
- Documents must be kept current — see "Update protocol" in
  PROJECT_STATE.md section 8.
