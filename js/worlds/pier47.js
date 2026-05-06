// js/worlds/pier47.js — Pier 47 (industrial harbour by night) world builders.
// Non-module script. Sessie 1 = bones only: file scaffold + track-waypoint
// reference + skybox + cinematic dark lighting + minimal environment.
// Containers / kranen / loods / ophaalbrug / wet rendering / lamp poles
// arrive in sessie 2. Plassen / regen / mist / stoom particles in sessie 3.
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

// Single source of truth for Pier 47 day lighting. Mirrors the sandstorm /
// candy / volcano helper pattern. buildPier47Environment + night.js's
// pier47-day branch share the same constants, so the build-time setup and
// the night→day toggle-restore can never drift.
//
// "Day" for Pier 47 is intentionally NOT a sunny morning — it's a bewolkte,
// dreigende nacht. Sessie 3 will introduce a separate "ochtend"-mode for
// the day-toggle. For sessie 1 the toggle is a small ambient shift.
//
// Goal palette (overcast night, no sodium-lamp warmth yet — that's sessie 2):
//   sun     #d8d0c0 / 1.4 desktop / 0.9 mobile / position (60, 110, 80)
//   ambient #1a1a22 / 0.30
//   hemi sky #a0a8b0 / ground #403838 / 0.5
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
  hemiLight.groundColor.setHex(0x403838);
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

// ── Main environment builder ──────────────────────────────────────────────
//
// Sessie 1 keeps this MINIMAL: ground plane, day-lighting helper, barriers,
// start line, headlights + tail-light placeholders, sparse stars (always-off
// — no city stars visible). No props, no containers, no kranen, no loods.
// Those land in sessie 2.
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

// (Sessie 2 will add updatePier47World here for animated water shimmer
//  on plassen, ophaalbrug movement, etc. Sessie 1 has no per-frame world
//  update so loop.js does not call into this file — no wiring needed yet.)
