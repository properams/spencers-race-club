// js/core/scene.js — scene disposal + sky textures + hoofd buildScene().
// Non-module script, geladen vóór main.js.
//
// Afhankelijkheden (script-globals, grotendeels in main.js gedeclareerd):
//   renderer, scene, camera, camPos, mirrorCamera, clock
//   sunLight, ambientLight, hemiLight
//   activeWorld, _TRACKS, _DEFAULT_WP, TRACK_WP
//   trackLightList, trackPoles, _trackFlags, _aiHeadPool
//   jumpRamps, spinPads, boostPads, collectibles, skidMarks
//   stars, plHeadL, plHeadR, plTail, _boostLight, _trackMesh, _sunBillboard
//   _wp*
//   _space*, _kelp*, _jellyfish*, _dsa*, _sprinkle*, _gummy*, _gum*, _candy*,
//   _choco*, _neon*, _holo*, _volcano*, _arctic*, _tp*
//   _snowParticles, _snowGeo, _fogColorDay, _fogColorNight
//   _mmBounds, isDark
//
// Externe builders (non-module scripts): buildTrack, buildSpaceEnvironment,
// buildDeepSeaEnvironment, buildCandyEnvironment, buildNeonCityEnvironment,
// buildVolcanoEnvironment, buildArcticEnvironment, buildThemeparkEnvironment,
// buildGround, buildClouds, buildBarriers, buildGantry, buildMountains,
// buildLake, buildGravelTraps, buildNightObjects,
// buildSpectators, buildSunBillboard, buildAdvertisingBoards,
// buildCornerBoards, buildTrackFlags, buildJumpRamps,
// buildCenterlineArrows, buildSpinPads, buildBoostPads, buildCollectibles,
// buildWorldElements, buildParticles, buildGhostMesh, initSpeedLines,
// initRain, toggleNight.

'use strict';

// Asset-cached textures (HDRI envMap, PBR ground maps, GLTF instance maps)
// carry userData._sharedAsset=true; disposeScene must skip these or the
// next build pulls a disposed handle from window.Assets cache. Each layer
// — mesh, material, map — is checked independently because a private
// material can still wrap a shared texture (e.g. cloned headlight beam
// material wrapping the cached alpha-mask).
function _shared(x){ return !!(x && x.userData && x.userData._sharedAsset); }

// World-classification helper. The "void worlds" — space and deepsea —
// share fall-into-void mechanics: off-track triggers a fall+rescue
// sequence instead of a recovery-circle, gravity is reduced, and the
// soft-wall track-edge collision is skipped (you're meant to be able to
// fly off into the void). The pair appears together in 3 places across
// the codebase (wall-collision.js, collectibles.js, night.js sun-billboard
// gate); centralising the check here means a future third void world
// only needs to be added in one place.
function _isVoidWorld(world){
  return world === 'space' || world === 'deepsea';
}

// Single source of truth for Grand Prix day lighting. Mirrors the cross-
// world helper pattern (sandstorm/candy/volcano/arctic/themepark) — the
// default-world buildScene block + night.js default GP-day branch share
// the same constants. GP has no dedicated world.js file so the helper
// lives here in scene.js alongside _isVoidWorld.
//
// Goal palette (clean blue-sky circuit):
//   sun #fff5e0 (warm white) / 1.65
//   ambient #88aacc (cool blue) / 0.50
//   hemi sky #9bbfdd / ground #4a7a3d (grass) / 0.36
// Values match the scene.js per-world cascade else-branch — this helper
// is the consistency refactor.
function _applyGrandPrixDayLighting(){
  if(typeof sunLight==='undefined' || !sunLight) return;
  if(typeof ambientLight==='undefined' || !ambientLight) return;
  if(typeof hemiLight==='undefined' || !hemiLight) return;
  sunLight.color.setHex(0xfff5e0); sunLight.intensity=1.65;
  ambientLight.color.setHex(0x88aacc); ambientLight.intensity=.50;
  hemiLight.color.setHex(0x9bbfdd);
  hemiLight.groundColor.setHex(0x4a7a3d);
  hemiLight.intensity=.36;
}
if(typeof window!=='undefined')window._applyGrandPrixDayLighting=_applyGrandPrixDayLighting;
// Alle texture-slots die op een r134 MeshPhysicalMaterial kunnen voorkomen.
// _disposeMat itereert deze lijst zodat per-instance physical materials uit
// Phase 2/3 (transmission lenses, Tesla glass roof, Mustang stripe-canvas)
// niet hun texture-uploads lekken bij world-switch. Shared textures
// (userData._sharedAsset) worden overgeslagen — zo overleven de procedurele
// envMap, _carbonTex en _softHeadlightTex de rebuild.
const _MAT_TEX_SLOTS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
  'emissiveMap', 'bumpMap', 'displacementMap', 'alphaMap', 'lightMap',
  'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap',
  'transmissionMap', 'thicknessMap', 'envMap'
];
function _disposeMat(m){
  if (!m) return;
  for (let i=0; i<_MAT_TEX_SLOTS.length; i++){
    const k = _MAT_TEX_SLOTS[i];
    const t = m[k];
    if (!t || _shared(t)) continue;
    if (typeof t.dispose !== 'function'){
      // Slot bevat geen Texture-object — kan ontstaan als toekomstige three-
      // upgrades een slot-naam hergebruiken voor een ander type (bv. r136+
      // sheenColor werd Color i.p.v. number). Defensieve skip i.p.v. crash.
      if (window.dbg) dbg.warn('cars','non-Texture in material slot: '+k);
      else if (typeof console !== 'undefined') console.warn('non-Texture in material slot:', k);
      continue;
    }
    t.dispose();
  }
  if (!_shared(m)) m.dispose();
}
function disposeScene(){
  if(!scene)return;
  scene.traverse(obj=>{
    if(obj.isMesh||obj.isPoints||obj.isLine||obj.isSprite){
      // For InstancedMesh, the per-instance buffers (instanceMatrix,
      // instanceColor) are unique to this mesh even if its geometry is
      // shared. Three r134 has no InstancedMesh.dispose(); freeing the
      // GPU buffers happens via geometry.dispose() — so we cannot share
      // InstancedMesh geometry. Safe-guard: trees/props clone geometry
      // per spawn. If a future caller forgets, we still dispose private
      // geometries; shared GLTF geometry stays alive in the asset cache.
      if(obj.geometry && !_shared(obj.geometry)) obj.geometry.dispose();
      if(obj.material){
        if(Array.isArray(obj.material)) obj.material.forEach(_disposeMat);
        else _disposeMat(obj.material);
      }
    }
  });
  while(scene.children.length>0)scene.remove(scene.children[0]);
  // Reset _crowdMaterials hier ook (defense-in-depth): buildTrack() doet
  // dit ook al, maar als buildSpectators voor de actieve wereld vroeg
  // returned (zoals nu voor GP) en buildTrack-volgorde ooit verandert,
  // blijven de materials in disposeScene gegarandeerd geleegd. Anders
  // zou updateCrowd() naar disposed CanvasTextures schrijven.
  if(typeof _crowdMaterials!=='undefined')_crowdMaterials.length=0;
  if(scene.background&&scene.background.isTexture && !_shared(scene.background)) scene.background.dispose();
  scene.background=null;
  if(scene.environment&&scene.environment.isTexture && !_shared(scene.environment)) scene.environment.dispose();
  scene.environment=null;
  if(renderer)renderer.renderLists.dispose();
  // ProcTextures helper-cache — flush on every world-switch so cached
  // canvas-textures (sphinx sandstone, cliff strata, palm-leaf alpha)
  // don't accumulate across rebuilds. The next buildScene that needs
  // them will re-render the canvas (~1ms per generator). Cheap insurance
  // against the LRU growing past its 60-entry-per-generator cap.
  if(window.ProcTextures&&typeof ProcTextures.disposeAll==='function')ProcTextures.disposeAll();
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

// Procedural envMap fallback voor MeshPhysicalMaterial.clearcoat reflecties.
// HDRI-loader bestaat (assets/loader.js + effects/asset-bridge.js) maar er
// staan momenteel geen .hdr/.exr assets op disk; scene.environment blijft
// dus null tenzij we hier zelf een fallback bouwen. Eén PMREM-cubemap voor
// alle worlds — per-world skybox blijft scene.background; alleen het
// reflectie-env is gedeeld. Cached forever (één call gebruikt ~5 MB GPU).
let _proceduralEnv=null;
function _buildProceduralEnvMap(){
  if(_proceduralEnv) return _proceduralEnv;
  if(!renderer || typeof THREE.PMREMGenerator!=='function'){
    if(window.dbg) dbg.warn('scene','procedural envMap skipped — renderer or PMREMGenerator unavailable');
    return null;
  }
  const W=512,H=256;
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d');
  // Sky→horizon→ground gradient. Geen wereld-specifieke kleuren — dit is de
  // generieke "auto staat in een ruimte met sky+grond" reflectie. Werelden
  // krijgen hun eigen background via make<World>SkyTex().
  const grad=g.createLinearGradient(0,0,0,H);
  grad.addColorStop(0.00,'#aac4dc'); // sky
  grad.addColorStop(0.50,'#dcd4cc'); // horizon haze
  grad.addColorStop(0.55,'#807468'); // soft horizon line
  grad.addColorStop(1.00,'#3a3a3a'); // ground
  g.fillStyle=grad;g.fillRect(0,0,W,H);
  // Sun hotspot — zonder een lokaal-fel-punt geeft de gradient alleen een
  // zachte ambient-reflectie en blijft clearcoat onmerkbaar op een chase-cam
  // achteraanzicht. Een radiale highlight in het bovenste derde van de
  // equirect map zorgt voor een scherp specular spotje dat met de car-
  // oriëntatie meebeweegt — het "wet paint" effect dat clearcoat hoort te
  // produceren. Twee kleinere secundaire hotspots zorgen dat de auto vanuit
  // élke hoek een hint van reflectie pakt (anders alleen wanneer de camera
  // toevallig de zon recht ziet).
  const sun=g.createRadialGradient(W*0.28,H*0.22,0,W*0.28,H*0.22,H*0.42);
  sun.addColorStop(0.0,'rgba(255,250,230,1.00)');
  sun.addColorStop(0.25,'rgba(255,240,200,0.55)');
  sun.addColorStop(1.0,'rgba(255,240,200,0.00)');
  g.fillStyle=sun;g.fillRect(0,0,W,H);
  const sun2=g.createRadialGradient(W*0.74,H*0.30,0,W*0.74,H*0.30,H*0.30);
  sun2.addColorStop(0.0,'rgba(240,235,255,0.40)');
  sun2.addColorStop(1.0,'rgba(240,235,255,0.00)');
  g.fillStyle=sun2;g.fillRect(0,0,W,H);
  const tex=new THREE.CanvasTexture(c);
  tex.mapping=THREE.EquirectangularReflectionMapping;
  tex.needsUpdate=true;
  let envMap=null;
  try{
    const pmrem=new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    envMap=pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
  }catch(e){
    if(window.dbg) dbg.error('scene',e,'procedural envMap build failed');
    else console.error('procedural envMap build failed',e);
  }
  tex.dispose();
  if(envMap){
    envMap.userData=envMap.userData||{};
    envMap.userData._sharedAsset=true;
    if(window.dbg) dbg.log('scene','procedural envMap built — '+W+'×'+H+' equirect → PMREM cube');
  }
  _proceduralEnv=envMap;
  return envMap;
}
// Geëxposeerd zodat ui/select.js (en eventuele toekomstige off-screen
// preview-scenes) dezelfde envMap kunnen gebruiken voor clearcoat-reflecties.
// De buildScene-aanroeppath werkt onafhankelijk van deze export.
window._buildProceduralEnvMap=_buildProceduralEnvMap;

// Per-world envMap — gebruikt het bestaande make<World>SkyTex() canvas als
// equirectangular bron en runt PMREM erover voor cubemap-reflecties.
// Skybox canvases zijn 1024×512 (of 512×256 op mobile) = 2:1 ratio = al
// equirect-compatible. Cars sampelen scene.environment en krijgen daardoor
// per-wereld thematische reflecties: sun-spot op GP, neon haze op NeonCity,
// ember glow op Volcano, aurora op Arctic, etc. Veel rijker dan de
// generieke procedural gradient.
//
// Niet gecached per-world: rebuild bij elke world-switch (PMREM ~50ms,
// acceptabel binnen de ~500ms world-switch budget). Cubemap krijgt GEEN
// _sharedAsset flag, zodat disposeScene'm bij de volgende switch netjes
// vrijgeeft. Procedural env blijft als fallback wanneer PMREM faalt.
function _buildWorldEnvFromSky(skytex){
  if(!renderer || typeof THREE.PMREMGenerator!=='function' || !skytex || !skytex.image){
    return null;
  }
  // Wrap dezelfde canvas (skytex.image) als equirect-projectie texture.
  // Geen pixel-copy nodig — alleen een tweede THREE.CanvasTexture wrapper
  // met andere mapping. PMREM kopieert pixels naar GPU cubemap-faces.
  const equirect=new THREE.CanvasTexture(skytex.image);
  equirect.mapping=THREE.EquirectangularReflectionMapping;
  equirect.needsUpdate=true;
  let envMap=null;
  try{
    const pmrem=new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    envMap=pmrem.fromEquirectangular(equirect).texture;
    pmrem.dispose();
  }catch(e){
    if(window.dbg) dbg.error('scene',e,'world envMap build failed');
    else console.error('world envMap build failed',e);
  }
  equirect.dispose();
  if(envMap && window.dbg){
    dbg.log('scene','world envMap built — '+activeWorld+' skybox → PMREM cube');
  }
  return envMap;
}

// Helper: dispose previous background + return a sky canvas with vertical
// gradient as base. Per-world sky functions paint on top of this.
// Mobile gebruikt een halve fysieke resolutie (512×256) maar context.scale
// past het 1024×512 logische coordinatensysteem toe — alle per-world sky
// functies kunnen ongewijzigd in de oorspronkelijke ruimte blijven tekenen.
// Bespaart ~1.5MB GPU per skybox, materiële winst over 8 worlds.
// Phase 1 bevinding 1.1: sky textures waren overal 1024×512 zonder mobile cap.
function _newSkyCanvas(top,bot){
  if(scene&&scene.background&&scene.background.isTexture)scene.background.dispose();
  const _scale=window._isMobile?0.5:1;
  const c=document.createElement('canvas');
  c.width=Math.round(1024*_scale);c.height=Math.round(512*_scale);
  const g=c.getContext('2d');
  if(_scale!==1)g.scale(_scale,_scale);
  const gr=g.createLinearGradient(0,0,0,512);
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
    g.fillRect(x,y,2,2);
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
    g.fillRect(x,y,2,2);
  }
  return _skyTexFromCanvas(c);
}

// Candy — 4-stop pastel gradient (deep pink zenith → mint mid → cream
// horizon → soft lilac foot) with cotton-candy cloud puffs. Visual-polish
// pass mirrors sandstorm V2: rich layered gradient instead of single pink
// fade, soft clouds backed by horizon glow. The candy-bit sparkle field
// painted by the older version is dropped — the night skybox owns sparkles
// (see makeCandyNightSkyTex), the day skybox is intentionally smoother
// for a sun-drenched-pastel mood.
function makeCandySkyTex(){
  // Two-stop bg = zenith → mid. Lower bands painted on top for the 4-stop
  // gradient feel without altering _newSkyCanvas.
  const {c,g}=_newSkyCanvas('#ff5fb4','#7fffd4');
  // Mid-band mint → cream horizon transition.
  const midBand=g.createLinearGradient(0,260,0,420);
  midBand.addColorStop(0,'rgba(127,255,212,0)');
  midBand.addColorStop(.5,'rgba(255,220,200,0.55)');
  midBand.addColorStop(1,'rgba(255,240,214,0.85)');
  g.fillStyle=midBand;g.fillRect(0,260,1024,160);
  // Cream → soft lilac foot. Picks up the fog-color so the seam between
  // fogged distant geometry and skybox is invisible.
  const foot=g.createLinearGradient(0,410,0,512);
  foot.addColorStop(0,'rgba(255,240,214,0.85)');
  foot.addColorStop(1,'rgba(217,179,255,1)');
  g.fillStyle=foot;g.fillRect(0,410,1024,102);
  // Cotton-candy cloud puffs — white + pink at zenith, fewer toward
  // horizon so the cream glow stays clean. Soft radial gradients.
  for(let i=0;i<14;i++){
    const x=Math.random()*1024;
    const y=70+Math.random()*220;
    const r=50+Math.random()*70;
    const tone=Math.random()<0.5?'255,235,250':'255,255,255';
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,`rgba(${tone},0.78)`);
    gr.addColorStop(1,`rgba(${tone},0)`);
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
  }
  // Subtle horizon-line cream-pink glow strip, picks up sun warmth.
  const horizGlow=g.createLinearGradient(0,360,0,440);
  horizGlow.addColorStop(0,'rgba(255,200,220,0)');
  horizGlow.addColorStop(.5,'rgba(255,200,220,0.22)');
  horizGlow.addColorStop(1,'rgba(255,200,220,0)');
  g.fillStyle=horizGlow;g.fillRect(0,360,1024,80);
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
    g.fillRect(sx,sy,2,2);
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
    g.fillRect(x,y,2,2);
  }
  return _skyTexFromCanvas(c);
}

// Grand Prix NIGHT — straightforward dark-blue track-night. Stars +
// modest moon. Per spec the most subdued of the cross-world night
// upgrades: GP is the "default" world, environment shouldn't compete
// with the on-track action.
function makeGrandPrixNightSkyTex(){
  const {c,g}=_newSkyCanvas('#0a1426','#162842');
  // Sparse zenith-weighted stars.
  const STAR_COUNT=window._isMobile?60:140;
  for(let i=0;i<STAR_COUNT;i++){
    const x=Math.random()*1024;
    const y=Math.pow(Math.random(),1.6)*300;
    const a=(0.45+Math.random()*0.5).toFixed(2);
    g.fillStyle=`rgba(220,228,250,${a})`;
    g.fillRect(x,y,1,1);
  }
  // Subtle horizon glow — distant city/track lights, very low contrast.
  const glow=g.createLinearGradient(0,400,0,512);
  glow.addColorStop(0,'rgba(80,110,170,0)');
  glow.addColorStop(1,'rgba(80,110,170,0.35)');
  g.fillStyle=glow;g.fillRect(0,400,1024,112);
  // Modest moon, upper-right, nothing flashy.
  const moonCx=730,moonCy=130,moonR=32;
  const halo=g.createRadialGradient(moonCx,moonCy,moonR*0.5,moonCx,moonCy,moonR*2.2);
  halo.addColorStop(0,'rgba(225,232,250,0.40)');
  halo.addColorStop(1,'rgba(225,232,250,0)');
  g.fillStyle=halo;g.fillRect(moonCx-moonR*2.2,moonCy-moonR*2.2,moonR*4.4,moonR*4.4);
  const disc=g.createRadialGradient(moonCx-moonR*0.25,moonCy-moonR*0.25,0, moonCx,moonCy,moonR);
  disc.addColorStop(0,'rgba(248,250,255,1)');
  disc.addColorStop(1,'rgba(210,218,235,0.92)');
  g.fillStyle=disc;g.beginPath();g.arc(moonCx,moonCy,moonR,0,Math.PI*2);g.fill();
  return _skyTexFromCanvas(c);
}

// Themepark NIGHT — carnival blues + warm fairground-light reflections
// at horizon. Day is sunset-toned; night drops to deep blue with a
// dramatic strip of carnival-light glow (yellow + pink + cyan) along
// the lower band. PMREM env paints lacquer with that warm carnival-glow
// from below.
function makeThemeparkNightSkyTex(){
  const {c,g}=_newSkyCanvas('#0a0a26','#1a1438');
  // Carnival-light strip at horizon — alternating warm + cool blobs simulate
  // distant ferris-wheel/carousel glow. Very saturated.
  const stripY=380;
  for(let i=0;i<14;i++){
    const x=Math.random()*1024;
    const r=70+Math.random()*60;
    const tones=['255,180,80','255,90,180','120,200,255','255,220,80','220,110,255'];
    const tone=tones[Math.floor(Math.random()*tones.length)];
    const gr=g.createRadialGradient(x,stripY,0,x,stripY,r);
    gr.addColorStop(0,`rgba(${tone},0.55)`);
    gr.addColorStop(1,`rgba(${tone},0)`);
    g.fillStyle=gr;g.fillRect(x-r,stripY-r,r*2,r*2);
  }
  // Stars — sparser than candy, emphasis on zenith.
  const STAR_COUNT=window._isMobile?60:140;
  for(let i=0;i<STAR_COUNT;i++){
    const x=Math.random()*1024;
    const y=Math.pow(Math.random(),1.7)*280;
    const a=(0.5+Math.random()*0.5).toFixed(2);
    g.fillStyle=`rgba(220,225,255,${a})`;
    g.fillRect(x,y,1,1);
  }
  // Soft moon, upper-right.
  const moonCx=720,moonCy=110,moonR=36;
  const halo=g.createRadialGradient(moonCx,moonCy,moonR*0.5,moonCx,moonCy,moonR*2.4);
  halo.addColorStop(0,'rgba(245,235,210,0.45)');
  halo.addColorStop(1,'rgba(245,235,210,0)');
  g.fillStyle=halo;g.fillRect(moonCx-moonR*2.4,moonCy-moonR*2.4,moonR*4.8,moonR*4.8);
  const disc=g.createRadialGradient(moonCx-moonR*0.25,moonCy-moonR*0.25,0, moonCx,moonCy,moonR);
  disc.addColorStop(0,'rgba(255,250,235,1)');
  disc.addColorStop(1,'rgba(220,210,195,0.92)');
  g.fillStyle=disc;g.beginPath();g.arc(moonCx,moonCy,moonR,0,Math.PI*2);g.fill();
  return _skyTexFromCanvas(c);
}

// Candy NIGHT — glow-in-the-dark wonderland. Deep-purple/magenta zenith
// with dense pastel sparkle-stars, soft moon, sugary horizon glow. PMREM
// env paints lacquer with playful pink/violet reflections.
function makeCandyNightSkyTex(){
  const {c,g}=_newSkyCanvas('#1a0a2e','#3a0e54');
  // Sugary horizon glow — pink/violet rising from bottom.
  const glow=g.createLinearGradient(0,300,0,512);
  glow.addColorStop(0,'rgba(255,100,200,0)');
  glow.addColorStop(.6,'rgba(255,120,200,0.30)');
  glow.addColorStop(1,'rgba(220,90,180,0.55)');
  g.fillStyle=glow;g.fillRect(0,300,1024,212);
  // Sparse magenta + cyan haze blobs (like cotton-candy clouds at night).
  for(let i=0;i<10;i++){
    const x=Math.random()*1024,y=140+Math.random()*200;
    const r=80+Math.random()*100;
    const tone=Math.random()<0.5?'255,140,220':'180,140,255';
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,`rgba(${tone},0.30)`);
    gr.addColorStop(1,`rgba(${tone},0)`);
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
  }
  // Sparkle-stars — pastel tones (white + pink + cyan), denser than other
  // worlds because candy = bling. Slightly larger size variation for
  // "sparkle" feel.
  const STAR_COUNT=window._isMobile?100:240;
  for(let i=0;i<STAR_COUNT;i++){
    const x=Math.random()*1024;
    const y=Math.pow(Math.random(),1.4)*340;
    const r=Math.random();
    const tone=r<0.6?'255,255,255': r<0.85?'255,200,235':'200,235,255';
    const a=(0.5+Math.random()*0.5).toFixed(2);
    const sz=r<0.85?1: r<0.97?1.5:2.5;
    g.fillStyle=`rgba(${tone},${a})`;
    g.fillRect(x,y,sz,sz);
  }
  // Soft pink moon, upper-left, with extra-wide halo (matches the world's
  // dreamy pastel feel).
  const moonCx=240,moonCy=120,moonR=38;
  const halo=g.createRadialGradient(moonCx,moonCy,moonR*0.5,moonCx,moonCy,moonR*3);
  halo.addColorStop(0,'rgba(255,220,240,0.50)');
  halo.addColorStop(.5,'rgba(255,180,220,0.18)');
  halo.addColorStop(1,'rgba(255,180,220,0)');
  g.fillStyle=halo;g.fillRect(moonCx-moonR*3,moonCy-moonR*3,moonR*6,moonR*6);
  const disc=g.createRadialGradient(moonCx-moonR*0.25,moonCy-moonR*0.25,0, moonCx,moonCy,moonR);
  disc.addColorStop(0,'rgba(255,250,250,1)');
  disc.addColorStop(1,'rgba(245,220,235,0.92)');
  g.fillStyle=disc;g.beginPath();g.arc(moonCx,moonCy,moonR,0,Math.PI*2);g.fill();
  return _skyTexFromCanvas(c);
}

// NeonCity NIGHT — saturated cyberpunk sky. Day already night-themed,
// but the PMREM env was the day skybox, so cars reflected static neon
// haze. Night-version intensifies the magenta/cyan glows, adds a distant
// city-light halo, and (per spec) skips stars — light pollution dominates.
function makeNeonCityNightSkyTex(){
  const {c,g}=_newSkyCanvas('#02000c','#06001c');
  // Stronger magenta + cyan haze (saturation cranked vs day).
  const h1=g.createRadialGradient(280,420,0,280,420,460);
  h1.addColorStop(0,'rgba(220,50,200,0.65)');h1.addColorStop(1,'rgba(220,50,200,0)');
  g.fillStyle=h1;g.fillRect(0,180,1024,332);
  const h2=g.createRadialGradient(800,440,0,800,440,460);
  h2.addColorStop(0,'rgba(50,200,255,0.55)');h2.addColorStop(1,'rgba(50,200,255,0)');
  g.fillStyle=h2;g.fillRect(0,180,1024,332);
  // Distant city-glow halo (broad horizon-line warm light pollution band).
  const halo=g.createLinearGradient(0,300,0,440);
  halo.addColorStop(0,'rgba(255,140,200,0)');
  halo.addColorStop(.4,'rgba(255,140,200,0.12)');
  halo.addColorStop(1,'rgba(180,80,160,0)');
  g.fillStyle=halo;g.fillRect(0,300,1024,140);
  // Distant skyline silhouette + lit windows (more density than day).
  g.fillStyle='#000003';
  let x=0;
  while(x<1024){
    const w=20+Math.random()*60;
    const h=80+Math.random()*200;
    g.fillRect(x,512-h,w,h);
    g.fillStyle=Math.random()<0.5?'rgba(255,200,90,0.65)':'rgba(140,220,255,0.65)';
    for(let wy=512-h+8;wy<512-8;wy+=10){
      for(let wx=x+3;wx<x+w-3;wx+=6){
        if(Math.random()<0.55)g.fillRect(wx,wy,2,3);
      }
    }
    g.fillStyle='#000003';
    x+=w+1;
  }
  // No stars — light pollution dominates. Spec §4 explicit.
  return _skyTexFromCanvas(c);
}

// Volcano NIGHT — deep ember sky, intensified lava-glow horizon, dense
// smoke, sparse warm ember-stars, low cream moon dimmed by smoke. The
// PMREM-baked env paints car clearcoat with lava-glow rim-light.
function makeVolcanoNightSkyTex(){
  const {c,g}=_newSkyCanvas('#0a0408','#1a0608');
  // Intensified lava-glow at horizon (lower band, much brighter than day).
  const glow=g.createLinearGradient(0,280,0,512);
  glow.addColorStop(0,'rgba(255,80,20,0)');
  glow.addColorStop(.4,'rgba(255,90,30,0.45)');
  glow.addColorStop(.8,'rgba(220,55,10,0.75)');
  glow.addColorStop(1,'rgba(180,30,0,0.95)');
  g.fillStyle=glow;g.fillRect(0,280,1024,232);
  // Smoke clouds — denser + darker than day. Composited dark over the glow.
  for(let i=0;i<14;i++){
    const x=Math.random()*1024,y=110+Math.random()*220;
    const r=80+Math.random()*120;
    const gr=g.createRadialGradient(x,y,0,x,y,r);
    gr.addColorStop(0,'rgba(20,10,8,0.75)');
    gr.addColorStop(1,'rgba(20,10,8,0)');
    g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);
  }
  // Warm ember-specks (fewer, brighter) — read as cinders in the smoke.
  for(let i=0;i<80;i++){
    const x=Math.random()*1024,y=150+Math.random()*300;
    const a=(Math.random()*0.55+0.45).toFixed(2);
    g.fillStyle=`rgba(255,${(140+Math.random()*70)|0},${(30+Math.random()*40)|0},${a})`;
    g.fillRect(x,y,2,2);
  }
  // Dim moon, upper-left, partially veiled by smoke. Intentionally low
  // contrast — volcano nights are smoky, not crisp.
  const moonCx=260,moonCy=120,moonR=32;
  const halo=g.createRadialGradient(moonCx,moonCy,moonR*0.5,moonCx,moonCy,moonR*2.4);
  halo.addColorStop(0,'rgba(240,205,150,0.30)');
  halo.addColorStop(1,'rgba(240,205,150,0)');
  g.fillStyle=halo;g.fillRect(moonCx-moonR*2.4,moonCy-moonR*2.4,moonR*4.8,moonR*4.8);
  const disc=g.createRadialGradient(moonCx-moonR*0.3,moonCy-moonR*0.3,0, moonCx,moonCy,moonR);
  disc.addColorStop(0,'rgba(245,220,180,0.85)');
  disc.addColorStop(1,'rgba(180,140,100,0.65)');
  g.fillStyle=disc;g.beginPath();g.arc(moonCx,moonCy,moonR,0,Math.PI*2);g.fill();
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
    g.fillRect(x,y,2,2);
  }
  // Distant snow fog at horizon
  const fog=g.createLinearGradient(0,360,0,512);
  fog.addColorStop(0,'rgba(220,235,250,0)');
  fog.addColorStop(1,'rgba(220,235,250,0.45)');
  g.fillStyle=fog;g.fillRect(0,360,1024,152);
  return _skyTexFromCanvas(c);
}

// Arctic NIGHT — deep midnight-blue zenith, vivid aurora ribbons (green
// + violet + cyan) that arc across the upper sky, dense star field,
// crisp white moon. PMREM-baked env paints car lacquer with cool aurora
// rim-light at night.
function makeArcticNightSkyTex(){
  const {c,g}=_newSkyCanvas('#050a1c','#1a2848');
  // Dense star field (zenith-weighted), painted before auroras so aurora
  // partially veils some stars naturally.
  const STAR_COUNT=window._isMobile?60:160;
  for(let i=0;i<STAR_COUNT;i++){
    const x=Math.random()*1024;
    const y=Math.pow(Math.random(),1.5)*300;
    const a=(0.5+Math.random()*0.5).toFixed(2);
    const sz=Math.random()<0.9?1:1.6;
    g.fillStyle=`rgba(220,230,255,${a})`;
    g.fillRect(x,y,sz,sz);
  }
  // Aurora ribbons — 4 bands with stronger curve + higher saturation
  // than the day version. Painted with additive feel via 'lighter' comp.
  g.save();
  g.globalCompositeOperation='lighter';
  const auroraBands=[
    {y:90,  color:'rgba(80,255,180,', amp:38, freq:0.011},
    {y:140, color:'rgba(120,90,255,', amp:42, freq:0.009},
    {y:180, color:'rgba(60,220,255,', amp:32, freq:0.013},
    {y:240, color:'rgba(180,80,220,', amp:26, freq:0.015}
  ];
  auroraBands.forEach((band,bi)=>{
    for(let x=0;x<1024;x+=2){
      const wob=Math.sin(x*band.freq+bi*1.7)*band.amp;
      const y=band.y+wob;
      const peakA=0.32-bi*0.05;
      const grad=g.createLinearGradient(x,y-60,x,y+60);
      grad.addColorStop(0,band.color+'0)');
      grad.addColorStop(.5,band.color+peakA.toFixed(2)+')');
      grad.addColorStop(1,band.color+'0)');
      g.fillStyle=grad;g.fillRect(x,y-60,2,120);
    }
  });
  g.restore();
  // Hero moon, upper-right, crisp + bright (cold air = high contrast).
  const moonCx=760,moonCy=110,moonR=42;
  const halo=g.createRadialGradient(moonCx,moonCy,moonR*0.55,moonCx,moonCy,moonR*2.5);
  halo.addColorStop(0,'rgba(225,235,255,0.55)');
  halo.addColorStop(.5,'rgba(180,210,250,0.20)');
  halo.addColorStop(1,'rgba(180,210,250,0)');
  g.fillStyle=halo;g.fillRect(moonCx-moonR*2.5,moonCy-moonR*2.5,moonR*5,moonR*5);
  const disc=g.createRadialGradient(moonCx-moonR*0.25,moonCy-moonR*0.25,0, moonCx,moonCy,moonR);
  disc.addColorStop(0,'rgba(255,255,255,1)');
  disc.addColorStop(.7,'rgba(235,240,250,1)');
  disc.addColorStop(1,'rgba(190,200,220,0.9)');
  g.fillStyle=disc;g.beginPath();g.arc(moonCx,moonCy,moonR,0,Math.PI*2);g.fill();
  // Distant ice-fog at horizon — same band as day, slightly cooler tone.
  const fog=g.createLinearGradient(0,400,0,512);
  fog.addColorStop(0,'rgba(140,170,210,0)');
  fog.addColorStop(1,'rgba(140,170,210,0.55)');
  g.fillStyle=fog;g.fillRect(0,400,1024,112);
  return _skyTexFromCanvas(c);
}

// Sandstorm — warm-sunset gradient. Purple-warm zenith bleeds through a
// fiery orange-red mid-band into a peach horizon and warm-dust foot.
// Cinematic golden-hour feel + dramatic rim-light fodder for cliff side
// of canyon. Lap-progressive haze tint is layered on top via DOM-overlay
// in sandstorm-storm.js; this canvas is the lap-1 clear-sky baseline.
function makeSandstormSkyTex(){
  // Two-stop linear bg = zenith → mid-horizon. We paint the lower bands on
  // top to get a 4-stop sunset effect without altering _newSkyCanvas.
  const {c,g}=_newSkyCanvas('#5a3a55','#ff7842');
  // Mid-band warm orange-red → peach horizon (rows ~260-420).
  const midBand=g.createLinearGradient(0,260,0,420);
  midBand.addColorStop(0,'rgba(255,120,66,0)');
  midBand.addColorStop(.5,'rgba(255,160,100,0.55)');
  midBand.addColorStop(1,'rgba(255,184,122,0.85)');
  g.fillStyle=midBand;g.fillRect(0,260,1024,160);
  // Lower horizon → warm-dust foot. Picks up the fog-color so the seam
  // between fogged distant geometry and skybox is invisible.
  const foot=g.createLinearGradient(0,410,0,512);
  foot.addColorStop(0,'rgba(255,184,122,0.85)');
  foot.addColorStop(1,'rgba(168,104,57,1)');
  g.fillStyle=foot;g.fillRect(0,410,1024,102);
  // Sun hotspot — low and warm. Centered just above mid-band so the
  // sunset glow centers the composition. Color-matches the sun directional
  // light (#ff8c42) so sky and lit-sides of cliffs share a tone.
  const sun=g.createRadialGradient(680,300,0,680,300,280);
  sun.addColorStop(0,'rgba(255,210,140,1)');
  sun.addColorStop(.25,'rgba(255,160,90,0.65)');
  sun.addColorStop(.6,'rgba(255,120,60,0.30)');
  sun.addColorStop(1,'rgba(255,100,50,0)');
  g.fillStyle=sun;g.fillRect(360,40,640,520);
  // Sparse high-altitude wisps backlit by sunset — picks up sun-warm
  // tones rather than cloud-white. Adds atmospheric depth in the zenith.
  for(let i=0;i<8;i++){
    const y=70+Math.random()*150,w=140+Math.random()*180;
    const x=Math.random()*1024;
    const grd=g.createLinearGradient(x,y,x+w,y);
    grd.addColorStop(0,'rgba(255,200,150,0)');
    grd.addColorStop(.5,'rgba(255,200,150,0.22)');
    grd.addColorStop(1,'rgba(255,200,150,0)');
    g.fillStyle=grd;g.fillRect(x,y-2,w,4);
  }
  return _skyTexFromCanvas(c);
}

// Sandstorm NIGHT — deep-purple zenith with full-moon hero, dense star
// field weighted toward the zenith, and a diagonal Milky-Way band.
// Painted onto the same 1024×512 canvas the day-skybox uses so the
// PMREM-derived environment reflections automatically pick up the moon
// glow on car clearcoat.
//
// Night-toggle in effects/night.js swaps between makeSandstormSkyTex
// (day) and this builder when activeWorld==='sandstorm' and isDark
// flips. Stars are baked into the canvas (not as scene-level Points)
// so they pan with the skybox when camera turns — matches every other
// world's star approach.
function makeSandstormNightSkyTex(){
  const {c,g}=_newSkyCanvas('#0a0a1f','#2a2548');
  const W=1024, H=512;
  // Mid-band — soft purple haze blends zenith into horizon.
  const mid=g.createLinearGradient(0,160,0,360);
  mid.addColorStop(0,'rgba(26,21,53,0)');
  mid.addColorStop(.5,'rgba(26,21,53,0.55)');
  mid.addColorStop(1,'rgba(42,37,72,0)');
  g.fillStyle=mid; g.fillRect(0,160,W,200);
  // Lower horizon — slight indigo lift so the seam against fog disappears.
  const foot=g.createLinearGradient(0,420,0,512);
  foot.addColorStop(0,'rgba(42,37,72,0.4)');
  foot.addColorStop(1,'rgba(26,24,40,1)');
  g.fillStyle=foot; g.fillRect(0,420,W,92);
  // Milky Way band — diagonal cloudy strip from lower-left to upper-right
  // of the zenith half. Procedural blob-cluster fill via additive tint.
  // Saved + restored so we can rotate the canvas for the diagonal sweep
  // without affecting subsequent paints.
  g.save();
  g.translate(W*0.5, 220);
  g.rotate(-0.45);   // ~-26° tilt
  for(let i=0;i<70;i++){
    const x=(Math.random()-0.5)*W*1.4;
    const y=(Math.random()-0.5)*120;
    const r=18+Math.random()*36;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba(180,170,210,0.18)');
    grd.addColorStop(1,'rgba(180,170,210,0)');
    g.fillStyle=grd; g.fillRect(x-r,y-r,r*2,r*2);
  }
  // Brighter clusters along the band's spine
  for(let i=0;i<30;i++){
    const x=(Math.random()-0.5)*W*1.2;
    const y=(Math.random()-0.5)*40;
    const r=8+Math.random()*16;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba(220,210,250,0.32)');
    grd.addColorStop(1,'rgba(220,210,250,0)');
    g.fillStyle=grd; g.fillRect(x-r,y-r,r*2,r*2);
  }
  g.restore();
  // Star field — 200 desktop / 80 mobile, weighted toward zenith via
  // y=Math.pow(rand,1.6)*midY. 80% white, 15% blue-tinted, 5% warm-yellow.
  const STAR_COUNT=window._isMobile?80:200;
  for(let i=0;i<STAR_COUNT;i++){
    const x=Math.random()*W;
    // Zenith-weighted: rand^1.6 makes 80% of stars sit in the upper half.
    const y=Math.pow(Math.random(),1.6)*340;
    const r=Math.random();
    const size=r<0.85?1: r<0.97?1.5:2.2;
    const tone=r<0.80?'255,255,255': r<0.95?'216,224,255':'255,248,224';
    const alpha=(0.55+Math.random()*0.45).toFixed(2);
    g.fillStyle=`rgba(${tone},${alpha})`;
    g.fillRect(x, y, size, size);
  }
  // ── HERO: full moon, upper-right quadrant. Scaled to read at distance.
  const moonCx=720, moonCy=130, moonR=46;
  // Outer halo (additive feel via radial gradient white-blue → transparent).
  const halo=g.createRadialGradient(moonCx,moonCy,moonR*0.6, moonCx,moonCy,moonR*2.6);
  halo.addColorStop(0,'rgba(245,240,216,0.45)');
  halo.addColorStop(.4,'rgba(200,210,240,0.18)');
  halo.addColorStop(1,'rgba(200,210,240,0)');
  g.fillStyle=halo; g.fillRect(moonCx-moonR*2.6, moonCy-moonR*2.6, moonR*5.2, moonR*5.2);
  // Moon disc — cream-white with a faint terminator gradient.
  const disc=g.createRadialGradient(moonCx-moonR*0.25, moonCy-moonR*0.25, 0,
                                     moonCx, moonCy, moonR);
  disc.addColorStop(0,'rgba(255,250,232,1)');
  disc.addColorStop(.7,'rgba(245,240,216,1)');
  disc.addColorStop(1,'rgba(200,194,170,0.95)');
  g.fillStyle=disc; g.beginPath();
  g.arc(moonCx, moonCy, moonR, 0, Math.PI*2); g.fill();
  // Craters — 8 darker spots, sized + placed pseudo-randomly inside disc.
  const craters=[
    [-22,-12,7], [12,-18,5], [22,8,6], [-8,16,9],
    [-18,4,4], [4,-4,3], [16,-2,4], [-2,22,5]
  ];
  craters.forEach(([dx,dy,cr])=>{
    const cgrd=g.createRadialGradient(moonCx+dx,moonCy+dy,0, moonCx+dx,moonCy+dy,cr);
    cgrd.addColorStop(0,'rgba(170,165,148,0.55)');
    cgrd.addColorStop(1,'rgba(170,165,148,0)');
    g.fillStyle=cgrd; g.fillRect(moonCx+dx-cr, moonCy+dy-cr, cr*2, cr*2);
  });
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
    g.fillRect(x,y,2,2);
  }
  return _skyTexFromCanvas(c);
}

function buildScene(){
  window.dbg&&dbg.log('scene','buildScene start — world='+activeWorld);
  if(window.Breadcrumb)Breadcrumb.push('buildScene',{world:activeWorld});
  // Perf Phase A: shader-program count voor en na buildScene.
  const _perfProgBefore=(renderer&&renderer.info&&renderer.info.programs&&renderer.info.programs.length)||0;
  if(window.perfMark)perfMark('build:total:start');
  if(window.perfMark)perfMark('build:disposeScene:start');
  disposeScene();
  if(window.perfMark){perfMark('build:disposeScene:end');perfMeasure('build.disposeScene','build:disposeScene:start','build:disposeScene:end');}
  // Asset-cache eviction (Phase 2 Fix B.3): scene is leeg na disposeScene,
  // dus geen actieve refs naar non-current world textures/models. Dispose
  // alles dat niet bij de actieve world hoort om cumulatieve VRAM-leak
  // over meerdere world-switches te voorkomen (Phase 1 bevinding 1.1).
  if(window.Assets&&window.Assets.evictAllExcept){
    try{ Assets.evictAllExcept(activeWorld); }
    catch(e){ if(window.dbg)dbg.warn('scene','evictAllExcept failed: '+(e&&e.message||e)); }
  }
  // ── Swap TRACK_WP data for active world ───────────────────────
  {const src=(_TRACKS&&_TRACKS[activeWorld])||_DEFAULT_WP;
   TRACK_WP.length=0;src.forEach(wp=>TRACK_WP.push(wp));}
  // ── Reset global arrays populated during scene build ──────────
  trackLightList.length=0;trackPoles.length=0;_trackFlags.length=0;_aiHeadPool.length=0;
  jumpRamps.length=0;spinPads.length=0;boostPads.length=0;collectibles.length=0;skidMarks.length=0;
  // Shared skid geometry was disposed by the traversal above — drop our reference so the next race builds a fresh one.
  if(typeof _skidGeo!=='undefined')_skidGeo=null;
  _wpGravityZones.length=0;_wpOrbitAsteroids.length=0;_wpWarpTunnels.length=0;
  _wpCurrentStreams.length=0;_wpAbyssCracks.length=0;_wpTreasureTrail.length=0;
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
  _candyFloatBits=null;_candyFloatBitsGeo=null;_candyFloatBitsVel=null;
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
  if(typeof _p47LampEmissives!=='undefined')_p47LampEmissives.length=0;
  if(typeof _p47Bridge!=='undefined')_p47Bridge=null;

  const isSpace=activeWorld==='space';
  const isDeepSea=activeWorld==='deepsea';
  const isCandy=activeWorld==='candy';
  const isNeon=activeWorld==='neoncity';
  const isThemepark=activeWorld==='themepark';
  const isVolcano=activeWorld==='volcano';
  const isArctic=activeWorld==='arctic';
  const isSandstorm=activeWorld==='sandstorm';
  const isPier47=activeWorld==='pier47';
  scene=new THREE.Scene();
  // scene.environment wordt per-world gezet ná het skybox-block hieronder
  // (zie _buildWorldEnvFromSky aanroep). Dit was eerder een generieke
  // procedural gradient direct na new Scene(), maar per-world PMREM-cubemap
  // van het bestaande skybox canvas geeft dramatisch betere reflecties op
  // car clearcoat (sun, neon, embers, aurora — wereld-specifiek).
  // Fog color is matched to the skybox horizon (sky-bottom gradient stop) per world,
  // so fogged distant geometry blends seamlessly into the sky instead of producing a
  // visible "kleurverschil" band where the fogged scene meets the skybox.
  // Day/Night fog colors mirror toggleNight()'s skybox swaps so updateSky's lerp
  // never drifts to a wrong-world fog color (e.g. light-blue fog in the volcano).
  if(isSpace){
    scene.background=makeSpaceSkyTex();
    scene.fog=new THREE.FogExp2(0x010018,.0014);
    _fogColorDay.setHex(0x10085a);_fogColorNight.setHex(0x0a0a30);
  }else if(isDeepSea){
    scene.background=makeDeepSeaSkyTex();
    scene.fog=new THREE.FogExp2(0x003355,.0017);
    _fogColorDay.setHex(0x003355);_fogColorNight.setHex(0x03202e);
  }else if(isCandy){
    scene.background=makeCandySkyTex();
    // Pastel-pink fog matches the new 4-stop skybox foot so the seam
    // between fogged geometry and horizon is invisible. Density slightly
    // lower than the previous .0015 for a more spacious sun-drenched feel.
    scene.fog=new THREE.FogExp2(0xffe6f7,.0013);
    _fogColorDay.setHex(0xffe6f7);_fogColorNight.setHex(0x3e0c52);
  }else if(isNeon){
    scene.background=makeNeonCitySkyTex();
    scene.fog=new THREE.FogExp2(0x030012,.0017);
    _fogColorDay.setHex(0x080025);_fogColorNight.setHex(0x0a0828);
  }else if(isThemepark){
    scene.background=makeThemeparkSkyTex();
    scene.fog=new THREE.FogExp2(0xff8844,.0015);
    _fogColorDay.setHex(0xff8844);_fogColorNight.setHex(0x4e1734);
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
    _fogColorDay.setHex(0x1a3050);_fogColorNight.setHex(0x162e48);
  }else if(isSandstorm){
    // Sandstorm uses linear THREE.Fog (not Exp2) so the rolling-storm hazard
    // can mutate scene.fog.far on a known scale. Lap-1 baseline: far=220
    // (clear desert visibility); hazard pulls it down to 55 on lap 3.
    // _fogBaseDensity stays at the linear 'far' for setWeather rain blend
    // (linear fog ignores density, so weather-rain-add becomes a no-op here
    // — acceptable since sandstorm has no rain mode).
    scene.background=makeSandstormSkyTex();
    // Warm-sunset fog color matches the skybox foot-band so distance-faded
    // mesas tie into the sunset palette seamlessly. Distances (60..220)
    // are owned by sandstorm-storm.js's hazard mechanic (_SS_FOG_FAR_DEFAULT=220
    // + lap2 110 + lap3 55) — must stay aligned.
    scene.fog=new THREE.Fog(0xe8a468,60,220);
    _fogColorDay.setHex(0xe8a468);_fogColorNight.setHex(0x6a4830);
  }else if(isPier47){
    // Pier 47 — donker bewolkte nacht. Fog density 0.012 is denser than the
    // other Exp2-fog worlds (.0014..0035) to reinforce the closed-in
    // industrial-harbour vibe. Color is donkerpaars-grijs (#252030) which
    // matches the skybox foot-band so distance-faded geometry blends
    // seamlessly into the horizon. Day = the same overcast-night palette;
    // a brighter "ochtend"-mode for the toggle is reserved for sessie 3.
    scene.background=makePier47SkyTex();
    scene.fog=new THREE.FogExp2(0x252030,.012);
    _fogColorDay.setHex(0x252030);_fogColorNight.setHex(0x18141f);
  }else{
    // Onbekende world — val terug op space-sky zodat de scene niet crasht.
    if(window.dbg)dbg.warn('scene','unknown world '+activeWorld+' — falling back to space sky');
    scene.background=makeSpaceSkyTex();
    scene.fog=new THREE.FogExp2(0x010018,.0014);
    _fogColorDay.setHex(0x10085a);_fogColorNight.setHex(0x0a0a30);
  }
  // World-themed envMap: PMREM het skybox canvas voor cubemap-reflecties op
  // car clearcoat. Vervangt de generic procedural gradient die in een eerder
  // commit als scene.environment werd gezet (vlak na new Scene()). Per-world
  // envs zijn dramatisch rijker: sun-spot reflectie op GP, neon haze op
  // NeonCity, ember glow op Volcano. Procedural blijft fallback voor het
  // geval PMREM faalt.
  {
    const _worldEnv=_buildWorldEnvFromSky(scene.background);
    scene.environment=_worldEnv||_buildProceduralEnvMap();
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

  if(window.perfMark)perfMark('build:track:start');
  buildTrack();
  if(window.perfMark){perfMark('build:track:end');perfMeasure('build.track','build:track:start','build:track:end');}
  if(window.perfMark)perfMark('build:world:start');
  if(isSpace){
    buildSpaceEnvironment();
  }else if(isDeepSea){
    buildDeepSeaEnvironment();
    buildBackgroundLayers();
  }else if(isCandy){
    buildCandyEnvironment();
    buildBackgroundLayers();
  }else if(isNeon){
    buildNeonCityEnvironment();
    buildBackgroundLayers();
  }else if(activeWorld==='volcano'){
    buildVolcanoEnvironment();
    buildBackgroundLayers();
  }else if(activeWorld==='arctic'){
    buildArcticEnvironment();
    buildBackgroundLayers();
  }else if(isSandstorm){
    buildSandstormEnvironment();
    buildBackgroundLayers();
  }else if(isThemepark){
    buildThemeparkEnvironment();
    buildBackgroundLayers();
  }else if(isPier47){
    buildPier47Environment();
    // Sessie 2: distant industrial skyline silhouettes (containers /
    // warehouse roofs / crane booms catching sodium-orange backlight).
    // Palette lives in track/environment.js _SILHOUETTE_PALETTES.pier47.
    buildBackgroundLayers();
  }else{
    if(window.dbg)dbg.warn('scene','unknown world '+activeWorld+' — no environment builder, scene will be sparse');
  }
  if(window.perfMark){perfMark('build:world:end');perfMeasure('build.world','build:world:start','build:world:end');}
  if(window.perfMark)perfMark('build:gameplayObjects:start');
  buildJumpRamps();
  // buildCenterlineArrows() disabled — it produced 110 white X marks
  // (two bars rotated ±27° around the same point) every ~7m down the
  // centerline, which the user reported as "stray X decals on the
  // racing surface". Edge-lines + curbs are sufficient for navigation;
  // wrong-way detection is independent.
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
  if(window.perfMark){perfMark('build:gameplayObjects:end');perfMeasure('build.gameplayObjects','build:gameplayObjects:start','build:gameplayObjects:end');}
  // Cache minimap bounds
  const _xs=TRACK_WP.map(p=>p[0]),_zs=TRACK_WP.map(p=>p[1]);
  _mmBounds={mnX:Math.min(..._xs),mxX:Math.max(..._xs),mnZ:Math.min(..._zs),mxZ:Math.max(..._zs)};
  // Default to dark mode (isDark=false at entry, toggleNight sets it dark)
  if(window.perfMark)perfMark('build:night:start');
  isDark=false;toggleNight();
  if(window.perfMark){perfMark('build:night:end');perfMeasure('build.night','build:night:start','build:night:end');}
  // Apply any cached HDRI / PBR ground textures from window.Assets. No-op
  // if the manifest has no slots filled or preload hasn't completed yet —
  // boot.js + select.js re-call maybeUpgradeWorld when preload resolves.
  if(window.perfMark)perfMark('build:assetBridge:start');
  if(typeof maybeUpgradeWorld==='function')maybeUpgradeWorld(activeWorld);
  if(window.perfMark){perfMark('build:assetBridge:end');perfMeasure('build.assetBridge','build:assetBridge:start','build:assetBridge:end');}
  // Pre-compile materials voor de nieuwe wereld. _precompileScene roept
  // alleen renderer.compile() aan; de daadwerkelijke shader-link + GPU-
  // upload kost wordt opgevangen door de postfx warm-render hieronder
  // (PHASE-C fix), die langs het echte race-render-pad gaat zodat de
  // juiste shader-permutaties en postfx-pipeline gewarmd worden.
  if(window.perfMark)perfMark('build:precompile:start');
  _precompileScene();
  if(window.perfMark){perfMark('build:precompile:end');perfMeasure('build.precompile','build:precompile:start','build:precompile:end');}
  // Postfx warm-render is verhuisd naar goToRace() ná makeAllCars()
  // — zie js/ui/navigation.js. Reden: in buildScene staan de cars nog
  // niet in scene én is de camera nog op de title-cam-positie, dus de
  // warm-render representeerde niet de echte race-view en miste de
  // car-shaders. PHASE-C2 fix.
  if(window.perfMark){perfMark('build:total:end');perfMeasure('build.total','build:total:start','build:total:end');}
  // Shader-program count delta over the buildScene window.
  if(window.perfLog){
    const _perfProgAfter=(renderer&&renderer.info&&renderer.info.programs&&renderer.info.programs.length)||0;
    window.perfLog.push({name:'shaderPrograms.delta',ms:_perfProgAfter-_perfProgBefore,t:performance.now(),world:activeWorld});
    window.perfLog.push({name:'shaderPrograms.afterBuild',ms:_perfProgAfter,t:performance.now(),world:activeWorld});
    if(window.dbg)dbg.log('perf','shader programs '+_perfProgBefore+'→'+_perfProgAfter+' ('+activeWorld+')');
  }
  window.dbg&&dbg.snapshot('scene','buildScene done',{world:activeWorld,objects:scene.children.length,camPos:camera.position});
}

// Pre-compile materials. renderer.compile() laat de driver shader-source
// uploaden + async compileren — de werkelijke link gebeurt pas op de eerste
// echte render-call. Geen render hier: de phase-A meting liet zien dat een
// off-screen 16×16 render (eerder hier aanwezig) niet alleen de link forceert
// maar ook de sunLight shadow-pass (1024×1024) en alle texture/geometry
// uploads sync uitvoert; cost was 1.0–25.2 sec per build vs <1 sec voor
// compile zelf (zie PERF_PHASE_B_PLAN.md). De link/upload cost wordt nu
// opgevangen door de postfx warm-render in buildScene direct hierna, die
// langs het echte race-render-pad gaat zodat de juiste shader-permutaties
// gewarmd worden.
function _precompileScene(){
  if(!renderer||!scene||!camera)return;
  const _t0=performance.now();
  const _progBefore=(renderer.info.programs&&renderer.info.programs.length)||0;
  const _texBefore=renderer.info.memory.textures;
  if(window.perfMark)perfMark('precompile:compile:start');
  try{
    if(typeof renderer.compile==='function')renderer.compile(scene,camera);
  }catch(e){
    if(window.dbg)dbg.error('scene',e,'precompile failed');
  }
  if(window.perfMark){perfMark('precompile:compile:end');perfMeasure('build.precompile.compile','precompile:compile:start','precompile:compile:end');}
  if(window.dbg){
    const _dur=performance.now()-_t0;
    const _progAfter=(renderer.info.programs&&renderer.info.programs.length)||0;
    const _texAfter=renderer.info.memory.textures;
    dbg.markRaceEvent('PRECOMPILE-DONE',{
      durMs:+_dur.toFixed(2),
      progDelta:_progAfter-_progBefore,
      texDelta:_texAfter-_texBefore,
      world:activeWorld
    });
  }
}
// Exposed zodat asset-bridge.js (HDRI/PBR async upgrade) opnieuw kan
// pre-compilen nadat maybeUpgradeWorld materialen vervangt of envMap
// toevoegt. Zonder deze re-precompile zou Phase 3.1.a geen effect hebben
// op werelden waar PBR ground/HDRI later async resolveert.
window._precompileScene=_precompileScene;
