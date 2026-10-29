// (round 83, idleburst83) A calm start (lazy.js): what you do first gets the computer. After the first screen, the
// asap groups (the Lab, the chat's own commands…) and the work keeper (safetynet) load at once as before; every other
// 'soon' group waits until the start is over (10 s after the first screen) and nothing was typed / clicked / scrolled
// for 3 s (30 s at most), then loads one at a time, ≥ 120 ms apart. Using a feature still loads its group at once.
// Run WITHOUT smoke.js' lazy wait (that wait opens the gate: Lazy.calmNow()), from a reload so the clock is fresh:
//   node dev/smoke.js --fake-engines --no-lazy-wait --wait 200 --check-timeout 180000 --script dev/checks/calmstart.js
// Checks (from the reload): 1. the early groups in, the others still waiting 4 s after the first screen;
// 2. a waiting group's global used → its group loads at once; 3. keys pressed every second until 12 s → still waiting
// at 12 s, the gate opens ≈ 3 s after the last key; 4. every 'soon' group in by 30 s, the waiting ones ≥ 100 ms apart,
// in idle time (no long task over 120 ms from them); 5. Lazy.calm() reports the gate.
'reload next';
//@@ reload
const T0 = performance.now();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 50) => { const t = performance.now(); while (performance.now() - t < ms) { try { const v = fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const out = { ok: [], bad: [] };
const check = (what, ok, detail = '') => (ok ? out.ok : out.bad).push(`${what}${detail ? `: ${detail}` : ''}`);
const longs = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch { /* none */ }
await until(() => performance.getEntriesByName('hearth:ready').length, 20000);
const ready = performance.getEntriesByName('hearth:ready')[0]?.startTime || 0;
const st = () => Lazy.state().filter((g) => g.tier === 'soon');
const META = Object.fromEntries(((typeof LazyData !== 'undefined' ? LazyData : window.LazyData)?.GROUPS || []).map((g) => [g.name, g]));
check('the groups are known', Object.keys(META).length > 20, String(Object.keys(META).length));
const early = (g) => META[g.name]?.asap || g.name === 'safetynet';
check('the check starts within 3 s of the first screen', performance.now() - ready < 3000, `${Math.round(performance.now() - ready)} ms (reload at ${Math.round(T0)})`);

// 1. early groups in, the others waiting
await until(() => st().filter(early).every((g) => g.state === 'loaded'), 8000);
const at4 = ready + 4000; if (performance.now() < at4) await wait(at4 - performance.now());
const s1 = st();
const earlyIn = s1.filter(early); const waiting = s1.filter((g) => !early(g) && g.state === 'stub');
check('the asap groups and safetynet are in', earlyIn.every((g) => g.state === 'loaded'), earlyIn.filter((g) => g.state !== 'loaded').map((g) => g.name).join(' '));
check('the other soon groups still wait 4 s after the first screen', waiting.length >= 20, `${waiting.length} waiting of ${s1.filter((g) => !early(g)).length} (loaded: ${s1.filter((g) => !early(g) && g.state !== 'stub').map((g) => g.name).join(' ')})`);
check('Lazy.calm() says the gate is shut', Lazy.calm?.().open === false, JSON.stringify(Lazy.calm?.()));

// 2. a waiting group's global → loaded at once
const pick = waiting.find((g) => (META[g.name]?.globals || []).length && !(META[g.name]?.after || []).length);
if (pick) {
  const name = META[pick.name].globals[0]; const t = performance.now();
  void window[name]; // (a stand-in global: touching it asks for its group)
  const got = await until(() => Lazy.loaded(pick.name), 5000, 20);
  check('using a waiting feature loads it at once', Boolean(got) && performance.now() - t < 3000, `${pick.name} via ${name} in ${Math.round(performance.now() - t)} ms`);
} else check('a waiting group with a global to use', false, waiting.map((g) => g.name).join(' '));

// 3. keys keep the gate shut; it opens ≈ 3 s after the last one
let lastKey = 0;
while (performance.now() < ready + 12000) {
  await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'rawKeyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 } });
  await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 } });
  lastKey = performance.now();
  await wait(900);
}
check('still waiting while keys are pressed (12 s in)', Lazy.calm?.().open === false, JSON.stringify(Lazy.calm?.()));
const opened = await until(() => Lazy.calm?.().open, 9000, 50);
const openedAt = performance.now();
check('the gate opens ≈ 3 s after the last key', Boolean(opened) && openedAt - lastKey >= 2700 && openedAt - lastKey < 5500, `${Math.round(openedAt - lastKey)} ms after it`);

// 4. every soon group in by 30 s, the waiting ones spaced, no long task from them
await until(() => st().every((g) => g.state === 'loaded' || g.state === 'failed'), Math.max(1000, ready + 30000 - performance.now()), 100);
const s4 = st();
check('every soon group in by 30 s', s4.every((g) => g.state === 'loaded'), s4.filter((g) => g.state !== 'loaded').map((g) => `${g.name}:${g.state}`).join(' '));
const late = s4.filter((g) => !early(g) && g.at > openedAt - 50 && g.ms != null).map((g) => ({ name: g.name, start: g.at - g.ms, end: g.at })).sort((a, b) => a.start - b.start);
let tight = []; for (let i = 1; i < late.length; i++) if (late[i].start - late[i - 1].end < 80) tight.push(`${late[i - 1].name}→${late[i].name} ${Math.round(late[i].start - late[i - 1].end)}ms`);
check('the waiting groups load one at a time, spaced', late.length >= 5 && tight.length <= Math.ceil(late.length * 0.15), `${late.length} after the gate; too close: ${tight.slice(0, 6).join(', ')}`);
const bigLong = longs.filter(([s, d]) => s > openedAt && d > 120);
check('no long task over 120 ms while they load', bigLong.length === 0, bigLong.map(([s, d]) => `+${Math.round(s - ready)}:${d}`).join(' '));
out.timeline = { ready: Math.round(ready), opened: Math.round(openedAt - ready), lastKey: Math.round(lastKey - ready), groups: late.map((g) => `${g.name}@${Math.round(g.start - ready)}`).join(' ') };
out.pass = out.bad.length === 0;
return JSON.stringify(out, null, 1);
