// js/ui/hud.js — Fase 2.3/2.4 extraction. Non-module script.

// HUD DOM-refs (uit main.js verhuisd) — gevuld door cacheHUDRefs() bij boot.
// Cross-script zichtbaar voor cars/physics.js, gameplay/race.js,
// gameplay/spacefx.js, gameplay/tracklimits.js, effects/visuals.js.
let _elSlip,_elWarn,_mapCvs,_mapCtx,_elGear,_elLeader;
let _elWrongWay=null;
let _elScore=null,_elLapDelta=null;
let _elTire=null;
let _elSector=null;
let _elGapAhead=null,_elGapBehind=null;
let _elRpm=null;
let _elPos,_elPosOf,_elLap,_elSpd,_elNitro,_elLapTime,_elTireT,_elSecT,_elPitAvail,_elCloseBattle,_elFastestLapFlash;

function cacheHUDRefs(){
  // On mobile: hide performance-heavy HUD elements
  if(window._isMobile){
    ['hudLeader','sectorPanel','hudGap','hudScore','hudTire','hudTireTemp',
     'hudRainBtn','hudNightBtn','hudMuteBtn','ghostLabel','drsIndicator',
     'closeBattleEl','speedTrapEl','mirrorFrame','mirrorLabel','speedLines'].forEach(id=>{
      const el=document.getElementById(id);if(el)el.style.display='none';
    });
    if(renderer)renderer.setPixelRatio(Math.min(devicePixelRatio,1));
  }
  _elPos=document.getElementById('hdPos');
  _elPosOf=document.getElementById('hdPosOf');
  _elLap=document.getElementById('hdLap');
  _elSpd=document.getElementById('hdSpd');
  _elNitro=document.getElementById('nitroFill');
  _elLapTime=document.getElementById('hdLapTime');
  _elSlip=document.getElementById('slipIndicator');
  _elWarn=document.getElementById('warnOverlay');
  _mapCvs=document.getElementById('mapCvs');
  _mapCtx=_mapCvs?_mapCvs.getContext('2d'):null;
  _elGear=document.getElementById('hdGear');
  _elLeader=document.getElementById('hudLeader');
  _elWrongWay=document.getElementById('wrongWayOverlay');
  _elScore=document.getElementById('hdScore');
  _elLapDelta=document.getElementById('hdLapDelta');
  _elTire=document.getElementById('hdTire');
  _elRpm=document.getElementById('rpmFill');
  _elGapAhead=document.getElementById('gapAhead');
  _elGapBehind=document.getElementById('gapBehind');
  _drsEl=document.getElementById('drsIndicator');
  _sectorPanelEl=document.getElementById('sectorPanel');
  _speedTrapEl=document.getElementById('speedTrapEl');
  _elTireT={fl:document.getElementById('ttFL'),fr:document.getElementById('ttFR'),rl:document.getElementById('ttRL'),rr:document.getElementById('ttRR')};
  _elSecT=[document.getElementById('secT1'),document.getElementById('secT2'),document.getElementById('secT3')];
  _elPitAvail=document.getElementById('pitAvailable');
  _elCloseBattle=document.getElementById('closeBattleEl');
  _elFastestLapFlash=document.getElementById('fastestLapFlash');
}


function showBannerTop(text,color,dur){
  var el=document.getElementById('topBanner');if(!el)return;
  el.textContent=text;el.style.color=color;
  el.style.opacity='1';el.style.transform='translateX(-50%) translateY(0)';
  clearTimeout(el._t);el._t=setTimeout(function(){el.style.opacity='0';el.style.transform='translateX(-50%) translateY(20px)';},dur||2000);
}

function showPopup(text,color,dur=1000){
  const el=document.getElementById('popupMsg');
  el.textContent=text;el.style.color=color;el.style.textShadow='0 0 14px '+color+',0 2px 6px rgba(0,0,0,.85)';
  el.style.opacity='1'; // font-size now lives in CSS so it stays compact
  popupTimeouts.forEach(t=>clearTimeout(t));
  popupTimeouts=[setTimeout(()=>{const start=performance.now();const fade=now=>{const p=(now-start)/400;el.style.opacity=Math.max(0,1-p);if(p<1)requestAnimationFrame(fade);};requestAnimationFrame(fade);},dur)];
}


function showBanner(text,color,dur){
  if(bannerTimer)clearTimeout(bannerTimer);
  const ov=document.getElementById('bannerOverlay'),el=document.getElementById('bannerText');
  el.textContent=text;el.style.color=color;el.style.border='3px solid '+color;el.style.background='rgba(0,0,0,.8)';el.style.textShadow='0 0 20px '+color;
  ov.style.display='block';if(dur)bannerTimer=setTimeout(hideBanner,dur);
}

function hideBanner(){document.getElementById('bannerOverlay').style.display='none';}


function getPositions(){
  if(_posCache.length!==carObjs.length||(_posTick++%8===0)){
    _posCache.length=carObjs.length;
    for(let i=0;i<carObjs.length;i++)_posCache[i]=carObjs[i];
    _posCache.sort((a,b)=>{
      if(b.lap!==a.lap)return b.lap-a.lap;
      let ap=a.progress,bp=b.progress;
      if(Math.abs(bp-ap)>.5){if(ap<.5)ap+=1;else bp+=1;}
      return bp-ap;
    });
  }
  return _posCache;
}


function updateHUD(dt){
  const car=carObjs[playerIdx];if(!car)return;
  const pos=getPositions(),pPos=pos.findIndex(c=>c.isPlayer)+1;
  _elPos.textContent='P'+pPos;
  _elPos.style.color=pPos===1?'#00ee66':pPos<=3?'#ff9900':pPos>=6?'#ff4444':'#ffffff';
  _elPosOf.textContent='of '+carObjs.length;
  _elLap.textContent=Math.max(1,Math.min(car.lap,TOTAL_LAPS))+' / '+TOTAL_LAPS;
  _elSpd.textContent=Math.min(380,Math.round(Math.abs(car.speed)*165)); // 165 → Ferrari≈196 km/h, F1≈223 km/h, max boost cap 380
  if(_elLapTime){
    const elapsed=_nowSec-lapStartTime;
    _elLapTime.textContent='LAP '+fmtTime(elapsed)+(bestLapTime<Infinity?' · BEST '+fmtTime(bestLapTime):'');
  }
  // Lap delta vs personal best
  if(_elLapDelta&&car._lapStart&&bestLapTime<Infinity){
    const elapsed2=_nowSec-car._lapStart;
    const delta=elapsed2-bestLapTime;
    const sign=delta>=0?'+':'';
    _elLapDelta.textContent=' '+sign+delta.toFixed(2)+'s';
    _elLapDelta.style.color=delta<0?'#00ee66':'#ff4444';
  }
  // Score display
  if(_elScore)_elScore.textContent=totalScore.toLocaleString();
  // Tire wear indicator — 4 dots, only update when value changes
  if(_elTire){
    const w=car.tireWear||0;const filled=4-Math.round(w*4);
    const hits=car.hitCount||0;
    const tireKey=(filled<<4)|Math.min(hits,7);
    if(tireKey!==_lastTireKey){
      _lastTireKey=tireKey;
      const col=w<.35?'#00ee66':w<.65?'#ffbb00':'#ff3333';
      _elTire.style.color=col;
      const dmgStr=hits>=6?' DMG!':hits>=3?' DMG':'';
      _elTire.textContent='●'.repeat(filled)+'○'.repeat(4-filled)+dmgStr;
    }
  }
  // Tire temperature display
  const tempColor=t=>{
    if(t<0.18)return'#4488ff'; // cold — blue
    if(t<0.28)return'#88aaff'; // warming — light blue
    if(t<0.55)return'#00ee66'; // optimal — green
    if(t<0.72)return'#ffdd00'; // hot — yellow
    if(t<0.85)return'#ff8800'; // very hot — orange
    return'#ff2200';            // overheated — red
  };
  if(_elTireT){
    if(_elTireT.fl)_elTireT.fl.style.background=tempColor(_tireTemp.fl);
    if(_elTireT.fr)_elTireT.fr.style.background=tempColor(_tireTemp.fr);
    if(_elTireT.rl)_elTireT.rl.style.background=tempColor(_tireTemp.rl);
    if(_elTireT.rr)_elTireT.rr.style.background=tempColor(_tireTemp.rr);
  }
  // Sector panel update
  const secColors=['#cc44ff','#00ee66','#ffbb00','#666'];// purple=best,green=pb,yellow=slow,grey=no data
  if(_elSecT){
    for(let s=0;s<3;s++){
      const el=_elSecT[s];if(!el)continue;
      const best=_sectorBests[s];
      if(best<Infinity){el.textContent=best.toFixed(2)+'s';el.style.color=secColors[2];}
      else{el.textContent='--.-';el.style.color=secColors[3];}
    }
  }
  // Pit available indicator (only show once, when car is near pit zone and hasn't pitted yet)
  if(_elPitAvail){
    if(car&&!_pitStopUsed&&!_pitStopActive&&car.lap>1){
      const pz=car.mesh.position.z,px=car.mesh.position.x;
      _elPitAvail.style.display=(pz>160&&pz<220&&px>-200&&px<190)?'block':'none';
    }else{_elPitAvail.style.display='none';}
  }
  // Speed color on speedometer
  if(_elSpd){
    const speedRatio=Math.abs(car.speed)/(car.def.topSpd*1.55);
    _elSpd.style.color=speedRatio>.85?'#ff2222':speedRatio>.6?'#ff7700':speedRatio>.35?'#ffdd00':'#ff7700';
  }
  // Position change notification — only fire after position is stable for 0.4s
  // This prevents spam when cars jostle each other closely
  if(pPos!==_posStableValue){
    _posStableValue=pPos;_posStableT=0; // new candidate position, start timer
  }else if(_lastPPos&&pPos!==_lastPPos&&dt){
    _posStableT+=dt;
    if(_posStableT>=0.4){
      // Position has been stable for 0.4s — commit it
      if(pPos<_lastPPos){
        if(pPos===1){
          showPopup('🏆 P1 — RACE LEADER!','#ffd700',2200);
          showBanner('🏆 RACE LEADER!','#ffd700',2400);
          totalScore+=150;
          beep(880,.1,.42,0,'square');beep(1320,.08,.38,.1,'square');beep(1760,.12,.32,.2,'square');
          Audio.playCrowdCheer();setTimeout(()=>Audio.playCrowdCheer(),200);setTimeout(()=>Audio.playCrowdCheer(),400);
          if(_crowdGain&&audioCtx){_crowdGain.gain.setTargetAtTime(0.09,audioCtx.currentTime,.1);setTimeout(()=>{if(_crowdGain&&audioCtx)_crowdGain.gain.setTargetAtTime(0.062,audioCtx.currentTime,1.2);},1500);}
        }else{
          showPopup('▲ P'+pPos+' OVERTAKE!','#00ff88',1400);
          triggerCombo('OVERTAKE');
          totalScore+=50;
          Audio.playCrowdCheer();
        }
        floatText('▲ P'+pPos,'#00ff88',innerWidth*.5,innerHeight*.42);
      }else{
        showPopup('▼ P'+pPos,'#ff6644',1200);
        floatText('▼ P'+pPos,'#ff6644',innerWidth*.5,innerHeight*.42);
      }
      if(_elPos){_elPos.classList.remove('posPulse');void _elPos.offsetWidth;_elPos.classList.add('posPulse');}
      _lastPPos=pPos;
    }
  }else{
    _posStableT=0; // position matches _lastPPos — reset candidate timer
  }
  if(!_lastPPos)_lastPPos=pPos; // init on first frame
  // Gear indicator
  if(_elGear)_elGear.textContent=_currentGear;
  // Live leaderboard — only rebuild HTML when order is stable for 0.5s
  // Prevents P1/P2/P3 rows from constantly jumping when cars jostle
  if(_elLeader&&dt){
    const key=pos.map(c=>c.def.id).join(',');
    if(key!==_leaderPendingKey){
      _leaderPendingKey=key;_leaderStableT=0; // new order candidate
    }else if(key!==_lastLeaderOrder){
      _leaderStableT+=dt;
      if(_leaderStableT>=0.5){
        // Order stable for 0.5s — commit to screen
        _lastLeaderOrder=key;_leaderStableT=0;
        const refTime=bestLapTime<Infinity?bestLapTime:55;
        const leader=pos[0];
        _elLeader.innerHTML=pos.map((c,i)=>{
          let gapStr='';
          if(i===0){gapStr='<span class="lGap">LEAD</span>';}
          else{
            const lapDiff=leader.lap-c.lap;
            const progGap=leader.progress-c.progress;
            if(lapDiff>=1){
              gapStr=`<span class="lGap">+${lapDiff}LAP</span>`;
            }else{
              const secGap=Math.max(0,(lapDiff+progGap)*refTime);
              // Show "BATTLE" instead of 0.0s when cars are within 0.5s of each other
              gapStr=secGap<0.5?`<span class="lGap" style="color:#ff9900">BATTLE</span>`:`<span class="lGap">+${secGap.toFixed(1)}s</span>`;
            }
          }
          return `<div class="lRow${c.isPlayer?' lMe':''}"><span class="lPos">P${i+1}</span><span class="lName">${c.def.name}</span>${gapStr}</div>`;
        }).join('');
      }
    }
  }
  _mmFrameCtr=(_mmFrameCtr||0)+1;if(_mmFrameCtr%2===0)drawMinimap(pos);
}


function drawMinimap(pos){
  const cvs=_mapCvs||document.getElementById('mapCvs'),ctx=_mapCtx||(cvs&&cvs.getContext('2d'));
  if(!cvs||!ctx)return;
  const W=cvs.width,H=cvs.height;ctx.clearRect(0,0,W,H);
  const {mnX,mxX,mnZ,mxZ}=_mmBounds||{mnX:-320,mxX:320,mnZ:-255,mxZ:195};
  const pad=14,sc=Math.min((W-pad*2)/(mxX-mnX),(H-pad*2)/(mxZ-mnZ));
  const ox=pad+(W-pad*2-(mxX-mnX)*sc)*.5-mnX*sc,oz=pad+(H-pad*2-(mxZ-mnZ)*sc)*.5-mnZ*sc;
  const mx=x=>ox+x*sc,mz=z=>oz+z*sc;
  // Track — draw with sector colors
  const N=120;
  for(let si=0;si<N;si++){
    const t0=si/N,t1=(si+1)/N;
    const p0=trackCurve.getPoint(t0),p1=trackCurve.getPoint(t1);
    const sec=t0<.333?0:t0<.667?1:2;
    const secCol=['rgba(255,90,90,.85)','rgba(80,220,90,.85)','rgba(90,140,255,.85)'][sec];
    ctx.beginPath();ctx.strokeStyle=secCol;ctx.lineWidth=5;ctx.lineCap='round';
    ctx.moveTo(mx(p0.x),mz(p0.z));ctx.lineTo(mx(p1.x),mz(p1.z));ctx.stroke();
  }
  // Track outline
  ctx.beginPath();ctx.strokeStyle='rgba(220,220,230,.75)';ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineJoin='round';
  TRACK_WP.forEach(([x,z],i)=>i===0?ctx.moveTo(mx(x),mz(z)):ctx.lineTo(mx(x),mz(z)));
  ctx.closePath();ctx.stroke();
  // Start line
  ctx.fillStyle='#fff';ctx.fillRect(mx(TRACK_WP[0][0])-5,mz(TRACK_WP[0][1])-1.5,10,3);
  // Pit zone marker
  ctx.fillStyle='rgba(0,255,100,.55)';ctx.fillRect(mx(-60)-4,mz(190)-2,8,4);
  // Special objects (small dots)
  const dot=(x,z,r,col)=>{ctx.beginPath();ctx.arc(mx(x),mz(z),r,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();};
  jumpRamps.forEach(r=>dot(r.pos.x,r.pos.z,3,'#ff6600'));
  boostPads.forEach(p=>dot(p.pos.x,p.pos.z,2.5,'#00ccff'));
  spinPads.forEach(p=>dot(p.pos.x,p.pos.z,2.5,'#aa44ff'));
  // Cars — draw in reverse order so P1 renders on top
  // Collect screen positions to detect overlaps
  // Reuse pre-allocated array for minimap car positions
  if(!drawMinimap._pts)drawMinimap._pts=new Array(16);
  const mmPts=drawMinimap._pts;
  for(let i=0;i<pos.length;i++){
    if(!mmPts[i])mmPts[i]={car:null,px:0,pz:0};
    mmPts[i].car=pos[i];mmPts[i].px=mx(pos[i].mesh.position.x);mmPts[i].pz=mz(pos[i].mesh.position.z);
  }
  const mmLen=pos.length;
  // Draw dots first (back to front)
  for(let ri=mmLen-1;ri>=0;ri--){const{car,px,pz}=mmPts[ri];
    const col='#'+car.def.color.toString(16).padStart(6,'0');
    if(car.isPlayer){
      ctx.shadowColor='#ff7700';ctx.shadowBlur=8;
      ctx.beginPath();ctx.arc(px,pz,5.5,0,Math.PI*2);ctx.fillStyle='#ff7700';ctx.fill();
      ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();
      ctx.shadowBlur=0;
    }else{
      ctx.beginPath();ctx.arc(px,pz,3.5,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,.5)';ctx.lineWidth=1;ctx.stroke();
    }
  }
  // Draw position labels — offset away from nearby dots to avoid overlap
  ctx.font='bold 7px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
  for(let i=0;i<mmLen;i++){const{car,px,pz}=mmPts[i];
    const label='P'+(i+1);
    let ox=0,oy=-9;
    let crowded=false;
    for(let j=0;j<mmLen;j++){if(j!==i){const dpx=px-mmPts[j].px,dpz=pz-mmPts[j].pz;if(dpx*dpx+dpz*dpz<100)crowded=true;}}
    if(crowded){
      // Use angle from minimap center to spread labels outward
      const ang=Math.atan2(pz-H/2,px-W/2);
      ox=Math.cos(ang)*11;oy=Math.sin(ang)*11;
    }
    const lx=px+ox,ly=pz+oy;
    // Shadow for readability
    ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillText(label,lx+1,ly+1);
    ctx.fillStyle=car.isPlayer?'#ff9900':'rgba(255,255,255,0.85)';
    ctx.fillText(label,lx,ly);
  }
}

