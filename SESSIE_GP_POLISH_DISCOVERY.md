# SESSIE_GP_POLISH_DISCOVERY.md

Phase 0 verification of the 5 fix hypotheses against the actual source.
Branch: `claude/gp-polish-batch-sIUz9`. Read-only — no code changes yet.

---

## Fix 1 — Barrier shimmer / "rainbow" stripe along track edges

**Hypothese**: z-fighting / alpha-issue / InstancedMesh artifact langs barriers.

**Bevindingen**:
- GP barriers (`js/track/track.js:140 buildBarriers`) zijn een gewone vertical
  ribbon, MeshLambertMaterial color `0xbbbbbb`, **niet transparent**, **niet
  InstancedMesh**, `side:THREE.DoubleSide`. Geen pulse voor GP. Eenvoudig en
  niet glitch-prone.
- GP tyre-barriers (`js/worlds/grandprix.js:110 buildTyreBarriers`) zijn
  losstaande red/white cylinders op 4 corners — ook niet shimmer-bron.
- **Werkelijke oorzaak**: `js/track/track.js:91 buildCurbs(N)`. De curbs
  langs **beide kanten** van de track zijn een ribbon met **per-vertex
  red/white alternatie** via `Math.floor(t*72)%2`. Met N=400 segments en
  72 stripes betekent dat ~5–6 segments per stripe. Curbs liggen op
  `y=.045` met `polygonOffsetFactor/Units=-1`; edge-lines op `y=.008`
  met `-2`; asphalt op `y=.005` zonder offset. Op iOS Safari (laag-
  precision depth buffer) bij grazing camera-angles geeft deze combinatie
  twee artefacten:
  1. Aliasing/moire op de smalle stripes → "rainbow" shimmer in screen
     space.
  2. Gedeeltelijke z-fight tussen curb-vertex en edge-line waar curb-strip
     interior tegen edge-line aanloopt.
- Speler ziet dit dus alleen langs **alle** track-randen, niet alleen GP.
  Andere werelden hebben hun eigen vertex-color sets (space cyan/violet,
  candy pink/yellow, etc) — dezelfde aliasing daar zou ook merkbaar zijn,
  maar contrasteert minder met de neon-stijl van die werelden, dus
  visueel minder storend dan de rode GP curbs.
- **Files raken**: `js/track/track.js` (buildCurbs).
- **Plan**: stripes verlagen van 72 naar 36 (langere stripes → minder
  aliasing), curb-Y van .045 → .06 (meer fysieke separatie van edge-line),
  polygonOffsetUnits van -1 → -2 (gelijk aan edge-lines, geen z-fight).

---

## Fix 2 — Spin-pads triggering in de lucht

**Hypothese**: spin-pad trigger heeft geen airborne check.

**Bevindingen**:
- `js/track/ramps.js:242 checkSpinPads(dt)` checkt alleen `recoverActive`
  en `car.spinTimer<=0`. Geen `inAir`-check.
- Speler-fysica (`js/cars/physics.js`) houdt `car.inAir` correct bij
  (gezet bij ramp-launch, gereset bij landing). Dus de flag bestaat al
  en is betrouwbaar.
- Boost-pads (`js/track/ramps.js:260 checkBoostPads`) hebben **ook geen
  inAir check** — zelfde bug, kleinere blast radius (boost in de lucht is
  cosmetisch storend, niet game-breaking). User vroeg expliciet om dit
  te verifiëren; ik fix het hier mee.
- Jump-ramp checks (`checkJumps`) hebben `if(...||car.inAir)return;` al —
  dus jumps zijn correct.
- **Files raken**: `js/track/ramps.js` (checkSpinPads + checkBoostPads).
- **Plan**: één-regel `if(car.inAir)return;` na de bestaande recover-check.

---

## Fix 3 — GP track spannender layout

**Hypothese**: layout te recht; toevoegen van waypoints kan AI/ghost/
sectoren breken.

**Bevindingen**:
- Layout bron: `data/tracks.json` → `grandprix` array (19 waypoints,
  ovaal met enkele bochten). CatmullRom in `js/track/track.js:53–55`
  bouwt de curve.
- AI (`js/cars/ai.js`) is **volledig curve-relatief**: gebruikt
  `trackCurve.getPoint(progress+lookahead)` en `getTangent` op `t∈[0,1]`.
  Geen vaste waypoint-indices.
- `tickProgress` in `js/gameplay/tracklimits.js:117` recomputeert
  `car.progress` elke frame via `nearestT`. Sectors (`<.333/<.667`) en
  start-line crossing (`prevProg>.86 && progress<.12`) zijn alle
  curve-relatief.
- Ghost replay (`js/gameplay/ghost.js`) is per-race opname; world-key
  bepaalt of een ghost laadt. Layout-aanpassing maakt oude ghost-replays
  **inhoudelijk irrelevant** (ze rijden over een verdwenen path), maar
  technisch laden ze wel. Pragmatic fix: ghost wordt overschreven zodra
  de speler een nieuwe PB rijdt; oude ghost laat zich vergeven.
- Collectibles, water-puddles, DRS, tyre-barriers, cones, marshal posts,
  pit-boards in `js/worlds/grandprix.js` zijn **allemaal `t`-based** op
  `trackCurve.getPoint(t)`. Auto-relocate met nieuwe layout.
- **Belangrijke hard-coded zone**: `js/cars/physics.js:251–255` pit-lane
  recovery aan `_pz>178&&_pz<212&&_px>-188&&_px<172`. Dit is de
  "main-straight pit lane" — in absolute coords, niet curve-relatief.
  Daarom moet ik **waypoint[0]/[1] op ~ (0..200, 195)** houden zodat
  het pit-zone-rechthoek nog overlapt met de start-finish straight.
- Speed-trap-zone (`progress<.025 && progress>.005`) is curve-relatief
  → automatisch ok.
- DRS-detect bij `t=0.97` in `buildDRSZone()` — automatisch op een t-coord;
  ik kies een nieuwe layout waar `t≈0.97` op een rechte zit (vlak vóór
  start/finish). Dit blijft natuurlijk passen.
- **Files raken**: `data/tracks.json` (alleen `grandprix` array).
- **Plan**: 22 waypoints met:
  1. Behoud start-finish straight (z=195) — pit zone blijft geldig
  2. Chicane mid-main-straight (~ x=100, z=195 → 110, 188 → 130, 200)
  3. Tighte hairpin in noord-oost na turn 1 (op x=380, z=120 → 350, 60 → 380, 0)
  4. Snelle south-sweeper
  5. Esses door zuiden (180,-330 → 80,-300 → 30,-330)
  6. Tweede hairpin op westzijde
  7. Final approach over een snelle linkerbocht
  Karakter: "Suzuka-light" — fast esses + 2 hairpins.

---

## Fix 4 — Swipe car-select

**Hypothese**: huidige UI heeft alleen tap, voeg horizontaal-swipe toe.

**Bevindingen**:
- Twee parallelle UI's:
  1. **Legacy desktop/iPad/landscape**: `index.html:233-245` `.selCenter`
     met `#carPreviewCvs` in een `.prevCanvasWrap`. Geen pijltjes. Cars
     gekozen via tap op `.carCard` in de linker `.carGrid`.
  2. **Mobile portrait <=600px**: `index.html:147-214` `.selMobile` met
     een **horizontale CSS-scroll-snap carousel** (`#selMCarousel`).
     Native scroll + scroll-snap → op iOS al swipebaar.
- User zit op iPhone — als dat **portrait** is, zou de mobile carousel
  al swipen. User's klacht "alleen pijltjes-tikken" suggereert óf
  **landscape iPhone** (dan ziet hij de legacy UI), óf hij ervaart de
  naburige cards als "arrow buttons" (klein, onduidelijk). Beide situaties
  worden opgelost door swipe op de **preview canvas zelf** toe te voegen.
- `_selectPreviewCar(defId)` in `js/ui/select.js:309` is de centrale
  state-mutator; we hergebruiken die.
- `_unlockedCars` (Set) en `CAR_DEFS` (array) staan beschikbaar; we
  cyclen alleen door **unlocked** cars zodat een swipe altijd nuttig
  voelt.
- `js/ui/touch.js:101-140` heeft een `pointerdown/move/up` pattern voor
  steer; we volgen hetzelfde patroon (no `preventDefault` op `move` als
  het verticaal scroll is).
- Haptic via `navigator.vibrate(8)` zoals in `_selMVibrate()` /
  `_HAPTIC_MS`.
- **Files raken**: `js/ui/select.js` (nieuwe `_initCarPreviewSwipe()`
  function, aangeroepen in `buildCarSelectUI()`).
- **Plan**: pointer-handlers op `.prevCanvasWrap` met threshold 45px
  horizontaal / max 25px verticaal drift. Guard: `_isTouch || _isMobile`.
  Cycle alleen unlocked cars.

---

## Fix 5 — Subtiele in-race day/night toggle

**Hypothese**: `toggleNight()` bestaat al; HUD-button moet erbij.

**Bevindingen**:
- `js/effects/night.js:20 toggleNight()` is volledig functioneel:
  - flipt `isDark` global
  - schrijft `localStorage.src_night`
  - smooth fog-color via `_skyT`/`_skyTarget`
  - per-world skybox/lights/headlights/stars
  - update bloom + headlight emissive
- Eind van `toggleNight()` (regel 165–166) **staat al code** die label
  zet op `#titleNightBtn` en `#hudNightBtn`. Maar:
  - `#titleNightBtn` bestaat **nergens** in HTML — dead reference (geen
    crash, getElementById returnt null en de check ziet dat).
  - `#hudNightBtn` bestaat **ook niet** in `index.html`. `js/ui/hud.js:61`
    verbergt het wel op mobile (in een vergeet-niet-loop), maar het
    element zelf is nooit gebouwd. Dus dit is een placeholder-hook waar
    HUD-button bij moest komen — perfect voor onze fix.
- Geen `N`-key shortcut voor day/night in `js/ui/input.js`. Wel voor
  KeyM (mute), KeyP (pause), KeyV (mirror), KeyL (leaderboard), KeyC
  (cam), KeyH (pit). KeyN is **gas-double-tap nitro alternative** in
  touch.js, maar daar wordt `KeyN` als input-flag gebruikt voor nitro,
  niet als day/night toggle. Conflict: KeyN al bezet door nitro
  (`js/cars/physics.js:24 nit=keys['KeyN']`).
  - **Geen N-shortcut toevoegen** (zou nitro triggeren). Alternatief:
    geen keyboard shortcut, alleen HUD-button. User vroeg "minstens
    klikbaar met muis EN bedienbaar via toetsenbord". Dan kies ik een
    vrij toetsen: **KeyB** (geen conflict, ligt naast N). Of een minder
    obvious zoals KeyJ (vrij). Ik kies **KeyJ** want letter "J" past bij
    "(d)ay/(j)ourney" loosely; eigenlijk pakker is om Shift+N te nemen
    sinds Shift is reservaat van debug-toggles. **Beslissing**: Shift+N
    voor day/night (geen conflict met nitro want plain N triggert nitro,
    Shift+N is nieuw).
  - Wacht, Shift+P is al gebruikt voor procedural-audio toggle. Shift+N
    is vrij. Goed.
- HUD button-cluster top-right: `index.html:334-335` heeft alleen
  `#hudPauseBtn` + `#hudMuteBtn`. CSS in `css/hud.css` (niet gelezen,
  reasonable assumption: positioned via `.hudBtn` of inline). Plek voor
  derde knop is direct links naast de huidige twee.
- **Files raken**:
  - `index.html` (voeg `#hudNightBtn` button toe naast PAUSE/MUTE)
  - `js/ui/input.js` (Shift+N keyboard shortcut)
  - `js/ui/hud.js` (verwijder placeholder van mobile-hide list, of laat
    staan? Eigenlijk: laat NIET verbergen op mobile — user wil de toggle
    juist op mobile zichtbaar). Conflict met `cacheHUDRefs`-mobile-hide
    list — moet item er uit halen.
  - `css/hud.css` of inline style (klein icoontje, lage opacity in rust)
- **Plan**:
  1. HTML: `<button id="hudNightBtn" onclick="toggleNight()">🌙 NIGHT</button>`
     naast PAUSE+MUTE. Initial label/icon wordt door `toggleNight`'s
     bestaande regel 166 gezet (☀ DAY / 🌙 NIGHT).
  2. Verwijder `'hudNightBtn'` uit de mobile-hide list in
     `js/ui/hud.js:61` (zodat het juist wel op mobile zichtbaar is).
  3. Voeg Shift+N shortcut toe in `js/ui/input.js`, alleen tijdens RACE.
  4. CSS: subtiele kleine knop, lage opacity in rust, hoger op hover/active.

---

## Risico-overzicht

| Fix | Risico | Mitigatie |
|-----|--------|-----------|
| 1 | Andere werelden zien er nog goed uit met 36 stripes? | Per-world vertex colors blijven hetzelfde; alleen frequentie halveert. Visueel onmerkbaar in normale games. |
| 2 | Onbedoelde regressie bij hard-landing-spin? | Spin-pad check al verzwaard met `recoverActive`-check; nieuwe `inAir`-check is striktly subset. |
| 3 | Oude ghost-replays niet matchend met nieuwe path | Aanvaardbaar: ghost overschrijft zodra speler nieuwe PB rijdt. Geen crash. |
| 3 | Pit zone hard-coded coords mismatchen | Behoud waypoint[0]/[1] op (0..200, 195). |
| 4 | Conflict met carousel native-scroll op portrait phones | Swipe-handler alleen op `.prevCanvasWrap` (legacy UI), niet op mobile carousel. |
| 5 | Mobile-hide list verbergt nieuwe knop | Verwijder uit list + check viewport-positie tegen touch-controls. |
| 5 | Shift+N conflict | Shift is geen nitro-modifier; KeyN met shift wordt door physics genegeerd (`keys['KeyN']` triggert nitro alleen op plain N? — nope, het kijkt naar `keys['KeyN']` ongeacht shift state). **Risico**: Shift+N zou ook nitro triggeren. **Oplossing**: in handler `e.preventDefault()` + reset `keys['KeyN']=false` na toggle, of beter: alleen toggleNight bij `e.shiftKey`, en de browser zal nog steeds keys['KeyN']=true zetten in de algemene keydown listener. Het reset-handler moet de nitro-input expliciet onderdrukken.
  - **Betere keuze**: gebruik `KeyJ` (geen nitro-conflict). Maakt code simpeler.
  - **Definitieve keuze**: KeyJ.

---

## Files te wijzigen, samenvatting

| Fix | Bestand(en) |
|-----|-------------|
| 1 | `js/track/track.js` |
| 2 | `js/track/ramps.js` |
| 3 | `data/tracks.json` |
| 4 | `js/ui/select.js` |
| 5 | `index.html`, `js/ui/hud.js`, `js/ui/input.js`, eventueel `css/hud.css` |

Alles is non-module → `'use strict'` blijft staan. Errors via `dbg.warn`
waar relevant.
