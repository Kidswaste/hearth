#!/usr/bin/env node
// (round 75, versions75) 🕘 Earlier versions: gathering and ordering (versions-core.js), the places versionsmain.js looks
// (store .prev / automatic copies, sync's base / set-asides / Deleted files / conflict copies / the cloud folder, "Keep
// both" copies, backup zips), restore safety (the version in place is always kept first; a failed keep or an unreadable
// current version changes nothing; Undo takes back only what the restore changed), Deleted things, and the two-computer
// simulator (dev/sync-sim.js): a restore on the PC while the Mac edits the same chat. Temp folders only.
//   node dev/versions75-test.js [--verbose]
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const Sim = require('./sync-sim');
Sim.install();
const S = require('../sync-merge');
const { createEngine } = require('../sync-engine');
const C = require('../versions-core');
const V = require('../versionsmain');
const Zip = require('../zipkit');

const VERBOSE = process.argv.includes('--verbose');
let failures = 0; let passes = 0;
const ok = (cond, what, detail) => { if (cond) passes += 1; else { failures += 1; console.log(`FAIL ${what}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 500)}` : ''}`); } };
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-versions75-'));
const raw = Sim.raw;
const msg = (id, text, at = 1000) => ({ id, role: id.startsWith('u') ? 'user' : 'assistant', text, at });
const chat = (id, msgs, extra = {}) => ({ id, agentId: 'claude', title: 'Plan', updatedAt: 1000, messages: msgs, ...extra });
const texts = (c) => (c?.messages || []).map((m) => m.text);
const put = (file, v, t) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof v === 'string' ? v : JSON.stringify(v, null, 2)); if (t) { const d = new Date(t); fs.utimesSync(file, d, d); } };
const read = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

async function core() {
  // what a thing is: times and the engine's session aren't
  const a = chat('c1', [msg('u1', 'hi')], { updatedAt: 1, session: { id: 'x' } });
  ok(C.hashOf('chat', a) === C.hashOf('chat', { ...a, updatedAt: 99, session: { id: 'y' } }), 'core: a copy that differs only in its save time / session is the same version');
  ok(C.hashOf('chat', a) !== C.hashOf('chat', chat('c1', [msg('u1', 'hi!')])), 'core: a word changed is another version');
  // the plain difference
  const many = Array.from({ length: 14 }, (_, i) => msg(`u${i}`, `m${i}`));
  ok(C.summary('chat', chat('c1', many.slice(0, 2)), chat('c1', many)) === '12 messages fewer', 'core: "12 messages fewer"', C.summary('chat', chat('c1', many.slice(0, 2)), chat('c1', many)));
  ok(C.summary('chat', chat('c1', many), chat('c1', many.slice(0, 13))) === '1 message more', 'core: "1 message more"');
  ok(/1 message worded differently/.test(C.summary('chat', chat('c1', [msg('u1', 'a')]), chat('c1', [msg('u1', 'b')]))), 'core: a message worded differently');
  ok(/title “Old”/.test(C.summary('chat', chat('c1', [], { title: 'Old' }), chat('c1', [], { title: 'New' }))), 'core: another title is named');
  const p = (notes, extra = {}) => ({ id: 'p1', name: 'Clink', status: 'active', notes, items: [], ...extra });
  ok(C.summary('project', p('a\nb\nc\nd'), p('a\nB\nC\nD\nd')) === 'notes: 3 lines changed', 'core: "notes: 3 lines changed"', C.summary('project', p('a\nb\nc\nd'), p('a\nB\nC\nD\nd')));
  ok(/2 things fewer/.test(C.summary('project', p('', { items: [] }), p('', { items: [{ id: 'a' }, { id: 'b' }] }))), 'core: project: "2 things fewer"');
  const sc = (code, extra = {}) => ({ id: 's1', name: 'Neon', layers: [{ id: 'main', name: 'main', code }], ...extra });
  ok(/code: 2 lines changed/.test(C.summary('scene', sc('a\nb\nc'), sc('a\nB\nC'))), 'core: scene: "code: 2 lines changed"', C.summary('scene', sc('a\nb\nc'), sc('a\nB\nC')));
  ok(/1 layer fewer/.test(C.summary('scene', sc('x'), { ...sc('x'), layers: [{ id: 'main', code: 'x' }, { id: 'l2', code: '' }] })), 'core: scene: "1 layer fewer"');
  ok(/5 items fewer/.test(C.summary('board', { name: 'B', items: [] }, { name: 'B', items: [1, 2, 3, 4, 5].map((i) => ({ id: `i${i}` })) })), 'core: board: "5 items fewer"');
  ok(/1 AI fewer/.test(C.summary('settings', { agents: [{ id: 'a' }], settings: {} }, { agents: [{ id: 'a' }, { id: 'b' }], settings: {} })) && /2 settings differ/.test(C.summary('settings', { agents: [], settings: { a: 1, b: 2 } }, { agents: [], settings: { a: 2, b: 3 } })), 'core: settings: AIs / settings differ');
  ok(C.summary('chat', a, { ...a, updatedAt: 5 }) === 'same as now', 'core: "same as now"');
  // one timeline: the same content in several places once (best place to read it from), the current one left out, newest first
  const cur = chat('c1', many);
  const cands = [
    { token: 't-backup', src: 'backup', label: 'daily backup', at: 5000, value: chat('c1', many.slice(0, 5), { updatedAt: 4000 }) },
    { token: 't-base', src: 'base', label: 'last synced version', at: 6000, value: chat('c1', many.slice(0, 5), { updatedAt: 4500 }) },
    { token: 't-copy', src: 'copy', label: 'automatic copy', at: 9000, value: chat('c1', many.slice(0, 10), { updatedAt: 8000 }) },
    { token: 't-same', src: 'prev', label: 'copy before the last save', at: 9500, value: { ...cur, updatedAt: 9400 } },
    { token: 't-old', src: 'trash', label: 'set aside by sync', at: 3000, value: chat('c1', many.slice(0, 1)) },
    { token: null, src: 'copy', label: 'no token', at: 1, value: chat('c1', []) },
  ];
  const g = C.gather('chat', cands, cur, { withSame: true });
  ok(g.list.length === 3 && g.same === 1, 'core: gather: 3 distinct versions, the one equal to now left out', g);
  ok(g.list.map((e) => e.token).join() === 't-copy,t-base,t-old', 'core: gather: newest first; base (local) preferred over a backup for the same content', g.list.map((e) => e.token));
  ok(g.list[1].also.includes('daily backup') && g.list[1].at === 4000, 'core: gather: the other places are named; when = the thing\'s own time (the earliest)', g.list[1]);
  ok(g.list[0].summary === '4 messages fewer', 'core: gather: each with its difference from now', g.list[0].summary);
  const merged = C.mergeLists(g.list.slice(0, 1), [{ ...g.list[1], key: g.list[0].key, label: 'daily backup', at: 7000 }, g.list[2]]);
  ok(merged.length === 2 && merged[0].also.includes('daily backup'), 'core: mergeLists: the backups\' list joins by content', merged);
  // what a restore writes
  const rv = C.restoreValue('chat', chat('c1', many.slice(0, 2), { agentId: 'old', session: { id: 's-old' } }), { ...cur, agentId: 'claude', session: { id: 's-now' } }, 77);
  ok(rv.id === 'c1' && rv.agentId === 'claude' && rv.updatedAt === 77 && !rv.session, 'core: restoreValue: chat keeps its id and AI, stamped now, the stale engine session dropped', rv);
  const rv2 = C.restoreValue('chat', { ...cur, title: 'Other' }, { ...cur, session: { id: 's-now' } }, 77);
  ok(rv2.session?.id === 's-now', 'core: restoreValue: same messages → the session stays');
  const store = { v: 1, list: [{ id: 'p1', name: 'A' }, { id: 'p2' }], trash: [{ id: 'p3' }] };
  const st2 = C.putInto('project', store, 'p1', { id: 'p1', name: 'B' });
  ok(st2.list[0].name === 'B' && store.list[0].name === 'A' && st2.list.length === 2, 'core: putInto replaces in place (a copy; the store passed in untouched)');
  const st3 = C.putInto('project', store, 'p3', { id: 'p3' });
  ok(st3.list[0].id === 'p3' && !st3.trash, 'core: putInto: a deleted project comes back out of its trash');
  ok(C.putInto('scene', [{ id: 's1', name: 'x' }], 's2', { id: 's2' }).length === 2, 'core: putInto: scenes');
  ok(!C.okId('chat', '../x') && !C.okId('nope', 'a') && C.okId('settings'), 'core: okId refuses a path or an unknown kind');
}

// ---------- the places, on one computer (no engine: the folders as sync leaves them) ----------
async function places() {
  const dir = path.join(ROOT, 'places');
  const data = path.join(dir, 'data'); const cloud = path.join(dir, 'cloud', 'Hearth'); const cfg = path.join(data, 'config.json');
  const many = Array.from({ length: 14 }, (_, i) => msg(`u${i}`, `m${i}`, 1000 + i));
  put(path.join(data, 'chats', 'c1.json'), chat('c1', many, { updatedAt: 9e12 }));
  put(path.join(data, 'sync', 'base', 'chats', 'c1.json'), chat('c1', many.slice(0, 10), { updatedAt: 5000 }), 6000);
  put(path.join(data, 'sync', 'base', 'chats', 'c1.json.prev'), chat('c1', many.slice(0, 8), { updatedAt: 4000 }), 6000);
  put(path.join(data, 'sync', 'trash', '2026-10-20', 'chats', 'c1.json'), chat('c1', many.slice(0, 3), { updatedAt: 3000 }), 3500);
  put(path.join(cloud, 'files', 'chats', 'c1.json'), chat('c1', many.concat(msg('u99', 'from the Mac', 2000)), { updatedAt: 9e12 + 1 }));
  put(path.join(cloud, 'trash', '2026-10-21', 'chats', '1a2b3c4d-c1.json'), chat('c1', many.slice(0, 2), { updatedAt: 2000 }), 2500);
  put(path.join(cloud, '.sync', 'conflicts', '2026-10-22-aaaabbbb.copy.json'), chat('c1', many.slice(0, 12), { title: 'Plan (Mac)', updatedAt: 7000 }));
  const rec = { id: '2026-10-22-aaaabbbb', rel: 'chats/c1.json', copy: '2026-10-22-aaaabbbb.copy.json', from: 'Studio Mac', fromPlatform: 'darwin', at: 7100, theirsAt: 7000, kind: 'json' };
  put(path.join(cloud, '.sync', 'conflicts', '2026-10-22-aaaabbbb.json'), rec);
  // a "Keep both" copy, a backup zip (one with the same content as the sync base: one entry)
  put(path.join(data, 'chats', 'c1-k.json'), chat('c1-k', many.slice(0, 6), { title: 'Plan (from Mac)' }));
  const stage = path.join(dir, 'stage'); put(path.join(stage, 'data', 'chats', 'c1.json'), chat('c1', many.slice(0, 10), { updatedAt: 5000 })); put(path.join(stage, 'config.json'), { agents: [{ id: 'claude' }], settings: { zoom: 1.4 } });
  put(path.join(stage, 'data', 'kv', 'projects.json'), { v: 1, list: [{ id: 'p1', name: 'Clink', notes: 'zip notes', items: [], ident: {} }] });
  const zipFile = path.join(dir, 'backups', 'Hearth-backup-2026-10-19.zip'); fs.mkdirSync(path.dirname(zipFile), { recursive: true });
  await Zip.writeZip(stage, zipFile);
  const stage2 = path.join(dir, 'stage2'); put(path.join(stage2, 'data', 'chats', 'c1.json'), chat('c1', many.slice(0, 4), { updatedAt: 1500 }));
  const zip2 = path.join(dir, 'backups', 'Hearth-backup-mac.zip'); await Zip.writeZip(stage2, zip2);
  // projects: the store, its .prev, its automatic copies
  const proj = (notes, extra = {}) => ({ v: 1, list: [{ id: 'p1', name: 'Clink', status: 'active', notes, items: [], ident: {}, updated: 100, ...extra }, { id: 'p2', name: 'Other', items: [], ident: {} }], dismissed: [] });
  put(path.join(data, 'kv', 'projects.json'), proj('line 1\nline 2\nline 3\nline 4'));
  put(path.join(data, 'kv', 'projects.prev.json'), proj('line 1\nline 2'));
  put(path.join(data, 'kv', '.history', 'projects', '2026-10-25T10-00-00-n2.json'), proj('line 1'));
  put(path.join(data, 'kv', '.history', 'projects', 'not-a-copy.json'), proj('ignored'));
  // settings: own config + a copy
  put(cfg, { agents: [{ id: 'claude' }, { id: 'astra' }], settings: { zoom: 1, enginePaths: { claude: '/Users/me/bin/claude' }, notify: true } });
  put(path.join(data, '.history', 'config', '2026-10-24T09-00-00-n1.json'), { agents: [{ id: 'claude' }], settings: { zoom: 1.2, enginePaths: { claude: 'C:\\Users\\pc\\claude.exe' }, notify: false } });

  const at = { now: 1e13 };
  const inst = V.create({ dataDir: data, configPath: cfg, stateDir: path.join(data, 'sync'), cloudDir: () => cloud, ctx: () => null, here: 'this Mac', now: () => at.now,
    conflicts: async () => [rec], incoming: (rel) => (rel === 'chats/c1.json' ? { from: 'Studio Mac' } : null),
    backups: async () => [{ path: zipFile, at: 5500, ok: true, mine: true }, { path: zip2, at: 1600, ok: true, mine: false, computer: 'Studio Mac' }, { path: path.join(dir, 'nope.zip'), at: 1, ok: true }, { path: zipFile, at: 1, ok: false }] });
  const S1 = { kind: 'chat', id: 'c1', also: ['c1-k'] };
  const l1 = await inst.list(S1, { phase: 'local' });
  const by = (l, src) => l.versions.filter((v) => v.src === src);
  ok(l1.exists && l1.name === 'Plan', 'places: the chat as it is now', l1);
  ok(by(l1, 'base').length === 2 && by(l1, 'trash').length === 1 && by(l1, 'cloudtrash').length === 1 && by(l1, 'conflict').length === 1 && by(l1, 'cloud').length === 1 && by(l1, 'keepboth').length === 1, 'places: base + the one before, set aside, Deleted files (prefixed name), the conflict, the cloud folder, the Keep both copy', l1.versions.map((v) => v.src));
  ok(by(l1, 'conflict')[0].machine === 'Studio Mac' && by(l1, 'cloud')[0].machine === 'Studio Mac' && by(l1, 'trash')[0].machine === 'this Mac' && by(l1, 'keepboth')[0].machine === 'Mac', 'places: which computer for each', l1.versions.map((v) => [v.src, v.machine]));
  ok(by(l1, 'cloud')[0].summary === '1 message more' && by(l1, 'base')[0].summary === '4 messages fewer', 'places: plain differences', l1.versions.map((v) => v.summary));
  const times = l1.versions.filter((v) => v.src !== 'keepboth' && v.src !== 'cloud').map((v) => v.at);
  ok(times.every((t, i) => !i || times[i - 1] >= t), 'places: newest first', times);
  const l2 = await inst.list(S1, { phase: 'backups' });
  ok(l2.versions.length === 2 && l2.versions.some((v) => v.machine === 'Studio Mac' && v.summary === '10 messages fewer'), 'places: backups: one file read out of each good zip (missing / damaged ones skipped), from which computer', l2.versions);
  const all = C.mergeLists(l1.versions, l2.versions);
  ok(all.length === l1.versions.length + 1 && all.find((v) => v.src === 'base' && v.also.includes('daily backup')), 'places: a backup holding the synced version is one entry ("+1 more")', all.map((v) => [v.src, v.also]));
  const pv = await inst.read(by(l1, 'conflict')[0].token);
  ok(pv?.title === 'Plan (Mac)' && texts(pv).length === 12, 'places: Preview reads a version by its token', pv?.title);
  ok(await inst.read('../../etc/passwd') === null && await inst.read(null) === null, 'places: a token the window made up reads nothing');
  // projects: .prev and automatic copies, picked out of the store by id
  const lp = await inst.list({ kind: 'project', id: 'p1' }, { phase: 'local' });
  ok(lp.versions.length === 2 && lp.versions.some((v) => v.src === 'prev' && v.summary === 'notes: 2 lines changed') && lp.versions.some((v) => v.src === 'copy' && v.summary === 'notes: 3 lines changed'), 'places: a project\'s notes in .prev and the automatic copies', lp.versions.map((v) => [v.src, v.summary]));
  const lpb = await inst.list({ kind: 'project', id: 'p1' }, { phase: 'backups' });
  ok(lpb.versions.length === 1 && lpb.versions[0].src === 'backup', 'places: a project out of a backup\'s projects store', lpb.versions);
  ok((await inst.list({ kind: 'project', id: 'p2' }, { phase: 'local' })).versions.length === 0, 'places: another project unchanged: no versions');
  // settings: restore brings back what syncs; this computer's own paths stay
  const ls = await inst.list({ kind: 'settings' }, { phase: 'local' });
  ok(ls.versions.length === 1 && /1 AI fewer/.test(ls.versions[0].summary), 'places: settings copies', ls.versions);
  const rs = await inst.restore({ kind: 'settings' }, ls.versions[0].token);
  const nc = read(cfg);
  ok(rs.ok && nc.settings.notify === false && nc.agents.length === 1 && nc.settings.zoom === 1 && nc.settings.enginePaths.claude === '/Users/me/bin/claude', 'restore: settings: synced settings come back; this computer\'s zoom and engine path stay', nc);
  ok(rs.before && (await inst.read(rs.before))?.agents?.length === 2, 'restore: settings: the version in place was kept first');

  // ---------- restore safety ----------
  const file = path.join(data, 'chats', 'c1.json');
  const before0 = fs.readFileSync(file, 'utf8');
  ok((await inst.restore(S1, 'bogus')).ok === false && fs.readFileSync(file, 'utf8') === before0, 'safety: a bad token changes nothing');
  // a held / garbled chat: never written over
  fs.writeFileSync(file, '{"id":"c1","mess'); const garbled = fs.readFileSync(file, 'utf8');
  let threw = null; try { await inst.restore(S1, by(l1, 'base')[0].token); } catch (e) { threw = e; }
  ok(threw?.code === 'EHELD' && fs.readFileSync(file, 'utf8') === garbled, 'safety: a chat that can\'t be read now is never restored over', threw?.message);
  fs.writeFileSync(file, before0);
  // the keep fails (its folder can't be made) → nothing written
  const vdir = path.join(data, '.versions'); fs.renameSync(vdir, `${vdir}-aside`); put(vdir, 'not a folder');
  threw = null; try { await inst.restore(S1, by(l1, 'base')[0].token); } catch (e) { threw = e; }
  ok(threw && fs.readFileSync(file, 'utf8') === before0, 'safety: when the version in place can\'t be kept, nothing is restored', threw?.message);
  fs.rmSync(vdir, { force: true }); fs.renameSync(`${vdir}-aside`, vdir);
  // a real restore: the current one kept first, the version in, stamped now, listed as "kept before a restore"
  at.now = 1e13 + 5000;
  const r = await inst.restore(S1, by(l1, 'base')[0].token);
  const now1 = read(file);
  ok(r.ok && texts(now1).length === 10 && now1.updatedAt === at.now && now1.id === 'c1', 'restore: the chat is the version now, stamped now (sync sends it)', { n: texts(now1).length, u: now1.updatedAt });
  const kept = await inst.read(r.before);
  ok(texts(kept).length === 14, 'restore: the version it replaced is kept (14 messages)', texts(kept).length);
  const l3 = await inst.list(S1, { phase: 'local' });
  ok(l3.versions[0].src === 'before' && l3.versions[0].summary === '4 messages more' && l3.versions[0].machine === 'this Mac', 'restore: listed first as "kept before a restore" (4 messages more)', l3.versions.slice(0, 2));
  ok(!l3.versions.some((v) => v.src === 'base' && v.summary === 'same as now') && l3.same >= 1, 'restore: the restored content isn\'t listed as an earlier version of itself');
  // undo: takes back only what the restore changed; a message added since (the other computer) stays
  const cur2 = read(file); cur2.messages.push(msg('u50', 'arrived after the restore', 5000)); put(file, cur2);
  at.now += 1000;
  const u = await inst.restore(S1, r.before, { over: r.value });
  const now2 = read(file);
  ok(u.ok && texts(now2).length === 15 && texts(now2).includes('arrived after the restore') && texts(now2).includes('m13'), 'undo: the 4 messages are back and the one that arrived since stays', texts(now2));
  ok((await inst.read(u.before)) && texts(await inst.read(u.before)).length === 11, 'undo: and is itself undoable (the version it replaced kept)');
  // a restore never keeps more than 20 "before" copies per thing
  for (let i = 0; i < 24; i++) { at.now += 2000; await inst.keep(S1, chat('c1', [msg('u1', `k${i}`)])); }
  ok(fs.readdirSync(path.join(data, '.versions', 'chat-c1')).length === 20, 'keep: the newest 20 stay');

  // ---------- Deleted things ----------
  put(path.join(data, 'trash', 'gone1.json'), chat('gone1', [msg('u1', 'bye')], { title: 'Old idea' }));
  put(path.join(data, 'trash', 'c1.json'), chat('c1', [])); // in the list too: not "deleted"
  put(path.join(data, 'kv', 'projects.json'), { ...proj('x'), trash: [{ id: 'p9', name: 'Dropped', items: [], ident: {}, deletedAt: 5 }] });
  put(path.join(data, 'kv', 'three-sketches.json'), [{ id: 's1', name: 'Live', code: 'a' }]);
  put(path.join(data, 'kv', 'three-history.json'), { versions: {}, trash: [{ id: 's7', name: 'Neon', code: 'x', layers: [{ id: 'main', code: 'x' }], deletedAt: 9 }, { id: 's1', name: 'Live', deletedAt: 3 }] });
  put(path.join(data, 'kv', 'boards.json'), { list: [{ id: 'b1', name: 'Live board' }], current: 'b1' });
  put(path.join(data, 'kv', 'board-b1.json'), { id: 'b1', name: 'Live board', items: [] });
  put(path.join(data, 'kv', 'board-b2.json'), { id: 'b2', name: 'Moodboard 2', items: [{ id: 'i1', type: 'note' }] });
  put(path.join(data, 'kv', 'board-b2.prev.json'), { id: 'b2', name: 'Moodboard 2', items: [] });
  const del = await inst.deleted();
  ok(del.chats.map((x) => x.id).join() === 'gone1' && del.chats[0].name === 'Old idea' && del.chats[0].n === 1, 'deleted: chats in Recently deleted (not one that\'s in the list)', del.chats);
  ok(del.projects.map((x) => x.id).join() === 'p9' && del.scenes.map((x) => x.id).join() === 's7' && del.boards.map((x) => x.id).join() === 'b2', 'deleted: projects, Lab scenes (not a live one), boards the list forgot', { p: del.projects, s: del.scenes, b: del.boards });
  for (const k of ['chats', 'projects', 'scenes', 'boards']) ok((await inst.undelete(del[k][0].key)).ok, `undelete: ${k}`);
  ok(fs.existsSync(path.join(data, 'chats', 'gone1.json')) && !fs.existsSync(path.join(data, 'trash', 'gone1.json')), 'undelete: the chat is back in the list');
  ok(read(path.join(data, 'kv', 'projects.json')).list[0].id === 'p9' && !read(path.join(data, 'kv', 'projects.json')).trash, 'undelete: the project is back, out of Recently deleted');
  ok(read(path.join(data, 'kv', 'three-sketches.json')).some((x) => x.id === 's7' && x.code === 'x') && read(path.join(data, 'kv', 'three-sketches.json')).some((x) => x.id === 's1') && !read(path.join(data, 'kv', 'three-history.json')).trash.some((x) => x.id === 's7'), 'undelete: the scene is back under its id (the others kept), out of History\'s deleted list');
  ok(read(path.join(data, 'kv', 'boards.json')).list[0].id === 'b2' && read(path.join(data, 'kv', 'boards.json')).list.length === 2, 'undelete: the board is back in the boards list');
  ok((await inst.undelete(del.chats[0].key)).ok === false, 'undelete: twice → refused, nothing replaced');
  put(path.join(data, 'trash', 'c1.json'), chat('c1', []));
  const d2 = await inst.deleted();
  ok(!d2.chats.some((x) => x.id === 'c1'), 'deleted: a chat in the list is never offered (no restore over it)');
}

// ---------- two computers (dev/sync-sim.js): restore on the PC while the Mac edits ----------
function world(name) {
  const dir = path.join(ROOT, name); raw.mkdirSync(dir, { recursive: true });
  const w = { name, dir, clock: Sim.clock(Date.now()), cloud: Sim.cloud({}), ms: [], seed: 7 };
  w.rnd = () => { w.seed = (w.seed * 1103515245 + 12345) & 0x7fffffff; return w.seed / 0x7fffffff; };
  return w;
}
function computer(w, name, platform) {
  const base = path.join(w.dir, name);
  const m = { name, w };
  m.data = path.join(base, 'data'); m.home = path.join(base, 'home'); m.cloudRoot = path.join(base, 'cloud');
  m.config = path.join(base, 'app', 'config.json'); m.theme = path.join(base, 'app', 'theme.css');
  Sim.ciVolume(m.data); raw.mkdirSync(m.home, { recursive: true });
  m.now = () => w.clock.now();
  m.view = w.cloud.view(m.cloudRoot, { name, style: platform === 'win32' ? 'onedrive' : 'icloud', now: m.now });
  raw.mkdirSync(path.dirname(m.config), { recursive: true });
  raw.writeFileSync(m.config, JSON.stringify({ agents: [{ id: 'claude', name: 'Claude' }], settings: { zoom: 1 } }, null, 2)); raw.writeFileSync(m.theme, '/* theme */\n');
  m.e = createEngine({ dataDir: m.data, configPath: m.config, themePath: m.theme, cloudRoot: m.cloudRoot, machineName: name, home: m.home, platform, now: m.now, chunk: 256 * 1024,
    cloudAttributes: m.view.attributes, requestDownload: (f) => m.view.request(f), autoResolve: () => true, log: VERBOSE ? (...a) => console.log(`  ${name}:`, ...a) : undefined });
  m.p = (rel) => path.join(m.data, ...rel.split('/'));
  m.write = (rel, v) => { put(m.p(rel), v, m.now()); };
  m.json = (rel) => read(m.p(rel));
  m.edit = (rel, fn) => { const v = m.json(rel); fn(v); m.write(rel, v); };
  m.versions = V.create({ dataDir: m.data, configPath: m.config, stateDir: m.e.stateDir, cloudDir: () => m.e.cloudDir, ctx: () => m.e.ctx(), conflicts: () => m.e.conflicts(), incoming: (rel) => m.e.incoming(rel),
    here: platform === 'win32' ? 'this PC' : 'this Mac', now: m.now });
  w.ms.push(m);
  return m;
}
async function pass(m) { m.last = await m.e.pass(); if (m.e.laneIdle) { await m.e.laneIdle(); if (m.e.status().moving === 0 && m.last.pending) m.last = await m.e.pass(); } }
async function round(w) { w.clock.advance(2000); for (const m of (w.rnd() < 0.5 ? w.ms : [...w.ms].reverse())) { m.view.tick(); if (!m.view.online) continue; await pass(m); } }
const snap = (m) => Sim.snapshot(m.data, S, m.e.ctx());
function differs(a, b) { const A = snap(a); const B = snap(b); return [...new Set([...Object.keys(A), ...Object.keys(B)])].filter((k) => A[k] !== B[k]); }
async function converge(w, max = 60) {
  for (let i = 1; i <= max; i++) {
    await round(w);
    if (i >= 2 && w.ms.every((m) => m.view.online && m.view.idle() && m.last && !m.last.pending && ['synced', 'conflict'].includes(m.last.state)) && !differs(w.ms[0], w.ms[1]).length) return i;
  }
  return -1;
}
async function twoComputers() {
  const w = world('two');
  const pc = computer(w, 'PC', 'win32');
  const mac = computer(w, 'Mac', 'darwin');
  const M = (id, text, at) => msg(id, text, at);
  pc.write('chats/c1.json', chat('c1', [M('u1', 'one', 1), M('a1', 'two', 2), M('u2', 'three', 3)], { title: 'Plan' }));
  ok(await converge(w) > 0, 'sim: the chat reaches the Mac');
  pc.edit('chats/c1.json', (c) => { c.messages.push(M('a2', 'four', 4), M('u3', 'five (a mistake)', 5)); c.title = 'Plan v2'; c.updatedAt = 5; });
  ok(await converge(w) > 0, 'sim: the edit reaches the Mac');
  const lv = await pc.versions.list({ kind: 'chat', id: 'c1' }, { phase: 'local' });
  const three = lv.versions.find((v) => v.summary.startsWith('2 messages fewer'));
  ok(three && three.src === 'base' && three.machine === 'both computers', 'sim: the 3-message version is there on the PC (the synced version before the last)', lv.versions.map((v) => [v.src, v.summary]));
  // the Mac goes on writing while the PC restores
  mac.view.online = false;
  mac.edit('chats/c1.json', (c) => { c.messages.push(M('u9', 'written on the Mac meanwhile', 9)); c.updatedAt = 9; });
  const r = await pc.versions.restore({ kind: 'chat', id: 'c1' }, three.token);
  { const f = pc.p('chats/c1.json'); const t = new Date(pc.now()); fs.utimesSync(f, t, t); }
  ok(r.ok && texts(pc.json('chats/c1.json')).join() === 'one,two,three' && pc.json('chats/c1.json').title === 'Plan', 'sim: restored on the PC');
  await round(w); await round(w);
  mac.view.online = true;
  ok(await converge(w) > 0, 'sim: both computers settle after the restore', differs(pc, mac));
  for (const m of [pc, mac]) {
    const c = m.json('chats/c1.json');
    ok(texts(c).join() === 'one,two,three,written on the Mac meanwhile' && c.title === 'Plan', `sim: on the ${m.name}: the restore applied AND the Mac's new message kept`, { t: texts(c), title: c.title });
  }
  ok(!differs(pc, mac).length, 'sim: both computers identical', differs(pc, mac));
  // what the restore replaced is on the PC (kept first) and nothing is lost: Undo brings back the two messages
  const lv2 = await pc.versions.list({ kind: 'chat', id: 'c1' }, { phase: 'local' });
  const kept = lv2.versions.find((v) => v.src === 'before');
  ok(kept && /title “Plan v2”/.test(kept.summary) && kept.machine === 'this PC' && texts(await pc.versions.read(kept.token)).length === 5, 'sim: "kept before a restore" on the PC (the 5-message version)', lv2.versions.map((v) => [v.src, v.summary]));
  const u = await pc.versions.restore({ kind: 'chat', id: 'c1' }, r.before, { over: r.value });
  { const f = pc.p('chats/c1.json'); const t = new Date(pc.now()); fs.utimesSync(f, t, t); }
  ok(u.ok, 'sim: Undo on the PC');
  ok(await converge(w) > 0, 'sim: both settle after the Undo', differs(pc, mac));
  for (const m of [pc, mac]) {
    const t = texts(m.json('chats/c1.json'));
    ok(['one', 'two', 'three', 'four', 'five (a mistake)', 'written on the Mac meanwhile'].every((x) => t.includes(x)) && t.length === 6 && m.json('chats/c1.json').title === 'Plan v2', `sim: after Undo on the ${m.name}: every message from both computers, once`, t);
  }
  // a project's notes restored on the Mac while the PC edits another line: both
  pc.write('kv/projects.json', { v: 1, list: [{ id: 'p1', name: 'Clink', notes: 'goal\nmusic\nlook\ntodo', items: [], ident: { ci: 0, gi: 0 }, status: 'active', updated: 1 }], dismissed: [] });
  ok(await converge(w) > 0, 'sim: projects reach the Mac');
  mac.edit('kv/projects.json', (v) => { v.list[0].notes = 'goal\nmusic\nlook\ntodo BAD EDIT'; v.list[0].updated = 2; });
  ok(await converge(w) > 0, 'sim: the bad edit syncs');
  const lp = await mac.versions.list({ kind: 'project', id: 'p1' }, { phase: 'local' });
  const good = lp.versions.find((v) => v.summary === 'notes: 1 line changed');
  ok(good, 'sim: the Mac lists the notes before the bad edit', lp.versions.map((v) => [v.src, v.summary]));
  pc.view.online = false;
  pc.edit('kv/projects.json', (v) => { v.list[0].notes = 'goal (PC)\nmusic\nlook\ntodo BAD EDIT'; v.list[0].updated = 3; });
  const rp = await mac.versions.restore({ kind: 'project', id: 'p1' }, good.token);
  { const f = mac.p('kv/projects.json'); const t = new Date(mac.now()); fs.utimesSync(f, t, t); }
  ok(rp.ok, 'sim: the notes restored on the Mac');
  await round(w); pc.view.online = true;
  ok(await converge(w) > 0, 'sim: both settle', differs(pc, mac));
  for (const m of [pc, mac]) ok(m.json('kv/projects.json').list[0].notes === 'goal (PC)\nmusic\nlook\ntodo', `sim: on the ${m.name}: the restored line and the PC's edit of another line`, m.json('kv/projects.json').list[0].notes);
  // (two lines next to each other changed on each side are one change for the text merge: sync72 keeps both versions of
  // them, so nothing is lost but the owner may delete a line: dev/sync72-test.js notes-both)
}

async function twoComputersNotes() {
  const w = world('notes');
  const pc = computer(w, 'PC', 'win32');
  const mac = computer(w, 'Mac', 'darwin');
  // the PC restores the notes while the Mac (offline for a moment) edits another line: a clean three-way merge
  pc.write('kv/projects.json', { v: 1, list: [{ id: 'p1', name: 'Clink', notes: 'x', items: [], ident: { ci: 0, gi: 0 }, status: 'active', updated: 1 }, { id: 'p2', name: 'Stoop', notes: 'a\nb\nc\nd\ne', items: [], ident: { ci: 1, gi: 1 }, status: 'active', updated: 6 }], dismissed: [] });
  ok(await converge(w) > 0, 'sim: a second project syncs');
  pc.edit('kv/projects.json', (v) => { v.list[1].notes = 'a\nb WRONG\nc\nd\ne'; v.list[1].updated = 7; });
  ok(await converge(w) > 0, 'sim: a bad edit syncs');
  const lp2 = await pc.versions.list({ kind: 'project', id: 'p2' }, { phase: 'local' });
  let good2 = null; for (const v of lp2.versions) if ((await pc.versions.read(v.token))?.notes === 'a\nb\nc\nd\ne') { good2 = v; break; }
  ok(good2, 'sim: the notes before the bad edit are listed', lp2.versions.map((v) => [v.src, v.summary]));
  mac.view.online = false;
  mac.edit('kv/projects.json', (v) => { v.list[1].notes = 'a\nb WRONG\nc\nd\ne: ship it'; v.list[1].updated = 8; });
  const rp2 = await pc.versions.restore({ kind: 'project', id: 'p2' }, good2.token);
  { const f = pc.p('kv/projects.json'); const t = new Date(pc.now()); fs.utimesSync(f, t, t); }
  await round(w); await round(w);
  mac.view.online = true;
  ok(rp2.ok && await converge(w) > 0, 'sim: settles', differs(pc, mac));
  for (const m of [pc, mac]) { const n = m.json('kv/projects.json').list[1].notes; ok(n === 'a\nb\nc\nd\ne: ship it', `sim: on the ${m.name}: the restored line and the Mac's edit of another line, exactly`, n); }
}

(async () => {
  try {
    await core();
    await places();
    await twoComputers();
    await twoComputersNotes();
  } catch (err) { failures += 1; console.log('FAIL crashed', err.stack); }
  if (!process.argv.includes('--keep')) fs.rmSync(ROOT, { recursive: true, force: true });
  console.log(`versions75-test: ${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
