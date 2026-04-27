// js/ui/pause.js — non-module script.

function togglePause(){
  if(gameState!=='RACE'){window.dbg&&dbg.log('pause','skip — gameState='+gameState);return;}
  gamePaused=!gamePaused;
  const ov=document.getElementById('pauseOverlay');
  if(!ov){window.dbg&&dbg.error('pause','pauseOverlay element niet gevonden');}
  else ov.style.display=gamePaused?'flex':'none';
  const btn=document.getElementById('hudPauseBtn');
  if(btn)btn.textContent=gamePaused?'▶ PLAY':'⏸ PAUSE';
  // Music-ducking via gain ramp in plaats van audioCtx.suspend — suspend breekt setTimeout scheduling.
  _musicMuted=gamePaused;_applyMusicGain(0.2);
  window.dbg&&dbg.log('pause',gamePaused?'paused':'resumed','overlay='+(ov?ov.style.display:'(missing)'));
}

function toggleMute(){
  audioMuted=!audioMuted;
  if(_muteGain)_muteGain.gain.value=audioMuted?0:1;
  // Ook muziek-master volgt — zo pikt ook de music-master up als iemand _muteGain bypass gebruikt
  _musicMuted=audioMuted;_applyMusicGain(0.1);
  const b=document.getElementById('hudMuteBtn');
  if(b)b.textContent=audioMuted?'🔇':'🔊';
}

