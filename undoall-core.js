// One "Undo last change" for the whole app (round 41, undoall): the pure part, Node-tested (dev/undoall-test.js).
// The owner shouldn't need to know which of Hearth's many undos to reach for, so the renderer (undoall.js) keeps ONE
// small log of the changes the owner can see (a setting switched, an AI's setup changed, a chat deleted / renamed /
// moved, memory tidied, a recipe or a template deleted), each with a plain label ("Turned off Mood board for Claude",
// "Deleted chat “Logo ideas”"). This file holds what needs no DOM:
//   · the log: add (a quick second change to the same thing merges into the first; back to where it was = no entry),
//     the next to undo / redo (a new change closes redo, like every editor), mark undone / redone, prune, save form
//   · config changes: a snapshot of settings / AIs / look, the difference between two snapshots as path changes,
//     putting old (undo) or new (redo) values back into a config, "changed again since?" checks
//   · plain words: what each change says (switch names, AI setup rows, instructions added / removed / paused)
const UndoAllCore = (() => {
  const CAP = 120; // entries kept
  const MAX_AGE = 7 * 864e5; // a week
  const MERGE_MS = 2500; // the same thing changed again this soon: one entry (a slider, a text typed in two goes)

  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  // equal as data (key order doesn't matter; undefined and a missing key are the same)
  function same(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a == null && b == null; // null and a missing value: the same "not set"
    if (typeof a !== typeof b || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
    const ka = Object.keys(a).filter((k) => a[k] !== undefined);
    const kb = Object.keys(b).filter((k) => b[k] !== undefined);
    return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
  }
  const short = (s, n = 60) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const humanize = (k) => String(k || '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().trim();

  // ---------- the log ----------
  // entry: { id, n, at, kind, label, key (what it changed: merges and "changed again" use it), u (the kind's data),
  //          cant? (why it can't be undone), undone? (when), mergeable? }
  function makeLog(saved = null) {
    const L = { list: [], redo: [], seq: 0 };
    if (saved && Array.isArray(saved.list)) { L.list = saved.list.filter((e) => e && e.id && e.kind); L.seq = Math.max(0, ...L.list.map((e) => e.n || 0)); }
    return L;
  }
  // a quick second change to the same thing merges with the newest entry (its "before" stays); a change that comes back
  // to where it was leaves nothing. merge(prev, e) → { u, label } merged, or null when back to the start.
  function add(L, e, at = Date.now(), merge = null) {
    const top = L.list[L.list.length - 1];
    if (merge && top && !top.undone && !top.cant && top.kind === e.kind && top.key === e.key && at - top.at < MERGE_MS) {
      const m = merge(top, e);
      L.redo = [];
      if (m == null) { L.list.pop(); return null; }
      Object.assign(top, { u: m.u, label: m.label ?? e.label, at });
      return top;
    }
    L.seq += 1;
    const x = { id: `c${at.toString(36)}${L.seq.toString(36)}`, n: L.seq, at, ...e };
    L.list.push(x);
    L.redo = []; // a new change closes redo (every editor does this)
    prune(L, at);
    return x;
  }
  function prune(L, at = Date.now()) {
    L.list = L.list.filter((e) => at - e.at < MAX_AGE);
    if (L.list.length > CAP) L.list.splice(0, L.list.length - CAP);
    const ids = new Set(L.list.map((e) => e.id));
    L.redo = L.redo.filter((id) => ids.has(id));
  }
  // the newest change not undone yet that can be undone (skip: entries to leave alone, e.g. the ones that failed)
  const nextUndo = (L, skip = null) => [...L.list].reverse().find((e) => !e.undone && !e.cant && !(skip && skip(e))) || null;
  const nextRedo = (L) => { const id = L.redo[L.redo.length - 1]; return (id && L.list.find((e) => e.id === id && e.undone)) || null; };
  const canRedo = (L, e) => Boolean(e?.undone) && L.redo.includes(e.id);
  function markUndone(L, e, at = Date.now()) { e.undone = at; L.redo = L.redo.filter((id) => id !== e.id); L.redo.push(e.id); }
  function markRedone(L, e) { delete e.undone; L.redo = L.redo.filter((id) => id !== e.id); }
  const toJSON = (L) => ({ v: 1, list: L.list });

  // ---------- config: settings, the AIs, the look ----------
  // what is never "a change the owner made" (bookkeeping kept in the config by features)
  const IGNORE_RE = /^(last|seen|stats|cache|tested|session)|(At|Ts|Seen|Count|Stamp)$/;
  const IGNORE = { test: (k) => k !== 'lighterAt' && IGNORE_RE.test(k) }; // (round 43, costcoach) lighterAt is a setting (Continue lighter at…), not a stamp
  const snapshot = (cfg) => clone({ settings: cfg?.settings || {}, agents: cfg?.agents || [], theme: cfg?.theme || {} });
  // a → b as changes: { path: ['settings', k] | ['theme', k] | ['agents', id, k] | ['agents', id], old, now, idx? }
  function diffConfig(a, b) {
    const out = [];
    for (const part of ['settings', 'theme']) {
      const A = a?.[part] || {}; const B = b?.[part] || {};
      for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) if (!IGNORE.test(k) && !same(A[k], B[k])) out.push({ path: [part, k], old: clone(A[k]), now: clone(B[k]) });
    }
    const A = a?.agents || []; const B = b?.agents || [];
    const byA = new Map(A.map((x, i) => [x.id, [x, i]])); const byB = new Map(B.map((x, i) => [x.id, [x, i]]));
    for (const [id, [x, i]] of byA) {
      const y = byB.get(id)?.[0];
      if (!y) { out.push({ path: ['agents', id], old: clone(x), now: undefined, idx: i }); continue; }
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (k !== 'id' && !IGNORE.test(k) && !same(x[k], y[k])) out.push({ path: ['agents', id, k], old: clone(x[k]), now: clone(y[k]) });
    }
    for (const [id, [y, i]] of byB) if (!byA.has(id)) out.push({ path: ['agents', id], old: undefined, now: clone(y), idx: i });
    return out;
  }
  const pathKey = (c) => c.path.join('.');
  const keyOf = (ch) => ch.map(pathKey).sort().join('|');
  // the value at a change's path in a config, now
  function valueAt(cfg, path) {
    if (path[0] === 'agents') {
      const a = (cfg?.agents || []).find((x) => x.id === path[1]);
      return path.length === 2 ? a : a?.[path[2]];
    }
    return cfg?.[path[0]]?.[path[1]];
  }
  // put one side ('old' = undo, 'now' = redo) of the changes into cfg (mutates it; live agent objects stay the same objects)
  function applyConfig(cfg, ch, side = 'old') {
    for (const c of ch) {
      const v = clone(c[side]);
      if (c.path[0] === 'agents') {
        cfg.agents ||= [];
        const i = cfg.agents.findIndex((x) => x.id === c.path[1]);
        if (c.path.length === 2) {
          if (v === undefined) { if (i >= 0) cfg.agents.splice(i, 1); } else if (i >= 0) cfg.agents[i] = v; else cfg.agents.splice(Math.min(c.idx ?? cfg.agents.length, cfg.agents.length), 0, v);
          continue;
        }
        if (i < 0) continue;
        if (v === undefined) delete cfg.agents[i][c.path[2]]; else cfg.agents[i][c.path[2]] = v;
        continue;
      }
      cfg[c.path[0]] ||= {};
      if (v === undefined) delete cfg[c.path[0]][c.path[1]]; else cfg[c.path[0]][c.path[1]] = v;
    }
    return cfg;
  }
  // the paths whose value isn't what the change left any more (changed again since)
  const movedSince = (cfg, ch, side = 'now') => ch.filter((c) => !same(valueAt(cfg, c.path), c[side]));
  // two changes of the same paths in a row: the first's old, the second's now; null when it's all back to the start
  function mergeConfig(prev, next) {
    const by = new Map(prev.map((c) => [pathKey(c), { ...c }]));
    for (const c of next) { const p = by.get(pathKey(c)); if (p) p.now = clone(c.now); else by.set(pathKey(c), { ...c }); }
    const out = [...by.values()].filter((c) => !same(c.old, c.now));
    return out.length ? out : null;
  }

  // ---------- plain words ----------
  // the AI setup rows (options.js), the switches people see, in their own words
  const AI_ROWS = {
    chatTools: 'Your chats and Hearth', threeTools: 'Three.js Lab', boardTools: 'Mood board', captureTools: 'Screenshots and recordings',
    appsTools: 'App windows', adobeTools: 'Adobe', deployTools: 'Publishing', gameTools: 'Forgeheart game', webSearch: 'Web search',
    autoMemory: 'memory', selfReview: '“Checks its own work”', suggestNext: '“Suggests what to do next”', showThinking: '“Shows its thinking”',
    autoCompact: '“Shrinks long chats”', nodesTool: 'node graphs in the Lab', progressTag: 'the progress bar while it builds', astraNoSandbox: 'commands without its sandbox',
    hubTools: 'Hearth\'s tools',
  };
  const ON_UNLESS_FALSE = new Set(['autoMemory', 'showThinking', 'nodesTool', 'autoCompact', 'notify', 'suggestNext']);
  const SETTING_NAMES = {
    notify: 'reply notifications', autoBackupDays: 'automatic backups', backupDir: 'the backup folder', captureDir: 'the captures folder',
    macTitleBar: 'the Mac title bar', startOn: 'what opens first', enginePaths: 'where the AI apps are', videoDirs: 'the video folders',
    forgeDebugBuild: 'the Forgeheart debug build', forgeheartFolder: 'the Forgeheart folder', closeToTray: '“Closing the window keeps Hearth running”',
    trayIcon: 'the tray icon', openAtLogin: 'opening Hearth when you sign in', globalHotkey: 'the global shortcut',
  };
  const isOn = (k, v, engine) => {
    if (k === 'chatTools') return engine === 'codex' ? v === true : v !== false;
    if (ON_UNLESS_FALSE.has(k)) return v !== false;
    return Boolean(v) && v !== 'disabled' && v !== 'off';
  };
  const valWords = (v) => (v === undefined || v === null || v === '' ? 'default' : typeof v === 'boolean' ? (v ? 'on' : 'off') : typeof v === 'object' ? (Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}` : 'changed') : short(v, 30));
  const EFFORT = { low: 'Quick', medium: 'Smart', high: 'Deep', xhigh: 'Deep' };
  const LENGTH = { low: 'Short', high: 'Detailed' };
  function instructionWords(name, old = [], now = []) {
    const A = Array.isArray(old) ? old : []; const B = Array.isArray(now) ? now : [];
    const text = (r) => `“${short(r?.text, 40)}”`;
    if (B.length === A.length + 1) { const r = B.find((x) => !A.some((y) => y.text === x.text)); if (r) return `Added an instruction for ${name}: ${text(r)}`; }
    if (A.length === B.length + 1) { const r = A.find((x) => !B.some((y) => y.text === x.text)); if (r) return `Removed an instruction from ${name}: ${text(r)}`; }
    if (A.length === B.length) {
      const i = A.findIndex((x, j) => !same(x, B[j]));
      if (i >= 0 && A[i].text === B[i].text && (A[i].on !== false) !== (B[i].on !== false)) return `${B[i].on === false ? 'Paused' : 'Turned back on'} an instruction for ${name}: ${text(B[i])}`;
      if (i >= 0) return `Edited an instruction for ${name}: ${text(B[i])}`;
    }
    return `Changed ${name}'s instructions`;
  }
  // one change in words; names: { agent(id) → { name, engine } }
  function changeWords(c, names = {}) {
    const [part, id, k] = c.path;
    if (part === 'settings') {
      const n = SETTING_NAMES[id] || humanize(id);
      if (typeof c.now === 'boolean' || typeof c.old === 'boolean' || ON_UNLESS_FALSE.has(id)) return `Turned ${isOn(id, c.now) ? 'on' : 'off'} ${n}`;
      return `Changed ${n}${c.now !== undefined && typeof c.now !== 'object' ? ` to ${valWords(c.now)}` : ''}`;
    }
    if (part === 'theme') return id === 'preset' && c.now ? `Changed the look to ${humanize(c.now)}` : 'Changed the look';
    const a = names.agent?.(id) || {};
    const who = a.name || (c.old?.name || c.now?.name) || 'an AI';
    if (c.path.length === 2) return c.now === undefined ? `Removed the AI “${short(who, 30)}”` : `Added the AI “${short(who, 30)}”`;
    if (AI_ROWS[k]) return `Turned ${isOn(k, c.now, a.engine) ? 'on' : 'off'} ${AI_ROWS[k]} for ${who}`;
    if (k === 'systemPrompt') return `Changed ${who}'s personality`;
    if (k === 'instructions') return instructionWords(who, c.old, c.now);
    if (k === 'effort') return `${who} thinks: ${EFFORT[c.now] || 'Smart'}`;
    if (k === 'verbosity') return `${who}'s answers: ${LENGTH[c.now] || 'Normal'}`;
    if (k === 'lighterAt') return c.now === 0 ? `Turned off Continue lighter for ${who}` : `${who}: continue lighter at ${c.now ? `${Math.round(c.now / 1000)}k` : '40k'}`; // (round 43, costcoach)
    if (k === 'fileAccess' || k === 'workspace' || k === 'codexFiles') return `Changed what ${who} can reach on this computer`;
    if (k === 'connectors' || k === 'connections') return `Changed ${who}'s connections`;
    if (k === 'hooks') return `Changed ${who}'s hooks`;
    if (k === 'name') return `Renamed the AI “${short(c.old, 24)}” to “${short(c.now, 24)}”`;
    if (k === 'model') return `${who}'s model: ${valWords(c.now)}`;
    return `Changed ${who}'s ${humanize(k)}`;
  }
  function configWords(ch, names = {}) {
    if (!ch.length) return 'No change';
    const first = changeWords(ch[0], names);
    return ch.length > 1 ? `${first} (+${ch.length - 1} more)` : first;
  }
  // adding an AI is left alone (taking it back would hide its chats): said plainly
  const configCant = (ch) => (ch.some((c) => c.path[0] === 'agents' && c.path.length === 2 && c.old === undefined) ? 'Adding an AI isn\'t taken back here: remove it from its ⋯ menu if you don\'t want it.' : null);

  // a Settings switch (settings-find.js): the command argument that puts state `v` back
  function switchArg(sw, v) {
    if (sw.choices) return String(v ?? sw.choices[0]);
    return v ? (sw.on || 'on') : (sw.off || 'off');
  }
  const switchWords = (label, v, choices) => (choices ? `${label}: ${humanize(v)}` : `Turned ${v ? 'on' : 'off'} “${short(label, 50)}”`);
  // a chat's tags / folder / archived (chat-ux.js meta): the patch that makes `now` into `want`
  function metaPatch(want = {}, now = {}) {
    const p = {};
    for (const k of new Set([...Object.keys(want || {}), ...Object.keys(now || {})])) if (!same(want?.[k], now?.[k])) p[k] = want?.[k] === undefined ? (k === 'tags' ? [] : k === 'archived' ? false : '') : clone(want[k]);
    return p;
  }
  function metaWords(title, before = {}, after = {}) {
    const t = `“${short(title || 'chat', 40)}”`;
    if (Boolean(before.archived) !== Boolean(after.archived)) return `${after.archived ? 'Archived' : 'Unarchived'} chat ${t}`;
    if ((before.folder || '') !== (after.folder || '')) return after.folder ? `Moved chat ${t} to “${short(after.folder, 30)}”` : `Took chat ${t} out of “${short(before.folder, 30)}”`;
    if (!same(before.tags || [], after.tags || [])) return `Changed the tags of chat ${t}`;
    return `Changed chat ${t}`;
  }

  const ago = (t, now = Date.now()) => { const s = Math.round((now - t) / 1000); return s < 50 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`; };

  return {
    CAP, MAX_AGE, MERGE_MS, clone, same, short, humanize, ago,
    makeLog, add, prune, nextUndo, nextRedo, canRedo, markUndone, markRedone, toJSON,
    snapshot, diffConfig, keyOf, valueAt, applyConfig, movedSince, mergeConfig, changeWords, configWords, configCant, isOn,
    switchArg, switchWords, metaPatch, metaWords, instructionWords,
  };
})();
if (typeof module !== 'undefined') module.exports = UndoAllCore;
