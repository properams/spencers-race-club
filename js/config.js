// js/config.js — gameplay-tuning constanten gedeeld door alle modules.
// Non-module script, geladen vóór alle andere subsystemen.
//
// Cross-script let/const bindings: zichtbaar voor elk later-geladen
// non-module script via global script scope.

'use strict';

// Race
let TOTAL_LAPS=3; // muteerbaar via lap-count selectie

// Track geometry. TW = half-track-width used by track.js to build the asphalt
// ribbon and by tracklimits.js to detect off-track. Single global across all
// worlds — sandstorm's "slot canyon" is visual-only (cliff walls placed via
// _ssBuildCanyonCliffs at BARRIER_OFF + 6 outside the standard width); the
// detection band stays uniform so ai.js / tracklimits behave identically
// across the 9 worlds and the AI's per-track racing-line offsets continue
// to use a stable reference width.
const TW=13, BARRIER_OFF=16, RECOVER_DIST=30, WARN_DIST=22;

// Difficulty multiplier (0=easy 1=normal 2=hard)
const DIFF_MULT=[0.75,1.0,1.22];

// Racing line grip bonus zones (progress ranges) — [start, end, bonus]
const GRIP_BONUS_ZONES=[[0.93,0.09,.04],[0.30,.42,.03],[0.63,.75,.03]];

// Car color customization presets
const CAR_COLOR_PRESETS=[0x1a3a6b,0xe8a000,0xcc0000,0xffffff,0x111111,0x00cc44,0x8800cc,0x888888];
