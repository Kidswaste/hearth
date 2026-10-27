// menucalm (round 43): every menu the owner points at, read the way it shows (showMenu's More… and tidy, popMenu's
// folds), with budgets per menu: rows at the top, every action within 2 clicks (pointing opens a submenu, and a
// submenu inside it: #menu-fly, #menu-fly2), no row twice in one list, one name and one icon for the same action in
// every menu, no command names, a one-sentence tooltip where a hint is cut short, nothing that was there before gone
// (by name, or its new name), the Lab's moved rows still found by Lab search, and a real right-click + pointing.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/menucalm.js --shot /tmp/menucalm.png
// The counts per menu are in the result ("menus") and in docs/upgrades/menucalm.md.
const out = { steps: [], menus: {} };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const cdp = (method, params) => smoke({ cdp: method, params });
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra });
const SONG = '/tmp/hearth-test-song.wav';

// ---------- budgets: the most rows at the top of each menu ----------
const BUDGET = {
  'Chat ⋯ (right-click)': 10, 'Message ⋯': 7, 'Chat box (right-click)': 7, 'Chats list (right-click)': 10, 'Chat group (right-click)': 5,
  'Rail: an AI': 7, 'Rail: a tool': 4, 'Rail (right-click)': 7,
  'Lab preview (right-click)': 12, 'Lab ✦ More': 10, 'Lab toolbar ⋯': 11, 'Lab Sketch ▾': 10, 'Lab layer (right-click)': 9, 'Lab waveform (right-click)': 12,
  'Board (right-click)': 11, 'Board ▾': 12, 'Board ＋ Add': 13,
};
// what was in the menus before this round (their rows one or two levels down), by name; a renamed row by its new name
const BEFORE = {
  lab: ['❚❚ Freeze', '✨ Make it look finished', '▤ Add this scene to the sequence', '⇉ Dispatch parts to other chats…', '⇪ Render this comp 9:16', '🧊 Model library…', '＋ Add a model file…', '🌅 Free skies (Poly Haven)…', 'Open the asset library', 'Free skies, textures and models…', '🎚 Save this layer\'s sliders as a preset', '◇ New shader layer…', 'Import Shadertoy / ISF…', 'Shader workbench', '✦ New particle layer…', 'Particle word…', 'Model into dust', 'Light off this scene', '🅰 New type layer…', 'Lyrics…', 'Lyrics from a file…', '🎤 Tap along…', '● Turn the camera on', 'Mirror', 'Share the camera with the director', 'What it sees now', '⚛ New physics layer…', 'Falling letters…', 'Bouncing balls on beat', 'Cloth in the wind', 'Model rain', '▶ Show mode', '📱 Phone remote…', '◐ Grade panel…', 'Scopes', '⇩ Export the grade as a .cube…', '⇪ Export…', '▦ All formats…', '4K MP4, supersampled', 'ProRes 4444 + alpha', 'Perfect loop GIF', 'Still for print (16-bit)', '🧊 GLB of the 3D content', 'Web page (one .html)', 'Sliders as a preset file', 'Contact sheet', '🩺 Fix my scene', '⇥ Push in', '⇤ Pull out', '⇡ Crane up', '⇣ Crane down', '≋ Handheld shake', '〜 Slow drift', '⇢ From this view…', '🎥 Your moves…', 'Fit', '9:16', '16:9', '4:5', '1:1', 'Safe zones', '📷 Still at the frame size', '📋 Copy this frame', 'Save a screenshot', '◐ Pin this frame to compare', '🎞 Contact sheet', '📌 Note at this moment', '● Record the Lab preview…', '◉ More capture…', '🎲 Shuffle', 'The shuffle before', '💾 Save into the code', 'Save as a look', 'Next look', '▣ Present', '🖥 Stage window', '⛶ Focus', 'Lighten to stay smooth', '◎ Frame the subject', '⌂ Reset the view', 'Keep this view', 'Moving around…', '⟲ Restart from scratch', 'Lab keys',
    // ✦ More's rows (one level further down then)
    '✦ Make it react to the music', '♪ Move a slider with the music…', 'Stop everything following the sound', 'Jump to the next drop', 'Next cue', 'Previous cue', 'Pick the triggers from the song', 'Click on every beat', 'Save the loop as its own file', 'What\'s in the song', 'Its key, drops and builds', '🎲 Variations', 'Put Hearth on screen', 'A cursor tour', 'Fade to black and back', '✦ Describe it…', '🎨 Make it look like this…', '⧉ Make a batch…', '👥 4 variations of this scene…', 'Render this chat\'s sequence again', '🎬 A music video from this song', 'What the Lab shows now', 'What the Lab hears now', '⇪ Save as a pack…', 'Open a pack…', 'New from my template…', 'Save as my template…', '● Record a recipe', 'Use a recipe…', 'Use on several scenes…',
    // the toolbar's ⋯
    'Moving around the picture', '📷 Screenshot', '📋 Copy a screenshot', 'The capture menu…', 'Always show', 'Only with the code', 'Only when I open it', 'Insert snippet…', 'Live code', '▦ All formats', 'What it is making', 'What it did lately', 'What it costs per message', 'Its last picture, bigger', '↶ Undo its last code edit', 'Frame pace', 'Key hints on hover',
    // Sketch ▾
    'New from a template…', '▦ All your sketches', 'Rename…', 'Duplicate', 'History…', '🛟 Recover lost scenes…', '⏱ Time machine…', 'Copy all the code', 'Cycle looks…', 'Export HTML…', 'Ask Claude about this layer', 'Delete…',
    // a layer
    'Show only this one', '⧉ Duplicate', 'Add a filter above…', 'Apply a look…', 'Blend…', 'Animate…', 'Ease every keyframe…', 'Recolor with the palette', 'Stop it following the sound', 'Reset its sliders to the code', '💾 Save its sliders into the code',
    // the waveform
    '🎥 Camera move from here…', 'Play from here', 'Loop this bar', 'Loop 4 bars from here', 'Song starts here', 'Song ends here', 'Save the whole file as a file', 'Cue here', 'Section here…', 'The 1 is here', 'Whole song'],
  chat: ['＋ New chat', '🗜 Compact context', 'Find in this chat…', 'Open / close all thinking', 'Fold all long replies', 'Unfold all replies', 'Jump to the first message', 'Read the last reply aloud', 'Chat stats', 'Everything it can do…', 'Pin to top', 'Tags and folder…', 'Duplicate this chat', 'Copy as Markdown', 'Copy the last reply', 'Export as Markdown file…', 'Export as JSON (to import later)…', 'Delete chat',
    'Copy', 'Read aloud', 'Quote in my message', 'Branch: new chat from here', 'Retry: write it again', 'Copy as plain text', 'Copy “/jump 2”', 'Save as a Markdown file…', 'Save to notes', 'Show the Markdown source', '📌 Pin message', '🔖 Bookmark',
    'Open', 'Rename', 'Tag…', 'Move to folder…', 'Archive (hide from the list)', 'Mark as unread',
    '＋ Add an agent or website…', '⌘ Command palette', 'Command bar', '☰ Chats panel', '🗒 Notes', '🧠 Memory', '▦ All side by side', '⌨ Ask-all bar', 'Your usage…', '⇪ Import past chats…', '⚙ Settings'],
  board: ['📌 Find images like this…', 'New board…', 'Brief…', 'Lock the board', 'Give the vibe to the Three Director', 'Group by vibe (framed, named)', 'Palette → Lab look', 'Clips on a timeline', 'Duplicate the board', 'Starred', 'Statistics', 'Copy the board as a picture', 'Tidy media folder (unused files)', 'Save as a template…', 'Selected picture as the background', 'Untangle overlaps', 'Pictures or clips…', 'Website…', 'Note', 'Text', 'From the clipboard', '📌 Images like this board…', 'Search and filter…', 'Undo', 'Redo', 'Keys on the board…'],
};
const RENAMED = {
  'Lighten to stay smooth': 'Quality: auto', // (round 74: labfps72's name for it, round 72)
  'Save a screenshot': '🖼 Save a screenshot', '📷 Screenshot': '🖼 Save a screenshot', 'The capture menu…': '◉ More capture…', 'Contact sheet': '🎞 Contact sheet as a file',
  Duplicate: '⧉ Duplicate', 'History…': 'Earlier versions and deleted sketches…', 'Export HTML…': 'Web page (one .html)…', 'Save the whole file as a file': 'Save the whole song as its own file',
  'Section here…': 'Section here', 'Whole song': 'Zoom out to the whole song', 'Copy “/jump 2”': 'Copy a way back here', '⌘ Command palette': '⌕ Find anything…', 'Command bar': 'Typed actions…',
  '📌 Images like this board…': '📌 Find images like this…',
};
// one name, one icon: a row whose words are these carries this icon in every menu (leaf rows)
const CANON = { Duplicate: '⧉', 'Contact sheet': '🎞', 'Save a screenshot': '🖼', 'Find images like this…': '📌', 'Restart from scratch': '⟲', 'Composition guides': '⌗', 'Stage window': '🖥', Present: '▣', Focus: '⛶', Variations: '🎲', 'All formats': '▦', 'Make it react to the music': '✦', 'Fix my scene': '🩺', 'Time machine…': '⏱', 'Make a batch…': '⧉', 'More capture…': '◉', 'Find anything…': '⌕' };
// names that must not show any more (old wordings of a row that has one name now, jargon)
const OLD = [/^⌘ Command palette$/, /^Command bar$/, /^The capture menu…$/, /^Pinterest: find more like this$/, /^📌 Images like this board…$/, /^📷 Camera$/, /^Export HTML…$/, /^Guides$/, /^📷 Screenshot$/, /^Save a screenshot$/, /Save the whole file/, /^Whole song$/];
const CMD = /(^|[\s“"(])\/[a-z][\w-]{2,}/; // a /command on screen

// ---------- reading a menu the way it shows ----------
const isSep = (it) => it === '-' || it === null || it?.sep;
const call = (x) => { try { return typeof x === 'function' ? x() : x; } catch { return []; } };
const words = (l) => String(l ?? '').split(/\s{2,}(?=\S+$)/)[0].trim(); // "Note  N" → "Note" (showMenu's inline key)
function view(items, tuple, depth = 0) {
  let list = call(items); if (!Array.isArray(list)) return [];
  list = list.filter((x) => x !== false && x !== undefined);
  if (!tuple) {
    list = menuTidy(list.filter((it) => it && !(Array.isArray(it.items) && !it.items.filter(Boolean).length)));
    const rest = list.filter((it) => typeof it === 'object' && it.more);
    if (rest.length > 1) { const main = list.filter((it) => !(typeof it === 'object' && it.more)); let at = main.findIndex((it) => it.danger); if (at > 0 && isSep(main[at - 1])) at -= 1; main.splice(at < 0 ? main.length : at, 0, { label: 'More…', items: rest.map((it) => ({ ...it, more: false })) }); list = main; }
  } else list = popFold(list.filter(Boolean));
  const rows = [];
  for (const it of list) {
    if (isSep(it) || typeof it === 'string') continue;
    let label; let hint; let sub = null; let tip = '';
    if (Array.isArray(it)) { [label, hint] = it; tip = it[5] || ''; if (Array.isArray(it[2])) sub = it[2]; }
    else { if (it.back) continue; ({ label, hint } = it); tip = it.tip || ''; if (it.items) sub = it.items; }
    label = words(label);
    if (!label || label === '‹ back') continue;
    rows.push({ label, hint: String(hint || ''), tip, sub: sub && depth < 6 ? view(sub, tuple, depth + 1) : null });
  }
  return rows;
}
const norm = (s) => { const t = String(s).replace(/^[✓●★]\s*/, '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/…$/, '').trim().toLowerCase(); return t || String(s).trim(); };
const bareWords = (s) => String(s).replace(/^[^\p{L}\p{N}]+/u, '').trim();
// clicks to a row at depth d: showMenu points two levels (#menu-fly, #menu-fly2), so d ≤ 3 is one click, then one
// click a level; popMenu (the Lab's two-column menus) opens each level with a click
const clicksOf = (d, tuple) => (tuple ? d : d <= 3 ? 1 : d - 2);
function measure(rows, tuple) {
  let depth = 0; let total = 0; let longest = 0; const dups = []; const leaves = [];
  const walk = (list, d, path) => {
    depth = Math.max(depth, d); longest = Math.max(longest, list.length);
    const seen = new Set();
    for (const r of list) {
      total += 1;
      const k = norm(r.label);
      if (seen.has(k)) dups.push(`${path.join(' › ')} › ${r.label}`); else seen.add(k);
      if (r.sub) walk(r.sub, d + 1, [...path, r.label]); else leaves.push({ ...r, d, clicks: clicksOf(d, tuple), path: path.join(' › ') });
    }
  };
  walk(rows, 1, []);
  return { top: rows.length, depth, total, longest, dups, leaves };
}
const M = {};
function record(name, rows, tuple) {
  const m = measure(rows, tuple);
  M[name] = { ...m, rows, tuple };
  out.menus[name] = { top: m.top, depth: m.depth, total: m.total, longest: m.longest, rows: rows.map((r) => (r.sub ? `${r.label} ›` : r.label)) };
  return m;
}
function capture(fn) {
  const got = [];
  const keep = { showMenu: window.showMenu, popMenu: window.popMenu };
  window.showMenu = (x, y, items) => { got.push({ items, tuple: false }); };
  window.popMenu = (x, y, items) => { got.push({ items, tuple: true }); };
  try { fn(); } catch (e) { got.push({ error: String(e) }); } finally { window.showMenu = keep.showMenu; window.popMenu = keep.popMenu; }
  return got.find((g) => g.items) || null;
}
const rclick = (node, dx = 0.5, dy = 0.5) => { const r = node.getBoundingClientRect(); node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + r.width * dx, clientY: r.top + r.height * dy, button: 2 })); };
const vis = (n) => n?.isConnected && n.checkVisibility?.({ visibilityProperty: true });
const first = (sel) => [...document.querySelectorAll(sel)].find(vis);

// ---------- the chat ----------
const claude = H.claudeAgent();
activate(claude.id); await wait(400);
Native.newChat?.(claude.id); await wait(300);
const v = Native.view(claude.id);
v.input.value = 'hello there'; v.form.requestSubmit();
await until(() => !Native.isBusy(H.activeChat[claude.id]) && Native.current(claude.id)?.messages.length >= 2, 30000); await wait(500);
const CHAT = [
  ['Chat ⋯ (right-click)', '.surface.active .native-head'], ['Message ⋯', '.surface.active .messages .msg.assistant > .body'], ['Chat box (right-click)', '.surface.active form.composer'],
  ['Chats list (right-click)', '#panel .item'], ['Chat group (right-click)', '#panel .group-head'],
  // (round 74, checkhealth74) the Projects / Life spaces: the AIs in the bar above the chat, a tool as a rail shortcut
  ['Rail: an AI', '#agent-buttons .agent-btn:not(.tool-btn-rail), .workspace-switcher .agent-btn'], ['Rail: a tool', '#agent-buttons .tool-btn-rail, #agent-buttons .space-button[data-shortcut]'], ['Rail (right-click)', '#rail .spacer'],
];
for (const [name, sel] of CHAT) {
  const n = first(sel);
  const m = n && capture(() => rclick(n, 0.3, 0.3));
  if (m) record(name, view(m.items, m.tuple), m.tuple); else step(`${name}: opens`, false, sel);
}

// ---------- the Lab ----------
await Commands.tryRun('/director-setup', claude.id);
await until(() => H.agents().some((a) => a.dock === 'three'));
activate('tool:three'); await wait(400);
const c = await ThreeLab.cmd();
await until(() => ThreeLab.search?.menus, 15000);
await wait(1500);
try { await c.loadSong(SONG); await until(() => c.player?.loaded, 8000); } catch (e) { out.songError = String(e); }
await wait(800);
const LM = ThreeLab.search.menus();
const prevRows = view(LM.preview, false);
record('Lab preview (right-click)', prevRows, false);
const moreRow = prevRows.find((r) => r.label.startsWith('✦ More'));
if (moreRow) record('Lab ✦ More', moreRow.sub, false);
record('Lab toolbar ⋯', view(LM.more, true), true);
record('Lab Sketch ▾', view(LM.sketch, true), true);
const L0 = ThreeLab.search.layers?.().find((x) => x.selected) || ThreeLab.search.layers?.()[0];
const lm = L0 && ThreeLab.search.layerMenu(L0.id);
if (lm) record('Lab layer (right-click)', view(LabEasy.layerItems(lm.L, lm.h), false), false);
const wave = first('canvas.mb-timeline');
if (wave) {
  const m = capture(() => rclick(wave, 0.3, 0.12));
  if (m) record('Lab waveform (right-click)', view(m.items, m.tuple), m.tuple); else step('the waveform\'s right-click opens', false);
}

// ---------- a real right-click on the picture: the rows, their tooltips, pointing two levels deep ----------
{
  const frame = [...document.querySelectorAll('iframe.three-frame')].find((f) => f.offsetParent && f.getBoundingClientRect().width > 100);
  const fr = frame.getBoundingClientRect();
  const cx = Math.round(fr.left + fr.width * 0.3); const cy = Math.round(fr.top + fr.height * 0.4);
  for (let i = 0; i < 4 && !first('#menu'); i++) {
    await mouse('mouseMoved', cx, cy); await mouse('mousePressed', cx, cy, { button: 'right', buttons: 2, clickCount: 1 }); await mouse('mouseReleased', cx, cy, { button: 'right', buttons: 0, clickCount: 1 });
    await until(() => first('#menu'), 2500);
  }
  const rows = [...document.querySelectorAll('#menu > button')];
  step('the picture\'s right-click shows the calm order: Freeze, Frame size, Sliders, ♪ Music, Capture, View, then ＋ Add, ✨ Look & motion, ⇪ Make & export, ✦ More',
    ['Freeze', 'Frame size', 'Sliders', 'Music', 'Capture', 'View', 'Add', 'Look & motion', 'Make & export', 'More'].every((w, i, a) => { const at = rows.findIndex((b) => bareWords(b.firstChild?.textContent || '') === w || bareWords(b.firstChild?.textContent || '').startsWith(w)); return at >= 0 && (i === 0 || at > rows.findIndex((b) => bareWords(b.firstChild?.textContent || '').startsWith(a[i - 1]))); }),
    rows.map((b) => b.firstChild?.textContent));
  const cut = rows.filter((b) => (b.querySelector('.menu-hint')?.textContent || '').length > 24 && !b.title);
  const subNoTip = rows.filter((b) => b.classList.contains('has-sub') && !b.title && !/Customise/.test(b.textContent));
  step('every row whose hint is cut short, and every submenu row, says what it does when pointed at (one sentence)', !cut.length && !subNoTip.length && rows.filter((b) => b.title).every((b) => /^[A-Z0-9“"⇪✦♪].*[.!?…)]$/.test(b.title) && (b.title.match(/[.!?](\s|$)/g) || []).length <= 1),
    { cut: cut.map((b) => b.firstChild?.textContent), subNoTip: subNoTip.map((b) => b.firstChild?.textContent), tips: rows.filter((b) => b.title).map((b) => b.title).slice(0, 12) });
  await smoke({ shot: '/tmp/menucalm-preview.png' });
  // point at ✨ Look & motion, then at ◐ Grade inside its flyout: the third level shows without a click
  const look = rows.find((b) => /Look & motion/.test(b.textContent));
  if (look) {
    const r = look.getBoundingClientRect();
    await mouse('mouseMoved', r.left + 20, r.top + r.height / 2); await mouse('mouseMoved', r.left + 40, r.top + r.height / 2);
    await until(() => first('#menu-fly') && document.querySelector('#menu-fly').dataset.for === '✨ Look & motion', 3000);
    const g = [...document.querySelectorAll('#menu-fly > button.has-sub')].find((b) => /Grade|Camera moves/.test(b.textContent));
    if (g) { const q = g.getBoundingClientRect(); await mouse('mouseMoved', q.left + 15, q.top + q.height / 2); await mouse('mouseMoved', q.left + 40, q.top + q.height / 2); }
    await until(() => first('#menu-fly2'), 3000);
    const f2 = [...document.querySelectorAll('#menu-fly2 > button')].map((b) => b.firstChild?.textContent);
    await smoke({ shot: '/tmp/menucalm-fly2.png' });
    step('pointing at a submenu inside a flyout shows its rows beside it (#menu-fly2): a row three levels down is one click', Boolean(g) && f2.length >= 3, { at: g?.firstChild?.textContent, rows: f2.slice(0, 6) });
    // a click there runs the row and closes all three panels
    const b2 = [...document.querySelectorAll('#menu-fly2 > button:not(.has-sub)')].find((b) => /Grade panel|Your moves/.test(b.textContent)) || null;
    if (b2) { b2.click(); await wait(300); }
    step('a click in the second flyout runs its row and closes every panel', !first('#menu') && !first('#menu-fly') && !first('#menu-fly2'), { clicked: b2?.firstChild?.textContent });
    document.querySelector('.grade-panel .close, .gr-close')?.click?.();
  }
  hideMenu();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(200);
}

// ---------- the board ----------
try {
  activate('tool:board'); await until(() => typeof Board !== 'undefined' && Board._?.boardItems, 15000); await wait(800);
  const vp = first('.bd-vp, .bd-viewport');
  const m = vp && capture(() => rclick(vp, 0.5, 0.5));
  if (m) record('Board (right-click)', view(m.items, m.tuple), m.tuple);
  const bm = capture(() => Board._.boardMenu({ currentTarget: first('.bd-boardbtn') || document.body }));
  if (bm) record('Board ▾', view(bm.items, false), false);
  record('Board ＋ Add', view(Board._.addItems(null), false), false);
} catch (e) { step('the board opens', false, String(e)); }
activate('tool:three'); await wait(300);

// ---------- the rules ----------
const names = Object.keys(M);
step(`all ${Object.keys(BUDGET).length} menus read`, Object.keys(BUDGET).every((k) => M[k]), Object.keys(BUDGET).filter((k) => !M[k]));
const over = names.filter((k) => BUDGET[k] && M[k].top > BUDGET[k]).map((k) => `${k}: ${M[k].top} > ${BUDGET[k]}`);
step('every menu within its budget of rows at the top', !over.length, over);
const dups = names.flatMap((k) => M[k].dups.map((d) => `${k}${d}`)).filter((d) => !/Recent chats|Link to a chat|Sticker|Show the board to a chat|Send|Claude ›|Astra ›|Three Director ›/.test(d));
step('no row twice in one list', !dups.length, dups);
// (🎚 Live (VJ)'s settings of settings, Transition › Length › 1 bar…, were 3 clicks before and still are)
const DEEP_OK = /🎚 Live \(VJ\) › [^›]+ › /;
// within 2 clicks: here, or in another menu read here (Board ＋ Add holds the board's deepest rows at 2 clicks)
const near = new Set(names.flatMap((k) => M[k].leaves.filter((l) => l.clicks <= 2).map((l) => norm(l.label))));
const far = names.flatMap((k) => M[k].leaves.filter((l) => l.clicks > 2 && !near.has(norm(l.label)) && !DEEP_OK.test(`${l.path} › `)).map((l) => `${k} › ${l.path} › ${l.label} (${l.clicks})`));
step('every action within 2 clicks (pointing opens a submenu and a submenu in it)', !far.length, far.slice(0, 20));
// the Lab's own menus: every row ≤ 2 clicks right there
const labFar = names.filter((k) => k.startsWith('Lab ')).flatMap((k) => M[k].leaves.filter((l) => l.clicks > 2 && !/Customise this/.test(l.path) && !DEEP_OK.test(`${l.path} › `)).map((l) => `${k} › ${l.path} › ${l.label}`));
step('the Lab\'s menus: every row within 2 clicks in the menu itself', !labFar.length, labFar.slice(0, 20));
const all = names.flatMap((k) => M[k].leaves.map((l) => ({ ...l, menu: k })));
const allRows = names.flatMap((k) => { const acc = []; const walk = (list) => { for (const r of list) { acc.push(r); if (r.sub) walk(r.sub); } }; walk(M[k].rows); return acc.map((r) => ({ ...r, menu: k })); });
const canon = all.filter((l) => CANON[bareWords(l.label)] && !l.label.startsWith(CANON[bareWords(l.label)]) && !/Arrange/.test(l.path)) // (a board layout called "Contact sheet" is another thing).map((l) => `${l.menu} › ${l.path} › ${l.label} (wants ${CANON[bareWords(l.label)]})`);
step('the same action has the same name and icon in every menu', !canon.length, canon);
const old = allRows.filter((r) => OLD.some((re) => re.test(r.label))).map((r) => `${r.menu}: ${r.label}`);
step('no old wording left (one name per action)', !old.length, old);
const cmds = allRows.filter((r) => CMD.test(r.label) || CMD.test(r.hint)).map((r) => `${r.menu}: ${r.label} · ${r.hint}`);
step('no command names in any row or its hint', !cmds.length, cmds);
// nothing gone: every row of before (by name, or its new name) is in some menu now
const have = new Set(allRows.map((r) => norm(r.label)));
const gone = Object.entries(BEFORE).flatMap(([g, list]) => list.map((l) => RENAMED[l] || l).filter((l) => !have.has(norm(l))).map((l) => `${g}: ${l}`));
step('nothing that was in these menus is gone (renamed rows by their new name)', !gone.length, gone);
// state: rows that mean nothing now don't show
const st = [];
if (M['Board ▾'] && allRows.some((r) => r.menu === 'Board ▾' && /^Show hidden \(0\)/.test(r.label))) st.push('Board ▾: Show hidden (0)');
if (Board?.boards?.().length < 2 && allRows.some((r) => /^Compare with another board/.test(r.label))) st.push('Compare with another board (no other board)');
if (allRows.some((r) => /^Remove the loop$/.test(r.label)) && !c.player?.loop) st.push('waveform: Remove the loop with no loop');
step('rows that mean nothing right now don\'t show', !st.length, st);

// ---------- Lab search and Find anything still find the moved rows ----------
try {
  if (typeof LabSearch === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('labsearch');
  LabSearch.open(); await wait(400);
  const wanted = ['Webcam', 'Contact sheet as a file', 'Other formats', 'Camera moves', 'Earlier versions and deleted sketches', 'Share & export', 'Code & console', 'View & help', 'Make & export'];
  const missing = wanted.filter((w) => !LabSearch.find(w, 12).some((r) => norm(r.item.label).includes(norm(w))));
  step('Lab search finds the moved rows by their names', !missing.length, missing);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(200);
  document.querySelector('dialog.ls-dlg')?.close?.();
} catch (e) { step('Lab search finds the moved rows', false, String(e)); }
try {
  if (typeof AppSearch === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('appsearch');
  activate(claude.id); await wait(400);
  AppUI.palette(); await wait(600);
  await until(() => typeof AppSearch !== 'undefined', 8000);
  const rows = AppSearch.find('typed actions') || [];
  const rail = rows.some((r) => /Typed actions/.test(r.label || r.item?.label || ''));
  step('Find anything finds the rail\'s renamed rows (Typed actions…)', rail, rows.slice(0, 5).map((r) => r.label || r.item?.label));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
} catch (e) { step('Find anything finds the renamed rows', false, String(e)); }

out.pass = out.steps.every((s) => s.ok);
return JSON.stringify(out);
