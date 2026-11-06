// (round 134, audiomap134) 🎚 Follow the music (docs/upgrades/audiomap134.md), in one check, on the fixture song:
//   1. right-click a slider › 🎚 Follow the music…: the card opens with a band guessed from its name (Glow → Bass, punchy)
//   2. the card's live meter moves while the song plays
//   3. the slider follows the band: its values in the preview correlate with the song's bass energy at the playhead
//   4. Keep is ONE undo step (Ctrl/⌘+Z takes it off whole); a second slider (Tone → Low-mids, from the song's spectrum)
//   5. the 〰 mark on a linked slider, a click opens the card again; a custom range dragged on the spectrum; Cancel
//      puts back what was there
//   6. a render frame (the hidden export page) matches the preview at the same time (both sliders, deterministic)
//   7. an old ♪ Move with the music link (round 38 format) still plays; the card reads it and Cancel leaves it as it
//      was; /move-with's new words (the AI's way in: three_do run)
// Only the check's own temp data (smoke.js) and the fixture song; never an owner's scene.
//   node dev/make-test-song.js /tmp/hearth-autoedit-song.wav 128 0 --form
//   node dev/smoke.js --check-timeout 400000 --script dev/checks/audiomap134.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const SONG = '/tmp/hearth-autoedit-song.wav';
const r3 = (x) => Math.round(Number(x) * 1000) / 1000;
const corr = (x, y) => { const n = x.length; const mx = x.reduce((a, b) => a + b, 0) / n; const my = y.reduce((a, b) => a + b, 0) / n; let sxy = 0; let sx = 0; let sy = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sx += (x[i] - mx) ** 2; sy += (y[i] - my) ** 2; } return sxy / Math.sqrt((sx * sy) || 1); };

try {
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.pane && window.LabMatHook?.host(), 60000);
  const SC = ThreeLab.scenes; const hk = ThreeLab.stageHooks; const C = BeatLinkCore;
  // the background: red = Glow × 0.45, green = Tone (no color management: the pixel is the value)
  const CODE = `import * as THREE from 'three';
THREE.ColorManagement.enabled = false;
const P = tweak({ glow: { value: 0.2, min: 0, max: 2, label: 'Glow' }, tone: { value: 0.1, min: 0, max: 1, label: 'Tone' }, size: { value: 1, min: 0.2, max: 3, label: 'Size' } });
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.set(0, 0, 5);
const cube = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshBasicMaterial({ color: '#3050ff' }));
scene.add(cube);
renderer.setAnimationLoop(() => { scene.background.setRGB(Math.min(1, P.glow * 0.45), Math.min(1, P.tone), 0); cube.scale.setScalar(P.size); renderer.render(scene, camera); });`;
  const layers = [ThreeLayers.defaults({ id: 'amMain', name: 'Main', code: CODE, slot: 0 })];
  const sk = SC.create({ name: 'Follow the music check', code: CODE, layers, frame: '16:9' });
  SC.open(sk.id);
  await until(() => SC.currentId() === sk.id && hk.ctlOf('amMain')?.controls().some((c) => c.key === 'size'), 20000);
  const ctl = () => hk.ctlOf('amMain');
  const r0 = await cmd.loadSong(SONG);
  const P = hk.player;
  await until(() => P.loaded && P.analysis?.spec?.data?.length && P.analysis?.sections?.length >= 3, 60000);
  step('the fixture song loads; its analysis has the small spectrum', Boolean(P.analysis?.spec?.edges?.length === 20), { ok: r0?.ok, bands: P.analysis?.spec?.edges?.length, frames: P.analysis?.spec ? P.analysis.spec.data.length / 20 : 0 });
  const D = ThreeLab.director;
  const ev = async (code) => { for (let i = 0; i < 5; i++) { const e = await D.evalInSketch(code); if (e?.ok) return e.value; await wait(250); } return null; };
  const rowOf = (key) => document.querySelector(`.tweaks [data-tw-key="${key}"]`);
  await until(() => rowOf('glow'), 8000);
  const drop = P.analysis.sections.find((s) => s.label === 'Drop') || P.analysis.sections[1];

  // ---------- 1. right-click › 🎚 Follow the music…: the card, with a guess ----------
  const u0 = ctl().undoDepth;
  {
    const row = rowOf('glow'); const rr = row.getBoundingClientRect();
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rr.left + 30, clientY: rr.top + 8 }));
    await wait(250);
    const mi = [...document.querySelectorAll('.mb-menu .menu-item')].find((x) => /Follow the music…/.test(x.textContent) && /🎚/.test(x.textContent));
    step('right-click a slider: a "🎚 Follow the music…" row', Boolean(mi));
    mi?.click();
  }
  const card = await until(() => typeof FollowMusic !== 'undefined' && FollowMusic.card, 15000);
  const dr = card?.draft || {};
  step('the card opens (its group loaded on first use) with a band picked from the name and the song: Glow → Bass, punchy', dr.band === 'bass' && dr.resp === 'punchy' && /Glow/.test(card.why) && dr.hi > dr.lo, { draft: dr, why: card?.why });
  step('…the slider follows it already as a preview (no undo step yet)', ctl().binding('glow')?.resp === 'punchy' && ctl().undoDepth === u0, { link: ctl().binding('glow'), undo: ctl().undoDepth - u0 });

  // ---------- 2 + 3. play: the meter moves, the slider follows the bass ----------
  {
    // (a seek right after the song loads can be lost: seek until the playhead is there, then play)
    const at = Math.max(0, drop.start - 2);
    const seekLog = [];
    // (play first, then seek while it plays: a play could start from the loop's start instead of the playhead)
    cmd.play(true); await wait(300);
    // (and stays there: a song element that just loaded can start again from 0 once it plays; then seek again)
    await until(async () => {
      const t1 = Number(await ev('audio.time'));
      if (!(t1 >= at - 0.05 && t1 < at + 2)) { cmd.seek(at); await wait(400); }
      const a1 = Number(await ev('audio.time')); await wait(400); const a2 = Number(await ev('audio.time'));
      seekLog.push([r3(P.time), r3(a1), r3(a2), P.playing]);
      return a1 >= at - 0.05 && a2 > a1 && a2 < at + 2.5;
    }, 20000);
    out.seekLog = seekLog.slice(0, 12);
    const meter = []; const samples = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 6000) {
      const fill = document.querySelector('.fm-pop .fm-fill'); const m = /scaleX\(([\d.]+)\)/.exec(fill?.style.transform || '');
      if (m) meter.push(Number(m[1]));
      const v = await ev('JSON.stringify([audio.time, __slider("glow")])');
      if (v) samples.push(JSON.parse(v));
      await wait(30);
    }
    cmd.play(false);
    out.timeLog = samples.filter((_, k) => k % 8 === 0).map((s) => r3(s[0])).concat([r3(P.time)]);
    const distinct = new Set(meter.map((x) => Math.round(x * 50))).size;
    step('while the song plays, the card\'s live meter moves', meter.length > 20 && distinct >= 6 && Math.max(...meter) - Math.min(...meter) > 0.15, { n: meter.length, distinct, min: r3(Math.min(...meter)), max: r3(Math.max(...meter)), t: samples.length ? [r3(samples[0][0]), r3(samples[samples.length - 1][0])] : null, drop: r3(drop.start) });
    const bass = C.envOf(P.analysis.bass, P.analysis.fps || 30);
    const xs = samples.map(([t]) => bass(t)); const ys = samples.map(([, v]) => v);
    const c = corr(xs, ys);
    step('the slider follows the band: its values in the preview correlate with the song\'s bass at the playhead', samples.length > 40 && c > 0.55 && Math.max(...ys) - Math.min(...ys) > 0.2, { n: samples.length, corr: r3(c), min: r3(Math.min(...ys)), max: r3(Math.max(...ys)) });
    step('…the card shows the slider moving too', card.last?.value != null, card.last);
  }

  // ---------- 4. Keep = one undo step ----------
  document.querySelector('.fm-pop .fm-keep')?.click();
  await wait(200);
  const kept = ctl().binding('glow');
  step('Keep: the link is kept, ONE undo step, the card closes', kept?.resp === 'punchy' && kept.band === 'bass' && ctl().undoDepth === u0 + 1 && !FollowMusic.card, { link: kept, undo: ctl().undoDepth - u0 });
  ctl().undo(); await wait(200);
  step('one Ctrl/⌘+Z takes it off whole (no 〰 mark)', !ctl().binding('glow') && !rowOf('glow')?.querySelector('.am-mark:not([hidden])'), ctl().binding('glow'));
  // back, through the card again (Enter keeps), then Tone: Low-mids, smooth (from the song's spectrum)
  await ctl().openFollow('glow'); await until(() => FollowMusic.card, 4000);
  document.querySelector('.fm-pop .fm-keep')?.click(); await wait(150);
  const glowL = ctl().binding('glow');
  await ctl().openFollow('tone'); await until(() => FollowMusic.card?.a?.key === 'tone', 4000);
  const td = FollowMusic.card?.draft || {};
  step('Tone → Low-mids, smooth (its name; the song\'s spectrum drives it)', td.band === 'lowmids' && td.resp === 'smooth', td);
  document.querySelector('.fm-pop .fm-keep')?.click(); await wait(150);
  const toneL = ctl().binding('tone');

  // ---------- 5. the 〰 mark; a custom range on the spectrum; Cancel ----------
  {
    const mark = await until(() => rowOf('glow')?.querySelector('.am-mark:not([hidden])'), 4000);
    step('the 〰 mark on a linked slider', Boolean(mark) && /Bass/.test(mark?.title || ''), mark?.title);
    const u1 = ctl().undoDepth;
    mark?.click();
    const c2 = await until(() => FollowMusic.card, 6000);
    step('…a click on it opens the card again, on what it follows', c2?.draft?.band === 'bass' && c2?.draft?.resp === 'punchy', c2?.draft);
    const cv = document.querySelector('.fm-pop .fm-spec');
    if (cv) {
      const r = cv.getBoundingClientRect(); const y = r.top + r.height / 2;
      const pe = (type, x) => cv.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, button: 0, clientX: x, clientY: y }));
      pe('pointerdown', r.left + r.width * 0.45); for (let k = 1; k <= 4; k++) { pe('pointermove', r.left + r.width * (0.45 + 0.05 * k)); await wait(16); } pe('pointerup', r.left + r.width * 0.65);
    }
    await wait(150);
    const cd = FollowMusic.card?.draft || {};
    step('drag across the spectrum: a Custom range (Hz), the slider follows it as a preview', cd.band === 'custom' && cd.fLo > 100 && cd.fHi > cd.fLo && ctl().binding('glow')?.band === 'custom', { fLo: cd.fLo, fHi: cd.fHi });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(150);
    if (FollowMusic.card) { FollowMusic.close('cancel'); await wait(100); }
    step('Esc (Cancel): the link is back as it was, no undo step', JSON.stringify(ctl().binding('glow')) === JSON.stringify(glowL) && ctl().undoDepth === u1, { link: ctl().binding('glow'), undo: ctl().undoDepth - u1 });
  }

  // ---------- 6. a render frame = the preview at the same time ----------
  {
    const T = [drop.start + 1.37, drop.start + 2.11, Math.max(0.5, drop.start - 6.4)];
    const prev = [];
    for (const t of T) { cmd.seek(t); await wait(350); const v = await ev('JSON.stringify([audio.time, __slider("glow"), __slider("tone")])'); prev.push(v ? JSON.parse(v) : null); }
    const shoot = async () => (await LabExport.probe({ w: 64, h: 36, F: 30, n: T.length, times: (j) => T[j] })).frames;
    const px = async (buf) => { const bm = await createImageBitmap(new Blob([buf], { type: 'image/jpeg' })); const cv = new OffscreenCanvas(bm.width, bm.height); const g = cv.getContext('2d'); g.drawImage(bm, 0, 0); const d = g.getImageData(0, 0, 6, 6).data; let r = 0; let gg = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; } return [r / (d.length / 4), gg / (d.length / 4)]; };
    try {
      const fr = await shoot();
      const got = await Promise.all(fr.map(px));
      const want = prev.map((p) => (p ? [Math.min(1, p[1] * 0.45) * 255, Math.min(1, p[2]) * 255] : [NaN, NaN]));
      const diff = got.map((g, j) => Math.max(Math.abs(g[0] - want[j][0]), Math.abs(g[1] - want[j][1])));
      const spread = Math.max(...want.map((w) => w[0])) - Math.min(...want.map((w) => w[0]));
      step('a render frame matches the preview at the same time (Glow from the bass, Tone from the spectrum)', diff.every((x) => x < 8) && spread > 10, { t: T.map(r3), preview: prev.map((p) => p && [r3(p[0]), r3(p[1]), r3(p[2])]), render: got.map((g) => g.map(Math.round)), want: want.map((w) => w.map(Math.round)) });
      const fr2 = await shoot();
      const same = fr.length === fr2.length && fr.every((f, i) => { const a = new Uint8Array(f); const b = new Uint8Array(fr2[i]); return a.length === b.length && a.every((v, k) => v === b[k]); });
      step('…and the same pixels the second time (deterministic from the analysis)', same);
    } catch (err) { step('renders from the export page', false, String(err?.message || err)); }
  }

  // ---------- 7. an old ♪ Move with the music link still plays; /move-with's new words ----------
  {
    const old = { band: 'kick', how: 'pulse', lo: 1, hi: 2.6, att: 0, dec: 180, amount: 0.571 };
    ctl().link('size', old); await wait(200);
    cmd.seek(drop.start + 1); cmd.play(true); await wait(400);
    const vals = []; const t0 = performance.now();
    while (performance.now() - t0 < 2500) { const v = await ev('__slider("size")'); if (v != null) vals.push(Number(v)); await wait(25); }
    cmd.play(false);
    step('an old beat link (round 38: kick, pulse) still plays as before', vals.length > 20 && Math.max(...vals) > 2.0 && Math.min(...vals) < 1.3, { n: vals.length, min: r3(Math.min(...vals)), max: r3(Math.max(...vals)) });
    const u2 = ctl().undoDepth;
    let err3 = null; try { await ctl().openFollow('size'); } catch (e) { err3 = String(e?.message || e); }
    const c3 = await until(() => (FollowMusic.card?.a?.key === 'size' ? FollowMusic.card : null), 4000);
    step('…the card reads it (Kick, punchy) and Cancel leaves it exactly as it was', c3?.draft?.band === 'kick' && c3?.draft?.resp === 'punchy', { draft: c3?.draft, err3, key: FollowMusic.card?.a?.key, toasts: (window.recentToasts?.() || []).slice(-2).map((x) => String(x?.text || x).slice(0, 120)) });
    FollowMusic.close('cancel'); await wait(150);
    step('…unchanged, no undo step', JSON.stringify(ctl().binding('size')) === JSON.stringify(old) && ctl().undoDepth === u2, ctl().binding('size'));
    let said = '';
    await Commands.tryRun('/move-with size bass punchy invert', H.claudeAgent().id, null, { say: (t) => { said = String(t); }, note: (t) => { said = String(t); }, error: (t) => { said = `error: ${t}`; } });
    await wait(200);
    const mw = ctl().binding('size');
    step('/move-with size bass punchy invert (a director\'s way, through three_do run): one link with the same fields', mw?.band === 'bass' && mw.resp === 'punchy' && mw.inv === true && ctl().undoDepth === u2 + 1, { said, link: mw });
    const saved = await until(async () => { const ex = await window.hub.kvGet('three-lab-extras', {}); const s = JSON.stringify(ex?.[sk.id] || null); return /"lowmids"/.test(s) && /"inv":true/.test(s) ? s : null; }, 6000);
    step('saved with the scene\'s links (what renders, the sequence and ◉ Perform read)', Boolean(saved) && /"resp":"smooth"/.test(saved) && /"inv":true/.test(saved), saved ? saved.slice(0, 600) : 0);
  }
  void toneL;
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 600));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
