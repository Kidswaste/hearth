// A calm chat (round 40, chatcalm): what each part of a chat shows at rest and when you point at it, counted the way
// simplify2 / simplify3 count (visible buttons, selects, inputs, summaries, links; a control faded to nothing counts
// only once you point at its message), against a budget per area; every message action still reachable in ≤ 2 clicks
// (pointing at a submenu opens it: no click); one order under every message (what it is → its next step → Copy → ⋯);
// two or more quiet notes under a reply fold into one line that keeps their buttons; one tooltip sentence per control;
// Find anything finds the moved actions.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/chatcalm.js
// Set window.CHATCALM_SHOTS = '/dir' (via --eval) to keep a picture of each state.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const SEL = 'button, select, input:not([type=hidden]), textarea, summary, a[href], [role=button]';
const opac = (n) => { let o = 1; for (let x = n; x && x !== document.documentElement; x = x.parentElement) o *= Number(getComputedStyle(x).opacity); return o; };
const vis = (n) => Boolean(n) && n.checkVisibility?.({ visibilityProperty: true }) && n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height > 0 && opac(n) > 0.05;
const ctrls = (root, skip) => (root ? [...root.querySelectorAll(SEL)].filter((n) => vis(n) && !(skip && n.closest(skip))) : []);
const name = (n) => (n.textContent || n.getAttribute('aria-label') || n.title || n.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 20);
const shot = async (n) => { if (window.CHATCALM_SHOTS) await smoke({ shot: `${window.CHATCALM_SHOTS}/${n}.png` }); };
const mouse = (x, y) => smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: Math.round(x), y: Math.round(y) } });
const away = async () => { await mouse(2, 2); await wait(300); };
// (fixes52) under load the list may still be scrolling or the controls still fading in at 350 ms: point again (where the
// node is now) until the state it should reach is there (ready), for up to 6 s; what's read after is unchanged
const hover = async (node, ready) => { node.scrollIntoView({ block: 'center' }); const t = Date.now(); do { await wait(120); const r = node.getBoundingClientRect(); await mouse(r.left + Math.min(r.width / 2, 60), r.top + Math.min(r.height / 2, 9)); await wait(350); } while (ready && !ready() && Date.now() - t < 6000); };
const menuReady = () => until(() => menuRows().length, 4000); // (fixes52) a menu read once it's up, not at a fixed 200 ms
const menuRows = () => [...document.querySelectorAll('#menu:not([hidden]) > button')].filter(vis).map((b) => b.textContent.trim().replace(/\s+/g, ' '));
const fails = [];
const rows = {};
const lists = {};
const put = (k, list) => { rows[k] = list.length; lists[k] = list.map(name).join(' | '); };
const budget = (k, max) => { if (rows[k] > max) fails.push(`${k}: ${rows[k]} controls (budget ${max}): ${lists[k]}`); };
const tips = [];
const tipOf = (n) => n.title || n.getAttribute('aria-label') || '';
const oneSentence = (k, list) => { for (const n of list) { if (n.matches('textarea, summary, .ctx-bd, .route-chip, .copy-code')) continue; const t = tipOf(n); if (!t) tips.push(`${k}: "${name(n)}" has no tooltip`); else if (t.split('\n')[0].length > 120 || /[.!?]\s+\S/.test(t.split('\n')[0].replace(/\(.*?\)/g, ''))) tips.push(`${k}: "${name(n)}" says more than one sentence: ${t.slice(0, 90)}`); } };

const claude = H.claudeAgent();
activate(claude.id); await wait(700);
document.querySelectorAll('.qs-card').forEach((c) => c.querySelector('.qs-x, button[title^="Close"]')?.click());
Native.newChat(claude.id); await wait(400);
const v = Native.view(claude.id);
await away();

// ---------- the empty chat, the header, the chat box ----------
put('chat header', ctrls(v.root.querySelector('.native-head'))); budget('chat header', 1); oneSentence('chat header', ctrls(v.root.querySelector('.native-head')));
put('chat box', ctrls(v.form)); budget('chat box', 4); oneSentence('chat box', ctrls(v.form));
put('empty chat', ctrls(v.list)); budget('empty chat', 1);
const hintLines = [...v.list.querySelectorAll('.hint, .astra-try, .astra-hints > div')].filter(vis).filter((n) => n.textContent.trim());
rows['empty chat lines'] = hintLines.length; lists['empty chat lines'] = hintLines.map((n) => n.textContent.trim().slice(0, 60)).join(' | ');
if (hintLines.length > 1) fails.push(`the empty chat says ${hintLines.length} lines: ${lists['empty chat lines']}`);
const emptyText = v.list.textContent;
for (const w of ['＋', '◎', '⋯']) if (!emptyText.includes(w)) fails.push(`the empty chat doesn't say what ${w} does`);
if (/(^|\s)\/[a-z]/.test(emptyText)) fails.push(`the empty chat shows a command: ${emptyText.slice(0, 120)}`);
const order = [...v.form.querySelectorAll(':scope > button')].filter(vis).map((b) => b.textContent.trim());
if (order.join(' ') !== '◎ ＋ Send') fails.push(`the chat box's buttons: ${order.join(' ')} (want ◎ ＋ Send)`);
await shot('empty');
// the chat box's right-click: one Attach row (＋'s menu has Files…)
v.form.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 400, clientY: 600 })); await menuReady(); await wait(100);
const boxMenu = menuRows(); rows['chat box right-click'] = boxMenu.length; lists['chat box right-click'] = boxMenu.join(' | ');
if (boxMenu.filter((t) => /attach/i.test(t)).length !== 1) fails.push(`the chat box's right-click has ${boxMenu.filter((t) => /attach/i.test(t)).length} Attach rows: ${boxMenu.join(' | ')}`);
if (boxMenu.length > 7) fails.push(`the chat box's right-click: ${boxMenu.length} rows`);
hideMenu();

// ---------- replies ----------
const replies = () => v.list.querySelectorAll('.msg.assistant:not(.streaming)');
const send = async (t) => { const n = replies().length; v.input.value = t; v.form.requestSubmit(); await until(() => replies().length > n && !v.list.querySelector('.msg.streaming'), 30000); await wait(900); };
await send('think tool code please');
await send('remember table');
await away();
const reply = [...replies()].at(-1);
const user = [...v.list.querySelectorAll('.msg.user')].at(-1);
const foot = (m) => m.querySelector(':scope > .msg-foot');
const shows = (m, ...ts) => () => ts.every((t) => ctrls(foot(m)).some((b) => b.textContent.trim() === t)); // pointed at: Copy and ⋯ show
put('reply at rest', ctrls(foot(reply))); budget('reply at rest', 1);
put('yours at rest', ctrls(foot(user))); budget('yours at rest', 0);
await hover(foot(reply), shows(reply, 'Copy', '⋯'));
put('reply, pointed at', ctrls(foot(reply))); budget('reply, pointed at', 5); oneSentence('reply', ctrls(foot(reply)));
const want = ['Copy', '⋯'].filter((t) => !ctrls(foot(reply)).some((b) => b.textContent.trim() === t));
if (want.length) fails.push(`pointing at a reply doesn't show ${want.join(', ')}`);
await shot('reply-hover');
await hover(foot(user), shows(user, 'Copy', '⋯'));
put('yours, pointed at', ctrls(foot(user))); budget('yours, pointed at', 2); oneSentence('yours', ctrls(foot(user)));
await away();
await shot('replies');
// one order under every message: what it is (tokens, bar, Smart's pick, time) → its next step → Copy → ⋯
const rank = (n) => (n.matches('.msg-more') ? 4 : n.matches('.copy-msg') ? 3 : n.matches('.primary-act, .au-reply') ? 2 : 1);
for (const m of v.list.querySelectorAll('.msg.assistant, .msg.user')) {
  const kids = [...(foot(m)?.children || [])].filter((n) => n.matches('button, span'));
  const r = kids.map(rank);
  if (r.some((x, i) => i && x < r[i - 1])) fails.push(`message #${Number(m.dataset.index) + 1}: its line is out of order: ${kids.map((n) => n.textContent.trim().slice(0, 12) || n.className).join(' | ')}`);
}

// ---------- the message ⋯ menu: Copy isn't said twice, every action in ≤ 2 clicks ----------
await hover(foot(reply));
foot(reply).querySelector('.msg-more').click(); await menuReady(); await wait(100);
const top = menuRows(); rows['message ⋯ menu'] = top.length; lists['message ⋯ menu'] = top.join(' | ');
if (top.length > 6) fails.push(`message ⋯ menu: ${top.length} rows`);
if (top.some((t) => t === 'Copy')) fails.push('the message ⋯ menu says Copy next to the Copy button');
hideMenu();
// what's in it (pointing at a submenu opens it, so ⋯ + one row of a submenu = 2 clicks)
const reach = async (agentId, idx, anchor) => {
  const got = []; const keep = window.showMenu;
  window.showMenu = (x, y, items) => { got.push(items); };
  try { Native.messageMenu(agentId, idx, anchor); } finally { window.showMenu = keep; }
  const out = [];
  for (const it of (got[0] || []).filter(Boolean)) {
    if (typeof it !== 'object') continue;
    out.push(it.label);
    const sub = typeof it.items === 'function' ? it.items() : it.items;
    for (const s of (sub || []).filter((x) => x && typeof x === 'object')) out.push(`${it.label} › ${s.label}`);
  }
  return out;
};
const lastIdx = Number(reply.dataset.index);
const onReply = await reach(claude.id, lastIdx, foot(reply).querySelector('.msg-more'));
const onRight = await reach(claude.id, lastIdx, { getBoundingClientRect: () => ({ left: 300, bottom: 300 }) });
const onYours = await reach(claude.id, Number(user.dataset.index), foot(user).querySelector('.msg-more'));
lists['reachable (reply)'] = onReply.join(' | ');
const NEED = { reply: ['Read aloud', 'Quote in my message', 'Branch', 'Retry: write it again', 'Retry with another model', 'Pin message', 'Bookmark', 'React', 'Copy as plain text', 'Save as a Markdown file', 'Save to notes', 'Show the Markdown source'], yours: ['Edit and resend', 'Quote in my message', 'Branch', 'Pin message', 'Save to notes'] };
for (const w of NEED.reply) if (!onReply.some((t) => t.includes(w))) fails.push(`a reply's ⋯ lost "${w}" (or it's deeper than 2 clicks)`);
for (const w of NEED.yours) if (!onYours.some((t) => t.includes(w))) fails.push(`your message's ⋯ lost "${w}"`);
if (!onRight.includes('Copy')) fails.push('right-click a message: no Copy (there is no Copy button beside the pointer)');
// Copy is one click (the button), Read aloud two (⋯ › Read aloud): the owner's two
if (!onReply.includes('Read aloud')) fails.push('Read aloud is not on the first level of ⋯');

// ---------- a stopped reply and a failed one: their next step without pointing ----------
v.input.value = 'slow long'; v.form.requestSubmit();
await until(() => v.list.querySelector('.msg.streaming .body')?.textContent.length > 200, 15000);
Native.stop(claude.id);
await until(() => !v.list.querySelector('.msg.streaming'), 10000); await wait(800); await away();
const stopped = [...replies()].at(-1);
await until(shows(stopped, 'Continue'), 5000); // (fixes52) read once its line is drawn
const cont = ctrls(foot(stopped)).find((b) => b.textContent.trim() === 'Continue');
if (!cont) fails.push(`a stopped reply doesn't show Continue at rest: ${ctrls(foot(stopped)).map(name).join(' | ')}`);
put('stopped reply at rest', ctrls(foot(stopped))); budget('stopped reply at rest', 1);
await send('error please');
await away();
const err = await until(() => [...v.list.querySelectorAll('.msg.error')].at(-1), 8000);
await until(() => ctrls(foot(err)).some((b) => b.dataset.msgAct === 'retry'), 5000); // (fixes52)
put('failed reply at rest', ctrls(foot(err))); budget('failed reply at rest', 2);
if (!ctrls(foot(err)).some((b) => b.dataset.msgAct === 'retry')) fails.push('a failed reply hides Retry');
const errMore = foot(err)?.querySelector('.err-more');
if (errMore) { errMore.click(); await menuReady(); await wait(100); const em = menuRows(); lists['failed reply ⋯'] = em.join(' | '); for (const w of ['Copy error', 'Check engines']) if (!em.some((t) => t.includes(w))) fails.push(`a failed reply's ⋯ lost ${w}`); hideMenu(); } else if (rows['failed reply at rest'] > 2) fails.push('a failed reply has no ⋯ for the rest');
await shot('stopped-failed');

// ---------- quiet notes: one line when several apply ----------
Native.newChat(claude.id); await wait(300);
await send('hello');
let ran = 0;
Native.note(claude.id, '↻ The personality changed mid-chat: the next message re-reads this chat once (≈ 2k tokens).', { id: 'cachewise' });
Native.note(claude.id, 'This chat re-reads ≈ 48k tokens with every message. Continue lighter?', { id: 'autocompact', actions: [{ label: '🗜 Continue lighter', title: 'A short summary replaces the older messages for the AI', run: () => { ran += 1; } }] });
Native.note(claude.id, 'Smart learned: code questions here get a deeper model.', { id: 'routerlearn' });
Native.note(claude.id, '`/stats`: 3 messages.', { id: 'cmd-out' }); // a command's own output never folds
await wait(300); await away();
await until(() => vis(v.list.querySelector('.note-stack')), 4000); // (fixes52)
const stack = v.list.querySelector('.note-stack');
const quietShown = [...v.list.querySelectorAll('.msg.note[data-quiet]')].filter(vis).length;
rows['quiet note lines (3 apply)'] = (stack && vis(stack) ? 1 : 0) + quietShown;
lists['quiet note lines (3 apply)'] = stack?.textContent.trim().slice(0, 140) || '';
if (rows['quiet note lines (3 apply)'] !== 1) fails.push(`3 quiet notes show as ${rows['quiet note lines (3 apply)']} lines`);
if (!vis(v.list.querySelector('.msg.note[data-note-id="cmd-out"]'))) fails.push('a command\'s own output was folded');
put('quiet notes, folded', ctrls(stack)); budget('quiet notes, folded', 2);
const proxy = ctrls(stack).find((b) => /Continue lighter/.test(b.textContent));
if (!proxy) fails.push('the folded line lost 🗜 Continue lighter'); else { proxy.click(); await wait(100); if (ran !== 1) fails.push('🗜 Continue lighter on the folded line did nothing'); }
await shot('notes-folded');
stack?.querySelector('.ns-toggle')?.click(); await wait(200);
const openShown = [...v.list.querySelectorAll('.msg.note[data-quiet]')].filter(vis).length;
if (openShown < 2) fails.push(`▸ shows ${openShown} notes`);
await shot('notes-open');
v.list.querySelector('.ns-toggle')?.click(); await wait(100);
// down to one: the line goes, the note shows as itself
for (const n of [...v.list.querySelectorAll('.msg.note[data-quiet]')].slice(1)) n.querySelector('.note-x').click();
await wait(150);
if (v.list.querySelector('.note-stack')?.isConnected) fails.push('one quiet note left: the folded line stayed');
if (![...v.list.querySelectorAll('.msg.note[data-quiet]')].some(vis)) fails.push('one quiet note left: it is hidden');
Native.clearNotes(claude.id);

// ---------- Find anything finds the moved actions ----------
AppUI.palette();
await until(() => document.querySelector('.palette-input'), 4000); await wait(200);
const find = async (q, re) => { const i = document.querySelector('.palette-input'); i.value = q; i.dispatchEvent(new Event('input')); await wait(500); const items = () => [...document.querySelectorAll('.palette .palette-item')].slice(0, 8).map((r) => `${r.querySelector('.p-label')?.textContent} · ${r.querySelector('.p-detail')?.textContent}`); await until(() => items().some((t) => re.test(t)), 3000); return [...document.querySelectorAll('.palette .palette-item')].slice(0, 8).map((r) => `${r.querySelector('.p-label')?.textContent} · ${r.querySelector('.p-detail')?.textContent}`); };
for (const [q, re] of [['branch', /Branch/i], ['retry', /Retry/i], ['pin message', /Pin/i], ['read aloud', /Read aloud/i], ['notes under a reply', /notes under a reply/i], ['which model answered', /model answered/i]]) {
  const got = await find(q, re);
  lists[`find "${q}"`] = got.slice(0, 3).join(' | ');
  if (!got.some((t) => re.test(t))) fails.push(`Find anything "${q}": ${got.slice(0, 4).join(' | ') || 'nothing'}`);
}
document.querySelector('.palette-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

if (tips.length) fails.push(...tips.slice(0, 6));
const width = Math.max(...Object.keys(rows).map((k) => k.length));
return `CHATCALM\n${Object.entries(rows).map(([k, n]) => `${k.padEnd(width)}  ${String(n).padStart(3)}   ${(lists[k] || '').slice(0, 140)}`).join('\n')}\n${Object.entries(lists).filter(([k]) => !(k in rows)).map(([k, t]) => `${k}: ${t.slice(0, 300)}`).join('\n')}\n${fails.length ? `FAIL: ${fails.join('\nFAIL: ')}` : 'PASS'}\n${JSON.stringify({ pass: !fails.length, rows })}`;
