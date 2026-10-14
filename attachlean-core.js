// Lean attachments (round 40, attachlean): the rules, pure (Node-tested by dev/attachlean-test.js, used by attachlean.js).
// Attachments are often the biggest token cost of a message: a whole code file, a 5 MB log, a long paste, a 4K
// screenshot, the same file again three messages later. What reaches the AI is decided here:
//   - pictures: sent at most 1568 px on the long side (what the models work at), the owner's file untouched;
//   - big text (files, logs, pastes): a short outline + the parts the message is about (its words, the line numbers it
//     names, errors and their stack traces, a log's head and tail), with the whole file one Read away;
//   - the same file again in a chat: one line pointing at the earlier message; changed: only the changed lines;
//   - "send whole" on a chip overrides all of it for that attachment.
// Tokens ≈ characters / 4 (as dev/tokens-test.js); pictures ≈ width × height / 750 (Claude's rate).
const AttachLeanCore = (() => {
  const MAX_PX = 1568;               // long side of a sent picture
  const WHOLE_TOK = 4000;            // text up to this goes whole when the AI can read the rest on demand
  const WHOLE_TOK_NOREAD = 12000;    // …and up to this when it can't (Astra without file access): quality first
  const BUDGET = 1600;               // tokens of slices for a trimmed text
  const PASTE_CHARS = 6000;          // a paste over this becomes a "Pasted text" chip (as before)
  const MAX_BYTES = 64 * 1024 * 1024; // a text file up to this can be attached (trimmed); was 200 KB
  const REF_WITHIN = 24;             // messages (both sides) a "same as before" reference may point back
  const LINE_CHARS = 400;            // a sent line is cut here (minified files)

  const tok = (s) => Math.ceil(String(s || '').length / 4);
  const imageTokens = (w, h) => Math.ceil((Number(w) || 0) * (Number(h) || 0) / 750);
  const fmtTok = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e4 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.max(0, Math.round(n))));
  const comma = (n) => Math.round(n).toLocaleString('en-US');

  // ---------- pictures ----------
  function fit(w, h, max = MAX_PX) {
    w = Number(w) || 0; h = Number(h) || 0;
    const long = Math.max(w, h);
    if (!w || !h || long <= max) return { w, h, scaled: false };
    const k = max / long;
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), scaled: true };
  }
  // what a picture is sent as: same format (PNG keeps text crisp), GIFs untouched (they may move)
  function imagePlan({ name = '', w, h, bytes = 0 }) {
    const ext = (String(name).match(/\.(\w+)$/) || [])[1]?.toLowerCase() || 'png';
    const f = fit(w, h);
    const whole = imageTokens(w, h);
    if (ext === 'gif' || !f.scaled) return { scale: false, w, h, tokens: whole, wholeTokens: whole, bytes };
    const type = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
    return { scale: true, w: f.w, h: f.h, tokens: imageTokens(f.w, f.h), wholeTokens: whole, type, ext: type === 'image/jpeg' ? 'jpg' : type.split('/')[1] };
  }

  // ---------- reading a text ----------
  const CODE_EXT = /\.(js|mjs|cjs|ts|tsx|jsx|py|rb|go|rs|java|kt|c|cc|cpp|h|hpp|cs|swift|php|lua|sh|ps1|bat|glsl|frag|vert|css|scss|html?|vue|svelte|sql|json|ya?ml|toml|xml|ini)$/i;
  const STAMP = /^\s*(\[?\d{4}-\d\d-\d\d[T ]\d\d:\d\d|\[?\d\d:\d\d:\d\d|\[(?:INFO|WARN|ERROR|DEBUG|TRACE)\]|(?:INFO|WARN|WARNING|ERROR|DEBUG|TRACE)\b|[A-Z][a-z]{2} +\d+ \d\d:\d\d:\d\d)/;
  function kindOf(name, text) {
    if (/\.(log|out|err)$/i.test(name)) return 'log';
    if (/\.(md|markdown|rst|adoc)$/i.test(name)) return 'doc';
    if (CODE_EXT.test(name)) return 'code';
    const first = String(text).slice(0, 20000).split('\n').slice(0, 80).filter((l) => l.trim());
    if (first.length >= 8 && first.filter((l) => STAMP.test(l)).length / first.length > 0.4) return 'log';
    if (first.filter((l) => /^#{1,6} /.test(l)).length >= 2) return 'doc';
    if (first.length >= 8 && first.filter((l) => /[;{}]\s*$|^\s*(import|export|const|let|def|function|class|return)\b/.test(l)).length / first.length > 0.3) return 'code';
    return 'text';
  }
  const cut = (l) => (l.length > LINE_CHARS ? `${l.slice(0, LINE_CHARS)}… (${comma(l.length)} chars)` : l);

  // the shape of a text: functions / classes / headings with their line numbers (≤ 40 lines)
  const OUTLINE = {
    code: /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?\s+[\w$]+|class\s+[\w$]+|(?:const|let|var)\s+[\w$]+\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>|(?:const|let|var)\s+[A-Z][\w$]*\s*=\s*(?:\(|function|class|\{)|def\s+\w+|(?:pub\s+)?(?:fn|func|impl|struct|enum|trait|interface|type)\s+\w+|(?:public|private|protected|static|internal)\s[\w<>\[\], ]*\(|#region\b|\/\/\s*-{3,}|#\s*-{3,})/,
    doc: /^#{1,6}\s+\S/,
    text: /^(?:[A-Z][A-Z0-9 ,'&/-]{3,60}:?|\d+(?:\.\d+)*[.)]\s+[A-Z].{0,80})\s*$/,
  };
  function outline(lines, kind, max = kind === 'code' ? 60 : 40) {
    const re = OUTLINE[kind];
    if (!re) return [];
    let out = [];
    for (let i = 0; i < lines.length && out.length < 4000; i++) if (re.test(lines[i])) out.push({ n: i + 1, text: lines[i].trim().replace(/\s*\{\s*$/, '').slice(0, 100), ind: lines[i].search(/\S/) });
    if (out.length > max) { // keep the outermost first, then declarations (functions, classes), then thin evenly
      const minInd = Math.min(...out.map((o) => o.ind));
      const top = out.filter((o) => o.ind <= minInd + 2);
      out = top.length >= 6 ? top : out;
      const decl = out.filter((o) => /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|def|fn|func|impl|struct|interface)\b|^#{1,3}\s/.test(o.text));
      if (out.length > max && decl.length >= 6) out = decl;
      if (out.length > max) { const k = out.length / max; out = Array.from({ length: max }, (_, i) => out[Math.floor(i * k)]); }
    }
    return out;
  }

  // what the message asks about: its words (identifiers, quoted bits), line numbers, and whether it's about errors
  const STOP = new Set(('the this that these those with from have has had what when where which there their about would could should into your yours them then than also just like make made does doing done why how for and are was were will can not but all any its it\'s file files line lines look looks please help here more some only need want show tell code text paste pasted attached attachment log logs see find fix wrong right work works working thing things something does doesn\'t don\'t isn\'t can\'t won\'t into onto over under after before again still very much many most other each every same while being been they them you yours mine our ours who whom whose way ways use used using get got give gave take took know think says said read reads write wrote error errors happen happens happening going does did done why what which ok okay thanks thank hey hi hello').split(' '));
  function terms(message) {
    const m = String(message || '');
    const quoted = [...m.matchAll(/"([^"\n]{3,80})"|`([^`\n]{2,80})`|'([^'\n]{3,80})'/g)].map((x) => (x[1] || x[2] || x[3]).trim()).filter(Boolean);
    const words = [...m.matchAll(/[A-Za-z_$][\w$]*(?:[.:-][A-Za-z_$][\w$]*)*/g)].map((x) => x[0]).filter((w) => w.length >= 4 && !STOP.has(w.toLowerCase()));
    const nums = [...m.matchAll(/\b(?:lines?|lignes?|l\.?|rows?)\s*#?(\d{1,7})(?:\s*(?:-|–|to)\s*(\d{1,7}))?/gi)].map((x) => [Number(x[1]), Number(x[2] || x[1])]);
    const named = [...m.matchAll(/\b([A-Za-z]{3,}\s+#?\d{1,6})\b/g)].map((x) => x[1].replace(/\s+#?/, ' ')).filter((x) => !/^(lines?|lignes?|rows?)\s/i.test(x)); // "shot 42", "bar 17"
    const codes = [...m.matchAll(/\b(?:[A-Z]{2,}[_-]?\d{2,}|E[A-Z]{3,}|0x[0-9a-f]{4,}|\d{3,})\b/g)].map((x) => x[0]);
    const seen = new Set();
    const list = [];
    for (const w of [...quoted, ...named, ...codes, ...words]) { const k = w.toLowerCase(); if (!seen.has(k) && list.length < 14) { seen.add(k); list.push(k); } }
    return { words: list, lines: nums.slice(0, 6), errors: /\b(errors?|crash\w*|fail\w*|exception|bug|broke\w*|stack|trace\w*|warn\w*|panic|freez\w*|hang\w*)\b/i.test(m) };
  }

  const ERR = /\b(error|exception|fatal|panic|traceback|failed|failure|uncaught|unhandled|segfault|critical|assert(?:ion)?(?:error)?)\b/i;
  const FRAME = /^\s+(at |File "|from |\.\.\.|#\d+ )|^\s*Caused by:|^\s+\^/;
  const normErr = (l) => l.replace(STAMP, '').replace(/0x[0-9a-f]+|\d+/gi, '#').replace(/\s+/g, ' ').trim().slice(0, 160);

  // Picks the parts of a text to send. Returns ranges [{ a, b, why }] (1-based, inclusive) inside the token budget.
  function pick(lines, kind, q, budget = BUDGET) {
    const N = lines.length;
    const cand = [];
    const add = (a, b, score, why) => { a = Math.max(1, a); b = Math.min(N, b); if (a <= b) cand.push({ a, b, score, why }); };
    for (const [x, y] of q.lines) if (x <= N) add(x - 8, Math.min(y, x + 80) + 8, 100, `line ${x}${y !== x ? `–${y}` : ''} you named`);
    const ctx = kind === 'code' ? 6 : kind === 'log' ? 3 : 4;
    const decl = new Map(); // line of a declaration → line of the next one
    if (kind === 'code' || kind === 'doc') { const all = outline(lines, kind, Infinity); all.forEach((o, k) => decl.set(o.n, all[k + 1]?.n || N + 1)); }
    // the message's words: a line scores one per distinct word it has
    if (q.words.length) {
      let hits = 0;
      const logSeen = new Map(); // a log repeats itself: a line like one already picked counts once (its first and last time)
      const lastOf = new Map();
      if (kind === 'log') for (let i = 0; i < N; i++) { const l = lines[i].toLowerCase(); if (q.words.some((w) => l.includes(w))) lastOf.set(normErr(lines[i]), i); }
      for (let i = 0; i < N && hits < 400; i++) {
        const l = lines[i].toLowerCase();
        let s = 0; const got = [];
        for (const w of q.words) if (l.includes(w)) { s += /\s/.test(w) ? 3 : 1; got.push(w); }
        if (s && kind === 'log') { const k = normErr(lines[i]); const n = (logSeen.get(k) || 0) + 1; logSeen.set(k, n); if (n > 1 && lastOf.get(k) !== i) continue; }
        if (!s) continue;
        hits += 1;
        const why = `“${got.slice(0, 2).join('”, “')}”`;
        // a declaration the message names: the whole of it (to the next one, ≤ 80 lines)
        const d = decl.get(i + 1);
        if (d) add(i + 1 - 1, Math.min(d - 1, i + 80), 10 * s + 5, why);
        else add(i + 1 - ctx, i + 1 + ctx, 10 * s, why);
      }
    }
    // errors and their stack traces (every log; any text when the message is about errors); one per kind of error,
    // its first and last time, with how many times it happened
    const errs = new Map();
    if (kind === 'log' || q.errors) {
      for (let i = 0; i < N; i++) {
        if (!ERR.test(lines[i])) continue;
        const k = normErr(lines[i]);
        const e = errs.get(k) || { n: 0, first: i, last: i };
        e.n += 1; e.last = i; errs.set(k, e);
      }
      const stackEnd = (i) => { let j = i + 1; while (j < N && j < i + 40 && FRAME.test(lines[j])) j += 1; return j; };
      for (const e of errs.values()) {
        add(e.first + 1 - 2, stackEnd(e.first) + 1, kind === 'log' ? 30 : 6, `error${e.n > 1 ? ` ×${comma(e.n)} (first)` : ''}`);
        if (e.n > 1 && e.last !== e.first) add(e.last + 1 - 1, stackEnd(e.last) + 1, kind === 'log' ? 12 : 5, `error ×${comma(e.n)} (last)`);
      }
    }
    // a log's head and tail; a code file's head when nothing else matched
    if (kind === 'log') { add(1, 10, 15, 'start'); add(N - 29, N, 20, 'end'); }
    else if (!cand.length) add(1, kind === 'code' ? 40 : 30, 4, 'start');
    // take the best candidates first (only the lines not taken yet cost anything), inside the budget; then the taken
    // lines form the parts, each labelled by the best candidate in it
    const lt = (i) => Math.ceil((cut(lines[i - 1]).length + 8) / 4);
    const taken = new Uint8Array(N + 2);
    const label = new Array(N + 2);
    let left = budget;
    for (const c of cand.sort((x, y) => y.score - x.score || x.a - y.a)) {
      let cost = 8; let b = c.a - 1;
      for (let i = c.a; i <= c.b; i++) { const t = taken[i] ? 0 : lt(i); if (cost + t > left) break; cost += t; b = i; }
      if (b < c.a || (b < c.b && left < 60)) continue; // nothing (or a stub) fits
      for (let i = c.a; i <= b; i++) { if (!taken[i]) { taken[i] = 1; label[i] = c; } }
      left -= cost;
      if (left < 20) break;
    }
    const out = [];
    for (let i = 1; i <= N; i++) {
      if (!taken[i]) continue;
      const r = out.at(-1);
      if (r && r.b === i - 1) { r.b = i; if (label[i].score > r.score) { r.score = label[i].score; r.why = label[i].why; } } else out.push({ a: i, b: i, score: label[i].score, why: label[i].why });
    }
    return { ranges: out, errors: errs };
  }

  // A log's one-line summary: lines, first / last time, errors and warnings
  function logSummary(lines, errs) {
    const stamp = (l) => (l.match(/\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d|\b\d\d:\d\d:\d\d\b/) || [])[0];
    let first = null; let last = null;
    for (let i = 0; i < Math.min(lines.length, 200) && !first; i++) first = stamp(lines[i]);
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 200) && !last; i--) last = stamp(lines[i]);
    let warns = 0;
    for (const l of lines) if (/\bwarn(ing)?\b/i.test(l)) warns += 1;
    const nErr = [...errs.values()].reduce((s, e) => s + e.n, 0);
    return `${comma(lines.length)} lines${first && last ? ` · ${first} → ${last}` : ''} · ${comma(nErr)} error line${nErr === 1 ? '' : 's'}${errs.size > 1 ? ` (${errs.size} kinds)` : ''} · ${comma(warns)} warning${warns === 1 ? '' : 's'}`;
  }

  // ---------- one text attachment ----------
  // a: { name, text, message, canRead, path (the whole copy the AI can open), whole (send whole), pasted }
  // → { text: what goes in the message, tokens, wholeTokens, mode: 'whole' | 'lean', ranges }
  function leanText({ name, text, message = '', canRead = true, path = null, whole = false, engine = 'claude' }) {
    const full = String(text || '');
    const wholeTokens = tok(full);
    const wrap = (body, attrs = '') => `<file name="${name}"${attrs}>\n${body}\n</file>`;
    const limit = canRead ? WHOLE_TOK : WHOLE_TOK_NOREAD;
    if (whole || wholeTokens <= limit) { const t = wrap(full); return { text: t, tokens: tok(t), wholeTokens, mode: 'whole' }; }
    const lines = full.split(/\r?\n/);
    const kind = kindOf(name, full);
    const q = terms(message);
    const { ranges, errors } = pick(lines, kind, q);
    const head = [];
    head.push(kind === 'log' ? `Log: ${logSummary(lines, errors)}.` : `${comma(lines.length)} lines, ≈ ${fmtTok(wholeTokens)} tokens in all.`);
    const ol = kind === 'log' ? [] : outline(lines, kind);
    if (ol.length) head.push(`Outline (line: what):\n${ol.map((o) => `${o.n}: ${o.text}`).join('\n')}`);
    const all = kind === 'code' ? outline(lines, kind, Infinity) : [];
    const short = (o) => o.text.replace(/^\s*(export\s+)?(default\s+)?(async\s+)?/, '').slice(0, 50);
    const inside = (a, b) => {
      const at = all.find((x) => x.n >= a && x.n <= b && !/^(\/\/|#\s*-)/.test(x.text));
      if (at) return `, ${short(at)} at line ${at.n}`;
      let o = null; for (const x of all) { if (x.n > a) break; o = x; }
      return o ? `, in ${short(o)} at line ${o.n}` : '';
    };
    const body = ranges.map((r) => {
      const width = String(r.b).length;
      const ls = [];
      for (let i = r.a - 1; i < r.b; i++) ls.push(`${String(i + 1).padStart(width)}│ ${cut(lines[i])}`);
      return `--- lines ${r.a}–${r.b} (${r.why}${inside(r.a, r.b)}) ---\n${ls.join('\n')}`;
    });
    const sentLines = ranges.reduce((s, r) => s + r.b - r.a + 1, 0);
    const more = canRead && path
      ? `[Only these ${comma(sentLines)} of ${comma(lines.length)} lines are included. The whole file is at ${path}: read other parts with your ${engine === 'codex' ? 'read-only commands (e.g. sed -n \'400,520p\')' : 'Read tool (offset / limit)'} when you need them.]`
      : `[Only these ${comma(sentLines)} of ${comma(lines.length)} lines are included. If you need other parts, say which lines: the user can send them, or send the whole file.]`;
    const t = wrap(`${head.join('\n')}\n${body.join('\n')}\n${more}`, ` lines="${lines.length}" sent="part"`);
    return { text: t, tokens: tok(t), wholeTokens, mode: 'lean', ranges, kind };
  }

  // ---------- the same file again ----------
  const hash = (s) => { s = String(s || ''); let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return `${(h >>> 0).toString(16).padStart(8, '0')}${s.length.toString(36)}`; };
  const clock = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  // Line diff of a → b: hunks with 2 lines of context, new line numbers. Common start / end trimmed first; the middle
  // by LCS when small enough, else as one replaced block.
  function diff(a, b, { context = 2, maxCells = 4e6 } = {}) {
    const A = String(a).split(/\r?\n/); const B = String(b).split(/\r?\n/);
    let p = 0; while (p < A.length && p < B.length && A[p] === B[p]) p += 1;
    let s = 0; while (s < A.length - p && s < B.length - p && A[A.length - 1 - s] === B[B.length - 1 - s]) s += 1;
    const a1 = A.slice(p, A.length - s); const b1 = B.slice(p, B.length - s);
    const ops = []; // { t: ' ' | '-' | '+', l, ai, bi }
    if (a1.length * b1.length <= maxCells && a1.length && b1.length) {
      const n = a1.length; const m = b1.length;
      const L = new Uint32Array((n + 1) * (m + 1));
      for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * (m + 1) + j] = a1[i] === b1[j] ? L[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(L[(i + 1) * (m + 1) + j], L[i * (m + 1) + j + 1]);
      let i = 0; let j = 0;
      while (i < n || j < m) {
        if (i < n && j < m && a1[i] === b1[j]) { ops.push({ t: ' ', l: a1[i], bi: p + j + 1 }); i += 1; j += 1; }
        else if (i < n && (j >= m || L[(i + 1) * (m + 1) + j] >= L[i * (m + 1) + j + 1])) { ops.push({ t: '-', l: a1[i], bi: p + j + 1 }); i += 1; }
        else { ops.push({ t: '+', l: b1[j], bi: p + j + 1 }); j += 1; }
      }
    } else {
      for (const l of a1) ops.push({ t: '-', l, bi: p + 1 });
      b1.forEach((l, j) => ops.push({ t: '+', l, bi: p + j + 1 }));
    }
    // context from the trimmed start / end
    const pre = A.slice(Math.max(0, p - context), p).map((l, k) => ({ t: ' ', l, bi: p - Math.min(p, context) + k + 1 }));
    const post = B.slice(B.length - s, B.length - s + context).map((l, k) => ({ t: ' ', l, bi: B.length - s + k + 1 }));
    const all = [...pre, ...ops, ...post];
    const changed = all.map((o, k) => (o.t !== ' ' ? k : -1)).filter((k) => k >= 0);
    if (!changed.length) return { hunks: [], added: 0, removed: 0, text: '' };
    const hunks = [];
    for (const k of changed) {
      const h = hunks.at(-1);
      if (h && k - h.to <= context * 2 + 1) h.to = k; else hunks.push({ from: k, to: k });
    }
    const lines = [];
    for (const h of hunks) {
      const from = Math.max(0, h.from - context); const to = Math.min(all.length - 1, h.to + context);
      const nb = all.slice(from, to + 1).filter((o) => o.t !== '-');
      lines.push(`@@ new lines ${nb[0]?.bi ?? all[from].bi}–${nb.at(-1)?.bi ?? all[from].bi} @@`);
      for (let k = from; k <= to; k++) lines.push(`${all[k].t}${cut(all[k].l)}`);
    }
    return { hunks, added: ops.filter((o) => o.t === '+').length, removed: ops.filter((o) => o.t === '-').length, text: lines.join('\n') };
  }

  // What to do with an attachment already seen in this chat. seen: { hash, at, lean, copy, valid } (valid: the engine
  // session still holds that message). → { mode: 'same' | 'diff' | 'new', text?, tokens? }
  function again({ name, text, seen, prev = null, canRead = true, whole = false }) {
    if (!seen || !seen.valid || whole) return { mode: 'new' };
    const h = hash(text);
    const when = `your message at ${clock(seen.at)}`;
    const where = canRead && seen.copy ? ` (the whole file: ${seen.copy})` : '';
    if (h === seen.hash) {
      if (seen.lean && !(canRead && seen.copy)) return { mode: 'new', note: `unchanged since ${when}` };
      const t = `<file name="${name}" same-as="${when}">Unchanged since ${when}: it's earlier in this chat${where}.</file>`;
      return { mode: 'same', text: t, tokens: tok(t) };
    }
    if (prev == null || seen.lean) return { mode: 'new', note: `changed since ${when}` };
    const d = diff(prev, text);
    const t = `<file name="${name}" changed-since="${when}">Changed since ${when} (that version is earlier in this chat): ${d.added} line${d.added === 1 ? '' : 's'} added, ${d.removed} removed. Only the changes, with the new line numbers:\n${d.text}\n</file>`;
    // a diff bigger than half the file (or than the trimmed send) isn't worth it
    if (tok(t) > tok(text) * 0.5) return { mode: 'new', note: `changed since ${when}` };
    return { mode: 'diff', text: t, tokens: tok(t), added: d.added, removed: d.removed };
  }

  // A seen record is still in the engine's memory when its session is the chat's and it's recent enough.
  function valid(rec, { sessionId, messages }) {
    return Boolean(rec && sessionId && rec.sid === sessionId && typeof rec.n === 'number' && messages - rec.n <= REF_WITHIN);
  }

  // The chip's words: "≈ 1.5k of 14k tok" / "sent at 1568 px · ≈ 1.8k tok" / "same as 14:02" (and "whole" when forced)
  function chipText(s) {
    if (!s) return '';
    if (s.same) return `same as ${s.same} · ≈ ${fmtTok(s.tokens)} tok`;
    if (s.kind === 'image') return s.whole ? `whole · ≈ ${fmtTok(s.wholeTokens)} tok` : s.scale ? `sent at ${MAX_PX} px · ≈ ${fmtTok(s.tokens)} tok` : `≈ ${fmtTok(s.tokens)} tok`;
    if (s.whole) return `whole · ≈ ${fmtTok(s.wholeTokens)} tok`;
    if (s.mode === 'lean') return `≈ ${fmtTok(s.tokens)} of ${fmtTok(s.wholeTokens)} tok`;
    return `≈ ${fmtTok(s.tokens)} tok`;
  }

  return { MAX_PX, WHOLE_TOK, WHOLE_TOK_NOREAD, BUDGET, PASTE_CHARS, MAX_BYTES, REF_WITHIN, tok, imageTokens, fmtTok, fit, imagePlan, kindOf, outline, terms, pick, logSummary, leanText, hash, clock, diff, again, valid, chipText };
})();
if (typeof module !== 'undefined') module.exports = AttachLeanCore;
