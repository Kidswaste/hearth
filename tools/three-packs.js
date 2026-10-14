// Packs (round 28, packs): share a scene as ONE file. "Save as a pack" puts a Lab scene (every layer, its sliders,
// saved looks, keyframes, palette, frame size, timeline), or a scene's sequence (with every scene in it), or any
// gallery card, together with everything it uses (its references: textures, HDRIs, models, fonts; the LUTs its
// grade uses; footage; the song if you keep it in) into one .hearthpack (packs-core.js: a plain zip). Opening one
// (dropped anywhere on Hearth, Share › Open a pack…, or from Finder / Explorer) shows a card first: its picture, name,
// what's inside, its size, where it came from, and that its layers are code like any Lab scene (they run only in the
// Lab's sandboxed preview). Nothing is added until "Add as a new scene": then its files land in Hearth's own folder
// (data/assets/packs/<name>/, in the asset library as Imported), its paths rewritten to them, and it opens as a new
// scene (its sequence too). Ways in: tools/three-packs-hook.js (Sketch ▾ › Share, ✦ More › ⇪ Share, the gallery's
// right-click, drops). Main side: packsmain.js. Chat: /pack (save | sequence | open <file>).
const LabPacks = (() => {
  const P = PacksCore;
  const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
  const S = () => ThreeLab.scenes;
  const D = () => ThreeLab.director;
  const api = () => window.hub.packs;
  const last = { saved: null, opened: null, imported: null, error: null }; // the last of each (dev/checks/packs.js)

  // ---------- a scene as data ----------
  async function sceneData(id) {
    const sc = S();
    const x = sc?.get(id);
    if (!x) throw new Error('That scene isn\'t here');
    const st = ThreeLab.tm?.state(id); // the code in the editor too (typed, not saved yet)
    const all = clone(st?.layers || sc.layersOf(x));
    const layers = all.filter((L) => !L.precomp); // a layer showing another scene stays home (that scene isn't packed)
    const sketch = { name: x.name, layers, code: layers[0]?.code ?? x.code ?? '', ...(x.palette?.length ? { palette: [...x.palette] } : {}) };
    const extras = clone(sc.extrasOf(id) || {});
    delete extras.midi; // this computer's controller mapping
    let refs = [];
    if (id === sc.currentId()) refs = D()?.refs.list() || [];
    else { try { refs = ((await window.hub.kvGet('three-refs', {})) || {})[id] || []; } catch { refs = []; } }
    return { key: id, sketch, extras, refs: refs.map((r) => ({ key: r.key, name: r.name, kind: r.kind, path: r.path })), dropped: all.length - layers.length };
  }
  // the LUTs its grade uses (imported ones; the built-in pack is in every Hearth) as .cube text
  const b64ToF32 = (b64) => { const s = atob(b64); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i += 1) u[i] = s.charCodeAt(i); return new Float32Array(u.buffer); };
  async function lutsOf(scenes) {
    if (typeof LabGrade === 'undefined' || typeof GradeCore === 'undefined') return { luts: [], inline: [] };
    let names = [];
    try { names = (await LabGrade.luts()).imported.map((x) => x.name); } catch { return { luts: [], inline: [] }; }
    const json = JSON.stringify(scenes);
    const luts = []; const inline = [];
    for (const n of names.filter((nm) => json.includes(JSON.stringify(nm)))) {
      try {
        const v = await window.hub.kvGet(`lab-grade-lut-${n}`, null);
        if (!v?.data) continue;
        const file = P.safeBase(`${n}.cube`);
        inline.push({ name: file, text: GradeCore.writeCube({ title: n, N: v.N, data: b64ToF32(v.data) }) });
        luts.push({ name: n, file: `inline:${file}` });
      } catch { /* a LUT that didn't keep */ }
    }
    return { luts, inline };
  }
  // a small JPEG of a picture (the pack's thumb.jpg)
  async function jpegOf(url, max = 640) {
    if (!url) return null;
    try {
      const im = new Image();
      im.src = url;
      await im.decode();
      const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.85);
    } catch { return null; }
  }

  // ---------- the card (saving and opening) ----------
  // o: { head, name, sub, thumb, lines, facts, note, ok, problems, toggle: { label, on } } → { ok, toggle } | null
  function card(o) {
    return new Promise((resolve) => {
      const tg = o.toggle ? el('input', { type: 'checkbox', checked: o.toggle.on !== false }) : null;
      const pic = el('div', { class: `pk-pic${o.thumb ? '' : ' none'}` }, o.thumb ? el('img', { attrs: { src: o.thumb, alt: '', draggable: 'false' } }) : el('span', { text: '⇪' }));
      let done = false;
      const finish = (v) => { if (done) return; done = true; d.close(); d.remove(); resolve(v); };
      const okBtn = o.ok ? el('button', { type: 'button', class: 'primary pk-ok', text: o.ok, on: { click: () => finish({ ok: true, toggle: tg ? tg.checked : null }) } }) : null;
      const d = el('dialog', { class: 'pk-card', attrs: { 'aria-label': o.head } },
        el('div', { class: 'pk-head muted small', text: o.head }),
        el('div', { class: 'pk-main' }, pic,
          el('div', { class: 'pk-info' },
            el('h2', { class: 'pk-name', text: o.name }),
            o.sub ? el('div', { class: 'pk-sub muted small', text: o.sub }) : null,
            o.problems?.length ? el('ul', { class: 'pk-problems' }, o.problems.map((p) => el('li', { text: p }))) : null,
            o.lines?.length ? el('ul', { class: 'pk-lines' }, o.lines.map((l) => el('li', { text: l }))) : null,
            o.facts?.length ? el('div', { class: 'pk-facts muted small' }, o.facts.filter(Boolean).map((f) => el('div', { text: f, title: f }))) : null,
            tg ? el('label', { class: 'check pk-toggle' }, tg, o.toggle.label) : null)),
        o.note ? el('div', { class: 'pk-note small', text: o.note }) : null,
        el('div', { class: 'dialog-actions' }, el('button', { type: 'button', class: 'ghost pk-cancel', text: o.ok ? 'Cancel' : 'Close', on: { click: () => finish(null) } }), okBtn));
      d.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });
      d.addEventListener('click', (e) => { if (e.target === d) finish(null); });
      document.body.append(d);
      d.showModal();
      (okBtn || d.querySelector('.pk-cancel')).focus();
    });
  }
  const KIND_LABEL = { scene: 'Lab scene', sequence: 'Lab sequence', gallery: 'Gallery starting point', template: 'One of My templates' };

  // ---------- saving ----------
  // o: { kind, name, desc, scenes: [sceneData], sequence, song: path | null, thumb: url | null }
  async function save(o) {
    let scenes = o.scenes;
    const { luts, inline } = await lutsOf(scenes);
    const songPath = o.song || null;
    let songSize = 0;
    if (songPath) { try { songSize = (await window.hub.fs.stat(songPath))?.size || 0; } catch { songSize = 0; } }
    const bodyOf = (withSong) => {
      let b = { scenes: clone(scenes), sequence: clone(o.sequence), luts, song: withSong && songSize ? { file: songPath, name: songPath.split(/[\\/]/).pop() } : null, ...(o.template ? { template: clone(o.template) } : {}) }; // (round 35) a template's fields
      if (!withSong && songPath) { b = P.rewrite(b, (s) => (s === songPath ? '' : s)); for (const s of b.scenes) if (s.extras?.media?.path === '') delete s.extras.media; }
      return b;
    };
    const plan = await api().plan(bodyOf(true), inline);
    const thumb = await jpegOf(o.thumb);
    const draft = P.makeManifest({ kind: o.kind, name: o.name, scenes, sequence: o.sequence, luts, song: songSize ? { file: songPath } : null, files: plan.files.map((f) => ({ name: f.entry, size: f.size, kind: f.kind, song: f.path === songPath })), missing: plan.missing, template: o.template || null });
    if (draft.song) { const sf = plan.files.find((f) => f.path === songPath); if (sf) draft.song.file = sf.entry; else draft.song = null; }
    const dropped = scenes.reduce((n, s) => n + (s.dropped || 0), 0);
    const lines = P.describe(draft);
    if (dropped) lines.push(`${dropped} layer${dropped === 1 ? '' : 's'} showing another scene stay${dropped === 1 ? 's' : ''} out`);
    const r = await card({
      head: 'Save as a pack', name: o.name, sub: KIND_LABEL[o.kind] || '', thumb, lines,
      facts: [`About ${P.fmtSize(plan.bytes + 4096)} · one .hearthpack file`, 'Anyone who opens it gets its code and these files, and can see what\'s inside before adding it.'],
      toggle: songSize ? { label: `Include the song (${P.fmtSize(songSize)})`, on: songSize < 200 * 1048576 } : null,
      ok: 'Save…',
    });
    if (!r) return null;
    const out = await api().write({ body: bodyOf(r.toggle !== false), meta: { kind: o.kind, name: o.name, desc: o.desc || '' }, inline, thumb });
    if (!out?.ok) { if (out?.canceled) return null; throw new Error(out?.error || 'The pack wasn\'t saved'); }
    last.saved = out;
    const name = out.path.split(/[\\/]/).pop();
    toast(`⇪ Saved ${name} (${P.fmtSize(out.size)})${out.missing?.length ? ` · ${out.missing.length} file${out.missing.length === 1 ? '' : 's'} not found` : ''}`, { timeout: 7000, action: { label: 'Show in folder', fn: () => window.hub.reach?.open({ path: out.path, how: 'reveal' }) } });
    return out;
  }
  async function saveScene(id = S()?.currentId()) {
    await ThreeLab.cmd({ show: false });
    id ||= S()?.currentId();
    const sd = await sceneData(id);
    return save({ kind: 'scene', name: sd.sketch.name, scenes: [sd], song: sd.extras?.media?.path || null, thumb: S().thumbOf(id) || (id === S().currentId() ? await ThreeLab.shot().catch(() => null) : null) });
  }
  async function saveSequence(id = S()?.currentId()) {
    await ThreeLab.cmd({ show: false });
    id ||= S()?.currentId();
    const key = typeof ThreeSeq !== 'undefined' ? await ThreeSeq.keyForScene(id, { make: false }) : null;
    const edit = key && typeof CutStore !== 'undefined' ? await CutStore.editFor(key) : null;
    if (!edit) throw new Error('This scene has no sequence yet (▤ Sequence on the timeline makes one)');
    const ids = [id, ...new Set((edit.clips || []).filter((c) => c.kind === 'scene' && c.sketch && c.sketch !== id && S().get(c.sketch)).map((c) => c.sketch))];
    const scenes = [];
    for (const sid of ids) scenes.push(await sceneData(sid));
    const song = typeof ThreeSeqData !== 'undefined' ? ThreeSeqData.songOf(edit)?.src || null : null;
    return save({ kind: 'sequence', name: key.slice(4), scenes, sequence: { name: key.slice(4), edit: clone(edit) }, song: song || scenes[0].extras?.media?.path || null, thumb: S().thumbOf(id) });
  }
  // a gallery card: your own scene as it is; a starting point / library item as a scene of its layers
  async function saveGalleryItem(it, picture = null) {
    await ThreeLab.cmd({ show: false });
    if (it.kind === 'scene' && S().get(it.id)) return saveScene(it.id);
    const Ls = (await it.layers()).filter((L) => L.code);
    if (!Ls.length) throw new Error('Nothing to pack in it');
    const layers = Ls.map((L, i) => ThreeLayers.defaults({ name: L.name, code: L.code, slot: i, color: ThreeLayers.COLORS[i % ThreeLayers.COLORS.length], ...(L.blend ? { blend: L.blend } : {}), ...(L.opacity != null ? { opacity: L.opacity } : {}), ...(L.visible === false ? { visible: false } : {}) }));
    const sd = { key: 'main', sketch: { name: it.name, layers, code: layers[0].code }, extras: {}, refs: [] };
    return save({ kind: 'gallery', name: it.name, desc: it.desc || '', scenes: [sd], thumb: picture || it.picture?.() || null });
  }

  // ---------- opening ----------
  async function pickAndOpen() {
    const picked = await window.hub.openDialog({ title: 'Open a pack', filters: [{ name: 'Hearth pack', extensions: ['hearthpack'] }], properties: ['openFile'] });
    const p = (picked || []).find((x) => /\.hearthpack$/i.test(x));
    if (!p) { if ((picked || []).length) toast('That isn\'t a .hearthpack file', { type: 'error' }); return null; }
    return openFile(p);
  }
  async function openFile(path) {
    last.error = null;
    const pv = await api().peek(path);
    last.opened = pv;
    const fileName = String(path).split(/[\\/]/).pop();
    if (!pv?.ok) {
      last.error = (pv?.problems || []).join(' ');
      await card({ head: 'This pack can\'t be opened', name: pv?.manifest?.name || fileName, thumb: pv?.thumb || null, problems: pv?.problems?.length ? pv.problems : ['It couldn\'t be read.'], facts: [pv?.size ? P.fmtSize(pv.size) : '', `The file: ${path}`], note: 'Nothing was added to Hearth.' });
      return null;
    }
    const m = pv.manifest;
    const c = P.contents(m);
    const r = await card({
      head: 'Open a pack', name: m.name, sub: `${KIND_LABEL[m.kind] || 'Scene'}${m.desc ? ` · ${m.desc}` : ''}`, thumb: pv.thumb, lines: P.describe(m),
      facts: [`${P.fmtSize(pv.size)}${pv.unpacked > pv.size * 1.15 ? ` (${P.fmtSize(pv.unpacked)} unpacked)` : ''}`, P.from(m), `The file: ${path}`],
      note: `🛡 Its ${c.layers} layer${c.layers === 1 ? ' is' : 's are'} code, the same kind as any Lab scene: ${c.layers === 1 ? 'it runs' : 'they run'} only in the Lab's sandboxed preview, with no way into your files or the rest of Hearth. ${c.count ? `Its ${c.count} file${c.count === 1 ? '' : 's'} go${c.count === 1 ? 'es' : ''} into Hearth's own folder, in your asset library. ` : ''}Nothing is added until you say so.`,
      ok: m.kind === 'template' ? 'Add to my templates' : c.scenes > 1 ? `Add as ${c.scenes} new scenes` : 'Add as a new scene',
    });
    if (!r) return null;
    return importFile(path);
  }
  const uniqueName = (name) => { const have = new Set((S()?.all() || []).map((x) => x.name)); let n = P.safeName(name, 80); const b = n; let i = 2; while (have.has(n)) { n = `${b} ${i}`; i += 1; } return n; };
  async function importFile(path) {
    const u = await api().unpack(path);
    if (!u?.ok) throw new Error(`The pack couldn't be added: ${(u?.problems || ['it couldn\'t be read']).join(' ')}`);
    await ThreeLab.cmd({ show: true });
    const sc = S(); const d = D();
    // its paths → the files just unpacked (a token for a file that isn't there becomes nothing)
    let m = P.rewrite(u.manifest, (s) => { const e = P.entryOfToken(s); return e == null ? s : (u.map[e] || ''); });
    const notes = [];
    // the LUTs: into the grade (a name you already use gets a new one, and the scene follows it)
    const renames = new Map();
    if (typeof LabGrade !== 'undefined') {
      for (const l of m.luts || []) {
        if (!l?.file || !l.name) continue;
        try {
          const have = new Set(((await LabGrade.luts()).imported || []).map((x) => x.name).concat(typeof GradeCore !== 'undefined' ? GradeCore.PACK_IDS : []));
          let nm = l.name; let i = 2;
          while (have.has(nm)) { nm = `${l.name}-${i}`; i += 1; }
          const got = await LabGrade.importCube(l.file, { name: nm });
          if (got?.name && got.name !== l.name) renames.set(l.name, got.name);
        } catch (err) { notes.push(`LUT ${l.name}: ${err.message}`); }
      }
    }
    if (renames.size) m = { ...m, scenes: P.rewrite(m.scenes, (s) => (renames.has(s) ? renames.get(s) : s)), sequence: m.sequence ? P.rewrite(m.sequence, (s) => (renames.has(s) ? renames.get(s) : s)) : null };
    // (round 35, labtemplates) a template goes to My templates (its media copied into its own folder), not into a scene
    if (m.kind === 'template') {
      if (typeof LabTemplates === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('labtemplates');
      if (typeof LabTemplates === 'undefined') throw new Error('My templates did not load');
      const r = await LabTemplates.fromPack(m, { thumb: last.opened?.path === u.path ? last.opened.thumb : null });
      // its files now live in the template's own folder: the unpacked copies go (unless a big one stayed pointed at here)
      if (!r.kept?.length && u.dir) await window.hub.fs.trash([u.dir]).catch(() => {});
      last.imported = { template: r.template, id: r.id, fields: r.fields, dir: u.dir, files: Object.keys(u.map).length, notes };
      return last.imported;
    }
    // the asset library: every file of the pack, as Imported (tagged with the pack's name)
    const files = Object.values(u.map);
    let inLibrary = 0;
    if (files.length) {
      try {
        if (typeof Lazy !== 'undefined') await Lazy.load('assets').catch(() => {});
        if (typeof Assets !== 'undefined') inLibrary = (await Assets.add(files, { src: 'import', tg: ['pack', ...P.safeName(m.name, 40).toLowerCase().split(/\s+/).slice(0, 3)], o: { app: 'Hearth pack', name: m.name } })).length;
      } catch (err) { notes.push(`asset library: ${err.message}`); }
    }
    // the scenes (the first one is the one it's about)
    const ids = new Map();
    for (const s of m.scenes) {
      const layers = (Array.isArray(s.sketch.layers) && s.sketch.layers.length ? s.sketch.layers : [{ id: 'main', name: s.sketch.name, code: s.sketch.code || '' }]).map((L, i) => ({ ...L, id: L.id || (i ? ThreeLayers.newId() : 'main'), name: String(L.name || `Layer ${i + 1}`), code: String(L.code || '') }));
      const ex = s.extras && typeof s.extras === 'object' ? s.extras : {};
      if (ex.media && !ex.media.path) delete ex.media;
      const x = sc.create({ name: uniqueName(s.sketch.name || m.name), code: layers[0].code, layers, frame: ex.frame || null, timeline: ex.timeline || null });
      sc.setExtras?.(x.id, ex);
      ids.set(s.key, { id: x.id, s });
    }
    // their references, their palette (each scene open in turn; the main one last)
    let refsOk = 0;
    for (const { id, s } of [...ids.values()].reverse()) {
      const refs = (s.refs || []).filter((r) => r?.path);
      if (!refs.length && !s.sketch.palette?.length) continue;
      d.openSketch(id);
      for (const r of refs) { try { await d.refs.add(r.path, r.key); refsOk += 1; } catch (err) { notes.push(`${r.name}: ${err.message}`); } }
      if (Array.isArray(s.sketch.palette) && s.sketch.palette.length) d.refs.setPalette(s.sketch.palette.map(String).slice(0, 16));
    }
    const main = ids.values().next().value;
    // its sequence, owned by the new main scene, its clips pointing at the new scenes
    let seqName = null;
    if (m.sequence?.edit && typeof CutStore !== 'undefined') {
      try {
        const e = clone(m.sequence.edit);
        e.seq = { ...(e.seq || {}), scene: main.id };
        e.clips = (e.clips || []).map((c) => (c.kind === 'scene' && ids.has(c.sketch) ? { ...c, sketch: ids.get(c.sketch).id } : c));
        await CutStore.editFor('seq:__probe__');
        const taken = new Set(CutStore.sequences().map((x) => x.key));
        let k = `seq:${P.safeName(m.sequence.name || m.name, 60)}`; const b = k;
        for (let i = 2; taken.has(k); i += 1) k = `${b} ${i}`;
        e.seq.name = k.slice(4);
        await CutStore.storeEdit(k, e, 'From a pack');
        seqName = k.slice(4);
        await ThreeSeq?.list?.();
      } catch (err) { notes.push(`sequence: ${err.message}`); }
    }
    d.openSketch(main.id);
    last.imported = { scenes: [...ids.values()].map((v) => v.id), main: main.id, name: sc.get(main.id)?.name, dir: u.dir, files: files.length, inLibrary, refs: refsOk, luts: [...renames.entries()], sequence: seqName, notes };
    toast(`⇪ "${last.imported.name}" is a new scene${ids.size > 1 ? ` (+${ids.size - 1} more)` : ''}${seqName ? ' with its sequence' : ''}${files.length ? ` · its ${files.length} file${files.length === 1 ? ' is' : 's are'} in your asset library` : ''}`, { timeout: 6000 });
    if (notes.length) console.warn('packs: import notes', notes);
    return last.imported;
  }

  // ---------- chat (the app's internal API; the buttons are the way in) ----------
  if (typeof Commands !== 'undefined' && !Commands.get('pack')) {
    Commands.register({
      name: 'pack', area: 'Three.js Lab', args: '[save [scene] | sequence | open <file.hearthpack>]',
      desc: 'Share a scene as one file: save the Lab scene (or its sequence) with everything it uses as a .hearthpack; open one (a card shows what\'s inside first)',
      complete: (a) => ['save', 'sequence', 'open '].filter((x) => x.startsWith(String(a || '').toLowerCase())).map((value) => ({ value })),
      async run(args, ctx) {
        const a = String(args || '').trim();
        const m = a.match(/^(save|sequence|open)\b\s*(.*)$/i) || ['', 'save', a];
        const op = m[1].toLowerCase(); const rest = m[2].trim().replace(/^["']|["']$/g, '');
        if (op === 'open') { if (!rest) { await pickAndOpen(); return; } const r = await openFile(rest); ctx.say(r ? `Added "${r.name}" from the pack.` : 'Nothing was added.'); return; }
        await ThreeLab.cmd({ show: false });
        let id = S().currentId();
        if (rest) { const n = rest.toLowerCase(); id = (S().all().find((x) => x.name.toLowerCase() === n) || S().all().find((x) => x.name.toLowerCase().includes(n)))?.id; if (!id) { ctx.say(`No scene "${rest}".`); return; } }
        const r = op === 'sequence' ? await saveSequence(id) : await saveScene(id);
        ctx.say(r ? `Saved ${r.path} (${P.fmtSize(r.size)}, ${r.files} file${r.files === 1 ? '' : 's'}).` : 'Not saved.');
      },
    });
  }

  return { saveScene, saveSequence, saveGalleryItem, save, openFile, pickAndOpen, importFile, sceneData, card, last };
})();
