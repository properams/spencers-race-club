# PATTERNS.md

> Documents the established patterns of Spencer's Race Club. Each entry
> covers when to apply, how (with concrete file references), an example
> from the codebase, and the anti-patterns / pitfalls to avoid.
>
> Cross-reference: [`PROJECT_STATE.md`](PROJECT_STATE.md) section 2 for
> the at-a-glance roster.

Last updated: 2026-05-06

---

## P1 — World implementation rhythm (V1-V4)

**One-line.** Build a polished new world across four bounded sessions,
not one mega-session.

**When to apply.** Any new world from scratch. Cinematic conversions
of existing worlds may compress the rhythm but should still split
work across bounded commits.

**How.**

- V1 — Boot / bugfix. Track waypoints validated, world registered
  in `data/tracks.json` + `WORLD_TRACK_PALETTE`, world-builder file
  exists with skybox + lighting, scene loads without crashes. Bones
  only.
- V2 — Visual identity. Skybox refined, day-lighting helper added
  (see P3), basic props placed, color palette settled.
- V3 — Collision and gameplay. Soft-wall track-edge collision
  active (see P9), off-track popup, props verified not on track,
  surface-specific friction.
- V4 — Density and polish. Stratified prop spawn (see P2), final
  density tuning, signature element (e.g. lap-progressive hazard),
  night mode + PMREM cache (see P4).

**Example.** Sandstorm Canyon was built across four phases of mega-
prompts plus a perf-cleanup pass — eleven-plus commits visible in git
history (`sandstorm phase 2` through `sandstorm phase 6`). The result
is the reference quality bar for new worlds.

**Anti-patterns.**

- One-shot mega-prompt that tries to do V1+V2+V3+V4 in a single
  session. Outcomes have been visibly worse and harder to roll back.
- Skipping V3 because "it works" — soft-wall collision is the
  difference between feeling and not-feeling on tracks with edges
  near props.

---

## P2 — Stratified t-spawn for even prop distribution

**One-line.** Replace `Math.random()` t-position with
`((i+random())/count)%1` to prevent clumping and bare patches along
the track.

**When to apply.** Any prop loop that scatters N items along the
track curve. Trees, rocks, lampposts, decorative props — anywhere
the eye notices clusters or gaps.

**How.**

```js
for (let i = 0; i < count; i++){
  const t = ((i + Math.random()) / count) % 1;
  const p = trackCurve.getPoint(t);
  // ... place prop at p
}
```

The integer slot `i / count` gives even spacing; the random offset
within `[0, 1)` adds organic variation without breaking the spacing
guarantee.

**Examples in the codebase.**

- `js/worlds/sandstorm.js:1358` — `const t=((i+Math.random())/count)%1;`
- `js/worlds/candy.js:177` — variation with explicit jitter:
  `((i+0.5+(Math.random()-0.5)*0.4)/count)%1`

**Anti-patterns.**

- `Math.random()` alone for t — produces visible clumps and gaps
  ("it's random, but it doesn't *feel* random").
- `(i / count)` without random offset — too uniform, reads as
  obviously procedural.

---

## P3 — Per-world day-lighting helper

**One-line.** Single source of truth for a world's day-lighting
values, called from both build-time and the day-toggle in
`js/effects/night.js`.

**When to apply.** Any world that needs to restore its day-state
when the user toggles back from night. Without the helper, build-time
constants and toggle-time constants drift apart over time.

**How.**

In `js/worlds/<world>.js`:

```js
function _applyXxxDayLighting(){
  if (!sunLight || !ambientLight || !hemiLight) return;
  sunLight.color.setHex(0x...);
  sunLight.intensity = window._isMobile ? <mob> : <desk>;
  ambientLight.color.setHex(0x...); ambientLight.intensity = <n>;
  hemiLight.color.setHex(0x...);
  hemiLight.groundColor.setHex(0x...);
  hemiLight.intensity = <n>;
}
if (typeof window !== 'undefined') window._applyXxxDayLighting = _applyXxxDayLighting;
```

The world's `buildXxxEnvironment()` calls `_applyXxxDayLighting()`
at build time. The day-branch in `js/effects/night.js` calls
`window._applyXxxDayLighting()` when `isDark` flips back to false.

**Examples in the codebase.**

Seven worlds currently have day-lighting helpers:

- `js/worlds/sandstorm.js` — `_applySandstormDayLighting`
- `js/worlds/candy.js` — `_applyCandyDayLighting`
- `js/worlds/volcano.js` — `_applyVolcanoDayLighting`
- `js/worlds/arctic.js` — `_applyArcticDayLighting`
- `js/worlds/themepark.js` — `_applyThemeparkDayLighting`
- `js/worlds/pier47.js` — `_applyPier47DayLighting`
- `js/core/scene.js` — `_applyGrandPrixDayLighting` (legacy fallback)

**Anti-patterns.**

- Inline lighting constants in `night.js` day-branch. Constants
  drift from build-time over months of polish work.
- Helper that reads `activeWorld` and branches internally — turns
  it into a switch-statement that grows per world.

---

## P4 — PMREM env-cache for M-toggle

**One-line.** On day↔night toggle, bake the skybox + PMREM
environment once and cache module-level; subsequent toggles do
reference-swap only.

**When to apply.** Any world that swaps skybox texture on day↔night
toggle (which is most of them). The PMREM bake is expensive
(~5-15ms desktop, 30+ms mobile per press) — cached, it's free.

**How.**

In `js/effects/night.js`, declare module-level cache vars:

```js
let _xxxNightBg=null, _xxxNightEnv=null;
let _xxxDayBg=null, _xxxDayEnv=null;
```

In the world's branch of `toggleNight()`:

```js
if (isDark){
  if (!_xxxDayBg) _xxxDayBg = scene.background;
  if (!_xxxDayEnv) _xxxDayEnv = scene.environment;
  if (!_xxxNightBg && typeof makeXxxNightSkyTex === 'function'){
    const baked = _bakeNightEnv(makeXxxNightSkyTex);
    _xxxNightBg = baked.bg; _xxxNightEnv = baked.env;
  }
  if (_xxxNightBg) scene.background = _xxxNightBg;
  if (_xxxNightEnv) scene.environment = _xxxNightEnv;
} else {
  if (_xxxDayBg) scene.background = _xxxDayBg;
  if (_xxxDayEnv) scene.environment = _xxxDayEnv;
}
```

Cleanup: a per-world `_disposeXxxSkyCache()` function called from
the world's dispose path drops the cache before the next `buildScene`
allocates fresh textures.

**Examples in the codebase.**

`js/effects/night.js:23-33` — module-level cache declarations for
sandstorm, volcano, arctic, neoncity, candy, themepark, grandprix.
The shared `_bakeNightEnv(skyboxBuilder)` helper at line 46
encapsulates the bake-and-PMREM pipeline.

**Anti-patterns.**

- Re-baking on every M-press. Visible hitch on rapid toggles,
  especially on mobile.
- Forgetting the dispose hook. Each world-switch leaks the cached
  textures until the page reloads.

---

## P5 — Per-commit pushing for rollback safety

**One-line.** Push every commit immediately after it lands; never
batch.

**When to apply.** Always. Especially for sessions with multiple
sequential commits — by the time the third commit goes wrong,
having the first two already pushed means a clean rollback to the
last known good push.

**How.**

After each commit:

```sh
git push
```

No batching, no end-of-session "now I'll push everything". Each
commit gets a green light from the syntax sweep, then pushes.

**Anti-patterns.**

- "I'll push at the end". Means a single bad commit at the end of
  a session blocks the entire session's worth of good work.
- Force-pushing batched commits to a shared branch.

---

## P6 — Autonomy protocol

**One-line.** Bounded autonomous decision-making with explicit stop
criteria — make progress over perfection.

**When to apply.** Any session where the developer is hands-off and
will review at the end.

**How.**

The agent has the mandate to make autonomous decisions on:

- Naming conventions (files, functions, variables, constants)
- Color choices within an established palette range
- Specific positions of props
- Performance trade-offs within a budget
- Implementation patterns (sprites vs meshes, instanced vs separate)
- Which parameters in helpers become configurable
- File organisation and module structure
- Commit-message exact wording

**Stop criteria.** Confirmation is requested only when:

- A commit would change more than ~100 lines in a critical file in
  a way that could break other worlds
- A choice would fundamentally contradict the architectural
  assumptions of the prompt
- A bug is discovered in another world's code where permission to
  fix is unclear

In all other cases: choose, do, document, continue.

**Anti-patterns.**

- Asking for confirmation on every minor decision (turns the
  session into ping-pong).
- Going silent on big decisions and presenting them as fait
  accompli without documenting them in the handover.

---

## P7 — Handover protocol

**One-line.** Single mobile-friendly copy-paste block at the end of
every session — sections A-L, no nested code blocks.

**When to apply.** End of every session. The block is the input for
the next planning step.

**How.** See [`SESSION_HANDOVER_TEMPLATE.md`](SESSION_HANDOVER_TEMPLATE.md)
for the full structure. Key constraints:

- One outer markdown code block (so mobile select-all works in one
  gesture)
- No nested triple-backtick fences inside (use tildes `~~~` for
  inner code blocks if needed)
- Header `===== SESSION HANDOVER — KOPIEER DIT NAAR CLAUDE CHAT =====`
- Footer `===== EINDE HANDOVER =====`
- Bullets with `-` not `*`
- No tabs

**Anti-patterns.**

- Multi-block summaries split across normal markdown — mobile
  select-all picks up only the first block.
- Skipping the open-questions section and surfacing problems only
  in chat ("by the way, I had to choose X, hope that's OK").

---

## P8 — Config-driven shared helpers

**One-line.** Helpers in shared modules take options objects with
sensible defaults — no hardcoded world-specific values inside
shared code.

**When to apply.** Any helper that will plausibly be reused by a
second world. If the second use-case is hypothetical, write the
helper for the first use-case but don't bake in world-specific
constants — pass them as options.

**How.**

```js
function buildXxxThing(scene, opts){
  const o = opts || {};
  const color    = (o.color != null) ? o.color : <default>;
  const size     = (o.size != null) ? o.size : <default>;
  const mobile   = (o.mobile !== false);  // default true
  // ... build using o.* + sensible defaults
}
```

Mobile guards live **inside** the helper (`window._isMobile` or an
explicit `opts.mobile`), not at call sites — consumer worlds don't
have to remember to wrap calls.

**Example in the codebase.**

`js/effects/cinematic.js` — every helper
(`buildCinematicGroundFog`, `buildCinematicLightPole`,
`buildCinematicVolumetricLightCone`, `buildCinematicBlinkingMarker`,
`applyCinematicCameraShake`) takes an options object with documented
defaults. The first consumer (Pier 47) passes its specific palette;
future cinematic worlds will compose differently with their own
palettes.

**Anti-patterns.**

- Hardcoded `0xff8830` (Pier 47's amber) inside a "shared" helper —
  the next cinematic world has to fork the helper.
- Reading `activeWorld` inside a shared helper — turns the helper
  into a per-world switch statement.
- Mobile guards at call sites instead of inside helpers — every
  consumer has to remember the convention.

---

## P9 — Soft-wall track-edge collision

**One-line.** Position push + brake penalty when off-track, never a
hard stop — feels like firm resistance, not a brick wall.

**When to apply.** Any world with a defined track edge. Skipped on
void worlds (`space`, `deepsea`) which have intentional fall-into-void
mechanics.

**How.** Implementation in `js/gameplay/wall-collision.js`:

- Wall edge at `TW + 4` units from the curve (TW is half-track-width
  global, currently 13)
- Overshoot capped at 5u/frame so a glitch-teleport doesn't snap the
  car visibly
- Position push of `0.4 × overshoot` per frame toward the curve
- Brake factor `max(0.55, 1 - overshoot × 0.06)` — light grazes barely
  slow you, full-speed wall-impact halves speed quickly
- Per-car contact cooldown for FX (sparks + cam-shake)
- Mobile AI-stagger to match the loop's mobile cadence

```js
const overshoot = Math.min(offDist - wallEdge, 5);
const nx = -dx / offDist, nz = -dz / offDist;
pos.x += nx * overshoot * 0.4;
pos.z += nz * overshoot * 0.4;
const brake = Math.max(0.55, 1.0 - overshoot * 0.06);
car.speed *= brake;
```

**Anti-patterns.**

- Hard stop on contact (`car.speed = 0`) — feels broken and breaks
  AI pathing.
- No cooldown on FX — spark spam every frame while the player grazes.
- Forgetting to skip void worlds — pushes the car back toward the
  curve where the void physics expected to take over.

---

## P10 — `WORLD_TRACK_PALETTE` table-lookup

**One-line.** Centralized per-world track colors with a defensive
`gp` fallback for unknown worlds.

**When to apply.** Any per-world color decision in the track build
pipeline (asphalt, kerb stripes, kerb emissive, gantry accent).

**How.** Single table in `js/track/track.js:66`. Schema per entry:

```js
{
  asphalt: <hex>,
  kerbA: [r,g,b],          // alternating curb stripe color A
  kerbB: [r,g,b],          // alternating curb stripe color B
  kerbEmissive: <hex>,
  kerbEmissiveInt: <0..1>,
  gantryAccent: <hex>,
  gantryEmissive: <hex>
}
```

Lookup pattern:

```js
const palette = WORLD_TRACK_PALETTE[activeWorld] || WORLD_TRACK_PALETTE.gp;
```

The `gp` fallback keeps a future unknown world from crashing the
track build.

**Adding a new world** is a one-line addition to the table.

**Anti-patterns.**

- Inline ternary chains: `activeWorld === 'space' ? 0x14 :
  activeWorld === 'deepsea' ? 0x1a : ...`. Adding a ninth world
  meant patching multiple call sites. The current table replaced
  four such ternary chains.
- Lookup without fallback. The first time a typo leaks
  `activeWorld === 'volcanos'`, the track build crashes.

---

## P11 — `_isVoidWorld()` helper

**One-line.** Centralized check for worlds with intentional fall-into-
void mechanics (`space` and `deepsea`).

**When to apply.** Any code path that asks "is this a world where
the player can fall off the track into a void?". Off-track friction,
soft-wall collision skip, ground-plane skip, recovery-circle behavior.

**How.** In `js/core/scene.js:46`:

```js
function _isVoidWorld(world){
  return world === 'space' || world === 'deepsea';
}
```

Callers:

```js
if (_isVoidWorld(activeWorld)) return;       // skip
if (!_isVoidWorld(activeWorld)) <do thing>;  // gate
```

**Anti-patterns.**

- Inline `activeWorld === 'space' || activeWorld === 'deepsea'` —
  was duplicated 8+ times across the codebase before extraction.
- Using `_isVoidWorld` for checks that look similar but have
  different semantics. If a future check needs to also exclude one
  of these worlds for an unrelated reason, give that check its own
  helper rather than overloading this one.

---

## P12 — InstancedMesh for identical meshes

**One-line.** For 6+ identical meshes (palms, lampposts, columns,
flagpoles), use InstancedMesh instead of separate meshes.

**When to apply.** Any cluster of meshes that share geometry +
material. Variation via `setMatrixAt(i, matrix)` per instance gives
free position / rotation / scale variation.

**How.**

```js
const geo = new THREE.BoxGeometry(...);
const mat = new THREE.MeshLambertMaterial({...});
const im = new THREE.InstancedMesh(geo, mat, count);
const dummy = new THREE.Object3D();
for (let i = 0; i < count; i++){
  dummy.position.set(x, y, z);
  dummy.rotation.y = ang;
  dummy.scale.setScalar(s);
  dummy.updateMatrix();
  im.setMatrixAt(i, dummy.matrix);
}
im.instanceMatrix.needsUpdate = true;
scene.add(im);
```

For per-instance color, allocate `im.instanceColor =
new THREE.InstancedBufferAttribute(new Float32Array(count*3), 3)`
and call `im.instanceColor.setXYZ(i, r, g, b)` per instance.

**Examples in the codebase.**

- `js/worlds/sandstorm.js:181` — talud rocks at the foot of canyon
  cliffs
- `js/worlds/sandstorm.js:673-683` — five InstancedMeshes for one
  pillar prop (base, shaft, echinus, abacus, ring)
- `js/worlds/candy.js` — lollipop pole consolidation (44 → 1
  draw call)

**Anti-patterns.**

- 44 separate `new THREE.Mesh(geo, mat)` for an identical lollipop
  prop. Each mesh is a draw call; mobile budget eats this fast.
- Using InstancedMesh when each instance needs a different material.
  Use per-instance color attribute if the variation is just color;
  otherwise stay with separate meshes.
- Forgetting `im.instanceMatrix.needsUpdate = true`. The instances
  silently render at the origin.
