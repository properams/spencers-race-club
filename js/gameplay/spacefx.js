// js/gameplay/spacefx.js — auto-extracted in Fase 4
// Non-module script.


function spawnSpaceMeteor(){
  const m=_spaceMeteors.find(m=>!m.active);if(!m)return;
  // Random point on track
  const t=Math.random();
  const p=trackCurve.getPoint(t);
  const nr=trackCurve.getTangent(t).normalize();
  // Land within track width
  const offX=(Math.random()-.5)*TW*1.4,offZ=(Math.random()-.5)*TW*1.4;
  m.tx=p.x+offX;m.tz=p.z+offZ;
  m.mesh.position.set(m.tx,220+Math.random()*80,m.tz);
  m.mesh.visible=true;m.vy=-8;m.t=0;m.active=true;
  m.pl.intensity=3.0;m.pl.position.copy(m.mesh.position);
  // Warning popup
  floatText('☄ INCOMING!','#ff8800',innerWidth*.5,innerHeight*.35);
  if(audioCtx)beep(180,.5,.3,0,'sawtooth');
}


function triggerSpaceFall(car){
  if(car._fallingIntoSpace||recoverActive)return;
  car._fallingIntoSpace=true;
  car._fallTimer=0;
  car.inAir=true;
  // Give a small downward push
  if(car.vy>-2)car.vy=-2;
  if(_elWarn)_elWarn.style.display='none';
  if(_elWrongWay)_elWrongWay.style.display='none';
  _wrongWayTimer=0;
  showBanner('FALLING!','#ff3300',0); // 0 = keep until hidden
  playSpaceFallSound();
  floatText('⬇ FALLING!','#ff4400',innerWidth*.5,innerHeight*.4);
}


function triggerSpaceRecovery(car){
  car._fallingIntoSpace=false;
  car._fallTimer=0;
  recoverActive=true;recoverTimer=2.8;car.speed=0;car.vy=0;car.inAir=false;
  hideBanner();
  // Tractor beam — position beam above recovery point
  const t=car.progress;
  const pt=trackCurve.getPoint(t);
  if(_spaceBeamMesh){
    _spaceBeamMesh.position.set(pt.x,pt.y+110,pt.z);
    _spaceBeamMesh.visible=true;
    _spaceBeamTimer=2.8;
  }
  // Teleport car back to track
  const tgR=trackCurve.getTangent(t).normalize();
  car.mesh.position.copy(pt);car.mesh.position.y=.35;
  car.mesh.rotation.set(0,Math.atan2(-tgR.x,-tgR.z),0);
  const off=new THREE.Vector3(0,5.8,13.5).applyQuaternion(car.mesh.quaternion);
  camPos.copy(car.mesh.position).add(off);
  camShake=0.8;
  showBanner('🛸 TRACTOR BEAM','#00ffcc',2600);
  playSpaceTractorSound();
  floatText('🛸 RETRIEVED','#00ffcc',innerWidth*.5,innerHeight*.45);
}


function playSpaceFallSound(){
  if(!audioCtx)return;
  // Descending wail
  const o=audioCtx.createOscillator();const g=audioCtx.createGain();
  o.type='sawtooth';o.frequency.setValueAtTime(320,audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(60,audioCtx.currentTime+1.4);
  g.gain.setValueAtTime(.28,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+1.6);
  o.connect(g);g.connect(_dst());o.start();o.stop(audioCtx.currentTime+1.6);
}

function playSpaceTractorSound(){
  if(!audioCtx)return;
  // Rising hum beam
  const o=audioCtx.createOscillator();const g=audioCtx.createGain();
  o.type='sine';o.frequency.setValueAtTime(80,audioCtx.currentTime);
  o.frequency.exponentialRampToValueAtTime(440,audioCtx.currentTime+1.0);
  g.gain.setValueAtTime(.0001,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.35,audioCtx.currentTime+.3);
  g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+2.4);
  o.connect(g);g.connect(_dst());o.start();o.stop(audioCtx.currentTime+2.6);
  // Add a high shimmer
  const o2=audioCtx.createOscillator();const g2=audioCtx.createGain();
  o2.type='sine';o2.frequency.setValueAtTime(880,audioCtx.currentTime+.1);
  o2.frequency.linearRampToValueAtTime(1760,audioCtx.currentTime+1.8);
  g2.gain.setValueAtTime(.0001,audioCtx.currentTime+.1);g2.gain.linearRampToValueAtTime(.15,audioCtx.currentTime+.5);
  g2.gain.linearRampToValueAtTime(.001,audioCtx.currentTime+2.6);
  o2.connect(g2);g2.connect(_dst());o2.start(audioCtx.currentTime+.1);o2.stop(audioCtx.currentTime+2.8);
}

function playSpaceWormholeSound(){
  if(!audioCtx)return;
  beep(220,.12,.2,0,'sine');beep(440,.10,.18,.1,'sine');beep(880,.08,.15,.2,'sine');
  beep(1760,.06,.12,.3,'sine');
}

function playSpaceRailgunSound(){
  if(!audioCtx)return;
  beep(120,.06,.35,0,'sawtooth');beep(240,.08,.3,.04,'sawtooth');
}


function playWorldEvent(type){
  if(!audioCtx)return;
  var t=audioCtx.currentTime;
  if(type==='geiser'){
    var o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type='sawtooth';o.frequency.setValueAtTime(55,t);o.frequency.exponentialRampToValueAtTime(180,t+0.4);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(0.35,t+0.1);g.gain.exponentialRampToValueAtTime(0.01,t+1.2);
    o.connect(g);g.connect(_dst());o.start(t);o.stop(t+1.3);
  }
  if(type==='emp'){
    var o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type='square';o.frequency.setValueAtTime(80,t);o.frequency.setValueAtTime(160,t+0.1);o.frequency.setValueAtTime(40,t+0.2);
    g.gain.setValueAtTime(0.25,t);g.gain.exponentialRampToValueAtTime(0.01,t+0.5);
    o.connect(g);g.connect(_dst());o.start(t);o.stop(t+0.5);
  }
  if(type==='ice'){
    var o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.type='sine';o.frequency.setValueAtTime(800,t);o.frequency.linearRampToValueAtTime(400,t+0.3);
    g.gain.setValueAtTime(0.12,t);g.gain.exponentialRampToValueAtTime(0.01,t+0.4);
    o.connect(g);g.connect(_dst());o.start(t);o.stop(t+0.4);
  }
  if(type==='lava'){
    _noise(.3,180,1.5,.3);
  }
}

function _tpSpawnFirework(){
  const PN=_mobCount(55);
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(PN*3),vel=new Float32Array(PN*3),col=new Float32Array(PN*3);
  const cx=(Math.random()-.5)*520,cy=48+Math.random()*28,cz=(Math.random()-.5)*520;
  const palettes=[[1,.3,.5],[1,.8,.2],[.3,.8,1],[.7,.4,1],[1,.6,.2],[1,.2,.8]];
  const bc=palettes[Math.floor(Math.random()*palettes.length)];
  for(let i=0;i<PN;i++){
    pos[i*3]=cx;pos[i*3+1]=cy;pos[i*3+2]=cz;
    const th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1),s=6+Math.random()*5;
    vel[i*3]=Math.sin(ph)*Math.cos(th)*s;
    vel[i*3+1]=Math.cos(ph)*s;
    vel[i*3+2]=Math.sin(ph)*Math.sin(th)*s;
    col[i*3]=bc[0];col[i*3+1]=bc[1];col[i*3+2]=bc[2];
  }
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  const mat=new THREE.PointsMaterial({vertexColors:true,size:1.1,transparent:true,opacity:.9,sizeAttenuation:true});
  const mesh=new THREE.Points(geo,mat);scene.add(mesh);
  const pl=new THREE.PointLight(new THREE.Color(bc[0],bc[1],bc[2]),2.2,110);
  pl.position.set(cx,cy,cz);scene.add(pl);
  _tpFireworks.push({mesh:mesh,geo:geo,vel:vel,age:0,maxAge:1.7,light:pl});
}

