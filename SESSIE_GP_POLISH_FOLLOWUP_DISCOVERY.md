# SESSIE_GP_POLISH_FOLLOWUP_DISCOVERY.md

Phase 0 verification — what did the previous batch (PR #71) actually
change, and why are 3 of the 4 acceptance criteria still failing?

Branch: `claude/gp-polish-batch-followup` (gebaseerd op origin/master).

---

## Issue A — Barrier shimmer is NIET weg

### Wat de vorige batch heeft gedaan

`js/track/track.js:91 buildCurbs()` heeft drie wijzigingen gekregen:
- `STRIPES = 36` (was 72) — halveerde stripe-frequentie
- `CY = .065` (was .045) — bumped curb Y voor extra separatie van edge-line
- `polygonOffsetFactor/Units = -2,-2` (was -1,-1) — match met edge-lines

### Waarom het probleem niet voorbij is

De fix raakt **alleen de curbs**. De curbs zijn één van meerdere bonte
items langs de track-randen. Bredere root-cause is een **rij gekleurde
elementen die op middenafstand alias** wegens iOS Safari's grafische
stack:

1. **Corner boards T1-T8** (`js/track/environment.js:840 buildCornerBoards`)
   zijn een **letterlijke regenboog-rij** rondom de track:
   `0xff3300, 0xff6600, 0xffcc00, 0x88ee00, 0x00bb44, 0x0088ff,
    0x3300ee, 0xbb00ee` — rood→oranje→geel→groen→blauw→indigo→paars.
   Acht boards (3.2×2.0 m) bij `t=.165 .. .795`, geplaatst aan de
   buitenkant van de track op `BARRIER_OFF+4.2`. Vanaf de start-rechte
   kijkend de hoeken in zien is dit visueel een **regenboog-strip
   langs de track-rand**.

2. **Track flag banners** (`js/track/collectibles.js:273 buildSpectators`)
   16 flags per side (32 totaal) bij start/finish, kleuren rood/geel/
   blauw/groen/roze/oranje/paars/turquoise — herhalen elke 8 flags.
   80m totaal, alleen bij start/finish.

3. **Tyre-barriers** (`js/worlds/grandprix.js:110 buildTyreBarriers`)
   bij 4 corners — 5 cylinders elk in rood/wit alternering, twee rijen
   gestapeld. Niet bonte volle regenboog, maar wel rood/wit aliasing.

### Plan voor de follow-up fix

Aanpak per layer (in volgorde van impact):
- **Corner boards**: dezelfde rainbow-palette houden voor identificatie
  per bocht, maar **lower mip + max anisotropy** op de canvas-textures
  zodat de bordtextuur niet aliast op afstand. Plus `tex.minFilter =
  THREE.LinearMipmapLinearFilter` en `tex.generateMipmaps=true`.
- **Track flags**: zelfde mip-treatment op de plane-textures (al
  textureless? check), of als ze gewoon vertex-colors zijn dan een
  subtiele lower-saturation pass voor distance.
- **Curbs**: huidige fix laten — de moiré op curbs zelf is naar
  verwachting weg met N=36 stripes maar geen visual confirmation
  mogelijk vanuit code-only review.

Hoofdstrategie: voeg waar nodig `tex.minFilter=LinearMipmapLinearFilter`,
`tex.generateMipmaps=true`, `tex.anisotropy=...` toe aan de
canvas-textures van corner-boards en spectator-banners. Dit is de
algemene oplossing voor "rainbow aliasing op alpha-blended billboards
op afstand op iOS Safari".

**Files raken**:
- `js/track/environment.js` (`buildCornerBoards` canvas-textures)
- `js/track/collectibles.js` (`buildSpectators` `_buildCrowdTex`)

---

## Issue B — Whiteout / verticale lichtbundel in daglicht

### Wat de vorige batch heeft veroorzaakt

De vorige batch heeft de GP-layout veranderd (`data/tracks.json`).
Het rechte stuk + chicane oriënteert de **camera anders** ten opzichte
van de bestaande sun-direction `Vector3(180,320,80).normalize() * 500`.
Op het nieuwe rechte stuk (waypoints 0-5, looking +x) zit de zon nu
**recht in beeld** — wat de bestaande sun-billboard + lens flare ghosts
+ god-rays onaangenaam fel maakt.

### Wat er werkelijk in de scene gebeurt

`js/track/environment.js:623 buildSunBillboard()` bouwt:
- Een **240×240** sun-sprite op `position = sunDir * 500` ≈ (239, 426, 106)
- Plus een **80×80 hot core** child sprite (opacity .95)
- Plus een **280×280 cross-rays** child sprite (opacity .42)
- Plus een **520×520 outer halo** child sprite (opacity .60)
- Plus `buildLensFlareGhosts()` — 6 ghost sprites verspreid over de
  zon→scherm-center lijn, baseOpacity .40-.55
- Plus `buildGodRays()` — **4 verticale beams 80×360 sprites**, opacity
  .32, `renderOrder=998` (drawn bovenop de hele scene, additive blending)

User beschrijving: "felle gele/witte verticale lichtbundel die uit de
grond schijnt en de hele bovenste helft van het scherm wit kleurt".
Dit komt **letterlijk overeen** met de god-rays sprites: 80 wide × 360
tall, additive, drawn op renderOrder=998 over alles heen. Op het rechte
stuk waar de zon recht voor de camera zit, worden 4 vertikale beams
zichtbaar als vertikale strepen in beeld.

### Plan voor de fix

Surgische aanpak (geen hele scene veranderen, alleen visual intensity):
1. **God-rays** (hoogste impact): opacity 0.32 → 0.10, scale Y van 360 →
   220 (kleiner, minder dominant), `renderOrder=998` houden maar
   **conditional fade** in `updateLensFlare()` — als de zon
   `Math.abs(NDC.x)<0.5 && Math.abs(NDC.y)<0.5` (zon in centrum frame)
   **fade godrays uit naar opacity 0.05** ipv vol .32. Op offscreen
   blijven ze hun normale opacity houden.
2. **Sun core** (subtiel): hot-core opacity 0.95 → 0.65 zodat hij niet
   zo agressief in beeld trekt.
3. **Lens flare ghosts**: opacity multiplier verlagen van 0.40-0.55
   range met **0.6×** wanneer de zon in-frame is.

Geen wijziging aan bloom/tone-mapping (zou andere worlds raken).
Geen wijziging aan sun-direction (oude layout zou ook getroffen kunnen
zijn, willen we niet veranderen).

**Files raken**:
- `js/track/environment.js` (`buildSunBillboard`, `buildGodRays`,
  `updateLensFlare`)

---

## Issue C — Swipe op car-select werkt niet

### Wat de vorige batch heeft gedaan

`js/ui/select.js:544 _initCarPreviewSwipe()` is toegevoegd. Bindt aan
`document.getElementById('carPreviewCvs').parentNode` = de
`.prevCanvasWrap` div in de **legacy** `.selBody` layout.

### Waarom het niet werkt op iPhone

`css/select.css:524-526`:
```css
@media (orientation:portrait) and (max-width:600px){
  #sSelect > .selHeader,
  #sSelect > .selBody{display:none !important}
```

De legacy `.selBody` is **volledig verborgen** op portrait phone <600px.
De gebruiker ziet **`.selMobile`** met de horizontale carousel
(`.selM-carousel` met native scroll-snap). Mijn swipe-handler zit op
een hidden DOM element en doet niets op iPhone.

De native scroll-snap werkt **wel** op de carousel (CSS-only), maar
mogelijk:
- De gebruiker ervaart het niet als "swipe wisselt cars" maar als
  "ik scroll de pagina"
- De `padding:0 calc(50% - 130px)` op `.selM-carousel` (line 642 in
  select.css) maakt dat de eerste/laatste cards moeilijk centeren
- De carousel is maar 300px hoog — als je swipet boven of onder die
  zone, gebeurt er niets

### Plan voor de fix

Twee stappen:
1. **Voeg een expliciete pointer-event swipe handler toe op
   `.selM-carouselWrap`** (de container van de mobile carousel) zodat
   horizontale swipes daar gegarandeerd werken via JavaScript ipv
   alleen native scroll-snap. Roep `_selMSetActiveDef` of equivalent.
2. **Bind de bestaande handler ook aan een tweede element** voor
   robuustheid: bv. `selMobile` zelf, met threshold-check zodat
   alleen brede horizontale swipes counten. Dit dekt de "user swipet
   buiten de carousel-area"-case.
3. **Voeg `touch-action: pan-y`** toe op de carousel als CSS-fallback
   zodat verticaal scrollen blijft werken maar horizontaal expliciet
   onze handler raakt.

**Files raken**:
- `js/ui/select.js` (uitbreiding van `_initCarPreviewSwipe` of nieuwe
  `_initMobileCarouselSwipe`)
- `css/select.css` (voeg `touch-action: pan-y` toe op `.selM-carousel`)

---

## Issue D — Day/night toggle plaatsing botst met PAUSE

### Wat de vorige batch heeft gedaan

`index.html:336`:
```html
<button id="hudNightBtn" onclick="toggleNight()" aria-label="Toggle day/night">🌙 NIGHT</button>
```

Plus CSS in `css/hud.css`:
- `top:102px;right:18px` desktop (gap van 42px onder pause+mute)
- `top:calc(68px + env(safe-area-inset-top,0px))` op mobile

### Waarom de overlap optreedt

User screenshot toont overlap tussen NIGHT-knop en PAUSE-knop. Mogelijke
oorzaken (afhankelijk van device):

1. **Op iPhone (mobile)**: Pause is `top:16+envT, min-height:44, width
   ~110px (ruim "⏸ PAUSE" text)`. Night is `top:68+envT, min-height:44,
   width ~95px ("🌙 NIGHT")`. Met env-inset-top ~44px → Pause spans
   60-104, Night spans 112-156. Theoretisch 8px gap, maar visueel kunnen
   de tekst-labels **horizontaal** uitlopen omdat ze beide right:16
   gealigneerd zijn → text drift naar links is niet expliciet beperkt.
   Op een 390px viewport kunnen labels lang lijken.

2. **Op iPad portrait** (`max-width:600px` matcht NIET, maar
   `(pointer:coarse) and (max-width:900px)` matcht WEL bij 768px iPad
   portrait): mute IS NIET hidden op tablet (cacheHUDRefs check
   `_isMobile` only), dus drie knoppen pause+mute+night stapelen ze
   op top:18, top:60, top:102 → mute en pause zitten precies tegen
   elkaar zonder gap.

3. **Tekst-labels overlappen visueel** zelfs zonder fysieke overlap
   omdat het oog "PAUSE" en "NIGHT" beide leest als drukke labels op
   minimaal verschil.

### Plan voor de fix

User's voorkeursvolgorde:
1. **Verwijder de "NIGHT" text**, alleen icoon `🌙` of `☀`. Was de
   originele intent ("subtiel, geen tekst-label naast het icoon").
   `js/effects/night.js:165` zet de text — passen we aan zodat alleen
   het emoji-icoon wordt geset.
2. Optioneel: vergroot tap-target met grotere `font-size` op het emoji
   en zorg dat de knop een vaste vierkante shape krijgt.

**Files raken**:
- `js/effects/night.js` (label-update: alleen icoon, geen text)
- `index.html` (initial label: alleen icoon)
- `css/hud.css` (kleinere padding, vierkanter aspect zodat icoon-only
  duidelijk is)

---

## Files te wijzigen, samenvatting

| Issue | Bestand(en) |
|-------|-------------|
| A | `js/track/environment.js` (corner boards, lens flare canvases), `js/track/collectibles.js` (spectator tex) |
| B | `js/track/environment.js` (sun billboard, god rays, lens flare update) |
| C | `js/ui/select.js` (mobile carousel swipe), `css/select.css` (touch-action) |
| D | `js/effects/night.js` (label-update), `index.html` (init label), `css/hud.css` (icon-only sizing) |

Risico-overzicht:

| Risico | Mitigatie |
|--------|-----------|
| Mip-fix per ongeluk maakt alle billboards onleesbaar van dichtbij | LinearMipmapLinear gebruikt mip alleen ver weg; van dichtbij blijft sharp. |
| God-ray-tweak verstoort het sun-effect op andere worlds | God-rays worden alleen gebouwd als _sunBillboard bestaat; per-world `visible` check al aanwezig. |
| Mobile-carousel swipe conflict met native scroll-snap | Pointer-handlers controleren intentie (horizontaal vs verticaal) en falleback op native scroll bij verticaal. |
| Icon-only NIGHT-knop te klein | Vaste 44×44 tap-target via min-height/min-width. |

Geen acceptance-criteria afhankelijk van runtime test. Code-only review
+ codepath-tracing volstaat.
