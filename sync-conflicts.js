// Sync's conflicts and Deleted files (round 83, firstscreen83: moved out of sync.js, so the first screen doesn't parse
// them): the conflicts list (what it is, both sides by computer and time, the difference, plain choices) and the
// deleted files / previous versions, restorable for 30 days. sync.js keeps Sync.conflicts() / Sync.trash() and loads
// this file the first time one opens, or in an idle moment after the first screen (lazy group 'syncconflicts'). The
// code is the same as before; what it reads from sync.js comes through Sync._conflicts.
const SyncConflicts = (() => {
  const { MAC, api, nameOf, refresh, now, HERE_NAME, itemNames, whatIs } = Sync._conflicts;
  const PLAT = { darwin: 'Mac', win32: 'Windows', linux: 'Linux' };
  const hereLabel = () => `${HERE_NAME[0].toUpperCase()}${HERE_NAME.slice(1)}${MAC ? '' : /Win/.test(navigator.platform) ? ' (Windows)' : ''}`;
  const thereName = (c) => (!c.from || /^(another|your other) computer$/i.test(c.from) ? 'the other computer' : c.from);
  const thereLabel = (c) => { const n = thereName(c); return `${n[0].toUpperCase()}${n.slice(1)}${PLAT[c.fromPlatform] ? ` (${PLAT[c.fromPlatform]})` : ''}`; };
  function edited(t) {
    if (!t) return 'edited: time not known';
    const d = new Date(t);
    const today = d.toDateString() === new Date().toDateString();
    const clock = today ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `edited ${clock}, ${timeAgo(t)}`;
  }
  const clip = (s, n = 90) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const IMG = /\.(png|jpe?g|webp|gif|bmp|avif)$/i; const VID = /\.(mp4|webm|mov|m4v|mkv)$/i;
  const fileUrl = (p) => `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`;
  // the difference, in a few human lines (and pictures where there are some)
  function diffOf(c) {
    const box = el('div', { class: 'sync-diff' });
    const line = (text, cls = '') => box.append(el('div', { class: `sync-dl ${cls}`, text }));
    if (c.kind === 'file') {
      const pic = (p, label, size, at) => el('figure', { class: 'sync-pic' },
        IMG.test(c.rel) ? el('img', { src: fileUrl(p), alt: '', loading: 'lazy' }) : VID.test(c.rel) ? el('video', { src: `${fileUrl(p)}#t=0.1`, muted: true, preload: 'metadata' }) : el('span', { class: 'sync-pic-glyph', text: '📄' }),
        el('figcaption', { text: `${label}${size != null ? ` · ${fmtBytes(size)}` : ''}${at ? ` · ${timeAgo(at)}` : ''}` }));
      box.append(el('div', { class: 'sync-pics' }, pic(c.here, hereLabel(), c.size, c.oursAt), pic(c.there, thereLabel(c), c.theirsSize, c.theirsAt)));
      return box;
    }
    if (/^chats\//.test(c.rel) && c.ours && c.theirs) {
      const key = (m) => (m.id != null ? `id:${m.id}` : `${m.role}@${m.at}`);
      const mine = new Map((c.ours.messages || []).map((m) => [key(m), m]));
      const theirs = new Map((c.theirs.messages || []).map((m) => [key(m), m]));
      const onlyHere = [...mine.keys()].filter((k) => !theirs.has(k)).map((k) => mine.get(k));
      const onlyThere = [...theirs.keys()].filter((k) => !mine.has(k)).map((k) => theirs.get(k));
      if (c.ours.title !== c.theirs.title) line(`Title: “${c.ours.title}” here · “${c.theirs.title}” on ${thereName(c)}`);
      for (const [list, where] of [[onlyHere, `only on ${HERE_NAME}`], [onlyThere, `only on ${thereName(c)}`]]) {
        if (!list.length) continue;
        line(`${list.length} message${list.length === 1 ? '' : 's'} ${where}:`, 'sync-dh');
        for (const m of list.slice(-3)) line(`${m.role === 'user' ? 'You' : 'Reply'}: “${clip(m.text, 110)}”`, 'sync-dq');
      }
    }
    if (c.rel === 'kv/three-sketches.json') {
      const ids = new Set((c.fields || []).map((f) => String(f.path).split('.')[0]));
      for (const id of [...ids].slice(0, 2)) {
        const a = (Array.isArray(c.ours) ? c.ours : []).find((x) => String(x.id) === id); const b = (Array.isArray(c.theirs) ? c.theirs : []).find((x) => String(x.id) === id);
        if (!a && !b) continue;
        const thumb = (() => { try { return ThreeLab.scenes?.thumbOf?.(id); } catch { return null; } })();
        const layers = (s) => new Set((s?.layers || []).map((l) => l.name || l.id));
        const la = layers(a); const lb = layers(b);
        const diffL = [...new Set([...la, ...lb])].filter((n) => la.has(n) !== lb.has(n));
        const codeDiff = a?.code !== b?.code ? `the code differs (${(a?.code || '').split('\n').length} lines here, ${(b?.code || '').split('\n').length} there)` : '';
        box.append(el('div', { class: 'sync-pics' },
          el('figure', { class: 'sync-pic' }, thumb ? el('img', { src: thumb, alt: '' }) : el('span', { class: 'sync-pic-glyph', text: '◭' }), el('figcaption', { text: `${hereLabel()} · “${a?.name || '(gone)'}”` })),
          el('figure', { class: 'sync-pic' }, el('span', { class: 'sync-pic-glyph', text: '◭' }), el('figcaption', { text: `${thereLabel(c)} · “${b?.name || '(gone)'}” (its picture is on that computer)` }))));
        if (diffL.length) line(`Layers only on one side: ${diffL.slice(0, 6).join(', ')}`);
        if (codeDiff) line(`In “${a?.name || b?.name}”, ${codeDiff}`);
      }
    }
    // settings and other data: the changed options / fields with both values, ids turned into names
    if (!box.childElementCount || c.rel === 'app/config.json') {
      for (const f of (c.fields || []).slice(0, 5)) {
        const label = String(f.path).split('.').map((seg) => itemNames(c.ours, [{ path: seg }])[0] || seg).filter((s) => !/^(settings|value)$/.test(s)).join(' › ') || 'the whole thing';
        line(`${label}: ${clip(f.ours, 50)} here · ${clip(f.theirs, 50)} on ${thereName(c)}`);
      }
    }
    if (!box.childElementCount) line('Changed on both computers (not shown in detail).');
    return box;
  }
  async function conflicts() {
    const list = await api().conflicts();
    const full = (await Promise.all(list.slice(0, 30).map((c) => api().preview?.(c.id).catch(() => null)))).map((p, i) => p || list[i]);
    const dialog = el('dialog', { class: 'ui-modal sync-list sync-conflicts' });
    const rows = el('div', { class: 'sync-rows' });
    const picks = new Map(); // conflict id → 'mine' | 'theirs' | 'both' | 'merge'
    const summary = el('p', { class: 'sync-sum' });
    const apply = el('button', { type: 'button', class: 'primary', text: 'Apply', disabled: true });
    const paint = () => {
      const by = { theirs: 0, mine: 0, both: 0, merge: 0 }; const from = new Set();
      for (const [id, k] of picks) { by[k] += 1; if (k === 'theirs') from.add(thereName(full.find((c) => c.id === id) || {})); }
      const bits = [by.theirs && `${by.theirs} from ${[...from].join(' / ')}`, by.mine && `${by.mine} from ${HERE_NAME}`, by.both && `${by.both} kept both`, by.merge && `${by.merge} merged`].filter(Boolean);
      summary.textContent = picks.size ? `${bits.join(', ')}. Every choice can be undone: the version that loses waits in Deleted files for 30 days.` : 'Pick a version for each one, then Apply. Nothing changes until then.';
      apply.disabled = !picks.size; apply.textContent = picks.size > 1 ? `Apply ${picks.size} choices` : 'Apply';
    };
    const rowOf = (c) => {
      const newer = c.oursAt && c.theirsAt ? (c.oursAt > c.theirsAt ? 'here' : 'there') : null;
      const side = (label, t, isNewer) => el('div', { class: 'sync-side' }, el('b', { text: label }), el('span', { class: 'hint', text: `${edited(t)}${isNewer ? ' · newer' : ''}` }));
      const choice = (keep, text, title) => el('button', { type: 'button', class: 'ghost small sync-pick', text, title, dataset: { keep }, on: { click: (e) => {
        if (picks.get(c.id) === keep) picks.delete(c.id); else picks.set(c.id, keep);
        for (const b of e.currentTarget.parentElement.children) b.classList.toggle('on', picks.get(c.id) === b.dataset.keep);
        paint();
      } } });
      const there = thereName(c);
      return el('div', { class: 'sync-row sync-conflict', dataset: { id: c.id } },
        el('div', { class: 'sync-row-main' },
          el('b', { class: 'sync-what', text: whatIs(c) }),
          el('div', { class: 'sync-sides' }, side(hereLabel(), c.oursAt, newer === 'here'), side(thereLabel(c), c.theirsAt, newer === 'there')),
          diffOf(c),
          el('details', { class: 'sync-details' }, el('summary', { text: 'Details' }), el('div', { class: 'hint', text: `${c.rel} · noticed ${timeAgo(c.at)}${c.fields?.length ? ` · ${c.fields.length} field${c.fields.length === 1 ? '' : 's'} changed two ways` : ''}` }))),
        el('div', { class: 'sync-row-acts sync-choices' },
          choice('theirs', `Keep ${there}'s version`, `${there}'s version replaces the one on ${HERE_NAME} (${HERE_NAME}'s goes to Deleted files)`),
          choice('mine', `Keep ${HERE_NAME}'s version`, `${HERE_NAME}'s version stays everywhere (${there}'s goes to Deleted files)`),
          c.canBoth ? choice('both', 'Keep both', `${there}'s version is saved next to it as “… (from ${there})”`) : null,
          c.canMerge ? choice('merge', 'Merge', 'Everything from both; where they differ, the newer one wins (the current one goes to Deleted files first)') : null));
    };
    const draw = (l) => rows.replaceChildren(...(l.length ? l.map(rowOf) : [el('p', { class: 'modal-text', text: 'No conflicts. Changes made on both computers merged by themselves.' })]));
    apply.addEventListener('click', async () => {
      apply.disabled = true;
      const fails = [];
      for (const [id, keep] of picks) { const r = await api().resolve(id, keep).catch((err) => ({ ok: false, error: err.message })); if (!r?.ok) fails.push(r?.error || 'failed'); }
      const done = picks.size - fails.length;
      const said = summary.textContent.split('.')[0];
      picks.clear();
      const left = await api().conflicts();
      full.splice(0, full.length, ...(await Promise.all(left.slice(0, 30).map((c) => api().preview?.(c.id).catch(() => null)))).map((p, i) => p || left[i]));
      draw(full); paint(); setTitle(); bulk.hidden = !full.length; refresh();
      if (fails.length) toast(fails[0], { type: 'error' });
      if (done) toast(`Done: ${said}. Undo any of it from Deleted files.`, { timeout: 5000, action: { label: 'Deleted files', fn: () => trash() } });
    });
    // (round 26) all at once: settle them for me (data merged, files newest wins) / newest / this computer's; ↻ refresh
    const title = el('h2');
    const setTitle = () => { title.textContent = full.length ? `${full.length} thing${full.length === 1 ? ' was' : 's were'} changed on both computers` : 'Sync conflicts'; };
    const reload = async () => {
      const left = await api().conflicts();
      full.splice(0, full.length, ...(await Promise.all(left.slice(0, 30).map((c) => api().preview?.(c.id).catch(() => null)))).map((p, i) => p || left[i]));
      picks.clear(); draw(full); paint(); setTitle(); bulk.hidden = !full.length; refresh();
    };
    const all = async (mode, label) => {
      for (const b of bulk.querySelectorAll('button')) b.disabled = true;
      const r = await api().resolveAll(mode).catch((err) => ({ ok: false, error: err.message }));
      for (const b of bulk.querySelectorAll('button')) b.disabled = false;
      if (!r?.ok) { toast(r?.error || 'Could not settle them', { type: 'error' }); return; }
      await reload();
      toast(`${label}: ${r.done} settled${r.failed ? `, ${r.failed} left (pick those by hand)` : ''}. Undo any of it from Deleted files.`, { timeout: 6000, action: { label: 'Deleted files', fn: () => trash() } });
    };
    const autoBox = el('input', { type: 'checkbox' });
    api().autoResolve?.().then((on) => { autoBox.checked = on !== false; }).catch(() => {});
    autoBox.addEventListener('change', () => api().autoResolve?.(autoBox.checked));
    const bulk = el('div', { class: 'sync-bulk', hidden: !full.length },
      el('button', { type: 'button', class: 'primary', text: '✓ Settle all for me', title: 'Chats, scenes and settings: merged (everything from both, the newer one wins where they differ). Pictures and files: the newer one wins. The other versions wait in Deleted files for 30 days.', on: { click: () => all('auto', 'Settled') } }),
      el('button', { type: 'button', class: 'ghost small', text: 'Newest wins, all', title: 'For every conflict, keep the version edited last', on: { click: () => all('newest', 'Newest kept') } }),
      el('button', { type: 'button', class: 'ghost small', text: `${HERE_NAME}'s, all`, title: `For every conflict, keep the version on ${HERE_NAME}`, on: { click: () => all('mine', `${HERE_NAME}'s kept`) } }));
    const refreshBtn = el('button', { type: 'button', class: 'ghost small', text: '↻ Refresh', title: 'Sync now and list the conflicts again', on: { click: async () => { refreshBtn.disabled = true; try { await api().now?.({}); } catch { /* listed anyway */ } await reload(); refreshBtn.disabled = false; } } });
    draw(full); paint(); setTitle();
    dialog.append(el('form', { method: 'dialog' }, el('div', { class: 'sync-conf-head' }, title, refreshBtn),
      list.length ? el('p', { class: 'hint', text: `Both versions are kept until one wins, on ${HERE_NAME} and on ${[...new Set(full.map(thereName))].join(', ')}.` }) : null,
      bulk, rows, list.length ? summary : null,
      el('label', { class: 'hint sync-auto' }, autoBox, ' Settle new conflicts by themselves (data merged, files newest wins; undo from Deleted files)'),
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'button', text: list.length ? 'Later' : 'Done', on: { click: () => dialog.close() } }), list.length ? apply : null)));
    dialog.addEventListener('close', () => setTimeout(() => dialog.remove(), 0));
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  }

  // (round 92, syncpanel92) "2026-10-29" → "yesterday" / "on 29 Oct"
  function dayWord(day) {
    const d = new Date(`${day}T12:00:00`); if (Number.isNaN(d.getTime())) return day || '';
    const n = Math.round((new Date().setHours(12, 0, 0, 0) - d.getTime()) / 864e5);
    return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `on ${d.toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
  }
  // deleted files (from any computer): restorable for 30 days
  async function trash() {
    const list = await api().trash();
    const dialog = el('dialog', { class: 'ui-modal sync-list' });
    const q = el('input', { type: 'search', placeholder: 'Filter…', class: 'sync-filter' });
    const rows = el('div', { class: 'sync-rows' });
    const draw = () => {
      const f = q.value.trim().toLowerCase();
      const l = list.filter((t) => !f || t.rel.toLowerCase().includes(f) || nameOf(t.rel).toLowerCase().includes(f)).slice(0, 200);
      rows.replaceChildren(...(l.length ? l.map((t) => el('div', { class: 'sync-row' },
        // (round 92, syncpanel92) the name and when in words; the path only on hover (it was the first thing on each row)
        el('div', { class: 'sync-row-main', title: t.rel }, el('b', { text: nameOf(t.rel) }), el('span', { class: 'hint', text: t.recovery ? 'the version before the last change from your other computer' : `deleted ${dayWord(t.day)}${t.where === 'here' ? ' (removed here because your other computer deleted it)' : ''}` })),
        el('div', { class: 'sync-row-acts' }, el('button', { type: 'button', class: 'ghost small', text: 'Restore', on: { click: async (e) => {
          let r = await api().restore(t.id);
          // (round 19) undoing a conflict choice: the version in place goes to the trash, this one comes back
          if (!r.ok && r.exists && await Modal.confirm('Put this version back?', `${nameOf(t.rel)} is there now. Put this version back? The one in place goes to Deleted files (it can come back too).`, { ok: 'Put it back' })) r = await api().restore(t.id, { replace: true });
          if (!r.ok) { if (!r.exists) toast(window.calmError ? calmError(r.error, { where: 'sync' }) : r.error, { type: 'error', raw: r.error }); return; } // (round 92) plain words, the raw reason under Details
          e.target.disabled = true; e.target.textContent = 'Restored';
          toast(`Restored ${nameOf(r.rel)}`, { timeout: 2500 });
        } } }))))
        : [el('p', { class: 'modal-text', text: 'Nothing deleted lately.' })]));
    };
    q.addEventListener('input', draw);
    draw();
    dialog.append(el('form', { method: 'dialog' }, el('h2', { text: 'Deleted files & previous versions' }),
      el('p', { class: 'hint', text: 'Kept for 30 days. Restore brings one back here, and sync takes it to your other computer.' }), list.length > 10 ? q : null, rows, // (round 92)
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'primary', text: 'Done', on: { click: () => dialog.close() } }))));
    dialog.addEventListener('close', () => setTimeout(() => dialog.remove(), 0));
    document.body.append(dialog);
    dialog.showModal();
    return dialog;
  }

  return { conflicts, trash, diffOf };
})();
