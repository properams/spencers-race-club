// js/effects/cinematic.js — non-module script.
//
// Reusable visual helpers for the "Cinematic" worlds collection.
//
// The cinematic visual language is built around five pillars:
//   1. Dark global lighting (ambient is low — wereld leeft van gerichte
//      lichtbronnen: "pools of light, not floods")
//   2. Practical lights are heroes (natriumlamp, koplamp, knipperende
//      waarschuwingslichten, verlichte ramen)
//   3. Atmospheric depth (ground fog, light cones through mist, lens bloom)
//   4. Silhouette storytelling (verre objecten als zwarte silhouetten)
//   5. Cool palettes with warm accents (paars/blauw als basis,
//      oranje/amber als praktische lichtaccenten)
//
// First consumer: js/worlds/pier47.js. Future cinematic-suffixed worlds
// (volcano-cinematic, sandstorm-cinematic, arctic-cinematic, ...) will
// compose the same helpers with different palette/intensity options.
//
// All helpers are CONFIG-DRIVEN with sensible defaults — a future
// volcano-cinematic should be able to call buildCinematicLightPole({
// position, color: 0xff4422, intensity: 1.8 }) and get the same
// architectural pattern with red instead of amber.
//
// Public API (all functions exposed via window for non-module callers):
//   - buildCinematicGroundFog(scene, options)
//   - buildCinematicLightPole(scene, position, options)
//   - buildCinematicVolumetricLightCone(parentLight, options)
//   - buildCinematicBlinkingMarker(scene, position, options)
//   - buildCinematicHeadlampPool(car, options)            [stub — later commit]
//   - applyCinematicCameraShake(camera, speed, options)
//   - applyCinematicMotionBlur(postfx, intensity)
//
// Performance contract:
//   • Each helper has a `mobile` config-flag with sensible auto-degradation
//   • Default helpers should add ≤2 draw-calls per call on desktop
//   • No per-frame allocations in the update path (callers maintain refs)

'use strict';

// ── Module-private state ──────────────────────────────────────────────────
//
// Active world's installed cinematic refs — populated by builders, drained
// by disposeScene() before the next world build via the per-world reset
// block in core/scene.js. Helpers attach themselves to these arrays so a
// single dispose call cleans the lot.
const _cinemaState = {
  groundFog: [],         // [{mesh, scrollDir:[x,z], scrollSpeed}]
  lightPoles: [],        // [{group, working, flickerPhase}]
  blinkingMarkers: [],   // [{light, halo, blinkInterval, t, pattern}]
  cameraShake: null      // {intensityScale, speedThreshold, maxOffset}
};
if (typeof window !== 'undefined') window._cinemaState = _cinemaState;

// Reset hook — called from scene.js per-world reset block on world-switch.
// Keeps the state lean across world transitions.
function resetCinematicState(){
  _cinemaState.groundFog.length = 0;
  _cinemaState.lightPoles.length = 0;
  _cinemaState.blinkingMarkers.length = 0;
  _cinemaState.cameraShake = null;
}

// ── Procedural fog-wisp texture ──────────────────────────────────────────
//
// Soft horizontal wisps for the ground-fog layer. Cached per-color so
// repeated builds (e.g. multiple worlds with the same fog tint) don't
// re-allocate canvases.
const _fogTexCache = new Map();
function _cinematicFogWispTex(hexColor){
  const key = String(hexColor);
  if (_fogTexCache.has(key)) return _fogTexCache.get(key);
  const W = 256, H = 128;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // Transparent base — fog is additive over scene, no opaque pixels
  g.clearRect(0, 0, W, H);
  // Parse hex color to rgb for inline rgba()
  const col = new THREE.Color(hexColor);
  const r = Math.round(col.r * 255), gC = Math.round(col.g * 255), b = Math.round(col.b * 255);
  // Soft horizontal wisp blobs — low alpha, large radii, tileable on X
  for (let i = 0; i < 22; i++){
    const x = Math.random() * W;
    const y = H * 0.2 + Math.random() * H * 0.6;
    const rad = 25 + Math.random() * 60;
    const alpha = 0.18 + Math.random() * 0.18;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(${r},${gC},${b},${alpha.toFixed(2)})`);
    grd.addColorStop(1, `rgba(${r},${gC},${b},0)`);
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    // Wrap blobs on X edge so the texture tiles seamlessly when scrolled
    if (x < rad){
      g.fillStyle = grd;
      g.fillRect(x + W - rad, y - rad, rad * 2, rad * 2);
    } else if (x > W - rad){
      g.fillStyle = grd;
      g.fillRect(x - W - rad, y - rad, rad * 2, rad * 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  _fogTexCache.set(key, tex);
  return tex;
}

// Dispose the fog-tex cache — wired from scene.js disposal so a clean
// world-switch frees the GPU memory before the next buildScene allocates
// fresh textures.
function disposeCinematicCaches(){
  _fogTexCache.forEach(t => { try { t.dispose(); } catch(_){} });
  _fogTexCache.clear();
}
if (typeof window !== 'undefined') window.disposeCinematicCaches = disposeCinematicCaches;

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  buildCinematicGroundFog                                                 ║
// ╚═════════════════════════════════════════════════════════════════════════╝
//
// Low-altitude fog layer that gives the world its volumetric depth — head-
// lights and lamp cones cut through it, distant geometry fades. Implemented
// as one or more wide horizontal planes with a fog-wisp canvas texture, so
// the cost is essentially "additional alpha-blended geometry" — cheap on
// desktop, mobile-degradable to a single plane.
//
// The fog scrolls slowly via texture.offset to suggest light wind without
// any particle simulation.
//
// @param {THREE.Scene} scene  Active scene
// @param {Object}      [opts]
// @param {number} [opts.color=0x2a1a30]      Tint (hex). Default donkerpaars
//                                            warm-accented for cinematic
// @param {number} [opts.density=0.55]        Material opacity 0..1
// @param {number} [opts.height=5]            Y-position of single layer (or
//                                            base of stacked layers)
// @param {number} [opts.layerCount=3]        Number of stacked layers (auto-
//                                            clamped to 1 on mobile)
// @param {number} [opts.layerSpacing=2.2]    Vertical spacing between layers
// @param {number} [opts.size=900]            Plane width × depth (square)
// @param {Array}  [opts.scrollDir=[1,0.3]]   Scroll vector (x, z) per layer
// @param {number} [opts.scrollSpeed=0.012]   Texture units per second
// @param {boolean}[opts.fadeWithDistance=true] When true, material picks up
//                                            scene.fog so distant fog fades
// @returns {Array<THREE.Mesh>}  Layer meshes (callers can override later)
function buildCinematicGroundFog(scene, opts){
  const o = opts || {};
  const color = (o.color != null) ? o.color : 0x2a1a30;
  const density = (o.density != null) ? o.density : 0.55;
  const baseY = (o.height != null) ? o.height : 5;
  const requested = (o.layerCount != null) ? o.layerCount : 3;
  const layers = window._isMobile ? 1 : Math.max(1, requested|0);
  const spacing = (o.layerSpacing != null) ? o.layerSpacing : 2.2;
  const size = (o.size != null) ? o.size : 900;
  const scrollDir = o.scrollDir || [1, 0.3];
  const scrollSpeed = (o.scrollSpeed != null) ? o.scrollSpeed : 0.012;
  const fadeWithDistance = (o.fadeWithDistance !== false);
  const meshes = [];
  // Single plane geometry shared across all layers — cloned material per
  // layer so opacity / texture offset can vary per slice.
  const geo = new THREE.PlaneGeometry(size, size, 1, 1);
  for (let i = 0; i < layers; i++){
    const tex = _cinematicFogWispTex(color);
    // Per-layer texture clone via CanvasTexture share — actual GPU upload
    // is shared (same image source), only the .repeat/.offset diverge.
    const lTex = tex.clone();
    lTex.wrapS = THREE.RepeatWrapping;
    lTex.wrapT = THREE.RepeatWrapping;
    lTex.needsUpdate = true;
    // Larger repeat for the higher layers so distant wisps look smaller
    const repScale = 4 + i * 1.5;
    lTex.repeat.set(repScale, repScale * 0.5);
    const mat = new THREE.MeshBasicMaterial({
      map: lTex,
      color: 0xffffff,
      transparent: true,
      opacity: density * (1 - i * 0.18),  // upper layers fade
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: fadeWithDistance
    });
    const m = new THREE.Mesh(geo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = baseY + i * spacing;
    m.renderOrder = -5;  // render before transparent props
    scene.add(m);
    meshes.push(m);
    // Per-layer scroll vector — alternate sign on z-component for cross-flow
    const dx = scrollDir[0] * (i % 2 === 0 ? 1 : -0.6);
    const dz = scrollDir[1] * (i % 2 === 0 ? 1 : 0.7);
    _cinemaState.groundFog.push({
      mesh: m,
      tex: lTex,
      scrollDir: [dx, dz],
      scrollSpeed: scrollSpeed * (1 + i * 0.4)
    });
  }
  return meshes;
}

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  buildCinematicLightPole                                                 ║
// ╚═════════════════════════════════════════════════════════════════════════╝
//
// Sodium-style street-lamp pole composed of: mast + lamp armature + point
// light + volumetric cone + ground pool + halo billboard. Fully config-
// driven so future cinematic worlds can reuse the same architecture with
// red (volcano), aqua (deepsea), or violet (neon) palettes.
//
// Set `working: false` to build a "broken/off" lamp — the pole stays as a
// silhouette but no light is emitted (good for character / variety).
//
// @param {THREE.Scene}   scene
// @param {THREE.Vector3} position   Base position (mast base sits here)
// @param {Object}        [opts]
// @param {number}  [opts.color=0xff8830]    Lamp color (hex)
// @param {number}  [opts.intensity=1.5]     PointLight intensity
// @param {number}  [opts.range=24]          PointLight distance
// @param {number}  [opts.height=8]          Mast height
// @param {number}  [opts.armLength=1.4]     Horizontal arm reach
// @param {number}  [opts.poolRadius=12]     Ground-pool radius
// @param {boolean} [opts.working=true]      false = broken lamp
// @param {number}  [opts.tilt=0]            Pole tilt (radians, for old/leaning)
// @param {number}  [opts.facingY=0]         Y-rotation of arm/lamp
// @param {boolean} [opts.castGroundPool=true] Add fade decal under lamp
// @param {boolean} [opts.castVolumetricCone=true] Add cone-mesh under lamp
// @param {boolean} [opts.castHalo=true]     Add halo billboard around lamp
// @returns {THREE.Group}  Group containing all pole sub-meshes
//
// IMPLEMENTATION SLOT — wired in commit 2 of this sessie.
function buildCinematicLightPole(scene, position, opts){
  // Stub — full implementation lands in commit 2 of the cinematic sessie.
  // Returning an empty group keeps callers safe if they call this early.
  const g = new THREE.Group();
  g.position.copy(position);
  scene.add(g);
  return g;
}

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  buildCinematicVolumetricLightCone                                       ║
// ╚═════════════════════════════════════════════════════════════════════════╝
//
// Volumetric cone visible BELOW a point/spot light when ground-fog is
// present. Implemented as a downward-pointing cone-mesh with an additive
// gradient material — at any camera angle the cone reads as light cutting
// through mist. Cheap (one mesh, one mat) — desktop and mobile both run it.
//
// @param {THREE.Object3D} parent     Anchor (typically a group containing the lamp)
// @param {Object}         [opts]
// @param {number}  [opts.color=0xff8830]   Cone tint
// @param {number}  [opts.coneRadius=4]     Bottom radius (where the cone
//                                          meets the ground)
// @param {number}  [opts.coneHeight=8]     Height of cone (lamp-to-floor)
// @param {number}  [opts.opacity=0.22]     Material opacity at full strength
// @param {boolean} [opts.additive=true]    Use AdditiveBlending (cinematic)
// @returns {THREE.Mesh}  The cone mesh (caller can position-tweak)
//
// IMPLEMENTATION SLOT — wired in commit 2.
function buildCinematicVolumetricLightCone(parent, opts){
  return null;  // stub — implemented in commit 2
}

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  buildCinematicBlinkingMarker                                            ║
// ╚═════════════════════════════════════════════════════════════════════════╝
//
// Tiny distant warning-light: PointLight + halo billboard + blink logic.
// Used for crane-tops, antenna-warning, distant aircraft. Registers itself
// with _cinemaState.blinkingMarkers so updateCinematic() can drive the
// blink without per-marker callbacks.
//
// @param {THREE.Scene}   scene
// @param {THREE.Vector3} position
// @param {Object}        [opts]
// @param {number}   [opts.color=0xff3030]    Hex color
// @param {string}   [opts.pattern='slow-pulse']  'solid' | 'slow-pulse'
//                                              | 'fast-pulse' | 'morse'
// @param {number}   [opts.blinkInterval=2.0] Cycle length seconds
// @param {number}   [opts.intensity=2.0]     PointLight intensity (peak)
// @param {number}   [opts.range=80]          PointLight range
// @param {number}   [opts.haloSize=2.4]      Billboard scale
// @param {boolean}  [opts.includeLight=true] false = halo-only marker
//                                            (keeps shader light count down)
// @returns {Object}  { light, halo } refs (caller may dispose)
//
// IMPLEMENTATION SLOT — wired in commit 3.
function buildCinematicBlinkingMarker(scene, position, opts){
  return null;  // stub — implemented in commit 3
}

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  buildCinematicHeadlampPool                                              ║
// ╚═════════════════════════════════════════════════════════════════════════╝
//
// Versterkt-koplamp-blob op nat asfalt: een subtle gradient sprite/disc
// die de standaard car spotlight aanvult voor een meer cinematic
// ground-pool look op cinematic werelden. Per-car aangeroepen bij build.
//
// @param {THREE.Object3D} car
// @param {Object} [opts]
// @param {number} [opts.color=0xfff0d0]   Pool tint
// @param {number} [opts.size=8]           Pool diameter at full visibility
// @param {number} [opts.opacity=0.45]
// @param {number} [opts.forwardOffset=4]  Distance ahead of car
// @returns {THREE.Mesh}
//
// SKIPPED IN THIS SESSIE — out of scope (cars/build.js is owned by car
// pipeline, not the cinematic foundation). Documented here so a future
// sessie can pick it up. The decision is reversible.
function buildCinematicHeadlampPool(car, opts){
  return null;  // skipped — see comment above
}

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  applyCinematicCameraShake                                               ║
// ╚═════════════════════════════════════════════════════════════════════════╝
//
// Subtle speed-scaled random offset applied AFTER the existing collision-
// shake (camShake global). Activated by registering a config object via
// `enableCinematicCameraShake({...})` at world build, then driven by the
// camera-update via the global `applyCinematicCameraShake()` call.
//
// Speed-scaled: idle = no shake, cruising = barely-there, top speed =
// max ~0.05 units offset. Tunable per world.
//
// @param {THREE.Camera} camera
// @param {number}       speed01     Normalised speed (0..1)
// @param {Object}       [config]    cinemaState.cameraShake config
// @returns {void}                   Mutates camera.position in place
//
// IMPLEMENTATION SLOT — wired in commit 4.
function applyCinematicCameraShake(camera, speed01, config){
  // Stub — implemented in commit 4. No-op so existing camera path stays clean.
}

// Activates camera shake for the active world. Cleared on world-switch
// via resetCinematicState(). Pier 47 calls this from its environment
// builder; future cinematic worlds will do the same with their own values.
function enableCinematicCameraShake(opts){
  const o = opts || {};
  _cinemaState.cameraShake = {
    intensityScale: (o.intensityScale != null) ? o.intensityScale : 1.0,
    speedThreshold: (o.speedThreshold != null) ? o.speedThreshold : 0.20,
    maxOffset:      (o.maxOffset      != null) ? o.maxOffset      : 0.05
  };
}
if (typeof window !== 'undefined') window.enableCinematicCameraShake = enableCinematicCameraShake;

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  applyCinematicMotionBlur                                                ║
// ╚═════════════════════════════════════════════════════════════════════════╝
//
// Boost the existing postfx bloom radial-component for cinematic worlds —
// or, if the postfx pipeline gets a real radial-blur pass added later,
// route that activation through this helper.
//
// For sessie-1 of the cinematic foundation, this hooks the bloom-strength
// multiplier so that lamp + headlight emissives pop more dramatically
// against the dark scene without restructuring the postfx pipeline.
//
// @param {Object} postfx  The _postfx state object (from postfx.js)
// @param {number} intensity  0..1 — 0 disables, 1 = full cinematic boost
//
// IMPLEMENTATION SLOT — wired in commit 4.
function applyCinematicMotionBlur(postfx, intensity){
  // Stub — implemented in commit 4.
}

// ── Per-frame update — drives the registered cinematic effects ───────────
//
// Called from core/loop.js per frame (cheap unless arrays are populated).
// Worlds that don't use cinematic helpers see early-out instantly.
function updateCinematic(dt){
  if (typeof scene === 'undefined' || !scene) return;
  // Ground-fog scroll
  if (_cinemaState.groundFog.length){
    for (let i = 0; i < _cinemaState.groundFog.length; i++){
      const f = _cinemaState.groundFog[i];
      if (!f || !f.tex) continue;
      f.tex.offset.x += f.scrollDir[0] * f.scrollSpeed * dt;
      f.tex.offset.y += f.scrollDir[1] * f.scrollSpeed * dt;
    }
  }
  // Blinking markers — implemented in commit 3 (reads pattern + blinkInterval)
  if (_cinemaState.blinkingMarkers.length){
    for (let i = 0; i < _cinemaState.blinkingMarkers.length; i++){
      const m = _cinemaState.blinkingMarkers[i];
      if (!m) continue;
      m.t += dt;
      // Stub — pattern logic lands with the marker implementation
    }
  }
  // Camera shake — applied from gameplay/camera.js via the public helper
  // (we don't mutate camera here; camera.js calls applyCinematicCameraShake
  // explicitly inside updateCamera so the shake stacks with collision-shake).
}

// ── Public exports ────────────────────────────────────────────────────────
if (typeof window !== 'undefined'){
  window.buildCinematicGroundFog          = buildCinematicGroundFog;
  window.buildCinematicLightPole          = buildCinematicLightPole;
  window.buildCinematicVolumetricLightCone= buildCinematicVolumetricLightCone;
  window.buildCinematicBlinkingMarker     = buildCinematicBlinkingMarker;
  window.buildCinematicHeadlampPool       = buildCinematicHeadlampPool;
  window.applyCinematicCameraShake        = applyCinematicCameraShake;
  window.applyCinematicMotionBlur         = applyCinematicMotionBlur;
  window.updateCinematic                  = updateCinematic;
  window.resetCinematicState              = resetCinematicState;
}
