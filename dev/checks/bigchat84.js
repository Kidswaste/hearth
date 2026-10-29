// opt-in: BIGCHAT84
// (round 84, bigchat84) A GIANT chat (6,000 messages, ≈ 63 MB: dev/bigchat84-fixture.js) opened, exported and restored
// in the app. Measured: the window's longest task (PerformanceObserver longtask) and the main process's busy stretches
// (mainlag-probe.js, HEARTH_LOOPLAG=prof) for each step, and that nothing changed in what you get:
//   open      from the click until the chat is drawn and settled: the longest window task ≤ 50 ms; at the end (the scroll
//             at the bottom, the last message drawn); a jump to #100 (a resting block woken, on screen); Find (Alt+F) of
//             a word only in #30: marked
//   export    /export json, md, html (to files, the smoke's save folder): the longest window task and main block; the
//             JSON file = JSON.stringify({ ...chat, session: undefined, hearthExport: 1 }, null, 2) byte for byte
//   restore   Earlier versions › the kept version (10 messages fewer) restored, then its Undo (6,000 again): the main
//             process never busy ≥ 100 ms
//   trash     Recently deleted (a second giant chat there) listed by the chats' Trash and Deleted things, brought back
// window.BC_REPORT = 1: report without failing (the code before this round: the same steps, its numbers).
//   node dev/bigchat84-fixture.js /tmp/hearth-bigchat84
//   HEARTH_LOOPLAG=prof node dev/smoke.js --fake-engines --data /tmp/hearth-bigchat84 --wait 1000 --check-timeout 900000 --script dev/checks/bigchat84.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, n = 400) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const r0 = (x) => Math.round(x);
const out = { problems: [] };
const BUDGET = Object.assign({ openTask: 50, task: 50, mainBlock: 100 }, window.BC_BUDGET || {}); // ms
const RARE = 'zanzibar84quokka';
const lag = (label) => window.hub.power?.test?.({ lag: { label } });
const longs = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ at: e.startTime, ms: r0(e.duration) }); }).observe({ type: 'longtask', buffered: false }); } catch { /* none */ }
const longsSince = (t) => longs.filter((x) => x.at >= t).map((x) => x.ms).sort((a, b) => b - a);
const mainOf = (r) => (r?.delay ? { max: r.delay.max, blocks: (r.blocks || []).map((b) => `${b.ms}ms ${(b.app || []).slice(0, 2).join(' | ')}`).slice(0, 4) } : null);
const blocksOver = (r, ms) => (r?.blocks || []).filter((b) => b.ms >= ms);
const key = async (k, code, mods = 0) => { for (const type of ['rawKeyDown', 'keyUp']) await smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: k, code, modifiers: mods, windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : k === 'Enter' ? 13 : k === 'Escape' ? 27 : 0 } }); };
// a step: what it took (ms), the window's longest tasks, the main process's busy stretches
async function step(name, fn, { taskBudget = BUDGET.task } = {}) {
  await lag(`before-${name}`);
  const t = performance.now();
  const res = await fn();
  const ms = r0(performance.now() - t);
  await wait(1500);
  const l = await lag(name);
  const s = { ms, windowLong: longsSince(t).slice(0, 6), main: mainOf(l) };
  out[name] = Object.assign(s, res && typeof res === 'object' ? res : {});
  if ((s.windowLong[0] || 0) > taskBudget) out.problems.push(`${name}: the window held ${s.windowLong[0]} ms in one task (budget ${taskBudget})`);
  if (blocksOver(l, BUDGET.mainBlock).length) out.problems.push(`${name} held the main process: ${s.main.blocks.join('; ')}`);
  return s;
}

await until(() => document.querySelector('#panel .item'), 600);
await wait(5000);
if (!(await lag('boot'))?.delay) out.problems.push('the main lag probe is off (HEARTH_LOOPLAG)');
const claude = H.claudeAgent();
const ID = 'claude-giant0';
if (!(H.chats || []).some((c) => c.id === ID)) { out.problems.push('the giant chat is not in the list'); return JSON.stringify(out); }
activate(claude.id); await wait(800);
const v = () => Native.view(claude.id); const list = () => v()?.list;

// ---------- open ----------
await step('open', async () => {
  Native.open(claude.id, ID);
  const drawn = await until(() => H.activeChat[claude.id] === ID && list()?.querySelector(`.msg[data-index="5999"]`), 800);
  await wait(800);
  const L = list();
  return { drawn: Boolean(drawn), atEnd: Boolean(L && L.scrollHeight - L.scrollTop - L.clientHeight < 80), messages: (await Native.load(ID))?.messages?.length };
}, { taskBudget: BUDGET.openTask });
if (!out.open.drawn || out.open.messages !== 6000) out.problems.push(`open: ${JSON.stringify({ drawn: out.open.drawn, messages: out.open.messages })}`);
if (!out.open.atEnd) out.problems.push('open: not at the end of the chat');
await wait(2500); // (its older words made in idle moments: autocompact)

// a jump to a resting message, and Find of a word only in #30 (both wake their block)
{
  Native.jumpTo(claude.id, 100);
  const n = await until(() => list().querySelector('.msg[data-index="100"]'), 200);
  await wait(500);
  const r = n?.getBoundingClientRect(); const lr = list().getBoundingClientRect();
  out.jump = { found: Boolean(n), onScreen: Boolean(r && r.bottom > lr.top && r.top < lr.bottom) };
  if (!out.jump.found || !out.jump.onScreen) out.problems.push(`jump: ${JSON.stringify(out.jump)}`);
  v().input.focus();
  await key('f', 'KeyF', 1); await wait(300);
  const bar = v().root.querySelector('.chat-find input');
  if (bar) { bar.focus(); await smoke({ cdp: 'Input.insertText', params: { text: RARE } }); await wait(400); await key('Enter', 'Enter'); }
  const hit = await until(() => list().querySelector('.msg[data-index="30"] mark.find-hit'), 200);
  out.find = { bar: Boolean(bar), found: Boolean(hit), count: v().root.querySelector('.chat-find .find-count')?.textContent || null };
  if (!out.find.found) out.problems.push(`find: ${JSON.stringify(out.find)}`);
  if (bar) { await key('Escape', 'Escape'); await wait(200); }
  for (let i = 0; i < 4; i++) { list().scrollTop = list().scrollHeight; await wait(250); }
}

// ---------- export ----------
if (typeof ChatCmds === 'undefined' && window.Lazy?.load) await Lazy.load('chatcmds');
const chat = await Native.load(ID);
const saves = window.SMOKE_SAVES || '';
const sep = /\\/.test(saves) ? '\\' : '/';
const fileOf = (f) => `${saves}${sep}${chat.title.replace(/[\\/:*?"<>|]/g, '_')}.${f}`;
for (const f of ['json', 'md', 'html']) {
  await step(`export_${f}`, async () => {
    await Commands.exec(`/export ${f}`, claude.id, { say: () => {}, note: () => {} });
    const st = await until(() => window.hub.fs.stat(fileOf(f)), 300);
    return { bytes: st?.size || 0 };
  });
  if (!out[`export_${f}`].bytes) out.problems.push(`export ${f}: no file`);
}
{ // the JSON file: byte for byte the whole-chat way (made here, after the measures)
  const got = await window.hub.fs.read(fileOf('json'), { maxBytes: 200 * 1048576 }).catch(() => null);
  const want = JSON.stringify({ ...chat, session: undefined, hearthExport: 1 }, null, 2);
  out.exportSame = got === want;
  if (!out.exportSame) out.problems.push(`export json differs from the whole-chat way (${got?.length} vs ${want.length})`);
}

// ---------- restore an earlier version, then its Undo ----------
if (typeof Versions === 'undefined' && window.Lazy?.load) await Lazy.load('versions');
const S = { kind: 'chat', id: ID };
let listed = null;
await step('versions_list', async () => { listed = await window.hub.versions.list(S, { phase: 'local' }); return { versions: listed?.versions?.length || 0 }; }, { taskBudget: 1e9 });
const kept = (listed?.versions || []).find((e) => e.src === 'before');
if (!kept) out.problems.push('restore: the kept version is not listed');
let restored = null;
if (kept) {
  await step('restore', async () => {
    Native.forget(ID);
    restored = await window.hub.versions.restore(S, kept.token, {});
    Native.forget(ID);
    const c = await Native.load(ID);
    return { ok: Boolean(restored?.ok), error: restored?.error || null, messages: c?.messages?.length, before: Boolean(restored?.before) };
  });
  if (!out.restore.ok || out.restore.messages !== 5990) out.problems.push(`restore: ${JSON.stringify(out.restore)}`);
  if (restored?.before) {
    await step('undo', async () => {
      Native.forget(ID);
      const r = await window.hub.versions.restore(S, restored.before, { over: restored.value });
      Native.forget(ID);
      const c = await Native.load(ID);
      return { ok: Boolean(r?.ok), messages: c?.messages?.length, last: c?.messages?.at(-1)?.text === chat.messages.at(-1).text };
    });
    if (!out.undo.ok || out.undo.messages !== 6000 || !out.undo.last) out.problems.push(`undo: ${JSON.stringify(out.undo)}`);
  } else out.problems.push('restore: no kept copy of the chat before it (no Undo)');
}
Native.refresh?.(claude.id, { keepScroll: true });

// ---------- Recently deleted: a giant chat there ----------
await step('trash_list', async () => {
  const items = await window.hub.listChatTrash();
  const g = items.find((x) => x.id === 'claude-giant1');
  return { listed: Boolean(g), messages: g?.messages ?? null };
});
if (!out.trash_list.listed || out.trash_list.messages !== 6000) out.problems.push(`trash list: ${JSON.stringify(out.trash_list)}`);
let del = null;
await step('deleted_things', async () => { del = await window.hub.versions.deleted(); const g = (del?.chats || []).find((x) => x.id === 'claude-giant1'); return { listed: Boolean(g), n: g?.n ?? null, name: g?.name || null }; });
if (!out.deleted_things.listed || out.deleted_things.n !== 6000 || out.deleted_things.name !== 'A giant chat deleted') out.problems.push(`deleted things: ${JSON.stringify(out.deleted_things)}`);
const g = (del?.chats || []).find((x) => x.id === 'claude-giant1');
if (g) {
  await step('undelete', async () => { const r = await window.hub.versions.undelete(g.key); const l = await window.hub.listChats(); return { ok: Boolean(r?.ok), inList: l.some((c) => c.id === 'claude-giant1') }; });
  if (!out.undelete.ok || !out.undelete.inList) out.problems.push(`undelete: ${JSON.stringify(out.undelete)}`);
}

if (window.BC_REPORT) out.problems.length = 0;
return JSON.stringify(out);
