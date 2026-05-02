# Performance Baseline — Project 7 Fase 1

Status: **Template — wachtend op meetdata van Jur.**

Dit document is de input voor Project 7 Fase 2. Tot het ingevuld is met
echte cijfers blijft Fase 2 hypothese-gedreven (zie `PERF_FIX_PLAN.md` voor
de eerste hypothese-cyclus die al gedraaid is in
`claude/fix-performance-stutters-eJCRT`).

**Verschil met `PERF_AUDIT_FINDINGS.md`:** dat document focuste op race-start
freeze (twee specifieke verdachten: shader-compile en lazy audio-init). Dit
document is breder — per-wereld doorlopende cijfers + stress-scenarios voor
mid-game stutters en world-switch leaks.

---

## Test-setup (vul in voor je meet)

| Item | Waarde |
|---|---|
| Desktop device | _bv. MacBook Pro M1 16GB / Windows desktop met RTX 3060_ |
| Mobile device | _bv. iPhone 14 / iPad Air 5 / Pixel 7_ — **echte device, geen emulator** |
| Browser desktop | _bv. Chrome 131 / Safari 17.2_ |
| Browser mobile | _bv. Safari iOS 17 / Chrome Android 131_ |
| Build (commit) | `git rev-parse --short HEAD` resultaat |
| Datum meting | _yyyy-mm-dd_ |

---

## Hoe je deze meting draait

### Voorbereiding

1. Activeer debug-instrumentation:
   ```js
   localStorage.setItem('src_debug','1');
   location.reload();
   ```
2. Open `Ctrl+Shift+P` perf-overlay en laat 'm aan staan.
3. Hard reload (Cmd-Shift-R / Ctrl-Shift-R) om GPU-driver caches te legen.
4. Sluit alle andere tabs (Chrome alloceert GPU-memory per renderer-process).

### Per wereld (8 werelden × 1 lap)

1. Wereld kiezen → auto kiezen → "RACE".
2. Wacht tot countdown loopt + GO komt.
3. Rij 1 volledige lap. Houd de overlay in beeld.
4. Noteer in de tabel hieronder: avg FPS, min FPS (laagste momentane waarde
   die je zag), draw-calls, triangles, heap (start = direct na GO, eind = na
   finish-line crossing van lap 1).
5. Quit-to-menu, ga naar de volgende wereld.

### Stress-scenarios (apart, ná de 8-werelden ronde)

Zie tabel verderop in dit document.

### DevTools profile per wereld

Voor elke wereld 1× een Performance-tab recording van **10 seconden midden in
de race** (dus na lap 1 begin, vóór lap 1 eind). 10s is genoeg om GC-spikes
en main-thread blockers te zien zonder dat de profiler-overhead het beeld
vervormt.

Save als `audit-runs/perf-<world>-desktop.json`. (Map mag in `.gitignore`.)

### Memory profile

Eén heap-snapshot **direct na boot** + één heap-snapshot **na 10× world-
switch in pause-menu**. Vergelijk de "Comparison" view in DevTools om te
zien of er een type expliciet groeit. Save als
`audit-runs/heap-before.json` en `audit-runs/heap-after-10switch.json`.

---

## Per-wereld cijfers — desktop

| Wereld | Avg FPS | Min FPS | Draw calls | Triangles | Heap start (MB) | Heap eind (MB) | Programs | Textures | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Grand Prix | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |  |
| Space | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |  |
| Deep Sea | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |  |
| Candy | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |  |
| Neon City | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |  |
| Volcano | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |  |
| Arctic | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |  |
| Theme Park | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |  |

**Acceptatie-target desktop:** alle werelden ≥ 60 fps gemiddeld, ≥ 50 fps
minimum. Werelden onder die drempel worden topprioriteit voor Fase 2.

---

## Per-wereld cijfers — mobile

| Wereld | Avg FPS | Min FPS | Draw calls | Triangles | Heap start (MB) | Heap eind (MB) | Notes |
|---|---|---|---|---|---|---|---|
| Grand Prix | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |  |
| Space | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |  |
| Deep Sea | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |  |
| Candy | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |  |
| Neon City | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |  |
| Volcano | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |  |
| Arctic | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |  |
| Theme Park | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _tbd_ |  |

**Acceptatie-target mobile:** alle werelden ≥ 50 fps gemiddeld, ≥ 40 fps
minimum. Op iPad Air 5 / Pixel 7 of beter.

> Safari iOS rapporteert geen `performance.memory` — heap-kolommen blijven
> daar leeg. Vul wel FPS/draws/tris in.

---

## Geobserveerde haperingen — wanneer en waar

Letterlijk wat je zag tijdens de runs. Voorbeeld van een goede entry:

> "Volcano lap 1, ~5 seconden na GO: FPS zakte van 60 naar 38 voor ongeveer
> 200ms. Eruption-animatie was net begonnen. Daarna stabiel."

| # | Wereld | Moment | FPS-dip | Mogelijke trigger | Reproduceerbaar? |
|---|---|---|---|---|---|
| 1 | _tbd_ | _tbd_ | _tbd_ | _tbd_ | _ja/nee/soms_ |
| 2 |  |  |  |  |  |
| 3 |  |  |  |  |  |

---

## Stress-scenarios

| # | Scenario | Verwacht meten | Resultaat | Heap-impact |
|---|---|---|---|---|
| S1 | 10× world-switch heen-en-weer in pause-menu (GP→Space→GP→Volcano→GP→Neon→GP→Candy→GP→Arctic→GP) | Heap stijgt < 10 MB; programs.length stabiliseert na 2 cycli | _tbd_ | _tbd_ |
| S2 | 5-lap race in zwaarste wereld (vermoedelijk Neon City of Candy) | Geen monotone heap-groei tussen laps | _tbd_ | _tbd_ |
| S3 | Shift+P toggle tijdens race (procedural ↔ samples) | Geen audio-glitch; geen heap-spike >2 MB | _tbd_ | _tbd_ |
| S4 | Night-toggle tijdens race | Geen FPS-dip > 100ms | _tbd_ | _tbd_ |
| S5 | Weather-toggle tijdens race (clear → storm → snow) | Geen FPS-dip > 200ms | _tbd_ | _tbd_ |
| S6 | Race met 4 AI-cars dicht bij elkaar (drafting in pack) tijdens lap 2 | Geen frame-time spike > 33ms | _tbd_ | _tbd_ |
| S7 | Quick-restart (R-hold) tijdens race | Geen leak; programs.length herhaalbaar | _tbd_ | _tbd_ |

---

## DevTools observaties

### Performance tab — top 3 main-thread blockers per wereld

Voor elke wereld na 10s recording: kijk in de "Bottom-Up" tab welke functie
de meeste self-time eet. Top 3 hieronder.

| Wereld | #1 functie | self-time (ms) | #2 | self-time | #3 | self-time |
|---|---|---|---|---|---|---|
| Grand Prix |  |  |  |  |  |  |
| Space |  |  |  |  |  |  |
| Deep Sea |  |  |  |  |  |  |
| Candy |  |  |  |  |  |  |
| Neon City |  |  |  |  |  |  |
| Volcano |  |  |  |  |  |  |
| Arctic |  |  |  |  |  |  |
| Theme Park |  |  |  |  |  |  |

### Memory tab — top groeiende objecten na 10× world-switch

In DevTools "Comparison" view: welke types groeien tussen heap-before en
heap-after-10switch?

| Type | Aantal voor | Aantal na | Delta | Vermoedelijke bron |
|---|---|---|---|---|
| _bv. WebGLProgram_ |  |  |  |  |
| _bv. CanvasTexture_ |  |  |  |  |
| _bv. BufferGeometry_ |  |  |  |  |
| _bv. Material_ |  |  |  |  |
| _bv. PointLight (Three.js)_ |  |  |  |  |

### Rendering tab — paint flashing observaties

Heeft een wereld unexpected layout/paint thrashing buiten de canvas? (HUD-
elementen die per frame de hele HUD-balk doen flashen, etc.)

| Wereld | Paint hotspots | Bron |
|---|---|---|

---

## Mid-race spike-ringbuffer dump

Plak hier per wereld de uitvoer van `dbg.spikes()` na ~30 sec rijden. Zorg
dat je elke wereld in een aparte run doet zodat de buffer niet vermengd
raakt — clear met `dbg.clearSpikes()` tussendoor.

```json
{
  "grandprix": [],
  "space": [],
  "deepsea": [],
  "candy": [],
  "neoncity": [],
  "volcano": [],
  "arctic": [],
  "themepark": []
}
```

---

## Eerste hypotheses op basis van de cijfers

> Dit veld blijft leeg tot de cijfers binnen zijn. Top-3 wordt gekozen op
> basis van: (a) grootste gap tussen target en gemeten FPS, (b) duidelijkste
> heap-groei in stress-scenarios, (c) reproduceerbare spikes uit
> ringbuffer-dump.

### Hypothese 1
- **Wat:** _tbd_
- **Bewijs uit baseline:** _tbd (verwijs naar cell of run)_
- **Voorgestelde aanpak Fase 2:** _tbd_

### Hypothese 2
_tbd_

### Hypothese 3
_tbd_

---

## Reeds bekende kandidaten (zie STATIC_HOTSPOTS.md)

Voor je gaat meten: lees `STATIC_HOTSPOTS.md` zodat je weet waar je extra
op moet letten tijdens de runs. Die lijst is op basis van code-lezen, niet
van metingen — dus mogelijk vals-positieven, maar het scheelt zoekwerk
tijdens je sessie.

Specifiek: hou tijdens je runs in de gaten of:
- Neon City / Candy een hoger draw-call getal hebben dan andere werelden
  (vermoedelijke oorzaak: 60+ PointLights in scene, zie hotspot #3)
- `updateDamageSmoke` na ~3 hits FPS doet zakken (per-frame `new Vector3`,
  hotspot #1)
- Heap stijgt monotoon over 5 laps in regen-modus (hotspot #2,
  `new Color(base)` per frame in `updateWeather`)
- World-switch GP→Volcano→GP geeft een program-count groei
  (vermoedelijke oorzaak: shader-permutaties per light-count, hotspot #5)

---

## Run-checklist

- [ ] 8 desktop runs (1 per wereld, hele lap, overlay zichtbaar)
- [ ] 8 mobile runs (1 per wereld, hele lap)
- [ ] 7 stress-scenarios doorgevoerd
- [ ] DevTools Performance recording per wereld (10s, midden in race)
- [ ] Heap-snapshot voor + na 10× world-switch
- [ ] Spike-ringbuffer dumps per wereld
- [ ] Top-3 hypotheses gekozen
- [ ] Beperkingen expliciet vermeld (bv. "geen iPhone available", "Safari
      heeft geen heap stats")

Pas als deze checkbox compleet is gaat Fase 2 op een **meet-gedreven**
manier verder. Tot dat moment volgt Fase 2 de hypothese-gedreven plan in
`PERF_FIX_PLAN.md`.
