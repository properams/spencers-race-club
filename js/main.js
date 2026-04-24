// js/main.js — Spencer's Race Club main game
// Loaded als gewoon <script> (non-module) zodat top-level let/const/var globals
// blijven voor submodule-access via window.*. Submodules zijn wel ES modules
// (zie js/persistence/*, js/audio/*, js/ui/*).
'use strict';

// ══ CONSTANTS ═══════════════════════════════
let TOTAL_LAPS=3;
const TW=13, BARRIER_OFF=16, RECOVER_DIST=30, WARN_DIST=22;
// Touch device = any device with touch support (phones + tablets)
// iPad in Safari "Request Desktop Website" mode reports UA as Macintosh but keeps maxTouchPoints>1 —
// detect that explicitly so iPad is still treated as a tablet.
// _isIPadLike is UA-derived and never changes; the size-derived flags are recomputed on resize/rotate.
window._isIPadLike=(/iPad/.test(navigator.userAgent))||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
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
_redetectDevice();

// Optional debug overlay — opt in via ?debug or ?debug=1 in the URL.
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

function _mobCount(n){return window._isMobile?Math.ceil(n*.45):n;}
function disposeScene(){if(!scene)return;scene.traverse(obj=>{if(obj.isMesh||obj.isPoints||obj.isLine){if(obj.geometry)obj.geometry.dispose();if(obj.material){if(Array.isArray(obj.material))obj.material.forEach(m=>{if(m.map)m.map.dispose();m.dispose();});else{if(obj.material.map)obj.material.map.dispose();obj.material.dispose();}}}});while(scene.children.length>0)scene.remove(scene.children[0]);if(scene.background&&scene.background.isTexture){scene.background.dispose();scene.background=null;}if(scene.environment&&scene.environment.isTexture){scene.environment.dispose();scene.environment=null;}if(renderer)renderer.renderLists.dispose();}

// ══ DATA — gevuld door loadGameData() (zie boot) ══════════════════════════
let CAR_DEFS=[];        // fetch data/cars.json
let TRACK_WP=[];        // active world waypoints (muteerbaar in buildScene)
let _GP_WP=[];          // snapshot grand prix waypoints
let _TRACKS={};         // alle werelden keyed by name
// CAR_PRICES + WORLD_PRICES komen verderop — na persistence helpers

async function loadGameData(){
  const [cars,tracks,prices]=await Promise.all([
    fetch('data/cars.json').then(r=>r.json()),
    fetch('data/tracks.json').then(r=>r.json()),
    fetch('data/prices.json').then(r=>r.json())
  ]);
  CAR_DEFS=cars.map(c=>({...c,color:parseInt(c.color,16),accent:parseInt(c.accent,16)}));
  _TRACKS=tracks;
  _GP_WP=_TRACKS.grandprix.map(wp=>[wp[0],wp[1]]);
  TRACK_WP.length=0;
  _TRACKS.grandprix.forEach(wp=>TRACK_WP.push(wp));
  CAR_PRICES={};
  Object.keys(prices.cars).forEach(k=>{CAR_PRICES[Number(k)]=prices.cars[k];});
  WORLD_PRICES=prices.worlds;
}
// ── World state ───────────────────────────────
let activeWorld='grandprix';  // 'grandprix' | 'space' | 'deepsea' | 'candy'
let _spaceAsteroids=[];
let _spaceDustGeo=null,_spaceDustParticles=null;
// Space gameplay objects
let _spaceGravityWells=[];
let _spaceRailguns=[];
let _spaceWormholes=[];
let _spaceUFOs=[];
let _spaceMeteors=[];
let _spaceMeteorTimer=18;
let _spaceBeamMesh=null,_spaceBeamTimer=0;
let _spaceUnderglow=[];
// Deep Sea world objects
let _kelpList=[];
// Volcano world objects
let _volcanoLavaRivers=[],_volcanoGeisers=[],_volcanoEmberGeo=null;
let _volcanoEruption=null,_volcanoEruptionTimer=3;
let _volcanoEmbers=null,_volcanoGlowLight=null;
// Arctic world objects
let _arcticIcePatches=[],_arcticAurora=[],_arcticBlizzardGeo=null;
// Thrill Park world objects
let _tpFerris=null,_tpCarousel=null,_tpCarouselHorses=[],_tpCoasters=[],_tpBalloons=[];
let _tpFireworks=[],_tpBunting=[],_tpParkLights=[],_tpFireworkTimer=0;
let _jellyfishList=[];
let _dsaBubbleGeo=null,_dsaBubblePos=null;
let _dsaLightRays=[];
let _dsaBioEdges=[];
let _dsaCreatures={manta:null,whale:null,fishSchools:[]};
let _dsaTreasures=[];
let _dsaCurrentDir=0; // flowing current angle for physics
// Candy world objects
let _sprinkleParticles=null,_sprinkleGeo=null;
let _neonBuildings=[],_neonEmissives=[],_neonBuildingLights=[];
let _holoBillboards=[];
let _neonSteamGeo=null,_neonSteamPts=null,_neonSteamPos=null;
let _neonDustGeo=null,_neonDustPts=null;
const _neonSteamVents=[];
let _neonWater=null;
let _neonEmpZones=[],_neonHoloWalls=[];
const _gummyBears=[];
const _gumZones=[];
const _candyCannons=[];
let _chocoHighlight=null;
let _candyCaneList=[];
let _candyLollipops=[];
let _candyNightEmissives=[]; // meshes that glow at night
let _candyCandles=[];        // candle flame lights on cake

// ══ GLOBALS ══════════════════════════════════
var renderer,scene,camera,clock; // var = attached to window so debug badge can read them
let _ctxLost=false,_ctxLostReloadTimer=null;
let trackCurve,curvePts;
var carObjs=[],playerIdx=0,selCarId=3,gameState='TITLE'; // var so window.carObjs/playerIdx visible to debug badge
let isDark=true,isRain=false;
const keys={};
const camPos=new THREE.Vector3(),camTgt=new THREE.Vector3();
let camShake=0;
let sunLight,ambientLight,hemiLight;
let trackLightList=[],trackPoles=[],stars=null;
let plHeadL,plHeadR,plTail;
let recoverActive=false,recoverTimer=0;
let nitroLevel=100,nitroActive=false;
let driftScore=0,driftTimer=0;
let lapStartTime=0,lastLapTime=0,bestLapTime=Infinity;
const skidMarks=[];
let titleMusic=null,musicSched=null,selectMusic=null;

// ── MUSIC SUBSYSTEM — verplaatst naar js/audio/music.js ──
// MusicLib, TitleMusic, SelectMusic, RaceMusic, startTitleMusic,
// startSelectMusic, _createRaceMusicForWorld, _playCountdownRoll,
// _fadeOutMusic, _applyMusicGain, _safeStartMusic, noteFreq/NF, _musicDebug
// zijn beschikbaar via window.xxx (module laadt deferred).

let audioCtx=null,engineOsc=null,engineGain=null,_rollGain=null,_rollSrc=null,_rollFilt=null;

// Special track objects
const jumpRamps=[],spinPads=[],boostPads=[],collectibles=[];
// Per-world unique track elements
const _wpWaterPuddles=[],_wpDrsZones=[];           // GP
const _wpGravityZones=[],_wpOrbitAsteroids=[],_wpWarpTunnels=[];  // Space
const _wpCurrentStreams=[],_wpAbyssCracks=[],_wpTreasureTrail=[];  // DeepSea
let _drsTimer=0,_drsBoostUsed=false; // _drsActive already declared later
// Per-car vertical velocity stored on car.vy
// Performance globals
let _nowSec=0;
let _posCache=[],_posTick=0;
const _aiFwd=new THREE.Vector3(),_aiToT=new THREE.Vector3(),_aiCross=new THREE.Vector3();
const _aiTg=new THREE.Vector3(),_aiNr=new THREE.Vector3();
const _aiCurA=new THREE.Vector3(),_aiCurB=new THREE.Vector3();
const _aiBase=new THREE.Vector3();

// Rain
let rainCanvas,rainCtx,rainDrops=[];

// Particles
let sparkSystem,exhaustSystem;

// Slipstream
let slipTimer=0;

// Cached DOM refs (beyond HUD — set in cacheHUDRefs)
let _elSlip,_elWarn,_mapCvs,_mapCtx,_elGear,_elLeader;
// Cached minimap bounds (computed once after track builds)
let _mmBounds=null;
let _mmFrameCtr=0;
// Current gear (set in updateEngine, read in updateHUD)
let _currentGear=1;
// Last leaderboard order key (avoid unnecessary innerHTML writes)
let _lastLeaderOrder='';
// Leaderboard stability: only commit new order after it's been stable for 0.5s
let _leaderPendingKey='',_leaderStableT=0;
// Position notification stability: only fire overtake after position is stable for 0.4s
let _posStableValue=0,_posStableT=0;
// Pause / mute state
let gamePaused=false,audioMuted=false,_muteGain=null;
// Pre-allocated camera vectors (avoid per-frame heap allocations)
const _camV1=new THREE.Vector3(),_camV2=new THREE.Vector3(),_jFwdV=new THREE.Vector3(),_aiFwdRV=new THREE.Vector3();
// Pre-allocated player/car vectors — reused every frame to avoid GC pressure
const _plFwd=new THREE.Vector3(),_plBk=new THREE.Vector3(),_plRt=new THREE.Vector3();
const _slipFwd=new THREE.Vector3(),_slipDir=new THREE.Vector3();
// Wrong-way detector
let _wrongWayTimer=0,_elWrongWay=null;
// Mini-turbo (drift release boost)
let _miniTurboReady=false;
// Score system
let totalScore=0;
let _elScore=null,_elLapDelta=null;
// Difficulty (0=easy 1=normal 2=hard)
let difficulty=1;
const DIFF_MULT=[0.75,1.0,1.22];
// Boost glow light
let _boostLight=null;
// Ambient wind
let _ambientWind=null,_ambientWindGain=null;
// Track flags for wave animation
const _trackFlags=[];
// Track mesh ref (rain shimmer)
let _trackMesh=null;
// Sun lens flare sprite
let _sunBillboard=null;
// Camera lateral offset accumulator (corner pan)
let _camLateralT=0;
// Rain smooth visual transition
let _rainIntensity=0,_rainTarget=0;
// Safety car (spawns during recovery)
let _safetyCar=null;
// Tire wear warning cooldown
let _tireWarnCooldown=0;
// Cached tire HUD ref
let _elTire=null;
let _lastTireKey=-1;
// Dynamic sky transition (day↔night smooth)
let _skyT=0,_skyTarget=0;
const _fogColorDay=new THREE.Color(0x8ac0e0);
const _fogColorNight=new THREE.Color(0x030610);
// Thunder timer
let _thunderTimer=14+Math.random()*10;
// Weather mode
let _weatherMode='clear',_stormFlashTimer=0,_snowParticles=null,_snowGeo=null;
// Crowd noise
let _crowdSrc=null,_crowdGain=null;
// Sector timing (3 splits)
const _sectorBests=[Infinity,Infinity,Infinity];
let _sectorStart=0,_currentSector=0,_elSector=null;
let _secPopTimer=null;
// LocalStorage persistence cache
let _savedHS=0,_savedBL=Infinity;
// Victory orbit flag
let _victoryOrbit=false;
// Multiple camera views: 0=Chase 1=Helicopter 2=Hood 3=Bumper
let _camView=0;
// Race intro cinematic pan (first 3s of race)
let _introPanTimer=0;
// Post-race stats
let _raceMaxSpeed=0,_raceOvertakes=0,_lastPlayerPos=9,_raceStartGrace=0;
// Achievements (unlocked set + queue for toast display)
const _achieveUnlocked=new Set();
const _achieveQueue=[];
let _achieveTimer=0;
// Rear view mirror camera
let mirrorCamera=null,_mirrorEnabled=true;
// Title screen animated camera
let _titleCamT=0;
// AI headlight point-light pool (4 lights shared across AI cars)
const _aiHeadPool=[];
// Rev limiter timer
let _revLimiterTimer=0;
// Gap display HUD refs
let _elGapAhead=null,_elGapBehind=null;
// Quick restart hold timer
let _rstHold=0;
// Per-race lap time history
const _lapTimes=[];
// Weather forecast mid-race
let _weatherForecastTimer=0,_weatherForecastFired=false;
// Collision flash
let _colFlashT=0;
let _contactPopupCD=0; // collision popup cooldown — max once per 3s
// RPM HUD ref
let _elRpm=null;
// Speed lines canvas
let _speedLinesCvs=null,_speedLinesCtx=null;
// Ghost car
const _ghostPos=[];let _ghostBest=[];let _ghostMesh=null;
let _ghostSampleT=0,_ghostPlayT=0;
// Drift visual refs
let _driftBarFill=null,_driftBarEl=null,_driftLabelEl=null;
// Float text counter (for cleanup)
let _floatPool=[];
// Overall fastest lap (all-time, cross-race)
let _overallFastestLap=Infinity;
// Near-miss bonus cooldowns per car index
const _nearMissCooldown=[];
// Pit stop state
let _pitStopActive=false,_pitStopTimer=0,_pitStopUsed=false;
// DRS indicator state
let _drsEl=null,_drsActive=false;
// AI personalities (assigned in makeAllCars)
const _aiPersonality=[
  {aggr:0.6,consist:0.8,name:'Aggressive'}, // Bugatti
  {aggr:0.9,consist:0.6,name:'Wild'},       // Lamborghini
  {aggr:0.4,consist:0.9,name:'Consistent'}, // Maserati
  {aggr:0.7,consist:0.7,name:'Balanced'},   // Ferrari
  {aggr:1.0,consist:0.5,name:'Champion'},   // RB F1
  {aggr:0.8,consist:0.5,name:'Muscle'},     // Mustang
  {aggr:0.3,consist:0.95,name:'Precise'},   // Tesla
  {aggr:0.5,consist:0.85,name:'Steady'},    // Audi
  {aggr:0.7,consist:0.85,name:'Precise'},   // 8 Porsche
  {aggr:0.85,consist:0.7,name:'Explosive'}, // 9 McLaren
  {aggr:0.95,consist:0.6,name:'Dominant'},  // 10 Mercedes F1
  {aggr:0.8,consist:0.75,name:'Hyperfast'}, // 11 Koenigsegg
];
// Reverse light mesh refs per car index
const _reverseLights=[];
// Close battle indicator
let _closeBattleTimer=0;
// Fastest lap flash timer
let _fastestLapFlashT=0;
// Track gap to leader in seconds for leaderboard
let _gapsToLeader=[];
// Tire temperature system (0=cold,0.5=optimal,1=overheated) per corner
let _tireTemp={fl:.15,fr:.15,rl:.15,rr:.15};
// Speed trap — record max speed at the S/F straight
let _speedTrapMax=0,_speedTrapFired=false,_speedTrapAllTime=0;
// Car unlock system
let _unlockedCars=new Set([0,1,2,3,4,5,6,7]); // all unlocked in free play
let _raceCount=0,_podiumCount=0; // career stats
let _newUnlocks=[]; // cars unlocked this race, for finish screen toast
// AI overtaking behavior (per car): tries to go around player
// _aiPassSide: -1=left, 1=right, 0=none
// Turbo spool state
let _wasBraking=false,_spoolTimer=0;
// Sector timing panel
let _sectorPanelEl=null;
// Speed trap DOM ref
let _speedTrapEl=null;
// Brake heat glow
let _brakeHeatTimer=0;
// Racing line grip bonus zones (progress ranges)
const GRIP_BONUS_ZONES=[[0.93,0.09,.04],[0.30,.42,.03],[0.63,.75,.03]]; // [start, end, bonus]
// Car color customization — overrides per car ID (null = use default)
const _carColorOverride={};
const CAR_COLOR_PRESETS=[0x1a3a6b,0xe8a000,0xcc0000,0xffffff,0x111111,0x00cc44,0x8800cc,0x888888];
// Lap count selection
let _selectedLaps=3;

window.addEventListener('keydown',e=>{
  keys[e.code]=true;
  if(e.code==='Space'){e.preventDefault();if(gameState==='RACE')togglePause();}
  if(e.code==='KeyP'&&gameState==='RACE')togglePause();
  if(e.code==='Escape'&&gameState==='RACE'){e.preventDefault();togglePause();}
  if(e.code==='KeyM')toggleMute();
  if(e.code==='F3'){e.preventDefault();_fpsShow=!_fpsShow;const fo=document.getElementById('fpsOverlay');if(fo)fo.style.display=_fpsShow?'block':'none';}
  if(e.code==='KeyC'&&(gameState==='RACE'||gameState==='FINISH')){
    _camView=(_camView+1)%4;
    const names=['CHASE CAM','HELI CAM','HOOD CAM','BUMPER CAM'];
    showPopup(names[_camView],'#88ddff',900);
    setCamView(_camView);
    // Hide mirror for non-chase views
    const mf=document.getElementById('mirrorFrame'),ml=document.getElementById('mirrorLabel');
    if(mf)mf.style.display=_camView===0?'block':'none';
    if(ml)ml.style.display=_camView===0?'block':'none';
  }
  if(e.code==='KeyV'&&(gameState==='RACE')){
    _mirrorEnabled=!_mirrorEnabled;
    const mf=document.getElementById('mirrorFrame'),ml=document.getElementById('mirrorLabel');
    if(mf)mf.style.display=_mirrorEnabled&&_camView===0?'block':'none';
    if(ml)ml.style.display=_mirrorEnabled&&_camView===0?'block':'none';
    showPopup(_mirrorEnabled?'MIRROR ON':'MIRROR OFF','#88ddff',700);
  }
  if(e.code==='KeyH'&&gameState==='RACE'){
    const car=carObjs[playerIdx];
    if(car&&!_pitStopActive&&!_pitStopUsed){
      const pz=car.mesh.position.z,px=car.mesh.position.x;
      if(pz>168&&pz<215&&px>-200&&px<215){
        triggerPitStop();
      }else{
        showPopup('PIT ENTRY ON MAIN STRAIGHT','#ff9900',1200);
      }
    }
  }
});
window.addEventListener('keyup',e=>{keys[e.code]=false;});

// ══ AUDIO ════════════════════════════════════
let _master=null;
function initAudio(){
  if(audioCtx)return;
  audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  _master=audioCtx.createDynamicsCompressor();
  _master.threshold.value=-16;_master.knee.value=10;
  _master.ratio.value=4;_master.attack.value=0.003;_master.release.value=0.12;
  _muteGain=audioCtx.createGain();_muteGain.gain.value=1;
  _master.connect(_muteGain);_muteGain.connect(audioCtx.destination);
  // iOS audio unlock — play silent WebAudio buffer + kick HTMLAudio primer
  try{
    const buf=audioCtx.createBuffer(1,1,22050);
    const src=audioCtx.createBufferSource();
    src.buffer=buf;src.connect(audioCtx.destination);src.start(0);
  }catch(_){}
  // HTMLAudio primer forces Safari into playback audio session (beats silent switch)
  try{
    const prim=document.getElementById('iosAudioUnlock');
    if(prim){prim.muted=false;prim.volume=0.001;const p=prim.play();if(p&&p.catch)p.catch(()=>{});}
  }catch(_){}
  if(audioCtx.state==='suspended'){audioCtx.resume().catch(()=>{});}
}
// Retry resume — iOS can suspend context on backgrounding
function _ensureAudio(){
  if(!audioCtx)return;
  if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
  const prim=document.getElementById('iosAudioUnlock');
  if(prim&&prim.paused){try{const p=prim.play();if(p&&p.catch)p.catch(()=>{});}catch(_){}}
}
function _dst(){return _master||audioCtx.destination;}

// Multi-oscillator engine
function initEngine(){
  if(engineOsc)return;
  const ctx=audioCtx;
  const o1=ctx.createOscillator(),o2=ctx.createOscillator(),o3=ctx.createOscillator(),o4=ctx.createOscillator();
  o1.type='sawtooth';o2.type='square';o3.type='sine';o4.type='sine';
  o1.frequency.value=80;o2.frequency.value=160;o3.frequency.value=240;o4.frequency.value=40;
  const filt=ctx.createBiquadFilter();filt.type='lowpass';filt.frequency.value=600;filt.Q.value=3;
  const g1=ctx.createGain(),g2=ctx.createGain(),g3=ctx.createGain(),g4=ctx.createGain();
  g1.gain.value=.08;g2.gain.value=.035;g3.gain.value=.018;g4.gain.value=.015;
  const master=ctx.createGain();master.gain.value=0;
  o1.connect(g1);o2.connect(g2);o3.connect(g3);o4.connect(g4);
  g1.connect(filt);g2.connect(filt);g3.connect(filt);g4.connect(filt);
  filt.connect(master);master.connect(_dst());
  o1.start();o2.start();o3.start();o4.start();
  engineOsc=o1;engineOsc._o2=o2;engineOsc._o3=o3;engineOsc._o4=o4;engineOsc._filt=filt;
  engineGain=master;
  // Tire rolling — continuous filtered noise
  const rSz=ctx.sampleRate*2,rBuf=ctx.createBuffer(1,rSz,ctx.sampleRate);
  const rD=rBuf.getChannelData(0);for(let i=0;i<rSz;i++)rD[i]=Math.random()*2-1;
  const rSrc=ctx.createBufferSource();rSrc.buffer=rBuf;rSrc.loop=true;
  const rFilt=ctx.createBiquadFilter();rFilt.type='bandpass';rFilt.frequency.value=200;rFilt.Q.value=2;
  const rGain=ctx.createGain();rGain.gain.value=0;
  rSrc.connect(rFilt);rFilt.connect(rGain);rGain.connect(_dst());rSrc.start();
  _rollGain=rGain;_rollSrc=rSrc;_rollFilt=rFilt;
}

let _lastGear=1;
function updateEngine(spd){
  if(!audioCtx)return;
  if(!engineOsc)initEngine();
  const abs=Math.abs(spd);
  const car=carObjs[playerIdx];
  const max=car?car.def.topSpd:1.8;
  const carType=car?car.def.type:'super';
  // Per-type frequency multiplier: F1 screams, muscle deep, electric silent
  const typeFreqM=carType==='f1'?1.55:carType==='muscle'?0.72:carType==='electric'?0.3:1.0;
  const typeGainM=carType==='electric'?0.12:carType==='muscle'?1.35:carType==='f1'?1.15:1.0;
  const ratio=Math.min(1,abs/max);
  const gear=Math.min(5,Math.floor(ratio*5)+1);
  _currentGear=gear;
  const inGear=ratio*5-(gear-1);
  const rpm=700+inGear*4200;
  const base=(rpm/60*1.2)*typeFreqM;
  const t=audioCtx.currentTime;
  const isBoost=nitroActive||(car&&car.boostTimer>0);
  engineOsc.frequency.setTargetAtTime(base*(isBoost?1.06:1),t,.035);
  engineOsc._o2.frequency.setTargetAtTime(base*2*(isBoost?1.04:1),t,.035);
  engineOsc._o3.frequency.setTargetAtTime(base*3,t,.035);
  if(engineOsc._o4)engineOsc._o4.frequency.setTargetAtTime(35+ratio*45,t,.06);
  // F1: open filter for screaming tone; muscle: tight lowpass for burble
  const filtFreq=carType==='f1'?(600+inGear*4500):carType==='muscle'?(180+inGear*1400):(isBoost?(500+inGear*3200):(280+inGear*2400));
  engineOsc._filt.frequency.setTargetAtTime(filtFreq,t,.05);
  engineGain.gain.setTargetAtTime(abs>.01?(isBoost?(.12+ratio*.07)*typeGainM:(.09+ratio*.05)*typeGainM):.022*typeGainM,t,.08);
  // Electric: add high-pitch whirr instead of roar
  if(carType==='electric'&&engineOsc._o3){
    engineOsc._o3.frequency.setTargetAtTime(800+ratio*3200,t,.05);
  }
  if(_rollGain){_rollGain.gain.setTargetAtTime(abs*.025,t,.1);if(_rollFilt)_rollFilt.frequency.setTargetAtTime(200+abs*180,t,.1);}
  if(gear!==_lastGear&&abs>.3){
    const up=gear>_lastGear,o=audioCtx.createOscillator(),g=audioCtx.createGain();
    // F1 gear shift: rapid chirp; muscle: loud pop; other: normal blip
    o.type=carType==='muscle'?'sawtooth':'sawtooth';
    const chirpF=carType==='f1'?480:carType==='muscle'?120:290;
    o.frequency.setValueAtTime(up?chirpF:chirpF*.7,t);
    o.frequency.exponentialRampToValueAtTime(up?chirpF*.65:chirpF*.95,t+(carType==='f1'?.05:.09));
    const chirpV=carType==='muscle'?.11:carType==='f1'?.055:.065;
    g.gain.setValueAtTime(chirpV,t);g.gain.exponentialRampToValueAtTime(.001,t+(carType==='f1'?.07:.13));
    o.connect(g);g.connect(_dst());o.start(t);o.stop(t+(carType==='f1'?.08:.15));
    _lastGear=gear;
  }
}

function beep(f,d,v=.25,delay=0,type='sine'){
  if(!audioCtx)return;
  const o=audioCtx.createOscillator(),g=audioCtx.createGain(),t=audioCtx.currentTime+delay;
  o.type=type;o.frequency.value=f;
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.01);
  g.gain.exponentialRampToValueAtTime(.001,t+d);
  o.connect(g);g.connect(_dst());o.start(t);o.stop(t+d+.01);
}
function _noise(dur,fq,Q,vol,delay=0){
  if(!audioCtx)return;
  const t=audioCtx.currentTime+delay;
  const sz=Math.ceil(audioCtx.sampleRate*Math.min(dur,.8));
  const buf=audioCtx.createBuffer(1,sz,audioCtx.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
  const src=audioCtx.createBufferSource(),f=audioCtx.createBiquadFilter(),g=audioCtx.createGain();
  f.type='bandpass';f.frequency.value=fq;f.Q.value=Q;
  g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
  src.buffer=buf;src.connect(f);f.connect(g);g.connect(_dst());src.start(t);src.stop(t+dur+.01);
}

function playBoostSound(){
  // Ascending zap
  beep(220,.08,.3,0,'sawtooth');beep(440,.06,.22,.04,'sawtooth');beep(880,.04,.15,.08,'sawtooth');
  _noise(.2,2200,1.5,.06);
}
function playNitroActivate(){
  if(!audioCtx)return;
  const t=audioCtx.currentTime;
  // Ascending filtered whoosh
  const o=audioCtx.createOscillator(),g=audioCtx.createGain(),f=audioCtx.createBiquadFilter();
  o.type='sawtooth';f.type='highpass';f.frequency.value=200;
  o.frequency.setValueAtTime(80,t);o.frequency.exponentialRampToValueAtTime(800,t+.35);
  g.gain.setValueAtTime(.32,t);g.gain.exponentialRampToValueAtTime(.001,t+.4);
  o.connect(f);f.connect(g);g.connect(_dst());o.start(t);o.stop(t+.44);
  // Sub bass drop
  beep(38,.4,.55,.05,'sine');
  _noise(.32,2400,1.5,.18);
}
function playTireScreech(){_noise(.22,680,4.5,.2);_noise(.2,1500,2,.09);}
function playJumpSound(){
  beep(210,.05,.2,0,'sine');beep(360,.07,.15,.04,'sine');_noise(.1,580,4,.08);
}
function playLandSound(){
  beep(60,.28,.45,0,'sawtooth');_noise(.2,210,1.5,.32);
}
function playSpinSound(){_noise(.7,540,3.5,.2);beep(255,.5,.07,0,'sine');}
function playCollisionSound(){
  beep(58,.18,.65,0,'sine');           // low thud
  _noise(.32,1300,1.1,.28,.01);        // metal crunch
  _noise(.18,4200,3.5,.35,.06);        // glass scatter
}
function playVictoryFanfare(){
  if(!audioCtx)return;
  // 5-note ascending fanfare — triumphant major
  [[523,.55,.28],[659,.55,.26],[784,.55,.24],[1047,.7,.22],[1319,.9,.20]].forEach(([f,d,v],i)=>{
    setTimeout(()=>{beep(f,d,v,0,'sine');beep(f*2,d*.6,v*.35,0,'sine');},i*155);
  });
  // Final chord stab — clean sine waves only
  setTimeout(()=>{[523,659,784,1047].forEach(f=>beep(f,1.4,.13,0,'sine'));},860);
  // Warm pad: sine oscillators (replaces harsh sawtooth)
  if(audioCtx){
    const t=audioCtx.currentTime+.90;
    [261,329,392,523].forEach(f=>{
      const o=audioCtx.createOscillator(),g=audioCtx.createGain();
      o.type='sine';o.frequency.value=f;
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.08,t+.22);
      g.gain.exponentialRampToValueAtTime(.001,t+2.4);
      o.connect(g);g.connect(_dst());o.start(t);o.stop(t+2.5);
    });
  }
}
function playCountBeep(n){
  if(n>0){
    // Single clean tone per light — no delayed second hit
    beep(490,.20,.50,0,'sine');
    beep(980,.08,.15,0,'sine'); // same timing, softer harmonic (sine not square)
  }else{
    [523.3,659.3,784.0].forEach((f,i)=>beep(f,.48,.42,i*.055,'square'));
    [523.3,659.3,784.0].forEach((f,i)=>beep(f*2,.24,.18,.3+i*.055,'sine'));
  }
}
function playFanfare(){
  const n=[523.3,659.3,784.0,1046.5];
  n.forEach((f,i)=>{beep(f,.4,.44,i*.22,'square');beep(f,.32,.2,i*.22+.16,'sine');});
  n.forEach(f=>beep(f,.75,.32,.96,'triangle'));
}
function playRecoverySound(){
  [195,160,128].forEach((f,i)=>beep(f,.24,.24,i*.11,'sine'));_noise(.3,275,2,.18);
}
function playCollectSound(){
  // Pentatonic chime
  [523,659,784,1047].forEach((f,i)=>beep(f,.22,.35,i*.07,'sine'));
}
// ── Thunder ───────────────────────────────────
function playThunder(){
  if(!audioCtx)return;
  const delay=.4+Math.random()*1.8,t=audioCtx.currentTime+delay;
  const sz=Math.ceil(audioCtx.sampleRate*2.8);
  const buf=audioCtx.createBuffer(1,sz,audioCtx.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
  const src=audioCtx.createBufferSource();src.buffer=buf;
  const f=audioCtx.createBiquadFilter();f.type='lowpass';f.frequency.value=110;f.Q.value=.4;
  const g=audioCtx.createGain();
  g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.42,t+.06);
  g.gain.setValueAtTime(.42,t+.32);g.gain.exponentialRampToValueAtTime(.001,t+2.6);
  src.connect(f);f.connect(g);g.connect(_dst());src.start(t);src.stop(t+2.8);
  beep(75,.08,.62,delay,'sawtooth');_noise(.1,240,2,.38,delay+.01);
}
function updateThunder(dt){
  if(!isRain||!audioCtx)return;
  _thunderTimer-=dt;
  if(_thunderTimer<=0){Audio.playThunder();_thunderTimer=9+Math.random()*20;}
}
// ── Crowd noise ───────────────────────────────
function initCrowdNoise(){
  if(!audioCtx||_crowdGain)return;
  const sz=Math.ceil(audioCtx.sampleRate*3.2);
  const buf=audioCtx.createBuffer(1,sz,audioCtx.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
  const src=audioCtx.createBufferSource();src.buffer=buf;src.loop=true;
  const f1=audioCtx.createBiquadFilter();f1.type='bandpass';f1.frequency.value=580;f1.Q.value=1.4;
  const f2=audioCtx.createBiquadFilter();f2.type='bandpass';f2.frequency.value=950;f2.Q.value=.9;
  _crowdGain=audioCtx.createGain();_crowdGain.gain.value=0;
  src.connect(f1);src.connect(f2);f1.connect(_crowdGain);f2.connect(_crowdGain);_crowdGain.connect(_dst());
  src.start();_crowdSrc=src;
}
function stopCrowdNoise(){
  if(_crowdGain){const t=audioCtx.currentTime;_crowdGain.gain.setTargetAtTime(0,t,.3);}
  const ref=_crowdSrc;setTimeout(()=>{try{ref&&ref.stop();}catch(e){}},800);
  _crowdSrc=null;_crowdGain=null;
}
function updateCrowdNoise(pPos){
  if(!_crowdGain||!audioCtx)return;
  const target=pPos===1?.062:pPos<=3?.036:.016;
  _crowdGain.gain.setTargetAtTime(target,audioCtx.currentTime,.9);
}

function startAmbientWind(){
  if(!audioCtx||_ambientWind)return;
  const sz=audioCtx.sampleRate*2;
  const buf=audioCtx.createBuffer(1,sz,audioCtx.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
  const src=audioCtx.createBufferSource();src.buffer=buf;src.loop=true;
  const f1=audioCtx.createBiquadFilter();f1.type='bandpass';f1.frequency.value=280;f1.Q.value=.25;
  const f2=audioCtx.createBiquadFilter();f2.type='highpass';f2.frequency.value=100;f2.Q.value=.1;
  const g=audioCtx.createGain();g.gain.value=0;
  src.connect(f1);f1.connect(f2);f2.connect(g);g.connect(_dst());
  src.start();
  // Gentle fade-in
  const t=audioCtx.currentTime;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.038,t+2.5);
  _ambientWind=src;_ambientWindGain=g;
}
function stopAmbientWind(){
  if(!_ambientWind)return;
  if(_ambientWindGain){
    const t=audioCtx.currentTime;
    _ambientWindGain.gain.setTargetAtTime(0,t,.4);
  }
  const ref=_ambientWind;
  setTimeout(()=>{try{ref.stop();}catch(e){}},1200);
  _ambientWind=null;_ambientWindGain=null;
}
function playCrowdCheer(){
  if(!audioCtx)return;
  const sz=Math.ceil(audioCtx.sampleRate*.55);
  const buf=audioCtx.createBuffer(1,sz,audioCtx.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
  const src=audioCtx.createBufferSource();src.buffer=buf;
  const f=audioCtx.createBiquadFilter();f.type='bandpass';f.frequency.value=750;f.Q.value=1.8;
  const g=audioCtx.createGain();
  const t=audioCtx.currentTime;
  g.gain.setValueAtTime(.0,t);g.gain.linearRampToValueAtTime(.14,t+.08);
  g.gain.setValueAtTime(.14,t+.22);g.gain.exponentialRampToValueAtTime(.001,t+.58);
  src.connect(f);f.connect(g);g.connect(_dst());src.start(t);src.stop(t+.62);
  [550,850,1300,1800].forEach((freq,i)=>{
    const o=audioCtx.createOscillator(),og=audioCtx.createGain();
    o.type='sine';
    o.frequency.setValueAtTime(freq*.75,t+i*.045);
    o.frequency.exponentialRampToValueAtTime(freq*1.35,t+i*.045+.22);
    og.gain.setValueAtTime(.025,t+i*.045);og.gain.exponentialRampToValueAtTime(.001,t+i*.045+.28);
    o.connect(og);og.connect(_dst());o.start(t+i*.045);o.stop(t+i*.045+.32);
  });
}

// ══ PERSISTENCE ══════════════════════════════
let _coins=0,_totalCoinsEarned=0;
let _lastRaceCoins=0,_comboMult=1.0,_comboTimer=0,_comboCount=0;
let _bestS1=Infinity,_bestS2=Infinity,_bestS3=Infinity;
const ACHIEVEMENTS=[
  {id:'first_win',icon:'🏆',title:'FIRST WIN',desc:'Win your first race',check:function(p){return p===1&&_raceCount<=1;}},
  {id:'clean',icon:'✨',title:'CLEAN RACER',desc:'Zero damage finish',check:function(p,s){return s.hits===0;}},
  {id:'speed300',icon:'⚡',title:'SPEED DEMON',desc:'Hit 300+ km/h',check:function(p,s){return s.maxSpd>=300;}},
  {id:'collector',icon:'🚗',title:'COLLECTOR',desc:'Own 6+ cars',check:function(){return _unlockedCars.size>=6;}},
  {id:'rich',icon:'💰',title:'COIN MASTER',desc:'Earn 1000+ total coins',check:function(){return _totalCoinsEarned>=1000;}},
  {id:'fl',icon:'💜',title:'PURPLE RIBBON',desc:'Set fastest lap',check:function(p,s){return s.fl;}},
  {id:'podium5',icon:'🥇',title:'VETERAN',desc:'5 podium finishes',check:function(){return _podiumCount>=5;}},
  {id:'combo4',icon:'🔥',title:'ON FIRE',desc:'4x combo in a race',check:function(){return _comboCount>=4;}},
];
let _totalNitroUses=0,_winStreak=0;
var DAILY_CHALLENGES=[
  {id:'win',text:'Win een race',reward:150,check:function(p){return p===1;}},
  {id:'clean',text:'Finish zonder schade',reward:200,check:function(p,s){return s.hits===0;}},
  {id:'fl',text:'Zet de snelste ronde',reward:120,check:function(p,s){return s.fl;}},
  {id:'night',text:'Win een nachtrace',reward:160,check:function(p){return p===1&&isDark;}},
  {id:'hard',text:'Top 3 op Hard',reward:250,check:function(p){return p<=3&&difficulty===2;}},
  {id:'p3',text:'Podium finish',reward:100,check:function(p){return p<=3;}},
  {id:'combo3',text:'Haal een 3x combo',reward:180,check:function(){return _comboCount>=3;}},
];
var _todayChallenge=null,_challengeCompleted=false,_todayRaces=0;
let _worldsUnlocked=new Set(['grandprix']);
let _trackRecords={};

// ── PERSISTENCE FUNCTIONS — verplaatst naar js/persistence/save.js + progression.js ──
// loadPersistent, savePersistent, awardCoins, buyCar, buyWorld,
// checkUnlocks, showUnlockToast, showUnlocks, updateTitleHighScore
// zijn beschikbaar via window.xxx (module laadt deze op DOMContentLoaded).

let CAR_PRICES={};      // gevuld door loadGameData
let WORLD_PRICES={};    // gevuld door loadGameData
function getSector(progress){if(progress<0.33)return 0;if(progress<0.67)return 1;return 2;}
function triggerCombo(reason){
  _comboCount++;_comboTimer=8.0;
  if(_comboCount>=6)_comboMult=2.5;
  else if(_comboCount>=4)_comboMult=2.0;
  else if(_comboCount>=2)_comboMult=1.5;
  else _comboMult=1.2;
  showPopup('🔥 '+reason+' · '+_comboMult.toFixed(1)+'x','#ff8800',900);
  const ce=document.getElementById('comboEl');
  if(ce){ce.textContent=_comboCount+'x COMBO';ce.style.opacity='1';}
}
function resetCombo(){
  _comboCount=0;_comboMult=1.0;
  const ce=document.getElementById('comboEl');if(ce)ce.style.opacity='0';
}
// (TitleMusic + SelectMusic + RaceMusic classes + MusicLib + music-master
//  state + helper-functies zijn verhuisd naar js/audio/music.js tijdens
//  Fase 2.2a. Dit zijn dead fragments van comments die daarbij zijn
//  achtergebleven — hier opgeruimd.)

// ══ RENDERER ═════════════════════════════════
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
    const ov=document.getElementById('ctxLostOverlay');if(ov)ov.style.display='flex';
    if(audioCtx&&audioCtx.state==='running')audioCtx.suspend().catch(()=>{});
    _ctxLostReloadTimer=setTimeout(()=>{if(_ctxLost)location.reload();},CTX_LOSS_RELOAD_MS);
  });
  canvas.addEventListener('webglcontextrestored',()=>{
    if(_ctxLostReloadTimer){clearTimeout(_ctxLostReloadTimer);_ctxLostReloadTimer=null;}
    _ctxLost=false;
    const ov=document.getElementById('ctxLostOverlay');if(ov)ov.style.display='none';
    if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
    try{if(scene&&activeWorld)buildScene();}catch(err){console.error('ctx restore rebuild failed',err);location.reload();}
  });
  window.addEventListener('beforeunload',()=>{try{renderer.dispose();renderer.forceContextLoss();}catch(e){}});
  document.addEventListener('visibilitychange',()=>{if(audioCtx)document.hidden?audioCtx.suspend():audioCtx.resume();});
  renderer.setPixelRatio(_mob?Math.min(devicePixelRatio,1.5):Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=!_mob;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  renderer.outputEncoding=THREE.sRGBEncoding;
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

// ══ SCENE ════════════════════════════════════
// Dispose the previous scene.background texture to prevent GPU memory leaks on
// world/night/rain toggles — every call-site here assigns the result to scene.background.
function makeSkyTex(top,bot){
  if(scene&&scene.background&&scene.background.isTexture)scene.background.dispose();
  const c=document.createElement('canvas');c.width=2;c.height=512;
  const g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,512);
  gr.addColorStop(0,top);gr.addColorStop(1,bot);g.fillStyle=gr;g.fillRect(0,0,2,512);
  const t=new THREE.CanvasTexture(c);t.needsUpdate=true;return t;
}
function buildScene(){
  disposeScene();
  // ── Swap TRACK_WP data for active world ───────────────────────
  {const src=(_TRACKS&&_TRACKS[activeWorld])||_GP_WP;
   TRACK_WP.length=0;src.forEach(wp=>TRACK_WP.push(wp));}
  // ── Reset global arrays populated during scene build ──────────
  trackLightList.length=0;trackPoles.length=0;_trackFlags.length=0;_aiHeadPool.length=0;
  jumpRamps.length=0;spinPads.length=0;boostPads.length=0;collectibles.length=0;skidMarks.length=0;
  _wpWaterPuddles.length=0;_wpDrsZones.length=0;
  _wpGravityZones.length=0;_wpOrbitAsteroids.length=0;_wpWarpTunnels.length=0;
  _wpCurrentStreams.length=0;_wpAbyssCracks.length=0;_wpTreasureTrail.length=0;
  _drsActive=false;_drsTimer=0;_drsBoostUsed=false;
  stars=null;plHeadL=null;plHeadR=null;plTail=null;
  _boostLight=null;_trackMesh=null;_sunBillboard=null;
  _spaceAsteroids.length=0;_spaceDustParticles=null;_spaceDustGeo=null;
  _snowParticles=null;_snowGeo=null;
  _spaceGravityWells.length=0;_spaceRailguns.length=0;_spaceWormholes.length=0;
  _spaceUFOs.length=0;_spaceMeteors.length=0;_spaceMeteorTimer=18;
  _spaceBeamMesh=null;_spaceBeamTimer=0;_spaceUnderglow.length=0;
  _kelpList.length=0;_jellyfishList.length=0;_dsaLightRays.length=0;_dsaBioEdges.length=0;
  _dsaBubbleGeo=null;_dsaBubblePos=null;_dsaTreasures.length=0;
  _dsaCreatures.manta=null;_dsaCreatures.whale=null;_dsaCreatures.fishSchools.length=0;
  _dsaCurrentDir=0;
  _sprinkleParticles=null;_sprinkleGeo=null;
  _gummyBears.length=0;_gumZones.length=0;_candyCannons.length=0;
  _chocoHighlight=null;_candyCaneList.length=0;_candyLollipops.length=0;
  _candyNightEmissives.length=0;_candyCandles.length=0;
  _neonBuildings.length=0;_neonEmissives.length=0;_neonBuildingLights.length=0;
  _holoBillboards.length=0;_neonSteamVents.length=0;
  _neonSteamGeo=null;_neonSteamPts=null;_neonSteamPos=null;
  _neonDustGeo=null;_neonDustPts=null;_neonWater=null;
  _neonEmpZones.length=0;_neonHoloWalls.length=0;
  _volcanoLavaRivers.length=0;_volcanoGeisers.length=0;_volcanoEruption=null;_volcanoEruptionTimer=3;
  _volcanoEmberGeo=null;_volcanoEmbers=null;_volcanoGlowLight=null;
  _arcticIcePatches.length=0;_arcticAurora.length=0;_arcticBlizzardGeo=null;
  _tpFerris=null;_tpCarousel=null;_tpCarouselHorses.length=0;_tpCoasters.length=0;
  _tpBalloons.length=0;_tpFireworks.length=0;_tpBunting.length=0;_tpParkLights.length=0;
  _tpFireworkTimer=2;

  const isSpace=activeWorld==='space';
  const isDeepSea=activeWorld==='deepsea';
  const isCandy=activeWorld==='candy';
  const isNeon=activeWorld==='neoncity';
  const isThemepark=activeWorld==='themepark';
  scene=new THREE.Scene();
  if(isSpace){
    scene.background=makeSkyTex('#000005','#010018');
    scene.fog=new THREE.FogExp2(0x050015,.0008);
    _fogColorDay.setHex(0x050015);_fogColorNight.setHex(0x020008);
  }else if(isDeepSea){
    scene.background=makeSkyTex('#001825','#003355');
    scene.fog=new THREE.FogExp2(0x002233,.0014);
    _fogColorDay.setHex(0x002233);_fogColorNight.setHex(0x000810);
  }else if(isCandy){
    scene.background=makeSkyTex('#ff88cc','#ffe4f0');
    scene.fog=new THREE.FogExp2(0xffccee,.0009);
    _fogColorDay.setHex(0xffccee);_fogColorNight.setHex(0x2a0a1a);
  }else if(isNeon){
    scene.background=makeSkyTex('#000008','#030012');
    scene.fog=new THREE.FogExp2(0x050012,.0015);
    _fogColorDay.setHex(0x050012);_fogColorNight.setHex(0x020008);
  }else if(isThemepark){
    scene.background=makeSkyTex('#2a0844','#ff8844');
    scene.fog=new THREE.FogExp2(0x552244,.00095);
    _fogColorDay.setHex(0x553366);_fogColorNight.setHex(0x0a0018);
  }else{
    scene.background=makeSkyTex('#1e5292','#b8d8ee');
    scene.fog=new THREE.FogExp2(0x8ac0e0,.00125);
    _fogColorDay.setHex(0x8ac0e0);_fogColorNight.setHex(0x030610);
  }
  camera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.2,900);
  camera.position.set(0,12,330);camera.lookAt(0,0,280);
  camPos.copy(camera.position);
  mirrorCamera=new THREE.PerspectiveCamera(68,204/80,.1,400);

  const _dirLightColor=isSpace?0xaaaaff:isDeepSea?0x44aacc:isCandy?0xfff0e0:isNeon?0x4444ff:isThemepark?0xffcc88:0xfff5e0;
  const _dirLightInt=isSpace?.06:isDeepSea?.45:isCandy?1.5:isNeon?.04:isThemepark?.85:1.65;
  sunLight=new THREE.DirectionalLight(_dirLightColor,_dirLightInt);
  sunLight.position.set(180,320,80);sunLight.castShadow=true;
  sunLight.shadow.mapSize.set(1024,1024);
  sunLight.shadow.camera.near=10;sunLight.shadow.camera.far=900;
  sunLight.shadow.camera.left=sunLight.shadow.camera.bottom=-500;
  sunLight.shadow.camera.right=sunLight.shadow.camera.top=500;
  sunLight.shadow.bias=-.0008;
  scene.add(sunLight);
  const _ambColor=isSpace?0x334466:isDeepSea?0x003355:isCandy?0xffccdd:isNeon?0x111133:isThemepark?0x6633aa:0x88aacc;
  const _ambInt=isSpace?.18:isDeepSea?.55:isCandy?.65:isNeon?.25:isThemepark?.45:.50;
  ambientLight=new THREE.AmbientLight(_ambColor,_ambInt);scene.add(ambientLight);
  const _hemiSky=isSpace?0x334466:isDeepSea?0x0055aa:isCandy?0xffd4e8:isNeon?0x222255:isThemepark?0xff88cc:0x9bbfdd;
  const _hemiGnd=isSpace?0x110022:isDeepSea?0x001122:isCandy?0xffccaa:isNeon?0x0a0a1a:isThemepark?0x331144:0x4a7a3d;
  const _hemiInt=isSpace?.14:isDeepSea?.30:isCandy?.45:isNeon?.15:isThemepark?.35:.36;
  hemiLight=new THREE.HemisphereLight(_hemiSky,_hemiGnd,_hemiInt);scene.add(hemiLight);

  buildTrack();
  if(isSpace){
    buildSpaceEnvironment();
  }else if(isDeepSea){
    buildDeepSeaEnvironment();
  }else if(isCandy){
    buildCandyEnvironment();
  }else if(isNeon){
    buildNeonCityEnvironment();
  }else if(activeWorld==='volcano'){
    buildVolcanoEnvironment();
  }else if(activeWorld==='arctic'){
    buildArcticEnvironment();
  }else if(isThemepark){
    buildThemeparkEnvironment();
  }else{
    buildGround();buildClouds();buildBarriers();buildGantry();
    buildMountains();buildLake();buildGravelTraps();buildEnvironmentTrees();
    buildNightObjects();buildSpectators();buildSunBillboard();
    buildAdvertisingBoards();buildCornerBoards();buildTrackFlags();
    buildGPTrackProps();
  }
  buildJumpRamps();
  buildCenterlineArrows();
  buildSpinPads();
  buildBoostPads();
  buildCollectibles();
  buildWorldElements();
  buildParticles();
  // AI headlight pool — 4 point lights shared across AI cars
  for(let i=0;i<4;i++){const l=new THREE.PointLight(0xffffcc,0,22,2);scene.add(l);_aiHeadPool.push(l);}
  buildGhostMesh();
  initSpeedLines();
  initRain();
  // Cache minimap bounds
  const _xs=TRACK_WP.map(p=>p[0]),_zs=TRACK_WP.map(p=>p[1]);
  _mmBounds={mnX:Math.min(..._xs),mxX:Math.max(..._xs),mnZ:Math.min(..._zs),mxZ:Math.max(..._zs)};
  // Default to dark mode (isDark=false at entry, toggleNight sets it dark)
  isDark=false;toggleNight();
}

// ══ TRACK ════════════════════════════════════
// ══ JUMP PADS (flat launchpads — no physical ramp surface, just a trigger zone) ══
// ══ SPIN PADS ════════════════════════════════
// ══ BOOST PADS (modern clean design) ═════════
// ══ COLLECTIBLES (modern holographic tokens) ═════════════════════
// ══ WORLD-SPECIFIC TRACK ELEMENTS ═══════════
// ── GP: Water Puddles ─────────────────────────────────
// ── GP: DRS Zone ─────────────────────────────────────
// ── GP: Tyre Barriers (visual only at key corners) ────
// ── Space: Gravity Zones ──────────────────────────────
// ── Space: Orbiting Asteroids ─────────────────────────
// ── Space: Warp Tunnels ───────────────────────────────
// ── DeepSea: Current Streams ──────────────────────────
// ── DeepSea: Abyss Cracks ────────────────────────────
// ── DeepSea: Treasure Trail ───────────────────────────
// ══ PARTICLE SYSTEMS ════════════════════════
class SimpleParticles{
  constructor(maxP,scene){
    this.max=maxP;this.alive=[];
    const geo=new THREE.BufferGeometry();
    const pos=new Float32Array(maxP*3);
    const col=new Float32Array(maxP*3);
    const sz=new Float32Array(maxP);
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.BufferAttribute(col,3));
    geo.setAttribute('size',new THREE.BufferAttribute(sz,1));
    this.mat=new THREE.PointsMaterial({size:.6,vertexColors:true,transparent:true,opacity:.85,sizeAttenuation:true});
    this.pts=new THREE.Points(geo,this.mat);
    scene.add(this.pts);this.geo=geo;
  }
  emit(x,y,z,vx,vy,vz,n,r,g,b,life=.6){
    for(let i=0;i<n&&this.alive.length<this.max;i++){
      this.alive.push({x,y,z,vx:vx+(Math.random()-.5)*.15,vy:vy+Math.random()*.1,vz:vz+(Math.random()-.5)*.15,r,g,b,life,maxL:life});
    }
  }
  update(dt){
    const pos=this.geo.attributes.position.array;
    const col=this.geo.attributes.color.array;
    const sz=this.geo.attributes.size.array;
    // In-place removal: swap dead particles to end, no new array allocation
    let n=this.alive.length;
    for(let i=n-1;i>=0;i--){
      const p=this.alive[i];
      p.life-=dt/p.maxL;
      if(p.life<=0){
        // Swap with last alive entry (O(1) removal, no array allocation)
        const swapIdx=--n;
        this.alive[i]=this.alive[swapIdx];this.alive.length=n;
        // Zero GPU slot i (dead) and slot swapIdx (now orphaned)
        pos[i*3]=pos[i*3+1]=pos[i*3+2]=0;sz[i]=0;col[i*3]=col[i*3+1]=col[i*3+2]=0;
        pos[swapIdx*3]=pos[swapIdx*3+1]=pos[swapIdx*3+2]=0;sz[swapIdx]=0;col[swapIdx*3]=col[swapIdx*3+1]=col[swapIdx*3+2]=0;
      }else{
        p.x+=p.vx;p.y+=p.vy;p.z+=p.vz;p.vy-=.008;
        pos[i*3]=p.x;pos[i*3+1]=p.y;pos[i*3+2]=p.z;
        sz[i]=p.life*.7;
        col[i*3]=p.r;col[i*3+1]=p.g;col[i*3+2]=p.b;
      }
    }
    if(n===0&&this.alive.length===0)return; // nothing to upload
    this.geo.attributes.position.needsUpdate=true;
    this.geo.attributes.color.needsUpdate=true;
    this.geo.attributes.size.needsUpdate=true;
  }
}
// ══ MOUNTAINS ════════════════════════════════
// ══ LAKE ═════════════════════════════════════
// ══ PIT BUILDING ─────────────────────────────
// ══ GRAVEL TRAPS ─────────────────────────────
// ══ ENVIRONMENT TREES ────────────────────────
// ══ GP TRACK-SIDE PROPS (Candy-style close placement) ══════════
// ══ TRACK FLAGS ══════════════════════════════
// ══ SUN LENS FLARE ═══════════════════════════
// ══ CORNER BOARDS ════════════════════════════
// ══ ADVERTISING BOARDS ═══════════════════════
// ══ DYNAMIC SKY ═══════════════════════════════
// ══ NIGHT MODE ═══════════════════════════════
// ══ SPACE WORLD ═══════════════════════════════
// ══ DEEP SEA WORLD ═══════════════════════════════════════════════════════════

// ══ NEON CITY WORLD ═══════════════════════════════════════════════════════════
// ── Neon City Gameplay Elements ───────────────────────────────────────────────
// ── Neon City Update Loop ─────────────────────────────────────────────────────
// ══ CANDY WORLD ═══════════════════════════════════════════════════════════════
// ── Space fall / tractor beam recovery ────────────────────────────────────────
// Space audio helpers
// ── Space railgun player check ──────────────────────────────────────────────
// ── Space wormhole player check ────────────────────────────────────────────
// Wormholes stored as individual portal objects: {t, linkedT, ring, portal, ...}
// Portals come in pairs: index 0+1 for pair 1, index 2+3 for pair 2
let _wormholeCooldown=0;
// ══ NIGHT MODE ═══════════════════════════════
// ══ RAIN ═════════════════════════════════════
// ══ CAR BUILDING ════════════════════════════
// ══ THRILL PARK WORLD ═════════════════════════
// ══ SPAWN CARS ════════════════════════════════
// ══ PLAYER PHYSICS ══════════════════════════
// ══ AI ═══════════════════════════════════════
// ══ SPECIAL OBJECT CHECKS ════════════════════
// ══ TRACK LIMITS ════════════════════════════
// Skid marks
// ══ CAMERA ══════════════════════════════════
// ══ HUD ════════════════════════════════════
// Cached DOM refs (avoid getElementById every frame)
let _elPos,_elPosOf,_elLap,_elSpd,_elNitro,_elLapTime,_elTireT,_elSecT,_elPitAvail,_elCloseBattle,_elFastestLapFlash;
function cacheHUDRefs(){
  // On mobile: hide performance-heavy HUD elements
  if(window._isMobile){
    ['hudLeader','sectorPanel','hudGap','hudScore','hudTire','hudTireTemp',
     'hudRainBtn','hudNightBtn','hudMuteBtn','ghostLabel','drsIndicator',
     'closeBattleEl','speedTrapEl','mirrorFrame','mirrorLabel','speedLines'].forEach(id=>{
      const el=document.getElementById(id);if(el)el.style.display='none';
    });
    if(renderer)renderer.setPixelRatio(Math.min(devicePixelRatio,1));
  }
  _elPos=document.getElementById('hdPos');
  _elPosOf=document.getElementById('hdPosOf');
  _elLap=document.getElementById('hdLap');
  _elSpd=document.getElementById('hdSpd');
  _elNitro=document.getElementById('nitroFill');
  _elLapTime=document.getElementById('hdLapTime');
  _elSlip=document.getElementById('slipIndicator');
  _elWarn=document.getElementById('warnOverlay');
  _mapCvs=document.getElementById('mapCvs');
  _mapCtx=_mapCvs?_mapCvs.getContext('2d'):null;
  _elGear=document.getElementById('hdGear');
  _elLeader=document.getElementById('hudLeader');
  _elWrongWay=document.getElementById('wrongWayOverlay');
  _elScore=document.getElementById('hdScore');
  _elLapDelta=document.getElementById('hdLapDelta');
  _elTire=document.getElementById('hdTire');
  _elRpm=document.getElementById('rpmFill');
  _elGapAhead=document.getElementById('gapAhead');
  _elGapBehind=document.getElementById('gapBehind');
  _drsEl=document.getElementById('drsIndicator');
  _sectorPanelEl=document.getElementById('sectorPanel');
  _speedTrapEl=document.getElementById('speedTrapEl');
  _elTireT={fl:document.getElementById('ttFL'),fr:document.getElementById('ttFR'),rl:document.getElementById('ttRL'),rr:document.getElementById('ttRR')};
  _elSecT=[document.getElementById('secT1'),document.getElementById('secT2'),document.getElementById('secT3')];
  _elPitAvail=document.getElementById('pitAvailable');
  _elCloseBattle=document.getElementById('closeBattleEl');
  _elFastestLapFlash=document.getElementById('fastestLapFlash');
}

function showBannerTop(text,color,dur){
  var el=document.getElementById('topBanner');if(!el)return;
  el.textContent=text;el.style.color=color;
  el.style.opacity='1';el.style.transform='translateX(-50%) translateY(0)';
  clearTimeout(el._t);el._t=setTimeout(function(){el.style.opacity='0';el.style.transform='translateX(-50%) translateY(20px)';},dur||2000);
}
let popupTimeouts=[];
function showPopup(text,color,dur=1000){
  const el=document.getElementById('popupMsg');
  el.textContent=text;el.style.color=color;el.style.textShadow='0 0 14px '+color+',0 2px 6px rgba(0,0,0,.85)';
  el.style.opacity='1'; // font-size now lives in CSS so it stays compact
  popupTimeouts.forEach(t=>clearTimeout(t));
  popupTimeouts=[setTimeout(()=>{const start=performance.now();const fade=now=>{const p=(now-start)/400;el.style.opacity=Math.max(0,1-p);if(p<1)requestAnimationFrame(fade);};requestAnimationFrame(fade);},dur)];
}

let bannerTimer=null;
function showBanner(text,color,dur){
  if(bannerTimer)clearTimeout(bannerTimer);
  const ov=document.getElementById('bannerOverlay'),el=document.getElementById('bannerText');
  el.textContent=text;el.style.color=color;el.style.border='3px solid '+color;el.style.background='rgba(0,0,0,.8)';el.style.textShadow='0 0 20px '+color;
  ov.style.display='block';if(dur)bannerTimer=setTimeout(hideBanner,dur);
}
function hideBanner(){document.getElementById('bannerOverlay').style.display='none';}

function getPositions(){
  if(_posCache.length!==carObjs.length||(_posTick++%8===0)){
    _posCache.length=carObjs.length;
    for(let i=0;i<carObjs.length;i++)_posCache[i]=carObjs[i];
    _posCache.sort((a,b)=>{
      if(b.lap!==a.lap)return b.lap-a.lap;
      let ap=a.progress,bp=b.progress;
      if(Math.abs(bp-ap)>.5){if(ap<.5)ap+=1;else bp+=1;}
      return bp-ap;
    });
  }
  return _posCache;
}

const fmtTime=s=>s<60?s.toFixed(2)+'s':Math.floor(s/60)+'m'+(s%60).toFixed(2)+'s';
let _lastPPos=0;
function updateHUD(dt){
  const car=carObjs[playerIdx];if(!car)return;
  const pos=getPositions(),pPos=pos.findIndex(c=>c.isPlayer)+1;
  _elPos.textContent='P'+pPos;
  _elPos.style.color=pPos===1?'#00ee66':pPos<=3?'#ff9900':pPos>=6?'#ff4444':'#ffffff';
  _elPosOf.textContent='of '+carObjs.length;
  _elLap.textContent=Math.max(1,Math.min(car.lap,TOTAL_LAPS))+' / '+TOTAL_LAPS;
  _elSpd.textContent=Math.min(380,Math.round(Math.abs(car.speed)*165)); // 165 → Ferrari≈196 km/h, F1≈223 km/h, max boost cap 380
  if(_elLapTime){
    const elapsed=_nowSec-lapStartTime;
    _elLapTime.textContent='LAP '+fmtTime(elapsed)+(bestLapTime<Infinity?' · BEST '+fmtTime(bestLapTime):'');
  }
  // Lap delta vs personal best
  if(_elLapDelta&&car._lapStart&&bestLapTime<Infinity){
    const elapsed2=_nowSec-car._lapStart;
    const delta=elapsed2-bestLapTime;
    const sign=delta>=0?'+':'';
    _elLapDelta.textContent=' '+sign+delta.toFixed(2)+'s';
    _elLapDelta.style.color=delta<0?'#00ee66':'#ff4444';
  }
  // Score display
  if(_elScore)_elScore.textContent=totalScore.toLocaleString();
  // Tire wear indicator — 4 dots, only update when value changes
  if(_elTire){
    const w=car.tireWear||0;const filled=4-Math.round(w*4);
    const hits=car.hitCount||0;
    const tireKey=(filled<<4)|Math.min(hits,7);
    if(tireKey!==_lastTireKey){
      _lastTireKey=tireKey;
      const col=w<.35?'#00ee66':w<.65?'#ffbb00':'#ff3333';
      _elTire.style.color=col;
      const dmgStr=hits>=6?' DMG!':hits>=3?' DMG':'';
      _elTire.textContent='●'.repeat(filled)+'○'.repeat(4-filled)+dmgStr;
    }
  }
  // Tire temperature display
  const tempColor=t=>{
    if(t<0.18)return'#4488ff'; // cold — blue
    if(t<0.28)return'#88aaff'; // warming — light blue
    if(t<0.55)return'#00ee66'; // optimal — green
    if(t<0.72)return'#ffdd00'; // hot — yellow
    if(t<0.85)return'#ff8800'; // very hot — orange
    return'#ff2200';            // overheated — red
  };
  if(_elTireT){
    if(_elTireT.fl)_elTireT.fl.style.background=tempColor(_tireTemp.fl);
    if(_elTireT.fr)_elTireT.fr.style.background=tempColor(_tireTemp.fr);
    if(_elTireT.rl)_elTireT.rl.style.background=tempColor(_tireTemp.rl);
    if(_elTireT.rr)_elTireT.rr.style.background=tempColor(_tireTemp.rr);
  }
  // Sector panel update
  const secColors=['#cc44ff','#00ee66','#ffbb00','#666'];// purple=best,green=pb,yellow=slow,grey=no data
  if(_elSecT){
    for(let s=0;s<3;s++){
      const el=_elSecT[s];if(!el)continue;
      const best=_sectorBests[s];
      if(best<Infinity){el.textContent=best.toFixed(2)+'s';el.style.color=secColors[2];}
      else{el.textContent='--.-';el.style.color=secColors[3];}
    }
  }
  // Pit available indicator (only show once, when car is near pit zone and hasn't pitted yet)
  if(_elPitAvail){
    if(car&&!_pitStopUsed&&!_pitStopActive&&car.lap>1){
      const pz=car.mesh.position.z,px=car.mesh.position.x;
      _elPitAvail.style.display=(pz>160&&pz<220&&px>-200&&px<190)?'block':'none';
    }else{_elPitAvail.style.display='none';}
  }
  // Speed color on speedometer
  if(_elSpd){
    const speedRatio=Math.abs(car.speed)/(car.def.topSpd*1.55);
    _elSpd.style.color=speedRatio>.85?'#ff2222':speedRatio>.6?'#ff7700':speedRatio>.35?'#ffdd00':'#ff7700';
  }
  // Position change notification — only fire after position is stable for 0.4s
  // This prevents spam when cars jostle each other closely
  if(pPos!==_posStableValue){
    _posStableValue=pPos;_posStableT=0; // new candidate position, start timer
  }else if(_lastPPos&&pPos!==_lastPPos&&dt){
    _posStableT+=dt;
    if(_posStableT>=0.4){
      // Position has been stable for 0.4s — commit it
      if(pPos<_lastPPos){
        if(pPos===1){
          showPopup('🏆 P1 — RACE LEADER!','#ffd700',2200);
          showBanner('🏆 RACE LEADER!','#ffd700',2400);
          totalScore+=150;
          beep(880,.1,.42,0,'square');beep(1320,.08,.38,.1,'square');beep(1760,.12,.32,.2,'square');
          Audio.playCrowdCheer();setTimeout(()=>Audio.playCrowdCheer(),200);setTimeout(()=>Audio.playCrowdCheer(),400);
          if(_crowdGain&&audioCtx){_crowdGain.gain.setTargetAtTime(0.09,audioCtx.currentTime,.1);setTimeout(()=>{if(_crowdGain&&audioCtx)_crowdGain.gain.setTargetAtTime(0.062,audioCtx.currentTime,1.2);},1500);}
        }else{
          showPopup('▲ P'+pPos+' OVERTAKE!','#00ff88',1400);
          triggerCombo('OVERTAKE');
          totalScore+=50;
          Audio.playCrowdCheer();
        }
        floatText('▲ P'+pPos,'#00ff88',innerWidth*.5,innerHeight*.42);
      }else{
        showPopup('▼ P'+pPos,'#ff6644',1200);
        floatText('▼ P'+pPos,'#ff6644',innerWidth*.5,innerHeight*.42);
      }
      if(_elPos){_elPos.classList.remove('posPulse');void _elPos.offsetWidth;_elPos.classList.add('posPulse');}
      _lastPPos=pPos;
    }
  }else{
    _posStableT=0; // position matches _lastPPos — reset candidate timer
  }
  if(!_lastPPos)_lastPPos=pPos; // init on first frame
  // Gear indicator
  if(_elGear)_elGear.textContent=_currentGear;
  // Live leaderboard — only rebuild HTML when order is stable for 0.5s
  // Prevents P1/P2/P3 rows from constantly jumping when cars jostle
  if(_elLeader&&dt){
    const key=pos.map(c=>c.def.id).join(',');
    if(key!==_leaderPendingKey){
      _leaderPendingKey=key;_leaderStableT=0; // new order candidate
    }else if(key!==_lastLeaderOrder){
      _leaderStableT+=dt;
      if(_leaderStableT>=0.5){
        // Order stable for 0.5s — commit to screen
        _lastLeaderOrder=key;_leaderStableT=0;
        const refTime=bestLapTime<Infinity?bestLapTime:55;
        const leader=pos[0];
        _elLeader.innerHTML=pos.map((c,i)=>{
          let gapStr='';
          if(i===0){gapStr='<span class="lGap">LEAD</span>';}
          else{
            const lapDiff=leader.lap-c.lap;
            const progGap=leader.progress-c.progress;
            if(lapDiff>=1){
              gapStr=`<span class="lGap">+${lapDiff}LAP</span>`;
            }else{
              const secGap=Math.max(0,(lapDiff+progGap)*refTime);
              // Show "BATTLE" instead of 0.0s when cars are within 0.5s of each other
              gapStr=secGap<0.5?`<span class="lGap" style="color:#ff9900">BATTLE</span>`:`<span class="lGap">+${secGap.toFixed(1)}s</span>`;
            }
          }
          return `<div class="lRow${c.isPlayer?' lMe':''}"><span class="lPos">P${i+1}</span><span class="lName">${c.def.name}</span>${gapStr}</div>`;
        }).join('');
      }
    }
  }
  _mmFrameCtr=(_mmFrameCtr||0)+1;if(_mmFrameCtr%2===0)drawMinimap(pos);
}

function drawMinimap(pos){
  const cvs=_mapCvs||document.getElementById('mapCvs'),ctx=_mapCtx||(cvs&&cvs.getContext('2d'));
  if(!cvs||!ctx)return;
  const W=cvs.width,H=cvs.height;ctx.clearRect(0,0,W,H);
  const {mnX,mxX,mnZ,mxZ}=_mmBounds||{mnX:-320,mxX:320,mnZ:-255,mxZ:195};
  const pad=14,sc=Math.min((W-pad*2)/(mxX-mnX),(H-pad*2)/(mxZ-mnZ));
  const ox=pad+(W-pad*2-(mxX-mnX)*sc)*.5-mnX*sc,oz=pad+(H-pad*2-(mxZ-mnZ)*sc)*.5-mnZ*sc;
  const mx=x=>ox+x*sc,mz=z=>oz+z*sc;
  // Track — draw with sector colors
  const N=120;
  for(let si=0;si<N;si++){
    const t0=si/N,t1=(si+1)/N;
    const p0=trackCurve.getPoint(t0),p1=trackCurve.getPoint(t1);
    const sec=t0<.333?0:t0<.667?1:2;
    const secCol=['rgba(255,90,90,.85)','rgba(80,220,90,.85)','rgba(90,140,255,.85)'][sec];
    ctx.beginPath();ctx.strokeStyle=secCol;ctx.lineWidth=5;ctx.lineCap='round';
    ctx.moveTo(mx(p0.x),mz(p0.z));ctx.lineTo(mx(p1.x),mz(p1.z));ctx.stroke();
  }
  // Track outline
  ctx.beginPath();ctx.strokeStyle='rgba(220,220,230,.75)';ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineJoin='round';
  TRACK_WP.forEach(([x,z],i)=>i===0?ctx.moveTo(mx(x),mz(z)):ctx.lineTo(mx(x),mz(z)));
  ctx.closePath();ctx.stroke();
  // Start line
  ctx.fillStyle='#fff';ctx.fillRect(mx(TRACK_WP[0][0])-5,mz(TRACK_WP[0][1])-1.5,10,3);
  // Pit zone marker
  ctx.fillStyle='rgba(0,255,100,.55)';ctx.fillRect(mx(-60)-4,mz(190)-2,8,4);
  // Special objects (small dots)
  const dot=(x,z,r,col)=>{ctx.beginPath();ctx.arc(mx(x),mz(z),r,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();};
  jumpRamps.forEach(r=>dot(r.pos.x,r.pos.z,3,'#ff6600'));
  boostPads.forEach(p=>dot(p.pos.x,p.pos.z,2.5,'#00ccff'));
  spinPads.forEach(p=>dot(p.pos.x,p.pos.z,2.5,'#aa44ff'));
  // Cars — draw in reverse order so P1 renders on top
  // Collect screen positions to detect overlaps
  // Reuse pre-allocated array for minimap car positions
  if(!drawMinimap._pts)drawMinimap._pts=new Array(16);
  const mmPts=drawMinimap._pts;
  for(let i=0;i<pos.length;i++){
    if(!mmPts[i])mmPts[i]={car:null,px:0,pz:0};
    mmPts[i].car=pos[i];mmPts[i].px=mx(pos[i].mesh.position.x);mmPts[i].pz=mz(pos[i].mesh.position.z);
  }
  const mmLen=pos.length;
  // Draw dots first (back to front)
  for(let ri=mmLen-1;ri>=0;ri--){const{car,px,pz}=mmPts[ri];
    const col='#'+car.def.color.toString(16).padStart(6,'0');
    if(car.isPlayer){
      ctx.shadowColor='#ff7700';ctx.shadowBlur=8;
      ctx.beginPath();ctx.arc(px,pz,5.5,0,Math.PI*2);ctx.fillStyle='#ff7700';ctx.fill();
      ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();
      ctx.shadowBlur=0;
    }else{
      ctx.beginPath();ctx.arc(px,pz,3.5,0,Math.PI*2);ctx.fillStyle=col;ctx.fill();
      ctx.strokeStyle='rgba(0,0,0,.5)';ctx.lineWidth=1;ctx.stroke();
    }
  }
  // Draw position labels — offset away from nearby dots to avoid overlap
  ctx.font='bold 7px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
  for(let i=0;i<mmLen;i++){const{car,px,pz}=mmPts[i];
    const label='P'+(i+1);
    let ox=0,oy=-9;
    let crowded=false;
    for(let j=0;j<mmLen;j++){if(j!==i){const dpx=px-mmPts[j].px,dpz=pz-mmPts[j].pz;if(dpx*dpx+dpz*dpz<100)crowded=true;}}
    if(crowded){
      // Use angle from minimap center to spread labels outward
      const ang=Math.atan2(pz-H/2,px-W/2);
      ox=Math.cos(ang)*11;oy=Math.sin(ang)*11;
    }
    const lx=px+ox,ly=pz+oy;
    // Shadow for readability
    ctx.fillStyle='rgba(0,0,0,0.75)';ctx.fillText(label,lx+1,ly+1);
    ctx.fillStyle=car.isPlayer?'#ff9900':'rgba(255,255,255,0.85)';
    ctx.fillText(label,lx,ly);
  }
}

// ══ COUNTDOWN / FINISH ══════════════════════
// ══ TITLE / SELECT ══════════════════════════
// ══ CAR PREVIEWS (3D render per card) ═══════
let carPreviews={};
// ── Live car preview (SELECT screen) ──────────
let _prevRen=null,_prevScene=null,_prevCam=null,_prevCarMesh=null,_prevDefId=-1;
function initCarPreview(){
  if(_prevRen&&_prevScene)return;
  var cvs=document.getElementById('carPreviewCvs');if(!cvs)return;
  if(!_prevRen){
    var opts=[{antialias:true,alpha:true},{antialias:false,alpha:true},{antialias:false,alpha:false}];
    for(var i=0;i<opts.length;i++){try{_prevRen=new THREE.WebGLRenderer({canvas:cvs,...opts[i]});break;}catch(e){_prevRen=null;}}
  }
  if(!_prevRen){
    var ctx=cvs.getContext('2d');
    if(ctx){ctx.fillStyle='#080818';ctx.fillRect(0,0,cvs.width,cvs.height);ctx.fillStyle='rgba(180,80,255,0.3)';ctx.font='bold 13px Orbitron,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('3D PREVIEW',cvs.width/2,cvs.height/2);}
    return;
  }
  _prevRen.setPixelRatio(Math.min(devicePixelRatio,2));_prevRen.setSize(400,220,false);
  _prevRen.toneMapping=THREE.ACESFilmicToneMapping;_prevRen.toneMappingExposure=1.35;
  _prevRen.outputEncoding=THREE.sRGBEncoding;_prevRen.setClearColor(0x050812,1);
  _prevScene=new THREE.Scene();
  _prevCam=new THREE.PerspectiveCamera(36,400/220,.1,100);_prevCam.position.set(4.5,2.2,5.5);_prevCam.lookAt(0,.5,0);
  var sun=new THREE.DirectionalLight(0xfff8f0,2.5);sun.position.set(4,8,5);_prevScene.add(sun);
  var fill=new THREE.DirectionalLight(0xaabbff,.8);fill.position.set(-3,2,3);_prevScene.add(fill);
  var rim=new THREE.DirectionalLight(0xcc88ff,1.2);rim.position.set(-2,3,-5);_prevScene.add(rim);
  _prevScene.add(new THREE.AmbientLight(0x334466,.8));
  _prevScene.fog=new THREE.FogExp2(0x060010,.08);
  var floor=new THREE.Mesh(new THREE.CylinderGeometry(4,4,.05,32),new THREE.MeshLambertMaterial({color:0x111122}));
  floor.position.y=-.05;_prevScene.add(floor);
}
function setPreviewCar(defId){
  if(!_prevScene||defId===_prevDefId)return;
  _prevDefId=defId;
  if(_prevCarMesh){
    _prevScene.remove(_prevCarMesh);
    _prevCarMesh.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});
    _prevCarMesh=null;
  }
  const def=CAR_DEFS.find(d=>d.id===defId);if(!def)return;
  _prevCarMesh=makeCar(def);_prevScene.add(_prevCarMesh);
}
function updateCarPreview(dt){
  if(gameState!=='SELECT')return;
  if(!_prevScene)initCarPreview();
  if(!_prevRen||!_prevScene||!_prevCam)return;
  if(_prevCarMesh)_prevCarMesh.rotation.y+=dt*0.6;
  _prevRen.render(_prevScene,_prevCam);
}
function buildCarPreviews(){
  const W=200,H=118;
  const pr=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
  pr.setSize(W,H);pr.setPixelRatio(Math.min(devicePixelRatio,2));
  pr.toneMapping=THREE.ACESFilmicToneMapping;pr.toneMappingExposure=1.3;
  pr.outputEncoding=THREE.sRGBEncoding;pr.setClearColor(0x000000,0);
  const ps=new THREE.Scene();
  const pc=new THREE.PerspectiveCamera(36,W/H,.1,100);
  pc.position.set(4.0,2.0,5.2);pc.lookAt(0,.45,0);
  const sun=new THREE.DirectionalLight(0xfff8f0,2.1);sun.position.set(4,8,5);ps.add(sun);
  const fill=new THREE.DirectionalLight(0xaabbff,.5);fill.position.set(-3,2,3);ps.add(fill);
  ps.add(new THREE.AmbientLight(0x8899cc,.65));
  ps.add(new THREE.HemisphereLight(0x9bbfdd,0x4a6a3d,.45));
  CAR_DEFS.forEach(def=>{
    const mesh=makeCar(def);
    ps.add(mesh);
    pr.render(ps,pc);
    carPreviews[def.id]=pr.domElement.toDataURL('image/png');
    ps.remove(mesh);
    mesh.traverse(o=>{
      if(o.geometry)o.geometry.dispose();
      if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}
    });
  });
  pr.dispose();
}

const _unlockHints=[
  '','','','',
  '🏆 Finish P1',       // 4 Red Bull
  '💜 Fastest Lap',    // 5 Mustang
  '🔢 5 Races',        // 6 Tesla
  '🥉 3 Podiums',      // 7 Audi
  '💰 800 coins',    // 8
  '💰 1200 coins',   // 9
  '💰 1500 coins',   // 10
  '💰 2000 coins',   // 11
];
function _updateSelectSummary(){
  const dNames=['EASY','NORMAL','HARD'];
  const mode=isDark?'DARK':'LIGHT';
  const el=document.getElementById('lapSummary');
  if(el)el.textContent=_selectedLaps+' LAP'+(+_selectedLaps>1?'S':'')+' · '+dNames[difficulty]+' · '+mode;
}
function _selectPreviewCar(defId){
  selCarId=defId;
  setPreviewCar(defId);
  const def=CAR_DEFS.find(d=>d.id===defId);if(!def)return;
  const n=document.getElementById('prevName');
  if(n){n.style.cssText+='transition:none;opacity:0;transform:translateY(8px)';setTimeout(()=>{n.textContent=def.name;n.style.cssText+='transition:all .25s ease;opacity:1;transform:translateY(0)';},80);}
  const b=document.getElementById('prevBrand');if(b)b.textContent=def.brand;
  const tp=document.getElementById('prevType');if(tp)tp.textContent=def.type.toUpperCase();
  const statsEl=document.getElementById('prevStats');
  if(statsEl){
    const spd=Math.round((def.topSpd/1.35)*100),acc=Math.round((def.accel/.025)*100),hdl=Math.round((def.hdlg/.058)*100);
    const bar=(v,col,lbl)=>`<div class="statRow"><span class="statLbl">${lbl}</span><div class="statBar"><div class="statFill" style="width:${v}%;background:${col};box-shadow:0 0 5px ${col}88"></div></div></div>`;
    statsEl.innerHTML=bar(spd,'#ff7700','SPD')+bar(acc,'#00ccff','ACC')+bar(hdl,'#88ff44','HDL');
  }
  // Color picker
  const colorEl=document.getElementById('colorRow');
  if(colorEl){
    colorEl.innerHTML='';
    const curColor=_carColorOverride[defId]||def.color;
    CAR_COLOR_PRESETS.forEach(hex=>{
      const dot=document.createElement('div');dot.className='colorDot'+(hex===curColor?' cSel':'');
      dot.style.background='#'+hex.toString(16).padStart(6,'0');
      dot.onclick=()=>{
        _carColorOverride[defId]=hex;
        // Update mesh in preview
        if(_prevCarMesh){_prevCarMesh.traverse(o=>{if(o.isMesh&&o.material&&o.material.color){const m=o.material;if(m.color.getHex()===def.color||m.color.getHex()===(_carColorOverride[defId]||def.color)){m.color.setHex(hex);}}});}
        colorEl.querySelectorAll('.colorDot').forEach(d=>d.classList.remove('cSel'));
        dot.classList.add('cSel');
      };
      colorEl.appendChild(dot);
    });
  }
}
function rebuildWorld(newWorld){
  if(newWorld===activeWorld)return;
  activeWorld=newWorld;
  localStorage.setItem('src_world',newWorld);
  const _wasDark=isDark;
  buildScene(); // resets isDark=false then calls toggleNight() → sets isDark=true
  if(!_wasDark)toggleNight(); // if was day, flip back to day
  if(_weatherMode!=='clear')setWeather(_weatherMode);
  // Snap fog color immediately
  _skyT=_skyTarget;
  if(scene.fog)scene.fog.color.lerpColors(_fogColorDay,_fogColorNight,_skyT);
  // Gantry label is now a 3D sprite rebuilt with buildGantry() inside buildScene() — no DOM update needed
  // HUD tint: cyan for space, orange for GP
  applyWorldHUDTint(newWorld);
  // Refresh car preview (force re-render)
  _prevDefId=-1;_selectPreviewCar(selCarId);
}
function applyWorldHUDTint(world){
  const isSpace=world==='space';
  const isDeepSea=world==='deepsea';
  const isNeonW=world==='neoncity';
  const nitroFill=document.getElementById('nitroFill');
  if(nitroFill)nitroFill.style.background=isSpace?'linear-gradient(180deg,#00ffee,#0088ff)':isDeepSea?'linear-gradient(180deg,#00ffcc,#0088aa)':isNeonW?'linear-gradient(180deg,#00ffee,#ff00aa)':'linear-gradient(180deg,#ffee00,#ff7700)';
  const nitroLbl=document.getElementById('nitroLbl');
  if(nitroLbl)nitroLbl.style.color=isSpace?'#00ccff':isDeepSea?'#00ddaa':isNeonW?'#00ffee':'#ff7700';
  const hdGear=document.getElementById('hdGear');
  if(hdGear)hdGear.style.color=isSpace?'#00eeff':isDeepSea?'#00ffcc':'#fff';
  const hdSpd=document.getElementById('hdSpd');
  if(hdSpd)hdSpd.style.color=isSpace?'#00eeff':isDeepSea?'#00ffcc':'#fff';
  // HUD border tint
  const hudPos=document.getElementById('hudPos');
  if(hudPos)hudPos.style.borderColor=isDeepSea?'#00ddaa':isSpace?'#00ccff':isNeonW?'#00ffee':'#ff7700';
}
function buildCarSelectUI(){
  loadPersistent();
  _prevDefId=-1;
  initCarPreview();_selectPreviewCar(selCarId);
  const grid=document.getElementById('carGrid');if(!grid)return;grid.innerHTML='';
  CAR_DEFS.forEach(def=>{
    const unlocked=_unlockedCars.has(def.id);
    const card=document.createElement('div');card.className='carCard'+(def.id===selCarId&&unlocked?' sel':'');
    const col=(_carColorOverride[def.id]||def.color).toString(16).padStart(6,'0');
    const tl=def.type==='f1'?'F1':def.type==='muscle'?'MUSCLE':def.type==='electric'?'ELECTRIC':'SUPER';
    card.innerHTML=`<div class="carSwatch" style="background:linear-gradient(135deg,#${col},#${col}44)"></div><div class="carInfo"><div class="carBrand">${def.brand}</div><div class="carName">${def.name}</div><div class="carTypeBadge">${tl}</div></div>`;
    if(!unlocked){
      const lock=document.createElement('div');lock.className='carLock';
      lock.innerHTML=`<div style="font-size:18px">🔒</div><div style="font-size:9px">${_unlockHints[def.id]||'Complete challenges'}</div>`;
      card.appendChild(lock);
      card.onclick=()=>showPopup('🔒 LOCKED — '+(_unlockHints[def.id]||'complete challenges'),'#ff6644',1800);
    }else{
      card.onclick=()=>{
        document.querySelectorAll('.carCard').forEach(el=>el.classList.remove('sel'));
        card.classList.add('sel');_selectPreviewCar(def.id);
      };
    }
    grid.appendChild(card);
  });
  // Update world indicator badge in select header
  const wInd=document.getElementById('worldIndicator');
  if(wInd){
    const wIcons={grandprix:'🏁',space:'🚀',deepsea:'🌊',candy:'🍬',neoncity:'🌃',volcano:'🌋',arctic:'🧊',themepark:'🎢'};
    const wNames2={grandprix:'GRAND PRIX',space:'COSMIC',deepsea:'DEEP SEA',candy:'CANDY',neoncity:'NEON CITY',volcano:'VOLCANO',arctic:'ARCTIC',themepark:'THRILL PARK'};
    wInd.textContent=(wIcons[activeWorld]||'🌍')+' '+(wNames2[activeWorld]||activeWorld.toUpperCase())+' ↩';
  }
  // Weather always clear (no selection UI)
  _weatherMode='clear';
  // Wire lap buttons
  [1,3,5].forEach(n=>{
    const btn=document.getElementById('lap'+n);if(!btn)return;
    btn.classList.toggle('lapSel',n===_selectedLaps);
    btn.onclick=()=>{_selectedLaps=n;TOTAL_LAPS=n;document.querySelectorAll('.lapBtn').forEach(b=>b.classList.remove('lapSel'));btn.classList.add('lapSel');_updateSelectSummary();};
  });
  // Wire night buttons
  const nOff=document.getElementById('togNightOff'),nOn=document.getElementById('togNightOn');
  if(nOff){nOff.classList.toggle('togSel',!isDark);nOff.onclick=()=>{if(isDark){initAudio();startSelectMusic();toggleNight();}nOff.classList.add('togSel');nOn.classList.remove('togSel');_updateSelectSummary();};}
  if(nOn){nOn.classList.toggle('togSel',isDark);nOn.onclick=()=>{if(!isDark){initAudio();startSelectMusic();toggleNight();}nOn.classList.add('togSel');nOff.classList.remove('togSel');_updateSelectSummary();};}
  _updateSelectSummary();
}
// Dispatcher — momenteel keert RaceMusic terug (interne per-world switch op activeWorld).
// Hier zodat toekomstige world-specifieke classes in plaats ervan kunnen komen.
function goToSelect(){
  if(gameState!=='TITLE')return;gameState='SELECT';initAudio();startSelectMusic();
  setTouchControlsVisible(false);
  document.getElementById('sTitle').classList.add('hidden');
  buildCarSelectUI();
  document.getElementById('sSelect').classList.remove('hidden');
}
function goToRace(){
  if(titleMusic){titleMusic.stop();titleMusic=null;}
document.getElementById('sSelect').classList.add('hidden');document.getElementById('hud').style.display='block';
  makeAllCars();cacheHUDRefs();applyWorldHUDTint(activeWorld);
  // Start camera directly behind car at ground level — no overhead swoop
  const p=carObjs[playerIdx];
  if(p){
    const _startFwd=new THREE.Vector3(0,0,-1).applyQuaternion(p.mesh.quaternion);
    const _startRight=new THREE.Vector3(1,0,0).applyQuaternion(p.mesh.quaternion);
    camPos.copy(p.mesh.position).addScaledVector(_startFwd,13.5);
    camPos.y=p.mesh.position.y+5.8;
    camTgt.copy(p.mesh.position).addScaledVector(_startFwd,-7).addScaledVector(_startRight,0);
    camTgt.y=p.mesh.position.y+0.8;
    camera.position.copy(camPos);camera.lookAt(camTgt);
    camera.fov=62;camera.updateProjectionMatrix();
  }
  _introPanTimer=0;
  _raceMaxSpeed=0;_raceOvertakes=0;_lastPlayerPos=9;
  _camView=0;_achieveUnlocked.clear();
  // Mid-race weather event: schedule randomly between 45-90 seconds into the race
  _weatherForecastTimer=45+Math.random()*45;_weatherForecastFired=false;
  // Reset ghost for new race but keep best lap ghost
  _ghostPos.length=0;_ghostSampleT=0;_ghostPlayT=0;
  initDriftVisuals();
  gameState='COUNTDOWN';_raceStartGrace=99;
  setTouchControlsVisible(true);
  runCountdown(()=>{
    gameState='RACE';
    _raceStartGrace=0; // GO means GO — no delay
    // Reset lap + sector timers to NOW so first lap/sector duration is correct
    lapStartTime=_nowSec;
    _sectorStart=_nowSec;_currentSector=0;
    _sectorBests[0]=_sectorBests[1]=_sectorBests[2]=Infinity;
    // Crossfade naar race-muziek: fade oude tracks uit, dan dispatcher-instantie starten
    if(titleMusic){_fadeOutMusic(titleMusic,0.4);titleMusic=null;}
    if(selectMusic){_fadeOutMusic(selectMusic,0.4);selectMusic=null;}
    if(musicSched){_fadeOutMusic(musicSched,0.3);musicSched=null;}
    // Reset dynamic state: nieuwe race = geen nitro/intensity-residu, geen duck
    _musicDuck=1.0;_applyMusicGain(0.1);
    if(audioCtx){
      setTimeout(()=>{
        if(gameState==='RACE'&&!musicSched){
          musicSched=_safeStartMusic(()=>_createRaceMusicForWorld());
          if(musicSched){
            if(musicSched.setNitro)musicSched.setNitro(false);
            if(musicSched.setIntensity)musicSched.setIntensity(0);
          }
        }
      },380);
      Audio.startWind();Audio.initCrowd();
    }
    // Show touch controls during race if on a touch device — but not if a hardware keyboard was detected
    const tc=document.getElementById('touchControls');
    if(tc&&('ontouchstart' in window||navigator.maxTouchPoints>0)&&!_hwKeyboardDetected)tc.style.display='block';
    // Control hints: show for 6s then fade out
    const ch=document.getElementById('controlHints');
    if(ch){ch.style.display='block';ch.style.opacity='1';setTimeout(()=>{ch.style.opacity='0';setTimeout(()=>{ch.style.display='none';},700);},6000);}
    // Add cam hint
    const camHint=document.getElementById('camViewHint');
    if(camHint){camHint.style.display='block';setTimeout(()=>camHint.style.display='none',5000);}
  });
}

// ══ SPEED OVERLAY ════════════════════════════
// ══ CONFETTI ═════════════════════════════════
// ══ BOOST RING ANIMATION ═════════════════════
// ══ SLIPSTREAM VISUALS ═══════════════════════
// ══ SMOOTH WEATHER TRANSITION ════════════════
// ══ SAFETY CAR ═══════════════════════════════
// ══ ACHIEVEMENTS (in-race) ═══════════════════
const _RACE_ACHIEVEMENTS={
  SPEED_DEMON: {label:'SPEED DEMON',desc:'Exceed 95% top speed',icon:'⚡'},
  DRIFT_KING:  {label:'DRIFT KING', desc:'Drift 3+ seconds',icon:'🔥'},
  CLEAN_LAP:   {label:'CLEAN LAP',  desc:'Lap without recovery',icon:'✨'},
  OVERTAKER:   {label:'OVERTAKER',  desc:'Pass 5 cars',icon:'🚀'},
  NITRO_JUNKIE:{label:'NITRO JUNKIE',desc:'Use nitro 10x',icon:'💜'},
  FLYING:      {label:'AIRBORNE',   desc:'Airborne 2+ seconds',icon:'🛸'},
  FIRST_BLOOD: {label:'FIRST BLOOD',desc:'Reach P1',icon:'🏅'},
  CHAMPION:    {label:'CHAMPION',   desc:'Finish in 1st place',icon:'🏆'},
};

let _nitroUseCount=0,_airborneAccum=0,_cleanLapFlag=true,_driftAccum=0;

// Call when nitro activates
// Call on lap complete for clean lap check
let _achieveToastEl=null;
// ══ FLOATING TEXT ════════════════════════════
// Stagger counter so simultaneous messages don't overlap
let _floatSlot=0,_floatSlotTimer=0;
// ══ SPEED LINES ════════════════════════════
let _speedLinesFadeT=0,_speedLinesRedrawT=0;
// ══ DRIFT VISUALS ════════════════════════════
// ══ NITRO VISUALS ════════════════════════════
// ══ BOOST TRAIL ══════════════════════════════
// ══ GHOST CAR ════════════════════════════════
// ══ PIT STOP ═════════════════════════════════
// ══ AI MISTAKES ══════════════════════════════
// Applied in updateAI — cars occasionally wobble on corners
// (stored per car as car._mtimer, car._mActive)

// ══ REV LIMITER ══════════════════════════════
// ══ GAP DISPLAY ══════════════════════════════
// ══ COLLISION FLASH ══════════════════════════
// ══ QUICK RESTART ════════════════════════════
// ══ WEATHER FORECAST (MID-RACE) ══════════════
// ══ REAR VIEW MIRROR ═════════════════════════
// ══ RPM BAR ════════════════════════════════
const _RPM_GRAD_REDLINE='linear-gradient(180deg,#ff0000,#ff4400)';
const _RPM_GRAD_NORMAL='linear-gradient(180deg,#00cc88,#00ff99)';
const _RPM_GEAR_RANGES=[0,.18,.36,.54,.72,.9];
let _lastRedline=null;
// ══ DAMAGE SMOKE PARTICLES ═════════════════���══
// ══ SET CAM VIEW (pause menu buttons) ════════
// ══ AMBIENT WIND SPEED ══════════════════════
// ══ MAIN LOOP ════════════════════════════════
clock=new THREE.Clock();
let _aiFrameCounter=0,_fpsShow=false,_fpsFrames=0,_fpsLast=performance.now(),_fpsVal=60;
let _perfBadFrames=0,_perfChecked=false,_lowQuality=!!window._isMobile;
// Auto-quality detection thresholds: during frames [START..END], count frames slower than BAD_MS.
// If the count exceeds BAD_THRESHOLD within that window, downgrade to low quality.
const QUALITY_CHECK_FRAME_START=30,QUALITY_CHECK_FRAME_END=180;
const QUALITY_BAD_FRAME_MS=0.032,QUALITY_BAD_FRAME_THRESHOLD=60;
function loop(){
  requestAnimationFrame(loop);
  if(_ctxLost){clock.getDelta();return;} // context lost — skip frame, consume delta
  if(gamePaused){clock.getDelta();return;} // consume delta so time doesn't jump on resume
  _nowSec=performance.now()/1000;
  // dt scaling: tablets get a 0.93× world-time multiplier so the race feels slightly calmer on iPad
  // without changing physics balance (player + AI + decor all slow down together).
  const dt=Math.min(clock.getDelta(),window._isMobile?.085:.05)*(window._isTablet?0.93:1);
  _aiFrameCounter++;
  // Animated title camera — fly along track
  if(gameState==='TITLE'&&trackCurve){
    _titleCamT+=dt*.016;
    const t=_titleCamT%1,t2=(_titleCamT+.055)%1;
    const pt=trackCurve.getPoint(t),ah=trackCurve.getPoint(t2);
    camera.position.set(pt.x,pt.y+7.5,pt.z);
    camera.lookAt(ah.x,ah.y+1.8,ah.z);
    camera.fov+=(64-camera.fov)*Math.min(1,dt*1.5);camera.updateProjectionMatrix();
  }
  if(gameState==='RACE'||gameState==='FINISH'){
    for(let i=0;i<carObjs.length;i++){
      const car=carObjs[i];
      if(i===playerIdx){if(gameState==='RACE')updatePlayer(dt);else if(gameState==='FINISH'&&Math.abs(car.speed)>.01)car.speed*=Math.pow(0.97,dt*60);}
      else{
        // Stagger AI: on mobile update each AI every 2nd frame (halves AI cost)
        if(!window._isMobile||(_aiFrameCounter+i)%2===0) updateAI(car,dt*(!window._isMobile?1:2));
      }
    }
    if(gameState==='RACE'){
      checkJumps();checkSpinPads(dt);checkBoostPads();checkCollectibles();checkCollisions(dt);checkTrackLimits(dt);checkWrongWay(dt);
      if(activeWorld==='space'){checkSpaceRailgun();checkSpaceWormhole();checkGravityZones(dt);checkOrbitingAsteroids(dt);checkWarpTunnels(dt);}
      else if(activeWorld==='deepsea'){checkCurrentStreams(dt);checkAbyssCracks(dt);checkTreasureTrail(dt);}
      else{checkWaterPuddles(dt);checkDRSZone(dt);}
      updateBoostArrows();updateSlipstreamVisuals();updateSafetyCar(dt);
    }
    sparkSystem.update(dt);exhaustSystem.update(dt);
    updateCamera(dt);updateCarLights();updateBoostGlow();updateFlags();
    updateSkidMarks();updateWeather(dt);updateSky(dt);Audio.updateThunder(dt);updateSnow(dt);updateStormFlash(dt);
    if(activeWorld==='space')updateSpaceWorld(dt);
    if(activeWorld==='deepsea')updateDeepSeaWorld(dt);
    if(activeWorld==='candy')updateCandyWorld(dt);
    if(activeWorld==='neoncity'&&typeof updateNeonCityWorld==='function')updateNeonCityWorld(dt);
    if(activeWorld==='volcano')updateVolcanoWorld(dt);
    if(activeWorld==='arctic')updateArcticWorld(dt);
    if(activeWorld==='themepark')updateThemeparkWorld(dt);
    if(gameState==='RACE'){
      updateHUD(dt);updateSpeedOverlay();
      const _pp=getPositions().findIndex(c=>c.isPlayer)+1;
      Audio.updateCrowd(_pp);
      updateAmbientWindSpeed(dt);
      updateAchievements(dt);
      updateAchievementToast(dt);
      if(_floatSlotTimer>0){_floatSlotTimer-=dt;if(_floatSlotTimer<=0)_floatSlot=0;}
      updateWeatherForecast(dt);
      updateQuickRestart(dt);
      updateDamageSmoke();
      updateRpmBar(dt);
      updateRevLimiter(dt);
      updateGapDisplay();
      updateDriftVisuals(dt);
      updateNitroVisual();
      updateBoostTrail();
      updateGhost(dt);
      updateSpeedLines();
      updatePitStop(dt);
      updateFastestLapFlash(dt);
      updateCloseBattle(dt);
    }
    updateCollisionFlash(dt);
    updateRain();
  }
  if(renderer&&scene&&camera)renderer.render(scene,camera);
  updateCarPreview(dt);
  // Mirror pass — second render with backward-facing camera (chase cam + race only, not during victory orbit or intro)
  if(gameState==='RACE'&&_mirrorEnabled&&_camView===0&&!_victoryOrbit&&_introPanTimer<=0){
    // Skip mirror on low quality to save a full render pass
    if(!_lowQuality)updateMirror();
  }
  // Auto quality detection — see QUALITY_* constants above for thresholds
  if(!_perfChecked&&gameState==='RACE'&&_aiFrameCounter>QUALITY_CHECK_FRAME_START&&_aiFrameCounter<QUALITY_CHECK_FRAME_END){
    if(dt>QUALITY_BAD_FRAME_MS)_perfBadFrames++;
    if(_aiFrameCounter===QUALITY_CHECK_FRAME_END-1){
      _perfChecked=true;
      if(_perfBadFrames>QUALITY_BAD_FRAME_THRESHOLD){
        _lowQuality=true;
        // Reduce pixel ratio for better framerate
        if(renderer)renderer.setPixelRatio(Math.min(devicePixelRatio,1));
        // Disable mirror
        const mf=document.getElementById('mirrorFrame');if(mf)mf.style.display='none';
        const ml=document.getElementById('mirrorLabel');if(ml)ml.style.display='none';
        // Hide speed lines
        const sl=document.getElementById('speedLines');if(sl)sl.style.display='none';
      }
    }
  }
}

// ══ TOUCH CONTROLS ══════════════════════════
let _touchControlsReady=false,_wakeLock=null,_hwKeyboardDetected=false;
// iPad with an external keyboard still flags as touch device. Watch for actual game-relevant
// key presses and hide the on-screen controls once real keyboard input is seen.
const _HW_KB_KEYS=new Set(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space',
  'KeyW','KeyA','KeyS','KeyD','KeyN','KeyH','KeyR','KeyP','KeyC','KeyV','KeyM','KeyI','KeyJ','KeyK','KeyL']);
window.addEventListener('keydown',e=>{
  if(_hwKeyboardDetected||!_HW_KB_KEYS.has(e.code))return;
  _hwKeyboardDetected=true;
  _touchControlsReady=false;
  const tc=document.getElementById('touchControls');if(tc)tc.style.display='none';
});
async function _acquireWakeLock(){
  try{if('wakeLock' in navigator&&!_wakeLock)_wakeLock=await navigator.wakeLock.request('screen');}catch(_){}
}
function _releaseWakeLock(){
  if(_wakeLock){try{_wakeLock.release();}catch(_){}_wakeLock=null;}
}
// Reacquire wake lock when page becomes visible again (iOS drops it on blur)
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&(gameState==='RACE'||gameState==='COUNTDOWN'))_acquireWakeLock();});
function setTouchControlsVisible(show){
  const tc=document.getElementById('touchControls');if(!tc)return;
  tc.style.display=show&&_touchControlsReady?'block':'none';
  if(show)_acquireWakeLock();else _releaseWakeLock();
}
// Haptic feedback patterns per control (ms) — short buzz for precise, slightly longer for boost/drift
const _HAPTIC_MS={ArrowLeft:8,ArrowRight:8,ArrowUp:0,ArrowDown:12,KeyN:18,Space:15};
// Buttons that should also trigger gas (ArrowUp) — makes nitro/drift usable with one hand
const _ALSO_GAS={KeyN:true,Space:true};
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

// ══ RESET / NAVIGATION ══════════════════════
function _resetRaceState(){
  if(musicSched){musicSched.stop();musicSched=null;}
  setTimeout(()=>{if(musicSched){musicSched.stop();musicSched=null;}},100);
  if(titleMusic){titleMusic.stop();titleMusic=null;}
  if(selectMusic){selectMusic.stop();selectMusic=null;}
  // Reset dynamic music state for clean slate
  _musicDuck=1.0;_applyMusicGain(0);
  Audio.stopWind();Audio.stopCrowd();
  carObjs.forEach(c=>scene.remove(c.mesh));carObjs=[];
  skidMarks.forEach(s=>{const m=s.mesh||s;if(m.geometry)m.geometry.dispose();if(m.material)m.material.dispose();scene.remove(m);});
  skidMarks.length=0;
  nitroLevel=100;nitroActive=false;driftScore=0;driftTimer=0;
  lapStartTime=0;lastLapTime=0;bestLapTime=Infinity;
  recoverActive=false;recoverTimer=0;camShake=0;slipTimer=0;_wormholeCooldown=0;
  _wrongWayTimer=0;_miniTurboReady=false;_camLateralT=0;_tireWarnCooldown=0;
  _introPanTimer=0;_camView=0;_raceMaxSpeed=0;_raceOvertakes=0;_lastPlayerPos=9;_raceStartGrace=0;
  _achieveUnlocked.clear();_achieveQueue.length=0;_achieveTimer=0;
  _nitroUseCount=0;_airborneAccum=0;_cleanLapFlag=true;_driftAccum=0;
  _bestS1=Infinity;_bestS2=Infinity;_bestS3=Infinity;_currentSector=0;_sectorStart=0;
  _comboCount=0;_comboMult=1.0;_comboTimer=0;_lastRaceCoins=0;
  _lapTimes.length=0;_weatherForecastTimer=0;_weatherForecastFired=false;
  _rstHold=0;_colFlashT=0;
  _ghostPos.length=0;_ghostBest=[];_ghostSampleT=0;_ghostPlayT=0;
  if(_ghostMesh)_ghostMesh.visible=false;
  const gl=document.getElementById('ghostLabel');if(gl)gl.style.display='none';
  if(_speedLinesCvs)_speedLinesCvs.style.opacity='0';
  _rainIntensity=_rainTarget; // snap to current rain state (no lingering transition)
  if(_elWrongWay)_elWrongWay.style.display='none';
  totalScore=0;
  if(_elScore)_elScore.textContent='0';
  if(_elLapDelta){_elLapDelta.textContent='';_elLapDelta.style.color='';}
  const _ccvs=document.getElementById('confettiCvs');if(_ccvs)_ccvs.style.display='none';
  const _sov=document.getElementById('speedOverlay');if(_sov)_sov.style.opacity='0';
  if(_boostLight)_boostLight.intensity=0;
  if(_safetyCar){scene.remove(_safetyCar.mesh);_safetyCar=null;}
  // Volcano/Arctic cleanup
  _volcanoLavaRivers.length=0;_volcanoGeisers.length=0;_volcanoEruption=null;_volcanoEruptionTimer=3;_volcanoEmbers=null;_volcanoEmberGeo=null;_volcanoGlowLight=null;
  _arcticIcePatches.length=0;_arcticAurora.length=0;_arcticBlizzardGeo=null;
  _lastGear=1;_currentGear=1;_lastPPos=0;_lastLeaderOrder='';
  _leaderPendingKey='';_leaderStableT=0;_posStableValue=0;_posStableT=0;
  gamePaused=false;
  // Make sure the HUD pause-button is back to "PAUSE" on a new race (was sticking on "PLAY"
  // if a previous race ended while paused).
  {const pb=document.getElementById('hudPauseBtn');if(pb)pb.textContent='⏸ PAUSE';}
  Object.keys(keys).forEach(k=>delete keys[k]);
  document.getElementById('pauseOverlay').style.display='none';
  document.getElementById('sFinish').classList.add('hidden');
  document.getElementById('hud').style.display='none';
  if(_elWarn)_elWarn.style.display='none';
  document.getElementById('bannerOverlay').style.display='none';
  document.getElementById('controlHints').style.display='none';
  const tc=document.getElementById('touchControls');if(tc)tc.style.display='none';
  const mf=document.getElementById('mirrorFrame'),ml=document.getElementById('mirrorLabel');
  if(mf)mf.style.display='none';if(ml)ml.style.display='none';
  const rb=document.getElementById('rstBar'),rl=document.getElementById('rstLabel');
  if(rb)rb.style.display='none';if(rl)rl.style.display='none';
  const f1=document.getElementById('f1Lights');if(f1)f1.style.display='none';
  const cf=document.getElementById('colFlash');if(cf)cf.style.opacity='0';
  const ah=document.getElementById('achieveToast');if(ah)ah.style.opacity='0';
  const gapEl=document.getElementById('hudGap');if(gapEl)gapEl.style.display='none';
  _revLimiterTimer=0;_titleCamT=0;
  const dbEl=document.getElementById('driftBar');if(dbEl)dbEl.style.display='none';
  const dlEl=document.getElementById('driftLabel');if(dlEl)dlEl.style.display='none';
  const gcEl=document.getElementById('goldCelebration');if(gcEl)gcEl.style.opacity='0';
  // Reset tire temps (cold start)
  _tireTemp={fl:.08,fr:.08,rl:.08,rr:.08};
  _wasBraking=false;_speedTrapMax=0;_speedTrapFired=false;
  ['FL','FR','RL','RR'].forEach(c=>{const el=document.getElementById('tt'+c);if(el)el.style.background='#4488ff';});
  [1,2,3].forEach(s=>{const el=document.getElementById('secT'+s);if(el){el.textContent='--.-';el.style.color='#666';}});
  // Reset new systems
  _pitStopActive=false;_pitStopTimer=0;_pitStopUsed=false;
  _fastestLapFlashT=0;_closeBattleTimer=0;_drsActive=false;
  const pitOv=document.getElementById('pitStopOverlay');if(pitOv)pitOv.style.display='none';
  const flEl=document.getElementById('fastestLapFlash');if(flEl)flEl.style.opacity='0';
  const drsE=document.getElementById('drsIndicator');if(drsE)drsE.style.display='none';
  const cbEl=document.getElementById('closeBattleEl');if(cbEl)cbEl.style.display='none';
  for(let i=0;i<_nearMissCooldown.length;i++)_nearMissCooldown[i]=0;
}
function goToTitle(){
  _resetRaceState();
  gameState='TITLE';
  setTouchControlsVisible(false);
  document.getElementById('sSelect').classList.add('hidden');
  document.getElementById('sWorld').classList.add('hidden');
  document.getElementById('sTitle').classList.remove('hidden');
  camera.position.set(0,12,330);camera.lookAt(0,0,280);
  initAudio();startTitleMusic();
  updateTitleHighScore();
}
function goToWorldSelect(){
  gameState='WORLD_SELECT';
  setTouchControlsVisible(false);
  initAudio();startSelectMusic();
  document.getElementById('sTitle').classList.add('hidden');
  document.getElementById('sSelect').classList.add('hidden');
  document.getElementById('sWorld').classList.remove('hidden');
  // Highlight currently selected world
  document.querySelectorAll('.worldBigCard').forEach(c=>{
    c.classList.toggle('wBigSel',c.dataset.world===activeWorld);
  });
}
function goToSelectAgain(){
  _resetRaceState();
  gameState='SELECT';
  setTouchControlsVisible(false);
  initAudio();startSelectMusic();
  buildCarSelectUI();
  document.getElementById('sSelect').classList.remove('hidden');
}
function togglePause(){
  if(gameState!=='RACE')return;
  gamePaused=!gamePaused;
  document.getElementById('pauseOverlay').style.display=gamePaused?'flex':'none';
  const btn=document.getElementById('hudPauseBtn');
  if(btn)btn.textContent=gamePaused?'▶ PLAY':'⏸ PAUSE';
  // Music-ducking via gain ramp in plaats van audioCtx.suspend — suspend breekt setTimeout scheduling.
  _musicMuted=gamePaused;_applyMusicGain(0.2);
}
function toggleMute(){
  audioMuted=!audioMuted;
  if(_muteGain)_muteGain.gain.value=audioMuted?0:1;
  // Ook muziek-master volgt — zo pikt ook de music-master up als iemand _muteGain bypass gebruikt
  _musicMuted=audioMuted;_applyMusicGain(0.1);
  const b=document.getElementById('hudMuteBtn');
  if(b)b.textContent=audioMuted?'🔇':'🔊';
}

// ══ BOOT ════════════════════════════════════
async function boot(){
  // SW disabled for file:// compat
  const _loadEl=document.getElementById('loadingScreen');
  // Load game data (cars/tracks/prices) before scene init
  try{await loadGameData();}catch(e){console.error('loadGameData failed:',e);if(_loadEl){_loadEl.innerHTML='<div style="padding:40px;color:#ff6600;font-family:Orbitron,sans-serif">⚠ DATA LOAD FAILED<br><span style="font-size:12px;color:#888">'+e.message+'</span></div>';}return;}
  // ── Global iOS long-press / context-menu / selection prevention ──
  // Kills the "Copy | Translate" popup that appears mid-gameplay when holding a button.
  document.addEventListener('contextmenu',e=>e.preventDefault(),{capture:true});
  document.addEventListener('selectstart',e=>e.preventDefault(),{capture:true});
  document.addEventListener('touchstart',e=>{
    const t=e.target;
    if(t&&t.closest&&t.closest('canvas, .tcBtn, [id^="hud"], [id^="tc"], #glCanvas, #nitroBar')){
      // Don't preventDefault on inputs (still want focus)
      if(t.tagName!=='INPUT'&&t.tagName!=='TEXTAREA')e.preventDefault();
    }
  },{passive:false,capture:true});
  // Block the gesture that iOS uses to open system selection menus
  document.addEventListener('gesturestart',e=>e.preventDefault(),{capture:true});
  spawnFlames();
  // Defer heavy init so the browser can paint the loading screen first
  setTimeout(()=>{
    try{initRenderer();}catch(e){
      console.error('initRenderer failed:',e);
      if(_loadEl){_loadEl.style.display='flex';_loadEl.innerHTML='<div style="text-align:center;padding:40px;font-family:Orbitron,sans-serif"><div style="font-size:24px;margin-bottom:12px">⚠</div><div style="font-size:16px;color:#ff6600;margin-bottom:10px">WebGL niet beschikbaar</div><div style="font-size:11px;color:#666;line-height:1.9;max-width:380px">Probeer:<br>1. Sluit andere browser tabs<br>2. Herlaad (F5)<br>3. Chrome → Instellingen → Systeem → Hardware acceleratie AAN</div><button onclick="location.reload()" style="margin-top:16px;background:#ff6600;color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-family:Orbitron,sans-serif;font-size:11px;letter-spacing:2px">🔄 OPNIEUW</button></div>';}
      return;
    }
    try{buildScene();}catch(e){console.error('buildScene crashed:',e);}
    // Warm-up render: force GPU shader compilation before showing title
    if(renderer&&scene&&camera){
      if(_loadEl){
        const ls=_loadEl.querySelector('#loadStep');
        if(ls)ls.textContent='COMPILING SHADERS...';
      }
      renderer.render(scene,camera);
      // Give GPU time to finish, then hide loading screen
      requestAnimationFrame(()=>{requestAnimationFrame(()=>{
        if(_loadEl)_loadEl.style.display='none';
      });});
    }else{
      if(_loadEl)_loadEl.style.display='none';
    }
    // Start title music on first interaction (any screen)
    const _startMusicOnce=()=>{
      initAudio();startTitleMusic();
    };
    const _firstGesture=()=>{
      _startMusicOnce();
      document.removeEventListener('click',_firstGesture,true);
      document.removeEventListener('pointerdown',_firstGesture,true);
      document.removeEventListener('touchstart',_firstGesture,true);
      document.removeEventListener('keydown',_firstGesture,true);
    };
    document.addEventListener('click',_firstGesture,true);
    document.addEventListener('pointerdown',_firstGesture,true);
    document.addEventListener('touchstart',_firstGesture,true);
    document.addEventListener('keydown',_firstGesture,true);
    // Also retry on every click later — keeps context alive across suspends
    document.addEventListener('click',()=>{if(audioCtx)_ensureAudio();},true);
    document.getElementById('btnStart').addEventListener('click',()=>{initAudio();startTitleMusic();goToWorldSelect();});
    document.getElementById('btnRace').addEventListener('click',goToRace);
    document.getElementById('btnBackTitle').addEventListener('click',()=>goToWorldSelect());
    // Wire world big cards on world select screen
    document.querySelectorAll('.worldBigCard').forEach(card=>{
      card.addEventListener('click',()=>{
        const newWorld=card.dataset.world;
        document.querySelectorAll('.worldBigCard').forEach(c=>c.classList.remove('wBigSel'));
        card.classList.add('wBigSel');
        // Rebuild world if changed
        if(newWorld!==activeWorld){rebuildWorld(newWorld);}
        // Brief selection animation then proceed to car select
        setTimeout(()=>{
          document.getElementById('sWorld').classList.add('hidden');
          gameState='SELECT';
          buildCarSelectUI();
          document.getElementById('sSelect').classList.remove('hidden');
        },220);
      });
    });
    // Difficulty buttons wired via buildCarSelectUI now
    ['dEasy','dNorm','dHard'].forEach((id,i)=>{
      const el=document.getElementById(id);if(!el)return;
      el.addEventListener('click',()=>{
        difficulty=i;
        document.querySelectorAll('.diffBtn').forEach((b,j)=>b.classList.toggle('diffSel',j===i));
        _updateSelectSummary();
      });
    });
    document.addEventListener('keydown',e=>{if(e.code==='Enter'&&gameState==='TITLE')goToSelect();});
    initTouchControls();
    loadPersistent();updateTitleHighScore();
    initDailyChallenge();
    // Restore world preference
    const _savedWorld=localStorage.getItem('src_world');
    if(_savedWorld==='space'){
      activeWorld='space';
      buildScene(); // rebuild for space world
    }
    // Restore night preference — default to ON ('1') if never set
    const _savedNight=localStorage.getItem('src_night');
    if(_savedNight==='0'){if(isDark)toggleNight();}else{if(!isDark)toggleNight();}
    const _savedW=localStorage.getItem('src_weather');
    if(_savedW&&_savedW!=='clear'){
      setTimeout(()=>{
        setWeather(_savedW);
        // Re-apply night lighting if isDark (setWeather overwrites light intensities)
        if(isDark){sunLight.intensity=.04;ambientLight.intensity=.10;hemiLight.intensity=.07;trackLightList.forEach(l=>l.intensity=2.8);}
      },100);
    }
    loop();
  },50);
}
boot();
