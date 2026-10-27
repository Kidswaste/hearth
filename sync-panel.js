// (round 72, sync72) The sync panel: what the sync indicator at the bottom of the rail opens with one click. Plain words
// only: where things stand ("✓ Synced 2 min ago"), what is waiting and why, the last problem, conflicts side by side
// with Keep PC / Keep Mac / Keep both, and Sync now. Loaded on that first click (lazy group syncpanel); nothing here
// runs on a timer: it redraws when the engine sends a status (its own cadence) and only if something it shows changed.
const SyncPanel = (() => {
  let box = null; let anchor = null; let off = null; let sig = ''; let busy = false;
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
  };
  const whyText = (w, st) => { const v = WHY[w]; return typeof v === 'function' ? v(st) : v || 'waiting'; };

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
    const s = JSON.stringify([st.on, st.state, st.paused, st.pending, st.conflicts, st.lastOk, st.at, st.waiting, st.lastError, st.error, st.held?.deletes, st.cloudOnly?.length, list.map((c) => c.id), auto, Math.floor(Date.now() / 60000)]);
    if (my !== seq || s === sig || !box) return; // nothing it shows changed: the DOM stays as it is
    sig = s;
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
    // conflicts, side by side
    if (list.length) {
      parts.push(el('div', { class: 'sp-sec' }, el('b', { text: `${list.length} thing${list.length === 1 ? ' was' : 's were'} changed on both computers — choose` }),
        el('span', { class: 'hint', text: 'Whatever you don\'t keep waits in Deleted files for 30 days.' }),
        ...list.map(card),
        list.length > 1 ? el('div', { class: 'sp-row' }, el('button', { type: 'button', class: 'ghost small', text: 'Settle all for me', title: 'Chats, scenes and settings: merged (the newer one wins where they differ); pictures and files: the newer one', on: { click: settleAll } })) : null));
    } else if (st.conflicts) parts.push(el('p', { class: 'hint', text: `${st.conflicts} conflict${st.conflicts === 1 ? '' : 's'}…` }));
    // what is waiting, and why
    const waiting = st.waiting || [];
    if (waiting.length || st.pending) {
      const cloudOnly = waiting.filter((x) => x.why === 'cloud-only').length;
      parts.push(el('div', { class: 'sp-sec' }, el('b', { text: `Waiting (${Math.max(st.pending || 0, waiting.length)})` }),
        el('ul', { class: 'sp-wait' }, ...waiting.slice(0, 6).map((x) => el('li', {}, el('span', { class: 'sp-name', text: Sync.nameOf(x.rel) }), el('span', { class: 'hint', text: whyText(x.why, st) })))),
        waiting.length > 6 || st.pending > waiting.length ? el('span', { class: 'hint', text: `…and ${Math.max(st.pending, waiting.length) - Math.min(6, waiting.length)} more` }) : null,
        cloudOnly ? el('div', { class: 'sp-row' }, el('button', { type: 'button', class: 'ghost small', text: `Download ${cloudOnly === 1 ? 'it' : `those ${cloudOnly}`} now`, title: 'Big files your cloud drive keeps online only are never downloaded unless you ask', on: { click: async (e) => { e.currentTarget.disabled = true; await Sync.download(); sig = ''; render(); } } })) : null));
    }
    if (auto && Date.now() - auto.at < 864e5) parts.push(el('p', { class: 'hint sp-auto', text: `Settled ${auto.done} conflict${auto.done === 1 ? '' : 's'} by itself ${ago(auto.at)} (merged; the other versions are in Deleted files).` }));
    if (st.skippedBig?.length) parts.push(el('p', { class: 'hint', text: `${st.skippedBig.length} big video${st.skippedBig.length === 1 ? '' : 's'} kept on this computer (Sync big videos is off).` }));
    // the actions
    const now = el('button', { type: 'button', class: 'primary sp-now', text: 'Sync now', on: { click: async () => { now.disabled = true; now.textContent = 'Syncing…'; try { await Sync.now({ quiet: true }); } finally { now.disabled = false; now.textContent = 'Sync now'; sig = ''; render(); } } } });
    parts.push(el('div', { class: 'sp-foot' }, st.on ? now : el('button', { type: 'button', class: 'primary', text: 'Turn on sync…', on: { click: () => { close(); Sync.setup(); } } }),
      el('button', { type: 'button', class: 'ghost small', text: 'Deleted files…', on: { click: () => { close(); Sync.trash(); } } }),
      el('span', { class: 'spacer' }),
      el('button', { type: 'button', class: 'ghost small', text: '⋯', title: 'More: pause, open the cloud folder, big videos, other drive, turn off', attrs: { 'aria-label': 'More sync options' }, on: { click: (e) => showMenuAt(e.currentTarget, Sync.items()) } })));
    const keepScroll = box.scrollTop;
    box.replaceChildren(...parts.filter(Boolean));
    box.scrollTop = keepScroll;
    place();
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
  function open(at) {
    if (box) { close(); }
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
    return render().then(() => { box?.querySelector('.sp-now, .sp-keep, button')?.focus({ preventScroll: true }); return box; });
  }
  function close() {
    off?.(); off = null;
    anchor?.classList.remove('on');
    box?.remove(); box = null; sig = '';
  }
  const toggle = (at) => (box ? (close(), null) : open(at));
  return { open, close, toggle, isOpen: () => Boolean(box), render: () => { sig = ''; return render(); } };
})();
