// (round 92, findmem92) TEST ONLY: projfind-core.js exactly as round 91 left it (7968a7b), the old path dev/findmem92-test.js proves the lean index against. Never loaded by the app.
// Find in this project (round 81, projsearch81): the index and its ranking. Pure (no DOM, no Electron): it runs on the
// store thread (storework.js op `projfind`), in the main process only when there is no thread (Node tests / tools), and
// in dev/projsearch81-test.js. Nothing here reaches an AI: words are matched against the project's own things.
//
// A project's things are SOURCES, each indexed on its own and kept until it changes:
//   chat:<id>          a chat file: its title and every message (who said it, when, its place k in the chat)
//   scene:<id>         a Lab scene in kv/three-sketches.json: its name, each layer's name and each layer's code
//   board:<id>         a moodboard (kv/board-<id>.json): its name and every item's words (notes, captions, links…)
//   worktable:<pid>    the project's worktable (kv/workbench-<pid>.json): storyboard titles / notes, prompts, names
//   notes:<pid>        the project's notes and description (handed over by the window: it may hold unsaved typing)
//   items:<pid>        the names of its files, captures, renders, downloads, deploys (handed over by the window)
// A file source is known by its size + modified time (sig): a save on this computer (the store thread marks it, stale())
// or an arrival from the other computer (a new time on disk) re-indexes only that source, the next time the project is
// looked at. The Lab's scenes share one big file: when it changes it is read once and only the scenes whose words
// changed are indexed again. ensure() works in slices (budgetMs) so a save asked meanwhile never waits long.
//
// Each source holds docs ({ g: group, w: weight, text, title, at, …where it opens }) and an inverted index (word → doc
// numbers). A query word matches a word of the doc exactly (3), as its start (2) or inside it (1, three letters or
// more: "standard" finds MeshStandardMaterial). Every word must match (AND). Score = the words' best matches × the
// doc's weight (a scene's / layer's / file's name above its code, a chat title above a message) + the whole phrase
// found + a little for recent. Accents and case don't matter (café = CAFE), offsets stay those of the original text.
(function (root, make) { if (typeof module === 'object' && module.exports) module.exports = make(); else root.ProjFindCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const GROUPS = [
    { id: 'chat', label: 'Messages', icon: '✳' },
    { id: 'note', label: 'Notes', icon: '✎' },
    { id: 'worktable', label: 'Worktable', icon: '▧' },
    { id: 'scene', label: 'Scenes', icon: '◭' },
    { id: 'board', label: 'Boards', icon: '▦' },
    { id: 'file', label: 'Files', icon: '▭' },
  ];
  const W = { chatTitle: 1.3, msg: 1, note: 1.2, worktable: 1.1, sceneName: 1.6, layerName: 1.4, code: 0.7, boardName: 1.4, boardItem: 1.1, file: 1.3 };
  const HEAD = 24; // a doc's first characters kept folded: "starts with the words" without folding its whole text
  const MSG_CAP = 6000; // characters of one message kept (a pasted log rarely matters past that)
  const CODE_CAP = 60000;
  const FILE_TYPES = { file: 'File', capture: 'Capture', render: 'Render', download: 'Download', deploy: 'Deploy' };
  const BOARD_KEYS = ['title', 'caption', 'text', 'name', 'url', 'note', 'label', 'alt', 'prompt'];
  const WT_KEYS = new Set(['title', 'notes', 'note', 'prompt', 'name', 'text', 'description', 'label', 'caption', 'lyrics', 'tagline']);
  const WT_FEATURE = { storyboard: 'story', drawing: 'draw', texture: 'texture', pattern: 'pattern' };

  // ---------- words ----------
  // lowercase without accents, one character for one character (offsets in the folded text are offsets in the original)
  const foldMemo = new Map();
  function foldChar(c) {
    let f = foldMemo.get(c);
    if (f === undefined) {
      f = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (f.length !== 1) f = f.length > 1 && c.length === 1 ? f[0] : c.toLowerCase().length === 1 ? c.toLowerCase() : c;
      if (foldMemo.size < 4096) foldMemo.set(c, f);
    }
    return f;
  }
  function fold(s) {
    s = String(s ?? '');
    const low = s.toLowerCase();
    // eslint-disable-next-line no-control-regex
    if (low.length === s.length) return /[^\x00-\x7f]/.test(low) ? low.replace(/[^\x00-\x7f]/g, foldChar) : low;
    let out = ''; // (a rare character whose lowercase is two: İ)
    for (let i = 0; i < s.length; i++) out += s.charCodeAt(i) < 128 ? s[i].toLowerCase() : foldChar(s[i]);
    return out;
  }
  const WORD = /[\p{L}\p{N}_]+/gu;
  function tokens(text) {
    const set = new Set();
    for (const t of fold(text).match(WORD) || []) if (t.length >= 2 && t.length <= 40) set.add(t);
    return set;
  }
  // the words of a query (one-letter words dropped unless that is all there is)
  function words(q) {
    const all = (fold(q).match(WORD) || []).filter((w) => w.length <= 40);
    const long = all.filter((w) => w.length >= 2 || /\d/.test(w));
    return [...new Set(long.length ? long : all)];
  }
  const cap = (s, n) => { const t = String(s ?? ''); return t.length > n ? t.slice(0, n) : t; };
  // a short, stable fingerprint of a text (the window's notes / names: re-indexed only when they change)
  function hash(s) { let h = 2166136261 >>> 0; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return `${s.length}:${h.toString(36)}`; }

  // ---------- the docs of each kind of source ----------
  // (round 82, bigchat82) one message's doc (null: nothing to find in it); a giant chat's are made as its messages are read
  function msgDoc(m, k, title, at, ref) {
    const t = typeof m?.text === 'string' ? m.text : '';
    if (!t.trim() || (m.role !== 'user' && m.role !== 'assistant')) return null;
    return { g: 'chat', w: W.msg + (m.role === 'user' ? 0.1 : 0), text: cap(t, MSG_CAP), title, at: m.at || at || 0, ref, k, who: m.role === 'user' ? 'you' : 'ai' };
  }
  const titleDoc = (chat, title) => ({ g: 'chat', w: W.chatTitle, text: title, title, at: chat.updatedAt || 0, ref: chat.id, k: null, what: 'title' });
  function chatDocs(chat) {
    const out = [];
    if (!chat || typeof chat !== 'object') return out;
    const title = cap(chat.title || 'Chat', 200);
    out.push(titleDoc(chat, title));
    const ms = Array.isArray(chat.messages) ? chat.messages : [];
    for (let k = 0; k < ms.length; k++) { const d = msgDoc(ms[k], k, title, chat.updatedAt, chat.id); if (d) out.push(d); }
    return out;
  }
  // what a scene's words are, compared before indexing it again (a Lab save that only moved a slider changes nothing here)
  const sceneSig = (s) => hash(JSON.stringify([s.name || '', ...(Array.isArray(s.layers) && s.layers.length ? s.layers : [{ id: 'main', name: 'main', code: s.code }]).map((l) => [l.id, l.name || '', String(l.code || '').length, hash(cap(l.code, CODE_CAP))])]));
  function sceneDocs(s) {
    const out = [];
    if (!s || typeof s !== 'object') return out;
    const name = cap(s.name || 'Scene', 200);
    out.push({ g: 'scene', w: W.sceneName, text: name, title: name, at: s.updatedAt || 0, ref: s.id, what: 'scene' });
    const layers = Array.isArray(s.layers) && s.layers.length ? s.layers : [{ id: 'main', name: 'main', code: s.code }];
    for (const l of layers) {
      if (!l) continue;
      const ln = cap(l.name || l.id || 'layer', 200);
      out.push({ g: 'scene', w: W.layerName, text: ln, title: name, at: s.updatedAt || 0, ref: s.id, layer: l.id, layerName: ln, what: 'layer' });
      if (typeof l.code === 'string' && l.code.trim()) out.push({ g: 'scene', w: W.code, text: cap(l.code, CODE_CAP), title: name, at: s.updatedAt || 0, ref: s.id, layer: l.id, layerName: ln, what: 'code' });
    }
    return out;
  }
  function boardDocs(b) {
    const out = [];
    if (!b || typeof b !== 'object') return out;
    const name = cap(b.name || 'Board', 200);
    out.push({ g: 'board', w: W.boardName, text: name, title: name, at: b.updated || 0, ref: b.id, item: null });
    for (const it of Array.isArray(b.items) ? b.items : []) {
      if (!it || typeof it !== 'object') continue;
      const parts = BOARD_KEYS.map((k) => (typeof it[k] === 'string' && !/^data:/.test(it[k]) ? it[k] : '')).filter((x) => x.trim());
      if (!parts.length) continue;
      out.push({ g: 'board', w: W.boardItem, text: cap(parts.join(' · '), 4000), title: name, at: it.added || b.updated || 0, ref: b.id, item: it.id, type: it.type || '' });
    }
    return out;
  }
  // the worktable's words: only fields people write (titles, notes, prompts, names), never pictures / patches / strokes
  function worktableDocs(v, pid) {
    const out = [];
    const walk = (x, pathParts, depth) => {
      if (depth > 6 || x == null || out.length > 400) return;
      if (Array.isArray(x)) { x.slice(0, 200).forEach((y, i) => walk(y, [...pathParts, i], depth + 1)); return; }
      if (typeof x !== 'object') return;
      for (const [k, y] of Object.entries(x)) {
        if (typeof y === 'string') {
          if (!WT_KEYS.has(k) || !y.trim() || y.length > 4000 || /^data:/.test(y)) continue;
          const p = [...pathParts, k];
          out.push({ g: 'worktable', w: W.worktable, text: y, title: wtTitle(p), at: 0, ref: pid, path: p.join('.'), feature: WT_FEATURE[p[0]] || 'studio' });
        } else if (y && typeof y === 'object' && !['strokes', 'points', 'cells', 'currentPatch', 'patch', 'jobs'].includes(k)) walk(y, [...pathParts, k], depth + 1);
      }
    };
    walk(v, [], 0);
    return out;
  }
  function wtTitle(p) {
    if (p[0] === 'storyboard') return typeof p[2] === 'number' ? `Storyboard · panel ${p[2] + 1}` : 'Storyboard';
    if (p[0] === 'drawing') return 'Drawing';
    if (p[0] === 'shelf') return 'Worktable shelf';
    if (p[0] === 'game') return 'Game level';
    return p.length === 1 ? 'Worktable' : `Worktable · ${p[0]}`;
  }
  function notesDocs(notes, description, pid) {
    const out = [];
    if (String(notes || '').trim()) out.push({ g: 'note', w: W.note, text: cap(notes, 8000), title: 'Project notes', at: 0, ref: pid, field: 'notes' });
    if (String(description || '').trim()) out.push({ g: 'note', w: W.note, text: cap(description, 2000), title: 'Description', at: 0, ref: pid, field: 'description' });
    return out;
  }
  function itemDocs(items) {
    const out = [];
    for (const x of Array.isArray(items) ? items : []) {
      if (!x || !FILE_TYPES[x.type]) continue;
      const name = String(x.name || String(x.ref || '').split(/[\\/]/).pop() || '');
      if (!name.trim()) continue;
      out.push({ g: 'file', w: W.file, text: cap(name, 400), title: name, at: x.at || 0, ref: String(x.ref), type: x.type, kindLabel: FILE_TYPES[x.type] });
    }
    return out;
  }

  // ---------- the index ----------
  function createIndex({ maxChars = 48e6 } = {}) {
    const src = new Map(); // key → { sig, docs, inv: Map(word → [doc n]), words: string[], chars, used }
    const scenes = { fileSig: null, file: null, parsed: null, parsedSig: null, reading: null }; // the Lab's one file (kept parsed only while scenes wait; reading: in slices, bigchat82)
    let chars = 0;
    // a source's docs and words, built doc by doc (a giant chat's over several slices: bigchat82)
    const builder = () => ({ docs: [], inv: new Map(), chars: 0 });
    function addDoc(b, d) { addPart(b, d, 0, d.text.length); }
    // (round 82) a long doc (a layer's 60,000 characters of code) in parts cut at a line / space, a slice each
    function addPart(b, d, from, to) {
      let i = b.docs.length - 1;
      if (from === 0) { i = b.docs.length; b.docs.push(d); b.chars += d.text.length; d.head = fold(d.text.slice(0, HEAD)); }
      for (const t of tokens(from === 0 && to >= d.text.length ? d.text : d.text.slice(from, to))) { const a = b.inv.get(t); if (!a) b.inv.set(t, [i]); else if (a[a.length - 1] !== i) a.push(i); }
    }
    const PART = 6000;
    const partEnd = (text, from) => { if (text.length - from <= PART * 1.5) return text.length; const nl = text.lastIndexOf('\n', from + PART); if (nl > from + PART / 2) return nl + 1; const sp = text.lastIndexOf(' ', from + PART); return sp > from + PART / 2 ? sp + 1 : from + PART; };
    function install(key, sig, b, now) { drop(key); src.set(key, { sig, docs: b.docs, inv: b.inv, words: [...b.inv.keys()], chars: b.chars, used: now }); chars += b.chars; }
    function put(key, sig, docs, now = Date.now()) { const b = builder(); for (const d of docs) addDoc(b, d); install(key, sig, b, now); }
    // (round 82, bigchat82) sources being built, a slice at a time: key → { sig, b (builder), docs + i (words still to
    // index) | r (a bigchat-core reader: a long chat still being read), extra (fields the source gets once installed) }.
    // The source as it was stays searchable until the new one is whole
    const building = new Map();
    function drop(key) { const s = src.get(key); if (s) { chars -= s.chars; src.delete(key); } }
    // a file saved here: the source(s) it feeds are looked at again next time (by the store thread, right after the write)
    function stale(file) {
      const f = String(file || '');
      for (const s of src.values()) if (s.file === f) { s.sig = null; s.fileSig = null; }
      if (scenes.file === f) { scenes.fileSig = null; scenes.parsed = null; scenes.parsedSig = null; scenes.reading = null; }
    }
    // the sources a project is made of: [{ key, kind, file?, id?, inline? }]
    function plan(spec, dirs, join) {
      const out = [];
      const ok = (id) => typeof id === 'string' && /^[\w-]{1,80}$/.test(id);
      const uniq = (a) => [...new Set((Array.isArray(a) ? a : []).filter(ok))];
      for (const id of uniq(spec.chats)) out.push({ key: `chat:${id}`, kind: 'chat', id, file: join(dirs.chats, `${id}.json`) });
      for (const id of uniq(spec.scenes)) out.push({ key: `scene:${id}`, kind: 'scene', id, file: join(dirs.kv, 'three-sketches.json') });
      for (const id of uniq(spec.boards)) out.push({ key: `board:${id}`, kind: 'board', id, file: join(dirs.kv, `board-${id}.json`) });
      if (ok(spec.pid)) {
        out.push({ key: `worktable:${spec.pid}`, kind: 'worktable', id: spec.pid, file: join(dirs.kv, `workbench-${spec.pid}.json`) });
        out.push({ key: `notes:${spec.pid}`, kind: 'notes', id: spec.pid, inline: true });
        out.push({ key: `items:${spec.pid}`, kind: 'items', id: spec.pid, inline: true });
      }
      return out;
    }
    // index what changed, within the budget: → { left, built, ms }. env: { stat(file) → { size, mtimeMs } | null,
    // read(file) → value | null (a file that can't be read: nothing indexed from it this time), now(), big? }
    // (round 82, bigchat82) every source is built DOC BY DOC (its words), so no slice runs long because one source is
    // big: a 900-message chat's words, a scene's 60,000 characters of code. With env.big ({ min, open(file, onItem, o) }:
    // bigchat-core.js readers), a chat file from big.min up and the Lab's scenes file are also READ in slices: their bytes
    // cut, one message / scene parsed at a time. What a source was stays searchable until its new version is whole.
    function ensure(spec, dirs, env, { budgetMs = 12 } = {}) {
      const t0 = env.now();
      const list = plan(spec, dirs, env.join);
      let left = 0; let built = 0; let did = false;
      const soft = budgetMs * 0.7; // (a little kept for the step it is in)
      const over = () => did && env.now() - t0 > soft; // (at least one step each call: it always moves on)
      const sigOf = (st) => (st ? `${st.size}:${st.mtimeMs}` : 'none');
      // a source's words, doc by doc → true once installed
      const work = (key, job) => {
        while (job.i < job.docs.length) {
          if (over()) return false;
          const d = job.docs[job.i]; const from = job.off || 0; const to = partEnd(d.text, from);
          addPart(job.b, d, from, to); did = true;
          if (to >= d.text.length) { job.i += 1; job.off = 0; } else job.off = to;
        }
        install(key, job.sig, job.b, env.now()); Object.assign(src.get(key), job.extra);
        building.delete(key); built += 1; did = true;
        return true;
      };
      const queue = (key, sig, docs, extra) => { const job = { sig, docs, i: 0, b: builder(), extra }; building.set(key, job); return job; };
      const parsedScenes = (v) => (Array.isArray(v) ? new Map(v.filter((sc) => sc && typeof sc === 'object' && sc.id).map((sc) => [sc.id, sc])) : null);
      // the scenes' file: read once (a slice at a time) if any scene it holds is wanted and older than the file
      const wantScenes = list.filter((x) => x.kind === 'scene');
      if (wantScenes.length) {
        const fsig = sigOf(env.stat(wantScenes[0].file));
        scenes.file = wantScenes[0].file;
        if (fsig !== scenes.fileSig || wantScenes.some((x) => !src.has(x.key))) {
          const todo = wantScenes.filter((x) => src.get(x.key)?.fileSig !== fsig);
          if (todo.length) {
            if (scenes.parsedSig !== fsig) {
              if (over()) left += todo.length;
              else if (env.big) {
                if (!scenes.reading || scenes.reading.sig !== fsig) {
                  const got = new Map(); const ids = new Set(wantScenes.map((x) => x.id));
                  scenes.reading = { sig: fsig, got, r: env.big.open(wantScenes[0].file, (sc) => { if (sc && typeof sc === 'object' && ids.has(sc.id)) got.set(sc.id, sc); }, { array: true }) };
                }
                did = true; const state = scenes.reading.r.step(over);
                if (state === 'done') { scenes.parsed = scenes.reading.got; scenes.parsedSig = fsig; scenes.reading = null; } else if (state !== 'more') {
                  scenes.reading = null;
                  if (state === 'bad') { scenes.parsed = parsedScenes(env.read(wantScenes[0].file)); scenes.parsedSig = scenes.parsed ? fsig : null; }
                }
                if (scenes.parsedSig !== fsig) left += todo.length;
              } else {
                scenes.parsed = parsedScenes(env.read(wantScenes[0].file)); did = true;
                scenes.parsedSig = scenes.parsed ? fsig : null;
              }
            }
            if (scenes.parsedSig === fsig) {
              for (const x of todo) {
                const job = building.get(x.key);
                if (job && job.extra?.fileSig === fsig) { if (!work(x.key, job)) left += 1; continue; }
                if (over()) { left += 1; continue; }
                const sc = scenes.parsed.get(x.id);
                const ssig = sc ? sceneSig(sc) : 'gone';
                const had = src.get(x.key);
                if (had && had.sceneSig === ssig) { had.fileSig = fsig; had.used = env.now(); building.delete(x.key); continue; } // its words didn't change
                if (!work(x.key, queue(x.key, null, sc ? sceneDocs(sc) : [], { fileSig: fsig, sceneSig: ssig, file: x.file }))) left += 1;
              }
            }
          }
          if (!left) { scenes.fileSig = fsig; scenes.parsed = null; scenes.parsedSig = null; } // all caught up: the parsed copy let go
        }
      }
      for (const x of list) {
        if (x.kind === 'scene') continue;
        let sig;
        if (x.kind === 'notes') sig = `${spec.notes || ''}\u0001${spec.description || ''}`; // (the text itself: comparing it is cheaper than hashing it)
        else if (x.kind === 'items') sig = JSON.stringify((spec.items || []).map((i) => [i.type, i.ref, i.name]));
        else sig = sigOf(env.stat(x.file));
        const had = src.get(x.key);
        if (had && had.sig === sig) { had.used = env.now(); building.delete(x.key); continue; }
        let job = building.get(x.key);
        if (job && job.sig !== sig) { building.delete(x.key); job = null; }
        if (job && !job.r) { if (!work(x.key, job)) left += 1; continue; } // its words, going on
        if (!job && over()) { left += 1; continue; }
        if (x.kind === 'notes') { if (!work(x.key, queue(x.key, sig, notesDocs(spec.notes, spec.description, x.id), { file: null }))) left += 1; continue; }
        if (x.kind === 'items') { if (!work(x.key, queue(x.key, sig, itemDocs(spec.items), { file: null }))) left += 1; continue; }
        if (sig === 'none') { if (!work(x.key, queue(x.key, sig, [], { file: x.file }))) left += 1; continue; }
        if (x.kind === 'chat' && env.big && Number(sig.split(':')[0]) >= env.big.min) { // (round 82, bigchat82) a long chat: read in slices
          if (!job) {
            const b = builder(); const ref = x.id;
            job = { sig, b, r: env.big.open(x.file, (m, k) => { const d = msgDoc(m, k, '', 0, ref); if (d) addDoc(b, d); }), extra: { file: x.file } };
            building.set(x.key, job);
          }
          if (over()) { left += 1; continue; }
          did = true; // (the step reads at least once whatever over() says: it always moves on)
          const state = job.r.step(over);
          if (state === 'more' || state === 'changed') { if (state === 'changed') building.delete(x.key); left += 1; continue; }
          building.delete(x.key);
          if (state === 'done') {
            const h = job.r.head || {}; const title = cap(h.title || 'Chat', 200);
            for (const d of job.b.docs) { d.title = title; if (!d.at) d.at = h.updatedAt || 0; }
            addDoc(job.b, titleDoc({ ...h, id: x.id }, title));
            install(x.key, sig, job.b, env.now()); src.get(x.key).file = x.file;
            built += 1;
            continue;
          }
          const v = env.read(x.file); // (not a chat the cut can read: whole, as before)
          if (v == null) continue;
          if (!work(x.key, queue(x.key, sig, chatDocs(v), { file: x.file }))) left += 1;
          continue;
        }
        const v = env.read(x.file);
        did = true;
        if (v == null) continue; // unreadable right now (held, cut short): kept as it was, tried next time
        if (!work(x.key, queue(x.key, sig, x.kind === 'chat' ? chatDocs(v) : x.kind === 'board' ? boardDocs(v) : worktableDocs(v, x.id), { file: x.file }))) left += 1;
      }
      return { left, built, ms: Math.round((env.now() - t0) * 10) / 10 };
    }
    // let go of what wasn't asked for in a while, and of the oldest past the size cap (never the project being asked)
    function sweep(now, { idleMs = 15 * 60000, keep = new Set() } = {}) {
      for (const k of building.keys()) if (!keep.has(k)) building.delete(k); // (round 82) a giant chat half read for another project: let go
      for (const [k, s] of src) if (!keep.has(k) && now - s.used > idleMs) drop(k);
      if (chars <= maxChars) return;
      for (const [k] of [...src].filter(([k2]) => !keep.has(k2)).sort((a, b) => a[1].used - b[1].used)) { drop(k); if (chars <= maxChars) break; }
    }
    // → { groups: [{ id, label, icon, total, hits }], words, total }
    function query(spec, dirs, q, { limit = 20, now = Date.now(), join = (a, b) => `${a}/${b}` } = {}) {
      const ws = words(q);
      const groups = GROUPS.map((g) => ({ ...g, total: 0, hits: [] }));
      if (!ws.length) return { groups: groups.filter((g) => g.total), words: ws, total: 0 };
      const phrase = fold(String(q).trim().replace(/\s+/g, ' '));
      const keys = plan(spec, dirs, join).map((x) => x.key);
      // scored in two steps: every match by its words, its start and its age, as the docs are met (no copy of their text,
      // only the best CAND of each kind kept); then those read whole for the phrase bonus and the snippet. A common word
      // in a big project matches thousands of messages: folding each one's whole text was most of a query's time.
      const CAND = ws.length > 1 ? Math.max(limit * 10, 200) : limit;
      const per = new Map(groups.map((g) => [g.id, { g, top: [] }]));
      const byScore = (a, b) => b.score - a.score || (b.d.at || 0) - (a.d.at || 0);
      const day30 = 30 * 864e5;
      for (const key of keys) {
        const s = src.get(key);
        if (!s || !s.docs.length) continue;
        s.used = now;
        // each word → the docs it matches, with how well (exact 3 / start 2 / inside 1); sums kept per doc in a typed
        // array (a doc missing one word drops to 0)
        const nd = s.docs.length;
        let acc = null; let alive = 0;
        for (const w of ws) {
          const best = new Uint8Array(nd); let any = false;
          const exact = s.inv.get(w);
          if (exact) { for (const i of exact) best[i] = 3; any = true; }
          for (const t of s.words) {
            if (t === w || t.length < w.length) continue;
            const how = t.startsWith(w) ? 2 : w.length >= 3 && t.includes(w) ? 1 : 0;
            if (!how) continue;
            any = true;
            for (const i of s.inv.get(t)) if (best[i] < how) best[i] = how;
          }
          if (!any) { acc = null; break; }
          if (!acc) { acc = new Uint16Array(best); alive = 1; } else { alive = 0; for (let i = 0; i < nd; i++) { if (!acc[i]) continue; if (best[i]) { acc[i] += best[i]; alive = 1; } else acc[i] = 0; } }
          if (!alive) break;
        }
        if (!acc || !alive) continue;
        for (let i = 0; i < nd; i++) {
          if (!acc[i]) continue;
          const d = s.docs[i];
          let score = acc[i] * d.w;
          if (d.what !== 'code' && (phrase.length <= HEAD ? d.head.startsWith(phrase) : fold(d.text.slice(0, phrase.length)) === phrase)) score += 1;
          if (d.at) score += 0.5 * Math.exp(-Math.max(0, now - d.at) / day30);
          const P = per.get(d.g);
          P.g.total += 1;
          const top = P.top;
          const f = { d, score };
          if (top.length === CAND && byScore(f, top[CAND - 1]) >= 0) continue;
          let lo = 0; let hi = top.length;
          while (lo < hi) { const mid = (lo + hi) >> 1; if (byScore(f, top[mid]) < 0) hi = mid; else lo = mid + 1; }
          top.splice(lo, 0, f);
          if (top.length > CAND) top.pop();
        }
      }
      for (const { g, top } of per.values()) {
        if (!top.length) continue;
        for (const f of top) { f.low = f.d.what === 'code' ? (f.d.low ||= fold(f.d.text)) : fold(f.d.text); if (ws.length > 1 && f.low.includes(phrase)) f.score += 2 * f.d.w; }
        if (ws.length > 1) top.sort(byScore);
        g.hits = top.slice(0, limit).map((f) => hitOf(f.d, f.low, ws, phrase, Math.round(f.score * 1000) / 1000));
      }
      const out = groups.filter((g) => g.total);
      return { groups: out, words: ws, total: out.reduce((a, g) => a + g.total, 0) };
    }
    return { put, drop, stale, plan, ensure, query, sweep, has: (k) => src.has(k), size: () => ({ sources: src.size, chars, docs: [...src.values()].reduce((a, s) => a + s.docs.length, 0) }), keys: () => [...src.keys()] };
  }

  // ---------- one result: where it opens, and the words around the match (marks: [start, length] in snip) ----------
  function firstAt(low, ws, phrase) {
    if (phrase && ws.length > 1) { const i = low.indexOf(phrase); if (i >= 0) return { at: i, len: phrase.length }; }
    for (const w of ws) {
      let i = low.indexOf(w);
      let best = -1;
      while (i >= 0) { if (i === 0 || !/[\p{L}\p{N}_]/u.test(low[i - 1])) { best = i; break; } if (best < 0) best = i; i = low.indexOf(w, i + 1); }
      if (best >= 0) return { at: best, len: w.length };
    }
    return { at: 0, len: 0 };
  }
  function marksIn(s, ws) {
    const low = fold(s);
    const m = [];
    for (const w of ws) { let i = low.indexOf(w); while (i >= 0 && m.length < 12) { m.push([i, w.length]); i = low.indexOf(w, i + w.length); } }
    m.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const x of m) { const last = out[out.length - 1]; if (last && x[0] <= last[0] + last[1]) last[1] = Math.max(last[1], x[0] + x[1] - last[0]); else out.push([x[0], x[1]]); }
    return out;
  }
  function around(text, at, len, before = 48, after = 110) {
    let s = Math.max(0, at - before);
    if (s > 0) { const sp = text.lastIndexOf(' ', at - 1); if (sp > s - 20 && sp >= 0) s = sp + 1; }
    const e = Math.min(text.length, at + len + after);
    return `${s > 0 ? '…' : ''}${text.slice(s, e).replace(/\s+/g, ' ').trim()}${e < text.length ? '…' : ''}`;
  }
  function hitOf(d, low, ws, phrase, score) {
    const base = { g: d.g, ref: d.ref, title: d.title, at: d.at || 0, score };
    if (d.what === 'code') {
      // the line: the first one with every word, else the first with one of them
      const lines = low.split('\n');
      let n = lines.findIndex((l) => ws.every((w) => l.includes(w)));
      if (n < 0) n = lines.findIndex((l) => ws.some((w) => l.includes(w)));
      if (n < 0) n = 0;
      const line = d.text.split('\n')[n] || '';
      const t = line.trim();
      const f = firstAt(fold(t), ws, phrase);
      const snip = t.length <= 120 ? t : around(t, f.at, f.len, 30, 80); // (a long line: around the words, so they show)
      return { ...base, layer: d.layer, layerName: d.layerName, what: 'code', line: n + 1, snip, marks: marksIn(snip, ws) };
    }
    const f = firstAt(low, ws, phrase);
    const snip = d.text.length <= 160 ? d.text.replace(/\s+/g, ' ').trim() : around(d.text, f.at, f.len);
    const out = { ...base, snip, marks: marksIn(snip, ws) };
    if (d.g === 'chat') Object.assign(out, { k: d.k, who: d.who || null, what: d.what || 'message' });
    else if (d.g === 'scene') Object.assign(out, { layer: d.layer || null, layerName: d.layerName || null, what: d.what });
    else if (d.g === 'board') Object.assign(out, { item: d.item, type: d.type || null });
    else if (d.g === 'worktable') Object.assign(out, { path: d.path, feature: d.feature, needle: d.text.slice(f.at, f.at + f.len) });
    else if (d.g === 'note') Object.assign(out, { field: d.field, pos: f.at, len: f.len });
    else if (d.g === 'file') Object.assign(out, { type: d.type, kindLabel: d.kindLabel });
    return out;
  }

  // ---------- the store thread's op (and the main process's fallback): ensure within the budget, then the query ----------
  // msg: { spec: { pid, chats, scenes, boards, notes, description, items }, dirs: { chats, kv }, q?, budgetMs?, limit? }
  function run(ix, msg, env) {
    const t0 = env.now();
    const spec = msg.spec || {};
    const e = ix.ensure(spec, msg.dirs, env, { budgetMs: msg.budgetMs ?? 12 });
    const out = { left: e.left, built: e.built, buildMs: e.ms, size: ix.size() };
    if (msg.q != null && String(msg.q).trim()) {
      const q0 = env.now();
      const r = ix.query(spec, msg.dirs, msg.q, { limit: msg.limit || 20, now: Date.now(), join: env.join });
      Object.assign(out, r, { queryMs: Math.round((env.now() - q0) * 10) / 10 });
    }
    ix.sweep(Date.now(), { keep: new Set(ix.plan(spec, msg.dirs, env.join).map((x) => x.key)) });
    out.ms = Math.round((env.now() - t0) * 10) / 10;
    return out;
  }

  return { GROUPS, W, fold, tokens, words, hash, chatDocs, sceneDocs, sceneSig, boardDocs, worktableDocs, notesDocs, itemDocs, createIndex, run, marksIn };
});
