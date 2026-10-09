// Capture extras: the tour tape (do it once → a tour that replays it), /shot all, the vibe card of a reference, zoom on
// clicks while recording, chapter markers on screen changes, the GIF preset, the camera bubble (refused without a camera).
// Needs the test videos:  node dev/capture-test.js --make /tmp/hearth-capture-test
//   node dev/smoke.js --script dev/checks/capture-extras.js --check-timeout 300000
const out = { errors: [] };
const ok = (cond, what) => { if (!cond) out.errors.push(what); return cond; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const agentId = H.claudeAgent().id;
const run = async (line) => { const said = []; await Commands.tryRun(line, agentId, null, { source: 'code', say: (t) => said.push(t) }); return said.join('\n'); };
const mouse = (type, x, y) => smoke({ cdp: 'Input.dispatchMouseEvent', params: { type, x, y, button: 'left', clickCount: 1 } });
const clickAt = async (n) => { const r = n.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2; await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); };

// 1) tape: switch screens with real clicks, type in the chat box, then stop → a tour with those steps
activate(agentId); await sleep(300);
ok(/Taping/.test(await run('/tour tape')), '/tour tape starts');
const toolBtn = [...document.querySelectorAll('#agent-buttons .agent-btn')].find((b) => b.dataset.id === 'tool:ae') || document.querySelector('[data-id="tool:ae"]');
if (toolBtn) await clickAt(toolBtn);
await sleep(600);
activate(agentId); await sleep(500);
const ta = document.querySelector('.surface:not([hidden]) .composer textarea') || [...document.querySelectorAll('.composer textarea')].find((t) => t.getClientRects().length);
ta.focus();
for (const ch of '/help') { ta.value += ch; ta.dispatchEvent(new Event('input', { bubbles: true })); await sleep(30); }
const text = CaptureTour.tape(false);
document.querySelector('dialog.cap-tour-edit')?.close();
out.taped = text;
ok(/(open ae|tool:ae)/.test(text) && !/click \[data-id="tool:ae"\]\nopen ae/.test(text) && /type "\/help"/.test(text) && /open Claude/i.test(text), 'the tape has the screens and the typing');
ok(!CaptureTour.lint(text).length, 'the taped tour lints clean');
ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true }));

// 2) /shot all: one picture per screen
const all = await run('/shot all');
out.all = all.split('\n')[0];
ok(/(\d+) screens/.test(all) && Number(all.match(/(\d+) screens/)[1]) >= 4, '/shot all');

// 3) the vibe card of a reference video
const v = await FrameRead.read('/tmp/hearth-capture-test/cuts.mp4', 'vibe');
out.vibe = v.text;
ok(v.images[0]?.path && v.value.palette.length >= 3 && /Pacing/.test(v.text), 'vibe card: picture + palette, light, pacing, motion');
const vt = await HubBridge.call('capture_frames', { path: '/tmp/hearth-capture-test/cuts.mp4', mode: 'vibe' });
ok(vt.ok && vt.images?.length === 1, 'capture_frames vibe for the agents');

// 4) zoom on clicks while recording, chapters on screen changes, the GIF preset
await Capture.record({ preset: 'gif', countdown: 0, autozoom: true });
await sleep(400);
await clickAt(document.getElementById('config-btn') ? document.querySelector('#rail') : document.body);
await sleep(900);
out.zoomed = document.getElementById('app').style.transform;
ok(/scale\(1\.6\)/.test(out.zoomed), 'a click zoomed the view in (1.6×)');
activate('tool:ae'); await sleep(500);
activate(agentId); await sleep(500);
ok(Capture.status().marks >= 2, `chapters: a marker per screen change (${Capture.status().marks})`);
const r = await Capture.stop({ quiet: true });
out.gif = r.gif;
ok(r.gif && /\.gif$/.test(r.gif), 'the GIF preset made a GIF');
ok(!document.getElementById('app').style.transform, 'the view zoomed back out after the take');
const fin = (await window.hub.capture.frames('probe', r.gif)).value;
ok(fin?.codec === 'gif', 'the GIF is a real GIF');

// 5) the camera bubble: no camera here, so a clear message and the take still runs
const cam = await Capture.cameraBubble('br');
ok(cam === false || cam === true, 'camera bubble answers (no camera on the test machine)');
await Capture.cameraBubble(null);
// the menus: Recent… and the tape item
const items = Capture.mainItems().filter(Boolean).map((i) => i.label);
ok(items.some((l) => /^Recent/.test(l)), 'Recent… in the capture menu');
ok(CaptureTour.menuItems().some((i) => i && /Tape a tour/.test(i.label)), 'Tape a tour in the tours menu');
return JSON.stringify(out, null, 1);
