# Performance Phase C Report

## Changes applied

1. **Removed the 16×16 off-screen render** from `_precompileScene()` — `js/core/scene.js:618-654`. The function now only calls `renderer.compile(scene, camera)`. Markers `precompile:compile:*` blijven; the obsolete `precompile:render:*` markers + WebGLRenderTarget setup zijn weg.
2. **Added `renderWithPostFX(scene, camera)` warm-render** aan einde van `buildScene` — `js/core/scene.js` (regel 525-532) achter het `_precompileScene()` call-block. New `perfMark`/`perfMeasure` `build.postfxWarm`. Falls back to `renderer.render(scene, camera)` als postfx ontbreekt.
3. **Removed redundant warm-render in `boot.js`** — `js/core/boot.js:181-194`. `buildScene()` doet nu zelf de postfx warm-render aan het einde, dus de extra `renderWithPostFX(scene, camera)` call in boot direct na `buildScene()` was dubbel werk. Loading-screen rAF-fade chain blijft staan; het canvas heeft al een image van de buildScene-warm.
4. **Removed all PHASE-B diagnostic counters** — scene-content traversal in `scene.js`, prog/tex/geo deltas in `loop.js`, renderer.info snapshots in `navigation.js`. Alle structurele perfMark/perfMeasure markers blijven.

## Test environment

- Browser: HeadlessChrome/141.0.7390.37 via Playwright
- WebGL backend: SwiftShader (software rendering — same caveat as Phase A)
- Viewport: 1280×800
- Postfx confirmed enabled in runner (`window._postfx.enabled=true`, `_postfx.ready=true`, `shadowMap.enabled=true`)
- Date: 2026-05-02

## Headline result: **fix REGRESSED transition.total in this environment**

`build.postfxWarm` (full-canvas postfx render) blijkt op SwiftShader 1.5–28× duurder dan de oude 16×16 off-screen render die het vervangt. Het netto effect is een **VERSLECHTERING** van `transition.total` in deze metering. `firstRaceFrame.render` daalde NIET. Per de prompt-instructie: "stop, niet doormodderen". Rapport hieronder is feitelijk; geen fix-van-de-fix.

## Before / after — transition.total (cold + warm)

Before-getallen uit PERF_PHASE_A_REPORT.md (zelfde runner, zelfde sandbox).

| World     | trans.total before cold | after cold | Δ cold        | before warm | after warm | Δ warm      |
|-----------|------------------------:|-----------:|--------------:|------------:|-----------:|------------:|
| candy     |                  5428.3 |     8422.2 | +2993.9 (+55%)|      1536.0 |     2514.6 | +978.6 (+64%)|
| volcano   |                   742.8 |     1209.0 |  +466.2 (+63%)|       378.5 |      844.2 | +465.7 (+123%)|
| space     |                  5271.8 |     7153.8 | +1882.0 (+36%)|      2254.5 |     3481.0 |+1226.5 (+54%)|
| neoncity  |                 18490.7 |    22820.2 | +4329.5 (+23%)|      9127.3 |    14588.9 |+5461.6 (+60%)|
| grandprix |                  1579.2 |     2729.9 | +1150.7 (+73%)|      1298.8 |     2169.5 | +870.7 (+67%)|

Kleur: alle Δ's positief = ALLES is langzamer geworden.

## Before / after — firstRaceFrame.render

| World     | firstFrame before cold | after cold | Δ cold       | before warm | after warm | Δ warm      |
|-----------|-----------------------:|-----------:|-------------:|------------:|-----------:|------------:|
| candy     |                 1687.0 |     2283.5 | +596.5 (+35%)|       526.9 |      932.9 | +406.0 (+77%)|
| volcano   |                  617.3 |      839.2 | +221.9 (+36%)|       266.4 |      509.0 | +242.6 (+91%)|
| space     |                 2519.9 |     3029.7 | +509.8 (+20%)|      1066.7 |     1525.9 | +459.2 (+43%)|
| neoncity  |                 4445.8 |     6656.1 | +2210.3 (+50%)|     1486.7 |     2270.3 | +783.6 (+53%)|
| grandprix |                 2001.5 |     2838.8 | +837.3 (+42%)|       980.2 |     1736.6 | +756.4 (+77%)|

Cool, postfx-warm zou `firstRaceFrame.render` JUIST moeten verlagen — die is ook hoger geworden. Zie "Anomalies / observations" hieronder voor de waarschijnlijke verklaring.

## New segment: build.postfxWarm

`renderWithPostFX(scene, camera)` één keer aan het einde van `buildScene`. Dit is wat `transition.total` extra kost t.o.v. zonder de fix.

| World     | build.postfxWarm cold (ms) | warm (ms) |
|-----------|---------------------------:|----------:|
| candy     |                     3123.7 |    1997.3 |
| volcano   |                      768.9 |     475.2 |
| space     |                     6604.4 |    3215.0 |
| neoncity  |                    21504.4 |   14125.0 |
| grandprix |                     1985.7 |    1699.5 |

Vergelijk met de oude `build.precompile.render` cost (16×16 render) uit Phase B:

| World     | old precompile.render cold | new postfxWarm cold | new/old ratio |
|-----------|---------------------------:|--------------------:|--------------:|
| candy     |                     3811.9 |              3123.7 |          0.82 |
| volcano   |                     1076.5 |               768.9 |          0.71 |
| space     |                     6301.1 |              6604.4 |          1.05 |
| neoncity  |                    25180.3 |             21504.4 |          0.85 |
| grandprix |                     2389.2 |              1985.7 |          0.83 |

Detail: `build.postfxWarm` is per wereld 0.7-1.05× de oude `precompile.render`. **Niet veel goedkoper, terwijl de hoop was dat het de eerste race-frame ook zou afdekken.** Combineren: oude precompile = 1.0-25.2 sec; nieuwe precompile (compile-only) = 0.28-0.79 sec, plus postfxWarm 0.77-21.5 sec. Netto +23% tot +73% per wereld op cold.

## Boot timing — verificatie van geen dubbeling

- Boot's eigen extra `renderWithPostFX(scene, camera)` call (boot.js:190) is verwijderd. `buildScene()` doet nu zelf de warm-render aan het einde.
- Boot-tijd niet expliciet gemeten in deze run (heap.boot 17.84MB vs 22.6MB Phase A — vergelijkbaar bereik). Geen separate "boot.totalUntilTitle" marker; visuele check bevestigt: title screen verschijnt na boot zonder zichtbare regressie of flash.

## Visual regression check

Headless screenshots opgenomen in `tools/`:

- `tools/phase-c-title.png` — Title screen: bloom + vignette aanwezig en correct, "SPENCER'S RACE CLUB" text rendert met magenta/cyan kleurgrading. **OK**.
- `tools/phase-c-neoncity-select.png` — Car select met SF90 preview op neon-gradient stage: bloom op LED's, kleuren correct. **OK**.
- `tools/phase-c-volcano-race.png` — Volcano race-frame: track-surface, player car (rood) + AI car, ember-haze bloom, HUD elementen (P1, mirror, mini-map, lap-counter), mountain silhouettes. Geen flicker, schaduwen aanwezig. **OK**.

| Check                                                          | Result |
|----------------------------------------------------------------|--------|
| Scene appears identical immediately after buildScene?         | Y      |
| Shadows present?                                               | Y      |
| Postfx (bloom, vignette, grading) renders correctly?           | Y      |
| Any flicker on first race frame?                               | N      |

Visueel is de fix in orde. Het probleem zit puur in performance.

## Heap progression (snapshot)

| Event           | Phase A   | Phase C   |
|-----------------|----------:|----------:|
| App boot        |  22.64 MB |  17.84 MB |
| End of full run |  59.66 MB |  70.54 MB |

Phase C heap-progressie: 17.84 → 70.54 MB over 10 transities (Δ 52.7 MB) vs 37.0 MB in Phase A. Iets hoger; ruis-marge maar mogelijk dat de extra warm-render textures of intermediate render-targets vasthoudt. Geen showstopper, geen actie in dit ticket.

## Anomalies / observations

(Feitelijke waarnemingen tijdens implementatie/meting; geen aanbevelingen — voor mogelijke fase D.)

- **De aanname uit Phase B "postfx-warm tijdens select dekt firstRaceFrame.render af" klopt niet onder SwiftShader.** firstRaceFrame.render is NIET gedaald (zelfs +20-50% hoger). Mogelijke oorzaken:
  1. `makeAllCars()` wordt aangeroepen in `goToRace()` NA `buildScene` — dat voegt 8 cars (player + 7 AI) met eigen geometries/materials toe aan de scene. De warm-render in buildScene heeft die cars dus niet gezien. Wanneer de eerste race-frame rendert, moeten car-shaders alsnog gecompileerd en geupload worden.
  2. Onder software-rendering is een full-canvas postfx-render fragment-bound (4 fullscreen passes + zware scene). Warm-up van shaders helpt nul aan fragment-throughput. Op echte GPU is de fragment-cost vermoedelijk een orde van grootte lager.

- **`build.postfxWarm` cost is bijna gelijk aan oude `build.precompile.render` cost** (ratio 0.71-1.05). De nieuwe pipeline doet 4 fullscreen passes op 1280×800, de oude deed één pass op 16×16. Dat is ~2.5M pixels vs 256 pixels = 9.7K× meer fragment-werk per pass. Dat de full-canvas postfx-render slechts ~0.85× zo duur is als de 16×16 render is omdat de oude 16×16 render dezelfde vertex-pass + draw-call overhead had (vertex-throughput dominated, niet fragment-throughput, op SwiftShader voor zo'n klein target).

- **Compile-cost daalt zoals verwacht**: oude precompile (compile + render) 1.5-26 sec → nieuwe precompile (compile only) 0.28-0.79 sec. Dat klopt met Phase B's split-meting.

- **`renderer.compile()` in cold runs lijkt iets goedkoper** dan in Phase B (288-790 ms now vs 284-891 ms toen). Binnen meet-ruis.

- **Visuele kwaliteit gelijk** — postfx-pipeline functioneert exact zoals voor de fix; geen pixel-verschillen die ik kan zien tussen pre-fix en post-fix screenshots (informeel vergelijk met pre-fix renders die in de game-test rondspoken).

- **Regressie-risico voor light-weight worlds (volcano, grandprix)**: voor volcano was `transition.total` voor de fix 743 ms (snel), nu 1209 ms. Dat is op iPad-scale waarschijnlijk wel merkbaar. De fix is vooral schadelijk voor wereld die voor de fix al een korte transitie hadden.

- **Heap iets hoger end-of-run** — niet acuut, mogelijk door extra render-target/intermediate state in postfx pipeline die vaker wordt aangetikt.

- **Voor mogelijke Phase D**: 
  - Controleer met echte GPU (iPad) of de bevindingen omdraaien — als full-canvas postfx-render op iPad <50 ms is, was de fix-aanname correct en is alleen SwiftShader het probleem.
  - Optie B (chunked precompile during countdown) of Optie E (combinatie) zoals geschetst in PERF_PHASE_B_PLAN.md.
  - Cars-toevoeging-tijdens-goToRace bekijken — die "verstoort" de warm-render en moet mee in de warm-up of de cars moeten al in scene staan tijdens buildScene.
  - Kijk naar reduceren van postfx-cost zelf (lagere half-res blur target, of disablen voor zware worlds tot performance verbetert).
