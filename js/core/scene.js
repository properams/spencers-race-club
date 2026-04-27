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

function disposeScene(){if(!scene)return;scene.traverse(obj=>{if(obj.isMesh||obj.isPoints||obj.isLine){if(obj.geometry)obj.geometry.dispose();if(obj.material){if(Array.isArray(obj.material))obj.material.forEach(m=>{if(m.map)m.map.dispose();m.dispose();});else{if(obj.material.map)obj.material.map.dispose();obj.material.dispose();}}}});while(scene.children.length>0)scene.remove(scene.children[0]);if(scene.background&&scene.background.isTexture){scene.background.dispose();scene.background=null;}if(scene.environment&&scene.environment.isTexture){scene.environment.dispose();scene.environment=null;}if(renderer)renderer.renderLists.dispose();}

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
  window.dbg&&dbg.log('scene','buildScene start — world='+activeWorld);
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
  window.dbg&&dbg.snapshot('scene','buildScene done',{world:activeWorld,objects:scene.children.length,camPos:camera.position});
}
