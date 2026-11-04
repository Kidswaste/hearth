// (round 114, findaccents114) Find in a chat (Alt+F) ignores accents, capitals and ligatures, like the rest of search
// (round 113): "sohne" finds "Söhne", "cafe" finds "café", "l'eglise" finds "L’Église", "oeuvre" finds "œuvre".
// One folding for every find: recall-core.js's fold (the one Ctrl/⌘+K, the chats filter, Find in this project and
// recall use), plus ’ ‘ → ' (a typed apostrophe finds a curly one) and ς → σ (a word's last sigma, folded the same
// whether the word stands alone or not). Used by:
//   · the window (lazy group "chatfind", with recall-core.js): chat-ux.js's Alt+F marks (markAll), chat-rest.js's
//     resting messages
//   · the store thread (storework.js op chatFind, a windowed giant chat; chatwin-core.js findHit) and the Node tests
//     (dev/findaccents114-test.js)
//   fold(s)             the folded text (has / count work on it)
//   foldMap(s)          { f, at, to }: the folded text and, for each of its units, where its character starts / ends in s
//   ranges(text, fq)    the places of fq (folded) in text, as [start, end) of the ORIGINAL text: a highlight covers the
//                       letters typed, their accents (a combining mark after the last letter too) and a whole ligature
//   has(text, fq)       is fq in the folded text?
//   foldBytes(b, els)   a giant chat's bytes (its JSON as on disk) folded message by message, JSON escapes read:
//                       { buf, at } (at: each message's [start, end) in buf). A search there only picks the messages to
//                       read; each one is then tested on its parsed text (findHit), so the answer is always exact
//   markAll(list, q, near)  the window's marks (chat-ux.js find: about 200 near where you are, stand-ins for the rest)
const FindFold = (() => {
  const R = typeof RecallCore !== 'undefined' ? RecallCore : require('./recall-core.js');
  const ASCII = /^[\x00-\x7f]*$/;
  const EXTRA = /[’‘ς]/g; const EX = { '’': '\'', '‘': '\'', ς: 'σ' };
  const fold = (s) => { s = String(s ?? ''); return ASCII.test(s) ? s.toLowerCase() : R.fold(s).replace(EXTRA, (c) => EX[c]); };
  const one = new Map(); // a character → its folding (each character folded on its own: the map below needs it)
  const foldCh = (ch) => { let g = one.get(ch); if (g === undefined) { g = fold(ch); if (one.size < 20000) one.set(ch, g); } return g; };
  const width = (s, i) => { const c = s.charCodeAt(i); return c >= 0xd800 && c <= 0xdbff && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00 ? 2 : 1; };
  function foldMap(s) {
    s = String(s ?? '');
    const parts = []; const at = []; const to = [];
    for (let i = 0; i < s.length;) {
      const c = s.charCodeAt(i);
      if (c < 128) { parts.push(c >= 65 && c <= 90 ? String.fromCharCode(c | 32) : s[i]); at.push(i); to.push(i + 1); i += 1; continue; }
      const n = width(s, i); const g = foldCh(s.slice(i, i + n));
      for (let j = 0; j < g.length; j++) { at.push(i); to.push(i + n); }
      parts.push(g); i += n;
    }
    return { f: parts.join(''), at, to };
  }
  const has = (text, fq) => Boolean(fq) && text != null && fold(text).includes(fq);
  function ranges(text, fq, max = Infinity) {
    const out = [];
    text = String(text ?? '');
    if (!fq || !text) return out;
    if (ASCII.test(text)) { // (the usual case: the folded text is the lowered text, place for place)
      const low = text.toLowerCase();
      for (let i = low.indexOf(fq); i >= 0 && out.length < max; i = low.indexOf(fq, i + fq.length)) out.push([i, i + fq.length]);
      return out;
    }
    const m = foldMap(text);
    for (let i = m.f.indexOf(fq); i >= 0 && out.length < max; i = m.f.indexOf(fq, i + fq.length)) {
      const s = m.at[i]; let e = m.to[i + fq.length - 1];
      while (e < text.length) { const n = width(text, e); if (foldCh(text.slice(e, e + n)) !== '') break; e += n; } // (its accents typed apart: "e" + U+0301)
      if (out.length && s < out[out.length - 1][1]) continue; // (two finds in one ligature: "s" twice in "ß")
      out.push([s, e]);
    }
    return out;
  }

  // ---------- the store thread: a giant chat's bytes ----------
  const hex = (b, p) => { let v = 0; for (let j = 0; j < 4; j++) { const c = b[p + j]; const d = c >= 48 && c <= 57 ? c - 48 : c >= 97 && c <= 102 ? c - 87 : c >= 65 && c <= 70 ? c - 55 : -1; if (d < 0) return -1; v = v * 16 + d; } return v; };
  const ESC = { 0x6e: 10, 0x74: 9, 0x72: 13, 0x62: 8, 0x66: 12 }; // \n \t \r \b \f
  function foldBytes(b, els) {
    const n = els.length / 2; const at = new Float64Array(n * 2);
    let out = Buffer.allocUnsafe(Math.max(64, Math.ceil(b.length * 1.02))); let o = 0;
    const room = (k) => { if (o + k <= out.length) return; const nb = Buffer.allocUnsafe(Math.max(out.length * 2, o + k + 64)); out.copy(nb, 0, 0, o); out = nb; };
    const enc = new Map(); // a code point → its folding in UTF-8
    const put = (cp) => { let x = enc.get(cp); if (!x) { x = Buffer.from(foldCh(String.fromCodePoint(cp)), 'utf8'); enc.set(cp, x); } room(x.length); x.copy(out, o); o += x.length; };
    for (let k = 0; k < n; k++) {
      let p = els[k * 2]; const end = els[k * 2 + 1];
      at[k * 2] = o;
      while (p < end) {
        room(end - p);
        let c = b[p];
        while (c < 0x80 && c !== 0x5c) { out[o++] = c >= 65 && c <= 90 ? c | 32 : c; if (++p >= end) break; c = b[p]; } // a plain run, lowered
        if (p >= end) break;
        if (c === 0x5c) { // a JSON escape, read
          const d = b[p + 1];
          if (d === 0x75) {
            let cp = hex(b, p + 2);
            if (cp < 0) { room(1); out[o++] = c; p += 1; continue; }
            p += 6;
            if (cp >= 0xd800 && cp <= 0xdbff && b[p] === 0x5c && b[p + 1] === 0x75) { const lo = hex(b, p + 2); if (lo >= 0xdc00 && lo <= 0xdfff) { cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00); p += 6; } }
            if (cp < 0x80) { room(1); out[o++] = cp >= 65 && cp <= 90 ? cp | 32 : cp; } else put(cp);
          } else { room(1); out[o++] = ESC[d] ?? d; p += 2; }
          continue;
        }
        // a character in UTF-8
        const len = c >= 0xf0 ? 4 : c >= 0xe0 ? 3 : c >= 0xc0 ? 2 : 1;
        let cp = len === 1 ? -1 : c & (0xff >> (len + 1));
        for (let j = 1; j < len && cp >= 0; j++) { const x = b[p + j]; cp = p + j < end && (x & 0xc0) === 0x80 ? (cp << 6) | (x & 0x3f) : -1; }
        if (cp < 0x80 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) { room(1); out[o++] = c; p += 1; continue; } // (not UTF-8: the byte as it is)
        put(cp); p += len;
      }
      at[k * 2 + 1] = o;
    }
    return { buf: out.subarray(0, o), at };
  }

  // ---------- the window: Alt+F's marks (moved here from chat-ux.js, round 114) ----------
  const lowText = new WeakMap(); // a message's node → its folded text (while it is the same node)
  function markAll(list, q, near) {
    const hits = [];
    const needle = fold(q);
    if (!needle) return hits;
    const nodes = [];
    // (round 113, search113) a common word in the drawn part of a long chat: every match was marked at once (557 marks in
    // 27 messages of 40 KB: 1.1–1.2 s of the window; "t": 23,000). The messages nearest where you are are marked, about
    // 200 marks in all; the other messages with it are stand-ins (their index), marked when you step to them
    const ix = (r) => Number(r.dataset?.index ?? -1);
    const with_ = []; let total = 0; const end = list.lastElementChild;
    // (each message's folded text kept while it is the same node; never the last one, a reply may be streaming into it)
    for (const r of list.children) { let t = lowText.get(r); if (t == null) { t = fold(r.textContent); if (r !== end) lowText.set(r, t); } let c = 0; for (let i = t.indexOf(needle); i >= 0 && c < 400; i = t.indexOf(needle, i + needle.length)) c += 1; if (c) with_.push([r, c]); }
    if (near == null) near = ix(with_[with_.length - 1]?.[0] || {});
    const roots = [];
    for (const [r, c] of with_.sort((a, b) => Math.abs(ix(a[0]) - near) - Math.abs(ix(b[0]) - near))) {
      if (!roots.length || ix(r) < 0 || total + c <= 200) { roots.push(r); total += c; } else hits.push({ index: ix(r) });
    }
    // (round 35, streamrender) only the messages whose text has it are walked
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: (x) => (x.parentElement.closest('.msg .body, .msg .thinking-text') && !x.parentElement.closest('.code-acts, .copy-code, .code-label, .note-acts') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
      });
      while (walker.nextNode()) nodes.push(walker.currentNode);
    }
    for (const node of nodes) {
      if (hits.length > 600) break; // (one message alone with thousands: its first 600)
      const text = node.nodeValue;
      const rs = ranges(text, needle);
      if (!rs.length) continue;
      const frag = document.createDocumentFragment();
      let from = 0;
      for (const [s, e] of rs) { // (the original letters marked: "Söhne" for "sohne", "œuvre" for "oeuvre")
        frag.append(text.slice(from, s));
        const mark = el('mark', { class: 'find-hit', text: text.slice(s, e) });
        frag.append(mark); hits.push(mark); from = e;
      }
      frag.append(text.slice(from));
      node.replaceWith(frag);
    }
    return hits;
  }
  return { fold, foldMap, ranges, has, foldBytes, markAll };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FindFold;
