// js/worlds/deepsea.js — deepsea world builders + update + collision checks
// Non-module script.

'use strict';

// Per-world state (uit main.js verhuisd) — gereset in core/scene.js buildScene().
let _kelpList=[];
let _jellyfishList=[];
let _dsaBubbleGeo=null,_dsaBubblePos=null;
let _dsaLightRays=[];
let _dsaBioEdges=[];
let _dsaCreatures={manta:null,whale:null,fishSchools:[]};
let _dsaTreasures=[];
let _dsaCurrentDir=0; // flowing current angle for physics
// var (niet const) — script-globaal voor cross-script reset in core/scene.js.
var _wpCurrentStreams=[],_wpAbyssCracks=[],_wpTreasureTrail=[];

function buildCurrentStreams(){
  const defs=[{t:.20,side:1},{t:.45,side:-1},{t:.70,side:1}];
  defs.forEach((def,di)=>{
    const p=trackCurve.getPoint(def.t),tg=trackCurve.getTangent(def.t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const pushDir=nr.clone().multiplyScalar(def.side);
    // Blue arrow strips showing current direction
    const arrowMat=new THREE.MeshLambertMaterial({color:0x00ccee,emissive:0x0077aa,emissiveIntensity:.9,transparent:true,opacity:.55});
    for(let i=-2;i<=2;i++){
      const ap=p.clone().addScaledVector(tg,i*3.5);
      const arr=new THREE.Mesh(new THREE.ConeGeometry(.8,2,4),arrowMat);
      arr.rotation.x=-Math.PI/2;arr.rotation.z=def.side>0?-Math.PI/2:Math.PI/2;
      arr.position.copy(ap);arr.position.y=.04;scene.add(arr);
    }
    // Glowing band on track
    const band=new THREE.Mesh(new THREE.PlaneGeometry(TW*1.8,18),
      new THREE.MeshLambertMaterial({color:0x0088bb,emissive:0x004466,transparent:true,opacity:.30}));
    band.rotation.x=-Math.PI/2;band.position.copy(p);band.position.y=.016;scene.add(band);
    _wpCurrentStreams.push({pos:p.clone(),pushDir:pushDir.clone(),radius:TW,len:9,strength:2.8,cooldown:0});
  });
}

function checkCurrentStreams(dt){
  const car=carObjs[playerIdx];
  _wpCurrentStreams.forEach(cs=>{
    const d=car.mesh.position.distanceTo(cs.pos);
    if(d<cs.radius+6){
      // Lateral push proportional to proximity
      const push=cs.strength*(1-Math.max(0,d-cs.radius)/6)*dt;
      car.mesh.position.addScaledVector(cs.pushDir,push);
      if(d<cs.radius&&Math.random()<.04)showPopup('🌊 CURRENT!','#00ddee',400);
    }
  });
}


function buildAbyssCracks(){
  const defs=[{t:.33},{t:.60},{t:.88}];
  defs.forEach(def=>{
    const p=trackCurve.getPoint(def.t),tg=trackCurve.getTangent(def.t).normalize();
    const angle=Math.atan2(tg.x,tg.z);
    // Dark jagged crack geometry (two thin dark planes at angles)
    const crackMat=new THREE.MeshLambertMaterial({color:0x000508,emissive:0x000000,transparent:true,opacity:.75});
    [-1,1].forEach(s=>{
      const crack=new THREE.Mesh(new THREE.PlaneGeometry(TW*.75,6),crackMat);
      crack.rotation.x=-Math.PI/2;crack.rotation.z=s*.15;
      crack.position.copy(p);crack.position.y=.03;crack.rotation.y=angle;
      crack.position.addScaledVector(new THREE.Vector3(-tg.z,0,tg.x),s*TW*.28);
      scene.add(crack);
    });
    // Dark bio-glow rim
    const rim=new THREE.Mesh(new THREE.PlaneGeometry(TW*1.4,6.5),
      new THREE.MeshLambertMaterial({color:0x001a22,emissive:0x00ffff,emissiveIntensity:.12,transparent:true,opacity:.2}));
    rim.rotation.x=-Math.PI/2;rim.position.copy(p);rim.position.y=.025;scene.add(rim);
    _wpAbyssCracks.push({pos:p.clone(),radius:TW*.65,len:3,cooldown:0});
  });
}

function checkAbyssCracks(dt){
  const car=carObjs[playerIdx];
  _wpAbyssCracks.forEach(ac=>{
    ac.cooldown=Math.max(0,ac.cooldown-dt);
    const d=car.mesh.position.distanceTo(ac.pos);
    if(d<ac.radius+2&&ac.cooldown<=0&&Math.abs(car.speed)>.15){
      car.speed*=Math.pow(0.93,dt*60); // moderate drag
      if(d<ac.radius&&Math.random()<.05){showPopup('🕳 ABYSS CRACK!','#00ffff',500);ac.cooldown=2.5;}
    }
  });
}


function buildTreasureTrail(){
  const trailCount=12;
  for(let i=0;i<trailCount;i++){
    const t=(i/trailCount+.08)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    // Offset slightly outside track edge
    const offset=(Math.random()>.5?1:-1)*(TW+3+Math.random()*4);
    const pos=p.clone().addScaledVector(nr,offset);pos.y=2.0;
    const g=new THREE.Group();g.position.copy(pos);
    // Golden treasure chest shape (box + lid)
    const chestMat=new THREE.MeshLambertMaterial({color:0xddaa00,emissive:0x886600,emissiveIntensity:.7});
    const box=new THREE.Mesh(new THREE.BoxGeometry(.9,.65,.65),chestMat);
    box.position.y=-.1;g.add(box);
    const lid=new THREE.Mesh(new THREE.BoxGeometry(.9,.3,.65),
      new THREE.MeshLambertMaterial({color:0xffcc00,emissive:0xaa8800,emissiveIntensity:.8}));
    lid.position.y=.3;g.add(lid);
    // Glow ring
    const rng=new THREE.Mesh(new THREE.TorusGeometry(1,.1,6,20),
      new THREE.MeshLambertMaterial({color:0xffdd33,emissive:0xffaa00,emissiveIntensity:1.2,transparent:true,opacity:.7}));
    rng.rotation.x=Math.PI/2;g.add(rng);
    scene.add(g);
    const tl=new THREE.PointLight(0xffcc00,1.4,12);tl.position.copy(pos);scene.add(tl);
    _wpTreasureTrail.push({mesh:g,pos:pos.clone(),radius:2.5,collected:false,respawn:20,light:tl,timer:0});
  }
}

function checkTreasureTrail(dt){
  const car=carObjs[playerIdx];if(!car)return;
  const now=_nowSec;
  _wpTreasureTrail.forEach(tr=>{
    if(tr.collected){
      if(now>tr.respawnAt){tr.collected=false;tr.mesh.visible=true;tr.light.intensity=1.4;}
      return;
    }
    // Gentle float animation
    tr.mesh.rotation.y+=.03;tr.mesh.position.y=tr.pos.y+Math.sin(now*1.8+tr.pos.x)*.3;
    const d=car.mesh.position.distanceTo(tr.pos);
    if(d<tr.radius){
      tr.collected=true;tr.respawnAt=now+tr.respawn;
      tr.mesh.visible=false;tr.light.intensity=0;
      totalScore+=150;
      sparkSystem.emit(tr.pos.x,tr.pos.y,tr.pos.z,0,.05,0,14,.9,.8,.1,.7);
      showPopup('💰 TREASURE! +150','#ffdd33',700);
    }
  });
}


function buildDeepSeaEnvironment(){
  buildSeaFloor();
  buildCoralReefs();
  buildKelp();
  buildShipwreck();
  buildSubmarineStation();
  buildSeaGate();
  buildBioluminescentTrackEdges();
  buildJellyfish();
  buildSeaCreatures();
  buildDeepSeaBubbles();
  buildDeepSeaLightRays();
  buildDeepSeaNightObjects();
  // GLTF roadside props (coral chunks / wreck boxes). No-op if cache is
  // empty; deepsea's procedural kelp + jellyfish setup is unaffected.
  if(window.spawnRoadsideProps){
    window.spawnRoadsideProps('deepsea',{
      propKeys:['coral_small','coral_medium','wreck_box'],
      count:8, sizeHint:1.6, clusterSize:2,
    });
  }
}


function buildSeaFloor(){
  // Main sandy seafloor
  const sandMat=new THREE.MeshLambertMaterial({color:0xc8a96a,map:_sandGroundTex()});
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400,1,1),sandMat);
  floor.rotation.x=-Math.PI/2;floor.position.y=-.18;floor.receiveShadow=true;
  floor.userData._isProcGround=true;
  scene.add(floor);
  // Darker infield — ocean trench / crevice
  const trenchMat=new THREE.MeshLambertMaterial({color:0x001830});
  const trench=new THREE.Mesh(new THREE.PlaneGeometry(380,320,1,1),trenchMat);
  trench.rotation.x=-Math.PI/2;trench.position.set(-30,-.15,-40);scene.add(trench);
  // Seafloor hills (lumpy formations)
  const hillMat=new THREE.MeshLambertMaterial({color:0xb89558});
  const hillPositions=[[210,-180,8],[-220,130,10],[150,280,7],[-80,-310,9],[300,100,6],[-310,-50,8],[80,-360,7],[-180,280,6]];
  hillPositions.forEach(([hx,hz,hr])=>{
    const hgeo=new THREE.SphereGeometry(hr+Math.random()*4,8,5);hgeo.scale(1,.38+Math.random()*.18,1);
    const h=new THREE.Mesh(hgeo,hillMat);h.position.set(hx,0,hz);h.receiveShadow=true;scene.add(h);
  });
  // Sand ripple lines (flat thin boxes)
  const rippleMat=new THREE.MeshLambertMaterial({color:0xd4b87a,transparent:true,opacity:.55});
  for(let i=0;i<30;i++){
    const r=new THREE.Mesh(new THREE.BoxGeometry(60+Math.random()*120,.05,.6),rippleMat);
    r.position.set((Math.random()-.5)*600,-.12,(Math.random()-.5)*700);
    r.rotation.y=Math.random()*Math.PI;scene.add(r);
  }
}


function buildCoralReefs(){
  const coralColors=[0xff5533,0xff8800,0xff4488,0x44ddaa,0xffcc00,0xff6622,0xcc44ff,0x22ddff];
  // 35 reef clusters scattered off-track
  for(let ci=0;ci<35;ci++){
    const t=(ci/35+Math.random()*.012)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(ci%2===0?1:-1)*(BARRIER_OFF+18+Math.random()*24);
    const cx=p.x+nr.x*side+(Math.random()-.5)*8,cz=p.z+nr.z*side+(Math.random()-.5)*8;
    const col=coralColors[ci%coralColors.length];
    const branches=3+Math.floor(Math.random()*4);
    for(let b=0;b<branches;b++){
      // Coral type alternates
      const type=ci%4;
      if(type===0){
        // Branch coral — thin cylinders
        const h=1.8+Math.random()*2.4;
        const seg=new THREE.Mesh(new THREE.CylinderGeometry(.12,.22,h,5),
          new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:.12}));
        seg.position.set(cx+(Math.random()-.5)*3,(h/2),cz+(Math.random()-.5)*3);
        seg.rotation.set((Math.random()-.5)*.4,Math.random()*Math.PI*2,(Math.random()-.5)*.4);
        scene.add(seg);
      }else if(type===1){
        // Fan coral — flat disc
        const r=1.2+Math.random()*1.8;
        const fan=new THREE.Mesh(new THREE.CircleGeometry(r,8),
          new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:.10,side:THREE.DoubleSide,transparent:true,opacity:.85}));
        fan.position.set(cx+(Math.random()-.5)*2,r*.6+Math.random()*1.2,cz+(Math.random()-.5)*2);
        fan.rotation.set(Math.PI/2+( Math.random()-.5)*.6,Math.random()*Math.PI*2,0);
        scene.add(fan);
      }else if(type===2){
        // Brain/bulb coral
        const r=.7+Math.random()*1.1;
        const bulb=new THREE.Mesh(new THREE.SphereGeometry(r,7,5),
          new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:.08}));
        bulb.scale.y=.55+Math.random()*.3;
        bulb.position.set(cx+(Math.random()-.5)*2.5,r*.5,cz+(Math.random()-.5)*2.5);
        scene.add(bulb);
      }else{
        // Tube coral — tall thin cylinder
        const h=2.2+Math.random()*3;
        const tube=new THREE.Mesh(new THREE.CylinderGeometry(.18,.24,h,6),
          new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:.15}));
        tube.position.set(cx+(Math.random()-.5)*2.5,h/2,cz+(Math.random()-.5)*2.5);
        tube.rotation.set((Math.random()-.5)*.3,Math.random()*Math.PI*2,(Math.random()-.5)*.3);
        scene.add(tube);
      }
    }
    // Small glow light at big coral clusters
    if(ci%6===0){
      const pl=new THREE.PointLight(col,.8,16);pl.position.set(cx,.8,cz);scene.add(pl);
    }
  }
}


function buildKelp(){
  _kelpList.length=0;
  const kelpMat=new THREE.MeshLambertMaterial({color:0x228833,side:THREE.DoubleSide,transparent:true,opacity:.88});
  for(let ki=0;ki<30;ki++){
    const t=(ki/30+.015)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(ki%2===0?1:-1)*(BARRIER_OFF+8+Math.random()*16);
    const kx=p.x+nr.x*side+(Math.random()-.5)*5,kz=p.z+nr.z*side+(Math.random()-.5)*5;
    const strands=2+Math.floor(Math.random()*3);
    const group=new THREE.Group();group.position.set(kx,0,kz);
    for(let s=0;s<strands;s++){
      const h=4+Math.random()*7;
      const kgeo=new THREE.PlaneGeometry(.5,.8*h,1,Math.floor(h));
      // Taper top vertices
      const pos=kgeo.attributes.position;
      for(let v=0;v<pos.count;v++){const y=pos.getY(v);const taper=1-Math.max(0,y/(.8*h))*.6;pos.setX(v,pos.getX(v)*taper);}
      pos.needsUpdate=true;
      const strand=new THREE.Mesh(kgeo,kelpMat.clone());
      strand.position.set((Math.random()-.5)*2,h/2,(Math.random()-.5)*2);
      strand.rotation.y=Math.random()*Math.PI*2;
      group.add(strand);
    }
    group._swayPhase=Math.random()*Math.PI*2;
    group._swaySpeed=.6+Math.random()*.5;
    scene.add(group);_kelpList.push(group);
  }
}


function buildShipwreck(){
  // Tilted old ship in infield
  const woodMat=new THREE.MeshLambertMaterial({color:0x4a3020});
  const darkMat=new THREE.MeshLambertMaterial({color:0x2a1a10});
  // metalMat was dead — never bound to a mesh
  const hull=new THREE.Mesh(new THREE.BoxGeometry(24,6,9),woodMat);
  hull.position.set(-55,-2,-30);hull.rotation.set(.18,-.62,.22);scene.add(hull);
  // Hull bottom
  const keel=new THREE.Mesh(new THREE.BoxGeometry(26,1.5,4),darkMat);
  keel.position.set(-55,-4.5,-30);keel.rotation.copy(hull.rotation);scene.add(keel);
  // Broken main mast
  const mast1=new THREE.Mesh(new THREE.CylinderGeometry(.28,.34,10,6),woodMat);
  mast1.position.set(-48,2.5,-29);mast1.rotation.set(.55,-.3,.15);scene.add(mast1);
  // Broken second mast (fallen, horizontal)
  const mast2=new THREE.Mesh(new THREE.CylinderGeometry(.22,.28,8,6),woodMat);
  mast2.position.set(-62,1.2,-31);mast2.rotation.set(1.3,-.5,.85);scene.add(mast2);
  // Torn sail fragments
  const sailMat=new THREE.MeshLambertMaterial({color:0x887766,side:THREE.DoubleSide,transparent:true,opacity:.65});
  const sail=new THREE.Mesh(new THREE.PlaneGeometry(6,4),sailMat);
  sail.position.set(-47,5,-29);sail.rotation.set(.4,-.3,.5);scene.add(sail);
  // Treasure chest
  const chestMat=new THREE.MeshLambertMaterial({color:0x8b5c1a});
  const chest=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.1,1.1),chestMat);
  chest.position.set(-58,-.2,-27);scene.add(chest);
  const lid=new THREE.Mesh(new THREE.BoxGeometry(1.6,.55,1.1),new THREE.MeshLambertMaterial({color:0x7a4e12}));
  lid.position.set(-58,.55,-27);lid.rotation.x=-.65;scene.add(lid);
  // Gold glow inside chest
  const treasureGlow=new THREE.PointLight(0xffcc44,1.8,8);treasureGlow.position.set(-58,.6,-27);scene.add(treasureGlow);
  // Scattered gold coins
  const coinMat=new THREE.MeshLambertMaterial({color:0xffd700,emissive:0x886600,emissiveIntensity:.5});
  for(let c=0;c<8;c++){
    const coin=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,.08,8),coinMat);
    coin.position.set(-58+(Math.random()-.5)*4,-.14+(Math.random()*.3),-27+(Math.random()-.5)*3);
    coin.rotation.set(Math.random()*.5,Math.random()*Math.PI*2,Math.random()*.5);
    scene.add(coin);
  }
  // Rope/chain
  for(let r=0;r<5;r++){
    const rope=new THREE.Mesh(new THREE.CylinderGeometry(.05,.05,1.8,4),darkMat);
    rope.position.set(-55+(Math.random()-.5)*8,-.3+(r*.4),-28+(Math.random()-.5)*4);
    rope.rotation.set(Math.random()*Math.PI,Math.random()*Math.PI,Math.random()*Math.PI);
    scene.add(rope);
  }
}


function buildSubmarineStation(){
  // Near S/F line — futuristic underwater base replacing pit building
  const subMat=new THREE.MeshLambertMaterial({color:0x334455});
  const glowMat=new THREE.MeshBasicMaterial({color:0x00ffcc,transparent:true,opacity:.8});
  // Main dome
  const dome=new THREE.Mesh(new THREE.SphereGeometry(8,14,10,0,Math.PI*2,0,Math.PI/2),
    new THREE.MeshLambertMaterial({color:0x223344,transparent:true,opacity:.9}));
  dome.position.set(40,0,310);scene.add(dome);
  // Base cylinder
  const base=new THREE.Mesh(new THREE.CylinderGeometry(8,10,3,14),subMat);
  base.position.set(40,1.5,310);scene.add(base);
  // Docking tubes extending out
  [-1,1].forEach(side=>{
    const tube=new THREE.Mesh(new THREE.CylinderGeometry(2,2,18,10),subMat);
    tube.rotation.z=Math.PI/2;tube.position.set(40+side*17,2,310);scene.add(tube);
    const cap=new THREE.Mesh(new THREE.SphereGeometry(2,10,8),subMat);
    cap.position.set(40+side*26,2,310);scene.add(cap);
  });
  // Viewing port windows (glowing circles)
  for(let w=0;w<4;w++){
    const ang=w*Math.PI/2+Math.PI/4;
    const porthole=new THREE.Mesh(new THREE.CircleGeometry(.85,12),
      new THREE.MeshBasicMaterial({color:0x44eeff,transparent:true,opacity:.75}));
    porthole.position.set(40+Math.cos(ang)*7.5,4,310+Math.sin(ang)*7.5);
    porthole.rotation.y=-ang;scene.add(porthole);
    const pl=new THREE.PointLight(0x44ddff,.9,10);pl.position.copy(porthole.position);scene.add(pl);
    trackLightList.push(pl);
  }
  // Gantry label
  const ganLblCvs=document.createElement('canvas');ganLblCvs.width=512;ganLblCvs.height=80;
  const ganCtx=ganLblCvs.getContext('2d');
  ganCtx.fillStyle='rgba(0,0,0,0)';ganCtx.fillRect(0,0,512,80);
  ganCtx.font='bold 34px Orbitron,sans-serif';ganCtx.fillStyle='#00ffcc';ganCtx.textAlign='center';
  ganCtx.fillText('DEEP SEA CIRCUIT',256,52);
  const ganTex=new THREE.CanvasTexture(ganLblCvs);
  const ganLbl=new THREE.Sprite(new THREE.SpriteMaterial({map:ganTex,transparent:true}));
  ganLbl.position.set(40,14,310);ganLbl.scale.set(28,4.5,1);scene.add(ganLbl);
  // Anchor chain
  const chainMat=new THREE.MeshLambertMaterial({color:0x888888});
  for(let l=0;l<6;l++){
    const link=new THREE.Mesh(new THREE.TorusGeometry(.4,.12,4,6),chainMat);
    link.position.set(40,l*.8,310);link.rotation.y=l*.5;scene.add(link);
  }
}


function buildSeaGate(){
  // Coral arch over S/F line
  const archMat=new THREE.MeshLambertMaterial({color:0xff5533,emissive:0x441100,emissiveIntensity:.2});
  const leftPillar=new THREE.Mesh(new THREE.CylinderGeometry(.8,1.2,12,8),archMat);
  leftPillar.position.set(-10,.5,230);scene.add(leftPillar);
  const rightPillar=new THREE.Mesh(new THREE.CylinderGeometry(.8,1.2,12,8),archMat);
  rightPillar.position.set(10,.5,230);scene.add(rightPillar);
  // Top arch (torus segment)
  const arch=new THREE.Mesh(new THREE.TorusGeometry(10,.9,8,12,Math.PI),
    new THREE.MeshLambertMaterial({color:0xff6644,emissive:0x221100,emissiveIntensity:.15}));
  arch.position.set(0,12,230);arch.rotation.set(0,Math.PI/2,0);scene.add(arch);
  // Glow on arch pillars
  const gL=new THREE.PointLight(0xff8844,1.2,14);gL.position.set(-10,8,230);scene.add(gL);trackLightList.push(gL);
  const gR=new THREE.PointLight(0xff8844,1.2,14);gR.position.set(10,8,230);scene.add(gR);trackLightList.push(gR);
  // Hanging coral decorations
  for(let h=0;h<6;h++){
    const hangPos=new THREE.Vector3(-8+h*3.2,10.5,230);
    const hang=new THREE.Mesh(new THREE.CylinderGeometry(.08,.18,1.4+Math.random()*.8,5),
      new THREE.MeshLambertMaterial({color:[0xff4488,0xffcc00,0x44ffaa][h%3]}));
    hang.position.copy(hangPos);scene.add(hang);
  }
  // S/F line canvas texture
  const sfCvs=document.createElement('canvas');sfCvs.width=256;sfCvs.height=32;
  const sfCtx=sfCvs.getContext('2d');
  sfCtx.fillStyle='rgba(0,255,200,0.4)';sfCtx.fillRect(0,0,256,32);
  for(let c=0;c<8;c++){sfCtx.fillStyle=c%2===0?'rgba(0,255,200,0.7)':'rgba(255,255,255,0.4)';sfCtx.fillRect(c*32,0,32,32);}
  const sfTex=new THREE.CanvasTexture(sfCvs);
  const sfLine=new THREE.Mesh(new THREE.PlaneGeometry(20,1.2),new THREE.MeshBasicMaterial({map:sfTex,transparent:true}));
  sfLine.rotation.x=-Math.PI/2;sfLine.position.set(0,-.1,230);scene.add(sfLine);
}


function buildBioluminescentTrackEdges(){
  _dsaBioEdges.length=0;
  const N=180;
  [1,-1].forEach(side=>{
    const geo=new THREE.BufferGeometry();
    const pos=new Float32Array(N*3);
    for(let i=0;i<N;i++){
      const t=i/(N-1);
      const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      pos[i*3]=p.x+nr.x*side*(TW*.5+.8);
      pos[i*3+1]=.08;
      pos[i*3+2]=p.z+nr.z*side*(TW*.5+.8);
    }
    geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
    const mat=new THREE.LineBasicMaterial({color:0x00ffcc,transparent:true,opacity:.95,linewidth:2,blending:THREE.AdditiveBlending,depthWrite:false});
    const line=new THREE.Line(geo,mat);
    scene.add(line);
    _dsaBioEdges.push({line,mat,phase:side>0?0:Math.PI});
  });
}


function buildJellyfish(){
  _jellyfishList.length=0;
  const N=15;
  for(let ji=0;ji<N;ji++){
    const t=(ji/N+.03)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(ji%2===0?1:-1)*(BARRIER_OFF+15+Math.random()*28);
    const jx=p.x+nr.x*side+(Math.random()-.5)*12;
    const jz=p.z+nr.z*side+(Math.random()-.5)*12;
    const jy=3+Math.random()*8;
    const col=ji%3===0?0xff44cc:ji%3===1?0x44ccff:0x88ff88;
    // Bell (dome)
    const bell=new THREE.Mesh(new THREE.SphereGeometry(1.1+Math.random()*.5,8,6,0,Math.PI*2,0,Math.PI/2),
      new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.45+Math.random()*.2}));
    bell.position.set(jx,jy,jz);
    // Tentacles
    const group=new THREE.Group();group.add(bell);
    const tentMat=new THREE.LineBasicMaterial({color:col,transparent:true,opacity:.35+Math.random()*.2});
    const tentCount=6+Math.floor(Math.random()*5);
    for(let tc=0;tc<tentCount;tc++){
      const ang=tc/tentCount*Math.PI*2;
      const tentGeo=new THREE.BufferGeometry();
      const tPoints=[];const tentLen=2+Math.random()*4;
      for(let ts=0;ts<=8;ts++){
        const ty=-ts*(tentLen/8);const wave=Math.sin(ts*.8)*(.3+Math.random()*.2);
        tPoints.push(Math.cos(ang)*.6+Math.cos(ang)*wave,ty,Math.sin(ang)*.6+Math.sin(ang)*wave);
      }
      tentGeo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(tPoints),3));
      group.add(new THREE.Line(tentGeo,tentMat));
    }
    group.position.set(jx,jy,jz);bell.position.set(0,0,0);
    const pl=new THREE.PointLight(col,.6,8);group.add(pl);
    group._bobPhase=Math.random()*Math.PI*2;
    group._bobSpeed=.4+Math.random()*.35;
    group._bobAmp=.5+Math.random()*.4;
    group._driftX=(Math.random()-.5)*.008;
    group._driftZ=(Math.random()-.5)*.008;
    group._baseY=jy;
    scene.add(group);_jellyfishList.push(group);
  }
}


function buildSeaCreatures(){
  // Manta ray — gliding silhouette circling the infield
  const mantaMat=new THREE.MeshLambertMaterial({color:0x223344,side:THREE.DoubleSide});
  const mantaGroup=new THREE.Group();
  // Wing shape using triangles
  const wingGeo=new THREE.BufferGeometry();
  const wv=new Float32Array([0,0,0, -7,.5,-2, -5,0,3, 7,.5,-2, 5,0,3, 0,.6,4]);
  const wi=new Uint16Array([0,1,2, 0,3,4, 0,2,5, 0,5,4]);
  wingGeo.setAttribute('position',new THREE.BufferAttribute(wv,3));
  wingGeo.setIndex(new THREE.BufferAttribute(wi,1));wingGeo.computeVertexNormals();
  const wing=new THREE.Mesh(wingGeo,mantaMat);mantaGroup.add(wing);
  const tail=new THREE.Mesh(new THREE.CylinderGeometry(.08,.02,3,4),mantaMat);
  tail.rotation.z=Math.PI/2;tail.position.set(0,.2,-2.5);mantaGroup.add(tail);
  mantaGroup.position.set(0,8,0);
  scene.add(mantaGroup);
  _dsaCreatures.manta={group:mantaGroup,t:0,speed:.018,radius:140,angle:0,wavePhase:0};

  // Distant whale — slow, high above
  const whaleMat=new THREE.MeshLambertMaterial({color:0x2a3a4a});
  const whaleGroup=new THREE.Group();
  const wBody=new THREE.Mesh(new THREE.SphereGeometry(5.5,10,7),whaleMat);wBody.scale.set(1,.55,2.8);
  const wHead=new THREE.Mesh(new THREE.SphereGeometry(4,8,6),whaleMat);wHead.scale.set(.9,.5,1.2);wHead.position.set(0,0,-10);
  const wTail=new THREE.Mesh(new THREE.CylinderGeometry(1.2,.4,6,6),whaleMat);wTail.position.set(0,0,14);wTail.rotation.z=Math.PI/2;
  const wFin=new THREE.Mesh(new THREE.BoxGeometry(1.5,4,2.5),whaleMat);wFin.position.set(0,3.5,0);
  whaleGroup.add(wBody,wHead,wTail,wFin);whaleGroup.position.set(-220,38,-280);
  scene.add(whaleGroup);
  _dsaCreatures.whale={group:whaleGroup,angle:0,speed:.004,radius:85,cx:-220,cz:-280};

  // Fish schools — 3 small groups of instanced fish
  const fishMat=new THREE.MeshLambertMaterial({color:0xffaa44});
  const fishGeo=new THREE.ConeGeometry(.4,.8,4);fishGeo.rotateX(Math.PI/2);
  for(let fs=0;fs<3;fs++){
    const count=18;const instMesh=new THREE.InstancedMesh(fishGeo,fishMat,count);
    const t=(fs/3+.15)%1;const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(fs%2===0?1:-1)*(BARRIER_OFF+20+Math.random()*25);
    const cx=p.x+nr.x*side,cz=p.z+nr.z*side,cy=4+Math.random()*5;
    const dm2=new THREE.Object3D();
    for(let fi=0;fi<count;fi++){
      dm2.position.set(cx+(Math.random()-.5)*12,cy+(Math.random()-.5)*4,cz+(Math.random()-.5)*12);
      dm2.rotation.y=Math.random()*Math.PI*2;dm2.updateMatrix();instMesh.setMatrixAt(fi,dm2.matrix);
    }
    instMesh.instanceMatrix.needsUpdate=true;scene.add(instMesh);
    _dsaCreatures.fishSchools.push({mesh:instMesh,cx,cy,cz,phase:Math.random()*Math.PI*2,speed:.022+Math.random()*.015,radius:18+Math.random()*10});
  }
}


function buildDeepSeaBubbles(){
  const N=400;
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(N*3);
  const car0=carObjs[playerIdx];
  const cx=car0?car0.mesh.position.x:0,cz=car0?car0.mesh.position.z:0;
  for(let i=0;i<N;i++){
    pos[i*3]=cx+(Math.random()-.5)*500;
    pos[i*3+1]=Math.random()*25;
    pos[i*3+2]=cz+(Math.random()-.5)*500;
  }
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const mat=new THREE.PointsMaterial({color:0xaaddff,size:.4,transparent:true,opacity:.7,sizeAttenuation:true,blending:THREE.AdditiveBlending,depthWrite:false});
  const pts=new THREE.Points(geo,mat);scene.add(pts);
  _dsaBubbleGeo=geo;_dsaBubblePos=pos;
}


function buildDeepSeaLightRays(){
  _dsaLightRays.length=0;
  const rayMat=new THREE.MeshBasicMaterial({color:0x44aaff,transparent:true,opacity:.04,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false});
  const N=8;
  for(let ri=0;ri<N;ri++){
    const t=(ri/N+.04)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(ri%2===0?1:-1)*(Math.random()*50+5);
    const rx=p.x+nr.x*side+(Math.random()-.5)*40,rz=p.z+nr.z*side+(Math.random()-.5)*40;
    const h=28+Math.random()*18;
    const geo=new THREE.PlaneGeometry(3+Math.random()*3,h);
    const ray=new THREE.Mesh(geo,rayMat.clone());
    ray.position.set(rx,h/2,rz);
    ray.rotation.y=Math.random()*Math.PI*2;
    scene.add(ray);
    _dsaLightRays.push({mesh:ray,phase:Math.random()*Math.PI*2,speed:.6+Math.random()*.4,baseOp:.03+Math.random()*.05});
  }
}


function buildDeepSeaNightObjects(){
  // Stars not visible underwater, use subtle bio particles instead
  // Reuse trackLightList for coral glow poles
  const sg=new THREE.SphereGeometry(.18,4,4),sm=new THREE.MeshBasicMaterial({color:0x00ffcc,transparent:true,opacity:.8});
  stars=new THREE.InstancedMesh(sg,sm,80);stars.visible=false;
  const dm=new THREE.Object3D();
  for(let i=0;i<80;i++){
    const t=i/80;const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    dm.position.set(p.x+nr.x*(BARRIER_OFF+4),2.5,p.z+nr.z*(BARRIER_OFF+4));
    dm.scale.setScalar(.8+Math.random()*.5);dm.updateMatrix();stars.setMatrixAt(i,dm.matrix);
  }
  stars.instanceMatrix.needsUpdate=true;scene.add(stars);
  // Track lights as bioluminescent pods
  for(let li=0;li<24;li++){
    const t=li/24;const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    [-1,1].forEach(side=>{
      const pp=p.clone().addScaledVector(nr,side*(BARRIER_OFF+1.5));
      const pod=new THREE.Mesh(new THREE.SphereGeometry(.3,6,5),
        new THREE.MeshBasicMaterial({color:0x00ffcc,transparent:true,opacity:.9}));
      pod.position.copy(pp);pod.position.y=.3;pod.visible=false;scene.add(pod);trackPoles.push(pod);
      const pl=new THREE.PointLight(0x00ffaa,0,12);pl.position.copy(pp);pl.position.y=.3;
      scene.add(pl);trackLightList.push(pl);
    });
  }
}


function updateDeepSeaWorld(dt){
  if(!scene)return;
  const t=_nowSec;
  // Kelp sway
  _kelpList.forEach(k=>{
    k._swayPhase+=dt*k._swaySpeed;
    k.rotation.z=Math.sin(k._swayPhase)*.12;
    k.rotation.x=Math.cos(k._swayPhase*.7)*.07;
  });
  // Jellyfish bob
  _jellyfishList.forEach(j=>{
    j._bobPhase+=dt*j._bobSpeed;
    j.position.y=j._baseY+Math.sin(j._bobPhase)*j._bobAmp;
    j.rotation.y+=dt*.15;
    // Tentacle writhe: scale bell slightly
    j.children[0].scale.y=.9+Math.sin(j._bobPhase*2.2)*.15;
  });
  // Bioluminescent edges pulse — wider amplitude, drives bloom on bright peaks
  _dsaBioEdges.forEach(e=>{
    e.phase+=dt*.9;
    e.mat.opacity=.65+Math.sin(e.phase)*.35;
  });
  // Light rays pulsing
  _dsaLightRays.forEach(r=>{
    r.phase+=dt*r.speed;
    r.mesh.material.opacity=r.baseOp*(1+Math.sin(r.phase)*.8);
    r.mesh.rotation.y+=dt*.04;
  });
  // Bubbles rising
  if(_dsaBubbleGeo&&_dsaBubblePos){
    const pos=_dsaBubblePos;
    const car=carObjs[playerIdx];
    const cx=car?car.mesh.position.x:0,cz=car?car.mesh.position.z:0;
    let anyChange=false;
    // Update subset each frame (~40 bubbles = 10% per frame)
    const step=Math.floor(_nowSec*400)%10;
    for(let i=step;i<pos.length/3;i+=10){
      pos[i*3+1]+=.04+Math.sin(t*.5+i)*.01;
      if(pos[i*3+1]>28){
        pos[i*3]=cx+(Math.random()-.5)*480;
        pos[i*3+1]=Math.random()*2;
        pos[i*3+2]=cz+(Math.random()-.5)*480;
      }
      anyChange=true;
    }
    if(anyChange)_dsaBubbleGeo.attributes.position.needsUpdate=true;
  }
  // Manta ray orbit
  if(_dsaCreatures.manta){
    const m=_dsaCreatures.manta;
    m.angle+=dt*m.speed;
    m.wavePhase+=dt*1.2;
    const mx=Math.cos(m.angle)*m.radius,mz=Math.sin(m.angle)*m.radius;
    m.group.position.set(mx,7+Math.sin(m.wavePhase)*.9,mz);
    m.group.rotation.y=m.angle+Math.PI/2;
    m.group.rotation.z=Math.sin(m.wavePhase)*.18;
  }
  // Whale slow orbit
  if(_dsaCreatures.whale){
    const w=_dsaCreatures.whale;
    w.angle+=dt*w.speed;
    w.group.position.x=w.cx+Math.cos(w.angle)*w.radius;
    w.group.position.z=w.cz+Math.sin(w.angle)*w.radius;
    w.group.position.y=36+Math.sin(w.angle*2.3)*4;
    w.group.rotation.y=w.angle+Math.PI/2;
  }
  // Fish schools orbit
  _dsaCreatures.fishSchools.forEach(fs=>{
    fs.phase+=dt*fs.speed;
    const dm3=new THREE.Object3D();
    for(let fi=0;fi<18;fi++){
      const ang=fs.phase+fi*(Math.PI*2/18);
      dm3.position.set(
        fs.cx+Math.cos(ang)*fs.radius+(Math.sin(fi*1.3+t*.5)*3),
        fs.cy+Math.sin(fi*.8+t*.4)*2,
        fs.cz+Math.sin(ang)*fs.radius+(Math.cos(fi*1.1+t*.4)*3)
      );
      dm3.rotation.y=ang+Math.PI/2;dm3.updateMatrix();
      fs.mesh.setMatrixAt(fi,dm3.matrix);
    }
    fs.mesh.instanceMatrix.needsUpdate=true;
  });
  // Underwater current effect on player car — gentle drift, scaled by the
  // lap-progressive current signature (window._dsaCurrentDriftMult, default 1).
  if(activeWorld==='deepsea'){
    const car=carObjs[playerIdx];
    if(car&&!recoverActive){
      const driftMult=(typeof window._dsaCurrentDriftMult==='number')?window._dsaCurrentDriftMult:1;
      _dsaCurrentDir+=dt*.04*driftMult;
      const drift=.0008*driftMult;
      car.mesh.position.x+=Math.cos(_dsaCurrentDir)*drift*car.speed*60*dt;
      car.mesh.position.z+=Math.sin(_dsaCurrentDir)*drift*car.speed*60*dt;
    }
  }
  // Lap-progressive current intensification — runs LAST so it overrides
  // _wpCurrentStreams strength for the next checkCurrentStreams call.
  if(typeof updateDeepSeaCurrent==='function'){
    const _pl=carObjs[playerIdx];
    updateDeepSeaCurrent(dt, _pl?_pl.lap:1);
  }
}

