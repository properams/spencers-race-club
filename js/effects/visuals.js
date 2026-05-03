// js/effects/visuals.js — non-module script.

'use strict';

// RPM-bar constants + state (uit main.js verhuisd) — gebruikt door updateRpmBar.
const _RPM_GRAD_REDLINE='linear-gradient(180deg,#ff0000,#ff4400)';
const _RPM_GRAD_NORMAL='linear-gradient(180deg,#00cc88,#00ff99)';
const _RPM_GEAR_RANGES=[0,.18,.36,.54,.72,.9];
let _lastRedline=null;

// Speed-lines canvas state (uit main.js verhuisd). Lazy-init in initSpeedLines,
// fade/redraw timers gemanaged in updateSpeedLines hieronder. Reset in race.js.
let _speedLinesCvs=null,_speedLinesCtx=null;
let _speedLinesFadeT=0,_speedLinesRedrawT=0;

// Rev-limiter audio-trigger throttle (gebruikt in updateRpmBar / playRevLimiter).
let _revLimiterTimer=0;

// Float-text stagger (uit main.js verhuisd). _floatSlot rolt 0..5 zodat
// 6 popups verticaal stacken; reset wanneer _floatSlotTimer naar 0 zakt.
// Decay-tick gebeurt in core/loop.js (per dt -1.6s per cyclus).
let _floatSlot=0,_floatSlotTimer=0;

function updateSpeedOverlay(){
  const car=carObjs[playerIdx];
  const ov=document.getElementById('speedOverlay');if(!ov||!car)return;
  const spd=Math.abs(car.speed);
  const maxSpd=car.def.topSpd*(car.boostTimer>0?1.55:1)*(nitroActive?1.42:1);
  const t=Math.max(0,(spd/maxSpd-.5)/.5); // kicks in at 50% of top speed
  ov.style.opacity=String(Math.min(1,t*.9));
}


function updateBoostArrows(){
  const t=_nowSec;
  boostPads.forEach((pad,pi)=>{
    if(!pad.arrows)return;
    pad.arrows.forEach(arr=>{
      // Each ring floats upward and fades — offset phase creates cascading effect
      const phase=((t*0.9+arr._phase))%1;
      const rise=phase*3.2; // ring floats up 3.2 units over its cycle
      arr.material.opacity=Math.sin(phase*Math.PI)*0.75;
      arr.position.y=arr._baseY+rise;
      // Subtle scale pulse (slightly bigger as they rise)
      const sc=0.85+phase*0.30;
      arr.scale.set(sc,1,sc);
    });
    // Animate point light intensity
    if(pad.light){
      const pulse=0.5+0.5*Math.sin(t*3.2+pi*1.4);
      pad.light.intensity=1.4+pulse*1.4;
    }
  });
}


function updateSlipstreamVisuals(){
  carObjs.forEach((car,i)=>{
    if(i===playerIdx||!car.mesh||car.finished)return;
    if(Math.abs(car.speed)>car.def.topSpd*.6&&Math.random()>.74){
      _aiFwdRV.set(0,0,1).applyQuaternion(car.mesh.quaternion); // backward = +Z
      // Pale blue exhaust shimmer — subtle, low emission rate
      sparkSystem.emit(
        car.mesh.position.x+_aiFwdRV.x*1.6,car.mesh.position.y+.18,car.mesh.position.z+_aiFwdRV.z*1.6,
        _aiFwdRV.x*.05+(Math.random()-.5)*.015,.006+Math.random()*.012,_aiFwdRV.z*.05+(Math.random()-.5)*.015,
        1,.14,.44,.88,.38);
    }
  });
}


function initSpeedLines(){
  _speedLinesCvs=document.getElementById('speedLines');
  if(!_speedLinesCvs)return;
  _speedLinesCvs.width=innerWidth;_speedLinesCvs.height=innerHeight;
  _speedLinesCtx=_speedLinesCvs.getContext('2d');
  _drawSpeedLines();
  window.addEventListener('resize',()=>{
    if(_speedLinesCvs){_speedLinesCvs.width=innerWidth;_speedLinesCvs.height=innerHeight;_drawSpeedLines();}
  });
}

function _drawSpeedLines(){
  if(!_speedLinesCtx)return;
  const ctx=_speedLinesCtx,w=_speedLinesCvs.width,h=_speedLinesCvs.height;
  const cx=w/2,cy=h/2,R=Math.max(w,h)*.65;
  ctx.clearRect(0,0,w,h);
  for(let i=0;i<88;i++){
    const a=i/88*Math.PI*2;
    const inner=(.08+Math.random()*.04)*R;
    const outer=inner+(0.07+Math.random()*.22)*R;
    ctx.lineWidth=.4+Math.random()*1.6;
    ctx.globalAlpha=.08+Math.random()*.28;
    ctx.strokeStyle=`hsl(${200+Math.random()*40},75%,82%)`;
    ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*inner,cy+Math.sin(a)*inner);
    ctx.lineTo(cx+Math.cos(a)*outer,cy+Math.sin(a)*outer);ctx.stroke();
  }
}

function updateSpeedLines(){
  if(!_speedLinesCvs)return;
  const car=carObjs[playerIdx];
  if(!car||gameState!=='RACE'){_speedLinesCvs.style.opacity='0';_speedLinesFadeT=0;return;}
  const dt2=1/60;
  // Subtle speed-lines verschijnen al bij high-speed (ratio>0.82) — niet alleen
  // tijdens nitro. Sterker effect bij nitro maar nog steeds subtiel: peak
  // opacity laag genoeg dat ze niet door de scene heen "snijden".
  const ratio=Math.abs(car.speed)/Math.max(.01,car.def.topSpd);
  const highSpeed=ratio>0.82;
  if(nitroActive||highSpeed){
    _speedLinesFadeT=0.3;
    _speedLinesRedrawT-=dt2;
    if(_speedLinesRedrawT<=0){_drawSpeedLines();_speedLinesRedrawT=nitroActive?0.45:0.85;}
    const baseOp=nitroActive?0.30:Math.max(0,(ratio-0.82)/0.18)*0.14;
    _speedLinesCvs.style.opacity=baseOp.toFixed(3);
  }else{
    _speedLinesFadeT=Math.max(0,_speedLinesFadeT-dt2);
    _speedLinesCvs.style.opacity=(_speedLinesFadeT/0.3*0.28).toFixed(3);
  }
}


function initDriftVisuals(){
  _driftBarEl=document.getElementById('driftBar');
  _driftBarFill=document.getElementById('driftBarFill');
  _driftLabelEl=document.getElementById('driftLabel');
}

function updateDriftVisuals(dt){
  const car=carObjs[playerIdx];if(!car)return;
  if(driftTimer>0.2){
    if(_driftBarEl)_driftBarEl.style.display='block';
    if(_driftLabelEl)_driftLabelEl.style.display='block';
    const fill=Math.min(1,driftTimer/4)*100;
    if(_driftBarFill)_driftBarFill.style.width=fill+'%';
    // Drift smoke from rear tires
    if(Math.abs(car.speed)>.6&&Math.random()<.55){
      const fwd=_camV1.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
      const rt=_camV2.set(1,0,0).applyQuaternion(car.mesh.quaternion);
      [-0.82,0.82].forEach(s=>{
        const tx=car.mesh.position.x+fwd.x*.7+rt.x*s;
        const ty=car.mesh.position.y+.12;
        const tz=car.mesh.position.z+fwd.z*.7+rt.z*s;
        exhaustSystem.emit(tx,ty,tz,(Math.random()-.5)*.025,.006+Math.random()*.014,(Math.random()-.5)*.025,
          1,.34,.34,.34,.8);
      });
    }
  }else{
    if(_driftBarEl)_driftBarEl.style.display='none';
    if(_driftLabelEl)_driftLabelEl.style.display='none';
  }
}


function updateNitroVisual(){
  if(!nitroActive)return;
  const car=carObjs[playerIdx];if(!car)return;
  const rt=_camV1.set(1,0,0).applyQuaternion(car.mesh.quaternion);
  const fwd=_camV2.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
  [-1,1].forEach(side=>{
    if(Math.random()>.45)return;
    const sx=car.mesh.position.x+rt.x*side*1.15+fwd.x*.8;
    const sy=car.mesh.position.y+.35+Math.random()*.2;
    const sz=car.mesh.position.z+rt.z*side*1.15+fwd.z*.8;
    sparkSystem.emit(sx,sy,sz,rt.x*side*.09+(Math.random()-.5)*.03,.018+Math.random()*.04,rt.z*side*.09+(Math.random()-.5)*.03,
      1,.25,.55,1.0,.95);
  });
  // Extra rear exhaust flare
  if(Math.random()>.7){
    sparkSystem.emit(
      car.mesh.position.x+fwd.x*1.6,car.mesh.position.y+.28,car.mesh.position.z+fwd.z*1.6,
      fwd.x*.06,.02,fwd.z*.06,2,.9,.5,.1,.8);
  }
}


function updateBoostTrail(){
  // Continuous speed-trail achter de player op hoge snelheid + extra
  // dramatische streamers tijdens nitro/boost. Met bloom geven de hot
  // colors flink wat glow.
  const car=carObjs[playerIdx];if(!car)return;
  const top=Math.max(.01,car.def.topSpd);
  const ratio=Math.abs(car.speed)/top;
  // Per-world tire dust trail — kleine puffs bij de achterwielen, kleur en
  // emit-rate afhankelijk van ground-type. Actief bij ratio>0.30 zodat het
  // voelbaar is zodra je beweegt, en harder bij snelheid + drift.
  if(ratio>0.30){
    const tireCfg={
      arctic:   {r:0.92,g:0.96,b:1.00,size:1.0,life:0.55,rate:0.55}, // wit sneeuwspat
      deepsea:  {r:0.65,g:0.85,b:0.78,size:0.8,life:0.50,rate:0.40}, // groen silt
      volcano:  {r:1.00,g:0.55,b:0.20,size:0.9,life:0.45,rate:0.55}, // hete dust
      candy:    {r:1.00,g:0.70,b:0.90,size:0.85,life:0.50,rate:0.45}, // roze sprinkle
      themepark:{r:0.45,g:0.40,b:0.50,size:0.7,life:0.40,rate:0.35}, // grijs stof
      grandprix:{r:0.60,g:0.55,b:0.45,size:0.7,life:0.40,rate:0.40}, // bruin gras-stof
      neoncity: {r:0.70,g:0.85,b:1.00,size:0.6,life:0.35,rate:0.30}, // water-spray
      space:    {r:0.60,g:0.75,b:1.00,size:0.6,life:0.40,rate:0.30}  // ion
    }[activeWorld];
    if(tireCfg){
      const emitRate=tireCfg.rate*(0.4+ratio*0.7)*(driftTimer>0.2?1.6:1.0);
      if(Math.random()<emitRate){
        _plFwd.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
        _plRt.set(1,0,0).applyQuaternion(car.mesh.quaternion);
        [-0.78,0.78].forEach(s=>{
          const tx=car.mesh.position.x+_plFwd.x*0.9+_plRt.x*s;
          const ty=car.mesh.position.y+0.10+Math.random()*0.08;
          const tz=car.mesh.position.z+_plFwd.z*0.9+_plRt.z*s;
          // Velocity: subtle outward + slightly up
          const vx=_plRt.x*s*0.04+(Math.random()-.5)*0.03;
          const vy=0.018+Math.random()*0.022;
          const vz=_plRt.z*s*0.04+(Math.random()-.5)*0.03;
          // emit signature: (x,y,z,vx,vy,vz,n,r,g,b,life). n=1 per wheel per call;
      // size wordt door particle-system zelf afgeleid uit life-remaining.
      exhaustSystem.emit(tx,ty,tz,vx,vy,vz,1,tireCfg.r,tireCfg.g,tireCfg.b,tireCfg.life);
        });
      }
    }
  }
  if(ratio<0.55&&!nitroActive&&!car.boostTimer)return;
  // Wereld-thematische trail-kleur
  const tint={
    space:[.5,.7,1.0],deepsea:[.3,1.0,.85],candy:[1.0,.45,.85],
    neoncity:[.2,1.0,.95],volcano:[1.0,.45,.15],arctic:[.65,.85,1.0],
    themepark:[1.0,.50,.85],grandprix:[1.0,.55,.20]
  }[activeWorld]||[1.0,.65,.30];
  const fwd=_camV1.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
  const rt=_camV2.set(1,0,0).applyQuaternion(car.mesh.quaternion);
  // Base trail rate scales met ratio² (rate explodeert pas bij echte top-speed)
  const baseRate=ratio*ratio*0.55+(nitroActive?.45:0)+(car.boostTimer?.6:0);
  if(Math.random()<baseRate){
    [-0.55,0.55].forEach(s=>{
      const tx=car.mesh.position.x+fwd.x*1.7+rt.x*s;
      const ty=car.mesh.position.y+0.18+Math.random()*0.15;
      const tz=car.mesh.position.z+fwd.z*1.7+rt.z*s;
      // Kleine velocity NAAR ACHTEREN (tegengesteld aan car-fwd) voor trail-feel
      const vx=fwd.x*0.06+(Math.random()-.5)*0.04;
      const vy=0.012+Math.random()*0.018;
      const vz=fwd.z*0.06+(Math.random()-.5)*0.04;
      const life=0.55+Math.random()*0.35;
      // Hot colors tijdens nitro, anders subtler tint
      const hot=nitroActive||car.boostTimer;
      const r=hot?Math.min(1,tint[0]+0.25):tint[0]*0.85;
      const g=hot?Math.min(1,tint[1]+0.10):tint[1]*0.85;
      const b=hot?Math.min(1,tint[2]+0.05):tint[2]*0.85;
      // emit signature: (x,y,z,vx,vy,vz,n,r,g,b,life). 1 particle per wheel per frame.
      sparkSystem.emit(tx,ty,tz,vx,vy,vz,1,r,g,b,life);
    });
  }
  // Center streamer alleen tijdens echte boost (nitro / boost-pad)
  if((nitroActive||car.boostTimer)&&Math.random()<0.65){
    sparkSystem.emit(
      car.mesh.position.x+fwd.x*1.95,
      car.mesh.position.y+0.32,
      car.mesh.position.z+fwd.z*1.95,
      fwd.x*0.10+(Math.random()-.5)*0.02,0.025+Math.random()*0.020,fwd.z*0.10+(Math.random()-.5)*0.02,
      1,1.0,0.88,0.45,0.65
    );
  }
}


function updateCollisionFlash(dt){
  if(_contactPopupCD>0)_contactPopupCD-=dt;
  if(_colFlashT<=0)return;
  _colFlashT=Math.max(0,_colFlashT-dt);
  const el=document.getElementById('colFlash');
  if(el)el.style.opacity=String(Math.min(1,_colFlashT/.22));
}


// Hotspot #1 fix: scratch Vector3 hoist — voorheen per-emit allocation
// in updateDamageSmoke (~22 alloc/sec bij ≥6 hits, rest van de race).
const _dmgFwd = new THREE.Vector3();
function updateDamageSmoke(){
  const car=carObjs[playerIdx];if(!car||!car.hitCount)return;
  const hits=car.hitCount;
  if(hits<3)return;
  const rate=hits>=6?0.38:0.18; // heavier smoke at more damage
  if(Math.random()<rate){
    _dmgFwd.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
    exhaustSystem.emit(
      car.mesh.position.x-_dmgFwd.x*1.2,
      car.mesh.position.y+0.9,
      car.mesh.position.z-_dmgFwd.z*1.2,
      (Math.random()-.5)*.02,0.025+Math.random()*.02,(Math.random()-.5)*.02,
      1,0.28,0.28,0.28,0.5
    );
  }
}


function updateFastestLapFlash(dt){
  if(_fastestLapFlashT<=0)return;
  _fastestLapFlashT=Math.max(0,_fastestLapFlashT-dt);
  const el=_elFastestLapFlash;if(!el)return;
  // Pulsing purple flash that fades over 2.2s
  const base=_fastestLapFlashT/2.2;
  el.style.opacity=base*.7*(0.5+0.5*Math.sin(_nowSec*8));
}

function updateCloseBattle(dt){
  const car=carObjs[playerIdx];if(!car||!carObjs.length)return;
  const el=_elCloseBattle;if(!el)return;
  const px=car.mesh.position.x,pz=car.mesh.position.z;
  let close=false;
  for(let i=0;i<carObjs.length;i++){
    if(i===playerIdx)continue;
    const other=carObjs[i];if(other.finished)continue;
    const dx=px-other.mesh.position.x,dz=pz-other.mesh.position.z;
    if(dx*dx+dz*dz<64){close=true;break;}
  }
  if(close){
    _closeBattleTimer=Math.min(2,_closeBattleTimer+dt);
    if(_closeBattleTimer>.3&&el.style.display!=='block')el.style.display='block';
  }else{
    _closeBattleTimer=Math.max(0,_closeBattleTimer-dt*.5);
    if(_closeBattleTimer<=0&&el.style.display!=='none')el.style.display='none';
  }
}


function updateRpmBar(dt){
  if(!_elRpm)return;
  const car=carObjs[playerIdx];if(!car)return;
  const gear=_currentGear||1;
  const lo=_RPM_GEAR_RANGES[Math.max(0,gear-1)];
  const hi=_RPM_GEAR_RANGES[Math.min(4,gear)];
  const spd=Math.abs(car.speed);
  const top=car.def.topSpd;
  const ratio=hi>lo?Math.max(0,Math.min(1,(spd/top-lo)/(hi-lo))):spd/top;
  const isRedline=ratio>.88;
  _elRpm.style.height=(ratio*100)+'%';
  if(isRedline!==_lastRedline){
    _lastRedline=isRedline;
    _elRpm.style.background=isRedline?_RPM_GRAD_REDLINE:_RPM_GRAD_NORMAL;
  }
}


function updateRevLimiter(dt){
  if(!audioCtx)return;
  const car=carObjs[playerIdx];if(!car)return;
  const ratio=car.speed/Math.max(car.def.topSpd*.01,car.def.topSpd);
  if(ratio>.966&&!nitroActive&&!car.boostTimer){
    _revLimiterTimer+=dt;
    if(_revLimiterTimer>.42){playRevLimiter();_revLimiterTimer=0;}
  }else{_revLimiterTimer=Math.max(0,_revLimiterTimer-dt*3);}
}


function playRevLimiter(){
  if(!audioCtx)return;
  const sz=Math.ceil(audioCtx.sampleRate*.038);
  const buf=audioCtx.createBuffer(1,sz,audioCtx.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=(Math.random()*2-1)*(1-i/sz);
  const src=audioCtx.createBufferSource();src.buffer=buf;
  const f=audioCtx.createBiquadFilter();f.type='bandpass';f.frequency.value=2400;f.Q.value=1.2;
  const g=audioCtx.createGain();
  const t=audioCtx.currentTime;
  g.gain.setValueAtTime(.07,t);g.gain.exponentialRampToValueAtTime(.001,t+.04);
  src.connect(f);f.connect(g);g.connect(_dst());src.start(t);src.stop(t+.045);
}

function updateQuickRestart(dt){
  const holding=keys['KeyR']&&gameState==='RACE';
  const bar=document.getElementById('rstBar'),fill=document.getElementById('rstFill');
  const lbl=document.getElementById('rstLabel');
  if(holding){
    _rstHold=Math.min(1.5,_rstHold+dt);
    if(bar){bar.style.display='block';}
    if(lbl){lbl.style.display='block';}
    if(fill)fill.style.width=(_rstHold/1.5*100)+'%';
    if(_rstHold>=1.5){
      _rstHold=0;
      if(bar)bar.style.display='none';if(lbl)lbl.style.display='none';
      goToSelectAgain();
    }
  }else{
    if(_rstHold>0){_rstHold=Math.max(0,_rstHold-dt*3);}
    if(_rstHold<=0){if(bar)bar.style.display='none';if(lbl)lbl.style.display='none';}
    else if(fill)fill.style.width=(_rstHold/1.5*100)+'%';
  }
}


function showSectorFlash(label,time,delta,color){
  var el=document.getElementById('sectorPanel');if(!el)return;
  el.innerHTML='<span style="color:#aaa">'+label+'</span><span style="color:'+color+';font-size:16px;margin:0 6px">'+fmtTime(time)+'</span><span style="color:'+color+';font-size:11px">'+delta+'</span>';
  el.style.opacity='1';
  clearTimeout(el._ht);
  el._ht=setTimeout(function(){el.style.opacity='0';},2800);
}

function showSectorSplit(text,color){
  const el=document.getElementById('sectorInfo');if(!el)return;
  el.textContent=text;el.style.color=color;el.style.opacity='1';
  if(_secPopTimer)clearTimeout(_secPopTimer);
  _secPopTimer=setTimeout(()=>{el.style.opacity='0';},1100);
}

function floatText(text,color,screenX,screenY){
  if(_floatSlotTimer<=0)_floatSlot=0;
  _floatSlotTimer=1.6;
  const offsetY=_floatSlot*38;
  _floatSlot=(_floatSlot+1)%6; // up to 6 simultaneous, then wrap
  const el=document.createElement('div');
  el.className='floatText';el.textContent=text;
  el.style.color=color;el.style.textShadow='0 0 12px '+color;
  el.style.left=Math.round(screenX)+'px';
  // Clamp Y above controls on mobile (touch controls start ~viewport*.75 on phone)
  const maxTop=window._useTouchControls?innerHeight*.55:innerHeight-80;
  el.style.top=Math.round(Math.min(maxTop,Math.max(60,screenY-30-offsetY)))+'px';
  document.body.appendChild(el);
  setTimeout(()=>{try{el.remove();}catch(e){}},1200);
}

function floatText3D(text,color,worldPos){
  if(!camera)return;
  const v=worldPos.clone().project(camera);
  const x=(v.x*.5+.5)*innerWidth,y=(1-(v.y*.5+.5))*innerHeight;
  if(x>0&&x<innerWidth&&y>0&&y<innerHeight)floatText(text,color,x,y);
}


// Shared skid-mark geometry — every mark uses the same .38×1.7 plane so we
// only allocate one BufferGeometry per session instead of one per skid event.
// Material is still per-mark (opacity fades independently per mark).
let _skidGeo=null;
function _getSkidGeo(){
  if(!_skidGeo)_skidGeo=new THREE.PlaneGeometry(.38,1.7);
  return _skidGeo;
}
function addSkidMark(car,opacityOverride){
  _plFwd.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
  _plRt.set(1,0,0).applyQuaternion(car.mesh.quaternion);
  const fwd=_plFwd,rt=_plRt;
  const baseOp=opacityOverride||0.72;
  // Per-world skid mark color — past bij ground-type. Sneeuw/zand pakken
  // donker-bruin-grijze sporen, lava grond geeft hete oranje-rode sporen
  // (subtiel emissive via additive blending), wet asphalt blijft zwart.
  const skidCfg={
    arctic:{color:0x33424f,blend:false},     // donker grijs op sneeuw
    deepsea:{color:0x4a3a20,blend:false},    // donker zand
    volcano:{color:0xff4400,blend:true},     // hete sporen op lava-rock
    candy:{color:0x4a1a30,blend:false},      // donker roze op fondant
    space:{color:0x2244aa,blend:true},       // ion-trail blauw (additive)
    neoncity:{color:0x0a0a0a,blend:false},   // zwart natte asfalt (default)
    themepark:{color:0x1a1020,blend:false},  // donker paars-zwart
    grandprix:{color:0x0a0a0a,blend:false}   // klassiek zwart
  }[activeWorld]||{color:0x0a0a0a,blend:false};
  const sharedGeo=_getSkidGeo();
  [-0.65,.65].forEach(s=>{
    const matOpts={color:skidCfg.color,transparent:true,opacity:baseOp,depthWrite:false};
    if(skidCfg.blend){matOpts.blending=THREE.AdditiveBlending;}
    const sm=new THREE.Mesh(sharedGeo,new THREE.MeshBasicMaterial(matOpts));
    sm.rotation.x=-Math.PI/2;sm.position.copy(car.mesh.position).addScaledVector(rt,s).addScaledVector(fwd,1.5);sm.position.y=.013;
    scene.add(sm);skidMarks.push({mesh:sm,born:_nowSec,maxOp:baseOp});
    if(skidMarks.length>80){const old=skidMarks.shift();old.mesh.material.dispose();scene.remove(old.mesh);}
  });
}

function updateSkidMarks(){
  for(let i=skidMarks.length-1;i>=0;i--){
    const s=skidMarks[i];
    const op=Math.max(0,(s.maxOp||.72)*(1-(_nowSec-s.born)/12));
    if(op<=0){s.mesh.material.dispose();scene.remove(s.mesh);skidMarks.splice(i,1);}
    else s.mesh.material.opacity=op;
  }
}


function updateSprinkles(dt){
  if(!_sprinkleGeo)return;
  const pos=_sprinkleGeo.attributes.position.array;
  const car=carObjs[playerIdx];
  const cx=car?car.mesh.position.x:0,cz=car?car.mesh.position.z:0;
  const count=pos.length/3;
  const step=Math.floor(_nowSec*600)%6;
  for(let i=step;i<count;i+=6){
    pos[i*3+1]-=dt*1.5+Math.random()*.01;
    if(pos[i*3+1]<-.5){
      pos[i*3]=(Math.random()-.5)*600+cx;
      pos[i*3+1]=20+Math.random()*4;
      pos[i*3+2]=(Math.random()-.5)*600+cz;
    }
  }
  _sprinkleGeo.attributes.position.needsUpdate=true;
}


function updateBoostGlow(){
  if(!_boostLight){_boostLight=new THREE.PointLight(0x00ccff,0,28);scene.add(_boostLight);}
  const car=carObjs[playerIdx];
  if(!car){_boostLight.intensity=0;return;}
  _boostLight.position.copy(car.mesh.position);_boostLight.position.y+=1.2;
  const tgt=nitroActive?3.8:(car.boostTimer>0?2.4:0);
  _boostLight.intensity+=((tgt-_boostLight.intensity))*.18;
  _boostLight.color.setHex(nitroActive?0xff8800:0x00ccff);
  _boostLight.distance=nitroActive?32:22;
}

function spawnFlames(){
  const c=document.getElementById('titleFlames');
  const pal=['#ff6600','#ff3300','#ffaa00','#ff1100','#ffcc00','#ff4400'];
  for(let i=0;i<48;i++){const f=document.createElement('div');f.className='flame';const h=28+Math.random()*110,w=3+Math.random()*6;f.style.cssText=`left:${Math.random()*100}%;height:${h}px;width:${w}px;background:${pal[i%pal.length]};animation-duration:${.75+Math.random()*2.3}s;animation-delay:${-Math.random()*2.5}s`;c.appendChild(f);}
}

// Ghost-replay (buildGhostMesh / updateGhost / saveGhostIfPB) → js/gameplay/ghost.js
