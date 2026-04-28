// js/effects/night.js — non-module script.

'use strict';

// Day↔night smooth-transition state (uit main.js verhuisd).
//   _skyT       — current blend factor 0=day, 1=night (lerps richting _skyTarget)
//   _skyTarget  — gewenste eindwaarde, geset door toggleNight() hieronder
//   _fogColorDay / _fogColorNight — lerped via lerpColors() voor scene.fog.color.
// Per wereld worden deze fog-kleuren herset in core/scene.js buildScene().
// _skyT decay-stap zit in track/environment.js update().
let _skyT=0,_skyTarget=0;
const _fogColorDay=new THREE.Color(0x8ac0e0);
const _fogColorNight=new THREE.Color(0x030610);
// Per-world "no rain" fog density. updateWeather() reads this so its rain-blend
// adds rainAdd on top of the active world's base instead of clobbering all worlds
// to GP-hardcoded values every frame. Set at end of toggleNight() and on
// non-rain branches of setWeather().
let _fogBaseDensity=.0021;

function toggleNight(){
  isDark=!isDark;
  localStorage.setItem('src_night',isDark?'1':'0');
  _skyTarget=isDark?1:0;
  if(activeWorld==='deepsea'){
    // Underwater — toggle is shallow water (day) vs deep abyss (night)
    if(isDark){
      scene.background=makeSkyTex('#000810','#00101a');scene.fog.density=.0018;
      sunLight.intensity=.08;ambientLight.intensity=.20;hemiLight.intensity=.14;
      trackLightList.forEach(l=>l.intensity=1.6);trackPoles.forEach(p=>p.visible=true);
      if(stars)stars.visible=true; // biolum particles
      _dsaBioEdges.forEach(e=>e.mat.opacity=.85);
      _jellyfishList.forEach(j=>{const pl=j.children.find(c=>c.isLight);if(pl)pl.intensity=1.4;});
    }else{
      scene.background=makeSkyTex('#001825','#003355');scene.fog.density=.0019;
      sunLight.intensity=.45;ambientLight.intensity=.55;hemiLight.intensity=.30;
      trackLightList.forEach(l=>l.intensity=0);trackPoles.forEach(p=>p.visible=false);
      if(stars)stars.visible=false;
      _dsaBioEdges.forEach(e=>e.mat.opacity=.45);
      _jellyfishList.forEach(j=>{const pl=j.children.find(c=>c.isLight);if(pl)pl.intensity=.6;});
    }
    if(plHeadL){plHeadL.intensity=isDark?2.2:0;plHeadR.intensity=isDark?2.2:0;}
    if(plTail)plTail.intensity=isDark?1.6:0;
    _aiHeadPool.forEach(l=>l.intensity=isDark?1.4:0);
    if(_sunBillboard)_sunBillboard.visible=false;
  }else if(activeWorld==='neoncity'){
    // Neon City — always night, toggle adjusts neon intensity
    if(isDark){
      scene.background=makeSkyTex('#000008','#030012');scene.fog.density=.0014;
      sunLight.intensity=.04;ambientLight.intensity=.24;hemiLight.intensity=.16;
      trackLightList.forEach(l=>{if(l.intensity>0)l.intensity=Math.min(l.intensity*1.3,4.5);});
    }else{
      scene.background=makeSkyTex('#040015','#080025');scene.fog.density=.0021;
      sunLight.color.setHex(0x441122);sunLight.intensity=.08;
      ambientLight.intensity=.22;hemiLight.intensity=.18;
    }
    if(stars)stars.visible=true;
    if(plHeadL){plHeadL.intensity=2.8;plHeadR.intensity=2.8;}
    if(plTail)plTail.intensity=2.0;
    _aiHeadPool.forEach(l=>l.intensity=1.8);
    if(_sunBillboard)_sunBillboard.visible=false;
  }else if(activeWorld==='arctic'){
    if(isDark){scene.background=makeSkyTex('#040c18','#0a1828');scene.fog.density=.0035;
      sunLight.intensity=.10;ambientLight.intensity=.22;trackLightList.forEach(function(l){l.intensity=1.4;});
    }else{scene.background=makeSkyTex('#0a1525','#1a3050');scene.fog.density=.0035;
      sunLight.color.setHex(0xaaccff);sunLight.intensity=.8;ambientLight.intensity=.45;trackLightList.forEach(function(l){l.intensity=0;});
    }
    if(stars)stars.visible=isDark;
    if(plHeadL){plHeadL.intensity=isDark?2.6:0;plHeadR.intensity=isDark?2.6:0;}
    if(plTail)plTail.intensity=isDark?1.6:0;
    _aiHeadPool.forEach(function(l){l.intensity=isDark?1.5:0;});
    if(_sunBillboard)_sunBillboard.visible=!isDark;
  }else if(activeWorld==='volcano'){
    sunLight.intensity=isDark?.10:.7;ambientLight.intensity=isDark?.22:.35;hemiLight.intensity=isDark?.15:.25;
    if(stars)stars.visible=true;
    trackLightList.forEach(function(l){l.intensity=isDark?1.8:0;});
    if(plHeadL){plHeadL.intensity=isDark?2.8:0;plHeadR.intensity=isDark?2.8:0;}
    if(plTail)plTail.intensity=isDark?2.0:0;
    _aiHeadPool.forEach(function(l){l.intensity=isDark?1.8:0;});
    if(_sunBillboard)_sunBillboard.visible=false;
  }else if(activeWorld==='themepark'){
    // Sunset park stays sunset-toned; toggle dims/lights it without swapping the skybox to GP blue.
    if(isDark){
      scene.background=makeSkyTex('#150022','#3a0e22');scene.fog.density=.0014;
      sunLight.intensity=.12;ambientLight.intensity=.25;hemiLight.intensity=.20;
      trackLightList.forEach(l=>l.intensity=2.2);trackPoles.forEach(p=>p.visible=true);
    }else{
      scene.background=makeSkyTex('#2a0844','#ff8844');scene.fog.density=.0019;
      sunLight.intensity=.85;ambientLight.intensity=.45;hemiLight.intensity=.35;
      trackLightList.forEach(l=>l.intensity=0);trackPoles.forEach(p=>p.visible=false);
    }
    if(stars)stars.visible=isDark;
    if(plHeadL){plHeadL.intensity=isDark?2.4:0;plHeadR.intensity=isDark?2.4:0;}
    if(plTail)plTail.intensity=isDark?1.6:0;
    _aiHeadPool.forEach(l=>l.intensity=isDark?1.6:0);
    if(_sunBillboard)_sunBillboard.visible=false;
  }else if(activeWorld==='candy'){
    // Candy — Day=bright pastel paradise, Night=glow-in-the-dark wonderland
    if(isDark){
      scene.background=makeSkyTex('#1a0028','#280038');scene.fog.density=.0010;
      sunLight.intensity=.10;ambientLight.intensity=.26;hemiLight.intensity=.18;
      trackLightList.forEach(l=>l.intensity=2.2);trackPoles.forEach(p=>p.visible=true);
      _candyNightEmissives.forEach(m=>{ if(m.material){m.material.emissiveIntensity=1.8;} });
      _candyCandles.forEach(l=>l.intensity=2.2);
      if(plHeadL){plHeadL.intensity=2.4;plHeadR.intensity=2.4;}
      if(plTail)plTail.intensity=1.6;
      _aiHeadPool.forEach(l=>l.intensity=1.5);
    }else{
      scene.background=makeSkyTex('#ff88cc','#ffe4f0');scene.fog.density=.0019;
      sunLight.intensity=1.5;ambientLight.intensity=.65;hemiLight.intensity=.45;
      trackLightList.forEach(l=>l.intensity=0);trackPoles.forEach(p=>p.visible=false);
      _candyNightEmissives.forEach(m=>{ if(m.material){m.material.emissiveIntensity=.25;} });
      _candyCandles.forEach(l=>l.intensity=1.0);
      if(plHeadL){plHeadL.intensity=0;plHeadR.intensity=0;}
      if(plTail)plTail.intensity=0;
      _aiHeadPool.forEach(l=>l.intensity=0);
    }
    if(_sunBillboard)_sunBillboard.visible=!isDark;
  }else if(activeWorld==='space'){
    // Space is always dark — toggle only affects ambient brightness ("solar flare day" vs "deep night")
    if(isDark){
      scene.background=makeSkyTex('#000005','#010018');scene.fog.density=.0006;
      sunLight.intensity=.08;ambientLight.intensity=.22;hemiLight.intensity=.16;
    }else{
      scene.background=makeSkyTex('#040025','#080045');scene.fog.density=.0014;
      sunLight.intensity=.10;ambientLight.intensity=.28;hemiLight.intensity=.18;
    }
    if(stars)stars.visible=true; // always on in space
    trackLightList.forEach(l=>l.intensity=isDark?2.0:1.4);
    trackPoles.forEach(p=>p.visible=true);
    if(plHeadL){plHeadL.intensity=2.6;plHeadR.intensity=2.6;}
    if(plTail)plTail.intensity=1.8;
    _aiHeadPool.forEach(l=>l.intensity=1.7);
  }else{
    if(isDark){
      scene.background=makeSkyTex('#010408','#030d1e');scene.fog.density=.0024;
      sunLight.intensity=.10;ambientLight.intensity=.20;hemiLight.intensity=.14;
      trackLightList.forEach(l=>l.intensity=2.8);trackPoles.forEach(p=>p.visible=true);if(stars)stars.visible=true;
      if(plHeadL){plHeadL.intensity=2.6;plHeadR.intensity=2.6;}if(plTail)plTail.intensity=1.8;
      _aiHeadPool.forEach(l=>l.intensity=1.7);
    }else{
      scene.background=makeSkyTex('#1e5292','#b8d8ee');scene.fog.density=.0021;
      sunLight.intensity=1.65;ambientLight.intensity=.50;hemiLight.intensity=.36;
      trackLightList.forEach(l=>l.intensity=0);trackPoles.forEach(p=>p.visible=false);if(stars)stars.visible=false;
      if(plHeadL){plHeadL.intensity=0;plHeadR.intensity=0;}if(plTail)plTail.intensity=0;
      _aiHeadPool.forEach(l=>l.intensity=0);
    }
  }
  // Snap fog color instantly on non-race screens; during race updateSky lerps it
  if(gameState!=='RACE'&&gameState!=='FINISH'){
    _skyT=_skyTarget;
    scene.fog.color.lerpColors(_fogColorDay,_fogColorNight,_skyT);
  }
  // Cache per-world "no rain" fog density so updateWeather can layer rain on top
  // without resetting to GP-hardcoded values every frame.
  if(scene&&scene.fog)_fogBaseDensity=scene.fog.density;
  if(_sunBillboard)_sunBillboard.visible=!isDark&&!isRain&&activeWorld!=='space'&&activeWorld!=='deepsea';
  // Bloom intensifies bij night (lower threshold, higher strength) — neon
  // emissives gloeien dan dramatischer. Day = subtieler.
  if(typeof setBloomDayNight==='function')setBloomDayNight(isDark);
  const lbl=isDark?'☀ DAY':'🌙 NIGHT';
  const _tnb=document.getElementById('titleNightBtn');if(_tnb)_tnb.textContent=lbl;
  const _hnb=document.getElementById('hudNightBtn');if(_hnb)_hnb.textContent=lbl;
}


function updateCarLights(){
  // Reverse lights — always update regardless of night mode
  carObjs.forEach((car,i)=>{
    const rl=_reverseLights[i];if(!rl)return;
    const mat=rl.material;
    if(car.speed<-0.05){mat.emissiveIntensity=2.5;mat.opacity=1;}
    else{mat.emissiveIntensity=0;}
  });
  // Visible headlight beam-cones op player car (alleen bij night, alleen
  // chase-cam want in hood/bumper-cam zit de camera binnen de cone-tip
  // en zou de binnenkant een onaangename screen-wash geven).
  const pCar=carObjs[playerIdx];
  if(pCar&&pCar.mesh){
    const ratio=Math.abs(pCar.speed)/Math.max(.01,pCar.def.topSpd);
    const chaseCam=(typeof _camView==='undefined'||_camView===0);
    const beamOp=(isDark&&chaseCam)?(0.16+ratio*0.18):0;
    pCar.mesh.children.forEach(ch=>{
      if(ch.userData&&ch.userData.isHeadBeam&&ch.material){
        ch.material.opacity+=(beamOp-ch.material.opacity)*0.15; // smooth fade
      }
    });
  }
  if(!isDark||!plHeadL)return;
  const car=carObjs[playerIdx];if(!car)return;
  _plFwd.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
  _plRt.set(1,0,0).applyQuaternion(car.mesh.quaternion);
  _camV1.copy(car.mesh.position);_camV1.y+=.45; // reuse _camV1 as bH
  plHeadL.position.copy(_camV1).addScaledVector(_plRt,-.62).addScaledVector(_plFwd,-1.9);
  plHeadL.target.position.copy(plHeadL.position).addScaledVector(_plFwd,-12);plHeadL.target.updateMatrixWorld();
  plHeadR.position.copy(_camV1).addScaledVector(_plRt,.62).addScaledVector(_plFwd,-1.9);
  plHeadR.target.position.copy(plHeadR.position).addScaledVector(_plFwd,-12);plHeadR.target.updateMatrixWorld();
  plTail.position.copy(car.mesh.position).addScaledVector(_plFwd,1.9);plTail.position.y+=.42;
  // AI headlights: assign pool lights to nearest AI cars (no allocation)
  if(_aiHeadPool.length>0){
    let aiCount=0;
    for(let i=0;i<carObjs.length&&aiCount<_aiHeadPool.length;i++){
      if(i===playerIdx||carObjs[i].finished)continue;
      const ai=carObjs[i];
      _aiFwdRV.set(0,0,-1).applyQuaternion(ai.mesh.quaternion);
      _aiHeadPool[aiCount].position.copy(ai.mesh.position).addScaledVector(_aiFwdRV,-1.6);
      _aiHeadPool[aiCount].position.y+=.45;
      _aiHeadPool[aiCount].intensity=1.4;
      aiCount++;
    }
    for(let i=aiCount;i<_aiHeadPool.length;i++)_aiHeadPool[i].intensity=0;
  }
}


function updateAmbientWindSpeed(dt){
  if(!_ambientWindGain||!audioCtx)return;
  const car=carObjs[playerIdx];if(!car)return;
  const ratio=Math.abs(car.speed)/Math.max(car.def.topSpd,.01);
  const target=0.005+ratio*.065+(isRain?.018:0);
  const cur=_ambientWindGain.gain.value;
  // Smooth ramp — fast attack, slow release
  const rate=target>cur?8:2;
  _ambientWindGain.gain.value=cur+(target-cur)*Math.min(1,dt*rate);
}

