# Performance Phase A Report

## Test environment
- Browser: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.7390.37 Safari/537.36
- Method: playwright-chromium
- Date: 2026-05-02
- URL: http://localhost:8087/?perfauto=1
- Note: desktop-sandbox meting; mobiele meting volgt later
- WebGL backend: headless-chromium uses SwiftShader software-rendering. Shader compilation cost (`build.precompile`) is therefore CPU-bound and not directly comparable to GPU timings on real desktop or mobile. The relative ordering between worlds is still meaningful; absolute milliseconds are not.
- Asset manifest: `assets/manifest.json` references files that 404 in this checkout (see CLAUDE.md "Audio-systeem" — game falls back to procedural). Long `assets.textures` / `audio.musicStems` numbers below are dominated by 404-response timings, not actual decode cost. Background preloads do **not** block the main thread or buildScene; they are listed separately at the bottom of this report.

## World transition (select → race) — buildScene timings
All numbers in ms. `transition.total` is the user-facing rebuildWorld duration; `build.*` are substeps. Cold visit order: candy → volcano → space → neoncity → grandprix (boot-default last so its rebuild fires for real).

| World     | Cold total | dispose | track | world | gameplay | night | assetBridge | precompile | Warm total |
|-----------|-----------:|--------:|------:|------:|---------:|------:|------------:|-----------:|-----------:|
| candy     |     5428.3 |    13.6 |   7.9 |  61.4 |      8.7 |   0.4 |         0.0 |     2708.2 |     1536.0 |
| volcano   |      742.8 |    19.7 |   9.5 |  26.7 |     50.7 |   0.3 |         0.0 |      630.3 |      378.5 |
| space     |     5271.8 |    15.0 |   3.3 |  41.5 |     25.6 |   0.2 |         0.0 |     5176.5 |     2254.5 |
| neoncity  |    18490.7 |    12.6 |   4.2 |  55.4 |      9.4 |   0.4 |         0.0 |    18399.9 |     9127.3 |
| grandprix |     1579.2 |    26.0 |   3.2 |  36.4 |     12.7 |   0.3 |         0.0 |     1496.9 |     1298.8 |

## Countdown → first race frame
`go.toFirstFrame` = wall-clock ms between GO-event and the rAF tick where loop() first sees gameState===RACE (excludes the actual render call). `firstRaceFrame.render` = duration of that render call itself. Together they cover the visible "GO → moving car" window.

| World     | go.toFirstFrame cold | warm  | firstRaceFrame.render cold | warm  | Shaders @ buildScene end | Shaders @ firstFrame |
|-----------|---------------------:|------:|---------------------------:|------:|-------------------------:|---------------------:|
| candy     |                  8.0 |   2.9 |                     1687.0 | 526.9 |                     24.0 |                 26.0 |
| volcano   |                  5.9 |   4.2 |                      617.3 | 266.4 |                     45.0 |                 46.0 |
| space     |                  5.2 |   3.3 |                     2519.9 | 1066.7 |                     68.0 |                 71.0 |
| neoncity  |                  4.1 |   4.8 |                     4445.8 | 1486.7 |                     97.0 |                 98.0 |
| grandprix |                  3.3 |   2.6 |                     2001.5 | 980.2 |                    110.0 |                111.0 |

## Asset loading per world
Models = HDRI + GLTF/OBJ/FBX props. Textures = ground-set + skybox layers. Audio = music stems.

| World     | Models (ms) | Textures (ms) | Audio (ms) | Total preload (ms) |
|-----------|------------:|--------------:|-----------:|-------------------:|
| candy     |         0.4 |        2683.3 |     5747.3 |             8430.3 |
| volcano   |         0.5 |        2961.0 |      746.4 |             3706.8 |
| space     |         0.0 |           0.0 |     5274.4 |             5274.3 |
| neoncity  |         0.4 |       14609.6 |    33089.6 |            33102.2 |
| grandprix |           – |             – |     1582.4 |                  – |

## Heap progression
| Event                         | Heap MB |
|-------------------------------|--------:|
| App boot                      |    22.6 |
| After goToWorldSelect (cold)  |    20.6 |
| Race start cold — candy      |    21.7 |
| Race +3s cold — candy        |    60.7 |
| Race start cold — volcano    |    30.1 |
| Race +3s cold — volcano      |    31.0 |
| Race start cold — space      |    38.6 |
| Race +3s cold — space        |    53.3 |
| Race start cold — neoncity   |    65.6 |
| Race +3s cold — neoncity     |    67.3 |
| Race start cold — grandprix  |    92.3 |
| Race +3s cold — grandprix    |    70.2 |
| Race +3s warm — candy        |    73.8 |
| Race +3s warm — volcano      |    51.9 |
| Race +3s warm — space        |    51.4 |
| Race +3s warm — neoncity     |    72.5 |
| Race +3s warm — grandprix    |    82.3 |
| End of run                    |    59.7 |

## Top 5 hottest synchronous segments
Main-thread blocking work — these are the segments that can cause a perceptible freeze.

1. `transition.total` — 18490.7 ms — world=neoncity (cold)
2. `build.total` — 18487.9 ms — world=neoncity (cold)
3. `build.precompile` — 18399.9 ms — world=neoncity (cold)
4. `transition.total` — 9127.3 ms — world=neoncity (warm)
5. `build.total` — 9122.4 ms — world=neoncity (warm)

## Top 5 longest background preloads
Async fire-and-forget; does NOT block buildScene. Listed for completeness.

1. `assets.preloadWorld.total` — 33102.2 ms — world=neoncity (cold)
2. `audio.musicStems` — 33089.6 ms — world=neoncity (cold)
3. `audio.musicStems` — 16251.1 ms — world=neoncity (warm)
4. `assets.textures` — 14609.6 ms — world=neoncity (cold)
5. `assets.preloadWorld.total` — 8430.3 ms — world=candy (cold)

## Observations (FACTUAL ONLY)
- candy: transition.total cold 5428ms, warm 1536ms (Δ 3892ms).
  - of which build.precompile cold 2708ms (50% of transition.total).
  - go.toFirstFrame cold 8.0ms (warm 2.9ms).
  - firstRaceFrame.render cold 1687ms, warm 527ms.
  - shader programs added during cold buildScene window: -9.
- volcano: transition.total cold 743ms, warm 379ms (Δ 364ms).
  - of which build.precompile cold 630ms (85% of transition.total).
  - go.toFirstFrame cold 5.9ms (warm 4.2ms).
  - firstRaceFrame.render cold 617ms, warm 266ms.
  - shader programs added during cold buildScene window: -3.
- space: transition.total cold 5272ms, warm 2255ms (Δ 3017ms).
  - of which build.precompile cold 5177ms (98% of transition.total).
  - go.toFirstFrame cold 5.2ms (warm 3.3ms).
  - firstRaceFrame.render cold 2520ms, warm 1067ms.
  - shader programs added during cold buildScene window: -2.
- neoncity: transition.total cold 18491ms, warm 9127ms (Δ 9363ms).
  - of which build.precompile cold 18400ms (100% of transition.total).
  - go.toFirstFrame cold 4.1ms (warm 4.8ms).
  - firstRaceFrame.render cold 4446ms, warm 1487ms.
  - shader programs added during cold buildScene window: 1.
- grandprix: transition.total cold 1579ms, warm 1299ms (Δ 280ms).
  - of which build.precompile cold 1497ms (95% of transition.total).
  - go.toFirstFrame cold 3.3ms (warm 2.6ms).
  - firstRaceFrame.render cold 2002ms, warm 980ms.
  - shader programs added during cold buildScene window: -20.
- Heap from boot 22.64MB to end-of-run 59.66MB (Δ 37.0MB) over 10 race transitions (5 cold + 5 warm).

---
_Generated by tools/perf-run.mjs + tools/perf-report.mjs_
