// (round 128, projcreate128) The new-project card, with more ways to start and the AI's help at the start
// (docs/upgrades/projcreate128.md). Lazy group "projcreate": ProjectWorkspace.wizard() loads it and hands over.
// Fast by default: a name and Create project ↗ still make the project (chat, scene, moodboard) as before. Everything
// else is optional, in four labelled parts that open with a click:
//   Start from       an empty scene, one of the Lab's starting points (audio visualizer, particles, shader art, kinetic
//                    type, 3D model showcase, footage + effects: tools/three-gallery-data.js), a copy of one of my
//                    scenes, one of my Lab templates (labtemplates), or Duplicate a project… (projbundle); then,
//                    optionally, one of my recipes (labrecipes) played on the new scene
//   Music & footage  a song (the scene's song: the Lab analyses it as the project opens), footage, or skip
//   Look             pictures for the moodboard (dropped or picked), a palette (click one, paste a Coolors link or hex
//                    codes, or ✦ Suggest a palette from the pictures: on this computer, no AI), the frame size and rate
//   AI               who directs (Claude or Astra), the personality, "Let the AI look at the moodboard" (consent) and
//                    "Let the AI prepare a brief" (on when there's a song or pictures; ProjectBrief, aiprep128)
// Remembered on this computer: the last size, frame rate and AI. Nothing is uploaded or installed; the only AI calls are
// ✦ Suggest a name (on click) and the brief (with its tick).
window.ProjCreate = (() => {
  const C = ProjCreateCore;
  const KEY = 'projcreate.last';
  const P = () => Projects;
  const PW = () => ProjectWorkspace;
  const last = { made: null, brief: null, steps: [] }; // (checks) what the last Create did
  let card = null; // the open card's { d, st, paint }

  const pathOf = (f) => { let p = ''; try { p = window.hub.pathForFile?.(f) || ''; } catch { /* not a File from a drop */ } return p || (typeof f?.path === 'string' ? f.path : ''); };
  const chip = (text, title, on, fn, cls = '') => el('button', { type: 'button', class: `pcw-chip${on ? ' on' : ''}${cls ? ` ${cls}` : ''}`, text, title, attrs: { 'aria-pressed': on ? 'true' : 'false' }, on: { click: fn } });
  const button = (text, title, fn, cls = 'ghost small') => el('button', { type: 'button', class: cls, text, title, on: { click: async (e) => { const b = e.currentTarget; b.disabled = true; try { await fn(); } catch (err) { toast(calmError(err), { type: 'error' }); } finally { b.disabled = false; } } } });
  const swatches = (cols) => el('span', { class: 'pcw-swatches', attrs: { 'aria-hidden': 'true' } }, cols.slice(0, 8).map((c) => el('i', { style: { background: c } })));
  const fileRow = (label, path, clear) => el('div', { class: 'pcw-file' }, el('span', { text: `${label} ${C.base(path)}`, title: path }), el('button', { type: 'button', class: 'pcw-x', text: '✕', title: 'Remove', attrs: { 'aria-label': `Remove ${C.base(path)}` }, on: { click: clear } }));
  const pick = async (title, name, exts, multi = false) => (await window.hub.openDialog({ title, properties: multi ? ['openFile', 'multiSelections'] : ['openFile'], filters: [{ name, extensions: exts }] })) || [];

  // files from a drop or a picker, sorted by kind: a song, footage, pictures (added), a 3D model
  function addFiles(st, paths) {
    const f = C.sortFiles(paths.filter(Boolean));
    if (f.songs[0]) st.song = f.songs[0];
    if (f.footage[0]) st.footage = f.footage[0];
    if (f.models[0]) st.model = f.models[0];
    st.pictures = [...new Set([...st.pictures, ...f.pictures])].slice(0, 40);
    return f;
  }

  async function wizard(defaults = {}) {
    await P().ready();
    document.querySelector('dialog.pw-wizard[open]')?.close();
    const agents = H.agents().filter((a) => a.mode === 'native');
    agents.sort((a, b) => (b.engine === 'codex') - (a.engine === 'codex'));
    const d0 = C.defaults(store.get(KEY, {}), agents.map((a) => a.id));
    const st = {
      start: 'empty', copyScene: '', dupProject: '', myTemplate: '', recipe: '', model: null, song: null, footage: null, pictures: [], boardCopy: '',
      palette: [], paletteName: '', frame: d0.frame, fps: d0.fps, agentId: defaults.agentId && agents.some((a) => a.id === defaults.agentId) ? defaults.agentId : d0.agentId,
      persona: 'partner', consent: false, brief: false, briefTouched: false, describe: false, intent: '',
    };
    const lists = { scenes: null, projects: null, templates: null, recipes: null, boards: null };
    const d = el('dialog', { class: 'ui-modal pw-wizard pcw', attrs: { 'aria-label': 'New project' } });
    const form = el('form');
    const title = el('input', { value: defaults.name || '', placeholder: 'Name this little world', required: true, maxLength: 48, attrs: { 'aria-label': 'Project name' } });
    const intent = el('textarea', { rows: 2, placeholder: 'e.g. a 30-second loop for a techno track, dark and glossy', maxLength: 2000, attrs: { 'aria-label': 'What are you making?' } });
    intent.addEventListener('input', () => { st.intent = intent.value; });
    const status = el('p', { class: 'hint pcw-status', attrs: { role: 'status' } });
    const nameBtn = button('✦ Suggest a name', 'A short name from what you are making and the song: one small AI call, only when you click', async () => {
      if (!st.intent.trim() && !st.song) throw Error('Write what you are making (or pick a song) first.');
      status.textContent = 'Thinking of a name…';
      const n = await suggestName(st, agents);
      if (n) { title.value = n; status.textContent = `Suggested: ${n}`; } else status.textContent = 'No name came back. Try again, or type one.';
    }, 'ghost small pcw-suggest');
    const secs = {};
    const section = (id, label, open = false) => {
      const sum = el('span', { class: 'pcw-sum' });
      const body = el('div', { class: 'pcw-body' });
      const node = el('details', { class: 'pcw-sec', dataset: { sec: id }, open }, el('summary', {}, el('b', { text: label }), sum), body);
      secs[id] = { node, sum, body };
      return node;
    };
    form.append(
      el('div', { class: 'pw-eyebrow', text: 'NEW / PROJECT' }), el('h2', { text: 'Give your idea a home.' }),
      el('label', { class: 'pw-field' }, el('span', { text: 'Project name' }), el('div', { class: 'pcw-row' }, title, nameBtn)),
      el('label', { class: 'pw-field' }, el('span', { text: 'What are you making? (optional)' }), intent),
      section('start', 'Start from', true), section('media', 'Music & footage'), section('look', 'Look'), section('ai', 'AI'),
      status,
      el('div', { class: 'dialog-actions' }, button('Cancel', 'Close without making anything', () => d.close()), el('button', { type: 'submit', class: 'primary', text: 'Create project ↗', disabled: !agents.length })));
    if (!agents.length) status.textContent = 'Add a native AI in Settings first.';
    const paint = () => {
      const s = C.summary(st, agents);
      for (const [id, text] of Object.entries({ start: s.start, media: s.media, look: s.look, ai: s.ai })) secs[id].sum.textContent = text;
      secs.start.body.replaceChildren(...startPart());
      secs.media.body.replaceChildren(...mediaPart());
      secs.look.body.replaceChildren(...lookPart());
      secs.ai.body.replaceChildren(...aiPart());
      const dup = st.start === 'duplicate';
      secs.media.node.hidden = dup; secs.look.node.hidden = dup; // (a copy keeps its own song, look and moodboard)
    };
    const set = (patch) => { Object.assign(st, patch); paint(); };
    async function load(kind) {
      if (lists[kind]) return;
      if (kind === 'scenes') lists.scenes = (await P().Src.sceneList()).slice(0, 150);
      if (kind === 'projects') lists.projects = P().live().slice(0, 150);
      if (kind === 'boards') { const b = await P().Src.boards(); lists.boards = (Array.isArray(b) ? b : []).slice(0, 150); }
      if (kind === 'templates') { await Lazy.load('labtemplates'); lists.templates = (await LabTemplates.list()).slice(0, 150); }
      if (kind === 'recipes') { await Lazy.load('labrecipes'); lists.recipes = (await LabRecipes.list()).slice(0, 150); }
    }
    const choose = (kind, startId) => async () => { st.start = startId; paint(); try { status.textContent = 'Reading the list…'; await load(kind); status.textContent = ''; } catch (err) { status.textContent = calmError(err); } paint(); };
    const select = (label, list, value, fn, empty) => el('label', { class: 'pw-field pcw-pick' }, el('span', { text: label }),
      el('select', { on: { change: (e) => fn(e.target.value) } }, el('option', { value: '', text: list ? empty : 'Reading…' }), ...(list || []).map((x) => el('option', { value: x.id, text: x.name, selected: x.id === value }))));

    function startPart() {
      const out = [el('div', { class: 'pcw-chips', attrs: { role: 'group', 'aria-label': 'Start from' } },
        ...C.STARTS.map((s) => chip(`${s.icon} ${s.label}`, s.hint, st.start === s.id, () => set({ start: s.id }))),
        chip('⧉ Copy one of my scenes…', 'A copy of a scene you made, with its song and frame size', st.start === 'copy', choose('scenes', 'copy')),
        ...(store.get('three.myTemplates', 0) > 0 ? [chip('📐 One of my Lab templates…', 'A template you saved in the Lab', st.start === 'mytemplate', choose('templates', 'mytemplate'))] : []),
        chip('⎘ Duplicate a project…', 'A copy of a whole project: its chats, scenes and moodboard', st.start === 'duplicate', choose('projects', 'duplicate')))];
      const s = C.startOf(st.start);
      if (C.STARTS.includes(s) && st.start === s.id) out.push(el('p', { class: 'hint', text: s.hint }));
      if (st.start === 'copy') out.push(select('Which scene?', lists.scenes, st.copyScene, (v) => { st.copyScene = v; }, 'Pick a scene'));
      if (st.start === 'mytemplate') out.push(select('Which template?', lists.templates, st.myTemplate, (v) => { st.myTemplate = v; }, 'Pick a template'));
      if (st.start === 'duplicate') out.push(select('Which project?', lists.projects, st.dupProject, (v) => { st.dupProject = v; }, 'Pick a project'), el('p', { class: 'hint', text: 'The copy keeps its own song, look and moodboard; the name above renames it.' }));
      if (st.start === 'model') out.push(st.model ? fileRow('🧊', st.model, () => set({ model: null })) : button('🧊 Pick a 3D model… (optional)', '.glb, .gltf, .fbx, .obj: shown on a turntable', async () => { addFiles(st, await pick('A 3D model to show', '3D models', ['glb', 'gltf', 'fbx', 'obj', 'stl', 'ply'])); paint(); }));
      if (st.start === 'footage' && !st.footage) out.push(el('p', { class: 'hint', text: 'Add your footage under Music & footage.' }));
      if (st.start !== 'duplicate' && store.get('three.recipes', 0) > 0) {
        out.push(st.recipe || lists.recipes ? select('Then play one of my recipes (optional)', lists.recipes, st.recipe, (v) => { st.recipe = v; }, 'No recipe')
          : button('📜 Then play one of my recipes…', 'Your recorded Lab steps, played on the new scene', async () => { await load('recipes'); paint(); }));
      }
      return out;
    }
    function mediaPart() {
      return [
        el('div', { class: 'pcw-row pcw-wrap' },
          st.song ? fileRow('🎵', st.song, () => set({ song: null })) : button('🎵 Pick a song…', 'From this computer; the Lab analyses it in the background', async () => { addFiles(st, await pick('A song for the project', 'Songs', ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus', 'aif', 'aiff'])); paint(); }),
          st.footage ? fileRow('🎞', st.footage, () => set({ footage: null })) : button('🎞 Add footage…', 'A video clip (mp4, mov, webm)', async () => { addFiles(st, await pick('Footage for the project', 'Videos', ['mp4', 'mov', 'webm', 'm4v', 'mkv'])); paint(); })),
        el('div', { class: 'pcw-drop', dataset: { drop: 'media' }, text: 'Or drop a song or footage here · or skip this: you can add music later in the Lab' }),
      ];
    }
    function lookPart() {
      const pal = el('input', { placeholder: 'Paste a Coolors link or hex codes, then Enter', attrs: { 'aria-label': 'Coolors link or hex codes' } });
      const usePal = () => { const cols = C.parsePalette(pal.value); if (!cols.length) { status.textContent = 'No colors in that: paste a Coolors link or codes like #ff2e88.'; return; } set({ palette: cols, paletteName: 'Pasted' }); };
      pal.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); usePal(); } });
      pal.addEventListener('change', () => { if (pal.value.trim()) usePal(); });
      return [
        el('div', { class: 'pcw-label', text: 'Moodboard pictures' }),
        el('div', { class: 'pcw-row pcw-wrap' }, button('🖼 Add pictures…', 'They go on the project’s moodboard', async () => { addFiles(st, await pick('Pictures for the moodboard', 'Pictures', ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'], true)); paint(); }),
          st.pictures.length ? button('✕ Clear pictures', 'Take them off the list (nothing is deleted)', async () => set({ pictures: [] })) : null,
          st.boardCopy || lists.boards ? select('Or start from a copy of a moodboard', lists.boards, st.boardCopy, (v) => { st.boardCopy = v; }, 'An empty moodboard') : button('⧉ Copy a moodboard…', 'Start from a copy of a moodboard you have', async () => { await load('boards'); paint(); })),
        st.pictures.length ? el('p', { class: 'pw-files', text: st.pictures.map(C.base).join(' · ') }) : null,
        el('div', { class: 'pcw-drop', dataset: { drop: 'look' }, text: 'Drop pictures here' }),
        el('div', { class: 'pcw-label', text: 'Palette' }),
        el('div', { class: 'pcw-chips', attrs: { role: 'group', 'aria-label': 'Palette' } },
          chip('None', 'The template’s own colors', !st.palette.length, () => set({ palette: [], paletteName: '' })),
          ...C.PALETTES.map((p) => { const b = chip(p.name, p.colors.join(' '), st.paletteName === p.name, () => set({ palette: p.colors.slice(), paletteName: p.name })); b.prepend(swatches(p.colors)); return b; })),
        el('div', { class: 'pcw-row' }, pal, button('✦ Suggest a palette', 'From the pictures you added, on this computer (no AI)', async () => {
          if (!st.pictures.length) throw Error('Add a few pictures first.');
          status.textContent = 'Reading the pictures’ colors…';
          const cols = await suggestPalette(st.pictures);
          if (!cols.length) throw Error('No colors could be read from those pictures.');
          set({ palette: cols, paletteName: 'From the pictures' }); status.textContent = `Palette from the pictures: ${cols.join(' ')}`;
        })),
        st.palette.length ? el('p', { class: 'pcw-palnow' }, swatches(st.palette), el('span', { text: ` ${st.paletteName || 'Palette'}: ${st.palette.join(' ')}` })) : null,
        el('div', { class: 'pcw-label', text: 'Size' }),
        el('div', { class: 'pcw-chips', attrs: { role: 'group', 'aria-label': 'Size' } }, ...C.SIZES.map((z) => chip(z.label, z.hint, st.frame === z.id, () => set({ frame: z.id })))),
        el('div', { class: 'pcw-label', text: 'Frame rate' }),
        el('div', { class: 'pcw-chips', attrs: { role: 'group', 'aria-label': 'Frame rate' } }, ...C.RATES.map((r) => chip(`${r} fps`, `${r} frames a second`, st.fps === r, () => set({ fps: r })))),
      ];
    }
    function aiPart() {
      const tick = (label, title, on, fn) => el('label', { class: 'check', title }, el('input', { type: 'checkbox', checked: on, on: { change: (e) => fn(e.target.checked) } }), ` ${label}`);
      const persona = el('select', { on: { change: (e) => { st.persona = e.target.value; } } }, ...Object.entries(ProjectWorkspaceCore.PERSONAS).map(([id, [label]]) => el('option', { value: id, text: label, selected: id === st.persona })));
      return [
        el('div', { class: 'pcw-label', text: 'Who directs' }),
        el('div', { class: 'pcw-chips', attrs: { role: 'group', 'aria-label': 'Who directs' } }, ...agents.map((a) => chip(a.name, a.engine === 'codex' ? 'Astra (Codex) directs this project' : 'Claude directs this project', st.agentId === a.id, () => set({ agentId: a.id })))),
        el('label', { class: 'pw-field pcw-pick' }, el('span', { text: 'Personality' }), persona),
        tick('Let the AI look at the moodboard', 'Its pictures are sent to the AI with the brief and when it asks; off: the AI sees their names only', st.consent, (v) => set({ consent: v })),
        tick('Let the AI prepare a brief', 'After Create: a short plan from your words, the song, the scene and (with the tick above) the moodboard, in the project’s Lab chat', C.briefOn(st), (v) => set({ brief: v, briefTouched: true })),
        tick('Write a short project description', 'One small AI call after Create', st.describe, (v) => set({ describe: v })),
      ];
    }
    // drops anywhere on the card, sorted by kind
    d.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); d.classList.add('pcw-dragging'); } });
    d.addEventListener('dragleave', (e) => { if (e.target === d) d.classList.remove('pcw-dragging'); });
    d.addEventListener('drop', (e) => {
      d.classList.remove('pcw-dragging');
      const paths = [...(e.dataTransfer?.files || [])].map(pathOf).filter(Boolean);
      if (!paths.length) return;
      e.preventDefault();
      const f = addFiles(st, paths);
      if (f.songs.length || f.footage.length) secs.media.node.open = true;
      if (f.pictures.length) secs.look.node.open = true;
      const n = f.other.length;
      status.textContent = n ? `${n} file${n === 1 ? '' : 's'} not used here (not a song, footage, picture or 3D model).` : '';
      paint();
    });
    let busy = false; let retryId = null;
    d.addEventListener('cancel', (e) => { if (busy) e.preventDefault(); });
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (busy) return;
      busy = true;
      status.textContent = st.start === 'duplicate' ? 'Copying the project…' : 'Creating your chat, scene and moodboard…';
      form.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      try {
        const p = await make(st, { name: title.value, retryId });
        d.close();
        after(p, st).catch((err) => toast(calmError(err), { type: 'error' }));
      } catch (err) { retryId = err.projectId || retryId; status.textContent = calmError(err); } finally { busy = false; form.querySelectorAll('button').forEach((b) => { b.disabled = false; }); }
    };
    d.append(form);
    d.onclose = () => { d.remove(); if (card?.d === d) card = null; };
    document.body.append(d);
    card = { d, st, paint };
    paint();
    d.showModal();
    title.focus();
    return d;
  }

  // ---------- Create ----------
  async function make(st, { name, retryId = null }) {
    const nm = String(name || '').trim();
    if (!nm) throw Error('Give your project a name.');
    store.set(KEY, { frame: st.frame, fps: st.fps, agentId: st.agentId });
    last.made = null; last.brief = null; last.steps = [];
    if (st.start === 'duplicate') {
      const src = P().get(st.dupProject);
      if (!src) throw Error('Pick the project to copy.');
      await Lazy.load('projbundle');
      const np = await ProjBundle.duplicateProject(src);
      if (!np) throw Error('The copy didn’t work. Nothing was changed.');
      if (nm !== np.name) P().rename(np, nm);
      if (st.intent.trim() && !np.notes) P().setNotes(np, st.intent.trim());
      await P().flush();
      await PW().open(np.id);
      last.made = { id: np.id, start: 'duplicate' };
      return np;
    }
    if (st.start === 'copy' && !st.copyScene) throw Error('Pick the scene to copy, or choose another start.');
    if (st.start === 'mytemplate' && !st.myTemplate) throw Error('Pick the template, or choose another start.');
    const files = [st.song, st.footage, ...st.pictures, st.model].filter(Boolean);
    const p = await PW().create({
      resumeId: retryId, name: nm, brief: st.intent.trim(), persona: st.persona, agentId: st.agentId, sceneId: st.start === 'copy' ? st.copyScene : '',
      boardId: st.boardCopy, plugins: [], files, describe: st.describe, prepare: (proj) => prepare(proj, st),
    });
    last.made = { id: p.id, start: st.start };
    return p;
  }
  // the project's scene, before it opens: the start's layers (recolored with the palette), the palette, size, rate, footage
  async function prepare(p, st) {
    const sc = ThreeLab.scenes; const id = p.workspace.sceneId; const x = sc.get(id);
    if (!x) return;
    let Ls = null;
    if (st.start === 'mytemplate') {
      await Lazy.load('labtemplates');
      const t = (await LabTemplates.list()).find((y) => y.id === st.myTemplate);
      if (t) { const r = TemplateCore.apply(t, {}); Ls = r.layers; if (r.palette?.length && !st.palette.length) x.palette = r.palette; }
    } else {
      const s = C.startOf(st.start);
      if (s.start || s.layers) {
        await Lazy.load('gallery');
        const G = LabGalleryData;
        const spec = s.id === 'model' && st.model ? { layers: s.withModel } : s.layers ? { layers: s.layers } : G.STARTS.find((z) => z.id === s.start);
        if (spec) Ls = G.layersOf(spec);
      }
    }
    if (Ls?.length) {
      const tune = (code) => { try { return typeof InstantCore !== 'undefined' ? InstantCore.tune(code, { palette: st.palette }).code : code; } catch { return code; } };
      x.layers = Ls.map((L, i) => ThreeLayers.defaults({ name: L.name, code: st.palette.length && !L.filter ? tune(L.code) : L.code, slot: i, color: ThreeLayers.COLORS[i % ThreeLayers.COLORS.length], ...(L.blend ? { blend: L.blend } : {}), ...(L.opacity != null ? { opacity: L.opacity } : {}) }));
      x.code = x.layers[0].code;
      last.steps.push(`layers: ${x.layers.map((L) => L.name).join(', ')}`);
    }
    if (st.palette.length) x.palette = st.palette.slice(0, 16);
    if (Ls?.length || st.palette.length) sc.changed(id);
    sc.setFrame(id, st.frame);
    const tl = sc.timelineOf(id);
    if (tl && tl.fps !== st.fps) sc.setTimeline(id, { ...tl, fps: st.fps });
    // footage: the scene's video (what the footage layers show) for Footage + effects, or when there's no song
    if (st.footage && (st.start === 'footage' || !st.song)) sc.setExtras(id, { media: { path: st.footage } });
    // (round 128) the size, frame rate and AI are also the project's settings (p.prefs: the project menu, the Lab and Render read them)
    p.prefs = { ...(p.prefs && typeof p.prefs === 'object' ? p.prefs : {}), aspect: st.frame, fps: st.fps, ...(st.agentId ? { agentId: st.agentId } : {}) };
    P().setWorkspace(p, { start: st.start, frame: st.frame, fps: st.fps, aiSeesMoodboard: Boolean(st.consent), ...(st.palette.length ? { palette: st.palette.slice(0, 16) } : {}) });
  }
  // after the project opened: the model on its turntable, a recipe, then the brief
  async function after(p, st) {
    const onScreen = () => typeof ThreeLab !== 'undefined' && ThreeLab.scenes?.currentId?.() === p.workspace?.sceneId;
    if (st.start === 'model' && st.model && onScreen() && typeof ThreeModels !== 'undefined') {
      try { await ThreeModels.add(st.model); await ThreeModels.op({ op: 'turntable', speed: 1 }); last.steps.push('model'); } catch (err) { toast(`The 3D model: ${calmError(err)}`, { type: 'error' }); }
    }
    if (st.recipe && st.start !== 'duplicate' && onScreen()) {
      try { await Lazy.load('labrecipes'); const r = (await LabRecipes.list()).find((y) => y.id === st.recipe); if (r) { await LabRecipes.use(r); last.steps.push('recipe'); } } catch (err) { toast(`The recipe: ${calmError(err)}`, { type: 'error' }); }
    }
    if (C.briefOn(st)) await brief(p, st);
  }
  // ✦ the brief (aiprep128's ProjectBrief): prepared, then shown as the plan card in the project's Lab chat. Without
  // it (an older Hearth, or its group missing) the project is simply open, and a note says so.
  async function brief(p, st) {
    try { await Lazy.load('projectbrief'); } catch { /* no group: checked below */ }
    const B = window.ProjectBrief || (typeof ProjectBrief !== 'undefined' ? ProjectBrief : null); // eslint-disable-line no-undef
    if (!B?.prepare) {
      last.brief = { available: false };
      toast(`“${p.name}” is ready. The AI brief isn’t available in this version of Hearth, so it was skipped.`, { timeout: 7000 });
      return last.brief;
    }
    const note = toast('✦ Preparing the brief…', { timeout: 0 });
    try {
      const opts = C.briefOptions(st);
      await B.prepare(p.id, opts);
      await B.open?.(p.id);
      last.brief = { available: true, ok: true, opts };
    } catch (err) {
      last.brief = { available: true, ok: false, error: calmError(err) };
      toast(`The brief: ${calmError(err)}. The project is open as usual.`, { type: 'error' });
    } finally { note?.remove?.(); }
    return last.brief;
  }

  // ---------- the helpers ----------
  async function suggestName(st, agents) {
    const a = agents.find((x) => x.id === st.agentId) || agents[0];
    if (!a) throw Error('Add a native AI first.');
    const r = await window.hub.askOnce({ agentId: a.id, text: C.namePrompt(st.intent, st.song), options: { lean: true, helper: true, persona: 'You name creative projects. Reply with the name only.' } });
    if (!r?.ok) throw Error(r?.error || 'The AI did not reply.');
    if (r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: a.id, usage: r.usage, source: 'projcreate' } }));
    return C.cleanName(r.text);
  }
  async function suggestPalette(pictures) {
    if (typeof Kit === 'undefined') await Lazy.load('kit');
    const lists = [];
    for (const p of pictures.slice(0, 4)) { try { lists.push(await Kit.paletteFromImage(p, 5)); } catch { /* an unreadable picture is skipped */ } }
    return C.mergePalettes(lists, 5);
  }

  return { wizard, make, prepare, brief, suggestPalette, addFiles, get last() { return last; }, get card() { return card; } };
})();
