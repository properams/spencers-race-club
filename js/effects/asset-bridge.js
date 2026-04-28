// js/effects/asset-bridge.js — Bridges window.Assets into the active scene.
//
// Non-module. Called from:
//   - core/boot.js   after Assets.preloadWorld(activeWorld) resolves
//   - ui/select.js   after the user selects a world (preload kicks in)
//   - core/scene.js  at the end of buildScene() so the first frame after a
//                    rebuild already has whatever assets were cached.
//
// Idempotent: each apply checks scene.userData flags and bails if already
// done. Disposing the scene clears userData → next buildScene re-applies.

'use strict';

(function(){
  // Keep environment maps applied via this bridge so disposeScene knows not
  // to dispose them when world is rebuilt (HDRI is shared between worlds).
  let _appliedHDRIPath = null;

  // Apply HDRI sky + environment for the current world, if available.
  function applyHDRI(worldId){
    if (!window.scene || !window.Assets) return false;
    if (window.activeWorld !== worldId) return false;
    const env = Assets.getHDRI(worldId);
    if (!env) return false;
    if (scene.userData._hdriApplied === env) return false;
    env.userData = env.userData || {};
    env.userData._sharedAsset = true;
    scene.background  = env;
    scene.environment = env;
    scene.userData._hdriApplied = env;
    _appliedHDRIPath = env.userData && env.userData.sourcePath;

    // Match fog color to HDRI horizon so distant geometry blends into the sky
    // band instead of producing a visible "kleurverschil" rim. Falls back to
    // existing fog color if sample failed.
    const hex = env.userData && env.userData.horizonColor;
    if (hex != null && scene.fog && scene.fog.color){
      try { scene.fog.color.setHex(hex); }
      catch (e) { /* noop */ }
      // Also refresh the day/night fog targets so updateSky's lerp doesn't
      // drift back to the procedural color.
      if (window._fogColorDay)   _fogColorDay.setHex(hex);
      if (window._fogColorNight) _fogColorNight.setHex(_darkenHex(hex, 0.55));
    }

    // Boost reflectivity so PBR materials (if any) actually sample the env.
    // Lambert materials ignore envMap entirely — no harm done.
    scene.traverse(obj => {
      if (obj.isMesh && obj.material && 'envMapIntensity' in obj.material){
        obj.material.envMapIntensity = 0.6;
      }
    });
    if (window.dbg) dbg.log('asset-bridge', 'HDRI applied', { world: worldId });
    return true;
  }

  function _darkenHex(hex, f){
    const r = ((hex>>16)&0xff)*f|0, g = ((hex>>8)&0xff)*f|0, b = (hex&0xff)*f|0;
    return (r<<16)|(g<<8)|b;
  }

  // Apply PBR ground textures to the largest plane that already has a
  // procedural grass canvas map (the buildGround() result). Fase E.
  function applyGround(worldId){
    if (!window.scene || !window.Assets) return false;
    if (window.activeWorld !== worldId) return false;
    const set = Assets.getGroundSet(worldId);
    if (!set || !set.color) return false;
    if (scene.userData._groundApplied) return false;
    let touched = 0;
    [set.color, set.normal, set.roughness].forEach(t => {
      if (t){
        t.userData = t.userData || {};
        t.userData._sharedAsset = true;
        // Tile generously across the 2200×2200 ground plane.
        t.repeat.set(40, 40);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.needsUpdate = true;
      }
    });
    scene.traverse(obj => {
      if (!obj.isMesh || !obj.material) return;
      if (!obj.userData || !obj.userData._isProcGround) return;
      // Replace Lambert with Standard so normalMap/roughnessMap actually
      // contribute. Keep the existing color so dim baseline stays similar
      // when only the color slot is provided.
      const oldCol = (obj.material.color && obj.material.color.getHex) ? obj.material.color.getHex() : 0xffffff;
      const oldMap = obj.material.map;
      const stdMat = new THREE.MeshStandardMaterial({
        color: oldCol,
        map: set.color,
        normalMap: set.normal || null,
        roughnessMap: set.roughness || null,
        roughness: set.roughness ? 1.0 : 0.85,
        metalness: 0.0,
      });
      stdMat.userData = { _sharedAsset: true };
      // Drop the procedural canvas map only if it isn't a shared asset itself.
      if (oldMap && !(oldMap.userData && oldMap.userData._sharedAsset)) oldMap.dispose();
      try { obj.material.dispose(); } catch (_) {}
      obj.material = stdMat;
      touched++;
    });
    if (touched){
      scene.userData._groundApplied = true;
      if (window.dbg) dbg.log('asset-bridge', 'PBR ground applied', { world: worldId, meshes: touched });
    }
    return touched > 0;
  }

  // Public: re-apply everything available for the given world. Cheap if
  // already applied (idempotent).
  function maybeUpgradeWorld(worldId){
    let any = false;
    if (applyHDRI(worldId))   any = true;
    if (applyGround(worldId)) any = true;
    // Trees + props: handled inside the world builder (sync getters at
    // build time). Only HDRI/ground need post-hoc patching because they
    // attach to objects already created.
    return any;
  }

  // ── Shared GLTF spawn helper ────────────────────────────────────────
  // Drop one GLTF prop into the active scene at a world-space position.
  // Each call clones the prototype scene because every spawn needs its
  // own transform; the underlying geometry/material stay shared via the
  // _sharedAsset flag so disposeScene preserves the cache.
  function spawnGLTFProp(proto, worldX, worldZ, opts){
    if (!proto || !proto.scene || !window.scene) return null;
    opts = opts || {};
    const root = proto.scene.clone(true);
    // Normalize: many CC0 props ship 0.5–4× desired size. Sample bounding
    // box and scale longest horizontal extent to opts.sizeHint (meters).
    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3(); box.getSize(size);
    const longest = Math.max(size.x, size.z, 0.01);
    const sFit = (opts.sizeHint || 1.6) / longest;
    const sJit = opts.scaleJitter !== false
      ? (0.85 + Math.random()*0.30) : 1;
    const s = sFit * sJit;
    root.scale.setScalar(s);
    root.position.set(worldX, opts.yOffset || 0, worldZ);
    root.rotation.y = (opts.rotation != null) ? opts.rotation : Math.random()*Math.PI*2;
    root.traverse(o=>{
      if (!o.isMesh) return;
      if (o.geometry){ o.geometry.userData = o.geometry.userData||{}; o.geometry.userData._sharedAsset=true; }
      const mats = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
      mats.forEach(m=>{
        m.userData = m.userData||{}; m.userData._sharedAsset=true;
        // Also flag every map slot so disposeScene's per-layer texture
        // check leaves the cached GLTF maps alive across world rebuilds.
        ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap','bumpMap'].forEach(slot=>{
          const t = m[slot];
          if (t){ t.userData = t.userData||{}; t.userData._sharedAsset=true; }
        });
      });
    });
    scene.add(root);
    return root;
  }

  // Spawn N prop clusters at the trackside. Reads available prop GLTFs
  // from window.Assets cache for the active world. Returns count of
  // clusters actually placed (0 if no GLTFs cached → caller's procedural
  // fallback should handle it).
  function spawnRoadsideProps(worldId, opts){
    if (!window.scene || !window.Assets || !window.trackCurve) return 0;
    // BARRIER_OFF must come from config.js — bail if script-load order is
    // ever broken so we can't accidentally spawn props on top of the wall.
    if (typeof BARRIER_OFF === 'undefined') return 0;
    opts = opts || {};
    const propKeys = (opts.propKeys || []).filter(k => !!Assets.getGLTF(worldId, k));
    if (!propKeys.length) return 0;
    const count = opts.count || 8;
    const minOff = (opts.offsetMin || (BARRIER_OFF + 3));
    const offRange = Math.max(2, (opts.offsetMax || (BARRIER_OFF + 12)) - minOff);
    const sizeHint = opts.sizeHint || 1.8;
    const cluster = opts.clusterSize || 2;
    let placed = 0;
    for (let i=0;i<count;i++){
      const t = (i + 0.5)/count;
      const p = trackCurve.getPoint(t);
      const tg = trackCurve.getTangent(t).normalize();
      const nr = new THREE.Vector3(-tg.z,0,tg.x);
      const side = (i % 2 === 0 ? 1 : -1);
      const off = minOff + Math.random()*offRange;
      const cx = p.x + nr.x*side*off;
      const cz = p.z + nr.z*side*off;
      const k = 1 + (Math.random()*cluster|0);
      for (let j=0;j<k;j++){
        const propKey = propKeys[(Math.random()*propKeys.length)|0];
        const proto = Assets.getGLTF(worldId, propKey);
        const dx = (Math.random()-.5)*2.6;
        const dz = (Math.random()-.5)*2.6;
        spawnGLTFProp(proto, cx+dx, cz+dz, { sizeHint });
        placed++;
      }
    }
    return placed;
  }

  window.maybeUpgradeWorld = maybeUpgradeWorld;
  window.spawnGLTFProp = spawnGLTFProp;
  window.spawnRoadsideProps = spawnRoadsideProps;
  window._assetBridge = { applyHDRI, applyGround, maybeUpgradeWorld, spawnGLTFProp, spawnRoadsideProps };
})();
