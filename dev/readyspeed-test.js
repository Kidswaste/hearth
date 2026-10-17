// ▶ Play, ready sooner (round 56, readyspeed): the pure part (tools/readyspeed-core.js: one clock from the press to the
// first frame of play, the plain words, "Ready in x s (was y s)" once, what a run teaches the next one, the check's
// threshold), the memory per game (readyspeedmain.js: kept, read back after a "relaunch", the A/B's key following the
// game's files / Hearth's helpers / the screen / the look; datasafe: an unreadable file never written over) and the
// window's page tag (gamereadymain.js: the hints in its query only when they apply).
//   node dev/readyspeed-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../tools/readyspeed-core');
const RS = require('../readyspeedmain');
let n = 0;
const t = async (name, fn) => { await fn(); n += 1; console.log(`✓ ${name}`); };
const LAB = { click: 1000, prep: { start: 1010, end: 1200 }, main: { asked: 1210, built: 1400, window: 1450, loaded: 1900, cached: false }, page: { origin: 1500, mode: 'lab', marks: { card: 100, drawn: 900, counted: 1500, scanned: 1700, prepped: 3000, warmed: 4000, inventory: 4100, sounds: 4100, ab: 5500, answered: 5500, play: 5500, frame1: 5520 }, load: { asked: 150, fetched: 300, decode: { n: 2, from: 320, to: 700 }, ktx: null } } };

(async () => {
  await t('one clock: the hub, the main process and the page lined up from the press', () => {
    const tl = C.timeline(LAB);
    assert.strictEqual(tl.total, 6020); assert.strictEqual(tl.toReady, 6000);
    assert.strictEqual(tl.toWindow, 450); assert.strictEqual(tl.toCard, 600); assert.strictEqual(tl.toFirstFrame, 1400);
    const ms = Object.fromEntries(tl.steps.map((s) => [s.id, s.ms]));
    assert.deepStrictEqual(ms, { hub: 200, build: 190, window: 50, page: 150, drawn: 800, counted: 600, scanned: 200, prepped: 1300, warmed: 1000, inventory: 100, sounds: 0, ab: 1400, answered: 0, play: 0, frame1: 20 });
    // the steps add up to the whole (nothing lost between them), the load's own times shown alongside
    assert.strictEqual(tl.steps.reduce((a, s) => a + s.ms, 0) + 10 /* the IPC between the hub's step and the main process' */, tl.total);
    assert.deepStrictEqual(tl.side.map((s) => [s.id, s.ms]), [['fetch', 150], ['decode', 380]]);
    assert.strictEqual(tl.steps.find((s) => s.id === 'build').label, 'its page built');
    assert.strictEqual(C.timeline({ ...LAB, main: { ...LAB.main, cached: true } }).steps.find((s) => s.id === 'build').label, 'its page (kept)');
  });
  await t('an HTML build has its own steps; missing marks are left out, never made up', () => {
    const tl = C.timeline({ click: 0, prep: { end: 100 }, main: { asked: 110, window: 300 }, page: { origin: 300, mode: 'html', marks: { card: 50, settled: 900, textures: 1000, effects: 1400, warmed: 1700, play: 1800, frame1: 1817 } } });
    assert.deepStrictEqual(tl.steps.map((s) => s.id), ['hub', 'window', 'page', 'settled', 'textures', 'effects', 'warmed', 'play', 'frame1']);
    assert.strictEqual(tl.total, 2117); assert.strictEqual(tl.toFirstFrame, 1200);
    assert.strictEqual(C.timeline({ click: 0, page: {} }), null, 'no page clock: nothing');
    assert.strictEqual(C.timeline({}), null);
  });
  await t('the plain words: /game ready lines and the short line', () => {
    const tl = C.timeline(LAB);
    const L = C.lines(tl);
    assert.strictEqual(L[0], 'From ▶ Play to the first frame of play: 6.0 s (window 0.5 s, card 0.6 s, first frame behind it 1.4 s)');
    assert.ok(L.includes('  shaders + textures: 1300 ms') && L.includes('  smooth check: 1400 ms') && L.includes('  (alongside) 2 pictures decoded: 380 ms'), L.join('\n'));
    assert.strictEqual(C.text(tl), 'Ready in 6.0 s · longest: smooth check 1.4 s, shaders + textures 1.3 s, warm-up frames 1.0 s, first frame behind the card 0.8 s');
    assert.strictEqual(C.text(null), '');
  });
  await t('"Ready in x s (was y s)" only when clearly sooner (≥ 15 % and ≥ 0.3 s)', () => {
    assert.strictEqual(C.faster(2100, 6800), 'Ready in 2.1 s (was 6.8 s)');
    assert.strictEqual(C.faster(6000, 6800), '', 'only 12 % sooner');
    assert.strictEqual(C.faster(800, 1000), '', 'only 0.2 s sooner');
    assert.strictEqual(C.faster(700, 1000), 'Ready in 0.7 s (was 1.0 s)');
    assert.strictEqual(C.faster(0, 1000), ''); assert.strictEqual(C.faster(500, null), '');
    // the page's own copy of the rule (tools/gameready-page.js, no module there) says the same
    const page = fs.readFileSync(path.join(__dirname, '..', 'tools', 'gameready-page.js'), 'utf8');
    assert.ok(page.includes(`ms > HN.was * ${C.FASTER.ratio}`) && page.includes(`HN.was - ms < ${C.FASTER.ms}`), 'the page uses ReadySpeedCore.FASTER');
  });
  await t('what a run teaches the next: was said once, renderers, one quiet pass after two clean runs', () => {
    let e = null;
    assert.deepStrictEqual(C.hints(e), { was: null, show: false, renderers: null, loads: null, ab: false, quiet: 2 });
    const clean = { compiles: 0, links: 0, uploads: 0 };
    e = C.note(e, { total: 6800, renderers: 1, warm: [{ compiles: 3, links: 2, uploads: 1 }, clean, clean], first5: clean }, 1);
    assert.deepStrictEqual(C.hints(e), { was: 6800, show: true, renderers: 1, loads: null, ab: false, quiet: 2 });
    assert.strictEqual(C.hints(C.note(e, { total: 6000, loads: 7 })).loads, 7, 'an HTML build\'s loads');
    e = C.note(e, { total: 2100, shown: true, renderers: 1, warm: [clean, clean], first5: clean }, 2);
    let h = C.hints(e);
    assert.strictEqual(h.show, false, 'said once'); assert.strictEqual(h.was, 6800, 'was: the first ▶ Play'); assert.strictEqual(h.quiet, 2, 'one clean run is not enough');
    e = C.note(e, { total: 2000, warm: [clean, clean], first5: clean }, 3);
    h = C.hints(e); assert.strictEqual(h.quiet, 1); assert.strictEqual(e.best, 2000); assert.strictEqual(e.runs, 3);
    // a run whose first 5 s compiled something: back to two quiet passes
    const e2 = C.note(e, { total: 2000, warm: [clean], first5: { compiles: 1, links: 1, uploads: 0 } }, 4);
    assert.strictEqual(C.hints(e2).quiet, 2);
    // a warm pass that found work: the count starts again
    assert.strictEqual(C.hints(C.note(e, { total: 2000, warm: [{ compiles: 1 }, clean], first5: clean }, 5)).quiet, 2);
    // Play now / no getting ready: not a time
    const e3 = C.note(e, { total: 300, skipped: true }); assert.strictEqual(e3.best, 2000); assert.strictEqual(e3.runs, 3);
    assert.strictEqual(C.note(e, { total: 300, noPrep: true }).last, 2000);
    // another version of what it remembers: dropped
    assert.deepStrictEqual(C.hints({ ...e, v: C.V + 1 }), { was: null, show: false, renderers: null, loads: null, ab: false, quiet: 2 });
  });
  await t('the A/B verdict reused only with the same key, when it fit, never for a game whose helpers cost frames', () => {
    const fits = { on: 1, off: 1, judge: { slower: false }, turnedOff: [] };
    let e = C.note(null, { total: 5000, ab: fits, abKey: 'k1', first5: { compiles: 0, links: 0, uploads: 0 } });
    assert.strictEqual(C.hints(e, { ab: 'k1' }).ab, true);
    assert.strictEqual(C.hints(e, { ab: 'k2' }).ab, false, 'the game / helpers / screen / look changed');
    assert.strictEqual(C.hints(e, {}).ab, false);
    // a reused run (ab undefined) keeps the verdict
    e = C.note(e, { total: 2000 }); assert.strictEqual(C.hints(e, { ab: 'k1' }).ab, true);
    // the watch switched one off while it played: never skipped again (also with the same key)
    const w = C.note(e, { total: 2000, first5: { compiles: 0, links: 0, uploads: 0, budgetOff: 1 } });
    assert.strictEqual(w.costly, true); assert.strictEqual(C.hints(w, { ab: 'k1' }).ab, false);
    assert.strictEqual(C.hints(C.note(w, { total: 1, ab: fits, abKey: 'k1' }), { ab: 'k1' }).ab, false);
    // the A/B itself turned one off / was slower / skipped: not a fit
    assert.strictEqual(C.abFits({ ...fits, turnedOff: ['look'] }), false);
    assert.strictEqual(C.abFits({ ...fits, judge: { slower: true } }), false);
    assert.strictEqual(C.abFits({ skipped: 'no helpers on' }), false);
    assert.strictEqual(C.abFits(null), false);
    assert.strictEqual(C.hints(C.note(null, { total: 1, ab: { ...fits, turnedOff: ['look'] }, abKey: 'k1' }), { ab: 'k1' }).ab, false);
  });
  await t('the check\'s threshold: within ratio × base + slack', () => {
    assert.deepStrictEqual(C.regression(6000, 4000, { ratio: 0.85, slack: 300 }), { ok: true, ratio: 0.667, limit: 5400, why: '' });
    const r = C.regression(6000, 5600, { ratio: 0.85, slack: 300 }); assert.strictEqual(r.ok, false); assert.ok(/over 5400 ms/.test(r.why));
    assert.strictEqual(C.regression(0, 10).ok, false);
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-readyspeed-test-'));
  await t('the memory per game: kept on disk, read back by a new launch; the A/B key follows files, helpers, screen, look', async () => {
    const game = path.join(dir, 'game'); fs.mkdirSync(path.join(game, 'models'), { recursive: true });
    fs.writeFileSync(path.join(game, 'index.html'), '<!doctype html>'); fs.writeFileSync(path.join(game, 'models', 'a.glb'), 'glb');
    const src = { kind: 'html', path: path.join(game, 'index.html'), title: 'Clink' };
    RS.init({ dataDir: dir });
    const ctx = { kind: 'html', root: game, file: src.path, files: [path.join(game, 'models', 'a.glb')], hz: 120, look: 'best', off: [] };
    // the first ▶ Play knows no files it loaded yet: the folder itself is the key (the same before and after)
    assert.strictEqual(RS.abKey({ ...ctx, files: [] }), RS.abKey(ctx), 'the loaded list is only a fallback');
    assert.strictEqual(RS.abKey({ ...ctx, files: [...ctx.files, src.path] }), RS.abKey(ctx));
    const k1 = RS.abKey(ctx);
    assert.strictEqual(RS.abKey(ctx), k1, 'stable');
    assert.notStrictEqual(RS.abKey({ ...ctx, hz: 60 }), k1); assert.notStrictEqual(RS.abKey({ ...ctx, look: 'balanced' }), k1); assert.notStrictEqual(RS.abKey({ ...ctx, off: ['look'] }), k1);
    fs.writeFileSync(path.join(game, 'models', 'a.glb'), 'glb, changed');
    assert.notStrictEqual(RS.abKey(ctx), k1, 'a file the game loads changed');
    const k1b = RS.abKey(ctx); fs.writeFileSync(path.join(game, 'models', 'b.glb'), 'new'); assert.notStrictEqual(RS.abKey(ctx), k1b, 'a file added'); fs.rmSync(path.join(game, 'models', 'b.glb'));
    const k2 = RS.abKey(ctx);
    // a Lab scene: its built page's own key
    const page = path.join(dir, 'labpage'); fs.mkdirSync(page);
    fs.writeFileSync(path.join(page, 'hearth-play.json'), JSON.stringify({ key: 'aaa' }));
    const l1 = RS.abKey({ kind: 'lab', root: page, hz: 120, look: 'best' });
    fs.writeFileSync(path.join(page, 'hearth-play.json'), JSON.stringify({ key: 'bbb' }));
    assert.notStrictEqual(RS.abKey({ kind: 'lab', root: page, hz: 120, look: 'best' }), l1);
    // Hearth's own helper scripts are part of it (an update measures again)
    const app = path.join(dir, 'app'); fs.mkdirSync(path.join(app, 'tools'), { recursive: true }); fs.writeFileSync(path.join(app, 'tools', 'playbudget-page.js'), 'a');
    RS.init({ appDir: app }); const h1 = RS.abKey(ctx); fs.writeFileSync(path.join(app, 'tools', 'playbudget-page.js'), 'ab'); assert.notStrictEqual(RS.abKey(ctx), h1); RS.init({ appDir: path.join(__dirname, '..') });
    // a run noted, then a "new launch" reads it from disk
    const fits = { on: 1, off: 1, judge: { slower: false }, turnedOff: [] };
    RS.note(src, { total: 6000, renderers: 1, ab: fits, first5: { compiles: 0, links: 0, uploads: 0 } }, k2);
    RS.forget();
    assert.ok(fs.existsSync(RS.file()));
    const h = RS.hints(src, ctx);
    assert.strictEqual(h.was, 6000); assert.strictEqual(h.show, true); assert.strictEqual(h.renderers, 1); assert.strictEqual(h.ab, true); assert.strictEqual(h.abKey, k2);
    assert.strictEqual(RS.get(src).title, 'Clink');
    // another game knows nothing
    assert.deepStrictEqual(RS.hints({ kind: 'lab', id: 'other' }, { kind: 'lab' }).was, null);
    // an unreadable file is never written over
    RS.forget(); fs.writeFileSync(RS.file(), '{ broken');
    RS.note(src, { total: 100 }, k2); RS.flush();
    await new Promise((r) => setTimeout(r, 400));
    assert.strictEqual(fs.readFileSync(RS.file(), 'utf8'), '{ broken');
    RS.forget();
  });
  await t('the window\'s page tag carries the hints only when they apply (gamereadymain.js)', async () => {
    const M = require('../gamereadymain');
    const H = {}; M.register({ handle: (ch, fn) => { H[ch] = fn; } }, { dataDir: path.join(dir, 'tag'), appDir: path.join(__dirname, '..') });
    const src = { kind: 'lab', id: 's1', title: 'Clink' };
    await H['gameready:arm'](null, { kind: 'lab', title: 'Clink', clickAt: 1234.4 });
    let tag = M.pageTag({ root: '', file: 'play.html', source: src, hz: 60, look: 'best', off: [] });
    assert.ok(/[?&]c=1234(&|")/.test(tag) && !/[?&](was|sw|rn|abs|wq)=/.test(tag), tag);
    // a note through the channel, with the key this window was served with
    await H['gameready:speed'](null, { op: 'note', source: src, run: { total: 6000, renderers: 2, ab: { judge: { slower: false }, turnedOff: [] }, first5: { compiles: 0, links: 0, uploads: 0 } } });
    assert.strictEqual((await H['gameready:speed'](null, { op: 'get', source: src })).first, 6000);
    await H['gameready:arm'](null, { kind: 'lab', title: 'Clink', clickAt: 99 });
    tag = M.pageTag({ root: '', file: 'play.html', source: src, hz: 60, look: 'best', off: [] });
    assert.ok(/was=6000/.test(tag) && /sw=1/.test(tag) && /rn=2/.test(tag) && /abs=1/.test(tag) && !/wq=/.test(tag), tag);
    // another screen: the A/B runs again
    await H['gameready:arm'](null, { kind: 'lab', title: 'Clink', clickAt: 99 });
    tag = M.pageTag({ root: '', file: 'play.html', source: src, hz: 144, look: 'best', off: [] });
    assert.ok(!/abs=1/.test(tag) && /rn=2/.test(tag), tag);
    // no getting ready (a check's "before"): no hints
    await H['gameready:arm'](null, { kind: 'lab', title: 'Clink', noPrep: true, clickAt: 99 });
    tag = M.pageTag({ root: '', file: 'play.html', source: src, hz: 60, look: 'best', off: [] });
    assert.ok(/np=1/.test(tag) && !/was=/.test(tag), tag);
    require('../readyspeedmain').flush();
  });
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${n} passed`);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
