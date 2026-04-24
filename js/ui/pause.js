// js/ui/pause.js — Fase 2.3/2.4 extraction. Non-module script.


function togglePause(){
  if(gameState!=='RACE')return;
  gamePaused=!gamePaused;
  document.getElementById('pauseOverlay').style.display=gamePaused?'flex':'none';
  const btn=document.getElementById('hudPauseBtn');
  if(btn)btn.textContent=gamePaused?'▶ PLAY':'⏸ PAUSE';
  // Music-ducking via gain ramp in plaats van audioCtx.suspend — suspend breekt setTimeout scheduling.
  _musicMuted=gamePaused;_applyMusicGain(0.2);
}

function toggleMute(){
  audioMuted=!audioMuted;
  if(_muteGain)_muteGain.gain.value=audioMuted?0:1;
  // Ook muziek-master volgt — zo pikt ook de music-master up als iemand _muteGain bypass gebruikt
  _musicMuted=audioMuted;_applyMusicGain(0.1);
  const b=document.getElementById('hudMuteBtn');
  if(b)b.textContent=audioMuted?'🔇':'🔊';
}

