// 💾 Automatic backups, the window (round 45, backupauto; the work is in backupautomain.js, the words in
// backupauto-core.js). Lazy group 'backupauto', right after the first screen.
//   · Settings › This computer & sync: one small line, "Last backup: 2 h ago ✓", with Backups…
//   · Backups… (Settings, Ctrl/⌘+K, /backups): every backup by date with what's inside (12 scenes · 40 chats…), checked
//     or not, from this computer or the other; per backup: Restore missing things (the merging restore: adds, never
//     deletes) and Show in Finder / Explorer; right-click for Check again. Back up now, Recover…, where this computer
//     keeps them (Documents by default; iCloud Drive on a Mac / OneDrive on Windows offered with a plain why), on / off.
//   · a backup that didn't finish says why in plain words, with Retry (automatic ones calmly, through Hints)
//   · one calm note when no backup worked for 3 days (Hints, a 'notice': not silenced by "Don't show tips")
//   · tells the main process the battery level (it never backs up on battery below 40 %)
//   · /backup [now | list | status | check | folder … | auto on|off] (addons-cmds.js asks BackupAuto.command)
// Nothing here costs a token: no prompt, no engine flag.
const BackupAuto = (() => {
  const A = () => window.hub?.backupauto;
  const BC = window.BackupAutoCore;
  let st = null;
  const subs = new Set();
  const plat = () => st?.platform || (/Mac/.test(navigator.platform) ? 'darwin' : /Win/.test(navigator.platform) ? 'win32' : 'linux');
  const showIn = () => (plat() === 'darwin' ? 'Show in Finder' : plat() === 'win32' ? 'Show in Explorer' : 'Show in folder');
  const pcWord = () => (plat() === 'darwin' ? 'Mac' : plat() === 'win32' ? 'PC' : 'computer');
  const ago = (t) => BC.ago(t, st?.now ? st.now + (Date.now() - got) : Date.now());
  let got = Date.now();
  const STEPS = { starting: 'Starting…', looking: 'Looking at your files…', copying: 'Copying…', media: 'Saving big media once…', zipping: 'Zipping…', checking: 'Checking the backup…', tidying: 'Tidying old backups…' };

  // ---------- state ----------
  async function refresh() { try { set(await A().state()); } catch { /* not there */ } return st; }
  function set(s) {
    if (!s) return;
    const was = st; st = s; got = Date.now();
    for (const fn of subs) { try { fn(st, was); } catch { /* a closed dialog */ } }
    noteFailure(was); noteStale();
  }
  const on = (fn) => { subs.add(fn); return () => subs.delete(fn); };

  // ---------- the line in Settings › This computer & sync ----------
  function lineText(s = st) {
    if (!s) return { text: 'Backups: …', mark: '' };
    if (s.running) return { text: `Backing up now… ${STEPS[s.running.step] || ''}`.trim(), mark: 'run' };
    if (s.auto === false) return { text: `Automatic backups are off on this ${pcWord()}${s.lastOk ? ` · last backup ${ago(s.lastOk)}` : ''}`, mark: 'off' };
    if (s.last && s.last.ok === false && (!s.lastOk || s.last.at > s.lastOk)) return { text: `Last backup didn't finish (${ago(s.last.at)})${s.lastOk ? ` · last good one ${ago(s.lastOk)}` : ''}`, mark: 'bad', why: s.last.why };
    if (!s.lastOk) return { text: 'No backup yet: the first one runs by itself when the computer is idle', mark: '' };
    return { text: `Last backup: ${ago(s.lastOk)} ✓`, mark: s.stale ? 'bad' : 'ok' };
  }
  function line() {
    const text = el('span', { class: 'ba-line-text sc-line' });
    const retry = el('button', { type: 'button', class: 'ghost small ba-retry', text: 'Retry', hidden: true, title: 'Try the backup again now', on: { click: () => backupNow() } });
    const row = el('div', { class: 'sc-row ba-line', title: 'Hearth backs up your scenes, chats, memory and settings by itself, once a day when the computer is idle, and checks each backup' },
      text, el('span', { class: 'spacer' }), retry,
      el('button', { type: 'button', class: 'ghost small', text: 'Backups…', title: 'Every backup with what\'s inside, restore missing things, where they go', on: { click: (e) => { e.currentTarget.closest('dialog')?.close(); dialog(); } } }));
    const paint = () => {
      const t = lineText();
      if (text.textContent !== t.text) text.textContent = t.text;
      if (row.dataset.mark !== t.mark) row.dataset.mark = t.mark;
      text.title = t.why || '';
      retry.hidden = t.mark !== 'bad' || Boolean(st?.running);
    };
    paint();
    const off = on(paint);
    // gone with Settings: unsubscribed when the row leaves the page (checked on the next change)
    subs.add(function gone() { if (!row.isConnected) { off(); subs.delete(gone); } });
    if (!st) refresh();
    return row;
  }

  // ---------- backing up ----------
  async function backupNow({ quiet = false } = {}) {
    const t = quiet ? null : toast('Backing up… (checked when it\'s done)', { timeout: 120000 });
    let r;
    try { r = await A().run('manual'); } catch (err) { r = { ok: false, why: String(err.message || err), fix: 'retry' }; }
    t?.remove();
    refresh();
    if (r.ok) {
      try { store.set('backup.last', Date.now()); } catch { /* fine */ }
      if (!quiet) toast(`💾 Backup saved and checked: ${BC.summary(r.counts, { short: true })} (${BC.fmtBytes(r.size)})${r.removed ? ` · ${r.removed} older one${r.removed === 1 ? '' : 's'} tidied` : ''}`, { timeout: 7000, action: { label: showIn(), fn: () => A().reveal(r.path) } });
    } else if (!quiet) failToast(r);
    return r;
  }
  function failToast(r) {
    toast(`The backup didn't finish. ${r.why || ''}`, { type: 'error', timeout: 15000, action: r.fix === 'folder' || r.fix === 'permission' || r.fix === 'space' ? { label: 'Choose another folder…', fn: () => pickFolder() } : { label: 'Retry', fn: () => backupNow() } });
  }
  // an automatic one that failed: calmly (one at a time, never over your work), once per new failure
  function noteFailure(was) {
    const l = st?.last;
    if (!l || l.ok !== false || l.reason === 'manual' || (was?.last && was.last.at === l.at)) return;
    if (!window.Hints) return;
    Hints.offer({ id: `backup:fail:${l.code || 'x'}:${new Date(l.at).toDateString()}`, kind: 'notice', rank: 30, ttl: 6 * 3600e3,
      still: () => st?.last?.ok === false,
      show: () => toast(`Your automatic backup didn't finish. ${l.why}`, { timeout: 14000, action: l.fix === 'folder' || l.fix === 'permission' ? { label: 'Choose another folder…', fn: () => pickFolder() } : { label: 'Retry', fn: () => backupNow() } }) });
  }
  // no good backup for 3 days: one calm note (again for a new stretch)
  function noteStale() {
    if (!st?.stale || !window.Hints) return;
    Hints.offer({ id: `backup:stale:${st.lastOk || st.since || 0}`, kind: 'notice', rank: 35, ttl: 12 * 3600e3, still: () => Boolean(st?.stale),
      show: () => toast(`No backup has worked on this ${pcWord()} for ${st.lastOk ? ago(st.lastOk).replace(/ ago$/, '') : '3 days'}${st.last?.ok === false ? `: ${st.last.why}` : ' (it waits for the computer to be idle and plugged in or above 40 % battery)'}`, { timeout: 15000, action: { label: 'Back up now', fn: () => backupNow() } }) });
  }

  // ---------- where ----------
  async function pickFolder(arg) {
    const r = await A().setDir(arg || 'pick');
    if (r.cancelled) return r;
    if (!r.ok) { toast(r.why, { type: 'error', timeout: 9000 }); return r; }
    toast(`This ${pcWord()} now keeps its backups in ${r.label}`, { timeout: 4000 });
    refresh();
    return r;
  }
  async function placeMenu(anchor) {
    const p = await A().places();
    const cur = p.dir;
    const items = [{ label: `${p.def.label} › Hearth backups${cur === p.def.dir ? ' ✓' : ''}`, hint: p.def.why, action: () => pickFolder('documents').then(() => paintDialog?.()) }];
    for (const x of p.offers) items.push({ label: `${x.label} › Hearth backups${cur === x.dir ? ' ✓' : ''}`, hint: x.why, action: () => pickFolder(x.id).then(() => paintDialog?.()) });
    items.push({ label: 'Choose a folder…', hint: 'Another disk, a USB drive… (never inside Hearth\'s data or sync folder)', action: () => pickFolder('pick').then(() => paintDialog?.()) });
    items.push({ label: `Open the folder in ${plat() === 'darwin' ? 'Finder' : plat() === 'win32' ? 'Explorer' : 'your files'}`, action: () => A().reveal() });
    const r = anchor.getBoundingClientRect();
    showMenu(r.left, r.bottom + 4, items);
  }

  // ---------- the Backups dialog ----------
  let paintDialog = null;
  const dayWord = (t) => {
    const d = new Date(t); const n = new Date();
    const same = (a, b) => a.toDateString() === b.toDateString();
    if (same(d, n)) return 'Today';
    if (same(d, new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1))) return 'Yesterday';
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', ...(d.getFullYear() !== n.getFullYear() ? { year: 'numeric' } : {}) });
  };
  const timeWord = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  function rowOf(b) {
    const what = el('span', { class: 'ba-what', text: b.counts ? BC.summary(b.counts) : b.hearth ? 'Looking inside…' : 'Not a Hearth backup?' });
    const mark = b.ok === false ? el('span', { class: 'ba-mark bad', text: '⚠', title: `A check found a problem: ${(b.problems || []).join('; ') || 'damaged'}` })
      : b.ok === true ? el('span', { class: 'ba-mark ok', text: '✓', title: `Checked ${b.checkedAt ? ago(b.checkedAt) : ''}: every file opens, the counts match` })
        : el('span', { class: 'ba-mark', text: '·', title: 'Not checked yet (right-click › Check it)' });
    const reason = BC.REASON_WORDS[b.reason] ?? '';
    const restore = el('button', { type: 'button', class: 'ghost small', text: 'Restore missing things', title: 'Adds what this backup has and you don\'t (a deleted scene, a lost chat, memory lines). Nothing of yours is deleted or replaced; you see the list first.', disabled: b.ok === false, on: { click: () => restoreFrom(b) } });
    const show = el('button', { type: 'button', class: 'ghost small', text: showIn(), on: { click: () => A().reveal(b.path) } });
    const row = el('div', { class: 'ba-row', dataset: { name: b.name, ok: String(b.ok) }, attrs: { tabindex: '0' } },
      mark,
      el('span', { class: 'ba-when', text: timeWord(b.at) }),
      el('span', { class: 'ba-body' }, what,
        el('span', { class: 'hint ba-sub', text: [reason, b.mine ? '' : `from ${b.computer ? `“${b.computer}”` : 'another computer'}`, BC.fmtBytes(b.size), b.media ? `+ ${b.media} big file${b.media === 1 ? '' : 's'} kept once` : '', b.ok === false ? `damaged: ${(b.problems || [])[0] || ''}` : ''].filter(Boolean).join(' · ') })),
      restore, show);
    const menu = (x, y) => showMenu(x, y, [
      { label: 'Restore missing things…', action: () => restoreFrom(b), disabled: b.ok === false },
      { label: 'Check it again', hint: 'Opens the zip and reads every key file', action: () => checkOne(b) },
      { label: showIn(), action: () => A().reveal(b.path) },
      { label: 'Recover… (pick things one by one)', action: () => recover() },
    ]);
    row.addEventListener('contextmenu', (e) => { e.preventDefault(); menu(e.clientX, e.clientY); });
    row.addEventListener('keydown', (e) => { if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r = row.getBoundingClientRect(); menu(r.left + 20, r.bottom); } });
    return row;
  }
  async function checkOne(b) {
    const t = toast('Checking the backup…', { timeout: 60000 });
    let v; try { v = await A().verify(b.path); } catch (err) { v = { ok: false, problems: [err.message] }; }
    t.remove();
    toast(v.ok ? `✓ That backup is good: ${BC.summary(v.counts)}` : `⚠ That backup is damaged: ${(v.problems || []).slice(0, 2).join('; ')}. Use another one.`, { type: v.ok ? 'info' : 'error', timeout: 9000 });
    paintDialog?.();
    return v;
  }
  async function restoreFrom(b) {
    if (typeof AppUI === 'undefined' || !AppUI.restoreBackup) return null;
    const r = await AppUI.restoreBackup(b.path);
    refresh();
    return r;
  }
  async function recover() {
    document.querySelector('.backups-dialog')?.close();
    try { if (!window.DataSafe && window.Lazy) await window.Lazy.load('datasafe'); await window.DataSafe?.recover(); } catch (err) { toast(err.message, { type: 'error' }); }
  }
  function dialog() {
    document.querySelector('.backups-dialog')?.close();
    const status = el('div', { class: 'ba-status' });
    const where = el('div', { class: 'ba-where' });
    const list = el('div', { class: 'ba-list' }, el('p', { class: 'hint', text: 'Looking for your backups…' }));
    const autoBox = el('input', { type: 'checkbox' });
    const dlg = el('dialog', { class: 'ui-modal backups-dialog ba-dialog' });
    const more = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      showMenu(r.left, r.bottom + 4, [
        { label: 'Restore from a file…', hint: 'A Hearth backup zip from anywhere (adds what\'s missing)', action: () => AppUI.restoreBackup?.() },
        { label: 'Save a copy as…', hint: 'One zip wherever you like', action: () => AppUI.exportData?.() },
        { label: `Open the backup folder`, action: () => A().reveal() },
      ]);
    };
    dlg.append(el('form', { method: 'dialog' },
      el('h2', { text: 'Backups' }),
      status, where, list,
      el('div', { class: 'dialog-actions' },
        el('button', { type: 'button', class: 'primary small ba-now', text: 'Back up now', on: { click: async (e) => { e.currentTarget.disabled = true; await backupNow(); paint(); } } }),
        // (round 43, scenesafe → datasafe) 🛟 Recover…: lost chats, memory lines, settings, tool data and Lab scenes from backups and every other copy
        el('button', { type: 'button', class: 'ghost small', text: 'Recover…', title: 'Lost chats, memory, settings, tool data and Lab scenes from backups, automatic copies or sync, added next to yours', on: { click: () => recover() } }),
        el('label', { class: 'check hint ba-auto', title: `Once a day when this ${pcWord()} is idle, before every update and before a restore (never while rendering, never on battery below 40 %)` }, autoBox, ' By itself'),
        el('button', { type: 'button', class: 'ghost small', text: '⋯', title: 'More: restore from a file, save a copy as, open the folder', attrs: { 'aria-label': 'More backup actions' }, on: { click: more } }),
        el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Close' }))));
    autoBox.addEventListener('change', async () => { set(await A().setAuto(autoBox.checked)); toast(autoBox.checked ? `This ${pcWord()} backs up by itself again` : `Automatic backups are off on this ${pcWord()} (Back up now still works)`, { timeout: 3500 }); });
    const paintStatus = () => {
      const s = st || {};
      autoBox.checked = s.auto !== false;
      const t = lineText(s);
      const kids = [el('div', { class: `ba-state ${t.mark}` }, el('b', { text: t.text }), t.mark === 'run' ? el('span', { class: 'ba-spin', attrs: { 'aria-hidden': 'true' } }) : null)];
      if (t.mark === 'bad' && s.last?.ok === false) {
        kids.push(el('p', { class: 'ba-why', text: s.last.why }));
        kids.push(el('div', { class: 'button-row' },
          el('button', { type: 'button', class: 'small', text: 'Retry', on: { click: async () => { await backupNow(); paint(); } } }),
          ['folder', 'permission', 'space'].includes(s.last.fix) ? el('button', { type: 'button', class: 'ghost small', text: 'Choose another folder…', on: { click: () => pickFolder() } }) : null));
      }
      kids.push(el('p', { class: 'hint', text: `This ${pcWord()} backs up your scenes, chats, memory and settings by itself once a day when it's idle, and before every update and restore. Each backup is checked. Kept: the last 7 days, 4 weeks and 6 months.` }));
      status.replaceChildren(...kids);
    };
    const paintWhere = async () => {
      let p = null; try { p = await A().places(); } catch { p = null; }
      if (!p) return;
      const offer = p.offers.find((x) => x.dir !== p.dir);
      where.replaceChildren(
        el('div', { class: 'sc-row' }, el('span', { text: `Where: ${st?.label || p.label}` }), el('span', { class: 'spacer' }),
          el('button', { type: 'button', class: 'ghost small', text: 'Change…', title: `Where this ${pcWord()} keeps its backups (each computer has its own)`, on: { click: (e) => placeMenu(e.currentTarget) } })),
        p.dir === p.def.dir && offer ? el('p', { class: 'hint ba-offer' }, `${offer.why} `, el('button', { type: 'button', class: 'linkish', text: `Use ${offer.label}`, on: { click: () => pickFolder(offer.id).then(() => paint()) } })) : null);
    };
    let looked = new Set();
    const paintList = async () => {
      let r; try { r = await A().list(); } catch (err) { list.replaceChildren(el('p', { class: 'hint', text: `Couldn't look: ${err.message}` })); return; }
      if (r.state) set(r.state);
      if (!r.items.length) { list.replaceChildren(el('p', { class: 'hint', text: 'No backups yet. Back up now, or wait: the first one runs by itself when the computer is idle.' })); return; }
      const kids = []; let day = '';
      for (const b of r.items) {
        const d = dayWord(b.at);
        if (d !== day) { day = d; kids.push(el('div', { class: 'ba-day', text: d })); }
        kids.push(rowOf(b));
      }
      list.replaceChildren(...kids);
      // older zips: what's inside, looked at once (a few at a time)
      for (const b of r.items.filter((x) => !x.counts && x.hearth && !looked.has(x.path)).slice(0, 6)) {
        looked.add(b.path);
        try { const c = await A().inspect(b.path); const row = list.querySelector(`.ba-row[data-name="${CSS.escape(b.name)}"]`); if (row && c?.counts) row.replaceWith(rowOf({ ...b, counts: c.counts, ok: c.ok ?? b.ok })); } catch { /* left as it is */ }
      }
    };
    const paint = () => { paintStatus(); paintWhere(); return paintList(); };
    paintDialog = paint;
    const off = on((s, was) => { paintStatus(); if (was?.running && !s.running) paintList(); });
    dlg.addEventListener('close', () => { off(); if (paintDialog === paint) paintDialog = null; dlg.remove(); });
    document.body.append(dlg);
    dlg.showModal();
    refresh().then(() => paint());
    return dlg;
  }

  // ---------- /backup ----------
  async function command(args = '') {
    const a = String(args || '').trim();
    const [verb, ...rest] = a.split(/\s+/);
    const v = (verb || 'now').toLowerCase();
    if (v === 'list' || v === 'backups') { dialog(); return null; }
    if (v === 'status' || v === 'last') {
      const s = await refresh();
      const r = await A().list().catch(() => ({ items: [] }));
      const top = r.items.slice(0, 5).map((b) => `- ${dayWord(b.at)} ${timeWord(b.at)} ${b.ok === false ? '⚠' : b.ok ? '✓' : '·'} ${b.counts ? BC.summary(b.counts, { short: true }) : ''}`);
      return [`💾 **${lineText(s).text}**`, s.last?.ok === false ? `Last try: ${s.last.why}` : '', `Kept in ${s.label} (this ${pcWord()}) · ${s.auto ? 'by itself once a day when idle' : 'automatic backups off'}`, ...top].filter(Boolean).join('\n');
    }
    if (v === 'check' || v === 'verify') {
      const r = await A().list();
      const b = r.items[0];
      if (!b) return 'No backup to check yet.';
      const res = await checkOne(b);
      return res.ok ? `✓ The newest backup is good: ${BC.summary(res.counts)}` : `⚠ The newest backup is damaged: ${(res.problems || []).join('; ')}`;
    }
    if (v === 'folder' || v === 'where') {
      const w = (rest[0] || '').toLowerCase();
      if (!w) { const s = await refresh(); return `Backups on this ${pcWord()}: ${s.label} (${s.dir})`; }
      const r = await pickFolder({ documents: 'documents', default: 'documents', icloud: 'icloud', onedrive: 'onedrive', pick: 'pick', choose: 'pick' }[w] || rest.join(' '));
      return r.ok ? `Backups now go to ${r.label}` : r.cancelled ? null : r.why;
    }
    if (v === 'auto') {
      const want = /^(off|no|0|false)$/i.test(rest[0] || '') ? false : /^(on|yes|1|true)$/i.test(rest[0] || '') ? true : !(st?.auto !== false);
      set(await A().setAuto(want));
      return want ? `💾 This ${pcWord()} backs up by itself again (once a day when idle)` : `Automatic backups are off on this ${pcWord()}`;
    }
    if (v === 'now' || !v) {
      const r = await backupNow();
      return r.ok ? `💾 Backup saved and checked: ${BC.summary(r.counts)} → \`${r.path}\`` : `The backup didn't finish: ${r.why}`;
    }
    return 'Try /backup now, /backup list, /backup status, /backup check, /backup folder [documents | icloud | onedrive | pick], /backup auto on|off';
  }
  const ARGS = ['now', 'list', 'status', 'check', 'folder documents', 'folder icloud', 'folder onedrive', 'folder pick', 'auto on', 'auto off', 'as'];

  // ---------- start ----------
  function start() {
    if (!A()) return;
    A().onChanged?.((s) => set(s));
    refresh();
    // the battery level, for "never on battery below 40 %" (the main process can't read it)
    try {
      navigator.getBattery?.().then((b) => {
        const tell = () => A().battery({ level: b.level, charging: b.charging }).catch(() => {});
        tell();
        b.addEventListener('levelchange', tell); b.addEventListener('chargingchange', tell);
      }).catch(() => {});
    } catch { /* no battery API */ }
    // the relative time in an open line stays true (one repaint a minute, only while a line is on screen)
    // (on powerwise's schedule: nothing while Hearth is hidden or the computer sleeps)
    window.Power?.every?.('backupauto-line', 60000, () => { if (!document.querySelector('.ba-line, .ba-dialog')) return; for (const fn of subs) { try { fn(st, st); } catch { /* closed */ } } }, { hidden: 'skip' });
  }
  start();

  return { state: () => st, refresh, line, lineText, dialog, backupNow, pickFolder, command, ARGS, on };
})();
window.BackupAuto = BackupAuto;
