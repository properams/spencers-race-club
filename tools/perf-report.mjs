// tools/perf-report.mjs — Vertaalt tools/perf-output.json naar
// PERF_PHASE_A_REPORT.md. Aparte module zodat de runner snel hercompileert
// en de rapport-template los van de meet-logica geüpdatet kan worden.
//
// Gebruik:
//   import { writeReport } from './perf-report.mjs'; writeReport(json, path);
// Of stand-alone:
//   /opt/node22/bin/node tools/perf-report.mjs tools/perf-output.json PERF_PHASE_A_REPORT.md

import { readFileSync, writeFileSync } from 'node:fs';

function pickMs(entries, name){
  const e = entries.find(x => x.name === name);
  return e ? +e.ms.toFixed(1) : null;
}
function pickAll(entries, name){
  return entries.filter(x => x.name === name);
}
function fmtCell(v){
  if (v == null) return '–';
  if (typeof v === 'number') return v.toFixed(1);
  return String(v);
}

export function writeReport(result, outPath){
  const lines = [];
  lines.push('# Performance Phase A Report');
  lines.push('');
  lines.push('## Test environment');
  lines.push('- Browser: ' + (result.meta.browser || 'unknown'));
  lines.push('- Method: ' + (result.meta.method || 'unknown'));
  lines.push('- Date: ' + (result.meta.date || ''));
  lines.push('- URL: ' + (result.meta.url || ''));
  lines.push('- Note: desktop-sandbox meting; mobiele meting volgt later');
  lines.push('- WebGL backend: headless-chromium uses SwiftShader software-rendering. Shader compilation cost (`build.precompile`) is therefore CPU-bound and not directly comparable to GPU timings on real desktop or mobile. The relative ordering between worlds is still meaningful; absolute milliseconds are not.');
  lines.push('- Asset manifest: `assets/manifest.json` references files that 404 in this checkout (see CLAUDE.md "Audio-systeem" — game falls back to procedural). Long `assets.textures` / `audio.musicStems` numbers below are dominated by 404-response timings, not actual decode cost. Background preloads do **not** block the main thread or buildScene; they are listed separately at the bottom of this report.');
  lines.push('');

  const byKey = (label) => result.runs.filter(r => r.label === label);
  const cold = byKey('cold');
  const warm = byKey('warm');

  // ── World transition (rebuildWorld → buildScene incl. precompile) ──
  lines.push('## World transition (select → race) — buildScene timings');
  lines.push('All numbers in ms. `transition.total` is the user-facing rebuildWorld duration; `build.*` are substeps. Cold visit order: candy → volcano → neoncity → space (boot-default last so its rebuild fires for real).');
  lines.push('');
  lines.push('| World     | Cold total | dispose | track | world | gameplay | night | assetBridge | precompile | Warm total |');
  lines.push('|-----------|-----------:|--------:|------:|------:|---------:|------:|------------:|-----------:|-----------:|');
  for (const w of result.meta.worlds){
    const c = cold.find(x => x.world === w);
    const wm = warm.find(x => x.world === w);
    const cTotal = c ? pickMs(c.entries, 'transition.total') ?? pickMs(c.entries, 'build.total') : null;
    const wTotal = wm ? pickMs(wm.entries, 'transition.total') ?? pickMs(wm.entries, 'build.total') : null;
    const dispose = c ? pickMs(c.entries, 'build.disposeScene') : null;
    const track   = c ? pickMs(c.entries, 'build.track') : null;
    const world   = c ? pickMs(c.entries, 'build.world') : null;
    const gobj    = c ? pickMs(c.entries, 'build.gameplayObjects') : null;
    const night   = c ? pickMs(c.entries, 'build.night') : null;
    const ab      = c ? pickMs(c.entries, 'build.assetBridge') : null;
    const pre     = c ? pickMs(c.entries, 'build.precompile') : null;
    lines.push(`| ${w.padEnd(9)} | ${fmtCell(cTotal).padStart(10)} | ${fmtCell(dispose).padStart(7)} | ${fmtCell(track).padStart(5)} | ${fmtCell(world).padStart(5)} | ${fmtCell(gobj).padStart(8)} | ${fmtCell(night).padStart(5)} | ${fmtCell(ab).padStart(11)} | ${fmtCell(pre).padStart(10)} | ${fmtCell(wTotal).padStart(10)} |`);
  }
  lines.push('');

  // ── Countdown → first race frame ────────────────────────────────────
  lines.push('## Countdown → first race frame');
  lines.push('`go.toFirstFrame` = wall-clock ms between GO-event and the rAF tick where loop() first sees gameState===RACE (excludes the actual render call). `firstRaceFrame.render` = duration of that render call itself. Together they cover the visible "GO → moving car" window.');
  lines.push('');
  lines.push('| World     | go.toFirstFrame cold | warm  | firstRaceFrame.render cold | warm  | Shaders @ buildScene end | Shaders @ firstFrame |');
  lines.push('|-----------|---------------------:|------:|---------------------------:|------:|-------------------------:|---------------------:|');
  for (const w of result.meta.worlds){
    const c = cold.find(x => x.world === w);
    const wm = warm.find(x => x.world === w);
    const cFrame = c ? pickMs(c.entries, 'go.toFirstFrame') : null;
    const wFrame = wm ? pickMs(wm.entries, 'go.toFirstFrame') : null;
    const cRender = c ? pickMs(c.entries, 'firstRaceFrame.render') : null;
    const wRender = wm ? pickMs(wm.entries, 'firstRaceFrame.render') : null;
    const cShAfterBuild = c ? pickMs(c.entries, 'shaderPrograms.afterBuild') : null;
    const cShAtFirst    = c ? pickMs(c.entries, 'shaderPrograms.atFirstFrame') : null;
    lines.push(`| ${w.padEnd(9)} | ${fmtCell(cFrame).padStart(20)} | ${fmtCell(wFrame).padStart(5)} | ${fmtCell(cRender).padStart(26)} | ${fmtCell(wRender).padStart(5)} | ${fmtCell(cShAfterBuild).padStart(24)} | ${fmtCell(cShAtFirst).padStart(20)} |`);
  }
  lines.push('');

  // ── Asset loading per world ─────────────────────────────────────────
  lines.push('## Asset loading per world');
  lines.push('Models = HDRI + GLTF/OBJ/FBX props. Textures = ground-set + skybox layers. Audio = music stems.');
  lines.push('');
  lines.push('| World     | Models (ms) | Textures (ms) | Audio (ms) | Total preload (ms) |');
  lines.push('|-----------|------------:|--------------:|-----------:|-------------------:|');
  for (const w of result.meta.worlds){
    const c = cold.find(x => x.world === w);
    if (!c){ lines.push(`| ${w.padEnd(9)} |          – |             – |          – |                  – |`); continue; }
    const mEntry = c.entries.find(e => e.name==='assets.models' && e.world===w);
    const tEntry = c.entries.find(e => e.name==='assets.textures' && e.world===w);
    const aEntry = c.entries.find(e => e.name==='audio.musicStems' && e.world===w);
    const tot   = c.entries.find(e => e.name==='assets.preloadWorld.total' && e.world===w);
    lines.push(`| ${w.padEnd(9)} | ${fmtCell(mEntry ? +mEntry.ms.toFixed(1) : null).padStart(11)} | ${fmtCell(tEntry ? +tEntry.ms.toFixed(1) : null).padStart(13)} | ${fmtCell(aEntry ? +aEntry.ms.toFixed(1) : null).padStart(10)} | ${fmtCell(tot ? +tot.ms.toFixed(1) : null).padStart(18)} |`);
  }
  lines.push('');

  // ── Heap progression ────────────────────────────────────────────────
  lines.push('## Heap progression');
  lines.push('| Event                         | Heap MB |');
  lines.push('|-------------------------------|--------:|');
  lines.push(`| App boot                      | ${fmtCell(result.heap.boot).padStart(7)} |`);
  lines.push(`| After goToWorldSelect (cold)  | ${fmtCell(result.heap.afterWorldSelect).padStart(7)} |`);
  for (const w of result.meta.worlds){
    const c = cold.find(x => x.world === w);
    if (!c) continue;
    lines.push(`| Race start cold — ${w.padEnd(11)}| ${fmtCell(c.heapBefore).padStart(7)} |`);
    lines.push(`| Race +3s cold — ${w.padEnd(13)}| ${fmtCell(c.heapAfter).padStart(7)} |`);
  }
  for (const w of result.meta.worlds){
    const wm = warm.find(x => x.world === w);
    if (!wm) continue;
    lines.push(`| Race +3s warm — ${w.padEnd(13)}| ${fmtCell(wm.heapAfter).padStart(7)} |`);
  }
  lines.push(`| End of run                    | ${fmtCell(result.heap.end).padStart(7)} |`);
  lines.push('');

  // ── Top 5 hottest segments (synchronous = main-thread blocking only) ─
  // Async asset/audio preloads zijn fire-and-forget en blokkeren niet de
  // main-thread; ze staan apart hieronder zodat de top-5 bruikbaar is voor
  // het diagnoseren van de freeze.
  const syncMeasures = [];
  const asyncMeasures = [];
  for (const r of result.runs){
    for (const e of r.entries){
      if (typeof e.ms !== 'number') continue;
      if (/^(transition|build|go|goToRace|firstRaceFrame)\./.test(e.name)){
        syncMeasures.push({ name: e.name, ms: e.ms, world: r.world, label: r.label });
      } else if (/^(assets|audio)\./.test(e.name)){
        asyncMeasures.push({ name: e.name, ms: e.ms, world: r.world, label: r.label });
      }
    }
  }
  syncMeasures.sort((a,b) => b.ms - a.ms);
  asyncMeasures.sort((a,b) => b.ms - a.ms);
  lines.push('## Top 5 hottest synchronous segments');
  lines.push('Main-thread blocking work — these are the segments that can cause a perceptible freeze.');
  lines.push('');
  for (let i=0; i<5 && i<syncMeasures.length; i++){
    const m = syncMeasures[i];
    lines.push(`${i+1}. \`${m.name}\` — ${m.ms.toFixed(1)} ms — world=${m.world} (${m.label})`);
  }
  lines.push('');
  lines.push('## Top 5 longest background preloads');
  lines.push('Async fire-and-forget; does NOT block buildScene. Listed for completeness.');
  lines.push('');
  for (let i=0; i<5 && i<asyncMeasures.length; i++){
    const m = asyncMeasures[i];
    lines.push(`${i+1}. \`${m.name}\` — ${m.ms.toFixed(1)} ms — world=${m.world} (${m.label})`);
  }
  lines.push('');

  // ── Observations (factual, no interpretation) ───────────────────────
  lines.push('## Observations (FACTUAL ONLY)');
  for (const w of result.meta.worlds){
    const c = cold.find(x => x.world === w);
    const wm = warm.find(x => x.world === w);
    if (!c) continue;
    const cTotal = pickMs(c.entries, 'transition.total') ?? pickMs(c.entries, 'build.total');
    const wTotal = wm ? (pickMs(wm.entries, 'transition.total') ?? pickMs(wm.entries, 'build.total')) : null;
    const cFrame = pickMs(c.entries, 'go.toFirstFrame');
    const cRender = pickMs(c.entries, 'firstRaceFrame.render');
    const wRender = wm ? pickMs(wm.entries, 'firstRaceFrame.render') : null;
    const cShDelta = pickMs(c.entries, 'shaderPrograms.delta');
    const cPrecomp = pickMs(c.entries, 'build.precompile');
    if (cTotal != null && wTotal != null){
      lines.push(`- ${w}: transition.total cold ${cTotal.toFixed(0)}ms, warm ${wTotal.toFixed(0)}ms (Δ ${(cTotal-wTotal).toFixed(0)}ms).`);
    } else if (cTotal != null){
      lines.push(`- ${w}: transition.total cold ${cTotal.toFixed(0)}ms.`);
    }
    if (cPrecomp != null && cTotal != null){
      const pct = (cPrecomp/cTotal*100).toFixed(0);
      lines.push(`  - of which build.precompile cold ${cPrecomp.toFixed(0)}ms (${pct}% of transition.total).`);
    }
    if (cFrame != null) lines.push(`  - go.toFirstFrame cold ${cFrame.toFixed(1)}ms (warm ${(pickMs(wm?.entries||[], 'go.toFirstFrame')||0).toFixed(1)}ms).`);
    if (cRender != null) lines.push(`  - firstRaceFrame.render cold ${cRender.toFixed(0)}ms${wRender!=null?`, warm ${wRender.toFixed(0)}ms`:''}.`);
    if (cShDelta != null) lines.push(`  - shader programs added during cold buildScene window: ${cShDelta}.`);
  }
  // Heap growth observation.
  const heapBoot = result.heap.boot;
  const heapEnd = result.heap.end;
  if (typeof heapBoot === 'number' && typeof heapEnd === 'number'){
    lines.push(`- Heap from boot ${heapBoot}MB to end-of-run ${heapEnd}MB (Δ ${(heapEnd-heapBoot).toFixed(1)}MB) over 10 race transitions (5 cold + 5 warm).`);
  }
  lines.push('');
  lines.push('---');
  lines.push('_Generated by tools/perf-run.mjs + tools/perf-report.mjs_');
  lines.push('');

  writeFileSync(outPath, lines.join('\n'));
}

// CLI mode
if (import.meta.url === `file://${process.argv[1]}`){
  const inJson = process.argv[2] || 'tools/perf-output.json';
  const outMd  = process.argv[3] || 'PERF_PHASE_A_REPORT.md';
  const data = JSON.parse(readFileSync(inJson, 'utf8'));
  writeReport(data, outMd);
  console.log('wrote', outMd);
}
