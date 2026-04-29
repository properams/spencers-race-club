# Performance Audit — Findings

Status: **Phase 1 instrumentation klaar — meetdata nog te verzamelen.**

Branch: `claude/fix-performance-stutters-eJCRT`.

---

## Doel

Twee performance-issues isoleren met meetdata, geen aannames:

1. **Start-freeze (HOOG)** — direct na "GO" 0.5–2s freeze op iPad/mobile,
   sporadisch op desktop.
2. **Mid-game stutters (LAAG)** — af en toe haperen tijdens race op desktop,
   patroon nog onbekend.

---

## Wat de instrumentation doet

Alles staat achter `?debug` in de URL of `localStorage.setItem('src_debug','1')`.
Productie-builds krijgen 0 overhead.

### Performance overlay (Ctrl+Shift+P)

Zie `js/core/perf.js`. De bestaande FPS/heap/draw-calls panel is uitgebreid met:

- **Frame-time histogram** over laatste 60 frames, 8 buckets:
  `<17ms · 17–25 · 25–33 · 33–50 · 50–83 · 83–150 · 150–300 · 300+`.
- **Spike counts** `>33ms` en `>50ms` in laatste 60 frames.
- **Heap delta** sinds vorige refresh (0.5s interval). >1 MB/0.5s = mogelijk GC-pressure.
- **Programs.length** uit `renderer.info` — verandering tussen frames betekent
  shader-compilatie.
- **Audio state line**: `audioCtx.state`, oscillator-count, actieve scheduler-class
  (`RaceMusic:neoncity` vs `StemRaceMusic:neoncity` etc.).
- **Recent EVENTS** lijst (laatste 3 race-event markers).
- **Top SPIKES** lijst (top 3 grootste spikes uit ringbuffer).

### Race-start markers

Vier markers op vaste momenten + 2 extra rond muziek-dispatch:

| Marker | Waar gezet | Wat het meet |
|---|---|---|
| `CD-START` | `runCountdown` begin (`countdown.js`) | snapshot vlak voordat de 5 lichten beginnen |
| `GO` | `runCountdown` onGo callback fired (`countdown.js`) | snapshot exact op moment van groen licht |
| `GO+1s` | setTimeout 1000ms na GO | snapshot 1 sec na start |
| `GO+3s` | setTimeout 3000ms na GO | snapshot 3 sec na start |
| `MUSIC-DISPATCH-START` / `-DONE` | rond `_safeStartMusic` (T1+380ms) in `navigation.js` | isoleren van scheduler-spike |
| `FIRST-RACE-FRAME` | eerste `renderWithPostFX` met `gameState==='RACE'` (`loop.js`) | inclusief delta in `programs.length` en `textures` count |

Elke marker captured: `heapMB`, `drawCalls`, `triangles`, `programs`, `geometries`,
`textures`, `audioCtx.state`, `audioTime`, `MusicLib._oscCount`, `engineInit`,
`musicSchedKind`, `weatherMode`, `fxEnabled`.

Console-output: `[t][raceEvent] CD-START {...}` voor elk event.

Programmatic toegang in console: `dbg.raceEvents()`.

### Zone-measures (verdachten uit Race Start Inventory)

`dbg.measure(channel, label, fn)` wikkelt sync-blocks. Meet wallclock, log
naar console als duur `>16ms`, push altijd naar `dbg.measures()` ringbuffer.

Wired in:

- **`initEngine`** (`engine.js`) — eerste keer de 4-osc + tire-noise pipeline
  wordt opgezet. Triggert bij eerste `updateEngine()` call op T3.
- **`raceMusic.start`** (`navigation.js` setTimeout 380) — wikkelt
  `_safeStartMusic(_createRaceMusicForWorld)`. Zowel `RaceMusic` als
  `StemRaceMusic` start gaat hierdoor.
- **`firstRaceFrame.render`** (`loop.js`) — eerste post-FX render met
  `gameState='RACE'`. Vangt shader-compile + texture-upload spikes.

### Spike detector (mid-game stutters)

Permanent rAF chain wanneer `dbg.enabled`. Bij elk frame met
`dt > 50ms` wordt een entry naar `dbg.spikes()` geschreven met:

- `t` (sessie-uptime), `dt`, `gameState`, `activeWorld`, `finalLap`,
  `weatherMode`, `drawCalls`, `programs`, `textures`, `oscCount`.

Console: `[t][spike] 87.3ms {gameState:'RACE',...}`.

Ringbuffer: `dbg.spikes()` (max 20).

Onafhankelijk van Ctrl+Shift+P overlay.

---

## Hoe Jur de meting draait

### Activeren

```js
// In browser console, BEFORE openen van de game:
localStorage.setItem('src_debug', '1')
location.reload()
```

(Of open met `?debug` query-param.)

### Desktop runs (Chrome of Safari)

Doe **per wereld 5 runs**, vooral `grandprix`, `neoncity`, `space`, `volcano`
(verschillende postfx-uniforms en world-mat sets). Voor elke run:

1. Open game. Ctrl+Shift+P aan zodat overlay zichtbaar is.
2. Wereld kiezen → auto kiezen → "RACE".
3. Wacht tot countdown loopt en GO komt.
4. Na ~5 seconden in race: open console.
5. Voer uit:
   ```js
   copy(JSON.stringify({
     events: dbg.raceEvents(),
     spikes: dbg.spikes(),
     measures: dbg.measures()
   }, null, 2))
   ```
6. Plak in een nieuw bestand: `audit-runs/desktop-<world>-<n>.json`.
7. `dbg.clearRaceEvents(); dbg.clearSpikes(); dbg.clearMeasures()` voor volgende run.
8. Quit naar menu en herhaal.

### iPad / mobile run (verplicht voor minstens 1 sample)

**Optie A — Echte iPad via Safari Web Inspector (voorkeur):**

1. Op iPad: Settings → Safari → Advanced → Web Inspector AAN.
2. Op Mac: Safari → Develop → [iPad naam] → kies de game-tab.
3. In de remote console: zelfde flow als desktop.
4. Sla op als `audit-runs/ipad-<world>-1.json`.

**Optie B — Android via Chrome remote debugging:** zelfde flow, `chrome://inspect`.

**Optie C (laatste redmiddel) — Chrome DevTools mobile emulation + 6× CPU
throttle + 4G network throttle.** Markeer de file expliciet als
`mobile-sim-*` zodat we weten dat het een proxy is.

### Wat invullen in dit document

Plak per run de top-3 spikes + de 4 markers in de tabellen hieronder.

---

## Meetdata — Desktop runs

> Vul aan zodra Jur runs heeft gedaan.

### Run 1 — `grandprix` — desktop

| Marker | t (s) | heap (MB) | drawCalls | tris | programs | textures | audioState | oscCount | musicSched | notes |
|---|---|---|---|---|---|---|---|---|---|---|
| CD-START | _tbd_ |  |  |  |  |  |  |  |  |  |
| GO | _tbd_ |  |  |  |  |  |  |  |  |  |
| GO+1s | _tbd_ |  |  |  |  |  |  |  |  |  |
| GO+3s | _tbd_ |  |  |  |  |  |  |  |  |  |
| FIRST-RACE-FRAME | _tbd_ |  |  |  |  |  |  |  |  | progDelta=_tbd_ |

**Top spikes (>50ms):**
| t | dt (ms) | gameState | drawCalls | programs | oscCount | hypothese |
|---|---|---|---|---|---|---|

**Zone measures:**
| label | dur (ms) |
|---|---|
| initEngine | _tbd_ |
| raceMusic.start | _tbd_ |
| firstRaceFrame.render | _tbd_ |

### Run 2 — `neoncity` — desktop

> StemRaceMusic actief (echte stems geladen), interessant ter contrast met procedurele werelden.

_(zelfde tabellen als Run 1)_

### Run 3 — `space` — desktop
### Run 4 — `volcano` — desktop
### Run 5 — `arctic` — desktop

---

## Meetdata — Mobile runs

### Run M1 — `grandprix` — iPad / Android / sim?

_(zelfde tabel)_

---

## Mid-game spike-ringbuffer dump

Plak hier de uitvoer van `dbg.spikes()` na ~30 sec in race rijden door een
hele ronde:

```json
[
  ...
]
```

---

## Top-5 verdachte zones (initieel, voor metingen)

Zie ook de Race Start Inventory uit Gate 0.

| # | Verdachte | Bucket | Bewijs (cijfers) | Notes |
|---|---|---|---|---|
| 1 | Wereld-specifieke shader-compilatie op 1e race-frame met niet-warmup wereld | A (shader compile) | _tbd: progDelta van FIRST-RACE-FRAME marker_ | Boot-warmup draait alleen op default GP wereld; rebuildWorld doet geen 2e warmup |
| 2 | `initEngine()` lazy op 1e race-frame (4 osc + 2sec noise buffer + filters) | E (lazy creation) | _tbd: initEngine measure_ | Hoist naar countdown |
| 3 | `RaceMusic`/`StemRaceMusic` constructor + `start()` op T1+380ms | E (lazy creation) + C (audio decode) | _tbd: raceMusic.start measure_ | Voor stems: 3× BufferSource.start tegelijk; voor procedural: tientallen filters/gains |
| 4 | HDRI/PBR async upgrade via `maybeUpgradeWorld` mid-race | B (texture upload) | _tbd: textures count delta in spikes_ | Kan ook mid-game stutter veroorzaken |
| 5 | Eerste shadow-pass met cars op 1e race-frame | A (shader compile) of D (depth pass kost) | _tbd: drawCalls vs FPS_ | sunLight.castShadow 1024×1024 |

---

## Conclusies

> In te vullen na Phase 2 root-cause analyse.

---

## Beperkingen van deze meting

- `performance.memory` is alleen in Chrome beschikbaar — Safari runs hebben
  geen heap-metrics.
- `dt`-cap in `loop.js` (`Math.min(clock.getDelta(), .05)`) maskeert grote
  frame-times in de game-logica zelf, maar de spike-detector werkt op raw
  `performance.now()` dus die ziet wel de echte stutter.
- AudioBufferSource counts moeten via `MusicLib._oscCount` (procedurele osc).
  StemRaceMusic registreert NIET in die teller — voor stem-werelden zie ik
  alleen 3 buffer-sources die niet getelt worden. Optioneel: in Phase 2 kan
  ik een `dbg`-only proxy om `audioCtx.createBufferSource` zetten als de
  data het waard is.
- Mobile-only freeze kan zonder echte iPad nooit volledig gevalideerd worden.

---

## Run-checklist

- [ ] 5 desktop runs gedaan (verschillende werelden)
- [ ] Minstens 1 echte mobile run (iPad of Android)
- [ ] Mid-game spike-ringbuffer dump verzameld
- [ ] `audit-runs/*.json` files in repo of gedeeld met Claude
- [ ] Beperkingen die optreden expliciet vermeld
