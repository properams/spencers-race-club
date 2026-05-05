// js/worlds/sandstorm.js — Sandstorm Canyon world builders + update.
// Non-module script. Cloned from worlds/volcano.js as the rebuild template
// (warm palette + lap-progressive horizon hazard + procedural props match
// sandstorm's intent better than any other world).
//
// Phase 2: BASIS visuals only. Full prop richness lands in Phase 3.
// Hazard module call is wired but the implementation is a Phase-4 stub.

'use strict';

// Per-world state — gereset in core/scene.js buildScene() / race.js _resetRaceState.
// Mirrors volcano's pattern: arrays for animated props, refs for one-of meshes.
let _sandstormDunes=[];          // { mesh, baseY } for subtle dune-shimmer
let _sandstormSandSwept=null;    // global-lighting sand-haze point light
let _sandstormFlecksGeo=null;    // wind-drift fleck-particle BufferGeometry
let _sandstormFlecks=null;       // Points mesh

function buildSandstormEnvironment(){
  // ── Ground: tile-able sand canvas (helper from track/environment.js).
  // Anisotropy + repeat config matches grandprix-style ground (anisotropy:4
  // on desktop, mipmap-default) so the "track-ahead loading-stripe" bug
  // isn't triggered.
  const g=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),
    new THREE.MeshLambertMaterial({color:0xd4a55a,map:_sandGroundTex()}));
  g.rotation.x=-Math.PI/2;g.position.y=-.15;g.receiveShadow=true;
  g.userData._isProcGround=true;
  scene.add(g);
  // Sky + fog set in core/scene.js so updateSky's lerp uses world-matched colors.
  sunLight.color.setHex(0xffc97a);sunLight.intensity=1.4;
  ambientLight.color.setHex(0x5a3a20);ambientLight.intensity=0.6;
  hemiLight.color.setHex(0x9bd0e0);hemiLight.groundColor.setHex(0x8b5a2b);hemiLight.intensity=0.4;

  // Warm sand-haze point light at canyon-center (mirrors volcano's
  // _volcanoGlowLight). Subtle warm fill that pushes the centre of the
  // track into a hot-spot during day — pairs with bloom on a fierce sun.
  _sandstormSandSwept=new THREE.PointLight(0xffe4a8,1.4,500);
  _sandstormSandSwept.position.set(0,8,0);scene.add(_sandstormSandSwept);

  // ── Wind-blown sand fleck particles — ambient (always-on, lap-1+).
  // Pattern mirrors volcano's ember system. The lap-progressive STORM
  // particles are separate and live in sandstorm-storm.js (Phase 4).
  {
    const FN=_mobCount(180);
    const geo=new THREE.BufferGeometry();
    const pos=new Float32Array(FN*3),col=new Float32Array(FN*3);
    for(let i=0;i<FN;i++){
      pos[i*3]=(Math.random()-.5)*600;
      pos[i*3+1]=Math.random()*22+1;
      pos[i*3+2]=(Math.random()-.5)*600;
      // Sand-cream → warm-ochre colour spread
      col[i*3]=.95-Math.random()*.15;
      col[i*3+1]=.78-Math.random()*.20;
      col[i*3+2]=.58-Math.random()*.18;
    }
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    _sandstormFlecks=new THREE.Points(geo,new THREE.PointsMaterial({
      vertexColors:true,size:.32,transparent:true,opacity:.65,
      sizeAttenuation:true,blending:THREE.AdditiveBlending,depthWrite:false
    }));
    scene.add(_sandstormFlecks);_sandstormFlecksGeo=geo;
  }

  // ── Sphinx hero monument (BASIS-versie — full layered version in Phase 3).
  // Located outside the start/finish on the right shoulder. Half-buried in
  // a sand mound so the silhouette reads from the start straight.
  {
    const stoneMat=new THREE.MeshLambertMaterial({color:0xc89b6e});
    const sphinx=new THREE.Group();
    const body=new THREE.Mesh(new THREE.BoxGeometry(8,5,16),stoneMat);
    body.position.y=2;sphinx.add(body);
    const head=new THREE.Mesh(new THREE.BoxGeometry(4,5,4),stoneMat);
    head.position.set(0,5.5,-7.5);sphinx.add(head);
    // Headdress: pyramidal shape (cone with 4 sides → square pyramid)
    const hd=new THREE.Mesh(new THREE.ConeGeometry(3,4,4),stoneMat);
    hd.position.set(0,9.5,-7.5);hd.rotation.y=Math.PI/4;sphinx.add(hd);
    // Half-buried sand mound base
    const moundMat=new THREE.MeshLambertMaterial({color:0xc8a070});
    const mound=new THREE.Mesh(new THREE.SphereGeometry(14,12,8,0,Math.PI*2,0,Math.PI*0.5),moundMat);
    mound.scale.set(1.2,0.35,1.0);mound.position.y=-1;sphinx.add(mound);
    // Place beside finish line — same pattern volcano uses for crater-volcano:
    // along trackCurve at a known t, offset perpendicular to track tangent.
    const t=0.96;
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const off=BARRIER_OFF+14;
    sphinx.position.set(p.x+nr.x*off,0,p.z+nr.z*off);
    sphinx.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI*0.5;
    scene.add(sphinx);
  }

  // ── Single placeholder obelisk (full pair + capstones in Phase 3).
  {
    const stoneMat=new THREE.MeshLambertMaterial({color:0xb89370});
    const t=0.45;
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const off=BARRIER_OFF+8;
    const ob=new THREE.Mesh(new THREE.CylinderGeometry(0.4,1.4,12,4),stoneMat);
    ob.position.set(p.x+nr.x*off,6,p.z+nr.z*off);
    ob.rotation.y=Math.PI/4;scene.add(ob);
  }

  // ── Hazard module call (Phase 4 implements full mechanic).
  if(typeof buildSandstormStorm==='function')buildSandstormStorm();

  // ── Barriers + start line (shared environment helpers).
  buildBarriers();buildStartLine();

  // ── Player + AI headlight refs (auto-on triggered by hazard on lap 2).
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);

  // ── Stars (warm sand-tinted) — same instanced pattern as volcano.
  {
    const sg=new THREE.SphereGeometry(.18,4,4);
    const ssm=new THREE.MeshBasicMaterial({color:0xffd6a0,transparent:true,opacity:.7});
    stars=new THREE.InstancedMesh(sg,ssm,60);stars.visible=true;
    const dm=new THREE.Object3D();
    for(let i=0;i<60;i++){
      const th=Math.random()*Math.PI*2,ph=Math.random()*Math.PI*.3,r=300+Math.random()*80;
      dm.position.set(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph)*.35+60,r*Math.sin(ph)*Math.sin(th));
      dm.scale.setScalar(.6+Math.random()*1.2);dm.updateMatrix();
      stars.setMatrixAt(i,dm.matrix);
    }
    stars.instanceMatrix.needsUpdate=true;scene.add(stars);
  }

  // GLTF roadside props skipped — sandstorm has no GLTF manifest.
  // spawnRoadsideProps() bails on empty propKeys, so no-op anyway. Phase 3
  // adds full procedural roadside detail (palm trees, ruins, dunes, etc.).
}

function updateSandstormWorld(dt){
  const t=_nowSec;
  // Subtle skybox drift — sandstorm wind. Same patroon als volcano + arctic.
  if(scene&&scene.background&&scene.background.isTexture){
    scene.background.offset.x=(scene.background.offset.x+dt*.004)%1;
  }
  // Hazard update — driven by player lap. typeof guard so Phase 2 stub
  // is safe even before Phase 4 lands.
  if(typeof updateSandstormStorm==='function'){
    const pl=carObjs[playerIdx];
    updateSandstormStorm(dt,pl?pl.lap:1);
  }
  // Wind-drift the ambient flecks — rolling buffer (50/frame) like volcano
  // ember-update so 1500-particle pools never stall a single frame.
  if(_sandstormFlecksGeo){
    const pos=_sandstormFlecksGeo.attributes.position.array;
    const step=Math.floor(t*40)%50||1;
    for(let i=step;i<Math.min(step+50,pos.length/3);i++){
      pos[i*3]+=dt*1.6; // wind drifts east
      pos[i*3+1]+=dt*(.4+Math.random()*.4); // gentle rise
      if(pos[i*3]>320||pos[i*3+1]>26){
        pos[i*3]=-300+Math.random()*40;
        pos[i*3+1]=Math.random()*4;
        pos[i*3+2]=(Math.random()-.5)*600;
      }
    }
    _sandstormFlecksGeo.attributes.position.needsUpdate=true;
  }
  // Pulse the sand-haze fill light gently — same patroon als volcano glow.
  if(_sandstormSandSwept)_sandstormSandSwept.intensity=1.2+Math.sin(t*.45)*.30;
}
