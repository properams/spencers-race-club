// js/audio/engine-samples.js — sample-based engine geluid met RPM-crossfade.
//
// Vervangt de 4-osc procedural setup uit engine.js voor car-types waar
// engine-samples geladen zijn (zie ENGINE_MANIFEST in samples.js).
//
// Werkt door 5 looping sources te draaien (idle/low/mid/high/redline) en
// hun gains te crossfaden op basis van speed-ratio (0..1). Gear shifts en
// boost geven een lichte playbackRate-bump zodat het pitchen meebeweegt
// met het procedural gedrag dat spelers gewend zijn.
//
// STATUS: dormant. Klasse en factory zijn beschikbaar, maar engine.js
// dispatcht er nog niet naartoe — daarvoor moeten eerst echte samples
// in assets/audio/engine/<type>/ staan. Wiring is een 5-regel wijziging
// in engine.js; zie comment-marker daar.

class SampleEngine {
  constructor(ctx, carType, buffers){
    this.ctx = ctx;
    this.carType = carType;
    this.buffers = buffers || {};
    this.bands = ['idle','low','mid','high','redline'];
    // Center-ratio per band — gain piek bij dit punt, faded weg richting
    // buurbanden. Triangular envelope met overlap.
    this.bandCenters = { idle:0.00, low:0.20, mid:0.45, high:0.70, redline:0.95 };
    this.bandWidth = 0.28;  // overlap-breedte; smaller = strakker per-band

    this._sources = [];
    this._gains = {};
    this._master = ctx.createGain();
    this._master.gain.value = 0;  // fade-in op start
    this._master.connect(window._master || ctx.destination);
  }

  start(){
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    for(const band of this.bands){
      const buf = this.buffers[band];
      if(!buf) continue;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(g);
      g.connect(this._master);
      src.start(t0);
      this._sources.push(src);
      this._gains[band] = g;
    }
    // Fade-in master
    this._master.gain.setValueAtTime(0, t0);
    this._master.gain.linearRampToValueAtTime(0.9, t0 + 0.15);
  }

  stop(){
    const t = this.ctx.currentTime;
    try{
      this._master.gain.cancelScheduledValues(t);
      this._master.gain.setValueAtTime(this._master.gain.value, t);
      this._master.gain.linearRampToValueAtTime(0, t + 0.1);
    }catch(_){}
    setTimeout(() => {
      for(const s of this._sources){ try{ s.stop(); }catch(_){} }
      this._sources = [];
    }, 120);
  }

  // Per-frame: ratio = 0..1 (speed/topSpd), isBoost = nitro/boost actief.
  // Gear is 1..5 — kleine playbackRate-bump op shift voor "geshift" gevoel.
  update(ratio, isBoost, gear){
    if(!this._master) return;
    ratio = Math.max(0, Math.min(1, ratio));
    const now = this.ctx.currentTime;
    const w = this.bandWidth;

    for(const band of this.bands){
      const g = this._gains[band];
      if(!g) continue;
      const center = this.bandCenters[band];
      const dist = Math.abs(ratio - center);
      // Triangular gain envelope: 1 op center, 0 op afstand >= w.
      let bandGain = Math.max(0, 1 - dist / w);
      // Boost geeft 6% pitch-bump op de actieve banden.
      if(isBoost) bandGain *= 1.05;
      g.gain.setTargetAtTime(bandGain * 0.5, now, 0.05);
    }

    // PlaybackRate: subtiele pitch-meeschaling binnen ratio-range, zodat
    // niet alle banden statisch klinken. 0.92x bij idle → 1.08x bij redline.
    const rate = 0.92 + ratio * 0.16 + (isBoost ? 0.04 : 0);
    for(const s of this._sources){
      try{ s.playbackRate.setTargetAtTime(rate, now, 0.06); }catch(_){}
    }
  }
}

// Factory: bouw alleen als samples voor deze car-type geladen zijn.
function createSampleEngineForCarType(carType){
  if(!window._hasEngineSamples || !window._hasEngineSamples(carType)) return null;
  if(!window.audioCtx) return null;
  const buffers = window._getEngineBuffers(carType);
  return new SampleEngine(window.audioCtx, carType, buffers);
}

window.SampleEngine = SampleEngine;
window._createSampleEngineForCarType = createSampleEngineForCarType;

export { SampleEngine, createSampleEngineForCarType };
