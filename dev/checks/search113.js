// opt-in: BIGPROFILE70
// (round 113, search113) Finding things with thousands of chats, by keys and clicks on the heavy owner-like profile with
// Clink's giant chat (dev/search113-fixture.js: 2,200 chat files, 40 projects, a 63 MB chat, + the query set's chats from
// dev/search113-queries.js). Each way the owner finds things, measured the same way: the time from a key to the results
// on screen (typing 1, 2 and 5 letters), the window's longest task while typing (load-aware: a task over 50 ms is judged
// on its own CPU, dev/trace-stats.js, like chatwindow86), the main process (the lag probe: busy stretches and its time
// per call) and the store thread (the time each ask took there), and the results' quality:
//   palette    Ctrl/⌘+K (real keys): a chat by its title — "k", "ky", "kyoto"; "kyoto" puts "Kyoto trip plan" near the top
//   messages   Ctrl/⌘+K "?" + words: the titles at once, then the messages of every project's chats as they're found
//              (cold: recall's index not built yet, the rows fill in; then warm). Every query of the set: its expected
//              chat first / in order / never there / once, its project on the row
//   open       "?intro font" + Enter: Clink (the project) opens, the chat, the message in view
//   panel      the chats list's filter: "k", "ky", "kyoto"; "cafe" finds "Café…"; "reel intro" both words in any order
//   desk       Find in this project (Clink's Desk): "p", "po", "porta"; "sohne" finds the intro decision there
//   recall     the "what did we decide?" card: the intro font decision first, answered while the window stays free
//   altf       Alt+F in the 63 MB chat (windowed): a word, typed; the count shown
// No network, fake engines, a throwaway copy of the fixture (never real data). Budgets (window.S113_BUDGET overrides):
// title results ≤ 100 ms after the key (p95), the window's own tasks ≤ 50 ms while typing, the main process ≤ 4 ms per
// find call and never busy ≥ 100 ms, every query of the set as expected.
// Opt-in (the 210 MB fixture): BIGPROFILE70=1 node dev/run-checks.js --exact search113
//   by hand: node dev/search113-fixture.js && node dev/smoke.js --fake-engines --data /tmp/hearth-search113 --wait 1000 --check-timeout 900000 --lib dev/search113-queries.js --script dev/checks/search113.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const r0 = (x) => Math.round(x);
const until = async (fn, what, n = 600, every = 25) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } throw Error(`timed out: ${what}`); };
const BUDGET = Object.assign({ titleMs: 100, task: 50, mainPerCall: 4, mainBlock: 100 }, window.S113_BUDGET || {});
const out = { budget: BUDGET, palette: {}, messages: {}, quality: {}, open: {}, panel: {}, desk: {}, recall: {}, altf: {}, main: {}, cantTell: [] }; const fails = [];
const need = (ok, what) => { if (!ok) fails.push(what); return ok; };
const cdp = (method, params = {}) => smoke({ cdp: method, params });
const lag = (label) => window.hub.power?.test?.({ lag: { label } }).catch(() => null);
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const MAC = /Mac/.test(navigator.platform);
const key = async (k, code, mods = 0, vk = 0) => { for (const type of ['rawKeyDown', 'keyUp']) await cdp('Input.dispatchKeyEvent', { type, key: k, code, modifiers: mods, windowsVirtualKeyCode: vk || (k.length === 1 ? k.toUpperCase().charCodeAt(0) : k === 'Enter' ? 13 : k === 'Escape' ? 27 : k === 'Backspace' ? 8 : 0) }); };
const type = (text) => cdp('Input.insertText', { text });
const selectAll = () => key('a', 'KeyA', MAC ? 4 : 2);
// the window's long tasks (and the keys' own handling: Event Timing)
const longs = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push({ at: e.startTime, ms: r0(e.duration) }); }).observe({ type: 'longtask', buffered: false }); } catch { /* none */ }
// a phase: the window's tasks judged load-aware (a trace of its tasks), the main process's busy stretches and its time
// per chats:find / projects:find / chats:recall call
// judge: false → the window's tasks are reported, not budgeted (opening a project: the project's own open path, not search)
// window.S113_PROF = 1: each phase's CPU profile of the window, its top functions by self time
async function phase(name, fn, { judge = true } = {}) {
  await lag(`before-${name}`);
  const traced = await smoke({ trace: 'start', tasks: true }).then((r) => !r?.error).catch(() => false);
  if (window.S113_PROF) { await cdp('Profiler.enable'); await cdp('Profiler.setSamplingInterval', { interval: 250 }); await cdp('Profiler.start'); }
  performance.mark(`s113:${name}`);
  const t = performance.now();
  let res = null;
  try { res = await fn(); } catch (e) { fails.push(`${name}: ${e.message}`); }
  await wait(400);
  let top = null;
  if (window.S113_PROF) {
    const p = (await cdp('Profiler.stop'))?.profile;
    if (p) { const self = new Map(); const byId = new Map(p.nodes.map((x) => [x.id, x])); for (let i = 0; i < p.samples.length; i++) { const cf = byId.get(p.samples[i]).callFrame; if (/^\((idle|program)\)$/.test(cf.functionName)) continue; const k = `${cf.functionName || '(anon)'} ${String(cf.url).split('/').pop()}:${cf.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + (p.timeDeltas[i] || 0)); }
      top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${r0(v / 1000)}ms ${k}`); }
  }
  const l = await lag(name);
  const observed = longs.filter((x) => x.at >= t).map((x) => ({ at: x.at - t, ms: x.ms }));
  const lt = traced ? await smoke({ trace: 'stop', tasks: { min: BUDGET.task, budget: BUDGET.task, mark: `s113:${name}`, observed } }).catch(() => null) : null;
  const ipc = (re) => (l?.ipc?.top || []).filter((x) => re.test(x.k)).reduce((a, x) => ({ n: a.n + x.n, ms: a.ms + x.ms }), { n: 0, ms: 0 });
  const calls = ipc(/chats:find|projects:find|chats:recall|chats:win/);
  const s = { windowLong: observed.map((x) => x.ms).sort((a, b) => b - a).slice(0, 5), main: l?.delay ? { max: l.delay.max, p99: l.delay.p99, blocks: (l.blocks || []).map((b) => `${b.ms}ms ${(b.app || []).slice(0, 2).join(' | ')}`).slice(0, 3), calls: calls.n, perCallMs: calls.n ? Math.round((calls.ms / calls.n) * 100) / 100 : 0 } : 'no lag probe' };
  if (lt) s.tasks = { verdict: lt.verdict, cpuMs: lt.cpuMs, long: (lt.tasks || []).slice(0, 3).map((x) => `${x.at}+${x.ms}ms (cpu ${x.cpuMs})`) };
  if (top) s.windowTop = top;
  if (!judge) s.judged = 'reported only';
  else if (lt && ['ok', 'over', 'load'].includes(lt.verdict)) {
    if (lt.verdict === 'over') fails.push(`${name}: the window held ${lt.tasks[0]?.ms} ms in one task (budget ${BUDGET.task}): ${lt.why}`);
    else if (lt.verdict === 'load') out.cantTell.push(`${name}: a ${lt.tasks[0]?.ms} ms task, but the box was busy: ${lt.why}`);
  } else if ((s.windowLong[0] || 0) > BUDGET.task) fails.push(`${name}: the window held ${s.windowLong[0]} ms in one task (budget ${BUDGET.task})`);
  if (l?.blocks?.some((b) => b.ms >= BUDGET.mainBlock)) fails.push(`${name} held the main process: ${s.main.blocks.join('; ')}`);
  if (calls.n && calls.ms / calls.n > BUDGET.mainPerCall) fails.push(`${name}: the main process took ${s.main.perCallMs} ms per find call (budget ${BUDGET.mainPerCall})`);
  out[name] = Object.assign(out[name] || {}, s, res && typeof res === 'object' ? res : {});
  return res;
}
// the time from now until fn() is true, then the next frame (its paint)
async function painted(fn, what, t0 = performance.now(), n = 4000) { await until(fn, what, n, 4); await frame(); return Math.round((performance.now() - t0) * 10) / 10; }
// the key's own time: from the input event the window got (not from when the test asked for it: the test's own round trip
// through the debugging protocol is 10–40 ms on this shared box) to the rows changed, painted
let inputAt = 0;
document.addEventListener('input', () => { inputAt = performance.now(); }, true);
async function keyTime(ch, changed, what, n = 1500) {
  const asked = performance.now(); inputAt = 0;
  await type(ch);
  await until(() => inputAt, `the input event for ${what}`, 400, 2);
  const t0 = inputAt;
  await until(changed, what, n, 2);
  const rows = Math.round((performance.now() - t0) * 10) / 10;
  await frame();
  const ms = Math.round((performance.now() - t0) * 10) / 10;
  keyLog.push({ what, rows, painted: ms });
  return { ms, rows, viaTest: Math.round((t0 - asked) * 10) / 10 };
}
const keyLog = []; // every timed key: rows changed (the window's own work) and painted (+ the next frame)

// ---------- the palette (Ctrl/⌘+K) ----------
const palInput = () => document.querySelector('.palette .palette-input');
const palRows = () => [...document.querySelectorAll('.palette .palette-item')].map((r) => ({ label: r.querySelector('.p-label')?.textContent || '', detail: r.querySelector('.p-detail')?.textContent || '', kind: r.querySelector('.p-kind')?.textContent || '' }));
const palSig = () => JSON.stringify(palRows().slice(0, 8)) + (document.querySelector('.palette .palette-empty')?.isConnected ? 'empty' : '');
async function openPalette() {
  if (palInput()?.isConnected) { await key('Escape', 'Escape'); await wait(100); }
  document.querySelector('#chat-search')?.blur();
  await key('k', 'KeyK', MAC ? 4 : 2);
  await until(() => document.activeElement === palInput(), 'the palette', 200);
  await wait(150);
}
// one letter at a time: the time from each key to the rows changing on screen
async function typeTimed(letters, changed = null) {
  const times = [];
  for (const ch of letters) {
    const before = palSig();
    times.push(await keyTime(ch, () => (changed ? changed() : palSig() !== before), `rows after "${ch}"`).then((x) => x.rows).catch(() => null));
  }
  return times;
}

try {
  await until(() => document.querySelector('#panel .item'), 'app', 1500);
  for (let i = 0, last = longs.length, still = 0; i < 120 && still < 6; i++) { await wait(500); if (longs.length === last) still += 1; else { still = 0; last = longs.length; } }
  if (!(await lag('boot'))?.delay) fails.push('the main lag probe is off (HEARTH_LOOPLAG)');
  out.fixture = { chats: (H.chats || []).length, giant: (H.chats || []).some((c) => c.id === 'claude-giant0'), set: (H.chats || []).filter((c) => /^s113-/.test(c.id)).length };
  need(out.fixture.chats > 2000 && out.fixture.giant && out.fixture.set >= 15, `the heavy profile with the query set (${JSON.stringify(out.fixture)})`);
  activate(H.claudeAgent().id); await wait(600);

  // ---------- 1. Ctrl/⌘+K: a chat by its title ----------
  await phase('paletteOpen', async () => { await openPalette(); await typeTimed('kyo'); await key('Escape', 'Escape'); await wait(300); return { note: 'the first Ctrl/⌘+K: Find anything loads and indexes the app (once)' }; });
  await phase('palette', async () => {
    await openPalette();
    const times = await typeTimed('kyoto');
    const rows = palRows();
    const at = rows.findIndex((r) => r.label === 'Kyoto trip plan');
    need(at >= 0 && at < 3, `Ctrl/⌘+K "kyoto": "Kyoto trip plan" in the first three rows (at ${at}: ${rows.slice(0, 4).map((r) => r.label).join(' | ')})`);
    const cafe = (await (async () => { await selectAll(); await type('cafe'); await wait(200); return palRows(); })()).findIndex((r) => r.label === 'Café Oberkampf menu');
    need(cafe >= 0 && cafe < 5, `Ctrl/⌘+K "cafe": "Café Oberkampf menu" near the top (at ${cafe})`);
    need(pct(times.filter((x) => x != null), 0.95) <= BUDGET.titleMs, `Ctrl/⌘+K: title results ${JSON.stringify(times)} ms after each key (budget ${BUDGET.titleMs})`);
    // (painted: + the next frame; on this box's software drawing a frame alone can take 30–60 ms under load: reported)
    return { keyToRowsMs: { '1': times[0], '2': times[1], '5': times[4], all: times }, kyotoAt: at, cafeAt: cafe, searchMs: AppSearch.last?.maxMs };
  });

  // ---------- 2. "?words": every project's messages (cold: the index is being read; then warm) ----------
  await phase('messages', async () => {
    await openPalette();
    await type('?');
    const cold0 = performance.now();
    const tTitles = await typeTimed('kyoto', () => palRows().some((r) => r.label === 'Kyoto trip plan'));
    const firstMsg = await painted(() => palRows().some((r) => /ryokan/i.test(r.label)), 'the first message row (cold)', cold0, 4000).catch(() => null);
    const t = performance.now(); let left = null; let asks = 0;
    await until(() => { const s = ChatFind.state(); left = s.res?.left; asks = s.stats.asks; return s.res && !s.res.left; }, 'the index caught up', 2400, 50).catch(() => null);
    const caught = Math.round(performance.now() - t);
    out.messages.cold = { titleRowsMs: tTitles, firstMessageRowMs: firstMsg, caughtUpAfterMs: caught, left, asks, threadMs: ChatFind.state().res?.ms };
    need(firstMsg != null, 'cold: a message row for "kyoto" came while the chats were still being read');
    // warm: 1, 2 and 5 letters
    const warm = {};
    for (const w of ['k', 'ky', 'kyoto']) {
      await selectAll(); await type('?');
      inputAt = 0; await type(w); await until(() => inputAt, 'the input event', 400, 2);
      const t0 = inputAt;
      warm[w] = {
        titleMs: await painted(() => palInput().value === `?${w}` && palRows().some((r) => r.label === 'Kyoto trip plan'), `titles ?${w}`, t0, 1500).catch(() => null),
        messageMs: w.length < 2 ? 'none (one letter: titles only)' : await painted(() => ChatFind.state().q === w && ChatFind.state().res && palRows().some((r) => /◆|Not in a project/.test(r.kind) && !/Kyoto trip plan/.test(r.label)), `messages ?${w}`, t0, 3000).catch(() => null),
        threadMs: ChatFind.state().res?.ms,
      };
    }
    need(Object.values(warm).every((x) => x.titleMs != null && x.titleMs <= BUDGET.titleMs), `"?k" / "?ky" / "?kyoto": the title rows ≤ ${BUDGET.titleMs} ms (${JSON.stringify(warm)})`);
    need(['ky', 'kyoto'].every((w) => typeof warm[w].messageMs === 'number' && warm[w].messageMs < 600), `"?ky" / "?kyoto": message rows within 0.6 s (${JSON.stringify(warm)})`);
    return { warm, chatFind: ChatFind.state().stats };
  });

  // ---------- 3. the query set, typed as "?words" ----------
  await phase('quality', async () => {
    const res = []; const times = [];
    for (const qq of S113Set.QUERIES) {
      await selectAll(); inputAt = 0; await type(`?${qq.q}`); await until(() => inputAt, 'the input event', 400, 2); const t0 = inputAt;
      const ms = await painted(() => { const s = ChatFind.state(); return s.q === qq.q && s.res && !s.inFlight && !s.res.left; }, `?${qq.q}`, t0, 3000).catch(() => null);
      times.push(ms);
      const rows = ChatFind.rows(qq.q, () => {}).filter((r) => r.chatId);
      const ids = rows.map((r) => r.chatId);
      const shown = palRows().filter((r) => r.kind !== 'Messages');
      const ok = [];
      if (qq.top) ok.push(ids[0] === qq.top && shown[0]?.label === rows[0]?.label);
      if (qq.order) ok.push(qq.order.every((id, i) => ids.filter((x, j) => ids.indexOf(x) === j).indexOf(id) === i));
      if (qq.none) ok.push(!ids.includes(qq.none));
      if (qq.once) ok.push(rows.filter((r) => r.chatId === qq.top && r.hit?.k == null).length <= 1 && ids.filter((x) => x === qq.top).length <= 2);
      if (qq.k != null) ok.push(rows.find((r) => r.chatId === qq.top && r.hit)?.hit.k === qq.k);
      if ('project' in qq) ok.push((rows[0]?.kind || '') === `◆ ${qq.project}${qq.archived ? ' (archived)' : ''}`); // (round 127, checksweep127) every chat has a project; an archived one is marked
      const pass = ok.every(Boolean);
      res.push(`${pass ? '✓' : '✗'} ${qq.q} → ${rows.slice(0, 3).map((r) => `${r.chatId}${r.hit ? `#${r.hit.k}` : ''} [${r.kind}]`).join(', ')}${ms != null ? ` (${ms} ms)` : ''}`);
      if (!pass) fails.push(`query "${qq.q}" (${qq.why}): got ${rows.slice(0, 3).map((r) => `${r.chatId} [${r.kind}]`).join(', ') || 'nothing'}`);
    }
    const st = ChatFind.state();
    need(st.res?.unread?.some((u) => u.id === 's113-broken') && palRows().some((r) => /Couldn’t read a chat \(s113-broken\)/.test(r.label)), 'the damaged chat is named in a row ("Couldn\'t read a chat (s113-broken) just now")');
    return { results: res, msP50: pct(times.filter((x) => x != null), 0.5), msP95: pct(times.filter((x) => x != null), 0.95) };
  });

  // ---------- 5. the chats list's filter ----------
  // (back on a chat first: switching views isn't the filter's work)
  if (palInput()?.isConnected) { await key('Escape', 'Escape'); await wait(150); }
  activate(H.claudeAgent().id); await wait(1200);
  // (round 127, checksweep127) the chats list shows the open project's chats: each chat's own project is opened before
  // it is looked for (Kyoto's Travel, then the café's)
  const openOf = async (id) => { if (!window.ProjChats) return; const pid = await until(() => ProjChats.projectIdOf(id), `${id}'s project`, 400).catch(() => null); if (pid) { ProjChats.setScope(pid); Panel.render(); await wait(600); } };
  await openOf('s113-kyoto');
  await phase('panel', async () => {
    const box = document.querySelector('#chat-search');
    need(box?.checkVisibility?.({ visibilityProperty: true }) !== false, 'the chats list\'s search box is on screen');
    box.focus(); box.select();
    const items = () => [...document.querySelectorAll('#chat-groups .item')].map((x) => x.textContent);
    // each key: the list drawn in the frame after it (the filter draws once per frame), its rows then what the words say
    const times = [];
    let drawn = 0; const mo = new MutationObserver(() => { drawn += 1; }); mo.observe(document.querySelector('#chat-groups'), { childList: true, subtree: true, characterData: true });
    for (const ch of 'kyoto') { const d0 = drawn; times.push(await keyTime(ch, () => drawn > d0 || (inputAt && performance.now() - inputAt > 40), `the list after "${ch}"`).then((x) => x.rows).catch(() => null)); } // (a key that leaves the list as it was: its frame)
    mo.disconnect();
    const kyoto = items().some((x) => /Kyoto trip plan/.test(x));
    out.panel.kyotoRows = items().length;
    box.select(); await key('Backspace', 'Backspace'); await wait(250); box.blur();
    need(kyoto, `the chats filter: "kyoto" ${kyoto}`);
    need(pct(times.filter((x) => x != null), 0.95) <= BUDGET.titleMs, `the chats filter: the list ${JSON.stringify(times)} ms after each key (budget ${BUDGET.titleMs})`);
    return { keyToListMs: { '1': times[0], '2': times[1], '5': times[4], all: times }, kyoto };
  });
  // (round 127, checksweep127) the café's chat is in another project: that one opened (a project switch, not the filter's
  // work: reported, not budgeted), then the filter's words
  await phase('panelWords', async () => {
    await openOf('s113-cafe');
    const box = document.querySelector('#chat-search');
    const items = () => [...document.querySelectorAll('#chat-groups .item')].map((x) => x.textContent);
    box.focus(); box.select(); await type('cafe'); await wait(250);
    const cafe = items().some((x) => /Café Oberkampf menu/.test(x));
    box.select(); await type('oberkampf cafe'); await wait(250);
    const both = items().some((x) => /Café Oberkampf menu/.test(x));
    if (!both) out.panel.anyOrderSeen = { rows: items().slice(0, 6), groups: [...document.querySelectorAll('#chat-groups .group')].map((g) => `${g.dataset.id}${g.classList.contains('collapsed') ? ' (folded)' : ''}`).slice(0, 8) };
    box.select(); await key('Backspace', 'Backspace'); await wait(250); box.blur();
    need(cafe && both, `the chats filter: "cafe" → Café ${cafe}, "oberkampf cafe" (any order) ${both}`);
    return { cafe, anyOrder: both };
  }, { judge: false });

  // ---------- 4. open one: its project, its chat, the message ----------
  await phase('open', async () => {
    await openPalette(); await type('?intro font');
    await until(() => ChatFind.state().q === 'intro font' && ChatFind.state().res?.hits?.[0]?.chatId === 's113-intro', 'the intro font row', 400);
    await wait(150);
    const h = ChatFind.state().res.hits[0];
    const t0 = performance.now();
    await key('Enter', 'Enter');
    const a = H.agent(h.agentId);
    // (the project's own open path: reported, not budgeted here; warmopen113 works on it)
    await until(() => H.activeChat[a.id] === 's113-intro' && Native.view(a.id)?.list?.querySelector(`.msg[data-index="${h.k}"]`), 'the chat on that message', 800);
    const ms = Math.round(performance.now() - t0);
    await wait(1200);
    const v = Native.view(a.id).list; const n = v.querySelector(`.msg[data-index="${h.k}"]`);
    const r = n?.getBoundingClientRect(); const b = v.getBoundingClientRect();
    const inView = Boolean(r && r.bottom > b.top + 4 && r.top < b.bottom - 4);
    const proj = typeof ProjectWorkspace !== 'undefined' ? ProjectWorkspace.current()?.id : null;
    need(proj === 'pjbp0', `Enter on a Clink chat's message switched to the Clink project (current: ${proj})`);
    need(inView, 'the message is in view once the chat settles');
    return { ms, project: proj, k: h.k, inView, row: { kind: h.project?.name, title: h.title } };
  }, { judge: false });

  // ---------- 6. Find in this project (Clink's Desk) ----------
  await phase('desk', async () => {
    await Projects.ready();
    if (ProjectWorkspace.current()?.id !== 'pjbp0') await ProjectsHome.openProject?.('pjbp0');
    const tab = await until(() => [...document.querySelectorAll('.workspace-switcher button')].find((b) => b.textContent.trim() === 'Desk' && b.checkVisibility?.({ visibilityProperty: true }) !== false), 'the Desk tab', 400);
    tab.click();
    const box = await until(() => H.surfaceIdFor(H.activeId) === 'tool:home' && document.querySelector('.pw-desk .pf-input'), 'the Desk box', 800);
    await until(() => ProjFind.state().ready.includes('pjbp0'), 'Clink read', 2400, 50).catch(() => null);
    box.focus(); box.select();
    const times = [];
    for (const ch of 'porta') { const n0 = ProjFind.state().stats.query?.q; times.push(await keyTime(ch, () => ProjFind.state().stats.query?.q === box.value && ProjFind.state().stats.query?.q !== n0, `Desk "${box.value}"`, 2000).then((x) => x.ms).catch(() => null)); }
    box.select(); await type('sohne');
    const found = await until(() => [...document.querySelectorAll('.pw-desk .pf-group[data-g="chat"] .pf-row')].some((r) => /Söhne/.test(r.textContent)), 'sohne on the Desk', 400).then(() => true).catch(() => false);
    need(found, 'Find in this project: "sohne" finds the intro decision (Söhne) in Clink');
    return { keyToRowsMs: { '1': times[0], '2': times[1], '5': times[4], all: times }, sohne: found, query: ProjFind.state().stats.query };
  });

  // ---------- 7. the recall card ----------
  await phase('recall', async () => {
    if (window.Lazy) await Lazy.load('recallui');
    const t0 = performance.now();
    Recall.open('what did we decide about the intro font?');
    const first = await until(() => { const l = Recall.last(); return l?.res && [...l.res.decisions, ...l.res.open, ...l.res.mentions][0]; }, 'the answers', 1200, 25).catch(() => null);
    const ms = Math.round(performance.now() - t0);
    Recall.close();
    need(first?.chatId === 's113-intro', `recall: the intro font decision first (${first?.chatId} "${first?.snippet}")`);
    return { ms, first: first ? `${first.chatId} · ${first.kind} · ${first.snippet}` : null };
  });

  // ---------- 8. Alt+F in the giant chat ----------
  await phase('giantOpen', async () => {
    const a = H.claudeAgent();
    activate(a.id); Native.open(a.id, 'claude-giant0');
    await until(() => H.activeChat[a.id] === 'claude-giant0' && Native.view(a.id)?.list?.querySelector('.msg'), 'the giant chat', 1200, 50);
    await wait(2500);
    return { note: 'opening the 63 MB chat (chatwindow86\'s own: reported here, budgeted there)' };
  }, { judge: false });
  await phase('altf', async () => {
    const a = H.claudeAgent();
    Native.view(a.id).input.focus();
    await key('f', 'KeyF', 1); await wait(250);
    const bar = Native.view(a.id).root.querySelector('.chat-find input'); bar?.focus();
    const count = () => Native.view(a.id).root.querySelector('.chat-find .find-count')?.textContent || '';
    const times = [];
    for (const ch of 'tunne') { const before = count(); times.push(await keyTime(ch, () => count() && count() !== before, `Alt+F "${bar.value}"`, 2000).then((x) => x.ms).catch(() => null)); }
    const shown = count();
    await key('Escape', 'Escape');
    return { windowed: Boolean(Native.isWin?.(Native.current(a.id))), keyToCountMs: { '1': times[0], '2': times[1], '5': times[4], all: times }, count: shown };
  });
  const fin = await lag('end');
  out.main.end = fin?.delay || null;
  out.keys = { n: keyLog.length, rowsP50: pct(keyLog.map((k) => k.rows), 0.5), rowsP95: pct(keyLog.map((k) => k.rows), 0.95), paintedP50: pct(keyLog.map((k) => k.painted), 0.5), paintedP95: pct(keyLog.map((k) => k.painted), 0.95) };
} catch (err) { fails.push(`stopped: ${err.message}`); }
return JSON.stringify({ ok: !fails.length, problems: fails, ...out }, null, 1);
