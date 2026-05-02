// tools/perf-run.mjs — Perf Phase A automated runner.
//
// Headless desktop meting van Spencer's Race Club. Doorloopt per wereld
// (cold + warm) de transitie title → world-select → race en logt de
// metingen die door js/core/debug.js + scene.js + loop.js in window.perfLog
// worden gepusht. Output: stdout JSON-blob (geconsumed door write-report.mjs)
// of, met --report, direct PERF_PHASE_A_REPORT.md schrijven.
//
// Uitvoering:
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
//     /opt/node22/bin/node tools/perf-run.mjs --report
//
// Server: start een eigen Python http-server op poort 8087 als die nog
// niet draait. file:// werkt niet — index.html laadt ES-modules met CORS.

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const PORT = process.env.PERF_PORT ? +process.env.PERF_PORT : 8087;
const URL = `http://localhost:${PORT}/?perfauto=1`;
// Cold pass order: grandprix is the boot-default (rebuildWorld returns
// early when newWorld===activeWorld), so we visit it LAST in the cold
// pass — by then we've switched away to neoncity and the grandprix
// rebuild fires for real. Warm pass uses the same order.
const WORLDS = ['candy', 'volcano', 'space', 'neoncity', 'grandprix'];
const WANT_REPORT = process.argv.includes('--report');

// ── http-server ──────────────────────────────────────────────────────
async function startServer(){
  // Probeer eerst of er al iets op de poort luistert.
  try {
    const r = await fetch(`http://localhost:${PORT}/index.html`, { signal: AbortSignal.timeout(800) });
    if (r.ok) { console.log(`[perf] server already up on :${PORT}`); return null; }
  } catch (_) {}
  console.log(`[perf] starting python http.server on :${PORT}`);
  const proc = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], {
    cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  // Wacht max 5s tot poort luistert.
  for (let i=0; i<50; i++){
    try {
      const r = await fetch(`http://localhost:${PORT}/index.html`, { signal: AbortSignal.timeout(400) });
      if (r.ok) return proc;
    } catch (_) {}
    await sleep(100);
  }
  throw new Error('http-server did not come up in 5s');
}

// ── Helpers ─────────────────────────────────────────────────────────
async function waitForBoot(page){
  await page.waitForFunction(() => window._bootDone === true, { timeout: 30000 });
}
async function readPerfLog(page){
  return await page.evaluate(() => Array.isArray(window.perfLog) ? window.perfLog.slice() : []);
}
async function clearPerfLog(page){
  await page.evaluate(() => { if (window.perfLog) window.perfLog.length = 0; });
}
async function snapshotShaders(page){
  return await page.evaluate(() => {
    const r = window.renderer;
    return r && r.info && r.info.programs ? r.info.programs.length : 0;
  });
}
async function snapshotHeap(page){
  return await page.evaluate(() => performance.memory ? +(performance.memory.usedJSHeapSize/1048576).toFixed(2) : null);
}

// ── Per-world cycle: pick world → start race → wait first race frame ─
async function runWorldCycle(page, world, label){
  await clearPerfLog(page);
  // Heap vóór transitie.
  const heapBefore = await snapshotHeap(page);
  // Spring vanuit elk gameState terug naar WORLD_SELECT zodat het pad
  // identiek is voor elke run (en dat onze _perfHooks predictable zijn).
  await page.evaluate(() => { window._perfHooks.goToWorldSelect(); });
  await sleep(150);
  // pickWorld → SELECT scherm; rebuildWorld() schiet hier af bij wereld-change.
  await page.evaluate((w) => { window._perfHooks.pickWorld(w); }, world);
  await sleep(180);
  await page.evaluate(() => { window._perfHooks.startRace(); });
  // Wacht op go.toFirstFrame measure (komt na 5×700ms light-sequence + GO).
  // Margin: 60s voor headless software-rendering — neoncity buildScene
  // duurt op SwiftShader 18s+ (_precompileScene, GPU-equivalent op CPU).
  // NB: waitForFunction signature is (fn, arg, options) — arg null doorgeven
  // anders wordt het options-object als arg geïnterpreteerd en valt timeout
  // terug op de 30s default.
  await page.waitForFunction(
    () => Array.isArray(window.perfLog) && window.perfLog.some(e => e.name === 'go.toFirstFrame'),
    null,
    { timeout: 60000 }
  );
  // 3 sec doordraaien zodat het eerste-frame spike + warmup zichtbaar zijn.
  await sleep(3000);
  const heapAfter = await snapshotHeap(page);
  const programs = await snapshotShaders(page);
  const log = await readPerfLog(page);
  return { world, label, heapBefore, heapAfter, programs, entries: log };
}

// ── Main ────────────────────────────────────────────────────────────
async function main(){
  process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/opt/pw-browsers';
  const server = await startServer();
  let exitCode = 0;
  let browser, page;
  try {
    // --enable-precise-memory-info schakelt Chrome's 5MB-bucket-quantisatie uit
    // op performance.memory.usedJSHeapSize. Zonder deze flag blijft heap.MB
    // op een vaste waarde voor het hele run-leven (niets meetbaars).
    browser = await chromium.launch({ headless: true, args:['--no-sandbox','--enable-precise-memory-info'] });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    page = await ctx.newPage();
    page.on('pageerror', e => console.warn('[page.error]', e.message));
    page.on('console', m => { if (m.type()==='error') console.warn('[page.console]', m.text()); });

    console.log('[perf] navigating', URL);
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await waitForBoot(page);
    console.log('[perf] boot done; capturing baseline');
    const heapBoot = await snapshotHeap(page);
    const baselineLog = await readPerfLog(page);
    // Heap @ Title (eerste navigatie via _perfHooks logt 'goToWorldSelect').
    await page.evaluate(() => { window._perfHooks.goToWorldSelect(); });
    await sleep(120);
    const heapAfterWorldSelect = await snapshotHeap(page);

    const runs = [];
    for (const world of WORLDS){
      console.log(`[perf] cold ${world}`);
      runs.push(await runWorldCycle(page, world, 'cold'));
      console.log(`[perf] back to title`);
      await page.evaluate(() => { window._perfHooks.goToTitle(); });
      await sleep(250);
    }
    // Warm: tweede pas in dezelfde volgorde. Cache (manifest, audioCtx,
    // shader programs) zou nu warm moeten zijn.
    for (const world of WORLDS){
      console.log(`[perf] warm ${world}`);
      runs.push(await runWorldCycle(page, world, 'warm'));
      await page.evaluate(() => { window._perfHooks.goToTitle(); });
      await sleep(250);
    }
    const heapEnd = await snapshotHeap(page);

    const result = {
      meta: {
        browser: await page.evaluate(() => navigator.userAgent),
        date: new Date().toISOString().slice(0,10),
        method: 'playwright-chromium',
        url: URL,
        worlds: WORLDS,
      },
      heap: { boot: heapBoot, afterWorldSelect: heapAfterWorldSelect, end: heapEnd },
      baselineLog,
      runs,
    };

    const outJson = resolve(REPO_ROOT, 'tools/perf-output.json');
    writeFileSync(outJson, JSON.stringify(result, null, 2));
    console.log('[perf] wrote', outJson);
    if (WANT_REPORT){
      const { writeReport } = await import('./perf-report.mjs');
      writeReport(result, resolve(REPO_ROOT, 'PERF_PHASE_A_REPORT.md'));
      console.log('[perf] wrote PERF_PHASE_A_REPORT.md');
    }
  } catch (e) {
    console.error('[perf] FAILED:', e);
    exitCode = 1;
  } finally {
    if (page) await page.close().catch(()=>{});
    if (browser) await browser.close().catch(()=>{});
    if (server) server.kill('SIGTERM');
    process.exit(exitCode);
  }
}

main();
