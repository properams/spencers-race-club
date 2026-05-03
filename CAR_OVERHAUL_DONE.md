# Car Visual Overhaul — Done

Final deliverable for the procedural car visual quality pass on branch
`claude/document-cars-inventory-aADer`. Mirrors the format of
`CAR_SELECT_REDESIGN_DONE.md` and `SESSIE_HUD_REDESIGN_REPORT.md`.

---

## Diff stats

| File | Insertions | Deletions | Net |
|---|---:|---:|---:|
| `js/cars/brands.js` | +431 | -293 | +138 |
| `js/cars/car-parts.js` | +~200 | -~10 | +~190 |
| `js/core/scene.js` | +75 | -3 | +72 |
| `js/cars/build.js` | +12 | -8 | +4 |
| `js/ui/select.js` | +9 | -0 | +9 |
| `CARS_INVENTORY.md` | +658 | 0 | +658 (new) |
| `CAR_OVERHAUL_PROMPT_V2.md` | +192 | 0 | +192 (new) |
| `CHANGES.md` | +~140 | 0 | +~140 (entry appended) |

7 commits, all pushed to `origin/claude/document-cars-inventory-aADer`:

```
b849182 docs(cars): add CARS_INVENTORY.md
78d075a feat(cars): Phase 1 — clearcoat paint, carbon, chrome, procedural envMap
699375e fix(cars): _disposeMat checks all r134 MeshPhysicalMaterial texture slots
60da2a0 fix(cars): wire procedural envMap into car-select + boost env contrast
9718c7f feat(cars): Phase 2 pilot — Bugatti geometry + premium detail
ec833c0 chore(cars): userData merge-pattern in buildPremiumHeadlights lensMat
f714dc5 chore(cars): drop dead string-branch in Bugatti underglow accent parse
323143f feat(cars): Phase 3 rollout — premium pattern across remaining 11 cars
```

(Plus this `CAR_OVERHAUL_DONE.md` commit pending.)

## New helpers + signatures

### `js/core/scene.js`
- `_buildProceduralEnvMap()` — module-private, exposed via
  `window._buildProceduralEnvMap()`. Returns a singleton PMREM cubemap.
  ~5MB GPU once; survives world-switches via `_sharedAsset` flag.
- `_MAT_TEX_SLOTS` — 16-element array for `_disposeMat` slot iteration.

### `js/cars/car-parts.js`
- `_makeCarbonWeaveTex()` — singleton 256×256 procedural carbon-weave
  diffuse texture.
- `_crownedSlabGeo(width, height, depth)` — returns a `BufferGeometry`
  with 3×3 vertex grid where the top-face center is bumped up to suggest
  a subtle aerodynamic crown. Drop-in for flat `BoxGeometry` in
  hood/roof/engine cover.
- `buildPremiumHeadlights(group, mats, opts)` — emissive inner box +
  4-segment LED strip + transparent `MeshPhysicalMaterial` lens with
  `transmission:0.9, ior:1.4`. Mobile falls back to regular
  `buildHeadlights`.
- `buildWheel(group, x, y, z, radius, width, mats, lod)` — upgraded to
  read `group.userData._wheelOpts` for `brakeStyle: 'drilled'`
  (8-hole RingGeometry brake disc) and `caliperMatKey` (default
  `brakeRed`, premium tiers use `accent`).
- `makePaintMats(def, opts)` — signature change. `opts.flake` reserved
  for r135+ iridescence; currently no-op on r134.

### `js/cars/build.js`
- Underglow pattern generalized — `mesh.userData._signature.underglow`
  flag check replaces `def.brand === 'BUGATTI'` hardcode.

## Performance delta vs baseline

User-driven gates passed:
- Bugatti race lap clean — no console errors, no `dbg.error` ringbuffer
  entries, no FPS regression detected.
- Mobile spotcheck — cars look ~unchanged from pre-overhaul (low-LOD
  pad skips all premium features).
- Visual delta vs other cars — Tier S/A visibly distinct from Tier B/C/F1
  in car-select preview.

Not measured (deferred to follow-up if FPS issues surface):
- Shader-program count delta on desktop (MeshPhysicalMaterial > Standard;
  per-instance lens materials on Tier S/A).
- 5× world-switch heap-leak test (mentioned in V2 §Phase 0.3 but
  user-driven).

## Side-by-side before/after

User-driven (browser required for screenshots). The user reported the
Phase 1 material-only delta as "klein verschil" — small but visible on
the rounded sphere wheel-arches in the car-select preview. Phase 2/3
geometry work was where the visible distinctiveness materialised: Tier
S/A cars show drilled discs, accent calipers, chrome window-trim,
premium lens with LED strip, and player underglow halo — all absent on
Tier B/C/F1.

## Tier coverage matrix (what each car got)

| Car | Tier | Body-subgroup | Crown slabs | Premium HL | Chrome trim | Drilled disc | Underglow |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Bugatti Chiron | S/A | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (gold) |
| Ferrari SF90 | S/A | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (yellow) |
| Lamborghini Huracán | S/A | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (black) |
| Maserati MC20 | B | ✓ | ✓ | — | ✓ | — | — |
| Audi R8 | B | ✓ | ✓ | — | ✓ | — | — |
| Porsche GT3 RS | S/A | ✓ | ✓ | custom round + LED | ✓ | ✓ | ✓ (red) |
| McLaren P1 | S/A | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (black) |
| Koenigsegg Jesko | S/A | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (blue) |
| Red Bull RB F1 | F1 | ✓ (via `_buildF1Common`) | engine only | — | — | — | — |
| Mercedes W14 F1 | F1 | ✓ (via `_buildF1Common`) | engine only | — | — | — | — |
| Ford Mustang | C | ✓ | — | — | — | — | — |
| Tesla Model S | C | ✓ | — | — | — | — | — |

## Deferred / On-the-horizon backlog

- **r135+ migration** unlocks `MeshPhysicalMaterial.iridescence` for
  paintFlake on Tier S cars (Koenigsegg + McLaren). The
  `makePaintMats(def, opts)` signature already accepts `opts.flake` as a
  no-op; flipping it to active is a 1-line enable once `core/three-compat.js`
  flips to r135+.
- **Real HDRI** — `assets/loader.js` HDRI pipeline is wired but no
  `.hdr`/`.exr` files are on disk and no manifest references them.
  Adding even a single 1K studio HDRI would dramatically increase the
  clearcoat reflection definition. `effects/asset-bridge.js:applyHDRI()`
  takes over from procedural automatically.
- **Tesla glass roof transmission** — V2 spec called for full
  `MeshPhysicalMaterial.transmission` on the Tesla glassDark roof; trimmed
  for scope. Existing `glassDark` with Phase 1 clearcoat is sufficient
  for "panoramic glass" feel.
- **Mustang stripe-as-canvas-texture** — V2 called for replacing the 6
  separate stripe `BoxGeometry` meshes with a single `CanvasTexture` map
  on the paint material (8 → 2 mesh count win). Skipped — would require
  per-builder UV-coordinate bookkeeping that the current fragmented body-
  geometry doesn't support cleanly.
- **Carbon material adoption** — `mats.carbon` is registered in
  `_carShared` and disposable, but no builder calls it yet. Phase 3 was
  scope-trimmed to body-subgroup + crowned slabs; opt-in carbon for e.g.
  McLaren engine slats or Bugatti C-line accent dots could be a quick
  follow-up that uses the 256×256 weave texture's actual visual.
- **Shader-program perf measurement** — desktop FPS may regress with the
  PhysicalMaterial substitution. Run `Ctrl+Shift+P` (perf overlay) on a
  full 9-car grid before vs after; if regression > 5 FPS sustained,
  consider lowering `clearcoat` intensity or limiting Tier S features
  on lower-end desktops via a pixel-ratio heuristic.
- **r134 → r160 migration backlog** — separate workstream that unlocks
  iridescence + sheen API improvements + `userData._sharedAsset` semantics
  remain unchanged.
