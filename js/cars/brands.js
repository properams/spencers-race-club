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
  // Phase 2 pilot — body-subgroup zodat toekomstige per-car effects (boost
  // squat, hard-corner roll) de body kunnen kantelen onafhankelijk van de
  // wheels. Wheels worden later door build.js → buildAllWheels op `g` zelf
  // gehangen, niet op `body`, zodat de spin-update op wheelGroups blijft
  // werken. Reverse-light, beam-cones en underglow worden ook op `g`
  // gehangen door build.js. night.js:196 filtert mesh.children op
  // userData.isHeadBeam dus de extra body-Group wordt overgeslagen.
  const body = new THREE.Group();
  body.userData = body.userData || {};
  body.userData._isBody = true;
  g.add(body);
  // Wide chassis (W=2.05) — Chiron is broader than the Ferrari
  addPart(body, new THREE.BoxGeometry(2.05, .44, 4.05), mats.paint, 0, .26, 0);
  // Rounded front clamshell — sphere-quarter front for the signature shape
  const fb = new THREE.Mesh(new THREE.SphereGeometry(.50, 12, 8, 0, Math.PI*2, 0, Math.PI/2), mats.paint);
  fb.scale.set(2.05, .50, 1.20); fb.rotation.x = Math.PI;
  fb.position.set(0, .22, -1.85); body.add(fb);
  // Front splitter
  addPart(body, new THREE.BoxGeometry(1.85, .06, .26), mats.matBlk, 0, .10, -2.05);
  // Hood — crowned slab i.p.v. flat box (Phase 2.2). Lichte aerodynamische
  // welling op de bovenkant; subtiel maar leesbaar tegen het cabin-volume.
  addPart(body, _crownedSlabGeo(1.78, .08, 1.30), mats.paint, 0, .54, -1.00);
  // Horseshoe-style grille (signature Bugatti)
  addPart(body, new THREE.BoxGeometry(.55, .22, .12), mats.grille, 0, .30, -2.00);
  if(!lo){
    addPart(body, new THREE.BoxGeometry(.42, .14, .04), mats.accent, 0, .30, -2.06); // gold horseshoe rim
  }
  // Premium headlights (Phase 2.3) — emissive kern + glas-lens (transmission)
  // + 4-LED accent strip. Vervangt de standaard buildHeadlights call.
  buildPremiumHeadlights(body, mats, {spread:.78, y:.46, z:-1.92, w:.34, h:.10, d:.07});
  // Cabin — slightly raised dome. Tonal split livery: cabin shell in
  // accent color (gold) instead of paint to evoke the iconic Chiron
  // two-tone look. Roof also uses accent for the same reason.
  addPart(body, new THREE.BoxGeometry(1.66, .40, 1.50), mats.accent, 0, .76, .00);
  addPart(body, new THREE.BoxGeometry(1.54, .48, .08), mats.glass, 0, .82, -.78, -.35);
  [-.83, .83].forEach(s=>addPart(body, new THREE.BoxGeometry(.06, .30, 1.30), mats.glass, s, .82, .00));
  addPart(body, new THREE.BoxGeometry(1.46, .30, .08), mats.glassDark, 0, .82, .80, .38);
  // Roof — crowned slab in accent material (Phase 2.2).
  addPart(body, _crownedSlabGeo(1.40, .04, 1.20), mats.accent, 0, 1.00, -.10);
  // Engine cover (rear paint section) — crowned slab (Phase 2.2).
  addPart(body, _crownedSlabGeo(1.65, .20, 1.10), mats.paint, 0, .68, .92);
  // Chrome window-trim strips (Phase 2.5) — dunne strips langs de bovenkant
  // van de side windows + voor- en achterkant van het glass-canopy.
  // Geeft het premium "vernist metaal rond glas" effect dat MeshStandard-
  // chrome zonder envMap niet kon waarmaken.
  if(!lo){
    [-0.86, 0.86].forEach(s=>{
      addPart(body, new THREE.BoxGeometry(.025, .025, 1.30), mats.chrome, s, .67, .00);
    });
    addPart(body, new THREE.BoxGeometry(1.30, .025, .025), mats.chrome, 0, .67, -.65);
    addPart(body, new THREE.BoxGeometry(1.30, .025, .025), mats.chrome, 0, .67,  .65);
  }
  // C-shape side accent — Chiron signature: dark inset arc on the door
  if(!lo){
    [-1.01, 1.01].forEach(s=>{
      addPart(body, new THREE.BoxGeometry(.04, .30, 1.10), mats.matBlk, s, .50, -.05);
      addPart(body, new THREE.BoxGeometry(.05, .12, .12), mats.accent, s, .65, -.55); // upper accent dot
      addPart(body, new THREE.BoxGeometry(.05, .12, .12), mats.accent, s, .35, -.55); // lower accent dot
    });
  }
  buildWheelArches(body, mats.paint, {positions:[
    [-1.02, .42, -1.40], [1.02, .42, -1.40], [-1.02, .42, 1.40], [1.02, .42, 1.40]
  ]});
  // Rear bumper + diffuser
  addPart(body, new THREE.BoxGeometry(1.95, .22, .30), mats.paint, 0, .32, 1.95);
  if(!lo){
    addPart(body, new THREE.BoxGeometry(1.70, .10, .28), mats.matBlk, 0, .14, 2.00);
  }
  // Modest spoiler — Chiron has retractable wing, suggested by short fixed plate
  addPart(body, new THREE.BoxGeometry(1.60, .04, .26), mats.matBlk, 0, .96, 1.78);
  // Tail lights — Bugatti signature: full-width LED bar (suggested with two segments)
  buildTaillights(body, mats, {spread:.50, y:.58, z:1.99, w:.46, h:.08, d:.05});
  // Centre single large exhaust (Chiron signature)
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .35, 10), mats.chrome);
  ex.rotation.x = Math.PI/2; ex.position.set(0, .30, 2.06); body.add(ex);
  if(!lo){
    const exRing = new THREE.Mesh(new THREE.TorusGeometry(.15, .02, 5, 12), mats.chrome);
    exRing.rotation.y = Math.PI/2; exRing.position.set(0, .30, 2.06); body.add(exRing);
  }
  buildSideSkirts(body, mats, {spread:1.02, y:.10, z:0, length:2.6});
  // Phase 2.4 — markeer wheel-style opties op de top-level group zodat
  // build.js → buildAllWheels gedrilde discs + accent-gold calipers krijgt.
  // Brand-builders zonder _wheelOpts vallen terug op brakeRed + standard.
  g.userData = g.userData || {};
  g.userData._wheelOpts = { brakeStyle: 'drilled', caliperMatKey: 'accent' };
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
// AUDI R8 — long wheelbase, understated, signature side-blade R8 inset.
// Default black with red accents.
// ─────────────────────────────────────────────────────────────────────────────
function buildAudiR8(g, def, mats, lod){
  const lo = lod === 'low';
  // Long chassis (longest wheelbase among supers)
  addPart(g, new THREE.BoxGeometry(1.96, .42, 4.30), mats.paint, 0, .25, 0);
  // Squared low front
  addPart(g, new THREE.BoxGeometry(1.80, .26, .85), mats.paint, 0, .30, -1.95);
  addPart(g, new THREE.BoxGeometry(1.78, .06, .26), mats.matBlk, 0, .10, -2.20);
  // Single-frame grille (Audi signature) — wide hex shape
  if(!lo){
    addPart(g, new THREE.BoxGeometry(1.20, .20, .10), mats.grille, 0, .26, -2.18);
    addPart(g, new THREE.BoxGeometry(1.16, .04, .04), mats.accent, 0, .26, -2.24);
  }
  // Long hood
  addPart(g, new THREE.BoxGeometry(1.74, .08, 1.45), mats.paint, 0, .54, -1.05);
  // Quad LED suggestion (Audi signature) — stretched headlights
  buildHeadlights(g, mats, {spread:.78, y:.42, z:-1.98, w:.36, h:.08, d:.06});
  // Cabin
  addPart(g, new THREE.BoxGeometry(1.66, .42, 1.30), mats.paint, 0, .76, .00);
  addPart(g, new THREE.BoxGeometry(1.52, .50, .08), mats.glass, 0, .82, -.78, -.42);
  [-.83, .83].forEach(s=>addPart(g, new THREE.BoxGeometry(.06, .30, 1.10), mats.glass, s, .82, .00));
  addPart(g, new THREE.BoxGeometry(1.42, .32, .08), mats.glassDark, 0, .82, .80, .40);
  addPart(g, new THREE.BoxGeometry(1.36, .04, 1.10), mats.paint, 0, 1.00, -.10);
  // Engine cover (mid-engine, R8 has visible engine glass — simulate with darker section)
  addPart(g, new THREE.BoxGeometry(1.62, .20, 1.05), mats.paint, 0, .68, 1.05);
  // Side blade (R8 SIGNATURE) — large vertical inset on the door, in accent color
  if(!lo){
    [-1.01, 1.01].forEach(s=>{
      addPart(g, new THREE.BoxGeometry(.04, .55, 1.10), mats.matBlk, s, .55, .15);
      addPart(g, new THREE.BoxGeometry(.05, .45, 1.00), mats.accent, s, .55, .15);
    });
  }
  buildWheelArches(g, mats.paint, {positions:[
    [-1.00, .44, -1.50], [1.00, .44, -1.50], [-1.00, .44, 1.50], [1.00, .44, 1.50]
  ]});
  addPart(g, new THREE.BoxGeometry(1.86, .24, .30), mats.paint, 0, .32, 2.00);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(1.70, .10, .28), mats.matBlk, 0, .14, 2.06);
  }
  // Modest rear spoiler — integrated lip (Audi prefers subtle)
  addPart(g, new THREE.BoxGeometry(1.62, .04, .22), mats.matBlk, 0, .82, 1.85);
  buildTaillights(g, mats, {spread:.74, y:.55, z:2.04, w:.36, h:.08, d:.05});
  // Dual oval exhausts (Audi signature)
  if(!lo){
    [-.42, .42].forEach(s=>{
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .30, 10), mats.chrome);
      ex.rotation.x = Math.PI/2; ex.scale.x = 1.4; ex.position.set(s, .26, 2.08); g.add(ex);
    });
  } else {
    buildExhausts(g, mats, {spread:.42, y:.26, z:2.08, radius:.075, length:.28});
  }
  buildSideSkirts(g, mats, {spread:.99, y:.10, z:0, length:2.7});
}

// ─────────────────────────────────────────────────────────────────────────────
// PORSCHE GT3 RS — rounded fastback silhouet, BIG rear wing on tall stands
// (GT3 RS signature), round-ish headlights, prominent splitter.
// Default white with red accents.
// ─────────────────────────────────────────────────────────────────────────────
function buildPorscheGT3RS(g, def, mats, lod){
  const lo = lod === 'low';
  addPart(g, new THREE.BoxGeometry(1.92, .44, 4.10), mats.paint, 0, .26, 0);
  // Rounded clamshell front (Porsche signature)
  const fb = new THREE.Mesh(new THREE.SphereGeometry(.50, 12, 8, 0, Math.PI*2, 0, Math.PI/2), mats.paint);
  fb.scale.set(1.92, .58, 1.10); fb.rotation.x = Math.PI;
  fb.position.set(0, .22, -1.85); g.add(fb);
  // Aggressive front splitter (GT3 RS)
  addPart(g, new THREE.BoxGeometry(1.95, .06, .40), mats.matBlk, 0, .08, -2.10);
  if(!lo){
    [-.55, .55].forEach(s=>addPart(g, new THREE.BoxGeometry(.30, .14, .14), mats.grille, s, .22, -2.08));
  }
  // Round headlights (cylinders, axis perpendicular to face)
  if(!lo){
    [-.74, .74].forEach(s=>{
      const hl = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .08, 12), mats.head);
      hl.rotation.x = Math.PI/2; hl.position.set(s, .46, -1.92); g.add(hl);
    });
  } else {
    buildHeadlights(g, mats, {spread:.74, y:.46, z:-1.92, w:.30, h:.16, d:.06});
  }
  // Cabin — rounded teardrop (Porsche fastback)
  addPart(g, new THREE.BoxGeometry(1.66, .40, 1.40), mats.paint, 0, .72, -.10);
  addPart(g, new THREE.BoxGeometry(1.52, .48, .08), mats.glass, 0, .80, -.78, -.45);
  [-.83, .83].forEach(s=>addPart(g, new THREE.BoxGeometry(.06, .30, 1.20), mats.glass, s, .80, -.10));
  // Long sloping rear glass (fastback)
  addPart(g, new THREE.BoxGeometry(1.46, .42, .08), mats.glassDark, 0, .80, .85, .58);
  addPart(g, new THREE.BoxGeometry(1.36, .04, 1.05), mats.paint, 0, .94, -.20);
  // Rear deck (lower than cabin — fastback)
  addPart(g, new THREE.BoxGeometry(1.65, .14, 1.10), mats.paint, 0, .60, 1.10);
  // Side blade (smaller than Audi)
  if(!lo){
    [-1.00, 1.00].forEach(s=>addPart(g, new THREE.BoxGeometry(.05, .14, .60), mats.accent, s, .50, .35));
  }
  buildWheelArches(g, mats.paint, {positions:[
    [-1.00, .44, -1.40], [1.00, .44, -1.40], [-1.00, .44, 1.40], [1.00, .44, 1.40]
  ]});
  addPart(g, new THREE.BoxGeometry(1.86, .22, .28), mats.paint, 0, .32, 1.95);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(1.65, .10, .26), mats.matBlk, 0, .14, 2.00);
  }
  // BIG REAR WING (GT3 RS signature) — tall stands + wide plate
  [-.70, .70].forEach(s=>addPart(g, new THREE.BoxGeometry(.06, .50, .12), mats.matBlk, s, 1.05, 1.65));
  addPart(g, new THREE.BoxGeometry(1.85, .06, .42), mats.paint, 0, 1.32, 1.65);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(1.85, .03, .12), mats.matBlk, 0, 1.28, 1.55); // wing underside lip
    [-.92, .92].forEach(s=>addPart(g, new THREE.BoxGeometry(.04, .12, .42), mats.matBlk, s, 1.26, 1.65)); // endplates
  }
  buildTaillights(g, mats, {spread:.74, y:.56, z:1.99, w:.34, h:.08, d:.05});
  // Twin centre exhausts (GT3 RS)
  buildExhausts(g, mats, {spread:.18, y:.24, z:2.03, radius:.075, length:.30});
  buildSideSkirts(g, mats, {spread:.99, y:.10, z:0, length:2.6});
}

// ─────────────────────────────────────────────────────────────────────────────
// McLAREN P1 — modern hypercar, high mounted active rear wing, aggressive
// front splitter with nose-cut, carbon-look matBlk accents prominent.
// Default orange.
// ─────────────────────────────────────────────────────────────────────────────
function buildMcLarenP1(g, def, mats, lod){
  const lo = lod === 'low';
  addPart(g, new THREE.BoxGeometry(1.90, .40, 4.10), mats.paint, 0, .25, 0);
  // Pointed low nose with central nose-cut (P1 signature)
  addPart(g, new THREE.BoxGeometry(1.74, .22, .85), mats.paint, 0, .28, -1.90);
  // Nose-cut (V-shape suggested with two angled black blocks)
  if(!lo){
    addPart(g, new THREE.BoxGeometry(.40, .18, .30), mats.matBlk, 0, .26, -2.04);
  }
  addPart(g, new THREE.BoxGeometry(1.85, .06, .35), mats.matBlk, 0, .08, -2.10);
  if(!lo){
    [-.50, .50].forEach(s=>addPart(g, new THREE.BoxGeometry(.36, .16, .12), mats.grille, s, .20, -2.06));
  }
  buildHeadlights(g, mats, {spread:.70, y:.40, z:-1.95, w:.28, h:.10, d:.06});
  // Hood with aggressive vents
  addPart(g, new THREE.BoxGeometry(1.74, .08, 1.30), mats.paint, 0, .50, -1.00);
  if(!lo){
    [-.50, .50].forEach(s=>addPart(g, new THREE.BoxGeometry(.30, .04, .35), mats.matBlk, s, .56, -.90));
  }
  // Cabin — aerodynamic teardrop, narrow
  addPart(g, new THREE.BoxGeometry(1.58, .40, 1.20), mats.paint, 0, .70, -.15);
  addPart(g, new THREE.BoxGeometry(1.46, .50, .08), mats.glass, 0, .80, -.85, -.45);
  [-.79, .79].forEach(s=>addPart(g, new THREE.BoxGeometry(.06, .30, 1.00), mats.glass, s, .80, -.15));
  addPart(g, new THREE.BoxGeometry(1.32, .35, .08), mats.glassDark, 0, .80, .55, .50);
  addPart(g, new THREE.BoxGeometry(1.30, .04, .95), mats.paint, 0, .94, -.20);
  // Engine cover with carbon-look slats
  addPart(g, new THREE.BoxGeometry(1.62, .22, 1.20), mats.paint, 0, .60, .95);
  if(!lo){
    [-.45, -.15, .15, .45].forEach(s=>addPart(g, new THREE.BoxGeometry(.08, .04, 1.10), mats.matBlk, s, .73, .95));
  }
  // Side intakes positioned HIGH on the doors (McLaren signature)
  if(!lo){
    [-1.00, 1.00].forEach(s=>{
      addPart(g, new THREE.BoxGeometry(.05, .18, .80), mats.matBlk, s, .62, .25);
      addPart(g, new THREE.BoxGeometry(.04, .10, .65), mats.accent, s, .62, .25);
    });
  }
  buildWheelArches(g, mats.paint, {positions:[
    [-.99, .42, -1.40], [.99, .42, -1.40], [-.99, .42, 1.40], [.99, .42, 1.40]
  ]});
  addPart(g, new THREE.BoxGeometry(1.85, .22, .30), mats.paint, 0, .32, 1.95);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(1.65, .12, .32), mats.matBlk, 0, .12, 2.00);
    [-.40, 0, .40].forEach(s=>addPart(g, new THREE.BoxGeometry(.04, .16, .28), mats.blk, s, .14, 2.02));
  }
  // High mounted active rear wing (P1 signature) — taller stands
  [-.62, .62].forEach(s=>addPart(g, new THREE.BoxGeometry(.06, .42, .14), mats.matBlk, s, 1.00, 1.72));
  addPart(g, new THREE.BoxGeometry(1.78, .06, .38), mats.paint, 0, 1.24, 1.72);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(1.78, .03, .12), mats.matBlk, 0, 1.20, 1.62);
  }
  buildTaillights(g, mats, {spread:.70, y:.56, z:1.99, w:.32, h:.08, d:.05});
  // Single low-mounted exhaust pair (P1 has top-mounted exhausts but we keep low for silhouette readability)
  buildExhausts(g, mats, {spread:.30, y:.30, z:2.04, radius:.07, length:.28});
  buildSideSkirts(g, mats, {spread:.98, y:.10, z:0, length:2.6});
}

// ─────────────────────────────────────────────────────────────────────────────
// KOENIGSEGG JESKO — Swedish hypercar, very high rear wing, roof scoop,
// aggressive splitter, distinctive low fastback. Default white with blue.
// ─────────────────────────────────────────────────────────────────────────────
function buildKoenigseggJesko(g, def, mats, lod){
  const lo = lod === 'low';
  addPart(g, new THREE.BoxGeometry(1.90, .40, 4.20), mats.paint, 0, .25, 0);
  // Pointed sharp front
  addPart(g, new THREE.BoxGeometry(1.70, .22, .90), mats.paint, 0, .28, -1.95);
  addPart(g, new THREE.BoxGeometry(1.92, .08, .40), mats.matBlk, 0, .08, -2.15);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(.55, .14, .12), mats.grille, 0, .22, -2.08);
    [-.30, -.10, .10, .30].forEach(s=>addPart(g, new THREE.BoxGeometry(.08, .06, .04), mats.accent, s, .22, -2.14));
  }
  buildHeadlights(g, mats, {spread:.72, y:.42, z:-1.98, w:.30, h:.08, d:.06});
  addPart(g, new THREE.BoxGeometry(1.72, .08, 1.40), mats.paint, 0, .50, -1.05);
  // Cabin — fastback teardrop
  addPart(g, new THREE.BoxGeometry(1.62, .42, 1.30), mats.paint, 0, .72, -.10);
  addPart(g, new THREE.BoxGeometry(1.50, .50, .08), mats.glass, 0, .80, -.82, -.45);
  [-.81, .81].forEach(s=>addPart(g, new THREE.BoxGeometry(.06, .32, 1.10), mats.glass, s, .80, -.10));
  addPart(g, new THREE.BoxGeometry(1.42, .42, .08), mats.glassDark, 0, .80, .80, .55);
  addPart(g, new THREE.BoxGeometry(1.32, .04, 1.05), mats.paint, 0, .96, -.18);
  // ROOF SCOOP (Jesko signature) — visible vertical intake on the roof
  if(!lo){
    addPart(g, new THREE.BoxGeometry(.40, .18, .55), mats.matBlk, 0, 1.06, -.05);
    addPart(g, new THREE.BoxGeometry(.32, .12, .45), mats.accent, 0, 1.06, -.05);
  }
  // Engine cover
  addPart(g, new THREE.BoxGeometry(1.62, .20, 1.10), mats.paint, 0, .60, 1.05);
  // Side intakes
  if(!lo){
    [-1.00, 1.00].forEach(s=>{
      addPart(g, new THREE.BoxGeometry(.05, .22, .70), mats.matBlk, s, .55, .30);
    });
  }
  buildWheelArches(g, mats.paint, {positions:[
    [-1.00, .42, -1.45], [1.00, .42, -1.45], [-1.00, .42, 1.45], [1.00, .42, 1.45]
  ]});
  addPart(g, new THREE.BoxGeometry(1.86, .22, .28), mats.paint, 0, .32, 2.00);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(1.66, .14, .30), mats.matBlk, 0, .12, 2.05);
    [-.50, -.20, .20, .50].forEach(s=>addPart(g, new THREE.BoxGeometry(.04, .18, .28), mats.blk, s, .12, 2.05));
  }
  // VERY HIGH REAR WING (Jesko signature) — tallest stands of any car
  [-.72, .72].forEach(s=>addPart(g, new THREE.BoxGeometry(.06, .60, .14), mats.matBlk, s, 1.10, 1.65));
  addPart(g, new THREE.BoxGeometry(1.92, .06, .42), mats.paint, 0, 1.42, 1.65);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(1.90, .03, .12), mats.matBlk, 0, 1.38, 1.55);
    [-.96, .96].forEach(s=>addPart(g, new THREE.BoxGeometry(.04, .14, .42), mats.matBlk, s, 1.36, 1.65));
  }
  buildTaillights(g, mats, {spread:.74, y:.55, z:2.04, w:.30, h:.08, d:.05});
  // Quad exhausts (Jesko signature)
  if(!lo){
    [-.45, -.18, .18, .45].forEach(s=>{
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(.058, .058, .26, 8), mats.chrome);
      ex.rotation.x = Math.PI/2; ex.position.set(s, .28, 2.10); g.add(ex);
    });
  } else {
    buildExhausts(g, mats, {spread:.40, y:.28, z:2.10, radius:.06, length:.26});
  }
  buildSideSkirts(g, mats, {spread:.99, y:.10, z:0, length:2.7});
}

// ─────────────────────────────────────────────────────────────────────────────
// F1 SHARED — builds the chassis tub, sidepods, halo, cockpit, airbox.
// Wing/nose details differ per team and are added by the brand-specific
// builders that call this helper.
// ─────────────────────────────────────────────────────────────────────────────
function _buildF1Common(g, def, mats, lod){
  const lo = lod === 'low';
  // Chassis tub — narrow, long
  addPart(g, new THREE.BoxGeometry(.78, .26, 4.40), mats.paint, 0, .15, 0);
  // Bargeboards / floor extensions
  if(!lo){
    addPart(g, new THREE.BoxGeometry(2.00, .04, 3.40), mats.matBlk, 0, .04, 0);
  }
  // Sidepods
  [-1, 1].forEach(s=>{
    addPart(g, new THREE.BoxGeometry(.50, .30, 1.95), mats.paint, s*.85, .18, .35);
    if(!lo){
      // Sidepod intakes (front)
      addPart(g, new THREE.BoxGeometry(.40, .20, .12), mats.grille, s*.92, .22, -.50);
    }
  });
  // Cockpit opening (raised collar)
  addPart(g, new THREE.BoxGeometry(.66, .26, .80), mats.matBlk, 0, .30, .05);
  // Halo bar — torus arc above cockpit
  if(!lo){
    const halo = new THREE.Mesh(new THREE.TorusGeometry(.30, .035, 6, 16), mats.chrome);
    halo.position.set(0, .58, .05); g.add(halo);
    // Halo front strut
    addPart(g, new THREE.BoxGeometry(.05, .25, .05), mats.chrome, 0, .42, -.18);
  }
  // Engine airbox (above driver, behind cockpit) + roll hoop
  addPart(g, new THREE.BoxGeometry(.45, .35, .50), mats.paint, 0, .50, .55);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(.30, .20, .04), mats.matBlk, 0, .54, .30); // airbox intake mouth
  }
  // Engine cover sloping back
  addPart(g, new THREE.BoxGeometry(.50, .24, 1.10), mats.paint, 0, .42, 1.30);
  if(!lo){
    // Camera mount on top
    addPart(g, new THREE.BoxGeometry(.10, .06, .18), mats.matBlk, 0, .56, 1.00);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RED BULL RB F1 — pointed nose, twin-pillar rear wing, bull motif suggested
// by red accent stripes. Default dark blue with red accents.
// ─────────────────────────────────────────────────────────────────────────────
function buildRedBullRBF1(g, def, mats, lod){
  const lo = lod === 'low';
  _buildF1Common(g, def, mats, lod);
  // Pointed nose — long tapered cone (tip near front wing)
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(.05, .35, 1.80, 10), mats.paint);
  nose.rotation.z = Math.PI/2; nose.rotation.y = Math.PI/2; // align long axis with Z (forward)
  nose.position.set(0, .22, -2.10); g.add(nose);
  // Front wing — wide low plate
  addPart(g, new THREE.BoxGeometry(2.20, .04, .60), mats.paint, 0, .08, -2.55);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(2.20, .02, .12), mats.accent, 0, .12, -2.40); // upper element
    // Endplates
    [-1.10, 1.10].forEach(s=>addPart(g, new THREE.BoxGeometry(.05, .20, .55), mats.matBlk, s, .14, -2.55));
    // Front-wing element strakes
    [-.50, 0, .50].forEach(s=>addPart(g, new THREE.BoxGeometry(.04, .06, .50), mats.matBlk, s, .10, -2.55));
  }
  // Rear wing — twin-pillar, big plate
  [-.20, .20].forEach(s=>addPart(g, new THREE.BoxGeometry(.08, .42, .12), mats.matBlk, s, .56, 2.10));
  addPart(g, new THREE.BoxGeometry(2.10, .04, .42), mats.paint, 0, .80, 2.10);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(2.10, .02, .14), mats.accent, 0, .84, 2.16); // upper flap
    [-1.04, 1.04].forEach(s=>addPart(g, new THREE.BoxGeometry(.04, .26, .45), mats.matBlk, s, .76, 2.10));
  }
  // DRS pod / rain light at rear
  if(!lo){
    addPart(g, new THREE.BoxGeometry(.08, .08, .04), mats.tail, 0, .60, 2.22);
  }
  // Red accent stripe along sidepods (Red Bull livery)
  if(!lo){
    [-1.05, 1.05].forEach(s=>{
      addPart(g, new THREE.BoxGeometry(.04, .06, 1.80), mats.accent, s, .26, .35);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MERCEDES W14 F1 — longer nose, sleeker airbox, Mercedes star suggestion
// via chrome accents. Default teal with chrome accents.
// ─────────────────────────────────────────────────────────────────────────────
function buildMercedesW14F1(g, def, mats, lod){
  const lo = lod === 'low';
  _buildF1Common(g, def, mats, lod);
  // Slimmer, longer nose (Mercedes W14 styling)
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(.06, .30, 2.00, 10), mats.paint);
  nose.rotation.z = Math.PI/2; nose.rotation.y = Math.PI/2;
  nose.position.set(0, .22, -2.20); g.add(nose);
  // Front wing — flatter, more elements
  addPart(g, new THREE.BoxGeometry(2.20, .04, .60), mats.paint, 0, .08, -2.65);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(2.18, .02, .14), mats.chrome, 0, .12, -2.50);
    addPart(g, new THREE.BoxGeometry(2.16, .02, .10), mats.chrome, 0, .16, -2.42);
    [-1.10, 1.10].forEach(s=>addPart(g, new THREE.BoxGeometry(.05, .22, .55), mats.matBlk, s, .15, -2.65));
    [-.45, 0, .45].forEach(s=>addPart(g, new THREE.BoxGeometry(.04, .06, .50), mats.matBlk, s, .10, -2.65));
  }
  // Slimmer rear wing — single tall pillar each side
  [-.16, .16].forEach(s=>addPart(g, new THREE.BoxGeometry(.06, .50, .12), mats.matBlk, s, .60, 2.10));
  addPart(g, new THREE.BoxGeometry(2.00, .04, .38), mats.paint, 0, .88, 2.10);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(2.00, .02, .12), mats.chrome, 0, .92, 2.14);
    [-.99, .99].forEach(s=>addPart(g, new THREE.BoxGeometry(.04, .30, .42), mats.matBlk, s, .82, 2.10));
  }
  // DRS pod
  if(!lo){
    addPart(g, new THREE.BoxGeometry(.08, .08, .04), mats.tail, 0, .68, 2.22);
  }
  // Chrome accent stripe along sidepods (Mercedes silver arrow)
  if(!lo){
    [-1.05, 1.05].forEach(s=>{
      addPart(g, new THREE.BoxGeometry(.04, .04, 1.80), mats.chrome, s, .30, .35);
    });
    // Three-pointed star suggestion on nose (small chrome cross)
    addPart(g, new THREE.BoxGeometry(.16, .04, .04), mats.chrome, 0, .28, -1.55);
    addPart(g, new THREE.BoxGeometry(.04, .04, .16), mats.chrome, 0, .28, -1.55);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FORD MUSTANG — American muscle: rectangular front, long hood, short rear,
// hood scoop, square headlights, dual exhausts, beefy stance.
// Default white with blue accent.
// ─────────────────────────────────────────────────────────────────────────────
function buildFordMustang(g, def, mats, lod){
  const lo = lod === 'low';
  // Wider, taller chassis (muscle stance)
  addPart(g, new THREE.BoxGeometry(2.06, .56, 4.40), mats.paint, 0, .32, 0);
  // Squared front bumper
  addPart(g, new THREE.BoxGeometry(2.04, .42, .60), mats.paint, 0, .35, -2.10);
  addPart(g, new THREE.BoxGeometry(2.00, .08, .26), mats.matBlk, 0, .12, -2.30);
  // Big rectangular grille (Mustang signature)
  addPart(g, new THREE.BoxGeometry(1.40, .26, .12), mats.grille, 0, .42, -2.20);
  if(!lo){
    // Pony badge suggestion (small accent block on grille)
    addPart(g, new THREE.BoxGeometry(.20, .14, .04), mats.accent, 0, .42, -2.26);
    // Grille horizontal slats
    [-.40, 0, .40].forEach(s=>addPart(g, new THREE.BoxGeometry(.36, .03, .04), mats.matBlk, s, .42, -2.26));
  }
  // Square headlights (pairs)
  buildHeadlights(g, mats, {spread:.78, y:.50, z:-2.18, w:.32, h:.16, d:.08});
  if(!lo){
    // Inner secondary lights (Mustang triple-bar DRL)
    [-.78, .78].forEach(s=>{
      [.40, .50, .60].forEach(y=>addPart(g, new THREE.BoxGeometry(.30, .02, .04), mats.head, s, y, -2.22));
    });
  }
  // LONG hood with prominent scoop (muscle signature)
  addPart(g, new THREE.BoxGeometry(1.92, .12, 1.60), mats.paint, 0, .66, -1.10);
  if(!lo){
    // Hood scoop (centre raised bump)
    addPart(g, new THREE.BoxGeometry(.55, .14, .80), mats.paint, 0, .76, -1.10);
    addPart(g, new THREE.BoxGeometry(.50, .04, .12), mats.matBlk, 0, .82, -1.40); // scoop opening
  }
  // Cabin — boxier than super, shorter
  addPart(g, new THREE.BoxGeometry(1.86, .50, 1.70), mats.paint, 0, .85, .25);
  addPart(g, new THREE.BoxGeometry(1.70, .56, .08), mats.glass, 0, .92, -.62, -.36);
  [-.93, .93].forEach(s=>addPart(g, new THREE.BoxGeometry(.06, .40, 1.50), mats.glass, s, .92, .25));
  // Rear glass — more vertical (fastback but less aggressive than super)
  addPart(g, new THREE.BoxGeometry(1.62, .50, .08), mats.glass, 0, .92, 1.06, .30);
  addPart(g, new THREE.BoxGeometry(1.60, .04, 1.40), mats.paint, 0, 1.16, .25);
  // Trunk lid
  addPart(g, new THREE.BoxGeometry(1.84, .14, 1.05), mats.paint, 0, .68, 1.55);
  // Wheel arches (muscle: bigger flares)
  buildWheelArches(g, mats.paint, {positions:[
    [-1.06, .50, -1.50], [1.06, .50, -1.50], [-1.06, .50, 1.50], [1.06, .50, 1.50]
  ]});
  // Rear bumper
  addPart(g, new THREE.BoxGeometry(2.00, .30, .30), mats.paint, 0, .38, 2.10);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(1.85, .10, .28), mats.matBlk, 0, .14, 2.16);
  }
  // Three-bar tail lights (Mustang signature) — three vertical segments per side
  if(!lo){
    [-.78, .78].forEach(s=>{
      [-.18, 0, .18].forEach(zo=>addPart(g, new THREE.BoxGeometry(.22, .14, .05), mats.tail, s + zo*.0, .50, 2.16));
    });
  } else {
    buildTaillights(g, mats, {spread:.80, y:.50, z:2.16, w:.36, h:.14, d:.05});
  }
  // Wide-stance dual exhausts (muscle car signature)
  buildExhausts(g, mats, {spread:.78, y:.22, z:2.20, radius:.085, length:.34});
  // ICONIC dual centre racing stripes (Mustang heritage). Three segments
  // per stripe so they ride the body shape — over the hood, over the roof,
  // over the trunk — instead of clipping inside the bodywork. Two parallel
  // stripes spaced ±.20 from centre. Width .22 makes them clearly visible
  // (the previous .10-wide stripes were lost on the white paint).
  if(!lo){
    [-.20, .20].forEach(s=>{
      // Hood segment — sits on top of the hood scoop area
      addPart(g, new THREE.BoxGeometry(.22, .04, 1.60), mats.accent, s, .73, -1.10);
      // Roof segment — over the cabin peak
      addPart(g, new THREE.BoxGeometry(.22, .04, 1.50), mats.accent, s, 1.18, .25);
      // Trunk segment — across the rear deck
      addPart(g, new THREE.BoxGeometry(.22, .04, 1.05), mats.accent, s, .76, 1.55);
    });
  }
  buildSideSkirts(g, mats, {spread:1.04, y:.16, z:0, length:2.8});
}

// ─────────────────────────────────────────────────────────────────────────────
// TESLA MODEL S — smooth fastback sedan, NO grille (solid front plate),
// glass roof suggestion, flush wheel arches, minimal taillights.
// Default silver.
// ─────────────────────────────────────────────────────────────────────────────
function buildTeslaModelS(g, def, mats, lod){
  const lo = lod === 'low';
  // Smooth chassis — slightly higher than super (sedan stance)
  addPart(g, new THREE.BoxGeometry(2.00, .46, 4.40), mats.paint, 0, .28, 0);
  // SMOOTH front (no grille — Tesla signature)
  addPart(g, new THREE.BoxGeometry(1.86, .32, .80), mats.paint, 0, .32, -2.05);
  // Lower air intake (subtle, no grille slats)
  if(!lo){
    addPart(g, new THREE.BoxGeometry(1.20, .08, .14), mats.matBlk, 0, .18, -2.20);
  }
  // Smooth front splitter
  addPart(g, new THREE.BoxGeometry(1.94, .04, .20), mats.matBlk, 0, .08, -2.22);
  // Slim modern headlights (LED bar style)
  buildHeadlights(g, mats, {spread:.78, y:.44, z:-2.10, w:.36, h:.06, d:.06});
  if(!lo){
    // Inner LED light strip (Tesla signature)
    [-.78, .78].forEach(s=>addPart(g, new THREE.BoxGeometry(.36, .02, .04), mats.head, s, .50, -2.16));
  }
  // Long sloping hood (no scoop, smooth)
  addPart(g, new THREE.BoxGeometry(1.86, .06, 1.45), mats.paint, 0, .54, -1.10);
  // Cabin — fastback teardrop with LARGE glass area (Tesla glass roof)
  addPart(g, new THREE.BoxGeometry(1.78, .44, 1.80), mats.paint, 0, .76, .15);
  addPart(g, new THREE.BoxGeometry(1.66, .50, .08), mats.glass, 0, .82, -.78, -.40);
  [-.89, .89].forEach(s=>addPart(g, new THREE.BoxGeometry(.06, .36, 1.60), mats.glass, s, .84, .15));
  // Glass roof (Model S signature — almost the entire roof is glass)
  addPart(g, new THREE.BoxGeometry(1.50, .04, 1.40), mats.glassDark, 0, 1.00, .15);
  addPart(g, new THREE.BoxGeometry(1.66, .04, .20), mats.paint, 0, 1.00, -.55); // front roof rail
  addPart(g, new THREE.BoxGeometry(1.66, .04, .20), mats.paint, 0, 1.00, .85); // rear roof rail
  // Sloping fastback rear glass
  addPart(g, new THREE.BoxGeometry(1.60, .42, .08), mats.glassDark, 0, .80, 1.05, .50);
  // Trunk lid
  addPart(g, new THREE.BoxGeometry(1.88, .18, .90), mats.paint, 0, .58, 1.65);
  // Smooth wheel arches (less bulgy than super)
  buildWheelArches(g, mats.paint, {positions:[
    [-1.02, .42, -1.50], [1.02, .42, -1.50], [-1.02, .42, 1.50], [1.02, .42, 1.50]
  ]});
  // Flush door handles (Tesla signature) — thin chrome lines
  if(!lo){
    [-1.01, 1.01].forEach(s=>{
      addPart(g, new THREE.BoxGeometry(.04, .04, .25), mats.chrome, s, .56, -.30);
      addPart(g, new THREE.BoxGeometry(.04, .04, .25), mats.chrome, s, .56, .50);
    });
  }
  // Smooth rear bumper
  addPart(g, new THREE.BoxGeometry(1.94, .22, .28), mats.paint, 0, .34, 2.10);
  if(!lo){
    addPart(g, new THREE.BoxGeometry(1.74, .08, .26), mats.matBlk, 0, .16, 2.16);
  }
  // Subtle slim tail lights (Tesla style — single thin bar)
  buildTaillights(g, mats, {spread:.66, y:.52, z:2.14, w:.34, h:.06, d:.04});
  if(!lo){
    // Connecting light bar between tails (modern Tesla signature)
    addPart(g, new THREE.BoxGeometry(1.30, .04, .04), mats.tail, 0, .52, 2.16);
  }
  // NO exhaust (electric vehicle)
  buildSideSkirts(g, mats, {spread:1.00, y:.12, z:0, length:2.8});
}

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRY — maps def.brand to its builder. All 12 brands now have explicit
// builders; the legacy parametric fallback in build.js is dead code and
// removed in this PR.
// ─────────────────────────────────────────────────────────────────────────────
const BRAND_BUILDERS = {
  'FERRARI':     buildFerrariSF90,
  'BUGATTI':     buildBugattiChiron,
  'LAMBORGHINI': buildLamborghiniHuracan,
  'MASERATI':    buildMaseratiMC20,
  'AUDI':        buildAudiR8,
  'PORSCHE':     buildPorscheGT3RS,
  'MCLAREN':     buildMcLarenP1,
  'KOENIGSEGG':  buildKoenigseggJesko,
  'RED BULL':    buildRedBullRBF1,
  'MERCEDES':    buildMercedesW14F1,
  'FORD':        buildFordMustang,
  'TESLA':       buildTeslaModelS
};

window.BRAND_BUILDERS = BRAND_BUILDERS;
window.buildFerrariSF90 = buildFerrariSF90;
window.buildBugattiChiron = buildBugattiChiron;
window.buildLamborghiniHuracan = buildLamborghiniHuracan;
window.buildMaseratiMC20 = buildMaseratiMC20;
window.buildAudiR8 = buildAudiR8;
window.buildPorscheGT3RS = buildPorscheGT3RS;
window.buildMcLarenP1 = buildMcLarenP1;
window.buildKoenigseggJesko = buildKoenigseggJesko;
window.buildRedBullRBF1 = buildRedBullRBF1;
window.buildMercedesW14F1 = buildMercedesW14F1;
window.buildFordMustang = buildFordMustang;
window.buildTeslaModelS = buildTeslaModelS;
