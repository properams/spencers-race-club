// js/audio/sfx.js — Fase 2.3/2.4 extraction. Non-module script.
//
// Dispatch-laag: elke functie checkt eerst of er een sample voor dit
// effect geladen is (via window._hasSFXSample uit samples.js). Zo ja →
// sample. Zo nee → procedurele synth-fallback. Geen gameplay-koppeling
// die breekt als samples ontbreken.


// Generic one-shot sample player. hasFn/getFn parametriseren de categorie
// (SFX, Ambient, ...) zodat dezelfde implementatie hergebruikt wordt.
// slots = string of array; bij array random pick (variatie voor drift etc).
function _playBufferOneShot(hasFn, getFn, slots, vol=0.6, delay=0){
  if(!audioCtx||!hasFn||!getFn)return false;
  if(window._forceProceduralAudio)return false;
  const list=Array.isArray(slots)?slots:[slots];
  const available=list.filter(s=>hasFn(s));
  if(!available.length)return false;
  const slot=available[Math.floor(Math.random()*available.length)];
  const buf=getFn(slot);
  if(!buf)return false;
  const t=audioCtx.currentTime+delay;
  const src=audioCtx.createBufferSource();
  src.buffer=buf;
  const g=audioCtx.createGain();
  g.gain.value=vol;
  src.connect(g);g.connect(_dst());
  src.start(t);
  return true;
}

// SFX shorthand — gebruikt door playTireScreech / playLandSound / etc.
function _playSampleOneShot(slots, vol=0.6, delay=0){
  return _playBufferOneShot(window._hasSFXSample,window._getSFXBuffer,slots,vol,delay);
}

'use strict';

function beep(f,d,v=.25,delay=0,type='sine'){
  if(!audioCtx)return;
  const o=audioCtx.createOscillator(),g=audioCtx.createGain(),t=audioCtx.currentTime+delay;
  o.type=type;o.frequency.value=f;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.01);
  g.gain.exponentialRampToValueAtTime(.001,t+d);
  o.connect(g);g.connect(_dst());o.start(t);o.stop(t+d+.01);
}

function _noise(dur,fq,Q,vol,delay=0){
  if(!audioCtx)return;
  const t=audioCtx.currentTime+delay;
  const sz=Math.ceil(audioCtx.sampleRate*Math.min(dur,.8));
  const buf=audioCtx.createBuffer(1,sz,audioCtx.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
  const src=audioCtx.createBufferSource(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain();
  f.type='bandpass';f.frequency.value=fq;f.Q.value=Q;
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
  src.buffer=buf;src.connect(f);f.connect(g);g.connect(_dst());src.start(t);src.stop(t+dur+.01);
}


function playBoostSound(){
  // Ascending zap
  beep(220,.08,.3,0,'sawtooth');beep(440,.06,.22,.04,'sawtooth');beep(880,.04,.15,.08,'sawtooth');
  _noise(.2,2200,1.5,.06);
}

function playNitroActivate(){
  if(!audioCtx)return;
  const t=audioCtx.currentTime;
  // Ascending filtered whoosh
  const o=audioCtx.createOscillator(),g=audioCtx.createGain(),f=audioCtx.createBiquadFilter();
  o.type='sawtooth';f.type='highpass';f.frequency.value=200;
  o.frequency.setValueAtTime(80,t);o.frequency.exponentialRampToValueAtTime(800,t+.35);
  g.gain.setValueAtTime(.32,t);g.gain.exponentialRampToValueAtTime(.001,t+.4);
  o.connect(f);f.connect(g);g.connect(_dst());o.start(t);o.stop(t+.44);
  // Sub bass drop
  beep(38,.4,.55,.05,'sine');
  _noise(.32,2400,1.5,.18);
}

function playTireScreech(){
  if(_playSampleOneShot(['drift1','drift2','drift3'], 0.55))return;
  _noise(.22,680,4.5,.2);_noise(.2,1500,2,.09);
}

function playJumpSound(){
  beep(210,.05,.2,0,'sine');beep(360,.07,.15,.04,'sine');_noise(.1,580,4,.08);
}

function playLandSound(){
  if(_playSampleOneShot('suspension', 0.7))return;
  beep(60,.28,.45,0,'sawtooth');_noise(.2,210,1.5,.32);
}

function playSpinSound(){_noise(.7,540,3.5,.2);beep(255,.5,.07,0,'sine');}

function playCollisionSound(){
  // Sample-pad: hard impact + glass scatter overlay als beide aanwezig.
  if(_playSampleOneShot('impactHard', 0.85)){
    _playSampleOneShot('glassScatter', 0.5, 0.05);
    return;
  }
  beep(58,.18,.65,0,'sine');           // low thud
  _noise(.32,1300,1.1,.28,.01);        // metal crunch
  _noise(.18,4200,3.5,.35,.06);        // glass scatter
}

// Brake squeal — sample-prefer met procedurele fallback. Triggert vanuit
// gameplay (physics.js) wanneer er hard wordt geremd op snelheid.
function playBrakeSound(){
  if(_playSampleOneShot('brake', 0.45))return;
  // Korte gefilterde noise-burst — high-Q bandpass = squeal-feel.
  _noise(.18, 2200, 6, .12);
  _noise(.12, 3400, 4, .08, .04);
}

function playVictoryFanfare(){
  if(!audioCtx)return;
  // 5-note ascending fanfare — triumphant major
  [[523,.55,.28],[659,.55,.26],[784,.55,.24],[1047,.7,.22],[1319,.9,.20]].forEach(([f,d,v],i)=>{
    setTimeout(()=>{beep(f,d,v,0,'sine');beep(f*2,d*.6,v*.35,0,'sine');},i*155);
  });
  // Final chord stab — clean sine waves only
  setTimeout(()=>{[523,659,784,1047].forEach(f=>beep(f,1.4,.13,0,'sine'));},860);
  // Warm pad: sine oscillators (replaces harsh sawtooth)
  if(audioCtx){
    const t=audioCtx.currentTime+.90;
    [261,329,392,523].forEach(f=>{
      const o=audioCtx.createOscillator(),g=audioCtx.createGain();
      o.type='sine';o.frequency.value=f;
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.08,t+.22);
      g.gain.exponentialRampToValueAtTime(.001,t+2.4);
      o.connect(g);g.connect(_dst());o.start(t);o.stop(t+2.5);
    });
  }
}

function playCountBeep(n){
  if(n>0){
    // Single clean tone per light — no delayed second hit
    beep(490,.20,.50,0,'sine');
    beep(980,.08,.15,0,'sine'); // same timing, softer harmonic (sine not square)
  }else{
    [523.3,659.3,784.0].forEach((f,i)=>beep(f,.48,.42,i*.055,'square'));
    [523.3,659.3,784.0].forEach((f,i)=>beep(f*2,.24,.18,.3+i*.055,'sine'));
  }
}

function playFanfare(){
  const n=[523.3,659.3,784.0,1046.5];
  n.forEach((f,i)=>{beep(f,.4,.44,i*.22,'square');beep(f,.32,.2,i*.22+.16,'sine');});
  n.forEach(f=>beep(f,.75,.32,.96,'triangle'));
}

function playRecoverySound(){
  [195,160,128].forEach((f,i)=>beep(f,.24,.24,i*.11,'sine'));_noise(.3,275,2,.18);
}

function playCollectSound(){
  // Pentatonic chime
  [523,659,784,1047].forEach((f,i)=>beep(f,.22,.35,i*.07,'sine'));
}

// Short engine rev burst — used in the selection screen when the player
// switches cars. Per-type tone: F1 high & sharp, super medium-high, muscle
// low growl, electric soft whoosh. ~0.5s total.
function playEngineRev(carType){
  if(!audioCtx)return;
  const t = audioCtx.currentTime;
  const cfg = {
    f1:       {fStart:120, fPeak:520, cutoff:1800, gain:.20, len:.42, wave:'sawtooth', noiseQ:2.5, noiseG:.06},
    super:    {fStart:90,  fPeak:380, cutoff:1300, gain:.22, len:.50, wave:'sawtooth', noiseQ:2.0, noiseG:.05},
    muscle:   {fStart:55,  fPeak:200, cutoff:700,  gain:.28, len:.62, wave:'sawtooth', noiseQ:1.6, noiseG:.07},
    electric: {fStart:300, fPeak:1100,cutoff:2400, gain:.14, len:.40, wave:'sine',     noiseQ:0.8, noiseG:.02}
  }[carType] || {fStart:90, fPeak:380, cutoff:1300, gain:.22, len:.50, wave:'sawtooth', noiseQ:2.0, noiseG:.05};
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  const lp = audioCtx.createBiquadFilter();
  o.type = cfg.wave;
  lp.type = 'lowpass';
  lp.frequency.value = cfg.cutoff;
  // Throttle blip: rapid rise to peak, then slow decel back near idle.
  o.frequency.setValueAtTime(cfg.fStart, t);
  o.frequency.exponentialRampToValueAtTime(cfg.fPeak, t + cfg.len * 0.30);
  o.frequency.exponentialRampToValueAtTime(cfg.fStart * 1.25, t + cfg.len);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(cfg.gain, t + 0.04);
  g.gain.exponentialRampToValueAtTime(0.001, t + cfg.len);
  o.connect(lp); lp.connect(g); g.connect(_dst());
  o.start(t); o.stop(t + cfg.len + 0.05);
  // Combustion grit noise layer (skipped for electric).
  if(carType !== 'electric'){
    _noise(cfg.len * 0.7, cfg.fPeak * 1.6, cfg.noiseQ, cfg.noiseG);
  }
}
