// js/gameplay/countdown.js — non-module script.

function runCountdown(onGo){
  try{
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
            onGo();
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

function playGridRevving(){
  // Simulate multiple engines revving before race start
  if(!audioCtx)return;
  const car=carObjs[playerIdx];
  const typeFreq=car?((car.def.type==='f1')?1.55:(car.def.type==='muscle')?0.7:(car.def.type==='electric')?0.4:1.0):1.0;
  // Quick aggressive blip
  const blip=(delay,freq,vol)=>{
    const t=audioCtx.currentTime+delay;
    const o=audioCtx.createOscillator(),g=audioCtx.createGain(),f=audioCtx.createBiquadFilter();
    o.type='sawtooth';f.type='lowpass';f.frequency.value=1800;f.Q.value=1.2;
    o.frequency.setValueAtTime(freq*typeFreq*.5,t);o.frequency.exponentialRampToValueAtTime(freq*typeFreq*1.8,t+.18);
    o.frequency.exponentialRampToValueAtTime(freq*typeFreq*.6,t+.4);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.06);g.gain.exponentialRampToValueAtTime(.001,t+.45);
    o.connect(f);f.connect(g);g.connect(_dst());o.start(t);o.stop(t+.5);
  };
  blip(0,200,.18);blip(.55,220,.2);blip(1.1,240,.22);blip(1.65,260,.25);blip(2.2,300,.28);
}
