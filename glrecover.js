// The graphics card going away, the window's side (round 43, glrecover): one calm note through Hints when it happened.
//   · from main (glrecovermain.js): the GPU process restarted, or Chromium now draws without the GPU (software) for the
//     rest of this session: "Hearth is drawing without the graphics card right now — Restart Hearth to get it back"
//     with a Restart button
//   · from the Lab (tools/three.js glBack): its preview lost its WebGL contexts and picked up where it was (in place or
//     on a new page): "The graphics card restarted — the Lab picked up where it was"
// One note for one event: a GPU restart the Lab also lived through is told once (whichever comes first). Nothing is
// sent anywhere, no tokens. /graphics (Ctrl/⌘+K "Graphics card: what Hearth draws with") says where things are.
const GLRecover = (() => {
  const SAME_MS = 2 * 60000; // a restart note and the Lab's own within this are the same event
  const S = { notes: [], lab: [], lastRestarted: 0, shown: new Set(), main: null };
  const labUp = () => Boolean(H.surfaces?.get?.('tool:three')?.mounted);
  const TEXT = {
    software: 'Hearth is drawing without the graphics card right now — Restart Hearth to get it back',
    lab: 'The graphics card restarted — the Lab picked up where it was',
    app: 'The graphics card restarted — Hearth picked up where it was',
  };

  function offer(n) {
    if (S.shown.has(n.id)) return;
    S.shown.add(n.id);
    const soft = n.kind === 'software';
    if (!soft) {
      if (Date.now() - S.lastRestarted < SAME_MS) { if (n.fromMain) window.hub.glr?.shown?.(n.id).catch?.(() => {}); return; } // (told already)
      S.lastRestarted = Date.now();
    }
    const msg = soft ? TEXT.software : (n.lab || labUp()) ? TEXT.lab : TEXT.app;
    const rec = { id: n.id, kind: n.kind, from: n.fromMain ? 'main' : 'lab', text: msg, at: Date.now(), showed: false };
    S.notes.push(rec); if (S.notes.length > 20) S.notes.shift();
    const show = () => {
      rec.showed = true;
      if (n.fromMain) window.hub.glr?.shown?.(n.id).catch?.(() => {});
      return toast(msg, { timeout: soft ? 30000 : 8000, ...(soft ? { action: { label: 'Restart', fn: () => window.hub.restartApp?.() } } : {}) });
    };
    // a notice: one at a time, never while you type or drag, not silenced by "Don't show tips" (it's about this copy)
    if (window.Hints) Hints.offer({ id: `glrecover:${n.id}`, kind: 'notice', rank: 3, once: false, ttl: soft ? 60 * 60000 : 15 * 60000, show }); else show();
  }
  // from main: a note made now, or waiting from before this file was in
  function fromMain(n) { if (n && !n.shown) offer({ ...n, fromMain: true }); }
  window.hub?.glr?.onNote?.(fromMain);
  window.hub?.glr?.state?.().then((st) => { S.main = st; for (const n of st?.notes || []) fromMain(n); }).catch(() => {});

  // tools/three.js: the preview picked up where it was (how: 'in place' | 'new page', ms)
  function labBack(info = {}) {
    S.lab.push({ ...info, at: Date.now() }); if (S.lab.length > 20) S.lab.shift();
    offer({ id: `lab-${Date.now()}`, kind: 'restarted', lab: true });
  }

  async function status() {
    let st = null;
    try { st = await window.hub.glr?.state?.(); S.main = st; } catch { /* old main */ }
    const k = st?.kind;
    const lines = [`**Graphics card**: ${k === 'gpu' ? 'Hearth draws with it' : k === 'software' || k === 'none' ? 'not in use right now — Hearth draws in software (slower). Restart Hearth to get it back.' : 'unknown'}`];
    if (st?.crashes) lines.push(`It restarted ${st.crashes}× since Hearth opened.`);
    const lab = typeof ThreeLab !== 'undefined' ? ThreeLab.gl?.state?.() : null;
    if (lab?.phase) lines.push(`The Lab preview is ${lab.phase === 'lost' ? 'waiting for the graphics card' : 'being made again'} right now.`);
    if (S.lab.length) lines.push(`The Lab picked up where it was ${S.lab.length}× (last: ${S.lab.at(-1).how || 'in place'}).`);
    return lines.join('\n');
  }
  function registerCommand() {
    if (typeof Commands === 'undefined' || Commands.get('graphics')) return;
    Commands.register({
      name: 'graphics', area: 'App', args: '[status]', aliases: ['gpu'].filter((n) => !Commands.get(n)),
      desc: 'The graphics card: is Hearth drawing with it, how often it restarted, the Lab picking up after it',
      complete: () => [{ value: 'status', hint: 'with the graphics card or not, restarts' }],
      examples: ['/graphics'],
      run: () => status(),
    });
    if (typeof AppUI !== 'undefined') AppUI.addAction?.('Graphics card: what Hearth draws with', () => status().then((t) => toast(t.replace(/\*\*/g, ''), { timeout: 8000 })));
  }
  if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', registerCommand, { once: true }); else registerCommand();

  return { labBack, status, state: () => ({ notes: S.notes.slice(), lab: S.lab.slice(), main: S.main }), TEXT };
})();
window.GLRecover = GLRecover;
