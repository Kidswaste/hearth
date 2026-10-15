// ⏳ Usage left (round 48, usagelimits), the main-process side: Claude's plan usage read with Claude Code's own `/usage`
// command in print mode. That is a LOCAL command of Claude Code (it reads the account's usage, the same numbers its
// own /usage screen shows): no model request, no tokens. Checked on the result itself: `local_command: "usage"` and
// `num_turns: 0`; if a copy ever answered it with a model turn instead, the path switches itself off for good (the
// window keeps that in kv usage-limits) and only the numbers Claude Code reports with each reply are used.
//   usagelimits:claude  → { ok, text, at, version } | { ok: false, why: 'missing' | 'old' | 'off' | 'model' | 'failed' }
// Asked only when the Usage window opens (at most once per 5 minutes), never on a timer.
const path = require('path');
const fs = require('fs');
const os = require('os');

const MIN_VERSION = [2, 1, 301]; // the first copy where this was checked to be local (print mode, num_turns 0)
const TTL = 5 * 60e3;
let last = null; // { at, p }
const semver = (s) => (String(s || '').match(/(\d+)\.(\d+)\.(\d+)/) || []).slice(1, 4).map(Number);
const atLeast = (v, min) => { for (let i = 0; i < 3; i++) { if ((v[i] || 0) !== min[i]) return (v[i] || 0) > min[i]; } return true; };

function run(bin, args, { timeoutMs = 20000, cwd = os.tmpdir() } = {}) {
  let spawn = require('child_process').spawn;
  try { spawn = require('./winpolish').spawn; } catch { /* plain spawn */ }
  return new Promise((resolve) => {
    let out = ''; let done = false;
    let child;
    try { child = spawn(bin, args, { cwd, env: process.env, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }); } catch { resolve({ code: -1, out: '' }); return; }
    const end = (code) => { if (done) return; done = true; clearTimeout(t); resolve({ code, out }); };
    const t = setTimeout(() => { try { child.kill(); } catch { /* gone */ } end(-1); }, timeoutMs);
    child.stdout?.on('data', (d) => { out += d; if (out.length > 256 * 1024) out = out.slice(-256 * 1024); });
    child.on('error', () => end(-1));
    child.on('close', (code) => end(code));
    try { child.stdin?.end(); } catch { /* closed */ }
  });
}

function register(ipcMain, { engines, settings, dataDir }) {
  let off = false; // this session; the window remembers it for good (kv usage-limits: claudeUsage.off)
  async function read() {
    try { engines.setEnginePaths(settings().enginePaths); } catch { /* as found */ }
    const bin = engines.locate('claude');
    if (!bin) return { ok: false, why: 'missing' };
    if (off) return { ok: false, why: 'off' };
    const v = await run(bin, ['--version'], { timeoutMs: 8000, cwd: fs.existsSync(path.join(dataDir, 'workspace')) ? path.join(dataDir, 'workspace') : os.tmpdir() });
    const version = semver(v.out);
    if (v.code !== 0 || !version.length || !atLeast(version, MIN_VERSION)) return { ok: false, why: 'old', version: version.join('.') };
    const ws = path.join(dataDir, 'workspace'); // the engines' own folder (as engines.js runs them)
    const r = await run(bin, ['-p', '/usage', '--output-format', 'json', '--no-session-persistence', '--strict-mcp-config'], { cwd: fs.existsSync(ws) ? ws : os.tmpdir() });
    let res = null;
    for (const line of r.out.split('\n').reverse()) { const l = line.trim(); if (l.startsWith('{')) { try { res = JSON.parse(l); break; } catch { /* next */ } } }
    if (!res) return { ok: false, why: 'failed' };
    if (res.local_command !== 'usage' || (res.num_turns || 0) > 0) { off = true; return { ok: false, why: 'model' }; }
    if (res.is_error) return { ok: false, why: 'failed' };
    return { ok: true, text: String(res.result || '').slice(0, 4000), at: Date.now(), version: version.join('.') };
  }
  ipcMain.handle('usagelimits:claude', (_e, o = {}) => {
    if (!o.fresh && last && Date.now() - last.at < TTL) return last.p;
    const p = read().catch(() => ({ ok: false, why: 'failed' }));
    last = { at: Date.now(), p };
    return p;
  });
}

module.exports = { register, _test: { semver, atLeast, MIN_VERSION } };
