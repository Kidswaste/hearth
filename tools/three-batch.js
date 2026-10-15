// ⧉ Make a batch (round 42, labbatch): one template (📐 My templates) or the scene on screen → many renders, 0 tokens.
// The owner makes many similar music videos ("the same, with another title / song / cover"): a list of values for the
// template's fields (typed or pasted lines, a CSV / TSV whose first line names the fields, every song or picture in a
// folder), an optional 📜 recipe applied to each, the ▦ All formats shapes to make, a name pattern ("{title} {format}").
// The first rows show as stills (drawn by the same hidden export page the renders use) before anything starts; then the
// batch goes into the render queue as ONE row (⇪ in the rail: cancel, pause, time left for the whole batch; powerwise
// keeps the computer awake while it is there) and the videos land in one folder with "Batch summary.csv" (what was
// made, or why not, with the values used). Each row renders on its own: the template's scene with that row's values
// is compiled for the export page directly (no scene is made, the Lab on screen is untouched); a recipe is replayed
// once on a scratch copy of the template (opened for a moment, then removed) and every row starts from that.
// Ways in: tools/three-batch-hook.js (right-click the preview › ⇪ Make & export, the toolbar's ⋯, My templates' picker and cards; Lab search
// reads those menus) and ⌘/Ctrl+K. For the AI: /batch. Model: tools/three-batch-core.js. Lazy group "labbatch".
//   LabBatch.open({ template, text, formats, recipe, pattern }) · start(o) · cancel() · pause(on) · status() · close()
const LabBatch = (() => {
  const BC = BatchCore; const TC = () => TemplateCore; const FC = () => FormatsCore; // (read when used: their groups load first)
  const X = () => LabExport;
  const SEQ = () => (typeof ThreeSeq !== 'undefined' ? ThreeSeq : null);
  const LAB = () => SEQ()?._S?.L || null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const err = (e) => toast(e?.message || String(e), { type: 'error', timeout: 6000 });
  const AUD = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|aiff?)$/i;
  const S = { dlg: null, st: null, run: null, last: null, preview: null };
  const last = { started: null, previews: null, error: null }; // (dev/checks/labbatch.js)
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const uid = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

  async function lab() {
    if (typeof ThreeLab === 'undefined') throw new Error('Open the Three.js Lab first');
    await ThreeLab.cmd({ show: true });
    for (let i = 0; i < 100 && !(ThreeLab.director && LAB()); i += 1) await sleep(100);
    if (!LAB()?.scenes) throw new Error('The Lab is not ready yet.');
  }

  // ---------- what a batch starts from: one of My templates, or the scene on screen ----------
  async function sceneTemplate() {
    const now = await LabTemplates.sceneNow();
    const t = TC().make(now.scene, now.fields, { name: now.scene.name });
    t._scene = true;
    return t;
  }
  async function templates() { try { return await LabTemplates.list({ fresh: true }); } catch { return []; } }
  async function recipes() {
    try { if (typeof LabRecipes === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('labrecipes'); return typeof LabRecipes !== 'undefined' ? await LabRecipes.list({ fresh: true }) : []; } catch { return []; }
  }

  // a recipe replayed once on a scratch copy of the template (opened for a moment, then removed, back to the scene you
  // were on); that copy, read back as a template with the same fields, is what every row starts from
  const based = new Map(); // `${t.id}|${recipe.id}` → template
  async function withRecipe(t, recipe, note = () => {}) {
    if (!recipe) return t;
    const key = `${t.id}|${recipe.id}|${t.updatedAt || t.at || 0}`;
    if (based.has(key)) return based.get(key);
    note(`applying the recipe "${recipe.name}" on a scratch copy`);
    const made = await LabTemplates.create(t, {}, { name: `⧉ ${t.name} (batch)`, quiet: true });
    let out = t;
    try {
      for (let i = 0; i < 60 && ThreeLab.scenes.currentId() !== made.id; i += 1) await sleep(100);
      await sleep(1200);
      await LabRecipes.use(recipe, { quiet: true });
      await sleep(400);
      const now = await LabTemplates.sceneNow();
      // the same fields (the recipe's values are their new defaults); media slots keep the template's own
      const ids = new Set(t.fields.map((f) => f.id));
      const fields = now.fields.filter((f) => ids.has(f.id) && !TC().MEDIA_KINDS.has(f.kind)).concat(t.fields.filter((f) => TC().MEDIA_KINDS.has(f.kind)));
      out = TC().make(now.scene, t.fields.map((f) => fields.find((x) => x.id === f.id) || f), { name: t.name, id: t.id });
      out.scene.refs = t.scene.refs; // (the template's own files, not the scratch copy's)
      if (t.scene.extras?.media && !out.scene.extras.media) out.scene.extras.media = t.scene.extras.media;
    } finally {
      await LabTemplates.undoCreate(made.id).catch(() => {});
    }
    based.set(key, out);
    return out;
  }

  // ---------- one row's video: the template's scene with that row's values, compiled for the export page ----------
  const durs = new Map();
  async function songSecs(p) {
    if (durs.has(p)) return durs.get(p);
    let d = null;
    const P = LAB()?.player;
    if (P?.path === p && P.duration) d = P.duration;
    if (!d) { try { d = (await window.hub.video.probe(p, { ffprobe: H.settings().ffprobePath || undefined }))?.duration || null; } catch { d = null; } }
    if (!d) d = await new Promise((res) => { const a = new Audio(); a.preload = 'metadata'; const end = (v) => { a.src = ''; res(v); }; a.onloadedmetadata = () => end(Number.isFinite(a.duration) ? a.duration : null); a.onerror = () => end(null); setTimeout(() => end(null), 8000); a.src = WinMac.fileUrl(p); });
    durs.set(p, d);
    return d;
  }
  const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml', mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', mkv: 'video/x-matroska', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', glb: 'model/gltf-binary', gltf: 'model/gltf+json', json: 'application/json' };
  let bytes = new Map(); // a reference's bytes, read once per batch (small files only)
  async function refsMsg(r) {
    const items = [];
    for (const ref of r.refs || []) {
      if (!ref.path || !ref.key) continue;
      let buf = bytes.get(ref.path);
      if (!buf) {
        try { const u8 = await window.hub.fs.read(ref.path, { encoding: 'buffer', maxBytes: 400 * 1048576 }); buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength); } catch { continue; }
        if (buf.byteLength < 25 * 1048576) bytes.set(ref.path, buf);
      }
      const ext = String(ref.path).split('.').pop().toLowerCase();
      const kind = ref.kind === 'audio' ? 'sound' : ref.kind || TC().mediaKind(ref.path) || 'data';
      items.push({ key: ref.key, kind, mime: MIME[ext] || '', buffer: buf.slice(0) });
    }
    return { type: 'refs', items, palette: r.palette || [] };
  }
  // the sequence's compile reads scenes from the Lab: for one synchronous call it also knows this row's scene
  function virtual(sk, extras, song, fn) {
    const sc = LAB()?.scenes;
    if (!sc) throw new Error('The Lab is not ready yet.');
    const o = { get: sc.get, layersOf: sc.layersOf, extrasOf: sc.extrasOf, songOf: sc.songOf };
    sc.get = (id) => (id === sk.id ? sk : o.get.call(sc, id));
    sc.layersOf = (x) => (x?.id === sk.id ? sk.layers : o.layersOf.call(sc, x));
    sc.extrasOf = (id) => (id === sk.id ? extras : o.extrasOf?.call(sc, id));
    sc.songOf = (id) => (id === sk.id ? song : o.songOf?.call(sc, id));
    try { return fn(); } finally { Object.assign(sc, o); }
  }
  // → { e (the one-clip edit: the scene + its song), compiled, refs, N frames, F, sz, secs, r }
  async function prep(base, row, fid, o = {}) {
    const r = TC().apply(base, row.values || {}, { scan: ThreeTweaks.scan, applyValues: ThreeTweaks.applyValues, name: base.name });
    const sz = FC().sizeOf(fid, o.long || 0);
    const F = Number(o.fps) || 30;
    const song = r.extras?.media?.path && AUD.test(r.extras.media.path) ? r.extras.media.path : null;
    const songLen = song ? await songSecs(song) : null;
    const secs = Number(o.secs) || (o.frames ? o.frames / F : null) || songLen || r.extras?.timeline?.len || 10;
    const N = Math.max(1, Number(o.frames) || Math.round(secs * F));
    const sk = { id: `lb-${uid()}`, name: r.name, layers: r.layers, updatedAt: Date.now() };
    const D = ThreeSeqData;
    let e = D.create({ format: X().aspectKey(sz.w, sz.h), fps: F, name: r.name });
    e = CutData.setSeq(e, { w: sz.w, h: sz.h });
    if (song && songLen) e = D.setSong(e, song, songLen);
    e = D.addScene(e, { sketch: sk.id, name: r.name }, { dur: Math.max(0.1, (N + 1) / F), trans: null });
    const compiled = virtual(sk, r.extras || {}, song, () => SEQ().compile(e));
    return { e, compiled, refs: await refsMsg(r), N, F, sz, secs: Math.round((N / F) * 100) / 100, r, song };
  }

  // ---------- a still of one row (the preview grid): the same hidden export page as the render ----------
  async function still(p, { long = 280, T = null } = {}) {
    const k = Math.min(1, long / Math.max(p.sz.w, p.sz.h));
    const pg = { cssW: p.sz.w, cssH: p.sz.h, dpr: k, k: 1, ss: 1, px: 0, capped: [] };
    const page = await X().openPage({ w: p.sz.w, h: p.sz.h, pg });
    try {
      page.send(p.refs);
      const plan = p.compiled.plan; plan.w = p.sz.w; plan.h = p.sz.h; plan.fps = p.F;
      await X().loadPlan(page, plan, p.compiled.assets, plan.song);
      const pw = Math.max(2, Math.round(p.sz.w * k)); const ph = Math.max(2, Math.round(p.sz.h * k));
      const at = T ?? Math.min(1, p.secs / 2);
      const got = page.wait((m) => m.type === 'xp-frame' && m.n === 0, 90000, 'the preview');
      page.send({ type: 'xp-frame', n: 0, T: Math.round(at * 1e4) / 1e4, w: pw, h: ph, ss: 1, sub: 1, F: p.F, kind: 'image/jpeg', q: 0.86 });
      const m = await got;
      if (m.error) throw new Error(m.error);
      const blob = new Blob([m.buffer], { type: 'image/jpeg' });
      return { url: URL.createObjectURL(blob), blob, w: pw, h: ph, errors: page.errors.slice() };
    } finally { page.close(); }
  }

  // ---------- the dialog ----------
  const SAVED = () => store.get('three.batch', {}) || {};
  function remember(st) { store.set('three.batch', { formats: [...st.formats], pattern: st.pattern, half: st.half, recipe: st.recipeId || null }); }
  const frameOfT = (t) => { const f = t?.scene?.extras?.frame; return FC().get(f)?.id || null; };
  function defaultFormats(t) {
    const saved = SAVED().formats;
    if (Array.isArray(saved) && saved.some((id) => FC().get(id))) return saved.filter((id) => FC().get(id));
    return FC().defaults(frameOfT(t) || '16:9', store.get('three.formats.picks', null)); // (All formats' picks, its default otherwise)
  }
  async function open(o = {}) {
    await lab();
    close();
    const all = await templates();
    const rcs = await recipes();
    let scene = null;
    try { scene = await sceneTemplate(); } catch { scene = null; }
    const pick = (o.template && (all.find((t) => t.id === o.template) || LabTemplates.byName(o.template, all))) || (o.template === 'scene' ? null : all[0]) || null;
    const src = pick ? `t:${pick.id}` : 'scene';
    if (!pick && !scene) throw new Error('Open a scene in the Lab, or save one as a template first.');
    const saved = SAVED();
    const st = {
      all, rcs, scene, src, t: pick || scene, text: o.text || '', base: o.base || null, main: null,
      formats: new Set(o.formats || defaultFormats(pick || scene)), recipeId: o.recipe ? (rcs.find((r) => r.name.toLowerCase() === String(o.recipe).toLowerCase() || r.id === o.recipe)?.id || null) : (rcs.some((r) => r.id === saved.recipe) ? saved.recipe : null),
      pattern: o.pattern || saved.pattern || BC.DEFAULT_PATTERN, half: Boolean(saved.half), secs: o.secs || null,
      parsed: null, missing: new Map(), prev: [], pgen: 0, psig: '',
    };
    S.st = st;
    const q = (sel) => S.dlg?.querySelector(sel);
    // the inputs
    const srcSel = el('select', { class: 'lb-src', attrs: { 'aria-label': 'Make the batch from' } },
      all.map((t) => el('option', { value: `t:${t.id}`, text: `📐 ${t.name}`, selected: st.src === `t:${t.id}` })),
      scene ? el('option', { value: 'scene', text: `This scene: ${scene.name}`, selected: st.src === 'scene' }) : null);
    const rows = el('textarea', { class: 'lb-rows', rows: 8, attrs: { spellcheck: 'false', 'aria-label': 'The rows: one per line, or a table whose first line names the fields' } });
    rows.value = st.text;
    const getRow = el('div', { class: 'lb-get' });
    const fieldsLine = el('div', { class: 'lb-fields small muted' });
    const status = el('div', { class: 'lb-status small', attrs: { 'aria-live': 'polite' } });
    const mainSel = el('select', { class: 'lb-main', attrs: { 'aria-label': 'Each line fills' } });
    const mainRow = el('label', { class: 'lb-mainrow small muted' }, el('span', { text: 'Each line fills' }), mainSel);
    const fmts = el('div', { class: 'lb-fmts' }, FC().FORMATS.map((f) => el('label', { class: 'lb-fmt', title: f.for }, el('input', { type: 'checkbox', checked: st.formats.has(f.id), dataset: { fmt: f.id }, on: { change: (e) => { if (e.target.checked) st.formats.add(f.id); else st.formats.delete(f.id); remember(st); paint(); } } }), el('b', { text: f.name }))));
    const recSel = el('select', { class: 'lb-recipe', attrs: { 'aria-label': 'A recipe on each video' } }, el('option', { value: '', text: 'None' }), rcs.map((r) => el('option', { value: r.id, text: `📜 ${r.name}`, selected: r.id === st.recipeId })));
    const pat = el('input', { type: 'text', class: 'lb-pattern', value: st.pattern, attrs: { spellcheck: 'false', 'aria-label': 'File names', placeholder: BC.DEFAULT_PATTERN } });
    const example = el('span', { class: 'lb-example small muted' });
    const secsIn = el('input', { type: 'number', class: 'lb-secs', min: 0.5, step: 0.5, value: st.secs || '', attrs: { 'aria-label': 'Length in seconds (empty: the song\'s length)', placeholder: 'the song' } });
    const half = el('input', { type: 'checkbox', class: 'lb-half', checked: st.half, attrs: { 'aria-label': 'Half size (quick drafts)' } });
    const grid = el('div', { class: 'lb-grid' });
    const pcap = el('div', { class: 'lb-pcap small muted', text: '' });
    const sum = el('span', { class: 'lb-sum small muted' });
    const go = el('button', { type: 'button', class: 'primary lb-go', text: '⇪ Make' });
    const dlg = el('dialog', { class: 'ui-modal lb-dlg', attrs: { 'aria-label': 'Make a batch' } },
      el('div', { class: 'lb-head' }, el('h3', { text: '⧉ Make a batch' }), el('span', { class: 'muted small', text: 'one template → many videos, made here, no tokens' }), el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'ghost small lb-x', title: 'Close (Esc)', text: '✕', attrs: { 'aria-label': 'Close' }, on: { click: () => close() } })),
      el('div', { class: 'lb-main-grid' },
        el('div', { class: 'lb-in' },
          el('label', { class: 'lb-lab small muted', text: 'From' }), srcSel,
          el('label', { class: 'lb-lab small muted', text: 'One video per row: type or paste lines, or a table whose first line names the fields' }), rows,
          getRow, fieldsLine, mainRow, status,
          el('div', { class: 'lb-lab small muted', text: 'Formats' }), fmts,
          rcs.length ? el('label', { class: 'lb-line' }, el('span', { class: 'small muted', text: 'Recipe on each' }), recSel) : null,
          el('label', { class: 'lb-line' }, el('span', { class: 'small muted', text: 'File names' }), pat), example,
          el('details', { class: 'lb-more' }, el('summary', { class: 'small muted', text: 'Length & size' }),
            el('label', { class: 'lb-line' }, el('span', { class: 'small muted', text: 'Seconds' }), secsIn, el('span', { class: 'small muted', text: 'empty: the song\'s length (else 10 s)' })),
            el('label', { class: 'lb-line check' }, half, el('span', { class: 'small', text: 'Half size (quick drafts)' })))),
        el('div', { class: 'lb-prev' }, grid, pcap)),
      el('div', { class: 'modal-actions lb-foot' }, sum, el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'ghost', text: 'Cancel', on: { click: () => close() } }), go));
    S.dlg = dlg;
    dlg.addEventListener('close', () => { if (S.dlg === dlg) close(); });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

    // the ways to fill the rows: a file, a folder of songs / pictures
    const btn = (text, title, fn) => el('button', { type: 'button', class: 'ghost small', text, title, on: { click: () => fn().catch(err) } });
    async function fromFile() {
      const r = await window.hub.openDialog({ title: 'A CSV or TSV file (first line: the field names)', filters: [{ name: 'Table', extensions: ['csv', 'tsv', 'txt'] }], properties: ['openFile'] });
      if (!r?.[0]) return;
      await useFile(r[0]);
    }
    async function useFile(p) {
      rows.value = String(await window.hub.fs.read(p)).replace(/^﻿/, '');
      st.base = BC.dirOf(p); st.file = p;
      reparse(true);
    }
    async function fromFolder(kind) {
      const r = await window.hub.openDialog({ title: kind === 'audio' ? 'A folder of songs' : 'A folder of pictures', properties: ['openDirectory'] });
      if (!r?.[0]) return;
      await useFolder(r[0], kind);
    }
    async function useFolder(dir, kind) {
      const f = st.t.fields.find((x) => x.kind === kind);
      if (!f) throw new Error(`"${st.t.name}" has no ${kind === 'audio' ? 'song' : 'picture'} to fill`);
      const files = (await window.hub.fs.list(dir)).filter((x) => !x.isDir).map((x) => x.path);
      const { text, count } = BC.folderText(files, f, st.t);
      if (!count) throw new Error(`No ${kind === 'audio' ? 'songs' : 'pictures'} in that folder`);
      rows.value = text; st.base = dir;
      reparse(true);
    }
    function paintGet() {
      const t = st.t;
      getRow.replaceChildren(btn('Open a CSV / TSV…', 'Its first line names the fields (Title, Song, Logo…); one video per line after it', fromFile),
        t.fields.some((f) => f.kind === 'audio') ? btn('🔊 Every song in a folder…', 'One video per song; the title from each file\'s name', () => fromFolder('audio')) : null,
        t.fields.some((f) => f.kind === 'image') ? btn('🖼 Every picture in a folder…', 'One video per picture', () => fromFolder('image')) : null);
      const names = t.fields.map((f) => f.label);
      fieldsLine.textContent = names.length ? `Fields: ${names.slice(0, 10).join(' · ')}${names.length > 10 ? ` · +${names.length - 10}` : ''}` : 'This one has no fields: every video is the scene as it is.';
      fieldsLine.title = names.join('\n');
      const main = BC.mainField(t);
      mainSel.replaceChildren(...t.fields.map((f) => el('option', { value: f.id, text: f.label, selected: f.id === (st.main || main?.id) })));
    }
    st.useFile = useFile; st.useFolder = useFolder;

    // parse → status, names, summary; the files named are checked; the preview follows (debounced)
    let pt = 0;
    function reparse(now = false) { clearTimeout(pt); pt = setTimeout(() => { parse(); paint(); schedulePreview(); }, now ? 0 : 160); }
    function parse() {
      st.text = rows.value;
      st.parsed = BC.parseRows(st.text, st.t, { main: st.main, base: st.base, home: st.home });
      const paths = [...new Set(st.parsed.rows.flatMap((r) => st.t.fields.filter((f) => TC().MEDIA_KINDS.has(f.kind) && r.values[f.id]).map((f) => r.values[f.id])))];
      const unseen = paths.filter((p) => !st.missing.has(p));
      if (unseen.length) Promise.all(unseen.map(async (p) => { st.missing.set(p, !(await window.hub.fs.stat(p).catch(() => null))); })).then(() => { if (S.st === st) paint(); });
    }
    st.rowsOk = () => (st.parsed?.rows || []).filter((r) => !Object.values(r.values).some((v) => typeof v === 'string' && st.missing.get(v) === true));
    function paint() {
      const p = st.parsed;
      const n = st.rowsOk().length; const nf = st.formats.size;
      const lost = (p?.rows.length || 0) - n;
      mainRow.hidden = p?.mode !== 'lines';
      const bits = [];
      if (!p || p.mode === 'empty') bits.push(el('span', { class: 'muted', text: 'No rows yet. One title per line makes one video each.' }));
      else {
        bits.push(el('span', { text: `${plural(p.rows.length, 'row')}${p.mode === 'header' ? ` · columns: ${p.columns.filter((c) => c.field || c.special).map((c) => c.name).join(', ')}` : ` · each fills ${st.t.fields.find((f) => f.id === p.main)?.label || '—'}`}` }));
        if (p.unknown.length) bits.push(el('span', { class: 'lb-warn', text: ` · not a field: ${p.unknown.join(', ')}`, title: `Fields: ${st.t.fields.map((f) => f.label).join(', ')}` }));
        if (lost) { const miss = [...st.missing].filter(([, m]) => m).map(([k]) => BC.baseName(k)); bits.push(el('span', { class: 'lb-warn', text: ` · ${plural(lost, 'row')} skipped (file not found: ${miss.slice(0, 2).join(', ')}${miss.length > 2 ? '…' : ''})` })); }
        if (p.problems.length) bits.push(el('span', { class: 'lb-warn', text: ` · ${p.problems[0]}${p.problems.length > 1 ? ` (+${p.problems.length - 1})` : ''}`, title: p.problems.join('\n') }));
      }
      status.replaceChildren(...bits);
      // the names it will get
      const r0 = st.rowsOk()[0];
      const f0 = FC().FORMATS.find((f) => st.formats.has(f.id));
      if (r0 && f0) { const z = FC().sizeOf(f0.id, st.half ? Math.max(f0.w, f0.h) / 2 : 0); const nm = BC.fileName(st.pattern, { t: st.t, row: r0, values: r0.values, format: f0.id, w: z.w, h: z.h, count: n }); example.textContent = `→ ${nm.name}.mp4${nm.unknown.length ? `  (no field named ${nm.unknown.map((u) => `{${u}}`).join(', ')})` : ''}`; example.classList.toggle('lb-warn', Boolean(nm.unknown.length)); } else example.textContent = 'Tokens: {title} {format} {size} {n} {template} and any field\'s name';
      const total = n * nf;
      go.disabled = !total;
      go.textContent = total ? `⇪ Make ${plural(total, 'video')}` : '⇪ Make';
      const s = total ? `${n} × ${plural(nf, 'format')} · one after another in the background, into one folder with a summary · nothing is uploaded` : nf ? '' : 'Pick at least one format';
      if (sum.textContent !== s) sum.textContent = s;
    }

    // the preview grid: the first rows at the first picked format, as stills from the export page
    let ptm = 0;
    function schedulePreview() { clearTimeout(ptm); ptm = setTimeout(() => preview().catch((e) => { pcap.textContent = `⚠ ${calmError(e)}`; }), 650); }
    async function preview() {
      const fid = FC().FORMATS.find((f) => st.formats.has(f.id))?.id;
      const rs = st.rowsOk().slice(0, BC.PREVIEW);
      const sig = JSON.stringify([st.src, st.recipeId, fid, rs.map((r) => r.values), st.pattern]);
      if (sig === st.psig) return;
      st.psig = sig;
      const my = ++st.pgen;
      for (const p of st.prev) if (p?.url) URL.revokeObjectURL(p.url);
      st.prev = [];
      if (!fid || !rs.length) { grid.replaceChildren(); pcap.textContent = rs.length ? '' : 'The first videos show here before anything is made.'; return; }
      const f = FC().get(fid);
      const cards = rs.map((r) => {
        const nm = BC.fileName(st.pattern, { t: st.t, row: r, values: r.values, format: fid, w: f.w, h: f.h, count: st.rowsOk().length }).name;
        const pic = el('div', { class: 'lb-pic lb-wait' }); pic.style.setProperty('--ar', String(f.w / f.h));
        return { r, pic, card: el('div', { class: 'lb-card', title: nm }, pic, el('span', { class: 'lb-cname small', text: nm })) };
      });
      grid.replaceChildren(...cards.map((c) => c.card));
      grid.style.setProperty('--ar', String(f.w / f.h));
      pcap.textContent = `The first ${plural(rs.length, 'video')} at ${fid}, drawing…`;
      const base = await withRecipe(st.t, st.rcs.find((x) => x.id === st.recipeId), (t) => { pcap.textContent = `${t}…`; });
      let made = 0; const errors = [];
      for (const c of cards) {
        if (my !== st.pgen || S.st !== st) return;
        try {
          const p = await prep(base, c.r, fid, { secs: 1.2, fps: 30 });
          const s = await still(p, { long: 280, T: 1 });
          if (my !== st.pgen || S.st !== st) { URL.revokeObjectURL(s.url); return; }
          st.prev.push(s);
          c.pic.classList.remove('lb-wait');
          c.pic.replaceChildren(el('img', { attrs: { src: s.url, alt: '', draggable: 'false' } }));
          if (s.errors.length) { errors.push(s.errors[0]); c.pic.title = s.errors[0]; c.pic.classList.add('lb-bad'); }
          made += 1;
        } catch (e) { errors.push(e.message); c.pic.classList.remove('lb-wait'); c.pic.classList.add('lb-bad'); c.pic.textContent = '⚠'; c.pic.title = e.message; }
      }
      pcap.textContent = `The first ${plural(made, 'video')} at ${fid} (at 1 s)${errors.length ? ` · ⚠ ${String(errors[0]).slice(0, 80)}` : ''}`;
      last.previews = { n: made, fid, errors, sig };
    }

    srcSel.addEventListener('change', () => {
      st.src = srcSel.value;
      st.t = st.src === 'scene' ? scene : all.find((t) => `t:${t.id}` === st.src);
      st.main = null; paintGet(); reparse(true);
    });
    rows.addEventListener('input', () => reparse());
    mainSel.addEventListener('change', () => { st.main = mainSel.value; reparse(true); });
    recSel.addEventListener('change', () => { st.recipeId = recSel.value || null; remember(st); st.psig = ''; schedulePreview(); });
    pat.addEventListener('input', () => { st.pattern = pat.value || BC.DEFAULT_PATTERN; remember(st); paint(); });
    secsIn.addEventListener('change', () => { st.secs = Number(secsIn.value) || null; });
    half.addEventListener('change', () => { st.half = half.checked; remember(st); paint(); });
    go.addEventListener('click', () => {
      const o2 = { t: st.t, rows: st.rowsOk(), skipped: (st.parsed?.rows || []).filter((r) => !st.rowsOk().includes(r)), formats: FC().FORMATS.map((f) => f.id).filter((id) => st.formats.has(id)), recipe: st.rcs.find((x) => x.id === st.recipeId) || null, pattern: st.pattern, secs: st.secs, half: st.half };
      remember(st);
      close();
      start(o2).catch(err);
    });
    try { st.home = await window.hub.fs.home(); } catch { st.home = null; }
    document.body.append(dlg);
    paintGet(); parse(); paint();
    dlg.showModal();
    rows.focus();
    schedulePreview();
    st.preview = preview; st.reparse = reparse; st.rowsEl = rows;
    return st;
  }
  function close() {
    const st = S.st; S.st = null;
    if (st) { st.pgen += 1; for (const p of st.prev) if (p?.url) URL.revokeObjectURL(p.url); }
    const d = S.dlg; S.dlg = null;
    if (d) { try { if (d.open) d.close(); } catch { /* gone */ } d.remove(); }
    if (!S.run) bytes = new Map();
    return Boolean(st || d);
  }

  // ---------- the batch: one render-queue row, one progress line, one folder, a summary ----------
  // o: { t, rows, skipped, formats, recipe, pattern, secs, frames, fps, half, long, name, quiet }
  async function start(o = {}) {
    if (S.run) throw new Error('A batch is already being made (one at a time): /batch status');
    await lab();
    const t = o.t; if (!t) throw new Error('No template to make the batch from');
    const formats = (o.formats || []).map((id) => FC().get(id)?.id).filter(Boolean);
    if (!formats.length) throw new Error('Pick at least one format');
    const rows = (o.rows || []).filter(Boolean);
    if (!rows.length) throw new Error('No rows to make');
    const name = o.name || t.name;
    const outBase = await (async () => { try { return await SEQ().outDir(); } catch { return WinMac.join(await window.hub.fs.home(), 'Hearth exports'); } })();
    let dir = WinMac.join(outBase, BC.folder(name));
    for (let i = 2; i < 100 && await window.hub.fs.stat(dir).catch(() => null); i += 1) dir = WinMac.join(outBase, `${BC.folder(name)} (${i})`);
    const longOf = (fid) => o.long || (o.half ? Math.max(FC().get(fid).w, FC().get(fid).h) / 2 : 0);
    const js = BC.jobs(rows, formats).map((j) => { const z = FC().sizeOf(j.format, longOf(j.format)); return { ...j, w: z.w, h: z.h, work: 0, status: 'waiting' }; });
    const names = BC.uniqueNames(js.map((j) => BC.fileName(o.pattern || BC.DEFAULT_PATTERN, { t, row: j.row, values: j.row.values, format: j.format, w: j.w, h: j.h, count: rows.length }).name));
    js.forEach((j, k) => { j.stem = names[k]; });
    const skipped = (o.skipped || []).map((r) => ({ n: r.n, status: 'skipped', error: 'a file it names was not found', values: r.values }));
    const id = uid();
    const pk = `lab-batch:${id}`;
    const b = { id, pk, dir, t, jobs: js, skipped, formats, cancel: false, paused: false, i: 0, done: [], failed: [], t0: performance.now(), summary: WinMac.join(dir, 'Batch summary.csv') };
    S.run = b;
    last.started = { dir, jobs: js.length, rows: rows.length, formats };
    const title = `⧉ Batch · ${name} · ${plural(js.length, 'video')}`;
    const jump = () => { if (typeof activate === 'function') activate('tool:three'); };
    window.Progress?.set(pk, { title, icon: '⧉', kind: 'lab-export:batch', pct: 0, label: 'starting', jump, actions: [{ label: '■', title: 'Cancel', run: () => cancel() }] });
    const rq = window.Renders?.track?.({ kind: 'export', title, pk, quiet: true, cancel: () => cancel(), pause: (on) => pause(on), again: null });
    b.rq = rq;
    const fieldsUsed = BC.usedFields(t, rows);
    const writeSummary = async () => {
      const recs = [...js.map((j) => ({ n: j.row.n, file: j.path || '', format: j.format, w: j.w, h: j.h, frames: j.frames ?? '', secs: j.secs ?? '', status: j.status, error: j.error || '', values: j.row.values })), ...skipped].sort((a, c) => a.n - c.n);
      try { await window.hub.fs.write(b.summary, BC.summaryCsv(recs, fieldsUsed)); } catch (e) { console.warn('labbatch: summary', e); }
    };
    const paintP = (label) => {
      const pct = Math.min(99.5, (js.reduce((n, j) => n + (j.t1 ? 1 : Math.min(1, j.p || 0)), 0) / js.length) * 100);
      const left = BC.batchLeft(js, performance.now());
      window.Progress?.set(pk, { pct, label: `${label}${left != null ? ` · ${C2(left)} left for the batch` : ''}` });
      rq?.progress?.(pct, label, left ?? undefined);
    };
    try {
      paintP(o.recipe ? 'applying the recipe' : 'starting');
      const base = await withRecipe(t, o.recipe, (txt) => paintP(txt));
      // each video's share of the work (pixels × frames), known before it starts: the batch's time left counts them all
      const F0 = Number(o.fps) || 30;
      const songField = base.fields.find((f) => f.id === 'm:song');
      for (const j of js) {
        const song = (songField && j.row.values[songField.id]) || base.scene.extras?.media?.path || null;
        const secs = Number(o.secs) || (o.frames ? o.frames / F0 : null) || (song && AUD.test(song) ? await songSecs(song) : null) || base.scene.extras?.timeline?.len || 10;
        j.work = j.w * j.h * (Number(o.frames) || Math.round(secs * F0));
      }
      await window.hub.fs.write(b.summary, BC.summaryCsv([], fieldsUsed)).catch(() => {}); // (the folder exists from the start)
      for (let k = 0; k < js.length; k += 1) {
        const j = js[k];
        while (b.paused && !b.cancel) await sleep(250);
        if (b.cancel) break;
        b.i = k;
        j.t0 = performance.now(); j.status = 'making';
        const lab0 = `${k + 1} of ${js.length} · ${j.stem}`;
        try {
          const p = await prep(base, j.row, j.format, { secs: o.secs, frames: o.frames, fps: o.fps, long: longOf(j.format) });
          j.work = p.N * j.w * j.h; j.frames = p.N; j.secs = p.secs;
          const r = await X().render({
            format: 'mp4', source: 'seq', edit: p.e, compiled: p.compiled, refs: p.refs, size: p.sz, fps: p.F, frames: p.N, at: 0,
            dir, stem: j.stem, name: j.stem, track: false, quiet: true, again: null,
            onProgress: (pp, label, left) => { j.p = pp; if (left !== undefined) j.left = left; paintP(`${lab0} · ${label}`); },
          });
          j.path = r.path; j.status = 'made'; j.frames = r.frames;
          b.done.push({ n: j.row.n, format: j.format, path: r.path, w: r.w, h: r.h, frames: r.frames });
        } catch (e) {
          if (b.cancel || /cancel/i.test(e.message)) { j.status = 'cancelled'; b.cancel = true; } else { j.status = 'failed'; j.error = e.message; b.failed.push({ n: j.row.n, format: j.format, error: e.message }); }
        } finally { j.t1 = performance.now(); j.p = 1; j.left = 0; }
        await writeSummary();
      }
      for (const j of js) if (j.status === 'waiting') j.status = 'cancelled';
      await writeSummary();
      const ok = b.done.length > 0 && !b.cancel;
      if (ok) { window.Progress?.done(pk, { label: `${b.done.length} made` }); rq?.done(b.summary); } else { window.Progress?.done(pk, { ok: false, label: b.cancel ? 'cancelled' : 'failed' }); if (b.cancel) rq?.cancelled?.(); else rq?.fail(b.failed[0]?.error || 'Nothing was made'); }
      const secs = Math.round((performance.now() - b.t0) / 1000);
      if (!o.quiet) {
        if (b.done.length) toast(`⧉ ${plural(b.done.length, 'video')} made${b.cancel ? ' (then cancelled)' : ''} in ${C2(secs)} · "${BC.baseName(dir)}"${b.failed.length ? ` · ${b.failed.length} failed: ${b.failed[0].error}` : ''}`, { timeout: 9000, action: { label: 'Show', fn: () => window.hub.fs.reveal(b.done[0].path) } });
        else if (!b.cancel) toast(`⧉ The batch made nothing: ${b.failed[0]?.error || 'no rows'}`, { type: 'error', timeout: 9000 });
      }
      S.last = { dir, summary: b.summary, files: b.done, failed: b.failed, cancelled: b.cancel, jobs: js.map((j) => ({ n: j.row.n, format: j.format, status: j.status, path: j.path || null, error: j.error || null })), secs };
      return S.last;
    } catch (e) {
      last.error = e.message;
      window.Progress?.done(pk, { ok: false, label: 'failed' }); rq?.fail(e.message);
      throw e;
    } finally { if (S.run === b) S.run = null; bytes = new Map(); }
  }
  const C2 = (s) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : s >= 90 ? `${Math.round(s / 60)} min` : `${s} s`);
  function cancel() { const b = S.run; if (!b) return false; b.cancel = true; X().cancel(); return true; }
  function pause(on = true) { const b = S.run; if (!b) return false; b.paused = Boolean(on); X().pause(Boolean(on)); return true; }
  function status() {
    const b = S.run;
    return { open: Boolean(S.st), running: b ? { at: b.i + 1, of: b.jobs.length, done: b.done.length, failed: b.failed.length, paused: b.paused, dir: b.dir, left: BC.batchLeft(b.jobs, performance.now()) } : null, last: S.last };
  }

  // ---------- for the AI and ⌘/Ctrl+K: /batch ----------
  async function rowsFromArgs(a, t) {
    if (a.file) { const text = String(await window.hub.fs.read(a.file)).replace(/^﻿/, ''); return { text, base: BC.dirOf(a.file) }; }
    if (a.folder) {
      const files = (await window.hub.fs.list(a.folder)).filter((x) => !x.isDir).map((x) => x.path);
      for (const kind of ['audio', 'image', 'video']) { const f = t.fields.find((x) => x.kind === kind); if (!f) continue; const r = BC.folderText(files, f, t); if (r.count) return { text: r.text, base: a.folder }; }
      throw new Error(`Nothing in ${a.folder} fits "${t.name}" (it needs ${t.fields.filter((f) => TC().MEDIA_KINDS.has(f.kind)).map((f) => f.kind).join(' / ') || 'no files'})`);
    }
    if (a.lines) return { text: a.lines.join('\n'), base: null };
    return { text: '', base: null };
  }
  function register() {
    if (typeof Commands === 'undefined' || Commands.get('batch')) return;
    Commands.register({
      name: 'batch', aliases: ['make-batch'], area: 'Three.js Lab',
      args: '[<template> | this] [file <csv> | folder <path> | lines a | b | c] [formats 9:16 1:1 | socials] [recipe <name>] [names "{title} {format}"] [secs N] [now] | status | cancel',
      desc: 'Make a batch (no tokens): one of My templates (or the scene on screen) → one video per row of values (typed lines, a CSV / TSV naming the fields, every song or picture in a folder), each format, an optional recipe; into one folder with a summary CSV, through the render queue. Without "now" it opens the dialog with a preview of the first ones',
      keywords: 'batch many videos bulk mass list csv tsv spreadsheet rows titles songs folder every song template render queue summary music videos',
      examples: ['/batch', '/batch Neon title lines Summer | Winter | Spring formats 9:16 now', '/batch Neon title folder ~/Music/EP formats socials', '/batch status'],
      complete: (a) => ['status', 'cancel', 'this', 'file ', 'folder ', 'lines ', 'formats ', 'recipe ', 'names ', 'now'].filter((x) => x.startsWith(String(a || '').split(/\s+/).pop().toLowerCase())).map((value) => ({ value })),
      async run(args, ctx = {}) {
        const a = BC.parseArgs(args);
        if (a.op === 'status') { const s = status(); return s.running ? `Making video ${s.running.at} of ${s.running.of} (${s.running.done} made${s.running.failed ? `, ${s.running.failed} failed` : ''}${s.running.paused ? ', paused' : ''}${s.running.left ? `, about ${C2(s.running.left)} left` : ''}) into ${s.running.dir}.` : s.last ? `Last batch: ${s.last.files.length} made${s.last.failed.length ? `, ${s.last.failed.length} failed` : ''}${s.last.cancelled ? ', cancelled' : ''} in ${s.last.dir} (summary: ${s.last.summary}).` : 'No batch yet.'; }
        if (a.op === 'cancel' || a.op === 'stop') return cancel() ? 'Stopping the batch after this frame (the summary says what was made).' : 'No batch is running.';
        if (a.op === 'pause' || a.op === 'resume') return pause(a.op === 'pause') ? `Batch ${a.op}d.` : 'No batch is running.';
        await lab();
        const all = await templates();
        const useScene = /^(this|scene|this scene|current)$/i.test(a.template);
        const t = useScene ? await sceneTemplate() : a.template ? LabTemplates.byName(a.template, all) : null;
        if (a.template && !t) return `No template "${a.template}". My templates: ${all.map((x) => `"${x.name}"`).join(', ') || 'none yet'} (or "this" for the scene on screen).`;
        if (!a.now || !t) {
          const st = await open({ template: useScene ? 'scene' : t?.id, formats: a.formats?.length ? a.formats : undefined, recipe: a.recipe, pattern: a.names, secs: a.secs });
          if (t) { const r = await rowsFromArgs(a, st.t).catch((e) => { toast(e.message, { type: 'error' }); return null; }); if (r?.text) { st.rowsEl.value = r.text; st.base = r.base; st.reparse(true); } }
          return ctx.source === 'code' ? 'The batch dialog is open for the owner (a preview of the first videos shows there); add "now" to start at once.' : '';
        }
        const r = await rowsFromArgs(a, t);
        const parsed = BC.parseRows(r.text, t, { base: r.base, home: await window.hub.fs.home().catch(() => null) });
        if (!parsed.rows.length) return `No rows: give lines (lines A | B | C), a CSV (file <path>) or a folder (folder <path>). Fields of "${t.name}": ${t.fields.map((f) => f.label).join(', ')}.`;
        const rcs = a.recipe ? await recipes() : [];
        const recipe = a.recipe ? rcs.find((x) => x.name.toLowerCase() === a.recipe.toLowerCase()) || rcs.find((x) => x.name.toLowerCase().includes(a.recipe.toLowerCase())) : null;
        if (a.recipe && !recipe) return `No recipe "${a.recipe}" (${rcs.map((x) => `"${x.name}"`).join(', ') || 'none yet'}).`;
        const formats = a.formats?.length ? a.formats : defaultFormats(t);
        const exists = await Promise.all(parsed.rows.map(async (row) => { for (const v of Object.values(row.values)) if (typeof v === 'string' && /[\\/]/.test(v) && TC().mediaKind(v) && !(await window.hub.fs.stat(v).catch(() => null))) return false; return true; }));
        const rows = parsed.rows.filter((_, i) => exists[i]); const skipped = parsed.rows.filter((_, i) => !exists[i]);
        start({ t, rows, skipped, formats, recipe, pattern: a.names || SAVED().pattern || BC.DEFAULT_PATTERN, secs: a.secs, long: a.long }).catch(err);
        return `Making ${plural(rows.length * formats.length, 'video')} (${plural(rows.length, 'row')} × ${formats.join(', ')}) from "${t.name}"${recipe ? ` with the recipe "${recipe.name}"` : ''} in the background (render queue; /batch status).${skipped.length ? ` ${plural(skipped.length, 'row')} skipped: a file it names wasn't found.` : ''}${parsed.unknown.length ? ` Not fields: ${parsed.unknown.join(', ')}.` : ''}`;
      },
    });
  }
  function init() {
    register();
    if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: Make a batch… (one template → many videos: a list, a CSV, every song in a folder)', () => open().catch(err));
  }
  init();
  return { open, close, start, cancel, pause, status, prep, still, withRecipe, last, _S: S };
})();
if (typeof module !== 'undefined') module.exports = LabBatch;
