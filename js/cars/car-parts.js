// js/cars/car-parts.js — shared building blocks for brand-specific car builders.
// Non-module script. Loaded BEFORE js/cars/brands.js and js/cars/build.js.
//
// Goal: brand builders (e.g. buildFerrariSF90) produce a Group with a unique
// silhouette while sharing materials and wheel assembly. Reduces material churn
// (was 6 per car × 12 cars = 72 fresh; now ~6 shared + 1-2 per car).
//
// Shared materials live on _carShared. They are built lazily on first call to
// getSharedCarMats() and disposed via disposeSharedCarMats() (called from
// scene disposal — but they're light enough to outlive a session).

'use strict';

// PBR material helpers — Standard on desktop (so HDRI envMap reflections
// land on glass / chrome / paint), Lambert/Phong on mobile to keep
// fillrate budget. Both branches accept the same `color` argument plus
// optional `emissive` / `transparent` / `opacity`. Mobile path silently
// drops the PBR-only fields; the per-mesh appearance only differs in
// reflection sharpness and specular response.
function _carMat(opts){
  const o = opts || {};
  // _carPBR=true → carry-flag so asset-bridge can leave envMapIntensity
  // alone on car materials (their own setting takes precedence over the
  // 0.6 cap applied to other PBR meshes in the scene).
  if (window._isMobile){
    const lo = { color:o.color };
    if (o.transparent != null) lo.transparent = o.transparent;
    if (o.opacity != null)     lo.opacity = o.opacity;
    if (o.emissive != null)    lo.emissive = o.emissive;
    if (o.emissiveIntensity!=null) lo.emissiveIntensity = o.emissiveIntensity;
    return new THREE.MeshLambertMaterial(lo);
  }
  const m = new THREE.MeshStandardMaterial({
    color: o.color,
    metalness: o.metalness != null ? o.metalness : 0.0,
    roughness: o.roughness != null ? o.roughness : 0.6,
    transparent: !!o.transparent,
    opacity: o.opacity != null ? o.opacity : 1.0,
    emissive: o.emissive != null ? o.emissive : 0x000000,
    emissiveIntensity: o.emissiveIntensity != null ? o.emissiveIntensity : 1.0,
    envMapIntensity: o.envMapIntensity != null ? o.envMapIntensity : 0.7,
  });
  m.userData = m.userData || {};
  m.userData._carPBR = true;
  return m;
}

let _carShared = null;
function getSharedCarMats(){
  if(_carShared) return _carShared;
  // Headlight registry rebuilds with the materials. Otherwise re-creating
  // _carShared would push a duplicate `head` reference each rebuild and
  // syncHeadlights would walk an ever-growing list.
  if(window._headlightMats) window._headlightMats.length = 0;
  _carShared = {
    // Glass: very low roughness so HDRI environment shows up as crisp
    // tinted reflection; transparent keeps interior visible.
    glass:    _carMat({color:0x0a1a2a, transparent:true, opacity:.72, metalness:0.0, roughness:0.05, envMapIntensity:0.85}),
    glassDark:_carMat({color:0x040810, transparent:true, opacity:.86, metalness:0.0, roughness:0.10, envMapIntensity:0.75}),
    // Chrome: full metallic, mirror-smooth → mirror reflection of HDRI.
    chrome:   _carMat({color:0xdddddd, metalness:1.0, roughness:0.18, envMapIntensity:1.0}),
    // Splitters / skirts / vents: matte black, dim reflections.
    blk:      _carMat({color:0x050505, metalness:0.0, roughness:0.75, envMapIntensity:0.30}),
    matBlk:   _carMat({color:0x101012, metalness:0.0, roughness:0.85, envMapIntensity:0.25}),
    // Honeycomb grille: slightly metallic mesh.
    grille:   _carMat({color:0x1a1a1c, metalness:0.4, roughness:0.55, envMapIntensity:0.40}),
    // Tire: pure matte rubber, no reflection contribution.
    tire:     _carMat({color:0x080808, metalness:0.0, roughness:0.95, envMapIntensity:0.10}),
    // Rim: polished alloy, strong reflection.
    rim:      _carMat({color:0xc0c0c8, metalness:0.85, roughness:0.30, envMapIntensity:0.85}),
    // Brake caliper: matte red painted metal.
    brakeRed: _carMat({color:0xcc1010, metalness:0.0, roughness:0.85, envMapIntensity:0.30}),
    // Brake disc: brushed steel.
    brakeDisc:_carMat({color:0x282828, metalness:0.7, roughness:0.40, envMapIntensity:0.65}),
    // Emissive lights — keep their existing colors / intensities.
    head:     _carMat({color:0xfff8e8, emissive:0xffe8a8, emissiveIntensity:.6, metalness:0.1, roughness:0.30, envMapIntensity:0.40}),
    tail:     _carMat({color:0xff1010, emissive:0xcc0000, emissiveIntensity:.45, metalness:0.1, roughness:0.30, envMapIntensity:0.35}),
    indicator:_carMat({color:0xff7e10, emissive:0xff5500, emissiveIntensity:.35, metalness:0.1, roughness:0.30, envMapIntensity:0.35})
  };
  // Flag every shared car material so disposeScene leaves the cache alive
  // across world rebuilds — otherwise getSharedCarMats() would return a
  // bag of disposed material handles after the first race ends, and on
  // desktop the next race would pay a Standard-shader recompile hitch.
  Object.values(_carShared).forEach(m=>{
    m.userData = m.userData || {};
    m.userData._sharedAsset = true;
  });
  // Track headlight material in a registry so night.js can sync emissive intensity
  // when toggling dark mode without touching every car mesh.
  if(!window._headlightMats) window._headlightMats = [];
  window._headlightMats.push(_carShared.head);
  return _carShared;
}

// Drop the shared car material cache. Call on full session reset (not on
// per-race world rebuild — the materials are flagged _sharedAsset so they
// survive disposeScene). Currently no caller; documented for completeness.
function disposeSharedCarMats(){
  if(!_carShared) return;
  Object.values(_carShared).forEach(m=>{ try{ m.dispose(); } catch(_){} });
  _carShared = null;
  if(window._headlightMats) window._headlightMats.length = 0;
}
window.disposeSharedCarMats = disposeSharedCarMats;

// Update headlight emissive intensity globally — called from night.js when isDark flips.
function syncHeadlights(intensity){
  if(!window._headlightMats) return;
  window._headlightMats.forEach(m=>{ if(m && m.emissive) m.emissiveIntensity = intensity; });
}
window.syncHeadlights = syncHeadlights;

// Per-car paint + accent materials. One pair per CAR INSTANCE (so multiple
// instances of the same def each get fresh paint — needed because color
// overrides apply per-mesh and we don't want to retint the def-default for
// other instances).
function makePaintMats(def){
  // Per-car body paint. Desktop: MeshStandardMaterial with metallic-paint
  // tuning (clearcoat-ish without actual clearcoat — three r134 has no
  // MeshPhysicalMaterial.clearcoat in this build path). Mobile: keep the
  // existing MeshPhongMaterial path so we don't pay PBR shader cost on
  // 9 paint meshes while moving.
  const color = (typeof def.color === 'string') ? parseInt(def.color,16) : def.color;
  const accent = (typeof def.accent === 'string') ? parseInt(def.accent,16) : def.accent;
  let paint, accentMat;
  if (window._isMobile){
    paint = new THREE.MeshPhongMaterial({color:color, shininess:120, specular:0x666666});
    accentMat = new THREE.MeshLambertMaterial({color:accent});
  } else {
    paint = new THREE.MeshStandardMaterial({
      color: color, metalness: 0.65, roughness: 0.22, envMapIntensity: 0.85,
    });
    accentMat = new THREE.MeshStandardMaterial({
      color: accent, metalness: 0.50, roughness: 0.35, envMapIntensity: 0.65,
    });
    paint.userData = paint.userData || {}; paint.userData._carPBR = true;
    accentMat.userData = accentMat.userData || {}; accentMat.userData._carPBR = true;
  }
  return {paint, accent: accentMat};
}

// Mesh helper — adds a child to a group with position + rotation + shadow flag.
function addPart(group, geo, mat, x, y, z, rx, ry, rz){
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x||0, y||0, z||0);
  if(rx||ry||rz) m.rotation.set(rx||0, ry||0, rz||0);
  m.castShadow = true;
  group.add(m);
  return m;
}

// One wheel assembly: a sub-group at (x,y,z) containing tire + rim + spokes
// + caliper + brake disc. The sub-group spins as one unit (physics.spinWheels
// rotates everything in userData.wheels[]). Caliper is added as a sibling so
// it stays static while the wheel spins.
// Returns the spinning sub-group.
function buildWheel(group, x, y, z, radius, width, mats, lod){
  const tireSegs = lod==='low' ? 8 : 16;
  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(x, y, z);
  // Orient the wheel so its rotation axis is along world X (left-right).
  // Spinning forward = rotation around world X = rotation.x on this group.
  wheelGroup.rotation.z = Math.PI/2;
  group.add(wheelGroup);
  // Tire
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, tireSegs),
    mats.tire
  );
  tire.castShadow = true;
  wheelGroup.add(tire);
  if(lod !== 'low'){
    // Rim (slightly outside the tire for visibility)
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(radius*.62, radius*.62, width+.012, 12),
      mats.rim
    );
    wheelGroup.add(rim);
    // 5 spokes — laid flat across the rim face
    const spokeGeo = new THREE.BoxGeometry(.04, .025, radius*1.05);
    for(let s=0; s<5; s++){
      const sp = new THREE.Mesh(spokeGeo, mats.rim);
      sp.rotation.y = (s/5)*Math.PI*2;
      wheelGroup.add(sp);
    }
    // Brake disc — same axis as wheel
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(radius*.55, radius*.55, .03, 12),
      mats.brakeDisc
    );
    wheelGroup.add(disc);
    // Caliper as sibling (stays static while wheel spins)
    const cal = new THREE.Mesh(new THREE.BoxGeometry(.08, .18, .22), mats.brakeRed);
    cal.position.set(x, y-.08, z);
    group.add(cal);
  }
  return wheelGroup;
}

// Builds 4 wheels at the standard sedan/super positions and registers them
// on group.userData.wheels for spin animation.
// posOverride lets F1 / specific shapes pass their own [[x,y,z],...] array.
function buildAllWheels(group, def, mats, lod, posOverride){
  const isF1 = def.type === 'f1';
  const isMuscle = def.type === 'muscle';
  const positions = posOverride || (isF1
    ? [[-1.06,.30,-1.80],[1.06,.30,-1.80],[-1.06,.30,1.62],[1.06,.30,1.62]]
    : isMuscle
      ? [[-0.99,.33,-1.50],[0.99,.33,-1.50],[-0.99,.33,1.50],[0.99,.33,1.50]]
      : [[-0.98,.33,-1.40],[0.98,.33,-1.40],[-0.98,.33,1.40],[0.98,.33,1.40]]);
  const radius = isF1 ? .36 : .33;
  const width = isF1 ? .42 : .26;
  group.userData.wheels = [];
  positions.forEach(([wx,wy,wz])=>{
    const wheelGrp = buildWheel(group, wx, wy, wz, radius, width, mats, lod);
    group.userData.wheels.push(wheelGrp);
  });
  // Map to FL/FR/RL/RR for engine.js / physics.js consumers.
  const w = group.userData.wheels;
  if(w.length >= 4){
    group.userData.wheelFL = w[0];
    group.userData.wheelFR = w[1];
    group.userData.wheelRL = w[2];
    group.userData.wheelRR = w[3];
  }
}

// Headlights: two small emissive blocks at the front. Call this from each
// non-F1 brand builder after the body is built.
function buildHeadlights(group, mats, opts){
  opts = opts || {};
  const sx = opts.spread || 0.80;
  const y = opts.y || .42;
  const z = opts.z || -1.95;
  const w = opts.w || .26;
  const h = opts.h || .12;
  const d = opts.d || .08;
  const geo = new THREE.BoxGeometry(w, h, d);
  [-sx, sx].forEach(s=>{
    const hl = new THREE.Mesh(geo, mats.head);
    hl.position.set(s, y, z);
    group.add(hl);
  });
}

// Tail lights — small emissive red blocks at rear.
function buildTaillights(group, mats, opts){
  opts = opts || {};
  const sx = opts.spread || 0.78;
  const y = opts.y || .55;
  const z = opts.z || 1.95;
  const w = opts.w || .26;
  const h = opts.h || .10;
  const d = opts.d || .06;
  const geo = new THREE.BoxGeometry(w, h, d);
  [-sx, sx].forEach(s=>{
    const tl = new THREE.Mesh(geo, mats.tail);
    tl.position.set(s, y, z);
    group.add(tl);
  });
}

// Dual chrome exhaust pipes at the rear.
function buildExhausts(group, mats, opts){
  opts = opts || {};
  const sx = opts.spread || 0.40;
  const y = opts.y || .22;
  const z = opts.z || 2.05;
  const r = opts.radius || .065;
  const len = opts.length || .35;
  const geo = new THREE.CylinderGeometry(r, r, len, 8);
  [-sx, sx].forEach(s=>{
    const ex = new THREE.Mesh(geo, mats.chrome);
    ex.rotation.x = Math.PI/2;
    ex.position.set(s, y, z);
    group.add(ex);
  });
}

// Side air vents — two small dark slits behind the front wheels (super silhouettes).
function buildSideVents(group, mats, opts){
  opts = opts || {};
  const sx = opts.spread || 0.96;
  const y = opts.y || .50;
  const z = opts.z || -.40;
  const w = opts.w || .04;
  const h = opts.h || .14;
  const d = opts.d || .55;
  const geo = new THREE.BoxGeometry(w, h, d);
  [-sx, sx].forEach(s=>{
    const v = new THREE.Mesh(geo, mats.blk);
    v.position.set(s, y, z);
    group.add(v);
  });
}

// Wheel arches — flattened hemispheres above each wheel.
function buildWheelArches(group, paintMat, opts){
  opts = opts || {};
  const positions = opts.positions || [[-.98,.36,-1.40],[.98,.36,-1.40],[-.98,.36,1.40],[.98,.36,1.40]];
  const geo = new THREE.SphereGeometry(.54, 10, 6, 0, Math.PI*2, 0, Math.PI*.5);
  positions.forEach(([wx,wy,wz])=>{
    const arch = new THREE.Mesh(geo, paintMat);
    arch.scale.set(1.08, .45, 1.55);
    arch.position.set(wx, wy, wz);
    group.add(arch);
  });
}

// Side skirts — matte black sliver under the body, between front and rear wheels.
function buildSideSkirts(group, mats, opts){
  opts = opts || {};
  const sx = opts.spread || 0.97;
  const y = opts.y || .12;
  const z = opts.z || 0;
  const len = opts.length || 2.6;
  const geo = new THREE.BoxGeometry(.06, .08, len);
  [-sx, sx].forEach(s=>{
    const sk = new THREE.Mesh(geo, mats.matBlk);
    sk.position.set(s, y, z);
    group.add(sk);
  });
}

// Detect mobile / low-quality LOD — used by build.js to skip details.
function carLOD(){
  return (window._isMobile || window._lowQuality) ? 'low' : 'high';
}

// Expose globals for non-module scripts.
window.getSharedCarMats = getSharedCarMats;
window.makePaintMats = makePaintMats;
window.addPart = addPart;
window.buildWheel = buildWheel;
window.buildAllWheels = buildAllWheels;
window.buildHeadlights = buildHeadlights;
window.buildTaillights = buildTaillights;
window.buildExhausts = buildExhausts;
window.buildSideVents = buildSideVents;
window.buildWheelArches = buildWheelArches;
window.buildSideSkirts = buildSideSkirts;
window.carLOD = carLOD;
