// Find in this project (round 81, projsearch81): one search box at the top of a project's Desk (and Ctrl/⌘+F while
// the Desk is on screen) that looks through everything the project holds at once: its chats' messages, its notes, the
// worktable's words, its scenes (names, layer names, layer code), its moodboards' notes, and the names of its files,
// captures and renders. Results come grouped by kind; one click on a result lands exactly there: the message in its
// chat (held in place, chatjump76), the scene's layer selected in the Lab with the line picked out in its code, the
// board note selected and zoomed to, the worktable page with the words selected, the notes with the words selected, the
// file opened.
// The index lives on the store thread (projfind-core.js via storework.js `projfind`), never on this page's thread or the
// main process's: it is read in small slices while the Desk is open (each ≤ 12 ms of the thread, so a save asked
// meanwhile waits little), kept per project, and only what changed is read again — a save here (the thread marks it)
// or an arrival from the other computer (hearth:synced → a slice in the background). Nothing is sent to any AI.
const ProjFind = (() => {
  const P = Projects;
  const FIRST = 4; // rows shown per kind before "＋ N more"
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = { pid: null, node: null, input: null, list: null, status: null, seq: 0, inFlight: false, again: false, job: null, ready: new Set(), more: new Set(), rows: [], sel: -1, last: null,
    stats: { build: null, query: null, maxTaskMs: 0, tasks: 0, calls: 0 } };
  // this page's own time for one piece of work (a check holds it under a frame): the longest kept
  const timed = (fn) => { const t0 = performance.now(); try { return fn(); } finally { const ms = performance.now() - t0; S.stats.tasks += 1; if (ms > S.stats.maxTaskMs) S.stats.maxTaskMs = Math.round(ms * 10) / 10; } };

  // ---------- what the project is made of (sent to the thread with each call: small, names and ids only) ----------
  const FILEISH = new Set(['file', 'capture', 'render', 'download', 'deploy']);
  function specOf(p) {
    const items = p.items || [];
    const w = p.workspace || {};
    const refs = (types, extra) => [...new Set([...items.filter((x) => types.includes(x.type)).map((x) => String(x.ref)), extra].filter(Boolean))];
    return { pid: p.id, chats: refs(['chat'], w.chatId), scenes: refs(['scene', 'seq'], w.sceneId), boards: refs(['board'], w.boardId), notes: p.notes || '', description: w.description || '',
      items: items.filter((x) => FILEISH.has(x.type)).map((x) => ({ type: x.type, ref: String(x.ref), name: P.nameOf(x), at: x.at || 0 })) };
  }
  async function call(o) {
    S.stats.calls += 1;
    try { const r = await window.hub.projFind(o); return r && !r.error ? r : null; } catch (err) { console.warn('find in project', err); return null; }
  }

  // ---------- the index: read in slices in the background while the Desk is open ----------
  function warm(p, why = 'desk') {
    if (!p) return Promise.resolve();
    if (S.job?.pid === p.id) { S.job.again = true; return S.job.done; }
    const job = { pid: p.id, again: false };
    job.done = (async () => {
      const t0 = performance.now(); let calls = 0; let workerMs = 0; let built = 0;
      for (let i = 0; i < 400; i++) {
        const cur = P.get(job.pid);
        if (!cur) break;
        const r = await call({ spec: specOf(cur), budgetMs: 12 });
        calls += 1;
        if (!r) break;
        workerMs += r.buildMs || 0; built += r.built || 0;
        if (!r.left) { if (job.again) { job.again = false; continue; } S.ready.add(job.pid); break; }
        await new Promise((res) => (window.requestIdleCallback ? requestIdleCallback(res, { timeout: 120 }) : setTimeout(res, 16)));
      }
      S.stats.build = { pid: job.pid, why, ms: Math.round(performance.now() - t0), calls, workerMs: Math.round(workerMs * 10) / 10, built, at: Date.now() };
    })().finally(() => { if (S.job === job) S.job = null; });
    S.job = job;
    return job.done;
  }
  // something of the open project changed (a save here, an arrival): the index catches up a moment later
  let soonT = 0;
  function soon(why) {
    if (!S.pid || !onDesk()) return;
    clearTimeout(soonT);
    soonT = setTimeout(() => { const p = P.get(S.pid); if (!p) return; warm(p, why).then(() => { if (S.input?.value.trim()) query(); }); }, why === 'synced' ? 300 : 1200);
  }

  // ---------- the box (one per project, kept across Desk repaints: its words, results and place stay) ----------
  const keyText = (t) => (typeof WinMac !== 'undefined' && WinMac.keyLabel ? WinMac.keyLabel(t) : t);
  function box(p) {
    if (!p) return null;
    if (S.node && S.pid === p.id) { if (!S.ready.has(p.id)) warm(p); return S.node; }
    S.pid = p.id; S.rows = []; S.sel = -1; S.more.clear(); S.last = null; S.seq += 1;
    S.input = el('input', { type: 'search', class: 'pf-input', placeholder: keyText('Find in this project… (Ctrl/⌘+F)'), spellcheck: false, attrs: { 'aria-label': 'Find in this project: messages, notes, worktable, scenes, boards, files', 'aria-controls': 'pf-results', autocomplete: 'off' } });
    S.status = el('div', { class: 'pf-status', attrs: { role: 'status', 'aria-live': 'polite' } });
    S.list = el('div', { class: 'pf-results', id: 'pf-results', attrs: { role: 'listbox', 'aria-label': 'Found in this project' } });
    S.node = el('section', { class: 'pf', dataset: { project: p.id } }, S.input, S.status, S.list);
    S.input.addEventListener('input', () => { S.more.clear(); query(); });
    S.input.addEventListener('keydown', onKey);
    S.list.addEventListener('click', (e) => { const r = e.target.closest('.pf-row'); if (r) { e.preventDefault(); openAt(Number(r.dataset.i)); return; } const m = e.target.closest('.pf-more'); if (m) { S.more.add(m.dataset.g); paint(S.last); } });
    S.list.addEventListener('contextmenu', (e) => { const r = e.target.closest('.pf-row'); if (!r) return; e.preventDefault(); const h = S.rows[Number(r.dataset.i)]; if (h) showMenu(e.clientX, e.clientY, menuOf(h)); });
    warm(p);
    return S.node;
  }
  function onKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!S.rows.length) return; S.sel = (S.sel + (e.key === 'ArrowDown' ? 1 : S.rows.length - 1)) % S.rows.length; mark(); return; }
    if (e.key === 'Enter') { e.preventDefault(); if (S.rows.length) openAt(Math.max(0, S.sel)); return; }
    if (e.key === 'Escape') { if (S.input.value) { e.preventDefault(); e.stopPropagation(); S.input.value = ''; query(); } else S.input.blur(); }
  }
  function mark() { timed(() => { for (const r of S.list.querySelectorAll('.pf-row')) { const on = Number(r.dataset.i) === S.sel; r.classList.toggle('sel', on); r.setAttribute('aria-selected', on ? 'true' : 'false'); if (on) r.scrollIntoView({ block: 'nearest' }); } }); }

  // ---------- a query: the newest words win (one in flight at a time; typing meanwhile asks again right after) ----------
  async function query() {
    if (S.inFlight) { S.again = true; return; }
    const q = S.input.value;
    const k = ++S.seq;
    if (!q.trim()) { paint(null); return; }
    const p = P.get(S.pid);
    if (!p) return;
    S.inFlight = true;
    const t0 = performance.now();
    let r = null;
    try { r = await call({ spec: specOf(p), q, budgetMs: S.ready.has(p.id) ? 20 : 40, limit: 20 }); } finally { S.inFlight = false; }
    if (S.again) { S.again = false; query(); return; }
    if (k !== S.seq || !r) return;
    paint(r, q);
    S.stats.query = { q, ms: Math.round((performance.now() - t0) * 10) / 10, workerMs: r.queryMs, buildMs: r.buildMs, total: r.total, left: r.left, ready: S.ready.has(p.id) };
    if (r.left) warm(p, 'query').then(() => { if (k === S.seq) query(); });
  }

  // ---------- the results, grouped by kind ----------
  const when = (t) => (t && typeof timeAgo === 'function' ? timeAgo(t) : '');
  function whereOf(h) {
    if (h.g === 'chat') return h.k == null ? 'chat' : `${h.title}${h.who ? ` · ${h.who === 'you' ? 'you' : 'AI'}` : ''}`;
    if (h.g === 'scene') return h.what === 'code' ? `${h.title} › ${h.layerName} · line ${h.line}` : h.what === 'layer' ? `${h.title} › layer` : 'scene';
    if (h.g === 'board') return h.item ? `${h.title}${h.type ? ` · ${h.type}` : ''}` : 'board';
    if (h.g === 'file') return h.kindLabel || 'file';
    return h.title || '';
  }
  function snipNode(s, marks) {
    const out = el('span', { class: 'pf-snip' });
    let at = 0;
    for (const [a, n] of marks || []) { if (a > at) out.append(s.slice(at, a)); out.append(el('mark', { text: s.slice(a, a + n) })); at = a + n; }
    if (at < s.length) out.append(s.slice(at));
    return out;
  }
  function paint(r, q = '') {
    timed(() => {
      S.last = r; S.rows = []; S.sel = -1;
      if (!r) { S.list.replaceChildren(); S.status.textContent = ''; S.list.hidden = true; return; }
      S.list.hidden = false;
      const building = r.left > 0 || (S.job && S.job.pid === S.pid);
      S.status.textContent = building ? 'Still reading this project… results fill in as it goes.' : '';
      if (!r.total) { S.list.replaceChildren(el('p', { class: 'pf-empty', text: building ? `Nothing yet for “${q.trim()}”.` : `Nothing in this project matches “${q.trim()}”. Try fewer or shorter words.` })); return; }
      const sections = [];
      for (const g of r.groups) {
        const shown = S.more.has(g.id) ? g.hits : g.hits.slice(0, FIRST);
        const rows = shown.map((h) => {
          const i = S.rows.push(h) - 1;
          const main = h.g === 'file' ? el('span', { class: 'pf-snip' }, snipNode(h.snip, h.marks)) : snipNode(h.snip, h.marks);
          return el('button', { type: 'button', class: 'pf-row', dataset: { i: String(i), g: h.g }, attrs: { role: 'option', 'aria-selected': 'false' }, title: 'Open it here (right-click: more)' },
            el('span', { class: 'pf-where' }, el('span', { class: 'pf-where-t', text: whereOf(h) }), h.at && h.g !== 'scene' ? el('span', { class: 'pf-when', text: when(h.at) }) : null),
            main, el('span', { class: 'pf-open', text: 'Open', attrs: { 'aria-hidden': 'true' } }));
        });
        const more = g.hits.length > shown.length ? el('button', { type: 'button', class: 'pf-more ghost small', dataset: { g: g.id }, text: `＋ ${g.hits.length - shown.length} more` })
          : g.total > g.hits.length ? el('p', { class: 'pf-many', text: `${g.total - g.hits.length} more: add a word to narrow it down` }) : null;
        sections.push(el('section', { class: 'pf-group', dataset: { g: g.id } }, el('h4', {}, el('span', { text: `${g.icon} ${g.label}` }), el('span', { class: 'pf-count', text: String(g.total) })), ...rows, more));
      }
      S.list.replaceChildren(...sections);
    });
  }

  // ---------- opening a result exactly where it is ----------
  function openAt(i) { const h = S.rows[i]; if (h) open(h).catch((err) => toast(calmError(err), { type: 'error', raw: err })); }
  async function open(h) {
    const p = P.get(S.pid);
    if (!p) return false;
    P.touch(p);
    if (h.g === 'chat') return openMessage(p, h);
    if (h.g === 'note') return openNote(p, h);
    if (h.g === 'worktable') return openWorktable(p, h);
    if (h.g === 'scene') return openScene(p, h);
    if (h.g === 'board') return openBoard(p, h);
    const x = p.items.find((y) => y.type === h.type && String(y.ref) === h.ref) || { type: h.type, ref: h.ref, name: h.title };
    return P.openItem(x);
  }
  async function openMessage(p, h) {
    const c = (H.chats || []).find((x) => x.id === h.ref);
    if (!c) throw Error('That chat isn’t on this computer yet (or it was deleted). The project keeps its link.');
    if (p.workspace && H.agent(c.agentId)?.mode === 'native' && ProjectWorkspace.current()?.id === p.id) await ProjectWorkspace.conversation(p, c.id);
    else await P.openChat(c.id);
    if (h.k == null) return true;
    // (round 76, chatjump76) jumpTo lands the message and holds it in place while the chat around it draws
    for (let i = 0; i < 40; i++) { if (Native.jumpTo(c.agentId, h.k)) return true; await sleep(100); }
    return false;
  }
  async function openNote(p, h) {
    if (!ProjectsHome.openProject?.()) await ProjectWorkspace.go('overview');
    const about = document.querySelector('.pw-desk .pw-about');
    if (!about) return false;
    about.open = true;
    if (h.field === 'notes') {
      const ta = about.querySelector('.pj-notes');
      if (!ta) return false;
      ta.focus({ preventScroll: true });
      const a = Math.min(h.pos || 0, ta.value.length);
      ta.setSelectionRange(a, Math.min(ta.value.length, a + (h.len || 0)));
      // the selected line in view inside the box, then the box in view on the Desk
      const line = ta.value.slice(0, a).split('\n').length - 1;
      ta.scrollTop = Math.max(0, line * (parseFloat(getComputedStyle(ta).lineHeight) || 18) - ta.clientHeight / 3);
      ta.scrollIntoView({ block: 'nearest' });
    } else {
      const copy = about.querySelector('.pw-about-copy');
      copy?.scrollIntoView({ block: 'nearest' });
      copy?.classList.remove('pf-flash'); void copy?.offsetWidth; copy?.classList.add('pf-flash');
    }
    return true;
  }
  async function openWorktable(p, h) {
    await ProjectWorkspace.go('board');
    if (h.feature) await WorkspaceNav.creative(h.feature);
    // the field holding the words, selected (the worktable draws its page a moment after it opens)
    const needle = String(h.needle || '').toLowerCase();
    for (let i = 0; i < 30 && needle; i++) {
      const surf = document.querySelector('.surface:not(.hidden) .tool-body') || document;
      const f = [...surf.querySelectorAll('input:not([type=checkbox]):not([type=range]), textarea')].find((n) => n.checkVisibility?.() !== false && String(n.value || '').toLowerCase().includes(needle));
      if (f) { const a = String(f.value).toLowerCase().indexOf(needle); f.focus({ preventScroll: true }); try { f.setSelectionRange(a, a + needle.length); } catch { /* a field without a caret */ } f.scrollIntoView({ block: 'nearest' }); return true; }
      await sleep(100);
    }
    return true;
  }
  async function openScene(p, h) {
    await ProjectWorkspace.openScene(h.ref, p);
    if (!h.layer) return true;
    // the Lab mounts its layers a moment after the scene opens: the layer selected, then its code at the line
    for (let i = 0; i < 40; i++) {
      const s = typeof ThreeLab !== 'undefined' ? ThreeLab.search : null;
      if (s?.selectLayer(h.layer)) {
        if (h.what === 'code' && h.line) { await sleep(60); s.showLine?.(h.layer, h.line); }
        return true;
      }
      await sleep(100);
    }
    throw Error('That layer isn’t in the scene any more.');
  }
  async function openBoard(p, h) {
    if (h.ref === p.workspace?.boardId && ProjectWorkspace.current()?.id === p.id) await ProjectWorkspace.go('moodboard');
    else if (!(await P.openBoard(h.ref))) throw Error('That moodboard isn’t on this computer yet.');
    if (!h.item) return true;
    for (let i = 0; i < 30; i++) {
      try { if (Board.current()?.id === h.ref && Board.item(h.item)) { Board.select([h.item]); Board.zoomSel?.(); return true; } } catch { /* drawing */ }
      await sleep(100);
    }
    return false;
  }
  function menuOf(h) {
    const out = [{ label: 'Open', action: () => open(h).catch((err) => toast(calmError(err), { type: 'error' })) }];
    if (h.g === 'file') { const p = P.get(S.pid); const x = p?.items.find((y) => y.type === h.type && String(y.ref) === h.ref); if (x) out.push(...P.itemMenu(p, x).slice(1)); }
    if (h.snip) out.push({ label: 'Copy these words', action: () => copyText(h.snip.replace(/^…|…$/g, ''), 'Copied') });
    return out;
  }

  // ---------- Ctrl/⌘+F on the Desk: this box (elsewhere it finds as before) ----------
  const onDesk = () => Boolean(typeof ProjectsHome !== 'undefined' && ProjectsHome.isVisible?.() && ProjectsHome.openProject?.() && S.node?.isConnected);
  function take() {
    if (!onDesk()) return false;
    S.input.focus();
    S.input.select();
    return true;
  }

  // (storeack: guard — nothing here is held or written: the store thread re-reads what changed; this only asks it to)
  addEventListener('hearth:synced', (e) => { if ((e.detail?.files || []).some((f) => /^(chats\/|kv\/(three-sketches|board-|workbench-|projects)\b)/.test(String(f?.rel || '')))) soon('synced'); });
  addEventListener('hearth:workbench-saved', () => soon('worktable'));
  const QUIET = new Set(['cover', 'ident', 'status', 'dismiss', 'make', 'touch']); // (what the index doesn't hold)
  P.onChange((d) => { if (!QUIET.has(d?.why) && (!d?.id || d.id === S.pid)) soon(d?.why === 'notes' ? 'notes' : 'project'); });
  try { Keys.add({ area: 'Projects', keys: 'Ctrl+F', what: 'On a project’s Desk: find in this project (messages, notes, worktable, scenes, boards, files)', run: () => take() }); } catch { /* the keys sheet is optional */ }

  return { box, take, warm, open, specOf, onDesk, state: () => ({ pid: S.pid, ready: [...S.ready], building: S.job?.pid || null, rows: S.rows.length, stats: structuredClone(S.stats) }), _S: S };
})();
window.ProjFind = ProjFind;
