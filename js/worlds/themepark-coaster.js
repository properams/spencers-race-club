// js/worlds/themepark-coaster.js — collapsing overhead coaster bridge in themepark world.
// Non-module script. Loads BEFORE worlds/themepark.js so its build/update
// functions are visible when themepark.js calls them.
//
// Lifecycle:
//   buildThemeparkCoaster()                — called from buildThemeparkEnvironment()
//   updateThemeparkCoaster(dt, currentLap) — called from updateThemeparkWorld(dt)
//   disposeThemeparkCoaster()              — called from _resetRaceState()
//
// Variant on the volcano-bridge pivot architecture: an OVERHEAD rail bridge
// at y=14 over the track, with two static supports per segment going down
// to ground (the supports do NOT pivot — they just provide the visual
// context that this is overhead infrastructure). Rail segments use the
// same nested Group pivot pair (outer=yaw, inner=tilt around local Z).
//
// Lap-progressive states:
//   lap 1 → solid coaster, rails-emissive pulses with show-tempo
//   lap 2 → emergency-strobe red on supports, rails warm to orange (1.0s)
//   lap 3 → alternating rail segments tilt 25° downward + spark emissive
//           boost on broken edges (1.5s ease-in-quad)
//
// Track range: t in [_COASTER_T_START, _COASTER_T_END] — clear of carousel
// at t=0.28 (offset 50 sideways), coasters at t=0.45/0.88 (offset 62), and
// circus tents at t=0.08/0.33 (offset 42). Overhead at y=14 doesn't visually
// conflict with side-of-track decor.

'use strict';

const _COASTER_T_START=0.20;
const _COASTER_T_END=0.30;
const _COASTER_SEGMENTS=8;
const _COASTER_DECK_W=14;
const _COASTER_DECK_L=4;
const _COASTER_DECK_H=0.5;
const _COASTER_RAIL_R=0.15;
const _COASTER_SUPPORT_R=0.4;
const _COASTER_OVERHEAD_Y=14;
const _COASTER_TILT_RAD=25*Math.PI/180;
const _COASTER_STROBE_DURATION=1.0; // seconds for strobe-progress 0→1
const _COASTER_TILT_DURATION=1.5;   // seconds for tilt-progress 0→1
// Rails color lerp endpoints (cool red metal → glowing orange under stress).
const _COASTER_RAIL_R0=0xee/255, _COASTER_RAIL_G0=0x22/255, _COASTER_RAIL_B0=0x44/255;
const _COASTER_RAIL_R1=0xee/255, _COASTER_RAIL_G1=0x66/255, _COASTER_RAIL_B1=0x22/255;

let _themeparkCoasterSegs=[];   // [{outer, inner, deck, railA, railB, side, index}]
let _themeparkCoasterSupports=[]; // [{mesh}] — static, not pivoted
let _themeparkCoasterState=null;

function buildThemeparkCoaster(){
  if(typeof scene==='undefined'||!scene||typeof trackCurve==='undefined'||!trackCurve)return;
  // Idempotency guard.
  disposeThemeparkCoaster();
  const mobile=(typeof _isMobile!=='undefined'&&_isMobile);
  const segCount=(typeof _mobCount==='function')?_mobCount(_COASTER_SEGMENTS):_COASTER_SEGMENTS;
  // Shared geometries — one buffer each, reused across all 8 segments.
  const deckGeo=new THREE.BoxGeometry(_COASTER_DECK_W,_COASTER_DECK_H,_COASTER_DECK_L);
  const railGeo=new THREE.CylinderGeometry(_COASTER_RAIL_R,_COASTER_RAIL_R,_COASTER_DECK_W,5);
  const supportGeo=mobile?null:new THREE.CylinderGeometry(_COASTER_SUPPORT_R,_COASTER_SUPPORT_R*1.4,_COASTER_OVERHEAD_Y,5);
  // Per-segment cloned material (rails) so emissive can pulse independently.
  const railMatProto=new THREE.MeshLambertMaterial({color:0xee2244,emissive:0x441111,emissiveIntensity:.2});
  // Static supports use a SHARED material (no per-pole pulse needed — they strobe in lockstep).
  const supportMat=mobile?null:new THREE.MeshLambertMaterial({color:0x441122,emissive:0x110005,emissiveIntensity:.2});
  for(let i=0;i<segCount;i++){
    const t=_COASTER_T_START+(i+.5)*((_COASTER_T_END-_COASTER_T_START)/segCount);
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const yaw=Math.atan2(tg.x,tg.z);
    // Checkerboard side pattern — same as Volcano.
    const side=(i%4<2)?1:-1;
    const lxX=Math.cos(yaw),lxZ=-Math.sin(yaw);
    const outer=new THREE.Group();
    outer.position.set(p.x+side*(_COASTER_DECK_W*.5)*lxX, _COASTER_OVERHEAD_Y, p.z+side*(_COASTER_DECK_W*.5)*lxZ);
    outer.rotation.y=yaw;
    const inner=new THREE.Group();
    outer.add(inner);
    // Deck (rail-bed) — share material with rails so the per-segment pulse is unified.
    const railMat=railMatProto.clone();
    const deck=new THREE.Mesh(deckGeo,railMat);
    deck.position.x=-side*(_COASTER_DECK_W*.5);
    inner.add(deck);
    // Two thin rails on top of the deck — child of inner so they tilt with it.
    const railA=new THREE.Mesh(railGeo,railMat);
    railA.rotation.z=Math.PI/2; // align cylinder along local X (deck width axis)
    railA.position.set(-side*(_COASTER_DECK_W*.5),_COASTER_DECK_H*.5+_COASTER_RAIL_R, _COASTER_DECK_L*.35);
    inner.add(railA);
    const railB=new THREE.Mesh(railGeo,railMat);
    railB.rotation.z=Math.PI/2;
    railB.position.set(-side*(_COASTER_DECK_W*.5),_COASTER_DECK_H*.5+_COASTER_RAIL_R,-_COASTER_DECK_L*.35);
    inner.add(railB);
    scene.add(outer);
    _themeparkCoasterSegs.push({outer:outer,inner:inner,deck:deck,railA:railA,railB:railB,side:side,index:i});
    // Static supports (skip on mobile — visual richness only).
    if(!mobile){
      const supA=new THREE.Mesh(supportGeo,supportMat);
      supA.position.set(p.x+lxX*(_COASTER_DECK_W*.4)*side, _COASTER_OVERHEAD_Y*.5, p.z+lxZ*(_COASTER_DECK_W*.4)*side);
      scene.add(supA);
      _themeparkCoasterSupports.push({mesh:supA});
      const supB=new THREE.Mesh(supportGeo,supportMat);
      supB.position.set(p.x-lxX*(_COASTER_DECK_W*.4)*side, _COASTER_OVERHEAD_Y*.5, p.z-lxZ*(_COASTER_DECK_W*.4)*side);
      scene.add(supB);
      _themeparkCoasterSupports.push({mesh:supB});
    }
  }
  railMatProto.dispose();
  _themeparkCoasterState={strobeStartT:-1,tiltStartT:-1};
}

function updateThemeparkCoaster(dt,currentLap){
  if(!_themeparkCoasterState)return;
  const st=_themeparkCoasterState;
  const t=(typeof _nowSec==='number')?_nowSec:0;
  // Lap-edge detection with reset-on-rewind.
  if(currentLap>=2&&st.strobeStartT<0)st.strobeStartT=t;
  else if(currentLap<2)st.strobeStartT=-1;
  if(currentLap>=3&&st.tiltStartT<0)st.tiltStartT=t;
  else if(currentLap<3)st.tiltStartT=-1;
  const strobeProgress=(st.strobeStartT>=0)?Math.min(1,(t-st.strobeStartT)/_COASTER_STROBE_DURATION):0;
  const tiltProgress=(st.tiltStartT>=0)?Math.min(1,(t-st.tiltStartT)/_COASTER_TILT_DURATION):0;
  const tiltEased=tiltProgress*tiltProgress;
  // Pre-compute per-frame color lerp (rails warm to orange on lap 2).
  const colR=_COASTER_RAIL_R0+(_COASTER_RAIL_R1-_COASTER_RAIL_R0)*strobeProgress;
  const colG=_COASTER_RAIL_G0+(_COASTER_RAIL_G1-_COASTER_RAIL_G0)*strobeProgress;
  const colB=_COASTER_RAIL_B0+(_COASTER_RAIL_B1-_COASTER_RAIL_B0)*strobeProgress;
  // Strobe rate triples on lap 2 — pre-compute once.
  const strobeRate=2.0+strobeProgress*4.0;
  for(let i=0;i<_themeparkCoasterSegs.length;i++){
    const seg=_themeparkCoasterSegs[i];
    if(seg.deck&&seg.deck.material){
      const m=seg.deck.material;
      // Show-tempo pulse on lap 1, faster strobe on lap 2.
      // Spark emissive boost on tilt: even-indexed broken segments get extra glow.
      const sparkBoost=(i%2===0)?tiltEased*0.4:0;
      m.emissiveIntensity=0.2+0.2*Math.sin(t*strobeRate+i)+sparkBoost;
      m.color.setRGB(colR,colG,colB);
    }
    // Tilt: only even-indexed segments swing down. Sign matches Volcano's
    // outward fall pattern.
    if(seg.inner&&i%2===0){
      seg.inner.rotation.z=-seg.side*_COASTER_TILT_RAD*tiltEased;
    }
  }
  // Static supports: red strobe pulse on lap 2 (in lockstep, shared material).
  if(_themeparkCoasterSupports.length>0&&_themeparkCoasterSupports[0].mesh.material){
    const supMat=_themeparkCoasterSupports[0].mesh.material;
    supMat.emissiveIntensity=0.2+strobeProgress*(0.5+0.4*Math.sin(t*strobeRate*1.5));
  }
}

function disposeThemeparkCoaster(){
  // Scene-traversal in disposeScene() handles geometry/material cleanup.
  _themeparkCoasterSegs.length=0;
  _themeparkCoasterSupports.length=0;
  _themeparkCoasterState=null;
  // Release the night.js sky-cache (day + night skybox + PMREM env).
  if(typeof _disposeThemeparkSkyCache==='function')_disposeThemeparkSkyCache();
}
