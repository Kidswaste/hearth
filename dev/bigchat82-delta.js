// (round 82, bigchat82) part of dev/bigchat82-test.js: a giant chat saved by what changed (storework.js chatDelta,
// store.js saveChatDelta / openChat / saveChat with a version). Every write is compared byte for byte with what a whole
// save writes; versions that don't match, a file changed by someone else, a compact file, sync's guard: refused (the
// window saves whole). The window's side (native.js saveChat: its shape compare) is mirrored here by `diff`.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const { spawnSync } = require('child_process');

// what native.js sends: the keys in order, the fields that changed, the messages that changed / are new
function diff(prev, chat) {
  const keys = Object.keys(chat); const set = {};
  for (const k of keys) if (k !== 'messages' && JSON.stringify(prev[k]) !== JSON.stringify(chat[k])) set[k] = chat[k];
  const msgs = [];
  chat.messages.forEach((m, k) => { if (k >= prev.messages.length || JSON.stringify(prev.messages[k]) !== JSON.stringify(m)) msgs.push([k, m]); });
  return { keys, set, n: chat.messages.length, msgs };
}
const clone = (v) => JSON.parse(JSON.stringify(v));

module.exports = async function delta({ ok, chatOf, message, rnd, int, ROOT }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bigchat82-delta-'));
  const file = path.join(dir, 'giant.json');
  const w = new Worker(path.join(ROOT, 'storework.js'), { workerData: { deltaSab: new SharedArrayBuffer(4) } });
  let seq = 0; const jobs = new Map();
  w.on('message', ({ id, res, err }) => { const j = jobs.get(id); jobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res); });
  const op = (msg) => new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); w.postMessage({ ...msg, id }); });
  try {
    let chat = chatOf(200);
    fs.writeFileSync(file, JSON.stringify(chat, null, 2));
    const o = await op({ op: 'chatOpen', file, ver: 'v0', part: 65536 });
    ok(o.parts?.length > 1 && Buffer.concat(o.parts.map((u) => Buffer.from(u))).toString('utf8') === JSON.stringify(chat, null, 2), 'chatOpen: the file\'s bytes in parts, handed over');
    let ver = 'v0'; let good = 0; let n = 0;
    const steps = [
      (c) => { c.messages.push(message(c.messages.length)); c.updatedAt += 1; }, // a new message (the common one)
      (c) => { c.messages.push(message(c.messages.length), message(c.messages.length + 1)); },
      (c) => { c.messages[5].reaction = { emoji: '🔥', note: 'old one' }; }, // an old message changed in place
      (c) => { c.messages.splice(10, 3); }, // deleted from the middle
      (c) => { c.messages.length = c.messages.length - 4; }, // cut at the end
      (c) => { c.title = 'Renamed "giant"'; c.session = { id: 's2' }; }, // its own fields
      (c) => { delete c.pinned; c.compact = { index: 3, summary: 'x\ny' }; }, // a field gone, one added (at the end)
      (c) => { c.messages[c.messages.length - 1].text += ' (more)'; }, // the last reply grew
      (c) => { c.messages = c.messages.map((m) => ({ ...m })); }, // same content, new objects
      (c) => { c.style = undefined; c.messages.push(message(c.messages.length)); }, // a key whose value JSON leaves out (native.js: chat.style = undefined)
      (c) => { c.messages = []; },
      (c) => { c.messages.push(message(0)); },
    ];
    for (const step of steps) {
      const before = clone(chat); step(chat); n += 1;
      const d = diff(before, chat);
      const r = await op({ op: 'chatDelta', file, from: ver, to: `v${n}`, ...d });
      if (r.ok && fs.readFileSync(file, 'utf8') === JSON.stringify(chat, null, 2)) good += 1; else console.log('  delta step', n, JSON.stringify(r).slice(0, 200));
      ver = `v${n}`;
    }
    ok(good === steps.length, `chatDelta: ${good} / ${steps.length} saves byte for byte what a whole save writes`);
    // a random walk
    let walk = 0;
    for (let i = 0; i < 40; i++) {
      const before = clone(chat);
      const r0 = rnd();
      if (r0 < 0.5) chat.messages.push(message(chat.messages.length));
      else if (r0 < 0.7 && chat.messages.length) chat.messages[int(0, chat.messages.length - 1)].text += ' edit';
      else if (r0 < 0.8 && chat.messages.length > 2) chat.messages.splice(int(0, chat.messages.length - 2), 1);
      else chat.updatedAt += 1;
      const r = await op({ op: 'chatDelta', file, from: ver, to: `r${i}`, ...diff(before, chat) });
      ver = `r${i}`;
      if (r.ok && fs.readFileSync(file, 'utf8') === JSON.stringify(chat, null, 2)) walk += 1;
    }
    ok(walk === 40, `a random walk: ${walk} / 40 byte for byte`);
    // refusals
    const before = clone(chat); chat.messages.push(message(9));
    ok((await op({ op: 'chatDelta', file, from: 'nope', to: 'x', ...diff(before, chat) })).ok === false, 'another version: refused');
    const st = fs.statSync(file); fs.utimesSync(file, st.atime, new Date(st.mtimeMs + 5000));
    ok((await op({ op: 'chatDelta', file, from: ver, to: 'x2', ...diff(before, chat) })).why === 'changed', 'the file changed under it: refused');
    ok(fs.readFileSync(file, 'utf8') === JSON.stringify(before, null, 2), '…and nothing written');
    // a whole save with a version starts the chain again; a skipped identical one too
    let r = await op({ op: 'write', file, value: chat, chatDir: true, chatVer: 'w1' });
    const b2 = clone(chat); chat.messages.push(message(10));
    r = await op({ op: 'chatDelta', file, from: 'w1', to: 'w2', ...diff(b2, chat) });
    ok(r.ok && fs.readFileSync(file, 'utf8') === JSON.stringify(chat, null, 2), 'after a whole save with its version: by change again');
    await op({ op: 'write', file, value: chat, chatDir: true, chatVer: 'w2b' }); // (after a change by delta: written again, no hash kept)
    r = await op({ op: 'write', file, value: chat, chatDir: true, chatVer: 'w3' });
    ok(r.skipped, 'an identical whole save is skipped…');
    const b3 = clone(chat); chat.messages.push(message(11));
    r = await op({ op: 'chatDelta', file, from: 'w3', to: 'w4', ...diff(b3, chat) });
    ok(r.ok, '…and still starts the chain');
    r = await op({ op: 'write', file, value: chat, chatDir: true });
    ok((await op({ op: 'chatDelta', file, from: 'w4', to: 'w5', ...diff(chat, chat) })).ok === false, 'a whole save without a version (another writer): the chain ends');
    // two readers of the same bytes (the window, then someone else opening it): either's change applies, then only the new version
    await op({ op: 'chatOpen', file, ver: 'A' }); await op({ op: 'chatOpen', file, ver: 'B' });
    const b6 = clone(chat); chat.messages.push(message(13));
    r = await op({ op: 'chatDelta', file, from: 'A', to: 'A2', ...diff(b6, chat) });
    const r6 = await op({ op: 'chatDelta', file, from: 'B', to: 'B2', ...diff(b6, chat) });
    ok(r.ok && r6.ok === false && fs.readFileSync(file, 'utf8') === JSON.stringify(chat, null, 2), 'two readers: the first change applies, the other version is then refused');
    // a compact file (not laid out as the app writes it): refused, nothing written
    fs.writeFileSync(file, JSON.stringify(chat));
    await op({ op: 'chatOpen', file, ver: 'c0' });
    const b4 = clone(chat); chat.messages.push(message(12));
    r = await op({ op: 'chatDelta', file, from: 'c0', to: 'c1', ...diff(b4, chat) });
    ok(r.ok === false && r.why === 'layout' && fs.readFileSync(file, 'utf8') === JSON.stringify(b4), 'a compact file: refused (the window saves it whole)');
    // a change that doesn't fit (a new message missing): refused, the file untouched, no tmp left
    fs.writeFileSync(file, JSON.stringify(b4, null, 2));
    await op({ op: 'chatOpen', file, ver: 'd0' });
    r = await op({ op: 'chatDelta', file, from: 'd0', to: 'd1', keys: Object.keys(b4), set: {}, n: b4.messages.length + 2, msgs: [[b4.messages.length, message(1)]] });
    ok(r.ok === false && fs.readFileSync(file, 'utf8') === JSON.stringify(b4, null, 2) && !fs.existsSync(`${file}.w.tmp`), 'a change that doesn\'t fit: refused, nothing written, no temp file left');
    // the list's row after a change: from the head (no read back)
    const cdir = path.join(dir, 'chats'); fs.mkdirSync(cdir);
    const cf = path.join(cdir, 'giant.json'); const g = chatOf(50);
    fs.writeFileSync(cf, JSON.stringify(g, null, 2));
    await op({ op: 'list', dir: cdir });
    await op({ op: 'chatOpen', file: cf, ver: 'l0' });
    const b5 = clone(g); g.title = 'New title'; g.updatedAt = 99; g.messages.push(message(50));
    await op({ op: 'chatDelta', file: cf, from: 'l0', to: 'l1', ...diff(b5, g) });
    const list = await op({ op: 'list', dir: cdir });
    ok(list.length === 1 && list[0].title === 'New title' && list[0].updatedAt === 99, `the list's row follows (${list[0]?.title})`);
  } finally { await w.terminate(); }

  // ---------- through store.js (the thread on, as in the app) ----------
  const sdir = fs.mkdtempSync(path.join(os.tmpdir(), 'bigchat82-store-'));
  for (const f of ['store.js', 'scenesafe-core.js', 'datasafe-core.js', 'storework.js', 'fswalk.js', 'sync-merge.js', 'sync-hard.js', 'kvops.js', 'bigchat-core.js', 'recall-core.js', 'projfind-core.js']) fs.copyFileSync(path.join(ROOT, f), path.join(sdir, f));
  const inside = path.join(sdir, 't.js');
  fs.writeFileSync(inside, `
    const fs = require('fs'); const path = require('path');
    const out = {};
    const store = require('./store.js');
    const chat = { id: 'claude-giant', agentId: 'claude', title: 'G', updatedAt: 1, messages: Array.from({ length: 400 }, (_, k) => ({ role: k % 2 ? 'assistant' : 'user', text: 'x'.repeat(12000) + k, at: k })) }; // (≈ 5 MB: two parts)
    (async () => {
      await store.saveChat(chat);
      const file = path.join(store.DATA_DIR, 'chats', 'claude-giant.json');
      const o = await store.openChat('claude-giant');
      const parts = []; for (let i = 0; i < (o.parts || 0); i++) parts.push(store.openPart(o.token, i));
      out.openBytes = o.parts > 1 && Buffer.concat(parts).toString() === fs.readFileSync(file, 'utf8') && store.openPart(o.token, 0) === null; // (parts of 4 MB; let go once all were fetched)
      chat.messages.push({ role: 'user', text: 'one more', at: 999 });
      const r = await store.saveChatDelta({ id: chat.id, from: o.ver, to: 'n1', keys: Object.keys(chat), set: {}, n: chat.messages.length, msgs: [[chat.messages.length - 1, chat.messages.at(-1)]] });
      out.delta = r.ok && fs.readFileSync(file, 'utf8') === JSON.stringify(chat, null, 2);
      // getChat after a change on its way sees it
      chat.messages.push({ role: 'assistant', text: 'reply', at: 1000 });
      const p = store.saveChatDelta({ id: chat.id, from: 'n1', to: 'n2', keys: Object.keys(chat), set: {}, n: chat.messages.length, msgs: [[chat.messages.length - 1, chat.messages.at(-1)]] });
      out.fresh = (await store.getChatFresh('claude-giant')).messages.length === chat.messages.length; await p;
      // sync's guard wants this chat (it just arrived): refused (the window saves it whole, through the guard)
      store.setBeforeWrite((f, v) => v, (f) => f === file);
      out.guard = (await store.saveChatDelta({ id: chat.id, from: 'n2', to: 'n3', keys: Object.keys(chat), set: {}, n: chat.messages.length, msgs: [] })).ok === false;
      // …and a whole save then carries no version (the next change is whole too)
      await store.saveChat(chat, { ver: 'g1' });
      out.guardNoVer = (await store.saveChatDelta({ id: chat.id, from: 'g1', to: 'g2', keys: Object.keys(chat), set: {}, n: chat.messages.length, msgs: [] })).ok === false;
      store.setBeforeWrite(null);
      await store.saveChat(chat, { ver: 'h1' });
      chat.messages.push({ role: 'user', text: 'quit right after', at: 1001 });
      store.saveChatDelta({ id: chat.id, from: 'h1', to: 'h2', keys: Object.keys(chat), set: {}, n: chat.messages.length, msgs: [[chat.messages.length - 1, chat.messages.at(-1)]] });
      store.flushSync(); // quitting: the change on its way lands first
      out.quit = fs.readFileSync(file, 'utf8') === JSON.stringify(chat, null, 2);
      console.log(JSON.stringify(out));
      process.exit(0);
    })();`);
  const res = spawnSync(process.execPath, [inside], { cwd: sdir, env: { ...process.env, HEARTH_STORE_THREAD: '1', HEARTH_BIGCHAT_MIN: '100000' }, encoding: 'utf8', timeout: 60000 });
  let out = {}; try { out = JSON.parse(res.stdout.trim().split('\n').pop()); } catch { console.log(res.stdout, res.stderr); }
  ok(out.openBytes, 'store.openChat: a giant chat comes as its bytes');
  ok(out.delta, 'store.saveChatDelta: written by change, byte for byte');
  ok(out.fresh, 'a read right after a change on its way sees it');
  ok(out.guard, 'sync\'s guard wants the chat: refused');
  ok(out.guardNoVer, '…and the whole save then starts no chain');
  ok(out.quit, 'quit right after a change: it lands first');
  fs.rmSync(sdir, { recursive: true, force: true });
  fs.rmSync(dir, { recursive: true, force: true });
  return null;
};
