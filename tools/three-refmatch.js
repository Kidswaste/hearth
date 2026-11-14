// ✦ Make a layer like this (round 131, refmatch131). docs/upgrades/refmatch131.md
// A reference picture → ONE new layer in its spirit. Built on what exists:
//   · the picture's palette: Kit.paletteFromImage (here, no AI); its look in words: LookMatch.read + LookCore.words
//     (lookmatch's own reader, no AI). The project's palette (LabProjLook, looks129) wins when the owner ticks it
//   · the build: the Lab's docked director (Claude or Astra) in its own chat, with one message and one small picture
//     (≤ 512 px), sent only on the owner's click after the cost is shown (director-cost / mcp/cost.js, like draft129)
//   · one undo step: the reply is one LabTxn step (the dock's ↶); the card's ↶ Undo puts the scene back exactly
//   · Closer / Looser: one more pass on the same layer, its own undo step
// Ways in: a Lab reference's card (🖼 References › ✦ Like this), a moodboard item's right-click, a picture dropped on the
// Lab preview, /like <reference | file> (alone: pick a picture), Ctrl/⌘+K, and the director's three_do references
// {action: "like", name} (op below: the picture and the brief come back to it as the tool's answer).
//   LabRefMatch.open(source, { agentId }) · run() · again('closer' | 'looser') · undo() · stop() · close() · state()
//   fromRef(r) · fromBoardItem(it) · fromPath(path) · pick() · op(ref, args) (three_do references like)
const LabRefMatch = (() => {
  const C = () => RefMatchCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const calm = (e) => (window.calmError ? calmError(e) : String(e?.message || e));
  const err = (e) => toast(calm(e), { type: 'error', timeout: 5000 });
  const fileUrl = (p) => (!p ? '' : /^(data|blob|https?|file):/.test(String(p)) ? String(p) : `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/').replace(/^([A-Za-z])%3A/, '$1:')}`);
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const IMAGE = /\.(png|jpe?g|gif|webp|bmp|avif)$/i;
  // S.r: the run on the card: { source, agentId, chatId, sid, pic: { w, h }, palette: { picture, project, projectName },
  //   useProject, usePicture, note, words, name, est, line, phase, passes: [{ kind, before, at, afterSig }], layer, error }
  const S = { card: null, r: null, sent: [] }; // sent: what went to the AI (the last 10: the check reads it)

  async function lab() {
    if (window.Lazy && !Lazy.loaded('lab')) await Lazy.load('lab');
    await ThreeLab.cmd?.({ show: true });
    for (let i = 0; i < 100 && !ThreeLab.director; i += 1) await sleep(100);
    if (!ThreeLab.director) throw new Error('The Lab is not ready yet.');
    return ThreeLab.director;
  }
  const who = (a, chat) => ((chat?.engine || a?.engine) === 'codex' ? 'Astra' : 'Claude');
  const directorOf = (id) => (id && H.agent(id)) || H.agents().find((x) => x.dock === 'three' && x.mode === 'native') || null;
  async function director(agentId) {
    let a = directorOf(agentId);
    if (!a) {
      await Commands.tryRun('/director-setup', H.claudeAgent?.()?.id, undefined, { source: 'refmatch', say: () => {}, note: () => {} });
      for (let i = 0; i < 50 && !directorOf(); i += 1) await sleep(100);
      a = directorOf();
    }
    if (!a) throw new Error('No Three Director to build it (Director › Make the Three Director).');
    return a;
  }
  const chatOf = (a) => (a ? (H.chats || []).find((c) => c.id === H.activeChat?.[a.id]) || null : null);
  const sceneOf = (chatId) => (chatId && typeof ChatScenes !== 'undefined' && ChatScenes.linkOf?.(chatId) && ThreeLab.scenes.get(ChatScenes.linkOf(chatId)) ? ChatScenes.linkOf(chatId) : ThreeLab.scenes.currentId());
  const sig = (t) => LabTxn._test.sigOf(t);

  // ---------- the picture (read here; nothing leaves the computer) ----------
  function loadImage(url) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('That picture could not be read.')); i.src = url; });
  }
  async function picOf(source) {
    if (source.url) return loadImage(source.url);
    try { return await loadImage(fileUrl(source.path)); } catch { /* a path the page can't open: its bytes */ }
    const ext = (base(source.path).split('.').pop() || 'png').toLowerCase();
    return loadImage(`data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${await window.hub.fs.read(source.path, { encoding: 'base64' })}`);
  }
  async function paletteOfPicture(img) {
    if (typeof Kit === 'undefined' && window.Lazy) await Lazy.load('kit').catch(() => {});
    if (typeof Kit === 'undefined') return [];
    return C().hexes(await Kit.paletteFromImage(img, 5));
  }
  async function wordsOf(source) {
    try {
      if (typeof LookMatch === 'undefined' || typeof LookCore === 'undefined') return [];
      const read = LookMatch.read({ ...source, kind: 'image' });
      const got = await Promise.race([read, sleep(8000).then(() => null)]);
      return got?.ref ? LookCore.words(got.ref) : [];
    } catch { return []; }
  }
  function projectPalette(sid) {
    try {
      const P = window.LabProjLook; if (!P || typeof Projects === 'undefined') return null;
      const p = Projects.ofItem('scene', sid)?.[0];
      const src = p ? P.paletteOf(p) : null;
      return src?.colors?.length ? { colors: C().hexes(src.colors), name: p.name || 'the project' } : null;
    } catch { return null; }
  }
  // the small picture the AI gets (≤ 512 px JPEG), saved as a chat attachment: only on the click
  async function attachPicture(img, title) {
    const s = C().picSize({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
    const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
    c.getContext('2d').drawImage(img, 0, 0, s.w, s.h);
    const b64 = c.toDataURL('image/jpeg', 0.8).split(',')[1];
    return window.hub.saveAttachment(`like ${String(title || 'picture').replace(/[^\w .-]+/g, '').slice(0, 30) || 'picture'} ${Date.now().toString(36)}.jpg`, b64);
  }

  // ---------- cost ----------
  const fixedCache = new Map();
  async function baseCost(a, chat) {
    const key = `${a.id}|${a.engine}`;
    if (!fixedCache.has(key)) {
      fixedCache.set(key, Promise.resolve(window.hub.directorCost?.([{ ...JSON.parse(JSON.stringify(a)), threeTools: true, exact: true }])).then((r) => r?.directors?.[0]?.total || 0).catch(() => 0));
      setTimeout(() => fixedCache.delete(key), 120000);
    }
    let fx = await fixedCache.get(key);
    const full = chat ? await Native.load(chat.id).catch(() => null) : null;
    const last = full?.messages?.findLast?.((m) => m.role === 'assistant' && m.usage?.input);
    fx = Math.max(fx || 9000, last?.usage?.input || 0); // the chat so far is re-read too
    return fx;
  }
  async function price(r, { again = null } = {}) {
    const a = H.agent(r.agentId); const chat = chatOf(a);
    const fx = await baseCost(a, chat);
    const text = again ? C().again(again, { name: r.name, title: r.source.title, palette: colorsOf(r), picture: again === 'closer' }) : messageOf(r);
    const pic = !again || again === 'closer' ? r.pic : null;
    const est = C().estimate({ base: fx, pic, chars: text.length, again: Boolean(again) });
    return { est, line: C().costLine(est, who(a, chat), chat?.model || a.model || '', Boolean(pic)) };
  }
  const colorsOf = (r) => C().pickPalette({ picture: r.palette.picture, project: r.palette.project?.colors, useProject: r.useProject }).colors;
  const messageOf = (r) => {
    const p = C().pickPalette({ picture: r.palette.picture, project: r.palette.project?.colors, useProject: r.useProject });
    return C().message({ title: r.source.title, name: r.name, palette: p.colors, from: p.from, words: r.words, usePicture: r.usePicture, refKey: r.source.refKey || '', note: r.note });
  };

  // ---------- open: the card with the cost (no AI call, no picture sent) ----------
  async function open(source, { agentId = null } = {}) {
    if (!source || (!source.path && !source.url)) throw new Error('Pick a picture first.');
    if (source.kind === 'video' || /\.(mp4|webm|mov|m4v|mkv)$/i.test(source.path || '')) throw new Error('Pick a picture (a still): this one is a clip.');
    if (S.r && ['running'].includes(S.r.phase)) throw new Error('Still building the last one: wait for it, or Stop it.');
    await lab();
    const a = await director(agentId);
    const chat = chatOf(a);
    const r = { source: { ...source, title: source.title || base(source.path) || 'Picture' }, agentId: a.id, chatId: chat?.id || null, sid: sceneOf(chat?.id), phase: 'reading', palette: { picture: [], project: null }, useProject: false, usePicture: false, note: '', words: [], passes: [], line: '' };
    r.name = C().name(r.source.title);
    S.r = r; paint();
    try {
      const img = await picOf(r.source);
      r.img = img; r.pic = { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
      r.palette.picture = await paletteOfPicture(img).catch(() => []);
      r.palette.project = projectPalette(r.sid);
      r.words = await wordsOf(r.source);
      r.phase = 'ready'; paint();
      Object.assign(r, await price(r)); paint();
    } catch (e) { r.phase = 'error'; r.error = calm(e); paint(); }
    return state();
  }
  async function reprice() { const r = S.r; if (!r || r.phase !== 'ready') return; try { Object.assign(r, await price(r)); } catch { /* the line stays */ } paint(); }

  // ---------- run: the one AI pass (only from the owner's click) ----------
  async function send(r, text, images) {
    const a = H.agent(r.agentId);
    if (!a) throw new Error('That director is gone.');
    const chat = r.chatId ? (H.chats || []).find((c) => c.id === r.chatId) || await Native.load(r.chatId).catch(() => null) : null;
    const c = chat || Native.ensureChat(a.id, 'Make a layer like this');
    r.chatId = c.id;
    if (Native.isBusy(c.id)) throw new Error(`${a.name} is still answering: wait for it, or stop it first.`);
    if (typeof Tools !== 'undefined') Tools.openDock?.('three');
    S.sent = [...S.sent, { agentId: a.id, chatId: c.id, text, images: images.slice(), at: Date.now() }].slice(-10);
    await Native.send(a.id, text, { chatId: c.id, images });
  }
  async function pass(kind) {
    const r = S.r;
    if (!r) throw new Error('Pick a picture first.');
    if (r.phase === 'running') return false;
    await lab();
    r.sid = sceneOf(r.chatId);
    const before = await LabTxn.snap(r.sid);
    if (!before) throw new Error('The scene isn\'t there: open it in the Lab first.');
    if (kind !== 'make' && !before.layers.some((L) => L.name === r.name)) throw new Error(`The layer "${r.name}" isn't in the scene anymore.`);
    const p = { kind, before, at: Date.now(), afterSig: null };
    const prev = r.phase;
    r.phase = 'running'; r.error = ''; paint();
    try {
      if (!r.picPath && (kind === 'make' || kind === 'closer')) r.picPath = await attachPicture(r.img, r.source.title);
      const text = kind === 'make' ? messageOf(r) : C().again(kind, { name: r.name, title: r.source.title, palette: colorsOf(r), picture: kind === 'closer' });
      r.passes.push(p);
      await send(r, text, kind === 'make' || kind === 'closer' ? [r.picPath] : []);
    } catch (e) { if (r.passes.at(-1) === p) r.passes.pop(); r.phase = prev === 'ready' ? 'ready' : 'done'; r.error = calm(e); paint(); throw e; }
    // the reply's end: the finish hook, or (a reply the hook missed) the chat no longer busy
    const poll = setInterval(() => { if (S.r !== r || r.phase !== 'running') { clearInterval(poll); return; } if (!Native.isBusy(r.chatId)) { clearInterval(poll); finish(r); } }, 1500);
    return true;
  }
  async function finish(r, how = 'done', error = null) {
    if (r.phase !== 'running') return;
    r.phase = 'settling';
    await sleep(500); // a call already on its way lands first
    const p = r.passes.at(-1);
    try {
      const after = await LabTxn.snap(r.sid);
      p.afterSig = after ? sig(after) : null;
      const made = after?.layers.find((L) => L.name === r.name) || C().added(p.before, after)[0] || null;
      if (made && made.name !== r.name && p.kind === 'make') r.name = made.name; // the director named it its own way
      r.layer = made ? { id: made.id, name: made.name } : null;
      let n = 0; try { n = made ? (ThreeLab.director.sliders(made.id)?.sliders || []).length : 0; } catch { n = 0; }
      r.sliders = n;
      r.extra = C().added(p.before, after).filter((L) => L.id !== made?.id).map((L) => L.name);
    } catch { r.layer = null; }
    r.phase = 'done';
    if (how !== 'done') r.error = error || (how === 'stopped' ? 'Stopped: what landed stays (↶ Undo takes it back).' : 'The reply stopped on an error.');
    else if (!r.layer) r.error = 'The director answered without adding the layer.';
    paint();
  }
  if (typeof Native !== 'undefined' && Native.hooks?.finish) Native.hooks.finish.push((event, chat) => {
    const r = S.r;
    if (r && r.phase === 'running' && chat?.id === r.chatId) finish(r, event.type === 'done' ? 'done' : event.type === 'stopped' ? 'stopped' : 'error', event.type === 'error' ? String(event.error || event.message || '') : null);
  });
  const run = () => pass('make');
  const again = (dir) => pass(dir === 'closer' ? 'closer' : 'looser');
  function stop() { const r = S.r; if (r?.phase !== 'running' || !r.chatId) return false; window.hub.stop(r.chatId); return true; }

  // ---------- undo: the last pass, exactly ----------
  async function undo({ force = false } = {}) {
    const r = S.r; const p = r?.passes.at(-1);
    if (!p || r.phase === 'running') throw new Error('Nothing to undo here.');
    await lab();
    const cur = await LabTxn.snap(r.sid);
    if (!cur) throw new Error('The scene isn\'t there anymore.');
    const later = p.afterSig && sig(cur) !== p.afterSig;
    if (later && !force && !(await Modal.confirm('Undo the layer?', 'The scene changed after it was made. Undoing puts it back as it was before, so those later changes go too.', { ok: 'Undo anyway', danger: true }))) return false;
    const top = LabTxn.history().at(-1);
    if (!later && top && top.at >= p.at) { try { await LabTxn.undoTurn(); } catch { /* the checkpoint below */ } }
    const now = await LabTxn.snap(r.sid);
    if (sig(now) !== sig(p.before)) await LabTxn.restore(p.before);
    r.passes.pop();
    r.phase = r.passes.length ? 'done' : 'ready';
    if (!r.passes.length) r.layer = null;
    paint();
    toast(r.passes.length ? '↶ The layer is back as it was before that pass.' : '↶ The layer is gone: the scene is back as it was.', { timeout: 3000 });
    if (r.phase === 'ready') reprice();
    return true;
  }
  function close() { S.card?.remove(); S.card = null; if (S.r?.phase !== 'running') S.r = null; }

  // ---------- the card over the Lab preview ----------
  const btn = (text, cls, fn, title = '') => el('button', { type: 'button', class: `rm-btn ${cls}`, text, title, on: { click: (ev) => { ev.stopPropagation(); Promise.resolve().then(fn).catch(err); } } });
  const swatches = (list, title) => el('div', { class: 'rm-pal', title }, ...list.map((hex) => { const s = el('span', { title: hex }); s.style.background = hex; return s; }));
  function paint() {
    const r = S.r;
    const host = typeof ThreeLab !== 'undefined' ? ThreeLab.scenes?.previewHost?.() : null;
    if (!r || !host) { S.card?.remove(); S.card = null; return; }
    if (!S.card) S.card = el('div', { class: 'rm-card', dataset: { feature: 'Lab › Make a layer like this' }, attrs: { 'aria-label': 'Make a layer like this' }, on: { contextmenu: (e) => e.stopPropagation(), keydown: (e) => { if (e.key === 'Escape' && r.phase !== 'running') { e.stopPropagation(); close(); } } } });
    const c = S.card; c.dataset.phase = r.phase;
    const a = H.agent(r.agentId);
    const thumb = r.img ? el('img', { class: 'rm-thumb', src: r.img.src, alt: '' }) : null;
    const head = el('div', { class: 'rm-head' }, el('b', { text: '✦ Make a layer like this' }), el('span', { class: 'rm-src', text: r.source.title, title: r.source.path || '' }),
      r.phase === 'running' ? null : btn('✕', 'rm-x', () => close(), 'Close (what was made stays)'));
    const body = [];
    if (r.phase === 'reading') body.push(el('p', { class: 'rm-note', text: 'Reading the picture here (its colors and light)…' }));
    else if (r.phase === 'ready') {
      const pal = C().pickPalette({ picture: r.palette.picture, project: r.palette.project?.colors, useProject: r.useProject });
      body.push(el('div', { class: 'rm-top' }, thumb, el('div', { class: 'rm-info' },
        swatches(r.palette.picture, 'The picture\'s colors (read here, no AI)'),
        r.words.length ? el('div', { class: 'rm-words', text: r.words.slice(0, 4).join(' · ') }) : null,
        el('div', { class: 'rm-words', text: `${a?.name || 'The director'} studies it and builds ONE new layer, "${r.name}", with sliders.` }))));
      if (r.palette.project) {
        const cb = el('input', { type: 'checkbox', class: 'rm-proj', on: { change: () => { r.useProject = cb.checked; reprice(); } } }); cb.checked = r.useProject;
        body.push(el('label', { class: 'rm-tick', title: `${r.palette.project.name}'s palette instead of the picture's` }, cb, el('span', { text: 'Use the project\'s palette' }), swatches(r.palette.project.colors, r.palette.project.name)));
      }
      if (r.source.refKey) {
        const cb = el('input', { type: 'checkbox', class: 'rm-usepic', on: { change: () => { r.usePicture = cb.checked; reprice(); } } }); cb.checked = r.usePicture;
        body.push(el('label', { class: 'rm-tick', title: 'Off: the layer borrows its feel and never shows the picture itself' }, cb, el('span', { text: 'Put the picture itself in the layer' })));
      }
      const note = el('input', { type: 'text', class: 'rm-input', placeholder: 'Anything to add? (optional)', value: r.note, on: { change: () => { r.note = note.value.trim(); reprice(); } } });
      body.push(note, el('p', { class: 'rm-cost', text: r.line || 'Estimating the cost…', title: `Nothing is sent until you click. Then ${a?.name || 'the director'} gets this message and one small picture of it.${pal.from === 'project' ? ' Palette: the project\'s.' : ''}` }),
        el('div', { class: 'rm-acts' }, btn('✦ Make the layer', 'rm-go primary', () => run(), 'One AI pass: it builds one new layer (one undo step)'), btn('Cancel', '', () => close())));
    } else if (r.phase === 'running' || r.phase === 'settling') {
      const k = r.passes.at(-1)?.kind;
      body.push(el('p', { class: 'rm-note rm-busy', attrs: { role: 'status' }, text: `${who(a, chatOf(a))} is ${k === 'make' ? 'building' : k === 'closer' ? 'taking it closer to the picture:' : 'loosening'} "${r.name}"…` }),
        el('div', { class: 'rm-acts' }, r.phase === 'running' ? btn('■ Stop', 'rm-stop', () => stop(), 'Stop the reply: what landed stays, ↶ Undo takes it back') : null));
    } else if (r.phase === 'done') {
      if (r.layer) body.push(el('div', { class: 'rm-top' }, thumb, el('div', { class: 'rm-info' }, el('div', { class: 'rm-made', text: `✓ "${r.layer.name}"${r.sliders ? ` · ${r.sliders} slider${r.sliders === 1 ? '' : 's'}` : ''}` }),
        swatches(colorsOf(r), 'Its palette'), r.extra?.length ? el('div', { class: 'rm-words', text: `It also added ${r.extra.join(', ')}.` }) : null)));
      if (r.error) body.push(el('p', { class: 'rm-note rm-err', text: r.error }));
      body.push(el('div', { class: 'rm-acts' },
        r.passes.length ? btn('↶ Undo', 'rm-undo', () => undo(), 'Put the scene back as it was before this pass (one step)') : null,
        r.layer ? btn('Closer', 'rm-closer', () => again('closer'), 'One more pass: closer to the picture (the picture goes again; cost ≈ the line above). This moves toward a copy: fine for your own pictures, not for someone else\'s.') : null,
        r.layer ? btn('Looser', 'rm-looser', () => again('looser'), 'One more pass: freer from the picture, same mood and palette') : null,
        btn('Keep', 'rm-keep', () => close(), 'Keep it and close the card')));
      if (r.layer) body.push(el('p', { class: 'rm-cost rm-again', text: 'Closer / Looser: one more pass on this layer, each its own undo step.' }));
    } else if (r.phase === 'error') body.push(el('p', { class: 'rm-note rm-err', text: r.error || 'Something went wrong.' }));
    c.replaceChildren(head, ...body);
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    if (c.parentElement !== host) host.append(c);
  }

  // ---------- the sources ----------
  function fromRef(r) {
    if (!r || r.kind !== 'image') throw new Error('Pick a picture reference.');
    return open({ path: r.path, title: r.key, refKey: r.key, from: 'ref' });
  }
  function fromBoardItem(it) {
    const path = it?.type === 'gif' ? it.poster || it.src : it?.type === 'web' || it?.type === 'video' ? it.thumb || it.poster : it?.src || it?.thumb;
    if (!path) throw new Error('Pick a picture on the board.');
    return open({ path, title: it.title || 'Board picture', from: 'board' });
  }
  const fromPath = (path, title) => open({ path, title: title || base(path), from: 'file' });
  async function pick() {
    await lab();
    const src = await LookMatch.pick();
    if (!src) return null;
    if (src.kind === 'video') throw new Error('Pick a picture (a still): this one is a clip.');
    return open({ ...src, kind: 'image' });
  }
  function findRef(name) {
    const list = ThreeLab.director?.refs?.list?.() || [];
    const n = String(name || '').toLowerCase();
    return list.find((r) => r.key.toLowerCase() === n || r.name.toLowerCase() === n) || list.find((r) => r.kind === 'image' && r.key.toLowerCase().includes(n)) || null;
  }

  // ---------- three_do references {action: "like", name}: the director asks for it itself ----------
  async function op(ref, args = {}) {
    if (!ref || ref.kind !== 'image') return { ok: false, error: 'like needs a picture reference (an image).' };
    const img = await picOf({ path: ref.path });
    const s = C().picSize({ w: img.naturalWidth, h: img.naturalHeight });
    const cv = document.createElement('canvas'); cv.width = s.w; cv.height = s.h; cv.getContext('2d').drawImage(img, 0, 0, s.w, s.h);
    const picture = await paletteOfPicture(img).catch(() => []);
    const proj = projectPalette(ThreeLab.scenes.currentId());
    const pal = C().pickPalette({ picture, project: proj?.colors, useProject: Boolean(args.project) });
    const words = await wordsOf({ path: ref.path });
    return { ok: true, images: [{ data: cv.toDataURL('image/jpeg', 0.8).split(',')[1], mime: 'image/jpeg' }],
      value: { reference: ref.key, palette: pal.colors, paletteFrom: pal.from, ...(proj ? { projectPalette: proj.colors } : {}), brief: C().toolBrief({ title: ref.key, palette: pal.colors, words, refKey: ref.key }) } };
  }

  // ---------- /like and Ctrl/⌘+K ----------
  function state() {
    const r = S.r;
    return r ? { phase: r.phase, title: r.source.title, from: r.source.from, refKey: r.source.refKey || '', agentId: r.agentId, chatId: r.chatId, sid: r.sid, name: r.name, palette: { picture: r.palette.picture.slice(), project: r.palette.project?.colors?.slice() || null }, colors: colorsOf(r), useProject: r.useProject, line: r.line, est: r.est || null, passes: r.passes.map((p) => ({ kind: p.kind, at: p.at, afterSig: p.afterSig })), layer: r.layer || null, sliders: r.sliders || 0, error: r.error || '', picPath: r.picPath || null, sent: S.sent.slice() }
      : { phase: 'idle', sent: S.sent.slice() };
  }
  function register() {
    if (typeof Commands === 'undefined' || Commands.get?.('like')) return;
    Commands.register({
      name: 'like', area: 'Three.js Lab',
      args: '[reference name | picture file] | closer | looser | undo | status',
      desc: '✦ Make a layer like this: the director studies a picture (a Lab reference, a file; alone: pick one) and builds ONE new layer in its spirit, with sliders, in the picture\'s palette (cost shown first; one undo step)',
      keywords: 'like reference picture image make a layer like this inspired by moodboard style',
      examples: ['/like sunset', '/like ~/Pictures/ref.jpg', '/like closer', '/like undo'],
      complete: (a) => [...['closer', 'looser', 'undo', 'status'], ...(((typeof ThreeLab !== 'undefined' && ThreeLab.director?.refs?.list?.()) || []).filter((r) => r.kind === 'image').map((r) => r.key))].filter((x) => x.toLowerCase().startsWith(String(a || '').toLowerCase())).map((value) => ({ value })),
      async run(args, ctx = {}) {
        const agentId = ctx?.agentId || null;
        const q = C().parse(args);
        if (q.op === 'pick') { pick().catch(err); return undefined; }
        if (q.op === 'closer' || q.op === 'looser') { await again(q.op); return undefined; }
        if (q.op === 'undo') return (await undo()) ? 'The layer is undone.' : 'Nothing to undo.';
        if (q.op === 'go') { await run(); return undefined; }
        if (q.op === 'cancel') { close(); return undefined; }
        if (q.op === 'status') { const s = state(); return s.phase === 'idle' ? 'No picture yet: /like <reference name> or /like alone to pick one.' : `✦ ${s.title} → "${s.name}" · ${s.phase}${s.layer ? ` · ${s.sliders} sliders` : ''}${s.line ? ` · ${s.line}` : ''}`; }
        const dock = H.agent(agentId)?.dock === 'three' ? agentId : null;
        if (q.op === 'file') { const path = q.path.replace(/^~(?=[\\/])/, await window.hub.fs.home()); await open({ path, title: base(path), from: 'file' }, { agentId: dock }); return undefined; }
        await lab();
        const r = findRef(q.name);
        if (!r) return `No reference "${q.name}". Pictures here: ${(ThreeLab.director.refs.list() || []).filter((x) => x.kind === 'image').map((x) => x.key).join(', ') || 'none (🖼 References › ＋ Add)'}.`;
        await open({ path: r.path, title: r.key, refKey: r.key, from: 'ref' }, { agentId: dock });
        return undefined;
      },
    });
  }
  function init() {
    register();
    if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: Make a layer like a picture… (✦ the director builds one in its spirit)', () => pick().catch(err));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return { open, run, again, undo, stop, close, state, fromRef, fromBoardItem, fromPath, pick, op, findRef, get card() { return S.card; } };
})();
window.LabRefMatch = LabRefMatch;
