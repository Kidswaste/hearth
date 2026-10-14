#!/usr/bin/env node
// (round 37, directorlean) The Three Director's leaner results: the pure helpers (diff of a known copy, the outline,
// layer lines, the one-line transport, slider notes) and the per-chat session memory, driven through the real
// tools/three-director.js on the fake Lab (dev/directorlean-lab.js). Also: the per-ask numbers stay well below the
// round 36 version's (dev/directorlean-measure.js).   node dev/directorlean-test.js
const path = require('path');
const { session, loadDirector, dimsOf, TUNNEL, BIG, SPARKLES } = require('./directorlean-lab');

const fails = [];
const check = (ok, what) => { console.log(`${ok ? '✓' : '✖'} ${what}`); if (!ok) fails.push(what); };

(async () => {
  const { D } = loadDirector('work');
  const T = D._test;
  // ---------- pure helpers ----------
  check(T.codeDiff(TUNNEL, TUNNEL) === null, 'codeDiff: same text → null');
  const one = TUNNEL.replace('speed: { value: 0.8,', 'speed: { value: 1.6,');
  const dd = T.codeDiff(TUNNEL, one);
  check(/^@@ \d+\n- .*0\.8.*\n\+ .*1\.6/.test(dd || ''), `codeDiff: one changed line → a hunk with its new line number (${(dd || '').split('\n')[0]})`);
  check(T.codeDiff(TUNNEL, SPARKLES) === null, 'codeDiff: a different layer → null (send it whole)');
  const ol = T.outline(BIG);
  check(BIG.split('\n').length > T.OUTLINE_AT && /^\s+\d+\| const P = tweak\(/m.test(ol) && /function helper3\(/.test(ol) && /\| function build\(\)/.test(ol) && ol.length < BIG.length / 3, `outline: line-numbered marks (${ol.split('\n').length} lines for a ${BIG.split('\n').length}-line layer)`);
  check(T.outline('const a = 1;\n'.repeat(5) + 'function x() {}', 160).split('\n').length === 1, 'outline: only the marks');
  const L = { name: 'Sparkles', selected: true, kind: 'particles (GPU: three_do particles)', visible: false, opacity: 0.5, blend: 'add', plays: { from: 8, to: 'end', fadeIn: 1, fadeOut: 0 }, sliders: ['Size', 'Glow'], keyframes: { opacity: ['0s=0', '8s=1'] } };
  check(T.layerLine(L, 1) === '2. Sparkles* · particles (GPU: three_do particles) · hidden · opacity 0.5 · add · plays 8–end s fade in 1 · sliders: Size, Glow · keys: opacity 0s=0, 8s=1', `layerLine: everything that isn't the default, one line (${T.layerLine(L, 1)})`);
  check(T.layerLine({ name: 'Tunnel', visible: true, opacity: 1, blend: 'normal', plays: 'whole song', sliders: ['a', 'b', 'c'] }, 0, { lines: 102, sliders: 'count' }) === '1. Tunnel · 102 lines · 3 sliders', 'layerLine: defaults left out, counts for the outline');
  check(T.mediaLine({ loaded: true, file: 'C:\\m\\song.mp3', playing: true, time: 64.13, duration: 192.3, loop: { start: 32, end: 48, locked: true, on: true } }) === 'song.mp3 playing at 64.1 / 192.3 s · loop 32.0–48.0 s (locked) (three_do media_info: grid, sections, hits)', 'mediaLine: the transport in one line');
  check(/^scene timeline paused at 2\.0 \/ 8\.0 s \(frame 60\)$/.test(T.mediaLine({ loaded: false, sceneTimeline: { seconds: 8, fps: 30, time: 2, frame: 60, playing: false } })) && /No music/.test(T.mediaLine({ loaded: false, note: 'No music loaded.' })), 'mediaLine: the scene\'s own timeline, no music');
  const sn = T.sliderNote([{ key: 'a', value: 1, label: 'A' }, { key: 'b', value: 2, label: 'B', followsMusic: { source: 'kick' } }]);
  check(Array.isArray(sn) && sn.length === 2 && /♪kick/.test(sn[1]) && /^2 in the code/.test(sn[0]), 'sliderNote: the count + only what the code doesn\'t say (music links)');
  check(/^1 in the code's tweak\(\) block/.test(T.sliderNote([{ key: 'a', value: 1 }])) && T.sliderNote([]) === undefined, 'sliderNote: plain sliders are one line');
  check(T.unsavedLines([{ name: 'Speed', line: 12, inCode: '0.8', slider: 1.4 }])[0] === 'Speed (line 12): 0.8 in the code → 1.4 on the slider', 'unsaved sliders as lines');
  check(!('sliders' in T.namesOff({ sliders: '3: a, b, c' })) && T.namesOff({ sliders: 'none: add named controls with tweak()' }).sliders, 'namesOff: the names list goes, the "add sliders" nudge stays');

  // ---------- the session memory ----------
  {
    const s = session('work');
    s.turn();
    const a = await s.call('three_read_code', { layer: 'Tunnel' });
    const b = await s.call('three_read_code', { layer: 'Tunnel' });
    check(a.textTok > 900 && /unchanged since you read it earlier in this reply/.test(b.text) && b.textTok < 30, `same reply: a re-read is one line (${a.textTok} → ${b.textTok} tokens)`);
    s.done(); s.turn();
    const c = await s.call('three_read_code', { layer: 'Tunnel', from: 5, to: 20 });
    check(/unchanged since you read them 1 message ago/.test(c.text), 'next message, same session: a range of a layer it has is one line');
    const f = await s.call('three_read_code', { layer: 'Tunnel', force: true });
    check(f.textTok > 900, 'force: true re-sends it');
    s.lab.ownerEdit('Tunnel', 'bloom: { value: 1.1,', 'bloom: { value: 1.3,');
    const g = await s.call('three_read_code', { layer: 'Tunnel' });
    check(/changed since you read it/.test(g.text) && /^\+ .*1\.3/m.test(g.text) && g.textTok < 80, `an owner's edit: only the changed lines (${g.textTok} tokens)`);
    const h = await s.call('three_get_code', {});
    check(/unchanged since you read it/.test(h.text) && /1\. Tunnel\* · 102 lines · 13 sliders/.test(h.text), 'get_code: the outline line per layer, the code it has is one line');
  }
  {
    // error → forgotten; handover (the session dropped after the message went) → forgotten
    const s = session('work');
    s.turn(); await s.call('three_read_code', { layer: 'Tunnel' }); s.done();
    s.turn();
    s.D._test.endTurn({ type: 'error' }, s.chat);
    const e = await s.call('three_read_code', { layer: 'Tunnel' });
    check(e.textTok > 900, 'a reply that ended in an error: the next one sends the code again');
    s.done(); s.turn(); await s.call('three_read_code', { layer: 'Tunnel' }); s.done();
    s.turn();
    s.chat.session = {}; // DirectorTask.handover / a compact after the message hook
    const h = await s.call('three_read_code', { layer: 'Tunnel' });
    check(h.textTok > 900, 'the session dropped after the message went (handover, compact): sent again');
  }
  {
    const s = session('work');
    s.turn(); await s.call('three_read_code', { layer: 'Glow' }); s.done();
    for (let i = 0; i < 9; i += 1) { s.turn(); s.done(); }
    s.turn();
    const r = await s.call('three_read_code', { layer: 'Glow' });
    check(!/unchanged/.test(r.text), 'older than 8 messages: sent again');
    // a new chat (no session yet)
    const s2 = session('work', { chatId: 'chat-2' });
    s2.turn(); const x = await s2.call('three_read_code', { layer: 'Glow' });
    check(!/unchanged/.test(x.text), 'another chat has its own memory');
  }
  {
    // calls without a chat: the old rule (this reply only)
    const s = session('work');
    const { D: D2 } = s;
    const noChat = async (t, a) => D2.handle(t, a, s.lab.d, {});
    await noChat('three_read_code', { layer: 'Glow' });
    check(/earlier in this reply/.test((await noChat('three_read_code', { layer: 'Glow' })).value), 'no chat: within the reply');
    D2.newTurn();
    check(!/unchanged/.test((await noChat('three_read_code', { layer: 'Glow' })).value), 'no chat: a new message resets it');
  }
  {
    // what it wrote is known: add_layer code / edit of a known copy / set_code
    const s = session('work');
    s.turn();
    const add = await s.call('three_add_layer', { name: 'Sparks B', code: SPARKLES });
    check(!/Spark color/.test(add.text) && !/^sliders:/m.test(add.text), `add_layer with code: no slider table (it wrote them) (${add.textTok} tokens)`);
    const tpl = await s.call('three_add_layer', { name: 'Pink glow', template: 'glow' });
    check(/strength = 0\.9 · Strength \[0–3\]/.test(tpl.text), 'add_layer with a template: its sliders as lines');
    s.done(); s.turn();
    const r = await s.call('three_read_code', { layer: 'Sparks B' });
    check(/unchanged since you wrote it 1 message ago/.test(r.text), 'a layer it wrote: a later read is one line');
    await s.call('three_get_code', {}); // Pink glow selected: read whole
    await s.call('three_read_code', { layer: 'Tunnel' });
    await s.call('three_edit_code', { layer: 'Tunnel', edits: [{ find: 'twist: { value: 0.35,', replace: 'twist: { value: 0.9,' }] });
    const r2 = await s.call('three_read_code', { layer: 'Tunnel' });
    check(/unchanged since you wrote it/.test(r2.text), 'an edit of a layer it had: it has the result');
    // safe: true that reverts → the known copy goes back too
    s.lab.breakLayer('Tunnel', 30, 'nope is not defined', 1);
    const origUpdate = s.lab.d.updateLayer;
    s.lab.d.updateLayer = async (ref, patch, w) => { const out = await origUpdate(ref, patch, w); if (patch.code && /nope/.test(patch.code)) { s.lab.breakLayer('Tunnel', 30, 'nope is not defined', 1); return { ...out, errors: s.lab.S.errors }; } return out; };
    const bad = await s.call('three_edit_code', { layer: 'Tunnel', safe: true, edits: [{ find: 'scene.add(group);', replace: 'scene.add(group); nope.x;' }] });
    s.lab.d.updateLayer = origUpdate;
    const r3 = await s.call('three_read_code', { layer: 'Tunnel' });
    check(/undone/.test(bad.text) && /unchanged since you wrote it/.test(r3.text), 'a safe edit that was undone: the code it has is the one before');
  }
  {
    // get_code: whole up to 160 lines, an outline past it; sliders when the code is in hand
    const s = session('work', { big: true });
    s.turn();
    const g = await s.call('three_get_code', {});
    check(/^outline:/m.test(g.text) && /three_read_code \(from \/ to\)/.test(g.text) && /count = 24 · Rings/.test(g.text) && g.textTok < 700, `get_code past 160 lines: the outline + its sliders (${g.textTok} tokens for ${BIG.split('\n').length} lines)`);
    const s2 = session('work');
    s2.turn();
    await s2.call('three_select_layer', { layer: 'Sparkles' });
    const g2 = await s2.call('three_get_code', {});
    check(/in the code's tweak\(\) block; these also:/.test(g2.text) && /♪kick/.test(g2.text) && !/size = 0\.06/.test(g2.text), 'get_code with the code: sliders as a count + music links (no table)');
    await s2.call('three_sliders', { layer: 'Sparkles', set: { size: 0.1 } });
    const g3 = await s2.call('three_get_code', {});
    check(/unsavedSliders:\n {2}Size \(line \d+\): 0\.06 in the code → 0\.1 on the slider/.test(g3.text) && /keep their values/.test(g3.text), 'get_code: unsaved slider moves as lines + the keep-them note');
  }
  {
    // sliders: a move answers with what moved; a re-read of the same table is one line
    const s = session('work');
    s.turn();
    const m = await s.call('three_sliders', { layer: 'Sparkles', set: { burst: 2, nope: 1 } });
    check(/moved:\n {2}burst = 2 · Kick burst/.test(m.text) && /notSet: nope/.test(m.text) && /others: 7 unchanged/.test(m.text), 'sliders set: the moved ones, what wasn\'t set, a count of the rest');
    const r1 = await s.call('three_sliders', { layer: 'Sparkles' });
    const r2 = await s.call('three_sliders', { layer: 'Sparkles' });
    check(r1.textTok > 60 && /unchanged since you read them/.test(r2.text), 'sliders read twice: the second is one line');
  }
  {
    // pictures: small by default, a later one in the same reply a thumbnail, a named size as asked
    const s = session('work');
    s.turn();
    const p1 = await s.call('three_screenshot', {});
    s.lab.S.pixel += 20;
    const p2 = await s.call('three_screenshot', {});
    s.lab.S.pixel += 20;
    const p3 = await s.call('three_screenshot', { size: 'medium' });
    check(p1.pics[0].h === 512 && p2.pics[0].h === 384 && /later picture/.test(p2.text) && p3.pics[0].h === 768, `screenshots: ${p1.pics[0].w}×${p1.pics[0].h} (${p1.picTok} tok), later ${p2.pics[0].w}×${p2.pics[0].h} (${p2.picTok}), medium asked ${p3.pics[0].w}×${p3.pics[0].h}`);
    await s.call('three_screenshot', {});
    const p4 = await s.call('three_screenshot', {});
    check(!p4.pics.length && /No visible change/.test(p4.text), 'an unchanged view later in the reply: a note, no picture');
    s.done(); s.turn();
    check((await s.call('three_screenshot', {})).pics[0].h === 512, 'a new message: the first picture is small again');
  }
  {
    // the Lab's own answers trimmed
    const s = session('work');
    s.turn();
    const mc = await s.call('three_media_control', { action: 'seek', time: 64.1 });
    check(/^night-drive\.mp3 paused at 64\.1 \/ 192\.3 s/.test(mc.text) && mc.textTok < 30, `media_control seek: one line (${mc.textTok} tokens)`);
    const mi = await s.call('three_media_info', {});
    check(/energyEvery5s/.test(mi.text), 'media_info keeps everything (asked for)');
    const ip = await s.call('three_input', { actions: [{ click: [0.5, 0.5] }], screenshot: true });
    check(Math.max(ip.pics[0].w, ip.pics[0].h) === 512, `a play-test's picture: ${ip.pics[0].w}×${ip.pics[0].h} (was the full 1080×1920 PNG)`);
    const cs = await s.call('three_contact_sheet', {});
    check(Math.max(cs.pics[0].w, cs.pics[0].h) === 1024, `the contact sheet fits 1024 px (${cs.pics[0].w}×${cs.pics[0].h}, ${cs.picTok} tokens)`);
    const ly = await s.call('three_layers', {});
    check(/^layers:\n1\. Tunnel\* · sliders: Rings, Radius/m.test(ly.text) && /\(bottom first, \* = selected\)/.test(ly.text) && !/"order"/.test(ly.text), 'layers: one line per layer');
    const c1 = await s.call('three_console', {});
    const c2 = await s.call('three_console', {});
    check(/tunnel: 24 rings/.test(c1.text) && /no new lines/.test(c2.text) && !/tunnel: 24 rings/.test(c2.text), 'console: only lines it hasn\'t had');
  }
  {
    // the same calls give the same bytes (stable for the cache, no times / random ids)
    const texts = [];
    for (let i = 0; i < 2; i += 1) {
      const s = session('work');
      s.turn();
      const t = [];
      for (const [tool, a] of [['three_get_code', {}], ['three_layers', {}], ['three_sliders', { layer: 'Glow' }], ['three_edit_code', { edits: [{ find: 'gap: { value: 0.9,', replace: 'gap: { value: 1.2,' }] }]]) t.push((await s.call(tool, a)).text.replace(/\d+ ms/g, 'N ms'));
      texts.push(t.join('\n'));
    }
    check(texts[0] === texts[1], 'the same calls on the same scene: byte-identical results');
  }
  {
    // the owner's /director-shot-size still wins
    const { D: D4, store } = loadDirector('work');
    store.set('director.shotSize', 'medium');
    const lab = require('./directorlean-lab').fakeLab();
    const r = await D4.handle('three_screenshot', {}, lab.d, {});
    check(dimsOf(r.images[0].data).h === 768, '/director-shot-size medium: the default picture is 768 px');
  }
  // ---------- the measured asks: far below round 36 ----------
  const out = JSON.parse(require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'directorlean-measure.js'), '--json'], { encoding: 'utf8' }));
  const [b, a] = out.totals.total;
  check(a < b * 0.45, `typical asks: ${b} → ${a} tokens added to the session (${Math.round((1 - a / b) * 100)} % less)`);
  check(out.rows.every((r) => r.after.total <= r.before.total), 'no ask got heavier');
  console.log(fails.length ? `\n${fails.length} failed` : '\nall passed');
  process.exit(fails.length ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
