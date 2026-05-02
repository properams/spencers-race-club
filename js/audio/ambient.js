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

function initCrowdNoise(){
  if(!audioCtx||_crowdGain)return;
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

function playCrowdCheer(){
  if(!audioCtx)return;
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

