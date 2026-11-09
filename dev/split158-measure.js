#!/usr/bin/env node
// (round 158, split158) Opening the Lab, measured (docs/upgrades/split158.md): each run is a fresh profile and data
// folder (the Lab's code not loaded at the start: lab-intent's 'none'), then
//   main window  activate('tool:three') 4 s after the first screen → the preview's first drawn frame (its __labPace),
//                a trace of every process meanwhile (the window's script compiles and runs per file)
//   Lab window   ⋯ › View & help › ⧉ Open in its own window → its first frame (LabWin.times()), traced the same way
// and per window: the Lab's code loaded (KB of the lazy groups' files that are in), the JS heap after a GC.
//   node dev/split158-measure.js [--runs 3] [--app <dir>] [--json out.json]
//   (under the lock: HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package flock /tmp/hearth-run.lock node dev/split158-measure.js)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const RUNS = Math.max(1, Number(opt('--runs', 1)) || 1);
const APP = path.resolve(opt('--app', ROOT));
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'split158-'));
const LazyData = new Function(`${fs.readFileSync(path.join(APP, 'lazy-data.js'), 'utf8')}; return LazyData;`)(); // eslint-disable-line no-new-func
const size = (f) => { try { return fs.statSync(path.join(APP, f)).size; } catch { return 0; } };

// ---------- the script run in Hearth's window ----------
const SCRIPT = String.raw`
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const now = () => performance.now();
const R = { main: {}, lw: {} };
await until(() => typeof H !== 'undefined' && performance.getEntriesByName('hearth:ready').length, 60000);
await smoke({ cdnFor: 'lab-window\\.html' });
const ready = performance.getEntriesByName('hearth:ready')[0].startTime;
{ const left = ready + 4000 - now(); if (left > 0) await wait(left); }
R.main.labBefore = Lazy.state().find((g) => g.name === 'lab')?.state;
const pageEval = async (expr) => (await smoke({ target: 'three-sandbox', cdp: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }))?.result?.value;
const CATS = 'v8,disabled-by-default-v8.compile,devtools.timeline,toplevel,blink.user_timing';
// ---------- main window ----------
await smoke({ trace: 'start', cats: CATS });
await wait(300);
performance.mark('s158-press');
const t0 = now();
activate('tool:three');
await until(async () => (await pageEval('window.__labPace?.state()?.drawn').catch(() => null)) > 0, 90000, 15);
R.main.first = Math.round(now() - t0);
const lab = Lazy.state().find((g) => g.name === 'lab');
R.main.labGroupMs = lab?.ms ?? null; R.main.labLoadedAt = lab?.at != null ? Math.round(lab.at - t0) : null;
await wait(1500);
R.main.trace = window.SMOKE_TMP + '/s158-main.json';
await smoke({ trace: 'stop', dump: R.main.trace });
R.main.groups = Lazy.state().filter((g) => g.state === 'loaded').map((g) => g.name);
await smoke({ cdp: 'HeapProfiler.collectGarbage' });
R.main.heap = (await smoke({ cdp: 'Runtime.getHeapUsage' })) || null;
// ---------- the Lab window ----------
await until(() => window.LabWinHost && ThreeLab.search, 30000);
await wait(1000);
const view = (await ThreeLab.search.menus()).more.find((r) => Array.isArray(r) && r[0] === 'View & help');
const row = view?.[2]?.find((r) => Array.isArray(r) && /Open in its own window/.test(r[0]));
await smoke({ trace: 'start', cats: CATS });
await wait(300);
const t1 = now();
row[2]();
const lwv = async (expr) => { const r = await smoke({ pageEval: 'lab-window\\.html', expr: '(async () => JSON.stringify(await (async () => (' + expr + '))()))()' }); return r?.value === undefined ? undefined : JSON.parse(r.value); };
R.lw.times = await until(async () => (await lwv('typeof LabWin !== "undefined" && LabWin.times().frame ? LabWin.times() : null')) || null, 90000, 100);
R.lw.clickToFrame = Math.round(now() - t1);
await wait(1500);
R.lw.trace = window.SMOKE_TMP + '/s158-lw.json';
await smoke({ trace: 'stop', dump: R.lw.trace });
R.lw.groups = await lwv('Lazy.state().filter((g) => g.state === "loaded").map((g) => g.name)');
await smoke({ pageCdp: 'lab-window\\.html', cdp: 'HeapProfiler.collectGarbage' });
R.lw.heap = await smoke({ pageCdp: 'lab-window\\.html', cdp: 'Runtime.getHeapUsage' });
try { await window.hub.labwin.close?.(); } catch { /* closes with the app */ }
await window.hub.fs.write(window.SMOKE_TMP + '/s158.json', JSON.stringify(R));
return '[SPLIT158] main first frame ' + R.main.first + ' ms · Lab window ' + JSON.stringify(R.lw.times);
`;

// ---------- a window's main thread in a trace: the Lab's script files compiled and run ----------
function traceStats(file, pageRe) {
  let ev; try { ev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  if (!Array.isArray(ev)) ev = ev.traceEvents || [];
  const urlOf = (e) => e.args?.data?.url || e.args?.beginData?.url || e.args?.fileName || '';
  const threads = new Map(); for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') threads.set(`${e.pid}:${e.tid}`, e.args?.name);
  // the window: the renderer main thread that compiled the page's scripts (lazy.js), of the page asked for
  const cand = new Map();
  for (const e of ev) if (/lazy\.js$/.test(urlOf(e)) || pageRe.test(urlOf(e))) { const k = `${e.pid}:${e.tid}`; if (threads.get(k) === 'CrRendererMain') cand.set(k, (cand.get(k) || 0) + 1); }
  const pids = new Set();
  for (const e of ev) if (pageRe.test(urlOf(e))) pids.add(e.pid);
  const key = [...cand.keys()].find((k) => pids.has(Number(k.split(':')[0]))) || [...cand.keys()][0];
  if (!key) return { error: 'no window thread' };
  const mine = ev.filter((e) => `${e.pid}:${e.tid}` === key && e.ph === 'X');
  const r1 = (v) => Math.round(v * 10) / 10;
  const out = { three: { compile: 0, run: 0 }, parts: { compile: 0, run: 0, files: 0 }, lab: { compile: 0, run: 0, files: new Set() }, lazyCompile: 0 };
  const labFiles = new Set(LazyData.GROUPS.flatMap((g) => g.files));
  for (const e of mine) {
    const d = (e.dur || 0) / 1000; const u = urlOf(e).split(/[?#]/)[0];
    const rel = u.replace(/^.*?\/(?=(tools\/)?[^/]+$)/, '');
    const isCompile = /^(v8\.compile|v8\.parseOnBackground)$/.test(e.name);
    const isRun = e.name === 'EvaluateScript';
    if (/(^|\/)V8\.(CompileLazy|LazyCompile)/.test(e.name) || e.name === 'V8.CompileLazy') out.lazyCompile += d;
    if (!isCompile && !isRun) continue;
    const f = rel.startsWith('tools/') || labFiles.has(rel) ? rel : `tools/${rel}`;
    if (/tools\/three\.js$/.test(u)) out.three[isCompile ? 'compile' : 'run'] += d;
    if (/tools\/three-lab-[a-z]+\.js$/.test(u)) { out.parts[isCompile ? 'compile' : 'run'] += d; }
    if (labFiles.has(f) || labFiles.has(rel)) { out.lab[isCompile ? 'compile' : 'run'] += d; out.lab.files.add(rel); }
  }
  return { three: { compile: r1(out.three.compile), run: r1(out.three.run) }, parts: { compile: r1(out.parts.compile), run: r1(out.parts.run) }, lab: { compile: r1(out.lab.compile), run: r1(out.lab.run), files: out.lab.files.size }, lazyCompile: r1(out.lazyCompile) };
}
const kbOf = (groups) => Math.round(LazyData.GROUPS.filter((g) => groups.includes(g.name)).reduce((a, g) => a + g.files.reduce((b, f) => b + size(f), 0), 0) / 1024);

const all = [];
const script = path.join(BASE, 'split158-run.js');
fs.writeFileSync(script, SCRIPT);
for (let run = 1; run <= RUNS; run += 1) {
  const tmp = path.join(BASE, `run${run}`); fs.mkdirSync(tmp, { recursive: true });
  const t0 = Date.now();
  const r = spawnSync('node', [path.join(ROOT, 'dev', 'smoke.js'), '--app', APP, '--fake-engines', '--no-lazy-wait', '--wait', '800', '--check-timeout', '400000', '--tmp', tmp, '--script', script],
    { cwd: ROOT, encoding: 'utf8', timeout: 1800000, maxBuffer: 256 << 20, env: { ...process.env, TMPDIR: tmp, HEARTH_THREE_DIR: process.env.HEARTH_THREE_DIR || '/opt/cdn-cache/three@0.186.1/package' } });
  const text = `${r.stdout || ''}${r.stderr || ''}`;
  for (const l of text.split('\n').filter((x) => /SPLIT158|problem|✖/.test(x))) console.log(`  [run ${run}] ${l.slice(0, 300)}`);
  let R = null; try { R = JSON.parse(fs.readFileSync(path.join(tmp, 's158.json'), 'utf8')); } catch { console.log(`run ${run}: no result\n${text.slice(-2000)}`); continue; }
  const row = {
    run,
    main: { labBefore: R.main.labBefore, first: R.main.first, labGroupMs: R.main.labGroupMs, kb: kbOf(R.main.groups), heapMB: R.main.heap?.usedSize ? Math.round(R.main.heap.usedSize / 1048576 * 10) / 10 : null, three158: R.main.groups.filter((g) => /^lab(part|p)-?/.test(g)), trace: traceStats(R.main.trace, /index\.html/) },
    lw: { times: R.lw.times, codeMs: R.lw.times ? R.lw.times.code - R.lw.times.start : null, frameMs: R.lw.times ? R.lw.times.frame - R.lw.times.start : null, clickToFrame: R.lw.clickToFrame, kb: kbOf(R.lw.groups || []), heapMB: R.lw.heap?.usedSize ? Math.round(R.lw.heap.usedSize / 1048576 * 10) / 10 : null, trace: traceStats(R.lw.trace, /lab-window\.html/) },
  };
  console.log(`run ${run} (${Math.round((Date.now() - t0) / 1000)} s): ${JSON.stringify(row)}`);
  all.push(row);
}
const med = (xs) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : null; };
const m = (f) => med(all.map((r) => { try { return f(r); } catch { return NaN; } }));
console.log(`\n== medians of ${all.length} run(s) · ${APP} · tools/three.js ${Math.round(size('tools/three.js') / 1024)} KB ==`);
console.log(`main window: first frame ${m((r) => r.main.first)} ms · lab group load ${m((r) => r.main.labGroupMs)} ms · three.js compile ${m((r) => r.main.trace.three.compile)} + run ${m((r) => r.main.trace.three.run)} ms · Lab files compile ${m((r) => r.main.trace.lab.compile)} + run ${m((r) => r.main.trace.lab.run)} ms · lazy compiles ${m((r) => r.main.trace.lazyCompile)} ms · code loaded ${m((r) => r.main.kb)} KB · heap ${m((r) => r.main.heapMB)} MB`);
console.log(`Lab window:  first frame ${m((r) => r.lw.frameMs)} ms after its page started (click → frame ${m((r) => r.lw.clickToFrame)}) · code in ${m((r) => r.lw.codeMs)} ms · three.js compile ${m((r) => r.lw.trace.three.compile)} + run ${m((r) => r.lw.trace.three.run)} ms · Lab files compile ${m((r) => r.lw.trace.lab.compile)} + run ${m((r) => r.lw.trace.lab.run)} ms · lazy compiles ${m((r) => r.lw.trace.lazyCompile)} ms · code loaded ${m((r) => r.lw.kb)} KB · heap ${m((r) => r.lw.heapMB)} MB`);
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(all, null, 1));
fs.rmSync(BASE, { recursive: true, force: true });
