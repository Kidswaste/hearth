// (round 90, devices90) Settings › This computer & sync › "Your computers": every computer Hearth knows (name, system,
// last seen, Hearth version, reads pieces), "Forget this computer…" for one not seen for a week (a plain confirmation:
// it comes back as a returning computer if it syncs again; nothing of its data is deleted; its record is moved to the
// cloud folder's .sync/forgotten, never deleted), and the space very long chats' pieces take, with "Free up X: remove
// kept-aside pieces older than 7 days" (to this computer's Trash; a piece any list still names is never touched).
// Lazy group 'devices90' (loaded when Settings opens; nothing on the first screen). The work is in devices90-core.js
// (main side, syncmain.js: sync:devices / sync:forget / sync:packSpace / sync:packFree). No tokens, nothing sent to any AI.
const Devices90 = (() => {
  const api = () => window.hub?.sync;
  const DAY = 864e5;
  const fmt = (b) => (!(b > 0) ? '0 MB' : b >= 1e9 ? `${(b / 1e9).toFixed(b >= 1e10 ? 0 : 1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
  const ago = (t) => { if (!t) return 'never'; const s = Math.max(0, Date.now() - t) / 1000; if (s < 90) return 'just now'; if (s < 3600) return `${Math.round(s / 60)} minutes ago`; if (s < 36 * 3600) return `${Math.round(s / 3600)} hours ago`; const d = Math.round(s / 86400); return d < 60 ? `${d} day${d === 1 ? '' : 's'} ago` : `${Math.round(d / 30)} months ago`; };
  const sys = (p) => (p === 'darwin' ? 'Mac' : p === 'win32' ? 'Windows' : p === 'linux' ? 'Linux' : p || 'unknown system');
  const bin = () => (/Win/.test(navigator.platform) ? 'Recycle Bin' : 'Trash');
  const WHY = {
    'this-computer': 'This is the computer you are on: it can\'t be forgotten.',
    recent: 'That computer synced lately, so it wasn\'t forgotten.',
    'being-written': 'Its record is being written right now: try again later.',
    unreadable: 'Its record can\'t be read right now (your cloud drive may still be bringing it down): nothing was changed.',
    gone: 'It is already gone from the list.', unknown: 'That isn\'t a computer Hearth knows.', busy: 'Try again in a moment.', off: 'Sync is off.',
  };
  const HELD = {
    manifest: 'One of the pieces\' lists can\'t be read right now, so nothing was removed (a list may still name any piece). Try again later.',
    newer: 'A newer Hearth wrote some pieces\' lists, so nothing was removed. Update Hearth here first.',
    placeholder: 'Some pieces\' lists are still only in the cloud (not downloaded yet), so nothing was removed. Try again later.',
    folder: 'A pieces folder can\'t be read right now, so nothing was removed.', off: 'Sync is off.',
  };

  // a plain confirmation inside the row: the words, then [yes] [Cancel]
  function confirmIn(host, text, yes, fn) {
    host.querySelector('.dv-confirm')?.remove();
    const box = el('div', { class: 'dv-confirm', attrs: { role: 'group' } },
      el('p', { class: 'dv-confirm-text', text }),
      el('div', { class: 'button-row' },
        el('button', { type: 'button', class: 'danger small dv-yes', text: yes, on: { click: async (e) => { e.currentTarget.disabled = true; await fn(); box.remove(); } } }),
        el('button', { type: 'button', class: 'ghost small dv-no', text: 'Cancel', on: { click: () => box.remove() } })));
    host.append(box);
    box.querySelector('.dv-no').focus();
    return box;
  }

  function computerRow(c, paint) {
    const name = c.unreadable ? 'A computer whose record can\'t be read' : c.name;
    const bits = c.unreadable
      ? [`record last changed ${ago(c.lastSeen)}`, 'its details can\'t be read (it keeps "Send very long chats in pieces" waiting)']
      : [sys(c.platform), c.me ? 'this computer' : `last seen ${ago(c.lastSeen)}`, c.app ? `Hearth ${c.app}` : 'an older Hearth (no version in its record)', c.packs ? 'reads pieces' : 'doesn\'t read pieces'];
    const row = el('div', { class: `dv-row${c.me ? ' dv-me' : ''}${c.stale ? ' dv-stale' : ''}`, dataset: { file: c.file } },
      el('span', { class: 'dv-name', text: c.me ? `${name} (this computer)` : name }),
      el('span', { class: 'dv-what', text: bits.join(' · ') }));
    if (c.canForget && !c.me) {
      const label = c.unreadable ? 'this computer' : c.name;
      row.append(el('button', { type: 'button', class: 'ghost small dv-forget', text: 'Forget this computer…', title: `${label} hasn't synced for over a week. Forgetting it lets the others stop waiting for it.`,
        on: { click: () => confirmIn(row, `Forget ${label}? Hearth stops counting it as one of your computers, so the others no longer wait for it (for example to send very long chats in pieces). Nothing of its data is deleted: its chats and files stay in your cloud folder and on that computer, and its record is kept aside in the cloud folder's forgotten list. If ${label} comes back, it is treated as a new computer joining again: its next sync brings it up to date and keeps what it has.`, 'Forget it', async () => {
          let r; try { r = await api().forget(c.file); } catch (err) { r = { ok: false, why: 'unreadable', error: err.message }; }
          if (r?.ok) toast(`${r.name || label} is forgotten. Nothing of its data was deleted; if it comes back, it joins again by itself.`, { timeout: 7000 });
          else toast(WHY[r?.why] || 'Nothing was changed.', { type: 'error', timeout: 8000 });
          paint(true);
        }) } }));
    }
    return row;
  }

  function line() {
    const state = el('span', { class: 'sc-state', text: 'Looking…' });
    const list = el('div', { class: 'dv-list' });
    const gone = el('div', { class: 'dv-gone' });
    const space = el('div', { class: 'dv-space' });
    const sum = el('summary', { class: 'sc-sum', title: 'Every computer that syncs with this one: when it was last seen, its Hearth, whether it reads very long chats in pieces. A computer gone for good can be forgotten.' },
      el('span', { class: 'sc-title', text: 'Your computers' }), state);
    const d = el('details', { class: 'sc-fold dv-fold', dataset: { fold: 'devices' } }, sum,
      el('section', { class: 'settings-section dv-sec' }, el('h3', { text: 'Your computers' }), list, gone, el('h4', { class: 'dv-h', text: 'Very long chats\' pieces' }), space));
    let busy = false;
    async function paint(fresh) {
      if (busy && !fresh) return;
      busy = true;
      try {
        const st = await api()?.status?.().catch(() => null);
        if (!st?.on) { d.hidden = true; return; }
        d.hidden = false;
        const r = await api().devices().catch(() => null);
        if (!r || r.error) { state.textContent = 'Can\'t read the list right now'; list.replaceChildren(el('p', { class: 'hint', text: 'The computers\' list in your cloud folder can\'t be read right now (nothing was changed). Hearth looks again when you open this.' })); }
        else {
          const others = r.computers.filter((c) => !c.me);
          const stale = others.filter((c) => c.stale).length;
          state.textContent = `${r.computers.length} computer${r.computers.length === 1 ? '' : 's'}${stale ? ` · ${stale} not seen for a week` : ''}`;
          list.replaceChildren(...r.computers.map((c) => computerRow(c, paint)));
          gone.replaceChildren(...(r.forgotten.length ? [el('p', { class: 'hint dv-forgotten', text: `Forgotten: ${r.forgotten.slice(0, 5).map((f) => `${f.name} (${f.back ? `came back ${ago(f.backAt)}` : `forgotten ${ago(f.at)}`})`).join(' · ')}` })] : []));
        }
        await paintSpace();
      } finally { busy = false; }
    }
    async function paintSpace() {
      const s = await api().packSpace?.().catch(() => null);
      if (!s) { space.replaceChildren(el('p', { class: 'hint', text: 'Can\'t measure right now.' })); return; }
      const total = s.cloud.bytes + s.base.bytes + s.trash.bytes;
      const rows = [
        el('p', { class: 'dv-line', text: total ? `In your cloud folder: ${fmt(s.cloud.bytes)} of pieces (the newest state of each very long chat). On this computer: ${fmt(s.base.bytes)} kept for merging, and ${fmt(s.trash.bytes)} of old pieces kept aside (Hearth keeps them 30 days, then lets them go)${s.trash.old ? `, ${fmt(s.trash.old)} of them older than 7 days` : ''}.` : 'No pieces yet: very long chats haven\'t been sent in pieces from this computer.' }),
      ];
      if (s.held && s.trash.old > 0) rows.push(el('p', { class: 'hint dv-held', text: HELD[s.held] ? HELD[s.held].replace(', so nothing was removed', ', so old pieces can\'t be freed just now').replace(' Try again later.', '') : 'Old pieces can\'t be freed just now.' }));
      if (s.freeable > 0) {
        const btn = el('button', { type: 'button', class: 'ghost small dv-free', text: `Free up ${fmt(s.freeable)}: remove kept-aside pieces older than 7 days`, title: `Moves them to this computer's ${bin()}. Pieces a chat still needs are never touched.`,
          on: { click: () => confirmIn(space, `Move ${fmt(s.freeable)} of old pieces to this computer's ${bin()}? They are copies Hearth set aside after tidying; no chat needs them. Any piece a chat still names stays where it is.`, 'Move to ' + bin(), async () => {
            let r; try { r = await api().packFree(); } catch (err) { r = { ok: false, held: 'folder', error: err.message }; }
            if (r?.ok) toast(r.moved ? `Freed ${fmt(r.bytes)}: old pieces are in the ${bin()}.${r.failed?.length ? ` ${r.failed.length} couldn't move and stayed where they were.` : ''}` : 'Nothing to free: no old pieces left.', { timeout: 7000 });
            else toast(HELD[r?.held] || 'Nothing was removed.', { type: 'error', timeout: 9000 });
            paintSpace();
          }) } });
        rows.push(el('div', { class: 'button-row' }, btn));
      }
      rows.push(el('p', { class: 'hint dv-note', text: 'Hearth doesn\'t limit this space by itself. If you\'d like an automatic limit (for example "keep 7 days" or "at most 1 GB"), ask for one and it can be added.' }));
      rows.push(el('p', { class: 'hint dv-note', text: 'Pieces Hearth tidies out of your cloud folder may also wait in your cloud service\'s own deleted files (iCloud, Google Drive, Dropbox, OneDrive each keep them by their own rules). That trash is your provider\'s: Hearth can\'t see or empty it; you can empty it on their website if you need the room.' }));
      space.replaceChildren(...rows);
    }
    paint();
    d.addEventListener('toggle', () => { if (d.open) paint(true); });
    return d;
  }

  return { line, _words: { fmt, ago, sys } };
})();
window.Devices90 = Devices90;
