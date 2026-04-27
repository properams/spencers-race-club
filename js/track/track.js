// js/track/track.js — auto-extracted in Fase 4
// Non-module script.

// Procedurele asfalt-noise texture — werkt multiplicatief over material.color
// zodat per-world tint (color) behouden blijft. Tileable 256×256 canvas met
// grain + lichte streep-wear in racing direction. Niet gecached: disposeScene()
// callt map.dispose() bij elke world-switch, dus we bouwen 'm telkens opnieuw
// (256² noise gen kost <1ms).
function _buildTrackSurfaceTex(){
  const S=256,c=document.createElement('canvas');c.width=S;c.height=S;
  const g=c.getContext('2d');
  // Base mid-grey (multiplied with vertex/material color → keeps world tint)
  g.fillStyle='#9a9a9a';g.fillRect(0,0,S,S);
  // Per-pixel noise via ImageData — values 130..200 (subtle variance)
  const id=g.getImageData(0,0,S,S),d=id.data;
  for(let i=0;i<d.length;i+=4){
    const n=130+(Math.random()*70)|0;
    d[i]=n;d[i+1]=n;d[i+2]=n;d[i+3]=255;
  }
  g.putImageData(id,0,0);
  // Two faint vertical wear-streaks (driving lines) — slightly lighter
  g.globalAlpha=.18;
  for(const xc of [S*.30, S*.70]){
    const grd=g.createLinearGradient(xc-18,0,xc+18,0);
    grd.addColorStop(0,'rgba(255,255,255,0)');
    grd.addColorStop(.5,'rgba(255,255,255,1)');
    grd.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=grd;g.fillRect(xc-18,0,36,S);
  }
  g.globalAlpha=1;
  // A few darker oil/wear blobs scattered
  for(let i=0;i<22;i++){
    const x=Math.random()*S,y=Math.random()*S,r=4+Math.random()*9;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba(40,40,40,0.55)');
    grd.addColorStop(1,'rgba(40,40,40,0)');
    g.fillStyle=grd;g.fillRect(x-r,y-r,r*2,r*2);
  }
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.anisotropy=4;t.needsUpdate=true;
  return t;
}

function buildTrack(){
  const pts3=TRACK_WP.map(([x,z])=>new THREE.Vector3(x,0,z));
  trackCurve=new THREE.CatmullRomCurve3(pts3,true,'catmullrom',.5);
  curvePts=trackCurve.getPoints(600);
  const N=400;
  // Main track mat: polygonOffset pushes asphalt *away* from camera in depth so curbs,
  // edge lines and startline overlays win the depth test on low-precision depth buffers (iPad).
  const _baseTrackColor=activeWorld==='space'?0x141420:activeWorld==='deepsea'?0x1a2830:activeWorld==='candy'?0xee3388:activeWorld==='neoncity'?0x0a0a14:activeWorld==='volcano'?0x2a0808:activeWorld==='arctic'?0x667788:activeWorld==='themepark'?0x221030:0x262626;
  const _trackMat=new THREE.MeshLambertMaterial({color:_baseTrackColor,map:_buildTrackSurfaceTex()});
  _trackMat.polygonOffset=true;_trackMat.polygonOffsetFactor=1;_trackMat.polygonOffsetUnits=1;
  _trackMat.userData.baseColor=_baseTrackColor; // stashed for rain/day-night tinting
  const rm=ribbon(N,t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    return{L:p.clone().addScaledVector(nr,-TW).setY(.005),R:p.clone().addScaledVector(nr,TW).setY(.005)};
  },_trackMat);
  _trackMesh=rm;
  rm.receiveShadow=true;
  eline(N,-TW+.55,.008,.38);eline(N,TW-.55,.008,.38);
  buildCurbs(N);buildStartLine();
}

function eline(N,off,y,hw){
  const mat=new THREE.MeshBasicMaterial({color:0xffffff});
  // Stronger offset than curbs (-1) so edge lines never z-fight against curb stripes
  mat.polygonOffset=true;mat.polygonOffsetFactor=-2;mat.polygonOffsetUnits=-2;
  ribbon(N,t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    return{L:p.clone().addScaledVector(nr,off-hw).setY(y),R:p.clone().addScaledVector(nr,off+hw).setY(y)};
  },mat);
}

function buildCurbs(N){
  const CW=2.1;
  [-1,1].forEach(side=>{
    const eo=side*(TW+CW*.5),pos=[],col=[],idx=[];
    for(let i=0;i<=N;i++){
      const t=i/N,p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      const L=p.clone().addScaledVector(nr,eo-CW*.5);L.y=.045;
      const R=p.clone().addScaledVector(nr,eo+CW*.5);R.y=.045;
      pos.push(L.x,L.y,L.z,R.x,R.y,R.z);
      const s=Math.floor(t*72)%2;
      const [r,g,b]=activeWorld==='space'?(s===0?[0,.9,.9]:[.7,0,.9]):activeWorld==='deepsea'?(s===0?[0,.9,.7]:[0,.5,1]):activeWorld==='candy'?(s===0?[1,.2,.6]:[1,.95,.1]):activeWorld==='themepark'?(s===0?[1,.3,.8]:[1,.9,.2]):(s===0?[.82,.07,.03]:[1,1,1]);
      col.push(r,g,b,r,g,b);
      if(i<N){const a=i*2,b2=a+1,c=a+2,d=a+3;idx.push(a,b2,c,b2,d,c);}
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    geo.setIndex(idx);
    const cMat=new THREE.MeshLambertMaterial({vertexColors:true});
    cMat.polygonOffset=true;cMat.polygonOffsetFactor=-1;cMat.polygonOffsetUnits=-1;
    // Per-world emissive accents — vertexColors zijn al gezet per world, maar
    // emissive geeft daarbovenop een gloed die door bloom oppikt wordt.
    if(activeWorld==='space'){cMat.emissive=new THREE.Color(0x4422aa);cMat.emissiveIntensity=.7;}
    else if(activeWorld==='deepsea'){cMat.emissive=new THREE.Color(0x0a4a4a);cMat.emissiveIntensity=.85;}
    else if(activeWorld==='candy'){cMat.emissive=new THREE.Color(0x661133);cMat.emissiveIntensity=.55;}
    else if(activeWorld==='neoncity'){cMat.emissive=new THREE.Color(0x00ffaa);cMat.emissiveIntensity=.75;}
    else if(activeWorld==='volcano'){cMat.emissive=new THREE.Color(0xff3300);cMat.emissiveIntensity=.55;}
    else if(activeWorld==='arctic'){cMat.emissive=new THREE.Color(0x4488dd);cMat.emissiveIntensity=.45;}
    else if(activeWorld==='themepark'){cMat.emissive=new THREE.Color(0xff44aa);cMat.emissiveIntensity=.6;}
    else {cMat.emissive=new THREE.Color(0x661111);cMat.emissiveIntensity=.30;} // GP — subtle red curb glow
    scene.add(new THREE.Mesh(geo,cMat));
  });
}

function buildStartLine(){
  const p=trackCurve.getPoint(0),tg=trackCurve.getTangent(0).normalize();
  const nr=new THREE.Vector3(-tg.z,0,tg.x),sq=8,sqW=TW*2/sq,sqD=1.2;
  // Clean 8×2 checkerboard — crisp, minimal
  for(let i=0;i<sq;i++)for(let j=0;j<2;j++){
    const slMat=new THREE.MeshLambertMaterial({color:(i+j)%2===0?0xffffff:0x111111});
    slMat.polygonOffset=true;slMat.polygonOffsetFactor=-1;slMat.polygonOffsetUnits=-1;
    const m=new THREE.Mesh(new THREE.PlaneGeometry(sqW,sqD),slMat);
    m.rotation.x=-Math.PI/2;
    m.position.copy(p).addScaledVector(nr,(i-sq/2+.5)*sqW).addScaledVector(tg,(j-.5)*sqD);
    m.position.y=.011;scene.add(m);
  }
}

function buildBarriers(){
  const isSpace=activeWorld==='space',isDS=activeWorld==='deepsea';
  [-1,1].forEach(side=>{
    const N=200,pos=[],nrm=[],idx=[];
    for(let i=0;i<=N;i++){
      const t=i/N,p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      const b=p.clone().addScaledVector(nr,side*BARRIER_OFF);
      // Deep sea: organic coral wall with irregular height
      const h=isDS?(0.9+Math.sin(i*.47+side*1.3)*0.45+Math.sin(i*.21)*0.22):1.05;
      pos.push(b.x,0,b.z,b.x,h,b.z);
      nrm.push(-side*nr.x,0,-side*nr.z,-side*nr.x,0,-side*nr.z);
      if(i<N){const a=i*2,b2=a+1,c=a+2,d=a+3;idx.push(a,b2,c,b2,d,c);}
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3));
    geo.setIndex(idx);
    let mat;
    if(isSpace){
      // Energy shield: translucent electric-blue glow
      mat=new THREE.MeshLambertMaterial({color:0x2255dd,emissive:0x0a1a88,transparent:true,opacity:.38,side:THREE.DoubleSide});
    } else if(isDS){
      // Coral wall: warm teal-green with soft bio-glow
      mat=new THREE.MeshLambertMaterial({color:0x1e7766,emissive:0x083322,side:THREE.DoubleSide});
    } else {
      mat=new THREE.MeshLambertMaterial({color:0xbbbbbb,side:THREE.DoubleSide});
    }
    scene.add(new THREE.Mesh(geo,mat));
  });
  // Space: add a second inner strip of emissive "energy beams" at cap height
  if(isSpace){
    [-1,1].forEach(side=>{
      const N=200,pos=[],idx=[];
      for(let i=0;i<=N;i++){
        const t=i/N,p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
        const nr=new THREE.Vector3(-tg.z,0,tg.x);
        const b=p.clone().addScaledVector(nr,side*BARRIER_OFF);
        pos.push(b.x,1.05,b.z,b.x,1.18,b.z);
        if(i<N){const a=i*2,b2=a+1,c=a+2,d=a+3;idx.push(a,b2,c,b2,d,c);}
      }
      const geo=new THREE.BufferGeometry();
      geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
      geo.setIndex(idx);
      scene.add(new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color:0x66aaff,emissive:0x4488ee,side:THREE.DoubleSide})));
    });
  }
}

let _gantryLabel=null;
function buildGantry(){
  const p=trackCurve.getPoint(0),tg=trackCurve.getTangent(0).normalize();
  const nr=new THREE.Vector3(-tg.z,0,tg.x),hw=TW+3;
  const pm=new THREE.MeshLambertMaterial({color:0x222233});
  // Two clean pillars — no truss clutter
  [-1,1].forEach(s=>{
    const pp=p.clone().addScaledVector(nr,s*hw);
    const post=new THREE.Mesh(new THREE.BoxGeometry(.6,10,.6),pm);
    post.position.copy(pp);post.position.y=5;scene.add(post);
  });
  // Clean horizontal bar
  const bar=new THREE.Mesh(new THREE.BoxGeometry(hw*2,.7,.7),new THREE.MeshLambertMaterial({color:0x111122}));
  bar.position.copy(p);bar.position.y=10;scene.add(bar);
  // Thin neon accent strip — colour matches active world
  const accentCol=activeWorld==='space'?0x4422aa:activeWorld==='deepsea'?0x006688:0x441166;
  const accentEmit=activeWorld==='space'?0x3311cc:activeWorld==='deepsea'?0x00aacc:0x6622cc;
  const accent=new THREE.Mesh(new THREE.BoxGeometry(hw*2-.6,.07,.16),
    new THREE.MeshLambertMaterial({color:accentCol,emissive:accentEmit,emissiveIntensity:1.4}));
  accent.position.copy(p);accent.position.y=9.68;scene.add(accent);
  // Gantry label — world-specific LED ticker. Sprite met canvas texture die
  // periodiek herrendered wordt met afwisselend race-info en thematische
  // teksten (zie updateGantryTicker).
  const glCvs=document.createElement('canvas');glCvs.width=512;glCvs.height=56;
  const glCtx=glCvs.getContext('2d');
  const glTex=new THREE.CanvasTexture(glCvs);
  const glLbl=new THREE.Sprite(new THREE.SpriteMaterial({map:glTex,transparent:true,opacity:.85}));
  glLbl.position.copy(p);glLbl.position.y=11.8;glLbl.scale.set(24,2.8,1);
  glLbl.name='f1-gantry-label-sprite';scene.add(glLbl);
  glLbl.userData.isGantryLabel=true;
  glLbl.userData.canvas=glCvs;
  glLbl.userData.ctx=glCtx;
  glLbl.userData.tex=glTex;
  glLbl.userData.frameIdx=0;
  glLbl.userData.nextSwitch=0;
  _gantryLabel=glLbl;
  _drawGantryFrame(0);
}

// Helper: render één tekst-frame in de gantry canvas. idx wijst frame-type aan.
function _drawGantryFrame(idx){
  if(!_gantryLabel)return;
  const ctx=_gantryLabel.userData.ctx;
  const W=512,H=56;
  ctx.clearRect(0,0,W,H);
  // Donkere achtergrond met scanline-pattern (LED-board look)
  ctx.fillStyle='#0a0010';ctx.fillRect(0,0,W,H);
  for(let y=0;y<H;y+=2){
    ctx.fillStyle='rgba(255,255,255,0.04)';ctx.fillRect(0,y,W,1);
  }
  const worldCol={
    space:'#8866ff',deepsea:'#00ddcc',candy:'#ff66cc',
    neoncity:'#00ffee',volcano:'#ff6622',arctic:'#88ccff',
    themepark:'#ff44aa',grandprix:'#ffaa66'
  }[activeWorld]||'#cc66ff';
  ctx.font='bold 28px Orbitron,Arial';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle=worldCol;
  // Subtle text glow via offset shadow
  ctx.shadowColor=worldCol;ctx.shadowBlur=8;
  ctx.fillText(_gantryFrameText(idx),W/2,H/2+1);
  ctx.shadowBlur=0;
  _gantryLabel.userData.tex.needsUpdate=true;
}
function _gantryFrameText(idx){
  const worldName={
    space:'COSMIC CIRCUIT',deepsea:'DEEP SEA CIRCUIT',candy:'CANDY KINGDOM',
    neoncity:'NEON CITY GP',volcano:'VOLCANO RUSH',arctic:'ARCTIC PEAKS',
    themepark:'THEME PARK BLAST',grandprix:"SPENCER'S RACE CLUB"
  }[activeWorld]||"SPENCER'S RACE CLUB";
  const car=carObjs[playerIdx];
  const lap=car?Math.max(1,Math.min(3,car.lap+1)):1;
  // Find best lap of any car
  let fastest=Infinity;
  for(let i=0;i<carObjs.length;i++){
    const bl=carObjs[i].bestLap;
    if(bl&&bl<fastest)fastest=bl;
  }
  const fastestStr=isFinite(fastest)?(Math.floor(fastest/60)+':'+(fastest%60).toFixed(2).padStart(5,'0')):'--:--.--';
  switch(idx%5){
    case 0:return worldName;
    case 1:return gameState==='RACE'?`LAP ${lap}/3`:'GET READY';
    case 2:return gameState==='RACE'?`FASTEST ${fastestStr}`:'WELCOME';
    case 3:return ['DRIVE SAFE','GO GO GO','PURE SPEED','FULL THROTTLE'][Math.floor(_nowSec/4)%4];
    case 4:return worldName;
  }
  return worldName;
}
// Aanroepen vanuit updateFlags() — wisselt frame elke ~3s en herrendert.
function updateGantryTicker(){
  // parent==null betekent dat de gantry-sprite is gedispoosed door
  // disposeScene (world-switch zonder gantry, bv. neoncity, candy).
  if(!_gantryLabel||!_gantryLabel.parent)return;
  if(_nowSec<_gantryLabel.userData.nextSwitch)return;
  _gantryLabel.userData.frameIdx=(_gantryLabel.userData.frameIdx+1)%5;
  _gantryLabel.userData.nextSwitch=_nowSec+2.8+Math.random()*0.8;
  _drawGantryFrame(_gantryLabel.userData.frameIdx);
}

function ribbon(N,segFn,mat){
  const pos=[],nrm=[],uv=[],idx=[];
  for(let i=0;i<=N;i++){
    const t=i/N,{L,R}=segFn(t);
    pos.push(L.x,L.y,L.z,R.x,R.y,R.z);nrm.push(0,1,0,0,1,0);uv.push(0,t*12,1,t*12);
    if(i<N){const a=i*2,b=a+1,c=a+2,d=a+3;idx.push(a,b,c,b,d,c);}
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3));
  geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  geo.setIndex(idx);
  const m=new THREE.Mesh(geo,mat);scene.add(m);return m;
}

