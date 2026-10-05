// Three.js Lab: live sketch sandbox, model viewer/auditor, shader playground, texture inspector,
// docs browser and the shared color/easing kits.
const ThreeLab = (() => {
  const SANDBOX = 'tools/three-sandbox.html';
  let tabs = null;
  const api = {}; // filled by each tab as it mounts

  // One iframe per mode; messages from it are routed by `source`.
  function sandboxFrame(parent, mode, onMessage, extraParams = () => '') {
    // No allow-same-origin: sketch code (which may come from a chat) can't reach the hub's APIs.
    const frame = el('iframe', { class: 'three-frame', attrs: { sandbox: 'allow-scripts allow-pointer-lock allow-downloads' } });
    parent.append(frame);
    let ready = null;
    let queue = [];
    const listener = (e) => {
      if (e.source !== frame.contentWindow || e.data?.source !== 'three-sandbox') return;
      if (e.data.type === 'ready') { ready = e.data; for (const m of queue) frame.contentWindow.postMessage(m, '*'); queue = []; }
      onMessage(e.data);
    };
    addEventListener('message', listener);
    const send = (msg) => {
      const m = { target: 'three-sandbox', ...msg };
      if (ready) frame.contentWindow.postMessage(m, '*'); else queue.push(m);
    };
    const load = () => {
      ready = null;
      frame.src = `${SANDBOX}?mode=${mode}&v=${store.get('three.version', ThreeData.VERSIONS[0])}${extraParams()}&n=${Date.now()}`;
    };
    load();
    return { frame, send, reload: load, get revision() { return ready?.revision; }, get ready() { return Boolean(ready); } };
  }

  // ---------- Sketch tab ----------
  // A sketch is a stack of layers (tools/three-layers.js); a sketch without `layers` is one layer whose
  // code is sketch.code. The editor, sliders and history always show the selected layer.
  const SLOT = 10000; // each layer's slider values live from slot × SLOT in the sandbox
  function sketchTab(pane) {
    let sketches = [];
    let current = null;
    let selId = null; // selected layer
    if (!store.get('three.autorunLive')) { store.set('three.autorun', true); store.set('three.autorunLive', true); }
    let autoRun = store.get('three.autorun', true);
    let errors = [];
    const consoleBox = el('div', { class: 'three-console' });
    const stats = el('div', { class: 'three-stats' });
    const picker = el('select', { class: 'three-sketch-select', title: 'Your sketches' });
    const version = el('select', { title: 'three.js version' }, ThreeData.VERSIONS.map((v) => el('option', { value: v, text: `r${v.split('.')[1]} (${v})`, selected: v === store.get('three.version', ThreeData.VERSIONS[0]) })));
    const autoBox = el('input', { type: 'checkbox', checked: autoRun });
    const snippetSel = el('select', { title: 'Insert a snippet at the cursor' }, el('option', { value: '', text: 'Insert snippet…' }), ThreeData.SNIPPETS.map((s, i) => el('option', { value: i, text: s.name })));
    const editorHost = el('div', { class: 'three-editor' });
    const previewHost = el('div', { class: 'three-preview' }, stats);
    const btn = (text, title, fn, cls = 'ghost small') => el('button', { class: cls, text, title, on: { click: fn } });
    const toolbar = el('div', { class: 'three-toolbar' },
      btn('▶ Run', 'Run every layer again from the start (Ctrl+Enter)', () => run(), 'primary small'),
      el('label', { class: 'check small', title: 'Apply code changes live, a moment after you stop typing' }, autoBox, 'Live code'),
      picker,
      btn('New', 'New sketch from a template', () => templateGallery()),
      btn('Rename', 'Rename sketch', () => renameSketch()),
      btn('Duplicate', 'Duplicate sketch', () => duplicate()),
      btn('Delete', 'Delete sketch', () => removeSketch()),
      btn('History…', 'Earlier versions of the selected layer (saved each time it runs) and deleted sketches', () => historyDialog()),
      snippetSel, version,
      el('span', { class: 'spacer' }),
      btn('📷', 'Save a screenshot (all layers)', () => box.send({ type: 'screenshot' })),
      btn('Export HTML', 'Save as a standalone .html file', exportHtml),
      btn('Ask Claude', 'Send the selected layer (and any errors) to Claude', askAbout));
    // Prompt-first: the code editor stays hidden until asked for.
    const codeBtn = btn('</> Code', 'Show or hide the code of the selected layer (the Three Director writes it for you)', () => setCodeVisible(split.classList.contains('no-code')));
    const slidersBtn = btn('🎚 Layers & sliders', 'Show or hide the layers and the sliders of the selected layer', () => setSlidersVisible(column.hidden));
    toolbar.prepend(codeBtn, slidersBtn);
    const editor = new CodeEditor(editorHost, { lang: 'js', onRun: () => run(), onChange: () => { persist(); if (autoRun) autoRunSoon(); } });

    // ---------- layers ----------
    const layersOf = () => current?.layers || [];
    const layerById = (id) => layersOf().find((L) => L.id === id);
    const sel = () => layerById(selId) || layersOf()[layersOf().length - 1];
    const baseOf = (L) => (L.slot || 0) * SLOT;
    function materialize(s) {
      if (!s.layers?.length) s.layers = [ThreeLayers.defaults({ id: 'main', name: 'Layer 1', code: s.code || '', color: ThreeLayers.COLORS[0], slot: 0 })];
      s.layers.forEach((L, i) => { L.slot ??= i; L.color ||= ThreeLayers.COLORS[i % ThreeLayers.COLORS.length]; });
      return s.layers;
    }
    const layerProps = (L, z) => ({ name: L.name, visible: L.visible !== false, opacity: L.opacity ?? 1, blend: L.blend || 'normal', in: L.in ?? null, out: L.out ?? null, fadeIn: L.fadeIn || 0, fadeOut: L.fadeOut || 0, x: L.x || 0, y: L.y || 0, scale: L.scale ?? 1, rotate: L.rotate || 0, selected: L.id === selId, slot: L.slot, z: z ?? layersOf().indexOf(L) });
    const extrasOf = (L) => {
      const ex = (extras[current.id] ||= {});
      return L.id === 'main' ? ex : ((ex.layers ||= {})[L.id] ||= {});
    };
    // Sliders: one controller per layer (tools/three-tweaks.js); the panel shows the selected layer's.
    const controllers = new Map();
    const layerMods = {};
    const mergedMods = () => Object.assign({}, ...Object.values(layerMods));
    function ctlFor(L) {
      let c = controllers.get(L.id);
      if (c) return c;
      const id = L.id;
      c = ThreeTweaks.controller({
        send: (msg) => {
          const Lx = layerById(id);
          if (!Lx) return;
          if (msg.type === 'tweak') box.send({ ...msg, index: msg.index + baseOf(Lx), layer: id });
          else if (msg.type === 'tweak-mods') {
            layerMods[id] = Object.fromEntries(Object.entries(msg.mods || {}).map(([i, m]) => [Number(i) + baseOf(Lx), m]));
            box.send({ type: 'tweak-mods', mods: mergedMods() });
          } else box.send(msg);
        },
        rerun: (o) => run({ hot: Boolean(o?.hot), layer: id }),
        persist: (kind, data) => { const Lx = layerById(id); if (!Lx || !current) return; extrasOf(Lx)[kind] = data; saveExtras(); },
        quickAsk: (text) => askDirector(text.endsWith('…') ? `${text.slice(0, -1)} ` : `${text} (layer "${layerById(id)?.name}")`, { send: !text.endsWith('…') }),
        goToLine: (line) => { if (selId !== id) selectLayer(id); setCodeVisible(true); requestAnimationFrame(() => goToLine(line)); },
        commit: (code) => {
          const Lx = layerById(id);
          if (!Lx) return;
          if (selId === id) { snapshot(); editor.setValue(code); persist(); } else { Lx.code = code; touch(); }
        },
        askForSliders: () => askDirector(`Add clearly named sliders to the layer "${layerById(id)?.name}" of "${current?.name}" with tweak(): the 4–8 settings I'd most want to play with (motion, colors, lighting, glow, how much it reacts to the music…), with labels, groups and hints, read every frame so they change live. Keep everything else the same.`, { send: false }),
      });
      c.setVisible(!column.hidden);
      c.load(extrasOf(L));
      controllers.set(id, c);
      return c;
    }
    const selCtl = () => (sel() ? ctlFor(sel()) : null);
    const tweaksSlot = el('div', { class: 'tw-slot' });
    const layersPanel = ThreeLayers.panel({
      onSelect: (id) => selectLayer(id),
      onChange: (id, patch, { live }) => editLayer(id, patch, { live }),
      onAdd: (kind) => addLayer(kind),
      onRemove: (id) => removeLayer(id),
      onReorder: (ids) => reorderLayers(ids),
      now: () => player.time,
      duration: () => player.duration,
      loop: () => player.loop,
    });
    const column = el('div', { class: 'tw-column' }, layersPanel.el, tweaksSlot);
    function renderLayers() {
      if (!current) return;
      layersPanel.render(layersOf(), selId);
      player.setTracks([...layersOf()].reverse().map((L) => ({ id: L.id, name: L.name, color: L.color, in: L.in ?? null, out: L.out ?? null, fadeIn: L.in != null ? L.fadeIn || 0 : 0, fadeOut: L.out != null ? L.fadeOut || 0 : 0, visible: L.visible !== false, selected: L.id === selId })),
        { onSelect: (id) => selectLayer(id), onChange: (id, v, { final }) => editLayer(id, v, { live: !final }) });
    }
    function selectLayer(id) {
      const L = layerById(id);
      if (!L || !current) return;
      if (selId !== id) {
        selId = id;
        extras[current.id] = { ...(extras[current.id] || {}), selectedLayer: id };
        saveExtras();
        editor.setValue(L.code);
        editor.setErrorLines(errors.filter((e) => (e.layer || 'main') === id || (!e.layer && layersOf().length === 1)).map((e) => e.line).filter(Boolean));
        for (const x of layersOf()) box.send({ type: 'layer-props', id: x.id, props: { selected: x.id === id } });
      }
      tweaksSlot.replaceChildren(ctlFor(L).el);
      renderLayers();
    }
    const saveSoon = debounce(() => save(), 300);
    function touch() { current.updatedAt = Date.now(); current.code = layersOf()[0]?.code ?? current.code; saveSoon(); }
    function editLayer(id, patch, { live = false } = {}) {
      const L = layerById(id);
      if (!L) return;
      Object.assign(L, patch);
      box.send({ type: 'layer-props', id, props: layerProps(L) });
      if (live) { renderTracksOnly(); return; }
      touch();
      renderLayers();
    }
    function renderTracksOnly() {
      player.setTracks([...layersOf()].reverse().map((L) => ({ id: L.id, name: L.name, color: L.color, in: L.in ?? null, out: L.out ?? null, fadeIn: L.in != null ? L.fadeIn || 0 : 0, fadeOut: L.out != null ? L.fadeOut || 0 : 0, visible: L.visible !== false, selected: L.id === selId })));
    }
    const uniqueName = (name) => { const names = new Set(layersOf().map((L) => L.name)); if (!names.has(name)) return name; let i = 2; while (names.has(`${name} ${i}`)) i += 1; return `${name} ${i}`; };
    function newLayer(o) {
      const Ls = layersOf();
      const slot = Math.max(-1, ...Ls.map((L) => L.slot || 0)) + 1;
      return ThreeLayers.defaults({ color: ThreeLayers.COLORS[slot % ThreeLayers.COLORS.length], slot, ...o, name: uniqueName(o.name || 'Layer') });
    }
    // Adds a layer on top (or at `index`) and runs just that layer.
    function addLayer(kind, { code, name, index, props } = {}) {
      if (!current) return null;
      if (kind === 'ask') { askDirector('Add a layer: ', { send: false }); return null; }
      let L;
      if (kind === 'copy') {
        const S = sel();
        L = newLayer({ ...JSON.parse(JSON.stringify(S)), id: ThreeLayers.newId(), name: `${S.name} copy` });
      } else if (code != null) L = newLayer({ name: name || 'Layer', code, ...(props || {}) });
      else {
        const t = ThreeLayers.TEMPLATES.find((x) => x.id === kind) || ThreeLayers.TEMPLATES[0];
        L = newLayer({ name: name || t.name, code: t.code, ...(props || {}) });
      }
      const Ls = layersOf();
      Ls.splice(index == null ? Ls.length : Math.max(0, Math.min(Ls.length, index)), 0, L);
      touch();
      selId = L.id;
      extras[current.id] = { ...(extras[current.id] || {}), selectedLayer: L.id };
      saveExtras();
      editor.setValue(L.code);
      tweaksSlot.replaceChildren(ctlFor(L).el);
      for (const x of layersOf()) box.send({ type: 'layer-props', id: x.id, props: layerProps(x) });
      run({ hot: true, layer: L.id });
      renderLayers();
      return L;
    }
    async function removeLayer(id, { confirm = true } = {}) {
      const L = layerById(id);
      if (!L) return false;
      if (layersOf().length <= 1) { toast('A sketch keeps at least one layer', { type: 'error' }); return false; }
      if (confirm && !(await Modal.confirm('Delete layer?', `"${L.name}" will be removed from "${current.name}".`, { ok: 'Delete', danger: true }))) return false;
      const at = layersOf().indexOf(L);
      current.layers = layersOf().filter((x) => x !== L);
      controllers.delete(id);
      delete layerMods[id];
      box.send({ type: 'remove-layer', id });
      box.send({ type: 'tweak-mods', mods: mergedMods() });
      if (selId === id) selectLayer(layersOf()[Math.min(at, layersOf().length - 1)].id);
      for (const x of layersOf()) box.send({ type: 'layer-props', id: x.id, props: layerProps(x) });
      touch();
      renderLayers();
      toast(`Deleted "${L.name}"`, { action: { label: 'Undo', fn: () => { current.layers.splice(at, 0, L); touch(); selectLayer(L.id); run({ hot: true, layer: L.id }); for (const x of layersOf()) box.send({ type: 'layer-props', id: x.id, props: layerProps(x) }); } } });
      return true;
    }
    function reorderLayers(idsBottomFirst) {
      const byId = new Map(layersOf().map((L) => [L.id, L]));
      const next = idsBottomFirst.map((i) => byId.get(i)).filter(Boolean);
      if (next.length !== layersOf().length) return;
      current.layers = next;
      next.forEach((L, z) => box.send({ type: 'layer-props', id: L.id, props: { z } }));
      touch();
      renderLayers();
    }

    // Sends (or drafts) a message to the Three Director docked next to the Lab.
    function askDirector(text, { send = true } = {}) {
      const agent = H.agents().find((a) => a.threeTools);
      if (!agent) { toast('Add an agent with Three.js tools first (the Three Director)', { type: 'error' }); return; }
      activate(agent.id);
      if (!send) { Native.setDraft(agent.id, text); return; }
      Native.send(agent.id, text).catch((err) => toast(err.message, { type: 'error' }));
    }
    // Music / video for audio-reactive sketches, and exact output sizes (tools/three-media.js).
    // Each sketch has its own song (and playback spot and frame size), kept in extras[id].media / .frame.
    const player = ThreeMedia.player({
      send: (msg) => box.send(msg),
      sketchName: () => current?.name,
      onPick: (path) => assignMedia(path),
      onLoaded: (o) => { if (o?.unloaded) assignMedia(null); if (o?.reload) run(); renderLayers(); },
    });
    function assignMedia(path) {
      if (!current) return;
      (extras[current.id] ||= {}).media = path ? { path, time: 0 } : null;
      saveExtras();
    }
    function rememberMedia() {
      if (!current || !extras[current.id]?.media || extras[current.id].media.path !== player.path) return;
      extras[current.id].media.time = Math.round(player.time * 1000) / 1000;
      saveExtras();
    }
    setInterval(rememberMedia, 5000);
    addEventListener('beforeunload', () => { rememberMedia(); window.hub.kvSet('three-lab-extras', extras); });
    const split = el('div', { class: 'three-split' }, editorHost, el('div', { class: 'three-right' }, previewHost, player.el, consoleBox), column);
    function setCodeVisible(show) {
      split.classList.toggle('no-code', !show);
      codeBtn.classList.toggle('on', show);
      store.set('three.showCode', show);
    }
    function setSlidersVisible(show) {
      const was = !column.hidden;
      column.hidden = !show;
      for (const c of controllers.values()) c.setVisible(show);
      split.classList.toggle('with-tweaks', show);
      slidersBtn.classList.toggle('on', show);
      store.set('three.showSliders', show);
      if (show && !was && current) run(); // sliders need the instrumented run
    }
    setCodeVisible(store.get('three.showCode', false));
    column.hidden = true;
    setSlidersVisible(store.get('three.showSliders', true));
    pane.append(toolbar, split);
    let stage = null;
    const box = sandboxFrame(previewHost, 'sketch', onMessage, () => stage?.params || '');
    stage = ThreeMedia.stage(previewHost, box.frame, { onChange: ({ id, reload }) => {
      if (current) { (extras[current.id] ||= {}).frame = id; saveExtras(); }
      if (reload && current) run();
    } });
    // Drop an mp3/mp4 on the preview to load it.
    previewHost.addEventListener('dragover', (e) => { if ([...e.dataTransfer.items].some((i) => i.kind === 'file')) { e.preventDefault(); previewHost.classList.add('drop-on'); } });
    previewHost.addEventListener('dragleave', () => previewHost.classList.remove('drop-on'));
    previewHost.addEventListener('drop', (e) => {
      previewHost.classList.remove('drop-on');
      const f = [...e.dataTransfer.files].find((x) => ThreeMedia.isMedia(x.name));
      if (!f) return;
      e.preventDefault();
      const p = window.hub.pathForFile(f);
      assignMedia(p);
      player.load(p);
    });
    // Space plays / pauses; K S H tap hits in; [ ] set loop points; arrows nudge; Delete removes a marker.
    pane.addEventListener('keydown', (e) => { if (player.onKey(e)) e.preventDefault(); });
    pane.tabIndex = -1;
    let ranOnce = false;
    let rebuildWaiting = false;
    // Per-sketch looks and music links for the sliders, song, frame size and selected layer.
    let extras = {};
    const saveExtras = debounce(() => window.hub.kvSet('three-lab-extras', extras), 500);
    let consoleLines = [];
    let lastStats = null;
    let pendingShot = null;

    const layerName = (id) => (layersOf().length > 1 ? layerById(id || 'main')?.name : null);
    function log(level, text, line, layer) {
      const lname = layerName(layer);
      consoleLines.push({ level, text: String(text).slice(0, 500), line, layer: lname });
      if (consoleLines.length > 80) consoleLines.shift();
      const row = el('div', { class: `console-row ${level}` },
        lname ? el('button', { class: 'console-layer', text: lname, title: 'Select this layer', on: { click: () => selectLayer(layer) } }) : null,
        line ? el('button', { class: 'console-line', text: `line ${line}`, on: { click: () => { if (layer && layer !== selId) selectLayer(layer); setCodeVisible(true); requestAnimationFrame(() => goToLine(line)); } } }) : null,
        el('span', { text }));
      consoleBox.append(row);
      while (consoleBox.children.length > 300) consoleBox.firstChild.remove();
      consoleBox.scrollTop = consoleBox.scrollHeight;
    }
    function goToLine(line) {
      const lines = editor.value.split('\n');
      const pos = lines.slice(0, line - 1).join('\n').length + (line > 1 ? 1 : 0);
      editor.focus();
      editor.area.setSelectionRange(pos, pos + (lines[line - 1] || '').length);
      editor.area.scrollTop = Math.max(0, (line - 5) * 19);
      editor.syncScroll();
    }
    function onMessage(msg) {
      if (msg.type === 'console') log(msg.level, msg.text, null, msg.layer);
      if (msg.type === 'tweak-reads') {
        // global indices → each layer's own
        for (const L of layersOf()) {
          const c = controllers.get(L.id);
          if (!c) continue;
          const b = baseOf(L);
          const pick = (arr) => arr.filter((i) => i >= b && i < b + SLOT).map((i) => i - b);
          c.onReads({ used: pick(msg.used), live: pick(msg.live) });
        }
      }
      if (/^(media-state|record-started|record-error|recording)$/.test(msg.type)) {
        player.onMessage(msg);
        if (msg.type === 'recording' && rebuildWaiting) { rebuildWaiting = false; run({ hot: true }); }
      }
      if (msg.type === 'error') {
        const lid = msg.layer || (layersOf().length === 1 ? layersOf()[0].id : null);
        if (lid && controllers.get(lid)?.onError(msg)) return; // couldn't attach sliders: it re-runs as-is
        errors.push({ ...msg, layer: lid });
        log('error', msg.message, msg.line, lid);
        if (!lid || lid === selId) editor.setErrorLines(errors.filter((e) => !e.layer || e.layer === selId).map((e) => e.line).filter(Boolean));
      }
      if (msg.type === 'stats') {
        lastStats = { fps: Math.round(msg.fps), renderMs: Number(msg.ms.toFixed(2)), drawCalls: msg.calls, triangles: msg.triangles, points: msg.points, geometries: msg.geometries, textures: msg.textures, shaders: msg.programs };
        stats.hidden = false;
        stats.replaceChildren(
          el('b', { class: msg.fps < 30 ? 'bad' : msg.fps < 55 ? 'warn' : 'ok', text: `${Math.round(msg.fps)} fps` }),
          el('span', { text: `${msg.ms.toFixed(1)} ms render` }), el('span', { text: `${msg.calls} draw calls` }),
          el('span', { text: `${msg.triangles.toLocaleString()} tris` }), msg.points ? el('span', { text: `${msg.points.toLocaleString()} points` }) : null,
          el('span', { text: `${msg.geometries} geo · ${msg.textures} tex · ${msg.programs} shaders` }));
      }
      if (msg.type === 'shot') {
        if (pendingShot) { pendingShot(msg.dataUrl); pendingShot = null; } else saveDataUrl(msg.dataUrl, `${current?.name || 'sketch'}.png`);
      }
    }
    const autoRunSoon = debounce(() => run({ hot: true, layer: selId }), 700);

    // Version history: a snapshot of a layer each time it runs (40 per layer), plus deleted sketches.
    let history = {};
    let trash = [];
    const saveHistory = debounce(() => window.hub.kvSet('three-history', { versions: history, trash }), 400);
    const histKey = (L) => (!L || L.id === 'main' ? current.id : `${current.id}:${L.id}`);
    function snapshot() {
      if (!current || !editor.value.trim()) return;
      const list = (history[histKey(sel())] ||= []);
      if (list[0]?.code === editor.value) return;
      list.unshift({ at: Date.now(), code: editor.value });
      list.length = Math.min(list.length, 40);
      saveHistory();
    }
    function historyDialog() {
      const L = sel();
      const versions = history[histKey(L)] || [];
      const dlg = el('dialog', { class: 'ui-modal gallery-dialog' });
      const preview = el('pre', { class: 'code-view', text: 'Pick a version to preview it.' });
      let picked = null;
      const restoreBtn = el('button', { type: 'button', class: 'primary', text: 'Restore this version', disabled: true, on: { click: () => {
        snapshot();
        editor.setValue(picked.code);
        persist();
        dlg.close();
        run({ hot: true, layer: selId });
        toast('Version restored (the code you had is in History too)');
      } } });
      const row = (label, sub, onClick) => el('button', { type: 'button', class: 'lib-item', on: { click: onClick } }, el('b', { text: label }), ' ', el('span', { class: 'hint', text: sub }));
      dlg.append(el('form', { method: 'dialog' }, el('h2', { text: `History: ${current.name}${layersOf().length > 1 ? ` · ${L.name}` : ''}` }),
        el('div', { class: 'lib-layout', style: { minHeight: '360px' } },
          el('div', { class: 'lib-side' },
            el('div', { class: 'lib-group', text: 'Versions (saved when run)' }),
            ...(versions.length ? versions.map((v) => row(fmtDate(v.at), `${v.code.split('\n').length} lines`, () => {
              picked = v; preview.innerHTML = highlight(v.code, 'js'); restoreBtn.disabled = false;
            })) : [el('p', { class: 'hint', text: 'No versions yet. One is saved each time you run.' })]),
            el('div', { class: 'lib-group', text: 'Deleted sketches' }),
            ...(trash.length ? trash.map((t) => row(t.name, `deleted ${timeAgo(t.deletedAt)}`, () => {
              trash = trash.filter((x) => x !== t);
              saveHistory();
              dlg.close();
              create(t.name, t.code, t.layers);
              toast(`Restored "${t.name}"`);
            })) : [el('p', { class: 'hint', text: 'None.' })])),
          preview),
        el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Close' }), restoreBtn)));
      dlg.addEventListener('close', () => dlg.remove());
      document.body.append(dlg);
      dlg.showModal();
    }

    // Full runs reload the preview with every layer; hot runs (slider rebuilds, live code, a new layer)
    // re-run one layer in place, keeping three.js loaded, the other layers running and the music playing.
    function run({ hot = false, layer = null } = {}) {
      if (!current) return false;
      if (hot && (!box.ready || !ranOnce)) hot = false;
      if (player.recording) {
        // A rebuild would end the recording; it waits until the video is saved.
        if (hot) { if (!rebuildWaiting) toast('That change rebuilds the scene: it applies when you stop recording', { timeout: 2500 }); rebuildWaiting = true; return false; }
        toast('Stop the recording first', { type: 'error' });
        return false;
      }
      snapshot();
      const target = hot ? layerById(layer || selId) : null;
      if (hot && !target) hot = false;
      consoleLines = consoleLines.filter((l) => hot && l.layer && l.layer !== target?.name);
      errors = hot ? errors.filter((e) => e.layer && e.layer !== target.id) : [];
      editor.setErrorLines(errors.filter((e) => e.layer === selId).map((e) => e.line).filter(Boolean));
      consoleBox.replaceChildren();
      // every layer's sliders go into one table, each layer at its own offset
      const values = {}; const keys = {}; const preps = new Map();
      for (const L of layersOf()) {
        const p = ctlFor(L).prepare(L.code, baseOf(L));
        preps.set(L.id, p);
        if (!p) { delete layerMods[L.id]; continue; }
        const b = baseOf(L);
        p.values.forEach((v, i) => { values[b + i] = v; });
        for (const [k, i] of Object.entries(p.keys)) keys[`${L.id}|${k}`] = b + i;
        layerMods[L.id] = Object.fromEntries(Object.entries(p.mods || {}).map(([i, m]) => [Number(i) + b, m]));
      }
      if (!hot) { lastStats = null; stats.hidden = true; box.reload(); }
      box.send({ type: 'tweak-init', values, keys, mods: mergedMods() });
      if (!hot) player.attach();
      const spec = (L) => ({ id: L.id, code: preps.get(L.id)?.code ?? L.code, ...layerProps(L) });
      if (hot) box.send({ type: 'hot-layer', layer: spec(target) });
      else box.send({ type: 'run-layers', layers: layersOf().map(spec) });
      ranOnce = true;
      return true;
    }

    const save = debounce(() => window.hub.kvSet('three-sketches', sketches), 600);
    function persist() {
      if (!current) return;
      const L = sel();
      if (L) L.code = editor.value;
      current.code = layersOf()[0]?.code ?? editor.value;
      current.updatedAt = Date.now();
      save();
    }
    function renderPicker() {
      picker.replaceChildren(...[...sketches].sort((a, b) => b.updatedAt - a.updatedAt).map((s) => el('option', { value: s.id, text: s.name, selected: s.id === current?.id })));
    }
    function openSketch(id) {
      // unsaved slider values in any layer of the sketch you leave
      const left = current;
      const pendings = left ? [...controllers.entries()].map(([lid, c]) => ({ lid, p: c.pending() })).filter((x) => x.p) : [];
      if (left && left.id !== id && pendings.length) {
        toast(`Slider changes to "${left.name}" weren't saved`, { timeout: 8000, action: { label: 'Save them', fn: () => {
          for (const { lid, p } of pendings) {
            const L = left.layers?.find((x) => x.id === lid);
            if (!L || L.code !== p.from) continue;
            const key = lid === 'main' ? left.id : `${left.id}:${lid}`;
            (history[key] ||= []).unshift({ at: Date.now(), code: L.code });
            L.code = p.to;
          }
          saveHistory();
          left.code = left.layers?.[0]?.code ?? left.code;
          left.updatedAt = Date.now();
          save();
          if (current === left) { editor.setValue(sel().code); run(); }
          toast(`Saved into "${left.name}"`);
        } } });
      }
      controllers.clear();
      for (const k of Object.keys(layerMods)) delete layerMods[k];
      rememberMedia();
      if (left && stage) { (extras[left.id] ||= {}).frame = stage.size.id; saveExtras(); }
      current = sketches.find((s) => s.id === id) || sketches[0];
      materialize(current);
      // This sketch's frame size and song (with where it was in the song).
      const ex = extras[current.id] || {};
      if (ex.frame) stage.setMode(ex.frame, { silent: true });
      const want = ex.media?.path || null;
      if (!want) { if (player.loaded || player.path) player.unload({ silent: true }); }
      else if (want !== player.path) { player.unload({ silent: true }); player.load(want, { startAt: ex.media.time || 0, quiet: true }); }
      else player.seek(ex.media.time || 0);
      store.set('three.current', current.id);
      selId = layerById(ex.selectedLayer)?.id || layersOf()[layersOf().length - 1].id;
      editor.setValue(sel().code);
      tweaksSlot.replaceChildren(ctlFor(sel()).el);
      renderPicker();
      renderLayers();
      run();
    }
    function create(name, code, layers) {
      const s = { id: `s${Date.now()}`, name, code, updatedAt: Date.now(), ...(layers ? { layers: JSON.parse(JSON.stringify(layers)) } : {}) };
      sketches.push(s);
      save();
      openSketch(s.id);
      return s;
    }
    async function renameSketch() {
      const name = await Modal.prompt('Rename sketch', { value: current.name });
      if (name) { current.name = name.trim(); save(); renderPicker(); }
    }
    function duplicate() { persist(); create(`${current.name} copy`, current.code, current.layers); }
    async function removeSketch() {
      if (sketches.length === 1) { toast('Keep at least one sketch', { type: 'error' }); return; }
      if (!(await Modal.confirm('Delete sketch?', `"${current.name}" will be deleted. You can bring it back from History.`, { ok: 'Delete', danger: true }))) return;
      persist();
      trash.unshift({ name: current.name, code: current.code, layers: current.layers, deletedAt: Date.now() });
      trash.length = Math.min(trash.length, 30);
      saveHistory();
      sketches = sketches.filter((s) => s.id !== current.id);
      save();
      openSketch(sketches[0].id);
    }
    function templateGallery() {
      const dlg = el('dialog', { class: 'ui-modal gallery-dialog' });
      dlg.append(el('form', { method: 'dialog' }, el('h2', { text: 'New sketch' }),
        el('div', { class: 'gallery' }, ThreeData.TEMPLATES.map((t) => el('button', {
          type: 'button', class: 'gallery-item', on: { click: () => { dlg.close(); create(t.name, t.code); } },
        }, el('b', { text: t.name }), el('span', { class: 'hint', text: t.desc })))),
        el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Cancel' }))));
      dlg.addEventListener('close', () => dlg.remove());
      document.body.append(dlg);
      dlg.showModal();
    }
    function exportHtml() {
      if (layersOf().length > 1) { toast('Export HTML works for one-layer sketches. For layered ones, use ⏺ Record (it records every layer with the music).', { type: 'error', timeout: 6000 }); return; }
      const v = store.get('three.version', ThreeData.VERSIONS[0]);
      const code = editor.value;
      const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(current.name)}</title>
<style>html, body { margin: 0; height: 100%; overflow: hidden; background: #000; } canvas { display: block; }</style>${/\btweak\s*\(/.test(code) ? `
<script>
// Slider controls from the Three.js Lab, frozen at their saved values.
window.tweak = (spec) => Object.fromEntries(Object.entries(spec).map(([k, v]) => [k, Array.isArray(v) ? v[0] : (v && typeof v === 'object' && 'value' in v) ? v.value : v]));
</script>` : ''}${/\b(audio|media)\./.test(code) ? `
<script>
// The Lab's music input isn't part of the export: these stand-ins keep the sketch running (silent).
window.audio = { level: 0, bass: 0, mid: 0, treble: 0, beat: 0, kick: 0, snare: 0, hit: 0, hits: { kick: [], snare: [], hit: [] }, since: () => Infinity, next: () => Infinity, beatInBar: 1, bar: 1, beatPhase: 0, barPhase: 0, beatsPerBar: 4, spectrum: new Uint8Array(1024), waveform: new Float32Array(2048), band: () => 0, time: 0, duration: 0, playing: false, loaded: false, simulated: false, bpm: 0, analysis: null, file: null };
window.audio = new Proxy(window.audio, { get: (o, k) => (k === 'time' ? performance.now() / 1000 : o[k]) });
window.media = { video: null, width: 0, height: 0, texture: () => null };
</script>` : ''}
<script type="importmap">
{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@${v}/build/three.module.js", "three/addons/": "https://cdn.jsdelivr.net/npm/three@${v}/examples/jsm/" } }
</script>
</head>
<body>
<script type="module">
${code}
</script>
</body>
</html>
`;
      window.hub.saveFile({ defaultPath: `${current.name.replace(/[\\/:*?"<>|]/g, '_')}.html`, filters: [{ name: 'HTML', extensions: ['html'] }], content: html })
        .then((p) => p && toast('Exported. It runs in any browser (needs internet for three.js).', { action: { label: 'Open', fn: () => window.hub.fs.open(p) } }));
    }
    function askAbout() {
      const own = errors.filter((e) => !e.layer || e.layer === selId);
      const errText = own.length ? `\n\nIt currently shows these errors:\n${own.map((e) => `- ${e.message}${e.line ? ` (line ${e.line})` : ''}`).join('\n')}` : '';
      const which = layersOf().length > 1 ? ` (the layer "${sel().name}" of a layered sketch: each layer is its own module with its own transparent renderer)` : '';
      draftToClaude(`Here's my three.js sketch${which} (three r${(box.revision || store.get('three.version', ThreeData.VERSIONS[0]).split('.')[1])}, ES modules with an import map for 'three' and 'three/addons/').${errText}\n\n\`\`\`js\n${editor.value}\n\`\`\`\n\n`);
    }

    picker.addEventListener('change', () => openSketch(picker.value));
    autoBox.addEventListener('change', () => { autoRun = autoBox.checked; store.set('three.autorun', autoRun); });
    version.addEventListener('change', () => { store.set('three.version', version.value); run(); });
    snippetSel.addEventListener('change', () => {
      const s = ThreeData.SNIPPETS[Number(snippetSel.value)];
      if (s) editor.insertAtCursor(s.code);
      snippetSel.value = '';
    });

    (async () => {
      sketches = await window.hub.kvGet('three-sketches', []);
      ({ versions: history = {}, trash = [] } = await window.hub.kvGet('three-history', {}));
      extras = await window.hub.kvGet('three-lab-extras', {});
      // First run with per-sketch songs: the song that was loaded goes to the sketch that was open.
      const firstId = sketches.some((s) => s.id === store.get('three.current')) ? store.get('three.current') : sketches[0]?.id;
      const lastMedia = store.get('three.media', null);
      if (firstId && lastMedia && extras[firstId]?.media === undefined) { (extras[firstId] ||= {}).media = { path: lastMedia, time: 0 }; saveExtras(); }
      if (!sketches.length) { sketches = [{ id: `s${Date.now()}`, name: 'Basic scene', code: ThreeData.TEMPLATES[0].code, updatedAt: Date.now() }]; save(); }
      openSketch(store.get('three.current', sketches[0].id));
      api.director = director; // only once saved sketches are loaded, so director edits never land on a placeholder
    })();

    api.openCode = (code) => create(`From chat ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, code);

    // What the Three Director (Claude) uses to build scenes from the user's prompts.
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const layersSummary = () => layersOf().map((L, i) => ({
      id: L.id, name: L.name, order: `${i + 1} of ${layersOf().length} (1 = bottom)`, selected: L.id === selId,
      visible: L.visible !== false, opacity: L.opacity ?? 1, blend: L.blend || 'normal',
      plays: L.in == null && L.out == null ? 'whole song' : { from: L.in ?? 0, to: L.out ?? 'end', fadeIn: L.fadeIn || 0, fadeOut: L.fadeOut || 0 },
      ...(L.x || L.y || (L.scale ?? 1) !== 1 || L.rotate ? { transform: { x: L.x || 0, y: L.y || 0, scale: L.scale ?? 1, rotate: L.rotate || 0 } } : {}),
      sliders: controllers.get(L.id)?.controls().map((c) => c.label) || [],
    }));
    const report = () => ({
      sketch: current?.name,
      layer: sel()?.name,
      layers: layersSummary(),
      errors: errors.map((e) => ({ layer: layerById(e.layer)?.name, message: e.message, line: e.line || undefined })),
      console: consoleLines.slice(-30).map((l) => `${l.layer ? `[${l.layer}] ` : ''}${l.level === 'log' ? '' : `[${l.level}] `}${l.line ? `(line ${l.line}) ` : ''}${l.text}`),
      stats: lastStats || 'no frames rendered yet (nothing calls renderer.render, or it failed)',
      frame: stage.size,
      ...(selCtl()?.controls().length ? { sliders: selCtl().controls() } : { sliders: 'none: add named controls with tweak()' }),
      ...(selCtl()?.unsaved().length ? { unsavedSliders: selCtl().unsaved() } : {}),
      music: player.loaded ? (({ file, bpm, duration, time, playing }) => ({ file, bpm, duration, time, playing }))(player.info()) : 'none loaded (demo 120 bpm beat)',
      ...(document.hidden || !document.hasFocus() ? { note: 'The hub window is in the background, so fps is throttled here; judge performance by renderMs.' } : {}),
    });
    // "top", "bottom", "selected", a number (1 = bottom), an id or a name.
    function findLayer(ref) {
      const Ls = layersOf();
      if (ref == null || ref === '' || ref === 'selected') return sel();
      if (ref === 'top') return Ls[Ls.length - 1];
      if (ref === 'bottom') return Ls[0];
      if (typeof ref === 'number' || /^\d+$/.test(String(ref))) return Ls[Number(ref) - 1];
      const r = String(ref).toLowerCase();
      return Ls.find((L) => L.id === ref) || Ls.find((L) => L.name.toLowerCase() === r) || Ls.find((L) => L.name.toLowerCase().includes(r));
    }
    const PROP_KEYS = ['name', 'visible', 'opacity', 'blend', 'in', 'out', 'fadeIn', 'fadeOut', 'x', 'y', 'scale', 'rotate'];
    const director = {
      getCode: () => ({ sketch: current?.name, layer: sel()?.name, layers: layersSummary(), frame: stage.size, lines: editor.value.split('\n').length, code: editor.value, ...(selCtl()?.controls().length ? { sliders: selCtl().controls() } : {}), ...(selCtl()?.unsaved().length ? { unsavedSliders: selCtl().unsaved(), note: 'The user moved these sliders but has not saved them into the code; keep their values when you rewrite.' } : {}) }),
      media: player,
      assignMedia,
      setFrame: (id) => stage.setMode(id),
      async setCode(code, wait = 2.5) {
        if (player.recording) throw new Error('The user is recording a video right now; wait until they stop.');
        snapshot();
        editor.setValue(code);
        persist();
        renderPicker();
        if (layersOf().length > 1) run({ hot: true, layer: selId }); else run();
        await sleep(Math.min(15, Math.max(1, wait)) * 1000);
        return report();
      },
      async newSketch(name, code, wait = 2.5) {
        create(name, code);
        await sleep(Math.min(15, Math.max(1, wait)) * 1000);
        return report();
      },
      // ---------- layers ----------
      layers: () => ({ sketch: current?.name, selected: sel()?.name, layers: layersSummary() }),
      async addLayer({ name, code, template, position, props = {} }, wait = 2.5) {
        if (player.recording) throw new Error('The user is recording a video right now; wait until they stop.');
        const Ls = layersOf();
        const index = position === 'bottom' ? 0 : typeof position === 'number' ? position - 1 : Ls.length;
        const p = Object.fromEntries(Object.entries(props).filter(([k]) => PROP_KEYS.includes(k)));
        const L = code ? addLayer('code', { code, name, index, props: p }) : addLayer(template || 'empty', { name, index, props: p });
        await sleep(Math.min(15, Math.max(1, wait)) * 1000);
        return { added: L?.name, ...report() };
      },
      async updateLayer(ref, patch = {}, wait = 1.5) {
        const L = findLayer(ref);
        if (!L) throw new Error(`No layer "${ref}". Layers: ${layersOf().map((x) => x.name).join(', ')}`);
        const props = Object.fromEntries(Object.entries(patch).filter(([k]) => PROP_KEYS.includes(k)));
        if (Object.keys(props).length) editLayer(L.id, props);
        if (patch.code != null) {
          if (player.recording) throw new Error('The user is recording a video right now; wait until they stop.');
          if (selId !== L.id) selectLayer(L.id);
          snapshot();
          editor.setValue(String(patch.code));
          persist();
          run({ hot: true, layer: L.id });
        }
        if (patch.order != null) {
          const ids = layersOf().map((x) => x.id).filter((x) => x !== L.id);
          const to = patch.order === 'top' ? ids.length : patch.order === 'bottom' ? 0 : Math.max(0, Math.min(ids.length, Number(patch.order) - 1));
          ids.splice(to, 0, L.id);
          reorderLayers(ids);
        }
        await sleep(Math.min(15, Math.max(0.3, wait)) * 1000);
        return { updated: L.name, ...report() };
      },
      async removeLayer(ref) {
        const L = findLayer(ref);
        if (!L) throw new Error(`No layer "${ref}".`);
        if (!(await removeLayer(L.id, { confirm: false }))) throw new Error('A sketch keeps at least one layer.');
        return { removed: L.name, ...report() };
      },
      selectLayer(ref) {
        const L = findLayer(ref);
        if (!L) throw new Error(`No layer "${ref}".`);
        selectLayer(L.id);
        return director.getCode();
      },
      report,
      shot: () => new Promise((resolve) => {
        pendingShot = resolve;
        box.send({ type: 'screenshot' });
        setTimeout(() => { if (pendingShot === resolve) { pendingShot = null; resolve(null); } }, 5000);
      }),
    };
    api.runSketch = run;
  }

  function saveDataUrl(dataUrl, name) {
    window.hub.saveFile({ defaultPath: name, filters: [{ name: 'PNG image', extensions: ['png'] }], content: dataUrl.split(',')[1], base64: true })
      .then((p) => p && toast('Screenshot saved', { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } }));
  }

  // ---------- Model viewer tab ----------
  function modelTab(pane) {
    const view = el('div', { class: 'three-preview model-preview' });
    const side = el('div', { class: 'model-side' });
    let info = null;
    const btn = (text, title, fn) => el('button', { class: 'ghost small', text, title, on: { click: fn } });
    const toolbar = el('div', { class: 'three-toolbar' },
      btn('Open model…', 'GLB, GLTF, FBX, OBJ, STL or PLY', openModel),
      btn('Frame', 'Fit the model in view', () => box.send({ type: 'viewer', cmd: 'frame' })),
      btn('📷', 'Save a screenshot', () => box.send({ type: 'screenshot' })),
      btn('Loader code', 'Copy three.js code that loads this model and plays its animations', loaderCode),
      el('span', { class: 'spacer' }),
      el('span', { class: 'hint', text: 'Drop model files onto the view. For .gltf, drop its .bin and textures together.' }));
    pane.append(toolbar, el('div', { class: 'model-split' }, view, side));
    const box = sandboxFrame(view, 'viewer', (msg) => {
      if (msg.type === 'model') { info = msg; renderSide(); toast(`Loaded ${msg.name}`, { timeout: 1500 }); }
      if (msg.type === 'error') toast(msg.message, { type: 'error' });
      if (msg.type === 'shot') saveDataUrl(msg.dataUrl, `${info?.name || 'model'}.png`);
    });
    const cmd = (c, value, extra = {}) => box.send({ type: 'viewer', cmd: c, value, ...extra });

    async function openModel() {
      const paths = await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: '3D models', extensions: ['glb', 'gltf', 'fbx', 'obj', 'stl', 'ply', 'bin', 'png', 'jpg', 'jpeg', 'webp', 'ktx2'] }] });
      if (!paths.length) return;
      const main = paths.find((p) => /\.(glb|gltf|fbx|obj|stl|ply)$/i.test(p));
      if (!main) { toast('Pick a .glb, .gltf, .fbx, .obj, .stl or .ply file', { type: 'error' }); return; }
      const toBuf = async (p) => Uint8Array.from(atob(await window.hub.fs.read(p, { encoding: 'base64', maxBytes: 500 * 1048576 })), (c) => c.charCodeAt(0)).buffer;
      const extra = await Promise.all(paths.filter((p) => p !== main).map(async (p) => ({ name: p.split(/[\\/]/).pop(), buffer: await toBuf(p) })));
      box.send({ type: 'load', name: main.split(/[\\/]/).pop(), buffer: await toBuf(main), extra });
    }

    function loaderCode() {
      if (!info) { toast('Load a model first', { type: 'error' }); return; }
      const clips = info.clips.map((c) => c.name);
      const code = `import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
${/\.(glb|gltf)$/i.test(info.name) ? '' : `// ${info.name} isn't glTF: convert it (Blender → File → Export → glTF 2.0) or swap in the matching loader.\n`}const loader = new GLTFLoader();
let mixer;
loader.load('models/${info.name}', (gltf) => {
  const model = gltf.scene;
  scene.add(model);${clips.length ? `
  mixer = new THREE.AnimationMixer(model);
  // Clips: ${clips.join(', ')}
  const clip = THREE.AnimationClip.findByName(gltf.animations, '${clips[0].replace(/'/g, "\\'")}');
  mixer.clipAction(clip).play();` : ''}
});
${clips.length ? '// In your render loop: mixer?.update(clock.getDelta());\n' : ''}// Size in units: ${info.size.join(' × ')} · ${info.triangles.toLocaleString()} triangles
`;
      copyText(code, 'Loader code copied');
    }

    function renderSide() {
      side.replaceChildren();
      if (!info) { side.append(el('p', { class: 'hint', text: 'Open or drop a model to see its stats, materials, scene tree and animations.' })); return; }
      const stat = (label, value) => el('div', { class: 'stat' }, el('span', { text: label }), el('b', { text: value }));
      const section = (title, ...kids) => el('details', { class: 'model-section', open: true }, el('summary', { text: title }), ...kids);
      side.append(
        el('h3', { text: info.name }),
        section('Stats', el('div', { class: 'stats-grid' },
          stat('Triangles', info.triangles.toLocaleString()), stat('Vertices', info.vertices.toLocaleString()),
          stat('Meshes', info.meshes), stat('Draw calls (est.)', info.drawCalls), stat('Materials', info.materials.length),
          stat('Textures', `${info.textures.length} · ${fmtBytes(info.gpuTextureBytes)} GPU`), stat('Size (units)', info.size.join(' × ')),
          stat('Skinned meshes', info.skinned ? `${info.skinned} (${info.maxBones} bones max)` : '0'))),
        section('Performance audit', el('ul', { class: 'issues' }, info.issues.map((i) => el('li', { class: i.level, text: i.text })))),
        section('Display', ...displayControls()),
        info.clips.length ? section(`Animations (${info.clips.length})`, animationControls()) : null,
        section(`Materials (${info.materials.length})`, ...info.materials.map(materialRow)),
        section('Scene tree', treeNode(info.tree, 0)),
        info.textures.length ? section(`Textures (${info.textures.length})`, el('div', { class: 'tex-list' }, info.textures.map((t) => el('div', { class: 'tex-row' },
          el('span', { text: t.name }), el('span', { class: t.pot ? '' : 'warn', text: `${t.w}×${t.h}` }), el('span', { class: 'hint', text: fmtBytes(t.bytes) }))))) : null);
    }
    function displayControls() {
      const toggle = (label, c, initial) => {
        const input = el('input', { type: 'checkbox', checked: initial, on: { change: () => cmd(c, input.checked) } });
        return el('label', { class: 'check' }, input, label);
      };
      const bg = el('input', { type: 'color', value: '#1b1e25', on: { input: () => cmd('background', bg.value) } });
      return [el('div', { class: 'check-grid' },
        toggle('Wireframe', 'wireframe', false), toggle('Bounding box', 'bbox', false), toggle('Grid', 'grid', true), toggle('Axes', 'axes', true),
        toggle('Environment light', 'environment', true), toggle('Vertex normals', 'normals', false), toggle('Auto-rotate', 'autorotate', false)),
      el('label', { class: 'row' }, 'Background ', bg)];
    }
    function animationControls() {
      const sel = el('select', {}, info.clips.map((c) => el('option', { value: c.name, text: `${c.name} (${c.duration}s, ${c.tracks} tracks)` })));
      const speed = el('input', { type: 'range', min: 0, max: 3, step: 0.05, value: 1 });
      const speedLabel = el('span', { class: 'hint', text: '1×' });
      const scrub = el('input', { type: 'range', min: 0, max: info.clips[0].duration, step: 0.01, value: 0 });
      let paused = false;
      const pause = el('button', { class: 'ghost small', text: '⏸ Pause', on: { click: () => { paused = !paused; pause.textContent = paused ? '▶ Play' : '⏸ Pause'; cmd('pause', paused); } } });
      sel.addEventListener('change', () => { cmd('clip', sel.value); scrub.max = info.clips.find((c) => c.name === sel.value).duration; });
      speed.addEventListener('input', () => { speedLabel.textContent = `${Number(speed.value).toFixed(2)}×`; if (!paused) cmd('speed', Number(speed.value)); });
      scrub.addEventListener('input', () => { if (!paused) pause.click(); cmd('seek', Number(scrub.value)); });
      return el('div', { class: 'anim-controls' }, sel, el('div', { class: 'row' }, pause, el('span', { class: 'hint', text: 'Speed' }), speed, speedLabel), el('label', { class: 'hint' }, 'Scrub (pauses)', scrub));
    }
    function materialRow(m) {
      const row = el('div', { class: 'mat-row' }, el('div', { class: 'mat-name' }, el('b', { text: m.name }), el('span', { class: 'hint', text: `${m.type}${m.maps.length ? ` · ${m.maps.join(', ')}` : ''}` })));
      const ctrl = el('div', { class: 'mat-ctrl' });
      if (m.color) ctrl.append(el('label', { class: 'hint' }, 'Color ', el('input', { type: 'color', value: m.color, on: { input: (e) => cmd('material', e.target.value, { uuid: m.uuid, prop: 'color' }) } })));
      if (m.emissive) ctrl.append(el('label', { class: 'hint' }, 'Emissive ', el('input', { type: 'color', value: m.emissive, on: { input: (e) => cmd('material', e.target.value, { uuid: m.uuid, prop: 'emissive' }) } })));
      for (const prop of ['roughness', 'metalness', 'opacity']) {
        if (typeof m[prop] !== 'number') continue;
        ctrl.append(el('label', { class: 'hint slider' }, prop, el('input', { type: 'range', min: 0, max: 1, step: 0.01, value: m[prop], on: { input: (e) => cmd('material', Number(e.target.value), { uuid: m.uuid, prop }) } })));
      }
      row.append(ctrl);
      return row;
    }
    function treeNode(n, depth) {
      const vis = el('input', { type: 'checkbox', checked: n.visible, title: 'Visible', on: { change: (e) => cmd('visible', e.target.checked, { uuid: n.uuid }) } });
      const label = el('span', { class: 'tree-label', text: n.name, title: n.type, on: { click: () => cmd('select', null, { uuid: n.uuid }) } });
      const row = el('div', { class: 'tree-row', style: { paddingLeft: `${depth * 12}px` } }, vis, label, el('span', { class: 'hint', text: n.type.replace(/Mesh$/, ' mesh') }));
      return el('div', {}, row, n.children.slice(0, 400).map((c) => treeNode(c, depth + 1)));
    }
    renderSide();
    api.openModel = openModel;
  }

  // ---------- Shader tab ----------
  function shaderTab(pane) {
    const status = el('span', { class: 'hint' });
    const presetSel = el('select', {}, el('option', { value: '', text: 'Presets…' }), Object.keys(ThreeData.SHADERS).map((k) => el('option', { value: k, text: k })));
    const editorHost = el('div', { class: 'three-editor' });
    const preview = el('div', { class: 'three-preview' });
    const errorsBox = el('div', { class: 'three-console' });
    const editor = new CodeEditor(editorHost, { lang: 'glsl', onRun: () => apply(), onChange: debounce(() => { store.set('three.shader', editor.value); apply(); }, 500) });
    const btn = (text, title, fn, cls = 'ghost small') => el('button', { class: cls, text, title, on: { click: fn } });
    pane.append(el('div', { class: 'three-toolbar' },
      btn('▶ Compile', 'Compile (Ctrl+Enter); it also recompiles as you type', () => apply(), 'primary small'), presetSel,
      el('span', { class: 'hint', text: 'Uniforms: uTime, uResolution, uMouse, uFrame · write to fragColor · Shadertoy mainImage() works too' }),
      el('span', { class: 'spacer' }), status,
      btn('📷', 'Save a screenshot', () => box.send({ type: 'screenshot' })),
      btn('Copy as ShaderMaterial', 'three.js code for this shader on a mesh', copyMaterial),
      btn('Ask Claude', 'Send this shader (and errors) to Claude', () => draftToClaude(`Here's my GLSL ES 3.0 fragment shader (uniforms uTime, uResolution, uMouse; output fragColor).${errorsBox.textContent ? `\n\nCompiler errors:\n${errorsBox.textContent}` : ''}\n\n\`\`\`glsl\n${editor.value}\n\`\`\`\n\n`))),
    el('div', { class: 'three-split' }, editorHost, el('div', { class: 'three-right' }, preview, errorsBox)));
    const box = sandboxFrame(preview, 'shader', (msg) => {
      if (msg.type === 'shader-error') {
        status.textContent = 'Compile error';
        status.className = 'hint bad';
        errorsBox.replaceChildren(...msg.errors.map((e) => el('div', { class: 'console-row error' }, e.line ? el('span', { class: 'console-line', text: `line ${e.line}` }) : null, el('span', { text: e.message }))));
        editor.setErrorLines(msg.errors.map((e) => e.line).filter((l) => l > 0));
      }
      if (msg.type === 'shader-ok') { status.textContent = 'Compiled'; status.className = 'hint ok'; errorsBox.replaceChildren(); editor.setErrorLines([]); }
      if (msg.type === 'shot') saveDataUrl(msg.dataUrl, 'shader.png');
    });
    function apply() { box.send({ type: 'shader', code: editor.value }); }
    function copyMaterial() {
      const frag = editor.value.replace(/`/g, '\\`');
      copyText(`const uniforms = { uTime: { value: 0 }, uResolution: { value: new THREE.Vector2(innerWidth, innerHeight) }, uMouse: { value: new THREE.Vector2() }, uFrame: { value: 0 } };
const material = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,
  uniforms,
  vertexShader: \`out vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }\`,
  fragmentShader: \`uniform float uTime; uniform vec2 uResolution; uniform vec2 uMouse; uniform int uFrame;
in vec2 vUv;
out vec4 fragColor;
#define iTime uTime
#define iResolution vec3(uResolution, 1.0)
#define iMouse vec4(uMouse, 0.0, 0.0)
${frag}\`,
});
// Each frame: uniforms.uTime.value = clock.getElapsedTime();`, 'ShaderMaterial code copied');
    }
    presetSel.addEventListener('change', () => { if (presetSel.value) { editor.setValue(ThreeData.SHADERS[presetSel.value]); store.set('three.shader', editor.value); apply(); presetSel.value = ''; } });
    editor.setValue(store.get('three.shader', ThreeData.SHADERS['Gradient + time']));
    apply();
    api.openShader = (code) => { editor.setValue(code); store.set('three.shader', code); apply(); };
  }

  // ---------- Textures tab ----------
  function textureTab(pane) {
    const list = el('div', { class: 'tex-cards' });
    const intro = el('div', { class: 'drop-hint', text: 'Drop images here (or Open…) to check sizes, power-of-two, alpha and GPU memory, and to resize them for three.js.' });
    pane.append(el('div', { class: 'three-toolbar' },
      el('button', { class: 'ghost small', text: 'Open images…', on: { click: async () => { for (const p of await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }] })) inspect({ name: p.split(/[\\/]/).pop(), url: `file:///${p.replace(/\\/g, '/')}`, path: p }); } } }),
      el('button', { class: 'ghost small', text: 'Clear', on: { click: () => list.replaceChildren() } })), intro, list);
    dropZone(pane, (files) => files.filter((f) => f.type.startsWith('image/')).forEach((f) => inspect({ name: f.name, url: URL.createObjectURL(f), size: f.size, path: window.hub.pathForFile(f) })), { hint: 'Drop images to inspect' });
    const pot = (n) => (n & (n - 1)) === 0;
    const nearestPot = (n) => 2 ** Math.round(Math.log2(n));
    async function inspect({ name, url, size, path }) {
      intro.hidden = true;
      const img = new Image();
      img.src = url;
      await img.decode().catch(() => null);
      if (!img.naturalWidth) { toast(`Couldn't read ${name}`, { type: 'error' }); return; }
      const w = img.naturalWidth; const h = img.naturalHeight;
      if (size == null && path) size = (await window.hub.fs.stat(path))?.size;
      // Alpha check on a downscaled copy.
      const c = document.createElement('canvas');
      c.width = Math.min(w, 256); c.height = Math.min(h, 256);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const px = ctx.getImageData(0, 0, c.width, c.height).data;
      let alpha = false;
      for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { alpha = true; break; }
      const gpu = Math.round(w * h * 4 * 1.333);
      const tips = [];
      if (!pot(w) || !pot(h)) tips.push(`Not power-of-two. Nearest POT: ${nearestPot(w)}×${nearestPot(h)}.`);
      if (Math.max(w, h) > 2048) tips.push('Larger than 2048 px; most web scenes don\'t need it (and some phones cap at 4096).');
      if (!alpha && /\.png$/i.test(name) && (size || 0) > 300 * 1024) tips.push('No transparency: a JPG or WebP would be much smaller.');
      if (gpu > 16 * 1048576) tips.push('Uses a lot of GPU memory. KTX2/Basis compression cuts it ~4–8×.');
      if (!tips.length) tips.push('Looks good for three.js.');
      const target = el('select', {}, [4096, 2048, 1024, 512, 256, 128].map((s) => el('option', { value: s, text: `${s}×${s}`, selected: s === Math.min(2048, nearestPot(Math.max(w, h))) })));
      const fmtSel = el('select', {}, el('option', { value: 'png', text: 'PNG' }), el('option', { value: 'jpeg', text: 'JPG', selected: !alpha }), el('option', { value: 'webp', text: 'WebP' }));
      const tileBox = el('input', { type: 'checkbox' });
      const preview = el('div', { class: 'tex-preview', style: { backgroundImage: `url("${url}")` } });
      tileBox.addEventListener('change', () => preview.classList.toggle('tiled', tileBox.checked));
      list.prepend(el('div', { class: 'tex-card' }, preview,
        el('div', { class: 'tex-info' },
          el('b', { text: name }),
          el('div', { class: 'stats-grid' },
            el('div', { class: 'stat' }, el('span', { text: 'Size' }), el('b', { class: pot(w) && pot(h) ? 'ok' : 'warn', text: `${w}×${h}` })),
            el('div', { class: 'stat' }, el('span', { text: 'File' }), el('b', { text: size ? fmtBytes(size) : '?' })),
            el('div', { class: 'stat' }, el('span', { text: 'Alpha' }), el('b', { text: alpha ? 'yes' : 'no' })),
            el('div', { class: 'stat' }, el('span', { text: 'GPU (RGBA + mips)' }), el('b', { text: fmtBytes(gpu) }))),
          el('ul', { class: 'issues' }, tips.map((t) => el('li', { class: tips[0] === 'Looks good for three.js.' ? 'ok' : 'info', text: t }))),
          el('div', { class: 'row' }, el('label', { class: 'check small' }, tileBox, 'Tile preview'), 'Resize to', target, fmtSel,
            el('button', { class: 'ghost small', text: 'Save resized…', on: { click: () => resize(img, name, Number(target.value), fmtSel.value) } })))));
    }
    function resize(img, name, maxSide, format) {
      const scale = maxSide / Math.max(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas');
      // Keep aspect, snapping each side to a power of two.
      c.width = 2 ** Math.round(Math.log2(Math.max(1, img.naturalWidth * scale)));
      c.height = 2 ** Math.round(Math.log2(Math.max(1, img.naturalHeight * scale)));
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const ext = format === 'jpeg' ? 'jpg' : format;
      const dataUrl = c.toDataURL(`image/${format}`, 0.9);
      window.hub.saveFile({ defaultPath: `${name.replace(/\.\w+$/, '')}_${c.width}x${c.height}.${ext}`, filters: [{ name: 'Image', extensions: [ext] }], content: dataUrl.split(',')[1], base64: true })
        .then((p) => p && toast(`Saved ${c.width}×${c.height} ${ext.toUpperCase()}`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } }));
    }
  }

  // ---------- Docs tab ----------
  function docsTab(pane) {
    const search = el('input', { type: 'search', placeholder: 'Search three.js classes (e.g. MeshStandardMaterial)…' });
    const list = el('div', { class: 'docs-list' });
    const webHost = el('div', { class: 'docs-web' });
    pane.append(el('div', { class: 'docs-layout' }, el('div', { class: 'docs-side' }, search,
      el('div', { class: 'row' },
        el('button', { class: 'ghost small', text: 'Manual', on: { click: () => web.view.loadURL('https://threejs.org/manual/') } }),
        el('button', { class: 'ghost small', text: 'Examples', on: { click: () => web.view.loadURL('https://threejs.org/examples/') } }),
        el('button', { class: 'ghost small', text: 'Forum', on: { click: () => web.view.loadURL('https://discourse.threejs.org/') } })),
      list), webHost));
    const web = WebPane(webHost, { url: 'https://threejs.org/docs/', partition: 'persist:threedocs', zoomKey: 'threedocs' });
    let classes = [];
    const render = () => {
      const q = search.value.trim().toLowerCase();
      const hits = classes.filter((c) => c.toLowerCase().includes(q)).sort((a, b) => (a.toLowerCase().startsWith(q) ? -1 : 0) - (b.toLowerCase().startsWith(q) ? -1 : 0)).slice(0, 300);
      list.replaceChildren(...hits.map((c) => el('button', { class: 'docs-item', text: c, on: { click: () => web.view.loadURL(`https://threejs.org/docs/${c}.html`) } })));
    };
    search.addEventListener('input', render);
    search.addEventListener('keydown', (e) => { if (e.key === 'Enter') list.querySelector('button')?.click(); });
    (async () => {
      const cached = store.get('three.docsIndex', null);
      if (cached && Date.now() - cached.at < 7 * 864e5) classes = cached.classes;
      else {
        try {
          const html = await window.hub.fetchText('https://threejs.org/docs/');
          classes = [...new Set([...html.matchAll(/<a href="([A-Za-z0-9_]+)\.html">\1<\/a>/g)].map((m) => m[1]))].sort();
          store.set('three.docsIndex', { at: Date.now(), classes });
        } catch (err) { list.append(el('p', { class: 'hint', text: `Couldn't load the class list: ${err.message}` })); }
      }
      render();
    })();
  }

  Tools.define({
    id: 'three', name: 'Three.js Lab', icon: '◭', color: '#4f8cff',
    description: 'Live sketches, model viewer, shaders, textures and docs',
    mount(body) {
      tabs = Tabs(body, [
        { id: 'sketch', label: 'Sketch', render: sketchTab },
        { id: 'models', label: 'Model viewer', render: modelTab },
        { id: 'shader', label: 'Shader playground', render: shaderTab },
        { id: 'textures', label: 'Textures', render: textureTab },
        { id: 'docs', label: 'Docs', render: docsTab },
        { id: 'color', label: 'Color', render: (p) => Kit.colorTool(p) },
        { id: 'easing', label: 'Easing', render: (p) => Kit.easingTool(p) },
      ], { storeKey: 'three.tab' });
    },
    commands: [
      { label: 'New three.js sketch', run: () => { tabs?.show('sketch'); } },
      { label: 'Open a 3D model', run: () => { tabs?.show('models'); setTimeout(() => api.openModel?.(), 100); } },
      { label: 'Shader playground', run: () => tabs?.show('shader') },
      { label: 'Inspect textures', run: () => tabs?.show('textures') },
      { label: 'three.js docs', run: () => tabs?.show('docs') },
      { label: 'Color converter', run: () => tabs?.show('color') },
      { label: 'Easing curve editor', run: () => tabs?.show('easing') },
    ],
  });

  // Entry points used by chat code blocks.
  function ensureOpen(tab) {
    activate('tool:three');
    tabs?.show(tab);
  }

  // Tools for the Three Director (Claude). Calls switch the Lab to the Sketch tab so the user sees the result.
  async function handleTool(tool, args) {
    if (!tabs) Tools.shown(Tools.get('three')); // load the Lab in the background if needed
    if (!tabs) return { ok: false, error: 'Three.js Lab could not be loaded.' };
    tabs.show('sketch');
    // A hidden view renders no frames, so let the Lab render (behind the current view) while the director works.
    const surface = H.surfaces.get('tool:three')?.el;
    surface?.classList.add('capturing');
    try { return await directorCall(tool, args); } finally { surface?.classList.remove('capturing'); }
  }
  async function directorCall(tool, args) {
    for (let i = 0; i < 100 && !api.director; i += 1) await new Promise((r) => setTimeout(r, 100));
    const d = api.director;
    if (!d) return { ok: false, error: 'The sketch editor did not load.' };
    if (tool === 'three_get_code') return { ok: true, value: d.getCode() };
    if (tool === 'three_set_code') {
      if (!String(args.code || '').trim()) return { ok: false, error: 'No code given.' };
      toast('Three Director updated the sketch', { timeout: 1500 });
      return { ok: true, value: await d.setCode(String(args.code), Number(args.wait) || 2.5) };
    }
    if (tool === 'three_new_sketch') {
      toast(`Three Director made "${args.name}"`, { timeout: 1500 });
      return { ok: true, value: await d.newSketch(String(args.name || 'Untitled'), String(args.code || ''), Number(args.wait) || 2.5) };
    }
    if (tool === 'three_console') return { ok: true, value: d.report() };
    if (tool === 'three_media_info') return { ok: true, value: d.media.info() };
    if (tool === 'three_load_media') {
      const r = await d.media.load(String(args.path || ''));
      if (r.ok) d.assignMedia(String(args.path));
      if (!r.ok) return { ok: false, error: r.error };
      for (let i = 0; i < 240 && d.media.info().analysis === 'still analyzing'; i += 1) await new Promise((res) => setTimeout(res, 250));
      return { ok: true, value: d.media.info() };
    }
    if (tool === 'three_media_control') {
      if (!d.media.loaded) return { ok: false, error: 'No music loaded.' };
      if (args.action === 'loop') {
        if (!d.media.setLoop(args.time == null ? null : Number(args.time), Number(args.end))) return { ok: false, error: 'The user locked the loop points; ask them before changing it.' };
        return { ok: true, value: d.media.info() };
      }
      if (args.action === 'seek' || args.time != null) d.media.seek(Number(args.time) || 0);
      if (args.action === 'play') d.media.toggle(true);
      if (args.action === 'pause') d.media.toggle(false);
      await new Promise((res) => setTimeout(res, 600));
      return { ok: true, value: d.media.info() };
    }
    if (tool === 'three_layers') return { ok: true, value: d.layers() };
    if (tool === 'three_add_layer') {
      toast(`Three Director added a layer${args.name ? ` "${args.name}"` : ''}`, { timeout: 1500 });
      return { ok: true, value: await d.addLayer({ name: args.name, code: args.code, template: args.template, position: args.position, props: args.settings || {} }, Number(args.wait) || 2.5) };
    }
    if (tool === 'three_update_layer') {
      const patch = { ...(args.settings || {}) };
      if (args.code != null) patch.code = args.code;
      if (args.order != null) patch.order = args.order;
      return { ok: true, value: await d.updateLayer(args.layer, patch, Number(args.wait) || (args.code != null ? 2.5 : 0.5)) };
    }
    if (tool === 'three_remove_layer') return { ok: true, value: await d.removeLayer(args.layer) };
    if (tool === 'three_select_layer') return { ok: true, value: d.selectLayer(args.layer) };
    if (tool === 'three_set_frame') {
      if (!ThreeMedia.SIZES.some((x) => x.id === args.size)) return { ok: false, error: `size must be one of ${ThreeMedia.SIZES.map((x) => x.id).join(', ')}` };
      d.setFrame(args.size);
      await new Promise((res) => setTimeout(res, 1500));
      return { ok: true, value: d.report() };
    }
    if (tool === 'three_screenshot') {
      const url = await d.shot();
      if (!url) return { ok: false, error: 'No image: the sketch is not rendering (check three_console for errors).' };
      // Shrink to a JPEG so the image stays light for the model.
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement('canvas');
      const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      return { ok: true, images: [{ data: c.toDataURL('image/jpeg', 0.85).split(',')[1], mime: 'image/jpeg' }], value: `Screenshot of "${d.getCode().sketch}" (${c.width}×${c.height}).` };
    }
    return { ok: false, error: `Unknown tool ${tool}` };
  }
  HubBridge.register(['three_'], handleTool);
  return {
    openCode(code) { ensureOpen('sketch'); setTimeout(() => api.openCode?.(code), 60); },
    openShader(code) { ensureOpen('shader'); setTimeout(() => api.openShader?.(code), 60); },
  };
})();
