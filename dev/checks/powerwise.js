// Power-wise (round 39): Hearth keeps the computer awake only while it matters, does next to nothing in the background,
// goes lighter on battery and wakes up calmly. Electron's powerSaveBlocker is swapped for a stub that records every
// start / stop (hub.power.test, test copies only), so nothing here keeps this machine awake.
//   1. a render (Renders.track) holds 'prevent-app-suspension' and releases it when done; the ☕ in the rail says
//      "Keeping your computer awake: rendering"; All formats; a recording holds the screen on and lets go; a long AI
//      turn (fake engine, slow) holds after its threshold and lets go at the end; a big download; Hearth's update;
//      "let it sleep"; a hold past its time limit goes by itself; the page reloading drops its holds (part 2)
//   2. a simulated battery switch: html[data-power], Full motion → Calm (not saved), background timers at half pace,
//      the Lab told, the bgmain listeners (sync) told, one calm note through Hints; plugged in: all back; the saver
//   3. sleep / resume: timers paused while asleep (none run), after the wake they wait the settle time and go one at a
//      time (no burst), the updater waits ≥ 60 s, the main process' timers too
//   4. background wakeups: the Lab opened then left, the window hidden; timer callbacks per minute in the page and in
//      the main process (counters installed before the app's scripts) against a budget, then the same on battery
//   node dev/smoke.js --fake-engines --check-timeout 400000 --lib dev/checks/journey-lib.js --script dev/checks/powerwise.js
// the page's timer counter (before the app's own scripts: the reload below), and Electron's blocker swapped for a stub
const probe = () => {
  if (window.__pwProbe) return;
  const P = window.__pwProbe = { n: 0, by: new Map(), since: performance.now(), raw: { setTimeout: window.setTimeout.bind(window) } };
  const site = () => {
    const s = String(new Error().stack || '').split('\n').slice(3);
    const l = s.find((x) => /\.(js|html)/.test(x)) || s[0] || '?';
    return l.trim().replace(/^at\s+/, '').replace(/\(?[^()]*\/([^/]+\.(?:js|html)):(\d+):\d+\)?/, '$1:$2').slice(0, 90);
  };
  const count = (k) => { P.n += 1; P.by.set(k, (P.by.get(k) || 0) + 1); };
  for (const [name, kind] of [['setTimeout', 'timeout'], ['setInterval', 'interval'], ['requestAnimationFrame', 'raf'], ['requestIdleCallback', 'idle']]) {
    const orig = window[name];
    if (!orig) continue;
    window[name] = function (fn, ...rest) {
      if (typeof fn !== 'function') return orig.call(window, fn, ...rest);
      const k = `${kind} ${site()}`;
      return orig.call(window, function (...a) { count(k); return fn.apply(this, a); }, ...rest);
    };
  }
  P.take = () => {
    const ms = performance.now() - P.since;
    const per = (x) => Math.round(x * 600000 / ms) / 10;
    const out = { seconds: Math.round(ms / 100) / 10, n: P.n, perMin: per(P.n), top: [...P.by].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${per(v)}/min ${k}`) };
    P.n = 0; P.by.clear(); P.since = performance.now();
    return out;
  };
};
await smoke({ cdp: 'Page.addScriptToEvaluateOnNewDocument', params: { source: `(${probe.toString()})();` } });
await window.hub.power.test({ stub: true });
return 'probe installed, blocker stubbed';
//@@ reload
const { step, wait, until } = J;
const T = (o) => window.hub.power.test(o);
const live = async () => (await T({})).stub?.live || [];
const lastType = async () => { const s = (await T({})).stub; const id = s?.live?.at(-1); return s?.starts.find((x) => x.id === id)?.type || null; };
const dot = () => document.getElementById('pw-awake');
const dotOn = () => Boolean(dot() && !dot().hidden);
step('the probe is in and the blocker is a stub', Boolean(window.__pwProbe) && Boolean((await T({})).stub), (await T({})).stub);
step('at rest nothing keeps the computer awake (no blocker, no ☕)', (await live()).length === 0 && !dotOn());

// ---------- 1. holds ----------
await Lazy.load('renders');
let job = Renders.track({ kind: 'seq', title: '▤ power test', pk: 'pw-test', quiet: true });
await until(async () => (await live()).length === 1, 5000);
step('a render holds the blocker: prevent-app-suspension', (await live()).length === 1 && (await lastType()) === 'prevent-app-suspension', await T({}));
await until(() => dotOn(), 3000);
step('… the ☕ shows in the rail: "Keeping your computer awake: rendering"', dotOn() && dot().title === 'Keeping your computer awake: rendering', dot()?.title);
await smoke({ shot: '/tmp/powerwise-awake.png' });
const r1 = dot().getBoundingClientRect();
step('… it sits in the rail\'s status corner, small', r1.width <= 34 && r1.height <= 24 && r1.left < 80, JSON.stringify(r1));
job.done('/tmp/power-test.mp4');
await until(async () => (await live()).length === 0, 5000);
step('done: released at once (stub stopped, nothing live)', (await live()).length === 0 && (await T({})).stub.stops.length >= 1);
await until(() => !dotOn(), 3000);
step('… the ☕ goes', !dotOn());

job = Renders.track({ kind: 'export', title: '▦ All formats · test', pk: 'pw-formats', quiet: true, again: { type: 'cmd', line: '/all-formats' } });
const job2 = Renders.track({ kind: 'seq', title: '▤ second', pk: 'pw-two', quiet: true });
await until(() => dotOn() && /all formats/.test(dot().title), 3000);
step('two at once: one blocker, both reasons said ("rendering all formats and rendering"… counted per reason)', (await live()).length === 1 && /rendering all formats/.test(dot().title) && /rendering/.test(dot().title), dot()?.title);
job.cancelled();
await wait(400);
step('one ends: still held for the other', (await live()).length === 1);
job2.fail('boom');
await until(async () => (await live()).length === 0, 5000);
step('a failed render releases too', (await live()).length === 0);

document.dispatchEvent(new CustomEvent('hearth:recording', { detail: { recording: true } }));
await until(async () => (await live()).length === 1, 5000);
step('a recording keeps the screen on: prevent-display-sleep', (await lastType()) === 'prevent-display-sleep', await T({}));
await until(() => dotOn(), 2000);
step('… the ☕ says "Keeping your screen on: recording"', dot()?.title === 'Keeping your screen on: recording', dot()?.title);
const holdR = Power.hold('render');
await until(async () => (await T({})).state.awake.held.length === 2, 3000);
step('recording + render: still one blocker, the screen kind', (await live()).length === 1 && (await lastType()) === 'prevent-display-sleep');
document.dispatchEvent(new CustomEvent('hearth:recording', { detail: { recording: false, path: '' } }));
await until(async () => (await lastType()) === 'prevent-app-suspension', 3000);
step('the recording ends: the screen may sleep again, the computer stays awake for the render (new kind started before the old stopped)', (await live()).length === 1 && (await lastType()) === 'prevent-app-suspension');
holdR();
await until(async () => (await live()).length === 0, 3000);
step('… and the render ends: nothing held', (await live()).length === 0);

// a long AI turn (the fake engine's "slow" reply, a few seconds; the threshold set to 0.7 s for the test)
await T({ agentMs: 700 });
const claude = H.claudeAgent();
activate(claude.id); await wait(300); Native.newChat(claude.id); await wait(200);
await Native.send(claude.id, 'slow long please'); // (a long reply streamed slowly: minutes, stopped below)
await wait(250);
step('a short moment into an AI turn: nothing held yet', (await live()).length === 0);
await until(async () => (await live()).length === 1, 6000);
const st1 = await T({});
step('the turn goes past its threshold: held ("an AI is working")', (await live()).length === 1 && st1.state.awake.held.some((h) => h.reason === 'agent'), st1.state.awake.text);
const chatIdle = () => until(() => !Native.isAgentBusy(claude.id) && !Native.isBusy(H.activeChat[claude.id]), 60000);
Native.stop(claude.id); // (■ Stop: the engine's 'stopped' ends the turn)
await chatIdle(); await wait(500);
await until(async () => (await live()).length === 0, 4000);
step('the turn is stopped: released', (await live()).length === 0);
await T({ agentMs: 200 });
await Native.send(claude.id, 'slow please');
const heldDone = await until(async () => (await live()).length === 1, 3000);
await chatIdle(); await wait(400);
step('a turn that ends by itself (done): held past its threshold, released at the end', heldDone && (await live()).length === 0);
await T({ agentMs: 45000 });
const nStarts = (await T({})).stub.starts.length;
await Native.send(claude.id, 'a quick one');
await wait(300); await chatIdle(); await wait(300);
step('a short turn never touches the blocker', (await T({})).stub.starts.length === nStarts);

await T({ download: { total: 80 * 1024 * 1024, ms: 1200 } });
await until(async () => (await live()).length === 1, 2000);
step('a big download holds ("downloading …")', (await live()).length === 1 && /downloading/.test((await T({})).state.awake.text), (await T({})).state.awake.text);
await until(async () => (await live()).length === 0, 4000);
step('… and lets go when it\'s done', (await live()).length === 0);
await T({ download: { total: 1000, ms: 800 } });
await wait(400);
step('a small download doesn\'t', (await live()).length === 0);
await T({ update: 1200 });
await until(async () => (await live()).length === 1, 2000);
step('Hearth\'s own update holds ("updating Hearth")', /updating Hearth/.test((await T({})).state.awake.text));
await until(async () => (await live()).length === 0, 4000);
step('… and lets go after', (await live()).length === 0);

const holdA = Power.hold('render');
await until(async () => (await live()).length === 1, 3000);
await Power.allow();
await until(async () => (await live()).length === 0, 3000);
step('"Let the computer sleep anyway" (☕ menu, /power sleep): released though the render runs on', (await live()).length === 0 && !dotOn());
holdA();
await wait(300);
step('… and the render ending later changes nothing', (await live()).length === 0);

await T({ hold: 'render', ttl: 900 });
await until(async () => (await live()).length === 1, 2000);
await until(async () => (await live()).length === 0, 5000);
step('a hold that is never released goes by itself after its time limit', (await live()).length === 0);

// reload with a hold from the page: the main process drops it (part 2 checks)
Power.hold('export');
await until(async () => (await live()).length === 1, 3000);
return J.done();
//@@ reload
const { step, wait, until } = J;
const T = (o) => window.hub.power.test(o);
const live = async () => (await T({})).stub?.live || [];
step('after a page reload, its holds are gone (the page that asked went)', (await live()).length === 0, await T({}));

// ---------- 2. battery ----------
const root = document.documentElement;
const motion0 = root.getAttribute('data-motion') || '';
const every0 = Power.timers().find((t) => t.id === 'updater')?.every;
await T({ battery: true });
await until(() => root.dataset.power === 'battery', 4000);
step('on battery: <html data-power="battery">, the mode is "battery"', root.dataset.power === 'battery' && Power.state().mode === 'battery');
step('… Full motion moves like Calm (ambient loops stop), not saved', root.getAttribute('data-motion') === 'calm' && (H.config.theme?.fx?.motion || 'full') !== 'calm', { motion0, now: root.getAttribute('data-motion'), saved: H.config.theme?.fx?.motion });
const ev1 = Power.timers();
step('… the window\'s background checks at half pace (updater every 60 min)', ev1.some((t) => t.id === 'updater') ? ev1.find((t) => t.id === 'updater').every === 2 * every0 : false, ev1);
const bg1 = await window.hub.bgState();
step('… the main process\' listeners hear it (sync, now playing, app windows: bgmain battery)', bg1.battery === true, { battery: bg1.battery, sync: bg1.sync });
const mt = (await T({ timers: true })).timers;
step('… the main process\' own timers at half pace (the config safety net every 20 s)', mt.some((t) => /config-stat/.test(t.id) && t.every === 20000), mt);
Hints.flush?.();
await until(() => [...document.querySelectorAll('#toasts .toast')].some((t) => /On battery/.test(t.textContent)), 5000);
step('… one calm note through Hints, the first time', [...document.querySelectorAll('#toasts .toast')].some((t) => /On battery: Hearth goes lighter/.test(t.textContent)), Hints.state().log.slice(-3));
await smoke({ shot: '/tmp/powerwise-battery.png' });
await T({ battery: false });
await until(() => !root.dataset.power, 4000);
step('plugged in: everything back (no data-power, motion as set, timers at their pace)', !root.dataset.power && (root.getAttribute('data-motion') || '') === motion0 && Power.timers().find((t) => t.id === 'updater')?.every === every0, { motion: root.getAttribute('data-motion'), every: Power.timers().find((t) => t.id === 'updater')?.every });
await T({ battery: true }); await wait(800);
step('on battery again: the note doesn\'t come twice', Hints.state().log.filter((l) => l.id === 'power:battery' && l.what === 'show').length <= 1);
await T({ battery: false });
await T({ saver: true });
await until(() => root.dataset.power === 'saver', 4000);
step('battery saver / Low Power Mode (even plugged in): "saver", background checks at a third of the pace', root.dataset.power === 'saver' && Power.timers().find((t) => t.id === 'updater')?.every === 3 * every0 && (await window.hub.bgState()).saver === true);
await T({ saver: false });
await until(() => !root.dataset.power, 4000);

// ---------- 3. sleep / resume ----------
let runs = 0;
Power.every('pw-test', 1500, () => { runs += 1; });
await until(() => runs >= 1, 4000);
await T({ sleep: 'suspend' });
await until(() => Power.state().asleep, 3000);
const r0 = runs;
await wait(3500);
step('asleep: no background timer runs (paused, not queued up)', runs === r0 && Power.timers().every((t) => t.every == null), Power.timers());
const mainAsleep = (await T({ timers: true })).timers;
step('… the main process\' timers too', mainAsleep.every((t) => t.every == null), mainAsleep);
const woke = Date.now();
await T({ sleep: 'resume' });
await until(() => !Power.state().asleep && Power.state().wokeAt > 0, 3000);
const after = Power.timers();
const lineUp = after.filter((t) => t.next != null).map((t) => t.next).sort((a, b) => a - b);
step('awake: every timer waits the settle time (≥ 15 s), none runs at once', after.every((t) => t.next == null || t.next >= 15000), after);
step('… then one at a time, a few seconds apart (no burst of catch-up work)', lineUp.every((v, i) => i === 0 || v - lineUp[i - 1] >= 3000), lineUp);
step('… the updater waits at least a minute after the wake', (after.find((t) => t.id === 'updater')?.next ?? 60000) >= 59000, after.find((t) => t.id === 'updater'));
const mainAfter = (await T({ timers: true })).timers;
step('… the main process\' timers wait their turn too', mainAfter.every((t) => t.next == null || t.next >= 15000), mainAfter);
await wait(2500);
step('… 2.5 s after the wake: still nothing ran', runs === r0, { runs, r0, sinceWake: Date.now() - woke });
Power.stop('pw-test');

// ---------- 4. background wakeups ----------
const P = window.__pwProbe; const sleep = (ms) => new Promise((r) => P.raw.setTimeout(r, ms));
activate('tool:three'); await ThreeLab.cmd?.();
await until(() => ThreeLab.scenes && ThreeLab.director, 30000); await wait(3000);
activate(H.claudeAgent().id); await wait(1500);
const MEASURE = Number(localStorage.getItem('pw.measureMs')) || 60000;
// (the start's one-off work done first: the recall index builds itself ≈ 45 s after the start, the first checks)
await until(() => performance.now() > 100000, 120000);
async function measure(label) {
  await T({ window: 'hide' });
  await until(() => document.hidden, 5000);
  await sleep(10000); // (what was already on its way when it went: let it land)
  P.take(); await T({ probe: 'start' });
  await sleep(MEASURE);
  const page = P.take(); const main = (await T({ probe: 'take' })).probe;
  await T({ window: 'show' });
  await until(() => !document.hidden, 5000);
  return { label, hidden: true, page, main };
}
const bgPlugged = await measure('background, plugged in');
await T({ battery: true }); await wait(500);
const bgBattery = await measure('background, on battery');
await T({ battery: false });
console.log('[PW]', JSON.stringify({ bgPlugged, bgBattery }));
const BUDGET = { page: 6, main: 12 }; // (measured: 1 and 4–6 a minute; before this round 48 and 24 stat polls)
step(`in the background the page wakes ≤ ${BUDGET.page}×/min (timers, frames, idle callbacks)`, bgPlugged.page.perMin <= BUDGET.page, bgPlugged.page);
step(`… the main process ≤ ${BUDGET.main} timers/min, no stat polling`, bgPlugged.main.perMin <= BUDGET.main && bgPlugged.main.statPollsPerMin === 0, bgPlugged.main);
step('on battery in the background: no more than plugged in', bgBattery.page.perMin <= Math.max(BUDGET.page, bgPlugged.page.perMin + 2) && bgBattery.main.perMin <= Math.max(BUDGET.main, bgPlugged.main.perMin + 2), bgBattery);
await T({ stub: false });
J.out.wakeups = { bgPlugged, bgBattery };
return J.done();
