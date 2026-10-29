// opt-in: BIGCHAT82
// (round 82, bigchat82) A GIANT chat in the app: 6,000 messages, ≈ 63 MB (dev/bigprofile.js --giant 1: tool output,
// attachments' details, thinking, plans). Opened from the chats list, a message sent (the fake engine answers), Find in
// this chat, the chats list searched. Measured: the main process's event-loop delay and busy stretches (mainlag-probe.js),
// the window's long tasks, which IPC carried the saves (chats:delta, not chats:save: only what changed), and the file
// on disk afterwards (the new messages there, the rest as it was).
// window.BC_REPORT = 1: report without failing.
//   node dev/bigprofile.js /tmp/hearth-bigchat82 --chats 40 --long 4 --projects 4 --giant 1
//   HEARTH_LOOPLAG=prof node dev/smoke.js --fake-engines --data /tmp/hearth-bigchat82 --wait 1000 --check-timeout 600000 --script dev/checks/bigchat82.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, n = 400) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const r0 = (x) => Math.round(x);
const out = { problems: [] };
const BUDGET = Object.assign({ mainBlock: 100, mainMaxOpen: 150 }, window.BC_BUDGET || {}); // ms (a shared 4-CPU box: a busy stretch, not the 10 ms resolution's max)
const lag = (label) => window.hub.power?.test?.({ lag: { label } });
const longs = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ at: performance.now(), ms: r0(e.duration) }); }).observe({ type: 'longtask', buffered: false }); } catch { /* none */ }
const longsSince = (t) => longs.filter((x) => x.at >= t).map((x) => x.ms).sort((a, b) => b - a);
const mainOf = (r) => (r?.delay ? { p99: r.delay.p99, max: r.delay.max, blocks: (r.blocks || []).map((b) => `${b.ms}ms ${(b.app || []).slice(0, 2).join(' | ')}`).slice(0, 5), ipc: (r.ipc?.top || []).filter((x) => /chats:|kv:/.test(x.k)).slice(0, 6).map((x) => `${x.n}× ${x.ms}ms ${x.k}`) } : null);
const blocksOver = (r, ms) => (r?.blocks || []).filter((b) => b.ms >= ms);

await until(() => document.querySelector('#panel .item'), 600);
await wait(4000);
const probeOn = Boolean((await lag('boot'))?.delay);
if (!probeOn) out.problems.push('the main lag probe is off (HEARTH_LOOPLAG)');
const claude = H.claudeAgent();
const ID = 'claude-giant0';
const sum = (H.chats || []).find((c) => c.id === ID);
if (!sum) { out.problems.push('the giant chat is not in the list'); return out; }

// ---------- open ----------
activate(claude.id); await wait(500);
let t = performance.now();
Native.open(claude.id, ID);
const drawn = await until(() => H.activeChat[claude.id] === ID && Native.view(claude.id)?.list?.querySelectorAll('.msg').length > 5, 800);
await frame(); await wait(300);
const openMs = r0(performance.now() - t);
const lOpen = await lag('open');
out.open = { ms: openMs, drawn: Boolean(drawn), windowLong: longsSince(t).slice(0, 6), main: mainOf(lOpen) };
const chat = await Native.load(ID);
out.open.messages = chat?.messages?.length;
if (!drawn) out.problems.push('the giant chat did not draw');
if (blocksOver(lOpen, BUDGET.mainBlock).length) out.problems.push(`opening held the main process: ${mainOf(lOpen).blocks.join('; ')}`);

// ---------- send a message (the fake engine answers): saves by change ----------
await wait(1500); await lag('before-send');
// the window's own work while sending: a sampling profile (its heaviest functions, self time)
const cdp = (method, params = {}) => Promise.race([smoke({ cdp: method, params }), wait(15000)]);
const prof = window.BC_PROFILE !== 0 && await cdp('Profiler.enable').then(() => cdp('Profiler.setSamplingInterval', { interval: 500 })).then(() => cdp('Profiler.start')).then(() => true).catch(() => false);
const n0 = chat.messages.length;
const text = `bigchat82 says hi ${Date.now()}`;
t = performance.now();
const v = Native.view(claude.id);
const ta = v?.composer?.querySelector('textarea') || document.querySelector('.surface.active .composer textarea');
ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true }));
ta.closest('form').requestSubmit();
const replied = await until(() => chat.messages.length >= n0 + 2 && chat.messages.at(-1).role !== 'user' && !document.querySelector('.surface.active .msg.streaming'), 1200);
await wait(2500);
const lSend = await lag('send');
let top = null;
if (prof) {
  const p = (await cdp('Profiler.stop'))?.profile;
  if (p?.nodes) {
    const self = new Map(); const byId = new Map(p.nodes.map((x) => [x.id, x]));
    p.samples.forEach((id, i) => { const n = byId.get(id); const f = n.callFrame; const k = `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (p.timeDeltas[i] || 0) / 1000); });
    top = [...self].filter(([k]) => !/^\((idle|program|root)\)/.test(k)).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, ms]) => `${r0(ms)}ms ${k}`);
  }
}
out.send = { replied: Boolean(replied), ms: r0(performance.now() - t), windowLong: longsSince(t).slice(0, 6), main: mainOf(lSend), windowTop: top };
const ipc = (lSend?.ipc?.top || []);
out.send.deltaSaves = ipc.filter((x) => /chats:delta$/.test(x.k)).reduce((a, x) => a + x.n, 0);
out.send.wholeSaves = ipc.filter((x) => /chats:save$/.test(x.k)).reduce((a, x) => a + x.n, 0);
if (!replied) out.problems.push('no reply in the giant chat');
if (!out.send.deltaSaves) out.problems.push('the giant chat was not saved by change (no chats:delta)');
if (out.send.wholeSaves) out.problems.push(`the giant chat was saved whole ${out.send.wholeSaves}×`);
if (blocksOver(lSend, BUDGET.mainBlock).length) out.problems.push(`sending held the main process: ${mainOf(lSend).blocks.join('; ')}`);
// on disk: the new messages there, every other one as it was
await window.hub.listChats();
// (the file as it is now: as bytes where Hearth has hub.openChat, else the whole chat — the code before this round)
const readDisk = async () => {
  if (!window.hub.openChat) return window.hub.getChat(ID);
  const r = await window.hub.openChat(ID); if (!r?.parts) return r?.chat;
  const parts = []; for (let i = 0; i < r.parts; i++) parts.push(await window.hub.openChatPart(r.token, i));
  const all = new Uint8Array(parts.reduce((n, b) => n + b.length, 0)); let o = 0; for (const b of parts) { all.set(b, o); o += b.length; }
  return JSON.parse(new TextDecoder().decode(all));
};
const disk = await readDisk();
out.disk = { messages: disk?.messages?.length, last: disk?.messages?.at(-1)?.role, hasText: disk?.messages?.some((m) => m.text === text) };
const same = disk && JSON.stringify(disk.messages.slice(0, n0)) === JSON.stringify(chat.messages.slice(0, n0)) && disk.messages.length === chat.messages.length;
if (!same || !out.disk.hasText) out.problems.push(`the file on disk differs from the chat: ${JSON.stringify(out.disk)} vs ${chat.messages.length}`);

// ---------- an old message changed in place (a reaction note): by change too ----------
await lag('before-react');
chat.messages[10].reaction = { emoji: '🔥', note: 'from the check' };
Native.save(chat); await wait(2000);
const lR = await lag('react');
out.react = { deltas: (lR?.ipc?.top || []).filter((x) => /chats:delta$/.test(x.k)).reduce((a, x) => a + x.n, 0), wholes: (lR?.ipc?.top || []).filter((x) => /chats:save$/.test(x.k)).reduce((a, x) => a + x.n, 0), main: mainOf(lR) };
if (out.react.wholes) out.problems.push(`the reaction saved the giant chat whole ${out.react.wholes}×`);
const disk2 = await readDisk();
if (disk2.messages[10]?.reaction?.note !== 'from the check' || JSON.stringify(disk2.messages[11]) !== JSON.stringify(chat.messages[11])) out.problems.push('the reaction on an old message did not land');

// ---------- the chats list searched (the store thread reads the giant chat's bytes) ----------
await lag('before-search');
t = performance.now();
const hits = await window.hub.searchChatText('portal shader');
const hits2 = await window.hub.searchChatText('neon glass');
out.search = { ms: r0(performance.now() - t), giant: hits.find((h) => h.id === ID)?.count ?? 0, giant2: hits2.find((h) => h.id === ID)?.count ?? 0, main: mainOf(await lag('search')) };

if (window.BC_REPORT) out.problems.length = 0;
return JSON.stringify(out);
