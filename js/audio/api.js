// js/audio/api.js — Audio facade
//
// Één namespace waar alle gameplay-code audio-events doorheen stuurt.
// Routeert naar onderliggende implementaties (momenteel via window.*
// omdat SFX/engine/ambient nog in main.js wonen en music in music.js).
//
// Voordeel: toekomstige Howler.js / sample-based migratie raakt alleen
// deze file + de betreffende implementatie-module; de ~50 call sites
// in gameplay blijven ongewijzigd.

const _win = () => (typeof window!=='undefined'?window:{});

const Audio = {
  // ── Init ─────────────────────────────────────────
  init()          { return _win().initAudio && window.initAudio(); },
  initEngine()    { return window.initEngine && window.initEngine(); },

  // ── Engine (per-frame) ───────────────────────────
  updateEngine(spd)   { return window.updateEngine && window.updateEngine(spd); },
  updateBoostGlow()   { return window.updateBoostGlow && window.updateBoostGlow(); },

  // ── SFX ──────────────────────────────────────────
  playBoost()         { return window.playBoostSound && window.playBoostSound(); },
  playNitro()         { return window.playNitroActivate && window.playNitroActivate(); },
  playScreech()       { return window.playTireScreech && window.playTireScreech(); },
  playJump()          { return window.playJumpSound && window.playJumpSound(); },
  playLand()          { return window.playLandSound && window.playLandSound(); },
  playSpin()          { return window.playSpinSound && window.playSpinSound(); },
  playCollision()     { return window.playCollisionSound && window.playCollisionSound(); },
  playBrake()         { return window.playBrakeSound && window.playBrakeSound(); },
  playVictory()       { return window.playVictoryFanfare && window.playVictoryFanfare(); },
  playCount(n)        { return window.playCountBeep && window.playCountBeep(n); },
  playFanfare()       { return window.playFanfare && window.playFanfare(); },
  playRecovery()      { return window.playRecoverySound && window.playRecoverySound(); },
  playCollect()       { return window.playCollectSound && window.playCollectSound(); },

  // ── Music ────────────────────────────────────────
  startTitleMusic()   { return window.startTitleMusic && window.startTitleMusic(); },
  startSelectMusic()  { return window.startSelectMusic && window.startSelectMusic(); },
  // Race music: dispatcher. Aanroeper geeft activeWorld impliciet (via window.activeWorld).
  createRaceMusic()   { return window._createRaceMusicForWorld && window._createRaceMusicForWorld(); },
  // Preload muziek-stems voor een wereld. Fire-and-forget vanaf track-select;
  // als preload klaar is voor race-start gebruikt _createRaceMusicForWorld
  // automatisch de samples, anders fallback naar procedurele synth.
  preloadWorld(worldId){
    if(typeof window._preloadWorld !== 'function') return Promise.resolve({kind:'procedural'});
    return window._preloadWorld(worldId);
  },
  // Preload alle dispatch-categorieën voor de huidige race-config:
  // SFX (globaal), surface voor de actieve wereld, engine voor het geselecteerde
  // car-type. Idempotent — caches dedupliceren herhaalde aanroepen. Wordt
  // aangeroepen vanaf select-flow zodat samples klaar zijn voor race-start.
  preloadAll(carType){
    const out = [];
    if(window._preloadSFX) out.push(window._preloadSFX());
    if(window._preloadAmbient) out.push(window._preloadAmbient());
    if(window._preloadSurfacesForWorld && window.activeWorld){
      out.push(window._preloadSurfacesForWorld(window.activeWorld));
    }
    if(window._preloadEngine && carType){
      out.push(window._preloadEngine(carType));
    }
    return Promise.all(out);
  },
  fadeOut(sched, dur) { return window._fadeOutMusic && window._fadeOutMusic(sched, dur); },
  safeStart(factory)  { return window._safeStartMusic && window._safeStartMusic(factory); },
  applyMusicGain(ramp){ return window._applyMusicGain && window._applyMusicGain(ramp); },

  // Nitro & intensity (op de actieve race-scheduler)
  setNitro(active){
    const s = window.musicSched;
    if (s && s.setNitro) s.setNitro(active);
  },
  setIntensity(level){
    const s = window.musicSched;
    if (s && s.setIntensity) s.setIntensity(level);
  },
  setFinalLap(){
    const s = window.musicSched;
    if (s && s.setFinalLap) s.setFinalLap();
    if (s && s.setIntensity) s.setIntensity(1);
  },

  // Per-frame intensity update gebaseerd op race-state. Gameplay roept dit
  // aan elke tick met (positie, speedRatio 0..1, comboActief). De facade
  // berekent een continue 0..1 intensity en stuurt die door naar de actieve
  // scheduler. Wordt genegeerd na setFinalLap (intensity locked op 1).
  // Delta-gate voorkomt dat StemRaceMusic.setIntensity per-frame opnieuw
  // AudioParam-ramps schedule't terwijl de waarde nauwelijks verandert.
  updateMusicIntensity(pos, speedRatio, comboActive){
    const s = window.musicSched;
    if (!s || !s.setIntensity) return;
    if (s.finalLap) return;
    const posEnergy = pos===1 ? 0.55 : pos===2 ? 0.40 : pos===3 ? 0.30 : 0.20;
    const comboBoost = comboActive ? 0.30 : 0;
    const speedBoost = Math.max(0, Math.min(1, +speedRatio || 0)) * 0.15;
    const intensity = Math.max(0, Math.min(1, posEnergy + comboBoost + speedBoost));
    if (this._lastIntensity !== undefined && Math.abs(intensity - this._lastIntensity) < 0.02) return;
    this._lastIntensity = intensity;
    s.setIntensity(intensity);
  },

  // Duck (pit-stop, etc). Mutated window._musicDuck + re-applies.
  setDuck(amt, ramp=0.4){
    window._musicDuck = amt;
    if (window._applyMusicGain) window._applyMusicGain(ramp);
  },
  setMusicMuted(muted, ramp=0.1){
    window._musicMuted = !!muted;
    if (window._applyMusicGain) window._applyMusicGain(ramp);
  },

  // Countdown roll (tom-build-up + GO kick)
  playCountdownRoll() { return window._playCountdownRoll && window._playCountdownRoll(); },

  // ── Ambient ──────────────────────────────────────
  playThunder()       { return window.playThunder && window.playThunder(); },
  updateThunder(dt)   { return window.updateThunder && window.updateThunder(dt); },
  initCrowd()         { return window.initCrowdNoise && window.initCrowdNoise(); },
  stopCrowd()         { return window.stopCrowdNoise && window.stopCrowdNoise(); },
  updateCrowd(pos)    { return window.updateCrowdNoise && window.updateCrowdNoise(pos); },
  startWind()         { return window.startAmbientWind && window.startAmbientWind(); },
  stopWind()          { return window.stopAmbientWind && window.stopAmbientWind(); },
  playCrowdCheer()    { return window.playCrowdCheer && window.playCrowdCheer(); },

  // ── Placeholder voor toekomst ───────────────────
  play3D(soundId, position){
    if(window.dbg)dbg.warn('audio','play3D niet geïmplementeerd (fallback)');
    else console.warn('[Audio.play3D] niet geïmplementeerd (fallback)');
  }
};

window.Audio = Audio;
export { Audio };
