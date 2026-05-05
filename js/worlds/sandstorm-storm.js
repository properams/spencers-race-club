// js/worlds/sandstorm-storm.js — rolling sandstorm hazard for sandstorm world.
// Non-module script. Loads BEFORE worlds/sandstorm.js so its build/update
// functions are visible when sandstorm.js calls them.
//
// Lifecycle:
//   buildSandstormStorm()                — called from buildSandstormEnvironment()
//   updateSandstormStorm(dt, currentLap) — called from updateSandstormWorld(dt)
//   disposeSandstormStorm()              — called from _resetRaceState()
//
// Phase 1 skeleton — proper hazard implementation lives in Phase 4. This
// file exists now so registration paths (race.js dispose, world update
// hook) can reference it without typeof-guards everywhere.

'use strict';

let _sandstormStormState=null;

function buildSandstormStorm(){
  // Phase 1 stub — Phase 4 wires the full hazard.
  _sandstormStormState={ lap:1 };
}

function updateSandstormStorm(dt,currentLap){
  if(!_sandstormStormState)return;
  // Phase 1 stub.
  _sandstormStormState.lap=currentLap;
}

function disposeSandstormStorm(){
  _sandstormStormState=null;
  // Phase 4 will reset window._sandstormWindPull, scene.fog.far, headlight
  // overrides, particles, overlay DOM, and audio gain here.
  if(typeof window!=='undefined')window._sandstormWindPull=0;
}

if(typeof window!=='undefined')window._sandstormWindPull=0;
