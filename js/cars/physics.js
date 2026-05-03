// js/cars/physics.js — non-module script.

'use strict';

// Pre-allocated scratch vectors (uit main.js verhuisd) — cross-script
// zichtbaar voor effects/night.js + visuals.js die _plFwd/_plRt lezen.
const _plFwd=new THREE.Vector3(),_plBk=new THREE.Vector3(),_plRt=new THREE.Vector3();
const _slipFwd=new THREE.Vector3(),_slipDir=new THREE.Vector3();

// Brake-release detector — set elke frame in updatePlayer, gereset in race.js.
let _wasBraking=false;

function updatePlayer(dt){
  if(recoverActive)return;
  const car=carObjs[playerIdx];if(!car||car.finished)return;
  // Pit stop active — car is fully stopped, no input
  if(_pitStopActive){car.speed=0;return;}

  const acc=keys['ArrowUp']||keys['KeyW'];
  const brk=keys['ArrowDown']||keys['KeyS'];
  const lft=keys['ArrowLeft']||keys['KeyA'];
  const rgt=keys['ArrowRight']||keys['KeyD'];
  const hbk=keys['Space'];
  const nit=keys['KeyN'];

  // Nitro — longer duration + stronger boost (user-tuned: lasts ~5s instead of ~2.9s)
  const _prevNitro=nitroActive;
  nitroActive=false;
  // Final lap: nitro recharges 40% faster (push to the end)
  const finalLapBonus=car.lap>=TOTAL_LAPS?1.4:1;
  if(nit&&nitroLevel>0){nitroActive=true;nitroLevel=Math.max(0,nitroLevel-20*dt);}
  else{nitroLevel=Math.min(100,nitroLevel+16*dt*finalLapBonus);}
  if(nitroActive&&!_prevNitro){Audio.playNitro();onNitroActivate();Audio.setNitro(true);}
  if(!nitroActive&&_prevNitro&&musicSched&&musicSched.setNitro)musicSched.setNitro(false);
  if(_elNitro)_elNitro.style.height=nitroLevel+'%';
  if(_elNitroIndFill)_elNitroIndFill.style.width=nitroLevel+'%';
  if(_elNitroInd){
    const ready=nitroLevel>=99.5;
    if(ready!==_elNitroInd._wasReady){
      _elNitroInd.classList.toggle('ready',ready);
      _elNitroInd._wasReady=ready;
    }
  }

  const _dmgMult=1-Math.min(0.18,((car.hitCount||0)/6)*.18); // up to 18% speed penalty at 6 hits
  // Tire temperature grip modifier
  const _avgTemp=(_tireTemp.fl+_tireTemp.fr+_tireTemp.rl+_tireTemp.rr)*.25;
  const _tempGrip=_avgTemp<0.25?0.78+_avgTemp*.88: // cold tires — up to 22% penalty
                  _avgTemp<0.72?1.0:                 // optimal range
                  1.0-(_avgTemp-0.72)*0.5;           // overheated — up to 14% penalty
  let MAX=car.def.topSpd*_dmgMult*_tempGrip*(car.boostTimer>0?1.55:1)*(nitroActive?1.55:1);
  // Racing line grip bonus (main straight + key zones)
  let _gripZoneBonus=0;
  for(const [s,e,b] of GRIP_BONUS_ZONES){
    const inZ=s<e?(car.progress>=s&&car.progress<=e):(car.progress>=s||car.progress<=e);
    if(inZ){const offDist=trackDist(car.mesh.position,car.progress);if(offDist<TW*.55)_gripZoneBonus=b;}
  }
  MAX*=(1+_gripZoneBonus);
  // Rain reduces grip
  if(isRain)MAX*=.88;
  const ACC=car.def.accel,H=car.def.hdlg*(1-car.tireWear*.42)*(isRain?.72:1);

  if(acc)car.speed=Math.min(MAX,car.speed+ACC*dt*60);
  else if(brk)car.speed=Math.max(-MAX*.35,car.speed-ACC*2.4*dt*60);
  else car.speed*=Math.pow(.956,dt*60);
  if(hbk)car.speed*=Math.pow(.875,dt*60);
  if(Math.abs(car.speed)<.0008)car.speed=0;

  if(hbk&&Math.abs(car.speed)>.5){addSkidMark(car);if(Math.random()<.22)Audio.playScreech();}
  // Skid marks on hard braking
  if(brk&&Math.abs(car.speed)>.95&&Math.random()<.28){addSkidMark(car,0.55);}
  // Tire smoke on hard braking
  if(brk&&Math.abs(car.speed)>.8&&Math.random()<.18){
    exhaustSystem.emit(car.mesh.position.x,car.mesh.position.y+.15,car.mesh.position.z,(Math.random()-.5)*.04,.02,(Math.random()-.5)*.04,2,.9,.9,.9,.5);
  }
  // Water spray in rain
  if(isRain&&Math.abs(car.speed)>.5&&Math.random()<.22){
    exhaustSystem.emit(car.mesh.position.x,car.mesh.position.y+.1,car.mesh.position.z,(Math.random()-.5)*.08,.06+Math.random()*.04,(Math.random()-.5)*.08,3,.7,.8,1,.35);
  }
  // Suspension vertical bounce — subtle at speed, feels alive
  if(!car.inAir){
    car.mesh.position.y=.35+Math.sin(_nowSec*Math.abs(car.speed)*18)*.0025*Math.abs(car.speed);
  }

  // Drift detection + mini-turbo
  if(hbk&&Math.abs(car.speed)>.8){
    driftTimer+=dt;driftScore=Math.floor(driftTimer*120);
    if(driftTimer>.3)showPopup('DRIFT! +'+driftScore,'#ff8800');
    if(driftTimer>=1.5)_miniTurboReady=true;
  }else{
    if(driftTimer>1){
      showPopup('DRIFT! +'+driftScore+' pts','#ff8800',1200);
      floatText('DRIFT +'+driftScore,'#ff8800',innerWidth*.5,innerHeight*.6);
      totalScore+=driftScore;
    }
    if(_miniTurboReady&&!hbk&&driftTimer>0){
      // Mini-turbo burst on drift release
      car.boostTimer=Math.max(car.boostTimer,.6+driftTimer*.15);
      showPopup('MINI TURBO! 🔥','#ff4400',900);
      floatText('🔥 TURBO!','#ff4400',innerWidth*.5,innerHeight*.55);
      _miniTurboReady=false;
    }
    driftTimer=0;driftScore=0;
  }

  // Spin pad effect
  if(car.spinTimer>0){
    car.mesh.rotation.y+=.12*(car.speed>0?1:-1);
    car.spinTimer-=dt;
  }else{
    const sf=H*Math.max(.42,1-Math.abs(car.speed)/car.def.topSpd*.32);
    if(lft)car.mesh.rotation.y+=sf*dt*60;
    if(rgt)car.mesh.rotation.y-=sf*dt*60;
  }

  // Car body tilt — lean into corners, pitch on braking/accel
  const _steerDir=(lft?1:rgt?-1:0);
  const _speedFactor=Math.min(1,Math.abs(car.speed)/car.def.topSpd);
  const _targetTiltZ=_steerDir*(0.10+_speedFactor*0.09)+(hbk?_steerDir*0.10:0)+(driftTimer>0.2?_steerDir*0.06:0);
  const _targetTiltX=acc?(-0.05-_speedFactor*0.025):brk?0.09:0;
  car.mesh.rotation.z+=(_targetTiltZ-car.mesh.rotation.z)*Math.min(1,dt*7);
  car.mesh.rotation.x+=(_targetTiltX-car.mesh.rotation.x)*Math.min(1,dt*6);

  // Jump / gravity
  if(car._fallingIntoSpace){
    // Falling into the void — skip normal floor check, updateSpaceWorld handles recovery
  }else if(car.inAir||car.vy!==0){
    const gravStrength=activeWorld==='space'?13:activeWorld==='deepsea'?13:22; // lower gravity in space/water
    car.vy-=gravStrength*dt;
    car.mesh.position.y+=car.vy*dt;
    if(car.mesh.position.y<=.35&&car.vy<0){
      const landSpeed=Math.abs(car.vy);
      car.mesh.position.y=.35;car.vy=0;car.inAir=false;
      camShake=0.18+landSpeed*.012;
      if(landSpeed>14)showPopup('💥 HARD LANDING!','#ffaa00',600);
      Audio.playLand();
      _plBk.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
      sparkSystem.emit(car.mesh.position.x,.5,car.mesh.position.z,-_plBk.x*.05,0,-_plBk.z*.05,20,.6,.5,.4,.8);
    }
  }
  // (Grounded state handled earlier — lines 6944-6948 already set Y from ramp/bounce)

  // Move — reuse pre-allocated _plFwd/_plBk to avoid GC
  _plFwd.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
  const fwd=_plFwd;
  car.mesh.position.addScaledVector(fwd,car.speed);

  // Exhaust particles
  if(Math.abs(car.speed)>.05&&Math.random()>.6){
    _plBk.copy(_plFwd).negate();
    const bk=_plBk;
    exhaustSystem.emit(
      car.mesh.position.x+bk.x*2,car.mesh.position.y+.3,car.mesh.position.z+bk.z*2,
      bk.x*.04+((Math.random()-.5)*.02),(.02+Math.random()*.04),bk.z*.04+((Math.random()-.5)*.02),
      2,.5,.4,.38,.8);
  }
  // Nitro flame trail — bright orange/blue flame cone
  if(nitroActive){
    _plBk.copy(_plFwd).negate();
    const bk=_plBk;
    if(Math.random()>.15){
      // Main flame — orange to white
      sparkSystem.emit(
        car.mesh.position.x+bk.x*2.0,car.mesh.position.y+.22,car.mesh.position.z+bk.z*2.0,
        bk.x*.18+(Math.random()-.5)*.06,.01+Math.random()*.06,bk.z*.18+(Math.random()-.5)*.06,
        5,1,.5+Math.random()*.4,0,.28);
    }
    if(Math.random()>.55){
      // Inner blue core
      sparkSystem.emit(
        car.mesh.position.x+bk.x*1.5,car.mesh.position.y+.2,car.mesh.position.z+bk.z*1.5,
        bk.x*.08+(Math.random()-.5)*.03,.005+Math.random()*.04,bk.z*.08+(Math.random()-.5)*.03,
        2,.3,.5,1,.22);
    }
  }

  // Boost timer
  if(car.boostTimer>0)car.boostTimer-=dt;

  // Slipstream: close behind another car
  slipTimer=0;
  let slipping=false;
  carObjs.forEach((other,i)=>{
    if(i===playerIdx)return;
    const dx=car.mesh.position.x-other.mesh.position.x,dz=car.mesh.position.z-other.mesh.position.z;
    _slipFwd.set(0,0,-1).applyQuaternion(other.mesh.quaternion);
    const d2=dx*dx+dz*dz;
    if(d2<64){// 8² — skip sqrt until needed
      _slipDir.set(-dx,0,-dz).normalize();
      if(_slipDir.dot(_slipFwd)>.7){slipping=true;}
    }
  });
  if(slipping){
    car.speed=Math.min(MAX*1.12,car.speed+.004);
    if(_elSlip)_elSlip.style.display='block';
    _drsActive=true;
    if(_drsEl)_drsEl.style.display='block';
  }else{
    if(_elSlip)_elSlip.style.display='none';
    _drsActive=false;
    if(_drsEl)_drsEl.style.display='none';
  }
  // Near-miss bonus: close pass without collision
  if(_raceStartGrace<=0){
    carObjs.forEach((other,i)=>{
      if(i===playerIdx)return;
      const dx=car.mesh.position.x-other.mesh.position.x,dz=car.mesh.position.z-other.mesh.position.z;
      const dist=Math.sqrt(dx*dx+dz*dz);
      const relSpd=Math.abs(car.speed-other.speed);
      if(dist>2.5&&dist<4.5&&relSpd>.12&&(_nearMissCooldown[i]||0)<=0){
        _nearMissCooldown[i]=3; // 3s cooldown
        const bonus=Math.round(80+relSpd*300);
        totalScore+=bonus;
        floatText('⚡ NEAR MISS +'+bonus,'#ffdd00',innerWidth*.5,innerHeight*.4);
        triggerCombo('NEAR MISS');
        beep(880,.06,.18,0,'sine');beep(1320,.05,.12,.06,'sine');
        if(Math.random()<.4)Audio.playCrowdCheer();
      }
      if((_nearMissCooldown[i]||0)>0)_nearMissCooldown[i]-=dt;
    });
  }

  // Off-track slowdown — friction and popup text vary per world
  if(!car.inAir&&!recoverActive){
    const offDist=trackDist(car.mesh.position,car.progress);
    if(offDist>TW){
      const overRatio=Math.min(1,(offDist-TW)/8);
      if(activeWorld==='space'){
        // Moon dust: lighter grip loss on low-gravity regolith
        car.speed*=Math.pow(1-overRatio*.09,dt*60);
        if(offDist>TW+4&&Math.random()<.03)showPopup('MOON DUST!','#aaaadd',400);
      } else if(activeWorld==='deepsea'){
        // Seabed sand: moderate drag, sea current adds gentle push
        car.speed*=Math.pow(1-overRatio*.13,dt*60);
        if(offDist>TW+4&&Math.random()<.04)showPopup('SEABED!','#44ddbb',400);
      } else if(activeWorld==='candy'){
        // Frosting: sticky sugar slows you down!
        car.speed*=Math.pow(1-overRatio*.22,dt*60);
        if(offDist>TW+4&&Math.random()<.05)showPopup('FROSTING! 🧁','#ff66aa',400);
      } else {
        // Default: classic grass friction
        car.speed*=Math.pow(1-overRatio*.18,dt*60);
        if(offDist>TW+4&&Math.random()<.04)showPopup('GRASS!','#88dd44',400);
      }
    }
  }

  // ── Tire wear ──────────────────────────────
  if(Math.abs(car.speed)>.15)car.tireWear=Math.min(1,car.tireWear+Math.abs(car.speed)*.000055*dt*60);
  // Pit lane recovery — zone along main straight near pit building (z 178-212)
  const _pz=car.mesh.position.z,_px=car.mesh.position.x;
  if(_pz>178&&_pz<212&&_px>-188&&_px<172&&car.tireWear>0.02){
    car.tireWear=Math.max(0,car.tireWear-.18*dt);
    if(car.tireWear<.04&&car.tireWear>0){car.tireWear=0;showPopup('🔧 FRESH TYRES!','#00ee88',1100);}
  }
  // Worn tire warning (once per threshold crossing, 2s cooldown)
  _tireWarnCooldown=Math.max(0,_tireWarnCooldown-dt);
  if(car.tireWear>.72&&_tireWarnCooldown<=0){showPopup('⚠ TYRES WORN','#ffbb00',900);_tireWarnCooldown=8;}

  // ── Tire temperature heating / cooling ─────
  const spd=Math.abs(car.speed);
  const heatRate=spd*.008*(isRain?.55:1)*(hbk?2.5:1)*(brk&&spd>.6?1.8:1);
  const coolRate=0.006+(_weatherMode==='snow'?.012:0);
  // Front tires heat from cornering + braking, rears from power/drift
  const steerHeat=(lft||rgt)?0.012:0;
  _tireTemp.fl=Math.max(0,Math.min(1,_tireTemp.fl+heatRate*dt+steerHeat*dt-coolRate*dt));
  _tireTemp.fr=Math.max(0,Math.min(1,_tireTemp.fr+heatRate*dt+steerHeat*dt-coolRate*dt));
  _tireTemp.rl=Math.max(0,Math.min(1,_tireTemp.rl+(acc?heatRate*.9:heatRate*.4)*dt+(hbk?.018:0)*dt-coolRate*dt));
  _tireTemp.rr=Math.max(0,Math.min(1,_tireTemp.rr+(acc?heatRate*.9:heatRate*.4)*dt+(hbk?.018:0)*dt-coolRate*dt));
  // Warn on extremely cold tires at race start
  if(car.lap===1&&_avgTemp<0.12&&spd>.3&&Math.random()<.004)showPopup('❄ COLD TYRES — WARM UP!','#88bbff',1200);

  // ── Brake heat visual (orange sparks at wheels on hard braking) ─
  if(brk&&spd>.8&&Math.random()<.22){
    _plBk.set(0,0,-1).applyQuaternion(car.mesh.quaternion).negate();
    _plRt.set(1,0,0).applyQuaternion(car.mesh.quaternion);
    const bk2=_plBk,rt2=_plRt;
    [-1,1].forEach(s=>{
      sparkSystem.emit(
        car.mesh.position.x+rt2.x*s*.95+bk2.x*1.4, car.mesh.position.y+.22,
        car.mesh.position.z+rt2.z*s*.95+bk2.z*1.4,
        rt2.x*s*.03+bk2.x*.04, .01+Math.random()*.04, rt2.z*s*.03+bk2.z*.04,
        2, 1, .35+Math.random()*.25, 0, .28
      );
    });
  }

  // ── Speed trap (S/F straight, progress ~0.01) ──────────────────
  if(car.progress<0.025&&car.progress>0.005&&spd>.8){
    const kmh=Math.round(spd*60*38*(car.boostTimer>0?1.3:1)*(nitroActive?1.4:1));
    if(kmh>_speedTrapMax){
      _speedTrapMax=kmh;
      if(kmh>_speedTrapAllTime){_speedTrapAllTime=kmh;}
      const el=document.getElementById('speedTrapEl');
      if(el&&!_speedTrapFired){
        _speedTrapFired=true;
        el.innerHTML='⚡ SPEED TRAP<br>'+kmh+' km/h'+(kmh===_speedTrapAllTime?'<br>🏆 SESSION BEST':'');
        el.style.display='block';
        setTimeout(()=>{el.style.display='none';_speedTrapFired=false;},2200);
      }
    }
  }else if(car.progress>0.04){_speedTrapFired=false;}

  // ── Turbo spool effect (lift then reapply at speed) ─────────────
  const nowBraking=brk&&spd>.5;
  // Brake squeal one-shot: trigger op brake-onset bij hoge snelheid.
  // Vermijdt spam tijdens sustained braking.
  if(nowBraking&&!_wasBraking&&spd>.7)Audio.playBrake();
  if(_wasBraking&&acc&&!brk&&spd>.5){
    // Transition: was braking, now accelerating
    if(audioCtx&&Math.random()>.5){
      const t2=audioCtx.currentTime;
      const o=audioCtx.createOscillator(),g2=audioCtx.createGain(),f2=audioCtx.createBiquadFilter();
      o.type='sawtooth';f2.type='bandpass';f2.frequency.value=900;f2.Q.value=2;
      o.frequency.setValueAtTime(280,t2);o.frequency.exponentialRampToValueAtTime(680,t2+.18);
      g2.gain.setValueAtTime(.045,t2);g2.gain.exponentialRampToValueAtTime(.001,t2+.22);
      o.connect(f2);f2.connect(g2);g2.connect(_dst());o.start(t2);o.stop(t2+.24);
    }
  }
  _wasBraking=nowBraking;

  updateEngine(car.speed);
  spinWheels(car);
  tickProgress(car);
}


function spinWheels(car){if(!car.mesh.userData.wheels)return;car.mesh.userData.wheels.forEach(w=>{w.rotation.x+=car.speed*.55;});}

