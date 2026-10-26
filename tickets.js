// (round 68, tickets68) 🎟 My ticket: adding a ticket to a show and the big bright view for the door (lazy group
// 'tickets', loaded on the first click of "🎟 Add my ticket" / "🎟 Open my ticket": a show card, a show quest, the weekend
// plan's night out, the ✦ tracker's "🎟 Ticket ready" row, Shows I went to).
//   Adding: the computer's own file picker (PDF, PNG / JPEG / screenshot, Apple Wallet .pkpass), a file dragged onto the
//   card, or a file in Downloads named like the show ("Is this your ticket for X? Add it"). Hearth keeps a COPY in its data
//   folder under the show (data/tickets/<show>/, ticketsmain.js); the owner's own file is only read, never moved or changed.
//   The view: the whole window, white, the ticket as big as it fits (image, or the PDF in Chromium's own viewer; a Wallet
//   pass shows its words and its QR code when it has one), "☀ Turn your screen brightness all the way up", ⛶ Full screen,
//   the screen kept awake while it's open (no sleep at the door). After the night, the ticket is kept with it (Shows I
//   went to) and can be removed: to the Trash / Recycle Bin, never deleted for good.
// Announces every change on document as 'hearth:tickets' { list } (the cards, the weekend plan and the tracker relabel).
const Tickets = (() => {
  let list = [], dlg = null, cur = null, opener = null;
  const os = () => window.hub?.native?.os || (/Mac/.test(navigator.platform) ? 'mac' : 'win');
  const bin = () => (os() === 'win' ? 'Recycle Bin' : 'Trash');
  async function op(req) { const r = await window.hub?.tickets?.op(req); if (!r?.ok) throw Error(r?.error || 'Tickets need the Hearth app (not available here).'); return r.value; }
  function announce(l) { list = l || []; try { document.dispatchEvent(new CustomEvent('hearth:tickets', { detail: { list } })); } catch { /* a listener's problem */ } if (dlg && cur) render(); }
  async function refresh() { announce((await op({ op: 'list' })).list); return list; }
  const find = (key) => list.find((t) => t.key === key) || null;
  // what the main process keeps of a show (plain data: no functions, no DOM)
  const plain = (s) => ({ key: s.key, title: s.title, start: s.start, ...(s.end ? { end: s.end } : {}), dateOnly: !!s.dateOnly, venue: { name: s.venue?.name || '', address: s.venue?.address || '' }, lineup: (s.lineup || []).slice(0, 12) });
  const when = (s) => { try { return `${new Date(s.start).toLocaleDateString(undefined, { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short' })}${s.dateOnly ? '' : ` · ${new Date(s.start).toLocaleTimeString([], { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })}`}`; } catch { return ''; } };

  // ---------- adding ----------
  async function addPaths(show, paths, from) {
    let added = 0, dup = 0;
    for (const p of paths) { const r = await op({ op: 'add', show: plain(show), path: p, from }); announce(r.list); if (r.dup) dup++; else added++; }
    return done(show, added, dup);
  }
  function done(show, added, dup) {
    if (added) toast(`🎟 Ticket saved for ${show.title}${added > 1 ? ` (${added} files)` : ''}. Hearth keeps its own copy: at the door, click “🎟 Open my ticket” on the show.`, { timeout: 6000, action: { label: 'Open it', fn: () => view(show.key).catch((err) => toast(calmError(err), { type: 'error' })) } });
    else if (dup) toast(`That ticket is already saved for ${show.title}.`);
    return { added, dup };
  }
  async function pick(show, { from = 'pick' } = {}) {
    const { paths } = await op({ op: 'pick', title: `Your ticket for ${show.title}` });
    if (!paths?.length) return null;
    return addPaths(show, paths, from);
  }
  const addPath = (show, path, { from = 'drop' } = {}) => addPaths(show, [path], from);
  // dropped files: by their path; a file with no path (dragged from a browser) by its bytes
  async function addDropped(show, items) {
    let added = 0, dup = 0;
    for (const { path, file } of items) {
      let r;
      if (path) r = await op({ op: 'add', show: plain(show), path, from: 'drop' });
      else if (file) {
        if (file.size > 25 * 1024 * 1024) throw Error('That file is over 25 MB. A ticket is usually far smaller: is it the right file?');
        const b = new Uint8Array(await file.arrayBuffer()); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
        r = await op({ op: 'add', show: plain(show), data: btoa(s), name: file.name || 'ticket.png', from: 'drop' });
      } else continue;
      announce(r.list); if (r.dup) dup++; else added++;
    }
    return done(show, added, dup);
  }

  // ---------- the view: the whole window, white, big ----------
  async function view(key, { index = 0 } = {}) {
    await refresh();
    const t = find(key); if (!t) throw Error('No ticket saved for this show yet. Click 🎟 Add my ticket on its card.');
    close();
    opener = document.activeElement;
    cur = { key, index: Math.max(0, Math.min(index, t.files.length - 1)), confirm: '', pass: new Map() };
    dlg = el('dialog', { class: 'tk-view', attrs: { 'aria-label': `My ticket: ${t.show.title}` }, dataset: { ticket: key } });
    dlg.addEventListener('close', () => {
      op({ op: 'awake', on: false }).catch(() => {});
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      dlg?.remove(); dlg = null; cur = null; if (opener?.isConnected) opener.focus({ preventScroll: true });
    });
    dlg.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); } });
    document.body.append(dlg);
    render();
    dlg.showModal();
    dlg.querySelector('.tk-close')?.focus({ preventScroll: true });
    op({ op: 'awake', on: true }).catch(() => {}); // the screen stays on while the ticket is shown
    return dlg;
  }
  function close() { if (dlg?.open) dlg.close(); else { dlg?.remove(); dlg = null; cur = null; } }
  function step(d) { const t = cur && find(cur.key); if (!t || t.files.length < 2) return; cur.index = (cur.index + d + t.files.length) % t.files.length; cur.confirm = ''; render(); }
  const btn = (text, run, cls = '', title = '') => el('button', { type: 'button', class: `tk-btn ${cls}`.trim(), text, title: title || null, on: { click: (e) => { e.preventDefault(); Promise.resolve(run(e)).catch((err) => say(calmError(err), true)); } } });
  function say(text, bad = false) { const s = dlg?.querySelector('.tk-status'); if (s) { s.textContent = text; s.classList.toggle('bad', !!bad); } }
  function render() {
    if (!dlg || !cur) return;
    const t = find(cur.key);
    if (!t) { close(); return; }
    cur.index = Math.min(cur.index, t.files.length - 1);
    const f = t.files[cur.index], after = t.phase === 'after';
    const more = btn('⋯ More', (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.right - 240, r.bottom + 4, menu(t, f)); }, 'tk-more', 'Add another ticket, show the file, open it in another app');
    const removeB = btn(cur.confirm === f.id ? `Click again: move it to the ${bin()}` : `Remove (${bin()})`, () => removeNow(t, f), `tk-remove${cur.confirm === f.id ? ' sure' : ''}`, `Move this ticket file to the ${bin()} (it isn’t deleted for good)`);
    dlg.classList.toggle('tk-after', after);
    dlg.replaceChildren(
      el('header', { class: 'tk-bar' },
        el('div', { class: 'tk-what' }, el('strong', { text: `🎟 ${t.show.title}` }), el('span', { text: [when(t.show), t.show.venue?.name].filter(Boolean).join(' · ') })),
        el('p', { class: 'tk-bright', text: after ? 'The night is over: your ticket is kept with it in Shows I went to.' : '☀ Turn your screen brightness all the way up' }),
        el('div', { class: 'tk-acts' },
          t.files.length > 1 ? btn('‹', () => step(-1), 'tk-prev', 'Previous ticket (←)') : null,
          t.files.length > 1 ? el('span', { class: 'tk-n', text: `${cur.index + 1} / ${t.files.length}` }) : null,
          t.files.length > 1 ? btn('›', () => step(1), 'tk-next', 'Next ticket (→)') : null,
          after ? removeB : btn('⛶ Full screen', fullscreen, 'tk-full', 'The ticket fills the whole screen (Esc to come back)'),
          more,
          btn('× Close', () => close(), 'tk-close', 'Close (Esc)'))),
      el('div', { class: 'tk-stage' }, stage(t, f)),
      el('p', { class: 'tk-status', attrs: { role: 'status', 'aria-live': 'polite' } }));
  }
  function stage(t, f) {
    if (!f.here) return el('div', { class: 'tk-missing' }, el('p', { text: 'This ticket’s file is missing from Hearth’s data folder (moved or synced away?).' }), btn(`Remove it from the list (${bin()})`, () => removeNow(t, f, true)));
    if (f.kind === 'image') return el('img', { class: 'tk-img', attrs: { src: f.url, alt: `Ticket for ${t.show.title}`, draggable: 'false' } });
    if (f.kind === 'pdf') return el('iframe', { class: 'tk-pdf', attrs: { src: `${f.url}#toolbar=0&navpanes=0&view=Fit`, title: `Ticket for ${t.show.title} (PDF)` } });
    // a Wallet pass: its words, its QR code when it has one, Open in Wallet
    const box = el('div', { class: 'tk-pass' }, el('p', { class: 'tk-hint', text: 'Reading the Wallet pass…' }));
    const have = cur.pass.get(f.id);
    (have ? Promise.resolve(have) : op({ op: 'pass', key: t.key, id: f.id }).then((p) => { cur?.pass.set(f.id, p); return p; })).then((p) => {
      if (!box.isConnected && !have) return;
      const kids = [el('strong', { class: 'tk-pass-title', text: p.title || t.show.title }), p.org ? el('span', { class: 'tk-hint', text: p.org }) : null];
      if (p.svg) { const q = el('div', { class: 'tk-qr', attrs: { role: 'img', 'aria-label': 'The pass’s QR code' } }); q.innerHTML = p.svg; kids.push(q); }
      else kids.push(el('p', { class: 'tk-hint', text: p.code ? `Its code is a ${p.code.format || 'barcode'} Hearth can’t draw: open it in Wallet to show it.` : 'This pass has no code to show here: open it in Wallet.' }));
      kids.push(el('dl', { class: 'tk-fields' }, ...p.fields.flatMap((x) => [el('dt', { text: x.label }), el('dd', { text: x.value })])));
      kids.push(btn(os() === 'mac' ? 'Open in Wallet' : 'Open the pass', () => op({ op: 'open', key: t.key, id: f.id }), 'tk-wallet'));
      box.replaceChildren(...kids.filter(Boolean));
    }).catch((err) => { box.replaceChildren(el('p', { class: 'tk-hint', text: calmError(err) }), btn(os() === 'mac' ? 'Open in Wallet' : 'Open the pass', () => op({ op: 'open', key: t.key, id: f.id }), 'tk-wallet')); });
    return box;
  }
  function menu(t, f) {
    const show = t.show, run = (fn) => () => Promise.resolve(fn()).catch((err) => say(calmError(err), true));
    return [
      { label: '＋ Add another ticket (a friend’s, a second page)…', action: run(() => pick(show)) },
      { label: os() === 'mac' ? 'Show in Finder' : os() === 'win' ? 'Show in File Explorer' : 'Show in folder', action: run(() => op({ op: 'reveal', key: t.key, id: f.id })) },
      { label: f.kind === 'pkpass' ? (os() === 'mac' ? 'Open in Wallet' : 'Open the pass') : 'Open in another app', action: run(() => op({ op: 'open', key: t.key, id: f.id })) },
      '-',
      { label: `Remove this ticket (${bin()})`, action: run(() => { cur.confirm = f.id; return removeNow(t, f); }) }];
  }
  async function removeNow(t, f, force = false) {
    if (!force && cur?.confirm !== f.id) { cur.confirm = f.id; render(); say(`Click again to move “${f.name}” to the ${bin()}.`); setTimeout(() => { if (cur?.confirm === f.id) { cur.confirm = ''; render(); } }, 5000); return; }
    const r = await op({ op: 'remove', key: t.key, id: f.id });
    if (cur) cur.confirm = '';
    announce(r.list);
    toast(`🎟 Ticket for ${t.show.title} moved to the ${bin()}${r.where && r.where !== 'trash' ? ' (Hearth’s own trash folder: this drive has none)' : ''}.`);
  }
  async function fullscreen() {
    const st = dlg?.querySelector('.tk-stage'); if (!st) return;
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    try { await dlg.requestFullscreen(); } catch { say('Full screen isn’t available here: the ticket already fills the window.'); }
  }
  try { if (typeof Keys !== 'undefined') Keys.add({ area: 'Tickets', keys: '← →', what: 'previous / next ticket in the ticket view (also the ‹ › buttons)' }); } catch { /* the keys sheet is optional */ }
  return { pick, addPath, addDropped, view, close, refresh, state: () => ({ list, open: !!dlg, key: cur?.key || null, index: cur?.index ?? null }), _test: { plain } };
})();
