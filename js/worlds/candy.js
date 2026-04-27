// js/worlds/candy.js — candy world builders + update + collision checks
// Non-module script.

// Per-world state (uit main.js verhuisd) — gereset in core/scene.js buildScene().
let _sprinkleParticles=null,_sprinkleGeo=null;
const _gummyBears=[];
const _gumZones=[];
const _candyCannons=[];
let _chocoHighlight=null;
let _candyCaneList=[];
let _candyLollipops=[];
let _candyNightEmissives=[]; // meshes that glow at night
let _candyCandles=[];        // candle flame lights on cake

function buildCandyEnvironment(){
  buildCandyGround();
  buildCandySky();
  buildLollipopTrees();
  buildCandyCanes();
  buildChocolateRiver();
  buildGumDropMountains();
  buildCakeBuilding();
  buildCandyGate();
  buildSprinkleParticles();
  buildCottonCandyClouds();
  buildRainbowTrackStripes();
  buildCandyBarriers();
  buildIceCreamCones();
  buildCookieSpectators();
}


function buildCandyGround(){
  // Pink fondant main ground
  const gMat=new THREE.MeshLambertMaterial({color:0xffaacc});
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),gMat);
  ground.rotation.x=-Math.PI/2;ground.position.y=-.12;ground.receiveShadow=true;scene.add(ground);
  // Infield: light lavender fondant
  const infMat=new THREE.MeshLambertMaterial({color:0xeeaaee});
  const inf=new THREE.Mesh(new THREE.PlaneGeometry(440,580),infMat);
  inf.rotation.x=-Math.PI/2;inf.position.set(-40,-.11,-60);scene.add(inf);
  // Coloured candy spot circles on the ground
  const spotColors=[0xff6688,0xffcc44,0x88eebb,0x88aaff,0xff99cc,0xffee88];
  for(let i=0;i<28;i++){
    const col=spotColors[i%spotColors.length];
    const r=6+Math.random()*10;
    const sm=new THREE.MeshLambertMaterial({color:col,transparent:true,opacity:.55});
    const sp=new THREE.Mesh(new THREE.CircleGeometry(r,12),sm);
    sp.rotation.x=-Math.PI/2;
    sp.position.set((Math.random()-.5)*700,.01,(Math.random()-.5)*700);
    scene.add(sp);
  }
}


function buildCandySky(){
  // Rainbow arc — 7 semi-torus rings high above
  const rainbowColors=[0xff2200,0xff8800,0xffee00,0x44dd44,0x2299ff,0x5544ff,0xcc44ff];
  rainbowColors.forEach((col,i)=>{
    const r=260-i*14,tube=7-i*.5;
    const geo=new THREE.TorusGeometry(r,tube,6,48,Math.PI);
    const mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.55-i*.02,side:THREE.DoubleSide});
    const m=new THREE.Mesh(geo,mat);
    m.rotation.x=Math.PI/2;m.position.set(-20,60+i*.4,-20);
    scene.add(m);
  });
}


function buildLollipopTrees(){
  const stickMat=new THREE.MeshLambertMaterial({color:0xf5e0c8});
  const headColors=[0xff2266,0xff8800,0x22ccff,0xaadd00,0xcc44ff,0xff44aa,0xffcc00,0x44ddbb];
  const count=44;
  for(let i=0;i<count;i++){
    const t=(i/count+Math.random()*.008)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+22+Math.random()*22);
    const cx=p.x+nr.x*side+(Math.random()-.5)*5,cz=p.z+nr.z*side+(Math.random()-.5)*5;
    const h=5+Math.random()*5;
    // Stick
    const stick=new THREE.Mesh(new THREE.CylinderGeometry(.18,.22,h,6),stickMat);
    stick.position.set(cx,h*.5,cz);scene.add(stick);
    // Head (flattened sphere)
    const hCol=headColors[i%headColors.length];
    const headMat=new THREE.MeshLambertMaterial({color:hCol,emissive:new THREE.Color(hCol),emissiveIntensity:.55});
    const hr=1.8+Math.random()*.9;
    const head=new THREE.Mesh(new THREE.SphereGeometry(hr,10,8),headMat);
    head.scale.y=.72;head.position.set(cx,h+hr*.72,cz);scene.add(head);
    _candyNightEmissives.push(head);
    _candyLollipops.push(head);
    // Stripe spiral on the head — a thin torus ring
    const stripeMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.7});
    const stripe=new THREE.Mesh(new THREE.TorusGeometry(hr*.6,.07,4,16),stripeMat);
    stripe.position.copy(head.position);stripe.rotation.x=Math.PI/2;scene.add(stripe);
  }
}


function buildCandyCanes(){
  const redMat=new THREE.MeshLambertMaterial({color:0xee1122,emissive:0x550000,emissiveIntensity:.2});
  const whiteMat=new THREE.MeshLambertMaterial({color:0xffffff,emissive:0x222222,emissiveIntensity:.1});
  const count=22;
  for(let i=0;i<count;i++){
    const t=(i/count)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+22);
    const cx=p.x+nr.x*side,cz=p.z+nr.z*side;
    // Shaft: alternating red/white segments
    for(let seg=0;seg<6;seg++){
      const mat=seg%2===0?redMat:whiteMat;
      const s=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,.55,7),mat);
      s.position.set(cx,seg*.55+.275,cz);scene.add(s);
    }
    // Crook: torus quarter-arc on top
    const crookMat=seg=>seg%2===0?redMat:whiteMat;
    const crook=new THREE.Mesh(new THREE.TorusGeometry(.5,.28,7,12,Math.PI/1.8),redMat);
    crook.position.set(cx,6.55+.5,cz);
    crook.rotation.z=Math.PI;
    const fwdAngle=Math.atan2(tg.x,tg.z);crook.rotation.y=fwdAngle;
    scene.add(crook);
    _candyCaneList.push(crook);
    // Small point light at base
    const pl=new THREE.PointLight(0xff6688,1.0,14);pl.position.set(cx,.5,cz);
    scene.add(pl);_candyCandles.push(pl);
    _candyNightEmissives.push({material:redMat});
  }
}


function buildChocolateRiver(){
  // A winding chocolate-brown strip through the infield
  const pts=[
    new THREE.Vector3(-60,.03,-220),new THREE.Vector3(-100,.03,-140),
    new THREE.Vector3(-80,.03,-60),new THREE.Vector3(-30,.03,10),
    new THREE.Vector3(40,.03,50),new THREE.Vector3(80,.03,-10),
    new THREE.Vector3(60,.03,-80),new THREE.Vector3(10,.03,-160),
  ];
  const curve=new THREE.CatmullRomCurve3(pts,false,'catmullrom',.5);
  const N=80;
  const chocoMat=new THREE.MeshLambertMaterial({color:0x4a2200,side:THREE.DoubleSide});
  const pos=[],idx=[];
  for(let i=0;i<=N;i++){
    const t2=i/N,pt=curve.getPoint(t2),tg2=curve.getTangent(t2).normalize();
    const nr2=new THREE.Vector3(-tg2.z,0,tg2.x);
    const w=3.5+Math.sin(i*.4)*1.0;
    const L=pt.clone().addScaledVector(nr2,-w);
    const R=pt.clone().addScaledVector(nr2,w);
    pos.push(L.x,L.y,L.z,R.x,R.y,R.z);
    if(i<N){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setIndex(idx);geo.computeVertexNormals();
  const river=new THREE.Mesh(geo,chocoMat);scene.add(river);
  _chocoHighlight=river;
  // Foam edges — thin white ribbon
  const foamMat=new THREE.MeshLambertMaterial({color:0xffe4cc,transparent:true,opacity:.7,side:THREE.DoubleSide});
  [-1,1].forEach(side=>{
    const fpos=[];const fidx=[];
    for(let i=0;i<=N;i++){
      const t2=i/N,pt=curve.getPoint(t2),tg2=curve.getTangent(t2).normalize();
      const nr2=new THREE.Vector3(-tg2.z,0,tg2.x);
      const w=3.5+Math.sin(i*.4)*1.0;
      const e=pt.clone().addScaledVector(nr2,side*(w+.4));
      const e2=pt.clone().addScaledVector(nr2,side*(w+1.2));
      fpos.push(e.x,.04,e.z,e2.x,.04,e2.z);
      if(i<N){const a=i*2;fidx.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    const fg=new THREE.BufferGeometry();
    fg.setAttribute('position',new THREE.Float32BufferAttribute(fpos,3));
    fg.setIndex(fidx);fg.computeVertexNormals();
    scene.add(new THREE.Mesh(fg,foamMat));
  });
}


function buildGumDropMountains(){
  const gumdropColors=[0xff4488,0xffcc00,0x44ddaa,0x88aaff,0xff6622,0xcc44ff,0x44ee66,0xff8844];
  const positions=[
    [220,-180],[- 260,150],[190,280],[-90,-340],[310,80],[-340,-60],
    [80,-390],[-200,300],[260,-280],[-160,-220],[340,200],[-310,100],
    [110,360],[-230,-120]
  ];
  // Skip any position closer than this to the track curve — a gumdrop on the road shows up as a
  // big white circle (its bottom cap) clipping through the asphalt.
  const MIN_TRACK_DIST=42;
  function _distToTrack(px,pz){
    let m=Infinity;
    for(let t=0;t<1;t+=.02){
      const tp=trackCurve.getPoint(t);
      const d=Math.hypot(px-tp.x,pz-tp.z);
      if(d<m)m=d;
    }
    return m;
  }
  positions.forEach(([px,pz],i)=>{
    if(_distToTrack(px,pz)<MIN_TRACK_DIST)return;
    const col=gumdropColors[i%gumdropColors.length];
    const mat=new THREE.MeshLambertMaterial({color:col,transparent:true,opacity:.88});
    const h=20+Math.random()*25;
    const r=14+Math.random()*12;
    // Gumdrop = hemisphere
    const geo=new THREE.SphereGeometry(r,10,8,0,Math.PI*2,0,Math.PI/2);
    const gd=new THREE.Mesh(geo,mat);
    gd.position.set(px,0,pz);gd.scale.y=h/r;scene.add(gd);
    // Flat bottom cap — was at y=-.05 which clipped through the track if a gumdrop landed near
    // the road; bumping it to .02 keeps it just above the asphalt.
    const cap=new THREE.Mesh(new THREE.CircleGeometry(r,10),mat);
    cap.rotation.x=-Math.PI/2;cap.position.set(px,.02,pz);scene.add(cap);
    // Sugar sparkle on top — small white sphere
    const spark=new THREE.Mesh(new THREE.SphereGeometry(.9,5,5),
      new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.8}));
    spark.position.set(px,h+.5,pz);scene.add(spark);
  });
}


function buildCakeBuilding(){
  // 3-layer tiered cake tower in the infield
  const cx=-50,cz=-140;
  const layers=[
    {r:16,h:8,col:0xffaabb},{r:12,h:7,col:0xffccdd},{r:8,h:6,col:0xffe4ee}
  ];
  let y=0;
  layers.forEach((layer,li)=>{
    const mat=new THREE.MeshLambertMaterial({color:layer.col,emissive:new THREE.Color(layer.col),emissiveIntensity:.15});
    const cake=new THREE.Mesh(new THREE.CylinderGeometry(layer.r-.5,layer.r,layer.h,16),mat);
    cake.position.set(cx,y+layer.h*.5,cz);scene.add(cake);
    _candyNightEmissives.push(cake);
    // Frosting drip ring
    const frostMat=new THREE.MeshLambertMaterial({color:0xffffff});
    const frost=new THREE.Mesh(new THREE.TorusGeometry(layer.r-.2,.6,6,20),frostMat);
    frost.rotation.x=Math.PI/2;frost.position.set(cx,y+layer.h+.3,cz);scene.add(frost);
    // Sprinkles on top face — small cylinders
    for(let s=0;s<12;s++){
      const ang=Math.random()*Math.PI*2,dist=Math.random()*(layer.r-2);
      const sc=new THREE.Mesh(new THREE.CylinderGeometry(.15,.15,.55,4),
        new THREE.MeshBasicMaterial({color:[0xff2266,0xffcc00,0x22ccff,0x88ee44][s%4]}));
      sc.rotation.z=Math.PI/2;sc.rotation.y=Math.random()*Math.PI;
      sc.position.set(cx+Math.cos(ang)*dist,y+layer.h+.5,cz+Math.sin(ang)*dist);
      scene.add(sc);
    }
    y+=layer.h;
  });
  // Candles on top
  const candleColors=[0xff4488,0xffcc00,0x44ccff,0xaadd00,0xff8844];
  for(let c=0;c<5;c++){
    const ang=c*(Math.PI*2/5),dist=4;
    const candleMat=new THREE.MeshLambertMaterial({color:candleColors[c]});
    const candle=new THREE.Mesh(new THREE.CylinderGeometry(.25,.25,1.5,6),candleMat);
    candle.position.set(cx+Math.cos(ang)*dist,y+.75,cz+Math.sin(ang)*dist);scene.add(candle);
    // Flame
    const flame=new THREE.Mesh(new THREE.SphereGeometry(.28,5,4),
      new THREE.MeshBasicMaterial({color:0xffaa00}));
    flame.scale.y=1.6;flame.position.set(cx+Math.cos(ang)*dist,y+1.7,cz+Math.sin(ang)*dist);
    scene.add(flame);
    const pl=new THREE.PointLight(0xffaa44,1.2,10);
    pl.position.set(cx+Math.cos(ang)*dist,y+1.8,cz+Math.sin(ang)*dist);
    scene.add(pl);_candyCandles.push(pl);
  }
}


function buildCandyGate(){
  // Large candy cane arch over the start/finish line
  const p=trackCurve.getPoint(0),tg=trackCurve.getTangent(0).normalize();
  const nr=new THREE.Vector3(-tg.z,0,tg.x);
  const hw=TW+5;
  const redMat=new THREE.MeshLambertMaterial({color:0xee1122,emissive:0x550000,emissiveIntensity:.3});
  const whiteMat=new THREE.MeshLambertMaterial({color:0xffffff});
  // Two vertical columns (alternating segments)
  [-1,1].forEach(side=>{
    const base=p.clone().addScaledVector(nr,side*hw);
    for(let s=0;s<8;s++){
      const mat=s%2===0?redMat:whiteMat;
      const seg=new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,.9,8),mat);
      seg.position.copy(base);seg.position.y=s*.9+.45;scene.add(seg);
    }
    _candyNightEmissives.push({material:redMat});
  });
  // Arch — torus half-ring connecting the tops. The torus default axis is +Z, so rotate around Y
  // so the axis aligns with the track tangent — that puts the half-ring vertical, opening upward,
  // perpendicular to the track direction. The previous code (rotation.x=-PI/2) flattened it.
  const archMat=new THREE.MeshLambertMaterial({color:0xee1122,emissive:0x550000,emissiveIntensity:.3});
  const arch=new THREE.Mesh(new THREE.TorusGeometry(hw,.55,8,24,Math.PI),archMat);
  arch.position.copy(p);arch.position.y=8*0.9;
  arch.rotation.y=Math.atan2(tg.x,tg.z);
  scene.add(arch);
  _candyNightEmissives.push(arch);
  // Neon sign: "SUGAR RUSH" as glowing box
  const signMat=new THREE.MeshBasicMaterial({color:0xff44cc});
  const sign=new THREE.Mesh(new THREE.BoxGeometry(hw*1.5,.8,.12),signMat);
  sign.position.copy(p);sign.position.y=8*.9+1.8;
  sign.rotation.y=Math.atan2(nr.x,nr.z)+Math.PI/2;
  scene.add(sign);
  const pl=new THREE.PointLight(0xff44cc,2.5,22);pl.position.copy(p);pl.position.y=8*.9+2;
  scene.add(pl);_candyCandles.push(pl);
}


function buildSprinkleParticles(){
  const count=600;
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(count*3);
  const col=new Float32Array(count*3);
  const colors=[[1,.2,.4],[1,.8,.1],[.5,.9,.2],[.2,.7,1],[.8,.3,1],[1,.5,.1]];
  const car=carObjs[playerIdx];
  const cx=car?car.mesh.position.x:0,cz=car?car.mesh.position.z:0;
  for(let i=0;i<count;i++){
    pos[i*3]=(Math.random()-.5)*600+cx;
    pos[i*3+1]=Math.random()*22;
    pos[i*3+2]=(Math.random()-.5)*600+cz;
    const c=colors[i%colors.length];
    col[i*3]=c[0];col[i*3+1]=c[1];col[i*3+2]=c[2];
  }
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  const mat=new THREE.PointsMaterial({size:.55,vertexColors:true,transparent:true,opacity:.85,sizeAttenuation:true});
  _sprinkleParticles=new THREE.Points(geo,mat);
  _sprinkleGeo=geo;
  scene.add(_sprinkleParticles);
}


function buildCottonCandyClouds(){
  const cloudColors=[0xffaadd,0xffbbee,0xffd4f0,0xeeccff,0xffccaa];
  for(let i=0;i<18;i++){
    const col=cloudColors[i%cloudColors.length];
    const mat=new THREE.MeshLambertMaterial({color:col,transparent:true,opacity:.72});
    const cx=(Math.random()-.5)*700,cz=(Math.random()-.5)*700,cy=28+Math.random()*18;
    // Cluster of overlapping spheres
    for(let b=0;b<5+Math.floor(Math.random()*4);b++){
      const br=4+Math.random()*5;
      const blob=new THREE.Mesh(new THREE.SphereGeometry(br,7,5),mat);
      blob.position.set(cx+(Math.random()-.5)*12,cy+(Math.random()-.5)*3,cz+(Math.random()-.5)*10);
      scene.add(blob);
    }
  }
}


function buildRainbowTrackStripes(){
  // Thin painted stripes across the track surface — coloured chevrons every ~25 track units
  const stripeColors=[0xff4488,0xff8800,0xffee00,0x44dd66,0x2299ff,0xcc44ff];
  const N2=6;// one stripe segment set per colour interval
  for(let ci=0;ci<30;ci++){
    const t=(ci/30+.003)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const col=stripeColors[ci%stripeColors.length];
    const mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.45,side:THREE.DoubleSide});
    // Rainbow chevrons need to win the depth test against the track (factor +1) AND the curbs/elines
    // (factor -1) — without this they z-fight on iPad and look like a "ghost fork" parallel track.
    mat.polygonOffset=true;mat.polygonOffsetFactor=-2;mat.polygonOffsetUnits=-2;
    const sW=TW*.9,sD=.8;
    const stripe=new THREE.Mesh(new THREE.PlaneGeometry(sW*2,sD),mat);
    stripe.rotation.x=-Math.PI/2;
    stripe.position.copy(p);stripe.position.y=.013;
    stripe.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI/2;
    scene.add(stripe);
  }
}


function buildCandyBarriers(){
  // Replace flat barriers with candy cane striped walls
  const N=200;
  [-1,1].forEach(side=>{
    for(let si=0;si<N;si++){
      const t=si/N;
      const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
      const nr=new THREE.Vector3(-tg.z,0,tg.x);
      const pos=p.clone().addScaledVector(nr,side*BARRIER_OFF);
      const col=(si%2===0)?0xee1122:0xffffff;
      const mat=new THREE.MeshLambertMaterial({color:col,emissive:col===0xee1122?new THREE.Color(0x440000):new THREE.Color(0x111111),emissiveIntensity:.2});
      const seg=new THREE.Mesh(new THREE.BoxGeometry(.55,1.1,1.05/(N/200)),mat);
      seg.position.copy(pos);seg.position.y=.55;
      seg.rotation.y=Math.atan2(tg.x,tg.z);
      scene.add(seg);
      if(col===0xee1122)_candyNightEmissives.push(seg);
    }
  });
  // Track lights — lollipop poles
  const headColors=[0xff2266,0xff8800,0x22ccff,0xaadd00,0xcc44ff,0xff44aa,0xffcc00];
  for(let li=0;li<24;li++){
    const t=li/24;const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    [-1,1].forEach((s,si)=>{
      const pp=p.clone().addScaledVector(nr,s*(BARRIER_OFF+1.5));
      const col=headColors[(li*2+si)%headColors.length];
      const headMat=new THREE.MeshLambertMaterial({color:col,emissive:new THREE.Color(col),emissiveIntensity:.7});
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(.1,.12,3,5),
        new THREE.MeshLambertMaterial({color:0xffffff}));
      pole.position.copy(pp);pole.position.y=1.5;pole.visible=false;scene.add(pole);trackPoles.push(pole);
      const head=new THREE.Mesh(new THREE.SphereGeometry(.5,8,6),headMat);
      head.scale.y=.7;head.position.copy(pp);head.position.y=3.2;
      head.visible=false;scene.add(head);trackPoles.push(head);
      _candyNightEmissives.push(head);
      const pl=new THREE.PointLight(col,0,18);pl.position.copy(pp);pl.position.y=3.2;
      scene.add(pl);trackLightList.push(pl);
    });
  }
}


function buildIceCreamCones(){
  const scoopColors=[0xffcccc,0xff8888,0xffddaa,0xaaddff,0xddaaff,0xaaffcc];
  const coneCount=16;
  for(let i=0;i<coneCount;i++){
    const t=(i/coneCount+.04)%1;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+30+Math.random()*20);
    const cx=p.x+nr.x*side+(Math.random()-.5)*6,cz=p.z+nr.z*side+(Math.random()-.5)*6;
    // Waffle cone
    const coneMat=new THREE.MeshLambertMaterial({color:0xdd9944});
    const cone=new THREE.Mesh(new THREE.ConeGeometry(1.4,3.5,8),coneMat);
    cone.position.set(cx,3.5*.5,cz);cone.rotation.x=Math.PI;// point down
    scene.add(cone);
    // 1–3 scoops stacked
    const scoopCount=1+Math.floor(Math.random()*3);
    for(let sc=0;sc<scoopCount;sc++){
      const col=scoopColors[(i+sc)%scoopColors.length];
      const scoopMat=new THREE.MeshLambertMaterial({color:col,emissive:new THREE.Color(col),emissiveIntensity:.15});
      const scoop=new THREE.Mesh(new THREE.SphereGeometry(1.3-sc*.1,8,7),scoopMat);
      scoop.position.set(cx,3.5+sc*1.5,cz);scene.add(scoop);
      _candyNightEmissives.push(scoop);
    }
  }
}


function buildCookieSpectators(){
  // Round cookie "faces" lined up outside barriers — simple spectator stand-ins
  const positions=[];
  for(let i=0;i<32;i++){
    const t=i/32;
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(i%2===0?1:-1)*(BARRIER_OFF+8+Math.random()*4);
    positions.push({x:p.x+nr.x*side,z:p.z+nr.z*side,tg});
  }
  positions.forEach(({x,z,tg})=>{
    // Cookie body (cylinder, slightly tilted back)
    const cookieMat=new THREE.MeshLambertMaterial({color:0xcc8844});
    const cookie=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,.22,12),cookieMat);
    cookie.position.set(x,1.5,z);
    cookie.rotation.x=Math.PI/2-.15;
    const fwdY=Math.atan2(tg.x,tg.z);cookie.rotation.z=fwdY;
    scene.add(cookie);
    // Chocolate chip spots
    const chipMat=new THREE.MeshLambertMaterial({color:0x331100});
    for(let c=0;c<3;c++){
      const ang=Math.random()*Math.PI*2,dist=Math.random()*.7;
      const chip=new THREE.Mesh(new THREE.SphereGeometry(.14,4,4),chipMat);
      chip.position.set(x+Math.cos(ang)*dist,.13,z+Math.sin(ang)*dist);
      // Orient chip on cookie face
      chip.position.copy(cookie.position);
      chip.position.x+=Math.cos(ang)*dist*.8;
      chip.position.z+=Math.sin(ang)*dist*.8;
      chip.position.y=1.5+.1;
      scene.add(chip);
    }
  });
}


function updateCandyWorld(dt){
  updateSprinkles(dt);
  // Cotton candy cloud drift
  _candyLollipops.forEach((h,i)=>{
    h.position.y+=Math.sin(_nowSec*.8+i*.6)*dt*.04;
  });
  // Chocolate river shimmer: slight y oscillation
  if(_chocoHighlight&&_chocoHighlight.material){
    _chocoHighlight.material.color.setHex(
      0x4a2200+(Math.floor(Math.sin(_nowSec*.5)*.15*255)&0xff)*0x010000
    );
  }
}

