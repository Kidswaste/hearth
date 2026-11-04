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
// (round 118, projsync118) across two computers, one of them on an older Hearth (chats in several projects or none,
// “Take out of”, a make's room chat added back by itself):
//   · keeper: a project that already moved this chat out (its chatsMovedOut record) and has it again was given it back
//     by an older Hearth: it ranks below the project the chat was moved to (a skewed clock can't flip it back)
//   · landed(p, chatId): a chat moved INTO a project here clears that project's record of it (a real move back)
//   · lostReady(data, seen, now, grace): a chat with no project waits `grace` (its project link may be a moment behind),
//     except one whose project was deleted (it waits in Recently deleted): that one goes to Earlier chats at once
//   · readable(r, o): the careful read's answer (kv:get { status: true }): a read failure, a file that isn't a projects
//     store, an empty copy in this window while the disk has projects, or no projects at all after the migration ran
//     with chats about (an empty read) → not now: the migration and the keeper skip, nothing is written
//   · adopt(data, chats, toId): chats the owner imported, into the open project (else Earlier chats) at once
//   · ensureEarlier from Recently deleted: only the chats that still need it come back with it
// (round 120, projperf120) due(data, chats): would sweep() change anything (a chat in several projects, or a listed chat
//   in none)? One pass, no copies: the keeper asks it first and skips its careful read and the sweep when not
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
  // (round 118, projsync118) a project that holds a record of moving this chat out, and has it again: an older Hearth
  // gave it back (a new one clears the record when it moves a chat in: landed())
  const left = (p, chatId) => (Array.isArray(p?.chatsMovedOut) && p.chatsMovedOut.some((r) => r && r.id === chatId && r.to !== p.id)) ? 1 : 0;
  function keeper(chatId, ps) {
    const at = (p) => Number(itemOf(p, chatId)?.at) || 0;
    return ps.slice().sort((a, b) => (left(a, chatId) - left(b, chatId)) || (owns(b, chatId) - owns(a, chatId)) || (isEarlier(a) - isEarlier(b))
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
  // (round 118, projsync118) a chat moved into p here: p's record of having moved it out is done with
  function landed(p, chatId) {
    if (!Array.isArray(p?.chatsMovedOut) || !p.chatsMovedOut.some((r) => r && r.id === chatId)) return false;
    p.chatsMovedOut = p.chatsMovedOut.filter((r) => r && r.id !== chatId);
    if (!p.chatsMovedOut.length) delete p.chatsMovedOut;
    return true;
  }
  // “Earlier chats”: the one in the list, else back from Recently deleted (its chats need a home), else a new one
  // (round 118, projsync118) back from Recently deleted with only the chats that are in no other project (the others
  // were moved out of it meanwhile: back in two projects, the other computer on an older Hearth would show both)
  function ensureEarlier(data) {
    let e = data.list.find(isEarlier);
    if (e) return e;
    const t = (data.trash || []).find(isEarlier);
    if (t) {
      data.trash = data.trash.filter((x) => x !== t); if (!data.trash.length) delete data.trash;
      const { deletedAt: _d, revived: _r, ...rest } = t; e = rest;
      const w = where(data);
      e.items = (e.items || []).filter((x) => !(x && x.type === 'chat' && w.has(x.ref)));
    }
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
          landed(e, c.id);
        }
      }
    }
    report.changed = report.moved.length > 0 || report.earlier.length > 0 || report.created;
    return report;
  }
  // (round 120, projperf120) true when sweep(data, chats) could change something: a chat listed by two projects, or a
  // chat of the list in no project (the sweep's `ready` then decides whether now or after the grace). Else the sweep
  // would move nothing, add nothing and make no Earlier chats: the same report as a sweep, without building it
  function due(data, chats) {
    if (!data || !Array.isArray(data.list)) return false;
    const m = new Map();
    for (const p of data.list) for (const x of p.items || []) {
      if (!x || x.type !== 'chat' || x.ref == null) continue;
      const was = m.get(x.ref);
      if (was === undefined) m.set(x.ref, p); else if (was !== p) return true;
    }
    for (const c of chats || []) if (c && c.id && !m.has(c.id)) return true;
    return false;
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
    if (landed(to, chatId)) n += 1;
    return n > 0;
  }
  // (round 118, projsync118) when a chat with no project may go to Earlier chats: at once when a project that had it
  // was deleted (it waits in Recently deleted; the owner's delete, here or on the other computer), else once this
  // computer has seen it without one for `grace` (seen: chat id → when first seen so; kept by the caller)
  function lostReady(data, seen, now = Date.now(), grace = 3 * 60000) {
    const trashed = new Set();
    for (const p of data?.trash || []) for (const x of p?.items || []) if (x && x.type === 'chat') trashed.add(x.ref);
    return (c) => {
      if (trashed.has(c.id)) return true;
      const t = seen.get(c.id);
      if (!t) { seen.set(c.id, now); return false; }
      return now - t >= grace;
    };
  }
  // (round 118, projsync118) the careful read before the migration or the keeper writes. r: kv:get('projects', null,
  // { status: true }); o: { held: the window's copy, chats: the chats list, done: the migration ran on this computer }
  // → { ok, why }. A store that can't be read is never “no projects”.
  function readable(r, { held = null, chats = null, done = false } = {}) {
    if (!r || r.state === 'unreadable' || (r.state !== 'ok' && r.state !== 'missing')) return { ok: false, why: 'unreadable' };
    if (r.state === 'ok' && (!r.value || typeof r.value !== 'object' || !Array.isArray(r.value.list))) return { ok: false, why: 'not a store' };
    if (!Array.isArray(chats)) return { ok: false, why: 'chats not read' };
    const n = Array.isArray(held?.list) ? held.list.length : 0;
    if (r.state === 'ok' && r.value.list.length > 0 && n === 0) return { ok: false, why: 'this window read none' };
    // after the migration every chat has a project: none at all (and none in Recently deleted) with chats about is a
    // read that came back empty, not the owner's projects
    const empty = (d) => !d || ((!Array.isArray(d.list) || !d.list.length) && (!Array.isArray(d.trash) || !d.trash.length));
    if (done && chats.length > 0 && empty(held) && (r.state === 'missing' || empty(r.value))) return { ok: false, why: 'empty after the migration' };
    return { ok: true, why: '' };
  }
  // (round 118, projsync118) chats the owner just imported (Import past chats…): into `toId` (the open project; else
  // Earlier chats) at once, each that has no project yet. → the ids placed
  function adopt(data, chats, toId = EARLIER_ID, { at = Date.now() } = {}) {
    if (!data || !Array.isArray(data.list)) return [];
    const w = where(data);
    const lost = (chats || []).filter((c) => c && c.id && !w.has(c.id));
    if (!lost.length) return [];
    let to = toId && toId !== EARLIER_ID ? data.list.find((p) => p.id === toId) : null;
    if (!to) to = ensureEarlier(data);
    const out = [];
    for (const c of lost) {
      if (PC.addItem(to, { type: 'chat', ref: c.id, name: c.title || '', at: Number(c.createdAt) || at }, at)) out.push(c.id);
      landed(to, c.id);
    }
    return out;
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
  return { EARLIER_ID, EARLIER_NAME, EARLIER_AT, isEarlier, owns, keeper, where, sweep, due, move, undo, problems, targetFor, earlierProject, ensureEarlier, landed, lostReady, readable, adopt };
})();
if (typeof module !== 'undefined') module.exports = ProjChatsCore;
