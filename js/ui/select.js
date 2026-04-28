// js/ui/select.js — non-module script.

'use strict';

// Car-preview state — gebruikt in initCarPreview/updateCarPreview.
// (carPreviews dict verwijderd samen met buildCarPreviews — was de enige populator.)
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
  ThreeCompat.applyRendererColorSpace(_prevRen);_prevRen.setClearColor(0x050812,1);
  _prevScene=new THREE.Scene();
  _prevCam=new THREE.PerspectiveCamera(36,400/220,.1,100);_prevCam.position.set(4.5,2.2,5.5);_prevCam.lookAt(0,.5,0);
  var sun=new THREE.DirectionalLight(0xfff8f0,2.5);sun.position.set(4,8,5);_prevScene.add(sun);
  var fill=new THREE.DirectionalLight(0xaabbff,.8);fill.position.set(-3,2,3);_prevScene.add(fill);
  var rim=new THREE.DirectionalLight(0xcc88ff,1.2);rim.position.set(-2,3,-5);_prevScene.add(rim);
  _prevScene.add(new THREE.AmbientLight(0x334466,.8));
  _prevScene.fog=new THREE.FogExp2(0x060010,.08);
  var floor=new THREE.Mesh(new THREE.CylinderGeometry(4,4,.05,32),new THREE.MeshLambertMaterial({color:0x111122}));
  floor.position.y=-.05;_prevScene.add(floor);
  // Pink turntable ring (subtle accent)
  var ring=new THREE.Mesh(new THREE.TorusGeometry(3.4,.02,4,48),new THREE.MeshBasicMaterial({color:0xff3a8c,transparent:true,opacity:.45}));
  ring.rotation.x=Math.PI/2;ring.position.y=.005;_prevScene.add(ring);
  _initPreviewDrag(cvs);
}

// Drag-to-rotate: while dragging the user controls the rotation. After
// release we keep their offset for ~2s, then resume the auto-rotate idle
// loop. updateCarPreview reads _prevDragHoldT to skip auto-rotate.
let _prevDragging=false,_prevDragLastX=0,_prevDragHoldT=0;
function _initPreviewDrag(cvs){
  if(!cvs||cvs.dataset.dragWired==='1')return;
  cvs.dataset.dragWired='1';
  const onDown=(x)=>{_prevDragging=true;_prevDragLastX=x;};
  const onMove=(x)=>{
    if(!_prevDragging||!_prevCarMesh)return;
    const dx=x-_prevDragLastX;
    _prevCarMesh.rotation.y+=dx*0.012;
    _prevDragLastX=x;
  };
  const onUp=()=>{_prevDragging=false;_prevDragHoldT=2.0;};
  cvs.addEventListener('mousedown',e=>onDown(e.clientX));
  window.addEventListener('mousemove',e=>onMove(e.clientX));
  window.addEventListener('mouseup',onUp);
  cvs.addEventListener('touchstart',e=>{if(e.touches[0])onDown(e.touches[0].clientX);},{passive:true});
  window.addEventListener('touchmove',e=>{if(e.touches[0])onMove(e.touches[0].clientX);},{passive:true});
  window.addEventListener('touchend',onUp);
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
  if(_prevDragHoldT>0)_prevDragHoldT=Math.max(0,_prevDragHoldT-dt);
  if(_prevCarMesh&&!_prevDragging&&_prevDragHoldT<=0)_prevCarMesh.rotation.y+=dt*0.6;
  _prevRen.render(_prevScene,_prevCam);
}

// buildCarPreviews was dead — render-to-texture pre-render van 12 cars naar
// PNG (bedoeld voor select-screen thumbnails). Vervangen door live 3D
// preview (initCarPreview/setPreviewCar/updateCarPreview hierboven).
// Verwijderd in dead-code cleanup.


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
  selCarId=defId;
  setPreviewCar(defId);
  const def=CAR_DEFS.find(d=>d.id===defId);if(!def)return;
  if(window.Audio&&window.Audio.preloadAll)window.Audio.preloadAll(def.type);
  // Brand line + model + specs
  const b=document.getElementById('prevBrand');if(b)b.textContent=def.brand;
  const n=document.getElementById('prevName');
  if(n){n.style.cssText+='transition:none;opacity:0;transform:translateY(6px)';setTimeout(()=>{n.textContent=def.name;n.style.cssText+='transition:all .22s ease;opacity:1;transform:translateY(0)';},60);}
  const sp=document.getElementById('prevSpecs');
  if(sp){
    const tlabel=def.type==='f1'?'F1':def.type==='muscle'?'MUSCLE':def.type==='electric'?'ELECTRIC':'SUPER';
    const hp=Math.round(def.topSpd*820);
    const tk=Math.round(def.topSpd*255);
    sp.textContent=tlabel+' · '+hp+' hp · '+tk+' km/h';
  }
  // 4-stat card grid: SPEED / ACCEL / HANDLING / NITRO.
  const statsEl=document.getElementById('prevStats');
  if(statsEl){
    const spd=Math.round((def.topSpd/1.38)*100);
    const acc=Math.round((def.accel/.026)*100);
    const hdl=Math.round((def.hdlg/.060)*100);
    const ntr=Math.round(((def.nitro||5)/10)*100);
    const card=(lbl,v,col)=>`<div class="statCard"><div class="statCardLbl">${lbl}</div><div class="statCardBar"><div class="statCardFill" style="width:${v}%;background:${col};box-shadow:0 0 6px ${col}99"></div></div><div class="statCardVal" style="color:${col}">${v}</div></div>`;
    statsEl.innerHTML=card('SPEED',spd,'#ff7700')+card('ACCEL',acc,'#00aaff')+card('HANDLING',hdl,'#00ff88')+card('NITRO',ntr,'#ff3a8c');
  }
  // Color swatches — overlay on preview canvas (no separate "COLOUR" label).
  const colorEl=document.getElementById('colorRow');
  if(colorEl){
    colorEl.innerHTML='';
    const curColor=_carColorOverride[defId]||def.color;
    CAR_COLOR_PRESETS.forEach(hex=>{
      const dot=document.createElement('div');dot.className='colorDot'+(hex===curColor?' cSel':'');
      dot.style.background='#'+hex.toString(16).padStart(6,'0');
      dot.onclick=()=>{
        _carColorOverride[defId]=hex;
        if(_prevCarMesh){_prevCarMesh.traverse(o=>{if(o.isMesh&&o.material&&o.material.color){const m=o.material;if(m.color.getHex()===def.color||m.color.getHex()===(_carColorOverride[defId]||def.color)){m.color.setHex(hex);}}});}
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
  // HUD accent tint per world (applied to race-info panel border).
  const hudInfo=document.getElementById('hudRaceInfo');
  if(hudInfo)hudInfo.style.borderColor=isDeepSea?'rgba(0,221,170,.45)':isSpace?'rgba(0,204,255,.45)':isNeonW?'rgba(0,255,238,.45)':'rgba(255,255,255,.10)';
}

// Active tier filter for the garage list. 'all' shows everything; otherwise
// only def.type === tier is rendered.
let _activeTier='all';
const _carPrices={4:0,5:0,6:0,7:0,8:800,9:1200,10:1500,11:2000};

function _renderGarageList(){
  const grid=document.getElementById('carGrid');if(!grid)return;
  grid.innerHTML='';
  CAR_DEFS.forEach(def=>{
    if(_activeTier!=='all'&&def.type!==_activeTier)return;
    const unlocked=_unlockedCars.has(def.id);
    const card=document.createElement('div');
    card.className='carCard'+(def.id===selCarId&&unlocked?' sel':'')+(unlocked?'':' locked');
    const col=(_carColorOverride[def.id]||def.color).toString(16).padStart(6,'0');
    let trail='';
    if(!unlocked){
      const price=_carPrices[def.id];
      trail=price?`<div class="carPriceLbl">${price}c</div>`:`<div class="carLockIcon">🔒</div>`;
    }
    card.innerHTML=`<div class="carSwatch" style="background:#${col}"></div><div class="carInfo"><div class="carBrand">${def.brand}</div><div class="carName">${def.name}</div></div>${trail}`;
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
  if(!el)return;
  const u=_unlockedCars.size,t=CAR_DEFS.length;
  const c=window._coins|0;
  el.textContent=u+' of '+t+' unlocked · '+c.toLocaleString('en')+' coins';
}

function buildCarSelectUI(){
  loadPersistent();
  _prevDefId=-1;
  initCarPreview();_selectPreviewCar(selCarId);
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
