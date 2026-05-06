// js/worlds/pier47.js — Pier 47 (industrial harbour by night) world builders.
// Non-module script. Sessie 2 = props + lighting + wet-rendering:
//   • sodium-lamp poles along the kade (always-on warm orange spillover)
//   • container stacks along the Container Run + The Yard sectors
//   • warehouse (loods) at the WP9 90° right
//   • cranes on the kade
//   • ophaalbrug (drawbridge) at sector 4
//   • wet-asphalt rendering on the track surface
// Plassen / regen / mist / stoom particles arrive in sessie 3. Optional
// wet-physics is sessie 4.
//
// ── Track-waypoints (data/tracks.json#pier47) ────────────────────────────
// 12 waypoints, counter-clockwise loop, bbox 440 × 405, perimeter 1311 units.
// Validation:
//   • closing gap   53.9 (< 80 required)
//   • min separation 53.9 (> 35 required)
//   • max segment   174.1 (< 200 required)
//   • no self-intersections
//
// Sector layout (driving direction = WP1 → WP2 → ... → WP12 → WP1):
//   Sector 1 — Container Run     [WP1 → WP4]   wide kade-strook + chicanes,
//                                              ends with 90° right
//   Sector 2 — The Yard          [WP4 → WP7]   open S-curve through container
//                                              yard
//   Sector 3 — The Warehouse     [WP7 → WP9]   straight stretch (~120 units)
//                                              ending in 90° right at loods
//   Sector 4 — The Bridge        [WP9 → WP11]  short bridge straight + soft
//                                              right curve at the far side
//   Sector 5 — Kade Sweep        [WP11 → WP1]  long sweeping right across
//                                              the kade back to finish line

'use strict';

// Per-world animated state — gereset bij world-switch via core/scene.js
// disposeScene(). Sessie-2 introduces the lamp-emissive list (sodium-orange
// flicker pulses subtly in updatePier47World) and the ophaalbrug ref so
// future polish can animate the bascule. Sessie-3 will park rain-puddle
// shimmer state here.
let _p47LampEmissives=[];   // [{mat, phase}] for sodium-lamp flicker
let _p47Bridge=null;         // ophaalbrug ref (sessie-2 static)

// Single source of truth for Pier 47 day lighting. Mirrors the sandstorm /
// candy / volcano helper pattern. buildPier47Environment + night.js's
// pier47-day branch share the same constants, so the build-time setup and
// the night→day toggle-restore can never drift.
//
// "Day" for Pier 47 is intentionally NOT a sunny morning — it's a bewolkte,
// dreigende nacht. Sessie 3 will introduce a separate "ochtend"-mode for
// the day-toggle.
//
// Goal palette (overcast night with subtle sodium-lamp warmth lifting the
// hemisphere ground colour — sessie-2 tweak):
//   sun     #d8d0c0 / 1.4 desktop / 0.9 mobile / position (60, 110, 80)
//   ambient #1a1a22 / 0.30
//   hemi sky #a0a8b0 / ground #4a3828 (warmer — sodium spillover) / 0.5
//
// Mobile sun caps at 0.9 (vs 1.4 desktop) because shadows are off on mobile;
// Lambert ground at full intensity would clip to white under no-shadow lighting.
function _applyPier47DayLighting(){
  if(!sunLight||!ambientLight||!hemiLight)return;
  sunLight.color.setHex(0xd8d0c0);
  sunLight.intensity = window._isMobile ? 0.9 : 1.4;
  sunLight.position.set(60, 110, 80);
  ambientLight.color.setHex(0x1a1a22); ambientLight.intensity = 0.30;
  hemiLight.color.setHex(0xa0a8b0);
  hemiLight.groundColor.setHex(0x4a3828); // warmer than sessie-1 (#403838) — sodium spillover from lamp poles
  hemiLight.intensity = 0.5;
}
// Expose to non-module consumers — night.js reads from window.* scope.
if(typeof window!=='undefined')window._applyPier47DayLighting=_applyPier47DayLighting;

// ── Skybox builders (canvas-baked) ────────────────────────────────────────
//
// Pier 47 day skybox: deep aubergine zenith bleeding through warmer purples
// to a horizon city-glow band, with a subtle sodium-orange strip low on
// the horizon (suggesting distant industrial harbour-lights). No stars —
// the night-sky is veiled by city light pollution. A subtle dark-grey cloud
// band sits across the lower horizon to reinforce the bewolkte-nacht feel.
//
// Painted directly onto the shared 1024×512 canvas (via _newSkyCanvas).
// Mobile auto-halves to 512×256 in _newSkyCanvas.
function makePier47SkyTex(){
  // Two-stop linear bg = zenith aubergine → mid purple. We paint horizon
  // bands on top to get the 4-stop gradient + glow strip without altering
  // _newSkyCanvas. Pattern matches sandstorm.
  const {c,g}=_newSkyCanvas('#1a1228','#2a1a3a');
  // Horizon band — city-glow purple-grey (#3a2a40) sliding into the sodium
  // strip. Spans rows ~280-400.
  const horiz=g.createLinearGradient(0,280,0,400);
  horiz.addColorStop(0,'rgba(42,26,58,0)');
  horiz.addColorStop(.5,'rgba(58,42,64,0.65)');
  horiz.addColorStop(1,'rgba(74,40,32,0.85)');
  g.fillStyle=horiz;g.fillRect(0,280,1024,120);
  // Sodium-orange foot-band (subtle, low) — picks up the fog tone so the
  // seam between fogged distant geometry and skybox is invisible.
  const foot=g.createLinearGradient(0,400,0,512);
  foot.addColorStop(0,'rgba(74,40,32,0.85)');
  foot.addColorStop(1,'rgba(42,37,48,1)');
  g.fillStyle=foot;g.fillRect(0,400,1024,112);
  // Subtle dark-grey cloud band laag op de horizon (rows ~310-385).
  // Soft blob clusters via radial gradients with low alpha — reads as
  // "bewolkte nacht" without competing with foreground content.
  for(let i=0;i<14;i++){
    const x=Math.random()*1024,y=320+Math.random()*60;
    const r=70+Math.random()*110;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba(28,24,38,0.45)');
    grd.addColorStop(.6,'rgba(28,24,38,0.18)');
    grd.addColorStop(1,'rgba(28,24,38,0)');
    g.fillStyle=grd;g.fillRect(x-r,y-r,r*2,r*2);
  }
  // Faint city-glow hotspot lower-right (suggests harbour skyline beyond the
  // horizon). Warm orange tint matches the foot-band sodium strip.
  const glow=g.createRadialGradient(720,420,0,720,420,260);
  glow.addColorStop(0,'rgba(110,60,40,0.45)');
  glow.addColorStop(.5,'rgba(70,40,30,0.20)');
  glow.addColorStop(1,'rgba(70,40,30,0)');
  g.fillStyle=glow;g.fillRect(460,200,520,312);
  return _skyTexFromCanvas(c);
}

// Pier 47 NIGHT skybox: even darker variant of the day skybox. Same overall
// composition (no stars, city-glow at horizon) but ambient deepens and the
// cloud cover thickens. Sessie 2 will introduce sodium-lamp light from
// foreground lamp-poles; sessie 3 will introduce particles + rain. For now
// the night toggle is a small visual delta.
function makePier47NightSkyTex(){
  const {c,g}=_newSkyCanvas('#100818','#1a1028');
  const horiz=g.createLinearGradient(0,280,0,400);
  horiz.addColorStop(0,'rgba(26,16,40,0)');
  horiz.addColorStop(.5,'rgba(36,22,48,0.7)');
  horiz.addColorStop(1,'rgba(58,30,24,0.9)');
  g.fillStyle=horiz;g.fillRect(0,280,1024,120);
  const foot=g.createLinearGradient(0,400,0,512);
  foot.addColorStop(0,'rgba(58,30,24,0.9)');
  foot.addColorStop(1,'rgba(28,24,32,1)');
  g.fillStyle=foot;g.fillRect(0,400,1024,112);
  // Thicker cloud cover for night
  for(let i=0;i<18;i++){
    const x=Math.random()*1024,y=300+Math.random()*80;
    const r=80+Math.random()*130;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba(18,14,26,0.55)');
    grd.addColorStop(.6,'rgba(18,14,26,0.22)');
    grd.addColorStop(1,'rgba(18,14,26,0)');
    g.fillStyle=grd;g.fillRect(x-r,y-r,r*2,r*2);
  }
  // Slightly stronger city-glow hotspot at night (industrial lights cut through
  // the cloud cover more readily than ambient daylight).
  const glow=g.createRadialGradient(720,420,0,720,420,280);
  glow.addColorStop(0,'rgba(120,68,42,0.55)');
  glow.addColorStop(.5,'rgba(80,46,32,0.25)');
  glow.addColorStop(1,'rgba(80,46,32,0)');
  g.fillStyle=glow;g.fillRect(440,180,540,332);
  return _skyTexFromCanvas(c);
}

// ── Procedural ground texture (subtle concrete grain) ────────────────────
//
// The harbour kade is dark concrete — uniform tone with subtle grain so
// the ground plane never reads as a flat-color quad. Mirrors the
// _sandGroundTex / _iceGroundTex pattern used by sandstorm/arctic.
function _pier47GroundTex(){
  const S=256,c=document.createElement('canvas');c.width=S;c.height=S;
  const g=c.getContext('2d');
  // Base dark-concrete grey
  g.fillStyle='#2a2a30';g.fillRect(0,0,S,S);
  // Per-pixel grain — ImageData range matches the surface tone (38..52)
  const id=g.getImageData(0,0,S,S),d=id.data;
  for(let i=0;i<d.length;i+=4){
    const n=38+(Math.random()*14)|0;
    d[i]=n;d[i+1]=n;d[i+2]=n+2;d[i+3]=255;
  }
  g.putImageData(id,0,0);
  // A few darker oil/wear blobs
  for(let i=0;i<14;i++){
    const x=Math.random()*S,y=Math.random()*S,r=5+Math.random()*11;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba(15,15,18,0.55)');
    grd.addColorStop(1,'rgba(15,15,18,0)');
    g.fillStyle=grd;g.fillRect(x-r,y-r,r*2,r*2);
  }
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(40,40);
  t.anisotropy=4;t.needsUpdate=true;
  return t;
}

// ── Sodium lamp poles (always-on industrial lighting) ────────────────────
//
// Pier 47's defining detail: warm orange (#ff8830) high-pressure sodium
// lamps lining the kade. Always on (the world is permanently overcast-
// nacht), pulsing subtly via _p47LampEmissives in updatePier47World.
//
// Geometry budget:
//   • Pole shaft: shared CylinderGeometry, InstancedMesh (POLE_COUNT * 2
//     instances, one IM call)
//   • Lamp head:  shared BoxGeometry, InstancedMesh (one IM call). Heads
//     share a single emissive material reference so flicker animation
//     mutates one mat for all lamps simultaneously.
//   • PointLights: spaced out (every 2nd pole on desktop, every 3rd on
//     mobile) so total active scene lights stay within Three.js's
//     forward-rendering budget. Range 28u — illuminates barrier + kerb
//     edge plus ~12u of the kade beyond.
//
// Disposal: pole + head InstancedMeshes get cleaned up by disposeScene's
// generic mesh traversal. PointLights are scene children — auto-removed.
// _p47LampEmissives is reset in scene.js's per-world array clear block.
function _p47BuildLampPoles(){
  const mob=window._isMobile;
  const POLE_COUNT=mob?14:22;                       // pairs (each pole on both sides)
  const LIGHT_EVERY=mob?3:2;                        // 1 PointLight per N poles
  const N_PER_SIDE=POLE_COUNT;
  const TOTAL=N_PER_SIDE*2;
  // Shared geometry/materials — one mat per IM, mutated for flicker.
  const poleGeo=new THREE.CylinderGeometry(0.10,0.16,8.5,6);
  const poleMat=new THREE.MeshLambertMaterial({color:0x222018});
  const armGeo=new THREE.BoxGeometry(0.10,0.10,1.4);  // arm reaching toward track
  const armMat=poleMat;                                // share — same material
  const headGeo=new THREE.BoxGeometry(0.95,0.32,0.95);
  // Sodium-orange emissive — high intensity baseline; flicker mutates this.
  const headMat=new THREE.MeshLambertMaterial({
    color:0xff8830,
    emissive:0xff8830,
    emissiveIntensity:1.4
  });
  _p47LampEmissives.push({mat:headMat,phase:Math.random()*Math.PI*2});
  const poleIM=new THREE.InstancedMesh(poleGeo,poleMat,TOTAL);
  const armIM =new THREE.InstancedMesh(armGeo,armMat,TOTAL);
  const headIM=new THREE.InstancedMesh(headGeo,headMat,TOTAL);
  const dummy=new THREE.Object3D();
  let idx=0;
  for(let i=0;i<N_PER_SIDE;i++){
    const t=i/N_PER_SIDE;
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const ang=Math.atan2(tg.x,tg.z);
    [-1,1].forEach(side=>{
      const off=BARRIER_OFF+2.4;
      const px=p.x+nr.x*side*off;
      const pz=p.z+nr.z*side*off;
      // Pole shaft — vertical cylinder, base at y=0, height 8.5 → centered at 4.25
      dummy.position.set(px,4.25,pz);
      dummy.rotation.set(0,0,0);
      dummy.scale.set(1,1,1);
      dummy.updateMatrix();
      poleIM.setMatrixAt(idx,dummy.matrix);
      // Arm — extends from top of pole inward toward the track
      const armX=px-nr.x*side*0.7;
      const armZ=pz-nr.z*side*0.7;
      dummy.position.set(armX,8.2,armZ);
      // Rotate arm so its long axis points along inward-normal (cross-track)
      dummy.rotation.set(0,ang+Math.PI/2,0);
      dummy.updateMatrix();
      armIM.setMatrixAt(idx,dummy.matrix);
      // Head — sits at end of arm, hangs below it slightly
      const headX=px-nr.x*side*1.4;
      const headZ=pz-nr.z*side*1.4;
      dummy.position.set(headX,7.95,headZ);
      dummy.rotation.set(0,ang,0);
      dummy.updateMatrix();
      headIM.setMatrixAt(idx,dummy.matrix);
      // PointLight every Nth pole — staggered between sides for spread.
      if((i+(side>0?0:1))%LIGHT_EVERY===0){
        const pl=new THREE.PointLight(0xff8830,1.2,28);
        pl.position.set(headX,7.6,headZ);
        scene.add(pl);
      }
      idx++;
    });
  }
  poleIM.instanceMatrix.needsUpdate=true;
  armIM.instanceMatrix.needsUpdate=true;
  headIM.instanceMatrix.needsUpdate=true;
  scene.add(poleIM);scene.add(armIM);scene.add(headIM);
}

// ── Main environment builder ──────────────────────────────────────────────
//
// Sessie 2 expansion:
//   1. Concrete kade ground (sessie-1)
//   2. Day-lighting (sessie-1)
//   3. Barriers + start line (sessie-1)
//   4. Sodium lamp poles along the kade (NEW, _p47BuildLampPoles)
//   5. (Containers / warehouse / cranes / ophaalbrug land in commit 2/3)
//   6. Headlights + sparse always-off stars (sessie-1)
function buildPier47Environment(){
  // Weather reset — Pier 47's signature mood is motregen, but sessie 1 has
  // no rain renderer yet. Clear any inherited weather state so the dry
  // baseline reads correctly.
  if(typeof isRain!=='undefined'&&isRain){
    isRain=false;
    if(typeof _rainTarget!=='undefined')_rainTarget=0;
    if(typeof _rainIntensity!=='undefined')_rainIntensity=0;
    if(rainCanvas)rainCanvas.style.display='none';
  }
  // Ground — flat dark-concrete kade. 2400² to fill the world; matches the
  // sandstorm/arctic pattern. y=-0.15 sits below the y=0.005 track ribbon.
  const g=new THREE.Mesh(
    new THREE.PlaneGeometry(2400,2400),
    new THREE.MeshLambertMaterial({color:0x2a2a30,map:_pier47GroundTex()})
  );
  g.rotation.x=-Math.PI/2;g.position.y=-.15;g.receiveShadow=true;
  g.userData._isProcGround=true; // hookable by asset-bridge if PBR concrete loaded later
  scene.add(g);
  // Day lighting — single source of truth via the helper.
  _applyPier47DayLighting();
  // Barriers + start line (shared environment helpers).
  buildBarriers();buildStartLine();
  // Sodium-lamp poles along the kade — always-on industrial lighting.
  // Defining detail of the world; placed AFTER barriers so the pole
  // bases sit just outside the barrier line.
  _p47BuildLampPoles();
  // Player + AI headlight refs — Pier 47 is dark, headlights matter even
  // before sessie-2 sodium lamps land.
  plHeadL=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  plHeadR=new THREE.SpotLight(0xffffff,0,50,Math.PI*.16,.5);
  scene.add(plHeadL);scene.add(plHeadL.target);scene.add(plHeadR);scene.add(plHeadR.target);
  plTail=new THREE.PointLight(0xff2200,0,10);scene.add(plTail);
  // Stars — always-off for Pier 47 (city light pollution + cloud cover).
  // Built and added so other systems (toggleNight) that read window.stars
  // never crash on null. The instanced mesh visibility stays false.
  {
    const sg=new THREE.SphereGeometry(.12,4,4);
    const sm=new THREE.MeshBasicMaterial({color:0x888080,transparent:true,opacity:.4});
    stars=new THREE.InstancedMesh(sg,sm,30);stars.visible=false;
    const dm=new THREE.Object3D();
    for(let i=0;i<30;i++){
      const th=Math.random()*Math.PI*2,ph=Math.random()*Math.PI*.3,r=320+Math.random()*60;
      dm.position.set(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph)*.4+50,r*Math.sin(ph)*Math.sin(th));
      dm.scale.setScalar(.5);dm.updateMatrix();stars.setMatrixAt(i,dm.matrix);
    }
    stars.instanceMatrix.needsUpdate=true;scene.add(stars);
  }
}

// ── Per-frame world update ────────────────────────────────────────────────
//
// Sessie 2 introduces the first per-frame work for Pier 47: subtle
// sodium-lamp flicker on the lamp-head shared emissive material. The
// flicker is a single sine modulation around the baseline emissiveIntensity
// so all lamps pulse in unison — cheap (one mat mutation per frame) and
// reads as the harmonic flicker of a row of high-pressure sodium lamps
// settling into their warm-up cycle.
//
// Sessie 3 will extend this with rain-puddle shimmer, drifting fog, and
// optional ophaalbrug bascule animation. For now: just lamp flicker.
function updatePier47World(dt){
  if(!_p47LampEmissives.length)return;
  const t=_nowSec;
  for(let i=0;i<_p47LampEmissives.length;i++){
    const e=_p47LampEmissives[i];
    if(!e||!e.mat)continue;
    // Baseline 1.4 ± 0.18 — visible breathing without strobing.
    const v=Math.sin(t*1.7+e.phase);
    e.mat.emissiveIntensity=1.4+v*0.18;
  }
}
