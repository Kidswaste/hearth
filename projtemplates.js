// (round 129, next129) Save a project as a template (docs/upgrades/next129.md). Lazy group "projtemplates" (after
// "projects"; loaded by the project menu's "Save as a template…" row and by the new-project card's Start from list).
//   · what it keeps: the project's main scene (its layers, sliders, music links), its palette, size and frame rate, its
//     brief's look and steps; the song or footage only when "Include the song" is ticked; the moodboard's notes and
//     pictures only when that is ticked. A name, and a cover picture from a frame (the Lab's, or the scene's still).
//   · where it lives: a Lab template (data/templates/<id>/template.json, labtemplates' own folder and writer, with a
//     `project` part), so it syncs like the Lab's templates, its pictures and song travel in its files/, and it is in
//     the Lab's 📐 My templates too.
//   · where it shows: ＋ New project › Start from › My templates (projcreate.js), with its cover. Starting from it makes a
//     new project with fresh ids (projcreate.js prepare); its ✕ asks first, then the folder goes to the Trash.
window.ProjTemplates = (() => {
  const P = () => Projects;
  const FORMAT = 'hearth-template';
  const TOKEN = 'tpl:';
  const last = { saved: null, removed: null }; // (checks)
  const calm = (err) => (window.calmError ? calmError(err) : String(err?.message || err));
  const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sepOf = (p) => (/^[A-Za-z]:\\/.test(p) || (String(p).includes('\\') && !String(p).includes('/')) ? '\\' : '/');
  const join = (a, ...b) => [String(a).replace(/[\\/]+$/, ''), ...b].join(sepOf(a));
  let rootDir = null;
  async function root() {
    if (rootDir) return rootDir;
    const att = await window.hub.attachmentsDir();
    rootDir = join(String(att).replace(/[\\/]attachments[\\/]?$/, ''), 'templates');
    return rootDir;
  }
  // a template's own file ("tpl:files/<name>") → this computer's path in its folder
  const resolve = (t, s) => (typeof s === 'string' && s.startsWith(TOKEN) && /^files\/[^/\\]+$/.test(s.slice(TOKEN.length)) ? join(t.dir, ...s.slice(TOKEN.length).split('/')) : s);

  // ---------- the list: the Lab's templates that hold a project part (no Lab needed to read them) ----------
  let cache = null;
  async function list({ fresh = false } = {}) {
    if (cache && !fresh) return cache;
    const r = await root();
    let dirs = [];
    try { dirs = (await window.hub.fs.list(r)).filter((x) => x.isDir && !x.name.startsWith('.')); } catch { dirs = []; }
    const out = await Promise.all(dirs.map(async (x) => {
      let raw = null;
      try { raw = JSON.parse(await window.hub.fs.read(join(x.path, 'template.json'))); } catch { return null; }
      if (raw?.format !== FORMAT || !raw.project || typeof raw.project !== 'object' || !Array.isArray(raw.scene?.layers)) return null;
      let cover = null; // (a template saved without a picture has no thumb.jpg: looked for, never read blind)
      try { if ((await window.hub.fs.list(x.path)).some((f) => f.name === 'thumb.jpg')) { const b = await window.hub.fs.read(join(x.path, 'thumb.jpg'), { encoding: 'base64' }); if (b) cover = `data:image/jpeg;base64,${b}`; } } catch { cover = null; }
      return { id: raw.id, name: raw.name || 'My template', at: raw.updatedAt || raw.at || 0, dir: x.path, cover, project: raw.project, layers: raw.scene.layers.length, song: raw.scene.extras?.media?.path || null };
    }));
    cache = out.filter(Boolean).sort((a, b) => b.at - a.at);
    return cache;
  }
  const get = (id) => (cache || []).find((t) => t.id === id) || null;
  // one line about what a template brings
  function describe(t) {
    const pr = t?.project || {};
    return [`${t.layers || 0} layer${t.layers === 1 ? '' : 's'}`, pr.palette?.length ? `${pr.palette.length} colors` : '', pr.frame || '', pr.fps ? `${pr.fps} fps` : '', pr.song && t.song ? 'the song' : '',
      pr.board?.pictures?.length ? `${pr.board.pictures.length} picture${pr.board.pictures.length === 1 ? '' : 's'}` : '', pr.board?.notes?.length ? `${pr.board.notes.length} note${pr.board.notes.length === 1 ? '' : 's'}` : '',
      pr.brief?.steps?.length ? `${pr.brief.steps.length} brief steps` : ''].filter(Boolean).join(' · ');
  }
  // what the new-project card takes from it (the owner can still change each)
  const cardPatch = (t) => ({ palette: (t.project?.palette || []).slice(0, 16), paletteName: t.project?.palette?.length ? 'From the template' : '', ...(t.project?.frame ? { frame: t.project.frame } : {}), ...(Number(t.project?.fps) ? { fps: Number(t.project.fps) } : {}) });

  // ---------- the project's parts ----------
  const lastRef = (p, type) => (p.items || []).filter((x) => x.type === type).sort((a, b) => (b.at || 0) - (a.at || 0))[0]?.ref || null;
  const sceneOf = (p) => p.workspace?.sceneId || lastRef(p, 'scene');
  const boardOf = (p) => p.workspace?.boardId || lastRef(p, 'board');
  const prefs = (p) => (p.prefs && typeof p.prefs === 'object' ? p.prefs : {});
  const kv = async (name, d) => { try { return (await window.hub.kvGet(name, d)) ?? d; } catch { return d; } };
  const isMedia = (r) => ['video', 'audio', 'sound'].includes(r?.kind) || /\.(mp4|webm|mov|m4v|mkv|wav|mp3|ogg|oga|flac|m4a|aac|opus|aiff?)$/i.test(String(r?.path || ''));
  // the template, made from the project as it is now
  async function build(p, { name, song = false, board = false } = {}) {
    const sid = sceneOf(p);
    if (!sid) throw Error('This project has no scene yet: make one, then save it as a template.');
    await Lazy.load('labtemplates');
    const S = ThreeLab.scenes;
    for (let i = 0; i < 50 && !S.get(sid); i += 1) await sleep(100);
    const x = S.get(sid);
    if (!x) throw Error('The project’s scene isn’t here yet (still arriving from the other computer?).');
    const onScreen = S.currentId?.() === sid && ThreeLab.director?.refs?.list;
    const refs = (onScreen ? ThreeLab.director.refs.list() : (await kv('three-refs', {}))?.[sid] || []).map((r) => ({ key: r.key, name: r.name, kind: r.kind, path: r.path }));
    const extras = clone(S.extrasOf?.(sid) || {}) || {};
    const ws = p.workspace || {};
    const frame = prefs(p).aspect || ws.frame || S.frameOf?.(sid) || '16:9';
    const tl = S.timelineOf?.(sid) || null;
    const fps = Number(prefs(p).fps || ws.fps || tl?.fps || 30);
    const palette = (x.palette?.length ? x.palette : ws.palette || []).slice(0, 16);
    if (!song) delete extras.media;
    extras.frame = frame;
    if (tl) extras.timeline = { len: tl.len || 10, fps };
    const scene = { name: x.name, layers: clone(S.layersOf(x)), palette, extras, refs: song ? refs : refs.filter((r) => !isMedia(r)) };
    const fields = TemplateCore.extract(scene, { scan: ThreeTweaks.scan });
    const pr = { v: 1, from: p.name, palette, frame, fps, song: Boolean(song && extras.media?.path) };
    const B = window.ProjectBrief;
    let b = null; try { b = B?.get?.(p.id) || null; } catch { b = null; }
    if (b && (b.look || b.steps?.length)) pr.brief = { look: String(b.look || ''), steps: (b.steps || []).map(String).slice(0, 12) };
    const bid = board && boardOf(p);
    if (bid) {
      await Lazy.load('board');
      const bd = await Board.load(bid);
      const items = bd?.items || [];
      pr.board = {
        notes: items.filter((it) => (it.type === 'note' || it.type === 'text') && String(it.text || '').trim()).map((it) => String(it.text).slice(0, 2000)).slice(0, 40),
        pictures: items.filter((it) => (it.type === 'image' || it.type === 'gif') && it.src).map((it) => ({ path: it.src, title: it.title || '' })).slice(0, 40),
      };
    }
    const t = TemplateCore.make(scene, fields, { name: name || p.name, desc: `A project template from “${p.name}”` });
    t.project = pr;
    return t;
  }
  async function save(p, { name = '', song = false, board = false, cover = null } = {}) {
    const t = await build(p, { name: String(name || '').trim() || p.name, song, board });
    const r = await LabTemplates.saveMade(t, cover || swatchCover(t.project.palette, t.name)); // (no frame: its palette as the picture)
    cache = null;
    last.saved = { ...r, project: p.id, song: t.project.song, board: Boolean(t.project.board), cover: Boolean(cover) };
    toast(`📐 “${r.name}” is a template: ＋ New project › Start from › My templates`, { timeout: 5000 });
    return last.saved;
  }

  // ---------- the cover: a frame ----------
  // a picture made small (a jpeg about 480 px wide), the way the Lab's templates keep theirs
  function small(url, w = 480) {
    return new Promise((res) => {
      if (!url) { res(null); return; }
      const img = new Image();
      img.onload = () => { try { const s = Math.min(1, w / (img.naturalWidth || w)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.86)); } catch { res(null); } };
      img.onerror = () => res(null);
      img.src = url;
    });
  }
  // no frame to use: a picture of its palette, in stripes, with its name (so every template has a cover)
  function swatchCover(palette, name) {
    try {
      const c = document.createElement('canvas'); c.width = 480; c.height = 270;
      const g = c.getContext('2d'); const cols = palette?.length ? palette : ['#1b1035', '#5b2a86', '#f15bb5'];
      cols.forEach((h, i) => { g.fillStyle = h; g.fillRect(Math.floor(i * 480 / cols.length), 0, Math.ceil(480 / cols.length), 270); });
      g.fillStyle = '#000a'; g.fillRect(0, 200, 480, 70); g.fillStyle = '#fff'; g.font = '600 26px system-ui, sans-serif'; g.fillText(String(name || '').slice(0, 30), 18, 245);
      return c.toDataURL('image/jpeg', 0.86);
    } catch { return null; }
  }
  // the scene's still (no Lab opened for it)
  function stillOf(p) {
    const sid = sceneOf(p);
    try { return (sid && window.Lazy?.loaded?.('lab') && ThreeLab.scenes?.thumbOf?.(sid)) || window.ChatScenes?.thumbOf?.(p.workspace?.chatId) || null; } catch { return null; }
  }
  // the Lab's picture now, its main scene opened first when it isn't on screen
  async function frameOf(p) {
    const sid = sceneOf(p);
    if (!sid) throw Error('This project has no scene yet.');
    const here = () => window.Lazy?.loaded?.('lab') && ThreeLab.onScreen?.() && ThreeLab.scenes?.currentId?.() === sid;
    if (!here()) {
      if (p.workspace?.sceneId === sid) await ProjectWorkspace.open(p.id, 'scene'); else await P().openScene(sid);
      for (let i = 0; i < 40 && !here(); i += 1) await sleep(150);
      await sleep(600); // (its first frames drawn)
    }
    let url = null;
    for (let i = 0; i < 2 && !url; i += 1) url = await ThreeLab.shot();
    if (!url) throw Error('Nothing is drawing in the Lab yet: try again in a moment.');
    return small(url);
  }

  // ---------- the card: Share & keep › Save as a template… ----------
  let dlg = null;
  async function saveDialog(p) {
    if (!p) return null;
    dlg?.close();
    const sid = sceneOf(p);
    let song = null;
    try { song = window.Lazy?.loaded?.('lab') ? ThreeLab.scenes.songOf?.(sid) : (await kv('three-lab-extras', {}))?.[sid]?.media?.path; } catch { song = null; }
    const st = { cover: await small(stillOf(p)), song: false, board: false };
    const d = el('dialog', { class: 'ui-modal ptpl', attrs: { 'aria-label': 'Save as a template' } });
    const name = el('input', { value: p.name, maxLength: 80, required: true, attrs: { 'aria-label': 'Template name' } });
    const img = el('div', { class: 'ptpl-cover' });
    const status = el('p', { class: 'hint ptpl-status', attrs: { role: 'status' } });
    const paintCover = () => img.replaceChildren(st.cover ? el('img', { src: st.cover, alt: 'Cover' }) : el('span', { text: 'No picture yet' }));
    const tick = (label, title, key, disabled = false) => el('label', { class: 'check', title }, el('input', { type: 'checkbox', disabled, on: { change: (e) => { st[key] = e.target.checked; } } }), ` ${label}`);
    const btn = (text, title, fn, cls = 'ghost small') => el('button', { type: 'button', class: cls, text, title, on: { click: async (e) => { const b = e.currentTarget; b.disabled = true; try { await fn(); } catch (err) { status.textContent = calm(err); } finally { b.disabled = false; } } } });
    const saveBtn = el('button', { type: 'submit', class: 'primary', text: 'Save template' });
    const form = el('form', {},
      el('h2', { text: 'Save as a template' }),
      el('p', { class: 'hint', text: 'Keeps the main scene, its palette, size and frame rate, and the brief’s look and steps. Start a new project from it in ＋ New project › Start from › My templates.' }),
      el('label', { class: 'pw-field' }, el('span', { text: 'Name' }), name),
      el('div', { class: 'ptpl-row' }, img, el('div', { class: 'ptpl-side' }, el('span', { class: 'pcw-label', text: 'Cover picture' }),
        btn('📷 Use a frame from the Lab', 'The Lab’s picture now (its main scene opens if it isn’t on screen)', async () => { status.textContent = 'Taking a frame…'; st.cover = await frameOf(p); paintCover(); status.textContent = 'The cover is this frame.'; }))),
      tick(song ? `Include the song (${String(song).split(/[\\/]/).pop()})` : 'Include the song (this scene has none)', 'Its song or footage is copied into the template', 'song', !song),
      boardOf(p) ? tick('Include the moodboard’s notes and pictures', 'Its notes and pictures are copied into the template', 'board') : null,
      status,
      el('div', { class: 'dialog-actions' }, btn('Cancel', 'Close without saving', () => d.close()), saveBtn));
    form.onsubmit = async (e) => {
      e.preventDefault();
      saveBtn.disabled = true; status.textContent = 'Saving the template…';
      try { await save(p, { name: name.value, song: st.song, board: st.board, cover: st.cover }); d.close(); } catch (err) { status.textContent = calm(err); } finally { saveBtn.disabled = false; }
    };
    paintCover();
    d.append(form);
    d.onclose = () => { d.remove(); if (dlg === d) dlg = null; };
    document.body.append(d);
    dlg = d;
    d.showModal();
    name.select();
    return d;
  }

  // ---------- delete: asks first, then the folder goes to the Trash ----------
  async function remove(t, { ask = true } = {}) {
    if (!t?.dir) return false;
    if (ask && !(await Modal.confirm('Delete this template?', `“${t.name}” goes to the Trash, with its cover, song and pictures. Projects you made from it stay as they are.`, { ok: 'Move to Trash', danger: true }))) return false;
    const kept = await window.UndoAll?.keepFiles?.([t.dir]);
    const r = await window.hub.fs.trash([t.dir]);
    if (r?.failed?.length) throw Error(`It couldn’t go to the Trash: ${r.failed[0].error || 'unknown reason'}. Nothing was deleted.`);
    window.UndoAll?.deleted?.(kept, { what: 'template', name: t.name });
    cache = null;
    if (typeof LabTemplates !== 'undefined') LabTemplates.list({ fresh: true }).catch(() => {});
    last.removed = { id: t.id, name: t.name };
    toast(`📐 “${t.name}” is in the Trash`, { timeout: 3500 });
    return true;
  }

  // ---------- starting a project from one (projcreate.js) ----------
  // its song or footage, copied next to the chats' attachments (the project keeps it if the template goes)
  async function mediaCopy(t) {
    if (!t?.project?.song || !t.song) return null;
    const src = resolve(t, t.song);
    const att = await window.hub.attachmentsDir();
    const dst = join(att, `${Date.now().toString(36)}-${String(src).split(/[\\/]/).pop()}`);
    try { await window.hub.fs.copy(src, dst); return dst; } catch (err) { toast(`The template’s song: ${calm(err)}`, { type: 'error' }); return null; }
  }
  // the scene's layers with fresh ids (the main one stays "main"), and its extras' per-layer parts moved with them
  function freshLayers(layers, extras = {}) {
    const map = new Map();
    const Ls = (layers || []).map((L, i) => { const id = L.id === 'main' ? 'main' : ThreeLayers.newId(); map.set(L.id, id); return ThreeLayers.defaults({ ...clone(L), id, slot: L.slot ?? i }); });
    const ex = clone(extras) || {};
    for (const k of ['frame', 'timeline', 'media', 'midi', 'selectedLayer']) delete ex[k];
    if (ex.layers && typeof ex.layers === 'object') ex.layers = Object.fromEntries(Object.entries(ex.layers).filter(([k]) => map.has(k)).map(([k, v]) => [map.get(k), v]));
    return { layers: Ls, extras: ex };
  }
  // the moodboard's notes and pictures onto the new project's moodboard (pictures copied into it, as a drop does)
  async function fillBoard(p, t) {
    const bd = t?.project?.board;
    const bid = p.workspace?.boardId;
    if (!bd || !bid) return 0;
    await Lazy.load('board');
    const b = await Board.load(bid);
    if (!b) return 0;
    const pics = (bd.pictures || []).map((x) => resolve(t, x.path)).filter(Boolean);
    if (pics.length) await Board.addFiles(pics, null, b);
    for (const n of bd.notes || []) Board.addNote(n, undefined, {}, b);
    return pics.length + (bd.notes || []).length;
  }
  // the brief's look and steps: ProjectBrief.seed when it has one; otherwise the project's notes carry them (the
  // brief reads the notes as the owner's intent when it's prepared)
  async function fillBrief(p, t) {
    const br = t?.project?.brief;
    if (!br || !(br.look || br.steps?.length)) return null;
    const B = window.ProjectBrief;
    if (typeof B?.seed === 'function') { try { await B.seed(p.id, { look: br.look, steps: br.steps }); return 'brief'; } catch (err) { console.warn('template brief', err); } }
    const text = [`From the template “${t.name}”.`, br.look ? `Look: ${br.look}` : '', br.steps?.length ? `Steps:\n${br.steps.map((s) => `- ${s}`).join('\n')}` : ''].filter(Boolean).join('\n');
    P().setNotes(p, [p.notes, text].filter(Boolean).join('\n\n'));
    return 'notes';
  }

  return { list, get, describe, cardPatch, save, saveDialog, build, remove, frameOf, small, resolve, mediaCopy, freshLayers, fillBoard, fillBrief, get last() { return last; } };
})();
