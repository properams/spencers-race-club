// js/gameplay/camera.js — non-module script.

'use strict';

// Pre-allocated scratch vectors (uit main.js verhuisd) — cross-script
// zichtbaar voor effects/night.js + visuals.js die _camV1/_camV2 lezen.
const _camV1=new THREE.Vector3(),_camV2=new THREE.Vector3();

// Mirror state (uit main.js verhuisd). mirrorCamera wordt gevuld in
// core/scene.js buildScene(); _mirrorEnabled toggleable via input.js (M-key).
// updateMirror() onder in dit bestand gebruikt beide.
let mirrorCamera=null;
let _mirrorEnabled=true;

// Camera animation/state (uit main.js verhuisd):
//   camShake        — collision shake amplitude (decays in updateCamera)
//   _camView        — 0=Chase 1=Helicopter 2=Hood 3=Bumper (input.js: V-key)
//   _camLateralT    — corner pan accumulator
//   _victoryOrbit   — cinematic orbit na finish (set in finish.js)
//   _introPanTimer  — race-intro pan duration (set in race.js startCountdown)
//   _titleCamT      — title-screen rotation phase
let camShake=0;
let _camView=0;
let _camLateralT=0;
let _victoryOrbit=false;
let _introPanTimer=0;
let _titleCamT=0;

function updateCamera(dt){
  const car=carObjs[playerIdx];if(!car)return;
  // Victory orbit: cinematic rotation around player car after finishing
  if(_victoryOrbit){
    const angle=_nowSec*.38,r=17,h=8;
    camera.position.set(
      car.mesh.position.x+Math.cos(angle)*r,
      car.mesh.position.y+h,
      car.mesh.position.z+Math.sin(angle)*r);
    camera.lookAt(car.mesh.position.x,car.mesh.position.y+.8,car.mesh.position.z);
    camera.fov+=(62-camera.fov)*Math.min(1,dt*2);camera.updateProjectionMatrix();
    return;
  }
  // Intro cinematic pan — for first 3s of race, slow lerp from dramatic overhead
  if(_introPanTimer>0){
    _introPanTimer=Math.max(0,_introPanTimer-dt);
    const blend=_introPanTimer/3.0; // 1→0 over 3 seconds
    _camV1.set(0,5.8,13.5).applyQuaternion(car.mesh.quaternion);
    _camV2.copy(car.mesh.position).add(_camV1);
    camPos.lerp(_camV2,Math.min(1,dt*(2+6*(1-blend)))); // slow start, fast at end
    _camV1.set(0,.8,-7).applyQuaternion(car.mesh.quaternion);
    _camV2.copy(car.mesh.position).add(_camV1);
    camTgt.lerp(_camV2,Math.min(1,dt*4));
    camera.position.copy(camPos);camera.lookAt(camTgt);
    const tFov=62+blend*18; // zoom in from 80° to 62° as pan ends
    camera.fov+=(tFov-camera.fov)*Math.min(1,dt*2.5);camera.updateProjectionMatrix();
    return;
  }

  if(_camView===1){
    // ── Helicopter / TV cam — high wide shot following car
    const angle=_nowSec*.08;
    const r=44,h=32;
    const tx=car.mesh.position.x,tz=car.mesh.position.z;
    camera.position.set(tx+Math.cos(angle)*r,car.mesh.position.y+h,tz+Math.sin(angle)*r);
    camera.lookAt(tx,car.mesh.position.y+.5,tz);
    camera.fov+=(72-camera.fov)*Math.min(1,dt*2);camera.updateProjectionMatrix();
    return;
  }
  if(_camView===2){
    // ── Hood cam — low, just above windscreen
    _camV1.set(0,.92,-0.4).applyQuaternion(car.mesh.quaternion);
    camera.position.copy(car.mesh.position).add(_camV1);
    _camV2.set(0,.88,-8).applyQuaternion(car.mesh.quaternion);
    _camV2.add(car.mesh.position);
    camera.lookAt(_camV2);
    camera.fov+=(70-camera.fov)*Math.min(1,dt*4);camera.updateProjectionMatrix();
    return;
  }
  if(_camView===3){
    // ── Bumper cam — very low, front nose
    _camV1.set(0,.26,-1.45).applyQuaternion(car.mesh.quaternion);
    camera.position.copy(car.mesh.position).add(_camV1);
    _camV2.set(0,.24,-12).applyQuaternion(car.mesh.quaternion);
    _camV2.add(car.mesh.position);
    camera.lookAt(_camV2);
    camera.fov+=(82-camera.fov)*Math.min(1,dt*4);camera.updateProjectionMatrix();
    return;
  }

  // ── Chase cam (default, _camView===0) ──────────────────
  // Mobile uses the SAME camera offset as desktop so the car has the same size/position on screen.
  // Screen-size adaptation happens via HFOV/VFOV only (zie baseFov hieronder).
  // In portrait wordt de offset iets dichterbij gezet zodat de auto niet verloren raakt
  // in een verticale frame met smal blikveld.
  const _portrait=(camera.aspect||(innerWidth/innerHeight))<1;
  if(_portrait)_camV1.set(0,4.6,10.5);
  else _camV1.set(0,5.8,13.5);
  _camV1.applyQuaternion(car.mesh.quaternion);
  _camV2.copy(car.mesh.position).add(_camV1);
  camPos.lerp(_camV2,Math.min(1,dt*7));
  // Corner look-ahead: shift look TARGET subtly toward turn direction — no body sway
  const _steerInp=(keys['ArrowRight']||keys['KeyD'])?1:(keys['ArrowLeft']||keys['KeyA'])?-1:0;
  _camLateralT+=(_steerInp*1.4-_camLateralT)*Math.min(1,dt*1.6);
  _camV1.set(0,.8,-7).applyQuaternion(car.mesh.quaternion);
  _camV2.copy(car.mesh.position).add(_camV1);
  camTgt.lerp(_camV2,Math.min(1,dt*9));
  // Shift only the look target (camera stays put) — subtle corner peek, not disorienting
  _camV1.set(1,0,0).applyQuaternion(car.mesh.quaternion);
  camTgt.addScaledVector(_camV1,_camLateralT);
  let px=camPos.x,py=camPos.y,pz=camPos.z;
  if(camShake>0){const s=camShake*.5;px+=(Math.random()-.5)*s;py+=(Math.random()-.5)*s*.4;pz+=(Math.random()-.5)*s;camShake=Math.max(0,camShake-dt*2.5);}
    if(_comboTimer>0){_comboTimer-=dt;if(_comboTimer<=0)resetCombo();}
  camera.position.set(px,Math.max(.5,py),pz);camera.lookAt(camTgt);
  // Dynamic FOV — wider at high speed for sense of velocity, more extreme on nitro.
  // Landscape: derive vertical FOV from a constant horizontal FOV zodat de framing
  // hetzelfde voelt op desktop 16:9, phone 19:9, iPad 1.71 en iPad 4:3.
  // Portrait (aspect<1): die HFOV-formule blaast VFOV op tot 130°+ waardoor alles weg-zoomt.
  // Daarom in portrait een vaste verticale FOV gebruiken — phones iets ruimer dan tablets.
  const _asp=camera.aspect||(innerWidth/innerHeight);
  let baseFov;
  if(_asp<1){
    baseFov=window._isMobile?72:68;
  }else{
    const TARGET_HFOV_DEG=window._isMobile?96:92;
    baseFov=2*Math.atan(Math.tan(TARGET_HFOV_DEG*Math.PI/360)/_asp)*180/Math.PI;
  }
  // Sterker FOV-kick bij boost/nitro voor "speed punch" gevoel — bloom maakt
  // emissive props feller, dus de wider-FOV-pulse landt visueel zichtbaarder.
  // In portrait worden de kickers gehalveerd zodat de totaal-FOV niet alsnog boven ~95° komt
  // en het beeld z'n cinematic framing behoudt.
  const _kickScale=_portrait?0.5:1;
  const tFov=baseFov+(Math.abs(car.speed)/car.def.topSpd*22+(nitroActive?20:0)+(car.boostTimer>0?10:0))*_kickScale;
  // FOV reageert sneller wanneer boost net start (high-pass via dt*5 ipv 3.5)
  const fovRate=(nitroActive||car.boostTimer>0)?5.0:3.0;
  camera.fov+=(tFov-camera.fov)*Math.min(1,dt*fovRate);
  camera.updateProjectionMatrix();
}


function setCamView(n){
  _camView=n;
  const names=['CHASE CAM','HELI CAM','HOOD CAM','BUMPER CAM'];
  showPopup(names[n],'#88ddff',900);
  // Highlight active button
  [0,1,2,3].forEach(i=>{
    const b=document.getElementById('pcam'+i);
    if(b)b.style.border=i===n?'2px solid #ff7700':'';
  });
}


function updateMirror(){
  const car=carObjs[playerIdx];
  if(!car||!mirrorCamera||!_mirrorEnabled||_camView!==0)return;
  const mf=document.getElementById('mirrorFrame'),ml=document.getElementById('mirrorLabel');
  // Hide mirror during the countdown so it doesn't clash with the start lights overlay
  if(gameState==='COUNTDOWN'){if(mf)mf.style.display='none';if(ml)ml.style.display='none';return;}
  if(mf)mf.style.display='block';if(ml)ml.style.display='block';

  // Position mirror camera inside car cabin looking backward
  const fwd=_camV1.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
  mirrorCamera.position.copy(car.mesh.position)
    .addScaledVector(fwd,-0.5);
  mirrorCamera.position.y+=0.75;
  // Look in the forward direction (mirror = see what's behind you)
  mirrorCamera.rotation.copy(car.mesh.rotation);
  mirrorCamera.rotation.y+=Math.PI; // face backward

  // Three.js setViewport/setScissor expect CSS pixels — it multiplies by pixelRatio internally.
  // Passing physical (DPR-multiplied) pixels here caused the main viewport to be 2× too large
  // on iPad (DPR=2), zooming the whole scene 2× and pushing the player car off-screen right.
  const cW=innerWidth,cH=innerHeight;
  const mw=204,mh=82;
  const mx=Math.round((cW-mw)/2); // center-aligned to match CSS left:50% translateX(-50%)
  const topPx=14;
  const myGl=cH-topPx-mh;

  renderer.setViewport(mx,myGl,mw,mh);
  renderer.setScissor(mx,myGl,mw,mh);
  renderer.setScissorTest(true);
  mirrorCamera.aspect=mw/mh;mirrorCamera.updateProjectionMatrix();
  renderer.render(scene,mirrorCamera);
  renderer.setScissorTest(false);
  renderer.setViewport(0,0,cW,cH);
}

