// Adobe suite bridges (round 14), the app side: Photoshop, Illustrator, Premiere Pro, Media Encoder, InDesign (through
// adobemain.js) and After Effects (through its own bridge, aemain.js), driven from Hearth's tools and from chat
// (adobe-cmds.js: /adobe, /photoshop, /premiere…, and the adobe_do tool for Claude / Astra).
// What it does with them: a Lab still / board picture / render opened in Photoshop, a whole board as a layered PSD,
// the owner's Photoshop actions, social sizes, the front document back into Hearth (a chat, the board, the Lab), an
// Illustrator file as SVG for the Lab, the Lab sequence as FCP XML into Premiere, a render queued in Media
// Encoder, a PDF from InDesign. Files that went out to an app are watched: saving them there brings them back.
// Missing apps degrade with one plain sentence (what's missing and how to fix it). Adobe Express / Firefly open as
// app windows (the Apps registry, or a window of their own).
const Adobe = (() => {
  const D = AdobeData;
  const IS_MAC = /Mac/.test(navigator.platform);
  let st = null; let stAt = 0;
  const join = (...p) => p.filter(Boolean).join('/').replace(/\\/g, '/').replace(/\/+/g, '/');
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const stem = (p) => base(p).replace(/\.[^.]+$/, '');
  const stampName = () => new Date().toISOString().replace(/[-:T]/g, '').slice(4, 14);

  // ---------- status ----------
  async function status(fresh = false) {
    if (!st || fresh || Date.now() - stAt > 60000) { st = await window.hub.adobe.status(); stAt = Date.now(); }
    return st;
  }
  const appOf = async (id) => (await status()).apps.find((a) => a.id === D.app(id)?.id) || null;
  let dirP = null;
  const outDir = async () => join(await (dirP ||= window.hub.adobe.dir()), 'out');

  // Asks first for anything outward-facing or that runs code the owner didn't write (Access stream; a Modal otherwise)
  async function ask(o) {
    if (window.Access?.ask) { try { return Boolean(await window.Access.ask(o)); } catch { return false; } }
    return Modal.confirm(o.title || 'Allow this?', `${o.action}${o.target ? ` · ${o.target}` : ''}${o.detail ? `\n\n${o.detail}` : ''}`, { ok: o.ok || 'Allow', danger: o.risk === 'high' });
  }

  // run(app, code): ExtendScript in the app → { ok, value } (After Effects: sent, no answer)
  async function run(appId, code, opts = {}) {
    const a = D.app(appId);
    if (!a) return { ok: false, error: `Unknown app "${appId}": ${D.APPS.map((x) => x.id).join(', ')}` };
    if (a.how === 'ae') {
      const s = await appOf('ae');
      if (!s?.found) return { ok: false, error: s?.reason || 'After Effects isn\'t installed.', missing: true };
      try { const r = await window.hub.ae.run(code, opts.label || 'Hearth'); return r.ok === false ? { ok: false, error: r.error } : { ok: true, value: { sent: true } }; } catch (err) { return { ok: false, error: err.message }; }
    }
    const key = `adobe:${a.id}:${Date.now()}`;
    window.Progress?.set(key, { title: `${a.name} · ${opts.label || 'script'}`, label: 'waiting for the app', kind: `adobe:${a.id}`, icon: a.short, expect: { ms: a.how === 'cep' ? 9000 : 4000 } });
    try {
      const r = await window.hub.adobe.run(a.id, code, { label: opts.label, activate: opts.activate, timeout: opts.timeout });
      window.Progress?.done(key, { ok: r.ok !== false });
      if (r.missing) st = null; // installed since? check again next time
      return r;
    } catch (err) { window.Progress?.done(key, { ok: false }); return { ok: false, error: err.message }; }
  }
  // Fails with the app's plain-words reason; returns the value
  async function must(appId, code, opts) {
    const r = await run(appId, code, opts);
    if (!r.ok) throw new Error(r.error || 'The app didn\'t answer');
    return r.value;
  }

  // ---------- files going out (and coming back) ----------
  const links = new Map(); // path -> { app, label, mtime, onBack }
  let watching = false;
  function link(p, app, { label = '', onBack = null } = {}) {
    if (!p) return;
    links.set(p, { app, label: label || base(p), onBack });
    if (!watching && window.hub.fs.onChanged) {
      watching = true;
      const pending = new Map();
      window.hub.fs.onChanged(({ id, path: changed }) => {
        if (!String(id).startsWith('adobe:')) return;
        const p0 = String(id).slice(6);
        const L = links.get(p0);
        if (!L) return;
        // apps save in a few writes: one note per save
        clearTimeout(pending.get(p0));
        pending.set(p0, setTimeout(() => cameBack(p0, L, changed), 900));
      });
    }
    window.hub.fs.watch(`adobe:${p}`, p).catch(() => {});
  }
  function unlink(p) { links.delete(p); window.hub.fs.unwatch(`adobe:${p}`).catch(() => {}); }
  function cameBack(p, L, changed) {
    const a = D.app(L.app);
    if (L.onBack) { try { L.onBack(p); } catch { /* the owner's place is gone */ } }
    toast(`${base(p)} changed in ${a?.name || 'the app'}`, { timeout: 9000, action: { label: 'Use it…', fn: () => backMenu(p) } });
    window.dispatchEvent(new CustomEvent('adobe:back', { detail: { path: p, changed, app: L.app } }));
  }
  // where a file from an app goes in Hearth
  function backItems(p) {
    const agentId = H.activeId;
    const agent = H.agent?.(agentId);
    return [
      agent?.mode === 'native' ? { label: `Attach to ${agent.name}'s message`, action: () => toChat(p, agentId) } : null,
      typeof Board !== 'undefined' ? { label: 'Add to the board', action: () => toBoard(p) } : null,
      typeof ThreeLab !== 'undefined' ? { label: 'Lab reference (the open sketch)', action: () => toLab(p) } : null,
      { label: IS_MAC ? 'Show in Finder' : 'Show in folder', action: () => window.hub.fs.reveal(p) },
    ].filter(Boolean);
  }
  function backMenu(p) { showMenu(innerWidth / 2 - 140, innerHeight / 2 - 80, [`${base(p)}`, ...backItems(p)]); }
  async function toChat(p, agentId = H.activeId) { await Native.attachPaths(agentId, [p]); Native.focus?.(agentId); return `Attached ${base(p)}.`; }
  async function toBoard(p) { await Board.ready?.(); const r = await Board.addFiles([p]); return `On the board${r?.length ? '' : ' (already there)'}: ${base(p)}.`; }
  async function toLab(p) { await ThreeLab.addReference(p); return `A reference of the open sketch now: ${base(p)} (refTexture('${stem(p)}')).`; }

  // ---------- Photoshop ----------
  // a still of the Lab preview (every layer) saved as PNG
  async function labStill() {
    if (typeof ThreeLab === 'undefined') throw new Error('The Three.js Lab isn\'t loaded.');
    let url = null;
    try { await ThreeLab.cmd({ show: false }); url = await ThreeLab.shot(); } catch { /* not running */ }
    if (!url) throw new Error('Nothing shows in the Lab preview yet: run a sketch first.');
    const name = (ThreeLab.scenes?.get(ThreeLab.scenes.currentId())?.name || 'Lab').replace(/[^\w -]+/g, '_');
    const p = join(await outDir(), `${name} ${stampName()}.png`);
    await window.hub.fs.write(p, url.split(',')[1], { base64: true });
    return p;
  }
  // open a picture in Photoshop: through scripting (answers with its size), or the plain way when scripting is blocked
  async function psOpen(file, { watch = true } = {}) {
    const a = await appOf('ps');
    if (!a?.found) throw new Error(a?.reason || 'Photoshop isn\'t installed.');
    const r = await run('ps', D.ps.open(file), { label: `open ${base(file)}` });
    if (!r.ok) {
      // macOS Automation not allowed yet / COM not registered: the file still opens, and the reason is shown
      await window.hub.adobe.open('ps', [file]);
      if (watch) link(file, 'photoshop');
      return { opened: base(file), how: 'plain', note: r.error };
    }
    if (watch) link(file, 'photoshop');
    return { opened: base(file), ...r.value };
  }
  async function labToPhotoshop() { const p = await labStill(); const r = await psOpen(p); return { ...r, path: p }; }
  // the board (or its selected pictures) as one layered PSD, every picture a layer at its place
  async function boardToPhotoshop({ selected = false } = {}) {
    if (typeof Board === 'undefined') throw new Error('The mood board isn\'t loaded.');
    await Board.ready?.();
    const b = Board.current?.();
    const items = selected && Board.selected?.()?.length ? Board.selected() : Board.items();
    const L = D.boardLayout(items || []);
    if (!L) throw new Error('No pictures on this board to place (videos and websites stay on the board).');
    const out = join(await outDir(), `${D.slug(b?.name || 'Board')} ${stampName()}.psd`);
    const v = await must('ps', D.ps.board({ ...L, name: b?.name || 'Hearth board', out }), { label: 'board as PSD', timeout: 600000 });
    link(out, 'photoshop');
    return { ...v, path: out, size: `${L.w}×${L.h}` };
  }
  const psActions = () => must('ps', D.ps.actions(), { label: 'list actions', activate: false });
  const psAction = (set, action, file) => must('ps', D.ps.action({ set, action, file }), { label: `action ${action}`, timeout: 600000 });
  async function psSizes(text, file) {
    const sizes = D.pickSizes(text);
    if (!sizes.length) throw new Error('Which sizes? e.g. 9:16 4:5 1:1, 1080x1920, or "socials".');
    const dir = join(await outDir(), `sizes ${stampName()}`);
    const files = await must('ps', D.ps.sizes({ sizes, dir, file, format: /\bjpe?g\b/i.test(text || '') ? 'jpg' : 'png' }), { label: 'export sizes', timeout: 600000 });
    return { dir, files };
  }
  // the front Photoshop document back into Hearth (to: chat | board | lab | null = just the file)
  async function psBack(to = null) {
    const out = join(await outDir(), `Photoshop ${stampName()}.png`);
    const v = await must('ps', D.ps.back({ out }), { label: 'back to Hearth', activate: false });
    const said = to === 'board' ? await toBoard(v.path) : to === 'lab' ? await toLab(v.path) : to === 'chat' ? await toChat(v.path) : null;
    return { ...v, said };
  }
  const psPlace = (file) => must('ps', D.ps.place({ file }), { label: `place ${base(file)}` });

  // ---------- Illustrator ----------
  async function aiSvg(file = null, { toLabRef = true } = {}) {
    const out = join(await outDir(), `${file ? stem(file) : 'Illustrator'} ${stampName()}.svg`);
    const v = await must('ai', D.ai.svg({ file, out }), { label: 'export SVG', activate: false, timeout: 300000 });
    let said = null;
    if (toLabRef && typeof ThreeLab !== 'undefined' && ThreeLab.peek?.()) { try { said = await toLab(out); } catch { /* no sketch open */ } }
    if (file) link(file, 'illustrator', { onBack: () => aiSvg(file, { toLabRef }).catch(() => {}) }); // saved again in Illustrator: a fresh SVG
    return { ...v, said };
  }
  const aiPng = async (file) => { const out = join(await outDir(), `${file ? stem(file) : 'Illustrator'} ${stampName()}.png`); return must('ai', D.ai.png({ file, out }), { label: 'export PNG', activate: false }); };

  // ---------- Premiere Pro / Media Encoder ----------
  // the Lab sequence (▤ Sequence) as FCP XML: its scene clips are rendered to videos first (ThreeSeq.bake), footage
  // goes as it is; into Premiere through the bridge, or a file to import
  async function editXml() {
    await window.Lazy?.load?.('lab');
    if (typeof ThreeSeq === 'undefined' || typeof ThreeLab === 'undefined') throw new Error('The Lab isn\'t available.');
    if (!ThreeSeq.edit) { await ThreeLab.cmd({ show: false }); await ThreeSeq.current({ make: false }).catch(() => null); }
    let e = ThreeSeq.edit;
    if (!e?.clips?.length) throw new Error('The Lab sequence is empty: make one in the Lab first (▤ Sequence, /sequence).');
    const name = String(ThreeSeq.key || 'seq:Hearth sequence').replace(/^seq:/, '');
    if (ThreeSeq.needsBake(e)) {
      const t = toast('Rendering the sequence\'s scenes for Premiere…', { timeout: 0 });
      const say = (p) => { const sp = t.querySelector('span'); if (sp) sp.textContent = `Rendering the sequence's scenes for Premiere… ${Math.round(p * 100)}%`; };
      try { await ThreeLab.cmd({ show: true }); e = await ThreeSeq.bake(e, { onProgress: say }); } finally { t.remove(); }
    }
    const x = D.toFcpXml(e, { fps: e.seq?.fps || 30, w: e.seq?.w || 1080, h: e.seq?.h || 1920, name, layout: typeof CutData !== 'undefined' ? CutData.layout : null });
    if (!x.clips) throw new Error('This sequence has no video clips to send.');
    const file = join(await outDir(), `${D.slug(name)} ${stampName()}.xml`);
    await window.hub.fs.write(file, x.xml);
    return { file, name, clips: x.clips, notes: x.notes };
  }
  async function sendEdit() {
    const x = await editXml();
    const r = await prImport([x.file]);
    return { ...x, premiere: r };
  }
  // files (FCP XML, videos) into the open Premiere project; without the bridge: the file and how to import it
  async function prImport(files, { sequence = null } = {}) {
    const a = await appOf('pr');
    if (!a?.found) return { ok: false, error: a?.reason, files, manual: `Premiere Pro: File → Import… → ${files.map(base).join(', ')}` };
    const projDir = await outDir();
    const r = await run('pr', D.pr.importFiles({ files, project: join(projDir, `Hearth ${stampName()}.prproj`), sequence }), { label: 'import', timeout: 180000 });
    if (r.ok) return { ok: true, ...r.value };
    if (r.needsBridge) await window.hub.adobe.open('pr', []).catch(() => {});
    return { ok: false, error: r.error, files, manual: `In Premiere Pro: File → Import… → ${files.map(base).join(', ')}`, needsBridge: Boolean(r.needsBridge) };
  }
  async function meQueue(file, { preset = null, start = true } = {}) {
    const a = await appOf('me');
    if (!a?.found) throw new Error(a?.reason || 'Media Encoder isn\'t installed.');
    let p = preset;
    if (p && !/\.epr$/i.test(p)) { const list = await window.hub.adobe.presets(); p = list.find((x) => x.name.toLowerCase().includes(String(preset).toLowerCase()))?.path || null; if (!p) throw new Error(`No Media Encoder preset named "${preset}" in Documents/Adobe/Adobe Media Encoder (/media-encoder presets).`); }
    const out = p ? join(await outDir(), `${stem(file)} (Media Encoder).mp4`) : null;
    const r = await run('me', D.me.queue({ file, preset: p, out, start }), { label: `queue ${base(file)}`, activate: false, timeout: 180000 });
    if (!r.ok) throw new Error(r.error);
    return r.value;
  }

  // ---------- InDesign / After Effects ----------
  const idPdf = async (file) => { const out = join(await outDir(), `${file ? stem(file) : 'InDesign'} ${stampName()}.pdf`); return must('id', D.id.pdf({ file, out }), { label: 'export PDF', activate: false, timeout: 300000 }); };
  const idPlace = (file) => must('id', D.id.place({ file }), { label: `place ${base(file)}` });
  const aeImport = (file, comp = true) => must('ae', D.ae.importFile({ file, comp }), { label: `import ${base(file)}` });

  // open any file in the app that fits it (Photoshop for pictures, Premiere for edits / videos…)
  async function openIn(appId, file) {
    const id = D.app(appId)?.id;
    if (id === 'photoshop') return psOpen(file);
    if (id === 'premiere') return prImport([file], { sequence: /\.(mp4|mov|m4v|webm|mxf)$/i.test(file) ? stem(file) : null });
    if (id === 'mediaencoder') return meQueue(file);
    if (id === 'aftereffects') { await aeImport(file); return { sent: base(file) }; }
    if (id === 'illustrator') { const v = await must('ai', D.ai.open(file), { label: `open ${base(file)}` }); link(file, 'illustrator'); return v; }
    if (id === 'indesign') return must('id', D.id.open(file), { label: `open ${base(file)}` });
    throw new Error(`Unknown app ${appId}`);
  }

  // ---------- the web apps ----------
  async function web(id) {
    const w = D.WEB.find((x) => x.id === id || x.name.toLowerCase().includes(String(id).toLowerCase()));
    if (!w) throw new Error('express or firefly');
    if (window.Apps?.open && window.Apps.get?.(w.id)) return window.Apps.open(w.id);
    return window.hub.adobe.web(w.id);
  }
  // the Apps registry (apps stream): one entry each, guarded and idempotent (it may load after this file)
  let registered = false;
  function registerApps() {
    if (registered || !window.Apps?.register) return;
    registered = true;
    try {
      for (const w of D.WEB) window.Apps.register({ id: w.id, name: w.name, icon: w.icon, url: w.url, open: () => window.hub.adobe.web(w.id), describe: () => w.desc });
      window.Apps.register({ id: 'adobe', name: 'Adobe apps', icon: 'Ps', open: () => menu(), describe: () => 'Photoshop, Illustrator, Premiere Pro, Media Encoder, InDesign, After Effects: send Hearth\'s pictures, boards and edits to them, bring results back (/adobe)', commands: ['adobe', 'photoshop', 'premiere', 'illustrator', 'media-encoder'] });
    } catch (err) { registered = false; console.warn('Adobe: Apps.register', err); }
  }
  registerApps();
  addEventListener('DOMContentLoaded', registerApps);
  addEventListener('hearth:apps-ready', registerApps);
  setTimeout(registerApps, 2500);

  // ---------- menus ----------
  const note = (p) => p.then((r) => { if (r?.said) toast(r.said); return r; }).catch((err) => { toast(err.message, { type: 'error', timeout: 9000 }); });
  const done = (msg) => (r) => { if (r) toast(typeof msg === 'function' ? msg(r) : msg, { timeout: 5000 }); };
  // the menu behind "Apps → Adobe apps" and /adobe: every app with its state, its actions one level down
  async function items() {
    const s = await status(true);
    const row = (a, list) => ({ label: `${a.short}  ${a.name}${a.found ? (a.version ? ` · ${a.version}` : '') : ' · not installed'}`, items: a.found ? list : [{ label: a.reason || 'Not installed', disabled: true }] });
    const A = Object.fromEntries(s.apps.map((a) => [a.id, a]));
    const pick = async (title, filters) => (await window.hub.openDialog({ title, properties: ['openFile'], filters }))?.[0];
    return [
      'Adobe apps',
      row(A.photoshop, [
        { label: 'Open the Lab preview as a picture', action: () => note(labToPhotoshop()).then(done('In Photoshop: the Lab still')) },
        { label: 'Place this board as a layered PSD', action: () => note(boardToPhotoshop()).then(done((r) => `${r.layers} layers in ${base(r.path)}`)) },
        { label: 'Open a file…', action: async () => { const f = await pick('Open in Photoshop'); if (f) note(psOpen(f)); } },
        { label: 'Run one of your actions…', action: () => actionMenu() },
        { label: 'Export social sizes (9:16 · 4:5 · 1:1 · 16:9)', action: () => note(psSizes('socials')).then(done((r) => `${r.files.length} files in ${base(r.dir)}`)) },
        { label: 'Bring the front document back', items: [{ label: 'Into this chat', action: () => note(psBack('chat')) }, { label: 'Onto the board', action: () => note(psBack('board')) }, { label: 'As a Lab reference', action: () => note(psBack('lab')) }] },
      ]),
      row(A.illustrator, [
        { label: 'Front document → SVG for the Lab', action: () => note(aiSvg(null)).then(done((r) => `SVG: ${base(r.path)}`)) },
        { label: 'A file → SVG for the Lab…', action: async () => { const f = await pick('Illustrator file to SVG', [{ name: 'Illustrator', extensions: ['ai', 'eps', 'pdf', 'svg'] }]); if (f) note(aiSvg(f)).then(done((r) => `SVG: ${base(r.path)}`)); } },
        { label: 'Front document → PNG back into Hearth', action: () => note(aiPng(null)).then((r) => r && backMenu(r.path)) },
      ]),
      row(A.premiere, [
        { label: 'Send the Lab sequence (FCP XML)', action: () => note(sendEdit()).then((r) => r && toast(r.premiere.ok ? `In Premiere: ${r.name} (${r.clips} clips)` : `${r.premiere.manual}${r.premiere.needsBridge ? ' · or /adobe bridge install' : ''}`, { timeout: 12000 })) },
        { label: 'Import a file…', action: async () => { const f = await pick('Into Premiere Pro'); if (f) note(prImport([f])); } },
      ]),
      row(A.mediaencoder, [
        { label: 'Queue a video…', action: async () => { const f = await pick('Queue in Media Encoder', [{ name: 'Video', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mxf', 'avi'] }]); if (f) note(meQueue(f)).then(done('Queued in Media Encoder')); } },
      ]),
      row(A.indesign, [
        { label: 'Front document → PDF', action: () => note(idPdf(null)).then((r) => r && backMenu(r.path)) },
        { label: 'Place a picture…', action: async () => { const f = await pick('Place in InDesign'); if (f) note(idPlace(f)); } },
      ]),
      row(A.aftereffects, [
        { label: 'Import a file as a comp…', action: async () => { const f = await pick('Into After Effects'); if (f) note(aeImport(f)).then(done('Sent to After Effects')); } },
      ]),
      '-',
      ...D.WEB.map((w) => ({ label: `${w.icon}  ${w.name}`, hint: 'web', action: () => web(w.id).catch((err) => toast(err.message, { type: 'error' })) })),
      { label: s.bridge.installed ? 'Hearth bridge for Premiere / Media Encoder: installed' : 'Install the Hearth bridge (Premiere, Media Encoder)…', more: true, action: () => bridge(s.bridge.installed ? 'status' : 'install').then((t) => t && toast(t, { timeout: 9000 })) },
      { label: 'Files watched for changes', more: true, items: () => (links.size ? [...links.keys()].map((p) => ({ label: base(p), items: [...backItems(p), { label: 'Stop watching', action: () => unlink(p) }] })) : [{ label: 'None yet', disabled: true }]) },
    ];
  }
  async function menu(x, y) {
    const list = await items();
    showMenu(x ?? innerWidth / 2 - 150, y ?? 120, list);
  }
  async function actionMenu() {
    let sets = [];
    try { sets = await psActions(); } catch (err) { toast(err.message, { type: 'error', timeout: 9000 }); return; }
    showMenu(innerWidth / 2 - 150, 120, ['Your Photoshop actions (on the front document)', ...sets.map((s) => ({ label: s.set, items: s.actions.map((n) => ({ label: n, action: () => note(psAction(s.set, n)).then(done(`Ran “${n}”`)) })) }))]);
  }
  async function bridge(what = 'status') {
    if (what === 'install') {
      const ok = await ask({ agentId: H.activeId, action: 'Install the Hearth bridge for Premiere Pro and Media Encoder', target: IS_MAC ? '~/Library/Application Support/Adobe/CEP/extensions' : '%APPDATA%\\Adobe\\CEP\\extensions', risk: 'low', detail: 'A small invisible panel that lets Hearth hand scripts to Premiere Pro and Media Encoder (they have no other door). It also turns on Adobe\'s "load unsigned panels" setting (PlayerDebugMode). /adobe bridge remove takes it away.', ok: 'Install' });
      if (!ok) return 'Not installed.';
      const r = await window.hub.adobe.bridge('install');
      st = null;
      return `Hearth bridge installed. ${r.next}`;
    }
    if (what === 'remove') { await window.hub.adobe.bridge('remove'); st = null; return 'Hearth bridge removed (restart Premiere Pro / Media Encoder).'; }
    const b = await window.hub.adobe.bridge('status');
    const seen = Object.entries(b.seen).filter(([, t]) => t).map(([h, t]) => `${h === 'PPRO' ? 'Premiere Pro' : 'Media Encoder'} ${Date.now() - t < 5000 ? 'connected now' : `last seen ${new Date(t).toLocaleString()}`}`);
    return b.installed ? `Hearth bridge installed${seen.length ? `: ${seen.join(' · ')}` : ' (open Premiere Pro or Media Encoder once to connect it)'}.` : 'The Hearth bridge isn\'t installed: /adobe bridge install.';
  }
  // a video file's Adobe › menu (renders, captures)
  function videoItems(file) {
    return [
      { label: 'Premiere Pro: import (new sequence)', action: () => note(prImport([file], { sequence: stem(file) })).then((r) => r && toast(r.ok ? 'In Premiere Pro' : `${r.error}${r.manual ? `\n${r.manual}` : ''}`, { timeout: 9000 })) },
      { label: 'Media Encoder: queue it', action: () => note(meQueue(file)).then(done('Queued in Media Encoder')) },
      { label: 'After Effects: import as a comp', action: () => note(aeImport(file)).then(done('Sent to After Effects')) },
    ].filter(Boolean);
  }
  // the board's right-click menu (Board._.itemExtras, the hook board-ask.js / board-pack.js extend too)
  function boardHook() {
    if (typeof Board === 'undefined' || !Board._ || Board._.adobeHooked) return;
    Board._.adobeHooked = true;
    const prev = Board._.itemExtras;
    Board._.itemExtras = (list) => {
      const pics = list.filter((i) => i.src && /^(image|gif)$/.test(i.type));
      const vids = list.filter((i) => i.src && i.type === 'video');
      return [...(prev?.(list) || []), ...(pics.length || vids.length ? [{ label: 'Adobe', items: () => [
        ...(pics.length === 1 ? [{ label: 'Open in Photoshop', action: () => note(psOpen(pics[0].src)) }, { label: 'Place in Illustrator', action: () => note(must('ai', D.ai.place({ file: pics[0].src }), { label: 'place' })) }] : []),
        ...(pics.length > 1 ? [{ label: `These ${pics.length} as a layered PSD`, action: () => note(boardToPhotoshop({ selected: true })).then(done((r) => `${r.layers} layers in ${base(r.path)}`)) }] : []),
        ...(vids.length === 1 ? [{ label: 'Import into Premiere Pro', action: () => note(prImport([vids[0].src], { sequence: stem(vids[0].src) })) }, { label: 'Import into After Effects', action: () => note(aeImport(vids[0].src)) }] : []),
      ] }] : [])];
    };
  }
  addEventListener('DOMContentLoaded', boardHook);
  setTimeout(boardHook, 1500);

  return { status, run, must, ask, link, unlink, links: () => [...links.keys()], backItems, toChat, toBoard, toLab, labStill, psOpen, labToPhotoshop, boardToPhotoshop, psActions, psAction, psSizes, psBack, psPlace, aiSvg, aiPng, editXml, sendEdit, prImport, meQueue, idPdf, idPlace, aeImport, openIn, web, items, menu, bridge, videoItems, registerApps, _test: { cameBack, links } };
})();
window.Adobe = Adobe;
