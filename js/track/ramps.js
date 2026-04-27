// js/track/ramps.js — non-module script.

// Pre-allocated scratch vector (uit main.js verhuisd).
const _jFwdV=new THREE.Vector3();

function buildJumpRamps(){
  const rampDefs=[
    {t:.12, h:2.8, label:'JUMP!'},
    {t:.35, h:3.2, label:'BIG AIR!'},
    {t:.75, h:2.4, label:'JUMP!'},
  ];
  rampDefs.forEach(def=>{
    const p=trackCurve.getPoint(def.t);
    const tg=trackCurve.getTangent(def.t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const angle=Math.atan2(tg.x,tg.z);
    const padLen=9,padW=TW*1.5;
    const h=def.h;

    // Per-world colours
    const isSpR=activeWorld==='space',isDsR=activeWorld==='deepsea';
    const padCol=isSpR?0x6600cc:isDsR?0x006644:0xff4400;
    const padEmit=isSpR?0x8833ff:isDsR?0x00aacc:0xff7722;
    const stripeColR=isSpR?0x00ccff:isDsR?0x00ffaa:0xffdd00;

    // Flat glowing launchpad on the track — no obstacle
    const padMat=new THREE.MeshLambertMaterial({color:padCol,emissive:padEmit,emissiveIntensity:1.2,transparent:true,opacity:.88});
    padMat.polygonOffset=true;padMat.polygonOffsetFactor=-3;padMat.polygonOffsetUnits=-3;
    const pad=new THREE.Mesh(new THREE.PlaneGeometry(padW,padLen),padMat);
    pad.rotation.x=-Math.PI/2;pad.rotation.z=angle;
    pad.position.copy(p);pad.position.y=.06;
    scene.add(pad);

    // Chevron arrows painted on pad pointing forward (3 bright chevrons)
    const stripeMat=new THREE.MeshBasicMaterial({color:stripeColR});
    [-1,0,1].forEach(i=>{
      const a1=new THREE.Mesh(new THREE.PlaneGeometry(padW*.7,.35),stripeMat);
      a1.rotation.x=-Math.PI/2;a1.rotation.z=angle;
      a1.position.copy(p);a1.position.y=.08;
      a1.position.addScaledVector(tg,i*padLen*.25);
      scene.add(a1);
    });

    // Floating JUMP! sign above pad
    const glowPole=new THREE.Mesh(new THREE.CylinderGeometry(.2,.25,h+3.5,6),
      new THREE.MeshLambertMaterial({color:padCol,emissive:padEmit,emissiveIntensity:.6}));
    glowPole.position.copy(p);glowPole.position.y=(h+3.5)*.5;
    glowPole.position.addScaledVector(nr,padW*.52);
    scene.add(glowPole);
    const sign=new THREE.Mesh(new THREE.BoxGeometry(padW*.6,1.2,.15),
      new THREE.MeshBasicMaterial({color:0xffffff}));
    sign.position.copy(p);sign.position.y=h+3.2;sign.rotation.y=angle;
    scene.add(sign);
    const signAccent=new THREE.Mesh(new THREE.BoxGeometry(padW*.6,.18,.16),
      new THREE.MeshBasicMaterial({color:padEmit}));
    signAccent.position.copy(p);signAccent.position.y=h+4;signAccent.rotation.y=angle;
    scene.add(signAccent);
    // Point light for dramatic glow
    const pl=new THREE.PointLight(padEmit,1.5,28);
    pl.position.copy(p);pl.position.y=h+3.2;scene.add(pl);

    jumpRamps.push({
      pos:p.clone(),tg:tg.clone(),
      width:padW,len:padLen,h,
      launchV:h*.3,label:def.label,
    });
  });
}


function buildSpinPads(){
  const spinDefs=[{t:.18},{t:.50},{t:.84}];
  // Per-world palette — hazard theme
  const SP={
    grandprix:{disc:0x8800ff,emit:0x5500cc,ring:0xdd44ff,cone:0xffdd00,marker:0xcc9900},
    space:    {disc:0x0033cc,emit:0x001188,ring:0x00aaff,cone:0x8866ff,marker:0x4422cc},
    deepsea:  {disc:0x005566,emit:0x003344,ring:0x00ddcc,cone:0x44ffcc,marker:0x00aa88},
    candy:    {disc:0xff3388,emit:0xcc0066,ring:0xff66bb,cone:0xffdd44,marker:0xffaa00},
    neoncity: {disc:0x4400aa,emit:0x220066,ring:0xff00ff,cone:0x00ffff,marker:0xaa00aa},
    volcano:  {disc:0xaa3300,emit:0x661100,ring:0xff6622,cone:0xff9922,marker:0xcc2200},
    arctic:   {disc:0x336699,emit:0x113366,ring:0x66ccff,cone:0xbbeeff,marker:0x4488cc},
    themepark:{disc:0xcc2266,emit:0x991144,ring:0xff88bb,cone:0xffdd33,marker:0xff5599},
  };
  const pal=SP[activeWorld]||SP.grandprix;

  spinDefs.forEach(def=>{
    const p=trackCurve.getPoint(def.t).clone();p.y=.015;

    // Flat hazard disc — clean circle
    const discMat=new THREE.MeshLambertMaterial({color:pal.disc,emissive:pal.emit,emissiveIntensity:.9,transparent:true,opacity:.9});
    discMat.polygonOffset=true;discMat.polygonOffsetFactor=-3;discMat.polygonOffsetUnits=-3;
    const disc=new THREE.Mesh(new THREE.CylinderGeometry(4.2,4.2,.1,40),discMat);
    disc.position.copy(p);disc.position.y=.05;
    scene.add(disc);

    // Bold hazard X-pattern in center (2 bars crossed)
    const xMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.85});
    [-1,1].forEach(s=>{
      const bar=new THREE.Mesh(new THREE.PlaneGeometry(5.2,.45),xMat);
      bar.rotation.x=-Math.PI/2;bar.rotation.z=s*Math.PI*.25;
      bar.position.copy(p);bar.position.y=.11;
      scene.add(bar);
    });

    // Inner ring pattern (smaller)
    const innerRing=new THREE.Mesh(new THREE.TorusGeometry(2.8,.08,6,36),
      new THREE.MeshLambertMaterial({color:pal.ring,emissive:pal.ring,emissiveIntensity:1.2,transparent:true,opacity:.7}));
    innerRing.rotation.x=Math.PI/2;innerRing.position.copy(p);innerRing.position.y=.12;
    scene.add(innerRing);

    // Pulsing outer ring — main hazard indicator
    const ring=new THREE.Mesh(new THREE.TorusGeometry(4.6,.14,8,48),
      new THREE.MeshLambertMaterial({color:pal.ring,emissive:pal.ring,emissiveIntensity:1.3}));
    ring.rotation.x=Math.PI/2;ring.position.copy(p);ring.position.y=.12;
    scene.add(ring);

    // 4 corner warning pillars (subtle)
    for(let i=0;i<4;i++){
      const ang=(i/4)*Math.PI*2+Math.PI/4;
      const pillar=new THREE.Mesh(new THREE.ConeGeometry(.32,1.4,6),
        new THREE.MeshLambertMaterial({color:pal.cone,emissive:pal.marker,emissiveIntensity:1.0}));
      pillar.position.set(p.x+Math.cos(ang)*5.6,p.y+.7,p.z+Math.sin(ang)*5.6);
      scene.add(pillar);
    }

    // Point light for glow
    const pl=new THREE.PointLight(pal.ring,1.4,22);
    pl.position.copy(p);pl.position.y=1.2;scene.add(pl);

    spinPads.push({pos:p.clone(),disc,ring,radius:4.5});
  });
}


function buildBoostPads(){
  // Per-world palette
  const BP={
    grandprix:{pad:0x00aaff,emit:0x0077cc,chev:0xffffff,glow:0x88ddff,light:0x00ccff},
    space:    {pad:0xcc00ff,emit:0x8800cc,chev:0xffccff,glow:0xff88ff,light:0xff44ff},
    deepsea:  {pad:0x00cc88,emit:0x007744,chev:0xaaffdd,glow:0x00ffaa,light:0x00ffaa},
    candy:    {pad:0xff55aa,emit:0xcc2277,chev:0xffddee,glow:0xff88cc,light:0xff66bb},
    neoncity: {pad:0xff00ee,emit:0xaa00aa,chev:0xffccff,glow:0xff66ff,light:0xff00dd},
    volcano:  {pad:0xff5522,emit:0xdd2200,chev:0xffdd99,glow:0xff8844,light:0xff4422},
    arctic:   {pad:0x66ddff,emit:0x2288cc,chev:0xe8f5ff,glow:0x99ddff,light:0x88ccff},
    themepark:{pad:0xffcc22,emit:0xff6600,chev:0xffeecc,glow:0xff9933,light:0xffaa00},
  };
  const pal=BP[activeWorld]||BP.grandprix;

  const boostDefs=[
    {t:.04},{t:.22},{t:.43},{t:.48},{t:.53},{t:.71},{t:.80},{t:.93},
  ];
  boostDefs.forEach(def=>{
    const p=trackCurve.getPoint(def.t);
    const tg=trackCurve.getTangent(def.t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const angle=Math.atan2(tg.x,tg.z);

    // Single clean flat pad
    const boostStripMat=new THREE.MeshLambertMaterial({color:pal.pad,emissive:pal.emit,emissiveIntensity:1.4,transparent:true,opacity:.92});
    boostStripMat.polygonOffset=true;boostStripMat.polygonOffsetFactor=-3;boostStripMat.polygonOffsetUnits=-3;
    const strip=new THREE.Mesh(new THREE.PlaneGeometry(TW*1.5,4.6),boostStripMat);
    strip.rotation.x=-Math.PI/2;strip.rotation.z=angle;
    strip.position.copy(p);strip.position.y=.04;
    scene.add(strip);

    // Subtle bright center line
    const centre=new THREE.Mesh(new THREE.PlaneGeometry(TW*.25,4.8),
      new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.55}));
    centre.rotation.x=-Math.PI/2;centre.rotation.z=angle;
    centre.position.copy(p);centre.position.y=.06;
    scene.add(centre);

    // 3 bright forward chevrons (V-shape from 2 rotated bars each)
    const chevMat=new THREE.MeshBasicMaterial({color:pal.chev,transparent:true,opacity:.95});
    for(let i=0;i<3;i++){
      [-1,1].forEach(s=>{
        const bar=new THREE.Mesh(new THREE.PlaneGeometry(1.55,.22),chevMat);
        bar.rotation.x=-Math.PI/2;bar.rotation.z=angle+s*.52;
        bar.position.copy(p);bar.position.y=.065;
        bar.position.addScaledVector(tg,-1.5+i*1.3);
        scene.add(bar);
      });
    }

    // Side neon light strips (very thin, running along pad)
    const stripMat=new THREE.MeshBasicMaterial({color:pal.glow,transparent:true,opacity:.9});
    [-1,1].forEach(s=>{
      const sl=new THREE.Mesh(new THREE.PlaneGeometry(.18,4.6),stripMat);
      sl.rotation.x=-Math.PI/2;sl.rotation.z=angle;
      sl.position.copy(p);sl.position.y=.07;
      sl.position.addScaledVector(nr,s*TW*.78);
      scene.add(sl);
    });

    // ONE rising energy ring (cleaner than 3) — floats up + fades in a loop
    const ring=new THREE.Mesh(new THREE.TorusGeometry(TW*.45,.10,6,24),
      new THREE.MeshLambertMaterial({color:pal.glow,emissive:pal.glow,emissiveIntensity:1.5,transparent:true,opacity:.8}));
    ring.position.copy(p);ring.position.y=.6;
    ring.rotation.x=Math.PI/2;ring.rotation.y=angle;
    scene.add(ring);ring._baseY=.6;ring._phase=Math.random();
    const padArrows=[ring];

    // Point light
    const pl=new THREE.PointLight(pal.light,2.0,26);
    pl.position.copy(p);pl.position.y=2.2;scene.add(pl);

    boostPads.push({pos:p.clone(),tg:tg.clone(),strip,arrows:padArrows,radius:TW,len:4.6,active:true,light:pl});
  });
}


function checkJumps(){
  const car=carObjs[playerIdx];if(!car||recoverActive||car.inAir)return;
  const _jFwd=_jFwdV.set(0,0,-1).applyQuaternion(car.mesh.quaternion);
  const motionSign=car.speed>=0?1:-1;
  jumpRamps.forEach(ramp=>{
    if(car._rampCooldown>0)return;
    const dx=car.mesh.position.x-ramp.pos.x,dz=car.mesh.position.z-ramp.pos.z;
    const along=dx*ramp.tg.x+dz*ramp.tg.z;
    const perp=Math.abs(-dx*ramp.tg.z+dz*ramp.tg.x);
    const halfLen=ramp.len*.5;
    // Simple trigger zone — no surface-following, no physical ramp to drive up
    if(perp<ramp.width*.5&&along>-halfLen&&along<halfLen){
      const motionDot=(_jFwd.x*ramp.tg.x+_jFwd.z*ramp.tg.z)*motionSign;
      if(motionDot>.1&&Math.abs(car.speed)>.25){
        // LAUNCH: strong vy + slight forward boost + nose tilt up
        car.vy=Math.abs(car.speed)*11+ramp.launchV*1.3+6;
        car.mesh.rotation.x=-0.22;
        car.inAir=true;
        car._rampCooldown=1.2;
        Audio.playJump();showPopup(ramp.label,'#00ccff',1000);
        sparkSystem.emit(car.mesh.position.x,car.mesh.position.y+.2,car.mesh.position.z,0,.3,0,28,.9,.6,1,.8);
      }
    }
  });
  if(car._rampCooldown>0)car._rampCooldown-=1/60; // rough frame decrement
}


function checkSpinPads(dt){
  const car=carObjs[playerIdx];if(!car||recoverActive)return;
  spinPads.forEach(pad=>{
    // Animate disc + ring pulse
    pad.disc.rotation.y+=2.5*dt;
    const _rs=1+.08*Math.sin(_nowSec*3+pad.pos.x*.1);
    pad.ring.scale.setScalar(_rs);
    pad.ring.material.emissiveIntensity=.5+.5*Math.sin(_nowSec*2.5+pad.pos.z*.1);
    const dx=car.mesh.position.x-pad.pos.x,dz=car.mesh.position.z-pad.pos.z;
    if(dx*dx+dz*dz<pad.radius*pad.radius&&car.spinTimer<=0){
      car.spinTimer=1.0;
      Audio.playSpin();showPopup('SPINNING! 🌀','#aa44ff',1200);
      sparkSystem.emit(pad.pos.x,.5,pad.pos.z,0,.05,0,20,.6,.2,1,.6);
    }
  });
}


function checkBoostPads(){
  // Pulsing glow on all boost pads
  const pulse=.5+.5*Math.sin(_nowSec*4);
  boostPads.forEach(pad=>{pad.strip.material.emissiveIntensity=.4+.9*pulse;pad.strip.material.opacity=.58+.24*pulse;});
  const car=carObjs[playerIdx];if(!car||recoverActive)return;
  boostPads.forEach(pad=>{
    const dx=car.mesh.position.x-pad.pos.x,dz=car.mesh.position.z-pad.pos.z;
    const bR=pad.radius*.8,bR2=bR*bR;
    if(dx*dx+dz*dz<bR2&&car.boostTimer<=0){
      car.boostTimer=2.0;car.speed=Math.min(car.def.topSpd*1.55,car.speed+.4);
      totalScore+=10;
      Audio.playBoost();showPopup('BOOST! ⚡','#00ffff',800);
      sparkSystem.emit(car.mesh.position.x,.4,car.mesh.position.z,0,.06,0,18,.3,.9,1,.5);
      if(Math.random()<.55)Audio.playCrowdCheer();
    }
    // Boost AI cars too
    for(let i=0;i<carObjs.length;i++){
      if(i===playerIdx)continue;
      const dx2=carObjs[i].mesh.position.x-pad.pos.x,dz2=carObjs[i].mesh.position.z-pad.pos.z;
      if(dx2*dx2+dz2*dz2<bR2&&carObjs[i].boostTimer<=0) carObjs[i].boostTimer=2;
    }
  });
}

