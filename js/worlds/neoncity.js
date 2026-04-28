// js/worlds/neoncity.js — neoncity world builders + update + collision checks
// Non-module script.

'use strict';

// Per-world state (uit main.js verhuisd) — gereset in core/scene.js buildScene().
let _neonBuildings=[],_neonEmissives=[],_neonBuildingLights=[];
let _holoBillboards=[];
let _neonSteamGeo=null,_neonSteamPts=null,_neonSteamPos=null;
let _neonDustGeo=null,_neonDustPts=null;
const _neonSteamVents=[];
let _neonWater=null;
let _neonEmpZones=[],_neonHoloWalls=[];

function buildNeonCityEnvironment(){
  buildNeonGround();
  buildNeonSkyscrapers();
  buildNeonHoloBillboards();
  buildNeonBarriers();
  buildNeonTunnel();
  buildNeonFlyover();
  buildNeonWaterfront();
  buildNeonStreetLamps();
  buildNeonParticles();
  buildNeonSkyGlow();
  buildNeonNightObjects();
}


function buildNeonGround(){
  // Dark wet asphalt base
  const asphalt=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),
    new THREE.MeshLambertMaterial({color:0x080810}));
  asphalt.rotation.x=-Math.PI/2;asphalt.position.y=-.15;asphalt.receiveShadow=true;
  scene.add(asphalt);
  // Wet reflective overlay — key for the Blade Runner look
  const wet=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),
    new THREE.MeshLambertMaterial({color:0x0e0e20,transparent:true,opacity:.38}));
  wet.rotation.x=-Math.PI/2;wet.position.y=-.12;scene.add(wet);
  _neonWater=wet;
  // Sheen-banden overlay: tileable canvas met horizontale lichte gradients
  // die magenta+cyan reflectie suggereren. AdditiveBlending + UV-scroll
  // (zie updateNeonCityWorld) → "dancing reflection" effect onder de bloom.
  const sheenCv=document.createElement('canvas');sheenCv.width=512;sheenCv.height=512;
  const sCtx=sheenCv.getContext('2d');
  sCtx.fillStyle='rgba(0,0,0,0)';sCtx.fillRect(0,0,512,512);
  // Magenta band — toned down from 0.42 alpha to 0.22 to keep luminance below bloom threshold.
  let mg=sCtx.createLinearGradient(0,80,0,160);
  mg.addColorStop(0,'rgba(255,40,180,0)');
  mg.addColorStop(.5,'rgba(255,40,180,0.22)');
  mg.addColorStop(1,'rgba(255,40,180,0)');
  sCtx.fillStyle=mg;sCtx.fillRect(0,80,512,80);
  // Cyan band
  let cg=sCtx.createLinearGradient(0,260,0,360);
  cg.addColorStop(0,'rgba(40,255,220,0)');
  cg.addColorStop(.5,'rgba(40,255,220,0.22)');
  cg.addColorStop(1,'rgba(40,255,220,0)');
  sCtx.fillStyle=cg;sCtx.fillRect(0,260,512,100);
  // Yellow accent band
  let yg=sCtx.createLinearGradient(0,420,0,470);
  yg.addColorStop(0,'rgba(255,240,80,0)');
  yg.addColorStop(.5,'rgba(255,240,80,0.16)');
  yg.addColorStop(1,'rgba(255,240,80,0)');
  sCtx.fillStyle=yg;sCtx.fillRect(0,420,512,50);
  const sheenTex=new THREE.CanvasTexture(sheenCv);
  sheenTex.wrapS=sheenTex.wrapT=THREE.RepeatWrapping;
  sheenTex.repeat.set(2,2);sheenTex.needsUpdate=true;
  const sheen=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),
    new THREE.MeshBasicMaterial({map:sheenTex,transparent:true,opacity:.32,blending:THREE.AdditiveBlending,depthWrite:false}));
  sheen.rotation.x=-Math.PI/2;sheen.position.y=-.10;scene.add(sheen);
  _neonWater.userData.sheen=sheen;
  // Neon puddles — coloured reflective pools scattered off-track
  const puddleColors=[0x00ffee,0xff00aa,0x4488ff,0xeeff00,0x00ffee,0xff2288];
  for(let i=0;i<_mobCount(22);i++){
    const t=i/22;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(TW+6+Math.random()*12);
    const puddle=new THREE.Mesh(
      new THREE.PlaneGeometry(2+Math.random()*6,1+Math.random()*4),
      new THREE.MeshLambertMaterial({
        color:puddleColors[i%puddleColors.length],
        emissive:puddleColors[i%puddleColors.length],
        emissiveIntensity:.7,
        transparent:true,opacity:.45+Math.random()*.15,
        blending:THREE.AdditiveBlending,depthWrite:false
})
    );
    puddle.rotation.x=-Math.PI/2;puddle.rotation.z=Math.random()*Math.PI;
    puddle.position.set(p.x+nr.x*side,-.10,p.z+nr.z*side);
    scene.add(puddle);
  }
}


function buildNeonSkyscrapers(){
  const buildingColors=[0x060618,0x080820,0x050514,0x0a0a22,0x040410,0x07071a];
  const neonAccents=[0x00ffee,0xff00aa,0x2244ff,0xff2288,0xeeff00,0x00aaff,0xff6600,0xaa00ff];
  for(let i=0;i<_mobCount(40);i++){
    const t=(i/40+Math.random()*.006)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+30+Math.random()*60);
    const bx=p.x+nr.x*side+(Math.random()-.5)*14;
    const bz=p.z+nr.z*side+(Math.random()-.5)*14;
    // Varied building proportions — slim towers, wide blocks, mixed
    const h=22+Math.random()*68;
    const w=4+Math.random()*14;
    const d=4+Math.random()*10;
    const accentCol=neonAccents[Math.floor(Math.random()*neonAccents.length)];
    const bodyMat=new THREE.MeshLambertMaterial({color:buildingColors[Math.floor(Math.random()*buildingColors.length)]});
    const body=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),bodyMat);
    body.position.set(bx,h/2,bz);body.castShadow=true;scene.add(body);
    // Neon accent stripes (2-5 per building)
    const stripeCount=2+Math.floor(Math.random()*4);
    for(let s=0;s<stripeCount;s++){
      const sy=h*(0.12+s*(0.72/stripeCount)+Math.random()*0.04);
      const stripeMat=new THREE.MeshLambertMaterial({color:accentCol,emissive:accentCol,emissiveIntensity:2.2});
      const stripe=new THREE.Mesh(new THREE.BoxGeometry(w+.3,.2,d+.3),stripeMat);
      stripe.position.set(bx,sy,bz);scene.add(stripe);
      _neonEmissives.push({mesh:stripe,phase:Math.random()*Math.PI*2,baseInt:2.2});
    }
    // Window grid via canvas texture (80% of buildings)
    if(Math.random()>.2){
      const cvs=document.createElement('canvas');cvs.width=64;cvs.height=128;
      const ctx=cvs.getContext('2d');
      ctx.fillStyle='#000000';ctx.fillRect(0,0,64,128);
      for(let wy=0;wy<16;wy++) for(let wx=0;wx<8;wx++){
        if(Math.random()>.38){
          const isBlue=Math.random()>.6;
          ctx.fillStyle=isBlue?'#2a3d66':(Math.random()>.5?'#ffe4a0':'#ffcc80');
          ctx.fillRect(wx*8+1,wy*8+1,6,6);
        }
      }
      const wTex=new THREE.CanvasTexture(cvs);
      wTex.minFilter=THREE.NearestFilter;wTex.magFilter=THREE.NearestFilter;
      const wFace=new THREE.Mesh(new THREE.PlaneGeometry(w-.6,h-2),
        new THREE.MeshStandardMaterial({map:wTex,emissiveMap:wTex,emissive:new THREE.Color(1,1,1),emissiveIntensity:.42,transparent:true}));
      wFace.position.set(bx,h/2,bz+d/2+.07);scene.add(wFace);
      // Also on side face for depth
      if(Math.random()>.5){
        const wSide=new THREE.Mesh(new THREE.PlaneGeometry(d-.4,h-2),
          new THREE.MeshStandardMaterial({map:wTex,emissiveMap:wTex,emissive:new THREE.Color(1,1,1),emissiveIntensity:.28,transparent:true}));
        wSide.position.set(bx+w/2+.07,h/2,bz);wSide.rotation.y=Math.PI/2;scene.add(wSide);
      }
    }
    // Rooftop light every 4th building
    if(i%4===0){
      const rl=new THREE.PointLight(accentCol,1.6+Math.random(),38+Math.random()*18);
      rl.position.set(bx,h+.8,bz);scene.add(rl);
      _neonBuildingLights.push(rl);
      trackLightList.push(rl);
    }
    _neonBuildings.push({x:bx,z:bz,h,accentCol});
  }
}


function buildNeonHoloBillboards(){
  const messages=["SPENCER'S RACE CLUB","NEON CITY GP","TURBO BOOST",
    "SPEED DEMON","RACE HARDER","DRIFT KING","NITRO ZONE","FINISH LINE"];
  const colors=[0x00ffee,0xff00aa,0xeeff00,0x2288ff,0xff4488,0x44ffcc,0xffaa00,0xaa44ff];
  for(let i=0;i<8;i++){
    const t=(i/8+.06)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+22+Math.random()*18);
    const hex='#'+colors[i].toString(16).padStart(6,'0');
    const cvs=document.createElement('canvas');cvs.width=256;cvs.height=64;
    const ctx=cvs.getContext('2d');
    ctx.clearRect(0,0,256,64);
    ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(0,0,256,64);
    // Glow border
    ctx.strokeStyle=hex;ctx.lineWidth=2;ctx.globalAlpha=.4;
    ctx.strokeRect(2,2,252,60);ctx.globalAlpha=1;
    // Double-draw for neon glow effect
    ctx.font='bold 20px "Courier New",monospace';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.shadowColor=hex;ctx.shadowBlur=22;ctx.fillStyle=hex;
    ctx.fillText(messages[i],128,32);
    ctx.shadowBlur=8;ctx.fillText(messages[i],128,32);
    const tex=new THREE.CanvasTexture(cvs);
    const mat=new THREE.MeshStandardMaterial({
      map:tex,emissiveMap:tex,emissive:new THREE.Color(1,1,1),emissiveIntensity:2.0,
      transparent:true,opacity:.9,side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending,depthWrite:false
    });
    const bh=9+Math.random()*8;
    const billboard=new THREE.Mesh(new THREE.PlaneGeometry(14,3.5),mat);
    billboard.position.set(p.x+nr.x*side,bh,p.z+nr.z*side);
    billboard.lookAt(p.x,bh,p.z);scene.add(billboard);
    // Support pole
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.08,.12,bh,6),
      new THREE.MeshLambertMaterial({color:0x1a1a2a}));
    pole.position.set(billboard.position.x,bh/2,billboard.position.z);scene.add(pole);
    // Glow light behind billboard
    const bl=new THREE.PointLight(colors[i],1.2,18);
    bl.position.copy(billboard.position);scene.add(bl);
    trackLightList.push(bl);
    _holoBillboards.push({mesh:billboard,baseY:bh,phase:Math.random()*Math.PI*2,col:colors[i],light:bl});
  }
}


function buildNeonBarriers(){
  const N=_mobCount(240);
  const barrierCols=[0x00ffee,0xff00aa];
  [-1,1].forEach((side,si)=>{
    for(let i=0;i<N;i++){
      const t=i/N;
      const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      const pos=p.clone().addScaledVector(nr,side*BARRIER_OFF);
      const mat=new THREE.MeshLambertMaterial({
        color:barrierCols[si],emissive:barrierCols[si],
        emissiveIntensity:1.5,transparent:true,opacity:.82
});
      const seg=new THREE.Mesh(new THREE.BoxGeometry(.22,.85,1.0),mat);
      seg.position.copy(pos);seg.position.y=.425;
      seg.rotation.y=Math.atan2(tg.x,tg.z);scene.add(seg);
      // Accent lights every 10 segments
      if(i%10===0){
        const bl=new THREE.PointLight(barrierCols[si],.55,14);
        bl.position.copy(pos);bl.position.y=1.0;scene.add(bl);
        trackLightList.push(bl);
      }
    }
  });
}


function buildNeonTunnel(){
  // Tunnel over waypoints 8-10: t≈.44-.58
  const tStart=.44,tEnd=.58;
  const segments=_mobCount(20);
  const darkMat=new THREE.MeshLambertMaterial({color:0x060615,side:THREE.DoubleSide});
  const neonMatC=new THREE.MeshLambertMaterial({color:0x00ffee,emissive:0x00ffee,emissiveIntensity:2.8});
  const neonMatM=new THREE.MeshLambertMaterial({color:0xff00aa,emissive:0xff00aa,emissiveIntensity:2.5});
  for(let i=0;i<segments;i++){
    const t=tStart+(i/segments)*(tEnd-tStart);
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const angle=Math.atan2(tg.x,tg.z);
    const isCyan=i%3===0,isMag=i%3===1;
    const archMat=isCyan?neonMatC:isMag?neonMatM:darkMat;
    // Roof arch (half torus)
    const arch=new THREE.Mesh(new THREE.TorusGeometry(TW+3.5,.55,5,16,Math.PI),archMat);
    arch.position.copy(p);arch.position.y=0;arch.rotation.y=angle;scene.add(arch);
    // Side walls
    [-1,1].forEach(s=>{
      const wallPos=p.clone().addScaledVector(nr,s*(TW+3.5));
      const wall=new THREE.Mesh(new THREE.BoxGeometry(.35,TW+5,.2),darkMat);
      wall.position.copy(wallPos);wall.position.y=(TW+5)/2;scene.add(wall);
    });
    // Glow lights at neon arches
    if(isCyan||isMag){
      const lc=isCyan?0x00ffee:0xff00aa;
      const tl=new THREE.PointLight(lc,1.6,24);
      tl.position.copy(p);tl.position.y=TW+2;scene.add(tl);
      trackLightList.push(tl);
    }
    // Ground glow strip inside tunnel
    const glow=new THREE.Mesh(new THREE.PlaneGeometry(TW*1.85,.5),
      new THREE.MeshLambertMaterial({color:0x001520,emissive:0x00ffee,emissiveIntensity:.35,transparent:true,opacity:.6}));
    glow.rotation.x=-Math.PI/2;glow.position.copy(p);glow.position.y=.02;scene.add(glow);
  }
}


function buildNeonFlyover(){
  // Elevated section t≈.27-.44 — pillars with magenta neon rings below
  const pillarMat=new THREE.MeshLambertMaterial({color:0x101020});
  const ringMat=new THREE.MeshLambertMaterial({color:0xff00aa,emissive:0xff00aa,emissiveIntensity:2.0});
  const beamMat=new THREE.MeshLambertMaterial({color:0x0c0c1c});
  // 12 pillar pairs along the flyover
  for(let i=0;i<12;i++){
    const t=.27+(i/11)*(.44-.27);
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    // Height follows flyover curve: sine arch peaking at t=.355
    const mid=(.27+.44)/2;
    const span=(.44-.27)/2;
    const heightT=1-Math.abs(t-mid)/span;
    const ph=Math.max(0,Math.sin(heightT*Math.PI)*14);
    if(ph<1.5)continue;
    [-1,1].forEach(s=>{
      const px=p.x+nr.x*s*TW*.62,pz=p.z+nr.z*s*TW*.62;
      // Main pillar
      const pillar=new THREE.Mesh(new THREE.CylinderGeometry(.45,.65,ph,7),pillarMat);
      pillar.position.set(px,ph/2,pz);scene.add(pillar);
      // Neon ring at top
      const ring=new THREE.Mesh(new THREE.TorusGeometry(.75,.12,5,14),ringMat);
      ring.position.set(px,ph-.3,pz);ring.rotation.x=Math.PI/2;scene.add(ring);
      _neonEmissives.push({mesh:ring,phase:i*.5+s*1.2,baseInt:2.0});
      // Cross beam between pillars
      if(s===1){
        const bx=(p.x+nr.x*TW*.62+p.x-nr.x*TW*.62)/2;
        const bz=(p.z+nr.z*TW*.62+p.z-nr.z*TW*.62)/2;
        const beam=new THREE.Mesh(new THREE.BoxGeometry(TW*1.24,.4,.4),beamMat);
        beam.position.set(bx,ph,bz);beam.rotation.y=Math.atan2(nr.x,nr.z);scene.add(beam);
      }
      // Point light every other pillar
      if(i%2===0){
        const pl=new THREE.PointLight(0xff00aa,1.0,20);
        pl.position.set(px,ph+.5,pz);scene.add(pl);
        _neonBuildingLights.push(pl);
      }
    });
  }
}


function buildNeonWaterfront(){
  // Wide water strip along the S/F straight (west side)
  const waterMat=new THREE.MeshLambertMaterial({
    color:0x000c18,transparent:true,opacity:.85
});
  const water=new THREE.Mesh(new THREE.PlaneGeometry(100,580),waterMat);
  water.rotation.x=-Math.PI/2;water.position.set(-75,-.06,60);scene.add(water);
  // Neon color reflection strips on water
  const reflectCols=[0x00ffee,0xff00aa,0xeeff00];
  reflectCols.forEach((col,i)=>{
    const r=new THREE.Mesh(new THREE.PlaneGeometry(6+Math.random()*8,55),
      new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.10+Math.random()*.08,
        blending:THREE.AdditiveBlending,depthWrite:false}));
    r.rotation.x=-Math.PI/2;r.position.set(-58+i*16,-.05,80+Math.random()*30);scene.add(r);
  });
  // Quay edge — dark concrete wall
  const quay=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.4,560),
    new THREE.MeshLambertMaterial({color:0x0a0a18}));
  quay.position.set(-26,.5,60);scene.add(quay);
  // Neon tube lamps along quay
  for(let i=0;i<_mobCount(14);i++){
    const z=-240+i*(480/13);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.055,.08,5.5,5),
      new THREE.MeshLambertMaterial({color:0x1c1c2c}));
    pole.position.set(-26,2.75,z);scene.add(pole);
    const col=i%2===0?0x00ffee:0xff00aa;
    const tube=new THREE.Mesh(new THREE.BoxGeometry(1.6,.12,.12),
      new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:2.8}));
    tube.position.set(-26,5.6,z);scene.add(tube);
    const pl=new THREE.PointLight(col,1.5,22);pl.position.set(-26,5.5,z);scene.add(pl);
    trackLightList.push(pl);
  }
}


function buildNeonStreetLamps(){
  // Track-side neon tube lamps (replaces standard GP lamp posts)
  const N=_mobCount(28);
  for(let i=0;i<N;i++){
    const t=i/N;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    [-1,1].forEach((side,si)=>{
      const pp=p.clone().addScaledVector(nr,side*(BARRIER_OFF+2.2));
      // Slim dark pole
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.06,.09,7.5,5),
        new THREE.MeshLambertMaterial({color:0x141424}));
      pole.position.copy(pp);pole.position.y=3.75;scene.add(pole);
      trackPoles.push(pole);
      // Horizontal neon tube on top (alternating cyan/magenta)
      const col=si===0?0x00ffee:0xff00aa;
      const tube=new THREE.Mesh(new THREE.BoxGeometry(2.2,.12,.12),
        new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:2.4}));
      tube.position.copy(pp);tube.position.y=7.55;scene.add(tube);
      trackPoles.push(tube);
      _neonEmissives.push({mesh:tube,phase:i*.4+si*1.8,baseInt:2.4});
      const pl=new THREE.PointLight(col,0,20);pl.position.copy(pp);pl.position.y=7.4;
      scene.add(pl);trackLightList.push(pl);
    });
  }
  // Stars = neon dust cloud spheres far above
  const sg=new THREE.SphereGeometry(.18,4,4);
  const sm=new THREE.MeshBasicMaterial({color:0x00ffee,transparent:true,opacity:.8});
  stars=new THREE.InstancedMesh(sg,sm,120);stars.visible=true;
  const dm=new THREE.Object3D();
  for(let i=0;i<120;i++){
    const th=Math.random()*Math.PI*2,ph=Math.random()*Math.PI*.35,r=280+Math.random()*90;
    dm.position.set(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph)*.4+80,r*Math.sin(ph)*Math.sin(th));
    dm.scale.setScalar(.5+Math.random()*1.5);dm.updateMatrix();stars.setMatrixAt(i,dm.matrix);
  }
  stars.instanceMatrix.needsUpdate=true;scene.add(stars);
  // Headlights for night driving
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);
}


function buildNeonParticles(){
  // Steam vents — 6 locations off track
  for(let i=0;i<6;i++){
    const t=(i/6+.08)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(TW+5+Math.random()*5);
    const vx=p.x+nr.x*side,vz=p.z+nr.z*side;
    // Grate on ground
    const grate=new THREE.Mesh(new THREE.BoxGeometry(1.2,.05,1.2),
      new THREE.MeshLambertMaterial({color:0x1a1a28}));
    grate.position.set(vx,-.10,vz);scene.add(grate);
    _neonSteamVents.push({x:vx,z:vz,phase:Math.random()*Math.PI*2});
  }
  // Steam particle system
  const N=_mobCount(200);
  const sGeo=new THREE.BufferGeometry();
  const sPos=new Float32Array(N*3);
  // Initialise at vent positions
  for(let i=0;i<N;i++){
    const vi=i%_neonSteamVents.length;
    if(_neonSteamVents[vi]){
      sPos[i*3]=_neonSteamVents[vi].x+(Math.random()-.5)*.5;
      sPos[i*3+1]=Math.random()*4;
      sPos[i*3+2]=_neonSteamVents[vi].z+(Math.random()-.5)*.5;
    }
  }
  sGeo.setAttribute('position',new THREE.Float32BufferAttribute(sPos,3));
  _neonSteamPts=new THREE.Points(sGeo,
    new THREE.PointsMaterial({color:0x8899bb,size:.22,transparent:true,opacity:.38,sizeAttenuation:true}));
  scene.add(_neonSteamPts);_neonSteamGeo=sGeo;_neonSteamPos=sPos;
  // Floating neon dust (cyan+magenta micro-particles)
  const DN=_mobCount(350);
  const dGeo=new THREE.BufferGeometry();
  const dPos=new Float32Array(DN*3);
  const dCol=new Float32Array(DN*3);
  const neonPairs=[[0,1,1],[1,0,.67],[.87,1,0],[.13,.53,1],[1,.13,.53]];
  for(let i=0;i<DN;i++){
    dPos[i*3]=(Math.random()-.5)*520;
    dPos[i*3+1]=Math.random()*20+.5;
    dPos[i*3+2]=(Math.random()-.5)*520;
    const c=neonPairs[i%neonPairs.length];
    dCol[i*3]=c[0];dCol[i*3+1]=c[1];dCol[i*3+2]=c[2];
  }
  dGeo.setAttribute('position',new THREE.Float32BufferAttribute(dPos,3));
  dGeo.setAttribute('color',new THREE.Float32BufferAttribute(dCol,3));
  _neonDustPts=new THREE.Points(dGeo,
    new THREE.PointsMaterial({vertexColors:true,size:.2,transparent:true,opacity:.55,sizeAttenuation:false}));
  scene.add(_neonDustPts);_neonDustGeo=dGeo;
}


function buildNeonSkyGlow(){
  // Distant city smog glow at horizon — 4 large translucent spheres
  const glowData=[
    {pos:[-400,60,-600],col:0x330066,op:.12},{pos:[500,50,-500],col:0x660033,op:.10},
    {pos:[-300,40,500],col:0x003344,op:.09},{pos:[450,55,450],col:0x220055,op:.11}
  ];
  glowData.forEach(g=>{
    const s=new THREE.Mesh(new THREE.SphereGeometry(160,8,6),
      new THREE.MeshBasicMaterial({color:g.col,transparent:true,opacity:g.op,side:THREE.BackSide}));
    s.position.set(g.pos[0],g.pos[1],g.pos[2]);scene.add(s);
  });
  // Neon fog plane at street level — adds depth to the city
  const fogPlane=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),
    new THREE.MeshBasicMaterial({color:0x050012,transparent:true,opacity:.25,
      blending:THREE.AdditiveBlending,depthWrite:false}));
  fogPlane.rotation.x=-Math.PI/2;fogPlane.position.y=.5;scene.add(fogPlane);
}


function buildNeonNightObjects(){
  // Neon city is always night — immediately activate all track lights
  trackLightList.forEach(l=>{ l.intensity=(l.intensity||0)>0?l.intensity:1.4; });
  trackPoles.forEach(p=>{ p.visible=true; });
}


// TODO niet ge-wired: deze EMP-zones (3 stuks) en buildNeonHoloWalls
// hieronder worden niet aangeroepen door buildNeonCityEnvironment(). De
// _neonEmpZones / _neonHoloWalls arrays in updateNeonCityWorld() zijn dus
// no-ops. Activeer in buildNeonCityEnvironment() na _neonBuildings setup.
function buildNeonEMPZones(){
  const defs=[{t:.22},{t:.52},{t:.78}];
  defs.forEach((def,di)=>{
    const p=trackCurve.getPoint(def.t).clone();
    // Hexagonal pad on track
    const pad=new THREE.Mesh(new THREE.CylinderGeometry(5.5,5.5,.08,6),
      new THREE.MeshLambertMaterial({color:0x001a2a,emissive:0x00ffee,emissiveIntensity:1.2,transparent:true,opacity:.7}));
    pad.position.copy(p);pad.position.y=.02;scene.add(pad);
    // Pulsing ring
    const ring=new THREE.Mesh(new THREE.TorusGeometry(5.8,.2,6,32),
      new THREE.MeshLambertMaterial({color:0x00ffee,emissive:0x00ffee,emissiveIntensity:2.2}));
    ring.rotation.x=Math.PI/2;ring.position.copy(p);ring.position.y=.15;scene.add(ring);
    // WARNING sprite
    const cvs=document.createElement('canvas');cvs.width=128;cvs.height=40;
    const ctx=cvs.getContext('2d');ctx.fillStyle='rgba(0,20,30,.8)';ctx.fillRect(0,0,128,40);
    ctx.font='bold 14px Orbitron,monospace';ctx.fillStyle='#00ffee';ctx.textAlign='center';
    ctx.fillText('⚡ EMP ZONE',64,26);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cvs),transparent:true}));
    sp.position.copy(p);sp.position.y=4;sp.scale.set(10,3,1);scene.add(sp);
    const pl=new THREE.PointLight(0x00ffee,.8,14);pl.position.copy(p);pl.position.y=1;scene.add(pl);
    _neonEmpZones.push({pos:p.clone(),pad,ring,pl,cooldown:0});
  });
}


// Procedurele scanline-texture: dunne horizontale lijnen op zwart. Tileable
// in T-richting zodat UV-scroll continue naar boven beweegt (zie update).
function _buildHoloScanlineTex(){
  const c=document.createElement('canvas');c.width=64;c.height=128;
  const g=c.getContext('2d');
  g.fillStyle='#000000';g.fillRect(0,0,64,128);
  // Bright scanlines every 4 pixels
  g.fillStyle='#aaffee';
  for(let y=0;y<128;y+=4){g.fillRect(0,y,64,1);}
  // A few brighter "data ticks" at random positions
  g.fillStyle='#ffffff';
  for(let i=0;i<6;i++){g.fillRect(Math.floor(Math.random()*60),Math.floor(Math.random()*128),4,2);}
  // Subtle vertical column gradient (gradient brightness left-right)
  g.globalAlpha=.18;g.fillStyle='#000000';
  for(let x=0;x<64;x++){g.globalAlpha=.18*(.5-Math.cos(x/32*Math.PI*2)*.5);g.fillRect(x,0,1,128);}
  g.globalAlpha=1;
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(2,1);
  t.needsUpdate=true;return t;
}

function buildNeonHoloWalls(){
  const defs=[{t:.42},{t:.70}];
  defs.forEach((def,wi)=>{
    const p=trackCurve.getPoint(def.t),tg=trackCurve.getTangent(def.t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const angle=Math.atan2(tg.x,tg.z);
    const scanTex=_buildHoloScanlineTex();
    const mat=new THREE.MeshLambertMaterial({
      color:0x00ffee,emissive:0x00ffee,emissiveIntensity:1.0,transparent:true,opacity:.55,
      side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false,
      map:scanTex,emissiveMap:scanTex
});
    const wall=new THREE.Mesh(new THREE.BoxGeometry(TW*.7,3.8,.15),mat);
    wall.position.copy(p);wall.position.y=1.9;wall.rotation.y=angle;scene.add(wall);
    // Frame
    const frameMat=new THREE.MeshLambertMaterial({color:0x00ffee,emissive:0x00ffee,emissiveIntensity:2.5});
    const frame=new THREE.Mesh(new THREE.BoxGeometry(TW*.7+.3,.18,.18),frameMat);
    frame.position.copy(p);frame.position.y=3.8;frame.rotation.y=angle;scene.add(frame);
    const frame2=new THREE.Mesh(new THREE.BoxGeometry(TW*.7+.3,.18,.18),frameMat);
    frame2.position.copy(p);frame2.position.y=.09;frame2.rotation.y=angle;scene.add(frame2);
    _neonHoloWalls.push({mesh:wall,basePos:p.clone(),normal:nr.clone(),phase:wi*3,cooldown:0});
  });
}


function updateNeonCityWorld(dt){
  if(!scene)return;
  const t=_nowSec;
  // Building neon stripes pulse — slow organic breathing + occasional staccato
  // failing-tube flicker (~0.3% chance/frame per item ⇒ ~1 dropout per 5s).
  _neonEmissives.forEach((item,i)=>{
    if(!item.mesh||!item.mesh.material)return;
    const pulse=item.baseInt*.6+item.baseInt*.7*Math.sin(t*1.6+item.phase);
    if(item.flickerEnd===undefined)item.flickerEnd=0;
    if(t>item.flickerEnd&&Math.random()<.003){
      item.flickerEnd=t+0.05+Math.random()*0.12;
    }
    item.mesh.material.emissiveIntensity=(t<item.flickerEnd)?0:Math.max(0,pulse);
  });
  // Holo billboards: float + opacity flicker + occasional glitch blackout
  _holoBillboards.forEach((bb,i)=>{
    bb.mesh.position.y=bb.baseY+Math.sin(t*.65+bb.phase)*.5;
    let op=.65+Math.sin(t*1.0+bb.phase*.9)*.24;
    if(bb.glitchEnd===undefined)bb.glitchEnd=0;
    if(t>bb.glitchEnd&&Math.random()<.002){
      bb.glitchEnd=t+0.04+Math.random()*0.08;
    }
    if(t<bb.glitchEnd)op=0.04;
    bb.mesh.material.opacity=op;
    if(bb.light)bb.light.intensity=(t<bb.glitchEnd)?0:(.8+Math.sin(t*1.8+bb.phase)*.5);
  });
  // Steam vents — particles rise and drift
  if(_neonSteamGeo&&_neonSteamPos&&_neonSteamVents.length>0){
    const pos=_neonSteamPos;const N=pos.length/3;
    for(let i=0;i<N;i++){
      pos[i*3+1]+=dt*(1.0+Math.random()*.6);
      pos[i*3]+= Math.sin(t*2.2+i*.4)*.012;
      pos[i*3+2]+=Math.cos(t*1.8+i*.5)*.012;
      if(pos[i*3+1]>4.5+Math.random()*2.5){
        const vi=i%_neonSteamVents.length;
        pos[i*3]=_neonSteamVents[vi].x+(Math.random()-.5)*.55;
        pos[i*3+1]=Math.random()*.2;
        pos[i*3+2]=_neonSteamVents[vi].z+(Math.random()-.5)*.55;
      }
    }
    _neonSteamGeo.attributes.position.needsUpdate=true;
  }
  // Neon dust drift
  if(_neonDustGeo){
    const pos=_neonDustGeo.attributes.position.array;
    const car=carObjs[playerIdx];
    const cx=car?car.mesh.position.x:0,cz=car?car.mesh.position.z:0;
    const step=Math.floor(t*pos.length/3)%(pos.length/3/4|0)||1;
    for(let i=step;i<Math.min(step+40,pos.length/3);i++){
      pos[i*3+1]+=Math.sin(t*.25+i*.6)*.006;
      if(Math.abs(pos[i*3]-cx)>265||Math.abs(pos[i*3+2]-cz)>265){
        pos[i*3]=cx+(Math.random()-.5)*500;
        pos[i*3+2]=cz+(Math.random()-.5)*500;
      }
    }
    _neonDustGeo.attributes.position.needsUpdate=true;
  }
  // Building rooftop lights — occasional flicker for life
  if(Math.random()<.015){
    const l=_neonBuildingLights[Math.floor(Math.random()*_neonBuildingLights.length)];
    if(l){const orig=l.intensity;l.intensity=.2+Math.random()*.4;setTimeout(()=>{l.intensity=orig;},60+Math.random()*100);}
  }
  // Holo walls: oscillate left-right + scanline UV scroll (scrollt omhoog
  // doordat we offset.y omlaag schuiven) + opacity flicker.
  _neonHoloWalls.forEach((wall,i)=>{
    const offset=Math.sin(t*.5+i*3)*TW*.32;
    wall.mesh.position.x=wall.basePos.x+wall.normal.x*offset;
    wall.mesh.position.z=wall.basePos.z+wall.normal.z*offset;
    wall.mesh.material.opacity=.45+Math.sin(t*3.5+i*2)*.20;
    if(wall.mesh.material.map){
      wall.mesh.material.map.offset.y=(wall.mesh.material.map.offset.y-dt*0.6+1)%1;
    }
  });
  // EMP zones pulse
  _neonEmpZones.forEach((emp,i)=>{
    emp.pad.material.opacity=.45+Math.sin(t*2.8+i*2.1)*.25;
    emp.ring.scale.setScalar(1+Math.sin(t*2+i*.8)*.06);
    if(emp.pl)emp.pl.intensity=.6+Math.sin(t*3+i*1.5)*.4;
    // Player collision
    if(emp.cooldown>0){emp.cooldown-=dt;return;}
    const car=carObjs[playerIdx];
    if(!car)return;
    const dx=car.mesh.position.x-emp.pos.x,dz=car.mesh.position.z-emp.pos.z;
    if(Math.sqrt(dx*dx+dz*dz)<5.5){
      car.speed*=.82;camShake=.65;
      showPopup('⚡ EMP ZONE!','#00ffee',1000);emp.cooldown=4;
      // Visual glitch: brief exposure change
      if(renderer)renderer.toneMappingExposure=.4;
      setTimeout(()=>{if(renderer)renderer.toneMappingExposure=1.1;},180);
    }
  });
  // Holo wall collision
  _neonHoloWalls.forEach((wall,i)=>{
    if(wall.cooldown>0){wall.cooldown-=dt;return;}
    const car=carObjs[playerIdx];if(!car)return;
    const dx=car.mesh.position.x-wall.mesh.position.x;
    const dz=car.mesh.position.z-wall.mesh.position.z;
    const dist=Math.sqrt(dx*dx+dz*dz);
    if(dist<TW*.38&&Math.abs(car.mesh.position.y-1.9)<3.5){
      car.speed*=.38;car.spinTimer=.55;
      showPopup('🔷 HOLO-WALL!','#00ffee',900);wall.cooldown=3;
    }
  });
  // Water shimmer — sheen-banden schuiven horizontaal voor "dancing reflections".
  if(_neonWater){
    const sheen=_neonWater.userData.sheen;
    if(sheen&&sheen.material&&sheen.material.map){
      sheen.material.map.offset.x=(sheen.material.map.offset.x+dt*.05)%1;
      sheen.material.map.offset.y=(sheen.material.map.offset.y+dt*.02)%1;
      sheen.material.opacity=.26+Math.sin(t*.7)*.08;
    }
  }
}


