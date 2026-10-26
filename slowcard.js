// 🐢 That was slow (round 67, slowbutton67): click it right after a hiccup and a small card says, in plain words, what
// the last one was ("The last hiccup: 1.4 s, while you were in the Lab (main process busy with your settings)"), with
// 📋 Copy report for Claude (the clipboard only: nothing is sent anywhere) and the day's count of hiccups over 500 ms
// next to yesterday's, so you can tell whether an update helped.
// Where: the rail's ⋯ (first row; after a hiccup of a second or more the ⋯ wears a small dot for two minutes), the Help
// menu, Ctrl/⌘+K "That was slow", and /slow in a chat. Loaded with the smoothness report (lazy group 'jankwatch').
// Costs nothing until clicked: it reads what jank.js / jankmain.js already kept (Jank.slow(), hub.jank.recent()); no
// profiler, no timer.
const SlowCard = (() => {
  const C = SlowCardCore;
  let open_ = null;
  const dayKey = (t) => new Date(t - new Date(t).getTimezoneOffset() * 6e4).toISOString().slice(0, 10); // local day, as jank.js counts
  // everything the summariser needs: the window's last minute (Jank.slow()), the main process's (jankmain recent()),
  // the day's count (the main process's freezes are counted as they arrive)
  async function snapshot(win = 30e3) {
    const now = Date.now();
    let main = null;
    try { main = await window.hub?.jank?.recent?.(win + 5000); } catch { /* an older main.js */ }
    const J = Jank.slow();
    for (const st of main?.stalls || []) J.hiccup(st.t, st.ms);
    let d = {}; try { d = JSON.parse(localStorage.getItem('jank.hiccups') || '{}') || {}; } catch { /* none yet */ }
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const labOn = now - J.labAt < 1500; const L = J.labLast;
    return { now, win, off: J.off, view: J.view, labOn, lab: labOn && L ? { fps: Math.round(L.fps), worst: Math.round(L.worst || 0), cap: L.cap || 0, light: Boolean(L.light) } : null,
      events: J.last.map((x) => ({ ...x })), main, env: { ...J.env }, day: { today: d[dayKey(now)] || 0, yesterday: d[dayKey(y.getTime())] || 0, days: d } };
  }

  // the last 7 days' counts, oldest first (today last)
  function week(days = {}, now = Date.now()) {
    const out = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - i);
      const k = dayKey(d.getTime());
      out.push({ k, label: i === 0 ? 'Today' : d.toLocaleDateString([], { weekday: 'short' }), n: Number(days[k]) || 0 });
    }
    return out;
  }

  async function open() {
    if (open_?.isConnected) { open_.close(); }
    const snap = await snapshot(30e3);
    Jank.slow().slowDot(0); // (after: the main process's freezes are counted as the snapshot arrives)
    const s = C.summarise(snap);
    const text = () => C.report(snap, s);
    const wk = week(snap.day?.days, snap.now);
    const max = Math.max(1, ...wk.map((d) => d.n));
    const kind = s.last?.kind || '';
    const copy = el('button', { type: 'button', class: 'primary', text: '📋 Copy report for Claude', title: 'Puts the report on your clipboard (nothing is sent anywhere): paste it into a Claude chat', dataset: { k: 'copy' },
      on: { click: async () => { try { await copyText(text(), 'Report for Claude copied'); copy.textContent = '✓ Copied: paste it into Claude'; } catch { toast('Couldn’t reach the clipboard', { type: 'error' }); } } } });
    const btns = [copy];
    if (snap.off) btns.push(el('button', { type: 'button', text: '▶ Turn the watch back on', dataset: { k: 'on' }, on: { click: () => { Jank.setOff(false); dialog.close(); toast('Smoothness watch on: click 🐢 That was slow after the next hiccup', { timeout: 3000 }); } } }));
    if (kind === 'lab' || kind === 'gpu') btns.push(el('button', { type: 'button', text: '🪶 Light mode for the Lab', dataset: { k: 'light' }, on: { click: () => { dialog.close(); Commands.exec('/lab light on')?.catch?.(() => {}); } } }));
    btns.push(el('button', { type: 'button', class: 'ghost', text: 'Whole day…', title: 'The smoothness report: every area, the worst scripts, the Lab preview, the main process', dataset: { k: 'day' }, on: { click: () => { dialog.close(); Commands.exec('/smooth', window.H?.claudeAgent?.()?.id)?.catch?.(() => {}); } } }));
    btns.push(el('span', { class: 'spacer' }), el('button', { type: 'button', text: 'Close', dataset: { k: 'close' }, on: { click: () => dialog.close() } }));
    const dialog = el('dialog', { class: 'ui-modal slowcard', attrs: { 'aria-labelledby': 'slowcard-h' } }, el('form', { method: 'dialog', on: { submit: (e) => e.preventDefault() } },
      el('h2', { id: 'slowcard-h', text: '🐢 That was slow' }),
      el('p', { class: 'sc-head', text: s.headline, dataset: { kind: kind || (s.found ? '' : 'none') } }),
      s.lines.length ? el('ul', { class: 'sc-lines' }, s.lines.map((l) => el('li', { text: l }))) : '',
      s.tip ? el('p', { class: 'sc-tip', text: s.tip }) : '',
      el('div', { class: 'sc-day' },
        el('div', { class: 'sc-count', text: s.day }),
        el('div', { class: 'sc-week', attrs: { 'aria-label': `Hiccups over 500 ms, last 7 days: ${wk.map((d) => `${d.label} ${d.n}`).join(', ')}` } },
          wk.map((d) => el('span', { class: 'sc-bar', title: `${d.label}: ${d.n}`, attrs: { style: `--h:${Math.round((d.n / max) * 100)}%` }, dataset: { n: String(d.n) } }, el('i'), el('b', { text: d.label }))))),
      el('p', { class: 'sc-note', text: 'Measured on this computer from the last 30 seconds; nothing is sent anywhere.' }),
      el('div', { class: 'dialog-actions' }, btns)));
    dialog.addEventListener('close', () => { setTimeout(() => dialog.remove(), 0); if (open_ === dialog) open_ = null; });
    document.body.append(dialog);
    open_ = dialog;
    dialog.showModal();
    copy.focus();
    return s;
  }

  if (typeof Commands !== 'undefined' && !Commands.get('slow')) {
    Commands.register({
      name: 'slow', area: 'App', args: '[copy]',
      desc: '🐢 That was slow: what the last hiccup was (main process, the window, the Lab, the graphics card), today’s count over 500 ms; Copy report for Claude',
      keywords: 'hiccup freeze lag stutter slow jank hang that was slow',
      examples: ['/slow', '/slow copy'],
      complete: () => [['copy', 'the report for a Claude dev session, to the clipboard']],
      run: async (args) => {
        if (String(args || '').trim() === 'copy') { const snap = await snapshot(30e3); await copyText(C.report(snap), 'Report for Claude copied'); return 'Copied the report for Claude (nothing was sent).'; }
        await open();
        return undefined;
      },
    });
  }
  if (typeof AppUI !== 'undefined') AppUI.addAction?.('🐢 That was slow: what the last hiccup was', () => open());

  return { open, week, snapshot };
})();
window.SlowCard = SlowCard;
