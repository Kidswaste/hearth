// Inspo drop (round 65, inspodrop65): drag a picture / clip from the board drawer into a chat and the chat gets the
// REAL media. A throwaway board with a picture, two clips, a "remote" picture (served by smoke's local http server),
// a note; each tile is dragged into the chat box by synthetic drag events:
//   picture → one image attachment (a copy in Hearth's attachments) with its thumbnail; the fake Claude is told to
//   open it (attachinfo), the fake Codex gets it as -i;
//   clip → its key frames as pictures + one short "video, N s" line naming the file; one video chip with the frames
//   strip in the chat box (× removes them all); the same without ffmpeg (the window's <video> + canvas);
//   remote picture → fetched once (a second drop reuses the copy);
//   several tiles, the whole board (the drawer's top strip), 12 pictures (10 + a note), a plain drop = the qualities text,
//   right-click › Send the actual picture / Only one part (vibe text).
// (round 67, moodqualities67) a plain drop now attaches the QUALITIES: the real media is Shift+drop (what `drop` does
// here by default), the tile's Picture button or right-click › Send the actual picture.
//   sh dev/board-fixtures.sh && node dev/smoke.js --fake-engines --serve-dir /tmp/hearth-board-fixtures --check-timeout 400000 --script dev/checks/inspodrop65.js --shot /tmp/inspodrop65.png
const FIX = window.BOARD_FIXTURES || '/tmp/hearth-board-fixtures';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const fail = []; const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const out = {};
const info = (m) => { const x = /attach<<<(.*)>>>/.exec(m?.text || ''); return x ? JSON.parse(x[1]) : null; };
const menuRows = () => [...document.querySelectorAll('#menu button')];
const closeMenu = () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.hideMenu?.(); };
try {
  if (typeof Board === 'undefined') await Lazy.load('board');
  ok(typeof BoardDrop !== 'undefined' && typeof BoardDropCore !== 'undefined', 'the board group has BoardDrop');
  const C = H.claudeAgent();
  activate(C.id);
  await until(() => Native.hasView(C.id));
  Native.newChat?.(C.id);
  const v = Native.view(C.id);
  const attDir = await window.hub.attachmentsDir();
  const reply = async (agentId, text) => { await Native.send(agentId, text); await wait(150); await until(() => !Native.isBusy(H.activeChat[agentId]), 60000); await wait(250); return Native.current(agentId).messages.at(-1); };

  // ---------- the board ----------
  await Board.ready();
  const b = await Board.create('Inspo drop check', { quiet: true });
  await Board.open(b.id);
  const added = await Board.addFiles([`${FIX}/golden-hour.jpg`, `${FIX}/cuts.mp4`, `${FIX}/calm.mp4`]);
  Board.addNote?.('slow push-ins, tungsten light');
  const remoteUrl = `${window.SMOKE_SERVE}/neon%20big.png`;
  ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(window.SMOKE_SERVE || ''), `smoke serves the fixtures (${window.SMOKE_SERVE})`);
  // a reference that lives on the web (never downloaded by the board): its src is the address, a small data picture shows it
  const c = document.createElement('canvas'); c.width = 48; c.height = 32; const g = c.getContext('2d'); g.fillStyle = '#ff2e88'; g.fillRect(0, 0, 48, 32);
  const remote = { id: `r${Date.now().toString(36)}`, type: 'image', src: remoteUrl, tiny: c.toDataURL('image/png'), title: 'remote neon', x: 900, y: 0, w: 360, h: 240, rot: 0, added: Date.now(), vibe: { palette: [{ hex: '#ff2e88', share: 1 }], moods: [] } };
  Board.edit('add remote', (bb) => bb.items.push(remote));
  await until(() => Board.current().items.filter((i) => i.type === 'video').every((i) => i.poster) && Board.current().items.find((i) => i.type === 'image' && i.vibe), 40000);
  const items = Board.current().items;
  const img = items.find((i) => /golden/i.test(i.title || i.file || ''));
  const cuts = items.find((i) => i.type === 'video' && /cuts/i.test(i.title || i.file || ''));
  const calm = items.find((i) => i.type === 'video' && /calm/i.test(i.title || i.file || ''));
  const note = items.find((i) => i.type === 'note');
  out.board = items.map((i) => `${i.type}:${i.title}`);
  ok(img && cuts && calm && note && added.length === 3, `fixture board (${out.board})`);
  activate(C.id); await wait(200);

  // ---------- the drawer ----------
  BoardDrawer.toggle(true);
  await until(() => document.querySelectorAll('.bdd-tile').length >= 5, 8000);
  const tileOf = (it) => [...document.querySelectorAll('.bdd-tile')].find((t) => t.title.split('\n')[0] === (it.title || it.type));
  const drop = async (src, { shiftKey = true, payload = null } = {}) => {
    const dt = new DataTransfer();
    if (payload) dt.setData(BoardDrawer.REF_TYPE, JSON.stringify(payload));
    else src.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const q = v.input.getBoundingClientRect();
    v.input.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: q.left + 10, clientY: q.top + 10, shiftKey }));
    v.input.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: q.left + 10, clientY: q.top + 10, shiftKey }));
    src?.dispatchEvent?.(new DragEvent('dragend', { dataTransfer: dt, bubbles: true }));
  };
  const settle = async (n, ms = 30000) => { await until(() => v.attachments.length >= n, ms); await wait(400); };
  const chips = () => [...v.chips.querySelectorAll(':scope > .attach-chip')];
  const inAttach = (p) => String(p || '').startsWith(attDir);
  ok(/the picture itself/.test(tileOf(img)?.title || ''), `a picture tile says what a drag does (${tileOf(img)?.title})`);

  // 1. a picture
  v.attachments.length = 0; Native.renderChips(C.id);
  await drop(tileOf(img));
  await settle(1);
  const a1 = v.attachments[0];
  out.picture = a1 && { kind: a1.kind, name: a1.name, path: a1.path };
  ok(v.attachments.length === 1 && a1.kind === 'image' && inAttach(a1.path) && a1.preview, `a picture tile → one picture in Hearth's attachments (${JSON.stringify(out.picture)})`);
  ok(chips()[0]?.querySelector('img') && !/vibe/.test(a1.name), 'its chip shows the thumbnail');
  const st1 = await window.hub.fs.stat(a1.path);
  const st0 = await window.hub.fs.stat(img.src);
  ok(st1 && st0 && st1.size === st0.size, `the real file (${st1?.size} = ${st0?.size} bytes)`);
  const r1 = await reply(C.id, 'what is the light like here? attachinfo');
  const i1 = info(r1);
  out.claudePicture = i1;
  ok(i1?.images?.length === 1 && inAttach(i1.images[0]), `the fake Claude is told to open the picture (${JSON.stringify(i1?.images)})`);

  // 2. a clip (ffmpeg): its key frames + one line + the video chip
  await drop(tileOf(cuts));
  await settle(2, 60000);
  const line = v.attachments.find((a) => a.vgroup);
  const frames = v.attachments.filter((a) => a.vframe);
  out.clip = { line: line?.content, frames: frames.map((f) => f.name) };
  ok(line && line.kind === 'text' && /^cuts\.mp4: video, 6 s/.test(line.content) && line.content.includes(cuts.src) && /frames attached as pictures, at 0:00\.0/.test(line.content), `the clip's line (${line?.content})`);
  ok(frames.length === 6 && frames.every((f) => f.kind === 'image' && inAttach(f.path) && f.vframe === line?.vgroup), `6 key frames as pictures (${frames.length})`);
  ok(line?.content.length < 260, 'the line is short');
  const vchip = v.chips.querySelector('.idrop-vchip');
  ok(vchip && vchip.querySelectorAll('.idrop-strip img').length === 6 && chips().filter((x) => x.hidden).length === 6, 'one video chip with the frames strip; the frame chips folded into it');
  // frames really are the clip's moments: the first is red, the middle one (3 s) blue
  const px = async (p) => { const im = new Image(); im.src = WinMac.fileUrl(p); await im.decode(); const k = document.createElement('canvas'); k.width = im.naturalWidth; k.height = im.naturalHeight; const x = k.getContext('2d'); x.drawImage(im, 0, 0); return { w: k.width, h: k.height, rgb: [...x.getImageData(k.width >> 1, k.height >> 1, 1, 1).data.slice(0, 3)] }; };
  const f0 = await px(frames[0].path); const f3 = await px(frames[3].path);
  out.framePixels = { f0, f3 };
  ok(f0.rgb[0] > 150 && f0.rgb[2] < 120 && f3.rgb[2] > 120 && f3.rgb[0] < 80, `frame 0 is the red shot, the middle frame the blue one (${JSON.stringify(out.framePixels)})`);
  ok(f0.w <= 768 && f0.h <= 768, `frames ≤ 768 px (${f0.w}×${f0.h})`);
  const r2 = await reply(C.id, 'what happens in this clip? attachinfo');
  const i2 = info(r2);
  out.claudeClip = i2;
  ok(i2?.images?.length === 6 && i2.images.every(inAttach), `the fake Claude gets the 6 frames (${i2?.images?.length})`);
  const u2 = Native.current(C.id).messages.at(-2);
  ok(/video, 6 s/.test(u2.sent || ''), 'the message carries the clip line');

  // × on the video chip removes the clip and its frames
  await drop(tileOf(cuts)); await settle(7, 60000);
  v.chips.querySelector('.idrop-vchip button:last-of-type')?.click();
  await wait(150);
  ok(v.attachments.length === 0, `× removes the clip and its frames (${v.attachments.length} left)`);

  // 3. a clip without ffmpeg: the window's <video> + canvas
  FrameRead._setFfmpeg(false);
  try {
    await drop(tileOf(calm)); await settle(2, 60000);
    const l3 = v.attachments.find((a) => a.vgroup); const f3s = v.attachments.filter((a) => a.vframe);
    out.noFfmpeg = { line: l3?.content, frames: f3s.length };
    ok(l3 && /video, 4 s/.test(l3.content) && f3s.length >= 4 && f3s.length <= 6 && f3s.every((f) => inAttach(f.path)), `without ffmpeg: the 4 s clip's frames (${JSON.stringify(out.noFfmpeg)})`);
  } finally { FrameRead._setFfmpeg(true); }
  v.attachments.length = 0; Native.renderChips(C.id);

  // 4. a remote picture: fetched once into the attachments
  await drop(tileOf(remote)); await settle(1);
  const ra = v.attachments[0];
  ok(ra?.kind === 'image' && inAttach(ra.path) && /\.png$/.test(ra.path), `a web picture → downloaded into the attachments (${ra?.path})`);
  v.attachments.length = 0;
  await drop(tileOf(remote)); await settle(1);
  ok(v.attachments[0]?.path === ra?.path, 'a second drop reuses the copy (fetched once)');
  v.attachments.length = 0; Native.renderChips(C.id);

  // 5. several tiles (a chat card / a selection): each picture on its own, a note as its vibe text
  await drop(null, { payload: { boardId: b.id, itemIds: [img.id, remote.id, note.id], picture: true } }); await settle(3);
  out.several = v.attachments.map((a) => `${a.kind}:${a.name}`);
  ok(v.attachments.filter((a) => a.kind === 'image').length === 2 && v.attachments.some((a) => a.kind === 'text' && /^(vibe|qualities) · /.test(a.name) && /tungsten/.test(a.content)), `several: 2 pictures + the note's vibe (${out.several})`);
  v.attachments.length = 0; Native.renderChips(C.id);

  // 6. the whole board (the drawer's top strip): its media, clips share the picture budget
  const calmN = BoardDropCore.frameTimes((await FrameRead.info(calm.src)).duration, { max: 8 }).length;
  await drop(document.querySelector('.bdd-vibe')); await settle(4, 90000);
  await until(() => v.attachments.filter((a) => a.vgroup).length === 2 && v.attachments.length >= 2 + 2 + 6 + calmN, 60000); await wait(300);
  out.whole = { pictures: v.attachments.filter((a) => a.kind === 'image' && !a.vframe).length, clips: v.attachments.filter((a) => a.vgroup).length, frames: v.attachments.filter((a) => a.vframe).length };
  ok(out.whole.pictures === 2 && out.whole.clips === 2 && out.whole.frames === 6 + calmN && !v.attachments.some((a) => /^vibe · /.test(a.name)), `whole board: 2 pictures + 2 clips (6 + ${calmN} frames), no vibe text (${JSON.stringify(out.whole)})`);
  v.attachments.length = 0; Native.renderChips(C.id);

  // 7. a plain drop (round 67): the qualities text, not the picture
  await drop(tileOf(img), { shiftKey: false }); await settle(1);
  ok(v.attachments.length === 1 && v.attachments[0].kind === 'text' && /^qualities · /.test(v.attachments[0].name), `plain drop: the qualities text (${v.attachments[0]?.name})`);
  v.attachments.length = 0; Native.renderChips(C.id);

  // 8. right-click a tile: Send the actual picture / Only one part (vibe text)
  const t8 = tileOf(img); const tr = t8.getBoundingClientRect();
  t8.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: tr.left + 5, clientY: tr.top + 5 }));
  await wait(200);
  out.tileMenu = menuRows().map((x) => x.textContent.trim());
  ok(out.tileMenu.some((x) => /^Send the actual picture/.test(x)) && out.tileMenu.some((x) => /Only one part \(vibe text\)/.test(x)) && out.tileMenu.some((x) => /Show it to a chat/.test(x)), `tile menu (${out.tileMenu.slice(0, 5)})`);
  menuRows().find((x) => /^Send the actual picture/.test(x.textContent.trim()))?.click();
  await settle(1);
  ok(v.attachments.length === 1 && v.attachments[0].kind === 'image', 'right-click › Send the actual picture → the picture');
  v.attachments.length = 0; Native.renderChips(C.id);
  t8.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: tr.left + 5, clientY: tr.top + 5 }));
  await wait(200);
  menuRows().find((x) => /Only one part \(vibe text\)/.test(x.textContent))?.click();
  await wait(300);
  const sub = menuRows().map((x) => x.textContent.trim());
  menuRows().find((x) => /→/.test(x.textContent) && !/back/.test(x.textContent))?.click();
  await settle(1);
  ok(v.attachments.length === 1 && /^vibe · /.test(v.attachments[0]?.name || ''), `right-click › Only one part (vibe text) › … → the vibe (${sub.slice(0, 3)})`);
  closeMenu();
  v.attachments.length = 0; Native.renderChips(C.id);

  // 9. more than 10: the first 10 and a plain note
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `m${i}x${Date.now().toString(36)}`, type: 'image', src: img.src, title: `copy ${i + 1}`, x: i * 40, y: 900, w: 200, h: 200, rot: 0, added: Date.now(), vibe: img.vibe }));
  const big = await Board.create('Inspo drop many', { quiet: true, open: false });
  const bb = await Board.load(big.id); bb.items.push(...many); await Board.save(bb, { now: true });
  const r9 = await BoardDrop.attach(C.id, { boardId: big.id });
  out.cap = { ...r9, attachments: v.attachments.length, toast: [...document.querySelectorAll('#toasts > *')].map((x) => x.textContent).find((x) => /left out/.test(x)) };
  ok(r9?.pictures === 10 && r9.over === 2 && v.attachments.length === 10, `12 pictures → 10 attached, 2 left out (${JSON.stringify(out.cap)})`);
  ok(/2 more left out/.test(out.cap.toast || ''), 'a plain note says how many were left out');
  ok(new Set(v.attachments.map((a) => a.path)).size === 1, 'the same file is copied once (cache)');
  v.attachments.length = 0; Native.renderChips(C.id);

  // 10. Astra (Codex): the picture and the clip's frames go as -i
  const A = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
  if (ok(A, 'an Astra agent')) {
    activate(A.id); await until(() => Native.hasView(A.id));
    Native.newChat?.(A.id);
    const va = Native.view(A.id);
    await BoardDrop.attach(A.id, { boardId: b.id, itemIds: [img.id, cuts.id] });
    await until(() => va.attachments.length >= 8, 60000);
    const ra2 = await reply(A.id, 'look at these attachinfo');
    const ia = info(ra2);
    out.codex = ia;
    ok(ia?.images?.length === 7 && ia.images.every(inAttach), `the fake Codex gets 1 picture + 6 frames as -i (${ia?.images?.length})`);
  }
  // the final screenshot: the Claude chat box with a picture and a clip's chip (frames strip)
  activate(C.id); await wait(200);
  v.attachments.length = 0; Native.renderChips(C.id);
  await BoardDrop.attach(C.id, { boardId: b.id, itemIds: [img.id, cuts.id] });
  BoardDrawer.toggle(false);
  await wait(400);
} catch (err) { fail.push(`threw: ${err.stack || err.message}`); }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
