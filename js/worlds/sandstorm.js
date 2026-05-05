// js/worlds/sandstorm.js — Sandstorm Canyon world builders + update.
// Non-module script.
//
// World identity: warm Egyptian/Marrocan canyon under fierce sun on lap 1,
// rolling sandstorm closes in on lap 2-3 (handled by sandstorm-storm.js).
// Surface: 'sand' (see audio/samples.js WORLD_DEFAULT_SURFACE).
//
// Phase 1: minimal — sand ground (re-uses _sandGroundTex from environment.js),
// warm desert lighting, barriers + start-line + headlight refs, hazard stub.

'use strict';

function buildSandstormEnvironment(){
  // ── Ground: tile-able sand canvas (already available in environment.js).
  // Volg dezelfde anisotropy/repeat instellingen als _sandGroundTex levert,
  // zodat de "track-ahead-coloring" bug niet getriggerd wordt door afwijkende
  // mipmap-config (zie CLAUDE.md notitie en grandprix-style ground).
  const g=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),
    new THREE.MeshLambertMaterial({color:0xd4a55a,map:_sandGroundTex()}));
  g.rotation.x=-Math.PI/2;g.position.y=-.15;g.receiveShadow=true;
  g.userData._isProcGround=true;
  scene.add(g);

  // ── Lighting: warm desert sun, warm ambient, sky-to-ground hemi.
  // Sky + fog set in core/scene.js so updateSky's lerp uses world-matched colors.
  sunLight.color.setHex(0xffc97a);sunLight.intensity=1.4;
  ambientLight.color.setHex(0x5a3a20);ambientLight.intensity=0.6;
  hemiLight.color.setHex(0x9bd0e0);hemiLight.groundColor.setHex(0x8b5a2b);hemiLight.intensity=0.4;

  // ── Barriers + start line (shared environment helpers).
  buildBarriers();buildStartLine();

  // ── Player headlight refs (auto-on triggered by hazard on lap 2).
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);

  // ── Sandstorm hazard: builds storm-front, particles, overlay, wind state.
  if(typeof buildSandstormStorm==='function')buildSandstormStorm();

  // (Phase 2 adds skybox detail + waypoints; Phase 3 adds canyon walls,
  //  dunes, sphinx monument, temple ruins, obelisks, palms, tents, signs.)
}

function updateSandstormWorld(dt){
  // Subtle skybox drift to match the desert wind (mirrors volcano/arctic).
  if(scene&&scene.background&&scene.background.isTexture){
    scene.background.offset.x=(scene.background.offset.x+dt*.004)%1;
  }
  if(typeof updateSandstormStorm==='function'){
    var pl=carObjs[playerIdx];
    updateSandstormStorm(dt,pl?pl.lap:1);
  }
}
