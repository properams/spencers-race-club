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
function playWorldEvent(type){
  if(!audioCtx)return;
  var t=audioCtx.currentTime;
  if(type==='geiser'){
    var o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type='sawtooth';o.frequency.setValueAtTime(55,t);o.frequency.exponentialRampToValueAtTime(180,t+0.4);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.35,t+0.1);g.gain.exponentialRampToValueAtTime(0.01,t+1.2);
    o.connect(g);g.connect(_dst());o.start(t);o.stop(t+1.3);
  }
  if(type==='emp'){
    var o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type='square';o.frequency.setValueAtTime(80,t);o.frequency.setValueAtTime(160,t+0.1);o.frequency.setValueAtTime(40,t+0.2);
    g.gain.setValueAtTime(0.25,t);g.gain.exponentialRampToValueAtTime(0.01,t+0.5);
    o.connect(g);g.connect(_dst());o.start(t);o.stop(t+0.5);
  }
  if(type==='ice'){
    var o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type='sine';o.frequency.setValueAtTime(800,t);o.frequency.linearRampToValueAtTime(400,t+0.3);
    g.gain.setValueAtTime(0.12,t);g.gain.exponentialRampToValueAtTime(0.01,t+0.4);
    o.connect(g);g.connect(_dst());o.start(t);o.stop(t+0.4);
  }
  if(type==='lava'){
    _noise(.3,180,1.5,.3);
  }
}
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
function updateBoostGlow(){
  if(!_boostLight){_boostLight=new THREE.PointLight(0x00ccff,0,28);scene.add(_boostLight);}
  const car=carObjs[playerIdx];
  if(!car){_boostLight.intensity=0;return;}
  _boostLight.position.copy(car.mesh.position);_boostLight.position.y+=1.2;
  const tgt=nitroActive?3.8:(car.boostTimer>0?2.4:0);
  _boostLight.intensity+=((tgt-_boostLight.intensity))*.18;
  _boostLight.color.setHex(nitroActive?0xff8800:0x00ccff);
  _boostLight.distance=nitroActive?32:22;
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
function initDailyChallenge(){
  var di=new Date().getDate()%DAILY_CHALLENGES.length;
  _todayChallenge=DAILY_CHALLENGES[di];
  var ce=document.getElementById('dailyChallengeEl');
  if(ce&&_todayChallenge){
    ce.innerHTML='<div style="font-size:9px;color:#884499;letter-spacing:2px">DAGELIJKSE UITDAGING</div><div style="font-size:11px;color:#cc88ff;margin-top:3px">'+_todayChallenge.text+'</div><div style="font-size:10px;color:#ffd700;margin-top:2px">+'+_todayChallenge.reward+' \u{1F4B0}</div>';
  }
}
function showAchievementToast(ach){
  const t=document.createElement('div');
  t.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(20px);background:linear-gradient(135deg,#1a0035,#2d0050);border:1px solid rgba(180,80,255,.5);border-radius:14px;padding:14px 24px;display:flex;align-items:center;gap:14px;font-family:Orbitron,sans-serif;z-index:var(--z-toast);box-shadow:0 0 30px rgba(180,80,255,.4);opacity:0;transition:all .4s cubic-bezier(.34,1.3,.64,1)';
  t.innerHTML='<span style="font-size:28px">'+ach.icon+'</span><div><div style="font-size:8px;color:#cc88ff;letter-spacing:3px">ACHIEVEMENT</div><div style="font-size:13px;color:#fff;letter-spacing:2px">'+ach.title+'</div><div style="font-size:9px;color:#886699;margin-top:2px">'+ach.desc+'</div></div>';
  document.body.appendChild(t);
  requestAnimationFrame(()=>{t.style.opacity='1';t.style.transform='translateX(-50%) translateY(0)';});
  setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),400);},3500);
}
let _worldsUnlocked=new Set(['grandprix']);
let _trackRecords={};

// ── PERSISTENCE FUNCTIONS — verplaatst naar js/persistence/save.js + progression.js ──
// loadPersistent, savePersistent, awardCoins, buyCar, buyWorld,
// checkUnlocks, showUnlockToast, showUnlocks, updateTitleHighScore
// zijn beschikbaar via window.xxx (module laadt deze op DOMContentLoaded).

let CAR_PRICES={};      // gevuld door loadGameData
let WORLD_PRICES={};    // gevuld door loadGameData
function getSector(progress){if(progress<0.33)return 0;if(progress<0.67)return 1;return 2;}
function showSectorFlash(label,time,delta,color){
  var el=document.getElementById('sectorPanel');if(!el)return;
  el.innerHTML='<span style="color:#aaa">'+label+'</span><span style="color:'+color+';font-size:16px;margin:0 6px">'+fmtTime(time)+'</span><span style="color:'+color+';font-size:11px">'+delta+'</span>';
  el.style.opacity='1';
  clearTimeout(el._ht);
  el._ht=setTimeout(function(){el.style.opacity='0';},2800);
}
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

function buildGround(){
  const isSpace=activeWorld==='space',isDS=activeWorld==='deepsea';
  const groundCol=isSpace?0x070710:isDS?0x081820:0x3c7040;
  const infieldCol=isSpace?0x0a0a18:isDS?0x0b2030:0x4a8848;
  const g=new THREE.Mesh(new THREE.PlaneGeometry(2200,2200,1,1),
    new THREE.MeshLambertMaterial({color:groundCol}));
  g.rotation.x=-Math.PI/2;g.position.y=-.12;g.receiveShadow=true;scene.add(g);
  if(!isDS){ // Deep sea has its own seafloor built by buildDeepSeaEnvironment
    const inf=new THREE.Mesh(new THREE.PlaneGeometry(440,350,1,1),
      new THREE.MeshLambertMaterial({color:infieldCol}));
    inf.rotation.x=-Math.PI/2;inf.position.set(-10,-.11,-40);scene.add(inf);
  }
}
function buildClouds(){
  const m=new THREE.MeshBasicMaterial({color:0xf8fbff,transparent:true,opacity:.88});
  for(let i=0;i<12;i++){
    const geo=new THREE.SphereGeometry(18+Math.random()*22,7,5);
    geo.scale(1,.25+Math.random()*.14,.65+Math.random()*.35);
    const c=new THREE.Mesh(geo,m);
    c.position.set((Math.random()-.5)*900,85+Math.random()*55,(Math.random()-.5)*900+220);
    scene.add(c);
  }
}

// ══ TRACK ════════════════════════════════════
function buildTrack(){
  const pts3=TRACK_WP.map(([x,z])=>new THREE.Vector3(x,0,z));
  trackCurve=new THREE.CatmullRomCurve3(pts3,true,'catmullrom',.5);
  curvePts=trackCurve.getPoints(600);
  const N=400;
  // Main track mat: polygonOffset pushes asphalt *away* from camera in depth so curbs,
  // edge lines and startline overlays win the depth test on low-precision depth buffers (iPad).
  const _baseTrackColor=activeWorld==='space'?0x141420:activeWorld==='deepsea'?0x1a2830:activeWorld==='candy'?0xee3388:activeWorld==='neoncity'?0x0a0a14:activeWorld==='volcano'?0x2a0808:activeWorld==='arctic'?0x667788:activeWorld==='themepark'?0x221030:0x262626;
  const _trackMat=new THREE.MeshLambertMaterial({color:_baseTrackColor});
  _trackMat.polygonOffset=true;_trackMat.polygonOffsetFactor=1;_trackMat.polygonOffsetUnits=1;
  _trackMat.userData.baseColor=_baseTrackColor; // stashed for rain/day-night tinting
  const rm=ribbon(N,t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    return{L:p.clone().addScaledVector(nr,-TW).setY(.005),R:p.clone().addScaledVector(nr,TW).setY(.005)};
  },_trackMat);
  _trackMesh=rm;
  rm.receiveShadow=true;
  eline(N,-TW+.55,.008,.38);eline(N,TW-.55,.008,.38);
  buildCurbs(N);buildStartLine();
}
function eline(N,off,y,hw){
  const mat=new THREE.MeshBasicMaterial({color:0xffffff});
  // Stronger offset than curbs (-1) so edge lines never z-fight against curb stripes
  mat.polygonOffset=true;mat.polygonOffsetFactor=-2;mat.polygonOffsetUnits=-2;
  ribbon(N,t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    return{L:p.clone().addScaledVector(nr,off-hw).setY(y),R:p.clone().addScaledVector(nr,off+hw).setY(y)};
  },mat);
}
function buildCurbs(N){
  const CW=2.1;
  [-1,1].forEach(side=>{
    const eo=side*(TW+CW*.5),pos=[],col=[],idx=[];
    for(let i=0;i<=N;i++){
      const t=i/N,p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      const L=p.clone().addScaledVector(nr,eo-CW*.5);L.y=.045;
      const R=p.clone().addScaledVector(nr,eo+CW*.5);R.y=.045;
      pos.push(L.x,L.y,L.z,R.x,R.y,R.z);
      const s=Math.floor(t*72)%2;
      const [r,g,b]=activeWorld==='space'?(s===0?[0,.9,.9]:[.7,0,.9]):activeWorld==='deepsea'?(s===0?[0,.9,.7]:[0,.5,1]):activeWorld==='candy'?(s===0?[1,.2,.6]:[1,.95,.1]):activeWorld==='themepark'?(s===0?[1,.3,.8]:[1,.9,.2]):(s===0?[.82,.07,.03]:[1,1,1]);
      col.push(r,g,b,r,g,b);
      if(i<N){const a=i*2,b2=a+1,c=a+2,d=a+3;idx.push(a,b2,c,b2,d,c);}
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    geo.setIndex(idx);
    const cMat=new THREE.MeshLambertMaterial({vertexColors:true});
    cMat.polygonOffset=true;cMat.polygonOffsetFactor=-1;cMat.polygonOffsetUnits=-1;
    if(activeWorld==='space')cMat.emissive=new THREE.Color(0x220055);
    else if(activeWorld==='deepsea')cMat.emissive=new THREE.Color(0x003333);
    else if(activeWorld==='candy'){cMat.emissive=new THREE.Color(0x441122);cMat.emissiveIntensity=.35;}
    scene.add(new THREE.Mesh(geo,cMat));
  });
}
function buildStartLine(){
  const p=trackCurve.getPoint(0),tg=trackCurve.getTangent(0).normalize();
  const nr=new THREE.Vector3(-tg.z,0,tg.x),sq=8,sqW=TW*2/sq,sqD=1.2;
  // Clean 8×2 checkerboard — crisp, minimal
  for(let i=0;i<sq;i++)for(let j=0;j<2;j++){
    const slMat=new THREE.MeshLambertMaterial({color:(i+j)%2===0?0xffffff:0x111111});
    slMat.polygonOffset=true;slMat.polygonOffsetFactor=-1;slMat.polygonOffsetUnits=-1;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(sqW,sqD),slMat);
    m.rotation.x=-Math.PI/2;
    m.position.copy(p).addScaledVector(nr,(i-sq/2+.5)*sqW).addScaledVector(tg,(j-.5)*sqD);
    m.position.y=.011;scene.add(m);
  }
}
function buildBarriers(){
  const isSpace=activeWorld==='space',isDS=activeWorld==='deepsea';
  [-1,1].forEach(side=>{
    const N=200,pos=[],nrm=[],idx=[];
    for(let i=0;i<=N;i++){
      const t=i/N,p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      const b=p.clone().addScaledVector(nr,side*BARRIER_OFF);
      // Deep sea: organic coral wall with irregular height
      const h=isDS?(0.9+Math.sin(i*.47+side*1.3)*0.45+Math.sin(i*.21)*0.22):1.05;
      pos.push(b.x,0,b.z,b.x,h,b.z);
      nrm.push(-side*nr.x,0,-side*nr.z,-side*nr.x,0,-side*nr.z);
      if(i<N){const a=i*2,b2=a+1,c=a+2,d=a+3;idx.push(a,b2,c,b2,d,c);}
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3));
    geo.setIndex(idx);
    let mat;
    if(isSpace){
      // Energy shield: translucent electric-blue glow
      mat=new THREE.MeshLambertMaterial({color:0x2255dd,emissive:0x0a1a88,transparent:true,opacity:.38,side:THREE.DoubleSide});
    } else if(isDS){
      // Coral wall: warm teal-green with soft bio-glow
      mat=new THREE.MeshLambertMaterial({color:0x1e7766,emissive:0x083322,side:THREE.DoubleSide});
    } else {
      mat=new THREE.MeshLambertMaterial({color:0xbbbbbb,side:THREE.DoubleSide});
    }
    scene.add(new THREE.Mesh(geo,mat));
  });
  // Space: add a second inner strip of emissive "energy beams" at cap height
  if(isSpace){
    [-1,1].forEach(side=>{
      const N=200,pos=[],idx=[];
      for(let i=0;i<=N;i++){
        const t=i/N,p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
        const nr=new THREE.Vector3(-tg.z,0,tg.x);
        const b=p.clone().addScaledVector(nr,side*BARRIER_OFF);
        pos.push(b.x,1.05,b.z,b.x,1.18,b.z);
        if(i<N){const a=i*2,b2=a+1,c=a+2,d=a+3;idx.push(a,b2,c,b2,d,c);}
      }
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
      geo.setIndex(idx);
      scene.add(new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color:0x66aaff,emissive:0x4488ee,side:THREE.DoubleSide})));
    });
  }
}
function buildGantry(){
  const p=trackCurve.getPoint(0),tg=trackCurve.getTangent(0).normalize();
  const nr=new THREE.Vector3(-tg.z,0,tg.x),hw=TW+3;
  const pm=new THREE.MeshLambertMaterial({color:0x222233});
  // Two clean pillars — no truss clutter
  [-1,1].forEach(s=>{
    const pp=p.clone().addScaledVector(nr,s*hw);
    const post=new THREE.Mesh(new THREE.BoxGeometry(.6,10,.6),pm);
    post.position.copy(pp);post.position.y=5;scene.add(post);
  });
  // Clean horizontal bar
  const bar=new THREE.Mesh(new THREE.BoxGeometry(hw*2,.7,.7),new THREE.MeshLambertMaterial({color:0x111122}));
  bar.position.copy(p);bar.position.y=10;scene.add(bar);
  // Thin neon accent strip — colour matches active world
  const accentCol=activeWorld==='space'?0x4422aa:activeWorld==='deepsea'?0x006688:0x441166;
  const accentEmit=activeWorld==='space'?0x3311cc:activeWorld==='deepsea'?0x00aacc:0x6622cc;
  const accent=new THREE.Mesh(new THREE.BoxGeometry(hw*2-.6,.07,.16),
    new THREE.MeshLambertMaterial({color:accentCol,emissive:accentEmit,emissiveIntensity:1.4}));
  accent.position.copy(p);accent.position.y=9.68;scene.add(accent);
  // Gantry label — world-specific, subtle sprite
  const glCvs=document.createElement('canvas');glCvs.width=512;glCvs.height=56;
  const glCtx=glCvs.getContext('2d');glCtx.clearRect(0,0,512,56);
  glCtx.font='bold 28px Orbitron,Arial';glCtx.textAlign='center';
  glCtx.fillStyle=activeWorld==='space'?'#8866ff':activeWorld==='deepsea'?'#00ddcc':'#cc66ff';
  const gLabel=activeWorld==='space'?'COSMIC CIRCUIT':activeWorld==='deepsea'?'DEEP SEA CIRCUIT':activeWorld==='neoncity'?'NEON CITY GP':"SPENCER'S RACE CLUB";
  glCtx.fillText(gLabel,256,38);
  const glTex=new THREE.CanvasTexture(glCvs);
  const glLbl=new THREE.Sprite(new THREE.SpriteMaterial({map:glTex,transparent:true,opacity:.75}));
  glLbl.position.copy(p);glLbl.position.y=11.8;glLbl.scale.set(24,2.8,1);
  glLbl.name='f1-gantry-label-sprite';scene.add(glLbl);
  // Also keep hidden .f1-gantry-label for rebuildWorld text update (look it up by name on rebuild)
  glLbl.userData.isGantryLabel=true;
}
function ribbon(N,segFn,mat){
  const pos=[],nrm=[],uv=[],idx=[];
  for(let i=0;i<=N;i++){
    const t=i/N,{L,R}=segFn(t);
    pos.push(L.x,L.y,L.z,R.x,R.y,R.z);nrm.push(0,1,0,0,1,0);uv.push(0,t*12,1,t*12);
    if(i<N){const a=i*2,b=a+1,c=a+2,d=a+3;idx.push(a,b,c,b,d,c);}
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(idx);
  const m=new THREE.Mesh(geo,mat);scene.add(m);return m;
}

// ══ JUMP PADS (flat launchpads — no physical ramp surface, just a trigger zone) ══
function buildJumpRamps(){
  const rampDefs=[
    {t:.12, h:2.8, label:'JUMP!'},
    {t:.35, h:3.2, label:'BIG AIR!'},
    {t:.75, h:2.4, label:'JUMP!'},
  ];
  rampDefs.forEach(def=>{
    const p=trackCurve.getPoint(def.t);
    const tg=trackCurve.getTangent(def.t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const angle=Math.atan2(tg.x,tg.z);
    const padLen=9,padW=TW*1.5;
    const h=def.h;

    // Per-world colours
    const isSpR=activeWorld==='space',isDsR=activeWorld==='deepsea';
    const padCol=isSpR?0x6600cc:isDsR?0x006644:0xff4400;
    const padEmit=isSpR?0x8833ff:isDsR?0x00aacc:0xff7722;
    const stripeColR=isSpR?0x00ccff:isDsR?0x00ffaa:0xffdd00;

    // Flat glowing launchpad on the track — no obstacle
    const padMat=new THREE.MeshLambertMaterial({color:padCol,emissive:padEmit,emissiveIntensity:1.2,transparent:true,opacity:.88});
    padMat.polygonOffset=true;padMat.polygonOffsetFactor=-3;padMat.polygonOffsetUnits=-3;
    const pad=new THREE.Mesh(new THREE.PlaneGeometry(padW,padLen),padMat);
    pad.rotation.x=-Math.PI/2;pad.rotation.z=angle;
    pad.position.copy(p);pad.position.y=.06;
    scene.add(pad);

    // Chevron arrows painted on pad pointing forward (3 bright chevrons)
    const stripeMat=new THREE.MeshBasicMaterial({color:stripeColR});
    [-1,0,1].forEach(i=>{
      const a1=new THREE.Mesh(new THREE.PlaneGeometry(padW*.7,.35),stripeMat);
      a1.rotation.x=-Math.PI/2;a1.rotation.z=angle;
      a1.position.copy(p);a1.position.y=.08;
      a1.position.addScaledVector(tg,i*padLen*.25);
      scene.add(a1);
    });

    // Floating JUMP! sign above pad
    const glowPole=new THREE.Mesh(new THREE.CylinderGeometry(.2,.25,h+3.5,6),
      new THREE.MeshLambertMaterial({color:padCol,emissive:padEmit,emissiveIntensity:.6}));
    glowPole.position.copy(p);glowPole.position.y=(h+3.5)*.5;
    glowPole.position.addScaledVector(nr,padW*.52);
    scene.add(glowPole);
    const sign=new THREE.Mesh(new THREE.BoxGeometry(padW*.6,1.2,.15),
      new THREE.MeshBasicMaterial({color:0xffffff}));
    sign.position.copy(p);sign.position.y=h+3.2;sign.rotation.y=angle;
    scene.add(sign);
    const signAccent=new THREE.Mesh(new THREE.BoxGeometry(padW*.6,.18,.16),
      new THREE.MeshBasicMaterial({color:padEmit}));
    signAccent.position.copy(p);signAccent.position.y=h+4;signAccent.rotation.y=angle;
    scene.add(signAccent);
    // Point light for dramatic glow
    const pl=new THREE.PointLight(padEmit,1.5,28);
    pl.position.copy(p);pl.position.y=h+3.2;scene.add(pl);

    jumpRamps.push({
      pos:p.clone(),tg:tg.clone(),
      width:padW,len:padLen,h,
      launchV:h*.3,label:def.label,
    });
  });
}

// ══ SPIN PADS ════════════════════════════════
function buildSpinPads(){
  const spinDefs=[{t:.18},{t:.50},{t:.84}];
  // Per-world palette — hazard theme
  const SP={
    grandprix:{disc:0x8800ff,emit:0x5500cc,ring:0xdd44ff,cone:0xffdd00,marker:0xcc9900},
    space:    {disc:0x0033cc,emit:0x001188,ring:0x00aaff,cone:0x8866ff,marker:0x4422cc},
    deepsea:  {disc:0x005566,emit:0x003344,ring:0x00ddcc,cone:0x44ffcc,marker:0x00aa88},
    candy:    {disc:0xff3388,emit:0xcc0066,ring:0xff66bb,cone:0xffdd44,marker:0xffaa00},
    neoncity: {disc:0x4400aa,emit:0x220066,ring:0xff00ff,cone:0x00ffff,marker:0xaa00aa},
    volcano:  {disc:0xaa3300,emit:0x661100,ring:0xff6622,cone:0xff9922,marker:0xcc2200},
    arctic:   {disc:0x336699,emit:0x113366,ring:0x66ccff,cone:0xbbeeff,marker:0x4488cc},
    themepark:{disc:0xcc2266,emit:0x991144,ring:0xff88bb,cone:0xffdd33,marker:0xff5599},
  };
  const pal=SP[activeWorld]||SP.grandprix;

  spinDefs.forEach(def=>{
    const p=trackCurve.getPoint(def.t).clone();p.y=.015;

    // Flat hazard disc — clean circle
    const discMat=new THREE.MeshLambertMaterial({color:pal.disc,emissive:pal.emit,emissiveIntensity:.9,transparent:true,opacity:.9});
    discMat.polygonOffset=true;discMat.polygonOffsetFactor=-3;discMat.polygonOffsetUnits=-3;
    const disc=new THREE.Mesh(new THREE.CylinderGeometry(4.2,4.2,.1,40),discMat);
    disc.position.copy(p);disc.position.y=.05;
    scene.add(disc);

    // Bold hazard X-pattern in center (2 bars crossed)
    const xMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.85});
    [-1,1].forEach(s=>{
      const bar=new THREE.Mesh(new THREE.PlaneGeometry(5.2,.45),xMat);
      bar.rotation.x=-Math.PI/2;bar.rotation.z=s*Math.PI*.25;
      bar.position.copy(p);bar.position.y=.11;
      scene.add(bar);
    });

    // Inner ring pattern (smaller)
    const innerRing=new THREE.Mesh(new THREE.TorusGeometry(2.8,.08,6,36),
      new THREE.MeshLambertMaterial({color:pal.ring,emissive:pal.ring,emissiveIntensity:1.2,transparent:true,opacity:.7}));
    innerRing.rotation.x=Math.PI/2;innerRing.position.copy(p);innerRing.position.y=.12;
    scene.add(innerRing);

    // Pulsing outer ring — main hazard indicator
    const ring=new THREE.Mesh(new THREE.TorusGeometry(4.6,.14,8,48),
      new THREE.MeshLambertMaterial({color:pal.ring,emissive:pal.ring,emissiveIntensity:1.3}));
    ring.rotation.x=Math.PI/2;ring.position.copy(p);ring.position.y=.12;
    scene.add(ring);

    // 4 corner warning pillars (subtle)
    for(let i=0;i<4;i++){
      const ang=(i/4)*Math.PI*2+Math.PI/4;
      const pillar=new THREE.Mesh(new THREE.ConeGeometry(.32,1.4,6),
        new THREE.MeshLambertMaterial({color:pal.cone,emissive:pal.marker,emissiveIntensity:1.0}));
      pillar.position.set(p.x+Math.cos(ang)*5.6,p.y+.7,p.z+Math.sin(ang)*5.6);
      scene.add(pillar);
    }

    // Point light for glow
    const pl=new THREE.PointLight(pal.ring,1.4,22);
    pl.position.copy(p);pl.position.y=1.2;scene.add(pl);

    spinPads.push({pos:p.clone(),disc,ring,radius:4.5});
  });
}

// ══ BOOST PADS (modern clean design) ═════════
function buildBoostPads(){
  // Per-world palette
  const BP={
    grandprix:{pad:0x00aaff,emit:0x0077cc,chev:0xffffff,glow:0x88ddff,light:0x00ccff},
    space:    {pad:0xcc00ff,emit:0x8800cc,chev:0xffccff,glow:0xff88ff,light:0xff44ff},
    deepsea:  {pad:0x00cc88,emit:0x007744,chev:0xaaffdd,glow:0x00ffaa,light:0x00ffaa},
    candy:    {pad:0xff55aa,emit:0xcc2277,chev:0xffddee,glow:0xff88cc,light:0xff66bb},
    neoncity: {pad:0xff00ee,emit:0xaa00aa,chev:0xffccff,glow:0xff66ff,light:0xff00dd},
    volcano:  {pad:0xff5522,emit:0xdd2200,chev:0xffdd99,glow:0xff8844,light:0xff4422},
    arctic:   {pad:0x66ddff,emit:0x2288cc,chev:0xe8f5ff,glow:0x99ddff,light:0x88ccff},
    themepark:{pad:0xffcc22,emit:0xff6600,chev:0xffeecc,glow:0xff9933,light:0xffaa00},
  };
  const pal=BP[activeWorld]||BP.grandprix;

  const boostDefs=[
    {t:.04},{t:.22},{t:.43},{t:.48},{t:.53},{t:.71},{t:.80},{t:.93},
  ];
  boostDefs.forEach(def=>{
    const p=trackCurve.getPoint(def.t);
    const tg=trackCurve.getTangent(def.t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const angle=Math.atan2(tg.x,tg.z);

    // Single clean flat pad
    const boostStripMat=new THREE.MeshLambertMaterial({color:pal.pad,emissive:pal.emit,emissiveIntensity:1.4,transparent:true,opacity:.92});
    boostStripMat.polygonOffset=true;boostStripMat.polygonOffsetFactor=-3;boostStripMat.polygonOffsetUnits=-3;
    const strip=new THREE.Mesh(new THREE.PlaneGeometry(TW*1.5,4.6),boostStripMat);
    strip.rotation.x=-Math.PI/2;strip.rotation.z=angle;
    strip.position.copy(p);strip.position.y=.04;
    scene.add(strip);

    // Subtle bright center line
    const centre=new THREE.Mesh(new THREE.PlaneGeometry(TW*.25,4.8),
      new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.55}));
    centre.rotation.x=-Math.PI/2;centre.rotation.z=angle;
    centre.position.copy(p);centre.position.y=.06;
    scene.add(centre);

    // 3 bright forward chevrons (V-shape from 2 rotated bars each)
    const chevMat=new THREE.MeshBasicMaterial({color:pal.chev,transparent:true,opacity:.95});
    for(let i=0;i<3;i++){
      [-1,1].forEach(s=>{
        const bar=new THREE.Mesh(new THREE.PlaneGeometry(1.55,.22),chevMat);
        bar.rotation.x=-Math.PI/2;bar.rotation.z=angle+s*.52;
        bar.position.copy(p);bar.position.y=.065;
        bar.position.addScaledVector(tg,-1.5+i*1.3);
        scene.add(bar);
      });
    }

    // Side neon light strips (very thin, running along pad)
    const stripMat=new THREE.MeshBasicMaterial({color:pal.glow,transparent:true,opacity:.9});
    [-1,1].forEach(s=>{
      const sl=new THREE.Mesh(new THREE.PlaneGeometry(.18,4.6),stripMat);
      sl.rotation.x=-Math.PI/2;sl.rotation.z=angle;
      sl.position.copy(p);sl.position.y=.07;
      sl.position.addScaledVector(nr,s*TW*.78);
      scene.add(sl);
    });

    // ONE rising energy ring (cleaner than 3) — floats up + fades in a loop
    const ring=new THREE.Mesh(new THREE.TorusGeometry(TW*.45,.10,6,24),
      new THREE.MeshLambertMaterial({color:pal.glow,emissive:pal.glow,emissiveIntensity:1.5,transparent:true,opacity:.8}));
    ring.position.copy(p);ring.position.y=.6;
    ring.rotation.x=Math.PI/2;ring.rotation.y=angle;
    scene.add(ring);ring._baseY=.6;ring._phase=Math.random();
    const padArrows=[ring];

    // Point light
    const pl=new THREE.PointLight(pal.light,2.0,26);
    pl.position.copy(p);pl.position.y=2.2;scene.add(pl);

    boostPads.push({pos:p.clone(),tg:tg.clone(),strip,arrows:padArrows,radius:TW,len:4.6,active:true,light:pl});
  });
}

// ══ COLLECTIBLES (modern holographic tokens) ═════════════════════
function buildCollectibles(){
  // Per-world palette — coin, emissive, rim highlight, halo glow, light colour
  const PAL={
    grandprix:{coin:0xffdd00,emit:0xff9900,rim:0xfff5a8,halo:0xffcc33,light:0xffcc00},
    space:    {coin:0x66ccff,emit:0x2288ff,rim:0xcce8ff,halo:0x66aaff,light:0x88bbff},
    deepsea:  {coin:0xffaa33,emit:0xcc7700,rim:0xffd999,halo:0xffaa00,light:0xffaa44},
    candy:    {coin:0xff77cc,emit:0xdd2288,rim:0xffddf0,halo:0xff55aa,light:0xff66cc},
    neoncity: {coin:0x00ffee,emit:0x00aaaa,rim:0xbbffff,halo:0x00ddee,light:0x00ffdd},
    volcano:  {coin:0xff7722,emit:0xff2200,rim:0xffcc88,halo:0xff4411,light:0xff4422},
    arctic:   {coin:0xaadfff,emit:0x4488dd,rim:0xe8f5ff,halo:0x88bbee,light:0xaaddff},
    themepark:{coin:0xffcc22,emit:0xff6600,rim:0xffe999,halo:0xff9933,light:0xffbb00},
  };
  const pal=PAL[activeWorld]||PAL.grandprix;

  const positions=[.07,.18,.30,.42,.55,.67,.78,.90];
  positions.forEach(t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const offset=(Math.random()-.5)*7;
    const pos=p.clone().addScaledVector(nr,offset);pos.y=2.3;

    const g=new THREE.Group();g.position.copy(pos);

    // [0] Core — tiny bright white nucleus (visible through disc)
    const core=new THREE.Mesh(new THREE.SphereGeometry(.2,8,8),
      new THREE.MeshBasicMaterial({color:0xffffff}));
    g.add(core);

    // [1] Main coin disc — thin cylinder standing vertically (faces camera as group rotates)
    const coinMat=new THREE.MeshLambertMaterial({color:pal.coin,emissive:pal.emit,emissiveIntensity:1.2});
    const coin=new THREE.Mesh(new THREE.CylinderGeometry(.92,.92,.16,28),coinMat);
    coin.rotation.x=Math.PI/2; // stand up like a coin
    g.add(coin);

    // [2] Rim halo — thicker torus at coin edge for neon glow
    const halo=new THREE.Mesh(new THREE.TorusGeometry(1.02,.10,8,36),
      new THREE.MeshLambertMaterial({color:pal.halo,emissive:pal.halo,emissiveIntensity:1.5,transparent:true,opacity:.85}));
    halo.rotation.x=Math.PI/2;
    g.add(halo);

    // [3] Orbital thin ring — tilted for depth
    const orbit=new THREE.Mesh(new THREE.TorusGeometry(1.35,.045,6,40),
      new THREE.MeshLambertMaterial({color:pal.rim,emissive:pal.rim,emissiveIntensity:1.3,transparent:true,opacity:.75}));
    orbit.rotation.x=Math.PI*.45;orbit.rotation.z=Math.PI*.12;
    g.add(orbit);

    // [4] Star face — glowing octahedron floating at front of coin
    const star=new THREE.Mesh(new THREE.OctahedronGeometry(.36,0),
      new THREE.MeshBasicMaterial({color:pal.rim,transparent:true,opacity:.95}));
    star.position.z=.13;
    g.add(star);

    // [5] Vertical soft beam
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.05,.42,14,8,1,true),
      new THREE.MeshBasicMaterial({color:pal.light,transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false}));
    beam.position.y=6;g.add(beam);

    // [6] Ground marker ring — anchors the token visually
    const groundRing=new THREE.Mesh(new THREE.RingGeometry(.55,1.25,28),
      new THREE.MeshBasicMaterial({color:pal.halo,transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false}));
    groundRing.rotation.x=-Math.PI/2;
    groundRing.position.y=-pos.y+.025;
    g.add(groundRing);

    scene.add(g);
    const starLight=new THREE.PointLight(pal.light,2.2,18);
    starLight.position.copy(pos);scene.add(starLight);
    collectibles.push({mesh:g,pos:pos.clone(),collected:false,radius:2.4,respawn:0,type:'score',light:starLight});
  });

  // Repair kits — modern medical hex-token
  [.04,.45,.82].forEach(t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const pos=p.clone().addScaledVector(nr,5.5);pos.y=2.1;

    const g=new THREE.Group();g.position.copy(pos);

    // [0] Core
    const core=new THREE.Mesh(new THREE.SphereGeometry(.18,8,8),
      new THREE.MeshBasicMaterial({color:0xffffff}));
    g.add(core);

    // [1] Hex-token base (6-sided cylinder standing like coin)
    const hex=new THREE.Mesh(new THREE.CylinderGeometry(1.05,1.05,.18,6),
      new THREE.MeshLambertMaterial({color:0x00ee66,emissive:0x00aa33,emissiveIntensity:1.1}));
    hex.rotation.x=Math.PI/2;
    g.add(hex);

    // [2] Rim halo
    const halo=new THREE.Mesh(new THREE.TorusGeometry(1.1,.09,8,24),
      new THREE.MeshLambertMaterial({color:0x44ffaa,emissive:0x00ff77,emissiveIntensity:1.4,transparent:true,opacity:.85}));
    halo.rotation.x=Math.PI/2;
    g.add(halo);

    // [3] Plus sign — bright emissive, on face
    const plusMat=new THREE.MeshBasicMaterial({color:0xffffff});
    const plusH=new THREE.Mesh(new THREE.BoxGeometry(.95,.28,.08),plusMat);
    plusH.position.z=.12;g.add(plusH);
    const plusV=new THREE.Mesh(new THREE.BoxGeometry(.28,.95,.08),plusMat);
    plusV.position.z=.12;
    // Stash vertical on same child index so animation still targets .children[3] for orbit
    g.add(plusV);

    // [5] Light beam
    const bm=new THREE.Mesh(new THREE.CylinderGeometry(.05,.38,14,8,1,true),
      new THREE.MeshBasicMaterial({color:0x00ff66,transparent:true,opacity:.09,side:THREE.DoubleSide,depthWrite:false}));
    bm.position.y=6;g.add(bm);

    // [6] Ground ring
    const groundRing=new THREE.Mesh(new THREE.RingGeometry(.6,1.4,24),
      new THREE.MeshBasicMaterial({color:0x00ff66,transparent:true,opacity:.32,side:THREE.DoubleSide,depthWrite:false}));
    groundRing.rotation.x=-Math.PI/2;
    groundRing.position.y=-pos.y+.025;
    g.add(groundRing);

    scene.add(g);
    const kitLight=new THREE.PointLight(0x00ff66,1.6,16);
    kitLight.position.copy(pos);scene.add(kitLight);
    collectibles.push({mesh:g,pos:pos.clone(),collected:false,radius:2.6,respawn:15,type:'repair',light:kitLight});
  });
}

function buildSpectators(){
  // Spectators removed — replaced by trackside banners & flags elsewhere
}

// ══ WORLD-SPECIFIC TRACK ELEMENTS ═══════════
function buildWorldElements(){
  if(activeWorld==='grandprix'){ buildWaterPuddles(); buildDRSZone(); buildTyreBarriers(); }
  else if(activeWorld==='space'){ buildGravityZones(); buildOrbitingAsteroids(); buildWarpTunnels(); }
  else if(activeWorld==='deepsea'){ buildCurrentStreams(); buildAbyssCracks(); buildTreasureTrail(); }
  // Neon City world elements handled in buildNeonCityEnvironment if present
}

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
function buildParticles(){
  sparkSystem=new SimpleParticles(_mobCount(300),scene);
  exhaustSystem=new SimpleParticles(_mobCount(200),scene);
}

// ══ MOUNTAINS ════════════════════════════════
function buildMountains(){
  const mNear=new THREE.MeshLambertMaterial({color:0x3d5878});
  const mFar=new THREE.MeshLambertMaterial({color:0x253850});
  const mSnow=new THREE.MeshLambertMaterial({color:0xddeeff});
  // [x, z, height, radius, hasSnow, sides]
  const peaks=[
    [-300,-520,185,85,true,6],[-80,-575,210,95,true,7],[140,-545,165,75,true,6],
    [340,-495,145,68,false,7],[520,-450,120,58,false,6],
    [570,-290,170,78,true,6],[605,-65,155,72,false,7],[575,165,135,64,false,6],
    [-560,-195,175,80,true,7],[-615,10,162,74,false,6],[-585,190,140,66,false,6],
    [-340,450,105,52,false,6],[-80,500,125,60,false,7],[170,490,110,55,false,6],
    [390,435,98,48,false,7],
  ];
  peaks.forEach(([x,z,h,r,snow,sides])=>{
    const base=new THREE.Mesh(new THREE.ConeGeometry(r*1.4,h*.4,sides),mFar);
    base.position.set(x,-8,z);scene.add(base);
    const peak=new THREE.Mesh(new THREE.ConeGeometry(r,h,sides),mNear);
    peak.position.set(x,0,z);scene.add(peak);
    if(snow){
      const cap=new THREE.Mesh(new THREE.ConeGeometry(r*.3,h*.25,sides),mSnow);
      cap.position.set(x,h*.4,z);scene.add(cap);
    }
  });
}

// ══ LAKE ═════════════════════════════════════
function buildLake(){
  // Shore bank
  const shore=new THREE.Mesh(new THREE.PlaneGeometry(168,115,1,1),
    new THREE.MeshLambertMaterial({color:0x5ea060}));
  shore.rotation.x=-Math.PI/2;shore.position.set(-10,-.1,-75);scene.add(shore);
  // Water body
  const water=new THREE.Mesh(new THREE.PlaneGeometry(148,98,1,1),
    new THREE.MeshLambertMaterial({color:0x1a6890,transparent:true,opacity:.88}));
  water.rotation.x=-Math.PI/2;water.position.set(-10,-.08,-75);scene.add(water);
  // Shimmer highlight
  const shim=new THREE.Mesh(new THREE.PlaneGeometry(130,82,1,1),
    new THREE.MeshLambertMaterial({color:0x2294b8,transparent:true,opacity:.55}));
  shim.rotation.x=-Math.PI/2;shim.position.set(-10,-.07,-75);scene.add(shim);
}

// ══ PIT BUILDING ─────────────────────────────
function buildPitBuilding(){
  const wMat=new THREE.MeshLambertMaterial({color:0xe4e4e4});
  const rMat=new THREE.MeshLambertMaterial({color:0x383848});
  const aMat=new THREE.MeshLambertMaterial({color:0xff5500});
  const dMat=new THREE.MeshLambertMaterial({color:0x1a1a1a});
  const gMat=new THREE.MeshLambertMaterial({color:0x88ccff,transparent:true,opacity:.75});
  // Main body (south side of S/F straight)
  const body=new THREE.Mesh(new THREE.BoxGeometry(330,7,16),wMat);
  body.position.set(-25,3.5,202);scene.add(body);
  // Roof overhang
  const roof=new THREE.Mesh(new THREE.BoxGeometry(338,.7,23),rMat);
  roof.position.set(-25,7.35,202);scene.add(roof);
  // Orange accent stripe
  const stripe=new THREE.Mesh(new THREE.BoxGeometry(330,.55,16.2),aMat);
  stripe.position.set(-25,6.2,202);scene.add(stripe);
  // Garage bays (9 doors)
  for(let i=0;i<9;i++){
    const gx=-161+i*36;
    const frame=new THREE.Mesh(new THREE.BoxGeometry(22,5.4,.3),wMat);
    frame.position.set(gx,2.5,194.4);scene.add(frame);
    const door=new THREE.Mesh(new THREE.BoxGeometry(20,5,.35),dMat);
    door.position.set(gx,2.5,194.25);scene.add(door);
  }
  // Pit wall
  const pw=new THREE.Mesh(new THREE.BoxGeometry(340,1.4,.9),
    new THREE.MeshLambertMaterial({color:0xffffff}));
  pw.position.set(-25,.7,187);scene.add(pw);
  // Pit entry light strip (green emissive)
  const pitEntry=new THREE.Mesh(new THREE.BoxGeometry(340,.12,.15),
    new THREE.MeshLambertMaterial({color:0x00ff55,emissive:0x00ff55,emissiveIntensity:1.5}));
  pitEntry.position.set(-25,.05,186.8);scene.add(pitEntry);
  // PIT IN text board
  const pitBoard=new THREE.Mesh(new THREE.BoxGeometry(16,3,0.3),
    new THREE.MeshLambertMaterial({color:0x00cc44,emissive:0x004422}));
  pitBoard.position.set(-185,4,190);scene.add(pitBoard);
  // Timing tower (right end of building)
  const tower=new THREE.Mesh(new THREE.BoxGeometry(15,22,13),wMat);
  tower.position.set(185,11,202);scene.add(tower);
  const tcap=new THREE.Mesh(new THREE.BoxGeometry(17,.8,15),aMat);
  tcap.position.set(185,22.4,202);scene.add(tcap);
  for(let f=0;f<3;f++){
    const win=new THREE.Mesh(new THREE.BoxGeometry(9,2.2,.3),gMat);
    win.position.set(185,6+f*4.8,195.5);scene.add(win);
  }
}

// ══ GRAVEL TRAPS ─────────────────────────────
function buildGravelTraps(){
  const gMat=new THREE.MeshLambertMaterial({color:0xb8a878});
  [{t:.22,s:1,w:30,l:34},{t:.36,s:1,w:26,l:30},
   {t:.50,s:-1,w:28,l:32},{t:.56,s:-1,w:24,l:28},
   {t:.80,s:1,w:26,l:30}].forEach(({t,s,w,l})=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const pos=p.clone().addScaledVector(nr,s*(TW+w*.5));
    const trap=new THREE.Mesh(new THREE.PlaneGeometry(l,w),gMat);
    trap.rotation.x=-Math.PI/2;trap.rotation.z=Math.atan2(tg.x,tg.z);
    trap.position.copy(pos);trap.position.y=-.05;scene.add(trap);
  });
}

// ══ ENVIRONMENT TREES ────────────────────────
function buildEnvironmentTrees(){
  const trunkGeo=new THREE.CylinderGeometry(.11,.17,1.5,5);
  const cGeo1=new THREE.ConeGeometry(1,4.5,7);
  const cGeo2=new THREE.ConeGeometry(.62,3.5,7);
  const tMat=new THREE.MeshLambertMaterial({color:0x6b4226});
  const lMats=[0x1d6b32,0x2a8040,0x145a28,0x226b35,0x1a5c2a,0x2d7a3a]
    .map(c=>new THREE.MeshLambertMaterial({color:c}));

  function placeTree(x,z,s=1){
    const sc=s*(0.82+Math.random()*.44);
    const lm=lMats[Math.floor(Math.random()*lMats.length)];
    const ry=Math.random()*Math.PI*2;
    const trunk=new THREE.Mesh(trunkGeo,tMat);
    trunk.position.set(x,.75*sc,z);trunk.scale.setScalar(sc);scene.add(trunk);
    const c1=new THREE.Mesh(cGeo1,lm);
    c1.position.set(x,2.5*sc,z);c1.scale.setScalar(sc);c1.rotation.y=ry;scene.add(c1);
    const c2=new THREE.Mesh(cGeo2,lm);
    c2.position.set(x,4.2*sc,z);c2.scale.setScalar(sc);c2.rotation.y=ry+.55;scene.add(c2);
  }

  // Trees just outside the track barriers (55 sample points, both sides)
  for(let i=0;i<55;i++){
    const t=i/55;
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    [-1,1].forEach(side=>{
      const d=BARRIER_OFF+20+Math.random()*38;
      placeTree(
        p.x+nr.x*side*d+(Math.random()-.5)*7,
        p.z+nr.z*side*d+(Math.random()-.5)*7
      );
    });
  }
  // Infield trees (ring around lake, inside circuit)
  for(let i=0;i<32;i++){
    const a=Math.random()*Math.PI*2,d=68+Math.random()*85;
    placeTree(-10+Math.cos(a)*d,-50+Math.sin(a)*d,.85+Math.random()*.3);
  }
}

function buildCenterlineArrows(){
  // Subtle chevrons (>>) along track centerline showing direction of travel
  const mat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.16});
  const N=55;
  for(let i=0;i<N;i++){
    const t=(i+.5)/N;
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const angle=Math.atan2(tg.x,tg.z);
    [-1,1].forEach(s=>{
      const bar=new THREE.Mesh(new THREE.BoxGeometry(.15,.01,1.6),mat);
      bar.position.copy(p);bar.position.y=.022;
      bar.rotation.y=angle+s*.48;
      scene.add(bar);
    });
  }
}

// ══ GP TRACK-SIDE PROPS (Candy-style close placement) ══════════
// ══ TRACK FLAGS ══════════════════════════════
function buildTrackFlags(){
  const flagT=[.02,.10,.19,.28,.37,.47,.56,.65,.74,.82,.90,.96];
  const flagColors=[0xff1111,0x0044ff,0xffee00,0xff7700,0x00cc44,0xffffff,
                    0xff0066,0x44ccff,0xff4400,0x00ffcc,0xff33aa,0xaaff00];
  const poleMat=new THREE.MeshLambertMaterial({color:0x888888});
  flagT.forEach((t,idx)=>{
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=idx%2===0?1:-1;
    const base=p.clone().addScaledVector(nr,side*(BARRIER_OFF+4.5));
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,5.5,6),poleMat);
    pole.position.copy(base);pole.position.y=2.75;scene.add(pole);
    const flagMat=new THREE.MeshBasicMaterial({color:flagColors[idx%flagColors.length],side:THREE.DoubleSide});
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(1.9,1.0),flagMat);
    flag.position.copy(base);flag.position.y=5.2;
    // Orient flag perpendicular to pole, in track tangent direction
    flag.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI*.5;
    scene.add(flag);
    _trackFlags.push({mesh:flag,base:base.clone(),side,idx});
  });
}
function updateFlags(){
  const t=_nowSec;
  _trackFlags.forEach((f,i)=>{
    const wave=Math.sin(t*3.0+i*1.1)*.22;
    const wave2=Math.sin(t*4.8+i*0.7)*.08;
    f.mesh.rotation.x=wave;
    f.mesh.rotation.z=wave2;
  });
}

// ══ SUN LENS FLARE ═══════════════════════════
function buildSunBillboard(){
  const c=document.createElement('canvas');c.width=128;c.height=128;
  const ctx=c.getContext('2d');
  const grd=ctx.createRadialGradient(64,64,0,64,64,64);
  grd.addColorStop(0,'rgba(255,255,220,1)');
  grd.addColorStop(0.1,'rgba(255,240,160,0.9)');
  grd.addColorStop(0.3,'rgba(255,210,100,0.5)');
  grd.addColorStop(0.6,'rgba(255,170,60,0.18)');
  grd.addColorStop(1,'rgba(255,140,20,0)');
  ctx.fillStyle=grd;ctx.fillRect(0,0,128,128);
  const tex=new THREE.CanvasTexture(c);
  const mat=new THREE.SpriteMaterial({map:tex,blending:THREE.AdditiveBlending,transparent:true,opacity:.82,depthWrite:false});
  _sunBillboard=new THREE.Sprite(mat);
  const sunDir=new THREE.Vector3(180,320,80).normalize();
  _sunBillboard.position.copy(sunDir).multiplyScalar(500);
  _sunBillboard.scale.set(240,240,1);
  _sunBillboard.visible=!isDark&&!isRain;
  scene.add(_sunBillboard);
}

// ══ CORNER BOARDS ════════════════════════════
function buildCornerBoards(){
  // Numbered boards T1-T8 at each major corner entry, outside of track
  const corners=[
    {t:.165,name:'T1',col:0xff3300},
    {t:.215,name:'T2',col:0xff6600},
    {t:.385,name:'T3',col:0xffcc00},
    {t:.465,name:'T4',col:0x88ee00},
    {t:.535,name:'T5',col:0x00bb44},
    {t:.685,name:'T6',col:0x0088ff},
    {t:.745,name:'T7',col:0x3300ee},
    {t:.795,name:'T8',col:0xbb00ee},
  ];
  corners.forEach(({t,name,col})=>{
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    // Place board on the outside edge of the track
    const bPos=p.clone().addScaledVector(nr,TW+4.2);
    bPos.y=0;
    // Post
    const post=new THREE.Mesh(new THREE.BoxGeometry(.28,3.2,.28),
      new THREE.MeshLambertMaterial({color:0xffffff}));
    post.position.set(bPos.x,1.6,bPos.z);scene.add(post);
    // Colored board with canvas texture number
    const cvs=document.createElement('canvas');cvs.width=64;cvs.height=52;
    const cx=cvs.getContext('2d');
    cx.fillStyle='#'+col.toString(16).padStart(6,'0');cx.fillRect(0,0,64,52);
    cx.strokeStyle='rgba(255,255,255,0.6)';cx.lineWidth=3;cx.strokeRect(2,2,60,48);
    cx.fillStyle='#ffffff';cx.font='bold 26px Arial';cx.textAlign='center';cx.textBaseline='middle';
    cx.fillText(name,32,26);
    const tex=new THREE.CanvasTexture(cvs);
    const board=new THREE.Mesh(new THREE.BoxGeometry(3.2,2.0,.14),
      new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));
    board.position.set(bPos.x,3.4,bPos.z);
    board.rotation.y=Math.atan2(-tg.x,-tg.z);
    scene.add(board);
  });
}

// ══ ADVERTISING BOARDS ═══════════════════════
function buildAdvertisingBoards(){
  const defs=[
    {t:.03,s:1,  text:["SPENCER'S","RACE CLUB"], bg:'#1a0030',fg:'#cc66ff'},
    {t:.32,s:-1, text:["DRIFT KING"],            bg:'#001a44',fg:'#00ccff'},
    {t:.62,s:1,  text:["SPEED ZONE"],            bg:'#001a00',fg:'#44ff88'},
    {t:.88,s:-1, text:["CHEQUERED","FLAG"],      bg:'#111111',fg:'#ffffff'},
  ];
  const poleMat=new THREE.MeshLambertMaterial({color:0x999999});
  defs.forEach(({t,s,text,bg,fg})=>{
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const pos=p.clone().addScaledVector(nr,s*(BARRIER_OFF+7.5));
    // Canvas texture with bold text
    const cv=document.createElement('canvas');cv.width=256;cv.height=128;
    const cx=cv.getContext('2d');
    cx.fillStyle=bg;cx.fillRect(0,0,256,128);
    cx.fillStyle=fg;cx.font='bold 32px Arial';cx.textAlign='center';cx.textBaseline='middle';
    const lineH=text.length>1?40:0;
    const startY=64-(text.length-1)*lineH*.5;
    text.forEach((line,i)=>cx.fillText(line,128,startY+i*lineH));
    cx.strokeStyle=fg;cx.lineWidth=5;cx.strokeRect(4,4,248,120);
    const tex=new THREE.CanvasTexture(cv);
    const board=new THREE.Mesh(new THREE.PlaneGeometry(10,5),
      new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));
    board.position.copy(pos);board.position.y=4.0;
    board.rotation.y=Math.atan2(nr.x*s,nr.z*s);
    scene.add(board);
    // Two support poles
    const fwd=new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),board.rotation.y);
    [-4,4].forEach(ox=>{
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.1,.13,8,6),poleMat);
      pole.position.copy(pos).addScaledVector(fwd,ox);pole.position.y=4;
      scene.add(pole);
    });
  });
}

// ══ DYNAMIC SKY ═══════════════════════════════
function updateSky(dt){
  _skyT+=(_skyTarget-_skyT)*Math.min(1,dt*0.55);
  scene.fog.color.lerpColors(_fogColorDay,_fogColorNight,_skyT);
  // Subtle sun brightness modulation
  if(_sunBillboard&&_sunBillboard.material){
    const tgt=_skyT<0.5?0.82*(1-_skyT*2)*(isRain?0.3:1):0;
    _sunBillboard.material.opacity+=(tgt-_sunBillboard.material.opacity)*Math.min(1,dt*1.2);
  }
  // Stars twinkle — slowly modulate star material opacity
  if(stars&&stars.visible&&stars.material){
    const twinkle=0.82+Math.sin(_nowSec*1.7)*0.10+Math.sin(_nowSec*3.1)*0.05;
    stars.material.opacity=twinkle;
  }
}

// ══ NIGHT MODE ═══════════════════════════════
function buildNightObjects(){
  for(let i=0;i<30;i++){
    const t=i/30,p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    [-1,1].forEach(side=>{
      const pp=p.clone().addScaledVector(nr,side*(BARRIER_OFF+2));
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.08,.1,9,6),
        new THREE.MeshLambertMaterial({color:0x888888}));
      pole.position.copy(pp);pole.position.y=4.5;pole.visible=false;
      scene.add(pole);trackPoles.push(pole);
      const lamp=new THREE.Mesh(new THREE.BoxGeometry(.6,.22,1.2),
        new THREE.MeshLambertMaterial({color:0xffffcc,emissive:0x888844}));
      lamp.position.copy(pp);lamp.position.y=9.2;lamp.visible=false;
      scene.add(lamp);trackPoles.push(lamp);
      const pl=new THREE.PointLight(0xffdd88,0,38);
      pl.position.copy(pp);pl.position.y=9;scene.add(pl);trackLightList.push(pl);
    });
  }
  const sg=new THREE.SphereGeometry(.28,4,4),sm=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:1});
  stars=new THREE.InstancedMesh(sg,sm,380);stars.visible=false;
  const dm=new THREE.Object3D();
  for(let i=0;i<380;i++){
    const th=Math.random()*Math.PI*2,ph=Math.random()*Math.PI*.48,r=350+Math.random()*100;
    dm.position.set(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph)*.5+160,r*Math.sin(ph)*Math.sin(th)+220);
    const starSize=i<60?2.2+Math.random()*1.2:.6+Math.random()*1.6;// brighter foreground stars
    dm.scale.setScalar(starSize);dm.updateMatrix();stars.setMatrixAt(i,dm.matrix);
  }
  stars.instanceMatrix.needsUpdate=true;scene.add(stars);
  // Moon — large glowing sphere high in the sky
  const moonGeo=new THREE.SphereGeometry(12,16,16);
  const moonMat=new THREE.MeshBasicMaterial({color:0xe8eef8});
  const moon=new THREE.Mesh(moonGeo,moonMat);
  moon.position.set(-180,280,-120);moon.visible=false;
  scene.add(moon);trackPoles.push(moon);
  // Moon glow halo
  const haloGeo=new THREE.SphereGeometry(18,16,16);
  const haloMat=new THREE.MeshBasicMaterial({color:0x8899cc,transparent:true,opacity:.14,side:THREE.BackSide});
  const halo=new THREE.Mesh(haloGeo,haloMat);
  halo.position.copy(moon.position);halo.visible=false;
  scene.add(halo);trackPoles.push(halo);
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);
}

// ══ SPACE WORLD ═══════════════════════════════
function spawnSpaceMeteor(){
  const m=_spaceMeteors.find(m=>!m.active);if(!m)return;
  // Random point on track
  const t=Math.random();
  const p=trackCurve.getPoint(t);
  const nr=trackCurve.getTangent(t).normalize();
  // Land within track width
  const offX=(Math.random()-.5)*TW*1.4,offZ=(Math.random()-.5)*TW*1.4;
  m.tx=p.x+offX;m.tz=p.z+offZ;
  m.mesh.position.set(m.tx,220+Math.random()*80,m.tz);
  m.mesh.visible=true;m.vy=-8;m.t=0;m.active=true;
  m.pl.intensity=3.0;m.pl.position.copy(m.mesh.position);
  // Warning popup
  floatText('☄ INCOMING!','#ff8800',innerWidth*.5,innerHeight*.35);
  if(audioCtx)beep(180,.5,.3,0,'sawtooth');
}

// ══ DEEP SEA WORLD ═══════════════════════════════════════════════════════════

// ══ NEON CITY WORLD ═══════════════════════════════════════════════════════════
// ── Neon City Gameplay Elements ───────────────────────────────────────────────
// ── Neon City Update Loop ─────────────────────────────────────────────────────
// ══ CANDY WORLD ═══════════════════════════════════════════════════════════════
function updateSprinkles(dt){
  if(!_sprinkleGeo)return;
  const pos=_sprinkleGeo.attributes.position.array;
  const car=carObjs[playerIdx];
  const cx=car?car.mesh.position.x:0,cz=car?car.mesh.position.z:0;
  const count=pos.length/3;
  const step=Math.floor(_nowSec*600)%6;
  for(let i=step;i<count;i+=6){
    pos[i*3+1]-=dt*1.5+Math.random()*.01;
    if(pos[i*3+1]<-.5){
      pos[i*3]=(Math.random()-.5)*600+cx;
      pos[i*3+1]=20+Math.random()*4;
      pos[i*3+2]=(Math.random()-.5)*600+cz;
    }
  }
  _sprinkleGeo.attributes.position.needsUpdate=true;
}

// ── Space fall / tractor beam recovery ────────────────────────────────────────
function triggerSpaceFall(car){
  if(car._fallingIntoSpace||recoverActive)return;
  car._fallingIntoSpace=true;
  car._fallTimer=0;
  car.inAir=true;
  // Give a small downward push
  if(car.vy>-2)car.vy=-2;
  if(_elWarn)_elWarn.style.display='none';
  if(_elWrongWay)_elWrongWay.style.display='none';
  _wrongWayTimer=0;
  showBanner('FALLING!','#ff3300',0); // 0 = keep until hidden
  playSpaceFallSound();
  floatText('⬇ FALLING!','#ff4400',innerWidth*.5,innerHeight*.4);
}

function triggerSpaceRecovery(car){
  car._fallingIntoSpace=false;
  car._fallTimer=0;
  recoverActive=true;recoverTimer=2.8;car.speed=0;car.vy=0;car.inAir=false;
  hideBanner();
  // Tractor beam — position beam above recovery point
  const t=car.progress;
  const pt=trackCurve.getPoint(t);
  if(_spaceBeamMesh){
    _spaceBeamMesh.position.set(pt.x,pt.y+110,pt.z);
    _spaceBeamMesh.visible=true;
    _spaceBeamTimer=2.8;
  }
  // Teleport car back to track
  const tgR=trackCurve.getTangent(t).normalize();
  car.mesh.position.copy(pt);car.mesh.position.y=.35;
  car.mesh.rotation.set(0,Math.atan2(-tgR.x,-tgR.z),0);
  const off=new THREE.Vector3(0,5.8,13.5).applyQuaternion(car.mesh.quaternion);
  camPos.copy(car.mesh.position).add(off);
  camShake=0.8;
  showBanner('🛸 TRACTOR BEAM','#00ffcc',2600);
  playSpaceTractorSound();
  floatText('🛸 RETRIEVED','#00ffcc',innerWidth*.5,innerHeight*.45);
}

// Space audio helpers
function playSpaceFallSound(){
  if(!audioCtx)return;
  // Descending wail
  const o=audioCtx.createOscillator();const g=audioCtx.createGain();
  o.type='sawtooth';o.frequency.setValueAtTime(320,audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(60,audioCtx.currentTime+1.4);
  g.gain.setValueAtTime(.28,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+1.6);
  o.connect(g);g.connect(_dst());o.start();o.stop(audioCtx.currentTime+1.6);
}
function playSpaceTractorSound(){
  if(!audioCtx)return;
  // Rising hum beam
  const o=audioCtx.createOscillator();const g=audioCtx.createGain();
  o.type='sine';o.frequency.setValueAtTime(80,audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(440,audioCtx.currentTime+1.0);
  g.gain.setValueAtTime(.0001,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.35,audioCtx.currentTime+.3);
  g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+2.4);
  o.connect(g);g.connect(_dst());o.start();o.stop(audioCtx.currentTime+2.6);
  // Add a high shimmer
  const o2=audioCtx.createOscillator();const g2=audioCtx.createGain();
  o2.type='sine';o2.frequency.setValueAtTime(880,audioCtx.currentTime+.1);
  o2.frequency.linearRampToValueAtTime(1760,audioCtx.currentTime+1.8);
  g2.gain.setValueAtTime(.0001,audioCtx.currentTime+.1);g2.gain.linearRampToValueAtTime(.15,audioCtx.currentTime+.5);
  g2.gain.linearRampToValueAtTime(.001,audioCtx.currentTime+2.6);
  o2.connect(g2);g2.connect(_dst());o2.start(audioCtx.currentTime+.1);o2.stop(audioCtx.currentTime+2.8);
}
function playSpaceWormholeSound(){
  if(!audioCtx)return;
  beep(220,.12,.2,0,'sine');beep(440,.10,.18,.1,'sine');beep(880,.08,.15,.2,'sine');
  beep(1760,.06,.12,.3,'sine');
}
function playSpaceRailgunSound(){
  if(!audioCtx)return;
  beep(120,.06,.35,0,'sawtooth');beep(240,.08,.3,.04,'sawtooth');
}

// ── Space railgun player check ──────────────────────────────────────────────
// ── Space wormhole player check ────────────────────────────────────────────
// Wormholes stored as individual portal objects: {t, linkedT, ring, portal, ...}
// Portals come in pairs: index 0+1 for pair 1, index 2+3 for pair 2
let _wormholeCooldown=0;
// ══ NIGHT MODE ═══════════════════════════════
function toggleNight(){
  isDark=!isDark;
  localStorage.setItem('src_night',isDark?'1':'0');
  _skyTarget=isDark?1:0;
  if(activeWorld==='deepsea'){
    // Underwater — toggle is shallow water (day) vs deep abyss (night)
    if(isDark){
      scene.background=makeSkyTex('#000810','#00101a');scene.fog.density=.0022;
      sunLight.intensity=.05;ambientLight.intensity=.12;hemiLight.intensity=.08;
      trackLightList.forEach(l=>l.intensity=1.6);trackPoles.forEach(p=>p.visible=true);
      if(stars)stars.visible=true; // biolum particles
      _dsaBioEdges.forEach(e=>e.mat.opacity=.85);
      _jellyfishList.forEach(j=>{const pl=j.children.find(c=>c.isLight);if(pl)pl.intensity=1.4;});
    }else{
      scene.background=makeSkyTex('#001825','#003355');scene.fog.density=.0014;
      sunLight.intensity=.45;ambientLight.intensity=.55;hemiLight.intensity=.30;
      trackLightList.forEach(l=>l.intensity=0);trackPoles.forEach(p=>p.visible=false);
      if(stars)stars.visible=false;
      _dsaBioEdges.forEach(e=>e.mat.opacity=.45);
      _jellyfishList.forEach(j=>{const pl=j.children.find(c=>c.isLight);if(pl)pl.intensity=.6;});
    }
    if(plHeadL){plHeadL.intensity=isDark?2.2:0;plHeadR.intensity=isDark?2.2:0;}
    if(plTail)plTail.intensity=isDark?1.6:0;
    _aiHeadPool.forEach(l=>l.intensity=isDark?1.4:0);
    if(_sunBillboard)_sunBillboard.visible=false;
  }else if(activeWorld==='neoncity'){
    // Neon City — always night, toggle adjusts neon intensity
    if(isDark){
      scene.background=makeSkyTex('#000008','#030012');scene.fog.density=.0018;
      sunLight.intensity=.02;ambientLight.intensity=.15;hemiLight.intensity=.10;
      trackLightList.forEach(l=>{if(l.intensity>0)l.intensity=Math.min(l.intensity*1.3,4.5);});
    }else{
      scene.background=makeSkyTex('#040015','#080025');scene.fog.density=.0012;
      sunLight.color.setHex(0x441122);sunLight.intensity=.08;
      ambientLight.intensity=.22;hemiLight.intensity=.18;
    }
    if(stars)stars.visible=true;
    if(plHeadL){plHeadL.intensity=2.8;plHeadR.intensity=2.8;}
    if(plTail)plTail.intensity=2.0;
    _aiHeadPool.forEach(l=>l.intensity=1.8);
    if(_sunBillboard)_sunBillboard.visible=false;
  }else if(activeWorld==='arctic'){
    if(isDark){scene.background=makeSkyTex('#040c18','#0a1828');scene.fog.density=.005;
      sunLight.intensity=.04;ambientLight.intensity=.12;trackLightList.forEach(function(l){l.intensity=1.4;});
    }else{scene.background=makeSkyTex('#0a1525','#1a3050');scene.fog.density=.0035;
      sunLight.color.setHex(0xaaccff);sunLight.intensity=.8;ambientLight.intensity=.45;trackLightList.forEach(function(l){l.intensity=0;});
    }
    if(stars)stars.visible=isDark;
    if(plHeadL){plHeadL.intensity=isDark?2.6:0;plHeadR.intensity=isDark?2.6:0;}
    if(plTail)plTail.intensity=isDark?1.6:0;
    _aiHeadPool.forEach(function(l){l.intensity=isDark?1.5:0;});
    if(_sunBillboard)_sunBillboard.visible=!isDark;
  }else if(activeWorld==='volcano'){
    sunLight.intensity=isDark?.04:.7;ambientLight.intensity=isDark?.12:.35;hemiLight.intensity=isDark?.08:.25;
    if(stars)stars.visible=true;
    trackLightList.forEach(function(l){l.intensity=isDark?1.8:0;});
    if(plHeadL){plHeadL.intensity=isDark?2.8:0;plHeadR.intensity=isDark?2.8:0;}
    if(plTail)plTail.intensity=isDark?2.0:0;
    _aiHeadPool.forEach(function(l){l.intensity=isDark?1.8:0;});
    if(_sunBillboard)_sunBillboard.visible=false;
  }else if(activeWorld==='candy'){
    // Candy — Day=bright pastel paradise, Night=glow-in-the-dark wonderland
    if(isDark){
      scene.background=makeSkyTex('#1a0028','#280038');scene.fog.density=.0012;
      sunLight.intensity=.06;ambientLight.intensity=.18;hemiLight.intensity=.12;
      trackLightList.forEach(l=>l.intensity=2.2);trackPoles.forEach(p=>p.visible=true);
      _candyNightEmissives.forEach(m=>{ if(m.material){m.material.emissiveIntensity=1.8;} });
      _candyCandles.forEach(l=>l.intensity=2.2);
      if(plHeadL){plHeadL.intensity=2.4;plHeadR.intensity=2.4;}
      if(plTail)plTail.intensity=1.6;
      _aiHeadPool.forEach(l=>l.intensity=1.5);
    }else{
      scene.background=makeSkyTex('#ff88cc','#ffe4f0');scene.fog.density=.0009;
      sunLight.intensity=1.5;ambientLight.intensity=.65;hemiLight.intensity=.45;
      trackLightList.forEach(l=>l.intensity=0);trackPoles.forEach(p=>p.visible=false);
      _candyNightEmissives.forEach(m=>{ if(m.material){m.material.emissiveIntensity=.25;} });
      _candyCandles.forEach(l=>l.intensity=1.0);
      if(plHeadL){plHeadL.intensity=0;plHeadR.intensity=0;}
      if(plTail)plTail.intensity=0;
      _aiHeadPool.forEach(l=>l.intensity=0);
    }
    if(_sunBillboard)_sunBillboard.visible=!isDark;
  }else if(activeWorld==='space'){
    // Space is always dark — toggle only affects ambient brightness ("solar flare day" vs "deep night")
    if(isDark){
      scene.background=makeSkyTex('#000005','#010018');scene.fog.density=.0008;
      sunLight.intensity=.04;ambientLight.intensity=.14;hemiLight.intensity=.10;
    }else{
      scene.background=makeSkyTex('#040025','#080045');scene.fog.density=.0005;
      sunLight.intensity=.10;ambientLight.intensity=.28;hemiLight.intensity=.18;
    }
    if(stars)stars.visible=true; // always on in space
    trackLightList.forEach(l=>l.intensity=isDark?2.0:1.4);
    trackPoles.forEach(p=>p.visible=true);
    if(plHeadL){plHeadL.intensity=2.6;plHeadR.intensity=2.6;}
    if(plTail)plTail.intensity=1.8;
    _aiHeadPool.forEach(l=>l.intensity=1.7);
  }else{
    if(isDark){
      scene.background=makeSkyTex('#010408','#030d1e');scene.fog.density=.0035;
      sunLight.intensity=.04;ambientLight.intensity=.10;hemiLight.intensity=.07;
      trackLightList.forEach(l=>l.intensity=2.8);trackPoles.forEach(p=>p.visible=true);if(stars)stars.visible=true;
      if(plHeadL){plHeadL.intensity=2.6;plHeadR.intensity=2.6;}if(plTail)plTail.intensity=1.8;
      _aiHeadPool.forEach(l=>l.intensity=1.7);
    }else{
      scene.background=makeSkyTex('#1e5292','#b8d8ee');scene.fog.density=.0011;
      sunLight.intensity=1.65;ambientLight.intensity=.50;hemiLight.intensity=.36;
      trackLightList.forEach(l=>l.intensity=0);trackPoles.forEach(p=>p.visible=false);if(stars)stars.visible=false;
      if(plHeadL){plHeadL.intensity=0;plHeadR.intensity=0;}if(plTail)plTail.intensity=0;
      _aiHeadPool.forEach(l=>l.intensity=0);
    }
  }
  // Snap fog color instantly on non-race screens; during race updateSky lerps it
  if(gameState!=='RACE'&&gameState!=='FINISH'){
    _skyT=_skyTarget;
    scene.fog.color.lerpColors(_fogColorDay,_fogColorNight,_skyT);
  }
  if(_sunBillboard)_sunBillboard.visible=!isDark&&!isRain&&activeWorld!=='space'&&activeWorld!=='deepsea';
  const lbl=isDark?'☀ DAY':'🌙 NIGHT';
  const _tnb=document.getElementById('titleNightBtn');if(_tnb)_tnb.textContent=lbl;
  const _hnb=document.getElementById('hudNightBtn');if(_hnb)_hnb.textContent=lbl;
}

function updateCarLights(){
  // Reverse lights — always update regardless of night mode
  carObjs.forEach((car,i)=>{
    const rl=_reverseLights[i];if(!rl)return;
    const mat=rl.material;
    if(car.speed<-0.05){mat.emissiveIntensity=2.5;mat.opacity=1;}
    else{mat.emissiveIntensity=0;}
  });
  if(!isDark||!plHeadL)return;
  const car=carObjs[playerIdx];if(!car)return;
  _plFwd.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
  _plRt.set(1,0,0).applyQuaternion(car.mesh.quaternion);
  _camV1.copy(car.mesh.position);_camV1.y+=.45; // reuse _camV1 as bH
  plHeadL.position.copy(_camV1).addScaledVector(_plRt,-.62).addScaledVector(_plFwd,-1.9);
  plHeadL.target.position.copy(plHeadL.position).addScaledVector(_plFwd,-12);plHeadL.target.updateMatrixWorld();
  plHeadR.position.copy(_camV1).addScaledVector(_plRt,.62).addScaledVector(_plFwd,-1.9);
  plHeadR.target.position.copy(plHeadR.position).addScaledVector(_plFwd,-12);plHeadR.target.updateMatrixWorld();
  plTail.position.copy(car.mesh.position).addScaledVector(_plFwd,1.9);plTail.position.y+=.42;
  // AI headlights: assign pool lights to nearest AI cars (no allocation)
  if(_aiHeadPool.length>0){
    let aiCount=0;
    for(let i=0;i<carObjs.length&&aiCount<_aiHeadPool.length;i++){
      if(i===playerIdx||carObjs[i].finished)continue;
      const ai=carObjs[i];
      _aiFwdRV.set(0,0,-1).applyQuaternion(ai.mesh.quaternion);
      _aiHeadPool[aiCount].position.copy(ai.mesh.position).addScaledVector(_aiFwdRV,-1.6);
      _aiHeadPool[aiCount].position.y+=.45;
      _aiHeadPool[aiCount].intensity=1.4;
      aiCount++;
    }
    for(let i=aiCount;i<_aiHeadPool.length;i++)_aiHeadPool[i].intensity=0;
  }
}

// ══ RAIN ═════════════════════════════════════
function initRain(){
  rainCanvas=document.getElementById('rainCanvas');
  rainCtx=rainCanvas.getContext('2d');
  rainCanvas.width=innerWidth;rainCanvas.height=innerHeight;
  const _rainCount=_mobCount(220);
  for(let i=0;i<_rainCount;i++) rainDrops.push({x:Math.random()*innerWidth,y:Math.random()*innerHeight,spd:8+Math.random()*10,len:10+Math.random()*20,alpha:.3+Math.random()*.5});
  window.addEventListener('resize',()=>{if(rainCanvas){rainCanvas.width=innerWidth;rainCanvas.height=innerHeight;}});
}
function toggleRain(){
  isRain=!isRain;
  _rainTarget=isRain?1:0;
  // On non-race screens updateWeather isn't running — apply instantly
  if(gameState==='TITLE'||gameState==='SELECT'){
    _rainIntensity=_rainTarget;
    if(rainCanvas)rainCanvas.style.display=isRain?'block':'none';
    scene.fog.density=isDark?(isRain?.006:.0035):(isRain?.002:.0011);
    if(_trackMesh){
      const base=_trackMesh.material.userData.baseColor||0x262626;
      // Preserve world track color, only darken slightly when raining
      const bc=new THREE.Color(base);
      if(isRain)bc.multiplyScalar(0.55);
      _trackMesh.material.color.copy(bc);
      _trackMesh.material.emissive=new THREE.Color(isRain?0x0a0d14:0x000000);
      _trackMesh.material.needsUpdate=true;
    }
  }
  if(_sunBillboard)_sunBillboard.visible=!isDark&&!isRain;
  const lbl=isRain?'☀ DRY':'🌧 RAIN';
  const _trb=document.getElementById('titleRainBtn');if(_trb)_trb.textContent=lbl;
  const _hrb=document.getElementById('hudRainBtn');if(_hrb)_hrb.textContent=lbl;
}
function setWeather(mode){
  _weatherMode=mode;
  if(isRain&&mode!=='storm'&&mode!=='rain'){isRain=false;_rainTarget=0;}
  // ── Space weather ─────────────────────────────────────────────
  if(activeWorld==='space'){
    if(_snowParticles){scene.remove(_snowParticles);_snowParticles=null;}
    if(mode==='clear'){
      scene.fog.density=.0008;scene.fog.color.setHex(0x050015);
      ambientLight.intensity=isDark?.14:.28;
    } else if(mode==='fog'){
      // Nebula Cloud — dense purple mist
      scene.fog.density=.018;scene.fog.color.setHex(0x120028);
      ambientLight.intensity=.06;
    } else if(mode==='sunset'){
      // Solar Flare — warm orange glow from one side
      scene.fog.density=.001;scene.fog.color.setHex(0x441100);
      sunLight.color.setHex(0xff7722);sunLight.intensity=.3;
      ambientLight.intensity=.22;
    } else if(mode==='storm'){
      // Meteor Shower — use rain + heavier flash
      if(!isRain){isRain=true;_rainTarget=1;}
      scene.fog.density=.003;scene.fog.color.setHex(0x0a000a);
      _stormFlashTimer=6+Math.random()*5;ambientLight.intensity=.08;
    } else if(mode==='snow'){
      // Stardust surge — extra dust, slightly denser
      scene.fog.density=.001;scene.fog.color.setHex(0x080025);
      if(!_spaceDustParticles)buildSpaceDust();
      else{_spaceDustParticles.material.opacity=.75;_spaceDustParticles.material.size=.5;}
    }
    document.querySelectorAll('.wxCard').forEach(b=>b.classList.toggle('wxSel',b.dataset.w===mode));
    localStorage.setItem('src_weather',mode);
    return;
  }
  // ── Grand Prix weather ────────────────────────────────────────
  if(mode==='clear'){
    scene.fog.density=.0011;scene.fog.color.setHex(0x8ac0e0);
    if(scene.background)scene.background=makeSkyTex('#1e5292','#b8d8ee');
    sunLight.color.setHex(0xfff8f0);sunLight.intensity=1.65;ambientLight.intensity=.50;hemiLight.intensity=.36;
    hemiLight.color.setHex(0x9bbfdd);hemiLight.groundColor.setHex(0x4a7a3d);
    if(_sunBillboard)_sunBillboard.visible=true;
    if(_snowParticles){scene.remove(_snowParticles);_snowParticles=null;}
  } else if(mode==='fog'){
    scene.fog.density=.012;scene.fog.color.setHex(0x889988);
    scene.background=makeSkyTex('#778877','#99aa99');
    sunLight.intensity=.3;ambientLight.intensity=.35;hemiLight.intensity=.2;
    if(_sunBillboard)_sunBillboard.visible=false;
    if(_snowParticles){scene.remove(_snowParticles);_snowParticles=null;}
  } else if(mode==='sunset'){
    scene.fog.density=.0015;scene.fog.color.setHex(0xdd8855);
    scene.background=makeSkyTex('#ff4400','#ffaa44');
    sunLight.color.setHex(0xff8840);sunLight.intensity=1.2;
    hemiLight.color.setHex(0xff9944);hemiLight.groundColor.setHex(0x664422);hemiLight.intensity=.5;
    if(_sunBillboard)_sunBillboard.visible=true;
    if(_snowParticles){scene.remove(_snowParticles);_snowParticles=null;}
  } else if(mode==='storm'){
    if(!isRain){isRain=true;_rainTarget=1;}
    scene.fog.density=.006;scene.fog.color.setHex(0x223322);
    scene.background=makeSkyTex('#0a1205','#1a2a18');
    sunLight.intensity=.25;ambientLight.intensity=.18;hemiLight.intensity=.12;
    if(_sunBillboard)_sunBillboard.visible=false;
    _stormFlashTimer=8+Math.random()*7;
    if(_snowParticles){scene.remove(_snowParticles);_snowParticles=null;}
  } else if(mode==='snow'){
    scene.fog.density=.0045;scene.fog.color.setHex(0xbbccdd);
    scene.background=makeSkyTex('#8899aa','#ccddee');
    sunLight.intensity=.6;ambientLight.intensity=.55;hemiLight.intensity=.45;
    if(_sunBillboard)_sunBillboard.visible=false;
    // Snow particles
    if(!_snowParticles){
      _snowGeo=new THREE.BufferGeometry();
      const cnt=_mobCount(600),pos=new Float32Array(cnt*3);
      for(let i=0;i<cnt;i++){pos[i*3]=((Math.random()-.5)*400);pos[i*3+1]=Math.random()*30;pos[i*3+2]=((Math.random()-.5)*400);}
      _snowGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
      _snowParticles=new THREE.Points(_snowGeo,new THREE.PointsMaterial({color:0xeeeeff,size:.35,transparent:true,opacity:.7}));
      scene.add(_snowParticles);
    }
  }
  // Highlight active weather card
  document.querySelectorAll('.wxCard').forEach(b=>b.classList.toggle('wxSel',b.dataset.w===mode));
  localStorage.setItem('src_weather',mode);
}
function updateSnow(dt){
  if(!_snowParticles||!_snowGeo)return;
  const pos=_snowGeo.attributes.position.array;
  const car=carObjs[playerIdx];
  const cx=car?car.mesh.position.x:0,cz=car?car.mesh.position.z:0;
  for(let i=0;i<pos.length;i+=3){
    pos[i+1]-=dt*1.2;pos[i]+=Math.sin(_nowSec*.3+i)*.04;pos[i+2]+=Math.cos(_nowSec*.25+i)*.04;
    if(pos[i+1]<0){pos[i]=cx+((Math.random()-.5)*400);pos[i+1]=30;pos[i+2]=cz+((Math.random()-.5)*400);}
  }
  _snowGeo.attributes.position.needsUpdate=true;
}
function updateStormFlash(dt){
  if(_weatherMode!=='storm')return;
  _stormFlashTimer-=dt;
  if(_stormFlashTimer<=0){
    // Lightning flash
    ambientLight.intensity=1.8;
    setTimeout(()=>{ambientLight.intensity=.18;},80);
    setTimeout(()=>{ambientLight.intensity=1.4;},140);
    setTimeout(()=>{ambientLight.intensity=.18;},200);
    Audio.playThunder();
    _stormFlashTimer=8+Math.random()*7;
  }
}
function updateRain(){
  if(!isRain)return;
  const ctx=rainCtx,w=rainCanvas.width,h=rainCanvas.height;
  ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='rgb(180,200,255)';ctx.lineWidth=1;
  // Batch rain into 3 alpha groups to minimize state changes
  const groups=[[],[]];
  for(let i=0;i<rainDrops.length;i++){
    const d=rainDrops[i];
    d.y+=d.spd;d.x+=1;
    if(d.y>h){d.y=0;d.x=Math.random()*w;}
    groups[d.alpha>.55?0:1].push(d);
  }
  groups.forEach((grp,gi)=>{
    if(!grp.length)return;
    ctx.globalAlpha=gi===0?.7:.35;
    ctx.beginPath();
    for(let i=0;i<grp.length;i++){const d=grp[i];ctx.moveTo(d.x,d.y);ctx.lineTo(d.x+2,d.y+d.len);}
    ctx.stroke();
  });
  ctx.globalAlpha=1;
}

// ══ CAR BUILDING ════════════════════════════
function makeWheel(radius,width,chromeMat,redMat){
  const g=new THREE.Group();
  const tire=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,width,20),
    new THREE.MeshLambertMaterial({color:0x111111}));
  tire.rotation.z=Math.PI/2;g.add(tire);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(radius*.52,radius*.52,width+.01,12),chromeMat);
  hub.rotation.z=Math.PI/2;g.add(hub);
  for(let s=0;s<5;s++){
    const ang=(s/5)*Math.PI*2;
    const spoke=new THREE.Mesh(new THREE.BoxGeometry(radius*.85,width*.65,.05),chromeMat);
    spoke.rotation.z=Math.PI/2;spoke.rotation.y=ang;g.add(spoke);
  }
  const caliper=new THREE.Mesh(new THREE.BoxGeometry(.14,.22,.20),redMat);
  caliper.position.set(0,-radius*.52,0);g.add(caliper);
  return g;
}
function makeCar(def){
  const g=new THREE.Group();
  const isF1=def.type==='f1',isMuscle=def.type==='muscle';
  const paint=new THREE.MeshLambertMaterial({color:def.color});
  const accent=new THREE.MeshLambertMaterial({color:def.accent});
  const glass=new THREE.MeshLambertMaterial({color:0x0a1a2a,transparent:true,opacity:.72});
  const chrome=new THREE.MeshLambertMaterial({color:0xdddddd});
  const blk=new THREE.MeshLambertMaterial({color:0x050505});
  const red=new THREE.MeshLambertMaterial({color:0xcc0000});
  const add=(geo,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{
    const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=true;g.add(m);return m;
  };
  if(isF1){
    add(new THREE.BoxGeometry(1.80,.28,4.5),paint,0,.14,0);
    const nc=new THREE.Mesh(new THREE.CylinderGeometry(.04,.38,1.6,10),paint);
    nc.rotation.z=Math.PI/2;nc.position.set(0,.14,-2.85);nc.castShadow=true;g.add(nc);
    add(new THREE.BoxGeometry(.72,.38,.85),blk,0,.50,.08);
    const halo=new THREE.Mesh(new THREE.TorusGeometry(.28,.03,6,14),chrome);halo.position.set(0,.68,.06);g.add(halo);
    add(new THREE.BoxGeometry(3.1,.06,.52),accent,0,.10,-2.22);
    add(new THREE.BoxGeometry(2.0,.07,.42),accent,0,.94,2.06);
    [-1,1].forEach(s=>add(new THREE.BoxGeometry(.06,.52,.44),accent,s*1.0,.72,2.06));
    [-1,1].forEach(s=>{
      add(new THREE.BoxGeometry(.54,.28,1.88),paint,s*.95,.16,.32);
      const ci=new THREE.Mesh(new THREE.CylinderGeometry(.16,.2,.1,10),blk);ci.rotation.z=Math.PI/2;ci.position.set(s*.98,.22,-.3);g.add(ci);
    });
    add(new THREE.BoxGeometry(.52,.20,1.4),paint,0,.46,.88);
  }else{
    const bL=isMuscle?4.35:4.05,bH=isMuscle?.68:.50;
    add(new THREE.BoxGeometry(1.94,bH,bL),paint,0,bH*.5,0);
    add(new THREE.BoxGeometry(1.90,bH*.52,1.55),paint,0,bH*.26,-bL*.28,-.06);
    const fb=new THREE.Mesh(new THREE.SphereGeometry(.48,10,7,0,Math.PI*2,0,Math.PI/2),paint);
    fb.scale.set(2.0,.55,1.0);fb.rotation.x=Math.PI;fb.position.set(0,.18,-bL*.5+.12);g.add(fb);
    add(new THREE.BoxGeometry(1.7,.14,1.0),blk,0,.06,bL*.5-.48);
    const cabZ=isMuscle?.22:0,cabH=isMuscle?.52:.48,cabL=isMuscle?1.85:1.65;
    add(new THREE.BoxGeometry(1.74,cabH,cabL),paint,0,bH+cabH*.5,cabZ);
    add(new THREE.BoxGeometry(1.58,.52,.07),glass,0,bH+cabH*.58,cabZ-(isMuscle?.95:.87),-.32);
    add(new THREE.BoxGeometry(1.48,.42,.07),glass,0,bH+cabH*.46,cabZ+(isMuscle?.95:.87),.30);
    [-0.98,.98].forEach(s=>add(new THREE.BoxGeometry(.07,.34,1.26),glass,s,bH+cabH*.6,cabZ));
    const wPosA=[[-.97,bL*.34],[.97,bL*.34],[-.97,-bL*.34],[.97,-bL*.34]];
    wPosA.forEach(([wx,wz])=>{
      const arch=new THREE.Mesh(new THREE.SphereGeometry(.54,10,6,0,Math.PI*2,0,Math.PI*.5),paint);
      arch.scale.set(1.08,.45,1.55);arch.position.set(wx,.36,wz);g.add(arch);
    });
    if(!isMuscle){
      add(new THREE.BoxGeometry(1.72,.066,.42),accent,0,bH+.72,bL*.5-.1);
      [-0.78,.78].forEach(s=>add(new THREE.BoxGeometry(.07,.3,.08),accent,s,bH+.56,bL*.5-.1));
    }else{
      add(new THREE.BoxGeometry(.56,.14,1.1),accent,0,bH+.05,-.92);
    }
    const hlm=new THREE.MeshLambertMaterial({color:0xfff8e8,emissive:0x886622});
    [-0.80,.80].forEach(s=>{const hl=new THREE.Mesh(new THREE.SphereGeometry(.14,8,6),hlm);hl.scale.set(1,.8,1.2);hl.position.set(s,bH*.62,-bL*.5+.05);g.add(hl);});
    const tlm=new THREE.MeshLambertMaterial({color:0xff0000,emissive:0xaa0000});
    [-0.80,.80].forEach(s=>{const tl=new THREE.Mesh(new THREE.BoxGeometry(.28,.12,.065),tlm);tl.position.set(s,bH*.58,bL*.5-.03);g.add(tl);});
    [-0.97,.97].forEach(s=>add(new THREE.BoxGeometry(.06,.04,bL*.75),blk,s,bH*.05,-.1));
    [-0.44,.44].forEach(s=>{const ex=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.5,8),chrome);ex.rotation.x=Math.PI/2;ex.position.set(s,.22,bL*.5);g.add(ex);});
  }
  const wP=isF1?[[-1.06,.30,-1.80],[1.06,.30,-1.80],[-1.06,.30,1.62],[1.06,.30,1.62]]
              :[[-0.98,.33,-1.38],[0.98,.33,-1.38],[-0.98,.33,1.38],[0.98,.33,1.38]];
  const wR=.33,wW=isF1?.40:.25;
  g.userData.wheels=[];
  wP.forEach(([wx,wy,wz])=>{
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(wR,wR,wW,16),new THREE.MeshLambertMaterial({color:0x090909}));
    tire.rotation.z=Math.PI/2;tire.position.set(wx,wy,wz);tire.castShadow=true;g.add(tire);
    const rim=new THREE.Mesh(new THREE.CylinderGeometry(wR*.64,wR*.64,wW+.01,12),chrome);
    rim.rotation.z=Math.PI/2;rim.position.set(wx,wy,wz);g.add(rim);
    for(let s=0;s<5;s++){
      const sp=new THREE.Mesh(new THREE.BoxGeometry(wR*1.05,.025,.036),new THREE.MeshLambertMaterial({color:0xcccccc}));
      sp.rotation.z=Math.PI/2;sp.rotation.y=(s/5)*Math.PI*2;sp.position.set(wx,wy,wz);g.add(sp);
    }
    const cal=new THREE.Mesh(new THREE.BoxGeometry(.08,.18,.22),red);cal.position.set(wx,wy-.08,wz);g.add(cal);
    g.userData.wheels.push(tire,rim);
  });
  if(g.userData.wheels&&g.userData.wheels.length>=4){
    g.userData.wheelFL=g.userData.wheels[0];
    g.userData.wheelFR=g.userData.wheels[1];
    g.userData.wheelRL=g.userData.wheels[2];
    g.userData.wheelRR=g.userData.wheels[3];
  }
  return g;
}

// ══ THRILL PARK WORLD ═════════════════════════
function _tpSpawnFirework(){
  const PN=_mobCount(55);
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(PN*3),vel=new Float32Array(PN*3),col=new Float32Array(PN*3);
  const cx=(Math.random()-.5)*520,cy=48+Math.random()*28,cz=(Math.random()-.5)*520;
  const palettes=[[1,.3,.5],[1,.8,.2],[.3,.8,1],[.7,.4,1],[1,.6,.2],[1,.2,.8]];
  const bc=palettes[Math.floor(Math.random()*palettes.length)];
  for(let i=0;i<PN;i++){
    pos[i*3]=cx;pos[i*3+1]=cy;pos[i*3+2]=cz;
    const th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1),s=6+Math.random()*5;
    vel[i*3]=Math.sin(ph)*Math.cos(th)*s;
    vel[i*3+1]=Math.cos(ph)*s;
    vel[i*3+2]=Math.sin(ph)*Math.sin(th)*s;
    col[i*3]=bc[0];col[i*3+1]=bc[1];col[i*3+2]=bc[2];
  }
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  const mat=new THREE.PointsMaterial({vertexColors:true,size:1.1,transparent:true,opacity:.9,sizeAttenuation:true});
  const mesh=new THREE.Points(geo,mat);scene.add(mesh);
  const pl=new THREE.PointLight(new THREE.Color(bc[0],bc[1],bc[2]),2.2,110);
  pl.position.set(cx,cy,cz);scene.add(pl);
  _tpFireworks.push({mesh:mesh,geo:geo,vel:vel,age:0,maxAge:1.7,light:pl});
}

// ══ SPAWN CARS ════════════════════════════════
function makeAllCars(){
  carObjs.forEach(c=>scene.remove(c.mesh));carObjs=[];
  _reverseLights.length=0;
  // Build ordered def list — player goes to pole, AI fill the rest
  const playerDef=CAR_DEFS.find(d=>d.id===selCarId)||CAR_DEFS[0];
  const orderedDefs=[playerDef,...CAR_DEFS.filter(d=>d.id!==selCarId)];

  // ── Per-world start T: always on the main straight approaching S/F ──────
  // Each world's straight is different. We use t=0.93..0.99 range for GP,
  // and similar near-0 ranges for other worlds — but always on straight sections.
  const _worldGridT={
    grandprix:0.955,  // GP final straight approaching t=0
    space:0.940,      // Space: last WP at ~0.94, straight into t=0
    deepsea:0.940,    // DeepSea: last WP at ~0.94, straight into t=0
    candy:0.940,      // Candy: last WP at ~0.96, straight into t=0
    neoncity:0.935,   // Neon City: last WP at ~0.94, straight into t=0
    volcano:0.940,
    arctic:0.940,
  };
  // How many track units between each grid row
  const _rowGap=0.014; // slightly wider gap for cleaner grid separation

  orderedDefs.forEach((def,i)=>{
    const mesh=makeCar(def);
    const row=Math.floor(i/2),col=i%2;
    // t decreases as we go further behind the S/F line
    const baseT=_worldGridT[activeWorld]||0.955;
    const t0=((baseT - row*_rowGap)+1)%1;
    const pt=trackCurve.getPoint(t0);
    const tg=trackCurve.getTangent(t0).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    // Clean F1-style 2-wide grid: left col slightly ahead (stagger)
    const colSign=col===0?-1:1;
    const lateralOffset=colSign*4.5;
    const fwdStagger=col===0?0.8:0; // left column (pole side) slightly ahead
    mesh.position.copy(pt)
      .addScaledVector(nr,lateralOffset)
      .addScaledVector(tg,fwdStagger);
    mesh.position.y=0.35;
    // Face exactly the track direction at this point
    mesh.rotation.set(0,Math.atan2(-tg.x,-tg.z),0);
    scene.add(mesh);
    const isPlayer=def.id===selCarId;if(isPlayer)playerIdx=carObjs.length;
    // Reverse light (red box at rear)
    const rlGeo=new THREE.BoxGeometry(.34,.1,.04);
    const rlMat=new THREE.MeshLambertMaterial({color:0xff2200,emissive:0xff2200,emissiveIntensity:0});
    const rl=new THREE.Mesh(rlGeo,rlMat);
    const bL=def.type==='muscle'?4.35:def.type==='f1'?4.5:4.05;
    rl.position.set(0,.28,bL*.5+.02);
    mesh.add(rl);
    _reverseLights.push(rl);
    // Small initial lateral offset so AI don't all drive on the exact center line
    // (kept near zero at start to prevent collision; grows naturally during race)
    const latOff=isPlayer?0:(col===0?-1.2:1.2)+(Math.random()-.5)*.8;
    const personality=_aiPersonality[def.id]||{aggr:.6,consist:.7};
    carObjs.push({mesh,speed:0,vy:0,progress:t0,prevProg:t0,lap:0,isPlayer,def,finished:false,
      boostTimer:0,spinTimer:0,inAir:false,lateralOff:latOff,bestLap:null,_lapStart:null,_finishTime:null,
      tireWear:0,hitCount:0,smokeSrc:null,_personality:personality});
  });
  // Reset nearest-miss cooldowns
  for(let i=0;i<carObjs.length;i++)_nearMissCooldown[i]=0;
  // Reset pit stop
  _pitStopActive=false;_pitStopTimer=0;_pitStopUsed=false;
  _overallFastestLap=Infinity;
  // Init near-miss cooldowns for all cars
  for(let i=0;i<CAR_DEFS.length;i++)_nearMissCooldown[i]=0;
}

// ══ PLAYER PHYSICS ══════════════════════════
function updatePlayer(dt){
  if(recoverActive)return;
  const car=carObjs[playerIdx];if(!car||car.finished)return;
  // Pit stop active — car is fully stopped, no input
  if(_pitStopActive){car.speed=0;return;}

  const acc=keys['ArrowUp']||keys['KeyW'];
  const brk=keys['ArrowDown']||keys['KeyS'];
  const lft=keys['ArrowLeft']||keys['KeyA'];
  const rgt=keys['ArrowRight']||keys['KeyD'];
  const hbk=keys['Space'];
  const nit=keys['KeyN'];

  // Nitro — longer duration + stronger boost (user-tuned: lasts ~5s instead of ~2.9s)
  const _prevNitro=nitroActive;
  nitroActive=false;
  // Final lap: nitro recharges 40% faster (push to the end)
  const finalLapBonus=car.lap>=TOTAL_LAPS?1.4:1;
  if(nit&&nitroLevel>0){nitroActive=true;nitroLevel=Math.max(0,nitroLevel-20*dt);}
  else{nitroLevel=Math.min(100,nitroLevel+16*dt*finalLapBonus);}
  if(nitroActive&&!_prevNitro){Audio.playNitro();onNitroActivate();Audio.setNitro(true);}
  if(!nitroActive&&_prevNitro&&musicSched&&musicSched.setNitro)musicSched.setNitro(false);
  if(_elNitro)_elNitro.style.height=nitroLevel+'%';

  const _dmgMult=1-Math.min(0.18,((car.hitCount||0)/6)*.18); // up to 18% speed penalty at 6 hits
  // Tire temperature grip modifier
  const _avgTemp=(_tireTemp.fl+_tireTemp.fr+_tireTemp.rl+_tireTemp.rr)*.25;
  const _tempGrip=_avgTemp<0.25?0.78+_avgTemp*.88: // cold tires — up to 22% penalty
                  _avgTemp<0.72?1.0:                 // optimal range
                  1.0-(_avgTemp-0.72)*0.5;           // overheated — up to 14% penalty
  let MAX=car.def.topSpd*_dmgMult*_tempGrip*(car.boostTimer>0?1.55:1)*(nitroActive?1.55:1);
  // Racing line grip bonus (main straight + key zones)
  let _gripZoneBonus=0;
  for(const [s,e,b] of GRIP_BONUS_ZONES){
    const inZ=s<e?(car.progress>=s&&car.progress<=e):(car.progress>=s||car.progress<=e);
    if(inZ){const offDist=trackDist(car.mesh.position,car.progress);if(offDist<TW*.55)_gripZoneBonus=b;}
  }
  MAX*=(1+_gripZoneBonus);
  // Rain reduces grip
  if(isRain)MAX*=.88;
  const ACC=car.def.accel,H=car.def.hdlg*(1-car.tireWear*.42)*(isRain?.72:1);

  if(acc)car.speed=Math.min(MAX,car.speed+ACC*dt*60);
  else if(brk)car.speed=Math.max(-MAX*.35,car.speed-ACC*2.4*dt*60);
  else car.speed*=Math.pow(.956,dt*60);
  if(hbk)car.speed*=Math.pow(.875,dt*60);
  if(Math.abs(car.speed)<.0008)car.speed=0;

  if(hbk&&Math.abs(car.speed)>.5){addSkidMark(car);if(Math.random()<.22)Audio.playScreech();}
  // Skid marks on hard braking
  if(brk&&Math.abs(car.speed)>.95&&Math.random()<.28){addSkidMark(car,0.55);}
  // Tire smoke on hard braking
  if(brk&&Math.abs(car.speed)>.8&&Math.random()<.18){
    exhaustSystem.emit(car.mesh.position.x,car.mesh.position.y+.15,car.mesh.position.z,(Math.random()-.5)*.04,.02,(Math.random()-.5)*.04,2,.9,.9,.9,.5);
  }
  // Water spray in rain
  if(isRain&&Math.abs(car.speed)>.5&&Math.random()<.22){
    exhaustSystem.emit(car.mesh.position.x,car.mesh.position.y+.1,car.mesh.position.z,(Math.random()-.5)*.08,.06+Math.random()*.04,(Math.random()-.5)*.08,3,.7,.8,1,.35);
  }
  // Suspension vertical bounce — subtle at speed, feels alive
  if(!car.inAir){
    car.mesh.position.y=.35+Math.sin(_nowSec*Math.abs(car.speed)*18)*.0025*Math.abs(car.speed);
  }

  // Drift detection + mini-turbo
  if(hbk&&Math.abs(car.speed)>.8){
    driftTimer+=dt;driftScore=Math.floor(driftTimer*120);
    if(driftTimer>.3)showPopup('DRIFT! +'+driftScore,'#ff8800');
    if(driftTimer>=1.5)_miniTurboReady=true;
  }else{
    if(driftTimer>1){
      showPopup('DRIFT! +'+driftScore+' pts','#ff8800',1200);
      floatText('DRIFT +'+driftScore,'#ff8800',innerWidth*.5,innerHeight*.6);
      totalScore+=driftScore;
    }
    if(_miniTurboReady&&!hbk&&driftTimer>0){
      // Mini-turbo burst on drift release
      car.boostTimer=Math.max(car.boostTimer,.6+driftTimer*.15);
      showPopup('MINI TURBO! 🔥','#ff4400',900);
      floatText('🔥 TURBO!','#ff4400',innerWidth*.5,innerHeight*.55);
      _miniTurboReady=false;
    }
    driftTimer=0;driftScore=0;
  }

  // Spin pad effect
  if(car.spinTimer>0){
    car.mesh.rotation.y+=.12*(car.speed>0?1:-1);
    car.spinTimer-=dt;
  }else{
    const sf=H*Math.max(.42,1-Math.abs(car.speed)/car.def.topSpd*.32);
    if(lft)car.mesh.rotation.y+=sf*dt*60;
    if(rgt)car.mesh.rotation.y-=sf*dt*60;
  }

  // Car body tilt — lean into corners, pitch on braking/accel
  const _steerDir=(lft?1:rgt?-1:0);
  const _speedFactor=Math.min(1,Math.abs(car.speed)/car.def.topSpd);
  const _targetTiltZ=_steerDir*(0.10+_speedFactor*0.09)+(hbk?_steerDir*0.10:0)+(driftTimer>0.2?_steerDir*0.06:0);
  const _targetTiltX=acc?(-0.05-_speedFactor*0.025):brk?0.09:0;
  car.mesh.rotation.z+=(_targetTiltZ-car.mesh.rotation.z)*Math.min(1,dt*7);
  car.mesh.rotation.x+=(_targetTiltX-car.mesh.rotation.x)*Math.min(1,dt*6);

  // Jump / gravity
  if(car._fallingIntoSpace){
    // Falling into the void — skip normal floor check, updateSpaceWorld handles recovery
  }else if(car.inAir||car.vy!==0){
    const gravStrength=activeWorld==='space'?13:activeWorld==='deepsea'?13:22; // lower gravity in space/water
    car.vy-=gravStrength*dt;
    car.mesh.position.y+=car.vy*dt;
    if(car.mesh.position.y<=.35&&car.vy<0){
      const landSpeed=Math.abs(car.vy);
      car.mesh.position.y=.35;car.vy=0;car.inAir=false;
      camShake=0.18+landSpeed*.012;
      if(landSpeed>14)showPopup('💥 HARD LANDING!','#ffaa00',600);
      Audio.playLand();
      _plBk.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
      sparkSystem.emit(car.mesh.position.x,.5,car.mesh.position.z,-_plBk.x*.05,0,-_plBk.z*.05,20,.6,.5,.4,.8);
    }
  }
  // (Grounded state handled earlier — lines 6944-6948 already set Y from ramp/bounce)

  // Move — reuse pre-allocated _plFwd/_plBk to avoid GC
  _plFwd.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
  const fwd=_plFwd;
  car.mesh.position.addScaledVector(fwd,car.speed);

  // Exhaust particles
  if(Math.abs(car.speed)>.05&&Math.random()>.6){
    _plBk.copy(_plFwd).negate();
    const bk=_plBk;
    exhaustSystem.emit(
      car.mesh.position.x+bk.x*2,car.mesh.position.y+.3,car.mesh.position.z+bk.z*2,
      bk.x*.04+((Math.random()-.5)*.02),(.02+Math.random()*.04),bk.z*.04+((Math.random()-.5)*.02),
      2,.5,.4,.38,.8);
  }
  // Nitro flame trail — bright orange/blue flame cone
  if(nitroActive){
    _plBk.copy(_plFwd).negate();
    const bk=_plBk;
    if(Math.random()>.15){
      // Main flame — orange to white
      sparkSystem.emit(
        car.mesh.position.x+bk.x*2.0,car.mesh.position.y+.22,car.mesh.position.z+bk.z*2.0,
        bk.x*.18+(Math.random()-.5)*.06,.01+Math.random()*.06,bk.z*.18+(Math.random()-.5)*.06,
        5,1,.5+Math.random()*.4,0,.28);
    }
    if(Math.random()>.55){
      // Inner blue core
      sparkSystem.emit(
        car.mesh.position.x+bk.x*1.5,car.mesh.position.y+.2,car.mesh.position.z+bk.z*1.5,
        bk.x*.08+(Math.random()-.5)*.03,.005+Math.random()*.04,bk.z*.08+(Math.random()-.5)*.03,
        2,.3,.5,1,.22);
    }
  }

  // Boost timer
  if(car.boostTimer>0)car.boostTimer-=dt;

  // Slipstream: close behind another car
  slipTimer=0;
  let slipping=false;
  carObjs.forEach((other,i)=>{
    if(i===playerIdx)return;
    const dx=car.mesh.position.x-other.mesh.position.x,dz=car.mesh.position.z-other.mesh.position.z;
    _slipFwd.set(0,0,-1).applyQuaternion(other.mesh.quaternion);
    const d2=dx*dx+dz*dz;
    if(d2<64){// 8² — skip sqrt until needed
      _slipDir.set(-dx,0,-dz).normalize();
      if(_slipDir.dot(_slipFwd)>.7){slipping=true;}
    }
  });
  if(slipping){
    car.speed=Math.min(MAX*1.12,car.speed+.004);
    if(_elSlip)_elSlip.style.display='block';
    _drsActive=true;
    if(_drsEl)_drsEl.style.display='block';
  }else{
    if(_elSlip)_elSlip.style.display='none';
    _drsActive=false;
    if(_drsEl)_drsEl.style.display='none';
  }
  // Near-miss bonus: close pass without collision
  if(_raceStartGrace<=0){
    carObjs.forEach((other,i)=>{
      if(i===playerIdx)return;
      const dx=car.mesh.position.x-other.mesh.position.x,dz=car.mesh.position.z-other.mesh.position.z;
      const dist=Math.sqrt(dx*dx+dz*dz);
      const relSpd=Math.abs(car.speed-other.speed);
      if(dist>2.5&&dist<4.5&&relSpd>.12&&(_nearMissCooldown[i]||0)<=0){
        _nearMissCooldown[i]=3; // 3s cooldown
        const bonus=Math.round(80+relSpd*300);
        totalScore+=bonus;
        floatText('⚡ NEAR MISS +'+bonus,'#ffdd00',innerWidth*.5,innerHeight*.4);
        triggerCombo('NEAR MISS');
        beep(880,.06,.18,0,'sine');beep(1320,.05,.12,.06,'sine');
        if(Math.random()<.4)Audio.playCrowdCheer();
      }
      if((_nearMissCooldown[i]||0)>0)_nearMissCooldown[i]-=dt;
    });
  }

  // Off-track slowdown — friction and popup text vary per world
  if(!car.inAir&&!recoverActive){
    const offDist=trackDist(car.mesh.position,car.progress);
    if(offDist>TW){
      const overRatio=Math.min(1,(offDist-TW)/8);
      if(activeWorld==='space'){
        // Moon dust: lighter grip loss on low-gravity regolith
        car.speed*=Math.pow(1-overRatio*.09,dt*60);
        if(offDist>TW+4&&Math.random()<.03)showPopup('MOON DUST!','#aaaadd',400);
      } else if(activeWorld==='deepsea'){
        // Seabed sand: moderate drag, sea current adds gentle push
        car.speed*=Math.pow(1-overRatio*.13,dt*60);
        if(offDist>TW+4&&Math.random()<.04)showPopup('SEABED!','#44ddbb',400);
      } else if(activeWorld==='candy'){
        // Frosting: sticky sugar slows you down!
        car.speed*=Math.pow(1-overRatio*.22,dt*60);
        if(offDist>TW+4&&Math.random()<.05)showPopup('FROSTING! 🧁','#ff66aa',400);
      } else {
        // Grand Prix: classic grass friction
        car.speed*=Math.pow(1-overRatio*.18,dt*60);
        if(offDist>TW+4&&Math.random()<.04)showPopup('GRASS!','#88dd44',400);
      }
    }
  }

  // ── Tire wear ──────────────────────────────
  if(Math.abs(car.speed)>.15)car.tireWear=Math.min(1,car.tireWear+Math.abs(car.speed)*.000055*dt*60);
  // Pit lane recovery — zone along main straight near pit building (z 178-212)
  const _pz=car.mesh.position.z,_px=car.mesh.position.x;
  if(_pz>178&&_pz<212&&_px>-188&&_px<172&&car.tireWear>0.02){
    car.tireWear=Math.max(0,car.tireWear-.18*dt);
    if(car.tireWear<.04&&car.tireWear>0){car.tireWear=0;showPopup('🔧 FRESH TYRES!','#00ee88',1100);}
  }
  // Worn tire warning (once per threshold crossing, 2s cooldown)
  _tireWarnCooldown=Math.max(0,_tireWarnCooldown-dt);
  if(car.tireWear>.72&&_tireWarnCooldown<=0){showPopup('⚠ TYRES WORN','#ffbb00',900);_tireWarnCooldown=8;}

  // ── Tire temperature heating / cooling ─────
  const spd=Math.abs(car.speed);
  const heatRate=spd*.008*(isRain?.55:1)*(hbk?2.5:1)*(brk&&spd>.6?1.8:1);
  const coolRate=0.006+(_weatherMode==='snow'?.012:0);
  // Front tires heat from cornering + braking, rears from power/drift
  const steerHeat=(lft||rgt)?0.012:0;
  _tireTemp.fl=Math.max(0,Math.min(1,_tireTemp.fl+heatRate*dt+steerHeat*dt-coolRate*dt));
  _tireTemp.fr=Math.max(0,Math.min(1,_tireTemp.fr+heatRate*dt+steerHeat*dt-coolRate*dt));
  _tireTemp.rl=Math.max(0,Math.min(1,_tireTemp.rl+(acc?heatRate*.9:heatRate*.4)*dt+(hbk?.018:0)*dt-coolRate*dt));
  _tireTemp.rr=Math.max(0,Math.min(1,_tireTemp.rr+(acc?heatRate*.9:heatRate*.4)*dt+(hbk?.018:0)*dt-coolRate*dt));
  // Warn on extremely cold tires at race start
  if(car.lap===1&&_avgTemp<0.12&&spd>.3&&Math.random()<.004)showPopup('❄ COLD TYRES — WARM UP!','#88bbff',1200);

  // ── Brake heat visual (orange sparks at wheels on hard braking) ─
  if(brk&&spd>.8&&Math.random()<.22){
    _plBk.set(0,0,-1).applyQuaternion(car.mesh.quaternion).negate();
    _plRt.set(1,0,0).applyQuaternion(car.mesh.quaternion);
    const bk2=_plBk,rt2=_plRt;
    [-1,1].forEach(s=>{
      sparkSystem.emit(
        car.mesh.position.x+rt2.x*s*.95+bk2.x*1.4, car.mesh.position.y+.22,
        car.mesh.position.z+rt2.z*s*.95+bk2.z*1.4,
        rt2.x*s*.03+bk2.x*.04, .01+Math.random()*.04, rt2.z*s*.03+bk2.z*.04,
        2, 1, .35+Math.random()*.25, 0, .28
      );
    });
  }

  // ── Speed trap (S/F straight, progress ~0.01) ──────────────────
  if(car.progress<0.025&&car.progress>0.005&&spd>.8){
    const kmh=Math.round(spd*60*38*(car.boostTimer>0?1.3:1)*(nitroActive?1.4:1));
    if(kmh>_speedTrapMax){
      _speedTrapMax=kmh;
      if(kmh>_speedTrapAllTime){_speedTrapAllTime=kmh;}
      const el=document.getElementById('speedTrapEl');
      if(el&&!_speedTrapFired){
        _speedTrapFired=true;
        el.innerHTML='⚡ SPEED TRAP<br>'+kmh+' km/h'+(kmh===_speedTrapAllTime?'<br>🏆 SESSION BEST':'');
        el.style.display='block';
        setTimeout(()=>{el.style.display='none';_speedTrapFired=false;},2200);
      }
    }
  }else if(car.progress>0.04){_speedTrapFired=false;}

  // ── Turbo spool effect (lift then reapply at speed) ─────────────
  const nowBraking=brk&&spd>.5;
  if(_wasBraking&&acc&&!brk&&spd>.5){
    // Transition: was braking, now accelerating
    if(audioCtx&&Math.random()>.5){
      const t2=audioCtx.currentTime;
      const o=audioCtx.createOscillator(),g2=audioCtx.createGain(),f2=audioCtx.createBiquadFilter();
      o.type='sawtooth';f2.type='bandpass';f2.frequency.value=900;f2.Q.value=2;
      o.frequency.setValueAtTime(280,t2);o.frequency.exponentialRampToValueAtTime(680,t2+.18);
      g2.gain.setValueAtTime(.045,t2);g2.gain.exponentialRampToValueAtTime(.001,t2+.22);
      o.connect(f2);f2.connect(g2);g2.connect(_dst());o.start(t2);o.stop(t2+.24);
    }
  }
  _wasBraking=nowBraking;

  updateEngine(car.speed);
  spinWheels(car);
  tickProgress(car);
}

// ══ AI ═══════════════════════════════════════
function updateAI(car,dt){
  if(car.finished)return;
  const player=carObjs[playerIdx];
  const pers=car._personality||{aggr:.6,consist:.7};
  let spdMult=1;
  if(player){
    // gap = how far ahead player is (positive = player ahead)
    let _pProg=player.progress,_aiProg=car.progress;
    if(_aiProg>.85&&_pProg<.15)_pProg+=1.0;
    if(_pProg>.85&&_aiProg<.15)_aiProg+=1.0;
    const gap=(player.lap-car.lap)+(_pProg-_aiProg);
    // Rubber band scaled by aggression: aggressive AIs catch up harder
    const rbStr=0.9+pers.aggr*.28;
    if(gap>1.5)spdMult=rbStr;
    else if(gap>.5)spdMult=.97+pers.aggr*.12;
    else if(gap<-1.5)spdMult=.84+(1-pers.aggr)*.08;
    else if(gap<-.5)spdMult=.93+(1-pers.aggr)*.06;
    // Consistent drivers don't fall as far behind
    if(gap<0)spdMult=Math.max(spdMult,1-(.08*(1-pers.consist)));
    const diffRbCap=[0.85,1.05,1.22][difficulty]||1.05;
    spdMult=Math.min(spdMult,diffRbCap);
  }
  const la=.018,tProg=(car.progress+la)%1;
  // Use pre-allocated vectors — zero heap allocs per AI car per frame
  trackCurve.getPoint(tProg,_aiBase);
  if(car.lateralOff){
    trackCurve.getTangent(tProg,_aiTg);_aiTg.normalize();
    _aiNr.set(-_aiTg.z,0,_aiTg.x);
    _aiBase.addScaledVector(_aiNr,car.lateralOff);
  }
  _aiFwd.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
  _aiToT.set(_aiBase.x-car.mesh.position.x,0,_aiBase.z-car.mesh.position.z).normalize();
  _aiCross.copy(_aiFwd).cross(_aiToT);
  car.mesh.rotation.y+=_aiCross.y*car.def.hdlg*1.78*dt*60;
  // AI car body tilt — lean into corners based on yaw rate
  car._prevRotY??=car.mesh.rotation.y;
  const _aiYawD=car.mesh.rotation.y-car._prevRotY;
  car._prevRotY=car.mesh.rotation.y;
  const _aiSpeedF=Math.min(1,car.speed/(car.def.topSpd*.8));
  const _aiTgtZ=Math.max(-.16,Math.min(.16,-_aiYawD/Math.max(dt,.008)*(.32+_aiSpeedF*.14)));
  car.mesh.rotation.z+=(_aiTgtZ-car.mesh.rotation.z)*Math.min(1,dt*6);
  trackCurve.getTangent(car.progress,_aiCurA);
  trackCurve.getTangent((car.progress+.04)%1,_aiCurB);
  const curv=Math.max(0,1-_aiCurA.dot(_aiCurB));
  const tspd=car.def.topSpd*spdMult*DIFF_MULT[difficulty]*Math.max(.38,1-curv*8.5)*(car.boostTimer>0?1.4:1);
  if(car.speed<tspd)car.speed=Math.min(tspd,car.speed+car.def.accel*dt*60);
  else car.speed=Math.max(tspd,car.speed-car.def.accel*2*dt*60);
  // Mild random speed variation per car for natural feel
  car.speed*=1+Math.sin(Date.now()*.0009+car.def.id*2.3)*.018;
  // Occasional mistake — frequency inversely proportional to consistency
  car._mtimer=(car._mtimer||0)-dt;
  const mistakeChance=0.08+(1-pers.consist)*.3;
  if(car._mtimer<=0){car._mtimer=6+pers.consist*12+Math.random()*10;car._mActive=curv>.012&&Math.random()<mistakeChance?(.25+Math.random()*.5):0;}
  if((car._mActive||0)>0){car._mActive-=dt;car.mesh.rotation.y+=(Math.random()-.5)*.04*(1+pers.aggr*.5);car.speed*=.991;}
  // AI jump handling (proper per-car physics)
  if(car.inAir){
    car.vy-=22*dt;
    car.mesh.position.y+=car.vy*dt;
    if(car.mesh.position.y<=.35&&car.vy<0){
      car.mesh.position.y=.35;car.vy=0;car.inAir=false;
    }
  }else{
    car.mesh.position.y=.35;
    if(car._rampCooldown>0)car._rampCooldown-=dt;
    // AI launchpad trigger — same flat-pad logic as player
    else {
      const _aiFwdR=_aiFwdRV.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
      jumpRamps.forEach(ramp=>{
        if(car._rampCooldown>0)return;
        const dx=car.mesh.position.x-ramp.pos.x,dz=car.mesh.position.z-ramp.pos.z;
        const along=dx*ramp.tg.x+dz*ramp.tg.z;
        const perp=Math.abs(-dx*ramp.tg.z+dz*ramp.tg.x);
        const halfLen=ramp.len*.5;
        if(perp<ramp.width*.5&&along>-halfLen&&along<halfLen){
          const mDot=(_aiFwdR.x*ramp.tg.x+_aiFwdR.z*ramp.tg.z)*(car.speed>=0?1:-1);
          if(mDot>.1&&Math.abs(car.speed)>.25){
            car.vy=Math.abs(car.speed)*10+ramp.launchV*1.2+5;
            car.inAir=true;car._rampCooldown=1.2;
          }
        }
      });
    }
  }
  // AI overtaking: if player is just ahead on track, try to go around
  const player2=carObjs[playerIdx];
  if(player2&&!car.finished&&pers.aggr>.5){
    const pdx=car.mesh.position.x-player2.mesh.position.x,pdz=car.mesh.position.z-player2.mesh.position.z;
    const pDist=Math.sqrt(pdx*pdx+pdz*pdz);
    const sameLap=Math.abs(car.lap-player2.lap)<1;
    // No lateral maneuvers during race start grace — cars drive straight ahead
    if(_raceStartGrace<=0){
      if(pDist<7&&sameLap&&car.speed>player2.speed*.98){
        // Decide which side to pass on (perpendicular to own forward)
        if(!car._passAttemptTimer||car._passAttemptTimer<=0){
          const crossVal=_aiFwd.x*pdz-_aiFwd.z*pdx;
          car._passSide=(crossVal>0?1:-1)*(pers.aggr>.8?1.6:1.0);
          car._passAttemptTimer=3.5+Math.random()*2;
        }
      }
      if((car._passAttemptTimer||0)>0){
        car._passAttemptTimer-=dt;
        const targetOff=car.lateralOff+(car._passSide||0)*5.5;
        car.lateralOff+=(targetOff-car.lateralOff)*Math.min(1,dt*1.2);
      } else if(pDist>12){
        car.lateralOff*=Math.pow(.92,dt*60);
      }
    } else {
      // During start grace: reset any pending pass attempts
      car._passAttemptTimer=0;
    }
  }
  _aiFwd.set(0,0,-1).applyQuaternion(car.mesh.quaternion); // recompute after rotation
  car.mesh.position.addScaledVector(_aiFwd,car.speed);
  if(car.boostTimer>0)car.boostTimer-=dt;
  spinWheels(car);tickProgress(car);
}

function spinWheels(car){if(!car.mesh.userData.wheels)return;car.mesh.userData.wheels.forEach(w=>{w.rotation.x+=car.speed*.55;});}

// ══ SPECIAL OBJECT CHECKS ════════════════════
function checkJumps(){
  const car=carObjs[playerIdx];if(!car||recoverActive||car.inAir)return;
  const _jFwd=_jFwdV.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
  const motionSign=car.speed>=0?1:-1;
  jumpRamps.forEach(ramp=>{
    if(car._rampCooldown>0)return;
    const dx=car.mesh.position.x-ramp.pos.x,dz=car.mesh.position.z-ramp.pos.z;
    const along=dx*ramp.tg.x+dz*ramp.tg.z;
    const perp=Math.abs(-dx*ramp.tg.z+dz*ramp.tg.x);
    const halfLen=ramp.len*.5;
    // Simple trigger zone — no surface-following, no physical ramp to drive up
    if(perp<ramp.width*.5&&along>-halfLen&&along<halfLen){
      const motionDot=(_jFwd.x*ramp.tg.x+_jFwd.z*ramp.tg.z)*motionSign;
      if(motionDot>.1&&Math.abs(car.speed)>.25){
        // LAUNCH: strong vy + slight forward boost + nose tilt up
        car.vy=Math.abs(car.speed)*11+ramp.launchV*1.3+6;
        car.mesh.rotation.x=-0.22;
        car.inAir=true;
        car._rampCooldown=1.2;
        Audio.playJump();showPopup(ramp.label,'#00ccff',1000);
        sparkSystem.emit(car.mesh.position.x,car.mesh.position.y+.2,car.mesh.position.z,0,.3,0,28,.9,.6,1,.8);
      }
    }
  });
  if(car._rampCooldown>0)car._rampCooldown-=1/60; // rough frame decrement
}

function checkSpinPads(dt){
  const car=carObjs[playerIdx];if(!car||recoverActive)return;
  spinPads.forEach(pad=>{
    // Animate disc + ring pulse
    pad.disc.rotation.y+=2.5*dt;
    const _rs=1+.08*Math.sin(_nowSec*3+pad.pos.x*.1);
    pad.ring.scale.setScalar(_rs);
    pad.ring.material.emissiveIntensity=.5+.5*Math.sin(_nowSec*2.5+pad.pos.z*.1);
    const dx=car.mesh.position.x-pad.pos.x,dz=car.mesh.position.z-pad.pos.z;
    if(dx*dx+dz*dz<pad.radius*pad.radius&&car.spinTimer<=0){
      car.spinTimer=1.0;
      Audio.playSpin();showPopup('SPINNING! 🌀','#aa44ff',1200);
      sparkSystem.emit(pad.pos.x,.5,pad.pos.z,0,.05,0,20,.6,.2,1,.6);
    }
  });
}

function checkBoostPads(){
  // Pulsing glow on all boost pads
  const pulse=.5+.5*Math.sin(_nowSec*4);
  boostPads.forEach(pad=>{pad.strip.material.emissiveIntensity=.4+.9*pulse;pad.strip.material.opacity=.58+.24*pulse;});
  const car=carObjs[playerIdx];if(!car||recoverActive)return;
  boostPads.forEach(pad=>{
    const dx=car.mesh.position.x-pad.pos.x,dz=car.mesh.position.z-pad.pos.z;
    const bR=pad.radius*.8,bR2=bR*bR;
    if(dx*dx+dz*dz<bR2&&car.boostTimer<=0){
      car.boostTimer=2.0;car.speed=Math.min(car.def.topSpd*1.55,car.speed+.4);
      totalScore+=10;
      Audio.playBoost();showPopup('BOOST! ⚡','#00ffff',800);
      sparkSystem.emit(car.mesh.position.x,.4,car.mesh.position.z,0,.06,0,18,.3,.9,1,.5);
      if(Math.random()<.55)Audio.playCrowdCheer();
    }
    // Boost AI cars too
    for(let i=0;i<carObjs.length;i++){
      if(i===playerIdx)continue;
      const dx2=carObjs[i].mesh.position.x-pad.pos.x,dz2=carObjs[i].mesh.position.z-pad.pos.z;
      if(dx2*dx2+dz2*dz2<bR2&&carObjs[i].boostTimer<=0) carObjs[i].boostTimer=2;
    }
  });
}

function checkCollectibles(){
  const car=carObjs[playerIdx];if(!car)return;
  const now=_nowSec;
  collectibles.forEach(c=>{
    if(c.collected){
      if(now>c.respawn){c.collected=false;c.mesh.visible=true;if(c.light)c.light.visible=true;}
      return;
    }
    c.mesh.rotation.y+=.045;c.mesh.position.y=c.pos.y+Math.sin(now*2+c.pos.x)*.32;
    // New structure: [0]core [1]coin [2]halo [3]orbit [4]star/plus [5]beam [6]groundRing
    const ch=c.mesh.children;
    if(ch){
      if(ch[2])ch[2].rotation.z+=.024;            // halo tilts
      if(ch[3])ch[3].rotation.z+=.036;            // orbit ring spins
      if(ch[4])ch[4].rotation.y-=.06;             // star counter-spin
    }
    if(c.type==='score'){
      const pulse=Math.sin(now*3.2+c.pos.x*.5);
      c.mesh.scale.setScalar(1+pulse*.10);
      if(c.light)c.light.intensity=1.8+pulse*0.8;
    }else{
      // Repair kit: slower pulse, green flicker
      const pulse=Math.sin(now*2.4+c.pos.z*.4);
      if(c.light)c.light.intensity=1.2+pulse*0.6;
    }
    const dx=car.mesh.position.x-c.pos.x,dz=car.mesh.position.z-c.pos.z;
    if(dx*dx+dz*dz<c.radius*c.radius){
      c.collected=true;c.mesh.visible=false;if(c.light)c.light.visible=false;c.respawn=now+(c.type==='repair'?15:10);
      Audio.playCollect();
      sparkSystem.emit(c.pos.x,c.pos.y,c.pos.z,0,.06,0,16,
        c.type==='repair'?.1:.9, c.type==='repair'?.9:.9, c.type==='repair'?.2:.2,.8);
      if(c.type==='repair'){
        car.hitCount=Math.max(0,(car.hitCount||0)-2);
        car.tireWear=Math.max(0,(car.tireWear||0)-.35);
        showPopup('🔧 REPAIRS +50','#00ff88',1100);
        floatText3D('🔧 REPAIRS!','#00ff88',c.pos);
        totalScore+=50;
      }else{
        totalScore+=100;
        showPopup('⭐ +100 PTS!','#ffdd00',900);
        floatText3D('+100 ⭐','#ffdd00',c.pos);
      }
    }
  });
}

// ══ TRACK LIMITS ════════════════════════════
function trackDist(pos,progressHint){
  // Windowed search using car's known progress as hint — much faster than full scan
  const L=curvePts.length,win=Math.floor(L*.1);
  const start=Math.round((progressHint||0)*(L-1));
  let best=Infinity;
  for(let d=-win;d<=win;d++){
    const i=((start+d)%L+L)%L;
    const dx=pos.x-curvePts[i].x,dz=pos.z-curvePts[i].z;
    const dist=dx*dx+dz*dz;if(dist<best)best=dist;
  }
  return Math.sqrt(best);
}
function checkTrackLimits(dt){
  const car=carObjs[playerIdx];if(!car||car.finished)return;
  if(recoverActive){recoverTimer-=dt;if(recoverTimer<=0){recoverActive=false;hideBanner();}return;}
  if(car._fallingIntoSpace)return; // handled by updateSpaceWorld
  if(car.inAir)return;
  const d=trackDist(car.mesh.position,car.progress);
  if(activeWorld==='space'){
    // In space: going off edge starts a fall rather than instant recovery
    if(d>RECOVER_DIST)triggerSpaceFall(car);
    else if(d>WARN_DIST){if(_elWarn)_elWarn.style.display='block';}
    else{if(_elWarn)_elWarn.style.display='none';}
  }else if(activeWorld==='deepsea'){
    if(d>RECOVER_DIST)triggerDeepSeaRecovery(car);
    else if(d>WARN_DIST){if(_elWarn)_elWarn.style.display='block';}
    else{if(_elWarn)_elWarn.style.display='none';}
  }else{
    if(d>RECOVER_DIST)triggerRecovery(car);
    else if(d>WARN_DIST){if(_elWarn)_elWarn.style.display='block';}
    else{if(_elWarn)_elWarn.style.display='none';}
  }
}
function triggerRecovery(car){
  recoverActive=true;recoverTimer=2.2;car.speed=0;car.vy=0;car.inAir=false;
  if(_elWarn)_elWarn.style.display='none';
  if(_elWrongWay)_elWrongWay.style.display='none';
  _wrongWayTimer=0;
  // Use car.progress (tracks actual race direction) so the car always faces forward
  const t=car.progress;
  const pt=trackCurve.getPoint(t);
  const tgR=trackCurve.getTangent(t).normalize();
  car.mesh.position.copy(pt);car.mesh.position.y=.35;
  car.mesh.rotation.set(0,Math.atan2(-tgR.x,-tgR.z),0); // clean Euler — avoids gimbal-lock steering flip
  const off=new THREE.Vector3(0,5.8,13.5).applyQuaternion(car.mesh.quaternion);camPos.copy(car.mesh.position).add(off);
  camShake=.5;Audio.playRecovery();showBanner('RECOVERED','#ff4400',2000);
  spawnSafetyCar((car.progress+.055)%1);
}
function triggerDeepSeaRecovery(car){
  recoverActive=true;recoverTimer=2.0;car.speed=0;car.vy=0;car.inAir=false;
  if(_elWarn)_elWarn.style.display='none';
  if(_elWrongWay)_elWrongWay.style.display='none';
  _wrongWayTimer=0;
  const t=car.progress;
  const pt=trackCurve.getPoint(t);
  const tgR=trackCurve.getTangent(t).normalize();
  car.mesh.position.copy(pt);car.mesh.position.y=.35;
  car.mesh.rotation.set(0,Math.atan2(-tgR.x,-tgR.z),0);
  const off=new THREE.Vector3(0,5.8,13.5).applyQuaternion(car.mesh.quaternion);
  camPos.copy(car.mesh.position).add(off);
  camShake=.4;Audio.playRecovery();
  showBanner('🐠 RESCUED BY DOLPHINS','#00ddaa',2000);
  // Bubble burst at recovery point
  sparkSystem.emit(pt.x,.5,pt.z,0,.14,0,20,.2,.9,.9,1);
}
function checkCollisions(dt){
  const player=carObjs[playerIdx];if(!player)return;
  if(_raceStartGrace>0){_raceStartGrace-=dt;return;} // Grace period at race start
  carObjs.forEach((other,i)=>{
    if(i===playerIdx)return;
    const dx=player.mesh.position.x-other.mesh.position.x,dz=player.mesh.position.z-other.mesh.position.z;
    const dist=Math.sqrt(dx*dx+dz*dz);
    if(dist<2.4&&dist>.01){
      const nx=dx/dist,nz=dz/dist;
      const relSpd=Math.abs(player.speed-other.speed);
      player.mesh.position.x+=nx*.6;player.mesh.position.z+=nz*.6;
      other.mesh.position.x-=nx*.6;other.mesh.position.z-=nz*.6;
      player.speed*=.70;other.speed*=.70;
      const heavy=relSpd>.18;
      camShake=heavy?.88:.42;
      Audio.playCollision();
      const eX=player.mesh.position.x,eZ=player.mesh.position.z;
      sparkSystem.emit(eX,.5,eZ,nx*.05,.06,nz*.05,heavy?36:16,1,.65,.1,.45);
      if(heavy){
        // Additional white impact sparks + float text
        sparkSystem.emit(eX,.6,eZ,(Math.random()-.5)*.1,.1+Math.random()*.06,(Math.random()-.5)*.1,18,1,1,1,.7);
        floatText('💥 CONTACT!','#ff4400',innerWidth*.5,innerHeight*.45);
      }
      if(heavy){
        _colFlashT=0.42;
        player.hitCount=(player.hitCount||0)+1;
        if(player.hitCount===3&&_contactPopupCD<=0){showPopup('⚠ DAMAGE!','#ff4400',1000);_contactPopupCD=3;}
        if(player.hitCount===6&&_contactPopupCD<=0){showPopup('🔥 CRITICAL DAMAGE!','#ff2200',1200);_contactPopupCD=3;}
        if(_contactPopupCD<=0){showPopup('CONTACT! 💥','#ff4400',500);_contactPopupCD=3;}
      }else{
        if(_contactPopupCD<=0){showPopup('CONTACT! 💥','#ffcc00',400);_contactPopupCD=3;}
      }
    }
  });
}
function checkWrongWay(dt){
  const car=carObjs[playerIdx];if(!car||car.finished||recoverActive)return;
  if(_raceStartGrace>0)return;
  // Compare car's forward direction with track tangent at current progress
  const tg=trackCurve.getTangent(car.progress);
  const fwdX=Math.sin(-car.mesh.rotation.y),fwdZ=-Math.cos(car.mesh.rotation.y);
  const dot=fwdX*tg.x+fwdZ*tg.z;
  const spd=Math.abs(car.speed);
  if(dot<-0.45&&spd>.35){
    _wrongWayTimer+=dt;
    if(_wrongWayTimer>.6&&_elWrongWay)_elWrongWay.style.display='block';
  }else{
    _wrongWayTimer=0;
    if(_elWrongWay)_elWrongWay.style.display='none';
  }
}

function nearestT(pos,hint=null){
  const L=curvePts.length;
  if(hint!==null){
    // Fast windowed search: only check ±7% around last known position
    const win=Math.floor(L*.08),start=Math.round(hint*(L-1));
    let best=hint,bestD=Infinity;
    for(let d=-win;d<=win;d++){
      const i=((start+d)%L+L)%L;
      const dist=pos.distanceToSquared(curvePts[i]);
      if(dist<bestD){bestD=dist;best=i/(L-1);}
    }
    return best;
  }
  // Full search (first call only)
  let best=0,bestD=Infinity;
  for(let i=0;i<L;i++){const d=pos.distanceToSquared(curvePts[i]);if(d<bestD){bestD=d;best=i/(L-1);}}
  return best;
}
function showSectorSplit(text,color){
  const el=document.getElementById('sectorInfo');if(!el)return;
  el.textContent=text;el.style.color=color;el.style.opacity='1';
  if(_secPopTimer)clearTimeout(_secPopTimer);
  _secPopTimer=setTimeout(()=>{el.style.opacity='0';},1100);
}
function tickProgress(car){
  car.prevProg=car.progress;
  car.progress=nearestT(car.mesh.position,car.progress);

  // ── Sector timing (player only) ─────────────
  if(car.isPlayer){
    const sec=car.progress<.333?0:car.progress<.667?1:2;
    if(sec!==_currentSector){
      const st=_nowSec-_sectorStart;
      const prev=_sectorBests[_currentSector];
      if(st<_sectorBests[_currentSector])_sectorBests[_currentSector]=st;
      if(_currentSector===0&&st<_bestS1)_bestS1=st;
      if(_currentSector===1&&st<_bestS2)_bestS2=st;
      if(_currentSector===2&&st<_bestS3)_bestS3=st;
      const _sb=[_bestS1,_bestS2,_bestS3][_currentSector];
      if(st<=_sb+0.001&&car.lap>=1)triggerCombo('SECTOR BEST');
      if(prev<Infinity){
        const d=st-prev,sign=d>=0?'+':'';
        const col=d<0?'#00ff88':'#ff5544';
        showSectorSplit(`S${_currentSector+1}  ${sign}${d.toFixed(2)}s`,col);
        const _sc2=st<_sb?'#00ff88':st<_sb*1.03?'#ffff00':'#ff4444';
        const _sl2=['S1','S2','S3'][_currentSector];
        const _sd2=_sb===Infinity?'':((st-_sb)>0?'+':'')+(st-_sb).toFixed(3);
        showSectorFlash(_sl2,st,_sd2,_sc2);
        // Color the sector panel cell
        const sEl=document.getElementById('secT'+(_currentSector+1));
        if(sEl){sEl.textContent=st.toFixed(2)+'s';sEl.style.color=d<-.05?'#cc44ff':d<0?'#00ee66':'#ff5544';}
      } else {
        // First lap — just record it in the panel
        const sEl=document.getElementById('secT'+(_currentSector+1));
        if(sEl){sEl.textContent=st.toFixed(2)+'s';sEl.style.color='#ffbb00';}
      }
      _sectorStart=_nowSec;_currentSector=sec;
    }
  }

  if(car.prevProg>.86&&car.progress<.12){
    const now=_nowSec;
    if(car.isPlayer&&car.lap>=1){
      lastLapTime=now-lapStartTime;lapStartTime=now;
      const isPB=lastLapTime<bestLapTime&&bestLapTime!==Infinity;
      if(lastLapTime<bestLapTime)bestLapTime=lastLapTime;
      _lapTimes.push(lastLapTime); // store for finish screen
      saveGhostIfPB(); // record ghost positions if this was a PB
      // Check overall fastest lap (purple flash) — only after at least one recorded lap
      const isOverallFastest=lastLapTime<_overallFastestLap&&_overallFastestLap!==Infinity;
      if(isOverallFastest){
        _overallFastestLap=lastLapTime;
        _fastestLapFlashT=2.2;
        setTimeout(()=>showBanner('💜 FASTEST LAP! '+fmtTime(lastLapTime),'#cc44ff',2800),200);
        beep(1760,.12,.35,0,'sine');beep(2093,.14,.28,.1,'sine');beep(2637,.18,.22,.2,'triangle');beep(3136,.14,.16,.32,'sine');
        floatText('💜 FASTEST LAP!','#cc44ff',innerWidth*.5,innerHeight*.38);
      }else if(isPB){
        setTimeout(()=>showBanner('⏱ NEW BEST: '+fmtTime(bestLapTime),'#00ff88',2200),1500);
        beep(1760,.1,.28,0,'sine');beep(2093,.15,.22,.09,'sine');beep(2637,.18,.18,.18,'triangle');
      }
      onLapComplete();
    }
    if(car._lapStart){const lt=now-car._lapStart;if(!car.bestLap||lt<car.bestLap)car.bestLap=lt;}
    car._lapStart=now;
    car.lap++;
    if(car.isPlayer&&car.lap>1)showBannerTop('LAP '+car.lap+' / '+TOTAL_LAPS,'#00eeff',2000);
    if(car.isPlayer&&car.lap===TOTAL_LAPS)showBannerTop('\u{1F3C1} FINAL LAP!','#ffd700',3000);
    if(car.isPlayer&&car.lap<=TOTAL_LAPS){
      if(car.lap===TOTAL_LAPS){
        showBanner('🏁 FINAL LAP!','#ffee00',2800);
        beep(880,.14,.42,0,'square');beep(1320,.1,.32,.12,'square');beep(1760,.08,.22,.22,'square');
        Audio.setFinalLap();
        // Big crowd reaction for final lap
        Audio.playCrowdCheer();setTimeout(()=>Audio.playCrowdCheer(),250);setTimeout(()=>Audio.playCrowdCheer(),500);
        if(_crowdGain&&audioCtx){_crowdGain.gain.setTargetAtTime(0.085,audioCtx.currentTime,.15);setTimeout(()=>{if(_crowdGain&&audioCtx)_crowdGain.gain.setTargetAtTime(0.062,audioCtx.currentTime,2.0);},2000);}
      }else{
        showBanner('LAP '+car.lap+' / '+TOTAL_LAPS,'#00ccff',1600);
        Audio.playCrowdCheer();
      }
    }
    // Finish: set FINISH state immediately for victory orbit, show overlay after 5.5s
    if(car.lap>TOTAL_LAPS&&!car.finished){
      car.finished=true;car._finishTime=now;
      if(car.isPlayer){
        Audio.playFanfare();
        // Check for champion achievement — only if player truly finished 1st
        const _finPos=getPositions().findIndex(c=>c.isPlayer)+1;
        if(_finPos===1)unlockAchievement('CHAMPION');
        gameState='FINISH';_victoryOrbit=true;
        const hud=document.getElementById('hud');if(hud)hud.style.display='none';
        const vh=document.getElementById('victoryHint');if(vh)vh.style.display='block';
        setTimeout(()=>{
          _victoryOrbit=false;
          const vh2=document.getElementById('victoryHint');if(vh2)vh2.style.display='none';
          showFinish();
        },5500);
      }
    }
  }
}

// Skid marks
function addSkidMark(car,opacityOverride){
  _plFwd.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
  _plRt.set(1,0,0).applyQuaternion(car.mesh.quaternion);
  const fwd=_plFwd,rt=_plRt;
  const baseOp=opacityOverride||0.72;
  [-0.65,.65].forEach(s=>{
    const sm=new THREE.Mesh(new THREE.PlaneGeometry(.38,1.7),new THREE.MeshBasicMaterial({color:0x0a0a0a,transparent:true,opacity:baseOp,depthWrite:false}));
    sm.rotation.x=-Math.PI/2;sm.position.copy(car.mesh.position).addScaledVector(rt,s).addScaledVector(fwd,1.5);sm.position.y=.013;
    scene.add(sm);skidMarks.push({mesh:sm,born:_nowSec,maxOp:baseOp});while(skidMarks.length>80){const old=skidMarks.shift();old.mesh.geometry.dispose();old.mesh.material.dispose();scene.remove(old.mesh);}
  });
}
function updateSkidMarks(){
  for(let i=skidMarks.length-1;i>=0;i--){
    const s=skidMarks[i];
    const op=Math.max(0,(s.maxOp||.72)*(1-(_nowSec-s.born)/12));
    if(op<=0){s.mesh.geometry.dispose();s.mesh.material.dispose();scene.remove(s.mesh);skidMarks.splice(i,1);}
    else s.mesh.material.opacity=op;
  }
}

// ══ CAMERA ══════════════════════════════════
function updateCamera(dt){
  const car=carObjs[playerIdx];if(!car)return;
  // Victory orbit: cinematic rotation around player car after finishing
  if(_victoryOrbit){
    const angle=_nowSec*.38,r=17,h=8;
    camera.position.set(
      car.mesh.position.x+Math.cos(angle)*r,
      car.mesh.position.y+h,
      car.mesh.position.z+Math.sin(angle)*r);
    camera.lookAt(car.mesh.position.x,car.mesh.position.y+.8,car.mesh.position.z);
    camera.fov+=(62-camera.fov)*Math.min(1,dt*2);camera.updateProjectionMatrix();
    return;
  }
  // Intro cinematic pan — for first 3s of race, slow lerp from dramatic overhead
  if(_introPanTimer>0){
    _introPanTimer=Math.max(0,_introPanTimer-dt);
    const blend=_introPanTimer/3.0; // 1→0 over 3 seconds
    _camV1.set(0,5.8,13.5).applyQuaternion(car.mesh.quaternion);
    _camV2.copy(car.mesh.position).add(_camV1);
    camPos.lerp(_camV2,Math.min(1,dt*(2+6*(1-blend)))); // slow start, fast at end
    _camV1.set(0,.8,-7).applyQuaternion(car.mesh.quaternion);
    _camV2.copy(car.mesh.position).add(_camV1);
    camTgt.lerp(_camV2,Math.min(1,dt*4));
    camera.position.copy(camPos);camera.lookAt(camTgt);
    const tFov=62+blend*18; // zoom in from 80° to 62° as pan ends
    camera.fov+=(tFov-camera.fov)*Math.min(1,dt*2.5);camera.updateProjectionMatrix();
    return;
  }

  if(_camView===1){
    // ── Helicopter / TV cam — high wide shot following car
    const angle=_nowSec*.08;
    const r=44,h=32;
    const tx=car.mesh.position.x,tz=car.mesh.position.z;
    camera.position.set(tx+Math.cos(angle)*r,car.mesh.position.y+h,tz+Math.sin(angle)*r);
    camera.lookAt(tx,car.mesh.position.y+.5,tz);
    camera.fov+=(72-camera.fov)*Math.min(1,dt*2);camera.updateProjectionMatrix();
    return;
  }
  if(_camView===2){
    // ── Hood cam — low, just above windscreen
    _camV1.set(0,.92,-0.4).applyQuaternion(car.mesh.quaternion);
    camera.position.copy(car.mesh.position).add(_camV1);
    _camV2.set(0,.88,-8).applyQuaternion(car.mesh.quaternion);
    _camV2.add(car.mesh.position);
    camera.lookAt(_camV2);
    camera.fov+=(70-camera.fov)*Math.min(1,dt*4);camera.updateProjectionMatrix();
    return;
  }
  if(_camView===3){
    // ── Bumper cam — very low, front nose
    _camV1.set(0,.26,-1.45).applyQuaternion(car.mesh.quaternion);
    camera.position.copy(car.mesh.position).add(_camV1);
    _camV2.set(0,.24,-12).applyQuaternion(car.mesh.quaternion);
    _camV2.add(car.mesh.position);
    camera.lookAt(_camV2);
    camera.fov+=(82-camera.fov)*Math.min(1,dt*4);camera.updateProjectionMatrix();
    return;
  }

  // ── Chase cam (default, _camView===0) ──────────────────
  // Mobile uses the SAME camera offset as desktop so the car has the same size/position on screen.
  // Screen-size adaptation happens via HFOV only (a small widening on phones below).
  _camV1.set(0,5.8,13.5);
  _camV1.applyQuaternion(car.mesh.quaternion);
  _camV2.copy(car.mesh.position).add(_camV1);
  camPos.lerp(_camV2,Math.min(1,dt*7));
  // Corner look-ahead: shift look TARGET subtly toward turn direction — no body sway
  const _steerInp=(keys['ArrowRight']||keys['KeyD'])?1:(keys['ArrowLeft']||keys['KeyA'])?-1:0;
  _camLateralT+=(_steerInp*1.4-_camLateralT)*Math.min(1,dt*1.6);
  _camV1.set(0,.8,-7).applyQuaternion(car.mesh.quaternion);
  _camV2.copy(car.mesh.position).add(_camV1);
  camTgt.lerp(_camV2,Math.min(1,dt*9));
  // Shift only the look target (camera stays put) — subtle corner peek, not disorienting
  _camV1.set(1,0,0).applyQuaternion(car.mesh.quaternion);
  camTgt.addScaledVector(_camV1,_camLateralT);
  let px=camPos.x,py=camPos.y,pz=camPos.z;
  if(camShake>0){const s=camShake*.5;px+=(Math.random()-.5)*s;py+=(Math.random()-.5)*s*.4;pz+=(Math.random()-.5)*s;camShake=Math.max(0,camShake-dt*2.5);}
    if(_comboTimer>0){_comboTimer-=dt;if(_comboTimer<=0)resetCombo();}
  camera.position.set(px,Math.max(.5,py),pz);camera.lookAt(camTgt);
  // Dynamic FOV — wider at high speed for sense of velocity, more extreme on nitro
  // Derive vertical FOV from a constant target horizontal FOV so the framing feels the same on
  // every aspect (desktop 16:9, phone 19:9, iPad Air landscape 1.71, iPad classic 4:3, etc.).
  // Phones get a wider target HFOV for better speed sensation on small screens.
  const TARGET_HFOV_DEG=window._isMobile?96:92;
  const _asp=camera.aspect||(innerWidth/innerHeight);
  const baseFov=2*Math.atan(Math.tan(TARGET_HFOV_DEG*Math.PI/360)/_asp)*180/Math.PI;
  const tFov=baseFov+Math.abs(car.speed)/car.def.topSpd*20+(nitroActive?14:0)+(car.boostTimer>0?6:0);
  camera.fov+=(tFov-camera.fov)*Math.min(1,dt*3.5);
  camera.updateProjectionMatrix();
}

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
function playGridRevving(){
  // Simulate multiple engines revving before race start
  if(!audioCtx)return;
  const car=carObjs[playerIdx];
  const typeFreq=car?((car.def.type==='f1')?1.55:(car.def.type==='muscle')?0.7:(car.def.type==='electric')?0.4:1.0):1.0;
  // Quick aggressive blip
  const blip=(delay,freq,vol)=>{
    const t=audioCtx.currentTime+delay;
    const o=audioCtx.createOscillator(),g=audioCtx.createGain(),f=audioCtx.createBiquadFilter();
    o.type='sawtooth';f.type='lowpass';f.frequency.value=1800;f.Q.value=1.2;
    o.frequency.setValueAtTime(freq*typeFreq*.5,t);o.frequency.exponentialRampToValueAtTime(freq*typeFreq*1.8,t+.18);
    o.frequency.exponentialRampToValueAtTime(freq*typeFreq*.6,t+.4);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol,t+.06);g.gain.exponentialRampToValueAtTime(.001,t+.45);
    o.connect(f);f.connect(g);g.connect(_dst());o.start(t);o.stop(t+.5);
  };
  blip(0,200,.18);blip(.55,220,.2);blip(1.1,240,.22);blip(1.65,260,.25);blip(2.2,300,.28);
}
function runCountdown(onGo){
  try{
    const lights=['fl1','fl2','fl3','fl4','fl5'];
    const f1El=document.getElementById('f1Lights');
    const num=document.getElementById('cdNum');
    const cdOv=document.getElementById('cdOverlay');
    lights.forEach(function(id){var el=document.getElementById(id);if(el)el.classList.remove('on');});
    if(f1El)f1El.style.display='flex';
    if(cdOv)cdOv.style.display='none';
    try{_playCountdownRoll();}catch(_){}
    var i=0;
    var lightOn=function(){
      try{
        if(i<lights.length){
          var el=document.getElementById(lights[i]);if(el)el.classList.add('on');
          try{Audio.playCount(1);}catch(e){}
          i++;
          setTimeout(lightOn,700);
        }else{
          setTimeout(function(){
            try{
              lights.forEach(function(id,idx){
                var el=document.getElementById(id);
                if(el)setTimeout(function(){el.classList.remove('on');el.classList.add('extinguish');setTimeout(function(){el.classList.remove('extinguish');},420);},idx*45);
              });
              try{Audio.playCount(0);}catch(e){}
              try{Audio.playCrowdCheer();setTimeout(playCrowdCheer,180);setTimeout(playCrowdCheer,360);}catch(e){}
              if(audioCtx){try{
                var t=audioCtx.currentTime;
                var o=audioCtx.createOscillator(),g=audioCtx.createGain(),f=audioCtx.createBiquadFilter();
                o.type='sawtooth';f.type='lowpass';f.frequency.value=2200;
                o.frequency.setValueAtTime(80,t);o.frequency.exponentialRampToValueAtTime(520,t+.6);
                g.gain.setValueAtTime(.28,t);g.gain.exponentialRampToValueAtTime(.001,t+.75);
                o.connect(f);f.connect(g);g.connect(_dst());o.start(t);o.stop(t+.8);
              }catch(e){}}
              if(cdOv)cdOv.style.display='flex';
              if(num){num.textContent='GO!';num.style.color='#00ff55';num.style.textShadow='0 0 60px #00ff88,0 0 120px #00cc55';num.style.opacity='1';num.style.transform='scale(1.5)';}
              if(f1El)f1El.style.display='none';
            }catch(e){console.error('Countdown GO error:',e);}
            // ALWAYS fire onGo — even if visuals fail
            onGo();
            if(num)fadePop(num,550,function(){if(cdOv)cdOv.style.display='none';});
          },150+Math.random()*130);
        }
      }catch(e){console.error('Countdown lightOn error:',e);onGo();}
    };
    setTimeout(lightOn,600);
  }catch(e){
    console.error('Countdown crashed:',e);
    onGo();
  }
}
function fadePop(el,dur,cb){
  el.style.transform='scale(1.3)';el.style.opacity='1';
  const s=performance.now();const step=now=>{const p=(now-s)/dur;el.style.opacity=Math.max(0,1-p);el.style.transform=`scale(${1.3-p*.5})`;p<1?requestAnimationFrame(step):cb();};requestAnimationFrame(step);
}
function showFinish(){
  gameState='FINISH';document.getElementById('hud').style.display='none';setTouchControlsVisible(false);
  const sov=document.getElementById('speedOverlay');if(sov)sov.style.opacity='0';
  if(musicSched){musicSched.stop();musicSched=null;}
  // Resume title music on finish screen (after a short beat for the race-end feel)
  setTimeout(()=>{if(gameState==='FINISH')startTitleMusic();},900);
  // Stop all ambient audio — prevents harsh noise on finish screen
  Audio.stopWind();
  if(_crowdGain&&audioCtx)_crowdGain.gain.setTargetAtTime(0.0,audioCtx.currentTime,.8);
  // Stop engine oscillator
  if(engineGain&&audioCtx)engineGain.gain.setTargetAtTime(0.0,audioCtx.currentTime,.4);
  const pos=getPositions(),p=pos.findIndex(c=>c.isPlayer)+1;
  const ords=['1st 🏆','2nd 🥈','3rd 🥉','4th','5th','6th','7th','8th'];
  // Position bonus + message
  const bonuses=[1000,700,500,300,200,100,50,0];
  const msgs=['🏆 CHAMPION!','🥈 EXCELLENT DRIVE!','🥉 PODIUM FINISH!',
              'GREAT EFFORT!','SOLID RACE!','KEEP PRACTICING!','ALMOST THERE!','NEVER GIVE UP!'];
  const titleGrads=['linear-gradient(175deg,#fff 0%,#ffd700 40%,#ff9500 80%)','linear-gradient(175deg,#fff 0%,#c0c0c0 50%,#888 100%)','linear-gradient(175deg,#fff 0%,#cd7f32 55%,#8B4513 100%)',''];
  totalScore+=bonuses[p-1]||0;
  const finTitle=document.getElementById('finTitle');
  if(p<=3&&finTitle){finTitle.style.backgroundImage=titleGrads[p-1];finTitle.style.webkitBackgroundClip='text';finTitle.style.webkitTextFillColor='transparent';}
  document.getElementById('finMsg').textContent=msgs[p-1]||msgs[7];
  document.getElementById('finMsg').style.color=p===1?'#cc44ff':p===2?'#aa88ff':p===3?'#8866cc':'#6644aa';
  document.getElementById('finPos').textContent='You finished '+(ords[p-1]||p+'th')+' place!'+(bestLapTime<Infinity?' · Best lap: '+fmtTime(bestLapTime):'');
  document.getElementById('finScore').textContent='SCORE: '+totalScore.toLocaleString();
  // Post-race stat line
  const statEl=document.getElementById('finStats');
  if(statEl){
    const pCar=carObjs[playerIdx];
    const spd=pCar?Math.min(380,Math.round(_raceMaxSpeed*165)):0;
    statEl.textContent='Top speed: '+spd+' km/h  ·  Overtakes: '+_raceOvertakes+(_achieveUnlocked.size>0?' · '+_achieveUnlocked.size+' achievements':'');
  }
  // Career stats + unlocks
  _raceCount++;
  if(p<=3)_podiumCount++;
  const _earnedCoins=awardCoins(p);
  _lastRaceCoins=_earnedCoins||0;
  const coinsEl=document.getElementById('finCoins');
  if(coinsEl&&_lastRaceCoins>0){
    coinsEl.style.display='block';let counted=0;const target=_lastRaceCoins;const step=Math.max(1,Math.round(target/40));
    const iv=setInterval(()=>{counted=Math.min(target,counted+step);coinsEl.textContent='+'+counted+' 💰';if(counted>=target){clearInterval(iv);coinsEl.style.textShadow='0 0 20px #ffd700';}},30);
  }
  const tcEl=document.getElementById('finTotalCoins');
  if(tcEl)tcEl.textContent='💰 TOTAAL: '+_coins.toLocaleString();
  // Achievement check
  var _achStats={hits:carObjs[playerIdx]?carObjs[playerIdx].hitCount:0,maxSpd:Math.round(_raceMaxSpeed*165),fl:bestLapTime!==Infinity&&bestLapTime<=_overallFastestLap+0.001};
  ACHIEVEMENTS.forEach(function(ach,ai){
    if(_achieveUnlocked.has(ach.id))return;
    if(ach.check(p,_achStats)){_achieveUnlocked.add(ach.id);setTimeout(function(){showAchievementToast(ach);},2500+ai*2200);}
  });
  // Daily challenge
  _todayRaces++;
  if(_todayChallenge&&!_challengeCompleted){
    var _dcStats={hits:carObjs[playerIdx]?carObjs[playerIdx].hitCount:0,fl:bestLapTime!==Infinity&&bestLapTime<=_overallFastestLap+0.001};
    if(_todayChallenge.check(p,_dcStats)){
      _challengeCompleted=true;_coins+=_todayChallenge.reward;_totalCoinsEarned+=_todayChallenge.reward;
      setTimeout(function(){showAchievementToast({icon:'\u{1F4CB}',title:'UITDAGING VOLTOOID!',desc:_todayChallenge.text+' \u00b7 +'+_todayChallenge.reward+' coins'});},4500);
    }
  }
  const newUnlocks=checkUnlocks(p);
  savePersistent();
  if(newUnlocks.length>0)setTimeout(()=>showUnlocks(newUnlocks),2500);
  // Detect personal record BEFORE savePersistent updates the cached values
  const _preHS=_savedHS,_preBL=_savedBL;
  savePersistent();
  const _newHS=_savedHS>_preHS,_newBL=_savedBL<_preBL;
  if(_newHS||_newBL){
    const rtxt=_newHS&&_newBL?'🏆 NEW RECORDS! SCORE + LAP':_newHS?'🏆 NEW HIGH SCORE!':'⏱ NEW BEST LAP!';
    setTimeout(()=>{showBanner(rtxt,'#ffd700',3200);Audio.playCrowdCheer();},900);
    const fhs=document.getElementById('finHighScore');
    if(fhs){fhs.textContent=_newHS?'HIGH SCORE: '+_savedHS.toLocaleString():'';fhs.style.color='#ffd700';fhs.style.textShadow='0 0 14px #ffd700';}
  }
  // Show fastest lap credit
  const flEl2=document.getElementById('finStats');
  if(flEl2&&_overallFastestLap<Infinity){
    const pCar=carObjs[playerIdx];
    const spd=pCar?Math.min(380,Math.round(_raceMaxSpeed*165)):0;
    const pitNote=_pitStopUsed?' · Pit stop used':'';
    const flNote=bestLapTime<=_overallFastestLap+0.001?' · 💜 FASTEST LAP':'';
    flEl2.textContent='Top speed: '+spd+' km/h  ·  Overtakes: '+_raceOvertakes+pitNote+flNote;
  }
  const tbody=document.getElementById('leaderBody');tbody.innerHTML='';
  pos.forEach((car,i)=>{
    const tr=document.createElement('tr');if(car.isPlayer)tr.className='pRow';
    const bestT=car.bestLap?fmtTime(car.bestLap):'-';
    const flMark=car.isPlayer&&bestLapTime<=_overallFastestLap+0.001?'<span style="color:#cc44ff"> 💜</span>':'';
    tr.innerHTML=`<td>${ords[i]||i+1+'th'}</td><td>${car.def.brand} ${car.def.name}</td><td style="color:#aaa">${bestT}${flMark}</td>`;
    tbody.appendChild(tr);
  });
  // 3D Podium
  const podium=document.getElementById('finPodium');
  if(podium&&pos.length>=3){
    const metals=['#ffd700','#c0c0c0','#cd7f32'];
    const metalGlow=['#aa8800','#666666','#6b3a0e'];
    const podH=[110,82,60]; // heights: 1st tallest
    // Display order left→right: 2nd, 1st, 3rd
    const dispOrder=[1,0,2];
    podium.innerHTML='';
    dispOrder.forEach(rank=>{
      const car=pos[rank];if(!car)return;
      const col='#'+car.def.color.toString(16).padStart(6,'0');
      const medal=metals[rank],glow=metalGlow[rank],h=podH[rank];
      const box=document.createElement('div');box.className='podBox';
      box.innerHTML=
        `<div class="podCarBlock" style="background:linear-gradient(135deg,${col},${col}88);border:2px solid ${col};box-shadow:0 0 14px ${col}66"></div>`+
        `<div class="podLabel" style="color:${medal};text-shadow:0 0 10px ${medal}">${['🏆 1ST','🥈 2ND','🥉 3RD'][rank]}</div>`+
        `<div class="podCarName">${car.def.name}</div>`+
        `<div class="podPlatform" style="height:${h}px;background:linear-gradient(180deg,${medal}44,${medal}11);border:2px solid ${medal};border-bottom:none;box-shadow:0 0 18px ${glow},inset 0 1px 0 ${medal}88">${rank===0?'★':''}</div>`;
      podium.appendChild(box);
    });
  }
  // Show per-lap times below leaderboard
  const lapTimesEl=document.getElementById('finLapTimes');
  if(lapTimesEl&&_lapTimes.length>0){
    lapTimesEl.innerHTML=_lapTimes.map((t,i)=>{
      const isBest=t===bestLapTime;
      return `<span style="margin:0 10px;color:${isBest?'#00ff88':'#aaa'};${isBest?'text-shadow:0 0 8px #00ff88':''}">LAP ${i+1}: ${fmtTime(t)}${isBest?' ★':''}</span>`;
    }).join('');
  }
  // Show damage status
  const pCar2=carObjs[playerIdx];
  if(pCar2&&pCar2.hitCount>=3){
    const dmgEl=document.getElementById('finStats');
    if(dmgEl){const d=pCar2.hitCount>=6?'🔥 HEAVY':'⚠ LIGHT';dmgEl.textContent+=' · '+d+' DAMAGE';}
  }
  var _wfBg={grandprix:'radial-gradient(ellipse at 50% 40%,#140030,#070018,#000007)',space:'radial-gradient(ellipse at 50% 40%,#000818,#00041a,#000005)',deepsea:'radial-gradient(ellipse at 50% 40%,#001828,#00081a,#000005)',candy:'radial-gradient(ellipse at 50% 40%,#280018,#14000c,#050002)',neoncity:'radial-gradient(ellipse at 50% 40%,#000818,#00041a,#000005)',volcano:'radial-gradient(ellipse at 50% 40%,#1a0800,#0a0400,#000000)',arctic:'radial-gradient(ellipse at 50% 40%,#061428,#020a18,#000005)',themepark:'radial-gradient(ellipse at 50% 40%,#2a0840,#1a0428,#050010)'};
  var _sfEl=document.getElementById('sFinish');if(_sfEl)_sfEl.style.background=_wfBg[activeWorld]||_wfBg.grandprix;
  document.getElementById('sFinish').classList.remove('hidden');
  // Staggered reveal animations
  ['finTitle','finMsg','finPos','finScore','finStats','finLapTimes','finPodium','leaderBody'].forEach((id,i)=>{
    const el=document.getElementById(id)||document.querySelector('.'+id);
    if(el){el.classList.add('finReveal');el.style.animationDelay=(i*.12+.05)+'s';}
  });
  // Hide mirror on finish
  const mf=document.getElementById('mirrorFrame'),ml=document.getElementById('mirrorLabel');
  if(mf)mf.style.display='none';if(ml)ml.style.display='none';
  if(p<=3)launchConfetti();
  if(p===1){
    Audio.playVictory();
    const gc=document.getElementById('goldCelebration');
    if(gc){gc.style.opacity='1';setTimeout(()=>{gc.style.opacity='0';},3500);}
    // Staggered personal message
    setTimeout(()=>showBanner('🏆 CHAMPION, SPENCER!','#ffd700',3000),800);
  }
  // Start title music on finish screen after a short delay (let fanfare/silence settle)
  setTimeout(()=>{
    if(audioCtx&&gameState==='FINISH'){
      if(!titleMusic){titleMusic=new TitleMusic(audioCtx);titleMusic.start();}
      else if(!titleMusic.running){titleMusic.start();}
    }
  }, p===1?2800:900);
}

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

function spawnFlames(){
  const c=document.getElementById('titleFlames');
  const pal=['#ff6600','#ff3300','#ffaa00','#ff1100','#ffcc00','#ff4400'];
  for(let i=0;i<48;i++){const f=document.createElement('div');f.className='flame';const h=28+Math.random()*110,w=3+Math.random()*6;f.style.cssText=`left:${Math.random()*100}%;height:${h}px;width:${w}px;background:${pal[i%pal.length]};animation-duration:${.75+Math.random()*2.3}s;animation-delay:${-Math.random()*2.5}s`;c.appendChild(f);}
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
function updateSpeedOverlay(){
  const car=carObjs[playerIdx];
  const ov=document.getElementById('speedOverlay');if(!ov||!car)return;
  const spd=Math.abs(car.speed);
  const maxSpd=car.def.topSpd*(car.boostTimer>0?1.55:1)*(nitroActive?1.42:1);
  const t=Math.max(0,(spd/maxSpd-.5)/.5); // kicks in at 50% of top speed
  ov.style.opacity=String(Math.min(1,t*.9));
}

// ══ CONFETTI ═════════════════════════════════
function launchConfetti(){
  const cvs=document.getElementById('confettiCvs');if(!cvs)return;
  cvs.style.display='block';cvs.width=innerWidth;cvs.height=innerHeight;
  const ctx=cvs.getContext('2d');
  const colors=['#ff0000','#ff7700','#ffdd00','#00ee55','#00aaff','#aa44ff','#ff4488','#ffffff','#ffd700'];
  const pieces=Array.from({length:180},()=>({
    x:Math.random()*innerWidth, y:-30-Math.random()*innerHeight*.6,
    vx:(Math.random()-.5)*5, vy:2.5+Math.random()*4.5,
    rot:Math.random()*Math.PI*2, vrot:(Math.random()-.5)*.25,
    w:5+Math.random()*9, h:3+Math.random()*5,
    color:colors[Math.floor(Math.random()*colors.length)]
  }));
  function draw(){
    ctx.clearRect(0,0,cvs.width,cvs.height);
    let alive=false;
    pieces.forEach(p=>{
      p.x+=p.vx;p.y+=p.vy;p.rot+=p.vrot;p.vy+=.055;
      if(p.y<cvs.height+30){
        alive=true;
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);
        ctx.fillStyle=p.color;ctx.globalAlpha=Math.max(0,1-(p.y/cvs.height)*.65);
        ctx.fillRect(-p.w/2,-p.h/2,p.w,p.h);
        ctx.restore();
      }
    });
    if(alive)requestAnimationFrame(draw);
    else{ctx.clearRect(0,0,cvs.width,cvs.height);cvs.style.display='none';}
  }
  requestAnimationFrame(draw);
}

// ══ BOOST RING ANIMATION ═════════════════════
function updateBoostArrows(){
  const t=_nowSec;
  boostPads.forEach((pad,pi)=>{
    if(!pad.arrows)return;
    pad.arrows.forEach(arr=>{
      // Each ring floats upward and fades — offset phase creates cascading effect
      const phase=((t*0.9+arr._phase))%1;
      const rise=phase*3.2; // ring floats up 3.2 units over its cycle
      arr.material.opacity=Math.sin(phase*Math.PI)*0.75;
      arr.position.y=arr._baseY+rise;
      // Subtle scale pulse (slightly bigger as they rise)
      const sc=0.85+phase*0.30;
      arr.scale.set(sc,1,sc);
    });
    // Animate point light intensity
    if(pad.light){
      const pulse=0.5+0.5*Math.sin(t*3.2+pi*1.4);
      pad.light.intensity=1.4+pulse*1.4;
    }
  });
}

// ══ SLIPSTREAM VISUALS ═══════════════════════
function updateSlipstreamVisuals(){
  carObjs.forEach((car,i)=>{
    if(i===playerIdx||!car.mesh||car.finished)return;
    if(Math.abs(car.speed)>car.def.topSpd*.6&&Math.random()>.74){
      _aiFwdRV.set(0,0,1).applyQuaternion(car.mesh.quaternion); // backward = +Z
      // Pale blue exhaust shimmer — subtle, low emission rate
      sparkSystem.emit(
        car.mesh.position.x+_aiFwdRV.x*1.6,car.mesh.position.y+.18,car.mesh.position.z+_aiFwdRV.z*1.6,
        _aiFwdRV.x*.05+(Math.random()-.5)*.015,.006+Math.random()*.012,_aiFwdRV.z*.05+(Math.random()-.5)*.015,
        1,.14,.44,.88,.38);
    }
  });
}

// ══ SMOOTH WEATHER TRANSITION ════════════════
function updateWeather(dt){
  _rainIntensity+=(_rainTarget-_rainIntensity)*Math.min(1,dt*1.0);
  if(Math.abs(_rainIntensity-_rainTarget)<0.006)_rainIntensity=_rainTarget;
  // Rain canvas — smooth opacity fade
  if(rainCanvas){
    const show=_rainIntensity>0.03;
    if(show){rainCanvas.style.display='block';rainCanvas.style.opacity=String(_rainIntensity);}
    else{rainCanvas.style.display='none';}
  }
  // Track surface shimmer — gradual wet→dry darkening, preserves world color
  if(_trackMesh){
    const w=_rainIntensity;
    const base=_trackMesh.material.userData.baseColor;
    if(base!==undefined){
      const bc=new THREE.Color(base);
      // Wet track is 45% darker than dry
      bc.multiplyScalar(1.0-w*0.45);
      _trackMesh.material.color.copy(bc);
    }else{
      // Fallback for tracks without baseColor stashed
      const dryL=0x26/255,wetL=0x18/255;
      const lv=dryL+(wetL-dryL)*w;
      _trackMesh.material.color.setRGB(lv,lv,lv);
    }
    _trackMesh.material.emissive.setRGB(w*.04,w*.05,w*.09);
    _trackMesh.material.needsUpdate=true;
  }
  // Fog — blend day/night base with rain density
  const baseFog=isDark?.0035:.0011;
  const rainAdd=isDark?.0025:.0009;
  scene.fog.density=baseFog+_rainIntensity*rainAdd;
}

// ══ SAFETY CAR ═══════════════════════════════
function spawnSafetyCar(progress){
  if(_safetyCar){scene.remove(_safetyCar.mesh);_safetyCar=null;}
  const g=new THREE.Group();
  const yMat=new THREE.MeshLambertMaterial({color:0xffcc00});
  const wMat=new THREE.MeshLambertMaterial({color:0x111111});
  const bMat=new THREE.MeshBasicMaterial({color:0xff2200});
  // Body
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.6,.44,3.4),yMat);body.position.y=.34;g.add(body);
  const cab=new THREE.Mesh(new THREE.BoxGeometry(1.4,.38,1.55),yMat);cab.position.set(0,.77,.1);g.add(cab);
  // Light bar
  const lbar=new THREE.Mesh(new THREE.BoxGeometry(1.35,.14,.22),bMat);lbar.position.set(0,1.08,.1);g.add(lbar);
  // Wheels (4 simple cylinders)
  [[-0.88,.28,-1.2],[0.88,.28,-1.2],[-0.88,.28,1.2],[0.88,.28,1.2]].forEach(([x,y,z])=>{
    const w=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,.2,10),wMat);
    w.rotation.z=Math.PI/2;w.position.set(x,y,z);g.add(w);
  });
  const pt=trackCurve.getPoint(progress);
  const tg=trackCurve.getTangent(progress).normalize();
  g.position.copy(pt);g.position.y=.35;
  g.rotation.set(0,Math.atan2(-tg.x,-tg.z),0);
  scene.add(g);
  _safetyCar={mesh:g,lbar,progress,timer:6.5};
  showBanner('🚗 SAFETY CAR','#ffcc00',1800);
}
function updateSafetyCar(dt){
  if(!_safetyCar)return;
  _safetyCar.timer-=dt;
  if(_safetyCar.timer<=0){scene.remove(_safetyCar.mesh);_safetyCar=null;return;}
  // Drive slowly along track (about 30% of normal speed)
  _safetyCar.progress=(_safetyCar.progress+0.22*.012*dt)%1;
  const pt=trackCurve.getPoint(_safetyCar.progress);
  const tg=trackCurve.getTangent(_safetyCar.progress).normalize();
  _safetyCar.mesh.position.copy(pt);_safetyCar.mesh.position.y=.35;
  _safetyCar.mesh.rotation.y=Math.atan2(-tg.x,-tg.z);
  // Flash light bar red↔blue
  _safetyCar.lbar.material.color.setHex(Math.sin(_nowSec*12)>0?0xff2200:0x0033ff);
}

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

function unlockAchievement(id){
  if(_achieveUnlocked.has(id))return;
  _achieveUnlocked.add(id);
  var a=_RACE_ACHIEVEMENTS[id];
  if(!a)return;
  showAchievementToast({icon:a.icon||'🏆',title:a.label,desc:a.desc||''});
  if(typeof playCrowdCheer==='function')Audio.playCrowdCheer();
}

function updateAchievements(dt){
  const car=carObjs[playerIdx];if(!car)return;
  // Track max speed
  if(car.speed>_raceMaxSpeed)_raceMaxSpeed=car.speed;
  // Speed demon
  if(car.speed>=car.def.topSpd*.95)unlockAchievement('SPEED_DEMON');
  // Drift king
  if(driftTimer>0)_driftAccum+=dt;else _driftAccum=0;
  if(_driftAccum>=3.0)unlockAchievement('DRIFT_KING');
  // Airborne
  if(car.inAir)_airborneAccum+=dt;else _airborneAccum=0;
  if(_airborneAccum>=2.0)unlockAchievement('FLYING');
  // Overtakes: detect when player position improves
  const curPos=getPositions().findIndex(c=>c.isPlayer)+1;
  if(curPos<_lastPlayerPos){
    _raceOvertakes+=(_lastPlayerPos-curPos);
    if(curPos===1)unlockAchievement('FIRST_BLOOD');
  }
  _lastPlayerPos=curPos;
  if(_raceOvertakes>=5)unlockAchievement('OVERTAKER');
  // Clean lap — reset on recovery
  if(recoverActive)_cleanLapFlag=false;
  // Nitro junkie tracked via activations in updatePlayer
}

// Call when nitro activates
function onNitroActivate(){
  _nitroUseCount++;
  if(_nitroUseCount>=10)unlockAchievement('NITRO_JUNKIE');
}
// Call on lap complete for clean lap check
function onLapComplete(){
  if(_cleanLapFlag)unlockAchievement('CLEAN_LAP');
  _cleanLapFlag=true; // reset for next lap
}

let _achieveToastEl=null;
function updateAchievementToast(dt){
  if(!_achieveToastEl){_achieveToastEl=document.getElementById('achieveToast');}
  if(_achieveTimer>0){
    _achieveTimer-=dt;
    if(_achieveTimer<=0&&_achieveToastEl){
      _achieveToastEl.style.opacity='0';
      _achieveTimer=0;
      // Show next queued achievement after short gap
      if(_achieveQueue.length>0)setTimeout(()=>{showNextAchievement();},500);
    }
    return;
  }
  if(_achieveQueue.length>0&&_achieveTimer<=0)showNextAchievement();
}
function showNextAchievement(){
  if(_achieveQueue.length===0)return;
  const txt=_achieveQueue.shift();
  if(!_achieveToastEl){_achieveToastEl=document.getElementById('achieveToast');}
  if(!_achieveToastEl)return;
  _achieveToastEl.textContent='🏅 '+txt;
  _achieveToastEl.style.opacity='1';
  _achieveTimer=3.0;
}

// ══ FLOATING TEXT ════════════════════════════
// Stagger counter so simultaneous messages don't overlap
let _floatSlot=0,_floatSlotTimer=0;
function floatText(text,color,screenX,screenY){
  if(_floatSlotTimer<=0)_floatSlot=0;
  _floatSlotTimer=1.6;
  const offsetY=_floatSlot*38;
  _floatSlot=(_floatSlot+1)%6; // up to 6 simultaneous, then wrap
  const el=document.createElement('div');
  el.className='floatText';el.textContent=text;
  el.style.color=color;el.style.textShadow='0 0 12px '+color;
  el.style.left=Math.round(screenX)+'px';
  // Clamp Y above controls on mobile (touch controls start ~viewport*.75 on phone)
  const maxTop=window._useTouchControls?innerHeight*.55:innerHeight-80;
  el.style.top=Math.round(Math.min(maxTop,Math.max(60,screenY-30-offsetY)))+'px';
  document.body.appendChild(el);
  setTimeout(()=>{try{el.remove();}catch(e){}},1200);
}
function floatText3D(text,color,worldPos){
  if(!camera)return;
  const v=worldPos.clone().project(camera);
  const x=(v.x*.5+.5)*innerWidth,y=(1-(v.y*.5+.5))*innerHeight;
  if(x>0&&x<innerWidth&&y>0&&y<innerHeight)floatText(text,color,x,y);
}

// ══ SPEED LINES ════════════════════════════
function initSpeedLines(){
  _speedLinesCvs=document.getElementById('speedLines');
  if(!_speedLinesCvs)return;
  _speedLinesCvs.width=innerWidth;_speedLinesCvs.height=innerHeight;
  _speedLinesCtx=_speedLinesCvs.getContext('2d');
  _drawSpeedLines();
  window.addEventListener('resize',()=>{
    if(_speedLinesCvs){_speedLinesCvs.width=innerWidth;_speedLinesCvs.height=innerHeight;_drawSpeedLines();}
  });
}
function _drawSpeedLines(){
  if(!_speedLinesCtx)return;
  const ctx=_speedLinesCtx,w=_speedLinesCvs.width,h=_speedLinesCvs.height;
  const cx=w/2,cy=h/2,R=Math.max(w,h)*.65;
  ctx.clearRect(0,0,w,h);
  for(let i=0;i<88;i++){
    const a=i/88*Math.PI*2;
    const inner=(.08+Math.random()*.04)*R;
    const outer=inner+(0.07+Math.random()*.22)*R;
    ctx.lineWidth=.4+Math.random()*2.2;
    ctx.globalAlpha=.12+Math.random()*.45;
    ctx.strokeStyle=`hsl(${200+Math.random()*40},80%,90%)`;
    ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*inner,cy+Math.sin(a)*inner);
    ctx.lineTo(cx+Math.cos(a)*outer,cy+Math.sin(a)*outer);ctx.stroke();
  }
}
let _speedLinesFadeT=0,_speedLinesRedrawT=0;
function updateSpeedLines(){
  if(!_speedLinesCvs)return;
  if(!carObjs[playerIdx]||gameState!=='RACE'){_speedLinesCvs.style.opacity='0';_speedLinesFadeT=0;return;}
  const dt2=1/60;
  if(nitroActive){
    _speedLinesFadeT=0.3;
    _speedLinesRedrawT-=dt2;
    if(_speedLinesRedrawT<=0){_drawSpeedLines();_speedLinesRedrawT=0.5;}
    _speedLinesCvs.style.opacity='0.52';
  }else{
    _speedLinesFadeT=Math.max(0,_speedLinesFadeT-dt2);
    _speedLinesCvs.style.opacity=(_speedLinesFadeT/0.3*0.52).toFixed(3);
  }
}

// ══ DRIFT VISUALS ════════════════════════════
function initDriftVisuals(){
  _driftBarEl=document.getElementById('driftBar');
  _driftBarFill=document.getElementById('driftBarFill');
  _driftLabelEl=document.getElementById('driftLabel');
}
function updateDriftVisuals(dt){
  const car=carObjs[playerIdx];if(!car)return;
  if(driftTimer>0.2){
    if(_driftBarEl)_driftBarEl.style.display='block';
    if(_driftLabelEl)_driftLabelEl.style.display='block';
    const fill=Math.min(1,driftTimer/4)*100;
    if(_driftBarFill)_driftBarFill.style.width=fill+'%';
    // Drift smoke from rear tires
    if(Math.abs(car.speed)>.6&&Math.random()<.55){
      const fwd=_camV1.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
      const rt=_camV2.set(1,0,0).applyQuaternion(car.mesh.quaternion);
      [-0.82,0.82].forEach(s=>{
        const tx=car.mesh.position.x+fwd.x*.7+rt.x*s;
        const ty=car.mesh.position.y+.12;
        const tz=car.mesh.position.z+fwd.z*.7+rt.z*s;
        exhaustSystem.emit(tx,ty,tz,(Math.random()-.5)*.025,.006+Math.random()*.014,(Math.random()-.5)*.025,
          1,.34,.34,.34,.8);
      });
    }
  }else{
    if(_driftBarEl)_driftBarEl.style.display='none';
    if(_driftLabelEl)_driftLabelEl.style.display='none';
  }
}

// ══ NITRO VISUALS ════════════════════════════
function updateNitroVisual(){
  if(!nitroActive)return;
  const car=carObjs[playerIdx];if(!car)return;
  const rt=_camV1.set(1,0,0).applyQuaternion(car.mesh.quaternion);
  const fwd=_camV2.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
  [-1,1].forEach(side=>{
    if(Math.random()>.45)return;
    const sx=car.mesh.position.x+rt.x*side*1.15+fwd.x*.8;
    const sy=car.mesh.position.y+.35+Math.random()*.2;
    const sz=car.mesh.position.z+rt.z*side*1.15+fwd.z*.8;
    sparkSystem.emit(sx,sy,sz,rt.x*side*.09+(Math.random()-.5)*.03,.018+Math.random()*.04,rt.z*side*.09+(Math.random()-.5)*.03,
      1,.25,.55,1.0,.95);
  });
  // Extra rear exhaust flare
  if(Math.random()>.7){
    sparkSystem.emit(
      car.mesh.position.x+fwd.x*1.6,car.mesh.position.y+.28,car.mesh.position.z+fwd.z*1.6,
      fwd.x*.06,.02,fwd.z*.06,2,.9,.5,.1,.8);
  }
}

// ══ BOOST TRAIL ══════════════════════════════
function updateBoostTrail(){
  // Removed — boost is indicated by nitro/speed bar instead
}

// ══ GHOST CAR ════════════════════════════════
function buildGhostMesh(){
  if(_ghostMesh){scene.remove(_ghostMesh);_ghostMesh=null;}
  const g=new THREE.Group();
  const mat=new THREE.MeshLambertMaterial({color:0xaabbff,transparent:true,opacity:.32,depthWrite:false,emissive:0x2233aa,emissiveIntensity:.6});
  const body=new THREE.Mesh(new THREE.BoxGeometry(1.55,.44,3.8),mat);body.position.y=.34;g.add(body);
  const cab=new THREE.Mesh(new THREE.BoxGeometry(1.35,.38,1.55),mat);cab.position.set(0,.77,.1);g.add(cab);
  // Outer glow shell (slightly larger, backside only)
  const glowMat=new THREE.MeshBasicMaterial({color:0x6688ff,transparent:true,opacity:.10,side:THREE.BackSide,depthWrite:false});
  const glow=new THREE.Mesh(new THREE.BoxGeometry(1.75,.60,4.1),glowMat);glow.position.y=.34;g.add(glow);
  g.visible=false;
  scene.add(g);_ghostMesh=g;
}
function updateGhost(dt){
  const car=carObjs[playerIdx];if(!car||gameState!=='RACE')return;
  _ghostSampleT+=dt;
  if(_ghostSampleT>=.1){
    _ghostSampleT=0;
    _ghostPos.push({x:car.mesh.position.x,y:car.mesh.position.y,z:car.mesh.position.z,ry:car.mesh.rotation.y});
    if(_ghostPos.length>1200)_ghostPos.shift(); // cap 2-min buffer
  }
  if(_ghostMesh&&_ghostBest.length>0){
    _ghostPlayT+=dt;
    const fi=Math.min(Math.floor(_ghostPlayT*10),_ghostBest.length-1);
    const gp=_ghostBest[fi];
    _ghostMesh.position.set(gp.x,gp.y+.04,gp.z);
    _ghostMesh.rotation.y=gp.ry;
    _ghostMesh.visible=true;
    if(fi>=_ghostBest.length-1)_ghostPlayT=0; // loop ghost
    const gl=document.getElementById('ghostLabel');
    if(gl)gl.style.display=fi%20<10?'block':'none'; // blink
  }else if(_ghostMesh){_ghostMesh.visible=false;}
}
function saveGhostIfPB(){
  // Save ghost on first lap (bestLapTime still Infinity) or if it's a new PB
  if(_ghostPos.length>0&&lastLapTime>0&&(bestLapTime===Infinity||lastLapTime<=bestLapTime)){
    _ghostBest=[..._ghostPos];_ghostPlayT=0;
    const gl=document.getElementById('ghostLabel');if(gl){gl.textContent='👻 PB GHOST';gl.style.display='block';setTimeout(()=>{if(gl)gl.style.display='none';},2500);}
  }
  _ghostPos.length=0; // reset for next lap recording
}

// ══ PIT STOP ═════════════════════════════════
function triggerPitStop(){
  if(_pitStopActive||_pitStopUsed)return;
  const car=carObjs[playerIdx];if(!car)return;
  _pitStopActive=true;_pitStopTimer=0;
  car.speed=0;
  const ov=document.getElementById('pitStopOverlay');
  if(ov)ov.style.display='flex';
  showBanner('🔧 PIT STOP!','#00ee66',500);
  beep(440,.12,.3,0,'square');beep(880,.1,.22,.1,'square');
  // Music ducking: race-muziek zakt naar 40% tijdens pit stop
  _musicDuck=0.4;_applyMusicGain(0.4);
}
function updatePitStop(dt){
  if(!_pitStopActive)return;
  const PIT_DUR=2.5;
  _pitStopTimer+=dt;
  const fill=document.getElementById('pitCountFill');
  const sub=document.getElementById('pitStopSub');
  if(fill)fill.style.width=(_pitStopTimer/PIT_DUR*100)+'%';
  const car=carObjs[playerIdx];
  if(car)car.speed=0;
  if(_pitStopTimer>=PIT_DUR){
    _pitStopActive=false;_pitStopUsed=true;
    const ov=document.getElementById('pitStopOverlay');
    if(ov)ov.style.display='none';
    // Music ducking off
    _musicDuck=1.0;_applyMusicGain(0.4);
    // Full service
    if(car){car.tireWear=0;car.hitCount=0;}
    nitroLevel=100;
    showBanner('✅ TYRES CHANGED! GO GO GO!','#00ee66',2500);
    floatText('🔧 FRESH TYRES!','#00ee66',innerWidth*.5,innerHeight*.45);
    beep(523,.1,.4,0,'sine');beep(659,.12,.35,.1,'sine');beep(784,.14,.3,.2,'sine');beep(1047,.16,.28,.32,'sine');
    if(sub)sub.textContent='SERVICING...';
    if(fill)fill.style.width='0%';
  }else if(_pitStopTimer<.6){
    if(sub)sub.textContent='STOPPING...';
  }else if(_pitStopTimer<PIT_DUR-.3){
    const left=Math.ceil(PIT_DUR-_pitStopTimer);
    if(sub)sub.textContent='SERVICING... '+left+'s';
  }else{
    if(sub)sub.textContent='GO GO GO!';
  }
}

function updateFastestLapFlash(dt){
  if(_fastestLapFlashT<=0)return;
  _fastestLapFlashT=Math.max(0,_fastestLapFlashT-dt);
  const el=_elFastestLapFlash;if(!el)return;
  // Pulsing purple flash that fades over 2.2s
  const base=_fastestLapFlashT/2.2;
  el.style.opacity=base*.7*(0.5+0.5*Math.sin(_nowSec*8));
}
function updateCloseBattle(dt){
  const car=carObjs[playerIdx];if(!car||!carObjs.length)return;
  const el=_elCloseBattle;if(!el)return;
  const px=car.mesh.position.x,pz=car.mesh.position.z;
  let close=false;
  for(let i=0;i<carObjs.length;i++){
    if(i===playerIdx)continue;
    const other=carObjs[i];if(other.finished)continue;
    const dx=px-other.mesh.position.x,dz=pz-other.mesh.position.z;
    if(dx*dx+dz*dz<64){close=true;break;}
  }
  if(close){
    _closeBattleTimer=Math.min(2,_closeBattleTimer+dt);
    if(_closeBattleTimer>.3&&el.style.display!=='block')el.style.display='block';
  }else{
    _closeBattleTimer=Math.max(0,_closeBattleTimer-dt*.5);
    if(_closeBattleTimer<=0&&el.style.display!=='none')el.style.display='none';
  }
}

// ══ AI MISTAKES ══════════════════════════════
// Applied in updateAI — cars occasionally wobble on corners
// (stored per car as car._mtimer, car._mActive)

// ══ REV LIMITER ══════════════════════════════
function playRevLimiter(){
  if(!audioCtx)return;
  const sz=Math.ceil(audioCtx.sampleRate*.038);
  const buf=audioCtx.createBuffer(1,sz,audioCtx.sampleRate);
  const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=(Math.random()*2-1)*(1-i/sz);
  const src=audioCtx.createBufferSource();src.buffer=buf;
  const f=audioCtx.createBiquadFilter();f.type='bandpass';f.frequency.value=2400;f.Q.value=1.2;
  const g=audioCtx.createGain();
  const t=audioCtx.currentTime;
  g.gain.setValueAtTime(.07,t);g.gain.exponentialRampToValueAtTime(.001,t+.04);
  src.connect(f);f.connect(g);g.connect(_dst());src.start(t);src.stop(t+.045);
}
function updateRevLimiter(dt){
  if(!audioCtx)return;
  const car=carObjs[playerIdx];if(!car)return;
  const ratio=car.speed/Math.max(car.def.topSpd*.01,car.def.topSpd);
  if(ratio>.966&&!nitroActive&&!car.boostTimer){
    _revLimiterTimer+=dt;
    if(_revLimiterTimer>.42){playRevLimiter();_revLimiterTimer=0;}
  }else{_revLimiterTimer=Math.max(0,_revLimiterTimer-dt*3);}
}

// ══ GAP DISPLAY ══════════════════════════════
function updateGapDisplay(){
  const pos=getPositions();
  const pIdx=pos.findIndex(c=>c.isPlayer);
  const gapEl=document.getElementById('hudGap');
  if(!gapEl||!_elGapAhead||!_elGapBehind)return;
  if(pIdx<0){gapEl.style.display='none';return;}
  gapEl.style.display='block';
  const refLap=bestLapTime<Infinity?bestLapTime:60; // use best lap time as scale
  // Car ahead
  if(pIdx>0){
    const ahead=pos[pIdx-1];
    const pg=(ahead.lap-pos[pIdx].lap)+(ahead.progress-pos[pIdx].progress);
    const sec=Math.abs(pg)*refLap;
    _elGapAhead.textContent='▲ P'+(pIdx)+' +'+sec.toFixed(1)+'s';
    _elGapAhead.style.display='block';
  }else{_elGapAhead.style.display='none';}
  // Car behind
  if(pIdx<pos.length-1){
    const behind=pos[pIdx+1];
    const pg=(pos[pIdx].lap-behind.lap)+(pos[pIdx].progress-behind.progress);
    const sec=Math.abs(pg)*refLap;
    _elGapBehind.textContent='▼ P'+(pIdx+2)+' -'+sec.toFixed(1)+'s';
    _elGapBehind.style.display='block';
  }else{_elGapBehind.style.display='none';}
}

// ══ COLLISION FLASH ══════════════════════════
function updateCollisionFlash(dt){
  if(_contactPopupCD>0)_contactPopupCD-=dt;
  if(_colFlashT<=0)return;
  _colFlashT=Math.max(0,_colFlashT-dt);
  const el=document.getElementById('colFlash');
  if(el)el.style.opacity=String(Math.min(1,_colFlashT/.22));
}

// ══ QUICK RESTART ════════════════════════════
function updateQuickRestart(dt){
  const holding=keys['KeyR']&&gameState==='RACE';
  const bar=document.getElementById('rstBar'),fill=document.getElementById('rstFill');
  const lbl=document.getElementById('rstLabel');
  if(holding){
    _rstHold=Math.min(1.5,_rstHold+dt);
    if(bar){bar.style.display='block';}
    if(lbl){lbl.style.display='block';}
    if(fill)fill.style.width=(_rstHold/1.5*100)+'%';
    if(_rstHold>=1.5){
      _rstHold=0;
      if(bar)bar.style.display='none';if(lbl)lbl.style.display='none';
      goToSelectAgain();
    }
  }else{
    if(_rstHold>0){_rstHold=Math.max(0,_rstHold-dt*3);}
    if(_rstHold<=0){if(bar)bar.style.display='none';if(lbl)lbl.style.display='none';}
    else if(fill)fill.style.width=(_rstHold/1.5*100)+'%';
  }
}

// ══ WEATHER FORECAST (MID-RACE) ══════════════
function updateWeatherForecast(dt){
  if(_weatherForecastFired||gameState!=='RACE')return;
  _weatherForecastTimer-=dt;
  if(_weatherForecastTimer<=8&&_weatherForecastTimer>7.9){
    // 8s warning before change
    const incoming=isRain?'☀ CLEARING UP':'🌧 RAIN INCOMING';
    showBanner(incoming,'#88ccff',2200);
  }
  if(_weatherForecastTimer<=0){
    _weatherForecastFired=true;
    toggleRain();
  }
}

// ══ REAR VIEW MIRROR ═════════════════════════
function updateMirror(){
  const car=carObjs[playerIdx];
  if(!car||!mirrorCamera||!_mirrorEnabled||_camView!==0)return;
  const mf=document.getElementById('mirrorFrame'),ml=document.getElementById('mirrorLabel');
  // Hide mirror during the countdown so it doesn't clash with the start lights overlay
  if(gameState==='COUNTDOWN'){if(mf)mf.style.display='none';if(ml)ml.style.display='none';return;}
  if(mf)mf.style.display='block';if(ml)ml.style.display='block';

  // Position mirror camera inside car cabin looking backward
  const fwd=_camV1.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
  mirrorCamera.position.copy(car.mesh.position)
    .addScaledVector(fwd,-0.5);
  mirrorCamera.position.y+=0.75;
  // Look in the forward direction (mirror = see what's behind you)
  mirrorCamera.rotation.copy(car.mesh.rotation);
  mirrorCamera.rotation.y+=Math.PI; // face backward

  // Three.js setViewport/setScissor expect CSS pixels — it multiplies by pixelRatio internally.
  // Passing physical (DPR-multiplied) pixels here caused the main viewport to be 2× too large
  // on iPad (DPR=2), zooming the whole scene 2× and pushing the player car off-screen right.
  const cW=innerWidth,cH=innerHeight;
  const mw=204,mh=82;
  const mx=Math.round((cW-mw)/2); // center-aligned to match CSS left:50% translateX(-50%)
  const topPx=14;
  const myGl=cH-topPx-mh;

  renderer.setViewport(mx,myGl,mw,mh);
  renderer.setScissor(mx,myGl,mw,mh);
  renderer.setScissorTest(true);
  mirrorCamera.aspect=mw/mh;mirrorCamera.updateProjectionMatrix();
  renderer.render(scene,mirrorCamera);
  renderer.setScissorTest(false);
  renderer.setViewport(0,0,cW,cH);
}

// ══ RPM BAR ════════════════════════════════
const _RPM_GRAD_REDLINE='linear-gradient(180deg,#ff0000,#ff4400)';
const _RPM_GRAD_NORMAL='linear-gradient(180deg,#00cc88,#00ff99)';
const _RPM_GEAR_RANGES=[0,.18,.36,.54,.72,.9];
let _lastRedline=null;
function updateRpmBar(dt){
  if(!_elRpm)return;
  const car=carObjs[playerIdx];if(!car)return;
  const gear=_currentGear||1;
  const lo=_RPM_GEAR_RANGES[Math.max(0,gear-1)];
  const hi=_RPM_GEAR_RANGES[Math.min(4,gear)];
  const spd=Math.abs(car.speed);
  const top=car.def.topSpd;
  const ratio=hi>lo?Math.max(0,Math.min(1,(spd/top-lo)/(hi-lo))):spd/top;
  const isRedline=ratio>.88;
  _elRpm.style.height=(ratio*100)+'%';
  if(isRedline!==_lastRedline){
    _lastRedline=isRedline;
    _elRpm.style.background=isRedline?_RPM_GRAD_REDLINE:_RPM_GRAD_NORMAL;
  }
}

// ══ DAMAGE SMOKE PARTICLES ═════════════════���══
function updateDamageSmoke(){
  const car=carObjs[playerIdx];if(!car||!car.hitCount)return;
  const hits=car.hitCount;
  if(hits<3)return;
  const rate=hits>=6?0.38:0.18; // heavier smoke at more damage
  if(Math.random()<rate){
    const fwd=new THREE.Vector3(0,0,-1).applyQuaternion(car.mesh.quaternion);
    exhaustSystem.emit(
      car.mesh.position.x-fwd.x*1.2,
      car.mesh.position.y+0.9,
      car.mesh.position.z-fwd.z*1.2,
      (Math.random()-.5)*.02,0.025+Math.random()*.02,(Math.random()-.5)*.02,
      1,0.28,0.28,0.28,0.5
    );
  }
}

// ══ SET CAM VIEW (pause menu buttons) ════════
function setCamView(n){
  _camView=n;
  const names=['CHASE CAM','HELI CAM','HOOD CAM','BUMPER CAM'];
  showPopup(names[n],'#88ddff',900);
  // Highlight active button
  [0,1,2,3].forEach(i=>{
    const b=document.getElementById('pcam'+i);
    if(b)b.style.border=i===n?'2px solid #ff7700':'';
  });
}

// ══ AMBIENT WIND SPEED ══════════════════════
function updateAmbientWindSpeed(dt){
  if(!_ambientWindGain||!audioCtx)return;
  const car=carObjs[playerIdx];if(!car)return;
  const ratio=Math.abs(car.speed)/Math.max(car.def.topSpd,.01);
  const target=0.005+ratio*.065+(isRain?.018:0);
  const cur=_ambientWindGain.gain.value;
  // Smooth ramp — fast attack, slow release
  const rate=target>cur?8:2;
  _ambientWindGain.gain.value=cur+(target-cur)*Math.min(1,dt*rate);
}

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
