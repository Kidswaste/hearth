// driver: node
// (round 64, twocopies64) Two Hearth folders on one computer sharing ONE Electron profile, end to end with the real app
// (the owner's incident: %USERPROFILE%\agent-hub with their chats, %USERPROFILE%\Hearth unzipped next to it, both
// called "agent-hub" so Electron gave them one profile). This check starts the app itself (not through dev/smoke.js):
// two throwaway copies under a throwaway home folder, the same --user-data-dir for both, one Xvfb, fake engines.
//   1. the real copy (3 chats) starts: it keeps the usual profile and notes it (hearth-copy.json)
//   2. the empty copy as it was BEFORE this round (HEARTH_TWOCOPIES=0): it shares the profile (it reads the real copy's
//      entries) and leaves its own there (its open chat, a Lab scene id, a typed queue for a chat the real one hasn't)
//   3. the real copy again: all 3 chats listed and on disk byte-identical, its own entry still there, no page errors
//      (the other copy's entries don't hide or change its chats)
//   4. the empty copy now: the card comes BEFORE any main window ("You already have Hearth with 3 chats in …"), it runs on
//      its own profile; "Bring its chats here" copies the 3 chats (Recover's code) and the real copy's folder is
//      byte-identical afterwards; the window shows them; nothing of the real copy's profile entries
//   5. emptied again: "Open that one" starts the real copy (with the same profile) and this one quits
//   6. emptied again: "Start fresh here" opens an empty window and is remembered (no card at the next start)
//   node dev/checks/twocopies64.js [--out <folder>]   (sh dev/run-checks.sh twocopies64)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const ELECTRON = process.env.ELECTRON || '/opt/hearth-electron/electron';
const argv = process.argv.slice(2);
const OUT = path.resolve(argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-twocopies64-')));
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
const HOME = path.join(OUT, 'home');
const PROFILE = path.join(OUT, 'profile', 'agent-hub'); // %APPDATA%\agent-hub
const REAL = path.join(HOME, 'agent-hub');
const EMPTY = path.join(HOME, 'Hearth');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const steps = []; const problems = [];
const step = (cond, what) => { steps.push(`${cond ? '✓' : '✖'} ${what}`); if (!cond) problems.push(what); console.log(`${cond ? '✓' : '✖'} ${what}`); };

// ---------- two copies of the app (like the real folders: package "agent-hub", no dev/, no data/) ----------
function copyApp(dir) {
  const skip = new Set(['.git', 'data', 'electron', 'electron-mac', 'node_modules', 'dev', '.claude', 'test-saves']);
  fs.mkdirSync(dir, { recursive: true });
  for (const n of fs.readdirSync(ROOT)) if (!skip.has(n) && !/\.zip$/.test(n)) fs.cpSync(path.join(ROOT, n), path.join(dir, n), { recursive: true });
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  cfg.settings = { ...(cfg.settings || {}), enginePaths: { claude: path.join(ROOT, 'dev', 'fake-claude.js'), codex: path.join(ROOT, 'dev', 'fake-codex.js') } };
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(cfg, null, 2));
}
const chatFile = (id, title, n) => ({ id, agentId: 'claude', title, createdAt: Date.now() - 864e5, updatedAt: Date.now() - 3600e3 * n, messages: [{ role: 'user', text: `Question ${n}`, at: Date.now() - 864e5 }, { role: 'assistant', text: `Answer ${n}`, at: Date.now() - 864e5 }] });
function hashTree(dir, skip = () => false) {
  const h = crypto.createHash('sha256');
  const walk = (d) => { let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) { const f = path.join(d, e.name); const rel = path.relative(dir, f); if (skip(rel)) continue; if (e.isDirectory()) walk(f); else { h.update(rel); h.update(fs.readFileSync(f)); } } };
  walk(dir); return h.digest('hex');
}
const chatsOn = (dir) => { try { return fs.readdirSync(path.join(dir, 'data', 'chats')).filter((f) => /^[\w-]+\.json$/.test(f)).sort(); } catch { return []; } };

// ---------- one Xvfb, the app, CDP ----------
let xvfb = null; let DISPLAY = '';
async function startX() {
  for (let n = 30000 + Math.floor(Math.random() * 20000), tries = 0; tries < 40; n++, tries++) { // (high numbers: xvfb-run -a leaves many stale locks in /tmp)
    if (fs.existsSync(`/tmp/.X${n}-lock`)) continue;
    let err = '';
    xvfb = spawn('Xvfb', [`:${n}`, '-screen', '0', '1400x950x24', '-nolisten', 'tcp'], { stdio: ['ignore', 'ignore', 'pipe'], detached: true });
    xvfb.stderr.on('data', (d) => { err += d; });
    await wait(1200);
    if (xvfb.exitCode == null) { DISPLAY = `:${n}`; return; }
    console.log(`Xvfb :${n} stopped: ${err.split('\n').filter((l) => !/keysym|Warning|xkbcomp|not fatal/.test(l)).join(' ').slice(0, 300)}`);
  }
  throw new Error('no free display for Xvfb');
}
const freePort = () => new Promise((r) => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => r(p)); }); });
const procs = [];
async function launch(dir, env = {}) {
  const port = await freePort();
  const args = [dir, '--no-sandbox', `--remote-debugging-port=${port}`, `--user-data-dir=${PROFILE}`, '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  const log = [];
  const child = spawn(ELECTRON, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: true, env: { ...process.env, DISPLAY, HEARTH_TWOCOPIES_HOME: HOME, HEARTH_TEST_SAVE_DIR: path.join(OUT, 'saves'), HOME, ...env } });
  child.stdout.on('data', (d) => log.push(String(d))); child.stderr.on('data', (d) => log.push(String(d)));
  const p = { child, port, log, dir };
  procs.push(p);
  return p;
}
function killApp(p) { try { process.kill(-p.child.pid, 'SIGKILL'); } catch { /* gone */ } }
// every process started from this run's own folders (a copy another one started, its helpers)
function killAllHere() {
  for (const p of procs) killApp(p);
  try { const out = execFileSync('pgrep', ['-f', HOME], { encoding: 'utf8' }); for (const pid of out.split('\n').filter(Boolean)) { try { process.kill(Number(pid), 'SIGKILL'); } catch { /* gone */ } } } catch { /* none */ }
}
async function targets(p) { try { return await (await fetch(`http://127.0.0.1:${p.port}/json/list`)).json(); } catch { return null; } }
async function pageOf(p, re, ms = 60000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const list = await targets(p);
    const pg = (list || []).find((x) => x.type === 'page' && re.test(x.url));
    if (pg) return pg;
    if (p.child.exitCode != null) return null;
    await wait(300);
  }
  return null;
}
async function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed'); return r.result?.result?.value; };
  const until = async (expr, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await ev(expr); if (v) return v; } catch { /* not yet */ } await wait(300); } return null; };
  return { ws, send, ev, until, errors, close: () => { try { ws.close(); } catch { /* fine */ } } };
}
async function quitApp(p) {
  // the way a person closes it: every window closed (the page saves its localStorage, Electron flushes the profile)
  try { const v = await (await fetch(`http://127.0.0.1:${p.port}/json/version`)).json(); const b = await cdp(v.webSocketDebuggerUrl).catch(() => null); if (b) { await Promise.race([b.send('Browser.close'), wait(4000)]); b.close(); } } catch { /* gone */ }
  const t = Date.now();
  while (p.child.exitCode == null && Date.now() - t < 15000) await wait(200);
  if (p.child.exitCode == null) killApp(p);
  await wait(500);
}
const READY = "typeof H !== 'undefined' && Array.isArray(H.chats) && performance.getEntriesByName('hearth:ready').length > 0";
const shot = async (c, name) => { try { const r = await c.send('Page.captureScreenshot', { format: 'png' }); if (r.result?.data) fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64')); } catch { /* a picture is a bonus */ } };

(async () => {
  copyApp(REAL); copyApp(EMPTY);
  fs.mkdirSync(path.join(REAL, 'data', 'chats'), { recursive: true });
  const ids = ['claude-tc1', 'claude-tc2', 'claude-tc3'];
  ids.forEach((id, i) => fs.writeFileSync(path.join(REAL, 'data', 'chats', `${id}.json`), JSON.stringify(chatFile(id, ['Paris walk plan', 'Serum patch ideas', 'Clink at 240 Hz'][i], i + 1))));
  fs.writeFileSync(path.join(REAL, 'data', 'memory.json'), JSON.stringify({ shared: 'I live in Paris' }));
  await startX();

  // 1. the real copy
  let a = await launch(REAL);
  let pg = await pageOf(a, /index\.html/);
  step(Boolean(pg), 'the real copy opens its window');
  let c = await cdp(pg.webSocketDebuggerUrl);
  await c.until(READY);
  step((await c.ev('H.chats.length')) === 3, 'the real copy lists its 3 chats');
  await c.ev("localStorage.setItem('hub.twocopiesTest', JSON.stringify('the real copy wrote this')); true");
  await c.ev(`(async () => { activate('claude'); Native.open('claude', 'claude-tc2'); return true; })()`).catch(() => null);
  await wait(800);
  c.close(); await quitApp(a);
  const marker = (() => { try { return JSON.parse(fs.readFileSync(path.join(PROFILE, 'hearth-copy.json'), 'utf8')); } catch { return null; } })();
  const realId = (() => { try { return JSON.parse(fs.readFileSync(path.join(REAL, 'data', 'hearth-origin.json'), 'utf8')).copyId; } catch { return null; } })();
  step(Boolean(marker && realId && marker.copyId === realId), 'the real copy keeps the usual profile and notes it (hearth-copy.json)');
  const realHash = hashTree(path.join(REAL, 'data', 'chats'));

  // 2. the empty copy as before this round: one profile for both
  a = await launch(EMPTY, { HEARTH_TWOCOPIES: '0' });
  pg = await pageOf(a, /index\.html/);
  c = await cdp(pg.webSocketDebuggerUrl);
  await c.until(READY);
  const shared = await c.ev("JSON.parse(localStorage.getItem('hub.twocopiesTest') || 'null')");
  step(shared === 'the real copy wrote this' && (await c.ev('H.chats.length')) === 0, 'before this round: the empty copy shows no chats and reads the real copy\'s profile entries (the incident)');
  await c.ev(`(() => {
    localStorage.setItem('hub.three.current', JSON.stringify('s-from-the-empty-copy'));
    localStorage.setItem('hub.offline.held', JSON.stringify([{ agentId: 'claude', chatId: 'claude-not-here', texts: ['typed in the empty copy'] }]));
    localStorage.setItem('hub.speed.resume', JSON.stringify({ chat: { agentId: 'claude', chatId: 'claude-not-here', title: 'Not here', t: Date.now() }, active: 'claude', t: Date.now() }));
    localStorage.setItem('hearth.view', JSON.stringify({ active: 'claude', chats: { claude: { chatId: 'claude-not-here', top: 0, atEnd: true } }, at: Date.now() }));
    return true; })()`);
  c.close(); await quitApp(a);

  // 3. the real copy again, with the other copy's entries in its profile
  a = await launch(REAL);
  pg = await pageOf(a, /index\.html/);
  c = await cdp(pg.webSocketDebuggerUrl);
  await c.until(READY);
  await wait(4000); // (the offline queue, the resume card, routines: everything that reads the profile after the first screen)
  const st3 = await c.ev(`({ n: H.chats.length, ids: H.chats.map((x) => x.id).sort(), mine: JSON.parse(localStorage.getItem('hub.twocopiesTest') || 'null'), listed: document.querySelectorAll('#chat-groups [data-id], #chat-groups .chat-item, #chat-groups li').length })`);
  step(st3.n === 3 && st3.ids.join() === ids.join(), `the real copy still lists all 3 chats with the other copy's entries in its profile (${JSON.stringify(st3.ids)})`);
  step(st3.mine === 'the real copy wrote this', 'its own profile entry is still there');
  await shot(c, 'real-after-shared');
  c.close(); await quitApp(a);
  step(hashTree(path.join(REAL, 'data', 'chats')) === realHash && chatsOn(REAL).join() === ids.map((x) => `${x}.json`).join(), 'its chat files are byte-identical (nothing hidden, nothing made from the other copy\'s entries)');

  // 4. the empty copy now: the card first, its own profile, Bring its chats here
  const realBefore = hashTree(REAL, (rel) => /^data[\\/](kv[\\/]ui-usage|safetynet|\.backup|window\.json|devreport|engine\.log|kv[\\/]\.history)/.test(rel));
  const realData0 = hashTree(path.join(REAL, 'data'));
  a = await launch(EMPTY);
  let card = await pageOf(a, /twocopies\.html/);
  step(Boolean(card), 'the empty copy shows the card');
  const early = await targets(a);
  step(!(early || []).some((x) => x.type === 'page' && /index\.html/.test(x.url)), 'no main window (nothing empty) before the owner chose');
  let k = await cdp(card.webSocketDebuggerUrl);
  const text = await k.until("document.getElementById('lead').textContent.includes('3 chats') && document.body.innerText");
  step(Boolean(text) && text.includes(REAL) && text.includes(EMPTY) && /Open that one \(recommended\)/.test(text) && /Bring its chats here/.test(text) && /Start fresh here/.test(text), 'the card: "You already have Hearth with 3 chats in …agent-hub", Open that one (recommended) · Bring its chats here · Start fresh here');
  await k.send('Page.enable'); await shot(k, 'card');
  const sideDir = fs.readdirSync(path.dirname(PROFILE)).find((n) => /^agent-hub-copy-[0-9a-f]{8}$/.test(n));
  step(Boolean(sideDir) && JSON.parse(fs.readFileSync(path.join(PROFILE, 'hearth-copy.json'), 'utf8')).copyId === realId, `the empty copy runs on its own profile (${sideDir}); the usual one stays the real copy's`);
  await k.ev("document.getElementById('bring').click(); true");
  pg = await pageOf(a, /index\.html/, 60000);
  k.close();
  step(Boolean(pg), 'after Bring its chats here, the main window opens');
  c = await cdp(pg.webSocketDebuggerUrl);
  await c.until(READY);
  await c.until('H.chats.length >= 3', 15000);
  const st4 = await c.ev(`({ n: H.chats.length, ids: H.chats.map((x) => x.id).sort(), other: localStorage.getItem('hub.twocopiesTest'), three: localStorage.getItem('hub.three.current') })`);
  step(st4.n === 3 && st4.ids.join() === ids.join(), 'the 3 chats are here now (copied)');
  step(st4.other === null && st4.three === null, 'this copy sees none of the profile entries of the real copy (or what the old empty copy left there)');
  await wait(2500); await shot(c, 'empty-after-bring');
  const toastSeen = await c.until("[...document.querySelectorAll('.toast, #toasts *')].some((t) => /wasn't changed/.test(t.textContent))", 8000);
  step(Boolean(toastSeen), 'a line says the other folder wasn\'t changed');
  c.close(); await quitApp(a);
  step(chatsOn(EMPTY).join() === ids.map((x) => `${x}.json`).join(), 'the chat files are in the new copy\'s data folder');
  step(hashTree(path.join(REAL, 'data')) === realData0 && hashTree(REAL, (rel) => /^data[\\/](kv[\\/]ui-usage|safetynet|\.backup|window\.json|devreport|engine\.log|kv[\\/]\.history)/.test(rel)) === realBefore, 'the real copy\'s folder is byte-identical afterwards (nothing moved or deleted)');
  const choice = (() => { try { return JSON.parse(fs.readFileSync(path.join(EMPTY, 'data', 'twocopies.json'), 'utf8')); } catch { return null; } })();
  step(choice?.choice === 'brought', 'remembered: no card at its next start');

  // 5. Open that one
  const reset = () => { for (const n of ['chats', 'twocopies.json', 'kv', 'memory.json']) fs.rmSync(path.join(EMPTY, 'data', n), { recursive: true, force: true }); fs.mkdirSync(path.join(EMPTY, 'data', 'chats'), { recursive: true }); };
  reset();
  const note = path.join(OUT, 'opened.json');
  a = await launch(EMPTY, { HEARTH_TWOCOPIES_NOTE: note });
  card = await pageOf(a, /twocopies\.html/);
  k = await cdp(card.webSocketDebuggerUrl);
  await k.until("document.getElementById('lead').textContent.includes('3 chats')");
  const t5 = Date.now() - 1000;
  await k.ev("document.getElementById('open').click(); true");
  k.close();
  while (a.child.exitCode == null && Date.now() - t5 < 15000) await wait(200);
  step(a.child.exitCode != null, 'Open that one: this copy quits');
  const opened = (() => { try { return JSON.parse(fs.readFileSync(note, 'utf8')); } catch { return null; } })();
  step(Boolean(opened) && opened.plan.args[0] === REAL && opened.plan.args.includes(`--user-data-dir=${PROFILE}`), 'it starts the real copy, on the usual profile');
  // the real copy notes each start in its data folder (portable.js: hearth-origin.json "at")
  const originAt = () => { try { return JSON.parse(fs.readFileSync(path.join(REAL, 'data', 'hearth-origin.json'), 'utf8')).at || 0; } catch { return 0; } };
  let started = false;
  for (let i = 0; i < 120 && !started; i++) { started = originAt() >= t5; if (!started) await wait(250); }
  step(started, 'the real copy started (its own data folder says so)');
  await wait(3000);
  try { for (const pid of execFileSync('pgrep', ['-f', REAL], { encoding: 'utf8' }).split('\n').filter(Boolean)) process.kill(Number(pid), 'SIGTERM'); } catch { /* gone */ }
  await wait(2500);
  step(hashTree(path.join(REAL, 'data', 'chats')) === realHash, 'the real copy\'s chats are as they were');

  // 6. Start fresh here
  reset();
  a = await launch(EMPTY);
  card = await pageOf(a, /twocopies\.html/);
  k = await cdp(card.webSocketDebuggerUrl);
  await k.until("document.getElementById('lead').textContent.includes('3 chats')");
  await k.ev("document.getElementById('fresh').click(); true");
  k.close();
  pg = await pageOf(a, /index\.html/);
  c = await cdp(pg.webSocketDebuggerUrl);
  await c.until(READY);
  step((await c.ev('H.chats.length')) === 0, 'Start fresh here: an empty window');
  c.close(); await quitApp(a);
  step(JSON.parse(fs.readFileSync(path.join(EMPTY, 'data', 'twocopies.json'), 'utf8')).choice === 'fresh', 'the choice is remembered');
  a = await launch(EMPTY);
  pg = await pageOf(a, /index\.html|twocopies\.html/);
  step(Boolean(pg) && /index\.html/.test(pg.url), 'its next start goes straight to its window (no card)');
  await quitApp(a);
  step(hashTree(path.join(REAL, 'data', 'chats')) === realHash, 'in the end the real copy\'s chats are byte-identical to the start');
})().catch((err) => { problems.push(`harness: ${err.stack || err.message}`); console.log(`✖ harness: ${err.stack || err.message}`); }).finally(() => {
  killAllHere();
  try { process.kill(-xvfb.pid, 'SIGKILL'); } catch { /* gone */ }
  const logs = procs.map((p, i) => `--- run ${i + 1}: ${p.dir}\n${p.log.join('')}`).join('\n');
  fs.writeFileSync(path.join(OUT, 'app.log'), logs);
  console.log(JSON.stringify({ pass: problems.length === 0, steps: steps.length, problems, out: OUT }, null, 1));
  process.exit(problems.length ? 1 : 0);
});
