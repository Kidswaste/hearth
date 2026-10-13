// One undo for what the AIs did (round 28, aiundo), as data: no DOM, no app, so it runs in Node too
// (dev/aiundo-test.js). aiundo.js records the entries and runs each area's own undo; this file decides WHAT to undo
// and in which order.
//   entry = { id, n (order), at, by (agent id), who (its name then), engine, chat, turn (the reply), via?, area:
//   'lab' | 'board' | 'file' | 'setting' | 'other', what (plain words), target (the thing's name), tk: a target key or
//   a list of them ('scene:<id>', 'board:<id>', 'file:<path>', 'setting:<path>'), u (the pointer to that area's own
//   undo: a time-machine version, the board items before, an access-log entry with its copy, the old value),
//   after? (what the thing looked like right after, to notice the owner's later changes), cant? (why it can't be
//   undone), undone? (when) }
// Safe order: undoing a change also undoes every LATER change (by any AI) to the same thing, newest first; the
// "state" areas (a Lab scene, a file) go back in one step to the state before the oldest of them (the time
// machine / the copy kept), the "diff" areas (board items, settings) undo each change in turn.
const AiUndoCore = (() => {
  const KEEP_DAYS = 14;
  const MAX = 400;
  const STATE = new Set(['lab', 'file']);
  const tks = (e) => [].concat(e?.tk || []).filter(Boolean);
  const overlap = (a, b) => { const s = new Set(tks(a)); return tks(b).some((k) => s.has(k)); };
  const live = (e) => e && !e.undone;
  const newestFirst = (a, b) => (b.at - a.at) || ((b.n || 0) - (a.n || 0));
  const isNewer = (a, b) => a.at > b.at || (a.at === b.at && (a.n || 0) > (b.n || 0));
  const short = (s, n = 70) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

  // ---------- the list ----------
  let seq = 0;
  function add(list, e, now = Date.now()) {
    seq = Math.max(seq, ...list.slice(-1).map((x) => x.n || 0)) + 1;
    const x = { id: `u${now.toString(36)}${Math.floor(Math.random() * 46656).toString(36).padStart(3, '0')}`, n: seq, at: now, ...e };
    list.push(x);
    prune(list, now);
    return x;
  }
  // older than two weeks goes; past MAX the undone ones go first, then the oldest
  function prune(list, now = Date.now()) {
    const keep = list.filter((e) => now - e.at < KEEP_DAYS * 864e5);
    while (keep.length > MAX) {
      const i = keep.findIndex((e) => e.undone);
      keep.splice(i >= 0 ? i : 0, 1);
    }
    if (keep.length !== list.length) list.splice(0, list.length, ...keep);
    return list;
  }

  // ---------- what to undo ----------
  const pickThis = (list, id) => list.filter((e) => e.id === id);
  // everything that AI did from that change on (in every chat and place)
  function pickSince(list, id) {
    const e0 = list.find((e) => e.id === id);
    return e0 ? list.filter((e) => e.by === e0.by && !isNewer(e0, e)) : [];
  }
  const pickReply = (list, turn) => list.filter((e) => turn && e.turn === turn);
  const pickChat = (list, chat) => list.filter((e) => chat && e.chat === chat);
  // the asked entries plus every later change to the same things (by any AI), still not undone, newest first
  function closure(list, picked) {
    const set = new Map(picked.filter(live).map((e) => [e.id, e]));
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of list) {
        if (!live(e) || set.has(e.id)) continue;
        for (const s of set.values()) if (isNewer(e, s) && overlap(e, s)) { set.set(e.id, e); grew = true; break; }
      }
    }
    return [...set.values()].sort(newestFirst);
  }
  // plan → { entries (newest first), extra: the later ones that come along, steps: [{ e, covers: [entry ids] }]
  // (what actually runs, newest first), skipped: entries that can't be undone, newest: per target its newest entry
  // (the owner's later changes are looked for after it) }
  function plan(list, picked) {
    const asked = new Set(picked.map((e) => e.id));
    const entries = closure(list, picked);
    const steps = []; const skipped = [];
    const stateRuns = new Map(); // a state area's target → its entries in this plan (newest first)
    for (const e of entries) {
      if (STATE.has(e.area)) { const k = `${e.area}|${tks(e).join(',')}`; if (!stateRuns.has(k)) stateRuns.set(k, []); stateRuns.get(k).push(e); continue; }
      if (e.cant) { skipped.push(e); continue; }
      steps.push({ e, covers: [e.id] });
    }
    for (const run of stateRuns.values()) {
      // the oldest change that kept what was there before puts everything back in one step
      const oldest = [...run].reverse().find((e) => !e.cant);
      if (!oldest) { skipped.push(...run); continue; }
      const covers = run.filter((e) => !isNewer(oldest, e) || e === oldest).map((e) => e.id);
      steps.push({ e: oldest, covers });
      skipped.push(...run.filter((e) => e.cant && !covers.includes(e.id)));
    }
    steps.sort((a, b) => newestFirst(a.e, b.e));
    const newest = new Map();
    for (const e of entries) for (const k of tks(e)) if (!newest.has(k)) newest.set(k, e);
    return { entries, extra: entries.filter((e) => !asked.has(e.id)), steps, skipped, newest: [...new Set(newest.values())] };
  }

  // ---------- board items: what a call changed (only the owner-facing fields; vibes, thumbnails are made later) ----------
  const AUTO = new Set(['vibe', 'tiny', 'thumb', 'poster', 'mid', 'full', 'meta', 'dur', 'cuts', 'frames', 'analyzed', 'work', 'err', 'error', 'loading', 'w0', 'h0']);
  const own = (it) => { const o = {}; for (const k of Object.keys(it || {}).sort()) if (!AUTO.has(k) && !k.startsWith('_')) o[k] = it[k]; return o; };
  const sig = (it) => JSON.stringify(own(it));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // before / after: item lists → null (nothing changed) | { add: [{ id, sig }], del: [{ item, index }], chg: [{ id, before, after, gone }] }
  function diffItems(before = [], after = []) {
    const A = new Map(before.map((i, idx) => [i.id, { i, idx }]));
    const B = new Map(after.map((i) => [i.id, i]));
    const add = []; const del = []; const chg = [];
    for (const i of after) if (!A.has(i.id)) add.push({ id: i.id, sig: sig(i) });
    for (const [id, { i, idx }] of A) if (!B.has(id)) del.push({ item: JSON.parse(JSON.stringify(i)), index: idx });
    for (const [id, { i }] of A) {
      const j = B.get(id);
      if (!j) continue;
      const oa = own(i); const ob = own(j);
      const keys = new Set([...Object.keys(oa), ...Object.keys(ob)]);
      const b0 = {}; const a0 = {}; const gone = [];
      for (const k of keys) {
        if (same(oa[k], ob[k])) continue;
        if (k in oa) b0[k] = oa[k]; else gone.push(k);
        a0[k] = k in ob ? ob[k] : null;
      }
      if (Object.keys(a0).length) chg.push({ id, before: b0, after: a0, gone });
    }
    return add.length || del.length || chg.length ? { add, del, chg } : null;
  }
  // the inverse on a list of items (in place): added ones go, removed ones come back where they were, changed ones
  // get their fields back
  function revertItems(items, d) {
    const drop = new Set(d.add.map((x) => x.id));
    for (let i = items.length - 1; i >= 0; i -= 1) if (drop.has(items[i].id)) items.splice(i, 1);
    for (const c of d.chg) {
      const it = items.find((x) => x.id === c.id);
      if (!it) continue;
      Object.assign(it, JSON.parse(JSON.stringify(c.before)));
      for (const k of c.gone || []) delete it[k];
    }
    for (const x of [...d.del].sort((a, b) => a.index - b.index)) if (!items.some((i) => i.id === x.item.id)) items.splice(Math.min(x.index, items.length), 0, JSON.parse(JSON.stringify(x.item)));
    return items;
  }
  // how many of the call's items someone changed since (their fields differ from right after the call)
  function touchedItems(items, d) {
    const by = new Map(items.map((i) => [i.id, i]));
    let n = 0;
    for (const a of d.add) { const it = by.get(a.id); if (it && sig(it) !== a.sig) n += 1; }
    for (const c of d.chg) { const it = by.get(c.id); if (!it) { n += 1; continue; } const o = own(it); if (Object.keys(c.after).some((k) => !same(o[k] ?? null, c.after[k]))) n += 1; }
    for (const x of d.del) if (by.has(x.item.id)) n += 1;
    return n;
  }
  function boardWords(d) {
    const p = [];
    if (d.add.length) p.push(`added ${d.add.length}`);
    if (d.chg.length) p.push(`${d.chg.every((c) => Object.keys(c.after).every((k) => /^(x|y|w|h|z|rot)$/.test(k))) ? 'moved' : 'changed'} ${d.chg.length}`);
    if (d.del.length) p.push(`removed ${d.del.length}`);
    const s = p.join(', ');
    return `${s.charAt(0).toUpperCase()}${s.slice(1)} item${d.add.length + d.chg.length + d.del.length === 1 ? '' : 's'}`;
  }

  // ---------- settings: the paths a command changed ----------
  // before / after: { settings: {}, agents: [{ id, … }] } → [{ path: ['settings', k] | ['agents', id, k], old, now }]
  function diffConfig(before, after) {
    const out = [];
    const keys = (a, b) => [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])];
    for (const k of keys(before?.settings, after?.settings)) if (!same(before?.settings?.[k], after?.settings?.[k])) out.push({ path: ['settings', k], old: before?.settings?.[k], now: after?.settings?.[k] });
    const A = new Map((before?.agents || []).map((a) => [a.id, a]));
    for (const b of after?.agents || []) {
      const a = A.get(b.id);
      if (!a) continue; // a new agent is not a setting
      for (const k of keys(a, b)) if (k !== 'id' && !same(a[k], b[k])) out.push({ path: ['agents', b.id, k], old: a[k], now: b[k] });
    }
    return out;
  }
  function getPath(cfg, path) {
    if (path[0] === 'settings') return cfg?.settings?.[path[1]];
    return (cfg?.agents || []).find((a) => a.id === path[1])?.[path[2]];
  }
  function setPath(cfg, path, v) {
    const o = path[0] === 'settings' ? (cfg.settings ||= {}) : (cfg.agents || []).find((a) => a.id === path[1]);
    if (!o) return false;
    const k = path[path.length - 1];
    if (v === undefined) delete o[k]; else o[k] = JSON.parse(JSON.stringify(v));
    return true;
  }
  const valWords = (v) => (v === undefined || v === null ? 'unset' : v === true ? 'on' : v === false ? 'off' : short(typeof v === 'string' ? v : JSON.stringify(v), 24));

  // ---------- words ----------
  const AREA_WORD = { lab: 'Lab scene', board: 'board', file: 'file', setting: 'setting', other: 'change' };
  const ICON = { lab: '◇', board: '▦', file: '✎', setting: '⚙', other: '•' };
  const line = (e) => `${e.what}${e.target ? ` · ${short(e.target, 40)}` : ''}`;
  function describe(p, nameOf = (e) => e.who || 'An AI') {
    const L = [];
    for (const e of p.entries.slice(0, 8)) L.push(`${ICON[e.area] || '•'} ${nameOf(e)}: ${short(line(e), 90)}${e.cant ? ' (can\'t be undone)' : ''}`);
    if (p.entries.length > 8) L.push(`… and ${p.entries.length - 8} more`);
    return L;
  }

  return { KEEP_DAYS, MAX, STATE, AREA_WORD, ICON, add, prune, tks, overlap, isNewer, newestFirst, pickThis, pickSince, pickReply, pickChat, closure, plan, diffItems, revertItems, touchedItems, boardWords, own, sig, diffConfig, getPath, setPath, valWords, line, describe, short };
})();
if (typeof module !== 'undefined') module.exports = AiUndoCore;
