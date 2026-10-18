// Projects (round 23), the pure part (no DOM; loads in Node for dev/projects-test.js). A project is a home for one piece
// of the owner's work, whatever it is made of: chats (any agent), Lab scenes and their sequences, boards, renders,
// captures, files in the chats' workspace, app downloads, deploys. It has one identity (a name, a color and a mark from
// the makes' palette: MakesCore.identity), a cover, notes and a status.
//   create / addItem / removeItem / rename / setStatus / setNotes / setCover   (plain data, every change stamps `updated`)
//   normalize(data)    → { list, dismissed, v }: what kv 'projects' holds; lists of objects with ids, so cloud sync merges
//                        two computers' changes item by item (sync-merge.js merge3), small (names, refs, times; no pictures)
//   suggest(things, …) → token-free suggestions: things whose names share words ("Stoop Ronin"), joined by their links
//                        (a chat's scene, a board's chats, a make's rooms) and timing (made within days of each other)
//   search(q, docs)    → ranked hits (every word must be somewhere; title words, prefixes and recent things first)
//   cover(p, look) / latest(p, types, timeOf) → the picture and the "continue where you left off" of a project
const ProjectsCore = (() => {
  const MC = typeof MakesCore !== 'undefined' ? MakesCore : require('./makes-core.js');
  const TYPES = {
    chat: { label: 'Chat', many: 'chats', icon: '✳' },
    scene: { label: 'Scene', many: 'scenes', icon: '◭' },
    seq: { label: 'Sequence', many: 'sequences', icon: '▤' },
    board: { label: 'Board', many: 'boards', icon: '▦' },
    render: { label: 'Render', many: 'renders', icon: '⇪' },
    capture: { label: 'Capture', many: 'captures', icon: '◉' },
    file: { label: 'File', many: 'files', icon: '▭' },
    download: { label: 'Download', many: 'downloads', icon: '⇣' },
    deploy: { label: 'Deploy', many: 'deploys', icon: '⇡' },
  };
  const STATUS = { active: 'Active', paused: 'Paused', done: 'Done', archived: 'Archived' };
  const cap = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const itemId = (type, ref) => `${type}:${ref}`;
  const plural = (n, type) => `${n} ${n === 1 ? TYPES[type]?.label.toLowerCase() || type : TYPES[type]?.many || `${type}s`}`;

  // ---------- the project (plain data) ----------
  let n = 0;
  const newId = (at = Date.now()) => `pj${at.toString(36)}${(n++ % 1296).toString(36).padStart(2, '0')}`;
  // create({ name?, from: 'hand' | 'make' | 'suggest', make?, notes?, items?, avoid?, at?, id?, ident? })
  function create(o = {}) {
    const at = o.at || Date.now();
    const id = o.id || newId(at);
    const ident = o.ident ? { ...o.ident } : MC.identity(id, o.avoid);
    const p = {
      id, name: cap(o.name || '', 48) || MC.genName(id, ident), ident, status: 'active', notes: cap(o.notes || '', 4000),
      from: ['hand', 'make', 'suggest'].includes(o.from) ? o.from : 'hand', make: o.make || null, cover: null,
      items: [], at, updated: at, opened: at,
    };
    p.notes = String(o.notes || '').slice(0, 4000);
    for (const it of o.items || []) addItem(p, it, at);
    return p;
  }
  // an item: { id: 'chat:<ref>', type, ref, name, at }; the same thing twice is one item (its name refreshed)
  function addItem(p, it, at = Date.now()) {
    if (!p || !it || !TYPES[it.type] || it.ref == null || it.ref === '') return null;
    const id = itemId(it.type, it.ref);
    const had = p.items.find((x) => x.id === id);
    if (had) { if (it.name && had.name !== cap(it.name, 120)) { had.name = cap(it.name, 120); p.updated = at; } return null; }
    const x = { id, type: it.type, ref: String(it.ref), name: cap(it.name || '', 120), at: it.at || at };
    p.items.push(x);
    p.updated = at;
    return x;
  }
  function removeItem(p, type, ref, at = Date.now()) {
    const id = itemId(type, ref);
    const i = p.items.findIndex((x) => x.id === id);
    if (i < 0) return false;
    p.items.splice(i, 1);
    if (p.cover === id) p.cover = null;
    p.updated = at;
    return true;
  }
  const has = (p, type, ref) => p.items.some((x) => x.id === itemId(type, ref));
  function rename(p, name, at = Date.now()) { const nm = cap(name, 48); if (!nm || nm === p.name) return false; p.name = nm; p.updated = at; return true; }
  function setStatus(p, st, at = Date.now()) { if (!STATUS[st] || p.status === st) return false; p.status = st; p.updated = at; return true; }
  function setNotes(p, text, at = Date.now()) { const t = String(text ?? '').replace(/\r/g, '').slice(0, 4000); if (t === p.notes) return false; p.notes = t; p.updated = at; return true; }
  function setCover(p, id, at = Date.now()) { const v = id && p.items.some((x) => x.id === id) ? id : null; if (v === p.cover) return false; p.cover = v; p.updated = at; return true; }
  // a color and mark by hand: the next one in the palette / the marks (ci, gi), else the one given
  function setIdent(p, { ci = p.ident.ci, gi = p.ident.gi } = {}, at = Date.now()) {
    const nx = MC.identOf(((ci % MC.PALETTE.length) + MC.PALETTE.length) % MC.PALETTE.length, ((gi % MC.GLYPHS.length) + MC.GLYPHS.length) % MC.GLYPHS.length);
    if (nx.ci === p.ident.ci && nx.gi === p.ident.gi) return false;
    p.ident = nx; p.updated = at;
    return true;
  }
  const live = (list) => list.filter((p) => p.status !== 'archived');
  const ofItem = (list, type, ref) => list.filter((p) => has(p, type, ref));
  const counts = (p) => { const c = {}; for (const x of p.items) c[x.type] = (c[x.type] || 0) + 1; return c; };
  const countText = (p, order = Object.keys(TYPES)) => { const c = counts(p); return order.filter((t) => c[t]).map((t) => plural(c[t], t)).join(' · ') || 'empty'; };

  // what the kv store holds, cleaned: unknown fields kept (a newer Hearth on the other computer), broken rows dropped
  // Project items are references, not repeated occurrences. Only collapse identical records;
  // two entries with differing metadata stay available for review/recovery.
  function compact(d, { identities = false } = {}) {
    if (d?.v !== 1 || !Array.isArray(d.list)) return d;
    const canonical = x => Array.isArray(x) ? x.map(canonical) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canonical(x[k])])) : x;
    let changed = false;
    const list = d.list.map(p => {
      if (!p?.ident || !Array.isArray(p.items)) return p;
      const seen = new Set(), items = []; let altered = false;
      for (const original of p.items) {
        if (!original || !TYPES[original.type] || typeof original.ref !== 'string' || typeof original.id !== 'string') { items.push(original); continue; }
        const id = identities ? itemId(original.type, original.ref) : original.id;
        const item = id === original.id ? original : { ...original, id };
        const signature = JSON.stringify(canonical(item));
        if (seen.has(signature)) { altered = true; continue; }
        seen.add(signature); items.push(item); if (item !== original) altered = true;
      }
      if (!altered) return p;
      changed = true; return { ...p, items };
    });
    return changed ? { ...d, list } : d;
  }
  function normalize(d) {
    d = compact(d, { identities: true });
    const list = Array.isArray(d?.list) ? d.list.filter((p) => p && typeof p.id === 'string' && p.ident && Array.isArray(p.items)) : [];
    for (const p of list) {
      p.items = p.items.filter((x) => x && TYPES[x.type] && x.ref != null).map((x) => ({ ...x, id: itemId(x.type, x.ref) }));
      if (!STATUS[p.status]) p.status = 'active';
      p.name = cap(p.name || 'Project', 48);
      p.notes = typeof p.notes === 'string' ? p.notes : '';
    }
    return { v: 1, list, dismissed: Array.isArray(d?.dismissed) ? d.dismissed.filter((x) => typeof x === 'string').slice(-200) : [] };
  }
  // newest first: what was opened or changed last
  const recent = (list) => list.slice().sort((a, b) => Math.max(b.updated || 0, b.opened || 0) - Math.max(a.updated || 0, a.opened || 0));

  // ---------- covers and "continue where you left off" ----------
  // look: { thumb(item) → url | null, time(item) → ms | 0 }. A cover chosen by hand first, then the latest render or
  // still, then the latest scene's thumbnail, a board's cover, a chat's scene still.
  const COVER_ORDER = ['render', 'capture', 'scene', 'seq', 'board', 'chat', 'download', 'file'];
  function cover(p, look) {
    const pick = p.cover && p.items.find((x) => x.id === p.cover);
    if (pick) { const u = look.thumb(pick); if (u) return u; }
    for (const t of COVER_ORDER) {
      const xs = p.items.filter((x) => x.type === t).sort((a, b) => (look.time(b) || b.at) - (look.time(a) || a.at));
      for (const x of xs.slice(0, 6)) { const u = look.thumb(x); if (u) return u; }
    }
    return null;
  }
  function latest(p, types, timeOf = () => 0) {
    const ts = [].concat(types);
    let best = null; let bt = -1;
    for (const x of p.items) { if (!ts.includes(x.type)) continue; const t = timeOf(x) || x.at || 0; if (t > bt) { bt = t; best = x; } }
    return best;
  }

  // ---------- suggestions (no tokens: names, links, timing) ----------
  // things: [{ type, ref, name, at, links?: ['scene:s1', …] }]; taken: Set of item ids already in a project;
  // dismissed: keys the owner said no to. → [{ key, name, things, score, why }]
  const STOP = new Set('a an and the of to in on at for with from by my our your is it its this that new copy untitled draft test final v1 v2 v3 one two'.split(' '));
  const GENERIC = new Set('chat chats lab labs scene scenes sketch sketches orb starter video videos render renders board boards room rooms jam part parts make makes recording recordings screenshot screenshots shot shots capture captures still stills frame frames hearth claude astra codex director three threejs three.js sequence sequences project projects file files index html page site deploy loop loops reels square story feed youtube shorts tiktok master export exports clip clips song music audio image images picture'.split(' '));
  function words(name) {
    return String(name || '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[·|_\-–—/\\.,:;!?()[\]{}"“”'’+#@*&]/g, ' ')
      .split(/\s+/).filter((w) => w.length >= 3 && !/^\d+[a-z]{0,2}$/.test(w) && !STOP.has(w) && !GENERIC.has(w) && !/^\d{4}$/.test(w));
  }
  // bigrams of neighbouring words, then single words of 4+ letters
  function keysOf(name) {
    const w = words(name);
    const out = new Set();
    for (let i = 0; i + 1 < w.length; i += 1) if (w[i] !== w[i + 1]) out.add(`${w[i]} ${w[i + 1]}`);
    for (const x of w) if (x.length >= 4) out.add(x);
    return out;
  }
  const titleCase = (s) => s.replace(/\b\p{L}/gu, (m) => m.toUpperCase());
  const DAY = 864e5;
  function suggest(things, { taken = new Set(), dismissed = new Set(), max = 4, now = Date.now() } = {}) {
    const free = things.filter((t) => !taken.has(itemId(t.type, t.ref)));
    const byId = new Map(free.map((t) => [itemId(t.type, t.ref), t]));
    const keyed = new Map(); // key → Set of thing ids
    for (const t of free) for (const k of keysOf(t.name)) { if (!keyed.has(k)) keyed.set(k, new Set()); keyed.get(k).add(itemId(t.type, t.ref)); }
    // bigrams first, then the biggest groups
    const keys = [...keyed.keys()].filter((k) => !dismissed.has(k) && keyed.get(k).size >= 2)
      .sort((a, b) => (b.includes(' ') - a.includes(' ')) || keyed.get(b).size - keyed.get(a).size || a.localeCompare(b));
    const used = new Set();
    const out = [];
    for (const k of keys) {
      const ids = [...keyed.get(k)].filter((id) => !used.has(id));
      // linked things join (a chat's scene, a board linked to the chat), when they're free
      for (const id of [...ids]) for (const l of byId.get(id)?.links || []) if (byId.has(l) && !used.has(l) && !ids.includes(l)) ids.push(l);
      // timing: things far from the group's newest (more than 60 days before) stay out, unless the name is exact
      const newest = Math.max(...ids.map((id) => byId.get(id).at || 0));
      const kept = ids.filter((id) => (byId.get(id).at || 0) >= newest - 60 * DAY || keysOf(byId.get(id).name).has(k));
      const types = new Set(kept.map((id) => byId.get(id).type));
      if (kept.length < 3 || (types.size < 2 && kept.length < 4)) continue;
      const times = kept.map((id) => byId.get(id).at || 0);
      const span = Math.max(...times) - Math.min(...times);
      const score = kept.length + 2 * (types.size - 1) + (span < 3 * DAY ? 2 : span < 14 * DAY ? 1 : 0) + (now - newest < 7 * DAY ? 1 : 0) + (k.includes(' ') ? 1 : 0);
      for (const id of kept) used.add(id);
      const list = kept.map((id) => byId.get(id)).sort((a, b) => (b.at || 0) - (a.at || 0));
      const c = {}; for (const t of list) c[t.type] = (c[t.type] || 0) + 1;
      const parts = Object.keys(TYPES).filter((t) => c[t]).map((t) => plural(c[t], t));
      const why = `${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]} are about “${titleCase(k)}”`;
      out.push({ key: k, name: cap(titleCase(k), 48), things: list, score, why });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, max);
  }

  // ---------- search ----------
  // docs: [{ type, ref, title, sub?, body?, at? }] (body: lower-cased text: code, captions, messages); q: words. Every
  // word must be in the title or the body; a title hit counts most, a word that starts a title word next, recent last.
  function tokens(q) { return String(q || '').toLowerCase().split(/\s+/).map((w) => w.trim()).filter(Boolean).slice(0, 8); }
  function scoreOf(ws, d, now = Date.now()) {
    const t = d._t ||= String(d.title || '').toLowerCase();
    const b = d.body ? String(d.body) : '';
    const s2 = d._s ||= String(d.sub || '').toLowerCase();
    let s = 0;
    for (const w of ws) {
      const i = t.indexOf(w);
      if (i >= 0) { s += 10 + (i === 0 || /[\s·\-_/]/.test(t[i - 1]) ? 6 : 0) + (t === w || t === `/${w}` ? 8 : 0); continue; }
      if (s2.includes(w)) { s += 5; continue; }
      if (b.includes(w)) { s += 3; continue; }
      return 0;
    }
    const age = now - (d.at || 0);
    return s + (age < DAY ? 3 : age < 7 * DAY ? 2 : age < 30 * DAY ? 1 : 0);
  }
  function search(q, docs, { type = null, limit = 60, now = Date.now() } = {}) {
    const ws = tokens(q);
    if (!ws.length) return [];
    const out = [];
    for (const d of docs) {
      if (type && d.type !== type) continue;
      const s = scoreOf(ws, d, now);
      if (s > 0) out.push({ d, s });
    }
    return out.sort((a, b) => b.s - a.s || (b.d.at || 0) - (a.d.at || 0)).slice(0, limit).map((x) => ({ ...x.d, score: x.s }));
  }
  // where the first word sits in a long text: a short line around it
  function snippet(text, q, n = 90) {
    const s = String(text || '');
    const w = tokens(q)[0];
    if (!w) return cap(s, n);
    const i = s.toLowerCase().indexOf(w);
    if (i < 0) return cap(s, n);
    const from = Math.max(0, i - 30);
    return `${from ? '…' : ''}${cap(s.slice(from, from + n).replace(/\s+/g, ' '), n)}`;
  }
  // named sliders a scene declares: tweak({ speed: […], glow: {…} }) → ['speed', 'glow']
  function sliderNames(code) {
    const out = [];
    const re = /tweak\(\s*\{([\s\S]{0,1500}?)\}\s*\)/g;
    let m;
    while ((m = re.exec(String(code || ''))) && out.length < 40) for (const k of m[1].matchAll(/(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*:/g)) if (!out.includes(k[1]) && !['value', 'min', 'max', 'step', 'onChange', 'label'].includes(k[1])) out.push(k[1]);
    return out;
  }

  return { TYPES, STATUS, MC, cap, itemId, plural, newId, create, addItem, removeItem, has, rename, setStatus, setNotes, setCover, setIdent, live, ofItem, counts, countText, compact, normalize, recent, cover, latest, words, keysOf, suggest, tokens, search, snippet, sliderNames, titleCase };
})();
if (typeof module !== 'undefined') module.exports = ProjectsCore;
