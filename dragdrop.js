// Files with Finder / Explorer (round 38, dragdrop): drop files and folders from the computer on the spot they're for,
// paste them, and drag Hearth's own things out as real files. The rules are in dragdrop-core.js (Node-tested); this is
// the window's part (lazy group "dragdrop"), dragdropmain.js the main process's (native drags, checks, the clipboard).
//   In:  a chat — attaches (pictures previewed; big files by where they are, never copied; a folder asks "Let this AI
//        use this folder?" through ⋯ Access, never granted silently; videos as their frames) · the Lab preview — a
//        song becomes the song, a video the footage (a video layer when a song is on), a picture a picture layer
//        (Alt+drop: 🎨 Match this look, as before), a 3D model / sky light 🧊, a font or data file a reference, a
//        .hearthpack its preview card (tools/three-packs-hook.js) · a template's media slot and the board take drops
//        themselves; the overlay says what will happen on each spot.
//   Paste (Ctrl/⌘+V): screenshots and pictures, files copied in Finder / Explorer, file: URLs → the chat box you're
//        in, or the Lab when it's in front (not while typing).
//   Out: a reply's pictures and big media, a code block's label (a file named after its language), the chat box's
//        attachments, finished renders (⇪), 📐 templates, the time machine's snapshots → Finder / Explorer / any app,
//        with a proper icon (webContents.startDrag). Things not on disk are written to a temp folder first.
// Nothing is uploaded anywhere. /drop <path…> and /paste-files do the same from a chat.
const DragDrop = (() => {
  const C = DragDropCore;
  const WIN = /^Win/i.test(navigator.platform || '');
  const INTERNAL = /^(?:application|text)\/x-hearth/;
  const fail = (err) => toast(err?.message || String(err), { type: 'error', timeout: 7000 });
  const say = (text, o = {}) => { if (text) toast(text, { timeout: 6500, ...o }); };
  const hasFiles = (dt) => { const t = [...(dt?.types || [])]; return t.includes('Files') && !t.some((x) => INTERNAL.test(x)); };
  const pathOf = (f) => { try { return window.hub.pathForFile(f) || ''; } catch { return ''; } };
  const stem = (n) => C.nice(String(n || '')).replace(/\.[^.]+$/, '').slice(0, 40) || 'Dropped';
  const last = { drop: null, paste: null, out: null, overlay: '' }; // for the checks (and a look in devtools)

  // ---------- where the pointer is ----------
  function chatAt(t) {
    if (typeof Native === 'undefined' || !t) return null;
    for (const a of H.agents()) {
      if (a.mode !== 'native') continue;
      const v = Native.view(a.id);
      if (v?.root?.contains(t)) return { zone: 'chat', agentId: a.id, node: v.root };
    }
    return null;
  }
  function zoneAt(t) {
    if (!t?.closest) return null;
    const slot = t.closest('.lt-media');
    if (slot) return { zone: 'slot', node: slot, own: true, label: (slot.getAttribute('aria-label') || '').split(':')[0].trim() || 'this' };
    if (t.closest('.bdd, .as-panel, dialog')) return null; // the board drawer, the asset library, dialogs: their own drops
    const c = chatAt(t);
    if (c) return c;
    const pv = t.closest('.three-preview');
    if (pv) return { zone: 'lab', node: pv };
    const bd = t.closest('.bd-root');
    if (bd) return { zone: 'board', node: bd, own: true, text: bd.querySelector('[data-drop]')?.dataset.drop || '' };
    return null;
  }

  // ---------- the overlay: what dropping here does ----------
  let over = null; let overNode = null; let overText = ''; let hideT = 0;
  const ICON = { chat: '📎', lab: '✦', slot: '⤓', board: '▦' };
  function show(z, text) {
    if (!over) {
      over = el('div', { class: 'dd-over', attrs: { 'aria-hidden': 'true' } }, el('div', { class: 'dd-card' }, el('span', { class: 'dd-ic' }), el('b', { class: 'dd-text' })));
      document.body.append(over);
    }
    if (overNode !== z.node) {
      const r = z.node.getBoundingClientRect();
      Object.assign(over.style, { left: `${Math.round(r.left)}px`, top: `${Math.round(r.top)}px`, width: `${Math.round(r.width)}px`, height: `${Math.round(r.height)}px` });
      over.dataset.zone = z.zone;
      over.querySelector('.dd-ic').textContent = ICON[z.zone] || '⤓';
      overNode = z.node;
      over.classList.add('on');
    }
    if (text !== overText) { over.querySelector('.dd-text').textContent = text; overText = text; last.overlay = text; }
    clearTimeout(hideT);
    hideT = setTimeout(hide, 450); // a drag that left the window without a dragleave (it happens) doesn't leave it up
  }
  function hide() {
    clearTimeout(hideT);
    if (!overNode) return;
    over?.classList.remove('on');
    overNode = null; overText = '';
  }
  function overlayFor(z, dt) {
    if (z.zone === 'board' && z.text) return z.text;
    return C.overlay(z.zone, C.sniff(dt?.items), { label: z.label });
  }

  addEventListener('dragover', (e) => {
    const dt = e.dataTransfer;
    if (!hasFiles(dt)) return;
    const z = zoneAt(e.target);
    if (!z) { hide(); return; }
    show(z, overlayFor(z, dt));
    if (z.own) return; // a template's slot, the board: they take the drop themselves
    e.preventDefault(); e.stopPropagation(); dt.dropEffect = 'copy';
  }, true);
  addEventListener('dragleave', (e) => { if (!e.relatedTarget) hide(); }, true);
  addEventListener('dragend', hide, true);
  addEventListener('drop', (e) => {
    hide();
    const dt = e.dataTransfer;
    if (!hasFiles(dt)) return;
    const z = zoneAt(e.target);
    if (!z || z.own) return;
    e.preventDefault(); e.stopPropagation();
    const files = [...(dt.files || [])];
    const at = { x: e.clientX, y: e.clientY, alt: e.altKey };
    (z.zone === 'chat' ? toChat(z.agentId, files) : toLab(files, at)).catch(fail);
  }, true);

  // ---------- what was dropped, checked (folders, missing files, iCloud placeholders) ----------
  async function entriesOf(list) {
    const es = list.map((x) => (typeof x === 'string'
      ? { name: C.baseName(x), path: C.toPath(x, { win: WIN }) }
      : { name: x.name, path: pathOf(x), size: x.size, mime: x.type, blob: x }));
    const withPath = es.filter((e) => e.path);
    if (withPath.length) {
      let info = null;
      try { info = await window.hub.dragdrop?.check(withPath.map((e) => e.path)); } catch { info = null; }
      if (!info) info = await Promise.all(withPath.map(async (e) => { const s = await window.hub.fs.stat(e.path).catch(() => null); return { exists: Boolean(s), isDir: Boolean(s?.isDir), size: s?.size || 0, cloud: null, path: e.path }; }));
      withPath.forEach((e, i) => { const r = info[i] || {}; Object.assign(e, { path: r.path || e.path, missing: !r.exists, isDir: Boolean(r.isDir), cloud: r.cloud || null, size: r.size || e.size || 0 }); });
    }
    return es;
  }
  const isPackName = (n) => /\.hearthpack$/i.test(String(n || ''));

  // ---------- into a chat ----------
  async function toChat(agentId, list, { packs = 'hook' } = {}) {
    const entries = await entriesOf(list);
    const agent = H.agent(agentId);
    const access = Boolean(agent?.workspace || (typeof Access !== 'undefined' && Access.isOn?.(agentId)));
    const plan = C.planChat(entries, { access });
    const v = Native.view(agentId);
    const before = v?.attachments.length || 0;
    const blobs = plan.steps.filter((s) => s.do === 'blob').map((s) => s.e.blob);
    if (blobs.length) await Native.addFiles(agentId, blobs);
    let folders = 0; let big = 0;
    for (const s of plan.steps) {
      const p = s.e.path;
      if (s.do === 'blob') continue;
      if (s.do === 'pack') { if (packs !== 'hook' || typeof LabPacksHook === 'undefined') await openPack(p); continue; }
      if (s.do === 'folder') { folders += 1; await Native.addPath(agentId, p); continue; }
      if (s.big) big += 1;
      if (s.do === 'file') { v.attachments.push({ kind: 'file', name: C.nice(s.e.name || C.baseName(p)), path: p }); continue; } // the AI opens it where it is
      await Native.addPath(agentId, p);
    }
    Native.renderChips(agentId);
    const n = Math.max(0, (v?.attachments.length || 0) - before);
    const done = [];
    if (n) done.push(`Attached ${n}${big ? ` (${big === 1 ? 'the big one stays' : `${big} big ones stay`} where ${big === 1 ? 'it is' : 'they are'}, nothing copied)` : ''}`);
    const line = C.summary(plan, done);
    last.drop = { zone: 'chat', agentId, steps: plan.steps.map((s) => s.do), skipped: plan.skipped.map((s) => s.why), more: plan.more, attached: n, folders, line };
    if (line && (plan.skipped.length || plan.more || big || n > 1)) say(line, { type: plan.skipped.length && !n ? 'error' : 'info' });
    Native.focus?.(agentId);
    return last.drop;
  }
  async function openPack(p) {
    if (typeof LabPacksHook === 'undefined') throw new Error('Packs open in the Lab: open the Three.js Lab once, then drop the pack again');
    const P = await LabPacksHook.lib();
    return P.openFile(p);
  }

  // ---------- onto the Lab preview ----------
  async function labApi() {
    if (typeof ThreeLab === 'undefined') throw new Error('The Three.js Lab isn\'t available');
    const cmd = await ThreeLab.cmd({ show: false });
    const d = ThreeLab.director;
    if (!d) throw new Error('The Lab is still opening: drop it again in a moment');
    return { cmd, d };
  }
  async function picturePath(e) {
    if (e.path) return e.path;
    const buf = new Uint8Array(await e.blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return window.hub.saveAttachment(C.safeName(e.name || `pasted-${Date.now()}.png`), btoa(bin));
  }
  async function toLab(list, { x = 0, y = 0, alt = false } = {}) {
    const entries = await entriesOf(list);
    // Alt+drop a picture: 🎨 Match this look (the menu a picture drop showed before)
    const pic = list.find((f) => typeof f !== 'string' && C.kindOf(f.name, f.type) === 'image');
    if (alt && pic && typeof LookMatch !== 'undefined') { LookMatch.offerDrop(pic, x, y); last.drop = { zone: 'lab', steps: ['look'], line: '' }; return last.drop; }
    const { cmd, d } = await labApi();
    const songLoaded = Boolean(d.media?.loaded && !d.media?.isClock);
    const plan = C.planLab(entries, { songLoaded });
    const done = []; const layers = [];
    for (const s of plan.steps) {
      const e = s.e; const name = C.nice(e.name || C.baseName(e.path));
      try {
        if (s.do === 'pack') { if (typeof LabPacksHook === 'undefined') await openPack(e.path); continue; }
        if (s.do === 'song') { const r = await cmd.loadSong(e.path); if (r?.ok === false) throw new Error(r.error || `${name} didn't load`); done.push(`🎵 ${name} is the song`); continue; }
        if (s.do === 'footage') {
          const r = await cmd.loadSong(e.path);
          if (r?.ok === false) throw new Error(r.error || `${name} didn't load`);
          layers.push(d.addLayer({ template: 'footage-fill', name: stem(name) }, 1));
          done.push(`🎞 ${name} is a video layer (frame-exact on the timeline)`);
          continue;
        }
        if (s.do === 'model') { if (typeof ThreeModels === 'undefined') throw new Error('3D models load with the Lab: try again in a moment'); await ThreeModels.add(e.path); done.push(`🧊 ${name} is in the scene`); continue; }
        const r = await ThreeLab.addReference(s.do === 'picture' ? await picturePath(e) : e.path);
        if (s.do === 'ref') { done.push(`${name} is a reference (refs.${r.key})`); continue; }
        layers.push(d.addLayer({ name: stem(name), code: C.pictureLayer(r.key) }, 1));
        done.push(s.do === 'picture' ? `🖼 ${name} is a picture layer` : `🎞 ${name} is a video layer (looping, the song stays)`);
      } catch (err) { plan.skipped.push({ name, why: `${name}: ${err.message}` }); }
    }
    await Promise.all(layers.map((p) => p.catch(() => null)));
    const line = C.summary(plan, done.length > 3 ? [`${done.length} added to this scene`] : done);
    last.drop = { zone: 'lab', steps: plan.steps.map((s) => s.do), skipped: plan.skipped.map((s) => s.why), more: plan.more, done, line };
    const picOnly = pic && plan.steps.every((s) => s.do === 'picture');
    say(line, { type: plan.skipped.length && !done.length ? 'error' : 'info',
      action: picOnly && typeof LookMatch !== 'undefined' ? { label: '🎨 Match its look', fn: () => LookMatch.offerDrop(pic, x, y) } : undefined });
    return last.drop;
  }

  // ---------- paste ----------
  const editable = (t) => Boolean(t?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], .cm-editor, .code-editor'));
  async function clipboardPaths() { try { return (await window.hub.dragdrop?.clipboard()) || []; } catch { return []; } }
  // the chat box: pictures / screenshots (no path: saved once), files copied in Finder / Explorer (their name is all
  // the text the paste carries), file: URLs; plain text and paths you type stay text
  document.addEventListener('paste', (e) => {
    const ta = e.target;
    if (!ta?.matches?.('.composer textarea')) return;
    const c = chatAt(ta);
    if (!c) return;
    const cd = e.clipboardData;
    const files = [...(cd?.files || [])];
    if (files.length) { e.preventDefault(); e.stopImmediatePropagation(); last.paste = { zone: 'chat', files: files.length }; toChat(c.agentId, files).catch(fail); return; }
    const text = cd?.getData('text/plain') || '';
    const urls = /^\s*file:/i.test(text) ? C.parseClipboard({ text }, { win: WIN }) : [];
    if (urls.length) { e.preventDefault(); e.stopImmediatePropagation(); last.paste = { zone: 'chat', urls: urls.length }; toChat(c.agentId, urls).catch(fail); return; }
    if (!C.looksLikeName(text) || !window.hub.dragdrop) return;
    e.preventDefault(); e.stopImmediatePropagation();
    clipboardPaths().then((paths) => {
      last.paste = { zone: 'chat', clipboard: paths.length };
      if (paths.length) return toChat(c.agentId, paths);
      if (text) Native.insertDraft(c.agentId, text);
      return null;
    }).catch(fail);
  }, true);
  // the Lab in front, not typing: the pasted picture / file joins the scene
  const labInFront = () => H.surfaceIdFor?.(H.activeId) === 'tool:three' && document.querySelector('.three-preview')?.checkVisibility?.({ visibilityProperty: true });
  document.addEventListener('paste', (e) => {
    if (e.defaultPrevented || editable(e.target) || chatAt(e.target) || e.target?.closest?.('dialog, .bd-root, .bdd') || !labInFront()) return;
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) e.preventDefault();
    (async () => {
      const list = files.length ? files : await clipboardPaths();
      last.paste = { zone: 'lab', files: files.length, clipboard: files.length ? 0 : list.length };
      if (!list.length) return; // copied words: the Lab's own keys (slider copy / paste) keep them
      await toLab(list);
    })().catch(fail);
  });

  // ---------- out of Hearth: native drags ----------
  let sendOut = (spec) => window.hub.dragdrop?.out(spec);
  // an <img> on screen as its bytes (data: / blob: / the window's own pictures): drawn once into a canvas
  function imgData(img) {
    const src = img.currentSrc || img.src || '';
    if (/^data:/.test(src)) return src;
    try {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      return c.toDataURL('image/png');
    } catch { return null; }
  }
  function imgSpec(img, name = '') {
    const src = img.currentSrc || img.src || '';
    if (/^file:/i.test(src)) return { path: C.toPath(src, { win: WIN }) };
    if (/^https?:/i.test(src)) return null; // a web picture: the browser's own drag (a link)
    const data = imgData(img);
    if (!data) return null;
    const ext = /^data:image\/(jpe?g)/.test(data) ? 'jpg' : 'png';
    return { name: `${C.safeName(stem(name || img.alt || 'picture'))}.${ext}`, dataUrl: data };
  }
  const SOURCES = [
    // a reply's code block: drag its label (language · lines)
    { sel: '.msg pre > .code-label', hint: 'Drag out to save it as a file', get: (n) => { const pre = n.closest('pre'); const code = pre?.querySelector('code')?.textContent; return code == null ? null : { name: C.codeName(pre.dataset.lang, code), text: code }; } },
    // big pictures / videos a reply made (chat-media.js): the picture, or the name under a video
    { sel: '.cm-hero .cm-name', hint: 'Drag out: the file itself', get: (n) => { const p = n.getAttribute('title'); return p && C.isAbsolute(p) ? { path: p } : null; } },
    { sel: '.msg img:not(.attach-chips img):not(.thing img)', get: (n) => imgSpec(n, n.alt) },
    // the chat box's attachments
    { sel: '.attach-chips .attach-chip', hint: 'Drag out: the file itself', get: (n) => {
      const c = chatAt(n); const v = c && Native.view(c.agentId);
      const a = v?.attachments[[...n.parentElement.children].indexOf(n)];
      if (!a) return null;
      if (a.path) return { path: a.path };
      if (a.kind === 'text') return { name: C.safeName(a.name, 'note.txt'), text: a.content || '' };
      return null;
    } },
    // finished renders and exports (⇪)
    { sel: '.rq-row[data-rq]', hint: 'Drag out: the finished file', get: (n) => { const j = window.Renders?.get?.(n.dataset.rq); return j?.status === 'done' && j.output && !j.trashed ? { path: j.output } : null; } },
    // 📐 a template: its folder (template.json, its picture and media)
    { sel: '.lt-card[data-id]', hint: 'Drag out: the template\'s folder', get: async (n) => { const t = (await window.LabTemplates?.list?.())?.find((x) => x.id === n.dataset.id); return t?._dir ? { path: t._dir } : null; } },
    // the Lab preview's 📷 Still: drag it out for a PNG of the frame on screen
    { sel: '.stage-btn[data-feature="Still"]', hint: 'Drag out: a PNG of this frame', get: async () => { const url = await ThreeLab.shot(); const name = ThreeLab.scenes?.get?.(ThreeLab.scenes.currentId())?.name || 'Lab'; return url ? { name: `${C.safeName(name)} still.png`, dataUrl: url } : null; } },
    // the time machine's snapshots of a scene
    { sel: '.tm-pic img', get: (n) => imgSpec(n, `${n.closest('[data-id]')?.dataset.id || 'snapshot'}`) },
  ];
  const match = (t) => { if (!t?.closest) return null; for (const s of SOURCES) { const node = t.closest(s.sel); if (node) return { s, node }; } return null; };
  // sources become draggable when the pointer reaches them (nothing is changed on screen until then)
  document.addEventListener('pointerover', (e) => {
    const m = match(e.target);
    if (!m || m.node.dataset.ddOut) return;
    m.node.dataset.ddOut = '1';
    if (m.node.getAttribute('draggable') !== 'true') m.node.setAttribute('draggable', 'true');
    if (m.s.hint && !/Drag out/.test(m.node.title || '')) m.node.title = m.node.title ? `${m.node.title}\n${m.s.hint}` : m.s.hint;
  }, { passive: true });
  document.addEventListener('dragstart', (e) => {
    if (e.defaultPrevented) return; // captures, chat things… drag themselves
    const m = match(e.target);
    if (!m) return;
    let spec;
    try { spec = m.s.get(m.node, e); } catch { spec = null; }
    if (!spec) return;
    e.preventDefault();
    Promise.resolve(spec).then((s) => { const o = C.outSpec(s); if (!o) return; last.out = o; sendOut(o); }).catch(fail);
  });

  // ---------- from a chat ----------
  function registerCommands() {
    if (typeof Commands === 'undefined') return;
    if (!Commands.get('drop')) {
      Commands.register({
        name: 'drop', args: '[lab] <path or file: URL…>', area: 'Chat',
        desc: 'As if you dropped these files here: attach them to this chat (a folder asks first), or with "lab" add them to the scene on screen',
        examples: ['/drop ~/Desktop/shot.png', '/drop lab /Users/me/Music/track.mp3'],
        keywords: 'drag drop attach file finder explorer folder song video picture',
        complete: (a) => (String(a || '').trim() ? [] : [{ value: 'lab ', hint: 'onto the Lab preview' }]),
        run: async (args, ctx) => {
          const s = String(args || '').trim();
          const lab = /^lab\b/i.test(s);
          const paths = splitPaths(lab ? s.slice(3) : s);
          if (!paths.length) return 'Which files? /drop <path…> (paths with spaces in quotes, or file: URLs)';
          const r = lab ? await toLab(paths) : await toChat(ctx.agentId, paths);
          return r.line || (lab ? 'Added to the scene' : `Attached ${r.attached}`);
        },
      });
    }
    if (!Commands.get('paste-files')) {
      Commands.register({
        name: 'paste-files', args: '[lab]', area: 'Chat',
        desc: 'Attach the files you copied in Finder / Explorer (⌘C / Ctrl+C) to this chat, or with "lab" add them to the scene',
        keywords: 'clipboard copied files paste finder explorer',
        run: async (args, ctx) => {
          const paths = await clipboardPaths();
          if (!paths.length) return 'No copied files on the clipboard (copy them in Finder / Explorer first; pictures paste with ⌘V / Ctrl+V)';
          const r = /^lab\b/i.test(String(args || '').trim()) ? await toLab(paths) : await toChat(ctx.agentId, paths);
          return r.line || `Attached ${r.attached}`;
        },
      });
    }
  }
  // paths on one line: "quoted with spaces", file: URLs, or plain (no spaces); or one per line
  function splitPaths(s) {
    const t = String(s || '').trim();
    if (!t) return [];
    if (/\n/.test(t)) return t.split(/\r?\n/).map((l) => C.toPath(l, { win: WIN })).filter(Boolean);
    const out = [];
    for (const m of t.matchAll(/"([^"]+)"|'([^']+)'|(\S+)/g)) out.push(C.toPath(m[1] || m[2] || m[3], { win: WIN }));
    // an unquoted path with spaces that names one file ("/Users/me/My song.mp3"): taken whole
    if (out.length > 1 && !/["']/.test(t) && C.isAbsolute(t) && !out.slice(1).every((p) => C.isAbsolute(p))) return [C.toPath(t, { win: WIN })];
    return out.filter(Boolean);
  }
  registerCommands();
  try {
    Keys.add(
      { area: 'Chat', keys: 'Drop files / a folder on a chat', what: 'attach them (pictures previewed, big files by where they are); a folder asks "Let this AI use this folder?"' },
      { area: 'Chat', keys: 'Ctrl+V a file copied in Finder / Explorer', what: 'attaches it (screenshots and pictures too)' },
      { area: 'Chat', keys: 'Drag a code block\'s label out', what: 'saves it as a file there (Finder, Explorer, an editor)' },
      { area: 'Lab', keys: 'Drop on the preview', what: 'a song is the song, a video or picture a layer, a 3D model, a pack' },
      { area: 'Lab', keys: 'Alt+drop a picture on the preview', what: '🎨 Match this look instead of a picture layer' },
      { area: 'Lab', keys: 'Ctrl+V in the Lab', what: 'a copied picture / file joins the scene' },
    );
  } catch { /* no keys.js */ }

  return { toChat, toLab, entriesOf, zoneAt, splitPaths, last, SOURCES, _stubOut(fn) { const was = sendOut; sendOut = fn || ((spec) => window.hub.dragdrop?.out(spec)); return was; } };
})();
window.DragDrop = DragDrop;
