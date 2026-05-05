// js/worlds/sandstorm-storm.js — rolling sandstorm hazard for sandstorm world.
// Non-module script. Loads BEFORE worlds/sandstorm.js so its build/update
// functions are visible when sandstorm.js calls them.
//
// Lifecycle (mirrors volcano-bridge.js exactly):
//   buildSandstormStorm()                — called from buildSandstormEnvironment()
//   updateSandstormStorm(dt, currentLap) — called from updateSandstormWorld(dt)
//   disposeSandstormStorm()              — called from _resetRaceState()
//
// Phase 2 status: NO-OP STUBS. Phase 4 implements the real lap-progressive
// hazard (fog far ramp 220→110→55, DOM overlay, sand-fleck particles, wind
// audio gain, headlights auto-on, optional wind-pull).
//
// The .old.js file at /home/user/spencers-race-club/js/worlds/sandstorm-storm.old.js
// holds the previous implementation as a reference for visual snippets.

'use strict';

let _sandstormStormState=null;

function buildSandstormStorm(){
  // Phase 2 stub. Phase 4 will: spawn the particle pool, create the storm-
  // front curtain meshes, append the DOM overlay div, init audio refs,
  // and zero window._sandstormWindPull.
  _sandstormStormState={ lap:1 };
  if(typeof window!=='undefined')window._sandstormWindPull=0;
}

function updateSandstormStorm(dt,currentLap){
  if(!_sandstormStormState)return;
  // Phase 2 stub. Phase 4 will: lerp scene.fog.far / DOM overlay opacity /
  // particle drawRange / curtain opacity / wind-pull / camera-shake toward
  // per-lap targets, and re-apply headlights every frame while lap >= 2.
  _sandstormStormState.lap=currentLap;
}

function disposeSandstormStorm(){
  // Phase 2 stub. Phase 4 will: reset scene.fog.far, hide DOM overlay,
  // dispose shared curtain texture, restore plHeadL/R intensities, zero
  // window._sandstormWindPull.
  _sandstormStormState=null;
  if(typeof window!=='undefined')window._sandstormWindPull=0;
}

if(typeof window!=='undefined')window._sandstormWindPull=0;
