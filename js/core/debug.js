// js/core/debug.js — opt-in debug overlay (?debug in URL).
// Non-module script. Toont real-time camera/renderer/viewport-state
// als floating badge.

'use strict';

if(new URLSearchParams(location.search).has('debug')){
  const dbg=document.createElement('div');
  dbg.id='debugBadge';
  dbg.style.cssText='position:fixed;top:8px;right:8px;font-family:monospace;font-size:11px;color:#fff;background:rgba(0,0,0,.78);padding:6px 10px;border-radius:6px;z-index:var(--z-critical);pointer-events:none;max-width:260px;line-height:1.4;white-space:pre';
  document.body.appendChild(dbg);
  window._updateDebugBadge=function(){
    try{
      const vv=window.visualViewport,cam=window.camera,rnd=window.renderer,cars=window.carObjs,pIdx=window.playerIdx;
      let camLine='cam: not ready',rendLine='renderer: not ready';
      if(cam){
        const cp=cam.position;
        camLine='cam fov '+(cam.fov||0).toFixed(1)+' asp '+(cam.aspect||0).toFixed(3)+
          '\ncam pos '+cp.x.toFixed(1)+','+cp.y.toFixed(1)+','+cp.z.toFixed(1);
        if(cars&&typeof pIdx==='number'&&cars[pIdx]&&cars[pIdx].mesh){
          const pp=cars[pIdx].mesh.position,dist=cp.distanceTo(pp);
          camLine+='\nplayer '+pp.x.toFixed(1)+','+pp.y.toFixed(1)+','+pp.z.toFixed(1)+' d '+dist.toFixed(1);
        }
      }
      if(rnd&&typeof THREE!=='undefined'){
        const sz=new THREE.Vector2();rnd.getSize(sz);
        rendLine='rend '+sz.x+'×'+sz.y+' pr '+rnd.getPixelRatio().toFixed(2);
      }
      dbg.textContent='win '+innerWidth+'×'+innerHeight+
        (vv?' vv '+Math.round(vv.width)+'×'+Math.round(vv.height):'')+
        ' dpr '+(devicePixelRatio||1).toFixed(2)+' asp '+(innerWidth/innerHeight).toFixed(2)+
        '\nmob '+(!!window._isMobile)+' tab '+(!!window._isTablet)+' iPad '+(!!window._isIPadLike)+
        '\n'+rendLine+'\n'+camLine;
    }catch(_){/* never block init */}
  };
  window._updateDebugBadge();
  setInterval(window._updateDebugBadge,330);
  window.addEventListener('resize',window._updateDebugBadge);
}
