// (round 69, photos69) Photos in My Paris: on any moment of your Paris map (a place, a show, a walk, a park or music
// session) "📷 Add photos" picks or takes dropped JPEG / HEIC / PNG photos; Hearth keeps a resized COPY of each (long
// edge 2048 px + a 400 px thumb) in its data folder (paris-photos/<month>/), with the date it was taken and, only when
// you tick "Keep location", where. Your original photos are only read, never changed or moved. A moment shows a small
// strip of its photos; a click opens a light viewer (‹ ›, Show file, Remove → the Trash, the copies only).
// "📷 From a folder…" (under the map) reads a folder (a phone import) and SUGGESTS which photos go with which moment
// by when they were taken (EXIF, the photo's own time zone, else this computer's) and, when the photo has GPS, how far
// it was from the place; nothing is added until you click Add. The monthly card can carry up to 4 of them (a toggle in
// My month in Paris). Nothing is uploaded or fetched; no AI. Zero idle cost: no timers, work only when you click.
// The thinking (EXIF, time zones, matching, sizes) is in tools/parisphotos-core.js; the files in parisphotosmain.js.
const ParisPhotos = window.ParisPhotos = (() => {
  const K = ParisPhotosCore;
  const api = () => window.hub.parisPhotos;
  const PREF = 'photos69';
  let prefs = { keepPlace: false, ...(store.get(PREF, {}) || {}) };
  let data = null, loaded = null, loading = null, root = '', version = 0, chain = Promise.resolve();
  const _test = { pick: null, folder: null, zone: '', made: [] }; // (checks) files / folder instead of the system's pickers; a fixed time zone
  const zone = () => _test.zone || (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris'; } catch { return 'Europe/Paris'; } })();
  const savePrefs = () => store.set(PREF, { keepPlace: prefs.keepPlace });
  const relabel = (b, t) => { const x = b.querySelector('.qj-action-text'); if (x) x.textContent = t; else if (b.firstChild) b.firstChild.textContent = t; if (b.hasAttribute('aria-label')) b.setAttribute('aria-label', t); };
  const changed = () => { version++; document.dispatchEvent(new CustomEvent('hearth:paris-photos', { detail: { version } })); };

  // ---------- the list (kv paris-photos, DataSafe: a failed read is never "empty") ----------
  function load() {
    if (data) return Promise.resolve(data);
    return (loading ||= (async () => {
      loaded = typeof DataSafe !== 'undefined' ? await DataSafe.load(K.KV, null) : await window.hub.kvGet(K.KV, null, { status: true }).then((r) => ({ value: r?.value ?? null, ok: r?.state === 'ok' || r?.state === 'missing' }));
      const d = await api()?.dir?.().catch(() => null); root = d?.ok ? d.dir : '';
      data = K.validate(loaded.value); version++;
      return data;
    })().finally(() => { loading = null; }));
  }
  function save(fn) {
    chain = chain.catch(() => {}).then(async () => {
      await load(); const next = fn(data);
      const r = typeof DataSafe !== 'undefined' ? await DataSafe.save(K.KV, next, loaded) : await window.hub.kvSet(K.KV, next);
      if (r?.refused) throw Error('Your photo list could not be read just now, so nothing was changed. Try again in a moment.');
      data = next; changed();
    });
    return chain;
  }
  const abs = (rel) => (root && rel ? WinMac.join(root, ...rel.split('/')) : '');
  const view = (p) => ({ ...p, src: abs(p.file), thumbSrc: abs(p.thumb) });
  /** the photos of a moment, as files on this computer (sync; [] until the list is read) */
  const of = (m) => (data && root ? K.keptFor(data, m).map(view) : []);
  /** gives each moment its photos (m.photos) and a cover for its pin (m.cover: the first thumb) */
  function decorate(list) {
    if (!data) { load().then(changed).catch(() => {}); return list; }
    for (const m of list) { const ph = of(m); if (ph.length) { m.photos = ph; m.cover = ph[0].thumbSrc; } }
    return list;
  }

  // ---------- a photo → Hearth's copies ----------
  const sha = async (b) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b))).map((x) => x.toString(16).padStart(2, '0')).join('');
  const rnd = () => Array.from(crypto.getRandomValues(new Uint8Array(5))).map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 8);
  // a quarter turn / mirror from the photo's EXIF orientation, for a picture whose converted copy lost it (HEIC on Windows)
  function orient(g, o, W, H) {
    const t = { 2: [-1, 0, 0, 1, W, 0], 3: [-1, 0, 0, -1, W, H], 4: [1, 0, 0, -1, 0, H], 5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, W, 0], 7: [0, -1, -1, 0, W, H], 8: [0, -1, 1, 0, 0, H] }[o];
    if (t) g.transform(...t);
  }
  async function jpegOf(cv, q) { const b = await cv.convertToBlob({ type: 'image/jpeg', quality: q }); return new Uint8Array(await b.arrayBuffer()); }
  /** one photo ({ name, bytes, path?, mtime? }) → its copies on disk and its record; or { skip: why } */
  async function copyOne(m, f) {
    const bytes = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes || []), kind = K.kindOf(bytes);
    if (!kind) return { skip: 'not a JPEG, HEIC or PNG photo' };
    if (bytes.length > K.MAX_BYTES) return { skip: 'over 60 MB' };
    const x = K.readExif(bytes) || {}, z = zone();
    const taken = K.takenAt(x, { zone: z }) || (Number.isFinite(f.mtime) ? { at: f.mtime, from: 'file' } : null);
    let pic = bytes, mime = kind === 'png' ? 'image/png' : 'image/jpeg', turn = 1;
    if (kind === 'heic') {
      const r = await api().heic(bytes);
      if (!r?.ok) return { skip: r?.why || 'this computer can\'t open HEIC photos', heic: true };
      pic = new Uint8Array(r.bytes); mime = 'image/jpeg';
      if (r.rotate && (K.readExif(pic)?.orientation || 1) === 1) turn = x.orientation || 1; // the converted copy lost "which way up"
    }
    let bm; try { bm = await createImageBitmap(new Blob([pic], { type: mime })); } catch { return { skip: 'the picture inside can\'t be read' }; } // (Chromium turns JPEGs the right way up from their EXIF)
    try {
      const sw = K.turned(turn) ? bm.height : bm.width, sh = K.turned(turn) ? bm.width : bm.height, big = K.fit(sw, sh, K.BIG), th = K.fit(sw, sh, K.THUMB);
      const cv = new OffscreenCanvas(big.w, big.h), g = cv.getContext('2d'); g.imageSmoothingQuality = 'high';
      orient(g, turn, big.w, big.h); g.drawImage(bm, 0, 0, K.turned(turn) ? big.h : big.w, K.turned(turn) ? big.w : big.h);
      const tc = new OffscreenCanvas(th.w, th.h), tg = tc.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(cv, 0, 0, th.w, th.h);
      // the copy carries when it was taken; GPS only when you keep it (the canvas wrote no EXIF at all: nothing else leaks)
      const app1 = taken ? K.makeExif({ date: K.exifDate(taken.at, z), offset: K.offsetWords(K.zoneOffset(z, taken.at)), gps: prefs.keepPlace ? x.gps : null }) : null;
      const bigBytes = K.withExif(await jpegOf(cv, 0.86), app1), thumbBytes = K.withExif(await jpegOf(tc, 0.8));
      const at = taken?.at ?? Date.now(), month = new Date(at).toISOString().slice(0, 7), id = K.newId(at, rnd()), n = K.names(id, month);
      for (const [rel, b] of [[n.file, bigBytes], [n.thumb, thumbBytes]]) { const r = await api().put(rel, b); if (!r?.ok) throw Error(r?.error || 'The copy could not be saved.'); }
      _test.made.push({ id, w: big.w, h: big.h, tw: th.w, th: th.h, bytes: bigBytes.length });
      return { rec: { id, moment: m.id, file: n.file, thumb: n.thumb, w: big.w, h: big.h, taken: taken ? new Date(taken.at).toISOString() : null, takenFrom: taken?.from || null, name: String(f.name || '').slice(0, 200), source: f.path || '', hash: await sha(bytes), addedAt: new Date().toISOString(), ...(prefs.keepPlace && x.gps ? { gps: x.gps } : {}) } };
    } finally { bm.close?.(); }
  }
  /** add photos to a moment: { added, skipped: [{ name, why }] }. onStep(i, n) for a progress line. */
  async function addTo(m, files, onStep = () => {}) {
    await load();
    const have = of(m), room = K.MAX_PER_MOMENT - have.length, hashes = new Set(have.map((p) => p.hash)), recs = [], skipped = [];
    let i = 0;
    for (const f of files) {
      onStep(++i, files.length);
      if (recs.length >= room) { skipped.push({ name: f.name, why: `a moment keeps up to ${K.MAX_PER_MOMENT} photos` }); continue; }
      try {
        const bytes = f.bytes || (f.path ? await window.hub.fs.read(f.path, { encoding: 'buffer', maxBytes: K.MAX_BYTES }) : null);
        if (!bytes) { skipped.push({ name: f.name, why: 'it can\'t be read' }); continue; }
        const h = await sha(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)); if (hashes.has(h)) { skipped.push({ name: f.name, why: 'already here' }); continue; }
        const r = await copyOne(m, { ...f, bytes });
        if (r.skip) skipped.push({ name: f.name, why: r.skip, heic: r.heic }); else { recs.push(r.rec); hashes.add(r.rec.hash); }
      } catch (err) { skipped.push({ name: f.name, why: typeof calmError === 'function' ? calmError(err) : err.message }); }
    }
    let added = [];
    if (recs.length) await save((s) => { const r = K.add(s, recs); added = r.added; return r.store; });
    return { added, skipped };
  }
  const summary = ({ added, skipped }) => {
    const bits = [];
    if (added.length) bits.push(`Added ${added.length} photo${added.length === 1 ? '' : 's'} (copies; your originals are untouched)`);
    const heic = skipped.find((s) => s.heic);
    if (skipped.length) bits.push(`${skipped.length} left out: ${[...new Set(skipped.map((s) => (s.heic ? 'HEIC' : s.why)))].slice(0, 2).join('; ')}`);
    if (heic) bits.push(heic.why);
    return bits.join('. ') || 'Nothing was added.';
  };

  // ---------- a moment's photo row: thumbs · 📷 Add photos · Keep location (and drop photos on the moment) ----------
  /** the row for a moment card (kit: the Studio's dialog kit); the card itself takes dropped photos */
  function section(m, kit, card) {
    const { E } = kit, box = E('section', { class: 'pp-row', attrs: { 'aria-label': 'Photos' } }), status = E('span', { class: 'pp-status', attrs: { role: 'status', 'aria-live': 'polite' } });
    box.dataset.moment = m.id;
    const paint = () => {
      const ph = of(m), strip = E('div', { class: 'pp-strip', attrs: { role: 'list', 'aria-label': `${ph.length} photo${ph.length === 1 ? '' : 's'}` } });
      ph.forEach((p, i) => {
        const b = E('button', { type: 'button', class: 'pp-thumb', attrs: { role: 'listitem', 'aria-label': `Open photo ${i + 1} of ${ph.length}${p.taken ? `, taken ${K.clock(Date.parse(p.taken), zone())}` : ''}`, title: p.taken ? `Taken ${K.clock(Date.parse(p.taken), zone())}` : p.name }, on: { click: () => viewer(m, i, kit) } },
          E('img', { attrs: { src: WinMac.fileUrl(p.thumbSrc), alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' } }));
        b.dataset.photo = p.id; strip.append(b);
      });
      const add = kit.button('📷 Add photos', () => pick(m, status), 'qj-quiet pp-add'); add.dataset.help = 'Pick photos (JPEG, HEIC or PNG) or drop them on this moment. Hearth keeps resized copies; your originals stay as they are.';
      const keep = E('label', { class: 'pp-keep', attrs: { title: 'Keep where each photo was taken (GPS) in Hearth\'s copies. Off: the copies carry no location.' } }, E('input', { type: 'checkbox', attrs: prefs.keepPlace ? { checked: '' } : {}, on: { change: (e) => { prefs.keepPlace = e.target.checked; savePrefs(); } } }), E('span', { text: 'Keep location' }));
      box.replaceChildren(...(ph.length ? [strip] : []), E('div', { class: 'pp-acts' }, add, keep, status));
    };
    paint();
    const onChange = () => { if (box.isConnected) paint(); else document.removeEventListener('hearth:paris-photos', onChange); };
    document.addEventListener('hearth:paris-photos', onChange);
    if (!data) load().then(paint).catch(() => {});
    // drop photos on the moment
    const target = card || box;
    target.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); target.classList.add('pp-drop'); } });
    target.addEventListener('dragleave', (e) => { if (!target.contains(e.relatedTarget)) target.classList.remove('pp-drop'); });
    target.addEventListener('drop', async (e) => {
      const files = [...(e.dataTransfer?.files || [])]; target.classList.remove('pp-drop'); if (!files.length) return;
      e.preventDefault(); e.stopPropagation();
      const list = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), path: window.hub.pathForFile?.(f) || '', mtime: f.lastModified })));
      await run(m, list, status);
    });
    return box;
  }
  async function run(m, files, status) {
    const say = (t) => { if (status) status.textContent = t; };
    const r = await addTo(m, files, (i, n) => say(`Adding ${i} of ${n}…`));
    say(summary(r)); return r;
  }
  async function pick(m, status) {
    const paths = _test.pick || await window.hub.openDialog({ title: 'Add photos to this moment', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Photos', extensions: ['jpg', 'jpeg', 'png', 'heic', 'heif', 'JPG', 'JPEG', 'PNG', 'HEIC', 'HEIF'] }] });
    if (!paths?.length) return null;
    const files = await Promise.all(paths.map(async (p) => ({ name: WinMac.baseName(p), path: p, mtime: (await window.hub.fs.stat(p).catch(() => null))?.mtime })));
    return run(m, files, status);
  }

  // ---------- the viewer ----------
  function viewer(m, index, kit) {
    let i = index;
    return kit.dialog(m.title, (body, d) => {
      d.classList.add('pp-viewer');
      const img = kit.E('img', { class: 'pp-big', attrs: { alt: '' } }), cap = kit.p('', 'qj-paris-best pp-cap'), status = kit.E('p', { class: 'qj-paris-best pp-vstatus', attrs: { role: 'status' } });
      let confirm = false;
      const show = () => {
        const ph = of(m); if (!ph.length) { d.close(); return; }
        i = (i + ph.length) % ph.length; const p = ph[i]; confirm = false; status.textContent = ''; relabel(rm, 'Remove photo');
        img.src = WinMac.fileUrl(p.src); img.alt = `Photo ${i + 1} of ${ph.length}: ${m.title}`; d.dataset.photo = p.id;
        cap.textContent = `${i + 1} of ${ph.length}${p.taken ? ` · taken ${K.clock(Date.parse(p.taken), zone())}${p.takenFrom === 'file' ? ' (file date)' : ''}` : ''}${p.gps ? ' · location kept' : ''}`;
        prev.hidden = next.hidden = ph.length < 2;
      };
      const prev = kit.button('‹ Previous', () => { i--; show(); }, 'qj-quiet pp-prev'), next = kit.button('Next ›', () => { i++; show(); }, 'qj-quiet pp-next');
      const rm = kit.button('Remove photo', async () => {
        if (!confirm) { confirm = true; relabel(rm, 'Click again: copies to the Trash'); return; }
        const p = of(m)[i]; if (!p) return;
        const r = await api().trash([p.file, p.thumb]);
        if (!r?.ok || r.failed?.length) { status.textContent = `Couldn't move it to the Trash: ${r?.error || r.failed[0].error}. Nothing was removed.`; return; }
        await save((s) => K.remove(s, [p.id]).store); show(); status.textContent = 'Moved Hearth\'s copy to the Trash (your original is untouched).';
      }, 'qj-quiet pp-remove');
      d.addEventListener('keydown', (e) => { if (e.target.closest?.('input,textarea')) return; if (e.key === 'ArrowLeft') { i--; show(); e.preventDefault(); } else if (e.key === 'ArrowRight') { i++; show(); e.preventDefault(); } });
      body.append(img, cap, kit.E('div', { class: 'qj-actions' }, prev, next, kit.button('Show file', () => window.hub.fs.reveal(of(m)[i]?.src), 'qj-quiet'), rm), status);
      show();
    }, 'MY PARIS / PHOTOS');
  }
  if (typeof Keys !== 'undefined') try { Keys.add({ area: 'My Paris photos', keys: '← →', what: 'previous / next photo in the photo viewer (also the ‹ Previous / Next › buttons)' }); } catch { /* the keys list isn't there */ }

  // ---------- 📷 From a folder…: suggestions by date / time and place ----------
  async function fromFolder(kit, moments) {
    const dir = _test.folder || await window.hub.pickFolder('', 'Choose a folder of photos (a phone import)');
    if (!dir) return null;
    await load();
    const r = await api().scan(dir); if (!r?.ok) throw Error(r?.error || 'That folder can\'t be read.');
    const z = zone(), photos = r.photos.map((p) => { const t = K.takenAt(p.exif, { zone: z }) || (Number.isFinite(p.mtime) ? { at: p.mtime, from: 'file' } : null); return { path: p.path, name: p.name, kind: p.kind, at: t?.at, from: t?.from, gps: p.exif?.gps || null, mtime: p.mtime }; });
    const list = moments(), sug = K.suggest(photos, list, { zone: z, kept: data });
    const byId = new Map(list.map((m) => [m.id, m])), byPath = new Map(photos.map((p) => [p.path, p]));
    return kit.dialog('Photos from a folder', (body, d) => {
      d.classList.add('pp-folder');
      const { E } = kit, n = sug.groups.reduce((a, g) => a + g.photos.length, 0);
      body.append(kit.p(`${r.photos.length}${r.more ? '+' : ''} photo${r.photos.length === 1 ? '' : 's'} in ${WinMac.baseName(dir)} · ${n ? `${n} look like they go with ${sug.groups.length} moment${sug.groups.length === 1 ? '' : 's'}` : 'none match a moment on your map'}${sug.already ? ` · ${sug.already} already added` : ''}. Suggestions only: nothing is added until you click Add.`, 'pp-intro'));
      const status = E('p', { class: 'qj-paris-best pp-fstatus', attrs: { role: 'status', 'aria-live': 'polite' } });
      const keep = E('label', { class: 'pp-keep' }, E('input', { type: 'checkbox', attrs: prefs.keepPlace ? { checked: '' } : {}, on: { change: (e) => { prefs.keepPlace = e.target.checked; savePrefs(); } } }), E('span', { text: 'Keep where they were taken (GPS) in Hearth\'s copies' }));
      for (const g of sug.groups) {
        const m = byId.get(g.moment), sec = E('section', { class: 'pp-group' }); sec.dataset.moment = g.moment;
        const tiles = E('div', { class: 'pp-tiles' });
        for (const p of g.photos) {
          const box = E('input', { type: 'checkbox', attrs: { checked: '', 'aria-label': `${p.name}: ${p.why}` } }); box.dataset.path = p.path;
          const pic = p.kind === 'heic' ? E('span', { class: 'pp-heic', text: 'HEIC' }) : E('img', { attrs: { src: WinMac.fileUrl(p.path), alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' } });
          tiles.append(E('label', { class: 'pp-tile', attrs: { title: `${p.name} · ${p.why}` } }, box, pic, E('small', { text: p.why })));
        }
        const addBtn = kit.button(`Add ${g.photos.length} to this moment`, async () => {
          const paths = [...tiles.querySelectorAll('input:checked')].map((x) => x.dataset.path); if (!paths.length) { status.textContent = 'Tick the photos to add first.'; return; }
          const res = await addTo(m, paths.map((p) => ({ name: WinMac.baseName(p), path: p, mtime: byPath.get(p)?.mtime })), (i, k) => { status.textContent = `${m.title}: adding ${i} of ${k}…`; });
          status.textContent = `${m.title}: ${summary(res)}`; addBtn.disabled = true; relabel(addBtn, `✓ Added ${res.added.length}`); sec.classList.add('pp-done');
        }, 'qj-primary pp-add-group');
        sec.append(kit.label(`${(ParisJournalCore.KINDS[g.kind]?.name || 'Moment').toUpperCase()} · ${K.clock(Date.parse(g.at), z).toUpperCase()}`), E('strong', { text: g.title }), tiles, E('div', { class: 'qj-actions' }, addBtn));
        body.append(sec);
      }
      if (!sug.groups.length) body.append(kit.p('Photos are matched by when they were taken (during a show, a walk, a park session, or the hours before you ticked a place done) and, when they have GPS, by being near the place. Try the folder from a night or a day out that is on your map.'));
      const rest = [sug.unmatched.length ? `${sug.unmatched.length} didn't match any moment` : '', sug.noDate ? `${sug.noDate} have no date` : ''].filter(Boolean).join(' · ');
      if (rest) body.append(kit.p(`${rest}: left where they are.`, 'qj-paris-best'));
      body.append(keep, status);
    }, 'MY PARIS / FROM A FOLDER');
  }

  /** the month card's photos (up to 4 files on this computer) */
  const cardPhotos = (moments, max = 4) => K.cardPhotos(moments, max);

  return { load, decorate, of, section, addTo, pick, viewer, fromFolder, cardPhotos, get version() { return version; }, get prefs() { return { ...prefs }; }, get root() { return root; }, _test };
})();
