# Sessie: Clean HUD Pass — Report

Branch: `claude/clean-hud-redesign-5jnmW`
Commits: 7 (één per fase, 01795d4 → caa943e)
Net diff: 13 files, +203 / −194

## Doelen vs resultaat

| Acceptatiecriterium | Vooraf | Na deze sessie |
| --- | --- | --- |
| ≤ 5 zichtbare HUD-clusters in standaard race-staat | 9 panels | 4 panels (race-info, leaderboard, instruments, minimap) + 2 ghost-buttons |
| Geen dubbele info | Position 2x, lap 2x, gap-info dubbel met leaderboard | Position 1x, lap 1x in race-info, gap-info volledig weg |
| ≤ 4 accent-kleuren met semantiek | 7+ ad-hoc kleuren (#ff7700, #00ee66, #ffd700, #ff4444, #ffbb00, #00ccff, …) | 4 vars: `--hud-primary`, `--hud-accent`, `--hud-warning`, `--hud-success` |
| ≥ 70% scherm leeg in rustige race-staat | nee — zes panels stapelden links | ja — alleen race-info linksboven, leaderboard rechtsboven, minimap + instruments onder |
| Mobiel niets buiten viewport / overlap | leaderboard + tire-temp panels stapelden tegen elkaar | leaderboard + car-status hidden, instruments compact |
| Bestaande hotkeys + L gedocumenteerd in `?` | n.v.t. | help-overlay heeft "L · Leaderboard volledig / compact" |

## DOM-element count (binnen `#hud`)

| | Voor | Na |
| --- | --- | --- |
| Aparte panels (`#hudPos`, `#hudLap`, `#hudScore`, `#hudLapTime`, `#hudGap`, `#hudTire`, `#hudTireTemp`, `#hudGear`, `#hudSpd`) | 9 | 0 — opgegaan in 3 nieuwe containers |
| Nieuwe geconsolideerde panels (`#hudRaceInfo`, `#hudCarStatus`, `#hudInstruments`) | 0 | 3 |
| Floating wereld-indicators (▼ P8 boven auto via `floatText`) | 2 stuks per overtake/loss | 0 (posPulse-animatie + showPopup blijven) |
| Top-banner inline-style | 7 properties inline | DOM-element houdt geen inline style meer; verhuisd naar `hud.css` |

## CSS-variabelen toegevoegd (in `css/base.css :root`)

```css
--hud-primary  #00d9ff   /* neutrale info: positie, leaderboard, minimap track */
--hud-accent   #ffb800   /* actieve waarde: snelheid, huidige lap-time, gear */
--hud-warning  #ff3b3b   /* damage, gevaar, achterligger inhaalt */
--hud-success  #2ecc71   /* sneller dan PB, positie gewonnen, optimale tyre */
--hud-text         #e9eef5
--hud-text-dim     rgba(233,238,245,.55)
--hud-text-mute    rgba(233,238,245,.32)
--hud-bg           rgba(8,12,18,.55)
--hud-bg-strong    rgba(8,12,18,.72)
--hud-border       rgba(255,255,255,.07)
--hud-pad          16px
--hud-pad-mobile   8px
```

## Bestanden aangepast (per fase)

### Phase 1 — `01795d4`
- `css/base.css` — vars in `:root`

### Phase 2 — `dd47844`
- `index.html` — `#hudPos`/`#hudScore`/`#hudLap`/`#hudLapTime` vervangen door `#hudRaceInfo`
- `css/hud.css` — `#hudRaceInfo` regels + media-query updates
- `css/base.css` — `#hdLapDelta` font/spacing tweak
- `js/ui/hud.js` — `_elPos`/`_elPosOf`/`_elLapTime` content tweaks; `floatText('▲ P …)` / `floatText('▼ P …)` weg; positie-kleuren via vars
- `js/ui/select.js` — wereld-tint nu op `#hudRaceInfo` (niet meer `#hudPos`)

### Phase 3 — `a0aa570`
- `index.html` — `#hudTire` + `#hudTireTemp` → `#hudCarStatus` (4 csTire dots)
- `css/hud.css` — `#hudCarStatus` regels, `csOn` fade-in class
- `css/base.css` — `.tireDot` / `.tireGrid` / `#hdTire` weg
- `js/ui/hud.js` — `_elTire` weg; nieuwe dual-encoded update-logic met auto-show drempel

### Phase 4 — `c709118`
- `index.html` — `#hudSpd` + `#hudGear` → `#hudInstruments` met gear- en speed-box
- `css/hud.css` — `#hudInstruments`, `#hudLeader.lSep`, ghost-button styling pause/mute, mobile/landscape rules
- `js/ui/hud.js` — leaderboard-rebuild ondersteunt collapse/expand met `…` separator
- `js/ui/input.js` — `KeyL` toggle voor `window._leaderExpanded`
- `js/ui/help.js` — L-binding gedocumenteerd

### Phase 5 — `0a959c3`
- `index.html` — `#hudGap` weg; `#topBanner` inline-styles weg
- `css/hud.css` — `#topBanner` rule, `#hudGap` rule weg
- `css/base.css` — `.gapLine` / `#gapAhead` / `#gapBehind` weg
- `js/effects/visuals.js` — `updateGapDisplay` weg
- `js/effects/weather.js` — switcht naar `showBannerTop` (4s desktop / 3s mobiel)
- `js/core/loop.js` — `updateGapDisplay()` aanroep weg
- `js/ui/hud.js` — `_elGapAhead`/`_elGapBehind` cache weg
- `js/gameplay/race.js` — `hudGap` reset weg

### Phase 6 — `a980f67`
- `js/ui/hud.js` — `hudLeader` niet meer met inline style verbergen op mobiel
- `css/hud.css` — `#hudLeader:not(.lShow)` mobile-hide; `#hudLeader.lShow` override

### Phase 7 — `caa943e`
- `js/ui/hud.js` — `_elScore` weg; tire cache-key fix (string i.p.v. botsende bit-OR)
- `css/hud.css` — `.hLabel` / `.hBig` / `.hSm` / `#hudNightBtn` / `#hudRainBtn` weg
- `js/gameplay/tires.js` — `_lastTireKey` is nu `''`
- `js/gameplay/race.js`, `js/main.js` — comment-rot opgeschoond

## Verwijderde elementen / classes

DOM-id's: `#hudPos`, `#hudScore`, `#hudLap`, `#hudLapTime`, `#hudGap`, `#hudTire`, `#hudTireTemp`, `#hudSpd`, `#hudGear`
Classes: `.hLabel`, `.hBig`, `.hSm`, `.tireDot`, `.tireGrid`, `.gapLine`
JS-functies: `updateGapDisplay()`
JS-state: `_elScore`, `_elTire`, `_elGapAhead`, `_elGapBehind`
Stale CSS-rules: `#hudNightBtn`, `#hudRainBtn` (HTML-element bestond niet meer)

## Layout-zones (eindstaat)

```
┌─ top:18 left:18 ───────┐                     ┌─ top:18 right:18 ─┐
│ #hudRaceInfo           │                     │ #hudPauseBtn      │
│   POSITION (groot)     │                     │ #hudMuteBtn       │
│   LAP 2/3              │                     │ (ghost buttons)   │
│   41.15s · 33.85s +.30 │                     ├──── top:108 ──────┤
└────────────────────────┘                     │ #hudLeader        │
                                               │   compact (5 row) │
┌─ bottom:204 left:18 ───┐                     │   L = expand/full │
│ #hudCarStatus  (auto)  │                     └───────────────────┘
│   ◯ ◯  ◯ ◯  (4 tyres)  │
└────────────────────────┘                     ┌─ bottom:28 right:28 ─┐
┌─ bottom:28 left:28 ────┐                     │ #hudInstruments      │
│ #hudMap (minimap)      │                     │ GEAR  │ SPEED  KM/H  │
└────────────────────────┘                     └──────────────────────┘
```

Transient overlays (verschijnen tijdelijk):
- `#topBanner` — top:30%, weather/lap-announce, fade-uit 4s desktop / 3s mobiel
- `#popupMsg` — top:9%, 1s notifications
- `#wrongWayOverlay`, `#drsIndicator`, `#fastestLapFlash`, `#closeBattleEl` — onveranderd

## Bekende edge-cases die handmatige test nodig hebben

1. **Regen-overgang** — `weather.js` gebruikt nu `showBannerTop` i.p.v. `showBanner`. Test dat zowel "🌧 RAIN INCOMING" als "☀ CLEARING UP" zichtbaar zijn (geen overlap met `#hudRaceInfo` op 30%).
2. **Neon City flicker** — `select.js` zet `hdSpd.style.color='#00eeff'` voor space en `'#00ffcc'` voor deep-sea, wat de `var(--hud-accent)` overschrijft. Visueel correct, maar accent-consistentie verschilt per wereld; eventueel later via theme-class oplossen.
3. **Finish-overgang** — `_elScore` is verwijderd uit race-HUD. Score blijft op finish-scherm via `finScore`. Verifieer dat finish-scherm correct toont.
4. **Tire-status fade** — panel verschijnt vanaf 30% wear OF tyre buiten [.28, .65]. Eerste paar laps blijft het verborgen — verifieer dat het bij regen of agressief rijden netjes faded.
5. **Leaderboard L-hotkey op mobiel** — werkt alleen met externe keyboard (touch heeft geen letter-keys). Spec eist dat het toggle blijft werken; CSS `.lShow` override is geconfigureerd.
6. **Posflash-animatie** — keyframe `posFlash` heeft hardcoded `#ff7700` en `#00ff88`. Werkt nog correct (animatie eindigt en JS-inline-color neemt over) maar voelt iets anders met de nieuwe witte default. Eventueel later in lijn brengen met semantische vars.

## Suggestie screenshots-momenten

Drie momenten waarop het verschil het sterkst voelt:

1. **Net na de start** (lap 1, P8) — toont alleen race-info linksboven + minimap + instruments + leaderboard. Auto is nog schoon, dus `#hudCarStatus` is verborgen → 70%+ leeg scherm vergeleken met het oude 6-panel-stapeltje.
2. **Battle in midfield** (lap 2, P5 of 6, achterligger binnen 0.5s) — leaderboard toont "BATTLE" op de relevante regel in plaats van een tijds-gap; geen aparte gap-paneel meer nodig.
3. **Tijdens rain transition** (lap 2-3) — weather banner verschijnt mid-screen, geen dubbel paneel; een paar seconden later is `#hudCarStatus` zichtbaar omdat tyres afkoelen.

## Test status

- Statische parse-checks van alle aangepaste JS bestanden: ✓
- HTML structureel gebalanceerd (open/close stack leeg): ✓
- Visueel/runtime testen niet uitgevoerd (geen browser in deze sessie) — handmatig in Chrome / Safari iOS doorlopen voor de drie scenario's hierboven.
