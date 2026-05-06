// js/gameplay/wall-collision.js — non-module script.
//
// Track-edge soft-wall collision. Player and AI cars driving past the
// asphalt + curb get pushed back toward the track-curve with a velocity
// penalty. No hard stop — feels like firm resistance, not a brick wall.
//
// Wall edge = TW + 4 (= 17u from curve):
//   - TW=13       asphalt edge
//   - 16.15u      curb outer edge (TW + curbWidth*1.5)
//   - 17u         soft-wall (1u past curb so racing-line use of curbs is fine)
//   - 19u         "SAND!" popup threshold (raised from 17u in v3)
//   - 22u         WARN_DIST  (track-limits warning)
//   - 30u         RECOVER_DIST (forced recovery)
//
// Cars are physically blocked at the wall before they ever reach the
// warning/recovery zones — recovery-circle is reserved for actual edge
// cases (jumps, glitches) instead of normal off-track wandering.
//
// Skipped on space/deepsea: those have intentional fall-into-void
// mechanics that own the off-track behavior.
//
// Skipped during recovery and during race-start grace.
//
// Called from core/loop.js once per frame, between checkCollisions and
// checkTrackLimits, so the wall pushes the car BEFORE the limits-checker
// inspects offDist (preventing recovery triggers on what the wall has
// already handled).

'use strict';

// Per-car contact cooldown for FX (sparks + cam-shake). Shared array indexed
// by car index — cars don't move slots between frames so a plain array beats
// a WeakMap allocation per build.
const _wcContactCD = [];

function checkWallCollisions(dt){
  if(typeof carObjs==='undefined' || !carObjs.length) return;
  if(typeof trackCurve==='undefined' || !trackCurve) return;
  if(typeof TW==='undefined') return;

  const skipTrackWall = activeWorld==='space' || activeWorld==='deepsea';
  if(skipTrackWall) return;

  const wallEdge = TW + 4;       // 17u from curve
  const wallEdge2 = wallEdge * wallEdge;

  for(let ci=0; ci<carObjs.length; ci++){
    const car = carObjs[ci];
    if(!car || !car.mesh) continue;
    if(car.finished || car.inAir) continue;
    if(car._fallingIntoSpace) continue;
    // Skip player during active recovery (tracklimits.js owns the position
    // teleport in that case). AI doesn't have recoverActive so the global
    // check correctly only gates the player.
    if(ci===playerIdx && typeof recoverActive!=='undefined' && recoverActive) continue;
    if(typeof _raceStartGrace!=='undefined' && _raceStartGrace>0) continue;

    const pos = car.mesh.position;
    const t = (typeof nearestT==='function') ? nearestT(pos, car.progress) : car.progress;
    const cp = trackCurve.getPoint(t);
    const dx = pos.x - cp.x, dz = pos.z - cp.z;
    const offDist2 = dx*dx + dz*dz;
    if(offDist2 <= wallEdge2) continue;

    const offDist = Math.sqrt(offDist2);
    const overshoot = offDist - wallEdge;
    // Push direction = -normalised offset (toward curve).
    const nx = -dx / offDist, nz = -dz / offDist;
    // Position push: 0.4 of the overshoot per frame. Cumulative across
    // frames so a car holding "off-track" input is firmly held back.
    pos.x += nx * overshoot * 0.4;
    pos.z += nz * overshoot * 0.4;
    // Velocity penalty: scales with overshoot so light grazes barely slow
    // you, but driving full-tilt into the wall halves your speed quickly.
    // Floor at 0.55 so the car never fully stops from a single frame.
    const brake = Math.max(0.55, 1.0 - overshoot * 0.06);
    car.speed *= brake;

    // FX (player only, cooldown-gated): one spark burst + small cam-shake.
    if(ci===playerIdx){
      const cd = _wcContactCD[ci] || 0;
      if(cd <= 0 && overshoot > 0.15){
        _wcContactCD[ci] = 0.35;
        if(typeof sparkSystem!=='undefined' && sparkSystem.emit){
          sparkSystem.emit(pos.x, 0.4, pos.z,
            nx*0.06, 0.04+Math.random()*0.04, nz*0.06,
            6, 1, 0.7, 0.35, 0.45);
        }
        if(typeof camShake!=='undefined' && camShake < 0.16) camShake = 0.16;
      }
    }
  }
  // Decay all cooldowns
  for(let i=0; i<_wcContactCD.length; i++){
    if(_wcContactCD[i]) _wcContactCD[i] = Math.max(0, _wcContactCD[i] - dt);
  }
}
