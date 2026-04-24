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
  if(_thunderTimer<=0){playThunder();_thunderTimer=9+Math.random()*20;}
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
// ══ TITLE MUSIC ══════════════════════════════
// Cinematic Am-F-C-G synth pad + beat, BPM 112
// ══ EXACT FREQUENCY LOOKUP (equal temperament, A4=440Hz) ════════════
function noteFreq(note,octave){
  const n={C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11};
  const midi=n[note]+(octave+1)*12;
  return 440*Math.pow(2,(midi-69)/12);
}
const NF=noteFreq; // shorthand

// ══ MUSIC MASTER + STATE ══════════════════════════════════════════════════
// Single source of truth for music volume. All music classes route via
// _musicMaster → _master (compressor) → _muteGain → destination.
let _musicMaster=null;
let _musicVolume=0.5;   // user-instelbaar (0..1)
let _musicMuted=false;  // separate van volume
let _musicDuck=1.0;     // multiplier (1.0 normaal, 0.4 bij pit stop)
function _ensureMusicMaster(){
  if(!audioCtx||_musicMaster)return;
  _musicMaster=audioCtx.createGain();
  _musicMaster.gain.value=_musicMuted?0:_musicVolume*_musicDuck;
  _musicMaster.connect(_master||audioCtx.destination);
}
function _applyMusicGain(rampSec=0.2){
  if(!_musicMaster||!audioCtx)return;
  const target=_musicMuted?0:_musicVolume*_musicDuck;
  const now=audioCtx.currentTime;
  try{
    _musicMaster.gain.cancelScheduledValues(now);
    _musicMaster.gain.setValueAtTime(_musicMaster.gain.value,now);
    _musicMaster.gain.linearRampToValueAtTime(target,now+rampSec);
  }catch(_){}
}
function _fadeOutMusic(scheduler,dur=0.8){
  if(!scheduler)return;
  if(!audioCtx||!scheduler._out){try{scheduler.stop();}catch(_){}return;}
  const now=audioCtx.currentTime;
  try{
    scheduler._out.gain.cancelScheduledValues(now);
    scheduler._out.gain.setValueAtTime(scheduler._out.gain.value,now);
    scheduler._out.gain.linearRampToValueAtTime(0,now+dur);
    setTimeout(()=>{try{scheduler.stop();}catch(_){}},dur*1000+100);
  }catch(_){try{scheduler.stop();}catch(_){}}
}
function _safeStartMusic(factoryFn){
  if(!audioCtx)return null;
  try{
    const m=factoryFn();
    if(m&&m.start)m.start();
    return m;
  }catch(e){console.warn('[music] start failed:',e.message);return null;}
}

// Debug helper — roep in console: _musicDebug()
if(typeof window!=='undefined'){
  window._musicDebug=function(){
    const info={
      musicMaster_gain: _musicMaster?_musicMaster.gain.value:null,
      _musicVolume: _musicVolume,
      _musicMuted: _musicMuted,
      _musicDuck: _musicDuck,
      active_scheduler: (typeof musicSched!=='undefined'&&musicSched)?(musicSched.constructor.name+'('+(musicSched.style||'')+')'):'none',
      title_scheduler: (typeof titleMusic!=='undefined'&&titleMusic)?titleMusic.constructor.name:'none',
      select_scheduler: (typeof selectMusic!=='undefined'&&selectMusic)?selectMusic.constructor.name:'none',
      osc_count: MusicLib._oscCount,
      ctx_state: audioCtx?audioCtx.state:'none',
      ctx_time: audioCtx?audioCtx.currentTime.toFixed(2):null,
      lite_mode: MusicLib.lite(),
      filt_freq: (typeof musicSched!=='undefined'&&musicSched&&musicSched._filt)?musicSched._filt.frequency.value:null,
      intensity: (typeof musicSched!=='undefined'&&musicSched)?musicSched.intensity:null,
      final_lap: (typeof musicSched!=='undefined'&&musicSched)?musicSched.finalLap:null
    };
    console.table(info);
    return info;
  };
}

// ══ MUSIC LIBRARY — gedeelde synth bouwstenen ══════════════════════════════
const MusicLib={
  _oscCount:0,
  lite:()=>(typeof window!=='undefined'&&window._isMobile===true),
  safeOsc(ctx){
    const max=MusicLib.lite()?80:200;
    if(MusicLib._oscCount>=max)return null;
    const o=ctx.createOscillator();
    MusicLib._oscCount++;
    o.addEventListener('ended',()=>{MusicLib._oscCount=Math.max(0,MusicLib._oscCount-1);});
    return o;
  },
  n(semiFromC4){return 261.63*Math.pow(2,semiFromC4/12);},
  chord(rootSemi,quality='major'){
    const iv=quality==='major'?[0,4,7]:quality==='minor'?[0,3,7]:[0,4,7,11];
    return iv.map(i=>MusicLib.n(rootSemi+i));
  },
  voicing(rootSemi,type='open'){
    const base=MusicLib.chord(rootSemi,type.includes('min')?'minor':'major');
    if(type==='open')return [base[0]*0.5,base[2],base[1]*2];
    if(type==='power')return [base[0],base[2]];
    if(type==='rich')return [base[0]*0.5,base[0],base[1],base[2],base[0]*2];
    return base;
  },
  kick(ctx,t,gain=0.6){
    const o=MusicLib.safeOsc(ctx);if(!o){const g=ctx.createGain();g.gain.value=0;return g;}
    const g=ctx.createGain();
    o.frequency.setValueAtTime(150,t);
    o.frequency.exponentialRampToValueAtTime(40,t+0.12);
    g.gain.setValueAtTime(gain,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+0.18);
    o.connect(g);o.start(t);o.stop(t+0.2);
    return g;
  },
  snare(ctx,t,gain=0.3){
    const sz=Math.ceil(ctx.sampleRate*0.1);
    const buf=ctx.createBuffer(1,sz,ctx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<sz;i++)d[i]=(Math.random()*2-1)*(1-i/sz);
    const src=ctx.createBufferSource();src.buffer=buf;
    const g=ctx.createGain();
    const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=1800;
    g.gain.value=gain;
    src.connect(f);f.connect(g);src.start(t);
    return g;
  },
  hat(ctx,t,gain=0.15,open=false){
    const dur=open?0.15:0.04;
    const sz=Math.ceil(ctx.sampleRate*dur);
    const buf=ctx.createBuffer(1,sz,ctx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
    const src=ctx.createBufferSource();src.buffer=buf;
    const g=ctx.createGain();
    const f=ctx.createBiquadFilter();f.type='highpass';f.frequency.value=7000;
    g.gain.setValueAtTime(gain,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    src.connect(f);f.connect(g);src.start(t);
    return g;
  },
  pluck(ctx,t,freq,dur=0.2,gain=0.2){
    const o=MusicLib.safeOsc(ctx);if(!o){const g=ctx.createGain();g.gain.value=0;return g;}
    const g=ctx.createGain();
    const f=ctx.createBiquadFilter();f.type='lowpass';
    f.frequency.setValueAtTime(freq*6,t);
    f.frequency.exponentialRampToValueAtTime(freq*2,t+dur);
    o.type='sawtooth';o.frequency.value=freq;
    g.gain.setValueAtTime(gain,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.connect(f);f.connect(g);o.start(t);o.stop(t+dur+0.05);
    return g;
  },
  pad(ctx,t,freq,dur,gain=0.08){
    const g=ctx.createGain();
    const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=1200;f.Q.value=0.8;
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(gain,t+0.3);
    g.gain.linearRampToValueAtTime(gain,t+dur-0.4);
    g.gain.linearRampToValueAtTime(0,t+dur);
    // Mobile lite: 1 osc i.p.v. 3 detuned (3x minder oscillators voor pads)
    const detunes=MusicLib.lite()?[1]:[1,1.005,0.995];
    detunes.forEach(det=>{
      const o=MusicLib.safeOsc(ctx);if(!o)return;
      o.type='sawtooth';o.frequency.value=freq*det;
      o.connect(f);o.start(t);o.stop(t+dur+0.1);
    });
    f.connect(g);
    return g;
  },
  bass(ctx,t,freq,dur=0.2,gain=0.4){
    const o=MusicLib.safeOsc(ctx);if(!o){const g=ctx.createGain();g.gain.value=0;return g;}
    const g=ctx.createGain();
    const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=freq*4;
    o.type='square';o.frequency.value=freq;
    g.gain.setValueAtTime(gain,t);
    g.gain.setValueAtTime(gain,t+dur*0.8);
    g.gain.exponentialRampToValueAtTime(0.001,t+dur);
    o.connect(f);f.connect(g);o.start(t);o.stop(t+dur+0.05);
    return g;
  },
  tom(ctx,t,freq=120,gain=0.5){
    const o=MusicLib.safeOsc(ctx);if(!o){const g=ctx.createGain();g.gain.value=0;return g;}
    const g=ctx.createGain();
    o.type='sine';
    o.frequency.setValueAtTime(freq,t);
    o.frequency.exponentialRampToValueAtTime(freq*0.4,t+0.24);
    g.gain.setValueAtTime(gain,t);
    g.gain.exponentialRampToValueAtTime(0.001,t+0.32);
    o.connect(g);o.start(t);o.stop(t+0.35);
    return g;
  }
};

class TitleMusic{
  constructor(ctx){
    this.ctx=ctx;this.running=false;this.beat=0;
    _ensureMusicMaster();
    this._out=ctx.createGain();
    this._out.gain.value=0.9;
    // Nitro filter always present (inactive = 20 Hz highpass = ~off).
    // Title scheduler never toggles nitro, maar keten moet consistent zijn.
    this._filt=ctx.createBiquadFilter();
    this._filt.type='highpass';this._filt.frequency.value=20;
    this._out.connect(this._filt);
    this._filt.connect(_musicMaster||_master||audioCtx.destination);
    this.bpm=116;this.bd=60/this.bpm;this.nextBeat=0;
    this.sectionLength=64;  // 32 bars bij 8th-note telling — A/B wissel
    // Am→F→C→G→Am→Em→F→G→Dm→Am→Bb→F→Am→G/B→C→E  (16 chords, 8 beats each)
    this.chords=[
      [NF('A',3),NF('C',4),NF('E',4)],         // Am
      [NF('F',3),NF('A',3),NF('C',4)],          // F
      [NF('C',3),NF('E',3),NF('G',3)],          // C
      [NF('G',3),NF('B',3),NF('D',4)],          // G
      [NF('A',3),NF('C',4),NF('E',4)],          // Am
      [NF('E',3),NF('G',3),NF('B',3)],          // Em
      [NF('F',3),NF('A',3),NF('C',4)],          // F
      [NF('G',3),NF('B',3),NF('D',4)],          // G
      [NF('D',3),NF('F',3),NF('A',3)],          // Dm
      [NF('A',3),NF('C',4),NF('E',4)],          // Am
      [NF('Bb',3),NF('D',4),NF('F',4)],         // Bb
      [NF('F',3),NF('A',3),NF('C',4)],          // F
      [NF('A',3),NF('C',4),NF('E',4)],          // Am
      [NF('B',2),NF('D',3),NF('G',3)],          // G/B
      [NF('C',3),NF('E',3),NF('G',3)],          // C
      [NF('E',3),NF('G#',3),NF('B',3)],         // E (dominant)
    ];
    // Bass: root of each chord in octave 2
    this.bass=[NF('A',2),NF('F',2),NF('C',2),NF('G',2),NF('A',2),NF('E',2),NF('F',2),NF('G',2),
               NF('D',2),NF('A',2),NF('Bb',2),NF('F',2),NF('A',2),NF('B',2),NF('C',3),NF('E',2)];
    // Pentatonic melody in Am — 16 half-note melody notes matching the 16 chords
    this.mel=[NF('A',4),NF('C',5),NF('E',5),NF('D',5),NF('C',5),NF('B',4),NF('A',4),NF('G',4),
              NF('F',4),NF('A',4),NF('G',4),NF('F',4),NF('E',4),NF('G',4),NF('A',4),NF('A',4)];
  }
  start(){this.running=true;this._gen=(this._gen||0)+1;this.nextBeat=this.ctx.currentTime+.06;this._s(this._gen);}
  stop(){this.running=false;}

  _kick(t,v=.52){
    const ctx=this.ctx;
    // Sub body: pitch sweep 165→32Hz
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type='sine';o.frequency.setValueAtTime(165,t);o.frequency.exponentialRampToValueAtTime(32,t+.13);
    g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+.22);
    o.connect(g);g.connect(this._out);o.start(t);o.stop(t+.24);
    // Punch transient: short bandpass noise burst
    const sz=Math.ceil(ctx.sampleRate*.007),buf=ctx.createBuffer(1,sz,ctx.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
    const src=ctx.createBufferSource(),bp=ctx.createBiquadFilter(),ng=ctx.createGain();
    bp.type='bandpass';bp.frequency.value=4200;bp.Q.value=1.8;
    ng.gain.setValueAtTime(v*.35,t);ng.gain.exponentialRampToValueAtTime(.001,t+.009);
    src.buffer=buf;src.connect(bp);bp.connect(ng);ng.connect(this._out);src.start(t);src.stop(t+.012);
  }

  _snare(t,v=.22){
    const ctx=this.ctx;
    // Noise body — bandpass around 1700Hz, 0.13s tail
    const sz=Math.ceil(ctx.sampleRate*.13),buf=ctx.createBuffer(1,sz,ctx.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
    const src=ctx.createBufferSource(),bf=ctx.createBiquadFilter(),g=ctx.createGain();
    bf.type='bandpass';bf.frequency.value=1700;bf.Q.value=.75;
    g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+.13);
    src.buffer=buf;src.connect(bf);bf.connect(g);g.connect(this._out);src.start(t);src.stop(t+.15);
    // Tonal body for presence
    const o=ctx.createOscillator(),og=ctx.createGain();
    o.type='triangle';o.frequency.setValueAtTime(210,t);o.frequency.exponentialRampToValueAtTime(130,t+.07);
    og.gain.setValueAtTime(v*.45,t);og.gain.exponentialRampToValueAtTime(.001,t+.10);
    o.connect(og);og.connect(this._out);o.start(t);o.stop(t+.12);
  }

  _hat(t,v=.018){
    const vel=v*(0.65+Math.random()*.7); // humanized
    const sz=Math.ceil(this.ctx.sampleRate*.042),buf=this.ctx.createBuffer(1,sz,this.ctx.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
    const src=this.ctx.createBufferSource(),hf=this.ctx.createBiquadFilter(),g=this.ctx.createGain();
    hf.type='highpass';hf.frequency.value=7800;
    g.gain.setValueAtTime(vel,t);g.gain.exponentialRampToValueAtTime(.001,t+.04);
    src.buffer=buf;src.connect(hf);hf.connect(g);g.connect(this._out);src.start(t);src.stop(t+.05);
  }

  // Supersaw pad: 3 detuned sawtooths + lowpass for warmth
  _superSaw(t,freq,vol,dur,filterF=1400){
    const dets=MusicLib.lite()?[0]:[-8,0,8];
    dets.forEach(det=>{
      const o=this.ctx.createOscillator(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();
      o.type='sawtooth';o.frequency.value=freq;o.detune.value=det;
      f.type='lowpass';f.frequency.value=filterF;f.Q.value=1.1;
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol/dets.length,t+.10);
      g.gain.setValueAtTime(vol/dets.length,t+dur*.72);g.gain.exponentialRampToValueAtTime(.001,t+dur);
      o.connect(f);f.connect(g);g.connect(this._out);o.start(t);o.stop(t+dur+.05);
    });
  }

  // Soft triangle pad for gentle chord swell
  _pad(t,freqs,dur,vol){
    freqs.forEach((freq,i)=>{
      const o=this.ctx.createOscillator(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();
      o.type='triangle';o.frequency.value=freq;o.detune.value=(i%2===0?3:-3);
      f.type='lowpass';f.frequency.value=600+i*80;
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol/(freqs.length+1),t+dur*.22);
      g.gain.setValueAtTime(vol/(freqs.length+1),t+dur*.68);g.gain.linearRampToValueAtTime(0,t+dur);
      o.connect(f);f.connect(g);g.connect(this._out);o.start(t);o.stop(t+dur+.08);
    });
  }

  // Lead: filtered sawtooth with filter envelope (warmer than square)
  _lead(t,freq,dur,vol=.038){
    const dets=MusicLib.lite()?[0]:[-5,5];
    dets.forEach(det=>{
      const o=this.ctx.createOscillator(),g=this.ctx.createGain(),f=this.ctx.createBiquadFilter();
      o.type='sawtooth';o.frequency.value=freq;o.detune.value=det;
      f.type='lowpass';f.Q.value=2.2;
      f.frequency.setValueAtTime(750,t);f.frequency.linearRampToValueAtTime(2400,t+.022);
      f.frequency.exponentialRampToValueAtTime(580,t+dur);
      g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vol/dets.length,t+.012);
      g.gain.setValueAtTime(vol/dets.length,t+dur*.78);g.gain.exponentialRampToValueAtTime(.001,t+dur);
      o.connect(f);f.connect(g);g.connect(this._out);o.start(t);o.stop(t+dur+.04);
    });
  }

  _s(gen){
    if(!this.running||gen!==this._gen)return;
    const ctx=this.ctx;
    while(this.nextBeat<ctx.currentTime+.28){
      const t=this.nextBeat,bd=this.bd,bi=this.beat%32;
      const chordIdx=Math.floor(this.beat/8)%16;
      const melIdx=Math.floor(this.beat/4)%16;
      // A/B section — every 64 8th-beats we toggle (B = answer phrase + denser hats)
      const section=Math.floor(this.beat/this.sectionLength)%2;
      const isB=section===1;

      // Drums — kick on 1&3, snare on 2&4
      if(bi===0||bi===16)this._kick(t,.54);
      if(bi===8||bi===24)this._kick(t,.30);
      if(bi===8||bi===24)this._snare(t,.22);
      this._hat(t,.018);
      if(bi%2===0)this._hat(t+bd*.5,.012);
      if(bi%4===2)this._hat(t+bd*.25,.007);
      // B-section: extra 16th hats for density
      if(isB&&bi%2===1)this._hat(t+bd*.5,.010);

      // Bass — filtered sawtooth, note matches chord root
      if(bi%4===0){
        const bassNote=this.bass[chordIdx];
        const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
        o.type='sawtooth';f.type='lowpass';f.Q.value=2.4;
        o.frequency.value=bassNote;
        f.frequency.setValueAtTime(170,t);f.frequency.exponentialRampToValueAtTime(560,t+bd*.32);
        f.frequency.exponentialRampToValueAtTime(170,t+bd*1.85);
        g.gain.setValueAtTime(.20,t);g.gain.exponentialRampToValueAtTime(.001,t+bd*3.9);
        o.connect(f);f.connect(g);g.connect(this._out);o.start(t);o.stop(t+bd*4.1);
      }

      // Supersaw chord pads (every 8 beats — one full bar per chord)
      if(bi%8===0){
        const chord=this.chords[chordIdx];
        chord.forEach((freq,i)=>{
          const delay=i*.060;
          this._superSaw(t+delay,freq,.036,bd*7.6,1200+i*150);
        });
        this._pad(t,chord,bd*7.8,.055);
      }

      // Lead melody every 4 beats. B-section transposeert +3 semitonen voor answer-phrase.
      if(bi%4===0){
        const baseFreq=this.mel[melIdx];
        const mf=isB?baseFreq*Math.pow(2,3/12):baseFreq;
        this._lead(t,mf,bd*3.8,.036);
        this._lead(t+.200,mf,bd*3.4,.013);
      }

      this.nextBeat+=bd;this.beat++;
    }
    setTimeout(()=>this._s(gen),14);
  }
}

// ══ SELECT MUSIC — anticipation loop voor car/world select ═════════════════
// 105 BPM, Dm (blijft in de titel-familie voor soepele crossfade).
// Luchtiger dan title: minder dicht, meer ruimte.
class SelectMusic{
  constructor(ctx){
    this.ctx=ctx;this.running=false;this.beat=0;
    _ensureMusicMaster();
    this._out=ctx.createGain();
    this._out.gain.value=0.85;
    this._filt=ctx.createBiquadFilter();
    this._filt.type='highpass';this._filt.frequency.value=20;
    this._out.connect(this._filt);
    this._filt.connect(_musicMaster||_master||audioCtx.destination);
    this.bpm=105;this.bd=60/this.bpm;this.nextBeat=0;
    this.sectionLength=64;
    // Dm → F → Am → C  (minor-warm progression)
    this.progA=[
      MusicLib.chord(-10,'minor'),   // Dm
      MusicLib.chord(-7,'major'),    // F
      MusicLib.chord(-3,'minor'),    // Am
      MusicLib.chord(-12,'major')    // C
    ];
    this.progB=[
      MusicLib.chord(-10,'minor'),   // Dm
      MusicLib.chord(-5,'major'),    // G
      MusicLib.chord(-7,'major'),    // F
      MusicLib.chord(-12,'major')    // C
    ];
  }
  start(){this.running=true;this._gen=(this._gen||0)+1;this.nextBeat=this.ctx.currentTime+.08;this.beat=0;this._s(this._gen);}
  stop(){this.running=false;this._gen=(this._gen||0)+1;}
  _s(gen){
    if(!this.running||gen!==this._gen)return;
    while(this.nextBeat<this.ctx.currentTime+.3){
      this._beat(this.nextBeat,this.beat);
      this.nextBeat+=this.bd/2;
      this.beat++;
    }
    setTimeout(()=>this._s(gen),15);
  }
  _beat(t,n){
    const section=Math.floor(n/this.sectionLength)%2;
    const prog=section===0?this.progA:this.progB;
    const chord=prog[Math.floor(n/8)%prog.length];
    // Velocity variation: accent op 1, soft op off-beats
    const vel=n%4===0?1.0:0.82;

    // Hat op elke 8th, open hat op 4
    MusicLib.hat(this.ctx,t,0.08*vel,n%4===0).connect(this._out);
    // Kick op 1 en 3
    if(n%4===0)MusicLib.kick(this.ctx,t,0.22).connect(this._out);
    // Bass pulse op 1 en 2.5
    if(n%8===0||n%8===3){
      MusicLib.bass(this.ctx,t,chord[0]*0.5,this.bd*0.7,0.20).connect(this._out);
    }
    // Pad elke chord change (elke 8 8th-notes)
    if(n%8===0){
      chord.forEach(f=>MusicLib.pad(this.ctx,t,f,this.bd*4,0.035).connect(this._out));
    }
    // Anticipation pluck: subtiel elke 4 bars op octaaf-boven
    if(n%32===16){
      MusicLib.pluck(this.ctx,t,chord[2]*2,this.bd*1.3,0.09).connect(this._out);
    }
    // B-section: extra shaker feel op odd 8ths
    if(section===1&&n%2===1){
      MusicLib.hat(this.ctx,t+this.bd*0.25,0.04).connect(this._out);
    }
  }
}

// ══ RACE MUSIC ════════════════════════════════
// World-aware: 8 distinct themes — GP techno, Space synthwave, DeepSea dub,
// Candy happy-chip, NeonCity cyberpunk, Volcano aggressive, Arctic ethereal, Thrillpark carnival
class RaceMusic{
  constructor(ctx){
    this.ctx=ctx;this.running=false;this.beat=0;this.bar=0;
    this.style=activeWorld||'grandprix';
    const BPM={grandprix:150,space:132,deepsea:118,candy:140,neoncity:128,volcano:165,arctic:105,themepark:155};
    this.bpm=BPM[this.style]||150;
    this.bd=60/this.bpm;this.nextBeat=0;
    this.finalLap=false;
    this.intensity=0;  // 0 normaal, 1 = final-lap urgency
    // Per-world _out.gain calibratie — gelijke perceived loudness tussen werelden
    const VOL={grandprix:0.75,space:0.9,deepsea:1.0,candy:0.65,neoncity:0.8,volcano:0.75,arctic:0.85,themepark:0.8};
    _ensureMusicMaster();
    this._out=ctx.createGain();
    this._out.gain.value=VOL[this.style]||0.8;
    // DeepSea krijgt lowpass in de keten vóór de nitro-highpass (onder water gevoel)
    const destTail=_musicMaster||_master||audioCtx.destination;
    if(this.style==='deepsea'){
      this._filtLow=ctx.createBiquadFilter();
      this._filtLow.type='lowpass';
      this._filtLow.frequency.value=2500;
      this._filt=ctx.createBiquadFilter();
      this._filt.type='highpass';this._filt.frequency.value=20;
      this._out.connect(this._filtLow);
      this._filtLow.connect(this._filt);
      this._filt.connect(destTail);
    }else{
      this._filt=ctx.createBiquadFilter();
      this._filt.type='highpass';this._filt.frequency.value=20;
      this._out.connect(this._filt);
      this._filt.connect(destTail);
    }

    // === GRAND PRIX: aggressive techno in A minor ===
    if(this.style==='grandprix'){
      this.bass=[NF('A',2),NF('A',2),NF('E',2),NF('E',2),NF('F',2),NF('F',2),NF('G',2),NF('G',2),
                 NF('A',2),NF('A',2),NF('C',3),NF('C',3),NF('G',2),NF('G',2),NF('E',2),NF('E',2)];
      this.lead=[NF('A',4),NF('E',5),NF('D',5),NF('C',5),NF('E',5),NF('D',5),NF('C',5),NF('A',4),
                 NF('G',4),NF('A',4),NF('C',5),NF('E',5),NF('D',5),NF('C',5),NF('B',4),NF('A',4)];
    // === SPACE: synthwave — E minor ===
    }else if(this.style==='space'){
      this.bass=[NF('E',2),NF('E',2),NF('B',1),NF('B',1),NF('C',2),NF('C',2),NF('A',1),NF('A',1),
                 NF('G',1),NF('G',1),NF('A',1),NF('B',1),NF('C',2),NF('D',2),NF('E',2),NF('E',2)];
      this.lead=[NF('E',5),NF('B',5),NF('A',5),NF('G',5),NF('F#',5),NF('E',5),NF('D',5),NF('B',4),
                 NF('C',5),NF('E',5),NF('G',5),NF('A',5),NF('B',5),NF('A',5),NF('G',5),NF('E',5)];
    // === CANDY (Sugar Rush): bouncy chiptune happy C major ===
    }else if(this.style==='candy'){
      this.bass=[NF('C',2),NF('C',3),NF('G',2),NF('G',2),NF('A',2),NF('A',2),NF('F',2),NF('F',2),
                 NF('C',2),NF('C',3),NF('G',2),NF('E',3),NF('F',2),NF('A',2),NF('G',2),NF('C',3)];
      this.lead=[NF('C',5),NF('E',5),NF('G',5),NF('E',5),NF('A',5),NF('G',5),NF('E',5),NF('C',5),
                 NF('D',5),NF('F',5),NF('A',5),NF('F',5),NF('G',5),NF('E',5),NF('D',5),NF('C',5)];
    // === NEON CITY: dark cyberpunk — D minor + chromatics ===
    }else if(this.style==='neoncity'){
      this.bass=[NF('D',2),NF('D',2),NF('D',2),NF('A',1),NF('Bb',1),NF('Bb',1),NF('F',2),NF('F',2),
                 NF('D',2),NF('D',2),NF('G',1),NF('G',1),NF('C',2),NF('C',2),NF('A',1),NF('D',2)];
      this.lead=[NF('D',5),NF('F',5),NF('A',5),NF('G',5),NF('F',5),NF('D',5),NF('C',5),NF('A',4),
                 NF('Bb',4),NF('D',5),NF('F',5),NF('G',5),NF('A',5),NF('F',5),NF('E',5),NF('D',5)];
    // === VOLCANO: aggressive phrygian E ===
    }else if(this.style==='volcano'){
      this.bass=[NF('E',2),NF('E',2),NF('E',2),NF('E',2),NF('F',2),NF('F',2),NF('G',2),NF('F',2),
                 NF('E',2),NF('E',2),NF('A',2),NF('G',2),NF('F',2),NF('E',2),NF('D',2),NF('E',2)];
      this.lead=[NF('E',5),NF('G',5),NF('A',5),NF('G',5),NF('F',5),NF('E',5),NF('D',5),NF('E',5),
                 NF('B',5),NF('A',5),NF('G',5),NF('F',5),NF('E',5),NF('F',5),NF('G',5),NF('E',5)];
    // === ARCTIC: ethereal slow F# minor ===
    }else if(this.style==='arctic'){
      this.bass=[NF('F#',1),NF('F#',1),NF('F#',1),NF('F#',1),NF('D',2),NF('D',2),NF('D',2),NF('D',2),
                 NF('A',1),NF('A',1),NF('A',1),NF('A',1),NF('E',2),NF('E',2),NF('E',2),NF('C#',2)];
      this.lead=[NF('F#',4),NF('A',4),NF('C#',5),NF('E',5),NF('D',5),NF('C#',5),NF('A',4),NF('F#',4),
                 NF('A',4),NF('C#',5),NF('D',5),NF('E',5),NF('C#',5),NF('A',4),NF('F#',4),NF('E',4)];
    // === THRILL PARK: carnival/calliope G major oom-pah ===
    }else if(this.style==='themepark'){
      this.bass=[NF('G',2),NF('D',3),NF('G',2),NF('D',3),NF('C',3),NF('G',2),NF('C',3),NF('G',2),
                 NF('A',2),NF('D',3),NF('A',2),NF('D',3),NF('G',2),NF('D',3),NF('G',2),NF('D',3)];
      this.lead=[NF('G',5),NF('B',5),NF('D',6),NF('B',5),NF('C',6),NF('A',5),NF('G',5),NF('E',5),
                 NF('F#',5),NF('A',5),NF('D',6),NF('B',5),NF('G',5),NF('B',5),NF('A',5),NF('G',5)];
    // === DEEP SEA: downtempo dub A minor ===
    }else{
      this.bass=[NF('A',1),NF('A',1),NF('A',1),NF('G',1),NF('F',1),NF('F',1),NF('G',1),NF('G',1),
                 NF('A',1),NF('A',1),NF('E',1),NF('E',1),NF('D',2),NF('D',2),NF('E',1),NF('A',1)];
      this.lead=[NF('A',3),NF('C',4),NF('E',4),NF('D',4),NF('C',4),NF('A',3),NF('G',3),NF('E',3),
                 NF('F',3),NF('A',3),NF('G',3),NF('E',3),NF('D',3),NF('E',3),NF('A',3),NF('C',4)];
    }
    // Chord stabs — per-world palette
    const STABS={
      grandprix:[[NF('A',2),NF('E',3),NF('A',3)],[NF('F',2),NF('C',3),NF('F',3)],[NF('C',3),NF('G',3),NF('C',4)],[NF('G',2),NF('D',3),NF('G',3)]],
      space:[[NF('A',2),NF('E',3),NF('A',3)],[NF('F',2),NF('C',3),NF('F',3)],[NF('C',3),NF('G',3),NF('C',4)],[NF('G',2),NF('D',3),NF('G',3)]],
      candy:[[NF('C',3),NF('E',3),NF('G',3)],[NF('G',2),NF('B',2),NF('D',3)],[NF('A',2),NF('C',3),NF('E',3)],[NF('F',2),NF('A',2),NF('C',3)]],
      neoncity:[[NF('D',3),NF('F',3),NF('A',3)],[NF('Bb',2),NF('D',3),NF('F',3)],[NF('G',2),NF('Bb',2),NF('D',3)],[NF('A',2),NF('C',3),NF('E',3)]],
      volcano:[[NF('E',3),NF('G',3),NF('B',3)],[NF('F',3),NF('A',3),NF('C',4)],[NF('G',3),NF('B',3),NF('D',4)],[NF('E',3),NF('G',3),NF('B',3)]],
      arctic:[[NF('F#',3),NF('A',3),NF('C#',4)],[NF('D',3),NF('F#',3),NF('A',3)],[NF('A',2),NF('C#',3),NF('E',3)],[NF('E',3),NF('G#',3),NF('B',3)]],
      themepark:[[NF('G',3),NF('B',3),NF('D',4)],[NF('C',3),NF('E',3),NF('G',3)],[NF('D',3),NF('F#',3),NF('A',3)],[NF('G',3),NF('B',3),NF('D',4)]],
    };
    this.stabs=STABS[this.style]||STABS.grandprix;
  }

  start(){this.running=true;this._gen=(this._gen||0)+1;this.nextBeat=this.ctx.currentTime+.05;this._s(this._gen);}
  stop(){this.running=false;this._gen=(this._gen||0)+1;}

  // Nitro: highpass filter opent → lichter, meer "opwinding"
  setNitro(active){
    if(!this._filt||!this.ctx)return;
    const target=active?350:20;
    const now=this.ctx.currentTime;
    try{
      this._filt.frequency.cancelScheduledValues(now);
      this._filt.frequency.setValueAtTime(this._filt.frequency.value,now);
      this._filt.frequency.linearRampToValueAtTime(target,now+0.3);
    }catch(_){}
  }

  // Intensity 0 = normaal, 1 = final lap urgency (dichter hat-patroon)
  setIntensity(level){this.intensity=level|0;}

  setFinalLap(){
    if(this.finalLap)return;this.finalLap=true;if(!audioCtx)return;
    const t=audioCtx.currentTime+.05;
    this._crash(t);
    // Rising chord fanfare using exact notes
    [[NF('A',3),NF('C',4),NF('E',4)],[NF('E',4),NF('G',4),NF('B',4)]].forEach((chord,ci)=>{
      chord.forEach(fr=>{
        const o=audioCtx.createOscillator(),g=audioCtx.createGain();
        o.type='sawtooth';o.frequency.value=fr;
        g.gain.setValueAtTime(.042,t+ci*.22);g.gain.exponentialRampToValueAtTime(.001,t+ci*.22+.40);
        o.connect(g);g.connect(this._out);o.start(t+ci*.22);o.stop(t+ci*.22+.44);
      });
    });
  }

  _crash(t){
    const dur=1.7,sz=Math.ceil(this.ctx.sampleRate*dur),buf=this.ctx.createBuffer(1,sz,this.ctx.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
    const src=this.ctx.createBufferSource(),hf=this.ctx.createBiquadFilter(),g=this.ctx.createGain();
    hf.type='highpass';hf.frequency.value=3800;
    g.gain.setValueAtTime(.14,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
    src.buffer=buf;src.connect(hf);hf.connect(g);g.connect(this._out);src.start(t);src.stop(t+dur+.1);
  }

  _kick(t,vol){
    const ctx=this.ctx;
    const F0={grandprix:210,space:185,deepsea:155,candy:195,neoncity:170,volcano:235,arctic:140,themepark:200};
    const F1={grandprix:42,space:35,deepsea:25,candy:50,neoncity:30,volcano:48,arctic:30,themepark:45};
    const V ={grandprix:.72,space:.58,deepsea:.82,candy:.60,neoncity:.75,volcano:.85,arctic:.45,themepark:.68};
    const f0=F0[this.style]||210,f1=F1[this.style]||42;
    const v=vol||V[this.style]||.72;
    const o=ctx.createOscillator(),g=ctx.createGain();
    o.type='sine';o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+.11);
    g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+.19);
    o.connect(g);g.connect(this._out);o.start(t);o.stop(t+.21);
    // Punch transient
    const sz=Math.ceil(ctx.sampleRate*.007),buf=ctx.createBuffer(1,sz,ctx.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
    const src=ctx.createBufferSource(),bp=ctx.createBiquadFilter(),ng=ctx.createGain();
    bp.type='bandpass';bp.frequency.value=4500;bp.Q.value=2;
    ng.gain.setValueAtTime(v*.32,t);ng.gain.exponentialRampToValueAtTime(.001,t+.009);
    src.buffer=buf;src.connect(bp);bp.connect(ng);ng.connect(this._out);src.start(t);src.stop(t+.012);
  }

  _snare(t,v=.24){
    const ctx=this.ctx;
    // Noise body
    const NL={grandprix:.12,space:.17,deepsea:.08,candy:.10,neoncity:.14,volcano:.09,arctic:.22,themepark:.11};
    const BF={grandprix:1600,space:1200,deepsea:800,candy:1900,neoncity:1400,volcano:1750,arctic:1100,themepark:1500};
    const noiseLen=NL[this.style]||.12,bpFreq=BF[this.style]||1600;
    const sz=Math.ceil(ctx.sampleRate*noiseLen),buf=ctx.createBuffer(1,sz,ctx.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
    const src=ctx.createBufferSource(),bf=ctx.createBiquadFilter(),g=ctx.createGain();
    bf.type='bandpass';bf.frequency.value=bpFreq;bf.Q.value=.8;
    g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+noiseLen);
    src.buffer=buf;src.connect(bf);bf.connect(g);g.connect(this._out);src.start(t);src.stop(t+noiseLen+.02);
    // Tonal body (skip for deepsea rimshot)
    if(this.style!=='deepsea'){
      const o=ctx.createOscillator(),og=ctx.createGain();
      o.type='triangle';o.frequency.setValueAtTime(220,t);o.frequency.exponentialRampToValueAtTime(155,t+.07);
      og.gain.setValueAtTime(v*.45,t);og.gain.exponentialRampToValueAtTime(.001,t+.10);
      o.connect(og);og.connect(this._out);o.start(t);o.stop(t+.12);
    }
  }

  _hat(t,v=.022,open=false){
    const vel=v*(0.62+Math.random()*.76);
    const dur=open?(this.style==='space'||this.style==='arctic'?.32:.20):.038;
    const sz=Math.ceil(this.ctx.sampleRate*dur),buf=this.ctx.createBuffer(1,sz,this.ctx.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<sz;i++)d[i]=Math.random()*2-1;
    const src=this.ctx.createBufferSource(),hf=this.ctx.createBiquadFilter(),g=this.ctx.createGain();
    const HF={grandprix:9000,space:7000,deepsea:5500,candy:9500,neoncity:8500,volcano:9200,arctic:6500,themepark:8200};
    hf.type='highpass';hf.frequency.value=HF[this.style]||9000;
    g.gain.setValueAtTime(vel,t);g.gain.exponentialRampToValueAtTime(.001,t+dur);
    src.buffer=buf;src.connect(hf);hf.connect(g);g.connect(this._out);src.start(t);src.stop(t+dur+.01);
  }

  _s(gen){
    if(!this.running||gen!==this._gen)return;
    const ctx=this.ctx;
    while(this.nextBeat<ctx.currentTime+.28){
      const t=this.nextBeat,bd=this.bd,bi=this.beat%16;
      // A/B section — elke 8 bars wisselen we voor subtiele hat-variatie
      const section=Math.floor(this.bar/8)%2;
      const isB=section===1;
      // Intensity of finalLap verhogen de hat-velocity
      const urgent=this.finalLap||this.intensity>0;
      const hv=urgent?.036:.022;

      // ── GRAND PRIX: driving techno, kick every beat ──
      if(this.style==='grandprix'){
        this._kick(t);
        if(bi===4||bi===12)this._snare(t);
        this._hat(t,hv,bi===6||bi===14);this._hat(t+bd*.5,hv*.58);
        if(this.bar%2===0||this.finalLap){this._hat(t+bd*.25,hv*.42);this._hat(t+bd*.75,hv*.42);}
      }
      // ── SPACE: synthwave — kick on 1&3 ──
      else if(this.style==='space'){
        if(bi===0||bi===8)this._kick(t);
        if(bi===4||bi===12)this._snare(t,.20);
        this._hat(t,hv*.85,bi===2||bi===6||bi===10||bi===14);
        this._hat(t+bd*.5,hv*.5);
        this._hat(t+bd*.25,hv*.38);this._hat(t+bd*.75,hv*.38);
      }
      // ── CANDY: bouncy 16ths, kick 1&3, claps 2&4 ──
      else if(this.style==='candy'){
        if(bi===0||bi===8)this._kick(t,.68);
        if(bi===4||bi===12)this._snare(t,.22);
        this._hat(t,hv*.75);this._hat(t+bd*.5,hv*.62);
        this._hat(t+bd*.25,hv*.48);this._hat(t+bd*.75,hv*.48);
      }
      // ── NEON CITY: moody half-time breaks ──
      else if(this.style==='neoncity'){
        if(bi===0||bi===10)this._kick(t);
        if(bi===4||bi===12)this._snare(t,.24);
        this._hat(t,hv*.6,bi===6||bi===14);
        if(bi%2===0)this._hat(t+bd*.5,hv*.5);
        // Glitchy stutters
        if(this.bar%3===0&&bi===14){this._hat(t+bd*.33,hv*.4);this._hat(t+bd*.66,hv*.4);}
      }
      // ── VOLCANO: aggressive tribal double-kick ──
      else if(this.style==='volcano'){
        this._kick(t,.8);
        if(bi%2===1)this._kick(t,.42); // off-beat ghost
        if(bi===4||bi===12)this._snare(t,.28);
        if(bi===8)this._snare(t,.20);
        this._hat(t,hv*.9);this._hat(t+bd*.5,hv*.7);
        this._hat(t+bd*.25,hv*.55);this._hat(t+bd*.75,hv*.55);
      }
      // ── ARCTIC: sparse, airy, long reverberant snares ──
      else if(this.style==='arctic'){
        if(bi===0)this._kick(t,.48);
        if(bi===8)this._kick(t,.3);
        if(bi===4||bi===12)this._snare(t,.16);
        this._hat(t,hv*.5,bi%4===2);
        if(bi%4===0)this._hat(t+bd*.5,hv*.35);
      }
      // ── THRILL PARK: carnival oom-pah, kick-snare-kick-snare ──
      else if(this.style==='themepark'){
        if(bi%4===0)this._kick(t,.7);
        if(bi%4===2)this._snare(t,.24);
        this._hat(t,hv*.8);this._hat(t+bd*.5,hv*.6);
        this._hat(t+bd*.25,hv*.5);this._hat(t+bd*.75,hv*.5);
      }
      // ── DEEP SEA: halftime dub ──
      else{
        if(bi===0)this._kick(t,.82);
        if(bi===8)this._kick(t,.40);
        if(bi===4||bi===12)this._snare(t,.18);
        this._hat(t,hv*.7);this._hat(t+bd*.5,hv*.44);
      }

      // ── BASS: rolling filtered sawtooth, note from pattern ──
      {
        const bassNote=this.bass[bi];
        const fBase=this.style==='deepsea'?100:this.style==='space'?165:180;
        const fPeak=this.style==='deepsea'?380:this.style==='space'?700:900;
        const bassVol=this.style==='deepsea'?.36:this.style==='space'?.22:.25;
        const bf=ctx.createOscillator(),bg=ctx.createGain(),bfilt=ctx.createBiquadFilter();
        bf.type='sawtooth';bfilt.type='lowpass';bfilt.Q.value=this.style==='deepsea'?6:4;
        bf.frequency.value=bassNote;
        bfilt.frequency.setValueAtTime(fBase,t);
        bfilt.frequency.exponentialRampToValueAtTime(fPeak,t+bd*.26);
        bfilt.frequency.exponentialRampToValueAtTime(fBase,t+bd*.72);
        bg.gain.setValueAtTime(bassVol,t+.003);bg.gain.exponentialRampToValueAtTime(.001,t+bd*.9);
        bf.connect(bfilt);bfilt.connect(bg);bg.connect(this._out);bf.start(t+.002);bf.stop(t+bd+.01);
      }

      // ── LEAD SYNTH (every 2 beats) ──
      if(bi%2===0){
        const lfreq=this.lead[bi/2];
        if(this.style==='grandprix'){
          [-5,5].forEach(det=>{
            const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
            o.type='sawtooth';o.frequency.value=lfreq;o.detune.value=det;
            f.type='lowpass';f.frequency.setValueAtTime(900,t);f.frequency.linearRampToValueAtTime(2800,t+.018);f.frequency.exponentialRampToValueAtTime(700,t+bd*1.8);f.Q.value=2.5;
            g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.034,t+.012);
            g.gain.setValueAtTime(.034,t+bd*1.65);g.gain.exponentialRampToValueAtTime(.001,t+bd*2.0);
            o.connect(f);f.connect(g);g.connect(this._out);o.start(t);o.stop(t+bd*2+.04);
          });
        }else if(this.style==='space'){
          const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
          o.type='triangle';o.frequency.value=lfreq;f.type='lowpass';f.frequency.value=2600;
          g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.052,t+.02);
          g.gain.setValueAtTime(.052,t+bd*1.8);g.gain.exponentialRampToValueAtTime(.001,t+bd*2.2);
          o.connect(f);f.connect(g);g.connect(this._out);o.start(t);o.stop(t+bd*2.3);
          const oe=ctx.createOscillator(),ge=ctx.createGain();
          oe.type='triangle';oe.frequency.value=lfreq;
          ge.gain.setValueAtTime(0,t+.20);ge.gain.linearRampToValueAtTime(.020,t+.24);
          ge.gain.exponentialRampToValueAtTime(.001,t+bd*2);
          oe.connect(ge);ge.connect(this._out);oe.start(t+.20);oe.stop(t+bd*2.3);
        }else if(this.style==='candy'){
          // CANDY: bright square waves (NES feel) + bell harmonic
          const o=ctx.createOscillator(),g=ctx.createGain();
          o.type='square';o.frequency.value=lfreq;
          g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.030,t+.008);
          g.gain.setValueAtTime(.030,t+bd*1.4);g.gain.exponentialRampToValueAtTime(.001,t+bd*1.8);
          o.connect(g);g.connect(this._out);o.start(t);o.stop(t+bd*1.9);
          // Bell shimmer an octave up
          const ob=ctx.createOscillator(),gb=ctx.createGain();
          ob.type='sine';ob.frequency.value=lfreq*2;
          gb.gain.setValueAtTime(.024,t);gb.gain.exponentialRampToValueAtTime(.001,t+bd*.8);
          ob.connect(gb);gb.connect(this._out);ob.start(t);ob.stop(t+bd*.9);
        }else if(this.style==='neoncity'){
          // NEON CITY: filtered saw with gritty resonance
          const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
          o.type='sawtooth';o.frequency.value=lfreq;
          f.type='lowpass';f.Q.value=6;
          f.frequency.setValueAtTime(600,t);f.frequency.exponentialRampToValueAtTime(2200,t+.15);
          f.frequency.exponentialRampToValueAtTime(500,t+bd*1.8);
          g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.036,t+.02);
          g.gain.setValueAtTime(.036,t+bd*1.7);g.gain.exponentialRampToValueAtTime(.001,t+bd*2.1);
          o.connect(f);f.connect(g);g.connect(this._out);o.start(t);o.stop(t+bd*2.2);
        }else if(this.style==='volcano'){
          // VOLCANO: sharp distorted saw + octave sub
          [-8,8].forEach(det=>{
            const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
            o.type='sawtooth';o.frequency.value=lfreq;o.detune.value=det;
            f.type='highpass';f.frequency.value=350;f.Q.value=1.4;
            g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.036,t+.006);
            g.gain.setValueAtTime(.036,t+bd*1.6);g.gain.exponentialRampToValueAtTime(.001,t+bd*1.9);
            o.connect(f);f.connect(g);g.connect(this._out);o.start(t);o.stop(t+bd*2);
          });
        }else if(this.style==='arctic'){
          // ARCTIC: pure sine with long tail + soft pad
          const o=ctx.createOscillator(),g=ctx.createGain();
          o.type='sine';o.frequency.value=lfreq;
          g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.058,t+.06);
          g.gain.setValueAtTime(.058,t+bd*2.2);g.gain.exponentialRampToValueAtTime(.001,t+bd*3.2);
          o.connect(g);g.connect(this._out);o.start(t);o.stop(t+bd*3.3);
          // Fifth above, quieter
          const of=ctx.createOscillator(),gf=ctx.createGain();
          of.type='sine';of.frequency.value=lfreq*1.5;
          gf.gain.setValueAtTime(0,t);gf.gain.linearRampToValueAtTime(.022,t+.08);
          gf.gain.exponentialRampToValueAtTime(.001,t+bd*3);
          of.connect(gf);gf.connect(this._out);of.start(t);of.stop(t+bd*3.1);
        }else if(this.style==='themepark'){
          // THRILL PARK: calliope — square wave + triangle harmonic (carnival organ)
          const o=ctx.createOscillator(),g=ctx.createGain();
          o.type='square';o.frequency.value=lfreq;
          g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.028,t+.012);
          g.gain.setValueAtTime(.028,t+bd*1.2);g.gain.exponentialRampToValueAtTime(.001,t+bd*1.6);
          o.connect(g);g.connect(this._out);o.start(t);o.stop(t+bd*1.7);
          // Fifth triangle for fun
          const of=ctx.createOscillator(),gf=ctx.createGain();
          of.type='triangle';of.frequency.value=lfreq*1.5;
          gf.gain.setValueAtTime(.016,t+.02);gf.gain.exponentialRampToValueAtTime(.001,t+bd*1.4);
          of.connect(gf);gf.connect(this._out);of.start(t+.02);of.stop(t+bd*1.5);
        }else{
          // Deep Sea: soft triangle with delay echo
          const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
          o.type='triangle';o.frequency.value=lfreq;f.type='lowpass';f.frequency.value=900;f.Q.value=1.5;
          g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.042,t+.03);
          g.gain.setValueAtTime(.042,t+bd*1.9);g.gain.exponentialRampToValueAtTime(.001,t+bd*2.4);
          o.connect(f);f.connect(g);g.connect(this._out);o.start(t);o.stop(t+bd*2.5);
          const oe=ctx.createOscillator(),ge=ctx.createGain(),fe=ctx.createBiquadFilter();
          oe.type='sine';oe.frequency.value=lfreq;fe.type='lowpass';fe.frequency.value=600;
          ge.gain.setValueAtTime(0,t+.30);ge.gain.linearRampToValueAtTime(.016,t+.34);
          ge.gain.exponentialRampToValueAtTime(.001,t+bd*2.2);
          oe.connect(fe);fe.connect(ge);ge.connect(this._out);oe.start(t+.30);oe.stop(t+bd*2.5);
        }
      }

      // ── CHORD STABS (every 4 beats, skip deepsea/arctic for sparser feel) ──
      if(bi%4===0&&this.style!=='deepsea'&&this.style!=='arctic'){
        const stabChord=this.stabs[bi/4];
        stabChord.forEach(fr=>{
          const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();
          o.type='sawtooth';f.type='lowpass';
          f.frequency.value=this.style==='space'?1300:1050;f.Q.value=1.2;
          o.frequency.value=fr*(this.style==='space'?2:2); // one octave up
          g.gain.setValueAtTime(.038,t+.002);g.gain.exponentialRampToValueAtTime(.001,t+bd*.40);
          o.connect(f);f.connect(g);g.connect(this._out);o.start(t+.001);o.stop(t+bd*.44);
        });
        // Space: arpeggio on top of stab
        if(this.style==='space'){
          stabChord.forEach((fr,i)=>{
            const o=ctx.createOscillator(),g=ctx.createGain();
            o.type='triangle';o.frequency.value=fr*4;
            g.gain.setValueAtTime(.018,t+i*.055);g.gain.exponentialRampToValueAtTime(.001,t+i*.055+bd*.38);
            o.connect(g);g.connect(this._out);o.start(t+i*.055);o.stop(t+i*.055+bd*.42);
          });
        }
      }

      // ── DEEP SEA: bubble blip ──
      if(this.style==='deepsea'&&Math.random()<.045){
        const bfreq=700+Math.random()*1400;
        const ob=ctx.createOscillator(),gb=ctx.createGain();
        ob.type='sine';ob.frequency.setValueAtTime(bfreq,t);ob.frequency.exponentialRampToValueAtTime(bfreq*1.5,t+.055);
        gb.gain.setValueAtTime(.013,t);gb.gain.exponentialRampToValueAtTime(.001,t+.065);
        ob.connect(gb);gb.connect(this._out);ob.start(t);ob.stop(t+.075);
      }

      // ── FINAL LAP / INTENSITY: extra hats ──
      if(urgent&&bi%4===2){this._hat(t+bd*.25,hv*.6);this._hat(t+bd*.75,hv*.6);}
      // B-section: subtiele extra 16th-hat op odd beats (nooit op deepsea/arctic — te ijl)
      if(isB&&this.style!=='deepsea'&&this.style!=='arctic'&&bi%2===1){
        this._hat(t+bd*.5,hv*.35);
      }

      this.nextBeat+=bd;this.beat++;
      if(bi===15)this.bar++;
    }
    setTimeout(()=>this._s(gen),14);
  }
}

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
function buildWaterPuddles(){
  const defs=[{t:.28},{t:.56},{t:.81}];
  defs.forEach(def=>{
    const p=trackCurve.getPoint(def.t);
    const g=new THREE.Mesh(new THREE.PlaneGeometry(TW*1.2,7),
      new THREE.MeshLambertMaterial({color:0x224466,emissive:0x112233,transparent:true,opacity:.55}));
    g.rotation.x=-Math.PI/2;g.position.copy(p);g.position.y=.02;
    scene.add(g);
    _wpWaterPuddles.push({pos:p.clone(),radius:TW*.55,len:3.5,mesh:g,cooldown:0});
  });
}
function checkWaterPuddles(dt){
  const car=carObjs[playerIdx];
  _wpWaterPuddles.forEach(wp=>{
    if(wp.cooldown>0){wp.cooldown-=dt;return;}
    const d=car.mesh.position.distanceTo(wp.pos);
    if(d<wp.radius+4){
      // Splash: reduce grip, show popup
      car.speed*=Math.pow(0.96,dt*60);
      if(d<wp.radius&&Math.random()<.05){showPopup('💦 WET TRACK!','#66aaff',500);wp.cooldown=2;}
    }
  });
}

// ── GP: DRS Zone ─────────────────────────────────────
function buildDRSZone(){
  // Single DRS detection board + painted activation zone on the long straight
  const tDet=0.97,tStart=0.94,tEnd=0.02;
  // Detection board
  const pDet=trackCurve.getPoint(tDet),tgDet=trackCurve.getTangent(tDet).normalize();
  const board=new THREE.Mesh(new THREE.BoxGeometry(TW*2+4,.1,.5),
    new THREE.MeshLambertMaterial({color:0x00dd44,emissive:0x007722}));
  board.position.copy(pDet);board.position.y=.05;scene.add(board);
  // Vertical DRS sign poles
  const poleMat=new THREE.MeshLambertMaterial({color:0x00ee44,emissive:0x005522});
  [-1,1].forEach(s=>{
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,4.5,6),poleMat);
    pole.position.copy(pDet);pole.position.y=2.25;
    pole.position.addScaledVector(new THREE.Vector3(-tgDet.z,0,tgDet.x),s*(TW+1.8));
    scene.add(pole);
  });
  // Horizontal sign board up high
  const signCvs=document.createElement('canvas');signCvs.width=256;signCvs.height=48;
  const sCtx=signCvs.getContext('2d');sCtx.fillStyle='#003311';sCtx.fillRect(0,0,256,48);
  sCtx.font='bold 22px Orbitron,Arial';sCtx.fillStyle='#00ff66';sCtx.textAlign='center';
  sCtx.fillText('DRS DETECTION',128,33);
  const signTex=new THREE.CanvasTexture(signCvs);
  const signMesh=new THREE.Sprite(new THREE.SpriteMaterial({map:signTex,transparent:true}));
  signMesh.position.copy(pDet);signMesh.position.y=5.2;signMesh.scale.set(14,2.2,1);scene.add(signMesh);
  // Painted activation zone strip
  for(let i=0;i<12;i++){
    const t=tStart+(tEnd-tStart+1)%1*(i/12);
    const pp=trackCurve.getPoint(t%1);
    const strip=new THREE.Mesh(new THREE.PlaneGeometry(TW*1.9,.8),
      new THREE.MeshLambertMaterial({color:0x00cc44,emissive:0x005522,transparent:true,opacity:.45}));
    strip.rotation.x=-Math.PI/2;strip.position.copy(pp);strip.position.y=.018;scene.add(strip);
  }
  _wpDrsZones.push({detPos:pDet.clone(),detRadius:TW+3,startT:tStart,endT:tEnd,cooldown:0});
}
function checkDRSZone(dt){
  if(!_wpDrsZones.length)return;
  const drs=_wpDrsZones[0];const car=carObjs[playerIdx];
  drs.cooldown=Math.max(0,drs.cooldown-dt);
  const d=car.mesh.position.distanceTo(drs.detPos);
  if(d<drs.detRadius&&drs.cooldown<=0){
    _drsActive=true;_drsTimer=6;_drsBoostUsed=false;
    showPopup('📡 DRS OPEN','#00ff66',700);drs.cooldown=8;
  }
  if(_drsActive){
    _drsTimer-=dt;
    if(_drsTimer<=0){_drsActive=false;if(_drsBoostUsed)showPopup('DRS CLOSED','#888888',500);}
    else if(!_drsBoostUsed&&car.speed>0.5){car.speed*=Math.pow(1.004,dt*60);} // gentle top-speed lift
  }
}

// ── GP: Tyre Barriers (visual only at key corners) ────
function buildTyreBarriers(){
  const defs=[{t:.18,side:-1},{t:.36,side:1},{t:.62,side:-1},{t:.78,side:1}];
  defs.forEach(def=>{
    const p=trackCurve.getPoint(def.t),tg=trackCurve.getTangent(def.t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const baseOff=def.side*(BARRIER_OFF+.8);
    const cols=[0xee2222,0xffffff,0xee2222,0xffffff,0xee2222];
    for(let i=0;i<5;i++){
      const ty=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,.65,10),
        new THREE.MeshLambertMaterial({color:cols[i%cols.length]}));
      ty.position.copy(p).addScaledVector(nr,baseOff).addScaledVector(tg,(i-2)*1.5);
      ty.position.y=.33;scene.add(ty);
      // Stack second row on top
      const ty2=new THREE.Mesh(new THREE.CylinderGeometry(.65,.65,.62,10),
        new THREE.MeshLambertMaterial({color:cols[(i+1)%cols.length]}));
      ty2.position.copy(ty.position);ty2.position.y=.97;scene.add(ty2);
    }
  });
}

// ── Space: Gravity Zones ──────────────────────────────
function buildGravityZones(){
  const defs=[{t:.15},{t:.47},{t:.73}];
  defs.forEach(def=>{
    const p=trackCurve.getPoint(def.t).clone();
    // Glowing hexagonal pad on track
    const pad=new THREE.Mesh(new THREE.CylinderGeometry(6,6,.08,6),
      new THREE.MeshLambertMaterial({color:0x8800ff,emissive:0x5500cc,emissiveIntensity:1.2,transparent:true,opacity:.7}));
    pad.position.copy(p);pad.position.y=.025;scene.add(pad);
    // Arrow ring floating above
    const arr=new THREE.Mesh(new THREE.TorusGeometry(4,.15,6,24),
      new THREE.MeshLambertMaterial({color:0xff44ff,emissive:0xcc00cc,emissiveIntensity:1.5}));
    arr.rotation.x=Math.PI/2;arr.position.copy(p);arr.position.y=1.8;scene.add(arr);
    // WARNING text sprite
    const cvs=document.createElement('canvas');cvs.width=256;cvs.height=40;
    const ctx=cvs.getContext('2d');ctx.fillStyle='#220044';ctx.fillRect(0,0,256,40);
    ctx.font='bold 18px Orbitron,Arial';ctx.fillStyle='#ff88ff';ctx.textAlign='center';
    ctx.fillText('GRAVITY ZONE',128,27);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cvs),transparent:true}));
    sp.position.copy(p);sp.position.y=3.8;sp.scale.set(12,2,1);scene.add(sp);
    _wpGravityZones.push({pos:p.clone(),radius:6,pad,arr,cooldown:0});
  });
}
function checkGravityZones(dt){
  const car=carObjs[playerIdx];
  _wpGravityZones.forEach(gz=>{
    gz.cooldown=Math.max(0,gz.cooldown-dt);
    const d=car.mesh.position.distanceTo(gz.pos);
    if(d<gz.radius&&!car.inAir&&gz.cooldown<=0){
      car.vy=(car.vy||0)+6; // launch upward
      car.inAir=true;
      showPopup('🚀 ZERO-G ZONE!','#ff88ff',600);
      gz.cooldown=4;
    }
  });
}

// ── Space: Orbiting Asteroids ─────────────────────────
function buildOrbitingAsteroids(){
  const defs=[{t:.23,r:9,speed:.4},{t:.55,r:11,speed:-.35},{t:.85,r:8,speed:.5}];
  defs.forEach(def=>{
    const centre=trackCurve.getPoint(def.t).clone();centre.y=1.0;
    // Rocky asteroid (irregular sphere)
    const geo=new THREE.DodecahedronGeometry(2.2,0);
    // Randomly jitter vertices for rockiness
    const posAttr=geo.attributes.position;
    for(let i=0;i<posAttr.count;i++){
      posAttr.setXYZ(i,posAttr.getX(i)*(0.75+Math.random()*.5),posAttr.getY(i)*(0.75+Math.random()*.5),posAttr.getZ(i)*(0.75+Math.random()*.5));
    }
    geo.computeVertexNormals();
    const rock=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color:0x665544}));
    rock.position.copy(centre).addScaledVector(new THREE.Vector3(1,0,0),def.r);
    scene.add(rock);
    // Small dust halo (torus)
    const dust=new THREE.Mesh(new THREE.TorusGeometry(def.r,.25,4,32),
      new THREE.MeshBasicMaterial({color:0x443322,transparent:true,opacity:.25}));
    dust.rotation.x=Math.PI/2;dust.position.copy(centre);scene.add(dust);
    _wpOrbitAsteroids.push({centre:centre.clone(),rock,orbitR:def.r,speed:def.speed,angle:Math.random()*Math.PI*2,radius:2.8,cooldown:0});
  });
}
function checkOrbitingAsteroids(dt){
  const car=carObjs[playerIdx];
  _wpOrbitAsteroids.forEach(ast=>{
    // Orbit update
    ast.angle+=ast.speed*dt;
    ast.rock.position.set(ast.centre.x+Math.cos(ast.angle)*ast.orbitR,ast.centre.y,ast.centre.z+Math.sin(ast.angle)*ast.orbitR);
    ast.rock.rotation.y+=dt*.4;ast.rock.rotation.x+=dt*.2;
    // Collision with player
    ast.cooldown=Math.max(0,ast.cooldown-dt);
    const d=car.mesh.position.distanceTo(ast.rock.position);
    if(d<ast.radius+1.5&&ast.cooldown<=0){
      car.speed*=.35;car.yawVel=(Math.random()-.5)*3.5;
      showPopup('☄️ ASTEROID HIT!','#ff8844',700);ast.cooldown=2;
    }
  });
}

// ── Space: Warp Tunnels ───────────────────────────────
function buildWarpTunnels(){
  const defs=[{t:.38},{t:.77}];
  defs.forEach(def=>{
    const p=trackCurve.getPoint(def.t),tg=trackCurve.getTangent(def.t).normalize();
    const angle=Math.atan2(tg.x,tg.z);
    // Tunnel arch (two rings + connecting bars)
    const ringMat=new THREE.MeshLambertMaterial({color:0x4400aa,emissive:0x2200bb,emissiveIntensity:1.8});
    [-5,5].forEach(oz=>{
      const ring=new THREE.Mesh(new THREE.TorusGeometry(TW+2,.55,8,24),ringMat.clone());
      ring.position.copy(p).addScaledVector(tg,oz);ring.position.y=TW+1.8;
      ring.rotation.y=angle;ring.rotation.x=Math.PI/2;scene.add(ring);
    });
    // Connecting strips along the sides and top
    const stripMat=new THREE.MeshLambertMaterial({color:0x6622cc,emissive:0x4411aa,emissiveIntensity:1.2,transparent:true,opacity:.6});
    for(let i=0;i<6;i++){
      const ang=(i/6)*Math.PI; // top half arch
      const bar=new THREE.Mesh(new THREE.BoxGeometry(.25,10.5,.3),stripMat);
      bar.position.copy(p);
      bar.position.x+=Math.cos(ang+Math.PI/2)*(TW+1.8)*Math.cos(angle)-Math.sin(ang+Math.PI/2)*(TW+1.8)*Math.sin(angle);
      bar.position.z+=Math.cos(ang+Math.PI/2)*(TW+1.8)*Math.sin(angle)+Math.sin(ang+Math.PI/2)*(TW+1.8)*Math.cos(angle);
      bar.position.y=TW+1.8;bar.rotation.y=angle;
      scene.add(bar);
    }
    // Glowing ground panel
    const gnd=new THREE.Mesh(new THREE.PlaneGeometry(TW*1.8,10),
      new THREE.MeshLambertMaterial({color:0x8833ff,emissive:0x5511dd,transparent:true,opacity:.4}));
    gnd.rotation.x=-Math.PI/2;gnd.position.copy(p);gnd.position.y=.02;gnd.rotation.y=angle;scene.add(gnd);
    _wpWarpTunnels.push({pos:p.clone(),tg:tg.clone(),radius:TW*.85,len:10,cooldown:0});
  });
}
function checkWarpTunnels(dt){
  const car=carObjs[playerIdx];
  _wpWarpTunnels.forEach(wt=>{
    wt.cooldown=Math.max(0,wt.cooldown-dt);
    const d=car.mesh.position.distanceTo(wt.pos);
    if(d<wt.radius+4&&wt.cooldown<=0&&car.speed>0.1){
      car.speed=Math.min(car.speed*1.12,car.def.topSpd*1.08); // significant boost cap
      showPopup('⚡ WARP SPEED!','#cc66ff',600);wt.cooldown=5;
    }
  });
}

// ── DeepSea: Current Streams ──────────────────────────
function buildCurrentStreams(){
  const defs=[{t:.20,side:1},{t:.45,side:-1},{t:.70,side:1}];
  defs.forEach((def,di)=>{
    const p=trackCurve.getPoint(def.t),tg=trackCurve.getTangent(def.t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const pushDir=nr.clone().multiplyScalar(def.side);
    // Blue arrow strips showing current direction
    const arrowMat=new THREE.MeshLambertMaterial({color:0x00ccee,emissive:0x0077aa,emissiveIntensity:.9,transparent:true,opacity:.55});
    for(let i=-2;i<=2;i++){
      const ap=p.clone().addScaledVector(tg,i*3.5);
      const arr=new THREE.Mesh(new THREE.ConeGeometry(.8,2,4),arrowMat);
      arr.rotation.x=-Math.PI/2;arr.rotation.z=def.side>0?-Math.PI/2:Math.PI/2;
      arr.position.copy(ap);arr.position.y=.04;scene.add(arr);
    }
    // Glowing band on track
    const band=new THREE.Mesh(new THREE.PlaneGeometry(TW*1.8,18),
      new THREE.MeshLambertMaterial({color:0x0088bb,emissive:0x004466,transparent:true,opacity:.30}));
    band.rotation.x=-Math.PI/2;band.position.copy(p);band.position.y=.016;scene.add(band);
    _wpCurrentStreams.push({pos:p.clone(),pushDir:pushDir.clone(),radius:TW,len:9,strength:2.8,cooldown:0});
  });
}
function checkCurrentStreams(dt){
  const car=carObjs[playerIdx];
  _wpCurrentStreams.forEach(cs=>{
    const d=car.mesh.position.distanceTo(cs.pos);
    if(d<cs.radius+6){
      // Lateral push proportional to proximity
      const push=cs.strength*(1-Math.max(0,d-cs.radius)/6)*dt;
      car.mesh.position.addScaledVector(cs.pushDir,push);
      if(d<cs.radius&&Math.random()<.04)showPopup('🌊 CURRENT!','#00ddee',400);
    }
  });
}

// ── DeepSea: Abyss Cracks ────────────────────────────
function buildAbyssCracks(){
  const defs=[{t:.33},{t:.60},{t:.88}];
  defs.forEach(def=>{
    const p=trackCurve.getPoint(def.t),tg=trackCurve.getTangent(def.t).normalize();
    const angle=Math.atan2(tg.x,tg.z);
    // Dark jagged crack geometry (two thin dark planes at angles)
    const crackMat=new THREE.MeshLambertMaterial({color:0x000508,emissive:0x000000,transparent:true,opacity:.75});
    [-1,1].forEach(s=>{
      const crack=new THREE.Mesh(new THREE.PlaneGeometry(TW*.75,6),crackMat);
      crack.rotation.x=-Math.PI/2;crack.rotation.z=s*.15;
      crack.position.copy(p);crack.position.y=.03;crack.rotation.y=angle;
      crack.position.addScaledVector(new THREE.Vector3(-tg.z,0,tg.x),s*TW*.28);
      scene.add(crack);
    });
    // Dark bio-glow rim
    const rim=new THREE.Mesh(new THREE.PlaneGeometry(TW*1.4,6.5),
      new THREE.MeshLambertMaterial({color:0x001a22,emissive:0x00ffff,emissiveIntensity:.12,transparent:true,opacity:.2}));
    rim.rotation.x=-Math.PI/2;rim.position.copy(p);rim.position.y=.025;scene.add(rim);
    _wpAbyssCracks.push({pos:p.clone(),radius:TW*.65,len:3,cooldown:0});
  });
}
function checkAbyssCracks(dt){
  const car=carObjs[playerIdx];
  _wpAbyssCracks.forEach(ac=>{
    ac.cooldown=Math.max(0,ac.cooldown-dt);
    const d=car.mesh.position.distanceTo(ac.pos);
    if(d<ac.radius+2&&ac.cooldown<=0&&Math.abs(car.speed)>.15){
      car.speed*=Math.pow(0.93,dt*60); // moderate drag
      if(d<ac.radius&&Math.random()<.05){showPopup('🕳 ABYSS CRACK!','#00ffff',500);ac.cooldown=2.5;}
    }
  });
}

// ── DeepSea: Treasure Trail ───────────────────────────
function buildTreasureTrail(){
  const trailCount=12;
  for(let i=0;i<trailCount;i++){
    const t=(i/trailCount+.08)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    // Offset slightly outside track edge
    const offset=(Math.random()>.5?1:-1)*(TW+3+Math.random()*4);
    const pos=p.clone().addScaledVector(nr,offset);pos.y=2.0;
    const g=new THREE.Group();g.position.copy(pos);
    // Golden treasure chest shape (box + lid)
    const chestMat=new THREE.MeshLambertMaterial({color:0xddaa00,emissive:0x886600,emissiveIntensity:.7});
    const box=new THREE.Mesh(new THREE.BoxGeometry(.9,.65,.65),chestMat);
    box.position.y=-.1;g.add(box);
    const lid=new THREE.Mesh(new THREE.BoxGeometry(.9,.3,.65),
      new THREE.MeshLambertMaterial({color:0xffcc00,emissive:0xaa8800,emissiveIntensity:.8}));
    lid.position.y=.3;g.add(lid);
    // Glow ring
    const rng=new THREE.Mesh(new THREE.TorusGeometry(1,.1,6,20),
      new THREE.MeshLambertMaterial({color:0xffdd33,emissive:0xffaa00,emissiveIntensity:1.2,transparent:true,opacity:.7}));
    rng.rotation.x=Math.PI/2;g.add(rng);
    scene.add(g);
    const tl=new THREE.PointLight(0xffcc00,1.4,12);tl.position.copy(pos);scene.add(tl);
    _wpTreasureTrail.push({mesh:g,pos:pos.clone(),radius:2.5,collected:false,respawn:20,light:tl,timer:0});
  }
}
function checkTreasureTrail(dt){
  const car=carObjs[playerIdx];if(!car)return;
  const now=_nowSec;
  _wpTreasureTrail.forEach(tr=>{
    if(tr.collected){
      if(now>tr.respawnAt){tr.collected=false;tr.mesh.visible=true;tr.light.intensity=1.4;}
      return;
    }
    // Gentle float animation
    tr.mesh.rotation.y+=.03;tr.mesh.position.y=tr.pos.y+Math.sin(now*1.8+tr.pos.x)*.3;
    const d=car.mesh.position.distanceTo(tr.pos);
    if(d<tr.radius){
      tr.collected=true;tr.respawnAt=now+tr.respawn;
      tr.mesh.visible=false;tr.light.intensity=0;
      totalScore+=150;
      sparkSystem.emit(tr.pos.x,tr.pos.y,tr.pos.z,0,.05,0,14,.9,.8,.1,.7);
      showPopup('💰 TREASURE! +150','#ffdd33',700);
    }
  });
}

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
function buildGPTrackProps(){
  // Tire-stack barriers at key corners
  const tireStackTs=[0.15,0.26,0.38,0.52,0.63,0.72,0.85,0.92];
  const tireM=new THREE.MeshLambertMaterial({color:0x0a0a0a});
  tireStackTs.forEach((tt,i)=>{
    const p=trackCurve.getPoint(tt),tg=trackCurve.getTangent(tt).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+4);
    const cx=p.x+nr.x*side,cz=p.z+nr.z*side;
    // Stack of 3 tires (torus each)
    for(let k=0;k<3;k++){
      const tire=new THREE.Mesh(new THREE.TorusGeometry(.55,.22,6,16),tireM);
      tire.rotation.x=Math.PI/2;
      tire.position.set(cx,.55+k*.46,cz);
      scene.add(tire);
    }
    // Top red cap
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.35,8,6,0,Math.PI*2,0,Math.PI*.5),
      new THREE.MeshLambertMaterial({color:0xcc2222}));
    cap.position.set(cx,1.95,cz);scene.add(cap);
  });

  // Safety cones in clusters at corner entries
  const coneM=new THREE.MeshLambertMaterial({color:0xff7722,emissive:0xff4411,emissiveIntensity:.2});
  [0.11,0.34,0.58,0.81].forEach((tt,i)=>{
    const p=trackCurve.getPoint(tt),tg=trackCurve.getTangent(tt).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?-1:1);
    for(let k=-1;k<=1;k++){
      const cone=new THREE.Mesh(new THREE.ConeGeometry(.28,.8,8),coneM);
      cone.position.set(p.x+nr.x*side*(BARRIER_OFF+3)+tg.x*k*1.8,.4,p.z+nr.z*side*(BARRIER_OFF+3)+tg.z*k*1.8);
      scene.add(cone);
      const stripe=new THREE.Mesh(new THREE.TorusGeometry(.24,.04,4,10),
        new THREE.MeshBasicMaterial({color:0xffffff}));
      stripe.rotation.x=Math.PI/2;
      stripe.position.set(cone.position.x,.32,cone.position.z);
      scene.add(stripe);
    }
  });

  // Marshal posts (orange flag on pole) every ~20%
  [0.18,0.42,0.68,0.95].forEach((tt,i)=>{
    const p=trackCurve.getPoint(tt),tg=trackCurve.getTangent(tt).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+5.5);
    const px=p.x+nr.x*side,pz=p.z+nr.z*side;
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.08,3.8,6),
      new THREE.MeshLambertMaterial({color:0xcccccc}));
    pole.position.set(px,1.9,pz);scene.add(pole);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(.8,.55),
      new THREE.MeshLambertMaterial({color:0xff6622,side:THREE.DoubleSide}));
    flag.position.set(px+.4,3.2,pz);
    flag.rotation.y=Math.random()*Math.PI;
    scene.add(flag);
  });

  // Row of pit-boards on the main straight side
  const boardM=new THREE.MeshLambertMaterial({color:0x222222});
  const accentM=new THREE.MeshLambertMaterial({color:0xffee00,emissive:0xff8800,emissiveIntensity:.4});
  [0.95,0.97,0.99].forEach((tt,i)=>{
    const p=trackCurve.getPoint(tt),tg=trackCurve.getTangent(tt).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=-1*(BARRIER_OFF+4);
    const board=new THREE.Mesh(new THREE.BoxGeometry(2.4,1.2,.1),boardM);
    board.position.set(p.x+nr.x*side,1.6,p.z+nr.z*side);
    board.rotation.y=Math.atan2(tg.x,tg.z);
    scene.add(board);
    const stripe=new THREE.Mesh(new THREE.BoxGeometry(2.4,.12,.11),accentM);
    stripe.position.copy(board.position);stripe.position.y-=.55;
    stripe.rotation.y=board.rotation.y;
    scene.add(stripe);
  });
}

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
function buildSpaceEnvironment(){
  buildSpaceVoid();      // replaces ground — empty abyss
  buildSpaceStars();
  buildSpacePlanets();
  buildNebula();
  buildAsteroids();
  buildSpaceTrackPlatform(); // underkant + vertical rails + underglow
  buildSpaceTrackEdges();
  buildSpaceOrbs();
  buildSpaceStation();
  buildSpaceGate();
  buildSpaceBarriers();
  buildSpaceDust();
  buildSpaceGravityWells();
  buildSpaceRailguns();
  buildSpaceWormholes();
  buildSpaceUFOs();
  buildSpaceMeteorSystem();
  buildSpaceTractorBeam();
  // Car headlights (same hardware as GP)
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);
}
function buildSpaceVoid(){
  // Deep abyss plane far below — creates infinite depth feeling
  const abyss=new THREE.Mesh(new THREE.PlaneGeometry(3000,3000,1,1),
    new THREE.MeshBasicMaterial({color:0x000008}));
  abyss.rotation.x=-Math.PI/2;abyss.position.y=-400;scene.add(abyss);
  // Mid-depth debris — small grey rocks drifting far below
  const debMat=new THREE.MeshLambertMaterial({color:0x222233});
  for(let i=0;i<55;i++){
    const g=Math.random()<.5?new THREE.DodecahedronGeometry(.8+Math.random()*2.5,0):new THREE.IcosahedronGeometry(.5+Math.random()*2,0);
    const m=new THREE.Mesh(g,debMat);
    m.position.set((Math.random()-.5)*1200,-(40+Math.random()*180),(Math.random()-.5)*1200);
    m.rotation.set(Math.random()*Math.PI*2,Math.random()*Math.PI*2,0);
    m._rspd=new THREE.Vector3((Math.random()-.5)*.15,(Math.random()-.5)*.05,(Math.random()-.5)*.15);
    scene.add(m);_spaceAsteroids.push(m); // reuse asteroid array for rotation
  }
}
function buildSpaceTrackPlatform(){
  const N=300;
  // Track bottom face — dark metallic panel
  ribbon(N,t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    return{L:p.clone().addScaledVector(nr,-(TW+.5)).setY(-.55),R:p.clone().addScaledVector(nr,TW+.5).setY(-.55)};
  },new THREE.MeshLambertMaterial({color:0x0e0e1e,side:THREE.BackSide}));
  // Left wall
  ribbon(N,t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const edge=p.clone().addScaledVector(nr,-TW);
    return{L:edge.clone().setY(-.55),R:edge.clone().setY(.35)};
  },new THREE.MeshLambertMaterial({color:0x00ffff,emissive:0x00aaff,emissiveIntensity:.9,transparent:true,opacity:.5,side:THREE.DoubleSide}));
  // Right wall
  ribbon(N,t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const edge=p.clone().addScaledVector(nr,TW);
    return{L:edge.clone().setY(-.55),R:edge.clone().setY(.35)};
  },new THREE.MeshLambertMaterial({color:0xff00ff,emissive:0xcc00cc,emissiveIntensity:.9,transparent:true,opacity:.5,side:THREE.DoubleSide}));
  // Underglow point lights — 8 widely-spaced lights (emissive walls already provide glow)
  const glowCols=[0x00ffcc,0x8800ff,0x00aaff,0xff00aa];
  for(let i=0;i<8;i++){
    const t=i/8;const p=trackCurve.getPoint(t);
    const pl=new THREE.PointLight(glowCols[i%glowCols.length],2.2,55);
    pl.position.set(p.x,p.y-1.2,p.z);
    scene.add(pl);_spaceUnderglow.push(pl);
  }
}
function buildSpaceStars(){
  const cnt=2200;
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(cnt*3);
  const col=new Float32Array(cnt*3);
  const colSets=[[1,1,1],[.85,.9,1],[1,1,.88],[.88,.82,1],[.8,.96,1]];
  for(let i=0;i<cnt;i++){
    const th=Math.random()*Math.PI*2;
    const ph=Math.random()*Math.PI*.55;
    const r=580+Math.random()*180;
    pos[i*3]=r*Math.sin(ph)*Math.cos(th);
    pos[i*3+1]=r*Math.cos(ph)*.45+70;
    pos[i*3+2]=r*Math.sin(ph)*Math.sin(th);
    const c=colSets[Math.floor(Math.random()*colSets.length)];
    col[i*3]=c[0];col[i*3+1]=c[1];col[i*3+2]=c[2];
  }
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  stars=new THREE.Points(geo,new THREE.PointsMaterial({
    vertexColors:true,size:.65,sizeAttenuation:false,transparent:true,opacity:.95
  }));
  stars.visible=true;scene.add(stars);
  // Horizon star band
  const hCnt=400;const hGeo=new THREE.BufferGeometry();
  const hPos=new Float32Array(hCnt*3);
  for(let i=0;i<hCnt;i++){
    const th=Math.random()*Math.PI*2;const r=520+Math.random()*140;
    hPos[i*3]=r*Math.cos(th);hPos[i*3+1]=Math.random()*40+5;hPos[i*3+2]=r*Math.sin(th);
  }
  hGeo.setAttribute('position',new THREE.Float32BufferAttribute(hPos,3));
  scene.add(new THREE.Points(hGeo,new THREE.PointsMaterial({color:0x9988cc,size:.45,sizeAttenuation:false,transparent:true,opacity:.55})));
}
function buildSpacePlanets(){
  // Large striped gas giant at horizon
  const pGeo=new THREE.SphereGeometry(95,32,24);
  const pColors=new Float32Array(pGeo.attributes.position.count*3);
  for(let i=0;i<pGeo.attributes.position.count;i++){
    const y=pGeo.attributes.position.getY(i);
    const t=(y+95)/190;const b=Math.floor(t*8)%2;
    if(b===0){pColors[i*3]=.78;pColors[i*3+1]=.44;pColors[i*3+2]=.14;}
    else{pColors[i*3]=.94;pColors[i*3+1]=.80;pColors[i*3+2]=.60;}
  }
  pGeo.setAttribute('color',new THREE.Float32BufferAttribute(pColors,3));
  const planet=new THREE.Mesh(pGeo,new THREE.MeshLambertMaterial({vertexColors:true}));
  planet.position.set(-520,115,-520);planet.rotation.z=.18;scene.add(planet);
  // Ring
  const ring=new THREE.Mesh(new THREE.RingGeometry(125,178,64),
    new THREE.MeshBasicMaterial({color:0xc89050,transparent:true,opacity:.52,side:THREE.DoubleSide}));
  ring.position.copy(planet.position);ring.rotation.x=1.3;ring.rotation.z=.08;scene.add(ring);
  // Moon 1 — grey
  const m1=new THREE.Mesh(new THREE.SphereGeometry(17,12,12),new THREE.MeshLambertMaterial({color:0xaaaabc}));
  m1.position.set(310,195,-460);scene.add(m1);
  // Moon 2 — reddish
  const m2=new THREE.Mesh(new THREE.SphereGeometry(11,12,12),new THREE.MeshLambertMaterial({color:0x887060}));
  m2.position.set(-260,275,490);scene.add(m2);
}
function buildNebula(){
  [{p:[-700,100,-600],r:300,c:0x3300aa,o:.08},{p:[600,80,-650],r:250,c:0x880044,o:.09},
   {p:[-600,150,500],r:280,c:0x006688,o:.07},{p:[650,60,600],r:220,c:0x000088,o:.10},
   {p:[0,50,-750],r:350,c:0x220055,o:.06},{p:[700,120,0],r:260,c:0x440088,o:.08},
  ].forEach(n=>{
    const nb=new THREE.Mesh(new THREE.SphereGeometry(n.r,10,8),
      new THREE.MeshBasicMaterial({color:n.c,transparent:true,opacity:n.o,side:THREE.BackSide}));
    nb.position.set(n.p[0],n.p[1],n.p[2]);scene.add(nb);
  });
}
function buildAsteroids(){
  _spaceAsteroids.length=0;
  const mats=[new THREE.MeshLambertMaterial({color:0x3a3a4e}),
              new THREE.MeshLambertMaterial({color:0x2e2e3a}),
              new THREE.MeshLambertMaterial({color:0x4a3e3e})];
  // Spawn asteroids alongside track (Candy-pattern) for immersive space debris
  const positions=[];
  const ASTEROID_COUNT=_mobCount(25);
  for(let i=0;i<ASTEROID_COUNT;i++){
    const tt=(i/ASTEROID_COUNT+Math.random()*.02)%1;
    const p=trackCurve.getPoint(tt),tgv=trackCurve.getTangent(tt).normalize();
    const nr=new THREE.Vector3(-tgv.z,0,tgv.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+20+Math.random()*40);
    positions.push([p.x+nr.x*side+(Math.random()-.5)*8,6+Math.random()*22,p.z+nr.z*side+(Math.random()-.5)*8,3+Math.random()*8]);
  }
  positions.forEach(([x,y,z,s])=>{
    const g=Math.random()<.5?new THREE.DodecahedronGeometry(s,0):new THREE.IcosahedronGeometry(s,0);
    const pa=g.attributes.position.array;
    for(let i=0;i<pa.length;i++)pa[i]+=(Math.random()-.5)*s*.28;
    g.attributes.position.needsUpdate=true;g.computeVertexNormals();
    const m=new THREE.Mesh(g,mats[Math.floor(Math.random()*mats.length)]);
    m.position.set(x,y,z);
    m.rotation.set(Math.random()*Math.PI*2,Math.random()*Math.PI*2,Math.random()*Math.PI*2);
    m._rspd=new THREE.Vector3((Math.random()-.5)*.35,(Math.random()-.5)*.7,(Math.random()-.5)*.25);
    scene.add(m);_spaceAsteroids.push(m);
  });
}
function buildSpaceTrackEdges(){
  // N must match the main track ribbon (N=400) — otherwise the segment vertices don't line up
  // on tight corners and the edge ribbon visually splits off, looking like a "ghost fork".
  // PolygonOffset -3 is stronger than the curbs (-1) and elines (-2), so these neon edges always
  // win the depth test and never z-fight against the track.
  const N=400;
  const cyMat=new THREE.MeshLambertMaterial({color:0x00ffff,emissive:0x00ccff,emissiveIntensity:2.2,transparent:true,opacity:.92});
  cyMat.polygonOffset=true;cyMat.polygonOffsetFactor=-3;cyMat.polygonOffsetUnits=-3;
  const mgMat=new THREE.MeshLambertMaterial({color:0xff00ff,emissive:0xcc00cc,emissiveIntensity:2.2,transparent:true,opacity:.92});
  mgMat.polygonOffset=true;mgMat.polygonOffsetFactor=-3;mgMat.polygonOffsetUnits=-3;
  ribbon(N,t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    return{L:p.clone().addScaledVector(nr,-(TW-.5)).setY(.025),R:p.clone().addScaledVector(nr,-(TW-.5)+.55).setY(.025)};
  },cyMat);
  ribbon(N,t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    return{L:p.clone().addScaledVector(nr,TW-.55).setY(.025),R:p.clone().addScaledVector(nr,TW).setY(.025)};
  },mgMat);
}
function buildSpaceOrbs(){
  const cols=[0x00ffff,0xff00ff,0x00ff88,0x8844ff];
  for(let i=0;i<36;i++){
    const t=i/36;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    [-1,1].forEach((side,si)=>{
      const col=cols[(i*2+si)%cols.length];
      const pp=p.clone().addScaledVector(nr,side*(BARRIER_OFF+1.5));
      const orb=new THREE.Mesh(new THREE.SphereGeometry(.75,8,8),
        new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:2.8}));
      orb.position.copy(pp);orb.position.y=4.2;scene.add(orb);
      const pl=new THREE.PointLight(col,2.0,18);pl.position.copy(orb.position);scene.add(pl);
      trackLightList.push(pl);trackPoles.push(orb);
    });
  }
}
function buildSpaceStation(){
  const p=trackCurve.getPoint(0),tg=trackCurve.getTangent(0).normalize();
  const nr=new THREE.Vector3(-tg.z,0,tg.x);
  const base=p.clone().addScaledVector(nr,-(TW+13));
  const mM=new THREE.MeshLambertMaterial({color:0x22223a});
  const gM=new THREE.MeshLambertMaterial({color:0x0044ff,emissive:0x0022aa,emissiveIntensity:1.6});
  const glM=new THREE.MeshLambertMaterial({color:0x88aaff,emissive:0x2244cc,emissiveIntensity:.9,transparent:true,opacity:.72});
  // Main block
  const bld=new THREE.Mesh(new THREE.BoxGeometry(22,8,13),mM);
  bld.position.copy(base);bld.position.y=4;bld.rotation.y=Math.atan2(tg.x,tg.z);scene.add(bld);
  // Control room glass box
  const ctrl=new THREE.Mesh(new THREE.BoxGeometry(10,4,8),glM);
  ctrl.position.copy(base);ctrl.position.y=10;ctrl.rotation.y=Math.atan2(tg.x,tg.z);scene.add(ctrl);
  // Comm tower
  const tower=new THREE.Mesh(new THREE.CylinderGeometry(.14,.24,14,6),mM);
  tower.position.copy(base);tower.position.y=15;scene.add(tower);
  // Glow base strips
  [-1,1].forEach(s=>{
    const strip=new THREE.Mesh(new THREE.BoxGeometry(22,.32,1.2),gM);
    strip.position.copy(base);strip.position.y=.2;
    strip.position.addScaledVector(nr,s*6.5);strip.rotation.y=Math.atan2(tg.x,tg.z);scene.add(strip);
  });
  // Docking arm
  const arm=new THREE.Mesh(new THREE.BoxGeometry(1.2,1,16),mM);
  arm.position.copy(base);arm.position.addScaledVector(tg,-11);arm.position.y=6;scene.add(arm);
}
function buildSpaceGate(){
  const p=trackCurve.getPoint(0),tg=trackCurve.getTangent(0).normalize();
  const nr=new THREE.Vector3(-tg.z,0,tg.x),hw=TW+4;
  const mM=new THREE.MeshLambertMaterial({color:0x1a1a2e});
  const nC=new THREE.MeshLambertMaterial({color:0x00ffff,emissive:0x00aaff,emissiveIntensity:2.4});
  const nM=new THREE.MeshLambertMaterial({color:0xff00ff,emissive:0xcc00cc,emissiveIntensity:2.4});
  [-1,1].forEach((s,si)=>{
    const pp=p.clone().addScaledVector(nr,s*hw);
    const post=new THREE.Mesh(new THREE.BoxGeometry(1.1,14,.8),mM);
    post.position.copy(pp);post.position.y=7;scene.add(post);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.6,.18,8,24),si===0?nC:nM);
    ring.position.copy(pp);ring.position.y=12.5;ring.rotation.y=Math.atan2(tg.x,tg.z);scene.add(ring);
  });
  const bar=new THREE.Mesh(new THREE.BoxGeometry(hw*2,1.2,.8),mM);
  bar.position.copy(p);bar.position.y=14;scene.add(bar);
  const ledC=new THREE.Mesh(new THREE.BoxGeometry(hw*2-.6,.16,.35),nC);
  ledC.position.copy(p);ledC.position.y=13.4;scene.add(ledC);
  const ledM=new THREE.Mesh(new THREE.BoxGeometry(hw*2-.6,.16,.35),nM);
  ledM.position.copy(p);ledM.position.y=14.6;scene.add(ledM);
  // Sign
  const cvs=document.createElement('canvas');cvs.width=512;cvs.height=64;
  const sCtx=cvs.getContext('2d');
  sCtx.fillStyle='#04001a';sCtx.fillRect(0,0,512,64);
  sCtx.font='bold 36px monospace';sCtx.textAlign='center';sCtx.textBaseline='middle';
  const grd=sCtx.createLinearGradient(0,0,512,0);
  grd.addColorStop(0,'#00ffff');grd.addColorStop(.5,'#ffffff');grd.addColorStop(1,'#ff00ff');
  sCtx.fillStyle=grd;sCtx.fillText('COSMIC CIRCUIT',256,32);
  const tex=new THREE.CanvasTexture(cvs);
  const sign=new THREE.Mesh(new THREE.BoxGeometry(hw*2-1.5,2.4,.22),
    new THREE.MeshStandardMaterial({map:tex,emissiveMap:tex,emissive:new THREE.Color(1,1,1),emissiveIntensity:.85}));
  sign.position.copy(p);sign.position.y=16.4;scene.add(sign);
}
function buildSpaceBarriers(){
  [-1,1].forEach(side=>{
    const N=200,pos=[],nrm=[],idx=[];
    for(let i=0;i<=N;i++){
      const t=i/N,p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      const b=p.clone().addScaledVector(nr,side*BARRIER_OFF);
      pos.push(b.x,0,b.z,b.x,1.2,b.z);
      nrm.push(-side*nr.x,0,-side*nr.z,-side*nr.x,0,-side*nr.z);
      if(i<N){const a=i*2,b2=a+1,c=a+2,d=a+3;idx.push(a,b2,c,b2,d,c);}
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3));
    geo.setIndex(idx);
    const col=side===-1?0x0088ff:0xff0088;
    scene.add(new THREE.Mesh(geo,new THREE.MeshLambertMaterial({
      color:col,emissive:col,emissiveIntensity:.9,transparent:true,opacity:.30,side:THREE.DoubleSide
})));
  });
}
function buildSpaceDust(){
  if(_spaceDustParticles)return;
  const cnt=350;
  _spaceDustGeo=new THREE.BufferGeometry();
  const pos=new Float32Array(cnt*3);const col=new Float32Array(cnt*3);
  for(let i=0;i<cnt;i++){
    pos[i*3]=(Math.random()-.5)*400;
    pos[i*3+1]=Math.random()*22+1;
    pos[i*3+2]=(Math.random()-.5)*400;
    const r=Math.random();
    if(r<.33){col[i*3]=.7;col[i*3+1]=1;col[i*3+2]=1;}
    else if(r<.66){col[i*3]=.9;col[i*3+1]=.8;col[i*3+2]=1;}
    else{col[i*3]=1;col[i*3+1]=1;col[i*3+2]=1;}
  }
  _spaceDustGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  _spaceDustGeo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  _spaceDustParticles=new THREE.Points(_spaceDustGeo,new THREE.PointsMaterial({
    vertexColors:true,size:.38,sizeAttenuation:false,transparent:true,opacity:.52
  }));
  scene.add(_spaceDustParticles);
}
function buildSpaceGravityWells(){
  _spaceGravityWells.length=0;
  // 3 gravity wells placed just outside the ideal racing line
  [{t:.18,side:1},{t:.50,side:-1},{t:.78,side:1}].forEach(def=>{
    const p=trackCurve.getPoint(def.t),tg=trackCurve.getTangent(def.t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const center=p.clone().addScaledVector(nr,def.side*7); // 7 units off centerline
    center.y=.02;
    // Outer ring
    const torusMat=new THREE.MeshLambertMaterial({color:0x110033,emissive:0x4400aa,emissiveIntensity:1.8});
    const ring1=new THREE.Mesh(new THREE.TorusGeometry(5.5,.22,8,40),torusMat);
    ring1.position.copy(center);ring1.rotation.x=Math.PI/2;scene.add(ring1);
    // Middle ring (spins opposite)
    const ring2=new THREE.Mesh(new THREE.TorusGeometry(3.5,.18,8,32),new THREE.MeshLambertMaterial({color:0x220066,emissive:0x6600cc,emissiveIntensity:2.2}));
    ring2.position.copy(center);ring2.rotation.x=Math.PI/2;ring2.rotation.z=.4;scene.add(ring2);
    // Inner disc
    const disc=new THREE.Mesh(new THREE.CircleGeometry(2.2,32),new THREE.MeshLambertMaterial({color:0x000000,emissive:0x3300aa,emissiveIntensity:1.4,transparent:true,opacity:.88}));
    disc.position.copy(center);disc.position.y=.03;disc.rotation.x=-Math.PI/2;scene.add(disc);
    // Glow point light
    const pl=new THREE.PointLight(0x6600ff,2.5,18);pl.position.copy(center);pl.position.y=1;scene.add(pl);
    _spaceGravityWells.push({pos:center.clone(),ring1,ring2,pl,side:def.side,strength:0.007,radius:22});
  });
}
function buildSpaceRailguns(){
  _spaceRailguns.length=0;
  // 2 railgun strips on long straights
  [{t:.03},{t:.58}].forEach(def=>{
    const p=trackCurve.getPoint(def.t),tg=trackCurve.getTangent(def.t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const ang=Math.atan2(tg.x,tg.z);
    // Rail strips (two parallel, center of track)
    const railMat=new THREE.MeshLambertMaterial({color:0x00ffff,emissive:0x00aaff,emissiveIntensity:2.5});
    [-1,1].forEach(s=>{
      const rail=new THREE.Mesh(new THREE.BoxGeometry(.22,.08,8),railMat);
      rail.position.copy(p);rail.position.y=.05;rail.rotation.y=ang;
      rail.position.addScaledVector(nr,s*2.5);scene.add(rail);
    });
    // Glowing pad between rails
    const pad=new THREE.Mesh(new THREE.BoxGeometry(5.5,.06,8),new THREE.MeshLambertMaterial({color:0x0044ff,emissive:0x0022ff,emissiveIntensity:1.2,transparent:true,opacity:.7}));
    pad.position.copy(p);pad.position.y=.03;pad.rotation.y=ang;scene.add(pad);
    // Arrow chevrons
    const arMat=new THREE.MeshBasicMaterial({color:0x88ffff,transparent:true,opacity:.8});
    [-2,0,2].forEach(oz=>{
      [-1,1].forEach(s=>{
        const bar=new THREE.Mesh(new THREE.BoxGeometry(.12,.07,1.6),arMat);
        bar.position.copy(p);bar.position.y=.06;bar.rotation.y=ang+s*.55;
        bar.position.addScaledVector(tg,oz);scene.add(bar);
      });
    });
    // Point light
    const pl=new THREE.PointLight(0x00ccff,3,16);pl.position.copy(p);pl.position.y=1;scene.add(pl);
    _spaceRailguns.push({pos:p.clone(),t:def.t,tg:tg.clone(),pl,halfLen:4});
  });
}
function buildSpaceWormholes(){
  _spaceWormholes.length=0;
  // Two portal pairs — ONE-WAY: only portal A (entry) teleports you forward to B (exit)
  // Portal B is a visual-only exit gate — entering from B does nothing
  const pairs=[{tA:.25,tB:.70,colA:0x8800ff,colB:0x00ff88},{tA:.42,tB:.88,colA:0xff4400,colB:0x0088ff}];
  pairs.forEach(pair=>{
    [pair.tA,pair.tB].forEach((t,idx)=>{
      const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
      const isA=idx===0; // A = entry (teleports forward), B = exit only
      const col=isA?pair.colA:pair.colB;
      // Entry portal: full size + bright. Exit portal: smaller + dimmer
      const ringR=isA?TW*.85:TW*.60;
      const ringEmit=isA?2.8:1.2;
      const ringOpac=isA?.9:.55;
      const ring=new THREE.Mesh(
        new THREE.TorusGeometry(ringR,.6,10,44),
        new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:ringEmit,transparent:true,opacity:ringOpac}));
      ring.position.copy(p);ring.position.y=4.5;ring.rotation.y=Math.atan2(tg.x,tg.z);scene.add(ring);
      // Inner swirl canvas
      const swCvs=document.createElement('canvas');swCvs.width=128;swCvs.height=128;
      const swTex=new THREE.CanvasTexture(swCvs);
      const portalR=isA?TW*.78:TW*.54;
      const portal=new THREE.Mesh(new THREE.CircleGeometry(portalR,32),
        new THREE.MeshBasicMaterial({map:swTex,transparent:true,opacity:isA?.85:.45,side:THREE.DoubleSide}));
      portal.position.copy(p);portal.position.y=4.5;portal.rotation.y=Math.atan2(tg.x,tg.z);scene.add(portal);
      // Pillar of light (entry only)
      if(isA){
        const beam=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,40,8),
          new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:1.6,transparent:true,opacity:.25}));
        beam.position.copy(p);beam.position.y=20;scene.add(beam);
      }
      // Entry: floating "SHORTCUT →" label above portal
      if(isA){
        const lblCvs=document.createElement('canvas');lblCvs.width=256;lblCvs.height=64;
        const lc=lblCvs.getContext('2d');
        lc.fillStyle='rgba(0,0,0,0)';lc.fillRect(0,0,256,64);
        lc.font='bold 22px Orbitron,sans-serif';lc.fillStyle='#ffffff';lc.textAlign='center';
        lc.fillText('SHORTCUT ▶',128,38);
        const lblTex=new THREE.CanvasTexture(lblCvs);
        const lbl=new THREE.Sprite(new THREE.SpriteMaterial({map:lblTex,transparent:true,opacity:.9}));
        lbl.position.copy(p);lbl.position.y=10.5;lbl.scale.set(8,2,1);scene.add(lbl);
      }
      // Exit: floating "EXIT" label
      if(!isA){
        const lblCvs=document.createElement('canvas');lblCvs.width=128;lblCvs.height=48;
        const lc=lblCvs.getContext('2d');
        lc.fillStyle='rgba(0,0,0,0)';lc.fillRect(0,0,128,48);
        lc.font='bold 18px Orbitron,sans-serif';lc.fillStyle='rgba(255,255,255,0.6)';lc.textAlign='center';
        lc.fillText('EXIT',64,30);
        const lblTex=new THREE.CanvasTexture(lblCvs);
        const lbl=new THREE.Sprite(new THREE.SpriteMaterial({map:lblTex,transparent:true,opacity:.6}));
        lbl.position.copy(p);lbl.position.y=8.5;lbl.scale.set(5,1.5,1);scene.add(lbl);
      }
      // Point light (entry brighter than exit)
      const pl=new THREE.PointLight(col,isA?3.5:1.8,isA?28:18);pl.position.copy(p);pl.position.y=4;scene.add(pl);
      const swCtx=swCvs.getContext('2d');
      _spaceWormholes.push({t,linkedT:pair.tB,ring,portal,swCvs,swCtx,swTex,pl,col,
        phase:isA?0:Math.PI,_drawTimer:0,isEntry:isA});
    });
  });
}
function buildSpaceUFOs(){
  _spaceUFOs.length=0;
  const ufoColors=[0x00ff88,0xaa00ff,0x00ccff,0xff4488,0xffaa00,0x44ffff,0xff2288,0x88ff00];
  for(let i=0;i<10;i++){
    const t=i/10;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const col=ufoColors[i%ufoColors.length];
    const side=(i%2===0?1:-1);
    const spawnX=p.x+nr.x*side*(BARRIER_OFF+30+Math.random()*20);
    const spawnZ=p.z+nr.z*side*(BARRIER_OFF+30+Math.random()*20);
    const spawnY=22+Math.random()*18;
    // Body (flattened sphere)
    const bodyGeo=new THREE.SphereGeometry(2.2,16,10);
    bodyGeo.scale(1,.35,1);
    const body=new THREE.Mesh(bodyGeo,new THREE.MeshLambertMaterial({color:0x222233}));
    body.position.set(spawnX,spawnY,spawnZ);scene.add(body);
    // Dome
    const dome=new THREE.Mesh(new THREE.SphereGeometry(1.1,12,8,0,Math.PI*2,0,Math.PI*.5),
      new THREE.MeshLambertMaterial({color:0x8899ff,emissive:0x4466cc,emissiveIntensity:.8,transparent:true,opacity:.75}));
    dome.position.copy(body.position);dome.position.y+=.4;scene.add(dome);
    // Glow ring
    const glowRing=new THREE.Mesh(new THREE.TorusGeometry(2.4,.12,6,28),
      new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:3.0}));
    glowRing.rotation.x=Math.PI/2;glowRing.position.copy(body.position);glowRing.position.y-=.15;scene.add(glowRing);
    // No per-UFO PointLight — emissive glow ring is enough at this distance
    _spaceUFOs.push({body,dome,glowRing,
      orbitRadius:BARRIER_OFF+32+Math.random()*18,
      orbitY:spawnY,orbitT:t+Math.random(),orbitSpd:.08+Math.random()*.06,
      beamTimer:Math.random()*6,col});
  }
}
function buildSpaceMeteorSystem(){
  _spaceMeteors.length=0;
  _spaceMeteorTimer=12+Math.random()*10;
  // Pool of 3 potential meteors (reused)
  const matOrange=new THREE.MeshLambertMaterial({color:0xff4400,emissive:0xff2200,emissiveIntensity:1.8});
  for(let i=0;i<3;i++){
    const g=new THREE.IcosahedronGeometry(1.4+Math.random()*.8,0);
    const pa=g.attributes.position.array;
    for(let j=0;j<pa.length;j++)pa[j]+=(Math.random()-.5)*.6;
    g.attributes.position.needsUpdate=true;g.computeVertexNormals();
    const m=new THREE.Mesh(g,matOrange.clone());
    m.visible=false;m.position.set(0,300,0);scene.add(m);
    const pl=new THREE.PointLight(0xff4400,0,20);pl.position.copy(m.position);scene.add(pl);
    _spaceMeteors.push({mesh:m,pl,active:false,vy:0,tx:0,tz:0,t:0});
  }
}
function buildSpaceTractorBeam(){
  // Vertical beam shown during recovery
  const geo=new THREE.CylinderGeometry(1.8,0.3,220,12,1);
  const mat=new THREE.MeshLambertMaterial({color:0x00ffff,emissive:0x00aaff,emissiveIntensity:3.5,transparent:true,opacity:.55});
  _spaceBeamMesh=new THREE.Mesh(geo,mat);
  _spaceBeamMesh.position.set(0,-100,0); // hidden below
  _spaceBeamMesh.visible=false;
  scene.add(_spaceBeamMesh);
}
function updateSpaceWorld(dt){
  // ── Rotate asteroids + void debris ──────────────────────────────
  _spaceAsteroids.forEach(a=>{
    if(!a._rspd)return;
    a.rotation.x+=a._rspd.x*dt;a.rotation.y+=a._rspd.y*dt;a.rotation.z+=a._rspd.z*dt;
  });
  // ── Space dust drift — throttled to ~10fps to avoid per-frame GPU uploads ────
  if(_spaceDustParticles&&_spaceDustGeo){
    _spaceDustParticles._driftTimer=(_spaceDustParticles._driftTimer||0)-dt;
    if(_spaceDustParticles._driftTimer<=0){
      _spaceDustParticles._driftTimer=0.1; // 10fps
      const pa=_spaceDustGeo.attributes.position.array;
      const pcar=carObjs[playerIdx];
      const cx=pcar?pcar.mesh.position.x:0,cz=pcar?pcar.mesh.position.z:0;
      for(let i=0;i<pa.length;i+=3){
        pa[i]+=Math.sin(_nowSec*.18+i)*.2;pa[i+1]+=Math.sin(_nowSec*.28+i*1.7)*.1;pa[i+2]+=Math.cos(_nowSec*.22+i)*.2;
        if(pa[i+1]>24||pa[i+1]<.4||Math.abs(pa[i]-cx)>220||Math.abs(pa[i+2]-cz)>220){pa[i]=cx+(Math.random()-.5)*380;pa[i+1]=Math.random()*20+1;pa[i+2]=cz+(Math.random()-.5)*380;}
      }
      _spaceDustGeo.attributes.position.needsUpdate=true;
    }
  }
  // ── Gravity well spin ────────────────────────────────────────────
  _spaceGravityWells.forEach((w,i)=>{
    w.ring1.rotation.z+=dt*(.8+i*.2);
    w.ring2.rotation.z-=dt*1.2;
    // Pull player toward well if within radius
    const car=carObjs[playerIdx];
    if(car&&!car._fallingIntoSpace&&!car.finished){
      const dx=car.mesh.position.x-w.pos.x,dz=car.mesh.position.z-w.pos.z;
      const dist=Math.sqrt(dx*dx+dz*dz);
      if(dist<w.radius&&dist>.5){
        const pull=w.strength*(1-(dist/w.radius));
        car.mesh.position.x-=dx/dist*pull*60*dt;
        car.mesh.position.z-=dz/dist*pull*60*dt;
        if(dist<8&&Math.random()<.015*dt*60)floatText('⚠ GRAVITY!','#aa00ff',innerWidth*.5,innerHeight*.55);
      }
    }
    // Pulse glow
    w.pl.intensity=2.0+Math.sin(_nowSec*3+i)*.8;
  });
  // ── Railgun effect (player physics applied in checkSpaceRailgun) ─
  _spaceRailguns.forEach((r,i)=>{r.pl.intensity=2.5+Math.sin(_nowSec*8+i)*.8;});
  // ── Wormhole swirl animation — throttled to ~15fps (no need for 60fps canvas redraws) ──
  _spaceWormholes.forEach(w=>{
    w.phase+=dt*(w.isEntry?1.8:0.6); // exit portals spin slower
    w.pl.intensity=(w.isEntry?3.0:1.4)+Math.sin(_nowSec*4+w.phase)*(w.isEntry?.8:.3);
    w._drawTimer-=dt;
    if(w._drawTimer>0)return; // skip canvas redraw this frame
    w._drawTimer=0.067; // ~15fps
    const ctx=w.swCtx; // cached context — no getContext() call
    ctx.clearRect(0,0,128,128);
    const g=ctx.createRadialGradient(64,64,0,64,64,60);
    const hex='#'+w.col.toString(16).padStart(6,'0');
    g.addColorStop(0,'rgba(255,255,255,.9)');
    g.addColorStop(.3,hex+'cc');g.addColorStop(.7,hex+'44');g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
    ctx.save();ctx.translate(64,64);ctx.rotate(w.phase);
    for(let s=0;s<4;s++){
      ctx.beginPath();ctx.rotate(Math.PI*.5);
      for(let r2=2;r2<58;r2+=2){ctx.lineTo(Math.cos(r2*.22)*r2,Math.sin(r2*.22)*r2);}
      ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=1.5;ctx.stroke();
    }
    ctx.restore();w.swTex.needsUpdate=true;
  });
  // ── UFO orbits + occasional beam ────────────────────────────────
  _spaceUFOs.forEach(u=>{
    u.orbitT+=dt*u.orbitSpd;
    const angle=u.orbitT*Math.PI*2;
    const cx=Math.cos(angle)*u.orbitRadius,cz=Math.sin(angle)*u.orbitRadius;
    u.body.position.set(cx,u.orbitY+Math.sin(u.orbitT*2.3)*.8,cz);
    u.dome.position.copy(u.body.position);u.dome.position.y+=.42;
    u.glowRing.position.copy(u.body.position);u.glowRing.position.y-=.14;
    u.glowRing.rotation.z+=dt*.9;
    // Occasional beam down to track
    u.beamTimer-=dt;
    if(u.beamTimer<=0){u.beamTimer=6+Math.random()*8;}
  });
  // ── Tractor beam fade ─────────────────────────────────────────────
  if(_spaceBeamTimer>0){
    _spaceBeamTimer-=dt;
    if(_spaceBeamMesh){
      _spaceBeamMesh.visible=true;
      _spaceBeamMesh.material.opacity=Math.min(.6,_spaceBeamTimer*.5);
      _spaceBeamMesh.rotation.y+=dt*2;
    }
    if(_spaceBeamTimer<=0&&_spaceBeamMesh)_spaceBeamMesh.visible=false;
  }
  // ── Meteor system ────────────────────────────────────────────────
  _spaceMeteorTimer-=dt;
  if(_spaceMeteorTimer<=0){
    _spaceMeteorTimer=14+Math.random()*12;
    spawnSpaceMeteor();
  }
  _spaceMeteors.forEach(m=>{
    if(!m.active)return;
    m.mesh.position.y+=m.vy*dt;m.mesh.rotation.x+=1.2*dt;m.mesh.rotation.z+=.8*dt;
    m.pl.position.copy(m.mesh.position);
    m.vy-=32*dt; // fast fall
    // Trail: emit spark each frame
    if(Math.random()<.6)sparkSystem.emit(m.mesh.position.x,m.mesh.position.y,m.mesh.position.z,(Math.random()-.5)*.05,.06+Math.random()*.04,(Math.random()-.5)*.05,4,1,.55,.15,.9);
    if(m.mesh.position.y<=.5){
      // Impact
      sparkSystem.emit(m.mesh.position.x,.5,m.mesh.position.z,(Math.random()-.5)*.12,.14+Math.random()*.08,(Math.random()-.5)*.12,28,1,.6,.2,.9);
      camShake=.7;
      // Stay as obstacle for 8 seconds then deactivate
      m.mesh.position.y=.5;m.vy=0;m.t+=dt;
      m.pl.intensity=1.2+Math.sin(_nowSec*4)*.5;
      if(m.t>8){m.active=false;m.mesh.visible=false;m.pl.intensity=0;}
      // Check collision with player
      const car=carObjs[playerIdx];
      if(car){
        const dd=car.mesh.position.distanceTo(m.mesh.position);
        if(dd<3.5){
          car.speed*=.4;car.hitCount=(car.hitCount||0)+1;
          floatText('☄ METEOR HIT!','#ff4400',innerWidth*.5,innerHeight*.45);
          playCollisionSound();m.active=false;m.mesh.visible=false;m.pl.intensity=0;
        }
      }
    }
  });
  // ── Player fall detection ─────────────────────────────────────────
  const car=carObjs[playerIdx];
  if(car&&car._fallingIntoSpace&&!recoverActive){
    car._fallTimer=(car._fallTimer||0)+dt;
    car.vy-=18*dt;
    car.mesh.position.y+=car.vy*dt;
    car.speed*=Math.pow(.85,dt*60);
    car.mesh.rotation.x+=.9*dt;car.mesh.rotation.z+=.6*dt;
    if(car.mesh.position.y<-18||car._fallTimer>3.5)triggerSpaceRecovery(car);
  }
}
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
function buildNeonCityEnvironment(){
  buildNeonGround();
  buildNeonSkyscrapers();
  buildNeonHoloBillboards();
  buildNeonBarriers();
  buildNeonTunnel();
  buildNeonFlyover();
  buildNeonWaterfront();
  buildNeonStreetLamps();
  buildNeonParticles();
  buildNeonSkyGlow();
  buildNeonNightObjects();
}

function buildNeonGround(){
  // Dark wet asphalt base
  const asphalt=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),
    new THREE.MeshLambertMaterial({color:0x080810}));
  asphalt.rotation.x=-Math.PI/2;asphalt.position.y=-.15;asphalt.receiveShadow=true;
  scene.add(asphalt);
  // Wet reflective overlay — key for the Blade Runner look
  const wet=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),
    new THREE.MeshLambertMaterial({color:0x0e0e20,transparent:true,opacity:.38}));
  wet.rotation.x=-Math.PI/2;wet.position.y=-.12;scene.add(wet);
  _neonWater=wet;
  // Neon puddles — coloured reflective pools scattered off-track
  const puddleColors=[0x00ffee,0xff00aa,0x4488ff,0xeeff00,0x00ffee,0xff2288];
  for(let i=0;i<_mobCount(22);i++){
    const t=i/22;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(TW+6+Math.random()*12);
    const puddle=new THREE.Mesh(
      new THREE.PlaneGeometry(2+Math.random()*6,1+Math.random()*4),
      new THREE.MeshLambertMaterial({
        color:puddleColors[i%puddleColors.length],transparent:true,opacity:.14+Math.random()*.10,
        blending:THREE.AdditiveBlending,depthWrite:false
})
    );
    puddle.rotation.x=-Math.PI/2;puddle.rotation.z=Math.random()*Math.PI;
    puddle.position.set(p.x+nr.x*side,-.10,p.z+nr.z*side);
    scene.add(puddle);
  }
}

function buildNeonSkyscrapers(){
  const buildingColors=[0x060618,0x080820,0x050514,0x0a0a22,0x040410,0x07071a];
  const neonAccents=[0x00ffee,0xff00aa,0x2244ff,0xff2288,0xeeff00,0x00aaff,0xff6600,0xaa00ff];
  for(let i=0;i<_mobCount(40);i++){
    const t=(i/40+Math.random()*.006)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+30+Math.random()*60);
    const bx=p.x+nr.x*side+(Math.random()-.5)*14;
    const bz=p.z+nr.z*side+(Math.random()-.5)*14;
    // Varied building proportions — slim towers, wide blocks, mixed
    const h=22+Math.random()*68;
    const w=4+Math.random()*14;
    const d=4+Math.random()*10;
    const accentCol=neonAccents[Math.floor(Math.random()*neonAccents.length)];
    const bodyMat=new THREE.MeshLambertMaterial({color:buildingColors[Math.floor(Math.random()*buildingColors.length)]});
    const body=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),bodyMat);
    body.position.set(bx,h/2,bz);body.castShadow=true;scene.add(body);
    // Neon accent stripes (2-5 per building)
    const stripeCount=2+Math.floor(Math.random()*4);
    for(let s=0;s<stripeCount;s++){
      const sy=h*(0.12+s*(0.72/stripeCount)+Math.random()*0.04);
      const stripeMat=new THREE.MeshLambertMaterial({color:accentCol,emissive:accentCol,emissiveIntensity:2.2});
      const stripe=new THREE.Mesh(new THREE.BoxGeometry(w+.3,.2,d+.3),stripeMat);
      stripe.position.set(bx,sy,bz);scene.add(stripe);
      _neonEmissives.push({mesh:stripe,phase:Math.random()*Math.PI*2,baseInt:2.2});
    }
    // Window grid via canvas texture (80% of buildings)
    if(Math.random()>.2){
      const cvs=document.createElement('canvas');cvs.width=64;cvs.height=128;
      const ctx=cvs.getContext('2d');
      ctx.fillStyle='#000000';ctx.fillRect(0,0,64,128);
      for(let wy=0;wy<16;wy++) for(let wx=0;wx<8;wx++){
        if(Math.random()>.38){
          const isBlue=Math.random()>.6;
          ctx.fillStyle=isBlue?'#2a3d66':(Math.random()>.5?'#ffe4a0':'#ffcc80');
          ctx.fillRect(wx*8+1,wy*8+1,6,6);
        }
      }
      const wTex=new THREE.CanvasTexture(cvs);
      wTex.minFilter=THREE.NearestFilter;wTex.magFilter=THREE.NearestFilter;
      const wFace=new THREE.Mesh(new THREE.PlaneGeometry(w-.6,h-2),
        new THREE.MeshStandardMaterial({map:wTex,emissiveMap:wTex,emissive:new THREE.Color(1,1,1),emissiveIntensity:.42,transparent:true}));
      wFace.position.set(bx,h/2,bz+d/2+.07);scene.add(wFace);
      // Also on side face for depth
      if(Math.random()>.5){
        const wSide=new THREE.Mesh(new THREE.PlaneGeometry(d-.4,h-2),
          new THREE.MeshStandardMaterial({map:wTex,emissiveMap:wTex,emissive:new THREE.Color(1,1,1),emissiveIntensity:.28,transparent:true}));
        wSide.position.set(bx+w/2+.07,h/2,bz);wSide.rotation.y=Math.PI/2;scene.add(wSide);
      }
    }
    // Rooftop light every 4th building
    if(i%4===0){
      const rl=new THREE.PointLight(accentCol,1.6+Math.random(),38+Math.random()*18);
      rl.position.set(bx,h+.8,bz);scene.add(rl);
      _neonBuildingLights.push(rl);
      trackLightList.push(rl);
    }
    _neonBuildings.push({x:bx,z:bz,h,accentCol});
  }
}

function buildNeonHoloBillboards(){
  const messages=["SPENCER'S RACE CLUB","NEON CITY GP","TURBO BOOST",
    "SPEED DEMON","RACE HARDER","DRIFT KING","NITRO ZONE","FINISH LINE"];
  const colors=[0x00ffee,0xff00aa,0xeeff00,0x2288ff,0xff4488,0x44ffcc,0xffaa00,0xaa44ff];
  for(let i=0;i<8;i++){
    const t=(i/8+.06)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+22+Math.random()*18);
    const hex='#'+colors[i].toString(16).padStart(6,'0');
    const cvs=document.createElement('canvas');cvs.width=256;cvs.height=64;
    const ctx=cvs.getContext('2d');
    ctx.clearRect(0,0,256,64);
    ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(0,0,256,64);
    // Glow border
    ctx.strokeStyle=hex;ctx.lineWidth=2;ctx.globalAlpha=.4;
    ctx.strokeRect(2,2,252,60);ctx.globalAlpha=1;
    // Double-draw for neon glow effect
    ctx.font='bold 20px "Courier New",monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.shadowColor=hex;ctx.shadowBlur=22;ctx.fillStyle=hex;
    ctx.fillText(messages[i],128,32);
    ctx.shadowBlur=8;ctx.fillText(messages[i],128,32);
    const tex=new THREE.CanvasTexture(cvs);
    const mat=new THREE.MeshStandardMaterial({
      map:tex,emissiveMap:tex,emissive:new THREE.Color(1,1,1),emissiveIntensity:2.0,
      transparent:true,opacity:.9,side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending,depthWrite:false
    });
    const bh=9+Math.random()*8;
    const billboard=new THREE.Mesh(new THREE.PlaneGeometry(14,3.5),mat);
    billboard.position.set(p.x+nr.x*side,bh,p.z+nr.z*side);
    billboard.lookAt(p.x,bh,p.z);scene.add(billboard);
    // Support pole
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.08,.12,bh,6),
      new THREE.MeshLambertMaterial({color:0x1a1a2a}));
    pole.position.set(billboard.position.x,bh/2,billboard.position.z);scene.add(pole);
    // Glow light behind billboard
    const bl=new THREE.PointLight(colors[i],1.2,18);
    bl.position.copy(billboard.position);scene.add(bl);
    trackLightList.push(bl);
    _holoBillboards.push({mesh:billboard,baseY:bh,phase:Math.random()*Math.PI*2,col:colors[i],light:bl});
  }
}

function buildNeonBarriers(){
  const N=_mobCount(240);
  const barrierCols=[0x00ffee,0xff00aa];
  [-1,1].forEach((side,si)=>{
    for(let i=0;i<N;i++){
      const t=i/N;
      const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      const pos=p.clone().addScaledVector(nr,side*BARRIER_OFF);
      const mat=new THREE.MeshLambertMaterial({
        color:barrierCols[si],emissive:barrierCols[si],
        emissiveIntensity:1.5,transparent:true,opacity:.82
});
      const seg=new THREE.Mesh(new THREE.BoxGeometry(.22,.85,1.0),mat);
      seg.position.copy(pos);seg.position.y=.425;
      seg.rotation.y=Math.atan2(tg.x,tg.z);scene.add(seg);
      // Accent lights every 10 segments
      if(i%10===0){
        const bl=new THREE.PointLight(barrierCols[si],.55,14);
        bl.position.copy(pos);bl.position.y=1.0;scene.add(bl);
        trackLightList.push(bl);
      }
    }
  });
}

function buildNeonTunnel(){
  // Tunnel over waypoints 8-10: t≈.44-.58
  const tStart=.44,tEnd=.58;
  const segments=_mobCount(20);
  const darkMat=new THREE.MeshLambertMaterial({color:0x060615,side:THREE.DoubleSide});
  const neonMatC=new THREE.MeshLambertMaterial({color:0x00ffee,emissive:0x00ffee,emissiveIntensity:2.8});
  const neonMatM=new THREE.MeshLambertMaterial({color:0xff00aa,emissive:0xff00aa,emissiveIntensity:2.5});
  for(let i=0;i<segments;i++){
    const t=tStart+(i/segments)*(tEnd-tStart);
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const angle=Math.atan2(tg.x,tg.z);
    const isCyan=i%3===0,isMag=i%3===1;
    const archMat=isCyan?neonMatC:isMag?neonMatM:darkMat;
    // Roof arch (half torus)
    const arch=new THREE.Mesh(new THREE.TorusGeometry(TW+3.5,.55,5,16,Math.PI),archMat);
    arch.position.copy(p);arch.position.y=0;arch.rotation.y=angle;scene.add(arch);
    // Side walls
    [-1,1].forEach(s=>{
      const wallPos=p.clone().addScaledVector(nr,s*(TW+3.5));
      const wall=new THREE.Mesh(new THREE.BoxGeometry(.35,TW+5,.2),darkMat);
      wall.position.copy(wallPos);wall.position.y=(TW+5)/2;scene.add(wall);
    });
    // Glow lights at neon arches
    if(isCyan||isMag){
      const lc=isCyan?0x00ffee:0xff00aa;
      const tl=new THREE.PointLight(lc,1.6,24);
      tl.position.copy(p);tl.position.y=TW+2;scene.add(tl);
      trackLightList.push(tl);
    }
    // Ground glow strip inside tunnel
    const glow=new THREE.Mesh(new THREE.PlaneGeometry(TW*1.85,.5),
      new THREE.MeshLambertMaterial({color:0x001520,emissive:0x00ffee,emissiveIntensity:.35,transparent:true,opacity:.6}));
    glow.rotation.x=-Math.PI/2;glow.position.copy(p);glow.position.y=.02;scene.add(glow);
  }
}

function buildNeonFlyover(){
  // Elevated section t≈.27-.44 — pillars with magenta neon rings below
  const pillarMat=new THREE.MeshLambertMaterial({color:0x101020});
  const ringMat=new THREE.MeshLambertMaterial({color:0xff00aa,emissive:0xff00aa,emissiveIntensity:2.0});
  const beamMat=new THREE.MeshLambertMaterial({color:0x0c0c1c});
  // 12 pillar pairs along the flyover
  for(let i=0;i<12;i++){
    const t=.27+(i/11)*(.44-.27);
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    // Height follows flyover curve: sine arch peaking at t=.355
    const mid=(.27+.44)/2;
    const span=(.44-.27)/2;
    const heightT=1-Math.abs(t-mid)/span;
    const ph=Math.max(0,Math.sin(heightT*Math.PI)*14);
    if(ph<1.5)continue;
    [-1,1].forEach(s=>{
      const px=p.x+nr.x*s*TW*.62,pz=p.z+nr.z*s*TW*.62;
      // Main pillar
      const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.45,.65,ph,7),pillarMat);
      pillar.position.set(px,ph/2,pz);scene.add(pillar);
      // Neon ring at top
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.75,.12,5,14),ringMat);
      ring.position.set(px,ph-.3,pz);ring.rotation.x=Math.PI/2;scene.add(ring);
      _neonEmissives.push({mesh:ring,phase:i*.5+s*1.2,baseInt:2.0});
      // Cross beam between pillars
      if(s===1){
        const bx=(p.x+nr.x*TW*.62+p.x-nr.x*TW*.62)/2;
        const bz=(p.z+nr.z*TW*.62+p.z-nr.z*TW*.62)/2;
        const beam=new THREE.Mesh(new THREE.BoxGeometry(TW*1.24,.4,.4),beamMat);
        beam.position.set(bx,ph,bz);beam.rotation.y=Math.atan2(nr.x,nr.z);scene.add(beam);
      }
      // Point light every other pillar
      if(i%2===0){
        const pl=new THREE.PointLight(0xff00aa,1.0,20);
        pl.position.set(px,ph+.5,pz);scene.add(pl);
        _neonBuildingLights.push(pl);
      }
    });
  }
}

function buildNeonWaterfront(){
  // Wide water strip along the S/F straight (west side)
  const waterMat=new THREE.MeshLambertMaterial({
    color:0x000c18,transparent:true,opacity:.85
});
  const water=new THREE.Mesh(new THREE.PlaneGeometry(100,580),waterMat);
  water.rotation.x=-Math.PI/2;water.position.set(-75,-.06,60);scene.add(water);
  // Neon color reflection strips on water
  const reflectCols=[0x00ffee,0xff00aa,0xeeff00];
  reflectCols.forEach((col,i)=>{
    const r=new THREE.Mesh(new THREE.PlaneGeometry(6+Math.random()*8,55),
      new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.10+Math.random()*.08,
        blending:THREE.AdditiveBlending,depthWrite:false}));
    r.rotation.x=-Math.PI/2;r.position.set(-58+i*16,-.05,80+Math.random()*30);scene.add(r);
  });
  // Quay edge — dark concrete wall
  const quay=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.4,560),
    new THREE.MeshLambertMaterial({color:0x0a0a18}));
  quay.position.set(-26,.5,60);scene.add(quay);
  // Neon tube lamps along quay
  for(let i=0;i<_mobCount(14);i++){
    const z=-240+i*(480/13);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.055,.08,5.5,5),
      new THREE.MeshLambertMaterial({color:0x1c1c2c}));
    pole.position.set(-26,2.75,z);scene.add(pole);
    const col=i%2===0?0x00ffee:0xff00aa;
    const tube=new THREE.Mesh(new THREE.BoxGeometry(1.6,.12,.12),
      new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:2.8}));
    tube.position.set(-26,5.6,z);scene.add(tube);
    const pl=new THREE.PointLight(col,1.5,22);pl.position.set(-26,5.5,z);scene.add(pl);
    trackLightList.push(pl);
  }
}

function buildNeonStreetLamps(){
  // Track-side neon tube lamps (replaces standard GP lamp posts)
  const N=_mobCount(28);
  for(let i=0;i<N;i++){
    const t=i/N;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    [-1,1].forEach((side,si)=>{
      const pp=p.clone().addScaledVector(nr,side*(BARRIER_OFF+2.2));
      // Slim dark pole
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.09,7.5,5),
        new THREE.MeshLambertMaterial({color:0x141424}));
      pole.position.copy(pp);pole.position.y=3.75;scene.add(pole);
      trackPoles.push(pole);
      // Horizontal neon tube on top (alternating cyan/magenta)
      const col=si===0?0x00ffee:0xff00aa;
      const tube=new THREE.Mesh(new THREE.BoxGeometry(2.2,.12,.12),
        new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:2.4}));
      tube.position.copy(pp);tube.position.y=7.55;scene.add(tube);
      trackPoles.push(tube);
      _neonEmissives.push({mesh:tube,phase:i*.4+si*1.8,baseInt:2.4});
      const pl=new THREE.PointLight(col,0,20);pl.position.copy(pp);pl.position.y=7.4;
      scene.add(pl);trackLightList.push(pl);
    });
  }
  // Stars = neon dust cloud spheres far above
  const sg=new THREE.SphereGeometry(.18,4,4);
  const sm=new THREE.MeshBasicMaterial({color:0x00ffee,transparent:true,opacity:.8});
  stars=new THREE.InstancedMesh(sg,sm,120);stars.visible=true;
  const dm=new THREE.Object3D();
  for(let i=0;i<120;i++){
    const th=Math.random()*Math.PI*2,ph=Math.random()*Math.PI*.35,r=280+Math.random()*90;
    dm.position.set(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph)*.4+80,r*Math.sin(ph)*Math.sin(th));
    dm.scale.setScalar(.5+Math.random()*1.5);dm.updateMatrix();stars.setMatrixAt(i,dm.matrix);
  }
  stars.instanceMatrix.needsUpdate=true;scene.add(stars);
  // Headlights for night driving
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);
}

function buildNeonParticles(){
  // Steam vents — 6 locations off track
  for(let i=0;i<6;i++){
    const t=(i/6+.08)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(TW+5+Math.random()*5);
    const vx=p.x+nr.x*side,vz=p.z+nr.z*side;
    // Grate on ground
    const grate=new THREE.Mesh(new THREE.BoxGeometry(1.2,.05,1.2),
      new THREE.MeshLambertMaterial({color:0x1a1a28}));
    grate.position.set(vx,-.10,vz);scene.add(grate);
    _neonSteamVents.push({x:vx,z:vz,phase:Math.random()*Math.PI*2});
  }
  // Steam particle system
  const N=_mobCount(200);
  const sGeo=new THREE.BufferGeometry();
  const sPos=new Float32Array(N*3);
  // Initialise at vent positions
  for(let i=0;i<N;i++){
    const vi=i%_neonSteamVents.length;
    if(_neonSteamVents[vi]){
      sPos[i*3]=_neonSteamVents[vi].x+(Math.random()-.5)*.5;
      sPos[i*3+1]=Math.random()*4;
      sPos[i*3+2]=_neonSteamVents[vi].z+(Math.random()-.5)*.5;
    }
  }
  sGeo.setAttribute('position',new THREE.Float32BufferAttribute(sPos,3));
  _neonSteamPts=new THREE.Points(sGeo,
    new THREE.PointsMaterial({color:0x8899bb,size:.22,transparent:true,opacity:.38,sizeAttenuation:true}));
  scene.add(_neonSteamPts);_neonSteamGeo=sGeo;_neonSteamPos=sPos;
  // Floating neon dust (cyan+magenta micro-particles)
  const DN=_mobCount(350);
  const dGeo=new THREE.BufferGeometry();
  const dPos=new Float32Array(DN*3);
  const dCol=new Float32Array(DN*3);
  const neonPairs=[[0,1,1],[1,0,.67],[.87,1,0],[.13,.53,1],[1,.13,.53]];
  for(let i=0;i<DN;i++){
    dPos[i*3]=(Math.random()-.5)*520;
    dPos[i*3+1]=Math.random()*20+.5;
    dPos[i*3+2]=(Math.random()-.5)*520;
    const c=neonPairs[i%neonPairs.length];
    dCol[i*3]=c[0];dCol[i*3+1]=c[1];dCol[i*3+2]=c[2];
  }
  dGeo.setAttribute('position',new THREE.Float32BufferAttribute(dPos,3));
  dGeo.setAttribute('color',new THREE.Float32BufferAttribute(dCol,3));
  _neonDustPts=new THREE.Points(dGeo,
    new THREE.PointsMaterial({vertexColors:true,size:.2,transparent:true,opacity:.55,sizeAttenuation:false}));
  scene.add(_neonDustPts);_neonDustGeo=dGeo;
}

function buildNeonSkyGlow(){
  // Distant city smog glow at horizon — 4 large translucent spheres
  const glowData=[
    {pos:[-400,60,-600],col:0x330066,op:.12},{pos:[500,50,-500],col:0x660033,op:.10},
    {pos:[-300,40,500],col:0x003344,op:.09},{pos:[450,55,450],col:0x220055,op:.11}
  ];
  glowData.forEach(g=>{
    const s=new THREE.Mesh(new THREE.SphereGeometry(160,8,6),
      new THREE.MeshBasicMaterial({color:g.col,transparent:true,opacity:g.op,side:THREE.BackSide}));
    s.position.set(g.pos[0],g.pos[1],g.pos[2]);scene.add(s);
  });
  // Neon fog plane at street level — adds depth to the city
  const fogPlane=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),
    new THREE.MeshBasicMaterial({color:0x050012,transparent:true,opacity:.25,
      blending:THREE.AdditiveBlending,depthWrite:false}));
  fogPlane.rotation.x=-Math.PI/2;fogPlane.position.y=.5;scene.add(fogPlane);
}

function buildNeonNightObjects(){
  // Neon city is always night — immediately activate all track lights
  trackLightList.forEach(l=>{ l.intensity=(l.intensity||0)>0?l.intensity:1.4; });
  trackPoles.forEach(p=>{ p.visible=true; });
}

// ── Neon City Gameplay Elements ───────────────────────────────────────────────
function buildNeonEMPZones(){
  const defs=[{t:.22},{t:.52},{t:.78}];
  defs.forEach((def,di)=>{
    const p=trackCurve.getPoint(def.t).clone();
    // Hexagonal pad on track
    const pad=new THREE.Mesh(new THREE.CylinderGeometry(5.5,5.5,.08,6),
      new THREE.MeshLambertMaterial({color:0x001a2a,emissive:0x00ffee,emissiveIntensity:1.2,transparent:true,opacity:.7}));
    pad.position.copy(p);pad.position.y=.02;scene.add(pad);
    // Pulsing ring
    const ring=new THREE.Mesh(new THREE.TorusGeometry(5.8,.2,6,32),
      new THREE.MeshLambertMaterial({color:0x00ffee,emissive:0x00ffee,emissiveIntensity:2.2}));
    ring.rotation.x=Math.PI/2;ring.position.copy(p);ring.position.y=.15;scene.add(ring);
    // WARNING sprite
    const cvs=document.createElement('canvas');cvs.width=128;cvs.height=40;
    const ctx=cvs.getContext('2d');ctx.fillStyle='rgba(0,20,30,.8)';ctx.fillRect(0,0,128,40);
    ctx.font='bold 14px Orbitron,monospace';ctx.fillStyle='#00ffee';ctx.textAlign='center';
    ctx.fillText('⚡ EMP ZONE',64,26);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cvs),transparent:true}));
    sp.position.copy(p);sp.position.y=4;sp.scale.set(10,3,1);scene.add(sp);
    const pl=new THREE.PointLight(0x00ffee,.8,14);pl.position.copy(p);pl.position.y=1;scene.add(pl);
    _neonEmpZones.push({pos:p.clone(),pad,ring,pl,cooldown:0});
  });
}

function buildNeonHoloWalls(){
  const defs=[{t:.42},{t:.70}];
  defs.forEach((def,wi)=>{
    const p=trackCurve.getPoint(def.t),tg=trackCurve.getTangent(def.t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const angle=Math.atan2(tg.x,tg.z);
    const mat=new THREE.MeshLambertMaterial({
      color:0x00ffee,emissive:0x00ffee,emissiveIntensity:1.0,transparent:true,opacity:.38,
      side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false
});
    const wall=new THREE.Mesh(new THREE.BoxGeometry(TW*.7,3.8,.15),mat);
    wall.position.copy(p);wall.position.y=1.9;wall.rotation.y=angle;scene.add(wall);
    // Frame
    const frameMat=new THREE.MeshLambertMaterial({color:0x00ffee,emissive:0x00ffee,emissiveIntensity:2.5});
    const frame=new THREE.Mesh(new THREE.BoxGeometry(TW*.7+.3,.18,.18),frameMat);
    frame.position.copy(p);frame.position.y=3.8;frame.rotation.y=angle;scene.add(frame);
    const frame2=new THREE.Mesh(new THREE.BoxGeometry(TW*.7+.3,.18,.18),frameMat);
    frame2.position.copy(p);frame2.position.y=.09;frame2.rotation.y=angle;scene.add(frame2);
    _neonHoloWalls.push({mesh:wall,basePos:p.clone(),normal:nr.clone(),phase:wi*3,cooldown:0});
  });
}

// ── Neon City Update Loop ─────────────────────────────────────────────────────
function updateNeonCityWorld(dt){
  if(!scene)return;
  const t=_nowSec;
  // Building neon stripes pulse — slow organic breathing
  _neonEmissives.forEach((item,i)=>{
    if(!item.mesh||!item.mesh.material)return;
    const pulse=item.baseInt*.6+item.baseInt*.7*Math.sin(t*1.6+item.phase);
    item.mesh.material.emissiveIntensity=Math.max(0,pulse);
  });
  // Holo billboards: float + opacity flicker
  _holoBillboards.forEach((bb,i)=>{
    bb.mesh.position.y=bb.baseY+Math.sin(t*.65+bb.phase)*.5;
    bb.mesh.material.opacity=.65+Math.sin(t*1.0+bb.phase*.9)*.24;
    if(bb.light)bb.light.intensity=.8+Math.sin(t*1.8+bb.phase)*.5;
  });
  // Steam vents — particles rise and drift
  if(_neonSteamGeo&&_neonSteamPos&&_neonSteamVents.length>0){
    const pos=_neonSteamPos;const N=pos.length/3;
    for(let i=0;i<N;i++){
      pos[i*3+1]+=dt*(1.0+Math.random()*.6);
      pos[i*3]+= Math.sin(t*2.2+i*.4)*.012;
      pos[i*3+2]+=Math.cos(t*1.8+i*.5)*.012;
      if(pos[i*3+1]>4.5+Math.random()*2.5){
        const vi=i%_neonSteamVents.length;
        pos[i*3]=_neonSteamVents[vi].x+(Math.random()-.5)*.55;
        pos[i*3+1]=Math.random()*.2;
        pos[i*3+2]=_neonSteamVents[vi].z+(Math.random()-.5)*.55;
      }
    }
    _neonSteamGeo.attributes.position.needsUpdate=true;
  }
  // Neon dust drift
  if(_neonDustGeo){
    const pos=_neonDustGeo.attributes.position.array;
    const car=carObjs[playerIdx];
    const cx=car?car.mesh.position.x:0,cz=car?car.mesh.position.z:0;
    const step=Math.floor(t*pos.length/3)%(pos.length/3/4|0)||1;
    for(let i=step;i<Math.min(step+40,pos.length/3);i++){
      pos[i*3+1]+=Math.sin(t*.25+i*.6)*.006;
      if(Math.abs(pos[i*3]-cx)>265||Math.abs(pos[i*3+2]-cz)>265){
        pos[i*3]=cx+(Math.random()-.5)*500;
        pos[i*3+2]=cz+(Math.random()-.5)*500;
      }
    }
    _neonDustGeo.attributes.position.needsUpdate=true;
  }
  // Building rooftop lights — occasional flicker for life
  if(Math.random()<.015){
    const l=_neonBuildingLights[Math.floor(Math.random()*_neonBuildingLights.length)];
    if(l){const orig=l.intensity;l.intensity=.2+Math.random()*.4;setTimeout(()=>{l.intensity=orig;},60+Math.random()*100);}
  }
  // Holo walls oscillate left-right
  _neonHoloWalls.forEach((wall,i)=>{
    const offset=Math.sin(t*.5+i*3)*TW*.32;
    wall.mesh.position.x=wall.basePos.x+wall.normal.x*offset;
    wall.mesh.position.z=wall.basePos.z+wall.normal.z*offset;
    wall.mesh.material.opacity=.28+Math.sin(t*3.5+i*2)*.18;
  });
  // EMP zones pulse
  _neonEmpZones.forEach((emp,i)=>{
    emp.pad.material.opacity=.45+Math.sin(t*2.8+i*2.1)*.25;
    emp.ring.scale.setScalar(1+Math.sin(t*2+i*.8)*.06);
    if(emp.pl)emp.pl.intensity=.6+Math.sin(t*3+i*1.5)*.4;
    // Player collision
    if(emp.cooldown>0){emp.cooldown-=dt;return;}
    const car=carObjs[playerIdx];
    if(!car)return;
    const dx=car.mesh.position.x-emp.pos.x,dz=car.mesh.position.z-emp.pos.z;
    if(Math.sqrt(dx*dx+dz*dz)<5.5){
      car.speed*=.82;camShake=.65;
      showPopup('⚡ EMP ZONE!','#00ffee',1000);emp.cooldown=4;
      // Visual glitch: brief exposure change
      if(renderer)renderer.toneMappingExposure=.4;
      setTimeout(()=>{if(renderer)renderer.toneMappingExposure=1.1;},180);
    }
  });
  // Holo wall collision
  _neonHoloWalls.forEach((wall,i)=>{
    if(wall.cooldown>0){wall.cooldown-=dt;return;}
    const car=carObjs[playerIdx];if(!car)return;
    const dx=car.mesh.position.x-wall.mesh.position.x;
    const dz=car.mesh.position.z-wall.mesh.position.z;
    const dist=Math.sqrt(dx*dx+dz*dz);
    if(dist<TW*.38&&Math.abs(car.mesh.position.y-1.9)<3.5){
      car.speed*=.38;car.spinTimer=.55;
      showPopup('🔷 HOLO-WALL!','#00ffee',900);wall.cooldown=3;
    }
  });
  // Water shimmer
  if(_neonWater){
    _neonWater.material.roughness=.04+Math.sin(t*.38)*.025;
    _neonWater.material.needsUpdate=true;
  }
}


function buildDeepSeaEnvironment(){
  buildSeaFloor();
  buildCoralReefs();
  buildKelp();
  buildShipwreck();
  buildSubmarineStation();
  buildSeaGate();
  buildBioluminescentTrackEdges();
  buildJellyfish();
  buildSeaCreatures();
  buildDeepSeaBubbles();
  buildDeepSeaLightRays();
  buildDeepSeaNightObjects();
}

function buildSeaFloor(){
  // Main sandy seafloor
  const sandMat=new THREE.MeshLambertMaterial({color:0xc8a96a});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400,1,1),sandMat);
  floor.rotation.x=-Math.PI/2;floor.position.y=-.18;floor.receiveShadow=true;scene.add(floor);
  // Darker infield — ocean trench / crevice
  const trenchMat=new THREE.MeshLambertMaterial({color:0x001830});
  const trench=new THREE.Mesh(new THREE.PlaneGeometry(380,320,1,1),trenchMat);
  trench.rotation.x=-Math.PI/2;trench.position.set(-30,-.15,-40);scene.add(trench);
  // Seafloor hills (lumpy formations)
  const hillMat=new THREE.MeshLambertMaterial({color:0xb89558});
  const hillPositions=[[210,-180,8],[-220,130,10],[150,280,7],[-80,-310,9],[300,100,6],[-310,-50,8],[80,-360,7],[-180,280,6]];
  hillPositions.forEach(([hx,hz,hr])=>{
    const hgeo=new THREE.SphereGeometry(hr+Math.random()*4,8,5);hgeo.scale(1,.38+Math.random()*.18,1);
    const h=new THREE.Mesh(hgeo,hillMat);h.position.set(hx,0,hz);h.receiveShadow=true;scene.add(h);
  });
  // Sand ripple lines (flat thin boxes)
  const rippleMat=new THREE.MeshLambertMaterial({color:0xd4b87a,transparent:true,opacity:.55});
  for(let i=0;i<30;i++){
    const r=new THREE.Mesh(new THREE.BoxGeometry(60+Math.random()*120,.05,.6),rippleMat);
    r.position.set((Math.random()-.5)*600,-.12,(Math.random()-.5)*700);
    r.rotation.y=Math.random()*Math.PI;scene.add(r);
  }
}

function buildCoralReefs(){
  const coralColors=[0xff5533,0xff8800,0xff4488,0x44ddaa,0xffcc00,0xff6622,0xcc44ff,0x22ddff];
  // 35 reef clusters scattered off-track
  for(let ci=0;ci<35;ci++){
    const t=(ci/35+Math.random()*.012)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(ci%2===0?1:-1)*(BARRIER_OFF+18+Math.random()*24);
    const cx=p.x+nr.x*side+(Math.random()-.5)*8,cz=p.z+nr.z*side+(Math.random()-.5)*8;
    const col=coralColors[ci%coralColors.length];
    const branches=3+Math.floor(Math.random()*4);
    for(let b=0;b<branches;b++){
      // Coral type alternates
      const type=ci%4;
      if(type===0){
        // Branch coral — thin cylinders
        const h=1.8+Math.random()*2.4;
        const seg=new THREE.Mesh(new THREE.CylinderGeometry(.12,.22,h,5),
          new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:.12}));
        seg.position.set(cx+(Math.random()-.5)*3,(h/2),cz+(Math.random()-.5)*3);
        seg.rotation.set((Math.random()-.5)*.4,Math.random()*Math.PI*2,(Math.random()-.5)*.4);
        scene.add(seg);
      }else if(type===1){
        // Fan coral — flat disc
        const r=1.2+Math.random()*1.8;
        const fan=new THREE.Mesh(new THREE.CircleGeometry(r,8),
          new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:.10,side:THREE.DoubleSide,transparent:true,opacity:.85}));
        fan.position.set(cx+(Math.random()-.5)*2,r*.6+Math.random()*1.2,cz+(Math.random()-.5)*2);
        fan.rotation.set(Math.PI/2+( Math.random()-.5)*.6,Math.random()*Math.PI*2,0);
        scene.add(fan);
      }else if(type===2){
        // Brain/bulb coral
        const r=.7+Math.random()*1.1;
        const bulb=new THREE.Mesh(new THREE.SphereGeometry(r,7,5),
          new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:.08}));
        bulb.scale.y=.55+Math.random()*.3;
        bulb.position.set(cx+(Math.random()-.5)*2.5,r*.5,cz+(Math.random()-.5)*2.5);
        scene.add(bulb);
      }else{
        // Tube coral — tall thin cylinder
        const h=2.2+Math.random()*3;
        const tube=new THREE.Mesh(new THREE.CylinderGeometry(.18,.24,h,6),
          new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:.15}));
        tube.position.set(cx+(Math.random()-.5)*2.5,h/2,cz+(Math.random()-.5)*2.5);
        tube.rotation.set((Math.random()-.5)*.3,Math.random()*Math.PI*2,(Math.random()-.5)*.3);
        scene.add(tube);
      }
    }
    // Small glow light at big coral clusters
    if(ci%6===0){
      const pl=new THREE.PointLight(col,.8,16);pl.position.set(cx,.8,cz);scene.add(pl);
    }
  }
}

function buildKelp(){
  _kelpList.length=0;
  const kelpMat=new THREE.MeshLambertMaterial({color:0x228833,side:THREE.DoubleSide,transparent:true,opacity:.88});
  for(let ki=0;ki<30;ki++){
    const t=(ki/30+.015)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(ki%2===0?1:-1)*(BARRIER_OFF+8+Math.random()*16);
    const kx=p.x+nr.x*side+(Math.random()-.5)*5,kz=p.z+nr.z*side+(Math.random()-.5)*5;
    const strands=2+Math.floor(Math.random()*3);
    const group=new THREE.Group();group.position.set(kx,0,kz);
    for(let s=0;s<strands;s++){
      const h=4+Math.random()*7;
      const kgeo=new THREE.PlaneGeometry(.5,.8*h,1,Math.floor(h));
      // Taper top vertices
      const pos=kgeo.attributes.position;
      for(let v=0;v<pos.count;v++){const y=pos.getY(v);const taper=1-Math.max(0,y/(.8*h))*.6;pos.setX(v,pos.getX(v)*taper);}
      pos.needsUpdate=true;
      const strand=new THREE.Mesh(kgeo,kelpMat.clone());
      strand.position.set((Math.random()-.5)*2,h/2,(Math.random()-.5)*2);
      strand.rotation.y=Math.random()*Math.PI*2;
      group.add(strand);
    }
    group._swayPhase=Math.random()*Math.PI*2;
    group._swaySpeed=.6+Math.random()*.5;
    scene.add(group);_kelpList.push(group);
  }
}

function buildShipwreck(){
  // Tilted old ship in infield
  const woodMat=new THREE.MeshLambertMaterial({color:0x4a3020});
  const darkMat=new THREE.MeshLambertMaterial({color:0x2a1a10});
  const metalMat=new THREE.MeshLambertMaterial({color:0x556655,roughness:1});
  const hull=new THREE.Mesh(new THREE.BoxGeometry(24,6,9),woodMat);
  hull.position.set(-55,-2,-30);hull.rotation.set(.18,-.62,.22);scene.add(hull);
  // Hull bottom
  const keel=new THREE.Mesh(new THREE.BoxGeometry(26,1.5,4),darkMat);
  keel.position.set(-55,-4.5,-30);keel.rotation.copy(hull.rotation);scene.add(keel);
  // Broken main mast
  const mast1=new THREE.Mesh(new THREE.CylinderGeometry(.28,.34,10,6),woodMat);
  mast1.position.set(-48,2.5,-29);mast1.rotation.set(.55,-.3,.15);scene.add(mast1);
  // Broken second mast (fallen, horizontal)
  const mast2=new THREE.Mesh(new THREE.CylinderGeometry(.22,.28,8,6),woodMat);
  mast2.position.set(-62,1.2,-31);mast2.rotation.set(1.3,-.5,.85);scene.add(mast2);
  // Torn sail fragments
  const sailMat=new THREE.MeshLambertMaterial({color:0x887766,side:THREE.DoubleSide,transparent:true,opacity:.65});
  const sail=new THREE.Mesh(new THREE.PlaneGeometry(6,4),sailMat);
  sail.position.set(-47,5,-29);sail.rotation.set(.4,-.3,.5);scene.add(sail);
  // Treasure chest
  const chestMat=new THREE.MeshLambertMaterial({color:0x8b5c1a});
  const chest=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.1,1.1),chestMat);
  chest.position.set(-58,-.2,-27);scene.add(chest);
  const lid=new THREE.Mesh(new THREE.BoxGeometry(1.6,.55,1.1),new THREE.MeshLambertMaterial({color:0x7a4e12}));
  lid.position.set(-58,.55,-27);lid.rotation.x=-.65;scene.add(lid);
  // Gold glow inside chest
  const treasureGlow=new THREE.PointLight(0xffcc44,1.8,8);treasureGlow.position.set(-58,.6,-27);scene.add(treasureGlow);
  // Scattered gold coins
  const coinMat=new THREE.MeshLambertMaterial({color:0xffd700,emissive:0x886600,emissiveIntensity:.5});
  for(let c=0;c<8;c++){
    const coin=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,.08,8),coinMat);
    coin.position.set(-58+(Math.random()-.5)*4,-.14+(Math.random()*.3),-27+(Math.random()-.5)*3);
    coin.rotation.set(Math.random()*.5,Math.random()*Math.PI*2,Math.random()*.5);
    scene.add(coin);
  }
  // Rope/chain
  for(let r=0;r<5;r++){
    const rope=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,1.8,4),darkMat);
    rope.position.set(-55+(Math.random()-.5)*8,-.3+(r*.4),-28+(Math.random()-.5)*4);
    rope.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);
    scene.add(rope);
  }
}

function buildSubmarineStation(){
  // Near S/F line — futuristic underwater base replacing pit building
  const subMat=new THREE.MeshLambertMaterial({color:0x334455});
  const glowMat=new THREE.MeshBasicMaterial({color:0x00ffcc,transparent:true,opacity:.8});
  // Main dome
  const dome=new THREE.Mesh(new THREE.SphereGeometry(8,14,10,0,Math.PI*2,0,Math.PI/2),
    new THREE.MeshLambertMaterial({color:0x223344,transparent:true,opacity:.9}));
  dome.position.set(40,0,310);scene.add(dome);
  // Base cylinder
  const base=new THREE.Mesh(new THREE.CylinderGeometry(8,10,3,14),subMat);
  base.position.set(40,1.5,310);scene.add(base);
  // Docking tubes extending out
  [-1,1].forEach(side=>{
    const tube=new THREE.Mesh(new THREE.CylinderGeometry(2,2,18,10),subMat);
    tube.rotation.z=Math.PI/2;tube.position.set(40+side*17,2,310);scene.add(tube);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(2,10,8),subMat);
    cap.position.set(40+side*26,2,310);scene.add(cap);
  });
  // Viewing port windows (glowing circles)
  for(let w=0;w<4;w++){
    const ang=w*Math.PI/2+Math.PI/4;
    const porthole=new THREE.Mesh(new THREE.CircleGeometry(.85,12),
      new THREE.MeshBasicMaterial({color:0x44eeff,transparent:true,opacity:.75}));
    porthole.position.set(40+Math.cos(ang)*7.5,4,310+Math.sin(ang)*7.5);
    porthole.rotation.y=-ang;scene.add(porthole);
    const pl=new THREE.PointLight(0x44ddff,.9,10);pl.position.copy(porthole.position);scene.add(pl);
    trackLightList.push(pl);
  }
  // Gantry label
  const ganLblCvs=document.createElement('canvas');ganLblCvs.width=512;ganLblCvs.height=80;
  const ganCtx=ganLblCvs.getContext('2d');
  ganCtx.fillStyle='rgba(0,0,0,0)';ganCtx.fillRect(0,0,512,80);
  ganCtx.font='bold 34px Orbitron,sans-serif';ganCtx.fillStyle='#00ffcc';ganCtx.textAlign='center';
  ganCtx.fillText('DEEP SEA CIRCUIT',256,52);
  const ganTex=new THREE.CanvasTexture(ganLblCvs);
  const ganLbl=new THREE.Sprite(new THREE.SpriteMaterial({map:ganTex,transparent:true}));
  ganLbl.position.set(40,14,310);ganLbl.scale.set(28,4.5,1);scene.add(ganLbl);
  // Anchor chain
  const chainMat=new THREE.MeshLambertMaterial({color:0x888888});
  for(let l=0;l<6;l++){
    const link=new THREE.Mesh(new THREE.TorusGeometry(.4,.12,4,6),chainMat);
    link.position.set(40,l*.8,310);link.rotation.y=l*.5;scene.add(link);
  }
}

function buildSeaGate(){
  // Coral arch over S/F line
  const archMat=new THREE.MeshLambertMaterial({color:0xff5533,emissive:0x441100,emissiveIntensity:.2});
  const leftPillar=new THREE.Mesh(new THREE.CylinderGeometry(.8,1.2,12,8),archMat);
  leftPillar.position.set(-10,.5,230);scene.add(leftPillar);
  const rightPillar=new THREE.Mesh(new THREE.CylinderGeometry(.8,1.2,12,8),archMat);
  rightPillar.position.set(10,.5,230);scene.add(rightPillar);
  // Top arch (torus segment)
  const arch=new THREE.Mesh(new THREE.TorusGeometry(10,.9,8,12,Math.PI),
    new THREE.MeshLambertMaterial({color:0xff6644,emissive:0x221100,emissiveIntensity:.15}));
  arch.position.set(0,12,230);arch.rotation.set(0,Math.PI/2,0);scene.add(arch);
  // Glow on arch pillars
  const gL=new THREE.PointLight(0xff8844,1.2,14);gL.position.set(-10,8,230);scene.add(gL);trackLightList.push(gL);
  const gR=new THREE.PointLight(0xff8844,1.2,14);gR.position.set(10,8,230);scene.add(gR);trackLightList.push(gR);
  // Hanging coral decorations
  for(let h=0;h<6;h++){
    const hangPos=new THREE.Vector3(-8+h*3.2,10.5,230);
    const hang=new THREE.Mesh(new THREE.CylinderGeometry(.08,.18,1.4+Math.random()*.8,5),
      new THREE.MeshLambertMaterial({color:[0xff4488,0xffcc00,0x44ffaa][h%3]}));
    hang.position.copy(hangPos);scene.add(hang);
  }
  // S/F line canvas texture
  const sfCvs=document.createElement('canvas');sfCvs.width=256;sfCvs.height=32;
  const sfCtx=sfCvs.getContext('2d');
  sfCtx.fillStyle='rgba(0,255,200,0.4)';sfCtx.fillRect(0,0,256,32);
  for(let c=0;c<8;c++){sfCtx.fillStyle=c%2===0?'rgba(0,255,200,0.7)':'rgba(255,255,255,0.4)';sfCtx.fillRect(c*32,0,32,32);}
  const sfTex=new THREE.CanvasTexture(sfCvs);
  const sfLine=new THREE.Mesh(new THREE.PlaneGeometry(20,1.2),new THREE.MeshBasicMaterial({map:sfTex,transparent:true}));
  sfLine.rotation.x=-Math.PI/2;sfLine.position.set(0,-.1,230);scene.add(sfLine);
}

function buildBioluminescentTrackEdges(){
  _dsaBioEdges.length=0;
  const N=180;
  [1,-1].forEach(side=>{
    const geo=new THREE.BufferGeometry();
    const pos=new Float32Array(N*3);
    for(let i=0;i<N;i++){
      const t=i/(N-1);
      const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      pos[i*3]=p.x+nr.x*side*(TW*.5+.8);
      pos[i*3+1]=.08;
      pos[i*3+2]=p.z+nr.z*side*(TW*.5+.8);
    }
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const mat=new THREE.LineBasicMaterial({color:0x00ffcc,transparent:true,opacity:.7,linewidth:2});
    const line=new THREE.Line(geo,mat);
    scene.add(line);
    _dsaBioEdges.push({line,mat,phase:side>0?0:Math.PI});
  });
}

function buildJellyfish(){
  _jellyfishList.length=0;
  const N=15;
  for(let ji=0;ji<N;ji++){
    const t=(ji/N+.03)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(ji%2===0?1:-1)*(BARRIER_OFF+15+Math.random()*28);
    const jx=p.x+nr.x*side+(Math.random()-.5)*12;
    const jz=p.z+nr.z*side+(Math.random()-.5)*12;
    const jy=3+Math.random()*8;
    const col=ji%3===0?0xff44cc:ji%3===1?0x44ccff:0x88ff88;
    // Bell (dome)
    const bell=new THREE.Mesh(new THREE.SphereGeometry(1.1+Math.random()*.5,8,6,0,Math.PI*2,0,Math.PI/2),
      new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.45+Math.random()*.2}));
    bell.position.set(jx,jy,jz);
    // Tentacles
    const group=new THREE.Group();group.add(bell);
    const tentMat=new THREE.LineBasicMaterial({color:col,transparent:true,opacity:.35+Math.random()*.2});
    const tentCount=6+Math.floor(Math.random()*5);
    for(let tc=0;tc<tentCount;tc++){
      const ang=tc/tentCount*Math.PI*2;
      const tentGeo=new THREE.BufferGeometry();
      const tPoints=[];const tentLen=2+Math.random()*4;
      for(let ts=0;ts<=8;ts++){
        const ty=-ts*(tentLen/8);const wave=Math.sin(ts*.8)*(.3+Math.random()*.2);
        tPoints.push(Math.cos(ang)*.6+Math.cos(ang)*wave,ty,Math.sin(ang)*.6+Math.sin(ang)*wave);
      }
      tentGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(tPoints),3));
      group.add(new THREE.Line(tentGeo,tentMat));
    }
    group.position.set(jx,jy,jz);bell.position.set(0,0,0);
    const pl=new THREE.PointLight(col,.6,8);group.add(pl);
    group._bobPhase=Math.random()*Math.PI*2;
    group._bobSpeed=.4+Math.random()*.35;
    group._bobAmp=.5+Math.random()*.4;
    group._driftX=(Math.random()-.5)*.008;
    group._driftZ=(Math.random()-.5)*.008;
    group._baseY=jy;
    scene.add(group);_jellyfishList.push(group);
  }
}

function buildSeaCreatures(){
  // Manta ray — gliding silhouette circling the infield
  const mantaMat=new THREE.MeshLambertMaterial({color:0x223344,side:THREE.DoubleSide});
  const mantaGroup=new THREE.Group();
  // Wing shape using triangles
  const wingGeo=new THREE.BufferGeometry();
  const wv=new Float32Array([0,0,0, -7,.5,-2, -5,0,3, 7,.5,-2, 5,0,3, 0,.6,4]);
  const wi=new Uint16Array([0,1,2, 0,3,4, 0,2,5, 0,5,4]);
  wingGeo.setAttribute('position',new THREE.BufferAttribute(wv,3));
  wingGeo.setIndex(new THREE.BufferAttribute(wi,1));wingGeo.computeVertexNormals();
  const wing=new THREE.Mesh(wingGeo,mantaMat);mantaGroup.add(wing);
  const tail=new THREE.Mesh(new THREE.CylinderGeometry(.08,.02,3,4),mantaMat);
  tail.rotation.z=Math.PI/2;tail.position.set(0,.2,-2.5);mantaGroup.add(tail);
  mantaGroup.position.set(0,8,0);
  scene.add(mantaGroup);
  _dsaCreatures.manta={group:mantaGroup,t:0,speed:.018,radius:140,angle:0,wavePhase:0};

  // Distant whale — slow, high above
  const whaleMat=new THREE.MeshLambertMaterial({color:0x2a3a4a});
  const whaleGroup=new THREE.Group();
  const wBody=new THREE.Mesh(new THREE.SphereGeometry(5.5,10,7),whaleMat);wBody.scale.set(1,.55,2.8);
  const wHead=new THREE.Mesh(new THREE.SphereGeometry(4,8,6),whaleMat);wHead.scale.set(.9,.5,1.2);wHead.position.set(0,0,-10);
  const wTail=new THREE.Mesh(new THREE.CylinderGeometry(1.2,.4,6,6),whaleMat);wTail.position.set(0,0,14);wTail.rotation.z=Math.PI/2;
  const wFin=new THREE.Mesh(new THREE.BoxGeometry(1.5,4,2.5),whaleMat);wFin.position.set(0,3.5,0);
  whaleGroup.add(wBody,wHead,wTail,wFin);whaleGroup.position.set(-220,38,-280);
  scene.add(whaleGroup);
  _dsaCreatures.whale={group:whaleGroup,angle:0,speed:.004,radius:85,cx:-220,cz:-280};

  // Fish schools — 3 small groups of instanced fish
  const fishMat=new THREE.MeshLambertMaterial({color:0xffaa44});
  const fishGeo=new THREE.ConeGeometry(.4,.8,4);fishGeo.rotateX(Math.PI/2);
  for(let fs=0;fs<3;fs++){
    const count=18;const instMesh=new THREE.InstancedMesh(fishGeo,fishMat,count);
    const t=(fs/3+.15)%1;const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(fs%2===0?1:-1)*(BARRIER_OFF+20+Math.random()*25);
    const cx=p.x+nr.x*side,cz=p.z+nr.z*side,cy=4+Math.random()*5;
    const dm2=new THREE.Object3D();
    for(let fi=0;fi<count;fi++){
      dm2.position.set(cx+(Math.random()-.5)*12,cy+(Math.random()-.5)*4,cz+(Math.random()-.5)*12);
      dm2.rotation.y=Math.random()*Math.PI*2;dm2.updateMatrix();instMesh.setMatrixAt(fi,dm2.matrix);
    }
    instMesh.instanceMatrix.needsUpdate=true;scene.add(instMesh);
    _dsaCreatures.fishSchools.push({mesh:instMesh,cx,cy,cz,phase:Math.random()*Math.PI*2,speed:.022+Math.random()*.015,radius:18+Math.random()*10});
  }
}

function buildDeepSeaBubbles(){
  const N=400;
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(N*3);
  const car0=carObjs[playerIdx];
  const cx=car0?car0.mesh.position.x:0,cz=car0?car0.mesh.position.z:0;
  for(let i=0;i<N;i++){
    pos[i*3]=cx+(Math.random()-.5)*500;
    pos[i*3+1]=Math.random()*25;
    pos[i*3+2]=cz+(Math.random()-.5)*500;
  }
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const mat=new THREE.PointsMaterial({color:0xaaddff,size:.35,transparent:true,opacity:.55,sizeAttenuation:true});
  const pts=new THREE.Points(geo,mat);scene.add(pts);
  _dsaBubbleGeo=geo;_dsaBubblePos=pos;
}

function buildDeepSeaLightRays(){
  _dsaLightRays.length=0;
  const rayMat=new THREE.MeshBasicMaterial({color:0x44aaff,transparent:true,opacity:.04,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});
  const N=8;
  for(let ri=0;ri<N;ri++){
    const t=(ri/N+.04)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(ri%2===0?1:-1)*(Math.random()*50+5);
    const rx=p.x+nr.x*side+(Math.random()-.5)*40,rz=p.z+nr.z*side+(Math.random()-.5)*40;
    const h=28+Math.random()*18;
    const geo=new THREE.PlaneGeometry(3+Math.random()*3,h);
    const ray=new THREE.Mesh(geo,rayMat.clone());
    ray.position.set(rx,h/2,rz);
    ray.rotation.y=Math.random()*Math.PI*2;
    scene.add(ray);
    _dsaLightRays.push({mesh:ray,phase:Math.random()*Math.PI*2,speed:.6+Math.random()*.4,baseOp:.03+Math.random()*.05});
  }
}

function buildDeepSeaNightObjects(){
  // Stars not visible underwater, use subtle bio particles instead
  // Reuse trackLightList for coral glow poles
  const sg=new THREE.SphereGeometry(.18,4,4),sm=new THREE.MeshBasicMaterial({color:0x00ffcc,transparent:true,opacity:.8});
  stars=new THREE.InstancedMesh(sg,sm,80);stars.visible=false;
  const dm=new THREE.Object3D();
  for(let i=0;i<80;i++){
    const t=i/80;const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    dm.position.set(p.x+nr.x*(BARRIER_OFF+4),2.5,p.z+nr.z*(BARRIER_OFF+4));
    dm.scale.setScalar(.8+Math.random()*.5);dm.updateMatrix();stars.setMatrixAt(i,dm.matrix);
  }
  stars.instanceMatrix.needsUpdate=true;scene.add(stars);
  // Track lights as bioluminescent pods
  for(let li=0;li<24;li++){
    const t=li/24;const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    [-1,1].forEach(side=>{
      const pp=p.clone().addScaledVector(nr,side*(BARRIER_OFF+1.5));
      const pod=new THREE.Mesh(new THREE.SphereGeometry(.3,6,5),
        new THREE.MeshBasicMaterial({color:0x00ffcc,transparent:true,opacity:.9}));
      pod.position.copy(pp);pod.position.y=.3;pod.visible=false;scene.add(pod);trackPoles.push(pod);
      const pl=new THREE.PointLight(0x00ffaa,0,12);pl.position.copy(pp);pl.position.y=.3;
      scene.add(pl);trackLightList.push(pl);
    });
  }
}

// ══ CANDY WORLD ═══════════════════════════════════════════════════════════════
function buildCandyEnvironment(){
  buildCandyGround();
  buildCandySky();
  buildLollipopTrees();
  buildCandyCanes();
  buildChocolateRiver();
  buildGumDropMountains();
  buildCakeBuilding();
  buildCandyGate();
  buildSprinkleParticles();
  buildCottonCandyClouds();
  buildRainbowTrackStripes();
  buildCandyBarriers();
  buildIceCreamCones();
  buildCookieSpectators();
}

function buildCandyGround(){
  // Pink fondant main ground
  const gMat=new THREE.MeshLambertMaterial({color:0xffaacc});
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),gMat);
  ground.rotation.x=-Math.PI/2;ground.position.y=-.12;ground.receiveShadow=true;scene.add(ground);
  // Infield: light lavender fondant
  const infMat=new THREE.MeshLambertMaterial({color:0xeeaaee});
  const inf=new THREE.Mesh(new THREE.PlaneGeometry(440,580),infMat);
  inf.rotation.x=-Math.PI/2;inf.position.set(-40,-.11,-60);scene.add(inf);
  // Coloured candy spot circles on the ground
  const spotColors=[0xff6688,0xffcc44,0x88eebb,0x88aaff,0xff99cc,0xffee88];
  for(let i=0;i<28;i++){
    const col=spotColors[i%spotColors.length];
    const r=6+Math.random()*10;
    const sm=new THREE.MeshLambertMaterial({color:col,transparent:true,opacity:.55});
    const sp=new THREE.Mesh(new THREE.CircleGeometry(r,12),sm);
    sp.rotation.x=-Math.PI/2;
    sp.position.set((Math.random()-.5)*700,.01,(Math.random()-.5)*700);
    scene.add(sp);
  }
}

function buildCandySky(){
  // Rainbow arc — 7 semi-torus rings high above
  const rainbowColors=[0xff2200,0xff8800,0xffee00,0x44dd44,0x2299ff,0x5544ff,0xcc44ff];
  rainbowColors.forEach((col,i)=>{
    const r=260-i*14,tube=7-i*.5;
    const geo=new THREE.TorusGeometry(r,tube,6,48,Math.PI);
    const mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.55-i*.02,side:THREE.DoubleSide});
    const m=new THREE.Mesh(geo,mat);
    m.rotation.x=Math.PI/2;m.position.set(-20,60+i*.4,-20);
    scene.add(m);
  });
}

function buildLollipopTrees(){
  const stickMat=new THREE.MeshLambertMaterial({color:0xf5e0c8});
  const headColors=[0xff2266,0xff8800,0x22ccff,0xaadd00,0xcc44ff,0xff44aa,0xffcc00,0x44ddbb];
  const count=44;
  for(let i=0;i<count;i++){
    const t=(i/count+Math.random()*.008)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+22+Math.random()*22);
    const cx=p.x+nr.x*side+(Math.random()-.5)*5,cz=p.z+nr.z*side+(Math.random()-.5)*5;
    const h=5+Math.random()*5;
    // Stick
    const stick=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,h,6),stickMat);
    stick.position.set(cx,h*.5,cz);scene.add(stick);
    // Head (flattened sphere)
    const hCol=headColors[i%headColors.length];
    const headMat=new THREE.MeshLambertMaterial({color:hCol,emissive:new THREE.Color(hCol),emissiveIntensity:.25});
    const hr=1.8+Math.random()*.9;
    const head=new THREE.Mesh(new THREE.SphereGeometry(hr,10,8),headMat);
    head.scale.y=.72;head.position.set(cx,h+hr*.72,cz);scene.add(head);
    _candyNightEmissives.push(head);
    _candyLollipops.push(head);
    // Stripe spiral on the head — a thin torus ring
    const stripeMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.7});
    const stripe=new THREE.Mesh(new THREE.TorusGeometry(hr*.6,.07,4,16),stripeMat);
    stripe.position.copy(head.position);stripe.rotation.x=Math.PI/2;scene.add(stripe);
  }
}

function buildCandyCanes(){
  const redMat=new THREE.MeshLambertMaterial({color:0xee1122,emissive:0x550000,emissiveIntensity:.2});
  const whiteMat=new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x222222,emissiveIntensity:.1});
  const count=22;
  for(let i=0;i<count;i++){
    const t=(i/count)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+22);
    const cx=p.x+nr.x*side,cz=p.z+nr.z*side;
    // Shaft: alternating red/white segments
    for(let seg=0;seg<6;seg++){
      const mat=seg%2===0?redMat:whiteMat;
      const s=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,.55,7),mat);
      s.position.set(cx,seg*.55+.275,cz);scene.add(s);
    }
    // Crook: torus quarter-arc on top
    const crookMat=seg=>seg%2===0?redMat:whiteMat;
    const crook=new THREE.Mesh(new THREE.TorusGeometry(.5,.28,7,12,Math.PI/1.8),redMat);
    crook.position.set(cx,6.55+.5,cz);
    crook.rotation.z=Math.PI;
    const fwdAngle=Math.atan2(tg.x,tg.z);crook.rotation.y=fwdAngle;
    scene.add(crook);
    _candyCaneList.push(crook);
    // Small point light at base
    const pl=new THREE.PointLight(0xff6688,1.0,14);pl.position.set(cx,.5,cz);
    scene.add(pl);_candyCandles.push(pl);
    _candyNightEmissives.push({material:redMat});
  }
}

function buildChocolateRiver(){
  // A winding chocolate-brown strip through the infield
  const pts=[
    new THREE.Vector3(-60,.03,-220),new THREE.Vector3(-100,.03,-140),
    new THREE.Vector3(-80,.03,-60),new THREE.Vector3(-30,.03,10),
    new THREE.Vector3(40,.03,50),new THREE.Vector3(80,.03,-10),
    new THREE.Vector3(60,.03,-80),new THREE.Vector3(10,.03,-160),
  ];
  const curve=new THREE.CatmullRomCurve3(pts,false,'catmullrom',.5);
  const N=80;
  const chocoMat=new THREE.MeshLambertMaterial({color:0x4a2200,side:THREE.DoubleSide});
  const pos=[],idx=[];
  for(let i=0;i<=N;i++){
    const t2=i/N,pt=curve.getPoint(t2),tg2=curve.getTangent(t2).normalize();
    const nr2=new THREE.Vector3(-tg2.z,0,tg2.x);
    const w=3.5+Math.sin(i*.4)*1.0;
    const L=pt.clone().addScaledVector(nr2,-w);
    const R=pt.clone().addScaledVector(nr2,w);
    pos.push(L.x,L.y,L.z,R.x,R.y,R.z);
    if(i<N){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setIndex(idx);geo.computeVertexNormals();
  const river=new THREE.Mesh(geo,chocoMat);scene.add(river);
  _chocoHighlight=river;
  // Foam edges — thin white ribbon
  const foamMat=new THREE.MeshLambertMaterial({color:0xffe4cc,transparent:true,opacity:.7,side:THREE.DoubleSide});
  [-1,1].forEach(side=>{
    const fpos=[];const fidx=[];
    for(let i=0;i<=N;i++){
      const t2=i/N,pt=curve.getPoint(t2),tg2=curve.getTangent(t2).normalize();
      const nr2=new THREE.Vector3(-tg2.z,0,tg2.x);
      const w=3.5+Math.sin(i*.4)*1.0;
      const e=pt.clone().addScaledVector(nr2,side*(w+.4));
      const e2=pt.clone().addScaledVector(nr2,side*(w+1.2));
      fpos.push(e.x,.04,e.z,e2.x,.04,e2.z);
      if(i<N){const a=i*2;fidx.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    const fg=new THREE.BufferGeometry();
    fg.setAttribute('position',new THREE.Float32BufferAttribute(fpos,3));
    fg.setIndex(fidx);fg.computeVertexNormals();
    scene.add(new THREE.Mesh(fg,foamMat));
  });
}

function buildGumDropMountains(){
  const gumdropColors=[0xff4488,0xffcc00,0x44ddaa,0x88aaff,0xff6622,0xcc44ff,0x44ee66,0xff8844];
  const positions=[
    [220,-180],[- 260,150],[190,280],[-90,-340],[310,80],[-340,-60],
    [80,-390],[-200,300],[260,-280],[-160,-220],[340,200],[-310,100],
    [110,360],[-230,-120]
  ];
  // Skip any position closer than this to the track curve — a gumdrop on the road shows up as a
  // big white circle (its bottom cap) clipping through the asphalt.
  const MIN_TRACK_DIST=42;
  function _distToTrack(px,pz){
    let m=Infinity;
    for(let t=0;t<1;t+=.02){
      const tp=trackCurve.getPoint(t);
      const d=Math.hypot(px-tp.x,pz-tp.z);
      if(d<m)m=d;
    }
    return m;
  }
  positions.forEach(([px,pz],i)=>{
    if(_distToTrack(px,pz)<MIN_TRACK_DIST)return;
    const col=gumdropColors[i%gumdropColors.length];
    const mat=new THREE.MeshLambertMaterial({color:col,transparent:true,opacity:.88});
    const h=20+Math.random()*25;
    const r=14+Math.random()*12;
    // Gumdrop = hemisphere
    const geo=new THREE.SphereGeometry(r,10,8,0,Math.PI*2,0,Math.PI/2);
    const gd=new THREE.Mesh(geo,mat);
    gd.position.set(px,0,pz);gd.scale.y=h/r;scene.add(gd);
    // Flat bottom cap — was at y=-.05 which clipped through the track if a gumdrop landed near
    // the road; bumping it to .02 keeps it just above the asphalt.
    const cap=new THREE.Mesh(new THREE.CircleGeometry(r,10),mat);
    cap.rotation.x=-Math.PI/2;cap.position.set(px,.02,pz);scene.add(cap);
    // Sugar sparkle on top — small white sphere
    const spark=new THREE.Mesh(new THREE.SphereGeometry(.9,5,5),
      new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.8}));
    spark.position.set(px,h+.5,pz);scene.add(spark);
  });
}

function buildCakeBuilding(){
  // 3-layer tiered cake tower in the infield
  const cx=-50,cz=-140;
  const layers=[
    {r:16,h:8,col:0xffaabb},{r:12,h:7,col:0xffccdd},{r:8,h:6,col:0xffe4ee}
  ];
  let y=0;
  layers.forEach((layer,li)=>{
    const mat=new THREE.MeshLambertMaterial({color:layer.col,emissive:new THREE.Color(layer.col),emissiveIntensity:.15});
    const cake=new THREE.Mesh(new THREE.CylinderGeometry(layer.r-.5,layer.r,layer.h,16),mat);
    cake.position.set(cx,y+layer.h*.5,cz);scene.add(cake);
    _candyNightEmissives.push(cake);
    // Frosting drip ring
    const frostMat=new THREE.MeshLambertMaterial({color:0xffffff});
    const frost=new THREE.Mesh(new THREE.TorusGeometry(layer.r-.2,.6,6,20),frostMat);
    frost.rotation.x=Math.PI/2;frost.position.set(cx,y+layer.h+.3,cz);scene.add(frost);
    // Sprinkles on top face — small cylinders
    for(let s=0;s<12;s++){
      const ang=Math.random()*Math.PI*2,dist=Math.random()*(layer.r-2);
      const sc=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,.55,4),
        new THREE.MeshBasicMaterial({color:[0xff2266,0xffcc00,0x22ccff,0x88ee44][s%4]}));
      sc.rotation.z=Math.PI/2;sc.rotation.y=Math.random()*Math.PI;
      sc.position.set(cx+Math.cos(ang)*dist,y+layer.h+.5,cz+Math.sin(ang)*dist);
      scene.add(sc);
    }
    y+=layer.h;
  });
  // Candles on top
  const candleColors=[0xff4488,0xffcc00,0x44ccff,0xaadd00,0xff8844];
  for(let c=0;c<5;c++){
    const ang=c*(Math.PI*2/5),dist=4;
    const candleMat=new THREE.MeshLambertMaterial({color:candleColors[c]});
    const candle=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,1.5,6),candleMat);
    candle.position.set(cx+Math.cos(ang)*dist,y+.75,cz+Math.sin(ang)*dist);scene.add(candle);
    // Flame
    const flame=new THREE.Mesh(new THREE.SphereGeometry(.28,5,4),
      new THREE.MeshBasicMaterial({color:0xffaa00}));
    flame.scale.y=1.6;flame.position.set(cx+Math.cos(ang)*dist,y+1.7,cz+Math.sin(ang)*dist);
    scene.add(flame);
    const pl=new THREE.PointLight(0xffaa44,1.2,10);
    pl.position.set(cx+Math.cos(ang)*dist,y+1.8,cz+Math.sin(ang)*dist);
    scene.add(pl);_candyCandles.push(pl);
  }
}

function buildCandyGate(){
  // Large candy cane arch over the start/finish line
  const p=trackCurve.getPoint(0),tg=trackCurve.getTangent(0).normalize();
  const nr=new THREE.Vector3(-tg.z,0,tg.x);
  const hw=TW+5;
  const redMat=new THREE.MeshLambertMaterial({color:0xee1122,emissive:0x550000,emissiveIntensity:.3});
  const whiteMat=new THREE.MeshLambertMaterial({color:0xffffff});
  // Two vertical columns (alternating segments)
  [-1,1].forEach(side=>{
    const base=p.clone().addScaledVector(nr,side*hw);
    for(let s=0;s<8;s++){
      const mat=s%2===0?redMat:whiteMat;
      const seg=new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,.9,8),mat);
      seg.position.copy(base);seg.position.y=s*.9+.45;scene.add(seg);
    }
    _candyNightEmissives.push({material:redMat});
  });
  // Arch — torus half-ring connecting the tops. The torus default axis is +Z, so rotate around Y
  // so the axis aligns with the track tangent — that puts the half-ring vertical, opening upward,
  // perpendicular to the track direction. The previous code (rotation.x=-PI/2) flattened it.
  const archMat=new THREE.MeshLambertMaterial({color:0xee1122,emissive:0x550000,emissiveIntensity:.3});
  const arch=new THREE.Mesh(new THREE.TorusGeometry(hw,.55,8,24,Math.PI),archMat);
  arch.position.copy(p);arch.position.y=8*0.9;
  arch.rotation.y=Math.atan2(tg.x,tg.z);
  scene.add(arch);
  _candyNightEmissives.push(arch);
  // Neon sign: "SUGAR RUSH" as glowing box
  const signMat=new THREE.MeshBasicMaterial({color:0xff44cc});
  const sign=new THREE.Mesh(new THREE.BoxGeometry(hw*1.5,.8,.12),signMat);
  sign.position.copy(p);sign.position.y=8*.9+1.8;
  sign.rotation.y=Math.atan2(nr.x,nr.z)+Math.PI/2;
  scene.add(sign);
  const pl=new THREE.PointLight(0xff44cc,2.5,22);pl.position.copy(p);pl.position.y=8*.9+2;
  scene.add(pl);_candyCandles.push(pl);
}

function buildSprinkleParticles(){
  const count=600;
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(count*3);
  const col=new Float32Array(count*3);
  const colors=[[1,.2,.4],[1,.8,.1],[.5,.9,.2],[.2,.7,1],[.8,.3,1],[1,.5,.1]];
  const car=carObjs[playerIdx];
  const cx=car?car.mesh.position.x:0,cz=car?car.mesh.position.z:0;
  for(let i=0;i<count;i++){
    pos[i*3]=(Math.random()-.5)*600+cx;
    pos[i*3+1]=Math.random()*22;
    pos[i*3+2]=(Math.random()-.5)*600+cz;
    const c=colors[i%colors.length];
    col[i*3]=c[0];col[i*3+1]=c[1];col[i*3+2]=c[2];
  }
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  const mat=new THREE.PointsMaterial({size:.55,vertexColors:true,transparent:true,opacity:.85,sizeAttenuation:true});
  _sprinkleParticles=new THREE.Points(geo,mat);
  _sprinkleGeo=geo;
  scene.add(_sprinkleParticles);
}

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

function buildCottonCandyClouds(){
  const cloudColors=[0xffaadd,0xffbbee,0xffd4f0,0xeeccff,0xffccaa];
  for(let i=0;i<18;i++){
    const col=cloudColors[i%cloudColors.length];
    const mat=new THREE.MeshLambertMaterial({color:col,transparent:true,opacity:.72});
    const cx=(Math.random()-.5)*700,cz=(Math.random()-.5)*700,cy=28+Math.random()*18;
    // Cluster of overlapping spheres
    for(let b=0;b<5+Math.floor(Math.random()*4);b++){
      const br=4+Math.random()*5;
      const blob=new THREE.Mesh(new THREE.SphereGeometry(br,7,5),mat);
      blob.position.set(cx+(Math.random()-.5)*12,cy+(Math.random()-.5)*3,cz+(Math.random()-.5)*10);
      scene.add(blob);
    }
  }
}

function buildRainbowTrackStripes(){
  // Thin painted stripes across the track surface — coloured chevrons every ~25 track units
  const stripeColors=[0xff4488,0xff8800,0xffee00,0x44dd66,0x2299ff,0xcc44ff];
  const N2=6;// one stripe segment set per colour interval
  for(let ci=0;ci<30;ci++){
    const t=(ci/30+.003)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const col=stripeColors[ci%stripeColors.length];
    const mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.45,side:THREE.DoubleSide});
    // Rainbow chevrons need to win the depth test against the track (factor +1) AND the curbs/elines
    // (factor -1) — without this they z-fight on iPad and look like a "ghost fork" parallel track.
    mat.polygonOffset=true;mat.polygonOffsetFactor=-2;mat.polygonOffsetUnits=-2;
    const sW=TW*.9,sD=.8;
    const stripe=new THREE.Mesh(new THREE.PlaneGeometry(sW*2,sD),mat);
    stripe.rotation.x=-Math.PI/2;
    stripe.position.copy(p);stripe.position.y=.013;
    stripe.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI/2;
    scene.add(stripe);
  }
}

function buildCandyBarriers(){
  // Replace flat barriers with candy cane striped walls
  const N=200;
  [-1,1].forEach(side=>{
    for(let si=0;si<N;si++){
      const t=si/N;
      const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      const pos=p.clone().addScaledVector(nr,side*BARRIER_OFF);
      const col=(si%2===0)?0xee1122:0xffffff;
      const mat=new THREE.MeshLambertMaterial({color:col,emissive:col===0xee1122?new THREE.Color(0x440000):new THREE.Color(0x111111),emissiveIntensity:.2});
      const seg=new THREE.Mesh(new THREE.BoxGeometry(.55,1.1,1.05/(N/200)),mat);
      seg.position.copy(pos);seg.position.y=.55;
      seg.rotation.y=Math.atan2(tg.x,tg.z);
      scene.add(seg);
      if(col===0xee1122)_candyNightEmissives.push(seg);
    }
  });
  // Track lights — lollipop poles
  const headColors=[0xff2266,0xff8800,0x22ccff,0xaadd00,0xcc44ff,0xff44aa,0xffcc00];
  for(let li=0;li<24;li++){
    const t=li/24;const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    [-1,1].forEach((s,si)=>{
      const pp=p.clone().addScaledVector(nr,s*(BARRIER_OFF+1.5));
      const col=headColors[(li*2+si)%headColors.length];
      const headMat=new THREE.MeshLambertMaterial({color:col,emissive:new THREE.Color(col),emissiveIntensity:.3});
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.1,.12,3,5),
        new THREE.MeshLambertMaterial({color:0xffffff}));
      pole.position.copy(pp);pole.position.y=1.5;pole.visible=false;scene.add(pole);trackPoles.push(pole);
      const head=new THREE.Mesh(new THREE.SphereGeometry(.5,8,6),headMat);
      head.scale.y=.7;head.position.copy(pp);head.position.y=3.2;
      head.visible=false;scene.add(head);trackPoles.push(head);
      _candyNightEmissives.push(head);
      const pl=new THREE.PointLight(col,0,18);pl.position.copy(pp);pl.position.y=3.2;
      scene.add(pl);trackLightList.push(pl);
    });
  }
}

function buildIceCreamCones(){
  const scoopColors=[0xffcccc,0xff8888,0xffddaa,0xaaddff,0xddaaff,0xaaffcc];
  const coneCount=16;
  for(let i=0;i<coneCount;i++){
    const t=(i/coneCount+.04)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+30+Math.random()*20);
    const cx=p.x+nr.x*side+(Math.random()-.5)*6,cz=p.z+nr.z*side+(Math.random()-.5)*6;
    // Waffle cone
    const coneMat=new THREE.MeshLambertMaterial({color:0xdd9944});
    const cone=new THREE.Mesh(new THREE.ConeGeometry(1.4,3.5,8),coneMat);
    cone.position.set(cx,3.5*.5,cz);cone.rotation.x=Math.PI;// point down
    scene.add(cone);
    // 1–3 scoops stacked
    const scoopCount=1+Math.floor(Math.random()*3);
    for(let sc=0;sc<scoopCount;sc++){
      const col=scoopColors[(i+sc)%scoopColors.length];
      const scoopMat=new THREE.MeshLambertMaterial({color:col,emissive:new THREE.Color(col),emissiveIntensity:.15});
      const scoop=new THREE.Mesh(new THREE.SphereGeometry(1.3-sc*.1,8,7),scoopMat);
      scoop.position.set(cx,3.5+sc*1.5,cz);scene.add(scoop);
      _candyNightEmissives.push(scoop);
    }
  }
}

function buildCookieSpectators(){
  // Round cookie "faces" lined up outside barriers — simple spectator stand-ins
  const positions=[];
  for(let i=0;i<32;i++){
    const t=i/32;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+8+Math.random()*4);
    positions.push({x:p.x+nr.x*side,z:p.z+nr.z*side,tg});
  }
  positions.forEach(({x,z,tg})=>{
    // Cookie body (cylinder, slightly tilted back)
    const cookieMat=new THREE.MeshLambertMaterial({color:0xcc8844});
    const cookie=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,.22,12),cookieMat);
    cookie.position.set(x,1.5,z);
    cookie.rotation.x=Math.PI/2-.15;
    const fwdY=Math.atan2(tg.x,tg.z);cookie.rotation.z=fwdY;
    scene.add(cookie);
    // Chocolate chip spots
    const chipMat=new THREE.MeshLambertMaterial({color:0x331100});
    for(let c=0;c<3;c++){
      const ang=Math.random()*Math.PI*2,dist=Math.random()*.7;
      const chip=new THREE.Mesh(new THREE.SphereGeometry(.14,4,4),chipMat);
      chip.position.set(x+Math.cos(ang)*dist,.13,z+Math.sin(ang)*dist);
      // Orient chip on cookie face
      chip.position.copy(cookie.position);
      chip.position.x+=Math.cos(ang)*dist*.8;
      chip.position.z+=Math.sin(ang)*dist*.8;
      chip.position.y=1.5+.1;
      scene.add(chip);
    }
  });
}

function updateCandyWorld(dt){
  updateSprinkles(dt);
  // Cotton candy cloud drift
  _candyLollipops.forEach((h,i)=>{
    h.position.y+=Math.sin(_nowSec*.8+i*.6)*dt*.04;
  });
  // Chocolate river shimmer: slight y oscillation
  if(_chocoHighlight&&_chocoHighlight.material){
    _chocoHighlight.material.color.setHex(
      0x4a2200+(Math.floor(Math.sin(_nowSec*.5)*.15*255)&0xff)*0x010000
    );
  }
}

function updateDeepSeaWorld(dt){
  if(!scene)return;
  const t=_nowSec;
  // Kelp sway
  _kelpList.forEach(k=>{
    k._swayPhase+=dt*k._swaySpeed;
    k.rotation.z=Math.sin(k._swayPhase)*.12;
    k.rotation.x=Math.cos(k._swayPhase*.7)*.07;
  });
  // Jellyfish bob
  _jellyfishList.forEach(j=>{
    j._bobPhase+=dt*j._bobSpeed;
    j.position.y=j._baseY+Math.sin(j._bobPhase)*j._bobAmp;
    j.rotation.y+=dt*.15;
    // Tentacle writhe: scale bell slightly
    j.children[0].scale.y=.9+Math.sin(j._bobPhase*2.2)*.15;
  });
  // Bioluminescent edges pulse
  _dsaBioEdges.forEach(e=>{
    e.phase+=dt*.9;
    e.mat.opacity=.45+Math.sin(e.phase)*.25;
  });
  // Light rays pulsing
  _dsaLightRays.forEach(r=>{
    r.phase+=dt*r.speed;
    r.mesh.material.opacity=r.baseOp*(1+Math.sin(r.phase)*.8);
    r.mesh.rotation.y+=dt*.04;
  });
  // Bubbles rising
  if(_dsaBubbleGeo&&_dsaBubblePos){
    const pos=_dsaBubblePos;
    const car=carObjs[playerIdx];
    const cx=car?car.mesh.position.x:0,cz=car?car.mesh.position.z:0;
    let anyChange=false;
    // Update subset each frame (~40 bubbles = 10% per frame)
    const step=Math.floor(_nowSec*400)%10;
    for(let i=step;i<pos.length/3;i+=10){
      pos[i*3+1]+=.04+Math.sin(t*.5+i)*.01;
      if(pos[i*3+1]>28){
        pos[i*3]=cx+(Math.random()-.5)*480;
        pos[i*3+1]=Math.random()*2;
        pos[i*3+2]=cz+(Math.random()-.5)*480;
      }
      anyChange=true;
    }
    if(anyChange)_dsaBubbleGeo.attributes.position.needsUpdate=true;
  }
  // Manta ray orbit
  if(_dsaCreatures.manta){
    const m=_dsaCreatures.manta;
    m.angle+=dt*m.speed;
    m.wavePhase+=dt*1.2;
    const mx=Math.cos(m.angle)*m.radius,mz=Math.sin(m.angle)*m.radius;
    m.group.position.set(mx,7+Math.sin(m.wavePhase)*.9,mz);
    m.group.rotation.y=m.angle+Math.PI/2;
    m.group.rotation.z=Math.sin(m.wavePhase)*.18;
  }
  // Whale slow orbit
  if(_dsaCreatures.whale){
    const w=_dsaCreatures.whale;
    w.angle+=dt*w.speed;
    w.group.position.x=w.cx+Math.cos(w.angle)*w.radius;
    w.group.position.z=w.cz+Math.sin(w.angle)*w.radius;
    w.group.position.y=36+Math.sin(w.angle*2.3)*4;
    w.group.rotation.y=w.angle+Math.PI/2;
  }
  // Fish schools orbit
  _dsaCreatures.fishSchools.forEach(fs=>{
    fs.phase+=dt*fs.speed;
    const dm3=new THREE.Object3D();
    for(let fi=0;fi<18;fi++){
      const ang=fs.phase+fi*(Math.PI*2/18);
      dm3.position.set(
        fs.cx+Math.cos(ang)*fs.radius+(Math.sin(fi*1.3+t*.5)*3),
        fs.cy+Math.sin(fi*.8+t*.4)*2,
        fs.cz+Math.sin(ang)*fs.radius+(Math.cos(fi*1.1+t*.4)*3)
      );
      dm3.rotation.y=ang+Math.PI/2;dm3.updateMatrix();
      fs.mesh.setMatrixAt(fi,dm3.matrix);
    }
    fs.mesh.instanceMatrix.needsUpdate=true;
  });
  // Underwater current effect on player car — gentle drift
  if(activeWorld==='deepsea'){
    const car=carObjs[playerIdx];
    if(car&&!recoverActive){
      _dsaCurrentDir+=dt*.04;
      const drift=.0008;
      car.mesh.position.x+=Math.cos(_dsaCurrentDir)*drift*car.speed*60*dt;
      car.mesh.position.z+=Math.sin(_dsaCurrentDir)*drift*car.speed*60*dt;
    }
  }
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
function checkSpaceRailgun(){
  if(!_spaceRailguns.length||activeWorld!=='space')return;
  const car=carObjs[playerIdx];if(!car||recoverActive||car._fallingIntoSpace)return;
  _spaceRailguns.forEach(r=>{
    const dx=car.mesh.position.x-r.pos.x,dz=car.mesh.position.z-r.pos.z;
    const dist=Math.sqrt(dx*dx+dz*dz);
    if(dist<TW*.9&&(r._cooldown||0)<=0){
      // Boost along track direction
      const tg=trackCurve.getTangent(car.progress).normalize();
      car.mesh.rotation.y=Math.atan2(-tg.x,-tg.z);
      car.speed=Math.min(car.def.topSpd*1.55,car.speed+(car.def.topSpd*.45));
      car.boostTimer=1.2;
      r._cooldown=3.5;
      showPopup('⚡ RAILGUN BOOST!','#00aaff',900);
      floatText('⚡ +SPEED','#00aaff',innerWidth*.5,innerHeight*.5);
      playSpaceRailgunSound();
      camShake=0.25;
      sparkSystem.emit(car.mesh.position.x,car.mesh.position.y+.3,car.mesh.position.z,
        tg.x*.22,.04+Math.random()*.06,tg.z*.22,18,.3,.6,1,.4);
    }
    if((r._cooldown||0)>0)r._cooldown-=1/60;
  });
}

// ── Space wormhole player check ────────────────────────────────────────────
// Wormholes stored as individual portal objects: {t, linkedT, ring, portal, ...}
// Portals come in pairs: index 0+1 for pair 1, index 2+3 for pair 2
let _wormholeCooldown=0;
function checkSpaceWormhole(){
  if(!_spaceWormholes.length||activeWorld!=='space')return;
  const car=carObjs[playerIdx];if(!car||recoverActive||car._fallingIntoSpace)return;
  if(_wormholeCooldown>0){_wormholeCooldown-=1/60;return;}
  _spaceWormholes.forEach(portal=>{
    if(!portal.isEntry)return; // exit portals don't teleport — one-way only
    const pp=portal.ring.position;
    const dx=car.mesh.position.x-pp.x,dz=car.mesh.position.z-pp.z;
    if(dx*dx+dz*dz>TW*TW*.42)return; // quick sq distance check before sqrt
    const destT=portal.linkedT;
    const dest=trackCurve.getPoint(destT);
    const tg=trackCurve.getTangent(destT).normalize();
    car.mesh.position.set(dest.x,0.35,dest.z);
    car.mesh.rotation.set(0,Math.atan2(-tg.x,-tg.z),0);
    car.progress=destT;
    _wormholeCooldown=3.5;
    camShake=0.5;
    playSpaceWormholeSound();
    showPopup('🌀 SHORTCUT!','#aa44ff',1000);
    floatText('🌀 SHORTCUT','#cc55ff',innerWidth*.5,innerHeight*.45);
    sparkSystem.emit(dest.x,.5,dest.z,0,.12,0,24,.5,.2,1,.5);
  });
}

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
    playThunder();
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

function buildVolcanoEnvironment(){
  // Ground
  const g=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),
    new THREE.MeshLambertMaterial({color:0x1a0800}));
  g.rotation.x=-Math.PI/2;g.position.y=-.15;g.receiveShadow=true;scene.add(g);
  // Sky
  scene.background=makeSkyTex('#ff3300','#1a0400');
  scene.fog=new THREE.FogExp2(0x331100,.002);
  sunLight.color.setHex(0xff4422);sunLight.intensity=.7;
  ambientLight.color.setHex(0x441100);ambientLight.intensity=.35;
  hemiLight.color.setHex(0xff6600);hemiLight.groundColor.setHex(0x220800);hemiLight.intensity=.25;
  _volcanoGlowLight=new THREE.PointLight(0xff4400,3.0,600);
  _volcanoGlowLight.position.set(0,5,0);scene.add(_volcanoGlowLight);
  // Eruption particle system — lava blobs shooting out of main crater
  {
    const PN=_mobCount(120);
    const geo=new THREE.BufferGeometry();
    const pos=new Float32Array(PN*3),vel=new Float32Array(PN*3),col=new Float32Array(PN*3),life=new Float32Array(PN);
    for(let i=0;i<PN;i++){
      pos[i*3]=0;pos[i*3+1]=-200;pos[i*3+2]=-350; // hidden below until spawned
      life[i]=0;
      col[i*3]=1;col[i*3+1]=.25+Math.random()*.35;col[i*3+2]=0;
    }
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    const mat=new THREE.PointsMaterial({vertexColors:true,size:2.4,transparent:true,opacity:.95,sizeAttenuation:true,blending:THREE.AdditiveBlending,depthWrite:false});
    const pts=new THREE.Points(geo,mat);scene.add(pts);
    // Crater glow light that pulses during eruption
    const eruptLight=new THREE.PointLight(0xff5500,2.5,380);
    eruptLight.position.set(0,70,-350);scene.add(eruptLight);
    _volcanoEruption={geo:geo,pts:pts,vel:vel,life:life,N:PN,craterPos:new THREE.Vector3(0,70,-350),light:eruptLight,phase:'idle',phaseTimer:0};
  }
  // Main volcano
  const vm=new THREE.MeshLambertMaterial({color:0x1a0800});
  const lm=new THREE.MeshLambertMaterial({color:0xff4400,emissive:0xff2200,emissiveIntensity:1.2});
  const body=new THREE.Mesh(new THREE.ConeGeometry(120,150,8),vm);
  body.position.set(0,-10,-350);scene.add(body);
  const krater=new THREE.Mesh(new THREE.CylinderGeometry(18,25,12,8),lm);
  krater.position.set(0,64,-350);scene.add(krater);
  _volcanoLavaRivers.push({mesh:krater,baseInt:1.2});
  // Lava streams
  for(let i=0;i<3;i++){
    const ang=(i/3)*Math.PI*2+.5;
    const s=new THREE.Mesh(new THREE.BoxGeometry(6,80,5),
      new THREE.MeshLambertMaterial({color:0xff6600,emissive:0xff3300,emissiveIntensity:1.0}));
    s.position.set(Math.cos(ang)*30,25,-350+Math.sin(ang)*30);s.rotation.z=ang+Math.PI;
    scene.add(s);_volcanoLavaRivers.push({mesh:s,baseInt:1.0});
  }
  // Secondary volcanoes
  [[220,-200,60,80],[-280,-180,55,70],[-180,200,45,60],[250,150,40,55]].forEach(function(d){
    var m=new THREE.Mesh(new THREE.ConeGeometry(d[2],d[3],7),vm);m.position.set(d[0],-8,d[1]);scene.add(m);
    var k=new THREE.Mesh(new THREE.CylinderGeometry(d[2]*.15,d[2]*.2,6,6),lm);k.position.set(d[0],d[3]/2-2,d[1]);scene.add(k);
  });
  // Lava rivers alongside track
  var lm2=new THREE.MeshLambertMaterial({color:0xff5500,emissive:0xff2200,emissiveIntensity:.9,transparent:true,opacity:.88});
  for(var i=0;i<_mobCount(12);i++){
    var t=i/12,p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    var nr=new THREE.Vector3(-tg.z,0,tg.x);
    var side=(i%2===0?1:-1)*(BARRIER_OFF+12+Math.random()*10);
    var lava=new THREE.Mesh(new THREE.PlaneGeometry(5+Math.random()*4,18+Math.random()*12),lm2.clone());
    lava.rotation.x=-Math.PI/2;lava.rotation.z=Math.atan2(tg.x,tg.z);
    lava.position.set(p.x+nr.x*side,-.08,p.z+nr.z*side);
    scene.add(lava);_volcanoLavaRivers.push({mesh:lava,baseInt:.9});
  }
  // Ember particles
  var EN=_mobCount(400),egeo=new THREE.BufferGeometry();
  var epos=new Float32Array(EN*3),ecol=new Float32Array(EN*3);
  for(var i=0;i<EN;i++){
    epos[i*3]=(Math.random()-.5)*600;epos[i*3+1]=Math.random()*40+1;epos[i*3+2]=(Math.random()-.5)*600;
    ecol[i*3]=1.0;ecol[i*3+1]=Math.random()*.4;ecol[i*3+2]=0;
  }
  egeo.setAttribute('position',new THREE.Float32BufferAttribute(epos,3));
  egeo.setAttribute('color',new THREE.Float32BufferAttribute(ecol,3));
  _volcanoEmbers=new THREE.Points(egeo,new THREE.PointsMaterial({vertexColors:true,size:.3,transparent:true,opacity:.85,sizeAttenuation:true}));
  scene.add(_volcanoEmbers);_volcanoEmberGeo=egeo;
  // Geysers
  [.22,.52,.78].forEach(function(t,gi){
    var p=trackCurve.getPoint(t).clone();
    var plat=new THREE.Mesh(new THREE.CylinderGeometry(3,3.5,.5,8),new THREE.MeshLambertMaterial({color:0x1a0800}));
    plat.position.copy(p);plat.position.y=.25;scene.add(plat);
    var gey=new THREE.Mesh(new THREE.CylinderGeometry(.8,1.2,2,8),
      new THREE.MeshLambertMaterial({color:0xff4400,emissive:0xff2200,emissiveIntensity:1.5}));
    gey.position.copy(p);gey.position.y=1.2;scene.add(gey);
    var pl=new THREE.PointLight(0xff4400,2.0,22);pl.position.copy(p);pl.position.y=2;scene.add(pl);
    _volcanoGeisers.push({pos:p.clone(),geyser:gey,light:pl,active:false,timer:5+gi*3,activeDur:2.5});
  });
  // Barriers
  buildBarriers();buildStartLine();
  // Lights setup (headlights/taillights)
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);
  // Stars (ember-colored)
  var sg=new THREE.SphereGeometry(.18,4,4),ssm=new THREE.MeshBasicMaterial({color:0xff4400,transparent:true,opacity:.8});
  stars=new THREE.InstancedMesh(sg,ssm,60);stars.visible=true;
  var dm=new THREE.Object3D();
  for(var i=0;i<60;i++){
    var th=Math.random()*Math.PI*2,ph=Math.random()*Math.PI*.3,r=300+Math.random()*80;
    dm.position.set(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph)*.35+60,r*Math.sin(ph)*Math.sin(th));
    dm.scale.setScalar(.6+Math.random()*1.2);dm.updateMatrix();stars.setMatrixAt(i,dm.matrix);
  }
  stars.instanceMatrix.needsUpdate=true;scene.add(stars);
}

function updateVolcanoWorld(dt){
  var t=_nowSec;
  _volcanoLavaRivers.forEach(function(r,i){
    if(r.mesh&&r.mesh.material)r.mesh.material.emissiveIntensity=r.baseInt*.7+r.baseInt*.5*Math.sin(t*1.4+i*.9);
  });
  if(_volcanoEmberGeo){
    var pos=_volcanoEmberGeo.attributes.position.array;
    var step=Math.floor(t*40)%50||1;
    for(var i=step;i<Math.min(step+50,pos.length/3);i++){
      pos[i*3+1]+=dt*(.8+Math.random()*.6);
      if(pos[i*3+1]>35){pos[i*3]=(Math.random()-.5)*500;pos[i*3+1]=Math.random()*2;pos[i*3+2]=(Math.random()-.5)*500;}
    }
    _volcanoEmberGeo.attributes.position.needsUpdate=true;
  }
  _volcanoGeisers.forEach(function(g,gi){
    g.timer-=dt;
    if(!g.active&&g.timer<=0){g.active=true;g.timer=g.activeDur;g.light.intensity=4.0;}
    if(g.active){
      g.geyser.scale.y=1+Math.sin(t*8)*.3;g.geyser.position.y=1.2+Math.sin(t*8)*.5;
      g.light.intensity=3.5+Math.sin(t*6);
      var car=carObjs[playerIdx];
      if(car){var dx=car.mesh.position.x-g.pos.x,dz=car.mesh.position.z-g.pos.z;
        if(dx*dx+dz*dz<25){car.speed*=.55;camShake=1.2;playWorldEvent('geiser');}}
      if(g.timer<=0){g.active=false;g.timer=8+gi*4+Math.random()*6;g.geyser.scale.y=1;g.light.intensity=2.0;}
    }else{g.light.intensity=1.8+Math.sin(t*2+gi*1.5)*.4;}
  });
  if(Math.random()<dt*0.03)playWorldEvent('lava');
  if(_volcanoGlowLight)_volcanoGlowLight.intensity=2.5+Math.sin(t*.6)*.8;
  // ── VOLCANO ERUPTION ──
  if(_volcanoEruption){
    const er=_volcanoEruption;
    er.phaseTimer-=dt;
    if(er.phase==='idle'){
      _volcanoEruptionTimer-=dt;
      er.light.intensity=2+Math.sin(t*.7)*.6;
      if(_volcanoEruptionTimer<=0){
        // Start eruption: spawn burst of lava
        er.phase='burst';er.phaseTimer=3.8;
        _volcanoEruptionTimer=9+Math.random()*8; // next eruption in 9-17s
        const pos=er.geo.attributes.position.array;
        const activeCount=Math.min(er.N,80+Math.floor(Math.random()*40));
        for(let i=0;i<activeCount;i++){
          pos[i*3]=er.craterPos.x+(Math.random()-.5)*12;
          pos[i*3+1]=er.craterPos.y+Math.random()*3;
          pos[i*3+2]=er.craterPos.z+(Math.random()-.5)*12;
          // Upward + outward velocity cone
          const th=Math.random()*Math.PI*2,lift=32+Math.random()*22,out=6+Math.random()*14;
          er.vel[i*3]=Math.cos(th)*out;
          er.vel[i*3+1]=lift;
          er.vel[i*3+2]=Math.sin(th)*out;
          er.life[i]=3.2+Math.random()*1.2;
        }
        er.geo.attributes.position.needsUpdate=true;
        playWorldEvent('lava');
        if(_volcanoGlowLight)_volcanoGlowLight.intensity=6; // flash
      }
    }
    if(er.phase==='burst'){
      const pos=er.geo.attributes.position.array;
      for(let i=0;i<er.N;i++){
        if(er.life[i]<=0)continue;
        er.life[i]-=dt;
        pos[i*3]+=er.vel[i*3]*dt;
        pos[i*3+1]+=er.vel[i*3+1]*dt;
        pos[i*3+2]+=er.vel[i*3+2]*dt;
        er.vel[i*3+1]-=28*dt; // gravity
        // Ground collision near volcano
        if(pos[i*3+1]<-1){
          er.life[i]=0;
          pos[i*3+1]=-200; // hide
        }
      }
      er.geo.attributes.position.needsUpdate=true;
      // Fade the peak flash
      er.light.intensity=Math.max(2,er.light.intensity-dt*1.5);
      if(er.phaseTimer<=0){er.phase='idle';}
    }
  }
}

function buildArcticEnvironment(){
  var g=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),
    new THREE.MeshLambertMaterial({color:0xccddee}));
  g.rotation.x=-Math.PI/2;g.position.y=-.15;g.receiveShadow=true;scene.add(g);
  scene.background=makeSkyTex('#0a1525','#1a3050');
  scene.fog=new THREE.FogExp2(0x8899aa,.0035);
  sunLight.color.setHex(0xaaccff);sunLight.intensity=.8;
  ambientLight.color.setHex(0x445566);ambientLight.intensity=.45;
  hemiLight.color.setHex(0x6688aa);hemiLight.groundColor.setHex(0x223344);hemiLight.intensity=.30;
  // Ice barriers
  var N=_mobCount(220),im=new THREE.MeshLambertMaterial({color:0x88bbcc,transparent:true,opacity:.85});
  [-1,1].forEach(function(side){
    for(var i=0;i<N;i++){
      var t=i/N,p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
      var nr=new THREE.Vector3(-tg.z,0,tg.x);
      var pos=p.clone().addScaledVector(nr,side*BARRIER_OFF);
      var seg=new THREE.Mesh(new THREE.BoxGeometry(.9,1.2,1.0),im);
      seg.position.copy(pos);seg.position.y=.6;seg.rotation.y=Math.atan2(tg.x,tg.z);scene.add(seg);
    }
  });
  // Ice mountains
  var icm=new THREE.MeshLambertMaterial({color:0xaaddee,transparent:true,opacity:.9});
  var snm=new THREE.MeshLambertMaterial({color:0xeeeeff});
  [[280,-200,45,70],[-320,-150,52,80],[-200,230,38,62],[260,180,42,68]].forEach(function(d){
    var m=new THREE.Mesh(new THREE.ConeGeometry(d[2],d[3],7),icm);m.position.set(d[0],-6,d[1]);scene.add(m);
    var cap=new THREE.Mesh(new THREE.ConeGeometry(d[2]*.35,d[3]*.28,7),snm);cap.position.set(d[0],d[3]*.38,d[1]);scene.add(cap);
  });
  // Aurora borealis
  var auroraColors=[0x00ff88,0x0088ff,0xaa00ff,0x00ffcc,0xff00aa];
  for(var i=0;i<5;i++){
    var cvs=document.createElement('canvas');cvs.width=256;cvs.height=128;
    var ctx=cvs.getContext('2d');ctx.clearRect(0,0,256,128);
    var hex='#'+auroraColors[i].toString(16).padStart(6,'0');
    var grd=ctx.createLinearGradient(0,0,256,0);
    grd.addColorStop(0,'rgba(0,0,0,0)');grd.addColorStop(.3,hex+'88');grd.addColorStop(.7,hex+'44');grd.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grd;ctx.fillRect(0,0,256,128);
    var tex=new THREE.CanvasTexture(cvs);
    var aurora=new THREE.Mesh(new THREE.PlaneGeometry(400+Math.random()*200,80+Math.random()*40),
      new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:.5+Math.random()*.3,
        side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));
    aurora.position.set((Math.random()-.5)*300,80+Math.random()*40,(Math.random()-.5)*300);
    aurora.rotation.y=Math.random()*Math.PI*2;scene.add(aurora);
    _arcticAurora.push({mesh:aurora,phase:Math.random()*Math.PI*2,speed:.15+Math.random()*.1});
  }
  // Blizzard particles
  var BN=_mobCount(500),bgeo=new THREE.BufferGeometry();
  var bpos=new Float32Array(BN*3);
  for(var i=0;i<BN;i++){bpos[i*3]=(Math.random()-.5)*500;bpos[i*3+1]=Math.random()*30;bpos[i*3+2]=(Math.random()-.5)*500;}
  bgeo.setAttribute('position',new THREE.Float32BufferAttribute(bpos,3));
  scene.add(new THREE.Points(bgeo,new THREE.PointsMaterial({color:0xeeeeff,size:.28,transparent:true,opacity:.75,sizeAttenuation:true})));
  _arcticBlizzardGeo=bgeo;
  // Black ice patches
  [.15,.38,.62,.82].forEach(function(t){
    var p=trackCurve.getPoint(t);
    var patch=new THREE.Mesh(new THREE.PlaneGeometry(TW*1.6,8),
      new THREE.MeshLambertMaterial({color:0x99ccdd,transparent:true,opacity:.7}));
    patch.rotation.x=-Math.PI/2;patch.position.copy(p);patch.position.y=.02;
    patch.rotation.y=Math.atan2(trackCurve.getTangent(t).x,trackCurve.getTangent(t).z);scene.add(patch);
    _arcticIcePatches.push({pos:p.clone(),radius:TW*.85,cooldown:0});
  });
  // ── Close-to-track iceberg clusters (Candy-pattern) ──
  var icebergM=new THREE.MeshLambertMaterial({color:0xaaddee,transparent:true,opacity:.92});
  var snowCapM=new THREE.MeshLambertMaterial({color:0xf0f8ff});
  for(var i=0;i<_mobCount(18);i++){
    var tt=(i/18+Math.random()*.015)%1;
    var p=trackCurve.getPoint(tt),tgv=trackCurve.getTangent(tt).normalize();
    var nr=new THREE.Vector3(-tgv.z,0,tgv.x);
    var side=(i%2===0?1:-1)*(BARRIER_OFF+14+Math.random()*22);
    var h=5+Math.random()*8;
    var berg=new THREE.Mesh(new THREE.ConeGeometry(3+Math.random()*2.5,h,5+Math.floor(Math.random()*3)),icebergM);
    berg.position.set(p.x+nr.x*side,h*.5-.3,p.z+nr.z*side);
    berg.rotation.y=Math.random()*Math.PI*2;
    scene.add(berg);
    // Snow cap
    var cap=new THREE.Mesh(new THREE.ConeGeometry(1.8,h*.4,5),snowCapM);
    cap.position.set(berg.position.x,h-.2,berg.position.z);
    scene.add(cap);
  }
  // ── Crystal clusters alongside track (sparkly) ──
  var crystalM=new THREE.MeshLambertMaterial({color:0xccefff,emissive:0x4499cc,emissiveIntensity:.4,transparent:true,opacity:.75});
  for(var i=0;i<_mobCount(14);i++){
    var tt=(i/14+.04+Math.random()*.02)%1;
    var p=trackCurve.getPoint(tt),tgv=trackCurve.getTangent(tt).normalize();
    var nr=new THREE.Vector3(-tgv.z,0,tgv.x);
    var side=(i%2===0?-1:1)*(BARRIER_OFF+4+Math.random()*6);
    var cx=p.x+nr.x*side,cz=p.z+nr.z*side;
    // 3-crystal cluster
    for(var k=0;k<3;k++){
      var cr=new THREE.Mesh(new THREE.OctahedronGeometry(.55+Math.random()*.4,0),crystalM);
      cr.position.set(cx+(Math.random()-.5)*1.8,.6+Math.random()*.8,cz+(Math.random()-.5)*1.8);
      cr.rotation.set(Math.random(),Math.random(),Math.random());
      scene.add(cr);
    }
  }
  // ── Snowbank mounds close to track ──
  var bankM=new THREE.MeshLambertMaterial({color:0xf0f8ff});
  for(var i=0;i<_mobCount(20);i++){
    var tt=(i/20+Math.random()*.012)%1;
    var p=trackCurve.getPoint(tt),tgv=trackCurve.getTangent(tt).normalize();
    var nr=new THREE.Vector3(-tgv.z,0,tgv.x);
    var side=(i%2===0?1:-1)*(BARRIER_OFF+2+Math.random()*4);
    var bank=new THREE.Mesh(new THREE.SphereGeometry(2.5+Math.random()*1.5,8,6,0,Math.PI*2,0,Math.PI*.5),bankM);
    bank.position.set(p.x+nr.x*side,0,p.z+nr.z*side);
    bank.scale.set(1,.4+Math.random()*.3,1.2+Math.random()*.4);
    scene.add(bank);
  }
  buildStartLine();
  // Lights
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);
  // Stars
  var sg=new THREE.SphereGeometry(.22,4,4),ssm=new THREE.MeshBasicMaterial({color:0xaaddff,transparent:true,opacity:.9});
  stars=new THREE.InstancedMesh(sg,ssm,200);stars.visible=true;
  var dm=new THREE.Object3D();
  for(var i=0;i<200;i++){
    var th=Math.random()*Math.PI*2,ph=Math.random()*Math.PI*.45,r=320+Math.random()*100;
    dm.position.set(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph)*.5+100,r*Math.sin(ph)*Math.sin(th));
    dm.scale.setScalar(.5+Math.random()*1.8);dm.updateMatrix();stars.setMatrixAt(i,dm.matrix);
  }
  stars.instanceMatrix.needsUpdate=true;scene.add(stars);
}

function updateArcticWorld(dt){
  var t=_nowSec;
  _arcticAurora.forEach(function(a,i){
    a.phase+=dt*a.speed;
    a.mesh.material.opacity=.35+Math.sin(a.phase)*.25;
    a.mesh.position.x+=Math.sin(a.phase*.3+i)*dt*.8;
  });
  if(_arcticBlizzardGeo){
    var pos=_arcticBlizzardGeo.attributes.position.array;
    var car=carObjs[playerIdx],cx=car?car.mesh.position.x:0,cz=car?car.mesh.position.z:0;
    var step=Math.floor(t*40)%60||1;
    for(var i=step;i<Math.min(step+60,pos.length/3);i++){
      pos[i*3]+=dt*(2.5+Math.sin(t*.3+i)*1.2);pos[i*3+1]-=dt*(1+Math.random()*.5);
      if(pos[i*3+1]<-.5||Math.abs(pos[i*3]-cx)>260){
        pos[i*3]=cx+(Math.random()-.5)*480;pos[i*3+1]=25+Math.random()*8;pos[i*3+2]=cz+(Math.random()-.5)*480;
      }
    }
    _arcticBlizzardGeo.attributes.position.needsUpdate=true;
  }
  _arcticIcePatches.forEach(function(ip){
    ip.cooldown=Math.max(0,ip.cooldown-dt);
    var car=carObjs[playerIdx];if(!car||ip.cooldown>0)return;
    var dx=car.mesh.position.x-ip.pos.x,dz=car.mesh.position.z-ip.pos.z;
    if(dx*dx+dz*dz<ip.radius*ip.radius){
      car.speed*=.92;camShake=Math.max(camShake,.25);
      playWorldEvent('ice');
      if(Math.random()<.03)showPopup('🧊 BLACK ICE!','#aaddff',800);
      ip.cooldown=1;
    }
  });
}

// ══ THRILL PARK WORLD ═════════════════════════
function buildThemeparkEnvironment(){
  // Dark pavement ground
  const g=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),
    new THREE.MeshLambertMaterial({color:0x1a0a22}));
  g.rotation.x=-Math.PI/2;g.position.y=-.15;g.receiveShadow=true;scene.add(g);
  // Grassy patches
  const gm=new THREE.MeshLambertMaterial({color:0x2a5a2a});
  for(let i=0;i<_mobCount(10);i++){
    const gp=new THREE.Mesh(new THREE.CircleGeometry(20+Math.random()*18,10),gm);
    gp.rotation.x=-Math.PI/2;
    const ang=Math.random()*Math.PI*2,r=380+Math.random()*200;
    gp.position.set(Math.cos(ang)*r,-.12,Math.sin(ang)*r);scene.add(gp);
  }

  // ── FERRIS WHEEL (large landmark) ──
  {
    const fg=new THREE.Group();
    const R=42;
    const ringMat=new THREE.MeshLambertMaterial({color:0xff5588,emissive:0xff2266,emissiveIntensity:.5});
    const ring=new THREE.Mesh(new THREE.TorusGeometry(R,.8,6,36),ringMat);fg.add(ring);
    const ring2=new THREE.Mesh(new THREE.TorusGeometry(R*.55,.5,6,28),
      new THREE.MeshLambertMaterial({color:0xffcc22,emissive:0xff8800,emissiveIntensity:.4}));fg.add(ring2);
    const spokeMat=new THREE.MeshLambertMaterial({color:0xffcc22,emissive:0xff8800,emissiveIntensity:.3});
    for(let i=0;i<8;i++){
      const sp=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,R*2,5),spokeMat);
      sp.rotation.z=i/8*Math.PI;fg.add(sp);
    }
    const cabCols=[0xff4488,0x44ccff,0xffcc22,0x88ff66,0xff8844,0xcc44ff,0xff3366,0x33ddee];
    const cabins=[];
    for(let i=0;i<8;i++){
      const a=i/8*Math.PI*2;
      const cab=new THREE.Mesh(new THREE.BoxGeometry(4.5,4,4),
        new THREE.MeshLambertMaterial({color:cabCols[i],emissive:cabCols[i],emissiveIntensity:.3}));
      cab.position.set(Math.cos(a)*R,Math.sin(a)*R,0);fg.add(cab);
      cabins.push({mesh:cab});
    }
    // Place ferris wheel alongside track at t=0.72, perpendicular offset 58 (close but not blocking)
    {
      const p=trackCurve.getPoint(0.72),tg=trackCurve.getTangent(0.72).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      const fx=p.x+nr.x*58,fz=p.z+nr.z*58;
      fg.position.set(fx,R+5,fz);
      scene.add(fg);
      _tpFerris={group:fg,cabins:cabins};
      const pylMat=new THREE.MeshLambertMaterial({color:0x3a3050});
      for(let s=-1;s<=1;s+=2){
        const pyl=new THREE.Mesh(new THREE.CylinderGeometry(1.6,2.6,R+5,6),pylMat);
        pyl.position.set(fx+s*7,(R+5)/2-2,fz);pyl.rotation.z=-s*.15;scene.add(pyl);
      }
      const fl=new THREE.PointLight(0xff5599,1.6,180);
      fl.position.set(fx,R+8,fz);scene.add(fl);_tpParkLights.push(fl);
    }
  }

  // ── CAROUSEL ──
  {
    const cg=new THREE.Group();
    const base=new THREE.Mesh(new THREE.CylinderGeometry(12,13,1,16),
      new THREE.MeshLambertMaterial({color:0xffcc66}));
    base.position.y=.5;cg.add(base);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,18,8),
      new THREE.MeshLambertMaterial({color:0xffeeaa}));
    pole.position.y=10;cg.add(pole);
    const roof=new THREE.Mesh(new THREE.ConeGeometry(13,6,16),
      new THREE.MeshLambertMaterial({color:0xff4488,emissive:0xff2266,emissiveIntensity:.3}));
    roof.position.y=19;cg.add(roof);
    // Roof stripe decorations
    for(let i=0;i<8;i++){
      const a=i/8*Math.PI*2;
      const stripe=new THREE.Mesh(new THREE.BoxGeometry(.4,5.5,2),
        new THREE.MeshLambertMaterial({color:0xffffff}));
      stripe.position.set(Math.cos(a)*11.2,19,Math.sin(a)*11.2);
      stripe.rotation.y=-a;cg.add(stripe);
    }
    const horseCols=[0xffffff,0xff88aa,0xffcc66,0xaaddff,0xcc88ff,0xffdd88];
    for(let i=0;i<6;i++){
      const a=i/6*Math.PI*2;
      const hg=new THREE.Group();
      const bodyM=new THREE.MeshLambertMaterial({color:horseCols[i]});
      const body=new THREE.Mesh(new THREE.BoxGeometry(2.2,1.5,.9),bodyM);
      hg.add(body);
      const head=new THREE.Mesh(new THREE.BoxGeometry(.6,1.2,.7),bodyM);
      head.position.set(1.2,.85,0);hg.add(head);
      const legM=new THREE.MeshLambertMaterial({color:0x553322});
      [[0.7,.3],[0.7,-.3],[-.7,.3],[-.7,-.3]].forEach(lp=>{
        const leg=new THREE.Mesh(new THREE.BoxGeometry(.3,1.2,.3),legM);
        leg.position.set(lp[0],-1.15,lp[1]);hg.add(leg);
      });
      hg.position.set(Math.cos(a)*9,3.2,Math.sin(a)*9);
      hg.rotation.y=-a+Math.PI/2;
      cg.add(hg);
      _tpCarouselHorses.push({mesh:hg,baseY:3.2,offset:i*.9});
    }
    // Place carousel alongside track at t=0.28, opposite side of ferris wheel
    {
      const p=trackCurve.getPoint(0.28),tg=trackCurve.getTangent(0.28).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      const cx=p.x-nr.x*50,cz=p.z-nr.z*50;
      cg.position.set(cx,0,cz);scene.add(cg);_tpCarousel=cg;
      const cl=new THREE.PointLight(0xffaa66,1.2,120);
      cl.position.set(cx,18,cz);scene.add(cl);_tpParkLights.push(cl);
    }
  }

  // ── ROLLER COASTERS (2 arching tracks with moving cars) — placed alongside race track ──
  {
    [[0.45,1,0xff2266,40],[0.88,-1,0x22ccee,36]].forEach((cfg,ci)=>{
      const tt=cfg[0],side=cfg[1],col=cfg[2],loopR=cfg[3];
      const p=trackCurve.getPoint(tt),tg=trackCurve.getTangent(tt).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      const cx=p.x+nr.x*side*62,cz=p.z+nr.z*side*62;
      const pts=[];
      for(let i=0;i<16;i++){
        const th=i/16*Math.PI*2,r=loopR+Math.sin(th*2)*8;
        pts.push(new THREE.Vector3(cx+Math.cos(th)*r,16+Math.sin(th*3+ci)*14+12,cz+Math.sin(th)*r));
      }
      const curve=new THREE.CatmullRomCurve3(pts,true);
      const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,50,.7,6,true),
        new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:.4}));
      scene.add(tube);
      // Support pylons
      const pylM=new THREE.MeshLambertMaterial({color:0x3a3050});
      for(let i=0;i<8;i++){
        const p=curve.getPoint(i/8);
        const pyl=new THREE.Mesh(new THREE.CylinderGeometry(.35,.55,p.y,5),pylM);
        pyl.position.set(p.x,p.y/2,p.z);scene.add(pyl);
      }
      const car=new THREE.Mesh(new THREE.BoxGeometry(2.5,1.2,1.2),
        new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:.6}));
      scene.add(car);
      _tpCoasters.push({curve:curve,car:car,t:Math.random(),speed:.12+Math.random()*.08});
    });
  }

  // ── CIRCUS TENTS (alongside track) ──
  [[0.08,1,0xff3355],[0.33,-1,0xff8833],[0.58,1,0xcc44ff],[0.92,-1,0x44aaff]].forEach((cfg,ti)=>{
    const tt=cfg[0],side=cfg[1],col1=cfg[2];
    const p=trackCurve.getPoint(tt),tgv=trackCurve.getTangent(tt).normalize();
    const nr=new THREE.Vector3(-tgv.z,0,tgv.x);
    const x=p.x+nr.x*side*42,z=p.z+nr.z*side*42;
    const tg=new THREE.Group();
    for(let s=0;s<16;s++){
      const a=s/16*Math.PI*2;
      const segCol=s%2===0?col1:0xffffff;
      const seg=new THREE.Mesh(
        new THREE.ConeGeometry(15,18,16,1,true,a,Math.PI*2/16),
        new THREE.MeshLambertMaterial({color:segCol,side:THREE.DoubleSide,emissive:segCol,emissiveIntensity:.1}));
      tg.add(seg);
    }
    const flag=new THREE.Mesh(new THREE.ConeGeometry(1.4,3,4),
      new THREE.MeshBasicMaterial({color:0xffdd44}));
    flag.position.y=11;tg.add(flag);
    tg.position.set(x,9,z);scene.add(tg);
  });

  // ── FLOATING BALLOONS (alongside track, close) ──
  {
    const cols=[0xff3366,0xffcc22,0x44ccee,0xaa44ff,0xff8844,0x66ee99];
    const count=_mobCount(22);
    for(let i=0;i<count;i++){
      const col=cols[i%cols.length];
      const b=new THREE.Mesh(new THREE.SphereGeometry(1.4,8,6),
        new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:.35}));
      const tt=(i/count+Math.random()*.02)%1;
      const p=trackCurve.getPoint(tt),tgv=trackCurve.getTangent(tt).normalize();
      const nr=new THREE.Vector3(-tgv.z,0,tgv.x);
      const side=(i%2===0?1:-1)*(BARRIER_OFF+18+Math.random()*28);
      b.position.set(p.x+nr.x*side,10+Math.random()*38,p.z+nr.z*side);scene.add(b);
      _tpBalloons.push({mesh:b,speed:.35+Math.random()*.5,xOff:Math.random()*6.28});
    }
  }

  // ── STRING LIGHTS / LANTERNS (alongside track, very close) ──
  {
    const cols=[0xffdd44,0xff4466,0x44ccee,0xff88cc,0x88ff66];
    const strandTs=[0.05,0.2,0.38,0.52,0.68,0.82];
    strandTs.forEach((tt,si)=>{
      const col=cols[si%cols.length];
      const p=trackCurve.getPoint(tt),tgv=trackCurve.getTangent(tt).normalize();
      const nr=new THREE.Vector3(-tgv.z,0,tgv.x);
      const side=(si%2===0?1:-1)*(BARRIER_OFF+6);
      const bx=p.x+nr.x*side,bz=p.z+nr.z*side;
      for(let k=0;k<10;k++){
        const lb=new THREE.Mesh(new THREE.SphereGeometry(.38,5,4),
          new THREE.MeshBasicMaterial({color:col}));
        // Spread along tangent direction
        lb.position.set(bx+tgv.x*(k-4.5)*2.4,10.5+Math.sin(k*.7)*.6,bz+tgv.z*(k-4.5)*2.4);
        scene.add(lb);
      }
    });
  }

  // Extra party point-lights
  [[0,30,0,0xff6688],[-200,25,-200,0xffcc22],[200,25,200,0x44ccee]].forEach(cfg=>{
    const pl=new THREE.PointLight(cfg[3],.95,170);
    pl.position.set(cfg[0],cfg[1],cfg[2]);scene.add(pl);_tpParkLights.push(pl);
  });

  // Barriers + start line + car lights
  buildBarriers();buildStartLine();
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);

  // Warm sky stars (sunset feel)
  const sg=new THREE.SphereGeometry(.18,4,4),ssm=new THREE.MeshBasicMaterial({color:0xffddaa,transparent:true,opacity:.8});
  stars=new THREE.InstancedMesh(sg,ssm,70);stars.visible=true;
  const dm=new THREE.Object3D();
  for(let i=0;i<70;i++){
    const th=Math.random()*Math.PI*2,ph=Math.random()*Math.PI*.35,r=310+Math.random()*70;
    dm.position.set(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph)*.4+55,r*Math.sin(ph)*Math.sin(th));
    dm.scale.setScalar(.5+Math.random()*1.2);dm.updateMatrix();stars.setMatrixAt(i,dm.matrix);
  }
  stars.instanceMatrix.needsUpdate=true;scene.add(stars);
}

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

function updateThemeparkWorld(dt){
  const t=_nowSec;
  if(_tpFerris&&_tpFerris.group){
    _tpFerris.group.rotation.z+=dt*.22;
    for(let i=0;i<_tpFerris.cabins.length;i++){
      _tpFerris.cabins[i].mesh.rotation.z=-_tpFerris.group.rotation.z;
    }
  }
  if(_tpCarousel)_tpCarousel.rotation.y+=dt*.4;
  for(let i=0;i<_tpCarouselHorses.length;i++){
    const h=_tpCarouselHorses[i];
    h.mesh.position.y=h.baseY+Math.sin(t*3+h.offset)*.5;
  }
  for(let i=0;i<_tpCoasters.length;i++){
    const c=_tpCoasters[i];
    c.t=(c.t+dt*c.speed)%1;
    const p=c.curve.getPoint(c.t);c.car.position.copy(p);
  }
  for(let i=0;i<_tpBalloons.length;i++){
    const b=_tpBalloons[i];
    b.mesh.position.y+=dt*b.speed;
    b.mesh.position.x+=Math.sin(t*.4+b.xOff)*dt*.25;
    if(b.mesh.position.y>85)b.mesh.position.y=8;
  }
  for(let i=0;i<_tpParkLights.length;i++){
    _tpParkLights[i].intensity=.8+Math.sin(t*1.5+i*1.2)*.35;
  }
  _tpFireworkTimer-=dt;
  if(_tpFireworkTimer<=0){_tpFireworkTimer=1.8+Math.random()*3;_tpSpawnFirework();}
  for(let i=_tpFireworks.length-1;i>=0;i--){
    const fw=_tpFireworks[i];
    fw.age+=dt;
    const life=fw.age/fw.maxAge;
    if(life>=1){
      scene.remove(fw.mesh);if(fw.light)scene.remove(fw.light);
      fw.mesh.geometry.dispose();fw.mesh.material.dispose();
      _tpFireworks.splice(i,1);continue;
    }
    const pos=fw.geo.attributes.position.array;
    for(let j=0;j<pos.length;j+=3){
      pos[j]+=fw.vel[j]*dt;
      pos[j+1]+=fw.vel[j+1]*dt-dt*dt*7;
      pos[j+2]+=fw.vel[j+2]*dt;
      fw.vel[j+1]-=dt*6; // gravity
    }
    fw.geo.attributes.position.needsUpdate=true;
    fw.mesh.material.opacity=(1-life)*.9;
    if(fw.light)fw.light.intensity=(1-life)*2.2;
  }
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
  if(nitroActive&&!_prevNitro){playNitroActivate();onNitroActivate();if(musicSched&&musicSched.setNitro)musicSched.setNitro(true);}
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

  if(hbk&&Math.abs(car.speed)>.5){addSkidMark(car);if(Math.random()<.22)playTireScreech();}
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
      playLandSound();
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
        if(Math.random()<.4)playCrowdCheer();
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
        playJumpSound();showPopup(ramp.label,'#00ccff',1000);
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
      playSpinSound();showPopup('SPINNING! 🌀','#aa44ff',1200);
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
      playBoostSound();showPopup('BOOST! ⚡','#00ffff',800);
      sparkSystem.emit(car.mesh.position.x,.4,car.mesh.position.z,0,.06,0,18,.3,.9,1,.5);
      if(Math.random()<.55)playCrowdCheer();
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
      playCollectSound();
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
  camShake=.5;playRecoverySound();showBanner('RECOVERED','#ff4400',2000);
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
  camShake=.4;playRecoverySound();
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
      playCollisionSound();
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
        if(musicSched){musicSched.setFinalLap();if(musicSched.setIntensity)musicSched.setIntensity(1);}
        // Big crowd reaction for final lap
        playCrowdCheer();setTimeout(()=>playCrowdCheer(),250);setTimeout(()=>playCrowdCheer(),500);
        if(_crowdGain&&audioCtx){_crowdGain.gain.setTargetAtTime(0.085,audioCtx.currentTime,.15);setTimeout(()=>{if(_crowdGain&&audioCtx)_crowdGain.gain.setTargetAtTime(0.062,audioCtx.currentTime,2.0);},2000);}
      }else{
        showBanner('LAP '+car.lap+' / '+TOTAL_LAPS,'#00ccff',1600);
        playCrowdCheer();
      }
    }
    // Finish: set FINISH state immediately for victory orbit, show overlay after 5.5s
    if(car.lap>TOTAL_LAPS&&!car.finished){
      car.finished=true;car._finishTime=now;
      if(car.isPlayer){
        playFanfare();
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
          playCrowdCheer();setTimeout(()=>playCrowdCheer(),200);setTimeout(()=>playCrowdCheer(),400);
          if(_crowdGain&&audioCtx){_crowdGain.gain.setTargetAtTime(0.09,audioCtx.currentTime,.1);setTimeout(()=>{if(_crowdGain&&audioCtx)_crowdGain.gain.setTargetAtTime(0.062,audioCtx.currentTime,1.2);},1500);}
        }else{
          showPopup('▲ P'+pPos+' OVERTAKE!','#00ff88',1400);
          triggerCombo('OVERTAKE');
          totalScore+=50;
          playCrowdCheer();
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
function _playCountdownRoll(){
  if(!audioCtx)return;
  const t0=audioCtx.currentTime;
  const g=_musicMaster||_master||audioCtx.destination;
  // 16 tom hits over ~2.8s, exponentieel versnellend
  for(let i=0;i<16;i++){
    const frac=i/15;
    const t=t0+2.9*(1-Math.pow(1-frac,2.2));
    const freq=90+i*6;
    const vol=0.25+frac*0.35;
    MusicLib.tom(audioCtx,t,freq,vol).connect(g);
  }
  // Final boom op GO-moment
  setTimeout(()=>{
    if(!audioCtx)return;
    const t=audioCtx.currentTime;
    MusicLib.kick(audioCtx,t,0.9).connect(g);
    MusicLib.snare(audioCtx,t,0.5).connect(g);
  },3000);
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
          try{playCountBeep(1);}catch(e){}
          i++;
          setTimeout(lightOn,700);
        }else{
          setTimeout(function(){
            try{
              lights.forEach(function(id,idx){
                var el=document.getElementById(id);
                if(el)setTimeout(function(){el.classList.remove('on');el.classList.add('extinguish');setTimeout(function(){el.classList.remove('extinguish');},420);},idx*45);
              });
              try{playCountBeep(0);}catch(e){}
              try{playCrowdCheer();setTimeout(playCrowdCheer,180);setTimeout(playCrowdCheer,360);}catch(e){}
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
  stopAmbientWind();
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
    setTimeout(()=>{showBanner(rtxt,'#ffd700',3200);playCrowdCheer();},900);
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
    playVictoryFanfare();
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
function startTitleMusic(){
  if(!audioCtx)return;
  _ensureAudio();
  // Crossfade: stop select- of race-muziek die nog draait
  if(selectMusic){_fadeOutMusic(selectMusic,0.6);selectMusic=null;}
  if(musicSched){_fadeOutMusic(musicSched,0.6);musicSched=null;}
  if(titleMusic&&titleMusic.running)return;
  if(titleMusic){try{titleMusic.stop();}catch(_){}titleMusic=null;}
  titleMusic=_safeStartMusic(()=>new TitleMusic(audioCtx));
}
function startSelectMusic(){
  if(!audioCtx)return;
  _ensureAudio();
  if(titleMusic){_fadeOutMusic(titleMusic,0.6);titleMusic=null;}
  if(musicSched){_fadeOutMusic(musicSched,0.6);musicSched=null;}
  if(selectMusic&&selectMusic.running)return;
  if(selectMusic){try{selectMusic.stop();}catch(_){}selectMusic=null;}
  selectMusic=_safeStartMusic(()=>new SelectMusic(audioCtx));
}
// Dispatcher — momenteel keert RaceMusic terug (interne per-world switch op activeWorld).
// Hier zodat toekomstige world-specifieke classes in plaats ervan kunnen komen.
function _createRaceMusicForWorld(){
  return new RaceMusic(audioCtx);
}
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
      startAmbientWind();initCrowdNoise();
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
  if(typeof playCrowdCheer==='function')playCrowdCheer();
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
    updateSkidMarks();updateWeather(dt);updateSky(dt);updateThunder(dt);updateSnow(dt);updateStormFlash(dt);
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
      updateCrowdNoise(_pp);
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
  stopAmbientWind();stopCrowdNoise();
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
