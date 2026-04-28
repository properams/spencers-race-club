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

// ── iOS long-press / context-menu / selection-popup blockers ─────────
// Killt de "Copy | Translate"-popup die anders mid-gameplay verschijnt
// bij het vasthouden van een knop.
function _installIOSGestureBlocks(){
  document.addEventListener('contextmenu',e=>e.preventDefault(),{capture:true});
  document.addEventListener('selectstart',e=>e.preventDefault(),{capture:true});
  document.addEventListener('touchstart',e=>{
    const t=e.target;
    if(t&&t.closest&&t.closest('canvas, .tcBtn, [id^="hud"], [id^="tc"], #glCanvas, #nitroBar')){
      // Inputs houden focus — preventDefault op buttons/canvas only.
      if(t.tagName!=='INPUT'&&t.tagName!=='TEXTAREA')e.preventDefault();
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
  document.querySelectorAll('.worldBigCard').forEach(card=>{
    card.addEventListener('click',()=>{
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
function _restoreUserPrefs(){
  const _savedWorld=localStorage.getItem('src_world');
  if(_savedWorld==='space'){
    activeWorld='space';
    buildScene(); // rebuild voor space-wereld
  }
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
    // Visual asset preload for default world (HDRI/textures/GLTF). Fire-
    // and-forget; buildScene below uses procedural fallback if not ready in
    // time. When preload finishes we re-apply HDRI to the current scene
    // via maybeUpgradeWorld().
    if(window.Assets&&window.Assets.preloadWorld&&window.activeWorld){
      window.Assets.preloadWorld(window.activeWorld).then(()=>{
        if(typeof maybeUpgradeWorld==='function')maybeUpgradeWorld(window.activeWorld);
      });
    }
    try{buildScene();}
    catch(e){
      if(window.dbg)dbg.error('boot',e,'buildScene crashed');
      else console.error('buildScene crashed:',e);
    }
    // Warm-up render: forceer GPU shader-compilatie voor titel verschijnt.
    if(renderer&&scene&&camera){
      if(_loadEl){
        const ls=_loadEl.querySelector('#loadStep');
        if(ls)ls.textContent='COMPILING SHADERS...';
      }
      // Use post-FX render path (bloom/vignette/grading) when available,
      // val terug op directe renderer.render bij ontbreken (eerste frame
      // moet shader-compilatie triggeren langs hetzelfde pad als de loop).
      if(typeof renderWithPostFX==='function')renderWithPostFX(scene,camera);
      else renderer.render(scene,camera);
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
    loop();
    window.dbg&&dbg.log('boot','done');
  },50);
}
