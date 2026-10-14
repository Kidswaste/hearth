// ⧉ Make a batch (round 42, labbatch), the model: no DOM, no IPC, no tokens (tools/three-batch.js draws it;
// dev/labbatch-test.js checks it in Node). The owner makes many similar music videos: one template (📐 My templates) or
// the scene on screen + a list of values → many renders, one per row and format, into one folder with a summary.
//   parseTable(text)            CSV / TSV / semicolon text → rows of cells (quotes, "" inside quotes, line breaks in a
//                               quoted cell, a BOM, \r\n), and which separator it used
//   parseRows(text, t, o)       the box's text → the batch's rows: a header line naming the template's fields (by label,
//                               slider key or plain words: title, song, logo, colors…) or plain lines (one value each, for
//                               the main field); each cell made safe for its field; empty cell = the template's own
//   resolvePath(p, base, o)     a file named in a cell → this computer's path (relative to the CSV's folder, ~/,
//                               file:// URLs, Mac and Windows separators, .. folded)
//   folderText(files, field, t) "every song / picture in this folder" → the box's text (a header + one row per file;
//                               the words field gets the file's name)
//   fileName(pattern, ctx)      "{title} {format}" → a safe file name (Mac + Windows), unique in the batch
//   jobs(rows, formats)         the renders, row by row (each row's formats together, so whole rows land first)
//   batchLeft(jobs, now)        seconds left for the whole batch (finished jobs give the pace; the running one says its own)
//   summaryCsv(…)               the summary file: what was made (or why not), with the values used
//   parseArgs(text)             /batch's words → { template, file, folder, lines, formats, recipe, names, secs, now }
const BatchCore = (() => {
  const TC = () => (typeof TemplateCore !== 'undefined' ? TemplateCore : (typeof require === 'function' ? require('./three-templates-core.js') : null));
  const PREVIEW = 4; // the preview grid: the first few rows
  const DEFAULT_PATTERN = '{title} {format}';
  const MAX_ROWS = 500;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

  // ---------- CSV / TSV ----------
  // the separator: a tab anywhere in the first line, else ";" when it has more of them than "," (Excel in a
  // decimal-comma country), else ",", else none (one column)
  function delimOf(text) {
    const first = String(text || '').replace(/^﻿/, '').split(/\r?\n/).find((l) => l.trim()) || '';
    if (first.includes('\t')) return '\t';
    const outside = first.replace(/"[^"]*"/g, '');
    const sc = (outside.match(/;/g) || []).length; const cm = (outside.match(/,/g) || []).length;
    if (sc && sc >= cm) return ';';
    if (cm) return ',';
    return null;
  }
  // RFC 4180 with the usual leniency: quotes only when a cell starts with one, "" for a quote inside, line breaks
  // inside quotes kept; blank lines dropped
  function parseTable(text, delim = undefined) {
    const s = String(text || '').replace(/^﻿/, '');
    const d = delim === undefined ? delimOf(s) : delim;
    const rows = []; let row = []; let cell = ''; let q = false; let started = false;
    const endCell = () => { row.push(started ? cell : cell.trim()); cell = ''; started = false; };
    const endRow = () => { endCell(); if (row.some((c) => c !== '')) rows.push(row); row = []; };
    for (let i = 0; i < s.length; i += 1) {
      const c = s[i];
      if (q) {
        if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i += 1; } else q = false; } else cell += c;
        continue;
      }
      if (c === '"' && !cell.trim()) { q = true; started = true; cell = ''; continue; }
      if (d && c === d) { endCell(); continue; }
      if (c === '\r' && s[i + 1] === '\n') continue;
      if (c === '\n' || c === '\r') { endRow(); continue; }
      if (started) { if (c.trim()) cell += c; continue; } // (text after a closing quote: kept, spaces dropped)
      cell += c;
    }
    if (cell !== '' || row.length) endRow();
    return { rows, delim: d };
  }

  // ---------- paths (Mac and Windows) ----------
  const isWinAbs = (p) => /^[A-Za-z]:[\\/]/.test(p) || /^\\\\[^\\]/.test(p);
  const isAbs = (p) => isWinAbs(p) || p.startsWith('/');
  const sepOf = (p) => (isWinAbs(p) || (p.includes('\\') && !p.includes('/')) ? '\\' : '/');
  // the parts after the root, with . and .. folded (never above the root)
  function fold(parts) { const out = []; for (const x of parts) { if (!x || x === '.') continue; if (x === '..') out.pop(); else out.push(x); } return out; }
  function rootOf(p) {
    const unc = /^\\\\([^\\/]+)[\\/]+([^\\/]+)/.exec(p);
    if (unc) return { root: `\\\\${unc[1]}\\${unc[2]}`, rest: p.slice(unc[0].length) };
    const dr = /^([A-Za-z]:)[\\/]?/.exec(p);
    if (dr) return { root: `${dr[1].toUpperCase()}`, rest: p.slice(dr[0].length) };
    if (p.startsWith('/')) return { root: '', rest: p };
    return { root: null, rest: p };
  }
  function joinPath(base, rel) {
    const b = String(base || '');
    const sep = sepOf(b);
    const { root, rest } = rootOf(b);
    const parts = fold([...String(rest).split(/[\\/]+/), ...String(rel).split(/[\\/]+/)]);
    if (root === null) return parts.join(sep);
    if (root === '') return `/${parts.join('/')}`;
    return `${root}${sep}${parts.join(sep)}`;
  }
  const normalizeAbs = (p) => joinPath(p, '');
  function fromFileUrl(u) {
    const m = /^file:\/\/([^/]*)(\/.*)?$/i.exec(u.replace(/[?#].*$/, ''));
    if (!m) return u;
    let p = m[2] || '/';
    try { p = decodeURIComponent(p); } catch { /* as it was */ }
    if (m[1] && m[1].toLowerCase() !== 'localhost') return `\\\\${m[1]}${p.replace(/\//g, '\\')}`;
    if (/^\/[A-Za-z]:(?:\/|$)/.test(p)) return p.slice(1).replace(/\//g, '\\');
    return p;
  }
  // a cell naming a file → { path, problem }. base: the CSV's folder (relative names are read from there); home: ~
  function resolvePath(raw, base = null, { home = null } = {}) {
    let p = String(raw ?? '').trim().replace(/^(["'])(.*)\1$/, '$2').trim();
    if (!p) return { path: '', problem: null };
    if (/^file:/i.test(p)) p = fromFileUrl(p);
    if (/^~(?=[\\/]|$)/.test(p)) { if (!home) return { path: p, problem: 'starts with ~ (no home folder known)' }; p = joinPath(home, p.slice(1)); return { path: p, problem: null }; }
    if (isAbs(p)) return { path: normalizeAbs(p), problem: null };
    if (!base) return { path: p, problem: 'a relative path (open the CSV as a file, or write the whole path)' };
    return { path: joinPath(base, p), problem: null };
  }
  const baseName = (p) => String(p || '').split(/[\\/]/).pop();
  const stemOf = (p) => baseName(p).replace(/\.[^.]+$/, '');
  const dirOf = (p) => { const s = String(p || ''); const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\')); return i <= 0 ? (i === 0 ? '/' : '') : (/^[A-Za-z]:$/.test(s.slice(0, i)) ? s.slice(0, i + 1) : s.slice(0, i)); };
  // "my_song-final_v2" → "my song final v2" (a title from a file's name)
  const words = (s) => String(s || '').replace(/[_]+/g, ' ').replace(/\s*-\s*/g, ' - ').replace(/\s+/g, ' ').replace(/^\d{1,3}[\s.)-]+(?=\S)/, '').trim();

  // ---------- the template's fields ----------
  const isMedia = (f) => ['image', 'video', 'audio'].includes(f?.kind);
  // the field one value per line fills: the first words, else the first picture / video / sound, else the first one
  const mainField = (t) => (t?.fields || []).find((f) => f.kind === 'text') || (t?.fields || []).find(isMedia) || (t?.fields || [])[0] || null;
  const SPECIAL = { name: 'name', filename: 'name', file: 'name', output: 'name', outputname: 'name', videoname: 'name', n: 'skip', row: 'skip', no: 'skip' };
  // a header cell → a field (or the row's name column)
  function columnFor(t, cell) {
    const n = norm(cell);
    if (!n) return { skip: true, name: cell };
    const f = TC().fieldFor(t, cell) || (n === 'title' ? (t.fields || []).find((x) => x.kind === 'text') : null);
    if (f) return { field: f.id, name: cell };
    if (SPECIAL[n] === 'name') return { special: 'name', name: cell };
    if (SPECIAL[n] === 'skip') return { skip: true, name: cell };
    return { unknown: true, name: cell };
  }
  // one cell for one field → { v (undefined: the template's own), problem }
  function cellValue(f, raw, o = {}) {
    const s = String(raw ?? '').trim();
    if (!s) return { v: undefined, problem: null };
    if (isMedia(f)) {
      const r = resolvePath(s, o.base, o);
      if (r.problem) return { v: r.path, problem: `${baseName(r.path)}: ${r.problem}` };
      const k = TC().mediaKind(r.path);
      if (k && k !== f.kind && !(f.kind === 'audio' && k === 'video')) return { v: undefined, problem: `${baseName(r.path)} isn't ${f.kind === 'audio' ? 'a sound' : f.kind === 'image' ? 'a picture' : 'a video'}` };
      return { v: r.path, problem: null };
    }
    let x = s;
    if (f.kind === 'number') {
      x = s.replace(/^(-?\d+),(\d+)$/, '$1.$2'); // 1,5 (a decimal comma)
      if (!Number.isFinite(Number(x))) return { v: undefined, problem: `"${s}" isn't a number for ${f.label}` };
    }
    if (f.kind === 'color' && !/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return { v: undefined, problem: `"${s}" isn't a color for ${f.label} (#rrggbb)` };
    if (f.kind === 'choice' && !(f.options || []).some((op) => String(op).toLowerCase() === s.toLowerCase())) return { v: undefined, problem: `"${s}" isn't one of ${(f.options || []).join(' / ')} for ${f.label}` };
    return { v: TC().coerce(f, x), problem: null };
  }

  // ---------- the box's text → rows ----------
  // o: { main (a field id: what plain lines fill), base (the CSV's folder), home } →
  //    { mode: 'header' | 'lines' | 'empty', columns, rows: [{ n, values: { fieldId: v }, name, cells }], unknown, problems, main }
  function parseRows(text, t, o = {}) {
    const fields = t?.fields || [];
    const main = fields.find((f) => f.id === o.main) || mainField(t);
    const out = { mode: 'empty', columns: [], rows: [], unknown: [], problems: [], main: main?.id || null, delim: null };
    const s = String(text || '').replace(/^﻿/, '');
    if (!s.trim()) return out;
    const tab = parseTable(s);
    out.delim = tab.delim;
    const head = tab.rows[0] || [];
    const cols = head.map((c) => columnFor(t, c));
    const hits = cols.filter((c) => c.field || c.special).length;
    const isHeader = hits > 0 && (head.length === 1 || hits * 2 >= head.length);
    const push = (values, name, cells, n) => { if (out.rows.length < MAX_ROWS) out.rows.push({ n, values, name, cells }); };
    if (isHeader) {
      out.mode = 'header';
      out.columns = cols;
      out.unknown = cols.filter((c) => c.unknown).map((c) => c.name);
      const seen = new Set();
      cols.forEach((c) => { if (c.field && seen.has(c.field)) { out.problems.push(`Two columns fill ${fields.find((f) => f.id === c.field)?.label}: the last one wins`); } if (c.field) seen.add(c.field); });
      tab.rows.slice(1).forEach((cells, i) => {
        const values = {}; let name = '';
        cols.forEach((c, k) => {
          const raw = cells[k];
          if (c.special === 'name') { name = String(raw || '').trim(); return; }
          if (!c.field) return;
          const f = fields.find((x) => x.id === c.field);
          const r = cellValue(f, raw, o);
          if (r.problem) out.problems.push(`Row ${i + 1}: ${r.problem}`);
          if (r.v !== undefined) values[f.id] = r.v;
        });
        push(values, name, cells, i + 1);
      });
    } else {
      out.mode = 'lines';
      if (!main) { out.problems.push('This template has no fields to fill in'); return out; }
      out.columns = [{ field: main.id, name: main.label }];
      // plain lines: a whole line is one value (commas in a title stay)
      s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
        const r = cellValue(main, line.replace(/^"(.*)"$/, '$1'), o);
        if (r.problem) out.problems.push(`Line ${i + 1}: ${r.problem}`);
        push(r.v !== undefined ? { [main.id]: r.v } : {}, '', [line], i + 1);
      });
    }
    if (tab.rows.length - (isHeader ? 1 : 0) > MAX_ROWS) out.problems.push(`Only the first ${MAX_ROWS} rows are made`);
    return out;
  }

  // ---------- "every song / picture in this folder" ----------
  const natural = (a, b) => baseName(a).localeCompare(baseName(b), undefined, { numeric: true, sensitivity: 'base' });
  // files: paths; field: the media field they fill → the box's text: a header, then one row per file (the words field,
  // when there is one, gets the file's name: a song's title)
  function folderText(files, field, t, { names = true } = {}) {
    const kind = field?.kind;
    const mine = (files || []).filter((p) => TC().mediaKind(p) === kind).sort(natural);
    const tf = names ? (t?.fields || []).find((f) => f.kind === 'text') : null;
    const header = [field.label, ...(tf ? [tf.label] : [])];
    const lines = [header.map(csvCell).join(','), ...mine.map((p) => [p, ...(tf ? [words(stemOf(p))] : [])].map(csvCell).join(','))];
    return { text: `${lines.join('\n')}\n`, count: mine.length };
  }

  // ---------- names ----------
  const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  // a file name that works on a Mac and on Windows: no \ / : * ? " < > | or control characters, no trailing dot or
  // space, not a Windows device name, not too long
  function safeName(s, max = 120) {
    let n = String(s ?? '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    n = n.slice(0, max).replace(/[.\s]+$/, '').replace(/^[.\s]+/, '');
    if (RESERVED.test(n.split('.')[0])) n = `_${n}`;
    return n;
  }
  // a field's value as words in a name: media → the file's name, a color without its #, words as they are
  function tokenText(f, v) {
    if (v == null || v === '') return '';
    if (isMedia(f)) return stemOf(v);
    if (f.kind === 'palette') return (Array.isArray(v) ? v : []).map((c) => String(c).replace('#', '')).join(' ');
    if (f.kind === 'color') return String(v).replace('#', '');
    if (f.kind === 'number') return String(Number(Number(v).toFixed(3)));
    return String(v).replace(/\s+/g, ' ');
  }
  // ctx: { t, row, format ('9:16'), w, h, count, values (the row's values, the template's own filling the rest) }
  // → { name, unknown: [tokens nobody knows] }
  function fileName(pattern, ctx) {
    const t = ctx.t; const fields = t?.fields || [];
    const values = ctx.values || {};
    const valueOf = (f) => (f.id in values ? values[f.id] : f.value);
    const unknown = [];
    const pad = String(ctx.count || 1).length;
    const titleOf = () => {
      if (ctx.row?.name) return ctx.row.name;
      const tf = fields.find((f) => f.kind === 'text');
      if (tf) return tokenText(tf, valueOf(tf));
      const mf = fields.find((f) => isMedia(f) && f.id in values);
      return mf ? tokenText(mf, values[mf.id]) : `${t?.name || 'Video'} ${String(ctx.row?.n || 1).padStart(pad, '0')}`;
    };
    const s = String(pattern || DEFAULT_PATTERN).replace(/\{([^{}]*)\}/g, (m0, tok) => {
      const k = norm(tok);
      if (['n', 'row', 'number', 'no'].includes(k)) return String(ctx.row?.n || 1).padStart(pad, '0');
      if (['format', 'shape', 'aspect', 'ratio'].includes(k)) return String(ctx.format || '').replace(':', 'x');
      if (['size', 'resolution', 'wxh'].includes(k)) return ctx.w ? `${ctx.w}x${ctx.h}` : '';
      if (k === 'template' || k === 'scene') return t?.name || '';
      if (k === 'name') return titleOf();
      const f = TC().fieldFor(t, tok);
      if (f) return tokenText(f, valueOf(f));
      if (k === 'title') return titleOf();
      unknown.push(tok);
      return '';
    });
    const name = safeName(s) || safeName(`${t?.name || 'Video'} ${String(ctx.row?.n || 1).padStart(pad, '0')} ${String(ctx.format || '').replace(':', 'x')}`) || 'Video';
    return { name, unknown };
  }
  // the batch's names made unique (two rows with the same title: "Summer 9x16", "Summer 9x16 (2)"); caseless, like
  // the Mac's and Windows' disks
  function uniqueNames(names) {
    const used = new Set(); const out = [];
    for (const n of names) {
      let x = n; let i = 2;
      while (used.has(x.toLowerCase())) { x = `${n} (${i})`; i += 1; }
      used.add(x.toLowerCase()); out.push(x);
    }
    return out;
  }
  function folder(name, d = new Date()) {
    const p = (v) => String(v).padStart(2, '0');
    return `${safeName(name, 60) || 'Lab'} · batch ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}h${p(d.getMinutes())}`;
  }

  // ---------- the renders ----------
  // rows × formats, row by row → [{ k, row, format }]
  const jobs = (rows, formats) => rows.flatMap((row) => formats.map((format) => ({ row, format }))).map((j, k) => ({ k, ...j }));
  // jobs: [{ work (pixels × frames), t0 (ms, started), t1 (ms, ended), left (s, its own estimate), p (0–1), failed }]
  // → seconds left for the whole batch, or null before anything says how fast it goes
  function batchLeft(js, now) {
    let ms = 0; let work = 0;
    for (const j of js) if (j.t1 && !j.failed && j.work) { ms += j.t1 - j.t0; work += j.work; }
    let rate = work ? ms / work : null; // ms per unit of work
    const run = js.find((j) => j.t0 && !j.t1);
    if (rate == null && run && run.left != null && run.work) rate = ((now - run.t0) + run.left * 1000) / run.work;
    if (rate == null) return null;
    let left = 0;
    for (const j of js) {
      if (j.t1) continue;
      if (j === run) left += run.left != null ? run.left * 1000 : rate * j.work * (1 - (j.p || 0));
      else left += rate * j.work;
    }
    return Math.max(1, Math.round(left / 1000));
  }

  // ---------- the summary ----------
  function csvCell(v) {
    let s = v == null ? '' : Array.isArray(v) ? v.join(' ') : String(v);
    if (/^[=@]/.test(s)) s = `'${s}`; // (a spreadsheet would run it as a formula)
    return /[",\r\n;\t]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }
  // records: [{ n, name, file, format, w, h, frames, secs, status: 'made' | 'failed' | 'cancelled' | 'skipped' | 'waiting', error, values }]
  // fields: the template's fields that any row set (their columns, in the template's order)
  function summaryCsv(records, fields = []) {
    const head = ['Row', 'File', 'Format', 'Width', 'Height', 'Frames', 'Seconds', 'Status', 'Note', ...fields.map((f) => f.label)];
    const lines = [head, ...records.map((r) => [r.n, r.file ? baseName(r.file) : '', r.format || '', r.w || '', r.h || '', r.frames ?? '', r.secs ?? '', r.status || '', r.error || '', ...fields.map((f) => (r.values && f.id in r.values ? tokenOrValue(f, r.values[f.id]) : ''))])];
    return `﻿${lines.map((l) => l.map(csvCell).join(',')).join('\r\n')}\r\n`;
  }
  const tokenOrValue = (f, v) => (isMedia(f) ? v : f.kind === 'palette' ? (v || []).join(' ') : v);
  // the fields any row sets (the summary's columns)
  const usedFields = (t, rows) => (t?.fields || []).filter((f) => rows.some((r) => f.id in (r.values || {})));

  // ---------- /batch's words ----------
  const KEYS = ['file', 'csv', 'folder', 'lines', 'formats', 'format', 'recipe', 'names', 'secs', 'seconds', 'now', 'long'];
  function tokens(s) { const out = []; const re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m; while ((m = re.exec(s))) out.push({ v: m[1] ?? m[2] ?? m[3], q: m[3] == null }); return out; }
  function parseArgs(text) {
    const o = { template: '', file: null, folder: null, lines: null, formats: null, recipe: null, names: null, secs: null, now: false, long: null, op: null };
    const s = String(text || '').trim();
    const op = /^(status|cancel|stop|pause|resume)\b/i.exec(s);
    if (op) { o.op = op[1].toLowerCase(); return o; }
    let key = 'template'; const acc = { template: [] };
    for (const tk of tokens(s)) {
      const k = !tk.q && KEYS.includes(tk.v.toLowerCase()) ? tk.v.toLowerCase() : null;
      if (k === 'now') { o.now = true; continue; }
      if (k) { key = { csv: 'file', format: 'formats', seconds: 'secs' }[k] || k; acc[key] ||= []; continue; }
      (acc[key] ||= []).push(tk.v);
    }
    o.template = (acc.template || []).join(' ').trim();
    if (acc.file) o.file = acc.file.join(' ').trim() || null;
    if (acc.folder) o.folder = acc.folder.join(' ').trim() || null;
    if (acc.lines) o.lines = acc.lines.join(' ').split('|').map((x) => x.trim()).filter(Boolean);
    if (acc.formats) { const all = acc.formats.join(' ').toLowerCase(); o.formats = /social|all/.test(all) ? ['16:9', '9:16', '1:1', '4:5'] : ['16:9', '9:16', '1:1', '4:5'].filter((id) => new RegExp(`(^|\\s)${id.replace(':', '[:x]')}(\\s|$)`).test(all)); }
    if (acc.recipe) o.recipe = acc.recipe.join(' ').trim() || null;
    if (acc.names) o.names = acc.names.join(' ').trim() || null;
    if (acc.secs) { const n = Number(acc.secs[0]); if (Number.isFinite(n) && n > 0) o.secs = n; }
    if (acc.long) { const n = Number(acc.long[0]); if (Number.isFinite(n) && n >= 16) o.long = n; }
    return o;
  }

  return { PREVIEW, DEFAULT_PATTERN, MAX_ROWS, delimOf, parseTable, parseRows, columnFor, cellValue, mainField, resolvePath, joinPath, isAbs, baseName, stemOf, dirOf, words,
    folderText, safeName, fileName, uniqueNames, folder, jobs, batchLeft, csvCell, summaryCsv, usedFields, parseArgs, isMedia };
})();
if (typeof module !== 'undefined') module.exports = BatchCore;
