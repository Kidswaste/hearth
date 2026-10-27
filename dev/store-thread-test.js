#!/usr/bin/env node
// The store thread (round 20, offmain; store.js + storework.js + fswalk.js), no Electron: the three files are copied to
// a temp folder (store.js keeps its data next to itself, so real data is never touched) and run with the thread on
// (HEARTH_STORE_THREAD=1). Saves read back before they land, the chats list / search give the same results as the
// synchronous code, identical saves are skipped (no write, .prev kept), a file changed by someone else is written
// again, a deleted chat waits for its last save, big kv reads parse on the thread, folder search / listing run on
// the files thread, and quitting writes what is still pending.
//   node dev/store-thread-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

if (process.argv[2] !== '--inside') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-store-thread-'));
  for (const f of ['store.js', 'scenesafe-core.js', 'datasafe-core.js', 'storework.js', 'fswalk.js', 'sync-merge.js']) fs.copyFileSync(path.join(__dirname, '..', f), path.join(dir, f));
  fs.copyFileSync(__filename, path.join(dir, 't.js'));
  const r = spawnSync(process.execPath, [path.join(dir, 't.js'), '--inside'], { cwd: dir, env: { ...process.env, HEARTH_STORE_THREAD: '1', HEARTH_TEXT_IDLE_MS: '1500' }, stdio: 'inherit', timeout: 60000 });
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(r.status ?? 1);
}

let passes = 0; let failures = 0;
const ok = (cond, what) => { if (cond) passes += 1; else { failures += 1; console.log(`FAIL ${what}`); } };
const store = require(path.join(process.cwd(), 'store.js'));
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
(async () => {
  const W = 'orb shader neon rose tempo kick'.split(' ');
  const chat = (c, extra = '') => ({ id: `c${c}`, agentId: 'a', title: `Chat ${c}`, updatedAt: 1000 + c, messages: Array.from({ length: 50 }, (_, i) => ({ role: 'user', text: `${W[(c + i) % 6]} ${W[(c + i + 1) % 6]} Hello${c === 7 && i === 3 ? ' ZebraCorn' : ''}${extra}` })) });
  for (let c = 0; c < 30; c++) store.saveChat(chat(c));
  ok(store.getChat('c7')?.title === 'Chat 7', 'a save reads back before it lands');
  const list = await store.listChats();
  ok(list.length === 30 && list[0].id === 'c29', `list: ${list.length} ${list[0]?.id}`);
  // (round 34, lightweight) saves and lists hold no chat texts on the thread; a search reads them in (below)
  ok((await store.idle())?.textChars === 0, 'no chat texts held before a search')
  const hits = await store.searchChats('zebracorn');
  ok(hits.length === 1 && hits[0].id === 'c7' && /ZebraCorn/.test(hits[0].snippet), `search: ${JSON.stringify(hits[0])}`);
  // the thread and the synchronous code agree
  const q = 'neon rose';
  const offHits = await store.searchChats(q);
  ok(offHits.length > 0 && JSON.stringify(offHits) === JSON.stringify(store._sync.search(q)), 'same hits as the synchronous search');
  ok(JSON.stringify(await store.listChats()) === JSON.stringify(store._sync.list()), 'same list as the synchronous one');
  ok((await store.idle())?.textChars > 0, 'texts kept while searching');
  await new Promise((r) => setTimeout(r, 1900));
  ok((await store.idle())?.textChars === 0, 'texts let go after a while without a search');
  ok(JSON.stringify(await store.searchChats(q)) === JSON.stringify(offHits), 'the same hits once they were let go');
  const kv = path.join(store.DATA_DIR, 'kv');
  // kv: .prev copy, skip identical
  store.setKV('big', { a: 1 }); store.setKV('big', { a: 2 }); await store.idle();
  ok(J(path.join(kv, 'big.json')).a === 2 && J(path.join(kv, 'big.prev.json')).a === 1, 'kv saved with its .prev');
  // (round 35, bugbash2) a save's promise settles only once the file holds it (hub.kvSet is awaitable until on disk)
  for (let i = 0; i < 20; i++) {
    const p = store.setKV('awaited', { i, pad: 'x'.repeat(2e5) });
    ok(p && typeof p.then === 'function', 'setKV returns a promise');
    await p;
    ok(J(path.join(kv, 'awaited.json')).i === i, `awaited setKV ${i} is on disk`);
  }
  const m0 = fs.statSync(path.join(kv, 'big.json')).mtimeMs;
  await new Promise((r) => setTimeout(r, 30));
  store.setKV('big', { a: 2 }); await store.idle();
  ok(fs.statSync(path.join(kv, 'big.json')).mtimeMs === m0 && J(path.join(kv, 'big.prev.json')).a === 1, 'an identical save is skipped (and .prev kept)');
  fs.writeFileSync(path.join(kv, 'big.json'), '{"a":3}');
  store.setKV('big', { a: 2 }); await store.idle();
  ok(J(path.join(kv, 'big.json')).a === 2, 'a file changed by someone else is written again');
  // a chat changed on disk (sync) is read again by the list
  const f3 = path.join(store.DATA_DIR, 'chats', 'c3.json');
  const c3 = J(f3); c3.title = 'Renamed'; c3.updatedAt = 99999; fs.writeFileSync(f3, JSON.stringify(c3));
  ok((await store.listChats())[0].title === 'Renamed', 'changed chat file re-read');
  // delete after a pending save
  store.saveChat({ id: 'gone', agentId: 'a', title: 'x', updatedAt: 1, messages: [] });
  await store.deleteChat('gone');
  ok(!fs.existsSync(path.join(store.DATA_DIR, 'chats', 'gone.json')) && (await store.listChats()).length === 30, 'a deleted chat stays deleted after its last save');
  // big kv read parsed on the thread
  store.setKV('huge', Array.from({ length: 2000 }, (_, i) => ({ i, s: 'x'.repeat(400) })));
  ok(store.getKVOff('huge').length === 2000, 'pending big store reads back');
  await store.idle();
  const huge = await store.getKVOff('huge');
  ok(huge.length === 2000 && huge[1999].i === 1999, 'big store read on the thread');
  // folder search / listing on the files thread (same as in place)
  const ws = path.join(store.DATA_DIR, 'ws'); fs.mkdirSync(path.join(ws, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'a.md'), 'hello forge\nanvil here'); fs.writeFileSync(path.join(ws, 'sub', 'b.md'), 'anvil anvil');
  const fsw = require(path.join(process.cwd(), 'fswalk.js'));
  const off = await store.runOff('fsearch', { dir: ws, q: 'anvil', opts: {} });
  ok(JSON.stringify(off) === JSON.stringify(fsw.search(ws, 'anvil')) && off.length === 2 && off[0].count === 2, `folder search: ${JSON.stringify(off).slice(0, 120)}`);
  const offList = await store.runOff('flist', { dir: ws, opts: { recursive: true } });
  ok(offList.length === 3, `folder listing: ${offList.length}`);
  // cloud sync's big-store hash on the thread = the engine's own (cloud form of the value, then sha1)
  {
    const S = require(path.join(process.cwd(), 'sync-merge.js'));
    const ctx = S.withExt({ dataDir: store.DATA_DIR, cloudRoot: '/cloud', home: os.homedir(), win: false, aliases: { data: [], cloud: [], home: [] } }, {});
    const file = path.join(kv, 'paths.json');
    fs.writeFileSync(file, JSON.stringify({ a: path.join(store.DATA_DIR, 'captures', 'x.mp4'), b: [1, 2], c: 'plain' }, null, 2));
    const r = await store.runOff('syncHash', { file, rel: 'kv/paths.json', cloud: false, ctx });
    const t = JSON.stringify(S.toCloud(J(file), ctx));
    ok(r.h === require('crypto').createHash('sha1').update(t).digest('hex') && r.t === t && /captures/.test(t), `sync hash on the thread: ${r.t}`);
    fs.writeFileSync(file,'\uFEFF'+fs.readFileSync(file,'utf8'));
    const bom=await store.runOff('syncHash',{file,rel:'kv/paths.json',cloud:false,ctx});
    ok(bom.h===r.h && bom.t===t,'UTF-8 BOM exports hash identically on the worker');
    fs.writeFileSync(file, '{ broken');
    ok((await store.runOff('syncHash', { file, rel: 'kv/paths.json', cloud: true, ctx: null })).bad === true, 'a half-written store is reported, not hashed');
  }
  // (round 73, startfast73) the list's rows kept on disk (data/.cache/chat-list.json) between starts: a new thread reuses
  // the row of a file that kept its size and times (no read), and reads a file that changed
  {
    const cache = path.join(store.DATA_DIR, '.cache', 'chat-list.json');
    await store.listChats(); await new Promise((r) => setTimeout(r, 3400));
    const j = fs.existsSync(cache) ? J(cache) : null;
    ok(j?.v === 1 && j.rows['c7.json']?.sum?.title === 'Chat 7', `list rows kept on disk: ${Object.keys(j?.rows || {}).length}`);
    j.rows['c7.json'].sum.title = 'Kept row'; j.rows['c8.json'].sum.title = 'Stale row';
    fs.writeFileSync(cache, JSON.stringify(j));
    const c8 = path.join(store.DATA_DIR, 'chats', 'c8.json'); const t = new Date(Date.now() + 5000); fs.utimesSync(c8, t, t);
    const r = spawnSync(process.execPath, ['-e', "require('./store.js').listChats().then((l) => { console.log(JSON.stringify(l)); process.exit(0); })"], { cwd: process.cwd(), env: process.env, encoding: 'utf8', timeout: 20000 });
    let l2 = []; try { l2 = JSON.parse(String(r.stdout || '').trim().split('\n').pop() || '[]'); } catch { /* reported below */ }
    ok(l2.find((x) => x.id === 'c7')?.title === 'Kept row', `a new thread lists an unchanged chat from its kept row (no read): ${l2.find((x) => x.id === 'c7')?.title} ${r.stderr || ''}`);
    ok(l2.find((x) => x.id === 'c8')?.title === 'Chat 8', 'a chat whose file changed is read again');
    ok(l2.length === (await store.listChats()).length, `the same chats as the running thread: ${l2.length}`);
  }
  // (round 73, startfast73) a big list store's rows with a few fields (the Lab's scenes for Projects): on the thread for a
  // big file, in the main process for a small one; not a list → null (the caller reads it whole)
  {
    const big = Array.from({ length: 300 }, (_, i) => ({ id: `s${i}`, name: `Scene ${i}`, updatedAt: i, layers: [{ name: 'main', code: 'x'.repeat(4000) }] }));
    fs.writeFileSync(path.join(kv, 'three-sketches.json'), JSON.stringify(big));
    const r = await store.getKVPick('three-sketches', ['id', 'name', 'updatedAt']);
    ok(Array.isArray(r) && r.length === 300 && r[7].name === 'Scene 7' && r[7].updatedAt === 7 && !('layers' in r[7]), `pick on the thread: ${JSON.stringify(r?.[7])}`);
    fs.writeFileSync(path.join(kv, 'small-list.json'), JSON.stringify([{ id: 'a', name: 'A', code: 'x' }]));
    ok(JSON.stringify(await store.getKVPick('small-list', ['id', 'name'])) === '[{"id":"a","name":"A"}]', 'pick of a small store');
    ok((await store.getKVPick('big', ['id'])) === null, 'not a list: null');
  }
  // quitting writes what is still pending
  store.saveChat({ id: 'last', agentId: 'a', title: 'last', updatedAt: 1, messages: [] });
  store.flushSync();
  ok(J(path.join(store.DATA_DIR, 'chats', 'last.json')).title === 'last', 'pending save written on quit');
  const st = store.writerStats();
  ok(st.skipped >= 1 && st.fallbacks === 0, `writer stats ${JSON.stringify(st)}`);
  console.log(`store thread: ${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
