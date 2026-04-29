// js/ui/select.js — non-module script.

'use strict';

// Car-preview state — voorheen draaide hier een tweede THREE.WebGLRenderer
// voor een live 3D auto-preview. Op iOS Safari liep dat steevast vast op
// het hard WebGL-context budget (max ~4-8 contexts), vooral bij lage
// batterij. Vervangen door een statische SVG hero-card die meekleurt met
// de gekozen auto — geen extra WebGL context, geen render loop.
let _prevDefId=-1;
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

// Apply de auto-kleur op de SVG hero-card via CSS custom properties. Werkt
// op alle browsers (incl. iOS Safari), geen WebGL nodig.
function _applyCarColor(carHex,accentHex){
  const card=document.getElementById('prevHeroCard');
  if(!card)return;
  const c='#'+(carHex>>>0).toString(16).padStart(6,'0');
  const a='#'+((accentHex!=null?accentHex:carHex)>>>0).toString(16).padStart(6,'0');
  // Glow-kleur = accent in rgba met 35% alpha. Eenvoudig string composition
  // ipv color manipulation library.
  const r=(accentHex!=null?accentHex:carHex)>>16&0xff;
  const g=(accentHex!=null?accentHex:carHex)>>8&0xff;
  const b=(accentHex!=null?accentHex:carHex)&0xff;
  card.style.setProperty('--carColor',c);
  card.style.setProperty('--carAccent',a);
  card.style.setProperty('--carGlow','rgba('+r+','+g+','+b+',.35)');
}


// Format a lap time as M:SS.t (e.g. 1:39.8).
function _fmtLapTime(t){
  if(!isFinite(t)||t<=0)return '—';
  const m=Math.floor(t/60),s=t-m*60;
  return m+':'+(s<10?'0':'')+s.toFixed(1);
}

// Render the RIVAL segment based on _lapRecords[world_difficulty].
// Compares to the player's bestLapTime if any. Falls back to "set the
// first record" prompt when no recorded time exists.
function _renderRival(){
  const carEl=document.getElementById('rivalCar');
  const timeEl=document.getElementById('rivalTime');
  if(!carEl||!timeEl)return;
  const recs=window._lapRecords||{};
  const key=activeWorld+'_'+(difficulty|0);
  const r=recs[key];
  if(!r||!isFinite(r.time)){
    carEl.textContent='— set the first record —';
    carEl.style.color='#6e5a9a';
    timeEl.textContent='';
    return;
  }
  carEl.textContent=r.brand+' '+r.name;
  carEl.style.color='#c9b9ff';
  const pb=window._savedBL;
  if(isFinite(pb)&&pb>0){
    const dt=pb-r.time;
    if(dt>0)timeEl.textContent=_fmtLapTime(r.time)+' — beat by '+dt.toFixed(1)+'s';
    else if(dt<0)timeEl.textContent=_fmtLapTime(r.time)+' — you lead by '+(-dt).toFixed(1)+'s';
    else timeEl.textContent=_fmtLapTime(r.time);
  }else{
    timeEl.textContent=_fmtLapTime(r.time);
  }
}

function _updateSelectSummary(){
  const dNames=['easy','normal','hard'];
  const mode=isDark?'dark':'light';
  const el=document.getElementById('lapSummary');
  if(el)el.textContent=_selectedLaps+' lap'+(+_selectedLaps>1?'s':'')+' · '+dNames[difficulty]+' · '+mode;
}

function _selectPreviewCar(defId){
  const switching=(defId!==_prevDefId);
  selCarId=defId;_prevDefId=defId;
  const def=CAR_DEFS.find(d=>d.id===defId);if(!def)return;
  if(window.Audio&&window.Audio.preloadAll)window.Audio.preloadAll(def.type);
  // Short rev burst per car-type when actually switching (skip on initial
  // entry where _prevDefId starts at -1 → first match still counts as a
  // switch, but at that point audioCtx may not exist yet so the rev is a
  // silent no-op anyway).
  if(switching&&window.Audio&&window.Audio.playEngineRev){
    window.Audio.playEngineRev(def.type);
  }
  // Brand line + model + specs
  const b=document.getElementById('prevBrand');if(b)b.textContent=def.brand;
  const n=document.getElementById('prevName');if(n)n.textContent=def.name;
  const tlabel=def.type==='f1'?'F1':def.type==='muscle'?'MUSCLE':def.type==='electric'?'ELECTRIC':'SUPER';
  const sp=document.getElementById('prevSpecs');
  if(sp){
    const hp=Math.round(def.topSpd*820);
    const tk=Math.round(def.topSpd*255);
    sp.textContent=tlabel+' · '+hp+' hp · '+tk+' km/h';
  }
  const tb=document.getElementById('prevTypeBadge');if(tb)tb.textContent=tlabel;
  // Apply de gekozen kleur op de SVG hero card.
  _applyCarColor(_carColorOverride[defId]||def.color,def.accent);
  // 4-stat card stack: SPEED / ACCEL / HANDLING / NITRO with a ghost
  // bar at the catalog max behind the current car's bar, and a rank-
  // coloured numeric. Animated via CSS transition on .statCardFill.
  _renderStatCards(def);
  // Color swatches — onder de hero card als eigen rij.
  const colorEl=document.getElementById('colorRow');
  if(colorEl){
    colorEl.innerHTML='';
    const curColor=_carColorOverride[defId]||def.color;
    CAR_COLOR_PRESETS.forEach(hex=>{
      const dot=document.createElement('div');dot.className='colorDot'+(hex===curColor?' cSel':'');
      dot.style.background='#'+hex.toString(16).padStart(6,'0');
      dot.onclick=()=>{
        _carColorOverride[defId]=hex;
        _applyCarColor(hex,def.accent);
        colorEl.querySelectorAll('.colorDot').forEach(d=>d.classList.remove('cSel'));
        dot.classList.add('cSel');
      };
      colorEl.appendChild(dot);
    });
  }
  _renderRival();
}

function rebuildWorld(newWorld){
  if(newWorld===activeWorld)return;
  activeWorld=newWorld;
  localStorage.setItem('src_world',newWorld);
  // Preload muziek-stems + surface voor deze wereld (fire-and-forget). Als
  // de assets er zijn en op tijd klaar voor race-start gebruikt music.js
  // de stems en engine.js de surface-loop; anders fallback naar procedural.
  if(window.Audio&&window.Audio.preloadWorld)window.Audio.preloadWorld(newWorld);
  if(window._preloadSurfacesForWorld)window._preloadSurfacesForWorld(newWorld);
  // Visual assets (HDRI / ground / GLTF props) — fire-and-forget. World build
  // is synchronous and falls back to procedural if cache is empty at race-start.
  if(window.Assets&&window.Assets.preloadWorld){
    window.Assets.preloadWorld(newWorld).then(()=>{
      if(typeof maybeUpgradeWorld==='function')maybeUpgradeWorld(newWorld);
    });
  }
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
  // (Pre-compile + GPU upload prime gebeurt nu standaard aan het eind van
  // buildScene() via _precompileScene — zie js/core/scene.js.)
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
  // HUD accent tint per world (applied to race-info panel border).
  const hudInfo=document.getElementById('hudRaceInfo');
  if(hudInfo)hudInfo.style.borderColor=isDeepSea?'rgba(0,221,170,.45)':isSpace?'rgba(0,204,255,.45)':isNeonW?'rgba(0,255,238,.45)':'rgba(255,255,255,.10)';
}

// Stat ranking across the catalog — computed lazily once. Used to show
// a ghost (max-in-catalog) bar behind the current car's stat bar, and
// to colour the numeric value by rank (top-3 = green, top half = amber).
let _statRanks=null;
const _STAT_DEFS=[
  {key:'topSpd',lbl:'SPEED',   div:1.38,col:'#ff7700'},
  {key:'accel', lbl:'ACCEL',   div:.026,col:'#00aaff'},
  {key:'hdlg',  lbl:'HANDLING',div:.060,col:'#00ff88'},
  {key:'nitro', lbl:'NITRO',   div:10,  col:'#ff3a8c'}
];
function _computeStatRanks(){
  if(_statRanks)return _statRanks;
  _statRanks={};
  _STAT_DEFS.forEach(s=>{
    const arr=CAR_DEFS.map(c=>({id:c.id,v:Math.round(((c[s.key]||0)/s.div)*100)}));
    arr.sort((a,b)=>b.v-a.v);
    const byId={};arr.forEach((x,i)=>{byId[x.id]=i;});
    _statRanks[s.key]={byId:byId,max:arr.length?arr[0].v:100};
  });
  return _statRanks;
}

function _renderStatCards(def){
  const statsEl=document.getElementById('prevStats');
  if(!statsEl)return;
  const ranks=_computeStatRanks();
  if(statsEl.dataset.built!=='1'){
    statsEl.dataset.built='1';
    statsEl.innerHTML=_STAT_DEFS.map(s=>(
      '<div class="statCard" data-stat="'+s.key+'">'+
        '<div class="statCardHead">'+
          '<div class="statCardLbl">'+s.lbl+'</div>'+
          '<div class="statCardVal"><span class="statCardValNum">0</span><span class="statCardValMax"> / 100</span></div>'+
        '</div>'+
        '<div class="statCardBar">'+
          '<div class="statCardGhost"></div>'+
          '<div class="statCardFill" style="background:'+s.col+';box-shadow:0 0 6px '+s.col+'99"></div>'+
        '</div>'+
      '</div>'
    )).join('');
  }
  const total=CAR_DEFS.length;
  _STAT_DEFS.forEach(s=>{
    const v=Math.round(((def[s.key]||0)/s.div)*100);
    const card=statsEl.querySelector('.statCard[data-stat="'+s.key+'"]');
    if(!card)return;
    const ghost=card.querySelector('.statCardGhost');
    const fill=card.querySelector('.statCardFill');
    const num=card.querySelector('.statCardValNum');
    if(ghost)ghost.style.width=Math.min(100,Math.max(0,ranks[s.key].max))+'%';
    if(fill)fill.style.width=Math.min(100,Math.max(0,v))+'%';
    if(num){
      num.textContent=v;
      const rank=ranks[s.key].byId[def.id]||0;
      num.style.color = rank<3 ? '#7dffb0' : rank<total/2 ? '#ffcc44' : '#c9b9ff';
    }
  });
}

// Active tier filter for the garage list. 'all' shows everything; otherwise
// only def.type === tier is rendered.
let _activeTier='all';
const _carPrices={4:0,5:0,6:0,7:0,8:800,9:1200,10:1500,11:2000};

function _renderGarageList(){
  const grid=document.getElementById('carGrid');if(!grid)return;
  grid.innerHTML='';
  const coins=window._coins|0;
  CAR_DEFS.forEach(def=>{
    if(_activeTier!=='all'&&def.type!==_activeTier)return;
    const unlocked=_unlockedCars.has(def.id);
    const card=document.createElement('div');
    card.className='carCard'+(def.id===selCarId&&unlocked?' sel':'')+(unlocked?'':' locked');
    const carCol=(_carColorOverride[def.id]||def.color);
    const teamCol=(def.accent!=null?def.accent:def.color);
    const carHex='#'+carCol.toString(16).padStart(6,'0');
    const teamHex='#'+teamCol.toString(16).padStart(6,'0');
    card.style.setProperty('--team',teamHex);
    let trail='';
    if(!unlocked){
      const price=_carPrices[def.id];
      const hint=_unlockHints[def.id]||'';
      if(price){
        const afford=coins>=price?' afford':'';
        trail='<div class="carCardTrail">'+
          '<span class="carLockMini">🔒</span>'+
          '<span class="carPriceLbl'+afford+'">'+price+'c</span>'+
        '</div>';
        card.title=(afford?'Unlock for ':'Need ')+price+' coins'+(hint?' · '+hint:'');
      }else{
        trail='<div class="carCardTrail"><span class="carLockIcon">🔒</span></div>';
        card.title='Locked'+(hint?' — '+hint:'');
      }
    }
    card.innerHTML='<div class="carSwatch" style="background:'+carHex+'"></div>'+
                   '<div class="carInfo">'+
                     '<div class="carBrand">'+def.brand+'</div>'+
                     '<div class="carName">'+def.name+'</div>'+
                   '</div>'+trail;
    if(!unlocked){
      card.onclick=()=>showPopup('🔒 LOCKED — '+(_unlockHints[def.id]||'complete challenges'),'#ff6644',1800);
    }else{
      card.onclick=()=>{
        document.querySelectorAll('.carCard').forEach(el=>el.classList.remove('sel'));
        card.classList.add('sel');_selectPreviewCar(def.id);
      };
    }
    grid.appendChild(card);
  });
}

function _renderHeaderSubtitle(){
  const el=document.getElementById('selSubtitle');
  const u=_unlockedCars.size,t=CAR_DEFS.length;
  const c=window._coins|0;
  if(el)el.textContent=u+' of '+t+' unlocked · '+c.toLocaleString('en')+' coins';
  const bar=document.getElementById('garageProgFill');
  if(bar)bar.style.width=(t>0?(u/t)*100:0)+'%';
}

function buildCarSelectUI(){
  loadPersistent();
  _prevDefId=-1;
  _selectPreviewCar(selCarId);
  _renderHeaderSubtitle();
  _renderGarageList();
  _renderRival();
  // Tier tabs — filter the garage list by car type.
  document.querySelectorAll('.tierTab').forEach(tab=>{
    tab.classList.toggle('tierTabSel',tab.dataset.tier===_activeTier);
    tab.onclick=()=>{
      _activeTier=tab.dataset.tier;
      document.querySelectorAll('.tierTab').forEach(t=>t.classList.toggle('tierTabSel',t.dataset.tier===_activeTier));
      _renderGarageList();
    };
  });
  // World indicator badge
  const wInd=document.getElementById('worldIndicator');
  if(wInd){
    const wIcons={grandprix:'🏁',space:'🚀',deepsea:'🌊',candy:'🍬',neoncity:'🌃',volcano:'🌋',arctic:'🧊',themepark:'🎢'};
    const wNames2={grandprix:'GRAND PRIX',space:'COSMIC',deepsea:'DEEP SEA',candy:'CANDY',neoncity:'NEON CITY',volcano:'VOLCANO',arctic:'ARCTIC',themepark:'THRILL PARK'};
    wInd.textContent=(wIcons[activeWorld]||'⬢')+' '+(wNames2[activeWorld]||activeWorld.toUpperCase());
  }
  _weatherMode='clear';
  // Sync difficulty tab visual state to current `difficulty` global.
  ['dEasy','dNorm','dHard'].forEach((id,i)=>{
    const el=document.getElementById(id);if(!el)return;
    el.classList.toggle('setOptSel',i===difficulty);
    el.classList.toggle('diffSel',i===difficulty);
  });
  // Wire LAPS tab options.
  [1,3,5].forEach(n=>{
    const btn=document.getElementById('lap'+n);if(!btn)return;
    btn.classList.toggle('setOptSel',n===_selectedLaps);
    btn.onclick=()=>{
      _selectedLaps=n;TOTAL_LAPS=n;
      [1,3,5].forEach(m=>{const b=document.getElementById('lap'+m);if(b)b.classList.toggle('setOptSel',m===n);});
      _updateSelectSummary();
    };
  });
  // Wire MODE tab options (Light / Dark).
  const nOff=document.getElementById('togNightOff'),nOn=document.getElementById('togNightOn');
  if(nOff){
    nOff.classList.toggle('setOptSel',!isDark);
    nOff.onclick=()=>{
      if(isDark){initAudio();startSelectMusic();toggleNight();}
      nOff.classList.add('setOptSel');nOn.classList.remove('setOptSel');
      _updateSelectSummary();
    };
  }
  if(nOn){
    nOn.classList.toggle('setOptSel',isDark);
    nOn.onclick=()=>{
      if(!isDark){initAudio();startSelectMusic();toggleNight();}
      nOn.classList.add('setOptSel');nOff.classList.remove('setOptSel');
      _updateSelectSummary();
    };
  }
  _updateSelectSummary();
}
