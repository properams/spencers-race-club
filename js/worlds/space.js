// js/worlds/space.js — space world builders + update + collision checks

// Verhuisd uit main.js tijdens Fase 3. Geen ES module: loadt als

// gewoon <script>. Alle functies blijven globals, consumeren state

// direct (scene, CAR_DEFS, _isMobile, _mobCount, etc.).


function buildGravityZones(){
  const defs=[{t:.15},{t:.47},{t:.73}];
  defs.forEach(def=>{
    const p=trackCurve.getPoint(def.t).clone();
    // Glowing hexagonal pad on track
    const pad=new THREE.Mesh(new THREE.CylinderGeometry(6,6,.08,6),
      new THREE.MeshLambertMaterial({color:0x8800ff,emissive:0x5500cc,emissiveIntensity:1.2,transparent:true,opacity:.7}));
    pad.position.copy(p);pad.position.y=.025;scene.add(pad);
    // Arrow ring floating above
    const arr=new THREE.Mesh(new THREE.TorusGeometry(4,.15,6,24),
      new THREE.MeshLambertMaterial({color:0xff44ff,emissive:0xcc00cc,emissiveIntensity:1.5}));
    arr.rotation.x=Math.PI/2;arr.position.copy(p);arr.position.y=1.8;scene.add(arr);
    // WARNING text sprite
    const cvs=document.createElement('canvas');cvs.width=256;cvs.height=40;
    const ctx=cvs.getContext('2d');ctx.fillStyle='#220044';ctx.fillRect(0,0,256,40);
    ctx.font='bold 18px Orbitron,Arial';ctx.fillStyle='#ff88ff';ctx.textAlign='center';
    ctx.fillText('GRAVITY ZONE',128,27);
    const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cvs),transparent:true}));
    sp.position.copy(p);sp.position.y=3.8;sp.scale.set(12,2,1);scene.add(sp);
    _wpGravityZones.push({pos:p.clone(),radius:6,pad,arr,cooldown:0});
  });
}

function checkGravityZones(dt){
  const car=carObjs[playerIdx];
  _wpGravityZones.forEach(gz=>{
    gz.cooldown=Math.max(0,gz.cooldown-dt);
    const d=car.mesh.position.distanceTo(gz.pos);
    if(d<gz.radius&&!car.inAir&&gz.cooldown<=0){
      car.vy=(car.vy||0)+6; // launch upward
      car.inAir=true;
      showPopup('🚀 ZERO-G ZONE!','#ff88ff',600);
      gz.cooldown=4;
    }
  });
}


function buildOrbitingAsteroids(){
  const defs=[{t:.23,r:9,speed:.4},{t:.55,r:11,speed:-.35},{t:.85,r:8,speed:.5}];
  defs.forEach(def=>{
    const centre=trackCurve.getPoint(def.t).clone();centre.y=1.0;
    // Rocky asteroid (irregular sphere)
    const geo=new THREE.DodecahedronGeometry(2.2,0);
    // Randomly jitter vertices for rockiness
    const posAttr=geo.attributes.position;
    for(let i=0;i<posAttr.count;i++){
      posAttr.setXYZ(i,posAttr.getX(i)*(0.75+Math.random()*.5),posAttr.getY(i)*(0.75+Math.random()*.5),posAttr.getZ(i)*(0.75+Math.random()*.5));
    }
    geo.computeVertexNormals();
    const rock=new THREE.Mesh(geo,new THREE.MeshLambertMaterial({color:0x665544}));
    rock.position.copy(centre).addScaledVector(new THREE.Vector3(1,0,0),def.r);
    scene.add(rock);
    // Small dust halo (torus)
    const dust=new THREE.Mesh(new THREE.TorusGeometry(def.r,.25,4,32),
      new THREE.MeshBasicMaterial({color:0x443322,transparent:true,opacity:.25}));
    dust.rotation.x=Math.PI/2;dust.position.copy(centre);scene.add(dust);
    _wpOrbitAsteroids.push({centre:centre.clone(),rock,orbitR:def.r,speed:def.speed,angle:Math.random()*Math.PI*2,radius:2.8,cooldown:0});
  });
}

function checkOrbitingAsteroids(dt){
  const car=carObjs[playerIdx];
  _wpOrbitAsteroids.forEach(ast=>{
    // Orbit update
    ast.angle+=ast.speed*dt;
    ast.rock.position.set(ast.centre.x+Math.cos(ast.angle)*ast.orbitR,ast.centre.y,ast.centre.z+Math.sin(ast.angle)*ast.orbitR);
    ast.rock.rotation.y+=dt*.4;ast.rock.rotation.x+=dt*.2;
    // Collision with player
    ast.cooldown=Math.max(0,ast.cooldown-dt);
    const d=car.mesh.position.distanceTo(ast.rock.position);
    if(d<ast.radius+1.5&&ast.cooldown<=0){
      car.speed*=.35;car.yawVel=(Math.random()-.5)*3.5;
      showPopup('☄️ ASTEROID HIT!','#ff8844',700);ast.cooldown=2;
    }
  });
}


function buildWarpTunnels(){
  const defs=[{t:.38},{t:.77}];
  defs.forEach(def=>{
    const p=trackCurve.getPoint(def.t),tg=trackCurve.getTangent(def.t).normalize();
    const angle=Math.atan2(tg.x,tg.z);
    // Tunnel arch (two rings + connecting bars)
    const ringMat=new THREE.MeshLambertMaterial({color:0x4400aa,emissive:0x2200bb,emissiveIntensity:1.8});
    [-5,5].forEach(oz=>{
      const ring=new THREE.Mesh(new THREE.TorusGeometry(TW+2,.55,8,24),ringMat.clone());
      ring.position.copy(p).addScaledVector(tg,oz);ring.position.y=TW+1.8;
      ring.rotation.y=angle;ring.rotation.x=Math.PI/2;scene.add(ring);
    });
    // Connecting strips along the sides and top
    const stripMat=new THREE.MeshLambertMaterial({color:0x6622cc,emissive:0x4411aa,emissiveIntensity:1.2,transparent:true,opacity:.6});
    for(let i=0;i<6;i++){
      const ang=(i/6)*Math.PI; // top half arch
      const bar=new THREE.Mesh(new THREE.BoxGeometry(.25,10.5,.3),stripMat);
      bar.position.copy(p);
      bar.position.x+=Math.cos(ang+Math.PI/2)*(TW+1.8)*Math.cos(angle)-Math.sin(ang+Math.PI/2)*(TW+1.8)*Math.sin(angle);
      bar.position.z+=Math.cos(ang+Math.PI/2)*(TW+1.8)*Math.sin(angle)+Math.sin(ang+Math.PI/2)*(TW+1.8)*Math.cos(angle);
      bar.position.y=TW+1.8;bar.rotation.y=angle;
      scene.add(bar);
    }
    // Glowing ground panel
    const gnd=new THREE.Mesh(new THREE.PlaneGeometry(TW*1.8,10),
      new THREE.MeshLambertMaterial({color:0x8833ff,emissive:0x5511dd,transparent:true,opacity:.4}));
    gnd.rotation.x=-Math.PI/2;gnd.position.copy(p);gnd.position.y=.02;gnd.rotation.y=angle;scene.add(gnd);
    _wpWarpTunnels.push({pos:p.clone(),tg:tg.clone(),radius:TW*.85,len:10,cooldown:0});
  });
}

function checkWarpTunnels(dt){
  const car=carObjs[playerIdx];
  _wpWarpTunnels.forEach(wt=>{
    wt.cooldown=Math.max(0,wt.cooldown-dt);
    const d=car.mesh.position.distanceTo(wt.pos);
    if(d<wt.radius+4&&wt.cooldown<=0&&car.speed>0.1){
      car.speed=Math.min(car.speed*1.12,car.def.topSpd*1.08); // significant boost cap
      showPopup('⚡ WARP SPEED!','#cc66ff',600);wt.cooldown=5;
    }
  });
}


function buildSpaceEnvironment(){
  buildSpaceVoid();      // replaces ground — empty abyss
  buildSpaceStars();
  buildSpacePlanets();
  buildNebula();
  buildAsteroids();
  buildSpaceTrackPlatform(); // underkant + vertical rails + underglow
  buildSpaceTrackEdges();
  buildSpaceOrbs();
  buildSpaceStation();
  buildSpaceGate();
  buildSpaceBarriers();
  buildSpaceDust();
  buildSpaceGravityWells();
  buildSpaceRailguns();
  buildSpaceWormholes();
  buildSpaceUFOs();
  buildSpaceMeteorSystem();
  buildSpaceTractorBeam();
  // Car headlights (same hardware as GP)
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);
}

function buildSpaceVoid(){
  // Deep abyss plane far below — creates infinite depth feeling
  const abyss=new THREE.Mesh(new THREE.PlaneGeometry(3000,3000,1,1),
    new THREE.MeshBasicMaterial({color:0x000008}));
  abyss.rotation.x=-Math.PI/2;abyss.position.y=-400;scene.add(abyss);
  // Mid-depth debris — small grey rocks drifting far below
  const debMat=new THREE.MeshLambertMaterial({color:0x222233});
  for(let i=0;i<55;i++){
    const g=Math.random()<.5?new THREE.DodecahedronGeometry(.8+Math.random()*2.5,0):new THREE.IcosahedronGeometry(.5+Math.random()*2,0);
    const m=new THREE.Mesh(g,debMat);
    m.position.set((Math.random()-.5)*1200,-(40+Math.random()*180),(Math.random()-.5)*1200);
    m.rotation.set(Math.random()*Math.PI*2,Math.random()*Math.PI*2,0);
    m._rspd=new THREE.Vector3((Math.random()-.5)*.15,(Math.random()-.5)*.05,(Math.random()-.5)*.15);
    scene.add(m);_spaceAsteroids.push(m); // reuse asteroid array for rotation
  }
}

function buildSpaceTrackPlatform(){
  const N=300;
  // Track bottom face — dark metallic panel
  ribbon(N,t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    return{L:p.clone().addScaledVector(nr,-(TW+.5)).setY(-.55),R:p.clone().addScaledVector(nr,TW+.5).setY(-.55)};
  },new THREE.MeshLambertMaterial({color:0x0e0e1e,side:THREE.BackSide}));
  // Left wall
  ribbon(N,t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const edge=p.clone().addScaledVector(nr,-TW);
    return{L:edge.clone().setY(-.55),R:edge.clone().setY(.35)};
  },new THREE.MeshLambertMaterial({color:0x00ffff,emissive:0x00aaff,emissiveIntensity:.9,transparent:true,opacity:.5,side:THREE.DoubleSide}));
  // Right wall
  ribbon(N,t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const edge=p.clone().addScaledVector(nr,TW);
    return{L:edge.clone().setY(-.55),R:edge.clone().setY(.35)};
  },new THREE.MeshLambertMaterial({color:0xff00ff,emissive:0xcc00cc,emissiveIntensity:.9,transparent:true,opacity:.5,side:THREE.DoubleSide}));
  // Underglow point lights — 8 widely-spaced lights (emissive walls already provide glow)
  const glowCols=[0x00ffcc,0x8800ff,0x00aaff,0xff00aa];
  for(let i=0;i<8;i++){
    const t=i/8;const p=trackCurve.getPoint(t);
    const pl=new THREE.PointLight(glowCols[i%glowCols.length],2.2,55);
    pl.position.set(p.x,p.y-1.2,p.z);
    scene.add(pl);_spaceUnderglow.push(pl);
  }
}

function buildSpaceStars(){
  const cnt=2200;
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(cnt*3);
  const col=new Float32Array(cnt*3);
  const colSets=[[1,1,1],[.85,.9,1],[1,1,.88],[.88,.82,1],[.8,.96,1]];
  for(let i=0;i<cnt;i++){
    const th=Math.random()*Math.PI*2;
    const ph=Math.random()*Math.PI*.55;
    const r=580+Math.random()*180;
    pos[i*3]=r*Math.sin(ph)*Math.cos(th);
    pos[i*3+1]=r*Math.cos(ph)*.45+70;
    pos[i*3+2]=r*Math.sin(ph)*Math.sin(th);
    const c=colSets[Math.floor(Math.random()*colSets.length)];
    col[i*3]=c[0];col[i*3+1]=c[1];col[i*3+2]=c[2];
  }
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  stars=new THREE.Points(geo,new THREE.PointsMaterial({
    vertexColors:true,size:.65,sizeAttenuation:false,transparent:true,opacity:.95
  }));
  stars.visible=true;scene.add(stars);
  // Horizon star band
  const hCnt=400;const hGeo=new THREE.BufferGeometry();
  const hPos=new Float32Array(hCnt*3);
  for(let i=0;i<hCnt;i++){
    const th=Math.random()*Math.PI*2;const r=520+Math.random()*140;
    hPos[i*3]=r*Math.cos(th);hPos[i*3+1]=Math.random()*40+5;hPos[i*3+2]=r*Math.sin(th);
  }
  hGeo.setAttribute('position',new THREE.Float32BufferAttribute(hPos,3));
  scene.add(new THREE.Points(hGeo,new THREE.PointsMaterial({color:0x9988cc,size:.45,sizeAttenuation:false,transparent:true,opacity:.55})));
}

function buildSpacePlanets(){
  // Large striped gas giant at horizon
  const pGeo=new THREE.SphereGeometry(95,32,24);
  const pColors=new Float32Array(pGeo.attributes.position.count*3);
  for(let i=0;i<pGeo.attributes.position.count;i++){
    const y=pGeo.attributes.position.getY(i);
    const t=(y+95)/190;const b=Math.floor(t*8)%2;
    if(b===0){pColors[i*3]=.78;pColors[i*3+1]=.44;pColors[i*3+2]=.14;}
    else{pColors[i*3]=.94;pColors[i*3+1]=.80;pColors[i*3+2]=.60;}
  }
  pGeo.setAttribute('color',new THREE.Float32BufferAttribute(pColors,3));
  const planet=new THREE.Mesh(pGeo,new THREE.MeshLambertMaterial({vertexColors:true}));
  planet.position.set(-520,115,-520);planet.rotation.z=.18;scene.add(planet);
  // Ring
  const ring=new THREE.Mesh(new THREE.RingGeometry(125,178,64),
    new THREE.MeshBasicMaterial({color:0xc89050,transparent:true,opacity:.52,side:THREE.DoubleSide}));
  ring.position.copy(planet.position);ring.rotation.x=1.3;ring.rotation.z=.08;scene.add(ring);
  // Moon 1 — grey
  const m1=new THREE.Mesh(new THREE.SphereGeometry(17,12,12),new THREE.MeshLambertMaterial({color:0xaaaabc}));
  m1.position.set(310,195,-460);scene.add(m1);
  // Moon 2 — reddish
  const m2=new THREE.Mesh(new THREE.SphereGeometry(11,12,12),new THREE.MeshLambertMaterial({color:0x887060}));
  m2.position.set(-260,275,490);scene.add(m2);
}

function buildNebula(){
  [{p:[-700,100,-600],r:300,c:0x3300aa,o:.08},{p:[600,80,-650],r:250,c:0x880044,o:.09},
   {p:[-600,150,500],r:280,c:0x006688,o:.07},{p:[650,60,600],r:220,c:0x000088,o:.10},
   {p:[0,50,-750],r:350,c:0x220055,o:.06},{p:[700,120,0],r:260,c:0x440088,o:.08},
  ].forEach(n=>{
    const nb=new THREE.Mesh(new THREE.SphereGeometry(n.r,10,8),
      new THREE.MeshBasicMaterial({color:n.c,transparent:true,opacity:n.o,side:THREE.BackSide}));
    nb.position.set(n.p[0],n.p[1],n.p[2]);scene.add(nb);
  });
}

function buildAsteroids(){
  _spaceAsteroids.length=0;
  const mats=[new THREE.MeshLambertMaterial({color:0x3a3a4e}),
              new THREE.MeshLambertMaterial({color:0x2e2e3a}),
              new THREE.MeshLambertMaterial({color:0x4a3e3e})];
  // Spawn asteroids alongside track (Candy-pattern) for immersive space debris
  const positions=[];
  const ASTEROID_COUNT=_mobCount(25);
  for(let i=0;i<ASTEROID_COUNT;i++){
    const tt=(i/ASTEROID_COUNT+Math.random()*.02)%1;
    const p=trackCurve.getPoint(tt),tgv=trackCurve.getTangent(tt).normalize();
    const nr=new THREE.Vector3(-tgv.z,0,tgv.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+20+Math.random()*40);
    positions.push([p.x+nr.x*side+(Math.random()-.5)*8,6+Math.random()*22,p.z+nr.z*side+(Math.random()-.5)*8,3+Math.random()*8]);
  }
  positions.forEach(([x,y,z,s])=>{
    const g=Math.random()<.5?new THREE.DodecahedronGeometry(s,0):new THREE.IcosahedronGeometry(s,0);
    const pa=g.attributes.position.array;
    for(let i=0;i<pa.length;i++)pa[i]+=(Math.random()-.5)*s*.28;
    g.attributes.position.needsUpdate=true;g.computeVertexNormals();
    const m=new THREE.Mesh(g,mats[Math.floor(Math.random()*mats.length)]);
    m.position.set(x,y,z);
    m.rotation.set(Math.random()*Math.PI*2,Math.random()*Math.PI*2,Math.random()*Math.PI*2);
    m._rspd=new THREE.Vector3((Math.random()-.5)*.35,(Math.random()-.5)*.7,(Math.random()-.5)*.25);
    scene.add(m);_spaceAsteroids.push(m);
  });
}

function buildSpaceTrackEdges(){
  // N must match the main track ribbon (N=400) — otherwise the segment vertices don't line up
  // on tight corners and the edge ribbon visually splits off, looking like a "ghost fork".
  // PolygonOffset -3 is stronger than the curbs (-1) and elines (-2), so these neon edges always
  // win the depth test and never z-fight against the track.
  const N=400;
  const cyMat=new THREE.MeshLambertMaterial({color:0x00ffff,emissive:0x00ccff,emissiveIntensity:2.2,transparent:true,opacity:.92});
  cyMat.polygonOffset=true;cyMat.polygonOffsetFactor=-3;cyMat.polygonOffsetUnits=-3;
  const mgMat=new THREE.MeshLambertMaterial({color:0xff00ff,emissive:0xcc00cc,emissiveIntensity:2.2,transparent:true,opacity:.92});
  mgMat.polygonOffset=true;mgMat.polygonOffsetFactor=-3;mgMat.polygonOffsetUnits=-3;
  ribbon(N,t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    return{L:p.clone().addScaledVector(nr,-(TW-.5)).setY(.025),R:p.clone().addScaledVector(nr,-(TW-.5)+.55).setY(.025)};
  },cyMat);
  ribbon(N,t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    return{L:p.clone().addScaledVector(nr,TW-.55).setY(.025),R:p.clone().addScaledVector(nr,TW).setY(.025)};
  },mgMat);
}

function buildSpaceOrbs(){
  const cols=[0x00ffff,0xff00ff,0x00ff88,0x8844ff];
  for(let i=0;i<36;i++){
    const t=i/36;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    [-1,1].forEach((side,si)=>{
      const col=cols[(i*2+si)%cols.length];
      const pp=p.clone().addScaledVector(nr,side*(BARRIER_OFF+1.5));
      const orb=new THREE.Mesh(new THREE.SphereGeometry(.75,8,8),
        new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:2.8}));
      orb.position.copy(pp);orb.position.y=4.2;scene.add(orb);
      const pl=new THREE.PointLight(col,2.0,18);pl.position.copy(orb.position);scene.add(pl);
      trackLightList.push(pl);trackPoles.push(orb);
    });
  }
}

function buildSpaceStation(){
  const p=trackCurve.getPoint(0),tg=trackCurve.getTangent(0).normalize();
  const nr=new THREE.Vector3(-tg.z,0,tg.x);
  const base=p.clone().addScaledVector(nr,-(TW+13));
  const mM=new THREE.MeshLambertMaterial({color:0x22223a});
  const gM=new THREE.MeshLambertMaterial({color:0x0044ff,emissive:0x0022aa,emissiveIntensity:1.6});
  const glM=new THREE.MeshLambertMaterial({color:0x88aaff,emissive:0x2244cc,emissiveIntensity:.9,transparent:true,opacity:.72});
  // Main block
  const bld=new THREE.Mesh(new THREE.BoxGeometry(22,8,13),mM);
  bld.position.copy(base);bld.position.y=4;bld.rotation.y=Math.atan2(tg.x,tg.z);scene.add(bld);
  // Control room glass box
  const ctrl=new THREE.Mesh(new THREE.BoxGeometry(10,4,8),glM);
  ctrl.position.copy(base);ctrl.position.y=10;ctrl.rotation.y=Math.atan2(tg.x,tg.z);scene.add(ctrl);
  // Comm tower
  const tower=new THREE.Mesh(new THREE.CylinderGeometry(.14,.24,14,6),mM);
  tower.position.copy(base);tower.position.y=15;scene.add(tower);
  // Glow base strips
  [-1,1].forEach(s=>{
    const strip=new THREE.Mesh(new THREE.BoxGeometry(22,.32,1.2),gM);
    strip.position.copy(base);strip.position.y=.2;
    strip.position.addScaledVector(nr,s*6.5);strip.rotation.y=Math.atan2(tg.x,tg.z);scene.add(strip);
  });
  // Docking arm
  const arm=new THREE.Mesh(new THREE.BoxGeometry(1.2,1,16),mM);
  arm.position.copy(base);arm.position.addScaledVector(tg,-11);arm.position.y=6;scene.add(arm);
}

function buildSpaceGate(){
  const p=trackCurve.getPoint(0),tg=trackCurve.getTangent(0).normalize();
  const nr=new THREE.Vector3(-tg.z,0,tg.x),hw=TW+4;
  const mM=new THREE.MeshLambertMaterial({color:0x1a1a2e});
  const nC=new THREE.MeshLambertMaterial({color:0x00ffff,emissive:0x00aaff,emissiveIntensity:2.4});
  const nM=new THREE.MeshLambertMaterial({color:0xff00ff,emissive:0xcc00cc,emissiveIntensity:2.4});
  [-1,1].forEach((s,si)=>{
    const pp=p.clone().addScaledVector(nr,s*hw);
    const post=new THREE.Mesh(new THREE.BoxGeometry(1.1,14,.8),mM);
    post.position.copy(pp);post.position.y=7;scene.add(post);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1.6,.18,8,24),si===0?nC:nM);
    ring.position.copy(pp);ring.position.y=12.5;ring.rotation.y=Math.atan2(tg.x,tg.z);scene.add(ring);
  });
  const bar=new THREE.Mesh(new THREE.BoxGeometry(hw*2,1.2,.8),mM);
  bar.position.copy(p);bar.position.y=14;scene.add(bar);
  const ledC=new THREE.Mesh(new THREE.BoxGeometry(hw*2-.6,.16,.35),nC);
  ledC.position.copy(p);ledC.position.y=13.4;scene.add(ledC);
  const ledM=new THREE.Mesh(new THREE.BoxGeometry(hw*2-.6,.16,.35),nM);
  ledM.position.copy(p);ledM.position.y=14.6;scene.add(ledM);
  // Sign
  const cvs=document.createElement('canvas');cvs.width=512;cvs.height=64;
  const sCtx=cvs.getContext('2d');
  sCtx.fillStyle='#04001a';sCtx.fillRect(0,0,512,64);
  sCtx.font='bold 36px monospace';sCtx.textAlign='center';sCtx.textBaseline='middle';
  const grd=sCtx.createLinearGradient(0,0,512,0);
  grd.addColorStop(0,'#00ffff');grd.addColorStop(.5,'#ffffff');grd.addColorStop(1,'#ff00ff');
  sCtx.fillStyle=grd;sCtx.fillText('COSMIC CIRCUIT',256,32);
  const tex=new THREE.CanvasTexture(cvs);
  const sign=new THREE.Mesh(new THREE.BoxGeometry(hw*2-1.5,2.4,.22),
    new THREE.MeshStandardMaterial({map:tex,emissiveMap:tex,emissive:new THREE.Color(1,1,1),emissiveIntensity:.85}));
  sign.position.copy(p);sign.position.y=16.4;scene.add(sign);
}

function buildSpaceBarriers(){
  [-1,1].forEach(side=>{
    const N=200,pos=[],nrm=[],idx=[];
    for(let i=0;i<=N;i++){
      const t=i/N,p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      const b=p.clone().addScaledVector(nr,side*BARRIER_OFF);
      pos.push(b.x,0,b.z,b.x,1.2,b.z);
      nrm.push(-side*nr.x,0,-side*nr.z,-side*nr.x,0,-side*nr.z);
      if(i<N){const a=i*2,b2=a+1,c=a+2,d=a+3;idx.push(a,b2,c,b2,d,c);}
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('normal',new THREE.Float32BufferAttribute(nrm,3));
    geo.setIndex(idx);
    const col=side===-1?0x0088ff:0xff0088;
    scene.add(new THREE.Mesh(geo,new THREE.MeshLambertMaterial({
      color:col,emissive:col,emissiveIntensity:.9,transparent:true,opacity:.30,side:THREE.DoubleSide
})));
  });
}

function buildSpaceDust(){
  if(_spaceDustParticles)return;
  const cnt=350;
  _spaceDustGeo=new THREE.BufferGeometry();
  const pos=new Float32Array(cnt*3);const col=new Float32Array(cnt*3);
  for(let i=0;i<cnt;i++){
    pos[i*3]=(Math.random()-.5)*400;
    pos[i*3+1]=Math.random()*22+1;
    pos[i*3+2]=(Math.random()-.5)*400;
    const r=Math.random();
    if(r<.33){col[i*3]=.7;col[i*3+1]=1;col[i*3+2]=1;}
    else if(r<.66){col[i*3]=.9;col[i*3+1]=.8;col[i*3+2]=1;}
    else{col[i*3]=1;col[i*3+1]=1;col[i*3+2]=1;}
  }
  _spaceDustGeo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  _spaceDustGeo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  _spaceDustParticles=new THREE.Points(_spaceDustGeo,new THREE.PointsMaterial({
    vertexColors:true,size:.38,sizeAttenuation:false,transparent:true,opacity:.52
  }));
  scene.add(_spaceDustParticles);
}

function buildSpaceGravityWells(){
  _spaceGravityWells.length=0;
  // 3 gravity wells placed just outside the ideal racing line
  [{t:.18,side:1},{t:.50,side:-1},{t:.78,side:1}].forEach(def=>{
    const p=trackCurve.getPoint(def.t),tg=trackCurve.getTangent(def.t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const center=p.clone().addScaledVector(nr,def.side*7); // 7 units off centerline
    center.y=.02;
    // Outer ring
    const torusMat=new THREE.MeshLambertMaterial({color:0x110033,emissive:0x4400aa,emissiveIntensity:1.8});
    const ring1=new THREE.Mesh(new THREE.TorusGeometry(5.5,.22,8,40),torusMat);
    ring1.position.copy(center);ring1.rotation.x=Math.PI/2;scene.add(ring1);
    // Middle ring (spins opposite)
    const ring2=new THREE.Mesh(new THREE.TorusGeometry(3.5,.18,8,32),new THREE.MeshLambertMaterial({color:0x220066,emissive:0x6600cc,emissiveIntensity:2.2}));
    ring2.position.copy(center);ring2.rotation.x=Math.PI/2;ring2.rotation.z=.4;scene.add(ring2);
    // Inner disc
    const disc=new THREE.Mesh(new THREE.CircleGeometry(2.2,32),new THREE.MeshLambertMaterial({color:0x000000,emissive:0x3300aa,emissiveIntensity:1.4,transparent:true,opacity:.88}));
    disc.position.copy(center);disc.position.y=.03;disc.rotation.x=-Math.PI/2;scene.add(disc);
    // Glow point light
    const pl=new THREE.PointLight(0x6600ff,2.5,18);pl.position.copy(center);pl.position.y=1;scene.add(pl);
    _spaceGravityWells.push({pos:center.clone(),ring1,ring2,pl,side:def.side,strength:0.007,radius:22});
  });
}

function buildSpaceRailguns(){
  _spaceRailguns.length=0;
  // 2 railgun strips on long straights
  [{t:.03},{t:.58}].forEach(def=>{
    const p=trackCurve.getPoint(def.t),tg=trackCurve.getTangent(def.t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const ang=Math.atan2(tg.x,tg.z);
    // Rail strips (two parallel, center of track)
    const railMat=new THREE.MeshLambertMaterial({color:0x00ffff,emissive:0x00aaff,emissiveIntensity:2.5});
    [-1,1].forEach(s=>{
      const rail=new THREE.Mesh(new THREE.BoxGeometry(.22,.08,8),railMat);
      rail.position.copy(p);rail.position.y=.05;rail.rotation.y=ang;
      rail.position.addScaledVector(nr,s*2.5);scene.add(rail);
    });
    // Glowing pad between rails
    const pad=new THREE.Mesh(new THREE.BoxGeometry(5.5,.06,8),new THREE.MeshLambertMaterial({color:0x0044ff,emissive:0x0022ff,emissiveIntensity:1.2,transparent:true,opacity:.7}));
    pad.position.copy(p);pad.position.y=.03;pad.rotation.y=ang;scene.add(pad);
    // Arrow chevrons
    const arMat=new THREE.MeshBasicMaterial({color:0x88ffff,transparent:true,opacity:.8});
    [-2,0,2].forEach(oz=>{
      [-1,1].forEach(s=>{
        const bar=new THREE.Mesh(new THREE.BoxGeometry(.12,.07,1.6),arMat);
        bar.position.copy(p);bar.position.y=.06;bar.rotation.y=ang+s*.55;
        bar.position.addScaledVector(tg,oz);scene.add(bar);
      });
    });
    // Point light
    const pl=new THREE.PointLight(0x00ccff,3,16);pl.position.copy(p);pl.position.y=1;scene.add(pl);
    _spaceRailguns.push({pos:p.clone(),t:def.t,tg:tg.clone(),pl,halfLen:4});
  });
}

function buildSpaceWormholes(){
  _spaceWormholes.length=0;
  // Two portal pairs — ONE-WAY: only portal A (entry) teleports you forward to B (exit)
  // Portal B is a visual-only exit gate — entering from B does nothing
  const pairs=[{tA:.25,tB:.70,colA:0x8800ff,colB:0x00ff88},{tA:.42,tB:.88,colA:0xff4400,colB:0x0088ff}];
  pairs.forEach(pair=>{
    [pair.tA,pair.tB].forEach((t,idx)=>{
      const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
      const isA=idx===0; // A = entry (teleports forward), B = exit only
      const col=isA?pair.colA:pair.colB;
      // Entry portal: full size + bright. Exit portal: smaller + dimmer
      const ringR=isA?TW*.85:TW*.60;
      const ringEmit=isA?2.8:1.2;
      const ringOpac=isA?.9:.55;
      const ring=new THREE.Mesh(
        new THREE.TorusGeometry(ringR,.6,10,44),
        new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:ringEmit,transparent:true,opacity:ringOpac}));
      ring.position.copy(p);ring.position.y=4.5;ring.rotation.y=Math.atan2(tg.x,tg.z);scene.add(ring);
      // Inner swirl canvas
      const swCvs=document.createElement('canvas');swCvs.width=128;swCvs.height=128;
      const swTex=new THREE.CanvasTexture(swCvs);
      const portalR=isA?TW*.78:TW*.54;
      const portal=new THREE.Mesh(new THREE.CircleGeometry(portalR,32),
        new THREE.MeshBasicMaterial({map:swTex,transparent:true,opacity:isA?.85:.45,side:THREE.DoubleSide}));
      portal.position.copy(p);portal.position.y=4.5;portal.rotation.y=Math.atan2(tg.x,tg.z);scene.add(portal);
      // Pillar of light (entry only)
      if(isA){
        const beam=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,40,8),
          new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:1.6,transparent:true,opacity:.25}));
        beam.position.copy(p);beam.position.y=20;scene.add(beam);
      }
      // Entry: floating "SHORTCUT →" label above portal
      if(isA){
        const lblCvs=document.createElement('canvas');lblCvs.width=256;lblCvs.height=64;
        const lc=lblCvs.getContext('2d');
        lc.fillStyle='rgba(0,0,0,0)';lc.fillRect(0,0,256,64);
        lc.font='bold 22px Orbitron,sans-serif';lc.fillStyle='#ffffff';lc.textAlign='center';
        lc.fillText('SHORTCUT ▶',128,38);
        const lblTex=new THREE.CanvasTexture(lblCvs);
        const lbl=new THREE.Sprite(new THREE.SpriteMaterial({map:lblTex,transparent:true,opacity:.9}));
        lbl.position.copy(p);lbl.position.y=10.5;lbl.scale.set(8,2,1);scene.add(lbl);
      }
      // Exit: floating "EXIT" label
      if(!isA){
        const lblCvs=document.createElement('canvas');lblCvs.width=128;lblCvs.height=48;
        const lc=lblCvs.getContext('2d');
        lc.fillStyle='rgba(0,0,0,0)';lc.fillRect(0,0,128,48);
        lc.font='bold 18px Orbitron,sans-serif';lc.fillStyle='rgba(255,255,255,0.6)';lc.textAlign='center';
        lc.fillText('EXIT',64,30);
        const lblTex=new THREE.CanvasTexture(lblCvs);
        const lbl=new THREE.Sprite(new THREE.SpriteMaterial({map:lblTex,transparent:true,opacity:.6}));
        lbl.position.copy(p);lbl.position.y=8.5;lbl.scale.set(5,1.5,1);scene.add(lbl);
      }
      // Point light (entry brighter than exit)
      const pl=new THREE.PointLight(col,isA?3.5:1.8,isA?28:18);pl.position.copy(p);pl.position.y=4;scene.add(pl);
      const swCtx=swCvs.getContext('2d');
      _spaceWormholes.push({t,linkedT:pair.tB,ring,portal,swCvs,swCtx,swTex,pl,col,
        phase:isA?0:Math.PI,_drawTimer:0,isEntry:isA});
    });
  });
}

function buildSpaceUFOs(){
  _spaceUFOs.length=0;
  const ufoColors=[0x00ff88,0xaa00ff,0x00ccff,0xff4488,0xffaa00,0x44ffff,0xff2288,0x88ff00];
  for(let i=0;i<10;i++){
    const t=i/10;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const col=ufoColors[i%ufoColors.length];
    const side=(i%2===0?1:-1);
    const spawnX=p.x+nr.x*side*(BARRIER_OFF+30+Math.random()*20);
    const spawnZ=p.z+nr.z*side*(BARRIER_OFF+30+Math.random()*20);
    const spawnY=22+Math.random()*18;
    // Body (flattened sphere)
    const bodyGeo=new THREE.SphereGeometry(2.2,16,10);
    bodyGeo.scale(1,.35,1);
    const body=new THREE.Mesh(bodyGeo,new THREE.MeshLambertMaterial({color:0x222233}));
    body.position.set(spawnX,spawnY,spawnZ);scene.add(body);
    // Dome
    const dome=new THREE.Mesh(new THREE.SphereGeometry(1.1,12,8,0,Math.PI*2,0,Math.PI*.5),
      new THREE.MeshLambertMaterial({color:0x8899ff,emissive:0x4466cc,emissiveIntensity:.8,transparent:true,opacity:.75}));
    dome.position.copy(body.position);dome.position.y+=.4;scene.add(dome);
    // Glow ring
    const glowRing=new THREE.Mesh(new THREE.TorusGeometry(2.4,.12,6,28),
      new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:3.0}));
    glowRing.rotation.x=Math.PI/2;glowRing.position.copy(body.position);glowRing.position.y-=.15;scene.add(glowRing);
    // No per-UFO PointLight — emissive glow ring is enough at this distance
    _spaceUFOs.push({body,dome,glowRing,
      orbitRadius:BARRIER_OFF+32+Math.random()*18,
      orbitY:spawnY,orbitT:t+Math.random(),orbitSpd:.08+Math.random()*.06,
      beamTimer:Math.random()*6,col});
  }
}

function buildSpaceMeteorSystem(){
  _spaceMeteors.length=0;
  _spaceMeteorTimer=12+Math.random()*10;
  // Pool of 3 potential meteors (reused)
  const matOrange=new THREE.MeshLambertMaterial({color:0xff4400,emissive:0xff2200,emissiveIntensity:1.8});
  for(let i=0;i<3;i++){
    const g=new THREE.IcosahedronGeometry(1.4+Math.random()*.8,0);
    const pa=g.attributes.position.array;
    for(let j=0;j<pa.length;j++)pa[j]+=(Math.random()-.5)*.6;
    g.attributes.position.needsUpdate=true;g.computeVertexNormals();
    const m=new THREE.Mesh(g,matOrange.clone());
    m.visible=false;m.position.set(0,300,0);scene.add(m);
    const pl=new THREE.PointLight(0xff4400,0,20);pl.position.copy(m.position);scene.add(pl);
    _spaceMeteors.push({mesh:m,pl,active:false,vy:0,tx:0,tz:0,t:0});
  }
}

function buildSpaceTractorBeam(){
  // Vertical beam shown during recovery
  const geo=new THREE.CylinderGeometry(1.8,0.3,220,12,1);
  const mat=new THREE.MeshLambertMaterial({color:0x00ffff,emissive:0x00aaff,emissiveIntensity:3.5,transparent:true,opacity:.55});
  _spaceBeamMesh=new THREE.Mesh(geo,mat);
  _spaceBeamMesh.position.set(0,-100,0); // hidden below
  _spaceBeamMesh.visible=false;
  scene.add(_spaceBeamMesh);
}

function updateSpaceWorld(dt){
  // ── Rotate asteroids + void debris ──────────────────────────────
  _spaceAsteroids.forEach(a=>{
    if(!a._rspd)return;
    a.rotation.x+=a._rspd.x*dt;a.rotation.y+=a._rspd.y*dt;a.rotation.z+=a._rspd.z*dt;
  });
  // ── Space dust drift — throttled to ~10fps to avoid per-frame GPU uploads ────
  if(_spaceDustParticles&&_spaceDustGeo){
    _spaceDustParticles._driftTimer=(_spaceDustParticles._driftTimer||0)-dt;
    if(_spaceDustParticles._driftTimer<=0){
      _spaceDustParticles._driftTimer=0.1; // 10fps
      const pa=_spaceDustGeo.attributes.position.array;
      const pcar=carObjs[playerIdx];
      const cx=pcar?pcar.mesh.position.x:0,cz=pcar?pcar.mesh.position.z:0;
      for(let i=0;i<pa.length;i+=3){
        pa[i]+=Math.sin(_nowSec*.18+i)*.2;pa[i+1]+=Math.sin(_nowSec*.28+i*1.7)*.1;pa[i+2]+=Math.cos(_nowSec*.22+i)*.2;
        if(pa[i+1]>24||pa[i+1]<.4||Math.abs(pa[i]-cx)>220||Math.abs(pa[i+2]-cz)>220){pa[i]=cx+(Math.random()-.5)*380;pa[i+1]=Math.random()*20+1;pa[i+2]=cz+(Math.random()-.5)*380;}
      }
      _spaceDustGeo.attributes.position.needsUpdate=true;
    }
  }
  // ── Gravity well spin ────────────────────────────────────────────
  _spaceGravityWells.forEach((w,i)=>{
    w.ring1.rotation.z+=dt*(.8+i*.2);
    w.ring2.rotation.z-=dt*1.2;
    // Pull player toward well if within radius
    const car=carObjs[playerIdx];
    if(car&&!car._fallingIntoSpace&&!car.finished){
      const dx=car.mesh.position.x-w.pos.x,dz=car.mesh.position.z-w.pos.z;
      const dist=Math.sqrt(dx*dx+dz*dz);
      if(dist<w.radius&&dist>.5){
        const pull=w.strength*(1-(dist/w.radius));
        car.mesh.position.x-=dx/dist*pull*60*dt;
        car.mesh.position.z-=dz/dist*pull*60*dt;
        if(dist<8&&Math.random()<.015*dt*60)floatText('⚠ GRAVITY!','#aa00ff',innerWidth*.5,innerHeight*.55);
      }
    }
    // Pulse glow
    w.pl.intensity=2.0+Math.sin(_nowSec*3+i)*.8;
  });
  // ── Railgun effect (player physics applied in checkSpaceRailgun) ─
  _spaceRailguns.forEach((r,i)=>{r.pl.intensity=2.5+Math.sin(_nowSec*8+i)*.8;});
  // ── Wormhole swirl animation — throttled to ~15fps (no need for 60fps canvas redraws) ──
  _spaceWormholes.forEach(w=>{
    w.phase+=dt*(w.isEntry?1.8:0.6); // exit portals spin slower
    w.pl.intensity=(w.isEntry?3.0:1.4)+Math.sin(_nowSec*4+w.phase)*(w.isEntry?.8:.3);
    w._drawTimer-=dt;
    if(w._drawTimer>0)return; // skip canvas redraw this frame
    w._drawTimer=0.067; // ~15fps
    const ctx=w.swCtx; // cached context — no getContext() call
    ctx.clearRect(0,0,128,128);
    const g=ctx.createRadialGradient(64,64,0,64,64,60);
    const hex='#'+w.col.toString(16).padStart(6,'0');
    g.addColorStop(0,'rgba(255,255,255,.9)');
    g.addColorStop(.3,hex+'cc');g.addColorStop(.7,hex+'44');g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g;ctx.fillRect(0,0,128,128);
    ctx.save();ctx.translate(64,64);ctx.rotate(w.phase);
    for(let s=0;s<4;s++){
      ctx.beginPath();ctx.rotate(Math.PI*.5);
      for(let r2=2;r2<58;r2+=2){ctx.lineTo(Math.cos(r2*.22)*r2,Math.sin(r2*.22)*r2);}
      ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=1.5;ctx.stroke();
    }
    ctx.restore();w.swTex.needsUpdate=true;
  });
  // ── UFO orbits + occasional beam ────────────────────────────────
  _spaceUFOs.forEach(u=>{
    u.orbitT+=dt*u.orbitSpd;
    const angle=u.orbitT*Math.PI*2;
    const cx=Math.cos(angle)*u.orbitRadius,cz=Math.sin(angle)*u.orbitRadius;
    u.body.position.set(cx,u.orbitY+Math.sin(u.orbitT*2.3)*.8,cz);
    u.dome.position.copy(u.body.position);u.dome.position.y+=.42;
    u.glowRing.position.copy(u.body.position);u.glowRing.position.y-=.14;
    u.glowRing.rotation.z+=dt*.9;
    // Occasional beam down to track
    u.beamTimer-=dt;
    if(u.beamTimer<=0){u.beamTimer=6+Math.random()*8;}
  });
  // ── Tractor beam fade ─────────────────────────────────────────────
  if(_spaceBeamTimer>0){
    _spaceBeamTimer-=dt;
    if(_spaceBeamMesh){
      _spaceBeamMesh.visible=true;
      _spaceBeamMesh.material.opacity=Math.min(.6,_spaceBeamTimer*.5);
      _spaceBeamMesh.rotation.y+=dt*2;
    }
    if(_spaceBeamTimer<=0&&_spaceBeamMesh)_spaceBeamMesh.visible=false;
  }
  // ── Meteor system ────────────────────────────────────────────────
  _spaceMeteorTimer-=dt;
  if(_spaceMeteorTimer<=0){
    _spaceMeteorTimer=14+Math.random()*12;
    spawnSpaceMeteor();
  }
  _spaceMeteors.forEach(m=>{
    if(!m.active)return;
    m.mesh.position.y+=m.vy*dt;m.mesh.rotation.x+=1.2*dt;m.mesh.rotation.z+=.8*dt;
    m.pl.position.copy(m.mesh.position);
    m.vy-=32*dt; // fast fall
    // Trail: emit spark each frame
    if(Math.random()<.6)sparkSystem.emit(m.mesh.position.x,m.mesh.position.y,m.mesh.position.z,(Math.random()-.5)*.05,.06+Math.random()*.04,(Math.random()-.5)*.05,4,1,.55,.15,.9);
    if(m.mesh.position.y<=.5){
      // Impact
      sparkSystem.emit(m.mesh.position.x,.5,m.mesh.position.z,(Math.random()-.5)*.12,.14+Math.random()*.08,(Math.random()-.5)*.12,28,1,.6,.2,.9);
      camShake=.7;
      // Stay as obstacle for 8 seconds then deactivate
      m.mesh.position.y=.5;m.vy=0;m.t+=dt;
      m.pl.intensity=1.2+Math.sin(_nowSec*4)*.5;
      if(m.t>8){m.active=false;m.mesh.visible=false;m.pl.intensity=0;}
      // Check collision with player
      const car=carObjs[playerIdx];
      if(car){
        const dd=car.mesh.position.distanceTo(m.mesh.position);
        if(dd<3.5){
          car.speed*=.4;car.hitCount=(car.hitCount||0)+1;
          floatText('☄ METEOR HIT!','#ff4400',innerWidth*.5,innerHeight*.45);
          Audio.playCollision();m.active=false;m.mesh.visible=false;m.pl.intensity=0;
        }
      }
    }
  });
  // ── Player fall detection ─────────────────────────────────────────
  const car=carObjs[playerIdx];
  if(car&&car._fallingIntoSpace&&!recoverActive){
    car._fallTimer=(car._fallTimer||0)+dt;
    car.vy-=18*dt;
    car.mesh.position.y+=car.vy*dt;
    car.speed*=Math.pow(.85,dt*60);
    car.mesh.rotation.x+=.9*dt;car.mesh.rotation.z+=.6*dt;
    if(car.mesh.position.y<-18||car._fallTimer>3.5)triggerSpaceRecovery(car);
  }
}

function checkSpaceRailgun(){
  if(!_spaceRailguns.length||activeWorld!=='space')return;
  const car=carObjs[playerIdx];if(!car||recoverActive||car._fallingIntoSpace)return;
  _spaceRailguns.forEach(r=>{
    const dx=car.mesh.position.x-r.pos.x,dz=car.mesh.position.z-r.pos.z;
    const dist=Math.sqrt(dx*dx+dz*dz);
    if(dist<TW*.9&&(r._cooldown||0)<=0){
      // Boost along track direction
      const tg=trackCurve.getTangent(car.progress).normalize();
      car.mesh.rotation.y=Math.atan2(-tg.x,-tg.z);
      car.speed=Math.min(car.def.topSpd*1.55,car.speed+(car.def.topSpd*.45));
      car.boostTimer=1.2;
      r._cooldown=3.5;
      showPopup('⚡ RAILGUN BOOST!','#00aaff',900);
      floatText('⚡ +SPEED','#00aaff',innerWidth*.5,innerHeight*.5);
      playSpaceRailgunSound();
      camShake=0.25;
      sparkSystem.emit(car.mesh.position.x,car.mesh.position.y+.3,car.mesh.position.z,
        tg.x*.22,.04+Math.random()*.06,tg.z*.22,18,.3,.6,1,.4);
    }
    if((r._cooldown||0)>0)r._cooldown-=1/60;
  });
}


function checkSpaceWormhole(){
  if(!_spaceWormholes.length||activeWorld!=='space')return;
  const car=carObjs[playerIdx];if(!car||recoverActive||car._fallingIntoSpace)return;
  if(_wormholeCooldown>0){_wormholeCooldown-=1/60;return;}
  _spaceWormholes.forEach(portal=>{
    if(!portal.isEntry)return; // exit portals don't teleport — one-way only
    const pp=portal.ring.position;
    const dx=car.mesh.position.x-pp.x,dz=car.mesh.position.z-pp.z;
    if(dx*dx+dz*dz>TW*TW*.42)return; // quick sq distance check before sqrt
    const destT=portal.linkedT;
    const dest=trackCurve.getPoint(destT);
    const tg=trackCurve.getTangent(destT).normalize();
    car.mesh.position.set(dest.x,0.35,dest.z);
    car.mesh.rotation.set(0,Math.atan2(-tg.x,-tg.z),0);
    car.progress=destT;
    _wormholeCooldown=3.5;
    camShake=0.5;
    playSpaceWormholeSound();
    showPopup('🌀 SHORTCUT!','#aa44ff',1000);
    floatText('🌀 SHORTCUT','#cc55ff',innerWidth*.5,innerHeight*.45);
    sparkSystem.emit(dest.x,.5,dest.z,0,.12,0,24,.5,.2,1,.5);
  });
}

