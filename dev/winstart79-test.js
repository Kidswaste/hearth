#!/usr/bin/env node
// (round 79, winstart79) Engine discovery and the first ▶ Play, without blocking the main thread (no Windows PC here:
// the Windows scan runs over a fake disk with path.win32, like winpolish-test):
//   scanAsync   the same copies, in the same order, as the synchronous scan (Windows owner-like PATH, nvm-windows,
//               scoop, winget, the desktop apps), with every question asked asynchronously, and how many it asks
//   find        a real temp HOME / PATH: the first check looks everywhere; the next ones only check the kept copies and
//               the folders' dates (no synchronous fs call at all); a new copy in a folder, a kept copy gone, PATH
//               changed or fresh (/doctor, after an install) → looks everywhere again
//   buildScene  ▶ Play's Lab page built with no synchronous fs call after the first page; three.js kept between builds
//               of the same version (not written again); warm() makes the session-free parts ahead
//   node dev/winstart79-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const W = path.win32;
let pass = 0; let fail = 0;
const ok = (c, name, info) => { if (c) { pass += 1; console.log(`✓ ${name}`); } else { fail += 1; console.log(`✖ ${name}${info === undefined ? '' : ` ${JSON.stringify(info).slice(0, 400)}`}`); } };

// ---------- a fake Windows disk, sync facade (winpolish's) + async fs.promises look-alike, both counted ----------
function fakeDisk(files) {
  const map = new Map(Object.entries(files).map(([k, v]) => [W.normalize(k).toLowerCase(), { name: W.normalize(k), text: v.text ?? v, mtime: v.mtime || 1 }]));
  const dirs = new Set();
  for (const { name } of map.values()) { let d = W.dirname(name); while (d && !dirs.has(d.toLowerCase())) { dirs.add(d.toLowerCase()); const up = W.dirname(d); if (up === d) break; d = up; } }
  const k = (p) => W.normalize(String(p)).toLowerCase().replace(/\\+$/, '');
  const kids = (p) => { const d = k(p); const out = new Set(); for (const { name } of map.values()) { const n = name.toLowerCase(); if (n.startsWith(`${d}\\`)) out.add(name.slice(d.length + 1).split('\\')[0]); } return [...out]; };
  const n = { sync: 0, async: 0 };
  const sync = {
    isFile: (p) => { n.sync += 1; return map.has(k(p)); }, isDir: (p) => { n.sync += 1; return dirs.has(k(p)); },
    list: (p) => { n.sync += 1; return kids(p); }, read: (p) => { n.sync += 1; return map.get(k(p))?.text || ''; },
    mtime: (p) => { n.sync += 1; return map.get(k(p))?.mtime || 0; }, real: (p) => p,
  };
  const enoent = () => Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  const afs = {
    stat: async (p) => { n.async += 1; const f = map.get(k(p)); if (f) return { isFile: () => true, isDirectory: () => false, mtimeMs: f.mtime, size: f.text.length }; if (dirs.has(k(p))) return { isFile: () => false, isDirectory: () => true, mtimeMs: 5, size: 0 }; throw enoent(); },
    readdir: async (p, o) => { n.async += 1; if (!dirs.has(k(p))) throw enoent(); const names = kids(p); return o?.withFileTypes ? names.map((x) => ({ name: x, isDirectory: () => dirs.has(k(W.join(p, x))), isFile: () => map.has(k(W.join(p, x))) })) : names; },
    realpath: async (p) => { n.async += 1; return p; },
    open: async (p) => { n.async += 1; const f = map.get(k(p)); if (!f) throw enoent(); const b = Buffer.from(f.text); return { read: async (buf, off, len) => { const c = b.copy(buf, off, 0, len); return { bytesRead: c }; }, close: async () => {} }; },
  };
  return { sync, afs, n };
}

(async () => {
  // ---------- scanAsync: the Windows scan, same answers, all asynchronous ----------
  const Wp = require('../winpolish');
  const I = require('../installs');
  const HOME = 'C:\\Users\\Quentin';
  const L = `${HOME}\\AppData\\Local`; const R = `${HOME}\\AppData\\Roaming`;
  // an owner-like PATH: ≈ 30 folders (Windows, Git, Python, VS Code, Node, npm, the GPU tools…)
  const pathDirs = ['C:\\Windows\\system32', 'C:\\Windows', 'C:\\Windows\\System32\\Wbem', 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0', 'C:\\Windows\\System32\\OpenSSH',
    'C:\\Program Files\\NVIDIA Corporation\\NVIDIA app\\NvDLISR', 'C:\\Program Files (x86)\\NVIDIA Corporation\\PhysX\\Common', 'C:\\Program Files\\Git\\cmd', 'C:\\Program Files\\nodejs', 'C:\\Program Files\\dotnet',
    'C:\\Program Files\\Docker\\Docker\\resources\\bin', 'C:\\ProgramData\\chocolatey\\bin', `${L}\\Programs\\Python\\Python312\\Scripts`, `${L}\\Programs\\Python\\Python312`, `${L}\\Microsoft\\WindowsApps`,
    `${L}\\Programs\\Microsoft VS Code\\bin`, `${R}\\npm`, `${L}\\GitHubDesktop\\bin`, `${HOME}\\.dotnet\\tools`, `${L}\\Programs\\Ollama`, 'C:\\Program Files\\CMake\\bin', 'C:\\ffmpeg\\bin', `${HOME}\\.cargo\\bin`, 'C:\\Program Files\\Blender Foundation\\Blender 4.2'];
  const ENV = { APPDATA: R, LOCALAPPDATA: L, USERPROFILE: HOME, ProgramFiles: 'C:\\Program Files', ProgramData: 'C:\\ProgramData', PATH: pathDirs.join(';'), NVM_HOME: `${R}\\nvm` };
  const files = {
    [`${R}\\npm\\claude.cmd`]: '@"%~dp0\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*', [`${R}\\npm\\codex.cmd`]: 'x',
    [`${R}\\npm\\node_modules\\@openai\\codex\\vendor\\x86_64-pc-windows-msvc\\codex\\codex.exe`]: 'MZ',
    [`${R}\\nvm\\v20.11.0\\node.exe`]: 'MZ', [`${R}\\nvm\\v22.12.0\\node.exe`]: 'MZ',
    [`${R}\\Claude\\claude-code\\2.1.300\\claude.exe`]: { text: 'MZ', mtime: 10 }, [`${R}\\Claude\\claude-code\\2.1.320\\claude.exe`]: { text: 'MZ', mtime: 20 },
    [`${L}\\OpenAI\\Codex\\bin\\abc\\codex.exe`]: 'MZ', [`${HOME}\\.npmrc`]: 'registry=https://registry.npmjs.org/\n',
    [`${HOME}\\.local\\bin\\claude.exe`]: 'MZ', 'C:\\Windows\\system32\\cmd.exe': 'MZ',
  };
  for (const engine of ['claude', 'codex']) {
    const d = fakeDisk(files);
    const before = Wp.candidates(engine, { env: ENV, home: HOME, fs: d.sync });
    const { result } = await I.scanAsync((F) => Wp.candidates(engine, { env: ENV, home: HOME, fs: F }), { afs: d.afs });
    ok(JSON.stringify(result) === JSON.stringify(before) && before.length >= 2, `Windows ${engine}: the asynchronous scan finds the same copies in the same order (${before.length})`, { before, result });
    ok(d.n.sync >= 100, `Windows ${engine}: the synchronous scan asked ${d.n.sync} file questions on the main thread (the ≈ 250 per check of winperf78, both engines)`, d.n);
    ok(d.n.async > 0, `Windows ${engine}: the asynchronous one asked ${d.n.async}, none of them on the main thread`, d.n);
  }

  // ---------- find(): kept copies + folder dates, on a real disk (Linux temp HOME / PATH) ----------
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'winstart79-'));
  const bin1 = path.join(tmp, 'bin1'); const bin2 = path.join(tmp, 'bin2');
  for (const d of [bin1, bin2]) fs.mkdirSync(d);
  const mk = (dir, name) => { const f = path.join(dir, name); fs.writeFileSync(f, '#!/bin/sh\necho 1.0.0\n', { mode: 0o755 }); return f; };
  const c1 = mk(bin1, 'claude');
  // installs.js reads DATA_DIR from store.js: copies in a temp folder (like robust-engine-test), HOME / PATH ours
  const app = path.join(tmp, 'app'); fs.mkdirSync(app);
  for (const f of ['installs.js', 'store.js', 'winpolish.js', 'macpolish.js', 'scenesafe-core.js', 'datasafe-core.js']) try { fs.copyFileSync(path.join(__dirname, '..', f), path.join(app, f)); } catch { /* optional */ }
  const PATH0 = process.env.PATH; const HOME0 = process.env.HOME;
  process.env.HOME = path.join(tmp, 'home'); fs.mkdirSync(process.env.HOME);
  process.env.PATH = [bin1, bin2].join(path.delimiter);
  delete process.env.HEARTH_TEST_SAVE_DIR;
  const J = require(path.join(app, 'installs.js'));
  // every synchronous fs call made while find() runs is counted (there must be none on a kept answer)
  const counted = ['statSync', 'existsSync', 'readdirSync', 'realpathSync', 'readFileSync', 'openSync', 'lstatSync', 'accessSync'];
  let syncCalls = 0; const orig = {};
  for (const m of counted) { orig[m] = fs[m]; fs[m] = function (...a) { syncCalls += 1; return orig[m].apply(this, a); }; }
  const run = async (o) => { syncCalls = 0; const r = await J.find('claude', o); return { r, sync: syncCalls, state: { ...J.scanState } }; };
  let x = await run();
  ok(x.r.length === 1 && x.r[0] === c1 && x.state.scans === 1 && x.state.last === 'first', 'first check: looks everywhere (asynchronously) and finds the copy', x);
  // (the very first one also writes data/engine-installs.json: persist())
  x = await run();
  ok(x.r[0] === c1 && x.state.hits === 1 && x.sync === 0, `next check: the kept copy + ${x.state.lastCalls} folder dates, asynchronously, 0 synchronous fs calls`, x);
  await new Promise((r) => setTimeout(r, 20));
  const c2 = mk(bin2, 'claude');
  x = await run();
  ok(x.state.scans === 2 && x.state.last === 'changed' && x.r.includes(c2) && x.r[0] === c1, 'a new copy in a folder looked into (its date changed): looks again and finds it', x);
  fs.rmSync(c1);
  x = await run();
  ok(x.state.scans === 3 && x.r.length === 1 && x.r[0] === c2, 'a kept copy gone (uninstalled / moved): looks again', x);
  x = await run();
  ok(x.state.hits === 2 && x.sync === 0, 'then kept again', x);
  x = await run({ fresh: true });
  ok(x.state.scans === 4 && x.state.last === 'look again', 'fresh (/doctor, after an install / update / sign-in window, after a wake): looks everywhere again', x);
  process.env.PATH = bin2;
  x = await run();
  ok(x.state.scans === 5, 'PATH changed: looks again', x);
  const kept = JSON.parse(orig.readFileSync(path.join(app, 'data', 'engine-installs.json'), 'utf8')).found?.claude;
  ok(kept && kept.paths[0] === c2 && kept.folders && Object.keys(kept.folders).length >= 2 && kept.key, 'kept in data/engine-installs.json: the copies, the folders\' dates, the computer + PATH key', kept && { ...kept, folders: Object.keys(kept.folders).length });
  for (const m of counted) fs[m] = orig[m];
  process.env.PATH = PATH0; process.env.HOME = HOME0;

  // ---------- ▶ Play's Lab page: asynchronous build, three.js kept ----------
  const THREE = process.env.HEARTH_THREE_DIR || '/opt/cdn-cache/three@0.186.1/package';
  if (!fs.existsSync(path.join(THREE, 'build', 'three.module.js'))) console.log('  (▶ Play part skipped: no local three.js; HEARTH_THREE_DIR)');
  else {
    process.env.HEARTH_THREE_DIR = THREE;
    const M = require('../gamemodemain');
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'winstart79-game-'));
    require('../deploymain')._test.setDataDir(dataDir);
    M._test.setCtx({ dataDir, getWin: () => null });
    const code = (n) => `import * as THREE from 'three';\nconst s = new THREE.Scene(); // ${n}\n`;
    const spec = (n) => ({ id: 'w79', name: 'w79', version: '0.186.1', layers: [{ id: 'l0', code: code(n) }], refs: [], plan: { merge: [] } });
    await M._test.labPageOnce(); // (made once per version of the player: warm() does it ahead)
    const sync = { n: 0, top: {} };
    for (const m of counted.concat(['writeFileSync', 'copyFileSync', 'mkdirSync', 'rmSync'])) { orig[m] = orig[m] || fs[m]; const o = orig[m]; fs[m] = function (...a) { sync.n += 1; sync.top[m] = (sync.top[m] || 0) + 1; return o.apply(this, a); }; }
    const b1 = await M._test.buildScene(spec(1));
    const syncFirst = sync.n; const topFirst = { ...sync.top };
    const t1 = fs.statSync.call(fs, path.join(b1.dir, 'three', 'build', 'three.module.js')).mtimeMs;
    await new Promise((r) => setTimeout(r, 30));
    sync.n = 0;
    const b2 = await M._test.buildScene(spec(2));
    const syncSecond = sync.n;
    for (const m of Object.keys(orig)) fs[m] = orig[m];
    const t2 = fs.statSync(path.join(b2.dir, 'three', 'build', 'three.module.js')).mtimeMs;
    ok(!b1.cached && syncFirst <= 6, `a new scene's ▶ Play page: ${syncFirst} synchronous fs calls (where three.js is: a few package.json reads, kept 5 min; three.js read + written asynchronously)`, topFirst);
    ok(!b2.cached && syncSecond <= 3 && t1 === t2, 'the scene changed, same three.js: the page made again, three.js left in place (not written again)', { syncSecond, t1, t2 });
    ok(fs.readFileSync(path.join(b2.dir, 'play.html'), 'utf8').includes('// 2') && fs.existsSync(path.join(b2.dir, 'three', 'build', 'three.core.js')), 'the new page has the new code and the whole three.js');
    const b3 = await M._test.buildScene(spec(2));
    ok(b3.cached, 'the same scene again: the build is reused');
    const w = await M.warm().catch((err) => ({ error: err.message }));
    ok(w && w.steps && w.steps[0] === 'modules' && w.steps.includes('page') && w.steps.some((s) => /^session/.test(s)), 'warm(): modules, the session (outside Electron it says why), the page, the preloads, step by step', w);
  }
  console.log(`\n${pass} passed${fail ? `, ${fail} failed` : ''}`);
  if (fail) process.exitCode = 1;
})().catch((err) => { console.error(err); process.exitCode = 1; });
