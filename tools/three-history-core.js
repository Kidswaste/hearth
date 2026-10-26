// The Lab's time machine, as data (round 23, timemachine): no DOM, no Lab, so it runs in Node too
// (dev/timemachine-test.js). tools/three-history.js records versions with it; tools/three-history-ui.js shows them.
//   A scene's state: { layers: [layer (code + props, as in the sketch)], vals: { layerId: { sliderKey: value } }
//   (slider values moved but not saved into the code), sel: the selected layer id, palette }.
//   A scene's history (kv three-tm-<sceneId>): { v: 1, versions: [version], keys: { keyId: state } }
//   version = { id, at, by: 'you' | 'claude' | 'codex' | 'crew', chat?, kind, label, k: keyId, s: delta | null, mark?, thumb? }
//   Each version is a delta against ONE full state (its key), never a chain: two computers that merge their lists
//   by id (sync-merge.js) can always rebuild every version, and thinning never breaks a version that stays.
const TMCore = (() => {
  let scanFn = null; // ThreeTweaks.scan (the sliders' values in the code); in the browser it's found by itself
  const scan = (code) => { const f = scanFn || (typeof ThreeTweaks !== 'undefined' ? ThreeTweaks.scan : null); try { return f ? f(String(code || '')) : null; } catch { return null; } };
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  // JSON with sorted keys: a layer rebuilt from a delta has its props in another order
  const stable = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
  const eq = (a, b) => stable(a) === stable(b);
  const newId = (p = 'v') => `${p}${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36).padStart(3, '0')}`;

  // ---------- line diffs (Myers, on the lines between the common head and tail) ----------
  // ops(a, b) → [['=' | '-' | '+', line]] or null when the middle is too different to diff cheaply
  function ops(a, b, maxD = 260) {
    const A = String(a).split('\n'); const B = String(b).split('\n');
    let h = 0; while (h < A.length && h < B.length && A[h] === B[h]) h += 1;
    let t = 0; while (t < A.length - h && t < B.length - h && A[A.length - 1 - t] === B[B.length - 1 - t]) t += 1;
    const a2 = A.slice(h, A.length - t); const b2 = B.slice(h, B.length - t);
    const mid = myers(a2, b2, maxD);
    if (!mid) return null;
    return [...A.slice(0, h).map((l) => ['=', l]), ...mid, ...A.slice(A.length - t).map((l) => ['=', l])];
  }
  function myers(A, B, maxD) {
    const N = A.length; const M = B.length;
    if (!N) return B.map((l) => ['+', l]);
    if (!M) return A.map((l) => ['-', l]);
    if (N + M > 6000) return null;
    const off = N + M + 1;
    const v = new Int32Array(2 * off + 2);
    const trace = [];
    for (let d = 0; d <= Math.min(N + M, maxD); d += 1) {
      trace.push(v.slice(off - d - 1, off + d + 2)); // the state before step d (k from −d−1 to d+1)
      for (let k = -d; k <= d; k += 2) {
        let x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1;
        let y = x - k;
        while (x < N && y < M && A[x] === B[y]) { x += 1; y += 1; }
        v[off + k] = x;
        if (x >= N && y >= M) return back(trace, A, B, d);
      }
    }
    return null;
  }
  function back(trace, A, B, D) {
    let x = A.length; let y = B.length; const out = [];
    for (let d = D; d > 0; d -= 1) {
      const vt = trace[d]; const g = (k) => vt[k + d + 1];
      const k = x - y;
      const pk = (k === -d || (k !== d && g(k - 1) < g(k + 1))) ? k + 1 : k - 1;
      const px = g(pk); const py = px - pk;
      while (x > px && y > py) { out.push(['=', A[x - 1]]); x -= 1; y -= 1; }
      if (x === px) { out.push(['+', B[y - 1]]); y -= 1; } else { out.push(['-', A[x - 1]]); x -= 1; }
    }
    while (x > 0 && y > 0) { out.push(['=', A[x - 1]]); x -= 1; y -= 1; }
    return out.reverse();
  }
  // diff(a, b) → hunks [[from (0-based line of a), removed, [added lines]]] (null: the same); one big hunk when the
  // middle is too different (a rewrite)
  function diff(a, b) {
    if (a === b) return null;
    const o = ops(a, b);
    if (!o) {
      const A = String(a).split('\n'); const B = String(b).split('\n');
      let h = 0; while (h < A.length && h < B.length && A[h] === B[h]) h += 1;
      let t = 0; while (t < A.length - h && t < B.length - h && A[A.length - 1 - t] === B[B.length - 1 - t]) t += 1;
      return [[h, A.length - h - t, B.slice(h, B.length - t)]];
    }
    const hunks = []; let ai = 0; let cur = null;
    for (const [op, line] of o) {
      if (op === '=') { cur = null; ai += 1; continue; }
      if (!cur) { cur = [ai, 0, []]; hunks.push(cur); }
      if (op === '-') { cur[1] += 1; ai += 1; } else cur[2].push(line);
    }
    return hunks;
  }
  function patch(a, hunks) {
    if (!hunks) return a;
    const A = String(a).split('\n');
    for (let i = hunks.length - 1; i >= 0; i -= 1) { const [at, del, ins] = hunks[i]; A.splice(at, del, ...ins); }
    return A.join('\n');
  }
  // the lines that changed, with `ctx` lines around them: [{ op, line, n }] (n: the line number in b, or in a for '-')
  function codeDiff(a, b, { ctx = 2, max = 160 } = {}) {
    const o = ops(a ?? '', b ?? '') || [...String(a ?? '').split('\n').map((l) => ['-', l]), ...String(b ?? '').split('\n').map((l) => ['+', l])];
    const keep = new Set();
    o.forEach(([op], i) => { if (op !== '=') for (let j = i - ctx; j <= i + ctx; j += 1) keep.add(j); });
    const out = []; let na = 0; let nb = 0; let gap = false;
    o.forEach(([op, line], i) => {
      if (op !== '+') na += 1;
      if (op !== '-') nb += 1;
      if (!keep.has(i)) { gap = true; return; }
      if (gap && out.length) out.push({ op: '…', line: '', n: null });
      gap = false;
      if (out.length < max) out.push({ op, line, n: op === '-' ? na : nb });
    });
    return out;
  }
  const plusMinus = (a, b) => { const o = ops(a ?? '', b ?? ''); if (!o) return { plus: String(b ?? '').split('\n').length, minus: String(a ?? '').split('\n').length }; let plus = 0; let minus = 0; for (const [op] of o) { if (op === '+') plus += 1; else if (op === '-') minus += 1; } return { plus, minus }; };

  // ---------- states ----------
  const metaOf = (L) => { const { code: _c, ...m } = L || {}; return m; };
  // a state as a delta against a key state: per layer, its code as hunks and its props only when they changed
  function encode(st, key) {
    const byId = new Map((key.layers || []).map((L) => [L.id, L]));
    const L = st.layers.map((x) => {
      const kl = byId.get(x.id);
      if (!kl) return { id: x.id, code: x.code, m: metaOf(x) };
      const o = { id: x.id };
      const d = diff(kl.code ?? '', x.code ?? '');
      if (d) o.c = d;
      const m = metaOf(x);
      if (!eq(m, metaOf(kl))) o.m = m;
      return o;
    });
    const out = { L };
    if (!eq(st.vals || {}, key.vals || {})) out.vals = st.vals || {};
    if ((st.sel || null) !== (key.sel || null)) out.sel = st.sel || null;
    if (!eq(st.palette || null, key.palette || null)) out.palette = st.palette || null;
    return out;
  }
  function decode(s, key) {
    if (!key) return null;
    if (!s) return clone(key);
    const byId = new Map((key.layers || []).map((L) => [L.id, L]));
    const layers = s.L.map((o) => {
      const kl = byId.get(o.id);
      if (!kl) return { ...clone(o.m || {}), id: o.id, code: o.code ?? '' };
      return { ...clone(o.m || metaOf(kl)), id: o.id, code: o.c ? patch(kl.code ?? '', o.c) : kl.code };
    });
    return { layers, vals: clone('vals' in s ? s.vals : key.vals) || {}, sel: 'sel' in s ? s.sel : key.sel || null, palette: clone('palette' in s ? s.palette : key.palette) || null };
  }
  // two states show the same thing (what a version is about: code, layers and their props, unsaved slider values, palette)
  const sig = (st) => stable([st?.layers || [], st?.vals || {}, st?.palette || null]);
  const same = (a, b) => Boolean(a && b) && sig(a) === sig(b);

  // ---------- a history ----------
  const blank = () => ({ v: 1, versions: [], keys: {} });
  const sizeOf = (x) => (x == null ? 0 : JSON.stringify(x).length);
  const byTime = (doc) => doc.versions.slice().sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  function stateOf(doc, v) { if (!v) return null; return decode(v.s, doc.keys[v.k]); }
  const latest = (doc) => { const l = byTime(doc); return l[l.length - 1] || null; };
  // add a version: a delta against the newest key, or a new key when the delta grew big (> 35 % of the key) or after
  // 25 versions on one key
  function add(doc, st, info = {}) {
    const last = latest(doc);
    let k = last?.k && doc.keys[last.k] ? last.k : null;
    let s = null;
    if (k) {
      s = encode(st, doc.keys[k]);
      const onKey = doc.versions.filter((x) => x.k === k).length;
      if (sizeOf(s) > 0.35 * sizeOf(doc.keys[k]) + 200 || onKey >= 25) k = null;
    }
    if (!k) { k = newId('k'); doc.keys[k] = clone(st); s = null; }
    const v = { id: info.id || newId('v'), at: info.at || Date.now(), by: info.by || 'you', kind: info.kind || 'change', label: String(info.label || 'Changed').slice(0, 120), k, s };
    if (info.chat) v.chat = info.chat;
    if (info.mark) v.mark = info.mark;
    if (info.p && info.p !== v.id) v.p = info.p; // (round 67, direction67) the version this one grew from
    doc.versions.push(v);
    return v;
  }
  // ---------- (round 67, direction67) branches ----------
  // A version grew from its p (going back to an older version and working on from it starts a branch in the same
  // scene); without p (older versions) it grew from the one before it in time. A p that thinning removed falls back
  // the same way. Tips: the newest version of each branch (nothing grew from it).
  function parentOf(doc, v, list = byTime(doc)) {
    if (!v) return null;
    if (v.p && doc.versions.some((x) => x.id === v.p)) return v.p;
    const i = list.findIndex((x) => x.id === v.id);
    return i > 0 ? list[i - 1].id : null;
  }
  function tips(doc) {
    const list = byTime(doc);
    const grown = new Set(list.map((v) => parentOf(doc, v, list)).filter(Boolean));
    return list.filter((v) => !grown.has(v.id)).reverse(); // newest first
  }
  // the versions from the first one to vid, along its branch
  function lineOf(doc, vid) {
    const list = byTime(doc); const out = []; const seen = new Set();
    let v = list.find((x) => x.id === vid);
    while (v && !seen.has(v.id)) { seen.add(v.id); out.unshift(v); const p = parentOf(doc, v, list); v = p ? list.find((x) => x.id === p) : null; }
    return out;
  }
  // keys no version uses any more go (a merged list may bring a version whose key the other computer kept: it's
  // in keys too, merged by id)
  function gc(doc) { const used = new Set(doc.versions.map((v) => v.k)); for (const k of Object.keys(doc.keys)) if (!used.has(k)) delete doc.keys[k]; }
  // versions whose key is missing (half a sync) can't be rebuilt: dropped
  function heal(doc) { const n = doc.versions.length; doc.versions = doc.versions.filter((v) => v && v.id && doc.keys[v.k]); return n - doc.versions.length; }

  // Thinning: every version from today, the last of each hour for the week (director bookmarks of the week too),
  // the last of each day after that, the newest always; at most `cap` versions (the oldest go first).
  function thin(doc, now = Date.now(), { cap = 160 } = {}) {
    const list = byTime(doc);
    if (!list.length) return 0;
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const t0 = today.getTime(); const week = t0 - 6 * 864e5;
    const keep = new Set([list[list.length - 1].id]);
    const lastIn = new Map();
    for (const v of list) {
      if (v.at >= t0) { keep.add(v.id); continue; }
      if (v.at >= week) {
        if (v.mark) keep.add(v.id);
        const d = new Date(v.at); lastIn.set(`h${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`, v.id);
        continue;
      }
      const d = new Date(v.at); lastIn.set(`d${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`, v.id);
    }
    for (const id of lastIn.values()) keep.add(id);
    let kept = list.filter((v) => keep.has(v.id));
    if (kept.length > cap) kept = kept.slice(kept.length - cap);
    const n = doc.versions.length - kept.length;
    if (n) { const ids = new Set(kept.map((v) => v.id)); doc.versions = doc.versions.filter((v) => ids.has(v.id)); gc(doc); }
    return n;
  }

  // ---------- what changed between two states ----------
  // the slider values a layer shows: its tweak() values in the code, with the unsaved ones on top
  function sliderVals(L, vals) {
    const out = {};
    const sc = scan(L?.code);
    for (const it of sc?.items || []) if (it.key != null) out[it.key] = it.orig;
    return Object.assign(out, vals || {});
  }
  function colorKeys(L) { const sc = scan(L?.code); return new Set((sc?.items || []).filter((it) => it.key != null && it.kind === 'color').map((it) => it.key)); }
  function changes(a, b) {
    const out = { added: [], removed: [], code: [], props: [], vals: [], order: false, palette: false };
    if (!a || !b) return out;
    const A = new Map(a.layers.map((L) => [L.id, L])); const B = new Map(b.layers.map((L) => [L.id, L]));
    for (const L of b.layers) if (!A.has(L.id)) out.added.push(L.name || L.id);
    for (const L of a.layers) if (!B.has(L.id)) out.removed.push(L.name || L.id);
    for (const L of b.layers) {
      const p = A.get(L.id);
      if (!p) continue;
      if ((p.code ?? '') !== (L.code ?? '')) out.code.push({ id: L.id, layer: L.name, ...plusMinus(p.code, L.code) });
      const ma = metaOf(p); const mb = metaOf(L);
      const keys = [...new Set([...Object.keys(ma), ...Object.keys(mb)])].filter((k) => k !== 'color' && !eq(ma[k], mb[k]));
      if (keys.length) out.props.push({ id: L.id, layer: L.name, keys });
      const va = sliderVals(p, a.vals?.[L.id]); const vb = sliderVals(L, b.vals?.[L.id]);
      for (const k of new Set([...Object.keys(va), ...Object.keys(vb)])) if (k in va && k in vb && !eq(va[k], vb[k])) out.vals.push({ id: L.id, layer: L.name, key: k, from: va[k], to: vb[k] });
    }
    const common = (x, y) => x.layers.map((L) => L.id).filter((id) => y.layers.some((M) => M.id === id));
    out.order = common(a, b).join() !== common(b, a).join();
    out.palette = !eq(a.palette || null, b.palette || null);
    return out;
  }
  const none = (c) => !c.added.length && !c.removed.length && !c.code.length && !c.props.length && !c.vals.length && !c.order && !c.palette;
  // one short line: "Orb +3 −1 · added Glow · tint, speed"
  function summary(c, { max = 3 } = {}) {
    const parts = [];
    for (const n of c.added) parts.push(`added ${n}`);
    for (const n of c.removed) parts.push(`removed ${n}`);
    for (const x of c.code) parts.push(`${x.layer} +${x.plus} −${x.minus}`);
    const vk = [...new Set(c.vals.map((x) => x.key))];
    if (vk.length) parts.push(vk.length > 3 ? `${vk.length} sliders` : vk.join(', '));
    for (const x of c.props) parts.push(`${x.layer}: ${x.keys.slice(0, 3).join(', ')}`);
    if (c.order) parts.push('layer order');
    if (c.palette) parts.push('palette');
    if (!parts.length) return 'no change';
    return parts.length > max ? `${parts.slice(0, max).join(' · ')} · +${parts.length - max} more` : parts.join(' · ');
  }
  const WHO = { you: 'You', claude: 'Claude', codex: 'Astra', crew: 'A crew helper' };
  const whoName = (by) => WHO[by] || String(by || 'You');
  // the version's label from its kind and what changed
  function label(kind, c) {
    const s = summary(c);
    if (kind === 'shuffle') return `Shuffle kept · ${s}`;
    if (kind === 'sliders') return `Sliders saved · ${s}`;
    if (kind === 'restore') return 'Restored';
    if (kind === 'start') return 'Opened';
    if (c.added.length && !c.code.length && !c.removed.length) return `Layer added · ${s}`;
    if (c.removed.length && !c.code.length && !c.added.length) return `Layer removed · ${s}`;
    if (kind === 'run' && c.code.length) return `Code run · ${s}`;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // ---------- picking parts of a version into the scene ----------
  // one layer: replaced in place when the scene has it, else put back where it was (by its neighbours)
  function pickLayer(now, from, layerId) {
    const L = from.layers.find((x) => x.id === layerId || x.name === layerId);
    if (!L) throw new Error(`That version has no layer "${layerId}"`);
    const st = clone(now);
    const at = st.layers.findIndex((x) => x.id === L.id);
    if (at >= 0) st.layers[at] = clone(L);
    else { const i = from.layers.indexOf(L); const below = from.layers[i - 1]; const j = below ? st.layers.findIndex((x) => x.id === below.id) : -1; st.layers.splice(j + 1, 0, clone(L)); }
    if (from.vals?.[L.id]) st.vals[L.id] = clone(from.vals[L.id]); else delete st.vals[L.id];
    return { state: st, layer: L.name };
  }
  // slider values (all of them, or only the colors) written into the code of each layer both states have, plus the
  // palette for colors; the scene's own unsaved values for those sliders are dropped
  function pickValues(now, from, { colors = false } = {}) {
    const st = clone(now);
    let n = 0;
    for (const L of st.layers) {
      const F = from.layers.find((x) => x.id === L.id) || (st.layers.length === 1 && from.layers.length === 1 ? from.layers[0] : null);
      if (!F) continue;
      const want = sliderVals(F, from.vals?.[F.id]);
      const only = colors ? colorKeys(F) : null;
      const sc = scan(L.code);
      if (!sc) continue;
      const values = sc.items.map((it) => (it.key != null && it.key in want && (!only || only.has(it.key)) && typeof want[it.key] === typeof it.orig ? want[it.key] : it.orig));
      const changed = sc.items.filter((it, i) => !eq(values[i], it.orig)).length;
      if (changed && typeof ThreeTweaks !== 'undefined') { L.code = ThreeTweaks.applyValues(L.code, sc.items, values); n += changed; }
      const v = st.vals[L.id];
      if (v) { for (const k of Object.keys(v)) if (k in want && (!only || only.has(k))) delete v[k]; if (!Object.keys(v).length) delete st.vals[L.id]; }
    }
    if (colors && from.palette && !eq(from.palette, now.palette)) { st.palette = clone(from.palette); n += 1; }
    return { state: st, changed: n };
  }

  return {
    config: (o) => { if (o?.scan) scanFn = o.scan; },
    ops, diff, patch, codeDiff, plusMinus, encode, decode, same, sig,
    blank, add, latest, byTime, stateOf, gc, heal, thin, sizeOf, parentOf, tips, lineOf,
    changes, none, summary, label, whoName, sliderVals, pickLayer, pickValues, clone, newId,
  };
})();
if (typeof module !== 'undefined') module.exports = TMCore;
