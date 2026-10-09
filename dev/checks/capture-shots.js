// Capture: screenshots of Hearth itself (capturePage), targets, clean UI, social frames, beautify, the tall chat
// picture, annotation, the library and player, the region picker, commands and keys.
//   node dev/smoke.js --script dev/checks/capture-shots.js --shot /tmp/capture-shots.png
const out = { errors: [] };
const ok = (cond, what) => { if (!cond) out.errors.push(what); return cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const probeImg = (p) => new Promise((res) => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res(null); i.src = Capture.fileUrl(p); });

out.info = await Capture.info();
ok(out.info.dir && out.info.ffmpeg, 'captures folder + ffmpeg found');
// the commands exist and nothing collides
out.cmds = ['capture', 'screenshot', 'record', 'rec', 'tour', 'frames', 'frame-at', 'scenes', 'contact', 'pacing', 'motion-curve', 'frame-palette', 'captures', 'annotate', 'beautify', 'crop-shot', 'copy-shot', 'clean-ui', 'cursor-fx', 'keys-overlay', 'window-size', 'capture-tools', 'capture-folder', 'capture-last', 'record-presets', 'capture-help'].filter((n) => !Commands.get(n));
ok(!out.cmds.length, `missing commands: ${out.cmds}`);
out.dups = Commands.duplicates().map((d) => `${d.name}: ${d.was} <- ${d.by}`);
ok(!out.dups.length, 'no duplicate commands');
ok(Commands.get('record').variants?.length === 2 && Commands.get('screenshot').variants?.length === 2, '/record and /screenshot are shared with when');
out.keys = Capture.keys().length;
ok(out.keys > 40, 'keys registered');

// whole window: the device-pixel size of the window
const w = await Capture.shot({ target: 'window', quiet: true });
out.window = { ...w, file: await probeImg(w.path) };
ok(w.w >= 1000 && out.window.file?.w === w.w, 'window shot');
// this tool (no rail): narrower than the window
const t = await Capture.shot({ target: 'tool', quiet: true });
out.tool = { w: t.w, h: t.h };
ok(t.w < w.w && t.w > 400, 'tool shot is the surface only');
// a selector
const r = await Capture.shot({ target: 'selector:#rail', quiet: true });
out.rail = { w: r.w, h: r.h };
ok(r.w < 120 && r.h > 300, 'selector shot');
// social frames at their exact size, crop and fit
const s916 = await Capture.shot({ target: 'tool', crop: '9:16', quiet: true });
const s45 = await Capture.shot({ target: 'window', crop: '4:5', fit: 'fit', quiet: true });
out.social = { s916: [s916.w, s916.h], s45: [s45.w, s45.h] };
ok(s916.w === 1080 && s916.h === 1920 && s45.w === 1080 && s45.h === 1350, 'social frames exact');
// beautify + clean + jpg
const b = await Capture.shot({ target: 'window', beautify: 'forge', clean: true, format: 'jpg', quiet: true });
out.beautify = { w: b.w, h: b.h, path: b.path };
ok(b.w > w.w && /\.jpg$/.test(b.path), 'beautified jpg is bigger than the window (padding)');
// clean mode hides toasts while shooting and comes back
toast('A toast that must not be in a clean shot', { timeout: 20000 });
const cl = await Capture.shot({ target: 'window', clean: true, hideRail: true, quiet: true });
ok(!document.documentElement.classList.contains('cap-clean') && !document.documentElement.classList.contains('cap-norail'), 'clean mode removed after the shot');
out.clean = cl.path;
// commands
const c1 = await Commands.tryRun('/shot tool 1:1 copy', H.claudeAgent().id, null, { source: 'code', say: (x) => { out.say1 = x; } });
ok(c1 !== false, '/shot tool 1:1 copy ran');
out.lastAfterCmd = Capture.last()?.path;
ok(/1x1/.test(out.lastAfterCmd || ''), '/shot made a 1x1 picture');
// the chat as a tall picture: make a long chat first (notes are in the message list)
const agent = H.claudeAgent();
activate(agent.id);
await sleep(300);
for (let i = 0; i < 30; i += 1) Native.note?.(agent.id, `Line ${i}: ${'lorem ipsum '.repeat(8)}`);
await sleep(400);
let tall = null;
try { tall = await Capture.shot({ target: 'transcript', quiet: true }); } catch (e) { out.tallError = e.message; }
out.tall = tall && { w: tall.w, h: tall.h, path: tall.path };
// annotate: open the editor, draw an arrow, a box, a badge and a blur, save
const annP = Capture.last().path;
const pending = CaptureAnnotate.open(w.path);
await sleep(600);
const ed = CaptureAnnotate.current?.annotate;
ok(Boolean(ed), 'annotate editor opened');
if (ed) {
  ed.shapes = [{ type: 'arrow', color: '#ff6a1a', size: 'm', x1: 100, y1: 100, x2: 400, y2: 300 }, { type: 'rect', color: '#ffc233', size: 'l', x1: 500, y1: 200, x2: 800, y2: 400 }, { type: 'badge', color: '#ff3b30', size: 'm', x1: 900, y1: 200, n: 1 }, { type: 'blur', color: '#fff', size: 'm', x1: 50, y1: 600, x2: 400, y2: 800 }, { type: 'text', color: '#ffffff', size: 'm', x1: 120, y1: 420, text: 'Hearth captures itself' }, { type: 'spotlight', color: '#fff', size: 'm', x1: 480, y1: 180, x2: 820, y2: 420 }];
  await sleep(200);
  await ed.save();
}
const annOut = await pending;
out.annotated = annOut;
ok(annOut && /annotated/.test(annOut), 'annotation saved as a new file');
// the library opens and lists them
const lib = await CaptureView.library();
await sleep(500);
out.libCards = lib.querySelectorAll('.cap-card').length;
ok(out.libCards >= 8, 'library lists the captures');
await smoke({ shot: '/tmp/capture-library.png' });
lib.close();
// the viewer on a picture
const v = await CaptureView.open(annOut || w.path);
await sleep(400);
await smoke({ shot: '/tmp/capture-viewer.png' });
v.close();
// region picker: drive it with real mouse events (drag a rectangle)
const pick = Capture.pickRegion({});
await sleep(150);
const mouse = (type, x, y) => smoke({ cdp: 'Input.dispatchMouseEvent', params: { type, x, y, button: 'left', clickCount: 1 } });
await mouse('mousePressed', 200, 150); await mouse('mouseMoved', 400, 300); await mouse('mouseMoved', 600, 450); await mouse('mouseReleased', 600, 450);
const picked = await pick;
out.picked = picked?.rect;
ok(picked && Math.round(picked.rect.width) === 400 && Math.round(picked.rect.height) === 300, 'region picker drag');
// click (no drag) = the thing under the pointer
const pick2 = Capture.pickRegion({});
await sleep(150);
const rb = document.getElementById('config-btn').getBoundingClientRect();
await mouse('mousePressed', rb.left + 5, rb.top + 5); await mouse('mouseReleased', rb.left + 5, rb.top + 5);
const picked2 = await pick2;
out.picked2 = picked2?.el?.id || picked2?.el?.tagName;
ok(picked2?.el, 'region picker click picks the element');
// Esc cancels
const pick3 = Capture.pickRegion({});
await sleep(100);
await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 } });
ok((await pick3) === null, 'Esc cancels the picker');
// the capture menu (in the rail's ⋯) and its submenus
document.getElementById('rail-more')?.click();
await sleep(200);
out.railMenu = [...document.querySelectorAll('#menu button')].map((b) => b.textContent).filter((x) => /Capture/.test(x));
ok(out.railMenu.length === 1, 'one Capture entry in the rail ⋯ menu');
[...document.querySelectorAll('#menu button')].find((b) => /Capture/.test(b.textContent))?.click();
await sleep(200);
out.capMenu = [...document.querySelectorAll('#menu button')].map((b) => b.textContent);
ok(out.capMenu.some((x) => /Screenshot of this tool/.test(x)) && out.capMenu.some((x) => /›/.test(x)), 'capture menu with submenus');
[...document.querySelectorAll('#menu button')].find((b) => /Screenshot of(…|›)/.test(b.textContent))?.click();
await sleep(150);
out.subMenu = [...document.querySelectorAll('#menu button')].map((b) => b.textContent).slice(0, 4);
ok(/back/.test(out.subMenu[0] || ''), 'submenu has a back row');
await smoke({ shot: '/tmp/capture-menu.png' });
hideMenu();
return JSON.stringify(out, null, 1);
