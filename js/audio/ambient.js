// js/audio/ambient.js — Fase 2.3/2.4 extraction. Non-module script.
//
// Dispatch-laag: thunder/crowd-cheer/crowd-loop/wind-loop checken eerst
// of een sample-buffer geladen is via window._hasAmbientSample (uit
// samples.js). Zo ja → sample. Zo nee → procedurele fallback.


// Ambient shorthand — gebruikt _playBufferOneShot uit sfx.js (zelfde script-scope).
function _playAmbientOneShot(slots, vol=0.6, delay=0){
  return _playBufferOneShot(window._hasAmbientSample,window._getAmbientBuffer,slots,vol,delay);
}

'use strict';

// Ambient audio refs (uit main.js verhuisd). Gevuld door initCrowdNoise()
// en startAmbientWind() hieronder; lazy-init op race-start, gestopt bij
// race-end in gameplay/finish.js. Cross-script: ui/hud.js + tracklimits.js
// + finish.js doen _crowdGain.gain.setTargetAtTime(...) bij overtake/finish.
// effects/night.js update _ambientWindGain volume per dag↔nacht-fase.
let _ambientWind=null,_ambientWindGain=null;
let _crowdSrc=null,_crowdGain=null;

function playThunder(){
  if(!audioCtx)return;
  // Sample-pad: random pick uit thunder1/2/3 met willekeurige delay zodat
  // de procedurele variatie behouden blijft.
  const delay=.4+Math.random()*1.8;
  if(_playAmbientOneShot(['thunder1','thunder2','thunder3'],0.5,delay))return;
  const t=audioCtx.currentTime+delay;
  const sz=Math.ceil(audioCtx.sampleRate*2.8);
  const buf=audioCtx.createBuffer(1,sz,audioCtx.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
  const src=audioCtx.createBufferSource();src.buffer=buf;
  const f=audioCtx.createBiquadFilter();f.type='lowpass';f.frequency.value=110;f.Q.value=.4;
  const g=audioCtx.createGain();
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.42,t+.06);
  g.gain.setValueAtTime(.42,t+.32);g.gain.exponentialRampToValueAtTime(.001,t+2.6);
  src.connect(f);f.connect(g);g.connect(_dst());src.start(t);src.stop(t+2.8);
  beep(75,.08,.62,delay,'sawtooth');_noise(.1,240,2,.38,delay+.01);
}

function updateThunder(dt){
  if(!isRain||!audioCtx)return;
  _thunderTimer-=dt;
  if(_thunderTimer<=0){Audio.playThunder();_thunderTimer=9+Math.random()*20;}
}

// World-aware crowd-audio gate: returns true if the active world has any
// visible spectators (registered via _crowdMaterials in track/collectibles
// or in worlds/themepark.js). Worlds without spectators (currently GP) get
// no ambient crowd-loop and no per-event cheers — silence matches the
// visual scene.
function _hasVisibleCrowd(){
  return typeof _crowdMaterials!=='undefined' && _crowdMaterials.length>0;
}

function initCrowdNoise(){
  if(!audioCtx||_crowdGain)return;
  if(!_hasVisibleCrowd())return; // skip: no spectators in this world
  // Sample-pad: gebruik crowdLoop buffer als geladen (en niet force-procedural).
  if(!window._forceProceduralAudio&&window._hasAmbientSample&&window._hasAmbientSample('crowdLoop')){
    const buf=window._getAmbientBuffer('crowdLoop');
    if(buf){
      const src=audioCtx.createBufferSource();src.buffer=buf;src.loop=true;
      _crowdGain=audioCtx.createGain();_crowdGain.gain.value=0;
      src.connect(_crowdGain);_crowdGain.connect(_dst());
      src.start();_crowdSrc=src;
      return;
    }
  }
  // Procedurele fallback: dual-bandpass noise loop.
  const sz=Math.ceil(audioCtx.sampleRate*3.2);
  const buf=audioCtx.createBuffer(1,sz,audioCtx.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
  const src=audioCtx.createBufferSource();src.buffer=buf;src.loop=true;
  const f1=audioCtx.createBiquadFilter();f1.type='bandpass';f1.frequency.value=580;f1.Q.value=1.4;
  const f2=audioCtx.createBiquadFilter();f2.type='bandpass';f2.frequency.value=950;f2.Q.value=.9;
  _crowdGain=audioCtx.createGain();_crowdGain.gain.value=0;
  src.connect(f1);src.connect(f2);f1.connect(_crowdGain);f2.connect(_crowdGain);_crowdGain.connect(_dst());
  src.start();_crowdSrc=src;
}

function stopCrowdNoise(){
  if(_crowdGain){const t=audioCtx.currentTime;_crowdGain.gain.setTargetAtTime(0,t,.3);}
  const ref=_crowdSrc;setTimeout(()=>{try{ref&&ref.stop();}catch(e){}},800);
  _crowdSrc=null;_crowdGain=null;
}

function updateCrowdNoise(pPos){
  if(!_crowdGain||!audioCtx)return;
  const target=pPos===1?.062:pPos<=3?.036:.016;
  _crowdGain.gain.setTargetAtTime(target,audioCtx.currentTime,.9);
}


function startAmbientWind(){
  if(!audioCtx||_ambientWind)return;
  // Sample-pad: gebruik windLoop buffer als geladen.
  if(!window._forceProceduralAudio&&window._hasAmbientSample&&window._hasAmbientSample('windLoop')){
    const buf=window._getAmbientBuffer('windLoop');
    if(buf){
      const src=audioCtx.createBufferSource();src.buffer=buf;src.loop=true;
      const g=audioCtx.createGain();g.gain.value=0;
      src.connect(g);g.connect(_dst());src.start();
      // 2026-05-02: initial gain blijft op 0 — updateAmbientWindSpeed
      // (effects/night.js) gate't gain op speed-ratio >= 65%. Voorheen:
      // ramp naar 0.038 die hoorbaar was tijdens countdown/stilstand.
      const t=audioCtx.currentTime;g.gain.setValueAtTime(0,t);
      _ambientWind=src;_ambientWindGain=g;
      return;
    }
  }
  // Procedurele fallback: bandpass + highpass filter chain
  const sz=audioCtx.sampleRate*2;
  const buf=audioCtx.createBuffer(1,sz,audioCtx.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
  const src=audioCtx.createBufferSource();src.buffer=buf;src.loop=true;
  const f1=audioCtx.createBiquadFilter();f1.type='bandpass';f1.frequency.value=280;f1.Q.value=.25;
  const f2=audioCtx.createBiquadFilter();f2.type='highpass';f2.frequency.value=100;f2.Q.value=.1;
  const g=audioCtx.createGain();g.gain.value=0;
  src.connect(f1);f1.connect(f2);f2.connect(g);g.connect(_dst());
  src.start();
  // 2026-05-02: initial gain blijft op 0 — updateAmbientWindSpeed
  // (effects/night.js) gate't gain op speed-ratio >= 65%. Voorheen:
  // ramp naar 0.038 die hoorbaar was tijdens countdown/stilstand.
  const t=audioCtx.currentTime;g.gain.setValueAtTime(0,t);
  _ambientWind=src;_ambientWindGain=g;
}

function stopAmbientWind(){
  if(!_ambientWind)return;
  if(_ambientWindGain){
    const t=audioCtx.currentTime;
    _ambientWindGain.gain.setTargetAtTime(0,t,.4);
  }
  const ref=_ambientWind;
  setTimeout(()=>{try{ref.stop();}catch(e){}},1200);
  _ambientWind=null;_ambientWindGain=null;
}

// ── Sandstorm wind ambient ──────────────────────────────────────────────
// Two-band noise loop driven by the rolling sandstorm hazard:
//   • lowpass branch — deep wind rumble (the "weight" of the storm)
//   • bandpass branch — high sand-sizzle (sand grains hitting metal)
// Both feed a master gain modulated by `updateSandstormWind(intensity)`,
// where intensity is the lap-driven 0..1 blend from the hazard module.
//
// `_gen` counter follows the same race-condition pattern as RaceMusic:
// each (re)init increments _gen so a stale stop() callback can't tear
// down the freshly-built nodes after a quick stop→start cycle.
let _sandstormWind=null;     // {srcLow, srcBand, gainLow, gainBand, master, _gen}
let _sandstormWindGen=0;
const _SANDSTORM_WIND_RAMP=0.25;  // master-gain ramp in seconds

function _ssCreateNoiseSrc(durSec){
  const sz=Math.ceil(audioCtx.sampleRate*durSec);
  const buf=audioCtx.createBuffer(1,sz,audioCtx.sampleRate);
  const d=buf.getChannelData(0);
  for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
  const src=audioCtx.createBufferSource();
  src.buffer=buf;src.loop=true;
  return src;
}

function initSandstormWind(){
  if(!audioCtx)return;
  if(_sandstormWind)return; // idempotent — already running
  const gen=++_sandstormWindGen;
  // Lowpass rumble branch (deep wind)
  const srcLow=_ssCreateNoiseSrc(2.4);
  const lp=audioCtx.createBiquadFilter();
  lp.type='lowpass';lp.frequency.value=180;lp.Q.value=0.4;
  const gainLow=audioCtx.createGain();
  gainLow.gain.value=0.55;
  // Bandpass sand-sizzle branch (high frequencies)
  const srcBand=_ssCreateNoiseSrc(2.8);
  const bp=audioCtx.createBiquadFilter();
  bp.type='bandpass';bp.frequency.value=2400;bp.Q.value=1.2;
  const gainBand=audioCtx.createGain();
  gainBand.gain.value=0.35;
  // Master gain — modulated by updateSandstormWind() per-frame from hazard.
  const master=audioCtx.createGain();
  master.gain.value=0;
  srcLow.connect(lp);lp.connect(gainLow);gainLow.connect(master);
  srcBand.connect(bp);bp.connect(gainBand);gainBand.connect(master);
  master.connect(_dst());
  // Stagger source-starts by a few ms so the noise doesn't phase-align
  // (would produce a faint comb-filter coloration at higher gain).
  const t=audioCtx.currentTime;
  srcLow.start(t);
  srcBand.start(t+0.03);
  _sandstormWind={srcLow,srcBand,gainLow,gainBand,lp,bp,master,_gen:gen};
}

function updateSandstormWind(intensity){
  if(!audioCtx)return;
  if(!_sandstormWind)initSandstormWind();
  if(!_sandstormWind)return;
  const v=Math.max(0,Math.min(1,+intensity||0));
  const t=audioCtx.currentTime;
  // Master gain follows intensity smoothly. setTargetAtTime gives a clean
  // exponential approach without glitching when the value is re-issued.
  try{
    _sandstormWind.master.gain.setTargetAtTime(v*0.45,t,_SANDSTORM_WIND_RAMP);
    // Filter-cutoff sweep: quiet storm = duller (lower lowpass cutoff,
    // tighter bandpass), full storm = brighter (more sand sizzle).
    _sandstormWind.lp.frequency.setTargetAtTime(160+v*240,t,_SANDSTORM_WIND_RAMP);
    _sandstormWind.bp.frequency.setTargetAtTime(2200+v*900,t,_SANDSTORM_WIND_RAMP);
  }catch(_){}
}

function stopSandstormWind(){
  if(!_sandstormWind)return;
  const ref=_sandstormWind;
  // Increment gen first so any pending in-flight init/update can't read
  // a stale ref after the disconnect.
  _sandstormWindGen++;
  _sandstormWind=null;
  if(audioCtx){
    const t=audioCtx.currentTime;
    try{ref.master.gain.cancelScheduledValues(t);
        ref.master.gain.setTargetAtTime(0,t,0.30);}catch(_){}
  }
  // Hard-stop the buffer sources after the fade so the WebAudio graph
  // releases them. setTimeout is the standard pattern in this codebase
  // (see startAmbientWind / playThunder).
  setTimeout(()=>{
    try{ref.srcLow.stop();}catch(_){}
    try{ref.srcBand.stop();}catch(_){}
    try{ref.master.disconnect();}catch(_){}
    try{ref.gainLow.disconnect();}catch(_){}
    try{ref.gainBand.disconnect();}catch(_){}
    try{ref.lp.disconnect();}catch(_){}
    try{ref.bp.disconnect();}catch(_){}
  },800);
}

function playCrowdCheer(){
  if(!audioCtx)return;
  if(!_hasVisibleCrowd())return; // skip: no spectators in this world
  if(_playAmbientOneShot('crowdCheer',0.65))return;
  const sz=Math.ceil(audioCtx.sampleRate*.55);
  const buf=audioCtx.createBuffer(1,sz,audioCtx.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
  const src=audioCtx.createBufferSource();src.buffer=buf;
  const f=audioCtx.createBiquadFilter();f.type='bandpass';f.frequency.value=750;f.Q.value=1.8;
  const g=audioCtx.createGain();
  const t=audioCtx.currentTime;
  g.gain.setValueAtTime(.0,t);g.gain.linearRampToValueAtTime(.14,t+.08);
  g.gain.setValueAtTime(.14,t+.22);g.gain.exponentialRampToValueAtTime(.001,t+.58);
  src.connect(f);f.connect(g);g.connect(_dst());src.start(t);src.stop(t+.62);
  [550,850,1300,1800].forEach((freq,i)=>{
    const o=audioCtx.createOscillator(),og=audioCtx.createGain();
    o.type='sine';
    o.frequency.setValueAtTime(freq*.75,t+i*.045);
    o.frequency.exponentialRampToValueAtTime(freq*1.35,t+i*.045+.22);
    og.gain.setValueAtTime(.025,t+i*.045);og.gain.exponentialRampToValueAtTime(.001,t+i*.045+.28);
    o.connect(og);og.connect(_dst());o.start(t+i*.045);o.stop(t+i*.045+.32);
  });
}

