// commandonly (round 51): the visible ways added for what only a typed command reached, clicked like a person would.
//   · the chat box's right-click › More… › Snippets › a saved snippet goes into the chat box; Save this message as a
//     snippet… is there
//   · the chat box's right-click › More… › Remind me… asks when / about what and sets the reminder (a timer)
//   · the chat box's right-click › More… › Open a code file as nodes… is there
//   · the chat ⋯ menu (right-click the header) › View › How messages look › Width / Spacing / Times / Font change the chat
//   · the board: a palette card's right-click › Palette style › Dots restyles it (and its Copy hex / Harmonies rows show
//     while the Apps are loaded: they were hidden then)
//   · Capture › More… › Settings… › Recording… › Window at an exact size… sizes the window's content (then back)
//   (the cleanup at the end of a step may run a command: cancel the reminder, put the window back)
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/commandonly.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(80); } return null; };
const vis = (n) => Boolean(n) && n.getBoundingClientRect().width > 0;
const rows = () => [...document.querySelectorAll('#menu:not([hidden]) > button')].filter(vis);
const label = (b) => b.textContent.trim().replace(/\s+/g, ' ');
const fails = []; const steps = {};
const ok = (name, cond, why = '') => { steps[name] = Boolean(cond); if (!cond) fails.push(`${name}${why ? `: ${why}` : ''}`); };
// click the menu row whose words start with `text` (submenus open in place)
async function pick(text) {
  const b = await until(() => rows().find((r) => label(r).startsWith(text)), 3000);
  if (!b) throw new Error(`no menu row "${text}" (rows: ${rows().map(label).join(' | ').slice(0, 300)})`);
  b.click(); await wait(180);
  return b;
}
const rightClick = (node) => { const r = node.getBoundingClientRect(); node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + Math.min(20, r.width / 2), clientY: r.top + Math.min(12, r.height / 2), button: 2 })); };

await wait(1500);
const agentId = H.claudeAgent().id;
activate(agentId); await wait(400);
const v = Native.view(agentId);
const form = await until(() => document.querySelector(`.surface.active form.composer`) || v?.input?.closest('form.composer'));
ok('a chat is open', form);

// ---------- Snippets ----------
try {
  await ChatUX.saveSnippet('cmdonly test', 'hello from a snippet');
  rightClick(form); await wait(250);
  ok('chat box right-click opens', rows().length > 0);
  await pick('More…'); await pick('Snippets');
  const names = rows().map(label);
  ok('Snippets › Save this message as a snippet… is there', names.some((t) => t.startsWith('Save this message as a snippet')));
  v.input.value = '';
  await pick('cmdonly test');
  ok('a snippet goes into the chat box', /hello from a snippet/.test(v.input.value), v.input.value.slice(0, 60));
  v.input.value = ''; v.input.dispatchEvent(new Event('input'));
} catch (err) { fails.push(`snippets: ${err.message}`); hideMenu(); }

// ---------- Remind me… ----------
try {
  rightClick(form); await wait(250);
  await pick('More…');
  ok('Open a code file as nodes… is there', rows().some((r) => label(r).startsWith('Open a code file as nodes')));
  await pick('Remind me…');
  const dlg = await until(() => [...document.querySelectorAll('dialog.ui-modal[open]')].pop());
  ok('Remind me asks when and what', dlg && dlg.querySelectorAll('input').length >= 2);
  const [when, what] = dlg.querySelectorAll('input');
  when.value = 'in 10m'; what.value = 'commandonly stretch';
  dlg.querySelector('button.primary').click();
  const t = await until(() => typeof CmdBar !== 'undefined' && CmdBar.timers().find((x) => /commandonly stretch/.test(x.cmd || '')), 8000);
  ok('a reminder is set (in about 10 minutes)', t && Math.abs(t.next - Date.now() - 600000) < 60000, t ? `next in ${Math.round((t.next - Date.now()) / 1000)} s` : 'no timer');
  if (t) await Commands.exec('/timer-cancel all', agentId, { say: () => {}, note: () => {} });
} catch (err) { fails.push(`remind: ${err.message}`); hideMenu(); }

// ---------- How messages look ----------
try {
  // a chat with a message (the chat ⋯ menu's View is there once a chat exists)
  if (!Native.chatOf?.(agentId)?.messages?.length) { v.input.value = 'hi'; v.input.dispatchEvent(new Event('input')); form.requestSubmit(); await until(() => Native.chatOf?.(agentId)?.messages?.some((m) => m.role === 'assistant'), 30000); await wait(300); }
  const before = { width: ChatUX.pref('width'), density: ChatUX.pref('density'), timestamps: ChatUX.pref('timestamps'), font: ChatUX.pref('font') };
  Native.chatMenu(agentId, { clientX: 400, clientY: 120 }); await wait(250);
  await pick('View'); await pick('How messages look');
  const subs = rows().map(label);
  ok('How messages look has Width, Spacing, Times, Font', ['Width', 'Spacing', 'Times', 'Font'].every((w) => subs.some((s) => s.startsWith(w))), subs.join(' | '));
  await pick('Width'); await pick('Wide');
  ok('Width › Wide widens messages', ChatUX.pref('width') === 'wide');
  Native.chatMenu(agentId, { clientX: 400, clientY: 120 }); await wait(250);
  await pick('View'); await pick('How messages look'); await pick('Spacing'); await pick('Tight');
  ok('Spacing › Tight', ChatUX.pref('density') === 'compact');
  Native.chatMenu(agentId, { clientX: 400, clientY: 120 }); await wait(250);
  await pick('View'); await pick('How messages look'); await pick('Times'); await pick('Always');
  ok('Times › Always', ChatUX.pref('timestamps') === 'always');
  Native.chatMenu(agentId, { clientX: 400, clientY: 120 }); await wait(250);
  await pick('View'); await pick('How messages look'); await pick('Font'); await pick('Serif');
  ok('Font › Serif', ChatUX.pref('font') === 'serif');
  for (const [k, val] of Object.entries(before)) ChatUX.setPref(k, val);
} catch (err) { fails.push(`message look: ${err.message}`); hideMenu(); }

// ---------- the board: Palette style ----------
try {
  activate('tool:board');
  await until(() => Board.isMounted?.() && Board.current?.(), 20000);
  const pal = Board.addSwatch(['#ff3c6e', '#ffd75e', '#48ddff']);
  const item = pal?.id ? pal : Board.items().filter((i) => i.type === 'palette').pop();
  const node = await until(() => Board._.S.nodes.get(item.id));
  Board.select([]); Board.select([item.id]); await wait(200);
  rightClick(node); await wait(300);
  // (the rows of a color / palette card went missing whenever the Apps were loaded: fixed in board-menus.js)
  ok('a palette card\'s right-click has its own rows (Copy hex, Harmonies) with the Apps loaded', typeof AppsMeshy === 'undefined' || ['Copy hex', 'Harmonies'].every((w) => rows().some((r) => label(r).startsWith(w))), rows().map(label).join(' | ').slice(0, 200));
  if (!rows().some((r) => label(r).startsWith('Palette style'))) await pick('More…');
  await pick('Palette style');
  ok('Palette style lists 4 styles', rows().filter((r) => !r.classList.contains('menu-back')).length >= 4);
  await pick('Dots');
  ok('Palette style › Dots restyles the card', Board.item(item.id)?.pstyle === 'dots');
} catch (err) { fails.push(`board palette style: ${err.message}`); hideMenu(); }

// ---------- Capture: window at an exact size ----------
try {
  activate(agentId); await wait(300);
  if (window.Lazy && !Lazy.isIn('capture')) await Lazy.load('capture');
  Capture.menu(200, 90, Capture.mainItems()); await wait(250);
  if (!rows().some((r) => label(r).startsWith('Settings'))) await pick('More…');
  await pick('Settings'); await pick('Recording'); await pick('Window at an exact size');
  const sizes = rows().map(label);
  ok('Window at an exact size lists 16:9 / 4:5 / 1:1 sizes', ['1920 × 1080', '1280 × 720', '1080 × 1350', '1080 × 1080'].every((s) => sizes.some((x) => x.startsWith(s))), sizes.join(' | '));
  await pick('1280 × 720');
  const sized = await until(() => Math.abs(innerWidth - 1280) <= 2 && Math.abs(innerHeight - 720) <= 2, 5000);
  ok('1280 × 720 sizes the window\'s content', sized, `${innerWidth}×${innerHeight}`);
  await Commands.exec('/window-size reset', agentId, { say: () => {}, note: () => {} });
} catch (err) { fails.push(`capture window size: ${err.message}`); hideMenu(); }

ChatUX.deleteSnippet?.('cmdonly test');
return JSON.stringify({ pass: !fails.length, steps, fails }, null, 1);
