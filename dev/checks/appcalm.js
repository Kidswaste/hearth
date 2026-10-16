// appcalm (round 49): the app outside the Lab, counted in its common states at 1280×800 and 2560×1440 (Emulation),
// pointer away (what you see at rest): the empty start, a chat with a long reply (at rest and pointed at), the chat
// box with attachments and a long message, the 💡 Answered by Hearth card, Astra's chat, the Usage window, Settings,
// Ctrl/⌘+K, the board, a burst of notes with an error (▸ Details). Visible controls the way simplify2 / chatcalm /
// labcalm count (buttons, selects, inputs, summaries, links, roles), against a budget per state and part (rail, chats
// list, chat header, chat box, notes). Also: one name for Find anything (no "Command palette" on screen), drawn icons
// for every rail tool, the rail ⋯ holding what left the rail, at most 3 notes at once, and every folded action still
// found by Ctrl/⌘+K.
//   node dev/smoke.js --fake-engines --check-timeout 400000 --script dev/checks/appcalm.js --shot /tmp/appcalm.png
// Set window.APPCALM_SHOTS = '/dir' (via --eval) to keep a picture of each state at each size.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const cdp = (method, params) => smoke({ cdp: method, params });
const SEL = 'button, select, input:not([type=hidden]), textarea, summary, a[href], [role=button], [role=switch], [role=slider], [role=tab]';
const vis = (n) => { if (!n.checkVisibility?.({ visibilityProperty: true, opacityProperty: true })) return false; let o = 1; for (let x = n; x && x !== document.documentElement; x = x.parentElement) o *= Number(getComputedStyle(x).opacity); if (o < 0.05) return false; const r = n.getBoundingClientRect(); return r.width > 2 && r.height > 2 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight; };
const nm = (n) => (n.textContent || n.getAttribute('aria-label') || n.title || n.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 18);
const ctrls = (root) => (root ? [...root.querySelectorAll(SEL)].filter(vis) : []);
const shot = async (n) => { if (window.APPCALM_SHOTS) await smoke({ shot: `${window.APPCALM_SHOTS}/${n}.png` }); };
const mouse = (x, y) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) });
const out = { counts: {}, parts: {}, lists: {}, steps: [] };
const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails.push(name); };
// budgets at 1280×800, at rest (before this pass, from the same check on 40a5550: see docs/upgrades/appcalm.md)
const BUDGET = { start: 24, reply: 22, replyPointed: 25, composer: 25, answer: 25, astra: 24, usage: 13, settings: 14, palette: 1, board: 21, toasts: 2 }; // before: 26, 24, 27, 27, 27, 26, 16, 14, 1, 23, 8 (and 5 notes at once)
const PART_BUDGET = { rail: 12, list: 6, header: 1, box: 4 };
const PARTS = { rail: '#rail', list: '#panel', header: '.surface.active .native-head', box: '.surface.active form.composer' };
const parts = () => Object.fromEntries(Object.entries(PARTS).map(([k, s]) => [k, ctrls(document.querySelector(s)).length]));
const top = () => document.querySelector('dialog[open]') || document;
function count(state, root = top()) {
  const list = ctrls(root);
  out.counts[`${state}@${innerWidth}`] = list.length;
  if (innerWidth === 1280) { out.lists[state] = list.map(nm).join(' | '); out.parts[state] = parts(); }
  return list.length;
}
const away = async () => { await mouse(innerWidth - 4, Math.round(innerHeight / 2)); await wait(350); };
const C = H.claudeAgent();
const A = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
const closeCards = () => document.querySelectorAll('.qs-card').forEach((c) => c.querySelector('.qs-x, button[title^="Close"]')?.click());
store.set('hints.test', { gap: 0, start: 0, startNotice: 0 });
try { Hints.setOff(true); } catch { /* optional */ } // no tips over the states being counted
for (const g of ['localanswers', 'usagelimits', 'appsearch']) { try { await Lazy.load(g); } catch { /* optional */ } }

// ---------- a chat with a long reply, made once ----------
activate(C.id); await wait(700); closeCards();
Native.newChat(C.id); await wait(300);
const v = Native.view(C.id);
const replies = () => v.list.querySelectorAll('.msg.assistant:not(.streaming)');
const send = async (t) => { const n = replies().length; v.input.value = t; v.form.requestSubmit(); await until(() => replies().length > n && !v.list.querySelector('.msg.streaming'), 30000); await wait(900); };
await send('think tool code please');
await send('long table');
const chatId = H.activeChat[C.id];

for (const [w, h] of [[2560, 1440], [1280, 800]]) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await wait(600);
  // the empty start
  activate(C.id); Native.newChat(C.id); await wait(500); closeCards(); await away();
  count('start', document); await shot(`start-${w}`);
  // the long reply, at rest and pointed at
  Native.open(C.id, chatId);
  await until(() => H.activeChat[C.id] === chatId && replies().length >= 2, 6000); await wait(400); await away();
  count('reply', document); await shot(`reply-${w}`);
  const foot = [...replies()].at(-1)?.querySelector(':scope > .msg-foot');
  if (foot) { foot.scrollIntoView({ block: 'center' }); await wait(150); const r = foot.getBoundingClientRect(); await mouse(r.left + 40, r.top + 8); await wait(450); }
  count('replyPointed', document); await shot(`reply-pointed-${w}`);
  await away();
  // the chat box: two attachments and a long message (the send preview may show)
  v.attachments.push({ kind: 'text', name: 'notes.md', content: 'x'.repeat(20000) }, { kind: 'text', name: 'palette.json', content: '{"a":1}' });
  Native.renderChips(C.id);
  v.input.value = 'Make the second one a bit warmer please and explain the title timing.'; v.input.dispatchEvent(new Event('input', { bubbles: true }));
  await wait(1300); await away();
  count('composer', document); await shot(`composer-${w}`);
  v.attachments.length = 0; Native.renderChips(C.id); v.input.value = ''; v.input.dispatchEvent(new Event('input', { bubbles: true }));
  // 💡 Answered by Hearth
  v.input.value = 'how do I make a 9:16 version?'; v.form.requestSubmit();
  await until(() => document.querySelector('.la-card'), 5000); await wait(300); await away();
  count('answer', document); await shot(`answer-${w}`);
  document.querySelector('.la-card')?.querySelector('.la-x, button[title^="Close"], button[aria-label^="Close"]')?.click();
  document.querySelector('.la-card')?.remove();
  v.input.value = '';
  // Astra
  if (A) { activate(A.id); await wait(700); closeCards(); await away(); count('astra', document); await shot(`astra-${w}`); activate(C.id); await wait(300); }
  // the Usage window
  await Meter.dashboard(); await until(() => document.querySelector('dialog.meter-dlg[open] .ul-card'), 8000); await wait(400); await away();
  count('usage'); await shot(`usage-${w}`);
  document.querySelector('dialog.meter-dlg[open]')?.close(); await wait(200);
  // Settings
  await AppUI.openSettings(); await wait(900); await away();
  count('settings'); await shot(`settings-${w}`);
  document.querySelector('dialog[open]')?.close(); await wait(200);
  // Ctrl/⌘+K
  AppUI.palette(); await until(() => document.querySelector('.palette-input'), 4000); await wait(400);
  count('palette', document.querySelector('.palette')); await shot(`palette-${w}`);
  document.querySelector('.palette-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(200);
  // the board
  activate('tool:board'); await wait(1500); await away();
  count('board', document); await shot(`board-${w}`);
  activate(C.id); await wait(400);
  // a burst of notes and an error
  document.querySelectorAll('#toasts > *').forEach((t) => t.remove());
  for (const t of ['Saved the scene', 'Copied', 'Backed up', 'Sync: up to date', 'Render done', 'Exported 3 files']) toast(t, { timeout: 20000 });
  toast('Couldn\'t load the song', { type: 'error', timeout: 20000, raw: new Error('ENOENT: no such file or directory, open \'/Users/me/song.wav\'') });
  await wait(600); await away();
  const shown = [...document.querySelectorAll('#toasts > .toast')].filter(vis);
  out.counts[`toasts shown@${w}`] = shown.length;
  count('toasts', document.querySelector('#toasts')); await shot(`toasts-${w}`);
  if (w === 1280) {
    const err = shown.find((t) => t.classList.contains('error'));
    step('the error note stays in a burst, with its Details', err && [...err.querySelectorAll('summary, button, details')].some((n) => /Details/.test(n.textContent)));
    if (err) { const r = err.getBoundingClientRect(); await mouse(r.left + 20, r.top + 10); await wait(300); step('pointing at a note shows its ×', [...err.querySelectorAll('.toast-x')].some(vis)); await away(); }
  }
  document.querySelectorAll('#toasts > *').forEach((t) => t.remove());
}
await cdp('Emulation.setDeviceMetricsOverride', { width: 0, height: 0, deviceScaleFactor: 0, mobile: false }).catch(() => null);
await wait(300);

// ---------- budgets ----------
for (const [k, max] of Object.entries(BUDGET)) { const n = out.counts[`${k}@1280`]; step(`${k}: ≤ ${max} controls at 1280`, n != null && n <= max, `${n} — ${out.lists[k]?.slice(0, 200)}`); }
for (const [k, max] of Object.entries(PART_BUDGET)) { const n = out.parts.start?.[k]; step(`${k} (empty start): ≤ ${max}`, n != null && n <= max, n); }
step('the chat header at a long reply: 1 control', out.parts.reply?.header === 1, out.parts.reply?.header);
step('at most 3 notes at once in a burst', out.counts['toasts shown@1280'] <= 3, out.counts['toasts shown@1280']);

// ---------- one name, drawn icons ----------
const railMore = document.getElementById('rail-more');
railMore?.click(); await wait(250);
const moreRows = [...document.querySelectorAll('#menu:not([hidden]) > button')].filter(vis).map((b) => b.textContent.trim().replace(/\s+/g, ' '));
out.lists.railMore = moreRows.join(' | ');
hideMenu?.();
step('the rail ⋯ says Find anything (not Command palette)', moreRows.some((t) => /^Find anything/.test(t)) && !moreRows.some((t) => /Command palette/i.test(t)), moreRows);
step('the rail ⋯ holds Full screen and the Board drawer', moreRows.some((t) => /Full screen/.test(t)) && moreRows.some((t) => /Board drawer/.test(t)), moreRows);
const onScreen = [...document.querySelectorAll('#rail [title], #rail [aria-label], #rail-more')].filter(vis).map((n) => `${n.title} ${n.getAttribute('aria-label') || ''}`).join(' ');
step('no "Command palette" in the rail', !/Command palette/i.test(onScreen) && !/Command palette/i.test(document.getElementById('palette-btn')?.title || ''), onScreen.slice(0, 200));
const railTools = [...document.querySelectorAll('#agent-buttons .agent-btn')].filter(vis);
const noIcon = railTools.filter((b) => !b.querySelector('svg')).map((b) => b.title || b.textContent.trim());
step('every agent and tool in the rail has a drawn icon', !noIcon.length, noIcon);
// (round 53) the Creative Playground waits in the rail ⋯ too (Ctrl/⌘+K and /playground open it; ⋯ › Put tools back keeps it in)
step('the rail ⋯ lists the Creative Playground under Not in the rail', moreRows.some((t) => /Creative Playground/.test(t)), moreRows);
step('the full-screen and board-drawer buttons wait in the rail ⋯', !vis(document.getElementById('full-btn') || document.createElement('i')) && !vis(document.querySelector('.bd-rail-peek') || document.createElement('i')));
step('the meter says what it opens in one sentence', /what's left/i.test(document.querySelector('.meter-pill')?.title || ''), document.querySelector('.meter-pill')?.title);

// ---------- the Usage window's folded parts ----------
await Meter.dashboard(); await wait(500);
const dl = document.querySelector('dialog.meter-dlg[open]');
const tabsNow = () => [...(dl?.querySelectorAll('.mt-tabs > button') || [])].filter(vis).map((b) => b.textContent.trim());
// (the window fades in: its tabs count as seen once it has, on a busy machine that's after 0.5 s)
for (let i = 0; i < 20 && !tabsNow().length; i++) await wait(250);
const tabs = tabsNow();
out.lists.usageTabs = tabs.join(' | ');
step('Usage: 5 tabs + More', tabs.length <= 6 && tabs.some((t) => /More/.test(t)), tabs);
const moreTab = [...(dl?.querySelectorAll('.mt-tabs > button') || [])].find((b) => /More/.test(b.textContent));
moreTab?.click(); await wait(250);
const tabMenu = [...document.querySelectorAll('#menu:not([hidden]) > button')].map((b) => b.textContent.trim());
step('Usage › More holds Tools, Features, Export and the copy', ['Tools', 'Features', 'Export', 'Copy'].every((w) => tabMenu.some((t) => t.includes(w))), tabMenu);
const toolsRow = [...document.querySelectorAll('#menu:not([hidden]) > button')].find((b) => /^Tools/.test(b.textContent.trim()));
toolsRow?.click(); await wait(300);
step('Usage › More › Tools opens the Tools tab', /Tools/.test(dl?.querySelector('.mt-tabs > button.on')?.textContent || ''), dl?.querySelector('.mt-tabs > button.on')?.textContent);
const note = dl?.querySelector('.mt-traffic-note');
step('the traffic note is one line (its words on the pointer)', note && note.getBoundingClientRect().height < 26 && /subscription allowance/.test(note.title || ''), note && Math.round(note.getBoundingClientRect().height));
dl?.close(); await wait(200);

// ---------- every folded action is found by Ctrl/⌘+K ----------
AppUI.palette();
await until(() => document.querySelector('.palette-input'), 4000); await wait(300);
const find = async (q) => { const i = document.querySelector('.palette-input'); i.value = q; i.dispatchEvent(new Event('input')); await wait(450); return [...document.querySelectorAll('.palette .palette-item')].slice(0, 8).map((r) => `${r.querySelector('.p-label')?.textContent} · ${r.querySelector('.p-detail')?.textContent || ''}`).filter((t) => !/^Ask (Claude|Astra)/.test(t)); }; // not the "Ask Claude: …" fallback
for (const [q, re] of [['playground', /Creative Playground/i], ['full screen', /Full screen/i], ['board drawer', /Board drawer/i], ['usage', /^Usage/i], ['token tools', /tools/i], ['features used', /Features/i], ['export token usage', /Export token usage/i], ['copy usage summary', /usage summary/i], ['recent notifications', /Recent notifications/i], ['find anything', /Find anything/i]]) {
  const got = await find(q);
  out.lists[`find "${q}"`] = got.slice(0, 3).join(' | ');
  step(`Ctrl/⌘+K finds "${q}"`, got.some((t) => re.test(t)), got.slice(0, 4));
}
document.querySelector('.palette-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
try { Hints.setOff(false); } catch { /* optional */ }

const width = Math.max(...Object.keys(out.counts).map((k) => k.length));
return `APPCALM\n${Object.entries(out.counts).map(([k, n]) => `${k.padEnd(width)} ${String(n).padStart(4)}`).join('\n')}\nparts (1280): ${JSON.stringify(out.parts)}\n${Object.entries(out.lists).map(([k, t]) => `${k}: ${String(t).slice(0, 260)}`).join('\n')}\n${out.steps.join('\n')}\n${fails.length ? `FAIL: ${fails.length}` : 'PASS'}\n${JSON.stringify({ pass: !fails.length, counts: out.counts, errors: fails })}`;
