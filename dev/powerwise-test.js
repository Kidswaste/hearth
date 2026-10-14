#!/usr/bin/env node
// Power-wise (round 39): the pure parts of powerwise.js and the main side (powerwisemain.js) in Node, on fake clocks:
//   1. holds: counted per reason, one system blocker, the right kind (the screen only for Present / recordings), a new
//      kind started before the old stops, always released (owner gone, time limit, let it sleep, quit, a failing stop)
//   2. the battery policy (plugged / battery / saver), Mac Low Power Mode and Windows battery saver from their words
//   3. the background timer schedule: pace on battery / saver / hidden, 'skip' while hidden, nothing while asleep, after
//      a wake a settle time and one at a time, a late timer read as a sleep, first / max / stop
//   4. the main side: a long AI turn holds after its threshold, short ones never; big / small / unknown downloads; an
//      update; the page's holds dropped when it goes; the state the window gets
//   5. the timers this round moved onto the schedule (updater, hooks, websites, the Lab's checks, chromeview, the
//      config safety net) stay there, and the hint queue doesn't look again every 0.7 s while Hearth is hidden
//   node dev/powerwise-test.js
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'powerwise.js'));
let fails = 0; let n = 0;
const check = (ok, name, info) => { n += 1; console.log(`${ok ? '✓' : '✗'} ${name}${info === undefined ? '' : ` ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails += 1; };

// a fake clock: timers run in time order when advanced
function clock(t0 = 1e6) {
  let now = t0; let seq = 0; const q = new Map();
  const setTimer = (fn, ms) => { const id = ++seq; q.set(id, { at: now + Math.max(0, ms), fn }); return id; };
  const clearTimer = (id) => { q.delete(id); };
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      let next = null;
      for (const [id, x] of q) if (x.at <= end && (!next || x.at < next[1].at)) next = [id, x];
      if (!next) break;
      q.delete(next[0]); now = next[1].at; next[1].fn();
    }
    now = end;
  }
  // the computer slept: time jumps, timers that were due fire late (all at once, as an OS does on resume)
  function jump(ms) { now += ms; for (const [id, x] of [...q].sort((a, b) => a[1].at - b[1].at)) if (x.at <= now && q.has(id)) { q.delete(id); x.fn(); } }
  return { now: () => now, setTimer, clearTimer, advance, jump, pending: () => q.size };
}
function stubBlocker(o = {}) {
  const S = { starts: [], stops: [], live: new Set(), n: 0, log: [] };
  S.start = (type) => { if (o.failStart) throw new Error('no blocker here'); const id = S.n++; S.starts.push({ id, type }); S.live.add(id); S.log.push(`start ${type}`); return id; };
  S.stop = (id) => { S.stops.push(id); S.live.delete(id); S.log.push(`stop ${id}`); if (o.failStop) throw new Error('stop failed'); };
  return S;
}

// ---------- 1. holds ----------
{
  const k = clock(); const S = stubBlocker(); const changes = [];
  const B = C.createBlocker({ start: S.start, stop: S.stop, now: k.now, setTimer: k.setTimer, clearTimer: k.clearTimer, onChange: (v) => changes.push(v) });
  check(!B.active() && B.view().text === '', 'at rest: no blocker, nothing said');
  const a = B.hold('render');
  check(B.active() && B.type() === 'prevent-app-suspension' && S.live.size === 1 && S.starts[0].id === 0, 'a render: prevent-app-suspension (the id 0 Electron gives first counts)', S.starts);
  check(B.view().text === 'Keeping your computer awake: rendering', 'the words: "Keeping your computer awake: rendering"', B.view().text);
  const b = B.hold('render'); const c = B.hold('agent');
  check(S.starts.length === 1 && S.live.size === 1, 'more holds: still one blocker (counted, not stacked)');
  check(B.view().held.find((h) => h.reason === 'render').n === 2 && B.view().text === 'Keeping your computer awake: rendering and an AI is working', 'counted per reason: render ×2, agent ×1; both said', B.view());
  B.release(a);
  check(S.live.size === 1, 'one render ends: still held');
  check(B.release(a) === false && S.live.size === 1, 'releasing the same hold twice does nothing');
  B.release(b); B.release(c);
  check(S.live.size === 0 && !B.active(), 'the last one ends: released at once');
  const r = B.hold('record');
  check(B.type() === 'prevent-display-sleep', 'a recording: the screen stays on (prevent-display-sleep)');
  S.log.length = 0;
  const x = B.hold('export');
  check(B.type() === 'prevent-display-sleep' && S.log.length === 0, 'an export during it: no change (the screen kind already keeps the computer awake)');
  B.release(r);
  check(B.type() === 'prevent-app-suspension' && S.log[0].startsWith('start prevent-app-suspension') && S.log[1].startsWith('stop'), 'the recording ends: the computer kind starts before the screen kind stops (no gap)', S.log);
  B.release(x);
  const p = B.hold('present');
  check(B.view().text === 'Keeping your screen on: presenting', 'Present: "Keeping your screen on: presenting"', B.view().text);
  B.release(p);
  // owners: a page going drops its holds only
  B.hold('render', { owner: 7 }); B.hold('export', { owner: 7 }); const keep = B.hold('agent', { owner: 3 });
  check(B.releaseOwner(7) === 2 && S.live.size === 1 && B.view().held.length === 1, 'a page that goes (reload, crash, closed) drops its own holds, not the others\'');
  B.release(keep);
  // time limits
  B.hold('update');
  k.advance(29 * 60000);
  check(S.live.size === 1, 'an update held for 29 min: still held');
  k.advance(2 * 60000);
  check(S.live.size === 0, 'never released: gone by itself after its time limit (30 min for an update)');
  B.hold('render', { ttl: 5000 }); const long = B.hold('agent');
  k.advance(6000);
  check(S.live.size === 1 && B.view().held.length === 1 && B.view().held[0].reason === 'agent', 'a hold with its own short limit goes, the others stay');
  B.release(long);
  check(k.pending() === 0, 'nothing held: no timer left waiting');
  // let it sleep
  const s1 = B.hold('render');
  check(B.allow() === 1 && S.live.size === 0 && B.view().text === '', '"let it sleep": released though the render still runs');
  B.release(s1);
  B.hold('render');
  check(S.live.size === 1, '… a new one afterwards counts again');
  B.releaseAll();
  check(S.live.size === 0 && B.holds().length === 0, 'quitting: everything released');
  check(changes.length > 5 && changes.at(-1).n === 0, 'every change is told (the window\'s ☕)', changes.length);
  check(Object.keys(C.REASONS).every((r) => C.REASONS[r].ttl > 0 && C.REASONS[r].label), 'every reason has words and a time limit');
  check(C.REASONS.present.display && C.REASONS.record.display && !C.REASONS.render.display && !C.REASONS.agent.display && !C.REASONS.download.display, 'only Present and recordings keep the screen on');
}
{
  const S = stubBlocker({ failStart: true });
  const B = C.createBlocker({ start: S.start, stop: S.stop });
  let ok = true; try { const t = B.hold('render'); B.release(t); } catch { ok = false; }
  check(ok && !B.active(), 'no blocker on this system (start throws): holds still count, nothing breaks');
  const S2 = stubBlocker({ failStop: true });
  const B2 = C.createBlocker({ start: S2.start, stop: S2.stop });
  const t2 = B2.hold('render'); ok = true; try { B2.release(t2); } catch { ok = false; }
  check(ok && !B2.active(), 'a stop that throws: still counted as released');
}
check(C.describe([{ label: 'rendering' }, { label: 'recording', display: true }, { label: 'downloading' }]) === 'Keeping your screen on: rendering, recording and downloading', 'three reasons: "rendering, recording and downloading"');

// ---------- 2. the battery policy ----------
{
  const pl = C.policy({}); const bt = C.policy({ battery: true }); const sv = C.policy({ saver: true }); const lp = C.policy({ lowPower: true, battery: false });
  check(pl.mode === 'plugged' && !pl.lite && pl.pollScale === 1 && pl.warm && pl.motion === null, 'plugged in: everything as usual', pl);
  check(bt.mode === 'battery' && bt.lite && bt.pollScale === 2 && !bt.warm && bt.motion === 'calm' && bt.labLite, 'on battery: lighter (calm motion, half-pace background, no warm preload, the Lab lighter)', bt);
  check(sv.mode === 'saver' && sv.pollScale === 3 && lp.mode === 'saver', 'battery saver / Low Power Mode (even plugged in): lighter still (a third of the pace)', { sv, lp });
  check(C.parseMacLowPower(' lowpowermode         1\n sleep 1') === true && C.parseMacLowPower(' lowpowermode 0') === false && C.parseMacLowPower('System-wide power settings:\n powermode            1') === true && C.parseMacLowPower(' powermode 0') === false && C.parseMacLowPower('nothing') === null, 'Mac: pmset -g read (lowpowermode / powermode, on / off, unknown)');
  check(C.parseWinSaver('1\r\n') === true && C.parseWinSaver('0') === false && C.parseWinSaver('') === null, 'Windows: the battery saver flag read (1 / 0 / unknown)');
  check(/GetSystemPowerStatus/.test(C.WIN_SAVER_PS) && /\$s\.F/.test(C.WIN_SAVER_PS), 'Windows: the check asks GetSystemPowerStatus\' SystemStatusFlag');
}

// ---------- 3. the timer schedule ----------
{
  check(C.delay(1000, {}) === 1000 && C.delay(1000, { battery: true }) === 2000 && C.delay(1000, { saver: true }) === 3000, 'pace: ×1 plugged, ×2 battery, ×3 saver');
  check(C.delay(1000, { hidden: true }) === 2000 && C.delay(1000, { hidden: true, battery: true }) === 4000 && C.delay(1000, { hidden: true }, { hidden: 'run' }) === 1000, 'hidden: ×2 (×4 with the battery); "run" keeps its pace');
  check(C.delay(1000, { hidden: true }, { hidden: 'skip' }) === null && C.delay(1000, { asleep: true }) === null, '"skip" waits while hidden; nothing at all while asleep');
  check(C.delay(30000, { hidden: true, battery: true }, { max: 60000 }) === 60000 && C.delay(1000, { battery: true }, { battery: false }) === 1000, 'max caps it; battery: false keeps the pace on battery');
  check(C.wakeWait({ wokeAt: 1000, now: 1000, slot: 0 }) === C.WAKE.settle && C.wakeWait({ wokeAt: 1000, now: 1000, slot: 3 }) === C.WAKE.settle + 3 * C.WAKE.stagger && C.wakeWait({ wokeAt: 0, now: 5 }) === 0, 'after a wake: the settle time, then a stagger per place in line');

  const k = clock(); let st = {};
  const S = C.createScheduler({ state: () => st, now: k.now, setTimer: k.setTimer, clearTimer: k.clearTimer });
  const runs = { a: [], b: [], c: [], u: [] };
  S.every('a', 10000, () => runs.a.push(k.now()));
  S.every('b', 60000, () => runs.b.push(k.now()), { first: 2000 });
  S.every('c', 5000, () => runs.c.push(k.now()), { hidden: 'skip' });
  S.every('u', 30 * 60000, () => runs.u.push(k.now()), { first: 25000, hidden: 'skip', wakeSettle: 60000 });
  k.advance(60000);
  check(runs.a.length === 6 && runs.b.length === 1 && runs.c.length === 12 && runs.u.length === 1, 'plugged, on screen: each at its pace (10 s ×6, a first run at 2 s, 5 s ×12, the updater 25 s in)', { a: runs.a.length, b: runs.b.length, c: runs.c.length, u: runs.u.length });
  st = { battery: true }; S.setState();
  const a0 = runs.a.length; k.advance(60000);
  check(runs.a.length - a0 === 3, 'on battery: half the pace (3 a minute instead of 6)', runs.a.length - a0);
  st = { battery: true, hidden: true }; S.setState();
  const a1 = runs.a.length; const c1 = runs.c.length; k.advance(120000);
  check(runs.a.length - a1 === 3 && runs.c.length === c1, 'battery + hidden: a quarter of the pace; "skip" ones wait', { a: runs.a.length - a1, c: runs.c.length - c1 });
  st = {}; S.setState();
  k.advance(1500);
  check(runs.c.length === c1 + 1, 'back on screen: a skipped one runs once, after a short beat (not a burst)', runs.c.length - c1);
  // asleep
  st = { asleep: true }; S.setState();
  const before = { a: runs.a.length, b: runs.b.length, c: runs.c.length, u: runs.u.length };
  k.advance(10 * 60000);
  check(runs.a.length === before.a && runs.b.length === before.b && runs.c.length === before.c && runs.u.length === before.u && k.pending() === 0, 'asleep: nothing runs, nothing waits in the queue');
  const woke = k.now();
  st = { wokeAt: woke }; S.setState();
  const list = S.list();
  check(list.every((t) => t.next >= C.WAKE.settle), 'awake: every timer waits the settle time first', list.map((t) => [t.id, t.next]));
  const firstRuns = [];
  const watch = (id) => () => firstRuns.push([id, k.now() - woke]);
  for (const id of ['a', 'b', 'c']) { const fn = runs[id]; void fn; }
  k.advance(C.WAKE.settle - 1);
  check(runs.a.length === before.a && runs.c.length === before.c, 'nothing during the settle time');
  k.advance(4 * C.WAKE.stagger);
  const at = ['a', 'b', 'c'].map((id) => runs[id].find((x) => x >= woke)).filter((x) => x != null).sort((x, y) => x - y);
  check(at.length === 3 && at.every((x, i) => i === 0 || x - at[i - 1] >= C.WAKE.stagger), 'then one at a time, a stagger apart (no burst of catch-up work)', at.map((x) => x - woke));
  check(runs.u.length === before.u, 'the updater waits its own minute after the wake', runs.u.length - before.u);
  void watch;
  // a sleep the computer didn't announce: timers fire late all at once → read as a wake, they wait their turn
  const k2 = clock(); const st2 = {}; const r2 = [];
  const S2 = C.createScheduler({ state: () => st2, now: k2.now, setTimer: k2.setTimer, clearTimer: k2.clearTimer });
  for (const id of ['x', 'y', 'z']) S2.every(id, 30000, () => r2.push([id, k2.now()]));
  k2.advance(31000);
  const n0 = r2.length;
  k2.jump(60 * 60000);
  check(r2.length === n0, 'an unannounced sleep (timers an hour late): none runs at once', r2.length - n0);
  const t0 = k2.now();
  k2.advance(C.WAKE.settle + 3 * C.WAKE.stagger);
  const late = r2.slice(n0).map(([, t]) => t - t0);
  check(late.length === 3 && late.every((x) => x >= C.WAKE.settle) && late.every((x, i) => i === 0 || x - late[i - 1] >= C.WAKE.stagger), '… they run after the settle time, one at a time', late);
  check(S2.stop('x') && !S2.list().some((t) => t.id === 'x') && !S2.stop('x'), 'stop removes a timer (once)');
  // throttled hidden pages: a minute late is normal (Chromium aligns hidden timers), not a sleep
  const k3 = clock(); const r3 = [];
  const S3 = C.createScheduler({ state: () => ({}), now: k3.now, setTimer: k3.setTimer, clearTimer: k3.clearTimer });
  S3.every('h', 30000, () => r3.push(k3.now()));
  k3.advance(29000); k3.jump(61000);
  check(r3.length === 1, 'a hidden page\'s timer a minute late still just runs (only far later counts as a sleep)', r3.length);
}

// ---------- 4. the main side ----------
(async () => {
  process.env.HEARTH_TEST_SAVE_DIR = process.env.HEARTH_TEST_SAVE_DIR || '/tmp/powerwise-test';
  const M = require(path.join(ROOT, 'powerwisemain.js'));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // the IPC as the window sees it, with a fake page (webContents) that can reload / go
  const handlers = new Map(); const ipcMain = { handle: (ch, fn) => handlers.set(ch, fn) };
  const { EventEmitter } = require('events');
  const page = Object.assign(new EventEmitter(), { id: 41 }); const other = Object.assign(new EventEmitter(), { id: 42 });
  const sent = []; const win = { isDestroyed: () => false, webContents: { send: (ch, d) => sent.push([ch, d]) }, on() {}, hide() {}, show() {}, focus() {} };
  const subs = []; const bgState = { hidden: false, battery: false, asleep: false, saver: false };
  const bgmain = { subscribe: (fn) => { subs.push(fn); fn({ ...bgState }); }, _set: (p) => { Object.assign(bgState, p); for (const fn of subs) fn({ ...bgState }); }, state: () => ({ ...bgState }) };
  M.register(ipcMain, { bgmain, getWin: () => win });
  const call = (ch, sender, ...a) => handlers.get(ch)({ sender }, ...a);
  const T = (o) => call('power:test', page, o);
  T({ stub: true });
  const live = () => T({}).stub.live.length;
  check(['power:state', 'power:hold', 'power:release', 'power:allow', 'power:test'].every((c) => handlers.has(c)), 'IPC: power:state / hold / release / allow / test');
  const tok = call('power:hold', page, 'render');
  check(live() === 1 && call('power:release', page, tok) === true && live() === 0, 'the window holds and releases through IPC');
  call('power:hold', page, 'render'); call('power:hold', page, 'record'); const kept = call('power:hold', other, 'export');
  page.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false }, 'file:///x', false, true);
  check(live() === 1 && M.state().awake.held.length === 1 && M.state().awake.held[0].reason === 'export', 'the page reloads: its holds go, another page\'s stay');
  page.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true }, 'file:///x#a', true, true);
  check(live() === 1, '… an in-page navigation (a #hash) keeps them');
  call('power:hold', page, 'render'); page.emit('render-process-gone', {}, { reason: 'crashed' });
  check(live() === 1 && M.state().awake.held.length === 1, 'the page crashes: its holds go');
  other.emit('destroyed');
  check(live() === 0, 'the page is closed: its holds go');
  call('power:release', other, kept);
  // AI turns
  process.env.HEARTH_AGENT_AWAKE_MS = '120';
  const t1 = M.turn('chat-a');
  await wait(60);
  check(live() === 0, 'an AI turn shorter than its threshold: never held');
  t1.end(); await wait(120);
  check(live() === 0, '… and nothing after it ended');
  const t2 = M.turn('chat-b'); await wait(200);
  check(live() === 1 && M.state().awake.text === 'Keeping your computer awake: an AI is working', 'a long turn: held past its threshold ("an AI is working")', M.state().awake.text);
  const t3 = M.turn('chat-c'); await wait(200);
  check(M.state().awake.held[0].n === 2 && live() === 1, 'two long turns: counted, one blocker');
  t2.end(); t2.end();
  check(live() === 1, 'one ends (twice, harmless): still held for the other');
  M.turn('chat-c'); await wait(10);
  check(live() === 0, 'a new turn in the same chat ends the previous one\'s hold (its end was never told)');
  void t3;
  M.stop?.('x');
  for (const k of ['chat-c']) M.turn(k).end();
  // downloads
  const dl = (total) => Object.assign(new EventEmitter(), { getTotalBytes: () => total, getState: () => 'progressing', getFilename: () => 'model.glb' });
  const big = dl(200 * 1024 * 1024); M.download(big);
  check(live() === 1 && /downloading model\.glb/.test(M.state().awake.text), 'a big download: held at once ("downloading model.glb")', M.state().awake.text);
  big.emit('done', {}, 'completed');
  check(live() === 0, '… released when it\'s done');
  const small = dl(3000); M.download(small);
  check(live() === 0, 'a small download: never held'); small.emit('done', {}, 'completed');
  // update
  const p = M.during('update', () => wait(80));
  check(live() === 1, 'an update: held while it runs');
  await p;
  check(live() === 0, '… released after (also when it throws)');
  await M.during('update', async () => { throw new Error('git failed'); }).catch(() => {});
  check(live() === 0, 'a failed update releases too');
  // the state the window gets
  await wait(20); sent.length = 0;
  bgmain._set({ battery: true }); await wait(20);
  const s1 = sent.filter(([ch]) => ch === 'power:state').at(-1)?.[1];
  check(s1 && s1.battery && s1.mode === 'battery' && s1.policy.pollScale === 2, 'on battery: the window is told (mode, policy)', s1);
  T({ saver: true }); await wait(20);
  check(bgState.saver === true && M.state().mode === 'saver', 'battery saver: the window and bgmain\'s listeners (sync) hear it', { bg: bgState.saver, mode: M.state().mode });
  T({ saver: false }); bgmain._set({ battery: false });
  let ran = 0; M.every('t-main', 50, () => { ran += 1; });
  await wait(130);
  const r0 = ran;
  bgmain._set({ asleep: true }); await wait(150);
  check(ran === r0 && r0 >= 1, 'main timers: run, then nothing while asleep', { r0, ran });
  bgmain._set({ asleep: false }); await wait(10);
  const lt = M._test.sched.list().find((t) => t.id === 't-main');
  check(M.state().wokeAt > 0 && lt.next >= C.WAKE.settle - 50, 'awake: the main timers wait the settle time too', lt);
  M.stop('t-main');
  T({ stub: false });
  M._test.blocker.releaseAll();

  // ---------- 5. the timers moved onto the schedule ----------
  const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const lines = (f, re) => read(f).split('\n').filter((l) => re.test(l));
  check(lines('updater.js', /setInterval\(/).every((l) => /else/.test(l)) && /Power\.every\('updater'/.test(read('updater.js')), 'the updater: on the schedule (setInterval only as the fallback)');
  check(/Power\.every\('hooks'/.test(read('hooks.js')) && lines('hooks.js', /setInterval\(tick/).every((l) => /else/.test(l)), 'hooks: on the schedule');
  check(/Power\.every\('websites'/.test(read('renderer.js')) && lines('renderer.js', /setInterval\(sleepIdleWebsites/).every((l) => /else/.test(l)), 'sleeping websites: on the schedule');
  check(/Power\.every\('lab-media'/.test(read('tools/three.js')) && /Power\.every\('lab-stall'/.test(read('tools/three.js')), 'the Lab\'s media memory and stall check: on the schedule, only on screen');
  check(/Power\.every\(pollId/.test(read('chromeview.js')), 'Chrome views\' visibility check: only on screen');
  check(/powerwise\.every\(`config-stat/.test(read('main.js')) && !/fs\.watchFile\(file, \{ interval: 5000 \}/.test(read('main.js')), 'the config safety net: on the main schedule (no 5 s stat poll per file)');
  check(/(why === 'away'|document\.hidden) && !force\) return null/.test(read('hints.js')), 'hints: no look-again every 0.7 s while Hearth is hidden');
  check(/WAKE\.sync/.test(read('syncmain.js')) && /st\.battery \|\| st\.saver/.test(read('syncmain.js')), 'sync: waits after a wake, slower on the saver too');
  check(/Power\?\.lite\?\.\(\) \? 'calm'/.test(read('look.js')), 'look.js: Full moves like Calm while lighter');
  check(/'on battery'/.test(read('tools/three-boot.js')), 'labboot: no warm page on battery');
  const idx = read('index.html');
  check(idx.indexOf('powerwise.js') > 0 && idx.indexOf('powerwise.js') < idx.indexOf('renderer.js') && idx.indexOf('powerwise.js') > idx.indexOf('hints.js'), 'index.html: powerwise.js after hints.js, before renderer.js (its timers are made at load)');

  console.log(fails ? `${fails} of ${n} failed` : `all ${n} passed`);
  process.exit(fails ? 1 : 0);
})().catch((err) => { console.log(`✗ crashed: ${err.stack}`); process.exit(1); });
