#!/usr/bin/env node
// (round 85, projbig85) a project holding a GIANT chat exported, imported and duplicated by the chat's NAME, and a giant
// version previewed by its part, each checked against the way before (throwaway folders only, made-up chats):
//   · export: the window's stand-in ({ __bigChat }) + projbundle-work.js reading the chat file = project.json byte for byte
//     what the window's whole chat + the old main-process code wrote (oldBody below, kept as the reference), the same
//     entries, counts and secrets removed; a chat that can't be read / isn't there → the export stops, no file, no .part
//   · chatsInfo: missing / small / unreadable / big (its own fields in key order, its count, its paths)
//   · import: peek = the old peek (lines, counts, skipped); unpack → the big chat's messages in a part file, the rest of
//     the body = the old body; adopt (storework.js chatAdopt) writes the chat file the old whole save wrote, byte for
//     byte; refused over a chat that's there, for a part that isn't the job's, for a part that can't be read (nothing
//     written); release removes the parts
//   · Duplicate: adopt from the chat here = the old copy's whole save, byte for byte
//   · chatPeek (storework.js) / versionsmain read(token, { peek }): the same title, count and messages as the whole
//     parse, paged (to / count), plain and wrapped copies
//   · secrets: a big chat's API keys and secret-named keys never reach the bundle
//   node dev/projbig85-test.js [--bench]      (--bench: the main-process / window times on /tmp/hearth-bigchat84's giant chat)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { Worker } = require('worker_threads');
const ROOT = path.join(__dirname, '..');
const BENCH = process.argv.includes('--bench');
if (!BENCH) process.env.HEARTH_BIGCHAT_MIN = '20000';
const C = require(path.join(ROOT, 'projbundle-core.js'));
const M = require(path.join(ROOT, 'projbundlemain.js'));
const zipkit = require(path.join(ROOT, 'zipkit.js'));
const V = require(path.join(ROOT, 'versionsmain.js'));

let passes = 0; let failures = 0;
const ok = (cond, what) => { if (cond) passes += 1; else { failures += 1; console.log(`FAIL ${what}`); } };
let seed = 85;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const pick = (a) => a[Math.floor(rnd() * a.length)];
const KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789';
const WORDS = ['orb', 'café', '日本語', '🔥', 'quote"inside', 'back\\slash', 'line\nbreak', '**bold**', '`code`', 'tab\there', 'ctrl\u0001x', 'lone\ud800x', '<b>&amp;</b>'];
const str = () => Array.from({ length: int(0, 12) }, () => pick(WORDS)).join(' ');
const W = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };

// ---------- the way before (projbundlemain.js exportBundle, round 75): the reference ----------
const statOf = (p) => { try { return fs.statSync(p); } catch { return null; } };
const safeBase = (s, n = 120) => String(s || 'file').split(/[\\/]/).filter(Boolean).pop()?.replace(/[<>:"|?*\u0000-\u001f\u007f]+/g, '_').replace(/^[.\s]+/, '').replace(/[ .]+$/, '').replace(/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i, '_$1$2').slice(0, n) || 'file';
const here = (p, dir = false) => { const st = statOf(p); return st && (dir ? st.isDirectory() || st.isFile() : st.isFile()) ? { path: p, dir: st.isDirectory() } : null; };
function oldBody(o) {
  const body = C.copy(o.body);
  const items = []; const map = new Map(); let n = 0;
  const entryFor = (kind, nm) => `${kind}/${n++}/${safeBase(nm)}`;
  const assetSrc = { ...body, files: undefined, project: { ...body.project, items: body.project.items.filter((x) => !C.KIND_ITEMS.includes(x.type)) } };
  for (const src of C.collectPaths(assetSrc)) { const h = here(src); if (!h) { map.set(src, ''); continue; } const entry = entryFor('assets', h.path); items.push(entry); map.set(src, C.tokenOf(entry)); }
  const itemRefs = new Map();
  for (const f of body.files || []) {
    const h = !f?.path || C.secretFile(f.path) ? null : here(f.path, true);
    if (!h) { itemRefs.set(f?.id, null); continue; }
    if (h.dir) { const top = entryFor('files', h.path); for (const x of M.walkDir(h.path)) items.push(`${top}/${x.rel.split('/').map((s) => safeBase(s, 160)).join('/')}`); itemRefs.set(f.id, C.tokenOf(top)); } else { const entry = entryFor('files', h.path); items.push(entry); itemRefs.set(f.id, C.tokenOf(entry)); }
  }
  let b2 = C.rewrite(body, (s) => (map.has(s) ? map.get(s) : s));
  b2.project.items = b2.project.items.filter((x) => !itemRefs.has(x.id) || itemRefs.get(x.id)).map((x) => (itemRefs.get(x.id) ? { ...x, ref: itemRefs.get(x.id), id: `${x.type}:${itemRefs.get(x.id)}` } : x));
  if (b2.project.cover && !b2.project.items.some((x) => x.id === b2.project.cover)) { const was = body.project.items.find((x) => x.id === b2.project.cover); b2.project.cover = was && itemRefs.get(was.id) ? `${was.type}:${itemRefs.get(was.id)}` : null; }
  b2.files = (b2.files || []).filter((f) => itemRefs.get(f.id)).map((f) => ({ id: `${f.type}:${itemRefs.get(f.id)}`, type: f.type, name: f.name || '', dir: Boolean(f.dir), path: itemRefs.get(f.id) }));
  b2 = JSON.parse(JSON.stringify(b2));
  return { text: JSON.stringify(b2), counts: C.summarize(b2), items };
}
// one entry's bytes out of a zip (inflated), and the entries' names
async function entryOf(file, name) {
  const e = (await zipkit.entries(file)).find((x) => x.name === name);
  const fd = fs.openSync(file, 'r');
  try {
    const lh = Buffer.alloc(30); fs.readSync(fd, lh, 0, 30, e.offset);
    const raw = Buffer.alloc(e.csize); fs.readSync(fd, raw, 0, e.csize, e.offset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28));
    return { data: e.method === 8 ? zlib.inflateRawSync(raw) : raw, method: e.method, crc: e.crc, csize: e.csize };
  } finally { fs.closeSync(fd); }
}
const namesOf = async (file) => (await zipkit.entries(file)).filter((e) => !e.dir).map((e) => e.name);

// ---------- the store thread (storework.js), as store.js runs it ----------
function thread() {
  const w = new Worker(path.join(ROOT, 'storework.js'));
  let seq = 0; const jobs = new Map();
  w.on('message', ({ id, res, err }) => { const j = jobs.get(id); jobs.delete(id); if (err) j.reject(new Error(err)); else j.resolve(res); });
  return { op: (msg) => new Promise((resolve, reject) => { const id = ++seq; jobs.set(id, { resolve, reject }); w.postMessage({ ...msg, id }); }), end: () => w.terminate() };
}

// ---------- made-up data ----------
function message(k, src) {
  const m = { role: pick(['user', 'assistant', 'assistant', 'opinion']), text: str(), at: 1.7e12 + k * 6e4 };
  if (m.role === 'opinion') m.from = pick(['Astra', 'Claude']);
  if (rnd() < 0.3) m.thinking = str();
  if (rnd() < 0.2) m.tools = [{ name: 'Read', input: { path: '/nowhere/b.js' } }];
  if (k === 7) m.attachments = [{ kind: 'image', name: 'a.png', path: path.join(src, 'a.png') }];
  if (k === 9) m.text += ` my key is ${KEY}`;
  if (k === 11) m.meta = { token: 'abc123', apiKey: 'zzz', keep: 'this' };
  if (k === 13) m.attachments = [{ kind: 'file', name: 'b.wav', path: path.join(src, 'b.wav') }, { kind: 'file', name: '.env', path: path.join(src, '.env') }];
  return m;
}
function makeChat(id, n, src, extra = {}) { return { id, agentId: 'claude', title: `Giant ${id}`, createdAt: 1.7e12, updatedAt: 1.71e12, session: { id: 's1' }, lastReply: { x: 1 }, model: 'x', ...extra, messages: Array.from({ length: n }, (_, k) => message(k, src)) }; }
function projectBody(src, chats) {
  return {
    project: { id: 'pj1', name: 'Giant project', notes: 'notes', at: 1, items: [{ id: 'scene:s1', type: 'scene', ref: 's1', name: 'S1' }, ...chats.map((c) => ({ id: `chat:${c.id}`, type: 'chat', ref: c.id, name: c.title })), { id: `file:${path.join(src, 'c.txt')}`, type: 'file', ref: path.join(src, 'c.txt'), name: 'c.txt' }], workspace: { chatId: chats[0]?.id, sceneId: 's1' }, cover: 'scene:s1' },
    scenes: [{ id: 's1', sketch: { id: 's1', name: 'S1', code: '// hi' }, extras: null, refs: [{ id: 'r1', key: 'tex', name: 'a', path: path.join(src, 'a.png'), src: '/other/a.png' }], notes: [], thumb: null, maps: {} }],
    sequences: [], boards: [],
    chats: chats.map((c) => ({ id: c.id, agent: { id: 'claude', engine: '', dock: '', name: 'Claude' }, chat: c, scene: 's1', board: null })),
    workbench: null,
    files: [{ id: `file:${path.join(src, 'c.txt')}`, type: 'file', ref: path.join(src, 'c.txt'), name: 'c.txt', path: path.join(src, 'c.txt') }],
  };
}
// deterministic fresh ids (the window's ids check what exists; the same here both ways)
const idsFor = (tag = 'new') => { let n = 0; return { project: () => 'pjNEW', scene: () => `sNEW${n++}`, board: () => `bNEW${n++}`, chat: (_o, a) => `${a}-${tag}${n++}`, ref: () => `rNEW${n++}`, note: () => `nNEW${n++}`, seqKey: (nm) => `seq:${nm}` }; };

async function main() {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'projbig85-'));
  const T = thread();
  try {
    const dataDir = path.join(TMP, 'data'); const src = path.join(TMP, 'src'); const OUT = path.join(TMP, 'out'); fs.mkdirSync(OUT, { recursive: true });
    W(path.join(src, 'a.png'), Buffer.from([137, 80, 78, 71, 1, 2, 3])); W(path.join(src, 'b.wav'), 'RIFF....'); W(path.join(src, '.env'), 'TOKEN=nope'); W(path.join(src, 'c.txt'), 'hello');
    const giant = makeChat('claude-giant', 400, src);
    const small = makeChat('claude-small', 3, src, { title: 'Small one' });
    W(path.join(dataDir, 'chats', `${giant.id}.json`), JSON.stringify(giant, null, 2));
    W(path.join(dataDir, 'chats', `${small.id}.json`), JSON.stringify(small, null, 2));
    W(path.join(dataDir, 'chats', 'claude-broken.json'), `{"id":"claude-broken","messages":[${'{"role":"user","text":"x"},'.repeat(1200)}`);
    let idles = 0;
    M._set({ dataDir, idle: async () => { idles += 1; }, adoptChat: (a) => T.op({ op: 'chatAdopt', ...a }) });
    ok(fs.statSync(path.join(dataDir, 'chats', `${giant.id}.json`)).size >= 20000, 'the giant chat is past the (test) threshold');

    // ---------- chatsInfo ----------
    const info = await M.chatsInfo([giant.id, small.id, 'claude-gone', 'claude-broken', '../x']);
    ok(info[giant.id]?.state === 'big' && info[giant.id].n === 400 && JSON.stringify(Object.keys(info[giant.id].head)) === JSON.stringify(Object.keys(giant)) && info[giant.id].head.messages.length === 0 && info[giant.id].head.title === giant.title, 'chatsInfo: a big chat → its own fields (key order kept, messages: [] in place) and its count');
    ok(info[giant.id].paths.includes(path.join(src, 'a.png')) && info[giant.id].paths.includes(path.join(src, 'b.wav')) && !info[giant.id].paths.some((p) => p.endsWith('.env')), 'chatsInfo: the paths it points at (secret files never)');
    ok(info[small.id]?.state === 'small' && info['claude-gone']?.state === 'missing' && info['claude-broken']?.state === 'unreadable' && !info['../x'] && idles >= 1, 'chatsInfo: small / missing / unreadable (never "no chat"); a name Hearth refuses isn\'t looked at; saves on their way land first');

    // ---------- export: old (the window's whole chat) vs new (by name) ----------
    const full = projectBody(src, [giant, small]);
    const prepOld = C.prepare({ ...C.copy(full), away: undefined }, { chats: true, files: true });
    const stand = { ...info[giant.id].head, __bigChat: { id: giant.id, n: 400, size: 1, paths: info[giant.id].paths } };
    const lite = projectBody(src, [stand, small]);
    const bare = lite.chats.map((c) => (c.chat?.__bigChat ? { ...c, chat: { __bigChat: { id: c.chat.__bigChat.id }, messages: [] } } : c));
    const prepNew = C.prepare({ ...C.copy(lite), chats: bare, away: undefined }, { chats: true, files: true });
    ok(JSON.stringify(prepNew.body).length < 20000, `the window sends a small body (${JSON.stringify(prepNew.body).length} characters, the old one ${JSON.stringify(prepOld.body).length})`);
    const want = oldBody({ body: prepOld.body });
    const rNew = await M.exportBundle({ body: prepNew.body, name: 'Giant new', job: 'x1', leftOut: prepNew.leftOut, secrets: prepNew.secrets, out: path.join(OUT, 'new.hearthproject') });
    const rFull = await M.exportBundle({ body: prepOld.body, name: 'Giant full', job: 'x2', leftOut: prepOld.leftOut, secrets: prepOld.secrets, out: path.join(OUT, 'full.hearthproject') });
    const bNew = await entryOf(rNew.path, C.BODY); const bFull = await entryOf(rFull.path, C.BODY);
    ok(rNew.ok && bNew.data.toString('utf8') === want.text, `export: project.json byte for byte the old way (${bNew.data.length} / ${want.text.length} bytes)`);
    ok(rFull.ok && bFull.data.toString('utf8') === want.text && bFull.crc === bNew.crc && bFull.csize === bNew.csize && bNew.method === 8, 'export: the same deflated entry (CRC, size) whether the window sent the chat whole or by name');
    const raw = Buffer.from(want.text); const comp = zlib.deflateRawSync(raw, { level: 6 }); const eNew = await zipkit.entries(rNew.path); const be = eNew.find((e) => e.name === C.BODY);
    ok(be.csize === comp.length && be.crc === zipkit.crc32(raw), 'export: deflated as the old one-shot deflateRaw (level 6)');
    const names = await namesOf(rNew.path);
    ok(JSON.stringify(names) === JSON.stringify([C.MANIFEST, C.BODY, ...want.items]) && JSON.stringify(await namesOf(rFull.path)) === JSON.stringify(names), `export: the same entries in the same order (${names.length})`);
    const mNew = JSON.parse((await entryOf(rNew.path, C.MANIFEST)).data); const mFull = JSON.parse((await entryOf(rFull.path, C.MANIFEST)).data);
    ok(mNew.secrets === prepOld.secrets && mFull.secrets === prepOld.secrets && prepOld.secrets >= 3 && JSON.stringify(mNew.counts) === JSON.stringify(want.counts) && mNew.counts.messages === 403, `export: the manifest's counts and secrets removed are the old ones (${mNew.secrets} secrets, ${mNew.counts.messages} messages)`);
    ok(!want.text.includes(KEY) && !want.text.includes('abc123') && !/"session":\{"id"/.test(want.text) && !want.text.includes('lastReply') && !names.some((n) => n.endsWith('.env')), 'export: no key, no secret-named value, no engine session, no secret file in the bundle');
    // refusals: nothing written
    const refuse = async (id, out) => {
      const body = C.prepare({ ...projectBody(src, [small]), chats: [{ id, agent: { id: 'claude' }, chat: { __bigChat: { id }, messages: [] }, scene: null, board: null }], away: undefined }).body;
      try { await M.exportBundle({ body, name: 'X', job: `r${id}`, out }); return 'written'; } catch (err) { return err.code || err.message; }
    };
    const outB = path.join(OUT, 'broken.hearthproject'); const outG = path.join(OUT, 'gone.hearthproject');
    const why1 = await refuse('claude-broken', outB); const why2 = await refuse('claude-gone', outG); const why3 = await refuse('../../etc', path.join(OUT, 'bad.hearthproject'));
    ok(why1 === 'EHELD' && !fs.existsSync(outB) && !fs.existsSync(`${outB}.part`), `export: a big chat that can't be read stops it, nothing written (${why1})`);
    ok(why2 === 'EGONE' && !fs.existsSync(outG) && !fs.existsSync(`${outG}.part`), `export: a big chat that isn't there stops it, nothing written (${why2})`);
    ok(why3 !== 'written' && !fs.existsSync(path.join(OUT, 'bad.hearthproject')), 'export: a chat name Hearth refuses stops it');

    // ---------- import ----------
    const pvNew = await M.peek(rNew.path); const pvOld = await M.peekHere(rNew.path, { body: true });
    ok(pvNew.ok && JSON.stringify(pvNew.lines) === JSON.stringify(pvOld.lines) && JSON.stringify(pvNew.counts) === JSON.stringify(pvOld.counts) && JSON.stringify(pvNew.manifest) === JSON.stringify(pvOld.manifest) && pvNew.unpacked === pvOld.unpacked && !pvNew.body, 'import: the card (peek on the thread) says what the old peek said, without a body');
    const u = await M.unpack({ file: rNew.path, job: 'u1' });
    ok(u.ok && u.parts === 'u1', 'import: unpacked, its big chat waiting in a part');
    const cBig = u.body.chats.find((c) => c.chat.__bigPart); const cSmall = u.body.chats.find((c) => !c.chat.__bigPart);
    ok(cBig && cBig.chat.messages.length === 0 && cSmall?.chat.messages.length === 3 && JSON.stringify(u.body).length < 20000, 'import: the body for the window is small (the big chat by its own fields, the small one whole)');
    const oldLocal = C.rewrite(pvOld.body, (s) => { const e = C.entryOfToken(s); return e == null ? s : path.join(u.dir, ...e.split('/')); });
    const partFile = path.join(M._partsDir(u.parts) || 'none', cBig.chat.__bigPart.key);
    const back = C.copy(u.body); { const c = back.chats.find((x) => x.chat.__bigPart); const ms = JSON.parse(fs.readFileSync(partFile, 'utf8')); const h = c.chat; delete h.__bigPart; h.messages = ms; }
    ok(JSON.stringify(back) === JSON.stringify(oldLocal), 'import: the body + the part = the old body (this computer\'s paths), key order included');
    // apply as the window does, both ways, with the same fresh ids
    const oldR = C.remap(oldLocal, { ids: idsFor() }); const newR = C.remap(C.copy(u.body), { ids: idsFor() });
    const oc = oldR.body.chats.find((c) => c.chat.title === giant.title); const nc = newR.body.chats.find((c) => c.chat.title === giant.title);
    const wantText = JSON.stringify({ ...oc.chat, id: oc.id, session: {} }, null, 2);
    const head = { ...nc.chat, id: nc.id, session: {} }; const key = head.__bigPart.key; delete head.__bigPart;
    const r1 = await M.adopt({ job: u.parts, part: key, id: nc.id, head });
    const got = r1.ok ? fs.readFileSync(path.join(dataDir, 'chats', `${nc.id}.json`), 'utf8') : '';
    ok(r1.ok && r1.n === 400 && got === wantText, `import: the chat written on the store thread = the old whole save, byte for byte (${got.length} / ${wantText.length})`);
    const r2 = await M.adopt({ job: u.parts, part: key, id: nc.id, head: { ...head, title: 'other' } });
    ok(!r2.ok && fs.readFileSync(path.join(dataDir, 'chats', `${nc.id}.json`), 'utf8') === got, 'import: never over a chat that\'s there');
    const r3 = await M.adopt({ job: 'nope', part: key, id: 'claude-x1', head }); const r4 = await M.adopt({ job: u.parts, part: '../../x.json', id: 'claude-x2', head });
    ok(!r3.ok && !r4.ok && !fs.existsSync(path.join(dataDir, 'chats', 'claude-x1.json')) && !fs.existsSync(path.join(dataDir, 'chats', 'claude-x2.json')), 'import: a part that isn\'t this import\'s is refused, nothing written');
    fs.writeFileSync(partFile, '[{"role":"user","text":"cut sho');
    const r5 = await M.adopt({ job: u.parts, part: key, id: 'claude-x3', head });
    ok(!r5.ok && r5.code === 'EHELD' && !fs.existsSync(path.join(dataDir, 'chats', 'claude-x3.json')), 'import: a part that can\'t be read → nothing written (never an empty chat)');
    const r6 = await M.adopt({ job: u.parts, part: key, id: '../evil', head });
    ok(!r6.ok, 'import: a chat name Hearth refuses is refused');
    ok(await M.release(u.parts) && !fs.existsSync(path.dirname(partFile)) && !(await M.release(u.parts)), 'import: release removes the parts (once)');
    await M.discard(u.dir);

    // ---------- Duplicate: from the chat here ----------
    const dupFull = C.remap(C.copy(projectBody(src, [giant])), { ids: idsFor('dup'), suffix: ' copy' });
    const dupLite = C.remap(C.copy(projectBody(src, [stand])), { ids: idsFor('dup'), suffix: ' copy' });
    const df = dupFull.body.chats[0]; const dl = dupLite.body.chats[0];
    const dWant = JSON.stringify({ ...df.chat, id: df.id, session: {} }, null, 2);
    const dh = { ...dl.chat, id: dl.id, session: {} }; const from = dh.__bigChat.id; delete dh.__bigChat;
    const d1 = await M.adopt({ chat: from, id: dl.id, head: dh });
    ok(d1.ok && fs.readFileSync(path.join(dataDir, 'chats', `${dl.id}.json`), 'utf8') === dWant, 'duplicate: the copy written on the store thread = the old whole save, byte for byte');
    const d2 = await M.adopt({ chat: 'claude-broken', id: 'claude-dup2', head: dh }); const d3 = await M.adopt({ chat: 'claude-gone', id: 'claude-dup3', head: dh });
    ok(!d2.ok && !d3.ok && !fs.existsSync(path.join(dataDir, 'chats', 'claude-dup2.json')) && !fs.existsSync(path.join(dataDir, 'chats', 'claude-dup3.json')), 'duplicate: a chat that can\'t be read / isn\'t there → nothing written');

    // ---------- Earlier versions' Preview of a giant version ----------
    const gf = path.join(dataDir, 'chats', `${giant.id}.json`);
    const p1 = await T.op({ op: 'chatPeek', file: gf });
    const slim = (m) => ({ role: m.role, from: m.from, text: String(m.text ?? '').slice(0, 4000) });
    ok(p1 && p1.n === 400 && p1.title === giant.title && p1.start === 100 && p1.end === 400 && JSON.stringify(p1.msgs) === JSON.stringify(giant.messages.slice(-300).map(slim)), 'chatPeek: the title, the count and the last 300 messages, as the whole parse');
    const p2 = await T.op({ op: 'chatPeek', file: gf, to: p1.start, count: 300 });
    ok(p2.start === 0 && p2.end === 100 && JSON.stringify(p2.msgs) === JSON.stringify(giant.messages.slice(0, 100).map(slim)), 'chatPeek: the earlier ones (to / count)');
    const vf = path.join(dataDir, '.versions', `chat-${giant.id}`, '2026-10-01T12-00-00-n0-before.json');
    const version = { ...giant, messages: giant.messages.slice(0, -10) };
    W(vf, JSON.stringify({ v: 1, kind: 'chat', id: giant.id, at: 1, machine: 'here', thing: version }));
    const p3 = await T.op({ op: 'chatPeek', file: vf, wrapped: true, count: 50 });
    ok(p3.n === 390 && JSON.stringify(p3.msgs) === JSON.stringify(version.messages.slice(-50).map(slim)), 'chatPeek: a wrapped copy (kept before a restore)');
    const inst = V.create({ dataDir, stateDir: path.join(dataDir, 'sync'), here: 'this computer', now: () => 1e13, digest: (a) => T.op({ op: 'chatDigest', ...a }), chatPeek: (a) => T.op({ op: 'chatPeek', ...a }) });
    const S = { kind: 'chat', id: giant.id };
    const listed = await inst.list(S);
    const e = listed.versions.find((x) => x.src === 'before');
    const pv = e && await inst.read(e.token, { peek: { count: 300 } });
    ok(pv?.__chatPeek?.n === 390 && pv.__chatPeek.msgs.length === 300 && pv.__chatPeek.msgs.at(-1).text === slim(version.messages.at(-1)).text, 'versions read(token, { peek }): only what the Preview shows');
    const whole = e && await inst.read(e.token);
    ok(whole?.messages?.length === 390 && !whole.__chatPeek, 'versions read(token): as before without peek');
  } finally { await T.end(); fs.rmSync(TMP, { recursive: true, force: true }); }
}

// ---------- --bench: the giant chat of /tmp/hearth-bigchat84 ----------
// the longest stretch this thread was held (a 2 ms timer's lateness) while fn ran
async function held(fn) {
  let max = 0; let last = performance.now();
  const t = setInterval(() => { const n = performance.now(); max = Math.max(max, n - last - 2); last = n; }, 2);
  const t0 = performance.now();
  const r = await fn();
  const ms = performance.now() - t0;
  await new Promise((res) => setTimeout(res, 10)); // (the timer's next tick sees a stretch held to the end)
  clearInterval(t);
  return { r, ms: Math.round(ms), held: Math.round(Math.max(max, 0)) };
}
async function bench() {
  const fix = '/tmp/hearth-bigchat84';
  if (!fs.existsSync(path.join(fix, '.versions'))) require('./bigchat84-fixture').make(fix);
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'projbig85-bench-'));
  try {
    const dataDir = path.join(TMP, 'data'); fs.mkdirSync(path.join(dataDir, 'chats'), { recursive: true });
    fs.copyFileSync(path.join(fix, 'chats', 'claude-giant0.json'), path.join(dataDir, 'chats', 'claude-giant0.json'));
    M._set({ dataDir, idle: async () => {} });
    const src = path.join(TMP, 'src'); W(path.join(src, 'c.txt'), 'x');
    const chat = JSON.parse(fs.readFileSync(path.join(dataDir, 'chats', 'claude-giant0.json'), 'utf8'));
    const t = (fn) => { const t0 = performance.now(); const r = fn(); return { r, ms: Math.round(performance.now() - t0) }; };
    // the window, before: the chat copied (gather), its size (the card), prepared (copy + scrub)
    const full = projectBody(src, [chat]);
    const w1 = t(() => C.copy(chat)); const w2 = t(() => C.chatBytes(full)); const w3 = t(() => C.prepare({ ...full, away: undefined }));
    console.log(`window before: copy ${w1.ms} ms · card size ${w2.ms} ms · prepare ${w3.ms} ms (one task each)`);
    const info = await held(() => M.chatsInfo(['claude-giant0']));
    const st = { ...info.r['claude-giant0'].head, __bigChat: { id: 'claude-giant0' } };
    const lite = projectBody(src, [st]);
    const w4 = t(() => C.prepare({ ...lite, chats: lite.chats.map((c) => ({ ...c, chat: { __bigChat: { id: 'claude-giant0' }, messages: [] } })), away: undefined }));
    console.log(`window after: prepare ${w4.ms} ms · the card's look (main process thread) ${info.ms} ms, this thread held ≤ ${info.held} ms`);
    const ob = await held(() => oldBody({ body: w3.r.body }));
    const od = t(() => zlib.deflateRawSync(Buffer.from(ob.r.text), { level: 6 }));
    console.log(`main before: the body (copy, rewrite, JSON) ${ob.ms} ms + crc / deflate (async) ≈ ${od.ms} ms, held ${ob.held} ms at once`);
    const ex = await held(() => M.exportBundle({ body: w4.r.body, name: 'B', job: 'b1', out: path.join(TMP, 'b.hearthproject') }));
    console.log(`main after: export ${ex.ms} ms, this thread held ≤ ${ex.held} ms`);
    const pvOld = await held(() => M.peekHere(path.join(TMP, 'b.hearthproject'), { body: true }));
    const pvNew = await held(() => M.peek(path.join(TMP, 'b.hearthproject')));
    console.log(`import card: before ${pvOld.ms} ms (held ${pvOld.held}) · after ${pvNew.ms} ms (held ≤ ${pvNew.held})`);
    const un = await held(() => M.unpack({ file: path.join(TMP, 'b.hearthproject'), job: 'b2' }));
    console.log(`unpack after: ${un.ms} ms, held ≤ ${un.held} ms; the body for the window ${JSON.stringify(un.r.body).length} characters`);
    await M.release('b2'); await M.discard(un.r.dir);
  } finally { fs.rmSync(TMP, { recursive: true, force: true }); }
}

(BENCH ? bench() : main()).then(() => {
  if (!BENCH) console.log(`projbig85-test: ${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}, (err) => { console.error(err); process.exit(1); });
