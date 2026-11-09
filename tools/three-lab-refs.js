// (round 158, split158) The Lab's references dialog and palette tools (📎 References, 🎨 Palette ▾, import a palette, palette from a picture).
// Moved out of tools/three.js as it was, loaded on first use (lazy group `labpartrefs`, tools/three.js labPart): the names
// it reads inside the Lab (the sketch tab: its state, helpers, the other parts' stand-ins) go through K.
(window.LabParts ||= {}).refs = (K) => {
  async function importPalette() {
    let clip = '';
    try { clip = await navigator.clipboard.readText(); } catch { /* no clipboard text */ }
    const text = await Modal.prompt('Import a palette', {
      value: K.parseColors(clip).length >= 2 ? clip.trim().slice(0, 2000) : '',
      multiline: true,
      label: 'Paste a Coolors link (coolors.co/palette/…), a Coolors export (CSS, array, JSON) or any hex codes.',
      placeholder: 'https://coolors.co/palette/264653-2a9d8f-e9c46a-f4a261-e76f51',
    });
    if (text == null) return;
    const cols = K.parseColors(text);
    if (cols.length < 2) { toast('No colors found in that', { type: 'error' }); return; }
    K.setPalette(cols);
    K.savePalette(/coolors/i.test(text) ? `Coolors ${cols.map((c) => c.slice(1, 4)).join('')}` : `Imported ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })} ${cols[0]}`, cols);
    toast(`Palette set: ${cols.length} colors (also saved in 🎨 → Saved)`, { timeout: 2400 });
  }
  function paletteMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const pal = K.current?.palette || [];
    const saved = K.savedPalettes();
    K.popup(r.left, r.bottom + 4, [
      'Palette',
      ['Import from Coolors…', 'Paste a coolors.co link or export, or hex codes (reads your clipboard)', () => importPalette()],
      ['Open coolors.co', 'Make one there (space bar = new colors), then copy the link and import it', () => window.open('https://coolors.co/generate')],
      ['From a reference picture…', 'Open References and press 🎨 Palette on a picture', () => openRefs()],
      pal.length ? ['Save this palette…', pal.join(' '), async () => { const n = await Modal.prompt('Palette name', { value: K.current?.name || 'My palette' }); if (n) { K.savePalette(n.trim(), pal); toast('Saved', { timeout: 1200 }); } }] : null,
      pal.length ? ['Recolor the selected layer', 'Put these colors into its color sliders', () => K.recolor()] : null,
      pal.length ? ['Remove the palette', 'From this sketch', () => K.setPalette([])] : null,
      saved.length ? 'Saved (click to use)' : null,
      ...saved.map((p) => [p.name, p.colors.join(' '), () => K.setPalette(p.colors), pal.join() === p.colors.join()]),
      saved.length ? ['Delete a saved palette…', '', () => {
        K.popup(r.left, r.bottom + 4, ['Delete which one?', ...K.savedPalettes().map((p) => [p.name, p.colors.join(' '), () => { store.set('three.palettes', K.savedPalettes().filter((x) => x.name !== p.name)); window.LabPresets?.changed(); toast(`Deleted "${p.name}"`, { timeout: 1500 }); }])]);
      }] : null,
    ]);
  }
  // Dominant colors of a picture: a coarse color histogram, then the most common buckets that differ enough.
  async function paletteFrom(path, n = 6) {
    const img = new Image(); img.src = K.fileUrl(path); await img.decode();
    const cv = document.createElement('canvas'); const sc = Math.min(1, 160 / Math.max(img.width, img.height));
    cv.width = Math.max(1, Math.round(img.width * sc)); cv.height = Math.max(1, Math.round(img.height * sc));
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0, cv.width, cv.height);
    const d = g.getImageData(0, 0, cv.width, cv.height).data;
    const buckets = new Map();
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const key = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      b.n += 1; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2];
      buckets.set(key, b);
    }
    const cands = [...buckets.values()].map((b) => ({ n: b.n, r: b.r / b.n, g: b.g / b.n, b: b.b / b.n }))
      .map((c) => { const mx = Math.max(c.r, c.g, c.b); const mn = Math.min(c.r, c.g, c.b); return { ...c, score: c.n * (0.35 + (mx - mn) / 255) }; })
      .sort((a, b) => b.score - a.score);
    const out = [];
    for (const c of cands) {
      if (out.every((o) => Math.hypot(o.r - c.r, o.g - c.g, o.b - c.b) > 48)) out.push(c);
      if (out.length >= n) break;
    }
    const hex = (v) => Math.round(v).toString(16).padStart(2, '0');
    return out.map((c) => `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`);
  }
  // (round 100, modeltex100) one of a model's other files changed on disk (its picture saved again in Photoshop, its .bin
  // exported again; from: its original, copied over Hearth's copy first): read again. A picture goes into the model's
  // textures in place (three-sandbox.html rmodFileUpdate: decoded off the page's thread, in slices, the old picture shown
  // until the new one is up); anything else runs the scene again (the model parsed again with it).
  async function reloadRefFile(id, rel, { from = null } = {}) {
    const r = Object.values(K.refsAll).flat().find((x) => x.id === id);
    if (!r) return { ok: false, error: 'No such reference' };
    const f = typeof LabModelsCore !== 'undefined' ? LabModelsCore.folderOf(r.path) : null;
    rel = String(rel || '');
    if (!f || !rel || rel.split(/[\\/]/).some((s) => s === '..' || s === '')) return { ok: false, error: 'Not one of this model\'s files' };
    const sep = /\\/.test(f.dir) && !/\//.test(f.dir) ? '\\' : '/';
    const p = `${f.dir}${sep}${rel.split('/').join(sep)}`;
    if (from) { try { await window.hub.fs.copy(from, p); } catch (err) { return { ok: false, error: err.message }; } }
    if (!K.refsOf().includes(r)) return { ok: true, later: true };
    const old = K.refFiles.get(r.id)?.list.find((x) => x.rel === rel)?.sig || null;
    const fl = await K.listRefFiles(r);
    const x = fl?.list.find((y) => y.rel === rel);
    if (!x) return { ok: false, missing: true };
    if (x.sig === old) return { ok: true, same: true }; // (the copy over Hearth's copy, seen a second time)
    let u8; try { u8 = await window.hub.fs.read(x.path, { encoding: 'buffer', maxBytes: K.FILES_MAX }); } catch (err) { return { ok: false, error: err.message, missing: true }; }
    if (!K.refsOf().includes(r)) return { ok: true, later: true };
    const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    if (old) K.fileBytes.delete(old);
    K.fileBytes.set(x.sig, buf);
    // the model's sig covers its files
    const ms = K.refSigs.get(r.id); const msig = ms ? K.withFiles(r, ms.replace(/\+\d+-[0-9a-z]+$/, '')) : null;
    if (msig) K.refSigs.set(r.id, msig);
    if (old && /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(rel)) {
      K.refsSig = K.refsSigOf(K.refsOf().filter((y) => y === r || K.refReady(y)));
      K.box.send({ type: 'ref-file-update', item: { key: r.key, rel, mime: K.MIMES[rel.split('.').pop().toLowerCase()] || '', buffer: buf.slice(0), ...(K.assetCacheOn() ? { sig: x.sig, ...(msig ? { msig } : {}) } : {}) } });
      return { ok: true, inPlace: true };
    }
    K.refsSig = null; K.sendRefs(); K.run({ sync: true });
    return { ok: true, inPlace: false };
  }
  async function addRef(src, { key, sketchId = null } = {}) {
    // (round 72, labbridge72) sketchId: another scene's references (a chat's scene that runs backstage): saved with that
    // scene, its bytes go to the preview when it's opened
    const other = sketchId && sketchId !== K.current?.id ? sketchId : null;
    if (other && !K.sketches.some((x) => x.id === other)) throw new Error('That scene is gone (deleted?)');
    if (!K.current && !other) throw new Error('Open a sketch first');
    const owner = other || K.current.id;
    const list = () => (K.refsAll[owner] ||= []);
    const name = String(src).split(/[\\/]/).pop().replace(/^\d{10,}-/, '');
    const kind = K.refKindOf(name);
    if (!kind) throw new Error(`${name} isn't a file a sketch can use (images, videos, 3D models, audio, fonts, data files)`);
    const st = await window.hub.fs.stat(src);
    if(!other&&K.current?.id!==owner)throw new Error('Sketch changed while importing; try again in the intended sketch');
    if (st.size > 400 * 1048576) throw new Error(`${name} is over 400 MB`);
    const existing = list().find((r) => r.name === name && r.size === st.size);
    if (existing) return existing;
    // (round 99, labmodels99) a model of several files: its folder copied whole; a file it names that isn't there is said
    const whole = kind === 'model' && window.hub.importRefWhole && /[.](gltf|glb|obj)$/i.test(name) ? await window.hub.importRefWhole(src) : null;
    const path = whole ? whole.path : await window.hub.importRef(src);
    if(!other&&K.current?.id!==owner)throw new Error('Sketch changed while importing; the copied asset was kept safely');
    const r = { id: `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, key: K.refKey(key || name, null, list()), name, kind, path, size: st.size, at: Date.now(), ...(/[\\/]refs[\\/]\d{10,}-/.test(src) ? {} : { src }), ...(whole?.files > 1 ? { files: whole.files } : {}), ...(whole?.missing?.length ? { missing: whole.missing.slice(0, 20) } : {}) }; // (round 42) src: the original, followed when you save it again
    if (whole?.missing?.length) toast(`${name} came without ${whole.missing.length === 1 ? 'a file it uses' : `${whole.missing.length} files it uses`}: ${whole.missing.slice(0, 3).join(' · ')}${whole.missing.length > 3 ? ` (and ${whole.missing.length - 3} more)` : ''}. Put ${whole.missing.length === 1 ? 'it' : 'them'} next to it and add it again.`, { timeout: 9000 });
    K.refAdded = { name, files: whole?.files || 1, missing: whole?.missing || [], used: whole?.used || [] }; // (round 99: dev/checks/labmodels99.js)
    list().push(r);
    K.saveRefs();
    if (other) return r;
    await K.loadRefBytes();
    K.renderRefsBtn();
    if (K.refsDlg?.open) renderRefsDlg();
    return r;
  }
  // (round 99, labmodels99) several files or folders at once (the References dialog's pick and drop): a folder adds the
  // models in it; a file a model of the same drop names (its .bin, .mtl, pictures) comes with the model, not on its own
  async function addRefs(paths) {
    const entries = await Promise.all((paths || []).map(async (p) => { const st = await window.hub.fs.stat(p).catch(() => null); return { name: String(p).split(/[\\/]/).pop(), path: p, isDir: Boolean(st?.isDir) }; }));
    const g = await LabModelsCore.groupDrop(entries, { list: (d) => window.hub.fs.list(d, { recursive: true, depth: 6 }), uses: (ps) => window.hub.refUses?.(ps) || {} });
    for (const f of g.folders) if (f.why) toast(f.why, { type: 'error' });
    const added = [];
    for (const e of g.add) { try { added.push(await addRef(e.path)); } catch (err) { toast(err.message, { type: 'error' }); } }
    if (g.with.length) toast(g.with.map((w) => `${w.model}: ${w.n === 1 ? 'its file came' : `its ${w.n} files came`} with it`).join(' · '), { timeout: 4000 });
    return { added, with: g.with, folders: g.folders };
  }
  // (round 42, filewatch) a reference changed on disk (saved again in Photoshop, replaced in Finder; from: its original,
  // copied over Hearth's copy first): read again and swapped into the textures using it in place, no re-run; a model /
  // sound / data reference runs the scene again (in place). Another scene's is read when that scene opens.
  async function reloadRef(id, { from = null } = {}) {
    const r = Object.values(K.refsAll).flat().find((x) => x.id === id);
    if (!r) return { ok: false, error: 'No such reference' };
    if (from) { try { await window.hub.fs.copy(from, r.path); } catch (err) { return { ok: false, error: err.message }; } }
    if (!K.refsOf().includes(r)) { K.refBytes.delete(r.id); return { ok: true, later: true }; }
    let u8; try { u8 = await window.hub.fs.read(r.path, { encoding: 'buffer', maxBytes: 400 * 1048576 }); } catch (err) { return { ok: false, error: err.message, missing: true }; }
    const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    K.refBytes.set(r.id, buf); r.size = buf.byteLength; K.saveRefs();
    K.refSigs.delete(r.id); if (K.assetCacheOn()) { try { const st = await window.hub.fs.stat(r.path); if (st && !st.error) K.refSigs.set(r.id, `${r.path}|${st.size}|${Math.round(st.mtimeMs || st.mtime || 0)}`); } catch { /* fine */ } } // (round 75)
    if (r.kind === 'image' || r.kind === 'video') {
      K.refsSig = K.refsSigOf(K.refsOf().filter((x) => K.refReady(x)));
      K.box.send({ type: 'ref-update', item: { key: r.key, kind: r.kind, mime: K.MIMES[r.name.split('.').pop().toLowerCase()] || '', buffer: buf.slice(0), ...(K.refSigs.has(r.id) ? { sig: K.refSigs.get(r.id) } : {}) } });
      return { ok: true, inPlace: true };
    }
    K.refsSig = null; K.sendRefs(); K.run({ sync: true });
    return { ok: true, inPlace: false };
  }
  function openRefs() {
    K.refsDlg?.remove();
    K.refsGrid = el('div', { class: 'refs-grid' });
    const add = K.btn('＋ Add files…', 'Pick images, videos, models…', async () => {
      const paths = await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], title: 'References for this sketch' });
      await addRefs(paths); // (round 99, labmodels99: a model's .bin / pictures picked with it come with it)
    }, 'primary small');
    K.refsDlg = el('dialog', { class: 'ui-modal refs-dialog' },
      el('div', { class: 'refs-head' }, el('h3', { text: `References · ${K.current?.name || ''}` }), el('span', { class: 'spacer' }), add, K.btn('Close', '', () => K.refsDlg.close())),
      el('p', { class: 'muted small', text: 'Drop files here. In code: refTexture(\'name\') for images and videos, refs.name (a URL) for models, sounds and data. Or just ask the director: "use the logo on the cube".' }),
      K.refsGrid);
    dropZone(K.refsDlg, (files) => addRefs(files.map((f) => window.hub.pathForFile(f)).filter(Boolean)), { hint: 'Drop to add references' }); // (round 99, labmodels99: a folder, or a model with its files)
    K.refsDlg.addEventListener('close', () => { K.refsDlg.remove(); K.refsDlg = null; });
    document.body.append(K.refsDlg);
    renderRefsDlg();
    K.openLight(K.refsDlg);
  }
  function renderRefsDlg() {
    if (!K.refsGrid) return;
    const list = K.refsOf();
    K.refsGrid.replaceChildren(...(list.length ? list.map((r) => {
      const thumb = r.kind === 'image' ? el('img', { src: K.fileUrl(r.path), alt: '' })
        : r.kind === 'video' ? el('video', { src: K.fileUrl(r.path), muted: true, loop: true, playsInline: true, on: { mouseenter: (e) => e.target.play(), mouseleave: (e) => e.target.pause() } })
          : el('span', { class: 'refs-icon', text: K.REF_ICONS[r.kind] });
      const keyIn = el('input', { class: 'refs-key', value: r.key, spellcheck: false, title: 'The name code uses for it' });
      keyIn.addEventListener('change', () => { keyIn.value = K.renameRef(r, keyIn.value); renderRefsDlg(); });
      // (round 140, dropmedia140) a picture or a clip drags onto the timeline (tools/three-dropmedia.js): a layer at that time
      const media = r.kind === 'image' || r.kind === 'video';
      const card = el('div', { class: 'refs-card', attrs: media ? { draggable: 'true', title: 'Drag onto the timeline: a layer at that time' } : {}, on: media ? {
        dragstart: (e) => { e.dataTransfer.setData('application/x-hearth-labref', JSON.stringify({ key: r.key, name: r.name, kind: r.kind, path: r.path })); e.dataTransfer.effectAllowed = 'copy'; window.Lazy?.load('dropmedia').catch(() => {}); for (const n of [K.refsDlg, K.refsDlg?.previousElementSibling]) if (n) { n.style.pointerEvents = 'none'; n.style.opacity = '0.35'; } },
        dragend: () => { for (const n of [K.refsDlg, K.refsDlg?.previousElementSibling]) if (n) { n.style.pointerEvents = ''; n.style.opacity = ''; } },
      } : {} });
      card.append(el('div', { class: 'refs-thumb' }, thumb), keyIn,
        el('div', { class: 'refs-meta', text: `${r.kind} · ${K.fmtSize(r.size)} · ${r.name}${r.files > 1 ? ` · ${r.files} files` : ''}${r.missing?.length ? ` · ⚠ ${r.missing.length} missing` : ''}`, title: r.missing?.length ? `It came without: ${r.missing.join(' · ')}` : '' }), // (round 99, labmodels99)
        el('div', { class: 'refs-actions' },
          K.btn('Copy code', K.refUse(r), () => { navigator.clipboard.writeText(K.refUse(r)); toast(`Copied ${K.refUse(r)}`, { timeout: 1200 }); }),
          K.btn('Ask director', 'Start a message to the Three Director about this reference', () => askAboutRef(r), 'ghost small imp-ai'),
          K.btn('Show', 'Show the file', () => window.hub.fs.reveal(r.path)),
          r.kind === 'video' && typeof ThreeFrames !== 'undefined' ? K.btn('🎞 Read ▾', 'Read this clip exactly: contact sheet, scenes, motion, pacing · match its pacing (its rhythm, not its footage)', (e) => { const rr = e.currentTarget.getBoundingClientRect(); K.refsDlg?.close(); ThreeFrames.refMenu(rr.left, rr.bottom + 4, r.path, r.key); }) : null,
          r.kind === 'image' ? K.btn('✦ Like this', 'Make a layer like this: the director studies the picture and builds ONE new layer in its spirit, with sliders, in its palette (the cost shows first)', () => { K.refsDlg?.close(); (window.Lazy ? Lazy.load('refmatch') : Promise.resolve()).then(() => LabRefMatch.fromRef(r)).catch((err) => toast(err.message, { type: 'error' })); }, 'ghost small imp-ai') : null, // (round 131, refmatch131)
          r.kind === 'image' ? K.btn('🎨 Palette', 'Use this picture\'s colors as the sketch palette', async () => { try { const cols = await paletteFrom(r.path); K.setPalette(cols); toast(`Palette: ${cols.join(' ')}`, { timeout: 2400 }); } catch (err) { toast(err.message, { type: 'error' }); } }) : null,
          media ? K.btn('⋯', 'More: ◎ Match against this', (e) => { const rr = e.currentTarget.getBoundingClientRect(); showMenu(rr.left, rr.bottom + 4, [{ label: '◎ Match against this', hint: 'a live "how close am I?" score by the stats line', action: () => { K.refsDlg?.close(); (window.Lazy ? Lazy.load('matchscore') : Promise.resolve()).then(() => LabMatch.fromRef(r)).catch((err) => toast(err.message, { type: 'error' })); } }]); }) : null, // (round 141, matchscore141)
          K.btn('🗑', 'Remove (the copy goes to the Recycle Bin)', () => { K.removeRef(r); renderRefsDlg(); })));
      return card;
    }) : [el('div', { class: 'refs-empty', text: 'No references yet. Add pictures, logos, video clips, 3D models (.glb), sounds or data files.' })]));
  }
  function askAboutRef(r) {
    const agent = H.agents().find((a) => a.dock === 'three' && a.mode === 'native');
    if (!agent) return;
    K.refsDlg?.close();
    Native.setDraft(agent.id, `Use the reference "${r.key}" (${r.kind}, ${r.name}) in the sketch: `);
    if (r.kind === 'image') Native.attachPaths(agent.id, [r.path]);
  }
  return { openRefs, renderRefsDlg, reloadRefFile, reloadRef, addRefs, paletteMenu, paletteFrom, addRef };
};
