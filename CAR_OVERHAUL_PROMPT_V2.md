# Car Visual Overhaul — Procedural Quality Pass (V2, r134-corrected)

**Goal:** Bring all 12 cars in Spencer's Race Club up to the visual quality of the post-visual-overhaul / post-audio-overhaul / post-refactor worlds. Cars currently feel blocky and flat compared to the worlds they drive through.

This is a **procedural quality pass** — we are NOT swapping to GLB models. We are leveraging the existing builders in `js/cars/brands.js` and `js/cars/car-parts.js` and pushing them as far as r134 capabilities allow.

This prompt is grounded in `CARS_INVENTORY.md` (in repo root). Every reference here matches actual function signatures and line numbers in that document.

---

## Phase 0 source-verification findings (carried over from V1 review)

The V1 prompt assumed Three.js r160. Phase 0 verification proved this wrong:

| Claim in V1 | Reality (verified) |
|---|---|
| Three.js r160 | **Actually r134** (`assets/loader.js:30` → `three@0.134.0`). r160-upgrade was rolled back in commit 2989b1f per `core/three-compat.js:5-8`. CLAUDE.md is also incorrect on this point. |
| `iridescence` available | **NOT available** on r134 (added in r135). Phase 1.4 must be deferred. |
| `clearcoat` / `clearcoatRoughness` available | ✓ Available on r134 (since r118). |
| `transmission` / `ior` / `thickness` available | ✓ Available on r134 (since r119). |
| `sheen` API | r134 has the OLD single-value API. New split API is r136+. Not used in this overhaul. |
| `scene.environment` is populated at runtime | **NOT populated.** No `.hdr` or `.exr` files on disk. No HDRI manifest. `applyHDRI()` always returns false in current state. → **Phase 1.0 must add a procedural envMap.** |
| `js/ui/select.js` is 512 lines | Actually 1195 lines. (No scope impact.) |

**Key consequences for this V2:**

1. **Add Phase 1.0** (procedural envMap fallback) before Phase 1.1, so clearcoat has reflections to sample.
2. **Replace Phase 1.4** (iridescent flake) with a deferred-until-r135 stub. Keep the `makePaintMats(def, opts)` signature change so the call sites are r135-ready, but treat `opts.flake` as a no-op on r134.

---

## Hard rules (unchanged from V1)

1. No invented integration points. If a discrepancy with the source is found, STOP and report.
2. No GLB. No build tools. No module migration. `'use strict'` + `window.*` globals stay.
3. Three.js r134 — verify r134 capabilities via `ThreeCompat` if anything looks off.
4. Mobile fallback non-negotiable. `_isMobile` / `carLOD()='low'` paths stay roughly as fast as today.
5. Physics is untouchable. Per inventory §4, physics only reads `mesh.userData.wheels`. Body-subgroup introduction is allowed in Phase 2 as long as that array stays intact.
6. Disposal hygiene. New shared materials/textures get `_sharedAsset = true`. Disposal is added to `disposeSharedCarMats()`.
7. Errors via `dbg.error('cars', ...)` with `console.*` fallback.
8. One car at a time, then parallel. Bugatti is the pilot.
9. Source-verify before integrating each phase.
10. No new files unless explicitly requested.

---

## Phase 0 — Source verification & baseline

**0.1** Verification report (DONE — see findings table above).

**0.2** Capture baseline screenshots BEFORE making any changes, per inventory §5: 5 combos × 3 angles (day, night, 3/4 rear) = 15 screenshots minimum. Save under `docs/car-overhaul/before/`. **User-driven** — Claude cannot run a browser.

**0.3** Runtime sanity test (1 lap Bugatti @ Grand Prix, no console errors, no `dbg.error` ringbuffer entries). **User-driven**.

**Acceptance:** 0.1 done, 0.2/0.3 deferred to user. Phase 1.0–1.3 may proceed under explicit blanket approval (see V1's rules; user gave approval for V2).

---

## Phase 1.0 — Procedural envMap (NEW, was missing in V1)

**Why:** `MeshPhysicalMaterial.clearcoat` without an envMap renders darker than the same paint without clearcoat. Adding an envMap is a hard prerequisite for Phase 1.1.

### 1.0.1 Add `_buildProceduralEnvMap()` to `core/scene.js`

- Build a small (~512×256) gradient canvas (light blue top → warm horizon → dim ground).
- Wrap as `EquirectangularReflectionMapping` `CanvasTexture`.
- Process via `THREE.PMREMGenerator` to produce a cubemap (the same path `assets/loader.js:127` uses for real HDRI).
- Cache as module-level singleton `_proceduralEnv`. Flag the resulting texture `userData._sharedAsset = true` so `disposeScene` skips it.
- Build once, reuse forever — same env across all 8 worlds (worlds get their own scene.background; only scene.environment is the procedural one).

### 1.0.2 Wire it into `buildScene()`

After `scene = new THREE.Scene()` (currently `core/scene.js:408`), set `scene.environment = _buildProceduralEnvMap()`. The existing `maybeUpgradeWorld()` call (line 562) will overwrite scene.environment if a real HDRI ever lands; until then, procedural is the active env.

**Acceptance for Phase 1.0:**
- Scene has a non-null `scene.environment` after buildScene.
- No regression on worlds without HDRI files (i.e. all of them today).
- Heap delta from PMREM cubemap: ~5MB once, never reallocated.

---

## Phase 1.1 — Paint material upgrade (was V1 1.1)

### Upgrade `makePaintMats(def, opts)` in `car-parts.js`

Current (verified):
- Returns `{paint, accent}`.
- Desktop paint: `MeshStandardMaterial`, `metalness: 0.65, roughness: 0.22, envMapIntensity: 0.85`.
- Mobile paint: `MeshPhongMaterial`, `shininess: 120`.

Target:
- Signature changes from `makePaintMats(def)` to `makePaintMats(def, opts)`. Default `opts = {}`. `opts.flake` is reserved for future r135+ iridescence work; currently a no-op (no flake).
- Desktop: `MeshPhysicalMaterial` with `metalness: 0.85, roughness: 0.30, clearcoat: 1.0, clearcoatRoughness: 0.05, envMapIntensity: 1.0`. `userData._carPBR = true` preserved.
- Desktop accent: same upgrade pattern, but `clearcoat: 0.6, clearcoatRoughness: 0.10`.
- Mobile: unchanged (`MeshPhongMaterial` for paint, `MeshLambertMaterial` for accent).

**Acceptance:** all 12 cars rebuild on desktop with new materials. Bugatti / Ferrari / Tesla on Grand Prix at noon visibly more "wet/glossy". Mobile unchanged. No FPS regression. No new ringbuffer entries.

---

## Phase 1.2 — Carbon-fiber shared material (was V1 1.2)

Add a `carbon` entry to `getSharedCarMats()`:

- Desktop: `MeshPhysicalMaterial`, `color: 0x141416, metalness: 0.4, roughness: 0.55, clearcoat: 0.8, clearcoatRoughness: 0.25, envMapIntensity: 0.85`.
- Mobile: `MeshLambertMaterial`, `color: 0x141416`.
- Procedural diffuse map via 256×256 `CanvasTexture` (carbon-weave checkerboard with diagonal gradient cells). Built once, cached as `_carbonTex` module-level singleton. Flagged `_sharedAsset = true`.

**Note from V1:** V1 specified "normal map", which on r134 requires careful encoding. For r134 simplicity we ship as a diffuse `map` instead — the visible weave + clearcoat highlights gives the "carbon trim" read without the normal-map complexity. `roughnessMap` was considered; diffuse `map` reads more obviously as "carbon". Documented this trade-off here so future r135 migration knows to consider the normal-map upgrade.

Add to `disposeSharedCarMats()` cleanup: dispose `_carbonTex` (the diffuse map) alongside the material.

`matBlk` and `blk` stay unchanged. `carbon` is opt-in for individual builders in Phase 3.

---

## Phase 1.3 — Chrome material upgrade (was V1 1.3)

Current `chrome`: `MeshStandardMaterial, metalness: 1.0, roughness: 0.18, envMapIntensity: 1.0`.

Target: `MeshPhysicalMaterial, metalness: 1.0, roughness: 0.10, clearcoat: 0.5, clearcoatRoughness: 0.05, envMapIntensity: 1.0`. Mobile fallback unchanged.

---

## Phase 1.4 — DEFERRED (iridescent paint flake)

Cut from V2. `MeshPhysicalMaterial.iridescence` is not available on r134. Will be re-added when the codebase migrates to r135+ per the migration checklist in `core/three-compat.js`.

The `makePaintMats(def, opts)` signature change in Phase 1.1 keeps the call sites r135-ready: when `iridescence` becomes available, `opts.flake = true` can be activated for Tier S cars without touching builders.

---

## Phase 2 — Pilot: Bugatti Chiron geometry refinement

(Unchanged from V1. Read V1 §Phase 2 for full detail.)

Key items: body-subgroup introduction (verify night.js children-traversal at `effects/night.js:195` is filtered by `userData.isHeadBeam` — confirmed safe), `LatheGeometry`/`ExtrudeGeometry` for hood/roof crown, premium headlights helper, drilled brake disc, chrome trim, underbody glow.

**Wait for user sign-off + screenshots before Phase 2.**

---

## Phase 3 — Parallel rollout to remaining 11 cars

(Unchanged from V1. Read V1 §Phase 3 for full detail.)

Tier S/A/B/C/F1 grouping. Per-car: read, identify patterns, implement, screenshot, verify ringbuffer. Run reviewers (`code-quality-reviewer`, `code-reuse-reviewer`, `efficiency-reviewer`, `performance-budget-reviewer`) every 3 cars.

**Wait for sign-off after pilot, do NOT auto-proceed from Phase 2 → Phase 3.**

---

## Phase 4 — Polish & final acceptance

(Unchanged from V1.)

Headlight beam check, night-mode intensity sweep, CHANGES.md entry, perf budget verification, final screenshots.

---

## Failure modes (V2 additions to V1 list)

- **Procedural env build fails (Phase 1.0).** PMREM compile can throw if WebGL state is bad. Wrap in try/catch, log via `dbg.error('scene', ...)`, fall through to no-env (cars regress to V1 look — not worse than today, just no clearcoat win). Don't crash buildScene.
- **`_carbonTex` leak.** Carbon diffuse map is a 256×256 CanvasTexture. Must be flagged `_sharedAsset` AND disposed in `disposeSharedCarMats()`. Verify with the disposal-test (5× world switch).
- **Paint material clearcoat looks DULL at night.** Procedural env is sun-day-tone. At night, the real HDRI would be dim. We don't have HDRI, so the env is always day-tone. This may make night cars look slightly off. If user reports, we can build a second night-env in Phase 4.

---

## Out of scope (unchanged from V1)

GLB import, customization UI, animated body parts, AI changes, audio changes, car-select preview redesign.

---

## V2 deliverable

Same as V1 §Final deliverable (`CAR_OVERHAUL_DONE.md` in repo root, with screenshots and perf delta). Add: explicit r134 limitations note + the deferred-iridescence backlog item.
