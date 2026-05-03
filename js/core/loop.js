// js/core/loop.js — hoofdanimatieloop, FPS/quality tracking, mirror render pass.
// Non-module script, geladen na scene.js en vóór main.js.
//
// Afhankelijkheden (script-globals, merendeel in main.js):
//   clock, renderer, scene, camera
//   _ctxLost, gamePaused, gameState, _nowSec
//   trackCurve, _titleCamT
//   carObjs, playerIdx
//   activeWorld, _floatSlotTimer, _floatSlot
//   sparkSystem, exhaustSystem
//   _mirrorEnabled, _camView, _victoryOrbit, _introPanTimer
//
// Externe functies (track/cars/effects/gameplay/worlds/ui modules + Audio facade):
//   updatePlayer, updateAI, checkJumps, checkSpinPads, checkBoostPads,
//   checkCollectibles, checkCollisions, checkTrackLimits, checkWrongWay,
//   checkSpaceRailgun, checkGravityZones,
//   checkOrbitingAsteroids, checkWarpTunnels, checkCurrentStreams,
//   checkAbyssCracks, checkTreasureTrail, checkWaterPuddles, checkDRSZone,
//   updateBoostArrows, updateSlipstreamVisuals, updateSafetyCar,
//   updateCamera, updateCarLights, updateBoostGlow, updateFlags,
//   updateSkidMarks, updateWeather, updateSky, updateSnow, updateStormFlash,
//   updateSpaceWorld, updateDeepSeaWorld, updateCandyWorld,
//   updateNeonCityWorld, updateVolcanoWorld, updateArcticWorld,
//   updateThemeparkWorld, updateHUD, updateSpeedOverlay, getPositions,
//   updateAmbientWindSpeed, updateAchievements,
//   updateWeatherForecast, updateQuickRestart, updateDamageSmoke,
//   updateRpmBar, updateRevLimiter, updateDriftVisuals,
//   updateNitroVisual, updateBoostTrail, updateGhost, updateSpeedLines,
//   updatePitStop, updateFastestLapFlash, updateCloseBattle,
//   updateCollisionFlash, updateRain, updateMirror,
//   Audio.updateThunder, Audio.updateCrowd.

'use strict';

// Performance counter (uit main.js verhuisd) — geset elke frame in loop(),
// gelezen door alle modules die "huidige tijd in seconden" nodig hebben.
let _nowSec=0;

// Page-visibility pause: skip de hele loop body als de tab achtergrond is.
// Op iOS draait rAF op trage tabs door en blijft alle update/render werk
// kosten — dit drains battery en triggert iOS' "high-CPU when backgrounded"
// kill-policy. Met deze vlag pauzeert de loop volledig (geen update, geen
// render, geen audio-scheduling drain). De clock.getDelta() consume voorkomt
// een grote dt-spike op resume die physics + AI uit balans gooit.
// audioCtx + scheduler suspend wordt al gedaan in core/renderer.js:40.
let _pageHidden=(typeof document!=='undefined'&&document.hidden===true);
if(typeof document!=='undefined'){
  document.addEventListener('visibilitychange',()=>{
    _pageHidden=document.hidden;
    if(window.dbg)dbg.log('loop','visibility '+(document.hidden?'hidden':'visible'));
    // Reset clock at resume so the first dt isn't the elapsed background time.
    if(!_pageHidden&&typeof clock!=='undefined'&&clock&&clock.getDelta)clock.getDelta();
  });
}

let _aiFrameCounter=0,_fpsShow=false,_fpsFrames=0,_fpsLast=performance.now(),_fpsVal=60;
let _perfBadFrames=0,_perfChecked=false,_lowQuality=!!window._isMobile;
// First-frame-after-GO tracker — used to attribute the initial shader-compile
// /texture-upload spike to a measurable window. Reset by navigation.js when
// gameState transitions COUNTDOWN→RACE.
let _firstRaceFrameLogged=false;
window._resetFirstRaceFrameMarker=()=>{_firstRaceFrameLogged=false;};
// Auto-quality detection thresholds: during frames [START..END], count frames slower than BAD_MS.
// If the count exceeds BAD_THRESHOLD within that window, downgrade to low quality.
const QUALITY_CHECK_FRAME_START=30,QUALITY_CHECK_FRAME_END=180;
const QUALITY_BAD_FRAME_MS=0.032,QUALITY_BAD_FRAME_THRESHOLD=60;

function loop(){
  requestAnimationFrame(loop);
  if(_ctxLost){clock.getDelta();return;} // context lost — skip frame, consume delta
  if(_pageHidden){clock.getDelta();return;} // tab in background — full skip, iOS battery + tab-kill protection
  if(gamePaused){clock.getDelta();return;} // consume delta so time doesn't jump on resume
  _nowSec=performance.now()/1000;
  // dt scaling: tablets get a 0.93× world-time multiplier so the race feels slightly calmer on iPad
  // without changing physics balance (player + AI + decor all slow down together).
  const dt=Math.min(clock.getDelta(),window._isMobile?.085:.05)*(window._isTablet?0.93:1);
  _aiFrameCounter++;
  // Animated title camera — fly along track
  if(gameState==='TITLE'&&trackCurve){
    _titleCamT+=dt*.016;
    const t=_titleCamT%1,t2=(_titleCamT+.055)%1;
    const pt=trackCurve.getPoint(t),ah=trackCurve.getPoint(t2);
    camera.position.set(pt.x,pt.y+7.5,pt.z);
    camera.lookAt(ah.x,ah.y+1.8,ah.z);
    camera.fov+=(64-camera.fov)*Math.min(1,dt*1.5);camera.updateProjectionMatrix();
  }
  if(gameState==='RACE'||gameState==='FINISH'){
    for(let i=0;i<carObjs.length;i++){
      const car=carObjs[i];
      if(i===playerIdx){if(gameState==='RACE')updatePlayer(dt);else if(gameState==='FINISH'&&Math.abs(car.speed)>.01)car.speed*=Math.pow(0.97,dt*60);}
      else{
        // Stagger AI: on mobile update each AI every 2nd frame (halves AI cost)
        if(!window._isMobile||(_aiFrameCounter+i)%2===0) updateAI(car,dt*(!window._isMobile?1:2));
      }
    }
    if(gameState==='RACE'){
      checkJumps();checkSpinPads(dt);checkBoostPads();checkCollectibles();checkCollisions(dt);checkTrackLimits(dt);checkWrongWay(dt);
      if(typeof checkPropCollisions==='function')checkPropCollisions(dt);
      if(activeWorld==='space'){checkSpaceRailgun();checkGravityZones(dt);checkOrbitingAsteroids(dt);checkWarpTunnels(dt);}
      else if(activeWorld==='deepsea'){checkCurrentStreams(dt);checkAbyssCracks(dt);checkTreasureTrail(dt);}
      else{
        checkWaterPuddles(dt);checkDRSZone(dt);
        if(activeWorld==='grandprix'&&typeof updateGrandPrixStorm==='function'){
          const _pl=carObjs[playerIdx];updateGrandPrixStorm(dt,_pl?_pl.lap:1);
        }
      }
      updateBoostArrows();updateSlipstreamVisuals();updateSafetyCar(dt);
    }
    sparkSystem.update(dt);exhaustSystem.update(dt);
    updateCamera(dt);updateCarLights();updateBoostGlow();updateFlags();
    updateSkidMarks();updateWeather(dt);updateSky(dt);Audio.updateThunder(dt);updateSnow(dt);updateStormFlash(dt);
    if(activeWorld==='space')updateSpaceWorld(dt);
    if(activeWorld==='deepsea')updateDeepSeaWorld(dt);
    if(activeWorld==='candy')updateCandyWorld(dt);
    if(activeWorld==='neoncity'&&typeof updateNeonCityWorld==='function')updateNeonCityWorld(dt);
    if(activeWorld==='volcano')updateVolcanoWorld(dt);
    if(activeWorld==='arctic')updateArcticWorld(dt);
    if(activeWorld==='themepark')updateThemeparkWorld(dt);
    if(gameState==='RACE'){
      updateHUD(dt);updateSpeedOverlay();
      const _pp=getPositions().findIndex(c=>c.isPlayer)+1;
      Audio.updateCrowd(_pp);
      // Dynamische muziek-intensity: positie + speed + combo bepalen
      // continu de mid/lead-balans op de actieve scheduler.
      const _pcar=carObjs[playerIdx];
      const _spdR=_pcar?Math.min(1,Math.abs(_pcar.speed)/(_pcar.def.topSpd||1.8)):0;
      Audio.updateMusicIntensity(_pp,_spdR,(typeof _comboTimer!=='undefined'&&_comboTimer>0));
      updateAmbientWindSpeed(dt);
      updateAchievements(dt);
      if(_floatSlotTimer>0){_floatSlotTimer-=dt;if(_floatSlotTimer<=0)_floatSlot=0;}
      updateWeatherForecast(dt);
      updateQuickRestart(dt);
      updateDamageSmoke();
      updateRpmBar(dt);
      updateRevLimiter(dt);
      updateDriftVisuals(dt);
      updateNitroVisual();
      updateBoostTrail();
      updateGhost(dt);
      updateSpeedLines();
      updatePitStop(dt);
      updateFastestLapFlash(dt);
      updateCloseBattle(dt);
    }
    updateCollisionFlash(dt);
    updateRain();
  }
  if(renderer&&scene&&camera){
    // Perf Phase A: meet GO→eerste race-frame los van dbg (zodat headless
    // run het ook zonder ?debug ziet). Ook shader-count snapshot @ first frame.
    const _isFirstRaceFrame = (window._waitingForFirstRaceFrame&&gameState==='RACE');
    if(_isFirstRaceFrame){
      if(window.perfMark){perfMark('go:firstFrame');perfMeasure('go.toFirstFrame','go:fired','go:firstFrame');}
      window._waitingForFirstRaceFrame=false;
      if(window.perfLog){
        const _pa=(renderer.info.programs&&renderer.info.programs.length)||0;
        window.perfLog.push({name:'shaderPrograms.atFirstFrame',ms:_pa,t:performance.now(),world:window.activeWorld});
      }
    }
    // First-frame-after-GO measure: catches shader compile / texture upload
    // spike on the first race render with this world's full material set.
    if(window.dbg&&!_firstRaceFrameLogged&&gameState==='RACE'){
      _firstRaceFrameLogged=true;
      const _progBefore=(renderer.info.programs&&renderer.info.programs.length)||0;
      const _texBefore=renderer.info.memory.textures;
      if(window.perfMark)perfMark('firstRaceFrame:render:start');
      dbg.measure('perf','firstRaceFrame.render',()=>{
        if(typeof renderWithPostFX==='function')renderWithPostFX(scene,camera);
        else renderer.render(scene,camera);
      });
      if(window.perfMark){perfMark('firstRaceFrame:render:end');perfMeasure('firstRaceFrame.render','firstRaceFrame:render:start','firstRaceFrame:render:end');}
      const _progAfter=(renderer.info.programs&&renderer.info.programs.length)||0;
      const _texAfter=renderer.info.memory.textures;
      dbg.markRaceEvent('FIRST-RACE-FRAME',{
        progDelta:_progAfter-_progBefore,
        texDelta:_texAfter-_texBefore,
        progAfter:_progAfter,
        texAfter:_texAfter
      });
    }else if(_isFirstRaceFrame){
      // Same measurement, dbg-disabled pad: blijft handig voor de runner.
      if(window.perfMark)perfMark('firstRaceFrame:render:start');
      if(typeof renderWithPostFX==='function')renderWithPostFX(scene,camera);
      else renderer.render(scene,camera);
      if(window.perfMark){perfMark('firstRaceFrame:render:end');perfMeasure('firstRaceFrame.render','firstRaceFrame:render:start','firstRaceFrame:render:end');}
    }else{
      if(typeof renderWithPostFX==='function')renderWithPostFX(scene,camera);
      else renderer.render(scene,camera);
    }
  }
  // Mirror pass — second render with backward-facing camera (chase cam + race only, not during victory orbit or intro)
  if(gameState==='RACE'&&_mirrorEnabled&&_camView===0&&!_victoryOrbit&&_introPanTimer<=0){
    // Skip mirror on low quality to save a full render pass
    if(!_lowQuality)updateMirror();
  }
  // Auto quality detection — see QUALITY_* constants above for thresholds
  if(!_perfChecked&&gameState==='RACE'&&_aiFrameCounter>QUALITY_CHECK_FRAME_START&&_aiFrameCounter<QUALITY_CHECK_FRAME_END){
    if(dt>QUALITY_BAD_FRAME_MS)_perfBadFrames++;
    if(_aiFrameCounter===QUALITY_CHECK_FRAME_END-1){
      _perfChecked=true;
      if(_perfBadFrames>QUALITY_BAD_FRAME_THRESHOLD){
        _lowQuality=true;
        // Reduce pixel ratio for better framerate
        if(renderer)renderer.setPixelRatio(Math.min(devicePixelRatio,1));
        // Disable mirror
        const mf=document.getElementById('mirrorFrame');if(mf)mf.style.display='none';
        const ml=document.getElementById('mirrorLabel');if(ml)ml.style.display='none';
        // Hide speed lines
        const sl=document.getElementById('speedLines');if(sl)sl.style.display='none';
      }
    }
  }
}
