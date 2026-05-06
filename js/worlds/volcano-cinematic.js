// js/worlds/volcano-cinematic.js — Volcano Cinematic world builders.
// Non-module script. PARALLEL world to js/worlds/volcano.js per
// DECISIONS.md D6 — original volcano stays untouched; this file is the
// '-cinematic' variant.
//
// Visual direction: extinct caldera with residual heat, NOT active.
// Doom-meets-Dark-Souls / blood-red horizon / lava as signature light
// (replacing Pier 47's amber). Stress-test for the cinematic.js
// helpers with a warm-dominant palette.
//
// Sessie history:
//   sessie 1 (this) — bones + skybox + lighting + cinematic helpers wired
//   sessie 2 (planned) — lava rivers + ash-fall + basalt pillars
//   sessie 3 (planned) — polish + tuning
//
// ── Track-waypoints (data/tracks.json#volcano-cinematic) ─────────────────
// Reuses the original Volcano waypoints (18 points, identical layout) so
// the cinematic variant feels like the same race-line, different mood.
// Validation re-applied at boot via _validateTrackSchema (see DECISIONS D2).

'use strict';

// Per-world animated state — drained on world-switch via core/scene.js.
// Sessie 1 has no per-frame world state. Sessie 2 will add lava-river +
// ash-fall geometry/material refs here.
// (Slot reserved for future use.)

// ── Cinematic palette pin ─────────────────────────────────────────────────
//
// Single hex constants used throughout this world. Centralising them at
// top-of-file means lava-tone tuning is a one-line edit. Future cinematic
// worlds (arctic-cinematic etc.) declare their own palette block and pass
// equivalents to the cinematic.js helpers.
const _VC_PALETTE = {
  lavaHot:    0xff3010,   // hottest red-orange — kerb emissive, lamp cones, markers
  lavaWarm:   0xff5022,   // mid-range warm — secondary lamp tint
  emberDeep:  0xaa1500,   // deep glow — distant gantry, far markers
  charBlack:  0x0a0303,   // deep volcanic black — asphalt, ground accents
  ashGrey:    0x2a2422,   // cool ash — fog tint baseline
  ashWarm:    0x3a2218,   // warm ash — fog tint for lit volumes
  bloodHorizon: 0x4a0808, // blood-red horizon band
  zenithDark: 0x0a0204    // near-black zenith with red trace
};

// ── Day-lighting helper (P3) ──────────────────────────────────────────────
//
// Single source of truth for day lighting. Mirrors Pier 47's pattern.
// Called from buildVolcanoCinematicEnvironment AND from night.js's day-
// branch on M-toggle.
//
// Goal palette (extinct caldera, residual heat):
//   sun       koel grijs-rood #5a3030 / 0.30 desktop / 0.20 mobile
//             (very dim — the world is lit by lava-pools, not sun)
//   ambient   #100404 (near-black with red trace) / 0.12
//   hemi sky  #3a1810 (warm rust) / ground #0a0202 (volcanic black) / 0.18
//
// Mobile sun caps at 0.20 (vs 0.30 desktop) per the no-shadow rule:
// without shadows, even a low-intensity sun risks washing the dark scene.
function _applyVolcanoCinematicDayLighting(){
  if(!sunLight||!ambientLight||!hemiLight)return;
  sunLight.color.setHex(0x5a3030);
  sunLight.intensity = window._isMobile ? 0.20 : 0.30;
  sunLight.position.set(40, 120, 60);
  ambientLight.color.setHex(0x100404); ambientLight.intensity = 0.12;
  hemiLight.color.setHex(0x3a1810);
  hemiLight.groundColor.setHex(0x0a0202);
  hemiLight.intensity = 0.18;
}
if(typeof window!=='undefined') window._applyVolcanoCinematicDayLighting=_applyVolcanoCinematicDayLighting;

// ── Skybox builders (canvas-baked) ────────────────────────────────────────
//
// Day skybox: gothic — near-black zenith bleeding through deep red mid
// to a blood-red horizon band, with a low ember-glow strip that suggests
// distant lava-pools just below the visible terrain. No stars (cloud
// cover). Heavy red weighting, low contrast — claustrophobic.
//
// Painted on the shared 1024×512 canvas via _newSkyCanvas; mobile auto-
// halves to 512×256.
function makeVolcanoCinematicSkyTex(){
  // Zenith near-black → mid deep red.
  const {c,g}=_newSkyCanvas('#0a0204','#2a0a08');
  // Horizon band — blood-red sliding into a hot ember strip at the foot.
  const horiz=g.createLinearGradient(0,260,0,400);
  horiz.addColorStop(0,'rgba(42,10,8,0)');
  horiz.addColorStop(.4,'rgba(74,8,8,0.65)');
  horiz.addColorStop(1,'rgba(120,16,8,0.85)');
  g.fillStyle=horiz;g.fillRect(0,260,1024,140);
  // Ember-glow foot — hot red-orange that picks up the fog tone.
  const foot=g.createLinearGradient(0,400,0,512);
  foot.addColorStop(0,'rgba(120,16,8,0.85)');
  foot.addColorStop(.5,'rgba(140,28,8,0.92)');
  foot.addColorStop(1,'rgba(80,12,8,1)');
  g.fillStyle=foot;g.fillRect(0,400,1024,112);
  // Heavy cloud cover — dark grey-red blobs across the lower zenith.
  // Volcanic ash-cloud feel, NOT cumulus white.
  for(let i=0;i<18;i++){
    const x=Math.random()*1024,y=200+Math.random()*120;
    const r=80+Math.random()*140;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba(20,12,10,0.55)');
    grd.addColorStop(.6,'rgba(20,12,10,0.22)');
    grd.addColorStop(1,'rgba(20,12,10,0)');
    g.fillStyle=grd;g.fillRect(x-r,y-r,r*2,r*2);
  }
  // Two distant lava-glow hotspots low on the horizon — suggests
  // off-screen pools / vents. Asymmetric placement for cinematic framing.
  const glow1=g.createRadialGradient(280,440,0,280,440,200);
  glow1.addColorStop(0,'rgba(255,80,40,0.65)');
  glow1.addColorStop(.5,'rgba(160,30,12,0.30)');
  glow1.addColorStop(1,'rgba(160,30,12,0)');
  g.fillStyle=glow1;g.fillRect(80,340,400,172);
  const glow2=g.createRadialGradient(780,460,0,780,460,160);
  glow2.addColorStop(0,'rgba(255,60,28,0.45)');
  glow2.addColorStop(.5,'rgba(140,22,10,0.20)');
  glow2.addColorStop(1,'rgba(140,22,10,0)');
  g.fillStyle=glow2;g.fillRect(620,360,320,152);
  return _skyTexFromCanvas(c);
}

// Night skybox — even darker. Same composition (no stars, ash-cloud,
// lava-glow horizons) but ambient deepens. Sessie 1 keeps the toggle
// delta small; tuning lands in sessie 3.
function makeVolcanoCinematicNightSkyTex(){
  const {c,g}=_newSkyCanvas('#050102','#1a0606');
  const horiz=g.createLinearGradient(0,260,0,400);
  horiz.addColorStop(0,'rgba(26,6,6,0)');
  horiz.addColorStop(.4,'rgba(48,8,6,0.7)');
  horiz.addColorStop(1,'rgba(96,12,6,0.92)');
  g.fillStyle=horiz;g.fillRect(0,260,1024,140);
  const foot=g.createLinearGradient(0,400,0,512);
  foot.addColorStop(0,'rgba(96,12,6,0.92)');
  foot.addColorStop(.5,'rgba(120,22,8,0.95)');
  foot.addColorStop(1,'rgba(48,8,6,1)');
  g.fillStyle=foot;g.fillRect(0,400,1024,112);
  for(let i=0;i<22;i++){
    const x=Math.random()*1024,y=180+Math.random()*140;
    const r=90+Math.random()*150;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba(12,8,8,0.65)');
    grd.addColorStop(.6,'rgba(12,8,8,0.26)');
    grd.addColorStop(1,'rgba(12,8,8,0)');
    g.fillStyle=grd;g.fillRect(x-r,y-r,r*2,r*2);
  }
  const glow1=g.createRadialGradient(280,440,0,280,440,220);
  glow1.addColorStop(0,'rgba(255,90,44,0.78)');
  glow1.addColorStop(.5,'rgba(170,32,14,0.36)');
  glow1.addColorStop(1,'rgba(170,32,14,0)');
  g.fillStyle=glow1;g.fillRect(60,320,440,192);
  const glow2=g.createRadialGradient(780,460,0,780,460,180);
  glow2.addColorStop(0,'rgba(255,72,32,0.55)');
  glow2.addColorStop(.5,'rgba(150,24,12,0.24)');
  glow2.addColorStop(1,'rgba(150,24,12,0)');
  g.fillStyle=glow2;g.fillRect(600,340,360,172);
  return _skyTexFromCanvas(c);
}

// ── Ground texture (cooled lava with ember-glint flecks) ──────────────────
function _vcGroundTex(){
  const S=256,c=document.createElement('canvas');c.width=S;c.height=S;
  const g=c.getContext('2d');
  g.fillStyle='#100808';g.fillRect(0,0,S,S);
  const id=g.getImageData(0,0,S,S),d=id.data;
  for(let i=0;i<d.length;i+=4){
    const n=14+(Math.random()*16)|0;
    d[i]=n+2;d[i+1]=n;d[i+2]=n;d[i+3]=255;
  }
  g.putImageData(id,0,0);
  // Darker crevices
  for(let i=0;i<10;i++){
    const x=Math.random()*S,y=Math.random()*S,r=4+Math.random()*9;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba(2,2,2,0.7)');
    grd.addColorStop(1,'rgba(2,2,2,0)');
    g.fillStyle=grd;g.fillRect(x-r,y-r,r*2,r*2);
  }
  // Sparse ember-glints — residual heat from below
  for(let i=0;i<8;i++){
    const x=Math.random()*S,y=Math.random()*S,r=2+Math.random()*4;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba(255,80,30,0.55)');
    grd.addColorStop(.6,'rgba(180,40,10,0.18)');
    grd.addColorStop(1,'rgba(180,40,10,0)');
    g.fillStyle=grd;g.fillRect(x-r,y-r,r*2,r*2);
  }
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(40,40);
  t.anisotropy=4;t.needsUpdate=true;
  return t;
}

// ── Main environment builder ──────────────────────────────────────────────
//
// Sessie 1 scope — bones + skybox + lighting + cinematic helpers wired:
//   1. Ground plane (volcanic rock)
//   2. Day-lighting helper
//   3. Barriers + start line
//   4. Cinematic ground fog (warm ash)
//   5. Cinematic lamp poles (lava-tinted)
//   6. Cinematic distant markers (deep ember pulses + far morse)
//   7. Cinematic camera shake (slightly stronger than Pier 47 — caldera
//      vibration vs harbour wind)
//   8. Headlights + sparse always-off ember-stars
//
// Sessie 2 will add: lava rivers, ash-fall particles, basalt pillars.
// Sessie 3: polish + tuning.
function buildVolcanoCinematicEnvironment(){
  // Weather reset — original volcano has its own ember-fog setup; for the
  // cinematic variant we own the fog tint via cinematic.js ground fog +
  // scene.fog (set in core/scene.js).
  if(typeof isRain!=='undefined'&&isRain){
    isRain=false;
    if(typeof _rainTarget!=='undefined')_rainTarget=0;
    if(typeof _rainIntensity!=='undefined')_rainIntensity=0;
    if(rainCanvas)rainCanvas.style.display='none';
  }
  // Ground — flat volcanic-rock plane.
  const g=new THREE.Mesh(
    new THREE.PlaneGeometry(2400,2400),
    new THREE.MeshLambertMaterial({color:0x0a0303,map:_vcGroundTex()})
  );
  g.rotation.x=-Math.PI/2;g.position.y=-.15;g.receiveShadow=true;
  g.userData._isProcGround=true;
  scene.add(g);
  // Day lighting via shared helper (P3).
  _applyVolcanoCinematicDayLighting();
  // Barriers + start line.
  buildBarriers();buildStartLine();
  // Cinematic ground fog — warm ash colour. Density tuned higher than
  // Pier 47 (the caldera-floor air should feel thicker, not draughty).
  if(typeof buildCinematicGroundFog==='function'){
    buildCinematicGroundFog(scene, {
      color: _VC_PALETTE.ashWarm,
      density: 0.62,
      height: 4.0,
      layerCount: 3,
      layerSpacing: 1.8,
      size: 900,
      scrollDir: [0.6, 0.4],
      scrollSpeed: 0.008,
      fadeWithDistance: true
    });
  }
  // Cinematic lamp poles — lava-tinted.
  _vcBuildCinematicLamps();
  // Distant markers.
  _vcBuildDistantMarkers();
  // Cinematic camera shake — slightly stronger than Pier 47.
  if(typeof enableCinematicCameraShake==='function'){
    enableCinematicCameraShake({
      intensityScale: 1.2,
      speedThreshold: 0.18,
      maxOffset:      0.055
    });
  }
  // Player + AI headlight refs.
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);
  // Stars — always-off (volcanic-ash sky has no visible stars). Built so
  // toggleNight references don't crash on null.
  {
    const sg=new THREE.SphereGeometry(.10,4,4);
    const sm=new THREE.MeshBasicMaterial({color:0x4a0808,transparent:true,opacity:.3});
    stars=new THREE.InstancedMesh(sg,sm,20);stars.visible=false;
    const dm=new THREE.Object3D();
    for(let i=0;i<20;i++){
      const th=Math.random()*Math.PI*2,ph=Math.random()*Math.PI*.3,r=320+Math.random()*60;
      dm.position.set(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph)*.4+50,r*Math.sin(ph)*Math.sin(th));
      dm.scale.setScalar(.4);dm.updateMatrix();stars.setMatrixAt(i,dm.matrix);
    }
    stars.instanceMatrix.needsUpdate=true;scene.add(stars);
  }
}

// ── Cinematic lamp-pole array ─────────────────────────────────────────────
//
// Lava-tinted lamps. Lower count than Pier 47 (caldera is desolate, not
// industrial) and warmer-colour palette stress-tests the cinematic.js
// helpers' default amber assumption.
function _vcBuildCinematicLamps(){
  if(typeof buildCinematicLightPole!=='function')return;
  const mob=window._isMobile;
  const COUNT=mob?10:16;
  const TILT_FRAC=0.18;
  const BROKEN_FRAC=0.20;
  const rng=(i)=>{const x=Math.sin(i*12.9898+78.233)*43758.5453; return x-Math.floor(x);};
  for(let i=0;i<COUNT;i++){
    const t=i/COUNT;
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const ang=Math.atan2(tg.x,tg.z);
    [-1,1].forEach((side, sIdx)=>{
      const seed=i*2+sIdx;
      const off=BARRIER_OFF+2.6;
      const px=p.x+nr.x*side*off;
      const pz=p.z+nr.z*side*off;
      const isTilted=rng(seed)<TILT_FRAC;
      const isBroken=rng(seed+0.5)<BROKEN_FRAC;
      const facingY=(side===1)?ang+Math.PI/2:ang-Math.PI/2;
      // Mix two warm tones across the array — half hot lava-red, half
      // mid-warm. Stress-tests cinematic.js with two distinct red palette
      // variants in the same world.
      const lampColor=(rng(seed+0.3)<0.5)?_VC_PALETTE.lavaHot:_VC_PALETTE.lavaWarm;
      buildCinematicLightPole(scene, new THREE.Vector3(px,0,pz), {
        color: lampColor,
        intensity: 1.4,
        range: 24,
        height: 7.6,
        armLength: 1.4,
        poolRadius: 10,
        working: !isBroken,
        tilt: isTilted ? ((rng(seed+0.7)-0.5)*0.14) : 0,
        facingY: facingY,
        castGroundPool: true,
        castVolumetricCone: true,
        castHalo: true
      });
    });
  }
}

// ── Distant markers — deep-ember pulses on far peaks + one warm morse ────
function _vcBuildDistantMarkers(){
  if(typeof buildCinematicBlinkingMarker!=='function')return;
  const embers=[
    new THREE.Vector3( 290,  68,  240),
    new THREE.Vector3(-310,  84, -180),
    new THREE.Vector3( 200,  60, -300),
  ];
  embers.forEach((pos,i)=>{
    buildCinematicBlinkingMarker(scene, pos, {
      color: _VC_PALETTE.emberDeep,
      pattern: 'slow-pulse',
      blinkInterval: 3.0+i*0.4,
      intensity: 1.2,
      range: 60,
      haloSize: 4.6,
      includeLight: false
    });
  });
  buildCinematicBlinkingMarker(scene, new THREE.Vector3(-200, 52, 280), {
    color: _VC_PALETTE.lavaWarm,
    pattern: 'morse',
    blinkInterval: 5.5,
    intensity: 0.7,
    range: 36,
    haloSize: 2.8,
    includeLight: true
  });
}

// ── Per-frame world update ────────────────────────────────────────────────
//
// Sessie 1 has no per-frame world state of its own — all cinematic effects
// (fog scroll, lamp flicker, marker patterns, camera shake) are driven by
// updateCinematic(dt) in cinematic.js. Sessie 2 will introduce lava-river
// + ash-fall + ember update logic here.
function updateVolcanoCinematicWorld(dt){
  // Reserved for sessie 2 — currently no-op.
}
if(typeof window!=='undefined') window.updateVolcanoCinematicWorld=updateVolcanoCinematicWorld;
