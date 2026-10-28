#!/usr/bin/env node
// (round 77, synclatency77) How long "saved on the PC" takes to be "there on the Mac" (and back), end to end, in real
// time: two computers, each running the app's real sync main side (syncmain.js: its watchers on the data folder and on
// the cloud folder, its debounces, its pass scheduling) and the real engine (sync-engine.js), with a simulated cloud
// provider (dev/sync-sim.js) that takes a realistic time to notice a change, upload it and bring it down on the other
// computer (upDelay / downDelay, plus upRate / downRate for big files). Nothing real is touched: a temp folder.
// For each item (a chat message, a project's notes, a Lab scene save, a small picture, a big video) and each direction
// (PC → Mac, Mac → PC), idle or busy (a reply streaming on both computers: its chat saved 4× a second, replies counted as
// running), it times:
//   save → up      the sender's engine put it in its cloud folder (the sender's share)
//   up → down      the cloud client brought it to the other computer's cloud folder (the provider: not ours)
//   down → here    the receiver's engine wrote it into its data folder
//   down → window  the receiver's window was told (sync:pulled: chats reload at once; stores per storeack77)
//   engine share   (save → up) + (down → window): what Hearth itself adds
//   node dev/synclatency77.js [--root DIR] [--mode idle|busy|all] [--dir pc|mac|both] [--items chat,note,scene,small,big]
//                             [--profile icloud|fast] [--repeat 1] [--json] [--budget ms] [--timeout ms]
//   --root: another copy of Hearth (before / after); --budget: exit 1 when a small item's engine share after delivery
//   (down → window) is over it
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.join(__dirname, '..')));
const MODES = opt('--mode', 'all') === 'all' ? ['idle', 'busy'] : [opt('--mode')];
const DIRS = opt('--dir', 'both') === 'both' ? [['PC', 'Mac'], ['Mac', 'PC']] : opt('--dir') === 'pc' ? [['PC', 'Mac']] : [['Mac', 'PC']];
const ITEMS = opt('--items', 'chat,note,scene,small,big').split(',');
const REPEAT = Number(opt('--repeat', 1));
const TIMEOUT = Number(opt('--timeout', 150000));
const BUDGET = Number(opt('--budget', 0));
const JSON_OUT = argv.includes('--json');
const VERBOSE = argv.includes('--verbose');
const CALM = Number(opt('--calm', 5000)); // how long both computers stay calm before the next item (idle)
const IDLE_CHECK = Number(opt('--idlecheck', 0));
const ECHO_WAIT = Number(opt('--echo-wait', 1500)); // after an item: how long its echo passes are counted
const CHURN = Number(opt('--churn', 0)); // after the items: a store saved every 2 s for this long on the PC (like the usage counts), counting its passes // after the items: this long idle, counting passes (should be none)
// realistic cloud clients: iCloud / OneDrive notice a change in ~1–3 s and bring it down a few seconds later; a fast one
// (Dropbox on the same network) in under a second each way
const PROFILES = {
  icloud: { upDelay: 2000, downDelay: 3000, upRate: 20e6, downRate: 40e6, keepMtime: true },
  fast: { upDelay: 500, downDelay: 500, upRate: 60e6, downRate: 100e6, keepMtime: true },
};
const PROFILE = PROFILES[opt('--profile', 'icloud')];

const Sim = require('./sync-sim');
// Linux's recursive fs.watch (Node's own, inotify per file) loses events when a file is replaced by a rename (how every
// store saves): after the first save of a file it hears only some of the next ones. The Mac (FSEvents) and Windows
// (ReadDirectoryChangesW) hear every one. So here a recursive watch is one plain watch per folder (inotify on a folder
// hears every rename into it), like the Mac / PC would. Test only.
if (process.platform === 'linux' && !argv.includes('--node-watch')) {
  const { EventEmitter } = require('events');
  const realWatch = fs.watch;
  fs.watch = function watch(dir, o, cb) {
    if (typeof o === 'function') { cb = o; o = {}; }
    if (!o || typeof o !== 'object' || !o.recursive) return realWatch.call(fs, dir, o, cb);
    const ee = new EventEmitter(); const ws = new Map();
    const addTree = (d) => {
      if (!ws.has(d)) {
        try {
          const w = realWatch.call(fs, d, { persistent: false }, (ev, name) => {
            if (name == null) return;
            const abs = path.join(d, String(name));
            try { if (fs.statSync(abs).isDirectory()) addTree(abs); } catch { /* a file, or gone */ }
            cb(ev, path.relative(dir, abs));
          });
          w.on('error', () => { try { w.close(); } catch { /* closed */ } ws.delete(d); });
          ws.set(d, w);
        } catch { return; }
      }
      let ents = []; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { /* gone */ }
      for (const e of ents) if (e.isDirectory()) addTree(path.join(d, e.name));
    };
    addTree(path.resolve(dir));
    ee.close = () => { for (const w of ws.values()) { try { w.close(); } catch { /* closed */ } } ws.clear(); };
    return ee;
  };
}
const RUN = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-synclat77-'));
const say = (...a) => { if (!JSON_OUT) console.log(...a); };
const vlog = (...a) => { if (VERBOSE) console.log(`  [${((Date.now() - T0) / 1000).toFixed(2)}]`, ...a); };
const T0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- the cloud and its log (when a file landed in a computer's cloud folder) ----------
const landed = new Map(); // `${name}:${key}` → wall time it was written into that computer's cloud folder
const cloud = Sim.cloud({ blobDir: path.join(RUN, 'blobs'), log: (name, what, key) => { if (what === 'down') landed.set(`${name}:${key}`, Date.now()); if (what === 'up' || what === 'down') vlog('cloud', name, what, key); } });

// ---------- a computer: the app's sync main side, a fresh copy of the module for each ----------
function computer(name) {
  const base = path.join(RUN, name);
  const m = { name, busy: false, pulled: new Map(), statusAt: 0, passes: 0 };
  m.data = path.join(base, 'data'); m.cloudRoot = path.join(base, 'cloud');
  m.config = path.join(base, 'app', 'config.json'); m.theme = path.join(base, 'app', 'theme.css');
  for (const d of [m.data, path.join(m.data, 'chats'), path.join(m.data, 'kv'), path.join(m.data, 'captures'), path.join(m.data, 'sync'), path.dirname(m.config)]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(m.config, `${JSON.stringify({ agents: [{ id: 'claude', name: 'Claude' }], settings: { sync: { on: true } } }, null, 2)}\n`);
  fs.writeFileSync(m.theme, '/* theme */\n');
  fs.writeFileSync(path.join(m.data, 'sync', 'settings.json'), JSON.stringify({ on: true, root: m.cloudRoot, label: 'Sim cloud', provider: 'icloud', since: Date.now() }));
  m.view = cloud.view(m.cloudRoot, { name, ci: false, ...PROFILE });
  // a normal day: sync was set up before, the cloud drive already has Hearth's folder when the app starts (--first: not)
  if (!argv.includes('--first')) fs.mkdirSync(path.join(m.cloudRoot, 'Hearth', 'files'), { recursive: true });
  for (const k of ['syncmain.js', 'sync-engine.js']) delete require.cache[path.join(ROOT, k)];
  m.sm = require(path.join(ROOT, 'syncmain.js'));
  const handlers = {};
  const win = { isDestroyed: () => false, webContents: { send: (ch, d) => {
    if (ch === 'sync:pulled') { for (const x of d || []) m.pulled.set(x.rel, Date.now()); vlog(name, 'pulled', (d || []).map((x) => x.rel).join(' ')); }
    if (ch === 'sync:status') { if (d?.state === 'syncing') { m.passes += 1; m.statusAt = Date.now(); vlog(name, 'pass'); } else m.statusAt = Date.now(); m.state = d?.state; m.pending = d?.pending; m.waiting = d?.waiting; if (d?.state !== 'syncing' && d?.waiting?.length) vlog(name, 'waiting', JSON.stringify(d.waiting).slice(0, 300)); }
  } } };
  m.sm.register({ handle: (ch, fn) => { handlers[ch] = fn; } }, () => win, { dataDir: m.data, configPath: m.config, themePath: m.theme, store: null });
  m.sm.setBusy(() => (m.busy ? 1 : 0));
  m.p = (rel) => path.join(m.data, ...rel.split('/'));
  m.cp = (rel) => path.join(m.cloudRoot, 'Hearth', 'files', ...rel.split('/'));
  // the app's own way of saving: a temp file, then renamed over (crashsafe)
  m.write = (rel, data) => { const f = m.p(rel); fs.mkdirSync(path.dirname(f), { recursive: true }); const tmp = `${f}.${process.pid}-${crypto.randomBytes(3).toString('hex')}.tmp`; fs.writeFileSync(tmp, data); fs.renameSync(tmp, f); };
  m.json = (rel) => { try { return JSON.parse(fs.readFileSync(m.p(rel), 'utf8')); } catch { return null; } };
  return m;
}

// ---------- the items ----------
const words = (n, seed) => Array.from({ length: n }, (_, i) => `w${(i * 7919 + seed) % 9973}`).join(' ');
const chatOf = (id, n) => ({ id, agentId: 'claude', title: `Chat ${id}`, updatedAt: 1, messages: Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', at: 1700000000000 + i * 1000, text: words(40, i) })) });
const sketches = () => Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, name: `Scene ${i}`, updated: 1, layers: Array.from({ length: 6 }, (_, j) => ({ id: `s${i}-l${j}`, name: `Layer ${j}`, code: Array.from({ length: 160 }, (_, k) => `const v${k} = ${(i * 31 + j * 7 + k) % 997}; // ${words(4, k)}`).join('\n') })) }));
const ITEM = {
  chat: { rel: () => 'chats/c-main.json', seed: (m) => m.write('chats/c-main.json', JSON.stringify(chatOf('c-main', 120), null, 2)),
    save: (m, tok) => { const c = m.json('chats/c-main.json'); c.messages.push({ role: 'user', at: Date.now(), text: `message ${tok}` }); c.updatedAt = Date.now(); m.write('chats/c-main.json', JSON.stringify(c, null, 2)); } },
  note: { rel: () => 'kv/projects.json', seed: (m) => m.write('kv/projects.json', JSON.stringify({ v: 1, list: Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, name: `Project ${i}`, notes: words(60, i), items: [], created: 1, updated: 1 })), dismissed: [] }, null, 2)),
    save: (m, tok) => { const d = m.json('kv/projects.json'); d.list[0].notes += `\nnote ${tok}`; d.list[0].updated = Date.now(); m.write('kv/projects.json', JSON.stringify(d, null, 2)); } },
  scene: { rel: () => 'kv/three-sketches.json', seed: (m) => m.write('kv/three-sketches.json', JSON.stringify(sketches())),
    save: (m, tok) => { const d = m.json('kv/three-sketches.json'); d[3].layers[2].code += `\n// scene ${tok}`; d[3].updated = Date.now(); m.write('kv/three-sketches.json', JSON.stringify(d)); } },
  small: { rel: (tok) => `captures/still-${tok}.png`, seed: () => {},
    save: (m, tok) => { const b = crypto.randomBytes(180 * 1024); b.write(tok, 0); m.write(`captures/still-${tok}.png`, b); } },
  big: { rel: (tok) => `captures/take-${tok}.mp4`, seed: () => {},
    save: (m, tok) => { const b = Buffer.alloc(48 * 1024 * 1024, 1); b.write(tok, 0); crypto.randomFillSync(b, 1024, 4096); m.write(`captures/take-${tok}.mp4`, b); } },
};
const has = (file, tok, big) => {
  try {
    if (big) { const fd = fs.openSync(file, 'r'); try { const b = Buffer.alloc(64); fs.readSync(fd, b, 0, 64, 0); const st = fs.fstatSync(fd); return st.size === 48 * 1024 * 1024 && b.toString('latin1').includes(tok); } finally { fs.closeSync(fd); } }
    return fs.readFileSync(file, 'latin1').includes(tok);
  } catch { return false; }
};

// ---------- a reply streaming on a computer (busy) ----------
function stream(m) {
  const id = `c-stream-${m.name}`; const c = chatOf(id, 30); c.messages.push({ role: 'assistant', at: Date.now(), text: '' });
  let n = 0;
  const t = setInterval(() => { c.messages[c.messages.length - 1].text += ` ${words(6, n++)}`; m.write(`chats/${id}.json`, JSON.stringify(c, null, 2)); }, 250);
  m.busy = true;
  return () => { clearInterval(t); m.busy = false; };
}

// ---------- waiting for calm ----------
async function quiet(ms, ...ms2) {
  const all = ms2;
  const t = Date.now();
  while (Date.now() - t < 120000) {
    const calm = all.every((m) => m.view.idle() && Date.now() - m.statusAt > ms && m.state !== 'syncing' && (m.sm._due?.()?.due ?? null) === null); // (and no pass armed)
    if (calm) return true;
    await sleep(200);
  }
  return false;
}

async function measure(from, to, name, mode) {
  const it = ITEM[name];
  const tok = `T${crypto.randomBytes(4).toString('hex')}`;
  const rel = it.rel(tok);
  const big = name === 'big';
  const p0 = [from.passes, to.passes];
  const t0 = Date.now();
  it.save(from, tok);
  const r = { item: name, from: from.name, to: to.name, mode, rel };
  const key = `${to.name}:Hearth/files/${rel}`;
  landed.delete(key);
  while (Date.now() - t0 < TIMEOUT) {
    if (r.up == null && has(from.cp(rel), tok, big)) r.up = Date.now() - t0;
    if (r.down == null && landed.has(key) && has(to.cp(rel), tok, big)) r.down = landed.get(key) - t0;
    if (r.here == null && has(to.p(rel), tok, big)) r.here = Date.now() - t0;
    if (r.window == null && r.here != null && (to.pulled.get(rel) || 0) >= t0 + (r.down ?? 0)) r.window = to.pulled.get(rel) - t0;
    if (r.window != null) break;
    await sleep(big ? 60 : 15);
  }
  if (r.window == null) { r.timedOut = true; r.waiting = to.waiting; }
  // the passes this item cost on each side, its echoes included (an echo pass would come within a second or so)
  else { await sleep(ECHO_WAIT); r.passes = { from: from.passes - p0[0], to: to.passes - p0[1] }; }
  if (r.up != null && r.down != null && r.window != null) { r.engineDown = r.window - r.down; r.engine = r.up + r.engineDown; r.cloud = r.down - r.up; }
  return r;
}

async function main() {
  const pc = computer('PC'); const mac = computer('Mac');
  const C = { PC: pc, Mac: mac };
  const prov = setInterval(() => cloud.tick(), 100); // the providers (test only: the app has no such loop)
  for (const n of ITEMS) ITEM[n].seed(pc);
  if (!(await quiet(3000, pc, mac))) say('(start: not calm)');
  // the first sync: both computers have the seeded stores
  for (let i = 0; i < 100 && !ITEMS.filter((n) => ['chat', 'note', 'scene'].includes(n)).every((n) => fs.existsSync(mac.p(ITEM[n].rel()))); i++) await sleep(300);
  await quiet(CALM, pc, mac);
  const results = [];
  for (const mode of MODES) {
    let stops = [];
    if (mode === 'busy') { stops = [stream(pc), stream(mac)]; await sleep(3000); }
    for (const [a, b] of DIRS) {
      for (const n of ITEMS) {
        for (let k = 0; k < REPEAT; k++) {
          if (mode === 'idle') await quiet(CALM, pc, mac); else await sleep(2000);
          const r = await measure(C[a], C[b], n, mode);
          results.push(r);
          say(`${mode.padEnd(4)} ${a}→${b} ${n.padEnd(5)} up ${fmt(r.up)} · cloud ${fmt(r.cloud)} · down→here ${fmt(r.here != null && r.down != null ? r.here - r.down : null)} · down→window ${fmt(r.engineDown)} · total ${fmt(r.window)} · engine ${fmt(r.engine)}${r.timedOut ? ` TIMED OUT ${JSON.stringify(r.waiting || []).slice(0, 200)}` : ''}`);
        }
      }
    }
    for (const s of stops) s();
    if (mode === 'busy') await sleep(1000);
  }
  // a store saved every 2 s (the usage counts while you click around): passes stay few (one quick, then the calm debounce)
  let churn = null;
  if (CHURN) {
    await quiet(CALM, pc, mac);
    const ran = () => Object.entries(pc.sm._due?.()?.runs || {}).filter(([k]) => k !== 'tick').reduce((a, [, v]) => a + v, 0);
    const before = ran(); const t = Date.now(); let n = 0;
    while (Date.now() - t < CHURN) { pc.write('kv/usage-sim.json', JSON.stringify({ n: n++, pad: words(20000, n) })); await sleep(2000); }
    churn = { ms: CHURN, saves: n, passes: ran() - before };
    say(`churn: ${n} saves every 2 s → ${churn.passes} passes on the PC`);
  }
  // idle: once calm, no pass and no pass armed (only the calm check, a minute or more away)
  let idle = null;
  if (IDLE_CHECK) {
    await quiet(CALM, pc, mac);
    // (the calm check, a minute or more apart, may fall in the window: not counted)
    const ran = () => [pc, mac].reduce((n, m) => n + Object.entries(m.sm._due?.()?.runs || {}).filter(([k]) => k !== 'tick').reduce((a, [, v]) => a + v, 0), 0);
    const before = ran();
    await sleep(IDLE_CHECK);
    idle = { ms: IDLE_CHECK, passes: ran() - before, armed: [pc, mac].map((m) => { const d = m.sm._due?.() || null; if (d) delete d.runs; return d; }) };
    say(`idle ${IDLE_CHECK} ms: ${idle.passes} passes · armed ${JSON.stringify(idle.armed)}`);
  }
  clearInterval(prov);
  pc.sm.quit(); mac.sm.quit();
  const passes = { PC: pc.passes, Mac: mac.passes };
  const over = BUDGET ? results.filter((r) => r.item !== 'big' && (r.timedOut || r.engineDown > BUDGET)) : [];
  if (JSON_OUT) process.stdout.write(`${JSON.stringify({ root: ROOT, profile: opt('--profile', 'icloud'), results, passes, idle, churn, over: over.length }, null, 1)}\n`);
  else say(`passes: PC ${passes.PC}, Mac ${passes.Mac}${BUDGET ? ` · over ${BUDGET} ms: ${over.length}` : ''}`);
  if (!argv.includes('--keep')) fs.rmSync(RUN, { recursive: true, force: true });
  process.exit(over.length || results.some((r) => r.timedOut) ? 1 : 0);
}
function fmt(ms) { return ms == null ? '—' : `${(ms / 1000).toFixed(2)} s`; }
main().catch((err) => { console.error(err); process.exit(1); });
