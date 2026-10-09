// Polish 8 (round 8): the board, the editor and capture follow the same rules as the rest of the app — every menu
// ends with Customise this… (More… and Delete just above it), shared verbs carry the same icon, the keys sheet lists
// every area with an icon, the closed drawer is out of the page, the editor's monitor never shows over another tool,
// the new right-clicks open the chip / bar menus.
//   sh dev/board-fixtures.sh && node dev/make-editor-videos.js /tmp/hearth-editor-videos
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/polish8.js --shot /tmp/polish8.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(120); } return false; };
const vis = (n) => Boolean(n?.checkVisibility?.({ visibilityProperty: true }) && n.getBoundingClientRect().width > 0);
const out = { menus: {}, fail: [] };
const ok = (c, what) => { if (!c) out.fail.push(what); return c; };
const rows = () => [...document.querySelectorAll('#menu:not([hidden]) > button')].filter(vis);
const label = (b) => (b.firstChild?.nodeValue || b.textContent).trim();
const rclick = async (node, x, y) => { node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 })); await wait(250); };
// a menu that follows the shape: Customise this… last, More… / a danger row right above it, no separator doubled
function shape(name) {
  const r = rows();
  const labels = r.map(label);
  out.menus[name] = labels.join(' | ').slice(0, 300);
  ok(labels.at(-1) === 'Customise this…', `${name}: ends with Customise this… (${labels.at(-1)})`);
  const more = labels.indexOf('More…');
  if (more >= 0) ok(more >= labels.length - 3, `${name}: More… sits at the end`);
  const danger = r.findIndex((b) => b.classList.contains('danger'));
  if (danger >= 0) ok(danger === labels.length - 2, `${name}: Delete right above Customise this…`);
  const seps = [...document.querySelectorAll('#menu > .menu-sep')];
  ok(!seps.some((s) => s.nextElementSibling?.classList.contains('menu-sep')), `${name}: no doubled separators`);
  ok(document.querySelector('#menu > button:last-of-type svg.menu-ico'), `${name}: Customise this… has its icon`);
  hideMenu();
}

// ---------- the board ----------
activate('tool:board');
await until(() => Board.isMounted() && Board.current());
await Board.addFiles(['neon big.png', 'golden-hour.jpg', 'cuts.mp4'].map((f) => `/tmp/hearth-board-fixtures/${f}`));
await until(() => Board.items().length >= 3); Board.zoomFit(); await wait(1200);
ok(document.querySelector('.bd-boardbtn svg.hi-board'), 'board chip carries the board icon');
const it = Board.items().find((i) => i.type === 'image');
Board.select([it.id]); await wait(200);
const n = document.querySelector(`.bd-item[data-id="${it.id}"]`); const r = n.getBoundingClientRect();
await rclick(n, r.left + 20, r.top + 20); shape('board item');
ok(out.menus['board item'].indexOf('Look') < out.menus['board item'].indexOf('Send vibe'), 'board item: look before send');
const vp = document.querySelector('.bd-vp').getBoundingClientRect();
Board.select([]); await rclick(document.querySelector('.bd-vp'), vp.left + 30, vp.bottom - 40); shape('board canvas');
const chip = document.querySelector('.bd-boardbtn'); const cr = chip.getBoundingClientRect();
await rclick(chip, cr.left + 5, cr.top + 5); shape('Boards chip (right-click)');
chip.click(); await wait(250); shape('Boards chip (click)');
// the drawer: out of the page when closed, tidy when open
activate(H.claudeAgent().id); await wait(300);
BoardDrawer.toggle(true); await wait(600);
const dr = document.querySelector('.bdd');
ok(vis(dr), 'drawer shows');
const tiles = [...dr.querySelectorAll('.bdd-tile')];
ok(tiles.length >= 3 && tiles.every((t) => !vis(t.querySelector('.bdd-send'))), 'drawer: → waits for the pointer');
ok(!vis(dr.querySelector('.bdd-head > button[title="Open the board"]')), 'drawer: ↗ behind Alt');
const tr = tiles[0].getBoundingClientRect(); await rclick(tiles[0], tr.left + 10, tr.top + 10); shape('drawer tile');
BoardDrawer.toggle(false); await wait(500);
ok(getComputedStyle(dr).visibility === 'hidden', 'closed drawer: hidden (not focusable)');

// ---------- capture ----------
Capture.menu(80, 120, Capture.mainItems()); await wait(250);
ok(document.querySelectorAll('#menu > button svg.menu-ico').length >= 7, 'capture menu: icons instead of emoji');
ok(!rows().some((b) => /^[📷⬚✨●▶▦🎞]/u.test(label(b))), 'capture menu: no emoji left');
ok(rows().some((b) => b.classList.contains('has-sub') && label(b) === 'Screenshot of'), 'capture menu: real submenus (no "…" on › rows)');
shape('capture menu');
const shot = await Capture.shot({ target: 'window', quiet: true });
await CaptureView.library(); await wait(600);
const card = document.querySelector('dialog.cap-lib[open] .cap-card'); const kr = card.getBoundingClientRect();
await rclick(card, kr.left + 20, kr.top + 20);
ok(rows().some((b) => label(b) === 'Send to this chat') && rows().some((b) => label(b) === 'Send to a chat'), 'capture card: Send to this chat / Send to a chat');
shape('capture card');
const seg = document.querySelector('dialog.cap-lib[open] .cap-seg button.on');
ok(seg && getComputedStyle(seg).color !== getComputedStyle(seg).backgroundColor, 'captures library: the on tab is readable');
document.querySelector('dialog.cap-lib[open]').close(); await wait(200);
await CaptureView.open(shot.path); await wait(600);
ok([...document.querySelectorAll('dialog.cap-view[open] button')].some((b) => b.dataset.key === 'C'), 'viewer buttons carry their keys (Ctrl badges)');
document.querySelector('dialog.cap-view[open]')?.close(); await wait(200);

// ---------- the editor ----------
const VIDS = `${window.SMOKE_SAVES || '/tmp'}/p8c-renders`;
await window.hub.fs.write(`${VIDS}/.keep`, '');
for (const f of (await window.hub.fs.list('/tmp/hearth-editor-videos')).filter((x) => /frames_[ab]_30\.mp4$/.test(x.name))) await window.hub.fs.copy(f.path, `${VIDS}/${f.name}`);
activate('tool:ae'); await Review.ensureMounted();
H.config.settings = { ...H.config.settings, videoDirs: [VIDS] };
await Review.load(true); await until(() => Review.videos.length >= 2, 10000);
await Review.open(Review.videos.find((v) => /frames_a/.test(v.path)).path); await Review.waitReady(); await VideoCut.enter(); await wait(500);
const ae = H.surfaces.get('tool:ae').el;
ok(ae.querySelector('.vr-cut-title svg.hi-editor'), 'editor bar title carries the editor icon');
ok(!vis(ae.querySelector('.vr-cut-headrow > button[title^="Undo"]')), 'editor bar: ↶ behind Alt');
const cv = ae.querySelector('.vr-cut-cv'); const vr2 = cv.getBoundingClientRect();
let hitY = null;
for (let y = vr2.top + 10; y < vr2.bottom - 4 && hitY == null; y += 6) { try { if (VideoCut._test.hit({ clientX: vr2.left + 40, clientY: y })?.zone === 'clip') hitY = y; } catch { /* lane gap */ } }
if (ok(hitY != null, 'a clip on the track')) { await rclick(cv, vr2.left + 40, hitY); shape('editor clip'); }
await rclick(ae.querySelector('.vr-cut-headrow'), ae.querySelector('.vr-cut-sum').getBoundingClientRect().left + 5, ae.querySelector('.vr-cut-headrow').getBoundingClientRect().top + 8);
ok(rows().some((b) => /Auto-cut/.test(label(b))), 'right-click on the editor bar opens its ⋯ menu');
shape('editor bar (right-click)');
await wait(300);
// Video Review's own right-click menus end the same way
const vcard = ae.querySelector('.vr-card'); const vcr = vcard.getBoundingClientRect();
await rclick(vcard, vcr.left + 20, vcr.top + 10); shape('video review card');
// toasts clear the editor bar while editing
ok(document.documentElement.classList.contains('p8-editing'), 'editing: toasts lifted above the editor bar');
// the program monitor never shows over another tool
activate('tool:three'); await wait(2500);
ok(![...ae.querySelectorAll('.vr-p.on, .vr-pcomp.on')].some(vis), 'editor monitor hidden while the Lab is on screen');
// the Lab ⋯ ends with Customise this… too
const L = H.surfaces.get('tool:three').el;
[...L.querySelectorAll('[data-feature="Lab more"]')].find(vis)?.click(); await wait(300);
const labItems = [...document.querySelectorAll('.lab-pop .menu-item, .mb-menu .menu-item')].filter(vis).map((x) => x.textContent.trim());
out.menus['lab ⋯'] = labItems.join(' | ').slice(0, 200);
ok(/^Customise this…/.test(labItems.at(-1) || ''), 'Lab ⋯ ends with Customise this…');
document.querySelectorAll('.mb-menu.lab-pop').forEach((m) => m.remove()); hideMenu();

// ---------- keys, the sheet, commands ----------
const areas = [...Keys.groups(true).keys()];
for (const a of ['Board', 'Editor', 'Capture']) ok(areas.includes(a), `keys sheet has ${a}`);
out.keyCounts = Object.fromEntries(['Board', 'Editor', 'Capture'].map((a) => [a, (Keys.groups(true).get(a) || []).length]));
ok(out.keyCounts.Capture > 40, 'capture keys reach the sheet');
ok(Keys.all().filter((k) => ['Board', 'Editor', 'Capture'].includes(k.area) && k.run).length >= 10, 'the new keys-sheet lines run when clicked');
activate('tool:board'); await wait(300);
KeysUI.open(); await wait(400);
ok(document.querySelector('.keys-sheet .ks-group > h4')?.textContent.startsWith('Board'), 'on the board, the sheet starts with Board');
ok(document.querySelectorAll('.keys-sheet .ks-group > h4[data-p8]').length >= 10, 'area headings carry icons');
await smoke({ shot: '/tmp/polish8-keys.png' });
KeysUI.close(); await wait(200);
ok(Commands.get('tidy'), '/tidy exists');
ok(!Commands.duplicates().length, 'no duplicate commands');
let said = ''; await Commands.tryRun('/tidy drawer', H.claudeAgent().id, null, { say: (t) => { said += t; }, note: (t) => { said += t; } });
out.tidy = said.slice(0, 200);
return JSON.stringify(out, null, 1);
