# iPad Performance Test Protocol

Vergelijk de **Phase C2 fix** (branch `claude/perf-phase-c2-car-warmup`) tegen de **SwiftShader baseline** (`tools/baselines/phase-c2-swiftshader.json`) op echte iPad-hardware. Doel: bevestigen of de SwiftShader-meting de echte iPad-performance reflecteert.

## Vooraf

- iPad met Safari (iOS 16+).
- Mac met Safari op hetzelfde WiFi-netwerk (voor remote Web Inspector). Geen Mac? Zie alternatief onderaan.
- Branch `claude/perf-phase-c2-car-warmup` ergens gehost (zie "Deploy" hieronder).

Op iPad één keer: Settings → Safari → Advanced → **Web Inspector AAN**. Op Mac: Safari → Settings → Advanced → **Show Develop menu in menu bar**.

## Deploy de C2 branch

Drie opties; kies wat past:

**A. GitHub Pages** — als de repo Pages heeft staan: push de branch, wacht 1 min, open `https://properams.github.io/spencers-race-club/?perfauto=1` (mogelijk subpath). De `?perfauto=1` zet automatisch debug-logging aan + exposeert `window._perfHooks`.

**B. Lokaal Mac → iPad via WiFi**:
```sh
cd ~/spencers-race-club
git checkout claude/perf-phase-c2-car-warmup
git pull
python3 -m http.server 8080 --bind 0.0.0.0
```
Op iPad: open `http://<MAC-IP>:8080/?perfauto=1`. Mac-IP via System Settings → Network.

**C. Vercel / Netlify drop** — sleep de hele directory naar Netlify Drop. Open `<dropurl>/?perfauto=1` op iPad.

Verifieer: title screen verschijnt, "SPENCER'S RACE CLUB" tekst zichtbaar.

## Run de test

### Stap 1 — connect Web Inspector

iPad via Lightning/USB-C aan Mac. In Mac Safari: **Develop → [iPad-naam] → [Spencer's Race Club tab]**. Web Inspector opent in nieuw venster met live console.

### Stap 2 — verifieer dat _perfHooks beschikbaar is

In de console plak:
```js
typeof window._perfHooks
```
Verwacht: `"object"`. Zo niet, check dat de URL `?perfauto=1` bevat en herlaad.

### Stap 3 — run de cycle

Plak dit script in de console — het doet exact dezelfde cycle als `tools/perf-run.mjs` (5 cold + 5 warm runs over candy → volcano → space → neoncity → grandprix). Duurt ~5-10 minuten op iPad.

```js
(async function runIpadPerfCycle() {
  const WORLDS = ['candy','volcano','space','neoncity','grandprix'];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const heap = () => performance.memory ? +(performance.memory.usedJSHeapSize/1048576).toFixed(2) : null;

  const result = {
    meta: {
      browser: navigator.userAgent,
      method: 'manual-ipad-via-perfHooks',
      date: new Date().toISOString().slice(0,10),
      url: location.href,
      worlds: WORLDS,
    },
    heap: { boot: heap(), afterWorldSelect: null, end: null },
    runs: [],
  };

  async function runCycle(world, label) {
    window.perfLog.length = 0;
    const heapBefore = heap();
    window._perfHooks.goToWorldSelect();
    await sleep(200);
    window._perfHooks.pickWorld(world);
    await sleep(300);
    window._perfHooks.startRace();
    // wacht tot countdown klaar is en de eerste race-frame gerendered
    const t0 = performance.now();
    while (!window.perfLog.some(e => e.name === 'go.toFirstFrame')) {
      if (performance.now() - t0 > 60000) throw new Error('timeout waiting first frame for ' + world);
      await sleep(100);
    }
    await sleep(3000);
    const heapAfter = heap();
    const programs = window.renderer && window.renderer.info && window.renderer.info.programs
      ? window.renderer.info.programs.length : 0;
    return { world, label, heapBefore, heapAfter, programs, entries: window.perfLog.slice() };
  }

  window._perfHooks.goToWorldSelect();
  await sleep(200);
  result.heap.afterWorldSelect = heap();

  for (const w of WORLDS) {
    console.log('cold', w);
    result.runs.push(await runCycle(w, 'cold'));
    window._perfHooks.goToTitle();
    await sleep(400);
  }
  for (const w of WORLDS) {
    console.log('warm', w);
    result.runs.push(await runCycle(w, 'warm'));
    window._perfHooks.goToTitle();
    await sleep(400);
  }
  result.heap.end = heap();

  // Persist + copy: zet op window én log compact JSON.
  window._ipadPerfResult = result;
  console.log('=== DONE ===');
  console.log('window._ipadPerfResult is gevuld. Run nu:');
  console.log('  copy(JSON.stringify(window._ipadPerfResult, null, 2))');
  console.log('en plak in een leeg bestand op je Mac (bv tools/baselines/ipad-c2.json).');
  return 'ok';
})();
```

### Stap 4 — extract en sla op

Wacht tot je `=== DONE ===` ziet. Dan in dezelfde console:

```js
copy(JSON.stringify(window._ipadPerfResult, null, 2))
```

Dat plaatst de hele JSON op je Mac-clipboard. Maak op de Mac een nieuw bestand:

```sh
pbpaste > ~/spencers-race-club/tools/baselines/ipad-c2.json
```

Of plak in een editor en save.

### Stap 5 — vergelijk met SwiftShader baseline

Op de Mac:
```sh
cd ~/spencers-race-club
/usr/local/bin/node tools/perf-compare.mjs \
  tools/baselines/phase-c2-swiftshader.json \
  tools/baselines/ipad-c2.json > IPAD_VS_SWIFTSHADER.md
```

Open `IPAD_VS_SWIFTSHADER.md` om de delta-tabel te lezen.

## Wat te zoeken

De SwiftShader-meting in `phase-c2-swiftshader.json` toonde:

- `transition.total` cold: 207-680 ms per wereld (was 743-18491 ms voor de fix)
- `goToRace.postfxWarm` cold: 51-929 ms (space is anomalously hoog)
- `firstRaceFrame.render` cold: 601-4155 ms — dit was niet veel beter dan baseline omdat SwiftShader fragment-bound is

Op echte iPad-GPU verwachten we (hypothese, niet bewezen):

- `transition.total` cold blijft klein (<500 ms voor alle werelden) — dat is de Phase C2 win.
- `goToRace.postfxWarm` daalt fors omdat GPU-rendering ordes-of-magnitude sneller is dan SwiftShader.
- `firstRaceFrame.render` daalt eveneens fors (potentieel <200 ms voor lichte werelden, <500 ms voor neoncity).
- De originele "5 sec freeze na countdown GO" zou volledig weg moeten zijn.

**Als de iPad-meting laat zien dat alles klein is**: de fix doet wat het moet doen, en SwiftShader was misleidend voor `firstRaceFrame.render`-interpretatie.

**Als iPad nog steeds een freeze heeft na GO**: er is nog werk te doen — mogelijk Phase D (chunked precompile during countdown) of scene-vereenvoudiging voor de zwaarste werelden.

**Als iPad transition.total ook laag is maar firstRaceFrame.render hoog**: hetzelfde patroon als SwiftShader, en dan is de scene gewoon te zwaar voor de hardware.

## Visuele check

Na een race-start: cars zichtbaar in beeld direct na GO? Geen flicker? Schaduwen aanwezig? Bloom/grading correct? Maak een screenshot van een race-frame in neoncity (zwaarste wereld) en vergelijk met `tools/phase-c2-volcano-racestart.png` / `tools/phase-c2-grandprix-racestart.png`.

## Alternatief: zonder Mac

Als je geen Mac hebt voor remote inspect, drie opties:

1. **iPad-only via "Web Inspector lite" apps** zoals **Inspect Browser** (App Store, betaald). Werkt maar minder smooth.
2. **Skip de cycle, doe een hand-meting**: tap door 1 wereld (neoncity, want dat is de zwaarste). Stopwatch op je telefoon: tijd tussen het tappen van de wereld-card en het verschijnen van de car-select. Tijd tussen tappen van START RACE en verschijnen van de countdown-lichten. Tijd tussen GO en eerste beweging. Geef die drie getallen door — niet zo precies maar wel indicatief.
3. **iPad → bestand**: voeg dit toe aan het einde van het script in stap 3:
   ```js
   const blob = new Blob([JSON.stringify(window._ipadPerfResult)], {type:'application/json'});
   const a = document.createElement('a');
   a.href = URL.createObjectURL(blob); a.download = 'ipad-c2.json';
   document.body.appendChild(a); a.click();
   ```
   Bestand verschijnt in iPad's Files-app onder Downloads. Mail het naar jezelf.

## Rapporteer terug

Eén bericht met:

1. Welke deploy-optie gebruikt (A/B/C).
2. Output van `IPAD_VS_SWIFTSHADER.md` (of de drie hand-getallen als je optie 2 uit de alt deed).
3. Korte indruk: voelt de race-start nu snappy of nog steeds traag?
