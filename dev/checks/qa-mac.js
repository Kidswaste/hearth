// QA (round 8): ⌘ instead of Ctrl, as on the owner's Mac (the page believes it runs on a Mac; the main process is
// whatever runs the check). ⌘ / ⌥ in the labels (keys sheet, capture menu, commands), ⌘ shortcuts on the board,
// in the editor and the drawer, ⌥+key on the editor (a Mac types ˚ for ⌥K: the editor reads it).
//   node dev/smoke.js --mac --check-timeout 300000 --script dev/checks/qa-mac.js
const { wait, until, key } = J;
const out = { fail: [] };
const ok = (c, what, info) => { if (!c) out.fail.push(`${what}${info === undefined ? '' : ` · ${JSON.stringify(info)}`}`); return c; };
const meta = async (k, { shift = false } = {}) => { // ⌘+key the way macOS sends it (metaKey, no ctrlKey)
  const code = /^[a-z]$/i.test(k) ? `Key${k.toUpperCase()}` : k; const vk = k.toUpperCase().charCodeAt(0);
  for (const type of ['rawKeyDown', 'keyUp']) await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: shift ? k.toUpperCase() : k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: 4 | (shift ? 8 : 0) } });
  await wait(250);
};
ok(/Mac/.test(navigator.platform), 'the page runs as on a Mac');
// labels
ok(KeysUI.keyText('Ctrl+K').includes('⌘'), 'keys sheet shows ⌘', KeysUI.keyText('Ctrl+K'));
const capLine = Keys.all().find((k) => k.area === 'Capture' && /menu/i.test(k.what));
ok(capLine && /^Ctrl\+Alt\+S$/.test(capLine.keys), 'the capture key is stored as Ctrl+Alt+S (shown as ⌘⌥S)', capLine?.keys);
KeysUI.open(); await wait(400);
const sheetText = document.querySelector('.keys-sheet')?.textContent || '';
const ctrlLeft = [...sheetText.matchAll(/.{0,40}Ctrl(?!\+click).{0,30}/g)].map((m) => m[0]);
ok(/⌘/.test(sheetText) && !ctrlLeft.length, 'the sheet says ⌘, not Ctrl', ctrlLeft.slice(0, 6));
KeysUI.close();
const capMenu = Capture.mainItems().map((i) => i?.label || '').join(' ');
ok(/⌘/.test(capMenu) && !/Ctrl\+Alt/.test(capMenu), 'capture menu shows ⌘', capMenu.slice(0, 120));

// the board: ⌘D duplicates, ⌘Z undoes, ⌘⇧M opens the drawer
activate('tool:board'); await until(() => Board.isMounted() && Board.visible());
await Board.create('Mac keys'); await wait(300);
const n = Board.addNote('mac'); await wait(300);
Board.select([n.id]); Board._.S.ui.root.focus();
const c0 = Board.items().length;
await meta('d');
ok(Board.items().length === c0 + 1, '⌘D duplicates on the board', Board.items().length);
Board._.S.ui.root.focus(); await meta('z');
ok(Board.items().length === c0, '⌘Z undoes on the board', Board.items().length);
await meta('m', { shift: true });
ok(BoardDrawer.isOpen(), '⌘⇧M opens the drawer');
await meta('m', { shift: true });

// the editor: ⌘Z after a split; ⌥K (types ˚ on a Mac) keys the transform
const EV = window.EDITOR_VIDS || '/tmp/hearth-editor-videos';
const VIDS = `${window.SMOKE_SAVES}/mac`;
await window.hub.fs.write(`${VIDS}/.keep`, '');
await window.hub.fs.copy(`${EV}/frames_a_30.mp4`, `${VIDS}/frames_a_30.mp4`);
activate('tool:ae'); await Review.ensureMounted();
await Review.open(`${VIDS}/frames_a_30.mp4`); await Review.waitReady(); await wait(300);
await VideoCut.enter(); await until(() => VideoCut.active);
const root = H.surfaces.get('tool:ae').el.querySelector('.vr').parentElement;
VideoCut.goto(1); root.focus(); await key('s'); await wait(200);
ok(VideoCut.edit.clips.length === 2, 'S splits');
root.focus(); await meta('z');
ok(VideoCut.edit.clips.length === 1, '⌘Z undoes in the editor', VideoCut.edit.clips.length);
root.focus(); await meta('z', { shift: true });
ok(VideoCut.edit.clips.length === 2, '⌘⇧Z redoes in the editor', VideoCut.edit.clips.length);
VideoCut.select(0); VideoCut.goto(0.5); root.focus();
for (const type of ['keyDown', 'keyUp']) await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: '˚', code: 'KeyK', windowsVirtualKeyCode: 75, modifiers: 1, ...(type === 'keyDown' ? { text: '˚' } : {}) } });
await wait(300);
ok(Object.keys(VideoCut.edit.clips[0].keys || {}).length > 0, '⌥K (˚ on a Mac) keys the transform', VideoCut.edit.clips[0].keys);
// / menu and command help say ⌘
ok(/⌘/.test(Commands.list().map((d) => d.keys || '').join(' ').replace(/Ctrl/g, '') + KeysUI.keyText('Ctrl+;')), 'command keys read ⌘');
out.ok = !out.fail.length;
return JSON.stringify(out, null, 1);
