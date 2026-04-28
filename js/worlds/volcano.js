// js/worlds/volcano.js — volcano world builders + update + collision checks
// Non-module script.

'use strict';

// Per-world state (uit main.js verhuisd) — gereset in core/scene.js buildScene().
let _volcanoLavaRivers=[],_volcanoGeisers=[],_volcanoEmberGeo=null;
let _volcanoEruption=null,_volcanoEruptionTimer=3;
let _volcanoEmbers=null,_volcanoGlowLight=null;

function buildVolcanoEnvironment(){
  // Ground
  const g=new THREE.Mesh(new THREE.PlaneGeometry(2400,2400),
    new THREE.MeshLambertMaterial({color:0x1a0800}));
  g.rotation.x=-Math.PI/2;g.position.y=-.15;g.receiveShadow=true;scene.add(g);
  // Sky + fog set in core/scene.js so updateSky's lerp uses world-matched colors.
  sunLight.color.setHex(0xff4422);sunLight.intensity=.7;
  ambientLight.color.setHex(0x441100);ambientLight.intensity=.35;
  hemiLight.color.setHex(0xff6600);hemiLight.groundColor.setHex(0x220800);hemiLight.intensity=.25;
  _volcanoGlowLight=new THREE.PointLight(0xff4400,3.0,600);
  _volcanoGlowLight.position.set(0,5,0);scene.add(_volcanoGlowLight);
  // Eruption particle system — lava blobs shooting out of main crater
  {
    const PN=_mobCount(120);
    const geo=new THREE.BufferGeometry();
    const pos=new Float32Array(PN*3),vel=new Float32Array(PN*3),col=new Float32Array(PN*3),life=new Float32Array(PN);
    for(let i=0;i<PN;i++){
      pos[i*3]=0;pos[i*3+1]=-200;pos[i*3+2]=-350; // hidden below until spawned
      life[i]=0;
      col[i*3]=1;col[i*3+1]=.25+Math.random()*.35;col[i*3+2]=0;
    }
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    const mat=new THREE.PointsMaterial({vertexColors:true,size:2.4,transparent:true,opacity:.95,sizeAttenuation:true,blending:THREE.AdditiveBlending,depthWrite:false});
    const pts=new THREE.Points(geo,mat);scene.add(pts);
    // Crater glow light that pulses during eruption
    const eruptLight=new THREE.PointLight(0xff5500,2.5,380);
    eruptLight.position.set(0,70,-350);scene.add(eruptLight);
    _volcanoEruption={geo:geo,pts:pts,vel:vel,life:life,N:PN,craterPos:new THREE.Vector3(0,70,-350),light:eruptLight,phase:'idle',phaseTimer:0};
  }
  // Main volcano
  const vm=new THREE.MeshLambertMaterial({color:0x1a0800});
  const lm=new THREE.MeshLambertMaterial({color:0xff4400,emissive:0xff2200,emissiveIntensity:1.2});
  const body=new THREE.Mesh(new THREE.ConeGeometry(120,150,8),vm);
  body.position.set(0,-10,-350);scene.add(body);
  const krater=new THREE.Mesh(new THREE.CylinderGeometry(18,25,12,8),lm);
  krater.position.set(0,64,-350);scene.add(krater);
  _volcanoLavaRivers.push({mesh:krater,baseInt:1.2});
  // Lava streams
  for(let i=0;i<3;i++){
    const ang=(i/3)*Math.PI*2+.5;
    const s=new THREE.Mesh(new THREE.BoxGeometry(6,80,5),
      new THREE.MeshLambertMaterial({color:0xff6600,emissive:0xff3300,emissiveIntensity:1.0}));
    s.position.set(Math.cos(ang)*30,25,-350+Math.sin(ang)*30);s.rotation.z=ang+Math.PI;
    scene.add(s);_volcanoLavaRivers.push({mesh:s,baseInt:1.0});
  }
  // Secondary volcanoes
  [[220,-200,60,80],[-280,-180,55,70],[-180,200,45,60],[250,150,40,55]].forEach(function(d){
    var m=new THREE.Mesh(new THREE.ConeGeometry(d[2],d[3],7),vm);m.position.set(d[0],-8,d[1]);scene.add(m);
    var k=new THREE.Mesh(new THREE.CylinderGeometry(d[2]*.15,d[2]*.2,6,6),lm);k.position.set(d[0],d[3]/2-2,d[1]);scene.add(k);
  });
  // Lava rivers alongside track
  var lm2=new THREE.MeshLambertMaterial({color:0xff5500,emissive:0xff2200,emissiveIntensity:.9,transparent:true,opacity:.88});
  for(var i=0;i<_mobCount(12);i++){
    var t=i/12,p=trackCurve.getPoint(t),tg=trackCurve.getTangent(t).normalize();
    var nr=new THREE.Vector3(-tg.z,0,tg.x);
    var side=(i%2===0?1:-1)*(BARRIER_OFF+12+Math.random()*10);
    var lava=new THREE.Mesh(new THREE.PlaneGeometry(5+Math.random()*4,18+Math.random()*12),lm2.clone());
    lava.rotation.x=-Math.PI/2;lava.rotation.z=Math.atan2(tg.x,tg.z);
    lava.position.set(p.x+nr.x*side,-.08,p.z+nr.z*side);
    scene.add(lava);_volcanoLavaRivers.push({mesh:lava,baseInt:.9});
  }
  // Ember particles
  var EN=_mobCount(400),egeo=new THREE.BufferGeometry();
  var epos=new Float32Array(EN*3),ecol=new Float32Array(EN*3);
  for(var i=0;i<EN;i++){
    epos[i*3]=(Math.random()-.5)*600;epos[i*3+1]=Math.random()*40+1;epos[i*3+2]=(Math.random()-.5)*600;
    ecol[i*3]=1.0;ecol[i*3+1]=Math.random()*.4;ecol[i*3+2]=0;
  }
  egeo.setAttribute('position',new THREE.Float32BufferAttribute(epos,3));
  egeo.setAttribute('color',new THREE.Float32BufferAttribute(ecol,3));
  _volcanoEmbers=new THREE.Points(egeo,new THREE.PointsMaterial({vertexColors:true,size:.3,transparent:true,opacity:.85,sizeAttenuation:true}));
  scene.add(_volcanoEmbers);_volcanoEmberGeo=egeo;
  // Geysers
  [.22,.52,.78].forEach(function(t,gi){
    var p=trackCurve.getPoint(t).clone();
    var plat=new THREE.Mesh(new THREE.CylinderGeometry(3,3.5,.5,8),new THREE.MeshLambertMaterial({color:0x1a0800}));
    plat.position.copy(p);plat.position.y=.25;scene.add(plat);
    var gey=new THREE.Mesh(new THREE.CylinderGeometry(.8,1.2,2,8),
      new THREE.MeshLambertMaterial({color:0xff4400,emissive:0xff2200,emissiveIntensity:1.5}));
    gey.position.copy(p);gey.position.y=1.2;scene.add(gey);
    var pl=new THREE.PointLight(0xff4400,2.0,22);pl.position.copy(p);pl.position.y=2;scene.add(pl);
    _volcanoGeisers.push({pos:p.clone(),geyser:gey,light:pl,active:false,timer:5+gi*3,activeDur:2.5});
  });
  // Bridge over lava (signature moment — collapsing in lap 3).
  if(typeof buildVolcanoBridge==='function')buildVolcanoBridge();
  // Barriers
  buildBarriers();buildStartLine();
  // Lights setup (headlights/taillights)
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);
  // Stars (ember-colored)
  var sg=new THREE.SphereGeometry(.18,4,4),ssm=new THREE.MeshBasicMaterial({color:0xff4400,transparent:true,opacity:.8});
  stars=new THREE.InstancedMesh(sg,ssm,60);stars.visible=true;
  var dm=new THREE.Object3D();
  for(var i=0;i<60;i++){
    var th=Math.random()*Math.PI*2,ph=Math.random()*Math.PI*.3,r=300+Math.random()*80;
    dm.position.set(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph)*.35+60,r*Math.sin(ph)*Math.sin(th));
    dm.scale.setScalar(.6+Math.random()*1.2);dm.updateMatrix();stars.setMatrixAt(i,dm.matrix);
  }
  stars.instanceMatrix.needsUpdate=true;scene.add(stars);
}


function updateVolcanoWorld(dt){
  var t=_nowSec;
  if(typeof updateVolcanoBridge==='function'){
    var pl=carObjs[playerIdx];
    updateVolcanoBridge(dt, pl?pl.lap:1);
  }
  _volcanoLavaRivers.forEach(function(r,i){
    if(r.mesh&&r.mesh.material)r.mesh.material.emissiveIntensity=r.baseInt*.7+r.baseInt*.5*Math.sin(t*1.4+i*.9);
  });
  if(_volcanoEmberGeo){
    var pos=_volcanoEmberGeo.attributes.position.array;
    var step=Math.floor(t*40)%50||1;
    for(var i=step;i<Math.min(step+50,pos.length/3);i++){
      pos[i*3+1]+=dt*(.8+Math.random()*.6);
      if(pos[i*3+1]>35){pos[i*3]=(Math.random()-.5)*500;pos[i*3+1]=Math.random()*2;pos[i*3+2]=(Math.random()-.5)*500;}
    }
    _volcanoEmberGeo.attributes.position.needsUpdate=true;
  }
  _volcanoGeisers.forEach(function(g,gi){
    g.timer-=dt;
    if(!g.active&&g.timer<=0){g.active=true;g.timer=g.activeDur;g.light.intensity=4.0;}
    if(g.active){
      g.geyser.scale.y=1+Math.sin(t*8)*.3;g.geyser.position.y=1.2+Math.sin(t*8)*.5;
      g.light.intensity=3.5+Math.sin(t*6);
      var car=carObjs[playerIdx];
      if(car){var dx=car.mesh.position.x-g.pos.x,dz=car.mesh.position.z-g.pos.z;
        if(dx*dx+dz*dz<25){car.speed*=.55;camShake=1.2;playWorldEvent('geiser');}}
      if(g.timer<=0){g.active=false;g.timer=8+gi*4+Math.random()*6;g.geyser.scale.y=1;g.light.intensity=2.0;}
    }else{g.light.intensity=1.8+Math.sin(t*2+gi*1.5)*.4;}
  });
  if(Math.random()<dt*0.03)playWorldEvent('lava');
  if(_volcanoGlowLight)_volcanoGlowLight.intensity=2.5+Math.sin(t*.6)*.8;
  // ── VOLCANO ERUPTION ──
  if(_volcanoEruption){
    const er=_volcanoEruption;
    er.phaseTimer-=dt;
    if(er.phase==='idle'){
      _volcanoEruptionTimer-=dt;
      er.light.intensity=2+Math.sin(t*.7)*.6;
      if(_volcanoEruptionTimer<=0){
        // Start eruption: spawn burst of lava
        er.phase='burst';er.phaseTimer=3.8;
        _volcanoEruptionTimer=9+Math.random()*8; // next eruption in 9-17s
        const pos=er.geo.attributes.position.array;
        const activeCount=Math.min(er.N,80+Math.floor(Math.random()*40));
        for(let i=0;i<activeCount;i++){
          pos[i*3]=er.craterPos.x+(Math.random()-.5)*12;
          pos[i*3+1]=er.craterPos.y+Math.random()*3;
          pos[i*3+2]=er.craterPos.z+(Math.random()-.5)*12;
          // Upward + outward velocity cone
          const th=Math.random()*Math.PI*2,lift=32+Math.random()*22,out=6+Math.random()*14;
          er.vel[i*3]=Math.cos(th)*out;
          er.vel[i*3+1]=lift;
          er.vel[i*3+2]=Math.sin(th)*out;
          er.life[i]=3.2+Math.random()*1.2;
        }
        er.geo.attributes.position.needsUpdate=true;
        playWorldEvent('lava');
        if(_volcanoGlowLight)_volcanoGlowLight.intensity=6; // flash
      }
    }
    if(er.phase==='burst'){
      const pos=er.geo.attributes.position.array;
      for(let i=0;i<er.N;i++){
        if(er.life[i]<=0)continue;
        er.life[i]-=dt;
        pos[i*3]+=er.vel[i*3]*dt;
        pos[i*3+1]+=er.vel[i*3+1]*dt;
        pos[i*3+2]+=er.vel[i*3+2]*dt;
        er.vel[i*3+1]-=28*dt; // gravity
        // Ground collision near volcano
        if(pos[i*3+1]<-1){
          er.life[i]=0;
          pos[i*3+1]=-200; // hide
        }
      }
      er.geo.attributes.position.needsUpdate=true;
      // Fade the peak flash
      er.light.intensity=Math.max(2,er.light.intensity-dt*1.5);
      if(er.phaseTimer<=0){er.phase='idle';}
    }
  }
}

