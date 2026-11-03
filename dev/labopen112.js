#!/usr/bin/env node
// (round 112, labopen112) The Lab's first open, phase by phase: runs dev/checks/labopen112.js (one app run per --runs,
// each a fresh profile and data folder: a setup, then one start + one Lab open per case) and turns what it left (the
// window's and the preview page's times, the page's long frames, a trace of every process) into a phase table per case,
// medians over the runs. docs/upgrades/labopen112.md.
//   node dev/labopen112.js [--runs 3] [--app <dir>] [--only demo,real] [--cases cold,code,warm] [--json out.json] [--keep]
//   (under the lock: HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package flock /tmp/hearth-run.lock node dev/labopen112.js)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const RUNS = Math.max(1, Number(opt('--runs', 1)) || 1);
const ONLY = opt('--only', 'demo,real').split(',');
const CASES = opt('--cases', 'cold,code,warm').split(',');
const PLAN = ONLY.flatMap((s) => CASES.map((c) => `${s}:${c}`));
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'lo112-'));
const src = fs.readFileSync(path.join(ROOT, 'dev', 'checks', 'labopen112.js'), 'utf8');
const [setup, body] = src.split(/\n\/\/@@ reload\b[^\n]*\n/);
const script = path.join(BASE, 'labopen112-run.js');
fs.writeFileSync(script, [setup.replace('window.LO112_PLAN ||', `${JSON.stringify(PLAN)} ||`), ...PLAN.map(() => body)].join('\n//@@ reload\n'));

// ---------- the trace: what each main thread did between the press and the first frame ----------
function traceStats(file, R) {
  let ev; try { ev = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
  if (!Array.isArray(ev)) ev = ev.traceEvents || [];
  const press = ev.find((e) => e.name === 'lo112-press');
  if (!press) return { error: 'no press mark' };
  const T0 = press.ts; const pidW = press.pid;
  const firstUs = T0 + Math.max(R.w.first || 0, R.msgs.find((m) => m[0] === 'stack-drawn')?.[1] || 0) * 1000;
  const threads = new Map(); for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') threads.set(`${e.pid}:${e.tid}`, e.args?.name);
  const urlOf = (e) => e.args?.data?.url || e.args?.beginData?.url || e.args?.data?.stackTrace?.[0]?.url || e.args?.fileName || '';
  const pidS = new Map();
  for (const e of ev) if (e.pid !== pidW && /three-sandbox\.html/.test(urlOf(e)) && e.ts >= T0 - 60e6) pidS.set(e.pid, (pidS.get(e.pid) || 0) + 1);
  const mainOf = (pid) => [...threads].find(([k, n]) => k.startsWith(`${pid}:`) && n === 'CrRendererMain')?.[0];
  const sum = (key, toUs = firstUs) => {
    const by = new Map(); let busy = 0;
    for (const e of ev) {
      if (`${e.pid}:${e.tid}` !== key || e.ph !== 'X' || e.ts < T0 || e.ts > toUs) continue;
      const d = (e.dur || 0) / 1000;
      if (/^(ThreadControllerImpl::RunTask|RunTask)$/.test(e.name)) busy += d;
      let n = e.name;
      if (/^(v8\.compile|v8\.compileModule|EvaluateScript|v8\.produceModuleCache|v8\.produceCache|ParseHTML|v8\.evaluateModule)$/.test(n)) {
        const u = urlOf(e).replace(/^.*\/(tools\/)?/, '').replace(/^blob:.*$/, 'blob: (a layer)').replace(/\?.*$/, '');
        n = `${n} ${u}`;
        const c = e.args?.data; if (c && (c.consumedCacheSize || c.cacheRejected || c.cacheConsumeOptions)) n += c.consumedCacheSize ? ' [cache]' : c.cacheRejected ? ' [cache rejected]' : '';
      }
      const k = by.get(n) || { n: 0, ms: 0 }; k.n += 1; k.ms += d; by.set(n, k);
    }
    const top = [...by].filter(([n]) => !/^(ThreadControllerImpl::RunTask|RunTask|ThreadPool_RunTask)$/.test(n)).sort((a, b) => b[1].ms - a[1].ms).slice(0, 28).map(([n, k]) => [n, k.n, Math.round(k.ms)]);
    return { busy: Math.round(busy), top };
  };
  const out = { window: sum(mainOf(pidW)), sandbox: [] };
  for (const [pid] of pidS) { const k = mainOf(pid); if (k) { const s = sum(k); if (s.busy > 5) out.sandbox.push({ pid, ...s }); } }
  // the GPU process's main thread (contexts, programs: software GL runs there)
  const gpu = [...threads].find(([, n]) => n === 'CrGpuMain')?.[0];
  if (gpu) out.gpu = sum(gpu);
  return out;
}

// ---------- the phases of one open (ms from the press) ----------
const r1 = (v) => (Number.isFinite(v) ? Math.round(v) : null);
function phases(R) {
  const W = R.w; const P = R.page && typeof R.page === 'object' ? R.page : null;
  const off = P ? P.origin - W.t0abs : NaN; // the page's clock → ms after the press
  const at = (t) => (Number.isFinite(t) && Number.isFinite(off) ? Math.round(t + off) : null);
  const msg = (type) => R.msgs.filter((m) => m[0] === type);
  const res = (re) => P?.res?.find((x) => re.test(x.n));
  const gl = P?.gl || {};
  const ctxAfter = (P?.ctx || []).filter((c) => at(c[0]) >= -5);
  const prog = gl.getProgramParameter || null;
  const loafs = (P?.loaf || []).filter((l) => at(l.s) >= -5 && at(l.s) <= (W.first ?? Infinity) + 50);
  const layerScripts = loafs.flatMap((l) => l.scripts.filter((s) => /^blob/.test(s.src) || s.type === 'module-script').map((s) => ({ at: at(s.s), d: s.d, src: s.src })));
  return {
    case: R.case,
    labBefore: R.atPress?.lab ?? R.before?.lab, labBy: R.w.labBy, warmTaken: R.after?.labboot?.taken ?? null, warmSkipped: R.after?.labboot?.skipped ?? null, queries: R.after?.labboot?.queries, head: R.after?.intent?.head ?? null,
    groupLoad: W.lazyLab && R.before?.lab !== 'loaded' && Number.isFinite(W.lazyLab.at) ? [W.lazyLab.at - W.lazyLab.ms, W.lazyLab.at] : null,
    frameIn: r1(W.frameIn), src: r1(W.src), labReady: r1(W.labReady),
    pageNav: P && at(0) >= -50 ? at(0) : (P ? `before (${at(0)})` : null),
    pageHtml: P?.nav && at(0) >= -50 ? at(P.nav.re) : null, pageDcl: P?.nav && at(0) >= -50 ? at(P.nav.dcl) : null,
    three: res(/^three\.core\.js/) && at(0) >= -50 ? [at(res(/^three\.core\.js/).s), at(res(/^three\.core\.js/).e)] : null,
    ready: r1(msg('ready')[0]?.[1]),
    ran: msg('ran').map((m) => r1(m[1])), runGot: P?.got ? at(P.got['run-layers'] ?? P.got['swap-layers']) : null, refsGot: P?.got ? at(P.got.refs ?? P.got['refs-set'] ?? null) : null, got: P?.got ? Object.fromEntries(Object.entries(P.got).map(([k, v]) => [k, at(v)])) : null,
    ctx: ctxAfter.map((c) => [at(c[0]), c[1]]),
    ctxMs: Math.round(ctxAfter.reduce((a, c) => a + c[1], 0)),
    linkWaitMs: prog ? Math.round(prog.ms) : null, linkN: prog?.n ?? null, linkSpan: prog && at(prog.first) >= -5 ? [at(prog.first), at(prog.last)] : null,
    texMs: Math.round((gl.texImage2D?.ms || 0) + (gl.texSubImage2D?.ms || 0) + (gl.texStorage2D?.ms || 0)),
    drawn: msg('drawn').map((m) => r1(m[1])),
    first: r1(W.first), stackDrawn: r1(msg('stack-drawn')[0]?.[1]), cpu: W.cpu,
    longFrames: loafs.map((l) => [at(l.s), l.d]),
    layerScripts,
    wg: P?.wg ? { held: P.wg.held, maxHoldMs: P.wg.maxHoldMs, gaps: P.wg.gaps, programs: P.wg.programs } : null,
  };
}

const all = [];
for (let run = 1; run <= RUNS; run += 1) {
  const tmp = path.join(BASE, `run${run}`); fs.mkdirSync(tmp, { recursive: true });
  const t0 = Date.now();
  const r = spawnSync('node', [path.join(ROOT, 'dev', 'smoke.js'), ...(opt('--app') ? ['--app', opt('--app')] : []), '--no-lazy-wait', '--wait', '800', '--check-timeout', '400000', '--tmp', tmp, '--script', script, '--shot', path.join(tmp, 'shot.png')],
    { cwd: ROOT, encoding: 'utf8', timeout: 3600000, maxBuffer: 256 << 20, env: { ...process.env, TMPDIR: tmp, HEARTH_THREE_DIR: process.env.HEARTH_THREE_DIR || '/opt/cdn-cache/three@0.186.1/package' } });
  const text = `${r.stdout || ''}${r.stderr || ''}`;
  for (const l of text.split('\n').filter((x) => /LABOPEN112|problem|✖/.test(x))) console.log(`  [run ${run}] ${l.slice(0, 400)}`);
  console.log(`run ${run}: ${Math.round((Date.now() - t0) / 1000)} s, exit ${r.status}`);
  PLAN.forEach((c, i) => {
    let R = null; try { R = JSON.parse(fs.readFileSync(path.join(tmp, `lo112-${i}.json`), 'utf8')); } catch { console.log(`  ${c}: no result`); return; }
    const ph = phases(R); ph.run = run;
    ph.trace = traceStats(R.trace, R);
    if (!argv.includes('--keep')) fs.rmSync(R.trace, { force: true });
    all.push(ph);
  });
}
const med = (xs) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[v.length >> 1] : null; };
console.log('\n== per open ==');
for (const p of all) {
  console.log(`\n# ${p.case} (run ${p.run}) lab ${p.labBefore}, warm taken ${p.warmTaken} ${p.warmSkipped || ''}`);
  const { trace, longFrames, layerScripts, ...rest } = p;
  console.log(JSON.stringify(rest));
  console.log(`  long frames: ${JSON.stringify(longFrames)}`);
  console.log(`  layer / module scripts: ${JSON.stringify(layerScripts)}`);
  if (trace) {
    console.log(`  window main busy ${trace.window?.busy} ms: ${JSON.stringify(trace.window?.top?.slice(0, 16))}`);
    for (const s of trace.sandbox || []) console.log(`  sandbox ${s.pid} busy ${s.busy} ms: ${JSON.stringify(s.top.slice(0, 22))}`);
    if (trace.gpu) console.log(`  gpu main busy ${trace.gpu.busy} ms: ${JSON.stringify(trace.gpu.top.slice(0, 10))}`);
  }
}
console.log('\n== medians (ms from the press) ==');
for (const c of PLAN) {
  const ps = all.filter((p) => p.case === c);
  if (!ps.length) continue;
  const m = (f) => med(ps.map(f));
  console.log(`${c.padEnd(10)} n=${ps.length} group ${m((p) => p.groupLoad?.[1])} · frame in ${m((p) => p.frameIn)} · reads ${m((p) => p.labReady)} · page html ${m((p) => p.pageHtml)} · ready ${m((p) => p.ready)} · last ran ${m((p) => p.ran.at(-1))} · ctx ${m((p) => p.ctxMs)} ms · link wait ${m((p) => p.linkWaitMs)} ms · first ${m((p) => p.first)} · stack ${m((p) => p.stackDrawn)} · window CPU ${m((p) => p.cpu)} · window busy ${m((p) => p.trace?.window?.busy)} · page busy ${m((p) => p.trace?.sandbox?.reduce((a, s) => a + s.busy, 0))}`);
}
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(all, null, 1));
if (!argv.includes('--keep')) fs.rmSync(BASE, { recursive: true, force: true }); else console.log(`kept: ${BASE}`);
