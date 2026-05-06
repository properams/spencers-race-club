# The Cinematic Pattern

> A reusable visual language for Spencer's Race Club. First implemented
> in Pier 47 Cinematic; designed to be applied to future
> `<world>-cinematic` variants without re-architecting per world.

## The five pillars

The cinematic style is built around five non-negotiables:

1. **Dark global lighting.** Ambient is low. The world lives off
   directional light sources. "Pools of light, not floods."
2. **Practical lights are heroes.** Sodium lamps, headlights, blinking
   warning lights, glowing windows — every visible light source creates
   visible drama.
3. **Atmospheric depth.** Ground fog, light cones cutting through mist,
   lens bloom on hot sources.
4. **Silhouette storytelling.** Distant geometry as black silhouettes
   against gradient skyline. Suggest, don't spell out.
5. **Cool palettes with warm accents.** Purple/blue base, orange/amber
   for practical lights.

This is the antithesis of Sugar Rush or Sandstorm-day. No saturation.
No flood lighting. The world feels like 03:00 with the engine running.

## File layout

| File | Role |
|------|------|
| `js/effects/cinematic.js` | All reusable helpers + state registry |
| `js/worlds/<world>.js`    | World-specific composition of helpers |
| `css/worlds.css`          | `.worldBigCard.cinematicCard` styling |
| `docs/CINEMATIC_PATTERN.md` | This document |
| `docs/SESSION_HANDOVER.md` | Per-sessie handover (overwritten each sessie) |

Generic helpers go in `cinematic.js`. World-specific placement (which
positions, which colour-pin, which prop counts) stays in the world file.

## Public helper API

All helpers are config-driven with sensible defaults. A future
volcano-cinematic gets the same architecture by passing
`{ color: 0xff4422 }` instead of pier47's amber.

### `buildCinematicGroundFog(scene, opts)`
Stacks 1-3 horizontal fog-wisp planes with slow scroll. Mobile auto-
clamps to 1 layer. Picks up `scene.fog` for distance fade.

```js
buildCinematicGroundFog(scene, {
  color: 0x2a1a30,        // hex tint
  density: 0.55,          // material opacity
  height: 4.5,            // base Y
  layerCount: 3,          // stacked layers (mobile clamps to 1)
  layerSpacing: 2.0,      // Y-spacing
  size: 900,              // plane W×D
  scrollDir: [1, 0.3],    // scroll vector
  scrollSpeed: 0.012,     // texture units per second
  fadeWithDistance: true
});
```

### `buildCinematicLightPole(scene, position, opts)`
Sodium-style pole composed of mast + arm + lamp head + PointLight +
volumetric cone + ground pool + halo. Sub-components opt-out via flags.

```js
buildCinematicLightPole(scene, new THREE.Vector3(px, 0, pz), {
  color: 0xff8830,
  intensity: 1.5,
  range: 26,
  height: 8.2,
  armLength: 1.4,
  poolRadius: 11,
  working: true,           // false = broken silhouette, no light
  tilt: 0,                 // radians, ±0.10 = subtle lean
  facingY: ang + Math.PI/2,
  castGroundPool: true,
  castVolumetricCone: true,
  castHalo: true
});
```

### `buildCinematicVolumetricLightCone(parent, opts)`
Open-ended tapered cylinder with vertical-gradient additive material.
Visible cone of light through fog. Usually invoked indirectly via
`buildCinematicLightPole`.

### `buildCinematicBlinkingMarker(scene, position, opts)`
Halo billboard + optional PointLight + pattern-driven brightness.
Patterns: `'solid'`, `'slow-pulse'` (0.5 Hz cosine), `'fast-pulse'`
(2 Hz), `'morse'` (long-short-long over interval). Set
`includeLight: false` for distant markers to avoid hitting the
forward-renderer light budget.

### `enableCinematicCameraShake(opts)` + `applyCinematicCameraShake(camera, speed01, cfg)`
Speed-scaled subtle camera-jitter on top of existing collision-shake.
Worlds register config at build via `enableCinematicCameraShake`;
`gameplay/camera.js` calls `applyCinematicCameraShake` per frame.

```js
enableCinematicCameraShake({
  intensityScale: 1.0,
  speedThreshold: 0.20,   // no shake idle
  maxOffset: 0.045        // ~0.05u offset at top speed
});
```

### `applyCinematicMotionBlur(postfx, intensity)`
Currently a route to the bloom-strength multiplier (`_BLOOM_WORLD_MUL`
in postfx.js). True radial blur requires a postfx pipeline rewrite —
documented as follow-up. Helper exists for API stability.

### `buildCinematicHeadlampPool(car, opts)`
**Stub** — wet-asphalt headlight ground-pool sits in `cars/build.js`
territory which the foundation sessie did not touch. Pick up in a future
sessie or skip if `cars/build.js` clearcoat already reads enough.

## Lifecycle hooks

- `updateCinematic(dt)` — central per-frame driver. Wired into
  `core/loop.js`. Drains `_cinemaState.groundFog`, `lightPoles`,
  `blinkingMarkers`. No-op when arrays empty.
- `resetCinematicState()` — empties the registries. Wired into
  `core/scene.js` per-world reset block.
- `disposeCinematicCaches()` — drains the procedural-tex caches
  (fog wisp, ground pool, halo, cone gradient). Same call site.

## How to make a new `<world>-cinematic` world

1. **Duplicate the world file** (`js/worlds/<world>.js` →
   `js/worlds/<world>-cinematic.js` if separate, or branch via
   `activeWorld === '<world>-cinematic'` if shared).
2. **In the environment builder, swap** the standard lighting/fog/
   props for cinematic helper calls. Pin the world's colour-tone
   via the `color` parameter on each helper:
   - Volcano: amber→`0xff4422` (red-orange lava warmth)
   - Sandstorm: amber→`0xffaa66` (warm dust glow)
   - Arctic: amber→`0x88c0ff` (cold blue moonlight)
3. **Lower global lighting**: ambient ≤0.20, sun ≤0.5, hemi ≤0.25.
   Practical lights take over.
4. **Add ground fog** with the world's tint. Density 0.4-0.6.
5. **Add 18-25 light poles** along the track curve. Vary working/
   broken/tilted at ~12% rates each.
6. **Add 3-5 distant markers** on horizon-silhouette positions.
   Mix patterns + colours.
7. **Add city-glow / volcano-glow / aurora-glow** sprite on horizon
   for the directional "civilisation/danger over there" cue.
8. **Register camera shake** via `enableCinematicCameraShake`.
9. **Register bloom multiplier** in `js/effects/postfx.js`
   `_BLOOM_WORLD_MUL.<world>-cinematic = 1.10..1.20`.
10. **World-select card**: add `cinematicCard` class +
    `<div class="cinematicBadge">CINEMATIC</div>` to the HTML card.
    Title gets the "CINEMATIC" suffix. The CSS pattern picks up the
    rest automatically.

## Performance budget

| Component        | Desktop draws | Mobile draws | Notes                           |
|------------------|---------------|--------------|---------------------------------|
| Ground fog       | 3             | 1            | Stacked planes, tex-shared      |
| Light poles      | ~6 per pole   | ~5 per pole  | Pole+arm+head+cone+pool+halo    |
| Markers          | 1-2 each      | 1-2 each     | Halo sprite (+ optional light)  |
| City-glow sprite | 1             | 1            | One additive sprite             |
| Camera shake     | 0             | 0            | Math only                       |
| Bloom mul        | 0             | n/a (mobile-off) | Existing pipeline only       |

Pier 47 totals: ~22 desktop pole-pairs × 6 draws = ~264 mesh draws
from poles alone. Acceptable on desktop. Mobile reduces to 14 pairs ×
5 draws = ~140 — still tight but within budget.

**Hard rule**: every helper has its own mobile guard. Callers don't
need to wrap calls in mobile checks.

## Mobile-considerations

- `_isMobile` flag drives auto-degradation inside each helper
- PointLights are expensive — prefer `includeLight: false` for distant
  markers and stagger lamp PointLights (every Nth pole) on mobile
- `MeshStandardMaterial` is desktop-only; helpers stick to Lambert/Basic
- Procedural canvas-tex caches are LRU + dispose-hooked

## Architecture invariants

These are enforced by the helper layer; do not break them in world
files:

1. **Config-driven, not hardcoded**: every helper takes opts. World
   files pass values; helpers don't read `activeWorld`.
2. **State registry, not callbacks**: helpers register effects in
   `_cinemaState`; `updateCinematic` drains. Avoids per-effect closures.
3. **Mobile guards inside helpers**: callers never wrap in
   `if (_isMobile)`.
4. **Disposal via existing pipeline**: helpers add to `scene` and let
   `disposeScene`'s traversal clean up. Caches drain via
   `disposeCinematicCaches`.
5. **Pier 47 is the reference world**: when in doubt, look at how
   `js/worlds/pier47.js` composes the helpers.
