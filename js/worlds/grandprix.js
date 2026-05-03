// js/worlds/grandprix.js — grandprix world builders + update + collision checks
// Non-module script.

'use strict';

// Per-world state (uit main.js verhuisd) — gereset in core/scene.js buildScene().
const _wpWaterPuddles=[],_wpDrsZones=[];
let _drsTimer=0,_drsBoostUsed=false,_drsActive=false;

function buildWaterPuddles(){
  const defs=[{t:.28},{t:.56},{t:.81}];
  defs.forEach(def=>{
    const p=trackCurve.getPoint(def.t);
    const g=new THREE.Mesh(new THREE.PlaneGeometry(TW*1.2,7),
      new THREE.MeshLambertMaterial({color:0x224466,emissive:0x112233,transparent:true,opacity:.55}));
    g.rotation.x=-Math.PI/2;g.position.copy(p);g.position.y=.02;
    scene.add(g);
    _wpWaterPuddles.push({pos:p.clone(),radius:TW*.55,len:3.5,mesh:g,cooldown:0});
  });
}

function checkWaterPuddles(dt){
  const car=carObjs[playerIdx];
  _wpWaterPuddles.forEach(wp=>{
    if(wp.cooldown>0){wp.cooldown-=dt;return;}
    const d=car.mesh.position.distanceTo(wp.pos);
    if(d<wp.radius+4){
      // Splash: reduce grip, show popup
      car.speed*=Math.pow(0.96,dt*60);
      if(d<wp.radius&&Math.random()<.05){showPopup('💦 WET TRACK!','#66aaff',500);wp.cooldown=2;}
    }
  });
}


function buildDRSZone(){
  // Single DRS detection board + painted activation zone on the long straight
  const tDet=0.97,tStart=0.94,tEnd=0.02;
  // Detection board
  const pDet=trackCurve.getPoint(tDet),tgDet=trackCurve.getTangent(tDet).normalize();
  const board=new THREE.Mesh(new THREE.BoxGeometry(TW*2+4,.1,.5),
    new THREE.MeshLambertMaterial({color:0x00dd44,emissive:0x007722}));
  board.position.copy(pDet);board.position.y=.05;scene.add(board);
  // Vertical DRS sign poles
  const poleMat=new THREE.MeshLambertMaterial({color:0x00ee44,emissive:0x005522});
  [-1,1].forEach(s=>{
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.1,.1,4.5,6),poleMat);
    pole.position.copy(pDet);pole.position.y=2.25;
    pole.position.addScaledVector(new THREE.Vector3(-tgDet.z,0,tgDet.x),s*(TW+1.8));
    scene.add(pole);
  });
  // Horizontal sign board up high. Tekst was 'DRS DETECTION' (13 chars)
  // wat door viewport-clipping bij voorbij-rijden meestal als 'DRS DE'
  // werd afgekapt. 'DRS ZONE' (8 chars) is snel leesbaar en past breder
  // binnen de Sprite aspect ratio voordat clip-edges relevant worden.
  const signCvs=document.createElement('canvas');signCvs.width=256;signCvs.height=48;
  const sCtx=signCvs.getContext('2d');sCtx.fillStyle='#003311';sCtx.fillRect(0,0,256,48);
  sCtx.font='bold 26px Orbitron,Arial';sCtx.fillStyle='#00ff66';sCtx.textAlign='center';
  sCtx.fillText('DRS ZONE',128,35);
  const signTex=new THREE.CanvasTexture(signCvs);
  const signMesh=new THREE.Sprite(new THREE.SpriteMaterial({map:signTex,transparent:true}));
  signMesh.position.copy(pDet);signMesh.position.y=5.2;signMesh.scale.set(14,2.2,1);scene.add(signMesh);
  // Painted activation zone strip — emissive boost + per-strip handle for pulse
  const _drsStrips=[];
  for(let i=0;i<12;i++){
    const t=tStart+(tEnd-tStart+1)%1*(i/12);
    const pp=trackCurve.getPoint(t%1);
    const strip=new THREE.Mesh(new THREE.PlaneGeometry(TW*1.9,.8),
      new THREE.MeshLambertMaterial({color:0x00ff55,emissive:0x00cc44,emissiveIntensity:1.6,transparent:true,opacity:.7}));
    strip.rotation.x=-Math.PI/2;strip.position.copy(pp);strip.position.y=.018;scene.add(strip);
    _drsStrips.push({mesh:strip,phase:i*.5});
  }
  // Detection board itself: bump emissive so it bloom-glows
  board.material.emissiveIntensity=1.8;
  poleMat.emissiveIntensity=1.5;
  _wpDrsZones.push({detPos:pDet.clone(),detRadius:TW+3,startT:tStart,endT:tEnd,cooldown:0,strips:_drsStrips,board:board});
}

function checkDRSZone(dt){
  if(!_wpDrsZones.length)return;
  const drs=_wpDrsZones[0];const car=carObjs[playerIdx];
  drs.cooldown=Math.max(0,drs.cooldown-dt);
  // Visual pulse on activation strips — chase pattern when DRS is open, slow
  // breathing when armed and ready, dim when on cooldown.
  if(drs.strips){
    const t=_nowSec;
    const armed=drs.cooldown<=0;
    const speedHz=_drsActive?5.5:armed?1.4:0.6;
    const baseInt=_drsActive?2.4:armed?1.6:0.5;
    drs.strips.forEach(s=>{
      const v=Math.sin(t*speedHz+s.phase);
      s.mesh.material.emissiveIntensity=baseInt*0.5+baseInt*0.5*v;
      s.mesh.material.opacity=_drsActive?.85:armed?.7:.3;
    });
    if(drs.board)drs.board.material.emissiveIntensity=armed?1.8:0.4;
  }
  const d=car.mesh.position.distanceTo(drs.detPos);
  if(d<drs.detRadius&&drs.cooldown<=0){
    _drsActive=true;_drsTimer=6;_drsBoostUsed=false;
    showPopup('📡 DRS OPEN','#00ff66',700);drs.cooldown=8;
  }
  if(_drsActive){
    _drsTimer-=dt;
    if(_drsTimer<=0){_drsActive=false;if(_drsBoostUsed)showPopup('DRS CLOSED','#888888',500);}
    else if(!_drsBoostUsed&&car.speed>0.5){car.speed*=Math.pow(1.004,dt*60);} // gentle top-speed lift
  }
}


function buildTyreBarriers(){
  const defs=[{t:.18,side:-1},{t:.36,side:1},{t:.62,side:-1},{t:.78,side:1}];
  defs.forEach(def=>{
    const p=trackCurve.getPoint(def.t),tg=trackCurve.getTangent(def.t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const baseOff=def.side*(BARRIER_OFF+.8);
    const cols=[0xee2222,0xffffff,0xee2222,0xffffff,0xee2222];
    for(let i=0;i<5;i++){
      const ty=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,.65,10),
        new THREE.MeshLambertMaterial({color:cols[i%cols.length]}));
      ty.position.copy(p).addScaledVector(nr,baseOff).addScaledVector(tg,(i-2)*1.5);
      ty.position.y=.33;scene.add(ty);
      // Stack second row on top
      const ty2=new THREE.Mesh(new THREE.CylinderGeometry(.65,.65,.62,10),
        new THREE.MeshLambertMaterial({color:cols[(i+1)%cols.length]}));
      ty2.position.copy(ty.position);ty2.position.y=.97;scene.add(ty2);
    }
  });
}


function buildGPTrackProps(){
  // Tire-stack barriers at key corners — replaced by GLTF haybales/rocks
  // when those are available in the asset cache, else the original
  // procedural tire stacks.
  const tireStackTs=[0.15,0.26,0.38,0.52,0.63,0.72,0.85,0.92];
  // Collect any roadside props that loaded successfully.
  const gltfProps=[];
  if (window.Assets){
    ['haybale','rock_small','rock_medium'].forEach(k=>{
      const g=Assets.getGLTF('grandprix', k);
      if (g && g.scene) gltfProps.push({ key:k, proto:g });
    });
  }
  const tireM=new THREE.MeshLambertMaterial({color:0x0a0a0a});
  tireStackTs.forEach((tt,i)=>{
    const p=trackCurve.getPoint(tt),tg=trackCurve.getTangent(tt).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+4);
    const cx=p.x+nr.x*side,cz=p.z+nr.z*side;
    if (gltfProps.length){
      // Roulette between available GLTF props, with a small cluster of 2-3
      // siblings for a more organic look.
      const cluster = 2 + (Math.random()*2|0);
      for (let k=0;k<cluster;k++){
        const pick = gltfProps[(Math.random()*gltfProps.length)|0];
        const sizeHint = pick.key==='rock_medium' ? 2.2 : pick.key==='rock_small' ? 1.4 : 1.8;
        window.spawnGLTFProp(pick.proto,
          cx + (Math.random()-.5)*2.4,
          cz + (Math.random()-.5)*2.4,
          { sizeHint });
      }
      return;
    }
    // Stack of 3 tires (torus each)
    for(let k=0;k<3;k++){
      const tire=new THREE.Mesh(new THREE.TorusGeometry(.55,.22,6,16),tireM);
      tire.rotation.x=Math.PI/2;
      tire.position.set(cx,.55+k*.46,cz);
      scene.add(tire);
    }
    // Top red cap
    const cap=new THREE.Mesh(new THREE.SphereGeometry(.35,8,6,0,Math.PI*2,0,Math.PI*.5),
      new THREE.MeshLambertMaterial({color:0xcc2222}));
    cap.position.set(cx,1.95,cz);scene.add(cap);
  });

  // Safety cones in clusters at corner entries
  const coneM=new THREE.MeshLambertMaterial({color:0xff7722,emissive:0xff4411,emissiveIntensity:.2});
  [0.11,0.34,0.58,0.81].forEach((tt,i)=>{
    const p=trackCurve.getPoint(tt),tg=trackCurve.getTangent(tt).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?-1:1);
    for(let k=-1;k<=1;k++){
      const cone=new THREE.Mesh(new THREE.ConeGeometry(.28,.8,8),coneM);
      cone.position.set(p.x+nr.x*side*(BARRIER_OFF+3)+tg.x*k*1.8,.4,p.z+nr.z*side*(BARRIER_OFF+3)+tg.z*k*1.8);
      scene.add(cone);
      const stripe=new THREE.Mesh(new THREE.TorusGeometry(.24,.04,4,10),
        new THREE.MeshBasicMaterial({color:0xffffff}));
      stripe.rotation.x=Math.PI/2;
      stripe.position.set(cone.position.x,.32,cone.position.z);
      scene.add(stripe);
    }
  });

  // Marshal posts (orange flag on pole) every ~20%. Vlag oriënteert nu
  // langs de track-tangent zoals buildTrackFlags doet — eerder had de
  // vlag random rotation.y + .4m X-offset waardoor hij visueel los van
  // de pole hing in de lucht.
  [0.18,0.42,0.68,0.95].forEach((tt,i)=>{
    const p=trackCurve.getPoint(tt),tg=trackCurve.getTangent(tt).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+5.5);
    const px=p.x+nr.x*side,pz=p.z+nr.z*side;
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.08,3.8,6),
      new THREE.MeshLambertMaterial({color:0xcccccc}));
    pole.position.set(px,1.9,pz);scene.add(pole);
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(.8,.55),
      new THREE.MeshLambertMaterial({color:0xff6622,side:THREE.DoubleSide}));
    // Plaats vlag direct aan pole, .4m omhoog en gecentreerd op pole-x/z;
    // oriëntatie volgt track-tangent zodat de vlag visueel "wappert" in
    // race-richting i.p.v. random.
    flag.position.set(px,3.2,pz);
    flag.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI*.5;
    scene.add(flag);
  });

  // Row of pit-boards on the main straight side. Boards op y=1.6 leek
  // zwevend zonder ondersteuning; voeg twee posts toe per board (zelfde
  // patroon als buildAdvertisingBoards) zodat de board op zijn poles
  // staat. Ground-level grijs-zwart pole, height 1.6 → top exact onder
  // het bord.
  const boardM=new THREE.MeshLambertMaterial({color:0x222222});
  const accentM=new THREE.MeshLambertMaterial({color:0xffee00,emissive:0xff8800,emissiveIntensity:.4});
  const postM=new THREE.MeshLambertMaterial({color:0x444444});
  [0.95,0.97,0.99].forEach((tt,i)=>{
    const p=trackCurve.getPoint(tt),tg=trackCurve.getTangent(tt).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=-1*(BARRIER_OFF+4);
    const bx=p.x+nr.x*side, bz=p.z+nr.z*side;
    const board=new THREE.Mesh(new THREE.BoxGeometry(2.4,1.2,.1),boardM);
    board.position.set(bx,1.6,bz);
    board.rotation.y=Math.atan2(tg.x,tg.z);
    scene.add(board);
    const stripe=new THREE.Mesh(new THREE.BoxGeometry(2.4,.12,.11),accentM);
    stripe.position.copy(board.position);stripe.position.y-=.55;
    stripe.rotation.y=board.rotation.y;
    scene.add(stripe);
    // Twee support posts onder het bord langs de track-tangent (board's
    // local X-axis), zodat het bord rechtop staat op pit-wall hoogte.
    [-0.95,0.95].forEach(ox=>{
      const post=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,1.0,6),postM);
      post.position.set(bx+tg.x*ox,0.5,bz+tg.z*ox);
      scene.add(post);
    });
  });
}

