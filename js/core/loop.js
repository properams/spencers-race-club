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
//   checkSpaceRailgun, checkSpaceWormhole, checkGravityZones,
//   checkOrbitingAsteroids, checkWarpTunnels, checkCurrentStreams,
//   checkAbyssCracks, checkTreasureTrail, checkWaterPuddles, checkDRSZone,
//   updateBoostArrows, updateSlipstreamVisuals, updateSafetyCar,
//   updateCamera, updateCarLights, updateBoostGlow, updateFlags,
//   updateSkidMarks, updateWeather, updateSky, updateSnow, updateStormFlash,
//   updateSpaceWorld, updateDeepSeaWorld, updateCandyWorld,
//   updateNeonCityWorld, updateVolcanoWorld, updateArcticWorld,
//   updateThemeparkWorld, updateHUD, updateSpeedOverlay, getPositions,
//   updateAmbientWindSpeed, updateAchievements, updateAchievementToast,
//   updateWeatherForecast, updateQuickRestart, updateDamageSmoke,
//   updateRpmBar, updateRevLimiter, updateGapDisplay, updateDriftVisuals,
//   updateNitroVisual, updateBoostTrail, updateGhost, updateSpeedLines,
//   updatePitStop, updateFastestLapFlash, updateCloseBattle,
//   updateCollisionFlash, updateRain, updateCarPreview, updateMirror,
//   Audio.updateThunder, Audio.updateCrowd.

'use strict';

let _aiFrameCounter=0,_fpsShow=false,_fpsFrames=0,_fpsLast=performance.now(),_fpsVal=60;
let _perfBadFrames=0,_perfChecked=false,_lowQuality=!!window._isMobile;
// Auto-quality detection thresholds: during frames [START..END], count frames slower than BAD_MS.
// If the count exceeds BAD_THRESHOLD within that window, downgrade to low quality.
const QUALITY_CHECK_FRAME_START=30,QUALITY_CHECK_FRAME_END=180;
const QUALITY_BAD_FRAME_MS=0.032,QUALITY_BAD_FRAME_THRESHOLD=60;

function loop(){
  requestAnimationFrame(loop);
  if(_ctxLost){clock.getDelta();return;} // context lost — skip frame, consume delta
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
      if(activeWorld==='space'){checkSpaceRailgun();checkSpaceWormhole();checkGravityZones(dt);checkOrbitingAsteroids(dt);checkWarpTunnels(dt);}
      else if(activeWorld==='deepsea'){checkCurrentStreams(dt);checkAbyssCracks(dt);checkTreasureTrail(dt);}
      else{checkWaterPuddles(dt);checkDRSZone(dt);}
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
      updateAmbientWindSpeed(dt);
      updateAchievements(dt);
      updateAchievementToast(dt);
      if(_floatSlotTimer>0){_floatSlotTimer-=dt;if(_floatSlotTimer<=0)_floatSlot=0;}
      updateWeatherForecast(dt);
      updateQuickRestart(dt);
      updateDamageSmoke();
      updateRpmBar(dt);
      updateRevLimiter(dt);
      updateGapDisplay();
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
  if(renderer&&scene&&camera)renderer.render(scene,camera);
  updateCarPreview(dt);
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
