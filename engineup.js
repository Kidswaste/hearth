// (round 177, engine177) The engine update, the window (the work is in engineupmain.js, the rules and words in
// engineup-core.js). Lazy group 'engineup', loaded when Settings opens.
//   · Settings › This computer & sync: one line, "Engine: Electron 44.5.1 (Chromium 152). …", and only when engine.json
//     approves a newer engine for this computer, one button: "Update the engine (≈ 150 MB download)". The click
//     downloads it (progress, Stop), checks its checksum, puts it beside the current one; then "Restart Hearth to
//     finish". Nothing downloads, installs or restarts by itself.
// Nothing here costs a token.
const EngineUp = (() => {
  const A = () => window.hub?.engineup;
  const C = () => window.EngineUpCore;
  let s = null;
  const subs = new Set();
  const tell = (st) => { s = st; for (const fn of subs) { try { fn(); } catch { /* a closed Settings */ } } };
  let hooked = false;
  const hook = () => { if (hooked || !A()?.onProgress) return; hooked = true; A().onProgress(tell); };
  const MBs = (b) => Math.round((b || 0) / 1048576);

  function words(st) {
    if (!st) return 'Engine: …';
    const base = C().line(st);
    if (st.phase === 'downloading') return `Downloading Electron ${st.next?.version}: ${MBs(st.got)} of ${MBs(st.total)} MB. Hearth keeps working meanwhile.`;
    if (st.phase === 'checking') return `Checking the download against Electron's published checksum…`;
    if (st.phase === 'unpacking') return 'Checked. Putting it beside the current engine (the current one stays until the new one has started once)…';
    if (st.phase === 'error') return `${base} ${st.error}`;
    return base;
  }
  function button(st) {
    if (!st) return null;
    if (st.failedBack && !st.phase) return { text: 'Remove the failed copy', title: 'Deletes the new engine that didn\'t start (electron-failed). The engine Hearth runs on stays.', go: () => A().forgetFailed().then(refresh) };
    if (st.phase === 'downloading') return { text: 'Stop', title: 'Stops the download; nothing is changed', go: () => A().cancel() };
    if (st.phase === 'checking' || st.phase === 'unpacking') return null;
    if (st.phase === 'ready') return { text: 'Restart Hearth to finish', title: st.layout === 'mac-app' ? 'Hearth quits, Hearth.app is rebuilt on the new engine (the old app goes to the Trash) and Hearth opens again' : 'Hearth closes and starts again on the new engine; if it can\'t start, the engine before comes back', go: () => A().restart().then((r) => { if (r?.refused) toast(r.refused, { type: 'error' }); }) };
    if (st.next) return { text: st.phase === 'error' ? 'Try again' : `Update the engine (${st.next.mb} download)`, title: `Downloads Electron ${st.next.version} from Electron's own releases, checks its checksum, and puts it in place at Hearth's next start. Your chats and settings aren't touched.`, go: () => A().get().then((r) => { if (r?.refused) toast(r.refused, { type: 'error' }); tell(r); }) };
    return null;
  }
  async function refresh() { hook(); try { tell(await A().state()); } catch { /* no main side */ } return s; }

  function line() {
    const text = el('span', { class: 'sc-line eu-line', text: words(s) });
    const bar = el('progress', { class: 'eu-bar', max: 1, value: 0, style: { display: 'block', width: '100%', height: '6px', marginTop: '4px' } });
    const btn = el('button', { type: 'button', class: 'ghost small eu-btn' });
    let act = null; const made = Date.now();
    btn.addEventListener('click', () => { act?.(); });
    const row = el('div', { class: 'sc-row eu-row', title: 'The engine Hearth runs on (Electron, a copy of Chrome). Hearth\'s own updates don\'t change it. A newer one is offered here only once Hearth approved it, and downloads only when you click.' },
      el('span', { class: 'eu-text', style: { display: 'flex', flexDirection: 'column', minWidth: '0', flex: '1 1 auto' } }, text, bar), el('span', { class: 'spacer' }), btn);
    const paint = () => {
      if (!row.isConnected && Date.now() - made > 5000) { subs.delete(paint); return; }
      const w = words(s); if (text.textContent !== w) text.textContent = w;
      bar.hidden = s?.phase !== 'downloading';
      if (!bar.hidden) bar.value = s.total ? Math.min(1, s.got / s.total) : 0;
      const b = button(s);
      btn.hidden = !b;
      if (b) { btn.textContent = b.text; btn.title = b.title; act = b.go; }
    };
    paint();
    subs.add(paint);
    refresh();
    return row;
  }
  return { line, refresh, words, get state() { return s; } };
})();
window.EngineUp = EngineUp;
