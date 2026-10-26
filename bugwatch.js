// 🪲 Something broke, the window's part that is always there (round 68, bugbutton68). Loaded right after the first frame
// with errorcalm (lazy group 'errorcalm', asap); the card itself (bugcard.js) loads on its first click.
//   · every problem DevReportHooks keeps (page errors, unhandled rejections, error toasts, failed replies, a crash at
//     start) goes to the main process the moment it happens, with the page that was on screen (bugmain.js keeps it
//     redacted, on disk too, so a run that ends badly still has it); the ones from before this file loaded go once
//   · a WebGL view losing the graphics card (the Lab preview tells Jank.gpu; any other view: webglcontextlost)
//   · after Hearth closed unexpectedly (or the window's page crashed): one note, once — "Hearth closed unexpectedly last
//     time" with 🪲 See what happened (Hints: a notice, one at a time)
// Nothing runs while nothing goes wrong: listeners only, no timer.
const BugWatch = (() => {
  const sent = new WeakSet();
  // the page on screen, in the owner's words: "the Lab", "the Three Director chat", "Sidequest Studio"
  function label(id) {
    const s = String(id || '');
    if (!s || s === 'app') return '';
    try {
      const t = typeof Tools !== 'undefined' ? Tools.get?.(s.replace(/^tool:/, '')) : null;
      if (t) return t.id === 'three' ? 'the Lab' : t.name;
      const a = H.agents?.().find((x) => x.id === s);
      if (a) return `the ${a.name} chat`;
    } catch { /* before the app is up */ }
    return s.replace(/^tool:/, '').slice(0, 40);
  }
  const view = () => { try { return label(H.activeId); } catch { return ''; } };
  const send = (list) => { try { window.hub?.bug?.note?.(list)?.catch?.(() => {}); } catch { /* an older main.js */ } };
  const KIND = { page: 'error', toast: 'toast', reply: 'reply', crash: 'crash' };
  function shape(it, where) {
    const msg = String(it.message || '');
    let agent = '';
    try { agent = it.agentId ? H.agents?.().find((a) => a.id === it.agentId)?.name || '' : ''; } catch { /* fine */ }
    return { kind: /^Unhandled:/.test(msg) ? 'rejection' : KIND[it.kind] || 'error', message: msg.slice(0, 1200), stack: String(it.stack || '').slice(0, 2000), t: it.at || Date.now(), where, agent };
  }
  // (DevReportHooks.note hands each new one over)
  function add(it) {
    if (!it || typeof it !== 'object' || sent.has(it)) return;
    sent.add(it);
    send([shape(it, view())]);
  }
  function gpu(what) { send([{ kind: 'gpu', message: `${what || 'A drawing'} lost the graphics card`, t: Date.now(), where: view() }]); }

  // the ones kept before this file loaded (their own page)
  try { const early = window.DevReportHooks?.recent?.() || []; for (const it of early) sent.add(it); if (early.length) send(early.map((it) => shape(it, label(it.where)))); } catch { /* fine */ }
  addEventListener('webglcontextlost', () => gpu('A WebGL view'), true);
  if (window.Jank?.gpu) { const g = Jank.gpu; Jank.gpu = (what) => { gpu(String(what || 'The Lab preview')); return g(what); }; }

  // the card (bugcard.js, with the smoothness report's group: loaded on the first click)
  const open = (o = {}) => (window.Lazy ? Lazy.load('jankwatch') : Promise.resolve()).then(() => BugCard.open(o)).catch((err) => toast('Couldn’t open “Something broke”', { type: 'error', raw: err }));

  // after an unexpected end: the note, once
  async function start() {
    let r = null;
    try { r = await window.hub?.bug?.start?.(); } catch { return null; }
    if (!r) return null;
    const text = r.kind === 'page' ? 'Hearth’s window crashed and came back' : 'Hearth closed unexpectedly last time';
    const show = () => toast(text, { timeout: 20000, action: { label: '🪲 See what happened', fn: () => open({ saved: r.id }) } });
    if (window.Hints?.offer) Hints.offer({ id: `bug:${r.id}`, kind: 'notice', rank: 5, show }); else show();
    return r;
  }
  if (performance.getEntriesByName('hearth:ready').length) start(); else addEventListener('hearth:ready', () => start(), { once: true });

  return { add, view, label, open, start };
})();
window.BugWatch = BugWatch;
