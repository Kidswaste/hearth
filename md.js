// Small, safe Markdown renderer for native chat replies. Everything is HTML-escaped first;
// only the formatting below is turned back into markup. Supports headings, lists (nested by indent,
// task lists), quotes and callouts (> [!NOTE]), tables with column alignment, fenced code, ==highlights==,
// [[keys]], and light math ($x^2$, $$…$$ shown as formulas with superscripts / subscripts / Greek letters).
(() => {
  // (round 20, offmain) this file also runs as the Markdown worker (new Worker('md.js')): long chats are rendered there
  // and the window's thread only inserts the result (Md.warm below). No DOM is used while rendering.
  const G = typeof window !== 'undefined' ? window : self;
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }; // (round 16) one table, not one per character
  const ESC_RE = /[&<>"']/;
  const escape = (s) => (ESC_RE.test(s) ? s.replace(/[&<>"']/g, (c) => ESC[c]) : s);

  // Math-light: no TeX engine, just readable formulas.
  const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω', infty: '∞', cdot: '·', times: '×', pm: '±', leq: '≤', geq: '≥', neq: '≠', approx: '≈', to: '→', sqrt: '√', sum: '∑', int: '∫', deg: '°' };
  function math(src) {
    let s = src
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\([A-Za-z]+)/g, (m, w) => GREEK[w] || w)
      .replace(/[{}]/g, (c) => (c === '{' ? '\u0001' : '\u0002'));
    s = escape(s);
    // x^2, x^{10}, x_i, x_{ij}
    s = s.replace(/\^\u0001([^\u0002]*)\u0002|\^([\w.+-]+)/g, (_, a, b) => `<sup>${a ?? b}</sup>`)
      .replace(/_\u0001([^\u0002]*)\u0002|_([\w.]+)/g, (_, a, b) => `<sub>${a ?? b}</sub>`)
      .replace(/[\u0001\u0002]/g, '');
    return s;
  }

  function inlineRaw(text) {
    const codes = [];
    const maths = [];
    let s = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
    // $…$ (not prices like $5 and $10: needs no space inside the edges and a non-digit after)
    s = s.replace(/(^|[^\\$\w])\$([^\s$](?:[^$]*[^\s$])?)\$(?!\d)/g, (_, pre, m) => `${pre}\u0003${maths.push(m) - 1}\u0003`);
    s = escape(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/==([^=\s][^=]*?)==/g, '<mark>$1</mark>')
      .replace(/\[\[([^\]]{1,24})\]\]/g, '<kbd>$1</kbd>')
      // pictures from the web (https only), shown small; click opens them in the browser
      .replace(/!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/g, '<img class="md-img" src="$2" alt="$1" title="$1" loading="lazy" decoding="async">')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank">$2</a>');
    return s.replace(/\u0003(\d+)\u0003/g, (_, i) => `<span class="math">${math(maths[i])}</span>`)
      .replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escape(codes[i])}</code>`);
  }

  let inline = inlineRaw; // (round 35) the live renderer swaps in a memo while it parses (Md.live)

  // ---------- syntax highlighting (moved here from ui.js in round 20 so the Markdown worker shares it) ----------
  const escapeHtml = escape;
  const HL = new Map(); // language → { kw, re }: built once, not on every code block
  const KEYWORDS = {
    js: 'await break case catch class const continue debugger default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while with yield async get set',
    glsl: 'attribute const uniform varying in out inout layout break continue do for while if else discard return true false struct precision highp mediump lowp void bool int uint float vec2 vec3 vec4 bvec2 bvec3 bvec4 ivec2 ivec3 ivec4 mat2 mat3 mat4 sampler2D samplerCube',
    py: 'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield',
    css: '',
  };
  const LANG_ALIAS = { javascript: 'js', jsx: 'js', ts: 'js', typescript: 'js', mjs: 'js', json: 'js', jsxinc: 'js', extendscript: 'js', frag: 'glsl', vert: 'glsl', shader: 'glsl', python: 'py' };
  function highlight(code, lang = 'js') {
    const l = LANG_ALIAS[lang] || lang;
    if (!['js', 'glsl', 'py', 'css', 'html'].includes(l)) return escapeHtml(code);
    let h = HL.get(l);
    if (!h) {
      const comment = l === 'py' ? '#[^\\n]*' : l === 'html' ? '<!--[\\s\\S]*?-->' : '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/';
      h = { kw: new Set((KEYWORDS[l] || '').split(' ')), re: new RegExp(`(${comment})|(\`(?:\\\\[\\s\\S]|[^\`\\\\])*\`|"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*')|(\\b\\d[\\d_]*\\.?\\d*(?:e[+-]?\\d+)?\\b|\\b0x[\\da-f]+\\b)|(</?[A-Za-z][\\w-]*|[A-Za-z_$][\\w$]*)`, 'gi') };
      HL.set(l, h);
    }
    const { kw, re } = h;
    let out = '';
    let last = 0;
    for (const m of code.matchAll(re)) {
      out += escapeHtml(code.slice(last, m.index));
      const [tok, c, s, n, w] = m;
      if (c) out += `<span class="hl-c">${escapeHtml(tok)}</span>`;
      else if (s) out += `<span class="hl-s">${escapeHtml(tok)}</span>`;
      else if (n) out += `<span class="hl-n">${escapeHtml(tok)}</span>`;
      else if (w && l === 'html' && w.startsWith('<')) out += `<span class="hl-k">${escapeHtml(tok)}</span>`;
      else if (w && kw.has(w)) out += `<span class="hl-k">${tok}</span>`;
      else if (w && code[m.index + tok.length] === '(') out += `<span class="hl-f">${tok}</span>`;
      else if (w && /^[A-Z]/.test(w)) out += `<span class="hl-t">${tok}</span>`;
      else out += escapeHtml(tok);
      last = m.index + tok.length;
    }
    return out + escapeHtml(code.slice(last));
  }

  const CALLOUTS = { NOTE: 'ℹ️', TIP: '💡', IMPORTANT: '❗', WARNING: '⚠️', CAUTION: '🛑', INFO: 'ℹ️', SUCCESS: '✅', QUESTION: '❓', EXAMPLE: '📎' };
  const LIST = /^(\s*)([-*+]|\d+[.)])\s+/;

  // A list starting at lines[i]; nested items (deeper indent) become sub-lists. Returns [html, next i].
  function list(lines, i) {
    const first = lines[i].match(LIST);
    const indent = first[1].length;
    const ordered = /\d/.test(first[2]);
    const items = [];
    while (i < lines.length) {
      const m = lines[i].match(LIST);
      if (!m) {
        // a continuation line (indented text right under an item) joins it
        if (items.length && lines[i].trim() && /^\s{2,}/.test(lines[i]) && !LIST.test(lines[i])) { items[items.length - 1].text += ` ${lines[i].trim()}`; i += 1; continue; }
        break;
      }
      if (m[1].length > indent && items.length) {
        const [sub, next] = list(lines, i);
        items[items.length - 1].sub += sub;
        i = next;
        continue;
      }
      if (m[1].length < indent || /\d/.test(m[2]) !== ordered) break;
      items.push({ text: lines[i].slice(m[0].length), sub: '' });
      i += 1;
    }
    const html = items.map((it) => {
      const task = it.text.match(/^\[([ xX])\]\s+(.*)$/);
      if (task) return `<li class="task${task[1] !== ' ' ? ' done' : ''}"><input type="checkbox" disabled${task[1] !== ' ' ? ' checked' : ''}> ${inline(task[2])}${it.sub}</li>`;
      return `<li>${inline(it.text)}${it.sub}</li>`;
    }).join('');
    const start = ordered ? parseInt(first[2], 10) : 1; // items split by blank lines keep counting (2., 3., …)
    return [ordered ? `<ol${start > 1 ? ` start="${start}"` : ''}>${html}</ol>` : `<ul${items.some((x) => /^\[[ xX]\]\s/.test(x.text)) ? ' class="tasks"' : ''}>${html}</ul>`, i];
  }

  // The top-level blocks of `lines`, in order: { html, start, end, look }: end is the line after the block, look the
  // last line its shape depended on (the line that ended it, or its closing fence / $$). (round 35, streamrender) the
  // streaming reply freezes a block once `look` is a complete line: nothing written after it can change the block.
  // In `live` mode code blocks are left to the caller (fence: { lang, tag, code, line }; Md.live highlights them in pieces).
  function blocks(lines, live = false) {
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const start = i;
      const fence = line.match(/^\s*```\s*([\w+-]*)/);
      if (fence) {
        const body = [];
        i += 1;
        while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
        const look = i;
        i += 1;
        const codeText = body.join('\n');
        const tag = `<pre data-lang="${escape(fence[1])}"><button class="copy-code" title="Copy">Copy</button><code>`;
        if (live) out.push({ html: null, start, end: i, look, fence: { lang: fence[1].toLowerCase() || 'text', tag, code: codeText, line: start + 1 } });
        else out.push({ html: `${tag}${highlight(codeText, fence[1].toLowerCase() || 'text')}</code></pre>`, start, end: i, look });
        continue;
      }
      // $$ … $$ block formula
      if (/^\s*\$\$/.test(line)) {
        const body = [line.replace(/^\s*\$\$/, '')];
        let closed = /\$\$\s*$/.test(body[0]) && body[0].trim() !== '';
        if (closed) body[0] = body[0].replace(/\$\$\s*$/, '');
        i += 1;
        while (!closed && i < lines.length) { const l = lines[i++]; if (/\$\$\s*$/.test(l)) { body.push(l.replace(/\$\$\s*$/, '')); closed = true; } else body.push(l); }
        out.push({ html: `<div class="math math-block">${math(body.join(' ').trim())}</div>`, start, end: i, look: closed ? i - 1 : i });
        continue;
      }
      const heading = line.match(/^(#{1,4})\s+(.*)/);
      if (heading) { i += 1; out.push({ html: `<h${heading[1].length + 2}>${inline(heading[2])}</h${heading[1].length + 2}>`, start, end: i, look: start }); continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { i += 1; out.push({ html: '<hr>', start, end: i, look: start }); continue; }
      if (/^\s*>/.test(line)) {
        const body = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
        // > [!NOTE] / [!TIP] / [!WARNING] … callouts (GitHub / Obsidian style); "[!NOTE]-" starts folded
        const call = body[0].match(/^\[!(\w+)\]([-+]?)\s*(.*)$/);
        let html;
        if (call) {
          const kind = call[1].toUpperCase();
          const title = call[3] || kind[0] + kind.slice(1).toLowerCase();
          const inner = renderMarkdown(body.slice(1).join('\n'));
          const head = `<span class="callout-icon">${CALLOUTS[kind] || '📌'}</span> ${inline(title)}`;
          html = call[2] === '-'
            ? `<details class="callout callout-${kind.toLowerCase()}"><summary>${head}</summary>${inner}</details>`
            : `<div class="callout callout-${kind.toLowerCase()}"><div class="callout-title">${head}</div>${inner}</div>`;
        } else html = `<blockquote>${renderMarkdown(body.join('\n'))}</blockquote>`;
        out.push({ html, start, end: i, look: i });
        continue;
      }
      if (LIST.test(line)) {
        const [html, next] = list(lines, i);
        i = next;
        out.push({ html, start, end: i, look: i });
        continue;
      }
      if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?[\s:-]+\|/.test(lines[i + 1] || '')) {
        const split = (l) => l.trim().replace(/^\||\|$/g, '').split('|');
        const cells = (l) => split(l).map((c) => inline(c.trim()));
        // :--- left, :---: center, ---: right
        const aligns = split(lines[i + 1]).map((c) => { const t = c.trim(); return t.startsWith(':') && t.endsWith(':') ? 'center' : t.endsWith(':') ? 'right' : ''; });
        const td = (tag, c, k) => `<${tag}${aligns[k] ? ` style="text-align:${aligns[k]}"` : ''}>${c}</${tag}>`;
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
        out.push({ html: `<div class="table-wrap"><table><thead><tr>${head.map((c, k) => td('th', c, k)).join('')}</tr></thead><tbody>${
          rows.map((r) => `<tr>${r.map((c, k) => td('td', c, k)).join('')}</tr>`).join('')}</tbody></table></div>`, start, end: i, look: i });
        continue;
      }
      if (!line.trim()) { i += 1; continue; }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,4}\s|>|[-*+]\s|\d+[.)]\s|\$\$)/.test(lines[i])) para.push(lines[i++]);
      if (!para.length) para.push(lines[i++]);
      // (a first line shaped like a table row also read the next one: is it the |---| line?)
      out.push({ html: `<p>${para.map(inline).join('<br>')}</p>`, start, end: i, look: Math.max(i, start + 1) });
    }
    return out;
  }
  function renderMarkdown(src) {
    return blocks(src.replace(/\r\n/g, '\n').split('\n')).map((b) => b.html).join('');
  }

  // ---------- (round 35, streamrender) the streaming reply, rendered incrementally ----------
  // Md.live() follows one growing reply. update(text) parses only what isn't frozen yet: a top-level block is frozen
  // (parsed once, never again) as soon as its shape can't change any more (its lines and the line that ended it are
  // complete); only the block still being written is parsed on each update (a growing table, list or paragraph, with
  // its lines' inline formatting remembered). Code blocks are highlighted in pieces: whole lines once, as soon as
  // nothing after them can change their colors (no comment or template string left open), and only the newest lines
  // on each update. The HTML is exactly what renderMarkdown gives for the same text (dev/streamrender-test.js and
  // dev/checks/streamrender.js compare them on a corpus of tricky Markdown streamed in random pieces).
  // update(text) → null when the text didn't change, else { reset, frozen, tail }: `frozen` the blocks frozen by this
  // update (in order, right after the ones frozen before), `tail` the blocks after them. A block is { html }, or for
  // code { fence, tail, html }: fence.chunks = its frozen highlighted pieces (append-only), tail = the rest's HTML.
  const HL_LANGS = new Set(['js', 'glsl', 'py', 'css', 'html']);
  // the longest start of `code` (ending after a newline) whose highlighting nothing written after it can change
  function hlCut(code, lang) {
    const end = code.lastIndexOf('\n') + 1;
    if (!end) return 0;
    const l = LANG_ALIAS[lang] || lang;
    if (!HL_LANGS.has(l)) return end;
    if (!HL.has(l)) highlight('', l); // builds the language's tokenizer
    const { re } = HL.get(l);
    const open = l === 'html' ? /<!--|`/ : l === 'py' ? /`/ : /\/\*|`/;
    let cut = 0; let last = 0;
    // a stretch between tokens: its newlines are safe cuts, up to something that opens a comment / string and isn't
    // closed yet (it may close in a later line and recolor everything in between)
    const gap = (a, b) => {
      const s = code.slice(a, b); const o = s.search(open); const lim = o < 0 ? s.length : o;
      const nl = lim ? s.lastIndexOf('\n', lim - 1) : -1;
      if (nl >= 0) cut = a + nl + 1;
      return o >= 0;
    };
    for (const m of code.slice(0, end).matchAll(re)) { if (gap(last, m.index)) return cut; last = m.index + m[0].length; }
    gap(last, end);
    return cut;
  }
  const liveStats = { chars: 0, hlChars: 0, updates: 0, frozen: 0 };
  function live() {
    let src = ''; // the frozen start of the text
    let lastText = null;
    const fences = new Map(); // where a code block's code starts in the text → { lang, tag, done, src, chunks }
    const memo = new Map(); // inline HTML of the lines parsed again while their block grows
    const inlineMemo = (t) => { let h = memo.get(t); if (h === undefined) { h = inlineRaw(t); if (memo.size > 4000) memo.clear(); memo.set(t, h); } return h; };
    function fenceOf(b, key) {
      const { code, lang, tag } = b.fence;
      let f = fences.get(key);
      if (!f || f.lang !== lang || f.tag !== tag || !code.startsWith(f.src)) { f = { lang, tag, done: 0, src: '', chunks: [] }; fences.set(key, f); }
      const rest = code.slice(f.done);
      const cut = hlCut(rest, lang);
      if (cut) { f.chunks.push(highlight(rest.slice(0, cut), lang)); liveStats.hlChars += cut; f.done += cut; f.src = code.slice(0, f.done); }
      const tailCode = code.slice(f.done);
      liveStats.hlChars += tailCode.length;
      const tail = highlight(tailCode, lang);
      return { fence: f, tail, get html() { return `${f.tag}${f.chunks.join('')}${tail}</code></pre>`; } };
    }
    function update(text0) {
      const text = text0.includes('\r') ? text0.replace(/\r\n/g, '\n') : text0;
      if (text === lastText) return null;
      lastText = text;
      let reset = false;
      if (!text.startsWith(src)) { src = ''; fences.clear(); reset = true; }
      const base = src.length;
      const rest = text.slice(base);
      const lines = rest.split('\n');
      liveStats.updates += 1; liveStats.chars += rest.length;
      let bl;
      inline = inlineMemo;
      try { bl = blocks(lines, true); } finally { inline = inlineRaw; }
      const at = [0]; // where each line starts in `rest`
      for (let k = 0; k < lines.length; k++) at.push(at[k] + lines[k].length + 1);
      const all = bl.map((b) => (b.fence ? fenceOf(b, base + at[b.fence.line]) : { html: b.html }));
      // complete lines: 0 … lines.length - 2 (the last one is still being written)
      let k = 0;
      while (k < bl.length && bl[k].look <= lines.length - 2) k += 1;
      if (k) {
        for (let j = 0; j < k; j++) if (bl[j].fence) fences.delete(base + at[bl[j].fence.line]);
        src = text.slice(0, base + Math.min(at[bl[k - 1].end], rest.length));
        liveStats.frozen += k;
        memo.clear();
      }
      return { reset, frozen: all.slice(0, k), tail: all.slice(k) };
    }
    return { update, get src() { return src; } };
  }

  // Finished messages are rendered again on every chat switch / redraw: the same text gives the same HTML, so recent
  // results are kept (a long chat re-opens without re-parsing hundreds of replies). Small texts aren't worth it.
  // (round 34, lightweight) also capped by size: 600 very long replies (a pasted log, a whole file) held ≈ 40 MB of text
  // and HTML; now the oldest go once the cache holds 6M characters (≈ 1,000 ordinary replies' worth, so it rarely bites)
  const mdCache = new Map();
  const MD_CHARS = 6e6; let mdChars = 0;
  function put(src, html) {
    const had = mdCache.get(src);
    if (had !== undefined) { mdChars -= src.length + had.length; mdCache.delete(src); }
    mdCache.set(src, html); mdChars += src.length + html.length;
    while (mdCache.size > 600 || (mdChars > MD_CHARS && mdCache.size > 1)) { const [k, v] = mdCache.entries().next().value; mdCache.delete(k); mdChars -= k.length + v.length; }
  }
  function renderMarkdownCached(src) {
    if (typeof src !== 'string' || src.length < 200) return renderMarkdown(src);
    const hit = mdCache.get(src);
    if (hit !== undefined) { mdCache.delete(src); mdCache.set(src, hit); return hit; }
    const html = renderMarkdown(src);
    put(src, html);
    return html;
  }
  // (round 20, offmain) running as the worker: render what the window sends, in order, and send the HTML back
  if (typeof window === 'undefined') {
    self.onmessage = (e) => {
      const { id, texts } = e.data || {};
      const html = (texts || []).map((t) => { try { return renderMarkdown(String(t)); } catch { return null; } });
      self.postMessage({ id, html });
    };
    return;
  }
  G.mdHighlight = highlight;
  G.highlight = highlight;
  G.renderMarkdown = renderMarkdownCached;
  // (round 16) the streaming reply's parts: never the same text twice, so they skip the cache (it used to fill with
  // every intermediate state of a growing reply, ~16 a second, pushing out the finished messages it is for)
  G.renderMarkdownLive = renderMarkdown;

  // ---------- (round 20, offmain) the Markdown worker ----------
  // Md.warm(texts, ms) renders the texts that aren't in the cache on the worker's thread and puts the HTML in the
  // cache, so the renderMarkdown() calls that follow (a long chat opening, ↑ Show earlier, a chat switch) only look it
  // up. It resolves when they're in, or after `ms` (never later: whatever isn't back by then is rendered here as
  // before, and arrives in the cache when the worker is done). One worker, made at the first idle moment after the
  // start (or on first use); if it can't run, everything renders here exactly as before.
  const WARM_MIN = 200; // shorter texts aren't cached (and take microseconds)
  let worker = null; let broken = false; let seq = 0;
  const waiting = new Map(); // batch id → resolve
  const inFlight = new Set(); // texts the worker is rendering now
  const stats = { batches: 0, texts: 0, chars: 0, workerMs: 0, timeouts: 0 };
  function spawn() {
    if (worker || broken) return worker;
    try {
      worker = new Worker('md.js');
      worker.onmessage = (e) => {
        const { id, html } = e.data || {};
        const job = waiting.get(id); if (!job) return;
        waiting.delete(id);
        job.texts.forEach((t, i) => { inFlight.delete(t); if (typeof html?.[i] === 'string') put(t, html[i]); });
        stats.workerMs += performance.now() - job.t0;
        job.done();
      };
      worker.onerror = () => { broken = true; worker = null; for (const j of waiting.values()) { for (const t of j.texts) inFlight.delete(t); j.done(); } waiting.clear(); };
    } catch { broken = true; worker = null; }
    return worker;
  }
  function warm(texts, ms = 400) {
    const todo = [...new Set((texts || []).filter((t) => typeof t === 'string' && t.length >= WARM_MIN && !mdCache.has(t) && !inFlight.has(t)))];
    if (!todo.length || !spawn()) return Promise.resolve(0);
    const id = ++seq;
    for (const t of todo) inFlight.add(t);
    stats.batches += 1; stats.texts += todo.length; stats.chars += todo.reduce((a, t) => a + t.length, 0);
    const done = new Promise((resolve) => { waiting.set(id, { texts: todo, t0: performance.now(), done: () => resolve(todo.length) }); });
    worker.postMessage({ id, texts: todo });
    return ms === Infinity || ms <= 0 ? done : Promise.race([done, new Promise((r) => setTimeout(() => { stats.timeouts += 1; r(-1); }, ms))]);
  }
  // how many characters of these texts still need rendering (what's worth handing to the worker)
  const uncached = (texts) => (texts || []).reduce((a, t) => a + (typeof t === 'string' && t.length >= WARM_MIN && !mdCache.has(t) ? t.length : 0), 0);
  // (round 72, chatwindow72) messages gone back to rest let their HTML go (their text stays; made again when they wake)
  const forget = (texts) => { for (const t of texts || []) { const h = mdCache.get(t); if (h !== undefined) { mdCache.delete(t); mdChars -= t.length + h.length; } } };
  G.Md = { warm, uncached, forget, has: (t) => mdCache.has(t), html: (t) => warm([t], Infinity).then(() => renderMarkdownCached(t)), stats: () => ({ ...stats, cached: mdCache.size, worker: Boolean(worker), broken }),
    live, liveStats: () => ({ ...liveStats }), _hlCut: hlCut }; // (round 35) the streaming reply's renderer (native.js paintBody)
  // the worker is started at the first idle moment after the start, so the first long chat doesn't wait for it
  addEventListener('hearth:ready', () => (G.requestIdleCallback || setTimeout)(() => spawn(), { timeout: 4000 }), { once: true });
})();
