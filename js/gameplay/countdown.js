// js/gameplay/countdown.js — non-module script.

'use strict';

function runCountdown(onGo){
  try{
    if(window.dbg)dbg.markRaceEvent('CD-START');
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
      try{
        if(i<lights.length){
          var el=document.getElementById(lights[i]);if(el)el.classList.add('on');
          try{Audio.playCount(1);}catch(e){}
          i++;
          setTimeout(lightOn,700);
        }else{
          setTimeout(function(){
            try{
              lights.forEach(function(id,idx){
                var el=document.getElementById(id);
                if(el)setTimeout(function(){el.classList.remove('on');el.classList.add('extinguish');setTimeout(function(){el.classList.remove('extinguish');},420);},idx*45);
              });
              try{Audio.playCount(0);}catch(e){}
              try{Audio.playCrowdCheer();setTimeout(playCrowdCheer,180);setTimeout(playCrowdCheer,360);}catch(e){}
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
            onGo();
            if(window.dbg){
              setTimeout(()=>{try{dbg.markRaceEvent('GO+1s');}catch(_){}},1000);
              setTimeout(()=>{try{dbg.markRaceEvent('GO+3s');}catch(_){}},3000);
            }
            if(num)fadePop(num,550,function(){if(cdOv)cdOv.style.display='none';});
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
