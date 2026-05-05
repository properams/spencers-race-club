// js/worlds/sandstorm.js — Sandstorm Canyon world builders + update.
// Non-module script.
//
// World identity: warm Egyptian/Marrocan canyon under fierce sun on lap 1,
// rolling sandstorm closes in on lap 2-3 (handled by sandstorm-storm.js).
// Surface: 'sand' (see audio/samples.js WORLD_DEFAULT_SURFACE).
//
// Track segmentation (figure-8-light, 17 waypoints):
//   t ≈ [0.00 .. 0.30]  — open dunes start (waypoints 1-5)
//   t ≈ [0.30 .. 0.65]  — slot canyon (waypoints 6-11) — narrowest visuals
//   t ≈ [0.70 .. 0.88]  — temple plaza (waypoints 12-15)
//   t ≈ [0.88 .. 1.00]  — return to start straight (waypoints 16-17)

'use strict';

// Track-section ranges as t-values along trackCurve (CatmullRomCurve3 closed).
const _SS_DUNES_T_RANGES   = [[0.00,0.28],[0.88,1.00]];
const _SS_SLOT_T_RANGE     = [0.32,0.62];
const _SS_PLAZA_T_RANGE    = [0.70,0.86];

// ── Procedural canvas textures (sandstorm-specific) ───────────────────────
// Disposed by disposeScene's traversal — no manual cleanup needed.

function _ssRockTex(){
  const S=256,c=document.createElement('canvas');c.width=S;c.height=S;
  const g=c.getContext('2d');
  // Base rust color
  g.fillStyle='#7a3820';g.fillRect(0,0,S,S);
  // Layered rust + sand noise (pixel-level)
  const id=g.getImageData(0,0,S,S),d=id.data;
  for(let i=0;i<d.length;i+=4){
    const n=Math.random();
    const tone=n<0.55?[120+n*60|0,55+n*30|0,30+n*20|0]:[180+n*40|0,120+n*30|0,80+n*20|0];
    d[i]=tone[0];d[i+1]=tone[1];d[i+2]=tone[2];d[i+3]=255;
  }
  g.putImageData(id,0,0);
  // Horizontal stratification bands (sedimentary rock layers)
  for(let y=0;y<S;y+=12){
    g.fillStyle='rgba(60,28,16,0.45)';
    g.fillRect(0,y+Math.sin(y*.18)*3,S,2);
  }
  // Diagonal cracks
  g.strokeStyle='rgba(30,12,6,0.55)';g.lineWidth=1.5;
  for(let i=0;i<8;i++){
    g.beginPath();
    let x=Math.random()*S,y=Math.random()*S;g.moveTo(x,y);
    for(let j=0;j<5;j++){
      x+=(Math.random()-.3)*40;y+=(Math.random()-.5)*30;g.lineTo(x,y);
    }
    g.stroke();
  }
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(2,3);t.anisotropy=window._isMobile?2:4;t.needsUpdate=true;return t;
}

function _ssPalmLeafTex(){
  const W=128,H=64,c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d');
  g.clearRect(0,0,W,H);
  // Frond shape — central spine + tapered fingers
  // Spine
  g.fillStyle='#3a5a18';
  g.fillRect(0,H*.5-1,W,2);
  // Leaflet "fingers" angled along spine
  g.strokeStyle='#5a8a28';g.lineWidth=2;
  for(let i=0;i<14;i++){
    const x=4+i*(W-8)/13;
    const lenT=Math.sin((i/13)*Math.PI);
    const lf=14*lenT;
    g.beginPath();g.moveTo(x,H*.5);g.lineTo(x-2,H*.5-lf);g.stroke();
    g.beginPath();g.moveTo(x,H*.5);g.lineTo(x-2,H*.5+lf);g.stroke();
  }
  const t=new THREE.CanvasTexture(c);
  t.needsUpdate=true;return t;
}

function _ssTentStripeTex(){
  const W=128,H=128,c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d');
  // Striped Bedouin canvas: rust / cream / sand
  const colors=['#a04020','#f0d8a0','#c08850'];
  for(let y=0;y<H;y+=12){
    g.fillStyle=colors[(y/12)%colors.length|0];
    g.fillRect(0,y,W,12);
  }
  // Subtle weave noise
  const id=g.getImageData(0,0,W,H),d=id.data;
  for(let i=0;i<d.length;i+=4){
    const n=(Math.random()-0.5)*30|0;
    d[i]=Math.max(0,Math.min(255,d[i]+n));
    d[i+1]=Math.max(0,Math.min(255,d[i+1]+n));
    d[i+2]=Math.max(0,Math.min(255,d[i+2]+n));
  }
  g.putImageData(id,0,0);
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;t.needsUpdate=true;return t;
}

function _ssScarabSignTex(){
  const W=128,H=96,c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d');
  // Wood plank base
  g.fillStyle='#7a4818';g.fillRect(0,0,W,H);
  // Wood grain lines
  g.strokeStyle='rgba(40,20,8,0.5)';g.lineWidth=1;
  for(let y=8;y<H;y+=10){
    g.beginPath();g.moveTo(0,y+Math.sin(y*.2)*1.5);g.lineTo(W,y+Math.cos(y*.2)*1.5);g.stroke();
  }
  // Scarab silhouette (dark)
  g.fillStyle='#1a0e04';
  // Body — rounded oval
  g.beginPath();g.ellipse(W/2,H/2+4,18,22,0,0,Math.PI*2);g.fill();
  // Wing case split
  g.strokeStyle='#0a0500';g.lineWidth=1.5;
  g.beginPath();g.moveTo(W/2,H/2-12);g.lineTo(W/2,H/2+22);g.stroke();
  // Head + horns
  g.beginPath();g.ellipse(W/2,H/2-15,8,5,0,0,Math.PI*2);g.fill();
  g.fillRect(W/2-10,H/2-22,3,8);g.fillRect(W/2+7,H/2-22,3,8);
  // Six legs
  g.lineWidth=2;
  for(let i=0;i<3;i++){
    const yo=H/2-6+i*10;
    g.beginPath();g.moveTo(W/2-16,yo);g.lineTo(W/2-26,yo+3);g.stroke();
    g.beginPath();g.moveTo(W/2+16,yo);g.lineTo(W/2+26,yo+3);g.stroke();
  }
  const t=new THREE.CanvasTexture(c);t.needsUpdate=true;return t;
}

// ── Cliff displacement helper ─────────────────────────────────────────────
// Roughens a PlaneGeometry's vertex positions in-place along the local Z
// axis (towards the camera if the plane is rotated to face the track).
function _ssDisplaceCliffGeometry(geo, amplitude, seed){
  const pos=geo.attributes.position;
  let s=seed||1337;
  const rnd=()=>{ s=(s*9301+49297)%233280; return s/233280; };
  for(let i=0;i<pos.count;i++){
    const y=pos.getY(i);
    // More displacement higher up, less near the ground (foot is "carved")
    const heightFactor=Math.max(0.15,(y+0.5)*0.8);
    const noise=(rnd()-0.5)*2*amplitude*heightFactor
              +(rnd()-0.5)*amplitude*0.3*heightFactor;
    pos.setZ(i,pos.getZ(i)+noise);
  }
  pos.needsUpdate=true;
  geo.computeVertexNormals();
}

// ── Section builders ──────────────────────────────────────────────────────

function _ssBuildCanyonCliffs(){
  // Two parallel walls along the slot canyon, each tiled into ~6 segments
  // so the displacement reads as natural rock variation rather than a
  // single repeating panel. Wall stands on the OUTSIDE of the barriers.
  const mob=window._isMobile;
  const SEGS=mob?5:8;
  const PANEL_H=mob?16:22;
  const SUB_X=mob?8:16;
  const SUB_Y=mob?6:10;
  const tex=_ssRockTex();
  const cliffMat=new THREE.MeshLambertMaterial({color:0xa86839,map:tex});
  const [tStart,tEnd]=_SS_SLOT_T_RANGE;
  for(let i=0;i<SEGS;i++){
    const t=tStart+(i+0.5)*((tEnd-tStart)/SEGS);
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const yaw=Math.atan2(tg.x,tg.z);
    const arc=(tEnd-tStart)/SEGS*1700; // approx arc-length per segment
    const panelL=Math.min(arc*1.15,mob?14:22);
    [-1,1].forEach(side=>{
      const geo=new THREE.PlaneGeometry(panelL,PANEL_H,SUB_X,SUB_Y);
      _ssDisplaceCliffGeometry(geo,0.6,1337+i*7+(side+1)*131);
      const wall=new THREE.Mesh(geo,cliffMat);
      // Position outside barrier on this side, facing the track
      const off=BARRIER_OFF+6;
      const lxX=Math.cos(yaw),lxZ=-Math.sin(yaw);
      wall.position.set(p.x+side*off*lxX, PANEL_H*0.5-1, p.z+side*off*lxZ);
      // Wall faces inward: rotate around Y by yaw, then 180° if side=+1
      wall.rotation.y=yaw+(side>0?Math.PI:0);
      scene.add(wall);
    });
  }
}

function _ssBuildSandDunes(){
  // Organic wave-mesh dunes scattered in the open sections. Use a
  // shared low-saturation sand material; per-dune cloned geometry so we
  // can vertex-displace each independently.
  const mob=window._isMobile;
  const COUNT=_mobCount(8);
  const duneMat=new THREE.MeshLambertMaterial({color:0xc8a070});
  for(let i=0;i<COUNT;i++){
    // Sample a t in the open dunes range
    const range=_SS_DUNES_T_RANGES[i%_SS_DUNES_T_RANGES.length];
    const t=range[0]+Math.random()*(range[1]-range[0]);
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=i%2===0?1:-1;
    const off=BARRIER_OFF+18+Math.random()*45;
    const px=p.x+nr.x*side*off,pz=p.z+nr.z*side*off;
    const w=18+Math.random()*22,d=14+Math.random()*18;
    const sub=mob?6:10;
    const geo=new THREE.PlaneGeometry(w,d,sub,sub);
    // Sine-noise displacement on Z (becomes Y after rotation.x=-Math.PI/2)
    const pos=geo.attributes.position;
    for(let v=0;v<pos.count;v++){
      const x=pos.getX(v),y=pos.getY(v);
      const h=Math.sin(x*.15)*2.0+Math.cos(y*.18)*1.5+Math.sin((x+y)*.08)*1.2;
      pos.setZ(v,Math.max(0,h*0.6+1.5));
    }
    pos.needsUpdate=true;geo.computeVertexNormals();
    const dune=new THREE.Mesh(geo,duneMat);
    dune.rotation.x=-Math.PI/2;
    dune.rotation.z=Math.random()*Math.PI*2;
    dune.position.set(px,-0.05,pz);
    scene.add(dune);
  }
}

function _ssBuildSphinxMonument(){
  // ÉÉN hero prop bij start/finish line. Sphinx-silhouet via box met
  // tapered top en gedeeltelijk in zandduin "ingegraven" (y=-2 → halve
  // body steekt onder grond).
  const stoneMat=new THREE.MeshLambertMaterial({color:0xc89b6e});
  const sphinx=new THREE.Group();
  // Body — long box with tapered front
  const body=new THREE.Mesh(new THREE.BoxGeometry(8,5,16),stoneMat);
  body.position.y=2;
  sphinx.add(body);
  // Head — smaller box
  const head=new THREE.Mesh(new THREE.BoxGeometry(4,5,4),stoneMat);
  head.position.set(0,5.5,-7.5);
  sphinx.add(head);
  // Headdress — pyramidal shape (cone with 4 sides)
  const hd=new THREE.Mesh(new THREE.ConeGeometry(3,4,4),stoneMat);
  hd.position.set(0,9.5,-7.5);
  hd.rotation.y=Math.PI/4;
  sphinx.add(hd);
  // Front paws
  const paw=new THREE.Mesh(new THREE.BoxGeometry(2,2,4),stoneMat);
  paw.position.set(-2.5,1,-6);
  sphinx.add(paw);
  const paw2=paw.clone();
  paw2.position.set(2.5,1,-6);
  sphinx.add(paw2);
  // Half-buried base — sand mound
  const moundMat=new THREE.MeshLambertMaterial({color:0xc8a070});
  const mound=new THREE.Mesh(new THREE.SphereGeometry(14,12,8,0,Math.PI*2,0,Math.PI*0.5),moundMat);
  mound.scale.set(1.2,0.35,1.0);
  mound.position.y=-1;
  sphinx.add(mound);
  // Position next to start/finish (just outside barriers, on right side)
  const p=trackCurve.getPoint(0.96);
  const tg=trackCurve.getTangent(0.96).normalize();
  const nr=new THREE.Vector3(-tg.z,0,tg.x);
  const off=BARRIER_OFF+14;
  sphinx.position.set(p.x+nr.x*off,0,p.z+nr.z*off);
  sphinx.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI*0.5;
  scene.add(sphinx);
}

function _ssBuildTempleRuins(){
  // 4-6 staande pilaren, 2-3 omgevallen, 1 architrave-fragment.
  // Posities langs plaza-segment, op de buitenkant.
  const COUNT_STANDING=_mobCount(5);
  const COUNT_FALLEN=_mobCount(3);
  const stoneMat=new THREE.MeshLambertMaterial({color:0xb89370});
  const stoneDarkMat=new THREE.MeshLambertMaterial({color:0x8c6f50});
  // Standing pillars
  for(let i=0;i<COUNT_STANDING;i++){
    const t=_SS_PLAZA_T_RANGE[0]+(i+0.5)/COUNT_STANDING*(_SS_PLAZA_T_RANGE[1]-_SS_PLAZA_T_RANGE[0]);
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=i%2===0?1:-1;
    const off=BARRIER_OFF+9+Math.random()*8;
    const cx=p.x+nr.x*side*off,cz=p.z+nr.z*side*off;
    // Pillar shaft
    const shaft=new THREE.Mesh(new THREE.CylinderGeometry(0.9,1.1,8,12),stoneMat);
    shaft.position.set(cx,4,cz);
    scene.add(shaft);
    // Capital (top block)
    const cap=new THREE.Mesh(new THREE.BoxGeometry(2.6,0.8,2.6),stoneDarkMat);
    cap.position.set(cx,8.4,cz);
    scene.add(cap);
    // Base
    const base=new THREE.Mesh(new THREE.BoxGeometry(2.4,0.5,2.4),stoneDarkMat);
    base.position.set(cx,0.25,cz);
    scene.add(base);
  }
  // Fallen pillars (rotated cylinders on the ground)
  for(let i=0;i<COUNT_FALLEN;i++){
    const t=_SS_PLAZA_T_RANGE[0]+0.05+Math.random()*(_SS_PLAZA_T_RANGE[1]-_SS_PLAZA_T_RANGE[0]-0.10);
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i+1)%2===0?1:-1;
    const off=BARRIER_OFF+12+Math.random()*10;
    const cx=p.x+nr.x*side*off,cz=p.z+nr.z*side*off;
    const fallen=new THREE.Mesh(new THREE.CylinderGeometry(0.85,1.05,7,10),stoneMat);
    fallen.position.set(cx,1,cz);
    fallen.rotation.z=Math.PI/2;
    fallen.rotation.y=Math.random()*Math.PI*2;
    scene.add(fallen);
  }
  // Single architrave fragment — broken horizontal beam
  {
    const tMid=(_SS_PLAZA_T_RANGE[0]+_SS_PLAZA_T_RANGE[1])*0.5;
    const p=trackCurve.getPoint(tMid);
    const tg=trackCurve.getTangent(tMid).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const off=BARRIER_OFF+18;
    const cx=p.x+nr.x*off,cz=p.z+nr.z*off;
    const arch=new THREE.Mesh(new THREE.BoxGeometry(6,1.2,1.4),stoneMat);
    arch.position.set(cx,0.8,cz);
    arch.rotation.y=Math.atan2(tg.x,tg.z);
    arch.rotation.z=0.18; // slight tilt — broken
    scene.add(arch);
  }
}

function _ssBuildObelisks(){
  // Two tall narrow obelisks with capstones at plaza-segment corners.
  const stoneMat=new THREE.MeshLambertMaterial({color:0xb89370});
  const capMat=new THREE.MeshLambertMaterial({color:0xd4a55a});
  [_SS_PLAZA_T_RANGE[0],_SS_PLAZA_T_RANGE[1]].forEach((t,idx)=>{
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=idx===0?-1:1;
    const off=BARRIER_OFF+5;
    const cx=p.x+nr.x*side*off,cz=p.z+nr.z*side*off;
    // Obelisk: square taper (cone with 4 sides, bottom 1.4 → top 0.4)
    const ob=new THREE.Mesh(new THREE.CylinderGeometry(0.4,1.4,12,4),stoneMat);
    ob.position.set(cx,6,cz);
    ob.rotation.y=Math.PI/4;
    scene.add(ob);
    // Pyramid capstone (gold-tinted)
    const cap=new THREE.Mesh(new THREE.ConeGeometry(0.6,1.6,4),capMat);
    cap.position.set(cx,12.8,cz);
    cap.rotation.y=Math.PI/4;
    scene.add(cap);
  });
}

function _ssBuildPalmTrees(){
  // 8-12 palms langs plaza-rand. Use shared trunk material; leaves are
  // 6 planes per palm with the same shared canvas-texture material.
  const COUNT=_mobCount(10);
  const trunkMat=new THREE.MeshLambertMaterial({color:0x6a4a28});
  const leafTex=_ssPalmLeafTex();
  const leafMat=new THREE.MeshBasicMaterial({
    map:leafTex,transparent:true,alphaTest:0.35,
    side:THREE.DoubleSide,depthWrite:false
  });
  for(let i=0;i<COUNT;i++){
    const t=_SS_PLAZA_T_RANGE[0]+(i/COUNT)*(_SS_PLAZA_T_RANGE[1]-_SS_PLAZA_T_RANGE[0]);
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=i%2===0?1:-1;
    const off=BARRIER_OFF+3+Math.random()*7;
    const cx=p.x+nr.x*side*off,cz=p.z+nr.z*side*off;
    const h=4+Math.random()*1.5;
    // Trunk — slight curve via two stacked tapered cylinders
    const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.18,0.30,h,7),trunkMat);
    trunk.position.set(cx,h*0.5,cz);
    trunk.rotation.z=(Math.random()-0.5)*0.1;
    scene.add(trunk);
    // 6 leaf fronds at the top, fanned out
    for(let l=0;l<6;l++){
      const ang=(l/6)*Math.PI*2;
      const frond=new THREE.Mesh(new THREE.PlaneGeometry(3.2,1.2),leafMat);
      frond.position.set(cx+Math.cos(ang)*1.0,h+0.2,cz+Math.sin(ang)*1.0);
      frond.rotation.y=ang;
      frond.rotation.z=-0.32; // droop angle
      scene.add(frond);
    }
  }
}

function _ssBuildCamels(){
  // 3-5 instanced low-poly camel silhouettes on far dunes — pure
  // background scale-cue, no animation. Skip on mobile (too small to read).
  if(window._isMobile)return;
  const camelMat=new THREE.MeshLambertMaterial({color:0x6a4628});
  // Build a single silhouette geometry: body box + 2 humps + neck + head
  const camel=new THREE.Group();
  const body=new THREE.Mesh(new THREE.BoxGeometry(3.5,1.4,1.0),camelMat);
  body.position.y=1.6;
  camel.add(body);
  const hump1=new THREE.Mesh(new THREE.SphereGeometry(0.7,6,4),camelMat);
  hump1.position.set(-0.6,2.6,0);
  hump1.scale.y=1.2;
  camel.add(hump1);
  const hump2=hump1.clone();
  hump2.position.set(0.7,2.6,0);
  camel.add(hump2);
  const neck=new THREE.Mesh(new THREE.CylinderGeometry(0.25,0.35,1.8,5),camelMat);
  neck.position.set(1.7,2.4,0);
  neck.rotation.z=-0.6;
  camel.add(neck);
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.5,0.6),camelMat);
  head.position.set(2.5,3.1,0);
  camel.add(head);
  // 4 leg posts
  for(let i=0;i<4;i++){
    const lx=-1+(i%2)*2,lz=-0.3+(i>=2?0.6:0);
    const leg=new THREE.Mesh(new THREE.BoxGeometry(0.25,1.6,0.25),camelMat);
    leg.position.set(lx,0.8,lz);
    camel.add(leg);
  }
  // Place 4 instances on far dunes
  const positions=[[210,-280],[-180,-310],[-260,80],[280,180]];
  positions.forEach(([px,pz],i)=>{
    const c=camel.clone(true);
    c.position.set(px,0,pz);
    c.rotation.y=Math.random()*Math.PI*2;
    c.scale.setScalar(0.85+Math.random()*0.3);
    scene.add(c);
  });
}

function _ssBuildBedouinTents(){
  // 2-3 striped tents at the plaza. Simple cone-shape with tent canvas.
  const COUNT=_mobCount(3);
  const stripeTex=_ssTentStripeTex();
  stripeTex.repeat.set(2,2);
  const tentMat=new THREE.MeshLambertMaterial({
    map:stripeTex,side:THREE.DoubleSide
  });
  for(let i=0;i<COUNT;i++){
    const t=_SS_PLAZA_T_RANGE[0]+0.04+i*((_SS_PLAZA_T_RANGE[1]-_SS_PLAZA_T_RANGE[0]-0.08)/Math.max(1,COUNT-1));
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=i%2===0?-1:1;
    const off=BARRIER_OFF+15+Math.random()*4;
    const cx=p.x+nr.x*side*off,cz=p.z+nr.z*side*off;
    // Cone tent
    const tent=new THREE.Mesh(new THREE.ConeGeometry(2.2,3.0,6),tentMat);
    tent.position.set(cx,1.3,cz);
    tent.rotation.y=Math.random()*Math.PI*2;
    scene.add(tent);
    // Center pole peeking through top
    const poleMat=new THREE.MeshLambertMaterial({color:0x4a3018});
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,3.6,5),poleMat);
    pole.position.set(cx,1.6,cz);
    scene.add(pole);
  }
}

function _ssBuildScarabSigns(){
  // 3-4 wood-look "tourist signs" with scarab silhouette as world flavor.
  const COUNT=_mobCount(4);
  const signTex=_ssScarabSignTex();
  const signMat=new THREE.MeshBasicMaterial({map:signTex,side:THREE.DoubleSide});
  const poleMat=new THREE.MeshLambertMaterial({color:0x4a3018});
  // Distribute across whole track (not just plaza) for "tourist trail" feel.
  const ts=[0.10,0.45,0.78,0.93];
  for(let i=0;i<COUNT;i++){
    const t=ts[i%ts.length];
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=i%2===0?1:-1;
    const off=BARRIER_OFF+4;
    const cx=p.x+nr.x*side*off,cz=p.z+nr.z*side*off;
    // Pole
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,2.4,5),poleMat);
    pole.position.set(cx,1.2,cz);
    scene.add(pole);
    // Sign panel facing track
    const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.6,1.2),signMat);
    sign.position.set(cx,2.1,cz);
    sign.rotation.y=Math.atan2(tg.x,tg.z)+(side<0?0:Math.PI);
    scene.add(sign);
  }
}

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

  // ── World props (Phase 3) ────────────────────────────
  _ssBuildCanyonCliffs();
  _ssBuildSandDunes();
  _ssBuildSphinxMonument();
  _ssBuildTempleRuins();
  _ssBuildObelisks();
  _ssBuildPalmTrees();
  _ssBuildCamels();
  _ssBuildBedouinTents();
  _ssBuildScarabSigns();

  // ── Barriers + start line (shared environment helpers).
  buildBarriers();buildStartLine();

  // ── Player headlight refs (auto-on triggered by hazard on lap 2).
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);

  // ── Sandstorm hazard: builds storm-front, particles, overlay, wind state.
  if(typeof buildSandstormStorm==='function')buildSandstormStorm();
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
