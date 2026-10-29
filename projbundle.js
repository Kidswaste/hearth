// Project portability (round 75, projbundle75): a project leaves as ONE file and comes back as a new project, or is
// copied in place. Three clicks, no commands needed:
//   - Export project…   (a project's ⋯ / right-click): a card says what goes (scenes with their code, references and
//     files, boards, notes, the worktable — always), with two choices: its chats (how many, how big) and its files and
//     captures (how many, how big). Then a save dialog, a progress bar with Cancel; the file is a .hearthproject (a zip,
//     streamed: big files stored as they are). Secrets never travel (projbundle-core.js scrub / secretFile).
//   - Import project…   (Projects ⋯, or drop a .hearthproject on Projects): the file is checked first (names, sizes,
//     versions, its shape) and a card says what it will add; Import unpacks it into Hearth's own folder with a progress
//     bar and Cancel, then adds a NEW project: every scene, board, chat, reference and sequence gets a fresh id (nothing
//     you have is ever overwritten), chats are linked to their scenes and boards again, and a toast says what it
//     skipped (files that weren't on the computer it came from, a damaged file, a chat whose AI isn't here).
//   - Duplicate project (a project's ⋯): a full copy with fresh ids, named "… copy"; its scenes and boards are copies
//     (not shared), its chats copies linked to the copied scenes; the scenes' references are copied too (deleting one
//     removes its file), the owner's own files stay shared references (never copied, never touched).
// gather(p) reads a project's parts from the stores (the Lab's / boards' in-memory copies when they're loaded, status
// reads otherwise: a store that couldn't be read stops the export, it's never taken as empty); apply(body) adds them.
const ProjBundle = (() => {
  const C = ProjBundleCore;
  const P = Projects;
  const PC = ProjectsCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmt = C.fmtSize;
  const hub = () => window.hub;
  const pb = () => window.hub.projbundle;
  let busy = false;
  const last = { exported: null, imported: null, duplicated: null, skipped: [] }; // (checks) what the last run did

  // ---------- reading a project's parts ----------
  async function kv(name, d) {
    const r = await hub().kvGet(name, d, { status: true });
    if (r?.state === 'unreadable') throw new Error(`Hearth couldn't read its ${name} store just now (nothing was changed): try again in a moment`);
    return r?.state === 'ok' && r.value != null ? r.value : d;
  }
  const labIn = () => Boolean(window.Lazy?.loaded('lab') && typeof ThreeLab !== 'undefined' && ThreeLab.scenes?.okStores?.().includes('three-sketches'));
  const boardIn = () => Boolean(window.Lazy?.loaded('board') && typeof Board !== 'undefined' && Board._?.S?.index);
  async function gather(p, { files = true } = {}) {
    await P.ready();
    // the boards' pending writes go to their stores first; the scene in the editor is read as it is on screen (its code
    // typed but not saved yet), without saving it (an export never changes what it exports)
    if (boardIn()) await Board._.flush().catch(() => {});
    const items = p.items.slice();
    const w = p.workspace || {};
    const sceneIds = [...new Set([...items.filter((x) => x.type === 'scene' || x.type === 'seq').map((x) => x.ref), w.sceneId].filter(Boolean))];
    const boardIds = [...new Set([...items.filter((x) => x.type === 'board').map((x) => x.ref), w.boardId].filter(Boolean))];
    const chatIds = [...new Set([...items.filter((x) => x.type === 'chat').map((x) => x.ref), w.chatId].filter(Boolean))];
    const away = []; // things the project lists that aren't on this computer (not arrived, deleted)
    // scenes: the Lab's own copies when it's loaded (ahead of their saves), the stores otherwise
    const lab = labIn();
    const all = lab ? ThreeLab.scenes.all() : await kv('three-sketches', []);
    const [extrasAll, refsAll, notesAll, thumbsAll, mapsAll] = await Promise.all([lab ? null : kv('three-lab-extras', {}), lab ? null : kv('three-refs', {}), kv('three-notes', {}), kv('three-thumbs', {}), kv('three-beatmaps', {})]);
    const scenes = [];
    for (const id of sceneIds) {
      const sk = all.find((s) => s.id === id);
      if (!sk) { away.push(`A scene (${items.find((x) => x.ref === id)?.name || id})`); continue; }
      const extras = C.copy(lab ? ThreeLab.scenes.extrasOf(id) : extrasAll[id]) ?? null;
      const maps = {};
      if (mapsAll[`scene:${id}`]) maps[`scene:${id}`] = mapsAll[`scene:${id}`];
      const song = extras?.media?.path;
      if (song && mapsAll[song]) maps[song] = mapsAll[song];
      const sketch = C.copy(sk);
      if (lab && ThreeLab.scenes.currentId() === id) {
        try {
          const st = ThreeLab.tm?.state?.(id);
          if (Array.isArray(sketch.layers)) for (const L of sketch.layers) { const live = st?.layers?.find((x) => x.id === L.id); if (live && typeof live.code === 'string') L.code = live.code; }
          else if (typeof st?.layers?.[0]?.code === 'string') sketch.code = st.layers[0].code;
          if (Array.isArray(sketch.layers) && sketch.layers[0]) sketch.code = sketch.layers[0].code ?? sketch.code;
        } catch { /* as saved */ }
      }
      scenes.push({ id, sketch, extras, refs: C.copy(lab ? ThreeLab.refsOf(id) : refsAll[id] || []), notes: C.copy(notesAll[id] || []), thumb: thumbsAll[id]?.url ? { ...thumbsAll[id] } : (lab && ThreeLab.scenes.thumbOf(id) ? { url: ThreeLab.scenes.thumbOf(id), at: Date.now() } : null), maps });
    }
    // their sequences (the Lab sequence keeps them in video-cuts, keyed "seq:<name>", each saying its scene)
    const sequences = [];
    const ids = new Set(scenes.map((s) => s.id));
    if (window.Lazy?.loaded('lab') && typeof CutStore !== 'undefined') {
      await CutStore.editFor('seq:__probe__');
      for (const q of CutStore.sequences()) { const e = await CutStore.editFor(q.key); if (e && ids.has(e.seq?.scene)) sequences.push({ key: q.key, edit: C.copy(e) }); }
    } else {
      for (const [key, e] of Object.entries(await kv('video-cuts', {}))) if (key.startsWith('seq:') && ids.has(e?.seq?.scene)) sequences.push({ key, edit: C.copy(e) });
    }
    // boards and which chat each is linked to
    const boards = [];
    const bIndex = boardIn() ? Board._.S.index : await kv('boards', {});
    for (const id of boardIds) {
      const b = boardIn() ? await Board.load(id).catch(() => null) : await kv(`board-${id}`, null);
      if (!b?.items) { away.push(`A board (${items.find((x) => x.ref === id)?.name || id})`); continue; }
      boards.push({ id, board: C.copy(b) });
    }
    // chats: the whole conversation, which AI it's with, its scene and board
    const csLinks = (typeof ChatScenes !== 'undefined' ? ChatScenes.data?.()?.links : null) || (await kv('chat-scenes', {}))?.links || {};
    const chats = [];
    // (round 85, projbig85) a GIANT chat (≥ 8 MB on disk) isn't loaded or copied here (≈ 2 s of this thread for 60 MB):
    // it stands in by its own fields, its count, size and the paths it points at ({ __bigChat }); the export reads it
    // from its file on a thread of the main process, Duplicate copies it there (projbundlemain.js). One that can't be
    // read stops here: nothing is written, it's never taken as "no chat"
    const info = chatIds.length && pb().chats ? await pb().chats(chatIds) : {};
    for (const id of chatIds) {
      const inf = info?.[id];
      if (inf?.state === 'unreadable') throw new Error(`Hearth couldn't read the chat “${items.find((x) => x.ref === id)?.name || id}” just now (nothing was written): try again in a moment`);
      const big = inf?.state === 'big' && inf.head;
      const chat = big ? { ...inf.head, __bigChat: { id, n: inf.n, size: inf.size, paths: inf.paths || [] } } : (await Native.load?.(id).catch(() => null)) || await hub().getChat(id).catch(() => null);
      if (!chat?.messages) { away.push(`A chat (${items.find((x) => x.ref === id)?.name || id})`); continue; }
      const a = H.agent(chat.agentId);
      const scene = (typeof ChatScenes !== 'undefined' && ChatScenes.linkOf?.(id)) || csLinks[id]?.sketch || null;
      chats.push({ id, agent: { id: chat.agentId, engine: a?.engine || '', dock: a?.dock || '', name: a?.name || '' }, chat: big ? chat : C.copy(chat), scene: ids.has(scene) ? scene : null, board: bIndex?.links?.[id] || null });
    }
    for (const c of chats) if (c.board && !boards.some((b) => b.id === c.board)) c.board = null;
    // the creative worktable (one per project)
    let workbench = null;
    try { if (window.Lazy?.loaded('creative') && window.ProjectWorkspace?.current?.() === p) await WorkbenchUI.flush?.(); } catch { /* saved as it goes */ }
    workbench = /^[\w-]{1,100}$/.test(p.id) ? await kv(`workbench-${p.id}`, null) : null;
    // the project's own files (file / capture / render / download items): the paths, a render's file
    const fileItems = [];
    if (files) {
      const renders = items.some((x) => x.type === 'render') ? (await P.Src.renders()) || [] : [];
      for (const x of items.filter((y) => C.KIND_ITEMS.includes(y.type))) {
        const path = x.type === 'render' ? (renders.find((r) => r.id === x.ref)?.output || (/[\\/]/.test(x.ref) ? x.ref : null)) : x.ref;
        if (path) fileItems.push({ id: x.id, type: x.type, ref: x.ref, name: x.name || '', path });
        else away.push(`A ${x.type} (${x.name || x.ref})`);
      }
    }
    const { trash: _t, ...project } = C.copy(p);
    return { project, scenes, sequences, boards, chats, workbench, files: fileItems, away };
  }

  // ---------- a small dialog (the card, then its progress) ----------
  function dialog(title, { eyebrow = 'PROJECT' } = {}) {
    document.querySelector('dialog.pb-card')?.close();
    const body = el('div', { class: 'pb-body' });
    const status = el('p', { class: 'pb-status', attrs: { role: 'status', 'aria-live': 'polite' } });
    const bar = el('div', { class: 'pw-load-bar pb-bar', hidden: true, attrs: { role: 'progressbar', 'aria-label': title, 'aria-valuemin': '0', 'aria-valuemax': '100' } }, el('i'));
    const actions = el('div', { class: 'dialog-actions pb-actions' });
    const d = el('dialog', { class: 'ui-modal pw-wizard pb-card', attrs: { 'aria-label': title } }, el('div', { class: 'pw-eyebrow', text: eyebrow }), el('h2', { class: 'pb-title', text: title }), body, bar, status, actions);
    let onCancel = null;
    d.addEventListener('cancel', (e) => { e.preventDefault(); if (onCancel) onCancel(); else d.close(); });
    d.addEventListener('close', () => d.remove());
    document.body.append(d);
    d.showModal();
    let shown = -1;
    return {
      d, body, status,
      say(t) { if (status.textContent !== t) status.textContent = t; },
      buttons(...bs) { actions.replaceChildren(...bs); },
      onCancel(fn) { onCancel = fn; },
      progress(done, total, text) {
        bar.hidden = false;
        const pct = total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0;
        if (pct !== shown) { shown = pct; bar.firstChild.style.transform = `scaleX(${pct / 100})`; bar.setAttribute('aria-valuenow', String(pct)); }
        if (text != null) this.say(text);
      },
      close() { if (d.open) d.close(); },
    };
  }
  const button = (text, fn, cls = 'ghost') => el('button', { type: 'button', class: cls, text, on: { click: fn } });
  // the main side's progress for one job
  function listen(job, fn) {
    if (!listen.on) { listen.on = new Map(); pb().onProgress((d) => listen.on.get(d?.job)?.(d)); }
    listen.on.set(job, fn);
    return () => listen.on.delete(job);
  }

  // ---------- Export project… ----------
  async function exportProject(p) {
    if (!p) return null;
    if (busy) { toast('Another project export / import is running', { type: 'error' }); return null; }
    busy = true;
    const ui = dialog(`Export “${p.name}”`, { eyebrow: 'PROJECT / EXPORT' });
    try {
      ui.say('Looking at what it’s made of…');
      ui.buttons(button('Cancel', () => ui.close()));
      const body = await gather(p);
      const parts = C.parts(body);
      const sz = await pb().sizes({ paths: [...new Set([...parts.base, ...parts.chats])], dirs: parts.files.map((f) => f.path) });
      if (!ui.d.open) return null;
      const sizeOf = new Map(sz.files.map((f) => [f.path, f]));
      const baseBytes = parts.base.reduce((n, x) => n + (sizeOf.get(x)?.size || 0), 0);
      const chatOnly = parts.chats.filter((x) => !parts.base.includes(x));
      const chatBytes = C.chatBytes(body) + body.chats.reduce((n, c) => n + (c.chat?.__bigChat?.size || 0), 0) + chatOnly.reduce((n, x) => n + (sizeOf.get(x)?.size || 0), 0); // (round 85: a giant chat by its file's size)
      const fileFound = sz.dirs.filter((x) => x.found);
      const fileBytes = fileFound.reduce((n, x) => n + x.size, 0);
      const fileCount = fileFound.reduce((n, x) => n + (x.files || 0), 0);
      const notHere = [...sz.files.filter((f) => !f.found).map((f) => C.base(f.path)), ...sz.dirs.filter((f) => !f.found).map((f) => C.base(f.path)), ...body.away];
      const s = C.summarize(body);
      const always = [s.scenes ? `${C.plural(s.scenes, 'scene')} with their code, references and files` : '', s.sequences ? C.plural(s.sequences, 'sequence') : '', s.boards ? C.plural(s.boards, 'board') : '', s.notes || s.sceneNotes ? 'notes' : '', s.worktable ? 'the worktable' : ''].filter(Boolean);
      const chatsBox = el('input', { type: 'checkbox', checked: body.chats.length > 0, disabled: !body.chats.length, class: 'pb-chats' });
      const filesBox = el('input', { type: 'checkbox', checked: body.files.length > 0, disabled: !body.files.length, class: 'pb-files' });
      ui.body.replaceChildren(
        el('p', { class: 'pb-line', text: always.length ? `Always: ${always.join(', ')} (${fmt(baseBytes)}).` : 'Its name, look and notes.' }),
        el('label', { class: 'check pb-check' }, chatsBox, el('span', { text: body.chats.length ? `Its chats · ${C.plural(body.chats.length, 'chat')} · ${fmt(chatBytes)}` : 'Its chats · none' })),
        el('label', { class: 'check pb-check' }, filesBox, el('span', { text: body.files.length ? `Its files and captures · ${C.plural(fileCount || fileFound.length, 'file')} · ${fmt(fileBytes)}` : 'Its files and captures · none' })),
        notHere.length ? el('p', { class: 'hint pb-line', text: `Not on this computer, left out: ${notHere.slice(0, 4).join(', ')}${notHere.length > 4 ? ` and ${notHere.length - 4} more` : ''}.` }) : null,
        el('p', { class: 'hint pb-line', text: 'One .hearthproject file. Passwords, API keys and sign-ins never go in it.' }));
      ui.say('');
      const go = await new Promise((resolve) => {
        ui.buttons(button('Cancel', () => resolve(false)), button('Export…', () => resolve(true), 'primary pb-go'));
        ui.onCancel(() => resolve(false));
      });
      if (!go || !ui.d.open) { ui.close(); return null; }
      // (round 85, projbig85) a giant chat goes by its name only ({ __bigChat: { id } }): prepared on the main process's
      // thread exactly as prepare() does here (its secrets counted there)
      const bare = body.chats.map((c) => (c.chat?.__bigChat ? { ...c, chat: { __bigChat: { id: c.chat.__bigChat.id }, messages: [] } } : c));
      const prep = C.prepare({ ...body, chats: bare, away: undefined }, { chats: chatsBox.checked, files: filesBox.checked });
      const job = `ex${Date.now().toString(36)}`;
      let canceled = false;
      const stop = () => { canceled = true; pb().cancel(job).catch(() => {}); ui.say('Stopping…'); };
      ui.onCancel(stop);
      ui.buttons(button('Cancel', stop));
      ui.body.replaceChildren(el('p', { class: 'pb-line', text: 'Writing the file… (big files go in as they are)' }));
      const off = listen(job, (d) => { if (d.phase === 'write') ui.progress(d.done, d.total, `${fmt(d.done)} of ${fmt(d.total)}${d.file ? ` · ${d.file}` : ''}`); });
      let r;
      try { r = await pb().export({ body: prep.body, name: p.name, job, leftOut: prep.leftOut, secrets: prep.secrets }); } finally { off(); }
      ui.close();
      if (!r?.ok) { if (r?.canceled || canceled) toast('Export cancelled (nothing was left behind)', { timeout: 3000 }); return null; }
      last.exported = r.path;
      const skipped = [...(r.skipped || []), ...body.away];
      toast(`Exported “${p.name}” (${fmt(r.size)})${skipped.length ? ` · left out: ${C.plural(skipped.length, 'file')} not on this computer` : ''}`, { timeout: 7000, action: { label: MediaFile.revealLabel || 'Show', fn: () => MediaFile.reveal(r.path) } });
      return r;
    } catch (err) {
      ui.close();
      toast(calmError(err), { type: 'error', raw: err });
      return null;
    } finally { busy = false; }
  }

  // ---------- Import project… ----------
  async function pickFile() {
    const f = await hub().openDialog({ title: 'Import a project', properties: ['openFile'], filters: [{ name: 'Hearth project', extensions: ['hearthproject'] }] });
    return (Array.isArray(f) ? f[0] : f) || null;
  }
  async function importProject(file = null) {
    if (busy) { toast('Another project export / import is running', { type: 'error' }); return null; }
    file = file || await pickFile();
    if (!file) return null;
    busy = true;
    const ui = dialog('Import a project', { eyebrow: 'PROJECT / IMPORT' });
    let dir = null; let parts = null; // (round 85) parts: its giant chats' messages, waiting on the main side (released after)
    try {
      ui.say('Checking the file…');
      ui.buttons(button('Cancel', () => ui.close()));
      const pv = await pb().peek(file);
      if (!ui.d.open) return null;
      if (!pv?.ok) {
        ui.body.replaceChildren(el('p', { class: 'pb-line', text: `${C.base(file)} can't be imported:` }), el('ul', { class: 'pb-list pb-problems' }, ...(pv?.problems || ['It can\'t be read.']).map((t) => el('li', { text: t }))), el('p', { class: 'hint pb-line', text: 'Nothing was added or changed.' }));
        ui.say('');
        ui.buttons(button('Close', () => ui.close(), 'primary'));
        last.problems = pv?.problems || [];
        return null;
      }
      ui.d.querySelector('.pb-title').textContent = `Import “${pv.manifest.name}”`;
      ui.body.replaceChildren(
        el('p', { class: 'hint pb-line', text: `${pv.from} · ${fmt(pv.size)}` }),
        el('ul', { class: 'pb-list pb-adds' }, ...pv.lines.map((t) => el('li', { text: t }))),
        el('p', { class: 'hint pb-line', text: 'It comes in as a new project with its own copies: nothing you have is changed or replaced.' }));
      ui.say('');
      const go = await new Promise((resolve) => {
        ui.buttons(button('Cancel', () => resolve(false)), button('Import as a new project', () => resolve(true), 'primary pb-go'));
        ui.onCancel(() => resolve(false));
      });
      if (!go || !ui.d.open) { ui.close(); return null; }
      const job = `im${Date.now().toString(36)}`;
      let canceled = false;
      const stop = () => { canceled = true; pb().cancel(job).catch(() => {}); ui.say('Stopping…'); };
      ui.onCancel(stop);
      ui.buttons(button('Cancel', stop));
      const off = listen(job, (d) => { if (d.phase === 'unpack') ui.progress(d.done, d.total, `Unpacking ${fmt(d.done)} of ${fmt(d.total)}${d.file ? ` · ${d.file}` : ''}`); });
      let r;
      try { r = await pb().unpack({ file, job }); } finally { off(); }
      if (!r?.ok) {
        ui.close();
        if (r?.canceled || canceled) toast('Import cancelled (nothing was added)', { timeout: 3000 });
        else toast(`Couldn't import it: ${(r?.problems || ['it can\'t be read'])[0]}`, { type: 'error' });
        return null;
      }
      dir = r.dir; parts = r.parts || null;
      ui.onCancel(() => {}); ui.buttons();
      ui.say('Adding its scenes, boards and chats…');
      const res = await apply(r.body, { mode: 'import', parts });
      ui.close();
      const skipped = [...(r.skipped || []), ...res.skipped];
      last.imported = res.project.id; last.skipped = skipped;
      done(res.project, `Imported “${res.project.name}”: ${PC.countText(res.project)}`, skipped, { show: true });
      return res.project;
    } catch (err) {
      ui.close();
      if (dir) pb().discard(dir).catch(() => {});
      toast(calmError(err), { type: 'error', raw: err });
      return null;
    } finally { busy = false; if (parts) pb().release?.(parts).catch?.(() => {}); }
  }
  // the toast after an import / a copy: what it made, what it skipped (Details lists them all)
  function done(p, text, skipped, { show = false } = {}) {
    const action = skipped.length ? { label: 'What was skipped', fn: () => Modal.alert(`Skipped in “${p.name}”`, skipped.map((s) => `· ${s}`).join('\n')) } : { label: 'Open', fn: () => P.openHome(p.id) };
    toast(`${text}${skipped.length ? ` · skipped ${skipped.length}` : ''}`, { timeout: 9000, action });
    if (show) P.openHome(p.id).catch?.(() => {});
  }

  // ---------- Duplicate project ----------
  async function duplicateProject(p) {
    if (!p) return null;
    if (busy) { toast('Another project export / import is running', { type: 'error' }); return null; }
    busy = true;
    try {
      toast(`Copying “${p.name}”…`, { timeout: 2500 });
      const body = await gather(p, { files: false });
      delete body.project.make; delete body.project.mkName;
      const res = await apply(body, { mode: 'duplicate', suffix: ' copy' });
      const skipped = [...body.away, ...res.skipped];
      last.duplicated = res.project.id; last.skipped = skipped;
      done(res.project, `“${res.project.name}”: ${PC.countText(res.project)}`, skipped);
      return res.project;
    } catch (err) {
      toast(calmError(err), { type: 'error', raw: err });
      return null;
    } finally { busy = false; }
  }

  // ---------- adding a body as a new project ----------
  async function labReady() {
    await window.Lazy?.load('lab');
    await ThreeLab.cmd({ show: false });
    for (let i = 0; i < 100 && !ThreeLab.scenes?.adoptScene; i += 1) await sleep(50);
    if (!ThreeLab.scenes?.adoptScene) throw new Error('The Lab is still starting: try again in a moment');
    if (ThreeLab.scenes.blocked?.()) throw new Error('The Lab couldn\'t read its scenes just now (nothing was changed): try again in a moment');
  }
  // the AI a chat goes with here: the same one, else one of the same kind (engine, docked tool), else Claude
  function agentFor(c) {
    const same = H.agent(c.chat?.agentId);
    if (same) return { agent: same, moved: false };
    const kind = H.agents().find((a) => a.mode === 'native' && (a.engine || '') === (c.agent?.engine || '') && (a.dock || '') === (c.agent?.dock || ''))
      || (c.agent?.dock && typeof Tools !== 'undefined' ? Tools.dockedAgent?.(c.agent.dock) : null)
      || H.agents().find((a) => a.mode === 'native' && (a.engine || '') === (c.agent?.engine || '') && !a.dock)
      || H.claudeAgent();
    return { agent: kind, moved: true };
  }
  // body (this computer's paths) → a new project. mode: 'import' | 'duplicate'; suffix for the copies' names
  // (round 85, projbig85) a chat written on the main side, put in the chats list as Native's save does (its summary;
  // the chat itself loads from disk when opened, like any chat not opened yet)
  function listChat(chat) {
    const summary = { id: chat.id, agentId: chat.agentId, title: chat.title, updatedAt: chat.updatedAt, pinned: Boolean(chat.pinned), model: chat.model, ...(chat.engine ? { engine: chat.engine } : {}) };
    H.chats = [summary, ...(H.chats || []).filter((x) => x.id !== chat.id)];
    try { if (typeof Panel !== 'undefined') (Panel.soon || Panel.render)(); } catch { /* the list draws later */ }
  }
  // (round 85, projbig85) parts: the import's giant chats' messages waiting on the main side (unpack's r.parts)
  async function apply(body0, { mode = 'import', suffix = '', parts = null } = {}) {
    await P.ready();
    // (round 85, projbig85) only what is changed here is copied (each chat's entry and own fields): remap copies the rest;
    // a whole JSON copy of the body first was a 30–50 ms piece of a long task for a project of 760 things
    const body = { ...body0, chats: (body0.chats || []).map((c) => ({ ...c, chat: c.chat && typeof c.chat === 'object' ? { ...c.chat } : c.chat })) };
    const skipped = [];
    const made = { scenes: [], chats: [], boards: [] };
    const hasScenes = (body.scenes || []).length || (body.sequences || []).length;
    if (hasScenes) await labReady();
    // chats: which AI here
    for (const c of body.chats || []) {
      const { agent, moved } = agentFor(c);
      if (!agent) { skipped.push(`The chat “${c.chat?.title || 'chat'}” (no AI to put it with)`); c.drop = true; continue; }
      if (moved) skipped.push(`The chat “${c.chat?.title || 'chat'}” is now with ${agent.name} (${c.agent?.name || 'its AI'} isn't here)`);
      c.chat.agentId = agent.id;
    }
    body.chats = (body.chats || []).filter((c) => !c.drop);
    // boards first: the board keeps its own id format (Board.create)
    const boardIds = new Map();
    if ((body.boards || []).length) {
      await window.Lazy?.load('board');
      await Board.ready();
      for (const x of body.boards) {
        const n = await Board.create(`${String(x.board.name || 'Board').slice(0, 60 - suffix.length)}${suffix}`, { quiet: true, open: false });
        boardIds.set(x.id, n.id); made.boards.push(n.id);
      }
    }
    // fresh ids for everything else, checked against what exists
    const sceneTaken = new Set(hasScenes ? ThreeLab.scenes.all().map((s) => s.id) : []);
    const chatTaken = new Set((H.chats || []).map((c) => c.id));
    const seqTaken = new Set();
    if ((body.sequences || []).length) { await CutStore.editFor('seq:__probe__'); for (const q of CutStore.sequences()) seqTaken.add(q.key); }
    let n = 0;
    const fresh = (pre, taken) => { let id; do { id = `${pre}${Date.now().toString(36)}${(n++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`; } while (taken.has(id)); taken.add(id); return id; };
    const ids = {
      project: () => { let id; do { id = PC.newId(); } while (P.get(id) || P.trashed().some((x) => x.id === id)); return id; },
      scene: () => fresh('s', sceneTaken),
      board: (old) => boardIds.get(old),
      chat: (_old, agentId) => fresh(`${agentId}-`, chatTaken),
      ref: () => fresh('r', new Set()), note: () => fresh('n', new Set()),
      seqKey: (name) => { let k = `seq:${name}`; for (let i = 2; seqTaken.has(k); i += 1) k = `seq:${name} ${i}`; seqTaken.add(k); return k; },
    };
    const { body: b, map, dropped } = C.remap(body, { ids, suffix });
    skipped.push(...dropped);
    try {
      // scenes (a duplicate's references are copied: removing a reference deletes its file)
      for (const s of b.scenes || []) {
        if (mode === 'duplicate') for (const r of s.refs || []) { try { const np = await hub().importRef(r.path); if (np) r.path = np; } catch { /* the original stays shared */ } }
        if (mode === 'import') s.refs = (s.refs || []).filter((r) => { if (r.path) return true; skipped.push(`The reference ${r.name || r.key} of “${s.sketch.name}” (its file wasn't in the file)`); return false; });
        const x = ThreeLab.scenes.adoptScene({ sketch: s.sketch, extras: s.extras, refs: s.refs, notes: s.notes, thumb: s.thumb, maps: s.maps });
        if (!x) throw new Error(`The scene “${s.sketch?.name}” couldn't be added`);
        made.scenes.push(x.id);
      }
      for (const q of b.sequences || []) await CutStore.storeEdit(q.key, q.edit, mode === 'duplicate' ? 'Copied with its project' : 'Imported with its project');
      if ((b.sequences || []).length) await window.ThreeSeq?.list?.().catch?.(() => {});
      // boards: their content into the boards made above
      for (const x of b.boards || []) {
        const nb = await Board.load(x.id);
        const { id: _i, name: _n, ...rest } = x.board;
        Object.assign(nb, rest, { id: x.id, name: nb.name, chats: x.board.chats || [], updated: Date.now() });
        await Board.save(nb, { now: true });
      }
      // chats: saved, known to the chats list, linked to their scene and board again
      for (const c of b.chats || []) {
        const chat = { ...c.chat, id: c.id, session: {} };
        const big = chat.__bigPart || chat.__bigChat;
        if (big) {
          // (round 85, projbig85) a giant chat: written by the store thread from its own fields (as made here) and its
          // messages (the import's part / the original chat), byte for byte the whole save below; only listed here
          delete chat.__bigPart; delete chat.__bigChat;
          const r = await pb().adopt(c.chat.__bigPart ? { job: parts, part: big.key, id: chat.id, head: chat } : { chat: big.id, id: chat.id, head: chat });
          if (!r?.ok) throw new Error(r?.error || `The chat “${chat.title || 'chat'}” couldn't be added`);
          made.chats.push(chat.id);
          listChat(chat);
        } else {
          const r = await hub().saveChat(chat);
          if (r?.error) throw new Error(r.error);
          made.chats.push(chat.id);
          Native.adopt(chat, { openIt: false });
        }
        if (c.scene && typeof ChatScenes !== 'undefined') ChatScenes.link(chat.id, c.scene, { rename: false });
        if (c.board && typeof Board !== 'undefined' && window.Lazy?.loaded('board')) Board.linkChat(chat.id, c.board);
      }
      // the worktable
      if (b.workbench != null && /^[\w-]{1,100}$/.test(map.project)) {
        const key = `workbench-${map.project}`;
        const was = await hub().kvGet(key, null, { status: true });
        if (was?.state === 'missing') await hub().kvSet(key, b.workbench);
      }
      // the project itself, last (until here nothing points at the new things)
      const bp = b.project;
      const items = [];
      for (const x of bp.items || []) {
        if (C.KIND_ITEMS.includes(x.type) && !x.ref) { skipped.push(`A ${x.type}${x.name ? ` (${x.name})` : ''}: its file wasn't in the file`); continue; }
        if (x.type === 'chat' && !made.chats.includes(x.ref)) continue;
        items.push({ type: x.type, ref: x.ref, name: x.name, at: x.at });
      }
      const p = P.create({ id: map.project, name: bp.name, notes: bp.notes || '', from: 'hand', items, at: bp.at || Date.now(), ...(mode === 'import' && bp.ident ? { ident: bp.ident } : {}) });
      if (bp.status && bp.status !== 'active') P.setStatus(p, bp.status === 'archived' ? 'active' : bp.status);
      if (bp.cover && p.items.some((x) => x.id === bp.cover)) P.setCover(p, bp.cover);
      if (bp.workspace && typeof bp.workspace === 'object') P.setWorkspace(p, bp.workspace);
      await P.flush();
      return { project: p, map, skipped };
    } catch (err) {
      // what was added before the failure goes back (scenes to the Lab's deleted, chats to the trash)
      for (const id of made.scenes) { try { ThreeLab.scenes.remove(id); } catch { /* kept */ } }
      for (const id of made.chats) { try { await hub().deleteChat(id); } catch { /* kept */ } }
      throw err;
    }
  }

  // ---------- drop a .hearthproject on Projects ----------
  const isBundle = (name) => /\.hearthproject$/i.test(String(name || ''));
  function dropFiles(files) {
    const f = [...(files || [])].find((x) => isBundle(x.name));
    if (!f) return false;
    let path = f.path || '';
    try { path = window.hub.pathForFile?.(f) || path; } catch { /* not a File from a drop (a path given by hand) */ }
    if (!path) return false;
    importProject(path);
    return true;
  }

  return { exportProject, importProject, duplicateProject, gather, apply, dropFiles, isBundle, last, busy: () => busy };
})();
window.ProjBundle = ProjBundle;
