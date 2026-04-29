# PROJECT 1 — Lap-Progressive Signature Pattern (notes)

Geanalyseerde implementaties (2026-04-29):
- `js/worlds/volcano-bridge.js` (collapsing lava bridge, 183 r)
- `js/worlds/arctic-iceshelf.js` (cracking ice shelf, 142 r)
- `js/worlds/themepark-coaster.js` (overhead coaster, 155 r)
- `js/worlds/candy-chocobridge.js` (melting chocolate bridge, 138 r)

## 1. Consistent — overnemen in nieuwe implementaties

**Bestand-naam & load-volgorde**
- Eigen file `js/worlds/<wereld>-<extra>.js`, **non-module** met `'use strict'`.
- In `index.html` geladen **direct vóór** de host-wereld file (host roept de build-functie aan tijdens `buildXxxEnvironment()`).

**Lifecycle (3 functies, exact deze namen-vorm)**
- `build<Sig>()` — aangeroepen vanuit `build<Wereld>Environment()` in host-file.
- `update<Sig>(dt, currentLap)` — aangeroepen vanuit `update<Wereld>World(dt)` in host-file. `currentLap` komt uit `carObjs[playerIdx].lap` (default 1).
- `dispose<Sig>()` — aangeroepen vanuit `_resetRaceState()` in `js/gameplay/race.js`.

**Module-state (file-level, geen window-globals)**
- `let _xxxSegs=[]` — array met segment-objects.
- `let _xxxPool=null` (optioneel, voor onderliggende pool-mesh).
- `let _xxxState=null` — object met start-times en flags. **null betekent niet-actief**, zodat `update()` veilig early-return doet als `dispose()` is gerund.

**Idempotentie**
- `build()` roept eerst `dispose()` aan om herbouw zonder reset te overleven.
- Guard top-of-build: `if(typeof scene==='undefined'||!scene||typeof trackCurve==='undefined'||!trackCurve)return;`
- Guard top-of-update: `if(!_xxxState)return;`

**Lap-edge detectie (3-fase: idle → lap2 → lap3)**
```js
const t=(typeof _nowSec==='number')?_nowSec:0;
if(currentLap>=2&&st.phaseAStartT<0)st.phaseAStartT=t;
else if(currentLap<2)st.phaseAStartT=-1;
if(currentLap>=3&&st.phaseBStartT<0)st.phaseBStartT=t;
else if(currentLap<3){st.phaseBStartT=-1; /* + reset one-shot flags */}
const progressA=(st.phaseAStartT>=0)?Math.min(1,(t-st.phaseAStartT)/_DUR_A):0;
const progressB=(st.phaseBStartT>=0)?Math.min(1,(t-st.phaseBStartT)/_DUR_B):0;
const easedB=progressB*progressB; // ease-in-quad
```
Reset-on-rewind staat erin omdat lap kan teruggaan bij race-restart. One-shot flags (camera-shake) worden óók gereset op rewind.

**Disposal**
- `disposeScene()` doet de generieke geometry/material cleanup via traversal.
- `dispose<Sig>()` cleart alleen de eigen module-refs:
  ```js
  _xxxSegs.length=0; _xxxPool=null; _xxxState=null;
  ```
- Een per-segment `slabMatProto.dispose()` na de loop (alleen als prototype gecloned werd).

**Materials**
- Per-segment **gecloned** materiaal als segments individueel pulseren (`emissiveIntensity` per i).
- **Shared** materiaal als alles in lockstep strobet (zie themepark-supports).

**Pre-compute kleur-lerp 1× per frame** (voor alle segments, niet per segment).

## 2. Variabel — vrij om per wereld te kiezen

- **Track-range** (`_T_START..T_END`): kies range die niet botst met andere hazards in die wereld.
- **Camera-shake**: alleen volcano-bridge gebruikt 'm (one-shot tijdens tilt-start). Arctic + candy + themepark gebruiken 'm niet.
- **Mobile-fallback**: alleen themepark-coaster checkt `_isMobile`/`_mobCount` (skipt supports + minder segments). Andere drie zijn light-weight genoeg om op mobile te draaien.
- **Pivot-architectuur**: alle 4 gebruiken `outer=yaw + inner=tilt` Group-paar. Voor non-bridge-achtige hazards (EMP-blackout, rain-storm, gravity-anomaly, current-stream) is dit niet relevant en mag je een eigen structuur kiezen.
- **Onderliggende "pool"-plane**: alleen relevant voor brug-achtige signatures.

## 3. Ontbrekend in alle 4 — kandidaten voor nieuwe implementaties

- **Audio-koppeling**: geen van de 4 brugs spelen een SFX bij lap-edge. Voor EMP/storm/anomaly/current is een procedurele "trigger" SFX bij lap-2/3 entry een natuurlijke verbetering.
- **Music ducking**: idem — niet gebruikt; optioneel voor EMP (zie pilot prompt).
- **`dbg.log('env', ...)` op lap-edge**: niet gedaan; handig voor debug-channel filtering tijdens dev.
- **Gemeenschappelijke `getLapPhase()` helper**: er is duplicatie in lap-edge detectie (zelfde 7 regels in elk bestand). Lichte extractie zou waarde kunnen hebben — tbd in Fase 2 review.

## 4. Wiring-checklist per nieuwe signature

- [ ] `js/worlds/<wereld>-<extra>.js` aangemaakt, `'use strict'`, file-level state.
- [ ] `build<Sig>()` + `update<Sig>(dt,currentLap)` + `dispose<Sig>()` gedefinieerd.
- [ ] Host-wereld `build<World>Environment()` roept `build<Sig>()` aan via `if(typeof build<Sig>==='function')`.
- [ ] Host-wereld `update<World>World(dt)` roept `update<Sig>(dt, pl?pl.lap:1)` aan idem-typeof.
- [ ] `js/gameplay/race.js _resetRaceState()` roept `dispose<Sig>()` aan idem-typeof.
- [ ] `index.html` script-tag staat **direct vóór** de host-wereld script-tag.
- [ ] Mobile-fallback (alleen visueel, geen extra geometry) als de signature property-zwaar is.
