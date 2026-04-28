// js/core/perf.js — performance-overlay (Ctrl+Shift+P).
// Non-module script. Geladen na debug.js zodat dbg-keyboard handlers eerst draaien.
//
// Toont een floating panel met:
//   - FPS (1-second moving average) + frame-time spread
//   - JS heap (alleen Chrome — performance.memory niet std)
//   - Renderer info (draw calls, triangles, geometries, textures)
//   - Scene-stats (objects, lights, materials)
//   - Timestamp + sessie-uptime
//
// Toggle: Ctrl+Shift+P. Refresh elke 500ms wanneer open.
// Werkt onafhankelijk van dbg.enabled (productie-debug-tool).

'use strict';

(function(){
  let _perfEl = null, _perfTimer = null;
  const _frameTimes = []; // ringbuffer laatste 60 frames
  let _lastFrame = 0;
  let _rafId = null;

  // Frame-time tracking draait ALLEEN wanneer de overlay zichtbaar is —
  // anders zou perf.js zelf 60× per seconde wakker zijn voor niets.
  function _trackFrame(){
    const now = performance.now();
    if (_lastFrame > 0) {
      const dt = now - _lastFrame;
      _frameTimes.push(dt);
      if (_frameTimes.length > 60) _frameTimes.shift();
    }
    _lastFrame = now;
    _rafId = requestAnimationFrame(_trackFrame);
  }
  function _startTracking(){
    if (_rafId !== null) return;
    _frameTimes.length = 0; _lastFrame = 0;
    _rafId = requestAnimationFrame(_trackFrame);
  }
  function _stopTracking(){
    if (_rafId !== null) { cancelAnimationFrame(_rafId); _rafId = null; }
  }

  function _avgFps(){
    if (!_frameTimes.length) return 0;
    const avg = _frameTimes.reduce((a,b)=>a+b,0) / _frameTimes.length;
    return avg > 0 ? 1000 / avg : 0;
  }
  function _frameSpread(){
    if (_frameTimes.length < 2) return 0;
    const sorted = [..._frameTimes].sort((a,b)=>a-b);
    return sorted[sorted.length-1] - sorted[0]; // jitter ms
  }

  function _build(){
    const el = document.createElement('div');
    el.id = 'perfOverlay';
    el.style.cssText = 'position:fixed;top:8px;left:8px;background:rgba(0,0,0,.85);color:#9ff;font-family:monospace;font-size:11px;padding:10px 14px;border-radius:6px;z-index:99996;pointer-events:none;line-height:1.55;letter-spacing:.5px;border:1px solid rgba(0,200,255,.3);box-shadow:0 4px 16px rgba(0,200,255,.15);min-width:240px;display:none';
    document.body.appendChild(el);
    _perfEl = el;
    return el;
  }

  function _refresh(){
    if (!_perfEl) return;
    const lines = [];
    const fps = _avgFps();
    const spread = _frameSpread();
    const fpsCol = fps >= 55 ? '#0f0' : fps >= 30 ? '#fc0' : '#f64';
    lines.push(`<span style="color:#888">FPS</span>  <span style="color:${fpsCol};font-weight:bold">${fps.toFixed(1)}</span>  <span style="color:#666">(jitter ${spread.toFixed(1)}ms)</span>`);

    // Heap (Chrome-only)
    if (performance.memory) {
      const m = performance.memory;
      const used = (m.usedJSHeapSize/1048576).toFixed(1);
      const lim = (m.jsHeapSizeLimit/1048576).toFixed(0);
      lines.push(`<span style="color:#888">HEAP</span> ${used}M / ${lim}M`);
    }

    // Renderer info
    if (window.renderer && window.renderer.info) {
      const r = window.renderer.info;
      const rd = r.render, mem = r.memory;
      lines.push(`<span style="color:#888">DRAW</span> ${rd.calls} calls · ${rd.triangles.toLocaleString()} tris`);
      lines.push(`<span style="color:#888">GEOM</span> ${mem.geometries} · <span style="color:#888">TEX</span> ${mem.textures}`);
    } else {
      lines.push('<span style="color:#666">renderer not ready</span>');
    }

    // Scene-stats
    if (window.scene) {
      let nMesh=0, nLight=0, nGroup=0;
      window.scene.traverse(o => {
        if (o.isMesh || o.isPoints || o.isLine) nMesh++;
        else if (o.isLight) nLight++;
        else if (o.isGroup) nGroup++;
      });
      lines.push(`<span style="color:#888">SCENE</span> ${nMesh} meshes · ${nLight} lights · ${nGroup} groups`);
    }

    // World + game state
    lines.push(`<span style="color:#888">WORLD</span> ${window.activeWorld||'?'} · <span style="color:#888">STATE</span> ${window.gameState||'?'}`);

    // Cars
    if (window.carObjs) {
      lines.push(`<span style="color:#888">CARS</span> ${window.carObjs.length} (player idx ${window.playerIdx})`);
    }

    _perfEl.innerHTML = lines.join('<br>');
  }

  function showPerf(){
    if (!_perfEl) _build();
    _perfEl.style.display = 'block';
    _startTracking();
    _refresh();
    if (_perfTimer) clearInterval(_perfTimer);
    _perfTimer = setInterval(_refresh, 500);
  }
  function hidePerf(){
    if (_perfEl) _perfEl.style.display = 'none';
    if (_perfTimer) { clearInterval(_perfTimer); _perfTimer = null; }
    _stopTracking();
  }
  function togglePerf(){
    if (_perfEl && _perfEl.style.display === 'block') hidePerf();
    else showPerf();
  }

  // Ctrl+Shift+P — toggle
  window.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && (e.code === 'KeyP' || e.key === 'P' || e.key === 'p')) {
      e.preventDefault();
      togglePerf();
    }
  });

  window.showPerf = showPerf;
  window.hidePerf = hidePerf;
  window.togglePerf = togglePerf;
})();
