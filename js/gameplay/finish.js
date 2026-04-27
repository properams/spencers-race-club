// js/gameplay/finish.js — non-module script.

function showFinish(){
  gameState='FINISH';document.getElementById('hud').style.display='none';setTouchControlsVisible(false);
  const sov=document.getElementById('speedOverlay');if(sov)sov.style.opacity='0';
  if(musicSched){musicSched.stop();musicSched=null;}
  // Resume title music on finish screen (after a short beat for the race-end feel)
  setTimeout(()=>{if(gameState==='FINISH')startTitleMusic();},900);
  // Stop all ambient audio — prevents harsh noise on finish screen
  Audio.stopWind();
  if(_crowdGain&&audioCtx)_crowdGain.gain.setTargetAtTime(0.0,audioCtx.currentTime,.8);
  // Stop engine oscillator
  if(engineGain&&audioCtx)engineGain.gain.setTargetAtTime(0.0,audioCtx.currentTime,.4);
  const pos=getPositions(),p=pos.findIndex(c=>c.isPlayer)+1;
  const ords=['1st 🏆','2nd 🥈','3rd 🥉','4th','5th','6th','7th','8th'];
  // Position bonus + message
  const bonuses=[1000,700,500,300,200,100,50,0];
  const msgs=['🏆 CHAMPION!','🥈 EXCELLENT DRIVE!','🥉 PODIUM FINISH!',
              'GREAT EFFORT!','SOLID RACE!','KEEP PRACTICING!','ALMOST THERE!','NEVER GIVE UP!'];
  const titleGrads=['linear-gradient(175deg,#fff 0%,#ffd700 40%,#ff9500 80%)','linear-gradient(175deg,#fff 0%,#c0c0c0 50%,#888 100%)','linear-gradient(175deg,#fff 0%,#cd7f32 55%,#8B4513 100%)',''];
  totalScore+=bonuses[p-1]||0;
  const finTitle=document.getElementById('finTitle');
  if(p<=3&&finTitle){finTitle.style.backgroundImage=titleGrads[p-1];finTitle.style.webkitBackgroundClip='text';finTitle.style.webkitTextFillColor='transparent';}
  document.getElementById('finMsg').textContent=msgs[p-1]||msgs[7];
  document.getElementById('finMsg').style.color=p===1?'#cc44ff':p===2?'#aa88ff':p===3?'#8866cc':'#6644aa';
  document.getElementById('finPos').textContent='You finished '+(ords[p-1]||p+'th')+' place!'+(bestLapTime<Infinity?' · Best lap: '+fmtTime(bestLapTime):'');
  document.getElementById('finScore').textContent='SCORE: '+totalScore.toLocaleString();
  // Post-race stat line
  const statEl=document.getElementById('finStats');
  if(statEl){
    const pCar=carObjs[playerIdx];
    const spd=pCar?Math.min(380,Math.round(_raceMaxSpeed*165)):0;
    statEl.textContent='Top speed: '+spd+' km/h  ·  Overtakes: '+_raceOvertakes+(_achieveUnlocked.size>0?' · '+_achieveUnlocked.size+' achievements':'');
  }
  // Career stats + unlocks
  _raceCount++;
  if(p<=3)_podiumCount++;
  const _earnedCoins=awardCoins(p);
  _lastRaceCoins=_earnedCoins||0;
  const coinsEl=document.getElementById('finCoins');
  if(coinsEl&&_lastRaceCoins>0){
    coinsEl.style.display='block';let counted=0;const target=_lastRaceCoins;const step=Math.max(1,Math.round(target/40));
    const iv=setInterval(()=>{counted=Math.min(target,counted+step);coinsEl.textContent='+'+counted+' 💰';if(counted>=target){clearInterval(iv);coinsEl.style.textShadow='0 0 20px #ffd700';}},30);
  }
  const tcEl=document.getElementById('finTotalCoins');
  if(tcEl)tcEl.textContent='💰 TOTAAL: '+_coins.toLocaleString();
  // Achievement check
  var _achStats={hits:carObjs[playerIdx]?carObjs[playerIdx].hitCount:0,maxSpd:Math.round(_raceMaxSpeed*165),fl:bestLapTime!==Infinity&&bestLapTime<=_overallFastestLap+0.001};
  ACHIEVEMENTS.forEach(function(ach,ai){
    if(_achieveUnlocked.has(ach.id))return;
    if(ach.check(p,_achStats)){_achieveUnlocked.add(ach.id);setTimeout(function(){showAchievementToast(ach);},2500+ai*2200);}
  });
  // Daily challenge
  _todayRaces++;
  if(_todayChallenge&&!_challengeCompleted){
    var _dcStats={hits:carObjs[playerIdx]?carObjs[playerIdx].hitCount:0,fl:bestLapTime!==Infinity&&bestLapTime<=_overallFastestLap+0.001};
    if(_todayChallenge.check(p,_dcStats)){
      _challengeCompleted=true;_coins+=_todayChallenge.reward;_totalCoinsEarned+=_todayChallenge.reward;
      setTimeout(function(){showAchievementToast({icon:'\u{1F4CB}',title:'UITDAGING VOLTOOID!',desc:_todayChallenge.text+' \u00b7 +'+_todayChallenge.reward+' coins'});},4500);
    }
  }
  const newUnlocks=checkUnlocks(p);
  savePersistent();
  if(newUnlocks.length>0)setTimeout(()=>showUnlocks(newUnlocks),2500);
  // Detect personal record BEFORE savePersistent updates the cached values
  const _preHS=_savedHS,_preBL=_savedBL;
  savePersistent();
  const _newHS=_savedHS>_preHS,_newBL=_savedBL<_preBL;
  if(_newHS||_newBL){
    const rtxt=_newHS&&_newBL?'🏆 NEW RECORDS! SCORE + LAP':_newHS?'🏆 NEW HIGH SCORE!':'⏱ NEW BEST LAP!';
    setTimeout(()=>{showBanner(rtxt,'#ffd700',3200);Audio.playCrowdCheer();},900);
    const fhs=document.getElementById('finHighScore');
    if(fhs){fhs.textContent=_newHS?'HIGH SCORE: '+_savedHS.toLocaleString():'';fhs.style.color='#ffd700';fhs.style.textShadow='0 0 14px #ffd700';}
  }
  // Show fastest lap credit
  const flEl2=document.getElementById('finStats');
  if(flEl2&&_overallFastestLap<Infinity){
    const pCar=carObjs[playerIdx];
    const spd=pCar?Math.min(380,Math.round(_raceMaxSpeed*165)):0;
    const pitNote=_pitStopUsed?' · Pit stop used':'';
    const flNote=bestLapTime<=_overallFastestLap+0.001?' · 💜 FASTEST LAP':'';
    flEl2.textContent='Top speed: '+spd+' km/h  ·  Overtakes: '+_raceOvertakes+pitNote+flNote;
  }
  const tbody=document.getElementById('leaderBody');tbody.innerHTML='';
  pos.forEach((car,i)=>{
    const tr=document.createElement('tr');if(car.isPlayer)tr.className='pRow';
    const bestT=car.bestLap?fmtTime(car.bestLap):'-';
    const flMark=car.isPlayer&&bestLapTime<=_overallFastestLap+0.001?'<span style="color:#cc44ff"> 💜</span>':'';
    tr.innerHTML=`<td>${ords[i]||i+1+'th'}</td><td>${car.def.brand} ${car.def.name}</td><td style="color:#aaa">${bestT}${flMark}</td>`;
    tbody.appendChild(tr);
  });
  // 3D Podium
  const podium=document.getElementById('finPodium');
  if(podium&&pos.length>=3){
    const metals=['#ffd700','#c0c0c0','#cd7f32'];
    const metalGlow=['#aa8800','#666666','#6b3a0e'];
    const podH=[110,82,60]; // heights: 1st tallest
    // Display order left→right: 2nd, 1st, 3rd
    const dispOrder=[1,0,2];
    podium.innerHTML='';
    dispOrder.forEach(rank=>{
      const car=pos[rank];if(!car)return;
      const col='#'+car.def.color.toString(16).padStart(6,'0');
      const medal=metals[rank],glow=metalGlow[rank],h=podH[rank];
      const box=document.createElement('div');box.className='podBox';
      box.innerHTML=
        `<div class="podCarBlock" style="background:linear-gradient(135deg,${col},${col}88);border:2px solid ${col};box-shadow:0 0 14px ${col}66"></div>`+
        `<div class="podLabel" style="color:${medal};text-shadow:0 0 10px ${medal}">${['🏆 1ST','🥈 2ND','🥉 3RD'][rank]}</div>`+
        `<div class="podCarName">${car.def.name}</div>`+
        `<div class="podPlatform" style="height:${h}px;background:linear-gradient(180deg,${medal}44,${medal}11);border:2px solid ${medal};border-bottom:none;box-shadow:0 0 18px ${glow},inset 0 1px 0 ${medal}88">${rank===0?'★':''}</div>`;
      podium.appendChild(box);
    });
  }
  // Show per-lap times below leaderboard
  const lapTimesEl=document.getElementById('finLapTimes');
  if(lapTimesEl&&_lapTimes.length>0){
    lapTimesEl.innerHTML=_lapTimes.map((t,i)=>{
      const isBest=t===bestLapTime;
      return `<span style="margin:0 10px;color:${isBest?'#00ff88':'#aaa'};${isBest?'text-shadow:0 0 8px #00ff88':''}">LAP ${i+1}: ${fmtTime(t)}${isBest?' ★':''}</span>`;
    }).join('');
  }
  // Show damage status
  const pCar2=carObjs[playerIdx];
  if(pCar2&&pCar2.hitCount>=3){
    const dmgEl=document.getElementById('finStats');
    if(dmgEl){const d=pCar2.hitCount>=6?'🔥 HEAVY':'⚠ LIGHT';dmgEl.textContent+=' · '+d+' DAMAGE';}
  }
  var _wfBg={grandprix:'radial-gradient(ellipse at 50% 40%,#140030,#070018,#000007)',space:'radial-gradient(ellipse at 50% 40%,#000818,#00041a,#000005)',deepsea:'radial-gradient(ellipse at 50% 40%,#001828,#00081a,#000005)',candy:'radial-gradient(ellipse at 50% 40%,#280018,#14000c,#050002)',neoncity:'radial-gradient(ellipse at 50% 40%,#000818,#00041a,#000005)',volcano:'radial-gradient(ellipse at 50% 40%,#1a0800,#0a0400,#000000)',arctic:'radial-gradient(ellipse at 50% 40%,#061428,#020a18,#000005)',themepark:'radial-gradient(ellipse at 50% 40%,#2a0840,#1a0428,#050010)'};
  var _sfEl=document.getElementById('sFinish');if(_sfEl)_sfEl.style.background=_wfBg[activeWorld]||_wfBg.grandprix;
  document.getElementById('sFinish').classList.remove('hidden');
  // Staggered reveal animations
  ['finTitle','finMsg','finPos','finScore','finStats','finLapTimes','finPodium','leaderBody'].forEach((id,i)=>{
    const el=document.getElementById(id)||document.querySelector('.'+id);
    if(el){el.classList.add('finReveal');el.style.animationDelay=(i*.12+.05)+'s';}
  });
  // Hide mirror on finish
  const mf=document.getElementById('mirrorFrame'),ml=document.getElementById('mirrorLabel');
  if(mf)mf.style.display='none';if(ml)ml.style.display='none';
  if(p<=3)launchConfetti();
  if(p===1){
    Audio.playVictory();
    const gc=document.getElementById('goldCelebration');
    if(gc){gc.style.opacity='1';setTimeout(()=>{gc.style.opacity='0';},3500);}
    // Staggered personal message
    setTimeout(()=>showBanner('🏆 CHAMPION, SPENCER!','#ffd700',3000),800);
  }
  // Start title music on finish screen after a short delay (let fanfare/silence settle)
  setTimeout(()=>{
    if(audioCtx&&gameState==='FINISH'){
      if(!titleMusic){titleMusic=new TitleMusic(audioCtx);titleMusic.start();}
      else if(!titleMusic.running){titleMusic.start();}
    }
  }, p===1?2800:900);
}


function launchConfetti(){
  const cvs=document.getElementById('confettiCvs');if(!cvs)return;
  cvs.style.display='block';cvs.width=innerWidth;cvs.height=innerHeight;
  const ctx=cvs.getContext('2d');
  const colors=['#ff0000','#ff7700','#ffdd00','#00ee55','#00aaff','#aa44ff','#ff4488','#ffffff','#ffd700'];
  const pieces=Array.from({length:180},()=>({
    x:Math.random()*innerWidth, y:-30-Math.random()*innerHeight*.6,
    vx:(Math.random()-.5)*5, vy:2.5+Math.random()*4.5,
    rot:Math.random()*Math.PI*2, vrot:(Math.random()-.5)*.25,
    w:5+Math.random()*9, h:3+Math.random()*5,
    color:colors[Math.floor(Math.random()*colors.length)]
  }));
  function draw(){
    ctx.clearRect(0,0,cvs.width,cvs.height);
    let alive=false;
    pieces.forEach(p=>{
      p.x+=p.vx;p.y+=p.vy;p.rot+=p.vrot;p.vy+=.055;
      if(p.y<cvs.height+30){
        alive=true;
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);
        ctx.fillStyle=p.color;ctx.globalAlpha=Math.max(0,1-(p.y/cvs.height)*.65);
        ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);
        ctx.restore();
      }
    });
    if(alive)requestAnimationFrame(draw);
    else{ctx.clearRect(0,0,cvs.width,cvs.height);cvs.style.display='none';}
  }
  requestAnimationFrame(draw);
}


function fadePop(el,dur,cb){
  el.style.transform='scale(1.3)';el.style.opacity='1';
  const s=performance.now();const step=now=>{const p=(now-s)/dur;el.style.opacity=Math.max(0,1-p);el.style.transform=`scale(${1.3-p*.5})`;p<1?requestAnimationFrame(step):cb();};requestAnimationFrame(step);
}
