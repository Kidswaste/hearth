#!/usr/bin/env node
// (round 94, labload94) The Lab's first open after a start, measured the way the owner opens it: a real click on the
// workspace bar's Scene button (a page reload before each open: the Lab's code, warm page and timers start over;
// the main process and the disk caches stay warm, as on the owner's computer), in four cases:
//   start   right after the start (1.5 s after the first screen)
//   10s     10 s after the first screen (the calm start opens about then)
//   60s     60 s after it (the start long settled)
//   hover   the pointer on Scene 3 s after the first screen, the click HOVER ms later (default 300)
// Each open: press → the preview frame on screen ('shown'), → its first frame drawn (__labPace, as perfguard's fresh
// part), the window thread's CPU from the press to the first frame, and what was in at the press (the Lab's code, the
// warm page). The Lab counts as used lately (labboot.used, four scenes) on both sides. On a build with lab-intent.js
// the mode is forced ('lazy.lab.mode') so each start is the same: --modes calm,idle,none (default calm,idle).
//   node dev/labload94-open.js --base /tmp/ll94/base [--reps 3] [--cases start,10s,60s,hover] [--modes calm,idle] [--json out.json]
// (each side is one smoke.js run with one reload per open; ≈ 5 min a side with the defaults; take /tmp/hearth-run.lock)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.join(__dirname, '..');
const BASE = opt('--base');
const REPS = Number(opt('--reps', 3));
const CASES = opt('--cases', 'start,10s,60s,hover').split(',');
const MODES = opt('--modes', 'calm,idle').split(',').filter(Boolean);
const HOVER = Number(opt('--hover', 300));
const AT = { start: 1500, '10s': 10000, '60s': 60000, hover: 3000 };
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'll94o-'));

const SCENE = (i, hue) => `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color().setHSL(${hue}, 0.6, 0.55);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 4);
scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.5));
const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.8, 0.28, 160, 24), new THREE.MeshStandardMaterial({ color: 0x66ccff, roughness: 0.3 }));
scene.add(knot);
renderer.setAnimationLoop((now) => { knot.rotation.y = now / 2000 + ${i}; renderer.render(scene, camera); });
`;
const SETUP = (plan) => `
await new Promise((r) => { const t = setInterval(() => { if (typeof H !== 'undefined' && H.agents().length && performance.getEntriesByName('hearth:ready').length) { clearInterval(t); r(); } }, 50); });
await window.hub.kvSet('three-sketches', ${JSON.stringify([0, 1, 2, 3].map((i) => ({ id: `lo${i}`, name: `open ${i + 1}`, code: SCENE(i, 0.1 + i * 0.2), updatedAt: Date.now() - i * 1000 })))});
store.set('three.current', 'lo0');
store.set('labboot.used', Date.now());
H.config.settings = { ...H.config.settings, startOn: 'tool:home' }; await saveConfig();
localStorage.setItem('ll94m.plan', ${JSON.stringify(JSON.stringify(plan))});
localStorage.setItem('ll94m.i', '0'); localStorage.setItem('ll94m.out', '[]');
return '[LL94OPEN] setup';`;
const PART = `
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 30000, step = 10) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(8000)]);
const plan = JSON.parse(localStorage.getItem('ll94m.plan')); const i = Number(localStorage.getItem('ll94m.i')); const c = plan[i];
const out = JSON.parse(localStorage.getItem('ll94m.out'));
await until(() => typeof H !== 'undefined' && H.agents().length && performance.getEntriesByName('hearth:ready').length, 60000, 50);
const ready = performance.getEntriesByName('hearth:ready')[0].startTime;
await cdp('Performance.enable');
const thr = async () => { const m = (await cdp('Performance.getMetrics'))?.metrics || []; const v = m.find((x) => x.name === 'ThreadTime')?.value; return Number.isFinite(v) ? v * 1000 : NaN; };
const lab = () => (window.Lazy ? Lazy.state().find((g) => g.name === 'lab') : null);
// the workspace bar with its Scene button: a tool of the projects space on screen (the same on both sides)
{ const left = ready + 300 - performance.now(); if (left > 0) await wait(left); }
if (window.Lazy) await Lazy.load('board');
activate('tool:board');
await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 600 });
const btn = await until(() => [...document.querySelectorAll('[data-surface="tool:three"]')].find((b) => b.offsetParent), 10000, 50);
const r = btn.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2); const y = Math.round(r.top + r.height / 2);
{ const left = ready + c.at - performance.now(); if (left > 0) await wait(left); }
const rec = { side: c.side, mode: c.mode, case: c.case, at: Math.round(performance.now() - ready) };
let c0 = null; let t0 = null;
if (c.case === 'hover') { c0 = await thr(); t0 = performance.now(); await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await wait(c.hover); rec.hoverMs = c.hover; }
rec.labAtPress = lab()?.state || 'eager'; rec.warmAtPress = window.LabBoot?.state ? (LabBoot.state().drawn ? 'drawn' : LabBoot.state().up ? 'up' : (LabBoot.state().skipped || 'none')) : 'no lab yet';
const p0 = performance.now(); const pc0 = await thr(); if (c0 == null) { c0 = pc0; t0 = p0; }
await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
const frameOn = () => document.querySelector('.surface[data-id="tool:three"] .three-preview .three-frame')?.checkVisibility?.({ visibilityProperty: true });
const drawn = async () => (await smoke({ target: 'three-sandbox', cdp: 'Runtime.evaluate', params: { expression: 'window.__labPace?.state()?.drawn', returnByValue: true } }))?.result?.value;
let shown = null;
const ok = await until(async () => { if (shown == null && frameOn()) shown = performance.now() - p0; const n = shown != null ? await drawn().catch(() => null) : null; return n > 0; }, 60000, 15);
rec.shown = shown == null ? null : Math.round(shown); rec.drawn = ok ? Math.round(performance.now() - p0) : null;
rec.cpu = Math.round((await thr()) - pc0);
if (c.case === 'hover') { rec.fromHover = ok ? Math.round(performance.now() - t0) : null; rec.cpuFromHover = Math.round((await thr()) - c0); }
rec.labMs = lab()?.ms ?? null; rec.labLoadedAt = lab()?.at != null ? Math.round(lab().at - ready) : null; rec.intent = window.LabIntent?.state?.().intent || null;
out.push(rec);
await wait(1500);
activate(H.claudeAgent().id); await wait(500);
localStorage.setItem('ll94m.out', JSON.stringify(out)); localStorage.setItem('ll94m.i', String(i + 1));
return i + 1 >= plan.length ? '[LL94OPEN]' + JSON.stringify(out) : '[LL94OPEN] ' + JSON.stringify(rec);`;

function side(name, app, mode) {
  const plan = [];
  for (let r = 0; r < REPS; r += 1) for (const k of CASES) plan.push({ side: name, mode, case: k, at: AT[k], hover: HOVER });
  const pre = mode ? `localStorage.setItem('lazy.lab.mode', '${mode}');\n` : '';
  const body = [pre + SETUP(plan), ...plan.map(() => PART)].join('\n//@@ reload\n');
  const script = path.join(TMP, `${name}-${mode || 'base'}.js`);
  fs.writeFileSync(script, body);
  const args = [path.join(ROOT, 'dev', 'smoke.js'), '--no-lazy-wait', '--wait', '300', '--check-timeout', '900000', '--script', script, ...(app ? ['--app', app] : [])];
  let text = '';
  try { text = execFileSync(process.execPath, args, { encoding: 'utf8', maxBuffer: 64 << 20, env: { ...process.env, TMPDIR: TMP } }); } catch (err) { text = String(err.stdout || ''); }
  const m = text.match(/\[LL94OPEN\](\[[\s\S]*?\])\n/);
  if (!m) { console.error(text.slice(-2500)); return []; }
  return JSON.parse(m[1]);
}
const med = (a) => { const v = a.filter(Number.isFinite).sort((p, q) => p - q); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const all = [];
if (BASE) all.push(...side('base', BASE, null));
for (const mode of MODES) all.push(...side('new', null, mode));
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(all, null, 1));
const rows = [];
for (const k of CASES) {
  for (const s of [...(BASE ? [['base', null]] : []), ...MODES.map((m) => ['new', m])]) {
    const xs = all.filter((r) => r.case === k && r.side === s[0] && r.mode === s[1]);
    if (!xs.length) continue;
    rows.push({ case: k, side: s[1] ? `new (${s[1]})` : 'base', n: xs.length, shown: med(xs.map((r) => r.shown)), drawn: med(xs.map((r) => r.drawn)), cpu: med(xs.map((r) => r.cpu)), ...(k === 'hover' ? { fromHover: med(xs.map((r) => r.fromHover)) } : {}), labAtPress: [...new Set(xs.map((r) => r.labAtPress))].join('/'), warm: [...new Set(xs.map((r) => r.warmAtPress))].join('/') });
  }
}
console.table(rows);
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* fine */ }
