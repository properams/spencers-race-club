// tools/perf-compare.mjs — diff twee perf-output JSONs.
//
// Bedoeld om Spencer's Race Club perf-runs naast elkaar te zetten, in
// het bijzonder: SwiftShader (sandbox) vs echte hardware (iPad). Output
// is een markdown-tabel met cold + warm waarden per wereld voor de
// belangrijkste metrics, plus een delta-kolom.
//
// Gebruik:
//   /opt/node22/bin/node tools/perf-compare.mjs <baseline.json> <new.json>
//   /opt/node22/bin/node tools/perf-compare.mjs <baseline.json> <new.json> > report.md
//
// Voorbeeld:
//   /opt/node22/bin/node tools/perf-compare.mjs \
//     tools/baselines/phase-c2-swiftshader.json \
//     tools/perf-output.json
//
// De runner (tools/perf-run.mjs) en het rapport-template (perf-report.mjs)
// blijven los staan; dit script verandert nooit de game of de raw data.

import { readFileSync, existsSync } from 'node:fs';

if (process.argv.length < 4) {
  console.error('Usage: node tools/perf-compare.mjs <baseline.json> <new.json>');
  process.exit(1);
}

const [baselinePath, newPath] = process.argv.slice(2);
for (const p of [baselinePath, newPath]) {
  if (!existsSync(p)) { console.error('not found:', p); process.exit(1); }
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const fresh    = JSON.parse(readFileSync(newPath,      'utf8'));

const METRICS = [
  // [internal-key, label, "lower is better" | "context"]
  { name: 'transition.total',      label: 'transition.total',     mode: 'lower' },
  { name: 'build.precompile',      label: 'build.precompile',     mode: 'lower' },
  { name: 'build.postfxWarm',      label: 'build.postfxWarm',     mode: 'lower' },
  { name: 'goToRace.postfxWarm',   label: 'goToRace.postfxWarm',  mode: 'lower' },
  { name: 'goToRace.total',        label: 'goToRace.total',       mode: 'lower' },
  { name: 'firstRaceFrame.render', label: 'firstRaceFrame.render',mode: 'lower' },
];

function pickMs(entries, name){
  const e = entries.find(x => x.name === name);
  return e ? +e.ms.toFixed(1) : null;
}
function getRun(data, world, label){
  return data.runs.find(r => r.world === world && r.label === label);
}
function diff(base, neu){
  if (base == null || neu == null) return null;
  const d = neu - base;
  const pct = base !== 0 ? (d/base)*100 : 0;
  return { d: +d.toFixed(1), pct: +pct.toFixed(1) };
}
function fmtVal(v){ return v == null ? '   – ' : v.toFixed(1).padStart(7); }
function fmtDelta(d){
  if (!d) return '   – ';
  const sign = d.d >= 0 ? '+' : '';
  return `${sign}${d.d.toFixed(0)} (${sign}${d.pct.toFixed(0)}%)`;
}

// Worlds: union of the two runs (in baseline order, append any new ones).
const worldsBase = baseline.meta?.worlds || [];
const worldsNew  = fresh.meta?.worlds || [];
const worlds = [...worldsBase, ...worldsNew.filter(w => !worldsBase.includes(w))];

const out = [];
out.push('# Performance comparison');
out.push('');
out.push('## Inputs');
out.push(`- Baseline: \`${baselinePath}\``);
out.push(`  - browser: ${baseline.meta?.browser || '?'}`);
out.push(`  - method:  ${baseline.meta?.method || '?'}`);
out.push(`  - date:    ${baseline.meta?.date || '?'}`);
out.push(`- New:      \`${newPath}\``);
out.push(`  - browser: ${fresh.meta?.browser || '?'}`);
out.push(`  - method:  ${fresh.meta?.method || '?'}`);
out.push(`  - date:    ${fresh.meta?.date || '?'}`);
out.push('');

for (const label of ['cold', 'warm']) {
  out.push(`## ${label.toUpperCase()} runs`);
  out.push('');
  // One table per metric so columns stay readable on phones.
  for (const m of METRICS) {
    out.push(`### ${m.label} (${label})`);
    out.push('');
    out.push('| World     | baseline (ms) | new (ms)  | Δ (ms / %)  |');
    out.push('|-----------|--------------:|----------:|:------------|');
    for (const w of worlds) {
      const rb = getRun(baseline, w, label);
      const rn = getRun(fresh,    w, label);
      const vb = rb ? pickMs(rb.entries, m.name) : null;
      const vn = rn ? pickMs(rn.entries, m.name) : null;
      const d  = diff(vb, vn);
      out.push(`| ${w.padEnd(9)} | ${fmtVal(vb)} | ${fmtVal(vn)} | ${fmtDelta(d)} |`);
    }
    out.push('');
  }
}

// Summary line: largest improvements + regressions on transition.total cold.
out.push('## Summary — biggest moves on transition.total (cold)');
out.push('');
const moves = [];
for (const w of worlds) {
  const vb = pickMs((getRun(baseline,w,'cold')||{entries:[]}).entries, 'transition.total');
  const vn = pickMs((getRun(fresh,   w,'cold')||{entries:[]}).entries, 'transition.total');
  const d  = diff(vb, vn);
  if (d) moves.push({ w, vb, vn, d: d.d, pct: d.pct });
}
moves.sort((a,b) => a.pct - b.pct);
for (const m of moves) {
  const arrow = m.d <= 0 ? '↓' : '↑';
  out.push(`- ${m.w}: ${m.vb.toFixed(0)} → ${m.vn.toFixed(0)} ms (${arrow} ${Math.abs(m.pct).toFixed(0)}%)`);
}
out.push('');

// Heap snapshot deltas (just the boot + end fields).
const heapBase = baseline.heap || {};
const heapNew  = fresh.heap || {};
out.push('## Heap (MB)');
out.push('| Event               | baseline | new |');
out.push('|---------------------|---------:|----:|');
for (const k of ['boot','afterWorldSelect','end']) {
  const a = heapBase[k] != null ? heapBase[k].toFixed(1) : '–';
  const b = heapNew[k]  != null ? heapNew[k].toFixed(1)  : '–';
  out.push(`| ${k.padEnd(19)} | ${String(a).padStart(8)} | ${String(b).padStart(3)} |`);
}
out.push('');

process.stdout.write(out.join('\n'));
