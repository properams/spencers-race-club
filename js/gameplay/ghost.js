// js/gameplay/ghost.js — ghost car state (uit main.js verhuisd).
// Non-module script.
//
// Ghost-replay records de player-positie tijdens elke ronde; bij een nieuwe
// best-lap wordt _ghostBest vervangen en speelt de ghost loopend mee.
// buildGhostMesh() (effects/visuals.js) bouwt de mesh.
// updateGhost() / saveGhostIfBest() (effects/visuals.js) lezen + schrijven
// deze state. Reset gebeurt in gameplay/race.js en ui/navigation.js.
// Cross-script let-bindings blijven werken via shared script scope.

'use strict';

const _ghostPos=[];     // huidige ronde — geappend elke 0.1s in updateGhost()
let _ghostBest=[];      // beste ronde — geretourneerd door saveGhostIfBest()
let _ghostMesh=null;    // THREE.Group toegewezen door buildGhostMesh()
let _ghostSampleT=0;    // sample timer (push elke .1s)
let _ghostPlayT=0;      // playback head voor _ghostBest replay
