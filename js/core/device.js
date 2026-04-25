// js/core/device.js — Fase 2.3/2.4 extraction. Non-module script.


function _redetectDevice(){
  window._isTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0||window._isIPadLike;
  // Tablet = iPad-like device OR a touch device with mid-range viewport (also covers Android tablets)
  window._isTablet=window._isIPadLike||(window._isTouch&&innerWidth>=768&&innerHeight>=700);
  // Mobile = phone (compact layout); also treat narrow tablets as mobile for perf/UI
  window._isMobile=(window._isTouch&&innerWidth<768&&!window._isIPadLike);
  // Use-touch-controls flag = phones + tablets (iPad should get touch controls too)
  window._useTouchControls=window._isTouch&&(window._isMobile||window._isTablet);
  // Expose as data-device for CSS custom-property hooks
  document.documentElement.dataset.device=window._isMobile?'mobile':window._isTablet?'tablet':'desktop';
}

function _mobCount(n){return window._isMobile?Math.ceil(n*.45):n;}

// Initial device detection — runs at script load time, vóór renderer/scene init.
// iPad in Safari "Request Desktop Website" mode reports UA as Macintosh maar houdt
// maxTouchPoints>1 — detecteer dat expliciet zodat iPad als tablet behandeld wordt.
window._isIPadLike=(/iPad/.test(navigator.userAgent))||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
_redetectDevice();
