#!/usr/bin/env node
// (round 91, longrun91) The long-session driver: a working day squeezed into ~12 minutes, run as the app check
// dev/checks/longrun91.js (what one cycle does and what each sample records is written there) on a throwaway copy of the
// bigchat84 fixture (made up, never real data), then a table of what grew, and with --snap what the heap gained by
// constructor between the end of the warm-up and the end (window and main process), and who holds a constructor's
// newest objects (--who Name,…: the shortest strong path from a GC root in the last snapshot).
//   node dev/longrun91.js                          # 24 cycles, a sample every 3 (≈ 12 min)
//   node dev/longrun91.js --cycles 9 --every 1     # a short run
//   node dev/longrun91.js --snap /tmp/lr91/snap --who Detached,ChatView
//   node dev/longrun91.js --diff <snapdir> [--who …]   # only the snapshot part, on snapshots kept from an earlier run
//   --report: never fails (the numbers only) · --data <dir> (default /tmp/hearth-bigchat84, made when missing)
// Runs one Electron (dev/smoke.js); use a short TMPDIR (a long socket path breaks Electron), e.g. TMPDIR=/tmp/lr91.
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };

// ---------- heap snapshots: by constructor, and who holds what ----------
function load(file) {
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  const m = snap.snapshot.meta;
  return { snap, NF: m.node_fields.length, EF: m.edge_fields.length, nT: m.node_types[0], eT: m.edge_types[0], fT: m.node_fields.indexOf('type'), fN: m.node_fields.indexOf('name'), fS: m.node_fields.indexOf('self_size'), fE: m.node_fields.indexOf('edge_count'), fId: m.node_fields.indexOf('id') };
}
function summary(h) {
  const { snap, NF, nT, fT, fN, fS } = h; const N = snap.nodes; const S = snap.strings; const out = {};
  for (let i = 0; i < N.length; i += NF) {
    const t = nT[N[i + fT]]; if (t === 'hidden' || t === 'synthetic') continue;
    const k = t === 'object' || t === 'native' ? String(S[N[i + fN]]).slice(0, 70) : `(${t})`;
    const o = out[k] ||= [0, 0]; o[0] += 1; o[1] += N[i + fS];
  }
  return out;
}
function diff(a, b, top = 18) {
  return Object.keys(b).map((k) => [k, b[k][0] - (a[k]?.[0] || 0), b[k][1] - (a[k]?.[1] || 0)]).filter(([, n, sz]) => n > 0 && sz > 1024).sort((x, y) => y[2] - x[2]).slice(0, top).map(([k, n, sz]) => `  +${n} ${k} (+${Math.round(sz / 1024)} KB)`).join('\n');
}
// the shortest strong path from a root to up to `max` objects whose name starts with `want` (the newest ids first)
function who(h, want, max = 4) {
  const { snap, NF, EF, nT, eT, fT, fN, fE, fId } = h; const N = snap.nodes; const E = snap.edges; const S = snap.strings;
  const count = N.length / NF; const first = new Uint32Array(count + 1);
  for (let i = 0, e = 0; i < count; i++) { first[i] = e; e += N[i * NF + fE] * EF; } first[count] = E.length;
  const rev = Array.from({ length: count }, () => []);
  for (let i = 0; i < count; i++) for (let e = first[i]; e < first[i + 1]; e += EF) { const t = eT[E[e]]; if (t === 'weak' || t === 'shortcut') continue; rev[E[e + 2] / NF].push(i, e); }
  const name = (i) => String(S[N[i * NF + fN]]); const type = (i) => nT[N[i * NF + fT]];
  const edgeName = (e) => { const t = eT[E[e]]; return t === 'element' || t === 'hidden' ? `[${E[e + 1]}]` : String(S[E[e + 1]]).slice(0, 40); };
  const hits = []; for (let i = 0; i < count; i++) if (name(i).startsWith(want) && type(i) !== 'string') hits.push(i);
  hits.sort((a, b) => N[b * NF + fId] - N[a * NF + fId]);
  const out = [];
  for (const i of hits.slice(0, max)) {
    const prev = new Map([[i, null]]); const q = [i]; let root = null;
    while (q.length && root == null) {
      const x = q.shift();
      if (/^\(GC roots\)|^\(Global handles\)|^Window \/|^system \/ NativeContext/.test(name(x)) || (type(x) === 'synthetic' && x !== i)) { root = x; break; }
      const r = rev[x]; for (let k = 0; k < r.length; k += 2) if (!prev.has(r[k])) { prev.set(r[k], [x, r[k + 1]]); q.push(r[k]); }
    }
    const steps = []; let x = root;
    while (x != null && prev.get(x)) { const [to, e] = prev.get(x); steps.push(`${type(x) === 'closure' ? 'ƒ ' : ''}${name(x).slice(0, 50)} .${edgeName(e)}`); x = to; }
    out.push(`  ${name(i).slice(0, 60)}: ${steps.join(' → ') || '(no strong path)'}`);
  }
  return out.join('\n') || `  (no ${want} objects)`;
}
function snapReport(dir, whoList) {
  for (const k of ['win', 'main']) {
    const a = path.join(dir, `${k}-a.heapsnapshot`); const b = path.join(dir, `${k}-b.heapsnapshot`);
    if (!fs.existsSync(a) || !fs.existsSync(b)) { console.log(`${k}: no snapshots in ${dir}`); continue; }
    const hb = load(b);
    console.log(`\n${k === 'win' ? 'window' : 'main process'}: what the heap gained after the warm-up, by constructor\n${diff(summary(load(a)), summary(hb))}`);
    for (const w of whoList) console.log(`\n${k}: who holds the newest "${w}"\n${who(hb, w)}`);
  }
}

const whoList = String(opt('--who', '') || '').split(',').filter(Boolean);
if (args.includes('--diff')) { snapReport(opt('--diff'), whoList); process.exit(0); }

// ---------- the run ----------
const ROOT = path.join(__dirname, '..');
const DATA = opt('--data', '/tmp/hearth-bigchat84');
if (!fs.existsSync(path.join(DATA, 'chats', 'claude-giant0.json'))) { console.log(`making the fixture in ${DATA} …`); spawnSync('node', [path.join(__dirname, 'bigchat84-fixture.js'), DATA], { stdio: 'inherit' }); }
const snap = opt('--snap');
if (snap) fs.mkdirSync(snap, { recursive: true });
const ev = [['LR91_CYCLES', opt('--cycles')], ['LR91_EVERY', opt('--every')], ['LR91_WARM', opt('--warm')], ['LR91_IDLE_MS', opt('--idle-ms')]].filter(([, v]) => v != null).map(([k, v]) => `window.${k}=${Number(v)};`).join('')
  + (snap ? `window.LR91_SNAP=${JSON.stringify(path.resolve(snap))};` : '') + (args.includes('--report') ? 'window.LR91_REPORT=1;' : '');
const a = [path.join(__dirname, 'smoke.js'), '--fake-engines', '--data', DATA, '--wait', '1000', '--check-timeout', '2400000', ...(ev ? ['--eval', ev] : []), '--script', path.join(__dirname, 'checks', 'longrun91.js'), '--shot', path.join(require('os').tmpdir(), 'longrun91.png')];
const r = spawnSync('node', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, HEARTH_THREE_DIR: process.env.HEARTH_THREE_DIR || '/opt/cdn-cache/three@0.186.1/package' } });
const text = `${r.stdout || ''}${r.stderr || ''}`;
const j = text.lastIndexOf('\n{\n'); let res = null;
try { res = JSON.parse(text.slice(j + 1, text.indexOf('\n}\n', j) + 2)); } catch { /* printed below */ }
if (!res) { console.log(text.slice(-4000)); process.exit(1); }
console.log(`${res.cycles} cycles in ${res.minutes} min · per part (ms): ${JSON.stringify(res.msPerPart)}`);
console.log(`\ngrowth per cycle after the warm-up (post-GC):\n  ${res.trend.join('\n  ')}`);
console.log(`\nidle CPU (% of one CPU, 10 s quiet after each sample): ${(res.idle || []).join(' · ')}`);
console.log(`\nwhere: ${JSON.stringify(res.where, null, 1)}`);
if (res.partErrors?.length) console.log(`\nparts that failed now and then: ${res.partErrors.join(' | ')}`);
if (res.problems?.length) console.log(`\nproblems: ${res.problems.join(' | ')}`);
console.log(`\nseries: ${res.file}`);
if (snap) snapReport(snap, whoList);
console.log(res.pass || args.includes('--report') ? '\nPASS' : `\nFAIL ${(res.fails || []).join('; ')}`);
process.exit(res.pass || args.includes('--report') ? 0 : 1);
