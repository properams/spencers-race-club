// js/core/debug.js — debug-harness + opt-in visual badge.
// Non-module script. Geladen vóór alle subsystemen behalve config/device.
//
// Twee laagjes:
//   1. window.dbg — gestructureerde logger + error-ringbuffer (altijd beschikbaar).
//      Logger is no-op tenzij dbg.enabled (URL ?debug of localStorage src_debug=1).
//      Errors worden ALTIJD gecaptured (ook in productie) zodat je later
//      via dbg.errors() de laatste 50 fouten kunt ophalen.
//   2. ?debug-only badge — bestaande floating overlay met camera/renderer state.
//
// Activeren in productie zonder URL-wijziging:
//   localStorage.setItem('src_debug','1'); location.reload();
// Of channels filteren:
//   localStorage.setItem('src_debug_channels','pause,camera,renderer');

'use strict';

(function(){
  const URL_FLAG = new URLSearchParams(location.search).has('debug');
  let LS_FLAG = false, CHANNEL_FILTER = null;
  try {
    LS_FLAG = localStorage.getItem('src_debug') === '1';
    const ch = localStorage.getItem('src_debug_channels');
    if (ch) CHANNEL_FILTER = new Set(ch.split(',').map(s => s.trim()).filter(Boolean));
  } catch (_) { /* localStorage kan blocked zijn */ }
  const ENABLED = URL_FLAG || LS_FLAG;

  const T0 = performance.now();
  const ts = () => ((performance.now() - T0) / 1000).toFixed(3);

  const ERR_RING_MAX = 50;
  const errRing = [];
  function pushErr(kind, msg, extra) {
    const entry = { t: ts(), kind, msg: String(msg || ''), extra: extra || null };
    errRing.push(entry);
    if (errRing.length > ERR_RING_MAX) errRing.shift();
    return entry;
  }

  function shouldLog(channel) {
    if (!ENABLED) return false;
    if (!CHANNEL_FILTER) return true;
    return CHANNEL_FILTER.has(channel);
  }

  const dbg = {
    enabled: ENABLED,
    urlFlag: URL_FLAG,
    lsFlag: LS_FLAG,
    channelFilter: CHANNEL_FILTER ? [...CHANNEL_FILTER] : null,

    log(channel, ...args) {
      if (!shouldLog(channel)) return;
      console.log('[' + ts() + '][' + channel + ']', ...args);
    },

    warn(channel, ...args) {
      if (!shouldLog(channel)) return;
      console.warn('[' + ts() + '][' + channel + ']', ...args);
    },

    error(channel, err, extra) {
      const entry = pushErr(channel, err && err.message ? err.message : err, extra);
      console.error('[' + ts() + '][' + channel + ']', err, extra || '');
      return entry;
    },

    snapshot(channel, label, obj) {
      if (!shouldLog(channel)) return;
      try {
        const flat = {};
        for (const k of Object.keys(obj || {})) {
          const v = obj[k];
          flat[k] = (v && typeof v === 'object' && 'x' in v && 'y' in v && 'z' in v)
            ? '(' + v.x.toFixed(2) + ',' + v.y.toFixed(2) + ',' + v.z.toFixed(2) + ')'
            : v;
        }
        console.log('[' + ts() + '][' + channel + ']', label, flat);
      } catch (e) {
        console.log('[' + ts() + '][' + channel + ']', label, '(snapshot failed)', e);
      }
    },

    group(channel, label, fn) {
      if (!shouldLog(channel)) { try { fn(); } catch (e) { dbg.error(channel, e); } return; }
      console.group('[' + ts() + '][' + channel + '] ' + label);
      try { fn(); } catch (e) { dbg.error(channel, e); } finally { console.groupEnd(); }
    },

    errors() { return errRing.slice(); },
    clearErrors() { errRing.length = 0; },
  };

  // Globale fout-handlers — vangen scripts die anders stilletjes falen.
  window.addEventListener('error', (e) => {
    pushErr('window.error', e.message, { src: e.filename, line: e.lineno, col: e.colno });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    pushErr('unhandledrejection', r && r.message ? r.message : String(r), null);
  });

  window.dbg = dbg;
  if (ENABLED) {
    console.log('[dbg] enabled (url=' + URL_FLAG + ' ls=' + LS_FLAG + ')' +
      (CHANNEL_FILTER ? ' channels=[' + [...CHANNEL_FILTER].join(',') + ']' : ' all channels'));
  }
})();

// ── Bestaande visual badge (alleen ?debug in URL) ────────────────────────
if(new URLSearchParams(location.search).has('debug')){
  const dbgEl=document.createElement('div');
  dbgEl.id='debugBadge';
  dbgEl.style.cssText='position:fixed;top:8px;right:8px;font-family:monospace;font-size:11px;color:#fff;background:rgba(0,0,0,.78);padding:6px 10px;border-radius:6px;z-index:var(--z-critical);pointer-events:none;max-width:260px;line-height:1.4;white-space:pre';
  document.body.appendChild(dbgEl);
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
      dbgEl.textContent='win '+innerWidth+'×'+innerHeight+
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
