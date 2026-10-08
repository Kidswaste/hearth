// Mac: ⌘ does what Ctrl does in Hearth's own shortcuts (every handler reads e.ctrlKey).
if (/Mac/.test(navigator.platform)) {
  addEventListener('keydown', (e) => { if (e.metaKey && !e.ctrlKey) Object.defineProperty(e, 'ctrlKey', { get: () => true }); }, true);
}
// Shared UI building blocks: element helper, toasts, modals, tabs, formatting, syntax highlighting
// and a lightweight code editor. Loaded before every other renderer module.
(() => {
  // Optional pieces of UI are written as `cond ? el(...) : null`; the DOM would print "null",
  // so append/prepend/replaceChildren skip empty values app-wide.
  for (const method of ['append', 'prepend', 'replaceChildren']) {
    for (const proto of [Element.prototype, DocumentFragment.prototype]) {
      const original = proto[method];
      proto[method] = function filtered(...nodes) { return original.apply(this, nodes.filter((n) => n != null && n !== false)); };
    }
  }

  // el('div', { class: 'x', on: { click }, attrs: {}, style: {}, dataset: {} }, ...children)
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'on') for (const [ev, fn] of Object.entries(value)) node.addEventListener(ev, fn);
      else if (key === 'style') Object.assign(node.style, value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key === 'attrs') for (const [a, v] of Object.entries(value)) node.setAttribute(a, v);
      else node[key] = value;
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  // ---------- toasts ----------
  let toastBox;
  function toast(message, { type = 'info', action, timeout = 4500 } = {}) {
    if (!toastBox) { toastBox = el('div', { id: 'toasts' }); document.body.append(toastBox); }
    const node = el('div', { class: `toast ${type}` }, el('span', { text: message }));
    if (action) node.append(el('button', { text: action.label, on: { click: () => { action.fn(); node.remove(); } } }));
    node.append(el('button', { class: 'toast-x', text: '×', title: 'Dismiss', on: { click: () => node.remove() } }));
    toastBox.append(node);
    if (timeout) {
      // hovering a notification keeps it until you leave it
      let timer = setTimeout(() => node.remove(), timeout);
      node.addEventListener('mouseenter', () => clearTimeout(timer));
      node.addEventListener('mouseleave', () => { clearTimeout(timer); timer = setTimeout(() => node.remove(), 1500); });
    }
    return node;
  }

  // ---------- modals ----------
  function modal(title, body, buttons) {
    return new Promise((resolve) => {
      const dialog = el('dialog', { class: 'ui-modal' });
      const form = el('form', { method: 'dialog' }, el('h2', { text: title }), body);
      const actions = el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }));
      for (const b of buttons) {
        actions.append(el('button', {
          type: b.submit ? 'submit' : 'button', text: b.label, class: b.class || '',
          on: { click: () => { if (!b.submit) { dialog.close(); resolve(b.value); } } },
        }));
      }
      form.append(actions);
      form.addEventListener('submit', (e) => { e.preventDefault(); dialog.close(); resolve(buttons.find((b) => b.submit).value()); });
      dialog.append(form);
      dialog.addEventListener('close', () => { setTimeout(() => dialog.remove(), 0); resolve(null); });
      document.body.append(dialog);
      dialog.showModal();
      body.querySelector?.('input,textarea,select')?.focus();
    });
  }
  const Modal = {
    alert: (title, text) => modal(title, el('p', { class: 'modal-text pre-line', text }), [{ label: 'OK', submit: true, class: 'primary', value: () => true }]),
    confirm: (title, text, { ok = 'OK', danger = false } = {}) => modal(title, el('p', { class: 'modal-text', text }), [
      { label: 'Cancel', value: false },
      { label: ok, submit: true, class: danger ? 'primary danger-fill' : 'primary', value: () => true },
    ]).then(Boolean),
    prompt: (title, { value = '', placeholder = '', multiline = false, label = '' } = {}) => {
      const input = multiline ? el('textarea', { rows: 6, value, placeholder }) : el('input', { value, placeholder });
      const body = el('label', { text: label }, input);
      return modal(title, body, [
        { label: 'Cancel', value: null },
        { label: 'OK', submit: true, class: 'primary', value: () => input.value },
      ]);
    },
    // fields: [{ name, label, type: 'text'|'number'|'select'|'textarea'|'checkbox', value, options }]
    form: (title, fields, { ok = 'OK' } = {}) => {
      const inputs = {};
      const body = el('div', { class: 'modal-fields' }, fields.map((f) => {
        let input;
        if (f.type === 'select') input = el('select', {}, f.options.map((o) => el('option', { value: o.value ?? o, text: o.label ?? o, selected: (o.value ?? o) === f.value })));
        else if (f.type === 'textarea') input = el('textarea', { rows: f.rows || 4, value: f.value ?? '' });
        else if (f.type === 'checkbox') input = el('input', { type: 'checkbox', checked: Boolean(f.value) });
        else input = el('input', { type: f.type || 'text', value: f.value ?? '', step: f.step || 'any', placeholder: f.placeholder || '' });
        inputs[f.name] = input;
        return el('label', { class: f.type === 'checkbox' ? 'check' : '' }, f.type === 'checkbox' ? [input, f.label] : [f.label, input]);
      }));
      return modal(title, body, [
        { label: 'Cancel', value: null },
        {
          label: ok, submit: true, class: 'primary',
          value: () => Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.type === 'checkbox' ? i.checked : i.type === 'number' ? Number(i.value) : i.value])),
        },
      ]);
    },
  };

  // ---------- tabs ----------
  // Lazily renders each tab the first time it is opened and remembers the last one.
  function Tabs(container, tabs, { storeKey } = {}) {
    const bar = el('div', { class: 'tabbar' });
    const body = el('div', { class: 'tabbody' });
    container.append(bar, body);
    const panes = new Map();
    let current = null;
    const show = (id) => {
      const tab = tabs.find((t) => t.id === id) || tabs[0];
      current = tab.id;
      for (const b of bar.children) b.classList.toggle('on', b.dataset.id === tab.id);
      if (!panes.has(tab.id)) {
        const pane = el('div', { class: 'tabpane' });
        body.append(pane);
        panes.set(tab.id, pane);
        tab.render(pane);
      }
      for (const [pid, pane] of panes) pane.hidden = pid !== tab.id;
      tab.onShow?.(panes.get(tab.id));
      if (storeKey) store.set(storeKey, tab.id);
    };
    for (const t of tabs) bar.append(el('button', { text: t.label, title: t.title || '', dataset: { id: t.id }, on: { click: () => show(t.id) } }));
    show(storeKey ? store.get(storeKey, tabs[0].id) : tabs[0].id);
    return { show, get current() { return current; }, bar };
  }

  // ---------- small helpers ----------
  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(`hub.${key}`); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(`hub.${key}`, JSON.stringify(value)); } catch { /* storage is a convenience */ } },
  };
  const fmtBytes = (n) => (n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(2)} GB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
  const fmtDate = (ms) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  function timeAgo(ms) {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
    return new Date(ms).toLocaleDateString();
  }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  async function copyText(text, what = 'Copied') {
    await navigator.clipboard.writeText(text);
    toast(`${what} to clipboard`, { timeout: 1800 });
  }
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- syntax highlighting ----------
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
    const kw = new Set((KEYWORDS[l] || '').split(' '));
    const comment = l === 'py' ? '#[^\\n]*' : l === 'html' ? '<!--[\\s\\S]*?-->' : '\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/';
    const re = new RegExp(`(${comment})|(\`(?:\\\\[\\s\\S]|[^\`\\\\])*\`|"(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*')|(\\b\\d[\\d_]*\\.?\\d*(?:e[+-]?\\d+)?\\b|\\b0x[\\da-f]+\\b)|(</?[A-Za-z][\\w-]*|[A-Za-z_$][\\w$]*)`, 'gi');
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

  // ---------- code editor ----------
  // A textarea over a highlighted <pre>, with line numbers, smart indent, comment toggling,
  // bracket pairing, Ctrl+Enter to run and error-line markers.
  class CodeEditor {
    constructor(parent, { value = '', lang = 'js', onChange, onRun, placeholder = '' } = {}) {
      this.lang = lang;
      this.onChange = onChange;
      this.onRun = onRun;
      this.gutter = el('div', { class: 'ce-gutter' });
      this.pre = el('pre', { class: 'ce-pre', attrs: { 'aria-hidden': 'true' } });
      this.area = el('textarea', { class: 'ce-area', spellcheck: false, placeholder, attrs: { wrap: 'off', autocapitalize: 'off', autocomplete: 'off' } });
      this.root = el('div', { class: 'code-editor' }, this.gutter, el('div', { class: 'ce-scroll' }, this.pre, this.area));
      parent.append(this.root);
      this.errors = new Set();
      this.area.addEventListener('input', () => this.refresh(true));
      this.area.addEventListener('scroll', () => this.syncScroll());
      this.area.addEventListener('keydown', (e) => this.onKey(e));
      this.setValue(value);
    }
    get value() { return this.area.value; }
    setValue(v) { this.area.value = v; this.refresh(false); }
    focus() { this.area.focus(); }
    setErrorLines(lines) { this.errors = new Set(lines); this.renderGutter(); }
    refresh(changed) {
      this.pre.innerHTML = `${highlight(this.area.value, this.lang)}\n`;
      this.renderGutter();
      this.syncScroll();
      if (changed) this.onChange?.(this.area.value);
    }
    renderGutter() {
      const count = this.area.value.split('\n').length;
      let html = '';
      for (let i = 1; i <= count; i += 1) html += `<div${this.errors.has(i) ? ' class="err"' : ''}>${i}</div>`;
      this.gutter.innerHTML = html;
    }
    syncScroll() {
      this.pre.style.transform = `translate(${-this.area.scrollLeft}px, ${-this.area.scrollTop}px)`;
      this.gutter.scrollTop = this.area.scrollTop;
    }
    replaceRange(start, end, text, selStart = start + text.length, selEnd = selStart) {
      this.area.setSelectionRange(start, end);
      // execCommand keeps the browser's undo stack working.
      if (!document.execCommand('insertText', false, text)) this.area.setRangeText(text, start, end, 'end');
      this.area.setSelectionRange(selStart, selEnd);
      this.refresh(true);
    }
    insertAtCursor(text) {
      const { selectionStart: s, selectionEnd: e } = this.area;
      this.area.focus();
      this.replaceRange(s, e, text);
    }
    lineBounds() {
      const v = this.area.value;
      const { selectionStart: s, selectionEnd: e } = this.area;
      const start = v.lastIndexOf('\n', s - 1) + 1;
      let end = v.indexOf('\n', e - (e > s && v[e - 1] === '\n' ? 1 : 0));
      if (end < 0) end = v.length;
      return { start, end };
    }
    onKey(e) {
      const a = this.area;
      const v = a.value;
      const { selectionStart: s, selectionEnd: en } = a;
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); this.onRun?.(); return; }
      if (e.key === 'Tab') {
        e.preventDefault();
        const { start, end } = this.lineBounds();
        if (s === en && !e.shiftKey) { this.replaceRange(s, en, '  '); return; }
        const block = v.slice(start, end);
        const next = e.shiftKey ? block.replace(/^ {1,2}/gm, '') : block.replace(/^/gm, '  ');
        this.replaceRange(start, end, next, start, start + next.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const lineStart = v.lastIndexOf('\n', s - 1) + 1;
        const indent = v.slice(lineStart, s).match(/^\s*/)[0];
        const before = v[s - 1];
        const after = v[en];
        const opens = /[{[(]/.test(before || '');
        if (opens && /[}\])]/.test(after || '')) {
          const inner = `\n${indent}  `;
          this.replaceRange(s, en, `${inner}\n${indent}`, s + inner.length);
        } else {
          this.replaceRange(s, en, `\n${indent}${opens ? '  ' : ''}`);
        }
        return;
      }
      if (e.key === '/' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const mark = this.lang === 'py' ? '#' : '//';
        const { start, end } = this.lineBounds();
        const lines = v.slice(start, end).split('\n');
        const allCommented = lines.every((l) => !l.trim() || l.trim().startsWith(mark));
        const next = lines.map((l) => (allCommented ? l.replace(new RegExp(`^(\\s*)${mark === '#' ? '#' : '\\/\\/'} ?`), '$1') : l.trim() ? l.replace(/^(\s*)/, `$1${mark} `) : l)).join('\n');
        this.replaceRange(start, end, next, start, start + next.length);
        return;
      }
      if (e.key === 'd' && e.ctrlKey) {
        e.preventDefault();
        const { start, end } = this.lineBounds();
        const block = v.slice(start, end);
        this.replaceRange(end, end, `\n${block}`, end + 1 + (s - start), end + 1 + (en - start));
        return;
      }
      const pairs = { '(': ')', '[': ']', '{': '}' };
      if (pairs[e.key] && s === en && (!v[s] || /[\s)\]};,]/.test(v[s]))) {
        e.preventDefault();
        this.replaceRange(s, en, e.key + pairs[e.key], s + 1);
        return;
      }
      if (Object.values(pairs).includes(e.key) && s === en && v[s] === e.key) {
        e.preventDefault();
        a.setSelectionRange(s + 1, s + 1);
      }
    }
  }

  // ---------- drag & drop helper ----------
  function dropZone(node, onFiles, { hint = 'Drop files here' } = {}) {
    node.addEventListener('dragover', (e) => { if (e.dataTransfer?.types.includes('Files')) { e.preventDefault(); node.classList.add('dropping'); node.dataset.dropHint = hint; } });
    node.addEventListener('dragleave', (e) => { if (!node.contains(e.relatedTarget)) node.classList.remove('dropping'); });
    node.addEventListener('drop', (e) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      node.classList.remove('dropping');
      onFiles([...e.dataTransfer.files]);
    });
  }

  // Simple sortable data table: columns [{ key, label, num, render, width }]
  function DataTable(parent, { columns, rows = [], onRow, empty = 'Nothing here yet', editable = false, onEdit }) {
    let sortKey = null;
    let sortDir = 1;
    let data = rows;
    const table = el('table', { class: 'data-table' });
    parent.append(table);
    const render = () => {
      const sorted = sortKey ? [...data].sort((a, b) => {
        const x = a[sortKey]; const y = b[sortKey];
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true })) * sortDir;
      }) : data;
      table.replaceChildren(
        el('thead', {}, el('tr', {}, columns.map((c) => el('th', {
          text: `${c.label}${sortKey === c.key ? (sortDir > 0 ? ' ▲' : ' ▼') : ''}`, style: c.width ? { width: c.width } : {},
          on: { click: () => { sortDir = sortKey === c.key ? -sortDir : 1; sortKey = c.key; render(); } },
        })))),
        el('tbody', {}, sorted.length ? sorted.map((r) => el('tr', { on: onRow ? { click: () => onRow(r) } : {} }, columns.map((c) => {
          const td = el('td', { class: c.num ? 'num' : '' });
          const v = c.render ? c.render(r) : r[c.key];
          if (v instanceof Node) td.append(v); else td.textContent = v ?? '';
          if (editable && !c.render) {
            td.contentEditable = 'true';
            td.addEventListener('blur', () => {
              const raw = td.textContent.trim();
              const next = c.num && raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
              if (next !== r[c.key]) { r[c.key] = next; onEdit?.(r, c.key, next); }
            });
          }
          return td;
        }))) : [el('tr', {}, el('td', { class: 'empty-row', text: empty, attrs: { colspan: columns.length } }))]),
      );
    };
    render();
    return { setRows(r) { data = r; render(); }, render };
  }

  Object.assign(window, { el, toast, Modal, Tabs, store, fmtBytes, fmtDate, timeAgo, debounce, copyText, escapeHtml, highlight, CodeEditor, dropZone, DataTable });
})();
