// js/core/scene.js — scene disposal + sky textures + hoofd buildScene().
// Non-module script, geladen vóór main.js.
//
// Afhankelijkheden (script-globals, grotendeels in main.js gedeclareerd):
//   renderer, scene, camera, camPos, mirrorCamera, clock
//   sunLight, ambientLight, hemiLight
//   activeWorld, _TRACKS, _GP_WP, TRACK_WP
//   trackLightList, trackPoles, _trackFlags, _aiHeadPool
//   jumpRamps, spinPads, boostPads, collectibles, skidMarks
//   stars, plHeadL, plHeadR, plTail, _boostLight, _trackMesh, _sunBillboard
//   _wp*, _drs*, _drsActive, _drsTimer, _drsBoostUsed
//   _space*, _kelp*, _jellyfish*, _dsa*, _sprinkle*, _gummy*, _gum*, _candy*,
//   _choco*, _neon*, _holo*, _volcano*, _arctic*, _tp*
//   _snowParticles, _snowGeo, _fogColorDay, _fogColorNight
//   _mmBounds, isDark
//
// Externe builders (non-module scripts): buildTrack, buildSpaceEnvironment,
// buildDeepSeaEnvironment, buildCandyEnvironment, buildNeonCityEnvironment,
// buildVolcanoEnvironment, buildArcticEnvironment, buildThemeparkEnvironment,
// buildGround, buildClouds, buildBarriers, buildGantry, buildMountains,
// buildLake, buildGravelTraps, buildEnvironmentTrees, buildNightObjects,
// buildSpectators, buildSunBillboard, buildAdvertisingBoards,
// buildCornerBoards, buildTrackFlags, buildGPTrackProps, buildJumpRamps,
// buildCenterlineArrows, buildSpinPads, buildBoostPads, buildCollectibles,
// buildWorldElements, buildParticles, buildGhostMesh, initSpeedLines,
// initRain, toggleNight.

'use strict';

// Asset-cached textures (HDRI envMap, PBR ground maps, GLTF instance maps)
// carry userData._sharedAsset=true; disposeScene must skip these or the
// next build pulls a disposed handle from window.Assets cache. Geometries
// inside an InstancedMesh that came from a GLTF prototype are similarly
// shared — we skip them via mesh.userData._sharedAsset too.
function _isSharedAsset(obj){
  return !!(obj && obj.userData && obj.userData._sharedAsset);
}
function disposeScene(){
  if(!scene)return;
  scene.traverse(obj=>{
    if(obj.isMesh||obj.isPoints||obj.isLine||obj.isSprite){
      if(obj.geometry && !_isSharedAsset(obj)) obj.geometry.dispose();
      if(obj.material){
        if(Array.isArray(obj.material))obj.material.forEach(m=>{if(m.map&&!_isSharedAsset({userData:{_sharedAsset:m.userData&&m.userData._sharedAsset}}))m.map.dispose();m.dispose();});
        else{if(obj.material.map && !(obj.material.userData&&obj.material.userData._sharedAsset))obj.material.map.dispose(); if(!_isSharedAsset(obj))obj.material.dispose();}
      }
    }
  });
  while(scene.children.length>0)scene.remove(scene.children[0]);
  if(scene.background&&scene.background.isTexture && !(scene.background.userData&&scene.background.userData._sharedAsset)){
    scene.background.dispose();
  }
  scene.background=null;
  if(scene.environment&&scene.environment.isTexture && !(scene.environment.userData&&scene.environment.userData._sharedAsset)){
    scene.environment.dispose();
  }
  scene.environment=null;
  if(renderer)renderer.renderLists.dispose();
}

// Dispose the previous scene.background texture to prevent GPU memory leaks on
// world/night/rain toggles — every call-site here assigns the result to scene.background.
function makeSkyTex(top,bot){
  if(scene&&scene.background&&scene.background.isTexture)scene.background.dispose();
  const c=document.createElement('canvas');c.width=2;c.height=512;
  const g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,512);
  gr.addColorStop(0,top);gr.addColorStop(1,bot);g.fillStyle=gr;g.fillRect(0,0,2,512);
  const t=new THREE.CanvasTexture(c);t.needsUpdate=true;return t;
}

// Helper: dispose previous background + return a 1024×512 canvas with vertical
// gradient as base. Per-world sky functions paint on top of this.
function _newSkyCanvas(top,bot){
  if(scene&&scene.background&&scene.background.isTexture)scene.background.dispose();
  const c=document.createElement('canvas');c.width=1024;c.height=512;
  const g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,512);
  gr.addColorStop(0,top);gr.addColorStop(1,bot);g.fillStyle=gr;g.fillRect(0,0,1024,512);
  return {c,g};
}
function _skyTexFromCanvas(c){
  const t=new THREE.CanvasTexture(c);
  // RepeatWrapping on S so updateXxxWorld() can drift the sky horizontally via
  // texture.offset.x. T stays clamped (no vertical wrap of horizon).
  t.wrapS=THREE.RepeatWrapping;
  t.needsUpdate=true;return t;
}

// Space — starfield + soft nebula clouds + distant galaxy band
function makeSpaceSkyTex(){
  const {c,g}=_newSkyCanvas('#000005','#040022');
  // Two soft nebula blobs (blue + magenta)
  const neb1=g.createRadialGradient(280,160,0,280,160,260);
  neb1.addColorStop(0,'rgba(80,40,160,0.55)');neb1.addColorStop(1,'rgba(80,40,160,0)');
  g.fillStyle=neb1;g.fillRect(0,0,1024,512);
  const neb2=g.createRadialGradient(780,260,0,780,260,300);
  neb2.addColorStop(0,'rgba(200,60,140,0.45)');neb2.addColorStop(1,'rgba(200,60,140,0)');
  g.fillStyle=neb2;g.fillRect(0,0,1024,512);
  // Galaxy band (subtle horizontal smear)
  const band=g.createLinearGradient(0,180,0,260);
  band.addColorStop(0,'rgba(120,140,220,0)');
  band.addColorStop(.5,'rgba(180,200,255,0.18)');
  band.addColorStop(1,'rgba(120,140,220,0)');
  g.fillStyle=band;g.fillRect(0,180,1024,80);
  // Stars — 600 small, 40 bright
  for(let i=0;i<600;i++){
    const x=Math.random()*1024,y=Math.random()*420;
    const a=Math.random()*0.7+0.25;
    g.fillStyle=`rgba(255,255,255,${a.toFixed(2)})`;
    g.fillRect(x,y,1,1);
  }
  for(let i=0;i<40;i++){
    const x=Math.random()*1024,y=Math.random()*380;
    const r=Math.random()*1.3+0.8;
    const gr=g.createRadialGradient(x,y,0,x,y,r*4);
    gr.addColorStop(0,'rgba(255,255,255,1)');
    gr.addColorStop(.4,'rgba(200,220,255,0.6)');
    gr.addColorStop(1,'rgba(150,180,255,0)');
    g.fillStyle=gr;g.fillRect(x-r*4,y-r*4,r*8,r*8);
  }
  return _skyTexFromCanvas(c);
}

// Deep sea — light shafts from above + scattered particle dots + dark abyss below
function makeDeepSeaSkyTex(){
  const {c,g}=_newSkyCanvas('#001825','#000a14');
  // Light shafts from surface (top)
  for(let i=0;i<6;i++){
    const x=120+i*150+Math.random()*40;
    const w=80+Math.random()*60;
    const grad=g.createLinearGradient(x,0,x,360);
    grad.addColorStop(0,'rgba(120,200,230,0.32)');
    grad.addColorStop(.5,'rgba(80,160,200,0.12)');
    grad.addColorStop(1,'rgba(0,80,120,0)');
    g.fillStyle=grad;g.beginPath();
    g.moveTo(x-w*.2,0);g.lineTo(x+w*.2,0);g.lineTo(x+w,360);g.lineTo(x-w,360);g.closePath();g.fill();
  }
  // Suspended plankton (small dots)
  for(let i=0;i<300;i++){
    const x=Math.random()*1024,y=80+Math.random()*380;
    const a=Math.random()*0.35+0.1;
    g.fillStyle=`rgba(180,230,255,${a.toFixed(2)})`;
    g.fillRect(x,y,1,1);
  }
  return _skyTexFromCanvas(c);
}

// Candy — pastel with sparkle stars + cotton-candy clouds
function makeCandySkyTex(){
  const {c,g}=_newSkyCanvas('#ff88cc','#ffe4f0');
  // Cotton-candy cloud puffs (white/pink)
  for(let i=0;i<14;i++){
    const x=Math.random()*1024,y=80+Math.random()*220;
    const r=40+Math.random()*70;
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    const tone=Math.random()<0.5?'255,235,250':'255,255,255';
    gr.addColorStop(0,`rgba(${tone},0.85)`);
    gr.addColorStop(1,`rgba(${tone},0)`);
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
  }
  // Sparkles (4-point cross stars)
  for(let i=0;i<60;i++){
    const x=Math.random()*1024,y=Math.random()*300;
    const s=Math.random()*1.5+0.7;
    g.fillStyle='rgba(255,255,255,0.9)';
    g.fillRect(x-s,y-.5,s*2,1);
    g.fillRect(x-.5,y-s,1,s*2);
  }
  return _skyTexFromCanvas(c);
}

// Neon city — distant skyline silhouette + neon haze + scanlines
function makeNeonCitySkyTex(){
  const {c,g}=_newSkyCanvas('#000010','#08001c');
  // Magenta/cyan haze (radial)
  const h1=g.createRadialGradient(300,400,0,300,400,420);
  h1.addColorStop(0,'rgba(180,40,180,0.45)');h1.addColorStop(1,'rgba(180,40,180,0)');
  g.fillStyle=h1;g.fillRect(0,200,1024,312);
  const h2=g.createRadialGradient(780,420,0,780,420,420);
  h2.addColorStop(0,'rgba(40,160,220,0.40)');h2.addColorStop(1,'rgba(40,160,220,0)');
  g.fillStyle=h2;g.fillRect(0,200,1024,312);
  // Distant skyline silhouette
  g.fillStyle='#000005';
  let x=0;
  while(x<1024){
    const w=20+Math.random()*60;
    const h=60+Math.random()*180;
    g.fillRect(x,512-h,w,h);
    // Window grid (small)
    g.fillStyle=Math.random()<0.5?'rgba(255,180,80,0.55)':'rgba(120,200,255,0.55)';
    for(let wy=512-h+8;wy<512-8;wy+=10){
      for(let wx=x+3;wx<x+w-3;wx+=6){
        if(Math.random()<0.45)g.fillRect(wx,wy,2,3);
      }
    }
    g.fillStyle='#000005';
    x+=w+1;
  }
  // Stars high up
  for(let i=0;i<150;i++){
    const sx=Math.random()*1024,sy=Math.random()*200;
    g.fillStyle=`rgba(180,200,255,${(Math.random()*0.5+0.25).toFixed(2)})`;
    g.fillRect(sx,sy,1,1);
  }
  return _skyTexFromCanvas(c);
}

// Volcano — ember haze + smoke clouds + dim red glow on horizon
function makeVolcanoSkyTex(){
  const {c,g}=_newSkyCanvas('#1a0008','#2a0810');
  // Red horizon glow (bottom)
  const glow=g.createLinearGradient(0,300,0,512);
  glow.addColorStop(0,'rgba(255,80,20,0)');
  glow.addColorStop(.6,'rgba(220,60,10,0.35)');
  glow.addColorStop(1,'rgba(180,40,0,0.55)');
  g.fillStyle=glow;g.fillRect(0,300,1024,212);
  // Smoke clouds
  for(let i=0;i<10;i++){
    const x=Math.random()*1024,y=120+Math.random()*200;
    const r=80+Math.random()*100;
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,'rgba(40,20,15,0.6)');
    gr.addColorStop(1,'rgba(40,20,15,0)');
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
  }
  // Embers (orange specks)
  for(let i=0;i<120;i++){
    const x=Math.random()*1024,y=180+Math.random()*320;
    const a=Math.random()*0.7+0.3;
    g.fillStyle=`rgba(255,${(120+Math.random()*80)|0},${(20+Math.random()*40)|0},${a.toFixed(2)})`;
    g.fillRect(x,y,1,1);
  }
  return _skyTexFromCanvas(c);
}

// Arctic — aurora bands (green/violet) + ice fog + faint stars
function makeArcticSkyTex(){
  const {c,g}=_newSkyCanvas('#0a1830','#a8c8e0');
  // Aurora bands (green + violet, slightly curved via offset)
  for(let band=0;band<3;band++){
    const baseY=80+band*40+Math.random()*30;
    const color=band===0?'rgba(80,255,180,':band===1?'rgba(140,90,255,':'rgba(60,200,255,';
    g.save();
    for(let x=0;x<1024;x+=2){
      const wob=Math.sin(x*0.012+band*1.7)*30;
      const y=baseY+wob;
      const grad=g.createLinearGradient(x,y-50,x,y+50);
      grad.addColorStop(0,color+'0)');
      grad.addColorStop(.5,color+(0.35-band*0.07).toFixed(2)+')');
      grad.addColorStop(1,color+'0)');
      g.fillStyle=grad;g.fillRect(x,y-50,2,100);
    }
    g.restore();
  }
  // Stars (sparse, only top)
  for(let i=0;i<80;i++){
    const x=Math.random()*1024,y=Math.random()*100;
    g.fillStyle=`rgba(220,230,255,${(Math.random()*0.5+0.3).toFixed(2)})`;
    g.fillRect(x,y,1,1);
  }
  // Distant snow fog at horizon
  const fog=g.createLinearGradient(0,360,0,512);
  fog.addColorStop(0,'rgba(220,235,250,0)');
  fog.addColorStop(1,'rgba(220,235,250,0.45)');
  g.fillStyle=fog;g.fillRect(0,360,1024,152);
  return _skyTexFromCanvas(c);
}

// Theme park — sunset gradient + soft cloud puffs + early stars + lit horizon
function makeThemeparkSkyTex(){
  const {c,g}=_newSkyCanvas('#2a0844','#ff8844');
  // Soft sunset clouds (orange/purple)
  for(let i=0;i<12;i++){
    const x=Math.random()*1024,y=120+Math.random()*220;
    const r=60+Math.random()*90;
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    const tone=Math.random()<0.5?'255,140,80':'180,80,140';
    gr.addColorStop(0,`rgba(${tone},0.5)`);
    gr.addColorStop(1,`rgba(${tone},0)`);
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
  }
  // Faint horizon glow
  const glow=g.createLinearGradient(0,380,0,512);
  glow.addColorStop(0,'rgba(255,180,100,0)');
  glow.addColorStop(1,'rgba(255,180,100,0.4)');
  g.fillStyle=glow;g.fillRect(0,380,1024,132);
  // Early stars (top, sparse)
  for(let i=0;i<40;i++){
    const x=Math.random()*1024,y=Math.random()*120;
    g.fillStyle=`rgba(255,240,200,${(Math.random()*0.4+0.3).toFixed(2)})`;
    g.fillRect(x,y,1,1);
  }
  return _skyTexFromCanvas(c);
}

// Grand Prix — soft cloud-streaks + warm sun glow on right
function makeGPSkyTex(){
  const {c,g}=_newSkyCanvas('#1e5292','#b8d8ee');
  // Soft sun (right)
  const sun=g.createRadialGradient(820,140,0,820,140,200);
  sun.addColorStop(0,'rgba(255,240,200,0.65)');
  sun.addColorStop(.4,'rgba(255,220,160,0.25)');
  sun.addColorStop(1,'rgba(255,220,160,0)');
  g.fillStyle=sun;g.fillRect(0,0,1024,400);
  // Stretched cloud streaks
  for(let i=0;i<10;i++){
    const x=Math.random()*1024,y=80+Math.random()*220;
    const w=120+Math.random()*180,h=18+Math.random()*22;
    const gr=g.createRadialGradient(x,y,0,x,y,w);
    gr.addColorStop(0,'rgba(255,255,255,0.8)');
    gr.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=gr;
    g.save();g.translate(x,y);g.scale(1,h/w);g.beginPath();g.arc(0,0,w,0,Math.PI*2);g.fill();g.restore();
  }
  return _skyTexFromCanvas(c);
}

function buildScene(){
  window.dbg&&dbg.log('scene','buildScene start — world='+activeWorld);
  disposeScene();
  // ── Swap TRACK_WP data for active world ───────────────────────
  {const src=(_TRACKS&&_TRACKS[activeWorld])||_GP_WP;
   TRACK_WP.length=0;src.forEach(wp=>TRACK_WP.push(wp));}
  // ── Reset global arrays populated during scene build ──────────
  trackLightList.length=0;trackPoles.length=0;_trackFlags.length=0;_aiHeadPool.length=0;
  jumpRamps.length=0;spinPads.length=0;boostPads.length=0;collectibles.length=0;skidMarks.length=0;
  // Shared skid geometry was disposed by the traversal above — drop our reference so the next race builds a fresh one.
  if(typeof _skidGeo!=='undefined')_skidGeo=null;
  _wpWaterPuddles.length=0;_wpDrsZones.length=0;
  _wpGravityZones.length=0;_wpOrbitAsteroids.length=0;_wpWarpTunnels.length=0;
  _wpCurrentStreams.length=0;_wpAbyssCracks.length=0;_wpTreasureTrail.length=0;
  _drsActive=false;_drsTimer=0;_drsBoostUsed=false;
  stars=null;plHeadL=null;plHeadR=null;plTail=null;
  _boostLight=null;_trackMesh=null;_sunBillboard=null;
  _spaceAsteroids.length=0;_spaceDustParticles=null;_spaceDustGeo=null;
  _snowParticles=null;_snowGeo=null;
  _spaceGravityWells.length=0;_spaceRailguns.length=0;
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
  const isVolcano=activeWorld==='volcano';
  const isArctic=activeWorld==='arctic';
  scene=new THREE.Scene();
  // Fog color is matched to the skybox horizon (sky-bottom gradient stop) per world,
  // so fogged distant geometry blends seamlessly into the sky instead of producing a
  // visible "kleurverschil" band where the fogged scene meets the skybox.
  // Day/Night fog colors mirror toggleNight()'s skybox swaps so updateSky's lerp
  // never drifts to a wrong-world fog color (e.g. light-blue fog in the volcano).
  if(isSpace){
    scene.background=makeSpaceSkyTex();
    scene.fog=new THREE.FogExp2(0x010018,.0014);
    _fogColorDay.setHex(0x080045);_fogColorNight.setHex(0x010018);
  }else if(isDeepSea){
    scene.background=makeDeepSeaSkyTex();
    scene.fog=new THREE.FogExp2(0x003355,.0017);
    _fogColorDay.setHex(0x003355);_fogColorNight.setHex(0x00101a);
  }else if(isCandy){
    scene.background=makeCandySkyTex();
    scene.fog=new THREE.FogExp2(0xffe4f0,.0015);
    _fogColorDay.setHex(0xffe4f0);_fogColorNight.setHex(0x280038);
  }else if(isNeon){
    scene.background=makeNeonCitySkyTex();
    scene.fog=new THREE.FogExp2(0x030012,.0017);
    _fogColorDay.setHex(0x080025);_fogColorNight.setHex(0x030012);
  }else if(isThemepark){
    scene.background=makeThemeparkSkyTex();
    scene.fog=new THREE.FogExp2(0xff8844,.0015);
    _fogColorDay.setHex(0xff8844);_fogColorNight.setHex(0x3a0e22);
  }else if(isVolcano){
    // Volcano keeps its procedural ember-haze sky in both modes — fog matches
    // the rusty horizon glow at the bottom of the canvas (~rgba(180,40,0)
    // composited over #2a0810) so distant lava-rock fades into the sky band.
    scene.background=makeVolcanoSkyTex();
    scene.fog=new THREE.FogExp2(0x6a1808,.002);
    _fogColorDay.setHex(0x6a1808);_fogColorNight.setHex(0x6a1808);
  }else if(isArctic){
    scene.background=makeArcticSkyTex();
    scene.fog=new THREE.FogExp2(0x1a3050,.0035);
    _fogColorDay.setHex(0x1a3050);_fogColorNight.setHex(0x0a1828);
  }else{
    scene.background=makeGPSkyTex();
    scene.fog=new THREE.FogExp2(0xb8d8ee,.0017);
    _fogColorDay.setHex(0xb8d8ee);_fogColorNight.setHex(0x030d1e);
  }
  // Per-world color grading + vignette in postfx composite.
  if(typeof setWorldGrading==='function')setWorldGrading(activeWorld);
  // Per-world bloom strength multiplier (Candy/Themepark have many emissives
  // packed close together — full strength bleeds across the narrow track).
  if(typeof setBloomWorld==='function')setBloomWorld(activeWorld);
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
    buildMountains();buildBackgroundLayers();buildLake();
    buildGravelTraps();buildEnvironmentTrees();
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
  // Apply any cached HDRI / PBR ground textures from window.Assets. No-op
  // if the manifest has no slots filled or preload hasn't completed yet —
  // boot.js + select.js re-call maybeUpgradeWorld when preload resolves.
  if(typeof maybeUpgradeWorld==='function')maybeUpgradeWorld(activeWorld);
  window.dbg&&dbg.snapshot('scene','buildScene done',{world:activeWorld,objects:scene.children.length,camPos:camera.position});
}
