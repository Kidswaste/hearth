// ▦ All formats (round 33, multiformat): the Lab scene (or the Lab sequence) exported to several shapes in one go:
// 16:9, 9:16, 1:1, 4:5, picked with checkboxes (remembered; the first time: the Lab's own shape + 9:16, the owner's
// "Always give a 9:16 version too"). Each shape shows its own reframe before anything is made: a small picture from
// a hidden export page (tools/three-export.js) drawn zoomed out (FormatsCore.OVER), so dragging (pan) and scrolling
// (zoom) are a crop of that picture, shown at once. Where the subject sits is measured in that picture and the frame
// starts where it keeps the subject whole, clear of the apps' buttons (publishkit's safe zones). The export page
// applies the same pan / zoom to every scene camera (the sandbox's "reframe"). Exports run one after another in the
// background with ONE progress line (and one render-queue row), MP4s named "<scene> 9x16 1080x1920.mp4" in one
// folder. Nothing is uploaded. No tokens.
// Ways in: the preview's right-click › ⇪ Export › ▦ All formats…, ✦ More › ⇪ Make, the toolbar's ⋯, Ready to post
// (📮), ⌘/Ctrl+K. For the AI: /all-formats. Model: tools/three-formats-core.js. Lazy group "multiformat".
const LabFormats = (() => {
  const FC = FormatsCore;
  const X = () => LabExport;
  const SEQ = () => (typeof ThreeSeq !== 'undefined' ? ThreeSeq : null);
  const LAB = () => SEQ()?._S?.L || null;
  const PREV_DPR = 0.3; // the preview pages' pixels (the composition is the export's own CSS size)
  const S = { dlg: null, st: null, batch: null, last: null };
  const err = (e) => toast(e?.message || String(e), { type: 'error' });

  // ---------- what is exported ----------
  const sketchId = () => { try { return LAB()?.sketchId?.() || null; } catch { return null; } };
  const sourceNow = () => (SEQ()?.active && SEQ()?.edit ? 'seq' : 'scene');
  function nameOf(source) {
    if (source === 'seq') return SEQ()?.edit?.seq?.name || 'Sequence';
    const id = sketchId();
    return (id && LAB()?.scenes?.get?.(id)?.name) || 'Lab';
  }
  const frameId = (source) => {
    if (source === 'seq') { const z = SEQ()?.edit?.seq; if (z?.w) return FC.nearest(z.w, z.h); }
    const f = X().frameNow(); return FC.nearest(f.w, f.h);
  };
  // the picks and the nudges are remembered (nudges per scene, the last 40)
  const picksSaved = () => store.get('three.formats.picks', null);
  const nudgeKey = (source) => (source === 'seq' ? `seq:${SEQ()?.edit?.seq?.name || ''}` : `scene:${sketchId() || ''}`);
  function nudgesSaved(source) { return { ...(store.get('three.formats.nudge', {})[nudgeKey(source)] || {}) }; }
  function saveNudges(source, map) {
    const all = store.get('three.formats.nudge', {});
    delete all[nudgeKey(source)];
    all[nudgeKey(source)] = map;
    const keys = Object.keys(all); for (const k of keys.slice(0, Math.max(0, keys.length - 40))) delete all[k];
    store.set('three.formats.nudge', all);
  }
  async function zonesOf(f) {
    if (!f.plat) return null;
    if (typeof PublishCore === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('publishkit').catch(() => null);
    return typeof PublishCore !== 'undefined' ? PublishCore.get(f.plat)?.zones || null : null;
  }

  // ---------- one format's preview: a small zoomed-out picture from a hidden export page ----------
  async function editFor(source, id, w, h, T) {
    if (source === 'seq') {
      const e0 = SEQ()?.edit;
      if (!e0) throw new Error('No Lab sequence: open ▤ Sequence first');
      const e = CutData.setSeq(CutData.copy(e0), { w, h, fps: 30, format: id }); // (footage keeps its own framing per format)
      return { e, sk: null };
    }
    return X().sceneEdit({ w, h, F: 30, end: T + 0.2 });
  }
  async function preview(source, id, T) {
    const f = FC.get(id);
    const { e, sk } = await editFor(source, id, f.w, f.h, T);
    const { plan, assets } = X().compileLive(e, sk);
    plan.w = f.w; plan.h = f.h; plan.fps = 30;
    const pg = { cssW: f.w, cssH: f.h, dpr: PREV_DPR, k: 1, ss: 1, px: 0, capped: [] };
    const page = await X().openPage({ w: f.w, h: f.h, pg });
    try {
      await X().loadPlan(page, plan, assets, plan.song);
      page.send({ type: 'reframe', z: 1 / FC.OVER, x: 0, y: 0, on: true });
      const pw = Math.round(f.w * PREV_DPR); const ph = Math.round(f.h * PREV_DPR);
      const got = page.wait((m) => m.type === 'xp-frame' && m.n === 0, 60000, 'the preview');
      page.send({ type: 'xp-frame', n: 0, T: Math.round(T * 1e4) / 1e4, w: pw, h: ph, ss: 1, sub: 1, F: 30, kind: 'image/jpeg', q: 0.88 });
      const m = await got;
      if (m.error) throw new Error(m.error);
      const blob = new Blob([m.buffer], { type: 'image/jpeg' });
      // where the subject is, measured on a small copy
      const bmp = await createImageBitmap(blob);
      const k = Math.min(1, 128 / Math.max(bmp.width, bmp.height));
      const cw = Math.max(8, Math.round(bmp.width * k)); const ch = Math.max(8, Math.round(bmp.height * k));
      const cv = new OffscreenCanvas(cw, ch); const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0, cw, ch);
      bmp.close?.();
      const box = FC.subjectBox(g.getImageData(0, 0, cw, ch).data, cw, ch);
      return { url: URL.createObjectURL(blob), blob, w: pw, h: ph, box, errors: page.errors.slice() };
    } finally { page.close(); }
  }

  // ---------- the card ----------
  async function open({ source = null } = {}) {
    if (typeof ThreeLab === 'undefined' || typeof LabExport === 'undefined') throw new Error('Open the Three.js Lab first');
    await ThreeLab.cmd?.({ show: true });
    close();
    source = source || sourceNow();
    if (source === 'scene' && !sketchId()) throw new Error('No scene is open in the Lab');
    const T = X().playhead(source);
    const st = { source, T, picks: new Set(FC.defaults(frameId(source), picksSaved())), nudge: nudgesSaved(source), auto: {}, prev: {}, zones: {}, cards: {}, busy: true, gen: 1 };
    S.st = st;
    const dlg = el('dialog', { class: 'ui-modal sq-render-panel lf-panel' });
    S.dlg = dlg;
    const grid = el('div', { class: 'lf-grid' });
    const sum = el('div', { class: 'sq-rp-sum lf-sum' });
    const go = el('button', { type: 'button', class: 'primary lf-go' });
    for (const f of FC.FORMATS) { st.zones[f.id] = await zonesOf(f); grid.append(card(st, f)); }
    function paintSum() {
      const n = st.picks.size;
      go.disabled = !n;
      go.textContent = n ? `⇪ Export ${n} format${n === 1 ? '' : 's'}` : '⇪ Export';
      const len = st.source === 'seq' ? 'the whole sequence' : (() => { const lp = LAB()?.player?.loop; return lp && lp.b > lp.a ? `the loop (${(lp.b - lp.a).toFixed(1)} s)` : '10 s from the playhead'; })();
      const s = `${n} MP4${n === 1 ? '' : 's'} · ${len} · one after another in the background, into one folder · nothing is uploaded`;
      if (sum.textContent !== s) sum.textContent = s;
    }
    st.paintSum = paintSum;
    const what = el('div', { class: 'lf-what' }, el('span', { text: `${st.source === 'seq' ? '▤ The sequence' : 'This scene'}: ${nameOf(st.source)}` }),
      el('small', { text: 'Drag a picture to move it, scroll to zoom. The dashed line is where the apps\' buttons stop.' }));
    dlg.append(el('h3', { text: '▦ All formats' }), what, grid, sum,
      el('div', { class: 'modal-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'button', class: 'ghost', text: 'Cancel', on: { click: () => close() } }), go));
    dlg.addEventListener('close', () => { if (S.dlg === dlg) close(); });
    go.addEventListener('click', () => {
      const formats = FC.FORMATS.map((f) => f.id).filter((id) => st.picks.has(id));
      const nudges = Object.fromEntries(formats.map((id) => [id, nudgeOf(st, id)]));
      close();
      exportAll({ formats, nudges, source: st.source }).catch(err);
    });
    document.body.append(dlg);
    paintSum();
    dlg.showModal();
    // the pictures, one page at a time (each page goes away after its picture)
    for (const f of FC.FORMATS) {
      if (S.st !== st) return st;
      try {
        const p = await preview(st.source, f.id, st.T);
        if (S.st !== st) { URL.revokeObjectURL(p.url); return st; }
        st.prev[f.id] = p;
        st.auto[f.id] = FC.autoFrame(p.box, f.id, { zones: st.zones[f.id] });
      } catch (e) { st.prev[f.id] = { error: e.message }; }
      paintCard(st, f.id);
    }
    st.busy = false;
    return st;
  }
  const nudgeOf = (st, id) => FC.clamp(st.nudge[id] || st.auto[id] || { z: 1, x: 0, y: 0 });
  function card(st, f) {
    const box = el('input', { type: 'checkbox', checked: st.picks.has(f.id) });
    const img = el('img', { class: 'lf-img', alt: '', draggable: false });
    const safe = el('div', { class: 'lf-safe' });
    const frame = el('div', { class: 'lf-frame lf-wait', title: `${f.name} · ${f.w}×${f.h}` }, img, safe);
    frame.style.setProperty('--ar', String(f.w / f.h));
    const note = el('small', { class: 'lf-note', text: 'drawing…' });
    const btn = (text, title, fn) => el('button', { type: 'button', class: 'ghost small lf-b', text, title, on: { click: fn } });
    const set = (n) => { st.nudge[f.id] = FC.clamp(n); saveNudges(st.source, st.nudge); paintCard(st, f.id); };
    const zoomBy = (k) => { const n = nudgeOf(st, f.id); set({ ...n, z: n.z * k }); };
    const tools = el('div', { class: 'lf-tools' },
      btn('−', 'Zoom out (more around the subject)', () => zoomBy(1 / 1.15)), btn('+', 'Zoom in', () => zoomBy(1.15)),
      btn('↺', 'Back to the automatic framing', () => { delete st.nudge[f.id]; saveNudges(st.source, st.nudge); paintCard(st, f.id); }));
    box.addEventListener('change', () => {
      if (box.checked) st.picks.add(f.id); else st.picks.delete(f.id);
      store.set('three.formats.picks', FC.FORMATS.map((x) => x.id).filter((id) => st.picks.has(id)));
      c.classList.toggle('lf-off', !box.checked); st.paintSum?.();
    });
    // drag = pan, wheel = zoom (a crop of the zoomed-out picture: nothing is drawn again)
    let drag = null;
    frame.addEventListener('pointerdown', (e) => { if (!st.prev[f.id]?.url) return; try { frame.setPointerCapture(e.pointerId); } catch { /* a synthetic pointer */ } drag = { x: e.clientX, y: e.clientY, n: nudgeOf(st, f.id), r: frame.getBoundingClientRect() }; });
    frame.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const { n, r } = drag;
      const n2 = { ...n, x: n.x - ((e.clientX - drag.x) / r.width) * (2 / n.z), y: n.y - ((e.clientY - drag.y) / r.height) * (2 / n.z) };
      st.nudge[f.id] = FC.clamp(n2); paintCard(st, f.id);
    });
    const end = () => { if (drag) { drag = null; saveNudges(st.source, st.nudge); } };
    frame.addEventListener('pointerup', end); frame.addEventListener('pointercancel', end);
    frame.addEventListener('wheel', (e) => { if (!st.prev[f.id]?.url) return; e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    const c = el('div', { class: `lf-card${st.picks.has(f.id) ? '' : ' lf-off'}`, dataset: { fmt: f.id } },
      el('label', { class: 'lf-pick', title: f.for }, box, el('b', { text: f.name }), el('span', { text: f.for })), el('div', { class: 'lf-stage' }, frame), el('div', { class: 'lf-row' }, note, el('span', { class: 'spacer' }), tools));
    st.cards[f.id] = { c, img, safe, frame, note, box };
    return c;
  }
  function paintCard(st, id) {
    const k = st.cards[id]; const p = st.prev[id]; if (!k) return;
    if (p?.error) { k.frame.classList.remove('lf-wait'); k.note.textContent = 'no picture (it will still export)'; k.note.title = p.error; return; }
    if (!p?.url) return;
    if (k.img.getAttribute('src') !== p.url) k.img.src = p.url;
    k.frame.classList.remove('lf-wait');
    const n = nudgeOf(st, id); const v = FC.view(n);
    // the overscan picture placed so the crop v fills the frame
    Object.assign(k.img.style, { width: `${100 / v.width}%`, height: `${100 / v.height}%`, left: `${(-v.left / v.width) * 100}%`, top: `${(-v.top / v.height) * 100}%` });
    const s = FC.safeBox(id, st.zones[id]);
    Object.assign(k.safe.style, { left: `${s.x0 * 100}%`, top: `${s.y0 * 100}%`, width: `${(s.x1 - s.x0) * 100}%`, height: `${(s.y1 - s.y0) * 100}%` });
    const own = Boolean(st.nudge[id]);
    const a = st.auto[id];
    const t = own ? `yours · ${Math.round(n.z * 100)} %` : FC.isPlain(n) ? 'as it is' : `auto · ${Math.round(n.z * 100)} %`;
    const tip = own ? 'Your framing (↺: back to the automatic one)' : FC.isPlain(n) ? 'The scene\'s own framing at this shape: the subject is already in' : `Reframed by itself: ${a?.why || ''}`;
    if (k.note.textContent !== t) { k.note.textContent = t; k.note.title = tip; }
  }
  function close() {
    const st = S.st; S.st = null;
    if (st) for (const p of Object.values(st.prev)) if (p?.url) URL.revokeObjectURL(p.url);
    const d = S.dlg; S.dlg = null;
    if (d) { try { if (d.open) d.close(); } catch { /* gone */ } d.remove(); }
    return Boolean(st || d);
  }

  // ---------- the exports: one after another, one progress line ----------
  // o: { formats: ['16:9', '9:16'], nudges: { id: { z, x, y } }, source, secs, frames, long (smaller long side), fps }
  async function exportAll(o = {}) {
    if (typeof LabExport === 'undefined') throw new Error('Open the Three.js Lab first');
    if (S.batch) throw new Error('All formats is already exporting (one batch at a time)');
    const source = o.source || sourceNow();
    const formats = (o.formats || FC.defaults(frameId(source), picksSaved())).map((id) => FC.get(id)?.id).filter(Boolean);
    if (!formats.length) throw new Error('Pick at least one format');
    const saved = nudgesSaved(source);
    const name = o.name || nameOf(source);
    const base = await (async () => { try { return await SEQ().outDir(); } catch { return WinMac.join(await window.hub.fs.home(), 'Hearth exports'); } })();
    let dir = WinMac.join(base, FC.folder(name));
    for (let i = 2; i < 100 && await window.hub.fs.stat(dir).catch(() => null); i += 1) dir = WinMac.join(base, `${FC.folder(name)} (${i})`);
    const id = `${Date.now().toString(36)}`;
    const pk = `lab-formats:${id}`;
    const b = { id, pk, dir, formats, done: [], failed: [], cancel: false, i: 0, n: formats.length };
    S.batch = b;
    const title = `▦ All formats · ${formats.join(' · ')}`;
    window.Progress?.set(pk, { title, icon: '▦', kind: 'lab-export:formats', pct: 0, label: 'starting', jump: () => { if (typeof activate === 'function') activate('tool:three'); }, actions: [{ label: '■', title: 'Cancel', run: () => cancel() }] });
    const rq = window.Renders?.track?.({ kind: 'export', title, pk, quiet: true, cancel: () => cancel(), pause: (on) => X().pause(on), again: { type: 'cmd', line: `/all-formats ${formats.join(' ')} now` } });
    const say = (pct, label) => { window.Progress?.set(pk, { pct, label }); rq?.progress?.(pct, label); };
    try {
      for (let i = 0; i < formats.length; i += 1) {
        if (b.cancel) break;
        b.i = i;
        const fid = formats[i]; const sz = FC.sizeOf(fid, o.long || 0);
        const n = FC.clamp(o.nudges?.[fid] || saved[fid] || { z: 1, x: 0, y: 0 });
        try {
          const r = await X().render({
            format: 'mp4', source, size: sz, fps: o.fps || undefined, secs: o.secs || undefined, frames: o.frames || undefined, at: o.at,
            reframe: FC.toPage(n), dir, stem: FC.stem(name, fid, sz.w, sz.h), name, track: false, quiet: true, again: null,
            onProgress: (p, label) => say(Math.min(99.5, ((i + p) / formats.length) * 100), `${fid} (${i + 1} of ${formats.length}) · ${label}`),
          });
          b.done.push({ id: fid, path: r.path, w: r.w, h: r.h, frames: r.frames });
        } catch (e) {
          if (b.cancel || /cancel/i.test(e.message)) break;
          b.failed.push({ id: fid, error: e.message });
        }
      }
      const ok = b.done.length > 0 && !b.cancel;
      if (ok) { window.Progress?.done(pk, { label: `${b.done.length} made` }); rq?.done(b.done[0].path); } else { window.Progress?.done(pk, { ok: false, label: b.cancel ? 'cancelled' : 'failed' }); if (b.cancel) rq?.cancelled?.(); else rq?.fail(b.failed[0]?.error || 'Nothing was made'); }
      const folderName = FC.folder(name);
      if (b.done.length && !o.quiet) toast(`${b.done.length} format${b.done.length === 1 ? '' : 's'} ready in "${base0(dir) || folderName}"${b.failed.length ? ` (${b.failed.map((x) => x.id).join(', ')} failed: ${b.failed[0].error})` : ''}`, { timeout: 8000, action: { label: 'Show', fn: () => window.hub.fs.reveal(b.done[0].path) } });
      else if (!b.done.length && !b.cancel && !o.quiet) toast(`All formats: ${b.failed[0]?.error || 'nothing was made'}`, { type: 'error' });
      S.last = { dir, files: b.done, failed: b.failed, cancelled: b.cancel };
      return S.last;
    } finally { if (S.batch === b) S.batch = null; }
  }
  const base0 = (p) => String(p || '').split(/[\\/]/).pop();
  function cancel() { const b = S.batch; if (!b) return false; b.cancel = true; X().cancel(); return true; }
  const status = () => ({ open: Boolean(S.st), busy: Boolean(S.st?.busy), running: S.batch ? { at: S.batch.formats[S.batch.i], n: S.batch.n, done: S.batch.done.length } : null, last: S.last });

  // ---------- for the AI and ⌘/Ctrl+K ----------
  function register() {
    if (typeof Commands === 'undefined' || Commands.get('all-formats')) return;
    const IDS = FC.FORMATS.map((f) => f.id);
    Commands.register({
      name: 'all-formats', area: 'Three.js Lab',
      args: '[16:9 9:16 1:1 4:5 | socials] [now] | status | cancel',
      desc: 'The Lab scene (or sequence) exported to several shapes in one go, each reframed so the subject stays in frame: no words opens the picker with a preview per shape; "now" exports the remembered picks and framing at once (MP4s in one folder, nothing uploaded)',
      keywords: 'all formats aspect ratios 9:16 16:9 1:1 4:5 vertical square portrait socials reframe export versions shorts tiktok reels instagram youtube',
      examples: ['/all-formats', '/all-formats 9:16 1:1 now', '/all-formats socials now', '/all-formats status'],
      complete: (a) => [...IDS, 'socials', 'now', 'status', 'cancel'].filter((x) => x.startsWith(String(a || '').toLowerCase().split(/\s+/).pop())).map((value) => ({ value })),
      async run(args) {
        const a = String(args || '').toLowerCase();
        if (/^\s*status\b/.test(a)) { const s = status(); return s.running ? `Exporting ${s.running.at} (${s.running.done} of ${s.running.n} done).` : s.last ? `Last: ${s.last.files.map((f) => `${f.id} ${f.path}`).join(' · ') || 'nothing made'}` : 'Nothing exported yet.'; }
        if (/^\s*cancel\b/.test(a)) return cancel() ? 'Stopping after this frame.' : 'Nothing is exporting.';
        let picks = IDS.filter((id) => new RegExp(`(^|\\s)${id.replace(':', '[:x]')}(\\s|$)`).test(a));
        if (/\bsocials?\b/.test(a)) picks = IDS.slice();
        if (picks.length) store.set('three.formats.picks', picks);
        if (/\bnow\b/.test(a)) {
          exportAll({ formats: picks.length ? picks : undefined }).catch(err);
          return `Exporting ${(picks.length ? picks : FC.defaults(frameId(sourceNow()), picksSaved())).join(', ')} one after another (one progress line; MP4s in one folder).`;
        }
        await open();
        return `All formats is open: ${[...S.st.picks].join(', ')} picked. Drag / scroll a picture to adjust its framing, then ⇪ Export.`;
      },
    });
  }
  function init() {
    register();
    if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: All formats (16:9, 9:16, 1:1, 4:5 in one go)', () => open().catch(err));
  }
  init();
  return { open, close, exportAll, cancel, status, preview, _S: S };
})();
if (typeof module !== 'undefined') module.exports = LabFormats;
