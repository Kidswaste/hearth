#!/usr/bin/env node
// ▶ Play, got ready (round 52, gameready): the pure part (tools/gameready-core.js) and the cache's plan in the main
// process (gamereadymain.js, a throwaway folder): cache keys, stale rules, the size cap, the URL rewrite map, findings.
//   node dev/gameready-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../tools/gameready-core');

const out = { pass: true, failures: [], ran: 0 };
const ok = (name, cond, info) => { out.ran += 1; if (!cond) { out.pass = false; out.failures.push(info === undefined ? name : `${name}: ${JSON.stringify(info)}`); } };

// ---------- keys ----------
const A = { path: '/games/clink/ship.glb', hash: 'aaa111' };
ok('key: stable', C.entryKey(A) === C.entryKey({ hash: 'aaa111', path: '/games/clink/ship.glb' }));
ok('key: the same bytes elsewhere → the same copy', C.entryKey(A) === C.entryKey({ ...A, path: '/other/place/ship.glb' }));
ok('key: other bytes → another key', C.entryKey(A) !== C.entryKey({ ...A, hash: 'aaa112' }));
ok('key: another kind of file → another key', C.entryKey(A) !== C.entryKey({ ...A, path: '/games/clink/ship.gltf' }));
ok('key: 16 hex', /^[0-9a-f]{16}$/.test(C.entryKey(A)));

// ---------- fresh / stale / missing ----------
const kA = C.entryKey(A);
const old = { path: A.path, hash: 'old999' }; const kOld = C.entryKey(old);
const I = { v: 1, entries: { [kA]: { src: A.path, hash: A.hash, out: '/cache/files/a.glb', bytes: 100, at: 1, used: 5 }, [kOld]: { src: A.path, hash: 'old999', out: '/cache/files/old.glb', bytes: 50, at: 0, used: 1 } } };
const B = { path: '/games/clink/rock.glb', hash: 'bbb' };
let r = C.check(I, [A, B]);
ok('check: the copy of these bytes is fresh', r.fresh.length === 1 && r.fresh[0].key === kA && r.fresh[0].path === A.path, r.fresh);
ok('check: a copy of an older version of the same file is stale', r.stale.length === 1 && r.stale[0].key === kOld, r.stale);
ok('check: a file without a copy is missing', r.missing.length === 1 && r.missing[0] === B);
r = C.check(I, [{ path: A.path, hash: 'changed' }]);
ok('check: the file changed → nothing fresh, both older copies stale', r.fresh.length === 0 && r.stale.length === 2 && r.missing.length === 1, r);
ok('check: an empty / junk index', C.check(null, [A]).missing.length === 1 && C.check({}, [A]).missing.length === 1);

// ---------- the cap ----------
const big = { entries: {} };
for (let i = 0; i < 6; i++) big.entries[`k${i}`] = { src: `/s${i}`, out: `/o${i}`, bytes: 1000, used: 100 - i * 10 };
let o = C.over(big, { maxBytes: 4000, maxEntries: 99 });
ok('cap: least recently used go first, until it fits', o.map((e) => e.key).join() === 'k5,k4', o.map((e) => e.key));
o = C.over(big, { maxBytes: 1e9, maxEntries: 3 });
ok('cap: the count too', o.length === 3 && o[0].key === 'k5');
o = C.over(big, { maxBytes: 4000, maxEntries: 99, keep: ['k5'] });
ok('cap: a copy in use now is never dropped', !o.some((e) => e.key === 'k5') && o.length === 2, o.map((e) => e.key));
ok('cap: under it → nothing', C.over(big, {}).length === 0);

// ---------- the rewrite map ----------
const m = C.rewriteMap(I, [A, B]);
ok('map: only fresh copies', Object.keys(m).length === 1 && m[C.norm(A.path)] === '/cache/files/a.glb', m);
ok('rewrite: the path', C.rewrite(m, A.path) === '/cache/files/a.glb');
ok('rewrite: a file:// URL of it', C.rewrite(m, 'file:///games/clink/ship.glb') === '/cache/files/a.glb');
ok('rewrite: escaped characters', C.rewrite(C.rewriteMap({ entries: { [C.entryKey({ path: '/g/my ship.glb', hash: 'h' })]: { src: '/g/my ship.glb', out: '/c/x.glb' } } }, [{ path: '/g/my ship.glb', hash: 'h' }]), 'file:///g/my%20ship.glb') === '/c/x.glb');
ok('rewrite: anything else → null (the original loads)', C.rewrite(m, B.path) === null && C.rewrite(m, '') === null && C.rewrite(null, A.path) === null);
const W = { path: 'C:\\Games\\Clink\\Ship.glb', hash: 'w1' };
const mw = C.rewriteMap({ entries: { [C.entryKey(W)]: { src: W.path, out: 'D:\\cache\\w.glb' } } }, [W], {}, 'win32');
ok('rewrite: Windows slashes and letter case', C.rewrite(mw, 'c:/games/clink/ship.GLB', 'win32') === 'D:\\cache\\w.glb' && C.rewrite(mw, 'file:///C:/Games/Clink/Ship.glb', 'win32') === 'D:\\cache\\w.glb', mw);
ok('rewrite: Linux keeps case', C.rewrite(m, '/games/clink/SHIP.glb', 'linux') === null);

// ---------- findings ----------
const f = C.findings({ textures: [{ w: 8192, h: 8192, mips: true }, { w: 8192, h: 4096, mips: true }, { w: 8192, h: 8192, mips: true }, { w: 4096, h: 4096, mips: true }, { w: 512, h: 512, mips: true }], calls: 1240, programs: 31, shadows: 6 });
const t8 = f.find((x) => x.kind === 'big-textures' && x.size === '8K');
ok('findings: 3 textures are 8K and what they cost', t8 && t8.n === 3 && /^3 textures are 8K — they cost [\d.]+ (MB|GB) of video memory$/.test(t8.text), t8);
ok('findings: VRAM with mipmaps (8192² RGBA = 341.3 MB)', C.vram(8192, 8192) === Math.round(8192 * 8192 * 4 * 4 / 3) && C.vram(1024, 1024, { mips: false }) === 4194304 && C.vram(1024, 1024, { compressed: true, mips: false }) === 1048576);
ok('findings: 4K counted apart from 8K', f.find((x) => x.size === '4K')?.n === 1 && /^1 texture is 4K — it costs \d+ MB/.test(f.find((x) => x.size === '4K').text));
ok('findings: draw calls, shadows, shaders', f.some((x) => x.kind === 'draw-calls' && /1,240 draw calls/.test(x.text)) && f.some((x) => x.kind === 'shadows') && f.some((x) => x.kind === 'shaders' && /31 shaders/.test(x.text)), f.map((x) => x.text));
ok('findings: big uncompressed textures → Optimize', f.some((x) => x.kind === 'uncompressed' && x.n === 4));
ok('findings: a light scene → no alarms', C.findings({ textures: [{ w: 512, h: 512 }], calls: 20, programs: 3 }).every((x) => ['texture-memory', 'shaders'].includes(x.kind)));
ok('findings: nothing known → nothing said', C.findings({}).length === 0 && C.findings().length === 0);

// ---------- the card's words ----------
ok('progress: stages climb', C.progress('scan', 0) === 0 && C.progress('assets', 1) === 45 && C.progress('effects', 0.5) === 75 && C.progress('done') === 100);
ok('line: textures 40/120', C.line('textures', { done: 40, total: 120 }, 40 / 120) === 'textures 40/120 · 50 %', C.line('textures', { done: 40, total: 120 }, 40 / 120));
ok('title: Getting Clink ready…', C.title('Clink') === 'Getting Clink ready…');

// ---------- what may be optimized ----------
ok('optimize: a Lab scene\'s GLB (its loader has every decoder), with textures', C.canOptimize({ path: '/a/ship.glb' }, { kind: 'lab' }).ok && C.canOptimize({ path: '/a/ship.glb' }, { kind: 'lab' }).textures);
ok('optimize: pictures never (full quality)', !C.canOptimize({ path: '/a/sky.png' }, { kind: 'lab' }).ok);
ok('optimize: an HTML game only with a meshopt decoder seen', !C.canOptimize({ path: '/a/ship.glb' }, { kind: 'html' }).ok && C.canOptimize({ path: '/a/ship.glb' }, { kind: 'html', meshopt: true }).ok && !C.canOptimize({ path: '/a/ship.glb' }, { kind: 'html', meshopt: true }).textures);
const args = C.gltfpackArgs('/in.glb', '/out.glb');
ok('gltfpack: exact geometry (no quantization), names / materials / extras kept, meshopt EXT', ['-noq', '-kn', '-km', '-ke', '-cc'].every((a) => args.includes(a)) && args[args.indexOf('-ce') + 1] === 'ext' && !args.includes('-tc') && !args.includes('-si'));
ok('gltfpack: textures → KTX2 UASTC (the high-quality mode)', C.gltfpackArgs('/i', '/o', { textures: true }).join(' ').includes('-tc -tu'));
ok('install: the command is shown', /npm install -g gltfpack/.test(C.installPlan('darwin').command) && /PowerShell/.test(C.installPlan('win32').note));

// ---------- the main process' plan on a real folder (a throwaway one) ----------
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gameready-test-'));
  try {
    const M = require('../gamereadymain')._test;
    M.setDir(dir);
    const src = path.join(dir, 'ship.glb'); fs.writeFileSync(src, Buffer.from('glTF fake one'));
    const h = await M.hashFile(src);
    ok('hash: SHA-1 of the bytes', /^[0-9a-f]{40}$/.test(h.hash) && h.size === 13);
    const h2 = await M.hashFile(src);
    ok('hash: remembered (same size + date)', h2.hash === h.hash);
    let p = await M.plan([h]);
    ok('plan: an empty cache → missing', p.missing.length === 1 && !p.fresh.length && !Object.keys(p.map).length);
    // a copy made earlier, by hand
    const cdir = path.join(dir, 'game-cache', 'files'); fs.mkdirSync(cdir, { recursive: true });
    const outF = path.join(cdir, `${C.entryKey(h)}.glb`); fs.writeFileSync(outF, 'small');
    fs.writeFileSync(path.join(dir, 'game-cache', 'index.json'), JSON.stringify({ v: 1, entries: { [C.entryKey(h)]: { src, hash: h.hash, out: outF, bytes: 5, at: 1, used: 1 } } }));
    M.setDir(dir);
    p = await M.plan([h]);
    ok('plan: the copy is fresh and in the map', p.fresh.length === 1 && p.map[C.norm(src)] === outF, p.map);
    fs.rmSync(outF);
    p = await M.plan([h]);
    ok('plan: a copy whose file went → not fresh', p.fresh.length === 0 && p.missing.length === 1);
    // an unreadable index is never written over
    fs.writeFileSync(path.join(dir, 'game-cache', 'index.json'), '{ broken');
    M.setDir(dir);
    p = await M.plan([h]);
    ok('plan: an unreadable index → said, not replaced', p.bad === true && fs.readFileSync(path.join(dir, 'game-cache', 'index.json'), 'utf8') === '{ broken');
    ok('hash: a missing file says so', (await M.hashFile(path.join(dir, 'nope.glb'))).missing === true);
  } catch (err) { ok('main part', false, String(err.stack || err)); }
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(JSON.stringify(out, null, 1));
  process.exit(out.pass ? 0 : 1);
})();
