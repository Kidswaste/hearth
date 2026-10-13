// One undo for what the AIs did (round 28, aiundo). The AIs change many things now (Lab scenes through the director's
// tools, the mood board through board tools, files through chat access, settings through the commands they run, and
// replies started by hooks or missions); this keeps ONE timeline of every change an AI made: who (which AI, which chat,
// which reply), what in plain words, when, with ↶ Undo this / Undo everything it did since… / Undo what that reply did.
//   · Where: Activity (◉, Ctrl/⌘+K "Changes by AIs") has a "Changes by AIs" part; a reply that changed something has a
//     small "↶ Undo what it did" in its actions. Chat: /ai-undo [last | reply | chat | list].
//   · No storage of its own for the changes: each entry points at that area's own undo, which does the work:
//       Lab → the time machine (tools/three-history.js: the version before, restored as a new version)
//       board → the items the call changed (before / after), put back through Board.edit (Ctrl+Z on the board undoes it)
//       files → chat access's log entry and the copy it kept (Access.undo; a new file goes to the Trash)
//       settings → the previous value (a command an AI ran, e.g. through three_run)
//       other → AiUndo.record({ …, undo: fn }) from any feature (kept until Hearth restarts)
//   · Safe order (aiundo-core.js): undoing a change also undoes the later changes to the same thing, newest first;
//     a warning (and a confirm) when the owner changed that thing after the AI did.
// Data: kv 'aiundo' (≤ 400 entries, 2 weeks). Nothing runs while idle; recording is a few comparisons per AI change.
const AiUndo = (() => {
  const C = AiUndoCore;
  const KV = 'aiundo';
  const LATE_MS = 6000; // a change recorded this soon after its reply ended still belongs to that reply
  const now = () => Date.now();
  const short = C.short;
  const agentOf = (id) => (typeof H !== 'undefined' ? H.agent(id) : null);
  const chatRow = (chatId) => (typeof H !== 'undefined' ? (H.chats || []).find((c) => c.id === chatId) : null);
  const agentOfChat = (chatId) => chatRow(chatId)?.agentId || (typeof Native !== 'undefined' ? Native.chatOf?.(String(chatId || '').replace(/-[^-]+$/, ''))?.agentId : null) || String(chatId || '').replace(/-[^-]+$/, '') || null;
  const nameOfAgent = (id, engine) => agentOf(id)?.name || (engine === 'codex' ? 'Astra' : engine === 'claude' ? 'Claude' : 'An AI');
  const ago = (t) => { const s = Math.round((now() - t) / 1000); return s < 50 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };

  // ---------- the timeline ----------
  let list = [];
  let loaded = null;
  const fns = new Map(); // entry id → { undo, check } (AiUndo.record from other features; gone after a restart)
  const ready = () => (loaded ||= (async () => { try { const d = await window.hub.kvGet(KV, null); if (Array.isArray(d?.list)) list = d.list.concat(list); } catch { /* none yet */ } C.prune(list); })());
  let saveT = 0;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { C.prune(list); window.hub.kvSet(KV, { v: 1, list }).catch?.(() => {}); }, 500); };
  const listeners = new Set();
  const changed = () => { save(); paintPart(); for (const fn of listeners) { try { fn(); } catch { /* never breaks */ } } };

  // ---------- replies: which one made each change ----------
  const turns = new Map(); // chat id → { id, agentId, chatId, at, asked, via } while the reply runs
  const ended = new Map(); // chat id → the reply that just ended (late changes still count for it)
  const vias = new Map(); // agent id | chat id → { text, until } (a hook fired / a mission started: the next reply came from it)
  function onSend(agentId, chat, text) {
    if (!chat?.id) return;
    const v = vias.get(chat.id) || vias.get(agentId);
    const via = v && v.until > now() ? v.text : null;
    turns.set(chat.id, { id: `t${now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, agentId, chatId: chat.id, at: now(), asked: short(text, 80), via });
    ended.delete(chat.id);
  }
  function onFinish(event, chat, extras) {
    const t = turns.get(chat?.id);
    if (!t) return;
    turns.delete(chat.id);
    t.end = now();
    ended.set(chat.id, t);
    const mine = list.filter((e) => e.turn === t.id);
    if (mine.length) extras.aiChanges = { turn: t.id };
    seal(mine);
  }
  function turnFor(chatId) {
    if (!chatId) return null;
    const t = turns.get(chatId);
    if (t) return t;
    const e = ended.get(chatId);
    return e && now() - e.end < LATE_MS ? e : null;
  }
  // a change that arrived just after its reply ended: the reply gets its "↶ Undo what it did" now
  function lateStamp(t) {
    if (!t?.end || typeof Native === 'undefined') return;
    Native.load(t.chatId).then((chat) => {
      if (!chat) return;
      const m = [...chat.messages].reverse().find((x) => x.aiChanges?.turn === t.id) || [...chat.messages].reverse().find((x) => x.role === 'assistant' && x.at >= t.at);
      if (!m || m.aiChanges?.turn === t.id) return;
      m.aiChanges = { turn: t.id };
      Native.save(chat);
      if (H.activeChat[chat.agentId] === chat.id) Native.refresh(chat.agentId, { keepScroll: true });
    }).catch(() => {});
  }

  // ---------- recording ----------
  // e: { area, chat?, by? (agent id), engine?, what, target?, tk, u, cant?, after? }
  function add(e) {
    const t = turnFor(e.chat);
    const by = e.by || t?.agentId || agentOfChat(e.chat);
    const a = agentOf(by);
    const x = C.add(list, { ...e, by, who: nameOfAgent(by, e.engine), engine: e.engine || a?.engine || null, turn: e.turn ?? t?.id ?? null, via: t?.via || null, chatTitle: short(chatRow(e.chat)?.title || '', 60) });
    if (t?.end) { lateStamp(t); seal([x]); }
    changed();
    return x;
  }
  // right after a reply: what each thing looks like now (the owner's later changes are compared with it)
  function seal(entries) {
    for (const e of entries) {
      if (e.area === 'file' && e.u?.path && !e.after) {
        window.hub.fs.stat(e.u.path).then((s) => { e.after = s ? { mtime: s.mtime, size: s.size } : { none: true }; save(); }).catch(() => {});
      }
    }
  }

  // Lab: the time machine's versions by Claude / Astra (tools/three-history.js 'hearth:tm')
  function onVersion(ev) {
    const { id, version } = ev.detail || {};
    if (!id || !version || typeof ThreeHistory === 'undefined') return;
    const doc = ThreeHistory._doc(id);
    const v = doc?.versions.find((x) => x.id === version);
    if (!v || (v.by !== 'claude' && v.by !== 'codex') || list.some((e) => e.area === 'lab' && e.u?.v === v.id)) return;
    const vs = TMCore.byTime(doc);
    const i = vs.findIndex((x) => x.id === v.id);
    const scene = window.ThreeLab?.scenes?.get?.(id);
    add({ area: 'lab', chat: v.chat || null, engine: v.by, what: short(v.label || 'Changed the scene', 80), target: scene?.name || 'a Lab scene', tk: `scene:${id}`, u: { scene: id, v: v.id, vat: v.at, before: vs[i - 1]?.id || null } });
  }

  // board: board-cmds.js / board-pack.js run the agents' board_ calls through here (what the call changed)
  const BOARD_READS = /^board_(list|vibe|look|watch|compare)$/;
  const BOARD_DO_READS = /^(collections|show|timeline|find|lab-look)$/;
  async function board(tool, a = {}, ctx = {}, fn) {
    if (!ctx?.chatId || BOARD_READS.test(tool) || (tool === 'board_do' && BOARD_DO_READS.test(String(a.op || ''))) || typeof Board === 'undefined') return fn(tool, a, ctx);
    const before = new Map();
    try {
      await Board.ready();
      const targets = [Board.current()];
      if (a.board) { const e = Board.findBoard(a.board); if (e) targets.push(await Board.load(e.id)); } else targets.push(await Board.boardFor(ctx.chatId));
      for (const b of targets) if (b?.id && !before.has(b.id)) before.set(b.id, { name: b.name, items: JSON.parse(JSON.stringify(b.items || [])) });
    } catch { /* recorded as far as it could */ }
    const r = await fn(tool, a, ctx);
    for (const [id, b0] of before) {
      const b = await Board.load(id).catch(() => null);
      const d = b && C.diffItems(b0.items, b.items);
      if (!d) continue;
      const kind = tool === 'board_add' ? `Added ${a.kind && a.kind !== 'url' ? `a ${a.kind}` : a.url ? 'a link' : 'a note'}${a.title ? ` “${short(a.title, 30)}”` : ''}`
        : tool === 'board_arrange' ? `Arranged ${d.chg.length} item${d.chg.length === 1 ? '' : 's'}${a.layout ? ` (${a.layout})` : ''}` : C.boardWords(d);
      add({ area: 'board', chat: ctx.chatId, what: kind, target: `board “${b.name || b0.name}”`, tk: `board:${id}`, u: { board: id, d } });
    }
    return r;
  }

  // files: chat access's log (access.js 'hearth:access-log'): writes that kept a copy, new files, deletes to the Trash
  function onAccessLog(ev) {
    const { chatId, entry: e } = ev.detail || {};
    if (!e || !chatId || chatId === 'app' || e.by === 'you' && e.action === 'undo') return;
    const base = String(e.target || '').split(/[\\/]/).pop();
    let what = null; let cant = null;
    if (e.action === 'write' && /^(allowed|approved|done)$/.test(e.result) && e.target) {
      what = e.created ? `Created ${base}` : `Edited ${base}`;
      if (!e.backup && !e.created) cant = 'no copy was kept (a big file, or a change its engine made by itself)';
    } else if (e.action === 'delete' && e.result === 'trashed' && e.target) {
      what = `Moved ${base} to the Trash`;
      if (!e.backup) cant = 'it is in the Trash: put it back from there';
    }
    if (!what || list.some((x) => x.area === 'file' && x.u?.entry === e.id)) return;
    add({ area: 'file', chat: chatId, what, target: e.target, tk: `file:${e.target}`, u: { chat: chatId, entry: e.id, path: e.target, created: Boolean(e.created), backup: e.backup || null }, ...(cant ? { cant } : {}) });
  }

  // settings: a command an AI ran (three_run → Commands with source 'code' while its reply runs): the old values
  const cfgSnap = () => JSON.parse(JSON.stringify({ settings: H.config.settings || {}, agents: (H.config.agents || []).map((a) => ({ ...a })) }));
  const snaps = new Map();
  function onBefore(x) {
    if (x.source !== 'code' || !x.agentId || typeof Native === 'undefined' || !Native.pendingFor(x.agentId)) return;
    snaps.set(x.agentId, { cfg: cfgSnap(), line: `/${x.def?.name || ''}${x.args ? ` ${x.args}` : ''}`.trim() });
  }
  function onRun(x) {
    const s = x.agentId && snaps.get(x.agentId);
    if (!s || x.source !== 'code') return;
    snaps.delete(x.agentId);
    const ch = C.diffConfig(s.cfg, cfgSnap());
    if (!ch.length) return;
    const label = (c) => (c.path[0] === 'settings' ? c.path[1] : `${agentOf(c.path[1])?.name || 'an AI'}'s ${c.path[2]}`);
    add({ area: 'setting', chat: Native.pendingFor(x.agentId) || H.activeChat?.[x.agentId] || null, by: x.agentId,
      what: `Ran ${short(s.line, 40)}: ${ch.slice(0, 3).map((c) => `${label(c)} ${C.valWords(c.old)} → ${C.valWords(c.now)}`).join(', ')}${ch.length > 3 ? ` (+${ch.length - 3})` : ''}`,
      target: 'Settings', tk: ch.map((c) => `setting:${c.path.join('.')}`), u: { ch } });
  }

  // other features: AiUndo.record({ agentId, chatId, what, target, key, undo: async () => …, check?: async () => warning })
  function record({ agentId = null, chatId = null, what, target = '', key = null, undo = null, check = null, area = 'other' } = {}) {
    const x = add({ area, chat: chatId, by: agentId || undefined, what: short(what, 90), target, tk: key || `other:${target || what}`, u: { live: true }, ...(undo ? {} : { cant: 'nothing to undo it with' }) });
    if (undo) fns.set(x.id, { undo, check });
    return x.id;
  }

  // ---------- each area's undo, its "the owner changed it after" check, and where to look ----------
  async function needLab() {
    if (typeof ThreeHistory === 'undefined' && window.Lazy) await Lazy.load('lab');
    if (!window.ThreeLab?.tm) {
      activate('tool:three');
      await window.ThreeLab?.cmd?.();
      const t0 = now(); while (!window.ThreeLab?.tm && now() - t0 < 15000) await new Promise((r) => setTimeout(r, 120));
    }
    if (typeof ThreeHistory === 'undefined' || !window.ThreeLab?.tm) throw new Error('The Lab isn\'t ready.');
  }
  const AREAS = {
    lab: {
      async undo(e) {
        await needLab();
        const vs = await ThreeHistory.list(e.u.scene);
        if (!ThreeLab.scenes.get(e.u.scene)) throw new Error(`The scene “${e.target}” is gone.`);
        const at = vs.find((v) => v.id === e.u.v)?.at ?? e.u.vat ?? e.at;
        const before = vs.find((v) => v.id === e.u.before) || vs.filter((v) => v.at < at).pop();
        if (!before) throw new Error('The time machine no longer has the version before this change.');
        await ThreeHistory.restore(before.id, { id: e.u.scene, label: `Undid ${e.who}'s change: ${short(e.what, 50)}` });
      },
      async check(e) {
        if (typeof ThreeHistory === 'undefined') return null;
        const vs = await ThreeHistory.list(e.u.scene).catch(() => []);
        const at = vs.find((v) => v.id === e.u.v)?.at ?? e.u.vat ?? e.at;
        const mine = vs.filter((v) => v.at > at && v.by === 'you' && !/^Undid /.test(v.label || '') && v.kind !== 'turn');
        return mine.length ? `You changed the scene “${e.target}” after (${mine.length} change${mine.length === 1 ? '' : 's'}): going back takes ${mine.length === 1 ? 'it' : 'them'} back too (still in the time machine).` : null;
      },
      async show(e) { activate('tool:three'); if (window.ThreeLab?.scenes?.get?.(e.u.scene) && ThreeLab.scenes.currentId() !== e.u.scene) ThreeLab.scenes.open(e.u.scene); },
    },
    board: {
      async undo(e) {
        if (typeof Board === 'undefined' && window.Lazy) await Lazy.load('board');
        await Board.ready();
        const b = await Board.load(e.u.board);
        if (!b) throw new Error('That board is gone.');
        Board.edit(`undo ${e.who}'s change`, (bb) => { C.revertItems(bb.items, e.u.d); }, { b, force: true });
      },
      async check(e) {
        if (typeof Board === 'undefined') return null;
        const b = await Board.load(e.u.board).catch(() => null);
        const n = b ? C.touchedItems(b.items, e.u.d) : 0;
        return n ? `You changed ${n} of the items on ${e.target} after: they go back to before ${e.who}'s change.` : null;
      },
      async show(e) { activate('tool:board'); if (typeof Board !== 'undefined' && Board.current()?.id !== e.u.board) await Board.open(e.u.board); },
    },
    file: {
      async undo(e) { if (typeof Access === 'undefined') throw new Error('Chat access isn\'t loaded.'); await Access.undo(e.u.chat, e.u.entry); },
      async check(e) {
        const s = await window.hub.fs.stat(e.u.path).catch(() => null);
        const base = String(e.u.path).split(/[\\/]/).pop();
        if (/^Moved/.test(e.what)) return s ? `There's a ${base} there again: it is replaced (a copy is kept).` : null;
        if (!e.after || e.after.none) return null;
        if (!s) return `${base} is gone now (moved or deleted after).`;
        return s.mtime > e.after.mtime + 1500 || s.size !== e.after.size ? `${base} changed after ${e.who} wrote it (you or another app): that change goes too (a copy is kept).` : null;
      },
      async show(e) { const s = await window.hub.fs.stat(e.u.path).catch(() => null); if (s) window.hub.fs.reveal(e.u.path); else toast('That file isn\'t there now.', { timeout: 2000 }); },
    },
    setting: {
      async undo(e) {
        for (const c of e.u.ch) C.setPath(H.config, c.path, c.old);
        await saveConfig();
      },
      async check(e) {
        const n = e.u.ch.filter((c) => JSON.stringify(C.getPath(H.config, c.path)) !== JSON.stringify(c.now)).length;
        return n ? `${n === 1 ? 'That setting was' : `${n} of these settings were`} changed again after: ${n === 1 ? 'it goes' : 'they go'} back to before ${e.who}'s change.` : null;
      },
      async show() { AppUI.openSettings?.(); },
    },
    other: {
      async undo(e) { const f = fns.get(e.id); if (!f?.undo) throw new Error('This one can\'t be undone after a restart.'); await f.undo(); },
      async check(e) { const f = fns.get(e.id); return f?.check ? f.check() : null; },
    },
  };

  // ---------- undoing ----------
  // picked: entries → { ok, done: n, error?, warnings, plan } · confirm: ask the owner (the default) · force: no ask
  let busyUndo = false;
  async function run(picked, { confirm = true, force = false, title = null } = {}) {
    await ready();
    const p = C.plan(list, picked);
    if (!p.entries.length) return { ok: false, done: 0, error: 'Nothing left to undo there.', warnings: [], plan: p };
    const running = [...new Set(p.entries.map((e) => e.chat).filter((c) => c && typeof Native !== 'undefined' && Native.isBusy(c)))];
    if (running.length) return { ok: false, done: 0, error: `${p.entries.find((e) => running.includes(e.chat)).who} is still working there: stop the reply or wait for it first.`, warnings: [], plan: p };
    const warnings = [];
    for (const e of p.newest) { try { const w = await AREAS[e.area]?.check?.(e); if (w) warnings.push(w); } catch { /* checked as far as it could */ } }
    if (!force) {
      if (!confirm) { if (warnings.length) return { ok: false, done: 0, warnings, plan: p, error: 'Changed after: confirm first.' }; } else if (!(await ask(p, warnings, title))) return { ok: false, done: 0, cancelled: true, warnings, plan: p };
    }
    if (busyUndo) return { ok: false, done: 0, error: 'An undo is already running.', warnings, plan: p };
    busyUndo = true;
    let done = 0; let error = null;
    const turnsHit = new Set();
    try {
      for (const s of p.steps) {
        try { await AREAS[s.e.area].undo(s.e); } catch (err) { error = `${s.e.who}: ${short(C.line(s.e), 60)}: ${err.message}`; s.e.failed = err.message; break; }
        for (const id of s.covers) { const e = list.find((x) => x.id === id); if (e && !e.undone) { e.undone = now(); delete e.failed; done += 1; if (e.turn) turnsHit.add(e.turn); } }
      }
    } finally { busyUndo = false; }
    changed();
    restamp(turnsHit);
    const who = [...new Set(p.entries.map((e) => e.who))].join(' and ');
    if (error) toast(`Undid ${done} of ${p.entries.length}; stopped at ${error}`, { type: 'error', timeout: 6000 });
    else toast(`↶ Undid ${done} change${done === 1 ? '' : 's'} by ${who}`, { timeout: 2600 });
    return { ok: !error, done, error, warnings, plan: p, skipped: p.skipped.length };
  }
  // the replies whose changes were all undone show it
  function restamp(turnIds) {
    if (!turnIds.size || typeof Native === 'undefined') return;
    for (const a of H.agents?.() || []) { const c = Native.chatOf(a.id); if (c?.messages?.some((m) => turnIds.has(m.aiChanges?.turn))) Native.refresh(a.id, { keepScroll: true }); }
  }
  function ask(p, warnings, title) {
    return new Promise((resolve) => {
      const n = p.entries.length;
      const d = el('dialog', { class: 'ui-modal au-ask' });
      const body = el('form', { method: 'dialog' },
        el('h2', { text: title || `Undo ${n} change${n === 1 ? '' : 's'}?` }),
        el('ul', { class: 'au-list' }, C.describe(p).map((t) => el('li', { text: t }))),
        p.extra.length ? el('p', { class: 'au-note', text: `${p.extra.length} later change${p.extra.length === 1 ? '' : 's'} to the same thing${p.extra.length === 1 ? '' : 's'} go${p.extra.length === 1 ? 'es' : ''} too, so nothing is left half done (newest first).` }) : null,
        p.skipped.length ? el('p', { class: 'au-note', text: `${p.skipped.length} can't be undone here (${p.skipped[0].cant}).` }) : null,
        ...warnings.map((w) => el('p', { class: 'au-warn', text: `⚠ ${w}` })),
        el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }),
          el('button', { type: 'button', text: 'Cancel', on: { click: () => { d.close(); resolve(false); } } }),
          el('button', { type: 'submit', class: warnings.length ? 'primary danger-fill' : 'primary', text: warnings.length ? '↶ Undo anyway' : '↶ Undo' })));
      body.addEventListener('submit', (e) => { e.preventDefault(); d.close(); resolve(true); });
      d.addEventListener('close', () => { setTimeout(() => d.remove(), 0); resolve(false); });
      d.append(body);
      document.body.append(d);
      d.showModal();
    });
  }
  const byId = (id) => list.find((e) => e.id === id);
  const undoThis = (id, o) => run(C.pickThis(list, id), o);
  const undoSince = (id, o) => { const e = byId(id); return run(C.pickSince(list, id), { title: e ? `Undo everything ${e.who} did since ${new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}?` : null, ...o }); };
  const undoReply = (turn, o) => run(C.pickReply(list, turn), { title: 'Undo what this reply did?', ...o });
  const undoChat = (chatId, o) => run(C.pickChat(list, chatId), { title: 'Undo what the AIs did in this chat?', ...o });
  const forReply = (turn) => list.filter((e) => e.turn === turn);

  // ---------- on replies: "↶ Undo what it did" ----------
  function onMessage(node, m) {
    if (m?.role !== 'assistant' || !m.aiChanges?.turn) return;
    const foot = node.querySelector(':scope > .msg-foot');
    if (!foot || foot.querySelector('.au-reply')) return;
    const mine = forReply(m.aiChanges.turn);
    const left = mine.filter((e) => !e.undone);
    if (loaded && !mine.length) return; // older than two weeks
    const b = left.length || !loaded
      ? el('button', { type: 'button', class: 'msg-act au-reply', text: '↶ Undo what it did', title: `What this reply changed (newest first), all undone in one step:\n${left.slice().reverse().slice(0, 8).map((e) => `· ${C.line(e)}`).join('\n')}`, on: { click: (ev) => { ev.stopPropagation(); undoReply(m.aiChanges.turn).catch((err) => toast(err.message, { type: 'error' })); } } })
      : el('span', { class: 'au-reply au-done', text: '↶ undone', title: 'What this reply changed was undone' });
    foot.querySelector('.msg-more') ? foot.querySelector('.msg-more').before(b) : foot.append(b);
  }

  // ---------- Activity's "Changes by AIs" part ----------
  let part = null;
  const SHOWN = 6;
  function partEl() {
    if (part) return part;
    part = el('section', { class: 'ac-sec au-part', hidden: true },
      el('h4', {}, 'Changes by AIs'),
      el('div', { class: 'ac-list au-rows' }),
      el('button', { type: 'button', class: 'ghost small ac-more au-more', hidden: true, on: { click: () => { part.all = !part.all; paintPart(); } } }));
    part.all = false;
    return part;
  }
  function entryMenu(e) {
    const others = list.filter((x) => x.by === e.by && !x.undone && !C.isNewer(e, x)).length;
    const reply = e.turn ? list.filter((x) => x.turn === e.turn && !x.undone).length : 0;
    return [
      !e.undone && !e.cant ? { label: '↶ Undo this', action: () => undoThis(e.id) } : null,
      !e.undone && others > 1 ? { label: `↶ Undo everything ${e.who} did since then (${others})`, action: () => undoSince(e.id) } : null,
      !e.undone && reply > 1 ? { label: `↶ Undo what that reply did (${reply})`, action: () => undoReply(e.turn) } : null,
      AREAS[e.area]?.show ? { label: 'Show it', action: () => { window.Activity?.close?.(); AREAS[e.area].show(e); } } : null,
      e.chat ? { label: 'Open the chat', action: () => window.Activity?.go?.({ chat: [e.by, e.chat] }) } : null,
    ].filter(Boolean);
  }
  function row(e) {
    const a = agentOf(e.by);
    const sub = `${e.chatTitle ? `in “${e.chatTitle}” · ` : ''}${e.via ? `${e.via} · ` : ''}${ago(e.at)}${e.undone ? ' · undone' : e.cant ? ' · can\'t be undone here' : ''}`;
    const menu = (ev) => { ev.preventDefault(); ev.stopPropagation(); showMenu(ev.clientX, ev.clientY, entryMenu(e)); };
    const r = el('div', { class: `ac-row au-row${e.undone ? ' au-undone' : ''}`, title: `${e.who}: ${C.line(e)}\n${new Date(e.at).toLocaleString()}\nRight-click: undo since then, the whole reply, show it`, on: { contextmenu: menu } },
      el('div', { class: 'ac-line' },
        el('span', { class: 'ac-av', text: a?.icon || e.who?.[0] || '•', style: { background: a?.color || 'var(--accent)' } }),
        el('span', { class: 'ac-ic', text: C.ICON[e.area] || '•' }),
        el('span', { class: 'ac-t ac-wrap', text: `${e.who}: ${C.line(e)}` }),
        !e.undone && !e.cant ? el('button', { type: 'button', class: 'ghost small ac-b au-u', text: '↶', title: 'Undo this (and any later change to the same thing)', on: { click: (ev) => { ev.stopPropagation(); undoThis(e.id).catch((err) => toast(err.message, { type: 'error' })); } } }) : null,
        el('button', { type: 'button', class: 'ghost small ac-b', text: '⋯', title: 'Undo everything it did since then, the whole reply, show it', on: { click: (ev) => { const rr = ev.currentTarget.getBoundingClientRect(); ev.stopPropagation(); showMenu(rr.left, rr.bottom + 2, entryMenu(e)); } } })),
      el('div', { class: 'ac-sub', text: sub }));
    return r;
  }
  function paintPart() {
    if (!part?.isConnected) return;
    const day = list.slice().sort(C.newestFirst);
    const shown = part.all ? day.slice(0, 60) : day.slice(0, SHOWN);
    const box = part.querySelector('.au-rows');
    const sig = JSON.stringify(shown.map((e) => [e.id, e.undone ? 1 : 0, Math.round((now() - e.at) / 60000)]));
    if (box.dataset.sig !== sig) { box.dataset.sig = sig; box.replaceChildren(...shown.map(row)); }
    part.hidden = !shown.length;
    if (shown.length) { const q = part.parentElement?.querySelector(':scope > .ac-empty'); if (q && !q.hidden) q.hidden = true; }
    const more = part.querySelector('.au-more');
    more.hidden = day.length <= SHOWN;
    const t = part.all ? 'Show fewer' : `Show more (${Math.min(day.length, 60)})`;
    if (more.textContent !== t) more.textContent = t;
  }
  // Activity mounts it (activity.js open)
  function mountPart() { const p = partEl(); ready().then(() => paintPart()); queueMicrotask(paintPart); return p; }
  async function openPart() {
    if (typeof Activity === 'undefined' && window.Lazy) await Lazy.load('activity');
    const pop = Activity.open();
    await ready();
    paintPart();
    part?.scrollIntoView?.({ block: 'nearest' });
    return pop;
  }

  // ---------- as text ----------
  function summary(chatId = null, n = 12) {
    const L = list.filter((e) => !chatId || e.chat === chatId).sort(C.newestFirst).slice(0, n)
      .map((e) => `- ${C.ICON[e.area]} ${e.who}: ${C.line(e)} (${ago(e.at)}${e.undone ? ', undone' : ''})`);
    return L.length ? `**Changes by AIs**${chatId ? ' in this chat' : ''}\n${L.join('\n')}` : `No changes by AIs${chatId ? ' in this chat' : ''} yet.`;
  }

  // ---------- start ----------
  function boot() {
    ready();
    if (typeof Native !== 'undefined' && Native.hooks) {
      Native.hooks.send.push(onSend);
      Native.hooks.finish.push(onFinish);
      Native.hooks.message.push(onMessage);
    }
    addEventListener('hearth:tm', onVersion);
    document.addEventListener('hearth:access-log', onAccessLog);
    document.addEventListener('hearth:hook-fired', (ev) => { const d = ev.detail || {}; if (d.agentId) vias.set(d.agentId, { text: `⚡ ${short(d.when || 'a hook', 40)}`, until: now() + 15000 }); });
    document.addEventListener('hearth:mission', (ev) => {
      const d = ev.detail || {};
      if (d.phase !== 'start') return;
      const mi = window.Missions?.LIST?.find((x) => x.id === d.kind);
      const v = { text: `${mi?.icon || '◎'} ${mi?.label || 'mission'}`, until: now() + 15000 };
      if (d.chatId) vias.set(d.chatId, v); else if (d.agentId) vias.set(d.agentId, v);
    });
    if (typeof Commands !== 'undefined') {
      Commands.onBefore?.(onBefore);
      Commands.onRun?.(onRun);
      if (!Commands.get('ai-undo')) {
        Commands.register({
          name: 'ai-undo', area: 'Chat', args: '[last | reply | chat | list]', aliases: Commands.get('undo-ai') ? [] : ['undo-ai'],
          desc: 'Undo what the AIs changed (Lab scenes, the board, files, settings): the last change, its last reply, everything in this chat; list: the timeline',
          keywords: 'undo revert ai changes claude astra director board files settings timeline activity what did it do',
          complete: () => [{ value: 'last', hint: 'its last change in this chat' }, { value: 'reply', hint: 'what its last reply did' }, { value: 'chat', hint: 'everything AIs did in this chat' }, { value: 'list', hint: 'the timeline' }],
          run: async (args, ctx) => {
            await ready();
            const w = String(args || '').trim().toLowerCase() || 'list';
            const chatId = ctx?.agentId ? H.activeChat?.[ctx.agentId] : null;
            const here = list.filter((e) => !e.undone && (!chatId || e.chat === chatId)).sort(C.newestFirst);
            if (w === 'list' || w === 'text') { if (ctx?.source !== 'code' && w !== 'text') openPart(); return summary(chatId); }
            if (!here.length) return `No AI changes to undo${chatId ? ' in this chat' : ''}.`;
            const r = w === 'last' ? await undoThis(here[0].id) : w === 'reply' ? await undoReply(here.find((e) => e.turn)?.turn) : w === 'chat' ? await (chatId ? undoChat(chatId) : run(here)) : null;
            if (!r) return 'Use: /ai-undo [last | reply | chat | list]';
            return r.ok ? `↶ Undid ${r.done} change${r.done === 1 ? '' : 's'}.` : r.cancelled ? 'Kept.' : r.error;
          },
        });
      }
    }
    AppUI.addAction?.('Changes by AIs: undo what an AI did', () => openPart());
  }
  boot();

  return { ready, record, board, run, undoThis, undoSince, undoReply, undoChat, forReply, summary, part: mountPart, paintPart, openPart, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    list: () => list.slice(), _test: { turns, ended, AREAS, add } };
})();
window.AiUndo = AiUndo;
