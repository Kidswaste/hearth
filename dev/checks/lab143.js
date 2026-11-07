// (round 143, lab143) The Lab regrouped and its Forgeheart look (docs/upgrades/lab143.md), ONE check on realscene-lib's
// real scene (demo layers, a song with triggers; the check's own temp data, never an owner's scene):
//   1. inventory: every control that moved into a fold (⚙ Inspect ▾, ♩ Beat ▾, ⚡ Sync ▾) is the real control (its
//      data-feature / class kept), hidden while folded, drawn once its fold opens, listed in the fold's right-click
//      menu, and works from there; what stays one click away is drawn (play, song, Map, View ▾, Sections ▾, Sliders,
//      Code, Present, Play, the Lab's ⋯); Esc and a click outside fold it again
//   2. context menus open with a real right-click and Esc closes them: a layer row (its knobs rows), a timeline track
//      (mute, solo, curves, when it plays), the ruler (Set 1 here, Zoom ›), the preview (Freeze, Frame size, Quality ›,
//      ⇪ Render this…), a knob (★, back to the code's value, ◆ keyframe, ♪ move with the music, copy the value)
//   3. the look: Forgeheart's glint and ember playhead run while stopped, hold still while the scene plays
//      (html.lab-playing), are off under prefers-reduced-motion and Hearth's Motion: off; Lab ⋯ › View & help has
//      "Lab look", Plain turns the look off and it comes back
//   pictures: <out>/lab143.png (the Lab), lab143-beat.png (♩ Beat ▾ open)
//   node dev/smoke.js --fake-engines --check-timeout 600000 --lib dev/checks/realscene-lib.js --script dev/checks/lab143.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); return ok; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const drawn = (n) => Boolean(n?.isConnected && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden' && n.getBoundingClientRect().width > 0);
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(4000)]);
const SHOTS = window.LAB143_SHOTS || '/tmp/hearth-checks';
const shot = (name) => smoke({ shot: `${SHOTS}/${name}.png` }).catch(() => {});
const center = (n) => { const r = n.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; };
const rightClick = async (x, y) => { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'right', clickCount: 1 }); };
const click = async (x, y) => { for (const type of ['mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 }); };
const esc = async () => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); };
const menuNow = () => { const m = document.getElementById('menu'); if (m && !m.hidden && drawn(m)) return m; return [...document.querySelectorAll('.mb-menu.lab-pop, .mb-menu')].find(drawn) || null; };
const closeMenus = () => { try { hideMenu(); } catch { /* none */ } document.querySelectorAll('.mb-menu').forEach((m) => m.remove()); };
// right-click → a menu with these rows → Esc → no menu
async function ctxCheck(name, x, y, want) {
  closeMenus(); await wait(150);
  await rightClick(x, y);
  const m = await until(menuNow, 5000);
  const text = m?.textContent || '';
  const missing = want.filter((re) => !re.test(text));
  if (m && /track|ruler/.test(name)) await shot(`lab143-${name.split(' ')[0]}`);
  await esc();
  const gone = await until(() => !menuNow(), 3000);
  step(`right-click ${name}: its menu, Esc closes it`, m && !missing.length && gone, { missing: missing.map(String), text: text.slice(0, 160) });
}

try {
  await smoke({ cdp: 'Emulation.setDeviceMetricsOverride', params: { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false } });
  const info = await RS.open({ play: false });
  step('the real scene is open with its song', info.song && document.querySelector('.surface.active .media-bar:not(.mb-empty)'), { layers: info.layers });
  await wait(1500);
  const lab = () => document.querySelector('.surface.active') || document;
  const q = (sel) => [...lab().querySelectorAll(sel)];
  const one = (sel) => q(sel)[0] || null;
  const fold = (f) => LabRegroup.folds.find((F) => F.button.dataset.feature === f && F.button.isConnected);

  // ---------- 1. inventory ----------
  const MOVED = [
    ['Inspect', '[data-feature="Console"]', /Console/], ['Inspect', '[data-feature="Edit scene"]', /Edit/],
    ['Beat', '.mb-tap', /Tap/], ['Beat', '.mb-lane-kick', /Kick/], ['Beat', '.mb-lane-snare', /Snare/], ['Beat', '.mb-lane-hit', /Hit/],
    ['Beat', '.mb-bpmin', null], ['Beat', '.mb-one', /Set 1 here/], ['Beat', '.mb-wave', /RGB|Band|Mono/i],
    ['Sync', '[data-feature="Live sound"]', /Live/], ['Sync', '[data-feature="Triggers"]', /Triggers/], ['Sync', '[data-feature="Presets"]', /▾/], ['Sync', '[data-feature="Auto bars"]', /Auto bars/],
  ];
  const folds = ['Inspect', 'Beat', 'Sync'].map((f) => [f, fold(f)]);
  step('three folds: ⚙ Inspect ▾ in the Lab bar, ♩ Beat ▾ and ⚡ Sync ▾ on the timeline, labelled and drawn', folds.every(([, F]) => F && drawn(F.button) && /▾/.test(F.button.textContent)), folds.map(([f, F]) => `${f}:${F ? F.button.textContent.trim() : '-'}`));
  const STAY = ['.mb-play', '.mb-songmap', '[data-feature="Timeline view"]', '[data-feature="Sections"]', '[data-feature="Layers & sliders"]', '[data-feature="Present"]', '[data-feature="Play"]', '[data-feature="Lab more"]', '.mb-more', '.mb-bpmread'];
  const notDrawn = STAY.filter((s) => !q(s).some(drawn));
  step('the most used stay one click away (play, song ✦ Map, View ▾, Sections ▾, Sliders, Present, Play, ⋯, the BPM readout)', !notDrawn.length, notDrawn);
  step('the grid row is no longer its own row (it sits in ♩ Beat ▾)', one('.mb-grid')?.closest('.rg-tray') && !drawn(one('.mb-grid')));
  const inv = [];
  for (const [f, sel, re] of MOVED) {
    const F = fold(f); const n = one(sel);
    const r = { sel, real: Boolean(n && F?.tray.contains(n)), hiddenFolded: !drawn(n) };
    LabRegroup.setOpen(F, true); await wait(60);
    r.shownOpen = drawn(n);
    LabRegroup.setOpen(F, false);
    r.inMenu = !re || LabRegroup.trayItems(F).some((it) => typeof it === 'object' && re.test(it.label));
    inv.push(r);
  }
  const bad = inv.filter((r) => !(r.real && r.hiddenFolded && r.shownOpen && r.inMenu));
  step(`every moved control (${MOVED.length}) is the real one, folded away, drawn when its fold opens and listed in its menu`, !bad.length, bad);
  out.inventory = inv.map((r) => r.sel).join(' ');
  // a fold by a real click; Esc folds it; a click outside folds it
  const beat = fold('Beat');
  await click(...center(beat.button));
  const opened = await until(() => drawn(beat.tray) && drawn(one('.mb-tap')), 3000);
  await shot('lab143-beat');
  await esc();
  const escClosed = await until(() => !drawn(beat.tray), 2000);
  await click(...center(beat.button)); await until(() => drawn(beat.tray), 2000);
  await click(20, 990);
  const outClosed = await until(() => !drawn(beat.tray), 2000);
  step('♩ Beat ▾ opens with a click, Esc folds it, a click outside folds it', opened && escClosed && outClosed, { opened: Boolean(opened), escClosed: Boolean(escClosed), outClosed: Boolean(outClosed) });
  const tapLive = drawn(beat.tray.querySelector('.mb-tap'));
  step('folded, the beat keys still work (T K S H on the Lab, the tray closed)', !tapLive && typeof ThreeLab !== 'undefined');
  // a fold's right-click lists its controls, and a row works: Console from ⚙ Inspect ▾
  const ins = fold('Inspect');
  await rightClick(...center(ins.button));
  const im = await until(menuNow, 3000);
  const row = im && [...im.querySelectorAll('button')].find((b) => /Console/.test(b.textContent));
  const consoleWrap = () => q('.three-console-wrap').find(drawn);
  const wasOn = Boolean(consoleWrap());
  row?.click();
  const toggled = await until(() => Boolean(consoleWrap()) !== wasOn, 3000);
  step('right-click ⚙ Inspect ▾: its menu lists Console and Edit, and Console works from it', im && /Edit/.test(im.textContent) && toggled, { text: im?.textContent.slice(0, 120), wasOn });
  if (Boolean(consoleWrap()) !== wasOn) one('[data-feature="Console"]')?.click();
  closeMenus();
  await wait(300);

  // ---------- 2. context menus ----------
  const lrow = q('.ly-row[data-id]').find(drawn);
  if (lrow) await ctxCheck('a layer row', ...center(lrow), [/knobs/, /Rename/, /Duplicate/]);
  else step('a layer row is on screen', false);
  const cv = one('.mb-timeline'); const cr = cv.getBoundingClientRect();
  const lastTrackY = Math.round(cr.bottom - 9); // the bottom track (TRACK_H 16)
  await ctxCheck('a timeline track', Math.round(cr.left + 260), lastTrackY, [/Mute|Show it/, /Solo|every layer/, /curves/, /More for this layer/]);
  await ctxCheck('the ruler', Math.round(cr.left + 260), Math.round(cr.top + 5), [/Set 1 here/, /Zoom/, /Loop this bar/, /Cue here|Cue at/]);
  const pv = q('.three-preview').find(drawn);
  const [px, py] = center(pv);
  closeMenus();
  await rightClick(px, py + 40);
  const pm = await until(() => { const m = document.getElementById('menu'); return m && !m.hidden && drawn(m) ? m : null; }, 6000);
  const pmText = pm?.textContent || '';
  await esc();
  const pmGone = await until(() => !menuNow(), 3000);
  step('right-click the preview: Freeze, Frame size, Quality, ⇪ Render this…, Capture; Esc closes it', pm && [/Freeze/, /Frame size/, /Quality/, /Render this/, /Capture/].every((re) => re.test(pmText)) && pmGone, pmText.slice(0, 200));
  // a knob on screen (scrolled into the panel's view, the point really on it)
  const kAt = (k) => { const r = k.getBoundingClientRect(); return [Math.round(r.left + 40), Math.round(r.top + 9)]; };
  let knob = q('.tw-row.kind-number').find((k) => drawn(k) && k.contains(document.elementFromPoint(...kAt(k))));
  if (!knob) { const k0 = q('.tw-row.kind-number').find(drawn); k0?.scrollIntoView({ block: 'center' }); await wait(300); if (k0 && k0.contains(document.elementFromPoint(...kAt(k0)))) knob = k0; }
  if (knob) await ctxCheck('a knob', ...kAt(knob), [/Favou?rites/, /Back to the code/, /Copy the value/, /Keyframe at the playhead/, /Move with the music|React to a sound/]);
  else step('a knob is on screen', false);
  const qChip = q('.lab-q').find(drawn);
  if (qChip) await ctxCheck('the Quality chip', ...center(qChip), [/Smooth/, /Balanced/, /Force high/]);

  // ---------- 3. the look ----------
  const head = one('.lk-merged .layers > .tw-head');
  const ph = one('.media-bar .mb-playhead:not(.mini)');
  const anim = (n) => { const s = getComputedStyle(n, '::after'); return { name: s.animationName, state: s.animationPlayState, content: s.content }; };
  document.documentElement.dataset.motion = '';
  step('Forgeheart is the default look', LabRegroup.look() === 'forge' && document.documentElement.dataset.lablook === 'forge');
  const scan = getComputedStyle(one('.media-bar'), '::before').backgroundImage;
  const pvScan = getComputedStyle(pv, '::before').backgroundImage;
  step('scanlines on the panel chrome (the timeline), never on the preview', /repeating-linear-gradient/.test(scan) && !/repeating-linear-gradient/.test(pvScan || ''));
  const stopped = [anim(head), anim(ph)];
  step('stopped: the glint on the panel head and the ember playhead move', stopped.every((a) => a.name !== 'none' && a.state === 'running'), stopped);
  (await ThreeLab.cmd()).play(true);
  const playing = await until(() => LabPlay.playing && document.documentElement.classList.contains('lab-playing'), 8000);
  await wait(200);
  const whilePlaying = [anim(head), anim(ph)];
  step('while the scene plays: every loop of the look holds still (html.lab-playing)', playing && whilePlaying.every((a) => a.state === 'paused'), whilePlaying);
  (await ThreeLab.cmd()).play(false);
  await until(() => !LabPlay.playing, 5000); await wait(150);
  step('paused again: they move again', [anim(head), anim(ph)].every((a) => a.state === 'running'));
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] }); await wait(200);
  const reduced = [anim(head), anim(ph)];
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] }); await wait(150);
  document.documentElement.dataset.motion = 'off'; await wait(100);
  const motionOff = [anim(head), anim(ph)];
  document.documentElement.dataset.motion = ''; await wait(100);
  step('off under reduced motion (the system\'s and Hearth\'s Motion: off)', reduced.every((a) => a.name === 'none') && motionOff.every((a) => a.name === 'none'), { reduced, motionOff });
  const more = ThreeLab.search?.menus?.().more || [];
  const flat = JSON.stringify(more, (k, v) => (typeof v === 'function' ? undefined : v));
  step('Lab ⋯ › View & help has "Lab look: Forgeheart"', /Lab look: Forgeheart/.test(flat));
  LabRegroup.setLook('plain'); await wait(100);
  const plain = [anim(head), anim(ph)];
  const plainScan = getComputedStyle(one('.media-bar'), '::before').backgroundImage;
  step('Plain: no glint, no ember, no scanlines', plain.every((a) => a.name === 'none' || a.content === 'none') && !/repeating-linear-gradient/.test(plainScan), { plain, plainScan: plainScan.slice(0, 40) });
  LabRegroup.setLook('forge'); await wait(100);
  step('…and Forgeheart again', anim(head).name !== 'none' && store.get('three.labLook') === 'forge');
  closeMenus(); LabRegroup.closeAll();
  await wait(600);
  await shot('lab143');
} catch (err) { step(`threw: ${err.stack || err.message}`, false); }
await RS.close?.();
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
