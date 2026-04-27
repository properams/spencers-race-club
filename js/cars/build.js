// js/cars/build.js — non-module script.

'use strict';

// makeWheel was dead code — niet aangeroepen door makeCar (die bouwt
// wheels inline). Verwijderd in dead-code cleanup.

function makeCar(def){
  const g=new THREE.Group();
  const isF1=def.type==='f1',isMuscle=def.type==='muscle';
  const paint=new THREE.MeshLambertMaterial({color:def.color});
  const accent=new THREE.MeshLambertMaterial({color:def.accent});
  const glass=new THREE.MeshLambertMaterial({color:0x0a1a2a,transparent:true,opacity:.72});
  const chrome=new THREE.MeshLambertMaterial({color:0xdddddd});
  const blk=new THREE.MeshLambertMaterial({color:0x050505});
  const red=new THREE.MeshLambertMaterial({color:0xcc0000});
  const add=(geo,mat,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{
    const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.castShadow=true;g.add(m);return m;
  };
  if(isF1){
    add(new THREE.BoxGeometry(1.80,.28,4.5),paint,0,.14,0);
    const nc=new THREE.Mesh(new THREE.CylinderGeometry(.04,.38,1.6,10),paint);
    nc.rotation.z=Math.PI/2;nc.position.set(0,.14,-2.85);nc.castShadow=true;g.add(nc);
    add(new THREE.BoxGeometry(.72,.38,.85),blk,0,.50,.08);
    const halo=new THREE.Mesh(new THREE.TorusGeometry(.28,.03,6,14),chrome);halo.position.set(0,.68,.06);g.add(halo);
    add(new THREE.BoxGeometry(3.1,.06,.52),accent,0,.10,-2.22);
    add(new THREE.BoxGeometry(2.0,.07,.42),accent,0,.94,2.06);
    [-1,1].forEach(s=>add(new THREE.BoxGeometry(.06,.52,.44),accent,s*1.0,.72,2.06));
    [-1,1].forEach(s=>{
      add(new THREE.BoxGeometry(.54,.28,1.88),paint,s*.95,.16,.32);
      const ci=new THREE.Mesh(new THREE.CylinderGeometry(.16,.2,.1,10),blk);ci.rotation.z=Math.PI/2;ci.position.set(s*.98,.22,-.3);g.add(ci);
    });
    add(new THREE.BoxGeometry(.52,.20,1.4),paint,0,.46,.88);
  }else{
    const bL=isMuscle?4.35:4.05,bH=isMuscle?.68:.50;
    add(new THREE.BoxGeometry(1.94,bH,bL),paint,0,bH*.5,0);
    add(new THREE.BoxGeometry(1.90,bH*.52,1.55),paint,0,bH*.26,-bL*.28,-.06);
    const fb=new THREE.Mesh(new THREE.SphereGeometry(.48,10,7,0,Math.PI*2,0,Math.PI/2),paint);
    fb.scale.set(2.0,.55,1.0);fb.rotation.x=Math.PI;fb.position.set(0,.18,-bL*.5+.12);g.add(fb);
    add(new THREE.BoxGeometry(1.7,.14,1.0),blk,0,.06,bL*.5-.48);
    const cabZ=isMuscle?.22:0,cabH=isMuscle?.52:.48,cabL=isMuscle?1.85:1.65;
    add(new THREE.BoxGeometry(1.74,cabH,cabL),paint,0,bH+cabH*.5,cabZ);
    add(new THREE.BoxGeometry(1.58,.52,.07),glass,0,bH+cabH*.58,cabZ-(isMuscle?.95:.87),-.32);
    add(new THREE.BoxGeometry(1.48,.42,.07),glass,0,bH+cabH*.46,cabZ+(isMuscle?.95:.87),.30);
    [-0.98,.98].forEach(s=>add(new THREE.BoxGeometry(.07,.34,1.26),glass,s,bH+cabH*.6,cabZ));
    const wPosA=[[-.97,bL*.34],[.97,bL*.34],[-.97,-bL*.34],[.97,-bL*.34]];
    wPosA.forEach(([wx,wz])=>{
      const arch=new THREE.Mesh(new THREE.SphereGeometry(.54,10,6,0,Math.PI*2,0,Math.PI*.5),paint);
      arch.scale.set(1.08,.45,1.55);arch.position.set(wx,.36,wz);g.add(arch);
    });
    if(!isMuscle){
      add(new THREE.BoxGeometry(1.72,.066,.42),accent,0,bH+.72,bL*.5-.1);
      [-0.78,.78].forEach(s=>add(new THREE.BoxGeometry(.07,.3,.08),accent,s,bH+.56,bL*.5-.1));
    }else{
      add(new THREE.BoxGeometry(.56,.14,1.1),accent,0,bH+.05,-.92);
    }
    const hlm=new THREE.MeshLambertMaterial({color:0xfff8e8,emissive:0x886622});
    [-0.80,.80].forEach(s=>{const hl=new THREE.Mesh(new THREE.SphereGeometry(.14,8,6),hlm);hl.scale.set(1,.8,1.2);hl.position.set(s,bH*.62,-bL*.5+.05);g.add(hl);});
    const tlm=new THREE.MeshLambertMaterial({color:0xff0000,emissive:0xaa0000});
    [-0.80,.80].forEach(s=>{const tl=new THREE.Mesh(new THREE.BoxGeometry(.28,.12,.065),tlm);tl.position.set(s,bH*.58,bL*.5-.03);g.add(tl);});
    [-0.97,.97].forEach(s=>add(new THREE.BoxGeometry(.06,.04,bL*.75),blk,s,bH*.05,-.1));
    [-0.44,.44].forEach(s=>{const ex=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.5,8),chrome);ex.rotation.x=Math.PI/2;ex.position.set(s,.22,bL*.5);g.add(ex);});
  }
  const wP=isF1?[[-1.06,.30,-1.80],[1.06,.30,-1.80],[-1.06,.30,1.62],[1.06,.30,1.62]]
              :[[-0.98,.33,-1.38],[0.98,.33,-1.38],[-0.98,.33,1.38],[0.98,.33,1.38]];
  const wR=.33,wW=isF1?.40:.25;
  g.userData.wheels=[];
  wP.forEach(([wx,wy,wz])=>{
    const tire=new THREE.Mesh(new THREE.CylinderGeometry(wR,wR,wW,16),new THREE.MeshLambertMaterial({color:0x090909}));
    tire.rotation.z=Math.PI/2;tire.position.set(wx,wy,wz);tire.castShadow=true;g.add(tire);
    const rim=new THREE.Mesh(new THREE.CylinderGeometry(wR*.64,wR*.64,wW+.01,12),chrome);
    rim.rotation.z=Math.PI/2;rim.position.set(wx,wy,wz);g.add(rim);
    for(let s=0;s<5;s++){
      const sp=new THREE.Mesh(new THREE.BoxGeometry(wR*1.05,.025,.036),new THREE.MeshLambertMaterial({color:0xcccccc}));
      sp.rotation.z=Math.PI/2;sp.rotation.y=(s/5)*Math.PI*2;sp.position.set(wx,wy,wz);g.add(sp);
    }
    const cal=new THREE.Mesh(new THREE.BoxGeometry(.08,.18,.22),red);cal.position.set(wx,wy-.08,wz);g.add(cal);
    g.userData.wheels.push(tire,rim);
  });
  if(g.userData.wheels&&g.userData.wheels.length>=4){
    g.userData.wheelFL=g.userData.wheels[0];
    g.userData.wheelFR=g.userData.wheels[1];
    g.userData.wheelRL=g.userData.wheels[2];
    g.userData.wheelRR=g.userData.wheels[3];
  }
  return g;
}


function makeAllCars(){
  carObjs.forEach(c=>scene.remove(c.mesh));carObjs=[];
  _reverseLights.length=0;
  // Build ordered def list — player goes to pole, AI fill the rest
  const playerDef=CAR_DEFS.find(d=>d.id===selCarId)||CAR_DEFS[0];
  const orderedDefs=[playerDef,...CAR_DEFS.filter(d=>d.id!==selCarId)];

  // ── Per-world start T: always on the main straight approaching S/F ──────
  // Each world's straight is different. We use t=0.93..0.99 range for GP,
  // and similar near-0 ranges for other worlds — but always on straight sections.
  const _worldGridT={
    grandprix:0.955,  // GP final straight approaching t=0
    space:0.940,      // Space: last WP at ~0.94, straight into t=0
    deepsea:0.940,    // DeepSea: last WP at ~0.94, straight into t=0
    candy:0.940,      // Candy: last WP at ~0.96, straight into t=0
    neoncity:0.935,   // Neon City: last WP at ~0.94, straight into t=0
    volcano:0.940,
    arctic:0.940,
  };
  // How many track units between each grid row
  const _rowGap=0.014; // slightly wider gap for cleaner grid separation

  orderedDefs.forEach((def,i)=>{
    const mesh=makeCar(def);
    const row=Math.floor(i/2),col=i%2;
    // t decreases as we go further behind the S/F line
    const baseT=_worldGridT[activeWorld]||0.955;
    const t0=((baseT - row*_rowGap)+1)%1;
    const pt=trackCurve.getPoint(t0);
    const tg=trackCurve.getTangent(t0).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    // Clean F1-style 2-wide grid: left col slightly ahead (stagger)
    const colSign=col===0?-1:1;
    const lateralOffset=colSign*4.5;
    const fwdStagger=col===0?0.8:0; // left column (pole side) slightly ahead
    mesh.position.copy(pt)
      .addScaledVector(nr,lateralOffset)
      .addScaledVector(tg,fwdStagger);
    mesh.position.y=0.35;
    // Face exactly the track direction at this point
    mesh.rotation.set(0,Math.atan2(-tg.x,-tg.z),0);
    scene.add(mesh);
    const isPlayer=def.id===selCarId;if(isPlayer)playerIdx=carObjs.length;
    // Reverse light (red box at rear)
    const rlGeo=new THREE.BoxGeometry(.34,.1,.04);
    const rlMat=new THREE.MeshLambertMaterial({color:0xff2200,emissive:0xff2200,emissiveIntensity:0});
    const rl=new THREE.Mesh(rlGeo,rlMat);
    const bL=def.type==='muscle'?4.35:def.type==='f1'?4.5:4.05;
    rl.position.set(0,.28,bL*.5+.02);
    mesh.add(rl);
    _reverseLights.push(rl);
    // Small initial lateral offset so AI don't all drive on the exact center line
    // (kept near zero at start to prevent collision; grows naturally during race)
    const latOff=isPlayer?0:(col===0?-1.2:1.2)+(Math.random()-.5)*.8;
    const personality=_aiPersonality[def.id]||{aggr:.6,consist:.7};
    carObjs.push({mesh,speed:0,vy:0,progress:t0,prevProg:t0,lap:0,isPlayer,def,finished:false,
      boostTimer:0,spinTimer:0,inAir:false,lateralOff:latOff,bestLap:null,_lapStart:null,_finishTime:null,
      tireWear:0,hitCount:0,smokeSrc:null,_personality:personality});
  });
  // Reset nearest-miss cooldowns
  for(let i=0;i<carObjs.length;i++)_nearMissCooldown[i]=0;
  // Reset pit stop
  _pitStopActive=false;_pitStopTimer=0;_pitStopUsed=false;
  _overallFastestLap=Infinity;
  // Init near-miss cooldowns for all cars
  for(let i=0;i<CAR_DEFS.length;i++)_nearMissCooldown[i]=0;
}

