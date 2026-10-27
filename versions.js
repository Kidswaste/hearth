// 🕘 Earlier versions (round 75, versions75), the window: one place to see and bring back older versions of a chat, a
// project, a Lab scene, a board or the settings, gathered from every safety copy Hearth keeps (versionsmain.js looks;
// versions-core.js makes one timeline of them), plus Deleted things (chats, projects, Lab scenes, boards).
//   Versions.open({ kind, id, name })  the timeline: when, which computer, what differs from now ("12 messages fewer"),
//                                      where it was kept; Preview (read-only) and Restore on each
//   Versions.home({ tab })             "Earlier versions of synced things": pick a chat / project / scene / board /
//                                      the settings; the Deleted things tab
//   Restore always keeps the version in place first (data/.versions, listed as "kept before a restore"): the toast's
//   Undo puts it back the same way. A thing open in the window (a project, the Lab's scene, a board in memory) is changed
//   there, so nothing on screen saves the old one over it; a chat is written by the main process after the chat let go
//   of it (never while a reply is coming). Sync then sends the change like any other edit.
// Ways in (clicks): right-click a chat › Earlier versions…, a project › Earlier versions…, a Lab scene card ›
// Earlier versions…, the Lab's History › 🕘, Board ▾ › More › Earlier versions…, the sync panel's Earlier versions…,
// Ctrl/⌘+K "Earlier versions…" / "Deleted things…". Chat: /versions (this chat), /versions all, /versions deleted.
const Versions = (() => {
  const VC = VersionsCore;
  const api = () => window.hub.versions;
  const lazy = (g) => !window.Lazy || window.Lazy.loaded(g);
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const KIND_WORD = { chat: 'Chat', project: 'Project', scene: 'Lab scene', board: 'Board', settings: 'Settings' };
  const err = (e) => toast(calmError(e), { type: 'error', timeout: 8000 });

  // ---------- what the window holds itself (changed there, never behind its back) ----------
  const lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.scenes : null);
  const projects = () => (lazy('projects') && typeof Projects !== 'undefined' ? Projects : null);
  const boardOpen = (id) => (lazy('board') && typeof Board !== 'undefined' && Board._?.S?.boards?.has(id) ? Board : null);
  function liveOf(S) {
    if (S.kind === 'project') { const p = projects()?.get?.(S.id); return p ? clone(p) : null; }
    if (S.kind === 'scene') { const x = lab()?.get?.(S.id); return x ? clone(x) : null; }
    if (S.kind === 'board') { const B = boardOpen(S.id); return B ? clone(B._.S.boards.get(S.id)) : null; }
    return null;
  }
  // "Keep both" copies: the same name with "(from Mac)" after it
  function siblings(S, name) {
    if (!name) return [];
    const isCopy = (n) => typeof n === 'string' && n !== name && n.startsWith(`${name} (from `);
    if (S.kind === 'chat') return (H.chats || []).filter((c) => isCopy(c.title)).map((c) => c.id).slice(0, 8);
    if (S.kind === 'scene') return (lab()?.all?.() || []).filter((x) => isCopy(x.name)).map((x) => x.id).slice(0, 8);
    if (S.kind === 'project') return (projects()?.all?.() || []).filter((p) => isCopy(p.name)).map((p) => p.id).slice(0, 8);
    return [];
  }
  // the Lab's time machine versions of a scene (when the Lab is up): kept apart, restored by the time machine itself
  async function tmVersions(S) {
    if (S.kind !== 'scene' || typeof ThreeHistory === 'undefined' || !lab()?.get?.(S.id)) return [];
    try {
      const list = (await ThreeHistory.list(S.id)) || [];
      const newest = list[list.length - 1]?.id;
      return list.filter((v) => v.id !== newest).slice(-80).map((v) => ({ key: `tm:${v.id}`, tm: v.id, at: v.at, src: 'timemachine', label: VC.SRC_WORDS.timemachine, machine: v.by === 'you' || !v.by ? 'you' : v.by === 'codex' ? 'Astra' : v.by === 'claude' ? 'Claude' : v.by, summary: v.label || 'a change', also: [] }));
    } catch { return []; }
  }

  // ---------- the timeline ----------
  let dlg = null;
  async function open(subject) {
    const S = { kind: subject?.kind, id: subject?.kind === 'settings' ? 'config' : subject?.id, name: subject?.name || '' };
    if (!VC.okId(S.kind, S.id)) { toast('Nothing to show versions of here.', { timeout: 3000 }); return null; }
    S.also = siblings(S, S.name);
    dlg?.close();
    const list = el('ol', { class: 'vs-list', attrs: { 'aria-label': 'Earlier versions, newest first' } }, el('li', { class: 'hint', text: 'Looking in the automatic copies, sync and the cloud folder…' }));
    const status = el('span', { class: 'hint vs-status', text: '' });
    const title = el('h2', { text: `🕘 Earlier versions · ${S.name || KIND_WORD[S.kind]}` });
    const d = dlg = el('dialog', { class: 'ui-modal vs-dialog', attrs: { 'aria-label': `Earlier versions of ${S.name || KIND_WORD[S.kind]}` } },
      el('form', { method: 'dialog' }, title,
        el('p', { class: 'hint', text: 'Every older version Hearth still has, newest first. Restore keeps the one you have now as a version too, so you can always go back.' }),
        list,
        el('div', { class: 'dialog-actions' }, status, el('span', { class: 'spacer' }),
          el('button', { type: 'button', class: 'ghost small', text: 'Deleted things…', on: { click: () => { d.close(); home({ tab: 'deleted' }); } } }),
          el('button', { type: 'submit', text: 'Close' }))));
    d.addEventListener('close', () => { d.remove(); if (dlg === d) dlg = null; });
    document.body.append(d);
    d.showModal();
    let items = [];
    const paint = (r) => {
      if (!d.isConnected) return;
      if (r?.name && !S.name) { S.name = r.name; title.textContent = `🕘 Earlier versions · ${r.name}`; }
      list.replaceChildren(...(items.length ? items.map((e) => row(S, e, d)) : [el('li', { class: 'vs-empty' },
        el('b', { text: 'No earlier versions yet.' }),
        el('span', { class: 'hint', text: `Hearth keeps them by itself: automatic copies while you work, what sync sets aside, conflict copies${S.kind === 'scene' ? ', the Lab\'s time machine' : ''} and the daily backups. ${r?.same ? `${VC.plural(r.same, 'copy', 'copies')} found, all the same as now.` : ''}` }))]));
    };
    const tm = tmVersions(S);
    const r1 = await api().list(S, { phase: 'local' }).catch((e) => ({ ok: false, error: e.message }));
    if (r1?.ok === false) { list.replaceChildren(el('li', { class: 'hint', text: calmError(r1.error) })); return d; }
    items = VC.mergeLists(r1.versions, await tm);
    S.exists = r1.exists; S.here = r1.here;
    paint(r1);
    if (r1.error) status.textContent = calmError(r1.error);
    else status.textContent = 'Looking in the backups too…';
    const r2 = await api().list(S, { phase: 'backups' }).catch(() => null);
    if (!d.isConnected) return d;
    if (r2?.versions) { items = VC.mergeLists(items, r2.versions); paint(r1); }
    status.textContent = `Looked in: ${[...new Set([...(r1.looked || []), ...(r2?.looked || []), ...(S.kind === 'scene' && typeof ThreeHistory !== 'undefined' ? ['the time machine'] : [])])].join(', ')}.`;
    return d;
  }
  function row(S, e, d) {
    const where = el('span', { class: 'vs-where', text: e.also?.length ? `${e.label} (+${e.also.length} more)` : e.label, title: [e.label, ...(e.also || [])].join('\n') });
    return el('li', { class: 'vs-row' },
      el('div', { class: 'vs-when' }, el('b', { text: VC.when(e.at) }), e.machine ? el('span', { class: 'vs-chip', text: e.machine }) : null),
      el('div', { class: 'vs-what' }, el('span', { class: 'vs-sum', text: e.summary || '' }), where),
      el('div', { class: 'vs-acts' },
        el('button', { type: 'button', class: 'ghost small', text: 'Preview', attrs: { 'aria-label': `Preview the version from ${VC.when(e.at)}` }, on: { click: () => preview(S, e) } }),
        el('button', { type: 'button', class: 'small', text: 'Restore', attrs: { 'aria-label': `Restore the version from ${VC.when(e.at)}` }, on: { click: async (ev) => { const b = ev.currentTarget; b.disabled = true; if (await restore(S, e)) d.close(); else b.disabled = false; } } })));
  }

  // ---------- Preview (read-only) ----------
  async function thingOf(S, e) {
    if (e.tm) { const st = await ThreeHistory.stateOf(e.tm, S.id); const cur = lab()?.get?.(S.id); return st ? { ...clone(cur || {}), layers: st.layers, palette: st.palette } : null; }
    return api().read(e.token);
  }
  async function preview(S, e) {
    const v = await thingOf(S, e).catch(() => null);
    if (!v) { toast('That version can\'t be read any more.', { timeout: 4000 }); return; }
    const cur = liveOf(S);
    const body = el('div', { class: 'vs-preview', attrs: { tabindex: '0', 'aria-label': 'The version (read-only)' } }, ...view(S.kind, v));
    const pd = el('dialog', { class: 'ui-modal vs-dialog vs-pv' },
      el('form', { method: 'dialog' },
        el('h2', { text: `${VC.KINDS[S.kind].name(v)} · ${VC.when(e.at)}` }),
        el('p', { class: 'hint', text: `Read-only. ${e.machine ? `From ${e.machine}. ` : ''}${e.label}.${cur || e.summary ? ` Compared with now: ${cur ? VC.summary(S.kind, v, cur) : e.summary}.` : ''}` }),
        body,
        el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }),
          el('button', { type: 'submit', class: 'ghost', text: 'Close' }),
          el('button', { type: 'button', class: 'primary', text: 'Restore this version', on: { click: async () => { if (await restore(S, e)) { pd.close(); dlg?.close(); } } } }))));
    pd.addEventListener('close', () => pd.remove());
    document.body.append(pd);
    pd.showModal();
  }
  const pre = (t) => el('pre', { class: 'vs-code', text: String(t || '').slice(0, 60000) });
  function view(kind, v) {
    if (kind === 'chat') {
      const ms = (v.messages || []).slice(-300);
      return [el('p', { class: 'hint', text: `${VC.plural((v.messages || []).length, 'message')}${(v.messages || []).length > 300 ? ' (the last 300 shown)' : ''}` }),
        ...ms.map((m) => el('div', { class: `vs-msg vs-${m.role === 'user' ? 'you' : 'ai'}` }, el('small', { text: m.role === 'user' ? 'You' : m.from || 'Reply' }), el('div', { text: String(m.text ?? '').slice(0, 4000) })))];
    }
    if (kind === 'project') return [el('p', {}, el('b', { text: v.name }), ` · ${v.status || 'active'} · ${VC.plural((v.items || []).length, 'thing')}`), el('h3', { text: 'Notes' }), pre(v.notes || '(none)'), el('h3', { text: 'In it' }), el('ul', {}, (v.items || []).slice(0, 80).map((x) => el('li', { text: `${x.type}: ${x.name || x.ref}` })))];
    if (kind === 'scene') return [el('p', { class: 'hint', text: VC.plural((v.layers || []).length || 1, 'layer') }), ...((v.layers || []).length ? v.layers : [{ name: 'main', code: v.code }]).slice(0, 12).flatMap((L) => [el('h3', { text: L.name || 'Layer' }), pre(L.code)])];
    if (kind === 'board') return [el('p', { class: 'hint', text: VC.plural((v.items || []).length, 'item') }), el('ul', {}, (v.items || []).slice(0, 120).map((x) => el('li', { text: `${x.type}${x.title || x.text ? `: ${String(x.title || x.text).slice(0, 80)}` : ''}` })))];
    return [el('p', { class: 'hint', text: `${VC.plural((v.agents || []).length, 'AI')} · only the settings that sync are restored (this computer's own paths and keys stay)` }), pre(JSON.stringify({ agents: (v.agents || []).map((a) => a.name || a.id), settings: v.settings, theme: v.theme }, null, 2))];
  }

  // ---------- Restore (the version in place kept first) ----------
  // undo: an Undo (over: the thing as the restore left it: only what the restore changed is taken back)
  async function restore(S, e, { undo = false, over = null } = {}) {
    try {
      let before = null; let restored = null;
      if (S.kind === 'chat') {
        if (window.Native?.forget && !Native.forget(S.id)) { toast('A reply is still coming in this chat: restore it once it\'s done.', { timeout: 5000 }); return false; }
        const r = await api().restore(S, e.token, { over });
        if (!r?.ok) throw new Error(r?.error || 'Not restored.');
        before = r.before; restored = r.value;
        await chatArrived(S.id);
      } else if (e.tm) {
        const cur = liveOf(S);
        before = cur ? (await api().keep(S, cur))?.before : null;
        await ThreeHistory.restore(e.tm, { id: S.id });
      } else {
        const cur = liveOf(S);
        if (cur) {
          // changed in the window: the module saves it (and sync sends it); nothing on screen writes the old one back
          const k = await api().keep(S, cur);
          if (!k?.ok) throw new Error(k?.error || 'The version in place couldn\'t be kept, so nothing was changed.');
          before = k.before;
          let v = await api().read(e.token);
          if (!v) throw new Error('That version isn\'t there any more.');
          if (over) v = (await api().undo(S.kind, over, v, cur)) || v;
          restored = VC.restoreValue(S.kind, v, cur);
          await applyLive(S, restored);
        } else {
          const r = await api().restore(S, e.token, { over });
          if (!r?.ok) throw new Error(r?.error || 'Not restored.');
          before = r.before; restored = r.value;
          if (S.kind === 'scene') lab()?.refresh?.();
        }
      }
      const what = S.name || KIND_WORD[S.kind];
      toast(undo ? `Put back “${what}” as it was.` : `Restored “${what}” to ${VC.when(e.at)}. The version you had is kept (Undo, or Earlier versions).`, {
        timeout: 9000, ...(before && !undo ? { action: { label: 'Undo', fn: () => restore(S, { token: before, at: Date.now(), label: VC.SRC_WORDS.before }, { undo: true, over: restored }) } } : {}) });
      dispatchEvent(new CustomEvent('hearth:versions', { detail: { kind: S.kind, id: S.id, undo } }));
      return true;
    } catch (x) { err(x); return false; }
  }
  async function applyLive(S, v) {
    if (S.kind === 'project') { if (!projects().replaceWith?.(S.id, v)) throw new Error('That project isn\'t in your list now.'); return; }
    if (S.kind === 'scene') {
      const L = lab(); const x = L.get(S.id);
      const layers = (v.layers || []).length ? v.layers : (L.layersOf?.({ ...x, layers: null, code: v.code }) || [{ id: 'main', name: 'main', code: v.code || '' }]);
      if (typeof ThreeHistory !== 'undefined' && ThreeHistory.apply) await ThreeHistory.apply(S.id, { layers: clone(layers), ...(v.palette ? { palette: [...v.palette] } : {}) }, { label: 'Restored an earlier version' });
      else { x.layers = clone(layers); if (v.palette) x.palette = [...v.palette]; else delete x.palette; L.changed(S.id); }
      if (v.name && v.name !== x.name) L.rename?.(S.id, v.name);
      return;
    }
    if (S.kind === 'board') {
      const B = boardOpen(S.id); const b = B._.S.boards.get(S.id);
      for (const k of Object.keys(b)) if (k !== 'id') delete b[k];
      Object.assign(b, clone(v), { id: S.id });
      b.items ||= []; b.view ||= { x: 0, y: 0, z: 1 };
      await B.save(b, { now: true });
      if (B.current?.()?.id === S.id && B.isMounted?.()) await B.open(b);
      B._.emit?.('boards');
    }
  }
  // a chat written by the main process: the list and an open view read it again
  async function chatArrived(id) {
    window.Native?.forget?.(id);
    try { H.chats = await window.hub.listChats(); Panel.render(); } catch { /* the list isn't up */ }
    for (const a of H.agents?.() || []) if (H.activeChat?.[a.id] === id && Native.hasView?.(a.id)) Native.refresh(a.id, { keepScroll: true });
  }

  // ---------- "Earlier versions of synced things" + Deleted things ----------
  async function things() {
    const out = [];
    for (const c of (H.chats || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 60)) out.push({ kind: 'chat', id: c.id, name: c.title || 'Chat', at: c.updatedAt || 0 });
    const P = projects();
    const plist = P ? P.all() : ((await window.hub.kvGet('projects', null).catch(() => null))?.list || []);
    for (const p of plist) out.push({ kind: 'project', id: p.id, name: p.name, at: p.updated || 0 });
    const sl = lab()?.all?.() || (await window.hub.kvPick?.('three-sketches', ['id', 'name', 'updatedAt']).catch(() => null)) || [];
    for (const s of sl) if (s?.id) out.push({ kind: 'scene', id: s.id, name: s.name || 'Scene', at: s.updatedAt || 0 });
    const bl = (lazy('board') && typeof Board !== 'undefined' && Board.boards?.().length ? Board.boards() : (await window.hub.kvGet('boards', null).catch(() => null))?.list) || [];
    for (const b of bl) if (b?.id) out.push({ kind: 'board', id: b.id, name: b.name || 'Board', at: b.updated || 0 });
    out.push({ kind: 'settings', id: 'config', name: 'Settings and agents', at: 0 });
    return out;
  }
  async function home({ tab = 'versions' } = {}) {
    dlg?.close();
    const q = el('input', { type: 'search', class: 'vs-q', placeholder: 'Find a chat, project, scene, board…', attrs: { 'aria-label': 'Find' } });
    const body = el('div', { class: 'vs-home' });
    const tabs = el('div', { class: 'vs-tabs', attrs: { role: 'tablist' } });
    const d = dlg = el('dialog', { class: 'ui-modal vs-dialog', attrs: { 'aria-label': 'Earlier versions and deleted things' } },
      el('form', { method: 'dialog' }, el('h2', { text: '🕘 Earlier versions' }), tabs, body,
        el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Close' }))));
    d.addEventListener('close', () => { d.remove(); if (dlg === d) dlg = null; });
    document.body.append(d);
    d.showModal();
    const all = await things().catch(() => []);
    const show = async (t) => {
      tab = t;
      tabs.replaceChildren(...[['versions', 'Earlier versions of synced things'], ['deleted', 'Deleted things']].map(([k, l]) => el('button', { type: 'button', class: `ghost small${k === t ? ' on' : ''}`, text: l, attrs: { role: 'tab', 'aria-selected': String(k === t) }, on: { click: () => show(k) } })));
      if (t === 'deleted') { await deletedView(body, d); return; }
      const ul = el('ul', { class: 'vs-things' });
      const fill = () => {
        const s = q.value.trim().toLowerCase();
        const hits = all.filter((x) => !s || x.name.toLowerCase().includes(s)).slice(0, s ? 80 : 40);
        ul.replaceChildren(...hits.map((x) => el('li', {}, el('button', { type: 'button', class: 'vs-thing', on: { click: () => { d.close(); open(x); } } },
          el('span', { class: 'vs-chip', text: KIND_WORD[x.kind] }), el('span', { class: 'vs-name', text: x.name }), x.at ? el('small', { class: 'hint', text: timeAgo(x.at) }) : null))));
        if (!hits.length) ul.append(el('li', { class: 'hint', text: 'Nothing by that name.' }));
      };
      q.oninput = fill; fill();
      body.replaceChildren(el('p', { class: 'hint', text: 'Pick something to see its earlier versions: from both computers, sync, conflicts, the Lab\'s time machine and your backups.' }), q, ul);
      setTimeout(() => q.focus(), 0);
    };
    show(tab);
    return d;
  }
  async function deletedView(body, d) {
    body.replaceChildren(el('p', { class: 'hint', text: 'Looking…' }));
    const r = await api().deleted().catch((e) => ({ ok: false, error: e.message }));
    if (!d.isConnected) return;
    if (r?.ok === false) { body.replaceChildren(el('p', { class: 'hint', text: calmError(r.error) })); return; }
    const sec = (title, rows, word) => el('section', { class: 'vs-sec' }, el('h3', { text: `${title} (${rows.length})` }),
      rows.length ? el('ul', { class: 'vs-del' }, rows.map((x) => el('li', {},
        el('span', { class: 'vs-name', text: x.name }),
        el('small', { class: 'hint', text: [`deleted ${timeAgo(x.at)}`, x.n != null ? VC.plural(x.n, word) : '', x.where].filter(Boolean).join(' · ') }),
        el('button', { type: 'button', class: 'small', text: 'Restore', attrs: { 'aria-label': `Restore ${x.name}` }, on: { click: async (ev) => { const b = ev.currentTarget; b.disabled = true; if (await undelete(x)) b.closest('li')?.remove(); else b.disabled = false; } } }))))
        : el('p', { class: 'hint', text: 'None.' }));
    body.replaceChildren(
      el('p', { class: 'hint', text: 'Things deleted on either computer that Hearth still keeps (chats for 30 days, the last 30 projects and scenes). Restore puts one back as it was; nothing in your lists is replaced.' }),
      sec('Chats', r.chats.map((x) => ({ ...x, kind: 'chat' })), 'message'), sec('Projects', r.projects.map((x) => ({ ...x, kind: 'project' })), 'thing'),
      sec('Lab scenes', r.scenes.map((x) => ({ ...x, kind: 'scene' })), 'layer'), sec('Boards', r.boards.map((x) => ({ ...x, kind: 'board' })), 'item'));
  }
  async function undelete(x) {
    try {
      let ok = false;
      if (x.kind === 'project' && projects()?.restoreProject) ok = Boolean(projects().restoreProject(x.id));
      else if (x.kind === 'scene' && lab()) {
        ok = Boolean(lab().undelete?.(x.id));
        if (!ok && !lab().get(x.id)) { const t = await api().thing(x.key); if (t) ok = Boolean(lab().create({ name: t.name, code: t.code ?? t.layers?.[0]?.code ?? '', layers: t.layers || null, id: x.id })); }
      } else if (x.kind === 'board' && lazy('board') && typeof Board !== 'undefined' && Board._?.S?.index) {
        const b = await Board.load(x.id);
        if (b && !Board._.S.index.list.some((y) => y.id === x.id)) { Board._.S.index.list.unshift({ id: x.id, name: b.name, updated: Date.now(), count: (b.items || []).length, chats: b.chats || [] }); await Board.save(b, { now: true }); Board._.emit?.('boards'); ok = true; }
      } else {
        const r = await api().undelete(x.key);
        if (!r?.ok) throw new Error(r?.error || 'Not restored.');
        ok = true;
        if (x.kind === 'chat') await chatArrived(x.id);
        if (x.kind === 'scene') lab()?.refresh?.();
      }
      if (!ok) throw new Error('It couldn\'t be put back (it may be back already).');
      const open = x.kind === 'chat' && x.agentId ? { label: 'Open', fn: () => Native.open(x.agentId, x.id) } : x.kind === 'project' && projects()?.openHome ? { label: 'Open', fn: () => projects().openHome(x.id) } : null;
      toast(`Restored “${x.name}”.`, { timeout: 6000, ...(open ? { action: open } : {}) });
      dispatchEvent(new CustomEvent('hearth:versions', { detail: { kind: x.kind, id: x.id, undeleted: true } }));
      return true;
    } catch (e) { err(e); return false; }
  }

  // ---------- ways in (besides the right-click menus and the sync panel) ----------
  if (typeof AppUI !== 'undefined' && AppUI.addAction) {
    AppUI.addAction('Earlier versions… (chats, projects, Lab scenes, boards, settings)', () => home());
    AppUI.addAction('Deleted things… (chats, projects, Lab scenes, boards)', () => home({ tab: 'deleted' }));
  }
  if (typeof Commands !== 'undefined' && !Commands.get?.('versions')) {
    Commands.register({
      name: 'versions', area: 'App', args: '[all|deleted]', desc: 'Earlier versions of this chat (or of anything: all), and Deleted things',
      keywords: 'history earlier older version restore undo deleted trash bring back previous backup',
      complete: () => [{ value: 'all', hint: 'chats, projects, scenes, boards, settings' }, { value: 'deleted', hint: 'Deleted things' }],
      run: async (args, ctx) => {
        const a = String(args || '').trim().toLowerCase();
        if (a === 'deleted') { home({ tab: 'deleted' }); return null; }
        const id = ctx?.agentId ? H.activeChat?.[ctx.agentId] : null;
        if (a === 'all' || !id) { home(); return null; }
        open({ kind: 'chat', id, name: (H.chats || []).find((c) => c.id === id)?.title || '' });
        return null;
      },
    });
  }

  return { open, home, restore, preview, undelete, things };
})();
window.Versions = Versions;
