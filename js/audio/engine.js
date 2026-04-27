// js/audio/engine.js — Fase 2.3/2.4 extraction. Non-module script.
//
// SURFACE-AWARE TIRE: tire-rolling noise loop wordt per oppervlakte
// gefilterd zodat asphalt/sand/ice/metal/water elk eigen karakter
// hebben. Surface komt uit window._getCurrentSurface() (samples.js,
// per-wereld default in WORLD_DEFAULT_SURFACE). Toekomstige sample-
// based tire kan via window._getSurfaceBuffer() ingehaakt worden;
// markered met "// SAMPLES DISPATCH POINT" hieronder.

// Per-surface tire-rolling parameters: noise filter freq + Q + gain-mult.
// Gekozen op gehoor — sand = laag/breed (rommelig), ice = hoog/sparse,
// water = mid/laag-Q (vlot), metal = mid/hoog-Q (zingt mee), dirt =
// asphalt + lager center.
const SURFACE_PARAMS = {
  asphalt: { freqBase: 200, freqScale: 180, Q: 2.0, gain: 0.025 },
  sand:    { freqBase: 140, freqScale: 100, Q: 0.7, gain: 0.045 },
  ice:     { freqBase: 320, freqScale: 240, Q: 1.2, gain: 0.018 },
  water:   { freqBase: 180, freqScale: 140, Q: 0.9, gain: 0.038 },
  metal:   { freqBase: 240, freqScale: 220, Q: 4.5, gain: 0.022 },
  dirt:    { freqBase: 160, freqScale: 130, Q: 1.4, gain: 0.034 },
};


function initAudio(){
  if(audioCtx)return;
  audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  _master=audioCtx.createDynamicsCompressor();
  _master.threshold.value=-16;_master.knee.value=10;
  _master.ratio.value=4;_master.attack.value=0.003;_master.release.value=0.12;
  _muteGain=audioCtx.createGain();_muteGain.gain.value=1;
  _master.connect(_muteGain);_muteGain.connect(audioCtx.destination);
  // iOS audio unlock — play silent WebAudio buffer + kick HTMLAudio primer
  try{
    const buf=audioCtx.createBuffer(1,1,22050);
    const src=audioCtx.createBufferSource();
    src.buffer=buf;src.connect(audioCtx.destination);src.start(0);
  }catch(_){}
  // HTMLAudio primer forces Safari into playback audio session (beats silent switch)
  try{
    const prim=document.getElementById('iosAudioUnlock');
    if(prim){prim.muted=false;prim.volume=0.001;const p=prim.play();if(p&&p.catch)p.catch(()=>{});}
  }catch(_){}
  if(audioCtx.state==='suspended'){audioCtx.resume().catch(()=>{});}
}

function _ensureAudio(){
  if(!audioCtx)return;
  if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
  const prim=document.getElementById('iosAudioUnlock');
  if(prim&&prim.paused){try{const p=prim.play();if(p&&p.catch)p.catch(()=>{});}catch(_){}}
}

function _dst(){return _master||audioCtx.destination;}


function initEngine(){
  if(engineOsc)return;
  const ctx=audioCtx;
  const o1=ctx.createOscillator(),o2=ctx.createOscillator(),o3=ctx.createOscillator(),o4=ctx.createOscillator();
  o1.type='sawtooth';o2.type='square';o3.type='sine';o4.type='sine';
  o1.frequency.value=80;o2.frequency.value=160;o3.frequency.value=240;o4.frequency.value=40;
  const filt=ctx.createBiquadFilter();filt.type='lowpass';filt.frequency.value=600;filt.Q.value=3;
  const g1=ctx.createGain(),g2=ctx.createGain(),g3=ctx.createGain(),g4=ctx.createGain();
  g1.gain.value=.08;g2.gain.value=.035;g3.gain.value=.018;g4.gain.value=.015;
  const master=ctx.createGain();master.gain.value=0;
  o1.connect(g1);o2.connect(g2);o3.connect(g3);o4.connect(g4);
  g1.connect(filt);g2.connect(filt);g3.connect(filt);g4.connect(filt);
  filt.connect(master);master.connect(_dst());
  o1.start();o2.start();o3.start();o4.start();
  engineOsc=o1;engineOsc._o2=o2;engineOsc._o3=o3;engineOsc._o4=o4;engineOsc._filt=filt;
  engineGain=master;
  // Tire rolling — continuous filtered noise
  const rSz=ctx.sampleRate*2,rBuf=ctx.createBuffer(1,rSz,ctx.sampleRate);
  const rD=rBuf.getChannelData(0);for(let i=0;i<rSz;i++)rD[i]=Math.random()*2-1;
  const rSrc=ctx.createBufferSource();rSrc.buffer=rBuf;rSrc.loop=true;
  const rFilt=ctx.createBiquadFilter();rFilt.type='bandpass';rFilt.frequency.value=200;rFilt.Q.value=2;
  const rGain=ctx.createGain();rGain.gain.value=0;
  rSrc.connect(rFilt);rFilt.connect(rGain);rGain.connect(_dst());rSrc.start();
  _rollGain=rGain;_rollSrc=rSrc;_rollFilt=rFilt;
}


function updateEngine(spd){
  if(!audioCtx)return;
  if(!engineOsc)initEngine();
  const abs=Math.abs(spd);
  const car=carObjs[playerIdx];
  const max=car?car.def.topSpd:1.8;
  const carType=car?car.def.type:'super';
  // Per-type frequency multiplier: F1 screams, muscle deep, electric silent
  const typeFreqM=carType==='f1'?1.55:carType==='muscle'?0.72:carType==='electric'?0.3:1.0;
  const typeGainM=carType==='electric'?0.12:carType==='muscle'?1.35:carType==='f1'?1.15:1.0;
  const ratio=Math.min(1,abs/max);
  const gear=Math.min(5,Math.floor(ratio*5)+1);
  _currentGear=gear;
  const inGear=ratio*5-(gear-1);
  const rpm=700+inGear*4200;
  const base=(rpm/60*1.2)*typeFreqM;
  const t=audioCtx.currentTime;
  const isBoost=nitroActive||(car&&car.boostTimer>0);
  engineOsc.frequency.setTargetAtTime(base*(isBoost?1.06:1),t,.035);
  engineOsc._o2.frequency.setTargetAtTime(base*2*(isBoost?1.04:1),t,.035);
  engineOsc._o3.frequency.setTargetAtTime(base*3,t,.035);
  if(engineOsc._o4)engineOsc._o4.frequency.setTargetAtTime(35+ratio*45,t,.06);
  // F1: open filter for screaming tone; muscle: tight lowpass for burble
  const filtFreq=carType==='f1'?(600+inGear*4500):carType==='muscle'?(180+inGear*1400):(isBoost?(500+inGear*3200):(280+inGear*2400));
  engineOsc._filt.frequency.setTargetAtTime(filtFreq,t,.05);
  engineGain.gain.setTargetAtTime(abs>.01?(isBoost?(.12+ratio*.07)*typeGainM:(.09+ratio*.05)*typeGainM):.022*typeGainM,t,.08);
  // Electric: add high-pitch whirr instead of roar
  if(carType==='electric'&&engineOsc._o3){
    engineOsc._o3.frequency.setTargetAtTime(800+ratio*3200,t,.05);
  }
  if(_rollGain){
    // SAMPLES DISPATCH POINT: hier checken voor surface-sample buffer.
    // Wanneer assets/audio/surface/<surface>.ogg bestaat kan je een
    // looping AudioBufferSourceNode maken en _rollGain vervangen.
    const surface = (window._getCurrentSurface ? window._getCurrentSurface() : 'asphalt');
    const sp = SURFACE_PARAMS[surface] || SURFACE_PARAMS.asphalt;
    _rollGain.gain.setTargetAtTime(abs * sp.gain, t, .1);
    if(_rollFilt){
      _rollFilt.frequency.setTargetAtTime(sp.freqBase + abs * sp.freqScale, t, .1);
      _rollFilt.Q.setTargetAtTime(sp.Q, t, .15);
    }
  }
  if(gear!==_lastGear&&abs>.3){
    const up=gear>_lastGear,o=audioCtx.createOscillator(),g=audioCtx.createGain();
    // F1 gear shift: rapid chirp; muscle: loud pop; other: normal blip
    o.type=carType==='muscle'?'sawtooth':'sawtooth';
    const chirpF=carType==='f1'?480:carType==='muscle'?120:290;
    o.frequency.setValueAtTime(up?chirpF:chirpF*.7,t);
    o.frequency.exponentialRampToValueAtTime(up?chirpF*.65:chirpF*.95,t+(carType==='f1'?.05:.09));
    const chirpV=carType==='muscle'?.11:carType==='f1'?.055:.065;
    g.gain.setValueAtTime(chirpV,t);g.gain.exponentialRampToValueAtTime(.001,t+(carType==='f1'?.07:.13));
    o.connect(g);g.connect(_dst());o.start(t);o.stop(t+(carType==='f1'?.08:.15));
    _lastGear=gear;
  }
}

