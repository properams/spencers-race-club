// js/worlds/pier47.js — Pier 47 (industrial harbour by night) world builders.
// Non-module script. Sessie history:
//   sessie 1 — bones + skybox + lighting + WORLDS registration
//   sessie 2 — props (lamp poles + containers + warehouse + cranes
//              + ophaalbrug) + wet-asphalt rendering
//   sessie 3 — atmosphere prep: motregen-default + drizzle particle pool
//   CINEMATIC FOUNDATION — Pier 47 upgraded to its cinematic visual
//              language. See docs/CINEMATIC_PATTERN.md and
//              js/effects/cinematic.js for the reusable helper layer.
// Optional wet-physics is sessie 4.
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
let _p47DrizzleGeo=null;     // BufferGeometry for motregen particle pool
let _p47Drizzle=null;        // THREE.Points mesh (the drizzle streaks)

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

// ── Containers (Container Run sector 1 + Yard sector 2) ──────────────────
//
// ISO shipping containers stacked along the kade. The Container Run section
// (t in [0..0.25]) gets neat single-stack rows that bracket the track for
// the "smal tussen containers" feel; The Yard (t in [0.25..0.5]) gets
// mixed-orientation 1-3 high stacks for chaotic open-yard read.
//
// All containers share a single 12 × 2.6 × 2.4u BoxGeometry rendered via
// InstancedMesh. instanceColor (per-instance r/g/b) gives variety from a
// realistic palette (rust-orange, faded blue, weathered green, dark red,
// industrial grey) without 5 separate materials. One draw call total.
//
// Mobile halves the count and skips the yard's 3-high tier.
//
// Procedural texture on the container body adds vertical corrugation hint
// + faded paint streaks. Shared across all instances.
function _p47ContainerTex(){
  const W=128,H=128,c=document.createElement('canvas');
  c.width=W;c.height=H;
  const g=c.getContext('2d');
  // Base white (multiplied with instanceColor → keeps per-instance tint)
  g.fillStyle='#ffffff';g.fillRect(0,0,W,H);
  // Vertical corrugation lines (every 4px) — thin grey
  g.strokeStyle='rgba(40,40,40,0.35)';g.lineWidth=1;
  for(let x=0;x<W;x+=4){g.beginPath();g.moveTo(x,0);g.lineTo(x,H);g.stroke();}
  // Horizontal frame bands top + bottom
  g.fillStyle='rgba(30,30,30,0.55)';
  g.fillRect(0,0,W,5);g.fillRect(0,H-5,W,5);
  // A few rust streaks running vertically
  for(let i=0;i<6;i++){
    const x=Math.random()*W,h=20+Math.random()*60;
    const y=Math.random()*(H-h);
    const grd=g.createLinearGradient(x,y,x+3,y);
    grd.addColorStop(0,'rgba(70,30,15,0)');
    grd.addColorStop(.5,'rgba(70,30,15,0.55)');
    grd.addColorStop(1,'rgba(70,30,15,0)');
    g.fillStyle=grd;g.fillRect(x-1,y,3,h);
  }
  // Faded paint scuffs
  for(let i=0;i<8;i++){
    const x=Math.random()*W,y=Math.random()*H,r=4+Math.random()*8;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba(255,255,255,0.18)');
    grd.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=grd;g.fillRect(x-r,y-r,r*2,r*2);
  }
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.anisotropy=4;t.needsUpdate=true;
  return t;
}

// Realistic shipping-container palette — 7 weathered tones picked to read
// against the dark-concrete + sodium-lamp scene.
const _P47_CONTAINER_COLORS=[
  [0.62,0.28,0.16],   // rust-orange
  [0.18,0.32,0.50],   // faded blue
  [0.22,0.42,0.30],   // weathered green
  [0.45,0.18,0.20],   // dark red
  [0.42,0.42,0.40],   // industrial grey
  [0.55,0.45,0.20],   // dirty mustard
  [0.30,0.30,0.36]    // dark slate
];

function _p47BuildContainers(){
  const mob=window._isMobile;
  // Container Run: tight single-stack rows along t in [0.0, 0.25]
  const RUN_COUNT=mob?14:24;
  // The Yard: scattered mixed-stack clusters along t in [0.25, 0.5]
  const YARD_CLUSTERS=mob?6:10;
  const YARD_PER_CLUSTER=mob?3:5;
  const TOTAL=RUN_COUNT+YARD_CLUSTERS*YARD_PER_CLUSTER*(mob?1:1.6)|0;
  // Shared geo + mat — one InstancedMesh for all containers.
  const tex=_p47ContainerTex();
  const cGeo=new THREE.BoxGeometry(12,2.6,2.4);
  const cMat=new THREE.MeshLambertMaterial({color:0xffffff,map:tex});
  const im=new THREE.InstancedMesh(cGeo,cMat,TOTAL);
  // Allocate per-instance colour buffer.
  im.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(TOTAL*3),3);
  const dummy=new THREE.Object3D();
  let idx=0;
  // ── Container Run rows (sector 1) ──────────────────────────────────────
  for(let i=0;i<RUN_COUNT;i++){
    const t=0.005+(i/RUN_COUNT)*0.235;  // span t [0.005..0.24]
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const ang=Math.atan2(tg.x,tg.z);
    [-1,1].forEach(side=>{
      // Skip the inner side every other position so the run reads as
      // alternating gaps — gives a less-wall-like feel + lets headlights
      // sweep through.
      if(side<0 && i%2===0)return;
      if(idx>=TOTAL)return;
      const off=BARRIER_OFF+3.5+Math.random()*1.5;
      const cx=p.x+nr.x*side*off;
      const cz=p.z+nr.z*side*off;
      // Single layer in the run — neat row, no stacking
      dummy.position.set(cx,1.3,cz);
      dummy.rotation.set(0,ang,0);
      const sc=0.95+Math.random()*0.15;
      dummy.scale.set(sc,1,1);
      dummy.updateMatrix();
      im.setMatrixAt(idx,dummy.matrix);
      const col=_P47_CONTAINER_COLORS[(Math.random()*_P47_CONTAINER_COLORS.length)|0];
      im.instanceColor.setXYZ(idx,col[0],col[1],col[2]);
      idx++;
    });
  }
  // ── The Yard clusters (sector 2) — mixed orientation, 1-3 high ────────
  for(let cI=0;cI<YARD_CLUSTERS;cI++){
    const t=0.26+(cI/YARD_CLUSTERS)*0.24;  // span t [0.26..0.50]
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=(cI%2===0)?1:-1;
    const clusterOff=BARRIER_OFF+8+Math.random()*5;
    const cBaseX=p.x+nr.x*side*clusterOff;
    const cBaseZ=p.z+nr.z*side*clusterOff;
    // Cluster orientation: 70% aligned-to-track, 30% rotated 90°
    const clusterAng=Math.random()<0.7?Math.atan2(tg.x,tg.z):Math.atan2(tg.x,tg.z)+Math.PI/2;
    for(let k=0;k<YARD_PER_CLUSTER;k++){
      if(idx>=TOTAL)return;
      // Stack height — 1, 2, or 3 high (mobile capped at 2)
      const stack=mob? (Math.random()<0.6?1:2) : (Math.random()<0.4?1:Math.random()<0.7?2:3);
      // Each cluster member is a small 2D-grid cell within ~6×6 around base
      const localX=(Math.random()-0.5)*6;
      const localZ=(Math.random()-0.5)*6;
      // Rotate offset by cluster angle
      const cosA=Math.cos(clusterAng),sinA=Math.sin(clusterAng);
      const cx=cBaseX+localX*cosA-localZ*sinA;
      const cz=cBaseZ+localX*sinA+localZ*cosA;
      for(let s=0;s<stack;s++){
        if(idx>=TOTAL)return;
        dummy.position.set(cx,1.3+s*2.65,cz);
        // Each member's own minor angle jitter
        dummy.rotation.set(0,clusterAng+(Math.random()-0.5)*0.15,0);
        dummy.scale.set(1,1,1);
        dummy.updateMatrix();
        im.setMatrixAt(idx,dummy.matrix);
        const col=_P47_CONTAINER_COLORS[(Math.random()*_P47_CONTAINER_COLORS.length)|0];
        im.instanceColor.setXYZ(idx,col[0],col[1],col[2]);
        idx++;
      }
    }
  }
  // Final count — pack the IM so disposeScene's traversal doesn't render
  // empty trailing instances. Three.js InstancedMesh.count caps the draw.
  im.count=idx;
  im.instanceMatrix.needsUpdate=true;
  if(im.instanceColor)im.instanceColor.needsUpdate=true;
  scene.add(im);
}

// ── Warehouse (loods) at WP9 90° right ───────────────────────────────────
//
// Large industrial warehouse silhouetted at the end of the warehouse
// straight (sector 3 → sector 4 transition). Single-mesh corrugated-metal
// box with a slight roof pitch. Positioned just outside the BARRIER_OFF
// at the inside of the 90° right turn so it dominates the player's
// approach view through sector 3.
//
// Geometry: simple BoxGeometry with the corrugation texture from
// _p47ContainerTex (re-used — same vertical-line corrugation works
// for warehouse cladding). Roof = thin Box on top with darker tint.
function _p47BuildWarehouse(){
  // Place at WP9 (t = 8/12 ≈ 0.667) — the 90° right corner. Anchor
  // the warehouse on the INSIDE of the corner (right side of travel
  // direction = nr * +1).
  const t=0.665;
  const p=trackCurve.getPoint(t);
  const tg=trackCurve.getTangent(t).normalize();
  const nr=new THREE.Vector3(-tg.z,0,tg.x);
  const side=1; // inside of the 90° right
  const off=BARRIER_OFF+18;
  const cx=p.x+nr.x*side*off;
  const cz=p.z+nr.z*side*off;
  const ang=Math.atan2(tg.x,tg.z);
  // Body — 30 × 8 × 18 (length × height × depth)
  const tex=_p47ContainerTex();
  const bodyMat=new THREE.MeshLambertMaterial({color:0x4a463e,map:tex});
  const body=new THREE.Mesh(new THREE.BoxGeometry(30,8,18),bodyMat);
  body.position.set(cx,4,cz);
  body.rotation.y=ang;
  scene.add(body);
  // Roof — slightly larger, darker, sits 8u above ground
  const roof=new THREE.Mesh(
    new THREE.BoxGeometry(31,0.6,19),
    new THREE.MeshLambertMaterial({color:0x2a2820})
  );
  roof.position.set(cx,8.3,cz);
  roof.rotation.y=ang;
  scene.add(roof);
  // Loading dock — a smaller box jutting out toward the track at ground level
  const dockGeo=new THREE.BoxGeometry(10,1.4,2);
  const dockMat=new THREE.MeshLambertMaterial({color:0x3a3530});
  const dock=new THREE.Mesh(dockGeo,dockMat);
  dock.position.set(
    cx-nr.x*side*(18*0.5+1),
    0.7,
    cz-nr.z*side*(18*0.5+1)
  );
  dock.rotation.y=ang;
  scene.add(dock);
  // Two warm-yellow window strips on the body (large industrial windows
  // glowing softly through the night — light shining from inside).
  // Emissive box overlays — placed on the side facing the track.
  const winMat=new THREE.MeshBasicMaterial({color:0xffcc77});
  for(const wx of [-9,9]){
    const win=new THREE.Mesh(new THREE.BoxGeometry(6,1.6,0.1),winMat);
    // Position on the long face nearest the track (perp to ang)
    win.position.set(
      cx-nr.x*side*(18*0.5+0.06)+Math.cos(ang)*wx,
      4.5,
      cz-nr.z*side*(18*0.5+0.06)+Math.sin(ang)*wx
    );
    win.rotation.y=ang;
    scene.add(win);
  }
}

// ── Cranes on the kade (gantry cranes) ───────────────────────────────────
//
// Tall industrial gantry cranes towering over the kade-strook (sector 5).
// 2 cranes desktop / 1 mobile. Each crane is a mini-rig of:
//   • 2 vertical legs (BoxGeometry posts) — splayed at base, narrow at top
//   • 1 horizontal beam connecting the tops
//   • 1 short cable + hook hanging from the beam centre
// Steel-grey weathered material; legs share BoxGeometry, beam its own.
//
// Positioned at fixed t-values along sector 5 ([0.85, 0.95]) on the OUTER
// side (kade edge, away from the track) so they read as silhouettes against
// the city-glow horizon when the player sweeps past.
function _p47BuildCranes(){
  const mob=window._isMobile;
  const cranes=mob?[0.91]:[0.86,0.94];
  const steelMat=new THREE.MeshLambertMaterial({color:0x4a4a52});
  const beamMat=new THREE.MeshLambertMaterial({color:0x3a3a42});
  const cableMat=new THREE.MeshLambertMaterial({color:0x1a1a1a});
  const hookMat=new THREE.MeshLambertMaterial({color:0x6a6a72});
  cranes.forEach(t=>{
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const nr=new THREE.Vector3(-tg.z,0,tg.x);
    const side=-1; // outer side of sector-5 right-sweep = kade edge
    const off=BARRIER_OFF+12;
    const cx=p.x+nr.x*side*off;
    const cz=p.z+nr.z*side*off;
    const ang=Math.atan2(tg.x,tg.z);
    // Crane geometry: legs 28u tall, 14u apart at base, 6u apart at top.
    // We approximate splay by translating two slightly-rotated post boxes.
    const legSpread=14;
    for(const lx of [-legSpread*0.5, legSpread*0.5]){
      const leg=new THREE.Mesh(new THREE.BoxGeometry(0.8,28,0.8),steelMat);
      // Position legs along the cross-track axis (perp to tg)
      leg.position.set(
        cx+nr.x*side*0+Math.cos(ang)*lx,
        14,
        cz+nr.z*side*0+Math.sin(ang)*lx
      );
      // Subtle splay — tilt outward at the base via rotation
      leg.rotation.y=ang;
      leg.rotation.z=lx>0?-0.04:0.04;
      scene.add(leg);
    }
    // Top beam — 18u wide, sits above the legs
    const beam=new THREE.Mesh(new THREE.BoxGeometry(18,1.2,1.2),beamMat);
    beam.position.set(cx,28,cz);
    beam.rotation.y=ang;
    scene.add(beam);
    // Cable from beam centre, ~12u long (hangs into kade space)
    const cable=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,12,4),cableMat);
    cable.position.set(cx,22,cz);
    scene.add(cable);
    // Hook block at end of cable
    const hook=new THREE.Mesh(new THREE.BoxGeometry(1.4,1.0,1.4),hookMat);
    hook.position.set(cx,16,cz);
    scene.add(hook);
    // Counterweight blob on top — reads as the trolley/winch housing
    const trolley=new THREE.Mesh(new THREE.BoxGeometry(2.4,1.2,2.0),beamMat);
    trolley.position.set(cx,29,cz);
    trolley.rotation.y=ang;
    scene.add(trolley);
    // Dim red obstruction-warning light on top — emissive small cube
    const warnMat=new THREE.MeshBasicMaterial({color:0xff2030});
    const warn=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.6,0.6),warnMat);
    warn.position.set(cx,29.9,cz);
    scene.add(warn);
  });
}

// ── Ophaalbrug (drawbridge) at sector 4 ──────────────────────────────────
//
// Static drawbridge straddling a fictional canal between the warehouse
// half and the kade half of the harbour. Sessie 2 keeps it static — no
// bascule animation. Visual frame-style construction:
//   • Two tall towers flanking the track (4 corner posts each + lattice
//     crossbeams via single-mesh BoxGeometry simplified frames)
//   • Horizontal upper beam connecting the tower tops
//   • Two angled tension cables (tower-top to bridge-deck-edge) — these
//     are the visual signal of "drawbridge"
//   • A small control booth halfway up one tower
// Anchored at t≈0.74 (sector 4 mid). Track ribbon passes through; no
// separate deck mesh needed (the track is already there).
//
// Saved into _p47Bridge for future sessie-3 animation hooks. Sessie 1's
// state declaration block already has this slot; cleanup via scene.js
// per-world array reset.
function _p47BuildOphaalbrug(){
  const t=0.74;
  const p=trackCurve.getPoint(t);
  const tg=trackCurve.getTangent(t).normalize();
  const nr=new THREE.Vector3(-tg.z,0,tg.x);
  const ang=Math.atan2(tg.x,tg.z);
  // Tower spacing — left/right of track at +/-1 side
  const TOWER_HALF=BARRIER_OFF+3;   // from track centerline
  const TOWER_H=22;
  const TOWER_W=2.2;
  const TOWER_D=2.2;
  // Group the bridge so future sessie-3 animation can rotate the whole
  // assembly together. _p47Bridge stores the THREE.Group ref.
  const grp=new THREE.Group();
  const towerMat=new THREE.MeshLambertMaterial({color:0x3a3a40});
  const beamMat=new THREE.MeshLambertMaterial({color:0x2a2a30});
  const cableMat=new THREE.MeshLambertMaterial({color:0x1a1a1a});
  const boothMat=new THREE.MeshLambertMaterial({color:0x55452a});
  const winMat=new THREE.MeshBasicMaterial({color:0xffcc77});
  // Two towers — one each side of the track
  for(const side of [-1,1]){
    const tx=p.x+nr.x*side*TOWER_HALF;
    const tz=p.z+nr.z*side*TOWER_HALF;
    // Outer shell — single hollow-feeling tower box
    const tower=new THREE.Mesh(
      new THREE.BoxGeometry(TOWER_W,TOWER_H,TOWER_D),
      towerMat
    );
    tower.position.set(tx,TOWER_H*0.5,tz);
    tower.rotation.y=ang;
    grp.add(tower);
    // Lattice cross-bracing — two diagonal ribs on the visible face
    for(const yC of [TOWER_H*0.35, TOWER_H*0.7]){
      const brace=new THREE.Mesh(
        new THREE.BoxGeometry(0.3,3.5,0.3),
        beamMat
      );
      brace.position.set(tx,yC,tz);
      brace.rotation.set(0,ang,Math.PI*0.18);
      grp.add(brace);
    }
    // Cap on top — slightly wider, darker
    const cap=new THREE.Mesh(
      new THREE.BoxGeometry(TOWER_W*1.25,0.8,TOWER_D*1.25),
      beamMat
    );
    cap.position.set(tx,TOWER_H+0.4,tz);
    cap.rotation.y=ang;
    grp.add(cap);
  }
  // Horizontal upper beam connecting the two towers — sits just under
  // the tower caps. Length spans across the track.
  const beamLen=TOWER_HALF*2;
  const upperBeam=new THREE.Mesh(
    new THREE.BoxGeometry(0.9,1.3,beamLen),
    beamMat
  );
  // Position at track center, height = TOWER_H, oriented along nr (cross-track)
  upperBeam.position.set(p.x,TOWER_H,p.z);
  upperBeam.rotation.y=ang+Math.PI/2;  // box's z-axis aligns with nr
  grp.add(upperBeam);
  // Tension cables — 4 diagonal cables from tower tops to track-deck
  // edges. Each cable is a thin cylinder. Length picked to span from
  // tower top (TOWER_H, side*TOWER_HALF) down to track edge (~0u, side*TW).
  for(const side of [-1,1]){
    for(const along of [-1,1]){
      const topX=p.x+nr.x*side*TOWER_HALF;
      const topY=TOWER_H-0.5;
      const topZ=p.z+nr.z*side*TOWER_HALF;
      // Cable end at track edge along the t-axis (+/- 4u from anchor)
      const cosA=Math.cos(ang),sinA=Math.sin(ang);
      const endX=p.x+nr.x*side*(TW+1)+cosA*along*4;
      const endY=0.4;
      const endZ=p.z+nr.z*side*(TW+1)+sinA*along*4;
      // Build a cylinder oriented from top → end
      const dx=endX-topX, dy=endY-topY, dz=endZ-topZ;
      const len=Math.hypot(dx,dy,dz);
      const cable=new THREE.Mesh(
        new THREE.CylinderGeometry(0.06,0.06,len,4),
        cableMat
      );
      // Position at midpoint, orient via lookAt
      cable.position.set((topX+endX)*0.5,(topY+endY)*0.5,(topZ+endZ)*0.5);
      // CylinderGeometry's long axis is +Y by default; need to align with
      // (dx,dy,dz). Use quaternion from default Y to target dir.
      const dir=new THREE.Vector3(dx,dy,dz).normalize();
      const q=new THREE.Quaternion();
      q.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
      cable.quaternion.copy(q);
      grp.add(cable);
    }
  }
  // Control booth on the +1 side, mid-height. Tiny box with a glowing
  // amber window.
  const sideB=1;
  const boothX=p.x+nr.x*sideB*(TOWER_HALF+1.6);
  const boothY=11;
  const boothZ=p.z+nr.z*sideB*(TOWER_HALF+1.6);
  const booth=new THREE.Mesh(new THREE.BoxGeometry(2.8,2.2,2.0),boothMat);
  booth.position.set(boothX,boothY,boothZ);
  booth.rotation.y=ang;
  grp.add(booth);
  // Booth window — track-facing side, emissive amber
  const winOff=-nr.x*sideB*1.06;
  const winOffZ=-nr.z*sideB*1.06;
  const win=new THREE.Mesh(new THREE.BoxGeometry(1.8,1.0,0.06),winMat);
  win.position.set(boothX+winOff,boothY+0.3,boothZ+winOffZ);
  win.rotation.y=ang;
  grp.add(win);
  // Two red obstruction-warning lights on the upper beam ends — small
  // emissive cubes. Match the crane warning lights for visual consistency.
  const warnMat=new THREE.MeshBasicMaterial({color:0xff2030});
  for(const side of [-1,1]){
    const wx=p.x+nr.x*side*(TOWER_HALF-0.8);
    const wz=p.z+nr.z*side*(TOWER_HALF-0.8);
    const warn=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.5),warnMat);
    warn.position.set(wx,TOWER_H+0.9,wz);
    grp.add(warn);
  }
  scene.add(grp);
  _p47Bridge=grp;
}

// ── Drizzle particle pool (motregen) ─────────────────────────────────────
//
// 3D depth-tested rain streaks orbiting the player. Combined with the
// shared canvas-rain overlay (already on at 0.6 intensity from buildPier47-
// Environment), the world reads as actual volumetric motregen instead of
// a flat-canvas-overlay-on-top-of-3D-scene.
//
// Particle pool is centred on the player; positions wrap in updatePier47-
// World as the camera moves so the rain follows. Each particle has a
// per-instance vertical velocity baked in via the position.y accumulation
// in the update loop.
//
// Material is a PointsMaterial with sizeAttenuation OFF so streaks look
// uniform at any distance (real rain doesn't become invisible far away —
// it becomes a haze, which the canvas overlay supplies). Color is a
// cool desaturated blue-grey (#9aa6b8) at low opacity (0.45) — visible
// against the dark sky but doesn't compete with the sodium lamps.
function _p47BuildDrizzle(){
  const N=window._isMobile?180:340;
  const geo=new THREE.BufferGeometry();
  const pos=new Float32Array(N*3);
  // Initial random positions inside a 220×30×220 volume around origin.
  // updatePier47World re-parents positions to follow the player.
  for(let i=0;i<N;i++){
    pos[i*3]  =(Math.random()-0.5)*220;
    pos[i*3+1]=Math.random()*30;
    pos[i*3+2]=(Math.random()-0.5)*220;
  }
  geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  const mat=new THREE.PointsMaterial({
    color:0x9aa6b8,
    size:0.95,
    transparent:true,
    opacity:0.45,
    sizeAttenuation:false,    // uniform streak size at all distances
    depthWrite:false           // don't occlude transparent fog/lights behind
  });
  _p47Drizzle=new THREE.Points(geo,mat);
  scene.add(_p47Drizzle);
  _p47DrizzleGeo=geo;
}

// ── Main environment builder ──────────────────────────────────────────────
//
// Sessie 3 expansion (cumulative):
//   1. Concrete kade ground (sessie-1)
//   2. Day-lighting (sessie-1)
//   3. Barriers + start line (sessie-1)
//   4. Sodium lamp poles along the kade (sessie-2 commit 1)
//   5. Containers in Container Run + The Yard (sessie-2 commit 2)
//   6. Warehouse at sector 3 → 4 corner (sessie-2 commit 2)
//   7. Cranes on the kade (sessie-2 commit 2)
//   8. Ophaalbrug at sector 4 (sessie-2 commit 3)
//   9. Wet-asphalt material swap in track.js (sessie-2 commit 3)
//  10. Headlights + sparse always-off stars (sessie-1)
//  11. Motregen default + drizzle particle pool (sessie-3 commit 1 — NEW)
function buildPier47Environment(){
  // Pier 47 default weather = motregen (sessie 3). Unlike sandstorm which
  // clears any inherited rain, pier47 LEANS INTO it: rain on, intensity
  // capped at 0.6 (drizzle, not pouring). The shared updateWeather() lerp
  // smoothly settles _rainIntensity toward _rainTarget — we set both to
  // 0.6 here so the canvas-rain visual is at motregen level immediately,
  // not a 1-second fade-up. _p47BuildDrizzle() spawns the additional
  // depth-tested 3D drizzle streaks (more atmospheric than canvas alone).
  if(typeof isRain!=='undefined'){
    isRain=true;
    if(typeof _rainTarget!=='undefined')_rainTarget=0.6;
    if(typeof _rainIntensity!=='undefined')_rainIntensity=0.6;
    if(rainCanvas){rainCanvas.style.display='block';rainCanvas.style.opacity='0.6';}
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
  // Industrial props (sessie 2 commit 2):
  //   • Containers — sectors 1 + 2 (Container Run + The Yard)
  //   • Warehouse — sector 3 / 4 corner (loods at WP9 90° right)
  //   • Cranes — sector 5 (kade edge, outer side)
  _p47BuildContainers();
  _p47BuildWarehouse();
  _p47BuildCranes();
  _p47BuildOphaalbrug();
  // Sessie 3 atmosphere: drizzle-particle pool gives depth-tested rain
  // streaks in 3D (the canvas rain is a flat overlay; combining both
  // reads as actual volumetric motregen). Plassen + stoom land separately.
  _p47BuildDrizzle();
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
  const t=_nowSec;
  // Sodium-lamp emissive flicker — one mat-mutation drives all instances
  // sharing the head material.
  for(let i=0;i<_p47LampEmissives.length;i++){
    const e=_p47LampEmissives[i];
    if(!e||!e.mat)continue;
    const v=Math.sin(t*1.7+e.phase);
    e.mat.emissiveIntensity=1.4+v*0.18;
  }
  // Drizzle particle pool — 3D depth-tested rain streaks. Particles fall
  // straight down at ~12u/s with a slight wind-drift on X (motregen often
  // has a horizontal component from harbour wind). When a particle drops
  // below ground OR drifts > 130u from the player it respawns above the
  // player at random X/Z within the active volume — the pool effectively
  // tracks the player without per-frame allocations.
  if(_p47DrizzleGeo){
    const car=carObjs&&carObjs[playerIdx];
    const cx=car?car.mesh.position.x:0;
    const cz=car?car.mesh.position.z:0;
    const arr=_p47DrizzleGeo.attributes.position.array;
    const n=arr.length/3|0;
    // Rolling-buffer update — process ~60/frame so a 340-particle pool
    // recycles fully every ~6 frames at 60fps. Mirrors the volcano-ember
    // / sandstorm-fleck pattern.
    const step=(Math.floor(t*40)*60)%n;
    const end=Math.min(step+60,n);
    for(let i=step;i<end;i++){
      // Rain velocity — ~12u/s downward + ~2u/s horizontal drift
      arr[i*3]   += dt*2.0;
      arr[i*3+1] -= dt*12.0;
      // Respawn condition: hit ground OR drifted outside follow-volume
      if(arr[i*3+1]<-0.5
         || arr[i*3]   > cx+130 || arr[i*3]   < cx-130
         || arr[i*3+2] > cz+130 || arr[i*3+2] < cz-130){
        arr[i*3]   = cx + (Math.random()-0.5)*220;
        arr[i*3+1] = 22 + Math.random()*10;
        arr[i*3+2] = cz + (Math.random()-0.5)*220;
      }
    }
    _p47DrizzleGeo.attributes.position.needsUpdate=true;
  }
}
