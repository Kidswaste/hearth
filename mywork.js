// (round 134, starters134) ★ My work: start from my own work (docs/upgrades/starters134.md). Lazy group "mywork"
// (after "projects"). One library, with thumbnails, of:
//   · every past project's main scene (and my other scenes that have a picture), from the Lab's scenes and stills
//   · my saved templates (projects saved as templates and the Lab's 📐 templates: data/templates/, read here directly)
//   · standout layers: a simple local score from renders of their scene, how long they were kept and the edits on them
//     (MyWorkCore.score; nothing leaves this computer)
//   · looks: each palette I used, and the slider looks I saved on layers
// Search, and filters by kind (scenes / layers / looks), by project and by look (palette swatches, folded behind ◆).
// Ways in (no new toolbar row): ＋ New project › Start from › ★ My work… (projcreate.js), the Lab's ＋ Add › ★ From my
// work… and the sketch browser's ★ My work button (tools/three.js).
// Reuse: Start a new scene from this (a copy with fresh ids; the original is never changed), Add this layer here (one
// Undo, recolored to this project's palette when ticked), Use this look (one Undo). ✦ Like my past work: on a click
// only, the cost first; the AI reads a compact summary (titles, palettes, layer kinds) and suggests 3 starting points.
window.MyWork = (() => {
  const C = MyWorkCore;
  const calm = (err) => (window.calmError ? calmError(err) : String(err?.message || err));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const sepOf = (p) => (/^[A-Za-z]:\\/.test(p) || (String(p).includes('\\') && !String(p).includes('/')) ? '\\' : '/');
  const join = (a, ...b) => [String(a).replace(/[\\/]+$/, ''), ...b].join(sepOf(a));
  const last = { read: null, started: null, added: null, look: null, ai: null, sent: [] }; // (checks)
  let ui = null; // the open library: { d, st, paint }
  let cache = null; let cacheAt = 0;

  // ---------- reading what's there (nothing is written) ----------
  async function templates() {
    const att = await window.hub.attachmentsDir();
    const root = join(String(att).replace(/[\\/]attachments[\\/]?$/, ''), 'templates');
    let dirs = [];
    try { dirs = (await window.hub.fs.list(root)).filter((x) => x.isDir && !x.name.startsWith('.')); } catch { dirs = []; }
    const out = await Promise.all(dirs.slice(0, 120).map(async (x) => {
      let raw = null;
      try { raw = JSON.parse(await window.hub.fs.read(join(x.path, 'template.json'))); } catch { return null; }
      if (!raw?.id || !Array.isArray(raw.scene?.layers)) return null;
      let cover = null;
      try { if ((await window.hub.fs.list(x.path)).some((f) => f.name === 'thumb.jpg')) { const b = await window.hub.fs.read(join(x.path, 'thumb.jpg'), { encoding: 'base64' }); if (b) cover = `data:image/jpeg;base64,${b}`; } } catch { cover = null; }
      return { id: raw.id, name: raw.name || 'Template', at: raw.updatedAt || raw.at || 0, cover, project: Boolean(raw.project && typeof raw.project === 'object'), palette: raw.project?.palette || raw.scene.palette || [], layers: raw.scene.layers.map((L) => ({ name: L.name, code: L.code })) };
    }));
    return out.filter(Boolean);
  }
  async function read({ fresh = false } = {}) {
    if (cache && !fresh && Date.now() - cacheAt < 20000) return cache;
    if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects');
    await Projects.ready();
    const Src = Projects.Src;
    if (fresh) Projects.forget?.('sketches', 'sceneThumbs', 'renders');
    const lab = typeof ThreeLab !== 'undefined' && ThreeLab.scenes?.all ? ThreeLab.scenes : null;
    const [sketches, thumbs, renders, extras, tpls] = await Promise.all([
      Src.sketches().catch(() => []), Src.sceneThumbs().catch(() => ({})), Src.renders().catch(() => []),
      lab ? Promise.resolve(null) : window.hub.kvGet('three-lab-extras', {}).catch(() => ({})), templates().catch(() => []),
    ]);
    const scenes = (sketches || []).map((x) => (lab && lab.layersOf ? { ...x, layers: lab.layersOf(x) } : x));
    const ex = lab ? Object.fromEntries(scenes.map((x) => [x.id, lab.extrasOf?.(x.id) || {}])) : extras || {};
    const items = C.gather({ projects: Projects.live(), scenes, thumbs, renders, extras: ex, templates: tpls, now: Date.now() });
    cache = items; cacheAt = Date.now();
    last.read = { at: cacheAt, n: items.length, kinds: items.reduce((m, it) => ({ ...m, [it.kind]: (m[it.kind] || 0) + 1 }), {}) };
    return items;
  }

  // ---------- the Lab side: start, add, use (each a copy; the originals are never touched) ----------
  const lab = async () => { if (typeof ThreeLab === 'undefined' || !ThreeLab.director) await Lazy.load('lab'); await ThreeLab.cmd({ show: true }); return { sc: ThreeLab.scenes, d: ThreeLab.director }; };
  const uniqueName = (sc, name) => { const have = new Set(sc.all().map((x) => x.name)); let n = name; let i = 2; while (have.has(n)) { n = `${name} ${i}`; i += 1; } return n; };
  // the recolor: InstantCore.tune, the same color-slider recolor as a new project's starting point (the gallery group)
  const needTune = async (pal) => { if (pal.length && typeof InstantCore === 'undefined') await Lazy.load('gallery').catch(() => {}); };
  const tune = (code, palette) => { try { return palette?.length && typeof InstantCore !== 'undefined' ? InstantCore.tune(code, { palette }).code : code; } catch { return code; } };
  // this project's palette (the scene on screen's project, or the scene's own)
  function herePalette() {
    try {
      const sid = ThreeLab.scenes.currentId();
      const p = window.Projects?.ofItem?.('scene', sid)?.[0];
      return C.colors(p?.workspace?.palette).length ? C.colors(p.workspace.palette) : C.colors(ThreeLab.scenes.get(sid)?.palette);
    } catch { return []; }
  }
  // Start a new scene from this: its layers with fresh ids, its sliders' looks and music links, frame, song and palette
  async function startScene(item) {
    const { sc } = await lab();
    const src = sc.get(item.sceneId);
    if (!src) throw Error('That scene isn’t here anymore.');
    const f = C.freshLayers(sc.layersOf(src), sc.extrasOf(src.id) || {}, ThreeLayers.newId);
    const x = sc.create({ name: uniqueName(sc, `${src.name} · new`), code: f.layers[0]?.code || src.code || '', layers: f.layers, frame: sc.frameOf(src.id), timeline: sc.timelineOf(src.id) });
    const ex = { ...f.extras, ...(sc.songOf(src.id) ? { media: { path: sc.songOf(src.id) } } : {}) };
    if (Object.keys(ex).length) sc.setExtras(x.id, ex);
    if (C.colors(src.palette).length) { x.palette = C.colors(src.palette); sc.changed(x.id); }
    sc.open(x.id);
    last.started = { id: x.id, from: src.id, name: x.name };
    toast(`★ “${x.name}” is a new scene from “${src.name}” (the original is unchanged)`, { timeout: 5000 });
    return last.started;
  }
  async function startTemplate(item) {
    await lab();
    await Lazy.load('labtemplates');
    const t = (await LabTemplates.list({ fresh: true })).find((y) => y.id === item.templateId);
    if (!t) throw Error('That template isn’t here anymore.');
    const r = await LabTemplates.create(t, {});
    last.started = { id: r.id, template: t.id, name: r.name };
    return last.started;
  }
  // one undo step around a change to the scene on screen (the dock's ↶, /undo-edit, the toast's Undo)
  async function stepped(words, fn) {
    const id = ThreeLab.scenes.currentId();
    const before = await LabTxn.snap(id);
    const r = await fn();
    await wait(300);
    const after = await LabTxn.snap(id);
    const ok = LabTxn.step({ who: 'You', before, after, label: words, words });
    if (ok) toast(`★ ${words[0].toUpperCase()}${words.slice(1)}`, { timeout: 6000, action: { label: 'Undo', fn: () => LabTxn.undoTurn().catch((e) => toast(calm(e), { type: 'error' })) } });
    return { ...r, step: ok };
  }
  // Add this layer here: a copy of one layer on top of the scene on screen (recolored to this project's palette when ticked)
  async function addLayer(item, { recolor = false } = {}) {
    const { sc, d } = await lab();
    const src = sc.get(item.sceneId);
    const L = src && sc.layersOf(src).find((y) => y.id === item.layerId);
    if (!L) throw Error('That layer isn’t there anymore.');
    const cp = C.layerCopy(L);
    const pal = recolor ? herePalette() : [];
    await needTune(pal);
    const code = pal.length ? tune(cp.code, pal) : cp.code;
    const r = await stepped(`added the layer ${cp.name} from “${src.name}”${pal.length ? ' (recolored)' : ''}`, async () => {
      const out = await d.addLayer({ name: cp.name, code, props: cp.props }, 0.6);
      return { added: out?.added || cp.name };
    });
    const row = (d.layers().layers || []).at(-1);
    last.added = { scene: sc.currentId(), layerId: row?.id || null, name: r.added, recolored: pal.length > 0, palette: pal, step: r.step };
    return last.added;
  }
  // Use this look: a palette on every layer's color sliders (the project look's recolor), or a saved slider look on the
  // layers that have those sliders; one undo step either way
  async function useLook(item) {
    const { d } = await lab();
    let r;
    if (item.look === 'palette') {
      await Lazy.load('projlook');
      r = await stepped(`used the look “${item.name}”`, async () => ({ changed: LabProjLook.apply({ palette: item.palette, scope: 'all', ai: true, quiet: true }).changed }));
    } else {
      const H2 = ThreeLab.stageHooks;
      r = await stepped(`used the look “${item.name}”`, async () => {
        let changed = 0;
        for (const L of d.layers().layers || []) {
          const c = H2?.ctlOf?.(L.id);
          if (!c) continue;
          let keys = [];
          try { keys = c.controls().map((x) => x.key); } catch { keys = []; }
          const set = Object.fromEntries(Object.entries(item.values || {}).filter(([k]) => keys.includes(k)));
          if (Object.keys(set).length) { c.setMany(set); changed += 1; }
        }
        return { changed };
      });
    }
    if (!r.changed) toast('Nothing here takes that look (no matching color sliders).', { timeout: 3000 });
    last.look = { name: item.name, changed: r.changed, step: r.step };
    return last.look;
  }

  // ---------- ✦ Like my past work ----------
  const natives = () => H.agents().filter((a) => a.mode === 'native');
  const agentOf = (id) => natives().find((a) => a.id === id) || natives().find((a) => a.dock === 'three') || natives()[0] || null;
  const who = (a) => (a?.engine === 'codex' ? 'Astra' : 'Claude');
  function briefHere(o = {}) {
    if (o.mode === 'card') return { project: o.name || 'a new project', brief: o.brief || '' };
    try {
      const sid = ThreeLab.scenes.currentId();
      const p = window.Projects?.ofItem?.('scene', sid)?.[0];
      const b = p && window.ProjectBrief?.get ? ProjectBrief.get(p.id) : null;
      return { project: p?.name || ThreeLab.scenes.get(sid)?.name || 'this scene', brief: [p?.notes, b?.look, b?.intent].filter((s) => typeof s === 'string' && s.trim()).join(' · ') };
    } catch { return { project: 'this scene', brief: '' }; }
  }
  function aiPlan(items, o) {
    const lines = C.summary(items);
    const text = C.prompt({ ...briefHere(o), lines });
    const a = agentOf(o.agentId);
    return { text, a, lines, line: C.costLine(C.estimate(text), who(a)) };
  }
  async function askAI(items, o) {
    const { text, a } = aiPlan(items, o);
    if (!a) throw Error('Add a native AI in Settings first.');
    if (window.Lazy && !Lazy.loaded('budget')) await Lazy.load('budget').catch(() => {});
    const ch = window.Autocompact?.CHEAP?.[a.engine] || null;
    const q = { agentId: a.id, text, images: [], options: { lean: true, helper: true, persona: 'You suggest starting points from the owner\'s own past work. Reply with JSON only.', ...(ch ? { model: ch.model, effort: ch.effort } : { effort: 'low' }) } };
    last.sent = [...last.sent, { agentId: a.id, text, at: Date.now() }].slice(-5);
    const r = await window.hub.askOnce(q).catch((err) => ({ ok: false, error: err.message }));
    if (r?.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: a.id, usage: r.usage, source: 'my work' } }));
    if (!r?.ok) throw Error(r?.error || 'The AI didn’t answer.');
    last.raw = String(r.text || '').slice(0, 2000);
    const ideas = C.parse(r.text, items);
    if (!ideas.length) throw Error('The answer had no usable ideas. Try again.');
    last.ai = { ideas: ideas.map((x) => ({ title: x.title, key: x.item.key })) };
    return ideas;
  }

  // ---------- the library card ----------
  const btn = (text, title, fn, cls = 'ghost small') => el('button', { type: 'button', class: cls, text, title, on: { click: async (e) => { const b = e.currentTarget; b.disabled = true; try { await fn(); } catch (err) { toast(calm(err), { type: 'error' }); } finally { b.disabled = false; } } } });
  const sw = (cols) => el('span', { class: 'mw-sw', attrs: { 'aria-hidden': 'true' } }, (cols || []).slice(0, 6).map((c) => el('i', { style: { background: c } })));
  const KIND = { scene: 'Scene', template: 'Template', layer: 'Layer', look: 'Look' };
  // o: { mode: 'lab' | 'card', kind, onPick(item), brief, name, agentId }
  async function open(o = {}) {
    document.querySelector('dialog.mw[open]')?.close();
    const mode = o.mode === 'card' ? 'card' : 'lab';
    const st = { q: '', kind: o.kind || '', project: '', look: '', showLooks: false, sel: '', recolor: true, ai: { phase: 'idle', line: '', ideas: [], error: '' }, items: [] };
    const d = el('dialog', { class: 'ui-modal mw', attrs: { 'aria-label': 'My work' } });
    const q = el('input', { class: 'mw-q', placeholder: 'Search my work…', spellcheck: false, attrs: { 'aria-label': 'Search my work' } });
    q.addEventListener('input', () => { st.q = q.value; paint(); });
    const proj = el('select', { class: 'mw-proj', attrs: { 'aria-label': 'Project' } });
    proj.addEventListener('change', () => { st.project = proj.value; paint(); });
    const kinds = el('div', { class: 'mw-kinds', attrs: { role: 'group', 'aria-label': 'Kind' } });
    const lookBtn = el('button', { type: 'button', class: 'ghost small mw-lookbtn', text: '◆ Look', title: 'Filter by a palette you used', on: { click: () => { st.showLooks = !st.showLooks; paint(); } } });
    const looksRow = el('div', { class: 'mw-looks' });
    const aiBtn = el('button', { type: 'button', class: 'ghost small mw-ai', text: '✦ Like my past work', title: 'The AI reads a short summary of your library (titles, palettes, layer kinds) and suggests 3 starting points. The cost shows first; nothing is sent before you click again', on: { click: () => { st.ai = { phase: 'cost', ideas: [], error: '', line: aiPlan(st.items, { ...o, mode }).line }; paint(); } } });
    const aiBox = el('div', { class: 'mw-aibox' });
    const grid = el('div', { class: 'mw-grid', attrs: { role: 'listbox', 'aria-label': 'My work' } });
    const bar = el('div', { class: 'mw-bar' });
    const status = el('p', { class: 'hint mw-status', attrs: { role: 'status' } });
    d.append(
      el('div', { class: 'mw-head' }, el('h3', { text: '★ My work' }), q, el('button', { type: 'button', class: 'ghost small', text: 'Close', on: { click: () => d.close() } })),
      el('div', { class: 'mw-filters' }, kinds, proj, lookBtn, aiBtn), looksRow, aiBox, grid, bar, status);
    const act = async (item) => {
      if (mode === 'card') { o.onPick?.(item); d.close(); return; }
      if (item.kind === 'scene') { await startScene(item); d.close(); } else if (item.kind === 'template') { await startTemplate(item); d.close(); } else if (item.kind === 'layer') { await addLayer(item, { recolor: st.recolor }); d.close(); } else { await useLook(item); d.close(); }
    };
    const actLabel = (item) => (mode === 'card' ? (item.kind === 'look' ? 'Use this palette' : 'Start from this')
      : item.kind === 'layer' ? 'Add this layer here' : item.kind === 'look' ? 'Use this look' : 'Start a new scene from this');
    function card(it) {
      const on = st.sel === it.key;
      const sub = [KIND[it.kind], it.kind === 'layer' ? `in ${it.sceneName}` : '', it.project?.name && !(it.kind === 'layer' && it.sceneName === it.project.name) ? it.project.name : '', it.why || ''].filter(Boolean).join(' · ');
      return el('button', { type: 'button', class: `mw-card${on ? ' on' : ''}`, dataset: { key: it.key, kind: it.kind }, title: sub, attrs: { role: 'option', 'aria-selected': on ? 'true' : 'false' }, on: { click: () => { st.sel = it.key; paint(); }, dblclick: () => act(it).catch((e) => { status.textContent = calm(e); }) } },
        el('span', { class: 'mw-img', style: it.thumb ? { backgroundImage: `url("${it.thumb}")` } : {} }, it.thumb ? null : (it.palette?.length ? sw(it.palette) : el('span', { text: it.kind === 'template' ? '📐' : '★' }))),
        el('span', { class: 'mw-name', text: it.name }), el('span', { class: 'mw-sub', text: sub }), it.palette?.length && it.thumb ? sw(it.palette) : null);
    }
    function paint() {
      const all = st.items;
      kinds.replaceChildren(...[['', 'All'], ['scene', 'Scenes'], ['layer', 'Layers'], ['look', 'Looks']].map(([k, l]) => el('button', { type: 'button', class: `mw-chip mw-kind${st.kind === k ? ' on' : ''}`, text: l, dataset: { kind: k }, attrs: { 'aria-pressed': st.kind === k ? 'true' : 'false' }, on: { click: () => { st.kind = k; paint(); } } })));
      const ps = C.projectsOf(all);
      proj.replaceChildren(el('option', { value: '', text: 'All projects' }), ...ps.map((p) => el('option', { value: p.id, text: p.name, selected: p.id === st.project })));
      const lk = C.looks(all);
      lookBtn.classList.toggle('on', Boolean(st.look));
      looksRow.hidden = !st.showLooks;
      looksRow.replaceChildren(...(st.showLooks ? [el('button', { type: 'button', class: `mw-chip${st.look ? '' : ' on'}`, text: 'Any look', on: { click: () => { st.look = ''; paint(); } } }),
        ...lk.map((l) => { const b = el('button', { type: 'button', class: `mw-chip mw-look${st.look === l.key ? ' on' : ''}`, title: l.name, dataset: { look: l.key }, on: { click: () => { st.look = st.look === l.key ? '' : l.key; paint(); } } }); b.append(sw(l.palette)); return b; })] : []));
      const shown = C.filter(all, { q: st.q, kind: st.kind, project: st.project, look: st.look ? st.look.split(',') : null });
      grid.replaceChildren(...(shown.length ? shown.slice(0, 200).map(card) : [el('p', { class: 'hint', text: all.length ? 'Nothing matches: try other words or filters.' : 'Nothing here yet: your projects’ scenes, templates, standout layers and palettes show here as you make them.' })]));
      // ✦ the AI's part
      const ai = st.ai;
      aiBox.hidden = ai.phase === 'idle';
      if (ai.phase === 'cost') {
        aiBox.replaceChildren(el('p', { class: 'mw-cost', text: `✦ Reads a short summary of ${Math.min(36, all.length)} things in your library (titles, palettes, layer kinds; no code or pictures) and suggests 3 starting points for ${briefHere({ ...o, mode }).project}. ${ai.line}` }),
          el('div', { class: 'mw-row' }, btn('✦ Suggest 3', 'Send the summary now', async () => { st.ai = { ...ai, phase: 'running' }; paint(); try { st.ai = { ...st.ai, phase: 'done', ideas: await askAI(all, { ...o, mode }) }; } catch (e) { st.ai = { ...st.ai, phase: 'error', error: calm(e) }; } paint(); }, 'primary small mw-ask'),
            btn('Cancel', 'Nothing is sent', async () => { st.ai = { phase: 'idle', ideas: [], line: '', error: '' }; paint(); })));
      } else if (ai.phase === 'running') aiBox.replaceChildren(el('p', { class: 'mw-cost', text: '✦ Looking through your work…' }));
      else if (ai.phase === 'error') aiBox.replaceChildren(el('p', { class: 'mw-cost', text: `✦ ${ai.error}` }), btn('Close', '', async () => { st.ai = { phase: 'idle', ideas: [], line: '', error: '' }; paint(); }));
      else if (ai.phase === 'done') {
        aiBox.replaceChildren(el('div', { class: 'mw-ideas' }, ...ai.ideas.map((x) => el('div', { class: 'mw-idea', dataset: { key: x.item.key } },
          el('b', { text: x.title }), el('span', { class: 'mw-sub', text: `${KIND[x.item.kind]}: ${x.item.name}` }), el('p', { text: x.why }),
          btn('Start from this', actLabel(x.item), async () => act(x.item), 'primary small mw-idea-go')))),
        btn('✕', 'Hide the suggestions', async () => { st.ai = { phase: 'idle', ideas: [], line: '', error: '' }; paint(); }, 'ghost small mw-idea-x'));
      }
      // the chosen card's actions
      const it = all.find((x) => x.key === st.sel);
      const pal = mode === 'lab' && it?.kind === 'layer' ? herePalette() : [];
      bar.hidden = !it;
      bar.replaceChildren(...(it ? [el('span', { class: 'mw-barname', text: it.name }),
        pal.length ? el('label', { class: 'check mw-recolor', title: 'The layer’s color sliders take this project’s palette (the original layer is unchanged)' }, el('input', { type: 'checkbox', checked: st.recolor, on: { change: (e) => { st.recolor = e.target.checked; } } }), ' Recolor to this project’s palette ', sw(pal)) : null,
        btn(actLabel(it), mode === 'lab' && it.kind !== 'look' && it.kind !== 'layer' ? 'A copy with fresh ids: the original stays as it is' : 'One Undo takes it back', async () => act(it), 'primary small mw-go')] : []));
    }
    d.onclose = () => { d.remove(); if (ui?.d === d) ui = null; };
    document.body.append(d);
    ui = { d, st, paint, open: o };
    status.textContent = 'Reading your work…';
    paint();
    d.showModal();
    q.focus();
    try { st.items = await read(); status.textContent = ''; } catch (err) { status.textContent = calm(err); }
    if (ui?.d === d) paint();
    return d;
  }

  // ---------- the new-project card (projcreate.js) ----------
  // what the card takes from a picked item
  async function cardPatch(item, st = {}) {
    const pal = C.colors(item.palette);
    if (item.kind === 'look') return { palette: pal, paletteName: item.name };
    if (item.kind === 'template' && item.projectTemplate) {
      await Lazy.load('projtemplates');
      const t = (await ProjTemplates.list({ fresh: true })).find((x) => x.id === item.templateId);
      if (t) return { start: 'projtemplate', projTemplate: t.id, projTemplateName: t.name, ...ProjTemplates.cardPatch(t) };
    }
    if (item.kind === 'template') return { start: 'mytemplate', myTemplate: item.templateId };
    return { start: 'mywork', myWork: { key: item.key, kind: item.kind, name: item.name, sceneId: item.sceneId, layerId: item.layerId || null }, ...(pal.length && !st.palette?.length ? { palette: pal, paletteName: 'From my work' } : {}) };
  }
  // the new project's scene, before it opens: a copy of the scene (fresh ids) or of the one layer; recolored when the
  // card has a palette of its own; the source's song when none was picked
  async function into(p, x, pick, st = {}) {
    const sc = ThreeLab.scenes;
    const src = sc.get(pick?.sceneId);
    if (!src) throw Error('That scene isn’t here anymore.');
    const pal = C.colors(st.palette);
    await needTune(pal);
    if (pick.kind === 'layer') {
      const L = sc.layersOf(src).find((y) => y.id === pick.layerId);
      if (!L) throw Error('That layer isn’t there anymore.');
      const cp = C.layerCopy(L);
      x.layers = [ThreeLayers.defaults({ id: x.layers?.[0]?.id || 'main', name: cp.name, code: pal.length ? tune(cp.code, pal) : cp.code, slot: 0, ...cp.props })];
    } else {
      const f = C.freshLayers(sc.layersOf(src), sc.extrasOf(src.id) || {}, ThreeLayers.newId);
      x.layers = pal.length ? f.layers.map((L) => ({ ...L, code: tune(L.code, pal) })) : f.layers;
      if (Object.keys(f.extras).length) sc.setExtras(x.id, f.extras);
      if (!st.song && !st.footage && sc.songOf(src.id)) sc.setExtras(x.id, { media: { path: sc.songOf(src.id) } });
    }
    x.code = x.layers[0]?.code || x.code;
    if (!pal.length && C.colors(src.palette).length) x.palette = C.colors(src.palette);
    sc.changed(x.id);
    last.started = { id: x.id, from: src.id, name: x.name, project: p.id, kind: pick.kind };
    return last.started;
  }

  return { open, read, gather: (src) => C.gather(src), startScene, startTemplate, addLayer, useLook, askAI, aiPlan, herePalette, cardPatch, into, get last() { return last; }, get ui() { return ui; }, forget: () => { cache = null; } };
})();
