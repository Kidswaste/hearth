// Mood board, driven like a user: drop real files (CDP drag with files), a local web page and an offline link as
// website cards, wait for thumbnails / posters / vibes, zoom with the wheel and the pinch, pan with the middle button,
// marquee-select, drag an item, right-click menus and submenus, lenses, undo / redo, export, presentation.
//   sh dev/board-fixtures.sh && node dev/smoke.js --script dev/checks/board.js --shot /tmp/board.png
const FIX = window.BOARD_FIXTURES || '/tmp/hearth-board-fixtures';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return cond; };
const shot = (name) => smoke({ shot: `/tmp/board-shots/${name}.png` });
const cdp = (cdpName, params) => smoke({ cdp: cdpName, params });
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'none', ...extra });

activate('tool:board');
await until(() => Board.isMounted() && Board.current());
const vp = document.querySelector('.bd-vp');
const r = vp.getBoundingClientRect();
const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
out.empty = !document.querySelector('.bd-empty').hidden;

// 1) drop real files onto the board (Chrome's own drag and drop, with file paths)
const files = ['neon big.png', 'golden-hour.jpg', 'loop.gif', 'cuts.mp4', 'calm.mp4'].map((f) => `${FIX}/${f}`);
const data = { items: [], files, dragOperationsMask: 1 };
await cdp('Input.dispatchDragEvent', { type: 'dragEnter', x: cx, y: cy, data });
await cdp('Input.dispatchDragEvent', { type: 'dragOver', x: cx, y: cy, data });
await cdp('Input.dispatchDragEvent', { type: 'drop', x: cx, y: cy, data });
const dropped = await until(() => Board.items().length >= 5, 8000);
if (!dropped) await Board.addFiles(files); // the harness can't drop files: add them the way the file picker does
out.dropWorked = dropped;
ok(Board.items().length >= 5, 'files added');
out.copiedIntoData = Board.items().every((i) => i.src && !i.src.startsWith(FIX));
ok(out.copiedIntoData, 'files copied into data/board/media');
out.kinds = Board.items().map((i) => i.type);
ok(out.kinds.includes('video') && out.kinds.includes('gif') && out.kinds.includes('image'), 'kinds detected');

// 2) website cards: a local page (live snapshot) and an offline address (degrades to a letter card)
const page = await Board.addUrl(`file://${FIX}/page.html`);
const offline = await Board.addUrl('https://hearth-board-test.invalid/some/page');
await until(() => Board.items().every((i) => i.type !== 'web' || i.snapped), 30000);
const pg = Board.item(page.id); const off = Board.item(offline.id);
out.page = { title: pg.title, shot: Boolean(pg.src), theme: pg.themeColor, fonts: pg.fonts, vibe: Boolean(pg.vibe?.palette?.length) };
ok(pg.title === 'Neon Type Studio' && pg.src && pg.themeColor === '#ff2e88', 'local page snapshot + title + theme color');
out.offline = { error: off.snapError, src: off.src || null };
ok(off.snapError && !off.src, 'offline link degrades to a card without snapshot');

// 3) thumbnails, posters and vibes in the background
await until(() => Board.items().filter((i) => ['image', 'gif', 'video'].includes(i.type)).every((i) => i.vibe), 45000);
const big = Board.items().find((i) => i.title === 'neon big');
const vid = Board.items().find((i) => i.title === 'cuts');
const calm = Board.items().find((i) => i.title === 'calm');
const gif = Board.items().find((i) => i.type === 'gif');
out.big = { natural: big.natural, thumb: Boolean(big.thumb), tiny: Boolean(big.tiny), w: big.w, h: big.h, palette: big.vibe?.palette?.slice(0, 3), light: big.vibe?.light, moods: big.vibe?.moods };
ok(big.thumb && big.tiny && Math.max(big.w, big.h) <= 420, 'big picture downscaled (1024 + 256 copies) and sized');
out.cuts = { poster: Boolean(vid.poster), cutCount: vid.vibe?.cutCount, cuts: vid.vibe?.cuts, pace: vid.vibe?.pace, motion: vid.vibe?.motion, duration: vid.vibe?.duration };
ok(vid.poster && vid.vibe?.cutCount === 2, `clip cuts found (${vid.vibe?.cutCount})`);
out.calm = { motion: calm.vibe?.motion, cutCount: calm.vibe?.cutCount, moods: calm.vibe?.moods };
ok(calm.vibe?.cutCount === 0 && calm.vibe.motion < vid.vibe.motion + 0.5, 'calm clip has no cuts');
ok(gif.poster, 'gif has a still poster');
out.vibeLine = BoardVibe.text(vid);
await Board.arrange('grid');
Board.zoomFit(false);
await wait(700);
await shot('1-grid');

// 4) zoom with the mouse wheel / pinch (Ctrl+wheel), pan with the middle button and the trackpad
const z0 = Board._.S.view.z;
await mouse('mouseWheel', cx, cy, { deltaX: 0, deltaY: -240 });
await wait(400);
const z1 = Board._.S.view.z;
await mouse('mouseWheel', cx, cy, { deltaX: 0, deltaY: -30, modifiers: 2 }); // Ctrl = pinch
await wait(200);
const z2 = Board._.S.view.z;
ok(z1 > z0 && z2 > z1, `wheel / pinch zoom in (${z0.toFixed(2)} → ${z1.toFixed(2)} → ${z2.toFixed(2)})`);
const x0 = Board._.S.view.x;
await mouse('mousePressed', cx, cy, { button: 'middle', buttons: 4, clickCount: 1 });
await mouse('mouseMoved', cx + 120, cy + 40, { button: 'middle', buttons: 4 });
await mouse('mouseMoved', cx + 200, cy + 60, { button: 'middle', buttons: 4 });
await mouse('mouseReleased', cx + 200, cy + 60, { button: 'middle', buttons: 0, clickCount: 1 });
await wait(200);
ok(Math.abs(Board._.S.view.x - x0 - 200) < 2, `middle-drag pans (${Math.round(Board._.S.view.x - x0)} px)`);
const y0 = Board._.S.view.y;
await mouse('mouseWheel', cx, cy, { deltaX: 12, deltaY: 18.5 }); // two-finger trackpad scroll
await wait(200);
ok(Board._.S.view.y < y0, 'two-finger scroll pans');
// deep zoom limits
Board.setZoom(100, false); await wait(100); out.maxZoom = Board._.S.view.z;
Board.setZoom(0.0001, false); await wait(100); out.minZoom = Board._.S.view.z;
ok(out.maxZoom === 32 && out.minZoom === 0.02, 'zoom range 2 % … 3200 %');
Board.zoomFit(false); await wait(400);

// 5) marquee select (drag on empty space), then drag an item with the mouse
const before = Board._.S.sel.size;
Board.select([]);
const vb = vp.getBoundingClientRect();
await mouse('mousePressed', vb.left + 8, vb.top + 50, { button: 'left', buttons: 1, clickCount: 1 });
await mouse('mouseMoved', vb.left + vb.width * 0.6, vb.top + vb.height * 0.6, { button: 'left', buttons: 1 });
await mouse('mouseMoved', vb.right - 8, vb.bottom - 8, { button: 'left', buttons: 1 });
await mouse('mouseReleased', vb.right - 8, vb.bottom - 8, { button: 'left', buttons: 0, clickCount: 1 });
await wait(150);
out.marquee = Board._.S.sel.size;
ok(out.marquee >= 6, `marquee selects (${out.marquee}, before ${before})`);
Board.select([]);
const n = Board._.S.nodes.get(big.id).getBoundingClientRect();
const bx = big.x;
await mouse('mousePressed', n.left + 20, n.top + 20, { button: 'left', buttons: 1, clickCount: 1 });
await mouse('mouseMoved', n.left + 60, n.top + 30, { button: 'left', buttons: 1 });
await mouse('mouseMoved', n.left + 120, n.top + 40, { button: 'left', buttons: 1 });
await mouse('mouseReleased', n.left + 120, n.top + 40, { button: 'left', buttons: 0, clickCount: 1 });
await wait(150);
ok(Board.item(big.id).x > bx + 20, 'drag moves an item');
ok(Board._.S.sel.has(big.id) && !document.querySelector('.bd-selbox').hidden, 'the dragged item is selected with handles');
Board.undo(); await wait(100);
ok(Math.abs(Board.item(big.id).x - bx) < 0.5, 'undo puts it back');
Board.redo(); await wait(100);
ok(Board.item(big.id).x > bx + 20, 'redo');

// 6) right-click an item → submenus (Look › Filter › Black & white)
const nn = Board._.S.nodes.get(big.id).getBoundingClientRect();
await mouse('mousePressed', nn.left + 30, nn.top + 30, { button: 'right', buttons: 2, clickCount: 1 });
await mouse('mouseReleased', nn.left + 30, nn.top + 30, { button: 'right', buttons: 0, clickCount: 1 });
await wait(200);
const menuBtns = () => [...document.querySelectorAll('#menu button')].map((b) => b.textContent);
out.itemMenu = menuBtns();
ok(!document.getElementById('menu').hidden && out.itemMenu.some((t) => t.startsWith('Look')) && out.itemMenu.some((t) => t.startsWith('Send vibe')), 'item right-click menu');
await shot('2-item-menu');
const clickMenu = async (prefix) => { const b = [...document.querySelectorAll('#menu button')].find((x) => x.textContent.trim().startsWith(prefix)); if (!b) return false; const rr = b.getBoundingClientRect(); await mouse('mousePressed', rr.left + 10, rr.top + 5, { button: 'left', buttons: 1, clickCount: 1 }); await mouse('mouseReleased', rr.left + 10, rr.top + 5, { button: 'left', buttons: 0, clickCount: 1 }); await wait(120); return true; };
ok(await clickMenu('Look'), 'Look submenu');
ok(menuBtns()[0].includes('back'), 'submenu has a back row');
ok(await clickMenu('Filter'), 'Filter submenu');
ok(await clickMenu('Black & white'), 'pick a filter');
ok(Board.item(big.id).filter === 'bw', 'filter applied');
// right-click the empty board → Lens › Palette
await mouse('mousePressed', vb.left + 12, vb.bottom - 12, { button: 'right', buttons: 2, clickCount: 1 });
await mouse('mouseReleased', vb.left + 12, vb.bottom - 12, { button: 'right', buttons: 0, clickCount: 1 });
await wait(150);
out.canvasMenu = menuBtns();
ok(out.canvasMenu.some((t) => t.startsWith('Add')) && out.canvasMenu.some((t) => t.startsWith('Lens')), 'board right-click menu');
await clickMenu('Lens');
await clickMenu('Palette');
await wait(200);
out.lens = Board.current().lens; out.lensNodes = document.querySelectorAll('.bd-lens').length;
ok(out.lens === 'palette' && out.lensNodes >= 4, `palette lens (${out.lensNodes} overlays)`);
await shot('3-palette-lens');
Board._.setLens('motion', { quiet: true }); await wait(100); await shot('4-motion-lens');
Board._.setLens('light', { quiet: true }); await wait(100);
ok(getComputedStyle(Board._.S.nodes.get(vid.id).querySelector('.bd-clip')).filter.includes('grayscale'), 'light lens filters');
Board._.setLens(null, { quiet: true });

// 7) clips play only on hover
const vn = Board._.S.nodes.get(vid.id).getBoundingClientRect();
await mouse('mouseMoved', vn.left + vn.width / 2, vn.top + vn.height / 2);
await wait(600);
const live = Board._.liveVideo(vid.id);
ok(live && !live.paused, 'hovered clip plays');
await mouse('mouseMoved', vb.left + 5, vb.top + 60);
await wait(500);
ok(!Board._.liveVideo(vid.id), 'clip stops when the pointer leaves');
out.videosOnBoard = document.querySelectorAll('.bd-world video').length;
ok(out.videosOnBoard === 0, 'no video elements at rest (posters)');

// 8) frame grab, palette card, crop, notes, frames, templates, layouts
const grab = await Board._.frameGrab(vid, 3.0);
ok(grab?.type === 'image' && grab.from === vid.id, 'frame grab → still');
Board.select(big.id); const pc = Board._.paletteCard([Board.item(big.id)]);
ok(pc?.type === 'palette' && pc.colors.length >= 2, 'palette card from a picture');
Board.select(big.id); Board._.cropTo(1); await wait(50);
const bi = Board.item(big.id); ok(bi.crop && Math.abs(bi.w / bi.h - 1) < 0.01, 'crop 1:1');
Board._.cropTo(null); ok(!Board.item(big.id).crop, 'crop reset');
Board.applyTemplate('moodboard'); await wait(300);
ok(Board.items().filter((i) => i.type === 'frame').length >= 6, 'template frames');
for (const l of ['masonry', 'timeline', 'by-hue', 'cols-type', 'collage-tilt', 'circle']) { Board.select([]); const n2 = Board.arrange(l); ok(n2 > 0, `layout ${l}`); }
Board.arrange('grid');
await wait(200);

// 9) search / filter, stamps, tags
const m = Board._.search('cuts'); ok(m.length >= 1 && m.every((i) => /cuts/.test(i.title)), `search by name (${m.length})`);
const m2 = Board._.matches('pink'); out.pinkMatches = m2.map((i) => i.title);
document.querySelector('.bd-search button:last-child')?.click();
Board.select(vid.id); Board.patch(null, { stamp: '★' }, 'stamp'); Board._.addTag('night');
ok(Board.item(vid.id).stamp === '★' && Board.item(vid.id).tags.includes('night'), 'stamp + tag');
ok(Board._.matches('#night').length === 1, 'search by tag');

// 10) export a PNG and the vibe brief (saved into the test folder)
const png = await Board._.exportAs('png');
const st = png && await window.hub.fs.stat(png);
ok(st && st.size > 5000, `exported PNG (${st?.size} bytes)`);
const md = await Board._.exportAs('md'); ok(Boolean(md), 'vibe brief exported');
const zip = await Board._.exportAs('zip'); const zs = zip && await window.hub.fs.stat(zip);
ok(zs && zs.size > 1000, `zip export (${zs?.size} bytes)`);

// 11) presentation: fly between frames
Board.zoomFit(false); await wait(300);
ok(Board._.present(), 'present starts');
await wait(200);
await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
await wait(1100);
await shot('5-present');
const zP = Board._.S.view.z;
await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await wait(150);
ok(!Board._.S.presenting && zP > 0, 'present ends with Esc');

Board.zoomFit(false); await wait(500);
await shot('6-final');
out.items = Board.items().length;
out.fail = fail;
return JSON.stringify(out, null, 1);
