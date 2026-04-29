// js/worlds/neoncity-emp.js — lap-progressive EMP blackout in neon-city.
// Non-module script. Loads BEFORE worlds/neoncity.js so its build/update
// functions are visible when neoncity.js calls them.
//
// Lifecycle:
//   buildNeonCityEMP()                — called from buildNeonCityEnvironment()
//   updateNeonCityEMP(dt, currentLap) — called from updateNeonCityWorld(dt)
//   disposeNeonCityEMP()              — called from _resetRaceState()
//
// Layers a blackout effect on top of the existing EMP zones in neoncity.js
// (which already have a passive ring-pulse + collision slowdown). This module
// owns nothing geometric — it reads `_neonEmpZones`, `_neonEmissives` and
// `_holoBillboards` (declared in neoncity.js) and modulates their materials
// during a blackout window.
//
// Lap-progressive states (driven from currentLap argument, idempotent):
//   lap 1 → idle, no blackout (city looks like the existing baseline)
//   lap 2 → first time the player enters the .22 zone → ~1s local blackout
//           (neon emissives in radius go dark, brief music duck)
//   lap 3 → entry into .22 OR .52 zone → ~2s blackout + global skybox dim
//           (every neon emissive in scene fades to ~25% during the window)
//
// Audio: procedural zap on trigger via beep+_noise (audio/sfx.js style),
// optional music duck via _musicDuck. Music ducking guarded with
// dbg.warn('audio') if the global isn't there yet.

'use strict';

// Track-t for each EMP zone (must match the defs in buildNeonEMPZones).
const _NEON_EMP_T=[0.22,0.52,0.78];
const _NEON_EMP_LAP2_DURATION=1.0;  // seconds blackout on lap 2
const _NEON_EMP_LAP3_DURATION=2.0;  // seconds blackout on lap 3
const _NEON_EMP_TRIGGER_RADIUS_SQ=12*12; // distance from zone center to trigger
const _NEON_EMP_LOCAL_RADIUS_SQ=70*70;   // emissives within this dim on lap 2
const _NEON_EMP_DUCK_AMOUNT=0.35;        // music gain multiplier during blackout
// Strobe rate while blackout-active (Hz-ish — sin frequency rad/s).
const _NEON_EMP_STROBE_RATE=22;

let _neonEmpRuntime=null;

function buildNeonCityEMP(){
  if(typeof scene==='undefined'||!scene||typeof trackCurve==='undefined'||!trackCurve)return;
  // Idempotency guard.
  disposeNeonCityEMP();
  // Pre-resolve zone world positions once. These mirror the .22/.52/.78
  // points used by buildNeonEMPZones() in neoncity.js so the trigger geometry
  // stays in lockstep without us having to read _neonEmpZones at this stage
  // (it might be empty if neoncity-emp.js builds before the EMP zones land).
  const zoneCenters=_NEON_EMP_T.map(t=>{
    const p=trackCurve.getPoint(t);
    return {x:p.x,z:p.z};
  });
  _neonEmpRuntime={
    zones:zoneCenters,
    // One-shot trigger flags per (zone × lap-edge). These are reset whenever
    // currentLap drops below the threshold (race-restart safe).
    triggeredLap2:[false,false,false],
    triggeredLap3:[false,false,false],
    blackoutEnd:0,        // seconds (audio clock); >_nowSec means active
    blackoutStart:0,
    blackoutLap:0,        // 2 or 3, controls effect intensity
    blackoutZoneIdx:-1,   // which zone center to use for local-radius dim
    duckActive:false,
  };
}

function updateNeonCityEMP(dt,currentLap){
  if(!_neonEmpRuntime)return;
  const rt=_neonEmpRuntime;
  const t=(typeof _nowSec==='number')?_nowSec:0;
  // Lap-edge: clear one-shot trigger flags when lap drops back below the
  // threshold (race-restart edge case mirrors volcano-bridge's pattern).
  if(currentLap<2){
    for(let i=0;i<3;i++)rt.triggeredLap2[i]=false;
    // Cancel any in-flight blackout if the player rewinds out of lap 2/3
    // (ends the dim immediately, restores music duck below).
    if(rt.blackoutEnd>t)rt.blackoutEnd=t;
  }
  if(currentLap<3){for(let i=0;i<3;i++)rt.triggeredLap3[i]=false;}
  // Detect player entering an active zone.
  const car=(typeof carObjs!=='undefined'&&typeof playerIdx!=='undefined')?carObjs[playerIdx]:null;
  if(car&&car.mesh){
    const px=car.mesh.position.x,pz=car.mesh.position.z;
    // Lap 2 active zones: only zone 0 (.22). Lap 3: zones 0 and 1 (.22, .52).
    const maxActiveIdx=(currentLap>=3)?1:(currentLap>=2?0:-1);
    for(let i=0;i<=maxActiveIdx;i++){
      const z=rt.zones[i];
      const dx=px-z.x,dz=pz-z.z;
      if(dx*dx+dz*dz>_NEON_EMP_TRIGGER_RADIUS_SQ)continue;
      // Prefer lap-3 trigger if both edges fired same frame.
      if(currentLap>=3&&!rt.triggeredLap3[i]){
        rt.triggeredLap3[i]=true;
        _neonEmpStartBlackout(t,3,i);
      }else if(currentLap>=2&&currentLap<3&&!rt.triggeredLap2[i]){
        rt.triggeredLap2[i]=true;
        _neonEmpStartBlackout(t,2,i);
      }
    }
  }
  // Drive blackout effect if active.
  const active=t<rt.blackoutEnd;
  const elapsed=active?(t-rt.blackoutStart):0;
  const duration=(rt.blackoutLap===3)?_NEON_EMP_LAP3_DURATION:_NEON_EMP_LAP2_DURATION;
  // Decay envelope: 1.0 at start → 0 at end.
  const envel=active?Math.max(0,1-(elapsed/duration)):0;
  // Strobe multiplier: rapid black/light flicker, biased dark.
  const strobe=active?(0.5+0.5*Math.sign(Math.sin(t*_NEON_EMP_STROBE_RATE))):1;
  // Lap-2 = local dim only; Lap-3 = global dim. Apply to neon emissives.
  if(active&&typeof _neonEmissives!=='undefined'&&_neonEmissives){
    const isGlobal=(rt.blackoutLap>=3);
    const zone=rt.zones[rt.blackoutZoneIdx]||rt.zones[0];
    for(let i=0;i<_neonEmissives.length;i++){
      const item=_neonEmissives[i];
      if(!item||!item.mesh||!item.mesh.material)continue;
      let inRange=isGlobal;
      if(!inRange){
        const mp=item.mesh.position;
        const dx=mp.x-zone.x,dz=mp.z-zone.z;
        inRange=(dx*dx+dz*dz<_NEON_EMP_LOCAL_RADIUS_SQ);
      }
      if(!inRange)continue;
      // Multiply existing emissive (which neoncity.js sets every frame)
      // by the strobe×envelope mask. Order matters: this loop runs AFTER
      // updateNeonCityWorld() because index.html loads neoncity-emp.js
      // BEFORE neoncity.js — but the host's update is the one that calls
      // us last, see neoncity.js:updateNeonCityWorld bottom.
      const cur=item.mesh.material.emissiveIntensity;
      const dimAmount=isGlobal?0.75:0.85;
      item.mesh.material.emissiveIntensity=cur*(1-envel*dimAmount*(1-strobe*0.5));
    }
  }
  // Holo billboards drop opacity hard during blackout.
  if(active&&typeof _holoBillboards!=='undefined'&&_holoBillboards){
    const isGlobal=(rt.blackoutLap>=3);
    const zone=rt.zones[rt.blackoutZoneIdx]||rt.zones[0];
    for(let i=0;i<_holoBillboards.length;i++){
      const bb=_holoBillboards[i];
      if(!bb||!bb.mesh||!bb.mesh.material)continue;
      let inRange=isGlobal;
      if(!inRange){
        const mp=bb.mesh.position;
        const dx=mp.x-zone.x,dz=mp.z-zone.z;
        inRange=(dx*dx+dz*dz<_NEON_EMP_LOCAL_RADIUS_SQ);
      }
      if(!inRange)continue;
      bb.mesh.material.opacity*=Math.max(0.05,1-envel*0.9*strobe);
    }
  }
  // Music duck: snap down on entry, restore on exit.
  if(active&&!rt.duckActive){
    rt.duckActive=true;
    if(typeof _musicDuck!=='undefined'&&typeof _applyMusicGain==='function'){
      _musicDuck=_NEON_EMP_DUCK_AMOUNT;_applyMusicGain(0);
    }
  }else if(!active&&rt.duckActive){
    rt.duckActive=false;
    if(typeof _musicDuck!=='undefined'&&typeof _applyMusicGain==='function'){
      _musicDuck=1.0;_applyMusicGain(0);
    }
  }
}

function _neonEmpStartBlackout(t,lap,zoneIdx){
  const rt=_neonEmpRuntime;
  if(!rt)return;
  rt.blackoutStart=t;
  rt.blackoutEnd=t+((lap>=3)?_NEON_EMP_LAP3_DURATION:_NEON_EMP_LAP2_DURATION);
  rt.blackoutLap=lap;
  rt.blackoutZoneIdx=zoneIdx;
  // Procedural zap SFX — short ascending blip + filtered noise burst.
  // Mirrors the audio/sfx.js pattern (beep + _noise) without introducing
  // a new sample-slot.
  if(typeof beep==='function'&&typeof _noise==='function'){
    beep(880,.05,.18,0,'square');
    beep(220,.08,.22,.04,'sawtooth');
    _noise(.18,1800,3.5,.18);
  }
  // Camera-shake nudge so the blackout has weight without overriding a
  // stronger active shake (e.g. from a nearby collision).
  if(typeof camShake!=='undefined'){
    const amt=(lap>=3)?0.7:0.4;
    if(camShake<amt)camShake=amt;
  }
  if(window.dbg)dbg.log('env','neon-emp blackout lap='+lap+' zone='+zoneIdx);
}

function disposeNeonCityEMP(){
  // No geometry owned by this module — only restore music duck if active.
  if(_neonEmpRuntime&&_neonEmpRuntime.duckActive){
    if(typeof _musicDuck!=='undefined'&&typeof _applyMusicGain==='function'){
      _musicDuck=1.0;_applyMusicGain(0);
    }
  }
  _neonEmpRuntime=null;
}
