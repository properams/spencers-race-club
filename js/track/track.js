// js/track/track.js — auto-extracted in Fase 4
// Non-module script.


function buildTrack(){
  const pts3=TRACK_WP.map(([x,z])=>new THREE.Vector3(x,0,z));
  trackCurve=new THREE.CatmullRomCurve3(pts3,true,'catmullrom',.5);
  curvePts=trackCurve.getPoints(600);
  const N=400;
  // Main track mat: polygonOffset pushes asphalt *away* from camera in depth so curbs,
  // edge lines and startline overlays win the depth test on low-precision depth buffers (iPad).
  const _baseTrackColor=activeWorld==='space'?0x141420:activeWorld==='deepsea'?0x1a2830:activeWorld==='candy'?0xee3388:activeWorld==='neoncity'?0x0a0a14:activeWorld==='volcano'?0x2a0808:activeWorld==='arctic'?0x667788:activeWorld==='themepark'?0x221030:0x262626;
  const _trackMat=new THREE.MeshLambertMaterial({color:_baseTrackColor});
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
    if(activeWorld==='space')cMat.emissive=new THREE.Color(0x220055);
    else if(activeWorld==='deepsea')cMat.emissive=new THREE.Color(0x003333);
    else if(activeWorld==='candy'){cMat.emissive=new THREE.Color(0x441122);cMat.emissiveIntensity=.35;}
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
  // Gantry label — world-specific, subtle sprite
  const glCvs=document.createElement('canvas');glCvs.width=512;glCvs.height=56;
  const glCtx=glCvs.getContext('2d');glCtx.clearRect(0,0,512,56);
  glCtx.font='bold 28px Orbitron,Arial';glCtx.textAlign='center';
  glCtx.fillStyle=activeWorld==='space'?'#8866ff':activeWorld==='deepsea'?'#00ddcc':'#cc66ff';
  const gLabel=activeWorld==='space'?'COSMIC CIRCUIT':activeWorld==='deepsea'?'DEEP SEA CIRCUIT':activeWorld==='neoncity'?'NEON CITY GP':"SPENCER'S RACE CLUB";
  glCtx.fillText(gLabel,256,38);
  const glTex=new THREE.CanvasTexture(glCvs);
  const glLbl=new THREE.Sprite(new THREE.SpriteMaterial({map:glTex,transparent:true,opacity:.75}));
  glLbl.position.copy(p);glLbl.position.y=11.8;glLbl.scale.set(24,2.8,1);
  glLbl.name='f1-gantry-label-sprite';scene.add(glLbl);
  // Also keep hidden .f1-gantry-label for rebuildWorld text update (look it up by name on rebuild)
  glLbl.userData.isGantryLabel=true;
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

