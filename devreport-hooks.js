// Report to the developer, the always-on part (round 21, devreport): small hooks where problems surface. The report
// itself (gathering, the review dialog, sending through gh or the browser, /report) is devreport.js, loaded the first
// time it's used (lazy group 'devreport').
//   · keeps the last 20 problems with their stacks (uncaught page errors, unhandled rejections, error toasts with the
//     code that raised them, failed replies), so a report knows the error even when the owner reports it later
//   · an error toast gets a small ⚑ (Report to the developer); right-click on it does the same
//   · a failed reply's footer gets "Report" next to Retry / Copy error
//   · an uncaught page error offers a report once (one quiet toast per error a day, never during a gesture)
//   · at start: a window / GPU crash since last time is offered as a report (or sent by itself when the owner opted
//     in: /report auto on), and an update that fixed a sent report says so ("Your report #12 is fixed in this update")
// Nothing is sent from here: every report is shown for review first.
const DevReportHooks = (() => {
  const recent = []; // { kind, message, stack, where, at, agentId?, chatId? }
  const MAX = 20;
  const whereNow = () => { try { return (H.activeId || '').replace(/^tool:/, '') || 'app'; } catch { return 'app'; } };
  function note(kind, message, stack = '', extra = {}) {
    const msg = String(message || '').slice(0, 2000);
    if (!msg) return null;
    const last = recent[recent.length - 1];
    if (last && last.message === msg && Date.now() - last.at < 2000) { last.n = (last.n || 1) + 1; return last; }
    const it = { kind, message: msg, stack: String(stack || '').slice(0, 4000), where: whereNow(), at: Date.now(), ...extra };
    recent.push(it);
    if (recent.length > MAX) recent.shift();
    return it;
  }
  // open the review (loads devreport.js on first use)
  async function report(opts = {}) {
    try {
      if (typeof DevReport === 'undefined' && window.Lazy) await Lazy.load('devreport');
      return await DevReport.open(opts);
    } catch (err) { console.warn('devreport:', err); toast('Couldn\'t open the report', { type: 'error', raw: err, devreport: false, timeout: 5000 }); return null; } // (round 45, errorcalm)
  }

  // ---------- page errors ----------
  const told = (() => { try { return JSON.parse(localStorage.getItem('devreport.told') || '{}'); } catch { return {}; } })();
  const keyOf = (m) => String(m || '').split('\n')[0].replace(/\d+/g, '#').slice(0, 120);
  function offer(it) {
    const k = keyOf(it.message);
    if (Date.now() - (told[k] || 0) < 864e5) return;
    told[k] = Date.now();
    for (const x of Object.keys(told)) if (Date.now() - told[x] > 864e5) delete told[x];
    try { localStorage.setItem('devreport.told', JSON.stringify(told)); } catch { /* fine */ }
    const show = () => toast(`Something broke inside Hearth: ${it.message.split('\n')[0].slice(0, 120)}`, { type: 'error', timeout: 9000, devreport: false, action: { label: 'Report to the developer', fn: () => report({ kind: 'page', item: it }) } });
    (window.Jank?.calm?.(8000, null) ?? Promise.resolve()).then(() => setTimeout(show, 400));
  }
  const NOISE = /ResizeObserver|Script error\.?$|aborted|AbortError|cancel/i;
  addEventListener('error', (e) => {
    if (!e.message || NOISE.test(e.message)) return;
    const it = note('page', e.message, e.error?.stack || `${e.message}\n    at ${e.filename || '?'}:${e.lineno || 0}:${e.colno || 0}`);
    if (it && performance.now() > 3000) offer(it);
  });
  addEventListener('unhandledrejection', (e) => {
    const m = e.reason?.message || String(e.reason || '');
    if (!m || NOISE.test(m)) return;
    note('page', `Unhandled: ${m}`, e.reason?.stack || '');
  });

  // ---------- error toasts: ⚑ and right-click ----------
  const toast0 = window.toast;
  window.toast = function toastReport(message, opts = {}) {
    const node = toast0.apply(this, arguments);
    if (opts?.type === 'error' && opts.devreport !== false && node && !node.querySelector?.('.toast-report')) {
      const it = note('toast', message, new Error('raised here').stack.split('\n').slice(2).join('\n'));
      const go = () => { node.remove(); report({ kind: 'toast', item: it }); };
      const x = node.querySelector('.toast-x');
      const b = el('button', { type: 'button', class: 'toast-x toast-report', text: '⚑', title: 'Report to the developer (shows the report first)', on: { click: go } });
      if (x) x.before(b); else node.append(b);
      node.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, [{ label: 'Report to the developer…', action: go }, { label: 'Copy', action: () => copyText(String(message), 'Error copied') }]); });
    }
    return node;
  };

  // ---------- failed replies ----------
  if (typeof Native !== 'undefined' && Native.hooks) {
    Native.hooks.event?.push((ev, chat) => { if (ev?.type === 'error') note('reply', ev.message, '', { agentId: chat?.agentId, chatId: chat?.id, fix: ev.fix || '' }); });
    Native.hooks.message?.push((node, m, index, agent) => {
      if (m.role !== 'error') return;
      const foot = node.querySelector('.msg-foot');
      if (!foot || foot.querySelector('.msg-report')) return;
      foot.append(el('button', { type: 'button', class: 'msg-act msg-report', text: 'Report', title: 'Report this to the developer (you review it first)',
        on: { click: () => report({ kind: 'reply', agentId: agent?.id, item: { kind: 'reply', message: m.text || '', stack: '', at: m.at || Date.now(), agentId: agent?.id } }) } }));
    });
  }

  // ---------- at start: crashes since last time, and reports an update fixed ----------
  addEventListener('hearth:ready', () => setTimeout(async () => {
    try {
      const crashes = await window.hub?.devreport?.crashes?.();
      if (crashes?.length) {
        const c = crashes[crashes.length - 1];
        const it = note('crash', `Crash: ${c.what}`, '', { at: c.t, crashes });
        const auto = store.get('devreport.auto', false) === true;
        // (round 52, chatkeep) the window's own crash a moment ago: the "Hearth's window crashed … your chat and scene are
        // back" line says it (safetynet's card); the crash stays in /report's list and in data/devreport-crashes.json
        const justNow = c.kind === 'page' && Date.now() - (c.t || 0) < 5 * 60000;
        if (auto) { await Lazy.load('devreport'); DevReport.autoCrash(it); } else if (!justNow) {
          toast(`Hearth crashed last time (${c.kind === 'gpu' ? 'the graphics process' : 'the window'}: ${c.what.split(': ').pop()}).`, { type: 'error', timeout: 12000, devreport: false, action: { label: 'Report to the developer', fn: () => report({ kind: 'crash', item: it }) } });
        }
      }
    } catch { /* an older main.js */ }
    try {
      const j = store.get('update.last', null);
      if (j?.to && store.get('devreport.updSeen', '') !== j.to) {
        store.set('devreport.updSeen', j.to);
        const d = await window.hub.kvGet('dev-reports', null);
        if (d?.items?.some((r) => r.state !== 'fixed')) { await Lazy.load('devreport'); await DevReport.checkUpdate(j); }
      }
    } catch (err) { console.warn('devreport: update check', err); }
  }, 4000), { once: true });

  return { recent: () => recent.slice(), last: () => recent[recent.length - 1] || null, note, report };
})();
window.DevReportHooks = DevReportHooks; // (window.DevReportHooks?.… from modules that may load first)
