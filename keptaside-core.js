// (round 94, keptaside94) When sync keeps two versions of one thing (a conflict to choose, or a version it kept aside
// by itself), the compare view (keptaside.js) shows both in plain form and lets the owner choose. This is its pure part
// (no window, no files): what kind of thing it is, what differs in words, a line-by-line diff of text and code, the
// "Combine" starting text, putting an edited text back in place, a chat's differing messages, and which Deleted-files
// entry an Undo brings back. Used by keptaside.js (window), keptasidemain.js / storework.js (main side: a very long
// chat's differing messages on the store thread) and dev/keptaside94-test.js.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KeptAsideCore = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const IMG = /\.(png|jpe?g|webp|gif|bmp|avif)$/i; const AUD = /\.(wav|mp3|m4a|aac|flac|ogg|oga|opus|aiff?)$/i; const VID = /\.(mp4|webm|mov|m4v|mkv)$/i;
  // what it is: chat · settings · scene · preset · note · board · project · image · audio · video · data · file
  function kindOf(rel) {
    const r = String(rel || '');
    if (/^chats\/[^/]+\.json$/i.test(r)) return 'chat';
    if (r === 'app/config.json') return 'settings';
    if (r === 'kv/three-sketches.json') return 'scene';
    if (r === 'kv/lab-presets.json') return 'preset';
    if (/^kv\/(notes|three-notes|video-notes|prompts)\.json$/i.test(r) || /\.(md|txt)$/i.test(r)) return 'note';
    if (/^kv\/(boards?|board-[^/]+)\.json$/i.test(r) || /^board\/.+\.json$/i.test(r)) return 'board';
    if (r === 'kv/projects.json' || /^projects\/.+\.json$/i.test(r)) return 'project';
    if (IMG.test(r)) return 'image';
    if (AUD.test(r)) return 'audio';
    if (VID.test(r)) return 'video';
    if (/\.json$/i.test(r)) return 'data';
    return 'file';
  }
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const keyOf = (x) => (isObj(x) && (typeof x.id === 'string' || typeof x.id === 'number') ? String(x.id) : isObj(x) && typeof x.at === 'number' ? `${x.role ?? ''}@${x.at}` : null);
  // the value at a path ("s1.layers.l1.code": ids inside lists, as sync's conflicts name them)
  function at(value, p) {
    let cur = value;
    for (const seg of String(p || '').split('.').filter(Boolean)) {
      if (cur == null) return undefined;
      if (Array.isArray(cur)) cur = cur.find((x) => keyOf(x) === seg);
      else if (typeof cur === 'object') cur = cur[seg];
      else return undefined;
    }
    return cur;
  }
  // a copy of value with the path set to v (null when the path isn't there). The list item it is in is marked
  // changed now (updatedAt), so the other computer takes this version and a window holding the store shows it.
  function setAt(value, p, v, now = Date.now()) {
    const out = JSON.parse(JSON.stringify(value ?? null));
    const segs = String(p || '').split('.').filter(Boolean);
    if (!segs.length) return null;
    let cur = out; let item = null;
    for (let i = 0; i < segs.length - 1; i++) {
      const seg = segs[i];
      if (Array.isArray(cur)) { cur = cur.find((x) => keyOf(x) === seg); if (cur && !item) item = cur; } else if (isObj(cur)) cur = cur[seg];
      else return null;
      if (cur == null || typeof cur !== 'object') return null;
    }
    const last = segs[segs.length - 1];
    if (Array.isArray(cur)) { const i = cur.findIndex((x) => keyOf(x) === last); if (i < 0) return null; cur[i] = v; } else if (isObj(cur)) { if (!(last in cur)) return null; cur[last] = v; } else return null;
    if (item && typeof item.updatedAt === 'number') item.updatedAt = Math.max(now, item.updatedAt + 1);
    return out;
  }

  // ---------- text and code, line by line ----------
  // → [{ t: 'same' | 'del' | 'add', a, b }] (a: this side's line, b: the other's), the fewest changes (Myers' way:
  // quick when few lines differ, whatever the length). More than MAX_D changed lines: one changed block (still whole).
  const MAX_D = 1500;
  function middle(A, B, s, ea, eb) {
    const N = ea - s; const M = eb - s; const max = N + M; const off = max + 1;
    const v = new Int32Array(2 * max + 3); const trace = [];
    for (let d = 0; d <= Math.min(max, MAX_D); d++) {
      trace.push(v.slice(off - d - 1, off + d + 2));
      for (let k = -d; k <= d; k += 2) {
        let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
        let y = x - k;
        while (x < N && y < M && A[s + x] === B[s + y]) { x += 1; y += 1; }
        v[off + k] = x;
        if (x >= N && y >= M) {
          // back from the end: each step one line only on one side, between runs of lines both have
          const out = []; let cx = N; let cy = M;
          for (let e = d; e > 0; e--) {
            const V = trace[e]; const at = (kk) => V[kk + e + 1];
            const kk = cx - cy;
            const pk = kk === -e || (kk !== e && at(kk - 1) < at(kk + 1)) ? kk + 1 : kk - 1;
            const px = at(pk); const py = px - pk;
            while (cx > px && cy > py) { cx -= 1; cy -= 1; out.push({ t: 'same', a: A[s + cx], b: B[s + cy] }); }
            if (cx === px) { cy -= 1; out.push({ t: 'add', b: B[s + cy] }); } else { cx -= 1; out.push({ t: 'del', a: A[s + cx] }); }
          }
          while (cx > 0 && cy > 0) { cx -= 1; cy -= 1; out.push({ t: 'same', a: A[s + cx], b: B[s + cy] }); }
          return out.reverse();
        }
      }
    }
    return null;
  }
  function ops(a, b) {
    const A = String(a ?? '').split('\n'); const B = String(b ?? '').split('\n');
    let s = 0; while (s < A.length && s < B.length && A[s] === B[s]) s += 1;
    let ea = A.length; let eb = B.length;
    while (ea > s && eb > s && A[ea - 1] === B[eb - 1]) { ea -= 1; eb -= 1; }
    const out = [];
    for (let i = 0; i < s; i++) out.push({ t: 'same', a: A[i], b: B[i] });
    if (ea > s || eb > s) {
      const mid = middle(A, B, s, ea, eb);
      if (mid) out.push(...mid);
      else { for (let i = s; i < ea; i++) out.push({ t: 'del', a: A[i] }); for (let j = s; j < eb; j++) out.push({ t: 'add', b: B[j] }); }
    }
    for (let i = ea, j = eb; i < A.length; i++, j++) out.push({ t: 'same', a: A[i], b: B[j] });
    return out;
  }
  // side by side: rows { a, b, na, nb, t } where t is 'same', 'chg' (a line each side, different), 'del' (only this
  // side) or 'add' (only the other); runs of more than `ctx` unchanged lines between changes fold into { t: 'fold', n }
  function lineDiff(a, b, { ctx = 3 } = {}) {
    const list = ops(a, b);
    const rows = []; let na = 0; let nb = 0;
    for (let i = 0; i < list.length;) {
      if (list[i].t === 'same') { na += 1; nb += 1; rows.push({ t: 'same', a: list[i].a, b: list[i].b, na, nb }); i += 1; continue; }
      const dels = []; const adds = [];
      while (i < list.length && list[i].t !== 'same') { (list[i].t === 'del' ? dels : adds).push(list[i]); i += 1; }
      for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
        const d = dels[k]; const x = adds[k];
        if (d) na += 1; if (x) nb += 1;
        rows.push({ t: d && x ? 'chg' : d ? 'del' : 'add', a: d ? d.a : null, b: x ? x.b : null, na: d ? na : null, nb: x ? nb : null });
      }
    }
    const changed = rows.filter((r) => r.t !== 'same').length;
    // fold long unchanged stretches (keep ctx lines around each change)
    const near = new Uint8Array(rows.length);
    rows.forEach((r, i) => { if (r.t !== 'same') for (let k = Math.max(0, i - ctx); k <= Math.min(rows.length - 1, i + ctx); k++) near[k] = 1; });
    const out = [];
    for (let i = 0; i < rows.length;) {
      if (near[i] || !changed) { out.push(rows[i]); i += 1; continue; }
      let j = i; while (j < rows.length && !near[j]) j += 1;
      if (j - i < 3) { out.push(...rows.slice(i, j)); i = j; continue; } // (a fold of one or two lines hides nothing)
      out.push({ t: 'fold', n: j - i });
      i = j;
    }
    return { rows: out, changed, onlyHere: rows.filter((r) => r.t === 'del' || r.t === 'chg').length, onlyThere: rows.filter((r) => r.t === 'add' || r.t === 'chg').length };
  }
  // "Combine": the lines both have once; where they differ, this side's lines then the other's (never a line dropped).
  // The owner edits it before it is saved.
  function combineText(a, b) {
    const out = []; let dels = []; let adds = [];
    const flush = () => { out.push(...dels, ...adds.filter((x) => !dels.includes(x))); dels = []; adds = []; };
    for (const o of ops(a, b)) {
      if (o.t === 'same') { flush(); out.push(o.a); } else if (o.t === 'del') dels.push(o.a); else adds.push(o.b);
    }
    flush();
    return out.join('\n');
  }

  // ---------- what differs, in words ----------
  const TIME_KEY = /(^|[a-z])(At|Time|Ts)$|^(updated|modified|lastSeen|last|mtime|seen|since|opened|at|h|v)$/;
  const TEXT_KEY = /^(code|text|body|content|notes?|description|summary|memo|journal|shader|glsl|frag|vert|prompt|script|source|md|markdown)$/i;
  const WORD = { code: 'code', text: 'text', name: 'name', title: 'title', data: 'setup', notes: 'notes', note: 'note', color: 'colour', colors: 'colours', cfg: 'setup', items: '', list: '', layers: '', settings: '', value: '' };
  const human = (k) => (k in WORD ? WORD[k] : String(k).replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase());
  const nameOfItem = (x) => (isObj(x) ? [x.name, x.title, x.label].find((s) => typeof s === 'string' && s.trim()) : null);
  // a path in words, from the value that has it: "“Neon” › “Background” › code"
  function labelOf(value, p, root = '') {
    const segs = String(p || '').split('.').filter(Boolean);
    const words = []; let cur = value;
    for (const seg of segs) {
      if (Array.isArray(cur)) { cur = cur.find((x) => keyOf(x) === seg); const n = nameOfItem(cur); words.push(n ? `“${n}”` : 'an item'); continue; }
      const it = isObj(cur) ? cur[seg] : undefined;
      const n = isObj(it) ? nameOfItem(it) : null;
      if (n && isObj(cur) && !TEXT_KEY.test(seg) && !(seg in WORD)) words.push(`“${n}”`); else { const w = human(seg); if (w) words.push(w); }
      cur = it;
    }
    return words.join(' › ') || root || 'the whole thing';
  }
  // a value in words: on / off, “text”, a number, "3 things", "(several settings)"
  function say(v, n = 80) {
    if (v === undefined) return '(not there)';
    if (v === null) return '(empty)';
    if (typeof v === 'boolean') return v ? 'on' : 'off';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') { const t = v.replace(/\s+/g, ' ').trim(); return t ? `“${t.length > n ? `${t.slice(0, n - 1)}…` : t}”` : '(empty)'; }
    if (Array.isArray(v)) return v.length ? `${v.length} thing${v.length === 1 ? '' : 's'}${v.every((x) => typeof x === 'string') ? `: ${v.slice(0, 4).map((x) => `“${x}”`).join(', ')}${v.length > 4 ? '…' : ''}` : ''}` : 'nothing';
    const names = Object.keys(v); return names.length ? `(${names.length} setting${names.length === 1 ? '' : 's'})` : '(empty)';
  }
  const jsonText = (s) => { if (typeof s !== 'string' || !/^\s*[{[]/.test(s)) return undefined; try { return JSON.parse(s); } catch { return undefined; } };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // the places two versions differ: [{ path, how: 'changed' | 'onlyHere' | 'onlyThere', here, there, text }] (text: both
  // are text or code with several lines, or a text field: shown as a line diff). Times and fingerprints are left out.
  function changes(here, there, { max = 40 } = {}) {
    const out = [];
    const walk = (a, b, p) => {
      if (out.length >= max || same(a, b)) return;
      const last = p[p.length - 1] || '';
      if (TIME_KEY.test(String(last))) return;
      if (Array.isArray(a) && Array.isArray(b)) {
        const ka = a.map(keyOf); const kb = b.map(keyOf);
        if (ka.every((k) => k !== null) && kb.every((k) => k !== null)) {
          for (const x of a) { const k = keyOf(x); const y = b.find((z) => keyOf(z) === k); if (y === undefined) out.push({ path: [...p, k].join('.'), how: 'onlyHere', here: x }); else walk(x, y, [...p, k]); }
          for (const y of b) { const k = keyOf(y); if (!a.some((x) => keyOf(x) === k) && out.length < max) out.push({ path: [...p, k].join('.'), how: 'onlyThere', there: y }); }
          return;
        }
      }
      if (isObj(a) && isObj(b)) {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
          if (!(k in b)) { if (!TIME_KEY.test(k)) out.push({ path: [...p, k].join('.'), how: 'onlyHere', here: a[k] }); } else if (!(k in a)) { if (!TIME_KEY.test(k)) out.push({ path: [...p, k].join('.'), how: 'onlyThere', there: b[k] }); } else walk(a[k], b[k], [...p, k]);
          if (out.length >= max) return;
        }
        return;
      }
      // a setup kept as one piece of JSON text (Lab presets): looked into
      const ja = jsonText(a); const jb = jsonText(b);
      if (ja !== undefined && jb !== undefined && (isObj(ja) || Array.isArray(ja))) { walk(ja, jb, p); return; }
      const text = typeof a === 'string' && typeof b === 'string' && (a.includes('\n') || b.includes('\n') || (TEXT_KEY.test(String(last)) && (a.length > 60 || b.length > 60)));
      out.push({ path: p.join('.'), how: 'changed', here: a, there: b, text });
    };
    walk(here, there, []);
    return out;
  }
  // the rows a person reads: [{ label, here, there, how, text, path }] (here / there in words; text: both texts whole)
  function rows(here, there, o = {}) {
    return changes(here, there, o).map((c) => ({
      path: c.path, how: c.how, text: Boolean(c.text),
      label: labelOf(c.how === 'onlyThere' ? there : here, c.path, o.root),
      here: c.text ? c.here : c.how === 'onlyThere' ? '(not there)' : say(c.how === 'onlyHere' && isObj(c.here) && nameOfItem(c.here) ? `${nameOfItem(c.here)}` : c.here),
      there: c.text ? c.there : c.how === 'onlyHere' ? '(not there)' : say(c.how === 'onlyThere' && isObj(c.there) && nameOfItem(c.there) ? `${nameOfItem(c.there)}` : c.there),
    }));
  }
  // the text fields that differ (a scene's code, a note's text): what "Combine" offers, path by path
  const textRows = (here, there, o) => rows(here, there, o).filter((r) => r.text && typeof r.here === 'string' && typeof r.there === 'string');

  // ---------- a chat: the messages that differ ----------
  const clip = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  // → { title: { here, there } | null, nHere, nThere, same, onlyHere, onlyThere, changed, more: { onlyHere, onlyThere, changed } }
  // (messages by their id, else by who and when; the last `max` of each list, each text clipped at `clipAt`)
  function chatDiff(here, there, { max = 40, clipAt = 1200 } = {}) {
    const mh = Array.isArray(here?.messages) ? here.messages : []; const mt = Array.isArray(there?.messages) ? there.messages : [];
    const key = (m) => (m && m.id != null ? `id:${m.id}` : `${m?.role}@${m?.at}`);
    const T = new Map(mt.map((m) => [key(m), m])); const H = new Map(mh.map((m) => [key(m), m]));
    const brief = (m) => ({ role: m?.role || '', at: m?.at || null, text: clip(typeof m?.text === 'string' ? m.text : JSON.stringify(m?.text ?? ''), clipAt) });
    const onlyHere = []; const onlyThere = []; const changed = []; let sameN = 0;
    for (const m of mh) {
      const o = T.get(key(m));
      if (!o) onlyHere.push(brief(m));
      else if (String(o.text ?? '') !== String(m.text ?? '')) changed.push({ role: m.role || '', at: m.at || null, here: brief(m).text, there: brief(o).text });
      else sameN += 1;
    }
    for (const m of mt) if (!H.has(key(m))) onlyThere.push(brief(m));
    const tail = (l) => l.slice(-max);
    return {
      title: (here?.title ?? '') !== (there?.title ?? '') ? { here: String(here?.title ?? ''), there: String(there?.title ?? '') } : null,
      nHere: mh.length, nThere: mt.length, same: sameN,
      onlyHere: tail(onlyHere), onlyThere: tail(onlyThere), changed: tail(changed),
      more: { onlyHere: Math.max(0, onlyHere.length - max), onlyThere: Math.max(0, onlyThere.length - max), changed: Math.max(0, changed.length - max) },
    };
  }

  // ---------- after a choice: what an Undo brings back ----------
  // a Deleted-files entry's own name (a copy kept twice the same day gets a short random prefix)
  const plainRel = (rel) => String(rel || '').replace(/(^|\/)[0-9a-f]{6,8}-([^/]+)$/, '$1$2');
  // the entries that appeared between two lists of Deleted files for this thing (here: first: the version that was in
  // place before the choice, kept on this computer)
  function newEntries(before, after, rel) {
    const had = new Set((before || []).map((t) => t.id));
    return (after || []).filter((t) => !had.has(t.id) && plainRel(t.rel) === rel).sort((a, b) => (a.where === 'here' ? -1 : 0) - (b.where === 'here' ? -1 : 0));
  }
  // can its text be combined by hand (a scene's code, a note's text: data whose differing parts are text)
  const canCombine = (rel, here, there) => /^kv\/[\w-]+\.json$/.test(String(rel || '')) && textRows(here, there).length > 0;

  return { kindOf, at, setAt, ops, lineDiff, combineText, changes, rows, textRows, labelOf, say, chatDiff, plainRel, newEntries, canCombine, IMG, AUD, VID };
}));
