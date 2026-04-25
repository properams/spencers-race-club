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

// disposeScene → js/core/scene.js

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
let activeWorld='grandprix';  // 'grandprix' | 'space' | 'deepsea' | 'candy' | 'neoncity' | 'volcano' | 'arctic' | 'themepark'
// Per-world arrays (_space*, _dsa*, _kelp*, _jellyfish*, _volcano*, _arctic*,
// _tp*, _sprinkle*, _gummy*, _candy*, _neon*, _holo*) verhuisd naar
// js/worlds/<world>.js — zie de "Per-world state" blokken bovenaan elk wereld-bestand.

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
// Per-world track elements (_wp*, _drs*) verhuisd naar js/worlds/<world>.js.
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
// DRS indicator state — _drsActive verhuisd naar worlds/grandprix.js
let _drsEl=null;
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
// Retry resume — iOS can suspend context on backgrounding
// Multi-oscillator engine
let _lastGear=1;
// ── Thunder ───────────────────────────────────
// ── Crowd noise ───────────────────────────────
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
// (TitleMusic + SelectMusic + RaceMusic classes + MusicLib + music-master
//  state + helper-functies zijn verhuisd naar js/audio/music.js tijdens
//  Fase 2.2a. Dit zijn dead fragments van comments die daarbij zijn
//  achtergebleven — hier opgeruimd.)

// ══ RENDERER ═════════════════════════════════
// initRenderer → js/core/renderer.js (non-module, geladen vóór main.js).

// ══ SCENE ════════════════════════════════════
// makeSkyTex + buildScene → js/core/scene.js

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
let popupTimeouts=[];
let bannerTimer=null;
const fmtTime=s=>s<60?s.toFixed(2)+'s':Math.floor(s/60)+'m'+(s%60).toFixed(2)+'s';
let _lastPPos=0;
// ══ COUNTDOWN / FINISH ══════════════════════
// ══ TITLE / SELECT ══════════════════════════
// ══ CAR PREVIEWS (3D render per card) ═══════
let carPreviews={};
// ── Live car preview (SELECT screen) ──────────
let _prevRen=null,_prevScene=null,_prevCam=null,_prevCarMesh=null,_prevDefId=-1;
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
// Dispatcher — momenteel keert RaceMusic terug (interne per-world switch op activeWorld).
// Hier zodat toekomstige world-specifieke classes in plaats ervan kunnen komen.
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
// loop() + FPS/quality state → js/core/loop.js

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
// Reacquire wake lock when page becomes visible again (iOS drops it on blur)
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&(gameState==='RACE'||gameState==='COUNTDOWN'))_acquireWakeLock();});
// Haptic feedback patterns per control (ms) — short buzz for precise, slightly longer for boost/drift
const _HAPTIC_MS={ArrowLeft:8,ArrowRight:8,ArrowUp:0,ArrowDown:12,KeyN:18,Space:15};
// Buttons that should also trigger gas (ArrowUp) — makes nitro/drift usable with one hand
const _ALSO_GAS={KeyN:true,Space:true};
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
