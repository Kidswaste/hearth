// 🕘 Earlier versions (round 75, versions75), the pure part (no DOM, no fs: dev/versions75-test.js; used by versionsmain.js
// in the main process and versions.js in the window). One place for every older version of a chat, a project, a Lab
// scene, a board or the settings, whichever safety copy holds it (store .prev copies, automatic copies, sync's base and
// Deleted files, conflict copies, "Keep both" copies, the Lab's time machine, backups, the cloud folder).
//   KINDS[kind]          { rel(id), pick(storeValue, id) → the thing or null, name(thing), time(thing) }
//   hashOf(kind, thing)  what the thing IS (times and the engine session left out): two copies with the same hash are one version
//   gather(kind, cands, current) → [{ key, at, src, machine, label, token, also: [labels], summary, same }] newest first,
//                        one per distinct content, the current content left out
//   mergeLists(a, b)     two gathered lists (the quick local one and the backups' one) as one
//   summary(kind, v, cur) the plain difference, as the version compares with now: "12 messages fewer", "notes: 3 lines changed"
//   restoreValue(kind, version, current, now) what a restore writes (the thing's id kept, stamped now so sync sends it)
//   putInto(kind, store, id, thing) the store (projects / scenes) with that thing in place of the one with its id
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VersionsCore = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const listOf = (v) => (Array.isArray(v) ? v.filter(isObj) : []);
  const num = (t) => (typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : 0);
  const KINDS = {
    chat: { word: 'chat', rel: (id) => `chats/${id}.json`, pick: (v) => (isObj(v) && Array.isArray(v.messages) ? v : null), name: (x) => x?.title || 'Chat', time: (x) => num(x?.updatedAt) },
    project: { word: 'project', rel: () => 'kv/projects.json', pick: (v, id) => listOf(v?.list).find((p) => p.id === id) || null, name: (x) => x?.name || 'Project', time: (x) => num(x?.updated) },
    scene: { word: 'Lab scene', rel: () => 'kv/three-sketches.json', pick: (v, id) => listOf(v).find((s) => s.id === id) || null, name: (x) => x?.name || 'Scene', time: (x) => num(x?.updatedAt) },
    board: { word: 'board', rel: (id) => `kv/board-${id}.json`, pick: (v) => (isObj(v) && Array.isArray(v.items) ? v : null), name: (x) => x?.name || 'Board', time: (x) => num(x?.updated) },
    settings: { word: 'settings', rel: () => 'config.json', pick: (v) => (isObj(v) && (Array.isArray(v.agents) || isObj(v.settings)) ? v : null), name: () => 'Settings and agents', time: () => 0 },
  };
  const okId = (kind, id) => Boolean(KINDS[kind]) && (kind === 'settings' || (typeof id === 'string' && /^[\w-]{1,80}$/.test(id)));

  // ---------- what a thing is ----------
  const VOLATILE = new Set(['updatedAt', 'updated', 'opened', 'deletedAt', 'session', 'savedAt', 'seenAt']);
  function canon(v, top = true) {
    if (Array.isArray(v)) return `[${v.map((x) => canon(x, false)).join(',')}]`;
    if (isObj(v)) return `{${Object.keys(v).filter((k) => !(top && VOLATILE.has(k)) && v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k], false)}`).join(',')}}`;
    return JSON.stringify(v === undefined ? null : v);
  }
  // a short hash (FNV-1a, two lanes): enough to tell versions of one thing apart
  function hashOf(kind, thing) {
    const s = canon(thing);
    let a = 0x811c9dc5; let b = 0x01000193 ^ s.length;
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619) >>> 0; b = Math.imul(b ^ c, 2246822519) >>> 0; }
    return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
  }

  // ---------- the plain difference ----------
  const plural = (n, w, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
  const moreFewer = (d, w, ws) => (d > 0 ? `${plural(d, w, ws)} more` : d < 0 ? `${plural(-d, w, ws)} fewer` : '');
  // lines that differ between two texts (as a set of lines: a moved line isn't a change) → the larger of added / removed
  function linesChanged(a, b) {
    const A = String(a || '').split('\n'); const B = String(b || '').split('\n');
    if (A.join('\n') === B.join('\n')) return 0;
    const count = new Map();
    for (const l of A) count.set(l, (count.get(l) || 0) + 1);
    let added = 0;
    for (const l of B) { const n = count.get(l) || 0; if (n) count.set(l, n - 1); else added += 1; }
    let removed = 0; for (const n of count.values()) removed += n;
    return Math.max(added, removed) || 1;
  }
  const textOf = (m) => String(m?.text ?? m?.content ?? '');
  const codeOf = (s) => (listOf(s?.layers).length ? listOf(s.layers).map((l) => `${l.code || ''}`).join('\n') : String(s?.code || ''));
  function summary(kind, v, cur) {
    if (!v) return '';
    if (!cur) return kind === 'chat' ? `${plural(listOf(v.messages).length, 'message')}` : 'not here now';
    if (hashOf(kind, v) === hashOf(kind, cur)) return 'same as now';
    const parts = [];
    const named = (a, b, w = 'name') => { if ((a || '') !== (b || '')) parts.push(`${w} “${String(a || '').slice(0, 40)}”`); };
    if (kind === 'chat') {
      const vm = listOf(v.messages); const cm = listOf(cur.messages);
      const d = vm.length - cm.length;
      if (d) parts.push(moreFewer(d, 'message'));
      const byId = new Map(cm.filter((m) => m.id).map((m) => [m.id, m]));
      let worded = 0;
      vm.forEach((m, i) => { const c = (m.id && byId.get(m.id)) || (!m.id ? cm[i] : null); if (c && textOf(c) !== textOf(m)) worded += 1; });
      if (worded) parts.push(`${plural(worded, 'message')} worded differently`);
      named(v.title, cur.title, 'title');
    } else if (kind === 'project') {
      named(v.name, cur.name);
      const n = linesChanged(v.notes, cur.notes);
      if (n) parts.push(`notes: ${plural(n, 'line')} changed`);
      const d = listOf(v.items).length - listOf(cur.items).length;
      if (d) parts.push(moreFewer(d, 'thing'));
      else if (canon(listOf(v.items).map((x) => x.id).sort()) !== canon(listOf(cur.items).map((x) => x.id).sort())) parts.push('other things in it');
      if (v.status !== cur.status) parts.push(`status: ${v.status || 'active'}`);
    } else if (kind === 'scene') {
      named(v.name, cur.name);
      const d = listOf(v.layers).length - listOf(cur.layers).length;
      if (d) parts.push(moreFewer(d, 'layer'));
      const n = linesChanged(codeOf(v), codeOf(cur));
      if (n) parts.push(`code: ${plural(n, 'line')} changed`);
      if (canon(v.palette || null) !== canon(cur.palette || null)) parts.push('other colors');
    } else if (kind === 'board') {
      named(v.name, cur.name);
      const d = listOf(v.items).length - listOf(cur.items).length;
      if (d) parts.push(moreFewer(d, 'item'));
      else if (canon(v.items) !== canon(cur.items)) parts.push('items moved or changed');
    } else if (kind === 'settings') {
      const d = listOf(v.agents).length - listOf(cur.agents).length;
      if (d) parts.push(moreFewer(d, 'AI'));
      const vs = isObj(v.settings) ? v.settings : {}; const cs = isObj(cur.settings) ? cur.settings : {};
      const keys = new Set([...Object.keys(vs), ...Object.keys(cs)]);
      let n = 0; for (const k of keys) if (canon(vs[k] ?? null) !== canon(cs[k] ?? null)) n += 1;
      if (n) parts.push(`${plural(n, 'setting')} differ${n === 1 ? 's' : ''}`);
      if (canon(v.theme || null) !== canon(cur.theme || null)) parts.push('other colors');
      if (!d && canon(v.agents) !== canon(cur.agents)) parts.push('AIs set up differently');
    }
    return parts.filter(Boolean).join(' · ') || 'small differences';
  }

  // ---------- one timeline ----------
  // which copy to read a version from when several hold it (local and small first, a zip last)
  const RANK = { before: 0, timemachine: 1, copy: 2, prev: 3, base: 4, trash: 5, conflict: 6, cloud: 7, cloudtrash: 8, keepboth: 9, backup: 10 };
  // cands: [{ token, src, label, at (when the copy was made), machine, value (the thing) }] · current: the thing now (or null)
  function gather(kind, cands, current, o = {}) {
    const K = KINDS[kind];
    const curKey = current ? hashOf(kind, current) : null;
    const by = new Map();
    let same = 0;
    for (const c of cands || []) {
      if (!c || !c.value || !c.token) continue;
      const key = c.key || hashOf(kind, c.value);
      if (key === curKey && c.src !== 'keepboth') { same += 1; continue; }
      const own = K.time(c.value);
      const at = num(c.at) || own;
      // when it was that: the thing's own time when the copy is later than it (a copy made now of something older)
      const when = own && (!at || own <= at + 60000) ? own : at;
      const e = by.get(key);
      if (!e) { by.set(key, { key, at: when, src: c.src, machine: c.machine || '', label: c.label, token: c.token, also: [], summary: c.summary || summary(kind, c.value, current), name: K.name(c.value), ...(c.by ? { by: c.by } : {}), ...(c.note ? { note: c.note } : {}) }); continue; }
      e.also.push(c.label);
      if (!e.at || (when && when < e.at)) e.at = when;
      if ((RANK[c.src] ?? 99) < (RANK[e.src] ?? 99)) { e.also.push(e.label); e.also = e.also.filter((x) => x !== c.label); Object.assign(e, { src: c.src, label: c.label, token: c.token, machine: c.machine || e.machine }); }
    }
    const list = [...by.values()].sort((a, b) => (b.at - a.at) || ((RANK[a.src] ?? 99) - (RANK[b.src] ?? 99)));
    for (const e of list) e.also = [...new Set(e.also)].slice(0, 6);
    return o.withSame ? { list, same } : list;
  }
  function mergeLists(a, b) {
    const by = new Map();
    for (const e of [...(a || []), ...(b || [])]) {
      const x = by.get(e.key);
      if (!x) { by.set(e.key, { ...e, also: [...(e.also || [])] }); continue; }
      x.also = [...new Set([...x.also, e.label, ...(e.also || [])])].filter((l) => l !== x.label).slice(0, 6);
      if (e.at && e.at < x.at) x.at = e.at;
    }
    return [...by.values()].sort((p, q) => (q.at - p.at) || ((RANK[p.src] ?? 99) - (RANK[q.src] ?? 99)));
  }

  // ---------- restoring ----------
  const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  function restoreValue(kind, version, current, now = Date.now()) {
    const v = clone(version);
    if (!isObj(v)) return null;
    if (kind === 'chat') {
      if (current?.id) v.id = current.id;
      if (current?.agentId) v.agentId = current.agentId;
      // the engine's own session went on past this version: the next message sends the conversation as it is now instead
      if (current && canon(listOf(v.messages).map(textOf)) !== canon(listOf(current.messages).map(textOf))) delete v.session;
      else if (current?.session) v.session = clone(current.session);
      v.updatedAt = now;
    } else if (kind === 'project' || kind === 'board') {
      if (current?.id) v.id = current.id;
      v.updated = now;
    } else if (kind === 'scene') {
      if (current?.id) v.id = current.id;
      if (listOf(v.layers).length) v.code = v.layers[0].code ?? v.code;
      v.updatedAt = now;
    }
    delete v.deletedAt;
    return v;
  }
  function putInto(kind, store, id, thing) {
    if (kind === 'project') {
      const s = isObj(store) ? clone(store) : { v: 1, list: [], dismissed: [] };
      s.list = listOf(s.list);
      const i = s.list.findIndex((p) => p.id === id);
      if (i >= 0) s.list[i] = thing; else s.list.unshift(thing);
      if (Array.isArray(s.trash)) { s.trash = s.trash.filter((p) => p?.id !== id); if (!s.trash.length) delete s.trash; }
      return s;
    }
    if (kind === 'scene') {
      const s = Array.isArray(store) ? clone(store) : [];
      const i = s.findIndex((x) => x?.id === id);
      if (i >= 0) s[i] = thing; else s.push(thing);
      return s;
    }
    return thing;
  }

  // ---------- words ----------
  function when(t, now = Date.now()) {
    if (!t) return 'some time ago';
    const d = new Date(t); const today = new Date(now);
    const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === today.toDateString()) return `today ${hm}`;
    const y = new Date(now - 864e5);
    if (d.toDateString() === y.toDateString()) return `yesterday ${hm}`;
    return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  const SRC_WORDS = {
    before: 'kept before a restore', timemachine: 'Lab time machine', copy: 'automatic copy', prev: 'copy before the last save',
    base: 'last synced version', trash: 'set aside by sync', conflict: 'conflict copy', cloud: 'in the cloud folder now',
    cloudtrash: 'sync\'s Deleted files', keepboth: '“Keep both” copy', backup: 'daily backup',
  };

  return { KINDS, okId, canon, hashOf, linesChanged, summary, gather, mergeLists, restoreValue, putInto, when, plural, SRC_WORDS, RANK };
}));
