// (round 29, fastboot) A faster start, kept honest:
//   1. a normal start: nothing peeks at a lazy feature while the first screen is built (Lazy.misses), every group loads
//      after the window's first frame, the command bar and Flows are among the groups that load after it, the main
//      process answers through the modules it now loads on first use (renders, updater, assets, hooks)
//   2. every group held back (localStorage lazy.hold): Ctrl/⌘+; opens the command bar, Ctrl/⌘+Shift+F opens Flows,
//      /help opens the help view, each loading its group first; a feature hook (makes / progress cards) still lands
//   node dev/smoke.js --script dev/checks/fastboot.js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await sleep(50); } return false; };
const out = { ok: [], bad: [] };
const check = (what, ok, detail = '') => (ok ? out.ok : out.bad).push(`${what}${detail ? `: ${detail}` : ''}`);
await until(() => Lazy.state().every((g) => g.tier === 'use' || g.state === 'loaded'), 20000);
const paint = performance.getEntriesByName('first-paint')[0]?.startTime ?? performance.getEntriesByName('first-contentful-paint')[0]?.startTime;
const ready = performance.getEntriesByName('hearth:ready')[0]?.startTime;
check('no lazy global touched while the first screen was built', !Lazy.misses().some((m) => m.at <= (paint ?? ready)), JSON.stringify(Lazy.misses().slice(0, 3)));
// (a group starts after the first frame, or 0.3 s after the first screen when the frame is slow to come: software GL)
const gate = Math.min(paint ?? Infinity, ready + 290);
const early = Lazy.state().filter((g) => typeof g.at === 'number' && g.at - (g.ms || 0) < gate - 5);
check('every group starts loading after the first frame', Number.isFinite(gate) && !early.length, `ready ${Math.round(ready)} · first paint ${Math.round(paint)} ms · ${early.map((g) => `${g.name}@${g.at - g.ms}`).join(' ')}`);
check('the command bar and Flows load after the first screen', ['cmdbar', 'flows'].every((n) => Lazy.loaded(n)) && typeof CmdBar !== 'undefined' && typeof FlowsUI !== 'undefined');
const first = [...document.querySelectorAll('script[src]')].filter((s) => !/lazy-at\.js/.test(s.src) && s.defer).length;
check('first-screen scripts', first <= 72, `${first} (index.html, without the lazy-at.js tags)`);
const r = await window.hub.renders.pause('nope').catch((err) => ({ error: err.message }));
const u = await window.hub.update.status({ quick: true }).catch((err) => ({ error: err.message }));
const a = await window.hub.assets.status().catch((err) => ({ error: err.message }));
const h = await window.hub.hooks.watch([]).catch((err) => ({ error: err.message }));
check('renders / updater / assets / hooks answer from modules loaded on first use', r?.ok === false && !/no handler/i.test(r?.error || 'x?') && u && !u.error && a && !a.error && !(h && h.error),
  `${JSON.stringify(r)} ${JSON.stringify(u).slice(0, 60)} ${JSON.stringify(a).slice(0, 60)} ${JSON.stringify(h)}`);
localStorage.setItem('fastboot.out', JSON.stringify(out));
localStorage.setItem('lazy.hold', '1');
return 'phase 1 done';
//@@ reload
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await sleep(50); } return false; };
const out = JSON.parse(localStorage.getItem('fastboot.out') || '{"ok":[],"bad":[]}');
const check = (what, ok, detail = '') => (ok ? out.ok : out.bad).push(`${what}${detail ? `: ${detail}` : ''}`);
localStorage.removeItem('lazy.hold'); localStorage.removeItem('fastboot.out');
await until(() => performance.getEntriesByName('hearth:ready').length);
await sleep(500);
check('held: cmdbar and flows are stand-ins', !Lazy.loaded('cmdbar') && !Lazy.loaded('flows'), JSON.stringify(Lazy.state().filter((g) => ['cmdbar', 'flows'].includes(g.name))));
check('held: their commands are listed', ['every', 'macro', 'flows', 'timers'].every((n) => Commands.get(n)), ['every', 'macro', 'flows', 'timers'].filter((n) => !Commands.get(n)).join(' '));
document.body.focus();
document.dispatchEvent(new KeyboardEvent('keydown', { key: ';', code: 'Semicolon', ctrlKey: true, bubbles: true, cancelable: true }));
const barOk = await until(() => Lazy.loaded('cmdbar') && CmdBar.isOpen(), 8000);
check('Ctrl+; before the command bar is in: it loads and opens', barOk, JSON.stringify(Lazy.state().find((g) => g.name === 'cmdbar')));
if (barOk) CmdBar.close();
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', code: 'KeyF', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
const flOk = await until(() => Lazy.loaded('flows') && (document.querySelector('dialog[open]') || (typeof CmdPage !== 'undefined' && document.querySelector('.cmdpage, [data-id="tool:commands"]'))), 8000);
check('Ctrl+Shift+F before Flows is in: it loads and opens', Boolean(flOk), JSON.stringify(Lazy.state().find((g) => g.name === 'flows')));
document.querySelectorAll('dialog[open]').forEach((d) => d.close());
await sleep(200);
const res = await Commands.tryRun('/help', H.claudeAgent().id, null, { say: () => {}, note: () => {} }).catch((err) => `ERR ${err.message}`);
const helpOk = await until(() => [...document.querySelectorAll('dialog[open]')].some((d) => /command/i.test(d.textContent)), 5000);
check('/help opens the searchable view', helpOk, String(res).slice(0, 80));
document.querySelectorAll('dialog[open]').forEach((d) => d.close());
check('Flows hooks landed (makes / progress cards follow runs)', typeof Flows !== 'undefined' && Flows.onChange && true);
return `[FASTBOOT]${JSON.stringify(out)} ${out.bad.length ? 'FAIL' : 'PASS'} (${out.ok.length} ok, ${out.bad.length} bad)`;
