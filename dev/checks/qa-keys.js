// QA (round 8): every key line in the keys sheet (Keys.add) pressed for real on its own surface, where a key can be
// pressed: the mood board, the video editor, Video Review, the Lab, the capture player / annotator / global keys, and
// the app-wide keys. For each press it records whether something happened (the surface's own state, the DOM, a
// dialog / menu / toast, the focus) and whether an app-wide action fired too (text size, side-by-side, palette,
// find, notes, a snapshot into the chat…): that is a shortcut conflict. Also lists the same key bound in two areas
// that are on screen together (the conflict table in docs/upgrades/qa8.md) and checks Commands.duplicates().
//   sh dev/run-checks.sh qa-keys     (or: node dev/smoke.js --check-timeout 900000 --script dev/checks/qa-keys.js)
// Gestures (drag, wheel, click, hold) and keys that leave the app (Ctrl+R, Ctrl+Shift+R, the OS hotkey) are listed as
// skipped; window.QA_KEYS_AREAS = ['Board', …] limits the run.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(80); } return false; };
const out = { pressed: 0, worked: 0, dead: [], globalToo: [], skipped: [], errors: [], conflicts: [], dups: Commands.duplicates().map((d) => d.name) };
const AREAS = window.QA_KEYS_AREAS || ['Board', 'Editor', 'Video Review', 'Capture', 'Lab', 'Everywhere'];
const errs = []; const origErr = console.error; console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0, 200)); origErr(...a); };
addEventListener('error', (e) => errs.push(`uncaught ${e.message}`));

// ---------- keys text → combos ----------
const NAMED = { Space: [' ', 'Space', 32], Esc: ['Escape', 'Escape', 27], Escape: ['Escape', 'Escape', 27], Enter: ['Enter', 'Enter', 13], Tab: ['Tab', 'Tab', 9], Del: ['Delete', 'Delete', 46], Delete: ['Delete', 'Delete', 46], Backspace: ['Backspace', 'Backspace', 8],
  PgUp: ['PageUp', 'PageUp', 33], PgDn: ['PageDown', 'PageDown', 34], Home: ['Home', 'Home', 36], End: ['End', 'End', 35], '←': ['ArrowLeft', 'ArrowLeft', 37], '→': ['ArrowRight', 'ArrowRight', 39], '↑': ['ArrowUp', 'ArrowUp', 38], '↓': ['ArrowDown', 'ArrowDown', 40],
  F1: ['F1', 'F1', 112], F2: ['F2', 'F2', 113], F10: ['F10', 'F10', 121] };
const PUNCT = { ',': ['Comma', 188], '.': ['Period', 190], '/': ['Slash', 191], ';': ['Semicolon', 186], '=': ['Equal', 187], '-': ['Minus', 189], '−': ['Minus', 189], '[': ['BracketLeft', 219], ']': ['BracketRight', 221], '\\': ['Backslash', 220], '`': ['Backquote', 192], "'": ['Quote', 222] };
const SHIFTED = { '<': ',', '>': '.', '?': '/', '+': '=', '_': '-', '{': '[', '}': ']', '|': '\\', '~': '`', '!': '1', '@': '2', '#': '3', $: '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0' };
const US_SHIFT = { 1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '^', 7: '&', 8: '*', 9: '(', 0: ')', ',': '<', '.': '>', '/': '?', '=': '+', '-': '_', '[': '{', ']': '}', '\\': '|', '`': '~', ';': ':', "'": '"' };
const GESTURE = /drag|click|wheel|scroll|pinch|hold|move|resize|rotate|release|Type\b|Point|Drop|Double|Right|Two-finger|Middle|\(|…|then|Alt, Alt|^Arrows|Hold/i;
function one(text) {
  let t = text.trim(); if (!t || GESTURE.test(t)) return null;
  const mods = { ctrl: false, alt: false, shift: false };
  for (;;) { const m = t.match(/^(Ctrl|Alt|Shift|⌘|⌥|⇧)\+(?=.)/i); if (!m) break; const k = m[1].toLowerCase(); mods[k === '⌘' ? 'ctrl' : k === '⌥' ? 'alt' : k === '⇧' ? 'shift' : k] = true; t = t.slice(m[0].length); }
  let key; let code; let vk;
  if (NAMED[t]) [key, code, vk] = NAMED[t];
  else if (/^[a-z]$/i.test(t)) { if (/^[A-Z]$/.test(t) && t !== t.toLowerCase() && !mods.ctrl && !mods.alt && mods.shift) key = t; else key = mods.shift ? t.toUpperCase() : t.toLowerCase(); code = `Key${t.toUpperCase()}`; vk = t.toUpperCase().charCodeAt(0); }
  else if (/^\d$/.test(t)) { key = mods.shift ? US_SHIFT[t] : t; code = `Digit${t}`; vk = 48 + Number(t); }
  else if (SHIFTED[t]) { const base = SHIFTED[t]; mods.shift = true; key = t; if (/\d/.test(base)) { code = `Digit${base}`; vk = 48 + Number(base); } else [code, vk] = PUNCT[base]; }
  else if (PUNCT[t]) { [code, vk] = PUNCT[t]; key = mods.shift ? US_SHIFT[t === '−' ? '-' : t] : t === '−' ? '-' : t; }
  else return null;
  return { ...mods, key, code, vk, label: text.trim() };
}
// "Ctrl+Shift+Z / Ctrl+Y", "J / K / L", "I / O · X", "+ / − · \", "Space · J K L", "Shift+.  /  Shift+,", "1 … 9"
function combos(keys) {
  const k = String(keys);
  if (/^\d\s*…\s*\d$|1…9|1 … 9/.test(k)) { const p = k.match(/^(.*?)1\s*…\s*9/)?.[1] || ''; return [one(`${p}1`), one(`${p}2`)].filter(Boolean); }
  const parts = k.split(/\s+[\/·]\s+|\s{2,}\/\s{2,}/).flatMap((p) => (/^[A-Z](\s[A-Z])+$/.test(p.trim()) ? p.trim().split(/\s/) : [p]));
  // "Ctrl+C / V / D / A": the later bare letters share the first one's modifiers
  const first = parts[0]?.match(/^((?:(?:Ctrl|Alt|Shift)\+)+)/i)?.[1] || '';
  return parts.map((p, i) => one(i > 0 && first && /^[^+]{1,2}$/.test(p.trim()) ? `${first}${p.trim()}` : p)).filter(Boolean);
}
async function press(c) {
  const mods = (c.alt ? 1 : 0) | (c.ctrl ? 2 : 0) | (c.shift ? 8 : 0);
  const text = !c.ctrl && !c.alt && c.key.length === 1 ? c.key : undefined;
  const p = { key: c.key, code: c.code, windowsVirtualKeyCode: c.vk, nativeVirtualKeyCode: c.vk, modifiers: mods };
  await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: text ? 'keyDown' : 'rawKeyDown', ...p, text, unmodifiedText: text } });
  await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyUp', ...p } });
}

// ---------- what happened ----------
let mutations = 0;
const mo = new MutationObserver((list) => { mutations += list.length; });
mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
const vis = (s) => [...document.querySelectorAll(s)].some((n) => n.checkVisibility?.({ visibilityProperty: true }) && n.getBoundingClientRect().width > 0);
const globalSig = async () => JSON.stringify({ zoom: await window.hub.getZoom?.(), grid: H.grid, panel: H.panelOpen, active: H.activeId, palette: vis('.palette'), find: vis('.find-bar'), notes: vis('.notes-panel'), bar: vis('.cmdbar-input'), sheet: vis('.keys-sheet'), broadcast: !document.getElementById('broadcast')?.classList.contains('hidden'), atts: Native.view(H.claudeAgent().id)?.attachments?.length || 0, onTop: document.body.classList.contains('on-top') });
const uiSig = () => JSON.stringify({ kids: document.body.children.length, overlays: document.querySelectorAll('.bd-compare, .bd-viewer, .bd-info, .bd-card, .ui-modal, [class*="-overlay"], [class*="-viewer"]').length, dialogs: document.querySelectorAll('dialog[open]').length, menu: vis('#menu'), toasts: [...document.querySelectorAll('.toast')].map((t) => t.textContent.slice(0, 30)).join('|'), focus: `${document.activeElement?.tagName}.${String(document.activeElement?.className).slice(0, 30)}` });
// app-wide actions an area key may legitimately do itself (the key IS that action there)
const OWN_GLOBAL = /palette|Ctrl\+K|Ctrl\+;|Ctrl\+\/|F1|Command|Settings|Notes|Find|sheet|Ctrl\+Shift\+M/i;
async function tryKey(area, line, c, { sig, before, after }) {
  if (before) await before(c, line);
  await wait(120);
  const s0 = sig(); const g0 = await globalSig(); const u0 = uiSig();
  const m0 = mutations; await wait(250); const idle = mutations - m0;
  const e0 = errs.length;
  const m1 = mutations;
  const focusAt = `${document.activeElement?.tagName}.${String(document.activeElement?.className || '').slice(0, 24)}`;
  await press(c);
  await wait(c.slow ? 900 : 450);
  const s1 = sig(); const g1 = await globalSig(); const u1 = uiSig();
  const dm = mutations - m1;
  const worked = s1 !== s0 || u1 !== u0 || dm > Math.max(3, idle * 3);
  out.pressed += 1;
  const why = NOOP[`${area}|${c.label}`];
  if (worked) out.worked += 1; else if (why) (out.noop ||= []).push(`${area} · ${c.label}: ${why}`); else out.dead.push(`${area} · ${c.label} · ${line.what} (keys at ${focusAt})`);
  if (g1 !== g0 && !(area === 'Everywhere' || OWN_GLOBAL.test(line.what) || OWN_GLOBAL.test(c.label))) {
    const a = JSON.parse(g0); const b = JSON.parse(g1);
    out.globalToo.push(`${area} · ${c.label} (${line.what}) also changed: ${Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => `${k} ${JSON.stringify(a[k])}→${JSON.stringify(b[k])}`).join(', ')}`);
  }
  if (errs.length > e0) out.errors.push(`${area} · ${c.label}: ${errs.slice(e0).join(' / ').slice(0, 200)}`);
  if (after) await after(c, line, { s0, s1, g0, g1 });
}
// keys that rightly do nothing in this test's setup (no music: no beats or sections)
const NOOP = {
  'Lab|Space': 'no song loaded here (journey-lab plays one)', 'Lab|T': 'taps count while a song plays (journey-lab)', 'Lab|Ctrl+Enter': 're-runs the layers: nothing to see change', 'Lab|Ctrl+Z': 'nothing to undo yet', 'Lab|Esc': 'only from a Lab tool tab', 'Lab|.': 'only while frozen',
  'Capture|Esc': 'no tour running', 'Capture|Ctrl+Z': 'nothing drawn to undo (capture-shots.js draws and undoes)', 'Capture|Ctrl+Shift+Z': 'nothing undone to redo', 'Editor|Alt+.': 'the clip already ends on its source\'s last frame (Alt+, slipped it)', 'Video Review|\\': 'swaps A and B only while comparing', 'Editor|Alt+↑': 'one overlay track: nowhere to move', 'Editor|Alt+↓': 'one overlay track: nowhere to move',
  'Editor|Ctrl+C': 'copies to the editor\'s own clipboard (checked by Ctrl+V)',  'Editor|,': 'no music, no beats (by design)', 'Editor|.': 'no music, no beats (by design)', 'Video Review|,': 'no music, no beats', 'Video Review|.': 'no music, no beats', 'Video Review|<': 'no music, no sections', 'Video Review|>': 'no music, no sections' };
const closeAll = async () => {
  for (const d of [...document.querySelectorAll('dialog[open]')]) { try { d.close(); } catch { /* gone */ } }
  try { hideMenu(); } catch { /* none */ }
  document.querySelector('.palette')?.remove();
  if (typeof KeysUI !== 'undefined') KeysUI.close?.();
  document.querySelector('.find-bar .find-close, .find-bar button:last-child')?.click();
  if (vis('.notes-panel')) Notes.close?.();
  if (vis('.cmdbar-input')) document.querySelector('.cmdbar-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(60);
};
const SKIP_ALL = /^(Ctrl\+R|Ctrl\+Shift\+R|Ctrl\+Alt\+H|Ctrl\+Shift\+Space|Ctrl\+Shift\+T)$/; // reloads, the OS hotkey, ask-all sends, always-on-top
const linesOf = (area) => Keys.all().filter((k) => k.area === area);
// progress in a file (a stuck key shows where it stopped): QA_KEYS_LOG or the run's save folder
const LOG = window.QA_KEYS_LOG || `${window.SMOKE_SAVES}/qa-keys-progress.txt`;
let logText = '';
const note = (s) => { logText += `${s}\n`; window.hub.fs.write(LOG, logText).catch(() => {}); };
const within = (p, ms, what) => Promise.race([p, wait(ms).then(() => { throw new Error(`${what} still running after ${ms / 1000}s`); })]);
async function runArea(area, opts) {
  note(`== ${area}`);
  for (const line of linesOf(area)) {
    const cs = combos(line.keys);
    if (!cs.length) { out.skipped.push(`${area} · ${line.keys}`); continue; }
    for (const c of cs) {
      if (SKIP_ALL.test(c.label) || opts.skip?.test(c.label)) { out.skipped.push(`${area} · ${c.label}`); continue; }
      note(`${area} · ${c.label}`);
      const d0 = out.dead.length;
      try { await within(tryKey(area, line, c, opts), 15000, 'the key'); } catch (err) { out.errors.push(`${area} · ${c.label}: ${err.message}`); }
      // nothing seen: once more on a fresh surface (an earlier key's leftovers can swallow it), then it counts
      if (out.dead.length > d0 && opts.reset) { out.dead.pop(); out.pressed -= 1; await closeAll(); try { await within(opts.reset(), 20000, 'a fresh surface'); await within(tryKey(area, line, c, opts), 15000, 'the key'); } catch (err) { out.errors.push(`${area} · ${c.label}: ${err.message}`); } }
      await closeAll();
      if (opts.restore) { try { await within(opts.restore(c, line), 15000, 'putting things back'); } catch (err) { out.errors.push(`${area} · ${c.label}: ${err.message}`); } }
    }
  }
}

// ---------- fixtures ----------
const FIX = window.BOARD_FIXTURES || '/tmp/hearth-board-fixtures';
const EV = window.EDITOR_VIDS || '/tmp/hearth-editor-videos';
const VIDS = `${window.SMOKE_SAVES}/renders`;
await window.hub.fs.write(`${VIDS}/.keep`, '');
for (const f of ['frames_a_30.mp4', 'frames_b_30.mp4']) await window.hub.fs.copy(`${EV}/${f}`, `${VIDS}/${f}`);

// ---------- Board ----------
if (AREAS.includes('Board')) {
  activate('tool:board'); await until(() => Board.isMounted() && Board.visible());
  await Board.create('Keys check'); await wait(300);
  let img; let clip; let note; let fr;
  const fresh = async () => {
    await Board.create(`Keys check ${Date.now() % 1000}`, { quiet: true }); await wait(300);
    [img] = await Board.addFiles([`${FIX}/golden-hour.jpg`]); [clip] = await Board.addFiles([`${FIX}/cuts.mp4`]);
    note = Board.addNote('a note'); fr = Board.addFrame?.({ title: 'Frame' }) || null; Board.addFrame?.({ title: 'Frame 2', x: 4000, y: 3000, w: 400, h: 300 }); // 2 needs a second frame
    await until(() => clip.vibe?.cuts, 20000); await wait(300);
  };
  await fresh();
  const B = Board._.S;
  const pick = (c) => {
    if (/^(,|\.|Shift\+\.|Shift\+,)$/.test(c.label) || /clip/.test(c.what || '')) return [clip.id];
    if (/Shift\+F$/.test(c.label)) return fr ? [fr.id] : [img.id];
    if (/^(C|Ctrl\+G|Ctrl\+Shift\+G|Ctrl\+]|Ctrl\+\[)$/.test(c.label)) return [img.id, note.id];
    return [img.id];
  };
  const sig = () => JSON.stringify({ n: B.cur.items.length, sel: [...B.sel], v: B.view, items: B.cur.items.map((i) => [i.x, i.y, i.w, i.h, i.z, i.rot, i.opacity, i.group, i.stamp, i.star, i.hidden, i.t, i.lastT]), lens: B.lens, prefs: Board.prefs?.(), present: Boolean(B.presenting), hidden: B.hidden?.size });
  let snap = null;
  await runArea('Board', {
    sig,
    reset: fresh,
    skip: /^(E|Ctrl\+V)$/, // E opens the system eyedropper (a native picker); Ctrl+V needs the clipboard
    before: async (c) => {
      if (/^Ctrl\+Shift\+G$/.test(c.label)) { Board.select([img.id, note.id]); Board.group?.(); }
      snap = JSON.stringify(B.cur.items);
      Board.select(pick({ ...c, what: '' })); B.ui.root.focus({ preventScroll: true });
      if (/Shift\+[.,]/.test(c.label)) Board.select([clip.id]);
    },
    restore: async () => {
      document.activeElement?.blur?.();
      if (B.presenting) { await press(one('Escape')); await wait(200); }
      // put the items back as they were (undo can't: the key may itself have been an undo)
      if (JSON.stringify(B.cur.items) !== snap) { B.cur.items = JSON.parse(snap); Board._.renderAll(); }
      if (B.cur.lens) Board._.setLens?.(null);
      if (!vis('.bd-root')) activate('tool:board');
      await wait(60);
    },
  });
}

// ---------- Video Review (editor off) and the Editor ----------
if (AREAS.includes('Video Review') || AREAS.includes('Editor')) {
  activate('tool:ae'); await Review.ensureMounted();
  H.config.settings = { ...H.config.settings, videoDirs: [VIDS] };
  await Review.load(true); await until(() => Review.videos.length >= 2);
  await Review.open(`${VIDS}/frames_a_30.mp4`); await Review.waitReady(); await wait(400);
  const root = H.surfaces.get('tool:ae').el;
  // Video Review listens on its own mount (the parent of .vr, tabindex -1), not on the surface around it
  const focusRoot = () => { const r = root.querySelector('.vr')?.parentElement || root; r.focus({ preventScroll: true }); };
  if (AREAS.includes('Video Review')) {
    if (VideoCut.active) VideoCut.leave();
    await Review.addNote('first', { t: 0.5, frame: false }); await Review.addNote('second', { t: 2.5, frame: false });
    const small = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => { try { return !(v instanceof Node) && typeof v !== 'function' && JSON.stringify(v).length < 400; } catch { return false; } }));
    const sigR = () => JSON.stringify({ st: small(Review.state), t: Review.state?.t ?? root.querySelector('video')?.currentTime, paused: root.querySelector('video')?.paused, cmp: Review.state?.cmp, view: Review.state?.view, rate: root.querySelector('video')?.playbackRate, vol: root.querySelector('video')?.volume, muted: root.querySelector('video')?.muted, cls: root.className, lib: root.querySelector('.vr-lib, .vr-library')?.className, notes: Review.notes?.().length, editor: VideoCut.active, loop: Review.state?.loop, mirror: Review.state?.mirror, guides: Review.state?.guides, safe: Review.state?.safe, tc: root.querySelector('.vr-time')?.value });
    await runArea('Video Review', {
      sig: sigR,
      skip: /^(F)$/, // F goes fullscreen (the window itself)
      before: async () => { if (VideoCut.active) VideoCut.leave(); const v = root.querySelector('video'); if (v && !v.paused) v.pause(); if (v) v.currentTime = 1; await wait(150); focusRoot(); },
      restore: async () => { const v = root.querySelector('video'); if (v && !v.paused) v.pause(); if (H.activeId !== 'tool:ae') activate('tool:ae'); },
    });
  }
  if (AREAS.includes('Editor')) {
    await VideoCut.enter(); await until(() => VideoCut.active, 8000);
    await VideoCut.addClip(`${VIDS}/frames_b_30.mp4`); await wait(500);
    VideoCut.goto(0.5); VideoCut.addColor('#ff2e88', { at: 0.5, dur: 1.5, main: false }); VideoCut.marker('a'); VideoCut.goto(3); VideoCut.marker('b'); await wait(200);
    const base = JSON.stringify(VideoCut.edit);
    const sigE = () => JSON.stringify({ edit: VideoCut.edit, t: VideoCut.time, sel: VideoCut.selection, razor: VideoCut.razor, snap: VideoCut.snap, view: VideoCut.view, active: VideoCut.active, playing: VideoCut.playing, sug: Boolean(VideoCut.suggestion) });
    await runArea('Editor', {
      sig: sigE,
      before: async (c) => {
        if (!VideoCut.active) { await VideoCut.enter(); await until(() => VideoCut.active, 5000); }
        if (VideoCut.playing) VideoCut.pause();
        // select first (select(i) also moves the playhead to that clip's start), then the playhead mid-clip
        if (!/^(Ctrl\+A|E|Esc)$/.test(c.label)) VideoCut.select(0);
        if (/^Ctrl\+V$/.test(c.label)) { focusRoot(); await press(one('Ctrl+C')); await wait(150); }
        VideoCut.goto(1.5); await wait(150);
        if (c.label === 'K') { VideoCut.play(); await wait(300); } // K stops: playing first
        if (c.label === 'X') VideoCut.setMark(0.5, 2.5); // clears a range: one first
        if (/^Alt\+[,.]$/.test(c.label)) { VideoCut.goto(2); VideoCut.split(); VideoCut.select(1); } // slip needs media on both sides
        if (c.label === 'Shift+E') { VideoCut.goto(2); VideoCut.split(); VideoCut.goto(1.5); await wait(150); } // a cut with media on both sides
        if (c.label === '\\') { VideoCut.centerView?.(); focusRoot(); await press(one('=')); await press(one('=')); await wait(200); } // fit: zoomed in first
        if (/^Alt\+[←→↑↓]$/.test(c.label)) { const lay = (VideoCut.edit.tracks || []).flatMap((t) => t.items)[0]; if (lay) VideoCut.selectIds([lay.id]); }
        focusRoot();
      },
      restore: async () => {
        if (VideoCut.playing) VideoCut.pause();
        if (H.activeId !== 'tool:ae') activate('tool:ae');
        if (!VideoCut.active) { await VideoCut.enter(); await until(() => VideoCut.active, 5000); }
        for (let i = 0; i < 4 && JSON.stringify(VideoCut.edit) !== base; i += 1) { VideoCut.undo(); await wait(80); }
        if (VideoCut.razor) VideoCut.toggleRazor(false);
      },
    });
    VideoCut.leave?.();
  }
}

// ---------- Capture: the global keys, the player, the annotator ----------
if (AREAS.includes('Capture')) {
  activate(H.claudeAgent().id); await wait(300);
  const dir = (await Capture.info()).dir;
  const vid = `${dir}/recordings/keys check.mp4`;
  await window.hub.fs.copy(`${EV}/frames_a_30.mp4`, vid);
  const shotR = await Capture.shot({ target: 'window', quiet: true });
  const sigC = () => JSON.stringify({ rec: Capture.status(), v: document.querySelector('dialog[open].cap-view video')?.currentTime, p: document.querySelector('dialog[open].cap-view video')?.paused, ann: CaptureAnnotate.current ? JSON.stringify(CaptureAnnotate.current).length : 0, tool: document.querySelector('dialog[open].cap-ann .on, dialog[open].cap-ann [aria-pressed="true"]')?.textContent, size: document.querySelector('dialog[open].cap-ann button[title^="Thickness"]')?.textContent, region: vis('.cap-region, .cap-pick'), tour: typeof CaptureTour !== 'undefined' && CaptureTour.running?.() });
  await runArea('Capture', {
    sig: sigC,
    skip: /^(G|Ctrl\+Alt\+T)$/, // G makes a GIF (minutes on this machine); the tour picker is checked by journey-capture
    before: async (c, line) => {
      const where = /\(player\)/.test(line.keys) || /player/.test(line.what) ? 'player' : /\(annotate\)/.test(line.keys) ? 'annotate' : /\(picture\)/.test(line.keys) ? 'picture' : 'global';
      c.slow = where === 'global';
      if (where === 'player') { await CaptureView.open(vid); await until(() => document.querySelector('dialog[open].cap-view video')?.readyState >= 2, 5000); document.querySelector('dialog[open].cap-view')?.focus(); }
      if (where === 'picture') { await CaptureView.open(shotR.path); await wait(400); document.querySelector('dialog[open].cap-view')?.focus(); }
      if (where === 'annotate') { if (!document.querySelector('dialog[open].cap-ann')) CaptureAnnotate.open(shotR.path); await until(() => document.querySelector('dialog[open].cap-ann'), 4000); await wait(300); document.querySelector('dialog[open].cap-ann canvas, dialog[open].cap-ann')?.focus?.(); } // open() resolves only when the annotator closes
      if (where === 'annotate' && c.label === '[') { await press(one(']')); await wait(150); } // a size to go down from
      if (/^Ctrl\+Alt\+P$/.test(c.label)) { await Capture.record({ target: 'composer', countdown: 0, mp4: false, audio: 'none' }); await wait(1200); }
    },
    restore: async (c) => {
      if (/^Ctrl\+Alt\+[RP]$/.test(c.label)) { await wait(1200); if (Capture.recording) await Capture.stop({ quiet: true }).catch(() => {}); }
      if (vis('.cap-region, .cap-pick')) { await press(one('Escape')); await wait(200); }
    },
  });
}

// ---------- the Lab ----------
if (AREAS.includes('Lab')) {
  activate('tool:three'); await wait(2500);
  const lab = await ThreeLab.cmd(); await wait(1500);
  const L = H.surfaces.get('tool:three').el;
  const pic = [...L.querySelectorAll('.three-preview')].find((n) => n.getBoundingClientRect().width);
  const sigL = () => JSON.stringify({ s: lab.state, layers: lab.layers?.(), pal: lab.palette?.(), sk: ThreeLab.scenes?.currentId?.(), code: (ThreeLab.director?.codeOf?.().code || '').length });
  await runArea('Lab', {
    sig: sigL,
    skip: /^(P|Shift\+F|Ctrl\+Shift\+Enter|Ctrl\+PgDn|Ctrl\+PgUp)$/, // fullscreen Present / Focus, a fresh page, sketch switching (journey-lab covers them)
    before: async () => { if (H.activeId !== 'tool:three') activate('tool:three'); const r = pic?.getBoundingClientRect(); if (r) { await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: r.left + r.width / 2, y: r.top + r.height * 0.6, button: 'left', clickCount: 1 } }); await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: r.left + r.width / 2, y: r.top + r.height * 0.6, button: 'left', clickCount: 1 } }); } await wait(100); },
    restore: async () => { if (lab.state.frozen) { await press(one('F')); await wait(200); } await press(one('Escape')); }, // keys, not calls (a size change can keep a call waiting for the next frame)
  });
}

// ---------- app-wide ----------
if (AREAS.includes('Everywhere')) {
  activate(H.claudeAgent().id); await wait(300);
  await runArea('Everywhere', {
    sig: () => '',
    skip: /^(Esc|Ctrl\+=|Ctrl\+-|Ctrl\+0)$/, // Esc only closes; the text size is checked below
    before: async () => { activate(H.claudeAgent().id); document.body.focus(); await wait(50); },
    restore: async () => { if (H.grid) handleShortcut({ key: 'g' }); if (!H.panelOpen) handleShortcut({ key: '\\' }); if (!document.getElementById('broadcast')?.classList.contains('hidden')) handleShortcut({ key: 'b' }); activate(H.claudeAgent().id); },
  });
  const z0 = await window.hub.getZoom(); await press(one('Ctrl+=')); await wait(300); const z1 = await window.hub.getZoom(); await press(one('Ctrl+0')); await wait(300);
  if (!(z1 > z0)) out.dead.push('Everywhere · Ctrl+= · text size');
  if (await window.hub.getZoom() !== 1) out.dead.push('Everywhere · Ctrl+0 · text size back to 100 %');
}

// ---------- the same key in two areas on screen together ----------
const norm = (c) => `${c.ctrl ? 'Ctrl+' : ''}${c.alt ? 'Alt+' : ''}${c.shift ? 'Shift+' : ''}${c.code}`;
const together = { Board: ['Everywhere', 'Capture'], Editor: ['Everywhere', 'Capture', 'Video Review', 'Chat box'], 'Video Review': ['Everywhere', 'Capture', 'Chat box'], Lab: ['Everywhere', 'Capture', 'Chat box', 'Lab timeline', 'Lab sliders & layers'], 'Chat box': ['Everywhere', 'Capture'], Capture: ['Everywhere'] };
const byArea = {};
for (const k of Keys.all()) for (const c of combos(k.keys)) (byArea[k.area] ||= []).push({ id: norm(c), label: c.label, what: k.what, cap: /\((player|annotate|picture|captures|region|drag)/.test(k.keys) });
for (const [a, others] of Object.entries(together)) {
  for (const x of byArea[a] || []) {
    if (x.cap) continue;
    for (const o of others) for (const y of (byArea[o] || []).filter((q) => !q.cap && q.id === x.id)) out.conflicts.push(`${x.label}: ${a} "${x.what}" ⇄ ${o} "${y.what}"`);
  }
}
out.conflicts = [...new Set(out.conflicts)];
console.error = origErr; mo.disconnect();
out.ok = !out.dead.length && !out.globalToo.length && !out.errors.length && !out.dups.length;
return JSON.stringify(out, null, 1);
