# Spencer's Race Club — Notification System Redesign

Status: design draft, awaiting 'go' before FASE 2 implementation.
Owner: claude/notification-reposition-pY6ZY

## Doel

Eén gecoördineerde notification-laag (`window.Notify`) die:

1. Op mobiel nooit binnen de centrale racing sight-line of bovenop touch-controls
   verschijnt.
2. Drie vaste zones gebruikt met expliciete prioriteit en queue-gedrag.
3. Als facade dient — bestaande call-sites (`showPopup`, `showBanner`,
   `showBannerTop`, `showAchievementToast`, `showUnlockToast`) blijven werken via
   thin wrappers.
4. Geen nieuwe globals introduceert buiten `window.Notify`. State (queue, actieve
   slots, timers) leeft binnen `js/ui/notifications.js`.

## Verboden zone op mobiel

Op `_isMobile === true` MAG geen melding verschijnen in:

- Centrale verticale strook van het scherm: `x ∈ [25vw, 75vw]` in combinatie met
  `y ∈ [innerHeight*0.18, innerHeight*0.72]`. Daar zit de baan vooruit en de
  speler-auto.
- Bottom-strip waar gas/brake/nitro/steer-knoppen zitten:
  `y > innerHeight - 220px` (rekening houden met `safe-area-inset-bottom`).
- Top-left tot ~120px rechts (`#hudRaceInfo` zit daar).
- Top-right tot ~96px links (`#hudPauseBtn` zit daar).

Op desktop zijn de eisen minder streng (geen touch-controls), maar de centrale
strook blijft verboden voor consistentie.

## Drie zones

```
┌─ TOP-CENTER (Zone B) ───────┐  Zone A = top-right status flash
│  [LAP 2 / 3]  ← subtiel     │  Zone B = top-center subtle lap announce
└──────────────────────────────┘  Zone C = top-right stack onder A (achievement/unlock)
                  ┌── Zone A ──┐
                  │ FASTEST LAP│   ← single slot, fade-in/out
                  └────────────┘
                  ┌── Zone C ──┐
                  │ 🏆 ACHIEV. │   ← stack, tot 3 toasts
                  ├────────────┤
                  │ 🔓 UNLOCK  │
                  └────────────┘
```

### Zone A — Status (top-right, single slot)

| Eigenschap | Desktop | Mobile |
|---|---|---|
| `position` | `fixed` | `fixed` |
| `top` | `64px` (onder `#hudPauseBtn`) | `calc(64px + safe-area-inset-top)` |
| `right` | `18px` | `calc(14px + safe-area-inset-right)` |
| `width` | `260px` | `min(220px, 56vw)` |
| `font-size` | `13-14px` | `11-12px` |
| `z-index` | `var(--z-toast)` (=999) | id. |

Single slot. Nieuwe status met gelijke of hogere prioriteit vervangt de
huidige direct (300 ms cross-fade). Lagere prioriteit wordt **gedropt** (geen
queue) — status-events zijn allemaal kortdurig, doorschuiven heeft geen zin.

### Zone B — Lap announce (top-center, subtle)

| Eigenschap | Desktop | Mobile |
|---|---|---|
| `position` | `fixed` | `fixed` |
| `top` | `40px` | `calc(36px + safe-area-inset-top)` |
| `left` | `50%` (translateX -50%) | id. |
| `font-size` | `12px` | `10px` |
| `letter-spacing` | `4px` | `3px` |
| `opacity (peak)` | `0.85` | `0.85` |
| `font-weight` | `700` | `700` |

Bewust géén glow, géén border, géén achtergrond — alleen platte tekst met
subtiele `text-shadow` voor leesbaarheid. Single slot, debounced op
lap-nummer (max 1 announcement per `(lap, total)` combinatie).

### Zone C — Achievement / Unlock stack (top-right, vertical stack)

| Eigenschap | Desktop | Mobile |
|---|---|---|
| `position` | `fixed` | `fixed` |
| `top` | `120px` (onder Zone A) | `calc(120px + safe-area-inset-top)` |
| `right` | `18px` | `calc(14px + safe-area-inset-right)` |
| `width` | `280px` | `min(240px, 60vw)` |
| `gap` | `8px` (tussen toasts) | `6px` |
| `z-index` | `var(--z-toast)` | id. |
| `max items` | 3 (overflow → FIFO queue) | 3 |

Toast-anatomie: `[icon] [LABEL kleine caps] / [titel] / [subtitel]`. Slide-in
van rechts (24px → 0) + fade. Hold 3000-3500 ms. Slide-out + fade 400 ms.

Wanneer `#hudLeader.lShow` actief is op mobiel (L-hotkey toggle, kan met
extern keyboard) wordt Zone C automatisch verborgen om overlap met de
expanded leaderboard te voorkomen — de achievement/unlock blijft in de queue
en verschijnt zodra L weer dichtgaat.

## Prioriteits- en queue-tabel

| Zone | Type | Priority | Slot-cap | Conflict-gedrag | Default `dur` |
|---|---|---|---|---|---|
| A | `status` (race-leader) | 100 | 1 | Replace current | 2200 |
| A | `status` (fastest-lap) | 90 | 1 | Replace if pri ≤ 90 | 2400 |
| A | `status` (overtake +pos) | 60 | 1 | Replace if pri ≤ 60 | 1400 |
| A | `status` (lost +pos) | 50 | 1 | Replace if pri ≤ 50 | 1200 |
| A | `status` (weather) | 70 | 1 | Replace if pri ≤ 70 | 3000 |
| A | `status` (hazard / world) | 40 | 1 | Drop if higher active | 700-1000 |
| A | `status` (UI hints — cam, mirror) | 30 | 1 | Drop if higher active | 700-900 |
| A | `status` (drift, mini-turbo, near-miss) | 50 | 1 | Replace if pri ≤ 50 | 900-1400 |
| A | `banner` (race) | 80 | 1 | Replace if pri ≤ 80 | 2000-2800 |
| B | `lap` | n/a | 1 | Debounced per `(lap, total)` | 1800 |
| C | `achievement` | 50 | 3 | Stack; overflow → FIFO queue | 3500 |
| C | `unlock` | 70 | 3 | Stack; overflow → FIFO queue | 3500 |

**Zone A drop-rule**: een lager-priority status event wordt gedropt (NIET
gequeued) als er nu een hogere-priority status actief is. Reden: race-status
is "now or never" — een hint van 1.5 s eerder die 4 s later verschijnt is
verwarrend.

**Zone C overflow-rule**: max 3 zichtbare toasts. Item 4+ wacht in
`_queueC[]` totdat een slot vrijkomt. Geen drop — achievements/unlocks zijn
"hard-earned" en moeten altijd zichtbaar worden.

**Pause-gedrag**: bij `gameState === 'PAUSED'` worden alle dismiss-timers
bevroren (Notify houdt eigen `_paused` flag bij). Op resume tellen ze verder.

## Edge cases & niet-doen

- **Countdown** (`gameplay/countdown.js` → `#cdOverlay > #cdNum`): blijft 100%
  ongewijzigd. Notify zet géén content terwijl `gameState === 'COUNTDOWN'`
  behalve voor LAP en achievement/unlock (die kunnen tijdens countdown niet
  voorkomen). `Notify.status()` aanroep tijdens countdown wordt **gedropt**
  zodat een eventuele pre-race showPopup uit een ander subsysteem niet
  bovenop "3-2-1-GO" valt.
- **Finish-screen** (`gameState === 'FINISH'`): `#hud` is hidden, touch-controls
  verborgen. `Notify.banner()` mag dan een centraal "champion banner"
  renderen via een vierde out-of-band slot dat niet onder de mobiele
  zone-restricties valt. Dit is de enige uitzondering.
- **Selection screen** (`showPopup` voor "🔒 LOCKED — ..." in `ui/select.js:513`):
  `gameState === 'SELECT'`. Notify.status valt automatisch terug op de Zone A
  positie (top-right) die op het selection-screen geen race-conflict geeft.
- **Wrong-way** (`#wrongWayOverlay`) en **track-limits warn** (`#warnOverlay`):
  state-driven persistent overlays, NIET event-meldingen. Buiten scope van
  deze refactor — blijven op huidige positie.
- **Combo-counter** (`#comboEl`): persistent HUD-widget op `top:160px;left:18px`,
  blijft staan.

## Facade-API (in `js/ui/notifications.js`)

```js
// JSDoc-stijl typings voor de facade. Alle functies zijn idempotent
// veilig — return value is altijd void.

/**
 * Toon een race-status flash in Zone A (top-right, single slot).
 * @param {string} text                  Korte tekst (≤ 30 chars aanbevolen).
 * @param {Object} [opts]
 * @param {string} [opts.color]          CSS color voor tekst + glow. Default '#fff'.
 * @param {number} [opts.dur=1500]       Zichtbaarheidsduur in ms.
 * @param {number} [opts.priority=50]    Hoge waardes vervangen lagere. Lagere worden gedropt.
 * @param {string} [opts.icon]           Optioneel emoji/icon voorop.
 */
Notify.status(text, opts);

/**
 * Toon een lap-announcement in Zone B (top-center, subtiel).
 * Debounced per (lap,total) combinatie — meerdere calls met dezelfde args
 * binnen 5 s renderen maar één melding.
 * @param {number} lap
 * @param {number} total
 */
Notify.lap(lap, total);

/**
 * Toon een achievement-toast in Zone C (stack).
 * @param {Object} ach
 * @param {string} ach.title             Hoofdtekst, bv. 'SPEED DEMON'.
 * @param {string} [ach.desc]            Subtekst, bv. 'Exceed 95% top speed'.
 * @param {string} [ach.icon='🏆']       Icon-emoji.
 * @param {string} [ach.color='#ffd700'] Accent-kleur.
 */
Notify.achievement(ach);

/**
 * Toon een unlock-toast in Zone C (stack). Hogere prio dan achievement.
 * @param {Object} carDef                Bestaande CAR_DEFS entry.
 *                                       (`carDef.brand`, `carDef.name`)
 */
Notify.unlock(carDef);

/**
 * Race-banner — equivalent van de oude showBanner. Tijdens RACE: zelfde
 * Zone A maar met grotere variant (priority 80). Tijdens FINISH/PAUSED:
 * out-of-band centraal modal. Geen restricties op centrale zone als
 * gameState !== 'RACE'.
 * @param {string} text
 * @param {string} [color='#fff']
 * @param {number} [dur=2200]
 */
Notify.banner(text, color, dur);

/**
 * Internal — handler voor visibilitychange / pause. Niet voor consumer-gebruik.
 */
Notify._setPaused(bool);

/**
 * Internal — wis alle actieve toasts (gebruikt bij race-restart).
 */
Notify._clearAll();
```

## Mapping bestaande call-sites → facade

Alle bestaande call-sites blijven werken zonder wijziging. De vier wrappers in
`hud.js` / `achievements.js` / `progression.js` worden:

```js
// js/ui/hud.js
function showPopup(text, color, dur=1000){
  // showPopup heet historisch zo maar gedraagt zich als een race-status flash.
  Notify.status(text, {color, dur, priority: _inferPopupPriority(text)});
}
function showBanner(text, color, dur=2200){
  Notify.banner(text, color, dur);
}
function showBannerTop(text, color, dur=2000){
  // Twee soorten callers:
  //   - tracklimits.js:178  showBannerTop('LAP n / N', ...)
  //   - weather.js:237      showBannerTop('🌧 RAIN INCOMING', ...)
  // De eerste mag naar Zone B, de tweede hoort als status (Zone A).
  if(/^LAP\s+\d/i.test(text)){
    const m = text.match(/LAP\s+(\d+)\s*\/\s*(\d+)/i);
    if(m) Notify.lap(+m[1], +m[2]);
    else Notify.lap(0, 0);
  } else {
    Notify.status(text, {color, dur, priority:70}); // weather priority
  }
}

// js/gameplay/achievements.js
function showAchievementToast(ach){
  Notify.achievement({
    title: ach.title || ach.label,
    desc:  ach.desc || '',
    icon:  ach.icon || '🏆'
  });
}
// _achieveQueue / _achieveTimer / showNextAchievement / updateAchievementToast
// blijven bestaan maar worden in FASE 4 verwijderd — ze zijn nu dood code
// (zie FASE 0 rapport, vondst 4).

// js/persistence/progression.js
function showUnlockToast(carDef){ Notify.unlock(carDef); }
// showUnlocks() blijft staan: routeert nog steeds via showUnlockToast →
// Notify.unlock met setTimeout-chain — die delays blijven nuttig zodat
// meerdere unlocks niet als grote brei in de stack komen.
```

### Per-melding mapping (uit FASE 0 tabel)

| # | Melding | Bron-aanroep | Wordt | Zone | Priority |
|---|---|---|---|---|---|
| 1 | RACE LEADER popup | `showPopup` | `Notify.status` | A | 100 |
| 2 | RACE LEADER banner | `showBanner` | `Notify.banner` (race-mode) | A | 80 |
| 3 | OVERTAKE +Pn | `showPopup` | `Notify.status` | A | 60 |
| 4 | ▼Pn lost | `showPopup` | `Notify.status` | A | 50 |
| 5 | LAP n/N | `showBannerTop` (regex match) | `Notify.lap` | B | n/a |
| 6 | RECOVERED | `showBanner` | `Notify.banner` | A | 80 |
| 7 | RESCUED BY DOLPHINS | `showBanner` | `Notify.banner` | A | 80 |
| 8 | FASTEST LAP banner | `showBanner` | `Notify.banner` | A | 90 |
| 9 | FASTEST LAP floatText | `floatText` | **blijft floatText** (3D-anchored) | — | n/a |
| 10 | NEW BEST: t | `showBanner` | `Notify.banner` | A | 80 |
| 11 | DRIFT! +n | `showPopup` | `Notify.status` | A | 50 |
| 12 | MINI TURBO | `showPopup` | `Notify.status` | A | 50 |
| 13 | HARD LANDING | `showPopup` | `Notify.status` | A | 40 |
| 14 | NEAR MISS | `floatText` | blijft floatText | — | n/a |
| 15 | MOON DUST/SEABED/etc | `showPopup` | `Notify.status` | A | 30 |
| 16 | FRESH TYRES | `showPopup` | `Notify.status` | A | 50 |
| 17 | TYRES WORN | `showPopup` | `Notify.status` | A | 50 |
| 18 | COLD TYRES warm-up | `showPopup` | `Notify.status` | A | 40 |
| 19 | Achievement (in-race) | `showAchievementToast` | `Notify.achievement` | C | n/a |
| 20 | Achievement queue | dood code | (verwijderen FASE 4) | — | — |
| 21 | Unlock | `showUnlockToast` | `Notify.unlock` | C | n/a |
| 22 | Weather forecast | `showBannerTop` | `Notify.status` | A | 70 |
| 23 | Sector flash | direct DOM `#sectorPanel` | **buiten scope** (panel dubbel-gebruik, niet event) | — | — |
| 24 | Sector split | direct DOM `#sectorInfo` | **buiten scope** zelfde reden — TODO afzonderlijk | — | — |
| 25 | Cam/Mirror/Leader hints | `showPopup` | `Notify.status` | A | 30 |
| 26 | Locked car hint (selection) | `showPopup` | `Notify.status` | A | 50 |
| 27 | World hazards | `showPopup` (×11) | `Notify.status` | A | 40 |
| 28 | Pit-stop | `showBanner`+`floatText` | `Notify.banner` + floatText | A | 80 |
| 29 | Combo `#comboEl` | persistent HUD-widget | **buiten scope** | — | — |
| 30 | Wrong way | persistent overlay | **buiten scope** | — | — |
| 31 | Track-limits warn | persistent overlay | **buiten scope** | — | — |
| 32 | NEW HIGH SCORE | `showBanner` | `Notify.banner` (finish-mode → centraal) | out-of-band | n/a |
| 33 | CHAMPION | `showBanner` | `Notify.banner` (finish-mode → centraal) | out-of-band | n/a |
| 34 | Achievement (post-race) | `showAchievementToast` | `Notify.achievement` | C | n/a |
| 35 | Daily challenge | `showAchievementToast` | `Notify.achievement` (icon=📋) | C | n/a |

### Wat NIET door Notify gaat

- `floatText` / `floatText3D` — die zijn screen-position anchored aan een
  3D-event (drift score, near-miss boven de andere auto). Behouden zoals nu;
  ze hebben al een mobile-clamp.
- Persistent state-driven overlays (`#wrongWayOverlay`, `#warnOverlay`,
  `#comboEl`, `#closeBattleEl`, `#fastestLapFlash`, `#colFlash`,
  `#sectorPanel`, `#sectorInfo`).
- Countdown (`#cdOverlay`).
- HUD-widgets (`#hudRaceInfo`, `#hudInstruments`, `#hudMap`, etc.).

## Bestand-layout

```
js/ui/notifications.js     ← nieuw, non-module 'use strict', exposeert window.Notify
css/notifications.css      ← nieuw, ge-import in <head> ná hud.css
index.html                 ← <script src="js/ui/notifications.js"></script> vóór hud.js
                              <link rel="stylesheet" href="css/notifications.css"> ná hud.css
```

## Inline structuur van notifications.js

```js
'use strict';
(function(){
  const NS = {
    A: null, // top-right status container
    B: null, // top-center lap container
    C: null, // top-right achievement/unlock stack container
  };
  const state = {
    A: { el:null, dismissAt:0, priority:0, fadeRAF:0 },
    B: { el:null, dismissAt:0, lastKey:'' },
    C: { items:[], queue:[] }, // items = visible toasts; queue = overflow
    paused:false,
    pauseAccum:0, // wallclock pause carry-over
  };

  function ensureContainers(){ /* lazy-create + appendChild */ }
  function renderStatus(text, opts){ /* slot A */ }
  function renderLap(lap, total){ /* slot B, debounced */ }
  function renderToast(kind, payload){ /* push C */ }
  function tick(){ /* per-frame? Or use setInterval? */ }

  // Pause hook (hoort op visibilitychange en op pause-toggle).
  // gameState wordt niet polled — we hangen op een explicit setter.

  window.Notify = {
    status: renderStatus,
    lap:    renderLap,
    achievement: ach    => renderToast('achievement', ach),
    unlock: carDef      => renderToast('unlock', carDef),
    banner: (t,c,d)     => renderBanner(t,c,d),
    _setPaused: v       => { state.paused = !!v; },
    _clearAll: ()       => { /* drop all + clear timers */ },
  };
})();
```

Timers: `setTimeout` per item + `requestAnimationFrame` voor cross-fades.
Bij `_setPaused(true)` accumuleert verstreken tijd niet meer; `_setPaused(false)`
schuift `dismissAt` met de pause-duur op.

## Errors

Alle catch-paden in notifications.js volgen het bestaande dbg-patroon:

```js
try { ... } catch(e){
  if(window.dbg) dbg.warn('notify', e, 'context');
  else console.warn('Notify:', e);
}
```

## Open keuzes (commenteer voor 'go' op FASE 1 indien anders gewenst)

1. **Zone B locatie op mobiel** — nu `top:36px+safe-area`. Alternatief: `top:64px`
   voor wat ademruimte. Default: 36px.
2. **Zone C op mobiel — links of rechts?** Spec zegt "bovenste rand of kleine
   zijbalk". Ik kies rechts (boven gas-knop maar ver genoeg uit de buurt) zodat
   alles dat ephemeerl is in dezelfde rechter-kolom valt. Alternatief: links
   (onder `#hudRaceInfo`) — maar dat conflicteert met `#hudRpm`/`#nitroBar`-zone.
   Default: rechts.
3. **Wel of niet status-events queueen wanneer pri-conflict?** Default: **drop**
   (race-status is now-or-never). Alternatief: 1-deep queue van max 1 ander item.
4. **Drop showBanner-call van out-of-band finish.js door Notify of laat finish.js
   direct het bestaande `#bannerOverlay` aanroepen?** Default: door Notify (één
   weg in de wereld), met explicit `gameState === 'FINISH'` branch in
   `Notify.banner()` die het centrale slot gebruikt.
