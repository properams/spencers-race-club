// js/ui/select.js — non-module script.

'use strict';

// Pre-baked snapshot architectuur (Route 1):
// In plaats van een TWEEDE WebGLRenderer voor een live 3D preview (wat op
// iOS Safari een hard context-budget probleem oplevert) renderen we elke
// auto één keer naar een snapshot canvas via de HOOFD-game renderer en een
// off-screen WebGLRenderTarget. Display in SELECT is dan een goedkope 2D
// drawImage operatie. Eén WebGL-context tijdens de hele app-lifecycle.
let _prevDefId=-1;
let _snapCache={};         // {carId: HTMLCanvasElement} 2D snapshot per auto
let _snapScene=null,_snapCam=null,_snapRT=null;
let _snapPodiumGridTex=null,_snapGlowTex=null;
const SNAP_W=640,SNAP_H=360;  // 16:9 snapshot resolutie (~3MB cache totaal)
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

// Lazy setup van de offscreen bake-scene. Hergebruikt de hoofd-renderer
// (window.renderer) — geen tweede WebGL context. Aangemaakt bij eerste
// bake call, opgeruimd in disposeSnapshotBakery.
function _initSnapshotBakery(){
  if(_snapScene)return true;
  if(!window.renderer)return false;
  _snapScene=new THREE.Scene();
  _snapCam=new THREE.PerspectiveCamera(32,SNAP_W/SNAP_H,.1,100);
  _snapCam.position.set(4.2,1.55,5.8);_snapCam.lookAt(0,.42,0);
  // Cinematic 3-point lighting: warm key, cool fill, magenta rim.
  var key=new THREE.DirectionalLight(0xfff0e0,2.3);key.position.set(-3,5,5);_snapScene.add(key);
  var fill=new THREE.DirectionalLight(0x88aaff,.9);fill.position.set(4,2,3);_snapScene.add(fill);
  var rim=new THREE.DirectionalLight(0xff44aa,2.0);rim.position.set(0,3,-6);_snapScene.add(rim);
  _snapScene.add(new THREE.AmbientLight(0x223344,.7));
  _snapScene.fog=new THREE.FogExp2(0x060010,.06);
  // Hexagonal podium met emissive neon ring + scrolling grid.
  var hex=new THREE.Mesh(
    new THREE.CylinderGeometry(3.4,3.6,.16,6),
    new THREE.MeshStandardMaterial({color:0x0c0820,metalness:.4,roughness:.6,emissive:0x1a0033,emissiveIntensity:.3})
  );
  hex.position.y=-.08;_snapScene.add(hex);
  var ring=new THREE.Mesh(
    new THREE.TorusGeometry(3.35,.025,8,64),
    new THREE.MeshBasicMaterial({color:0xff2d6f})
  );
  ring.rotation.x=Math.PI/2;ring.position.y=.012;_snapScene.add(ring);
  _snapPodiumGridTex=_makePodiumGridTexture();
  var grid=new THREE.Mesh(
    new THREE.CircleGeometry(3.25,32),
    new THREE.MeshBasicMaterial({map:_snapPodiumGridTex,transparent:true,opacity:.55,depthWrite:false})
  );
  grid.rotation.x=-Math.PI/2;grid.position.y=.011;_snapScene.add(grid);
  _snapGlowTex=_makeRadialGlowTexture('#ff2d6f');
  var rimRing=new THREE.Mesh(
    new THREE.PlaneGeometry(11,11),
    new THREE.MeshBasicMaterial({map:_snapGlowTex,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending})
  );
  rimRing.rotation.x=-Math.PI/2;rimRing.position.y=-.07;_snapScene.add(rimRing);
  _snapRT=new THREE.WebGLRenderTarget(SNAP_W,SNAP_H,{
    minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,
    format:THREE.RGBAFormat,depthBuffer:true
  });
  return true;
}

function _makePodiumGridTexture(){
  const c=document.createElement('canvas');c.width=256;c.height=256;
  const g=c.getContext('2d');
  g.fillStyle='rgba(8,4,24,0)';g.fillRect(0,0,256,256);
  g.strokeStyle='rgba(255,45,111,.55)';g.lineWidth=1;
  for(let i=0;i<=8;i++){
    const p=Math.round((i/8)*256)+.5;
    g.beginPath();g.moveTo(p,0);g.lineTo(p,256);g.stroke();
    g.beginPath();g.moveTo(0,p);g.lineTo(256,p);g.stroke();
  }
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(2,2);
  return t;
}

function _makeRadialGlowTexture(hex){
  const c=document.createElement('canvas');c.width=256;c.height=256;
  const g=c.getContext('2d');
  const grd=g.createRadialGradient(128,128,8,128,128,128);
  grd.addColorStop(0,hex);grd.addColorStop(.35,'rgba(255,45,111,.45)');
  grd.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=grd;g.fillRect(0,0,256,256);
  return new THREE.CanvasTexture(c);
}

// Camera-richting van de bake-camera (genormaliseerd). Hergebruikt door
// _fitCameraToCar zodat alle auto's vanuit dezelfde 3/4-hoek worden
// gerenderd, alleen de afstand verandert per bounding box.
const _CAM_DIR=new THREE.Vector3(4.2,1.13,5.8).normalize();

// Plaats _snapCam zo dat de hele auto binnen het frame past met padding.
// Setminus visible Mesh nodes only — auto-meshes hebben anchor-points,
// boost-trail mountpoints en exhaust-pivots als kinder-Object3D's die
// Box3.setFromObject() opblazen tot factor-2 te grote bbox waardoor
// dist te klein berekend werd → camera te dichtbij.
function _fitCameraToCar(car){
  const bbox=new THREE.Box3();
  let any=false;
  car.traverse(o=>{
    if(o.isMesh&&o.visible!==false&&o.geometry){
      // Reken bbox van deze mesh in world-space en union'd 'm in.
      const mb=new THREE.Box3().setFromObject(o);
      if(any)bbox.union(mb);else{bbox.copy(mb);any=true;}
    }
  });
  if(!any){bbox.setFromObject(car);} // fallback voor edge cases
  const center=new THREE.Vector3();bbox.getCenter(center);
  const size=new THREE.Vector3();bbox.getSize(size);
  // Camera kijkt vanaf 3/4 voor-rechts; horizontale extent gedomineerd
  // door max(X,Z), verticale door Y.
  const halfV=size.y*0.5;
  const halfH=Math.max(size.x,size.z)*0.5;
  const padding=1.45; // 45% lucht rond de auto — voorheen 1.20 was te krap
  const fovRad=THREE.MathUtils.degToRad(_snapCam.fov);
  const aspect=_snapCam.aspect;
  const distV=(halfV*padding)/Math.tan(fovRad/2);
  const distH=(halfH*padding)/Math.tan(Math.atan(Math.tan(fovRad/2)*aspect));
  const dist=Math.max(distV,distH,6.5); // floor verhoogd 5.5→6.5
  _snapCam.position.copy(center).addScaledVector(_CAM_DIR,dist);
  // LookAt iets onder car-center zodat het podium nog deels zichtbaar is.
  _snapCam.lookAt(center.x,center.y-halfV*0.15,center.z);
}

// Render één auto naar het snapshot-canvas. Hergebruikt bake-scene via
// add → render → remove + dispose. Schrijft naar _snapCache[def.id].
function _bakeCarSnapshot(def,colorOverride){
  if(!_initSnapshotBakery())return;
  const car=makeCar(def);
  _snapScene.add(car);
  // Color override: vervang de body-kleur op materials waarvan de hex
  // matched de def.color (zelfde patroon als de oude live preview).
  if(colorOverride!=null&&colorOverride!==def.color){
    car.traverse(o=>{
      if(o.isMesh&&o.material&&o.material.color&&o.material.color.getHex()===def.color){
        o.material.color.setHex(colorOverride);
      }
    });
  }
  // Fit camera op deze specifieke auto (bounding-box-aware framing).
  _fitCameraToCar(car);
  // Render naar off-screen target zodat de hoofdcanvas niet wordt verstoord.
  const prevTarget=window.renderer.getRenderTarget();
  window.renderer.setRenderTarget(_snapRT);
  window.renderer.render(_snapScene,_snapCam);
  window.renderer.setRenderTarget(prevTarget);
  // Read pixels back en zet op een 2D snapshot canvas. WebGL is bottom-up,
  // dus tijdens copy doen we een rij-flip op de Y-as.
  const pixels=new Uint8Array(SNAP_W*SNAP_H*4);
  window.renderer.readRenderTargetPixels(_snapRT,0,0,SNAP_W,SNAP_H,pixels);
  let snap=_snapCache[def.id];
  if(!snap){
    snap=document.createElement('canvas');
    snap.width=SNAP_W;snap.height=SNAP_H;
    _snapCache[def.id]=snap;
  }
  const ctx=snap.getContext('2d');
  const imgData=ctx.createImageData(SNAP_W,SNAP_H);
  // Y-flip: rij i van pixels (vanaf onderkant) → rij (H-1-i) van imgData.
  for(let y=0;y<SNAP_H;y++){
    const srcStart=(SNAP_H-1-y)*SNAP_W*4;
    imgData.data.set(pixels.subarray(srcStart,srcStart+SNAP_W*4),y*SNAP_W*4);
  }
  ctx.putImageData(imgData,0,0);
  // Cleanup: car uit scene + dispose geometries/materials.
  _snapScene.remove(car);
  car.traverse(o=>{
    if(o.geometry)o.geometry.dispose();
    if(o.material){
      if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());
      else o.material.dispose();
    }
  });
}

// Bake alle auto's vooraf zodat selecteren instant is. Aangeroepen vanuit
// buildCarSelectUI. Synchronous loop (~200ms voor 12 auto's) — gebeurt
// tijdens screen-transitie dus geen visuele hapering.
function bakeAllCarSnapshots(){
  if(!window.renderer||!window.CAR_DEFS)return;
  if(!_initSnapshotBakery())return;
  for(let i=0;i<CAR_DEFS.length;i++){
    const def=CAR_DEFS[i];
    if(_snapCache[def.id])continue; // skip al-gecachte
    const ovr=(typeof _carColorOverride!=='undefined'&&_carColorOverride[def.id])||null;
    _bakeCarSnapshot(def,ovr);
  }
}

// Display de cached snapshot van defId op de visible preview canvas via
// 2D drawImage. Behoudt aspect ratio met letterbox-fit.
function _displayCarSnapshot(defId){
  const cvs=document.getElementById('carPreviewCvs');
  if(!cvs)return;
  const snap=_snapCache[defId];
  // Zorg dat canvas backing-store de visible size matched (DPR-aware).
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const cw=Math.max(2,(cvs.clientWidth||SNAP_W)*dpr|0);
  const ch=Math.max(2,(cvs.clientHeight||SNAP_H)*dpr|0);
  if(cvs.width!==cw||cvs.height!==ch){cvs.width=cw;cvs.height=ch;}
  const ctx=cvs.getContext('2d');
  ctx.clearRect(0,0,cw,ch);
  if(!snap){
    // Fallback als bake nog niet gedaan is — laat de canvas zien als
    // dark gradient zodat het niet zwart-leeg is.
    return;
  }
  // Contain-fit: hele snapshot zichtbaar binnen preview-canvas met
  // letterbox-padding. Cover-fit veroorzaakte verticale zoom-crop in
  // portrait phone (canvas-aspect ~2.1:1 vs snapshot 16:9 = 1.78:1) —
  // zichtbaar als "alleen rood vlak en hoekje van de auto".
  const sa=SNAP_W/SNAP_H,da=cw/ch;
  let dx=0,dy=0,dw=cw,dh=ch;
  if(da>sa){dw=ch*sa;dx=(cw-dw)/2;}else{dh=cw/sa;dy=(ch-dh)/2;}
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(snap,dx,dy,dw,dh);
}

// Resize observer — herteken de snapshot wanneer de preview-canvas van
// grootte verandert (orientation flip, window resize).
function _initSnapshotResize(){
  const cvs=document.getElementById('carPreviewCvs');
  if(!cvs||cvs.dataset.snapResizeWired==='1')return;
  cvs.dataset.snapResizeWired='1';
  if(typeof ResizeObserver!=='undefined'){
    new ResizeObserver(()=>{if(_prevDefId>=0)_displayCarSnapshot(_prevDefId);}).observe(cvs);
  }else{
    window.addEventListener('resize',()=>{if(_prevDefId>=0)_displayCarSnapshot(_prevDefId);});
  }
}

// Cleanup bij screen-transitie naar TITLE/RACE. Disposed render target +
// scene-resources zodat ze niet idle GPU-memory innemen. Cache blijft
// staan voor snel terugkeren naar SELECT.
function disposeSnapshotBakery(){
  if(_snapScene){
    _snapScene.traverse(o=>{
      if(o.geometry)o.geometry.dispose();
      if(o.material){
        if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());
        else o.material.dispose();
      }
    });
    _snapScene=null;
  }
  if(_snapPodiumGridTex){_snapPodiumGridTex.dispose();_snapPodiumGridTex=null;}
  if(_snapGlowTex){_snapGlowTex.dispose();_snapGlowTex=null;}
  if(_snapRT){_snapRT.dispose();_snapRT=null;}
  _snapCam=null;
  // _snapCache blijft — 2D canvases nemen alleen JS heap memory in, geen
  // GPU memory. Snel weergave bij volgende SELECT-bezoek zonder re-bake.
}
window.disposeSnapshotBakery=disposeSnapshotBakery;

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
  const sp=document.getElementById('prevSpecs');
  if(sp){
    const tlabel=def.type==='f1'?'F1':def.type==='muscle'?'MUSCLE':def.type==='electric'?'ELECTRIC':'SUPER';
    const hp=Math.round(def.topSpd*820);
    const tk=Math.round(def.topSpd*255);
    sp.textContent=tlabel+' · '+hp+' hp · '+tk+' km/h';
  }
  // Snapshot display — als de bake ervoor nog niet is gedaan (eerste klik
  // op deze auto na color override), bake nu just-in-time.
  if(!_snapCache[defId]){
    _bakeCarSnapshot(def,_carColorOverride[defId]||null);
  }
  _displayCarSnapshot(defId);
  // 4-stat card stack: SPEED / ACCEL / HANDLING / NITRO with a ghost
  // bar at the catalog max behind the current car's bar, and a rank-
  // coloured numeric. Animated via CSS transition on .statCardFill.
  _renderStatCards(def);
  // Color swatches — onder de preview canvas. Click → re-bake die ene auto.
  const colorEl=document.getElementById('colorRow');
  if(colorEl){
    colorEl.innerHTML='';
    const curColor=_carColorOverride[defId]||def.color;
    CAR_COLOR_PRESETS.forEach(hex=>{
      const dot=document.createElement('div');dot.className='colorDot'+(hex===curColor?' cSel':'');
      dot.style.background='#'+hex.toString(16).padStart(6,'0');
      dot.onclick=()=>{
        _carColorOverride[defId]=hex;
        // Invalidate cache + re-bake met nieuwe kleur, herteken display.
        delete _snapCache[defId];
        _bakeCarSnapshot(def,hex);
        _displayCarSnapshot(defId);
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
  // Restore race-config voorkeuren uit localStorage. loadPersistent zelf
  // restoreert alleen unlocks/coins/records — laps en difficulty werden
  // bij elke reload terug op hardcoded defaults gezet (3, normal),
  // waardoor de start-button summary niet matched met wat gebruiker
  // eerder gekozen had.
  try{
    const sl=parseInt(localStorage.getItem('src_lap'),10);
    if(sl===1||sl===3||sl===5){_selectedLaps=sl;TOTAL_LAPS=sl;}
    const sd=parseInt(localStorage.getItem('src_difficulty'),10);
    if(sd===0||sd===1||sd===2)difficulty=sd;
  }catch(e){}
  _prevDefId=-1;
  // Pre-bake snapshots voor alle 12 auto's via de hoofd-renderer.
  // Synchronous (~200ms) — gebeurt tijdens screen-transitie naar SELECT
  // dus de gebruiker ziet geen visuele hapering.
  bakeAllCarSnapshots();
  _initSnapshotResize();
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
    const wIcons={grandprix:'🏎️',space:'🚀',deepsea:'🌊',candy:'🍬',neoncity:'🌃',volcano:'🌋',arctic:'🧊',themepark:'🎢'};
    const wNames2={grandprix:'GRAND PRIX',space:'COSMIC',deepsea:'DEEP SEA',candy:'CANDY',neoncity:'NEON CITY',volcano:'VOLCANO',arctic:'ARCTIC',themepark:'THRILL PARK'};
    wInd.textContent=(wIcons[activeWorld]||'⬢')+' '+(wNames2[activeWorld]||activeWorld.toUpperCase());
  }
  _weatherMode='clear';
  // Sync difficulty tab visual state + wire onclick. Voorheen alleen
  // visual sync, geen handler — segmented control was non-functional,
  // wat de "LAPS=1 maar START RACE zegt 'normal'" desync verklaart.
  ['dEasy','dNorm','dHard'].forEach((id,i)=>{
    const el=document.getElementById(id);if(!el)return;
    el.classList.toggle('setOptSel',i===difficulty);
    el.classList.toggle('diffSel',i===difficulty);
    el.onclick=()=>{
      difficulty=i;
      try{localStorage.setItem('src_difficulty',i);}catch(e){}
      ['dEasy','dNorm','dHard'].forEach((id2,j)=>{
        const e2=document.getElementById(id2);if(!e2)return;
        e2.classList.toggle('setOptSel',j===i);
        e2.classList.toggle('diffSel',j===i);
      });
      _renderRival(); // rival lap-record key bevat difficulty
      _updateSelectSummary();
    };
  });
  // Wire LAPS tab options.
  [1,3,5].forEach(n=>{
    const btn=document.getElementById('lap'+n);if(!btn)return;
    btn.classList.toggle('setOptSel',n===_selectedLaps);
    btn.onclick=()=>{
      _selectedLaps=n;TOTAL_LAPS=n;
      try{localStorage.setItem('src_lap',n);}catch(e){}
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
  // Build the parallel mobile-portrait UI. CSS keeps it hidden on
  // desktop/landscape; on portrait phones it replaces the legacy layout.
  _buildMobileSelect();
}

// ──────────────────────────────────────────────────────────────────────
// MOBILE PORTRAIT REDESIGN — parallel renderer.
// State is shared with the desktop UI via window.* globals (selCarId,
// _selectedLaps, difficulty, isDark, _activeTier, _coins, _unlockedCars,
// _carColorOverride, activeWorld). Both renderers update the same
// state setters so switching orientation mid-screen stays consistent.
// ──────────────────────────────────────────────────────────────────────

let _selMScrollTimer=null;
let _selMScrollWired=false;

const _SELM_WORLD_ICONS={
  grandprix:'🏎️',space:'🚀',deepsea:'🌊',candy:'🍬',
  neoncity:'🌃',volcano:'🌋',arctic:'🧊',themepark:'🎢'
};
const _SELM_WORLD_NAMES={
  grandprix:'GRAND PRIX',space:'COSMIC',deepsea:'DEEP SEA',candy:'SUGAR RUSH',
  neoncity:'NEON CITY',volcano:'VOLCANO',arctic:'ARCTIC',themepark:'THRILL PARK'
};
const _SELM_TIER_LABEL={super:'SUPER',f1:'F1',muscle:'MUSCLE',electric:'ELECTRIC'};

function _selMVibrate(ms){
  try{if(navigator.vibrate)navigator.vibrate(ms);}catch(e){}
}

// Filtered list of car defs based on _activeTier. Locked cars stay in
// the list (visible with padlock badge) but are not selectable.
function _selMFilteredCars(){
  if(!window.CAR_DEFS)return [];
  if(_activeTier==='all')return CAR_DEFS.slice();
  return CAR_DEFS.filter(d=>d.type===_activeTier);
}

// Draw the pre-baked snapshot into a card's <canvas>. Cover-fit so the
// car fills the square frame without letterbox; podium-edges may crop.
function _selMDrawCardCanvas(canvas,defId){
  if(!canvas)return;
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const cw=Math.max(2,(canvas.clientWidth||260)*dpr|0);
  const ch=Math.max(2,(canvas.clientHeight||260)*dpr|0);
  if(canvas.width!==cw||canvas.height!==ch){canvas.width=cw;canvas.height=ch;}
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,cw,ch);
  const snap=_snapCache[defId];
  if(!snap)return;
  // Cover-fit: scale to fill card, center horizontally, crop overflow.
  const sa=SNAP_W/SNAP_H,da=cw/ch;
  let dw,dh,dx,dy;
  if(da<sa){dh=ch;dw=ch*sa;dx=(cw-dw)/2;dy=0;}
  else     {dw=cw;dh=cw/sa;dx=0;dy=(ch-dh)/2;}
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
  ctx.drawImage(snap,dx,dy,dw,dh);
}

// Convert def.accent (or def.color) to a CSS hex string. Used as the
// per-car accent for borders, glow, badge and corner brackets.
function _selMAccentHex(def){
  const v=(def.accent!=null?def.accent:def.color)|0;
  return '#'+v.toString(16).padStart(6,'0');
}
function _selMHexToRgba(def,alpha){
  const v=(def.accent!=null?def.accent:def.color)|0;
  const r=(v>>16)&0xff,g=(v>>8)&0xff,b=v&0xff;
  return 'rgba('+r+','+g+','+b+','+alpha+')';
}

// Build/rebuild the carousel cards based on the active tier filter.
// Each card has its own <canvas> drawn from the pre-baked snapshot.
function _selMRenderCarousel(){
  const carousel=document.getElementById('selMCarousel');
  const dotsEl=document.getElementById('selMDots');
  if(!carousel||!dotsEl)return;
  const list=_selMFilteredCars();
  carousel.innerHTML='';dotsEl.innerHTML='';
  if(!list.length)return;
  // If selCarId is filtered out, fall back to first in list.
  let activeIdx=list.findIndex(d=>d.id===selCarId);
  if(activeIdx<0){activeIdx=0;selCarId=list[0].id;}
  list.forEach((def,i)=>{
    const unlocked=_unlockedCars.has(def.id);
    const card=document.createElement('div');
    card.className='selM-card'+(i===activeIdx?' selM-cardActive':'')+(unlocked?'':' selM-cardLocked');
    card.dataset.defId=def.id;
    card.style.setProperty('--car-accent',_selMAccentHex(def));
    card.style.setProperty('--car-glow',_selMHexToRgba(def,.45));
    const tierLbl=_SELM_TIER_LABEL[def.type]||(def.type||'').toUpperCase();
    let lockHtml='';
    if(!unlocked){
      const price=_carPrices[def.id];
      const coins=window._coins|0;
      const afford=price&&coins>=price;
      lockHtml=
        '<div class="selM-cardLock">'+
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">'+
            '<rect x="3" y="11" width="18" height="11" rx="2"/>'+
            '<path d="M7 11V7a5 5 0 0 1 10 0v4"/>'+
          '</svg>'+
        '</div>';
      var priceHtml=price?'<div class="selM-cardPrice'+(afford?' afford':'')+'">'+price+' COINS</div>':'';
    }
    card.innerHTML=
      '<div class="selM-cardBg"></div>'+
      '<div class="selM-cardCorners"></div>'+
      '<canvas class="selM-cardCanvas'+(unlocked?'':' selM-cardCanvasLocked')+'"></canvas>'+
      '<div class="selM-cardBadge">'+tierLbl+'</div>'+
      lockHtml+
      '<div class="selM-cardName">'+
        '<div class="selM-cardBrand">'+def.brand+'</div>'+
        '<div class="selM-cardModel">'+def.name.toUpperCase()+'</div>'+
        (priceHtml||'')+
      '</div>';
    // Tap on a non-active card → snap to it via scrollIntoView.
    card.addEventListener('click',()=>{
      if(card.classList.contains('selM-cardActive'))return;
      card.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});
    });
    carousel.appendChild(card);
    const dot=document.createElement('div');
    dot.className='selM-dot'+(i===activeIdx?' selM-dotActive':'');
    dotsEl.appendChild(dot);
  });
  // Draw all canvases on next frame (after layout so clientWidth is real).
  requestAnimationFrame(()=>{
    carousel.querySelectorAll('.selM-cardCanvas').forEach((cvs,i)=>{
      _selMDrawCardCanvas(cvs,list[i].id);
    });
    // Snap scroll position to the active card without animation.
    const cards=carousel.querySelectorAll('.selM-card');
    if(cards[activeIdx]){
      const c=cards[activeIdx];
      const target=c.offsetLeft+c.clientWidth/2-carousel.clientWidth/2;
      carousel.scrollTo({left:target,behavior:'auto'});
    }
  });
  _selMWireScroll();
}

// One-time scroll listener — debounced, finds the centered card and
// updates state via _selMSetActiveDef. We re-bind as needed because
// _selMRenderCarousel rebuilds carousel children on tier change but
// the carousel container itself is stable.
function _selMWireScroll(){
  if(_selMScrollWired)return;
  const carousel=document.getElementById('selMCarousel');
  if(!carousel)return;
  _selMScrollWired=true;
  carousel.addEventListener('scroll',()=>{
    if(_selMScrollTimer)clearTimeout(_selMScrollTimer);
    _selMScrollTimer=setTimeout(()=>{
      const cards=carousel.querySelectorAll('.selM-card');
      if(!cards.length)return;
      const center=carousel.scrollLeft+carousel.clientWidth/2;
      let closest=0,closestDist=Infinity;
      cards.forEach((c,i)=>{
        const cc=c.offsetLeft+c.clientWidth/2;
        const dist=Math.abs(cc-center);
        if(dist<closestDist){closestDist=dist;closest=i;}
      });
      const list=_selMFilteredCars();
      const def=list[closest];if(!def)return;
      const prevId=selCarId;
      // Update visual classes immediately for snappy feedback.
      cards.forEach((c,i)=>c.classList.toggle('selM-cardActive',i===closest));
      document.querySelectorAll('.selM-dot').forEach((d,i)=>d.classList.toggle('selM-dotActive',i===closest));
      // Locked cars are visible but stay non-selectable — preview
      // updates anyway so users see what they're working towards.
      if(def.id!==prevId){
        if(_unlockedCars.has(def.id)){
          // Sync with desktop selection logic: drives stats, snapshot, etc.
          _selectPreviewCar(def.id);
          // Mirror selection to legacy garage list visual state.
          document.querySelectorAll('.carCard').forEach(el=>{
            el.classList.toggle('sel',el.dataset.defId==String(def.id));
          });
        }else{
          // Locked — show preview info but don't commit selection.
          _selMRenderInfo(def);
        }
        _selMRenderInfo(def);
        _selMVibrate(8);
      }
    },70);
  });
}

// Render stats strip (POWER / TOP SPEED / 0-100) and bottom summary.
// Stats are derived from the same fields as the desktop prevSpecs line:
// hp = topSpd * 820, topKmh = topSpd * 255, accel = 1/accel rough seconds.
function _selMRenderInfo(def){
  if(!def)return;
  const hp=Math.round(def.topSpd*820);
  const topKmh=Math.round(def.topSpd*255);
  // 0-100 seconds — accel field is a per-frame increment (~.017–.026).
  // Map to a feel-correct seconds value: slower-accel cars get ~3.5s,
  // faster ones ~1.8s. Linear scale based on observed range.
  const sec=Math.max(1.6,Math.min(4.5,5.5 - def.accel*150));
  const stats=document.getElementById('selMStats');
  if(stats){
    stats.innerHTML=
      '<div class="selM-stat">'+
        '<div class="selM-statLbl">POWER</div>'+
        '<div class="selM-statVal">'+hp+'<span class="selM-statUnit">HP</span></div>'+
        '<div class="selM-statBar"><div class="selM-statBarFill" style="width:'+Math.min(100,hp/11)+'%"></div></div>'+
      '</div>'+
      '<div class="selM-stat">'+
        '<div class="selM-statLbl">TOP SPEED</div>'+
        '<div class="selM-statVal">'+topKmh+'<span class="selM-statUnit">KM/H</span></div>'+
        '<div class="selM-statBar"><div class="selM-statBarFill" style="width:'+Math.min(100,topKmh/3.8)+'%"></div></div>'+
      '</div>'+
      '<div class="selM-stat">'+
        '<div class="selM-statLbl">0—100</div>'+
        '<div class="selM-statVal">'+sec.toFixed(1)+'<span class="selM-statUnit">S</span></div>'+
        '<div class="selM-statBar"><div class="selM-statBarFill" style="width:'+Math.max(20,100-sec*22)+'%"></div></div>'+
      '</div>';
  }
  _selMRenderSummary(def);
}

function _selMRenderSummary(def){
  const el=document.getElementById('selMSummary');
  if(!el)return;
  if(!def)def=CAR_DEFS.find(d=>d.id===selCarId)||CAR_DEFS[0];
  const dNames=['EASY','NORMAL','HARD'];
  const mode=isDark?'DARK':'DAY';
  el.innerHTML=
    '<span>'+def.brand+' '+def.name.toUpperCase()+'</span>'+
    '<span class="selM-sep">·</span>'+
    '<span>'+_selectedLaps+' LAPS</span>'+
    '<span class="selM-sep">·</span>'+
    '<span>'+dNames[difficulty]+'</span>'+
    '<span class="selM-sep">·</span>'+
    '<span>'+mode+'</span>';
}

function _selMRenderHeader(){
  const u=_unlockedCars.size,t=(window.CAR_DEFS||[]).length;
  const coinsEl=document.getElementById('selMCoins');
  if(coinsEl)coinsEl.textContent=((window._coins|0)).toLocaleString('en');
  const unEl=document.getElementById('selMUnlocked');
  if(unEl)unEl.textContent=u+' / '+t+' UNLOCKED';
  const fill=document.getElementById('selMProgFill');
  if(fill)fill.style.width=(t>0?(u/t)*100:0)+'%';
  const tNameEl=document.getElementById('selMTrackName');
  const tEmojiEl=document.getElementById('selMTrackEmoji');
  if(tNameEl)tNameEl.textContent=_SELM_WORLD_NAMES[activeWorld]||activeWorld.toUpperCase();
  if(tEmojiEl)tEmojiEl.textContent=_SELM_WORLD_ICONS[activeWorld]||'⬢';
}

function _selMSyncTabs(){
  document.querySelectorAll('#selMTabs .selM-tab').forEach(t=>{
    t.classList.toggle('selM-tabActive',t.dataset.tier===_activeTier);
  });
}
function _selMSyncChips(){
  document.querySelectorAll('#selMLaps .selM-chip').forEach(c=>{
    c.classList.toggle('selM-chipActive',+c.dataset.val===+_selectedLaps);
  });
  document.querySelectorAll('#selMDiff .selM-chip').forEach(c=>{
    c.classList.toggle('selM-chipActive',+c.dataset.val===+difficulty);
  });
  const modeVal=isDark?'dark':'day';
  document.querySelectorAll('#selMMode .selM-chip').forEach(c=>{
    c.classList.toggle('selM-chipActive',c.dataset.val===modeVal);
  });
}

let _selMWired=false;
function _selMWireOnce(){
  if(_selMWired)return;
  _selMWired=true;
  const back=document.getElementById('selMBack');
  if(back)back.addEventListener('click',()=>{
    _selMVibrate(8);
    if(typeof goToWorldSelect==='function')goToWorldSelect();
  });
  const track=document.getElementById('selMTrack');
  if(track)track.addEventListener('click',()=>{
    _selMVibrate(8);
    if(typeof goToWorldSelect==='function')goToWorldSelect();
  });
  const race=document.getElementById('selMRace');
  if(race)race.addEventListener('click',()=>{
    _selMVibrate(15);
    if(typeof goToRace==='function')goToRace();
  });
  // Tier tabs — share _activeTier with desktop garage list.
  document.querySelectorAll('#selMTabs .selM-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      _activeTier=tab.dataset.tier;
      _selMSyncTabs();
      // Keep desktop tabs visually in sync too in case user rotates.
      document.querySelectorAll('.tierTab').forEach(t=>t.classList.toggle('tierTabSel',t.dataset.tier===_activeTier));
      _renderGarageList();
      _selMRenderCarousel();
      const def=CAR_DEFS.find(d=>d.id===selCarId);
      if(def)_selMRenderInfo(def);
      _selMVibrate(8);
    });
  });
  // LAPS chips
  document.querySelectorAll('#selMLaps .selM-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      const n=+chip.dataset.val;
      _selectedLaps=n;TOTAL_LAPS=n;
      try{localStorage.setItem('src_lap',n);}catch(e){}
      // Mirror to desktop segmented control.
      [1,3,5].forEach(m=>{const b=document.getElementById('lap'+m);if(b)b.classList.toggle('setOptSel',m===n);});
      _selMSyncChips();
      _selMRenderSummary();
      _updateSelectSummary();
      _selMVibrate(8);
    });
  });
  // DIFF chips
  document.querySelectorAll('#selMDiff .selM-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      const i=+chip.dataset.val;
      difficulty=i;
      try{localStorage.setItem('src_difficulty',i);}catch(e){}
      // Mirror to desktop segmented control.
      ['dEasy','dNorm','dHard'].forEach((id,j)=>{
        const e=document.getElementById(id);if(!e)return;
        e.classList.toggle('setOptSel',j===i);
        e.classList.toggle('diffSel',j===i);
      });
      _selMSyncChips();
      if(typeof _renderRival==='function')_renderRival();
      _selMRenderSummary();
      _updateSelectSummary();
      _selMVibrate(8);
    });
  });
  // MODE chips (Day / Dark) — reuses isDark + toggleNight().
  document.querySelectorAll('#selMMode .selM-chip').forEach(chip=>{
    chip.addEventListener('click',()=>{
      const wantDark=chip.dataset.val==='dark';
      if(wantDark!==isDark){
        if(typeof initAudio==='function')initAudio();
        if(typeof startSelectMusic==='function')startSelectMusic();
        if(typeof toggleNight==='function')toggleNight();
      }
      // Mirror to desktop segmented control.
      const off=document.getElementById('togNightOff'),on=document.getElementById('togNightOn');
      if(off)off.classList.toggle('setOptSel',!isDark);
      if(on)on.classList.toggle('setOptSel',isDark);
      _selMSyncChips();
      _selMRenderSummary();
      _updateSelectSummary();
      _selMVibrate(8);
    });
  });
}

function _buildMobileSelect(){
  if(!document.querySelector('.selMobile'))return;
  _selMWireOnce();
  _selMRenderHeader();
  _selMSyncTabs();
  _selMSyncChips();
  _selMRenderCarousel();
  const def=CAR_DEFS.find(d=>d.id===selCarId)||CAR_DEFS[0];
  if(def)_selMRenderInfo(def);
}
window._buildMobileSelect=_buildMobileSelect;
