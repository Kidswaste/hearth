// Recall (round 30): "what did we decide about X?" across every chat, here on this computer, for zero tokens. The
// pure part, shared by the store thread (storework.js op `recall`, where the index lives) and dev/recall-test.js:
//   tokens(text)              words → light stems, no stop words, fenced code left out
//   questionTerms(q)          the words of a question that matter ("what did we decide about the intro font?" → intro, font)
//   createIndex()             { has(key, src), add(key, chat, src), drop(key), keys(), size(), search(q, { textOf, now, limit }) }
// One document per message (user / assistant / second opinion / collab). Ranking: BM25 (k1 1.2, b 0.75) × how many of
// the question's words it has × recency (a month-old message still counts, a fresh one a bit more) × pinned chat ×
// pinned / bookmarked message × decision phrasing ("let's go with", "we decided", "use X instead"…). Results come as
// short quoted snippets (the best sentence, centred on the match) in three groups: decisions, open questions, mentions.
// Postings are kept per chat (term → [message, tf, …]), so a chat that changed is swapped in and out on its own.
const RecallCore = (() => {
  const STOP = new Set(('a an the and or but if then else of to in on at by for from with without into onto over under about as is are was were be been being am '
    + 'it its it\'s this that these those there here i me my we us our you your he she they them their his her him what which who whom whose '
    + 'do does did done doing have has had having not no yes so too very just also can could would should will shall may might must '
    + 'than such some any all each both few more most other own same only up down out off again once ok okay oh hey hi please thanks thank '
    + 'let let\'s lets get got go going gonna wanna like one thing things way really maybe much many how when where why now well still even').split(' '));
  // a question's scaffolding: dropped from the question only (the messages keep these words)
  const ASK = new Set(('decide decided deciding decision decisions remind recall remember told tell say said talk talked talking agree agreed '
    + 'pick picked choose chose chosen settle settled regarding re again last time earlier before previously ever find answer conclusion '
    + 'conclude concluded plan planned discuss discussed whats what\'s were we\'d we\'ve thought think').split(' '));
  const DECIDE = /\b(?:let'?s (?:go|use|do|stick|keep|make|try)|(?:we|i)(?:'ll| will| are going to|'re going to)? (?:go|stick|settle) with|go(?:ing)? with|(?:we|i) (?:decided|chose|picked|agreed|settled)|decided|decision|settled on|agreed|final (?:answer|choice|call|pick)|stick with|keep (?:it|using)|the plan is|(?:we|i)'ll use|use [\w.-]+ (?:for|instead)|instead of|switch(?:ed)? to|from now on|sounds good|ship it|approved|that's the one|we'll keep)\b/i;
  const OPEN = /(?:\?\s*$|\b(?:open question|not sure|unsure|tbd|to be decided|undecided|should we|do we want|which one|still need to|todo|to do|haven't decided|not decided|up in the air|figure out|later)\b)/i;
  const FENCE = /```[\s\S]*?(?:```|$)/g;
  const ROLES = new Set(['user', 'assistant', 'opinion', 'collab']);
  const K1 = 1.2; const B = 0.75;
  const DAY = 86400e3;

  function stem(w) {
    if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
    if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
    else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
    else if (w.length > 4 && w.endsWith('es') && /(?:ch|sh|ss|x|z)es$/.test(w)) w = w.slice(0, -2);
    else if (w.length > 3 && w.endsWith('s') && !/(?:ss|us|is)$/.test(w)) w = w.slice(0, -1);
    if (w.length > 4 && w.endsWith('ly')) w = w.slice(0, -2);
    if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
    return w;
  }
  const words = (text) => String(text || '').replace(FENCE, ' ').toLowerCase().replace(/[’‘]/g, '\'').match(/[a-z0-9À-ɏ][a-z0-9À-ɏ']*/g) || [];
  function tokens(text, extraStop = null) {
    const out = [];
    for (let w of words(text)) {
      w = w.replace(/'s$|'+$/g, '');
      if (w.length < 2 || STOP.has(w) || (extraStop && extraStop.has(w)) || w.length > 40) continue;
      out.push(stem(w));
    }
    return out;
  }
  // the words of a question that matter; when only scaffolding is left, all of its non-stop words
  function questionTerms(q) {
    const t = [...new Set(tokens(q, ASK))];
    return t.length ? t : [...new Set(tokens(q))];
  }
  const isQuestion = (q) => {
    const s = String(q || '').trim();
    if (s.split(/\s+/).length < 2) return false;
    return /\?$/.test(s) || /^(?:what|whats|what's|why|how|when|where|which|who|did|do|does|should|can|could|is|are|was|were|remind|recall|have we|had we)\b/i.test(s) || /\b(?:decid|agree|settle|chose|pick)/i.test(s);
  };

  // ---------- snippets ----------
  const plain = (s) => s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`#>|]+/g, '').replace(/^\s*(?:[-+]\s+|\d+[.)]\s+)/, '').replace(/\s+/g, ' ').trim();
  const sentences = (text) => String(text || '').replace(FENCE, '\n').split(/(?<=[.!?])\s+(?=[A-Z0-9"'“(])|\n+/).map(plain).filter((s) => s.length > 1);
  function clip(s, terms, max = 200) {
    if (s.length <= max) return s;
    const low = s.toLowerCase();
    let at = -1;
    for (const t of terms) { const i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) at = i; }
    const from = Math.max(0, Math.min(at < 0 ? 0 : at - 60, s.length - max));
    return `${from > 0 ? '…' : ''}${s.slice(from, from + max).trim()}${from + max < s.length ? '…' : ''}`;
  }
  // the best sentence of a message for these terms: { text, kind: 'decision' | 'open' | 'mention' }
  function snippet(text, terms) {
    let best = null;
    for (const s of sentences(text)) {
      const st = new Set(tokens(s));
      const hits = terms.filter((t) => st.has(t)).length;
      const dec = DECIDE.test(s); const open = !dec && OPEN.test(s);
      const score = hits * 2 + (hits && dec ? 1.5 : 0) + (hits && open ? 0.6 : 0) - s.length / 2000;
      if (!best || score > best.score) best = { s, score, hits, dec, open };
    }
    if (!best) return null;
    return { text: clip(best.s, terms), kind: best.hits && best.dec ? 'decision' : best.hits && best.open ? 'open' : 'mention', hits: best.hits };
  }

  // ---------- the index ----------
  // (round 34, lightweight) packed: one term table for every chat and, per term, one typed array of postings (chat
  // slot, message × 4096 + tf); each chat's messages are numbers in one Float64Array. The first layout (a Map of arrays
  // per chat, its own copy of every word) took ≈ 200 MB of the main process for 400 long chats, built by itself a minute
  // after every start; this one ≈ 20 MB. A changed chat still swaps in on its own: its old postings are skipped (its
  // slot is empty) and swept out once they outnumber the live ones. df counts messages (each message is a document)
  // when a chat comes and when it goes (it counted chats coming and messages going: a term could vanish from every search).
  const ROLE_OF = ['user', 'assistant', 'opinion', 'collab'];
  const ROLE_IX = new Map(ROLE_OF.map((r, i) => [r, i]));
  function createIndex() {
    const byKey = new Map(); // key → slot
    const slots = []; // slot → { key, src, sum, msgs: Float64Array [k, at, len, flags] per message, n, tids, tcounts, len, posts } | null
    const termId = new Map(); // term → id
    let df = new Int32Array(1024); // id → messages that have it
    const lists = []; // id → { a: Uint32Array, n } postings: slot, pos × 4096 + tf
    let N = 0; let total = 0; let live = 0; let dead = 0;
    function idOf(t) {
      let id = termId.get(t);
      if (id === undefined) {
        id = termId.size; termId.set(t, id); lists.push(null);
        if (id >= df.length) { const d = new Int32Array(df.length * 2); d.set(df); df = d; }
      }
      return id;
    }
    function post(id, slot, v) {
      let L = lists[id];
      if (!L) L = lists[id] = { a: new Uint32Array(8), n: 0 };
      if (L.n + 2 > L.a.length) { const b = new Uint32Array(L.a.length * 2); b.set(L.a); L.a = b; }
      L.a[L.n++] = slot; L.a[L.n++] = v;
    }
    // old postings out; tight: every list cut to its size (after a catch-up, when nothing is added for a while)
    function sweep(tight = false) {
      for (const L of lists) {
        if (!L) continue;
        let w = 0;
        if (dead) { for (let i = 0; i < L.n; i += 2) if (slots[L.a[i]]) { L.a[w++] = L.a[i]; L.a[w++] = L.a[i + 1]; } } else w = L.n;
        L.n = w;
        if (tight ? L.a.length > w : L.a.length > 16 && w * 2 < L.a.length) L.a = L.a.slice(0, Math.max(tight ? 2 : 8, tight ? w : Math.ceil(w * 0.625) * 2));
      }
      dead = 0;
    }
    function drop(key) {
      const slot = byKey.get(key);
      if (slot === undefined) return;
      const c = slots[slot];
      for (let i = 0; i < c.tids.length; i++) df[c.tids[i]] -= c.tcounts[i];
      N -= c.n; total -= c.len; live -= c.posts; dead += c.posts;
      slots[slot] = null; byKey.delete(key);
      if (dead > 4096 && dead * 4 > live) sweep();
    }
    function add(key, chat, src = null) {
      drop(key);
      const slot = slots.length;
      const msgs = []; const per = new Map(); // term id → messages of this chat that have it
      let len = 0; let posts = 0;
      (chat.messages || []).forEach((m, k) => {
        if (!m || !ROLES.has(m.role) || !m.text) return;
        const text = String(m.text).slice(0, 40000);
        const toks = tokens(text);
        if (!toks.length) return;
        const pos = msgs.length / 4;
        const tf = new Map();
        for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
        for (const [t, n] of tf) { const id = idOf(t); post(id, slot, pos * 4096 + Math.min(n, 4095)); per.set(id, (per.get(id) || 0) + 1); df[id] += 1; posts += 1; }
        const plainText = text.replace(FENCE, ' ');
        msgs.push(k, m.at || chat.updatedAt || 0, toks.length, ROLE_IX.get(m.role) | (m.pinned || m.bookmark ? 4 : 0) | (DECIDE.test(plainText) ? 8 : 0) | (OPEN.test(plainText) ? 16 : 0));
        len += toks.length;
      });
      const n = msgs.length / 4;
      slots.push({ key, src, sum: { id: chat.id, agentId: chat.agentId, title: chat.title || 'Chat', updatedAt: chat.updatedAt || 0, pinned: Boolean(chat.pinned) }, msgs: Float64Array.from(msgs), n,
        tids: Uint32Array.from(per.keys()), tcounts: Uint32Array.from(per.values()), len, posts });
      byKey.set(key, slot);
      N += n; total += len; live += posts;
    }
    const msgOf = (c, pos) => { const b = pos * 4; const f = c.msgs[b + 3]; return { k: c.msgs[b], role: ROLE_OF[f & 3], at: c.msgs[b + 1], len: c.msgs[b + 2], mark: Boolean(f & 4), dec: Boolean(f & 8), open: Boolean(f & 16) }; };
    // textOf(key, k) → the message's text (the index keeps no texts); now: for recency (tests pass a fixed one)
    function search(q, { textOf, now = Date.now(), limit = 16, perChat = 2 } = {}) {
      const terms = questionTerms(q);
      const out = { terms, decisions: [], open: [], mentions: [], chats: byKey.size, messages: N };
      if (!terms.length || !N) return out;
      const avg = total / N || 1;
      const acc = new Map(); // `${key}\n${pos}` → { c, key, pos, s, matched }
      for (const t of terms) {
        const id = termId.get(t);
        const n = id === undefined ? 0 : df[id];
        if (n <= 0 || !lists[id]) continue;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        const L = lists[id];
        for (let i = 0; i < L.n; i += 2) {
          const c = slots[L.a[i]];
          if (!c) continue;
          const v = L.a[i + 1]; const pos = Math.floor(v / 4096); const tf = v % 4096;
          const mlen = c.msgs[pos * 4 + 2];
          const key = `${c.key}\n${pos}`;
          let a = acc.get(key);
          if (!a) { a = { c, key: c.key, pos, s: 0, matched: 0 }; acc.set(key, a); }
          a.s += idf * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * mlen / avg));
          a.matched += 1;
        }
      }
      const titleHas = (c) => { const tt = new Set(tokens(c.sum.title)); return terms.some((t) => tt.has(t)); };
      const ranked = [...acc.values()].map((a) => {
        const m = msgOf(a.c, a.pos);
        const cover = a.matched / terms.length;
        const ageDays = Math.max(0, (now - (m.at || 0)) / DAY);
        let s = a.s * (0.35 + 0.65 * cover * cover);
        s *= 1 + 0.4 * Math.exp(-ageDays / 30);
        if (a.c.sum.pinned) s *= 1.2;
        if (m.mark) s *= 1.6;
        if (m.dec) s *= 1.5; else if (m.open) s *= 1.1;
        if (m.role === 'user') s *= 1.1;
        if (titleHas(a.c)) s *= 1.15;
        return { ...a, m, score: s };
      }).sort((x, y) => y.score - x.score).slice(0, limit * 4);
      const per = new Map();
      for (const r of ranked) {
        const text = textOf ? textOf(r.key, r.m.k) : null;
        const snip = text ? snippet(text, terms) : null;
        if (!snip) continue;
        const kind = snip.kind;
        const group = kind === 'decision' ? out.decisions : kind === 'open' ? out.open : out.mentions;
        const pk = `${r.key}\n${kind}`;
        if ((per.get(pk) || 0) >= perChat) continue;
        per.set(pk, (per.get(pk) || 0) + 1);
        if (out.decisions.length + out.open.length + out.mentions.length >= limit) break;
        group.push({ chatId: r.c.sum.id, agentId: r.c.sum.agentId, title: r.c.sum.title, k: r.m.k, role: r.m.role, at: r.m.at, pinned: r.c.sum.pinned || r.m.mark, kind, snippet: snip.text, score: Math.round(r.score * 1000) / 1000 });
      }
      return out;
    }
    const termCount = () => { let n = 0; for (let i = 0; i < termId.size; i++) if (df[i] > 0) n += 1; return n; };
    return { has: (key, src) => byKey.has(key) && (src == null || slots[byKey.get(key)].src === src), add, drop, keys: () => [...byKey.keys()], size: () => ({ chats: byKey.size, messages: N, terms: termCount() }), search, trim: () => sweep(true),
      _bytes: () => lists.reduce((a, L) => a + (L ? L.a.byteLength : 0), 0) + slots.reduce((a, c) => a + (c ? c.msgs.byteLength + c.tids.byteLength * 2 : 0), 0) }; // (dev) its typed arrays' bytes
  }

  return { tokens, stem, questionTerms, isQuestion, snippet, sentences, createIndex, DECIDE, OPEN };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = RecallCore;
