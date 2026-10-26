// Credits (round 67, credits67): an honest log of who did what on each piece (a Lab scene), the Credits panel (the
// Lab toolbar's "Credits" button) with a Copy button, and "How it was made", a 10–20 s video of the piece's versions
// with plain title cards, made locally with ffmpeg. Nothing here is uploaded.
//   Data: kv credit-log (credits-core.js: counts and a few short notes, never every event; written 2.5 s after the last
//   change, and at once when the window is hidden; no timers otherwise).
//   Listens from outside, editing none of these: the time machine (hearth:tm → ThreeHistory._doc: the version's `by`
//   and kind), the slider panel (trusted 'change' events inside .tweaks: moves saved into the code or not), the Sound
//   desk (WorkbenchVST.api.on('params'): source desk / editor = the owner's hands, ai-chat / preset-hover = AI), the
//   recordings (document hearth:quest-week: park-jam, park-song, live-set).
const Credits = (() => {
  const C = CreditsCore;
  const KV = 'credit-log';
  let log = null; // null while not read, or when it couldn't be read (then nothing is recorded or written)
  let unreadable = false;
  let loadP = null;
  const queue = []; // what happened before the log was read
  const S = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.scenes : null);
  const here = () => { try { return S()?.currentId?.() || null; } catch { return null; } };
  const nameOf = (id) => { try { return S()?.get?.(id)?.name || ''; } catch { return ''; } };
  const join = (a, b) => (typeof WinMac !== 'undefined' ? WinMac.join(a, b) : `${a}${String(a).includes('\\') ? '\\' : '/'}${b}`);

  // ---------- the log: read once, saved a moment after the last change ----------
  function load() {
    loadP ||= (async () => {
      let r = null;
      try { r = await window.hub.kvGet(KV, null, { status: true }); } catch { r = { state: 'unreadable' }; }
      if (r?.state === 'ok') log = C.heal(r.value);
      else if (r?.state === 'missing') log = C.blank();
      else if (r?.prev !== undefined && r?.prev !== null) log = C.heal(r.prev); // its copy (.prev.json): the store merges the next save with it
      else { unreadable = true; log = null; console.warn('credits: the credit log could not be read; nothing is recorded until it can'); }
      if (log) for (const fn of queue.splice(0)) fn(); else queue.length = 0;
      return log;
    })();
    return loadP;
  }
  let saveT = 0;
  function save() {
    clearTimeout(saveT); saveT = 0;
    if (!log || unreadable) return Promise.resolve(false);
    return window.hub.kvSet(KV, log).then(() => true).catch((err) => { console.warn('credits save', err); return false; });
  }
  const dirty = () => { if (!log) return; clearTimeout(saveT); saveT = setTimeout(save, 2500); };
  document.addEventListener('visibilitychange', () => { if (document.hidden && saveT) save(); });
  addEventListener('beforeunload', () => { if (saveT) save(); });
  // another computer's log arrived (cloud sync): read again when nothing waits to be written here
  addEventListener('hearth:synced', (ev) => {
    if (!(ev.detail?.files || []).some((f) => f.rel === `kv/${KV}.json`) || saveT) return;
    window.hub.kvGet(KV, null, { status: true }).then((r) => { if (r?.state === 'ok' && !saveT) { log = C.heal(r.value); unreadable = false; } }).catch(() => {});
  });
  // run fn on the log now, or once it's read
  function withLog(fn) {
    if (unreadable) return;
    const go = () => { try { if (fn(log)) dirty(); } catch (err) { console.warn('credits', err); } };
    if (log) go(); else { if (queue.length < 200) queue.push(go); load(); }
  }

  // ---------- what it listens to ----------
  addEventListener('hearth:tm', (ev) => {
    const { id, version } = ev.detail || {};
    if (!id || !version) return; // (null: another computer's versions merged in, or thinning)
    const v = window.ThreeHistory?._doc?.(id)?.versions?.find((x) => x.id === version);
    if (!v) return;
    const copy = { id: v.id, at: v.at, by: v.by, kind: v.kind, label: v.label, mark: v.mark ? { ...v.mark } : null };
    const name = nameOf(id);
    withLog((L) => C.noteVersion(L, id, name, copy));
  });
  // the slider panel: one count per let-go (a range / number / color / choice), only real clicks and keys
  const SLIDER = 'input[type="range"], input[type="number"], input[type="color"]';
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!e.isTrusted || !t?.closest?.('.tweaks')) return;
    if (!(t.matches(SLIDER) || (t.tagName === 'SELECT' && t.closest('.tw-body')))) return;
    const id = here();
    if (id) { const name = nameOf(id); withLog((L) => C.noteMoves(L, id, name, 1)); }
  }, true);
  document.addEventListener('click', (e) => {
    if (!e.isTrusted || !e.target?.closest?.('.tweaks .tw-seg-btn')) return;
    const id = here();
    if (id) { const name = nameOf(id); withLog((L) => C.noteMoves(L, id, name, 1)); }
  }, true);
  // the Sound desk (Codex's tools/workbench-vst.js, loaded on first use): its params events say whose hands moved what
  let deskOn = false;
  function hookDesk() {
    if (deskOn || typeof WorkbenchVST === 'undefined' || typeof WorkbenchVST.api?.on !== 'function') return;
    deskOn = true;
    WorkbenchVST.api.on('params', (ev) => {
      const source = ev?.source;
      if (!['desk', 'editor', 'ai-chat', 'preset-hover', 'preset', 'undo'].includes(source)) return;
      let instrument = '';
      try { instrument = WorkbenchVST.api.current()?.name || ''; } catch { /* no instrument open */ }
      const id = here(); const name = id ? nameOf(id) : '';
      // a knob gesture is one move, however many controls it touched
      withLog((L) => C.noteSound(L, id, name, { source, instrument, changed: 1 }));
    });
  }
  window.Lazy?.when?.('creative', hookDesk);
  // recordings made in Park mode / Loop song / Live set
  document.addEventListener('hearth:quest-week', (e) => {
    const d = e.detail || {};
    const id = here(); const name = id ? nameOf(id) : '';
    withLog((L) => C.noteRecording(L, id, name, { kind: d.kind, title: d.title }));
  });

  // ---------- the button in the Lab's toolbar ----------
  function addButton() {
    for (const bar of document.querySelectorAll('.three-toolbar')) {
      if (bar.querySelector('.cr-open')) continue;
      const b = el('button', { type: 'button', class: 'ghost small cr-open', text: 'Credits', title: 'Who made this piece: your hand edits, the AIs\' edits, the sound · Copy · "How it was made" video', dataset: { feature: 'Credits' }, on: { click: () => open().catch((err) => toast(err.message, { type: 'error' })) } });
      const shot = bar.querySelector('.imp-capture');
      if (shot) bar.insertBefore(b, shot); else bar.append(b);
    }
  }
  addEventListener('hearth:lab-ready', addButton);
  addButton();

  // ---------- the panel ----------
  let card = null;
  const OWNER_MAX = 40;
  const fmtDay = (t) => { try { return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); } catch { return ''; } };
  function close() { card?.remove(); card = null; }
  async function versionsOf(id) { try { return window.ThreeHistory ? await window.ThreeHistory.list(id) : null; } catch { return null; } }
  async function open(id = here()) {
    if (!id) throw new Error('Open a scene in the Lab first.');
    await load();
    close();
    const back = el('div', { class: 'cr-back', on: { click: (e) => { if (e.target === back && !busy) close(); } } });
    const box = el('div', { class: 'cr-card', role: 'dialog', attrs: { 'aria-label': 'Credits' } });
    back.append(box);
    back.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); close(); } });
    document.body.append(back);
    card = back;
    await draw(box, id);
    box.querySelector('button')?.focus();
  }
  async function draw(box, id) {
    const versions = await versionsOf(id);
    box.replaceChildren();
    const name = nameOf(id) || 'This scene';
    box.append(el('div', { class: 'cr-head' }, el('b', { text: `Credits · ${name}` }), el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'ghost small', text: 'Close', on: { click: () => { if (!busy) close(); } } })));
    if (unreadable || !log) {
      box.append(el('p', { class: 'cr-warn', text: 'The credit log couldn\'t be read, so nothing is shown or recorded until it can (nothing was changed or emptied). ⋯ Settings → Recover can bring back its copy.' }));
      return;
    }
    const p = log.pieces[id] || null;
    const owner = log.owner;
    const cr = C.credits(p, { owner, versions });
    const lines = el('dl', { class: 'cr-lines' }, cr.lines.flatMap((l) => [el('dt', { text: l.k }), el('dd', { text: l.text })]));
    const copyBtn = el('button', { type: 'button', class: 'primary small', text: 'Copy', title: 'Copy these credits as one paragraph', on: { click: () => copyText(`${name}. ${cr.text}`, 'Credits copied') } });
    const desk = C.deskCredits(log);
    const copyAll = el('button', { type: 'button', class: 'ghost small', text: 'Copy with the Sound desk totals', on: { click: () => copyText(`${name}. ${cr.text}\n${desk}`, 'Credits copied') } });
    const ownerIn = el('input', { value: owner, maxLength: OWNER_MAX, attrs: { 'aria-label': 'Your name in the credits' } });
    ownerIn.addEventListener('change', () => { const v = ownerIn.value.trim().slice(0, OWNER_MAX); if (v && v !== log.owner) { log.owner = v; dirty(); draw(box, id); } });
    const startSel = el('select', { attrs: { 'aria-label': 'The starting code was' } }, [['', 'not recorded'], ['me', 'written by me'], ['ai', 'written by an AI'], ['template', 'a Hearth template'], ['other', 'from elsewhere']].map(([v, t]) => el('option', { value: v, text: t, selected: (p?.start || '') === v })));
    startSel.addEventListener('change', () => { C.piece(log, id, nameOf(id)).start = startSel.value; dirty(); draw(box, id); });
    const since = p ? `Recorded since ${fmtDay(p.since)}.` : 'Nothing recorded on this scene yet.';
    box.append(
      lines,
      el('div', { class: 'cr-row' }, copyBtn, copyAll),
      el('div', { class: 'cr-fields' },
        el('label', {}, 'Your name in the credits', ownerIn),
        el('label', {}, 'The starting code was', startSel)),
      el('p', { class: 'cr-small', text: `${since} The log counts edits by who made them (the time machine knows), slider moves (saved or not), and the Sound desk and recordings while this scene was open in the Lab. Before the log, or where it can't tell, it says "not recorded". It stays on this computer (and in your sync folder if sync is on); nothing is uploaded.` }),
    );
    if (p?.notes?.length) box.append(el('details', { class: 'cr-notes' }, el('summary', { text: 'Recent' }), el('ul', {}, p.notes.slice().reverse().map((x) => el('li', { text: `${fmtDay(x.at)} · ${x.who === 'you' ? owner : C.NAMES[x.who] || 'AI'}: ${x.text}` })))));
    box.append(el('p', { class: 'cr-small', text: desk }));
    box.append(reelPart(id, versions));
  }

  // ---------- "How it was made" ----------
  let busy = false;
  const ffOver = () => ({ ffmpeg: H.settings?.().ffmpegPath || undefined });
  async function exportDir() {
    try { if (typeof ThreeSeq !== 'undefined' && ThreeSeq.outDir) return await ThreeSeq.outDir(); } catch { /* below */ }
    return join(await window.hub.fs.home(), 'Hearth exports');
  }
  function reelPart(id, versions) {
    const wrap = el('div', { class: 'cr-reel' }, el('b', { text: 'How it was made' }));
    const n = versions?.length || 0;
    let ratio = store.get('credits.ratio', '9:16');
    let dir = store.get('credits.dir', '') || '';
    const ratios = el('div', { class: 'cr-seg', role: 'group', attrs: { 'aria-label': 'Frame' } }, ['9:16', '16:9'].map((r) => el('button', { type: 'button', class: `ghost small${r === ratio ? ' on' : ''}`, text: r === '9:16' ? '9:16 (phone)' : '16:9 (wide)', attrs: { 'aria-pressed': String(r === ratio) }, on: { click: (e) => { ratio = r; store.set('credits.ratio', r); for (const b of ratios.children) { b.classList.toggle('on', b === e.currentTarget); b.setAttribute('aria-pressed', String(b === e.currentTarget)); } } } })));
    const where = el('span', { class: 'cr-small', text: dir ? `Saved in ${dir}` : 'Saved in the usual export folder' });
    const pick = el('button', { type: 'button', class: 'ghost small', text: 'Choose folder…', on: { click: async () => { const d = await window.hub.pickFolder(dir || await exportDir(), 'Where to save "How it was made"'); if (d) { dir = d; store.set('credits.dir', d); where.textContent = `Saved in ${d}`; } } } });
    const usual = el('button', { type: 'button', class: 'ghost small', text: 'Use the export folder', on: { click: () => { dir = ''; store.set('credits.dir', ''); where.textContent = 'Saved in the usual export folder'; } } });
    const status = el('p', { class: 'cr-small', attrs: { 'aria-live': 'polite' } });
    const go = el('button', { type: 'button', class: 'primary small', text: 'Make the video', disabled: !n, title: n ? 'A 10–20 s video of this scene\'s versions with title cards (made here, never uploaded)' : 'This scene has no versions in the time machine yet' });
    go.addEventListener('click', async () => {
      if (busy) return;
      go.disabled = true;
      try {
        const r = await makeReel(id, { ratio, dir: dir || await exportDir(), say: (t) => { status.textContent = t; } });
        status.replaceChildren(el('span', { text: `Saved: ${r.output} ` }), el('button', { type: 'button', class: 'ghost small', text: 'Show in folder', on: { click: () => window.hub.fs.reveal(r.output) } }));
      } catch (err) { status.textContent = err.message; } finally { go.disabled = false; }
    });
    wrap.append(
      el('p', { class: 'cr-small', text: n ? `Pictures of up to 8 of the ${n} versions the time machine kept, each with a card saying who did it, then these credits. The scene on screen shows each version for a moment, then comes back as it was.` : 'This scene has no versions in the time machine yet.' }),
      el('div', { class: 'cr-row' }, ratios),
      el('div', { class: 'cr-row' }, where, pick, usual),
      el('div', { class: 'cr-row' }, go), status);
    return wrap;
  }
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames = (n = 2) => new Promise((r) => { const f = (k) => (k ? requestAnimationFrame(() => f(k - 1)) : r()); f(n); });
  const img = (url) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('picture')); i.src = url; });
  // each version's picture: shown on the preview (the time machine's scrub: nothing is saved), a screenshot, and the
  // scene back as it was in the end, whatever happens. A missing screenshot falls back to the version's small picture.
  async function stills(id, plan, say) {
    const TH = window.ThreeHistory;
    const shot = () => (ThreeLab.director?.shot ? ThreeLab.director.shot() : Promise.resolve(null));
    const out = [];
    let thumbs = null;
    try {
      for (let i = 0; i < plan.length; i += 1) {
        say(`Picture ${i + 1} of ${plan.length}…`);
        if (here() !== id) throw new Error('The scene on screen changed: the video was stopped.');
        await TH.preview(plan[i].vid, id);
        await wait(1100); await frames(3);
        let url = await shot().catch(() => null);
        let small = false;
        if (!url) { thumbs ||= await TH.thumbs(id).catch(() => ({})); url = thumbs?.[plan[i].vid] || null; small = Boolean(url); }
        out.push({ ...plan[i], url, small });
      }
    } finally {
      try { await TH.endScrub(false); } catch (err) { console.warn('credits: back to the scene', err); }
    }
    return out;
  }
  // a still on the frame (fit inside, dark around it) with its card under it, as PNG base64
  function wrapText(ctx, text, maxW) {
    const words = String(text).split(/\s+/); const lines = []; let cur = '';
    for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines;
  }
  async function frameOf({ W, H }, { url, card, sub }) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0b0b0e'; ctx.fillRect(0, 0, W, H);
    const band = Math.round(H * (H > W ? 0.24 : 0.2));
    if (url) {
      const im = await img(url).catch(() => null);
      if (im) {
        const s = Math.min(W / im.width, (H - band) / im.height);
        const w = im.width * s; const h = im.height * s;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(im, (W - w) / 2, (H - band - h) / 2, w, h);
      }
    }
    const pad = Math.round(W * 0.06);
    const big = Math.round(Math.min(W, H) * 0.055);
    ctx.fillStyle = '#ffffff'; ctx.font = `600 ${big}px system-ui, sans-serif`; ctx.textBaseline = 'top';
    const L = wrapText(ctx, card, W - pad * 2).slice(0, 3);
    let y = H - band + Math.round(band * 0.14);
    for (const l of L) { ctx.fillText(l, pad, y); y += big * 1.2; }
    if (sub) { ctx.fillStyle = '#b9b4c6'; ctx.font = `400 ${Math.round(big * 0.5)}px system-ui, sans-serif`; ctx.fillText(sub, pad, y + big * 0.2); }
    return cv.toDataURL('image/png').split(',')[1];
  }
  async function endCard({ W, H }, name, text) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0b0b0e'; ctx.fillRect(0, 0, W, H);
    const pad = Math.round(W * 0.07);
    const big = Math.round(Math.min(W, H) * 0.06);
    ctx.textBaseline = 'top'; ctx.fillStyle = '#ffffff'; ctx.font = `700 ${big}px system-ui, sans-serif`;
    let y = Math.round(H * 0.12);
    for (const l of wrapText(ctx, name, W - pad * 2).slice(0, 2)) { ctx.fillText(l, pad, y); y += big * 1.2; }
    ctx.fillStyle = '#d9b777'; ctx.font = `600 ${Math.round(big * 0.55)}px system-ui, sans-serif`; ctx.fillText('How it was made', pad, y + big * 0.2); y += big * 1.4;
    let size = Math.round(big * 0.46);
    // the credits, made smaller until they fit
    for (;;) {
      ctx.font = `400 ${size}px system-ui, sans-serif`;
      const lines = text.split('\n').flatMap((p) => wrapText(ctx, p, W - pad * 2));
      if (y + lines.length * size * 1.35 < H - pad || size <= 14) { ctx.fillStyle = '#e8e4f0'; for (const l of lines) { ctx.fillText(l, pad, y); y += size * 1.35; } break; }
      size -= 2;
    }
    return cv.toDataURL('image/png').split(',')[1];
  }
  let jobsOn = false;
  const jobs = new Map();
  function render(job) {
    if (!jobsOn) {
      jobsOn = true;
      window.hub.video.onJob((ev) => {
        const j = jobs.get(ev.id);
        if (!j) return;
        if (ev.type === 'progress') j.onProgress?.(ev.pct);
        if (ev.type === 'done') { jobs.delete(ev.id); if (ev.code === 0) j.resolve(ev); else j.reject(new Error(ev.cancelled ? 'The video was cancelled' : ev.error || `ffmpeg ended with ${ev.code}`)); }
      });
    }
    return new Promise((resolve, reject) => {
      jobs.set(job.id, { onProgress: job.onProgress, resolve, reject });
      window.hub.video.transcode({ id: job.id, input: job.input, output: job.output, args: job.args, duration: job.duration }, ffOver()).catch((err) => { jobs.delete(job.id); reject(err); });
    });
  }
  async function makeReel(id, { ratio = '9:16', dir, say = () => {} } = {}) {
    if (busy) throw new Error('A video is being made already.');
    if (!window.ThreeHistory || typeof CutData === 'undefined') throw new Error('Open the Lab first.');
    if (here() !== id) throw new Error('Open that scene in the Lab first.');
    if (window.ThreeHistory.scrubbing) throw new Error('A version from the time machine is on screen: go back to now first.');
    const tools = await window.hub.video.tools(ffOver()).catch(() => null);
    if (!tools?.ffmpeg) throw new Error(tools?.hint || 'ffmpeg wasn\'t found: Settings → Video → ffmpeg.');
    busy = true;
    const tmp = join(dir, `.hearth-titles-cr${Date.now().toString(36)}`);
    let wrote = false;
    try {
      await load();
      const versions = await window.ThreeHistory.list(id);
      const p = log?.pieces?.[id] || null;
      const owner = log?.owner || 'Quentin';
      const plan = C.reelPlan(versions, { owner, start: p?.start || '', max: 8 });
      if (!plan.length) throw new Error('This scene has no versions in the time machine yet.');
      const shots = await stills(id, plan, say);
      const size = C.SIZES[ratio] || C.SIZES['9:16'];
      const sz = { W: size.w, H: size.h };
      say('Putting the pictures together…');
      const files = [];
      for (let i = 0; i < shots.length; i += 1) {
        const s = shots[i];
        const v = versions.find((x) => x.id === s.vid);
        const sub = `${v ? new Date(v.at).toLocaleDateString() : ''} · ${i + 1} of ${shots.length}${s.small ? ' · small picture (the screenshot failed)' : ''}${s.url ? '' : ' · no picture'}`;
        const f = join(tmp, `still-${String(i + 1).padStart(2, '0')}.png`);
        await window.hub.fs.write(f, await frameOf(sz, { url: s.url, card: s.card, sub }), { base64: true });
        wrote = true;
        files.push(f);
      }
      const name = nameOf(id) || 'Untitled';
      const cr = C.credits(p, { owner, versions });
      const endFile = join(tmp, 'credits.png');
      await window.hub.fs.write(endFile, await endCard(sz, name, cr.lines.map((l) => `${l.k}: ${l.text}`).join('\n')), { base64: true });
      const times = C.reelTimes(files.length);
      const g = CutData.ffmpegArgs(C.reelEdit(files, endFile, times), {}, { w: sz.W, h: sz.H, fps: 30 }, {});
      const stem = `${C.safeName(name)} - how it was made ${ratio === '9:16' ? '9x16' : '16x9'}`;
      let out = join(dir, `${stem}.mp4`);
      for (let i = 2; i < 200 && await window.hub.fs.stat(out).catch(() => null); i += 1) out = join(dir, `${stem} (${i}).mp4`);
      say('Making the video…');
      await render({ id: `credits${Date.now().toString(36)}`, input: files[0], output: out, args: [...g.args, 'OUTPUT'], duration: g.duration, onProgress: (pct) => say(`Making the video… ${Math.round(pct * 100)}%`) });
      return { output: out, stills: shots.length, seconds: times.total };
    } finally {
      busy = false;
      if (wrote) window.hub.video.rmtemp?.(tmp).catch(() => {}); // (aemain.js removes only a folder named .hearth-titles-…)
    }
  }

  load();
  return { open, close, makeReel, ready: load, log: () => log, unreadable: () => unreadable, flush: save, _hookDesk: hookDesk };
})();
window.Credits = Credits;
