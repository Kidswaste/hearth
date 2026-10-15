// (round 45, errorcalm) Errors in plain words, app-wide: the window part. errorcalm-core.js says what an error means
// (one plain sentence + the one action that fixes it); this file shows it wherever errors reach the owner and runs the
// action. The raw text (codes, stack, JSON, the engine's own words) is never the sentence: it waits behind a small
// "Details" fold (and in reports: ⚑ / Report… keep the raw text).
//   · every error toast, app-wide (ui.js hands each one over: toast(msg, { type: 'error', raw?, calm?, retry? }));
//     toasts that showed before this file loaded are calmed when it loads
//   · a failed reply's line and a command's one-line note in the chats (Native.hooks.message, Native.note)
//   · the Lab console: one plain line above it for the scene's latest error (🩺 Fix my scene); the console keeps the
//     raw lines for code work
//   · ErrorCalm.node(err, ctx, { retry }) / ErrorCalm.text(err, ctx) for any other place (sync's line, failed tools,
//     render / template / batch captions…), ErrorCalm.details(raw) for the fold alone
// Loaded right after the first frame (lazy group 'errorcalm', asap). Nothing is added to any message (0 tokens).
const ErrorCalm = (() => {
  const C = ErrorCalmCore;
  const last = { shown: [] }; // the last calmed errors (dev/checks/errorcalm.js): { where, text, action, raw }
  const note = (where, c) => { last.shown.unshift({ where, text: c.text, action: c.action?.label || '', raw: String(c.raw || '').slice(0, 400) }); last.shown.length = Math.min(last.shown.length, 30); };

  // ---------- the actions ----------
  const parentOf = (p) => String(p || '').replace(/[\\/]+[^\\/]*$/, '');
  async function show(p, folder) {
    if (!p) { await window.hub.openDataFolder?.(); return; }
    let q = p;
    // the file itself when it is there (shown selected), else the nearest folder that still is
    for (let i = 0; i < 12 && q; i += 1) {
      const st = await window.hub.fs.stat(q).catch(() => null);
      if (st) { if (st.isDir && (folder || q !== p)) await window.hub.fs.open(q); else await window.hub.fs.reveal(q); return; }
      const up = parentOf(q);
      if (!up || up === q) break;
      q = up;
    }
    toast('That folder isn\'t there any more either.', { timeout: 4000 });
  }
  async function row(id) {
    if (window.Lazy && !Lazy.isIn?.('appsearch')) await Lazy.load('appsearch');
    const D = AppSearchData;
    const r = [...D.SETTINGS, ...D.AI_SETUP].find((x) => x.id === id);
    if (!r) return AppUI.openSettings?.();
    return r.kind === 'aisetup' ? AppSearch.toAiSetup(r) : AppSearch.toSettings(r);
  }
  // can this action run here? (Retry only when the place gave a way to retry)
  const labIn = () => !window.Lazy?.isIn || Lazy.isIn('lab'); // (SceneDoctorHook is the Lab group's: read only once it's in)
  const runnable = (a, o = {}) => Boolean(a) && (a.id !== 'retry' || typeof o.retry === 'function') && (a.id !== 'fixscene' || (labIn() && typeof SceneDoctorHook !== 'undefined'));
  async function run(a, o = {}) {
    switch (a?.id) {
      case 'retry': return o.retry?.();
      case 'show': return show(o.path, a.folder);
      case 'settings': return row(a.target);
      case 'checkai': return row('ai:check');
      case 'restart': return window.hub.restartApp?.();
      case 'report': {
        if (typeof DevReportHooks === 'undefined') return null;
        const it = DevReportHooks.note('toast', String(o.raw || o.text || ''), String(o.stack || ''));
        return DevReportHooks.report({ kind: 'toast', item: it });
      }
      case 'fixscene': return SceneDoctorHook.doctor();
      default: return null;
    }
  }
  const button = (a, o, cls = 'ec-act') => el('button', { type: 'button', class: cls, text: a.label, title: a.id === 'report' ? 'Shows the report first (the details go with it)' : '', on: { click: (e) => { e.stopPropagation(); o.before?.(); Promise.resolve(run(a, o)).catch((err) => toast(text(err), { type: 'error', raw: err })); } } });

  // ---------- the fold ----------
  function details(raw, { open = false } = {}) {
    const t = String(raw && typeof raw === 'object' ? (raw.stack || raw.message || raw) : raw ?? '').trim();
    const d = el('details', { class: 'ec-details', ...(open ? { open: true } : {}) },
      el('summary', { text: 'Details', title: 'What the computer said, word for word (for a report)' }),
      el('pre', { class: 'ec-raw', text: t.slice(0, 4000) }),
      el('button', { type: 'button', class: 'ghost small ec-copy', text: 'Copy', on: { click: (e) => { e.stopPropagation(); copyText(t, 'Details copied'); } } }));
    d.addEventListener('click', (e) => e.stopPropagation());
    return d;
  }

  // ---------- any place: text / node ----------
  // text(err, ctx) → the plain sentence (an error that already reads plain stays as it is)
  function text(err, ctx = {}) {
    const msg = err && typeof err === 'object' ? (err.message || String(err)) : String(err ?? '');
    const c = C.calm(msg, ctx);
    if (c.changed) note(ctx.where || 'text', c);
    return c.changed ? c.text : C.firstLine(msg) || msg;
  }
  // node(err, ctx, { retry, cls }) → <div class="ec-line"><span>sentence</span> [action] [Details]</div>
  function node(err, ctx = {}, o = {}) {
    const raw = err && typeof err === 'object' ? (err.message || String(err)) : String(err ?? '');
    const c = C.calm(raw, ctx);
    const out = el('div', { class: `ec-line${o.cls ? ` ${o.cls}` : ''}`, role: 'alert' }, el('span', { class: 'ec-text', text: c.changed ? c.text : raw }));
    if (c.changed) {
      note(ctx.where || 'node', c);
      if (runnable(c.action, o)) out.append(button(c.action, { ...o, path: c.path, raw: c.raw, stack: err?.stack }));
      out.append(details(err?.stack || raw));
    }
    return out;
  }

  // ---------- toasts (ui.js hands every error toast over) ----------
  // the sentence and its Details fold stack in one column; the buttons stay on the row beside them
  function foldIn(t, d) {
    const span = t.querySelector(':scope > span');
    if (!span) { t.append(d); return; }
    const body = el('div', { class: 'ec-body' });
    span.replaceWith(body);
    body.append(span, d);
  }
  function calmToast(t, message, opts = {}) {
    if (!t || t.ecDone) return;
    t.ecDone = true;
    // a note that already says it plainly (a failed render, a missing song) and only carries the raw text: Details
    if (opts.type !== 'error') { if (opts.raw == null) return; t.classList.add('ec-calm'); const d0 = details(opts.raw); d0.addEventListener('toggle', () => { if (d0.open) t.restart?.(0); }); foldIn(t, d0); return; }
    const ctx = { ...(opts.calm || {}) };
    let c;
    if (opts.raw != null) {
      const r = opts.raw;
      c = C.calm(r && typeof r === 'object' ? (r.message || String(r)) : String(r), { ...ctx, lead: String(message || '').replace(/[.:]\s*$/, '') });
      if (r && typeof r === 'object' && r.stack) c.raw = r.stack;
    } else c = C.calm(message, ctx);
    if (!c.changed) return;
    note('toast', c);
    const span = t.querySelector(':scope > span');
    if (span) span.textContent = macText(c.text);
    if (t.logEntry) { t.logEntry.message = c.text; t.logEntry.raw = c.raw; }
    t.classList.add('ec-calm');
    const x = t.querySelector(':scope > .toast-x');
    if (!t.hasAction && runnable(c.action, opts) && (c.action.id !== 'report' || opts.devreport === false)) { // (Report: the toast's own ⚑ is it)
      const b = button(c.action, { ...opts, path: c.path, raw: c.raw, before: () => t.remove() }, '');
      if (x) x.before(b); else t.append(b);
      t.hasAction = true;
    }
    if (c.plain) return; // the reason already read plain: nothing more behind a fold
    const d = details(c.raw);
    d.addEventListener('toggle', () => { if (d.open) t.restart?.(0); }); // open: it stays until closed with ×
    foldIn(t, d);
  }
  // the toasts already up when this loaded
  for (const t of document.querySelectorAll('#toasts > .toast')) if (t.toastOpts) calmToast(t, t.toastKey?.split('\n').slice(1).join('\n') || '', t.toastOpts || {});
  if (window.errorCalm) window.errorCalm.toast = calmToast;

  // ---------- chats: a failed reply, a command's note ----------
  // A failed reply reads "<reason>\n\nFix: <what to do>" (engines.js) or "<plain>\n\nFix: <fix>\n\n(<raw line>)"
  // (winpolish / macpolish). offline.js draws its own calm line for the network family (net-note): left alone.
  function calmReply(n, m, agent) {
    if (!n || n.ecDone || m?.role !== 'error' || n.classList.contains('net-note')) return;
    const body = n.querySelector(':scope > .body');
    if (!body) return;
    const full = String(m.text || '');
    const [head, ...more] = full.split(/\n\nFix: /);
    let fix = more.join('\n\nFix: ');
    let tail = '';
    const paren = /\n\n\(([\s\S]+)\)\s*$/.exec(fix);
    if (paren) { tail = paren[1]; fix = fix.slice(0, paren.index); }
    const c = C.calm(head, { where: 'engine', engine: agent?.engine });
    if (!c.changed && !tail && !C.isRaw(fix)) return;
    n.ecDone = true;
    note('reply', { ...c, raw: full });
    const plainFix = fix && C.isRaw(fix) ? '' : fix; // a fix line that itself reads raw: Details has it
    body.textContent = [c.changed ? c.text : head, plainFix ? `Fix: ${plainFix}` : ''].filter(Boolean).join('\n\n');
    body.after(details(full));
    n.classList.add('ec-calm');
    const foot = n.querySelector(':scope > .msg-foot');
    if (foot && c.changed && c.action && !m.fixAction && !m.needsLogin && !['retry', 'report'].includes(c.action.id) && runnable(c.action) && !foot.querySelector('.ec-act')) {
      foot.prepend(button(c.action, { path: c.path, raw: full }, 'msg-act primary-act ec-act'));
    }
  }
  function calmNote(box, raw) {
    if (!box || box.ecDone) return;
    const body = box.querySelector(':scope > .body');
    const t = String(raw ?? '');
    // only a short, one-line note that reads like an error (a command's output with code or tables stays as it is)
    if (!body || t.length > 400 || t.trim().includes('\n') || /```/.test(t) || !C.isRaw(t)) return;
    const c = C.calm(t.replace(/^[^\w“"]+/u, ''), { where: 'note' });
    if (!c.changed) return;
    box.ecDone = true;
    note('note', c);
    const icon = (/^\p{Extended_Pictographic}\s*/u.exec(t) || [''])[0];
    body.textContent = `${icon}${c.text}`;
    body.after(details(t));
    if (runnable(c.action) && c.action.id !== 'retry') body.after(button(c.action, { path: c.path, raw: t }, 'ghost small ec-act'));
  }
  if (typeof Native !== 'undefined') {
    Native.hooks?.message?.push((n, m, index, agent) => { try { calmReply(n, m, agent); } catch (err) { console.warn('errorcalm:', err); } });
    const note0 = Native.note;
    if (typeof note0 === 'function' && !note0.ecWrapped) {
      Native.note = function noteCalm(agentId, t, opts) { const box = note0.call(this, agentId, t, opts); try { calmNote(box, t); } catch (err) { console.warn('errorcalm:', err); } return box; };
      Native.note.ecWrapped = true;
    }
    // the failed replies already drawn when this loaded
    for (const n of document.querySelectorAll('.msg.error:not(.net-note)')) {
      const agentId = n.closest('[data-agent]')?.dataset.agent;
      calmReply(n, { role: 'error', text: n.dataset.raw || '' }, agentId ? H.agent?.(agentId) : null);
    }
  }

  // ---------- the Lab console: one plain line above the raw ones ----------
  let labLine = null;
  let labWatch = null;
  function labError(d) {
    const wrap = document.querySelector('.three-console-wrap');
    const box = wrap?.querySelector('.three-console');
    if (!wrap || !box) return;
    const layer = (() => { try { const L = ThreeLab.layers?.list?.() || ThreeLab.sketch?.()?.layers; return (L && L.length > 1 && L.find((x) => x.id === d.layer)?.name) || ''; } catch { return ''; } })();
    const c = C.lab(d.message, { line: d.line, layer });
    note('lab', { ...c, raw: d.message });
    if (!labLine || !labLine.isConnected) {
      labLine = el('div', { class: 'ec-lab', role: 'status' });
      box.before(labLine);
      // the line goes when the console has no error left (Clear, a fixed run)
      labWatch?.disconnect();
      labWatch = new MutationObserver(() => { if (labLine && !box.querySelector('.console-row.error')) labLine.hidden = true; });
      labWatch.observe(box, { childList: true });
    }
    labLine.hidden = false;
    labLine.replaceChildren(el('span', { class: 'ec-text', text: c.text }),
      runnable(c.action) ? button(c.action, {}, 'ghost small ec-act') : null,
      el('button', { type: 'button', class: 'ghost small ec-x', text: '×', title: 'Hide this line (the console keeps the details)', on: { click: () => { labLine.hidden = true; } } }));
  }
  addEventListener('hearth:lab-error', (e) => { try { labError(e.detail || {}); } catch (err) { console.warn('errorcalm:', err); } });

  return { text, node, details, run, runnable, calmToast, calmReply, calmNote, labError, core: C, last };
})();
// for places that load before this file: calmError(err, ctx) is ui.js's stand-in until now
if (window.errorCalm) window.errorCalm.text = ErrorCalm.text;
