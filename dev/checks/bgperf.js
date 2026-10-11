// Background calm (round 16, bgperf): the steady idle cursor (bgmain.js: after ~12 s without a key or a click the
// chat box's cursor stops blinking; a key brings the blink back), the board keeping its compositor layer between pans
// and dropping it after a zoom, frame titles' --inv on the frames only, app windows' hidden cap.
//   node dev/smoke.js --script dev/checks/bgperf.js       (HEARTH_CALM_MS=2000 makes the cursor part quicker)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(150); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const C = H.claudeAgent();
activate(C.id); await wait(800);
const v = Native.view(C.id);
v.input.focus();
const caret = () => getComputedStyle(v.input).caretAnimation;
ok(await until(() => caret() === 'manual', 30000), `the idle cursor stops blinking (${caret()})`);
out.idleCaret = caret();
// a key brings the blink back
await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 } });
await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 } });
ok(await until(() => caret() !== 'manual', 3000), `a key brings the blink back (${caret()})`);
out.afterKey = caret();

// the board: a pan keeps the layer, a zoom drops it at the settle; --inv only on frames
activate('tool:board');
await until(() => Board.isMounted() && Board.current());
const S = Board._.S;
const fr = Board.addFrame ? Board.addFrame({ title: 'Calm frame' }) : null;
if (!fr) Board.edit('calm frame', (b) => { const f = Board._.newItem('frame', { title: 'Calm frame', x: 0, y: 0, w: 600, h: 400 }, b); if (!f.id) f.id = Board._.uid(b); b.items.push(f); });
await wait(300);
const vp = document.querySelector('.bd-vp').getBoundingClientRect();
const wheel = (params) => smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: vp.left + vp.width / 2, y: vp.top + vp.height / 2, ...params } });
for (let i = 0; i < 6; i++) { await wheel({ deltaX: 12, deltaY: 8 }); await wait(16); }
await until(() => !S.moving, 3000); await wait(100);
ok(S.ui.root.classList.contains('bd-layer'), 'after a pan the board keeps its layer');
for (let i = 0; i < 6; i++) { await wheel({ deltaX: 0, deltaY: -6, modifiers: 2 }); await wait(16); }
await until(() => !S.moving, 3000); await wait(100);
ok(!S.ui.root.classList.contains('bd-layer'), 'after a zoom the layer goes (sharp pictures at the new scale)');
const frameNode = [...S.nodes.values()].find((n) => n.classList.contains('bd-t-frame'));
ok(frameNode && Math.abs(Number(frameNode.style.getPropertyValue('--inv')) - 1 / S.view.z) < 1e-6, `frames carry --inv (${frameNode?.style.getPropertyValue('--inv')} vs ${1 / S.view.z})`);
ok(!S.ui.root.style.getPropertyValue('--inv'), 'the board root no longer carries --inv');
out.zoom = S.view.z;

// app windows: the cap on hidden windows is reported
const st = await hub.apps.status();
ok(st.maxHidden === 2, `apps status reports the hidden cap (${st.maxHidden})`);
out.parkMs = st.parkMs;
// /background: the report by chat command (processes, sync pace, app windows); /apps free with nothing hidden
let said = '';
await Commands.tryRun('/background', C.id, null, { say: (t) => { said = String(t); }, note: (t) => { said = String(t); } });
ok(/MB in \d+ processes/.test(said) && /App windows/.test(said) && /cursor/.test(said), `/background reports (${said.slice(0, 160)})`);
out.background = said.split('\n')[0];
said = '';
await Commands.tryRun('/apps free', C.id, null, { say: (t) => { said = String(t); }, note: (t) => { said = String(t); } });
ok(/No hidden app window|Freed/.test(said), `/apps free answers (${said})`);
ok(!(Commands.duplicates?.() || []).length, 'no duplicate commands');
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
