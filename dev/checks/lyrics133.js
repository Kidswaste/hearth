// (round 133, lyrics133) 🎤 Lyrics synced to the song (docs/upgrades/lyrics133.md), in one check, by clicks where it can:
//   1. Sections ▾ › 🎤 Lyrics… opens the card; Paste… (8 plain lines) is kept with the scene; ✦ Auto-time puts every
//      line on a bar line of the song's grid, inside the sung sections (not the intro / outro), in order; the lane
//      under the song shows a block per line
//   2. dragging a block moves that line onto a beat; ONE Ctrl/⌘+Z puts the lines back exactly
//   3. 🎤 Tap to time: Space at three moments a little off the beat → each line starts on the nearest beat; Enter keeps
//      them; ONE Ctrl/⌘+Z puts them back
//   4. an .lrc keeps its own times (to the millisecond)
//   5. ＋ Add a lyrics layer: a 🅰 layer whose page shows the current line at the right time (line 2 inside its time,
//      line 3 after); a style from the list (Punchy) changes its sliders, one Ctrl/⌘+Z back
//   6. nothing was sent to any AI so far; ✦ Style the lyrics shows the cost first (Cancel: nothing sent); OK sends ONE
//      message; the fake director keyframes a style per section; /undo-edit takes its whole reply back
// Only the check's own temp data (smoke.js) and the fixture song; never an owner's scene.
//   node dev/make-test-song.js /tmp/hearth-autoedit-song.wav 128 0 --form
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/lyrics133.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const SONG = '/tmp/hearth-autoedit-song.wav';
const LYRICS = ['[Verse]', 'City lights are calling out my name', 'We run until the morning comes', 'Hold on, hold on', 'Every heartbeat turns the night to gold', '', 'Raise your hands up to the sky', 'Louder now', 'We never let it go', 'Sing it till the sun comes up'].join('\n');

try {
  await Commands.tryRun('/director-setup', H.claudeAgent().id);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const agent = H.agents().find((a) => a.dock === 'three');
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.pane && window.LabMatHook?.host(), 60000);
  const SC = ThreeLab.scenes; const hk = ThreeLab.stageHooks; const d = ThreeLab.director;
  // nothing reaches an AI without a click: every send and helper pass from here on is counted
  const sent = []; const asked = [];
  const send0 = Native.send.bind(Native); Native.send = (...a) => { sent.push(String(a[1] || '').slice(0, 60)); return send0(...a); };
  try { const ask0 = window.hub.askOnce; if (ask0) window.hub.askOnce = (...a) => { asked.push(1); return ask0(...a); }; } catch { /* a frozen bridge: the director's sends are what count */ }
  const CODE = "import * as THREE from 'three';\nconst P = tweak({ glow: [0.5, 0, 2] });\nconst renderer = new THREE.WebGLRenderer({ alpha: true });\nrenderer.setSize(innerWidth, innerHeight);\ndocument.body.append(renderer.domElement);\nrenderer.setAnimationLoop(() => renderer.clear());";
  const sk = SC.create({ name: 'Lyrics check', code: CODE, layers: [ThreeLayers.defaults({ id: 'lyBase', name: 'Base', code: CODE, slot: 0 })], frame: '16:9' });
  SC.open(sk.id);
  await until(() => SC.currentId() === sk.id, 20000);
  await cmd.loadSong(SONG);
  const P = hk.player;
  await until(() => P.loaded && P.analysis?.sections?.length >= 4, 60000);
  const M = LabType.music();
  const beat = 60 / M.bpm; const bar = beat * (M.bpb || 4); const db = M.downbeat || 0;
  const onGrid = (t, unit) => { const k = (t - db) / unit; return Math.abs(k - Math.round(k)) < 0.004; };
  const nearestBeat = (t) => M.beats.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), M.beats[0]);
  step('the fixture song loads and is analyzed', P.analysis.sections.length >= 4, { bpm: M.bpm, sections: P.analysis.sections.map((s) => `${s.label}@${Math.round(s.start)}`) });
  const zKey = async () => { hk.pane.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true })); await wait(500); };
  const scene = () => JSON.stringify(hk.lyrics()?.lines || null);

  // ---------- 1. the card from Sections ▾, paste, ✦ Auto-time ----------
  const secBtn = [...P.el.querySelectorAll('button')].find((b) => /^Sections/.test(b.textContent));
  secBtn?.click();
  const row = await until(() => [...document.querySelectorAll('.mb-menu .menu-item, #menu button')].find((x) => /Lyrics synced/.test(x.textContent)), 4000);
  row?.click();
  let pop = await until(() => document.querySelector('.ly-pop'), 8000);
  if (!pop) { await Lazy.load('lyrics'); LabLyrics.open(); pop = await until(() => document.querySelector('.ly-pop'), 4000); }
  step('Sections ▾ › 🎤 Lyrics synced to the song… opens the small card', Boolean(row && pop), { row: Boolean(row) });
  document.querySelector('.ly-pop .ly-paste')?.click();
  const dlg = await until(() => document.querySelector('dialog[open] textarea'), 5000);
  if (dlg) { dlg.value = LYRICS; dlg.dispatchEvent(new Event('input', { bubbles: true })); [...dlg.closest('dialog').querySelectorAll('button')].find((b) => b.textContent.trim() === 'OK')?.click(); }
  await until(() => (hk.lyrics()?.lines || []).length === 8, 8000);
  step('Paste…: the 8 lyric lines are kept with the scene ([Verse] and the blank line dropped)', (hk.lyrics()?.lines || []).length === 8 && SC.get(sk.id).lyrics?.lines?.[0]?.[2] === 'City lights are calling out my name', hk.lyrics()?.lines?.map((x) => x[2]));
  document.querySelector('.ly-pop .ly-auto')?.click();
  await until(() => LabLyrics.stats.writes >= 2, 6000);
  const L1 = LabLyrics.now().lines;
  const sung = P.analysis.sections.filter((s) => !/intro|outro/i.test(s.label || ''));
  const inSung = (t) => sung.some((s) => t >= s.start - bar / 2 && t < s.end);
  step('✦ Auto-time puts every line on a bar line, in the sung sections, in order', L1.length === 8 && L1.every((x) => onGrid(x.a, bar)) && L1.every((x) => inSung(x.a)) && L1.every((x, i) => i === 0 || x.a > L1[i - 1].a) && L1.every((x) => x.b > x.a),
    L1.map((x) => `${x.a}–${x.b}`));
  await wait(400);
  const blocks = () => [...document.querySelectorAll('.ly-lane .ly-blk')];
  step('the lane under the song shows a block per line', document.querySelector('.media-bar .ly-lane') && blocks().length === 8, { blocks: blocks().length });

  // ---------- 2. drag one block: on a beat, one undo ----------
  const s2 = scene();
  P.redraw?.(); await wait(300);
  const blk = blocks()[2];
  const r = blk.getBoundingClientRect();
  const fire = (type, x) => blk.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 7, clientX: x, clientY: r.top + 4 }));
  fire('pointerdown', r.left + 4); fire('pointermove', r.left + 20); fire('pointermove', r.left + 37); fire('pointerup', r.left + 37);
  await until(() => scene() !== s2, 5000);
  const L2 = LabLyrics.now().lines;
  step('dragging a line moves it onto a beat (its neighbours untouched)', L2[2].a > L1[2].a && onGrid(L2[2].a, beat) && L2[3].a === L1[3].a && L2[1].a === L1[1].a, { was: L1[2].a, now: L2[2].a });
  await zKey();
  step('ONE Ctrl/⌘+Z puts the lines back exactly', scene() === s2, scene() === s2 ? 'same' : scene().slice(0, 200));

  // ---------- 3. tap to time: Space a bit off the beat → on the beat ----------
  const s3 = scene();
  LabLyrics.tapStart({ play: false });
  const want = [];
  for (let i = 0; i < 3; i += 1) {
    const t = Math.round((L1[i].a + 1.3 * beat + 0.06) * 1000) / 1000; // between beats, a little late
    P.seek(t); await wait(120);
    want.push(nearestBeat(P.time));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
    await wait(80);
  }
  const tapped = LabLyrics.tapping?.lines || [];
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  await until(() => scene() !== s3, 5000);
  const L3 = LabLyrics.now().lines;
  step('🎤 Tap to time: each Space lands its line on the nearest beat of the grid', [0, 1, 2].every((i) => Math.abs(L3[i].a - want[i]) < 0.002 && onGrid(L3[i].a, beat)) && tapped.length === 8, { want, got: L3.slice(0, 3).map((x) => x.a) });
  await zKey();
  step('…kept with Enter as ONE undo step (one Ctrl/⌘+Z puts the old times back)', scene() === s3, scene() === s3 ? 'same' : scene().slice(0, 200));

  // ---------- 4. an .lrc keeps its times ----------
  const LRC = '[ti:Check]\n[00:12.40]First timed line\n[00:16.85]Second timed line here\n[00:21.10]Third one\n[00:25.73]And the last';
  await LabLyrics.take(LRC, 'song.lrc');
  const L4 = LabLyrics.now().lines;
  step('an .lrc keeps its own times', L4.length === 4 && [12.4, 16.85, 21.1, 25.73].every((t, i) => Math.abs(L4[i].a - t) < 0.0005) && hk.lyrics()?.kind === 'lrc', L4.map((x) => `${x.a} ${x.text}`));

  // ---------- 5. the layer: the current line at the right time; a style ----------
  LabLyrics.open(); await wait(200);
  document.querySelector('.ly-pop .ly-add')?.click();
  const lay = await until(() => LabLyrics.layer(), 10000);
  const host = LabMatHook.host();
  await until(() => d.report().errors.length === 0 && LabType.info(lay?.id), 10000);
  const pageLine = async () => { const r0 = await d.evalInSketch('return JSON.stringify(window.__labType.info())'); let arr = JSON.parse(r0?.value || '[]'); if (typeof arr === 'string') arr = JSON.parse(arr); return arr.find((x) => x.lines === 4)?.line ?? null; };
  const lineOnPage = async (t) => { P.seek(t); let last = null; return until(async () => { await wait(250); const v = await pageLine(); const same = v != null && v === last; last = v; return same ? { v } : null; }, 6000).then((x) => (x ? x.v : last)); };
  const at2 = await lineOnPage(18.2); const at3 = await lineOnPage(22.0); const at0 = await lineOnPage(5);
  step('＋ Add a lyrics layer: the page shows line 2 inside its time, line 3 after it, none before the first', lay && /textLayer\(P/.test(host.layerById(lay.id)?.code || '') && at2 === 1 && at3 === 2 && at0 === -1, { layer: lay?.name, at2, at3, at0, errors: d.report().errors.length });
  const code5 = host.layerById(lay.id).code;
  document.querySelector('.ly-pop .ly-style[data-style="punchy"]')?.click();
  await until(() => /look: \{ value: 'oneword'/.test(host.layerById(lay.id).code), 6000);
  const punchy = host.layerById(lay.id).code;
  step('a style from the list (Punchy: one big word, hits on the kick) sets the layer\'s sliders', /look: \{ value: 'oneword'/.test(punchy) && /kickScale: \{ value: 0\.5/.test(punchy) && document.querySelectorAll('.ly-pop canvas.ly-prev').length === 7, { previews: document.querySelectorAll('.ly-pop canvas.ly-prev').length });
  await zKey(); await until(() => host.layerById(lay.id).code === code5, 5000);
  step('…one Ctrl/⌘+Z puts the layer back', host.layerById(lay.id).code === code5);

  // ---------- 6. the AI: nothing sent without a click, the cost first, one undo ----------
  step('nothing was sent to any AI so far (paste, auto-time, tap, the layer, the style)', sent.length === 0 && asked.length === 0, { sent, asked: asked.length });
  LabLyrics.open(); await wait(200);
  document.querySelector('.ly-pop .ly-ai')?.click();
  const cd = await until(() => [...document.querySelectorAll('dialog[open]')].find((x) => /tokens/.test(x.textContent)), 5000);
  const cdText = cd?.textContent || '';
  [...(cd?.querySelectorAll('button') || [])].find((x) => /Cancel/i.test(x.textContent))?.click();
  await wait(400);
  step('✦ Style the lyrics shows the token cost first; Cancel sends nothing', /≈[\d,]+ tokens/.test(cdText) && sent.length === 0 && LabLyrics.stats.asked === 0, cdText.replace(/\s+/g, ' ').slice(0, 160));
  Native.newChat(agent.id); await wait(600);
  const chatId = H.activeChat[agent.id];
  ChatScenes.link(chatId, sk.id, { rename: false });
  if (SC.currentId() !== sk.id) SC.open(sk.id);
  await until(() => SC.currentId() === sk.id && P.loaded && P.analysis?.sections?.length >= 4, 60000); // (the song is analyzed again when its scene reopens)
  const sig6 = () => JSON.stringify({ keys: host.layerById(lay.id)?.keys || {}, code: host.layerById(lay.id)?.code });
  const b6 = sig6();
  LabLyrics.open(); await wait(200);
  document.querySelector('.ly-pop .ly-ai')?.click();
  const cd2 = await until(() => [...document.querySelectorAll('dialog[open]')].find((x) => /tokens/.test(x.textContent)), 5000);
  [...(cd2?.querySelectorAll('button') || [])].find((x) => /Style them/.test(x.textContent))?.click();
  await until(() => !Native.isBusy(chatId) && Native.current(agent.id)?.messages.at(-1)?.role === 'assistant', 120000); await wait(800);
  const keys = host.layerById(lay.id)?.keys || {};
  const look = keys['s:look'] || [];
  step('OK sends ONE message; the fake director keyframes a style per section (calm, punchy on the drop) on the layer', sent.length === 1 && look.length >= 3 && look.every((k) => k.ease === 'hold') && look.some((k) => k.v === 'oneword') && look.some((k) => k.v === 'fades') && (keys['s:kickScale'] || []).length >= 3,
    { sent: sent.length, dlg: Boolean(cd2), look: look.map((k) => `${k.t}=${k.v}`), reply: String(Native.current(agent.id)?.messages.at(-1)?.text || '').slice(0, 120) });
  await Commands.tryRun('/undo-edit', agent.id, null, { say: () => {}, note: () => {}, error: () => {} });
  await until(() => sig6() === b6, 8000);
  step('…and its reply is ONE undo step: /undo-edit puts the layer back exactly', sig6() === b6, sig6() === b6 ? 'same' : sig6().slice(0, 200));
  await smoke({ shot: '/tmp/lyrics133.png' }).catch(() => {});
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 500));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
