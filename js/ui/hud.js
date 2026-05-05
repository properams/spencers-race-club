// js/ui/hud.js — non-module script.

'use strict';

// Position cache (uit main.js verhuisd) — leaderboard berekent posities
// niet elk frame; cache wordt elke ~10 ticks ververst in updateHUD.
let _posCache=[],_posTick=0;

// Leaderboard stability (uit main.js verhuisd). Posities flikkeren tijdens
// tie-races; we committen alleen na 0.4-0.5s stabiliteit.
//   _lastLeaderOrder  — laatst gecommitte volgorde-string
//   _leaderPendingKey — kandidaat-volgorde
//   _leaderStableT    — accumulator (commit bij >=0.5s)
//   _posStableValue / _posStableT — zelfde voor speler-positie (>=0.4s)
let _lastLeaderOrder='';
let _leaderPendingKey='',_leaderStableT=0;
let _posStableValue=0,_posStableT=0;
// _lastPPos: vorige speler-positie (voor overtake-detectie in updateHUD).
let _lastPPos=0;

// HUD-extra state (uit main.js verhuisd).
//   _currentGear  — display gear (audio/engine.js zet 'm in updateEngine).
//   _mmBounds     — cached minimap-bounds {mnX,mxX,mnZ,mxZ} per wereld.
//                   Geset in core/scene.js buildScene().
//   _mmFrameCtr   — minimap-redraw throttle (1 frame per 2 ticks).
let _currentGear=1;
let _mmBounds=null;
let _mmFrameCtr=0;

// fmtTime: lap-time formatter, gebruikt door HUD + finish-screen + progression.
// const → script-scope binding; expliciet ook op window voor ES-module
// persistence/progression.js die window.fmtTime aanroept.
const fmtTime=s=>s<60?s.toFixed(2)+'s':Math.floor(s/60)+'m'+(s%60).toFixed(2)+'s';
window.fmtTime=fmtTime;

// HUD DOM-refs (uit main.js verhuisd) — gevuld door cacheHUDRefs() bij boot.
// Cross-script zichtbaar voor cars/physics.js, gameplay/race.js,
// gameplay/spacefx.js, gameplay/tracklimits.js, effects/visuals.js.
let _elSlip,_elWarn,_mapCvs,_mapCtx,_elGear,_elLeader;
let _elWrongWay=null;
// _elScore is opgegaan in finish-screen — geen race-HUD score meer.
let _elLapDelta=null;
// _elTire (oude separate tire-dot text) is opgegaan in _elTireT (4 csTire dots)
// die nu zowel temp als damage encoden. _elCarStatus is de panel-wrapper voor
// fade-in/out wanneer wear/temp uit het optimale venster komen.
let _elCarStatus=null;
// _elSector was dead code (nergens gevuld of gelezen) — verwijderd.
// Gap-display verwijderd in HUD-redesign: leaderboard toont al rij-1/rij+1
// rond de speler, dus een aparte gap-panel was dubbel-info.
let _elRpm=null;
let _elPos,_elPosOf,_elLap,_elSpd,_elNitro,_elNitroInd,_elNitroIndFill,_elLapTime,_elTireT,_elSecT,_elPitAvail,_elCloseBattle,_elFastestLapFlash;
// Verhuisd uit main.js — gevuld in cacheHUDRefs hieronder.
let _sectorPanelEl=null,_speedTrapEl=null;

function cacheHUDRefs(){
  // On mobile: hide performance-heavy HUD elements
  if(window._isMobile){
    // hudLeader stays a CSS-only hide so the L-hotkey can still un-hide it
    // via the .lShow override (handy on tablets with external keyboards).
    // hudNightBtn blijft op mobile staan — user wil de day/night toggle
    // expliciet beschikbaar tijdens race op alle device-types.
    ['sectorPanel','hudCarStatus',
     'hudRainBtn','hudMuteBtn','ghostLabel',
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
  _elNitroInd=document.getElementById('tcNitro');
  _elNitroIndFill=document.getElementById('tcNitroFill');
  _elLapTime=document.getElementById('hdLapTime');
  _elSlip=document.getElementById('slipIndicator');
  _elWarn=document.getElementById('warnOverlay');
  _mapCvs=document.getElementById('mapCvs');
  _mapCtx=_mapCvs?_mapCvs.getContext('2d'):null;
  _elGear=document.getElementById('hdGear');
  _elLeader=document.getElementById('hudLeader');
  _elWrongWay=document.getElementById('wrongWayOverlay');
  _elLapDelta=document.getElementById('hdLapDelta');
  _elCarStatus=document.getElementById('hudCarStatus');
  _elRpm=document.getElementById('rpmFill');
  _sectorPanelEl=document.getElementById('sectorPanel');
  _speedTrapEl=document.getElementById('speedTrapEl');
  _elTireT={fl:document.getElementById('ttFL'),fr:document.getElementById('ttFR'),rl:document.getElementById('ttRL'),rr:document.getElementById('ttRR')};
  _elSecT=[document.getElementById('secT1'),document.getElementById('secT2'),document.getElementById('secT3')];
  _elPitAvail=document.getElementById('pitAvailable');
  _elCloseBattle=document.getElementById('closeBattleEl');
  _elFastestLapFlash=document.getElementById('fastestLapFlash');
}


// showPopup / showBanner / showBannerTop / hideBanner zijn nu thin wrappers
// rond window.Notify (zie js/ui/notifications.js + NOTIFICATIONS_PLAN.md).
// Externe call-sites (cars/physics.js, worlds/*, ui/input.js, gameplay/*)
// blijven werken zonder wijziging — ze raken automatisch de Notify-facade.

// _inferPopupPriority: classificeert een popup-string naar Notify-priority
// op basis van vaste tekst-patronen die throughout the codebase gebruikt
// worden. Hogere prioriteit overrulet lager (race-leader > overtake > hint).
function _inferPopupPriority(text){
  if(/RACE LEADER/i.test(text)) return 100;
  if(/FASTEST LAP/i.test(text)) return 90;
  if(/OVERTAKE/i.test(text))    return 60;
  if(/^▼\s*P\d/i.test(text))    return 50;
  if(/DRIFT|MINI TURBO|FRESH TYRES|TYRES WORN|NITRO/i.test(text)) return 50;
  if(/HARD LANDING|COLD TYRES/i.test(text)) return 40;
  if(/CAM|MIRROR|LEADERBOARD|PIT ENTRY/i.test(text)) return 30;
  return 40; // world hazards, generic
}

function showBannerTop(text,color,dur){
  if(!window.Notify){
    if(window.dbg)dbg.warn('notify','Notify niet ready, drop showBannerTop',text);
    return;
  }
  // tracklimits.js stuurt 'LAP n / N'; weather.js stuurt 'RAIN INCOMING' etc.
  // De eerste hoort in Zone B (subtiel, top-center), de tweede in Zone A.
  var m=/^LAP\s+(\d+)\s*\/\s*(\d+)/i.exec(text);
  if(m){ Notify.lap(+m[1],+m[2]); return; }
  Notify.status(text,{color:color,dur:dur||2000,priority:70});
}

function showPopup(text,color,dur=1000){
  if(!window.Notify){
    if(window.dbg)dbg.warn('notify','Notify niet ready, drop showPopup',text);
    return;
  }
  Notify.status(text,{color:color,dur:dur,priority:_inferPopupPriority(text)});
}

function showBanner(text,color,dur){
  if(!window.Notify){
    if(window.dbg)dbg.warn('notify','Notify niet ready, drop showBanner',text);
    return;
  }
  Notify.banner(text,color,dur);
}

// hideBanner: door tracklimits.js + spacefx.js gebruikt om een persistente
// banner (dur=0) expliciet te dismissen — vooral spacefx.js FALLING-banner
// die blijft staan tot triggerSpaceRecovery() 'm wegtrekt.
function hideBanner(){
  if(window.Notify && typeof Notify.hideBanner==='function') Notify.hideBanner();
}


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
  // Semantic palette: P1 = success, podium = accent, midfield = primary, back = warning.
  _elPos.style.color = pPos===1 ? 'var(--hud-success)'
                     : pPos<=3 ? 'var(--hud-accent)'
                     : pPos>=6 ? 'var(--hud-warning)'
                     : 'var(--hud-text)';
  _elPosOf.textContent='/'+carObjs.length;
  _elLap.textContent=Math.max(1,Math.min(car.lap,TOTAL_LAPS))+' / '+TOTAL_LAPS;
  _elSpd.textContent=Math.min(380,Math.round(Math.abs(car.speed)*165)); // 165 → Ferrari≈196 km/h, F1≈223 km/h, max boost cap 380
  if(_elLapTime){
    const elapsed=_nowSec-lapStartTime;
    _elLapTime.textContent=fmtTime(elapsed)+(bestLapTime<Infinity?' · '+fmtTime(bestLapTime):'');
  }
  // Lap delta vs personal best
  if(_elLapDelta&&car._lapStart&&bestLapTime<Infinity){
    const elapsed2=_nowSec-car._lapStart;
    const delta=elapsed2-bestLapTime;
    const sign=delta>=0?'+':'';
    _elLapDelta.textContent=sign+delta.toFixed(2);
    _elLapDelta.style.color=delta<0?'var(--hud-success)':'var(--hud-warning)';
  }
  // Car status: 4 tyre dots, dual-encoded (inner=temp, ring=damage).
  // Panel auto-fades in when wear>=30% or any tyre is outside the optimal
  // window. Stays hidden during a clean drive so it doesn't add visual noise.
  if(_elCarStatus&&_elTireT){
    const w=car.tireWear||0;
    const hits=car.hitCount||0;
    const dmg=Math.max(w,Math.min(1,hits/9));
    // Damage ring: green (clean) → amber (worn) → red (critical)
    const ringCol = dmg<.35 ? 'var(--hud-success)'
                  : dmg<.7  ? 'var(--hud-accent)'
                              : 'var(--hud-warning)';
    // Cold/optimal/hot fill per wheel
    const tireFill=t=>{
      if(t<0.28)return'var(--hud-primary)';   // cold
      if(t<0.65)return'var(--hud-success)';   // optimal
      if(t<0.85)return'var(--hud-accent)';    // hot
      return'var(--hud-warning)';              // overheated
    };
    const tempBad = _tireTemp.fl<0.28||_tireTemp.fr<0.28||_tireTemp.rl<0.28||_tireTemp.rr<0.28
                  ||_tireTemp.fl>0.65||_tireTemp.fr>0.65||_tireTemp.rl>0.65||_tireTemp.rr>0.65;
    const showStatus = dmg>=0.30 || tempBad;
    _elCarStatus.classList.toggle('csOn',showStatus);
    // Composite key — string keeps each component unambiguous and allocation
    // cost is negligible (only used to skip already-up-to-date DOM writes).
    const tireKey=Math.round(w*16)+'|'+Math.min(hits,15)
                 +'|'+Math.round(_tireTemp.fl*8)+'|'+Math.round(_tireTemp.fr*8)
                 +'|'+Math.round(_tireTemp.rl*8)+'|'+Math.round(_tireTemp.rr*8);
    if(tireKey!==_lastTireKey){
      _lastTireKey=tireKey;
      if(_elTireT.fl){_elTireT.fl.style.background=tireFill(_tireTemp.fl);_elTireT.fl.style.boxShadow='0 0 0 2px '+ringCol;}
      if(_elTireT.fr){_elTireT.fr.style.background=tireFill(_tireTemp.fr);_elTireT.fr.style.boxShadow='0 0 0 2px '+ringCol;}
      if(_elTireT.rl){_elTireT.rl.style.background=tireFill(_tireTemp.rl);_elTireT.rl.style.boxShadow='0 0 0 2px '+ringCol;}
      if(_elTireT.rr){_elTireT.rr.style.background=tireFill(_tireTemp.rr);_elTireT.rr.style.boxShadow='0 0 0 2px '+ringCol;}
    }
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
          // Vóór Notify-refactor schreef showPopup naar #popupMsg en showBanner
          // naar #bannerOverlay (twee verschillende DOM-zones, beide zichtbaar).
          // Notify is single-slot per zone; één enkele LEADER-status volstaat.
          showPopup('🏆 P1 — RACE LEADER!','#ffd700',2400);
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
        // Floating "▲ P"/"▼ P" label removed — position is permanently shown
        // in the race-info panel and posPulse already animates the change.
      }else{
        showPopup('▼ P'+pPos,'#ff6644',1200);
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
  // Prevents P1/P2/P3 rows from constantly jumping when cars jostle.
  // Default state is "collapsed": top-3 + driver above/below player + player.
  // Hotkey L (handled in ui/input.js) flips window._leaderExpanded to show all.
  if(_elLeader&&dt){
    const expanded=!!window._leaderExpanded;
    // On mobile, .lShow overrides the CSS display:none so the L-hotkey
    // still works for users with an external keyboard.
    _elLeader.classList.toggle('lShow',expanded);
    // Include the expanded flag in the cache-key so a toggle forces a rebuild.
    const key=pos.map(c=>c.def.id).join(',')+(expanded?':E':':C');
    if(key!==_leaderPendingKey){
      _leaderPendingKey=key;_leaderStableT=0;
    }else if(key!==_lastLeaderOrder){
      // Manual toggle should feel instant — no 0.5s wait when only the flag flipped.
      const orderChanged=key.replace(/:[EC]$/,'')!==_lastLeaderOrder.replace(/:[EC]$/,'');
      _leaderStableT = orderChanged ? _leaderStableT+dt : 0.5;
      if(_leaderStableT>=0.5){
        _lastLeaderOrder=key;_leaderStableT=0;
        const refTime=bestLapTime<Infinity?bestLapTime:55;
        const leader=pos[0];
        const pIdx=pos.findIndex(c=>c.isPlayer);
        // Decide which row indices to render.
        let rowIdx;
        if(expanded||pos.length<=5){
          rowIdx=pos.map((_,i)=>i);
        }else{
          // Always include podium + player + the cars directly ahead/behind player.
          const set=new Set([0,1,2]);
          if(pIdx>=0){set.add(pIdx);if(pIdx>0)set.add(pIdx-1);if(pIdx<pos.length-1)set.add(pIdx+1);}
          rowIdx=[...set].sort((a,b)=>a-b);
        }
        const rowFor=i=>{
          const c=pos[i];
          let gapStr;
          if(i===0){gapStr='<span class="lGap">LEAD</span>';}
          else{
            const lapDiff=leader.lap-c.lap;
            const progGap=leader.progress-c.progress;
            if(lapDiff>=1){
              gapStr=`<span class="lGap">+${lapDiff}LAP</span>`;
            }else{
              const secGap=Math.max(0,(lapDiff+progGap)*refTime);
              gapStr=secGap<0.5?'<span class="lGap" style="color:var(--hud-warning)">BATTLE</span>':`<span class="lGap">+${secGap.toFixed(1)}s</span>`;
            }
          }
          return `<div class="lRow${c.isPlayer?' lMe':''}"><span class="lPos">P${i+1}</span><span class="lName">${c.def.name}</span>${gapStr}</div>`;
        };
        const parts=[];
        for(let k=0;k<rowIdx.length;k++){
          if(k>0&&rowIdx[k]-rowIdx[k-1]>1)parts.push('<div class="lSep">···</div>');
          parts.push(rowFor(rowIdx[k]));
        }
        _elLeader.innerHTML=parts.join('');
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

