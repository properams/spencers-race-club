// js/worlds/volcano-bridge.js — collapsing lava bridge in volcano world.
// Non-module script. Loads BEFORE worlds/volcano.js so its build/update
// functions are visible when volcano.js calls them.
//
// Lifecycle:
//   buildVolcanoBridge()                — called from buildVolcanoEnvironment()
//   updateVolcanoBridge(dt, currentLap) — called from updateVolcanoWorld(dt)
//   disposeVolcanoBridge()              — called from _resetRaceState()
//
// Pivot architecture: each segment is a nested Group pair.
//   outerGrp  — positioned at the pivot edge of the deck, rotation.y = track yaw
//   innerGrp  — child of outerGrp, holds the tilt around its local Z (= track
//               tangent direction, because outerGrp is already yaw-rotated).
// The deck mesh is offset inside innerGrp by -side*PANEL_W/2 along local X
// so the deck appears centered on the track when innerGrp has zero rotation.
// Tilting innerGrp around local Z swings the deck down from its outer edge.
//
// Lap-progressive states (driven from currentLap argument, not callbacks —
// idempotent so a mid-race pause/resume can't desync the visuals):
//   lap 1 → cool deck, gentle lava-pool pulse
//   lap 2 → cracks glow on the deck, lava-pool runs hotter
//   lap 3 → alternating segments tilt 35° away (ease-in-quad over ~1.5s),
//           lava-pool peaks
//
// Track range: t ∈ [_BRIDGE_T_START, _BRIDGE_T_END]. Move these to relocate.

'use strict';

const _BRIDGE_T_START=0.42;
const _BRIDGE_T_END=0.54;
const _BRIDGE_SEGMENTS=8;
const _BRIDGE_PANEL_W=18;
const _BRIDGE_PANEL_L=6;
const _BRIDGE_PANEL_H=0.5;
const _BRIDGE_TILT_RAD=35*Math.PI/180;

let _volcanoBridgeSegs=[];   // [{outer, inner, mesh, side, index}]
let _volcanoBridgeLava=null;
let _volcanoBridgeState=null;

function buildVolcanoBridge(){
  if(typeof scene==='undefined'||!scene||typeof trackCurve==='undefined'||!trackCurve)return;
  // ── Lava pool under the bridge ──
  {
    const tMid=(_BRIDGE_T_START+_BRIDGE_T_END)*.5;
    const pMid=trackCurve.getPoint(tMid);
    const tg=trackCurve.getTangent(tMid).normalize();
    const yawMid=Math.atan2(tg.x,tg.z);
    const pA=trackCurve.getPoint(_BRIDGE_T_START),pB=trackCurve.getPoint(_BRIDGE_T_END);
    const arc=Math.hypot(pB.x-pA.x,pB.z-pA.z)*1.2;
    const lavaMat=new THREE.MeshLambertMaterial({color:0xff4400,emissive:0xff2200,emissiveIntensity:1.4,transparent:true,opacity:.95});
    const lava=new THREE.Mesh(new THREE.PlaneGeometry(arc+24,40),lavaMat);
    lava.rotation.x=-Math.PI/2;
    lava.rotation.z=yawMid;
    lava.position.set(pMid.x,-0.9,pMid.z);
    scene.add(lava);
    _volcanoBridgeLava=lava;
  }
  // ── Bridge deck segments ──
  // Shared geometry (1 GPU buffer), per-segment cloned materials so V2's
  // crack-glow can pulse independently per panel.
  const deckGeo=new THREE.BoxGeometry(_BRIDGE_PANEL_W,_BRIDGE_PANEL_H,_BRIDGE_PANEL_L);
  const deckMatProto=new THREE.MeshLambertMaterial({color:0x2a1a14,emissive:0x110800,emissiveIntensity:.15});
  for(let i=0;i<_BRIDGE_SEGMENTS;i++){
    const t=_BRIDGE_T_START+(i+.5)*((_BRIDGE_T_END-_BRIDGE_T_START)/_BRIDGE_SEGMENTS);
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const yaw=Math.atan2(tg.x,tg.z);
    const side=(i%2===0)?1:-1;
    // outerGrp local +X (after rotation.y=yaw) in world = (cos(yaw), 0, -sin(yaw)).
    const lxX=Math.cos(yaw),lxZ=-Math.sin(yaw);
    const outer=new THREE.Group();
    outer.position.set(p.x+side*(_BRIDGE_PANEL_W*.5)*lxX, 0.05, p.z+side*(_BRIDGE_PANEL_W*.5)*lxZ);
    outer.rotation.y=yaw;
    const inner=new THREE.Group();
    outer.add(inner);
    const deckMat=deckMatProto.clone();
    const deck=new THREE.Mesh(deckGeo,deckMat);
    deck.position.x=-side*(_BRIDGE_PANEL_W*.5);
    deck.receiveShadow=true;
    inner.add(deck);
    scene.add(outer);
    _volcanoBridgeSegs.push({outer:outer,inner:inner,mesh:deck,side:side,index:i});
  }
  // The prototype was only used to seed clones; dispose it to avoid a leaked material.
  deckMatProto.dispose();
  _volcanoBridgeState={crackProgress:0,tiltProgress:0};
}

function updateVolcanoBridge(dt,currentLap){
  if(!_volcanoBridgeState)return;
  const st=_volcanoBridgeState;
  const t=(typeof _nowSec==='number')?_nowSec:0;
  // Lava-pool emissive ramps up per lap.
  if(_volcanoBridgeLava&&_volcanoBridgeLava.material){
    const lapBoost=(currentLap>=2?0.3:0)+(currentLap>=3?0.5:0);
    _volcanoBridgeLava.material.emissiveIntensity=1.1+Math.sin(t*1.6)*.35+lapBoost;
  }
  // Smooth-easing of damage states. Time-constant chosen so the transition
  // feels deliberate (~1s to mostly visible) without sluggishness.
  const crackTarget=currentLap>=2?1:0;
  st.crackProgress+=(crackTarget-st.crackProgress)*Math.min(1,dt*1.5);
  const tiltTarget=currentLap>=3?1:0;
  st.tiltProgress+=(tiltTarget-st.tiltProgress)*Math.min(1,dt*0.9);
  // Per-segment apply.
  const eased=st.tiltProgress*st.tiltProgress; // ease-in-quad, "structural fail" feel
  for(let i=0;i<_volcanoBridgeSegs.length;i++){
    const seg=_volcanoBridgeSegs[i];
    if(seg.mesh&&seg.mesh.material){
      const m=seg.mesh.material;
      // Cracks: emissive boost (per-segment phase via i so the bridge breathes).
      m.emissiveIntensity=0.15+st.crackProgress*(0.55+0.2*Math.sin(t*3+i));
      // Subtle heat-tint on the asphalt color: lerp toward smoldering red.
      // Channel-by-channel lerp from 0x2a1a14 → 0x5a2818 in proportion to crackProgress.
      const r=(0x2a+(0x5a-0x2a)*st.crackProgress)/255;
      const g=(0x1a+(0x28-0x1a)*st.crackProgress)/255;
      const b=(0x14+(0x18-0x14)*st.crackProgress)/255;
      m.color.setRGB(r,g,b);
    }
    // Tilt: only even-indexed segments swing away. The remaining 4 panels
    // form a discontinuous path the player must thread through on lap 3.
    if(seg.inner&&i%2===0){
      seg.inner.rotation.z=-seg.side*_BRIDGE_TILT_RAD*eased;
    }
  }
}

function disposeVolcanoBridge(){
  // Scene-traversal in disposeScene() handles geometry/material cleanup
  // generically (isMesh + dispose). We only clear our own references so
  // the next race rebuilds cleanly without stale closures.
  _volcanoBridgeSegs.length=0;
  _volcanoBridgeLava=null;
  _volcanoBridgeState=null;
}
