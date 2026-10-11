// Polish 8, second picture tour: the deeper layers of the round 7 surfaces (board vibe card, search, quick bar, Alt
// handles, presentation; the capture tour picker, annotation, frame reader, a recording) in one look (the editor's
// menus left with Video Review in round 17).
//   sh dev/board-fixtures.sh && node dev/make-editor-videos.js /tmp/hearth-editor-videos
//   node dev/smoke.js --check-timeout 400000 --script dev/checks/polish8-tour2.js
// window.P8_LOOK = a look id (default forgeheart), window.P8_SHOTS = folder for the pictures (default /tmp/p8/t2-<look>).
const LOOK = window.P8_LOOK || 'forgeheart';
const DIR = window.P8_SHOTS || `/tmp/p8/t2-${LOOK}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(120); } return false; };
const shot = (name) => smoke({ shot: `${DIR}/${name}.png` });
const key = (type, k, code, mods = 0) => smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: k, code, modifiers: mods, windowsVirtualKeyCode: { Alt: 18, Control: 17 }[k] || 0 } });
const out = { look: LOOK, notes: [] };
const closeDialogs = () => document.querySelectorAll('dialog[open]').forEach((d) => d.close());
Look.applyPreset(LOOK, { quiet: true }); await wait(500);

// ---------- board ----------
activate('tool:board');
await until(() => Board.isMounted() && Board.current());
const FIX = '/tmp/hearth-board-fixtures';
await Board.addFiles(['neon big.png', 'golden-hour.jpg', 'loop.gif', 'cuts.mp4'].map((f) => `${FIX}/${f}`));
Board.addNote?.('Warm, grainy, slow pushes. Gold on black.');
await until(() => Board.items().filter((i) => i.vibe).length >= 3, 15000);
Board.zoomFit(); await wait(1200);
const img = Board.items().find((i) => i.type === 'image');
Board.select([img.id]); await wait(300);
await key('keyDown', 'Alt', 'AltLeft', 1); await wait(350); await shot('board-alt'); await key('keyUp', 'Alt', 'AltLeft'); await wait(200);
await key('keyDown', 'Control', 'ControlLeft', 2); await wait(350); await shot('board-ctrl'); await key('keyUp', 'Control', 'ControlLeft'); await wait(200);
Board._.vibeCard(img); await wait(600); await shot('board-vibe-card'); closeDialogs(); await wait(300);
Board._.search?.(); await wait(400); await shot('board-search');
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.querySelector('.bd-search')?.remove?.(); await wait(300);
Board.select([]);
Board._.info?.(); await wait(500); await shot('board-info'); closeDialogs(); await wait(300);

// ---------- capture ----------
activate(H.claudeAgent().id); await wait(400);
CaptureTour.picker?.(); await wait(600); await shot('capture-tours'); closeDialogs(); await wait(300);
const s1 = await Capture.shot({ target: 'window', quiet: true });
const ann = CaptureAnnotate.open(s1.path); await wait(900); await shot('capture-annotate'); closeDialogs(); await ann?.catch?.(() => {}); await wait(300);
try { const r = await Capture.record({ target: 'window', countdown: 0 }); out.rec = Boolean(r); await wait(1400); await shot('capture-recording'); const done = await Capture.stop({ quiet: true }); out.recPath = done?.path; await wait(600);
  if (done?.path) { await CaptureView.open(done.path); await wait(1200); await shot('capture-player'); closeDialogs(); await wait(300); }
} catch (err) { out.notes.push(`record: ${err.message}`); }
try { const vid = '/tmp/hearth-editor-videos/frames_a_30.mp4'; const r = await FrameRead.read(vid, 'sheet', {}); FrameRead.show(r, vid); await wait(900); await shot('capture-frames'); closeDialogs(); } catch (err) { out.notes.push(`frames: ${err.message}`); }

return JSON.stringify(out, null, 1);
