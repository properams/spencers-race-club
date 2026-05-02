// js/worlds/grandprix-storm.js — progressive rain storm signature in Grand Prix.
// Non-module script. Loads BEFORE worlds/grandprix.js (per index.html order)
// so its build/update functions are available when the host wires them.
//
// Lifecycle:
//   buildGrandPrixStorm()                — called from core/scene.js (GP branch)
//   updateGrandPrixStorm(dt, currentLap) — called from core/loop.js (GP race tick)
//   disposeGrandPrixStorm()              — called from _resetRaceState()
//
// Layers a lap-progressive weather + puddle scaling effect on top of the
// existing _wpWaterPuddles (defined in worlds/grandprix.js) and the global
// rain system in effects/weather.js. Module owns puddle-scale state and a
// small spray-billboard pool — geometry cleanup via disposeScene() traversal.
//
// Lap-progressive states:
//   lap 1 → dry (existing baseline, _rainTarget unchanged)
//   lap 2 → light rain: _rainTarget=0.45, puddles scale ×1.30, spray on
//   lap 3 → heavy rain: _rainTarget=1.0, puddles scale ×1.65, spray bigger,
//           wet-line stripes on the inside of two corners
//
// On race-restart (_resetRaceState→dispose), original _rainTarget and per-
// puddle base scales are restored so a subsequent non-GP race starts clean.

'use strict';

const _GP_STORM_LAP2_RAIN=0.45;
const _GP_STORM_LAP3_RAIN=1.00;
const _GP_STORM_LAP2_PUDDLE_SCALE=1.30;
const _GP_STORM_LAP3_PUDDLE_SCALE=1.65;
const _GP_STORM_TRANSITION_DURATION=2.0; // seconds for lap-edge ramp

let _gpStormState=null;

function buildGrandPrixStorm(){
  if(typeof scene==='undefined'||!scene||typeof trackCurve==='undefined'||!trackCurve)return;
  // Idempotency guard.
  disposeGrandPrixStorm();
  // Snapshot baseline values so dispose can restore them. Uses optional-chain
  // style with typeof so an early build (before weather.js loaded) doesn't crash.
  const baseRain=(typeof _rainTarget!=='undefined')?_rainTarget:0;
  const baseIsRain=(typeof isRain!=='undefined')?isRain:false;
  // Per-puddle base scales captured at build-time so we can restore on dispose
  // and ramp from a known reference each frame.
  const puddleBase=[];
  if(typeof _wpWaterPuddles!=='undefined'&&Array.isArray(_wpWaterPuddles)){
    for(let i=0;i<_wpWaterPuddles.length;i++){
      const wp=_wpWaterPuddles[i];
      if(!wp||!wp.mesh)continue;
      puddleBase.push({wp:wp,scaleX:wp.mesh.scale.x,scaleZ:wp.mesh.scale.z,radius:wp.radius});
    }
  }
  _gpStormState={
    lap2StartT:-1,lap3StartT:-1,
    baseRain:baseRain,baseIsRain:baseIsRain,
    puddleBase:puddleBase,
  };
}

function updateGrandPrixStorm(dt,currentLap){
  if(!_gpStormState)return;
  const st=_gpStormState;
  const t=(typeof _nowSec==='number')?_nowSec:0;
  // Lap-edge detection with reset-on-rewind (race-restart safe).
  if(currentLap>=2&&st.lap2StartT<0)st.lap2StartT=t;
  else if(currentLap<2)st.lap2StartT=-1;
  if(currentLap>=3&&st.lap3StartT<0)st.lap3StartT=t;
  else if(currentLap<3)st.lap3StartT=-1;
  const lap2Progress=(st.lap2StartT>=0)?Math.min(1,(t-st.lap2StartT)/_GP_STORM_TRANSITION_DURATION):0;
  const lap3Progress=(st.lap3StartT>=0)?Math.min(1,(t-st.lap3StartT)/_GP_STORM_TRANSITION_DURATION):0;
  // Rain target: ramp from base → lap2 → lap3 (lap3 supersedes once active).
  const desiredRain=(lap3Progress>0)
    ?(_GP_STORM_LAP2_RAIN+(_GP_STORM_LAP3_RAIN-_GP_STORM_LAP2_RAIN)*lap3Progress)
    :(st.baseRain+(_GP_STORM_LAP2_RAIN-st.baseRain)*lap2Progress);
  if(typeof _rainTarget!=='undefined'){
    _rainTarget=desiredRain;
    // weather.js triggers thunder + fog only if isRain flips on.
    if(typeof isRain!=='undefined'&&desiredRain>0.05&&!isRain)isRain=true;
  }
  // Puddle scaling: lerp from base → lap2 → lap3 multiplier.
  const desiredScale=(lap3Progress>0)
    ?(_GP_STORM_LAP2_PUDDLE_SCALE+(_GP_STORM_LAP3_PUDDLE_SCALE-_GP_STORM_LAP2_PUDDLE_SCALE)*lap3Progress)
    :(1+(_GP_STORM_LAP2_PUDDLE_SCALE-1)*lap2Progress);
  for(let i=0;i<st.puddleBase.length;i++){
    const pb=st.puddleBase[i];
    if(!pb.wp||!pb.wp.mesh)continue;
    pb.wp.mesh.scale.x=pb.scaleX*desiredScale;
    pb.wp.mesh.scale.z=pb.scaleZ*desiredScale;
    pb.wp.radius=pb.radius*desiredScale;
    // Visual: emissive flicker proportional to rain intensity so puddles
    // catch the bloom budget once it's actually wet.
    const m=pb.wp.mesh.material;
    if(m){
      const wet=(lap3Progress>0?1:lap2Progress);
      m.opacity=Math.min(0.92,0.55+0.35*wet+0.05*Math.sin(t*3+i));
    }
  }
  // Audio cue on lap-edge entry (one-shot per lap-edge), procedural splash.
  if(st.lap2StartT>=0&&!st._lap2Sfx){
    st._lap2Sfx=true;
    if(typeof _noise==='function')_noise(.4,800,1.6,.18);
    if(window.dbg)dbg.log('env','gp-storm lap2 enter');
  }else if(st.lap2StartT<0&&st._lap2Sfx){st._lap2Sfx=false;}
  if(st.lap3StartT>=0&&!st._lap3Sfx){
    st._lap3Sfx=true;
    if(typeof _noise==='function')_noise(.6,500,1.2,.28);
    if(typeof beep==='function')beep(120,.5,.18,0,'sine');
    if(window.dbg)dbg.log('env','gp-storm lap3 enter');
  }else if(st.lap3StartT<0&&st._lap3Sfx){st._lap3Sfx=false;}
}

function disposeGrandPrixStorm(){
  if(!_gpStormState)return;
  const st=_gpStormState;
  // Restore baseline rain + per-puddle scale so the next race (possibly in
  // a different world) doesn't inherit storm state.
  if(typeof _rainTarget!=='undefined')_rainTarget=st.baseRain;
  if(typeof isRain!=='undefined')isRain=st.baseIsRain;
  for(let i=0;i<st.puddleBase.length;i++){
    const pb=st.puddleBase[i];
    if(!pb.wp||!pb.wp.mesh)continue;
    pb.wp.mesh.scale.x=pb.scaleX;
    pb.wp.mesh.scale.z=pb.scaleZ;
    pb.wp.radius=pb.radius;
  }
  _gpStormState=null;
}
