// js/worlds/volcano-bridge.js — collapsing lava bridge in volcano world.
// Non-module script. Loads BEFORE worlds/volcano.js so its build/update
// functions are visible when volcano.js calls them.
//
// Lifecycle:
//   buildVolcanoBridge()                — called from buildVolcanoEnvironment()
//   updateVolcanoBridge(dt, currentLap) — called from updateVolcanoWorld(dt)
//   disposeVolcanoBridge()              — called from _resetRaceState()
//   onVolcanoLapComplete(newLap)        — called from gameplay/achievements.js
//
// Pivot architecture: each segment is a Group whose origin sits on the
// outer edge of the deck. The deck mesh is offset along the group's
// local +X by -side*PANEL_W/2 so it ends up centered on the track. V2
// will tilt segments by rotating the group around its local Z (track
// tangent direction), which makes the deck swing down from its pivot edge.
//
// Track range: t ∈ [_BRIDGE_T_START, _BRIDGE_T_END]. Move these to relocate.

'use strict';

const _BRIDGE_T_START=0.42;
const _BRIDGE_T_END=0.54;
const _BRIDGE_SEGMENTS=8;
const _BRIDGE_PANEL_W=18;
const _BRIDGE_PANEL_L=6;
const _BRIDGE_PANEL_H=0.5;

let _volcanoBridgeSegs=[];   // [{grp, mesh, side, index}]
let _volcanoBridgeLava=null; // pool plane under the bridge
let _volcanoBridgeState=null;

function buildVolcanoBridge(){
  if(typeof scene==='undefined'||!scene||typeof trackCurve==='undefined'||!trackCurve)return;
  // ── Lava pool under the bridge ──
  // One plane keeps it cheap (1 draw-call). Sized to span the bridge area
  // with margin so the visual gap reads even when camera angle is low.
  {
    const tMid=(_BRIDGE_T_START+_BRIDGE_T_END)*.5;
    const pMid=trackCurve.getPoint(tMid);
    const tg=trackCurve.getTangent(tMid).normalize();
    const yawMid=Math.atan2(tg.x,tg.z);
    const pA=trackCurve.getPoint(_BRIDGE_T_START),pB=trackCurve.getPoint(_BRIDGE_T_END);
    const arc=Math.hypot(pB.x-pA.x,pB.z-pA.z)*1.2; // straight-line + 20% slack
    const lavaMat=new THREE.MeshLambertMaterial({color:0xff4400,emissive:0xff2200,emissiveIntensity:1.4,transparent:true,opacity:.95});
    const lava=new THREE.Mesh(new THREE.PlaneGeometry(arc+24,40),lavaMat);
    lava.rotation.x=-Math.PI/2;
    lava.rotation.z=yawMid;
    lava.position.set(pMid.x,-0.9,pMid.z); // below ground (-.15) so it reads as a pit
    scene.add(lava);
    _volcanoBridgeLava=lava;
  }
  // ── Bridge deck segments ──
  // Shared geometry + material across all 8 panels (1 geometry, 1 material
  // → 8 draw-calls, well under the signature-moment budget).
  const deckGeo=new THREE.BoxGeometry(_BRIDGE_PANEL_W,_BRIDGE_PANEL_H,_BRIDGE_PANEL_L);
  const deckMat=new THREE.MeshLambertMaterial({color:0x2a1a14,emissive:0x110800,emissiveIntensity:.15});
  for(let i=0;i<_BRIDGE_SEGMENTS;i++){
    const t=_BRIDGE_T_START+(i+.5)*((_BRIDGE_T_END-_BRIDGE_T_START)/_BRIDGE_SEGMENTS);
    const p=trackCurve.getPoint(t);
    const tg=trackCurve.getTangent(t).normalize();
    const yaw=Math.atan2(tg.x,tg.z);
    // Alternate which edge is the pivot so V2 can tilt panels away in two
    // directions (every-other segment swings out left vs right).
    const side=(i%2===0)?1:-1;
    // Group's local +X (after rotation.y=yaw) in world = (cos(yaw), 0, -sin(yaw)).
    // Place the group at the pivot edge so the offset deck mesh sits on the track.
    const lxX=Math.cos(yaw),lxZ=-Math.sin(yaw);
    const grp=new THREE.Group();
    grp.position.set(p.x+side*(_BRIDGE_PANEL_W*.5)*lxX, 0.05, p.z+side*(_BRIDGE_PANEL_W*.5)*lxZ);
    grp.rotation.y=yaw;
    const deck=new THREE.Mesh(deckGeo,deckMat);
    deck.position.x=-side*(_BRIDGE_PANEL_W*.5); // recenters mesh on track centerline
    deck.receiveShadow=true;
    grp.add(deck);
    scene.add(grp);
    _volcanoBridgeSegs.push({grp:grp,mesh:deck,side:side,index:i});
  }
  _volcanoBridgeState={lap:1,tiltProgress:0};
}

function updateVolcanoBridge(dt,currentLap){
  if(!_volcanoBridgeState)return;
  // Lava-pool emissive pulse — cheap shimmer keeps the pit alive visually.
  if(_volcanoBridgeLava&&_volcanoBridgeLava.material){
    const t=(typeof _nowSec==='number')?_nowSec:0;
    _volcanoBridgeLava.material.emissiveIntensity=1.1+Math.sin(t*1.6)*.35;
  }
  // V2 lap-progressive damage states will land here next phase. V1 = static.
}

function disposeVolcanoBridge(){
  // Scene-traversal in disposeScene() handles geometry/material cleanup
  // generically (isMesh + dispose). We only clear our own references so
  // the next race rebuilds cleanly without stale closures.
  _volcanoBridgeSegs.length=0;
  _volcanoBridgeLava=null;
  _volcanoBridgeState=null;
}

function onVolcanoLapComplete(newLap){
  if(_volcanoBridgeState)_volcanoBridgeState.lap=newLap;
  // V2 hook-point: trigger crack-decals (lap 2) or kantel-rotatie (lap 3).
}
