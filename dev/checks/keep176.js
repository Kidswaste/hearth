// (round 176, keep176) the chats kept ready for switching back give their memory back when nobody needs them
// (docs/upgrades/keep176.md), ONE check. Its own temp data folder and profile (smoke.js), the fake engines; never an
// owner's data. 9 chats of 400 turns (Markdown, code, tables, pictures, tool steps) in one project.
//   session  6 chats opened in turn (3 kept parked, round 45), one scrolled, one answering a reply
//   never    let go now (the hidden trim's own call): the chat on screen and the one answering are kept, the other
//            parked lists go; the answering one's reply ends whole
//   idle     a parked list unseen past chat.keepIdleMs (10 s here; 15 min for the owner) is let go, one parked a moment
//            ago is not, the chat on screen never
//   hidden   Hearth hidden past its deep trim (HEARTH_TRIM_DEEP_MS / chat.keepHiddenMs, 20 s here; 5 min for the owner):
//            the main process' deep trim comes, every parked list goes, the window's DOM nodes / JS heap / memory drop
//            (measured with the deep trim's own GC, then after a forced one)
//   kept     shown again: the chat on screen is the same list at the same scroll place, its draft and a released
//            chat's draft are still there, a released chat shows whole at its end (where a kept chat comes back to)
//   switch   the first switch back to a released chat costs what a switch to a chat opened afresh costs (wall time to
//            drawn, the window's main-thread task ms, the graphics process' CPU), 3 of each in turn; ≤ 125 % (+ 40 ms)
//   grow     the chat on screen stays windowed as it grows: 200 messages added at its end, then wheeled to its top and
//            back: its DOM stays within 2× what it opened with (resting blocks rest again)
// window.K176_REPORT = 1: report without failing. window.K176_OFF = 1: the hidden part without letting go (the
// before-this-round numbers: mem154's trim only).
//   node dev/smoke.js --fake-engines --check-timeout 900000 --script dev/checks/keep176.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 100) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const T = (o) => window.hub.power.test(o);
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const r1 = (x) => Math.round(x * 10) / 10;
const OFF = Boolean(window.K176_OFF);

const perf = async () => { const r = await smoke({ cdp: 'Performance.getMetrics', params: {} }); const o = {}; for (const x of r?.metrics || []) o[x.name] = x.value; return o; };
await smoke({ cdp: 'Performance.enable', params: {} });
const met = async () => (await T({ metrics: true, mem: true }))?.metrics || { procs: [], pages: [] };
const winProc = (m) => { const page = (m.pages || []).find((p) => /index\.html/.test(p.url) && p.type === 'window'); return page && m.procs.find((x) => x.pid === page.pid); };
const gc = async () => { for (let i = 0; i < 2; i++) { await smoke({ cdp: 'HeapProfiler.collectGarbage', params: {} }).catch(() => {}); await wait(150); } };
async function mem(force = true) {
  if (force) await gc();
  await wait(1200);
  const m = await met(); const p = await perf(); const w = winProc(m);
  return { domNodes: p.Nodes, elements: document.getElementsByTagName('*').length, heapMB: r1((p.JSHeapUsedSize || 0) / 1048576), winWsMB: w ? Math.round(w.mem / 1024) : null, winPrivMB: w?.priv ? Math.round(w.priv / 1024) : null, allMB: Math.round(m.procs.reduce((s, q) => s + (q.mem || 0), 0) / 1024), kept: Native._test.kept().nodes };
}
const gpuWin = async () => { const m = await met(); let gpu = 0; let win = 0; for (const q of m.procs) { if (q.type === 'GPU') gpu += q.cpuS || 0; if (m.pages.some((p) => p.pid === q.pid && p.type === 'window' && /index\.html/.test(p.url))) win += q.cpuS || 0; } return { gpu, win }; };

try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  await until(() => performance.now() > 20000, 40000); // (the start's own work first)
  localStorage.setItem('chat.keepHiddenMs', OFF ? '0' : '20000');
  const claude = H.claudeAgent(); activate(claude.id); await wait(400);
  if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects');
  await Projects.ready(); await until(() => ProjChats._ok(), 20000);

  // ---------- the chats (audit166's long session) ----------
  const root = decodeURIComponent(new URL('.', location.href).pathname).replace(/^\/([A-Za-z]:)/, '$1');
  const png = `${root}assets/swirl.svg`;
  const code = (n, k) => ['```js', ...Array.from({ length: n }, (_, j) => `const v${j} = scene.getObjectByName('layer${k}_${j}'); // tweak ${j}`), '```'].join('\n');
  const table = (n) => ['| part | value | note |', '|---|---:|---|', ...Array.from({ length: n }, (_, j) => `| bloom ${j} | ${j * 3} | glow ${j} |`)].join('\n');
  const replyText = (i) => [`Reply ${i}: **the plan** with \`code\` and a [link](https://example.com/${i}).`, '', '- one thing', '- another, a little longer, to wrap across the line', '',
    i % 4 === 1 ? code(i % 3 === 0 ? 40 : 10, i) : 'A paragraph of plain words to give it some height and wrap once or twice in the chat width here.',
    i % 7 === 3 ? `\n${table(6)}` : '', i % 9 === 5 ? `\n![frame ${i}](https://img.hearth.test/640x360/${i}.png)` : ''].join('\n');
  const msg = (i, t0) => (i % 2 === 0
    ? { role: 'user', text: `Question ${i}: what about this part?`, at: t0 + i * 60000, ...(i % 40 === 10 ? { attachments: [{ kind: 'image', name: 'ref.png' }], images: [png] } : {}) }
    : { role: 'assistant', text: replyText(i), at: t0 + i * 60000, usage: { input: 2000 + i, output: 300 + i }, ...(i % 3 === 2 ? { tools: ['Read', 'Grep', 'mcp__hearth__three_eval'] } : {}), ...(i % 15 === 7 ? { shows: [{ path: png, caption: `shot ${i}` }] } : {}) });
  const fixture = (N, tag) => { const t0 = Date.now() - N * 60000; return { id: `k176-${tag}-${Date.now()}`, agentId: claude.id, title: `Session ${tag}`, createdAt: t0, updatedAt: Date.now(), messages: Array.from({ length: N }, (_, i) => msg(i, t0)) }; };
  const proj = Projects.create({ name: 'Keep176 project' }); ProjChats.setScope(proj.id); await wait(300);
  const ids = [];
  for (let j = 0; j < 9; j++) {
    const c = fixture(400, j); await window.hub.saveChat(c); Native.save(c);
    H.chats = [{ id: c.id, agentId: c.agentId, title: c.title, updatedAt: c.updatedAt, pinned: false }, ...H.chats.filter((x) => x.id !== c.id)];
    Projects.add(proj, 'chat', c.id, c.title, { links: false }); ids.push(c.id);
  }
  await Projects.flush?.();
  const v = () => Native.view(claude.id);
  const list = () => v().list;
  const shown = (id) => H.activeChat[claude.id] === id && list()?.querySelectorAll('.msg').length >= 20;
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const openChat = async (id, settle = 1200) => { Native.open(claude.id, id); await until(() => shown(id), 15000, 10); await frame(); if (settle) await wait(settle); };
  const keptIds = () => Native._test.kept().ids;
  const typeDraft = async (text) => { const box = v().input; box.focus(); box.value = text; box.dispatchEvent(new Event('input', { bubbles: true })); await wait(700); box.blur(); };
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseMoved', x: 2, y: innerHeight - 10 } }); // (no hover)

  // ---------- session ----------
  const [A, B, C, D, E, X] = ids; const fresh = ids.slice(6);
  for (const id of [A, B, C, D, E]) await openChat(id);
  const empty = await mem(); out.measure.fiveOpened = empty;
  // ---------- idle: a parked list unseen past chat.keepIdleMs ----------
  localStorage.setItem('chat.keepIdleMs', '10000');
  await openChat(D, 300); await openChat(E, 300); // (A, B, C parked long ago, D just now; E on screen: re-armed)
  const before0 = keptIds();
  await openChat(D, 300); // (E parked a moment ago)
  const t0 = Date.now();
  await until(() => !keptIds().includes(C) || Date.now() - t0 > 14000, 16000, 200);
  const idleIds = keptIds();
  step('idle: a parked list unseen past chat.keepIdleMs is let go; one parked a moment ago is not; the chat on screen is kept',
    before0.includes(C) && !idleIds.includes(C) && idleIds.includes(E) && H.activeChat[claude.id] === D && list().isConnected && Native._test.keep().idle >= 1,
    { before: before0.map((k) => ids.indexOf(k)), after: idleIds.map((k) => ids.indexOf(k)), keep: Native._test.keep() });
  localStorage.removeItem('chat.keepIdleMs'); // (the owner's 15 min for the rest)
  await openChat(A); await openChat(B); await openChat(C); // (kept again: B, C, D parked… the last 3)

  // ---------- never: the chat on screen and the one answering ----------
  await openChat(X);
  await Native.send(claude.id, 'slow long reply please');
  await until(() => Native.isBusy(X), 8000, 50);
  await openChat(E, 600); // (X parked while it answers; E on screen)
  const busyNow = Native.isBusy(X);
  const onScreen = list();
  const nowN = Native._test.release('hidden');
  const afterNever = keptIds();
  step('never: letting go keeps the chat on screen and the one answering; the other parked lists go',
    busyNow && afterNever.includes(X) && list() === onScreen && onScreen.isConnected && H.activeChat[claude.id] === E && nowN >= 1 && afterNever.length === 1,
    { busy: busyNow, let: nowN, kept: afterNever.map((k) => ids.indexOf(k)) });
  await until(() => !Native.isBusy(X), 60000, 200);
  const xChat = await Native.load(X);
  const last = xChat?.messages?.[xChat.messages.length - 1];
  step('never: the answering chat\'s reply ended whole while parked', last?.role === 'assistant' && String(last.text || '').length > 200, { len: String(last?.text || '').length });

  // the session before going away: 3 parked (A..D order), E scrolled up, drafts in E and in one parked chat
  await openChat(A); await openChat(B); await typeDraft('draft in B, kept while B rests'); await openChat(C); await openChat(E);
  await typeDraft('draft in E, the chat on screen');
  list().scrollTop = Math.round(list().scrollHeight * 0.5); await wait(900);
  const eList = list(); const eTop = eList.scrollTop;
  const sess = await mem(); out.measure.session = sess;

  // ---------- hidden ----------
  const deep0 = (await T({ memtrim: true }))?.memtrim?.deep || 0;
  const h0 = Native._test.keep().hidden;
  await T({ window: 'hide' });
  await until(() => document.visibilityState === 'hidden', 5000);
  const deepOk = await until(async () => ((await T({ memtrim: true }))?.memtrim?.deep || 0) > deep0, 60000, 500);
  await until(() => OFF || Native._test.keep().hidden > h0, 30000, 300);
  await wait(4000);
  const natural = await mem(false); out.measure.hiddenNoForcedGc = natural;
  const hidden = await mem(true); out.measure.hidden = hidden;
  const k = Native._test.keep();
  step('hidden: the main process\' deep trim came and every parked list was let go (the chat on screen kept)',
    Boolean(deepOk) && (OFF || (k.hidden > h0 && keptIds().length === 0 && eList.isConnected)), { deep: (await T({ memtrim: true }))?.memtrim, keep: k, kept: keptIds().length });
  const dropped = { domNodes: sess.domNodes - hidden.domNodes, heapMB: r1(sess.heapMB - hidden.heapMB), winPrivMB: (sess.winPrivMB ?? 0) - (hidden.winPrivMB ?? 0), winWsMB: (sess.winWsMB ?? 0) - (hidden.winWsMB ?? 0) };
  out.measure.dropped = dropped;
  step('hidden: DOM nodes and the window\'s memory drop (≥ 40 % of the nodes)', OFF || (hidden.domNodes <= sess.domNodes * 0.6 && dropped.winPrivMB > 0), { session: sess, hidden, dropped });

  // ---------- kept: shown again ----------
  await T({ window: 'show' }); await until(() => document.visibilityState === 'visible', 5000); await wait(1000);
  step('kept: the chat on screen is the same list at the same place, its draft there',
    list() === eList && Math.abs(list().scrollTop - eTop) <= 2 && v().input.value === 'draft in E, the chat on screen', { top: [eTop, list().scrollTop], draft: v().input.value.slice(0, 40) });

  // ---------- switch: released vs afresh ----------
  const cost = async (id) => {
    const a = await gpuWin(); const p0 = await perf(); const t = performance.now();
    Native.open(claude.id, id); await until(() => shown(id), 15000, 5); await frame(); const ms = performance.now() - t;
    await wait(900);
    const b = await gpuWin(); const p1 = await perf();
    return { ms: Math.round(ms), taskMs: Math.round((p1.TaskDuration - p0.TaskDuration) * 1000), gpuMs: Math.round((b.gpu - a.gpu) * 1000) };
  };
  const rel = []; const frs = []; const order = OFF ? [] : [[B, fresh[0]], [C, fresh[1]], [A, fresh[2]]];
  for (const [r, f] of order) { rel.push(await cost(r)); frs.push(await cost(f)); }
  const mean = (a, key) => (a.length ? Math.round(a.reduce((s, x) => s + x[key], 0) / a.length) : 0);
  const sw = { released: { ms: mean(rel, 'ms'), taskMs: mean(rel, 'taskMs'), gpuMs: mean(rel, 'gpuMs') }, fresh: { ms: mean(frs, 'ms'), taskMs: mean(frs, 'taskMs'), gpuMs: mean(frs, 'gpuMs') }, each: { rel, frs } };
  // a kept switch, for reference (A and the last fresh one are kept now)
  const keptSw = OFF ? null : [await cost(A), await cost(fresh[2])];
  sw.kept = keptSw ? { ms: mean(keptSw, 'ms'), taskMs: mean(keptSw, 'taskMs'), gpuMs: mean(keptSw, 'gpuMs') } : null;
  out.measure.switch = sw;
  const within = (a, b) => a <= b * 1.25 + 40;
  step('switch: the first switch back to a released chat costs what a switch to a chat opened afresh costs', OFF || (within(sw.released.ms, sw.fresh.ms) && within(sw.released.taskMs, sw.fresh.taskMs) && sw.released.gpuMs <= sw.fresh.gpuMs * 1.25 + 150), { released: sw.released, fresh: sw.fresh, kept: sw.kept });

  // ---------- kept: a released chat's draft, its place ----------
  if (!OFF) {
    await openChat(B, 900);
    const atEnd = list().scrollHeight - list().scrollTop - list().clientHeight < 4;
    const all = await Native.load(B);
    const lastText = String(all?.messages?.at(-1)?.text || '').slice(0, 30);
    const shownLast = [...list().querySelectorAll('.msg')].at(-1)?.textContent || '';
    step('kept: a released chat comes back whole, at its end (where a kept chat comes back to), its draft there',
      atEnd && shownLast.includes(lastText.slice(0, 20)) && v().input.value === 'draft in B, kept while B rests', { atEnd, draft: v().input.value.slice(0, 40) });
  }

  // ---------- grow: the chat on screen as it grows ----------
  await openChat(D, 1500);
  const n0 = list().getElementsByTagName('*').length;
  const chat = await Native.load(D);
  let grew = 0;
  if (chat?.messages) {
    const tt = Date.now();
    for (let b = 0; b < 10; b++) {
      const base = chat.messages.length;
      for (let i = 0; i < 20; i++) chat.messages.push(msg(base + i, tt - 60000 + i));
      Native.save(chat); await Native.refresh(claude.id, { keepScroll: true }); await wait(250);
      grew += 20;
    }
    await wait(2500);
  }
  const n1 = list().getElementsByTagName('*').length;
  const wheel = (dy) => { const r = list().getBoundingClientRect(); return smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x: r.left + r.width / 2, y: r.top + r.height / 2, deltaX: 0, deltaY: dy } }); };
  for (let i = 0; i < 60 && list().scrollTop > 0; i++) { await wheel(-1500); await wait(120); }
  await wait(1500);
  const nTop = list().getElementsByTagName('*').length;
  list().scrollTop = list().scrollHeight; await wait(3500);
  const n2 = list().getElementsByTagName('*').length;
  out.measure.grow = { added: grew, opened: n0, grown: n1, atTop: nTop, backAtEnd: n2, msgs: list().querySelectorAll('.msg').length };
  step('grow: the chat on screen stays windowed as it grows and is wheeled through (≤ 2× its nodes at open)', grew === 200 && n1 <= n0 * 2 && n2 <= n0 * 2, out.measure.grow);
} catch (err) { step(`threw: ${String(err?.stack || err).slice(0, 500)}`, false); }
try { await T({ window: 'show' }); } catch { /* shown */ }
localStorage.removeItem('chat.keepHiddenMs'); localStorage.removeItem('chat.keepIdleMs');
out.ok = !out.problems;
if (window.K176_REPORT || OFF) { out.reported = out.problems || []; delete out.problems; out.ok = true; }
return JSON.stringify(out, null, 1);
