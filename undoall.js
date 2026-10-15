// One "Undo last change" everywhere (round 41, undoall). Hearth grew many separate undos (the Lab's sliders and time
// machine, what the AIs did, memory tidy, recipes, the board, the toast after a deleted chat…) and Settings switches or
// ⋯ AI setup rows had none. The owner shouldn't need to know which is which, so this keeps ONE small log of the changes
// the owner can see, each with a plain label, and one key for all of them:
//   · Ctrl/⌘+Z outside text boxes, the Lab and the board (their own undo wins there) undoes the last change;
//     Ctrl/⌘+Shift+Z (Ctrl+Y on Windows) redoes it. A toast says it: "Undid: Turned off Mood board for Claude · Redo".
//   · Activity (◉) › Recent changes: the newest changes, one click undoes any of them (when still possible).
//   · Find anything (Ctrl/⌘+K) "undo" · chat: /undo-change [redo | list], /redo-change.
// What goes in (hooked once, not row by row):
//   config   every saveConfig() the owner caused: Settings, ⋯ AI setup (personality, instructions, tools, files…), the
//            AIs' list, the look (the old / new values are diffed, undone by putting the old ones back)
//   switch   Settings' on / off rows that live in a command (settings-find.js goes through viaSwitch)
//   chat-*   a chat deleted (back from Recently deleted), renamed, moved to a folder / archived / tagged
//   memory   Tidy memory (memorytidy.js tells it the before / after)
//   lab-file a recipe or a template deleted (a copy is kept first in data/.undo-hold, this computer only)
//   AI changes are not copied: the newest ones come from AiUndo (aiundo.js) and are undone by it (it asks first);
//   the Lab's scene edits stay in the Lab's own undo / ⟲ History (a line in Recent changes says so).
// Never undone: anything that went out of Hearth (nothing here posts or uploads), adding an AI (said plainly).
// Data: data/.undo-hold/log.json (this computer's log; ≤ 120 entries, a week) + the kept copies beside it.
const UndoAll = (() => {
  const C = UndoAllCore;
  const short = C.short;
  const mac = /Mac/.test(navigator.platform);
  const K = mac ? '⌘' : 'Ctrl+';
  const bootAt = Date.now();
  let L = C.makeLog();

  // ---------- this computer's log ----------
  let dir = null;
  async function holdDir() {
    if (dir) return dir;
    const att = String(await window.hub.attachmentsDir());
    const sep = att.includes('\\') ? '\\' : '/';
    dir = `${att.replace(/[\\/]attachments[\\/]?$/, '')}${sep}.undo-hold`; // a dot folder: sync leaves it on this computer
    return dir;
  }
  const join = (...p) => { const sep = String(p[0]).includes('\\') ? '\\' : '/'; return p.map((x, i) => (i ? String(x).replace(/^[\\/]+/, '') : String(x).replace(/[\\/]+$/, ''))).join(sep); };
  let loaded = null;
  const ready = () => (loaded ||= (async () => {
    try {
      const f = join(await holdDir(), 'log.json');
      if (!(await window.hub.fs.stat(f))) throw new Error('none yet');
      const txt = await window.hub.fs.read(f);
      const saved = C.makeLog(JSON.parse(txt));
      const mine = new Set(L.list.map((e) => e.id));
      L.list = saved.list.filter((e) => !mine.has(e.id)).concat(L.list);
      L.seq = Math.max(L.seq, saved.seq);
      C.prune(L);
    } catch { /* none yet */ }
    sweep();
  })());
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(async () => { try { await window.hub.fs.write(join(await holdDir(), 'log.json'), JSON.stringify(C.toJSON(L))); } catch { /* kept in memory */ } }, 400);
  }
  // kept copies no entry points at any more go to the Trash (once per start)
  async function sweep() {
    try {
      const keep = new Set(L.list.map((e) => e.u?.hold).filter(Boolean));
      if (!(await window.hub.fs.stat(await holdDir()))) return;
      const all = (await window.hub.fs.list(await holdDir())) || [];
      const old = all.filter((x) => x.isDir && !keep.has(x.path)).map((x) => x.path);
      if (old.length) await window.hub.fs.trash(old);
    } catch { /* nothing kept yet */ }
  }
  const listeners = new Set();
  function changed() { save(); paintPart(); for (const fn of listeners) { try { fn(); } catch { /* never breaks */ } } }
  function add(e, merge = null) {
    const x = C.add(L, e, Date.now(), merge);
    changed();
    return x;
  }

  // ---------- who changed it: the owner, not a feature by itself or an AI ----------
  let lastInput = 0;
  for (const t of ['pointerdown', 'keydown', 'click', 'change', 'drop']) addEventListener(t, () => { lastInput = performance.now(); }, true); // (round 42) drop: a chat dragged onto a folder
  const ownerActing = (ms = 3000) => performance.now() - lastInput < ms;
  let quiet = 0; // our own undo / redo: never recorded
  let aiCmd = 0; // a command an AI runs during its reply (aiundo.js records those)
  const aiRunning = (x) => x.source === 'code' && x.agentId && typeof Native !== 'undefined' && Native.pendingFor?.(x.agentId);
  async function hush(fn) { quiet += 1; try { return await fn(); } finally { quiet -= 1; rebase(); } }

  // ---------- config: one hook on saveConfig() ----------
  let base = null;
  const rebase = () => { if (typeof H !== 'undefined' && H.config) base = C.snapshot(H.config); };
  const names = { agent: (id) => (typeof H !== 'undefined' && H.agent?.(id)) || base?.agents?.find((a) => a.id === id) || null };
  function recordConfig() {
    if (typeof H === 'undefined' || !H.config) return;
    const prev = base;
    rebase();
    if (!prev || quiet || aiCmd || !ownerActing()) return;
    const ch = C.diffConfig(prev, base);
    if (!ch.length) return;
    const cant = C.configCant(ch);
    add({ kind: 'config', key: C.keyOf(ch), label: C.configWords(ch, names), u: { ch }, ...(cant ? { cant } : {}) },
      (top, e) => { const m = C.mergeConfig(top.u.ch, e.u.ch); return m ? { u: { ch: m }, label: C.configWords(m, names) } : null; });
  }
  function hookConfig() {
    if (typeof saveConfig !== 'function' || saveConfig.undoall) return;
    const orig = saveConfig;
    const wrapped = function (...a) { try { recordConfig(); } catch (err) { console.warn('undoall', err); } return orig.apply(this, a); };
    wrapped.undoall = true;
    window.saveConfig = wrapped;
    rebase();
    // a change that came from the file (another computer, an edit by hand) is the new starting point
    window.hub.onConfigChanged?.(() => setTimeout(() => { if (!quiet) rebase(); }, 0));
  }
  async function putConfig(ch, side) {
    await hush(async () => {
      C.applyConfig(H.config, ch, side);
      await saveConfig();
    });
    for (const id of new Set(ch.filter((c) => c.path[0] === 'agents').map((c) => c.path[1]))) { try { if (typeof Cachewise !== 'undefined') Cachewise.changed(id); } catch { /* no cache line */ } }
    repaintPlaces();
  }
  // what shows these values right now follows (⋯ AI setup, Settings' switches)
  function repaintPlaces() {
    try { if (typeof Options !== 'undefined' && Options.sheet) Options.paint(); } catch { /* not open */ }
    for (const r of document.querySelectorAll('.sf-row')) r.dispatchEvent(new CustomEvent('sf-repaint'));
    try { if (typeof Panel !== 'undefined') Panel.render(); } catch { /* no list */ }
  }

  // ---------- Settings' switches that live in a command (settings-find.js) ----------
  // { cmd, label, on, off, choices, agentId, get() → state, go(arg) → runs it, arg }
  async function viaSwitch(s) {
    const was = s.get();
    const r = await hush(() => s.go(s.arg));
    const now = s.get();
    if (was === undefined || now === undefined || C.same(was, now)) return r;
    const u = { cmd: s.cmd, label: s.label, on: s.on || null, off: s.off || null, choices: s.choices || null, agentId: s.agentId || null, was, now };
    add({ kind: 'switch', key: `switch:${s.cmd}`, label: C.switchWords(s.label, now, s.choices), u },
      (top, e) => (C.same(top.u.was, e.u.now) ? null : { u: { ...top.u, now: e.u.now }, label: e.label }));
    return r;
  }
  const quietCtx = { source: 'settings', say() {}, note() {}, error: (m) => { throw new Error(String(m)); } };
  const runSwitch = (u, v) => hush(() => Commands.tryRun(`/${u.cmd} ${C.switchArg(u, v)}`, u.agentId || H.claudeAgent()?.id, undefined, quietCtx));
  const switchNow = (u) => { try { return typeof SettingsFind !== 'undefined' ? SettingsFind.state(u.cmd) : undefined; } catch { return undefined; } };

  // ---------- chats: deleted, renamed, moved / archived / tagged ----------
  const chatRow = (id) => (H.chats || []).find((c) => c.id === id);
  function hookChats() {
    if (typeof Native !== 'undefined' && !Native.remove.undoall) {
      const rm = Native.remove;
      Native.remove = async function (chatId, ...rest) {
        const s = chatRow(chatId);
        const r = await rm.call(this, chatId, ...rest);
        if (!quiet && s) add({ kind: 'chat-delete', key: `chat:${chatId}`, label: `Deleted chat “${short(s.title || 'chat', 40)}”`, u: { id: chatId, agentId: s.agentId, title: s.title || '' } });
        return r;
      };
      Native.remove.undoall = true;
      const rn = Native.rename;
      Native.rename = async function (chatId, title, ...rest) {
        const old = chatRow(chatId)?.title;
        const r = await rn.call(this, chatId, title, ...rest);
        const now = chatRow(chatId)?.title;
        if (!quiet && !aiCmd && ownerActing(1500) && old != null && now != null && old !== now) {
          add({ kind: 'chat-rename', key: `title:${chatId}`, label: `Renamed chat “${short(old, 30)}” to “${short(now, 30)}”`, u: { id: chatId, old, now } },
            (top, e) => (top.u.old === e.u.now ? null : { u: { ...top.u, now: e.u.now }, label: `Renamed chat “${short(top.u.old, 30)}” to “${short(e.u.now, 30)}”` }));
        }
        return r;
      };
    }
    if (typeof ChatUX !== 'undefined' && ChatUX.setMeta && !ChatUX.setMeta.undoall) {
      const sm = ChatUX.setMeta;
      ChatUX.setMeta = function (chatId, patch, ...rest) {
        const before = C.clone(ChatUX.metaOf?.(chatId) || {});
        const r = sm.call(this, chatId, patch, ...rest);
        const after = C.clone(ChatUX.metaOf?.(chatId) || {});
        if (!quiet && !aiCmd && ownerActing(1500) && !C.same(before, after)) {
          const title = chatRow(chatId)?.title || 'chat';
          add({ kind: 'chat-meta', key: `meta:${chatId}`, label: C.metaWords(title, before, after), u: { id: chatId, title, before, after } },
            (top, e) => (C.same(top.u.before, e.u.after) ? null : { u: { ...top.u, after: e.u.after }, label: C.metaWords(title, top.u.before, e.u.after) }));
        }
        return r;
      };
      ChatUX.setMeta.undoall = true;
    }
  }
  async function chatsAgain() { H.chats = await window.hub.listChats(); if (typeof Panel !== 'undefined') Panel.render(); }

  // ---------- memory tidy (memorytidy.js) ----------
  function memoryTidied({ before, after, n = 0 } = {}) {
    if (!before || !after || quiet) return;
    add({ kind: 'memory', key: `memory:${Date.now()}`, label: `Tidied memory (${n} change${n === 1 ? '' : 's'})`, u: { before, after } });
  }
  const memCore = () => (typeof MemoryTidyCore !== 'undefined' ? MemoryTidyCore : null);

  // ---------- a recipe / a template deleted (tools/three-recipes.js, tools/three-templates.js) ----------
  // keepFiles(paths) before the Trash: a copy of each file (a folder's files too) in data/.undo-hold/<id>/
  async function keepFiles(paths) {
    try {
      const hold = join(await holdDir(), `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`);
      const files = [];
      for (const p of paths) {
        const st = await window.hub.fs.stat(p);
        if (!st) continue;
        if (!st.isDir) { files.push([p, join(hold, String(p).split(/[\\/]/).pop())]); continue; }
        const name = String(p).split(/[\\/]/).pop();
        for (const f of (await window.hub.fs.list(p, { recursive: true, depth: 6 })) || []) if (!f.isDir) files.push([f.path, join(hold, name, f.path.slice(String(p).length))]);
      }
      for (const [from, to] of files) await window.hub.fs.copy(from, to);
      return { hold, paths: paths.slice(), files };
    } catch (err) { console.warn('undoall: no copy', err); return null; }
  }
  // deleted(kept, { what: 'recipe' | 'template', name }): the delete went through; one entry
  function deleted(kept, { what = 'file', name = '' } = {}) {
    if (quiet) return null;
    const label = `Deleted ${what} “${short(name, 40)}”`;
    if (!kept?.files?.length) return add({ kind: 'lab-file', key: `${what}:${name}`, label, u: { what, name }, cant: 'No copy was kept (it went to your computer\'s Trash: it\'s still there).' });
    return add({ kind: 'lab-file', key: `${what}:${name}`, label, u: { what, name, hold: kept.hold, paths: kept.paths, files: kept.files } });
  }
  async function refreshLab(what) {
    try { if (what === 'recipe' && typeof LabRecipes !== 'undefined') await LabRecipes.list({ fresh: true }); } catch { /* not open */ }
    try { if (what === 'template' && typeof LabTemplates !== 'undefined') await LabTemplates.list({ fresh: true }); } catch { /* not open */ }
  }

  // ---------- each kind: undo, redo, and "is it still as the change left it?" ----------
  // check(e) → null (fine) · { warn } (changed since: ask first) · { already } (nothing to do) · { cant } (impossible now)
  const KINDS = {
    config: {
      check(e, side = 'now') { const m = C.movedSince(H.config, e.u.ch, side); return m.length ? { warn: m.length === e.u.ch.length ? 'It was changed again since.' : 'Part of it was changed again since.' } : null; },
      undo: (e) => putConfig(e.u.ch, 'old'),
      redo: (e) => putConfig(e.u.ch, 'now'),
    },
    switch: {
      check(e, side = 'now') { // side 'now': as the change left it (before an undo) · 'old': as it was before it (before a redo)
        const v = switchNow(e.u); const want = side === 'now' ? e.u.now : e.u.was; const other = side === 'now' ? e.u.was : e.u.now;
        return v !== undefined && !C.same(v, want) ? (C.same(v, other) ? { already: true } : { warn: 'It was changed again since.' }) : null;
      },
      undo: async (e) => { await runSwitch(e.u, e.u.was); repaintPlaces(); },
      redo: async (e) => { await runSwitch(e.u, e.u.now); repaintPlaces(); },
    },
    'chat-delete': {
      async check(e, side = 'now') {
        if (side === 'old') return chatRow(e.u.id) ? null : { already: true };
        if (chatRow(e.u.id)) return { already: true };
        const t = await window.hub.listChatTrash().catch(() => []);
        return t.some((c) => c.id === e.u.id) ? null : { cant: 'It\'s no longer in Recently deleted (emptied, or older than 30 days).' };
      },
      undo: async (e) => { await window.hub.restoreChat(e.u.id); await chatsAgain(); },
      redo: (e) => hush(() => Native.remove(e.u.id)),
    },
    'chat-rename': {
      check(e, side = 'now') { const t = chatRow(e.u.id)?.title; if (t == null) return { cant: 'That chat is gone.' }; return t === e.u[side] ? null : t === e.u[side === 'now' ? 'old' : 'now'] ? { already: true } : { warn: 'It was renamed again since.' }; },
      undo: (e) => hush(() => Native.rename(e.u.id, e.u.old)),
      redo: (e) => hush(() => Native.rename(e.u.id, e.u.now)),
    },
    'chat-meta': {
      check(e, side = 'now') { const m = ChatUX.metaOf?.(e.u.id) || {}; const want = side === 'now' ? e.u.after : e.u.before; return C.same(m, want) ? null : C.same(m, side === 'now' ? e.u.before : e.u.after) ? { already: true } : { warn: 'It was changed again since.' }; },
      undo: (e) => hush(() => ChatUX.setMeta(e.u.id, C.metaPatch(e.u.before, ChatUX.metaOf?.(e.u.id) || {}))),
      redo: (e) => hush(() => ChatUX.setMeta(e.u.id, C.metaPatch(e.u.after, ChatUX.metaOf?.(e.u.id) || {}))),
    },
    memory: {
      async check(e, side = 'now') { if (!memCore()) return { cant: 'Memory tidy isn\'t loaded (open ⋯ AI setup once).' }; const m = await window.hub.getMemory(); return C.same(m, side === 'now' ? e.u.before : e.u.after) ? { already: true } : null; },
      undo: async (e) => { const m = await window.hub.getMemory(); await window.hub.saveMemory(memCore().undo(m, e.u.before, e.u.after)); repaintPlaces(); },
      redo: async (e) => { const m = await window.hub.getMemory(); await window.hub.saveMemory(memCore().undo(m, e.u.after, e.u.before)); repaintPlaces(); },
    },
    'lab-file': {
      async check(e, side = 'now') {
        const there = await window.hub.fs.stat(e.u.paths[0]).catch(() => null);
        if (side === 'now') { if (there) return { already: true }; const kept = await window.hub.fs.stat(e.u.files[0][1]).catch(() => null); return kept ? null : { cant: 'The kept copy is gone.' }; }
        return there ? null : { already: true };
      },
      undo: async (e) => { for (const [to, from] of e.u.files) await window.hub.fs.copy(from, to); await refreshLab(e.u.what); },
      redo: async (e) => {
        for (const [from, to] of e.u.files) await window.hub.fs.copy(from, to); // the copy follows what it was when it came back
        const r = await window.hub.fs.trash(e.u.paths);
        if (r?.failed?.length) throw new Error(r.failed[0].error || 'it couldn\'t go to the Trash');
        await refreshLab(e.u.what);
      },
    },
    // (round 43, costcoach) a value this window keeps in its store (a mission pinned 📌 from now on): put back as it was
    store: {
      check(e, side = 'now') { const v = storeGet(e.u.key); const want = side === 'now' ? e.u.now : e.u.was; const other = side === 'now' ? e.u.was : e.u.now; return C.same(v, want) ? null : C.same(v, other) ? { already: true } : { warn: 'It was changed again since.' }; },
      undo: (e) => storePut(e.u, e.u.was),
      redo: (e) => storePut(e.u, e.u.now),
    },
  };
  // the store value as missions.js reads it (null = not set); a mission goes back through Missions.set so its button follows
  const storeGet = (k) => { try { return store.get(k, null) ?? null; } catch { return null; } };
  function storePut(u, v) {
    if (u.via === 'mission' && typeof Missions !== 'undefined' && u.agentId) return hush(() => Missions.set(u.agentId, v || 'normal', { keep: true }));
    try { store.set(u.key, v ?? null); } catch { /* storage is a convenience */ }
  }
  // stored({ key, label, was, now, via?, agentId? }): a store change the owner just made (a click), one entry
  function stored(s) {
    if (quiet || !s?.key || C.same(s.was ?? null, s.now ?? null)) return null;
    return add({ kind: 'store', key: `store:${s.key}`, label: s.label || 'Changed a setting', u: { key: s.key, was: s.was ?? null, now: s.now ?? null, via: s.via || null, agentId: s.agentId || null } });
  }

  // ---------- AI changes: the newest ones, undone by aiundo.js ----------
  const aiList = () => { try { return (window.AiUndo?.list?.() || []).filter((e) => e.at >= bootAt && !e.cant); } catch { return []; } };
  const aiNewest = () => aiList().filter((e) => !e.undone).sort((a, b) => b.at - a.at)[0] || null;
  const aiLabel = (e) => `${e.who || 'An AI'}: ${e.what}${e.target ? ` · ${e.target}` : ''}${e.outside ? (e.outside.gone ? ' · deleted outside Hearth since' : ' · changed outside Hearth since (not safely undoable: it asks first)') : ''}`; // (round 42, filewatch)
  async function undoAi(e) {
    const r = await window.AiUndo.undoThis(e.id); // it asks first and says what it did
    paintPart();
    return { ok: Boolean(r?.ok), ai: true, label: aiLabel(e), error: r?.error || null, cancelled: Boolean(r?.cancelled) };
  }

  // ---------- undo / redo ----------
  // one at a time, in the order asked (Ctrl+Z twice fast = the last two changes)
  let chain = Promise.resolve();
  function guarded(fn) { const p = chain.then(fn); chain = p.catch(() => {}); return p; }
  // e: an entry of the log (the newest by default) · ask: confirm when it was changed since (always for the list)
  function undo(e = null, { quietToast = false } = {}) {
    return guarded(async () => {
      await ready();
      if (!e) {
        const mine = C.nextUndo(L, (x) => x.failed && x.failedAt > Date.now() - 2000);
        const ai = aiNewest();
        if (ai && (!mine || ai.at > mine.at)) return undoAi(ai);
        e = mine;
      }
      if (!e) { if (!quietToast) toast('Nothing to undo here', { timeout: 1600 }); return { ok: false, none: true }; }
      if (e.undone) return { ok: false, error: 'Already undone.' };
      if (e.cant) { toast(`Can't undo “${e.label}”: ${e.cant}`, { timeout: 4500 }); return { ok: false, cant: e.cant }; }
      const k = KINDS[e.kind];
      if (!k) return { ok: false, error: 'Unknown change.' };
      let c = null;
      try { c = await k.check?.(e, 'now'); } catch { c = null; }
      if (c?.cant) { e.cant = c.cant; changed(); toast(`Can't undo “${e.label}”: ${c.cant}`, { timeout: 4500 }); return { ok: false, cant: c.cant }; }
      if (c?.already) { C.markUndone(L, e); changed(); toast(`Already undone: ${e.label}`, { timeout: 2200 }); return { ok: true, already: true, label: e.label }; }
      if (c?.warn && !(await Modal.confirm('Undo anyway?', `${e.label}. ${c.warn} Undoing puts back how it was before this change.`, { ok: 'Undo anyway' }))) return { ok: false, cancelled: true };
      try { await k.undo(e); } catch (err) {
        e.failed = String(err?.message || err); e.failedAt = Date.now(); changed();
        toast(`Couldn't undo “${e.label}”: ${e.failed}`, { type: 'error', timeout: 6000 });
        return { ok: false, error: e.failed };
      }
      delete e.failed;
      C.markUndone(L, e);
      changed();
      if (!quietToast) toast(`Undid: ${e.label}`, { timeout: 6000, action: { label: 'Redo', fn: () => redo(e) } });
      return { ok: true, label: e.label, id: e.id };
    });
  }
  function redo(e = null, { quietToast = false } = {}) {
    return guarded(async () => {
      await ready();
      e ||= C.nextRedo(L);
      if (!e) { if (!quietToast) toast(aiList().some((x) => x.undone) ? 'Nothing to redo (an AI\'s undone change comes back from the Lab\'s History or by asking it again)' : 'Nothing to redo', { timeout: 2200 }); return { ok: false, none: true }; }
      if (!C.canRedo(L, e)) return { ok: false, error: 'It can\'t be redone any more (something changed after it was undone).' };
      const k = KINDS[e.kind];
      let c = null;
      try { c = await k.check?.(e, 'old'); } catch { c = null; }
      if (c?.cant) { toast(`Can't redo “${e.label}”: ${c.cant}`, { timeout: 4500 }); return { ok: false, cant: c.cant }; }
      if (!c?.already) {
        if (c?.warn && !(await Modal.confirm('Redo anyway?', `${e.label}. ${c.warn}`, { ok: 'Redo anyway' }))) return { ok: false, cancelled: true };
        try { await k.redo(e); } catch (err) { toast(`Couldn't redo “${e.label}”: ${err?.message || err}`, { type: 'error', timeout: 6000 }); return { ok: false, error: String(err?.message || err) }; }
      }
      C.markRedone(L, e);
      changed();
      if (!quietToast) toast(`Redid: ${e.label}`, { timeout: 4000, action: { label: 'Undo', fn: () => undo(e) } });
      return { ok: true, label: e.label, id: e.id };
    });
  }

  // ---------- Ctrl/⌘+Z · Ctrl/⌘+Shift+Z (Ctrl+Y) ----------
  // Text boxes keep their own undo; the Lab and the board keep theirs (their handlers run first and stop the key);
  // a dialog or a sheet over them (Settings, ⋯ AI setup, Activity) is ours again.
  const OWN = new Set(['tool:three', 'tool:board']);
  const editable = (n) => Boolean(n?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], .code-editor, .cm-editor, iframe, webview'));
  function ours(e) {
    if (editable(e.target) || editable(document.activeElement)) return false;
    if (e.target?.closest?.('dialog, .opt-sheet, .ac-pop, #panel')) return true;
    const sid = String((typeof H !== 'undefined' && H.activeId && H.surfaceIdFor?.(H.activeId)) || '');
    if (OWN.has(sid)) return false;
    if (e.target?.closest?.('.tweaks, .lab-pane, .board-root, .three-lab')) return false;
    return true;
  }
  function onKey(e) {
    if (e.defaultPrevented || e.altKey || e.isComposing || !(mac ? e.metaKey : e.ctrlKey)) return;
    const z = e.code === 'KeyZ'; const y = e.code === 'KeyY' && !mac && !e.shiftKey;
    if ((!z && !y) || !ours(e)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (y || e.shiftKey) redo(); else undo();
  }

  // ---------- Activity › Recent changes ----------
  let part = null; let all = false;
  const ICON = { config: '⚙', switch: '⚙', 'chat-delete': '🗑', 'chat-rename': '✎', 'chat-meta': '📁', memory: '🧹', 'lab-file': '📜', ai: '✦' };
  function partEl() {
    if (part) return part;
    const more = el('button', { type: 'button', class: 'ghost small ua-more', hidden: true, on: { click: () => { all = !all; paintPart(); } } });
    const hist = el('button', { type: 'button', class: 'ghost small ua-lab', text: 'History…', title: 'The Lab\'s time machine: every version of a scene', on: { click: () => Commands.exec('/history') } });
    part = el('section', { class: 'ac-sec ua-part', hidden: true, attrs: { 'aria-label': 'Recent changes' } },
      el('h4', {}, 'Recent changes', el('span', { class: 'ua-key', text: ` · ${K}Z undoes the last one` })),
      el('div', { class: 'ac-list ua-list' }), more,
      el('p', { class: 'ua-foot' }, el('span', { text: 'Lab scene edits: their own undo in the Lab, or ' }), hist));
    return part;
  }
  function rows() {
    const mine = [...L.list].reverse().map((e) => ({ e, at: e.at, ai: false }));
    const ai = aiList().map((e) => ({ e, at: e.at, ai: true }));
    return mine.concat(ai).sort((a, b) => b.at - a.at);
  }
  function rowEl(r) {
    const { e } = r;
    const undone = Boolean(e.undone);
    const label = r.ai ? aiLabel(e) : e.label;
    let act = null;
    if (r.ai) act = undone ? el('span', { class: 'ua-state', text: 'undone' }) : el('button', { type: 'button', class: 'ghost small ua-undo', text: '↶', title: `Undo: ${label}`, attrs: { 'aria-label': `Undo: ${label}` }, on: { click: () => undoAi(e) } });
    else if (e.cant) act = el('span', { class: 'ua-state ua-cant', text: 'can\'t undo', title: e.cant });
    else if (undone) act = C.canRedo(L, e) ? el('button', { type: 'button', class: 'ghost small ua-redo', text: '↷', title: `Redo: ${label}`, attrs: { 'aria-label': `Redo: ${label}` }, on: { click: () => redo(e) } }) : el('span', { class: 'ua-state', text: 'undone' });
    else act = el('button', { type: 'button', class: 'ghost small ua-undo', text: '↶', title: `Undo: ${label}`, attrs: { 'aria-label': `Undo: ${label}` }, on: { click: () => undo(e) } });
    return el('div', { class: `ac-row ua-row${undone ? ' ua-undone' : ''}${r.ai ? ' ua-ai' : ''}`, dataset: { id: e.id } },
      el('div', { class: 'ac-line' }, el('span', { class: 'ac-ic', text: r.ai ? ICON.ai : ICON[e.kind] || '•' }), el('span', { class: 'ac-t ua-t', text: label, title: e.cant || label }),
        el('span', { class: 'ua-ago', text: C.ago(e.at) }), act));
  }
  function paintPart() {
    if (!part?.isConnected) return;
    const rs = rows();
    const shown = all ? rs.slice(0, 40) : rs.slice(0, 6);
    const box = part.querySelector('.ua-list');
    const sig = JSON.stringify(shown.map((r) => [r.e.id, r.e.undone || 0, r.e.cant || '', C.canRedo(L, r.e), r.e.label || r.e.what, C.ago(r.e.at), r.e.outside?.at || 0]));
    if (box.dataset.sig !== sig) { box.dataset.sig = sig; box.replaceChildren(...shown.map(rowEl)); }
    part.hidden = !rs.length;
    const more = part.querySelector('.ua-more');
    more.hidden = rs.length <= 6;
    const t = all ? 'Show fewer' : `Show more (${Math.min(rs.length, 40)})`;
    if (more.textContent !== t) more.textContent = t;
    part.querySelector('.ua-lab').hidden = typeof Commands === 'undefined' || !Commands.get('history');
    const empty = part.parentElement?.querySelector('.ac-empty');
    if (empty && !part.hidden) empty.hidden = true;
  }
  function mountPart() { const p = partEl(); ready().then(() => paintPart()); queueMicrotask(paintPart); return p; }
  async function openPart() {
    if (typeof Activity === 'undefined' && window.Lazy) await Lazy.load('activity');
    if (typeof Activity === 'undefined') return null;
    const pop = Activity.open();
    if (part && !part.isConnected) pop.querySelector('.au-part, .ac-empty')?.before(partEl());
    await ready();
    paintPart();
    part?.scrollIntoView?.({ block: 'nearest' });
    return pop;
  }

  // ---------- as text ----------
  function summary(n = 12) {
    const L2 = rows().slice(0, n).map((r) => `- ${r.ai ? ICON.ai : ICON[r.e.kind] || '•'} ${r.ai ? aiLabel(r.e) : r.e.label} (${C.ago(r.e.at)}${r.e.undone ? ', undone' : r.e.cant ? ', can\'t be undone' : ''})`);
    return L2.length ? `**Recent changes** (${K}Z undoes the last one)\n${L2.join('\n')}` : 'No changes to undo yet.';
  }

  // ---------- start ----------
  function boot() {
    hookConfig();
    hookChats();
    ready();
    document.addEventListener('keydown', onKey); // bubbling: text boxes, the Lab and the board act first
    if (typeof Commands !== 'undefined') {
      Commands.onBefore?.((x) => { if (aiRunning(x)) aiCmd += 1; });
      Commands.onRun?.((x) => { if (aiCmd && x.source === 'code') aiCmd = Math.max(0, aiCmd - 1); });
      const say = (r) => (r.ok ? `${r.already ? 'Already undone' : 'Undid'}: ${r.label}` : r.none ? 'Nothing to undo.' : r.cancelled ? 'Kept.' : r.cant ? `Can't undo it: ${r.cant}` : r.error || 'Not undone.');
      if (!Commands.get('undo-change')) {
        Commands.register({
          name: 'undo-change', aliases: Commands.get('undo-last') ? [] : ['undo-last'], area: 'App', args: '[redo | list]',
          desc: `Undo the last change anywhere in Hearth (a setting, an AI's setup, a chat deleted / renamed / moved, memory tidy, a recipe deleted, an AI's change); redo; list: recent changes (also ${K}Z / Activity)`,
          keywords: 'undo revert take back last change setting settings switch ai setup chat deleted renamed moved redo recent changes',
          examples: ['/undo-change', '/undo-change redo', '/undo-change list'],
          complete: (a) => ['redo', 'list'].filter((x) => x.startsWith(String(a || '').toLowerCase())).map((value) => ({ value })),
          run: async (args, ctx) => {
            const w = String(args || '').trim().toLowerCase();
            if (w === 'list') { if (ctx?.source !== 'code') openPart(); await ready(); return summary(); }
            if (w === 'redo') { const r = await redo(null, { quietToast: true }); return r.ok ? `Redid: ${r.label}` : r.none ? 'Nothing to redo.' : r.error || r.cant || 'Not redone.'; }
            return say(await undo(null, { quietToast: true }));
          },
        });
      }
      if (!Commands.get('redo-change')) {
        Commands.register({ name: 'redo-change', area: 'App', desc: `Redo the change you just undid (${K}Shift+Z)`, keywords: 'redo again put back undo undone',
          run: async () => { const r = await redo(null, { quietToast: true }); return r.ok ? `Redid: ${r.label}` : r.none ? 'Nothing to redo.' : r.error || r.cant || 'Not redone.'; } });
      }
    }
    AppUI.addAction?.('Undo last change (a setting, an AI\'s setup, a chat…)', () => undo(), `${K}Z`);
    AppUI.addAction?.('Redo last change', () => redo(), `${K}Shift+Z`);
    AppUI.addAction?.('Recent changes: undo any of them', () => openPart());
    if (typeof Keys !== 'undefined') Keys.add([
      { area: 'Everywhere', keys: 'Ctrl+Z', what: 'undo the last change (a setting, an AI\'s setup, a chat…); in text boxes, the Lab and the board: their own undo', run: () => undo() },
      { area: 'Everywhere', keys: mac ? 'Ctrl+Shift+Z' : 'Ctrl+Shift+Z / Ctrl+Y', what: 'redo the change you just undid', run: () => redo() },
    ]);
  }
  boot();

  return {
    ready, undo, redo, viaSwitch, memoryTidied, keepFiles, deleted, stored, part: mountPart, paintPart, openPart, summary,
    list: () => L.list.slice(), onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    _test: { get L() { return L; }, ours, acting: () => { lastInput = performance.now(); }, rebase, KINDS, aiNewest },
  };
})();
window.UndoAll = UndoAll;
