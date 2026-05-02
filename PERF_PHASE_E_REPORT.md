# Performance Phase E Report

## Change applied

`js/gameplay/countdown.js` — `runCountdown()`: ná het eerste F1-light wordt via `requestAnimationFrame` één keer `renderer.compile(scene, camera)` aangeroepen. Dat compileert ALLE scene-materialen ongeacht camera-frustum, dus ook objecten die niet zichtbaar zijn vanaf de starting view (coins, spin-pads, boost-pads, skidmark-materials, particle-materialen, etc.). Branch is bovenop Phase D gestapeld.

## Wat het probleem was (volgens iPad-feedback van gebruiker)

Phase D (PR #62) loste de "click→countdown-lights" freeze op door de postfx warm-render uit `goToRace` te halen. iPad-test bevestigde:

- ✓ Auto-select + track laden voelen sneller
- ✗ Restende freeze ná GO-lights — paar seconden tussen "lichten uit" en "kunnen rijden"
- ✗ In-game hitches bij coins / spin-pads — first-time activeren van een effect veroorzaakt een spike

**Diagnose**: `loop()` rendert tijdens countdown alleen wat in camera-frustum staat. Coins, spin-pads, boost-pads, etc. zitten in scene maar zijn buiten de stationaire countdown-cam frustum, dus hun shader-permutaties worden NIET tijdens countdown gewarmd. Eerste keer ze in beeld komen of geactiveerd worden = compile-spike.

**Phase E fix**: één-time `renderer.compile(scene, camera)` ná het eerste F1-light. Three.js' `compile()` traverseert de hele scene (geen frustum-culling) en compileert alle materials. De cost is verstopt achter de visuele light-cascade (5 lichten × 700ms = 3.5 sec budget). De `requestAnimationFrame` zorgt dat de browser de eerste light-paint doet vóór compile blokkeert.

## Implementatie

```js
// In countdown.js runCountdown's lightOn function, na de eerste light:
if(i===1&&window.perfMark){
  requestAnimationFrame(function(){
    perfMark('countdown:compile:start');
    try{
      if(window.renderer&&typeof window.renderer.compile==='function'
         &&window.scene&&window.camera){
        window.renderer.compile(window.scene,window.camera);
      }
    }catch(e){
      if(window.dbg)dbg.warn('countdown','compile failed: '+(e&&e.message||e));
    }
    perfMark('countdown:compile:end');
    perfMeasure('countdown.compile','countdown:compile:start','countdown:compile:end');
  });
}
```

## SwiftShader limitatie — geen sandbox-meting mogelijk

Op headless SwiftShader hangt deze sync compile minutenlang voor cold runs. `tools/perf-run.mjs` met 180-sec timeout faalde al bij cold candy. Dit is **niet representatief** voor echte hardware:

- SwiftShader (CPU): elke shader-link is software-emulatie; 1000+ materialen × shadow-variants × light-variants kan minuten kosten.
- Echte iPad GPU: shader-link is async + parallel; verwacht 50-300 ms voor de hele scene.

Bewijs dat dit een SwiftShader-artefact is: dezelfde compile voor neoncity in Phase B's `renderer.compile()`-only meting gaf 891 ms (sandbox), waarbij de niet-zichtbare meshes vermoedelijk lazy bleven. Volledige scene-compile zonder culling is een ander dier.

## Wat WEL gevalideerd is in sandbox

**Visuele flow**: tools/phase-e-volcano-firstlight.png — screenshot op T+900 ms na startRace. Toont:
- F1 lights overlay zichtbaar (eerste rode bol aan, 4 dim)
- Race-cam scene gerendered (player car rood, ember haze, HUD)

**Bevestigt**:
1. F1-light visual paint gebeurt vóór de compile blokkeert (rAF-nesting werkt)
2. Phase D's effect blijft staan: scene wordt gerendered tijdens countdown ondanks geen warm-render in goToRace
3. Compile-call zelf wordt geactiveerd (niet ge-skipt door een edge-case)

**Niet validable in sandbox**:
- Hoe lang compile duurt op echte hardware
- Of de "freeze tussen light 1 en light 2" zichtbaar zal zijn op iPad
- Of de in-game hitches op coins/spinners weg zijn

## Verwacht effect op iPad

**Best-case** (als compile <300ms op iPad):
- Click → first light komt direct
- Tijdens 700ms gap tussen light 1 en light 2: compile draait, niet zichtbaar
- Resterende lights animeren normaal
- GO → drivable frame near-instant
- Coins / spin-pads / boost-pads voelen smooth

**Worst-case** (als compile >700ms op iPad):
- First light komt direct
- Mogelijk merkbare gap tussen light 1 en light 2 (compile blokkeert)
- Resterende lights cascade na compile
- GO → drivable frame near-instant
- Coins / spin-pads / boost-pads voelen smooth
- Net effect: trade ~1s freeze NA GO voor ~1s gap MID-countdown — laatste is minder pijnlijk want user verwacht countdown-pacing-variantie

**Failure case** (als compile >3s op iPad):
- F1-light cascade hapert duidelijk
- Sub-optimaal — terug naar Phase D zonder Phase E, en aparte aanpak voor in-game hitches verzinnen

## Risico

Zelfde verhaal als Phase C/C2/D — geen sandbox-validatie mogelijk voor sync compile-werk. Op echte hardware verwacht ik op basis van Three.js' compile()-prestaties op vergelijkbare scenes <300ms voor meeste worlds, mogelijk 500-1000ms voor neoncity (1417 meshes + 193 lights).

Reverten via git revert is triviaal als iPad-test laat zien dat het tegenvalt. Het is een 23-regel toevoeging in één file.

## Test plan

- [x] Visuele flow correct: first light komt vóór compile
- [x] Phase D's flow ongewijzigd (ge-rebased erbovenop)
- [ ] iPad-test: meet `countdown.compile` ms via `?perfauto=1` + `window.perfLog` 
- [ ] iPad-test: voelt countdown-cascade soepel? (subjectief)
- [ ] iPad-test: voelt race-start (na GO) snappy? (was de oorspronkelijke feedback)
- [ ] iPad-test: coins / spin-pads / boost-pads zonder hitch? (was de oorspronkelijke feedback)

## Cumulatief overzicht sinds Phase A

| metric | Phase A | Phase D | Phase E (verwacht iPad) |
|---|---|---|---|
| Click→countdown-lights | 743-18491 ms freeze (transition) | 40-85 ms | 40-85 ms |
| Click→GO-frame drivable | freeze NA GO + hitches | freeze NA GO + hitches | smooth verwacht |
| In-game hitches op effects | aanwezig | aanwezig | smooth verwacht |
| Trade-off | none | none | mogelijke gap mid-countdown |
