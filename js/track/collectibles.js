// js/track/collectibles.js — non-module script.

'use strict';

function buildCollectibles(){
  // Per-world palette — coin, emissive, rim highlight, halo glow, light colour
  const PAL={
    grandprix:{coin:0xffdd00,emit:0xff9900,rim:0xfff5a8,halo:0xffcc33,light:0xffcc00},
    space:    {coin:0x66ccff,emit:0x2288ff,rim:0xcce8ff,halo:0x66aaff,light:0x88bbff},
    deepsea:  {coin:0xffaa33,emit:0xcc7700,rim:0xffd999,halo:0xffaa00,light:0xffaa44},
    candy:    {coin:0xff77cc,emit:0xdd2288,rim:0xffddf0,halo:0xff55aa,light:0xff66cc},
    neoncity: {coin:0x00ffee,emit:0x00aaaa,rim:0xbbffff,halo:0x00ddee,light:0x00ffdd},
    volcano:  {coin:0xff7722,emit:0xff2200,rim:0xffcc88,halo:0xff4411,light:0xff4422},
    arctic:   {coin:0xaadfff,emit:0x4488dd,rim:0xe8f5ff,halo:0x88bbee,light:0xaaddff},
    themepark:{coin:0xffcc22,emit:0xff6600,rim:0xffe999,halo:0xff9933,light:0xffbb00},
  };
  const pal=PAL[activeWorld]||PAL.grandprix;

  const positions=[.07,.18,.30,.42,.55,.67,.78,.90];
  positions.forEach(t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const offset=(Math.random()-.5)*7;
    const pos=p.clone().addScaledVector(nr,offset);pos.y=2.3;

    const g=new THREE.Group();g.position.copy(pos);

    // [0] Core — tiny bright white nucleus (visible through disc)
    const core=new THREE.Mesh(new THREE.SphereGeometry(.2,8,8),
      new THREE.MeshBasicMaterial({color:0xffffff}));
    g.add(core);

    // [1] Main coin disc — thin cylinder standing vertically (faces camera as group rotates)
    const coinMat=new THREE.MeshLambertMaterial({color:pal.coin,emissive:pal.emit,emissiveIntensity:1.2});
    const coin=new THREE.Mesh(new THREE.CylinderGeometry(.92,.92,.16,28),coinMat);
    coin.rotation.x=Math.PI/2; // stand up like a coin
    g.add(coin);

    // [2] Rim halo — thicker torus at coin edge for neon glow
    const halo=new THREE.Mesh(new THREE.TorusGeometry(1.02,.10,8,36),
      new THREE.MeshLambertMaterial({color:pal.halo,emissive:pal.halo,emissiveIntensity:1.5,transparent:true,opacity:.85}));
    halo.rotation.x=Math.PI/2;
    g.add(halo);

    // [3] Orbital thin ring — tilted for depth
    const orbit=new THREE.Mesh(new THREE.TorusGeometry(1.35,.045,6,40),
      new THREE.MeshLambertMaterial({color:pal.rim,emissive:pal.rim,emissiveIntensity:1.3,transparent:true,opacity:.75}));
    orbit.rotation.x=Math.PI*.45;orbit.rotation.z=Math.PI*.12;
    g.add(orbit);

    // [4] Star face — glowing octahedron floating at front of coin
    const star=new THREE.Mesh(new THREE.OctahedronGeometry(.36,0),
      new THREE.MeshBasicMaterial({color:pal.rim,transparent:true,opacity:.95}));
    star.position.z=.13;
    g.add(star);

    // [5] Vertical soft beam
    const beam=new THREE.Mesh(new THREE.CylinderGeometry(.05,.42,14,8,1,true),
      new THREE.MeshBasicMaterial({color:pal.light,transparent:true,opacity:.10,side:THREE.DoubleSide,depthWrite:false}));
    beam.position.y=6;g.add(beam);

    // [6] Ground marker ring — anchors the token visually
    const groundRing=new THREE.Mesh(new THREE.RingGeometry(.55,1.25,28),
      new THREE.MeshBasicMaterial({color:pal.halo,transparent:true,opacity:.35,side:THREE.DoubleSide,depthWrite:false}));
    groundRing.rotation.x=-Math.PI/2;
    groundRing.position.y=-pos.y+.025;
    g.add(groundRing);

    scene.add(g);
    const starLight=new THREE.PointLight(pal.light,2.2,18);
    starLight.position.copy(pos);scene.add(starLight);
    collectibles.push({mesh:g,pos:pos.clone(),collected:false,radius:2.4,respawn:0,type:'score',light:starLight});
  });

  // Repair kits — modern medical hex-token
  [.04,.45,.82].forEach(t=>{
    const p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const pos=p.clone().addScaledVector(nr,5.5);pos.y=2.1;

    const g=new THREE.Group();g.position.copy(pos);

    // [0] Core
    const core=new THREE.Mesh(new THREE.SphereGeometry(.18,8,8),
      new THREE.MeshBasicMaterial({color:0xffffff}));
    g.add(core);

    // [1] Hex-token base (6-sided cylinder standing like coin)
    const hex=new THREE.Mesh(new THREE.CylinderGeometry(1.05,1.05,.18,6),
      new THREE.MeshLambertMaterial({color:0x00ee66,emissive:0x00aa33,emissiveIntensity:1.1}));
    hex.rotation.x=Math.PI/2;
    g.add(hex);

    // [2] Rim halo
    const halo=new THREE.Mesh(new THREE.TorusGeometry(1.1,.09,8,24),
      new THREE.MeshLambertMaterial({color:0x44ffaa,emissive:0x00ff77,emissiveIntensity:1.4,transparent:true,opacity:.85}));
    halo.rotation.x=Math.PI/2;
    g.add(halo);

    // [3] Plus sign — bright emissive, on face
    const plusMat=new THREE.MeshBasicMaterial({color:0xffffff});
    const plusH=new THREE.Mesh(new THREE.BoxGeometry(.95,.28,.08),plusMat);
    plusH.position.z=.12;g.add(plusH);
    const plusV=new THREE.Mesh(new THREE.BoxGeometry(.28,.95,.08),plusMat);
    plusV.position.z=.12;
    // Stash vertical on same child index so animation still targets .children[3] for orbit
    g.add(plusV);

    // [5] Light beam
    const bm=new THREE.Mesh(new THREE.CylinderGeometry(.05,.38,14,8,1,true),
      new THREE.MeshBasicMaterial({color:0x00ff66,transparent:true,opacity:.09,side:THREE.DoubleSide,depthWrite:false}));
    bm.position.y=6;g.add(bm);

    // [6] Ground ring
    const groundRing=new THREE.Mesh(new THREE.RingGeometry(.6,1.4,24),
      new THREE.MeshBasicMaterial({color:0x00ff66,transparent:true,opacity:.32,side:THREE.DoubleSide,depthWrite:false}));
    groundRing.rotation.x=-Math.PI/2;
    groundRing.position.y=-pos.y+.025;
    g.add(groundRing);

    scene.add(g);
    const kitLight=new THREE.PointLight(0x00ff66,1.6,16);
    kitLight.position.copy(pos);scene.add(kitLight);
    collectibles.push({mesh:g,pos:pos.clone(),collected:false,radius:2.6,respawn:15,type:'repair',light:kitLight});
  });
}


function checkCollectibles(){
  const car=carObjs[playerIdx];if(!car)return;
  const now=_nowSec;
  collectibles.forEach(c=>{
    if(c.collected){
      if(now>c.respawn){c.collected=false;c.mesh.visible=true;if(c.light)c.light.visible=true;}
      return;
    }
    c.mesh.rotation.y+=.045;c.mesh.position.y=c.pos.y+Math.sin(now*2+c.pos.x)*.32;
    // New structure: [0]core [1]coin [2]halo [3]orbit [4]star/plus [5]beam [6]groundRing
    const ch=c.mesh.children;
    if(ch){
      if(ch[2])ch[2].rotation.z+=.024;            // halo tilts
      if(ch[3])ch[3].rotation.z+=.036;            // orbit ring spins
      if(ch[4])ch[4].rotation.y-=.06;             // star counter-spin
    }
    if(c.type==='score'){
      const pulse=Math.sin(now*3.2+c.pos.x*.5);
      c.mesh.scale.setScalar(1+pulse*.10);
      if(c.light)c.light.intensity=1.8+pulse*0.8;
    }else{
      // Repair kit: slower pulse, green flicker
      const pulse=Math.sin(now*2.4+c.pos.z*.4);
      if(c.light)c.light.intensity=1.2+pulse*0.6;
    }
    const dx=car.mesh.position.x-c.pos.x,dz=car.mesh.position.z-c.pos.z;
    if(dx*dx+dz*dz<c.radius*c.radius){
      c.collected=true;c.mesh.visible=false;if(c.light)c.light.visible=false;c.respawn=now+(c.type==='repair'?15:10);
      Audio.playCollect();
      sparkSystem.emit(c.pos.x,c.pos.y,c.pos.z,0,.06,0,16,
        c.type==='repair'?.1:.9, c.type==='repair'?.9:.9, c.type==='repair'?.2:.2,.8);
      if(c.type==='repair'){
        car.hitCount=Math.max(0,(car.hitCount||0)-2);
        car.tireWear=Math.max(0,(car.tireWear||0)-.35);
        showPopup('🔧 REPAIRS +50','#00ff88',1100);
        floatText3D('🔧 REPAIRS!','#00ff88',c.pos);
        totalScore+=50;
      }else{
        totalScore+=100;
        showPopup('⭐ +100 PTS!','#ffdd00',900);
        floatText3D('+100 ⭐','#ffdd00',c.pos);
      }
    }
  });
}


function buildSpectators(){
  // Spectators removed — replaced by trackside banners & flags elsewhere
}

