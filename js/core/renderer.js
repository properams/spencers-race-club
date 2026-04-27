// js/core/renderer.js — Three.js WebGL renderer setup + context-loss recovery.
// Non-module script (zoals de andere js/core modules). Wordt geladen vóór main.js.
//
// Deze functie verwacht dat `renderer`, `scene`, `camera`, `_ctxLost`,
// `_ctxLostReloadTimer`, `audioCtx`, `activeWorld` en `buildScene`
// beschikbaar zijn als script-globals vanuit main.js of eerder geladen scripts.

'use strict';

function initRenderer(){
  const _mob=('ontouchstart' in window||navigator.maxTouchPoints>0)&&window.innerWidth<768;
  window._isMobile=_mob;
  const canvas=document.getElementById('glCanvas');
  let lastError;
  try{renderer=new THREE.WebGLRenderer({canvas,antialias:!_mob});}
  catch(e){lastError=e;renderer=null;}
  if(!renderer)try{renderer=new THREE.WebGLRenderer({canvas,antialias:false});}
  catch(e){lastError=e;renderer=null;}
  if(!renderer)throw new Error('WebGL mislukt: '+lastError?.message);
  // WebGL context-loss recovery: pause the render loop, show an overlay, and attempt
  // graceful restore. If the browser never fires 'restored' within the grace window, reload.
  const CTX_LOSS_RELOAD_MS=6000;
  canvas.addEventListener('webglcontextlost',e=>{
    e.preventDefault();
    _ctxLost=true;
    window.dbg&&dbg.warn('renderer','webglcontextlost — pauzeren + reload-timer '+CTX_LOSS_RELOAD_MS+'ms');
    const ov=document.getElementById('ctxLostOverlay');if(ov)ov.style.display='flex';
    if(audioCtx&&audioCtx.state==='running')audioCtx.suspend().catch(()=>{});
    _ctxLostReloadTimer=setTimeout(()=>{if(_ctxLost)location.reload();},CTX_LOSS_RELOAD_MS);
  });
  canvas.addEventListener('webglcontextrestored',()=>{
    window.dbg&&dbg.log('renderer','webglcontextrestored — scene rebuild');
    if(_ctxLostReloadTimer){clearTimeout(_ctxLostReloadTimer);_ctxLostReloadTimer=null;}
    _ctxLost=false;
    const ov=document.getElementById('ctxLostOverlay');if(ov)ov.style.display='none';
    if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
    try{if(scene&&activeWorld)buildScene();}catch(err){window.dbg&&dbg.error('renderer',err,'ctx restore rebuild failed');location.reload();}
  });
  window.addEventListener('beforeunload',()=>{try{renderer.dispose();renderer.forceContextLoss();}catch(e){}});
  document.addEventListener('visibilitychange',()=>{if(audioCtx)document.hidden?audioCtx.suspend():audioCtx.resume();});
  renderer.setPixelRatio(_mob?Math.min(devicePixelRatio,1.5):Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=!_mob;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.outputEncoding=THREE.sRGBEncoding;
  window.dbg&&dbg.log('renderer','init done — '+innerWidth+'×'+innerHeight+' dpr '+renderer.getPixelRatio().toFixed(2)+' shadow='+renderer.shadowMap.enabled+' THREE '+(THREE.REVISION||'?'));
  // Single resize pipeline: one rAF-debounced handler bound to resize, orientationchange and
  // visualViewport.resize. Re-evaluates device flags so portrait↔landscape (and split-view)
  // switches the iPad cleanly between mobile/tablet branches without a page reload.
  let _resizePending=false;
  function _handleResize(){
    if(_resizePending)return;
    _resizePending=true;
    requestAnimationFrame(()=>{
      _resizePending=false;
      _redetectDevice();
      if(!renderer)return;
      renderer.setSize(innerWidth,innerHeight);
      camera.aspect=innerWidth/innerHeight;
      camera.updateProjectionMatrix();
    });
  }
  window.addEventListener('resize',_handleResize);
  // Safari iOS: orientationchange fires before innerWidth/Height update — give it a tick.
  window.addEventListener('orientationchange',()=>setTimeout(_handleResize,120));
  // Split-view, virtual keyboard and pinch-zoom all change visualViewport without firing resize.
  if(window.visualViewport)window.visualViewport.addEventListener('resize',_handleResize);
}
