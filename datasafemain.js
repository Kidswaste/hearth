// 🛟 Data safety, main side (round 43, datasafe): config.json read and saved carefully, what couldn't be read (the calm
// card in datasafe.js), and Recover… (chats, memory, settings and tool data from every copy still around). Required from
// main.js (config reads happen before the window exists).
//   config(o)            { read(), save(config), doubt(), recheck() } for main.js: a held config.json is read again a few
//                        times, then the last good one (this run) or the newest automatic copy (data/.history/config/) is
//                        used and the file is never saved over until it reads again (the window's changes are then put
//                        on top of what's on disk: a three-way merge); a save can't drop every agent / the settings
//   IPC data:health                  → { doubts, held, chats, config }   what couldn't be read in this window's session
//       data:recheck                 → { ok, still }                      read them again (the card's Retry)
//       data:scan { quick? }         → { chats, memory, settings, kv, sources, ms }  everything Recover can bring back
//       data:recover { picks }       → { chats, memory, agents, settings, kv }        brought back by merging (never deletes)
//   events → 'data:doubt'                                                  a new doubt or a save held for a moment
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const DS = require('./datasafe-core');
const SS = require('./scenesafe-core');

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- config.json ----------
function config({ configPath, dataDir, onRecovered = () => {}, onDoubt = () => {} }) {
  const dfs = DS.faults(fs, dataDir);
  const env = { fs: dfs, path, cache: new Map(), historyDir: (_f, name) => path.join(dataDir, '.history', name) };
  let cache = null; // { key, text } of the file as last read (round 16: one stat per message instead of a read)
  let good = null; // the last text that parsed, this run
  let doubt = null; // { why, code, from: 'memory' | 'copy', at, base } while the file can't be read
  let watchT = null; let heldSave = null; let heldT = null;
  const keyOf = () => { try { const st = fs.statSync(configPath); return `${st.size}:${st.mtimeMs}`; } catch { return null; } };
  function newestCopy() {
    for (const c of DS.copiesOf(fs, path, path.join(dataDir, '.history', 'config'))) {
      try { const v = JSON.parse(fs.readFileSync(c.file, 'utf8')); if (isObj(v) && Array.isArray(v.agents)) return { text: JSON.stringify(v), at: c.at }; } catch { /* next */ }
    }
    return null;
  }
  // tried again every 2 s (a minute), then every 15 s, until it reads: the window is told (config:changed)
  function watch() {
    if (watchT) return;
    let n = 0;
    const tick = () => {
      watchT = null;
      if (!doubt) return;
      try { const t = DS.readRetry(dfs, configPath, { tries: 2 }); JSON.parse(t); cache = null; doubt = null; onRecovered(); return; } catch { /* still */ }
      n += 1; watchT = setTimeout(tick, n < 30 ? 2000 : 15000); watchT.unref?.();
    };
    watchT = setTimeout(tick, 2000); watchT.unref?.();
  }
  function read() {
    const key = keyOf();
    if (key && cache?.key === key) return JSON.parse(cache.text);
    if (doubt && good && Date.now() - doubt.at < 2000) return JSON.parse(good.text); // (no 0.4 s wait on every message)
    let text; let err = null;
    try { text = DS.readRetry(dfs, configPath); JSON.parse(text); } catch (e) { err = e; }
    if (!err) {
      cache = { key, text }; good = { text }; if (doubt) { doubt = null; }
      return JSON.parse(text);
    }
    const code = err instanceof SyntaxError ? 'EGARBLED' : err.code || 'ERR';
    const fromCopy = !good ? newestCopy() : null;
    const base = good || fromCopy;
    if (!base) throw err; // nothing at all (a first start without config.json): as before, the window says so
    const fresh = !doubt;
    if (doubt) doubt.at = Date.now(); // (still the same doubt: what the window was given stays its base)
    else doubt = { why: code === 'EGARBLED' ? 'damaged' : code === 'ENOENT' ? 'missing' : 'unreadable', code, from: good ? 'memory' : 'copy', at: Date.now(), copyAt: fromCopy?.at || null, base: JSON.parse(base.text) };
    if (!good) good = { text: base.text };
    if (fresh) { console.warn(`config.json could not be read (${code}); using ${doubt.from === 'copy' ? 'its newest automatic copy' : 'the last good version'}; it won't be saved over until it reads again`); onDoubt(); }
    watch();
    return JSON.parse(base.text);
  }
  const flushed = (p, text) => { const fd = fs.openSync(p, 'w'); try { fs.writeSync(fd, text); try { fs.fsyncSync(fd); } catch { /* can't */ } } finally { fs.closeSync(fd); } };
  function writeText(text) {
    const tmp = `${configPath}.tmp`;
    flushed(tmp, text); // (round 50, crashsafe) on the disk before the rename: after a power cut, the old settings or the new, never half
    for (let i = 0; ; i++) {
      try { fs.renameSync(tmp, configPath); return; } catch (e) {
        if (i < 4 && DS.BUSY.has(e.code)) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 60 * (i + 1)); continue; }
        flushed(configPath, text); fs.rmSync(tmp, { force: true }); return; // (Windows: as before; flushed at once)
      }
    }
  }
  // → { ok, kept?, held?, refused? } — never writes a config that isn't one, never writes over a file it can't read
  // (baseArg: what the window had been given when a held save was made: its changes are put on top of the file later)
  function save(cfg, baseArg = null) {
    if (!isObj(cfg) || !Array.isArray(cfg.agents)) return { ok: false, refused: 'not a settings object' };
    let disk; let text = null; let state = 'ok';
    try { text = DS.readRetry(dfs, configPath); disk = JSON.parse(text); } catch (e) { state = e instanceof SyntaxError ? 'garbled' : e.code === 'ENOENT' ? 'missing' : 'held'; }
    const base = baseArg || doubt?.base || null;
    if (state === 'held') { // can't read it: nothing is written; the save waits and is tried again
      if (!doubt) { doubt = { why: 'unreadable', code: 'EBUSY', from: 'memory', at: Date.now(), base: good ? JSON.parse(good.text) : null }; onDoubt(); watch(); }
      heldSave = { cfg, base: base || doubt.base }; clearTimeout(heldT);
      heldT = setTimeout(() => { const c = heldSave; heldSave = null; if (c) save(c.cfg, c.base); }, 3000); heldT.unref?.();
      return { ok: false, held: true };
    }
    let value = cfg;
    if (state === 'ok' && base) value = DS.rebaseConfig(base, cfg, disk); // the window's changes, onto the file
    const g = state === 'ok' ? DS.guardConfig(disk, value) : { value, kept: { agents: [], keys: [], settings: false } };
    if (g.refused) return { ok: false, refused: g.refused };
    value = g.value;
    const keeps = g.kept.agents.length || g.kept.keys.length || g.kept.settings;
    // the copy: every 30 minutes, right before agents leave, when the guard kept something, and a damaged file aside
    if (text != null) {
      const dropping = state === 'ok' && Array.isArray(disk.agents) && disk.agents.some((a) => a?.id && !value.agents.some((b) => b?.id === a.id));
      const tag = state === 'garbled' ? 'garbled' : keeps ? 'kept' : dropping ? 'before' : '';
      const dir = env.historyDir(configPath, 'config');
      let newest = env.cache.get('newest'); if (newest === undefined) { newest = DS.copiesOf(fs, path, dir)[0]?.at || 0; }
      if (tag || SS.copyDue(newest, Date.now(), { gapMs: 30 * 60000 })) {
        try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, SS.copyName(Date.now(), state === 'ok' ? (disk.agents || []).length : 0, tag)), text); env.cache.set('newest', Date.now()); for (const n of SS.pruneCopies(fs.readdirSync(dir), { keep: 10 })) fs.rmSync(path.join(dir, n), { force: true }); } catch { /* a copy is a bonus */ }
      }
    }
    const out = `${JSON.stringify(value, null, 2)}\n`;
    writeText(out);
    cache = null; good = { text: out }; doubt = null; heldSave = null; clearTimeout(heldT);
    return { ok: true, ...(keeps ? { kept: g.kept } : {}), value: keeps || value !== cfg ? value : undefined };
  }
  const pub = () => (doubt ? { why: doubt.why, code: doubt.code, from: doubt.from, at: doubt.at, copyAt: doubt.copyAt } : null);
  function recheck() { if (!doubt) return true; try { const t = DS.readRetry(dfs, configPath); JSON.parse(t); cache = null; doubt = null; onRecovered(); return true; } catch { return false; } }
  return { read, save, doubt: pub, recheck, copiesDir: () => env.historyDir(configPath, 'config') };
}

// ---------- Recover… ----------
let o = { dataDir: path.join(__dirname, 'data'), configPath: path.join(__dirname, 'config.json'), store: null, cfg: null, syncmain: null };
const when = (t) => { try { return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
const readJsonF = (file) => { try { return JSON.parse(SS.readRetry(fs, file)); } catch { return undefined; } };
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
async function ls(dir) { try { return await fsp.readdir(dir); } catch { return []; } }
function backupDir() {
  try { const d = o.cfg?.read()?.settings?.backupDir; if (d) return d; } catch { /* default */ }
  return path.join(os.homedir(), 'Documents', 'Hearth backups');
}
// (round 46, platform46) plain Node first (zipkit: the same on the Mac and Windows); the system's tool as before when
// it can't read the zip
async function unzipSome(zip, members, dir) {
  try { await require('./zipkit').extract(zip, dir, { members, skipBad: true }); return dir; } catch { /* not one zipkit reads */ }
  return unzipSomeTool(zip, members, dir);
}
function unzipSomeTool(zip, members, dir) {
  const TAR = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  return new Promise((resolve) => {
    if (process.platform === 'linux') execFile('unzip', ['-q', '-o', zip, ...members.map((m) => (m.endsWith('/') ? `${m}*` : m)), '-d', dir], { timeout: 60000 }, () => resolve(dir));
    else execFile(TAR, ['-xf', zip, '-C', dir, ...members.map((m) => m.replace(/\/$/, ''))], { timeout: 60000, windowsHide: true }, () => resolve(dir));
  });
}
let lastScan = null; // { at, tmp, keys: Map(key → { kind, file?, value? }) } — what Recover may bring back, by key
const dropScan = () => { if (lastScan?.tmp) fs.rm(lastScan.tmp, { recursive: true, force: true }, () => {}); lastScan = null; };

// (round 52, chatkeep) the conversations Claude Code and Codex keep themselves (their own session files, never
// changed here), for the last 60 days, from Hearth's own working folder; the ones no chat of yours has become chats
const ENGINE_DAYS = 60;
async function jsonlFiles(dir, depth, since, out = []) {
  let ents = []; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of ents) {
    const f = path.join(dir, e.name);
    if (e.isDirectory() && depth > 0) await jsonlFiles(f, depth - 1, since, out);
    else if (e.isFile() && e.name.endsWith('.jsonl')) { try { const st = await fsp.stat(f); if (st.mtimeMs >= since && st.size < 64 * 1048576) out.push({ f, at: st.mtimeMs }); } catch { /* gone */ } }
  }
  return out;
}
async function engineChats(curChats, agents) {
  const home = o.home || os.homedir();
  const ws = o.workspace || path.join(o.dataDir, 'workspace');
  const since = Date.now() - ENGINE_DAYS * 864e5;
  const enc = (p) => String(p).replace(/[^a-zA-Z0-9]/g, '-');
  const files = [];
  // Claude Code: ~/.claude/projects/<the working folder, every other character a dash>/<session>.jsonl
  const cp = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'projects');
  let real = ws; try { real = fs.realpathSync(ws); } catch { /* not made yet */ }
  for (const d of new Set([enc(ws), enc(real)])) {
    for (const x of await jsonlFiles(path.join(cp, d), 0, since)) if (!files.some((y) => y.f === x.f)) files.push({ ...x, engine: 'claude' });
  }
  // Codex: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl (the folder it ran in is inside: cwd)
  const xp = path.join(process.env.CODEX_HOME || path.join(home, '.codex'), 'sessions');
  for (const x of await jsonlFiles(xp, 3, since)) files.push({ ...x, engine: 'codex' });
  if (!files.length) return [];
  // what your chats already hold: their engine sessions and what you asked in them (only chats of that period are read)
  const sessions = new Set(); const asks = new Set();
  for (const c of curChats) {
    if ((c.updatedAt || 0) < since - 864e5) continue;
    let chat = null; try { chat = o.store.getChat(c.id); } catch { chat = null; }
    if (!chat) continue;
    if (chat.session?.id) sessions.add(chat.session.id);
    for (const sid of [chat.session?.codexThread, chat.session?.thread, ...(Array.isArray(chat.sessions) ? chat.sessions : [])]) if (typeof sid === 'string') sessions.add(sid);
    for (const m of chat.messages || []) if (m.role === 'user') { asks.add(DS.textKey(m.text)); if (m.sent) asks.add(DS.textKey(m.sent)); }
  }
  const out = [];
  for (const x of files.sort((a, b) => b.at - a.at).slice(0, 400)) {
    let text; try { text = await fsp.readFile(x.f, 'utf8'); } catch { continue; }
    const sc = DS.sessionChat(text, { engine: x.engine });
    if (!sc) continue;
    if (x.engine === 'codex' && sc.cwd && path.resolve(sc.cwd) !== path.resolve(ws) && !String(sc.cwd).startsWith(o.dataDir)) continue; // another project's Codex
    if (DS.sessionKnown(sc, { sessions, asks })) continue;
    const agentId = DS.homeFor({ agentId: null }, agents, { three: sc.three, engine: x.engine });
    if (!agentId) continue;
    const chat = DS.chatFromSession(sc, agentId);
    out.push({ id: chat.id, title: chat.title, agentId, updatedAt: chat.updatedAt, messages: chat.messages.length, from: `${x.engine === 'codex' ? 'Codex' : 'Claude Code'}'s own record of the conversation`, fromAll: [x.f], deleted: false, state: 'missing', chat });
    if (out.length >= 60) break;
  }
  return out;
}

async function scan({ quick = false } = {}) {
  const t0 = Date.now();
  dropScan();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-datasafe-'));
  const keys = new Map(); let seq = 0;
  const keep = (rec) => { const k = `k${(seq += 1)}`; keys.set(k, rec); return k; };
  const D = o.dataDir;
  const sources = [];
  const chatSrc = []; const memSrc = []; const cfgSrc = [];
  const cloudCtx = () => { try { return o.syncmain?.pathCtx?.() || null; } catch { return null; } };
  const fromCloud = (v) => { const ctx = cloudCtx(); try { return ctx ? require('./sync-merge').fromCloud(v, ctx) : v; } catch { return v; } };
  // chats from a folder of chat files
  const chatsIn = async (dir, label, kind, cloud = false) => {
    const list = [];
    for (const n of (await ls(dir)).filter((x) => /^[\w-]{1,80}\.json$/.test(x) && !/\.prev\.json$/.test(x)).slice(0, 3000)) {
      const f = path.join(dir, n); const c = readJsonF(f);
      if (!c || typeof c.id !== 'string' || !Array.isArray(c.messages)) continue;
      list.push({ id: c.id, agentId: c.agentId, title: c.title || 'Chat', updatedAt: c.updatedAt || mtime(f), messages: c.messages.length, file: f, cloud });
    }
    if (list.length) { chatSrc.push({ label, kind, list }); sources.push({ label, what: 'chats', n: list.length }); }
  };
  // this computer: Recently deleted, kept before a restore, kept aside by sync
  await chatsIn(path.join(D, 'trash'), 'Recently deleted', 'trash');
  await chatsIn(path.join(D, '.held', 'chats'), 'A save that couldn\'t reach its file', 'copy'); // (round 52, chatkeep: store.js keeps a save it gave up on)
  for (const d of (await ls(path.join(D, 'trash'))).filter((x) => /^restored-/.test(x))) await chatsIn(path.join(D, 'trash', d), `Kept before a restore (${d.slice(9)})`, 'copy');
  const strash = path.join(D, 'sync', 'trash');
  const days = (await ls(strash)).filter((x) => /^\d{4}-\d\d-\d\d$/.test(x)).sort().reverse().slice(0, 30);
  for (const d of days) {
    await chatsIn(path.join(strash, d, 'chats'), `Kept aside by sync on ${d}`, 'copy');
    const m = readJsonF(path.join(strash, d, 'memory.json')); if (m) memSrc.push({ label: `Kept aside by sync on ${d}`, value: m });
    const c = readJsonF(path.join(strash, d, 'app', 'config.json')); if (c) cfgSrc.push({ label: `Kept aside by sync on ${d}`, value: c });
  }
  // memory: its .prev copy and automatic copies · settings: automatic copies
  const mp = readJsonF(path.join(D, 'memory.prev.json')); if (mp) memSrc.push({ label: 'The save before the last one', value: mp });
  for (const c of DS.copiesOf(fs, path, path.join(D, '.history', 'memory')).slice(0, 20)) { const v = readJsonF(c.file); if (v) memSrc.push({ label: `Automatic copy, ${when(c.at)}`, value: v }); }
  for (const c of DS.copiesOf(fs, path, path.join(D, '.history', 'config')).slice(0, 20)) { const v = readJsonF(c.file); if (v) cfgSrc.push({ label: `Automatic copy, ${when(c.at)}`, value: v }); }
  if (!quick) {
    // the cloud folder: its copy, its trash, conflict copies
    let root = null; try { root = o.syncmain?.status?.()?.root || null; } catch { root = null; }
    const cloud = root ? path.join(root, 'Hearth') : null;
    if (cloud && fs.existsSync(cloud)) {
      await chatsIn(path.join(cloud, 'files', 'chats'), 'The cloud folder\'s copy', 'copy', true);
      const cm = readJsonF(path.join(cloud, 'files', 'memory.json')); if (cm) memSrc.push({ label: 'The cloud folder\'s copy', value: fromCloud(cm) });
      for (const d of (await ls(path.join(cloud, 'trash'))).filter((x) => /^\d{4}-\d\d-\d\d$/.test(x)).sort().reverse().slice(0, 30)) await chatsIn(path.join(cloud, 'trash', d, 'chats'), `The cloud folder's trash, ${d}`, 'copy', true);
      for (const n of (await ls(path.join(cloud, '.sync', 'conflicts'))).filter((x) => /^\d{4}-\d\d-\d\d-[0-9a-f]{8}\.json$/.test(x))) {
        const rec = readJsonF(path.join(cloud, '.sync', 'conflicts', n));
        if (!rec?.copy) continue;
        const f = path.join(cloud, '.sync', 'conflicts', rec.copy); const label = `A sync conflict copy from ${rec.from || 'the other computer'} (${when(rec.at)})`;
        if (/^chats\//.test(rec.rel || '')) { const c = readJsonF(f); if (c?.id && Array.isArray(c.messages)) chatSrc.push({ label, kind: 'copy', list: [{ id: c.id, agentId: c.agentId, title: c.title || 'Chat', updatedAt: c.updatedAt || rec.at, messages: c.messages.length, file: f, cloud: true }] }); }
        else if (rec.rel === 'memory.json') { const v = readJsonF(f); if (v) memSrc.push({ label, value: fromCloud(v) }); }
        else if (rec.rel === 'app/config.json') { const v = readJsonF(f); if (v) cfgSrc.push({ label, value: v }); }
      }
    }
    // backups: the newest 4 zips (chats, memory, settings)
    const bdir = backupDir();
    // (round 45, backupauto) every backup folder of this computer, newest first, without the ones a check found damaged
    let zips = null; try { zips = await require('./backupautomain').recoverZips(4); } catch { zips = null; }
    zips ||= (await ls(bdir)).filter((n) => /\.zip$/i.test(n)).map((n) => ({ n, f: path.join(bdir, n), t: mtime(path.join(bdir, n)) })).sort((a, b) => b.t - a.t).slice(0, 4);
    for (const [i, z] of zips.entries()) {
      const dir = path.join(tmp, `z${i}`); fs.mkdirSync(dir, { recursive: true });
      await unzipSome(z.f, ['data/chats/', 'data/memory.json', 'config.json'], dir);
      const label = `Backup ${z.n.replace(/^hearth-backup-|\.zip$/g, '')}`;
      await chatsIn(path.join(dir, 'data', 'chats'), label, 'copy');
      const m = readJsonF(path.join(dir, 'data', 'memory.json')); if (m) memSrc.push({ label, value: m });
      const c = readJsonF(path.join(dir, 'config.json')); if (c) cfgSrc.push({ label, value: c });
    }
  }
  // ---- what isn't here now ----
  const curChats = await Promise.resolve(o.store.listChats()).catch(() => []);
  const msgs = new Map(); // messages in yours, only for the chats a copy also has (no reading every chat)
  const inSources = new Set(chatSrc.flatMap((s) => s.list.map((c) => c.id)));
  const curRows = curChats.map((c) => { let n; if (!c.unreadable && inSources.has(c.id)) { try { n = o.store.getChat(c.id)?.messages?.length; } catch { n = undefined; } msgs.set(c.id, n); } return { ...c, messages: n }; });
  const chats = DS.collectChats(curRows, chatSrc).slice(0, 400).map((c) => ({ key: keep({ kind: 'chat', file: c.file, cloud: c.cloud, id: c.id }), id: c.id, title: c.title, agentId: c.agentId, updatedAt: c.updatedAt, messages: c.messages, from: c.from, fromAll: c.fromAll, deleted: c.deleted, state: c.state, yours: msgs.get(c.id) ?? null }));
  // (round 52, chatkeep) every other place a chat can be: chats on disk the list doesn't show (their AI was removed or
  // turned off: a docked director's chats vanish with it), and the engines' own records of conversations no chat of
  // yours has (a chat that never reached its file, or whose file is gone with no copy anywhere)
  let curCfg0 = null; try { curCfg0 = o.cfg?.read?.() || null; } catch { curCfg0 = null; }
  const agents0 = Array.isArray(curCfg0?.agents) ? curCfg0.agents : null;
  if (agents0) {
    for (const c of DS.hiddenChats(curChats, agents0, ['ae'])) {
      // (round 55, chatsafe55) the chat keeps its AI: bringing it back brings its AI back (turned on again, or its
      // definition from a copy below), never moves the chat to another one
      if (!c.agentId) continue;
      const off = agents0.some((a) => a?.id === c.agentId);
      const def = off ? null : cfgSrc.map((s) => (Array.isArray(s.value?.agents) ? s.value.agents : []).find((a) => a?.id === c.agentId)).find(Boolean) || null;
      if (!off && !def) continue; // nothing here brings its AI back: the chats list offers "Bring back …" (made again)
      let n = 0; try { n = o.store.getChat(c.id)?.messages?.length || 0; } catch { n = 0; }
      chats.push({ key: keep({ kind: 'hidden', id: c.id, agentId: c.agentId, def }), id: c.id, title: c.title || 'Chat', agentId: c.agentId, updatedAt: c.updatedAt, messages: n, from: `Your chats folder (waiting for its AI: ${off ? 'it is turned off' : def ? 'it was removed, a copy of it is here' : 'it was removed'})`, fromAll: ['Your chats folder'], deleted: false, state: 'hidden' });
    }
    if (!quick) {
      try { for (const e of await engineChats(curChats, agents0)) chats.push({ ...e, key: keep({ kind: 'engine', chat: e.chat }) }); } catch (err) { sources.push({ label: `The engines' own records (couldn't be read: ${err.message})`, what: 'chats', n: 0 }); }
    }
  }
  for (const c of chats) delete c.chat;
  const curMem = o.store.getMemory();
  const memSeen = new Set(); const memory = [];
  for (const s of memSrc) for (const a of DS.mergeMemory(curMem, s.value).added) {
    if (a.line === '(all)' || memSeen.has(`${a.scope}\n${a.line}`)) continue;
    memSeen.add(`${a.scope}\n${a.line}`);
    memory.push({ key: keep({ kind: 'memory', scope: a.scope, line: a.line }), scope: a.scope, line: a.line, from: s.label });
  }
  let curCfg = null; try { curCfg = o.cfg.read(); } catch { curCfg = null; }
  const settings = [];
  if (curCfg) {
    const haveA = new Set((curCfg.agents || []).map((a) => a?.id)); const seenA = new Set(); const seenK = new Set();
    for (const s of cfgSrc) {
      for (const a of Array.isArray(s.value?.agents) ? s.value.agents : []) if (a?.id && !haveA.has(a.id) && !seenA.has(a.id)) { seenA.add(a.id); settings.push({ key: keep({ kind: 'agent', value: a }), what: 'agent', id: a.id, name: a.name || a.id, from: s.label }); } // (round 55: id, for chatsafemain's Bring back)
      for (const [k, v] of Object.entries(isObj(s.value?.settings) ? s.value.settings : {})) if (!(k in (curCfg.settings || {})) && !seenK.has(k)) { seenK.add(k); settings.push({ key: keep({ kind: 'setting', k, value: v }), what: 'setting', name: k, from: s.label }); }
    }
  }
  // tool data: copies kept aside by the guard (a save after a failed read, a big shrink, a damaged file)
  const kv = [];
  const hk = path.join(D, 'kv', '.history');
  for (const name of (await ls(hk)).filter((n) => !SS.GUARDED[n])) {
    for (const c of DS.copiesOf(fs, path, path.join(hk, name)).filter((x) => ['unread', 'before', 'garbled'].includes(x.tag)).slice(0, 3)) {
      const now = DS.count(o.store.getKV(name, null));
      if (c.tag !== 'garbled' && c.count <= now) continue;
      kv.push({ key: keep({ kind: 'kv', name, file: c.file }), name, label: DS.labelOf(name), at: c.at, count: c.count, now, tag: c.tag, from: `Copy kept aside, ${when(c.at)}` });
    }
  }
  lastScan = { at: Date.now(), tmp, keys };
  setTimeout(() => { if (lastScan?.tmp === tmp) dropScan(); }, 20 * 60000).unref?.();
  return { chats, memory, settings, kv, sources, current: { chats: curChats.length }, ms: Date.now() - t0, quick: Boolean(quick) };
}

// picks: [keys from the scan] → brought back by merging; nothing of yours is replaced or deleted
async function recover(picks = []) {
  if (!lastScan) throw new Error('Look again: that list is out of date');
  try { await require('./backupautomain').before('recover'); } catch { /* (round 45, backupauto) a backup first, unless a fresh one exists; Recover only adds */ }
  const recs = [...new Set(picks)].map((k) => lastScan.keys.get(k)).filter(Boolean);
  const done = { chats: [], memory: 0, agents: 0, settings: 0, kv: [] };
  // chats: one that isn't here comes back as it was; one you have comes in next to it as "… (recovered)"
  const curIds = new Set((await Promise.resolve(o.store.listChats()).catch(() => [])).map((c) => c.id));
  for (const r of recs.filter((x) => x.kind === 'chat')) {
    let chat = readJsonF(r.file);
    if (!chat?.id || !Array.isArray(chat.messages)) continue;
    if (r.cloud) { try { const ctx = o.syncmain?.pathCtx?.(); if (ctx) chat = require('./sync-merge').fromCloud(chat, ctx); } catch { /* as it is */ } }
    if (curIds.has(chat.id) || fs.existsSync(path.join(o.dataDir, 'chats', `${chat.id}.json`))) chat = { ...chat, id: `${chat.id}-r${Date.now().toString(36).slice(-4)}${done.chats.length}`.slice(0, 80), title: `${chat.title || 'Chat'} (recovered)` };
    await o.store.saveChat(chat);
    curIds.add(chat.id); done.chats.push(chat.id);
  }
  // (round 52, chatkeep) a chat waiting for its AI · (round 55, chatsafe55) it never moves to another AI: its own comes
  // back (turned on again, or its definition from a copy); the chat file isn't written at all
  const waiting = recs.filter((x) => x.kind === 'hidden');
  if (waiting.length) {
    let cur = null; try { cur = o.cfg.read(); } catch { cur = null; }
    if (!cur || !Array.isArray(cur.agents)) throw new Error('Your settings couldn\'t be read just now: nothing was changed, try again in a moment');
    const next = { ...cur, agents: [...cur.agents] }; let changed = 0;
    for (const r of waiting) {
      const i = next.agents.findIndex((a) => a?.id === r.agentId);
      if (i >= 0 && next.agents[i].enabled === false) { next.agents[i] = { ...next.agents[i], enabled: true }; changed += 1; } else if (i < 0 && r.def) { next.agents.push({ ...r.def, enabled: true }); changed += 1; done.agents += 1; }
      if (i >= 0 || r.def) done.chats.push(r.id);
    }
    if (changed) { const s = o.cfg.save(next); if (!s.ok) throw new Error(`Settings couldn't be saved just now (${s.refused || 'held'}): try again in a moment`); o.onConfig?.(); }
  }
  // a conversation from an engine's own record: a new chat (its session goes with it: you can go on in it)
  for (const r of recs.filter((x) => x.kind === 'engine')) {
    let chat = r.chat;
    if (!chat?.id) continue;
    if (curIds.has(chat.id) || fs.existsSync(path.join(o.dataDir, 'chats', `${chat.id}.json`))) chat = { ...chat, id: `${chat.id}${done.chats.length}`.slice(0, 80) };
    await o.store.saveChat(chat);
    curIds.add(chat.id); done.chats.push(chat.id);
  }
  // memory: the ticked lines added to their place
  const lines = recs.filter((x) => x.kind === 'memory');
  if (lines.length) {
    const found = { shared: '', agents: {} };
    for (const l of lines) {
      if (l.scope === 'shared') found.shared += `${l.line}\n`;
      else if (l.scope.startsWith('agent:')) { const id = l.scope.slice(6); found.agents[id] = `${found.agents[id] || ''}${l.line}\n`; } else { const [k, kk] = l.scope.split(':'); if (kk) { found[k] ||= {}; found[k][kk] = `${found[k][kk] || ''}${l.line}\n`; } }
    }
    const m = DS.mergeMemory(o.store.getMemory(), found);
    if (m.added.length) { await o.store.saveMemory(m.value); done.memory = m.added.length; }
  }
  // settings: agents you don't have, settings you never set
  const ag = recs.filter((x) => x.kind === 'agent'); const st = recs.filter((x) => x.kind === 'setting');
  if (ag.length || st.length) {
    const cur = o.cfg.read();
    const have = new Set((cur.agents || []).map((a) => a?.id));
    const next = { ...cur, agents: [...(cur.agents || [])], settings: { ...(cur.settings || {}) } };
    for (const a of ag) if (!have.has(a.value.id)) { next.agents.push(a.value); done.agents += 1; }
    for (const s of st) if (!(s.k in next.settings)) { next.settings[s.k] = s.value; done.settings += 1; }
    if (done.agents || done.settings) { const r = o.cfg.save(next); if (!r.ok) throw new Error(`Settings couldn't be saved just now (${r.refused || 'held'}): try again in a moment`); o.onConfig?.(); }
  }
  // tool data: what the copy had, joined with what you have (yours wins where both have it)
  for (const r of recs.filter((x) => x.kind === 'kv')) {
    const copy = readJsonF(r.file);
    if (copy === undefined) continue;
    const cur = o.store.getKV(r.name, null);
    await o.store.setKV(r.name, DS.union(copy, cur));
    done.kv.push(r.name);
  }
  return done;
}

function register(ipcMain, opts = {}) {
  o = { ...o, ...opts };
  ipcMain.handle('data:health', () => ({ ...o.store.health(), config: o.cfg?.doubt() || null }));
  ipcMain.handle('data:recheck', () => { const r = o.store.recheck(); if (o.cfg && !o.cfg.recheck()) r.still.push('config'); return r; });
  ipcMain.handle('data:scan', async (_e, a) => { try { return await scan(a || {}); } catch (err) { return { error: err.message, chats: [], memory: [], settings: [], kv: [], sources: [] }; } });
  ipcMain.handle('data:recover', async (_e, picks) => recover(Array.isArray(picks) ? picks.slice(0, 2000) : []));
}

module.exports = { config, register, scan, recover, _set: (patch) => { o = { ...o, ...patch }; } };
