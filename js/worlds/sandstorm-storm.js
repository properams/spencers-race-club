// js/worlds/sandstorm-storm.js — rolling sandstorm hazard for sandstorm world.
// Non-module script. Loads BEFORE worlds/sandstorm.js so its build/update
// functions are visible when sandstorm.js calls them.
//
// Lifecycle:
//   buildSandstormStorm()                — called from buildSandstormEnvironment()
//   updateSandstormStorm(dt, currentLap) — called from updateSandstormWorld(dt)
//   disposeSandstormStorm()              — called from _resetRaceState()
//
// Per-lap progressive states (lap = 1, 2, 3+):
//   lap 1 → fog far 220, no overlay, no particles, no wind pull (clear)
//   lap 2 → fog far 110, orange overlay 0.25, 600 particles, wind pull 0.05
//   lap 3 → fog far  55, brown overlay  0.55, 1500 particles, wind pull 0.12
//
// Smooth interpolation tussen lap-overgangen via een vaste tijds-constante
// (4s) zonder lap-edge bookkeeping — `value += (target-value) * dt * K` is
// frame-rate independent en re-syncs vanzelf na een pause/resume.

'use strict';

// Per-frame lerp rate. With dt~0.016s @60fps this gives a half-life of ~42
// frames (~0.7s) — close to the spec's "smooth interpolation over 4 seconds"
// without feeling sluggish. (Earlier draft had a misleading
// `_SS_INTERP_K=0.25 * 4` math; collapsed to a single constant.)
const _SS_LERP_RATE=1.0;
const _SS_FOG_FAR_DEFAULT=220;
const _SS_PARTICLES_MOBILE_MAX=600;
const _SS_PARTICLES_DESKTOP_MAX=1500;
const _SS_CURTAIN_COUNT_MOBILE=1;
const _SS_CURTAIN_COUNT_DESKTOP=3;

// Per-lap targets. Linear lookup; values lerp via _SS_INTERP_K.
function _sstTargets(lap){
  if(lap<=1)return {fogFar:220, overlayOp:0.0,  windGain:0.0, particles:0,    windPull:0.00, curtainOp:0.0,  shake:0.0};
  if(lap===2)return {fogFar:110, overlayOp:0.25, windGain:0.5, particles:600,  windPull:0.05, curtainOp:0.20, shake:0.0};
  return         {fogFar: 55, overlayOp:0.55, windGain:1.0, particles:1500, windPull:0.12, curtainOp:0.45, shake:1.0};
}

let _sstState=null;
let _sstParticleGeo=null;
let _sstParticleMesh=null;
let _sstStormCurtain=[];   // [{mesh, baseY}]
let _sstSharedCurtainTex=null; // disposed explicitly (flagged _sharedAsset)
let _sstOverlay=null;      // DOM div (kept alive across races, opacity controlled)
let _sstHeadlightsOn=false;
let _sstScratch=null;      // pre-allocated Vector3 (per-frame physics use)

function _sstStormCurtainTex(){
  // Procedural sand-haze texture for the storm-front planes.
  const W=256,H=128,c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d');
  g.fillStyle='rgba(180,110,50,0.7)';g.fillRect(0,0,W,H);
  // Random dust blobs
  for(let i=0;i<60;i++){
    const x=Math.random()*W,y=Math.random()*H,r=4+Math.random()*15;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba(160,90,40,0.5)');
    grd.addColorStop(1,'rgba(160,90,40,0)');
    g.fillStyle=grd;g.fillRect(x-r,y-r,r*2,r*2);
  }
  // Soft top/bottom alpha falloff so the curtain blends with the fog
  const fade=g.createLinearGradient(0,0,0,H);
  fade.addColorStop(0,'rgba(0,0,0,0)');
  fade.addColorStop(0.5,'rgba(0,0,0,1)');
  fade.addColorStop(1,'rgba(0,0,0,0)');
  g.globalCompositeOperation='destination-in';
  g.fillStyle=fade;g.fillRect(0,0,W,H);
  g.globalCompositeOperation='source-over';
  const t=new THREE.CanvasTexture(c);t.needsUpdate=true;return t;
}

function buildSandstormStorm(){
  if(typeof scene==='undefined'||!scene)return;
  // Idempotency: reset any leftover state from a previous race-build.
  disposeSandstormStorm();

  _sstState={
    lap:1,
    fogFar:_SS_FOG_FAR_DEFAULT,
    overlayOp:0,
    windGain:0,
    particles:0,
    windPull:0,
    curtainOp:0,
    shake:0,
    _partTick:0,
    _lastOvKey:0
  };

  // ── Particle pool (max for lap 3, drawRange controls lap-by-lap density)
  const MAX=window._isMobile?_SS_PARTICLES_MOBILE_MAX:_SS_PARTICLES_DESKTOP_MAX;
  _sstParticleGeo=new THREE.BufferGeometry();
  const pos=new Float32Array(MAX*3);
  // Initialize particles "off-screen" so an unset position doesn't visually pop
  // when drawRange first opens up.
  for(let i=0;i<MAX;i++){
    pos[i*3]=10000;pos[i*3+1]=-100;pos[i*3+2]=10000;
  }
  _sstParticleGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  _sstParticleGeo.setDrawRange(0,0);
  const partMat=new THREE.PointsMaterial({
    color:0xd4a55a,size:0.45,transparent:true,opacity:0.7,
    sizeAttenuation:true,blending:THREE.AdditiveBlending,depthWrite:false
  });
  _sstParticleMesh=new THREE.Points(_sstParticleGeo,partMat);
  // Particles are positioned around the camera each frame; keep them unculled
  // so a fresh drawRange opening doesn't have to wait for frustum probes.
  _sstParticleMesh.frustumCulled=false;
  scene.add(_sstParticleMesh);

  // ── Storm-front curtain (semi-transparent stacked planes)
  // Mark the (single) base canvas as a shared asset so disposeScene's
  // _disposeMat traversal skips it on the first plane it sees — without
  // this flag, three planes pointing at the same texture would each
  // call .dispose() on it (idempotent today, but brittle and explicitly
  // called out by the code-quality review). The texture itself is freed
  // explicitly in disposeSandstormStorm() below.
  const curtainCount=window._isMobile?_SS_CURTAIN_COUNT_MOBILE:_SS_CURTAIN_COUNT_DESKTOP;
  const curtainTex=_sstStormCurtainTex();
  curtainTex.userData=curtainTex.userData||{};
  curtainTex.userData._sharedAsset=true;
  _sstSharedCurtainTex=curtainTex;
  for(let i=0;i<curtainCount;i++){
    const curMat=new THREE.MeshBasicMaterial({
      map:curtainTex,transparent:true,opacity:0,
      side:THREE.DoubleSide,depthWrite:false,fog:true
    });
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(420,140),curMat);
    plane.position.set(0,55,-220+i*8);
    plane.renderOrder=-5; // draw behind silhouette layers
    scene.add(plane);
    _sstStormCurtain.push({mesh:plane,baseY:55});
  }

  // ── DOM overlay for full-screen haze tint (cheap — no postfx pass)
  let ov=document.getElementById('sandstormOverlay');
  if(!ov){
    ov=document.createElement('div');
    ov.id='sandstormOverlay';
    // mix-blend-mode: multiply makes the overlay darken+tint without
    // simply graying out the scene. inset:0 covers the whole viewport.
    ov.style.cssText='position:fixed;inset:0;pointer-events:none;background:rgba(180,110,50,0);z-index:5;mix-blend-mode:multiply';
    document.body.appendChild(ov);
  }else{
    ov.style.background='rgba(180,110,50,0)';
  }
  _sstOverlay=ov;

  _sstScratch=new THREE.Vector3();
  _sstHeadlightsOn=false;
  if(typeof window!=='undefined')window._sandstormWindPull=0;
}

function _sstUpdateParticles(dt,activeCount){
  if(!_sstParticleGeo||activeCount<=0)return;
  const pos=_sstParticleGeo.attributes.position.array;
  const car=carObjs[playerIdx];
  if(!car)return;
  const cx=car.mesh.position.x,cz=car.mesh.position.z;
  // Update a slice each frame (rolling buffer) so worst-case 1500 particles
  // never stall a single frame. 50 per frame at 60fps = full pool every
  // ~0.5s on lap 3 (1500 particles), ~0.2s on mobile (600).
  const STEP=Math.min(activeCount,50);
  let start=_sstState._partTick||0;
  if(start>=activeCount)start=0;
  _sstState._partTick=(start+STEP)%activeCount;
  const windX=25,windZ=8; // lateral drift speed (units/sec)
  for(let i=0;i<STEP;i++){
    const idx=(start+i)%activeCount;
    const ix=idx*3;
    pos[ix]+=windX*dt;
    pos[ix+1]-=dt*0.5;
    pos[ix+2]+=windZ*dt;
    const dx=pos[ix]-cx,dz=pos[ix+2]-cz;
    if(Math.abs(dx)>80||Math.abs(dz)>80||pos[ix+1]<0||pos[ix+1]>30){
      // Respawn upwind of the car (left side, since wind blows +X)
      pos[ix]=cx-60+Math.random()*20;
      pos[ix+1]=Math.random()*15+1;
      pos[ix+2]=cz+(Math.random()-0.5)*120;
    }
  }
  _sstParticleGeo.attributes.position.needsUpdate=true;
}

function updateSandstormStorm(dt,currentLap){
  if(!_sstState)return;
  const st=_sstState;
  st.lap=Math.max(1,currentLap||1);
  const tg=_sstTargets(st.lap);
  // Frame-rate-independent lerp toward the lap targets.
  const k=Math.min(1,dt*_SS_LERP_RATE);
  st.fogFar    +=(tg.fogFar    -st.fogFar)   *k;
  st.overlayOp +=(tg.overlayOp -st.overlayOp)*k;
  st.windGain  +=(tg.windGain  -st.windGain) *k;
  st.windPull  +=(tg.windPull  -st.windPull) *k;
  st.curtainOp +=(tg.curtainOp -st.curtainOp)*k;
  st.shake     +=(tg.shake     -st.shake)    *k;
  st.particles +=(tg.particles -st.particles)*k;

  // ── Apply: scene fog far (linear THREE.Fog only)
  if(scene&&scene.fog&&typeof scene.fog.far==='number'){
    scene.fog.far=st.fogFar;
  }

  // ── Apply: DOM overlay tint. Blend lap2 orange → lap3 brown via st.lap.
  // Delta-gate the style.background write — mix-blend-mode:multiply forces
  // a compositor repaint every time the value changes; once the lerp
  // settles (steady-state mid-lap) most frames are no-op.
  if(_sstOverlay){
    const lapBlend=Math.min(1,Math.max(0,(st.lap-2)));
    const r=Math.round(180+(140-180)*lapBlend);
    const gC=Math.round(110+(80-110)*lapBlend);
    const b=Math.round(50+(40-50)*lapBlend);
    const aQ=Math.round(st.overlayOp*255);
    const key=(r<<24)|(gC<<16)|(b<<8)|aQ;
    if(key!==st._lastOvKey){
      st._lastOvKey=key;
      _sstOverlay.style.background='rgba('+r+','+gC+','+b+','+st.overlayOp.toFixed(3)+')';
    }
  }

  // ── Apply: audio gain via the Audio facade. Skip when not in RACE so
  // showFinish()'s Audio.stopSandstormWind() isn't immediately undone by
  // the next frame's lazy re-init (the FINISH-screen "wind plays after
  // teardown" bug). The visuals can keep lerping toward target without
  // re-stoking audio.
  if(window.Audio&&typeof Audio.setSandstormIntensity==='function'&&gameState==='RACE'){
    Audio.setSandstormIntensity(st.windGain);
  }

  // ── Apply: physics wind-pull (read by cars/physics.js + cars/ai.js)
  if(typeof window!=='undefined')window._sandstormWindPull=st.windPull;

  // ── Apply: particle update + drawRange to render only the active count.
  const activeP=Math.round(st.particles);
  if(activeP>0){
    _sstUpdateParticles(dt,activeP);
    if(_sstParticleGeo)_sstParticleGeo.setDrawRange(0,activeP);
  }else if(_sstParticleGeo){
    _sstParticleGeo.setDrawRange(0,0);
  }

  // ── Apply: storm curtain. Each plane positions itself ahead of the player
  // car so the "wall of dust" approaches when the player stops, but recedes
  // again when the player drives into it. Only update curtain transform when
  // a car exists (skip in countdown).
  const car=carObjs[playerIdx];
  if(car&&_sstScratch){
    _sstScratch.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
    const dist=st.lap>=3?80:st.lap>=2?140:220;
    // Skip the transparent-blend draw entirely when the curtain is
    // effectively invisible (lap 1) — saves fillrate on mobile where the
    // curtain plane covers ~1/3 of the viewport. perf-budget review hint.
    const visible=st.curtainOp>0.01;
    for(let i=0;i<_sstStormCurtain.length;i++){
      const c=_sstStormCurtain[i];
      c.mesh.visible=visible;
      if(!visible)continue;
      const offX=(i-(_sstStormCurtain.length-1)*0.5)*22;
      c.mesh.position.set(
        car.mesh.position.x+_sstScratch.x*dist+offX,
        c.baseY,
        car.mesh.position.z+_sstScratch.z*dist
      );
      c.mesh.lookAt(car.mesh.position.x,c.baseY,car.mesh.position.z);
      c.mesh.material.opacity=st.curtainOp;
    }
  }

  // ── Apply: headlights auto-on while lap >= 2. Re-applied per-frame so a
  // mid-storm toggleNight (which writes plHeadL.intensity=0 on day-mode
  // for sandstorm in night.js) doesn't kill the storm-mandated lights.
  // Idempotent — equivalent to a one-shot latch when nothing else writes,
  // but robust against external resets. _sstHeadlightsOn is kept as a
  // diagnostic flag (used by dispose to know if we modified them).
  if(st.lap>=2){
    _sstHeadlightsOn=true;
    if(plHeadL&&plHeadL.intensity<1.7)plHeadL.intensity=1.7;
    if(plHeadR&&plHeadR.intensity<1.7)plHeadR.intensity=1.7;
    if(plTail&&plTail.intensity<1.4)plTail.intensity=1.4;
    if(typeof _aiHeadPool!=='undefined'){
      for(let i=0;i<_aiHeadPool.length;i++){
        if(_aiHeadPool[i].intensity<1.0)_aiHeadPool[i].intensity=1.0;
      }
    }
  }

  // ── Apply: lap-3 camera shake. Subtle and only triggered when shake is
  // actually ramped up. Uses the existing camShake global so it composes
  // cleanly with collision-shake / volcano-eruption shake.
  if(st.shake>0.1&&typeof camShake!=='undefined'){
    const amp=(window._isMobile?0.04:0.08)*st.shake;
    if(camShake<amp)camShake=amp;
  }
}

function disposeSandstormStorm(){
  // Release the night.js sky-cache (day + night skybox + PMREM env). These
  // outlive a single race because they're cached for instant M-toggle, so
  // they need explicit cleanup before the next buildScene allocates fresh
  // day textures (otherwise the old day-cache holds a stale reference).
  if(typeof _disposeSandstormSkyCache==='function')_disposeSandstormSkyCache();
  // Reset hazard state so a re-build starts fresh. The Three meshes (particles,
  // curtain) are owned by the scene-graph and will be released by disposeScene()
  // on the next world-switch — we only clear our refs here.
  _sstState=null;
  _sstStormCurtain.length=0;
  _sstParticleGeo=null;
  _sstParticleMesh=null;
  _sstHeadlightsOn=false;
  _sstScratch=null;
  // The shared curtain canvas was flagged _sharedAsset so disposeScene's
  // traversal skipped it; release it explicitly here so the next build's
  // _sstStormCurtainTex() doesn't accumulate unused canvas-textures.
  if(_sstSharedCurtainTex){
    try{_sstSharedCurtainTex.dispose();}catch(_){}
    _sstSharedCurtainTex=null;
  }
  // Hide the DOM overlay (don't remove — kept alive across races to avoid
  // re-creating + re-styling). Reset BOTH background-rgba AND opacity so a
  // future inline-style mutation (e.g. dev-tools / 3rd party script)
  // can't leave a stale tint visible across races.
  if(_sstOverlay){
    _sstOverlay.style.background='rgba(180,110,50,0)';
    _sstOverlay.style.opacity='0';
  }
  // Reset globals so the next race / different world doesn't inherit pull.
  if(typeof window!=='undefined')window._sandstormWindPull=0;
  // Restore fog far if we were just on sandstorm — otherwise leave alone
  // (the next world's buildScene will set its own fog).
  if(typeof scene!=='undefined'&&scene&&scene.fog&&typeof scene.fog.far==='number'
      &&typeof activeWorld!=='undefined'&&activeWorld==='sandstorm'){
    scene.fog.far=_SS_FOG_FAR_DEFAULT;
  }
}

if(typeof window!=='undefined')window._sandstormWindPull=0;
