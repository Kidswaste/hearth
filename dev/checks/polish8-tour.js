// Polish 8: a picture tour of the round 7 surfaces (mood board, the video editor, capture, the keys sheet, menus) in
// one look, plus the visible-control counts of those surfaces (counted like dev/checks/clutter.js).
//   sh dev/board-fixtures.sh && node dev/make-editor-videos.js /tmp/hearth-editor-videos
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/polish8-tour.js --shot /tmp/p8.png
// window.P8_LOOK = a look id (default forgeheart), window.P8_SHOTS = folder for the pictures (default /tmp/p8/<look>).
const LOOK = window.P8_LOOK || 'forgeheart';
const DIR = window.P8_SHOTS || `/tmp/p8/${LOOK}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(120); } return false; };
const SEL = 'button, select, input:not([type=hidden]), textarea, summary, a[href], [role=button]';
const vis = (n) => n.checkVisibility?.({ visibilityProperty: true }) && n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height > 0;
const count = (root, skip) => (root ? [...root.querySelectorAll(SEL)].filter((n) => vis(n) && !(skip && n.closest(skip))).length : null);
const names = (root, skip) => (root ? [...root.querySelectorAll(SEL)].filter((n) => vis(n) && !(skip && n.closest(skip))).map((n) => (n.dataset?.feature || n.textContent || n.title || n.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 14)) : []);
const shot = (name) => smoke({ shot: `${DIR}/${name}.png` });
const out = { look: LOOK, counts: {}, menus: {}, notes: [] };
const menuRows = () => [...document.querySelectorAll('#menu:not([hidden]) > button')].filter(vis).map((b) => b.textContent.trim().replace(/\s+/g, ' ').slice(0, 40));
const rec = (name, root, skip) => { out.counts[name] = count(root, skip); out.counts[`${name} ·`] = names(root, skip).join(' | '); };
const rclick = async (node, x, y) => { node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 })); await wait(250); };
const fly = async (label) => { const b = [...document.querySelectorAll('#menu > button')].find((x) => x.textContent.includes(label)); if (b) { b.dispatchEvent(new PointerEvent('pointerenter')); await wait(450); } return Boolean(b); };

Look.applyPreset(LOOK, { quiet: true }); await wait(600);
document.querySelectorAll('.toast').forEach((t) => t.remove());

// ---------- the keys sheet ----------
KeysUI.open(); await wait(500); await shot('keys-sheet');
out.keysAreas = [...Keys.groups(true).keys()];
KeysUI.close(); await wait(200);

// ---------- board ----------
activate('tool:board');
await until(() => Board.isMounted() && Board.current());
await wait(500);
const bRoot = document.querySelector('.bd-root');
rec('board (empty)', bRoot, '.bd-world');
await shot('board-empty');
const FIX = '/tmp/hearth-board-fixtures';
await Board.addFiles(['neon big.png', 'golden-hour.jpg', 'loop.gif', 'cuts.mp4', 'calm.mp4'].map((f) => `${FIX}/${f}`));
Board.addNote?.('Warm, grainy, slow pushes. Gold on black.');
await until(() => Board.items().length >= 6, 8000);
await wait(2500); Board.zoomFit(); await wait(1200);
rec('board (with items)', bRoot, '.bd-world');
await shot('board-items');
const first = Board.items().find((i) => i.type === 'image');
Board.select([first.id]); await wait(300);
rec('board (one selected)', bRoot, '.bd-world');
const itn = document.querySelector(`.bd-item[data-id="${first.id}"]`);
const ir = itn.getBoundingClientRect();
await rclick(itn, ir.left + ir.width / 2, ir.top + ir.height / 2);
out.menus['board item'] = menuRows();
await shot('board-item-menu');
hideMenu();
Board.select([]); await wait(200);
const vr = document.querySelector('.bd-vp').getBoundingClientRect();
await rclick(document.querySelector('.bd-vp'), vr.left + 40, vr.bottom - 60);
out.menus['board canvas'] = menuRows();
await shot('board-canvas-menu');
hideMenu();
document.querySelector('.bd-add')?.click(); await wait(250);
out.menus['board + Add'] = menuRows();
hideMenu();
document.querySelector('.bd-boardbtn')?.click(); await wait(250);
out.menus['board chip'] = menuRows();
hideMenu();

// ---------- the board drawer over a chat ----------
const claude = H.claudeAgent();
activate(claude.id); await wait(500);
BoardDrawer.toggle(true); await wait(900);
rec('board drawer', document.querySelector('.bdd'));
await shot('board-drawer');
BoardDrawer.toggle(false); await wait(400);

// ---------- capture ----------
Capture.menu(80, 120, Capture.mainItems()); await wait(300);
out.menus.capture = menuRows();
await shot('capture-menu');
hideMenu();
const cap = await Capture.shot({ target: 'window', quiet: true });
await wait(300);
await CaptureView.library?.(); await wait(800);
rec('captures library', document.querySelector('dialog[open]'));
await shot('capture-library');
document.querySelector('dialog[open]')?.close(); await wait(200);
await CaptureView.open(cap.path); await wait(900);
rec('capture viewer', document.querySelector('dialog[open]'));
await shot('capture-viewer');
document.querySelector('dialog[open]')?.close(); await wait(300);

// ---------- the video editor ----------
const SRC = '/tmp/hearth-editor-videos';
const VIDS = `${window.SMOKE_SAVES || '/tmp'}/p8-renders`;
await window.hub.fs.write(`${VIDS}/.keep`, '');
for (const f of (await window.hub.fs.list(SRC)).filter((x) => !x.isDir && /\.mp4$/.test(x.name))) await window.hub.fs.copy(f.path, `${VIDS}/${f.name}`);
activate('tool:ae');
await Review.ensureMounted();
H.config.settings = { ...H.config.settings, videoDirs: [VIDS] };
await Review.load(true);
await until(() => Review.videos.length >= 3, 10000);
const A = Review.videos.find((v) => /frames_a_30/.test(v.path)).path;
const B = Review.videos.find((v) => /frames_b_30/.test(v.path)).path;
await Review.open(A); await Review.waitReady(); await wait(500);
const aeRoot = H.surfaces.get('tool:ae').el;
rec('video review', aeRoot, '.vr-item, .vr-lib-item, .vr-card, .vr-note');
await shot('review');
await VideoCut.enter(); await wait(500);
await VideoCut.addClip(B); await wait(400);
await VideoCut.addTitle?.('HEARTH'); await wait(400);
VideoCut.goFrame(20); await wait(700);
rec('editor (whole tool)', aeRoot, '.vr-item, .vr-lib-item, .vr-card, .vr-note');
rec('editor head row', aeRoot.querySelector('.vr-cut-headrow'));
await shot('editor');
const cv = aeRoot.querySelector('.vr-cut-cv'); const cr = cv.getBoundingClientRect();
const lay = VideoCut._test.lanes?.() || null;
// right-click the first clip on the main lane: find it by scanning the canvas rows
let menuOk = false;
for (let y = cr.top + 14; y < cr.bottom - 4 && !menuOk; y += 8) {
  let h = null; try { h = VideoCut._test.hit({ clientX: cr.left + 30, clientY: y }); } catch { /* lane gap */ }
  if (h?.zone === 'clip') { await rclick(cv, cr.left + 30, y); menuOk = true; }
}
out.menus['editor clip'] = menuRows();
await shot('editor-clip-menu');
hideMenu();
[...aeRoot.querySelectorAll('.vr-cut-headrow .vr-ico')].find((b) => b.textContent === '⋯')?.click(); await wait(250);
out.menus['editor ⋯'] = menuRows();
await shot('editor-more-menu');
hideMenu();
aeRoot.querySelector('.vr-cut-export')?.click(); await wait(250);
out.menus['editor export'] = menuRows();
hideMenu();

// ---------- Lab ⋯ for comparison ----------
activate('tool:three'); await wait(3000);
const L = H.surfaces.get('tool:three').el;
[...L.querySelectorAll('[data-feature="Lab more"]')].find(vis)?.click(); await wait(300);
out.menus['lab ⋯'] = [...document.querySelectorAll('#menu:not([hidden]) > button, .mb-menu.lab-pop .menu-item')].filter(vis).map((b) => b.textContent.trim().replace(/\s+/g, ' ').slice(0, 40));
await shot('lab-menu');
hideMenu(); document.querySelectorAll('.mb-menu.lab-pop').forEach((m) => m.remove());
activate('tool:board'); await wait(600);
return JSON.stringify(out, null, 1);
