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
// BUGATTI CHIRON — wider, rounded silhouet, signature C-shape side accent,
// centre exhaust, modest spoiler, low roofline. Default tweetonig blauw/goud.
// ─────────────────────────────────────────────────────────────────────────────
function buildBugattiChiron(g, def, mats, lod){
  const lo = lod === 'low';
  // Wide chassis (W=2.05) — Chiron is broader than the Ferrari
  addPart(g, new THREE.BoxGeometry(2.05, .44, 4.05), mats.paint, 0, .26, 0);
  // Rounded front clamshell — sphere-quarter front for the signature shape
  const fb = new THREE.Mesh(new THREE.SphereGeometry(.50, 12, 8, 0, Math.PI*2, 0, Math.PI/2), mats.paint);
  fb.scale.set(2.05, .50, 1.20); fb.rotation.x = Math.PI;
  fb.position.set(0, .22, -1.85); g.add(fb);
  // Front splitter
  addPart(g, new THREE.BoxGeometry(1.85, .06, .26), mats.matBlk, 0, .10, -2.05);
  // Hood
  addPart(g, new THREE.BoxGeometry(1.78, .08, 1.30), mats.paint, 0, .54, -1.00);
  // Horseshoe-style grille (signature Bugatti)
  addPart(g, new THREE.BoxGeometry(.55, .22, .12), mats.grille, 0, .30, -2.00);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(.42, .14, .04), mats.accent, 0, .30, -2.06); // gold horseshoe rim
  }
  buildHeadlights(g, mats, {spread:.78, y:.46, z:-1.92, w:.34, h:.10, d:.07});
  // Cabin — slightly raised dome
  addPart(g, new THREE.BoxGeometry(1.66, .40, 1.50), mats.paint, 0, .76, .00);
  addPart(g, new THREE.BoxGeometry(1.54, .48, .08), mats.glass, 0, .82, -.78, -.35);
  [-.83, .83].forEach(s=>addPart(g, new THREE.BoxGeometry(.06, .30, 1.30), mats.glass, s, .82, .00));
  addPart(g, new THREE.BoxGeometry(1.46, .30, .08), mats.glassDark, 0, .82, .80, .38);
  addPart(g, new THREE.BoxGeometry(1.40, .04, 1.20), mats.paint, 0, 1.00, -.10);
  // Engine cover (rear paint section)
  addPart(g, new THREE.BoxGeometry(1.65, .20, 1.10), mats.paint, 0, .68, .92);
  // C-shape side accent — Chiron signature: dark inset arc on the door
  if(!lo){
    [-1.01, 1.01].forEach(s=>{
      addPart(g, new THREE.BoxGeometry(.04, .30, 1.10), mats.matBlk, s, .50, -.05);
      addPart(g, new THREE.BoxGeometry(.05, .12, .12), mats.accent, s, .65, -.55); // upper accent dot
      addPart(g, new THREE.BoxGeometry(.05, .12, .12), mats.accent, s, .35, -.55); // lower accent dot
    });
  }
  buildWheelArches(g, mats.paint, {positions:[
    [-1.02, .42, -1.40], [1.02, .42, -1.40], [-1.02, .42, 1.40], [1.02, .42, 1.40]
  ]});
  // Rear bumper + diffuser
  addPart(g, new THREE.BoxGeometry(1.95, .22, .30), mats.paint, 0, .32, 1.95);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(1.70, .10, .28), mats.matBlk, 0, .14, 2.00);
  }
  // Modest spoiler — Chiron has retractable wing, suggested by short fixed plate
  addPart(g, new THREE.BoxGeometry(1.60, .04, .26), mats.matBlk, 0, .96, 1.78);
  // Tail lights — Bugatti signature: full-width LED bar (suggested with two segments)
  buildTaillights(g, mats, {spread:.50, y:.58, z:1.99, w:.46, h:.08, d:.05});
  // Centre single large exhaust (Chiron signature)
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .35, 10), mats.chrome);
  ex.rotation.x = Math.PI/2; ex.position.set(0, .30, 2.06); g.add(ex);
  if(!lo){
    const exRing = new THREE.Mesh(new THREE.TorusGeometry(.15, .02, 5, 12), mats.chrome);
    exRing.rotation.y = Math.PI/2; exRing.position.set(0, .30, 2.06); g.add(exRing);
  }
  buildSideSkirts(g, mats, {spread:1.02, y:.10, z:0, length:2.6});
}

// ─────────────────────────────────────────────────────────────────────────────
// LAMBORGHINI HURACÁN — angular wedge, sharp edges, lower flat roof,
// hexagonal accents, big rear diffuser, aggressive intakes.
// ─────────────────────────────────────────────────────────────────────────────
function buildLamborghiniHuracan(g, def, mats, lod){
  const lo = lod === 'low';
  // Lower chassis — angular, slightly narrower than Bugatti
  addPart(g, new THREE.BoxGeometry(1.96, .38, 4.10), mats.paint, 0, .24, 0);
  // Sharp pointed front (no rounded clamshell)
  addPart(g, new THREE.BoxGeometry(1.80, .26, .80), mats.paint, 0, .30, -1.85);
  // Triangular front splitter (Lambo's hex/triangular language)
  addPart(g, new THREE.BoxGeometry(1.75, .06, .30), mats.matBlk, 0, .08, -2.10);
  // Hood — flat with sharp creases
  addPart(g, new THREE.BoxGeometry(1.78, .08, 1.30), mats.paint, 0, .50, -1.00);
  if(!lo){
    // Hood crease — a thin paint ridge running down centre
    addPart(g, new THREE.BoxGeometry(.04, .04, 1.20), mats.matBlk, 0, .56, -1.00);
  }
  // Front lower intakes — hex shape suggested with two angular blocks
  if(!lo){
    [-.55, .55].forEach(s=>addPart(g, new THREE.BoxGeometry(.40, .10, .14), mats.grille, s, .18, -2.02));
  }
  buildHeadlights(g, mats, {spread:.72, y:.40, z:-1.95, w:.28, h:.08, d:.06});
  // Cabin — VERY low and flat (Lambo signature)
  addPart(g, new THREE.BoxGeometry(1.60, .34, 1.40), mats.paint, 0, .68, -.05);
  // Sloped windscreen (steeper than Ferrari)
  addPart(g, new THREE.BoxGeometry(1.50, .42, .07), mats.glass, 0, .76, -.78, -.50);
  [-.81, .81].forEach(s=>addPart(g, new THREE.BoxGeometry(.06, .26, 1.20), mats.glass, s, .76, -.05));
  // Rear glass — short, almost flat
  addPart(g, new THREE.BoxGeometry(1.42, .22, .07), mats.glassDark, 0, .76, .68, .48);
  // Flat low roof
  addPart(g, new THREE.BoxGeometry(1.34, .03, 1.05), mats.paint, 0, .90, -.20);
  // Engine cover (Lambo has BIG visible engine bay)
  addPart(g, new THREE.BoxGeometry(1.62, .22, 1.10), mats.paint, 0, .60, .92);
  if(!lo){
    // Hexagonal engine bay vents
    [[-.42, .82], [.42, .82], [0, .92]].forEach(p=>{
      addPart(g, new THREE.BoxGeometry(.18, .04, .35), mats.matBlk, p[0], .73, p[1]);
    });
  }
  // Aggressive side intakes — Lambo signature, large angular vents
  if(!lo){
    [-1.00, 1.00].forEach(s=>{
      addPart(g, new THREE.BoxGeometry(.05, .26, .80), mats.matBlk, s, .48, .25);
      addPart(g, new THREE.BoxGeometry(.04, .14, .65), mats.accent, s, .48, .25);
    });
  }
  buildWheelArches(g, mats.paint, {positions:[
    [-1.00, .40, -1.40], [1.00, .40, -1.40], [-1.00, .40, 1.40], [1.00, .40, 1.40]
  ]});
  // Rear bumper + AGGRESSIVE diffuser (Lambo signature)
  addPart(g, new THREE.BoxGeometry(1.90, .24, .30), mats.paint, 0, .32, 1.95);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(1.75, .14, .32), mats.matBlk, 0, .12, 2.00);
    // 5 diffuser fins
    [-.65, -.32, 0, .32, .65].forEach(s=>addPart(g, new THREE.BoxGeometry(.04, .18, .30), mats.blk, s, .12, 2.00));
  }
  // Tail lights — hex/Y-shape suggested with angular blocks
  buildTaillights(g, mats, {spread:.72, y:.55, z:1.98, w:.30, h:.10, d:.05});
  // Quad exhausts (Lambo signature) — two pairs
  if(!lo){
    [-.55, -.30, .30, .55].forEach(s=>{
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .25, 8), mats.chrome);
      ex.rotation.x = Math.PI/2; ex.position.set(s, .26, 2.05); g.add(ex);
    });
  } else {
    buildExhausts(g, mats, {spread:.40, y:.26, z:2.05, radius:.06, length:.25});
  }
  // Rear spoiler — sharp wedge
  [-.65, .65].forEach(s=>addPart(g, new THREE.BoxGeometry(.06, .20, .10), mats.matBlk, s, .82, 1.78));
  addPart(g, new THREE.BoxGeometry(1.62, .04, .28), mats.paint, 0, .94, 1.78);
  buildSideSkirts(g, mats, {spread:.99, y:.10, z:0, length:2.6});
}

// ─────────────────────────────────────────────────────────────────────────────
// MASERATI MC20 — slim, long, tapered fastback, elegant proportions,
// modest spoiler, smooth side surfaces (less aggressive than Lambo/Ferrari).
// ─────────────────────────────────────────────────────────────────────────────
function buildMaseratiMC20(g, def, mats, lod){
  const lo = lod === 'low';
  // Slim chassis — slightly longer than super average
  addPart(g, new THREE.BoxGeometry(1.92, .40, 4.25), mats.paint, 0, .25, 0);
  // Long, low front
  addPart(g, new THREE.BoxGeometry(1.74, .24, 1.00), mats.paint, 0, .30, -1.95);
  addPart(g, new THREE.BoxGeometry(1.60, .06, .26), mats.matBlk, 0, .12, -2.20);
  // Trident grille suggestion (3-slat horizontal bar)
  if(!lo){
    addPart(g, new THREE.BoxGeometry(.70, .14, .10), mats.grille, 0, .26, -2.10);
    [-.18, 0, .18].forEach(s=>addPart(g, new THREE.BoxGeometry(.04, .10, .04), mats.accent, s, .26, -2.16));
  }
  // Long sloping hood
  addPart(g, new THREE.BoxGeometry(1.72, .08, 1.50), mats.paint, 0, .54, -1.10);
  buildHeadlights(g, mats, {spread:.74, y:.42, z:-2.00, w:.28, h:.08, d:.06});
  // Cabin — set further back (signature MC20 proportion)
  addPart(g, new THREE.BoxGeometry(1.62, .42, 1.25), mats.paint, 0, .76, .25);
  addPart(g, new THREE.BoxGeometry(1.48, .50, .08), mats.glass, 0, .82, -.50, -.40);
  [-.81, .81].forEach(s=>addPart(g, new THREE.BoxGeometry(.06, .30, 1.05), mats.glass, s, .82, .25));
  // Tapered rear glass — fastback
  addPart(g, new THREE.BoxGeometry(1.40, .42, .08), mats.glassDark, 0, .80, 1.05, .55);
  addPart(g, new THREE.BoxGeometry(1.36, .04, 1.00), mats.paint, 0, 1.00, .15);
  // Engine cover — short, smooth
  addPart(g, new THREE.BoxGeometry(1.55, .16, .85), mats.paint, 0, .68, 1.20);
  // Door-line accent — single white stripe (def.accent often white)
  if(!lo){
    [-1.00, 1.00].forEach(s=>{
      addPart(g, new THREE.BoxGeometry(.04, .04, 2.20), mats.accent, s, .42, 0);
    });
    // Subtle side intake
    [-.99, .99].forEach(s=>addPart(g, new THREE.BoxGeometry(.05, .14, .60), mats.matBlk, s, .55, .55));
  }
  buildWheelArches(g, mats.paint, {positions:[
    [-1.00, .42, -1.45], [1.00, .42, -1.45], [-1.00, .42, 1.45], [1.00, .42, 1.45]
  ]});
  // Rear bumper + simple diffuser
  addPart(g, new THREE.BoxGeometry(1.85, .22, .28), mats.paint, 0, .32, 2.05);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(1.55, .10, .26), mats.matBlk, 0, .14, 2.10);
  }
  // Modest fixed-position spoiler integrated into rear deck
  addPart(g, new THREE.BoxGeometry(1.50, .04, .22), mats.matBlk, 0, .85, 1.84);
  // Slim taillights
  buildTaillights(g, mats, {spread:.72, y:.54, z:2.08, w:.28, h:.07, d:.05});
  // Dual symmetric exhausts (wider stance than Ferrari)
  buildExhausts(g, mats, {spread:.65, y:.24, z:2.16, radius:.065, length:.30});
  buildSideSkirts(g, mats, {spread:.99, y:.10, z:0, length:2.7});
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY — maps def.brand to its builder. Brands not in the registry fall
// back to the legacy makeCar logic in build.js (for incremental rollout).
// ─────────────────────────────────────────────────────────────────────────────
const BRAND_BUILDERS = {
  'FERRARI':     buildFerrariSF90,
  'BUGATTI':     buildBugattiChiron,
  'LAMBORGHINI': buildLamborghiniHuracan,
  'MASERATI':    buildMaseratiMC20
  // 8 more brands added incrementally in PR-B
};

window.BRAND_BUILDERS = BRAND_BUILDERS;
window.buildFerrariSF90 = buildFerrariSF90;
window.buildBugattiChiron = buildBugattiChiron;
window.buildLamborghiniHuracan = buildLamborghiniHuracan;
window.buildMaseratiMC20 = buildMaseratiMC20;
