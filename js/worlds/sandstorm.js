// js/worlds/sandstorm.js — Sandstorm Canyon world builders + update.
// Non-module script. Cloned from worlds/volcano.js as the rebuild template
// (warm palette + lap-progressive horizon hazard + procedural props match
// sandstorm's intent better than any other world).
//
// Phase 3: full visuele upgrade per checklist — gestapelde strata cliffs,
// layered sphinx, sokkel'd obelisks, fan-leaved palms, per-instance jitter,
// background mesas with atmospheric fog-tint, weathered tempel ruins.
// Hazard is still a Phase-2 stub; lap-progressive storm wires in Phase 4.

'use strict';

// Track-section ranges as t-values along trackCurve.
const _SS_DUNES_T_RANGES = [[0.00,0.28],[0.88,1.00]];
const _SS_SLOT_T_RANGE   = [0.32,0.62];
const _SS_PLAZA_T_RANGE  = [0.70,0.86];

// ── Procedural canvas textures (recycled from sandstorm.old.js) ──
//
// Phase-3A swap: cliffs + mesas now use ProcTextures.rockStrata
// (centralised in js/effects/proc-textures.js). The old _ssRockTex inline
// canvas — and _ssDisplaceCliffGeometry helper that went with the per-
// panel cliff approach — were removed in this commit; their consumers
// migrated to ProcGeometry.strataStack which embeds displacement.
// Sandstone _ssSandstoneTex below stays for now — Phase 3B (pillaren +
// obelisken) is its only remaining caller and will swap it.

// Sandstone canvas with soft horizontal weathering — used by tempel ruins,
// obelisks, sphinx body. Lighter base than canyon rock; subtle vertical
// fluting + age-staining.
function _ssSandstoneTex(){
  const S=256,c=document.createElement('canvas');c.width=S;c.height=S;
  const g=c.getContext('2d');
  g.fillStyle='#b89370';g.fillRect(0,0,S,S);
  // Pixel noise (light)
  const id=g.getImageData(0,0,S,S),d=id.data;
  for(let i=0;i<d.length;i+=4){
    const n=Math.random()*40-20|0;
    d[i]=Math.max(0,Math.min(255,d[i]+n));
    d[i+1]=Math.max(0,Math.min(255,d[i+1]+n*.85|0));
    d[i+2]=Math.max(0,Math.min(255,d[i+2]+n*.6|0));
  }
  g.putImageData(id,0,0);
  // Vertical fluting (subtle, every 32px)
  for(let x=0;x<S;x+=32){
    g.fillStyle='rgba(80,55,35,0.18)';
    g.fillRect(x,0,2,S);
  }
  // Age-staining: a few darker streaks running down
  for(let i=0;i<6;i++){
    const x=Math.random()*S,wd=8+Math.random()*16;
    const grd=g.createLinearGradient(x,0,x,S);
    grd.addColorStop(0,'rgba(60,38,22,0.0)');
    grd.addColorStop(0.4,'rgba(60,38,22,0.30)');
    grd.addColorStop(1,'rgba(60,38,22,0.05)');
    g.fillStyle=grd;g.fillRect(x,0,wd,S);
  }
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(1,2);t.anisotropy=window._isMobile?2:4;t.needsUpdate=true;return t;
}

function _ssPalmLeafTex(){
  const W=128,H=64,c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d');
  g.clearRect(0,0,W,H);
  // Base shadow (darker) leaf shape, then highlight (lighter) on top —
  // 2-tone canvas eliminates the "platte single-color" look from the
  // previous build.
  g.fillStyle='#2c4818';
  g.beginPath();
  g.moveTo(0,H*.5);
  for(let i=1;i<=20;i++){
    const x=i*W/20;
    const y=H*.5+Math.sin((i/20)*Math.PI)*-22;
    g.lineTo(x,y);
  }
  for(let i=20;i>=0;i--){
    const x=i*W/20;
    const y=H*.5+Math.sin((i/20)*Math.PI)*22;
    g.lineTo(x,y);
  }
  g.closePath();g.fill();
  // Spine (lighter green over the dark base)
  g.fillStyle='#5a8a28';g.fillRect(0,H*.5-1,W,2);
  // Leaflet ribs (2-tone: lighter highlight side, darker shadow side)
  g.lineWidth=2;
  for(let i=0;i<14;i++){
    const x=4+i*(W-8)/13;
    const lenT=Math.sin((i/13)*Math.PI);
    const lf=14*lenT;
    g.strokeStyle='#86b540';
    g.beginPath();g.moveTo(x,H*.5);g.lineTo(x-2,H*.5-lf);g.stroke();
    g.strokeStyle='#3a5a18';
    g.beginPath();g.moveTo(x,H*.5);g.lineTo(x-2,H*.5+lf);g.stroke();
  }
  const t=new THREE.CanvasTexture(c);
  t.needsUpdate=true;return t;
}

function _ssTentStripeTex(){
  const W=128,H=128,c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d');
  const colors=['#a04020','#f0d8a0','#c08850'];
  for(let y=0;y<H;y+=12){
    g.fillStyle=colors[(y/12)%colors.length|0];
    g.fillRect(0,y,W,12);
  }
  const id=g.getImageData(0,0,W,H),d=id.data;
  for(let i=0;i<d.length;i+=4){
    const n=(Math.random()-0.5)*30|0;
    d[i]=Math.max(0,Math.min(255,d[i]+n));
    d[i+1]=Math.max(0,Math.min(255,d[i+1]+n));
    d[i+2]=Math.max(0,Math.min(255,d[i+2]+n));
  }
  g.putImageData(id,0,0);
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.needsUpdate=true;return t;
}

function _ssScarabSignTex(){
  const W=128,H=96,c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d');
  g.fillStyle='#7a4818';g.fillRect(0,0,W,H);
  g.strokeStyle='rgba(40,20,8,0.5)';g.lineWidth=1;
  for(let y=8;y<H;y+=10){
    g.beginPath();g.moveTo(0,y+Math.sin(y*.2)*1.5);g.lineTo(W,y+Math.cos(y*.2)*1.5);g.stroke();
  }
  g.fillStyle='#1a0e04';
  g.beginPath();g.ellipse(W/2,H/2+4,18,22,0,0,Math.PI*2);g.fill();
  g.strokeStyle='#0a0500';g.lineWidth=1.5;
  g.beginPath();g.moveTo(W/2,H/2-12);g.lineTo(W/2,H/2+22);g.stroke();
  g.beginPath();g.ellipse(W/2,H/2-15,8,5,0,0,Math.PI*2);g.fill();
  g.fillRect(W/2-10,H/2-22,3,8);g.fillRect(W/2+7,H/2-22,3,8);
  g.lineWidth=2;
  for(let i=0;i<3;i++){
    const yo=H/2-6+i*10;
    g.beginPath();g.moveTo(W/2-16,yo);g.lineTo(W/2-26,yo+3);g.stroke();
    g.beginPath();g.moveTo(W/2+16,yo);g.lineTo(W/2+26,yo+3);g.stroke();
  }
  const t=new THREE.CanvasTexture(c);t.needsUpdate=true;return t;
}

// (Removed: _ssDisplaceCliffGeometry — per-PlaneGeometry vertex displacement
//  helper that went with the legacy 48-wall cliff implementation. The
//  Phase-3A strataStack-based cliffs embed displacement in ProcGeometry, so
//  this helper has no remaining callers.)

// Per-world animated state — gereset bij world-switch via core/scene.js
// disposeScene() (geometry/material/textures cleared) + race.js
// _resetRaceState() (refs hier op null gezet door de world-switch flow).
let _sandstormSandSwept=null;    // sand-haze fill light
let _sandstormFlecksGeo=null;    // ambient wind-fleck particle BufferGeometry
let _sandstormFlecks=null;       // Points mesh
let _sandstormPalmLeaves=[];     // [{im, baseAng, amp}] for wind-sway animation

// ── Section builders ──────────────────────────────────────────────────────

// (Background mesas removed in post-review fix. core/scene.js calls the
// shared buildBackgroundLayers() helper for sandstorm, which already emits
// 2 cylinder horizon-layers via _SILHOUETTE_PALETTES.sandstorm in
// track/environment.js. Adding our own mesa-rings would have produced
// FOUR redundant cylinders around the horizon. The bespoke mesa-strata
// canvas-look is sacrificed to avoid the duplication; if needed, extend
// _SILHOUETTE_PALETTES with an optional customTex callback — that's a
// cross-world helper change and out-of-scope for this rebuild.)

// Canyon cliffs — gestapelde strata (3 layers), elk met eigen displacement
// + per-layer color shift. 8 segments × 2 sides on the slot-canyon t-range.
//
// Materials are hoisted ONCE per strata layer (3 mats total instead of 48
// unique mats — one per panel as the previous draft did). Geometry stays
// Canyon cliffs — Phase-3A rebuild via ProcGeometry.strataStack.
// Each cliff is now a single BufferGeometry with vertex-color blended
// strata seams (4 stratum layers per cliff). 6-10 free-standing buttes
// scattered along the slot-canyon t-range — each one a Monument-Valley
// style formation, not a tiled wall. This is the visual fix for the
// "stack of plates" feel: ONE mesh per cliff, smooth color transitions
// at strata boundaries via vertexColors.
//
// Material: MeshStandardMaterial + ProcTextures.rockStrata (PBR pipeline,
// vertexColors:true so the strata blend reads). Per-cliff cloned material
// so applyAtmosphericPerspective can lerp distant cliffs into fog
// (Variant A pattern from proc-geometry).
//
// Talud (rubble at base): 4-5 beveledBox rocks per cliff via single
// shared InstancedMesh. Skipped on mobile.
function _ssBuildCanyonCliffs(){
  const mob=window._isMobile;
  const COUNT=mob?6:10;
  const lod=mob?1:0;
  // One shared rock-strata texture across all cliffs (cached by ProcTextures
  // LRU). Per-cliff material clones swap colour for atmospheric blend, but
  // the map stays shared.
  const stoneTex=ProcTextures.rockStrata({
    bandCount:5,
    baseColor:'#a86839',
    stratColors:['#7a3a1d','#a8643a','#8b4a25','#b87850','#cf8e60'],
    ageWear:0.4,
    repeatX:1, repeatY:1
  });
  const baseCliffMat=new THREE.MeshStandardMaterial({
    map:stoneTex,
    roughness:0.92,
    metalness:0,
    vertexColors:true,    // strataStack puts r/g/b on each vertex
    flatShading:false
  });
  // Talud: instanced beveled rocks at the base.
  const ROCKS_PER=mob?0:5;
  let taludIM=null;
  let taludIdx=0;
  const _dummy=new THREE.Object3D();
  if(ROCKS_PER>0){
    const rockGeo=ProcGeometry.beveledBox({w:1.5,h:0.8,d:1.5,bevel:0.15});
    const rockMat=new THREE.MeshStandardMaterial({
      color:0x7a3a1c, roughness:0.95, metalness:0
    });
    taludIM=new THREE.InstancedMesh(rockGeo, rockMat, COUNT*ROCKS_PER);
  }
  const [tStart,tEnd]=_SS_SLOT_T_RANGE;
  for(let i=0;i<COUNT;i++){
    const t=tStart+(i+0.5)*((tEnd-tStart)/COUNT);
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0)?1:-1;
    const off=BARRIER_OFF+6+Math.random()*4;
    const cx=p.x+nr.x*side*off;
    const cz=p.z+nr.z*side*off;
    // Per-cliff strata def — slight per-cliff variance so the canyon
    // doesn't read as a uniform array of identical formations.
    const baseR=7+Math.random()*2;
    const cliffGeo=ProcGeometry.strataStack({
      strata:[
        {height:3, radius:baseR+1.0, color:'#7a3a1d', displaceAmount:0.30},
        {height:6, radius:baseR,     color:'#a8643a', displaceAmount:0.20},
        {height:8, radius:baseR-0.5, color:'#8b4a25', displaceAmount:0.25},
        {height:4, radius:baseR-1.0, color:'#b87850', displaceAmount:0.15}
      ],
      totalSides: mob?7:10,
      blendRange:0.4,
      seed:1337+i*53,
      lod:lod
    });
    // Per-cliff material clone — required for atmospheric perspective
    // (Variant A: applyAtmosphericPerspective mutates material.color).
    // Note: baseCliffMat is freshly `new MeshStandardMaterial(...)` and
    // carries no userData._sharedAsset flag, so the clone is correctly
    // disposed by disposeScene's _disposeMat traversal on world-switch.
    const cliffMat=baseCliffMat.clone();
    const cliff=new THREE.Mesh(cliffGeo, cliffMat);
    cliff.position.set(cx, 0, cz);
    cliff.rotation.y=Math.random()*Math.PI*2;
    scene.add(cliff);
    // Atmospheric perspective for cliffs >150u from anchor (track centre).
    const distToCenter=Math.hypot(cx,cz);
    if(distToCenter>150){
      ProcGeometry.applyAtmosphericPerspective(cliff, {
        fogColor:'#e8b878',
        startDistance:150,
        fullBlendDistance:400,
        cameraAnchor:new THREE.Vector3(0,0,0),
        maxBlend:0.6
      });
    }
    // Talud rubble rocks at the foot of this cliff
    if(taludIM){
      for(let r=0;r<ROCKS_PER;r++){
        const ang=Math.random()*Math.PI*2;
        const rDist=baseR+1+Math.random()*2;
        _dummy.position.set(
          cx+Math.cos(ang)*rDist,
          0.4+Math.random()*0.3,
          cz+Math.sin(ang)*rDist
        );
        const sc=0.6+Math.random()*0.7;
        _dummy.scale.set(sc*1.3, sc, sc*1.1);
        _dummy.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI*2, Math.random()*Math.PI);
        _dummy.updateMatrix();
        taludIM.setMatrixAt(taludIdx++, _dummy.matrix);
      }
    }
  }
  if(taludIM){
    taludIM.count=taludIdx;
    taludIM.instanceMatrix.needsUpdate=true;
    scene.add(taludIM);
  }
}

// Background mesa's — Phase-3A 3-tier depth scaffold via organicCylinder
// + atmospheric perspective. Foreground/midground/background tiers placed
// on radial bands around the track-centre at distances 150/250/400.
// Each mesa has unique cloned material so its color can lerp toward fog.
// Pattern matches Monument Valley silhouette layering — 3 distinct depth
// reads even when foreground is occluded by cliffs.
function _ssBuildBackgroundMesas(){
  const mob=window._isMobile;
  const lod=mob?1:0;
  const stoneTex=ProcTextures.rockStrata({
    bandCount:4,
    baseColor:'#8b4a25',
    stratColors:['#6a3018','#8b4a25','#a8643a','#b87850'],
    ageWear:0.3
  });
  const baseMat=new THREE.MeshStandardMaterial({
    map:stoneTex,
    color:0xcc8d60,
    roughness:0.95,
    metalness:0,
    flatShading:false
  });
  // Mobile: skip the background tier (only 2 layers, halved counts) so the
  // far-distance fillrate stays manageable.
  const tiers = mob
    ? [
        { distance:150, count:4, sides:8, displaceAmount:0.4, maxBlend:0.4 },
        { distance:250, count:3, sides:6, displaceAmount:0.3, maxBlend:0.65 }
      ]
    : [
        { distance:150, count:6, sides:8, displaceAmount:0.4, maxBlend:0.4 },
        { distance:250, count:6, sides:6, displaceAmount:0.3, maxBlend:0.65 },
        { distance:400, count:4, sides:5, displaceAmount:0.2, maxBlend:0.85 }
      ];
  tiers.forEach((tier,ti)=>{
    for(let i=0;i<tier.count;i++){
      // Spread evenly around the track-centre with per-tier angle phase.
      const ang=(i/tier.count)*Math.PI*2 + (ti*0.4);
      const dist=tier.distance + (Math.random()-0.5)*40;
      const cx=Math.cos(ang)*dist;
      const cz=Math.sin(ang)*dist;
      // Larger mesas at far distance so they read at scale
      const baseRadius=14+Math.random()*8 + (ti*4);
      const height=22+Math.random()*16 + (ti*6);
      const mesaGeo=ProcGeometry.organicCylinder({
        sides:tier.sides,
        topRadius:baseRadius*0.85,
        bottomRadius:baseRadius,
        height:height,
        displaceAmount:tier.displaceAmount,
        seed:31+i*17+ti*73,
        lod:lod
      });
      // Per-mesa unique material so atmospheric perspective lerp can
      // target each independently. Slight per-instance color jitter
      // breaks up the "stamped" look. baseMat is freshly `new` (no
      // userData._sharedAsset), so clones are disposable on world-switch.
      const mesaMat=baseMat.clone();
      mesaMat.color.multiplyScalar(0.92+Math.random()*0.16);
      const mesa=new THREE.Mesh(mesaGeo, mesaMat);
      mesa.position.set(cx, height*0.5-1, cz);
      mesa.rotation.y=Math.random()*Math.PI*2;
      // Squashed Y-scale + slight per-instance jitter
      const sc=0.85+Math.random()*0.40;
      mesa.scale.set(sc, 0.7+Math.random()*0.3, sc);
      ProcGeometry.applyAtmosphericPerspective(mesa, {
        fogColor:'#e8b878',
        startDistance:tier.distance-50,
        fullBlendDistance:tier.distance+150,
        cameraAnchor:new THREE.Vector3(0,0,0),
        maxBlend:tier.maxBlend
      });
      scene.add(mesa);
    }
  });
}

// Sand dunes — overlapping silhouettes met windrichting-aligned ripples.
function _ssBuildSandDunes(){
  const mob=window._isMobile;
  const COUNT=_mobCount(10);
  // 2-tone material: lit base via canvas with windrichting-aligned ripples.
  // Build a small ripple-canvas inline (4x cheaper than full ground-tex).
  const S=128,c=document.createElement('canvas');c.width=S;c.height=S;
  const g=c.getContext('2d');
  g.fillStyle='#c8a070';g.fillRect(0,0,S,S);
  // Wind-aligned ripples (horizontal, slight vertical wobble)
  for(let y=0;y<S;y+=4){
    g.fillStyle=y%8===0?'rgba(160,120,80,0.25)':'rgba(220,180,120,0.18)';
    g.fillRect(0,y+Math.sin(y*.3)*1.2,S,2);
  }
  const dTex=new THREE.CanvasTexture(c);
  dTex.wrapS=dTex.wrapT=THREE.RepeatWrapping;
  dTex.repeat.set(2,1);dTex.needsUpdate=true;
  const duneMat=new THREE.MeshLambertMaterial({color:0xd4a55a,map:dTex});
  for(let i=0;i<COUNT;i++){
    const range=_SS_DUNES_T_RANGES[i%_SS_DUNES_T_RANGES.length];
    const t=range[0]+Math.random()*(range[1]-range[0]);
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=i%2===0?1:-1;
    const off=BARRIER_OFF+18+Math.random()*45;
    const px=p.x+nr.x*side*off,pz=p.z+nr.z*side*off;
    // 2 overlapping dune-silhouettes per spawn-point for layered depth
    for(let layer=0;layer<2;layer++){
      const w=18+Math.random()*22+layer*4;
      const d=14+Math.random()*18+layer*3;
      const sub=mob?6:10;
      const geo=new THREE.PlaneGeometry(w,d,sub,sub);
      const pos=geo.attributes.position;
      for(let v=0;v<pos.count;v++){
        const x=pos.getX(v),y=pos.getY(v);
        // Sine-noise displacement, layer-2 bigger crest
        const h=Math.sin(x*.15)*2.0+Math.cos(y*.18)*1.5+Math.sin((x+y)*.08)*1.2;
        pos.setZ(v,Math.max(0,h*0.6+1.5+layer*0.6));
      }
      pos.needsUpdate=true;geo.computeVertexNormals();
      const dune=new THREE.Mesh(geo,duneMat);
      dune.rotation.x=-Math.PI/2;
      dune.rotation.z=Math.random()*Math.PI*2;
      // Per-instance scale + position jitter (from spec §3.4)
      const sc=0.85+Math.random()*0.30;
      dune.scale.set(sc,1+layer*0.15,sc);
      dune.position.set(px+(layer*3-1.5)*Math.cos(i),-0.05,pz+(layer*2-1)*Math.sin(i));
      scene.add(dune);
    }
  }
}

// Sphinx hero monument — Phase-3A rebuild per spec §3.5. 19 sub-meshes
// + decorative sand mound op desktop = 20 meshes; 15 op mobile (skips
// rear paws ×2, uraeus base + head, baard). Spec asked for 14+, so well
// covered. Volledig op `ProcGeometry.beveledBox` zodat geen scherpe doos-
// kanten ogen kartonachtig.
//
// Material zones (3 distinct):
//   • body         — warm sandstone via ProcTextures.weatheredStone(ageWear:0.7)
//   • sokkel       — koeler/donkerder accent — eigen weatheredStone variant
//   • nemes/uraeus/baard — distinctief donker (#9b6f3a) so headdress reads
//
// Helper builds a custom trapezoidal nemes-flap geometry inline (one of
// the few sub-shapes that doesn't fit any ProcGeometry recipe yet).
function _ssBuildSphinxMonument(){
  const mob=window._isMobile;
  // Mobile beveledBox LOD: halve bevelSegments + curveSegments to roughly
  // halve per-box tri-count (~140 tris/box vs ~280 desktop). 15 mobile
  // sub-meshes × ~140 = ~2100 tris vs the unoptimised ~4400. Visually
  // indistinguishable at race-camera distance.
  const bevSegs = mob ? 1 : 2;
  const curveSegs = mob ? 2 : 4;
  // Inline helper so we don't repeat bevelSegments/curveSegments at every
  // call-site. Used for sub-meshes that don't need post-creation vertex
  // tweaks; the upper-body taper + nemes-flap taper still call
  // ProcGeometry.beveledBox directly because they edit the resulting
  // BufferGeometry afterwards.
  const _bbox = (w, h, d, bevel) => ProcGeometry.beveledBox({
    w, h, d, bevel,
    bevelSegments: bevSegs,
    curveSegments: curveSegs
  });
  // 3 material zones (PBR baseline). Per-mesh color-tint kan via .color
  // set ALSO de same map laten zien, zodat caller-clones niet nodig zijn.
  const bodyTex=ProcTextures.weatheredStone({
    baseColor:'#c9a373', crackColor:'#3a2418', crackCount:10,
    ageWear:0.7, repeatX:1, repeatY:1
  });
  const sokkelTex=ProcTextures.weatheredStone({
    baseColor:'#b89370', crackColor:'#3a2418', crackCount:6,
    ageWear:0.5, repeatX:1, repeatY:1
  });
  const nemesTex=ProcTextures.weatheredStone({
    baseColor:'#9b6f3a', crackColor:'#2a1410', crackCount:8,
    ageWear:0.6, repeatX:1, repeatY:1
  });
  const bodyMat   =new THREE.MeshStandardMaterial({map:bodyTex,   roughness:0.92, metalness:0});
  const sokkelMat =new THREE.MeshStandardMaterial({map:sokkelTex, roughness:0.94, metalness:0});
  const nemesMat  =new THREE.MeshStandardMaterial({map:nemesTex,  roughness:0.90, metalness:0});
  const sphinx=new THREE.Group();

  // ── SOKKEL — large stepped base (2 beveled blocks) — sub-meshes 1-2
  const sokkelLow=new THREE.Mesh(_bbox(20, 1.2, 28, 0.20), sokkelMat);
  sokkelLow.position.y=0.6; sphinx.add(sokkelLow);
  const sokkelHi=new THREE.Mesh(_bbox(17, 1.2, 25, 0.18), sokkelMat);
  sokkelHi.position.y=1.8; sphinx.add(sokkelHi);

  // ── BODY — lying lion-form (lower + tapered upper) — sub-meshes 3-4
  const bodyLower=new THREE.Mesh(_bbox(8, 3, 16, 0.20), bodyMat);
  bodyLower.position.y=3.9; sphinx.add(bodyLower);
  // Upper body — slightly tapered top via post-creation vertex inset.
  // Uses the full-opts call (not _bbox) because we mutate the geometry
  // after creation; the bevel-LOD applies via shared bevSegs/curveSegs.
  const upperGeo=ProcGeometry.beveledBox({
    w:7.4, h:2.8, d:14.5, bevel:0.20,
    bevelSegments: bevSegs, curveSegments: curveSegs
  });
  // Pull top vertices inward so the body silhouette tapers toward the spine
  {
    const pos=upperGeo.attributes.position;
    const v=new THREE.Vector3();
    for(let i=0;i<pos.count;i++){
      v.fromBufferAttribute(pos,i);
      // Top half (positive Y after centering): pull X inward by 8%
      if(v.y > 0.4) v.x *= 0.85;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate=true;
    upperGeo.computeVertexNormals();
  }
  const bodyUpper=new THREE.Mesh(upperGeo, bodyMat);
  bodyUpper.position.y=6.7; sphinx.add(bodyUpper);

  // ── CHEST RISE — voorste deel van de body, hoger dan abdomen — sub-mesh 5
  const chestRise=new THREE.Mesh(_bbox(4, 3, 3, 0.15), bodyMat);
  chestRise.position.set(0, 7.5, -6.0);
  sphinx.add(chestRise);

  // ── FRONT PAWS (2) — beveled blocks angled forward — sub-meshes 6-7
  [-1,1].forEach(s=>{
    const paw=new THREE.Mesh(_bbox(1, 3, 4, 0.10), bodyMat);
    paw.position.set(s*2.3, 3.9, -6.5);
    sphinx.add(paw);
  });

  // ── REAR PAWS (2) — desktop only — sub-meshes 8-9 (skip on mobile)
  if(!mob){
    [-1,1].forEach(s=>{
      const rearPaw=new THREE.Mesh(_bbox(0.8, 1.2, 2, 0.10), bodyMat);
      rearPaw.position.set(s*2.5, 3.0, 7.2);
      sphinx.add(rearPaw);
    });
  }

  // ── TAIL — small block curving along the body — sub-mesh 10
  const tail=new THREE.Mesh(_bbox(0.8, 1.2, 3, 0.10), bodyMat);
  tail.position.set(0, 4.5, 8.4);
  tail.rotation.x=0.3;
  sphinx.add(tail);

  // ── NECK + HEAD — sub-meshes 11-12
  const neck=new THREE.Mesh(_bbox(3, 1.5, 2, 0.12), bodyMat);
  neck.position.set(0, 8.5, -7.0);
  sphinx.add(neck);
  const head=new THREE.Mesh(_bbox(3, 3.5, 3, 0.20), bodyMat);
  head.position.set(0, 10.5, -7.5);
  sphinx.add(head);

  // ── NEMES HEADDRESS — 2 angled trapezium flaps + central block (3 sub-meshes)
  // Sub-mesh 13 = nemes center
  const nemesCenter=new THREE.Mesh(_bbox(4.4, 1.6, 4.4, 0.15), nemesMat);
  nemesCenter.position.set(0, 12.7, -7.5);
  sphinx.add(nemesCenter);
  // Sub-meshes 14-15 = side flaps (custom trapezium via post-create taper).
  // Uses the full-opts call (not _bbox) because we mutate the geometry
  // after creation; the bevel-LOD applies via shared bevSegs/curveSegs.
  [-1,1].forEach(s=>{
    const flapGeo=ProcGeometry.beveledBox({
      w:0.8, h:2.6, d:3.4, bevel:0.10,
      bevelSegments: bevSegs, curveSegments: curveSegs
    });
    // Taper bottom narrower so flap reads as Egyptian nemes side-cloth
    const pos=flapGeo.attributes.position;
    const v=new THREE.Vector3();
    for(let i=0;i<pos.count;i++){
      v.fromBufferAttribute(pos,i);
      if(v.y < -0.5) v.z *= 0.65;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate=true;
    flapGeo.computeVertexNormals();
    const flap=new THREE.Mesh(flapGeo, nemesMat);
    flap.position.set(s*2.4, 11.6, -7.3);
    flap.rotation.z=s*0.18;
    sphinx.add(flap);
  });

  // ── URAEUS (cobra-symbool op voorhoofd) — desktop only, 2 sub-meshes (16-17)
  if(!mob){
    const uraeusBase=new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.13, 0.5, 6),
      nemesMat
    );
    uraeusBase.position.set(0, 11.7, -8.85);
    uraeusBase.rotation.x=-0.3;
    sphinx.add(uraeusBase);
    const uraeusHead=new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 6, 4),
      nemesMat
    );
    uraeusHead.position.set(0, 12.0, -8.95);
    sphinx.add(uraeusHead);
  }

  // ── PHARAO BAARD — desktop only, sub-mesh 18 (false beard onder kin)
  if(!mob){
    const baard=new THREE.Mesh(_bbox(0.5, 1.4, 0.5, 0.06), nemesMat);
    baard.position.set(0, 9.4, -8.95);
    baard.rotation.x=0.10;
    sphinx.add(baard);
  }

  // ── CAPSTONE — small pyramid on top of nemes — sub-mesh 19
  // Use ProcGeometry.pyramidCap for crisp 4-sided pyramid (not cone hack).
  const cap=new THREE.Mesh(
    ProcGeometry.pyramidCap({baseW:1.3, height:1.5}),
    nemesMat
  );
  cap.position.set(0, 13.5, -7.5);
  cap.rotation.y=Math.PI/4;
  sphinx.add(cap);

  // ── HALF-BURIED SAND MOUND — Lambert OK (background reads), sub-mesh 20
  // The mound IS the integrated base. Lambert acceptable here — it's
  // semi-decorative ground around the prop, not a hero surface.
  const moundMat=new THREE.MeshLambertMaterial({color:0xc8a070});
  const mound=new THREE.Mesh(
    new THREE.SphereGeometry(16, 14, 9, 0, Math.PI*2, 0, Math.PI*0.5),
    moundMat
  );
  mound.scale.set(1.3, 0.3, 1.1);
  mound.position.y=-1.5;
  sphinx.add(mound);

  // ── PLACEMENT: half-buried beside finish-line, facing the track.
  // Group Y-offset is 0 (NOT -1.2 like an earlier draft tried — that
  // mis-aligned the sokkel-low under ground while the body floated 0.9u
  // above the sokkel-hi top, leaving a visible gap. The mound at sphinx-
  // local y=-1.5 already buries its bottom half below ground, providing
  // the half-buried look without offsetting the rest of the group.)
  const t=0.96;
  const p=trackCurve.getPoint(t);
  const tg=trackCurve.getTangent(t).normalize();
  const nr=new THREE.Vector3(-tg.z,0,tg.x);
  const off=BARRIER_OFF+14;
  sphinx.position.set(p.x+nr.x*off, 0, p.z+nr.z*off);
  sphinx.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI*0.5;
  scene.add(sphinx);
}

// Tempel ruins — 5 standing pillars + 3 fallen + 1 architrave fragment.
// Each standing = base + shaft + capital + abacus (4 sub-meshes).
// Implemented via 4 InstancedMeshes per part-type to keep draw-calls low.
function _ssBuildTempleRuins(){
  const COUNT_STANDING=_mobCount(5);
  const COUNT_FALLEN=_mobCount(3);
  const stoneTex=_ssSandstoneTex();
  const stoneMat=new THREE.MeshLambertMaterial({color:0xb89370,map:stoneTex});
  const stoneAccentMat=new THREE.MeshLambertMaterial({color:0x8c6f50});
  const _dummy=new THREE.Object3D();
  // Standing pillar parts: base block, fluted shaft, capital block, abacus top.
  const baseGeo=new THREE.BoxGeometry(2.6,0.7,2.6);
  const shaftGeo=new THREE.CylinderGeometry(0.95,1.15,7.4,16);
  const capitalGeo=new THREE.BoxGeometry(2.4,0.7,2.4);
  const abacusGeo=new THREE.BoxGeometry(2.0,0.4,2.0);
  const baseIM=new THREE.InstancedMesh(baseGeo,stoneAccentMat,COUNT_STANDING);
  const shaftIM=new THREE.InstancedMesh(shaftGeo,stoneMat,COUNT_STANDING);
  const capIM=new THREE.InstancedMesh(capitalGeo,stoneAccentMat,COUNT_STANDING);
  const abacusIM=new THREE.InstancedMesh(abacusGeo,stoneAccentMat,COUNT_STANDING);
  for(let i=0;i<COUNT_STANDING;i++){
    const t=_SS_PLAZA_T_RANGE[0]+(i+0.5)/COUNT_STANDING*(_SS_PLAZA_T_RANGE[1]-_SS_PLAZA_T_RANGE[0]);
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=i%2===0?1:-1;
    const off=BARRIER_OFF+9+Math.random()*8;
    const cx=p.x+nr.x*side*off,cz=p.z+nr.z*side*off;
    // Per-instance Y-rotation jitter so each pillar reads as hand-placed
    const yawJ=Math.random()*Math.PI*2;
    _dummy.position.set(cx,0.35,cz);_dummy.rotation.set(0,yawJ,0);_dummy.updateMatrix();
    baseIM.setMatrixAt(i,_dummy.matrix);
    _dummy.position.set(cx,4.4,cz);_dummy.updateMatrix();
    shaftIM.setMatrixAt(i,_dummy.matrix);
    _dummy.position.set(cx,8.5,cz);_dummy.updateMatrix();
    capIM.setMatrixAt(i,_dummy.matrix);
    _dummy.position.set(cx,9.0,cz);_dummy.updateMatrix();
    abacusIM.setMatrixAt(i,_dummy.matrix);
  }
  baseIM.instanceMatrix.needsUpdate=true;scene.add(baseIM);
  shaftIM.instanceMatrix.needsUpdate=true;scene.add(shaftIM);
  capIM.instanceMatrix.needsUpdate=true;scene.add(capIM);
  abacusIM.instanceMatrix.needsUpdate=true;scene.add(abacusIM);
  // Fallen pillars — instanced with rotated cylinder + 1 broken sub-cylinder
  // alongside (more decay than the previous build's single rotated cyl).
  const fallenGeo=new THREE.CylinderGeometry(0.9,1.05,5.5,12);
  const fallenChunkGeo=new THREE.CylinderGeometry(0.9,0.95,1.6,12);
  const fallenIM=new THREE.InstancedMesh(fallenGeo,stoneMat,COUNT_FALLEN);
  const fallenChunkIM=new THREE.InstancedMesh(fallenChunkGeo,stoneMat,COUNT_FALLEN);
  for(let i=0;i<COUNT_FALLEN;i++){
    const t=_SS_PLAZA_T_RANGE[0]+0.05+Math.random()*(_SS_PLAZA_T_RANGE[1]-_SS_PLAZA_T_RANGE[0]-0.10);
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i+1)%2===0?1:-1;
    const off=BARRIER_OFF+12+Math.random()*10;
    const cx=p.x+nr.x*side*off,cz=p.z+nr.z*side*off;
    const yaw=Math.random()*Math.PI*2;
    _dummy.position.set(cx,0.9,cz);
    _dummy.rotation.set(0,yaw,Math.PI/2);
    _dummy.updateMatrix();fallenIM.setMatrixAt(i,_dummy.matrix);
    // Broken chunk a bit ahead, smaller, rotated differently
    _dummy.position.set(cx+Math.cos(yaw)*4,0.95,cz+Math.sin(yaw)*4);
    _dummy.rotation.set(0,yaw+0.4,Math.PI/2);
    _dummy.updateMatrix();fallenChunkIM.setMatrixAt(i,_dummy.matrix);
  }
  fallenIM.instanceMatrix.needsUpdate=true;scene.add(fallenIM);
  fallenChunkIM.instanceMatrix.needsUpdate=true;scene.add(fallenChunkIM);
  // Architrave fragment — main beam + 2 carved relief blocks underneath
  // (3 sub-meshes to read as decorated stonework, not a plain box).
  const tMid=(_SS_PLAZA_T_RANGE[0]+_SS_PLAZA_T_RANGE[1])*0.5;
  const p=trackCurve.getPoint(tMid);
  const tg=trackCurve.getTangent(tMid).normalize();
  const nr=new THREE.Vector3(-tg.z,0,tg.x);
  const off=BARRIER_OFF+18;
  const cx=p.x+nr.x*off,cz=p.z+nr.z*off;
  const yaw=Math.atan2(tg.x,tg.z);
  const beam=new THREE.Mesh(new THREE.BoxGeometry(6,1.2,1.4),stoneMat);
  beam.position.set(cx,1.0,cz);beam.rotation.y=yaw;beam.rotation.z=0.18;scene.add(beam);
  // Carved relief block 1 (smaller, beneath)
  const relief1=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.5,1.0),stoneAccentMat);
  relief1.position.set(cx-0.6,0.4,cz);relief1.rotation.y=yaw;scene.add(relief1);
  // Carved relief block 2
  const relief2=new THREE.Mesh(new THREE.BoxGeometry(2.0,0.5,1.0),stoneAccentMat);
  relief2.position.set(cx+1.2,0.35,cz);relief2.rotation.y=yaw+0.05;scene.add(relief2);
}

// Obelisks — 2 with sokkel + 4-sided tapered prisma + capstone pyramid.
function _ssBuildObelisks(){
  const stoneTex=_ssSandstoneTex();
  const stoneMat=new THREE.MeshLambertMaterial({color:0xb89370,map:stoneTex});
  const stoneAccentMat=new THREE.MeshLambertMaterial({color:0x9a7048});
  const capMat=new THREE.MeshLambertMaterial({color:0xd4a55a,emissive:0x4a2810,emissiveIntensity:0.3});
  // Two obelisks at the ends of the plaza segment, on opposite sides.
  [_SS_PLAZA_T_RANGE[0],_SS_PLAZA_T_RANGE[1]].forEach((t,idx)=>{
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=idx===0?-1:1;
    const off=BARRIER_OFF+5;
    const cx=p.x+nr.x*side*off,cz=p.z+nr.z*side*off;
    // SOKKEL — wider stepped base (2 blocks)
    const sokkelLow=new THREE.Mesh(new THREE.BoxGeometry(4.0,0.8,4.0),stoneAccentMat);
    sokkelLow.position.set(cx,0.4,cz);scene.add(sokkelLow);
    const sokkelHi=new THREE.Mesh(new THREE.BoxGeometry(3.2,0.8,3.2),stoneAccentMat);
    sokkelHi.position.set(cx,1.2,cz);scene.add(sokkelHi);
    // Tapered 4-sided prisma (cylinder geom with 4 segments = square pyramid frustum)
    const ob=new THREE.Mesh(new THREE.CylinderGeometry(0.5,1.4,12,4),stoneMat);
    ob.position.set(cx,7.6,cz);ob.rotation.y=Math.PI/4;scene.add(ob);
    // Pyramid capstone (gold-tinted, lightly emissive — picks up warm sun)
    const cap=new THREE.Mesh(new THREE.ConeGeometry(0.7,1.8,4),capMat);
    cap.position.set(cx,14.5,cz);cap.rotation.y=Math.PI/4;scene.add(cap);
  });
}

// Palm trees — fan-leaves, lightly curved trunk via 2 stacked tapered cyls.
// Per-instance jitter on scale + Y-rotation. Leaves go through one big
// InstancedMesh = 1 draw call for all 60+ fronds.
function _ssBuildPalmTrees(){
  const COUNT=_mobCount(12);
  const trunkMat=new THREE.MeshLambertMaterial({color:0x6a4a28});
  const leafTex=_ssPalmLeafTex();
  const leafMat=new THREE.MeshBasicMaterial({
    map:leafTex,transparent:true,alphaTest:0.35,
    side:THREE.DoubleSide,depthWrite:false
  });
  const frondGeo=new THREE.PlaneGeometry(3.4,1.2);
  const trunkLowGeo=new THREE.CylinderGeometry(0.22,0.32,1,7);  // base segment
  const trunkHiGeo=new THREE.CylinderGeometry(0.18,0.22,1,7);   // top segment
  const FRONDS_PER_PALM=8;
  const frondIM=new THREE.InstancedMesh(frondGeo,leafMat,COUNT*FRONDS_PER_PALM);
  const _dummy=new THREE.Object3D();
  let frondIdx=0;
  for(let i=0;i<COUNT;i++){
    const t=_SS_PLAZA_T_RANGE[0]+(i/COUNT)*(_SS_PLAZA_T_RANGE[1]-_SS_PLAZA_T_RANGE[0]);
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=i%2===0?1:-1;
    const off=BARRIER_OFF+3+Math.random()*7;
    const cx=p.x+nr.x*side*off,cz=p.z+nr.z*side*off;
    const h=4.5+Math.random()*1.5;
    // Per-instance scale jitter (.85-1.15 per spec §3.4)
    const sc=0.85+Math.random()*0.30;
    const yawJ=Math.random()*Math.PI*2;
    // Trunk: 2 stacked tapered cyls for slight curve
    const lean=(Math.random()-0.5)*0.12;
    const tLow=new THREE.Mesh(trunkLowGeo,trunkMat);
    tLow.position.set(cx,h*0.25,cz);
    tLow.scale.set(sc,h*0.5,sc);
    tLow.rotation.z=lean*0.4;
    scene.add(tLow);
    const tHi=new THREE.Mesh(trunkHiGeo,trunkMat);
    tHi.position.set(cx+Math.sin(lean)*h*0.25,h*0.75,cz);
    tHi.scale.set(sc,h*0.5,sc);
    tHi.rotation.z=lean;
    scene.add(tHi);
    // 8 fronds in a fan with droop — write into shared InstancedMesh
    const topX=cx+Math.sin(lean)*h*0.5,topY=h+0.3,topZ=cz;
    for(let l=0;l<FRONDS_PER_PALM;l++){
      const ang=(l/FRONDS_PER_PALM)*Math.PI*2;
      const droop=-0.32-Math.random()*0.12;
      _dummy.position.set(topX+Math.cos(ang+yawJ)*1.1,topY,topZ+Math.sin(ang+yawJ)*1.1);
      _dummy.rotation.set(droop,ang+yawJ,(Math.random()-0.5)*0.2,'YXZ');
      _dummy.scale.set(sc,sc,sc);
      _dummy.updateMatrix();
      frondIM.setMatrixAt(frondIdx++,_dummy.matrix);
    }
  }
  frondIM.count=frondIdx;
  frondIM.instanceMatrix.needsUpdate=true;
  scene.add(frondIM);
}

// Camel silhouettes — desktop only. 4 instances on far dunes; pure
// background scale-cue. Built as a 1-mesh merged-geometry prototype +
// InstancedMesh × 4 instances → 1 draw call total.
function _ssBuildCamels(){
  if(window._isMobile)return;
  const camelMat=new THREE.MeshLambertMaterial({color:0x6a4628});
  // Build prototype meshes, then merge their geometries into a single
  // BufferGeometry so the camel renders as one InstancedMesh draw.
  // Uses THREE.BufferGeometryUtils.mergeBufferGeometries from the
  // bundled three-r160 build (verified present in vendor blob).
  const parts=[];
  const _box=(w,h,d,x,y,z,rx,ry,rz)=>{
    const g=new THREE.BoxGeometry(w,h,d);
    g.translate(x,y,z);
    if(rx||ry||rz){
      const e=new THREE.Euler(rx||0,ry||0,rz||0,'XYZ');
      const q=new THREE.Quaternion().setFromEuler(e);
      const m=new THREE.Matrix4().makeRotationFromQuaternion(q);
      g.applyMatrix4(m);
    }
    parts.push(g);
  };
  const _sph=(r,x,y,z,sy)=>{
    const g=new THREE.SphereGeometry(r,6,4);
    g.scale(1,sy||1,1);
    g.translate(x,y,z);
    parts.push(g);
  };
  _box(3.5,1.4,1.0, 0,1.6,0);            // body
  _sph(0.7,-0.6,2.6,0,1.2);              // hump 1
  _sph(0.7, 0.7,2.6,0,1.2);              // hump 2
  _box(0.5,1.8,0.5, 1.7,2.4,0, 0,0,-0.6);// neck
  _box(0.8,0.5,0.6, 2.5,3.1,0);          // head
  _box(0.25,1.6,0.25,-1,0.8,-0.3);
  _box(0.25,1.6,0.25, 1,0.8,-0.3);
  _box(0.25,1.6,0.25,-1,0.8, 0.3);
  _box(0.25,1.6,0.25, 1,0.8, 0.3);
  // Merge via the three-r160 utility. All parts use position+normal only
  // (no UV — MeshLambertMaterial without map doesn't sample UVs), so
  // attribute-set is consistent across parts.
  const merged=THREE.BufferGeometryUtils.mergeBufferGeometries(parts);
  // Free the source part-geometries; the merged buffer owns all data now.
  parts.forEach(g=>g.dispose());
  // Place 4 instances on far dunes — beyond the cliff-line so they read
  // as distant scale cues, never a hazard.
  const positions=[[210,-280],[-180,-310],[-260,80],[280,180]];
  const im=new THREE.InstancedMesh(merged,camelMat,positions.length);
  const _dummy=new THREE.Object3D();
  positions.forEach(([px,pz],i)=>{
    _dummy.position.set(px,0,pz);
    _dummy.rotation.set(0,Math.random()*Math.PI*2,0);
    const sc=0.85+Math.random()*0.30;
    _dummy.scale.set(sc,sc,sc);
    _dummy.updateMatrix();
    im.setMatrixAt(i,_dummy.matrix);
  });
  im.instanceMatrix.needsUpdate=true;
  scene.add(im);
}

function _ssBuildBedouinTents(){
  const COUNT=_mobCount(3);
  const stripeTex=_ssTentStripeTex();
  stripeTex.repeat.set(2,2);
  const tentMat=new THREE.MeshLambertMaterial({map:stripeTex,side:THREE.DoubleSide});
  const poleMat=new THREE.MeshLambertMaterial({color:0x4a3018});
  const tentGeo=new THREE.ConeGeometry(2.4,3.2,6);
  const poleGeo=new THREE.CylinderGeometry(0.08,0.08,3.8,5);
  for(let i=0;i<COUNT;i++){
    const t=_SS_PLAZA_T_RANGE[0]+0.04+i*((_SS_PLAZA_T_RANGE[1]-_SS_PLAZA_T_RANGE[0]-0.08)/Math.max(1,COUNT-1));
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=i%2===0?-1:1;
    const off=BARRIER_OFF+15+Math.random()*4;
    const cx=p.x+nr.x*side*off,cz=p.z+nr.z*side*off;
    const tent=new THREE.Mesh(tentGeo,tentMat);
    tent.position.set(cx,1.4,cz);
    // Slight scheve hoek per spec §3.3 — feels weathered, not factory-set
    tent.rotation.set((Math.random()-0.5)*0.10,Math.random()*Math.PI*2,(Math.random()-0.5)*0.06);
    scene.add(tent);
    const pole=new THREE.Mesh(poleGeo,poleMat);
    pole.position.set(cx,1.7,cz);scene.add(pole);
  }
}

function _ssBuildScarabSigns(){
  const COUNT=_mobCount(4);
  const signTex=_ssScarabSignTex();
  const signMat=new THREE.MeshBasicMaterial({map:signTex,side:THREE.DoubleSide});
  const poleMat=new THREE.MeshLambertMaterial({color:0x4a3018});
  const ts=[0.10,0.45,0.78,0.93];
  const poleGeo=new THREE.CylinderGeometry(0.08,0.08,2.4,5);
  const signGeo=new THREE.PlaneGeometry(1.6,1.2);
  for(let i=0;i<COUNT;i++){
    const t=ts[i%ts.length];
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=i%2===0?1:-1;
    const off=BARRIER_OFF+4;
    const cx=p.x+nr.x*side*off,cz=p.z+nr.z*side*off;
    const pole=new THREE.Mesh(poleGeo,poleMat);
    pole.position.set(cx,1.2,cz);scene.add(pole);
    const sign=new THREE.Mesh(signGeo,signMat);
    sign.position.set(cx,2.1,cz);
    sign.rotation.y=Math.atan2(tg.x,tg.z)+(side<0?0:Math.PI);
    scene.add(sign);
  }
}

// ── Main builders ───────────────────────────────────────────────────────

function buildSandstormEnvironment(){
  // ── Ground (sand canvas, anisotropy/repeat matches grandprix-style)
  const g=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),
    new THREE.MeshLambertMaterial({color:0xd4a55a,map:_sandGroundTex()}));
  g.rotation.x=-Math.PI/2;g.position.y=-.15;g.receiveShadow=true;
  g.userData._isProcGround=true;
  scene.add(g);
  // ── Lighting (warm desert — Phase-2 retune per visual-richness pilot)
  // Sky + fog set in core/scene.js. The biggest visual upgrade comes from
  // the HEMISPHERE: previous sky=#9bd0e0 (cyan) gave canyon walls a cool
  // sky-bounce that fought the warm sun. New sky=#d4b890 (warm sand) +
  // ground=#7a4a25 with intensity 0.8 (mobile 0.6) lights the canyon
  // shadow-side warm — fixes the "platte" cliff/sphinx feel WITHOUT any
  // geometry changes. Sun bumped to #fff0d0 / 2.5 (mobile 2.0). Ambient
  // cut to 0.3 because hemisphere now provides the diffuse fill.
  sunLight.color.setHex(0xfff0d0); sunLight.intensity = window._isMobile ? 2.0 : 2.5;
  ambientLight.color.setHex(0x5a3a20); ambientLight.intensity = 0.3;
  hemiLight.color.setHex(0xd4b890);
  hemiLight.groundColor.setHex(0x7a4a25);
  hemiLight.intensity = window._isMobile ? 0.6 : 0.8;
  // Sand-haze fill light (warm, modest range — pulses subtly in update)
  _sandstormSandSwept=new THREE.PointLight(0xffe4a8,1.4,500);
  _sandstormSandSwept.position.set(0,8,0);scene.add(_sandstormSandSwept);
  // ── Wind-blown ambient sand-fleck pool (always-on, lap-1+).
  // The lap-progressive STORM particles live in sandstorm-storm.js (Phase 4).
  {
    const FN=_mobCount(180);
    const geo=new THREE.BufferGeometry();
    const pos=new Float32Array(FN*3),col=new Float32Array(FN*3);
    for(let i=0;i<FN;i++){
      pos[i*3]=(Math.random()-.5)*600;
      pos[i*3+1]=Math.random()*22+1;
      pos[i*3+2]=(Math.random()-.5)*600;
      col[i*3]=.95-Math.random()*.15;
      col[i*3+1]=.78-Math.random()*.20;
      col[i*3+2]=.58-Math.random()*.18;
    }
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    _sandstormFlecks=new THREE.Points(geo,new THREE.PointsMaterial({
      vertexColors:true,size:.32,transparent:true,opacity:.65,
      sizeAttenuation:true,blending:THREE.AdditiveBlending,depthWrite:false
    }));
    scene.add(_sandstormFlecks);_sandstormFlecksGeo=geo;
  }
  // ── World props (Phase 3 visual upgrade) ────────────────
  // Two depth-tiered horizon layers:
  //   1. Shared silhouette layers from track/environment.js (cylinder rings
  //      via _SILHOUETTE_PALETTES.sandstorm, called by core/scene.js).
  //   2. _ssBuildBackgroundMesas (Phase-3A): discrete organic-cylinder
  //      mesa props at 150/250/400u bands with atmospheric perspective.
  // The two are NOT duplicates — silhouette is wrap-around horizon haze,
  // mesas are individual scatter-props that read as Monument-Valley buttes.
  _ssBuildBackgroundMesas();
  _ssBuildCanyonCliffs();
  _ssBuildSandDunes();
  _ssBuildSphinxMonument();
  _ssBuildTempleRuins();
  _ssBuildObelisks();
  _ssBuildPalmTrees();
  _ssBuildCamels();
  _ssBuildBedouinTents();
  _ssBuildScarabSigns();
  // ── Hazard hook (Phase 4 supplies the implementation)
  if(typeof buildSandstormStorm==='function')buildSandstormStorm();
  // ── Barriers + start line (shared environment helpers).
  buildBarriers();buildStartLine();
  // ── Player + AI headlight refs
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);
  // ── Stars (warm sand-tinted) — same instanced pattern as volcano
  {
    const sg=new THREE.SphereGeometry(.18,4,4);
    const ssm=new THREE.MeshBasicMaterial({color:0xffd6a0,transparent:true,opacity:.7});
    stars=new THREE.InstancedMesh(sg,ssm,60);stars.visible=true;
    const dm=new THREE.Object3D();
    for(let i=0;i<60;i++){
      const th=Math.random()*Math.PI*2,ph=Math.random()*Math.PI*.3,r=300+Math.random()*80;
      dm.position.set(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph)*.35+60,r*Math.sin(ph)*Math.sin(th));
      dm.scale.setScalar(.6+Math.random()*1.2);dm.updateMatrix();
      stars.setMatrixAt(i,dm.matrix);
    }
    stars.instanceMatrix.needsUpdate=true;scene.add(stars);
  }
  // GLTF roadside props skipped — sandstorm has no GLTF manifest.
}

function updateSandstormWorld(dt){
  const t=_nowSec;
  // Subtle skybox drift — sandstorm wind. Pattern matches volcano/arctic.
  if(scene&&scene.background&&scene.background.isTexture){
    scene.background.offset.x=(scene.background.offset.x+dt*.004)%1;
  }
  // Hazard update (typeof guard — Phase 2 stub or Phase 4 real impl)
  if(typeof updateSandstormStorm==='function'){
    const pl=carObjs[playerIdx];
    updateSandstormStorm(dt,pl?pl.lap:1);
  }
  // Wind-drift the ambient flecks — rolling buffer (50/frame) like volcano
  // ember-update so a 180-particle pool never stalls a single frame.
  if(_sandstormFlecksGeo){
    const pos=_sandstormFlecksGeo.attributes.position.array;
    const step=Math.floor(t*40)%50||1;
    for(let i=step;i<Math.min(step+50,pos.length/3);i++){
      pos[i*3]+=dt*1.6;
      pos[i*3+1]+=dt*(.4+Math.random()*.4);
      if(pos[i*3]>320||pos[i*3+1]>26){
        pos[i*3]=-300+Math.random()*40;
        pos[i*3+1]=Math.random()*4;
        pos[i*3+2]=(Math.random()-.5)*600;
      }
    }
    _sandstormFlecksGeo.attributes.position.needsUpdate=true;
  }
  // Pulse the sand-haze fill light gently
  if(_sandstormSandSwept)_sandstormSandSwept.intensity=1.2+Math.sin(t*.45)*.30;
}
