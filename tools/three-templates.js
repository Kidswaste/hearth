// 📐 My templates (round 35, labtemplates): any Lab scene becomes a reusable starting point, with 0 tokens.
//   · Save as my template… (✦ More › 📐 My templates, the toolbar's ⋯, Sketch ▾): a name, a picture of the preview
//     (the director's own small snapshot), and which parts become the template's FIELDS: every slider, the palette, the
//     text layers' words and a slot per picture / video / sound (the references and the song) by default.
//   · New from my template…: a calm picker (search, newest first, pictures); picking one opens a short form with its
//     fields (words, colors, a drop slot per media, sliders) next to a live preview (a small backstage stage running
//     the template with the values typed); Create makes a new scene: one step (the toast's Undo takes it back) and its
//     first version in the time machine.
//   · Files in Hearth's data folder: data/templates/<id>/template.json (portable JSON, tools/three-templates-core.js),
//     thumb.jpg, files/ (its media, copied in). They sync like the rest of data/, travel in a .hearthpack (kind
//     "template": ⇪ Share as a pack… on a card; opening one adds it here) and Delete moves the folder to the Trash.
//   · For the AI: /my-template (list · fields <name> · use <name> {values} · save [name] · share <name> · delete <name>),
//     reached by a director through three_do run (one line in the app map's lab topic: no new tool, no prompt tokens).
// Ways in: tools/three-templates-hook.js (loaded with the Lab); this file loads on first use (lazy group "labtemplates").
//   LabTemplates.open({ query }) · saveDialog() · saveCurrent({ name, pick }) · form(t) · create(t, values) · list()
//   · remove(t) · share(t) · fromPack(manifest, { thumb }) · state()
const LabTemplates = (() => {
  const C = TemplateCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const err = (e) => { toast(e?.message || String(e), { type: 'error', timeout: 6000 }); };
  const S = () => ThreeLab.scenes;
  const D = () => ThreeLab.director;
  const COPY_MAX = 100 * 1048576; // media over this stay where they are (the template points at them)
  const last = { saved: null, created: null, removed: null, opened: null, preview: null, error: null }; // (dev/checks/labtemplates.js)

  async function lab(show = true) {
    await ThreeLab.cmd({ show });
    for (let i = 0; i < 100 && !D(); i += 1) await sleep(100);
    if (!D() || !S()) throw new Error('The Lab is not ready yet.');
    return { d: D(), sc: S() };
  }

  // ---------- the folder ----------
  let rootDir = null;
  const sepOf = (p) => (/^[A-Za-z]:\\/.test(p) || (p.includes('\\') && !p.includes('/')) ? '\\' : '/');
  const join = (a, ...b) => [String(a).replace(/[\\/]+$/, ''), ...b].join(sepOf(a));
  async function root() {
    if (rootDir) return rootDir;
    const att = await window.hub.attachmentsDir();
    rootDir = join(String(att).replace(/[\\/]attachments[\\/]?$/, ''), 'templates');
    return rootDir;
  }
  let cache = null; // [template (resolved, with _dir / _thumb)]
  const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
  async function readOne(dir) {
    let raw;
    try { raw = JSON.parse(await window.hub.fs.read(join(dir, 'template.json'))); } catch { return null; }
    const ck = C.check(raw);
    if (!ck.ok) return null;
    const t = C.resolve(ck.t, dir);
    t._dir = dir;
    try { t._thumb = `data:image/jpeg;base64,${toB64(await window.hub.fs.read(join(dir, 'thumb.jpg'), { encoding: 'buffer' }))}`; } catch { t._thumb = null; }
    return t;
  }
  async function list({ fresh = false } = {}) {
    if (cache && !fresh) return cache;
    const r = await root();
    let dirs = [];
    try { dirs = (await window.hub.fs.list(r)).filter((x) => x.isDir && !x.name.startsWith('.')); } catch { dirs = []; }
    cache = C.sortNewest((await Promise.all(dirs.map((x) => readOne(x.path)))).filter(Boolean));
    try { store.set('three.myTemplates', cache.length); } catch { /* the hook's count only */ }
    return cache;
  }
  const byName = (name, all = cache || []) => {
    const n = String(name || '').trim().toLowerCase().replace(/^["']|["']$/g, '');
    if (!n) return null;
    return all.find((t) => t.name.toLowerCase() === n) || all.find((t) => t.id === n) || all.find((t) => t.name.toLowerCase().startsWith(n)) || all.find((t) => t.name.toLowerCase().includes(n)) || null;
  };
  const clean = (t) => { const o = { ...t }; delete o._dir; delete o._thumb; return o; };

  // a template onto disk: its media copied into files/, the JSON with tpl: tokens, the picture
  async function write(t, thumb) {
    const dir = join(await root(), t.id);
    const all = C.mediaPaths(t);
    const own = all.filter((p) => String(p).startsWith(dir)); // already its own (a rewrite): unresolve() keeps them
    const paths = all.filter((p) => !own.includes(p));
    const names = C.fileNames(paths, own.map((p) => p.split(/[\\/]/).pop()));
    const map = new Map();
    const kept = [];
    for (const p of paths) {
      let st = null;
      try { st = await window.hub.fs.stat(p); } catch { st = null; }
      if (!st || st.isDir) { kept.push(p.split(/[\\/]/).pop()); continue; }
      if (st.size > COPY_MAX) { kept.push(p.split(/[\\/]/).pop()); continue; } // stays where it is
      const rel = names.get(p);
      await window.hub.fs.copy(p, join(dir, ...rel.split('/')));
      map.set(p, rel);
    }
    const json = C.tokenize(C.unresolve(clean(t), dir), map);
    await window.hub.fs.write(join(dir, 'template.json'), JSON.stringify(json, null, 1));
    if (thumb && /^data:image\/(jpeg|png|webp);base64,/.test(thumb)) await window.hub.fs.write(join(dir, 'thumb.jpg'), thumb.split(',')[1], { base64: true });
    cache = null;
    return { dir, kept };
  }

  // ---------- reading the scene on screen ----------
  async function sceneNow() {
    const { d, sc } = await lab(false);
    const id = sc.currentId();
    const x = sc.get(id);
    if (!x) throw new Error('Open a scene in the Lab first.');
    const st = ThreeLab.tm?.state(id) || { layers: sc.layersOf(x), vals: {} };
    const live = { ...(st.vals || {}) };
    // the sliders as they are now (moved but not saved count: that's what you see)
    for (const L of st.layers || []) { try { const c = ThreeLab.stageHooks?.ctlOf?.(L.id); for (const s of c?.controls() || []) (live[L.id] ||= {})[s.key] = s.value; } catch { /* not built yet */ } }
    const scene = { name: x.name, layers: st.layers || [], palette: d.refs?.palette?.() || x.palette || [], extras: sc.extrasOf(id) || {}, refs: (d.refs?.list() || []).map((r) => ({ key: r.key, name: r.name, kind: r.kind, path: r.path })) };
    const fields = C.extract(scene, { scan: ThreeTweaks.scan, live });
    return { id, scene, fields, d, sc };
  }
  async function snapshot(d, id) {
    let url = null;
    try { url = await d.shotSmall(480); } catch { url = null; }
    return url || S()?.thumbOf(id) || null;
  }

  // ---------- saving ----------
  const uniqueTplName = (name, all = cache || []) => { const have = new Set(all.map((t) => t.name.toLowerCase())); let n = C.safeName(name); const b = n; for (let i = 2; have.has(n.toLowerCase()); i += 1) n = `${b} ${i}`; return n; };
  // straight away (chat / the director): every field unless pick says otherwise
  async function saveCurrent({ name = null, pick = null, thumb = undefined, replace = false } = {}) {
    const now = await sceneNow();
    const all = await list();
    const old = name && replace ? all.find((t) => t.name.toLowerCase() === C.safeName(name).toLowerCase()) : null;
    const nm = old ? old.name : uniqueTplName(name || now.scene.name, all);
    const keep = pick ? now.fields.filter((f) => pick.has(f.id)) : now.fields;
    const t = C.make(now.scene, keep, { name: nm, platform: await Promise.resolve(window.hub.platform?.()).catch(() => '') });
    const pic = thumb === undefined ? await snapshot(now.d, now.id) : thumb;
    const r = await write(t, pic);
    if (old) await trashDir(old._dir).catch(() => {});
    last.saved = { id: t.id, name: t.name, dir: r.dir, fields: t.fields.length, kept: r.kept, replaced: Boolean(old) };
    await list({ fresh: true });
    return last.saved;
  }
  // the save card: name, picture, which parts become fields
  let saveDlg = null;
  async function saveDialog() {
    const now = await sceneNow();
    const all = await list();
    const thumb = await snapshot(now.d, now.id);
    closeSave();
    const pick = C.defaultPick(now.fields);
    const name = el('input', { class: 'lt-name-in', type: 'text', value: now.scene.name, attrs: { 'aria-label': 'Template name', spellcheck: 'false', maxlength: '80' } });
    const okBtn = el('button', { type: 'button', class: 'primary lt-save-ok', text: 'Save template' });
    const paintOk = () => { const ex = all.find((t) => t.name.toLowerCase() === name.value.trim().toLowerCase()); okBtn.textContent = ex ? `Replace "${ex.name}"` : 'Save template'; okBtn.title = ex ? 'The old one goes to the Trash' : ''; okBtn.disabled = !name.value.trim(); };
    name.addEventListener('input', paintOk);
    // the parts, grouped: one check per group, each field inside a fold
    const groups = [];
    const add = (id, label, fields) => { if (fields.length) groups.push({ id, label, fields }); };
    add('text', 'Text', now.fields.filter((f) => f.kind === 'text'));
    add('media', 'Pictures, video & sound', now.fields.filter((f) => C.MEDIA_KINDS.has(f.kind)));
    add('palette', 'Palette', now.fields.filter((f) => f.kind === 'palette'));
    const sl = now.fields.filter(C.isSlider);
    for (const ln of [...new Set(sl.map((f) => f.layer))]) { const fs = sl.filter((f) => f.layer === ln); add(`s:${ln}`, `Sliders · ${fs[0].layerName || 'Layer'}`, fs); }
    const count = el('span', { class: 'muted small lt-save-count' });
    const paintCount = () => { count.textContent = `${pick.size} field${pick.size === 1 ? '' : 's'} to fill in`; };
    const rows = groups.map((g) => {
      const box = el('input', { type: 'checkbox', checked: true });
      const items = g.fields.map((f) => {
        const cb = el('input', { type: 'checkbox', checked: true, dataset: { field: f.id }, on: { change: () => { if (cb.checked) pick.add(f.id); else pick.delete(f.id); sync(); } } });
        return el('label', { class: 'check lt-save-field' }, cb, el('span', { text: f.label }), el('span', { class: 'muted small', text: valueText(f) }));
      });
      const sync = () => { const n = g.fields.filter((f) => pick.has(f.id)).length; box.checked = n > 0; box.indeterminate = n > 0 && n < g.fields.length; paintCount(); };
      box.addEventListener('change', () => { for (const f of g.fields) { if (box.checked) pick.add(f.id); else pick.delete(f.id); } items.forEach((it) => { it.querySelector('input').checked = box.checked; }); sync(); });
      return el('details', { class: 'lt-save-group', dataset: { group: g.id } },
        el('summary', {}, el('label', { class: 'check', on: { click: (e) => e.stopPropagation() } }, box, el('b', { text: g.label })), el('span', { class: 'muted small', text: ` ${g.fields.length}` })),
        el('div', { class: 'lt-save-fields' }, items));
    });
    paintCount(); paintOk();
    const pic = el('div', { class: `lt-save-pic${thumb ? '' : ' none'}` }, thumb ? el('img', { attrs: { src: thumb, alt: '', draggable: 'false' } }) : el('span', { text: '📐' }));
    return new Promise((resolve) => {
      let done = false;
      const finish = async (go) => {
        if (done) return; done = true;
        const nm = name.value.trim();
        closeSave();
        if (!go) { resolve(null); return; }
        try {
          const r = await saveCurrent({ name: nm, pick, thumb, replace: true });
          toast(`📐 "${r.name}" is in My templates (${r.fields} field${r.fields === 1 ? '' : 's'})${r.kept.length ? ` · ${r.kept.length} big file${r.kept.length === 1 ? '' : 's'} stay${r.kept.length === 1 ? 's' : ''} where ${r.kept.length === 1 ? 'it is' : 'they are'}` : ''}`, { timeout: 5000, action: { label: 'See them', fn: () => open().catch(err) } });
          resolve(r);
        } catch (e) { last.error = e.message; err(e); resolve(null); }
      };
      okBtn.addEventListener('click', () => finish(true));
      saveDlg = el('dialog', { class: 'lt-save', attrs: { 'aria-label': 'Save as my template' } },
        el('div', { class: 'lt-save-head muted small', text: 'Save as my template' }),
        el('div', { class: 'lt-save-main' }, pic,
          el('div', { class: 'lt-save-info' },
            el('label', { class: 'lt-lab small muted', text: 'Name' }), name,
            el('div', { class: 'lt-save-hint small muted', text: 'What someone fills in when they start from it (all of it by default):' }),
            el('div', { class: 'lt-save-groups' }, rows.length ? rows : el('div', { class: 'muted small', text: 'No sliders, text, colors or media here: it keeps the scene as it is.' })))),
        el('div', { class: 'dialog-actions' }, count, el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'ghost', text: 'Cancel', on: { click: () => finish(false) } }), okBtn));
      saveDlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(false); });
      saveDlg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target === name && !okBtn.disabled) { e.preventDefault(); finish(true); } });
      document.body.append(saveDlg);
      saveDlg.showModal();
      name.focus(); name.select();
    });
  }
  function closeSave() { if (saveDlg) { try { saveDlg.close(); } catch { /* closed */ } saveDlg.remove(); saveDlg = null; } }
  function valueText(f) {
    if (f.kind === 'palette') return (f.value || []).join(' ');
    if (C.MEDIA_KINDS.has(f.kind)) return String(f.value || '').split(/[\\/]/).pop() || 'empty';
    if (f.kind === 'text') { const s = String(f.value || '').replace(/\s+/g, ' '); return s.length > 28 ? `"${s.slice(0, 27)}…"` : `"${s}"`; }
    if (f.kind === 'number') return String(Number(Number(f.value).toFixed(3)));
    return String(f.value);
  }

  // ---------- the picker ----------
  let pk = null; // { dlg, shade, search, body, all }
  async function open({ query = '' } = {}) {
    await lab(true);
    close();
    const all = await list({ fresh: true });
    const search = el('input', { class: 'lt-search', attrs: { type: 'search', placeholder: 'Search your templates', 'aria-label': 'Search my templates', spellcheck: 'false' }, value: query });
    search.value = query;
    const body = el('div', { class: 'lt-body', attrs: { tabindex: '-1' } });
    const count = el('span', { class: 'muted small' });
    const dlg = el('dialog', { class: 'lt-dlg', attrs: { 'aria-label': 'My templates' } },
      el('div', { class: 'lt-head' }, el('h2', { text: '📐 My templates' }), search, el('button', { type: 'button', class: 'ghost small lt-x', title: 'Close (Esc)', text: '✕', on: { click: () => close() } })),
      body,
      el('div', { class: 'lt-foot' }, el('span', { class: 'muted small', text: 'Click: fill it in, then a new scene · right-click: more' }), el('span', { class: 'spacer' }),
        typeof LabBatchHook !== 'undefined' ? el('button', { type: 'button', class: 'ghost small lt-batch', text: '⧉ Make a batch…', title: 'Many videos from one template: a list of titles, a CSV, every song in a folder (round 42)', on: { click: () => { const id = pk?.body.querySelector('.lt-card:focus')?.dataset.id || null; close(); LabBatchHook.open({ template: id }); } } }) : null,
        el('button', { type: 'button', class: 'ghost small lt-save-this', text: '＋ Save this scene as a template…', on: { click: () => { close(); saveDialog().catch(err); } } }), count));
    const shade = el('div', { class: 'lt-shade', on: { pointerdown: (e) => { e.preventDefault(); close(); } } });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Enter' && e.target === search) { e.preventDefault(); body.querySelector('.lt-card')?.click(); }
      else if (e.key === 'ArrowDown' && e.target === search) { e.preventDefault(); body.querySelector('.lt-card')?.focus(); }
    });
    document.body.append(shade, dlg);
    dlg.show();
    search.focus();
    pk = { dlg, shade, search, body, all };
    const paint = () => {
      const shown = C.search(all, search.value);
      if (!all.length) body.replaceChildren(el('div', { class: 'lt-empty' }, el('div', { class: 'lt-empty-big', text: '📐' }), el('p', { text: 'No templates yet.' }), el('p', { class: 'muted small', text: 'Turn any scene into a starting point: its words, colors, pictures and sliders become a short form to fill in.' }), el('button', { type: 'button', class: 'primary', text: 'Save this scene as a template…', on: { click: () => { close(); saveDialog().catch(err); } } })));
      else if (!shown.length) body.replaceChildren(el('div', { class: 'lt-empty muted', text: `Nothing like "${search.value}". Try another word.` }));
      else body.replaceChildren(el('div', { class: 'lt-grid' }, shown.map(cardFor)));
      count.textContent = all.length ? `${shown.length} of ${all.length}` : '';
    };
    let st = 0;
    search.addEventListener('input', () => { clearTimeout(st); st = setTimeout(paint, 100); });
    paint();
    last.opened = { count: all.length };
    return all.length;
  }
  function cardFor(t) {
    const pic = el('div', { class: `lt-pic${t._thumb ? ' has' : ''}` }, t._thumb ? el('img', { attrs: { src: t._thumb, alt: '', draggable: 'false', decoding: 'async' } }) : el('span', { class: 'lt-wait', text: '📐' }));
    return el('button', { type: 'button', class: 'lt-card', dataset: { id: t.id }, title: `${t.name}\n${C.describe(t)}`,
      on: {
        click: () => { close(); form(t).catch(err); },
        contextmenu: (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, menuFor(t)); },
        keydown: (e) => { if (/^Arrow/.test(e.key)) { e.preventDefault(); const l = [...pk.body.querySelectorAll('.lt-card')]; const i = l.indexOf(e.currentTarget); l[Math.max(0, Math.min(l.length - 1, i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1)))]?.focus(); } },
      } },
    pic, el('span', { class: 'lt-name', text: t.name }), el('span', { class: 'lt-desc', text: `${C.describe(t)} · ${when(t.updatedAt || t.at)}` }));
  }
  function when(at) {
    if (!at) return '';
    const d = (Date.now() - at) / 1000;
    if (d < 90) return 'just now';
    if (d < 3600) return `${Math.round(d / 60)} min ago`;
    if (d < 86400) return `${Math.round(d / 3600)} h ago`;
    if (d < 86400 * 14) return `${Math.round(d / 86400)} days ago`;
    return new Date(at).toLocaleDateString();
  }
  function menuFor(t) {
    return [
      t.name,
      { label: '✦ Fill it in…', hint: 'then a new scene', action: () => { close(); form(t).catch(err); } },
      { label: 'A new scene as it is', hint: 'its own values, no form', action: () => { close(); create(t, {}).catch(err); } },
      ...(typeof LabBatchHook !== 'undefined' ? [{ label: '⧉ Make a batch…', hint: 'many videos from a list: titles, songs, pictures', action: () => { close(); LabBatchHook.open({ template: t.id }); } }] : []), // (round 42, labbatch)
      { label: 'Rename…', action: () => rename(t).catch(err) },
      { label: '⇪ Share as a pack…', hint: 'one .hearthpack file with its media', action: () => share(t).catch(err) },
      { label: 'Show in folder', more: true, action: () => window.hub.fs.reveal(join(t._dir, 'template.json')) },
      '-',
      { label: 'Delete…', danger: true, hint: 'to the Trash', action: () => remove(t, { ask: true }).catch(err) },
    ];
  }
  function close() { if (!pk) return; const p = pk; pk = null; p.shade.remove(); try { p.dlg.close(); } catch { /* closed */ } p.dlg.remove(); }

  // ---------- rename / delete / share ----------
  async function rename(t, to = null) {
    const nm = to ?? await Modal.prompt('Rename the template', { value: t.name });
    if (!nm?.trim() || nm.trim() === t.name) return false;
    const all = await list();
    t.name = uniqueTplName(nm.trim(), all.filter((x) => x.id !== t.id));
    t.updatedAt = Date.now();
    await window.hub.fs.write(join(t._dir, 'template.json'), JSON.stringify(C.unresolve(clean(t), t._dir), null, 1));
    cache = null;
    if (pk) { close(); open().catch(err); }
    return t.name;
  }
  async function trashDir(dir) {
    const r = await window.hub.fs.trash([dir]);
    if (r?.failed?.length) throw new Error(`It couldn't go to the Trash: ${r.failed[0].error || 'unknown reason'}. Nothing was deleted.`);
    return true;
  }
  async function remove(t, { ask = false } = {}) {
    if (ask && !(await Modal.confirm('Delete this template?', `"${t.name}" goes to the Trash (with its picture and media). Scenes you made from it stay.`, { ok: 'Move to Trash', danger: true }))) return false;
    const kept = await window.UndoAll?.keepFiles?.([t._dir]); // (round 41, undoall) a copy first: Ctrl/⌘+Z brings it back
    await trashDir(t._dir);
    window.UndoAll?.deleted?.(kept, { what: 'template', name: t.name });
    cache = null;
    last.removed = { id: t.id, name: t.name, dir: t._dir };
    toast(`📐 "${t.name}" is in the Trash`, { timeout: 3500 });
    if (pk) { close(); open().catch(err); }
    await list({ fresh: true });
    return true;
  }
  async function packs() {
    if (typeof LabPacks === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('packs');
    if (typeof LabPacks === 'undefined') throw new Error('Packs did not load');
    return LabPacks;
  }
  async function share(t) {
    const P = await packs();
    const sc = t.scene;
    const sd = { key: 'main', sketch: { name: sc.name, layers: sc.layers, code: sc.layers[0]?.code || '', ...(sc.palette?.length ? { palette: sc.palette } : {}) }, extras: sc.extras || {}, refs: sc.refs || [] };
    return P.save({ kind: 'template', name: t.name, desc: t.desc || '', scenes: [sd], template: { fields: t.fields, desc: t.desc || '' }, song: sc.extras?.media?.path || null, thumb: t._thumb || null });
  }
  // a .hearthpack of kind "template" opened (tools/three-packs.js): its paths already point at the unpacked files
  async function fromPack(m, { thumb = null } = {}) {
    const s = m.scenes?.[0];
    if (!s?.sketch) throw new Error('The pack has no template in it');
    const all = await list();
    const scene = { name: s.sketch.name || m.name, layers: Array.isArray(s.sketch.layers) && s.sketch.layers.length ? s.sketch.layers : [{ id: 'main', name: s.sketch.name || 'Layer', code: s.sketch.code || '' }], palette: s.sketch.palette || [], extras: s.extras || {}, refs: s.refs || [] };
    const known = new Set(C.extract(scene, { scan: ThreeTweaks.scan }).map((f) => f.id));
    const fields = (m.template?.fields || []).filter((f) => f && typeof f.id === 'string' && (known.has(f.id) || C.MEDIA_KINDS.has(f.kind)));
    const t = C.make(scene, fields, { name: uniqueTplName(m.name, all), desc: m.template?.desc || m.desc || '' });
    const ck = C.check(t);
    if (!ck.ok) throw new Error(`The template in the pack can't be used: ${ck.problems.join(' ')}`);
    const w = await write(ck.t, thumb);
    await list({ fresh: true });
    const got = byName(ck.t.name);
    toast(`📐 "${ck.t.name}" is in My templates`, { timeout: 6000, action: got ? { label: 'Fill it in', fn: () => form(got).catch(err) } : undefined });
    return { template: ck.t.name, id: ck.t.id, fields: ck.t.fields.length, kept: w.kept };
  }

  // ---------- the form: its fields + a live preview ----------
  let fm = null; // { dlg, shade, t, vals, stage, … }
  function fieldRow(f, vals, changed) {
    const set = (v) => { vals[f.id] = C.coerce(f, v); changed(f); };
    const lab = el('span', { class: 'lt-flabel', text: f.label, title: f.layerName ? `${f.label} · ${f.layerName}` : f.label });
    let input;
    if (f.kind === 'text') {
      const multi = String(f.value || '').includes('\n');
      input = el(multi ? 'textarea' : 'input', { class: 'lt-text', ...(multi ? { rows: 2 } : { type: 'text' }), value: vals[f.id] ?? '', attrs: { spellcheck: 'false', 'aria-label': f.label }, on: { input: (e) => set(e.target.value) } });
      if (multi) input.value = vals[f.id] ?? '';
    } else if (f.kind === 'palette') {
      const sw = el('div', { class: 'lt-pal' });
      const paint = () => sw.replaceChildren(...(vals[f.id] || []).map((c, i) => el('input', { type: 'color', value: c, title: c, attrs: { 'aria-label': `Palette color ${i + 1}` }, on: { input: (e) => { const p = [...vals[f.id]]; p[i] = e.target.value; set(p); } } })));
      paint(); input = sw;
    } else if (C.MEDIA_KINDS.has(f.kind)) {
      input = mediaSlot(f, vals, set);
    } else if (f.kind === 'color') {
      input = el('input', { type: 'color', class: 'lt-color', value: vals[f.id], attrs: { 'aria-label': f.label }, on: { input: (e) => set(e.target.value) } });
    } else if (f.kind === 'bool') {
      input = el('input', { type: 'checkbox', class: 'lt-bool', checked: Boolean(vals[f.id]), attrs: { 'aria-label': f.label }, on: { change: (e) => set(e.target.checked) } });
    } else if (f.kind === 'choice') {
      input = el('select', { class: 'lt-choice', attrs: { 'aria-label': f.label }, on: { change: (e) => set(e.target.value) } }, (f.options || []).map((o) => el('option', { value: o, text: o, selected: o === vals[f.id] })));
    } else {
      const num = el('input', { type: 'number', class: 'lt-num', value: vals[f.id], step: f.int ? 1 : (f.step || 'any'), attrs: { 'aria-label': f.label } });
      const rng = el('input', { type: 'range', class: 'lt-range', min: f.min ?? 0, max: f.max ?? 1, step: f.int ? 1 : (f.step || 0.01), value: vals[f.id], attrs: { 'aria-label': f.label } });
      rng.addEventListener('input', () => { num.value = rng.value; set(Number(rng.value)); });
      num.addEventListener('change', () => { set(Number(num.value)); num.value = vals[f.id]; rng.value = vals[f.id]; });
      input = el('div', { class: 'lt-numrow' }, rng, num);
    }
    return el('div', { class: `lt-row lt-k-${f.kind}`, dataset: { field: f.id } }, lab, input);
  }
  const ACCEPT = { image: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'svg'], video: ['mp4', 'webm', 'mov', 'm4v', 'mkv'], audio: ['wav', 'mp3', 'ogg', 'm4a', 'flac', 'aac', 'aiff', 'opus'] };
  const ICON = { image: '🖼', video: '🎞', audio: '🔊' };
  function mediaSlot(f, vals, set) {
    const pic = el('div', { class: 'lt-mpic' });
    const nm = el('span', { class: 'lt-mname small' });
    const paint = () => {
      const p = vals[f.id];
      nm.textContent = p ? p.split(/[\\/]/).pop() : 'Drop a file here, or click';
      if (p && f.kind === 'image') pic.replaceChildren(el('img', { attrs: { src: WinMac.fileUrl(p), alt: '', draggable: 'false' } })); else pic.replaceChildren(el('span', { text: ICON[f.kind] || '📄' }));
      slot.classList.toggle('empty', !p);
      slot.classList.toggle('changed', p !== f.value);
    };
    const take = (p) => {
      if (!p) return;
      if (C.mediaKind(p) !== f.kind && !(f.kind === 'audio' && C.mediaKind(p) === 'video')) { toast(`That isn't ${f.kind === 'audio' ? 'a sound' : `a ${f.kind === 'image' ? 'picture' : 'video'}`}`, { type: 'error' }); return; }
      set(p); paint();
    };
    const slot = el('div', { class: 'lt-media', attrs: { tabindex: '0', role: 'button', 'aria-label': `${f.label}: drop a file or click to pick one` },
      on: {
        click: async (e) => { if (e.target.closest('.lt-mreset')) return; const r = await window.hub.openDialog({ title: f.label, filters: [{ name: f.kind, extensions: ACCEPT[f.kind] || ['*'] }], properties: ['openFile'] }); take(r?.[0]); },
        keydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); slot.click(); } },
        dragover: (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); e.stopPropagation(); slot.classList.add('over'); } },
        dragleave: () => slot.classList.remove('over'),
        drop: (e) => { e.preventDefault(); e.stopPropagation(); slot.classList.remove('over'); const file = e.dataTransfer?.files?.[0]; let p = null; try { p = file ? window.hub.pathForFile(file) : null; } catch { p = null; } take(p); },
      } },
    pic, nm, el('button', { type: 'button', class: 'ghost small lt-mreset', text: '↺', title: 'Back to the template\'s own', on: { click: (e) => { e.stopPropagation(); set(f.value); paint(); } } }));
    slot.take = take; // (dev/checks/labtemplates.js: a drop without a real drag)
    paint();
    return slot;
  }

  // the live preview: the template with the values typed, running on a small stage of its own (a hidden sandbox laid
  // over the preview box: one WebGL context only while the form is open, gone when it closes)
  function makePreview(t, slot, caption) {
    if (typeof ThreeBackstage === 'undefined' || !ThreeBackstage.make) return null;
    const sk = { id: 'tpl-preview', name: t.name, layers: [], updatedAt: 0 };
    const scenes = { get: (id) => (id === sk.id ? sk : null), layersOf: (x) => x.layers, selectedOf: () => null, frameOf: () => t.scene.extras?.frame || null, setFrame() {}, songOf: () => null, changed() {}, create() { throw new Error('preview'); } };
    const stage = ThreeBackstage.make({ long: 420, cap: 24, scenes, idleMs: 30 * 60000 });
    let nonce = 0; let sentSig = ''; let gen = 0; let busy = null; let again = false; let refBytes = new Map(); let runs = 0;
    const place = () => {
      const h = stage.host; if (!h || !slot.isConnected) return;
      const r = slot.getBoundingClientRect(); const w = h.offsetWidth || 1; const hh = h.offsetHeight || 1;
      const k = Math.min(r.width / w, r.height / hh);
      h.classList.add('lt-stage-on');
      h.style.transform = `translate(${Math.round(r.left + (r.width - w * k) / 2)}px, ${Math.round(r.top + (r.height - hh * k) / 2)}px) scale(${k})`;
    };
    // what the sandbox needs besides the code: the pictures / videos of the references, the palette
    async function refsMsg(scene) {
      const items = [];
      for (const r of scene.refs || []) {
        if (!['image', 'video'].includes(r.kind) || !r.path) continue;
        let buf = refBytes.get(r.path);
        if (!buf) { try { const u8 = await window.hub.fs.read(r.path, { encoding: 'buffer', maxBytes: 25 * 1048576 }); buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength); refBytes.set(r.path, buf); } catch { continue; } }
        const ext = r.path.split('.').pop().toLowerCase();
        items.push({ key: r.key, kind: r.kind, mime: r.kind === 'image' ? `image/${ext === 'jpg' ? 'jpeg' : ext === 'svg' ? 'svg+xml' : ext}` : `video/${ext === 'mov' ? 'quicktime' : ext}`, buffer: buf.slice(0) });
      }
      return { type: 'refs', items, palette: scene.palette || [] };
    }
    async function run(vals) {
      const my = ++gen;
      const r = C.apply(t, vals, { scan: ThreeTweaks.scan, applyValues: ThreeTweaks.applyValues });
      const sig = JSON.stringify([r.palette, (r.refs || []).map((x) => x.path)]);
      const first = !stage.running;
      if (first || sig !== sentSig) {
        if (first) { sk.layers = r.layers; sk.updatedAt = Date.now(); await stage.handle('three_console', {}, { sketchId: sk.id }); place(); }
        if (my !== gen) return;
        stage.send?.(await refsMsg(r));
        sentSig = sig; nonce += 1;
      }
      sk.layers = r.layers.map((L) => ({ ...L, code: `${L.code}\n// preview ${nonce}` }));
      sk.updatedAt = Date.now();
      const rep = await stage.handle('three_console', {}, { sketchId: sk.id });
      runs += 1;
      place();
      const errs = rep?.value?.errors || [];
      caption.textContent = errs.length ? `⚠ ${String(errs[0].message || errs[0]).slice(0, 90)}` : 'Live preview';
      caption.classList.toggle('bad', Boolean(errs.length));
      last.preview = { runs, errors: errs.length, nonce };
    }
    // one at a time; the newest values win
    function update(vals) {
      if (busy) { again = vals; return busy; }
      busy = run(vals).catch((e) => { caption.textContent = `⚠ ${e.message}`; }).finally(() => { busy = null; if (again) { const v = again; again = false; update(v); } });
      return busy;
    }
    addEventListener('resize', place);
    return { update, place, stage, get busy() { return Boolean(busy); }, dispose() { removeEventListener('resize', place); stage.dispose(); refBytes = new Map(); } };
  }

  async function form(t) {
    await lab(true);
    closeForm();
    const vals = C.defaults(t);
    last.preview = null;
    const shade = el('div', { class: 'lt-shade', on: { pointerdown: (e) => { e.preventDefault(); closeForm(); } } });
    const slot = el('div', { class: 'lt-prev-box' }, t._thumb ? el('img', { class: 'lt-prev-still', attrs: { src: t._thumb, alt: '', draggable: 'false' } }) : null);
    const caption = el('div', { class: 'lt-prev-cap muted small', text: 'Starting the preview…' });
    const frame = t.scene.extras?.frame;
    const z = frame && typeof ThreeMedia !== 'undefined' ? ThreeMedia.SIZES.find((x) => x.id === frame && x.w) : null;
    const aspect = z ? z.w / z.h : 16 / 9;
    // the box at the frame's shape, as big as its column allows (portrait frames stay whole)
    const fit = () => { const col = slot.parentElement; if (!col) return; const W = col.clientWidth; const Hh = Math.max(60, col.clientHeight - caption.offsetHeight - 8); let w = W; let h = W / aspect; if (h > Hh) { h = Hh; w = h * aspect; } slot.style.width = `${Math.round(w)}px`; slot.style.height = `${Math.round(h)}px`; };
    let pv = null; let pvT = 0;
    const changed = () => { clearTimeout(pvT); pvT = setTimeout(() => pv?.update({ ...vals }), 180); paintReset(); };
    const shown = t.fields.filter((f) => !C.isSlider(f));
    const sliders = t.fields.filter(C.isSlider);
    const SHOW = 8;
    const rows = [...shown, ...sliders.slice(0, SHOW)].map((f) => fieldRow(f, vals, changed));
    const more = sliders.length > SHOW ? el('details', { class: 'lt-more' }, el('summary', { class: 'small', text: `More sliders (${sliders.length - SHOW})` }), sliders.slice(SHOW).map((f) => fieldRow(f, vals, changed))) : null;
    const nameIn = el('input', { type: 'text', class: 'lt-newname', value: t.name, attrs: { 'aria-label': 'The new scene\'s name', spellcheck: 'false', maxlength: '80' } });
    const resetBtn = el('button', { type: 'button', class: 'ghost small lt-reset', text: '↺ Its own values', title: 'Every field back to the template\'s own', on: { click: () => { const keep = { name: nameIn.value }; closeForm(); form(t).then(() => { if (fm) fm.nameIn.value = keep.name; }).catch(err); } } });
    const paintReset = () => { resetBtn.disabled = t.fields.every((f) => JSON.stringify(vals[f.id]) === JSON.stringify(f.value)); };
    const createBtn = el('button', { type: 'button', class: 'primary lt-create', text: 'Create', title: 'A new scene with these values (Enter)' });
    const dlg = el('dialog', { class: 'lt-form', attrs: { 'aria-label': `New from "${t.name}"` } },
      el('div', { class: 'lt-head' }, el('h2', { text: `📐 ${t.name}` }), el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'ghost small lt-x', title: 'Close (Esc)', text: '✕', on: { click: () => closeForm() } })),
      el('div', { class: 'lt-form-main' },
        el('div', { class: 'lt-prev' }, slot, caption),
        el('div', { class: 'lt-fields' }, rows.length || more ? [...rows, more] : el('div', { class: 'muted small', text: 'No fields: Create makes the scene as it is.' }))),
      el('div', { class: 'lt-foot' }, el('label', { class: 'lt-lab small muted', text: 'New scene' }), nameIn, el('span', { class: 'spacer' }), resetBtn, el('button', { type: 'button', class: 'ghost', text: 'Cancel', on: { click: () => closeForm() } }), createBtn));
    const go = async () => {
      if (createBtn.disabled) return;
      createBtn.disabled = true;
      const v = { ...vals }; const nm = nameIn.value.trim() || t.name;
      closeForm();
      try { await create(t, v, { name: nm }); } catch (e) { last.error = e.message; err(e); }
    };
    createBtn.addEventListener('click', go);
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeForm(); }
      else if (e.key === 'Enter' && !e.shiftKey && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'SUMMARY') { e.preventDefault(); go(); }
    });
    dlg.querySelector('.lt-fields').addEventListener('scroll', () => pv?.place(), { passive: true });
    document.body.append(shade, dlg);
    dlg.show();
    paintReset();
    (dlg.querySelector('.lt-fields input, .lt-fields textarea') || createBtn).focus();
    fm = { dlg, shade, t, vals, nameIn, slot, set: (id, v) => { const f = t.fields.find((x) => x.id === id); const row = dlg.querySelector(`.lt-row[data-field="${CSS.escape(id)}"]`); if (!f || !row) return false; if (C.MEDIA_KINDS.has(f.kind)) row.querySelector('.lt-media').take(v); else { vals[id] = C.coerce(f, v); if (f.kind !== 'palette') for (const inp of row.querySelectorAll('input, textarea, select')) { if (inp.type === 'checkbox') inp.checked = Boolean(vals[id]); else inp.value = vals[id]; } changed(); } return true; }, create: go };
    // the preview starts once the form is laid out
    requestAnimationFrame(() => {
      if (!fm || fm.dlg !== dlg) return;
      fit(); fm.onResize = () => { fit(); pv?.place(); }; addEventListener('resize', fm.onResize);
      pv = makePreview(t, slot, caption);
      fm.pv = pv;
      if (!pv) { caption.textContent = t._thumb ? 'Its picture (no live preview here)' : ''; return; }
      pv.update({ ...vals }).then(() => { slot.querySelector('.lt-prev-still')?.remove(); });
    });
    return fm;
  }
  function closeForm() { if (!fm) return; const f = fm; fm = null; f.pv?.dispose(); if (f.onResize) removeEventListener('resize', f.onResize); f.shade.remove(); try { f.dlg.close(); } catch { /* closed */ } f.dlg.remove(); }

  // ---------- creating the scene ----------
  const uniqueScene = (name) => { const have = new Set((S()?.all() || []).map((x) => x.name)); let n = name; for (let i = 2; have.has(n); i += 1) n = `${name} ${i}`; return n; };
  async function create(t, values = {}, { name = null, quiet = false } = {}) {
    const { d, sc } = await lab(true);
    const r = C.apply(t, values, { scan: ThreeTweaks.scan, applyValues: ThreeTweaks.applyValues, name });
    const prev = sc.currentId();
    const ex = { ...r.extras };
    const frame = ex.frame || null; const timeline = ex.timeline || null;
    const x = sc.create({ name: uniqueScene(r.name), code: r.layers[0]?.code || '', layers: r.layers, frame, timeline });
    delete ex.frame; delete ex.timeline;
    if (Object.keys(ex).length) sc.setExtras?.(x.id, ex);
    d.openSketch(x.id);
    const notes = [];
    for (const ref of r.refs || []) { try { await d.refs.add(ref.path, ref.key); } catch (e) { notes.push(`${ref.name}: ${e.message}`); } }
    if (r.palette?.length) d.refs.setPalette(r.palette);
    // its first version in the time machine, named after the template
    try { await window.ThreeHistory?.capture?.(x.id, { label: `From my template "${t.name}"`, force: true }); } catch { /* no history */ }
    last.created = { id: x.id, name: x.name, template: t.name, changed: r.changed, prev, notes };
    if (notes.length) console.warn('labtemplates: create notes', notes);
    if (!quiet) toast(`📐 "${x.name}" is a new scene from your template${r.changed.length ? ` (${r.changed.length} field${r.changed.length === 1 ? '' : 's'} filled in)` : ''}`, { timeout: 6000, action: { label: 'Undo', fn: () => undoCreate(x.id).catch(err) } });
    return last.created;
  }
  // one step back: the new scene goes (to History's deleted sketches, like Delete…) and the one before comes back
  async function undoCreate(id = last.created?.id) {
    const sc = S();
    if (!id || !sc?.get(id)) return false;
    const prev = last.created?.id === id ? last.created.prev : null;
    if (prev && sc.get(prev) && sc.currentId() === id) D()?.openSketch(prev);
    const ok = sc.remove?.(id);
    if (ok && last.created?.id === id) last.created.undone = true;
    return Boolean(ok);
  }

  // ---------- chat (the app's internal API; the AI reaches it through three_do run) ----------
  // "use <name> {json}" / "use <name> key=value, …" / "use \"Name\" …" → { name, rest }
  function splitNameArgs(s) {
    s = String(s || '').trim();
    const q = /^(["'])(.*?)\1\s*(.*)$/.exec(s);
    if (q) return { name: q[2], rest: q[3] };
    const b = s.indexOf('{');
    if (b >= 0) return { name: s.slice(0, b).trim(), rest: s.slice(b) };
    const m = /(^|\s)[^\s=]+\s*=/.exec(s);
    if (m) return { name: s.slice(0, m.index).trim(), rest: s.slice(m.index).trim() };
    return { name: s, rest: '' };
  }
  const fieldLine = (f) => `${f.label}${f.layerName && C.isSlider(f) ? ` (${f.layerName})` : ''}: ${f.kind === 'number' ? `number ${f.min ?? ''}–${f.max ?? ''}` : f.kind === 'choice' ? (f.options || []).join('|') : C.MEDIA_KINDS.has(f.kind) ? `${f.kind} file` : f.kind} = ${f.kind === 'text' ? JSON.stringify(f.value) : valueText(f)}`;
  function register() {
    if (typeof Commands === 'undefined' || Commands.get('my-template')) return;
    Commands.register({
      name: 'my-template', aliases: ['my-templates'], area: 'Three.js Lab',
      args: '[list | fields <name> | use <name> [{"Field": value} | field=value, …] | save [name] | share <name> | delete <name>]',
      desc: 'Your own Lab templates (no tokens): list them, see a template\'s fields, make a new scene from one with its fields filled in, save the scene on screen as one, share one as a pack; alone: the picker',
      keywords: 'template templates starter starting point reuse preset my own save as template fill in form fields new scene from',
      examples: ['/my-template', '/my-template list', '/my-template use Neon title {"Title": "HELLO"}', '/my-template save'],
      complete: (a) => { const s = String(a || ''); const w = s.split(/\s+/)[0].toLowerCase(); if (!s.includes(' ')) return ['list', 'fields ', 'use ', 'save ', 'share ', 'delete '].filter((x) => x.startsWith(w)).map((value) => ({ value })); return (cache || []).filter((t) => t.name.toLowerCase().startsWith(s.slice(w.length + 1).toLowerCase())).slice(0, 12).map((t) => ({ value: `${w} ${t.name}` })); },
      async run(args, ctx = {}) {
        const s = String(args || '').trim();
        const m = /^(\w+)\b\s*(.*)$/s.exec(s);
        const op = (m?.[1] || '').toLowerCase(); const rest = (m?.[2] || '').trim();
        const byAI = ctx.source === 'code';
        const all = await list({ fresh: true });
        if (!op || op === 'open' || op === 'new' || op === 'pick') { if (byAI) return listText(all); await open({ query: rest }); return all.length ? '' : 'No templates yet.'; }
        if (op === 'list') return listText(all);
        if (op === 'save') {
          if (!byAI && !rest) { await saveDialog(); return ''; }
          const r = await saveCurrent({ name: rest || null });
          return `Saved "${r.name}" in My templates (${r.fields} fields).`;
        }
        const { name, rest: vtext } = splitNameArgs(rest);
        const t = byName(name, all);
        if (!t) return `No template "${name}". ${listText(all)}`;
        if (op === 'fields' || op === 'info') return `"${t.name}" (${C.describe(t)}):\n${t.fields.map(fieldLine).join('\n') || 'no fields'}`;
        if (op === 'use' || op === 'make' || op === 'apply') {
          const { values, unknown } = C.parseValues(t, vtext);
          if (!byAI && !vtext) { await form(t); return ''; }
          const r = await create(t, values);
          return `Made "${r.name}" from "${t.name}"${r.changed.length ? `, ${r.changed.length} field${r.changed.length === 1 ? '' : 's'} filled in` : ' with its own values'}${unknown.length ? `; no field named ${unknown.map((u) => `"${u}"`).join(', ')} (fields: ${t.fields.map((f) => f.label).join(', ')})` : ''}.`;
        }
        if (op === 'share') { const r = await share(t); return r ? `Saved ${r.path}.` : 'Not saved.'; }
        if (op === 'rename') { if (byAI) return 'Renaming is the owner\'s to do.'; await rename(t); return ''; }
        if (op === 'delete' || op === 'remove') {
          if (byAI) return 'Deleting a template is the owner\'s to do: suggest it.';
          return (await remove(t, { ask: true })) ? `"${t.name}" is in the Trash.` : 'Kept.';
        }
        return `Unknown: ${op}. Try list, fields <name>, use <name> {values}, save [name], share <name>.`;
      },
    });
  }
  const listText = (all) => (all.length ? `My templates (newest first): ${all.map((t) => `"${t.name}" (${C.describe(t)})`).join(' · ')}` : 'No templates yet (the owner saves one from ✦ More › 📐 My templates, or /my-template save).');
  function actions() {
    if (typeof AppUI === 'undefined' || !AppUI.addAction) return;
    AppUI.addAction('Lab: New from my template (no tokens)', () => open().catch(err));
    AppUI.addAction('Lab: Save this scene as my template', () => saveDialog().catch(err));
  }
  function init() { register(); actions(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return { open, close, saveDialog, saveCurrent, form, closeForm, create, undoCreate, list, byName, remove, rename, share, fromPack, root, splitNameArgs, last, sceneNow, // (sceneNow: round 42, labbatch)
    state: () => ({ picker: Boolean(pk), form: fm ? { template: fm.t.name, values: { ...fm.vals } } : null, save: Boolean(saveDlg), count: cache?.length ?? null }),
    get formApi() { return fm; } };
})();
