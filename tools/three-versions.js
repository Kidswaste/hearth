// 🕘 Scene versions (round 132, versions132): named versions of a Lab scene, and 2–4 of them compared live, side by side.
// Built on what was there (docs/upgrades/versions132.md):
//   · the versions ARE the time machine's (tools/three-history*.js, kv three-tm-<scene>: deltas, thinned, synced):
//     Save a version… names one (never thinned); the automatic ones are its director-turn bookmarks (before an AI reply
//     that changed things) and the tagged moments ThreeHistory.autoVersion notes (before a first draft, a take kept)
//   · Compare plays each version on its own backstage stage (ThreeBackstage.make, as ✦ 3 takes does: 480 px, 30 fps, on
//     the scene's song, silent), laid over its panel and kept on the Lab's clock; each panel says what differs in one line
//   · Use this one / Take only… go through the time machine (restore / pick a layer) and are ONE undo step (LabTxn.step:
//     the dock's ↶, Alt+Shift+Z, /undo-edit, the toast's Undo)
//   · Delete sends a version to the Trash (kv three-versions-trash, 30 days), from where it comes back
// Ways in (no new toolbar): Sketch ▾ › History › 🕘 Scene versions… / Save a version…, the time machine's ⋯, /scene-versions,
// Ctrl/⌘+K "Lab: Scene versions".
const LabVersions = (() => {
  const C = SceneVersCore;
  const AREA = 'Three.js Lab';
  const TRASH = 'three-versions-trash';
  const TH = () => window.ThreeHistory;
  const S = () => ThreeLab.scenes;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const deep = (x) => JSON.parse(JSON.stringify(x));
  const err = (e) => toast(e.message || String(e), { type: 'error' });
  const tools = () => ({ scan: ThreeTweaks.scan, applyValues: ThreeTweaks.applyValues });
  const GLYPH = { you: '●', claude: '✳', codex: 'A', crew: '✦' };
  let panel = null; let sid = null; let rows = []; const picked = new Set(); let unreadable = false;
  let cmp = null; // { ids, panels: [{ id, entry, state, stage, view, line }], timer }
  let lastStep = null; // { at, kind, label } the newest Use this one / Take only (for its toast's Undo)

  async function lab(show = true) {
    if (!window.ThreeHistory || typeof LabTxn === 'undefined') await Lazy.load('lab');
    await ThreeLab.cmd({ show });
    return S();
  }
  const sceneId = (id) => id || S()?.currentId() || null;
  const fmt = (t) => TH().fmtWhen(t);

  // ---------- the list ----------
  async function list(id = sceneId()) {
    await lab(false);
    id = sceneId(id);
    unreadable = !(await TH().readable(id));
    const l = await TH().list(id);
    const tm = await TH().thumbs(id).catch(() => ({}));
    rows = C.entries(l).map((e) => ({ ...e, thumb: tm?.[e.id] || null }));
    return { rows, unreadable };
  }
  async function open({ id = null } = {}) {
    await lab(true);
    sid = sceneId(id);
    if (!sid) throw new Error('Open a scene in the Lab first.');
    const host = S().previewHost?.();
    if (!host) throw new Error('The Lab preview is not up.');
    if (!panel) build();
    if (!panel.isConnected) host.append(panel);
    picked.clear();
    await paint();
    return true;
  }
  function close() { closeCompare(); panel?.remove(); picked.clear(); }
  const isOpen = () => Boolean(panel?.isConnected);
  const parts = {};
  function build() {
    parts.title = el('span', { class: 'vs-title' });
    parts.list = el('div', { class: 'vs-list', attrs: { role: 'list' } });
    parts.name = el('input', { type: 'text', class: 'vs-name', placeholder: 'Name this version (e.g. "before the chorus idea")', attrs: { maxlength: '80' } });
    parts.saveRow = el('form', { class: 'vs-save', hidden: true, on: { submit: (e) => { e.preventDefault(); saveFromForm().catch(err); } } },
      parts.name, el('button', { type: 'submit', class: 'vs-btn primary', text: 'Save' }));
    parts.cmp = el('button', { type: 'button', class: 'vs-btn primary vs-cmp-btn', text: 'Compare', title: 'Pick 2 to 4 versions (the boxes), then Compare: they play side by side, live', on: { click: () => compare([...picked]).catch(err) } });
    parts.note = el('div', { class: 'vs-note', hidden: true });
    panel = el('div', { class: 'vs-panel', attrs: { tabindex: '-1', 'aria-label': 'Scene versions' }, dataset: { feature: 'Lab › Scene versions' } },
      el('div', { class: 'vs-head' }, el('b', { text: '🕘' }), parts.title, el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'vs-btn', text: 'Save a version…', title: 'The scene as it is now, with a name (named versions are never thinned out)', on: { click: () => { parts.saveRow.hidden = !parts.saveRow.hidden; if (!parts.saveRow.hidden) parts.name.focus(); } } }),
        el('button', { type: 'button', class: 'vs-btn', text: '⋯', title: 'The time machine, the Trash', on: { click: (e) => moreMenu(e.currentTarget.getBoundingClientRect()).catch(err) } }),
        el('button', { type: 'button', class: 'vs-btn', text: '✕', title: 'Close (Esc)', on: { click: () => close() } })),
      parts.saveRow, parts.note, parts.list,
      el('div', { class: 'vs-foot' }, el('span', { class: 'vs-hint', text: 'Tick 2–4, then Compare' }), el('span', { class: 'spacer' }), parts.cmp));
    panel.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.target.closest('input')) { e.stopPropagation(); close(); } });
  }
  async function paint() {
    if (!panel) return;
    await list(sid);
    parts.title.textContent = `Versions of ${S().get(sid)?.name || 'this scene'}`;
    parts.note.hidden = !unreadable;
    parts.note.textContent = unreadable ? 'The saved versions couldn\'t be read just now (the file is held). Nothing is saved over them; they show again once it reads.' : '';
    const nodes = [row({ id: 'now', name: 'Now: the scene as it is', at: Date.now(), by: 'you', kind: 'now', thumb: S().get(sid)?.thumb || null })];
    for (const r of rows) nodes.push(row(r));
    if (!rows.length && !unreadable) nodes.push(el('div', { class: 'vs-empty', text: 'No versions yet. Save one, or they come by themselves before an AI reply changes the scene, a first draft, or a take you keep.' }));
    parts.list.replaceChildren(...nodes);
    paintPick();
  }
  function row(r) {
    const box = el('input', { type: 'checkbox', class: 'vs-pick', checked: picked.has(r.id), title: 'Pick it to compare', on: { change: (e) => { if (e.target.checked) { if (picked.size >= C.MAX_COMPARE) { e.target.checked = false; toast(`Up to ${C.MAX_COMPARE} at a time`, { timeout: 1800 }); return; } picked.add(r.id); } else picked.delete(r.id); paintPick(); } } });
    const pic = el('span', { class: 'vs-pic' }, r.thumb ? el('img', { src: r.thumb, alt: '', loading: 'lazy' }) : el('span', { text: r.kind === 'now' ? 'NOW' : '◭' }));
    const kindTxt = r.kind === 'named' ? '★' : r.kind === 'now' ? '' : 'auto';
    const more = r.kind === 'now' ? null : el('button', { type: 'button', class: 'vs-btn vs-more', text: '⋯', title: 'Use this one, take one layer, show it in the time machine, delete', on: { click: (e) => rowMenu(r, e.currentTarget.getBoundingClientRect()).catch(err) } });
    return el('label', { class: `vs-row k-${r.kind}`, dataset: { id: r.id }, attrs: { role: 'listitem' } },
      box, pic,
      el('span', { class: 'vs-txt' },
        el('span', { class: 'vs-n', text: r.name, title: r.name }),
        el('span', { class: 'vs-meta' }, el('span', { class: `vs-who by-${r.by}`, text: `${GLYPH[r.by] || '●'} ${C.whoName(r.by)}` }), r.kind === 'now' ? '' : ` · ${fmt(r.at)}`, kindTxt ? el('span', { class: 'vs-kind', text: ` · ${kindTxt}` }) : '')),
      more);
  }
  function paintPick() { if (!parts.cmp) return; parts.cmp.disabled = picked.size < 2; parts.cmp.textContent = picked.size >= 2 ? `Compare ${picked.size}` : 'Compare'; }
  async function rowMenu(r, rect) {
    const st = await TH().stateOf(r.id, sid);
    ThreeTweaks.menu(rect.left, rect.bottom + 4, [
      `${r.name.slice(0, 40)} · ${fmt(r.at)}`,
      ['Use this one', 'It becomes the scene (one Undo puts it back)', () => use(r.id).catch(err)],
      st ? ['Take only…', 'One layer of it into the scene as it is (one Undo)', st.layers.map((L) => [L.name, 'Replaced, or put back if it was removed', () => takeOnly(r.id, L.id).catch(err)])] : null,
      ['Show it in the time machine', 'On the preview, with the versions around it', () => showInTM(r.id).catch(err)],
      ['Delete', 'To the Trash (30 days; ⋯ › Trash brings it back)', () => remove(r.id).catch(err)],
    ]);
  }
  async function moreMenu(rect) {
    const del = await deleted(sid).catch(() => null);
    ThreeTweaks.menu(rect.left, rect.bottom + 4, [
      ['⏱ Time machine…', 'Every version as pictures: scrub, compare two, branch · Alt+H', () => { close(); window.ThreeHistoryUI?.open(); }],
      del === null ? ['Trash', 'Couldn\'t be read just now', () => {}] : ['Trash', del.length ? `${del.length} deleted version${del.length === 1 ? '' : 's'} (30 days)` : 'Empty', del.map((x) => [x.name, `deleted ${fmt(x.deletedAt)} · put it back`, () => undelete(x.id).catch(err)])],
    ]);
  }
  async function showInTM(vid) {
    close();
    await window.ThreeHistoryUI.open();
    const i = ThreeHistoryUI.versions.findIndex((v) => v.id === vid);
    if (i >= 0) await ThreeHistoryUI.select(i);
  }

  // ---------- save, use, take only, delete ----------
  async function save(name, { id = null } = {}) {
    await lab(false);
    const v = await TH().saveVersion(sceneId(id), name);
    if (isOpen()) { parts.saveRow.hidden = true; parts.name.value = ''; await paint(); }
    return v;
  }
  async function saveFromForm() {
    const v = await save(parts.name.value);
    toast(`Saved the version “${v?.name || parts.name.value}”`, { timeout: 2500 });
  }
  const entryOf = (vid) => rows.find((r) => r.id === vid) || null;
  // the scene becomes the version: the time machine restores it, LabTxn notes it as one undo step
  async function stepped(id, fn, label, words) {
    const before = await LabTxn.snap(id);
    if (!before) throw new Error('That scene is gone.');
    await fn();
    await wait(300);
    const after = await LabTxn.snap(id);
    const ok = LabTxn.step({ who: 'You', before, after, label, words });
    if (!ok) return null;
    lastStep = { at: LabTxn.history().at(-1)?.at || Date.now(), label };
    toast(`${words[0].toUpperCase()}${words.slice(1)}`, { timeout: 6000, action: { label: 'Undo', fn: () => undo().catch(err) } });
    return lastStep;
  }
  async function use(vid, { id = null } = {}) {
    await lab(false);
    id = sceneId(id);
    if (!rows.length || sid !== id) await list(id);
    const e = entryOf(vid); const name = e?.name || 'that version';
    closeCompare();
    const r = await stepped(id, () => TH().restore(vid, { id, label: `Used the version “${name}”` }), `back to the version “${name}”`, `used the version “${C.cap(name, 50)}”`);
    if (!r) toast('The scene is already like that version', { timeout: 2500 });
    if (isOpen()) await paint();
    return r;
  }
  async function takeOnly(vid, layerId, { id = null } = {}) {
    await lab(false);
    id = sceneId(id);
    if (!rows.length || sid !== id) await list(id);
    const e = entryOf(vid); const name = e?.name || 'that version';
    const st = await TH().stateOf(vid, id);
    const L = st?.layers.find((x) => x.id === layerId || x.name === layerId);
    if (!L) throw new Error(`That version has no layer "${layerId}"`);
    const r = await stepped(id, () => TH().pick(vid, 'layer', { id, layer: L.id }), `the layer ${L.name} from “${name}”`, `took the layer ${L.name} from “${C.cap(name, 40)}”`);
    if (!r) toast(`${L.name} is already like that`, { timeout: 2500 });
    if (isOpen()) await paint();
    return r;
  }
  async function undo() {
    const top = LabTxn.history().at(-1);
    if (!lastStep || !top || top.at !== lastStep.at) throw new Error('Something changed the scene since: use ↶ in the dock.');
    await LabTxn.undoTurn();
    lastStep = null;
    toast('Back as it was', { timeout: 2000 });
    if (isOpen()) await paint();
  }
  // the Trash: read for sure first (a Trash that can't be read is never "empty": nothing is deleted then)
  async function readTrash() {
    let r = null;
    try { r = await window.hub.kvGet(TRASH, null, { status: true }); } catch { r = { state: 'unreadable' }; }
    if (!r || typeof r !== 'object' || !r.state) r = { state: 'ok', value: r };
    if (r.state === 'unreadable') return null;
    return r.state === 'ok' && r.value?.items ? r.value : { v: 1, items: [] };
  }
  async function remove(vid, { id = null } = {}) {
    await lab(false);
    id = sceneId(id);
    if (!rows.length || sid !== id) await list(id);
    const e = entryOf(vid);
    const trash = await readTrash();
    if (!trash) throw new Error('The Trash can\'t be read just now: nothing was deleted.');
    const st = await TH().stateOf(vid, id);
    const v = (await TH().list(id)).find((x) => x.id === vid);
    if (!v || !st) throw new Error('No such version.');
    const item = { id: `vt-${vid}`, sceneId: id, sceneName: S().get(id)?.name || '', name: e?.name || v.name || v.label, version: deep(v), state: deep(st) };
    await window.hub.kvSet(TRASH, C.trashAdd(trash, item));
    await TH().removeVersion(vid, id);
    picked.delete(vid);
    toast(`“${C.cap(item.name, 50)}” is in the Trash`, { timeout: 6000, action: { label: 'Undo', fn: () => undelete(item.id).catch(err) } });
    if (isOpen()) await paint();
    return item;
  }
  async function deleted(id = sceneId()) { const t = await readTrash(); return t ? C.trashOf(t, id) : null; }
  async function undelete(trashId) {
    const trash = await readTrash();
    if (!trash) throw new Error('The Trash can\'t be read just now.');
    const { item, trash: rest } = C.trashTake(trash, trashId);
    if (!item) throw new Error('That isn\'t in the Trash any more.');
    if (!S().get(item.sceneId)) throw new Error('Its scene is gone (bring the scene back first).');
    await TH().putBack(item.sceneId, item);
    await window.hub.kvSet(TRASH, rest);
    toast(`“${C.cap(item.name, 50)}” is back`, { timeout: 2500 });
    if (isOpen()) await paint();
    return item;
  }

  // ---------- compare: 2–4 versions live, side by side ----------
  function scenesFor(id, sketches) {
    const by = (x) => sketches.find((s) => s.id === x) || null;
    return {
      get: (x) => by(x), layersOf: (x) => x.layers, selectedOf: () => null,
      frameOf: () => S().frameOf(id) || 'fit', setFrame() {},
      songOf: () => S().songOf?.(id) || null, timelineOf: () => S().timelineOf?.(id) || null,
      changed: () => {}, create() { throw new Error('A compared version is read only.'); },
    };
  }
  async function compare(ids, { id = null } = {}) {
    await lab(true);
    id = sceneId(id);
    ids = [...new Set(ids)].slice(0, C.MAX_COMPARE);
    if (ids.length < 2) throw new Error('Pick 2 to 4 versions to compare.');
    if (sid !== id || !rows.length) { sid = id; await list(id); }
    closeCompare();
    const now = { id: 'now', name: 'Now', at: Infinity, by: 'you', kind: 'now' };
    const ents = ids.map((x) => (x === 'now' ? now : entryOf(x))).filter(Boolean);
    if (ents.length < 2) throw new Error('Those versions aren\'t there any more.');
    ents.sort((a, b) => a.at - b.at);
    const states = await Promise.all(ents.map((e) => TH().stateOf(e.id, id)));
    if (states.some((s) => !s)) throw new Error('A version couldn\'t be rebuilt.');
    const base = states[0];
    // each version runs with its unsaved slider values written into its code (as a branch does)
    const sketches = ents.map((e, i) => { const st = TMCore.pickValues(states[i], states[i]).state; return { id: `vs_${id}_${i}`, name: `${S().get(id)?.name || 'Scene'} · ${e.name}`, layers: deep(st.layers), code: st.layers[0]?.code || '', palette: st.palette || null }; });
    const scenes = scenesFor(id, sketches);
    const panels = ents.map((e, i) => ({ id: e.id, entry: e, state: states[i], sketch: sketches[i], line: i === 0 ? 'The oldest of these: the others say what differs from it' : C.summary(base, states[i], tools()) }));
    cmp = { ids: ents.map((e) => e.id), sceneId: id, panels, timer: 0 };
    buildCompare();
    for (const p of panels) {
      p.stage = ThreeBackstage.make({ long: 480, cap: 30, scenes, song: true, idleMs: 60 * 60000, onStill: () => {} });
      p.route = { chatId: `versions-${p.sketch.id}`, sketchId: p.sketch.id, crew: true, stage: p.stage };
      p.stage.handle('three_console', {}, p.route).catch(() => {});
    }
    cmp.timer = setInterval(tick, 400);
    return cmp;
  }
  let ticks = 0;
  function tick() { if (!cmp) return; ticks += 1; place(); if (ticks % 4 === 0) syncClocks(); }
  function buildCompare() {
    const c = cmp;
    const ratio = (() => { const f = S().frameOf(c.sceneId); const z = typeof ThreeMedia !== 'undefined' ? ThreeMedia.SIZES.find((x) => x.id === f && x.w) : null; return z ? z.w / z.h : 16 / 9; })();
    const grid = el('div', { class: 'vs-grid', style: { gridTemplateColumns: `repeat(${c.panels.length}, minmax(0, 1fr))` } });
    for (const p of c.panels) {
      p.view = el('div', { class: 'vs-view', style: { aspectRatio: String(ratio) } }, el('span', { class: 'vs-wait', text: 'starting…' }));
      const e = p.entry;
      const btns = e.kind === 'now' ? [el('span', { class: 'vs-hint', text: 'the scene as it is' })] : [
        el('button', { type: 'button', class: 'vs-btn primary vs-use', text: 'Use this one', title: 'It becomes the scene: one Undo puts it back', on: { click: () => use(e.id, { id: c.sceneId }).catch(err) } }),
        el('button', { type: 'button', class: 'vs-btn vs-take', text: 'Take only…', title: 'One layer of it into the scene as it is (one Undo)', on: { click: (ev) => { const r = ev.currentTarget.getBoundingClientRect(); ThreeTweaks.menu(r.left, r.bottom + 4, ['Take only this layer', ...p.state.layers.map((L) => [L.name, 'Into the scene as it is now', () => takeOnly(e.id, L.id, { id: c.sceneId }).catch(err)])]); } } })];
      p.el = el('div', { class: 'vs-cell', dataset: { id: e.id } },
        p.view,
        el('div', { class: 'vs-cap' }, el('b', { text: e.name, title: e.name }), el('span', { class: 'vs-meta', text: e.kind === 'now' ? 'now' : `${fmt(e.at)} · ${C.whoName(e.by)}` })),
        el('div', { class: 'vs-diff', text: p.line, title: p.line }),
        el('div', { class: 'vs-acts' }, ...btns));
      grid.append(p.el);
    }
    c.card = el('div', { class: 'vs-card', attrs: { role: 'dialog', 'aria-label': 'Compare versions' }, dataset: { feature: 'Lab › Scene versions › Compare' } },
      el('div', { class: 'vs-head' }, el('b', { text: `Compare ${c.panels.length} versions` }), el('span', { class: 'vs-hint', text: 'live, in step with the song' }), el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'vs-btn', text: '✕', title: 'Close (Esc)', on: { click: () => closeCompare() } })),
      grid);
    document.body.append(c.card);
    document.addEventListener('keydown', onKey, true);
  }
  function onKey(e) {
    if (e.key !== 'Escape' || !cmp || e.defaultPrevented || document.querySelector('.ctx-menu, .modal-back, dialog[open]')) return;
    e.preventDefault(); e.stopPropagation();
    closeCompare();
  }
  function place() {
    if (!cmp) return;
    for (const p of cmp.panels) {
      const host = p.stage?.host;
      if (!host) continue;
      const r = p.view.getBoundingClientRect(); const w = host.offsetWidth || 1; const h = host.offsetHeight || 1;
      const k = Math.min(r.width / w, r.height / h);
      host.classList.add('vs-stage-on');
      const tf = `translate(${Math.round(r.left + (r.width - w * k) / 2)}px, ${Math.round(r.top + (r.height - h * k) / 2)}px) scale(${Math.round(k * 1000) / 1000})`;
      if (host.style.transform !== tf) host.style.transform = tf;
      const wt = p.view.querySelector('.vs-wait'); if (wt) wt.hidden = Boolean(p.stage.running);
    }
  }
  // every panel on the Lab's clock (the scene on screen with its song), else on the first panel's (as ✦ 3 takes does)
  function syncClocks() {
    if (!cmp) return;
    const stages = cmp.panels.map((p) => p.stage).filter((s) => s?.clock);
    if (!stages.length) return;
    const P = window.ThreeLab?.director?.media;
    const labHere = P?.loaded && S()?.currentId() === cmp.sceneId;
    const ref = labHere ? { t: P.time, playing: Boolean(P.playing) } : stages[0].clock;
    for (const s of stages) {
      const c = s.clock;
      if (c.playing !== ref.playing) s.send({ type: 'media', cmd: ref.playing ? 'play' : 'pause' });
      if (Math.abs(c.t - ref.t) > 0.2) s.send({ type: 'media', cmd: 'seek', value: Math.max(0, ref.t + (ref.playing ? 0.03 : 0)) });
    }
    cmp.synced = { at: Date.now(), ref: Math.round(ref.t * 100) / 100, lab: Boolean(labHere), stages: stages.length };
  }
  function closeCompare() {
    const c = cmp; cmp = null;
    if (!c) return;
    clearInterval(c.timer);
    document.removeEventListener('keydown', onKey, true);
    for (const p of c.panels) { p.stage?.host?.classList.remove('vs-stage-on'); p.stage?.dispose?.(); }
    c.card?.remove();
  }

  // ---------- ways in ----------
  if (typeof Commands !== 'undefined' && !Commands.get('scene-versions')) {
    Commands.register({
      name: 'scene-versions', area: AREA, args: '[save <name> | list]',
      desc: '🕘 Scene versions: save a named version of the Lab scene, compare 2–4 live side by side, use one or take one layer (one Undo)',
      examples: ['/scene-versions', '/scene-versions save Before the chorus idea', '/scene-versions list'],
      keywords: 'versions save snapshot compare side by side restore earlier version name',
      complete: (a) => [{ value: 'save ', hint: 'a name for the scene as it is' }, { value: 'list', hint: 'the versions in words' }].filter((x) => x.value.startsWith(a.trim())),
      run: async (args) => {
        const w = String(args || '').trim();
        const m = /^save\s+(.+)$/i.exec(w);
        if (m) { const v = await save(m[1]); return `🕘 Saved the version “${v?.name || m[1]}”`; }
        if (/^list$/i.test(w)) { const r = await list(); return r.rows.length ? r.rows.slice(0, 20).map((x) => `${x.kind === 'named' ? '★' : '·'} ${x.name} · ${fmt(x.at)} · ${C.whoName(x.by)}`).join('\n') : (r.unreadable ? 'The versions couldn\'t be read just now.' : 'No versions yet (/scene-versions save <name>).'); }
        await open();
        return '🕘 Scene versions: tick 2–4, then Compare';
      },
    });
  }
  if (typeof AppUI !== 'undefined') AppUI.addAction('Lab: Scene versions (save one, compare side by side)', () => open().catch(err));
  addEventListener('hearth:sketch', (e) => { if (isOpen() && e.detail?.id !== sid) close(); });
  addEventListener('hearth:tm', (e) => { if (isOpen() && e.detail?.id === sid) { clearTimeout(parts.t); parts.t = setTimeout(() => paint().catch(() => {}), 250); } });

  return {
    open, close, list, save, use, takeOnly, undo, remove, deleted, undelete, compare, closeCompare,
    get panel() { return panel; }, get compared() { return cmp; }, isOpen,
    _test: { syncClocks, place, readTrash },
  };
})();
window.LabVersions = LabVersions;
