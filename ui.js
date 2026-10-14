// Mac: ⌘ does what Ctrl does in Hearth's own shortcuts (every handler reads e.ctrlKey).
if (/Mac/.test(navigator.platform)) {
  addEventListener('keydown', (e) => { if (e.metaKey && !e.ctrlKey) Object.defineProperty(e, 'ctrlKey', { get: () => true }); }, true);
}
// A video whose file doesn't store its length (a WebM straight from a recorder) reports an endless duration, and every
// loop that walks a timeline up to the end ran forever (opening one in Video Review froze the whole app).
// realDuration(v) seeks far past the end once so the browser measures it, then goes back; videos on the page get it on
// their own (the listener below); finiteDur(d) turns Infinity / NaN into 0 for code that only draws.
function realDuration(v, ms = 6000) {
  if (Number.isFinite(v.duration)) return Promise.resolve(v.duration);
  // only files: a live stream (srcObject) or an in-memory source (blob:, MediaSource) is endless on purpose
  const src = v.currentSrc || v.src || '';
  if (v.srcObject || !src || /^(blob|mediastream|data):/i.test(src)) return Promise.resolve(0);
  if (v._durFix) return v._durFix;
  v._durFix = new Promise((res) => {
    const back = v.currentTime || 0;
    let timer = 0;
    const check = () => { if (Number.isFinite(v.duration)) done(); };
    function done() {
      clearTimeout(timer); v.removeEventListener('durationchange', check); v.removeEventListener('timeupdate', check); v.removeEventListener('seeked', check);
      try { v.currentTime = back; } catch { /* unloaded */ }
      v._durFix = null;
      res(Number.isFinite(v.duration) ? v.duration : 0);
    }
    timer = setTimeout(done, ms);
    v.addEventListener('durationchange', check); v.addEventListener('timeupdate', check); v.addEventListener('seeked', check);
    try { v.currentTime = 1e101; } catch { done(); }
  });
  return v._durFix;
}
const finiteDur = (d) => (Number.isFinite(d) && d > 0 ? d : 0);
document.addEventListener('loadedmetadata', (e) => { const v = e.target; if (v instanceof HTMLMediaElement && v.duration === Infinity && !v.srcObject && !/^(blob|mediastream|data):/i.test(v.currentSrc || '')) realDuration(v); }, true);
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

  const MAC_TIPS = /Mac/.test(navigator.platform);
  // (round 31, winmac) on a Mac, "Ctrl+K" in placeholders, hints (class …hint…) and toasts reads "⌘K" too (winmac.js)
  const macText = (v) => (MAC_TIPS && typeof v === 'string' && typeof WinMac !== 'undefined' ? WinMac.macKeys(v, { mac: true }) : v);
  globalThis.macText = macText;
  // el('div', { class: 'x', on: { click }, attrs: {}, style: {}, dataset: {} }, ...children)
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props || {})) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = MAC_TIPS && /\bhint\b/.test(props.class || '') ? macText(value) : value;
      else if (key === 'placeholder' && MAC_TIPS) node.placeholder = macText(value);
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'on') for (const [ev, fn] of Object.entries(value)) node.addEventListener(ev, fn);
      else if (key === 'style') Object.assign(node.style, value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key === 'attrs') for (const [a, v] of Object.entries(value)) node.setAttribute(a, v);
      // on a Mac the tooltips name ⌘ / ⌥ ("Undo (Ctrl+Z)" read Ctrl on every button; "Ctrl+click" stays: a right-click there)
      else if (key === 'title' && MAC_TIPS) node.title = String(value).replace(/\bCtrl\+(?!click)/g, '⌘').replace(/\bAlt\+/g, '⌥').replace(/⌘\/⌘/g, '⌘').replace(/([⌘⌥])\+/g, '$1');
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
  const toastLog = []; // the last notifications (Ctrl+K → Recent notifications)
  globalThis.recentToasts = () => toastLog.slice();
  function toast(message, { type = 'info', action, timeout = 4500 } = {}) {
    if (!toastBox) { toastBox = el('div', { id: 'toasts', role: 'status', attrs: { 'aria-live': 'polite' } }); document.body.append(toastBox); } // (round 40, a11y) read out politely
    toastLog.unshift({ message, type, at: Date.now() }); toastLog.length = Math.min(toastLog.length, 40);
    // (round 16, chatperf) the same notification again while it shows counts up ("×3") instead of stacking copies,
    // and at most 5 show at once (the oldest goes)
    const prev = toastBox.lastElementChild;
    if (!action && prev?.toastKey === `${type}\n${message}` && prev.restart) {
      prev.repeats = (prev.repeats || 1) + 1;
      let n = prev.querySelector('.toast-n');
      if (!n) { n = el('b', { class: 'toast-n' }); prev.firstChild.after(n); }
      n.textContent = ` ×${prev.repeats}`;
      prev.restart(timeout);
      return prev;
    }
    while (toastBox.childElementCount >= 5) ([...toastBox.children].find((t) => !t.hasAction) || toastBox.firstElementChild).remove(); // an Undo stays longest
    const node = el('div', { class: `toast ${type}` }, el('span', { text: macText(message) }));
    node.toastKey = `${type}\n${message}`; node.hasAction = Boolean(action);
    if (action) node.append(el('button', { text: action.label, on: { click: () => { action.fn(); node.remove(); } } }));
    node.append(el('button', { class: 'toast-x', text: '×', title: 'Dismiss', on: { click: () => node.remove() } }));
    toastBox.append(node);
    // (round 17, hz240) above a docked chat's composer (was a page-wide :has() in polish.css): checked when one shows
    toastBox.classList.toggle('over-dock', Boolean(document.querySelector('.surface.active .tool-dock:not([hidden])')));
    // (round 38, hintcalm) never over the chat box you type in or the Lab preview's centre (hints.js), errors included
    if (window.Hints?.dodge) requestAnimationFrame(() => Hints.dodge(toastBox));
    if (timeout) {
      // hovering a notification keeps it until you leave it
      let timer = setTimeout(() => node.remove(), timeout);
      node.restart = (ms) => { clearTimeout(timer); if (ms) timer = setTimeout(() => node.remove(), ms); };
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
  // (round 20, offmain) dates are formatted by one cached Intl formatter per style: toLocaleString(…, options) builds
  // a new formatter on every call (~0.2 ms each), and a long chat formats three dates per message (showing every
  // message of a 300-message chat spent ~100 ms there). fmtLocal(ms, options) gives the same text as toLocaleString.
  const DTF = new Map();
  function fmtLocal(ms, opts = {}, kind = 'string') {
    const key = `${kind}|${JSON.stringify(opts)}`;
    let f = DTF.get(key);
    if (!f) {
      const o = { ...opts };
      if (kind === 'date' && !o.dateStyle && !o.weekday && !o.year && !o.month && !o.day) Object.assign(o, { year: 'numeric', month: 'numeric', day: 'numeric' });
      if (kind === 'time' && !o.timeStyle && !o.hour && !o.minute && !o.second) Object.assign(o, { hour: 'numeric', minute: 'numeric', second: 'numeric' });
      if (kind === 'string' && !Object.keys(o).length) Object.assign(o, { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
      f = new Intl.DateTimeFormat(undefined, o); DTF.set(key, f);
    }
    return f.format(ms);
  }
  const fmtDate = (ms) => fmtLocal(ms, { dateStyle: 'medium', timeStyle: 'short' });
  // (round 20, offmain) a canvas as a data URL, encoded by the browser off this thread (toBlob + FileReader; toDataURL
  // encodes on it: a 1280-px JPEG ≈ 15–40 ms). Same result as canvas.toDataURL(type, quality), as a Promise.
  function canvasDataUrl(canvas, type = 'image/png', quality) {
    return new Promise((resolve) => {
      const here = () => resolve(canvas.toDataURL(type, quality));
      try {
        canvas.toBlob((b) => {
          if (!b) { here(); return; }
          const r = new FileReader();
          r.onload = () => resolve(r.result); r.onerror = here;
          r.readAsDataURL(b);
        }, type, quality);
      } catch { here(); }
    });
  }
  function timeAgo(ms) {
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
    return fmtLocal(ms, {}, 'date');
  }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  // (round 29, safetynet) a debounced SAVE: like debounce, but a long burst of changes (typing without a pause, a slow
  // drag) still writes at least every `max` ms, and a save still waiting is written at once when the page goes away
  // (a reload, an update, closing); s.flush() writes now, s.pending() says whether one waits. One timer, no per-call work.
  const waitingSaves = new Set();
  function saver(fn, ms = 500, max = Math.max(2000, ms * 4)) {
    let t = 0; let first = 0;
    const run = () => { clearTimeout(t); t = 0; first = 0; waitingSaves.delete(s); fn(); };
    const s = () => {
      const now = Date.now();
      if (!first) first = now;
      clearTimeout(t);
      t = setTimeout(run, Math.max(0, Math.min(ms, first + max - now)));
      waitingSaves.add(s);
    };
    s.flush = () => { if (t) run(); };
    s.pending = () => Boolean(t);
    return s;
  }
  // (a save can start another one a moment later, e.g. the Lab sequence → its store: a few microtask rounds catch those)
  const flushSaves = (rounds) => { for (const s of [...waitingSaves]) { try { s.flush(); } catch (err) { console.warn('save on leave', err); } } if (rounds > 0) queueMicrotask(() => flushSaves(rounds - 1)); };
  addEventListener('pagehide', () => flushSaves(8));
  async function copyText(text, what = 'Copied') {
    await navigator.clipboard.writeText(text);
    toast(`${what} to clipboard`, { timeout: 1800 });
  }
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- syntax highlighting ----------
  // (round 20, offmain) the highlighter lives in md.js (loaded right after), so the Markdown worker uses the same one
  function highlight(code, lang = 'js') { return window.mdHighlight ? window.mdHighlight(code, lang) : escapeHtml(code); }

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

  // A video, recording or render opens in the system's own player, or shows in Finder / Explorer (round 17: Hearth has
  // no video player of its own any more). open / reveal → Promise<boolean>; revealLabel: the menu line for this system.
  const MediaFile = {
    revealLabel: /Mac/.test(navigator.platform) ? 'Reveal in Finder' : /Win/.test(navigator.platform) ? 'Show in Explorer' : 'Show in folder',
    async open(p) { if (!p) return false; try { const err = await window.hub.fs.open(p); if (err) throw new Error(err); return true; } catch (e) { toast(`Can't open ${String(p).split(/[\\/]/).pop()}: ${String(e.message || e).replace(/^Error invoking remote method[^:]*: (Error: )?/, '')}`, { type: 'error' }); return false; } },
    async reveal(p) { if (!p) return false; try { await window.hub.fs.reveal(p); return true; } catch (e) { toast(String(e.message || e), { type: 'error' }); return false; } },
    // the rows every file gets, in the app's one order and wording (round 18, tidy): Open · Reveal in Finder (Show in Explorer) · Copy path
    // (then a menu's own Send to… rows, its tool's rows, and Move to the Trash last, in red)
    copyLabel: 'Copy path',
    trashLabel: 'Move to the Trash',
    items: (p) => [{ label: 'Open', action: () => MediaFile.open(p) }, { label: MediaFile.revealLabel, action: () => MediaFile.reveal(p) }, { label: MediaFile.copyLabel, action: () => copyText(p, 'Path copied') }],
  };

  Object.assign(window, { el, toast, Modal, Tabs, store, fmtBytes, fmtDate, fmtLocal, canvasDataUrl, timeAgo, debounce, saver, copyText, escapeHtml, highlight, CodeEditor, dropZone, DataTable, MediaFile });
})();
