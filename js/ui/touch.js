// js/ui/touch.js — Fase 2.3/2.4 extraction. Non-module script.

// Touch input config (uit main.js verhuisd).
// Haptic feedback patterns per control (ms) — short buzz for precise, slightly longer for boost/drift.
const _HAPTIC_MS={ArrowLeft:8,ArrowRight:8,ArrowUp:0,ArrowDown:12,KeyN:18,Space:15};
// Buttons that should also trigger gas (ArrowUp) — makes nitro/drift usable with one hand.
const _ALSO_GAS={KeyN:true,Space:true};

function _releaseWakeLock(){
  if(_wakeLock){try{_wakeLock.release();}catch(_){}_wakeLock=null;}
}

function setTouchControlsVisible(show){
  const tc=document.getElementById('touchControls');if(!tc)return;
  tc.style.display=show&&_touchControlsReady?'block':'none';
  if(show)_acquireWakeLock();else _releaseWakeLock();
}

function initTouchControls(){
  if(!window._useTouchControls)return;
  _touchControlsReady=true;
  const tc=document.getElementById('touchControls');
  const canVibrate='vibrate' in navigator;
  // Use pointer events for unified touch+mouse support
  tc.querySelectorAll('.tcBtn').forEach(btn=>{
    const key=btn.dataset.key;
    const hapticMs=_HAPTIC_MS[key]||0;
    const alsoGas=_ALSO_GAS[key];
    const on=e=>{
      e.preventDefault();e.stopPropagation();
      keys[key]=true;btn.classList.add('active');
      if(alsoGas)keys['ArrowUp']=true;
      if(canVibrate&&hapticMs>0)try{navigator.vibrate(hapticMs);}catch(_){}
    };
    const off=e=>{
      e.preventDefault();e.stopPropagation();
      keys[key]=false;btn.classList.remove('active');
      // Only release ArrowUp if gas button isn't also pressed
      if(alsoGas){
        const gasBtn=document.getElementById('tcGas');
        if(!gasBtn||!gasBtn.classList.contains('active'))keys['ArrowUp']=false;
      }
    };
    btn.addEventListener('pointerdown',on,{passive:false});
    btn.addEventListener('pointerup',off,{passive:false});
    btn.addEventListener('pointercancel',off,{passive:false});
    btn.addEventListener('pointerleave',off,{passive:false});
    // Prevent context menu on long press
    btn.addEventListener('contextmenu',e=>e.preventDefault());
  });
  // Prevent default touch behaviors on the game canvas
  const cvs=document.getElementById('glCanvas');
  if(cvs){
    cvs.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});
    cvs.addEventListener('contextmenu',e=>e.preventDefault());
  }
  // ── Swipe steering bar ──
  const steerBar=document.getElementById('tcSteer');
  if(steerBar){
    const DEAD_ZONE=.15; // center 30% = neutral
    let steerActive=false,lastRatio=0;
    function steerUpdate(clientX){
      const rect=steerBar.getBoundingClientRect();
      const cx=rect.left+rect.width/2;
      const halfW=rect.width/2-28;
      let dx=clientX-cx;
      if(dx<-halfW)dx=-halfW;if(dx>halfW)dx=halfW;
      steerBar.style.setProperty('--steer-x',dx+'px');
      const ratio=dx/halfW;
      const wasLeft=keys['ArrowLeft'],wasRight=keys['ArrowRight'];
      if(Math.abs(ratio)<DEAD_ZONE){keys['ArrowLeft']=false;keys['ArrowRight']=false;}
      else if(ratio<0){keys['ArrowLeft']=true;keys['ArrowRight']=false;}
      else{keys['ArrowLeft']=false;keys['ArrowRight']=true;}
      // Haptic tick when crossing dead-zone boundary
      if(canVibrate&&((!wasLeft&&keys['ArrowLeft'])||(!wasRight&&keys['ArrowRight'])))try{navigator.vibrate(6);}catch(_){}
      lastRatio=ratio;
    }
    function steerStart(e){
      e.preventDefault();steerActive=true;steerBar.classList.add('active');
      try{steerBar.setPointerCapture(e.pointerId);}catch(_){}
      steerUpdate(e.clientX);
    }
    function steerMove(e){if(!steerActive)return;e.preventDefault();steerUpdate(e.clientX);}
    function steerEnd(e){
      if(!steerActive)return;steerActive=false;e.preventDefault();
      steerBar.classList.remove('active');
      steerBar.style.setProperty('--steer-x','0px');
      keys['ArrowLeft']=false;keys['ArrowRight']=false;
    }
    steerBar.addEventListener('pointerdown',steerStart,{passive:false});
    steerBar.addEventListener('pointermove',steerMove,{passive:false});
    steerBar.addEventListener('pointerup',steerEnd,{passive:false});
    steerBar.addEventListener('pointercancel',steerEnd,{passive:false});
    steerBar.addEventListener('pointerleave',steerEnd,{passive:false});
    steerBar.addEventListener('contextmenu',e=>e.preventDefault());
  }
}

