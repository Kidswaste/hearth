// opt-in: CHATWINDOW86
// (round 86, chatwindow86) A GIANT chat (6,000 messages, ≈ 63 MB: dev/bigchat84-fixture.js, made up, never real data)
// opened WINDOWED: the window holds its own fields, its last ≈ 300 messages and one small record per message; older
// blocks are read from the store thread when you scroll up to them, and let go again far away (chatwin.js). Measured
// for each step: the window's longest task (PerformanceObserver longtask), the main process's busy stretches
// (mainlag-probe.js, HEARTH_LOOPLAG=prof), and what the window holds (heap after a GC, chatwin's counts):
//   open        from the click until the end is drawn and settled; the heap with the giant chat open (vs before it)
//   top         scrolled to the very top: message #0 drawn (its block read by range); then back at the end, the far
//               blocks rest and their messages are let go
//   find        Alt+F, a word only in #30 (the store thread finds it; its block wakes): marked
//   jump        to #100: woken, on screen
//   send        a message sent, the fake engine answers: saved by change, nothing loaded whole
//   react       a reaction on #2001 (never loaded): its block read first, saved by change, on disk exactly there
//   edit        edit-from-here on an older message of yours (not loaded): its block read, the chat cut there ("truncate
//               to n": trunc), the reply: on disk the chat ends there, everything before it unchanged
//   export      /export json: the chat loaded whole first (load-all), the file = the whole-chat way byte for byte;
//               a minute later it goes back to its window (here at once: rewindow)
//   sync        the chat file replaced as sync does when the other computer changed it (the version kept at the
//               start: 6,000 messages): the chat let go and opened again, windowed, its end drawn
// Nothing in a measured step may load the chat whole except export, nothing may reach an unloaded message's content
// (chatwin misses), no change may be refused (poisoned).
// window.CW86_OFF = 1: the same steps with the setting off (the chat held whole: the "before" numbers).
// window.CW_REPORT = 1: report without failing.
//   node dev/bigchat84-fixture.js /tmp/hearth-bigchat84
//   HEARTH_LOOPLAG=prof node dev/smoke.js --fake-engines --data /tmp/hearth-bigchat84 --wait 1000 --check-timeout 900000 --script dev/checks/chatwindow86.js
if (window.CW86_DEBUG) { window.CW_REPORT = 1; window.CW86_NOHEAL = 1; } // (every read that reaches an unloaded message listed: none loads the chat whole)
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, n = 400) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const r0 = (x) => Math.round(x);
const MB = (x) => Math.round((x / 1048576) * 10) / 10;
const OFF = Boolean(window.CW86_OFF);
const out = { mode: OFF ? 'off (whole)' : 'windowed', problems: [] };
const BUDGET = Object.assign({ task: 60, mainBlock: 100, heapMB: 40 }, window.CW_BUDGET || {});
const RARE = 'zanzibar84quokka';
const ID = 'claude-giant0';
const lag = (label) => window.hub.power?.test?.({ lag: { label } });
const longs = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ at: e.startTime, ms: r0(e.duration) }); }).observe({ type: 'longtask', buffered: false }); } catch { /* none */ }
const longsSince = (t) => longs.filter((x) => x.at >= t).map((x) => x.ms).sort((a, b) => b - a);
const mainOf = (r) => (r?.delay ? { max: r.delay.max, blocks: (r.blocks || []).map((b) => `${b.ms}ms ${(b.app || []).slice(0, 2).join(' | ')}`).slice(0, 4) } : null);
const blocksOver = (r, ms) => (r?.blocks || []).filter((b) => b.ms >= ms);
const ipcN = (r, re) => (r?.ipc?.top || []).filter((x) => re.test(x.k)).reduce((a, x) => a + x.n, 0);
const key = async (k, code, mods = 0) => { for (const type of ['rawKeyDown', 'keyUp']) await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: k, code, modifiers: mods, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : k === 'Enter' ? 13 : k === 'Escape' ? 27 : 0 } }); };
const gc = async () => { for (let i = 0; i < 3; i++) { await smoke({ cdp: 'HeapProfiler.collectGarbage', params: {} }).catch(() => {}); await wait(150); } };
const heap = async () => { await gc(); const r = await smoke({ cdp: 'Runtime.getHeapUsage', params: {} }).catch(() => null); return r?.usedSize || performance.memory?.usedJSHeapSize || 0; };
const CW = () => Native._rest?.W?.x || null;
const cwStats = () => { const s = CW()?.stats?.(); return s ? { windowed: s.windowed, loaded: s.loaded, total: s.total, ranges: s.ranges, fetched: s.fetched, released: s.released, wholes: s.wholes.map((w) => `${w.why} ${w.ms}ms`), misses: s.misses.length, poisoned: s.poisoned } : null; };
let wholesSeen = 0;
const newWholes = () => { const w = CW()?.stats?.().wholes || []; const n = w.slice(wholesSeen); wholesSeen = w.length; return n; };
// a step: what it took (ms), the window's longest tasks, the main process's busy stretches
async function step(name, fn, { taskBudget = BUDGET.task, wholeOk = false } = {}) {
  await lag(`before-${name}`);
  newWholes();
  const t = performance.now();
  const res = await fn();
  const ms = r0(performance.now() - t);
  await wait(1500);
  const l = await lag(name);
  const s = { ms, windowLong: longsSince(t).slice(0, 6), main: mainOf(l), deltas: ipcN(l, /chats:delta$/), wholeSaves: ipcN(l, /chats:save$/), ranges: ipcN(l, /chats:win$/) };
  out[name] = Object.assign(s, res && typeof res === 'object' ? res : {});
  if ((s.windowLong[0] || 0) > taskBudget) out.problems.push(`${name}: the window held ${s.windowLong[0]} ms in one task (budget ${taskBudget})`);
  if (blocksOver(l, BUDGET.mainBlock).length) out.problems.push(`${name} held the main process: ${s.main.blocks.join('; ')}`);
  const w = newWholes();
  if (!OFF && w.length && !wholeOk) out.problems.push(`${name} loaded the giant chat whole: ${w.map((x) => x.why).join(', ')}`);
  if (w.length) s.loadAll = w.map((x) => `${x.why} ${x.ms}ms`);
  if (window.CW86_DEBUG) s.heapMB = MB(await heap());
  return s;
}
// messages [a, b) as they are on disk now (the store thread's range: never parsed whole here)
const disk = async (a, b) => { const r = await window.hub.chatWin('range', { id: ID, from: a, to: b }); return r?.bytes ? { n: r.n, msgs: JSON.parse(new TextDecoder().decode(r.bytes)).messages } : null; };

await until(() => document.querySelector('#panel .item'), 600);
await wait(5000);
if (!(await lag('boot'))?.delay) out.problems.push('the main lag probe is off (HEARTH_LOOPLAG)');
store.set('chat.window86', !OFF);
const claude = H.claudeAgent();
if (!(H.chats || []).some((c) => c.id === ID)) { out.problems.push('the giant chat is not in the list'); return JSON.stringify(out); }
activate(claude.id); await wait(800);
const other = (H.chats || []).find((c) => c.agentId === claude.id && c.id !== ID && !/giant/.test(c.id));
if (other) { Native.open(claude.id, other.id); await wait(1500); }
const v = () => Native.view(claude.id); const list = () => v()?.list;
const dataDir = String(await window.hub.attachmentsDir()).replace(/[\\/]attachments[\\/]?$/, '');
const sep = /\\/.test(dataDir) ? '\\' : '/';
const chatFile = `${dataDir}${sep}chats${sep}${ID}.json`; const side = `${dataDir}${sep}cw86-other-computer.json`;
await window.hub.fs.copy(chatFile, side); // (the version the "other computer" will send back at the end)
const heap0 = await heap();

// ---------- open ----------
await step('open', async () => {
  Native.open(claude.id, ID);
  const drawn = await until(() => H.activeChat[claude.id] === ID && list()?.querySelector('.msg[data-index="5999"]'), 800);
  await wait(1200);
  const L = list();
  return { drawn: Boolean(drawn), atEnd: Boolean(L && L.scrollHeight - L.scrollTop - L.clientHeight < 80) };
});
const chat = Native.current(claude.id);
const heap1 = await heap();
out.heap = { beforeMB: MB(heap0), openMB: MB(heap1), giantMB: MB(heap1 - heap0) };
out.open.messages = chat?.messages?.length; out.open.windowed = Boolean(Native.isWin?.(chat)); out.open.cw = cwStats();
if (!out.open.drawn || out.open.messages !== 6000) out.problems.push(`open: ${JSON.stringify({ drawn: out.open.drawn, messages: out.open.messages })}`);
if (!out.open.atEnd) out.problems.push('open: not at the end of the chat');
if (!OFF && !out.open.windowed) out.problems.push('open: the giant chat was not opened windowed');
if (!OFF && out.heap.giantMB > BUDGET.heapMB) out.problems.push(`open: the giant chat takes ${out.heap.giantMB} MB of the window's heap (budget ${BUDGET.heapMB})`);
await wait(2000);

// ---------- scroll to the very top, then back to the end ----------
await step('top', async () => {
  const t = performance.now(); let first = null;
  for (let i = 0; i < 400 && !first; i++) { list().scrollTop = 0; await wait(120); first = list().querySelector('.msg[data-index="0"]'); }
  const ms = r0(performance.now() - t);
  await wait(800);
  return { reached: Boolean(first), toTopMs: ms };
});
if (!out.top.reached) out.problems.push('top: message #1 never drawn');
for (let i = 0; i < 6; i++) { list().scrollTop = list().scrollHeight; await wait(400); }
await wait(2500);
out.top.after = cwStats();

// ---------- find a word only in #30, jump to #100 ----------
await step('find', async () => {
  v().input.focus();
  await key('f', 'KeyF', 1); await wait(300);
  const bar = v().root.querySelector('.chat-find input');
  if (bar) { bar.focus(); await smoke({ cdp: 'Input.insertText', params: { text: RARE } }); await wait(400); await key('Enter', 'Enter'); }
  const hit = await until(() => list().querySelector('.msg[data-index="30"] mark.find-hit'), 300);
  const r = { bar: Boolean(bar), found: Boolean(hit), count: v().root.querySelector('.chat-find .find-count')?.textContent || null };
  if (bar) { await key('Escape', 'Escape'); await wait(200); }
  return r;
});
if (!out.find.found) out.problems.push(`find: ${JSON.stringify({ bar: out.find.bar, found: out.find.found, count: out.find.count })}`);
await step('jump', async () => {
  Native.jumpTo(claude.id, 100);
  const n = await until(() => list().querySelector('.msg[data-index="100"]'), 300);
  await wait(500);
  const r = n?.getBoundingClientRect(); const lr = list().getBoundingClientRect();
  return { found: Boolean(n), onScreen: Boolean(r && r.bottom > lr.top && r.top < lr.bottom) };
});
if (!out.jump.found || !out.jump.onScreen) out.problems.push(`jump: ${JSON.stringify({ found: out.jump.found, onScreen: out.jump.onScreen })}`);
for (let i = 0; i < 6; i++) { list().scrollTop = list().scrollHeight; await wait(400); }
await wait(2000);

// ---------- send ----------
const sendText = async (text) => {
  const n0 = chat.messages.length;
  const ta = v()?.input;
  ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.closest('form').requestSubmit();
  return until(() => chat.messages.length >= n0 + 2 && chat.messages.at(-1).role !== 'user' && !document.querySelector('.surface.active .msg.streaming'), 1200);
};
const said = `chatwindow86 says hi ${Date.now()}`;
await step('send', async () => { const ok = await sendText(said); await wait(1500); return { replied: Boolean(ok), n: chat.messages.length }; });
{
  const d = await disk(chat.messages.length - 2, chat.messages.length);
  out.send.disk = { n: d?.n, text: d?.msgs?.[0]?.text === said, reply: d?.msgs?.[1]?.role };
  if (!out.send.replied || d?.n !== chat.messages.length || !out.send.disk.text) out.problems.push(`send: ${JSON.stringify(out.send.disk)}`);
  if (!OFF && (!out.send.deltas || out.send.wholeSaves)) out.problems.push(`send: saved ${out.send.deltas} by change, ${out.send.wholeSaves} whole`);
}

// ---------- a reaction on a message that was never loaded ----------
const OLD = 2001;
const before = await disk(OLD - 1, OLD + 2);
await step('react', async () => {
  const loadedBefore = !OFF && CW()?.has(chat, OLD);
  await Native.react(claude.id, OLD, '🔥');
  await wait(1500);
  return { loadedBefore };
});
{
  const after = await disk(OLD - 1, OLD + 2);
  const ok = after && after.msgs[1]?.reaction?.emoji === '🔥' && JSON.stringify(after.msgs[0]) === JSON.stringify(before.msgs[0]) && JSON.stringify(after.msgs[2]) === JSON.stringify(before.msgs[2]) && JSON.stringify({ ...after.msgs[1], reaction: undefined }) === JSON.stringify({ ...before.msgs[1], reaction: undefined });
  out.react.landed = Boolean(ok);
  if (!ok) out.problems.push('react: the reaction on #2002 did not land exactly there');
  if (!OFF && (!out.react.deltas || out.react.wholeSaves)) out.problems.push(`react: saved ${out.react.deltas} by change, ${out.react.wholeSaves} whole`);
}

// ---------- edit-from-here on an older message of yours (not loaded) ----------
const EDIT = chat.messages.findLastIndex((m, i) => i < 5600 && m.role === 'user');
const keep = await disk(EDIT - 3, EDIT);
const edited = `edited by chatwindow86 ${Date.now()}`;
const prompt0 = Modal.prompt;
Modal.prompt = async () => edited;
try {
  await step('edit', async () => {
    const loadedBefore = !OFF && CW()?.has(chat, EDIT);
    Native.edit(claude.id, EDIT);
    const ok = await until(() => chat.messages.length === EDIT + 2 && chat.messages[EDIT]?.text === edited && chat.messages.at(-1).role !== 'user' && !document.querySelector('.surface.active .msg.streaming'), 1200);
    await wait(1500);
    return { at: EDIT, replied: Boolean(ok), n: chat.messages.length, loadedBefore };
  });
} finally { Modal.prompt = prompt0; }
{
  const d = await disk(EDIT - 3, EDIT + 2);
  const ok = d && d.n === EDIT + 2 && d.msgs[3]?.text === edited && d.msgs[3]?.edited && JSON.stringify(d.msgs.slice(0, 3)) === JSON.stringify(keep.msgs);
  out.edit.disk = { n: d?.n, edited: d?.msgs?.[3]?.text === edited };
  if (!out.edit.replied || !ok) out.problems.push(`edit: ${JSON.stringify(out.edit.disk)} (want ${EDIT + 2} messages)`);
  if (!OFF && (!out.edit.deltas || out.edit.wholeSaves)) out.problems.push(`edit: saved ${out.edit.deltas} by change, ${out.edit.wholeSaves} whole`);
}

// ---------- export (load-all) ----------
if (typeof ChatCmds === 'undefined' && window.Lazy?.load) await Lazy.load('chatcmds');
const saves = window.SMOKE_SAVES || '';
const sp = /\\/.test(saves) ? '\\' : '/';
const fileOf = (f) => `${saves}${sp}${chat.title.replace(/[\\/:*?"<>|]/g, '_')}.${f}`;
await step('export', async () => {
  await Commands.exec('/export json', claude.id, { say: () => {}, note: () => {} });
  const st = await until(() => window.hub.fs.stat(fileOf('json')), 300);
  return { bytes: st?.size || 0 };
}, { wholeOk: true });
out.export.loadedWhole = !Native.isWin?.(chat);
out.export.same = await (async () => { // (the chat as it is now, whole; its 57 MB strings let go before the heap is read)
  const got = await window.hub.fs.read(fileOf('json'), { maxBytes: 200 * 1048576 }).catch(() => null);
  const want = Native.isWin?.(chat) ? null : JSON.stringify({ ...chat, session: undefined, hearthExport: 1 }, null, 2);
  if (got !== want) out.problems.push(`export: the file differs from the whole-chat way (${got?.length} vs ${want?.length})`);
  return got === want;
})();
out.heap.exportWholeMB = MB((await heap()) - heap0);
if (!OFF) { // a minute later the chat goes back to its window (here at once)
  out.export.backToWindow = Boolean(CW()?.rewindow(chat, true) && Native.isWin(chat));
  out.heap.afterExportMB = MB((await heap()) - heap0);
  if (!out.export.backToWindow) out.problems.push('export: the chat did not go back to its window');
}

// ---------- sync: the chat file replaced (the other computer's version), let go and opened again ----------
await window.hub.fs.copy(side, chatFile);
await step('sync', async () => {
  H.chats = await window.hub.listChats(); Panel.render?.();
  const forgot = Native.forget(ID);
  Native.refresh(claude.id, { keepScroll: true });
  const drawn = await until(() => Native.current(claude.id) && Native.current(claude.id) !== chat && list()?.querySelector('.msg[data-index="5999"]'), 800);
  await wait(1200);
  const c = Native.current(claude.id);
  return { forgot, drawn: Boolean(drawn), messages: c?.messages?.length, windowed: Boolean(Native.isWin?.(c)) };
});
if (!out.sync.drawn || out.sync.messages !== 6000) out.problems.push(`sync: ${JSON.stringify({ drawn: out.sync.drawn, messages: out.sync.messages })}`);
if (!OFF && !out.sync.windowed) out.problems.push('sync: the chat did not open windowed again');
out.heap.endMB = MB((await heap()) - heap0);

const s = CW()?.stats?.();
out.cw = cwStats();
if (s?.misses?.length) { out.misses = [...new Map(s.misses.map((x) => [x.where.split(' | ').slice(2, 4).join(' | '), `#${x.k} ${x.key}`])).entries()].slice(0, 30); out.problems.push(`${s.misses.length} read(s) reached a message that wasn't loaded: ${s.misses.slice(0, 3).map((x) => `#${x.k} ${x.key} at ${x.where}`).join(' ; ')}`); }
if (s?.poisoned) out.problems.push(`${s.poisoned} change(s) refused (poisoned)`);
await window.hub.fs.trash?.(side).catch(() => {});
if (window.CW_REPORT) out.problems.length = 0;
return JSON.stringify(out);
