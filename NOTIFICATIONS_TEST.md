# Notifications — handmatige test-checklist (FASE 3)

Branch: `claude/notification-reposition-pY6ZY`
Doel: visueel valideren dat de Notify-facade in alle scenarios netjes
positioneert, prioriteert en niet de racing sight-line of touch-controls
blokkeert.

Open de game lokaal (statische server volstaat, géén build) en doorloop de
volgende scenarios. Zet `?debug` in URL om de dbg-channel `notify` mee te
loggen — drops & queue-events worden daar gemeld.

## Setup

- [ ] Cache hard-refresh (notifications.css en notifications.js zijn nieuw).
- [ ] Verifieer dat in DevTools deze elementen op `<body>` staan na de eerste
      melding: `#ntfA`, `#ntfB`, `#ntfC` (en `#ntfOOB` zodra je een banner
      tijdens FINISH ziet).

## A — Mobiel portrait (DevTools device-toolbar, 390×844 iPhone of soortgelijk)

- [ ] **Race-leader tijdens regen** — start race, win P1 in lap 2.
  - [ ] "🏆 P1 — RACE LEADER!" verschijnt **rechtsboven** (Zone A), niet
        midden-boven, niet over de gas-knop.
  - [ ] Banner "🏆 RACE LEADER!" verschijnt **niet** centraal (oude
        showBanner gedrag) — moet ook in Zone A landen.
  - [ ] Toast verbergt automatisch na ~2.2 s.

- [ ] **Lap-overgang naar lap 2** —
  - [ ] "LAP 2 / 3" verschijnt **subtiel top-center** (Zone B), kleine grijze
        tekst, geen glow, geen border. Verdwijnt na ~1.8 s.
  - [ ] Géén dubbele announcement bij dezelfde lap als andere events ook
        triggeren.

- [ ] **Achievement bij lap-overgang** — trigger CLEAN_LAP achievement
      (drive een hele lap zonder recovery) terwijl je net lap 2 ingaat.
  - [ ] Achievement-toast (`✨ CLEAN LAP`) verschijnt **rechts**, in Zone C
        (onder Zone A), níet bottom:200px, níet over gas-knop.
  - [ ] Lap-announce (Zone B) en Achievement (Zone C) overlappen niet.
  - [ ] Toast slidet rechts in en blijft ~3.5 s zichtbaar.

- [ ] **Touch-controls test** — terwijl een toast actief is:
  - [ ] Gas-knop (rechtsonder) klikbaar zonder dat de toast er overheen valt.
  - [ ] Steerknoppen (linksonder) klikbaar.
  - [ ] Nitro-knop (boven gas) klikbaar.

## B — Mobiel landscape (568×320 of soortgelijk)

- [ ] Zelfde scenarios als A.
- [ ] Zone C valt iets hoger en strakker (landscape media query). Achievement
      desc-tekst is verborgen om verticale ruimte te sparen — alleen icon +
      label + titel.
- [ ] Geen toast onder de pause-button die in landscape op `bottom:10px`
      gecentreerd is.

## C — Desktop (≥1280px breed)

- [ ] **Stress-test: 3 events binnen 1 seconde** — drive richting een speed-
      trap zone, drift, near-miss tegelijk.
  - [ ] Zone A toont alleen het hoogste-prio event; lager-prio wordt gedropt
        (zie `dbg.log('notify','drop',...)` in console).
  - [ ] Zone C stapelt tot 3 toasts (achievement + unlock + extra).
  - [ ] Items 4+ wachten in queue; verschijnen zodra een slot vrijkomt.

- [ ] **Weather-forecast** —
  - [ ] "🌧 RAIN INCOMING" verschijnt in Zone A (top-rechts), niet meer
        midden-boven.

- [ ] **L-hotkey leaderboard expand** terwijl achievement actief —
  - [ ] Bekend issue: Zone C kan visueel overlappen met expanded leaderboard
        op kleine viewports. Op desktop is er ruimte; verifieer dat het
        leesbaar blijft.

## D — Pause & countdown

- [ ] **Countdown 3-2-1-GO** —
  - [ ] F1-lichten + GO! display ongewijzigd.
  - [ ] Géén status/lap/achievement toasts tijdens countdown — `Notify._clearAll`
        triggert op `gameState='COUNTDOWN'`.

- [ ] **Pause tijdens actieve achievement** — trigger achievement, druk P
      voordat-ie verdwijnt.
  - [ ] Toast blijft staan (timer freezet).
  - [ ] Op resume telt de timer netjes verder, dismist na resterende dur.

- [ ] **Tab-switch (alt-tab)** — laat een achievement zichtbaar, switch naar
      andere tab voor 5 s, kom terug.
  - [ ] Toast staat nog op het scherm (dt-cap voorkomt instant-dismiss).
  - [ ] Dismist netjes binnen volgende seconde.

## E — Finish-screen banners

- [ ] Win race met nieuwe high-score:
  - [ ] "🏆 NEW HIGH SCORE!" banner verschijnt **centraal** in `#ntfOOB`
        (out-of-band, oké want HUD is hidden).
  - [ ] Op P1: gevolgd door "🏆 CHAMPION, SPENCER!" centraal banner.
  - [ ] Achievement-stack rechts op finish-screen werkt nog (post-race
        achievements verschijnen gestaggered).

## F — Edge cases / regressies

- [ ] **Dode `#popupMsg` element** zou niet meer geschreven moeten worden —
      check DevTools dat `#popupMsg.textContent` leeg blijft tijdens een race.
- [ ] **`#bannerOverlay`** zou `display:none` moeten blijven gedurende race.
- [ ] **`#topBanner`** zou nooit `opacity:1` mogen krijgen.
- [ ] **`#unlockToast`** zou leeg moeten blijven; unlocks lopen via Zone C.

## G — Console hygiene

- [ ] Geen `Uncaught` errors tijdens de scenarios.
- [ ] Met `?debug` URL: dbg-channel `notify` toont normale events
      (`drop` voor lager-prio in Zone A, `_clearAll` op state-transitie).
- [ ] Geen `Notify niet ready` warnings (alle popup-calls vuren pas na boot).

---

## Bekende open punten (geen blocker voor merge — FASE 4 cleanup)

- Lege DOM-elementen blijven in `index.html`: `#topBanner`, `#popupMsg`,
  `#bannerOverlay`, `#bannerText`, `#achieveToast`, `#unlockToast`,
  `#sectorInfo` (laatste blijft want `showSectorSplit` ongewijzigd, buiten scope).
- Dode achievement-queue (`_achieveQueue`, `updateAchievementToast`,
  `showNextAchievement`) blijft staan in `gameplay/achievements.js` —
  nooit gepusht, dus geen runtime impact.
- Mobile-leaderboard-expand kan visueel overlappen met Zone C op smalle
  schermen — geaccepteerd voor nu.

Wanneer je klaar bent: 'go' op FASE 4 voor cleanup + parallel review-agents.
