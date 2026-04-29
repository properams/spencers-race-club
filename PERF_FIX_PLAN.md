# Performance Fix Plan

Status: **Phase 3 plan — Jur gaf akkoord om door te gaan zonder vol gemeten
data uit Phase 1.** Dit document is dus **hypothese-gedreven, niet
meetdata-gedreven** voor de eerste fixes. Elke fix logt voor/na cijfers via
de Phase 1 instrumentation, dus we krijgen de bevestigende data alsnog
bij elk commit. Als een fix géén meetbare verbetering oplevert wordt-ie
ge-revert (zie rollback-plan per fase).

Branch: `claude/fix-performance-stutters-eJCRT`.

---

## Phase 2 — Root-cause classificatie (hypothese-gedreven)

Op basis van de Race Start Inventory uit Gate 0. Buckets per ⛔HARDE GATE
opdracht-spec uit prompt:

| # | Verdachte | Bucket | Confidence | Schatting impact (ms) op iPad |
|---|---|---|---|---|
| H1 | Wereld-specifieke shader-compilatie op 1e race-frame als wereld ≠ default Grand Prix waar boot-warmup voor draaide | **A — shader compilation** | HIGH | 200–800 |
| H2 | `initEngine()` lazy op 1e race-frame: 4 OscillatorNodes + 88200-sample filled noise buffer + 1 BiquadFilter + 4 GainNodes | **E — lazy creation** | HIGH | 30–120 |
| H3 | `RaceMusic` / `StemRaceMusic` constructor + `start()` op T1+380ms — 3× simultaneous BufferSource.start voor stems, of ~28 oscillators in eerste `_s()` batch voor procedural | **E — lazy creation** + **C — audio decode (stems only)** | MED | 50–200 |
| H4 | HDRI/PBR async upgrade via `maybeUpgradeWorld` mid-race | **B — texture upload** | MED | onbekend, sporadisch |
| H5 | Eerste shadow-pass met cars + dynamische lights op 1e race-frame | **A — shader compilation** (mix) | LOW-MED | overlappend met H1 |
| H6 | Allocaties op de hot path (`new THREE.Vector3` in `updateDamageSmoke`, `new THREE.Color` in `updateWeather` per frame) | **F — allocation burst** | LOW | 1–5 per frame; cumulatief mid-game stutter |

Niet eerder genoemd, gevonden tijdens fix-plan schrijven:
- `updateDamageSmoke` doet `new THREE.Vector3` per smoke-emit (`visuals.js:276`).
- `updateWeather` doet `new THREE.Color(base)` op elke frame met track-mesh
  (`weather.js:204` + `weather.js:42` in `toggleRain`).

### Freeze-target (per prompt-eis)

- **Hard ceiling: 250ms op iPad** (boven dat = storend, gebruikersgevoel).
- **Streef-target: <100ms** op iPad bij ENIGE wereld-switch + nieuwe race.
  Onderbouwing: H1 + H2 samen ~230–920ms; H1 alleen levert vermoedelijk
  150–400ms verbetering, H2 nog 30–120ms. Restbudget gaat naar H3 als
  eerste 2 niet genoeg blijken.
- **Acceptatie**: gemiddelde over 3 mobile runs per wereld onder ceiling.

---

## Phase 3 — Multi-phase fix plan

### Phase 3.1 — Quick wins (LOW risk, HIGH expected impact)

Targets: H1 (shader compile) + H2 (initEngine lazy) + H3 (music start). Alle
3 raken alleen het opstart-pad, geen render-loop. Geen gameplay-changes.

#### 3.1.a — Promote precompile experiment to default

Wat: De `_perfExpPrecompileWorld()` uit het Phase 1 A/B experiment promoveren
naar default-aan, op het eind van `buildScene()` zodat ook de eerste-build
gedekt is (niet alleen rebuildWorld).

Hoe: Verplaats de logic van `js/ui/select.js` naar `js/core/scene.js` aan
het eind van `buildScene()`. Drop de localStorage flag. `renderer.compile()`
blijft, plus de 16×16 off-screen render om uploads te forceren. Bestaande
`PRECOMPILE-DONE` race-event blijft staan zodat de cost zichtbaar blijft
in metrics.

Risico: LOW. `renderer.compile` is r134-native, zou nooit moeten falen. De
16×16 render is goedkoop en off-screen. Als het toch crasht, fall-back via
try/catch (al aanwezig in experiment).

Acceptance criteria (meetbaar via Phase 1 instrumentation):
- `dbg.raceEvents()` `FIRST-RACE-FRAME.progDelta` = 0 voor alle 8 werelden.
- `dbg.measures()` `firstRaceFrame.render` duur < 25ms op desktop, < 60ms op iPad.

Rollback: revert deze commit. Het oude lazy-gedrag komt terug.

#### 3.1.b — Hoist initEngine to countdown-start

Wat: `initEngine()` (4 osc + tire-noise buffer + filters + gains) wordt
nu lazy op de eerste `updateEngine()` call in de RACE-tak van de loop,
dus op T3 (eerste race-frame). Verschuif naar T0 (CD-START), tegelijk
met de bestaande `Audio.startWind()` + `Audio.initCrowd()` pre-warm.

Hoe: Voeg `if(audioCtx&&typeof initEngine==='function'&&!engineGain)initEngine();`
toe in `goToRace` direct vóór `runCountdown(...)`. `updateEngine` houdt
zijn lazy-fallback voor het edge-case waar `goToRace` bypassed wordt
(quick-restart, etc).

Risico: LOW. `initEngine` is idempotent (early-return op `engineOsc`
truthy). Engine-gain start op 0 dus stilte tijdens countdown blijft.

Acceptance criteria:
- `dbg.measures()` `initEngine` measure verschijnt nog maar 1× per session
  (eerste race), en valt nu in de countdown-window i.p.v. op race-start.
- FIRST-RACE-FRAME spike daalt met de oude initEngine-cost (~20–40ms desktop).

Rollback: revert.

#### 3.1.c — Pre-construct RaceMusic during countdown, only `.start()` deferred

Wat: De huidige `setTimeout(380)` doet zowel constructor als `start()` op
het zware moment. Voor `StemRaceMusic` is het echter de `start()` die 3
buffer-sources tegelijk launcht — dat is de spike. Voor `RaceMusic` is
het de eerste `_s()` schedule batch.

Beide hebben constructor-cost die we naar voren kunnen halen. We kunnen
de `_safeStartMusic`-factory opsplitsen: instantie maken op CD-START,
`.start()` op T+380.

Hoe: In `goToRace`: bouw `_pendingRaceMusic = _createRaceMusicForWorld()`
synchroon vóór `runCountdown`. In de bestaande `setTimeout(380)`: alleen
`musicSched=_pendingRaceMusic; musicSched.start()`. Reset
`_pendingRaceMusic=null` na use.

Risico: MED. Constructor van `RaceMusic` muteert `window._musicMaster` via
`_ensureMusicMaster()`. Dat is idempotent maar vroeg-instantiëren betekent
dat bij `_resetRaceState()` (quit-to-menu tijdens countdown) de pending
instance moet ook stop'd worden. Dit moet expliciet in `_resetRaceState`
gehandled worden.

Acceptance criteria:
- `dbg.measures()` `raceMusic.start` duur < 5ms (alleen `start()`, geen ctor).
- Geen audio-glitch op race-start.

Rollback: revert. Default lazy-construct gedrag komt terug.

### Phase 3.2 — Mid-game stutters (DEFERRED)

Reden voor defer: zonder spike-ringbuffer dump uit echte runs hebben we
geen patroon. De Phase 1 instrumentation is er klaar voor. Zodra Jur
data deelt komt deze fase live.

Mogelijke kandidaten als data wijst op:
- Allocaties (`new THREE.Vector3`/`new THREE.Color` per frame in
  `updateDamageSmoke` / `updateWeather`) → bucket F.
- HDRI swap via `maybeUpgradeWorld` resolveert mid-race → bucket B.
- Weather transition (`setWeather('snow')`) bouwt 600-particle Points
  net na race-start → bucket E.

### Phase 3.3 — Diepere refactors (DEFERRED)

Object pooling voor float-text DOM, allocation-vrije fwd/right vectors
in elke gameplay update. Alleen als de Phase 3.1 + 3.2 metrics aantonen
dat de targets nog niet gehaald worden.

### Phase 3.4 — Mobile-specifieke verlagingen (CONDITIONAL)

Alleen als na 3.1 de iPad freeze nog >250ms is:
- `_lowQuality` triggert nu pas na 180 frames (3 sec). Voor iPad detect-on-load.
- Schaduw-resolutie 1024×1024 op iPad mogelijk omlaag naar 512.
- PostFX completely uit op iPad — al gedaan in `initPostFX`.

---

## Definition of Done (Gate 5)

- [ ] Phase 3.1 fixes ge-merged + voor/na cijfers gedocumenteerd
- [ ] FIRST-RACE-FRAME `progDelta` = 0 voor alle 8 werelden
- [ ] iPad freeze gemeten <250ms (hard ceiling) of <100ms (streef)
- [ ] Geen visuele regressies (alle 8 werelden visueel gecheckt)
- [ ] Geen gameplay-regressies (race-tester agent groen)
- [ ] Review-agents groen op elke fix >50 regels of >2 bestanden

---

## Rollback-strategie per fase

Elke fix is **één commit met duidelijke title** zodat een single revert
genoeg is. Branch-policy: nooit een hele fase reverten — alleen specifieke
sub-commits. CHANGES.md updaten bij elke (re-)commit.

Als een fix géén meetbare verbetering oplevert in de geinstrumenteerde
metrics: revert + documenteer hypothese-falen in FINDINGS.md.
