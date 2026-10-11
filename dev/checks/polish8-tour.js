// Polish 8: a picture tour of the round 7 surfaces (mood board, capture, the keys sheet, menus; the video editor until round 17) in
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

document.getElementById('rail-more')?.click(); await wait(300);
out.menus['rail ⋯'] = menuRows();
await shot('rail-more');
hideMenu();

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
const card = document.querySelector('dialog[open] .cap-card');
if (card) { const cr0 = card.getBoundingClientRect(); await rclick(card, cr0.left + 30, cr0.top + 30); out.menus['capture card'] = menuRows(); await shot('capture-card-menu'); hideMenu(); }
document.querySelector('dialog[open]')?.close(); await wait(200);
await CaptureView.open(cap.path); await wait(900);
rec('capture viewer', document.querySelector('dialog[open]'));
await shot('capture-viewer');
document.querySelector('dialog[open]')?.close(); await wait(300);

// ---------- Lab ⋯ for comparison ----------
activate('tool:three'); await wait(3000);
const L = H.surfaces.get('tool:three').el;
[...L.querySelectorAll('[data-feature="Lab more"]')].find(vis)?.click(); await wait(300);
out.menus['lab ⋯'] = [...document.querySelectorAll('#menu:not([hidden]) > button, .mb-menu.lab-pop .menu-item')].filter(vis).map((b) => b.textContent.trim().replace(/\s+/g, ' ').slice(0, 40));
await shot('lab-menu');
hideMenu(); document.querySelectorAll('.mb-menu.lab-pop').forEach((m) => m.remove());
activate('tool:board'); await wait(600);
return JSON.stringify(out, null, 1);
