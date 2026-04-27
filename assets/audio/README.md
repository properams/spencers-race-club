# Audio assets overzicht

Vier asset-categorieën, elk met een eigen manifest in `js/audio/samples.js`
en een eigen graceful fallback. Alle slots zijn optioneel — het systeem
draait gewoon door op procedurele synth voor wat ontbreekt.

| Categorie | Map | Loader | Manifest |
|---|---|---|---|
| Muziek | `music/<world>/` | `_preloadWorld(worldId)` | `MUSIC_MANIFEST` |
| Engine | `engine/<carType>/` | `_preloadEngine(carType)` | `ENGINE_MANIFEST` |
| SFX | `sfx/` | `_preloadSFX()` | `SFX_MANIFEST` |
| Surface | `surface/` | `_preloadSurface(surface)` | `SURFACE_MANIFEST` |

## Muziek

Per-wereld stems voor `StemRaceMusic` (zie `js/audio/music-stems.js`).
Volledige slot-spec + Suno-prompts per wereld: **`music/README.md`**.

## Engine

5 RPM-banden per car-type voor sample-based engine-geluid (vervangt de
4-osc procedural setup uit `engine.js` per car-type). Crossfade tussen
banden op basis van speed-ratio.

| Slot | Functie |
|---|---|
| `idle.ogg` | Stationary / cruise (~0% speed) |
| `low.ogg` | Lage RPM (~20%) |
| `mid.ogg` | Mid RPM (~45%) |
| `high.ogg` | Hoge RPM (~70%) |
| `redline.ogg` | Redline / topspeed (~95%) |

Filenames: `assets/audio/engine/<car-type>/<band>.ogg`. Car-types: `super`,
`f1`, `muscle`, `electric`.

**Bronnen**:
- AI: Suno met "engine loop, [type] car, constant RPM, no melody, loopable"
- Freesound search terms: `"engine loop"`, `"v8 idle"`, `"f1 engine"`,
  `"muscle car v8"`, `"electric motor whine"`. Zoek op CC0/CC-BY licentie.
- Pixabay: vergelijkbare zoektermen, alle gratis.

**Encoding**: ogg vorbis q4, mono mag (engine is centraal, geen stereo
nodig), 44.1 kHz, 4-8 sec loopable, naadloze begin/eind.

**Per-type karakter**:
- `super`: gebalanceerd mid-range V8/V12
- `f1`: hoge whine, gilt boven 8000 RPM
- `muscle`: diepe V8 burble met cam-idle
- `electric`: motor whine + magnetic field hum, geen verbrandingsgeluid

## SFX

Globale one-shots (en één loop voor windHigh). Gedekt met procedurele
fallback in `sfx.js`.

| Slot | Duur | Functie |
|---|---|---|
| `brake.ogg` | 0.2-0.4s | Brake squeal (hoge bandpass noise) |
| `drift1.ogg` | 0.4-0.8s | Tire screech variatie 1 |
| `drift2.ogg` | 0.4-0.8s | Tire screech variatie 2 (random pick) |
| `drift3.ogg` | 0.4-0.8s | Tire screech variatie 3 (random pick) |
| `suspension.ogg` | 0.3-0.5s | Auto landt na sprong (bump thunk) |
| `windHigh.ogg` | 2-3s loopable | Wind boven 65% topspeed (loop) |
| `impactLight.ogg` | 0.4s | Lichte botsing (plastic / glance) |
| `impactHard.ogg` | 0.6-1s | Harde botsing (metal crunch) |
| `glassScatter.ogg` | 0.3s | Glass shatter overlay bij hard impact |

Filenames: `assets/audio/sfx/<slot>.ogg`.

**Bronnen** (allen freesound.org / Pixabay, filter op CC0):
- `"brake squeal"`, `"car braking"`, `"tire skid"` → brake
- `"tire screech"`, `"car drift"`, `"burnout"` → drift1-3 (3 verschillende voor variatie)
- `"car suspension"`, `"car landing"`, `"thud"` → suspension
- `"wind rush"`, `"car wind"`, `"high speed wind"` → windHigh (zorg loopable)
- `"car crash light"`, `"plastic impact"` → impactLight
- `"car crash"`, `"metal crunch"` → impactHard
- `"glass shatter"`, `"glass break"` → glassScatter

**Encoding**: ogg vorbis q4, mono of stereo, 44.1 kHz.

## Surface (tire rolling)

Per-oppervlakte tire-rolling loop. Wordt geactiveerd op basis van
`WORLD_DEFAULT_SURFACE` mapping in `samples.js`. Procedurele fallback
varieert filter freq + Q + gain per surface (zie `SURFACE_PARAMS` in
`engine.js`).

| Slot | Wereld-default | Karakter |
|---|---|---|
| `asphalt.ogg` | grandprix, candy, neoncity, themepark | Standaard rolling tarmac |
| `metal.ogg` | space | Metalen plaat / grating |
| `water.ogg` | deepsea | Water-spray onder banden |
| `sand.ogg` | volcano | Zand / dirt rommelig |
| `ice.ogg` | arctic | IJs sparse high-freq |
| `dirt.ogg` | — | Reserve, niet default toegekend |

Filenames: `assets/audio/surface/<slot>.ogg`.

**Bronnen**:
- `"tire rolling"`, `"car tire road"` → asphalt
- `"footsteps metal"`, `"metal scrape loop"` → metal
- `"water splash loop"`, `"car wet road"` → water
- `"sand walking"`, `"gravel"` → sand
- `"ice scrape"`, `"skating loop"` → ice

**Encoding**: ogg vorbis q4, mono, 44.1 kHz, 2-3 sec loopable.

## A/B debug toggle

Tijdens het spelen druk **Shift+P** om procedural ↔ samples te flippen.
Even handig om te vergelijken hoe een sample presteert tegenover de
synth-fallback. State zit in `window._forceProceduralAudio`.

## Workflow

1. Drop bestanden in de juiste subdir met exacte filenames.
2. Hard-refresh de game (Ctrl+Shift+R).
3. SFX/surface laden bij eerste race; engine bij eerste car-selectie;
   muziek per-wereld bij select-screen-entry.
4. Console: `_samplesDebug()` toont welke samples zijn geladen.

## Debug

```js
_samplesDebug()                    // alles in één tabel
_hasMusicStems('neoncity')         // synchrone music-check
_hasEngineSamples('f1')            // engine-check per car-type
_hasSFXSample('brake')             // sfx-check per slot
_getCurrentSurface()               // welke surface is actief
_musicDebug()                      // muziek-scheduler state
```
