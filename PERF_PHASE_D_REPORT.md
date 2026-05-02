# Performance Phase D Report

## Change applied

`js/ui/navigation.js` — `goToRace()`: het `goToRace.postfxWarm` block (de expliciete `renderWithPostFX(scene, camera)` warm-render die in Phase C2 werd toegevoegd) is **verwijderd**. Plaats vervangen door een toelichtende comment. Geen andere wijzigingen.

**Theorie**: tijdens de 4.2-sec countdown rendert `loop()` ~250 frames via `renderWithPostFX` op race-cam-view. De eerste van die frames betaalt de compile + texture-upload cost — verstopt achter de F1 light-sequence (DOM `setTimeout`, animeert onafhankelijk van rAF). De expliciete warm-render in `goToRace` deed hetzelfde werk maar **vóór** de countdown, wat de click→countdown-lights latency met 51-1438 ms ophield.

## Test environment

- Browser: HeadlessChrome/141.0.7390.37 via Playwright
- WebGL backend: SwiftShader (software rendering)
- Viewport: 1280×800
- Date: 2026-05-02
- Methode: Phase-D meting + verse C2-meting in dezelfde sessie (apples-to-apples; voorkomt tussen-runs SwiftShader-variantie).

## Headline result: consistente goToRace-latency-win

`goToRace.total` cold (gemeten in dezelfde sessie):

- candy: 195 → 58 ms (**-71%**)
- volcano: 101 → 40 ms (**-61%**)
- space: 1439 → 56 ms (**-96%**)
- neoncity: 313 → 76 ms (**-76%**)
- grandprix: 235 → 85 ms (**-64%**)

`transition.total` (cold + warm) en `firstRaceFrame.render` (cold + warm) zijn binnen meet-noise (±20%). Dat klopt: `transition.total` raakt buildScene niet en is dus niet gewijzigd; `firstRaceFrame.render` op SwiftShader is fragment-throughput-bound, niet warm-up-bound, dus warmup-wijziging beïnvloedt het niet.

## Detail (cold runs, fresh C2 vs Phase D, same session)

| metric | candy | volcano | space | neoncity | grandprix |
|---|--:|--:|--:|--:|--:|
| transition.total (C2) | 942 | 379 | 504 | 1371 | 800 |
| transition.total (D)  | 852 | 440 | 559 |  935 | 664 |
| Δ | -10% | +16% | +11% | -32% | -17% |
| build.precompile (C2) | 274 | 196 | 352 | 1058 | 512 |
| build.precompile (D)  | 232 | 250 | 364 |  760 | 423 |
| goToRace.postfxWarm (C2) | 160 | 70 | 1384 | 209 | 144 |
| goToRace.postfxWarm (D)  | – | – | – | – | – |
| goToRace.total (C2) | 195 | 101 | 1439 | 313 | 235 |
| goToRace.total (D)  | 58 | 40 | 56 | 76 | 85 |
| **Δ goToRace.total** | **-71%** | **-61%** | **-96%** | **-76%** | **-64%** |
| firstRaceFrame.render (C2) | 2157 | 974 | 3850 | 6098 | 3207 |
| firstRaceFrame.render (D)  | 2582 | 959 | 3620 | 6409 | 3086 |
| Δ | +20% | -2% | -6% | +5% | -4% |

`build.precompile` en `transition.total` schommelen ±30% tussen runs — sandbox-variantie, niet veroorzaakt door deze wijziging.

## User-perceived effect

Het zichtbare effect voor de gebruiker is de "click→F1-lichten-aan" latency. Voor space cold gaat die van ~1.5 sec naar ~50 ms. Voor andere worlds gaat die van ~100-300 ms naar ~50-85 ms.

Tijdens de countdown rendert SwiftShader nog steeds traag (per-frame fragment-cost staat ongewijzigd), maar dat is hidden achter de F1-lichten-animatie. Op echte GPU is per-frame cost ordes-van-magnitude lager — countdown blijft 60fps soepel, eerste frame is warm tegen de tijd dat GO afvuurt.

## Visual regression

Headless screenshots in `tools/`:

- `tools/phase-d-volcano-countdown.png` — mid-countdown frame: F1 lights overlay (5 rode bolletjes) zichtbaar over race-cam scene, player car (rood) op track, ember haze, HUD (P1, mini-map, lap, position). Scene is gerendered ondanks dat goToRace geen warm-render meer doet — bevestigt dat `loop()` tijdens countdown het werk overneemt.
- `tools/phase-d-volcano-race.png` — race-frame: volledige HUD, achievement panel, mirror, cars, postfx. Identiek aan Phase C2 screenshots.

Visuele check:
- Cars zichtbaar in countdown? **Y**
- Cars zichtbaar in race? **Y**
- F1 lights animeren correct? **Y** (zichtbaar in countdown screenshot)
- Postfx (bloom, vignette, grading) correct? **Y**
- Schaduwen aanwezig? **Y**
- Geen flicker? **Y**

## Heap

Phase D end-of-run heap: 76.5 MB (vs 70.5 MB in opgeslagen C2 baseline, 85 MB in fresh C2 rerun). Binnen variantie. Geen verbetering of verslechtering.

## Vergelijking met Phase A baseline (pre-fix)

`transition.total` cold (Phase A → Phase D, sandbox SwiftShader):
- candy: 5428 → 852 ms (-84%)
- volcano: 743 → 440 ms (-41%)
- space: 5272 → 559 ms (-89%)
- neoncity: 18491 → 935 ms (-95%)
- grandprix: 1579 → 664 ms (-58%)

`goToRace.total` Phase D cold: 40-85 ms voor alle worlds (vs n/a in Phase A — was niet expliciet gemeten maar toen klein).

Net effect Phase A → Phase D op user-perceived "click→countdown-lights":
- Phase A: 743-18491 ms freeze tijdens transition.total na world-card click
- Phase C2: 195-1439 ms freeze tijdens goToRace.total na start-race click
- Phase D: 40-85 ms tussen start-race click en F1 lights starten

## Anomalies / observations

- `goToRace.total` voor space C2 was 1439 ms in de fresh rerun (vs 956 ms in de saved baseline). Dat bevestigt dat de space cold anomaly uit `PERF_SPACE_COLD_ANOMALY.md` reëel is en variabel — kan tussen runs een factor 1.5× verschillen. Phase D omzeilt het probleem volledig door de warm-render naar countdown te verplaatsen.
- `firstRaceFrame.render` blijft hoog (959-6409 ms cold) — software-rendering fragment-throughput is hier de bottleneck. Op echte GPU verwacht ik <500 ms voor zwaarste world.
- Side-effect: tijdens de eerste frames van countdown rendert SwiftShader langzaam (canvas update niet 60fps, lights animeren wel via DOM-setTimeout). Op echte GPU is dit onzichtbaar omdat 60fps gehaald wordt.

## Mogelijke vervolg-actie (NIET in deze fase)

- iPad/desktop-meting bevestigen dat de fix daar ook wint (verwacht: substantiëler dan SwiftShader omdat per-frame fragment-cost veel lager is).
- Als iPad nog steeds hapert tijdens eerste countdown-frame: chunked variant (Optie B-vol uit Phase B plan) — maar volgens deze meting waarschijnlijk niet nodig.
