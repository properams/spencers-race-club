// js/worlds/arctic.js — arctic world builders + update + collision checks
// Non-module script.

// Per-world state (uit main.js verhuisd) — gereset in core/scene.js buildScene().
let _arcticIcePatches=[],_arcticAurora=[],_arcticBlizzardGeo=null;

function buildArcticEnvironment(){
  var g=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),
    new THREE.MeshLambertMaterial({color:0xccddee}));
  g.rotation.x=-Math.PI/2;g.position.y=-.15;g.receiveShadow=true;scene.add(g);
  scene.background=makeArcticSkyTex();
  scene.fog=new THREE.FogExp2(0x8899aa,.0035);
  sunLight.color.setHex(0xaaccff);sunLight.intensity=.8;
  ambientLight.color.setHex(0x445566);ambientLight.intensity=.45;
  hemiLight.color.setHex(0x6688aa);hemiLight.groundColor.setHex(0x223344);hemiLight.intensity=.30;
  // Ice barriers
  var N=_mobCount(220),im=new THREE.MeshLambertMaterial({color:0x88bbcc,transparent:true,opacity:.85});
  [-1,1].forEach(function(side){
    for(var i=0;i<N;i++){
      var t=i/N,p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
      var nr=new THREE.Vector3(-tg.z,0,tg.x);
      var pos=p.clone().addScaledVector(nr,side*BARRIER_OFF);
      var seg=new THREE.Mesh(new THREE.BoxGeometry(.9,1.2,1.0),im);
      seg.position.copy(pos);seg.position.y=.6;seg.rotation.y=Math.atan2(tg.x,tg.z);scene.add(seg);
    }
  });
  // Ice mountains
  var icm=new THREE.MeshLambertMaterial({color:0xaaddee,transparent:true,opacity:.9});
  var snm=new THREE.MeshLambertMaterial({color:0xeeeeff});
  [[280,-200,45,70],[-320,-150,52,80],[-200,230,38,62],[260,180,42,68]].forEach(function(d){
    var m=new THREE.Mesh(new THREE.ConeGeometry(d[2],d[3],7),icm);m.position.set(d[0],-6,d[1]);scene.add(m);
    var cap=new THREE.Mesh(new THREE.ConeGeometry(d[2]*.35,d[3]*.28,7),snm);cap.position.set(d[0],d[3]*.38,d[1]);scene.add(cap);
  });
  // Aurora borealis
  var auroraColors=[0x00ff88,0x0088ff,0xaa00ff,0x00ffcc,0xff00aa];
  for(var i=0;i<5;i++){
    var cvs=document.createElement('canvas');cvs.width=256;cvs.height=128;
    var ctx=cvs.getContext('2d');ctx.clearRect(0,0,256,128);
    var hex='#'+auroraColors[i].toString(16).padStart(6,'0');
    var grd=ctx.createLinearGradient(0,0,256,0);
    grd.addColorStop(0,'rgba(0,0,0,0)');grd.addColorStop(.3,hex+'88');grd.addColorStop(.7,hex+'44');grd.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=grd;ctx.fillRect(0,0,256,128);
    var tex=new THREE.CanvasTexture(cvs);
    var aurora=new THREE.Mesh(new THREE.PlaneGeometry(400+Math.random()*200,80+Math.random()*40),
      new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:.5+Math.random()*.3,
        side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));
    aurora.position.set((Math.random()-.5)*300,80+Math.random()*40,(Math.random()-.5)*300);
    aurora.rotation.y=Math.random()*Math.PI*2;scene.add(aurora);
    _arcticAurora.push({mesh:aurora,phase:Math.random()*Math.PI*2,speed:.15+Math.random()*.1});
  }
  // Blizzard particles
  var BN=_mobCount(500),bgeo=new THREE.BufferGeometry();
  var bpos=new Float32Array(BN*3);
  for(var i=0;i<BN;i++){bpos[i*3]=(Math.random()-.5)*500;bpos[i*3+1]=Math.random()*30;bpos[i*3+2]=(Math.random()-.5)*500;}
  bgeo.setAttribute('position',new THREE.Float32BufferAttribute(bpos,3));
  scene.add(new THREE.Points(bgeo,new THREE.PointsMaterial({color:0xeeeeff,size:.28,transparent:true,opacity:.75,sizeAttenuation:true})));
  _arcticBlizzardGeo=bgeo;
  // Black ice patches
  [.15,.38,.62,.82].forEach(function(t){
    var p=trackCurve.getPoint(t);
    var patch=new THREE.Mesh(new THREE.PlaneGeometry(TW*1.6,8),
      new THREE.MeshLambertMaterial({color:0x99ccdd,transparent:true,opacity:.7}));
    patch.rotation.x=-Math.PI/2;patch.position.copy(p);patch.position.y=.02;
    patch.rotation.y=Math.atan2(trackCurve.getTangent(t).x,trackCurve.getTangent(t).z);scene.add(patch);
    _arcticIcePatches.push({pos:p.clone(),radius:TW*.85,cooldown:0});
  });
  // ── Close-to-track iceberg clusters (Candy-pattern) ──
  var icebergM=new THREE.MeshLambertMaterial({color:0xaaddee,transparent:true,opacity:.92});
  var snowCapM=new THREE.MeshLambertMaterial({color:0xf0f8ff});
  for(var i=0;i<_mobCount(18);i++){
    var tt=(i/18+Math.random()*.015)%1;
    var p=trackCurve.getPoint(tt),tgv=trackCurve.getTangent(tt).normalize();
    var nr=new THREE.Vector3(-tgv.z,0,tgv.x);
    var side=(i%2===0?1:-1)*(BARRIER_OFF+14+Math.random()*22);
    var h=5+Math.random()*8;
    var berg=new THREE.Mesh(new THREE.ConeGeometry(3+Math.random()*2.5,h,5+Math.floor(Math.random()*3)),icebergM);
    berg.position.set(p.x+nr.x*side,h*.5-.3,p.z+nr.z*side);
    berg.rotation.y=Math.random()*Math.PI*2;
    scene.add(berg);
    // Snow cap
    var cap=new THREE.Mesh(new THREE.ConeGeometry(1.8,h*.4,5),snowCapM);
    cap.position.set(berg.position.x,h-.2,berg.position.z);
    scene.add(cap);
  }
  // ── Crystal clusters alongside track (sparkly) ──
  var crystalM=new THREE.MeshLambertMaterial({color:0xccefff,emissive:0x4499cc,emissiveIntensity:.4,transparent:true,opacity:.75});
  for(var i=0;i<_mobCount(14);i++){
    var tt=(i/14+.04+Math.random()*.02)%1;
    var p=trackCurve.getPoint(tt),tgv=trackCurve.getTangent(tt).normalize();
    var nr=new THREE.Vector3(-tgv.z,0,tgv.x);
    var side=(i%2===0?-1:1)*(BARRIER_OFF+4+Math.random()*6);
    var cx=p.x+nr.x*side,cz=p.z+nr.z*side;
    // 3-crystal cluster
    for(var k=0;k<3;k++){
      var cr=new THREE.Mesh(new THREE.OctahedronGeometry(.55+Math.random()*.4,0),crystalM);
      cr.position.set(cx+(Math.random()-.5)*1.8,.6+Math.random()*.8,cz+(Math.random()-.5)*1.8);
      cr.rotation.set(Math.random(),Math.random(),Math.random());
      scene.add(cr);
    }
  }
  // ── Snowbank mounds close to track ──
  var bankM=new THREE.MeshLambertMaterial({color:0xf0f8ff});
  for(var i=0;i<_mobCount(20);i++){
    var tt=(i/20+Math.random()*.012)%1;
    var p=trackCurve.getPoint(tt),tgv=trackCurve.getTangent(tt).normalize();
    var nr=new THREE.Vector3(-tgv.z,0,tgv.x);
    var side=(i%2===0?1:-1)*(BARRIER_OFF+2+Math.random()*4);
    var bank=new THREE.Mesh(new THREE.SphereGeometry(2.5+Math.random()*1.5,8,6,0,Math.PI*2,0,Math.PI*.5),bankM);
    bank.position.set(p.x+nr.x*side,0,p.z+nr.z*side);
    bank.scale.set(1,.4+Math.random()*.3,1.2+Math.random()*.4);
    scene.add(bank);
  }
  buildStartLine();
  // Lights
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);
  // Stars
  var sg=new THREE.SphereGeometry(.22,4,4),ssm=new THREE.MeshBasicMaterial({color:0xaaddff,transparent:true,opacity:.9});
  stars=new THREE.InstancedMesh(sg,ssm,200);stars.visible=true;
  var dm=new THREE.Object3D();
  for(var i=0;i<200;i++){
    var th=Math.random()*Math.PI*2,ph=Math.random()*Math.PI*.45,r=320+Math.random()*100;
    dm.position.set(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph)*.5+100,r*Math.sin(ph)*Math.sin(th));
    dm.scale.setScalar(.5+Math.random()*1.8);dm.updateMatrix();stars.setMatrixAt(i,dm.matrix);
  }
  stars.instanceMatrix.needsUpdate=true;scene.add(stars);
}


function updateArcticWorld(dt){
  var t=_nowSec;
  _arcticAurora.forEach(function(a,i){
    a.phase+=dt*a.speed;
    a.mesh.material.opacity=.35+Math.sin(a.phase)*.25;
    a.mesh.position.x+=Math.sin(a.phase*.3+i)*dt*.8;
  });
  if(_arcticBlizzardGeo){
    var pos=_arcticBlizzardGeo.attributes.position.array;
    var car=carObjs[playerIdx],cx=car?car.mesh.position.x:0,cz=car?car.mesh.position.z:0;
    var step=Math.floor(t*40)%60||1;
    for(var i=step;i<Math.min(step+60,pos.length/3);i++){
      pos[i*3]+=dt*(2.5+Math.sin(t*.3+i)*1.2);pos[i*3+1]-=dt*(1+Math.random()*.5);
      if(pos[i*3+1]<-.5||Math.abs(pos[i*3]-cx)>260){
        pos[i*3]=cx+(Math.random()-.5)*480;pos[i*3+1]=25+Math.random()*8;pos[i*3+2]=cz+(Math.random()-.5)*480;
      }
    }
    _arcticBlizzardGeo.attributes.position.needsUpdate=true;
  }
  _arcticIcePatches.forEach(function(ip){
    ip.cooldown=Math.max(0,ip.cooldown-dt);
    var car=carObjs[playerIdx];if(!car||ip.cooldown>0)return;
    var dx=car.mesh.position.x-ip.pos.x,dz=car.mesh.position.z-ip.pos.z;
    if(dx*dx+dz*dz<ip.radius*ip.radius){
      car.speed*=.92;camShake=Math.max(camShake,.25);
      playWorldEvent('ice');
      if(Math.random()<.03)showPopup('🧊 BLACK ICE!','#aaddff',800);
      ip.cooldown=1;
    }
  });
}

