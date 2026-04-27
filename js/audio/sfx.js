// js/audio/sfx.js — Fase 2.3/2.4 extraction. Non-module script.
//
// Dispatch-laag: elke functie checkt eerst of er een sample voor dit
// effect geladen is (via window._hasSFXSample uit samples.js). Zo ja →
// sample. Zo nee → procedurele synth-fallback. Geen gameplay-koppeling
// die breekt als samples ontbreken.


// One-shot sample player. slots = string of array; bij array random pick
// (variatie voor bv. drift/screech). Returnt false als geen sample geladen.
function _playSampleOneShot(slots, vol=0.6, delay=0){
  if(!audioCtx||!window._hasSFXSample||!window._getSFXBuffer)return false;
  const list = Array.isArray(slots) ? slots : [slots];
  const available = list.filter(s => window._hasSFXSample(s));
  if(available.length === 0) return false;
  const slot = available[Math.floor(Math.random() * available.length)];
  const buf = window._getSFXBuffer(slot);
  if(!buf) return false;
  const t = audioCtx.currentTime + delay;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const g = audioCtx.createGain();
  g.gain.value = vol;
  src.connect(g); g.connect(_dst());
  src.start(t);
  return true;
}


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

// Brake squeal — nieuw, sample-prefer met procedurele fallback. Triggert
// vanuit gameplay-laag wanneer er hard wordt geremd op snelheid.
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
