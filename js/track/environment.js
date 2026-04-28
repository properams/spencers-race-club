// js/track/environment.js — non-module script.

'use strict';

// ── Ground texture generators ──────────────────────────────────────────────
// Tileable 256×256 grayscale canvases. Multiplicatief over material.color.
// Niet gecached: disposeScene() ruimt 'm op bij elke world-switch.
function _grassGroundTex(){
  const S=256,c=document.createElement('canvas');c.width=S;c.height=S;
  const g=c.getContext('2d');
  g.fillStyle='#9aaa9a';g.fillRect(0,0,S,S);
  // Pixel noise (yellow-green speckle)
  const id=g.getImageData(0,0,S,S),d=id.data;
  for(let i=0;i<d.length;i+=4){
    const n=120+(Math.random()*80)|0;
    d[i]=n+8;d[i+1]=n+15;d[i+2]=n;d[i+3]=255;
  }
  g.putImageData(id,0,0);
  // Darker patches (dirt/wear)
  for(let i=0;i<14;i++){
    const x=Math.random()*S,y=Math.random()*S,r=8+Math.random()*16;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba(60,70,50,0.45)');grd.addColorStop(1,'rgba(60,70,50,0)');
    g.fillStyle=grd;g.fillRect(x-r,y-r,r*2,r*2);
  }
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(8,8);t.anisotropy=4;t.needsUpdate=true;return t;
}
function _iceGroundTex(){
  const S=256,c=document.createElement('canvas');c.width=S;c.height=S;
  const g=c.getContext('2d');
  g.fillStyle='#ddeef5';g.fillRect(0,0,S,S);
  // Subtle blue-ish noise
  const id=g.getImageData(0,0,S,S),d=id.data;
  for(let i=0;i<d.length;i+=4){
    const n=200+(Math.random()*55)|0;
    d[i]=n-5;d[i+1]=n;d[i+2]=n+8;d[i+3]=255;
  }
  g.putImageData(id,0,0);
  // Crack lines (jagged white-blue)
  g.strokeStyle='rgba(180,210,230,0.55)';g.lineWidth=1;
  for(let i=0;i<10;i++){
    g.beginPath();
    let x=Math.random()*S,y=Math.random()*S;g.moveTo(x,y);
    for(let j=0;j<5;j++){
      x+=(Math.random()-.5)*40;y+=(Math.random()-.5)*40;g.lineTo(x,y);
    }
    g.stroke();
  }
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(6,6);t.anisotropy=4;t.needsUpdate=true;return t;
}
function _rockGroundTex(){
  const S=256,c=document.createElement('canvas');c.width=S;c.height=S;
  const g=c.getContext('2d');
  g.fillStyle='#3a2a25';g.fillRect(0,0,S,S);
  const id=g.getImageData(0,0,S,S),d=id.data;
  for(let i=0;i<d.length;i+=4){
    const n=70+(Math.random()*70)|0;
    d[i]=n+10;d[i+1]=n;d[i+2]=n-8;d[i+3]=255;
  }
  g.putImageData(id,0,0);
  // Glowing lava fissures (orange specks scattered)
  for(let i=0;i<45;i++){
    const x=Math.random()*S,y=Math.random()*S,r=2+Math.random()*5;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba(255,140,40,0.8)');grd.addColorStop(1,'rgba(255,80,20,0)');
    g.fillStyle=grd;g.fillRect(x-r,y-r,r*2,r*2);
  }
  // Crack lines (dark)
  g.strokeStyle='rgba(20,10,5,0.7)';g.lineWidth=2;
  for(let i=0;i<6;i++){
    g.beginPath();
    let x=Math.random()*S,y=Math.random()*S;g.moveTo(x,y);
    for(let j=0;j<6;j++){
      x+=(Math.random()-.5)*50;y+=(Math.random()-.5)*50;g.lineTo(x,y);
    }
    g.stroke();
  }
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(7,7);t.anisotropy=4;t.needsUpdate=true;return t;
}
function _sandGroundTex(){
  const S=256,c=document.createElement('canvas');c.width=S;c.height=S;
  const g=c.getContext('2d');
  g.fillStyle='#c0b08a';g.fillRect(0,0,S,S);
  const id=g.getImageData(0,0,S,S),d=id.data;
  for(let i=0;i<d.length;i+=4){
    const n=170+(Math.random()*55)|0;
    d[i]=n+5;d[i+1]=n;d[i+2]=n-25;d[i+3]=255;
  }
  g.putImageData(id,0,0);
  // Horizontal sand ripples (sine bands)
  for(let y=0;y<S;y+=6){
    const wob=Math.sin(y*.15)*4;
    g.fillStyle='rgba(160,140,110,0.30)';
    g.fillRect(0,y+wob,S,2);
  }
  // Scattered shells/pebbles (small darker dots)
  for(let i=0;i<30;i++){
    g.fillStyle='rgba(80,60,40,0.45)';
    g.fillRect(Math.random()*S,Math.random()*S,2,2);
  }
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(6,6);t.anisotropy=4;t.needsUpdate=true;return t;
}
function _pavementGroundTex(){
  const S=256,c=document.createElement('canvas');c.width=S;c.height=S;
  const g=c.getContext('2d');
  g.fillStyle='#888888';g.fillRect(0,0,S,S);
  const id=g.getImageData(0,0,S,S),d=id.data;
  for(let i=0;i<d.length;i+=4){
    const n=110+(Math.random()*80)|0;
    d[i]=d[i+1]=d[i+2]=n;d[i+3]=255;
  }
  g.putImageData(id,0,0);
  // Tile-grout cross pattern
  g.strokeStyle='rgba(40,40,40,0.45)';g.lineWidth=1;
  for(let x=0;x<S;x+=64){g.beginPath();g.moveTo(x,0);g.lineTo(x,S);g.stroke();}
  for(let y=0;y<S;y+=64){g.beginPath();g.moveTo(0,y);g.lineTo(S,y);g.stroke();}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(10,10);t.anisotropy=4;t.needsUpdate=true;return t;
}

function buildGround(){
  const isSpace=activeWorld==='space',isDS=activeWorld==='deepsea';
  const groundCol=isSpace?0x070710:isDS?0x081820:0x3c7040;
  const infieldCol=isSpace?0x0a0a18:isDS?0x0b2030:0x4a8848;
  // Grand Prix gets grass texture; space/deepsea use buildGround as a backdrop
  // and don't need detail there (their environments overdraw with own ground).
  const groundMat=new THREE.MeshLambertMaterial({color:groundCol});
  if(!isSpace&&!isDS)groundMat.map=_grassGroundTex();
  const g=new THREE.Mesh(new THREE.PlaneGeometry(2200,2200,1,1),groundMat);
  g.rotation.x=-Math.PI/2;g.position.y=-.12;g.receiveShadow=true;scene.add(g);
  if(!isDS){ // Deep sea has its own seafloor built by buildDeepSeaEnvironment
    const infMat=new THREE.MeshLambertMaterial({color:infieldCol});
    if(!isSpace)infMat.map=_grassGroundTex();
    const inf=new THREE.Mesh(new THREE.PlaneGeometry(440,350,1,1),infMat);
    inf.rotation.x=-Math.PI/2;inf.position.set(-10,-.11,-40);scene.add(inf);
  }
}

function buildClouds(){
  const m=new THREE.MeshBasicMaterial({color:0xf8fbff,transparent:true,opacity:.88});
  for(let i=0;i<12;i++){
    const geo=new THREE.SphereGeometry(18+Math.random()*22,7,5);
    geo.scale(1,.25+Math.random()*.14,.65+Math.random()*.35);
    const c=new THREE.Mesh(geo,m);
    c.position.set((Math.random()-.5)*900,85+Math.random()*55,(Math.random()-.5)*900+220);
    scene.add(c);
  }
}


function buildMountains(){
  const mNear=new THREE.MeshLambertMaterial({color:0x3d5878});
  const mFar=new THREE.MeshLambertMaterial({color:0x253850});
  const mSnow=new THREE.MeshLambertMaterial({color:0xddeeff});
  // [x, z, height, radius, hasSnow, sides]
  const peaks=[
    [-300,-520,185,85,true,6],[-80,-575,210,95,true,7],[140,-545,165,75,true,6],
    [340,-495,145,68,false,7],[520,-450,120,58,false,6],
    [570,-290,170,78,true,6],[605,-65,155,72,false,7],[575,165,135,64,false,6],
    [-560,-195,175,80,true,7],[-615,10,162,74,false,6],[-585,190,140,66,false,6],
    [-340,450,105,52,false,6],[-80,500,125,60,false,7],[170,490,110,55,false,6],
    [390,435,98,48,false,7],
  ];
  peaks.forEach(([x,z,h,r,snow,sides])=>{
    const base=new THREE.Mesh(new THREE.ConeGeometry(r*1.4,h*.4,sides),mFar);
    base.position.set(x,-8,z);scene.add(base);
    const peak=new THREE.Mesh(new THREE.ConeGeometry(r,h,sides),mNear);
    peak.position.set(x,0,z);scene.add(peak);
    if(snow){
      const cap=new THREE.Mesh(new THREE.ConeGeometry(r*.3,h*.25,sides),mSnow);
      cap.position.set(x,h*.4,z);scene.add(cap);
    }
  });
}


function buildLake(){
  // Shore bank
  const shore=new THREE.Mesh(new THREE.PlaneGeometry(168,115,1,1),
    new THREE.MeshLambertMaterial({color:0x5ea060}));
  shore.rotation.x=-Math.PI/2;shore.position.set(-10,-.1,-75);scene.add(shore);
  // Water body
  const water=new THREE.Mesh(new THREE.PlaneGeometry(148,98,1,1),
    new THREE.MeshLambertMaterial({color:0x1a6890,transparent:true,opacity:.88}));
  water.rotation.x=-Math.PI/2;water.position.set(-10,-.08,-75);scene.add(water);
  // Shimmer highlight
  const shim=new THREE.Mesh(new THREE.PlaneGeometry(130,82,1,1),
    new THREE.MeshLambertMaterial({color:0x2294b8,transparent:true,opacity:.55}));
  shim.rotation.x=-Math.PI/2;shim.position.set(-10,-.07,-75);scene.add(shim);
}


// TODO niet ge-wired: pit-gebouw builder (~45 regels) is gedefinieerd maar
// wordt nooit aangeroepen door buildGround/buildBarriers/etc. Activeer door
// 'm in core/scene.js buildScene() voor world==='grandprix' te roepen.
function buildPitBuilding(){
  const wMat=new THREE.MeshLambertMaterial({color:0xe4e4e4});
  const rMat=new THREE.MeshLambertMaterial({color:0x383848});
  const aMat=new THREE.MeshLambertMaterial({color:0xff5500});
  const dMat=new THREE.MeshLambertMaterial({color:0x1a1a1a});
  const gMat=new THREE.MeshLambertMaterial({color:0x88ccff,transparent:true,opacity:.75});
  // Main body (south side of S/F straight)
  const body=new THREE.Mesh(new THREE.BoxGeometry(330,7,16),wMat);
  body.position.set(-25,3.5,202);scene.add(body);
  // Roof overhang
  const roof=new THREE.Mesh(new THREE.BoxGeometry(338,.7,23),rMat);
  roof.position.set(-25,7.35,202);scene.add(roof);
  // Orange accent stripe
  const stripe=new THREE.Mesh(new THREE.BoxGeometry(330,.55,16.2),aMat);
  stripe.position.set(-25,6.2,202);scene.add(stripe);
  // Garage bays (9 doors)
  for(let i=0;i<9;i++){
    const gx=-161+i*36;
    const frame=new THREE.Mesh(new THREE.BoxGeometry(22,5.4,.3),wMat);
    frame.position.set(gx,2.5,194.4);scene.add(frame);
    const door=new THREE.Mesh(new THREE.BoxGeometry(20,5,.35),dMat);
    door.position.set(gx,2.5,194.25);scene.add(door);
  }
  // Pit wall
  const pw=new THREE.Mesh(new THREE.BoxGeometry(340,1.4,.9),
    new THREE.MeshLambertMaterial({color:0xffffff}));
  pw.position.set(-25,.7,187);scene.add(pw);
  // Pit entry light strip (green emissive)
  const pitEntry=new THREE.Mesh(new THREE.BoxGeometry(340,.12,.15),
    new THREE.MeshLambertMaterial({color:0x00ff55,emissive:0x00ff55,emissiveIntensity:1.5}));
  pitEntry.position.set(-25,.05,186.8);scene.add(pitEntry);
  // PIT IN text board
  const pitBoard=new THREE.Mesh(new THREE.BoxGeometry(16,3,0.3),
    new THREE.MeshLambertMaterial({color:0x00cc44,emissive:0x004422}));
  pitBoard.position.set(-185,4,190);scene.add(pitBoard);
  // Timing tower (right end of building)
  const tower=new THREE.Mesh(new THREE.BoxGeometry(15,22,13),wMat);
  tower.position.set(185,11,202);scene.add(tower);
  const tcap=new THREE.Mesh(new THREE.BoxGeometry(17,.8,15),aMat);
  tcap.position.set(185,22.4,202);scene.add(tcap);
  for(let f=0;f<3;f++){
    const win=new THREE.Mesh(new THREE.BoxGeometry(9,2.2,.3),gMat);
    win.position.set(185,6+f*4.8,195.5);scene.add(win);
  }
}


function buildGravelTraps(){
  const gMat=new THREE.MeshLambertMaterial({color:0xb8a878});
  [{t:.22,s:1,w:30,l:34},{t:.36,s:1,w:26,l:30},
   {t:.50,s:-1,w:28,l:32},{t:.56,s:-1,w:24,l:28},
   {t:.80,s:1,w:26,l:30}].forEach(({t,s,w,l})=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const pos=p.clone().addScaledVector(nr,s*(TW+w*.5));
    const trap=new THREE.Mesh(new THREE.PlaneGeometry(l,w),gMat);
    trap.rotation.x=-Math.PI/2;trap.rotation.z=Math.atan2(tg.x,tg.z);
    trap.position.copy(pos);trap.position.y=-.05;scene.add(trap);
  });
}


function buildEnvironmentTrees(){
  const trunkGeo=new THREE.CylinderGeometry(.11,.17,1.5,5);
  const cGeo1=new THREE.ConeGeometry(1,4.5,7);
  const cGeo2=new THREE.ConeGeometry(.62,3.5,7);
  const tMat=new THREE.MeshLambertMaterial({color:0x6b4226});
  const lMats=[0x1d6b32,0x2a8040,0x145a28,0x226b35,0x1a5c2a,0x2d7a3a]
    .map(c=>new THREE.MeshLambertMaterial({color:c}));

  function placeTree(x,z,s=1){
    const sc=s*(0.82+Math.random()*.44);
    const lm=lMats[Math.floor(Math.random()*lMats.length)];
    const ry=Math.random()*Math.PI*2;
    const trunk=new THREE.Mesh(trunkGeo,tMat);
    trunk.position.set(x,.75*sc,z);trunk.scale.setScalar(sc);scene.add(trunk);
    const c1=new THREE.Mesh(cGeo1,lm);
    c1.position.set(x,2.5*sc,z);c1.scale.setScalar(sc);c1.rotation.y=ry;scene.add(c1);
    const c2=new THREE.Mesh(cGeo2,lm);
    c2.position.set(x,4.2*sc,z);c2.scale.setScalar(sc);c2.rotation.y=ry+.55;scene.add(c2);
  }

  // Trees just outside the track barriers (55 sample points, both sides)
  for(let i=0;i<55;i++){
    const t=i/55;
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    [-1,1].forEach(side=>{
      const d=BARRIER_OFF+20+Math.random()*38;
      placeTree(
        p.x+nr.x*side*d+(Math.random()-.5)*7,
        p.z+nr.z*side*d+(Math.random()-.5)*7
      );
    });
  }
  // Infield trees (ring around lake, inside circuit)
  for(let i=0;i<32;i++){
    const a=Math.random()*Math.PI*2,d=68+Math.random()*85;
    placeTree(-10+Math.cos(a)*d,-50+Math.sin(a)*d,.85+Math.random()*.3);
  }
}


function buildCenterlineArrows(){
  // Subtle chevrons (>>) along track centerline showing direction of travel
  const mat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.16});
  const N=55;
  for(let i=0;i<N;i++){
    const t=(i+.5)/N;
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const angle=Math.atan2(tg.x,tg.z);
    [-1,1].forEach(s=>{
      const bar=new THREE.Mesh(new THREE.BoxGeometry(.15,.01,1.6),mat);
      bar.position.copy(p);bar.position.y=.022;
      bar.rotation.y=angle+s*.48;
      scene.add(bar);
    });
  }
}


function buildTrackFlags(){
  const flagT=[.02,.10,.19,.28,.37,.47,.56,.65,.74,.82,.90,.96];
  const flagColors=[0xff1111,0x0044ff,0xffee00,0xff7700,0x00cc44,0xffffff,
                    0xff0066,0x44ccff,0xff4400,0x00ffcc,0xff33aa,0xaaff00];
  const poleMat=new THREE.MeshLambertMaterial({color:0x888888});
  flagT.forEach((t,idx)=>{
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=idx%2===0?1:-1;
    const base=p.clone().addScaledVector(nr,side*(BARRIER_OFF+4.5));
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,5.5,6),poleMat);
    pole.position.copy(base);pole.position.y=2.75;scene.add(pole);
    const flagMat=new THREE.MeshBasicMaterial({color:flagColors[idx%flagColors.length],side:THREE.DoubleSide});
    const flag=new THREE.Mesh(new THREE.PlaneGeometry(1.9,1.0),flagMat);
    flag.position.copy(base);flag.position.y=5.2;
    // Orient flag perpendicular to pole, in track tangent direction
    flag.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI*.5;
    scene.add(flag);
    _trackFlags.push({mesh:flag,base:base.clone(),side,idx});
  });
}

function updateFlags(){
  const t=_nowSec;
  _trackFlags.forEach((f,i)=>{
    const wave=Math.sin(t*3.0+i*1.1)*.22;
    const wave2=Math.sin(t*4.8+i*0.7)*.08;
    f.mesh.rotation.x=wave;
    f.mesh.rotation.z=wave2;
  });
  // Crowd dual-frame animation hangs op dezelfde update-tick.
  if(typeof updateCrowd==='function')updateCrowd();
  if(typeof updateGantryTicker==='function')updateGantryTicker();
  if(typeof updateBarrierPulse==='function')updateBarrierPulse();
}


function buildSunBillboard(){
  const c=document.createElement('canvas');c.width=128;c.height=128;
  const ctx=c.getContext('2d');
  const grd=ctx.createRadialGradient(64,64,0,64,64,64);
  grd.addColorStop(0,'rgba(255,255,220,1)');
  grd.addColorStop(0.1,'rgba(255,240,160,0.9)');
  grd.addColorStop(0.3,'rgba(255,210,100,0.5)');
  grd.addColorStop(0.6,'rgba(255,170,60,0.18)');
  grd.addColorStop(1,'rgba(255,140,20,0)');
  ctx.fillStyle=grd;ctx.fillRect(0,0,128,128);
  const tex=new THREE.CanvasTexture(c);
  const mat=new THREE.SpriteMaterial({map:tex,blending:THREE.AdditiveBlending,transparent:true,opacity:.82,depthWrite:false});
  _sunBillboard=new THREE.Sprite(mat);
  const sunDir=new THREE.Vector3(180,320,80).normalize();
  _sunBillboard.position.copy(sunDir).multiplyScalar(500);
  _sunBillboard.scale.set(240,240,1);
  _sunBillboard.visible=!isDark&&!isRain;
  scene.add(_sunBillboard);
  // Layered sun glow for "lens flare" feel — extra additive sprites stacked
  // around the sun. With bloom on this gives a pleasing radial bloom plus a
  // visible cross-rays burst. Sprites are children so they share visibility.
  // Hot core: tiny intense white/yellow center
  const coreCv=document.createElement('canvas');coreCv.width=64;coreCv.height=64;
  const cCtx=coreCv.getContext('2d');
  const cGr=cCtx.createRadialGradient(32,32,0,32,32,32);
  cGr.addColorStop(0,'rgba(255,255,255,1)');
  cGr.addColorStop(.5,'rgba(255,250,200,0.7)');
  cGr.addColorStop(1,'rgba(255,240,180,0)');
  cCtx.fillStyle=cGr;cCtx.fillRect(0,0,64,64);
  const coreSprite=new THREE.Sprite(new THREE.SpriteMaterial({
    map:new THREE.CanvasTexture(coreCv),blending:THREE.AdditiveBlending,
    transparent:true,opacity:.95,depthWrite:false
  }));
  coreSprite.scale.set(80,80,1);
  _sunBillboard.add(coreSprite);
  // Cross rays: 4-point star burst (vertical + horizontal + diagonals)
  const raysCv=document.createElement('canvas');raysCv.width=256;raysCv.height=256;
  const rCtx=raysCv.getContext('2d');
  rCtx.fillStyle='rgba(0,0,0,0)';rCtx.fillRect(0,0,256,256);
  // Each ray: gradient line from center outward
  const drawRay=(angle,len,width,alpha)=>{
    rCtx.save();rCtx.translate(128,128);rCtx.rotate(angle);
    const g=rCtx.createLinearGradient(0,0,len,0);
    g.addColorStop(0,`rgba(255,240,200,${alpha})`);
    g.addColorStop(.5,`rgba(255,220,150,${alpha*.5})`);
    g.addColorStop(1,'rgba(255,200,120,0)');
    rCtx.fillStyle=g;rCtx.fillRect(0,-width/2,len,width);
    rCtx.fillRect(-len,-width/2,len,width);
    rCtx.restore();
  };
  drawRay(0,120,3,.85);              // horizontal
  drawRay(Math.PI/2,120,3,.85);      // vertical
  drawRay(Math.PI/4,90,2,.55);       // diagonal /
  drawRay(-Math.PI/4,90,2,.55);      // diagonal \
  const raysSprite=new THREE.Sprite(new THREE.SpriteMaterial({
    map:new THREE.CanvasTexture(raysCv),blending:THREE.AdditiveBlending,
    transparent:true,opacity:.42,depthWrite:false
  }));
  raysSprite.scale.set(280,280,1);
  _sunBillboard.add(raysSprite);
  // Outer halo: very soft wide glow (extends bloom further)
  const haloCv=document.createElement('canvas');haloCv.width=128;haloCv.height=128;
  const hCtx=haloCv.getContext('2d');
  const hGr=hCtx.createRadialGradient(64,64,16,64,64,64);
  hGr.addColorStop(0,'rgba(255,200,140,0.4)');
  hGr.addColorStop(.6,'rgba(255,180,100,0.12)');
  hGr.addColorStop(1,'rgba(255,160,80,0)');
  hCtx.fillStyle=hGr;hCtx.fillRect(0,0,128,128);
  const haloSprite=new THREE.Sprite(new THREE.SpriteMaterial({
    map:new THREE.CanvasTexture(haloCv),blending:THREE.AdditiveBlending,
    transparent:true,opacity:.6,depthWrite:false
  }));
  haloSprite.scale.set(520,520,1);
  _sunBillboard.add(haloSprite);
  buildLensFlareGhosts();
  buildGodRays();
}

// Fake volumetric god-rays — additive vertikale "beam" sprites geplaatst
// rond de zon. Ze suggereren stof in de lucht waar zonlicht doorheen valt.
// Sprites blijven auto-billboard (altijd gericht naar camera) → in elke
// camerahoek levendig effect zonder shader-werk.
let _godRays=[];
function _godRayTex(){
  const W=64,H=512,c=document.createElement('canvas');c.width=W;c.height=H;
  const g=c.getContext('2d');
  g.clearRect(0,0,W,H);
  // Vertikale gradient: bright top, fade naar transparent onder
  const grd=g.createLinearGradient(0,0,0,H);
  grd.addColorStop(0,'rgba(255,240,180,0.85)');
  grd.addColorStop(.25,'rgba(255,220,140,0.35)');
  grd.addColorStop(.7,'rgba(255,200,120,0.10)');
  grd.addColorStop(1,'rgba(255,180,90,0)');
  g.fillStyle=grd;g.fillRect(0,0,W,H);
  // Soft edges horizontaal (vignette → beam-shape)
  for(let x=0;x<W;x++){
    const fade=Math.sin(x/(W-1)*Math.PI); // 0..1..0
    g.globalCompositeOperation='destination-in';
    g.fillStyle=`rgba(255,255,255,${fade.toFixed(3)})`;
    g.fillRect(x,0,1,H);
  }
  g.globalCompositeOperation='source-over';
  const t=new THREE.CanvasTexture(c);t.needsUpdate=true;return t;
}
function buildGodRays(){
  // Cleanup oude rays (sprite materials niet door disposeScene opgeruimd)
  _godRays.forEach(r=>{
    if(r.material){if(r.material.map)r.material.map.dispose();r.material.dispose();}
  });
  _godRays.length=0;
  if(!_sunBillboard)return;
  const tex=_godRayTex();
  // 4 beams op licht verschillende offsets rond de zon-positie
  const offsets=[[0,0],[40,12],[-30,-8],[10,-22]];
  offsets.forEach(([dx,dz])=>{
    const mat=new THREE.SpriteMaterial({
      map:tex.clone(),blending:THREE.AdditiveBlending,
      transparent:true,opacity:.32,depthWrite:false
    });
    mat.map.needsUpdate=true;
    const beam=new THREE.Sprite(mat);
    beam.position.copy(_sunBillboard.position);
    beam.position.x+=dx;beam.position.z+=dz;
    beam.position.y-=120; // beam center hangt onder zon → lijkt naar beneden te schijnen
    beam.scale.set(80,360,1);
    beam.renderOrder=998; // vóór ghosts (999) maar na rest
    scene.add(beam);
    _godRays.push(beam);
  });
}

// Lens flare ghosts — kleinere additive sprites op de lijn zon→scherm-center.
// Worden geplaatst in scene.world-space en elke frame ge-update via
// updateLensFlare(). Visibility hangt af of de zon zichtbaar is in NDC.
let _lensGhosts=[];
function _ghostTex(rgb){
  const c=document.createElement('canvas');c.width=64;c.height=64;
  const g=c.getContext('2d');
  const grd=g.createRadialGradient(32,32,0,32,32,32);
  grd.addColorStop(0,`rgba(${rgb},1)`);
  grd.addColorStop(.4,`rgba(${rgb},0.45)`);
  grd.addColorStop(1,`rgba(${rgb},0)`);
  g.fillStyle=grd;g.fillRect(0,0,64,64);
  const t=new THREE.CanvasTexture(c);t.needsUpdate=true;return t;
}
function buildLensFlareGhosts(){
  // Dispose stale ghost materials/textures from a previous world build —
  // disposeScene() skips Sprites so we manually clean up.
  _lensGhosts.forEach(g=>{
    if(g.material){
      if(g.material.map)g.material.map.dispose();
      g.material.dispose();
    }
  });
  _lensGhosts.length=0;
  // [factor, rgb, scale, baseOpacity]
  // factor: 0=at sun, 1=at center, 2=opposite of sun
  const defs=[
    [0.30,'255,210,150',  6,0.55],
    [0.55,'180,220,255',  4,0.50],
    [0.85,'255,180,200',  3,0.45],
    [1.15,'200,180,255',  5,0.55],
    [1.45,'255,240,180',  3,0.40],
    [1.85,'255,200,160',  7,0.50]
  ];
  defs.forEach(d=>{
    const [factor,rgb,scale,baseOp]=d;
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({
      map:_ghostTex(rgb),
      blending:THREE.AdditiveBlending,
      transparent:true,
      depthWrite:false,
      depthTest:false,
      opacity:0
    }));
    sp.scale.set(scale,scale,1);
    sp.visible=false;
    sp.userData.factor=factor;
    sp.userData.baseOpacity=baseOp;
    sp.renderOrder=999; // draw last
    scene.add(sp);
    _lensGhosts.push(sp);
  });
}
const _lfNDC=new THREE.Vector3();
const _lfFwd=new THREE.Vector3(),_lfUp=new THREE.Vector3(),_lfRight=new THREE.Vector3();
function updateLensFlare(){
  if(!_sunBillboard||!camera||!_lensGhosts.length)return;
  if(!_sunBillboard.visible){
    _lensGhosts.forEach(g=>{g.visible=false;});return;
  }
  _lfNDC.copy(_sunBillboard.position).project(camera);
  // Achter camera or far off-screen → hide
  if(_lfNDC.z>1||Math.abs(_lfNDC.x)>1.4||Math.abs(_lfNDC.y)>1.4){
    _lensGhosts.forEach(g=>{g.visible=false;});return;
  }
  camera.getWorldDirection(_lfFwd);
  _lfRight.set(1,0,0).applyQuaternion(camera.quaternion);
  _lfUp.set(0,1,0).applyQuaternion(camera.quaternion);
  const dist=80;
  const fH=2*dist*Math.tan(camera.fov*Math.PI/360);
  const fW=fH*camera.aspect;
  const dEdge=Math.max(Math.abs(_lfNDC.x),Math.abs(_lfNDC.y));
  const fadeBase=Math.max(0,1-dEdge*0.65);
  _lensGhosts.forEach(g=>{
    const f=g.userData.factor;
    const px=_lfNDC.x*(1-f), py=_lfNDC.y*(1-f);
    g.position.copy(camera.position)
      .addScaledVector(_lfFwd,dist)
      .addScaledVector(_lfRight,px*fW*0.5)
      .addScaledVector(_lfUp,py*fH*0.5);
    g.visible=true;
    g.material.opacity=fadeBase*g.userData.baseOpacity*_sunBillboard.material.opacity;
  });
}


function buildCornerBoards(){
  // Numbered boards T1-T8 at each major corner entry, outside of track
  const corners=[
    {t:.165,name:'T1',col:0xff3300},
    {t:.215,name:'T2',col:0xff6600},
    {t:.385,name:'T3',col:0xffcc00},
    {t:.465,name:'T4',col:0x88ee00},
    {t:.535,name:'T5',col:0x00bb44},
    {t:.685,name:'T6',col:0x0088ff},
    {t:.745,name:'T7',col:0x3300ee},
    {t:.795,name:'T8',col:0xbb00ee},
  ];
  corners.forEach(({t,name,col})=>{
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    // Place board on the outside edge of the track
    const bPos=p.clone().addScaledVector(nr,TW+4.2);
    bPos.y=0;
    // Post
    const post=new THREE.Mesh(new THREE.BoxGeometry(.28,3.2,.28),
      new THREE.MeshLambertMaterial({color:0xffffff}));
    post.position.set(bPos.x,1.6,bPos.z);scene.add(post);
    // Colored board with canvas texture number
    const cvs=document.createElement('canvas');cvs.width=64;cvs.height=52;
    const cx=cvs.getContext('2d');
    cx.fillStyle='#'+col.toString(16).padStart(6,'0');cx.fillRect(0,0,64,52);
    cx.strokeStyle='rgba(255,255,255,0.6)';cx.lineWidth=3;cx.strokeRect(2,2,60,48);
    cx.fillStyle='#ffffff';cx.font='bold 26px Arial';cx.textAlign='center';cx.textBaseline='middle';
    cx.fillText(name,32,26);
    const tex=new THREE.CanvasTexture(cvs);
    const board=new THREE.Mesh(new THREE.BoxGeometry(3.2,2.0,.14),
      new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));
    board.position.set(bPos.x,3.4,bPos.z);
    board.rotation.y=Math.atan2(-tg.x,-tg.z);
    scene.add(board);
  });
}


function buildAdvertisingBoards(){
  const defs=[
    {t:.03,s:1,  text:["SPENCER'S","RACE CLUB"], bg:'#1a0030',fg:'#cc66ff'},
    {t:.32,s:-1, text:["DRIFT KING"],            bg:'#001a44',fg:'#00ccff'},
    {t:.62,s:1,  text:["SPEED ZONE"],            bg:'#001a00',fg:'#44ff88'},
    {t:.88,s:-1, text:["CHEQUERED","FLAG"],      bg:'#111111',fg:'#ffffff'},
  ];
  const poleMat=new THREE.MeshLambertMaterial({color:0x999999});
  defs.forEach(({t,s,text,bg,fg})=>{
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const pos=p.clone().addScaledVector(nr,s*(BARRIER_OFF+7.5));
    // Canvas texture with bold text
    const cv=document.createElement('canvas');cv.width=256;cv.height=128;
    const cx=cv.getContext('2d');
    cx.fillStyle=bg;cx.fillRect(0,0,256,128);
    cx.fillStyle=fg;cx.font='bold 32px Arial';cx.textAlign='center';cx.textBaseline='middle';
    const lineH=text.length>1?40:0;
    const startY=64-(text.length-1)*lineH*.5;
    text.forEach((line,i)=>cx.fillText(line,128,startY+i*lineH));
    cx.strokeStyle=fg;cx.lineWidth=5;cx.strokeRect(4,4,248,120);
    const tex=new THREE.CanvasTexture(cv);
    const board=new THREE.Mesh(new THREE.PlaneGeometry(10,5),
      new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));
    board.position.copy(pos);board.position.y=4.0;
    board.rotation.y=Math.atan2(nr.x*s,nr.z*s);
    scene.add(board);
    // Two support poles
    const fwd=new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0),board.rotation.y);
    [-4,4].forEach(ox=>{
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.1,.13,8,6),poleMat);
      pole.position.copy(pos).addScaledVector(fwd,ox);pole.position.y=4;
      scene.add(pole);
    });
  });
}


function updateSky(dt){
  _skyT+=(_skyTarget-_skyT)*Math.min(1,dt*0.55);
  scene.fog.color.lerpColors(_fogColorDay,_fogColorNight,_skyT);
  // Subtle sun brightness modulation
  if(_sunBillboard&&_sunBillboard.material){
    const tgt=_skyT<0.5?0.82*(1-_skyT*2)*(isRain?0.3:1):0;
    _sunBillboard.material.opacity+=(tgt-_sunBillboard.material.opacity)*Math.min(1,dt*1.2);
  }
  // Stars twinkle — slowly modulate star material opacity
  if(stars&&stars.visible&&stars.material){
    const twinkle=0.82+Math.sin(_nowSec*1.7)*0.10+Math.sin(_nowSec*3.1)*0.05;
    stars.material.opacity=twinkle;
  }
  updateLensFlare();
  // God-rays volgen sun visibility + opacity
  if(_godRays.length&&_sunBillboard){
    const sunOp=_sunBillboard.visible?_sunBillboard.material.opacity:0;
    _godRays.forEach((r,i)=>{
      r.visible=_sunBillboard.visible&&sunOp>.05;
      const pulse=.45+Math.sin(_nowSec*.4+i*.7)*.15;
      r.material.opacity=sunOp*pulse;
    });
  }
}


function buildNightObjects(){
  for(let i=0;i<30;i++){
    const t=i/30,p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    [-1,1].forEach(side=>{
      const pp=p.clone().addScaledVector(nr,side*(BARRIER_OFF+2));
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.08,.1,9,6),
        new THREE.MeshLambertMaterial({color:0x888888}));
      pole.position.copy(pp);pole.position.y=4.5;pole.visible=false;
      scene.add(pole);trackPoles.push(pole);
      const lamp=new THREE.Mesh(new THREE.BoxGeometry(.6,.22,1.2),
        new THREE.MeshLambertMaterial({color:0xffffcc,emissive:0x888844}));
      lamp.position.copy(pp);lamp.position.y=9.2;lamp.visible=false;
      scene.add(lamp);trackPoles.push(lamp);
      const pl=new THREE.PointLight(0xffdd88,0,38);
      pl.position.copy(pp);pl.position.y=9;scene.add(pl);trackLightList.push(pl);
    });
  }
  const sg=new THREE.SphereGeometry(.28,4,4),sm=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:1});
  stars=new THREE.InstancedMesh(sg,sm,380);stars.visible=false;
  const dm=new THREE.Object3D();
  for(let i=0;i<380;i++){
    const th=Math.random()*Math.PI*2,ph=Math.random()*Math.PI*.48,r=350+Math.random()*100;
    dm.position.set(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph)*.5+160,r*Math.sin(ph)*Math.sin(th)+220);
    const starSize=i<60?2.2+Math.random()*1.2:.6+Math.random()*1.6;// brighter foreground stars
    dm.scale.setScalar(starSize);dm.updateMatrix();stars.setMatrixAt(i,dm.matrix);
  }
  stars.instanceMatrix.needsUpdate=true;scene.add(stars);
  // Moon — large glowing sphere high in the sky
  const moonGeo=new THREE.SphereGeometry(12,16,16);
  const moonMat=new THREE.MeshBasicMaterial({color:0xe8eef8});
  const moon=new THREE.Mesh(moonGeo,moonMat);
  moon.position.set(-180,280,-120);moon.visible=false;
  scene.add(moon);trackPoles.push(moon);
  // Moon glow halo
  const haloGeo=new THREE.SphereGeometry(18,16,16);
  const haloMat=new THREE.MeshBasicMaterial({color:0x8899cc,transparent:true,opacity:.14,side:THREE.BackSide});
  const halo=new THREE.Mesh(haloGeo,haloMat);
  halo.position.copy(moon.position);halo.visible=false;
  scene.add(halo);trackPoles.push(halo);
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);
}


function buildParticles(){
  sparkSystem=new SimpleParticles(_mobCount(300),scene);
  exhaustSystem=new SimpleParticles(_mobCount(200),scene);
}


function buildWorldElements(){
  if(activeWorld==='grandprix'){ buildWaterPuddles(); buildDRSZone(); buildTyreBarriers(); }
  else if(activeWorld==='space'){ buildGravityZones(); buildOrbitingAsteroids(); buildWarpTunnels(); }
  else if(activeWorld==='deepsea'){ buildCurrentStreams(); buildAbyssCracks(); buildTreasureTrail(); }
  // Neon City world elements handled in buildNeonCityEnvironment if present
}

