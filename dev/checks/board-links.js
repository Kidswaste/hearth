// Mood board, fourth layer: connectors that follow items (also while dragging), your own templates / palettes, a
// background picture, drawer capture (drop a file on the drawer from a chat), a drawer tile dropped onto the board,
// Alt+wheel opacity, clips play / pause together, fit text, frame vibes through the board_ tools.
//   sh dev/board-fixtures.sh && node dev/smoke.js --script dev/checks/board-links.js
const FIX = window.BOARD_FIXTURES || '/tmp/hearth-board-fixtures';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return cond; };
const X = Board._; const mouse = (type, x, y, extra = {}) => smoke({ cdp: 'Input.dispatchMouseEvent', params: { type, x, y, button: 'none', ...extra } });
activate('tool:board');
await until(() => Board.isMounted() && Board.current());
const [a, b, clip] = await Board.addFiles([`${FIX}/golden-hour.jpg`, `${FIX}/neon big.png`, `${FIX}/cuts.mp4`]);
await until(() => [a, b, clip].every((i) => Board.item(i.id).vibe), 40000);
Board.patch([b.id], { x: Board.item(a.id).x + 900, y: Board.item(a.id).y + 300 }, 'place');
Board.select([a.id, b.id]);
const [l] = X.connect();
await wait(50);
const before = { ...Board.item(l.id) };
ok(l && X.S.nodes.get(l.id).querySelector('svg path'), 'connector drawn');
// drag b with the mouse: the link follows during the drag
Board.zoomFit(false); await wait(300);
const nb = X.S.nodes.get(b.id).getBoundingClientRect();
Board.select([]);
await mouse('mousePressed', nb.left + 20, nb.top + 20, { button: 'left', buttons: 1, clickCount: 1 });
await mouse('mouseMoved', nb.left + 60, nb.top + 120, { button: 'left', buttons: 1 });
const mid = { ...Board.item(l.id) };
await mouse('mouseMoved', nb.left + 100, nb.top + 220, { button: 'left', buttons: 1 });
await mouse('mouseReleased', nb.left + 100, nb.top + 220, { button: 'left', buttons: 0, clickCount: 1 });
await wait(100);
ok(mid.h !== before.h && Board.item(l.id).h !== before.h, 'the link follows while dragging');
Board.removeItems([a.id]);
ok(!Board.item(l.id), 'a link goes with its item');
Board.undo(); await wait(50);
ok(Board.item(l.id) && Board.item(a.id), 'undo brings both back');
const png = await X.exportAs('png'); ok((await window.hub.fs.stat(png))?.size > 1000, 'export with a link');

// your own template and palette
Board.applyTemplate('a-b'); await wait(100);
const t = await X.saveTemplate('My AB'); await wait(100);
ok(t && BoardData.TEMPLATES.some((x) => x.name === 'My AB' && x.cat === 'Yours'), 'template saved under Yours');
const made = Board.applyTemplate(t.id);
ok(made.filter((m) => m.type === 'frame').length === 2, 'own template applies');
await X.savePalette(['#112233', '#445566'], 'Night pair');
ok(BoardData.PALETTES.some((p) => p.name === 'Night pair'), 'palette saved to the library');

// background picture
Board.select(a.id); X.setBackdrop();
ok(X.S.ui.vp.style.backgroundImage.includes('url('), 'background picture');
X.setBackdrop(null);

// clips together, fit text, Alt+wheel opacity
Board.zoomFit(false); await wait(400);
out.dbg = { moving: X.S.moving, clipOff: X.lastOff.get(clip.id), clip: Board.item(clip.id)?.type, playing: X.playing.size, sel: [...X.S.sel] };
ok(X.playAll() >= 1 && X.playing.size >= 1, 'play clips in view');
ok(X.pauseAll() >= 1 && X.playing.size === 0, 'pause them');
const tx = Board.addText('FIT ME', null, { w: 600, h: 200 }); Board.select(tx.id); X.fitText([Board.item(tx.id)]);
ok(Board.item(tx.id).fs > 64, `fit text (${Board.item(tx.id).fs}px)`);
Board.select(a.id); await wait(50);
const na = X.S.nodes.get(a.id).getBoundingClientRect();
await mouse('mouseWheel', na.left + na.width / 2, na.top + na.height / 2, { deltaX: 0, deltaY: 100, modifiers: 1 });
await mouse('mouseWheel', na.left + na.width / 2, na.top + na.height / 2, { deltaX: 0, deltaY: 100, modifiers: 1 });
await wait(100);
out.dbg2 = { under: document.elementFromPoint(na.left + na.width / 2, na.top + na.height / 2)?.closest?.('.bd-item')?.dataset.id, a: a.id, sel: [...X.S.sel] };
ok(Board.item(a.id).opacity === 0.9, `Alt+wheel opacity (${Board.item(a.id).opacity})`);

// the drawer: drop a file on it from a chat, drop a tile onto the board
const other = await Board.create('Inbox', { quiet: true, open: false });
activate(H.claudeAgent().id); await wait(200);
BoardDrawer.toggle(true); await wait(400);
const selEl = document.querySelector('.bdd-head select'); selEl.value = other.id; selEl.dispatchEvent(new Event('change')); await wait(300);
const dt = new DataTransfer(); dt.setData('text/plain', 'captured from a chat: grain + tungsten light');
document.querySelector('.bdd-grid').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
await until(async () => (await Board.load(other.id)).items.length === 1, 4000);
ok((await Board.load(other.id)).items[0]?.type === 'note', 'drop on the drawer adds to its board');
await wait(300);
const tile = document.querySelector('.bdd-tile'); const dt2 = new DataTransfer();
tile.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt2, bubbles: true }));
BoardDrawer.toggle(false);
activate('tool:board'); await wait(300);
await Board.open(Board.boards().find((x) => x.name === 'My board').id); await wait(200);
const n0 = Board.items().length;
X.S.ui.root.dispatchEvent(new DragEvent('drop', { dataTransfer: dt2, bubbles: true, cancelable: true, clientX: 700, clientY: 500 }));
await wait(200);
ok(Board.items().length === n0 + 1 && Board.items().at(-1).type === 'note', 'drawer tile dropped on the board is copied here');

// frame vibe through the board tools
Board.addFrame({ title: 'Warm', x: Board.item(a.id).x - 20, y: Board.item(a.id).y - 40, w: Board.item(a.id).w + 40, h: Board.item(a.id).h + 80 });
const fv = await HubBridge.call('board_vibe', { frame: 'Warm' });
ok(fv.ok && /hour/.test(fv.value.vibe) && fv.value.frame === 'Warm', 'board_vibe for a frame');
const fa = await HubBridge.call('board_add', { kind: 'note', text: 'inside', frame: 'Warm' });
const inside = Board.items().find((i) => i.text === 'inside');
ok(fa.ok && Board.frameOf(inside)?.title === 'Warm', 'board_add into a frame');
// fifth layer: footage permission, views, loop a shot, cuts, untangle, gather
Board.select(clip.id); X.allowFootage([Board.item(clip.id)], true);
ok(BoardVibe.text(Board.item(clip.id)).includes('FOOTAGE ALLOWED') && !BoardVibe.text(Board.item(a.id)).includes('FOOTAGE'), 'footage only where allowed');
X.allowFootage([Board.item(clip.id)], false);
X.saveView('Here'); Board.setZoom(4, false); await wait(200); ok(X.goView('Here'), 'saved view'); await wait(700);
ok(Math.abs(X.S.view.z - Board.current().views.at(-1).view.z) < 1e-6, 'fly to a saved view');
X.startPreview(clip.id); const lv = X.liveVideo(clip.id); if (lv) { lv.currentTime = 2.5; await wait(200); }
const shot = X.loopShot(Board.item(clip.id));
ok(Array.isArray(shot) && shot[0] === 2 && shot[1] === 4, `loop this shot (${shot})`);
X.stopPreview(clip.id);
const n1 = Board.addNote('one', { x: 0, y: 9000 }); const n2 = Board.addNote('two', { x: 30, y: 9020 });
Board.select([n1.id, n2.id]); ok(X.untangle() > 0, 'untangle');
const A = Board.item(n1.id); const Bn = Board.item(n2.id);
ok(A.x + A.w <= Bn.x || Bn.x + Bn.w <= A.x || A.y + A.h <= Bn.y || Bn.y + Bn.h <= A.y, 'no overlap left');
ok(X.gather() === 2, 'gather');
Board.zoomFit(false); await wait(400);
await smoke({ shot: '/tmp/board-shots/10-links.png' });
out.fail = fail;
return JSON.stringify(out, null, 1);
