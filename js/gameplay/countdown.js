// js/gameplay/countdown.js — non-module script.

'use strict';

// Generation counter — invalideert pending setTimeout chains uit een
// vorige countdown als user quit + restart tijdens countdown. Zonder
// deze guard zouden twee parallelle lightOn-chains lopen, dubbele beeps
// + dubbele onGo() callbacks geven.
var _cdGen=0;

function runCountdown(onGo){
  try{
    if(window.dbg)dbg.markRaceEvent('CD-START');
    var gen=++_cdGen;
    // Audio-unlock guard: op iOS kan AudioContext suspended raken na
    // backgrounding. Fire-and-forget resume — visuele tick gaat sowieso
    // door, audio mag stil blijven of inhalen.
    if(window.audioCtx&&(audioCtx.state==='suspended'||audioCtx.state==='interrupted')){
      if(window.dbg)dbg.warn('countdown','audioCtx '+audioCtx.state+' at start, attempting resume');
      try{audioCtx.resume().catch(function(e){
        if(window.dbg)dbg.warn('countdown','audioCtx resume failed: '+(e&&e.message||e));
      });}catch(_){}
    }
    const lights=['fl1','fl2','fl3','fl4','fl5'];
    const f1El=document.getElementById('f1Lights');
    const num=document.getElementById('cdNum');
    const cdOv=document.getElementById('cdOverlay');
    lights.forEach(function(id){var el=document.getElementById(id);if(el)el.classList.remove('on');});
    if(f1El)f1El.style.display='flex';
    if(cdOv)cdOv.style.display='none';
    try{_playCountdownRoll();}catch(_){}
    var i=0;
    var lightOn=function(){
      if(gen!==_cdGen){if(window.dbg)dbg.log('countdown','stale tick dropped (gen '+gen+' vs '+_cdGen+')');return;}
      try{
        if(i<lights.length){
          var el=document.getElementById(lights[i]);if(el)el.classList.add('on');
          try{Audio.playCount(1);}catch(e){}
          if(window.dbg)dbg.log('countdown','light '+(i+1)+'/5');
          i++;
          setTimeout(lightOn,700);
        }else{
          setTimeout(function(){
            if(gen!==_cdGen){if(window.dbg)dbg.log('countdown','stale GO dropped (gen '+gen+' vs '+_cdGen+')');return;}
            try{
              lights.forEach(function(id,idx){
                var el=document.getElementById(id);
                if(el)setTimeout(function(){el.classList.remove('on');el.classList.add('extinguish');setTimeout(function(){el.classList.remove('extinguish');},420);},idx*45);
              });
              try{Audio.playCount(0);}catch(e){}
              try{Audio.playCrowdCheer();
                setTimeout(function(){if(gen!==_cdGen)return;try{playCrowdCheer();}catch(_){}},180);
                setTimeout(function(){if(gen!==_cdGen)return;try{playCrowdCheer();}catch(_){}},360);
              }catch(e){}
              if(audioCtx){try{
                var t=audioCtx.currentTime;
                var o=audioCtx.createOscillator(),g=audioCtx.createGain(),f=audioCtx.createBiquadFilter();
                o.type='sawtooth';f.type='lowpass';f.frequency.value=2200;
                o.frequency.setValueAtTime(80,t);o.frequency.exponentialRampToValueAtTime(520,t+.6);
                g.gain.setValueAtTime(.28,t);g.gain.exponentialRampToValueAtTime(.001,t+.75);
                o.connect(f);f.connect(g);g.connect(_dst());o.start(t);o.stop(t+.8);
              }catch(e){}}
              if(cdOv)cdOv.style.display='flex';
              if(num){num.textContent='GO!';num.style.color='#00ff55';num.style.textShadow='0 0 60px #00ff88,0 0 120px #00cc55';num.style.opacity='1';num.style.transform='scale(1.5)';}
              if(f1El)f1El.style.display='none';
            }catch(e){window.dbg?dbg.error('countdown',e,'GO error'):console.error('Countdown GO error:',e);}
            // ALWAYS fire onGo — even if visuals fail
            if(window.dbg)dbg.markRaceEvent('GO');
            if(window.perfMark){perfMark('go:fired');window._waitingForFirstRaceFrame=true;}
            onGo();
            if(window.dbg){
              setTimeout(()=>{if(gen!==_cdGen)return;try{dbg.markRaceEvent('GO+1s');}catch(_){}},1000);
              setTimeout(()=>{if(gen!==_cdGen)return;try{dbg.markRaceEvent('GO+3s');}catch(_){}},3000);
            }
            if(num)fadePop(num,550,function(){if(gen!==_cdGen)return;if(cdOv)cdOv.style.display='none';});
          },150+Math.random()*130);
        }
      }catch(e){window.dbg?dbg.error('countdown',e,'lightOn error'):console.error('Countdown lightOn error:',e);onGo();}
    };
    setTimeout(lightOn,600);
  }catch(e){
    if(window.dbg)dbg.error('countdown',e,'runCountdown crashed');
    else console.error('Countdown crashed:',e);
    onGo();
  }
}

// playGridRevving was dead — pre-race grid-revving SFX, nooit ge-wired
// in runCountdown (alleen Audio.playCount + Audio.playCrowdCheer worden
// op grid afgespeeld). Verwijderd in dead-code cleanup.
