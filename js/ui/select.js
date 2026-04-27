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

// buildCarPreviews was dead — render-to-texture pre-render van 12 cars naar
// PNG (bedoeld voor select-screen thumbnails). Vervangen door live 3D
// preview (initCarPreview/setPreviewCar/updateCarPreview hierboven).
// Verwijderd in dead-code cleanup.


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
