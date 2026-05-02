# Crash Investigation — iOS Chrome "Kan deze pagina niet openen"

Onderzoek naar de iOS Chrome tab-crash die de gebruiker rapporteerde na het mergen van PR #64 (Grand Prix world-card removal). Geen smoking gun gevonden via code-review; meest waarschijnlijke oorzaken zijn cache- of state-gerelateerd.

## Symptoom

- iOS Chrome op iPhone toont "Kan deze pagina niet openen" (ƒtab-crashed page) na klikken op "START" op title-screen
- Consistent reproducebaar volgens gebruiker ("krijg na op start drukken nu steeds dit")
- Domein in URL-bar: `properams.github.io` (volledige pad verborgen door iOS Chrome — zou moeten zijn `properams.github.io/spencers-race-club/`)

## Wat er veranderd is in PR #64

```
js/main.js: var activeWorld='grandprix'  →  var activeWorld='volcano'
index.html: GP world-card (regels 64-72) verwijderd
```

Dat zijn de enige twee productie-wijzigingen.

## Wat zou kunnen crashen — en waarom waarschijnlijk niet

Code-review op alle GP-referenties die buiten de removal staan:

| Locatie | Soort referentie | Crash-risk |
|---|---|---|
| `js/main.js:27,29` | Loadt `_GP_WP` uit `tracks.json` | Geen — `tracks.json` bevat nog steeds grandprix entry |
| `js/main.js:196` | `_worldsUnlocked=new Set(['grandprix'])` | Geen — Set blijft, gewoon irrelevant |
| `js/effects/visuals.js`, `postfx.js`, `ui/select.js` | Object lookups als `pal[activeWorld]\|\|pal.grandprix` | Geen — `pal.grandprix` bestaat nog als fallback-key |
| `js/audio/music.js` | `BPM[style]`, `style==='grandprix'` checks | Geen — alleen evaluatie van string-equality, nooit toegang tot `null` |
| `js/cars/build.js:76` | `_worldGridT.grandprix` voor grid-positie | Geen — alleen gelezen als `_worldGridT[activeWorld]\|\|0.94` (fallback) |
| `js/track/environment.js:212,549` | `Assets.listProps('grandprix')`, `Assets.getGLTF('grandprix', k)` | Alleen relevant als `activeWorld==='grandprix'` — nu niet meer triggered tenzij gebruiker zelf grandprix kiest (kan niet via UI) |
| `js/track/track.js:271,285` | `pal[activeWorld]\|\|pal.grandprix` | Geen |
| `js/track/ramps.js:77,140` | Idem | Geen |
| `js/track/collectibles.js:8,17` | Idem | Geen |
| `js/gameplay/finish.js:136-137` | `_wfBg[activeWorld]\|\|_wfBg.grandprix` | Geen |
| `js/core/scene.js:486,493` | `spawnRoadsideProps('grandprix', ...)` | Alleen in else-tak voor onbekende worlds |
| `js/core/loop.js:84` | `if(activeWorld==='grandprix')` storm-check | Geen — alleen evaluatie |
| `js/core/three-compat.js:33` | Comment | Geen |
| `js/audio/samples.js:27,86` | Surface-mapping | Geen |
| `index.html:485-486` | `<script src=…/grandprix.js>` | Geen — files bestaan nog |
| `css/worlds.css` | `.worldBgGP` styling | Geen — zonder element wordt class niet getoond |

**Geen DOM-querySelector vond ik die specifiek `[data-world="grandprix"]` opzoekt en daarna mutatie doet zonder null-check.** De bestaande iteratie patronen (`querySelectorAll('.worldBigCard').forEach(...)`) werken correct met 7 cards in plaats van 8.

**Geen array-index-by-position** waar GP "altijd op index 0" werd verondersteld — alle world-lookups zijn keyed op string.

**Boot-flow**: `buildScene()` wordt aangeroepen met `activeWorld='volcano'` (de nieuwe default) na `loadGameData()`. `volcano` heeft een complete builder + tracks.json entry. Geen reden tot crash.

**Persistentie**: `_restoreUserPrefs` herkent alleen `'space'` om te restoren (bestaande gedrag, niet aangepast). Voor users met `src_world='grandprix'` in localStorage: niets wordt gerestord, activeWorld blijft 'volcano'. Geen crash-pad.

## Hypotheses voor de iOS Chrome crash

In volgorde van waarschijnlijkheid:

### 1. iOS Chrome cache corruption (meest waarschijnlijk)

iOS Chrome cache't aggressief en negeert vaak `Cache-Control` headers. Een mismatch tussen:
- HTML (nieuwe versie zonder GP-card)
- ES modules (oude versie via service worker / disk cache)
- Persistente JS state

…kan naar een asymmetrische runtime-state leiden waar oude code nieuwe state ziet of vice versa.

**Test**: open in incognito tab. Als het daar wél werkt → cache. Oplossing: hard reload (Settings → Privacy → Clear browsing data).

### 2. WebGL context fragility op iOS Chrome

iOS Chrome (gebaseerd op WKWebView) heeft een hard limit van 1-2 WebGL contexts. De boot-flow doet:
1. `initRenderer()` — context #1
2. `_initSnapshotBakery()` (uit select.js, alleen wanneer SELECT screen wordt opgebouwd) — gebruikt main renderer + off-screen render-target (geen tweede context, sinds Route 1 architectuur)

Als ergens lazy een tweede WebGLRenderer wordt aangemaakt (bv door een third-party CDN-script of een vergeten dispose), kan iOS de huidige context killen → tab crash.

**Test**: kijk in iPad Console (via Mac Safari Web Inspector) naar `webglcontextlost` events, of naar `WebGL: ERROR` messages.

### 3. iOS Chrome strict-er met OOM dan andere browsers

iOS limit's tab-memory aggresief. Spencer's Race Club zit op 18-90 MB heap. Combined met WebGL textures + audio buffers kan de tab over een soft-limit komen, vooral op oudere iPads.

**Test**: kijk in `dbg.persistedErrors()` na deze fix — als er een `RangeError` of memory-related crash log staat is dit het.

### 4. Onbekende iOS Chrome-specifieke bug

iOS Chrome heeft eigen quirks die andere browsers niet hebben. WebGL implementation, audio context lifecycle, gesture handling — kunnen unique crashes geven die desktop Chromium niet heeft.

**Test**: probeer in Safari op dezelfde iPad. Als Safari werkt is het Chrome-specifiek.

## Waarom geen smoking gun

Drie redenen waarom code-review geen oorzaak oplevert:

1. **De wijziging is écht klein**: 12 regels HTML + 1 regel JS. Geen complexe state-machine wijziging.
2. **Defensive coding patterns**: alle `pal[activeWorld] || pal.grandprix` style fallbacks beschermen tegen onbekende worlds.
3. **Het werkte op desktop SwiftShader-test**: PR #64's headless screenshot test slaagde — toont 7 cards + volcano default. Geen runtime-error in dat pad.

Conclusie: ik kan code-determinisch geen reden geven waarom GP-removal de iOS Chrome crash veroorzaakt. Het is mogelijk dat we naar een symptoom van iets anders kijken (cache, WebGL state, OOM).

## Aanbeveling

1. **Merge revert PR #65** om site weer werkend te krijgen
2. **Volgende deploy: hard reload op iPad** voordat je test (in iOS Chrome: lang ingedrukt houden op refresh-icon → "Refresh hard")
3. **Test in incognito** op iPad om cache uit te sluiten
4. **Met de error-capture fix** (zie `USING_ERROR_CAPTURE.md`): bij volgende crash kunnen we de exacte error zien in `dbg.persistedErrors()` na reload — dat geeft het missing data point

Niet bij voorbaat reverten van Phase D (#62) of Phase E (#63) — die zijn niet gemerged en niet de oorzaak.
