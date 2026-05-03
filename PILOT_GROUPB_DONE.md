# PILOT — Group B Rally archetype

Pilot voor procedurele geometry-pipeline (`ExtrudeGeometry` + `TorusGeometry` + slimmere proporties) als alternatief voor de bestaande box-stack pattern. **Geen bestaande auto's gewijzigd.**

## Files gewijzigd

| File | +/− | Wat |
|---|---|---|
| `data/cars.json` | +16 / -1 | Append entry id=12, brand=GROUPB, type=rally + 3 nieuwe optionele velden (`color2`, `paintClearcoat`, `paintRoughness`, `paintMetalness`) |
| `js/cars/car-parts.js` | +~120 | 3 nieuwe helpers (`buildExtrudedBody`, `buildLatheFenderArch`, `buildRallyLightPod`) + def-veld override-pad in `makePaintMats` + `def.type='rally'` recognitie in `buildAllWheels` (oversized .42 radius / .30 width) |
| `js/cars/brands.js` | +~110 | `buildGroupBRally` builder + entry in `BRAND_BUILDERS` + `window.buildGroupBRally` export |

Geen edits aan andere bestaande car-builders. Geen edits aan `data/cars.json`-entries 0-11. Geen wijzigingen aan shared-mat defaults in `getSharedCarMats()`.

## Helpers toegevoegd aan `car-parts.js`

### `buildExtrudedBody(width, length, height, opts) → THREE.Mesh`

Bouwt de body-shell via een 2D side-profile (X-Y vlak) die over `width` wordt geëxtrudeerd langs +Z. 10-punts polygon: front-bumper, hood-top, raked windshield, korte roof-flat, steile hatchback rear, rear-bumper. Allemaal lineTo (geen curves) voor faceted Art-of-Rally feel. Bevel op edges via `bevelEnabled:true, bevelSize:0.04, bevelSegments:2`.

Rotatie: `geo.translate(-L/2, 0, -W/2)` + `geo.rotateY(-Math.PI/2)` zet length op codebase-Z-as met front=-Z.

`opts: { mat, bevelSize?, bevelSegments?, bevelThickness? }`

### `buildLatheFenderArch(radius, width, opts) → THREE.Mesh`

Half-arc TorusGeometry over een wiel — `arc:Math.PI`, `tubeRadius=width*0.15`, low-poly (6 radial × 12 tubular). `geo.rotateY(Math.PI/2)` aligneert de central axis met X (matches wheel-spin axis convention in `buildWheel`). Caller positioneert via `mesh.position.set(x, y, z)`.

`opts: { mat }`

### `buildRallyLightPod(opts) → THREE.Group`

4-light pod met mounting bar. Cylinder housing + lens op desktop, box-fallback op mobile (via `window._isMobile` check in helper zelf). Mounting bar is altijd box. Lens-mat is per-instance (caller geeft 'm aan), niet in `_headlightMats[]` geregistreerd — rally lights staan altijd aan, geen night-bump.

`opts: { width, lightR, mat, lensMat }`

## Afwijkingen van de prompt

Per de Stap 0 verification report waren er 8 discrepancies tussen prompt en codebase. Hieronder hoe ze zijn opgelost:

| # | Prompt zei | Wat ik deed |
|---|---|---|
| 1 | `cars.json` color format `#d83b3b`, met `presetId` | `0xd83b3b`, geen `presetId` (bestaat niet in echte schema) |
| 2 | `buildExtrudedBody`: "wijst auto in +X richting" | Gebouwd in X-Y, geroteerd via `rotateY(-π/2)` zodat length op Z komt met front=-Z (codebase-conventie) |
| 3 | TorusGeometry `geo.rotateX(Math.PI/2)` | `geo.rotateY(Math.PI/2)` — wheel-as=X niet Z, dus Y-rotatie nodig om torus-as ook=X te krijgen |
| 4 | `mats.dark` voor mounting bar | `mats.matBlk` (bestaande shared mat, key correct) |
| 5 | `mats.paintBody` voor body-shell | `mats.paint` (`makePaintMats` returnt key `paint`) |
| 6 | `buildAllWheels(g, mats, {radius, width, ...})` | Voegde `def.type='rally'` recognitie toe aan bestaande `buildAllWheels` (radius .42, width .30, positions x=±1.00 z=±1.50). Bestaande types onaangetast. |
| 7 | `_carShared:true` flag | Niet relevant — lens-mat is per-instance, geen shared registratie |
| 8 | `paintClearcoat`/`paintRoughness`/`paintMetalness` def-velden | Toegevoegd aan `makePaintMats` desktop-branch met `?? defaults` fallback. Bestaande 12 cars zonder deze velden krijgen showroom-supercar tuning ongewijzigd. |

Extra keuzes die niet expliciet door de prompt zijn beantwoord:

- **Wheel-stance** via helper-edit (optie B uit verification) i.p.v. lokale loop in builder. Future-proof als er meer rally cars komen; bestaande 4 types ongewijzigd.
- **Rally lens-mat** per-instance (geen `_headlightMats[]` registratie). Geel blijft constant geel; geen day/night bump-flicker.

## Visuele observaties

(Op basis van code-inspectie — visual run is user-driven.)

**Verwachte sterke punten:**
- Side-profile silhouet leest als rally-archetype (Lancia Delta/Audi Quattro — long flat hood, korte greenhouse, hatchback rear). Faceted edges via bevel.
- Matte finish via `clearcoat:0.30 / roughness:0.55 / metalness:0.40` — duidelijk anders dan de showroom-glanzende supers (bvb Bugatti met `clearcoat:1.0 / metalness:0.85`).
- Oversized wheels (.42 vs .33) + lichte ride-height bump (`y=0.36` vs `0.33`) geven herkenbare rally stance.
- Yellow rally pod boven bumper is iconisch; 4 cylinder-lampen vallen direct op.
- Two-tone center stripe (red `0xd83b3b` body + dark blue `0x1f2540` stripe + yellow accent details) is klassiek rally-livery palette.

**Beperkingen / mogelijke pijnpunten:**
- TorusGeometry fender arch is een halve donut, niet een echte fender flare — geen tapering, geen curve naar de body-shell. Komt waarschijnlijk over als "ring rondom wiel" eerder dan "fender flares deel van bodywork". Suggestie: in een follow-up vervangen door custom BufferGeometry of `LatheGeometry` met asymmetrisch profiel.
- ExtrudeGeometry side-profile is uniform over de hele width — dus van boven af gezien is de auto rechthoekig (geen tapering aan voor- of achterkant). Echte rally-cars zijn smaller aan achterkant. Suggestie: 2 extrudes (één voor front-half, één voor rear-half) met verschillende widths, of een side-profile + een top-profile combineren.
- Bevel werkt aan de kanten van de extrude (Z-as in shape-coords = X-as na rotateY) maar niet aan de Y-axis (top/bottom). Body-edge waar dak op dak-flat overgaat heeft scherpe knik.
- Side windows zijn standaard BoxGeometry van .06 dik tussen Y=H*0.78 en de cabin-deel — kunnen door de geëxtrudeerde body-shell schieten als de body-Y niet perfect klopt. Test in browser nodig.
- `bodyMesh.position.y = 0.05` is hardcoded — als de body niet precies klopt met de wheel-Y (`0.36`) ontstaat een gap of overlap.

## Mobile-fallback observaties

`carLOD()==='low'` (mobile of `_lowQuality:true`) skipt:
- ExtrudeGeometry body → 3 BoxGeometry stack (chassis + cabin + roof), zelfde dimensions
- Cabin glass meshes — geen glass op mobile (consistent met andere mobile-paths in bestaande builders)
- Stripe-canvas (skipped want het zou een 4e mesh zijn met dezelfde shape)
- Fender flares (TorusGeometry) — skipped (boxes hebben geen extruded shape om over te draperen)
- Rear spoiler boxes
- Side exhaust cylinder
- Front grille box

Headlights, taillights, side skirts, rally pod, wheels worden wél gebouwd op mobile. Rally pod gebruikt eigen LOD-check in `buildRallyLightPod()`: cylinder→box per lamp.

`makePaintMats` mobile-branch (`MeshPhongMaterial` paint + `MeshLambertMaterial` accent) is onaangetast — Group B krijgt automatisch Phong met `shininess:120`. De def-velden `paintClearcoat`/`paintRoughness`/`paintMetalness` worden alleen op desktop gelezen, op mobile genegeerd.

## Suggesties voor follow-up als pilot bevalt

1. **Vervang TorusGeometry fender met een custom BufferGeometry** — 8-segment tapering arch met dikte die afneemt naar de uiteinden. Geeft echte fender flare i.p.v. ring.
2. **Top-profile + side-profile combinatie** — extrude side-profile, dan apply een per-vertex width-modulation gebaseerd op een 2e profielcurve. Geeft een auto die smaller is aan voor- en achterkant (zoals echte cars).
3. **Carbon material adoption** voor de lower body cladding (skirts, fender liners, splitter). De `mats.carbon` is al beschikbaar, ongebruikt.
4. **Rally numbers / livery decals** — `CanvasTexture` met rally nummer (random 1-99 per race?) op de deuren. Past bij de "stickerlook" feel.
5. **Voor de andere 12 cars: NIET overzetten** naar `buildExtrudedBody`. De bestaande box-stack heeft per-builder character-kenmerken (Bugatti's clamshell sphere, McLaren's nose-cut, Koenigsegg's roof scoop) die in een uniform extrudet body verloren gaan. Group B was juist een goede pilot voor extrude omdat rally-archetype baat heeft bij gewelfde uniformiteit. Behandel extrude als "een gereedschap voor sommige archetypes" niet "vervanging voor box-stack universally".

## Acceptance checklist

- [x] Geen edits aan bestaande car-builders (Bugatti/Ferrari/Lambo/etc.) — diff bevestigt: alleen append in brands.js
- [x] Geen edits aan bestaande car-def entries in `data/cars.json` — alleen append van id=12
- [x] Helper-edit `buildAllWheels`: `def.type='rally'` recognitie. Bestaande types ongewijzigd (verifieerbaar in diff).
- [x] Helper-edit `makePaintMats`: def-veld override-pad met `??-defaults`. Bestaande cars zonder velden krijgen ongewijzigde tuning.
- [x] `'use strict'` aanwezig (al in bestand) — niet verwijderd.
- [x] `dbg`-logging-paths niet aangeraakt; geen nieuwe console.error in deze code.
- [x] Syntax check pass (`node --check`).
- [x] JSON validation pass (`JSON.parse`).
- [ ] **User-driven**: nieuwe auto verschijnt in car-select carousel. (Verifieerbaar door browser open + select-screen scrollen naar einde)
- [ ] **User-driven**: race rendert correct desktop (extruded body, fenders, pod) en mobile (boxes-body, no fenders, simplified pod).
- [ ] **User-driven**: 5× world-switch heap delta ≤ ~5MB (hard rule for disposal hygiene).
- [ ] **User-driven**: bestaande Bugatti + Tesla zien er identiek uit als voor deze sessie.

## Wat NIET in deze sessie

Per prompt:
- Bestaande auto's herbouwen met extruded body
- Carbon material adoption
- HDRI files toevoegen
- Wheel-spec variation per car (alleen rally-recognitie toegevoegd; F1/muscle/super ongewijzigd)
- Brand badge sprites
- Tesla glass roof transmission
- Mustang stripe-as-canvas-texture
