// js/cars/brands.js — brand-specific car body builders.
// Non-module script. Loaded AFTER car-parts.js, BEFORE build.js.
//
// Each builder takes a Group and adds body meshes (NOT wheels — wheels are
// added by build.js via buildAllWheels). The Group is empty when passed in.
// Builders use shared materials from getSharedCarMats() and per-instance
// paint via makePaintMats(def).
//
// Brands without an explicit builder fall back to the legacy makeCar()
// path in build.js (so adding builders incrementally is safe).

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// FERRARI SF90 — wedge silhouet, hoge zijspoiler, dubbele uitlaten,
// lage voorbumper met splitter, side-vents in de portieren. Default red.
// ─────────────────────────────────────────────────────────────────────────────
function buildFerrariSF90(g, def, mats, lod){
  const lo = lod === 'low';
  // Lower chassis — long, low wedge.
  addPart(g, new THREE.BoxGeometry(1.92, .42, 4.10), mats.paint, 0, .26, 0);
  // Side rocker/skirt extension (lower, wider grip)
  if(!lo){
    addPart(g, new THREE.BoxGeometry(2.00, .14, 3.40), mats.matBlk, 0, .12, 0);
  }
  // Front nose: low sloping wedge
  addPart(g, new THREE.BoxGeometry(1.70, .26, .80), mats.paint, 0, .30, -1.85);
  // Front splitter (matBlk lip)
  addPart(g, new THREE.BoxGeometry(1.78, .06, .26), mats.matBlk, 0, .10, -2.10);
  // Hood — sloped, peaks toward cabin
  addPart(g, new THREE.BoxGeometry(1.70, .10, 1.40), mats.paint, 0, .54, -.95);
  // Front grille / lower intake (signature dark inset)
  addPart(g, new THREE.BoxGeometry(.90, .14, .12), mats.grille, 0, .22, -2.02);
  // Headlights — slim units flanking the nose
  buildHeadlights(g, mats, {spread:.78, y:.46, z:-1.92, w:.30, h:.10, d:.08});
  // Cabin — narrow, set forward of midsection
  addPart(g, new THREE.BoxGeometry(1.62, .42, 1.30), mats.paint, 0, .76, -.05);
  // Front windshield — sloped glass
  addPart(g, new THREE.BoxGeometry(1.50, .50, .08), mats.glass, 0, .82, -.78, -.42);
  // Side windows
  [-.81, .81].forEach(s=>{
    addPart(g, new THREE.BoxGeometry(.06, .32, 1.10), mats.glass, s, .82, -.05);
  });
  // Rear glass (engine cover window — short on mid-engine)
  addPart(g, new THREE.BoxGeometry(1.42, .26, .08), mats.glassDark, 0, .82, .58, .40);
  // Roof (low, short)
  addPart(g, new THREE.BoxGeometry(1.36, .04, 1.05), mats.paint, 0, 1.00, -.18);
  // Engine cover (paint section behind cabin)
  addPart(g, new THREE.BoxGeometry(1.55, .22, 1.10), mats.paint, 0, .68, .92);
  if(!lo){
    // Engine cover slats (carbon-look strakes)
    [-.30, 0, .30].forEach(s=>{
      addPart(g, new THREE.BoxGeometry(.12, .04, 1.00), mats.matBlk, s, .80, .92);
    });
  }
  // Front fenders — bulges over front wheels
  buildWheelArches(g, mats.paint, {positions:[
    [-.99, .42, -1.40], [.99, .42, -1.40], [-.99, .42, 1.40], [.99, .42, 1.40]
  ]});
  // Side air intakes — SF90 signature, large dark vents on doors
  if(!lo){
    [-1.00, 1.00].forEach(s=>{
      addPart(g, new THREE.BoxGeometry(.05, .22, .85), mats.matBlk, s, .56, .35);
      addPart(g, new THREE.BoxGeometry(.04, .10, .70), mats.grille, s, .56, .35);
    });
    buildSideVents(g, mats, {spread:1.00, y:.50, z:-.45, w:.04, h:.16, d:.55});
  }
  // Rear bumper / lower diffuser
  addPart(g, new THREE.BoxGeometry(1.85, .22, .30), mats.paint, 0, .32, 1.95);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(1.65, .10, .28), mats.matBlk, 0, .14, 2.00);
    // Diffuser fins
    [-.50, -.15, .15, .50].forEach(s=>{
      addPart(g, new THREE.BoxGeometry(.04, .14, .26), mats.blk, s, .14, 2.00);
    });
  }
  // Rear spoiler — high, on visible stands
  [-.65, .65].forEach(s=>{
    addPart(g, new THREE.BoxGeometry(.08, .26, .12), mats.matBlk, s, .92, 1.78);
  });
  addPart(g, new THREE.BoxGeometry(1.66, .06, .36), mats.paint, 0, 1.08, 1.78);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(1.62, .03, .12), mats.matBlk, 0, 1.05, 1.66);
  }
  // Tail lights — SF90 has horizontal slim units (not the cat-eyes from older Ferraris)
  buildTaillights(g, mats, {spread:.70, y:.58, z:1.98, w:.38, h:.08, d:.05});
  // Dual exhausts — high mounted center pair
  buildExhausts(g, mats, {spread:.32, y:.34, z:2.06, radius:.075, length:.30});
  // Side skirts
  buildSideSkirts(g, mats, {spread:.99, y:.10, z:0, length:2.6});
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY — maps def.brand to its builder. Brands not in the registry fall
// back to the legacy makeCar logic in build.js (for incremental rollout).
// ─────────────────────────────────────────────────────────────────────────────
const BRAND_BUILDERS = {
  'FERRARI': buildFerrariSF90
  // 11 more brands added in PR-B
};

window.BRAND_BUILDERS = BRAND_BUILDERS;
window.buildFerrariSF90 = buildFerrariSF90;
