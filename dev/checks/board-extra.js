// Mood board, second layer: shapes / arrows / stickers, hide, info, swap, notes ⇄ text, move to another board, brief
// (read by chats first), lock, presentation order + auto-advance, Tab / random, folder + board-file import, a
// screenshot of Hearth, tags from the vibe, #hex search, website snapshot sizes, clip → stills per shot + contact
// sheet, the board to the Three Director, board diff / stats.
//   sh dev/board-fixtures.sh && node dev/smoke.js --script dev/checks/board-extra.js
const FIX = window.BOARD_FIXTURES || '/tmp/hearth-board-fixtures';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return cond; };
const X = Board._;
activate('tool:board');
await until(() => Board.isMounted() && Board.current());
const said = []; const run = async (line) => { said.length = 0; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => said.push(String(t)) }); return said.join('\n'); };

// drawn items
const sh = Board.addShape('star', null, { color: '#ff2e88' });
const ar = Board.addArrow('curved');
const st = Board.addSticker('🔥');
await wait(100);
ok(getComputedStyle(X.S.nodes.get(sh.id).querySelector('.bd-shape')).clipPath.includes('polygon'), 'star shape clip');
ok(X.S.nodes.get(ar.id).querySelector('svg path')?.getAttribute('d').includes('Q'), 'curved arrow path');
ok(X.S.nodes.get(st.id).querySelector('.bd-sticker').textContent === '🔥', 'sticker');
for (const [id] of BoardData.SHAPES) Board.addShape(id);
for (const [id] of BoardData.ARROWS) Board.addArrow(id);
out.drawn = Board.items().length;
ok(out.drawn === 3 + BoardData.SHAPES.length + BoardData.ARROWS.length, `all shapes and arrows (${out.drawn})`);
await run('/board-shape hexagon #36d6e7'); await run('/board-arrow double'); await run('/board-sticker ✨');
ok(Board.items().some((i) => i.shape === 'hexagon' && i.color === '#36d6e7') && Board.items().some((i) => i.glyph === '✨'), 'shape / arrow / sticker commands');

// media + vibe
const [img, gold, clip] = await Board.addFiles([`${FIX}/neon big.png`, `${FIX}/golden-hour.jpg`, `${FIX}/cuts.mp4`]);
await until(() => [img, gold, clip].every((i) => Board.item(i.id).vibe), 40000);

// hide / show, info, swap, convert
Board.select(st.id); X.hide(); await wait(50);
ok(X.S.nodes.get(st.id).classList.contains('bd-hidden') && !BoardDrawer.vibeText().includes('Sticker'), 'hide');
ok(X.showHidden() === 1, 'show hidden');
Board.select(img.id); const info = X.info(); document.querySelector('dialog.ui-modal')?.close();
ok(info.some((l) => /2400 × 1600/.test(l)), 'info shows the picture size');
const pa = { ...Board.item(img.id) }; const pb = { ...Board.item(gold.id) };
Board.select([img.id, gold.id]); X.swap();
ok(Math.abs(Board.item(img.id).x + Board.item(img.id).w / 2 - (pb.x + pb.w / 2)) < 1, 'swap');
const note = Board.addNote('Turn me into a title');
Board.select(note.id); X.convertText([Board.item(note.id)]);
ok(Board.item(note.id).type === 'text' && X.S.nodes.get(note.id).querySelector('.bd-txt'), 'note → text');
Board.select(img.id); X.actualSize(); ok(Board.item(img.id).w === 2400, 'actual size'); X.resetSize(); ok(Board.item(img.id).w <= 420, 'reset size');

// brief, lock, star, stats, diff
await run('/board-brief Neon at night, slow and warm');
ok(BoardDrawer.vibeText().includes('Brief: Neon at night'), 'brief goes first in the vibe');
X.lock(true);
const before = Board.items().length; Board.addNote('x');
ok(Board.items().length === before, 'locked board refuses edits');
X.lock(false);
out.stats = await run('/board-stats');
ok(/items/.test(out.stats), 'stats');
const other = await Board.create('Day refs', { quiet: true, open: false });
Board.select([gold.id]); const moved = await X.toBoard(other.id, { move: false });
ok(moved === 1 && (await Board.load(other.id)).items.length === 1, 'copy to another board');
out.diff = X.diff(Board.current(), await Board.load(other.id));
ok(/vs/.test(out.diff) && /palette/.test(out.diff), 'board diff');
X.star(); ok(Board.boards()[0].star, 'star');

// tags from the vibe, #hex search
Board.select([img.id]); X.tagByVibe();
out.autotags = Board.item(img.id).tags;
ok(out.autotags?.length >= 2, `tags from vibe (${out.autotags})`);
out.hexMatch = X.matches('#ff2e88').map((i) => i.title || i.type);
ok(out.hexMatch.length >= 1, 'search by a #hex color');

// presentation order + start from a frame + auto-advance
Board.select([]); const f1 = Board.addFrame({ title: 'One', x: 0, y: 3000, w: 400, h: 300 }); const f2 = Board.addFrame({ title: 'Two', x: 600, y: 3000, w: 400, h: 300 });
Board.select(f2.id); X.presentOrder(-1, Board.item(f2.id));
ok(X.framesInOrder()[0].id === f2.id, 'frame earlier in the presentation');
Board.setPref('presentAuto', 1);
ok(X.presentFrom(Board.item(f1.id)), 'present from a frame');
await wait(2600);
const stillPresenting = X.S.presenting;
X.stopPresent(); Board.setPref('presentAuto', undefined);
out.autoAdvanceEnded = !stillPresenting;

// Tab and random
Board.select([]); const t1 = X.cycle(1); const t2 = X.cycle(1);
ok(t1 && t2 && t1 !== t2, 'Tab cycles');
ok(X.random(), 'random reference');

// clips: one still per shot, contact sheet
const stills = await X.shotsToStills(Board.item(clip.id));
ok(stills?.length === 3, `one still per shot (${stills?.length})`);
const sheet = await X.clipSheet(Board.item(clip.id));
ok(sheet?.type === 'image' && sheet.from === clip.id, 'clip contact sheet');

// import a folder and a board file, a screenshot of Hearth
const folderItems = await X.importFolder(FIX);
ok(folderItems.length === 5, `folder import (${folderItems.length})`);
const exp = await X.exportAs('vibe-json');
const boardJson = await window.hub.board.save('roundtrip.json', btoa(unescape(encodeURIComponent(JSON.stringify(Board.current())))), { exportDir: true });
const imported = await X.importBoardFile(boardJson);
ok(imported && imported.items.length === (await Board.load(imported.id)).items.length && imported.items.length > 10, 'board file import');
const shot = await X.screenshotHearth();
ok(shot?.type === 'image', 'screenshot of Hearth');

// website snapshot at phone size (a local page)
const web = await Board.addUrl(`file://${FIX}/page.html`);
await until(() => Board.item(web.id).snapped, 20000);
Board.select(web.id); X.snapAs('mobile', [Board.item(web.id)]);
await until(() => Board.item(web.id).snapped, 20000);
const im = await BoardVibe.loadImage(Board.fileUrl(Board.item(web.id).src));
out.mobileShot = [im.naturalWidth, im.naturalHeight];
ok(im.naturalWidth === 390 && im.naturalHeight === 844, `phone-sized snapshot (${out.mobileShot})`);

// the board's vibe to the Three Director (attached to its message box)
const dir = H.agents().find((a) => a.dock === 'three');
if (dir) {
  const t = await X.toLab();
  await wait(300);
  const v = Native.view(dir.id);
  out.toLab = { attached: v?.attachments?.length, name: v?.attachments?.[0]?.name };
  ok(t && v?.attachments?.length === 1 && /Build the scene with this vibe/.test(v.attachments[0].content), 'board vibe → Three Director');
  v.attachments.length = 0;
}
activate('tool:board'); await wait(300);
Board.zoomFit(false); await wait(500);
await smoke({ shot: '/tmp/board-shots/9-extra.png' });
out.fail = fail;
return JSON.stringify(out, null, 1);
