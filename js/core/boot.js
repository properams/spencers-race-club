// js/core/boot.js — app-bootstrap.
// Non-module script. boot() wordt aangeroepen aan het eind van main.js,
// zodat alle top-level globals (CAR_DEFS, activeWorld, scene/camera/renderer
// vars, etc.) door main.js zijn gedeclareerd voordat boot draait.
//
// Afhankelijkheden (allemaal globals via eerder geladen non-module scripts
// of ES modules die zichzelf op window.* zetten):
//   loadGameData (main.js), spawnFlames (effects/visuals.js),
//   initRenderer (core/renderer.js), buildScene (core/scene.js),
//   initAudio + _ensureAudio (audio/engine.js), startTitleMusic (audio/music.js),
//   initTouchControls (ui/touch.js), goToSelect + goToWorldSelect + goToRace
//   (ui/navigation.js), buildCarSelectUI + _updateSelectSummary (ui/select.js),
//   loadPersistent + updateTitleHighScore (persistence/* via window.*),
//   initDailyChallenge (gameplay/achievements.js),
//   setWeather (effects/weather.js), toggleNight (effects/night.js),
//   rebuildWorld (ui/navigation.js), loop (core/loop.js).

'use strict';

// ── Perf Phase A test-mode (URL ?perfauto=1) ─────────────────────────
// Activeert dbg-channels op localStorage (idempotent) en exposeert een
// kleine programmatic-API zodat tools/perf-run.mjs de game zonder canvas-
// klikken door het menu kan jagen. Geen game-logica wordt geraakt; dit is
// puur een entry-shim voor headless meting. Wordt uitgeschakeld als de
// flag niet gezet is.
(function(){
  try{
    const _qs = new URLSearchParams(location.search);
    if(_qs.has('perfauto')){
      try{
        if(localStorage.getItem('src_debug')!=='1') localStorage.setItem('src_debug','1');
        // Channels: 'perf' minimum, behoud bestaande filter als die er is.
        const _ch = localStorage.getItem('src_debug_channels');
        if(_ch && !_ch.split(',').map(s=>s.trim()).includes('perf')){
          localStorage.setItem('src_debug_channels', _ch + ',perf');
        }
      }catch(_){}
      window._perfAuto = true;
      window._bootDone = false;
    }
  }catch(_){}
})();

// ── iOS long-press / context-menu / selection-popup blockers ─────────
// Killt de "Copy | Translate"-popup die anders mid-gameplay verschijnt
// bij het vasthouden van een knop.
function _installIOSGestureBlocks(){
  document.addEventListener('contextmenu',e=>e.preventDefault(),{capture:true});
  document.addEventListener('selectstart',e=>e.preventDefault(),{capture:true});
  document.addEventListener('touchstart',e=>{
    const t=e.target;
    if(t&&t.closest&&t.closest('canvas, .tcBtn, [id^="hud"], [id^="tc"], #glCanvas, #nitroBar')){
      // Inputs houden focus — preventDefault op canvas/divs only.
      // BUTTONs uitsluiten: preventDefault op touchstart killt de synthetische
      // click op iOS, waardoor onclick-handlers (#hudPauseBtn, #hudMuteBtn) niet vuren.
      if(t.tagName!=='INPUT'&&t.tagName!=='TEXTAREA'&&t.tagName!=='BUTTON')e.preventDefault();
    }
  },{passive:false,capture:true});
  // Block the gesture iOS uses to open system selection menus.
  document.addEventListener('gesturestart',e=>e.preventDefault(),{capture:true});
}

// ── Audio unlock op eerste user-interactie + retry op elke klik ──────
function _wireFirstGestureAudio(){
  const _startMusicOnce=()=>{ initAudio(); startTitleMusic(); };
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
  // Retry op elke klik daarna — houdt audioCtx levend door suspends heen.
  document.addEventListener('click',()=>{if(audioCtx)_ensureAudio();},true);
}

// ── Hoofdmenu / world-select / difficulty knoppen ────────────────────
function _wireMenuButtons(){
  document.getElementById('btnStart').addEventListener('click',()=>{initAudio();startTitleMusic();goToWorldSelect();});
  document.getElementById('btnRace').addEventListener('click',goToRace);
  document.getElementById('btnBackTitle').addEventListener('click',()=>goToWorldSelect());
  // Wereld-cards: kies wereld, herbouw scene als 'm verandert, ga door naar car-select.
  // Debounce: rebuildWorld is een 1-3s synchrone build. Een tweede card-tap die
  // tijdens of vlak na de eerste binnenkomt veroorzaakt een dubbele
  // disposeScene+buildScene cyclus die op iOS de WebGL context kan kapot drukken.
  let _worldCardLock=0;
  document.querySelectorAll('.worldBigCard').forEach(card=>{
    card.addEventListener('click',()=>{
      const _now=performance.now();
      if(_now-_worldCardLock<400)return; // 400ms cooldown — ruim langer dan de UI-flip-setTimeout (220ms)
      _worldCardLock=_now;
      const newWorld=card.dataset.world;
      document.querySelectorAll('.worldBigCard').forEach(c=>c.classList.remove('wBigSel'));
      card.classList.add('wBigSel');
      if(newWorld!==activeWorld){rebuildWorld(newWorld);}
      setTimeout(()=>{
        document.getElementById('sWorld').classList.add('hidden');
        gameState='SELECT';
        buildCarSelectUI();
        document.getElementById('sSelect').classList.remove('hidden');
      },220);
    });
  });
  // Difficulty tab options 0=easy 1=normal 2=hard. Toggles both legacy
  // .diffSel and new .setOptSel klasse. Triggert rival-refresh aangezien
  // de rival hangt af van (world × difficulty).
  ['dEasy','dNorm','dHard'].forEach((id,i)=>{
    const el=document.getElementById(id);if(!el)return;
    el.addEventListener('click',()=>{
      difficulty=i;
      document.querySelectorAll('.diffBtn').forEach((b,j)=>{
        b.classList.toggle('diffSel',j===i);
        b.classList.toggle('setOptSel',j===i);
      });
      _updateSelectSummary();
      if(typeof _renderRival==='function')_renderRival();
    });
  });
  // Enter op title screen → car select.
  document.addEventListener('keydown',e=>{if(e.code==='Enter'&&gameState==='TITLE')goToSelect();});
}

// ── User preferences uit localStorage terugzetten ────────────────────
// World-restore is verhuisd naar _restoreSavedWorld() die VÓÓR de eerste
// buildScene draait — anders bouwen we de scene 2x op boot wanneer de
// saved world afwijkt van default. Phase 1 bevinding 1.4: 2x synchrone
// buildScene op boot is een serieuze CPU-piek op trage iPhones.
function _restoreUserPrefs(){
  // Night default ON ('1') als nooit gezet.
  const _savedNight=localStorage.getItem('src_night');
  if(_savedNight==='0'){if(isDark)toggleNight();}else{if(!isDark)toggleNight();}
  const _savedW=localStorage.getItem('src_weather');
  if(_savedW&&_savedW!=='clear'){
    setTimeout(()=>{
      setWeather(_savedW);
      // Re-apply night lighting (setWeather overwrites light intensities).
      if(isDark){sunLight.intensity=.04;ambientLight.intensity=.10;hemiLight.intensity=.07;trackLightList.forEach(l=>l.intensity=2.8);}
    },100);
  }
}

// ── Memory-budget warning bij boot ───────────────────────────────────
// Probeert te detecteren of het device kandidaat is voor crashes onder
// memory-druk. Triggert alleen op mobiel + lage device-memory; logt
// altijd via dbg zodat het in Ctrl+Shift+E ringbuffer zichtbaar is.
function _checkMemoryBudget(){
  let _msg=null;
  try{
    const _dm=navigator.deviceMemory; // Chrome — typically 0.25, 0.5, 1, 2, 4, 8
    if(window._isMobile && typeof _dm==='number' && _dm>0 && _dm<2){
      _msg='Low device memory ('+_dm+'GB) — verminder achtergrond-apps voor stabiele performance.';
    }
    if(performance.memory){ // Chrome only
      const _lim=performance.memory.jsHeapSizeLimit/1048576;
      if(_lim<800){
        _msg=(_msg?_msg+' ':'')+'JS heap limit '+_lim.toFixed(0)+'MB — krap voor deze game.';
      }
    }
  }catch(_){}
  if(_msg){
    if(window.dbg)dbg.warn('boot','memory budget '+_msg);
    if(window.Breadcrumb)Breadcrumb.push('memBudgetWarn',{msg:_msg.slice(0,80)});
    // Subtiele non-blocking warning via bestaande Notify-facade. dur=4500 zodat
    // de melding lang genoeg leesbaar is om gezien te worden zonder de title
    // permanent te bedekken. Notify.banner valt op TITLE-state in OOB-slot.
    if(window.Notify)Notify.banner('⚠ '+_msg,'#ffaa55',4500);
  }
}

async function boot(){
  window.dbg&&dbg.log('boot','start');
  // SW disabled for file:// compat.
  const _loadEl=document.getElementById('loadingScreen');
  // Load game data (cars/tracks/prices) before scene init.
  try{await loadGameData();}
  catch(e){
    // dbg.error logt al naar console én pusht naar de errors-ringbuffer.
    if(window.dbg)dbg.error('boot',e,'loadGameData failed');
    else console.error('loadGameData failed:',e);
    if(_loadEl){_loadEl.innerHTML='<div style="padding:40px;color:#ff6600;font-family:Orbitron,sans-serif">⚠ DATA LOAD FAILED<br><span style="font-size:12px;color:#888">'+e.message+'</span></div>';}
    return;
  }
  _installIOSGestureBlocks();
  spawnFlames();
  // Defer heavy init zodat de browser eerst de loading-screen kan painten.
  setTimeout(()=>{
    try{initRenderer();}
    catch(e){
      if(window.dbg)dbg.error('boot',e,'initRenderer failed');
      else console.error('initRenderer failed:',e);
      if(_loadEl){
        _loadEl.style.display='flex';
        _loadEl.innerHTML='<div style="text-align:center;padding:40px;font-family:Orbitron,sans-serif"><div style="font-size:24px;margin-bottom:12px">⚠</div><div style="font-size:16px;color:#ff6600;margin-bottom:10px">WebGL niet beschikbaar</div><div style="font-size:11px;color:#666;line-height:1.9;max-width:380px">Probeer:<br>1. Sluit andere browser tabs<br>2. Herlaad (F5)<br>3. Chrome → Instellingen → Systeem → Hardware acceleratie AAN</div><button onclick="location.reload()" style="margin-top:16px;background:#ff6600;color:#fff;border:none;padding:10px 24px;border-radius:8px;cursor:pointer;font-family:Orbitron,sans-serif;font-size:11px;letter-spacing:2px">🔄 OPNIEUW</button></div>';
      }
      return;
    }
    // Restore saved world VÓÓR de eerste buildScene zodat we niet 2x bouwen.
    // Vroeger: _restoreUserPrefs deed activeWorld='space' + buildScene() ná
    // de initial buildScene op default world. Nu: één enkele build met de
    // juiste wereld. Alleen werelden die _wireMenuButtons als data-world
    // values bevat zijn valid; onbekende waarden vallen terug op default.
    try{
      const _savedWorld=localStorage.getItem('src_world');
      if(_savedWorld){
        // CSS.escape voorkomt selector-syntax breken op gemanipuleerde
        // localStorage-waarden met aanhalingstekens of brackets.
        const _esc=(window.CSS&&CSS.escape)?CSS.escape(_savedWorld):_savedWorld.replace(/[^\w-]/g,'');
        if(document.querySelector('.worldBigCard[data-world="'+_esc+'"]')){
          activeWorld=_savedWorld;
        }
      }
    }catch(_){}
    // Visual asset preload for default world (HDRI/textures/GLTF). Fire-
    // and-forget; buildScene below uses procedural fallback if not ready in
    // time. When preload finishes we re-apply HDRI to the current scene
    // via maybeUpgradeWorld().
    if(window.Assets&&window.Assets.preloadWorld&&window.activeWorld){
      window.Assets.preloadWorld(window.activeWorld).then(()=>{
        // maybeUpgradeWorld can throw on PMREM/HDRI apply OOM; surface
        // the error to dbg + the inline overlay instead of leaking it
        // as an unhandled rejection that the user can't act on.
        try{ if(typeof maybeUpgradeWorld==='function')maybeUpgradeWorld(window.activeWorld); }
        catch(e){ if(window.dbg)dbg.error('boot',e,'maybeUpgradeWorld failed (initial)'); else console.error('maybeUpgradeWorld failed:',e); }
      }).catch(e=>{
        if(window.dbg)dbg.error('boot',e,'Assets.preloadWorld rejected (initial)');
        else console.error('Assets.preloadWorld rejected:',e);
      });
    }
    try{buildScene();}
    catch(e){
      if(window.dbg)dbg.error('boot',e,'buildScene crashed');
      else console.error('buildScene crashed:',e);
    }
    // Loading-screen rAF-fade. De warm-render gebeurt nu niet meer in
    // buildScene (PHASE-C2 verhuisde 'm naar goToRace ná makeAllCars).
    // Het eerste title-frame wordt synchroon gerendered door de loop()
    // call hieronder (loop()'s body draait synchroon vóór rAF #1, dus
    // het canvas heeft een image vóór rAF #2 het loading-scherm verbergt).
    if(renderer&&scene&&camera){
      if(_loadEl){
        const ls=_loadEl.querySelector('#loadStep');
        if(ls)ls.textContent='COMPILING SHADERS...';
      }
      requestAnimationFrame(()=>{requestAnimationFrame(()=>{
        if(_loadEl)_loadEl.style.display='none';
      });});
    }else{
      if(_loadEl)_loadEl.style.display='none';
    }
    _wireFirstGestureAudio();
    _wireMenuButtons();
    initTouchControls();
    loadPersistent();updateTitleHighScore();
    initDailyChallenge();
    _restoreUserPrefs();
    _checkMemoryBudget();
    loop();
    window.dbg&&dbg.log('boot','done');
    // Perf Phase A: signaalvlag voor headless test-runner. Pas zetten na
    // loop() zodat de runner zeker weet dat rAF al draait.
    window._bootDone = true;
    if(window._perfAuto){
      // Programmatic test-API. Gebruikt dezelfde paden als de UI buttons,
      // maar zonder DOM-clicks (canvas + WebGL HUD overlays zijn lastig
      // klikbaar vanuit Playwright). Geen game-logica, alleen routing.
      window._perfHooks = {
        goToWorldSelect: ()=>{ try{ initAudio(); }catch(_){} goToWorldSelect(); },
        pickWorld: (name)=>{
          // Mirrors _wireMenuButtons: rebuildWorld als de wereld verandert,
          // toon dan car-select scherm.
          if(name && name!==window.activeWorld){ rebuildWorld(name); }
          document.getElementById('sWorld').classList.add('hidden');
          window.gameState='SELECT';
          buildCarSelectUI();
          document.getElementById('sSelect').classList.remove('hidden');
        },
        startRace: ()=>{ goToRace(); },
        goToTitle: ()=>{ goToTitle(); },
        // Force GO direct als debugging-handvat (slaat 5×700ms staggered
        // light-sequence over). Niet standaard gebruikt door de runner —
        // we wachten liever op de echte countdown via 'go.toFirstFrame'.
        forceGo: ()=>{ /* placeholder, niet gebruikt */ },
      };
    }
  },50);
}
