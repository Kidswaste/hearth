#!/usr/bin/env node
// (round 86, projopen86) project handling's batched / lighter paths give the same answers as the ways before them
// (throwaway folders only, made-up files and chats):
//   · reachmain localizeMany(paths) = localize(path) for each, in order: this computer's files and missing ones, the
//     other computer's Windows / Mac forms of the data folder, file:// URLs, a folder matched by hand, home folders,
//     relative names, empty and odd input; and it lets the main loop run while it maps many
//   · projbundlemain sizes() = round 85's way (each path found here, else mapped one by one: kept below as the
//     reference): files, folders (walked), secret files, missing ones, the other computer's paths
//   · projbundle-work chatInfo lite (Duplicate project): a big chat's own fields (key order too) and count cut from its
//     bytes = the parse's; a chat laid out compact (not as Hearth writes it) and one with a BOM; one that isn't a chat
//     or can't be read is never "no chat"; a parse kept from the card is used as before
//   node dev/projopen86-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.HEARTH_BIGCHAT_MIN = '20000';
const ROOT = path.join(__dirname, '..');
const R = require(path.join(ROOT, 'reachmain.js'));
const M = require(path.join(ROOT, 'projbundlemain.js'));
const Wk = require(path.join(ROOT, 'projbundle-work.js'));
const PC = require(path.join(ROOT, 'projbundle-core.js'));

let passes = 0; let failures = 0;
const ok = (cond, what) => { if (cond) passes += 1; else { failures += 1; console.log(`FAIL ${what}`); } };
const W = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-projopen86-'));
const data = path.join(tmp, 'Hearth', 'data');
const home = path.join(tmp, 'home');
const matched = path.join(tmp, 'matched');

(async () => {
  try {
    // ---------- a data folder with some of the other computer's files here ----------
    for (let k = 0; k < 40; k++) if (k % 2 === 0) W(path.join(data, 'workspace', 'clink', `f${k}.png`), `x${k}`);
    W(path.join(data, 'captures', 'c1.png'), 'c'); W(path.join(matched, 'proj', 'a.txt'), 'a'); W(path.join(home, 'Desktop', 'd.txt'), 'd');
    W(path.join(data, 'workspace', 'dir', 'one.txt'), '1'); W(path.join(data, 'workspace', 'dir', 'sub', 'two.txt'), '22'); W(path.join(data, 'workspace', 'dir', '.env'), 'SECRET=1');
    const map = { 'C:\\Users\\me\\Projects': matched };
    R._set({ dataDir: data, folderMap: () => map, syncmain: null });
    M._set({ dataDir: data });
    const inputs = [
      ...Array.from({ length: 40 }, (_, k) => `C:\\Users\\me\\AppData\\Roaming\\Hearth\\data\\workspace\\clink\\f${k}.png`),
      ...Array.from({ length: 10 }, (_, k) => `/Users/me/Library/Application Support/Hearth/data/workspace/clink/f${k}.png`),
      path.join(data, 'workspace', 'clink', 'f0.png'), path.join(data, 'workspace', 'clink', 'f1.png'), path.join(data, 'captures', 'c1.png'),
      `file://${path.join(data, 'captures', 'c1.png')}`, 'file:///C:/Users/me/AppData/Roaming/Hearth/data/captures/c1.png',
      'C:\\Users\\me\\Projects\\proj\\a.txt', 'C:\\Users\\me\\Projects\\proj\\missing.txt', '/Users/me/Desktop/d.txt', `${home}/Desktop/d.txt`,
      'relative/name.png', '', null, 42, '"/Users/me/x.png"', '/data/workspace/clink/f2.png', '/nowhere/at/all.png', path.join(data, 'workspace', 'dir'),
    ];
    const o = { home };
    const one = inputs.map((x) => R.localize(x, o));
    const many = await R.localizeMany(inputs, o);
    ok(many.length === inputs.length, 'localizeMany: one answer per path');
    ok(JSON.stringify(one) === JSON.stringify(many), `localizeMany = localize for each path (${inputs.findIndex((x, i) => JSON.stringify(one[i]) !== JSON.stringify(many[i]))})`);
    ok(many[0]?.path === path.join(data, 'workspace', 'clink', 'f0.png') && many[0].foreign === true, 'the other computer\'s Windows path → this data folder');
    ok(many.filter(Boolean).length >= 50, 'most of them map');
    ok((await R.localizeMany([])).length === 0 && (await R.localizeMany(null)).length === 0, 'nothing given → nothing');
    // many paths: the main loop gets turns while they're mapped (slices of ≤ 4 ms)
    { const lots = Array.from({ length: 6000 }, (_, k) => `C:\\Users\\me\\AppData\\Roaming\\Hearth\\data\\workspace\\clink\\many-${k}.png`);
      let ticks = 0; const t = setInterval(() => { ticks += 1; }, 1);
      const res = await R.localizeMany(lots, o); clearInterval(t);
      ok(res.length === 6000 && res.every((x, k) => x?.path === path.join(data, 'workspace', 'clink', `many-${k}.png`)), 'localizeMany: 6,000 paths mapped in order');
      ok(ticks > 0, `localizeMany: the loop ran meanwhile (${ticks} ticks)`); }

    // ---------- sizes() = round 85's way ----------
    const statOf = (p) => { try { return fs.statSync(p); } catch { return null; } };
    const unFile = (s) => { let p = String(s).replace(/^file:\/\/(localhost)?/i, ''); try { p = decodeURIComponent(p); } catch { /* as is */ } if (/^\/[A-Za-z]:[\\/]/.test(p)) p = p.slice(1); return p; };
    function hereOld(p, { dir = false } = {}) { // (round 85's here(): kept as the reference)
      const raw = unFile(p); const okd = (st) => st && (dir ? st.isDirectory() || st.isFile() : st.isFile());
      const st = statOf(raw); if (okd(st)) return { path: raw, size: st.isFile() ? st.size : 0, dir: st.isDirectory() };
      const hit = R.localize(raw); const st2 = hit?.path ? statOf(hit.path) : null;
      if (okd(st2)) return { path: hit.path, size: st2.isFile() ? st2.size : 0, dir: st2.isDirectory() };
      return null;
    }
    async function sizesOld({ paths = [], dirs = [] }) {
      const one2 = async (p, dir) => {
        if (PC.secretFile(p)) return { path: p, found: false, secret: true, size: 0 };
        const h = hereOld(p, { dir });
        if (!h) return { path: p, found: false, size: 0 };
        if (h.dir) { const f = M.walkDir(h.path); return { path: p, found: true, dir: true, files: f.length, size: f.reduce((n, x) => n + x.size, 0) }; }
        return { path: p, found: true, files: 1, size: h.size };
      };
      return { files: await Promise.all(paths.map((p) => one2(p, false))), dirs: await Promise.all(dirs.map((p) => one2(p, true))) };
    }
    R._set({ dataDir: data, folderMap: () => map, syncmain: null, home });
    const paths = [...inputs.filter((x) => typeof x === 'string' && x), path.join(data, 'workspace', 'dir', '.env'), path.join(data, 'workspace', 'dir')];
    const dirs = [path.join(data, 'workspace', 'dir'), 'C:\\Users\\me\\AppData\\Roaming\\Hearth\\data\\workspace\\dir', path.join(data, 'captures', 'c1.png'), '/nope', 'C:\\Users\\me\\Projects\\proj'];
    const a = await M.sizes({ paths, dirs }); const b = await sizesOld({ paths, dirs });
    ok(JSON.stringify(a) === JSON.stringify(b), 'sizes() = round 85\'s answers (files, folders, secrets, missing, the other computer\'s)');
    ok(a.files.some((x) => x.secret) && a.dirs[0].files === 2 && a.dirs[1].found && !a.dirs[3].found, 'sizes(): a secret file, a folder walked (its .env left out), one mapped, one missing');
    ok(JSON.stringify(await M.sizes({})) === JSON.stringify({ files: [], dirs: [] }), 'sizes(): nothing asked');

    // ---------- chatInfo lite (Duplicate project) = the parse ----------
    const chats = path.join(tmp, 'chats');
    const msgs = Array.from({ length: 400 }, (_, k) => ({ role: k % 2 ? 'assistant' : 'user', text: `message ${k} café 日本語 "q" \\ ${'x'.repeat(80)}`, at: 1e12 + k, ...(k % 7 ? {} : { usage: { input: k, output: 2 } }) }));
    const chat = { id: 'claude-big', agentId: 'claude', title: 'Big “one”', createdAt: 1, updatedAt: 2, session: { id: 's1' }, messages: msgs, pinned: true, style: 'x' };
    W(path.join(chats, 'pretty.json'), JSON.stringify(chat, null, 2));
    W(path.join(chats, 'compact.json'), JSON.stringify({ ...chat, id: 'claude-c' }));
    W(path.join(chats, 'bom.json'), `\ufeff${JSON.stringify({ ...chat, id: 'claude-b' }, null, 2)}`);
    W(path.join(chats, 'notchat.json'), JSON.stringify({ id: 'x', messages: 'nope', pad: 'y'.repeat(30000) }));
    W(path.join(chats, 'broken.json'), `${JSON.stringify(chat, null, 2).slice(0, 25000)}`);
    W(path.join(chats, 'small.json'), JSON.stringify({ id: 's', messages: [] }));
    const files = ['pretty', 'compact', 'bom', 'notchat', 'broken', 'small', 'gone'].map((id) => ({ id, file: path.join(chats, `${id}.json`) }));
    const full = Wk.OPS.chatInfo({ files });
    // a new worker module state for lite (no parse kept from the card): required again fresh
    delete require.cache[require.resolve(path.join(ROOT, 'projbundle-work.js'))];
    const Wk2 = require(path.join(ROOT, 'projbundle-work.js'));
    const lite = Wk2.OPS.chatInfo({ files, lite: true });
    for (const id of ['pretty', 'compact', 'bom']) {
      ok(lite[id]?.state === 'big' && full[id]?.state === 'big', `lite ${id}: big`);
      ok(JSON.stringify(lite[id].head) === JSON.stringify(full[id].head) && Object.keys(lite[id].head).join() === Object.keys(full[id].head).join(), `lite ${id}: the same own fields, in the same order`);
      ok(lite[id].n === 400 && full[id].n === 400 && lite[id].size === full[id].size, `lite ${id}: the same count and size`);
    }
    ok(JSON.stringify(lite.pretty.head.messages) === '[]' && lite.pretty.head.session.id === 's1', 'lite: messages [] in place, its own fields as they are (the window drops the session)');
    ok(lite.notchat?.state === 'unreadable' && full.notchat?.state === 'unreadable', 'lite: not a chat → unreadable (never "no chat")');
    ok(lite.broken?.state === 'unreadable' && full.broken?.state === 'unreadable', 'lite: a chat cut short → unreadable');
    ok(lite.small?.state === 'small' && lite.gone?.state === 'missing', 'lite: small and missing as before');
    // a parse kept from the card (the export's card read it): used as before (its paths too)
    const kept = Wk2.OPS.chatInfo({ files: [files[0]] });
    const lite2 = Wk2.OPS.chatInfo({ files: [files[0]], lite: true });
    ok(JSON.stringify(lite2) === JSON.stringify(kept), 'lite after the card\'s parse: the kept parse, as before');
  } catch (e) { failures += 1; console.log(`FAIL threw: ${e.stack}`); }
  finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  console.log(`${failures ? 'FAIL' : 'ok'} projopen86-test: ${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
})();
