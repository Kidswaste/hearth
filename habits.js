// Your habits and your errors, used for you (all local: data/kv/ui-usage.json and data/kv/error-log.json; nothing
// leaves the computer, nothing reaches the engines).
// - Errors: every error toast, failed reply and uncaught page error is counted (message with paths / numbers
//   blurred, where, how often, last time), so /habits can show what goes wrong most and its fix.
// - Tidy: after a week of tracking, the buttons on a screen you have never used go behind Alt by themselves the
//   first time you open that screen each week (one quiet note with Undo; /habits tidy off stops it).
// - /habits: what you use most this week, your shortcuts, what you never touch, your top errors, and buttons to tidy.
const Habits = (() => {
  const KV = 'error-log';
  const DAY = 864e5;
  let log = null;
  const saveSoon = debounce(() => { if (log) window.hub.kvSet(KV, log); }, 1500);
  window.hub.kvGet(KV, null).then((d) => { log = d && typeof d === 'object' ? d : { items: {} }; }).catch(() => { log = { items: {} }; });
  // the same error with another file, number or id counts as the same
  const norm = (m) => String(m || '').split('\n')[0].replace(/(?:[A-Za-z]:)?[\\/][^\s'"`)]+/g, '‹path›').replace(/\b[0-9a-f]{8,}\b/gi, '‹id›').replace(/\d+(\.\d+)?/g, '#').replace(/\s+/g, ' ').trim().slice(0, 160);
  function record(message, where = '', fix = '') {
    if (!message) return;
    if (!log) log = { items: {} };
    const k = norm(message);
    if (!k || /^#$/.test(k)) return;
    const it = log.items[k] || (log.items[k] = { n: 0, first: Date.now(), where: {}, sample: String(message).split('\n')[0].slice(0, 240) });
    it.n += 1; it.last = Date.now();
    if (where) it.where[where] = (it.where[where] || 0) + 1;
    const f = fix || (String(message).match(/Fix:\s*([^\n]+)/) || [])[1];
    if (f) it.fix = f.slice(0, 240);
    const keys = Object.keys(log.items);
    if (keys.length > 200) keys.sort((a, b) => (log.items[a].last || 0) - (log.items[b].last || 0)).slice(0, keys.length - 200).forEach((x) => delete log.items[x]);
    saveSoon();
  }
  const whereNow = () => (H.activeId || '').replace(/^tool:/, '') || 'app';
  // error toasts (every module reports through toast)
  const toast0 = window.toast;
  window.toast = function toastCounted(message, opts = {}) {
    if (opts?.type === 'error') { try { record(message, whereNow()); } catch { /* counting is a bonus */ } }
    return toast0.apply(this, arguments);
  };
  // replies that failed (the engine's own message and its fix)
  if (typeof Native !== 'undefined') Native.hooks?.event?.push((ev, chat) => { if (ev?.type === 'error') record(ev.message, chat?.agentId || 'chat', ev.fix); });
  addEventListener('error', (e) => { if (e.message && !/ResizeObserver/.test(e.message)) record(`Page error: ${e.message}`, (e.filename || '').split('/').pop()); });
  addEventListener('unhandledrejection', (e) => { const m = e.reason?.message || String(e.reason || ''); if (m && !/aborted|cancel/i.test(m)) record(`Unhandled: ${m}`, whereNow()); });
  const top = (n = 8) => Object.entries(log?.items || {}).map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.n - a.n || b.last - a.last).slice(0, n);

  // ---------- tidy: never-used buttons behind Alt, once a week per screen ----------
  const tidyOn = () => store.get('habits.tidy', true) !== false;
  function tidyHere({ quiet = false, force = false } = {}) {
    if (typeof Declutter === 'undefined' || !Declutter.neverUsedIn || typeof Usage === 'undefined') return 0;
    if (!force && ((Usage.trackedDays?.() || 0) < 7 || !tidyOn())) return 0;
    const id = H.activeId; const last = store.get('habits.tidied', {});
    if (!force && Date.now() - (last[id] || 0) < 7 * DAY) return 0;
    const root = H.surfaces?.get(id)?.el || document.querySelector('.surface.active, .surface:not([hidden])');
    const never = Declutter.neverUsedIn(root);
    last[id] = Date.now(); store.set('habits.tidied', last);
    if (!never.length) return 0;
    const area = id?.startsWith('tool:') ? id.slice(5) : 'Chat';
    never.forEach((b) => Declutter.tuck(b, area));
    if (!quiet) toast(`Tidied: ${never.length} button${never.length === 1 ? '' : 's'} you never used here wait behind Alt now`, { timeout: 7000, action: { label: 'Undo', fn: () => never.forEach((b) => Declutter.tuck(b, area, false)) } });
    return never.length;
  }
  // the first visit to a screen each week, once it has settled
  if (typeof Usage !== 'undefined' && Usage.onTrack) {
    let t = 0;
    Usage.onTrack((key) => { if (!String(key).startsWith('Open › ')) return; clearTimeout(t); t = setTimeout(() => tidyHere(), 2500); });
  }

  // ---------- /habits ----------
  function report() {
    const days = Math.max(0, Math.round(Usage?.trackedDays?.() || 0));
    const week = {};
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(Date.now() - i * DAY).toLocaleDateString('en-CA');
      for (const x of Usage?.dayStats?.(d)?.top || []) week[x.key] = (week[x.key] || 0) + x.n;
    }
    const used = Object.entries(week).sort((a, b) => b[1] - a[1]);
    const shortcuts = used.filter(([k]) => k.startsWith('Shortcut › ')).slice(0, 5);
    const actions = used.filter(([k]) => !/^(Shortcut|Open|Agent tool) › /.test(k)).slice(0, 8);
    const opened = used.filter(([k]) => k.startsWith('Open › ')).slice(0, 5);
    const never = Usage?.never?.() || [];
    const errs = top(6);
    const L = [`**Your habits** · tracked here for ${days} day${days === 1 ? '' : 's'}${days < 7 ? ' (tidying starts after a week)' : ''}`];
    if (actions.length) L.push(`**Most used this week:** ${actions.map(([k, n]) => `${k.split(' › ').pop()} (${n})`).join(' · ')}`);
    if (opened.length) L.push(`**Where you work:** ${opened.map(([k, n]) => `${k.slice(7)} (${n})`).join(' · ')}`);
    if (shortcuts.length) L.push(`**Your keys:** ${shortcuts.map(([k, n]) => `${k.slice(11)} (${n})`).join(' · ')}`);
    L.push(`**Never used:** ${never.length} button${never.length === 1 ? '' : 's'}${never.length ? ` (e.g. ${never.slice(0, 4).map((x) => x.label).join(', ')})` : ''} · tidy ${tidyOn() ? 'on: they go behind Alt the first time you open their screen each week' : 'off'}`);
    if (errs.length) L.push(`**What goes wrong most:**\n${errs.map((e) => `- ${e.n}× ${e.sample}${e.fix ? `\n  → ${e.fix}` : ''} · last ${timeAgo(e.last)}`).join('\n')}`);
    else L.push('**Errors:** none recorded yet.');
    return L.join('\n\n');
  }
  function register() {
    if (typeof Commands === 'undefined' || Commands.get('habits')) return;
    Commands.register({
      name: 'habits', area: 'App', args: '[tidy [on|off|now] | errors | forget-errors]', desc: 'What you use most, what you never touch, your most frequent errors and their fixes; tidies never-used buttons behind Alt',
      complete: () => ['tidy now', 'tidy on', 'tidy off', 'errors', 'forget-errors'].map((value) => ({ value })),
      run: (args, ctx) => {
        const a = String(args || '').trim();
        if (/^tidy\s+off$/i.test(a)) { store.set('habits.tidy', false); return 'Automatic tidying is off (/habits tidy on brings it back).'; }
        if (/^tidy\s+on$/i.test(a)) { store.set('habits.tidy', true); return 'Automatic tidying is on: never-used buttons go behind Alt the first time you open their screen each week.'; }
        if (/^tidy/i.test(a)) { const n = tidyHere({ force: true }); return n ? `Tidied ${n} never-used button${n === 1 ? '' : 's'} on this screen (they wait behind Alt; Undo is in the note).` : 'Nothing to tidy on this screen (or not enough tracking yet).'; }
        if (/^forget-errors$/i.test(a)) { log = { items: {} }; saveSoon(); return 'The error log is empty again.'; }
        if (/^errors$/i.test(a)) { const e = top(20); return e.length ? e.map((x) => `- ${x.n}× ${x.sample}${x.fix ? ` → ${x.fix}` : ''} (${Object.keys(x.where).join(', ')})`).join('\n') : 'No errors recorded.'; }
        const text = report();
        if (ctx?.note) { ctx.note(text, { id: 'habits', actions: [{ label: 'Tidy this screen', run: () => toast(Commands.run('habits', 'tidy now') || 'Done') }, { label: tidyOn() ? 'Stop auto-tidy' : 'Auto-tidy on', run: () => store.set('habits.tidy', !tidyOn()) }, { label: 'Your usage…', run: () => Usage?.dialog?.() }] }); return undefined; }
        return text;
      },
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register); else register();
  return { record, top, report, tidyHere, get log() { return log; } };
})();
