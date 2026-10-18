// Inspo drop (round 65, inspodrop65): drag a picture or a clip from the board drawer (▦ in the rail, Ctrl+Shift+M)
// into a chat and the chat gets the REAL media, not a .txt of its vibe:
//   - a picture (image, gif, a website's snapshot) attaches as a picture: the board's own file (or its cached copy;
//     a web address is fetched once and kept in Hearth's attachments), with the normal thumbnail in the chat box. It
//     reaches Claude / Astra the way every attached picture does (engines.js: Claude's Read of the attachments
//     folder, Codex's -i / localImage), scaled to 1568 px at most by attachlean.js;
//   - a clip attaches as its key frames (FrameRead: ffmpeg when there is one, else the window's <video> + canvas; 4–8
//     frames from the first one, the middle among them, 768 px long side) plus one short line naming the video file, its
//     length and the frames' times. In the chat box: one video chip with the frames strip (× removes them all);
//   - several tiles / the whole board (the drawer's top strip): each media item on its own, 10 at most (a plain
//     note says how many were left), 24 pictures at most in all (clips share what the stills leave).
// The old vibe text is never lost: Shift while dropping, or right-click a tile › Attach as vibe text. Alt+drop is
// still Board eyes (small pictures with item ids). Nothing is sent until you send.
const BoardDrop = (() => {
  const B = Board; const C = BoardDropCore; const V = BoardVibe;
  const KV = 'inspo-drop'; // { cache: { "<source>|<size>|<mtime>": attachment path } } (a web address once)
  let cache = null; let loaded = null; // (DataSafe: never saved over a store that didn't read)
  async function loadCache() {
    if (cache) return cache;
    try { loaded = window.DataSafe ? await DataSafe.load(KV, null) : await window.hub.kvGet(KV, null, { status: true }).then((r) => ({ value: r?.value ?? null, ok: r?.state === 'ok' || r?.state === 'missing' })); } catch { loaded = { value: null, ok: false }; }
    cache = loaded?.value?.cache && typeof loaded.value.cache === 'object' ? loaded.value.cache : {};
    return cache;
  }
  const saveCache = debounce(async () => {
    const keys = Object.keys(cache || {}); for (const k of keys.slice(0, Math.max(0, keys.length - 400))) delete cache[k];
    try { if (window.DataSafe) await DataSafe.save(KV, { cache }, loaded); else if (loaded?.ok) await window.hub.kvSet(KV, { cache }); } catch (err) { console.warn('inspo drop: cache', err); }
  }, 400);
  const base = (p) => String(p || '').split(/[?#]/)[0].split(/[\\/]/).pop();
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const stat = (p) => window.hub.fs.stat(p).catch(() => null);
  const urlOf = (p) => (typeof WinMac !== 'undefined' && WinMac.fileUrl ? WinMac.fileUrl(p) : B.fileUrl(p));

  // ---------- one source file → a file in Hearth's attachments (cached) ----------
  async function intoAttachments(src, name) {
    await loadCache();
    if (C.isData(src)) return window.hub.saveAttachment(name, String(src).split(',')[1]);
    let local = src; let key = src;
    if (C.isUrl(src)) {
      if (cache[key] && await stat(cache[key])) return cache[key];
      const r = await window.hub.board.fetch(src);
      if (!r?.ok) throw new Error(`Couldn't download ${base(src) || 'the picture'}: ${r?.error || 'offline'}`);
      local = r.path;
      name = name.replace(/\.\w+$/, '') + C.extOf(r.path, C.extOf(name));
    } else {
      const s = await stat(src);
      if (!s) throw new Error(`${base(src)} is gone from the disk`);
      key = `${src}|${s.size}|${Math.round(s.mtimeMs || +new Date(s.mtime) || 0)}`;
      if (cache[key] && await stat(cache[key])) return cache[key];
    }
    const p = await window.hub.saveAttachment(name, await window.hub.fs.read(local, { encoding: 'base64' }));
    cache[key] = p; saveCache();
    return p;
  }

  // ---------- a picture ----------
  async function picture(it, v) {
    const title = C.safeName(it.title || base(it.src) || V.KIND_WORD[it.type] || 'picture');
    const tries = it.type === 'web' ? [it.src, it.thumb, it.tiny] : it.type === 'video' ? [it.poster, it.tiny] : [it.src, it.thumb, it.tiny];
    let lastErr = null;
    for (const src of tries.filter(Boolean)) {
      try {
        const name = /\.\w{2,4}$/.test(title) ? title : `${title}${C.extOf(src)}`;
        const path = await intoAttachments(src, name);
        v.attachments.push({ kind: 'image', name, path, preview: urlOf(path), inspo: { item: it.id, src } });
        return 1;
      } catch (err) { lastErr = err; }
    }
    throw lastErr || new Error('No picture to attach');
  }

  // ---------- a clip: its key frames + one line ----------
  async function clip(it, v, { maxFrames, canOpen }) {
    let src = it.src;
    if (C.isUrl(src)) src = await intoAttachments(src, `${C.safeName(it.title || base(src) || 'clip')}${C.extOf(src, '.mp4')}`);
    if (typeof FrameRead === 'undefined') await window.Lazy?.load?.('capture')?.catch?.(() => {});
    const name = C.safeName(it.file || it.title || base(src) || 'clip');
    const group = `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    let info = null; let frames = [];
    try {
      info = await FrameRead.info(src);
      const times = C.frameTimes(info.duration || it.duration, { max: maxFrames, fps: info.fps });
      const size = C.frameSize(info.w, info.h);
      frames = (await FrameRead.frames(src, { times }, { width: size.width, format: 'jpg' })).filter((f) => f?.path);
    } catch (err) { console.warn('inspo drop: frames', err); }
    const shots = [];
    for (const f of frames) {
      const t = Number(f.time) || 0;
      const fname = `${name.replace(/\.\w+$/, '')} @ ${C.clock(t).replace(':', 'm')}s.jpg`;
      try { const p = await window.hub.saveAttachment(fname, await window.hub.fs.read(f.path, { encoding: 'base64' })); shots.push({ t, path: p }); } catch { /* one frame less */ }
    }
    if (!shots.length && it.poster) { // no frames could be read here: the poster at least
      try { shots.push({ t: Math.min((it.duration || 0) * 0.1, 2), path: await intoAttachments(it.poster, `${name.replace(/\.\w+$/, '')} poster.jpg`) }); } catch { /* the line alone */ }
    }
    const duration = info?.duration || it.duration || 0;
    const line = C.videoLine({ name, duration, w: info?.w, h: info?.h, times: shots.map((s) => s.t), path: src, canOpen });
    v.attachments.push({ kind: 'text', name: `${name} (video)`, content: line, vgroup: group, video: src, frames: shots.map((s) => s.path), duration, inspo: { item: it.id, src } });
    for (const s of shots) v.attachments.push({ kind: 'image', name: `${name} · ${C.clock(s.t)}`, path: s.path, preview: urlOf(s.path), vframe: group });
    return shots.length;
  }

  // ---------- the drop ----------
  // ids empty = the whole board. Returns { pictures, clips, frames, over, vibe } (what went into the chat box).
  async function attach(agentId, { boardId = null, itemIds = [], quiet = false } = {}) {
    agentId ||= BoardDrawer.currentAgentId();
    const agent = H.agent(agentId);
    if (!agent || agent.mode !== 'native') { toast('Pick a Claude or Astra chat', { type: 'error' }); return null; }
    await B.ready();
    const chatId = H.activeChat?.[agentId];
    const b = boardId ? await B.load(boardId) : (chatId && await B.boardFor(chatId).catch(() => null)) || B.current();
    if (!b) return null;
    const list = itemIds.length ? itemIds.map((id) => B.item(id, b)).filter(Boolean) : b.items.filter((i) => i.type !== 'frame' && i.type !== 'link' && !i.hidden);
    const p = C.plan(list);
    // nothing to look at (a note, colors): its vibe text, as before
    if (!p.take.length) return { vibe: await BoardDrawer.attach(agentId, { boardId: b.id, itemIds, quiet }) };
    if (!Native.hasView(agentId)) { activate(agentId); await new Promise((r) => setTimeout(r, 80)); }
    const v = Native.view(agentId);
    const canOpen = Boolean(agent.workspace || (typeof Access !== 'undefined' && Access.isOn?.(agentId)));
    const busy = toast(`Attaching ${plural(p.take.length, p.take.length === 1 && C.kindOf(p.take[0]) === 'video' ? 'clip' : 'reference')}…`, { timeout: 0 });
    const r = { pictures: 0, clips: 0, frames: 0, over: p.over, failed: [] };
    try {
      for (const it of p.take) {
        try {
          if (C.kindOf(it) === 'video') { r.frames += await clip(it, v, { maxFrames: p.framesPerClip, canOpen }); r.clips += 1; }
          else r.pictures += await picture(it, v);
        } catch (err) { r.failed.push(`${it.title || it.id}: ${err.message}`); }
        Native.renderChips(agentId);
      }
    } finally { busy?.remove?.(); }
    // a selection with notes / colors in it: those come as their vibe text (a picture of a note says less)
    if (itemIds.length && p.other.length) r.vibe = await BoardDrawer.attach(agentId, { boardId: b.id, itemIds: p.other.map((i) => i.id), quiet: true });
    Native.renderChips(agentId);
    if (H.activeId !== agentId && H.surfaceIdFor(H.activeId) !== H.surfaceIdFor(agentId)) activate(agentId); else Native.focus(agentId);
    if (!quiet) {
      const what = [r.pictures ? plural(r.pictures, 'picture') : '', r.clips ? `${plural(r.clips, 'clip')} (${plural(r.frames, 'frame')})` : ''].filter(Boolean).join(' + ') || 'nothing';
      if (r.failed.length) toast(`Couldn't attach ${r.failed[0]}${r.failed.length > 1 ? ` (+${r.failed.length - 1})` : ''}`, { type: 'error', timeout: 4000 });
      toast(`${what} ready for ${agent.name}${p.over ? ` · ${p.over} more left out (${C.MAX_ITEMS} per drop: drop the others next)` : ''}`, { timeout: p.over ? 5000 : 2600 });
    }
    return r;
  }

  // ---------- the chat box: a clip's chip shows its frames; × removes the clip and its frames ----------
  Native.hooks.chips.push((agentId, atts) => {
    if (!atts.some((a) => a.vgroup || a.vframe)) return;
    const v = Native.view(agentId);
    const chips = [...(v?.chips?.querySelectorAll(':scope > .attach-chip') || [])];
    atts.forEach((a, i) => {
      const chip = chips[i];
      if (!chip) return;
      if (a.vframe) { chip.classList.add('idrop-frame'); chip.hidden = true; return; }
      if (!a.vgroup) return;
      chip.classList.add('idrop-vchip');
      chip.title = `${a.content}\nThe clip goes as ${plural(a.frames.length, 'picture')} (its key frames). Click: play it`;
      const icon = chip.firstElementChild;
      if (icon) icon.textContent = '🎞';
      const strip = el('span', { class: 'idrop-strip' }, atts.filter((x) => x.vframe === a.vgroup).map((x) => el('img', { src: x.preview, alt: '', title: x.name.split(' · ').pop() })));
      strip.addEventListener('click', () => { if (typeof CaptureView !== 'undefined') CaptureView.open(a.video).catch(() => window.hub.fs.open(a.video)); else window.hub.fs.open(a.video); });
      chip.insertBefore(strip, chip.children[1] || null);
      const x = [...chip.querySelectorAll('button')].pop();
      if (x) x.replaceWith(el('button', { type: 'button', text: '×', title: 'Remove the clip and its frames', on: { click: () => { const g = a.vgroup; for (let k = v.attachments.length - 1; k >= 0; k--) if (v.attachments[k].vgroup === g || v.attachments[k].vframe === g) v.attachments.splice(k, 1); Native.renderChips(agentId); } } }));
    });
  });

  try {
    Keys.add({ area: 'Board', keys: 'Drag a picture / clip from the drawer into a chat', what: 'attach the picture itself (a clip: its key frames + the file)' });
    Keys.add({ area: 'Board', keys: 'Shift while dropping', what: 'attach its vibe as text instead' });
  } catch { /* keys.js not loaded */ }

  return { attach, _: { intoAttachments, cache: () => cache } };
})();
