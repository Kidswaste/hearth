// 🪲 Something broke (round 68, bugbutton68): click it when Hearth misbehaves and a small card says, in plain words, what
// went wrong lately — errors in the window and in Hearth's main process, requests to it that failed, the graphics card
// dropping out, a program Hearth runs that stopped (an AI engine, the VST plugin host, the After Effects bridge) — with
// times and the page that was on screen. Then one click: 📋 Copy report for Claude (the clipboard only: nothing is sent
// anywhere), ↻ Restart Hearth, or Reload this page only (the window alone, everything put back; offered when nothing
// would be cut off: no reply being written, no render or recording running, ▶ Play closed).
// After Hearth closed unexpectedly the note "Hearth closed unexpectedly last time — 🪲 See what happened" (bugwatch.js)
// opens this card on the report kept from that run (data/bugbutton/saved.json: the last 3).
// Where: the rail's ⋯ (next to 🐢 That was slow), the Help menu, Ctrl/⌘+K "Something broke", and /broke in a chat.
// Loaded with the smoothness report (lazy group 'jankwatch'). Everything it shows was redacted by the main process
// (bugcard-core.js redact: no folders above the Hearth folder, no keys or passwords, no chat text).
const BugCard = (() => {
  const C = BugCardCore;
  let open_ = null;
  const plainIpc = (ch) => (typeof SlowCardCore !== 'undefined' ? SlowCardCore.plainIpc(ch) : `“${ch}”`);

  async function data(savedId) {
    let d = null;
    try { d = await window.hub?.bug?.recent?.(); } catch { /* an older main.js */ }
    d ||= { entries: [], saved: [], info: {} };
    let saved = null;
    if (savedId) { try { saved = await window.hub.bug.saved(savedId); } catch { /* gone */ } }
    return { now: Date.now(), entries: d.entries || [], started: d.started || null, info: d.info || {}, savedList: d.saved || [], saved, view: window.BugWatch?.view?.() || '' };
  }
  // what a reload of the window would cut off right now ('' = nothing: safe)
  function reloadBlock() {
    try {
      if (H.agents?.().some((a) => Native.isAgentBusy?.(a.id)) || (H.chats || []).some((c) => Native.isBusy?.(c.id))) return 'a reply is being written';
      if (typeof Renders !== 'undefined' && Renders.list?.().some((j) => ['running', 'queued'].includes(j.status))) return 'a render is running';
      if (typeof Capture !== 'undefined' && Capture.recording) return 'a recording is running';
      if (window.GameMode?.playing) return '▶ Play is open';
    } catch { /* a part not loaded isn't busy */ }
    return '';
  }
  async function reloadPage() {
    if (window.Freshen?.now) return Freshen.now({ reason: 'Something broke' }); // (keeps the screen, the chats, drafts, the Lab scene)
    return window.hub.reloadWindow?.('🪲 Something broke › Reload this page only');
  }

  const list = (lines, more) => el('ul', { class: 'bc-lines' }, lines.map((l) => el('li', { dataset: { kind: l.kind } },
    el('span', { class: 'bc-time', text: l.time }), el('span', { class: 'bc-text', text: `${l.text}${l.n > 1 ? ` (×${l.n})` : ''}` }), l.where ? el('span', { class: 'bc-where', text: l.where }) : '')),
  more ? el('li', { class: 'bc-more', text: `…and ${more} more in the report` }) : '');

  // one card at a time: a second click while the first is still reading waits for it
  let opening = null;
  function open(o = {}) { opening ||= openNow(o).finally(() => { opening = null; }); return opening; }
  async function openNow(o = {}) {
    const d = await data(o.saved);
    if (open_?.isConnected) open_.close();
    const s = C.summarise(d, { plainIpc });
    const text = () => C.report(d, { plainIpc, summary: s });
    const copy = el('button', { type: 'button', class: 'primary', text: '📋 Copy report for Claude', title: 'Puts the report on your clipboard (nothing is sent anywhere): paste it into a Claude chat', dataset: { k: 'copy' },
      on: { click: async () => { try { await copyText(text(), 'Report for Claude copied'); copy.textContent = '✓ Copied: paste it into Claude'; } catch { toast('Couldn’t reach the clipboard', { type: 'error' }); } } } });
    const restart = el('button', { type: 'button', text: '↻ Restart Hearth', title: 'Closes Hearth and opens it again (your work is saved first)', dataset: { k: 'restart' },
      on: { click: () => { dialog.close(); window.hub.restartApp?.(); } } });
    const why = reloadBlock();
    const reload = el('button', { type: 'button', class: 'ghost', text: 'Reload this page only', dataset: { k: 'reload' }, disabled: Boolean(why) || undefined,
      title: why ? `Not now: ${why}. Wait for it to finish, or Restart Hearth.` : 'Reloads the window only; the screen, chats, drafts and the Lab scene come back as they were',
      on: { click: () => { if (reloadBlock()) return; dialog.close(); reloadPage(); } } });
    const sv = s.saved;
    const earlier = (d.savedList || []).filter((r) => r.id !== sv?.id).slice(-3).reverse();
    const dialog = el('dialog', { class: 'ui-modal bugcard', attrs: { 'aria-labelledby': 'bugcard-h' } }, el('form', { method: 'dialog', on: { submit: (e) => e.preventDefault() } },
      el('h2', { id: 'bugcard-h', text: '🪲 Something broke' }),
      sv ? el('section', { class: 'bc-saved' }, el('p', { class: 'bc-head', text: sv.head }), el('p', { class: 'bc-counts', text: sv.counts }), sv.lines.length ? list(sv.lines, 0) : '', sv.where ? el('p', { class: 'bc-note', text: `On screen then: ${sv.where}.` }) : '') : '',
      el('p', { class: sv ? 'bc-head bc-now' : 'bc-head', text: sv ? `This time: ${s.headline}` : s.headline, dataset: { found: s.found ? '1' : '0' } }),
      s.counts ? el('p', { class: 'bc-counts', text: s.counts }) : '',
      s.lines.length ? list(s.lines, s.more) : '',
      el('p', { class: 'bc-tip', text: s.tip }),
      earlier.length && !sv ? el('p', { class: 'bc-earlier' }, 'Earlier: ', ...earlier.map((r, i) => [i ? ' · ' : '', el('a', { href: '#', text: `${r.kind === 'page' ? 'the window crashed' : 'Hearth closed unexpectedly'} · ${new Date(r.ended || r.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`, on: { click: (e) => { e.preventDefault(); open({ saved: r.id }); } } })]).flat()) : '',
      el('p', { class: 'bc-note', text: 'Kept on this computer only; nothing is sent anywhere. The report leaves out chat text, keys and passwords, and folders outside Hearth.' }),
      el('div', { class: 'dialog-actions' }, copy, restart, reload, el('span', { class: 'spacer' }), el('button', { type: 'button', text: 'Close', dataset: { k: 'close' }, on: { click: () => dialog.close() } }))));
    dialog.addEventListener('close', () => { setTimeout(() => dialog.remove(), 0); if (open_ === dialog) open_ = null; });
    document.body.append(dialog);
    open_ = dialog;
    dialog.showModal();
    copy.focus();
    return s;
  }

  if (typeof Commands !== 'undefined' && !Commands.get('broke')) {
    Commands.register({
      name: 'broke', area: 'App', args: '[copy]',
      desc: '🪲 Something broke: what went wrong lately (errors, failed requests, the graphics card, programs that stopped), Copy report for Claude, Restart Hearth',
      keywords: 'bug broke broken error crash crashed restart reload problem went wrong something broke',
      examples: ['/broke', '/broke copy'],
      complete: () => [['copy', 'the report for a Claude dev session, to the clipboard']],
      run: async (args) => {
        if (String(args || '').trim() === 'copy') { const d = await data(); await copyText(C.report(d, { plainIpc }), 'Report for Claude copied'); return 'Copied the report for Claude (nothing was sent).'; }
        await open();
        return undefined;
      },
    });
  }
  if (typeof AppUI !== 'undefined') AppUI.addAction?.('🪲 Something broke: what went wrong lately', () => open());

  return { open, data, reloadBlock };
})();
window.BugCard = BugCard;
