# Perf — heap-growth audit (post-Phase-C2)

Korte audit van de 18 → 73 MB heap-groei over 10 race-transities die in Phase B/C/C2 gemeten werd. Geen fixes — alleen bevindingen + categorisering. Cijfers zijn van tools/baselines/phase-c2-swiftshader.json.

## Cijfers in context

- App boot: 17.84 MB
- Na 10 transities (5 cold + 5 warm): 70.54 MB
- Δ +52.7 MB
- Geen monotone groei — wel fluctuaties met GC-pieken (zie cold/space → cold/neoncity die 38→66→66 MB doet, dus GC vóór neoncity).

Geen acuut probleem, geen evidente unbounded leak. Wel meer retentie dan minimum noodzakelijk.

## Wat goed gaat

Bevestigd via grep: deze cleanup-paden werken.

- `disposeScene` (`js/core/scene.js:44-68`) — traverseert alle objecten, dispose't geometries/materials voor non-shared resources. Slaat assets met `userData._sharedAsset=true` over (HDRI envMap, PBR ground textures, headlight beam mask).
- `_disposeMat` dispose't ook map/normalMap/roughnessMap apart, met dezelfde sharing-check.
- Per-wereld dynamic arrays worden gereset met `array.length = 0` aan begin van elke `buildScene` (scene.js:337-365) — voorkomt dat oude builders' element-references door de Garbage Collector als alive worden gezien via die arrays.
- `disposeSnapshotBakery` (`js/ui/select.js:246`) wordt aangeroepen in `goToRace` en `goToTitle`, dispose't snap-scene-geometries + textures + render-target.
- Skid marks worden actief opgeruimd: oudste boven cap (80) wordt direct gedisposed en uit scene gehaald (`js/effects/visuals.js:454`).
- Ghost mesh wordt vervangen op `buildGhostMesh()` met dispose+remove van vorige (`js/gameplay/ghost.js:24`).
- Themepark fireworks ruimen zichzelf op na hun lifetime (geometry+material dispose, `js/gameplay/finish.js:193`).

## Waar retentie waarschijnlijk vandaan komt

Geordend op vermoedelijke impact (groot → klein), niet bewezen met instrumentatie.

### 1. `disposeSharedCarMats` wordt nooit aangeroepen

`js/cars/car-parts.js:98` definieert + exporteert het, maar grep door alle `js/` vindt geen aanroep. Shared car mats blijven dus de hele sessie alive (paint defaults, glass mat, chassis grey, wheel rubber, etc.). Per design — ze worden hergebruikt over alle cars en alle worlds. Maar het is een groep van ~10-15 materials + bijbehorende textures (rim, headlight beam-mask). Geschatte grootte: <5 MB. Niet de hoofdlaak; design-keuze.

### 2. `_snapCache` blijft persistent na bake

`js/ui/select.js:12` houdt 2D HTMLCanvasElement-snapshots per gebakken auto. Comment in `disposeSnapshotBakery` (regel 261-262): "_snapCache blijft — 2D canvases nemen alleen JS heap memory in, geen GPU memory. Snel weergave bij volgende SELECT-bezoek zonder re-bake." Bewuste cache.

Per car: SNAP_W × SNAP_H × 4 bytes. Met ~15-20 cars in totaal en typisch SNAP_W=240 SNAP_H=180: ~700 KB per car × 20 = 14 MB max. Reëel waarschijnlijk minder (alleen gebakken cars). Materieel effect maar gewenste cache.

### 3. Three.js' `WebGLPrograms` cache groeit per build

Phase B noteerde: `disposeScene` evict programs via `material.dispose()` events, maar `buildScene` voegt nieuwe toe. In de praktijk pendelt het aantal: programs.afterBuild was 24-110 over de werelden. Geen groei tussen runs. Niet de oorzaak.

### 4. DOM-toast retention via `_achievePopupEl`

`js/gameplay/achievements.js:127-133` — pooled toast element wordt 1× geappend aan body en blijft daar voor de hele sessie. Eén element met inline style. <5 KB. Verwaarloosbaar maar bewust gepoold.

### 5. `floatText` DOM-elementen leven 1.2 sec

`js/effects/visuals.js:397-411` — append een fresh div per call, removed na 1.2 sec via setTimeout. Achievement-cascade na finish kan 8-10 toasts in korte tijd vuren → 8-10 div's tegelijk → opgeruimd na 1.2 sec.

Risico: als de race-finish flow setTimeouts stapelt (zie `finish.js:54,62,72,79,151,156`), en die callbacks captureren scene-references in hun closures, dan blijven die scene-refs alive tot de timeout fired. Maximum is een paar honderd ms tot enkele seconden — niet langdurig.

### 6. Achievement / pause / score state in `window._lapRecords`, `window._highScores`, etc.

Persistent state voor lap-records, unlocks, daily-challenge progress. Groeit gradueel over sessies maar wordt geserialiseerd via `localStorage` (`js/persistence/save.js`). In-memory grootte: <100 KB. Geen leak, gewenste persistentie.

### 7. Audio engine + WebAudio nodes

`engineGain`, `_pendingRaceMusic`, `musicSched` blijven alive over races. `engineGain` wordt 1× aangemaakt en hergebruikt (init in goToRace, niet opnieuw per race). Music schedulers worden bij goToTitle gestopt en gefade-out via `_fadeOutMusic`, maar de gerefereerde `setInterval` pointers + sample-buffers blijven mogelijk via closure alive tot fade voltooid.

`js/audio/samples.js` LRU cache (LRU_MAX=2) van music-stems per wereld. Bewust gecached.

### 8. Closures in `setTimeout` chains

Top files met de meeste setTimeouts: finish.js (10), hud.js (7), countdown.js (7), tracklimits.js (5), music.js (5). De finish.js cascade plant toasts en banner-messages op T+0 tot T+4500 ms. Tijdens die window houden de closures referenties naar `_achStats`, `_todayChallenge`, `getPositions()` resultaten enz. Allemaal kortlevend (<5 sec).

Geen lange-leefte setIntervals gevonden behalve `setInterval(window._updateDebugBadge, 330)` in debug.js (alleen actief met `?debug` URL flag) en eventuele MusicLib internals.

## Wat bewust persistent blijft

- `getSharedCarMats()` materials (per design, hergebruik)
- `_softHeadlightTex` (`js/cars/build.js:19`, één keer aangemaakt, `_sharedAsset:true`)
- `_snapCache` (per design, snel terugkeer naar SELECT)
- `window.Assets` cache (HDRI/textures/GLTF — manifest geeft 404 in deze checkout dus cache is leeg in praktijk)
- `_audioCtx` + alle WebAudio nodes
- `window._lapRecords` etc.

## Geen evidente leak

Op basis van grep en code-review: er is geen plek waar een mesh/material/geometry herhaaldelijk wordt aangemaakt zonder corresponding dispose. De groei van 18→73 MB is grotendeels een combinatie van:

- Three.js' interne caches (WebGLPrograms, attribute buffers, render-list pooling)
- 2D snap-canvases voor cars die geselecteerd zijn geweest
- Gradueel oplopende game-state (lap-records, ghost-best per world, achievement progress)
- WebAudio buffer-pooling

Geen actie nodig voor Phase D *tenzij* iPad-meting laat zien dat de heap snel naar limit-MB schiet. Op desktop SwiftShader bleef alles ruim binnen `jsHeapSizeLimit` (~2 GB).

## Mogelijke vervolg-meting (NIET nu doen)

Als de iPad performance-test toont dat heap een probleem is:

1. **`renderer.info.memory` snapshot na elke transitie** — voeg toe aan `_perfHeap()` in navigation.js (was tijdelijk in Phase B, weer verwijderd in C). Toont of geometries/textures monotoon groeien per buildScene.
2. **Chrome DevTools Memory snapshot voor/na 10 transities** — diff toont welke objecten retentie-percentage hebben. Vereist desktop-Chrome, niet iPad.
3. **WebGL memory inspector** (extension) — laat per-resource zien wat alive is op de GPU. Kan unmatched buffer/texture allocaties detecteren.

Niet uitvoeren tenzij iPad-meting de heap-groei als probleem identificeert.
