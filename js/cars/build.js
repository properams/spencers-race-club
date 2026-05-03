// js/cars/build.js — entry point for car building.
// Non-module script. Loaded AFTER car-parts.js + brands.js.
//
// makeCar(def): looks up the brand-specific builder in BRAND_BUILDERS by
// def.brand, runs it to construct the body, then attaches wheels via the
// shared buildAllWheels helper. All 12 brands ship with explicit builders;
// any unknown brand throws so missing entries surface immediately.
//
// makeAllCars() — places all 9 race entrants on the grid (unchanged from
// the legacy implementation).

'use strict';

// Cached alpha-mask for soft headlight cones. Painted once, reused across
// all car beam meshes. Radial gradient: bright on cone-axis (UV center
// horizontally), fading to zero at radial edges. Vertical (along beam
// axis) is brightest at the tip and falls off toward the base so a tight
// throw blends into ambient.
let _softHeadlightTex = null;
function _softHeadlightMaskTex(){
  if (_softHeadlightTex) return _softHeadlightTex;
  const W=128, H=128;
  const c=document.createElement('canvas'); c.width=W; c.height=H;
  const g=c.getContext('2d');
  // U wraps around the cone (no azimuthal masking — the geometry itself
  // defines beam shape). V runs along the cone axis: brightest at the tip,
  // fades to ~15% at the base so a tight throw blends into ambient.
  const img = g.createImageData(W,H);
  const d = img.data;
  for (let y=0;y<H;y++){
    const v = y/(H-1);
    const vF = Math.pow(1-v, 1.4) * 0.85 + 0.15;
    const alpha = Math.round(vF * 255);
    for (let x=0;x<W;x++){
      const i = (y*W+x)*4;
      d[i]=255; d[i+1]=247; d[i+2]=210; d[i+3]=alpha;
    }
  }
  g.putImageData(img,0,0);
  _softHeadlightTex = new THREE.CanvasTexture(c);
  _softHeadlightTex.needsUpdate = true;
  // Texture is procedurally generated once and held forever — flag shared
  // so disposeScene won't kill it when the next race rebuilds cars.
  _softHeadlightTex.userData = { _sharedAsset:true };
  return _softHeadlightTex;
}

function makeCar(def){
  const lod = (typeof carLOD === 'function') ? carLOD() : 'high';
  const brandBuilder = window.BRAND_BUILDERS && window.BRAND_BUILDERS[def.brand];
  if(!brandBuilder){
    if(window.dbg) dbg.error('cars', new Error('No builder'), 'No BRAND_BUILDERS entry for: '+def.brand);
    throw new Error('No car builder registered for brand: '+def.brand);
  }
  const g = new THREE.Group();
  const shared = getSharedCarMats();
  const paintMats = makePaintMats(def);
  const mats = Object.assign({}, shared, paintMats);
  brandBuilder(g, def, mats, lod);
  // Brand-builders kunnen wheel-style opts (drilled disc, branded caliper)
  // op g.userData._wheelOpts zetten — buildAllWheels leest die door. Pilot
  // gebruikt dit voor Bugatti; Phase 3 rolt het uit naar Tier S/A.
  buildAllWheels(g, def, mats, lod, undefined, g.userData && g.userData._wheelOpts);
  return g;
}


function makeAllCars(){
  carObjs.forEach(c=>scene.remove(c.mesh));carObjs=[];
  _reverseLights.length=0;
  // Build ordered def list — player goes to pole, AI fill the rest
  const playerDef=CAR_DEFS.find(d=>d.id===selCarId)||CAR_DEFS[0];
  const orderedDefs=[playerDef,...CAR_DEFS.filter(d=>d.id!==selCarId)];

  // ── Per-world start T: always on the main straight approaching S/F ──────
  // Each world's straight is different. We use t=0.93..0.99 range for GP,
  // and similar near-0 ranges for other worlds — but always on straight sections.
  const _worldGridT={
    grandprix:0.955,  // GP final straight approaching t=0
    space:0.940,      // Space: last WP at ~0.94, straight into t=0
    deepsea:0.940,    // DeepSea: last WP at ~0.94, straight into t=0
    candy:0.940,      // Candy: last WP at ~0.96, straight into t=0
    neoncity:0.935,   // Neon City: last WP at ~0.94, straight into t=0
    volcano:0.940,
    arctic:0.940,
  };
  // How many track units between each grid row
  const _rowGap=0.014; // slightly wider gap for cleaner grid separation

  orderedDefs.forEach((def,i)=>{
    const mesh=makeCar(def);
    const row=Math.floor(i/2),col=i%2;
    // t decreases as we go further behind the S/F line
    const baseT=_worldGridT[activeWorld]||0.955;
    const t0=((baseT - row*_rowGap)+1)%1;
    const pt=trackCurve.getPoint(t0);
    const tg=trackCurve.getTangent(t0).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    // Clean F1-style 2-wide grid: left col slightly ahead (stagger)
    const colSign=col===0?-1:1;
    const lateralOffset=colSign*4.5;
    const fwdStagger=col===0?0.8:0; // left column (pole side) slightly ahead
    mesh.position.copy(pt)
      .addScaledVector(nr,lateralOffset)
      .addScaledVector(tg,fwdStagger);
    mesh.position.y=0.35;
    // Face exactly the track direction at this point
    mesh.rotation.set(0,Math.atan2(-tg.x,-tg.z),0);
    scene.add(mesh);
    const isPlayer=def.id===selCarId;if(isPlayer)playerIdx=carObjs.length;
    // Reverse light (red box at rear)
    const rlGeo=new THREE.BoxGeometry(.34,.1,.04);
    const rlMat=new THREE.MeshLambertMaterial({color:0xff2200,emissive:0xff2200,emissiveIntensity:0});
    const rl=new THREE.Mesh(rlGeo,rlMat);
    const bL=def.type==='muscle'?4.35:def.type==='f1'?4.5:4.05;
    rl.position.set(0,.28,bL*.5+.02);
    mesh.add(rl);
    _reverseLights.push(rl);
    // Per-world livery underglow — additive disc plane onder elke auto met
    // een wereld-thematische kleur. Geeft een herkenbare per-circuit feel
    // zonder de individuele car-colors te overschrijven. Met bloom = subtle
    // pulse-glow rondom alle racers.
    if(!isPlayer){
      const livery={
        space:0x4488ff,deepsea:0x00ffaa,candy:0xff66cc,
        neoncity:0xff00cc,volcano:0xff5500,arctic:0x88ccff,
        themepark:0xff44aa,grandprix:0xffaa44
      }[activeWorld]||0xffaa44;
      const ugMat=new THREE.MeshBasicMaterial({
        color:livery,transparent:true,opacity:.42,
        blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide
      });
      const ug=new THREE.Mesh(new THREE.CircleGeometry(2.0,16),ugMat);
      ug.rotation.x=-Math.PI/2;ug.position.y=-.32;
      mesh.add(ug);
    }
    // Phase 2.6 pilot — Bugatti player krijgt op alle worlds een accent-
    // colored underglow (zelfde additive disc-pattern als AI). Branded
    // signature die de pilot car onderscheidt van de andere 11 cars op het
    // grid. Phase 3 generaliseert via Tier S/A flag op def.
    if(isPlayer && def.brand === 'BUGATTI'){
      const accentColor = (typeof def.accent === 'string') ? parseInt(def.accent,16) : def.accent;
      const ugMat=new THREE.MeshBasicMaterial({
        color:accentColor,transparent:true,opacity:.35,
        blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide
      });
      const ug=new THREE.Mesh(new THREE.CircleGeometry(2.2,16),ugMat);
      ug.rotation.x=-Math.PI/2;ug.position.y=-.32;
      mesh.add(ug);
    }
    // Player headlight beam-cones (alleen zichtbaar bij night) — ConeGeometry
    // met radial alpha-mask zodat de buitenrand zacht uitfade't (geen polygon-
    // edges meer zichtbaar). Additive blend, depth-write off. Animated opacity
    // in updateCarLights() voegt subtiele flicker toe.
    if(isPlayer){
      const beamMat=new THREE.MeshBasicMaterial({
        color:0xfff5d0,
        map:_softHeadlightMaskTex(),
        transparent:true,opacity:0,
        blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide
      });
      // 32 radial segments + 8 height segments zodat de UV-gradient soepel
      // resampelt — geen visible faceting meer onder additive. Op mobile
      // halveren we beide assen — additive transparent op een 32×8 cone is
      // fillrate-zwaar; 16×4 is visueel nauwelijks anders bij race-snelheid.
      const segR = window._isMobile ? 16 : 32;
      const segH = window._isMobile ? 4  : 8;
      const coneGeo=new THREE.ConeGeometry(2.6,12,segR,segH,true);
      [-0.62,0.62].forEach(s=>{
        const beam=new THREE.Mesh(coneGeo,beamMat.clone());
        // Cone default points up (+Y) → roteer 90° rond X zodat top naar achter
        // wijst en base naar voren (in car-local -Z = forward)
        beam.rotation.x=-Math.PI/2;
        // Position: tip (top) bij headlight, base 12 units voor de auto
        beam.position.set(s,0.45,-7.9);
        beam.userData.isHeadBeam=true;
        beam.userData.flickerPhase=Math.random()*Math.PI*2;
        mesh.add(beam);
      });
    }
    // Small initial lateral offset so AI don't all drive on the exact center line
    // (kept near zero at start to prevent collision; grows naturally during race)
    const latOff=isPlayer?0:(col===0?-1.2:1.2)+(Math.random()-.5)*.8;
    const personality=_aiPersonality[def.id]||{aggr:.6,consist:.7};
    carObjs.push({mesh,speed:0,vy:0,progress:t0,prevProg:t0,lap:0,isPlayer,def,finished:false,
      boostTimer:0,spinTimer:0,inAir:false,lateralOff:latOff,bestLap:null,_lapStart:null,_finishTime:null,
      tireWear:0,hitCount:0,smokeSrc:null,_personality:personality});
  });
  // Reset nearest-miss cooldowns
  for(let i=0;i<carObjs.length;i++)_nearMissCooldown[i]=0;
  // Reset pit stop
  _pitStopActive=false;_pitStopTimer=0;_pitStopUsed=false;
  _overallFastestLap=Infinity;
  // Init near-miss cooldowns for all cars
  for(let i=0;i<CAR_DEFS.length;i++)_nearMissCooldown[i]=0;
}
