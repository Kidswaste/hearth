// 🧹 Disk calm, the window (round 53, diskcalm; the work is in diskcalmmain.js, the words in diskcalm-core.js).
// Lazy group 'diskcalm', right after the first screen.
//   · Settings › This computer & sync: one fold, "Space Hearth uses · 2.4 GB: backups 1.2 GB · game cache 600 MB · …".
//     Open, it lists each part in plain words, biggest first. A part Hearth can rebuild has Free up (to the Trash) and
//     says what comes back by itself; your work, your backups and the safety copies say why they're never offered
//   · Ctrl/⌘+K "Disk space: what Hearth keeps, free up caches" opens it; /disk [free <part> | tidy] in a chat
//   · the calm tidy's one quiet line in Activity ("Tidied 1.2 GB Hearth no longer needed … — to the Trash")
//   · one calm note (Hints) only when Hearth uses more than 25 GB with 1 GB+ to free, or the disk has under 5 GB free
// Nothing here costs a token: no prompt, no engine flag.
const DiskCalm = (() => {
  const A = () => window.hub?.diskcalm;
  const DC = window.DiskCalmCore;
  let m = null; let busy = null;
  const subs = new Set();
  async function refresh(fresh = false) {
    if (busy && !fresh) return busy;
    busy = A().measure({ fresh }).then((r) => { m = r; for (const fn of subs) { try { fn(m); } catch { /* a closed Settings */ } } return m; }).catch(() => m).finally(() => { busy = null; });
    return busy;
  }
  const plat = () => (/Mac/.test(navigator.platform) ? 'darwin' : /Win/.test(navigator.platform) ? 'win32' : 'linux');
  const binWord = () => (plat() === 'win32' ? 'Recycle Bin' : 'Trash');

  // ---------- the fold in Settings ----------
  function rowOf(P, bytes, paint) {
    const btn = P.free ? el('button', { type: 'button', class: 'ghost small dc-free', text: 'Free up', title: `Moves it to the ${binWord()}. ${P.back}`, on: { click: () => freeUp(P.id, btn).then(paint) } })
      : P.id === 'backups' ? el('button', { type: 'button', class: 'ghost small', text: 'Backups…', title: 'Every backup with what\'s inside; old ones go by themselves', on: { click: (e) => { e.currentTarget.closest('dialog')?.close(); window.Lazy?.load?.('backupauto').then(() => BackupAuto.dialog()).catch(() => {}); } } })
        : null;
    return el('div', { class: `dc-row${P.free ? ' dc-can' : ''}`, dataset: { part: P.id }, title: P.free ? P.back : P.keep },
      el('span', { class: 'dc-name', text: P.label }),
      el('span', { class: 'dc-size', text: DC.fmt(bytes) }),
      el('span', { class: 'dc-what', text: `${P.what}. ${P.free ? P.back : P.keep}.` }),
      btn || el('span'));
  }
  function line() {
    const state = el('span', { class: 'sc-state', text: m ? m.line : 'Measuring…' });
    const list = el('div', { class: 'dc-list' });
    const foot = el('div', { class: 'dc-foot sc-line' });
    const sum = el('summary', { class: 'sc-sum', title: 'How much room Hearth takes on this computer, and the caches you can free (they come back by themselves). Your work is never offered.' },
      el('span', { class: 'sc-title', text: 'Space Hearth uses' }), state);
    const d = el('details', { class: 'sc-fold dc-fold', dataset: { fold: 'disk' } }, sum,
      el('section', { class: 'settings-section dc-sec' }, el('h3', { text: 'Space Hearth uses' }), list, foot));
    const paint = () => {
      if (!m) return;
      if (state.textContent !== m.line) state.textContent = m.line;
      const rows = DC.PARTS.map((P) => [P, m.parts[P.id] || 0]).filter(([P, b]) => b > 0 || P.id === 'work').sort((a, b) => b[1] - a[1]);
      list.replaceChildren(...rows.map(([P, b]) => rowOf(P, b, () => refresh(true))));
      foot.textContent = [m.diskFree != null ? `Your disk has ${DC.fmt(m.diskFree)} free.` : '', m.freeable > 0 ? `${DC.fmt(m.freeable)} of Hearth's space can be freed and comes back by itself.` : '', m.playing ? 'A game is playing: its caches can be freed after it ends.' : ''].filter(Boolean).join(' ');
    };
    paint();
    const fn = () => { if (!d.isConnected && m) { subs.delete(fn); return; } paint(); };
    subs.add(fn);
    refresh();
    return d;
  }
  async function freeUp(id, btn) {
    const P = DC.BY[id];
    if (btn) { btn.disabled = true; btn.textContent = 'Freeing…'; }
    let r;
    try { r = await A().free(id); } catch (err) { r = { ok: false, why: String(err.message || err) }; }
    if (btn) { btn.disabled = false; btn.textContent = 'Free up'; }
    if (r.ok) toast(`Freed ${DC.fmt(r.freed)} (${P.label.replace(/^▶ /, '')}). ${P.back}.`, { timeout: 6000 });
    else toast(r.why || 'Nothing could be moved.', { type: 'error', timeout: 9000 });
    return r;
  }
  // Ctrl/⌘+K: Settings opened at the fold
  async function open() {
    await AppUI.openSettings();
    const d = await new Promise((res) => { let n = 0; const t = setInterval(() => { const x = document.querySelector('dialog.settings-dialog[open] .dc-fold'); if (x || ++n > 40) { clearInterval(t); res(x); } }, 50); });
    if (!d) return;
    d.open = true;
    d.scrollIntoView({ block: 'center' });
    d.querySelector('summary')?.focus();
  }

  // ---------- in words ----------
  async function command(args = '') {
    const [verb = '', ...rest] = String(args).trim().split(/\s+/);
    const v = verb.toLowerCase();
    if (v === 'free') {
      const want = rest.join(' ').toLowerCase();
      const P = DC.PARTS.find((x) => x.id === want || x.label.toLowerCase().replace(/^▶ /, '').startsWith(want) || x.group === want);
      if (!P) return `Which part? ${DC.FREEABLE.join(', ')}`;
      const r = await freeUp(P.id);
      return r.ok ? `🧹 Freed ${DC.fmt(r.freed)} (${P.label}). ${P.back}.` : r.why;
    }
    if (v === 'tidy') { const r = await A().tidy(); return r.skipped ? `Not now: ${r.skipped}.` : r.line ? `🧹 ${r.line}` : 'Nothing to tidy: every leftover is already gone.'; }
    if (v === 'open' || v === 'settings') { open(); return null; }
    const r = await refresh(true);
    if (!r) return 'Couldn\'t measure just now.';
    const rows = DC.PARTS.map((P) => [P, r.parts[P.id] || 0]).filter(([, b]) => b > 0).sort((a, b) => b[1] - a[1])
      .map(([P, b]) => `- ${P.label}: ${DC.fmt(b)}${P.free ? ` · can be freed (${P.back.toLowerCase()})` : ''}`);
    return [`🧹 **Space Hearth uses: ${r.line}**`, ...rows, r.diskFree != null ? `Your disk has ${DC.fmt(r.diskFree)} free.` : '', 'Free one: /disk free <part> · Settings › This computer & sync › Space Hearth uses'].filter(Boolean).join('\n');
  }

  // ---------- the quiet line, the calm note ----------
  function said(t) { try { if (store.get('diskcalm.said', 0) >= t) return true; store.set('diskcalm.said', t); } catch { /* fine */ } return false; }
  function tidied(l) {
    if (!l?.line || said(l.at)) return;
    (window.Lazy?.load ? Lazy.load('activity') : Promise.resolve()).catch(() => {}).then(() => document.dispatchEvent(new CustomEvent('hearth:activity', { detail: { icon: '🧹', text: l.line } })));
  }
  function hint(h) {
    if (!h?.text || !window.Hints) return;
    const wk = Math.floor(Date.now() / (7 * 864e5));
    Hints.offer({ id: `disk:${h.kind}:${wk}`, kind: h.kind === 'low' ? 'notice' : 'tip', rank: h.kind === 'low' ? 30 : 60, ttl: 6 * 3600e3,
      show: () => toast(h.text, { timeout: 12000, action: { label: 'See what\'s free…', fn: () => open() } }) });
  }

  function start() {
    if (!A()) return;
    A().onTidied?.(tidied);
    A().onHint?.(hint);
    A().last?.().then(tidied).catch(() => {});
    if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Disk space: what Hearth keeps, free up caches', () => open());
    if (typeof Commands !== 'undefined' && !Commands.get('disk')) {
      Commands.register({ name: 'disk', aliases: ['disk-space', 'space'], area: 'App', args: '[free <part> | tidy | open]',
        desc: 'Space Hearth uses on this computer, and free up caches it rebuilds by itself (to the Trash)',
        examples: ['/disk', '/disk free bakes', '/disk tidy'],
        complete: (a) => ['tidy', 'open', ...DC.FREEABLE.map((x) => `free ${x}`)].filter((x) => x.startsWith(a)).map((value) => ({ value })),
        run: (args) => command(args) });
    }
  }
  start();

  return { line, open, refresh, freeUp, command, state: () => m };
})();
window.DiskCalm = DiskCalm;
