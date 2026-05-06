// js/worlds/pier47.js — Pier 47 (industrial harbour by night) world builders.
// Non-module script. Sessie 1 = bones only: file scaffold + track-waypoint
// reference + WORLDS-registry hooks. Skybox / lighting / environment builder
// arrive in sessie 2. Wet rendering, particles, lamp-pole sodium-light pass
// are sessie 3. Optional wet-physics is sessie 4.
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

// (Sessie 2 will add buildPier47Environment, _applyPier47DayLighting,
//  makePier47SkyTex, makePier47NightSkyTex, and updatePier47World here.
//  See sandstorm.js for the reference structure.)
