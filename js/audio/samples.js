// js/audio/samples.js — manifest-driven AudioBuffer loader.
//
// Verantwoordelijk voor:
//  - definieren welke audio-assets bij welke wereld/car-type/SFX-slot horen
//  - asynchroon fetchen + decoden van die assets in de gedeelde audioCtx
//  - cache zodat herhaalde races dezelfde buffers hergebruiken
//  - per-slot graceful fail: een ontbrekend mid.ogg blokkeert base.ogg niet
//
// De caller (api.js / music-stems.js / engine-samples.js) vraagt synchroon
// "heb je samples voor X?" via has*Samples(); als false → fallback naar
// de procedurele implementatie. Geen blokkerende race-start ooit.

// ── Manifests ──────────────────────────────────────────────────────────────
// Music: 6 slots per wereld (intro/base/mid/lead/finalLap/nitroFx).
// base is REQUIRED voor stem-routing — andere slots optioneel.
const MUSIC_MANIFEST = {
  neoncity: {
    intro:    'assets/audio/music/neoncity/intro.ogg',
    base:     'assets/audio/music/neoncity/base.ogg',
    mid:      'assets/audio/music/neoncity/mid.ogg',
    lead:     'assets/audio/music/neoncity/lead.ogg',
    finalLap: 'assets/audio/music/neoncity/final-lap.ogg',
    nitroFx:  'assets/audio/music/neoncity/nitro-fx.ogg',
  },
  // Andere werelden: lege slots = automatische fallback naar procedural.
  // Vul aan zodra Suno-tracks per wereld zijn opgeleverd.
  grandprix: {},
  space:     {},
  deepsea:   {},
  candy:     {},
  volcano:   {},
  arctic:    {},
  themepark: {},
};

// Engine: per car-type 5 RPM-banden. Crossfade tussen idle/low/mid/high/redline
// op basis van speed-ratio. Filename pattern: assets/audio/engine/<type>/<band>.ogg.
// Lege manifests = fallback naar 4-osc synth in engine.js.
const ENGINE_MANIFEST = {
  super:    {},
  f1:       {},
  muscle:   {},
  electric: {},
};

// SFX: globale one-shots. Geladen bij eerste race-start, daarna gecached.
// Lege string = sample niet aanwezig → fallback naar synth in sfx.js.
const SFX_MANIFEST = {
  brake:       '',  // 'assets/audio/sfx/brake.ogg'
  drift1:      '',
  drift2:      '',
  drift3:      '',
  suspension:  '',
  windHigh:    '',  // looped, geactiveerd >70% topspeed in engine.js
  impactLight: '',
  impactHard:  '',
  glassScatter:'',
};

// Surface: tire-rolling loops per oppervlakte. Geactiveerd via per-wereld
// surface-mapping. Filename pattern: assets/audio/surface/<surface>.ogg.
const SURFACE_MANIFEST = {
  asphalt: '',
  sand:    '',
  ice:     '',
  water:   '',
  metal:   '',
  dirt:    '',
};

// Per-wereld default tire-surface. Override via getCurrentSurface() als
// later per-zone surfaces gewenst zijn (bv. ice patch op grandprix).
const WORLD_DEFAULT_SURFACE = {
  grandprix: 'asphalt',
  space:     'metal',
  deepsea:   'water',
  candy:     'asphalt',
  neoncity:  'asphalt',
  volcano:   'sand',
  arctic:    'ice',
  themepark: 'asphalt',
};

// ── State ───────────────────────────────────────────────────────────────────
// Music heeft LRU per wereld; engine/SFX/surface zijn globaal en blijven hot.
const _musicCache = new Map();
const _musicReady = new Map();
const _musicLru = [];
const LRU_MAX = 2;

const _engineCache = new Map();   // carType → Promise
const _engineReady = new Map();   // carType → buffers

const _sfxCache = new Map();      // slot → Promise
const _sfxReady = new Map();      // slot → AudioBuffer

const _surfaceCache = new Map();  // surface → Promise
const _surfaceReady = new Map();  // surface → AudioBuffer

function _evictIfNeeded(currentWorld){
  while(_musicLru.length > LRU_MAX){
    const drop = _musicLru.shift();
    if(drop === currentWorld) continue;
    _musicReady.delete(drop);
    _musicCache.delete(drop);
  }
}

function _touch(worldId){
  const i = _musicLru.indexOf(worldId);
  if(i >= 0) _musicLru.splice(i, 1);
  _musicLru.push(worldId);
}

// ── Fetch + decode één slot, fail-soft ──────────────────────────────────────
async function _loadSlot(ctx, url){
  if(!url) return null;
  try{
    const resp = await fetch(url, { cache: 'force-cache' });
    if(!resp.ok) return null;
    const arr = await resp.arrayBuffer();
    // decodeAudioData heeft op Safari de oude callback-signature nodig
    return await new Promise((res, rej) => {
      try{
        const p = ctx.decodeAudioData(arr, res, rej);
        if(p && p.then) p.then(res, rej);
      }catch(e){ rej(e); }
    });
  }catch(_){
    return null;
  }
}

// ── Music API ───────────────────────────────────────────────────────────────

function preloadWorld(worldId){
  if(!window.audioCtx){
    return Promise.resolve({ kind:'procedural', buffers:{} });
  }
  if(_musicCache.has(worldId)) return _musicCache.get(worldId);

  const manifest = MUSIC_MANIFEST[worldId] || {};
  const slots = Object.keys(manifest);
  const ctx = window.audioCtx;

  const p = Promise.all(
    slots.map(slot => _loadSlot(ctx, manifest[slot]).then(buf => [slot, buf]))
  ).then(pairs => {
    const buffers = {};
    for(const [slot, buf] of pairs) if(buf) buffers[slot] = buf;
    const kind = buffers.base ? 'samples' : 'procedural';
    _musicReady.set(worldId, buffers);
    _touch(worldId);
    _evictIfNeeded(worldId);
    return { kind, buffers };
  }).catch(_ => ({ kind:'procedural', buffers:{} }));

  _musicCache.set(worldId, p);
  return p;
}

function hasMusicStems(worldId){
  const r = _musicReady.get(worldId);
  return !!(r && r.base);
}
function getReadyBuffers(worldId){ return _musicReady.get(worldId) || {}; }

// ── Engine API ──────────────────────────────────────────────────────────────

function preloadEngine(carType){
  if(!window.audioCtx) return Promise.resolve({});
  if(_engineCache.has(carType)) return _engineCache.get(carType);

  const manifest = ENGINE_MANIFEST[carType] || {};
  const slots = Object.keys(manifest);
  const ctx = window.audioCtx;

  const p = Promise.all(
    slots.map(slot => _loadSlot(ctx, manifest[slot]).then(buf => [slot, buf]))
  ).then(pairs => {
    const buffers = {};
    for(const [slot, buf] of pairs) if(buf) buffers[slot] = buf;
    _engineReady.set(carType, buffers);
    return buffers;
  }).catch(_ => ({}));

  _engineCache.set(carType, p);
  return p;
}

function hasEngineSamples(carType){
  const r = _engineReady.get(carType);
  if(!r) return false;
  return Object.keys(r).length >= 2;
}
function getEngineBuffers(carType){ return _engineReady.get(carType) || {}; }

// ── SFX API ─────────────────────────────────────────────────────────────────

function preloadSFX(){
  if(!window.audioCtx) return Promise.resolve();
  const ctx = window.audioCtx;
  const slots = Object.keys(SFX_MANIFEST);
  const promises = slots.map(slot => {
    if(_sfxCache.has(slot)) return _sfxCache.get(slot);
    const p = _loadSlot(ctx, SFX_MANIFEST[slot]).then(buf => {
      if(buf) _sfxReady.set(slot, buf);
      return buf;
    });
    _sfxCache.set(slot, p);
    return p;
  });
  return Promise.all(promises);
}

function hasSFXSample(slot){ return _sfxReady.has(slot); }
function getSFXBuffer(slot){ return _sfxReady.get(slot) || null; }

// ── Surface API ─────────────────────────────────────────────────────────────

function preloadSurface(surface){
  if(!window.audioCtx || !surface) return Promise.resolve(null);
  if(_surfaceCache.has(surface)) return _surfaceCache.get(surface);

  const url = SURFACE_MANIFEST[surface];
  const p = _loadSlot(window.audioCtx, url).then(buf => {
    if(buf) _surfaceReady.set(surface, buf);
    return buf;
  });
  _surfaceCache.set(surface, p);
  return p;
}

function preloadSurfacesForWorld(worldId){
  const surface = WORLD_DEFAULT_SURFACE[worldId] || 'asphalt';
  return preloadSurface(surface);
}

function getCurrentSurface(){
  return WORLD_DEFAULT_SURFACE[window.activeWorld] || 'asphalt';
}
function hasSurfaceSample(surface){ return _surfaceReady.has(surface); }
function getSurfaceBuffer(surface){ return _surfaceReady.get(surface) || null; }

// ── Debug ──────────────────────────────────────────────────────────────────

function _samplesDebug(){
  const info = {
    music_cached: [..._musicCache.keys()],
    music_ready: [..._musicReady.keys()],
    music_lru: [..._musicLru],
    engine_ready: [..._engineReady.keys()].map(t => `${t}:${Object.keys(_engineReady.get(t)).length}`),
    sfx_ready: [..._sfxReady.keys()],
    surface_ready: [..._surfaceReady.keys()],
    force_procedural: !!window._forceProceduralAudio,
  };
  console.table(info);
  return info;
}

// ── Expose ──────────────────────────────────────────────────────────────────
window.MUSIC_MANIFEST = MUSIC_MANIFEST;
window.ENGINE_MANIFEST = ENGINE_MANIFEST;
window.SFX_MANIFEST = SFX_MANIFEST;
window.SURFACE_MANIFEST = SURFACE_MANIFEST;
window.WORLD_DEFAULT_SURFACE = WORLD_DEFAULT_SURFACE;

window._preloadWorld = preloadWorld;
window._hasMusicStems = hasMusicStems;
window._getReadyBuffers = getReadyBuffers;

window._preloadEngine = preloadEngine;
window._hasEngineSamples = hasEngineSamples;
window._getEngineBuffers = getEngineBuffers;

window._preloadSFX = preloadSFX;
window._hasSFXSample = hasSFXSample;
window._getSFXBuffer = getSFXBuffer;

window._preloadSurface = preloadSurface;
window._preloadSurfacesForWorld = preloadSurfacesForWorld;
window._getCurrentSurface = getCurrentSurface;
window._hasSurfaceSample = hasSurfaceSample;
window._getSurfaceBuffer = getSurfaceBuffer;

window._samplesDebug = _samplesDebug;

export {
  preloadWorld, hasMusicStems, getReadyBuffers, MUSIC_MANIFEST,
  preloadEngine, hasEngineSamples, getEngineBuffers, ENGINE_MANIFEST,
  preloadSFX, hasSFXSample, getSFXBuffer, SFX_MANIFEST,
  preloadSurface, preloadSurfacesForWorld, getCurrentSurface,
  hasSurfaceSample, getSurfaceBuffer, SURFACE_MANIFEST,
};
