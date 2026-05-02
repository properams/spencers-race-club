// js/gameplay/race.js — race-lifecycle reset (oude main.js _resetRaceState).
// Non-module script, geladen vóór ui/navigation.js (de enige call-site).
//
// Schrijft naar talloze script-globals (per-race state) verspreid over
// main.js, world-modules en gameplay-modules. Letterlijk verhuisd —
// geen gedragswijziging.

'use strict';

// Lap timing (uit main.js verhuisd). Cross-script gemuteerd door
// ui/navigation.js (countdown→start zet lapStartTime), gameplay/tracklimits.js
// (S/F-line crossing herstart lapStartTime + zet lastLapTime).
let lapStartTime=0,lastLapTime=0;

// Per-race statistieken (uit main.js verhuisd).
//   _raceMaxSpeed     — top speed bereikt deze race (achievements.js)
//   _raceOvertakes    — aantal posities gewonnen (achievements.js + finish.js)
//   _lastPlayerPos    — positie vorige tick (overtake-detector)
//   _raceStartGrace   — grace-counter na go (cars/physics.js + ai.js)
//   _lapTimes         — array van per-lap tijden
//   _newUnlocks       — cars vrijgespeeld deze race (finish-screen toast)
//   _nitroUseCount    — nitro-activaties deze race (achievements NITRO_JUNKIE)
//   _airborneAccum    — luchttijd-accumulator (achievement FLYING)
//   _cleanLapFlag     — geen recovery in deze ronde (achievement CLEAN_LAP)
//
// Dead-code (nergens gelezen of geschreven, waarschijnlijk uit ouder
// design — zou later ge-her-introduceerd kunnen worden via achievements):
//   _newUnlocks, _totalNitroUses, _winStreak  → verwijderd.
let _raceMaxSpeed=0,_raceOvertakes=0,_lastPlayerPos=9,_raceStartGrace=0;
const _lapTimes=[];
let _nitroUseCount=0,_airborneAccum=0,_cleanLapFlag=true;

function _resetRaceState(){
  if(musicSched){musicSched.stop();musicSched=null;}
  setTimeout(()=>{if(musicSched){musicSched.stop();musicSched=null;}},100);
  // Pre-built RaceMusic instance uit countdown opruimen als gebruiker quit
  // tijdens countdown (instance was geconstrueerd, .start() niet aangeroepen).
  if(window._pendingRaceMusic){
    try{window._pendingRaceMusic.stop&&window._pendingRaceMusic.stop();}catch(_){}
    window._pendingRaceMusic=null;
  }
  if(titleMusic){titleMusic.stop();titleMusic=null;}
  if(selectMusic){selectMusic.stop();selectMusic=null;}
  // Reset dynamic music state for clean slate
  _musicDuck=1.0;_applyMusicGain(0);
  Audio.stopWind();Audio.stopCrowd();
  carObjs.forEach(c=>scene.remove(c.mesh));carObjs=[];
  // Skid-mark geometry is shared across all marks; only dispose materials per mark.
  skidMarks.forEach(s=>{const m=s.mesh||s;if(m.material)m.material.dispose();scene.remove(m);});
  skidMarks.length=0;
  nitroLevel=100;nitroActive=false;driftScore=0;driftTimer=0;
  lapStartTime=0;lastLapTime=0;bestLapTime=Infinity;
  recoverActive=false;recoverTimer=0;camShake=0;slipTimer=0;
  _wrongWayTimer=0;_miniTurboReady=false;_camLateralT=0;_tireWarnCooldown=0;
  _introPanTimer=0;_camView=0;_raceMaxSpeed=0;_raceOvertakes=0;_lastPlayerPos=9;_raceStartGrace=0;
  _achieveUnlocked.clear();_achieveQueue.length=0;_achieveTimer=0;
  _nitroUseCount=0;_airborneAccum=0;_cleanLapFlag=true;_driftAccum=0;
  _bestS1=Infinity;_bestS2=Infinity;_bestS3=Infinity;_currentSector=0;_sectorStart=0;
  _comboCount=0;_comboMult=1.0;_comboTimer=0;_lastRaceCoins=0;
  _lapTimes.length=0;_weatherForecastTimer=0;_weatherForecastFired=false;
  _rstHold=0;_colFlashT=0;
  _ghostPos.length=0;_ghostBest=[];_ghostSampleT=0;_ghostPlayT=0;
  if(_ghostMesh)_ghostMesh.visible=false;
  const gl=document.getElementById('ghostLabel');if(gl)gl.style.display='none';
  if(_speedLinesCvs)_speedLinesCvs.style.opacity='0';
  _rainIntensity=_rainTarget; // snap to current rain state (no lingering transition)
  if(_elWrongWay)_elWrongWay.style.display='none';
  totalScore=0;
  if(_elLapDelta){_elLapDelta.textContent='';_elLapDelta.style.color='';}
  const _ccvs=document.getElementById('confettiCvs');if(_ccvs)_ccvs.style.display='none';
  const _sov=document.getElementById('speedOverlay');if(_sov)_sov.style.opacity='0';
  if(_boostLight)_boostLight.intensity=0;
  if(_safetyCar){scene.remove(_safetyCar.mesh);_safetyCar=null;}
  // Volcano/Arctic cleanup
  _volcanoLavaRivers.length=0;_volcanoGeisers.length=0;_volcanoEruption=null;_volcanoEruptionTimer=3;_volcanoEmbers=null;_volcanoEmberGeo=null;_volcanoGlowLight=null;
  if(typeof disposeVolcanoBridge==='function')disposeVolcanoBridge();
  if(typeof disposeArcticIceShelf==='function')disposeArcticIceShelf();
  if(typeof disposeCandyChocoBridge==='function')disposeCandyChocoBridge();
  if(typeof disposeThemeparkCoaster==='function')disposeThemeparkCoaster();
  if(typeof disposeNeonCityEMP==='function')disposeNeonCityEMP();
  if(typeof disposeGrandPrixStorm==='function')disposeGrandPrixStorm();
  if(typeof disposeSpaceAnomaly==='function')disposeSpaceAnomaly();
  if(typeof disposeDeepSeaCurrent==='function')disposeDeepSeaCurrent();
  _arcticIcePatches.length=0;_arcticAurora.length=0;_arcticBlizzardGeo=null;
  _lastGear=1;_currentGear=1;_lastPPos=0;_lastLeaderOrder='';
  _leaderPendingKey='';_leaderStableT=0;_posStableValue=0;_posStableT=0;
  gamePaused=false;
  // Make sure the HUD pause-button is back to "PAUSE" on a new race (was sticking on "PLAY"
  // if a previous race ended while paused).
  {const pb=document.getElementById('hudPauseBtn');if(pb)pb.textContent='⏸ PAUSE';}
  Object.keys(keys).forEach(k=>delete keys[k]);
  document.getElementById('pauseOverlay').style.display='none';
  document.getElementById('sFinish').classList.add('hidden');
  document.getElementById('hud').style.display='none';
  if(_elWarn)_elWarn.style.display='none';
  document.getElementById('bannerOverlay').style.display='none';
  document.getElementById('controlHints').style.display='none';
  const tc=document.getElementById('touchControls');if(tc)tc.style.display='none';
  const mf=document.getElementById('mirrorFrame'),ml=document.getElementById('mirrorLabel');
  if(mf)mf.style.display='none';if(ml)ml.style.display='none';
  const rb=document.getElementById('rstBar'),rl=document.getElementById('rstLabel');
  if(rb)rb.style.display='none';if(rl)rl.style.display='none';
  const f1=document.getElementById('f1Lights');if(f1)f1.style.display='none';
  const cf=document.getElementById('colFlash');if(cf)cf.style.opacity='0';
  const ah=document.getElementById('achieveToast');if(ah)ah.style.opacity='0';
  _revLimiterTimer=0;_titleCamT=0;
  const dbEl=document.getElementById('driftBar');if(dbEl)dbEl.style.display='none';
  const dlEl=document.getElementById('driftLabel');if(dlEl)dlEl.style.display='none';
  const gcEl=document.getElementById('goldCelebration');if(gcEl)gcEl.style.opacity='0';
  // Reset tire temps (cold start)
  _tireTemp={fl:.08,fr:.08,rl:.08,rr:.08};
  _wasBraking=false;_speedTrapMax=0;_speedTrapFired=false;
  ['FL','FR','RL','RR'].forEach(c=>{const el=document.getElementById('tt'+c);if(el)el.style.background='#4488ff';});
  [1,2,3].forEach(s=>{const el=document.getElementById('secT'+s);if(el){el.textContent='--.-';el.style.color='#666';}});
  // Reset new systems
  _pitStopActive=false;_pitStopTimer=0;_pitStopUsed=false;
  _fastestLapFlashT=0;_closeBattleTimer=0;_drsActive=false;
  const pitOv=document.getElementById('pitStopOverlay');if(pitOv)pitOv.style.display='none';
  const flEl=document.getElementById('fastestLapFlash');if(flEl)flEl.style.opacity='0';
  const drsE=document.getElementById('drsIndicator');if(drsE)drsE.style.display='none';
  const cbEl=document.getElementById('closeBattleEl');if(cbEl)cbEl.style.display='none';
  for(let i=0;i<_nearMissCooldown.length;i++)_nearMissCooldown[i]=0;
}
