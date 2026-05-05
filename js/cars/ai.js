// js/cars/ai.js — non-module script.

'use strict';

// Pre-allocated scratch vectors (uit main.js verhuisd) — vermijden GC-druk
// in de hot loop. Cross-script zichtbaar voor effects/night.js + visuals.js.
const _aiFwd=new THREE.Vector3(),_aiToT=new THREE.Vector3(),_aiCross=new THREE.Vector3();
const _aiTg=new THREE.Vector3(),_aiNr=new THREE.Vector3();
const _aiCurA=new THREE.Vector3(),_aiCurB=new THREE.Vector3();
const _aiBase=new THREE.Vector3();
const _aiFwdRV=new THREE.Vector3();

// AI runtime data (uit main.js verhuisd).
//   _aiPersonality    — per car-id: aggr (0..1), consist (0..1), name.
//                       Gebruikt in cars/build.js makeAllCars().
//   _aiHeadPool       — pool van 4 PointLights gedeeld door AI cars
//                       (effects/night.js update). Gevuld in core/scene.js.
//   _reverseLights    — per car-index reverse-light mesh refs (visibility
//                       in effects/night.js bij brake). Gevuld in cars/build.js.
//   _nearMissCooldown — 3s-cooldown counter voor NEAR MISS bonus per car-index
//                       (cars/physics.js triggert bij dist 2.5..4.5m).
const _aiPersonality=[
  {aggr:0.6,consist:0.8,name:'Aggressive'}, // Bugatti
  {aggr:0.9,consist:0.6,name:'Wild'},       // Lamborghini
  {aggr:0.4,consist:0.9,name:'Consistent'}, // Maserati
  {aggr:0.7,consist:0.7,name:'Balanced'},   // Ferrari
  {aggr:1.0,consist:0.5,name:'Champion'},   // RB F1
  {aggr:0.8,consist:0.5,name:'Muscle'},     // Mustang
  {aggr:0.3,consist:0.95,name:'Precise'},   // Tesla
  {aggr:0.5,consist:0.85,name:'Steady'},    // Audi
  {aggr:0.7,consist:0.85,name:'Precise'},   // 8 Porsche
  {aggr:0.85,consist:0.7,name:'Explosive'}, // 9 McLaren
  {aggr:0.95,consist:0.6,name:'Dominant'},  // 10 Mercedes F1
  {aggr:0.8,consist:0.75,name:'Hyperfast'}, // 11 Koenigsegg
];
const _aiHeadPool=[];
const _reverseLights=[];
const _nearMissCooldown=[];

function updateAI(car,dt){
  if(car.finished)return;
  const player=carObjs[playerIdx];
  const pers=car._personality||{aggr:.6,consist:.7};
  let spdMult=1;
  if(player){
    // gap = how far ahead player is (positive = player ahead)
    let _pProg=player.progress,_aiProg=car.progress;
    if(_aiProg>.85&&_pProg<.15)_pProg+=1.0;
    if(_pProg>.85&&_aiProg<.15)_aiProg+=1.0;
    const gap=(player.lap-car.lap)+(_pProg-_aiProg);
    // Rubber band scaled by aggression: aggressive AIs catch up harder
    const rbStr=0.9+pers.aggr*.28;
    if(gap>1.5)spdMult=rbStr;
    else if(gap>.5)spdMult=.97+pers.aggr*.12;
    else if(gap<-1.5)spdMult=.84+(1-pers.aggr)*.08;
    else if(gap<-.5)spdMult=.93+(1-pers.aggr)*.06;
    // Consistent drivers don't fall as far behind
    if(gap<0)spdMult=Math.max(spdMult,1-(.08*(1-pers.consist)));
    const diffRbCap=[0.85,1.05,1.22][difficulty]||1.05;
    spdMult=Math.min(spdMult,diffRbCap);
  }
  const la=.018,tProg=(car.progress+la)%1;
  // Use pre-allocated vectors — zero heap allocs per AI car per frame
  trackCurve.getPoint(tProg,_aiBase);
  if(car.lateralOff){
    trackCurve.getTangent(tProg,_aiTg);_aiTg.normalize();
    _aiNr.set(-_aiTg.z,0,_aiTg.x);
    _aiBase.addScaledVector(_aiNr,car.lateralOff);
  }
  _aiFwd.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
  _aiToT.set(_aiBase.x-car.mesh.position.x,0,_aiBase.z-car.mesh.position.z).normalize();
  _aiCross.copy(_aiFwd).cross(_aiToT);
  car.mesh.rotation.y+=_aiCross.y*car.def.hdlg*1.78*dt*60;
  // AI car body tilt — lean into corners based on yaw rate
  car._prevRotY??=car.mesh.rotation.y;
  const _aiYawD=car.mesh.rotation.y-car._prevRotY;
  car._prevRotY=car.mesh.rotation.y;
  const _aiSpeedF=Math.min(1,car.speed/(car.def.topSpd*.8));
  const _aiTgtZ=Math.max(-.16,Math.min(.16,-_aiYawD/Math.max(dt,.008)*(.32+_aiSpeedF*.14)));
  car.mesh.rotation.z+=(_aiTgtZ-car.mesh.rotation.z)*Math.min(1,dt*6);
  trackCurve.getTangent(car.progress,_aiCurA);
  trackCurve.getTangent((car.progress+.04)%1,_aiCurB);
  const curv=Math.max(0,1-_aiCurA.dot(_aiCurB));
  const tspd=car.def.topSpd*spdMult*DIFF_MULT[difficulty]*Math.max(.38,1-curv*8.5)*(car.boostTimer>0?1.4:1);
  if(car.speed<tspd)car.speed=Math.min(tspd,car.speed+car.def.accel*dt*60);
  else car.speed=Math.max(tspd,car.speed-car.def.accel*2*dt*60);
  // Mild random speed variation per car for natural feel
  car.speed*=1+Math.sin(Date.now()*.0009+car.def.id*2.3)*.018;
  // Occasional mistake — frequency inversely proportional to consistency
  car._mtimer=(car._mtimer||0)-dt;
  const mistakeChance=0.08+(1-pers.consist)*.3;
  if(car._mtimer<=0){car._mtimer=6+pers.consist*12+Math.random()*10;car._mActive=curv>.012&&Math.random()<mistakeChance?(.25+Math.random()*.5):0;}
  if((car._mActive||0)>0){car._mActive-=dt;car.mesh.rotation.y+=(Math.random()-.5)*.04*(1+pers.aggr*.5);car.speed*=.991;}
  // AI jump handling (proper per-car physics)
  if(car.inAir){
    car.vy-=22*dt;
    car.mesh.position.y+=car.vy*dt;
    if(car.mesh.position.y<=.35&&car.vy<0){
      car.mesh.position.y=.35;car.vy=0;car.inAir=false;
    }
  }else{
    car.mesh.position.y=.35;
    if(car._rampCooldown>0)car._rampCooldown-=dt;
    // AI launchpad trigger — same flat-pad logic as player
    else {
      const _aiFwdR=_aiFwdRV.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
      jumpRamps.forEach(ramp=>{
        if(car._rampCooldown>0)return;
        const dx=car.mesh.position.x-ramp.pos.x,dz=car.mesh.position.z-ramp.pos.z;
        const along=dx*ramp.tg.x+dz*ramp.tg.z;
        const perp=Math.abs(-dx*ramp.tg.z+dz*ramp.tg.x);
        const halfLen=ramp.len*.5;
        if(perp<ramp.width*.5&&along>-halfLen&&along<halfLen){
          const mDot=(_aiFwdR.x*ramp.tg.x+_aiFwdR.z*ramp.tg.z)*(car.speed>=0?1:-1);
          if(mDot>.1&&Math.abs(car.speed)>.25){
            car.vy=Math.abs(car.speed)*10+ramp.launchV*1.2+5;
            car.inAir=true;car._rampCooldown=1.2;
          }
        }
      });
    }
  }
  // AI overtaking: if player is just ahead on track, try to go around
  const player2=carObjs[playerIdx];
  if(player2&&!car.finished&&pers.aggr>.5){
    const pdx=car.mesh.position.x-player2.mesh.position.x,pdz=car.mesh.position.z-player2.mesh.position.z;
    const pDist=Math.sqrt(pdx*pdx+pdz*pdz);
    const sameLap=Math.abs(car.lap-player2.lap)<1;
    // No lateral maneuvers during race start grace — cars drive straight ahead
    if(_raceStartGrace<=0){
      if(pDist<7&&sameLap&&car.speed>player2.speed*.98){
        // Decide which side to pass on (perpendicular to own forward)
        if(!car._passAttemptTimer||car._passAttemptTimer<=0){
          const crossVal=_aiFwd.x*pdz-_aiFwd.z*pdx;
          car._passSide=(crossVal>0?1:-1)*(pers.aggr>.8?1.6:1.0);
          car._passAttemptTimer=3.5+Math.random()*2;
        }
      }
      if((car._passAttemptTimer||0)>0){
        car._passAttemptTimer-=dt;
        const targetOff=car.lateralOff+(car._passSide||0)*5.5;
        car.lateralOff+=(targetOff-car.lateralOff)*Math.min(1,dt*1.2);
      } else if(pDist>12){
        car.lateralOff*=Math.pow(.92,dt*60);
      }
    } else {
      // During start grace: reset any pending pass attempts
      car._passAttemptTimer=0;
    }
  }
  _aiFwd.set(0,0,-1).applyQuaternion(car.mesh.quaternion); // recompute after rotation
  car.mesh.position.addScaledVector(_aiFwd,car.speed);
  // Sandstorm wind-pull: AI cars get 70% of the player's lateral drift so
  // they stay competitive without all flying off-track on lap 3. Scales
  // with speed; gated by activeWorld for defense-in-depth (matches
  // physics.js). Reuses _aiFwdRV scratch as the right-vector to avoid
  // per-frame Vector3 allocs.
  if(window._sandstormWindPull&&activeWorld==='sandstorm'){
    const _aiRt=_aiFwdRV.set(1,0,0).applyQuaternion(car.mesh.quaternion);
    const _spdR=Math.min(1,Math.abs(car.speed)/Math.max(0.001,car.def.topSpd));
    car.mesh.position.addScaledVector(_aiRt, window._sandstormWindPull*0.7*dt*_spdR);
  }
  if(car.boostTimer>0)car.boostTimer-=dt;
  spinWheels(car);tickProgress(car);
}

