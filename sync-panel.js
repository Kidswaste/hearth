// (round 72, sync72) The sync panel: what the sync indicator at the bottom of the rail opens with one click. Plain words
// only: where things stand ("✓ Synced 2 min ago"), what is waiting and why, the last problem, conflicts side by side
// with Keep PC / Keep Mac / Keep both, and Sync now. Loaded on that first click (lazy group syncpanel); nothing here
// runs on a timer: it redraws when the engine sends a status (its own cadence) and only if something it shows changed.
const SyncPanel = (() => {
  let box = null; let anchor = null; let off = null; let sig = ''; let busy = false;
  let mode = 'main'; let kindsOpen = false; let freeList = null; let freeDone = null; // (round 73, syncmedia73) What syncs · Free up space
  const api = () => window.hub?.sync;
  const MAC = /Mac/.test(navigator.platform); const WIN = /Win/.test(navigator.platform);
  const PLAT = { darwin: 'Mac', win32: 'PC', linux: 'Linux' };
  const HERE = MAC ? 'Mac' : WIN ? 'PC' : 'this computer';
  const ago = (t) => (t ? timeAgo(t) : 'not yet');
  const clip = (s, n = 90) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  // the other computer, as the buttons say it: "PC" / "Mac" (its name when both are the same kind)
  function there(c) {
    const p = PLAT[c.fromPlatform];
    if (p && p !== HERE) return p;
    const n = String(c.from || '').replace(/\.local$/i, '');
    return n && !/computer$/i.test(n) ? clip(n, 18) : 'the other computer';
  }

  // ---------- what is waiting, in plain words ----------
  const WHY = {
    'cloud-only': 'only in the cloud for now',
    arriving: (st) => `on its way${st.peers?.[0]?.name ? ` from ${st.peers[0].name}` : ''}`,
    writing: 'being saved here; it goes up in a moment',
    deleting: 'deleted on the other computer; that is still arriving',
    'copy-check': 'your cloud drive made a copy of it; checking it isn\'t a new file',
    retry: 'changed while it was being copied; next round',
    unreadable: 'can\'t be read (damaged or in use); skipped for now',
    unlisted: 'its folder couldn\'t be read just now',
    'cloud-error': 'the cloud folder didn\'t answer for it',
    error: 'couldn\'t be copied; Hearth tries again by itself',
    queued: 'a big file: it goes on its own, after the one moving now (chats don\'t wait for it)', // (round 73)
    moving: 'moving now',
    pieces: (st) => `a very long chat: its newest part is still coming${st.peers?.[0]?.name ? ` from ${st.peers[0].name}` : ''}; it stays as it is here until all of it has arrived`, // (round 89, packs89)
  };
  const whyText = (w, st) => { const v = WHY[w]; return typeof v === 'function' ? v(st) : v || 'waiting'; };
  WHY['disk-full'] = 'the disk is full: it waits for room'; // (round 74)

  // ---------- (round 74, synchard74) files that can't sync, in plain words, each with its fix ----------
  // the engine sends a code (sync-hard.js); here: what it means for the owner and the one button that fixes it
  const OTHER = WIN ? 'Mac' : 'PC';
  const BLOCKED = {
    'win-chars': (b) => ({ text: `Its name has ${b.part ? `“${[...new Set([...b.part].filter((c) => /[<>:"|?*\\]/.test(c)))].join(' ') || 'a character'}”` : 'a character'} in it, which Windows can't use, so it stays on this ${HERE} until renamed.`, fix: 'Rename for Windows' }),
    'win-ending': () => ({ text: 'Its name ends with a dot or a space, which Windows drops, so it stays here until renamed.', fix: 'Rename for Windows' }),
    'win-reserved': (b) => ({ text: `“${clip(b.part, 30)}” is a name Windows keeps for itself (like CON or NUL), so it stays here until renamed.`, fix: 'Rename for Windows' }),
    'win-long': () => ({ text: 'Its folders and name are too long for Windows (over 260 characters), so it stays here until shortened.', fix: 'Shorten for Windows' }),
    'win-there': () => ({ text: `Made on your ${OTHER} with a name Windows can't use. On the ${OTHER}, open this panel and click “Rename for Windows”.` }),
    locked: (b) => ({ text: b.where === 'cloud' ? 'Your cloud drive is busy with it right now. Hearth tries again by itself.' : 'Another program is using it right now (the Sound desk, a player, your cloud drive or an antivirus). Close it there, or Hearth tries again by itself.', fix: 'Try again now' }),
    'read-only': (b) => ({ text: `It is marked read-only ${b.where === 'cloud' ? 'in the cloud folder' : `on this ${HERE}`}, so sync can't update it.`, fix: 'Allow changes' }),
    'disk-full': (b) => ({ text: b.where === 'cloud' ? 'The disk with your cloud folder is full. Nothing was damaged; it goes once there is room.' : `This ${HERE}'s disk is full. Nothing was damaged; it copies once there is room.`, fix: 'Free up space…' }),
    'too-long': () => ({ text: 'Its path is too long for this computer.', fix: 'Shorten it' }),
    'bad-name': () => ({ text: 'This computer can\'t use its name.', fix: 'Rename it' }),
    drive: () => ({ text: 'The drive didn\'t answer for it (disconnected or asleep). Hearth tries again by itself.', fix: 'Try again now' }),
    denied: (b) => ({ text: `macOS didn't let Hearth change it${b.where === 'cloud' ? ' in the cloud folder' : ''}. In System Settings › Privacy & Security › Files and Folders (or Full Disk Access), allow Hearth, then try again.`, fix: 'Try again now' }),
    'newer-app': () => ({ text: `It was last saved by a newer Hearth on your ${OTHER}. Update Hearth here (⬆ Update) to sync it; nothing is lost meanwhile.` }),
    'secret-cloud': () => ({ text: 'A key or password file an older version put in your cloud copy. Keys never sync now.', fix: 'Remove from the cloud' }),
  };
  const FIX = { 'win-chars': 'rename', 'win-ending': 'rename', 'win-reserved': 'rename', 'win-long': 'rename', 'too-long': 'rename', 'bad-name': 'rename', 'read-only': 'writable', 'secret-cloud': 'unsecret', locked: 'retry', drive: 'retry', denied: 'retry', 'disk-full': 'space' };
  function blockedSec(st) {
    const list = st.blocked || [];
    if (!list.length && !(st.peersOld || []).length) return null;
    const rows = list.slice(0, 8).map((b) => {
      const w = (BLOCKED[b.why] || (() => ({ text: 'It can\'t sync right now.' })))(b);
      const how = FIX[b.why];
      const btn = w.fix && how ? el('button', { type: 'button', class: 'ghost small sp-fix', text: w.fix, dataset: { rel: b.rel, how }, title: how === 'rename' ? 'Renames it on this computer; links to it in your chats and scenes follow' : '', on: { click: (e) => fixOne(b, how, w.fix, e.currentTarget) } }) : null;
      return el('li', { class: 'sp-blk', dataset: { why: b.why } }, el('div', { class: 'sp-tr-top' }, el('span', { class: 'sp-name', text: Sync.nameOf(b.rel), title: b.rel }), btn), el('span', { class: 'hint', text: w.text }));
    });
    const old = (st.peersOld || []).map((x) => el('p', { class: 'hint sp-old', text: `Hearth on ${x.name || 'the other computer'} is an older version: update it there too (⬆ Update), so it handles these cases as well.` }));
    return el('div', { class: 'sp-sec sp-blocked' }, list.length ? el('b', { text: `Can't sync (${list.length})` }) : null,
      list.length ? el('span', { class: 'hint', text: 'Each stays as it is on this computer: nothing is lost.' }) : null,
      list.length ? el('ul', { class: 'sp-wait' }, ...rows) : null, list.length > 8 ? el('span', { class: 'hint', text: `…and ${list.length - 8} more` }) : null, ...old);
  }
  async function fixOne(b, how, label, button) {
    if (busy) return;
    if (how === 'space') { openFree(); return; }
    busy = true; if (button) button.disabled = true;
    try {
      if (how === 'retry') { await Sync.now({ quiet: true }); return; }
      const r = await api().fix(b.rel, how);
      if (!r?.ok) { toast(r?.error || 'That didn\'t work', { type: 'error' }); return; }
      toast(how === 'rename' ? `Renamed to “${Sync.nameOf(r.to)}”${r.links ? `; ${r.links} link${r.links === 1 ? '' : 's'} to it updated` : ''}. It syncs now.` : how === 'writable' ? 'Changes allowed. It syncs now.' : 'Removed from the cloud copy (kept in Deleted files on this computer).', { timeout: 5000 });
      await Sync.now({ quiet: true });
    } finally { busy = false; sig = ''; render(); }
  }

  // ---------- a conflict, one side ----------
  const IMG = /\.(png|jpe?g|webp|gif|bmp|avif)$/i; const VID = /\.(mp4|webm|mov|m4v|mkv)$/i;
  const fileUrl = (p) => `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`;
  function edited(t) {
    if (!t) return 'time not known';
    const d = new Date(t);
    const clock = d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    return `edited ${clock} (${timeAgo(t)})`;
  }
  // the value at a conflict's path ("s1.layers.l1.code": ids inside lists)
  function at(value, p) {
    let cur = value;
    for (const seg of String(p || '').split('.')) {
      if (cur == null) return undefined;
      if (Array.isArray(cur)) cur = cur.find((x) => x && typeof x === 'object' && (String(x.id) === seg || `${x.role ?? ''}@${x.at}` === seg));
      else if (typeof cur === 'object') cur = cur[seg];
      else return undefined;
    }
    return cur;
  }
  function side(c, which) {
    const mine = which === 'ours'; const v = mine ? c.ours : c.theirs; const o = mine ? c.theirs : c.ours;
    const box = el('div', { class: 'sp-body' });
    const line = (text, cls = '') => box.append(el('div', { class: `sp-l ${cls}`, text }));
    if (c.kind === 'file') {
      const p = mine ? c.here : c.there; const size = mine ? c.size : c.theirsSize;
      box.append(IMG.test(c.rel) ? el('img', { src: fileUrl(p), alt: '', loading: 'lazy' }) : VID.test(c.rel) ? el('video', { src: `${fileUrl(p)}#t=0.1`, muted: true, preload: 'metadata' }) : el('span', { class: 'sp-glyph', text: '📄' }));
      if (size != null) line(fmtBytes(size), 'hint');
      return box;
    }
    if (v == null) { line('(not on this side)', 'hint'); return box; }
    if (/^chats\//.test(c.rel)) {
      if (v.title !== o?.title) line(`Title: “${clip(v.title, 60)}”`);
      const key = (m) => (m.id != null ? `id:${m.id}` : `${m.role}@${m.at}`);
      const others = new Set((o?.messages || []).map(key));
      const only = (v.messages || []).filter((m) => !others.has(key(m)));
      if (only.length) { line(`${only.length} message${only.length === 1 ? '' : 's'} only here:`, 'sp-h'); for (const m of only.slice(-2)) line(`${m.role === 'user' ? 'You' : 'Reply'}: “${clip(m.text, 80)}”`, 'sp-q'); }
      if (!box.childElementCount) line(`${(v.messages || []).length} messages`, 'hint');
      return box;
    }
    for (const f of (c.fields || []).slice(0, 3)) {
      const val = at(v, f.path); const other = at(o, f.path);
      const label = String(f.path).split('.').filter((s) => !/^(settings|value|list|layers)$/.test(s)).map((seg) => { const it = Array.isArray(v) ? v.find((x) => String(x?.id) === seg) : null; return it?.name || it?.title || seg; }).slice(-2).join(' › ');
      if (typeof val === 'string' && typeof other === 'string' && (val.includes('\n') || other.includes('\n'))) {
        // code / long text: the lines only this side has
        const theirs = new Set(other.split('\n'));
        const lines = val.split('\n').filter((x) => x.trim() && !theirs.has(x)).slice(0, 3);
        line(`${label}:`, 'sp-h');
        for (const x of lines.length ? lines : ['(lines removed here)']) line(clip(x, 70), 'sp-code');
      } else line(`${label}: ${clip(typeof val === 'string' ? val : JSON.stringify(val ?? '(removed)'), 60)}`);
    }
    if (!box.childElementCount) line('Changed here too.', 'hint');
    return box;
  }
  function card(c) {
    const t = there(c);
    // Windows PC on the left, the Mac on the right, on both computers (the same place each time)
    const hereFirst = !(MAC && t === 'PC');
    const col = (which) => {
      const mine = which === 'ours';
      return el('div', { class: `sp-side ${mine ? 'here' : 'there'}` },
        el('b', { text: mine ? `This ${HERE}` : t[0].toUpperCase() + t.slice(1) }),
        el('span', { class: 'hint', text: edited(mine ? c.oursAt : c.theirsAt) }),
        side(c, which));
    };
    const keep = (label, how, title) => el('button', { type: 'button', class: `ghost small sp-keep${how === 'both' ? ' both' : ''}`, text: label, title, dataset: { keep: how }, on: { click: () => choose(c, how, label) } });
    const kHere = keep(`Keep ${HERE}`, 'mine', `The version on this ${HERE} stays everywhere; the ${t} version waits in Deleted files`);
    const kThere = keep(`Keep ${t}`, 'theirs', `The ${t} version replaces this one; this one waits in Deleted files`);
    return el('div', { class: 'sp-conflict', dataset: { id: c.id } },
      el('div', { class: 'sp-what', text: Sync.whatIs(c) }),
      el('div', { class: 'sp-sides' }, ...(hereFirst ? [col('ours'), col('theirs')] : [col('theirs'), col('ours')])),
      el('div', { class: 'sp-acts' }, ...(hereFirst ? [kHere, kThere] : [kThere, kHere]),
        c.canBoth ? keep('Keep both', 'both', /^chats\//.test(c.rel) || c.kind === 'file' ? `Both stay: the ${t} version is added next to it as “… (from ${t})”` : `Both stay: what differs is kept twice (a scene or a board as “… (from ${t})”, text as both texts)`) : null));
  }
  async function choose(c, how, label) {
    if (busy) return; busy = true;
    for (const b of box?.querySelectorAll(`.sp-conflict[data-id="${c.id}"] button`) || []) b.disabled = true;
    const r = await api().resolve(c.id, how).catch((err) => ({ ok: false, error: err.message }));
    busy = false;
    if (!r?.ok) { toast(window.calmError ? calmError(r?.error || 'failed', { where: 'sync' }) : r?.error, { type: 'error', raw: r?.error }); sig = ''; render(); return; }
    toast(how === 'both' ? `Kept both versions of ${Sync.whatIs(c)}.` : `${label}: done. The other version waits in Deleted files.`, { timeout: 5000, action: { label: 'Deleted files', fn: () => Sync.trash() } });
    await Sync.refresh();
    sig = ''; render();
  }

  // ---------- (round 73, syncmedia73) big files on their way, with progress ----------
  // Built when the list changes; the bars and numbers are updated in place on each status (at most 2 a second, from
  // the engine): a transform on one bar per file, a text only if it changed. Nothing redraws the panel for a percentage.
  const pct = (t) => (t.total ? Math.min(1, t.done / t.total) : 0);
  const amount = (t) => (t.op === 'check' ? (t.moving ? 'checking…' : 'to check') : !t.moving ? 'queued' : `${fmtBytes(t.done || 0)} of ${fmtBytes(t.total || 0)} · ${Math.round(pct(t) * 100)}%`);
  function transfersSec(st) {
    const list = st.transfers || [];
    if (!list.length) return null;
    // the same files as on screen: that section stays (a redraw for something else doesn't rebuild the bars)
    const key = JSON.stringify([list.slice(0, 5).map((t) => `${t.rel}:${t.op}:${t.moving}`), st.moving || list.length]);
    const old = box?.querySelector('.sp-moving');
    if (old && old.dataset.key === key) { paintBars(st); return old; }
    const rows = list.slice(0, 5).map((t) => el('li', { class: `sp-tr${t.moving ? ' on' : ''}`, dataset: { rel: t.rel } },
      el('div', { class: 'sp-tr-top' }, el('span', { class: 'sp-name', text: `${t.op === 'down' ? '↓' : t.op === 'up' ? '↑' : '…'} ${Sync.nameOf(t.rel)}` }), el('span', { class: 'hint sp-tr-n', text: amount(t) })),
      t.moving && t.op !== 'check' ? el('div', { class: 'sp-bar', attrs: { role: 'progressbar', 'aria-label': `${Sync.nameOf(t.rel)} progress`, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct(t) * 100)) } }, el('i', { style: { transform: `scaleX(${pct(t)})` } })) : null));
    const more = (st.moving || list.length) - rows.length;
    return el('div', { class: 'sp-sec sp-moving', dataset: { key } }, el('b', { text: `Big files on their way (${st.moving || list.length})` }),
      el('span', { class: 'hint', text: 'One at a time, beside everything else: chats and settings don\'t wait for them. A copy cut short goes on where it stopped.' }),
      el('ul', { class: 'sp-wait' }, ...rows), more > 0 ? el('span', { class: 'hint', text: `…and ${more} more` }) : null);
  }
  function paintBars(st) {
    for (const t of st.transfers || []) {
      const li = box?.querySelector(`.sp-tr[data-rel="${CSS.escape(t.rel)}"]`);
      if (!li) continue;
      const n = li.querySelector('.sp-tr-n'); const txt = amount(t);
      if (n && n.textContent !== txt) n.textContent = txt;
      const bar = li.querySelector('.sp-bar'); const i = bar?.firstChild; const tf = `scaleX(${pct(t)})`;
      if (i && i.style.transform !== tf) { i.style.transform = tf; bar.setAttribute('aria-valuenow', String(Math.round(pct(t) * 100))); }
    }
  }

  // ---------- (round 73, syncmedia73) What syncs ----------
  const sizeLine = (k) => {
    const here = k.n ? `${fmtBytes(k.bytes)} here` : 'nothing here';
    const there = k.cloudN ? `${fmtBytes(k.cloudBytes)} in the cloud` : '';
    return [k.on ? '' : 'off here: left where it is', here, there, k.perComputer ? k.note : ''].filter(Boolean).join(' · ');
  };
  function kindsSec(st) {
    const kinds = st.kinds || [];
    if (!st.on || !kinds.length) return null;
    const off = kinds.filter((k) => !k.on && !k.perComputer);
    const summary = off.length ? `everything but ${off.map((k) => k.label).join(', ')}` : 'everything';
    const fold = el('button', { type: 'button', class: 'ghost small sp-fold', text: `What syncs: ${summary} ${kindsOpen ? '▾' : '›'}`, attrs: { 'aria-expanded': String(kindsOpen) }, on: { click: () => { kindsOpen = !kindsOpen; sig = ''; render(); } } });
    if (!kindsOpen) return el('div', { class: 'sp-sec sp-kinds' }, fold);
    const rows = kinds.map((k) => {
      const input = el('input', { type: 'checkbox', checked: k.on, attrs: { 'aria-label': `Sync ${k.label}` } });
      input.addEventListener('change', () => setKind(k, input.checked, input));
      return el('label', { class: `sp-kind${k.on ? '' : ' off'}`, title: k.note || '', dataset: { kind: k.id } }, input, el('span', { class: 'sp-kind-main' }, el('b', { text: k.label }), el('span', { class: 'hint', text: sizeLine(k) })));
    });
    return el('div', { class: 'sp-sec sp-kinds' }, fold,
      el('span', { class: 'hint', text: 'Turning one off never deletes anything: its files stay where they are, here and in the cloud. Sync just leaves them alone on this computer.' }),
      el('div', { class: 'sp-kind-list' }, ...rows),
      el('div', { class: 'sp-row' }, el('button', { type: 'button', class: 'ghost small sp-free-open', text: 'Free up space on this computer…', title: 'Big files already safe in the cloud: make your cloud drive\'s copy online-only (Hearth keeps its own)', on: { click: () => openFree() } })));
  }
  async function setKind(k, on, input) {
    if (input) input.disabled = true;
    try {
      await api().kinds(k.id, on);
      toast(on ? `${k.label} sync again on this computer. Nothing is deleted: what's only on one side is copied to the other.` : `${k.label} stop syncing on this computer. Nothing is deleted: the files stay here and in the cloud, as they are.`, { timeout: 6000 });
      await Sync.refresh();
    } catch (err) { toast(window.calmError ? calmError(err, { where: 'sync' }) : String(err?.message || err), { type: 'error' }); }
    sig = ''; render();
  }

  // ---------- (round 73, syncmedia73) Free up space on this computer ----------
  // the list first (big synced files whose cloud drive copy also takes room here), then one click; never anything not
  // synced (the engine checks each file again right before), and a plain "can't" when the cloud drive can't do it
  async function openFree() {
    mode = 'free'; freeList = null; freeDone = null; sig = ''; render();
    freeList = await api().freeable().catch((err) => ({ items: [], bytes: 0, can: false, why: String(err?.message || err) }));
    sig = ''; render();
  }
  const FAIL = { 'not-synced': 'changed since, or not synced yet: left as it is', refused: 'your cloud drive said no', unsupported: 'your cloud drive can\'t do it' };
  function freeView() {
    const back = el('button', { type: 'button', class: 'ghost small', text: '‹ Back', on: { click: () => { mode = 'main'; sig = ''; render(); } } });
    const head = el('div', { class: 'sp-head' }, el('div', { class: 'sp-title' }, el('h2', { text: 'Free up space on this computer' }),
      el('span', { class: 'hint', text: `Big files already safe in ${Sync.where()}` })), el('button', { type: 'button', class: 'ghost small sp-x', text: '×', title: 'Close', attrs: { 'aria-label': 'Close the sync panel' }, on: { click: close } }));
    const parts = [head];
    if (!freeList) parts.push(el('p', { class: 'hint', text: 'Looking for big files that are safely in the cloud…' }));
    else if (freeDone) {
      const r = freeDone;
      parts.push(el('div', { class: 'sp-sec sp-freed' },
        el('b', { text: r.done?.length ? `Freed ${fmtBytes(r.bytes)}: ${r.done.length} file${r.done.length === 1 ? ' is' : 's are'} online-only in ${Sync.where()} now.` : 'Nothing was freed.' }),
        r.later ? el('span', { class: 'hint', text: `${r.later} of them: your cloud drive finishes it in a moment.` }) : null,
        r.done?.length ? el('span', { class: 'hint', text: 'Hearth still has its own copy of each and works from it. They stay in the cloud and on your other computer.' }) : null,
        r.unsupported || r.error ? el('p', { text: r.error || 'Your cloud drive can\'t make files online-only from Hearth.' }) : null,
        ...(r.failed || []).slice(0, 6).map((f) => el('span', { class: 'hint', text: `${Sync.nameOf(f.rel)}: ${FAIL[f.why] || 'not freed'}${f.error && f.why === 'refused' ? ` (${String(f.error).slice(0, 80)})` : ''}` }))));
    } else if (!freeList.can) {
      parts.push(el('div', { class: 'sp-sec sp-warn' }, el('b', { text: 'Not possible with this cloud drive' }), el('p', { text: freeList.why || 'Your cloud drive can\'t make files online-only from Hearth.' }),
        freeList.items?.length ? el('span', { class: 'hint', text: `(${freeList.items.length} big file${freeList.items.length === 1 ? '' : 's'}, ${fmtBytes(freeList.bytes)}, would qualify. Nothing was changed.)` }) : null));
    } else if (!freeList.items.length) {
      parts.push(el('p', { text: 'Nothing to free: no big synced file has a second copy taking room in the cloud drive\'s folder on this computer.' }), el('span', { class: 'hint', text: 'Files still moving, or changed and not synced yet, are never listed.' }));
    } else {
      const n = freeList.items.length;
      parts.push(el('p', { text: `${n} big file${n === 1 ? ' is' : 's are'} safely in the cloud. Hearth works from its own copy; ${Sync.where()} keeps a second one in its folder. Making that one online-only frees ${fmtBytes(freeList.bytes)} here.` }),
        el('span', { class: 'hint', text: 'They stay in the cloud and on your other computer. Nothing that isn\'t synced is touched.' }),
        el('ul', { class: 'sp-wait sp-free-list' }, ...freeList.items.slice(0, 40).map((x) => el('li', { class: 'sp-free-row' }, el('span', { class: 'sp-name', text: Sync.nameOf(x.rel) }), el('span', { class: 'hint', text: `${fmtBytes(x.size)} · ${x.rel}` })))),
        n > 40 ? el('span', { class: 'hint', text: `…and ${n - 40} more` }) : null);
      const go = el('button', { type: 'button', class: 'primary sp-free-go', text: `Make them online-only (${fmtBytes(freeList.bytes)})`, on: { click: async () => {
        go.disabled = true; go.textContent = 'Asking your cloud drive…';
        freeDone = await api().free(freeList.items.map((x) => x.rel)).catch((err) => ({ ok: false, error: String(err?.message || err), done: [], failed: [] }));
        sig = ''; render();
      } } });
      parts.push(el('div', { class: 'sp-foot' }, go, back));
      return parts;
    }
    parts.push(el('div', { class: 'sp-foot' }, back));
    return parts;
  }

  // ---------- the panel ----------
  let seq = 0;
  async function render() {
    if (!box) return;
    const my = ++seq; // a newer redraw started while this one waited: this one stops
    const st = Sync.status();
    let list = [];
    if (st.conflicts) {
      const raw = (await api().conflicts().catch(() => [])) || [];
      list = (await Promise.all(raw.slice(0, 12).map((c) => api().preview?.(c.id).catch(() => null)))).map((p, i) => p || raw[i]);
    }
    const auto = Sync.lastAuto();
    const s = JSON.stringify([st.on, st.state, st.paused, st.pending, st.conflicts, st.lastOk, st.at, st.waiting, st.lastError, st.error, (st.blocked || []).map((b) => `${b.rel}:${b.why}:${b.where}`), (st.peersOld || []).length, // (round 74) + what can't sync st.held?.deletes, st.cloudOnly?.length, list.map((c) => c.id), auto, Math.floor(Date.now() / 60000),
      mode, kindsOpen, freeList, freeDone, (st.aside || []).map((n) => n.id), [...asideOpen.keys()], /* (round 78) + kept aside */ (st.transfers || []).map((t) => `${t.rel}:${t.op}:${t.moving}`), st.moving, kindsOpen ? (st.kinds || []).map((k) => `${k.id}:${k.on}:${k.n}:${Math.round(k.bytes / 1e5)}:${Math.round(k.cloudBytes / 1e5)}`) : (st.kinds || []).map((k) => k.on)]); // (round 73) + moving files, What syncs, Free up space
    if (my !== seq || !box) return;
    if (s === sig) { paintBars(st); return; } // nothing it shows changed: the DOM stays as it is (only the bars move)
    sig = s;
    if (mode === 'free') { const keep = box.scrollTop; box.replaceChildren(...freeView(st).filter(Boolean)); box.scrollTop = keep; place(); return; } // (round 73)
    const head = el('div', { class: 'sp-head' },
      el('span', { class: `sp-glyph-big s-${st.paused ? 'paused' : st.state}`, text: Sync.glyph(), attrs: { 'aria-hidden': 'true' } }),
      el('div', { class: 'sp-title' }, el('h2', { text: Sync.shortLine() }),
        el('span', { class: 'hint', text: [st.on ? `with ${Sync.where()}` : '', st.at ? `checked ${ago(st.at)}` : '', Sync.peersLine()].filter(Boolean).join(' · ') })),
      el('button', { type: 'button', class: 'ghost small sp-x', text: '×', title: 'Close', attrs: { 'aria-label': 'Close the sync panel' }, on: { click: close } }));
    const parts = [head];
    // the deletions guard
    if (st.held) parts.push(el('div', { class: 'sp-sec sp-warn' }, el('p', { text: `${st.held.deletes} files were deleted at once. Sync waits for your yes before deleting them everywhere.` }),
      el('div', { class: 'sp-row' }, el('button', { type: 'button', class: 'ghost small', text: 'Review them by name…', on: { click: () => { close(); Sync.held(); } } }))));
    // the last problem, in plain words
    const err = st.lastError || (st.state === 'error' && st.error ? { message: st.error, at: st.at } : null);
    if (err) {
      const what = err.rel ? Sync.nameOf(err.rel) : 'the sync folder';
      const words = window.calmError ? calmError(err.message, { where: 'sync', what }) : err.message;
      parts.push(el('div', { class: 'sp-sec sp-warn' }, el('b', { text: `Last problem (${ago(err.at)})` }),
        el('p', { text: `${err.rel ? `${what}: ` : ''}${words}${/again/i.test(words) ? '' : ' Hearth tries again by itself.'}` }),
        typeof ErrorCalm !== 'undefined' && ErrorCalm.details ? ErrorCalm.details(`${err.op ? `${err.op} ` : ''}${err.rel ? `${err.rel}: ` : ''}${err.message}`) : null)); // the word-for-word reason, with Copy
    }
    parts.push(blockedSec(st)); // (round 74, synchard74) what can't sync, why, and its fix
    // conflicts, side by side
    if (list.length) {
      parts.push(el('div', { class: 'sp-sec' }, el('b', { text: `${list.length} thing${list.length === 1 ? ' was' : 's were'} changed on both computers — choose` }),
        el('span', { class: 'hint', text: 'Whatever you don\'t keep waits in Deleted files for 30 days.' }),
        ...list.map(card),
        list.length > 1 ? el('div', { class: 'sp-row' }, el('button', { type: 'button', class: 'ghost small', text: 'Settle all for me', title: 'Chats, scenes and settings: merged (the newer one wins where they differ); pictures and files: the newer one', on: { click: settleAll } })) : null));
    } else if (st.conflicts) parts.push(el('p', { class: 'hint', text: `${st.conflicts} conflict${st.conflicts === 1 ? '' : 's'}…` }));
    parts.push(asideSec(st)); // (round 78, guardloss78) versions kept aside when sync picked a side by itself
    // what is waiting, and why
    // (round 73) the big files on their way have their own section (with bars): not listed twice
    const lane = new Set((st.transfers || []).map((t) => t.rel));
    const waiting = (st.waiting || []).filter((x) => !(lane.has(x.rel) && (x.why === 'moving' || x.why === 'queued')));
    const pendingRest = Math.max(0, (st.pending || 0) - (st.moving || 0));
    if (waiting.length || pendingRest) {
      const cloudOnly = waiting.filter((x) => x.why === 'cloud-only').length;
      parts.push(el('div', { class: 'sp-sec' }, el('b', { text: `Waiting (${Math.max(pendingRest, waiting.length)})` }),
        el('ul', { class: 'sp-wait' }, ...waiting.slice(0, 6).map((x) => el('li', {}, el('span', { class: 'sp-name', text: Sync.nameOf(x.rel) }), el('span', { class: 'hint', text: whyText(x.why, st) })))),
        waiting.length > 6 || pendingRest > waiting.length ? el('span', { class: 'hint', text: `…and ${Math.max(pendingRest, waiting.length) - Math.min(6, waiting.length)} more` }) : null,
        cloudOnly ? el('div', { class: 'sp-row' }, el('button', { type: 'button', class: 'ghost small', text: `Download ${cloudOnly === 1 ? 'it' : `those ${cloudOnly}`} now`, title: 'Big files your cloud drive keeps online only are never downloaded unless you ask', on: { click: async (e) => { e.currentTarget.disabled = true; await Sync.download(); sig = ''; render(); } } })) : null));
    }
    parts.push(transfersSec(st), kindsSec(st)); // (round 73, syncmedia73)
    if (auto && Date.now() - auto.at < 864e5) parts.push(el('p', { class: 'hint sp-auto', text: `Settled ${auto.done} conflict${auto.done === 1 ? '' : 's'} by itself ${ago(auto.at)} (merged; the other versions are in Deleted files).` }));
    if (st.skippedBig?.length) parts.push(el('p', { class: 'hint', text: `${st.skippedBig.length} big video${st.skippedBig.length === 1 ? '' : 's'} kept on this computer (Sync big videos is off).` }));
    // the actions
    const now = el('button', { type: 'button', class: 'primary sp-now', text: 'Sync now', on: { click: async () => { now.disabled = true; now.textContent = 'Syncing…'; try { await Sync.now({ quiet: true }); } finally { now.disabled = false; now.textContent = 'Sync now'; sig = ''; render(); } } } });
    parts.push(el('div', { class: 'sp-foot' }, st.on ? now : el('button', { type: 'button', class: 'primary', text: 'Turn on sync…', on: { click: () => { close(); Sync.setup(); } } }),
      el('button', { type: 'button', class: 'ghost small', text: 'Deleted files…', on: { click: () => { close(); Sync.trash(); } } }),
      el('button', { type: 'button', class: 'ghost small', text: 'Earlier versions…', title: 'Earlier versions of synced things: chats, projects, Lab scenes, boards, settings; and Deleted things', on: { click: () => { close(); window.Lazy.load('versions').then(() => Versions.home()); } } }), // (round 75, versions75)
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'ghost small', text: '⋯', title: 'More: pause, open the cloud folder, big videos, other drive, turn off', attrs: { 'aria-label': 'More sync options' }, on: { click: (e) => showMenuAt(e.currentTarget, Sync.items()) } })));
    const keepScroll = box.scrollTop;
    box.replaceChildren(...parts.filter(Boolean));
    box.scrollTop = keepScroll;
    place();
  }
  // ---------- (round 78, guardloss78) kept aside ----------
  // Where both computers changed the same thing and sync picked one version by itself (a save right after the other
  // computer's version arrived, or a conflict settled by itself), the other version is in Deleted files. One plain line
  // each: "Mac's version of Notes kept aside — compare", then Compare (both, side by side), Keep both, Use that one, OK.
  const asideOpen = new Map(); // note id → its compare (both versions), once opened
  const whoseOf = (n) => (n.side === 'ours' ? `This ${HERE}'s` : `${(() => { const t = there(n); return t[0].toUpperCase() + t.slice(1); })()}'s`);
  function asideSec(st) {
    const list = st.aside || [];
    if (!list.length) return null;
    const row = (n) => {
      const what = Sync.whatIs({ rel: n.rel, fields: n.fields, kind: n.kind });
      const act = (label, how, title) => el('button', { type: 'button', class: `ghost small sp-aside-${how}`, text: label, title, on: { click: () => asideDo(n, how) } });
      const cmp = asideOpen.get(n.id);
      return el('div', { class: 'sp-aside', dataset: { id: n.id } },
        el('div', { class: 'sp-what', text: `${whoseOf(n)} version of ${what.replace(/^The /, 'the ')} kept aside — compare` }),
        el('span', { class: 'hint', text: `${n.why === 'guard' ? 'Changed here and there at once' : 'Settled by itself'} ${ago(n.at)}; it waits in Deleted files.` }),
        cmp ? el('div', { class: 'sp-sides' },
          el('div', { class: 'sp-side here' }, el('b', { text: 'In use now' }), side({ ...cmp, kind: n.kind === 'file' ? 'file' : 'json', ours: cmp.now, theirs: cmp.kept, here: cmp.here, there: cmp.there }, 'ours')),
          el('div', { class: 'sp-side there' }, el('b', { text: 'Kept aside' }), side({ ...cmp, kind: n.kind === 'file' ? 'file' : 'json', ours: cmp.now, theirs: cmp.kept, here: cmp.here, there: cmp.there }, 'theirs'))) : null,
        el('div', { class: 'sp-acts' },
          cmp ? null : act('Compare', 'compare', 'Both versions side by side'),
          n.rel === 'app/config.json' ? null : act('Keep both', 'both', 'Both stay: what differs is kept twice (a scene or a board as “… (from …)”, text as both texts)'),
          act('Use that one', 'theirs', 'The version kept aside comes back; the one in use now waits in Deleted files'),
          act('OK', 'dismiss', 'Keep things as they are (the other version stays in Deleted files for 30 days)')));
    };
    return el('div', { class: 'sp-sec sp-aside-sec' }, el('b', { text: `Kept aside (${list.length})` }),
      el('span', { class: 'hint', text: 'Both computers changed the same thing and sync kept one version. The other one is safe in Deleted files.' }),
      ...list.slice(0, 5).map(row));
  }
  async function asideDo(n, how) {
    if (busy) return; busy = true;
    try {
      const r = await api().aside?.(n.id, how).catch((err) => ({ ok: false, error: err.message }));
      if (!r?.ok) { toast(window.calmError ? calmError(r?.error || 'failed', { where: 'sync' }) : r?.error, { type: 'error', raw: r?.error }); return; }
      if (how === 'compare') { asideOpen.set(n.id, r); return; }
      asideOpen.delete(n.id);
      if (how === 'both') toast(`Kept both versions of ${Sync.whatIs({ rel: n.rel })}.`, { timeout: 4000 });
      else if (how === 'theirs') toast(`${whoseOf(n)} version is back. The other one waits in Deleted files.`, { timeout: 5000, action: { label: 'Deleted files', fn: () => Sync.trash() } });
      await Sync.refresh();
    } finally { busy = false; sig = ''; render(); }
  }
  async function settleAll() {
    const r = await api().resolveAll('auto').catch((err) => ({ ok: false, error: err.message }));
    if (!r?.ok) { toast(r?.error || 'Could not settle them', { type: 'error' }); return; }
    toast(`Settled ${r.done}${r.failed ? `, ${r.failed} left for you` : ''}. Undo from Deleted files.`, { timeout: 5000, action: { label: 'Deleted files', fn: () => Sync.trash() } });
    await Sync.refresh(); sig = ''; render();
  }
  // next to the indicator: to its right, its bottom edge level with it (the indicator sits low in the rail)
  function place() {
    if (!box || !anchor?.isConnected) return;
    const r = anchor.getBoundingClientRect();
    const h = box.offsetHeight;
    const top = Math.max(8, Math.min(innerHeight - h - 8, r.bottom - h));
    const left = Math.min(innerWidth - box.offsetWidth - 8, r.right + 8);
    box.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }
  function open(at, o = {}) {
    if (box) { close(); }
    mode = o.mode === 'free' ? 'free' : 'main'; kindsOpen = o.mode === 'kinds'; freeList = null; freeDone = null; // (round 73)
    anchor = at || document.getElementById('sync-dot');
    box = el('div', { class: 'sync-panel', attrs: { role: 'dialog', 'aria-label': 'Sync', tabindex: '-1' } }); // (el() sets attributes through attrs)
    document.body.append(box);
    anchor?.classList.add('on');
    const away = (e) => { if (box && !box.contains(e.target) && !anchor?.contains(e.target) && !e.target.closest?.('#menu')) close(); };
    const esc = (e) => { if (e.key === 'Escape' && box) { e.stopPropagation(); close(); anchor?.focus?.(); } };
    const stop = Sync.listen(() => render());
    setTimeout(() => document.addEventListener('pointerdown', away, true), 0);
    document.addEventListener('keydown', esc, true);
    addEventListener('resize', place);
    off = () => { stop(); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc, true); removeEventListener('resize', place); };
    sig = '';
    if (mode === 'free') { openFree(); return Promise.resolve(box); } // (round 73) straight to Free up space (the ⋯ menu)
    return render().then(() => { box?.querySelector('.sp-now, .sp-keep, button')?.focus({ preventScroll: true }); return box; });
  }
  function close() {
    off?.(); off = null;
    anchor?.classList.remove('on');
    box?.remove(); box = null; sig = ''; mode = 'main'; freeList = null; freeDone = null;
  }
  const toggle = (at) => (box ? (close(), null) : open(at));
  return { open, close, toggle, isOpen: () => Boolean(box), render: () => { sig = ''; return render(); } };
})();
