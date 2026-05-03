# SESSIE_GP_CLEANUP_DISCOVERY.md

Phase 0 verification — root-cause analyse per issue tegen de actuele
codebase op origin/master (na PR #71 + #72).

---

## Issue 1 — Spectators verwijderen

### Wat er nu gebeurt

`js/track/collectibles.js:247 buildSpectators()` bouwt:
- 2× grandstand-planes (80×4 m) bij start/finish met `_buildCrowdTex()`
  als textuur (alpha-blended figures)
- 2× 16 = **32 kleurrijke flag-planes** (1.2×.7) op poles bovenop de
  grandstands, kleuren: rood/geel/blauw/groen/roze/oranje/paars/teal,
  herhalen elke 8 stuks

`js/core/scene.js:478` roept dit aan in de **GP `else`-branch**.
`js/worlds/themepark.js:18` heeft een **eigen** call → Themepark
verandert niet door deze fix.

### Crowd-audio paths

- `js/audio/ambient.js:48 initCrowdNoise()` start een continue ambient
  noise-loop. Aanroep onbekend (mogelijk in countdown.js of race.js)
- `Audio.playCrowdCheer()` aangeroepen in 9 plekken voor events
  (overtake, fastest lap, P1, achievement, finish, etc.)
- Geen per-world gate aanwezig — het crowd-loop draait waarschijnlijk
  altijd zolang `audioCtx` actief is

### Hypothese verificatie

✅ Spectators (grandstand-flags + crowd-canvas) zijn de meest voor de
hand liggende bron van "lange rij kleurrijke verticale stokjes":
- 32 kleurrijke flags op een rij van 80m bij start/finish
- Crowd-textuur animeert (toggle frame elke ~400ms) wat constante
  pixel-shifts geeft → "shimmer" feel op iOS Safari

### Plan

1. **Verwijder `buildSpectators()` uit GP** (`js/core/scene.js:478`).
   Themepark behoudt zijn eigen call.
2. **Gate crowd-audio op aanwezigheid van spectators**: één check via
   `_crowdMaterials.length>0` in `playCrowdCheer()` en de loop. Dit is
   data-driven en automatisch correct voor elke world.
3. **Behoud `buildTrackFlags()`** (12 flags rondom de hele track) — dit
   is iconisch voor circuit-racing en niet de "shimmer-muur" die de
   user beschreef.

### Files raken
- `js/core/scene.js` (verwijder buildSpectators-call uit GP-branch)
- `js/audio/ambient.js` (gate crowd-cheer + crowd-noise op `_crowdMaterials.length`)

---

## Issue 2 — Stray markings op de baan

### ROOT CAUSE GEVONDEN

`js/track/environment.js:566 buildCenterlineArrows()`:

```js
[-1,1].forEach(s=>{
  const bar=new THREE.Mesh(new THREE.BoxGeometry(.15,.01,1.6),mat);
  bar.position.copy(p);bar.position.y=.022;
  bar.rotation.y=angle+s*.48;       // <-- ±27° van tangent
  scene.add(bar);
});
```

Bedoeling was ">>" chevrons (V-shape forward), maar **beide bars zijn
gecentreerd op exact hetzelfde punt** met rotaties +0.48 en -0.48 rad.
Dat geeft géén V/chevron — het geeft een **literally X-kruis** elke ~7m
op de centerlijn (N=55, dus 55 X'en op de baan).

User: "wit X-kruisje midden op de rijbaan" — exacte match. Voor een
proper > chevron moet elke bar ge-offset zijn langs zijn eigen rotatie-
as zodat ze samenkomen op een tip vóór het centrum.

Opacity .16 maakt het op desktop subtiel; op iOS Safari mobile zonder
antialiasing zijn de scherpe kanten + pure white scherp zichtbaar.

### Ander stray-markings onderzoek

- `js/track/track.js:126 buildStartLine()` — schoon 8×2 chequered, op
  juiste positie waypoint 0. **Geen issue**.
- `js/track/track.js:80 eline()` — twee witte edge-lines op `±(TW-.55)`.
  Op rechte stukken een nette streep, in bochten volgt curve. Geen
  schuine losse strepen want het is een continuous ribbon. **Geen issue**.
- DRS-strips in `js/worlds/grandprix.js:64` — green strips op het
  rechte stuk vóór start/finish. Op de juiste plek. Geen wit. **Geen issue**.

### Plan

`buildCenterlineArrows()` opties:
- **A: verwijderen** — niet kritisch voor wrong-way detection (heeft
  eigen logica). User vroeg om strakke markings; weg is strakker.
- **B: fix tot echte chevrons** — offset elke bar langs zijn rotatie-as
  zodat de twee bars een V vormen.

User: "Strepen die geen functie hebben → weg. Centerlijn moet een
nette gestreepte lijn zijn die de baan-curve volgt, niet schuine losse
blokken."

→ **Optie A**: verwijder de chevron-call. Geen vervanging voor een
"nette gestreepte lijn" want die is niet gevraagd; de bestaande
edge-lines doen al het navigatie-werk.

### Files raken
- `js/core/scene.js` (verwijder `buildCenterlineArrows()` call op regel
  503) of `js/track/environment.js` (functie no-op maken / verwijderen
  + alle calls verwijderen). Voorkeur: verwijder de call, laat de
  functie staan voor potentieel toekomstig gebruik na fix.

---

## Issue 3 — Zwevende objecten

### Kandidaten geïdentificeerd

Doorgespit: meeste props hebben hun ondersteuning. Twee echte
floating-objects:

**A. Pit-boards in `js/worlds/grandprix.js:214`**:
```js
[0.95,0.97,0.99].forEach((tt,i)=>{
  const board=new THREE.Mesh(new THREE.BoxGeometry(2.4,1.2,.1),boardM);
  board.position.set(p.x+nr.x*side,1.6,p.z+nr.z*side);  // <-- y=1.6 zonder pole
  ...
  const stripe=new THREE.Mesh(new THREE.BoxGeometry(2.4,.12,.11),accentM);
  stripe.position.copy(board.position);stripe.position.y-=.55;  // y=1.05
});
```

3 boards op y=1.6 (vertical center; spans y=1.0..2.2). **Geen pole, geen
mast, geen legs** — letterlijk zwevend op 1m boven de grond. Dit
verklaart de "groene/donkere rechthoek hoog in beeld" als de pit-board
material is `0x222222` met yellow/orange accent — leest van afstand als
een drukke vlek in de lucht.

**B. Marshal flags op `js/worlds/grandprix.js:206`**:
```js
flag.position.set(px+.4,3.2,pz);  // <-- offset .4 in X, willekeurige rotation
flag.rotation.y=Math.random()*Math.PI;
```

Vlag is `0.4m` ge-offset van de pole-X-positie en heeft een **random
rotatie**. Dat betekent de vlag staat NIET aan de pole vast — soms
zwaait hij weg, soms naar de pole toe. Bij random rotatie kan de
plane-flag in de lucht hangen los van de pole. **Bug**.

### Andere objecten gecheckt (geen issue)

- `_sunBillboard` op y=426 — bedoeld als zon, hoort hoog
- Gantry: pillars y=5 + bar y=10 + label y=11.8 → integraal verbonden
- Advertising boards op y=4 + 2 poles links/rechts (height 8) → OK
- Track lights `buildNightObjects` lamp y=9.2 + pole y=4.5 height 9 →
  pole spans y=0..9, lamp top → OK *aan night-time only*; daglicht
  visible=false dus geen issue
- DRS sign `signMesh.position.y=5.2` op een `pole.position.y=2.25` van
  height 4.5 (pole-top y=4.5) — sign 0.7m boven pole-top, mild floaty
  maar acceptabel als billboard-sign

### Plan

**A. Pit-boards**: voeg twee pole-mesh toe per board (vergelijkbaar met
buildAdvertisingBoards pattern). Of verlaag y naar 0.6 (board op
ground-level, spans 0..1.2). Voorkeur: **add poles** — pit-boards op de
grond zijn niet correct functioneel, ze horen op pit-wall-niveau.

**B. Marshal flags**: verwijder de random rotation; oriënteer flag in
track-tangent direction zoals andere flags (zie `buildTrackFlags` regel
602: `flag.rotation.y=Math.atan2(tg.x,tg.z)+Math.PI*.5`). Verwijder
ook de +0.4 X-offset (laat de flag direct aan de pole hangen).

### Files raken
- `js/worlds/grandprix.js` (pit-boards + marshal-flags)

---

## Issue 4 — Bomen op de weg + collision

### Issue 4a — Spawn-positie

#### Root cause

`js/track/environment.js:346 _buildTreePlacements()` heeft drie loops:

1. **Curve-based trees** (regel 353-372): `BARRIER_OFF + 14..32` =
   30..48m van centerlijn, met jitter ±3.5m → trees ≥ **26.5m** van
   centerlijn. Track edge bij `TW=13`, dus deze trees zijn ≥ 13.5m
   buiten track-edge. **Veilig**.

2. **Infield trees rond lake** (regel 374-383): `x=-10+cos(a)*d`,
   `z=-50+sin(a)*d`, **d=68..163m**. Geen check tegen track-curve.

   De nieuwe GP-layout (na PR #71) heeft waypoints diep in negatief Z:
   - WP12 (90, -130) — afstand tot infield-center (-10,-50) =
     sqrt(100²+80²) ≈ **128m** → BINNEN d=68..163 ring
   - WP13 (10, -200) — afstand = sqrt(20²+150²) ≈ **152m** → BINNEN ring
   - WP14 (-110, -290) — sqrt(100²+240²) ≈ 260m → buiten ring
   - WP4-5 chicane bij (175,188)..(200,198) — afstand ~248m → buiten

   → **Infield trees kunnen op de track liggen tussen WP12 en WP13**
   (de hairpin-exit S-curve). Dit verklaart "bomen midden op de baan".

3. **Cluster seeds** (regel 386+): random `t`, range `BARRIER_OFF+22..52`
   = 38..68m van centerlijn. Veilig.

#### Plan

Voeg een **post-process filter** toe na alle drie loops dat elke
placement valideert tegen de hele curve:

```js
const SAFE_MARGIN=TW+5; // 5m buiten trackedge
return out.filter(pl=>{
  // Sample N=120 curve points; reject als enige < SAFE_MARGIN
  let minD=Infinity;
  for(let i=0;i<120;i++){
    const t=i/120, p=trackCurve.getPoint(t);
    const dx=pl.x-p.x, dz=pl.z-p.z;
    const d2=dx*dx+dz*dz;
    if(d2<minD)minD=d2;
  }
  return Math.sqrt(minD) >= SAFE_MARGIN;
});
```

Alternatief: gebruik `nearestT` + `trackDist` helpers uit
`tracklimits.js` (zelfde patroon).

Build-time cost: O(N_trees × 120). Met max ~270 trees op desktop = 32k
samples, ~3ms eenmalig. Acceptabel.

### Files raken
- `js/track/environment.js` (`_buildTreePlacements` post-filter)

### Issue 4b — Collision (in scope?)

#### Bestaande systemen

- `js/gameplay/collisions.js` — alleen auto↔auto (geen prop-collision)
- `js/cars/physics.js` — heeft `car.hitCount`, `_contactPopupCD`, en
  bepaalt schade na heavy collision. Hergebruikbaar.
- `js/worlds/grandprix.js` tyre-barriers — geen collision-check, alleen
  visueel
- Geen tree-collision systeem aanwezig

#### Conclusie

Tree-collision **bouwen** is in scope volgens user prompt ("In scope,
maar pragmatisch"). Aanpak:

1. Bewaar **een lijst van tree-positions + radius** in een nieuwe array
   (bv. `_treeColliders`)
2. Per-frame in `physics.js`: check player tegen elke tree binnen view
   distance (~50m). Als O(visible) te duur is, gebruik een grid-bucket.
3. Bij collision: rebound + speed-loss, vergelijkbaar met auto-auto
   collision in `collisions.js`. Hergebruik dat patroon.

Performance: 270 trees × 1 distance-check per frame = 270 ops/frame.
Op mobile op 60Hz = 16.2k ops/s. **Verwaarloosbaar** zonder bucket.
Bucket pas implementeren als perf-check problem laat zien.

### Files raken
- `js/track/environment.js` (push tree placements naar global
  `_treeColliders` array)
- `js/cars/physics.js` of nieuw `js/gameplay/propcollisions.js`
  (collision check + response)

---

## Risico's

| Risico | Mitigatie |
|--------|-----------|
| Crowd-noise gate blokkeert ook themepark cheer | Themepark zet zijn eigen `_crowdMaterials` via buildSpectators — gate via `_crowdMaterials.length>0` werkt automatisch |
| `buildCenterlineArrows` weghalen breekt iets | Niet in andere code gerefereerd; alleen visueel |
| Tree-filter te strikt → te weinig bomen | SAFE_MARGIN=TW+5=18m is conservatief; nu blijft de kant van de track gegarandeerd schoon en de far ring (40-90m) zit ruim buiten 18m |
| Tree-collision performance | Onder budget zonder bucket; voeg bucket toe als profiel klaagt |
| Pit-board poles veranderen visuele indruk | Acceptabel — we gaan van zwevend naar geanchored |

---

## Files raken — samenvatting

| Issue | File(s) |
|-------|---------|
| 1 | `js/core/scene.js`, `js/audio/ambient.js` |
| 2 | `js/core/scene.js` (verwijder buildCenterlineArrows call) |
| 3 | `js/worlds/grandprix.js` (pit-boards + marshal flags) |
| 4a | `js/track/environment.js` (`_buildTreePlacements` filter) |
| 4b | `js/track/environment.js` (`_treeColliders`), nieuw `js/gameplay/propcollisions.js` (collision logic), wired in `js/core/loop.js` |
