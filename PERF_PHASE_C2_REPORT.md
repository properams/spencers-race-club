# Performance Phase C2 Report

## Change applied

**Optie Y gekozen** — postfx warm-render verhuisd uit `buildScene` naar `goToRace()`, ná `makeAllCars()`.

**Reden** — drie redenen voor Y boven X:

1. Title screen heeft een animated camera fly-along (`loop.js:60-67`) en is by design car-loos. Optie X zou cars in scene plaatsen tijdens elke buildScene incl. boot, wat de title-screen visueel verandert.
2. De Phase-C postfx warm-render in `buildScene` rendert met de title-camera (`camera.position.set(0,12,330);camera.lookAt(0,0,280)` op `scene.js:422-423`), niet de race-cam-view. De warm-render representeerde dus al niet de race-view. Verplaatsen naar `goToRace` ná de race-cam-reposition maakt de warm-render eindelijk wel representatief voor wat er straks gerendered wordt.
3. `goToRace` is de natuurlijke "overgang naar race"-grens; daar hoort de warm-render thuis. Geen state-machine bijwerkingen voor TITLE/SELECT.

**Files gewijzigd**:
- `js/core/scene.js:525-531` — postfx warm-render uit `buildScene` verwijderd. Comment-stub achtergelaten met verwijzing naar nieuwe locatie.
- `js/ui/navigation.js:53-65` — postfx warm-render toegevoegd ná `camera.lookAt(camTgt)` in `goToRace()`. Markers `goToRace:postfxWarm:start/end` + `goToRace.postfxWarm` measure.
- `js/core/boot.js:181-186` — comment-update; loading-screen rAF-fade chain blijft. Eerste title-render gebeurt synchroon door `loop()`-call onderaan boot, dus canvas heeft een image vóór rAF #2 het loading-scherm verbergt.

Geen dubbele warm-render: de oude call in `buildScene` is volledig verwijderd; alleen de nieuwe call in `goToRace` blijft.

## Test environment

- Browser: HeadlessChrome/141.0.7390.37 via Playwright
- WebGL backend: SwiftShader (software rendering — same caveat as Phase A/C)
- Viewport: 1280×800
- Date: 2026-05-02

## Headline result: substantieel sneller dan Phase A baseline én dan Phase C

`transition.total` is gecrashed van 743-18491 ms (Phase A) naar 207-680 ms (Phase C2): **-72% tot -97%**. De cost is verschoven naar `goToRace.postfxWarm` (51-929 ms cold) — veel kleiner dan Phase C's `build.postfxWarm` (769-21504 ms) omdat de scene tijdens title/select-screen al door `loop()` werd gerenderd, dus de shaders waren al hot tegen de tijd dat goToRace afvuurt.

## Before/after vs Phase C — transition.total + firstRaceFrame.render

`transition.total` cold:
- candy: C 8422.2 → C2 679.6 ms (Δ -7742.6 / -92%)
- volcano: C 1209.0 → C2 207.4 ms (Δ -1001.6 / -83%)
- space: C 7153.8 → C2 339.5 ms (Δ -6814.3 / -95%)
- neoncity: C 22820.2 → C2 632.1 ms (Δ -22188.1 / -97%)
- grandprix: C 2729.9 → C2 248.9 ms (Δ -2481.0 / -91%)

`transition.total` warm:
- candy: C 2514.6 → C2 173.1 ms (Δ -2341.5 / -93%)
- volcano: C 844.2 → C2 98.6 ms (Δ -745.6 / -88%)
- space: C 3481.0 → C2 120.8 ms (Δ -3360.2 / -97%)
- neoncity: C 14588.9 → C2 232.1 ms (Δ -14356.8 / -98%)
- grandprix: C 2169.5 → C2 197.7 ms (Δ -1971.8 / -91%)

`firstRaceFrame.render` cold:
- candy: C 2283.5 → C2 1493.8 ms (Δ -789.7 / -35%)
- volcano: C 839.2 → C2 601.1 ms (Δ -238.1 / -28%)
- space: C 3029.7 → C2 2205.3 ms (Δ -824.4 / -27%)
- neoncity: C 6656.1 → C2 4155.4 ms (Δ -2500.7 / -38%)
- grandprix: C 2838.8 → C2 1735.9 ms (Δ -1102.9 / -39%)

`firstRaceFrame.render` warm:
- candy: C 932.9 → C2 493.7 ms (Δ -439.2 / -47%)
- volcano: C 509.0 → C2 247.5 ms (Δ -261.5 / -51%)
- space: C 1525.9 → C2 886.6 ms (Δ -639.3 / -42%)
- neoncity: C 2270.3 → C2 1307.6 ms (Δ -962.7 / -42%)
- grandprix: C 1736.6 → C2 873.8 ms (Δ -862.8 / -50%)

## Vergelijking met Phase A baseline (pre-fix)

`transition.total` cold:
- candy: A 5428.3 → C2 679.6 ms (Δ -4748.7 / -87%)
- volcano: A 742.8 → C2 207.4 ms (Δ -535.4 / -72%)
- space: A 5271.8 → C2 339.5 ms (Δ -4932.3 / -94%)
- neoncity: A 18490.7 → C2 632.1 ms (Δ -17858.6 / -97%)
- grandprix: A 1579.2 → C2 248.9 ms (Δ -1330.3 / -84%)

`firstRaceFrame.render` cold:
- candy: A 1687.0 → C2 1493.8 ms (Δ -193.2 / -11%)
- volcano: A 617.3 → C2 601.1 ms (Δ -16.2 / -3%)
- space: A 2519.9 → C2 2205.3 ms (Δ -314.6 / -12%)
- neoncity: A 4445.8 → C2 4155.4 ms (Δ -290.4 / -7%)
- grandprix: A 2001.5 → C2 1735.9 ms (Δ -265.6 / -13%)

`firstRaceFrame.render` warm:
- candy: A 526.9 → C2 493.7 ms (Δ -33.2 / -6%)
- volcano: A 266.4 → C2 247.5 ms (Δ -18.9 / -7%)
- space: A 1066.7 → C2 886.6 ms (Δ -180.1 / -17%)
- neoncity: A 1486.7 → C2 1307.6 ms (Δ -179.1 / -12%)
- grandprix: A 980.2 → C2 873.8 ms (Δ -106.4 / -11%)

## Nieuwe segmenten in C2

`goToRace.postfxWarm` (de race-side warm-render zelf):
- candy: cold 108.0, warm 40.3 ms
- volcano: cold 51.2, warm 25.5 ms
- space: cold 929.3, warm 45.8 ms
- neoncity: cold 100.5, warm 84.4 ms
- grandprix: cold 64.0, warm 37.9 ms

`goToRace.total` cold (van click START RACE tot COUNTDOWN-start; bevat makeAllCars + camera-reposition + postfxWarm):
- candy: 146.2 ms
- volcano: 82.4 ms
- space: 955.9 ms
- neoncity: 126.5 ms
- grandprix: 92.8 ms

`build.precompile` cold (alleen `renderer.compile()` nu — opt-A's restant van Phase C):
- candy: 192.8 ms
- volcano: 108.1 ms
- space: 254.4 ms
- neoncity: 500.1 ms
- grandprix: 153.6 ms

User-perceived totaal van wereld-click tot countdown-start: `transition.total` + `goToRace.total`. Bij neoncity (zwaarste): A had ~18491 + ~minimaal ≈ 18.5 sec; C2 heeft 632 + 127 ≈ 759 ms. **Factor ~24× sneller.**

## Visual regression

Headless screenshots in `tools/`:

- `tools/phase-c2-volcano-racestart.png` — Volcano race-frame: rode player car + gele AI op track, ember haze, mountain silhouettes, HUD (P1, mirror, mini-map, lap, position). Cars zichtbaar; geen flicker.
- `tools/phase-c2-grandprix-racestart.png` — Grandprix grid-start: rode player + grijze AI op startlijn, witte track met DRS-zone, fence flags, advertising boards, HUD. Cars zichtbaar; geen flicker.

Visuele check:
- Cars zichtbaar in warm-render screenshot? **Y**
- Geen flicker bij race-start? **Y**
- Postfx (bloom, vignette, grading) renders correctly? **Y**
- Schaduwen aanwezig? **Y**

## Heap progression

- App boot: 19.05 MB (vs Phase A 22.6, Phase C 17.84)
- End of full run: 72.61 MB (vs Phase A 59.7, Phase C 70.5)

End-of-run iets hoger dan Phase A (Δ +13 MB), vergelijkbaar met Phase C. Geen acuut probleem; identieke trend zoals genoteerd in Phase B observations.

## Observations

(Feitelijke waarnemingen; geen aanbevelingen.)

- `goToRace.postfxWarm` is in C2 dramatisch goedkoper dan `build.postfxWarm` was in Phase C (51-929 ms vs 769-21504 ms). Het verschil komt doordat tussen `buildScene` en `goToRace` de scene al door `loop()` is gerenderd op de title- en select-schermen — dat warmt het merendeel van de scene-shaders + textures. Tegen de tijd dat `goToRace.postfxWarm` afvuurt is alleen het toevoegen van 8 cars en de camera-reposition nieuw werk.
- **Space (cold) is anomalously zwaarder**: `goToRace.postfxWarm.cold = 929 ms` versus 51-108 ms voor andere worlds. Mogelijke oorzaak (niet gefixt in deze fase): space heeft veel transparente sprites/sterren die in postfx-blending duurder zijn te renderen op SwiftShader; of de runner-timing maakt dat space's title-frames net minder hot werden voor goToRace afvuurde. Warm = 46 ms, dus de penalty is alleen op cold.
- `firstRaceFrame.render` daalt slechts 3-13% (cold) en 6-17% (warm) tov Phase A baseline. Verklaring: postfx warm-render in `goToRace` warmt de shaders op race-cam-view, maar dat is ook precies wat de countdown-frames (4 sec @ 60 fps) al doen via `loop()`. Op SwiftShader dominateert per-frame fragment-throughput, wat warmup niet versnelt.
- `goToRace.total` in C2 is overwegend laag (82-956 ms) — dat is de échte "freeze tussen click START RACE en countdown-start" en die is in alle worlds onder 1 sec. In neoncity specifiek: 126 ms.
- Heap-progressie ~vergelijkbaar met Phase C; geen verbetering of verergering.
- Boot-time first title-render werkt zoals voorzien: het canvas is gerendered (synchroon door `loop()`-call aan einde van boot) vóór de loading-screen verdwijnt. Geen flash bij boot waargenomen.
- Voor mogelijke Phase D (NIET gefixt in deze fase):
  - Space's anomalously zware cold goToRace.postfxWarm — potentieel materialen/sprite-shaders die niet door title-render worden gewarmd.
  - `firstRaceFrame.render` op SwiftShader blijft 600-4155 ms — dat is per-frame software-render-cost, niet warmup-cost, dus alleen aan te pakken via scene-vereenvoudiging of native-GPU testing. iPad-meting noodzakelijk om te bepalen of dit een echt probleem is of SwiftShader-artefact.
  - Heap-groei boot 19 → end-of-run 73 MB blijft staan (zelfde als C, vergelijkbaar bereik als A).
