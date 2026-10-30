// (round 93, perf93) The "fresh start" half of dev/perfguard.js (part `fresh`): one launch of Hearth on the heavy profile
// with one GIANT chat (dev/bigprofile.js --projects 40 --giant 1: 6,000 messages, as bigchat84), NOT touched after the
// start until the idle counts are done — what the owner gets when he opens Hearth and leaves it, then comes back:
//   fresh.memWindow / memMain / memStore   ≈ 30 s after the start: the window's JS heap, the main process's and the
//                      store thread's (after a full GC each; MB). The store thread's needs power:test { threadMem }
//                      (round 91): an older base has none (that row is then "base: —")
//   fresh.idle1* / idle5*   % of one CPU over 10 s at 1 min (65–75 s after the window opened: past the look's one-minute
//                      hush) and at 5 min (300–310 s): every process, the main process, the window
//   fresh.settings     AppUI.openSettings() → the dialog open and drawn (the first open loads its lazy group); twin: the
//                      window thread's CPU · fresh.settingsAgain: closed, then opened again
//   fresh.labFirst     the Lab's first start: its button pressed → the preview drawing its first frame (__labPace); twin:
//                      the window thread's CPU · fresh.labShown: → the preview frame on screen
//   fresh.bigChat      the giant chat opened (Native.open) → its last message drawn; twin: the window thread's CPU
//   fresh.keyPaint     typing in the giant chat's box: a key's event → the next frame presented after it (rAF + a
//                      message: "after paint"); twin fresh.keyCpu: the window thread's CPU per key
// The result is written to <SMOKE_TMP>/perfguard-fresh.json.
//   node dev/smoke.js --fake-engines --no-lazy-wait --data /tmp/hearth-perf93-fresh --wait 500 --check-timeout 900000 --script dev/perfguard-fresh.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, what, ms = 30000, step = 25) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } throw Error(`timed out: ${what}`); };
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(15000)]);
const R = { samples: {}, notes: {}, problems: [] };
const add = (k, v) => { if (Number.isFinite(v)) (R.samples[k] ||= []).push(Math.round(v * 10) / 10); };
const med = (a) => { const v = a.filter(Number.isFinite).sort((x, y) => x - y); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const SCALE = Number(window.PF93_SCALE) || 1; // (debugging the probe: --eval "window.PF93_SCALE = 0.15" shortens the waits)
const at = async (sec) => { const left = sec * 1000 * SCALE - performance.now(); if (left > 0) await wait(left); };
await cdp('Performance.enable');
const thr = async () => { const m = (await cdp('Performance.getMetrics'))?.metrics || []; const v = m.find((x) => x.name === 'ThreadTime')?.value; return Number.isFinite(v) ? v * 1000 : NaN; };
const section = async (name, fn) => { const t0 = Date.now(); try { await fn(); } catch (err) { R.problems.push(`${name}: ${String(err?.message || err).slice(0, 300)}`); } R.notes[`${name}Secs`] = Math.round((Date.now() - t0) / 100) / 10; };
window.hub.openExternal = () => {};
await until(() => typeof H !== 'undefined' && H.agents().length > 0 && document.querySelector('#agent-buttons .space-button'), 'app', 60000);
R.notes.startedAt = Math.round(performance.now());
// the pointer off the window, nothing focused: nobody here
await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 2, y: 990 }); document.activeElement?.blur?.();

// ---------- memory ≈ 30 s after the start ----------
await at(30);
await section('memory', async () => {
  await cdp('HeapProfiler.collectGarbage'); await wait(300); await cdp('HeapProfiler.collectGarbage'); await wait(300);
  const h = await cdp('Runtime.getHeapUsage'); add('fresh.memWindow', (h?.usedSize ?? NaN) / 1048576);
  const lr = (await window.hub.power.test({ longrun: {} }).catch(() => null))?.longrun; add('fresh.memMain', (lr?.heap ?? NaN) / 1048576);
  R.notes.mainRssMB = lr?.rss ? Math.round(lr.rss / 1048576) : null; R.notes.procsMB = lr?.procs || null;
  const tm = (await window.hub.power.test({ threadMem: {} }).catch(() => null))?.threadMem;
  const store = tm?.store ?? tm?.threads?.store ?? (Number.isFinite(tm?.heap) ? tm : null);
  if (store && Number.isFinite(store.heap)) add('fresh.memStore', store.heap / 1048576);
  R.notes.threadMem = tm ? JSON.stringify(tm).slice(0, 400) : 'none (no power:test threadMem in this build)';
});

// ---------- idle: at 1 min and at 5 min, nobody touching it ----------
const met = async () => (await window.hub.power.test({ metrics: true }))?.metrics || { procs: [], pages: [] };
const isWin = (m, pid) => m.pages.some((p) => p.pid === pid && p.type === 'window' && /index\.html/.test(p.url));
const span = async (key) => {
  const m0 = await met(); const t0 = performance.now(); await wait(10000); const m1 = await met(); const sec = (performance.now() - t0) / 1000;
  if (!m1.procs.length) throw Error('no process numbers (power.test metrics)');
  let win = 0; let all = 0; let main = 0; const by = {};
  for (const p1 of m1.procs) {
    const p0 = m0.procs.find((x) => x.pid === p1.pid); if (!p0 || p1.cpuS == null) continue;
    const pct = ((p1.cpuS - p0.cpuS) / sec) * 100; all += pct;
    if (isWin(m1, p1.pid)) win += pct; if (p1.type === 'Browser') main += pct;
    const pg = m1.pages.find((x) => x.pid === p1.pid); const k = isWin(m1, p1.pid) ? 'window' : p1.type === 'Browser' ? 'main' : pg ? String(pg.url).split('/').pop().slice(0, 30) : p1.type;
    by[k] = Math.round(((by[k] || 0) + pct) * 100) / 100;
  }
  add(`fresh.${key}All`, all); add(`fresh.${key}Main`, main); add(`fresh.${key}Window`, win);
  R.notes[`${key}Procs`] = by; R.notes[`${key}Threads`] = m1.threads || null;
};
await at(65); await section('idle1', () => span('idle1'));
await at(300); await section('idle5', () => span('idle5'));

// ---------- Settings: the first open, then again ----------
await section('settings', async () => {
  const claude = H.claudeAgent(); activate(claude.id); await wait(500);
  const open = async (k) => {
    await frame(); const c0 = await thr(); const t0 = performance.now();
    await AppUI.openSettings();
    await until(() => document.querySelector('dialog.settings-dialog[open]'), 'settings open', 15000, 5); await frame();
    add(`fresh.${k}`, performance.now() - t0); add(`fresh.${k}Cpu`, (await thr()) - c0);
    await wait(600); document.querySelector('dialog.settings-dialog[open]')?.close(); await wait(800);
  };
  await open('settings'); await open('settingsAgain');
});

// ---------- the Lab's first start ----------
await section('lab', async () => {
  const drawn = async () => (await smoke({ target: 'three-sandbox', cdp: 'Runtime.evaluate', params: { expression: 'window.__labPace?.state()?.drawn', returnByValue: true } }))?.result?.value;
  const frameOn = () => document.querySelector('.surface[data-id="tool:three"] .three-preview .three-frame')?.checkVisibility?.({ visibilityProperty: true });
  R.notes.labBefore = window.LabBoot?.state ? JSON.stringify(LabBoot.state()).slice(0, 200) : null;
  await frame(); const c0 = await thr(); const t0 = performance.now(); let shown = null;
  activate('tool:three');
  await until(async () => { if (shown == null && frameOn()) shown = performance.now() - t0; const n = shown != null ? await drawn().catch(() => null) : null; return n > 0; }, 'the Lab drawing', 60000, 20);
  add('fresh.labFirst', performance.now() - t0); add('fresh.labShown', shown); add('fresh.labFirstCpu', (await thr()) - c0);
  await wait(2000);
});

// ---------- the giant chat, then typing in it ----------
await section('bigchat', async () => {
  const claude = H.claudeAgent(); const ID = 'claude-giant0';
  activate(claude.id); await wait(1500);
  if (!(H.chats || []).some((c) => c.id === ID)) throw Error('the giant chat is not in the list');
  const list = () => Native.view(claude.id)?.list;
  await frame(); const c0 = await thr(); const t0 = performance.now();
  Native.open(claude.id, ID);
  await until(() => H.activeChat[claude.id] === ID && list()?.querySelector('.msg[data-index="5999"]'), 'the giant chat drawn', 60000, 5); await frame();
  add('fresh.bigChat', performance.now() - t0); add('fresh.bigChatCpu', (await thr()) - c0);
  await wait(3000);
  const box = Native.view(claude.id)?.input; if (!box) throw Error('no chat box');
  box.focus(); await wait(300);
  // key → paint: from the key's event to the first frame presented after it (requestAnimationFrame, then a message
  // posted from it, which runs once that frame is out)
  const afterPaint = () => new Promise((r) => requestAnimationFrame(() => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(performance.now()); ch.port2.postMessage(0); }));
  const text = 'the fog in the intro, bass drop'; const k0 = await thr();
  for (const ch of text) {
    let ev = null; let painted = null;
    const on = (e) => { if (ev == null) { ev = e.timeStamp; painted = afterPaint(); } };
    addEventListener('keydown', on, { capture: true, once: true });
    const p = ch === ' ' ? { key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32 } : { key: ch, code: /[a-z]/.test(ch) ? `Key${ch.toUpperCase()}` : 'Comma', text: ch, windowsVirtualKeyCode: ch.toUpperCase().charCodeAt(0) };
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', ...p }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: p.key, code: p.code, windowsVirtualKeyCode: p.windowsVirtualKeyCode });
    if (painted) add('fresh.keyPaint', (await painted) - ev); else removeEventListener('keydown', on, { capture: true });
    await wait(60);
  }
  add('fresh.keyCpu', ((await thr()) - k0) / text.length);
  R.notes.typed = box.value.length;
  box.value = ''; box.dispatchEvent(new Event('input', { bubbles: true }));
});
R.medians = Object.fromEntries(Object.entries(R.samples).map(([k, v]) => [k, med(v)]));
await window.hub.fs.write(`${window.SMOKE_TMP}/perfguard-fresh.json`, JSON.stringify(R, null, 1));
return JSON.stringify({ medians: R.medians, notes: R.notes, problems: R.problems });
