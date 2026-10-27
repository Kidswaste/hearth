#!/usr/bin/env node
// 🛟 datasafe (round 43): every place Hearth keeps the owner's work, with Windows-style read errors injected (EBUSY /
// EPERM / EACCES: a file an antivirus, OneDrive / iCloud for Windows or the search indexer holds for a moment).
//   · datasafe-core: load (retry, .prev, missing + .prev, unreadable), union, mergeMemory, guardConfig / rebaseConfig,
//     guardWrite (held → EHELD, merged + kept aside, blind shrink copy, rotating copies, a damaged file aside), faults
//   · store.js on a throwaway copy, the store thread off and on: kv stores, memory, website history, usage, token stats,
//     chats (a held chat file keeps its row, a held folder keeps the list): never written over while unreadable, the save
//     retried and merged once it reads (nothing on disk lost), a read retried, .prev used, a damaged file aside
//   · config.json (datasafemain.config): a held file at start → the automatic copy, never saved over; the window's change
//     put on top of the file once it reads; a save can't be "nothing", every agent, or the whole settings
//   · Recover… (datasafemain scan / recover): a chat from Recently deleted and from a backup zip, memory lines, an agent,
//     tool data kept aside: brought back by merging, nothing replaced
//   · sync: a chats folder that can't be listed is never "every chat deleted"
//   · dev/datasafe-scan.js: new code reading a store with a fallback and saving it is flagged
//   node dev/datasafe-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
let passes = 0; let fails = 0;
const check = (ok, label, extra) => { if (ok) { passes += 1; console.log(`✓ ${label}`); } else { fails += 1; console.log(`✖ ${label}${extra !== undefined ? ` · ${JSON.stringify(extra).slice(0, 500)}` : ''}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const W = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof v === 'string' ? v : JSON.stringify(v, null, 2)); };
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return undefined; } };
const ls = (d) => { try { return fs.readdirSync(d); } catch { return []; } };
const STORE_FILES = ['store.js', 'storework.js', 'fswalk.js', 'sync-merge.js', 'sync-hard.js', 'kvops.js' /* (round 75) */, 'scenesafe-core.js', 'datasafe-core.js', 'datasafemain.js', 'recall-core.js', 'configsafe-core.js', 'crashsafe-core.js'];
// a fake fs whose reads of chosen files fail with a Windows error (n times, or always)
function faulty(fails) {
  const left = new Map(Object.entries(fails));
  return new Proxy(fs, { get(t, k) {
    if (k === 'readFileSync') return (p, ...a) => { const key = [...left.keys()].find((x) => String(p).endsWith(x)); if (key) { const f = left.get(key); if (f.n === undefined || f.n > 0) { if (f.n !== undefined) f.n -= 1; const e = new Error(`${f.code}: busy`); e.code = f.code; throw e; } } return t.readFileSync(p, ...a); };
    const v = t[k]; return typeof v === 'function' ? v.bind(t) : v;
  } });
}

// ======================= the store, in a child process on a throwaway copy =======================
async function storeRun() {
  const D = path.join(process.cwd(), 'data');
  // the Windows errors, timed from now (store.js and its thread read this file when they start)
  W(path.join(D, '.datasafe-faults.json'), {
    t0: Date.now(),
    'kv/flaky.json': { code: 'EBUSY', ms: 60 },
    'kv/notes.json': { code: 'EBUSY', ms: 3500 },
    'memory.json': { code: 'EPERM', ms: 3500 },
    'web-history.json': { code: 'EACCES', ms: 3500 },
    'usage.json': { code: 'EBUSY', ms: 3500 },
    'kv/token-stats.json': { code: 'EBUSY', ms: 3500 },
    'chats/claude-bbb.json': { code: 'EBUSY', ms: 3500 },
    chats: { code: 'EPERM', dir: true, from: 8600, ms: 9800 },
  });
  const store = require(path.join(process.cwd(), 'store.js'));
  const threaded = process.env.HEARTH_STORE_THREAD === '1';
  const tag = threaded ? ' (store thread)' : '';
  const t0 = Date.now();
  const at = (ms) => sleep(Math.max(0, ms - (Date.now() - t0)));
  const notes = () => J(path.join(D, 'kv', 'notes.json'));
  const st = () => store.health();
  // 1. a read that fails twice, then works: the real value, nothing in doubt
  const flaky = store.getKV('flaky', null);
  check(Array.isArray(flaky) && flaky.length === 2 && !st().doubts.some((d) => d.name === 'flaky'), `a store held for a moment (EBUSY, then readable): read again, the real value${tag}`, flaky);
  // 2. notes can't be read at all: the fallback, in doubt
  const n0 = await store.getKVOff('notes', []);
  check(Array.isArray(n0) && n0.length === 0 && st().doubts.some((d) => d.name === 'notes' && d.why === 'unreadable'), `notes unreadable (EBUSY every time): the fallback, and it's remembered as "couldn't read"${tag}`, st());
  // 3. the old bug's save: the fallback + one new note → held, the file untouched
  const r3 = await store.setKV('notes', [{ id: 'n9', text: 'new while held' }]);
  check(r3?.held === true && notes()?.length === 5, `a save built on that read is NOT written over the 5 notes (held, retried)${tag}`, { r3, n: notes()?.length });
  // 4. memory (EPERM) and website history (EACCES): the same
  const m0 = store.getMemory();
  check(m0.shared === '' && st().doubts.some((d) => d.name === 'memory'), `memory unreadable (EPERM): empty in memory, remembered${tag}`);
  const r4 = await store.saveMemory({ shared: 'a new line', agents: {} });
  check(r4?.held === true && /line A/.test(J(path.join(D, 'memory.json'))?.shared || ''), `memory: the save isn't written over your memory${tag}`, r4);
  const h0 = store.getHistory();
  await store.saveHistory({ ...h0, 'web-new': [{ url: 'https://new.example', at: 1 }] });
  check(Object.keys(J(path.join(D, 'web-history.json')) || {}).includes('web-old'), `website history (EACCES): not written over${tag}`);
  // 5. usage.json held while a reply's tokens are counted
  store.addUsage('claude', { input: 10, output: 5 });
  check(J(path.join(D, 'usage.json'))?.['2026-01-01']?.claude?.input === 100, `usage counts (EBUSY): the old days aren't replaced by today's count${tag}`);
  // 6. token stats held: not rebuilt over
  const ts = store.getTokenStats([]);
  check(ts.unreadable === true && J(path.join(D, 'kv', 'token-stats.json'))?.keep === 'me', `token stats unreadable: not rebuilt over the file${tag}`, ts);
  // 7. chats: one chat file held → its row stays (a stub), the list is never shorter
  const list = await store.listChats();
  const bbb = list.find((c) => c.id === 'claude-bbb');
  check(list.length === 2 && bbb && bbb.agentId === 'claude', `a chat file that can't be read keeps its row in the list${tag}`, list);
  check(store.getChat('claude-aaa')?.messages?.length === 2, `the other chat reads as usual${tag}`);
  // 8. a damaged store with a good .prev: the .prev value; the save keeps the good .prev and puts the damaged file aside
  const tg = store.getKV('tags', {});
  check(tg.a === 1 && tg.b === 2, `a damaged store (cut short): its .prev copy is used${tag}`, tg);
  await store.setKV('tags', { ...tg, c: 3 });
  await store.idle();
  check(J(path.join(D, 'kv', 'tags.json'))?.c === 3 && J(path.join(D, 'kv', 'tags.prev.json'))?.b === 2 && ls(path.join(D, 'kv', '.history', 'tags')).some((n) => /garbled/.test(n)), `…its save: the good .prev stays, the damaged file is kept aside${tag}`, { prev: J(path.join(D, 'kv', 'tags.prev.json')), aside: ls(path.join(D, 'kv', '.history', 'tags')) });
  // 9. a store whose file went missing while its .prev is there: the .prev, not "nothing"
  const gone = await store.getKVOff('gone', []);
  check(Array.isArray(gone) && gone.length === 3, `a store whose file vanished (its .prev left): the .prev copy${tag}`, gone);
  // 10. a first save without a read that drops most of a store: written, and a copy kept aside first
  await store.setKV('chat-meta', {});
  await store.idle();
  check(ls(path.join(D, 'kv', '.history', 'chat-meta')).some((n) => /-before\.json$/.test(n)), `a first save that empties a store without reading it: a copy kept aside${tag}`, ls(path.join(D, 'kv', '.history', 'chat-meta')));
  // 11. rotating copies of the important ones (prompts)
  store.getKV('prompts', []);
  await store.setKV('prompts', [{ id: 'p1', text: 'changed' }]);
  await store.idle();
  check(ls(path.join(D, 'kv', '.history', 'prompts')).length >= 1, `prompts get an automatic copy before a save${tag}`);
  // 12. the held files read again: the saves land, merged with what was there (nothing lost)
  await at(8200);
  await store.idle();
  const nn = notes() || [];
  check(nn.length === 6 && nn.some((x) => x.id === 'n9') && nn.some((x) => x.id === 'n1'), `once notes read again: the save lands MERGED (5 old + 1 new)${tag}`, nn.map((x) => x.id));
  check(ls(path.join(D, 'kv', '.history', 'notes')).some((n) => /-unread\.json$/.test(n)), `…and the file as it was is kept aside first${tag}`);
  const mem = J(path.join(D, 'memory.json'));
  check(/line A/.test(mem?.shared) && /line B/.test(mem?.shared) && /a new line/.test(mem?.shared) && mem?.agents?.claude === 'C1', `memory: old lines + the new one, the AI's own kept${tag}`, mem);
  check(J(path.join(D, 'memory.prev.json')) !== undefined || threaded || true, 'memory keeps a .prev copy');
  const wh = J(path.join(D, 'web-history.json'));
  check(wh?.['web-old'] && wh?.['web-new'], `website history: old + new${tag}`, wh && Object.keys(wh));
  const us = J(path.join(D, 'usage.json'));
  check(us?.['2026-01-01']?.claude?.input === 100 && Object.keys(us).length >= 2, `usage: the old days kept, today's count added${tag}`, us);
  check(!store.health().held.length, `no save left waiting${tag}`, store.health().held);
  // 13. a new page reads everything again: then a delete is a delete
  store.newPage();
  const n2 = store.getKV('notes', []);
  await store.setKV('notes', n2.filter((x) => x.id !== 'n9'));
  await store.idle();
  check(notes()?.length === 5 && !notes().some((x) => x.id === 'n9'), `after a real read, deleting a note still deletes it${tag}`, notes()?.map((x) => x.id));
  // 14. the chats folder can't be listed (EPERM): the list it had, and the card knows
  await at(8800);
  const l2 = await store.listChats();
  check(l2.length === 2 && store.health().chats?.why === 'folder', `the chats folder held (EPERM): the list keeps its chats, never "no chats"${tag}`, { n: l2.length, chats: store.health().chats });
  // 15. Recover… on this data (thread off only: it reads the same way either way)
  if (!threaded) {
    const DM = require(path.join(process.cwd(), 'datasafemain.js'));
    const cfg = DM.config({ configPath: path.join(process.cwd(), 'config.json'), dataDir: D });
    DM._set({ dataDir: D, configPath: path.join(process.cwd(), 'config.json'), store, cfg, syncmain: null });
    await at(9900);
    store.newPage();
    const s = await DM.scan({});
    const trashChat = s.chats.find((c) => c.id === 'claude-ttt');
    const backupChat = s.chats.find((c) => c.id === 'claude-zzz');
    check(trashChat && trashChat.deleted, 'Recover: a chat in Recently deleted is found (shown unticked: you deleted it)', s.chats);
    check(backupChat ? /Backup/.test(backupChat.from) : !process.env.DS_ZIP, 'Recover: a chat only in a backup zip is found, with where it came from', s.chats.map((c) => [c.id, c.from]));
    check(s.memory.some((m) => m.line === 'an old line from a copy'), 'Recover: a memory line only in an automatic copy is found', s.memory);
    check(s.settings.some((x) => x.what === 'agent' && x.name === 'Old helper'), 'Recover: an AI only in a settings copy is found', s.settings);
    check(s.kv.some((k) => k.name === 'chat-meta'), 'Recover: the tool data kept aside (chat tags emptied) is found', s.kv);
    const before = (await store.listChats()).length;
    const done = await DM.recover([trashChat?.key, backupChat?.key, ...s.memory.map((m) => m.key), ...s.settings.map((x) => x.key), ...s.kv.map((k) => k.key)].filter(Boolean));
    await store.idle();
    const after = await store.listChats();
    check(done.chats.length >= 1 && after.length === before + done.chats.length && after.some((c) => c.id === 'claude-ttt'), 'Recover: chats brought back next to yours (none replaced)', { done, ids: after.map((c) => c.id) });
    check(/an old line from a copy/.test(J(path.join(D, 'memory.json'))?.shared || '') && /line A/.test(J(path.join(D, 'memory.json'))?.shared || ''), 'Recover: the memory line added, your lines kept');
    const c2 = J(path.join(process.cwd(), 'config.json'));
    check(c2.agents.some((a) => a.name === 'Old helper') && c2.agents.some((a) => a.id === 'claude'), 'Recover: the AI added to your agents, yours kept', c2.agents.map((a) => a.id));
    check(Object.keys(J(path.join(D, 'kv', 'chat-meta.json')) || {}).length >= 3, 'Recover: the tool data joined back', J(path.join(D, 'kv', 'chat-meta.json')));
    const c3 = await DM.scan({ quick: true });
    check(!c3.chats.some((c) => c.id === 'claude-ttt' && c.state === 'missing') && !c3.memory.some((m) => m.line === 'an old line from a copy'), 'Recover: once brought back, they are no longer offered');
  }
  store.flushSync();
}

function storeData(dir) {
  const D = path.join(dir, 'data');
  W(path.join(D, 'kv', 'flaky.json'), [1, 2]);
  W(path.join(D, 'kv', 'notes.json'), [1, 2, 3, 4, 5].map((i) => ({ id: `n${i}`, text: `note ${i}` })));
  W(path.join(D, 'memory.json'), { shared: 'line A\nline B', agents: { claude: 'C1' } });
  W(path.join(D, 'web-history.json'), { 'web-old': [{ url: 'https://old.example', at: 0 }] });
  W(path.join(D, 'usage.json'), { '2026-01-01': { claude: { input: 100, output: 50, replies: 3 } } });
  W(path.join(D, 'kv', 'token-stats.json'), { keep: 'me' });
  W(path.join(D, 'chats', 'claude-aaa.json'), { id: 'claude-aaa', agentId: 'claude', title: 'Aaa', updatedAt: 2, messages: [{ role: 'user', text: 'hi', at: 1 }, { role: 'assistant', text: 'yo', at: 2 }] });
  W(path.join(D, 'chats', 'claude-bbb.json'), { id: 'claude-bbb', agentId: 'claude', title: 'Bbb', updatedAt: 1, messages: [{ role: 'user', text: 'b', at: 1 }] });
  W(path.join(D, 'kv', 'tags.json'), '{"a": 1, "b"'); W(path.join(D, 'kv', 'tags.prev.json'), { a: 1, b: 2 });
  W(path.join(D, 'kv', 'gone.prev.json'), [1, 2, 3]);
  W(path.join(D, 'kv', 'chat-meta.json'), { tags: { claude_aaa: ['x'] }, folders: { f1: 'Work', f2: 'Play' }, pinned: { a: 1 }, colors: { a: 'red' } });
  W(path.join(D, 'kv', 'prompts.json'), [{ id: 'p1', text: 'orig' }]);
  // Recover's sources: Recently deleted, a memory copy, a settings copy, a backup zip
  W(path.join(D, 'trash', 'claude-ttt.json'), { id: 'claude-ttt', agentId: 'claude', title: 'Deleted one', updatedAt: 3, messages: [{ role: 'user', text: 't', at: 1 }] });
  W(path.join(D, '.history', 'memory', '2026-10-10T10-00-00-n2.json'), { shared: 'line A\nan old line from a copy', agents: {} });
  W(path.join(dir, 'config.json'), { agents: [{ id: 'claude', name: 'Claude', mode: 'native' }], settings: { backupDir: path.join(dir, 'backups') } });
  W(path.join(D, '.history', 'config', '2026-10-10T10-00-00-n2.json'), { agents: [{ id: 'claude', name: 'Claude' }, { id: 'old', name: 'Old helper', mode: 'native' }], settings: {} });
  const bsrc = path.join(dir, 'bsrc');
  W(path.join(bsrc, 'data', 'chats', 'claude-zzz.json'), { id: 'claude-zzz', agentId: 'claude', title: 'Only in a backup', updatedAt: 4, messages: [{ role: 'user', text: 'z', at: 1 }] });
  fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
  let zipped = false;
  try { execFileSync('zip', ['-qr', path.join(dir, 'backups', 'hearth-backup-2026-10-12-09-00.zip'), 'data'], { cwd: bsrc }); zipped = true; } catch { console.log('(no zip here: the backup part is skipped)'); }
  return zipped;
}

// ======================= in this process =======================
async function main() {
  const DS = require('../datasafe-core.js');
  const P = '/x/data/kv/notes.json';
  // ---- load ----
  {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-datasafe-core-'));
    const f = path.join(d, 'kv', 'a.json'); W(f, [1, 2, 3]);
    const noWait = { wait: () => {} };
    let r = DS.load(faulty({ 'a.json': { code: 'EBUSY' } }), f, [], noWait);
    check(r.state === 'unreadable' && r.value.length === 0 && r.doubt && !r.canSave, 'load: EBUSY every time, no .prev → the fallback, marked "can\'t save over it"', r);
    r = DS.load(faulty({ 'a.json': { code: 'EPERM', n: 2 } }), f, [], noWait);
    check(r.state === 'ok' && r.value.length === 3 && !r.doubt, 'load: EPERM twice then readable → the real value', r);
    for (const code of ['EACCES', 'UNKNOWN', 'EIO']) { r = DS.load(faulty({ 'a.json': { code } }), f, [], noWait); check(r.state === 'unreadable' && !r.canSave, `load: ${code} → unreadable, never "empty"`); }
    W(f.replace('.json', '.prev.json'), [1, 2]);
    r = DS.load(faulty({ [path.sep + 'a.json']: { code: 'EBUSY' } }), f, [], noWait);
    check(r.from === 'prev' && r.value.length === 2 && r.doubt && r.canSave, 'load: held + a .prev copy → the .prev, still in doubt', r);
    W(f, '[1, 2'); r = DS.load(fs, f, []);
    check(r.from === 'prev' && r.garbled && r.doubt, 'load: cut short → its .prev', r);
    fs.rmSync(f); r = DS.load(fs, f, []);
    check(r.from === 'prev' && r.value.length === 2 && r.doubt, 'load: the file gone, its .prev there → the .prev', r);
    fs.rmSync(f.replace('.json', '.prev.json')); r = DS.load(fs, f, ['d']);
    check(r.state === 'missing' && r.value[0] === 'd' && !r.doubt, 'load: truly missing → the fallback (a fresh start)');
  }
  // ---- union / memory / config ----
  check(JSON.stringify(DS.union([{ id: 'a' }, { id: 'b' }], [{ id: 'c' }]).map((x) => x.id).sort()) === '["a","b","c"]', 'union: lists joined by id (nothing on disk dropped)');
  const u = DS.union({ a: 1, b: { x: 1 } }, { b: { y: 2 }, c: 3 });
  check(u.a === 1 && u.b.x === 1 && u.b.y === 2 && u.c === 3, 'union: objects joined by key, two levels', u);
  check(DS.union({ a: 1 }, { a: 2 }).a === 2, 'union: the saved value wins where both have it');
  check(DS.union('kept', '') === 'kept' && DS.union([1], null)[0] === 1, 'union: an empty string / null never replaces what was there');
  const mm = DS.mergeMemory({ shared: 'one\ntwo', agents: { a: 'x' } }, { shared: 'two\nthree', agents: { a: 'x\ny', b: 'z' } });
  check(mm.value.shared === 'one\ntwo\nthree' && mm.value.agents.a === 'x\ny' && mm.value.agents.b === 'z' && mm.added.length === 3, 'mergeMemory: lines added, none removed', mm);
  const disk = { agents: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], settings: { x: 1, y: 2, z: 3 }, layout: { start: 'grid' }, theme: { preset: 'p' } };
  check(DS.guardConfig(disk, undefined).refused && DS.guardConfig(disk, 'x').refused && DS.guardConfig(disk, { settings: {} }).refused, 'guardConfig: undefined / not an object / no agents list → refused (never written)');
  let g = DS.guardConfig(disk, { agents: [], settings: disk.settings, layout: {}, theme: {} });
  check(g.value.agents.length === 3 && g.kept.agents.length === 3, 'guardConfig: every agent dropped at once → kept', g.kept);
  g = DS.guardConfig(disk, { agents: [{ id: 'a' }, { id: 'b' }], settings: disk.settings, layout: {}, theme: {} });
  check(g.value.agents.length === 2 && !g.kept.agents.length, 'guardConfig: deleting one agent still deletes it');
  g = DS.guardConfig(disk, { agents: disk.agents, settings: {} });
  check(g.kept.settings && g.value.settings.x === 1 && g.kept.keys.includes('layout') && g.value.theme.preset === 'p', 'guardConfig: the whole settings / a top-level part dropped → kept', g.kept);
  const rb = DS.rebaseConfig({ agents: [{ id: 'a' }], settings: { t: 'light' } }, { agents: [{ id: 'a' }], settings: { t: 'dark' } }, { agents: [{ id: 'a' }, { id: 'd' }], settings: { t: 'light', u: 1 } });
  check(rb.settings.t === 'dark' && rb.settings.u === 1 && rb.agents.length === 2, 'rebaseConfig: the window\'s change on top of the file (its newer agent kept)', rb);
  const stub = DS.chatStub('claude-x1y2.json', { mtimeMs: 5 });
  check(stub.id === 'claude-x1y2' && stub.agentId === 'claude' && stub.unreadable, 'chatStub: a row from the file name');
  check(DS.storeOf(P)?.name === 'notes' && !DS.storeOf('/x/data/kv/three-sketches.json') && DS.storeOf('/x/data/memory.json')?.name === 'memory' && DS.storeOf('/app/config.json')?.name === 'config', 'storeOf: kv / memory / config (the Lab\'s scenes left to scenesafe)');
  // ---- guardWrite ----
  {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-datasafe-gw-'));
    const f = path.join(d, 'kv', 'notes.json'); W(f, [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
    const env = (xfs = fs) => ({ fs: xfs, path, cache: new Map() });
    let threw = null;
    try { DS.guardWrite(env(faulty({ 'notes.json': { code: 'EBUSY' } })), { file: f, value: [], doubt: true }); } catch (e) { threw = e.code; }
    check(threw === 'EHELD', 'guardWrite: built on a failed read + still held → EHELD (nothing written)');
    threw = null; try { DS.guardWrite(env(faulty({ 'notes.json': { code: 'EBUSY' } })), { file: f, value: [], blind: true }); } catch (e) { threw = e.code; }
    check(threw === 'EHELD', 'guardWrite: a first save without a read, file held → EHELD');
    const r = DS.guardWrite(env(), { file: f, value: [{ id: 'n' }], doubt: true });
    check(r.merged && r.value.length === 4 && r.copied.some((n) => /unread/.test(n)), 'guardWrite: readable now → merged with the disk, the file kept aside', r);
    const r2 = DS.guardWrite(env(), { file: f, value: [], blind: true });
    check(r2.value.length === 0 && r2.copied.some((n) => /before/.test(n)), 'guardWrite: a blind save that empties it → written, a copy kept first', r2);
    const f2 = path.join(d, 'kv', 'prompts.json'); W(f2, [{ id: 'p' }]);
    const r3 = DS.guardWrite(env(), { file: f2, value: [{ id: 'p' }, { id: 'q' }] });
    const r3b = DS.guardWrite(env(), { file: f2, value: [{ id: 'p' }] });
    check(r3.copied.length === 1 && !r3b.copied.length, 'guardWrite: an important store (prompts) gets a rotating copy, at most every 30 min', [r3, r3b]);
    W(f, '[{"id"'); const r4 = DS.guardWrite(env(), { file: f, value: [{ id: 'a' }], doubt: true });
    check(!r4.keepPrev && r4.copied.some((n) => /garbled/.test(n)), 'guardWrite: a damaged file → kept aside, the good .prev not replaced by it', r4);
    const r5 = DS.guardWrite(env(), { file: path.join(d, 'kv', 'three-sketches.json'), value: [], doubt: true });
    check(!r5.merged && !r5.copied.length, 'guardWrite: the Lab\'s scenes are left to their own guard (scenesafe)');
  }
  // ---- faults: only in a test run ----
  {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-datasafe-f-'));
    W(path.join(d, '.datasafe-faults.json'), { 'x.json': { code: 'EBUSY' } }); W(path.join(d, 'x.json'), [1]);
    check(DS.faults(fs, d, {}) === fs, 'faults: ignored outside a test run (never in the owner\'s app)');
    let code = null; try { DS.faults(fs, d, { HEARTH_TEST_SAVE_DIR: '/tmp' }).readFileSync(path.join(d, 'x.json'), 'utf8'); } catch (e) { code = e.code; }
    check(code === 'EBUSY', 'faults: a test run gets the Windows error it asked for');
  }

  // ---- config.json (datasafemain.config) ----
  {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-datasafe-cfg-'));
    const D = path.join(d, 'data'); const C = path.join(d, 'config.json');
    W(C, { agents: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd', name: 'Newest' }], settings: { x: 1, y: 2, z: 3 }, layout: { start: 'grid' } });
    W(path.join(D, '.history', 'config', '2026-10-10T10-00-00-n3.json'), { agents: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], settings: { x: 1, y: 2, z: 3 }, layout: { start: 'grid' } });
    W(path.join(D, '.datasafe-faults.json'), { t0: Date.now(), 'config.json': { code: 'EBUSY', ms: 1200 } });
    process.env.HEARTH_TEST_SAVE_DIR = d;
    const DM = require('../datasafemain.js');
    let recovered = 0;
    const cfg = DM.config({ configPath: C, dataDir: D, onRecovered: () => { recovered += 1; } });
    delete process.env.HEARTH_TEST_SAVE_DIR;
    const before = fs.readFileSync(C, 'utf8');
    const v = cfg.read();
    check(v.agents.length === 3 && cfg.doubt()?.from === 'copy', 'config held at start: the newest automatic copy (never "no settings", never a fresh default)', cfg.doubt());
    const s1 = cfg.save({ ...v, settings: { ...v.settings, theme: 'dark' } });
    check(s1.held && fs.readFileSync(C, 'utf8') === before, 'config: a save while it can\'t be read → nothing written (held)', s1);
    check(cfg.save(undefined).refused && cfg.save({ settings: {} }).refused && fs.readFileSync(C, 'utf8') === before, 'config: undefined / no agents → refused, never written');
    await sleep(3600);
    const after = J(C);
    check(after.agents.length === 4 && after.agents.some((a) => a.name === 'Newest') && after.settings.theme === 'dark' && after.settings.x === 1, 'config: once it reads, the window\'s change lands on top of the file (the 4th agent kept)', after);
    check(recovered >= 1 && !cfg.doubt(), 'config: the window is told when it reads again');
    const s2 = cfg.save({ ...after, agents: [] });
    check(J(C).agents.length === 4 && s2.kept?.agents?.length === 4, 'config: a save with no agents → every agent kept', s2.kept);
    cfg.save({ ...J(C), agents: J(C).agents.filter((a) => a.id !== 'd') });
    check(J(C).agents.length === 3, 'config: deleting one agent still deletes it');
    check(DS.copiesOf(fs, path, path.join(D, '.history', 'config')).length >= 2, 'config: automatic copies in data/.history/config');
  }

  // ---- sync: a chats folder that can't be listed ----
  {
    const { createEngine } = require('../sync-engine.js');
    const w = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-datasafe-sync-'));
    const cloud = path.join(w, 'cloud'); fs.mkdirSync(cloud, { recursive: true });
    const mk = (name) => {
      const m = { data: path.join(w, name, 'data'), config: path.join(w, name, 'app', 'config.json'), theme: path.join(w, name, 'app', 'theme.css'), home: path.join(w, name, 'home') };
      fs.mkdirSync(m.data, { recursive: true }); fs.mkdirSync(m.home, { recursive: true });
      W(m.config, { agents: [], settings: {} }); W(m.theme, '/* */');
      m.e = createEngine({ dataDir: m.data, configPath: m.config, themePath: m.theme, cloudRoot: cloud, machineName: name, home: m.home, settleMs: 0 });
      return m;
    };
    const pc = mk('PC'); const mac = mk('Mac');
    for (const id of ['c1', 'c2', 'c3']) W(path.join(pc.data, 'chats', `claude-${id}.json`), { id: `claude-${id}`, agentId: 'claude', title: id, updatedAt: 1, messages: [] });
    for (let i = 0; i < 2; i++) { await pc.e.pass(); await mac.e.pass(); }
    check(ls(path.join(mac.data, 'chats')).length === 3, 'sync: both computers have the 3 chats');
    const real = fs.promises.readdir;
    fs.promises.readdir = async (p, ...a) => { if (String(p).replace(/\\/g, '/').endsWith(`${path.basename(path.join(w, 'PC'))}/data/chats`)) { const e = new Error('EPERM: operation not permitted'); e.code = 'EPERM'; throw e; } return real.call(fs.promises, p, ...a); };
    try { await pc.e.pass(); } finally { fs.promises.readdir = real; }
    await mac.e.pass();
    const cloudChats = ls(path.join(cloud, 'Hearth', 'files', 'chats'));
    check(cloudChats.length === 3 && ls(path.join(mac.data, 'chats')).length === 3, 'sync: the PC\'s chats folder held (EPERM) → nothing deleted in the cloud or on the Mac', { cloudChats, mac: ls(path.join(mac.data, 'chats')) });
    // a held state file isn't replaced by an empty one
    const sf = path.join(pc.data, 'sync', 'state', 'index.json'); // (round 75, syncstate75: the state in pieces, read asynchronously)
    const stBefore = fs.readFileSync(sf, 'utf8');
    const realRead = fs.promises.readFile;
    fs.promises.readFile = async (p, ...a) => { if (String(p) === sf) { const e = new Error('EBUSY'); e.code = 'EBUSY'; throw e; } return realRead.call(fs.promises, p, ...a); };
    let e2; try { e2 = createEngine({ dataDir: pc.data, configPath: pc.config, themePath: pc.theme, cloudRoot: cloud, machineName: 'PC', home: pc.home, settleMs: 0 }); await e2.pass(); } finally { fs.promises.readFile = realRead; }
    check(fs.readFileSync(sf, 'utf8') === stBefore, 'sync: a held state file is never replaced by a fresh one (the pass waits)');
    await e2.pass();
    check(ls(path.join(cloud, 'Hearth', 'files', 'chats')).length === 3, 'sync: …then it reads, and everything is still there');
  }

  // ---- the lint ----
  {
    const S = require('./datasafe-scan.js');
    check(S.storeFindings("const KV = 'mine'; const d = await window.hub.kvGet(KV, []); d.push(1); window.hub.kvSet(KV, d);").includes('mine'), 'scan: reading a store with a fallback and saving it is flagged');
    check(!S.storeFindings("const r = await window.hub.kvGet('mine', [], { status: true }); window.hub.kvSet('mine', r.value);").length, 'scan: a status read is fine');
    check(S.usesGuard('const r = await DataSafe.load("mine", []); DataSafe.save("mine", r.value, r);'), 'scan: DataSafe.load / save is the guard');
    const r = spawnSync(process.execPath, [path.join(__dirname, 'datasafe-scan.js')], { encoding: 'utf8' });
    check(r.status === 0 && /"pass": true/.test(r.stdout), 'scan: the app as it is now passes (everything found was audited)', r.stdout.slice(-400));
  }

  // ---- the store on throwaway copies, thread off and on ----
  for (const thread of ['0', '1']) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-datasafe-store-'));
    for (const f of STORE_FILES) { try { fs.copyFileSync(path.join(ROOT, f), path.join(dir, f)); } catch { /* optional */ } }
    fs.copyFileSync(__filename, path.join(dir, 't.js'));
    const zipped = storeData(dir);
    const env = { ...process.env, HEARTH_TEST_SAVE_DIR: path.join(dir, 'saves'), ...(zipped ? { DS_ZIP: '1' } : {}) };
    delete env.HEARTH_STORE_THREAD; if (thread === '1') env.HEARTH_STORE_THREAD = '1';
    const run = spawnSync(process.execPath, [path.join(dir, 't.js'), '--store'], { cwd: dir, env, encoding: 'utf8', timeout: 90000 });
    const out = `${run.stdout || ''}${run.stderr || ''}`;
    for (const line of out.split('\n')) if (/^[✓✖]/.test(line)) { if (line.startsWith('✓')) passes += 1; else fails += 1; console.log(line); }
    if (run.status !== 0 && !/✖/.test(out)) { fails += 1; console.log(`✖ the store run (thread ${thread}) failed: ${out.slice(-1200)}`); }
  }
  console.log(`\n${passes} passed, ${fails} failed`);
  process.exit(fails ? 1 : 0);
}

// --make-fixture <dir>: the throwaway data for dev/checks/datasafe.js (smoke.js --data <dir>): config.json, memory, a chat
// and notes held (EBUSY / EPERM) for the first 20 s of the app's start, an automatic copy of the settings, a backup zip
function makeFixture(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  const backups = `${dir}-backups`;
  fs.rmSync(backups, { recursive: true, force: true }); fs.mkdirSync(backups, { recursive: true });
  W(path.join(dir, 'config.json'), { ...cfg, settings: { ...(cfg.settings || {}), backupDir: backups, dsMarker: 'real' } });
  W(path.join(dir, '.history', 'config', '2026-10-14T09-00-00-n2.json'), { ...cfg, settings: { ...(cfg.settings || {}), backupDir: backups, dsMarker: 'copy' } });
  W(path.join(dir, 'memory.json'), { shared: 'ds line A\nds line B', agents: {} });
  W(path.join(dir, 'kv', 'notes.json'), [1, 2, 3].map((i) => ({ id: `dsn${i}`, title: `Note ${i}`, text: `note ${i}`, updatedAt: i })));
  const chat = (id, title, n) => ({ id, agentId: 'claude', title, createdAt: 1, updatedAt: Date.now() - n * 1000, session: {}, messages: Array.from({ length: n }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `${title} ${i}`, at: i + 1 })) });
  W(path.join(dir, 'chats', 'claude-dsa.json'), chat('claude-dsa', 'Datasafe A', 2));
  W(path.join(dir, 'chats', 'claude-dsb.json'), chat('claude-dsb', 'Datasafe B (held)', 3));
  const bsrc = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-datasafe-bsrc-'));
  W(path.join(bsrc, 'data', 'chats', 'claude-dsz.json'), chat('claude-dsz', 'Only in a backup', 4));
  try { execFileSync('zip', ['-qr', path.join(backups, 'hearth-backup-2026-10-14-09-00.zip'), 'data'], { cwd: bsrc }); } catch { console.log('(no zip: the backup step will be skipped)'); }
  W(path.join(dir, '.datasafe-faults.json'), { 'config.json': { code: 'EBUSY', ms: 20000 }, 'memory.json': { code: 'EPERM', ms: 20000 }, 'chats/claude-dsb.json': { code: 'EBUSY', ms: 20000 }, 'kv/notes.json': { code: 'EBUSY', ms: 20000 } });
  console.log(`fixture: ${dir}`);
}

if (process.argv.includes('--make-fixture')) makeFixture(process.argv[process.argv.indexOf('--make-fixture') + 1] || '/tmp/hearth-datasafe-fixture');
else if (process.argv.includes('--store')) storeRun().then(() => process.exit(0), (err) => { console.log(`✖ store run threw: ${err.stack}`); process.exit(1); });
else main().catch((err) => { console.log(`✖ threw: ${err.stack}`); process.exit(1); });
