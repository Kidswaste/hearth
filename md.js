// Small, safe Markdown renderer for native chat replies. Everything is HTML-escaped first;
// only the formatting below is turned back into markup. Supports headings, lists (nested by indent,
// task lists), quotes and callouts (> [!NOTE]), tables with column alignment, fenced code, ==highlights==,
// [[keys]], and light math ($x^2$, $$…$$ shown as formulas with superscripts / subscripts / Greek letters).
(() => {
  const escape = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

  function inline(text) {
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
      .replace(/!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/g, '<img class="md-img" src="$2" alt="$1" title="$1" loading="lazy">')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank">$2</a>');
    return s.replace(/\u0003(\d+)\u0003/g, (_, i) => `<span class="math">${math(maths[i])}</span>`)
      .replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${escape(codes[i])}</code>`);
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

  function renderMarkdown(src) {
    const lines = src.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^\s*```\s*([\w+-]*)/);
      if (fence) {
        const body = [];
        i += 1;
        while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
        i += 1;
        const codeText = body.join('\n');
        const highlighted = window.highlight ? window.highlight(codeText, fence[1].toLowerCase() || 'text') : escape(codeText);
        out.push(`<pre data-lang="${escape(fence[1])}"><button class="copy-code" title="Copy">Copy</button><code>${highlighted}</code></pre>`);
        continue;
      }
      // $$ … $$ block formula
      if (/^\s*\$\$/.test(line)) {
        const body = [line.replace(/^\s*\$\$/, '')];
        let closed = /\$\$\s*$/.test(body[0]) && body[0].trim() !== '';
        if (closed) body[0] = body[0].replace(/\$\$\s*$/, '');
        i += 1;
        while (!closed && i < lines.length) { const l = lines[i++]; if (/\$\$\s*$/.test(l)) { body.push(l.replace(/\$\$\s*$/, '')); closed = true; } else body.push(l); }
        out.push(`<div class="math math-block">${math(body.join(' ').trim())}</div>`);
        continue;
      }
      const heading = line.match(/^(#{1,4})\s+(.*)/);
      if (heading) { out.push(`<h${heading[1].length + 2}>${inline(heading[2])}</h${heading[1].length + 2}>`); i += 1; continue; }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { out.push('<hr>'); i += 1; continue; }
      if (/^\s*>/.test(line)) {
        const body = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
        // > [!NOTE] / [!TIP] / [!WARNING] … callouts (GitHub / Obsidian style); "[!NOTE]-" starts folded
        const call = body[0].match(/^\[!(\w+)\]([-+]?)\s*(.*)$/);
        if (call) {
          const kind = call[1].toUpperCase();
          const title = call[3] || kind[0] + kind.slice(1).toLowerCase();
          const inner = renderMarkdown(body.slice(1).join('\n'));
          const head = `<span class="callout-icon">${CALLOUTS[kind] || '📌'}</span> ${inline(title)}`;
          out.push(call[2] === '-'
            ? `<details class="callout callout-${kind.toLowerCase()}"><summary>${head}</summary>${inner}</details>`
            : `<div class="callout callout-${kind.toLowerCase()}"><div class="callout-title">${head}</div>${inner}</div>`);
        } else out.push(`<blockquote>${renderMarkdown(body.join('\n'))}</blockquote>`);
        continue;
      }
      if (LIST.test(line)) {
        const [html, next] = list(lines, i);
        out.push(html);
        i = next;
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
        out.push(`<div class="table-wrap"><table><thead><tr>${head.map((c, k) => td('th', c, k)).join('')}</tr></thead><tbody>${
          rows.map((r) => `<tr>${r.map((c, k) => td('td', c, k)).join('')}</tr>`).join('')}</tbody></table></div>`);
        continue;
      }
      if (!line.trim()) { i += 1; continue; }
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,4}\s|>|[-*+]\s|\d+[.)]\s|\$\$)/.test(lines[i])) para.push(lines[i++]);
      if (!para.length) para.push(lines[i++]);
      out.push(`<p>${para.map(inline).join('<br>')}</p>`);
    }
    return out.join('');
  }

  // Finished messages are rendered again on every chat switch / redraw: the same text gives the same HTML, so recent
  // results are kept (a long chat re-opens without re-parsing hundreds of replies). Small texts aren't worth it.
  const mdCache = new Map();
  function renderMarkdownCached(src) {
    if (typeof src !== 'string' || src.length < 200) return renderMarkdown(src);
    const hit = mdCache.get(src);
    if (hit !== undefined) { mdCache.delete(src); mdCache.set(src, hit); return hit; }
    const html = renderMarkdown(src);
    mdCache.set(src, html);
    if (mdCache.size > 600) mdCache.delete(mdCache.keys().next().value);
    return html;
  }
  window.renderMarkdown = renderMarkdownCached;
})();
