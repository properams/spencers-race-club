// js/main.js — Spencer's Race Club main game
// Loaded als gewoon <script> (non-module) zodat top-level let/const/var globals
// blijven voor submodule-access via window.*. Submodules zijn wel ES modules
// (zie js/persistence/*, js/audio/*, js/ui/*).
'use strict';

// (Tuning constants → js/config.js;
//  iPad-detect + _redetectDevice() init → js/core/device.js;
//  optional debug overlay → js/core/debug.js;
//  disposeScene → js/core/scene.js.)

// ══ DATA — gevuld door loadGameData() (zie boot) ══════════════════════════
var CAR_DEFS=[];        // var: ES-modules lezen window.CAR_DEFS
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
var activeWorld='grandprix';  // var: ES-modules schrijven window.activeWorld
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
let lapStartTime=0,lastLapTime=0;
var bestLapTime=Infinity; // var: ES-modules lezen window.bestLapTime
const skidMarks=[];
var titleMusic=null,musicSched=null,selectMusic=null; // var: music ES-module schrijft window.*

// ── MUSIC SUBSYSTEM — verplaatst naar js/audio/music.js ──
// MusicLib, TitleMusic, SelectMusic, RaceMusic, startTitleMusic,
// startSelectMusic, _createRaceMusicForWorld, _playCountdownRoll,
// _fadeOutMusic, _applyMusicGain, _safeStartMusic, noteFreq/NF, _musicDebug
// zijn beschikbaar via window.xxx (module laadt deferred).

var audioCtx=null; // var: music ES-module leest window.audioCtx
let engineOsc=null,engineGain=null,_rollGain=null,_rollSrc=null,_rollFilt=null;

// Special track objects
const jumpRamps=[],spinPads=[],boostPads=[],collectibles=[];
// Per-world track elements (_wp*, _drs*) verhuisd naar js/worlds/<world>.js.
// Per-car vertical velocity stored on car.vy
// (_nowSec → core/loop.js; _posCache + _posTick → ui/hud.js;
//  _ai* scratch vectors → cars/ai.js)

// Rain
let rainCanvas,rainCtx,rainDrops=[];

// Particles
let sparkSystem,exhaustSystem;

// Slipstream
let slipTimer=0;

// HUD DOM-refs → js/ui/hud.js (top of file)
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
let gamePaused=false,audioMuted=false;
var _muteGain=null; // var: music ES-module leest window._muteGain
// Music subsysteem state (was per ongeluk weggevallen bij fase 2.2a extraction;
// music.js's header noemt ze "gedeclareerd in main.js" maar dat klopte niet).
// _musicVolume default uit git history (was let _musicVolume=0.5).
var _musicVolume=0.5;       // user-instelbaar (0..1)
var _musicMuted=false;      // toggle via M-keybind / pause
var _musicDuck=1.0;         // pit-stop ducking factor (1.0 = no duck)
// Pre-allocated camera vectors (avoid per-frame heap allocations)
// _camV1/_camV2 → gameplay/camera.js, _jFwdV → track/ramps.js, _aiFwdRV → cars/ai.js
// Pre-allocated player/car vectors — reused every frame to avoid GC pressure
// _pl* + _slip* scratch vectors → cars/physics.js
// Wrong-way detector — _elWrongWay → ui/hud.js
let _wrongWayTimer=0;
// Mini-turbo (drift release boost)
let _miniTurboReady=false;
// Score system — _elScore/_elLapDelta → ui/hud.js
var totalScore=0; // var: ES-modules schrijven window.totalScore
// Difficulty (0=easy 1=normal 2=hard) — DIFF_MULT in js/config.js
var difficulty=1; // var: ES-modules lezen window.difficulty
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
// _elTire → ui/hud.js
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
let _sectorStart=0,_currentSector=0; // _elSector → ui/hud.js
let _secPopTimer=null;
// LocalStorage persistence cache
var _savedHS=0,_savedBL=Infinity; // var: ES-module persistence schrijft window._*
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
// Gap display HUD refs → ui/hud.js
// Quick restart hold timer
let _rstHold=0;
// Per-race lap time history
const _lapTimes=[];
// Weather forecast mid-race
let _weatherForecastTimer=0,_weatherForecastFired=false;
// Collision flash
let _colFlashT=0;
let _contactPopupCD=0; // collision popup cooldown — max once per 3s
// _elRpm → ui/hud.js
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
var _overallFastestLap=Infinity; // var: persistence cross-script
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
let _speedTrapMax=0,_speedTrapFired=false;
var _speedTrapAllTime=0; // var: persistence cross-script
// Car unlock system
var _unlockedCars=new Set([0,1,2,3,4,5,6,7]); // var: persistence cross-script (default unlocks)
var _raceCount=0,_podiumCount=0; // var: persistence cross-script (career stats)
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
// GRIP_BONUS_ZONES → js/config.js
// Car color customization — overrides per car ID (null = use default)
const _carColorOverride={};
// CAR_COLOR_PRESETS → js/config.js
// Lap count selection
let _selectedLaps=3;

// keydown/keyup handlers → js/ui/input.js

// ══ AUDIO ════════════════════════════════════
var _master=null; // var: music ES-module leest window._master
let _lastGear=1; // multi-oscillator engine state
// ══ PERSISTENCE ══════════════════════════════
var _coins=0,_totalCoinsEarned=0; // var: persistence cross-script
var _lastRaceCoins=0,_comboMult=1.0; // var: ES-modules schrijven beide
let _comboTimer=0,_comboCount=0;
let _bestS1=Infinity,_bestS2=Infinity,_bestS3=Infinity;
// ACHIEVEMENTS + DAILY_CHALLENGES → js/gameplay/achievements.js (top of file).
let _totalNitroUses=0,_winStreak=0;
var _todayChallenge=null,_challengeCompleted=false,_todayRaces=0;
var _worldsUnlocked=new Set(['grandprix']); // var: persistence cross-script
var _trackRecords={}; // var: persistence cross-script

// ── PERSISTENCE FUNCTIONS — verplaatst naar js/persistence/save.js + progression.js ──
// loadPersistent, savePersistent, awardCoins, buyCar, buyWorld,
// checkUnlocks, showUnlockToast, showUnlocks, updateTitleHighScore
// zijn beschikbaar via window.xxx (module laadt deze op DOMContentLoaded).

var CAR_PRICES={};      // var: ES-module persistence/progression leest window.CAR_PRICES
var WORLD_PRICES={};    // var: idem
// (Music subsysteem → js/audio/music.js;
//  initRenderer → js/core/renderer.js;
//  disposeScene/makeSkyTex/buildScene → js/core/scene.js.)

// (SimpleParticles class → js/effects/particles.js)
// (Environment, world builders en gameplay-checks zijn verhuisd naar
//  js/track/environment.js, js/worlds/*, js/effects/*, js/gameplay/*.)
let _wormholeCooldown=0; // wormhole cooldown — gelezen door worlds/space.js
// (Night/rain/cars/physics/AI/special-checks/track-limits/camera/HUD-refs
//  → respective js/* modules.)
let popupTimeouts=[];
let bannerTimer=null;
const fmtTime=s=>s<60?s.toFixed(2)+'s':Math.floor(s/60)+'m'+(s%60).toFixed(2)+'s';
let _lastPPos=0;
// (Countdown, finish, title, select → gameplay/* en ui/*.)
// Car preview state + _unlockHints → js/ui/select.js
// (Speed overlay, confetti, boost ring, slipstream, weather-transition,
//  safety car → js/effects/* en js/gameplay/safetycar.js.)
// _RACE_ACHIEVEMENTS → js/gameplay/achievements.js
let _nitroUseCount=0,_airborneAccum=0,_cleanLapFlag=true,_driftAccum=0;

let _achieveToastEl=null;
let _floatSlot=0,_floatSlotTimer=0; // float-text stagger
let _speedLinesFadeT=0,_speedLinesRedrawT=0;
// (Drift/nitro/boost-trail/ghost/pitstop/AI-mistakes/rev-limiter/gap/
//  collision-flash/quick-restart/weather-forecast/rear-mirror visuals
//  → js/effects/visuals.js, gameplay/*, ui/hud.js.)
// _RPM_* + _lastRedline → js/effects/visuals.js
// ══ MAIN LOOP ════════════════════════════════
clock=new THREE.Clock();
// loop() + FPS/quality state → js/core/loop.js

// ══ TOUCH CONTROLS ══════════════════════════
let _touchControlsReady=false,_wakeLock=null,_hwKeyboardDetected=false;
// HW-keyboard detection listener → js/ui/input.js
async function _acquireWakeLock(){
  try{if('wakeLock' in navigator&&!_wakeLock)_wakeLock=await navigator.wakeLock.request('screen');}catch(_){}
}
// Reacquire wake lock when page becomes visible again (iOS drops it on blur)
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&(gameState==='RACE'||gameState==='COUNTDOWN'))_acquireWakeLock();});
// _HAPTIC_MS + _ALSO_GAS → js/ui/touch.js
// (_resetRaceState → js/gameplay/race.js)
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
      if(typeof renderWithPostFX==='function')renderWithPostFX(scene,camera);
      else renderer.render(scene,camera);
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
