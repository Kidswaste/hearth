// opt-in: BIGPROFILE70
// (round 81, projsearch81) Find in this project, by clicks on the heavy owner-like profile (dev/bigprofile.js --projects 40:
// 1,500 chats, 50 Lab scenes, 40 projects — "Clink" with a 700-message chat, 14 related long chats, 5 scenes, 3 boards,
// 740 files / captures / renders). Like the owner:
//   index      Projects (rail) → the Clink card → Desk: the box is there and the project is read on the store thread in
//              the background (slices) — this page's own work per task < 16 ms, the main process never busy with it
//   query      a real click in the box, the words typed (CDP insertText): results grouped by kind in < 100 ms after the
//              index; again with other words; nothing found → a plain sentence
//   message    a real click on a Messages row: the chat opens on that message and it stays in view (round 76's hold)
//   Ctrl+F     on the Desk, a real Ctrl+F puts the caret in the box (the words and results kept across the Desk's repaint)
//   code       a scene's code line: the Lab opens that scene, that layer selected, the line selected in its code
//   board      a moodboard note: the board opens with that note selected
//   notes      words typed in the project notes are found a moment later; Open selects them in the notes
//   worktable  the worktable's storyboard words are found; Open lands on the storyboard with the words selected
//   save       a related chat saved with a new word + the arrival event sync sends: found without retyping
// No network, fake engines, a throwaway copy of the fixture (never real data). Budgets (window.PS_BUDGET overrides):
// first query after the index < 100 ms, this page's longest own task < 16 ms, main-process time per find call < 4 ms.
// Opt-in (the 146 MB fixture): BIGPROFILE70=1 node dev/run-checks.js --exact projsearch81
//   by hand: node dev/smoke.js --fake-engines --data /tmp/hearth-bigprofile72 --wait 1000 --check-timeout 600000 --script dev/checks/projsearch81.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, what, n = 600) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(25); } throw Error(`timed out: ${what}`); };
const BUDGET = Object.assign({ firstQuery: 100, ownTask: 16, mainPerCall: 4 }, window.PS_BUDGET || {});
const out = { budget: BUDGET, index: {}, query: {}, open: {}, keys: {}, live: {} }; const fails = [];
const need = (ok, what) => { if (!ok) fails.push(what); return ok; };
const cdp = (method, params = {}) => smoke({ cdp: method, params });
// a real mouse click in the middle of a node (the node must be what is under that point)
async function realClick(node, what) {
  if (!node) throw Error(`nothing to click: ${what}`);
  node.scrollIntoView({ block: 'nearest' }); await frame();
  const r = node.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2); const y = Math.round(r.top + r.height / 2);
  const hit = document.elementFromPoint(x, y);
  need(hit && (hit === node || node.contains(hit)), `${what}: something else is under the mouse (${hit?.className || hit?.tagName})`);
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: type === 'mouseMoved' ? 0 : 1, buttons: type === 'mousePressed' ? 1 : 0 });
}
const type = async (text) => { await cdp('Input.insertText', { text }); };
async function selectAllAndType(input, text) { input.focus(); input.select(); await type(text); }
const tab = (name) => [...document.querySelectorAll('.workspace-switcher button')].find((b) => b.textContent.trim() === name);
const desk = async () => { await realClick(tab('Desk'), 'Desk tab'); await until(() => document.querySelector('.pw-desk .pf-input') && H.surfaceIdFor(H.activeId) === 'tool:home', 'Desk'); await frame(); };
const box = () => document.querySelector('.pw-desk .pf-input');
const rows = (g) => [...document.querySelectorAll(`.pw-desk .pf-group[data-g="${g}"] .pf-row`)];
const lag = (reset = true) => window.hub.power?.test?.({ lag: { reset } }).catch(() => null);
// this page's frames while the index is read (reported: the Lab and the chat draw too)
const gaps = []; let rafOn = false; let lastT = 0;
const rafTick = (t) => { if (lastT) gaps.push(t - lastT); lastT = t; if (rafOn) requestAnimationFrame(rafTick); };
// results painted: the time of the first mutation of the list after t0
function paintedAfter(t0) { return new Promise((res) => { const list = document.querySelector('.pw-desk .pf-results'); const mo = new MutationObserver(() => { if (list.querySelector('.pf-row, .pf-empty')) { mo.disconnect(); res(performance.now() - t0); } }); mo.observe(list, { childList: true, subtree: true }); setTimeout(() => { mo.disconnect(); res(null); }, 10000); }); }

try {
  await until(() => document.querySelector('#agent-buttons .space-button'), 'app', 1500); await wait(1500);
  // ---------- open Clink by clicks, then its Desk ----------
  await realClick(document.querySelector('#agent-buttons [data-space=projects]'), 'Projects');
  const card = await until(() => document.querySelector('.pj-card[data-project="pjbp0"]'), 'cards', 1500);
  await realClick(card, 'Clink card');
  await until(() => ProjectWorkspace.state().phase === 'ready' && ProjectWorkspace.state().project === 'pjbp0', 'Clink open', 3000);
  await wait(800);
  await lag(true);
  rafOn = true; lastT = 0; requestAnimationFrame(rafTick);
  const t0 = performance.now();
  await desk();
  need(Boolean(box()), 'the Desk has the Find in this project box');
  out.index.placeholder = box()?.placeholder;
  // ---------- the index, read on the store thread in the background ----------
  await until(() => ProjFind.state().ready.includes('pjbp0'), 'the index', 4000);
  rafOn = false;
  const st = ProjFind.state();
  out.index.build = st.stats.build; out.index.wall = Math.round(performance.now() - t0);
  out.index.frames = { n: gaps.length, over16: gaps.filter((g) => g > 16.7 * 1.5).length, longest: Math.round(Math.max(0, ...gaps)) };
  const m1 = await lag(true);
  if (m1) { const h = m1.ipc.top.find((x) => x.k === 'handle projects:find'); out.index.main = { delayMax: m1.delay.max, delayP99: m1.delay.p99, findCalls: h?.n || 0, findMs: h?.ms || 0 }; if (h?.n) need(h.ms / h.n < BUDGET.mainPerCall, `main process: ${Math.round(h.ms / h.n * 10) / 10} ms per find call`); } else out.index.main = 'no lag probe (HEARTH_LOOPLAG)';
  need(st.stats.build?.calls > 1, `the index was read in slices (${st.stats.build?.calls} calls)`);
  // ---------- the first query, typed ----------
  await realClick(box(), 'the box');
  need(document.activeElement === box(), 'a click puts the caret in the box');
  let q0 = performance.now(); let painted = paintedAfter(q0);
  await type('portal');
  out.query.first = { ms: Math.round(await painted), ...ProjFind.state().stats.query };
  need(out.query.first.ms != null && out.query.first.ms < BUDGET.firstQuery, `first query took ${out.query.first.ms} ms (budget ${BUDGET.firstQuery})`);
  const groups = [...document.querySelectorAll('.pw-desk .pf-group')].map((g) => `${g.dataset.g}:${g.querySelector('.pf-count')?.textContent}`);
  out.query.groups = groups;
  need(['chat', 'note', 'board'].every((g) => rows(g).length), `results grouped by kind (${groups.join(' ')})`);
  need(rows('chat').length <= 4 && document.querySelector('.pw-desk .pf-group[data-g="chat"] .pf-more'), 'four rows per kind, then ＋ more');
  need([...document.querySelectorAll('.pw-desk .pf-row mark')].length > 0, 'the words are marked in the results');
  // more words, then nothing
  const times = [];
  for (const words of ['neon glitch', 'shader orbit', 'tint']) { q0 = performance.now(); painted = paintedAfter(q0); await selectAllAndType(box(), words); times.push(`${words} ${Math.round(await painted)} ms`); }
  out.query.more = times;
  q0 = performance.now(); painted = paintedAfter(q0); await selectAllAndType(box(), 'xylophone zebra'); await painted;
  out.query.nothing = document.querySelector('.pw-desk .pf-empty')?.textContent;
  need(/Nothing in this project matches/.test(out.query.nothing || ''), 'nothing found says so in plain words');
  // ---------- a message: opens in its chat, on that message, and stays in view ----------
  await selectAllAndType(box(), 'portal'); await until(() => rows('chat').length, 'portal again');
  const mr = rows('chat').find((r) => /AI|you/.test(r.querySelector('.pf-where-t').textContent)) || rows('chat')[0];
  const mh = ProjFind._S.rows[Number(mr.dataset.i)];
  await realClick(mr, 'a Messages row');
  const c = H.chats.find((x) => x.id === mh.ref);
  const node = await until(() => { const v = Native.view(c.agentId); return H.activeChat[c.agentId] === mh.ref && v?.list?.querySelector(`.msg[data-index="${mh.k}"]`); }, 'the message', 400);
  await wait(1200);
  const inView = () => { const v = Native.view(c.agentId).list; const n = v.querySelector(`.msg[data-index="${mh.k}"]`); if (!n) return false; const a = n.getBoundingClientRect(); const b = v.getBoundingClientRect(); return a.bottom > b.top + 4 && a.top < b.bottom - 4; };
  out.open.message = { chat: mh.ref, k: mh.k, of: c ? (await Native.load(c.id))?.messages?.length : null, inView: inView(), text: node.textContent.slice(0, 60) };
  need(out.open.message.inView, 'the message is in view after the chat settles');
  // ---------- back on the Desk: the words and results kept; Ctrl+F puts the caret in the box ----------
  await desk();
  need(box().value === 'portal' && rows('chat').length > 0, `the box keeps its words and results on the Desk (${box().value})`);
  document.querySelector('.pw-desk .pj-p-name')?.focus?.(); box().blur();
  const ctrlF = { key: 'f', code: 'KeyF', windowsVirtualKeyCode: 70, nativeVirtualKeyCode: 70, modifiers: /Mac/.test(navigator.platform) ? 4 : 2 };
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...ctrlF }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...ctrlF });
  out.keys.ctrlF = await until(() => document.activeElement === box(), 'Ctrl+F', 80).then(() => 'caret in the box').catch(() => 'not in the box');
  if (out.keys.ctrlF !== 'caret in the box') { ProjFind.take(); out.keys.take = document.activeElement === box(); }
  need(out.keys.ctrlF === 'caret in the box', 'Ctrl/⌘+F on the Desk goes to Find in this project');
  need(!document.querySelector('.find-bar, .findbar'), 'no page find bar on the Desk');
  // ---------- a scene's code line ----------
  await selectAllAndType(box(), 'tint'); await until(() => rows('scene').some((r) => /line \d+/.test(r.textContent)), 'a code row');
  const cr = rows('scene').find((r) => /line \d+/.test(r.textContent));
  const ch = ProjFind._S.rows[Number(cr.dataset.i)];
  await realClick(cr, 'a code row');
  const sel = await until(() => { const a = document.activeElement; const L = ThreeLab.search?.layers?.().find((l) => l.selected); return H.surfaceIdFor(H.activeId) === 'tool:three' && L?.id === ch.layer && a?.tagName === 'TEXTAREA' && a.selectionEnd > a.selectionStart ? a.value.slice(a.selectionStart, a.selectionEnd) : null; }, 'the code line selected', 400);
  out.open.code = { scene: ch.ref, layer: ch.layer, line: ch.line, selected: sel.trim().slice(0, 80) };
  need(/tint/i.test(sel) && ProjectWorkspace.currentScene() === ch.ref, `the Lab shows the scene, its layer and the line (${sel.trim().slice(0, 60)})`);
  // ---------- a board note ----------
  await desk();
  await selectAllAndType(box(), 'portal'); await until(() => rows('board').length, 'board rows');
  const br = rows('board').find((r) => ProjFind._S.rows[Number(r.dataset.i)].item) || rows('board')[0];
  const bh = ProjFind._S.rows[Number(br.dataset.i)];
  await realClick(br, 'a Boards row');
  await until(() => Board.current()?.id === bh.ref && Board.selected().some((i) => i.id === bh.item), 'the board note selected', 400);
  out.open.board = { board: bh.ref, item: bh.item, selected: Board.selected().map((i) => i.id) };
  // ---------- notes typed on the Desk are found, and Open selects them ----------
  await desk();
  const notes = document.querySelector('.pw-desk .pj-notes');
  document.querySelector('.pw-desk .pw-about').open = true; notes.focus(); notes.setSelectionRange(notes.value.length, notes.value.length);
  await type(' Ask Mia about the jellyfish lanterns.');
  await wait(1600);
  await realClick(box(), 'the box'); await selectAllAndType(box(), 'jellyfish');
  await until(() => rows('note').length, 'the notes row', 300);
  await realClick(rows('note')[0], 'the Notes row');
  await until(() => document.activeElement === notes && notes.value.slice(notes.selectionStart, notes.selectionEnd).toLowerCase() === 'jellyfish', 'the words selected in the notes', 200);
  out.open.note = 'jellyfish selected in the notes';
  // ---------- the worktable (the project's storyboard: written by the worktable when the project opened) ----------
  await desk();
  await selectAllAndType(box(), 'breathe');
  const wr = await until(() => rows('worktable')[0], 'a worktable row', 300).catch(() => null);
  if (need(wr, 'the worktable\'s storyboard words are found')) {
    const wh = ProjFind._S.rows[Number(wr.dataset.i)];
    await realClick(wr, 'a Worktable row');
    const got = await until(() => { const a = document.activeElement; return a && /INPUT|TEXTAREA/.test(a.tagName) && a.selectionEnd > a.selectionStart ? a.value.slice(a.selectionStart, a.selectionEnd) : null; }, 'the worktable words selected', 300).catch(() => null);
    out.open.worktable = { feature: wh.feature, path: wh.path, selected: got };
    need(/breathe/i.test(got || ''), `the worktable opens with the words selected (${got})`);
  }
  // ---------- a save + the arrival event: found without retyping ----------
  await desk();
  await selectAllAndType(box(), 'zeppelin'); await until(() => document.querySelector('.pw-desk .pf-empty'), 'nothing yet');
  const rel = Projects.get('pjbp0').items.find((x) => x.type === 'chat' && x.ref !== 'claude-project-pjbp0');
  const chat = await window.hub.getChat(rel.ref);
  chat.messages.push({ role: 'user', text: 'A zeppelin drifts over the tunnel.', at: Date.now() });
  await window.hub.saveChat(chat);
  const tz = performance.now();
  dispatchEvent(new CustomEvent('hearth:synced', { detail: { files: [{ rel: `chats/${rel.ref}.json` }] } }));
  await until(() => rows('chat').length, 'the saved message found by itself', 400);
  out.live.save = { ms: Math.round(performance.now() - tz), chat: rel.ref };
  // ---------- this page's own work, over the whole run ----------
  const fin = ProjFind.state().stats;
  out.own = { maxTaskMs: fin.maxTaskMs, tasks: fin.tasks, calls: fin.calls };
  need(fin.maxTaskMs < BUDGET.ownTask, `this page's longest own task ${fin.maxTaskMs} ms (budget ${BUDGET.ownTask})`);
  const m2 = await lag(true);
  if (m2) { const h = m2.ipc.top.find((x) => x.k === 'handle projects:find'); out.main = { findCalls: h?.n || 0, findMs: h?.ms || 0, delayMax: m2.delay.max }; if (h?.n) need(h.ms / h.n < BUDGET.mainPerCall, `main process: ${Math.round(h.ms / h.n * 10) / 10} ms per find call`); }
} catch (err) { fails.push(`stopped: ${err.message}`); }
return JSON.stringify({ ok: !fails.length, problems: fails, ...out }, null, 1);
