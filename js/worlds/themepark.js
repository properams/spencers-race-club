// js/worlds/themepark.js — themepark world builders + update + collision checks
// Non-module script.

// Per-world state (uit main.js verhuisd) — gereset in core/scene.js buildScene().
let _tpFerris=null,_tpCarousel=null,_tpCarouselHorses=[],_tpCoasters=[],_tpBalloons=[];
let _tpFireworks=[],_tpBunting=[],_tpParkLights=[],_tpFireworkTimer=0;

function buildThemeparkEnvironment(){
  // Dark pavement ground
  const g=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),
    new THREE.MeshLambertMaterial({color:0x1a0a22}));
  g.rotation.x=-Math.PI/2;g.position.y=-.15;g.receiveShadow=true;scene.add(g);
  // Grassy patches
  const gm=new THREE.MeshLambertMaterial({color:0x2a5a2a});
  for(let i=0;i<_mobCount(10);i++){
    const gp=new THREE.Mesh(new THREE.CircleGeometry(20+Math.random()*18,10),gm);
    gp.rotation.x=-Math.PI/2;
    const ang=Math.random()*Math.PI*2,r=380+Math.random()*200;
    gp.position.set(Math.cos(ang)*r,-.12,Math.sin(ang)*r);scene.add(gp);
  }

  // ── FERRIS WHEEL (large landmark) ──
  {
    const fg=new THREE.Group();
    const R=42;
    const ringMat=new THREE.MeshLambertMaterial({color:0xff5588,emissive:0xff2266,emissiveIntensity:.5});
    const ring=new THREE.Mesh(new THREE.TorusGeometry(R,.8,6,36),ringMat);fg.add(ring);
    const ring2=new THREE.Mesh(new THREE.TorusGeometry(R*.55,.5,6,28),
      new THREE.MeshLambertMaterial({color:0xffcc22,emissive:0xff8800,emissiveIntensity:.4}));fg.add(ring2);
    const spokeMat=new THREE.MeshLambertMaterial({color:0xffcc22,emissive:0xff8800,emissiveIntensity:.3});
    for(let i=0;i<8;i++){
      const sp=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,R*2,5),spokeMat);
      sp.rotation.z=i/8*Math.PI;fg.add(sp);
    }
    const cabCols=[0xff4488,0x44ccff,0xffcc22,0x88ff66,0xff8844,0xcc44ff,0xff3366,0x33ddee];
    const cabins=[];
    for(let i=0;i<8;i++){
      const a=i/8*Math.PI*2;
      const cab=new THREE.Mesh(new THREE.BoxGeometry(4.5,4,4),
        new THREE.MeshLambertMaterial({color:cabCols[i],emissive:cabCols[i],emissiveIntensity:.3}));
      cab.position.set(Math.cos(a)*R,Math.sin(a)*R,0);fg.add(cab);
      cabins.push({mesh:cab});
    }
    // Place ferris wheel alongside track at t=0.72, perpendicular offset 58 (close but not blocking)
    {
      const p=trackCurve.getPoint(0.72),tg=trackCurve.getTangent(0.72).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      const fx=p.x+nr.x*58,fz=p.z+nr.z*58;
      fg.position.set(fx,R+5,fz);
      scene.add(fg);
      _tpFerris={group:fg,cabins:cabins};
      const pylMat=new THREE.MeshLambertMaterial({color:0x3a3050});
      for(let s=-1;s<=1;s+=2){
        const pyl=new THREE.Mesh(new THREE.CylinderGeometry(1.6,2.6,R+5,6),pylMat);
        pyl.position.set(fx+s*7,(R+5)/2-2,fz);pyl.rotation.z=-s*.15;scene.add(pyl);
      }
      const fl=new THREE.PointLight(0xff5599,1.6,180);
      fl.position.set(fx,R+8,fz);scene.add(fl);_tpParkLights.push(fl);
    }
  }

  // ── CAROUSEL ──
  {
    const cg=new THREE.Group();
    const base=new THREE.Mesh(new THREE.CylinderGeometry(12,13,1,16),
      new THREE.MeshLambertMaterial({color:0xffcc66}));
    base.position.y=.5;cg.add(base);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,18,8),
      new THREE.MeshLambertMaterial({color:0xffeeaa}));
    pole.position.y=10;cg.add(pole);
    const roof=new THREE.Mesh(new THREE.ConeGeometry(13,6,16),
      new THREE.MeshLambertMaterial({color:0xff4488,emissive:0xff2266,emissiveIntensity:.3}));
    roof.position.y=19;cg.add(roof);
    // Roof stripe decorations
    for(let i=0;i<8;i++){
      const a=i/8*Math.PI*2;
      const stripe=new THREE.Mesh(new THREE.BoxGeometry(.4,5.5,2),
        new THREE.MeshLambertMaterial({color:0xffffff}));
      stripe.position.set(Math.cos(a)*11.2,19,Math.sin(a)*11.2);
      stripe.rotation.y=-a;cg.add(stripe);
    }
    const horseCols=[0xffffff,0xff88aa,0xffcc66,0xaaddff,0xcc88ff,0xffdd88];
    for(let i=0;i<6;i++){
      const a=i/6*Math.PI*2;
      const hg=new THREE.Group();
      const bodyM=new THREE.MeshLambertMaterial({color:horseCols[i]});
      const body=new THREE.Mesh(new THREE.BoxGeometry(2.2,1.5,.9),bodyM);
      hg.add(body);
      const head=new THREE.Mesh(new THREE.BoxGeometry(.6,1.2,.7),bodyM);
      head.position.set(1.2,.85,0);hg.add(head);
      const legM=new THREE.MeshLambertMaterial({color:0x553322});
      [[0.7,.3],[0.7,-.3],[-.7,.3],[-.7,-.3]].forEach(lp=>{
        const leg=new THREE.Mesh(new THREE.BoxGeometry(.3,1.2,.3),legM);
        leg.position.set(lp[0],-1.15,lp[1]);hg.add(leg);
      });
      hg.position.set(Math.cos(a)*9,3.2,Math.sin(a)*9);
      hg.rotation.y=-a+Math.PI/2;
      cg.add(hg);
      _tpCarouselHorses.push({mesh:hg,baseY:3.2,offset:i*.9});
    }
    // Place carousel alongside track at t=0.28, opposite side of ferris wheel
    {
      const p=trackCurve.getPoint(0.28),tg=trackCurve.getTangent(0.28).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      const cx=p.x-nr.x*50,cz=p.z-nr.z*50;
      cg.position.set(cx,0,cz);scene.add(cg);_tpCarousel=cg;
      const cl=new THREE.PointLight(0xffaa66,1.2,120);
      cl.position.set(cx,18,cz);scene.add(cl);_tpParkLights.push(cl);
    }
  }

  // ── ROLLER COASTERS (2 arching tracks with moving cars) — placed alongside race track ──
  {
    [[0.45,1,0xff2266,40],[0.88,-1,0x22ccee,36]].forEach((cfg,ci)=>{
      const tt=cfg[0],side=cfg[1],col=cfg[2],loopR=cfg[3];
      const p=trackCurve.getPoint(tt),tg=trackCurve.getTangent(tt).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      const cx=p.x+nr.x*side*62,cz=p.z+nr.z*side*62;
      const pts=[];
      for(let i=0;i<16;i++){
        const th=i/16*Math.PI*2,r=loopR+Math.sin(th*2)*8;
        pts.push(new THREE.Vector3(cx+Math.cos(th)*r,16+Math.sin(th*3+ci)*14+12,cz+Math.sin(th)*r));
      }
      const curve=new THREE.CatmullRomCurve3(pts,true);
      const tube=new THREE.Mesh(new THREE.TubeGeometry(curve,50,.7,6,true),
        new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:.4}));
      scene.add(tube);
      // Support pylons
      const pylM=new THREE.MeshLambertMaterial({color:0x3a3050});
      for(let i=0;i<8;i++){
        const p=curve.getPoint(i/8);
        const pyl=new THREE.Mesh(new THREE.CylinderGeometry(.35,.55,p.y,5),pylM);
        pyl.position.set(p.x,p.y/2,p.z);scene.add(pyl);
      }
      const car=new THREE.Mesh(new THREE.BoxGeometry(2.5,1.2,1.2),
        new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:.6}));
      scene.add(car);
      _tpCoasters.push({curve:curve,car:car,t:Math.random(),speed:.12+Math.random()*.08});
    });
  }

  // ── CIRCUS TENTS (alongside track) ──
  [[0.08,1,0xff3355],[0.33,-1,0xff8833],[0.58,1,0xcc44ff],[0.92,-1,0x44aaff]].forEach((cfg,ti)=>{
    const tt=cfg[0],side=cfg[1],col1=cfg[2];
    const p=trackCurve.getPoint(tt),tgv=trackCurve.getTangent(tt).normalize();
    const nr=new THREE.Vector3(-tgv.z,0,tgv.x);
    const x=p.x+nr.x*side*42,z=p.z+nr.z*side*42;
    const tg=new THREE.Group();
    for(let s=0;s<16;s++){
      const a=s/16*Math.PI*2;
      const segCol=s%2===0?col1:0xffffff;
      const seg=new THREE.Mesh(
        new THREE.ConeGeometry(15,18,16,1,true,a,Math.PI*2/16),
        new THREE.MeshLambertMaterial({color:segCol,side:THREE.DoubleSide,emissive:segCol,emissiveIntensity:.1}));
      tg.add(seg);
    }
    const flag=new THREE.Mesh(new THREE.ConeGeometry(1.4,3,4),
      new THREE.MeshBasicMaterial({color:0xffdd44}));
    flag.position.y=11;tg.add(flag);
    tg.position.set(x,9,z);scene.add(tg);
  });

  // ── FLOATING BALLOONS (alongside track, close) ──
  {
    const cols=[0xff3366,0xffcc22,0x44ccee,0xaa44ff,0xff8844,0x66ee99];
    const count=_mobCount(22);
    for(let i=0;i<count;i++){
      const col=cols[i%cols.length];
      const b=new THREE.Mesh(new THREE.SphereGeometry(1.4,8,6),
        new THREE.MeshLambertMaterial({color:col,emissive:col,emissiveIntensity:.35}));
      const tt=(i/count+Math.random()*.02)%1;
      const p=trackCurve.getPoint(tt),tgv=trackCurve.getTangent(tt).normalize();
      const nr=new THREE.Vector3(-tgv.z,0,tgv.x);
      const side=(i%2===0?1:-1)*(BARRIER_OFF+18+Math.random()*28);
      b.position.set(p.x+nr.x*side,10+Math.random()*38,p.z+nr.z*side);scene.add(b);
      _tpBalloons.push({mesh:b,speed:.35+Math.random()*.5,xOff:Math.random()*6.28});
    }
  }

  // ── STRING LIGHTS / LANTERNS (alongside track, very close) ──
  {
    const cols=[0xffdd44,0xff4466,0x44ccee,0xff88cc,0x88ff66];
    const strandTs=[0.05,0.2,0.38,0.52,0.68,0.82];
    strandTs.forEach((tt,si)=>{
      const col=cols[si%cols.length];
      const p=trackCurve.getPoint(tt),tgv=trackCurve.getTangent(tt).normalize();
      const nr=new THREE.Vector3(-tgv.z,0,tgv.x);
      const side=(si%2===0?1:-1)*(BARRIER_OFF+6);
      const bx=p.x+nr.x*side,bz=p.z+nr.z*side;
      for(let k=0;k<10;k++){
        const lb=new THREE.Mesh(new THREE.SphereGeometry(.38,5,4),
          new THREE.MeshBasicMaterial({color:col}));
        // Spread along tangent direction
        lb.position.set(bx+tgv.x*(k-4.5)*2.4,10.5+Math.sin(k*.7)*.6,bz+tgv.z*(k-4.5)*2.4);
        scene.add(lb);
      }
    });
  }

  // Extra party point-lights
  [[0,30,0,0xff6688],[-200,25,-200,0xffcc22],[200,25,200,0x44ccee]].forEach(cfg=>{
    const pl=new THREE.PointLight(cfg[3],.95,170);
    pl.position.set(cfg[0],cfg[1],cfg[2]);scene.add(pl);_tpParkLights.push(pl);
  });

  // Barriers + start line + car lights
  buildBarriers();buildStartLine();
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);

  // Warm sky stars (sunset feel)
  const sg=new THREE.SphereGeometry(.18,4,4),ssm=new THREE.MeshBasicMaterial({color:0xffddaa,transparent:true,opacity:.8});
  stars=new THREE.InstancedMesh(sg,ssm,70);stars.visible=true;
  const dm=new THREE.Object3D();
  for(let i=0;i<70;i++){
    const th=Math.random()*Math.PI*2,ph=Math.random()*Math.PI*.35,r=310+Math.random()*70;
    dm.position.set(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph)*.4+55,r*Math.sin(ph)*Math.sin(th));
    dm.scale.setScalar(.5+Math.random()*1.2);dm.updateMatrix();stars.setMatrixAt(i,dm.matrix);
  }
  stars.instanceMatrix.needsUpdate=true;scene.add(stars);
}


function updateThemeparkWorld(dt){
  const t=_nowSec;
  // Sunset clouds drift very slowly
  if(scene&&scene.background&&scene.background.isTexture){
    scene.background.offset.x=(scene.background.offset.x+dt*.0015)%1;
  }
  if(_tpFerris&&_tpFerris.group){
    _tpFerris.group.rotation.z+=dt*.22;
    for(let i=0;i<_tpFerris.cabins.length;i++){
      _tpFerris.cabins[i].mesh.rotation.z=-_tpFerris.group.rotation.z;
    }
  }
  if(_tpCarousel)_tpCarousel.rotation.y+=dt*.4;
  for(let i=0;i<_tpCarouselHorses.length;i++){
    const h=_tpCarouselHorses[i];
    h.mesh.position.y=h.baseY+Math.sin(t*3+h.offset)*.5;
  }
  for(let i=0;i<_tpCoasters.length;i++){
    const c=_tpCoasters[i];
    c.t=(c.t+dt*c.speed)%1;
    const p=c.curve.getPoint(c.t);c.car.position.copy(p);
  }
  for(let i=0;i<_tpBalloons.length;i++){
    const b=_tpBalloons[i];
    b.mesh.position.y+=dt*b.speed;
    b.mesh.position.x+=Math.sin(t*.4+b.xOff)*dt*.25;
    if(b.mesh.position.y>85)b.mesh.position.y=8;
  }
  for(let i=0;i<_tpParkLights.length;i++){
    _tpParkLights[i].intensity=.8+Math.sin(t*1.5+i*1.2)*.35;
  }
  _tpFireworkTimer-=dt;
  if(_tpFireworkTimer<=0){_tpFireworkTimer=1.8+Math.random()*3;_tpSpawnFirework();}
  for(let i=_tpFireworks.length-1;i>=0;i--){
    const fw=_tpFireworks[i];
    fw.age+=dt;
    const life=fw.age/fw.maxAge;
    if(life>=1){
      scene.remove(fw.mesh);if(fw.light)scene.remove(fw.light);
      fw.mesh.geometry.dispose();fw.mesh.material.dispose();
      _tpFireworks.splice(i,1);continue;
    }
    const pos=fw.geo.attributes.position.array;
    for(let j=0;j<pos.length;j+=3){
      pos[j]+=fw.vel[j]*dt;
      pos[j+1]+=fw.vel[j+1]*dt-dt*dt*7;
      pos[j+2]+=fw.vel[j+2]*dt;
      fw.vel[j+1]-=dt*6; // gravity
    }
    fw.geo.attributes.position.needsUpdate=true;
    fw.mesh.material.opacity=(1-life)*.9;
    if(fw.light)fw.light.intensity=(1-life)*2.2;
  }
}

