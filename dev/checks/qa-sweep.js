// QA sweep: startup timing and memory, palette / "/" menu speed, then EVERY chat command with no arguments
// (dialogs closed between, destructive ones skipped), collecting thrown errors, error toasts and console errors.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/qa-sweep.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
const out = {};
const nav = performance.getEntriesByType('navigation')[0];
out.startup = { domContentLoaded: Math.round(nav?.domContentLoadedEventEnd || 0), load: Math.round(nav?.loadEventEnd || 0), heapMB: Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6), commands: Commands.list().length, actions: AppUI.actions?.().length };
const longTasks = performance.getEntriesByType('longtask').length;

// palette open / type
let t = performance.now(); AppUI.palette(); await frame(); out.paletteOpenMs = Math.round(performance.now() - t);
const pin = document.querySelector('.palette-input');
t = performance.now(); pin.value = 'lab'; pin.dispatchEvent(new Event('input')); await frame(); out.paletteTypeMs = Math.round(performance.now() - t);
document.querySelector('.palette')?.remove();

// "/" menu in Claude's composer
const claude = H.claudeAgent();
activate(claude.id); await wait(200);
const v = Native.view(claude.id);
t = performance.now(); v.input.value = '/'; v.input.dispatchEvent(new Event('input'));
for (let i = 0; i < 100 && !v.root.querySelector('.slash-menu'); i++) await wait(5);
await frame(); out.slashMenuMs = Math.round(performance.now() - t); out.slashRows = v.root.querySelectorAll('.slash-item').length;
t = performance.now(); v.input.value = '/lo'; v.input.dispatchEvent(new Event('input')); await wait(30); await frame(); out.slashTypeMs = Math.round(performance.now() - t);
t = performance.now(); v.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })); await frame(); out.slashArrowMs = Math.round(performance.now() - t);
v.input.value = ''; v.input.dispatchEvent(new Event('input'));

t = performance.now(); for (let i = 0; i < 10; i++) Commands.matching(''); out.matchingMs = Math.round((performance.now() - t) / 10);
t = performance.now(); for (let i = 0; i < 10; i++) Commands.matching('lo'); out.matchingTypedMs = Math.round((performance.now() - t) / 10);

// every command, no args (in a chat that has a reply, so chat commands have something to act on)
Native.newChat(claude.id);
await Native.send(claude.id, 'code table suggest');
for (let i = 0; i < 150 && Native.isBusy(H.activeChat[claude.id]); i++) await wait(100);
const SKIP = /^(delete|del|restore|restore-backup|import|import-chats|backup|trash|reset|reload|relaunch|quit|unalias|forget|wipe|purge|empty|uninstall|clear|clear-all|new-window|update|sleep)$/;
const SKIP_DESC = /\b(delete|remove|forget|wipe|erase|for good|restore|import|reset|quit|uninstall|reload)\b/i;
const errs = [];
const origErr = console.error;
console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0, 200)); origErr(...a); };
const onErr = (e) => errs.push(`uncaught: ${e.message || e.reason?.message || e.reason}`);
addEventListener('error', onErr); addEventListener('unhandledrejection', onErr);
const results = { ran: 0, skipped: [], errors: [], slow: [] };
for (const d of Commands.list().slice(window.QA_FROM || 0, window.QA_TO || 9999)) { // chunks: --eval "return (window.QA_FROM=0, window.QA_TO=150)"
  if (SKIP.test(d.name) || SKIP_DESC.test(d.desc)) { results.skipped.push(d.name); continue; }
  activate(claude.id);
  const before = (recentToasts?.() || []).length ? recentToasts()[0] : null;
  errs.length = 0;
  const t0 = performance.now();
  let thrown = null;
  try {
    const r = await Promise.race([Commands.tryRun(`/${d.name}`, claude.id, v.input), wait(4000).then(() => '__timeout')]);
    if (r === '__timeout') results.slow.push(d.name);
  } catch (err) { thrown = err.message; }
  await wait(120);
  const ms = Math.round(performance.now() - t0);
  const newToasts = [];
  for (const x of recentToasts?.() || []) { if (x === before) break; if (x.type === 'error') newToasts.push(x.message); }
  const real = newToasts.filter((m) => !/No chat open yet/.test(m));
  if (thrown || real.length || errs.length) results.errors.push(`/${d.name}: ${[thrown && `threw ${thrown}`, ...real.map((m) => `toast ${m}`), ...errs].filter(Boolean).join(' | ').slice(0, 300)}`);
  results.ran += 1;
  if (ms > 1500 && !results.slow.includes(d.name)) results.slow.push(`${d.name} ${ms}ms`);
  // close what it opened
  document.querySelectorAll('dialog[open]').forEach((x) => { try { x.close(); } catch { /* */ } });
  document.querySelectorAll('.palette, .ctx-menu, .slash-menu, .fx-picker').forEach((x) => x.remove());
  v.input.value = ''; Native.setDraft?.(claude.id, '');
}
console.error = origErr;
removeEventListener('error', onErr); removeEventListener('unhandledrejection', onErr);
out.sweep = results;
out.heapAfterMB = Math.round((performance.memory?.usedJSHeapSize || 0) / 1e6);
out.longTasks = longTasks;
return JSON.stringify(out, null, 1);
