#!/usr/bin/env node
// (round 43, glrecover) Unit tests for the main-side detection of the graphics card going away: glrecover-core.js (what
// the GPU status means, which note a crash / a status change makes, once, the words) and glrecovermain.js with a
// stand-in Electron app (EventEmitter + a stubbed getGPUFeatureStatus), ipcMain and window: a GPU process crash on the
// GPU → "restarted" once in 10 minutes; a crash after which drawing is software → "drawing without the graphics card"
// with a Restart; a software fall seen only by gpu-info-update; a computer that never had the GPU (VM, test machine)
// never told; a clean exit / the app quitting / another process type ignored; a note made before the window listens
// kept for glrecover:state; shown marks it; sim only in a test copy; dispose takes the listeners off.
//   node dev/glrecover-test.js
'use strict';
const path = require('path');
const { EventEmitter } = require('events');
const Core = require(path.join(__dirname, '..', 'glrecover-core.js'));
const Main = require(path.join(__dirname, '..', 'glrecovermain.js'));

let pass = 0; let fail = 0;
const ok = (cond, what) => { if (cond) pass += 1; else { fail += 1; console.log(`FAIL ${what}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GPU = { '2d_canvas': 'enabled', gpu_compositing: 'enabled', rasterization: 'enabled', webgl: 'enabled', webgl2: 'enabled' };
const SOFT = { '2d_canvas': 'unavailable_software', gpu_compositing: 'disabled_software', rasterization: 'disabled_software', webgl: 'unavailable_software', webgl2: 'unavailable_software' };
const NONE = { gpu_compositing: 'disabled_off', webgl: 'unavailable_off' };

// ---------- the core ----------
ok(Core.kind(GPU) === 'gpu', 'a GPU status reads gpu');
ok(Core.kind({ gpu_compositing: 'enabled_on', webgl: 'enabled_readback' }) === 'gpu', 'enabled_* reads gpu');
ok(Core.kind(SOFT) === 'software', 'disabled_software reads software');
ok(Core.kind({ gpu_compositing: 'enabled', webgl: 'unavailable_software' }) === 'software', 'WebGL alone in software reads software (the Lab draws in software)');
ok(Core.kind(NONE) === 'none', 'everything off reads none');
ok(Core.kind({}) === 'unknown' && Core.kind(null) === 'unknown' && Core.kind('x') === 'unknown', 'no status reads unknown');
ok(Core.isCrash({ type: 'GPU', reason: 'crashed' }) && Core.isCrash({ type: 'GPU', reason: 'killed' }) && Core.isCrash({ type: 'GPU', reason: 'oom' }), 'GPU crashed / killed / oom are crashes');
ok(!Core.isCrash({ type: 'GPU', reason: 'clean-exit' }) && !Core.isCrash({ type: 'Utility', reason: 'crashed' }) && !Core.isCrash({ type: 'GPU', reason: 'crashed' }, true) && !Core.isCrash(null), 'a clean exit, another process, the app quitting: not a crash');
{
  const st = Core.init(GPU);
  ok(st.kind === 'gpu' && st.sawGpu && !st.crashes, 'init on the GPU');
  ok(Core.step(st, { type: 'crash', now: 1000 }) === null && st.crashes === 1, 'a crash is counted, no note yet');
  const n = Core.step(st, { type: 'check', status: GPU, after: 'crash', now: 3500 });
  ok(n?.kind === 'restarted' && !n.restart && n.id === 'gpu-1', 'still on the GPU after a crash: restarted');
  ok(Core.step(st, { type: 'check', status: GPU, after: 'late', now: 8000 }) === null, 'the late look on the GPU: nothing more');
  Core.step(st, { type: 'crash', now: 60000 });
  ok(Core.step(st, { type: 'check', status: GPU, after: 'crash', now: 62000 }) === null, 'another restart within 10 minutes: not told again');
  Core.step(st, { type: 'crash', now: 700000 });
  ok(Core.step(st, { type: 'check', status: GPU, after: 'crash', now: 703500 })?.kind === 'restarted', 'after 10 minutes: told again');
  Core.step(st, { type: 'crash', now: 710000 });
  const s = Core.step(st, { type: 'check', status: SOFT, after: 'crash', now: 712500 });
  ok(s?.kind === 'software' && s.restart === true && st.kind === 'software', 'a crash after which it draws in software: the software note with Restart');
  ok(Core.step(st, { type: 'check', status: SOFT, after: 'late', now: 717000 }) === null && Core.step(st, { type: 'check', status: SOFT, after: 'info', now: 720000 }) === null, 'software told once');
  Core.step(st, { type: 'crash', now: 730000 });
  ok(Core.step(st, { type: 'check', status: SOFT, after: 'crash', now: 732500 }) === null, 'a crash while already in software: no restarted note (it didn\'t come back), no second software note');
  ok(Core.step(st, { type: 'check', status: GPU, after: 'info', now: 800000 }) === null && st.kind === 'gpu', 'back on the GPU: nothing to say');
  ok(Core.step(st, { type: 'check', status: SOFT, after: 'info', now: 900000 })?.kind === 'software', 'and a later fall to software is told again');
  ok(st.notes.length === 4 && st.notes.every((x, i) => x.id === `gpu-${i + 1}`), 'notes kept in order with their ids');
  ok(Core.view(st).notes.length === 4 && Core.view(st).notes[0] !== st.notes[0], 'view() copies');
}
{
  const st = Core.init(SOFT); // a VM, a remote desktop, the test machine (SwiftShader)
  Core.step(st, { type: 'crash', now: 1 });
  const n = Core.step(st, { type: 'check', status: SOFT, after: 'crash', now: 3000 });
  ok(n === null && !st.sawGpu, 'never had the GPU this session: no software note, no restarted note while in software');
  ok(Core.step(st, { type: 'check', status: SOFT, after: 'info', now: 4000 }) === null, 'and no note on an info update');
}
{
  const st = Core.init({}); // the status not known yet at the start
  ok(st.kind === 'unknown' && !st.sawGpu, 'unknown at the start');
  ok(Core.step(st, { type: 'check', status: GPU, after: 'info', now: 10 }) === null && st.sawGpu, 'the GPU seen on an info update');
  ok(Core.step(st, { type: 'check', status: NONE, after: 'info', now: 20 })?.kind === 'software', 'a fall to no acceleration at all (info only): the same note');
}
{
  const st = Core.init(GPU);
  for (let i = 0; i < 14; i++) { Core.step(st, { type: 'crash', now: i * 7e5 }); Core.step(st, { type: 'check', status: GPU, after: 'crash', now: i * 7e5 + 1 }); }
  ok(st.notes.length === 10 && st.notes[9].id === 'gpu-14', 'at most 10 notes kept');
}
ok(Core.text('software') === 'Hearth is drawing without the graphics card right now — Restart Hearth to get it back', 'the software words');
ok(Core.text('restarted', { lab: true }) === 'The graphics card restarted — the Lab picked up where it was' && /Hearth picked up/.test(Core.text('restarted')), 'the restarted words (Lab / app)');
{
  const fs = require('fs');
  const win = fs.readFileSync(path.join(__dirname, '..', 'glrecover.js'), 'utf8');
  ok(win.includes(Core.text('software')) && win.includes(Core.text('restarted', { lab: true })) && win.includes(Core.text('restarted')), 'the window shows the same words');
}

// ---------- main, with a stand-in app ----------
function fakeApp() { const a = new EventEmitter(); a.status = GPU; a.getGPUFeatureStatus = () => a.status; return a; }
function fakeIpc() { const h = new Map(); return { handle: (ch, fn) => h.set(ch, fn), call: (ch, ...a) => h.get(ch)({}, ...a), h }; }
function fakeWin() { const sent = []; return { sent, isDestroyed: () => false, webContents: { send: (ch, d) => sent.push([ch, d]) } }; }
(async () => {
  const delays = { crash: 30, late: 80, info: 10 };
  {
    const app = fakeApp(); const ipc = fakeIpc(); const w = fakeWin();
    const m = Main.register(ipc, { getWin: () => w, app, delays, test: false });
    ok(['glrecover:state', 'glrecover:shown', 'glrecover:sim'].every((c) => ipc.h.has(c)), 'its three channels');
    ok(app.listenerCount('child-process-gone') === 1 && app.listenerCount('gpu-info-update') === 1, 'listens to the GPU process and info updates');
    app.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed', exitCode: 3 });
    await sleep(140);
    ok(w.sent.length === 1 && w.sent[0][0] === 'glrecover:note' && w.sent[0][1].kind === 'restarted', 'a GPU crash on the GPU: one restarted note to the window');
    ok(w.sent[0][1].text === Core.text('restarted') && w.sent[0][1].labText === Core.text('restarted', { lab: true }), 'with its words');
    app.status = SOFT;
    app.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed' });
    await sleep(140);
    ok(w.sent.length === 2 && w.sent[1][1].kind === 'software' && w.sent[1][1].restart, 'a second crash, now in software: the software note with Restart');
    app.emit('child-process-gone', {}, { type: 'GPU', reason: 'clean-exit' });
    app.emit('child-process-gone', {}, { type: 'Utility', reason: 'crashed' });
    app.emit('gpu-info-update'); app.emit('gpu-info-update');
    await sleep(140);
    ok(w.sent.length === 2, 'a clean exit, another process, info updates in software: nothing more');
    const st = await ipc.call('glrecover:state');
    ok(st.kind === 'software' && st.crashes === 2 && st.notes.length === 2 && st.status.webgl === 'unavailable_software', 'glrecover:state');
    ok(await ipc.call('glrecover:shown', st.notes[1].id) === true && (await ipc.call('glrecover:state')).notes[1].shown && !(await ipc.call('glrecover:shown', 'nope')), 'shown marks a note');
    ok((await ipc.call('glrecover:sim', { gone: 'crashed' })).ok === false, 'sim refused outside a test copy');
    app.emit('before-quit');
    app.status = GPU;
    app.emit('child-process-gone', {}, { type: 'GPU', reason: 'killed' });
    await sleep(140);
    ok(w.sent.length === 2 && (await ipc.call('glrecover:state')).crashes === 2, 'while quitting: not a crash');
    m.dispose();
    ok(app.listenerCount('child-process-gone') === 0 && app.listenerCount('gpu-info-update') === 0 && app.listenerCount('before-quit') === 0, 'dispose takes its listeners off');
  }
  {
    // no window yet (the note waits for the window to ask), an info update alone
    const app = fakeApp(); const ipc = fakeIpc(); let w = null;
    Main.register(ipc, { getWin: () => w, app, delays, test: false });
    app.status = SOFT; app.emit('gpu-info-update');
    await sleep(60);
    const st = await ipc.call('glrecover:state');
    ok(st.notes.length === 1 && st.notes[0].kind === 'software' && !st.notes[0].shown, 'a fall to software seen by an info update, before the window: kept for glrecover:state');
    w = fakeWin(); app.status = SOFT; app.emit('gpu-info-update'); await sleep(60);
    ok(w.sent.length === 0, 'not told twice');
  }
  {
    // a test copy: sim drives the same paths; a never-GPU machine never told
    const app = fakeApp(); app.status = SOFT; const ipc = fakeIpc(); const w = fakeWin();
    Main.register(ipc, { getWin: () => w, app, delays, test: true });
    let r = await ipc.call('glrecover:sim', { gone: 'crashed' });
    await sleep(140);
    ok(r.ok && w.sent.length === 0 && (await ipc.call('glrecover:state')).crashes === 1, 'a never-GPU machine: a crash counted, nobody told');
    r = await ipc.call('glrecover:sim', { status: GPU, info: true }); await sleep(40);
    ok(r.ok && (await ipc.call('glrecover:state')).sawGpu, 'sim: a stubbed GPU status');
    await ipc.call('glrecover:sim', { status: SOFT, gone: 'crashed' }); await sleep(140);
    ok(w.sent.length === 1 && w.sent[0][1].kind === 'software', 'sim: crash + software → the software note');
    await ipc.call('glrecover:sim', { status: null });
    ok((await ipc.call('glrecover:state')).status.webgl === 'unavailable_software', 'sim status null: back to the real status');
  }
  {
    // a throwing getGPUFeatureStatus, a window gone
    const app = fakeApp(); app.getGPUFeatureStatus = () => { throw new Error('no GPU info'); };
    const ipc = fakeIpc();
    const m = Main.register(ipc, { getWin: () => ({ isDestroyed: () => true }), app, delays, test: false });
    app.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed' }); await sleep(140);
    ok(m.state().kind === 'unknown' && m.state().notes.length === 1 && m.state().notes[0].kind === 'restarted', 'no GPU info: still a restarted note (kept), a destroyed window not sent to');
  }
  console.log(`${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
