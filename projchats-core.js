// (round 116, projchats116) Every chat belongs to exactly one project; a project holds many chats (with any AI).
// The pure part (no DOM; loads in Node for dev/projchats116-test.js). projchats.js is the window's side.
//   sweep(data, chats, o) → report   the migration and its keeper, on a normalized projects store (kv 'projects'):
//     · a chat in several projects stays in ONE (keeper below); it is taken out of the others' lists only, and each of
//       those projects keeps a record of the link it had (p.chatsMovedOut: [{ id: chatId, to, item, at }])
//     · a chat in no project goes into “Earlier chats”, a project with a FIXED id, name, look and times: two computers
//       migrating at the same moment make the same project (sync merges its items), never two
//     · nothing is deleted: not a chat, not a project; undo(data) puts every recorded link back
//   move(data, chatId, toId) → a chat moved: out of every other project, into this one (recorded the same way)
//   targetFor({ pending, scope, sceneProject, earlier }) → where a new chat goes
// Deterministic: the keeper only reads what is the same on both computers (the synced projects store), never a time
// this computer alone knows.
const ProjChatsCore = (() => {
  const PC = typeof ProjectsCore !== 'undefined' ? ProjectsCore : require('./projects-core.js');
  const EARLIER_ID = 'pj-earlier-chats';
  const EARLIER_NAME = 'Earlier chats';
  const EARLIER_AT = Date.UTC(2026, 10, 1); // fixed: the same project, byte for byte, on both computers
  const EARLIER_NOTES = 'Chats from before every chat belonged to a project. Rename this project, or move a chat out of it: right-click the chat › Move to project…';
  const RECORD_KEEP = 500;
  const isEarlier = (p) => p?.id === EARLIER_ID;
  // the project a chat was made for: its own conversation (a project's workspace chat, or an id made for it)
  const owns = (p, chatId) => p?.workspace?.chatId === chatId || String(chatId).endsWith(`-project-${p?.id}`);
  const itemOf = (p, chatId) => (p?.items || []).find((x) => x && x.type === 'chat' && x.ref === chatId) || null;
  // which of several projects a chat stays in: the one it was most recently used in, as far as both computers know
  // (the project whose own chat it is), then a real project before “Earlier chats”, a live one before an archived one,
  // then the first it joined (its item's time), then the id (so a tie ends the same everywhere)
  function keeper(chatId, ps) {
    const at = (p) => Number(itemOf(p, chatId)?.at) || 0;
    return ps.slice().sort((a, b) => (owns(b, chatId) - owns(a, chatId)) || (isEarlier(a) - isEarlier(b))
      || ((a.status === 'archived') - (b.status === 'archived')) || (at(a) - at(b)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0] || null;
  }
  function earlierProject() {
    const p = PC.create({ id: EARLIER_ID, name: EARLIER_NAME, ident: PC.MC.identity(EARLIER_ID), from: 'hand', notes: EARLIER_NOTES, at: EARLIER_AT });
    return p;
  }
  // chat id → the projects (live or archived; not Recently deleted) that list it
  function where(data) {
    const m = new Map();
    for (const p of data?.list || []) for (const x of p.items || []) if (x && x.type === 'chat' && x.ref != null) { const l = m.get(x.ref); if (!l) m.set(x.ref, [p]); else if (!l.includes(p)) l.push(p); }
    return m;
  }
  function record(p, chatId, to, item, at) {
    const was = (Array.isArray(p.chatsMovedOut) ? p.chatsMovedOut : []).filter((r) => r && r.id !== chatId);
    p.chatsMovedOut = [...was, { id: chatId, to, item: item ? { ...item } : null, at }].slice(-RECORD_KEEP);
  }
  // “Earlier chats”: the one in the list, else back from Recently deleted (its chats need a home), else a new one
  function ensureEarlier(data) {
    let e = data.list.find(isEarlier);
    if (e) return e;
    const t = (data.trash || []).find(isEarlier);
    if (t) { data.trash = data.trash.filter((x) => x !== t); if (!data.trash.length) delete data.trash; const { deletedAt: _d, revived: _r, ...rest } = t; e = rest; }
    else e = earlierProject();
    data.list.push(e);
    return e;
  }
  // o: { at, orphans: true, ready(chat) → true when a chat with no project may go to Earlier chats now }
  function sweep(data, chats, { at = Date.now(), orphans = true, ready = () => true } = {}) {
    const report = { moved: [], earlier: [], created: false, changed: false };
    if (!data || !Array.isArray(data.list)) return report;
    const w = where(data);
    for (const [chatId, ps] of w) {
      if (ps.length < 2) continue;
      const keep = keeper(chatId, ps);
      for (const p of ps) {
        if (p === keep) continue;
        const item = itemOf(p, chatId);
        if (!PC.removeItem(p, 'chat', chatId, at)) continue;
        record(p, chatId, keep.id, item, at);
        report.moved.push({ chatId, from: p.id, to: keep.id });
      }
      w.set(chatId, [keep]);
    }
    if (orphans) {
      const lost = (chats || []).filter((c) => c && c.id && !w.has(c.id) && ready(c)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      if (lost.length) {
        const had = data.list.some(isEarlier);
        const e = ensureEarlier(data);
        report.created = !had;
        for (const c of lost) {
          // (its time: the chat's own, the same on both computers; the project's “updated” stays the fixed one)
          const x = PC.addItem(e, { type: 'chat', ref: c.id, name: c.title || '', at: Number(c.createdAt) || Number(c.updatedAt) || EARLIER_AT }, Math.max(e.updated || 0, EARLIER_AT));
          if (x) { x.was = 'no-project'; report.earlier.push(c.id); }
        }
      }
    }
    report.changed = report.moved.length > 0 || report.earlier.length > 0 || report.created;
    return report;
  }
  // a move: out of every other project (each keeps a record), into `to`. → true when something changed
  function move(data, chatId, toId, { name = '', at = Date.now() } = {}) {
    const to = data?.list?.find((p) => p.id === toId);
    if (!to || !chatId) return false;
    let n = 0;
    for (const p of data.list) {
      if (p === to) continue;
      const item = itemOf(p, chatId);
      if (item && PC.removeItem(p, 'chat', chatId, at)) { record(p, chatId, to.id, item, at); n += 1; }
    }
    if (PC.addItem(to, { type: 'chat', ref: chatId, name }, at)) n += 1;
    return n > 0;
  }
  // every recorded link back (the migration undone): a chat may then be in several projects again, as before
  function undo(data, { at = Date.now() } = {}) {
    let n = 0;
    for (const p of data?.list || []) {
      for (const r of Array.isArray(p.chatsMovedOut) ? p.chatsMovedOut : []) if (r?.item && PC.addItem(p, r.item, at)) n += 1;
      if (p.chatsMovedOut) { delete p.chatsMovedOut; n += 1; }
    }
    return n;
  }
  // a chat with no project or in several: none should be left after a sweep (the check)
  function problems(data, chats) {
    const w = where(data);
    return {
      none: (chats || []).filter((c) => c && !w.has(c.id)).map((c) => c.id),
      several: [...w].filter(([, ps]) => ps.length > 1).map(([id]) => id),
    };
  }
  // a new chat's project: the one chosen for it (New chat in a project, or asked), a Lab chat's scene's project, the
  // open project, else Earlier chats (never none)
  function targetFor({ pending = null, sceneProject = null, scope = null, director = false } = {}) {
    if (pending) return pending;
    if (director && sceneProject) return sceneProject;
    return scope || sceneProject || EARLIER_ID;
  }
  return { EARLIER_ID, EARLIER_NAME, EARLIER_AT, isEarlier, owns, keeper, where, sweep, move, undo, problems, targetFor, earlierProject, ensureEarlier };
})();
if (typeof module !== 'undefined') module.exports = ProjChatsCore;
