// (round 94, keptaside94) The one place to compare two versions sync kept and choose between them, for every kind of
// thing: a conflict waiting for a choice, or a version sync kept aside by itself (both computers changed the same thing
// at once). Opened from the sync panel (Compare…), the Conflicts list, and the note that appears when it happens.
// Both versions side by side in plain form, by kind:
//   chat        the messages that differ (a very long chat: worked out on the store thread, keptasidemain.js)
//   scene/note  each text that differs as a line-by-line diff, the changed lines highlighted (code: a scene's layers)
//   settings    "This PC says X, the Mac says Y", option by option
//   picture / sound / video   both, to look at or play
//   project / board / preset / other data   what differs, in words ("Name: “Neon (PC)” · “Neon (Mac)”")
// Then: Keep this one (under each side) · Keep both (where it makes sense) · Combine… (a text both changed: an editor
// that starts with both versions' lines, saved only when he says so) · Decide later. After a choice: the version not
// kept is in Deleted files (30 days), a note says so, and Undo puts back what was there before (what replaced it goes
// to Deleted files too). The choice itself is sync's own (resolve / aside, sync-engine.js); this file adds the copies
// that make every side visible in Deleted files first (keptasidemain.js). Lazy group 'keptaside'; pure parts in
// keptaside-core.js.
const KeptAside = (() => {
  const K = KeptAsideCore;
  const api = () => Sync._conflicts.api(); // (checks swap it through Sync._setApi)
  const MAC = /Mac/.test(navigator.platform); const WIN = /Win/.test(navigator.platform);
  const HERE = MAC ? 'Mac' : WIN ? 'PC' : 'computer';
  const PLAT = { darwin: 'Mac', win32: 'PC', linux: 'Linux' };
  const cap = (s) => `${s[0].toUpperCase()}${s.slice(1)}`;
  function there(x) {
    const p = PLAT[x?.fromPlatform];
    if (p && p !== HERE) return `the ${p}`;
    const n = String(x?.from || '').replace(/\.local$/i, '');
    return n && !/computer$/i.test(n) ? n : 'your other computer';
  }
  const thereShort = (x) => there(x).replace(/^the /, '');
  const fileUrl = (p) => `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`;
  function edited(t) {
    if (!t) return '';
    const d = new Date(t);
    const clock = d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `changed ${clock} (${timeAgo(t)})`;
  }
  const errText = (e) => (window.calmError ? calmError(e, { where: 'sync' }) : String(e?.message || e));

  // ---------- the two versions ----------
  // → { src, id, rel, kind, file: bool, a, b, from, fromPlatform, canBoth, canCombine, what } (a: this computer's /
  // the one in use; b: the other computer's / the one kept aside), or { gone: true }
  async function load(src) {
    if (src.conflict) {
      const p = await api().preview?.(src.conflict);
      if (!p) return { gone: true };
      // a conflict is listed on both computers (its record syncs): the version in place is the one of the computer that
      // noticed it (by), the copy the other's (from). On the computer the copy came from, "this computer's" is the copy.
      const w = mineOf(p);
      const who = (mine, x) => (mine ? `this ${HERE}` : there(x));
      const label = (mine, x) => (mine ? `This ${HERE}` : cap(there(x).replace(/^the /, '')));
      const byX = { from: p.by, fromPlatform: p.byPlatform }; const fromX = { from: p.from, fromPlatform: p.fromPlatform };
      const m = { src: 'conflict', id: p.id, rel: p.rel, kind: K.kindOf(p.rel), file: p.kind === 'file', from: w.b ? p.by : p.from, fromPlatform: w.b ? p.byPlatform : p.fromPlatform, canBoth: p.canBoth !== false && p.rel !== 'app/config.json',
        a: { who: who(w.a, byX), label: label(w.a, byX), value: p.ours, path: p.here, at: p.oursAt, size: p.size, mine: w.a },
        b: { who: who(w.b, fromX), label: label(w.b, fromX), value: p.theirs, path: p.there, at: p.theirsAt, size: p.theirsSize, mine: w.b }, copyFrom: thereShort(fromX), fields: p.fields || [] };
      return finish(m);
    }
    const r = await api().aside?.(src.aside, 'compare');
    if (!r?.ok) return { gone: true, error: r?.error };
    const theirs = r.side !== 'ours'; const t = there(r);
    const m = { src: 'aside', id: r.id, rel: r.rel, kind: K.kindOf(r.rel), file: r.kind === 'file', from: r.from, fromPlatform: r.fromPlatform, why: r.why, trash: r.trash, canBoth: r.rel !== 'app/config.json', fields: r.fields || [],
      a: { who: theirs ? `this ${HERE}` : t, label: 'In use now', value: r.now, path: r.here, at: null },
      b: { who: theirs ? t : `this ${HERE}`, label: 'Kept aside', value: r.kept, path: r.there, at: r.at } };
    return finish(m);
  }
  // which side of a conflict is this computer's: { a: the version in place, b: the copy }
  // (round 95, aside95) exactly by the noticing computer's id when the record has it (Sync.whose); older records by name
  function mineOf(p) {
    const w = Sync.whose(p);
    return { a: w.a, b: w.b };
  }
  function finish(m) {
    const json = !m.file && /\.json$/i.test(m.rel);
    m.big = json && (m.a.value == null || m.b.value == null); // (over 6 MB: not sent whole)
    m.canCombine = json && !m.big && K.canCombine(m.rel, m.a.value, m.b.value);
    m.what = Sync.whatIs({ rel: m.rel, ours: m.a.value ?? undefined, theirs: m.b.value ?? undefined, fields: m.fields || [] });
    if (m.kind === 'preset') { // "Tool data “lab-presets”" → the Lab preset(s) by name
      const names = [...new Set((m.fields || []).map((f) => { const id = /^items\.([^.]+)/.exec(f.path)?.[1]; return id && (m.a.value?.items?.[id]?.name || m.b.value?.items?.[id]?.name); }).filter(Boolean))];
      m.what = names.length ? `The Lab preset${names.length > 1 ? 's' : ''} ${names.map((n) => `“${n}”`).join(', ')}` : 'Lab presets and trigger setups';
    }
    return m;
  }

  // ---------- by kind: what differs, in plain form ----------
  const col = (cls, ...kids) => el('div', { class: `ka-c ${cls}` }, ...kids);
  const pair = (a, b, cls = '') => el('div', { class: `ka-pair ${cls}` }, col('ka-a', a), col('ka-b', b));
  const msg = (x) => el('div', { class: 'ka-msg' }, el('b', { text: x.role === 'user' ? 'You' : x.role === 'assistant' ? 'Reply' : cap(x.role || 'note') }), x.at ? el('span', { class: 'hint', text: ` · ${new Date(x.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` }) : null, el('div', { class: 'ka-msg-t', text: x.text }));
  function chatView(d) {
    const box = el('div', { class: 'ka-chat' });
    if (d.title) box.append(el('h4', { text: 'Title' }), pair(el('span', { text: `“${d.title.here}”` }), el('span', { text: `“${d.title.there}”` }), 'ka-chg'));
    if (d.onlyHere.length || d.onlyThere.length) {
      box.append(el('h4', { text: 'Messages only one side has' }),
        pair(el('div', {}, el('span', { class: 'hint', text: d.onlyHere.length ? `${d.onlyHere.length + d.more.onlyHere} only here${d.more.onlyHere ? ` (the last ${d.onlyHere.length} shown)` : ''}` : 'none' }), ...d.onlyHere.map(msg)),
          el('div', {}, el('span', { class: 'hint', text: d.onlyThere.length ? `${d.onlyThere.length + d.more.onlyThere} only there${d.more.onlyThere ? ` (the last ${d.onlyThere.length} shown)` : ''}` : 'none' }), ...d.onlyThere.map(msg)), 'ka-msgs'));
    }
    if (d.changed.length) {
      box.append(el('h4', { text: `Messages changed on both (${d.changed.length + d.more.changed})` }));
      for (const c of d.changed) box.append(pair(msg({ role: c.role, at: c.at, text: c.here }), msg({ role: c.role, at: c.at, text: c.there }), 'ka-chg'));
    }
    box.append(el('p', { class: 'hint', text: `${d.nHere} message${d.nHere === 1 ? '' : 's'} on one side, ${d.nThere} on the other; ${d.same} the same in both.` }));
    return box;
  }
  // a text both changed, side by side, line by line; the lines that differ highlighted
  function textDiff(here, there) {
    const d = K.lineDiff(here, there);
    const t = el('div', { class: 'ka-diff', attrs: { role: 'table', 'aria-label': 'The two versions, line by line' } });
    const cell = (n, text, cls) => [el('span', { class: 'ka-n', text: n == null ? '' : String(n) }), el('span', { class: `ka-l ${cls}`, text: text == null ? '' : text || ' ' })];
    for (const r of d.rows) {
      if (r.t === 'fold') { t.append(el('div', { class: 'ka-fold', text: `… ${r.n} line${r.n === 1 ? '' : 's'} the same in both` })); continue; }
      const ca = r.t === 'same' ? '' : r.a == null ? 'ka-none' : 'ka-del';
      const cb = r.t === 'same' ? '' : r.b == null ? 'ka-none' : 'ka-add';
      t.append(el('div', { class: `ka-row ka-${r.t}`, attrs: { role: 'row' } }, ...cell(r.na, r.a, ca), ...cell(r.nb, r.b, cb)));
    }
    return { box: t, d };
  }
  const settingWord = (label) => cap(String(label).replace(/^settings › /, ''));
  function dataView(m) {
    const box = el('div', { class: 'ka-data' });
    // (settings: each computer's own parts — window layout, program paths — never sync: not a difference)
    const rows = K.rows(m.a.value, m.b.value, { root: m.what }).filter((r) => !(m.kind === 'settings' && r.how !== 'changed'));
    if (!rows.length) { box.append(el('p', { class: 'hint', text: 'The two versions hold the same things (only times or order differ).' })); return box; }
    for (const r of rows) {
      if (r.text) {
        const { box: diff, d } = textDiff(r.here, r.there);
        box.append(el('h4', { text: `${cap(r.label)}: ${d.onlyHere} line${d.onlyHere === 1 ? '' : 's'} differ here, ${d.onlyThere} there` }), diff);
        continue;
      }
      if (m.kind === 'settings') { box.append(el('p', { class: 'ka-say', text: `${settingWord(r.label)}: ${m.a.who} says ${r.here}, ${m.b.who} says ${r.there}.` })); continue; }
      const what = r.how === 'onlyHere' ? `${cap(r.label)}: only ${m.src === 'aside' ? 'in the one in use' : `on ${m.a.who}`}` : r.how === 'onlyThere' ? `${cap(r.label)}: only ${m.src === 'aside' ? 'in the one kept aside' : `on ${m.b.who}`}` : cap(r.label);
      box.append(el('h4', { text: what }), pair(el('span', { text: r.here }), el('span', { text: r.there }), r.how === 'changed' ? 'ka-chg' : ''));
    }
    return box;
  }
  function fileSide(s, kind) {
    if (!s.path) return el('span', { class: 'hint', text: '(not on this side)' });
    const url = fileUrl(s.path);
    const media = kind === 'image' ? el('img', { src: url, alt: '' }) : kind === 'audio' ? el('audio', { src: url, controls: true, preload: 'metadata' }) : kind === 'video' ? el('video', { src: `${url}#t=0.1`, controls: true, muted: true, preload: 'metadata' }) : el('span', { class: 'ka-glyph', text: '📄' });
    return el('figure', { class: 'ka-fig' }, media, el('figcaption', { class: 'hint', text: [s.size != null ? fmtBytes(s.size) : '', s.at ? timeAgo(s.at) : ''].filter(Boolean).join(' · ') }));
  }
  async function body(m) {
    if (m.file) return pair(fileSide(m.a, m.kind), fileSide(m.b, m.kind), 'ka-files');
    if (m.kind === 'chat' && m.a.value && m.b.value) return chatView(K.chatDiff(m.a.value, m.b.value));
    if (m.kind === 'chat') {
      const r = await api().chatDiff?.({ src: m.src, id: m.id }).catch((err) => ({ ok: false, error: err.message }));
      if (r?.ok) return chatView(r);
      return el('p', { class: 'hint', text: `This chat is very long, and the two versions can't be compared here right now (${r?.error || 'not available'}). Both are safe: whichever you don't keep waits in Deleted files.` });
    }
    if (m.big) return el('p', { class: 'hint', text: 'Too big to show side by side here. Both versions are safe: whichever you don\'t keep waits in Deleted files.' });
    return dataView(m);
  }

  // ---------- the view ----------
  let open1 = null; // the dialog on screen (one at a time)
  async function open(src) {
    if (open1?.isConnected) open1.close();
    const m = await load(src).catch((err) => ({ gone: true, error: err.message }));
    if (m.gone) { toast(m.error && !/settled/i.test(m.error) ? errText(m.error) : 'That one is already settled.', { timeout: 3500 }); Sync.refresh(); return null; }
    const dialog = el('dialog', { class: 'ui-modal ka-view', dataset: { kind: m.kind, src: m.src } });
    open1 = dialog;
    // this computer on the left, the Mac on the right on both computers when it's a PC / Mac pair (as the sync panel)
    const isMac = (x) => (x.mine ? MAC : /\bMac\b/.test(x.label)); const isPC = (x) => (x.mine ? WIN : /\bPC\b/.test(x.label));
    const swap = m.src === 'conflict' && isMac(m.a) && isPC(m.b);
    const head = (s, which) => el('div', { class: `ka-h ka-${which}` },
      el('b', { text: s.label }), el('span', { class: 'hint', text: [m.src === 'aside' ? `${cap(s.who)}'s` : '', edited(s.at)].filter(Boolean).join(' · ') }),
      el('button', { type: 'button', class: `primary small ka-keep ka-keep-${which}`, text: 'Keep this one', title: which === 'a' ? (m.src === 'aside' ? 'Things stay as they are; the other version stays in Deleted files' : `${cap(m.a.who)}'s version stays everywhere; the other waits in Deleted files`) : (m.src === 'aside' ? 'The version kept aside comes back; the one in use now waits in Deleted files' : `${cap(m.b.who)}'s version replaces this one; this one waits in Deleted files`), on: { click: () => go(which) } }));
    const heads = el('div', { class: `ka-heads${swap ? ' ka-swap' : ''}` }, head(m.a, 'a'), head(m.b, 'b'));
    const main = el('div', { class: `ka-main${swap ? ' ka-swap' : ''}` }, el('p', { class: 'hint', text: 'Looking at both versions…' }));
    const combine = el('div', { class: 'ka-combine', hidden: true });
    const say = m.src === 'aside'
      ? `Both computers changed it at the same time, so sync kept one (${m.a.who}'s) and put ${m.b.who}'s aside. Nothing is lost: choose which to keep.`
      : 'Both computers changed it before they could sync. Nothing changes until you choose; the one you don\'t keep waits in Deleted files for 30 days.';
    const bothBtn = m.canBoth ? el('button', { type: 'button', class: 'ghost ka-both', text: 'Keep both', title: m.kind === 'chat' ? `Both stay: ${m.b.who}'s is added as its own chat “… (from ${m.copyFrom || thereShort(m)})”` : m.file ? `Both stay: ${m.b.who}'s is saved next to it as “… (from ${m.copyFrom || thereShort(m)})”` : m.kind === 'project' ? 'One project with both names, and everything from both' : 'Both stay: what differs is kept twice (a scene or a board as “… (from …)”, text as both texts)', on: { click: () => go('both') } }) : null;
    const combBtn = m.canCombine ? el('button', { type: 'button', class: 'ghost ka-comb', text: 'Combine…', title: 'Both versions\' lines in one text you can edit, then save', on: { click: () => startCombine() } }) : null;
    const later = el('button', { type: 'button', text: 'Decide later', on: { click: () => dialog.close() } });
    const acts = el('div', { class: 'dialog-actions' }, bothBtn, combBtn, el('span', { class: 'spacer' }), later);
    dialog.append(el('form', { method: 'dialog' }, el('h2', { text: `${m.what}: ${m.src === 'aside' ? 'two versions' : 'changed on both computers'}` }), el('p', { class: 'hint ka-say-top', text: say }), heads, main, combine, acts));
    dialog.addEventListener('close', () => setTimeout(() => { dialog.remove(); if (open1 === dialog) open1 = null; }, 0));
    document.body.append(dialog);
    dialog.showModal();
    body(m).then((b) => { if (dialog.isConnected) main.replaceChildren(b); }).catch((err) => main.replaceChildren(el('p', { class: 'hint', text: errText(err) })));
    let busy = false;
    async function go(how) {
      if (busy) return; busy = true;
      for (const b of dialog.querySelectorAll('button')) b.disabled = true;
      try { if (await choose(m, how)) dialog.close(); } finally { busy = false; for (const b of dialog.querySelectorAll('button')) b.disabled = false; }
    }
    // Combine: one editor per text both changed, starting with both versions' lines (this side's first)
    function startCombine() {
      const texts = K.textRows(m.a.value, m.b.value, { root: m.what });
      const eds = texts.map((r) => {
        const area = el('textarea', { class: 'ka-ed', spellcheck: false, value: K.combineText(r.here, r.there), attrs: { 'aria-label': `Combined ${r.label}` } });
        area.rows = Math.min(24, Math.max(6, area.value.split('\n').length + 1));
        const reset = (label, v) => el('button', { type: 'button', class: 'ghost small', text: label, on: { click: () => { area.value = v; area.focus(); } } });
        return { r, area, box: el('div', { class: 'ka-ed-box' }, el('h4', { text: cap(r.label) }), area,
          el('div', { class: 'ka-row-btns' }, reset('Start again from both', K.combineText(r.here, r.there)), reset(`Only ${m.a.who}'s`, r.here), reset(`Only ${m.b.who}'s`, r.there))) };
      });
      const save = el('button', { type: 'button', class: 'primary ka-save', text: 'Save the combined version', on: { click: async () => {
        if (busy) return; busy = true; save.disabled = true;
        try { if (await choose(m, 'combine', eds.map((e) => ({ path: e.r.path, text: e.area.value })))) dialog.close(); } finally { busy = false; save.disabled = false; }
      } } });
      combine.replaceChildren(el('p', { class: 'hint', text: 'Both versions\' lines are in, where they differ this side\'s first. Remove what you don\'t want, then save. Nothing changes until you save; both versions wait in Deleted files.' }),
        ...eds.map((e) => e.box), el('div', { class: 'ka-row-btns' }, save, el('button', { type: 'button', class: 'ghost', text: 'Cancel', on: { click: () => { combine.hidden = true; main.hidden = false; } } })));
      combine.hidden = false; main.hidden = true;
      eds[0]?.area.focus();
    }
    setTimeout(() => dialog.querySelector('.ka-keep-a')?.focus({ preventScroll: true }), 0);
    return dialog;
  }

  // ---------- a choice: made, saved, said, and undoable ----------
  // how: 'a' (this computer's / the one in use) · 'b' (the other / the one kept aside) · 'both' · 'combine' (edits)
  // → true when done
  async function choose(m, how, edits = null) {
    const before = await api().trash().catch(() => null);
    if (!before) { toast('Deleted files can\'t be read right now, so nothing was changed. Try again in a moment.', { type: 'error' }); return false; } // (the Undo needs it; never a choice without it)
    let r; let keptTheirs = null; let keptMine = null;
    try {
      if (how === 'combine') {
        // the other version into Deleted files (conflict: Keep this one does that; kept aside: it's there already),
        // this one too, then the combined text saved through the window's own stores
        r = m.src === 'conflict' ? await api().resolve(m.id, 'mine') : await api().aside(m.id, 'dismiss');
        if (r?.ok) { const k = await api().keepCopy(m.rel); if (!k?.ok) throw Error(k?.error || 'couldn\'t keep a copy'); keptMine = k.id; await writeCombined(m.rel, edits); }
      } else if (m.src === 'conflict') {
        if (how === 'both' && !m.file && m.kind !== 'chat') { const k = await api().keepTheirs?.(m.id); if (k && !k.ok) throw Error(k.error); keptTheirs = k?.id || null; } // (where both changed one value one side wins: the other whole in Deleted files)
        r = await api().resolve(m.id, how === 'a' ? 'mine' : how === 'b' ? 'theirs' : 'both');
      } else r = await api().aside(m.id, how === 'a' ? 'dismiss' : how === 'b' ? 'theirs' : 'both');
    } catch (err) { r = { ok: false, error: err.message }; }
    if (!r?.ok) { toast(errText(r?.error || 'failed'), { type: 'error', raw: r?.error }); Sync.refresh(); refreshPanel(); return false; }
    const after = await api().trash().catch(() => []);
    const fresh = K.newEntries(before, after, m.rel).filter((t) => t.id !== keptTheirs);
    const whatL = m.what.replace(/^The /, 'the ');
    let text; let undo = null; let undoLabel = 'Undo';
    if (how === 'a') {
      const other = m.src === 'aside' ? m.trash : fresh.find((t) => t.where === 'cloud')?.id || fresh[0]?.id;
      text = `Kept ${m.a.who}'s version of ${whatL}. ${cap(m.b.who)}'s waits in Deleted files for 30 days.`;
      if (other) { undoLabel = `Use ${m.b.who}'s instead`; undo = () => putBack(other, m); } // (nothing changed here: the way back is the other one)
    } else if (how === 'both' && (m.kind === 'chat' || m.file) && r.made && r.made !== m.rel) {
      text = m.kind === 'chat' ? `Kept both: ${m.b.who}'s is its own chat now, “… (from ${m.copyFrom || thereShort(m)})”.` : `Kept both: ${m.b.who}'s is next to it, “${String(r.made).split('/').pop()}”.`;
      undo = () => (m.kind === 'chat' ? takeBackChat(r.made) : takeBackFile(r.made));
    } else {
      const prev = keptMine || fresh.find((t) => t.where === 'here')?.id;
      text = how === 'combine' ? `Saved the combined version of ${whatL}. Both earlier versions wait in Deleted files.` : how === 'both' ? `Kept both versions of ${whatL}.` : `Using ${m.b.who}'s version of ${whatL}. ${cap(m.a.who)}'s waits in Deleted files for 30 days.`;
      if (prev) undo = () => putBack(prev, m);
    }
    toast(text, { timeout: 9000, action: undo ? { label: undoLabel, fn: undo } : { label: 'Deleted files', fn: () => Sync.trash() } });
    await Sync.refresh(); refreshPanel();
    return true;
  }
  // the version in Deleted files back in place (what is there now goes to Deleted files first: nothing is lost)
  async function putBack(id, m) {
    const r = await api().restore(id, { replace: true }).catch((err) => ({ ok: false, error: err.message }));
    if (!r?.ok) { toast(errText(r?.error || 'failed'), { type: 'error', raw: r?.error }); return; }
    toast(`Back as it was: ${m.what.replace(/^The /, 'the ')}. The other version is in Deleted files.`, { timeout: 6000, action: { label: 'Deleted files', fn: () => Sync.trash() } });
    await Sync.refresh(); refreshPanel();
  }
  // a chat "Keep both" made: into the chats' Trash (Recently deleted), as any chat deleted
  async function takeBackChat(rel) {
    const id = /^chats\/(.+)\.json$/.exec(rel)?.[1];
    if (!id) return;
    try { await window.hub.deleteChat(id); H.chats = await window.hub.listChats(); Panel.render?.(); toast('That copy is in the Trash now (Recently deleted).', { timeout: 4000 }); } catch (err) { toast(errText(err), { type: 'error' }); }
  }
  async function takeBackFile(rel) {
    const r = await api().putAway(rel).catch((err) => ({ ok: false, error: err.message }));
    if (!r?.ok) { toast(errText(r?.error || 'failed'), { type: 'error' }); return; }
    toast('That copy is in Deleted files now.', { timeout: 4000, action: { label: 'Deleted files', fn: () => Sync.trash() } });
    await Sync.refresh(); refreshPanel();
  }
  // the combined text saved where it lives: whatever holds the store in this window writes its own change first and
  // reads again after (StoreAck), so nothing typed meanwhile is lost and the screen shows the combined version
  async function writeCombined(rel, edits) {
    const name = /^kv\/([\w-]+)\.json$/.exec(rel)?.[1];
    if (!name) throw Error('This can\'t be combined here');
    await window.StoreAck?.arrived([{ rel }]);
    const cur = await window.hub.kvGet(name, null, { status: true });
    if (cur?.state !== 'ok' || cur.value == null) throw Error('It can\'t be read right now, so nothing was changed'); // (never "empty")
    let v = cur.value;
    for (const e of edits || []) { const n = K.setAt(v, e.path, e.text); if (!n) throw Error('It changed meanwhile: open it again'); v = n; }
    const w = await window.hub.kvSet(name, v);
    if (w?.error) throw Error(w.error);
    await window.StoreAck?.arrived([{ rel }]);
  }
  const refreshPanel = () => { try { if (window.SyncPanel?.isOpen()) SyncPanel.render(); } catch { /* closed */ } };

  return { mineOf, open, choose: async (src, how) => { const m = await load(src); if (m.gone) { toast('That one is already settled.', { timeout: 3000 }); Sync.refresh(); return false; } return choose(m, how); }, load, _isOpen: () => Boolean(open1?.isConnected) };
})();
