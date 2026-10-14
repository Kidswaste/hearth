// Hearth never loses work (round 29, safetynet). Two halves:
//   keeping   a moment after you type, drag or send (one timer: 250 ms after the last change, at least every 2 s
//             during a long burst, at once when the window hides or the page goes away), what isn't on the disk yet
//             by design goes to a small journal (safetynetmain.js writes it safely): the Lab scene on screen (its
//             code, layers, keyframes and the slider moves you haven't saved), each chat box's draft and queued
//             messages, the board items you just changed, and a text box you're typing in that saves only when you
//             leave it (AI setup's personality, an instruction, a dialog). Nothing runs while you do nothing; an
//             unchanged journal isn't sent again.
//   restoring after an unexpected exit (a crash, a forced quit, power loss; the page crashing: it reloads by itself),
//             one calm card: "Hearth closed unexpectedly — here's what was restored", each line with its Open:
//             Lab work as a version in the time machine (the scene itself stays as saved), a draft back in its chat
//             box (never over newer text; queued messages come back in the box, not sent), board edits put back, a
//             text box's words as a note. Nothing comes back over newer data (safetynet-core.js decides).
// The card again: Ctrl/⌘+K → "What came back after Hearth closed unexpectedly", or /restored.
const SafetyNet = (() => {
  const C = SafetyNetCore;
  const LAST = 'safetynet.last';
  const MS = 250; const MAX = 2000;
  const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

  // ---------- keeping ----------
  let t = 0; let first = 0; let lastSig = ''; let journal = C.empty();
  const fields = new Map(); // key → { el, where, text, at }
  const fieldKeys = new WeakMap(); let fieldSeq = 0;
  const boardsTouched = new Set();
  let labEntry = null; let labSig = '';
  function soon() {
    const now = Date.now();
    if (!first) first = now;
    clearTimeout(t);
    // (round 38, inputlatency) kept in an idle moment (≤ 1 s later): reading every draft and the Lab scene's state, then
    // fingerprinting them, ran in a timer that could land between two moves of a slider or two keys of a long draft
    t = setTimeout(() => { if (typeof requestIdleCallback !== 'function') { keepNow(); return; } requestIdleCallback(() => { if (t) keepNow(); }, { timeout: 1000 }); }, Math.max(0, Math.min(MS, first + MAX - now)));
  }

  function labNow() {
    try {
      if (typeof ThreeLab === 'undefined' || !ThreeLab.peek?.() || !ThreeLab.tm) return labEntry;
      if (window.ThreeHistory?.scrubbing) return labEntry; // a version shown while scrubbing isn't your work
      const id = ThreeLab.scenes?.currentId?.();
      if (!id) return labEntry;
      const state = ThreeLab.tm.state(id);
      if (!state) return labEntry;
      const s = C.sig(state);
      if (labEntry?.id === id && s === labSig) return labEntry; // unchanged: keeps the time of its last change
      labSig = s;
      labEntry = { k: 'lab', id, name: ThreeLab.scenes.get?.(id)?.name || 'Lab scene', at: Date.now(), state };
      return labEntry;
    } catch (err) { console.warn('safetynet: lab', err); return labEntry; }
  }
  function draftsNow(out) {
    if (typeof Native === 'undefined' || typeof H === 'undefined') return;
    for (const a of H.agents?.() || []) {
      if (a.mode !== 'native' || !Native.hasView?.(a.id)) continue;
      const v = Native.view(a.id);
      const text = v?.input?.value || ''; const queue = (v?.queue || []).filter((q) => typeof q === 'string');
      if (!text.trim() && !queue.length) continue;
      const chatId = H.activeChat?.[a.id] || null;
      out[`draft:${a.id}`] = { k: 'draft', agentId: a.id, chatId, title: (H.chats || []).find((c) => c.id === chatId)?.title || '', text, queue, at: Date.now() };
    }
  }
  const boardCache = new Map(); // id → { updated, entry }
  function boardsNow(out) {
    if (!boardsTouched.size || typeof Board === 'undefined') return;
    for (const id of boardsTouched) {
      const b = Board._?.S?.boards?.get(id);
      if (!b) continue;
      let c = boardCache.get(id);
      if (!c || c.updated !== b.updated) { c = { updated: b.updated, entry: { k: 'board', id, name: b.name, updated: b.updated, items: (b.items || []).map(C.stripItem) } }; boardCache.set(id, c); }
      out[`board:${id}`] = c.entry;
    }
  }
  function keepNow() {
    clearTimeout(t); t = 0; first = 0;
    const entries = {};
    const lab = labNow();
    if (lab) entries[`lab:${lab.id}`] = lab;
    draftsNow(entries);
    boardsNow(entries);
    for (const [key, f] of fields) {
      if (!f.el.isConnected) { fields.delete(key); continue; } // a dialog closed without saving: you let it go
      if (f.text.trim()) entries[`field:${key}`] = { k: 'field', where: f.where, text: f.text, at: f.at };
    }
    const s = C.sig(entries);
    if (s === lastSig) return Promise.resolve(false);
    lastSig = s;
    journal = { v: C.V, at: Date.now(), entries };
    return Promise.resolve(window.hub.safetynet?.keep?.(journal)).catch((err) => { lastSig = ''; console.warn('safetynet: keep', err); return false; });
  }

  // text boxes that save only when you leave them (a change event): what you type until then
  const SKIP = '.composer, .code-editor, .notes-text, [data-no-keep]';
  function whereOf(el) {
    const sec = el.closest('section, fieldset, .opt-sec');
    const head = sec?.querySelector('h1, h2, h3, h4, legend, .opt-h') || el.closest('.modal, [role="dialog"], dialog')?.querySelector('h1, h2, h3, .modal-title, header');
    const label = el.getAttribute('aria-label') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent) || el.placeholder || '';
    const where = [head?.textContent, label].map((x) => clip(x, 40)).filter(Boolean);
    return where.length ? [...new Set(where)].join(' · ') : 'a text box';
  }
  function onInput(e) {
    const el = e.target;
    if (el instanceof HTMLTextAreaElement && !el.readOnly && !el.disabled && !el.closest(SKIP)) {
      let key = fieldKeys.get(el);
      if (!key) { key = `f${++fieldSeq}`; fieldKeys.set(el, key); }
      if (el.value.trim().length >= 3) fields.set(key, { el, where: fields.get(key)?.where || whereOf(el), text: el.value, at: Date.now() }); else fields.delete(key);
    }
    soon();
  }
  function onChange(e) {
    const key = e.target instanceof HTMLTextAreaElement && fieldKeys.get(e.target);
    if (key && fields.delete(key)) soon();
  }
  document.addEventListener('input', onInput, true);
  document.addEventListener('change', onChange, true);
  document.addEventListener('submit', soon, true); // a message sent: its draft is gone from the journal
  document.addEventListener('pointerup', soon, true); // a slider, a knob, a drag on the board
  addEventListener('hearth:sketch', soon); // another scene on screen
  document.addEventListener('visibilitychange', () => { if (document.hidden && t) keepNow(); });
  addEventListener('pagehide', () => { if (t) keepNow(); });
  const boardHook = () => { try { Board.onChange((what) => { if (what !== 'save' || !Board.current()) return; boardsTouched.add(Board.current().id); soon(); }); } catch { /* the board is optional */ } };
  if (window.Lazy) window.Lazy.when('board', boardHook); else if (typeof Board !== 'undefined') boardHook();

  // ---------- restoring ----------
  const word = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const needGroup = async (g) => { if (window.Lazy && !window.Lazy.loaded(g)) await window.Lazy.load(g); };
  const when = (at) => (at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

  async function restoreLab(e) {
    const all = await window.hub.kvGet('three-sketches', []);
    const saved = (Array.isArray(all) ? all : []).find((s) => s.id === e.id) || null;
    const p = C.labPlan(e, saved);
    if (p.action !== 'version') return null;
    await needGroup('lab');
    if (!window.ThreeHistory?.keepVersion) return null;
    const words = C.labWords(p.what);
    const v = await ThreeHistory.keepVersion(e.id, e.state, { label: `Recovered after Hearth closed unexpectedly: your ${words} (${when(e.at)})` });
    if (!v) return null;
    return { k: 'lab', icon: '◭', label: `${clip(saved.name || e.name, 28)}: your unsaved ${words}`, hint: 'as a version · Open', open: { k: 'lab', id: e.id, vid: v.id } };
  }
  async function restoreDraft(e) {
    if (typeof Native === 'undefined' || !H.agent?.(e.agentId)) return null;
    const key = `draft.${e.agentId}.${e.chatId || 'new'}`;
    const stored = store.get(key, '') || '';
    let sent = [];
    if (e.chatId) { const chat = await Native.load(e.chatId).catch(() => null); sent = (chat?.messages || []).filter((m) => m.role === 'user').slice(-8).map((m) => m.text || ''); }
    const p = C.draftPlan(e, stored, sent);
    if (p.came === 'none') return null;
    if (p.text != null) {
      store.set(key, p.text);
      const v = Native.view(e.agentId);
      if (v?.input && (H.activeChat?.[e.agentId] || null) === (e.chatId || null) && (!v.input.value || p.text.startsWith(v.input.value))) {
        v.input.value = p.text;
        v.input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    const title = clip(e.title || (H.chats || []).find((c) => c.id === e.chatId)?.title || H.agent(e.agentId)?.name || 'a chat', 40);
    const label = p.queued ? `${word(p.queued, 'queued message')} back in the box of “${title}” (not sent)` : p.came === 'kept' ? `Your draft in “${title}” is still there` : `Your draft in “${title}” came back`;
    return { k: 'draft', icon: '💬', label, hint: 'Open', open: { k: 'draft', agentId: e.agentId, chatId: e.chatId } };
  }
  async function restoreBoard(e) {
    await needGroup('board');
    if (typeof Board === 'undefined') return null;
    await Board.ready();
    const b = await Board.load(e.id);
    const p = C.boardPlan(e, b);
    if (p.action !== 'merge') return null;
    b.items = p.items;
    await Board.save(b, { now: true });
    if (Board.current()?.id === b.id && Board.isMounted?.()) { try { Board._.renderAll(); } catch { /* drawn next time */ } }
    const n = p.changed + p.added;
    return { k: 'board', icon: '▦', label: `Board “${clip(b.name || e.name, 36)}”: ${word(n, 'edit')} put back`, hint: 'Open', open: { k: 'board', id: e.id } };
  }
  async function restoreField(e) {
    if (typeof Notes === 'undefined') return null;
    const p = C.fieldPlan(e, await Notes.list().catch(() => []));
    if (!p) return null;
    const n = await Notes.create({ title: p.title, text: p.text });
    return { k: 'field', icon: '✎', label: `What you typed in “${clip(e.where, 32)}”`, hint: 'as a note · Open', open: { k: 'note', id: n.id } };
  }
  const RESTORE = { lab: restoreLab, draft: restoreDraft, board: restoreBoard, field: restoreField };

  async function open(o) {
    if (!o) return;
    if (o.k === 'lab') {
      activate('tool:three');
      await ThreeLab.cmd();
      if (ThreeLab.scenes?.currentId?.() !== o.id) { ThreeLab.scenes?.open?.(o.id); await new Promise((r) => setTimeout(r, 500)); }
      if (window.ThreeHistoryUI) {
        await ThreeHistoryUI.open();
        const i = ThreeHistoryUI.versions.findIndex((v) => v.id === o.vid);
        if (i >= 0) await ThreeHistoryUI.select(i);
      }
    } else if (o.k === 'draft') {
      activate(o.agentId);
      if (o.chatId) await Native.open(o.agentId, o.chatId);
      Native.focus(o.agentId);
    } else if (o.k === 'board') {
      await needGroup('board');
      activate('tool:board');
      await Board.open(o.id);
    } else if (o.k === 'note') {
      await Notes.show(o.id);
    }
  }
  const rowsOf = (items) => items.map((it) => ({ id: `sn-${it.k}`, icon: it.icon, label: it.label, hint: it.hint, run: () => open(it.open) }));
  function showCard(report) {
    if (!report?.items?.length) return null;
    const rows = rowsOf(report.items);
    if (typeof SpeedResume !== 'undefined') { const c = SpeedResume.show(rows, { title: C.TITLE, timeout: 0 }); c?.classList.add('safetynet-card'); return c; }
    for (const r of rows) toast(r.label, { action: { label: 'Open', fn: r.run }, timeout: 12000 });
    return null;
  }

  let recovering = null;
  async function recover() {
    const st = await window.hub.safetynet?.status?.().catch(() => null);
    if (!st?.unclean) return null;
    const items = [];
    for (const e of C.entries(st.journal)) {
      try { const it = await RESTORE[e.k]?.(e); if (it) items.push(it); } catch (err) { console.warn('safetynet: restore', e.k, err); }
    }
    const report = { at: Date.now(), kind: st.unclean.kind, when: st.unclean.at || null, items };
    try { store.set(LAST, report); } catch { /* the card still shows */ }
    await window.hub.safetynet.done().catch(() => {});
    if (items.length) showCard(report); else toast(C.NOTHING, { timeout: 4000 });
    dispatchEvent(new CustomEvent('hearth:safetynet', { detail: report }));
    return report;
  }
  function boot() {
    // after the first screen has settled (the chats list, the last chat's box): one look, once
    recovering = new Promise((r) => setTimeout(r, 600)).then(recover).catch((err) => { console.warn('safetynet', err); return null; });
    if (typeof Commands !== 'undefined' && !Commands.get('restored')) {
      Commands.register({
        name: 'restored', area: 'App', aliases: ['crash-restore'],
        desc: 'What came back the last time Hearth closed unexpectedly (the card again, with its Open buttons)',
        keywords: 'crash restore recovered lost work unsaved closed unexpectedly safety net draft',
        run: async () => { const r = store.get(LAST, null); if (!r?.items?.length) return 'Nothing had to be restored: Hearth hasn\'t closed unexpectedly lately (or nothing was lost).'; showCard(r); return null; },
      });
    }
    if (typeof AppUI !== 'undefined') AppUI.addAction?.('What came back after Hearth closed unexpectedly', () => { const r = store.get(LAST, null); if (!showCard(r)) toast('Nothing had to be restored lately.', { timeout: 2400 }); });
  }
  boot();

  return {
    keepNow, soon, open, showCard, last: () => store.get(LAST, null),
    get journal() { return journal; }, get recovering() { return recovering; },
  };
})();
window.SafetyNet = SafetyNet;
