# tools/ — performance tooling

Scripts om de game in een headless browser te draaien, perf-data te capturen en te vergelijken. Pure Node + Playwright; geen build-step, geen runtime-deps in `index.html`.

## Wat zit hier

- `perf-run.mjs` — Playwright runner. Doorloopt 5 cold + 5 warm race-cycles per wereld en schrijft `tools/perf-output.json`. Optioneel `--report` om óók `PERF_PHASE_A_REPORT.md` te genereren.
- `perf-report.mjs` — vertaalt een perf-output.json naar een markdown rapport in "current state"-stijl (één run, geen vergelijking).
- `perf-compare.mjs` — diff tussen twee perf-output JSONs. Per-wereld delta-tabel voor de zes kern-metrics + heap. Bedoeld voor SwiftShader-vs-iPad of voor het beoordelen van een wijziging.
- `baselines/` — opgeslagen perf-output JSONs die als referentie dienen. Worden wél getrackt door git (zie `.gitignore`).

`tools/perf-output.json` zelf is gitignored — herproduceerbaar met de runner.

## Hoe te draaien

In de sandbox (Linux + headless chromium pre-installed op `/opt/pw-browsers`):

```sh
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers /opt/node22/bin/node tools/perf-run.mjs --report
```

Output: `tools/perf-output.json` (raw data) + `PERF_PHASE_A_REPORT.md` (rapport in repo root).

Lokaal op een Mac met playwright globally geïnstalleerd:

```sh
npx playwright install chromium   # eenmalig
node tools/perf-run.mjs --report
```

De runner start zelf een Python http-server op `localhost:8087` als die nog niet draait. Geen handmatige server nodig.

## Vergelijken van runs

Om twee runs te vergelijken — bv huidige run vs een baseline:

```sh
node tools/perf-compare.mjs tools/baselines/phase-c2-swiftshader.json tools/perf-output.json
```

Schrijft naar stdout. Pipe naar een file als je een markdown report wilt:

```sh
node tools/perf-compare.mjs <baseline> <new> > COMPARE.md
```

## Markers — wat betekent wat

De game-code (na fase A instrumentatie) zet `performance.mark` + `performance.measure` calls op kritieke paden. De runner leest `window.perfLog` na de cycle.

### Transitie-markers (rebuildWorld → buildScene → racestart)

- `transition.total` — wallclock voor `rebuildWorld()` in `js/ui/select.js`. Vuurt wanneer gebruiker een andere wereld kiest.
- `build.disposeScene` — `disposeScene()` aan begin van `buildScene`.
- `build.track`, `build.world`, `build.gameplayObjects`, `build.night`, `build.assetBridge` — substeps van buildScene, in die volgorde.
- `build.precompile` — `_precompileScene()`. Sinds Phase C alleen `renderer.compile()`, geen render meer.
- `build.precompile.compile` — alleen het `renderer.compile()` deel (Phase B split, Phase C verlaagd).
- `build.precompile.render` — alleen de 16×16 off-screen render. Sinds Phase C VERWIJDERD; markeert nu ~0 of ontbreekt.
- `build.postfxWarm` — postfx warm-render in buildScene. Toegevoegd Phase C, verwijderd Phase C2 (verplaatst naar goToRace).
- `build.total` — gehele buildScene.

### Race-side markers (na user klikt Start Race)

- `goToRace.total` — wallclock voor `goToRace()` in `js/ui/navigation.js`. Wanneer gebruiker car-select verlaat.
- `goToRace.makeAllCars` — alleen het `makeAllCars()` deel.
- `goToRace.postfxWarm` — postfx warm-render ná `makeAllCars` + camera-reposition. Toegevoegd Phase C2.

### Countdown / first-frame markers

- `go.toFirstFrame` — wallclock van GO-event tot rAF-tick die `gameState==='RACE'` ziet. Excl. de render zelf.
- `firstRaceFrame.render` — duur van de eerste echte race-frame render via `renderWithPostFX`. Sinds Phase C2 ook altijd gemeten (niet alleen onder `?debug`).

### Asset & audio markers

- `assets.models` / `assets.textures` — load-tijd van GLTF + textures via `js/assets/loader.js`.
- `assets.preloadWorld.total` — totaal voor alle `preloadWorld` tasks.
- `audio.musicStems` — load-tijd van music stems via `js/audio/samples.js`.

In de huidige checkout missen de manifest-files (404'en); deze metingen tonen de fail-fast tijd, niet echte decode cost.

### Heap markers

- `heap.goToTitle`, `heap.goToWorldSelect`, `heap.goToSelect`, `heap.goToRace`, `heap.raceFinish` — JS heap MB op deze events. Alleen Chrome-only via `performance.memory`.

### Shader-program tracking

- `shaderPrograms.afterBuild` — `renderer.info.programs.length` aan einde van buildScene.
- `shaderPrograms.delta` — netto delta van programs over buildScene-window. Vaak negatief omdat `disposeScene` material-disposes triggert die programs evict.
- `shaderPrograms.atFirstFrame` — count op de eerste race-frame. Helpt detecteren of er nog programs gecompileerd worden ná precompile.

## Hoe nieuwe markers toevoegen

1. In je code: `if (window.perfMark) perfMark('mijn:start'); ... perfMark('mijn:end'); perfMeasure('mijn.label', 'mijn:start', 'mijn:end');`
2. De helpers staan in `js/core/debug.js` onderaan. `window.perfLog` is een ringbuffer van max 500 entries.
3. Voor extra metadata bij een entry, push direct naar `window.perfLog`:
   ```js
   window.perfLog.push({ name: 'iets.special', ms: 0, t: performance.now(), world: activeWorld, extra: ... });
   ```
4. Update `perf-report.mjs` als de nieuwe marker in het rapport moet komen, of `perf-compare.mjs` als hij tussen runs moet vergeleken worden (zie `METRICS` array in compare).

## ?perfauto=1 URL flag

De runner navigeert naar `?perfauto=1`. Wat dat doet (zie `js/core/boot.js:20-44`):

- Zet `localStorage.src_debug='1'` als nog niet gezet (activeert de dbg-logger).
- Voegt `'perf'` toe aan `localStorage.src_debug_channels`.
- Zet `window._perfAuto = true`.
- Aan einde van boot: zet `window._bootDone = true` (signaal voor de runner / iPad protocol script om door te gaan).
- Exposeert `window._perfHooks = { goToWorldSelect, pickWorld, startRace, goToTitle }` voor programmatic navigation.

`?perfauto=1` raakt geen game-logica anders dan logging + de hooks. Veilig om in productie achter te laten — alleen actief wanneer expliciet opgeroepen.

## Baselines

`tools/baselines/` bevat snapshots die als referentie dienen voor toekomstige vergelijkingen.

- `phase-c2-swiftshader.json` — Phase C2 (postfx-warm in goToRace) gemeten via headless SwiftShader op 2026-05-02. Referentie voor fase-D evaluaties en voor de iPad-vergelijking.

Nieuwe baseline opslaan na een major fix:

```sh
cp tools/perf-output.json tools/baselines/<descriptive-name>.json
git add tools/baselines/<descriptive-name>.json
```

## SwiftShader caveat

De headless runner gebruikt SwiftShader (CPU-rendering). Absolute milliseconden zijn niet 1-op-1 vergelijkbaar met GPU-rendering op echte hardware. Relatieve verhoudingen tussen werelden of tussen voor/na een fix blijven betekenisvol — maar voor finale go/no-go beslissingen op iPad-targeting is een echte iPad-meting nodig (zie `IPAD_TEST_PROTOCOL.md` in repo root).

## Geschiedenis

- Phase A: instrumentatie + runner (branch `claude/perf-phase-a-instrument-K1GTN`)
- Phase B: diagnose + plan (branch `claude/perf-phase-b-diagnose`)
- Phase C: opt-A toegepast, regressie op SwiftShader (branch `claude/perf-phase-c-fix-A-postfxwarm`)
- Phase C2: car-warmup-gap dichten, grote winst (branch `claude/perf-phase-c2-car-warmup`)
- Tooling follow-up: compare-tool + iPad protocol + analyse-docs (`claude/perf-ipad-tooling`, `claude/perf-analysis-docs`)
