// js/ui/navigation.js — non-module script.

'use strict';

function goToSelect(){
  if(gameState!=='TITLE')return;gameState='SELECT';initAudio();startSelectMusic();
  setTouchControlsVisible(false);
  document.getElementById('sTitle').classList.add('hidden');
  buildCarSelectUI();
  document.getElementById('sSelect').classList.remove('hidden');
}

function goToRace(){
  if(titleMusic){titleMusic.stop();titleMusic=null;}
document.getElementById('sSelect').classList.add('hidden');document.getElementById('hud').style.display='block';
  makeAllCars();cacheHUDRefs();applyWorldHUDTint(activeWorld);
  // Start camera directly behind car at ground level — no overhead swoop
  const p=carObjs[playerIdx];
  if(p){
    const _startFwd=new THREE.Vector3(0,0,-1).applyQuaternion(p.mesh.quaternion);
    const _startRight=new THREE.Vector3(1,0,0).applyQuaternion(p.mesh.quaternion);
    camPos.copy(p.mesh.position).addScaledVector(_startFwd,13.5);
    camPos.y=p.mesh.position.y+5.8;
    camTgt.copy(p.mesh.position).addScaledVector(_startFwd,-7).addScaledVector(_startRight,0);
    camTgt.y=p.mesh.position.y+0.8;
    camera.position.copy(camPos);camera.lookAt(camTgt);
    camera.fov=62;camera.updateProjectionMatrix();
  }
  _introPanTimer=0;
  _raceMaxSpeed=0;_raceOvertakes=0;_lastPlayerPos=9;
  _camView=0;_achieveUnlocked.clear();
  // Mid-race weather event: schedule randomly between 45-90 seconds into the race
  _weatherForecastTimer=45+Math.random()*45;_weatherForecastFired=false;
  // Reset ghost for new race but keep best lap ghost
  _ghostPos.length=0;_ghostSampleT=0;_ghostPlayT=0;
  initDriftVisuals();
  gameState='COUNTDOWN';_raceStartGrace=99;
  setTouchControlsVisible(true);
  runCountdown(()=>{
    gameState='RACE';
    _raceStartGrace=0; // GO means GO — no delay
    // Reset lap + sector timers to NOW so first lap/sector duration is correct
    lapStartTime=_nowSec;
    _sectorStart=_nowSec;_currentSector=0;
    _sectorBests[0]=_sectorBests[1]=_sectorBests[2]=Infinity;
    // Crossfade naar race-muziek: fade oude tracks uit, dan dispatcher-instantie starten
    if(titleMusic){_fadeOutMusic(titleMusic,0.4);titleMusic=null;}
    if(selectMusic){_fadeOutMusic(selectMusic,0.4);selectMusic=null;}
    if(musicSched){_fadeOutMusic(musicSched,0.3);musicSched=null;}
    // Reset dynamic state: nieuwe race = geen nitro/intensity-residu, geen duck
    _musicDuck=1.0;_applyMusicGain(0.1);
    if(audioCtx){
      setTimeout(()=>{
        if(gameState==='RACE'&&!musicSched){
          musicSched=_safeStartMusic(()=>_createRaceMusicForWorld());
          if(musicSched){
            if(musicSched.setNitro)musicSched.setNitro(false);
            if(musicSched.setIntensity)musicSched.setIntensity(0);
          }
        }
      },380);
      Audio.startWind();Audio.initCrowd();
    }
    // Show touch controls during race if on a touch device — but not if a hardware keyboard was detected
    const tc=document.getElementById('touchControls');
    if(tc&&('ontouchstart' in window||navigator.maxTouchPoints>0)&&!_hwKeyboardDetected)tc.style.display='block';
    // Control hints: show for 6s then fade out
    const ch=document.getElementById('controlHints');
    if(ch){ch.style.display='block';ch.style.opacity='1';setTimeout(()=>{ch.style.opacity='0';setTimeout(()=>{ch.style.display='none';},700);},6000);}
    // Add cam hint
    const camHint=document.getElementById('camViewHint');
    if(camHint){camHint.style.display='block';setTimeout(()=>camHint.style.display='none',5000);}
  });
}


function goToTitle(){
  _resetRaceState();
  gameState='TITLE';
  setTouchControlsVisible(false);
  document.getElementById('sSelect').classList.add('hidden');
  document.getElementById('sWorld').classList.add('hidden');
  document.getElementById('sTitle').classList.remove('hidden');
  camera.position.set(0,12,330);camera.lookAt(0,0,280);
  initAudio();startTitleMusic();
  updateTitleHighScore();
}

function goToWorldSelect(){
  gameState='WORLD_SELECT';
  setTouchControlsVisible(false);
  initAudio();startSelectMusic();
  document.getElementById('sTitle').classList.add('hidden');
  document.getElementById('sSelect').classList.add('hidden');
  document.getElementById('sWorld').classList.remove('hidden');
  // Highlight currently selected world
  document.querySelectorAll('.worldBigCard').forEach(c=>{
    c.classList.toggle('wBigSel',c.dataset.world===activeWorld);
  });
}

function goToSelectAgain(){
  _resetRaceState();
  gameState='SELECT';
  setTouchControlsVisible(false);
  initAudio();startSelectMusic();
  buildCarSelectUI();
  document.getElementById('sSelect').classList.remove('hidden');
}
