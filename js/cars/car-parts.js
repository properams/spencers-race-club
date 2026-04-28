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

let _carShared = null;
function getSharedCarMats(){
  if(_carShared) return _carShared;
  _carShared = {
    glass:    new THREE.MeshLambertMaterial({color:0x0a1a2a, transparent:true, opacity:.72}),
    glassDark:new THREE.MeshLambertMaterial({color:0x040810, transparent:true, opacity:.86}),
    chrome:   new THREE.MeshLambertMaterial({color:0xdddddd}),
    blk:      new THREE.MeshLambertMaterial({color:0x050505}),  // splitters, skirts, vents
    matBlk:   new THREE.MeshLambertMaterial({color:0x101012}),  // body trim
    grille:   new THREE.MeshLambertMaterial({color:0x1a1a1c}),  // honeycomb mesh-suggestie
    tire:     new THREE.MeshLambertMaterial({color:0x080808}),
    rim:      new THREE.MeshLambertMaterial({color:0xc0c0c8}),  // 5-spoke alloy
    brakeRed: new THREE.MeshLambertMaterial({color:0xcc1010}),
    brakeDisc:new THREE.MeshLambertMaterial({color:0x282828}),
    head:     new THREE.MeshLambertMaterial({color:0xfff8e8, emissive:0xffe8a8, emissiveIntensity:.6}),
    tail:     new THREE.MeshLambertMaterial({color:0xff1010, emissive:0xcc0000, emissiveIntensity:.45}),
    indicator:new THREE.MeshLambertMaterial({color:0xff7e10, emissive:0xff5500, emissiveIntensity:.35})
  };
  // Track headlight material in a registry so night.js can sync emissive intensity
  // when toggling dark mode without touching every car mesh.
  if(!window._headlightMats) window._headlightMats = [];
  window._headlightMats.push(_carShared.head);
  return _carShared;
}

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
  // MeshPhongMaterial gives a glossy paint look (specular highlights catch
  // headlights/sun) — heavier than Lambert but worth it for the car hero.
  const color = (typeof def.color === 'string') ? parseInt(def.color,16) : def.color;
  const accent = (typeof def.accent === 'string') ? parseInt(def.accent,16) : def.accent;
  const paint = new THREE.MeshPhongMaterial({color:color, shininess:120, specular:0x666666});
  const accentMat = new THREE.MeshLambertMaterial({color:accent});
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

// One wheel assembly: tire + 5-spoke rim + caliper + disc.
// Returns the tire mesh (used for spinning userData.wheels).
function buildWheel(group, x, y, z, radius, width, mats, lod){
  const tireSegs = lod==='low' ? 8 : 16;
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, tireSegs),
    mats.tire
  );
  tire.rotation.z = Math.PI/2;
  tire.position.set(x, y, z);
  tire.castShadow = true;
  group.add(tire);
  if(lod === 'low'){
    // mobile/low-quality: skip rim spokes + brake disc — silhouette only
    return tire;
  }
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(radius*.62, radius*.62, width+.012, 12),
    mats.rim
  );
  rim.rotation.z = Math.PI/2;
  rim.position.set(x, y, z);
  group.add(rim);
  // 5 spokes
  const spokeGeo = new THREE.BoxGeometry(radius*1.05, .025, .04);
  for(let s=0; s<5; s++){
    const sp = new THREE.Mesh(spokeGeo, mats.rim);
    sp.rotation.z = Math.PI/2;
    sp.rotation.y = (s/5)*Math.PI*2;
    sp.position.set(x, y, z);
    group.add(sp);
  }
  // Brake caliper
  const cal = new THREE.Mesh(new THREE.BoxGeometry(.08, .18, .22), mats.brakeRed);
  cal.position.set(x, y-.08, z);
  group.add(cal);
  // Brake disc behind rim — visible from side
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(radius*.55, radius*.55, .03, 12),
    mats.brakeDisc
  );
  disc.rotation.z = Math.PI/2;
  disc.position.set(x + (x>0 ? -width*.4 : width*.4), y, z);
  group.add(disc);
  return tire;
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
    const tire = buildWheel(group, wx, wy, wz, radius, width, mats, lod);
    group.userData.wheels.push(tire);
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
