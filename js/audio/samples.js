// js/audio/samples.js — manifest-driven AudioBuffer loader.
//
// Verantwoordelijk voor:
//  - definieren welke audio-assets bij welke wereld horen (MUSIC_MANIFEST)
//  - asynchroon fetchen + decoden van die assets in de gedeelde audioCtx
//  - cache zodat herhaalde races dezelfde buffers hergebruiken
//  - per-slot graceful fail: een ontbrekend mid.ogg blokkeert base.ogg niet
//
// De caller (api.js / music-stems.js) vraagt synchroon "heb je stems voor X?"
// via hasMusicStems(); als false → fallback naar procedurele RaceMusic uit
// music.js. Geen blokkerende race-start ooit.

// ── Manifest ────────────────────────────────────────────────────────────────
// Slots per wereld:
//   intro     — 4-8s eenmalig na countdown, voor de loops in beginnen
//   base      — drums + bass, loopt altijd (REQUIRED voor stem-routing)
//   mid       — chord-pad + arp, faded in op intensity > 0
//   lead      — melody + risers, alleen op final lap of pole-position
//   finalLap  — 4-8s stinger bij final-lap event
//   nitroFx   — sweep one-shot bij nitro-activatie
//
// Bestanden ontbreken? Loader laadt wat er is, gameplay krijgt 'kind' terug
// gebaseerd op of base aanwezig is. Geen base → geen stem-routing.
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

// ── State ───────────────────────────────────────────────────────────────────
// _cache: worldId → Promise<{ slot → AudioBuffer|null }>. Promise zodat
// gelijktijdige preload-aanroepen dedupliceren.
const _cache = new Map();
// _ready: worldId → resolved buffers (synchrone check voor dispatch).
const _ready = new Map();
// LRU: hou max 2 werelden gedecodeerd in memory (mobile budget).
const _lru = [];
const LRU_MAX = 2;

function _evictIfNeeded(currentWorld){
  while(_lru.length > LRU_MAX){
    const drop = _lru.shift();
    if(drop === currentWorld) continue;
    _ready.delete(drop);
    _cache.delete(drop);
  }
}

function _touch(worldId){
  const i = _lru.indexOf(worldId);
  if(i >= 0) _lru.splice(i, 1);
  _lru.push(worldId);
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

// ── Public API ──────────────────────────────────────────────────────────────

// Preload alle slots voor een wereld. Idempotent: tweede aanroep returnt
// dezelfde Promise. Resolved met { kind: 'samples'|'procedural', buffers }.
function preloadWorld(worldId){
  if(!window.audioCtx){
    // Audio niet ge-init (user heeft nog niet geïnteract). Geen preload mogelijk.
    return Promise.resolve({ kind:'procedural', buffers:{} });
  }
  if(_cache.has(worldId)) return _cache.get(worldId);

  const manifest = MUSIC_MANIFEST[worldId] || {};
  const slots = Object.keys(manifest);
  const ctx = window.audioCtx;

  const p = Promise.all(
    slots.map(slot => _loadSlot(ctx, manifest[slot]).then(buf => [slot, buf]))
  ).then(pairs => {
    const buffers = {};
    for(const [slot, buf] of pairs) if(buf) buffers[slot] = buf;
    const kind = buffers.base ? 'samples' : 'procedural';
    _ready.set(worldId, buffers);
    _touch(worldId);
    _evictIfNeeded(worldId);
    return { kind, buffers };
  }).catch(_ => ({ kind:'procedural', buffers:{} }));

  _cache.set(worldId, p);
  return p;
}

// Synchrone check: kan ik nu een StemRaceMusic bouwen voor deze wereld?
function hasMusicStems(worldId){
  const r = _ready.get(worldId);
  return !!(r && r.base);
}

// Synchrone getter — returnt {} als nog niet ready.
function getReadyBuffers(worldId){
  return _ready.get(worldId) || {};
}

// Debug-helper.
function _samplesDebug(){
  const info = {
    cached_worlds: [..._cache.keys()],
    ready_worlds: [..._ready.keys()],
    lru_order: [..._lru],
    ready_summary: Object.fromEntries(
      [..._ready.entries()].map(([w, b]) => [w, Object.keys(b).join(',')])
    ),
  };
  console.table(info);
  return info;
}

// ── Expose ──────────────────────────────────────────────────────────────────
window.MUSIC_MANIFEST = MUSIC_MANIFEST;
window._preloadWorld = preloadWorld;
window._hasMusicStems = hasMusicStems;
window._getReadyBuffers = getReadyBuffers;
window._samplesDebug = _samplesDebug;

export { preloadWorld, hasMusicStems, getReadyBuffers, MUSIC_MANIFEST };
