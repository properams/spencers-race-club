// js/assets/loader.js — Asset facade (HDRI / textures / GLTF) with manifest +
// graceful fallback. Non-module so the rest of the worlds (also non-module)
// can call window.Assets synchronously after preloadWorld().
//
// MENTAL MODEL (mirrors js/audio/samples.js):
//   1. Boot reads assets/manifest.json once into _manifest. Missing file or
//      parse error → empty manifest, every slot reports as null.
//   2. preloadWorld(worldId) fetches all slots for that world in parallel,
//      caches results. Faillig laden = slot blijft null. Nooit throwt.
//   3. Build code (worlds/*.js, track/environment.js) calls synchronous
//      get*() helpers; null = fallback naar procedural.
//
// External Three.js loaders (RGBELoader, GLTFLoader) come from CDN, lazy
// loaded only as soon as the corresponding asset-type is requested. If CDN
// is down or offline → loaders blijven null, alle slots vallen terug op
// procedural. Game blijft speelbaar zonder enige network-asset.

'use strict';

(function(){
  // ── Constants ────────────────────────────────────────────────────────
  const MANIFEST_PATH = 'assets/manifest.json';
  const CDN_BASE = 'https://cdn.jsdelivr.net/npm/three@0.134.0/examples/js';
  const LOADER_URLS = {
    rgbe: CDN_BASE + '/loaders/RGBELoader.js',
    gltf: CDN_BASE + '/loaders/GLTFLoader.js',
  };

  // ── State ────────────────────────────────────────────────────────────
  let _manifest = { worlds: {} };
  let _manifestLoaded = false;
  const _loaderPromises = {}; // cdn-script per type (lazy)
  const _hdriCache = new Map();      // path → THREE.Texture (PMREM-processed) | null
  const _textureCache = new Map();   // path → THREE.Texture | null
  const _gltfCache = new Map();      // path → { scene, animations } | null
  const _worldPreloaded = new Set();
  let _pmremGen = null;

  function _log(msg, data){ if (window.dbg) dbg.log('assets', msg, data); }
  function _warn(msg, data){ if (window.dbg) dbg.warn('assets', msg, data); else console.warn('[assets]', msg, data); }

  // ── Manifest ─────────────────────────────────────────────────────────
  async function _loadManifest(){
    if (_manifestLoaded) return _manifest;
    try {
      const r = await fetch(MANIFEST_PATH);
      if (!r.ok) throw new Error('HTTP '+r.status);
      _manifest = await r.json();
      _log('manifest loaded', { worlds: Object.keys(_manifest.worlds||{}) });
    } catch (e) {
      _log('manifest absent — all slots will be null', String(e&&e.message||e));
      _manifest = { worlds: {} };
    }
    _manifestLoaded = true;
    return _manifest;
  }

  function _slot(worldId, dotPath){
    const w = _manifest.worlds && _manifest.worlds[worldId];
    if (!w) return null;
    const parts = dotPath.split('.');
    let cur = w;
    for (const p of parts){ if (!cur || typeof cur !== 'object') return null; cur = cur[p]; }
    return (typeof cur === 'string' && cur.length) ? cur : null;
  }

  // ── CDN loader bootstrap ─────────────────────────────────────────────
  function _ensureLoader(type){
    if (_loaderPromises[type]) return _loaderPromises[type];
    const url = LOADER_URLS[type];
    if (!url) return Promise.resolve(false);
    _loaderPromises[type] = new Promise(resolve => {
      const s = document.createElement('script');
      s.src = url;
      s.async = true;
      s.onload  = () => { _log('cdn loader ready', type); resolve(true); };
      s.onerror = () => { _warn('cdn loader failed', type+' '+url); resolve(false); };
      document.head.appendChild(s);
    });
    return _loaderPromises[type];
  }

  // ── HDRI ────────────────────────────────────────────────────────────
  async function loadHDRI(path){
    if (!path) return null;
    if (_hdriCache.has(path)) return _hdriCache.get(path);
    const ok = await _ensureLoader('rgbe');
    if (!ok || typeof THREE === 'undefined' || !THREE.RGBELoader){
      _hdriCache.set(path, null);
      return null;
    }
    if (!window.renderer){ _warn('hdri no renderer', path); _hdriCache.set(path, null); return null; }
    if (!_pmremGen){
      try { _pmremGen = new THREE.PMREMGenerator(window.renderer); _pmremGen.compileEquirectangularShader(); }
      catch (e) { _warn('pmrem init failed', String(e)); _hdriCache.set(path, null); return null; }
    }
    const tex = await new Promise(resolve => {
      try {
        const ldr = new THREE.RGBELoader();
        // Force Float32 so _sampleHorizon can read a plain Float32Array. The
        // default HalfFloatType produces a Uint16Array of half-floats which
        // would need DataUtils.fromHalfFloat per pixel.
        if (typeof ldr.setDataType === 'function') ldr.setDataType(THREE.FloatType);
        ldr.load(path,
          t => resolve(t),
          undefined,
          err => { _warn('rgbe load failed', path+' '+(err&&err.message||err)); resolve(null); });
      } catch (e) { _warn('rgbe throw', String(e)); resolve(null); }
    });
    if (!tex){ _hdriCache.set(path, null); return null; }
    let envMap = null;
    try {
      envMap = _pmremGen.fromEquirectangular(tex).texture;
      // Sample horizon row (mid-Y) center pixel for fog matching. RGBELoader
      // returns DataTexture (HalfFloat or Float). Read pixel via readRenderTargetPixels
      // is overkill — we approximate by sampling a few pixels from the image data.
      envMap.userData = envMap.userData || {};
      envMap.userData.horizonColor = _sampleHorizon(tex);
      envMap.userData.sourcePath = path;
    } catch (e) { _warn('pmrem fromEquirect failed', String(e)); }
    finally { try{ tex.dispose(); }catch(_){} }
    _hdriCache.set(path, envMap);
    _log('hdri ready', { path, horizonColor: envMap && envMap.userData.horizonColor });
    return envMap;
  }

  // Approximate horizon color from the equirectangular HDRI by averaging
  // a thin horizontal band at v=0.55 (just below center, where horizon
  // typically lies in outdoor HDRIs). Returns a hex int or null.
  function _sampleHorizon(tex){
    try {
      const img = tex.image;
      if (!img || !img.data) return null;
      const w = img.width, h = img.height;
      if (!w || !h) return null;
      const yRow = Math.floor(h*0.55);
      const data = img.data;
      // RGBELoader DataTexture: 4 floats per pixel (RGBA, half-float upgraded)
      const stride = 4;
      const samples = 12;
      let r=0,g=0,b=0;
      for (let i=0;i<samples;i++){
        const x = Math.floor((i/samples)*w);
        const idx = (yRow*w + x)*stride;
        r += +data[idx]   || 0;
        g += +data[idx+1] || 0;
        b += +data[idx+2] || 0;
      }
      r/=samples; g/=samples; b/=samples;
      // Tone-map exposure-style: x/(x+1) keeps it in 0..1 even for HDR>1.
      const tm = v => Math.max(0, Math.min(1, v/(v+1)));
      const R = Math.round(tm(r)*255), G = Math.round(tm(g)*255), B = Math.round(tm(b)*255);
      return (R<<16)|(G<<8)|B;
    } catch (e) { return null; }
  }

  // ── Textures ────────────────────────────────────────────────────────
  function loadTexture(path, opts){
    if (!path) return Promise.resolve(null);
    if (_textureCache.has(path)) return Promise.resolve(_textureCache.get(path));
    const o = opts || {};
    return new Promise(resolve => {
      try {
        new THREE.TextureLoader().load(path, t => {
          if (o.colorSpace === 'srgb' && window.ThreeCompat && ThreeCompat.applyTextureColorSpace){
            ThreeCompat.applyTextureColorSpace(t);
          }
          // Linear maps (normal/roughness/metalness) keep default no-color-space.
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
          const maxAniso = (window.renderer && window.renderer.capabilities)
            ? Math.min(8, window.renderer.capabilities.getMaxAnisotropy()||1) : 4;
          t.anisotropy = window._isMobile ? Math.min(4, maxAniso) : maxAniso;
          _textureCache.set(path, t);
          resolve(t);
        }, undefined, err => {
          _warn('texture load failed', path+' '+(err&&err.message||err));
          _textureCache.set(path, null);
          resolve(null);
        });
      } catch (e) { _warn('texture throw', String(e)); _textureCache.set(path, null); resolve(null); }
    });
  }

  // Convenience: load a {color,normal,roughness} set in parallel.
  async function loadGroundSet(worldId){
    const colorPath = _slot(worldId, 'ground.color');
    const normalPath = _slot(worldId, 'ground.normal');
    const roughPath = _slot(worldId, 'ground.roughness');
    if (!colorPath && !normalPath && !roughPath) return null;
    const [color, normal, roughness] = await Promise.all([
      loadTexture(colorPath,  { colorSpace: 'srgb' }),
      loadTexture(normalPath, {}),
      loadTexture(roughPath,  {}),
    ]);
    return { color, normal, roughness };
  }

  // ── GLTF ────────────────────────────────────────────────────────────
  async function loadGLTF(path){
    if (!path) return null;
    if (_gltfCache.has(path)) return _gltfCache.get(path);
    const ok = await _ensureLoader('gltf');
    if (!ok || !THREE.GLTFLoader){ _gltfCache.set(path, null); return null; }
    const result = await new Promise(resolve => {
      try {
        new THREE.GLTFLoader().load(path,
          gltf => resolve({ scene: gltf.scene, animations: gltf.animations||[] }),
          undefined,
          err => { _warn('gltf load failed', path+' '+(err&&err.message||err)); resolve(null); });
      } catch (e) { _warn('gltf throw', String(e)); resolve(null); }
    });
    if (result && result.scene){
      // Ensure materials are sRGB-aware on r150+ (ThreeCompat handles encoding shim)
      result.scene.traverse(obj => {
        if (obj.isMesh){
          obj.castShadow = false;
          obj.receiveShadow = false;
          if (obj.material && obj.material.map && window.ThreeCompat && ThreeCompat.applyTextureColorSpace){
            ThreeCompat.applyTextureColorSpace(obj.material.map);
          }
        }
      });
    }
    _gltfCache.set(path, result);
    return result;
  }

  // ── Per-world preload ───────────────────────────────────────────────
  async function preloadWorld(worldId){
    if (!worldId) return { kind:'none' };
    if (_worldPreloaded.has(worldId)) return { kind:'cached' };
    await _loadManifest();
    const w = _manifest.worlds && _manifest.worlds[worldId];
    if (!w){ _worldPreloaded.add(worldId); return { kind:'no-manifest' }; }

    const tasks = [];
    if (w.hdri) tasks.push(loadHDRI(w.hdri));
    if (w.ground) tasks.push(loadGroundSet(worldId));
    if (w.props){
      for (const k in w.props) tasks.push(loadGLTF(w.props[k]));
    }
    if (w.skybox_layers){
      for (const k in w.skybox_layers) tasks.push(loadTexture(w.skybox_layers[k], { colorSpace:'srgb' }));
    }
    await Promise.all(tasks);
    _worldPreloaded.add(worldId);
    return { kind:'loaded' };
  }

  // ── Synchronous getters (read cache after preload) ──────────────────
  function getHDRI(worldId){
    const path = _slot(worldId, 'hdri');
    if (!path) return null;
    return _hdriCache.has(path) ? _hdriCache.get(path) : null;
  }
  function getTexture(worldId, dotPath){
    const path = _slot(worldId, dotPath);
    if (!path) return null;
    return _textureCache.has(path) ? _textureCache.get(path) : null;
  }
  function getGroundSet(worldId){
    const c = getTexture(worldId, 'ground.color');
    const n = getTexture(worldId, 'ground.normal');
    const r = getTexture(worldId, 'ground.roughness');
    if (!c && !n && !r) return null;
    return { color:c, normal:n, roughness:r };
  }
  function getGLTF(worldId, propKey){
    const path = _slot(worldId, 'props.'+propKey);
    if (!path) return null;
    return _gltfCache.has(path) ? _gltfCache.get(path) : null;
  }
  function listProps(worldId){
    const w = _manifest.worlds && _manifest.worlds[worldId];
    return (w && w.props) ? Object.keys(w.props) : [];
  }

  // ── Status (for pause overlay UI) ───────────────────────────────────
  function status(worldId){
    const out = { hdri:false, ground:[0,0], props:[0,0], layers:[0,0] };
    const w = (_manifest.worlds||{})[worldId];
    if (!w) return out;
    if (w.hdri) out.hdri = !!_hdriCache.get(w.hdri);
    if (w.ground){
      const ks = ['color','normal','roughness'].filter(k=>!!w.ground[k]);
      out.ground = [ ks.filter(k=>!!_textureCache.get(w.ground[k])).length, ks.length ];
    }
    if (w.props){
      const ks = Object.keys(w.props);
      out.props = [ ks.filter(k=>!!_gltfCache.get(w.props[k])).length, ks.length ];
    }
    if (w.skybox_layers){
      const ks = Object.keys(w.skybox_layers);
      out.layers = [ ks.filter(k=>!!_textureCache.get(w.skybox_layers[k])).length, ks.length ];
    }
    return out;
  }

  // ── Init: load manifest eager so listProps works pre-preload ────────
  function init(){ return _loadManifest(); }

  window.Assets = {
    init,
    preloadWorld,
    loadHDRI, loadTexture, loadGLTF, loadGroundSet,
    getHDRI, getTexture, getGroundSet, getGLTF, listProps,
    status,
  };

  // Boot manifest fetch (non-blocking).
  init();
})();
