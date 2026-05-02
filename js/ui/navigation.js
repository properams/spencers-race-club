// js/ui/navigation.js — non-module script.

'use strict';

// Perf Phase A: heap-snapshot helper. Pusht event-naam + heap MB naar
// window.perfLog. No-op als performance.memory niet beschikbaar (Safari/FF).
function _perfHeap(eventName){
  if(!window.perfLog||!performance.memory)return;
  const mb=+(performance.memory.usedJSHeapSize/1048576).toFixed(2);
  window.perfLog.push({name:'heap.'+eventName,ms:mb,t:performance.now()});
  if(window.dbg)dbg.log('perf','heap@'+eventName+': '+mb+'MB');
}

function goToSelect(){
  if(gameState!=='TITLE')return;gameState='SELECT';initAudio();startSelectMusic();
  setTouchControlsVisible(false);
  document.getElementById('sTitle').classList.add('hidden');
  buildCarSelectUI();
  document.getElementById('sSelect').classList.remove('hidden');
  _perfHeap('goToSelect');
}

function goToRace(){
  // Re-entry guard: blokkeert dubbele invocations (rapid double-click of
  // touch-stutter op de Race-knop). Zonder deze guard start een tweede
  // runCountdown parallel, krijg je twee onGo callbacks en eindigen we
  // met twee parallel music-schedulers (eerste consumeert pendingRaceMusic,
  // tweede valt door naar de fallback factory).
  if(gameState!=='SELECT')return;
  if(window.perfMark)perfMark('goToRace:start');
  _perfHeap('goToRace');
  if(titleMusic){titleMusic.stop();titleMusic=null;}
  // Tear down de bake-scene + render target. De cache (2D canvases per
  // auto) blijft staan voor snel terugkeren naar SELECT zonder re-bake.
  if(typeof disposeSnapshotBakery==='function')disposeSnapshotBakery();
document.getElementById('sSelect').classList.add('hidden');document.getElementById('hud').style.display='block';
  if(window.perfMark)perfMark('goToRace:makeAllCars:start');
  makeAllCars();
  if(window.perfMark){perfMark('goToRace:makeAllCars:end');perfMeasure('goToRace.makeAllCars','goToRace:makeAllCars:start','goToRace:makeAllCars:end');}
  cacheHUDRefs();applyWorldHUDTint(activeWorld);
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
  // PHASE-D: GEEN expliciete warm-render meer hier. Reden: blokkeerde de
  // click→countdown-light latency met 51-929ms (sandbox-meting; onbekend
  // op echte hardware). loop() rendert tijdens de 4.2-sec countdown ~250
  // frames via renderWithPostFX op race-cam-view, dus de eerste van die
  // frames betaalt de compile + texture-upload cost — verstopt achter de
  // F1-light-sequence (DOM-setTimeout, animeert onafhankelijk van rAF).
  // GO-frame is daardoor warm tegen de tijd dat gameState→RACE flipt.
  // Phase-C2 warm-render in goToRace verwijderd; rest van flow ongewijzigd.
  _introPanTimer=0;
  _raceMaxSpeed=0;_raceOvertakes=0;_lastPlayerPos=9;
  _camView=0;_achieveUnlocked.clear();
  // Mid-race weather event: schedule randomly between 45-90 seconds into the race
  _weatherForecastTimer=45+Math.random()*45;_weatherForecastFired=false;
  // Reset ghost for new race but keep best lap ghost
  _ghostPos.length=0;_ghostSampleT=0;_ghostPlayT=0;
  initDriftVisuals();
  gameState='COUNTDOWN';_raceStartGrace=99;
  if(window.perfMark){perfMark('goToRace:end');perfMeasure('goToRace.total','goToRace:start','goToRace:end');}
  setTouchControlsVisible(true);
  // Pre-warm ambient audio during countdown so the WebAudio node graph is
  // already alive by GO. Both functions are idempotent and ramp gain from 0,
  // so calling them early is silent until the race actually starts.
  // Engine audio (4-osc + tire-noise loop) wordt ook hier ge-init zodat de
  // 88200-sample noise-buffer fill + filter chain niet op het 1e race-frame
  // landt. engineGain start op 0 → stilte tot updateEngine de gain ramped.
  if(audioCtx){
    Audio.startWind();
    Audio.initCrowd();
    if(typeof initEngine==='function'&&!engineGain){
      if(window.dbg)dbg.measure('perf','initEngine.preWarm',initEngine);
      else initEngine();
    }
    // Pre-construct race music scheduler tijdens countdown. Constructor doet
    // _ensureMusicMaster (eerste keer ~kostbaar GainNode setup), filter chain,
    // bass/lead/stab arrays. Door dit naar countdown te verschuiven blijft
    // er op T+380ms enkel een goedkope .start() over (RaceMusic._s self-
    // schedule chain of StemRaceMusic 3x bufferSource.start). Quit-during-
    // countdown wordt opgevangen door _resetRaceState.
    if(!window._pendingRaceMusic&&typeof _createRaceMusicForWorld==='function'){
      const _ctor=()=>{try{window._pendingRaceMusic=_createRaceMusicForWorld();}
        catch(e){if(window.dbg)dbg.error('perf',e,'pre-construct race music');}};
      if(window.dbg)dbg.measure('perf','raceMusic.preConstruct',_ctor);else _ctor();
    }
  }
  runCountdown(()=>{
    gameState='RACE';
    if(typeof window._resetFirstRaceFrameMarker==='function')window._resetFirstRaceFrameMarker();
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
          if(window.dbg)dbg.markRaceEvent('MUSIC-DISPATCH-START');
          const _start=()=>{
            let inst=window._pendingRaceMusic;window._pendingRaceMusic=null;
            if(inst){
              // Pre-built tijdens countdown — alleen .start() hier.
              try{if(inst.start)inst.start();}
              catch(e){if(window.dbg)dbg.warn('music','pre-built start failed: '+e.message);inst=null;}
            }
            if(!inst){
              // Fallback: pre-construct path overgeslagen of gefaald.
              inst=_safeStartMusic(()=>_createRaceMusicForWorld());
            }
            musicSched=inst;
          };
          if(window.dbg)dbg.measure('perf','raceMusic.start',_start);else _start();
          if(musicSched){
            if(musicSched.setNitro)musicSched.setNitro(false);
            if(musicSched.setIntensity)musicSched.setIntensity(0);
          }
          if(window.dbg)dbg.markRaceEvent('MUSIC-DISPATCH-DONE');
        }
      },380);
      // Wind/crowd were pre-warmed at countdown start; calls below are idempotent no-ops.
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
  _perfHeap('goToTitle');
  gameState='TITLE';
  setTouchControlsVisible(false);
  // Title heeft geen car-preview nodig — bake-scene + render target weg.
  if(typeof disposeSnapshotBakery==='function')disposeSnapshotBakery();
  document.getElementById('sSelect').classList.add('hidden');
  document.getElementById('sWorld').classList.add('hidden');
  document.getElementById('sTitle').classList.remove('hidden');
  camera.position.set(0,12,330);camera.lookAt(0,0,280);
  initAudio();startTitleMusic();
  updateTitleHighScore();
}

function goToWorldSelect(){
  _perfHeap('goToWorldSelect');
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
