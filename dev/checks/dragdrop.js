// Files with Finder / Explorer (round 38, dragdrop): synthetic drops (DataTransfer files) on a chat and on the Lab
// preview, the overlay's words per spot (chat, Lab, a template's media slot), a pasted screenshot in the chat box and
// in the Lab, paths dropped the way Finder / Explorer hand them (spaces, accents, #, an iCloud placeholder, a folder that
// asks first, a big text file, a PDF, 25 files at once), a song / footage / video layer / picture layer in the Lab, the
// /drop command, and drags out (a code block's label, an attachment) reaching the native drag with the right file
// (the IPC stubbed: a real startDrag needs a held mouse button).
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/dragdrop.js --shot /tmp/dragdrop.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;
const DIR = '/tmp/hearth-dragdrop-check';
const SONG = '/tmp/hearth-test-song.wav';
const VID = '/tmp/hearth-capture-test/cfr25.mp4';
const PNG = (() => { const c = document.createElement('canvas'); c.width = 16; c.height = 16; const g = c.getContext('2d'); g.fillStyle = '#e6b450'; g.fillRect(0, 0, 16, 16); return c.toDataURL('image/png').split(',')[1]; })();
const pngFile = (name = 'Screenshot 2026-10-14 at 09.12.33.png') => new File([Uint8Array.from(atob(PNG), (ch) => ch.charCodeAt(0))], name, { type: 'image/png' });
const dtWith = (...files) => { const dt = new DataTransfer(); for (const f of files) dt.items.add(f); return dt; };
const fire = (node, type, dt) => { const r = node.getBoundingClientRect(); const ev = new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }); node.dispatchEvent(ev); return ev; };
const overText = () => (document.querySelector('.dd-over.on .dd-text')?.textContent || '');

try {
  if (typeof DragDrop === 'undefined') await Lazy.load('dragdrop');
  await until(() => typeof DragDrop !== 'undefined', 15000);
  step('the dragdrop group loads after the first screen', typeof DragDrop !== 'undefined' && typeof DragDropCore !== 'undefined');
  step('commands /drop and /paste-files', Boolean(Commands.get('drop') && Commands.get('paste-files')), Commands.duplicates?.().length);

  // ---------- files the way Finder / Explorer hand them ----------
  const PIC = `${DIR}/pic #1 été.png`;
  await window.hub.fs.write(PIC, PNG, { base64: true });
  await window.hub.fs.write(`${DIR}/notes.md`, '# Notes\nthe intro needs more punch\n');
  await window.hub.fs.write(`${DIR}/big.log`, 'x'.repeat(300 * 1024));
  await window.hub.fs.write(`${DIR}/brief.pdf`, '%PDF-1.4 not really');
  await window.hub.fs.write(`${DIR}/Project Folder/readme.txt`, 'hello');
  await window.hub.fs.write(`${DIR}/.Cloud song.mp3.icloud`, '');
  for (let i = 0; i < 25; i += 1) await window.hub.fs.write(`${DIR}/many/n${i}.txt`, `note ${i}`);

  // ---------- a chat ----------
  const C = H.claudeAgent();
  activate(C.id);
  await until(() => Native.hasView(C.id));
  Native.newChat(C.id);
  await wait(300);
  const v = () => Native.view(C.id);
  const ta = v().form.querySelector('textarea');
  const n0 = v().attachments.length;
  let ev = fire(ta, 'dragover', dtWith(pngFile()));
  step('chat: dragover a picture → the overlay says what happens', overText() === 'Drop to attach this picture' && ev.defaultPrevented, overText());
  step('chat: the overlay covers the chat', document.querySelector('.dd-over.on')?.dataset.zone === 'chat');
  fire(ta, 'dragover', dtWith(pngFile('a.png'), new File(['x'], 'b.md', { type: 'text/markdown' }), pngFile('c.png')));
  step('chat: three mixed files', overText() === 'Drop to attach 3 files', overText());
  ev = fire(ta, 'drop', dtWith(pngFile()));
  await until(() => v().attachments.length > n0, 5000);
  const a1 = v().attachments.at(-1);
  step('chat: a dropped picture is attached and previewed', a1?.kind === 'image' && Boolean(a1.preview) && ev.defaultPrevented, a1 && { kind: a1.kind, name: a1.name });
  await wait(500);
  step('chat: the overlay is gone after the drop', !document.querySelector('.dd-over.on'));
  // a pasted screenshot
  const n1 = v().attachments.length;
  ta.focus();
  const pe = new ClipboardEvent('paste', { clipboardData: dtWith(pngFile('image.png')), bubbles: true, cancelable: true });
  ta.dispatchEvent(pe);
  await until(() => v().attachments.length > n1, 5000);
  step('chat: a pasted screenshot is attached', v().attachments.at(-1)?.kind === 'image' && pe.defaultPrevented, DragDrop.last.paste);
  // paths: spaces, accents, #, a file: URL, iCloud, big text, a PDF
  const n2 = v().attachments.length;
  const fileUrl = WinMac.fileUrl(PIC);
  let r = await DragDrop.toChat(C.id, [fileUrl, `${DIR}/notes.md`, `${DIR}/big.log`, `${DIR}/Cloud song.mp3`, `${DIR}/brief.pdf`]);
  const added = v().attachments.slice(n2);
  step('chat: a file: URL with # and accents attaches the picture by its place (not copied)', added.some((a) => a.kind === 'image' && a.path === PIC), added.map((a) => a.path || a.name));
  step('chat: a small text file is read in', added.some((a) => a.kind === 'text' && /more punch/.test(a.content)));
  step('chat: iCloud placeholder, big text and PDF left out with plain reasons', r.skipped.length === 3 && r.skipped.some((w) => /still in iCloud/.test(w)) && r.skipped.some((w) => /too big to paste in/.test(w)) && r.skipped.some((w) => /PDFs need/.test(w)), r.skipped);
  step('chat: one calm line', typeof r.line === 'string' && r.line.length < 400 && /Attached 2/.test(r.line), r.line);
  // a folder: asked first, never granted silently
  const chatOf = () => Native.chatOf(C.id);
  const folder = `${DIR}/Project Folder`;
  let p = DragDrop.toChat(C.id, [folder]);
  await until(() => document.querySelector('dialog.ui-modal[open]'), 5000);
  const ask = document.querySelector('dialog.ui-modal[open]')?.textContent || '';
  step('chat: a folder asks "Let … use this folder?"', /use this folder/.test(ask), ask.slice(0, 160));
  [...document.querySelectorAll('dialog.ui-modal[open] button')].find((b) => b.textContent === 'Cancel')?.click();
  await p;
  step('chat: declined → nothing granted', !(chatOf()?.access?.folders || []).includes(folder));
  p = DragDrop.toChat(C.id, [folder]);
  await until(() => document.querySelector('dialog.ui-modal[open] button.primary'), 5000);
  document.querySelector('dialog.ui-modal[open] button.primary')?.click();
  await p;
  step('chat: accepted → the folder joins this chat\'s folders', (chatOf()?.access?.folders || []).includes(folder), chatOf()?.access);
  // many at once
  const many = Array.from({ length: 25 }, (_, i) => `${DIR}/many/n${i}.txt`);
  const n3 = v().attachments.length;
  r = await DragDrop.toChat(C.id, many);
  step('chat: 25 files at once → the first 20, the rest counted', v().attachments.length - n3 === 20 && r.more === 5 && /5 more files not added/.test(r.line), { added: v().attachments.length - n3, line: r.line });
  // /drop
  const n4 = v().attachments.length;
  await Commands.tryRun(`/drop "${PIC}"`, C.id);
  await until(() => v().attachments.length > n4, 5000);
  step('/drop "<path with spaces>" attaches it', v().attachments.at(-1)?.path === PIC);

  // ---------- out of Hearth ----------
  const sent = [];
  DragDrop._stubOut((s) => sent.push(s));
  const chip = [...v().chips.querySelectorAll('.attach-chip')].at(-1);
  chip.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
  const dEv = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
  chip.dispatchEvent(dEv);
  await wait(100);
  step('out: an attachment drags out as its own file', chip.getAttribute('draggable') === 'true' && dEv.defaultPrevented && sent.at(-1)?.path === PIC, sent.at(-1));
  v().attachments.splice(0); Native.renderChips(C.id);
  await Native.send(C.id, 'code please');
  await until(() => v().list.querySelector('.msg.assistant pre > .code-label'), 30000);
  await until(() => !Native.isBusy(H.activeChat[C.id]), 30000);
  await wait(300);
  const label = [...v().list.querySelectorAll('.msg.assistant pre > .code-label')].at(-1);
  if (label) {
    label.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    const ds = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
    label.dispatchEvent(ds);
    await wait(100);
    const code = label.closest('pre').querySelector('code').textContent;
    step('out: a code block\'s label drags out as a named file', ds.defaultPrevented && sent.at(-1)?.text === code && /^snippet\.\w+$|\.\w+$/.test(sent.at(-1)?.name || ''), { name: sent.at(-1)?.name, title: label.title });
  } else step('out: a reply with a code block', false, 'no code block in the fake reply');
  DragDrop._stubOut(null);

  // ---------- a template's media slot: its own drop, the overlay names it ----------
  const slot = Object.assign(document.createElement('div'), { className: 'lt-media' });
  slot.setAttribute('aria-label', 'Logo: drop a file or click to pick one');
  Object.assign(slot.style, { position: 'fixed', left: '10px', top: '10px', width: '80px', height: '60px' });
  document.body.append(slot);
  ev = fire(slot, 'dragover', dtWith(pngFile()));
  step('slot: "Drop to use as Logo", the slot keeps its own drop', overText() === 'Drop to use as Logo' && !ev.defaultPrevented, overText());
  slot.remove();

  // ---------- the Lab preview ----------
  await SQL.lab();
  const S = ThreeLab.scenes;
  const sc = S.create({ name: 'Dragdrop test', code: 'document.body.style.background = "#123";', open: true });
  await until(() => S.currentId() === sc.id, 8000);
  await wait(1200);
  const pv = document.querySelector('.three-preview');
  const layerCount = () => (ThreeLab.director.getCode().layers || []).length;
  fire(pv, 'dragover', dtWith(new File(['x'], 'track.mp3', { type: 'audio/mpeg' })));
  const tSong = overText();
  fire(pv, 'dragover', dtWith(new File(['x'], 'clip.mp4', { type: 'video/mp4' })));
  const tVid = overText();
  fire(pv, 'dragover', dtWith(pngFile()));
  const tPic = overText();
  step('lab: overlay words per kind', tSong === 'Drop to use as the song' && tVid === 'Drop to add a video layer' && tPic === 'Drop to add a picture layer', [tSong, tVid, tPic]);
  const L0 = layerCount();
  ev = fire(pv, 'drop', dtWith(pngFile('dropped picture.png')));
  await until(() => layerCount() > L0 && DragDrop.last.drop?.zone === 'lab', 10000);
  const codeOf = () => ThreeLab.director.codeOf('top')?.code || '';
  step('lab: a dropped picture becomes a picture layer (its reference)', layerCount() === L0 + 1 && /refTexture\('/.test(codeOf()) && ev.defaultPrevented && DragDrop.last.drop.steps[0] === 'picture', { layers: layerCount(), steps: DragDrop.last.drop?.steps });
  // footage first (no song), then the song, then a video while a song plays
  r = await DragDrop.toLab([VID]);
  step('lab: a video with no song → the footage + a Footage layer', r.steps[0] === 'footage' && ThreeLab.director.media.path === VID && layerCount() === L0 + 2, { steps: r.steps, path: ThreeLab.director.media.path, line: r.line });
  r = await DragDrop.toLab([SONG]);
  await until(() => ThreeLab.director.media.path === SONG, 8000);
  step('lab: a song becomes the song', r.steps[0] === 'song' && ThreeLab.director.media.path === SONG, r.line);
  r = await DragDrop.toLab([VID]);
  step('lab: a video while the song is on → a looping video layer, the song stays', r.steps[0] === 'video-layer' && ThreeLab.director.media.path === SONG && layerCount() === L0 + 3, r.line);
  r = await DragDrop.toLab([`${DIR}/brief.pdf`, `${DIR}/Project Folder`, `${DIR}/Cloud song.mp3`]);
  step('lab: PDF, folder, iCloud placeholder each explained, nothing added', r.steps.length === 0 && r.skipped.length === 3 && layerCount() === L0 + 3, r.skipped);
  // paste a screenshot into the Lab (not typing)
  document.activeElement?.blur?.();
  const L1 = layerCount();
  const lp = new ClipboardEvent('paste', { clipboardData: dtWith(pngFile('image.png')), bubbles: true, cancelable: true });
  document.body.dispatchEvent(lp);
  await until(() => layerCount() > L1, 10000);
  step('lab: a pasted screenshot joins the scene as a picture layer', layerCount() === L1 + 1 && lp.defaultPrevented, DragDrop.last.paste);
  await wait(800);
  S.remove?.(sc.id);
} catch (err) { step('no exception', false, String(err?.stack || err).slice(0, 600)); }

const bad = out.steps.filter((s) => !s.ok);
out.ok = !bad.length;
out.summary = `${out.steps.length - bad.length}/${out.steps.length} steps`;
return JSON.stringify(out, null, 1);
