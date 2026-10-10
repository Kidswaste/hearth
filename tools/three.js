// Three.js Lab: live sketch sandbox, model viewer/auditor, shader playground, texture inspector,
// docs browser and the shared color/easing kits.
const ThreeLab = (() => {
  const SANDBOX = 'tools/three-sandbox.html';
  let tabs = null;
  const api = {}; // filled by each tab as it mounts
  // "  12| code" for lines a..b (1-based) of a list of lines.
  const numbered = (lines, a, b) => lines.slice(a - 1, b).map((ln, k) => `${String(a + k).padStart(4)}| ${ln}`).join('\n');
  // Small layers: their whole code. Big ones: an outline (functions, classes, top-level names, section comments,
  // tweak() groups) with line numbers, to read in parts with three_read_code.
  const BIG_CODE_LINES = 350;
  function codeOrOutline(code) {
    code = code.replace(/\/\/ @nodes:v1 \{.*\}[ \t]*$/m, '// @nodes:v1 {…} (the node graph this layer is made from: change it with three_nodes)'); // tools/three-nodes.js
    const lines = code.split('\n');
    if (lines.length <= BIG_CODE_LINES) return { code };
    const marks = [];
    lines.forEach((ln, k) => {
      if (/^\s{0,2}(export\s+)?(async\s+)?function\s+\w+|^\s{0,2}class\s+\w+|^\s{0,2}(const|let|var)\s+\w+\s*=\s*(tweak\(|new |\(|async|function|\[|\{)|^\s*\/\/\s*[-=#*]{2,}|^\s*\/\/\s*[A-Z][A-Z ]{3,}|^import |^\s*(renderer|scene|camera)\.\w+\s*\(/.test(ln)) marks.push(`${String(k + 1).padStart(4)}| ${ln.trim().slice(0, 110)}`);
    });
    return {
      outline: marks.slice(0, 220).join('\n'),
      note: `This layer is ${lines.length} lines, so here is its outline with line numbers. Read parts with three_read_code (from / to), find things with three_search_code, and change them with three_edit_code (exact find → replace, or a line range) instead of rewriting the whole layer.`,
    };
  }
  // Colors from a Coolors link (coolors.co/palette/264653-2a9d8f-… or coolors.co/264653-…), a Coolors export
  // (CSS / SCSS / array / JSON, '#rrggbbaa' too) or any list of hex codes → ['#rrggbb', …].
  function parseColors(input) {
    const s = Array.isArray(input) ? input.join(' ') : String(input || '');
    const link = s.match(/coolors\.co\/(?:palette\/)?([0-9a-f]{6}(?:-[0-9a-f]{6})+)/i);
    let raw = link ? link[1].split('-') : [...s.matchAll(/#([0-9a-f]{6})(?:[0-9a-f]{2})?(?![0-9a-f])/gi)].map((m) => m[1]);
    if (!raw.length) raw = [...s.matchAll(/(?<![0-9a-z])([0-9a-f]{6})(?![0-9a-z])/gi)].map((m) => m[1]);
    return [...new Set(raw.map((h) => `#${h.toLowerCase()}`))].slice(0, 12);
  }

  // One iframe per mode; messages from it are routed by `source`.
  // lazy: the first load waits for the first run (the sketch tab runs its sketch right away; loading the page at mount
  // too meant a reload ~0.3 s later, while the first page was still starting, which could leave the preview black)
  // pretty: a reload of a page that shows something (the Lab preview) keeps a picture of it on screen and cross-fades
  // into the new page once its layers have drawn their first frame (never a black flash; see "live" below).
  function sandboxFrame(parent, mode, onMessage, extraParams = () => '', { lazy = false, pretty = false, name = mode } = {}) {
    // No allow-same-origin: sketch code (which may come from a chat) can't reach the hub's APIs.
    const frame = el('iframe', { class: 'three-frame', attrs: { sandbox: 'allow-scripts allow-pointer-lock allow-downloads', allow: 'display-capture; microphone; autoplay' } });
    parent.append(frame);
    // A full reload (a new three.js version, a new pixel ratio, a restart) hides the half-built picture under a cover
    // that fades away once the new scene is up, instead of flashing black (polish.css .scene-cover; with a picture of
    // the scene you had: chat-scenes.css .scene-cover.snap).
    const cover = el('div', { class: 'scene-cover out' });
    parent.append(cover);
    cover.addEventListener('animationend', () => { if (cover.classList.contains('out') && cover.dataset.own) { delete cover.dataset.own; cover.classList.remove('snap'); cover.style.backgroundImage = ''; } });
    let coverT = 0;
    const uncover = () => { clearTimeout(coverT); cover.classList.add('out'); };
    let ready = null;
    let queue = [];
    let nonce = null; // which load of the frame we're waiting for
    let loadedWith = null; // the query the page was loaded with (a new pixel ratio or three.js version needs a new page)
    // 'frame' = the iframe here; 'stage' = the separate Stage window (main.js relays its messages).
    let target = 'frame';
    let stageSize = () => null; // → { width, height } for exact frame sizes (read at every load)
    const deliver = (m) => (target === 'stage' ? window.hub.stageSend(m) : frame.contentWindow.postMessage(m, '*'));
    let coverShot = null; // resolves with the picture the page answered for the cover
    const handle = (data) => {
      if (data?.source !== 'three-sandbox') return;
      if (data.type === 'shot' && data.tag === 'cover') { const fn = coverShot; coverShot = null; fn?.(data.dataUrl); return; }
      if (data.type === 'ready') {
        // A page being replaced by a newer load can still say "ready"; only the current load counts.
        if (data.n && data.n !== nonce) return;
        // the same load saying "ready" twice: the browser restarted the page by itself (its frame was moved in the
        // page), so it is up but empty; the owner runs its content again (data.again)
        if (ready && data.n && ready.n === data.n) data.again = true;
        ready = data; retries = 0;
        // a sketch page uncovers once its layers have drawn (stack-drawn); the others right away
        if (mode !== 'sketch') setTimeout(uncover, 160);
        else { clearTimeout(coverT); coverT = setTimeout(uncover, 2600); }
        for (const m of queue) deliver(m);
        queue = [];
      }
      if (data.type === 'stack-drawn' && ready && !cover.classList.contains('out')) requestAnimationFrame(uncover);
      onMessage(data);
    };
    const listener = (e) => { if (target === 'frame' && e.source === frame.contentWindow) handle(e.data); };
    addEventListener('message', listener);
    const RUNS = /^(run-layers|swap-layers)$/;
    const post = (m) => {
      live.sent(name, m.type);
      if (ready) { deliver(m); return; }
      // a newer whole run replaces the runs still waiting for the page (each would run every layer again)
      if (RUNS.test(m.type)) queue = queue.filter((x) => !RUNS.test(x.type) && x.type !== 'hot-layer' && x.type !== 'remove-layer');
      queue.push(m);
    };
    // Slider moves arrive faster than the picture redraws (several pointer events per frame, more with a fast mouse):
    // only the latest value per slider is sent, once per frame, so the sandbox doesn't run a slider's onChange for
    // values nobody sees. Any other message sends the waiting moves first, so the order stays the same. (The timer is
    // for a hidden window, where frames don't run: the Stage window still shows the picture.)
    const tweaks = new Map(); let tweakRaf = 0; let tweakTimer = 0;
    const flushTweaks = () => {
      cancelAnimationFrame(tweakRaf); clearTimeout(tweakTimer); tweakRaf = 0; tweakTimer = 0;
      const list = [...tweaks.values()]; tweaks.clear();
      for (const m of list) post(m);
    };
    const send = (msg) => {
      const m = { target: 'three-sandbox', ...msg };
      if (m.type === 'tweak') {
        const k = `${m.layer ?? ''}|${m.index}`;
        tweaks.delete(k); tweaks.set(k, m); // re-inserted: a slider moved again goes after the others
        if (!tweakRaf) { tweakRaf = requestAnimationFrame(flushTweaks); tweakTimer = setTimeout(flushTweaks, 50); }
        return;
      }
      if (tweaks.size) flushTweaks();
      post(m);
    };
    // fresh: a brand-new page (the iframe is taken out and put back, the Stage window is recreated), for when a
    // sketch bugs out: hung code, a lost GPU context, stuck audio.
    // A load that never says "ready" (seen when a reload lands while the page before it is still starting: black
    // preview, nothing plays, "not rendering") is retried with a fresh page, twice at most.
    let watchdog = 0; let retries = 0;
    const queryNow = () => `?mode=${mode}&v=${store.get('three.version', ThreeData.VERSIONS[0])}${extraParams()}`;
    const load = (fresh = false) => {
      if (tweaks.size) flushTweaks(); // to the page they were meant for, as before
      const showing = pretty && ready && target === 'frame' && frame.isConnected && frame.checkVisibility?.({ visibilityProperty: true });
      ready = null;
      nonce = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
      clearTimeout(watchdog);
      const mine = nonce;
      live.reload(name);
      watchdog = setTimeout(() => { if (!ready && nonce === mine && target === 'frame' && frame.isConnected && retries < 2) { retries += 1; console.warn(`Lab ${mode} preview didn't start; reloading it (${retries})`); load(true); } }, 10000);
      loadedWith = queryNow();
      const query = `${loadedWith}&n=${nonce}`;
      const sz = target === 'stage' ? stageSize() : null;
      const go = () => {
        if (nonce !== mine) return; // a newer load took over while the picture came
        if (target === 'stage') window.hub.stageOpen({ query: `${query}${sz ? `&fw=${sz.width}&fh=${sz.height}` : ''}`, width: sz?.width, height: sz?.height, fresh });
        else {
          if (fresh && frame.parentNode) { const p = frame.parentNode; const next = frame.nextSibling; frame.remove(); p.insertBefore(frame, next); }
          frame.src = `${SANDBOX}${query}`;
        }
      };
      const coverUp = (url) => {
        if (target !== 'frame') return;
        if (url) { cover.style.backgroundImage = `url("${url}")`; cover.classList.add('snap'); cover.dataset.own = '1'; }
        cover.classList.remove('out'); clearTimeout(coverT); coverT = setTimeout(uncover, 4000); // never left covered
      };
      // The picture on screen now, as the cover (a quick JPEG from the page itself), then the reload. The old page
      // keeps playing while it answers; a picture that comes too late still goes on the cover if that's still up.
      // (a picture already laid on the cover by the caller, chat-scenes.js switching chats, is used as it is)
      if (showing && cover.classList.contains('snap') && cover.style.backgroundImage) { coverUp(null); go(); } else if (showing) {
        let done = false;
        const finish = (url) => {
          if (done) { if (url && nonce === mine && !cover.classList.contains('out') && !cover.style.backgroundImage) { cover.style.backgroundImage = `url("${url}")`; cover.classList.add('snap'); cover.dataset.own = '1'; } return; }
          done = true; if (nonce === mine) coverUp(url); go();
        };
        coverShot = finish;
        try { deliver({ target: 'three-sandbox', type: 'screenshot', tag: 'cover' }); } catch { finish(null); }
        setTimeout(() => finish(null), 700);
      } else { coverUp(null); go(); }
    };
    let stageWired = false;
    let onStageClosed = null;
    // Run in the Stage window (on) or back here (off). The iframe sleeps while the Stage runs.
    function useStage(on, sizeFn = () => null) {
      if (!stageWired) {
        stageWired = true;
        window.hub.onStageMessage((data) => { if (target === 'stage') handle(data); });
        window.hub.onStageClosed(() => { if (target !== 'stage') return; target = 'frame'; load(); onStageClosed?.(); });
      }
      stageSize = sizeFn;
      if (on) { target = 'stage'; frame.src = 'about:blank'; } else { target = 'frame'; window.hub.stageClose(); }
      load();
    }
    if (!lazy) load();
    return {
      frame, send, reload: (fresh) => load(Boolean(fresh)), useStage,
      set onStageClosed(fn) { onStageClosed = fn; },
      get onStage() { return target === 'stage'; },
      get revision() { return ready?.revision; }, get ready() { return Boolean(ready); },
      // a load is on its way (its runs wait in the queue): no need to load again
      get loading() { return Boolean(nonce) && !ready; },
      // the page was loaded for another three.js version or pixel ratio than the one wanted now
      get stale() { return loadedWith !== queryNow(); },
    };
  }

  // ---------- live: what each change does to the preview ----------
  // Page reloads vs in-place updates of the Lab preview (and the backstage), with why, for dev/checks/live.js and
  // docs/upgrades/live.md (ThreeLab.live.counts()). `why` is the director tool being handled, else 'ui'.
  const live = (() => {
    const c = { reloads: {}, sent: {}, log: [] };
    let why = null;
    const COUNTED = /^(hot-layer|swap-layers|run-layers|remove-layer|layer-props|media-unload)$/;
    const note = (what) => { c.log.push({ at: Date.now(), what, why: why || 'ui' }); if (c.log.length > 200) c.log.splice(0, c.log.length - 200); };
    return {
      reload(name) { c.reloads[name] = (c.reloads[name] || 0) + 1; note(`reload ${name}`); },
      sent(name, type) { if (!COUNTED.test(type)) return; const k = `${name} ${type}`; c.sent[k] = (c.sent[k] || 0) + 1; if (type !== 'layer-props') note(k); },
      set why(v) { why = v; }, get why() { return why; },
      counts: () => JSON.parse(JSON.stringify(c)),
    };
  })();

  // ---------- Sketch tab ----------
  // A sketch is a stack of layers (tools/three-layers.js); a sketch without `layers` is one layer whose
  // code is sketch.code. The editor, sliders and history always show the selected layer.
  const SLOT = 10000; // each layer's slider values live from slot × SLOT in the sandbox
  function sketchTab(pane) {
    let sketches = [];
    let current = null;
    let selId = null; // selected layer
    let soloId = null; // a layer shown alone while you work on it (not saved)
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
    stats.title = 'Click: just fps (or everything again)';
    stats.classList.toggle('compact', store.get('three.statsCompact', false));
    stats.addEventListener('click', () => { const c = !stats.classList.contains('compact'); stats.classList.toggle('compact', c); store.set('three.statsCompact', c); });
    // ?: the Lab's keys in one sheet
    function labKeys() {
      const rows = [['Space', 'Play / pause'], ['T · Shift+T', 'Tap tempo (locks to the song\'s grid) · this tap is the 1 · with live sound: sets the latency'], [', · .', 'Nudge the grid 5 ms earlier / later by ear (Shift 1 ms, Alt 20 ms)'], ['K · S · H', 'Kick / snare / hit marker at the playhead'], ['Q', 'Quantize taps to the grid on / off'], ['C', 'Cue here'], ['1–9', 'Jump to cue'],
        ['R · Shift+R', 'Shuffle the sliders · the shuffle before'], ['Ctrl+S · Ctrl+Shift+S', 'Save the sliders · as a look'], ['/', 'Find a slider'],
        ['F · \\', 'Freeze the picture'], ['.', 'One frame (while frozen)'], ['|', 'Pin this frame to compare (onion / wipe)'], ['Shift+1–5', 'Fit · 9:16 · 16:9 · 4:5 · 1:1'],
        ['Shift+L', 'Live sound on / off'], ['O', 'Your sketches'], ['`', 'Console'], ['P · Shift+F', 'Present · Focus'], ['I · PgUp / PgDn', 'In Present: info · other sketches'],
        ['Shift+drag the waveform', 'Draw a loop'], ['= · - · 0', 'Zoom in · out · whole song'], ['[ · ]', 'Loop start / end'], ['Home · End', 'Start / end (of the loop)'], ['M', 'Mute the music (the sketch still reacts)'], ['A', 'Show every automation curve'], ['L', 'Loop this bar'], ['G', 'Next snap setting'],
        ['N', 'Note with a screenshot'], ['W', 'Write mode'], ['E', 'Edit the scene'],
        ['Alt+1–9', 'Hide / show a layer'], ['Alt+Shift+1–9', 'Only that layer'], ['Ctrl+R · Ctrl+Shift+Enter', 'Restart the simulation'], ['Ctrl+Z', 'Undo (timeline)'], ['Esc', 'Deselect, forget taps, leave Present']];
      // with video footage on the timeline its frame keys come first (tools/three-frames.js)
      if (typeof ThreeFrames !== 'undefined' && ThreeFrames.on) rows.unshift(...ThreeFrames.KEYS.map(([k, v]) => [k, `Footage: ${v}`]));
      const d = el('dialog', { class: 'lab-keys' }, el('h2', { text: 'Lab keys' }), el('div', { class: 'lab-keys-grid' }, rows.flatMap(([k, v]) => [el('kbd', { text: k }), el('span', { text: v })])),
        el('div', { class: 'dialog-actions' }, el('button', { class: 'primary', text: 'Got it', on: { click: () => d.close() } })));
      d.addEventListener('close', () => d.remove());
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
      document.body.append(d); d.showModal();
    }
    let split = null;
    const btn = (text, title, fn, cls = 'ghost small') => el('button', { class: cls, text, title, on: { click: fn } });
    const runBtn = btn('▶ Run', 'Run every layer again from the start (Ctrl+Enter) · Shift+click: restart from scratch', (e) => (e.shiftKey ? restartSim() : run()), 'primary small');
    runBtn.dataset.key = 'Ctrl+Enter';
    const restartBtn = btn('⟲', 'Restart from scratch: a fresh page, GPU and sound, for when something bugs out (Ctrl+Shift+Enter)', () => restartSim(), 'ghost small');
    restartBtn.dataset.feature = 'Restart simulation';
    restartBtn.dataset.key = 'Ctrl+R';
    const liveLabel = el('label', { class: 'check small', title: 'Apply code changes live, a moment after you stop typing' }, autoBox, 'Live code');
    const newBtn = btn('New', 'New sketch from a template · right-click: the templates as a list', () => templateGallery(), 'ghost small imp-main');
    newBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); ThreeTweaks.menu(e.clientX, e.clientY, ['New sketch from', ...ThreeData.TEMPLATES.map((t) => [t.name, t.desc || '', () => create(t.name, t.code)]), ['Duplicate this one', current?.name || '', () => duplicate()]]); });
    // Less frequent sketch actions live in a menu (they used to take a whole toolbar row).
    const sketchMenuBtn = btn('Sketch ▾', 'Rename, duplicate, delete, history, export', (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      popup(r.left, r.bottom + 4, [
        ['New from a template…', 'Right-click it for the list', () => templateGallery()],
        ['▦ All your sketches', 'As pictures', () => browseSketches()],
        'This sketch',
        ['Rename…', current?.name || '', () => renameSketch()],
        ['Duplicate', 'A copy you can change freely', () => duplicate()],
        ['History…', 'Earlier versions of the selected layer, and deleted sketches', () => historyDialog()],
        ['Copy all the code', 'Every layer, one after the other, to the clipboard', () => { navigator.clipboard.writeText(layersOf().map((L) => `// ===== ${L.name} =====\n${L.code}`).join('\n\n')); toast('Code copied', { timeout: 1200 }); }],
        ['Cycle looks…', lookCycle ? `Now: every ${lookCycle} bar${lookCycle === 1 ? '' : 's'}` : 'Switch between your saved looks every few bars while it plays', () => lookCycleMenu(sketchMenuBtn)],
        ['⟲ Restart from scratch', 'A fresh page, GPU and sound, when something bugs out (Ctrl+Shift+Enter)', () => restartSim()],
        ['Export HTML…', 'A standalone .html file', () => exportHtml()],
        ['Ask Claude about this layer', 'Sends the code and any errors to Claude', () => askAbout()],
        'Careful',
        ['Delete…', 'Moves it to History → deleted sketches', () => removeSketch()],
      ]);
    });
    // ⋯ in the Lab toolbar: the controls you rarely or never use, still one click away (with their old names for usage)
    const labMoreBtn = btn('⋯', 'More: focus, screenshot, snippets, three.js version, live code, frame rate, keys', (e) => { const r = e.currentTarget.getBoundingClientRect(); ThreeTweaks.menu(r.right - 290, r.bottom + 4, labMoreItems()); });
    labMoreBtn.dataset.feature = 'Lab more';
    function labMoreItems() {
      const v = store.get('three.version', ThreeData.VERSIONS[0]);
      // (round 7) six open entries: Capture ›, Console ›, Code › branch into the detail
      return ['View',
        ['⛶ Focus', 'Almost fullscreen · Shift+F (Esc leaves)', () => setFocus(!focusOn), focusOn, 'Focus'],
        ['Capture', 'Screenshot, copy', [
          ['📷 Screenshot', 'Save the picture (all layers) as it shows here', () => { copyNextShot = false; box.send({ type: 'screenshot' }); }, false, 'Screenshot'],
          ['📋 Copy a screenshot', 'To the clipboard', () => { copyNextShot = true; box.send({ type: 'screenshot' }); }],
          ['🎞 Contact sheet', 'Frames across the song', () => showSheet()],
          ...(typeof Capture !== 'undefined' ? [['The capture menu…', 'Social frames, recording, tours · Ctrl/⌘+Alt+S', () => { const r = labMoreBtn.getBoundingClientRect(); Capture.menu(r.right - 300, r.bottom + 4, Capture.mainItems()); }]] : [])]], // (round 8) the Lab reaches the whole capture menu
        ['Console', CONSOLE_MODES.find(([m]) => m === consoleMode)[1], CONSOLE_MODES.map(([m, l]) => [l, '', () => setConsoleMode(m), consoleMode === m])],
        ['Code', `r${v.split('.')[1]}${autoRun ? ' · live' : ''}`, [
          ['Insert snippet…', 'At the cursor in the code', () => snippetMenu(), false, 'Insert snippet'],
          [`three.js version · r${v.split('.')[1]}`, 'Switch and re-run', () => versionMenu(), false, 'three.js version'],
          ['Live code', 'Apply code changes a moment after you stop typing', () => { autoBox.checked = !autoBox.checked; autoBox.dispatchEvent(new Event('change')); }, autoRun]]],
        ['Key hints on hover', 'Little key badges on the main buttons (hold Ctrl for all of them)', () => { const off = !document.body.classList.contains('lab-nohints'); document.body.classList.toggle('lab-nohints', off); store.set('three.keyHints', !off); }, !document.body.classList.contains('lab-nohints')],
        ['Lab keys', '? · the keys button, bottom left', () => (typeof KeysUI !== 'undefined' ? KeysUI.open() : labKeys())],
        ...(typeof Declutter !== 'undefined' ? Declutter.popItems('Lab') : [])]; // (round 8) ends like every menu
      // (copy / export are in Sketch ▾, the frame rate in the preview's ⋯)
    }
    function snippetMenu() {
      const r = labMoreBtn.getBoundingClientRect();
      setCodeVisible(true);
      ThreeTweaks.menu(r.right - 290, r.bottom + 4, ['Insert a snippet at the cursor', ...ThreeData.SNIPPETS.map((sn) => [sn.name, '', () => editor.insertAtCursor(sn.code)])]);
    }
    function versionMenu() {
      const r = labMoreBtn.getBoundingClientRect();
      ThreeTweaks.menu(r.right - 290, r.bottom + 4, ['three.js version', ...ThreeData.VERSIONS.map((vv) => [`r${vv.split('.')[1]}`, vv, () => { version.value = vv; version.dispatchEvent(new Event('change')); }, vv === store.get('three.version', ThreeData.VERSIONS[0])])]);
    }
    document.body.classList.toggle('lab-nohints', store.get('three.keyHints', true) === false);
    // Key hints: hover a main button for a moment and its key shows in a small badge under it.
    const keyHint = el('div', { class: 'lab-keyhint', hidden: true });
    document.body.append(keyHint);
    let hintT = 0;
    document.addEventListener('pointerover', (e) => {
      const b = e.target.closest?.('[data-key]');
      clearTimeout(hintT);
      if (!b || document.body.classList.contains('lab-nohints') || !pane.contains(b)) { keyHint.hidden = true; return; }
      hintT = setTimeout(() => {
        if (!b.isConnected) return;
        const r = b.getBoundingClientRect();
        keyHint.textContent = b.dataset.key; keyHint.hidden = false;
        const w = keyHint.offsetWidth;
        Object.assign(keyHint.style, { left: `${Math.max(4, Math.min(innerWidth - w - 4, r.left + r.width / 2 - w / 2))}px`, top: `${r.bottom + 26 > innerHeight ? r.top - 22 : r.bottom + 4}px` });
      }, 380);
    });
    addEventListener('pointerdown', () => { clearTimeout(hintT); keyHint.hidden = true; }, true);
    let copyNextShot = false;
    const shotBtn = btn('📷', 'Save a screenshot (all layers) · Shift+click: copy it to the clipboard', (e) => { copyNextShot = e.shiftKey; box.send({ type: 'screenshot' }); }, 'ghost small imp-capture');
    shotBtn.dataset.feature = 'Screenshot';
    const toolbar = el('div', { class: 'three-toolbar' }, runBtn, liveLabel, picker, newBtn, sketchMenuBtn, snippetSel, version, el('span', { class: 'spacer' }), shotBtn);
    // Prompt-first: the code editor stays hidden until asked for.
    const codeBtn = btn('</> Code', 'Show or hide the code of the selected layer (the Three Director writes it for you)', () => setCodeVisible(split.classList.contains('no-code')));
    const slidersBtn = btn('⚡ Sliders', 'Show or hide the layers and the sliders of the selected layer (/ finds a slider)', () => setSlidersVisible(column.hidden));
    slidersBtn.dataset.feature = 'Layers & sliders';
    const focusBtn = btn('⛶ Focus', 'Almost fullscreen: hides the chat, side panels, toolbar, sliders and console, and shrinks the timeline to the strip (F · Esc to leave)', () => setFocus(!focusOn));
    focusBtn.dataset.feature = 'Focus';
    focusBtn.dataset.key = 'Shift+F';
    // The console: always, only with the code (default), or only when you open it. Hidden, it counts new
    // errors and warnings on its button.
    const CONSOLE_MODES = [['always', 'Always show'], ['code', 'Only with the code'], ['never', 'Only when I open it']];
    let consoleMode = store.get('three.consoleMode', 'code');
    let consolePeek = null; // null: follow the mode · true / false: opened / closed by hand
    let unseen = { errors: 0, other: 0 };
    const consoleBtn = btn('Console', 'Show or hide the console (errors and console.log from the sketch)', () => { consolePeek = !consoleShown(); syncConsole(); });
    consoleBtn.dataset.feature = 'Console';
    consoleBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); ThreeTweaks.menu(e.clientX, e.clientY, ['Console shows', ...CONSOLE_MODES.map(([m, l]) => [l, '', () => setConsoleMode(m), consoleMode === m]), ['Errors only', 'Hide console.log lines', () => { const on = !store.get('three.consoleErrors', false); store.set('three.consoleErrors', on); consoleWrap.classList.toggle('errors-only', on); }, store.get('three.consoleErrors', false)], ['Clear', '', () => { consoleBox.replaceChildren(); consoleLines = []; }], ['Copy', '', () => api.cmd.console('copy')]]); });
    consoleBtn.dataset.key = '`';
    const consoleModeSel = el('select', { class: 'tc-mode', title: 'When the console shows' }, CONSOLE_MODES.map(([v, l]) => el('option', { value: v, text: l, selected: v === consoleMode })));
    consoleModeSel.addEventListener('change', () => setConsoleMode(consoleModeSel.value));
    const consoleWrap = el('div', { class: 'three-console-wrap' },
      el('div', { class: 'three-console-head' }, el('b', { text: 'Console' }), consoleModeSel,
        el('label', { class: 'check small', title: 'Hide console.log lines, keep errors and warnings' }, el('input', { type: 'checkbox', checked: store.get('three.consoleErrors', false), on: { change: (e) => { store.set('three.consoleErrors', e.target.checked); consoleWrap.classList.toggle('errors-only', e.target.checked); } } }), 'Errors only'),
        el('span', { class: 'spacer' }),
        btn('Ask director to fix', 'Send the errors to the Three Director and ask it to fix them', () => fixErrors(), 'ghost small imp-ai tc-fix'),
        btn('Copy', 'Copy everything in the console', () => { navigator.clipboard.writeText(consoleLines.map((l) => `${l.layer ? `[${l.layer}] ` : ''}${l.line ? `line ${l.line}: ` : ''}${l.text}`).join('\n')); toast('Console copied', { timeout: 1200 }); }),
        btn('Clear', 'Empty the console', () => { consoleBox.replaceChildren(); consoleLines = []; }),
        btn('✕', 'Hide the console (its button in the toolbar opens it again)', () => { consolePeek = false; syncConsole(); })),
      consoleBox);
    queueMicrotask(() => consoleWrap.classList.toggle('errors-only', store.get('three.consoleErrors', false)));
    function fixErrors() {
      const errs = consoleLines.filter((l) => l.level === 'error' || l.level === 'warn');
      if (!errs.length) { toast('No errors in the console', { timeout: 1200 }); return false; }
      askDirector(`The Lab console shows these ${errs.length === 1 ? 'problems' : `${errs.length} problems`} in "${current?.name}". Find the cause (three_read_code / three_search_code) and fix it with three_edit_code:\n${errs.slice(-12).map((l) => `- ${l.layer ? `[${l.layer}] ` : ''}${l.line ? `line ${l.line}: ` : ''}${l.text}`).join('\n')}`, { send: false });
      return true;
    }
    function consoleShown() { return consolePeek ?? (consoleMode === 'always' || (consoleMode === 'code' && !split?.classList.contains('no-code'))); }
    function setConsoleMode(m) {
      consoleMode = CONSOLE_MODES.some(([v]) => v === m) ? m : 'code';
      store.set('three.consoleMode', consoleMode);
      consoleModeSel.value = consoleMode;
      consolePeek = null;
      syncConsole();
    }
    function syncConsole() {
      const shown = consoleShown();
      consoleWrap.hidden = !shown;
      if (shown) unseen = { errors: 0, other: 0 };
      consoleBtn.classList.toggle('on', shown);
      consoleBtn.classList.toggle('has-errors', !shown && unseen.errors > 0);
      const n = unseen.errors + unseen.other;
      consoleBtn.textContent = !shown && n ? `Console ${unseen.errors ? '●' : '·'} ${n}` : 'Console';
      if (shown) consoleBox.scrollTop = consoleBox.scrollHeight;
    }
    // Present: just the picture, fullscreen (P · Esc). Space, arrows and cue keys still work.
    const presentBtn = btn('▣ Present', 'Fullscreen preview with nothing else on screen, for showing it off or a second monitor (P · Esc to leave)', () => togglePresent());
    presentBtn.dataset.feature = 'Present';
    presentBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); ThreeTweaks.menu(e.clientX, e.clientY, ['Present', ['Present', 'P', () => togglePresent()], player.loaded ? ['From the top of the song', 'Starts it playing', () => { player.seek(0); player.toggle(true); togglePresent(); }] : null, player.loop ? ['The loop', '', () => { player.seek(player.loop.a); player.toggle(true); togglePresent(); }] : null, [`${store.get('three.presentHud', false) ? '✓ ' : ''}Show the info line`, 'I while presenting', () => store.set('three.presentHud', !store.get('three.presentHud', false))], ['Stage window', 'Its own window, for a second monitor', () => setStage(true)]]); });
    previewHost.addEventListener('dblclick', (e) => { if (e.target === previewHost) togglePresent(); }); // double-click beside the picture
    presentBtn.dataset.key = 'P';
    const presentHint = el('div', { class: 'present-hint', text: 'Esc to leave · Space play / pause · F freeze · B blackout · I info · PgUp / PgDn other sketches · 1–9 cues' });
    // Present info (I): the sketch, song time, BPM and frame size in a corner, for live shows and checks
    const presentHud = el('div', { class: 'present-hud', hidden: true });
    // B in Present: fade to black (and back), for live shows
    const blackout = el('div', { class: 'lab-blackout' });
    const setBlackout = (on) => { blackout.classList.toggle('on', on ?? !blackout.classList.contains('on')); return blackout.classList.contains('on'); };
    let hudTimer = 0;
    function setHud(on) {
      presentHud.hidden = !on; store.set('three.presentHud', on);
      clearInterval(hudTimer);
      if (!on) return;
      const paint = () => { const z = stage.size; const sec = player.loaded ? player.sectionAt() : null; presentHud.textContent = `${sec?.cue ? `${sec.cue} · ` : ''}${current?.name || ''} · ${z.id === 'fit' ? `${z.width}×${z.height}` : `${z.id} ${z.width}×${z.height}`}${typeof ThreeFrames !== 'undefined' && ThreeFrames.on ? ` · ${ThreeFrames._pure.tc(ThreeFrames.clock, ThreeFrames.frame)} · f${ThreeFrames.frame}` : player.loaded ? ` · ${fmtClock(player.time)} / ${fmtClock(player.duration)}${player.isClock ? ` · f${player.clock.frame}` : ` · ${Math.round(player.bpm)} BPM`}` : ''}${liveKind ? ` · live ${liveBpm?.bpm ? `${Math.round(liveBpm.bpm)} BPM` : ''}` : ''}${lastStats ? ` · ${lastStats.fps} fps` : ''}${frozenNow ? ' · ❚❚' : ''}`; };
      paint(); hudTimer = setInterval(paint, 250);
    }
    // PgUp / PgDn in Present: the previous / next sketch (most recent first, like the picker)
    function stepSketch(d) {
      const list = [...sketches].sort((a, b) => b.updatedAt - a.updatedAt);
      const i = list.findIndex((x) => x.id === current?.id);
      const next = list[(i + d + list.length) % list.length];
      if (next && next.id !== current?.id) { openSketch(next.id); toast(next.name, { timeout: 1000 }); }
    }
    // ---------- live sound + what's playing (Spotify, YouTube, Suno… anything with media controls) ----------
    // Live: the sketch hears the computer's sound (or a mic) instead of a loaded song; recordings include it.
    // Now playing: title / artist / cover / position of Spotify (or the current media app), with ⏮ ⏯ ⏭.
    let liveKind = null;
    let np = null;
    let liveBpm = null;
    const liveOpts = () => ({ auto: true, sense: 1, followCover: false, ...store.get('three.live', {}) });
    const setLiveOpt = (patch) => { store.set('three.live', { ...liveOpts(), ...patch }); sendLiveGain(); };
    const sendLiveGain = () => { const o = liveOpts(); box.send({ type: 'live-gain', auto: o.auto, sense: o.sense }); };
    // ⚡ Triggers: which sounds fire audio.kick / bass / snare / hats / hit, set on an EQ-style view of the sound.
    let trigCfg = ThreeTriggers.merge(store.get('three.triggers', null));
    let trigTuned = store.get('three.triggers', null) != null;
    let trigPanel = null;
    const sendTriggers = () => box.send({ type: 'triggers-set', cfg: trigCfg });
    // Each song keeps its own bars (songs differ a lot); the last ones you set are the default for new songs.
    const saveTriggers = debounce(() => {
      store.set('three.triggers', trigCfg);
      if (player.path) store.set('three.triggersBySong', { ...store.get('three.triggersBySong', {}), [player.path]: trigCfg });
    }, 400);
    function songTriggers() {
      const saved = player.path && store.get('three.triggersBySong', {})[player.path];
      if (!saved) return;
      trigCfg = ThreeTriggers.merge(saved); trigTuned = true;
      sendTriggers(); trigPanel?.set(trigCfg);
    }
    const trigBtn = btn('⚡ Triggers', 'What fires the sketch\'s kick / bass / snare / hats / hit: a band of the sound and the bar it must reach', () => toggleTriggers());
    trigBtn.dataset.feature = 'Triggers';
    // The trigger presets and Auto bars, one click from the timeline (you used them more than the panel itself)
    const trigPresetBtn = btn('Presets ▾', 'Trigger presets for a style of music (your bars stay and are re-fitted), your own saved ones, or another song\'s setup', (e) => trigPresetMenu(e.currentTarget), 'ghost small mb-quick');
    trigPresetBtn.dataset.feature = 'Presets';
    const autoBarsBtn = btn('Auto bars', 'Fit every trigger bar to the last few seconds of sound (opens ⚡ Triggers for a moment if it\'s closed)', () => autoBars(), 'ghost small mb-quick');
    autoBarsBtn.dataset.feature = 'Auto bars';
    const trigPresets = () => ({ ...(ThreeTriggers.PRESETS || {}) });
    function applyTrigPreset(name, { quiet = false } = {}) {
      const saved = store.get('three.trigPresets', []).find((x) => x.name.toLowerCase() === String(name).toLowerCase());
      if (saved) { trigCfg = ThreeTriggers.merge(saved.cfg); trigTuned = true; sendTriggers(); saveTriggers(); trigPanel?.set(trigCfg); toast(`Triggers: ${saved.name}`, { timeout: 1400 }); return saved.name; }
      const all = trigPresets();
      const key = Object.keys(all).find((k) => k.toLowerCase() === String(name).toLowerCase()) || Object.keys(all).find((k) => k.toLowerCase().includes(String(name).toLowerCase()));
      if (!key) return null;
      setTriggers(Object.fromEntries(Object.entries(all[key]).map(([id, p]) => [id, { ...p }])));
      if (typeof ThreeMusic !== 'undefined') ThreeMusic.presetPicked(key);
      if (!quiet) toast(`Triggers: ${key} (bars kept · Auto bars fits them to the sound)`, { timeout: 2000 });
      return key;
    }
    function trigPresetMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      const saved = store.get('three.trigPresets', []);
      const songs = Object.entries(store.get('three.triggersBySong', {})).filter(([p0]) => p0 !== player.path).slice(0, 8);
      const mp = typeof ThreeMusic !== 'undefined' ? ThreeMusic.presetInfo() : null; // the pick from the song (tools/three-music.js)
      ThreeTweaks.menu(r.left, r.bottom + 4, ['Trigger presets', mp?.guess ? [`✦ From the song: ${mp.guess.preset}`, mp.guess.why, () => ThreeMusic.autoPreset({ force: true })] : null, ...Object.keys(trigPresets()).map((n) => [`${mp?.current === n ? '● ' : ''}${n}`, 'Bands and timing · your bars stay', () => applyTrigPreset(n)]),
        saved.length ? 'Yours' : null, ...saved.map((x) => [`★ ${x.name}`, 'Bands and bars', () => applyTrigPreset(x.name)]),
        songs.length ? 'From another song' : null, ...songs.map(([p0, c]) => [`♪ ${p0.split(/[\\/]/).pop()}`, '', () => { trigCfg = ThreeTriggers.merge(c); trigTuned = true; sendTriggers(); saveTriggers(); trigPanel?.set(trigCfg); }]),
        ['Auto bars', 'Fit the bars to the sound', () => autoBars()], ['⚡ Open the triggers', 'Bands, bars, fade, sensitivity', () => toggleTriggers(true)]]);
    }
    async function autoBars() {
      if (trigPanel?.autoBars) { const n = trigPanel.autoBars(); toast(n ? `Auto bars: ${n} bars fitted to the sound` : 'Play some sound first (a few seconds), then Auto bars', { timeout: 1800 }); return n; }
      const wasOpen = Boolean(trigPanel);
      toggleTriggers(true);
      toast('Listening for 3 s to fit the bars…', { timeout: 2600 });
      await new Promise((r) => setTimeout(r, 3200));
      const n = trigPanel?.autoBars?.() || 0;
      toast(n ? `Auto bars: ${n} bars fitted` : 'No sound came in: play the song (or live sound) and try again', { timeout: 2000 });
      if (!wasOpen) setTimeout(() => toggleTriggers(false), 600);
      return n;
    }
    function toggleTriggers(on = !trigPanel) {
      trigPanel?.destroy(); trigPanel = null;
      trigBtn.classList.toggle('on', on);
      box.send({ type: 'trig-watch', on });
      if (!on) return;
      trigPanel = ThreeTriggers.panel({
        cfg: trigCfg,
        untuned: !trigTuned,
        onChange: (c) => { trigCfg = c; trigTuned = true; sendTriggers(); saveTriggers(); },
        onClose: () => toggleTriggers(false),
        onWrite: async (cfg, b) => {
          if (!player.loaded) { toast('Load a song first: the triggers are written as markers on its timeline', { type: 'error' }); return; }
          b.disabled = true; const label = b.textContent; b.textContent = 'Scanning…';
          try {
            const r = await player.writeTriggers(cfg, { onProgress: (p) => { b.textContent = `Scanning ${Math.round(p * 100)}%`; } });
            const parts = Object.entries(r.counts).map(([id, n]) => `${n} ${id === 'bass' ? 'bass hit' : id === 'hats' ? 'hat' : id}${n === 1 ? '' : 's'}`);
            toast(`Wrote ${parts.join(', ')} on the ${r.range === 'loop' ? 'loop' : 'whole song'} (↶ to undo). These markers now drive the sketch.`, { timeout: 4500 });
          } catch (err) { toast(err.message, { type: 'error' }); } finally { b.disabled = false; b.textContent = label; }
        },
        sense: () => (liveKind ? liveOpts() : null),
        onSense: (p) => setLiveOpt(p),
      });
      player.el.querySelector('.mb-main').after(trigPanel.el);
    }
    function setTriggers(patch) {
      const next = { ...trigCfg };
      for (const [k, v] of Object.entries(patch || {})) if (next[k]) next[k] = { ...next[k], ...v };
      trigCfg = ThreeTriggers.merge(next);
      sendTriggers(); saveTriggers(); trigPanel?.set(trigCfg);
      return trigCfg;
    }
    // The preview iframe is isolated (no access to the hub) and browsers don't let isolated pages capture
    // sound, so for it this page captures and sends the analysis ~60 times a second. The Stage window
    // captures by itself (and its recordings include the sound).
    // Input gain (×0.5…×4) and a latency offset (the sketch reacts N ms later, to line up with a speaker or a
    // Bluetooth delay) apply here; the input picker chooses which microphone / line-in.
    const hubLive = { stream: null, ctx: null, analyser: null, timer: 0, gain: null, queue: [] };
    const liveIo = () => ({ gain: 'auto', latency: 0, device: '', ...store.get('three.liveIo', {}) });
    function setLiveIo(patch) {
      store.set('three.liveIo', { ...liveIo(), ...patch });
      if (hubLive.gain && patch.gain != null && patch.gain !== 'auto') hubLive.gain.gain.value = Number(patch.gain) || 1;
      if (patch.device != null && liveKind === 'mic') setLive('mic');
      return liveIo();
    }
    window.__labLiveStart = async (kind) => {
      try {
        hubLiveStop();
        const io = liveIo();
        const stream = kind === 'system'
          ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          : await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...(io.device ? { deviceId: { exact: io.device } } : {}) } });
        for (const tr of stream.getVideoTracks()) tr.stop();
        if (!stream.getAudioTracks().length) throw new Error(kind === 'system' ? 'No system sound was shared' : 'No microphone');
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048; analyser.smoothingTimeConstant = 0.6;
        const gain = ctx.createGain(); gain.gain.value = typeof io.gain === 'number' ? io.gain : 1;
        ctx.createMediaStreamSource(stream).connect(gain).connect(analyser);
        Object.assign(hubLive, { stream, ctx, analyser, gain, queue: [], lvl: 0, agcAt: 0, auto: 1 });
        box.send({ type: 'live-remote', on: true, kind });
        const f = new Uint8Array(1024); const w = new Float32Array(2048);
        hubLive.timer = setInterval(() => {
          analyser.getByteFrequencyData(f); analyser.getFloatTimeDomainData(w);
          // auto gain (the default): quiet or loud playback reaches the sketch and the triggers at about the same
          // level; it follows a louder part fast and a quieter one slowly, and holds through silence
          if (liveIo().gain === 'auto') {
            let ss = 0; for (let i = 0; i < w.length; i += 4) ss += w[i] * w[i];
            const rms = Math.sqrt(ss / (w.length / 4)) / (gain.gain.value || 1);
            hubLive.lvl += (rms - hubLive.lvl) * (rms > hubLive.lvl ? 0.2 : 0.01);
            const tA = performance.now();
            if (tA - hubLive.agcAt > 250 && hubLive.lvl > 0.002) { hubLive.agcAt = tA; hubLive.auto = Math.max(0.5, Math.min(8, 0.12 / hubLive.lvl)); gain.gain.setTargetAtTime(hubLive.auto, ctx.currentTime, 0.6); }
          }
          const frame = { type: 'live-frame', freq: f.slice(), wave: w.slice(), rate: ctx.sampleRate };
          const lat = liveIo().latency || 0;
          if (!lat) { box.send(frame); return; }
          const tNow = performance.now();
          hubLive.queue.push([tNow, frame]);
          while (hubLive.queue.length && tNow - hubLive.queue[0][0] >= lat) box.send(hubLive.queue.shift()[1]);
          if (hubLive.queue.length > 120) hubLive.queue.splice(0, hubLive.queue.length - 120);
        }, 16);
        return true;
      } catch (err) { toast(`Live sound: ${err.message}`, { type: 'error', timeout: 5000 }); return false; }
    };
    function hubLiveStop() {
      clearInterval(hubLive.timer);
      for (const tr of hubLive.stream?.getTracks() || []) tr.stop();
      hubLive.ctx?.close();
      Object.assign(hubLive, { stream: null, ctx: null, analyser: null, timer: 0, gain: null, queue: [] });
    }
    const liveBtn = btn('🎧 Live ▾', 'Make the sketch react to what your computer plays (Spotify, YouTube…) or a microphone, and see what\'s playing', (e) => liveMenu(e.currentTarget));
    liveBtn.dataset.feature = 'Live sound';
    liveBtn.dataset.key = 'Shift+L';
    liveBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); setLive(liveKind ? null : store.get('three.lastLive', /Mac/.test(navigator.platform) ? 'mic' : 'system')); }); // right-click: straight on / off
    const npBox = el('span', { class: 'np-box', hidden: true });
    function liveMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      const isWin = !/Mac/.test(navigator.platform);
      const o = liveOpts();
      popup(r.left, r.bottom + 4, [
        'Make the sketch react to',
        isWin ? ['System sound', 'Whatever plays on this PC: Spotify, YouTube, Suno…', () => setLive('system'), liveKind === 'system'] : null,
        ['Microphone', 'A mic or line-in', () => setLive('mic'), liveKind === 'mic'],
        liveKind ? ['Off: back to the loaded song', '', () => setLive(null)] : null,
        ['⚡ Triggers & sensitivity…', 'What fires kick / bass / snare / hats / hit, and how strongly the sketch reacts', () => toggleTriggers(true)],
        'Input',
        ['Microphone / line-in…', liveIo().device ? 'A chosen input' : 'The default input', () => inputMenu(anchor)],
        ['Gain', `${liveIo().gain === 'auto' ? `Auto${hubLive.gain ? ` (×${Math.round((hubLive.auto || 1) * 10) / 10} now)` : ''}` : `×${liveIo().gain}`} · how loud the sketch hears it (in the Lab preview)`, () => popup(r.left, r.bottom + 4, ['Gain', ['Auto', 'Keeps the level steady, quiet or loud', () => setLiveIo({ gain: 'auto' }), liveIo().gain === 'auto'], ...[0.5, 1, 1.5, 2, 3, 4].map((g) => [`×${g}`, g === 1 ? 'as it comes' : g < 1 ? 'quieter' : 'louder', () => setLiveIo({ gain: g }), liveIo().gain === g])])],
        ['Latency offset', `${liveIo().latency} ms · the sketch reacts later, to line up with what you hear`, () => popup(r.left, r.bottom + 4, ['Latency offset', ...[0, 20, 40, 60, 80, 120, 160, 200, 300].map((ms) => [`${ms} ms`, ms ? `for a speaker / Bluetooth delay` : 'none', () => setLiveIo({ latency: ms }), liveIo().latency === ms])])],
        liveKind ? ['Restart live sound', 'Capture again (after changing devices)', () => setLive(liveKind)] : null,
        'Now playing',
        [np ? 'Hide what\'s playing' : 'Show what Spotify plays', 'Title, cover and ⏮ ⏯ ⏭ here, no Spotify login (also works with other players)', () => (np ? stopNowPlaying() : startNowPlaying())],
        ['Palette follows the cover', 'Each new song sets the sketch palette from its album cover', () => { setLiveOpt({ followCover: !o.followCover }); if (!o.followCover && np?.cover) coverTo('palette'); }, o.followCover],
      ]);
    }
    async function inputMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      let devs = [];
      try { devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput'); } catch { /* none */ }
      const cur = liveIo().device;
      popup(r.left, r.bottom + 4, ['Microphone / line-in', ['Default input', 'What the system uses', () => setLiveIo({ device: '' }), !cur],
        ...devs.filter((d) => d.deviceId && d.deviceId !== 'default').map((d, k) => [d.label || `Input ${k + 1}`, d.label ? '' : 'names show after the first capture', () => setLiveIo({ device: d.deviceId }), d.deviceId === cur])]);
    }
    async function setLive(kind) {
      if (!kind) { liveKind = null; hubLiveStop(); box.send({ type: 'live-stop' }); paintLive(); trigPanel?.refreshSense(); if (typeof ThreeMusic !== 'undefined') ThreeMusic.liveTempo(null); return; }
      liveKind = kind; liveBpm = null;
      store.set('three.lastLive', kind);
      if (player.playing) player.toggle(false); // the song would play over it
      sendLiveGain();
      const ok = await window.hub.liveStart(kind);
      if (!ok) { liveKind = null; paintLive(); return; } // the sketch reports why (live-state)
      paintLive(); trigPanel?.refreshSense();
      if (kind === 'system' && !np) startNowPlaying();
    }
    function paintLive() {
      liveBtn.textContent = liveKind ? `● Live: ${liveKind === 'system' ? 'system sound' : 'mic'}${liveBpm ? ` · ${Math.round(liveBpm.bpm)} BPM${liveBpm.locked ? '' : '?'}` : ''} ▾` : '🎧 Live ▾';
      liveBtn.title = liveKind ? `Live sound${liveBpm ? `: about ${liveBpm.bpm} BPM, found from the kicks${liveBpm.locked ? ' (audio.beat / beatPhase follow it)' : ' (still listening)'}` : ''}. Click for sensitivity or to stop.` : 'Make the sketch react to what your computer plays (Spotify, YouTube…) or a microphone, and see what\'s playing';
      liveBtn.classList.toggle('live-on', Boolean(liveKind));
    }
    function startNowPlaying() {
      np = {};
      window.hub.npStart();
      npBox.hidden = false;
      npBox.replaceChildren(el('span', { class: 'np-wait', text: 'Waiting for Spotify / a player…' }));
    }
    function stopNowPlaying() { np = null; window.hub.npStop(); npBox.hidden = true; }
    const fmtClock = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
    let npStarted = false;
    function onNowPlaying(info) {
      if (!np) return;
      np = info;
      if (!info.app || !info.title) { npBox.replaceChildren(el('span', { class: 'np-wait', text: 'Nothing playing in Spotify (or another player)' })); return; }
      if (info.coverAt && liveOpts().followCover) setTimeout(() => coverTo('palette', true), 300); // a new song
      if (info.cover) np.coverSrc = /^https?:/.test(info.cover) ? info.cover : `${fileUrl(info.cover)}?t=${info.coverAt || Date.now()}`;
      else np.coverSrc = npBox.querySelector('img')?.src;
      const ctl = (text, title, cmd) => btn(text, title, () => window.hub.npControl(cmd), 'ghost small np-ctl');
      npBox.replaceChildren(
        np.coverSrc ? el('img', { class: 'np-cover', src: np.coverSrc, alt: '' }) : null,
        el('span', { class: 'np-text', title: `${info.title} — ${info.artist}${info.album ? ` (${info.album})` : ''} · ${info.app} · click to copy`, on: { click: () => { navigator.clipboard.writeText(`${info.title} — ${info.artist || ''}`); toast('Copied the song name', { timeout: 1000 }); } } }, el('b', { text: info.title }), ` — ${info.artist || ''}`),
        el('span', { class: 'np-time', text: info.duration ? `${fmtClock(info.position || 0)} / ${fmtClock(info.duration)}` : '' }),
        ctl('⏮', 'Previous', 'prev'), ctl(info.playing ? '⏸' : '▶', 'Play / pause', 'toggle'), ctl('⏭', 'Next', 'next'),
        btn('🎨', 'Palette from the cover', () => coverTo('palette'), 'ghost small np-extra'), btn('🖼', 'Add the cover to this sketch\'s references', () => coverTo('ref'), 'ghost small np-extra'));
    }
    async function coverFile() {
      const src = np?.cover;
      if (!src) throw new Error('No cover yet');
      if (!/^https?:/.test(src)) return src;
      const buf = new Uint8Array(await (await fetch(src)).arrayBuffer());
      let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return window.hub.saveAttachment('cover.jpg', btoa(bin));
    }
    async function coverTo(what, quiet) {
      try {
        const f = await coverFile();
        if (what === 'palette') { const cols = await paletteFrom(f); setPalette(cols); toast(`Palette from "${np.title}": ${cols.join(' ')}`, { timeout: quiet ? 1400 : 2500 }); }
        else { const r = await addRef(f, { key: `${np.title || 'cover'} cover` }); toast(`Cover added to references as "${r.key}"`, { timeout: 2500 }); }
      } catch (err) { toast(err.message, { type: 'error' }); }
    }
    if (!npStarted) { npStarted = true; window.hub.onNowPlaying((info) => onNowPlaying(info)); }

    // ---------- Stage window: the sketch in its own window (own process, own GPU context) for smooth frames ----------
    // Preview frame rate: Max follows the screen (240 Hz screens render 240 frames a second); 60 or 30 is lighter.
    const fpsSel = el('select', { class: 'fps-sel', title: 'Preview frame rate: lower = lighter on the GPU and steadier recordings', dataset: { feature: 'Preview fps' } },
      [['0', 'Max fps'], ['60', '60 fps'], ['30', '30 fps']].map(([v, l]) => el('option', { value: v, text: l, selected: v === String(store.get('three.fpsCap', 0)) })));
    fpsSel.addEventListener('change', () => { store.set('three.fpsCap', Number(fpsSel.value)); box.send({ type: 'fps-cap', value: Number(fpsSel.value) }); });
    const stageBtn = btn('🖥', 'Stage window: run the sketch in its own window, steady, smooth frames for recording or a second monitor (F11 there for fullscreen). The preview here sleeps meanwhile.', () => setStage(!box.onStage));
    stageBtn.dataset.feature = 'Stage window';
    const stageNote = el('div', { class: 'stage-note', hidden: true },
      el('b', { text: '🖥 Playing in the Stage window' }),
      el('span', { text: 'Music, sliders, timeline, recording and the director all keep working from here.' }),
      el('div', { class: 'button-row' }, btn('Show it', 'Bring the Stage window to the front', () => window.hub.stageFocus()), btn('↩ Bring it back here', 'Close the Stage window and run the preview here again', () => setStage(false))));
    function setStage(on) {
      box.useStage(on, () => { const z = stage.size; return z.id !== 'fit' ? { width: z.width, height: z.height } : null; });
      stageBtn.classList.toggle('on', on);
      stageNote.hidden = !on;
      previewHost.classList.toggle('on-stage', on);
      run();
      if (on) toast('The sketch now runs in its own Stage window (F11 there for fullscreen)', { timeout: 3500 });
    }
    // ---------- scene editor: orbit around the selected layer's scene, click objects, move / rotate / scale them ----------
    // Placements live in L.overrides ({ path: { p, q, s, rd, v, name } }, '@camera' for the framed view) and the sandbox
    // re-applies them every frame. "Bake into code" asks the director to write them into the code.
    let editOn = false;
    let editSel = null;
    const editUndo = [];
    const editBtn = btn('✥ Edit', 'Move around the selected layer\'s 3D scene and drag objects into place (move / rotate / scale). Placements are kept with the layer. E', () => setEdit(!editOn));
    editBtn.dataset.feature = 'Edit scene';
    editBtn.dataset.key = 'E';
    const modeBtns = [['translate', 'Move', 'W'], ['rotate', 'Rotate', 'E'], ['scale', 'Scale', 'R']].map(([m, label, k]) => btn(label, `${label} (${k} in the preview)`, () => { box.send({ type: 'edit', cmd: 'mode', value: m }); paintMode(m); }, 'ghost small ed-mode'));
    const spaceBtn = btn('World', 'Gizmo axes: world or the object\'s own (Q in the preview)', () => { const v = spaceBtn.textContent === 'World' ? 'local' : 'world'; box.send({ type: 'edit', cmd: 'space', value: v }); spaceBtn.textContent = v === 'world' ? 'World' : 'Local'; });
    const snapBtn = btn('Snap', 'Snap: 0.25 units, 15°, 0.1 scale', () => { snapBtn.classList.toggle('on'); box.send({ type: 'edit', cmd: 'snap', value: snapBtn.classList.contains('on') }); });
    const outlinerBtn = btn('Objects ▾', 'Every object in the scene: click to select', () => box.send({ type: 'edit', cmd: 'tree' }));
    const camBtn = btn('📷 Use this view', 'Make the view you framed the sketch\'s camera', () => { pushEditUndo(); box.send({ type: 'edit', cmd: 'camera' }); toast('The sketch\'s camera now uses this view (Reset camera in the list to undo)', { timeout: 3000 }); });
    const selBox = el('div', { class: 'ed-sel' });
    const footBox = el('div', { class: 'ed-foot' });
    const editPanel = el('div', { class: 'ed-panel', hidden: true },
      el('div', { class: 'ed-row' }, ...modeBtns, spaceBtn, snapBtn, outlinerBtn, camBtn, el('span', { class: 'spacer' }), btn('Done', 'Leave the scene editor (E)', () => setEdit(false), 'primary small')),
      selBox, footBox);
    const paintMode = (m) => modeBtns.forEach((b, k) => b.classList.toggle('on', ['translate', 'rotate', 'scale'][k] === m));
    function setEdit(on) {
      const L = sel();
      if (on && !L) return;
      editOn = on;
      editBtn.classList.toggle('on', on);
      editPanel.hidden = !on;
      previewHost.classList.toggle('editing', on);
      box.send({ type: 'edit', cmd: on ? 'on' : 'off', layer: L?.id });
      if (on) { paintMode('translate'); editSel = null; paintEditSel(); toast(`Editing "${L.name}": drag to orbit, right-drag to pan, wheel to zoom, click an object to move it`, { timeout: 3500 }); }
    }
    const placements = () => Object.keys(sel()?.overrides || {}).filter((k) => k !== '@camera');
    function paintEditSel() {
      const info = editSel;
      if (!info) {
        selBox.replaceChildren(el('div', { class: 'ed-hint', text: 'Click an object to select it · drag to orbit · right-drag to pan · wheel to zoom · W / E / R move / rotate / scale · F focus · Alt+click picks its group · Esc deselects' }));
      } else {
        const num = (prop, axis, val) => {
          const inp = el('input', { type: 'number', class: 'ed-num', value: val, step: prop === 'r' ? 1 : 0.05 });
          inp.addEventListener('change', () => { pushEditUndo(); box.send({ type: 'edit', cmd: 'set', prop, axis, value: Number(inp.value) }); });
          return inp;
        };
        const trio = (label, prop, arr) => el('div', { class: 'ed-trio' }, el('span', { class: 'ed-lab', text: label }), ...arr.map((v, k) => num(prop, k, v)));
        const placed = Boolean(sel()?.overrides?.[info.path]);
        selBox.replaceChildren(
          el('div', { class: 'ed-row' }, el('b', { text: info.name || info.type }), el('span', { class: 'ed-type', text: `${info.type}${info.children ? ` · ${info.children} inside` : ''}${placed ? ' · placed' : ''}` }), el('span', { class: 'spacer' }),
            info.hasParent ? btn('Parent', 'Select the group it belongs to', () => box.send({ type: 'edit', cmd: 'parent' })) : null,
            btn('Focus', 'Fly the view to it (F)', () => box.send({ type: 'edit', cmd: 'focus' })),
            btn(info.v ? '👁 Hide' : '👁 Show', 'Hide or show it', () => { pushEditUndo(); box.send({ type: 'edit', cmd: 'visible' }); }),
            placed ? btn('↺ Reset', 'Back to where the code puts it', () => resetPlacement(info.path)) : null),
          (() => {
            // the arrows are the main tool; exact numbers fold away (remembered)
            const d = el('details', { class: 'ed-nums', on: { toggle: (e) => store.set('three.edNums', e.currentTarget.open) } },
              el('summary', { text: 'Exact values' }), trio('Position', 'p', info.p), trio('Rotation°', 'r', info.r), trio('Scale', 's', info.s));
            d.open = store.get('three.edNums', false);
            return d;
          })());
      }
      const n = placements().length; const cam = Boolean(sel()?.overrides?.['@camera']);
      footBox.replaceChildren(el('span', { text: n || cam ? `${n} object${n === 1 ? '' : 's'} placed${cam ? ' · camera set' : ''} in "${sel()?.name}"` : 'Nothing placed yet' }), el('span', { class: 'spacer' }),
        editUndo.length ? btn('↶', 'Undo the last placement', () => undoEdit()) : null,
        n || cam ? btn('Bake into code…', 'Ask the Three Director to write these placements into the code', () => bakePlacements()) : null,
        cam ? btn('Reset camera', 'The sketch\'s own camera again', () => resetPlacement('@camera')) : null,
        n || cam ? btn('Clear all', 'Remove every placement in this layer', () => { pushEditUndo(); setOverrides(sel(), null); }) : null);
    }
    function pushEditUndo() { const L = sel(); if (L) { editUndo.push({ id: L.id, ov: JSON.stringify(L.overrides || null) }); if (editUndo.length > 50) editUndo.shift(); } }
    function setOverrides(L, ov) {
      L.overrides = ov && Object.keys(ov).length ? ov : undefined;
      box.send({ type: 'layer-props', id: L.id, props: { overrides: L.overrides || null } });
      touch();
      run({ hot: true, layer: L.id }); // objects the code doesn't move every frame go back to where it puts them
      paintEditSel();
    }
    function resetPlacement(path) { const L = sel(); if (!L?.overrides) return; pushEditUndo(); const ov = { ...L.overrides }; delete ov[path]; setOverrides(L, ov); }
    function undoEdit() { const u = editUndo.pop(); const L = u && layerById(u.id); if (L) setOverrides(L, JSON.parse(u.ov)); }
    function bakePlacements() {
      const L = sel();
      const lines = Object.entries(L.overrides || {}).map(([path, o]) => (path === '@camera'
        ? `- the camera: position [${o.p.join(', ')}], quaternion [${o.q.join(', ')}], fov ${Math.round(o.fov)}`
        : `- ${o.name || path} (${path.startsWith('#') ? `named "${path.slice(1)}"` : `scene child path ${path}`}): ${o.p ? `position [${o.p.join(', ')}], ` : ''}${o.rd ? `rotation [${o.rd.join(', ')}] degrees, ` : ''}${o.s ? `scale [${o.s.join(', ')}]` : ''}${o.v === false ? ', hidden' : ''}`));
      askDirector(`In the layer "${L.name}" I placed things with the scene editor. Write these placements into the code so they start there (use three_edit_code, keep everything else as it is):\n${lines.join('\n')}\nWhen it's done, tell me, and I'll clear the placements in the editor.`, { send: false });
    }
    function onEditMessage(msg) {
      if (msg.type === 'edit-select') { editSel = msg.info; paintEditSel(); }
      if (msg.type === 'edit-change') {
        const L = layerById(msg.layer);
        if (!L) return;
        if (msg.final && JSON.stringify(L.overrides || null) !== JSON.stringify(msg.overrides)) { editUndo.push({ id: L.id, ov: JSON.stringify(L.overrides || null) }); }
        L.overrides = msg.overrides;
        editSel = msg.info || editSel;
        if (msg.final) touch();
        paintEditSel();
      }
      if (msg.type === 'edit-mode') { if (msg.mode) paintMode(msg.mode); if (msg.space) spaceBtn.textContent = msg.space === 'world' ? 'World' : 'Local'; }
      if (msg.type === 'edit-tree') {
        const r = outlinerBtn.getBoundingClientRect();
        const ov = sel()?.overrides || {};
        popup(r.left, r.bottom + 4, ['Objects in the scene', ...msg.tree.slice(0, 200).map((n) => [`${'  '.repeat(n.depth)}${n.name || n.type}${ov[n.path] ? ' ●' : ''}${n.v ? '' : ' (hidden)'}`, n.name ? n.type : '', () => box.send({ type: 'edit', cmd: 'select', path: n.path }), editSel?.path === n.path])]);
      }
    }
    function togglePresent() {
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      pane.focus();
      previewHost.requestFullscreen().catch((err) => toast(`Couldn't go fullscreen: ${err.message}`, { type: 'error' }));
    }
    // keys that only mean something while presenting: I info, PgUp / PgDn sketches, F / \\ freeze
    function presentKeys(e) {
      if (document.fullscreenElement !== previewHost || e.ctrlKey || e.altKey || e.metaKey) return false;
      if (e.key.toLowerCase() === 'i') { setHud(presentHud.hidden); return true; }
      if (e.key.toLowerCase() === 'b') { setBlackout(); return true; }
      if (e.key === 'PageDown' || e.key === 'PageUp') { stepSketch(e.key === 'PageDown' ? 1 : -1); return true; }
      if (e.key.toLowerCase() === 'f' || e.key === '\\') { setFreeze(!frozenNow); return true; }
      return false;
    }
    document.addEventListener('fullscreenchange', () => {
      const on = document.fullscreenElement === previewHost;
      if (on && store.get('three.presentHud', false)) setHud(true); else if (!on) { clearInterval(hudTimer); presentHud.hidden = true; setBlackout(false); }
      presentBtn.classList.toggle('on', on);
      previewHost.classList.toggle('presenting', on);
      box.send({ type: 'present', on });
      if (on) { presentHint.classList.remove('gone'); setTimeout(() => presentHint.classList.add('gone'), 2500); }
    });
    // While presenting, keys can land outside the Lab pane: pass them to the player.
    document.addEventListener('keydown', (e) => {
      if (document.fullscreenElement !== previewHost || pane.contains(e.target)) return;
      if (!e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'p') { e.preventDefault(); togglePresent(); return; }
      if (presentKeys(e)) { e.preventDefault(); return; }
      if (player.onKey(e)) e.preventDefault();
    });
    toolbar.prepend(codeBtn, slidersBtn, consoleBtn, focusBtn, presentBtn);
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
    // ---------- keyframes ----------
    // L.keys = { opacity | x | y | scale | rotate | 's:<slider key>': [{ t, v, ease }] } (ThreeLayers.evalKeys).
    const { ANIM, evalKeys, upsertKey, keyAt, KEY_EPS } = ThreeLayers;
    const keysOf = (L, prop) => L?.keys?.[prop] || [];
    const animKeys = (L) => Object.fromEntries(ANIM.filter((p) => L.keys?.[p]?.length).map((p) => [p, L.keys[p]]));
    function sliderKeysOf(L) {
      const c = controllers.get(L.id);
      const out = {};
      for (const [prop, keys] of Object.entries(L.keys || {})) {
        if (!prop.startsWith('s:') || !keys.length) continue;
        const info = c?.keyInfo(prop.slice(2));
        if (info) out[baseOf(L) + info.index] = { call: info.call, key: prop.slice(2), num: info.num, keys };
      }
      return out;
    }
    const baseValue = (L, prop) => (prop.startsWith('s:') ? controllers.get(L.id)?.keyInfo(prop.slice(2))?.value : L[prop] ?? (prop === 'scale' || prop === 'opacity' ? 1 : 0));
    const valueAt = (L, prop) => evalKeys(keysOf(L, prop), player.loaded ? player.time : null, baseValue(L, prop));
    const keyStateFor = (L, prop) => (!keysOf(L, prop).length ? 'none' : keyAt(keysOf(L, prop), player.time) ? 'on' : 'animated');
    function sendKeys(L) { box.send({ type: 'layer-props', id: L.id, props: { keys: animKeys(L), sliderKeys: sliderKeysOf(L) } }); }
    function setKeys(L, prop, keys) {
      L.keys ||= {};
      if (keys.length) L.keys[prop] = keys; else delete L.keys[prop];
      sendKeys(L);
      fitClock();
      touch();
      renderTracksOnly();
      syncKeyUI(true);
    }
    function toggleKeyFor(id, prop, value) {
      const L = layerById(id);
      if (!L) return;
      if (!player.loaded) ensureTimeline(); // no song: the scene's own timeline
      if (!player.loaded) { toast('Load a song first: keyframes sit on the song timeline', { type: 'error' }); return; }
      const ks = keysOf(L, prop);
      const at = keyAt(ks, player.time);
      if (at) setKeys(L, prop, ks.filter((k) => k !== at));
      else setKeys(L, prop, upsertKey(ks, player.time, value ?? valueAt(L, prop)));
    }
    // Moving an animated slider sets a keyframe where the move started (so dragging while it plays stays on one key).
    let dragKeyT = null;
    // Write (like a DAW's automation write): while the song plays, moves are recorded as a curve at the
    // playhead, replacing the points they pass over.
    let writeArmed = false;
    const writeLast = {};
    const writing = () => writeArmed && player.loaded && player.playing;
    let writeFlushT = 0;
    function writeFlush(final) {
      clearTimeout(writeFlushT);
      writeFlushT = setTimeout(() => { touch(); renderTracksOnly(); syncKeyUI(true); }, final ? 0 : 160);
    }
    function writeKey(L, prop, value, final) {
      const t = player.time; const k = `${L.id}|${prop}`;
      let last = writeLast[k];
      if (last == null || t < last - 0.05 || t - last > 1) last = t; // a new pass, or the loop jumped back
      L.keys ||= {};
      const kept = keysOf(L, prop).filter((x) => !(x.t > last + 1e-4 && x.t < t - 1e-4));
      if (final || t - last >= 0.03 || !kept.some((x) => Math.abs(x.t - t) < 0.03)) {
        L.keys[prop] = upsertKey(kept, t, value).map((x) => (Math.abs(x.t - t) < 1e-3 ? { ...x, ease: 'linear' } : x));
        writeLast[k] = t;
      }
      sendKeys(L);
      writeFlush(final);
    }
    function autoKey(id, prop, value, { final }) {
      const L = layerById(id);
      if (!L) return;
      if (writing()) { writeKey(L, prop, value, final); return; }
      if (dragKeyT == null) dragKeyT = player.time;
      L.keys ||= {};
      L.keys[prop] = upsertKey(keysOf(L, prop), dragKeyT, value);
      sendKeys(L);
      if (final) { dragKeyT = null; touch(); renderTracksOnly(); syncKeyUI(true); }
    }
    // All of a layer's keyframe times (for the ◆ on its track).
    function trackKeys(L) {
      const m = new Map();
      for (const ks of Object.values(L.keys || {})) for (const k of ks) { const r = Math.round(k.t * 1000) / 1000; if (![...m.keys()].some((x) => Math.abs(x - r) < KEY_EPS)) m.set(r, k.ease || 'ease'); }
      return [...m].map(([t, ease]) => ({ t, ease })).sort((a, b) => a.t - b.t);
    }
    function editKeysAt(id, t, fn) {
      const L = layerById(id);
      if (!L?.keys) return;
      for (const [prop, ks] of Object.entries(L.keys)) L.keys[prop] = fn(ks.map((k) => ({ ...k })), (k) => Math.abs(k.t - t) < KEY_EPS).sort((a, b) => a.t - b.t);
      for (const prop of Object.keys(L.keys)) if (!L.keys[prop].length) delete L.keys[prop];
      sendKeys(L);
      touch();
      renderTracksOnly();
      syncKeyUI(true);
    }
    const trackHandlers = {
      onSelect: (id) => selectLayer(id),
      onChange: (id, v, { final }) => editLayer(id, v, { live: !final }),
      onKeyMove: (id, from, to) => editKeysAt(id, from, (ks, hit) => [...ks.filter((k) => !hit(k) && Math.abs(k.t - to) >= KEY_EPS), ...ks.filter(hit).map((k) => ({ ...k, t: Math.round(to * 1000) / 1000 }))]),
      onKeyDelete: (id, t) => editKeysAt(id, t, (ks, hit) => ks.filter((k) => !hit(k))),
      onKeyEase: (id, t, ease) => editKeysAt(id, t, (ks, hit) => ks.map((k) => (hit(k) ? { ...k, ease } : k))),
      onLanePick: (id, x, y, o) => lanePick(id, x, y, o),
      onLaneEdit: (id, prop, keys, o) => laneEdit(id, prop, keys, o),
      onLaneHide: (id, prop) => { const L = layerById(id); if (L) setLanes(L, lanesOf(L).filter((p) => p !== prop)); },
      onLaneTall: (id, prop) => { const L = layerById(id); if (!L) return; L.laneTall = { ...L.laneTall, [prop]: !L.laneTall?.[prop] }; if (!L.laneTall[prop]) delete L.laneTall[prop]; touch(); renderTracksOnly(); },
      onLanesAll: () => toggleAllLanes(),
      onMute: (id) => { const L = layerById(id); if (L) editLayer(id, { visible: L.visible === false }); },
      onSolo: (id) => setSolo(soloId === id ? null : id),
    };
    const trackList = () => [...layersOf()].reverse().map((L) => ({ id: L.id, name: L.name, color: L.color, in: L.in ?? null, out: L.out ?? null, fadeIn: L.in != null ? L.fadeIn || 0 : 0, fadeOut: L.out != null ? L.fadeOut || 0 : 0, visible: L.visible !== false, solo: L.id === soloId, selected: L.id === selId, keys: trackKeys(L), lanes: lanesOf(L).map((p) => laneData(L, p)).filter(Boolean), animated: Object.values(L.keys || {}).filter((k) => k?.length).length }));
    // Animated values follow the playhead in the panels.
    let lastSyncT = -1;
    function syncKeyUI(force = false) {
      const L = sel();
      if (!L || !current) return;
      const t = player.time;
      if (!force && Math.abs(t - lastSyncT) < 1e-3) return;
      lastSyncT = t;
      const vals = {}; const states = {};
      for (const p of ANIM) { states[p] = keyStateFor(L, p); if (keysOf(L, p).length) vals[p] = valueAt(L, p); }
      layersPanel.sync(vals, states);
      const sv = {};
      for (const p of Object.keys(L.keys || {})) if (p.startsWith('s:')) sv[p.slice(2)] = valueAt(L, p);
      controllers.get(L.id)?.sync(sv);
    }
    // keyframed values follow the playhead while the Lab is on screen; the timer stops when it isn't (and
    // 'hearth:view' from start.js starts it again), so a hidden Lab doesn't wake up 10× a second
    let keyTimer = 0;
    const keyTick = () => {
      if (!(split || previewHost).checkVisibility({ visibilityProperty: true }) && !box.onStage) { clearInterval(keyTimer); keyTimer = 0; return; }
      if (current && sel()?.keys && Object.keys(sel().keys).length) syncKeyUI();
    };
    const keyLoop = () => { if (!keyTimer) keyTimer = setInterval(keyTick, 100); };
    keyLoop();
    addEventListener('hearth:view', keyLoop);
    // ---------- automation lanes (Ableton placement, FL Studio curves) ----------
    // L.lanes = the settings shown as curves under the layer's track ('opacity' … or 's:<slider key>'), in order;
    // L.laneTall = { prop: true } for taller lanes. (Older sketches have a single L.lane.)
    const { fmtMs } = ThreeMedia._test;
    const lanesOf = (L) => L.lanes || (L.lane ? [L.lane] : []);
    function laneData(L, prop) {
      if (!prop) return null;
      const tall = Boolean(L.laneTall?.[prop]);
      const meta = ThreeLayers.ANIM_META[prop];
      if (meta) return { prop, label: meta.label, min: meta.min, max: meta.max, step: meta.step, base: baseValue(L, prop), keys: keysOf(L, prop), tall };
      if (prop.startsWith('s:')) {
        const c = controllers.get(L.id)?.controls().find((x) => x.key === prop.slice(2));
        if (c && c.min != null) return { prop, label: c.label, min: c.min, max: c.max, step: c.step, base: baseValue(L, prop), keys: keysOf(L, prop), tall };
      }
      return null;
    }
    // every setting of a layer that can have a curve: [{ prop, label }]
    function laneProps(L) {
      const out = Object.entries(ThreeLayers.ANIM_META).map(([prop, m]) => ({ prop, label: m.label }));
      for (const c of (controllers.get(L.id)?.controls() || []).filter((x) => x.min != null)) out.push({ prop: `s:${c.key}`, label: c.label });
      return out;
    }
    const animatedProps = (L) => laneProps(L).map((x) => x.prop).filter((p) => keysOf(L, p).length);
    function popup(x, y, items) { return popMenu(x, y, items, { width: 290 }); } // renderer.js (submenus, filter, keys)
    function setSolo(id) {
      soloId = id && layerById(id) ? id : null;
      for (const x of layersOf()) box.send({ type: 'layer-props', id: x.id, props: { visible: x.visible !== false && (!soloId || x.id === soloId) } });
      renderTracksOnly();
      if (soloId) toast(`Only "${layerById(soloId).name}" shows · the same again (S, Alt+click its eye or Alt+Shift+number) shows every layer`, { timeout: 2200 });
    }
    function setLanes(L, list) { L.lanes = [...new Set(list.filter(Boolean))]; delete L.lane; touch(); renderTracksOnly(); }
    // A: show every animated setting of every layer; again (when they all show): hide every lane.
    function toggleAllLanes() {
      const all = layersOf();
      const missing = all.some((L) => animatedProps(L).some((p) => !lanesOf(L).includes(p)));
      for (const L of all) { L.lanes = missing ? [...new Set([...lanesOf(L), ...animatedProps(L)])] : []; delete L.lane; }
      touch();
      renderTracksOnly();
      toast(missing ? 'Showing every animated setting (A hides them)' : 'Lanes hidden (A shows every animated setting)', { timeout: 1600 });
    }
    // The ▾ chooser: tick several settings to see their curves at once. With { prop }: switch that lane to another setting.
    function lanePick(id, x, y, { prop: swap = null } = {}) {
      const L = layerById(id);
      if (!L) return;
      const shown = lanesOf(L);
      const count = (p) => keysOf(L, p).length;
      const again = () => lanePick(id, x, y, { prop: swap });
      const items = [];
      const props = laneProps(L);
      const row = ({ prop, label }) => {
        const on = shown.includes(prop);
        const hint = count(prop) ? `${count(prop)} points` : '';
        if (swap) return [`${label}${count(prop) ? ' ●' : ''}`, prop === swap ? 'this lane' : on ? `already shown${hint ? ` · ${hint}` : ''}` : hint, () => { if (prop !== swap) setLanes(L, on ? shown.filter((p) => p !== swap) : shown.map((p) => (p === swap ? prop : p))); }, prop === swap];
        return [`${on ? '☑' : '☐'} ${label}${count(prop) ? ' ●' : ''}`, hint, () => { setLanes(L, on ? shown.filter((p) => p !== prop) : [...shown, prop]); again(); }, on];
      };
      items.push(swap ? 'Switch this lane to' : 'Curves to show (tick several)');
      for (const p of props.filter((q) => !q.prop.startsWith('s:'))) items.push(row(p));
      if (props.some((q) => q.prop.startsWith('s:'))) { items.push('Sliders'); for (const p of props.filter((q) => q.prop.startsWith('s:'))) items.push(row(p)); }
      items.push('Lanes');
      const anim = animatedProps(L);
      if (anim.some((p) => !shown.includes(p))) items.push(['Show every animated one', `${anim.length} with points`, () => setLanes(L, [...shown, ...anim])]);
      if (swap) items.push(['Hide this lane', 'The animation stays', () => setLanes(L, shown.filter((p) => p !== swap))]);
      if (shown.length) items.push(['Hide all of this layer\'s lanes', 'The animation stays', () => setLanes(L, [])]);
      items.push(['Every layer: show / hide animated', 'A', () => toggleAllLanes()]);
      if (!swap) {
        items.push('Animate (adds points)');
        for (const pr of ThreeLayers.PRESETS) items.push([pr.name, pr.desc, () => applyPreset(id, pr.id)]);
      }
      popup(x ?? innerWidth / 2, y ?? innerHeight / 2, items);
    }
    function laneEdit(id, prop, keys, { final }) {
      const L = layerById(id);
      if (!L) return;
      L.keys ||= {};
      if (keys.length) L.keys[prop] = [...keys].sort((a, b) => a.t - b.t); else delete L.keys[prop];
      sendKeys(L);
      if (final) { touch(); renderTracksOnly(); syncKeyUI(true); }
    }
    // One-click animations over the layer's time (or the loop, or the whole song).
    function applyPreset(id, presetId) {
      const L = layerById(id);
      const pr = ThreeLayers.PRESETS.find((x) => x.id === presetId);
      if (!L || !pr) return null;
      if (!player.loaded) ensureTimeline(); // no song: the scene's own timeline
      if (!player.loaded) { toast('Load a song first: animations sit on the song timeline', { type: 'error' }); return null; }
      const lp = player.loop;
      const a = L.in ?? lp?.a ?? 0;
      const b = L.out ?? (L.in != null ? player.duration : lp?.b ?? player.duration);
      const beat = 60 / player.bpm;
      const ctx = { a, b, beat, bar: beat * player.beatsPerBar, beats: player.beatsIn(a, b - 1e-3), kicks: player.markersIn('kick', a, b), snares: player.markersIn('snare', a, b), base: (p) => baseValue(L, p) };
      const out = pr.make(ctx);
      L.keys ||= {};
      for (const [prop, keys] of Object.entries(out)) {
        if (!keys.length) continue;
        const lo = Math.min(...keys.map((x) => x.t)); const hi = Math.max(...keys.map((x) => x.t));
        const kept = keysOf(L, prop).filter((x) => x.t < lo - KEY_EPS || x.t > hi + KEY_EPS);
        const merged = [...kept, ...keys].sort((p, q) => p.t - q.t).filter((x, i, arr) => i === 0 || Math.abs(x.t - arr[i - 1].t) >= KEY_EPS);
        L.keys[prop] = merged;
      }
      L.lanes = [...new Set([...lanesOf(L), ...Object.keys(out)])];
      delete L.lane;
      sendKeys(L);
      touch();
      renderTracksOnly();
      syncKeyUI(true);
      toast(`${pr.name} on "${L.name}" (${fmtMs(a)} → ${fmtMs(b)}). Edit it in the lane under the layer.`, { timeout: 3500 });
      return { layer: L.name, preset: pr.name, from: a, to: b, props: Object.keys(out) };
    }

    // ---------- notes on moments ----------
    // { sketchId: [{ id, t, text, image, at, done }] } in kv 'three-notes'. A note = the song time, a screenshot and what to change.
    let notesAll = {};
    const notesOf = () => (current ? (notesAll[current.id] ||= []) : []);
    const saveNotes = debounce(() => window.hub.kvSet('three-notes', notesAll), 300);
    const fileUrl = (p) => `file:///${encodeURI(String(p).replace(/\\/g, '/'))}`;
    // ---------- contact sheet ----------
    // One picture of the whole piece: a frame at each cue (or evenly over the loop / song), labeled with
    // its time, for you, the director's self-review or Astra.
    let sheetBusy = false;
    async function contactSheet({ times = null, count = 8 } = {}) {
      if (sheetBusy) throw new Error('A contact sheet is already being made');
      // No song: frames a moment apart, as it runs.
      if (!player.loaded) return sheetFromFrames(await liveFrames(Math.min(count, 8)));
      sheetBusy = true;
      const wasPlaying = player.playing; const wasAt = player.time;
      try {
        if (wasPlaying) player.toggle(false);
        const cues = player.cues;
        let picks = times ? times.map((t) => ({ t: Number(t), label: '' })) : cues.length >= 2 ? cues.map((c) => ({ t: c.time + 0.05, label: c.name })) : null;
        if (!picks) {
          const lp = player.loop; const a = lp?.a ?? 0; const b = lp?.b ?? player.duration;
          picks = Array.from({ length: count }, (_, i) => ({ t: a + ((b - a) * (i + 0.5)) / count, label: '' }));
        }
        picks = picks.filter((x) => Number.isFinite(x.t)).slice(0, 16);
        const frames = [];
        for (const pk of picks) {
          player.seek(pk.t);
          await new Promise((r) => setTimeout(r, 450));
          const url = await director.shot();
          if (url) frames.push({ ...pk, url });
        }
        return await sheetFromFrames(frames);
      } finally {
        player.seek(wasAt);
        if (wasPlaying) player.toggle(true);
        sheetBusy = false;
      }
    }
    async function liveFrames(n) {
      const frames = [];
      for (let i = 0; i < n; i += 1) { const url = await director.shot(); if (url) frames.push({ t: i * 0.6, label: `+${(i * 0.6).toFixed(1)} s`, url }); await new Promise((r) => setTimeout(r, 600)); }
      return frames;
    }
    async function sheetFromFrames(frames) {
      if (!frames.length) throw new Error('Nothing is rendering');
      const imgs = await Promise.all(frames.map((f) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = f.url; })));
      const cols = frames.length <= 4 ? frames.length : frames.length <= 9 ? 3 : 4;
      const first = imgs.find(Boolean);
      const tw = 420; const th = Math.round(tw * (first.height / first.width)); const pad = 6; const lab = 22;
      const rows = Math.ceil(frames.length / cols);
      const cv = document.createElement('canvas');
      cv.width = cols * (tw + pad) + pad; cv.height = rows * (th + lab + pad) + pad;
      const g = cv.getContext('2d');
      g.fillStyle = '#0b0e10'; g.fillRect(0, 0, cv.width, cv.height);
      g.font = '14px Consolas, monospace';
      frames.forEach((f, i) => {
        const x = pad + (i % cols) * (tw + pad); const y = pad + Math.floor(i / cols) * (th + lab + pad);
        if (imgs[i]) g.drawImage(imgs[i], x, y, tw, th);
        g.fillStyle = '#ffd75e'; g.fillText(`${i + 1}  ${f.label?.startsWith('+') ? f.label : `${fmtMs(f.t).replace(/^0:/, '')}${f.label ? `  ${f.label}` : ''}`}`, x + 2, y + th + 16);
      });
      return { dataUrl: cv.toDataURL('image/jpeg', 0.86), frames: frames.map((f, i) => ({ n: i + 1, time: Math.round(f.t * 100) / 100, cue: f.label || undefined })) };
    }
    const sheetBtn = btn('🎞 Sheet', 'Contact sheet: a frame at every cue (or across the loop / song) in one picture, to check the whole piece or send to the director / Astra', () => showSheet(), 'ghost small imp-capture');
    sheetBtn.dataset.feature = 'Contact sheet';
    async function showSheet() {
      let sheet;
      const t = toast('Making the contact sheet…', { timeout: 30000 });
      try { sheet = await contactSheet(); } catch (err) { t.remove(); toast(err.message, { type: 'error' }); return; }
      t.remove();
      const path = await window.hub.saveAttachment(`contact-sheet-${Date.now()}.jpg`, sheet.dataUrl.split(',')[1]);
      const agent = H.agents().find((a) => a.dock === 'three' && a.mode === 'native');
      const dlg = el('dialog', { class: 'ui-modal sb-dialog' },
        el('div', { class: 'refs-head' }, el('h3', { text: `Contact sheet · ${sheet.frames.length} frames` }), el('span', { class: 'spacer' }),
          agent ? btn('Send to the director', 'Attach it to the Three Director\'s chat with a starter message', () => {
            dlg.close();
            Native.attachPaths(agent.id, [path]);
            Native.setDraft(agent.id, `Here's a contact sheet of "${current?.name}" (frames ${sheet.frames.map((f) => `${f.n} = ${fmtMs(f.time)}${f.cue ? ` ${f.cue}` : ''}`).join(', ')}). Look at the whole piece: `);
          }, 'primary small') : null,
          btn('Save…', 'Save the picture', async () => { const p = await window.hub.saveFile({ defaultPath: `${current?.name || 'sketch'} contact sheet.jpg`, filters: [{ name: 'JPEG', extensions: ['jpg'] }], content: sheet.dataUrl.split(',')[1], base64: true }); if (p) toast('Saved', { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } }); }),
          btn('Close', '', () => dlg.close())),
        el('img', { class: 'sheet-img', src: sheet.dataUrl, alt: 'Contact sheet' }));
      dlg.addEventListener('close', () => dlg.remove());
      document.body.append(dlg);
      dlg.showModal();
    }

    // ---------- write button ----------
    const writeBtn = btn('⏺ Write', 'Write: while the song plays, moving a slider, a layer setting or a MIDI knob records it as a curve (replacing what was there). W', () => setWrite(!writeArmed), 'ghost small mb-write imp-live');
    writeBtn.dataset.feature = 'Write';
    function setWrite(on) {
      writeArmed = on;
      for (const k of Object.keys(writeLast)) delete writeLast[k];
      writeBtn.classList.toggle('armed', on);
      writeBtn.textContent = on ? '⏺ Writing' : '⏺ Write';
      if (on) toast('Write is on: play the song and move sliders or knobs to record curves (W to stop)', { timeout: 2600 });
    }

    // ---------- MIDI ----------
    // Knobs / faders (CC) drive sliders: extras[sketch].midi = { 'ch:ccN': { layer, key, label } } (key 'p:opacity' = layer opacity).
    // Pads (notes) do actions anywhere in the Lab: store 'three.midiPads' = { 'ch:nN': 'kick' | 'snare' | 'hit' | 'play' | 'note' | 'write' }.
    let midi = null;
    let midiLearn = null; // { stage: 'slider' } | { stage: 'control', layer, key, label } | { stage: 'pad', action }
    let midiSeen = '';
    const midiBtn = btn('🎛 MIDI', 'Use a MIDI controller: knobs move sliders, pads drop kick / snare / hit markers', (e) => midiMenu(e.currentTarget));
    midiBtn.dataset.feature = 'MIDI';
    const midiMap = () => (current ? ((extras[current.id] ||= {}).midi ||= {}) : {});
    const midiPads = () => store.get('three.midiPads', {});
    const PAD_ACTIONS = [['kick', 'Kick marker'], ['snare', 'Snare marker'], ['hit', 'Hit marker'], ['play', 'Play / pause'], ['write', 'Write on / off'], ['note', 'Note on this moment']];
    async function midiInit() {
      if (midi) return true;
      if (!navigator.requestMIDIAccess) { toast('MIDI is not available here', { type: 'error' }); return false; }
      try { midi = await navigator.requestMIDIAccess(); } catch (err) { toast(`Couldn't open MIDI: ${err.message}`, { type: 'error' }); return false; }
      const hook = () => { for (const inp of midi.inputs.values()) inp.onmidimessage = onMidi; renderMidiBtn(); };
      midi.onstatechange = hook;
      hook();
      store.set('three.midiOn', true);
      return true;
    }
    const midiDevices = () => (midi ? [...midi.inputs.values()].filter((i) => i.state === 'connected').map((i) => i.name) : []);
    function renderMidiBtn() {
      const n = midiDevices().length;
      midiBtn.textContent = n ? '🎛 MIDI ●' : '🎛 MIDI';
      midiBtn.classList.toggle('on', Boolean(n));
      midiBtn.title = n ? `MIDI: ${midiDevices().join(', ')}` : 'Use a MIDI controller: knobs move sliders, pads drop kick / snare / hit markers';
    }
    const midiRelease = {};
    function midiTouched(layer, key, label) {
      if (midiLearn?.stage !== 'slider') return;
      midiLearn = { stage: 'control', layer, key, label };
      toast(`Now turn the knob or fader for "${label}"`, { timeout: 4000 });
    }
    function onMidi(e) {
      const [st, d1, d2 = 0] = e.data;
      const type = st & 0xf0; const ch = (st & 0x0f) + 1;
      if (type === 0xB0) {
        const id = `${ch}:cc${d1}`;
        midiSeen = `CC ${d1} (channel ${ch})`;
        if (midiLearn?.stage === 'control') {
          midiMap()[id] = { layer: midiLearn.layer, key: midiLearn.key, label: midiLearn.label };
          saveExtras();
          toast(`${midiSeen} → ${midiLearn.label}`, { timeout: 2200 });
          midiLearn = null;
          return;
        }
        const m = midiMap()[id];
        if (m) midiApply(m, d2 / 127);
      } else if (type === 0x90 && d2 > 0) {
        const id = `${ch}:n${d1}`;
        if (midiLearn?.stage === 'pad') {
          store.set('three.midiPads', { ...midiPads(), [id]: midiLearn.action });
          toast(`Pad (note ${d1}) → ${PAD_ACTIONS.find((a) => a[0] === midiLearn.action)[1]}`, { timeout: 2200 });
          midiLearn = null;
          return;
        }
        const act = midiPads()[id];
        if (act === 'kick' || act === 'snare' || act === 'hit') player.tapHit(act);
        else if (act === 'play') player.toggle();
        else if (act === 'write') setWrite(!writeArmed);
        else if (act === 'note') takeNote();
      }
    }
    // A knob position (0..1) → the control's range; the gesture "releases" 300 ms after the knob stops.
    function midiApply(m, u) {
      const L = layerById(m.layer);
      if (!L) return;
      const rel = `${m.layer}|${m.key}`;
      if (m.key.startsWith('p:')) {
        const prop = m.key.slice(2); const meta = ThreeLayers.ANIM_META[prop];
        const v = Math.round((meta.min + u * (meta.max - meta.min)) / meta.step) * meta.step;
        editLayer(L.id, { [prop]: v }, { live: true });
        clearTimeout(midiRelease[rel]);
        midiRelease[rel] = setTimeout(() => editLayer(L.id, { [prop]: v }), 300);
        return;
      }
      const c = controllers.get(L.id);
      const info = c?.controls().find((x) => x.key === m.key);
      if (!info) return;
      let v;
      if (info.options) v = info.options[Math.min(info.options.length - 1, Math.floor(u * info.options.length))];
      else if (typeof info.value === 'boolean') v = u >= 0.5;
      else if (info.min != null) { v = info.min + u * (info.max - info.min); v = info.step ? Math.round(v / info.step) * info.step : Math.round(v * 1000) / 1000; }
      else return;
      c.setByKey(m.key, v);
      clearTimeout(midiRelease[rel]);
      midiRelease[rel] = setTimeout(() => c.setByKey(m.key, v, { release: true }), 300);
    }
    async function midiMenu(anchor) {
      const ok = await midiInit();
      const r = anchor.getBoundingClientRect();
      const devs = midiDevices();
      const maps = Object.entries(midiMap());
      const pads = Object.entries(midiPads());
      popup(r.left, r.bottom + 4, [
        !ok ? 'MIDI is not available' : devs.length ? `Connected: ${devs.join(', ')}` : 'No MIDI device found: plug one in (it shows up by itself)',
        ['Learn a knob for a slider', 'Move a slider, then turn a knob or fader', () => { midiLearn = { stage: 'slider' }; setSlidersVisible(true); toast('Move the slider you want, then turn a knob', { timeout: 4000 }); }],
        sel() ? ['Learn a knob for the layer\'s opacity', `"${sel().name}"`, () => { midiLearn = { stage: 'control', layer: sel().id, key: 'p:opacity', label: `${sel().name} opacity` }; toast('Turn a knob or fader', { timeout: 4000 }); }] : null,
        'Pads',
        ...PAD_ACTIONS.map(([a, label]) => [`Learn a pad: ${label}`, Object.entries(midiPads()).filter(([, v]) => v === a).map(([k]) => `note ${k.split(':n')[1]}`).join(', ') || 'not set', () => { midiLearn = { stage: 'pad', action: a }; toast('Hit the pad', { timeout: 4000 }); }]),
        maps.length || pads.length ? 'Your mappings (click to remove)' : null,
        ...maps.map(([k, m]) => [`${m.label}`, `CC ${k.split(':cc')[1]} · ch ${k.split(':')[0]}`, () => { delete midiMap()[k]; saveExtras(); }]),
        ...pads.map(([k, a]) => [`Pad → ${PAD_ACTIONS.find((x) => x[0] === a)?.[1] || a}`, `note ${k.split(':n')[1]}`, () => { const p = midiPads(); delete p[k]; store.set('three.midiPads', p); }]),
        midiSeen ? 'Last control moved' : null,
        midiSeen ? [midiSeen, 'Learn mode maps the next one you move', () => {}] : null,
      ]);
    }
    if (store.get('three.midiOn', false)) midiInit();

    // ---------- palette ----------
    // A sketch's colors (current.palette = ['#rrggbb', …]): picked from a reference picture, shown as swatches,
    // given to sketches as the global `palette`, and one click recolors the selected layer's color sliders.
    const paletteBox = el('span', { class: 'lab-palette' });
    const paletteBtn = btn('🎨', 'Palettes: import from Coolors, take one from a picture, or pick a saved one', (e) => paletteMenu(e.currentTarget));
    const savedPalettes = () => store.get('three.palettes', []);
    function savePalette(name, colors) {
      const list = savedPalettes().filter((p) => p.name !== name);
      store.set('three.palettes', [{ name, colors }, ...list].slice(0, 60));
    }
    async function importPalette() {
      let clip = '';
      try { clip = await navigator.clipboard.readText(); } catch { /* no clipboard text */ }
      const text = await Modal.prompt('Import a palette', {
        value: parseColors(clip).length >= 2 ? clip.trim().slice(0, 2000) : '',
        multiline: true,
        label: 'Paste a Coolors link (coolors.co/palette/…), a Coolors export (CSS, array, JSON) or any hex codes.',
        placeholder: 'https://coolors.co/palette/264653-2a9d8f-e9c46a-f4a261-e76f51',
      });
      if (text == null) return;
      const cols = parseColors(text);
      if (cols.length < 2) { toast('No colors found in that', { type: 'error' }); return; }
      setPalette(cols);
      savePalette(/coolors/i.test(text) ? `Coolors ${cols.map((c) => c.slice(1, 4)).join('')}` : `Imported ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })} ${cols[0]}`, cols);
      toast(`Palette set: ${cols.length} colors (also saved in 🎨 → Saved)`, { timeout: 2400 });
    }
    function paletteMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      const pal = current?.palette || [];
      const saved = savedPalettes();
      popup(r.left, r.bottom + 4, [
        'Palette',
        ['Import from Coolors…', 'Paste a coolors.co link or export, or hex codes (reads your clipboard)', () => importPalette()],
        ['Open coolors.co', 'Make one there (space bar = new colors), then copy the link and import it', () => window.open('https://coolors.co/generate')],
        ['From a reference picture…', 'Open References and press 🎨 Palette on a picture', () => openRefs()],
        pal.length ? ['Save this palette…', pal.join(' '), async () => { const n = await Modal.prompt('Palette name', { value: current?.name || 'My palette' }); if (n) { savePalette(n.trim(), pal); toast('Saved', { timeout: 1200 }); } }] : null,
        pal.length ? ['Recolor the selected layer', 'Put these colors into its color sliders', () => recolor()] : null,
        pal.length ? ['Remove the palette', 'From this sketch', () => setPalette([])] : null,
        saved.length ? 'Saved (click to use)' : null,
        ...saved.map((p) => [p.name, p.colors.join(' '), () => setPalette(p.colors), pal.join() === p.colors.join()]),
        saved.length ? ['Delete a saved palette…', '', () => {
          popup(r.left, r.bottom + 4, ['Delete which one?', ...savedPalettes().map((p) => [p.name, p.colors.join(' '), () => { store.set('three.palettes', savedPalettes().filter((x) => x.name !== p.name)); toast(`Deleted "${p.name}"`, { timeout: 1500 }); }])]);
        }] : null,
      ]);
    }
    function renderPalette() {
      const pal = current?.palette || [];
      paletteBox.classList.toggle('empty', !pal.length);
      paletteBox.replaceChildren(paletteBtn, ...pal.map((c) => { const b = el('button', { class: 'lab-swatch', title: `${c}: click to copy`, on: { click: () => { navigator.clipboard.writeText(c); toast(`Copied ${c}`, { timeout: 1000 }); } } }); b.style.background = c; return b; }),
        ...(pal.length ? [btn('Recolor', 'Put these colors into the selected layer\'s color sliders', () => recolor())] : []));
    }
    function setPalette(cols) {
      if (!current) return;
      if (cols.length) current.palette = cols; else delete current.palette;
      touch();
      renderPalette();
      sendRefs();
    }
    function recolor() {
      const pal = current?.palette || [];
      const c = controllers.get(sel()?.id);
      const colorKeys = (c?.controls() || []).filter((x) => typeof x.value === 'string' && /^#[0-9a-f]{6}$/i.test(x.value));
      if (!colorKeys.length) { toast('The selected layer has no color sliders', { type: 'error' }); return; }
      colorKeys.forEach((x, i) => c.setByKey(x.key, pal[i % pal.length], { release: true }));
      toast(`Recolored ${colorKeys.length} color slider${colorKeys.length === 1 ? '' : 's'} (↶ in Sliders to undo, Save to keep)`, { timeout: 2600 });
    }
    // Dominant colors of a picture: a coarse color histogram, then the most common buckets that differ enough.
    async function paletteFrom(path, n = 6) {
      const img = new Image(); img.src = fileUrl(path); await img.decode();
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

    // ---------- references ----------
    // { sketchId: [{ id, key, name, kind, path, size, at }] } in kv 'three-refs'. Files are copied into data/refs;
    // the sandbox gets their bytes (refs.<key> = blob URL, refTexture(key)) before each full run.
    let refsAll = {};
    const refBytes = new Map(); // id → ArrayBuffer
    const refsOf = () => (current ? (refsAll[current.id] ||= []) : []);
    const saveRefs = debounce(() => window.hub.kvSet('three-refs', refsAll), 300);
    const REF_KINDS = [['image', /\.(png|jpe?g|gif|webp|bmp|svg)$/i], ['video', /\.(mp4|webm|mov|m4v|mkv)$/i], ['model', /\.(glb|gltf|obj|fbx|stl|ply)$/i],
      ['audio', /\.(mp3|wav|ogg|m4a|flac|aac)$/i], ['font', /\.(ttf|otf|woff2?)$/i], ['data', /\.(json|csv|txt|hdr|exr|bin)$/i]];
    const MIMES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/mp4', m4v: 'video/mp4', mkv: 'video/webm', glb: 'model/gltf-binary', gltf: 'model/gltf+json', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac', json: 'application/json', csv: 'text/csv', txt: 'text/plain', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' };
    const refKindOf = (name) => REF_KINDS.find(([, re]) => re.test(name))?.[0] || null;
    const refUse = (r) => (r.kind === 'image' || r.kind === 'video' ? `refTexture('${r.key}')` : `refs.${r.key}`);
    const REF_ICONS = { image: '🖼', video: '🎞', model: '🧊', audio: '🔊', font: '🔤', data: '📄' };
    const fmtSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
    function refKey(name, except = null) {
      let k = name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^[^a-zA-Z_]+/, '') || 'ref';
      k = k[0].toLowerCase() + k.slice(1);
      const taken = new Set(refsOf().filter((r) => r !== except).map((r) => r.key));
      let out = k; let i = 2;
      while (taken.has(out)) { out = `${k}${i}`; i += 1; }
      return out;
    }
    async function addRef(src, { key } = {}) {
      if (!current) throw new Error('Open a sketch first');
      const name = String(src).split(/[\\/]/).pop().replace(/^\d{10,}-/, '');
      const kind = refKindOf(name);
      if (!kind) throw new Error(`${name} isn't a file a sketch can use (images, videos, 3D models, audio, fonts, data files)`);
      const st = await window.hub.fs.stat(src);
      if (st.size > 400 * 1048576) throw new Error(`${name} is over 400 MB`);
      const existing = refsOf().find((r) => r.name === name && r.size === st.size);
      if (existing) return existing;
      const path = await window.hub.importRef(src);
      const r = { id: `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, key: refKey(key || name), name, kind, path, size: st.size, at: Date.now() };
      refsOf().push(r);
      saveRefs();
      await loadRefBytes();
      renderRefsBtn();
      if (refsDlg?.open) renderRefsDlg();
      return r;
    }
    function removeRef(r) {
      refsAll[current.id] = refsOf().filter((x) => x !== r);
      refBytes.delete(r.id);
      saveRefs(); sendRefs(); renderRefsBtn();
      window.hub.fs.trash(r.path).catch(() => {});
    }
    function renameRef(r, to) {
      const k = refKey(to, r);
      const used = layersOf().some((L) => L.code.includes(r.key));
      r.key = k;
      saveRefs(); sendRefs(); renderRefsBtn();
      if (used) toast(`Renamed to ${k}: code that used the old name needs updating (ask the director)`, { timeout: 4000 });
      return k;
    }
    // Bytes for every reference of the open sketch; a run that needed a missing one runs again.
    async function loadRefBytes() {
      let added = false;
      for (const r of refsOf()) {
        if (refBytes.has(r.id)) continue;
        try { const u8 = await window.hub.fs.read(r.path, { encoding: 'buffer', maxBytes: 400 * 1048576 }); refBytes.set(r.id, u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)); added = true; } catch { /* file gone */ }
      }
      sendRefs();
      return added;
    }
    function sendRefs() {
      const items = refsOf().filter((r) => refBytes.has(r.id)).map((r) => ({ key: r.key, kind: r.kind, mime: MIMES[r.name.split('.').pop().toLowerCase()] || '', buffer: refBytes.get(r.id).slice(0) }));
      box.send({ type: 'refs', items, palette: current?.palette || [] });
    }
    const refsBtn = btn('🖼 References', 'Images, videos, 3D models, sounds and data for this sketch. The Three Director can see and use them; you can also drop files in its chat.', () => openRefs());
    refsBtn.dataset.feature = 'References';
    function renderRefsBtn() { const n = refsOf().length; refsBtn.textContent = n ? `🖼 ${n}` : '🖼'; refsBtn.title = `References${n ? ` (${n})` : ''}: images, videos, 3D models, sounds and data for this sketch. The Three Director can see and use them; you can also drop files in its chat.`; }
    let refsDlg = null; let refsGrid = null;
    function openRefs() {
      refsDlg?.remove();
      refsGrid = el('div', { class: 'refs-grid' });
      const add = btn('＋ Add files…', 'Pick images, videos, models…', async () => {
        const paths = await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], title: 'References for this sketch' });
        for (const p of paths) { try { await addRef(p); } catch (err) { toast(err.message, { type: 'error' }); } }
      }, 'primary small');
      refsDlg = el('dialog', { class: 'ui-modal refs-dialog' },
        el('div', { class: 'refs-head' }, el('h3', { text: `References · ${current?.name || ''}` }), el('span', { class: 'spacer' }), add, btn('Close', '', () => refsDlg.close())),
        el('p', { class: 'muted small', text: 'Drop files here. In code: refTexture(\'name\') for images and videos, refs.name (a URL) for models, sounds and data. Or just ask the director: "use the logo on the cube".' }),
        refsGrid);
      dropZone(refsDlg, async (files) => { for (const f of files) { try { await addRef(window.hub.pathForFile(f)); } catch (err) { toast(err.message, { type: 'error' }); } } }, { hint: 'Drop to add references' });
      refsDlg.addEventListener('close', () => { refsDlg.remove(); refsDlg = null; });
      document.body.append(refsDlg);
      renderRefsDlg();
      refsDlg.showModal();
    }
    function renderRefsDlg() {
      if (!refsGrid) return;
      const list = refsOf();
      refsGrid.replaceChildren(...(list.length ? list.map((r) => {
        const thumb = r.kind === 'image' ? el('img', { src: fileUrl(r.path), alt: '' })
          : r.kind === 'video' ? el('video', { src: fileUrl(r.path), muted: true, loop: true, playsInline: true, on: { mouseenter: (e) => e.target.play(), mouseleave: (e) => e.target.pause() } })
            : el('span', { class: 'refs-icon', text: REF_ICONS[r.kind] });
        const keyIn = el('input', { class: 'refs-key', value: r.key, spellcheck: false, title: 'The name code uses for it' });
        keyIn.addEventListener('change', () => { keyIn.value = renameRef(r, keyIn.value); renderRefsDlg(); });
        return el('div', { class: 'refs-card' }, el('div', { class: 'refs-thumb' }, thumb), keyIn,
          el('div', { class: 'refs-meta', text: `${r.kind} · ${fmtSize(r.size)} · ${r.name}` }),
          el('div', { class: 'refs-actions' },
            btn('Copy code', refUse(r), () => { navigator.clipboard.writeText(refUse(r)); toast(`Copied ${refUse(r)}`, { timeout: 1200 }); }),
            btn('Ask director', 'Start a message to the Three Director about this reference', () => askAboutRef(r), 'ghost small imp-ai'),
            btn('Show', 'Show the file', () => window.hub.fs.reveal(r.path)),
            r.kind === 'video' && typeof ThreeFrames !== 'undefined' ? btn('🎞 Read ▾', 'Read this clip exactly: contact sheet, scenes, motion, pacing · match its pacing (its rhythm, not its footage)', (e) => { const rr = e.currentTarget.getBoundingClientRect(); refsDlg?.close(); ThreeFrames.refMenu(rr.left, rr.bottom + 4, r.path, r.key); }) : null,
            r.kind === 'image' ? btn('🎨 Palette', 'Use this picture\'s colors as the sketch palette', async () => { try { const cols = await paletteFrom(r.path); setPalette(cols); toast(`Palette: ${cols.join(' ')}`, { timeout: 2400 }); } catch (err) { toast(err.message, { type: 'error' }); } }) : null,
            btn('🗑', 'Remove (the copy goes to the Recycle Bin)', () => { removeRef(r); renderRefsDlg(); })));
      }) : [el('div', { class: 'refs-empty', text: 'No references yet. Add pictures, logos, video clips, 3D models (.glb), sounds or data files.' })]));
    }
    function askAboutRef(r) {
      const agent = H.agents().find((a) => a.dock === 'three' && a.mode === 'native');
      if (!agent) return;
      refsDlg?.close();
      Native.setDraft(agent.id, `Use the reference "${r.key}" (${r.kind}, ${r.name}) in the sketch: `);
      if (r.kind === 'image') Native.attachPaths(agent.id, [r.path]);
    }
    api.addRef = (p, o) => addRef(p, o);
    const noteBtn = btn('📌 Note', 'Take a screenshot and a note at this moment, for a change you want here (N)', () => takeNote(), 'ghost small imp-capture');
    const notesBtn = btn('Notes', 'Your notes on this sketch: jump to them, mark them done, send them to the Three Director', (e) => notesList(e.currentTarget));
    notesBtn.dataset.feature = 'Notes list';
    function renderNotes() {
      player.setNotes(notesOf().map((n) => ({ id: n.id, t: n.t, text: n.text, done: n.done })), { onOpen: (id, x, y) => openNote(id, x, y) });
      const open = notesOf().filter((n) => !n.done).length;
      notesBtn.textContent = notesOf().length ? `Notes ${open}${open !== notesOf().length ? `/${notesOf().length}` : ''}` : 'Notes';
    }
    async function takeNote({ text: given, time } = {}) {
      if (!current) return null;
      const t = time ?? (player.loaded ? player.time : 0);
      if (time != null && player.loaded) { player.seek(time); await sleep(500); }
      // the frame is captured right away, while you type the note
      const shotP = director.shot();
      const text = given ?? await Modal.prompt(`Note at ${fmtMs(t)}`, { placeholder: 'What should change here? (the screenshot is saved with it)', multiline: true });
      if (text == null) return null;
      const shot = await shotP;
      let image = null;
      if (shot) { try { image = await window.hub.saveAttachment(`note ${current.name} ${fmtMs(t).replace(/:/g, '-')}.png`.replace(/[\\/:*?"<>|]/g, '_'), shot.split(',')[1]); } catch { image = null; } }
      const n = { id: `n${Date.now().toString(36)}`, t: Math.round(t * 1000) / 1000, text: String(text).trim() || '(no text)', image, at: Date.now(), done: false };
      notesOf().push(n);
      notesOf().sort((a, b) => a.t - b.t);
      saveNotes();
      renderNotes();
      if (given == null) toast(`Note saved at ${fmtMs(t)}`, { timeout: 1800 });
      return n;
    }
    function placeCard(card, x, y) {
      document.body.append(card);
      const r = card.getBoundingClientRect();
      Object.assign(card.style, { left: `${Math.max(8, Math.min(innerWidth - r.width - 8, x - r.width / 2))}px`, top: `${Math.max(8, Math.min(innerHeight - r.height - 8, y - r.height - 12))}px` });
      const close = (e) => { if (!card.contains(e.target) && !e.target.closest?.('.ui-modal')) { card.remove(); removeEventListener('pointerdown', close, true); } };
      setTimeout(() => addEventListener('pointerdown', close, true));
    }
    function openNote(id, x, y) {
      const n = notesOf().find((m) => m.id === id);
      if (!n) return;
      document.querySelector('.note-card')?.remove();
      const ta = el('textarea', { class: 'note-text', rows: 3 });
      ta.value = n.text;
      ta.addEventListener('change', () => { n.text = ta.value.trim() || '(no text)'; saveNotes(); renderNotes(); });
      const card = el('div', { class: 'note-card' },
        el('div', { class: 'note-head' }, el('b', { text: `📌 ${fmtMs(n.t)}` }), el('span', { class: 'hint', text: n.done ? 'done' : '' }), el('span', { class: 'spacer' }), btn('×', 'Close', () => card.remove())),
        n.image ? el('img', { class: 'note-img', src: fileUrl(n.image), title: 'The frame when you took the note' }) : null,
        ta,
        el('div', { class: 'note-actions' },
          btn(n.done ? 'Reopen' : '✓ Done', n.done ? 'Mark it as still to do' : 'Mark it as handled', () => { n.done = !n.done; saveNotes(); renderNotes(); card.remove(); }),
          btn('Delete', 'Delete this note', () => { notesAll[current.id] = notesOf().filter((m) => m !== n); saveNotes(); renderNotes(); card.remove(); }),
          el('span', { class: 'spacer' }),
          btn('Send to director', 'Put this note and its screenshot in the Three Director\'s chat box', () => { card.remove(); sendNotes([n]); }, 'primary small')));
      placeCard(card, x, y);
    }
    function notesList(anchor) {
      document.querySelector('.note-card')?.remove();
      const list = notesOf();
      const card = el('div', { class: 'note-card note-list' },
        el('div', { class: 'note-head' }, el('b', { text: `Notes on "${current?.name}"` }), el('span', { class: 'spacer' }), btn('📌 New', 'Take a note at the playhead (N)', () => { card.remove(); takeNote(); }), btn('×', 'Close', () => card.remove())),
        list.length ? el('div', { class: 'note-rows' }, list.map((n) => el('div', { class: `note-row${n.done ? ' done' : ''}` },
          n.image ? el('img', { class: 'note-thumb', src: fileUrl(n.image) }) : el('span', { class: 'note-thumb empty', text: '📌' }),
          el('button', { class: 'note-time', text: fmtMs(n.t), title: 'Jump there', on: { click: () => player.seek(n.t) } }),
          el('span', { class: 'note-sum', text: n.text, title: n.text }),
          btn(n.done ? '↺' : '✓', n.done ? 'Reopen' : 'Done', () => { n.done = !n.done; saveNotes(); renderNotes(); card.remove(); notesList(anchor); }),
          btn('🗑', 'Delete', () => { notesAll[current.id] = notesOf().filter((m) => m !== n); saveNotes(); renderNotes(); card.remove(); notesList(anchor); })))) : el('p', { class: 'hint', text: 'No notes yet. Press N (or 📌 Note) at a moment you want changed.' }),
        list.some((n) => !n.done) ? el('div', { class: 'note-actions' }, el('span', { class: 'spacer' }), btn('Send open notes to the director', 'Puts every open note with its screenshot in the Three Director\'s chat box', () => { card.remove(); sendNotes(list.filter((n) => !n.done)); }, 'primary small')) : null);
      const r = anchor.getBoundingClientRect();
      placeCard(card, r.left + r.width / 2, r.top);
    }
    async function sendNotes(list) {
      const agent = H.agents().find((a) => a.threeTools);
      if (!agent) { toast('Add an agent with Three.js tools first (the Three Director)', { type: 'error' }); return; }
      activate(agent.id);
      const paths = list.map((n) => n.image).filter(Boolean);
      if (paths.length) await Native.attachPaths(agent.id, paths);
      Native.setDraft(agent.id, `My notes on "${current.name}" (song times${paths.length ? '; the screenshots are attached in the same order' : ''}):\n${list.map((n) => `- ${fmtMs(n.t)} [${n.id}]: ${n.text}`).join('\n')}\nPlease make these changes, then mark each note done (three_notes).`);
    }

    // ---------- focus: almost fullscreen ----------
    let focusOn = false;
    const exitFocus = el('button', { class: 'lab-focus-exit', text: '✕ Exit focus (Esc)', on: { click: () => setFocus(false) } });
    document.body.append(exitFocus);
    api.sketchList = () => [...sketches].sort((a, b) => b.updatedAt - a.updatedAt).map((s) => ({ id: s.id, name: s.name }));
    api.openSketchById = (id) => { if (sketches.some((s) => s.id === id) && id !== current?.id) openSketch(id); };
    api.lab = {
      sheet: () => showSheet(),
      present: () => togglePresent(), focus: () => setFocus(!focusOn), consoleMode: (m) => setConsoleMode(m),
      speed: (r) => player.setRate(r), cue: () => player.addCue(player.time),
      // what a controller would send (also used by tests): midiMessage([0xB0, 21, 64])
      midiMessage: (bytes) => onMidi({ data: bytes }), midiLearn: (o) => { midiLearn = o; }, write: (on) => setWrite(on),
    };
    function setFocus(on) {
      focusOn = on;
      document.body.classList.toggle('lab-focus', on);
      focusBtn.classList.toggle('on', on);
      if (on) player.setSize('strip', { temporary: true }); else player.restoreSize();
    }
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && focusOn) setFocus(false); });

    const layerProps = (L, z) => ({ keys: animKeys(L), sliderKeys: sliderKeysOf(L), overrides: L.overrides || null, name: L.name, visible: L.visible !== false && (!soloId || L.id === soloId), opacity: L.opacity ?? 1, blend: L.blend || 'normal', in: L.in ?? null, out: L.out ?? null, fadeIn: L.fadeIn || 0, fadeOut: L.fadeOut || 0, x: L.x || 0, y: L.y || 0, scale: L.scale ?? 1, rotate: L.rotate || 0, selected: L.id === selId, slot: L.slot, z: z ?? layersOf().indexOf(L) });
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
        rerun: () => run({ hot: true, layer: id }), // in place (a page that isn't up yet gets a full run anyway)
        persist: (kind, data) => { const Lx = layerById(id); if (!Lx || !current) return; extrasOf(Lx)[kind] = data; saveExtras(); },
        quickAsk: (text) => askDirector(text === '3 variations to pick from'
          ? `Make 3 clearly different variations of the layer "${layerById(id)?.name}" using only its sliders (three_sliders), no code changes. For each: set the values, save it as a look named "Variation A", "B" or "C" (three_looks), and show it to me with chat_show. Then ask me with chat_ask which one I like (A, B, C or none) and apply that look.`
          : text.endsWith('…') ? `${text.slice(0, -1)} ` : `${text} (layer "${layerById(id)?.name}")`, { send: !text.endsWith('…') }),
        goToLine: (line) => { if (selId !== id) selectLayer(id); setCodeVisible(true); requestAnimationFrame(() => goToLine(line)); },
        commit: (code) => {
          const Lx = layerById(id);
          if (!Lx) return;
          if (selId === id) { snapshot(); editor.setValue(code); persist(); } else { Lx.code = code; touch(); }
        },
        keyframes: {
          state: (key) => keyStateFor(layerById(id), `s:${key}`),
          toggle: (key, value) => toggleKeyFor(id, `s:${key}`, value),
          changed: (key, value, o) => autoKey(id, `s:${key}`, value, o),
          writing: () => writing(),
        },
        touched: (key, label) => midiTouched(id, key, label),
        learn: async (key, label) => { if (!(await midiInit())) return; midiLearn = { stage: 'control', layer: id, key, label }; toast(`Turn the knob or fader for "${label}"`, { timeout: 4000 }); },
        palette: () => current?.palette || [],
        clock: () => ({ t: player.loaded ? player.time : performance.now() / 1000, bpm: player.loaded ? player.bpm : (liveBpm?.bpm || 120), playing: player.playing, section: player.loaded ? player.sectionAt().energy : null }),
        askForSliders: () => askDirector(`Add clearly named sliders to the layer "${layerById(id)?.name}" of "${current?.name}" with tweak(): the 4–8 settings I'd most want to play with (motion, colors, lighting, glow, how much it reacts to the music…), with labels, groups and hints, read every frame so they change live. Keep everything else the same.`, { send: false }),
      });
      c.setVisible(!column.hidden);
      c.load(extrasOf(L));
      controllers.set(id, c);
      return c;
    }
    const selCtl = () => (sel() ? ctlFor(sel()) : null);
    // ---------- "building…" while the director works ----------
    // A shimmer on the preview's corner while a director turn runs on this scene (or its tool calls do), and on the
    // row of each layer that is being (re)built until its first new frame is drawn. CSS animations only (three-lab.css).
    const buildPill = el('div', { class: 'lab-building', attrs: { 'aria-hidden': 'true' } }, el('span', { class: 'lab-building-dot' }), 'building…');
    const builds = new Map(); // layer id → { t: safety timer (a layer that never draws stops anyway), loud: the director's }
    const turns = new Set(); // director chats answering right now
    let works = 0; // director tool calls in flight on the scene on screen
    const onThisScene = (chatId) => typeof ChatScenes === 'undefined' || !ChatScenes.linkOf?.(chatId) || ChatScenes.linkOf(chatId) === current?.id;
    const directorWorking = () => works > 0 || [...turns].some(onThisScene);
    function building(id, on) {
      const was = builds.get(id);
      clearTimeout(was?.t);
      if (on) builds.set(id, { t: setTimeout(() => building(id, false), 6000), loud: Boolean(was?.loud) || directorWorking() });
      else if (!builds.delete(id)) return;
      paintBuilding();
    }
    let buildOffT = 0;
    function paintBuilding() {
      for (const row of layersPanel.el.querySelectorAll('.ly-row[data-id]')) {
        const b = builds.has(row.dataset.id);
        if (row.classList.contains('ly-building') !== b) row.classList.toggle('ly-building', b);
      }
      // a short linger, so quick calls one after another read as one stretch of work
      const busy = () => directorWorking() || [...builds.values()].some((b) => b.loud);
      if (busy()) { clearTimeout(buildOffT); buildOffT = 0; if (!buildPill.classList.contains('on')) buildPill.classList.add('on'); }
      else if (buildPill.classList.contains('on') && !buildOffT) buildOffT = setTimeout(() => { buildOffT = 0; if (!busy()) buildPill.classList.remove('on'); }, 700);
    }
    api.directorWork = (d) => { works = Math.max(0, works + d); paintBuilding(); };
    if (typeof Native !== 'undefined' && Native.hooks) {
      Native.hooks.send.push((agentId, chat) => { const a = H.agent?.(agentId); if (chat?.id && (a?.threeTools || a?.dock === 'three')) { turns.add(chat.id); paintBuilding(); } });
      Native.hooks.event.push((ev, chat) => { if (chat?.id && ev?.type !== 'delta' && turns.delete(chat.id)) paintBuilding(); });
    }
    addEventListener('hearth:sketch', () => paintBuilding());
    const tweaksSlot = el('div', { class: 'tw-slot' });
    const layersPanel = ThreeLayers.panel({
      onSolo: (id) => setSolo(soloId === id ? null : id),
      onSelect: (id) => selectLayer(id),
      onChange: (id, patch, { live }) => editLayer(id, patch, { live }),
      onAdd: (kind) => addLayer(kind),
      onRemove: (id) => removeLayer(id),
      onReorder: (ids) => reorderLayers(ids),
      now: () => player.time,
      duration: () => player.duration,
      loop: () => player.loop,
      keyState: (id, prop) => keyStateFor(layerById(id), prop),
      toggleKey: (id, prop, value) => toggleKeyFor(id, prop, value),
      valueAt: (L, prop) => valueAt(L, prop),
      onPreset: (id, presetId) => applyPreset(id, presetId),
    });
    const column = el('div', { class: 'tw-column' }, layersPanel.el, tweaksSlot);
    // Right-click a layer: everything for it in one menu (its ⧉ / 🗑 buttons were never used, so they're tucked away)
    layersPanel.el.addEventListener('contextmenu', (e) => {
      const row = e.target.closest('.ly-row');
      if (!row) return;
      e.preventDefault();
      const idx = [...layersPanel.el.querySelectorAll('.ly-list .ly-row')].indexOf(row);
      const L = [...layersOf()].reverse()[idx];
      if (!L) return;
      const Ls = layersOf(); const at = Ls.indexOf(L);
      const move = (to) => { const ids = Ls.map((x) => x.id).filter((x) => x !== L.id); ids.splice(Math.max(0, Math.min(ids.length, to)), 0, L.id); reorderLayers(ids); };
      ThreeTweaks.menu(e.clientX, e.clientY, [L.name,
        [L.visible === false ? '👁 Show' : '◌ Hide', `Alt+${[...Ls].reverse().indexOf(L) + 1}`, () => editLayer(L.id, { visible: L.visible === false })],
        [soloId === L.id ? 'Show every layer' : 'Only this layer (solo)', 'Alt+click its eye', () => setSolo(soloId === L.id ? null : L.id)],
        ['Rename…', 'Or double-click its name', async () => { const v = await Modal.prompt('Rename layer', { value: L.name }); if (v?.trim()) editLayer(L.id, { name: v.trim() }); }],
        ['Duplicate', 'A copy on top', () => { selectLayer(L.id); addLayer('copy'); }, false, 'Duplicate layer'],
        at < Ls.length - 1 ? ['Move up', '', () => move(at + 1)] : null,
        at > 0 ? ['Move down', '', () => move(at - 1)] : null,
        at < Ls.length - 1 ? ['To the top', '', () => move(Ls.length)] : null,
        // (round 7) the layer's timing, whose two buttons wait behind Alt now
        player.loaded ? ['Plays', L.in != null || L.out != null ? 'part of the song' : 'the whole song', [['The whole song', '', () => editLayer(L.id, { in: null, out: null }), L.in == null && L.out == null], player.loop ? ['Only during the loop', '', () => editLayer(L.id, { in: player.loop.a, out: player.loop.b })] : null].filter(Boolean)] : null,
        ...(typeof ThreeComp !== 'undefined' ? ThreeComp.layerMenu(L) : []), // ◫ Precomp › / ◫ Comp › (tools/three-comp.js)
        'Opacity',
        ...[1, 0.75, 0.5, 0.25].map((o) => [`${Math.round(o * 100)}%`, '', () => editLayer(L.id, { opacity: o }), Math.abs((L.opacity ?? 1) - o) < 0.01]),
        'Blend',
        ...ThreeLayers.BLENDS.slice(0, 6).map(([v, label]) => [label, '', () => editLayer(L.id, { blend: v }), (L.blend || 'normal') === v]),
        Ls.length > 1 ? ['Delete…', 'With Undo', () => removeLayer(L.id), false, 'Delete layer'] : null,
        ...(typeof Declutter !== 'undefined' ? Declutter.popItems('Lab layers') : [])]);
    });
    function renderLayers() {
      if (!current) return;
      layersPanel.render(layersOf(), selId);
      paintBuilding();
      player.setTracks(trackList(), trackHandlers);
      syncKeyUI(true);
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
        if (editOn) { editSel = null; box.send({ type: 'edit', cmd: 'on', layer: id }); paintEditSel(); }
      }
      tweaksSlot.replaceChildren(ctlFor(L).el);
      renderLayers();
    }
    const saveSoon = debounce(() => save(), 300);
    function touch() { current.updatedAt = Date.now(); current.code = layersOf()[0]?.code ?? current.code; saveSoon(); }
    // direct: set the base value even when the property is animated (the director does this; keyframes still win).
    function editLayer(id, patch, { live = false, direct = false } = {}) {
      const L = layerById(id);
      if (!L) return;
      patch = { ...patch };
      if (!direct && writing()) for (const k of Object.keys(patch)) if (ANIM.includes(k) && typeof patch[k] === 'number') { writeKey(L, k, patch[k], !live); delete patch[k]; }
      // Animated properties: the move becomes a keyframe at the playhead (like After Effects).
      const animated = direct ? [] : Object.keys(patch).filter((k) => ANIM.includes(k) && keysOf(L, k).length);
      if (animated.length) {
        if (dragKeyT == null) dragKeyT = player.time;
        for (const k of animated) { L.keys[k] = upsertKey(keysOf(L, k), dragKeyT, patch[k]); delete patch[k]; }
        if (!live) dragKeyT = null;
      }
      Object.assign(L, patch);
      box.send({ type: 'layer-props', id, props: layerProps(L) });
      if (live) { renderTracksOnly(); return; }
      touch();
      renderLayers();
    }
    function renderTracksOnly() { player.setTracks(trackList(), trackHandlers); }
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
        const t = [...ThreeLayers.TEMPLATES, ...ThreeLayers.FILTERS].find((x) => x.id === kind) || ThreeLayers.TEMPLATES[0];
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
      controllers.get(id)?.destroy?.();
      controllers.delete(id);
      delete layerMods[id];
      box.send({ type: 'remove-layer', id, fade: true }); // its last picture fades out
      ranCode.delete(id);
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
      onLoaded: (o) => { if (o?.unloaded) assignMedia(null); else songTriggers(); if (o?.reload) box.send({ type: 'media-unload' }); if (o?.unloaded && !o.clock) songOut(o.from); renderLayers(); }, // the song you took out stops (no page reload); the scene's own timeline comes back
      // ✦ cue looks: each layer plays the look of the last cue (at or before the playhead) that set one for it
      onCue: ({ index, cues, playing }) => {
        for (const L of layersOf()) {
          const c = controllers.get(L.id);
          if (!c?.playLook) continue;
          let want = null;
          if (playing) for (let k = 0; k <= index; k += 1) { const l = cues[k].looks?.find((x) => x.layer === L.id || x.layer === L.name); if (l) want = l.name; }
          if (want) { if (c.playingLook !== want) c.playLook(want); } else c.endLook();
        }
      },
      lookChoices: () => layersOf().map((L) => ({ layer: L.id, layerName: L.name, names: ctlFor(L).looksApi.list() })),
      frame: { get: () => stage?.size, set: (id) => stage?.setMode(id) },
      onCueLookHere: (cue) => { const L = sel(); const c = L && ctlFor(L); if (!c) return null; c.looksApi.save(cue.name); toast(`"${cue.name}" plays these sliders from ${fmtMs(cue.t)} (while the song plays)`, { timeout: 2600 }); return { layer: L.id, name: cue.name }; },
    });
    // Every section cue gets its own look: a bold shuffle of the selected layer's sliders, saved and assigned
    // (your own values come back afterwards). Rough material to refine, for when you start from nothing.
    function looksForSections({ amount = 0.6 } = {}) {
      const L = sel(); const c = L && ctlFor(L);
      if (!c || !player.loaded) throw new Error('Load a song and open a sketch with sliders');
      if (!player.cues.length) player.autoSections();
      const keep = c.controls().reduce((o, x) => ({ ...o, [x.key]: x.value }), {});
      const add = [];
      for (const cue of player.cues) { c.shuffle({ amount }); c.looksApi.save(cue.name); add.push({ time: cue.time, name: cue.name, looks: [{ layer: L.id, name: cue.name }] }); }
      c.setMany(keep);
      player.editCues({ add });
      return add.length;
    }
    function assignMedia(path) {
      if (!current) return;
      if (path) songOnScene(path); // a song on a scene that had its own timeline: its cues come along
      (extras[current.id] ||= {}).media = path ? { path, time: 0 } : null;
      saveExtras();
    }
    function rememberMedia() {
      // the scene's own timeline: where its playhead is (no song)
      const tl = current && extras[current.id]?.timeline;
      if (tl && !extras[current.id].media && player.path === clockPath(current.id)) { const t = Math.round(player.time * 1000) / 1000; if (tl.time !== t) { tl.time = t; saveExtras(); } return; }
      if (!current || !extras[current.id]?.media || extras[current.id].media.path !== player.path) return;
      const t = Math.round(player.time * 1000) / 1000;
      if (extras[current.id].media.time === t) return; // paused: no rewrite of the kv file every 5 s
      extras[current.id].media.time = t;
      saveExtras();
    }
    setInterval(rememberMedia, 5000);
    // ---------- the scene's own timeline (round 10, orb) ----------
    // One clock per scene. A scene with a song plays on the song (as before); a scene without one plays on its own
    // timeline, extras[id].timeline = { len, fps, time }: the player's silent clock (tools/three-media.js loadClock),
    // so keyframes, slider keys, cues, the loop, Space and frame steps work with no song, and nothing reacts to music.
    // Loading a song on it keeps the keyframes at their seconds and brings its cues / markers along (✦ snap them to
    // bars, one click); taking the song out goes back to the scene's timeline. It travels with the scene: switching,
    // Duplicate, jams and Claude ⇄ Astra handoffs keep it, and its sequence (tools/three-seq.js) starts with it.
    const clockPath = (id) => `scene:${id}`;
    const lastKeyT = (sk) => { let m = 0; for (const L of materialize(sk)) for (const ks of Object.values(L.keys || {})) for (const k of ks || []) if (k.t > m) m = k.t; return m; };
    const fitLen = (sk) => Math.max(10, Math.ceil(lastKeyT(sk) - 1e-3));
    function timelineOf(id) {
      const ex = extras[id];
      if (ex?.timeline) return ex.timeline;
      // an older scene with keyframes and no song (they never played without one): it gets a timeline that holds them
      const sk = sketches.find((x) => x.id === id);
      if (!sk || ex?.media?.path || !(lastKeyT(sk) > 0)) return null;
      (extras[id] ||= {}).timeline = { len: fitLen(sk), fps: 30 };
      saveExtras();
      return extras[id].timeline;
    }
    const seqShowing = () => typeof ThreeSeq !== 'undefined' && ThreeSeq.active;
    // The Lab timeline of a scene: its song (as before), else its own timeline, else none.
    function sceneMedia(id, { playing = true } = {}) {
      const ex = extras[id] || {};
      const want = ex.media?.path || null;
      if (want) {
        if (want !== player.path) { player.unload({ silent: true }); player.load(want, { startAt: ex.media.time || 0, quiet: true }); } else player.seek(ex.media.time || 0);
        return 'song';
      }
      const tl = timelineOf(id);
      if (tl) {
        if (player.path !== clockPath(id) || Math.abs((player.duration || 0) - tl.len) > 1e-3) { player.unload({ silent: true }); player.loadClock({ key: id, seconds: tl.len, fps: tl.fps || 30, startAt: tl.time || 0, playing }); }
        return 'timeline';
      }
      if (player.loaded || player.path) player.unload({ silent: true });
      return null;
    }
    function setTimeline(id, tl) {
      if (!sketches.some((x) => x.id === id)) return null;
      (extras[id] ||= {}).timeline = tl ? { len: Math.max(1, Math.min(600, Number(tl.len) || 10)), fps: Number(tl.fps) || 30, ...(tl.time ? { time: tl.time } : {}) } : null;
      if (!tl) delete extras[id].timeline;
      saveExtras();
      if (id === current?.id && !seqShowing()) sceneMedia(id);
      return extras[id].timeline || null;
    }
    // Something wants the timeline (keyframes, cues, a director's timeline edit) on a scene with no song and no
    // timeline yet: it gets its own, there and then (no "load a song first").
    function ensureTimeline() {
      if (!current || player.loaded || seqShowing()) return Boolean(player.loaded);
      setTimeline(current.id, { len: fitLen(current), fps: 30 });
      return Boolean(player.loaded);
    }
    // keyframes past the end of the scene's own timeline make it longer (never shorter)
    function fitClock() {
      if (!current || player.path !== clockPath(current.id)) return;
      const tl = extras[current.id]?.timeline;
      const last = lastKeyT(current);
      if (!tl || last <= tl.len + 1e-3) return;
      tl.len = Math.ceil(last);
      saveExtras();
      player.setClockLength(tl.len);
    }
    player.on('clock-length', (n) => { if (current && extras[current.id]?.timeline) { extras[current.id].timeline.len = n; saveExtras(); } });
    // A song loaded on a scene that played on its own timeline: its cues and markers come along at the same seconds
    // (keyframes are in seconds on the layers already), and once the song's bars are known one click snaps them.
    let carried = null; // { to: song path, sketch }
    function songOnScene(path) {
      if (!current || !path || player.path !== clockPath(current.id)) return;
      player.carry(player.path, path);
      carried = { to: path, sketch: current.id };
    }
    player.on('analysis', () => {
      const c = carried;
      if (!c || c.to !== player.path || c.sketch !== current?.id) return;
      carried = null;
      const keys = layersOf().reduce((n, L) => n + Object.values(L.keys || {}).reduce((m, ks) => m + (ks?.length || 0), 0), 0);
      const cues = player.cues.length;
      if (!keys && !cues) return;
      toast(`The scene's ${keys ? `${keys} keyframe${keys === 1 ? '' : 's'}` : ''}${keys && cues ? ' and ' : ''}${cues ? `${cues} cue${cues === 1 ? '' : 's'}` : ''} stay at their seconds on the song`, { timeout: 9000, action: { label: '✦ Snap them to bars', fn: () => { const r = snapToBars(); toast(r ? `${r.keys} keyframes and ${r.cues} cues on the song's ${r.unit}s` : 'No bars found on this song', { timeout: 5000, ...(r ? { action: { label: 'Undo', fn: r.undo } } : {}) }); } } });
    });
    // every keyframe and cue to the nearest bar line (to the nearest beat for a setting whose keys would land on the
    // same bar); returns { keys, cues, unit, undo } or null without a grid
    function snapToBars() {
      const g = player.timeline().grid;
      if (!g?.bpm || !player.loaded || player.isClock) return null;
      const beat = 60 / g.bpm; const bar = beat * (g.beatsPerBar || 4); const a0 = g.downbeat ?? 0;
      const at = (t, step) => Math.max(0, Math.round((a0 + Math.round((t - a0) / step) * step) * 1000) / 1000);
      const before = layersOf().map((L) => [L.id, JSON.parse(JSON.stringify(L.keys || {}))]);
      let nk = 0; let unit = 'bar';
      for (const L of layersOf()) {
        for (const [prop, ks] of Object.entries(L.keys || {})) {
          if (!ks?.length) continue;
          let ts = ks.map((k) => at(k.t, bar));
          if (new Set(ts).size < ts.length) { ts = ks.map((k) => at(k.t, beat)); unit = 'beat'; }
          if (new Set(ts).size < ts.length) continue; // too close for either: left alone
          L.keys[prop] = ks.map((k, i) => ({ ...k, t: ts[i] })).sort((p, q) => p.t - q.t);
          nk += ks.length;
        }
        sendKeys(L);
      }
      const cues = player.cues;
      const moved = cues.map((c) => ({ ...c, to: at(c.time, bar) })).filter((c) => Math.abs(c.to - c.time) > 1e-3);
      if (moved.length) player.editCues({ remove: moved.map((c) => c.time), add: moved.map((c) => ({ time: c.to, name: c.name, looks: c.looks })) });
      touch(); renderTracksOnly(); syncKeyUI(true);
      return {
        keys: nk, cues: cues.length, unit,
        undo: () => { for (const [id, k] of before) { const L = layerById(id); if (L) { L.keys = k; sendKeys(L); } } if (moved.length) player.undo?.(); touch(); renderTracksOnly(); syncKeyUI(true); },
      };
    }
    // The song taken out (×): the scene goes back to its own timeline (when it had one or has keyframes), with the
    // song's cues and markers, so nothing placed on the song is lost.
    function songOut(from) {
      if (!current || seqShowing()) return;
      const id = current.id;
      if (!extras[id]?.timeline && !(lastKeyT(current) > 0)) return;
      if (from) player.carry(from, clockPath(id));
      if (!extras[id]?.timeline) (extras[id] ||= {}).timeline = { len: fitLen(current), fps: 30 };
      saveExtras();
      sceneMedia(id, { playing: false });
    }
    addEventListener('beforeunload', () => { rememberMedia(); if (extrasLoaded) window.hub.kvSet('three-lab-extras', extras); });
    split = el('div', { class: 'three-split' }, editorHost, el('div', { class: 'three-right' }, previewHost, player.el, consoleWrap), column);
    previewHost.append(presentHint, presentHud, blackout, editPanel, stageNote);
    function setCodeVisible(show) {
      split.classList.toggle('no-code', !show);
      for (const n of [snippetSel, version, liveLabel]) n.hidden = !show; // code tools only matter with the code shown
      codeBtn.classList.toggle('on', show);
      store.set('three.showCode', show);
      consolePeek = null;
      syncConsole();
    }
    function setSlidersVisible(show) {
      const was = !column.hidden;
      column.hidden = !show;
      for (const c of controllers.values()) c.setVisible(show);
      split.classList.toggle('with-tweaks', show);
      slidersBtn.classList.toggle('on', show);
      store.set('three.showSliders', show);
      if (show && !was && current) run({ sync: true }); // sliders need the instrumented run (each layer re-runs in place)
    }
    setCodeVisible(store.get('three.showCode', false));
    column.hidden = true;
    setSlidersVisible(store.get('three.showSliders', true));
    pane.append(toolbar, split);
    let stage = null;
    const box = sandboxFrame(previewHost, 'sketch', onMessage, () => stage?.params || '', { lazy: true, pretty: true, name: 'preview' });
    previewHost.append(buildPill);
    box.onStageClosed = () => { stageBtn.classList.remove('on'); stageNote.hidden = true; previewHost.classList.remove('on-stage'); run(); };
    queueMicrotask(() => { stage?.pill?.prepend(freezeBtn, compareBtn); stage?.pill?.append(stillBtn, previewMoreBtn); });
    stage = ThreeMedia.stage(previewHost, box.frame, { onChange: ({ id, reload }) => {
      if (current) { (extras[current.id] ||= {}).frame = id; saveExtras(); }
      if (reload && current) run();
    } });
    {
      const seg = stage.pill.querySelector('.stage-seg');
      seg.addEventListener('wheel', (e) => { e.preventDefault(); const o = stage.pillOrder; const i = o.indexOf(stage.size.id); stage.setMode(o[(Math.max(0, i) + (e.deltaY > 0 ? 1 : -1) + o.length) % o.length]); }, { passive: false });
      seg.querySelectorAll('.stage-btn').forEach((b, k) => b.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const id = stage.pillOrder[k];
        if (id === 'fit') return;
        ThreeTweaks.menu(e.clientX, e.clientY, [`${id} · ${ThreeMedia.SIZES.find((z) => z.id === id).title}`, ['📷 Still at this size', 'Then back to the size you had', () => still({ size: id })], ['⏺ Record at this size…', 'Switches, then the record menu', () => { stage.setMode(id); setTimeout(() => player.recordMenu(), 300); }], ['🖥 Stage window at this size', 'A real-size canvas in its own window', () => { stage.setMode(id); setTimeout(() => setStage(true), 200); }], ['Safe zones', 'On / off', () => stage.setSafe()]]);
      }));
    }
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
    pane.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); restartSim(); }
      // Ctrl+S: save the selected layer's sliders into its code · Ctrl+Shift+S: save them as a look
      if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); const c = sel() && ctlFor(sel()); if (e.shiftKey) c?.saveLook(); else { c?.save(); toast('Sliders saved into the code', { timeout: 1200 }); } return; }
      const typingNow = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if (!typingNow && !e.ctrlKey && !e.altKey) {
        if (e.key === '\\') { e.preventDefault(); e.stopPropagation(); setFreeze(!frozenNow); return; }
        if (e.key === '.' && frozenNow) { e.preventDefault(); e.stopPropagation(); box.send({ type: 'step' }); return; }
        if (e.key === '?') { e.preventDefault(); e.stopPropagation(); labKeys(); return; }
      }
      if (e.altKey && !e.ctrlKey && /^Digit[1-9]$/.test(e.code)) {
        const L = [...layersOf()].reverse()[Number(e.code.slice(5)) - 1];
        if (!L) return;
        e.preventDefault(); e.stopPropagation();
        if (e.shiftKey) setSolo(soloId === L.id ? null : L.id);
        else editLayer(L.id, { visible: L.visible === false });
        Usage.key(`Alt+${e.shiftKey ? 'Shift+' : ''}digit`, 'Lab layers');
      }
    }, true);
    // Ctrl+R (reload) while the Lab shows: restart the simulation from scratch instead
    api.actions = {
      restart: () => restartSim(), freeze: () => setFreeze(!frozenNow), keys: () => labKeys(),
      triggers: () => toggleTriggers(true),
      writeTriggers: () => { toggleTriggers(true); setTimeout(() => trigPanel?.el.querySelector('button[title^="Write"]')?.click(), 60); },
      liveSystem: () => setLive('system'), liveOff: () => setLive(null), nowPlaying: () => (np ? stopNowPlaying() : startNowPlaying()),
      present: () => togglePresent(), stage: () => setStage(!box.onStage), code: () => setCodeVisible(split.classList.contains('no-code')),
      music: () => player.pick(), shot: () => box.send({ type: 'screenshot' }), copyShot: () => { copyNextShot = true; box.send({ type: 'screenshot' }); },
      sheet: () => showSheet(), newSketch: () => templateGallery(), allControls: () => player.toggleAllControls(), mute: () => player.toggleMute(),
      saveSliders: () => { const c = sel() && ctlFor(sel()); c?.save(); }, saveLook: () => { const c = sel() && ctlFor(sel()); c?.saveLook(); },
      guides: () => cycleGuides(), loopBar: () => player.loopBar(), snap: () => player.cycleSnap(), quantize: () => player.quantize(), dedupe: () => player.dedupe(),
      cycleLooks: () => setLookCycle(lookCycle ? 0 : 4), copyCode: () => { navigator.clipboard.writeText(layersOf().map((L) => `// ===== ${L.name} =====\n${L.code}`).join('\n\n')); toast('Code copied', { timeout: 1200 }); },
      shuffle: () => selCtl()?.shuffle(), shuffleBack: () => selCtl()?.shuffleStep(-1), slotA: () => selCtl()?.slotRecall('A'), slotB: () => selCtl()?.slotRecall('B'), slotC: () => selCtl()?.slotRecall('C'),
      storeA: () => selCtl()?.slotSave('A'), storeB: () => selCtl()?.slotSave('B'), quickLook: () => selCtl()?.quickLook(), nextLook: () => selCtl()?.lookStep(1),
      freezeBeat: () => freezeOn('beat'), pin: () => pinFrame(), compareOff: () => setCompare('off'), still: () => still(), safe: () => stage.setSafe(),
      live: () => setLive(liveKind ? null : store.get('three.lastLive', 'system')), autoBars: () => autoBars(), sections: () => player.autoSections(), clickTrack: () => player.setGridView({ click: !player.gridView.click }),
      quantizeTaps: () => player.setQuantize(!player.quantize), size916: () => stage.setMode('9:16'), size169: () => stage.setMode('16:9'), size45: () => stage.setMode('4:5'), size11: () => stage.setMode('1:1'), sizeFit: () => stage.setMode('fit'),
      nextSketch: () => stepSketch(1), prevSketch: () => stepSketch(-1), tools: () => toolsDrawer(document.querySelector('.lab-tools-btn')),
      stageTop: async () => { const on = await window.hub.stageOnTop?.(); toast(on == null ? 'Open the Stage window first' : on ? 'Stage window stays on top' : 'Stage window: normal', { timeout: 1500 }); },
    };
    api.restartVisible = () => { if (!box.onStage && !previewHost.offsetParent) return false; restartSim(); return true; };
    // ---------- everything the chat commands drive (tools/three-cmds.js); each returns a short result ----------
    const ctl = () => { const c = selCtl(); if (!c) throw new Error('No sketch is open'); if (!c.visible) setSlidersVisible(true); return c; };
    // the scene's timeline: its song, else its own (made there and then when it has none yet: no "load a song first")
    const needSong = () => { if (!player.loaded) ensureTimeline(); if (!player.loaded) throw new Error('Load a song first (🎵 in the timeline, or drop one on the preview)'); };
    api.cmd = {
      get player() { return player; }, // the song / video timeline (tools/cut-cmds.js: /song-trim, /cut-loop, /send-clip)
      get state() { return { sketch: current?.name, layer: sel()?.name, frame: stage.size, frozen: frozenNow, live: liveKind, song: player.loaded ? player.info().file : null, bpm: player.loaded ? player.bpm : liveBpm?.bpm ?? null, playing: player.playing, presenting: document.fullscreenElement === previewHost }; },
      run: () => run(), restart: () => restartSim(),
      // a sketch that has a song is still loading it (just opened): wait for it a moment
      waitSong: async () => { for (let i = 0; i < 40 && current && extras[current.id]?.media?.path && !player.loaded; i += 1) await sleep(100); },
      // sliders
      save: () => { const c = ctl(); const n = c.dirty(); c.save(); return n; },
      saveLook: (name) => (name ? ctl().looksApi.save(name) && name : ctl().quickLook()),
      look: (name) => ctl().looksApi.apply(name), looks: () => ctl().looksApi.list(), deleteLook: (name) => ctl().looksApi.remove(name),
      lookStep: (d) => ctl().lookStep(d), morphLook: (name, ms) => ctl().morphLook(name, ms),
      shuffle: (o) => ctl().shuffle(o), shuffleStep: (d) => ctl().shuffleStep(d), tame: (k) => ctl().tame(k), paletteColors: () => ctl().paletteColors(), tweakCode: () => ctl().tweakCode(), saveOne: (q) => { const c = ctl(); const hit = c.resolve(q); if (!hit) throw new Error(q ? `No slider "${q}"` : `Name a slider: ${c.controls().map((x) => x.label).slice(0, 12).join(', ') || 'none'}`); c.saveOne(hit.key); return hit; },
      freezeOn: (unit) => freezeOn(unit), stepSketch: (d) => { stepSketch(d); return current?.name; },
      blackout: (on) => setBlackout(on), framesToDirector: (w) => framesToDirector(w), stills: (kind) => stillsAt(kind), fixErrors: () => fixErrors(), looksForSections: (o) => looksForSections(o),
      recordSpan: (o) => { needSong(); return player.recordSpan(o); }, autoMorph: (bars) => ctl().autoMorph(bars), swapSlots: () => ctl().swapSlots(), shuffleInfo: () => ctl().shuffleInfo, setShuffle: (o) => ctl().setShuffle(o),
      groups: () => ctl().groups(), showGroup: (g) => ctl().showGroup(g), find: (q) => ctl().find(q),
      slot: (n, action = 'recall') => { const c = ctl(); if (action === 'save') return c.slotSave(n); if (action === 'clear') return c.slotClear(n); return c.slotRecall(n); }, slots: () => ctl().slots,
      morph: (t, pair) => ctl().morph(t, pair),
      resetSliders: () => ctl().reset(), undoSliders: () => ctl().undo(),
      copySliders: () => ctl().copyValues(), pasteSliders: (text) => ctl().pasteValues(text),
      resolve: (q) => ctl().resolve(q),
      setSlider: (q, v) => { const c = ctl(); const hit = c.resolve(q); if (!hit) throw new Error(`No slider "${q}". Sliders: ${c.controls().map((x) => x.label).join(', ') || 'none'}`); const done = c.setMany({ [hit.key]: v }); return done.length ? hit : null; },
      knob: (q, u) => { const c = ctl(); const hit = c.resolve(q); if (!hit) throw new Error(q ? `No slider "${q}"` : `Name a slider: ${c.controls().map((x) => x.label).slice(0, 12).join(', ') || 'none'}`); return { ...hit, value: c.setNormalized(hit.key, u, { release: true }) }; },
      lock: (q, on) => { const c = ctl(); const hit = c.resolve(q); if (!hit) throw new Error(q ? `No slider "${q}"` : `Name a slider: ${c.controls().map((x) => x.label).slice(0, 12).join(', ') || 'none'}`); c.lock(hit.key, on); return hit; },
      fav: (q, on) => { const c = ctl(); const hit = c.resolve(q); if (!hit) throw new Error(q ? `No slider "${q}"` : `Name a slider: ${c.controls().map((x) => x.label).slice(0, 12).join(', ') || 'none'}`); c.fav(hit.key, on); return hit; },
      motion: (q, mo) => { const c = ctl(); const hit = c.resolve(q); if (!hit) throw new Error(q ? `No slider "${q}"` : `Name a slider: ${c.controls().map((x) => x.label).slice(0, 12).join(', ') || 'none'}`); if (!c.setMotion(hit.key, mo)) throw new Error(`"${hit.label}" isn't a number slider`); return hit; },
      follow: (q, band, amount) => { const c = ctl(); const hit = c.resolve(q); if (!hit) throw new Error(q ? `No slider "${q}"` : `Name a slider: ${c.controls().map((x) => x.label).slice(0, 12).join(', ') || 'none'}`); if (!c.bind(hit.key, band, amount)) throw new Error(`"${hit.label}" isn't a number slider`); return hit; },
      learn: (q) => { const c = ctl(); const hit = c.resolve(q); if (!hit) throw new Error(q ? `No slider "${q}"` : `Name a slider: ${c.controls().map((x) => x.label).slice(0, 12).join(', ') || 'none'}`); midiInit().then((ok) => { if (ok) { midiLearn = { stage: 'control', layer: sel().id, key: hit.key, label: hit.label }; toast(`Turn a knob for "${hit.label}"`, { timeout: 4000 }); } }); return hit; },
      sliders: () => ctl().controls(),
      searchSliders: () => { setSlidersVisible(true); selCtl()?.focusSearch(); },
      // preview
      customSize: (w, h) => stage.setCustom(w, h),
      size: (id) => { if (!ThreeMedia.SIZES.some((z) => z.id === id)) throw new Error(`Sizes: ${ThreeMedia.SIZES.map((z) => z.id).join(', ')}`); stage.setMode(id); return stage.size; },
      freeze: (on) => { setFreeze(on ?? !frozenNow); return frozenNow; }, step: () => { if (!frozenNow) setFreeze(true); box.send({ type: 'step' }); },
      compare: (mode) => (mode === 'pin' ? pinFrame() : setCompare(mode)),
      still: (o) => still(o || {}), safe: (on, plat) => stage.setSafe(on, plat), guides: () => { cycleGuides(); return guides || 'off'; },
      present: () => togglePresent(), focus: () => setFocus(!focusOn), stage: () => setStage(!box.onStage),
      fps: (v) => { fpsSel.value = String(v); fpsSel.dispatchEvent(new Event('change')); return v; },
      // view
      code: (on) => setCodeVisible(on ?? split.classList.contains('no-code')), panel: (on) => setSlidersVisible(on ?? column.hidden),
      console: (what) => { if (what === 'clear') { consoleBox.replaceChildren(); consoleLines = []; return 'cleared'; } if (what === 'copy') { const t = consoleLines.map((l) => `${l.layer ? `[${l.layer}] ` : ''}${l.line ? `line ${l.line}: ` : ''}${l.text}`).join('\n'); navigator.clipboard.writeText(t); return t; } consolePeek = what === 'show' ? true : what === 'hide' ? false : !consoleShown(); syncConsole(); return consoleLines.slice(-12); },
      edit: (on) => setEdit(on ?? !editOn), keys: () => labKeys(),
      // sketches
      sketches: () => [...sketches].sort((a, b) => b.updatedAt - a.updatedAt).map((x) => ({ id: x.id, name: x.name, layers: x.layers?.length || 1, current: x.id === current?.id })),
      openSketch: (q) => { const n = String(q || '').toLowerCase(); const hit = sketches.find((x) => x.name.toLowerCase() === n) || sketches.find((x) => x.name.toLowerCase().includes(n)); if (!hit) return null; if (hit.id !== current?.id) openSketch(hit.id); return hit.name; },
      browse: () => browseSketches(), newSketch: (tpl) => { if (!tpl) { templateGallery(); return null; } const t = ThreeData.TEMPLATES.find((x) => x.name.toLowerCase().includes(String(tpl).toLowerCase())); if (!t) return null; create(t.name, t.code); return t.name; },
      templates: () => ThreeData.TEMPLATES.map((t) => t.name), duplicate: () => duplicate(), rename: (n) => { if (!current || !n) return null; current.name = n; save(); renderPicker(); return n; },
      // layers
      layers: () => layersOf().map((L) => ({ name: L.name, visible: L.visible !== false, selected: L.id === selId })).reverse(),
      selectLayer: (q) => { const L = findLayer(q); if (!L) return null; selectLayer(L.id); return L.name; },
      showLayer: (q, on) => { const L = findLayer(q); if (!L) return null; editLayer(L.id, { visible: on ?? L.visible === false }); return L.name; },
      solo: (q) => { const L = q ? findLayer(q) : null; setSolo(L && soloId !== L.id ? L.id : null); return L?.name || null; },
      // music
      live: async (kind) => { if (kind === 'off') { await setLive(null); return 'off'; } await setLive(kind || (liveKind ? null : store.get('three.lastLive', 'system'))); return liveKind || 'off'; },
      liveIo: (patch) => (patch ? setLiveIo(patch) : liveIo()),
      tap: () => player.tap(), tapOne: () => { needSong(); return player.tapOne(); },
      bpm: (v) => { needSong(); if (v === 'auto') { player.clearGrid(); return player.bpm; } if (v === 'x2' || v === 'double') return player.scaleBpm(2); if (v === 'half') return player.scaleBpm(0.5); if (v === 'one') { player.oneHere(); return player.bpm; } if (!player.setBpm(Number(v))) throw new Error('A tempo between 20 and 400'); return player.bpm; },
      nudgeGrid: (ms) => { needSong(); return player.nudgeGrid(ms); },
      marker: (lane) => { needSong(); player.tapLane(lane); return lane; },
      fill: (kind) => { needSong(); return player.fill(kind); }, clearMarks: (lane) => { needSong(); return player.clearMarks(lane); },
      quantize: (on) => player.setQuantize(on ?? !player.quantize), snap: (m) => { if (!player.setSnap(m)) throw new Error(`Snap: ${player.snaps.join(', ')}`); return m; },
      loop: (a, b) => { needSong(); if (a == null) { player.setLoop(null); return null; } if (!player.setLoop(a, b)) throw new Error('The loop is locked'); player.setLoopOn(true); return player.loop; },
      loopBar: () => { needSong(); player.loopBar(); return player.loop; },
      loopBars: (n) => { needSong(); return player.loopBars(n); },
      sections: () => { needSong(); return player.autoSections(); }, cue: (name) => { needSong(); return player.addCue(player.time, name || undefined); },
      cues: () => player.cues, jumpCue: (d) => { needSong(); player.jumpCue(d); return player.time; },
      gridView: (patch) => player.setGridView(patch || {}),
      play: (on) => { needSong(); player.toggle(on); }, seek: (t) => { needSong(); player.seek(t); return player.time; }, speed: (r) => { player.setRate(r); return player.rate; },
      mute: () => player.toggleMute(), music: () => player.pick(),
      loadSong: async (path) => { songOnScene(path); const r = await player.load(path); if (r.ok) assignMedia(path); return r; }, zoom: (a, b) => player.setView(a, b),
      record: (kind, o) => player.record(kind, o),
      trigPreset: (name) => applyTrigPreset(name), trigPresets: () => [...Object.keys(trigPresets()), ...store.get('three.trigPresets', []).map((x) => x.name)],
      autoBars: () => autoBars(), triggers: (on) => toggleTriggers(on ?? !trigPanel),
      // assets
      palette: (text) => { if (!text) return current?.palette || []; const cols = parseColors(text); if (cols.length < 2) throw new Error('No colors found: give a coolors.co link or hex codes'); setPalette(cols); return cols; },
      recolor: () => recolor(), refs: () => openRefs(), note: (text) => takeNote(text ? { text } : {}), sheet: () => showSheet(),
      tools: (id) => { tabs?.show(id || "sketch"); return id || "sketch"; },
    };
    if (typeof ThreeMusic !== 'undefined') {
      ThreeMusic.attach({
        player, selCtl, layers: () => layersOf().map((L) => ({ id: L.id, name: L.name, ctl: ctlFor(L) })), selectedLayer: () => sel()?.id,
        triggers: { apply: (n, o) => applyTrigPreset(n, o), names: () => Object.keys(trigPresets()), songHasOwn: () => Boolean(player.path && store.get('three.triggersBySong', {})[player.path]), button: trigPresetBtn, cfg: () => trigCfg, restore: (c) => { trigCfg = ThreeTriggers.merge(c); trigTuned = true; sendTriggers(); saveTriggers(); trigPanel?.set(trigCfg); } },
        live: { kind: () => liveKind, bpm: () => liveBpm, io: () => liveIo(), setIo: (p) => setLiveIo(p), button: liveBtn, autoGain: () => (hubLive.gain ? hubLive.auto : null) },
      });
    }
    // video footage on the timeline: exact frames, the cut list the sketch plays (tools/three-frames.js)
    if (typeof ThreeFrames !== 'undefined') ThreeFrames.attach({ player, send: (msg) => box.send(msg), sketchId: () => current?.id });
    // the Lab's Sequence: the timeline as a video timeline of scenes, footage, titles and the song (tools/three-seq.js)
    if (typeof ThreeSeq !== 'undefined') ThreeSeq.attach({ player, bar: player.el, pane, send: (msg) => box.send(msg), sketchId: () => current?.id, rerun: () => run(), director: () => api.director, get stage() { return stage; }, get scenes() { return api.scenes; } });
    // precomps (tools/three-comp.js): other scenes as layers of this one, kept live in the preview
    if (typeof ThreeComp !== 'undefined') ThreeComp.attach({ send: (msg) => box.send(msg), sketchId: () => current?.id, persist: () => persist(), select: (id) => selectLayer(id), player });
    pane.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      const plain = !typing && !e.ctrlKey && !e.altKey && !e.metaKey;
      if (plain && /^[nfpwrob`|/]$/i.test(e.key) && !e.repeat) Usage.key(`${e.shiftKey && /[a-z]/i.test(e.key) ? 'Shift+' : ''}${e.key.toUpperCase()}`, 'Lab');
      if (plain && presentKeys(e)) { e.preventDefault(); return; }
      if (plain && e.key.toLowerCase() === 'n') { e.preventDefault(); takeNote(); return; }
      // F freezes the picture (you freeze a lot, Focus was never used: it moved to Shift+F)
      if (plain && e.key.toLowerCase() === 'f') { e.preventDefault(); if (e.shiftKey) setFocus(!focusOn); else setFreeze(!frozenNow); return; }
      // R shuffles the selected layer's sliders, Shift+R steps back through the shuffles
      if (plain && e.key.toLowerCase() === 'r' && !editOn) { e.preventDefault(); const c = selCtl(); if (!c) return; if (!c.visible) setSlidersVisible(true); if (e.shiftKey) c.shuffleStep(-1); else c.shuffle(); return; }
      // Shift+1…5: Fit, 9:16, 16:9, 4:5, 1:1 (the sizes you switch between)
      if (plain && e.shiftKey && /^Digit[1-5]$/.test(e.code)) { e.preventDefault(); stage.setMode(stage.pillOrder[Number(e.code.slice(5)) - 1]); Usage.key(`Shift+${e.code.slice(5)}`, 'Lab frame size'); return; }
      if (plain && e.key.toLowerCase() === 'o') { e.preventDefault(); browseSketches(); return; }
      if (plain && e.shiftKey && /^[abc]$/i.test(e.key)) { e.preventDefault(); const cc = selCtl(); if (cc && !cc.slotRecall(e.key.toUpperCase())) toast(`Slot ${e.key.toUpperCase()} is empty`, { timeout: 1000 }); return; }
      if (e.ctrlKey && !e.altKey && (e.key === 'PageDown' || e.key === 'PageUp')) { e.preventDefault(); stepSketch(e.key === 'PageDown' ? 1 : -1); return; }
      if (plain && e.key === '`') { e.preventDefault(); consolePeek = !consoleShown(); syncConsole(); return; }
      if (plain && e.key === '/') { e.preventDefault(); setSlidersVisible(true); selCtl()?.focusSearch(); return; }
      if (plain && e.key === '|') { e.preventDefault(); pinFrame(); return; }
      if (plain && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); setLive(liveKind ? null : store.get('three.lastLive', /Mac/.test(navigator.platform) ? 'mic' : 'system')); return; }
      if (!typing && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'p') { e.preventDefault(); togglePresent(); return; }
      if (!typing && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'w') { e.preventDefault(); setWrite(!writeArmed); return; }
      if (!typing && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'e') { e.preventDefault(); setEdit(!editOn); return; }
      if (liveKind && !typing && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey && !e.repeat && e.key.toLowerCase() === 't' && typeof ThreeMusic !== 'undefined') { e.preventDefault(); ThreeMusic.liveTap(); return; }
      // (Space on the button you just clicked, e.g. Tap, plays / pauses without also pressing that button on key-up)
      if (player.onKey(e)) { e.preventDefault(); if (e.key === ' ' && e.target.closest?.('button')) e.target.addEventListener('keyup', (u) => u.preventDefault(), { once: true }); if (!e.repeat) Usage.key(`${e.ctrlKey ? 'Ctrl+' : ''}${e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key}`, 'Lab'); }
    });
    pane.tabIndex = -1;
    let ranOnce = false;
    // what the preview runs now (see run()): each layer's code as sent (instrumented for sliders or not), and the sketch
    const ranCode = new Map(); let ranSketch = null;
    let rebuildWaiting = false;
    // Per-sketch looks and music links for the sliders, song, frame size and selected layer.
    let extras = {};
    let extrasLoaded = false; // never write the empty placeholder over your saved extras (a reload while loading)
    const saveExtras = debounce(() => { if (extrasLoaded) window.hub.kvSet('three-lab-extras', extras); }, 500);
    let consoleLines = [];
    let lastStats = null;
    let pendingShot = null;
    // Requests to the sandbox that answer later (eval / input), by id.
    const sandboxCalls = new Map();
    function sandboxCall(msg, timeout) {
      return new Promise((resolve) => {
        const id = `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
        sandboxCalls.set(id, resolve);
        box.send({ ...msg, id });
        setTimeout(() => { if (sandboxCalls.has(id)) { sandboxCalls.delete(id); resolve({ ok: false, error: 'The sketch did not answer (is it running?)' }); } }, timeout);
      });
    }

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
      if (!consoleShown()) { if (level === 'error') unseen.errors += 1; else if (level === 'warn') unseen.other += 1; syncConsole(); }
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
      // the sequence's own messages (and a realtime render's recording) go to tools/three-seq.js
      if (typeof ThreeSeq !== 'undefined' && (ThreeSeq.onMessage(msg) || ThreeSeq.takeRecording(msg))) return;
      // a key pressed while the picture had focus: the Lab's shortcuts handle it as if pressed here
      if (msg.type === 'host-key') { const { type: _t, source: _s, ...k } = msg; pane.dispatchEvent(new KeyboardEvent('keydown', { ...k, bubbles: true, cancelable: true })); return; }
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
      if (msg.type === 'drawn') { building(msg.layer, false); return; }
      if (msg.type === 'error') {
        const lid = msg.layer || (layersOf().length === 1 ? layersOf()[0].id : null);
        if (lid) building(lid, false);
        if (lid && controllers.get(lid)?.onError(msg)) return; // couldn't attach sliders: it re-runs as-is
        errors.push({ ...msg, layer: lid });
        log('error', msg.message, msg.line, lid);
        if (!lid || lid === selId) editor.setErrorLines(errors.filter((e) => !e.layer || e.layer === selId).map((e) => e.line).filter(Boolean));
      }
      if (msg.type === 'ctx') {
        const r = box.frame.getBoundingClientRect(); const k = r.width / (box.frame.offsetWidth || r.width);
        showMenu(r.left + msg.x * k, r.top + msg.y * k, previewMenuItems());
        return;
      }
      if (msg.type === 'gpu-lost') { showStall('The preview lost its GPU context.'); return; }
      if (msg.type === 'trig-viz') { trigPanel?.feed(msg); return; }
      if (msg.type === 'stats') {
        lastStatsAt = Date.now();
        if (stall.querySelector('.three-stall-text').textContent.includes('responding')) hideStall();
        lastStats = { fps: Math.round(msg.fps), worstFrameMs: Math.round(msg.worst || 0), renderMs: Number(msg.ms.toFixed(2)), drawCalls: msg.calls, triangles: msg.triangles, points: msg.points, geometries: msg.geometries, textures: msg.textures, shaders: msg.programs };
        stats.hidden = false;
        stats.replaceChildren(
          el('b', { class: msg.fps < 30 ? 'bad' : msg.fps < 55 ? 'warn' : 'ok', text: `${Math.round(msg.fps)} fps` }),
          msg.quality < 1 ? el('span', { class: 'warn', text: `preview ${Math.round(msg.quality * 100)}%`, title: 'Frames were dropping, so the preview draws at a lower resolution while you watch. Stills, screenshots and recordings stay at full resolution.' }) : null,
          msg.worst ? el('span', { class: msg.worst > 40 ? 'bad' : msg.worst > 24 ? 'warn' : 'ok', text: `worst ${Math.round(msg.worst)} ms`, title: 'The longest gap between two frames in the last half second: over ~25 ms shows as a stutter (60 Hz = 16.7 ms per frame)' }) : null,
          el('span', { text: `${msg.ms.toFixed(1)} ms render` }), el('span', { text: `${msg.calls} draw calls` }),
          el('span', { text: `${msg.triangles.toLocaleString()} tris` }), msg.points ? el('span', { text: `${msg.points.toLocaleString()} points` }) : null,
          el('span', { text: `${msg.geometries} geo · ${msg.textures} tex · ${msg.programs} shaders` }));
      }
      if (/^edit-/.test(msg.type)) { onEditMessage(msg); return; }
      if (msg.type === 'live-tempo') { if (liveKind) { liveBpm = msg; paintLive(); if (typeof ThreeMusic !== 'undefined') ThreeMusic.liveTempo(msg); } return; }
      if (msg.type === 'live-state') { if (msg.error) toast(`Live sound: ${msg.error}`, { type: 'error', timeout: 5000 }); if (!msg.on && msg.error) { liveKind = null; paintLive(); } return; }
      if (msg.type === 'ready' && msg.again && ranOnce) { console.warn('Lab preview restarted by itself: running the sketch again'); run({ again: true }); }
      if (msg.type === 'ready') { if (frozenNow) box.send({ type: 'freeze', on: true }); if (guides) box.send({ type: 'guides', kind: guides }); if (previewHost.classList.contains('presenting')) box.send({ type: 'present', on: true }); sendTriggers(); if (trigPanel) box.send({ type: 'trig-watch', on: true }); }
      if (msg.type === 'ready' && liveKind) {
        // a reloaded preview: the hub page keeps capturing, the Stage captures again by itself
        sendLiveGain();
        if (box.onStage) { hubLiveStop(); setTimeout(() => window.hub.liveStart(liveKind), 400); } else if (hubLive.stream) box.send({ type: 'live-remote', on: true, kind: liveKind }); else setTimeout(() => window.hub.liveStart(liveKind), 400);
      }
      if (msg.type === 'eval-result' || msg.type === 'input-result') { sandboxCalls.get(msg.id)?.(msg); sandboxCalls.delete(msg.id); return; }
      if (msg.type === 'shot') {
        if (msg.tag === 'thumb') { const fn = thumbShot; thumbShot = null; fn?.(msg.dataUrl); return; }
        if (msg.tag === 'get') { const fn = pendingShot; pendingShot = null; fn?.(msg.dataUrl); return; }
        if (pendingShot) { pendingShot(msg.dataUrl); pendingShot = null; } else if (copyNextShot) {
          copyNextShot = false;
          Promise.resolve().then(() => pngBlob(msg.dataUrl)).then((b) => navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]))
            .then(() => toast('Screenshot copied: paste it anywhere', { timeout: 1800 }), (err) => toast(`Couldn't copy: ${err.message}`, { type: 'error' }));
        } else saveDataUrl(msg.dataUrl, `${current?.name || 'sketch'}.png`);
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
    // Cycle looks: every N bars while the song plays, each layer moves to its next saved look (morphing)
    let lookCycle = store.get('three.lookCycle', 0);
    let lookTimer = 0; let lookBar = -1;
    function lookCycleMenu(anchor) {
      const r = anchor.getBoundingClientRect();
      showMenu(r.left, r.bottom + 4, [[0, 'Off'], [1, 'Every bar'], [2, 'Every 2 bars'], [4, 'Every 4 bars'], [8, 'Every 8 bars']].map(([n, label]) => ({ label: `${lookCycle === n ? '✓ ' : ''}${label}`, action: () => setLookCycle(n) })));
    }
    function setLookCycle(n) {
      lookCycle = n; store.set('three.lookCycle', n);
      clearInterval(lookTimer); lookTimer = 0; lookBar = -1;
      if (!n) { for (const L of layersOf()) controllers.get(L.id)?.endLook?.(); toast('Look cycling off', { timeout: 1200 }); return; }
      const looksCount = layersOf().reduce((s, L) => s + (controllers.get(L.id)?.looksApi.list().length || 0), 0);
      toast(looksCount ? `Looks change every ${n} bar${n === 1 ? '' : 's'} while it plays` : 'Save a few looks first (Sliders → + Save look)', { timeout: 2200 });
      lookTimer = setInterval(() => {
        if (!player.playing) { if (lookBar !== -1) { lookBar = -1; for (const L of layersOf()) controllers.get(L.id)?.endLook?.(); } return; }
        const barLen = (60 / player.bpm) * 4;
        const bar = Math.floor(player.time / barLen);
        if (bar === lookBar) return;
        lookBar = bar;
        if (bar % n) return;
        for (const L of layersOf()) {
          const c = controllers.get(L.id); const names = c?.looksApi.list() || [];
          if (names.length) c.playLook(names[Math.floor(bar / n) % names.length]);
        }
      }, 40);
    }
    if (lookCycle) queueMicrotask(() => setLookCycle(lookCycle));
    // ⟲ Restart: everything from scratch (a new page, GPU context and audio), when a sketch bugs out.
    // right-click on the picture
    // Right-click the picture (round 7): the frequent things first, the rest in a few open submenus.
    function previewMenuItems() {
      const ctl = selCtl();
      return [
        { label: frozenNow ? '▶ Unfreeze' : '❚❚ Freeze', key: 'F', action: () => setFreeze(!frozenNow) },
        ...(typeof ThreeSeq !== 'undefined' ? [ThreeSeq.previewItem()] : []),
        ...(typeof ThreeComp !== 'undefined' ? [ThreeComp.previewItem()] : []),
        { label: 'Frame size', hint: stage.size.id === 'fit' ? 'Fit' : stage.size.id, items: () => [
          ...stage.pillOrder.map((id, k) => ({ label: id === 'fit' ? 'Fit' : id, hint: ThreeMedia.SIZES.find((z) => z.id === id)?.title || '', key: `Shift+${k + 1}`, checked: stage.size.id === id, action: () => stage.setMode(id) })),
          '-', { label: 'Safe zones', checked: Boolean(stage.safe), action: () => stage.setSafe() },
        ] },
        { label: 'Capture', items: () => [
          { label: '📷 Still at the frame size', action: () => still() },
          { label: '📋 Copy this frame', action: () => still({ copy: true }) },
          { label: 'Save a screenshot', hint: 'as it shows here', action: () => box.send({ type: 'screenshot' }) },
          { label: '◐ Pin this frame to compare', key: '|', action: () => pinFrame() },
          { label: '🎞 Contact sheet', action: () => showSheet() },
          { label: '📌 Note at this moment', key: 'N', action: () => takeNote() },
          // round 7's capture (screenshots / recordings of Hearth itself, in the captures folder) from here too
          ...(typeof Capture !== 'undefined' ? ['-',
            { label: '● Record the Lab preview…', hint: 'for your intro video', action: () => Capture.record({ target: 'lab' }).catch((e) => toast(e.message, { type: 'error' })) },
            { label: '◉ More capture…', key: 'Ctrl+Alt+S', action: () => Capture.menu(Math.max(8, innerWidth / 2 - 120), 80, Capture.mainItems()) }] : []),
        ] },
        ctl ? { label: 'Sliders', items: () => [
          { label: '🎲 Shuffle', key: 'R', action: () => ctl.shuffle() },
          { label: 'The shuffle before', key: 'Shift+R', action: () => ctl.shuffleStep(-1) },
          { label: '💾 Save into the code', key: 'Ctrl+S', action: () => { ctl.save(); toast('Sliders saved into the code', { timeout: 1200 }); } },
          { label: 'Save as a look', key: 'Ctrl+Shift+S', action: () => ctl.quickLook() },
          { label: 'Next look', action: () => ctl.lookStep(1) },
        ] } : null,
        { label: 'View', items: () => [
          { label: '▣ Present', key: 'P', action: () => togglePresent() },
          { label: box.onStage ? '🖥 Back from the Stage window' : '🖥 Stage window', action: () => setStage(!box.onStage) },
          { label: '⛶ Focus', key: 'Shift+F', checked: focusOn, action: () => setFocus(!focusOn) },
          { label: 'Guides', hint: GUIDES.find(([k]) => k === guides)[1], items: () => GUIDES.map(([k, l]) => ({ label: l, checked: k === guides, action: () => { guides = k; store.set('three.guides', k); box.send({ type: 'guides', kind: k }); guidesBtn.classList.toggle('on', Boolean(k)); } })) },
        ] },
        '-',
        { label: '⟲ Restart from scratch', key: 'Ctrl+Shift+Enter', action: () => restartSim() },
        { label: 'Lab keys', key: '?', action: () => (typeof KeysUI !== 'undefined' ? KeysUI.open() : labKeys()) },
        ...(typeof Declutter !== 'undefined' ? Declutter.customiseItems('Lab preview') : []),
      ];
    }
    // ⌗ composition guides over the picture (not in screenshots / videos)
    const GUIDES = [['', 'off'], ['thirds', 'thirds'], ['golden', 'golden ratio'], ['center', 'center cross']];
    let guides = store.get('three.guides', '');
    const guidesBtn = el('button', { class: 'stage-btn', text: '⌗', title: 'Composition guides: thirds, golden ratio, center (not in screenshots or videos)', on: { click: () => cycleGuides() } });
    function cycleGuides() {
      guides = GUIDES[(GUIDES.findIndex(([k]) => k === guides) + 1) % GUIDES.length][0];
      store.set('three.guides', guides);
      box.send({ type: 'guides', kind: guides });
      guidesBtn.classList.toggle('on', Boolean(guides));
      toast(`Guides: ${GUIDES.find(([k]) => k === guides)[1]}`, { timeout: 900 });
    }
    guidesBtn.classList.toggle('on', Boolean(guides));
    // ❚❚ freeze: hold the picture (the music and the timeline go on); . steps one frame while frozen
    let frozenNow = false;
    const freezeBtn = el('button', { class: 'stage-btn freeze-btn', text: '❚❚ Freeze', title: 'Freeze the picture (F or \\) · while frozen, . steps one frame · | pins this frame to compare with what comes next', dataset: { feature: 'Freeze', key: 'F' }, on: { click: () => setFreeze(!frozenNow) } });
    freezeBtn.addEventListener('dblclick', (e) => { if (frozenNow) { e.preventDefault(); setFreeze(true); box.send({ type: 'step' }); } }); // frozen: double-click = one frame
    freezeBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ThreeTweaks.menu(e.clientX, e.clientY, ['Freeze', [frozenNow ? 'Unfreeze' : 'Freeze now', 'F or \\', () => setFreeze(!frozenNow)],
        ['On the next beat', 'Lands exactly on the beat while it plays', () => freezeOn('beat')], ['On the next bar', 'On the next 1', () => freezeOn('bar')], ['On the next kick', 'Your next kick marker', () => freezeOn('kick')],
        ['◐ Pin this frame', '|', () => pinFrame()], ['📷 Still of this frame', 'Exact size', () => still()], [frozenNow ? 'One frame forward' : '', '.', () => box.send({ type: 'step' })].filter(() => frozenNow)].filter((x) => !Array.isArray(x) || x.length));
    });
    // freeze exactly on the next beat / bar (counts in the song's grid; without a song: now)
    function freezeOn(unit = 'beat') {
      const wait = player.loaded && player.playing ? player.untilNext(unit) : 0;
      if (wait == null || wait > 8 || wait < 0.01) { setFreeze(true); return 0; }
      setTimeout(() => setFreeze(true), Math.max(0, wait * 1000 - 8));
      return wait;
    }
    function setFreeze(on) {
      frozenNow = on;
      box.send({ type: 'freeze', on });
      freezeBtn.textContent = on ? '▶ Frozen' : '❚❚ Freeze';
      if (on && store.get('three.pinOnFreeze', false)) setTimeout(() => pinFrame(), 120);
      freezeBtn.classList.toggle('on', on);
      previewHost.classList.toggle('frozen', on);
    }
    // ◐ Compare: pin a frame (|), then see it over the live picture as an onion skin, or a wipe you drag across.
    // Freeze, pin, unfreeze, move a slider: before and after side by side.
    let pinned = null; // { url, mode: 'onion' | 'wipe', opacity, split }
    const onionImg = el('img', { class: 'lab-onion-img', alt: '' });
    const wipeBar = el('div', { class: 'lab-wipe-bar', title: 'Drag to move the wipe' });
    const onion = el('div', { class: 'lab-onion', hidden: true }, onionImg, wipeBar);
    const compareBtn = el('button', { class: 'stage-btn', text: '◐', title: 'Compare: pin this frame (|) and see it over the live picture · click again: onion skin → wipe → off · right-click: options', dataset: { feature: 'Compare frame', key: '|' }, on: { click: () => cycleCompare() } });
    compareBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); compareMenu(e.clientX, e.clientY); });
    compareBtn.hidden = true;
    previewHost.append(onion);
    function placeOnion() { if (!pinned) return; const r0 = stage.rect; Object.assign(onion.style, { left: `${r0.left}px`, top: `${r0.top}px`, width: `${r0.width}px`, height: `${r0.height}px` }); paintOnion(); }
    function paintOnion() {
      onion.hidden = !pinned;
      compareBtn.hidden = !pinned; // ◐ shows while a frame is pinned (| or ⋯ pins one)
      compareBtn.classList.toggle('on', Boolean(pinned));
      compareBtn.textContent = pinned ? (pinned.mode === 'wipe' ? '◐ Wipe' : pinned.mode === 'diff' ? '◐ Diff' : '◐ Onion') : '◐';
      if (!pinned) return;
      onion.dataset.mode = pinned.mode;
      onionImg.style.opacity = pinned.mode === 'onion' ? pinned.opacity : 1;
      onionImg.style.mixBlendMode = pinned.mode === 'diff' ? 'difference' : 'normal';
      onionImg.style.clipPath = pinned.mode === 'wipe' ? `inset(0 ${100 - pinned.split * 100}% 0 0)` : 'none';
      wipeBar.style.left = `${pinned.split * 100}%`;
      wipeBar.hidden = pinned.mode !== 'wipe';
    }
    new ResizeObserver(() => placeOnion()).observe(previewHost);
    async function pinFrame({ mode } = {}) {
      const url = await director.shot();
      if (!url) { toast('Nothing is rendering to pin', { type: 'error' }); return false; }
      pinned = { url, mode: mode || pinned?.mode || 'onion', opacity: pinned?.opacity ?? 0.5, split: pinned?.split ?? 0.5 };
      onionImg.src = url;
      placeOnion();
      toast('Frame pinned: change something and compare · ◐ onion → wipe → off', { timeout: 2200 });
      return true;
    }
    function setCompare(mode) {
      if (mode === 'off' || !mode) { pinned = null; paintOnion(); return 'off'; }
      if (!pinned) { pinFrame({ mode }); return mode; }
      pinned.mode = mode; paintOnion(); return mode;
    }
    function cycleCompare() { if (!pinned) pinFrame(); else setCompare(pinned.mode === 'onion' ? 'wipe' : pinned.mode === 'wipe' ? 'diff' : 'off'); }
    function compareMenu(x, y) {
      ThreeTweaks.menu(x, y, ['Compare with a pinned frame',
        ['Pin this frame', '| · replaces the pinned one', () => pinFrame()],
        ['Onion skin', 'The pinned frame over the live picture, see-through', () => setCompare('onion'), pinned?.mode === 'onion'],
        ['Wipe', 'Pinned on the left, live on the right: drag the line', () => setCompare('wipe'), pinned?.mode === 'wipe'],
        ['Difference', 'Only what changed lights up', () => setCompare('diff'), pinned?.mode === 'diff'],
        ['Pin when I freeze', 'Each freeze also pins the frame', () => store.set('three.pinOnFreeze', !store.get('three.pinOnFreeze', false)), store.get('three.pinOnFreeze', false)],
        ...(pinned?.mode === 'onion' ? [0.25, 0.5, 0.75].map((o) => [`${Math.round(o * 100)}% see-through`, '', () => { pinned.opacity = o; paintOnion(); }, pinned.opacity === o]) : []),
        pinned ? ['Save the pinned frame…', '', () => saveDataUrl(pinned.url, `${current?.name || 'sketch'} pinned.png`)] : null,
        pinned ? ['Send before / after to the director', 'Both frames in its chat', () => framesToDirector('compare')] : null,
        pinned ? ['Off', '', () => setCompare('off')] : null]);
    }
    wipeBar.addEventListener('pointerdown', (e) => {
      wipeBar.setPointerCapture(e.pointerId);
      const move = (ev) => { const r0 = onion.getBoundingClientRect(); pinned.split = Math.max(0, Math.min(1, (ev.clientX - r0.left) / r0.width)); paintOnion(); };
      wipeBar.addEventListener('pointermove', move);
      wipeBar.addEventListener('pointerup', () => wipeBar.removeEventListener('pointermove', move), { once: true });
    });
    // 📷 Still: the frame at its exact output size (1080×1920…) as a PNG named after the sketch and size.
    // Shift+click copies it; right-click picks one of the four sizes (the preview switches, shoots, comes back).
    const stillBtn = el('button', { class: 'stage-btn', text: '📷', title: 'Still: save this frame as a PNG at the exact frame size · Shift+click: copy it · right-click: a still at 9:16 / 16:9 / 4:5 / 1:1', dataset: { feature: 'Still' } });
    stillBtn.addEventListener('click', (e) => still({ copy: e.shiftKey }));
    stillBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); ThreeTweaks.menu(e.clientX, e.clientY, ['A still at', ...stage.pillOrder.filter((id) => id !== 'fit').map((id) => [id, ThreeMedia.SIZES.find((z) => z.id === id).title, () => still({ size: id })]), ['Copy this frame', 'To the clipboard', () => still({ copy: true })],
      ['Send this frame to the director', 'Attached in its chat, ready to describe', () => framesToDirector('frame')],
      'A folder of stills', ['In all four sizes', '9:16, 16:9, 4:5, 1:1 as PNGs', () => stillsAt('sizes')], [player.loaded ? 'At every cue' : 'Across the song', player.cues.length ? `${player.cues.length} cues` : 'six evenly spaced frames', () => stillsAt('cues')], store.get('three.stillsDir', '') ? ['Choose another folder…', store.get('three.stillsDir', ''), () => { store.set('three.stillsDir', ''); stillsFolder(); }] : null]); });
    async function still({ size = null, copy = false } = {}) {
      const before = stage.size.id;
      if (size && size !== before) { stage.setMode(size); await sleep(2200); }
      const url = await director.shot();
      if (size && size !== before) stage.setMode(before);
      if (!url) { toast('Nothing is rendering', { type: 'error' }); return null; }
      const z = ThreeMedia.SIZES.find((x) => x.id === (size || before));
      const name = `${current?.name || 'sketch'}${z?.w ? ` ${z.w}x${z.h}` : ''}${player.loaded ? ` ${fmtMs(player.time).replace(/:/g, '-')}` : ''}.png`.replace(/[\\/:*?"<>|]/g, '_');
      if (copy) {
        const b = pngBlob(url);
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': b })]).then(() => toast('Still copied', { timeout: 1200 }), (err) => toast(`Couldn't copy: ${err.message}`, { type: 'error' }));
      } else saveDataUrl(url, name);
      return url;
    }
    // A folder of stills: one at every cue (or across the song), or the frame in all four sizes, as PNGs.
    // Frames to the Three Director's chat: this frame, or the pinned one and the live one side by side in time
    async function framesToDirector(which = 'frame') {
      const agent = H.agents().find((a) => a.threeTools);
      if (!agent) { toast('Add an agent with Three.js tools first (the Three Director)', { type: 'error' }); return false; }
      const urls = which === 'compare' && pinned ? [pinned.url, await director.shot()] : [await director.shot()];
      const paths = [];
      for (const [k, u] of urls.entries()) if (u) paths.push(await window.hub.saveAttachment(`${safeName(current?.name || 'sketch')} ${which === 'compare' ? (k ? 'after' : 'before') : 'frame'}.png`, u.split(',')[1]));
      if (!paths.length) return false;
      activate(agent.id);
      await Native.attachPaths(agent.id, paths);
      Native.setDraft(agent.id, which === 'compare' ? 'Before (pinned) and after (now): ' : `This frame${player.loaded ? ` at ${fmtMs(player.time)}` : ''} of "${current?.name}": `);
      return true;
    }
    async function stillsFolder() {
      let dir = store.get('three.stillsDir', '');
      if (!dir || !(await window.hub.fs.stat(dir))?.isDir) { [dir] = await window.hub.openDialog({ title: 'Folder for the stills', properties: ['openDirectory', 'createDirectory'] }); if (!dir) return null; store.set('three.stillsDir', dir); }
      return dir;
    }
    const pngBytes = (url) => Uint8Array.from(atob(url.split(',')[1]), (ch) => ch.charCodeAt(0));
    // a data URL as a Blob without fetch() (the page's CSP blocks fetching data: URLs, so copying a still failed)
    function pngBlob(url) { return new Blob([pngBytes(url)], { type: 'image/png' }); }
    const safeName = (x) => String(x).replace(/[\\/:*?"<>|]/g, '_');
    async function stillsAt(kind = 'cues') {
      const dir = await stillsFolder();
      if (!dir) return 0;
      const sep = dir.includes('\\') ? '\\' : '/';
      const base = safeName(current?.name || 'sketch');
      let n = 0;
      const t0 = toast(kind === 'sizes' ? 'Stills in four sizes…' : 'A still at every cue…', { timeout: 60000 });
      try {
        if (kind === 'sizes') {
          const before = stage.size.id;
          for (const id of ['9:16', '16:9', '4:5', '1:1']) { stage.setMode(id); await sleep(2200); const url = await director.shot(); if (url) { const z = ThreeMedia.SIZES.find((x) => x.id === id); await window.hub.fs.write(`${dir}${sep}${base} ${z.w}x${z.h}.png`, pngBytes(url)); n += 1; } }
          stage.setMode(before);
        } else {
          const was = player.time; const playing = player.playing;
          if (playing) player.toggle(false);
          const cues = player.cues.length ? player.cues : Array.from({ length: 6 }, (_, i) => ({ time: (player.duration * (i + 0.5)) / 6, name: `${i + 1}` }));
          for (const [i, c] of cues.entries()) { player.seek(c.time + 0.05); await sleep(450); const url = await director.shot(); if (url) { await window.hub.fs.write(`${dir}${sep}${base} ${String(i + 1).padStart(2, '0')} ${safeName(c.name)}.png`, pngBytes(url)); n += 1; } }
          player.seek(was); if (playing) player.toggle(true);
        }
      } finally { t0.remove(); }
      toast(`${n} stills saved`, { timeout: 3000, action: { label: 'Show', fn: () => window.hub.fs.open(dir) } });
      return n;
    }
    // the preview's own ⋯: guides, safe zones, stage, fps, present
    const previewMoreBtn = el('button', { class: 'stage-btn', text: '⋯', title: 'Guides, safe zones, Stage window, frame rate, present', dataset: { feature: 'Preview more' }, on: { click: (e) => { const r0 = e.currentTarget.getBoundingClientRect(); ThreeTweaks.menu(r0.right - 280, r0.bottom + 4, previewMenu()); } } });
    function previewMenu() {
      return ['Preview',
        ['⌗ Composition guides', `Now: ${GUIDES.find(([k]) => k === guides)[1]} · click for the next`, () => cycleGuides(), Boolean(guides), 'Guides'],
        ['Safe zones', 'Platform buttons / captions / crops for the size (/safe tiktok | reels | shorts)', () => stage.setSafe(), stage.safe, 'Safe zones'],
        ['◐ Pin this frame to compare', '|', () => pinFrame()],
        typeof Decide !== 'undefined' ? ['✦ Let Astra pick the frame size', 'For this picture · Undo puts yours back', () => Decide.run('size')] : null,
        [box.onStage ? '🖥 Back from the Stage window' : '🖥 Stage window', 'Its own window, steady frames', () => setStage(!box.onStage), box.onStage, 'Stage window'],
        ['Frame rate', ({ 0: 'Max fps', 60: '60 fps', 30: '30 fps' })[store.get('three.fpsCap', 0)] || '', [['0', 'Max fps'], ['60', '60 fps'], ['30', '30 fps']].map(([v, l]) => [l, '', () => { fpsSel.value = v; fpsSel.dispatchEvent(new Event('change')); }, String(store.get('three.fpsCap', 0)) === v, 'Preview fps'])]];
    }
    let restartNext = false;
    function restartSim() {
      if (player.recording) { toast('Stop the recording first', { type: 'error' }); return; }
      restartNext = true;
      toast('Restarting the simulation from scratch', { timeout: 1400 });
      if (!run()) restartNext = false;
    }
    // When the preview stops answering (or loses its GPU), a banner offers the restart.
    let lastStatsAt = 0;
    const stall = el('div', { class: 'three-stall', hidden: true }, el('span', { class: 'three-stall-text' }),
      el('button', { class: 'primary small', text: '⟲ Restart', title: 'Restart the simulation from scratch', on: { click: () => restartSim() } }),
      el('button', { class: 'ghost small', text: '×', title: 'Hide', on: { click: () => hideStall() } }));
    function showStall(text) { stall.querySelector('.three-stall-text').textContent = text; stall.hidden = false; }
    function hideStall() { stall.hidden = true; }
    previewHost.append(stall);
    setInterval(() => {
      if (!lastStatsAt || !stall.hidden) return;
      const visible = document.visibilityState === 'visible' && (box.onStage || previewHost.offsetParent);
      if (!visible) { lastStatsAt = Math.max(lastStatsAt, Date.now() - 2000); return; } // hidden views draw nothing
      if (Date.now() - lastStatsAt > 8000) showStall('The preview stopped responding.');
    }, 2000);
    // How a change reaches the preview (round 6 "live": no whole-page reloads for edits):
    //   hot     one layer re-runs in place (its old picture cross-fades into the new one; a new layer wipes in)
    //   sync    only the layers whose code changed re-run, removed ones fade out, the others just get their props
    //           (a jam round, an undo, a backstage edit, sliders attached / detached)
    //   (none)  every layer runs again from the start, in the same page (another sketch, ▶ Run): the old picture
    //           cross-fades into the new one, three.js stays loaded, the music and live sound go on
    //   reload  a new page, only for what needs one: another three.js version or pixel ratio (exact frame sizes),
    //           the Stage window, ⟲ Restart from scratch, a page that isn't up. It keeps a picture of the scene on screen
    //           and cross-fades once the new page has drawn (sandboxFrame `pretty`).
    // again: the page restarted by itself and is up but empty: everything runs as on a new page, without loading another
    function run({ hot = false, layer = null, sync = false, reload = false, again = false } = {}) {
      if (!current) return false;
      const up = !again && box.ready && ranOnce && !box.stale && !restartNext && !reload;
      // the Sequence view owns the preview: the sketch's changes reach the clips that use it; a page that has to be
      // replaced (a new frame size, a restart) is, and the sequence goes back on it ('ready')
      if (typeof ThreeSeq !== 'undefined' && ThreeSeq.keep(current.id)) {
        if (!up) { if (!again && (!box.loading || box.stale || restartNext || reload)) box.reload(restartNext); restartNext = false; ranOnce = true; player.attach({ playing: false }); box.send({ type: 'fps-cap', value: store.get('three.fpsCap', 0) }); }
        ThreeSeq.sketchChanged(current.id);
        return true;
      }
      if ((hot || sync) && !up) { hot = false; sync = false; }
      if (player.recording) {
        // A rebuild would end the recording; it waits until the video is saved.
        if (hot || sync) { if (!rebuildWaiting) toast('That change rebuilds the scene: it applies when you stop recording', { timeout: 2500 }); rebuildWaiting = true; return false; }
        toast('Stop the recording first', { type: 'error' });
        return false;
      }
      snapshot();
      const target = hot ? layerById(layer || selId) : null;
      if (hot && !target) hot = false;
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
      const codeOf = (L) => preps.get(L.id)?.code ?? L.code;
      // sync: which layers actually need to run again
      const rerun = sync ? layersOf().filter((L) => ranCode.get(L.id) !== codeOf(L)) : hot ? [target] : layersOf();
      const gone = sync ? [...ranCode.keys()].filter((id) => !layerById(id)) : [];
      const fresh = !hot && !sync && !up; // a new page
      const partial = hot || sync;
      if (partial) {
        const ids = new Set(rerun.map((L) => L.id));
        consoleLines = consoleLines.filter((l) => l.layer && ![...ids].some((id) => layerById(id)?.name === l.layer));
        errors = errors.filter((e) => e.layer && !ids.has(e.layer) && layerById(e.layer));
      } else { consoleLines = []; errors = []; }
      editor.setErrorLines(errors.filter((e) => e.layer === selId).map((e) => e.line).filter(Boolean));
      consoleBox.replaceChildren();
      unseen = { errors: 0, other: 0 };
      syncConsole();
      if (!partial) { lastStats = null; lastStatsAt = 0; hideStall(); }
      if (fresh) { stats.hidden = true; if (!again && (!box.loading || box.stale || restartNext || reload)) box.reload(restartNext); restartNext = false; }
      box.send({ type: 'tweak-init', values, keys, mods: mergedMods() });
      if (fresh) { player.attach(); sendRefs(); } else if (!partial && ranSketch !== current.id) { sendRefs(); sendTriggers(); }
      if (!fresh && !partial && !player.path) box.send({ type: 'media-unload' }); // a sketch without a song: the last one stops
      const valuesOf = (L) => { const p = preps.get(L.id); if (!p) return undefined; const b = baseOf(L); return Object.fromEntries(p.values.map((v, i) => [b + i, v])); };
      // (a precomp: another scene as this layer, tools/three-comp.js: its scene's layers come with it)
      const pcOf = (L) => (L.precomp && typeof ThreeComp !== 'undefined' ? ThreeComp.specFor(L, current.id, layersOf().indexOf(L)) : null);
      const spec = (L) => { const pc = pcOf(L); return { id: L.id, code: codeOf(L), values: valuesOf(L), ...layerProps(L), ...(pc ? { precomp: pc } : {}) }; };
      // new code fades in over the old picture; a layer the sandbox doesn't run yet wipes in
      const fx = (L) => (ranCode.has(L.id) ? 'xfade' : 'reveal');
      if (partial) {
        for (const id of gone) { box.send({ type: 'remove-layer', id, fade: true }); ranCode.delete(id); }
        for (const L of layersOf()) if (!rerun.includes(L)) box.send({ type: 'layer-props', id: L.id, props: layerProps(L) });
        for (const L of rerun) { box.send({ type: 'hot-layer', layer: { ...spec(L), fx: fx(L) } }); building(L.id, true); }
      } else {
        box.send(fresh ? { type: 'run-layers', layers: layersOf().map(spec) } : { type: 'swap-layers', layers: layersOf().map(spec), fx: 'xfade' });
        for (const id of [...builds.keys()]) if (!layerById(id)) building(id, false);
        for (const L of layersOf()) building(L.id, true);
      }
      if (!partial) ranCode.clear();
      for (const L of rerun) ranCode.set(L.id, codeOf(L));
      ranSketch = current.id;
      if (editOn && !partial && sel()) box.send({ type: 'edit', cmd: 'on', layer: sel().id });
      if (fresh) box.send({ type: 'fps-cap', value: store.get('three.fpsCap', 0) });
      ranOnce = true;
      if (!partial) scheduleThumb();
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
    // ---------- sketch browser ----------
    // A grid of every sketch with a thumbnail taken automatically a few seconds after it runs (kv 'three-thumbs').
    let thumbs = {};
    const saveThumbs = debounce(() => window.hub.kvSet('three-thumbs', thumbs), 800);
    let thumbTimer = 0;
    let thumbShot = null;
    function scheduleThumb() {
      clearTimeout(thumbTimer);
      const id = current?.id;
      if (!id || (thumbs[id] && Date.now() - thumbs[id].at < 3 * 60000)) return;
      thumbTimer = setTimeout(() => {
        // (the Lab sequence's program on screen isn't this sketch's picture)
        if (current?.id !== id || pendingShot || errors.length || (typeof ThreeSeq !== 'undefined' && ThreeSeq.active)) return;
        thumbShot = async (url) => {
          if (!url || (typeof ThreeSeq !== 'undefined' && ThreeSeq.active)) return;
          const img = new Image(); img.src = url;
          try { await img.decode(); } catch { return; }
          const c = document.createElement('canvas'); const sc = Math.min(1, 360 / Math.max(img.width, img.height));
          c.width = Math.max(1, Math.round(img.width * sc)); c.height = Math.max(1, Math.round(img.height * sc));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          thumbs[id] = { url: c.toDataURL('image/jpeg', 0.75), at: Date.now() };
          saveThumbs();
        };
        box.send({ type: 'screenshot', tag: 'thumb' });
      }, 3500);
    }
    const browseBtn = btn('▦', 'All your sketches as pictures', () => browseSketches());
    function browseSketches() {
      const q = el('input', { class: 'sb-search', placeholder: 'Search sketches…', spellcheck: false });
      const grid = el('div', { class: 'sb-grid' });
      const dlg = el('dialog', { class: 'ui-modal sb-dialog' },
        el('div', { class: 'refs-head' }, el('h3', { text: 'Sketches' }), q, el('span', { class: 'spacer' }),
          btn('＋ New', 'New sketch from a template', () => { dlg.close(); templateGallery(); }, 'primary small'), btn('Close', '', () => dlg.close())),
        grid);
      // ★ pinned first, then by the sort you pick; right-click a card for rename / duplicate / pin / delete.
      const sortSel = el('select', { class: 'sb-sort', title: 'Sort' }, [['recent', 'Recent'], ['name', 'Name'], ['layers', 'Most layers']].map(([v, l]) => el('option', { value: v, text: l, selected: v === store.get('three.sbSort', 'recent') })));
      sortSel.addEventListener('change', () => { store.set('three.sbSort', sortSel.value); fill(); });
      q.after(sortSel);
      const pins = () => new Set(store.get('three.sketchPins', []));
      const togglePin = (id) => { const p = pins(); if (p.has(id)) p.delete(id); else p.add(id); store.set('three.sketchPins', [...p]); fill(); };
      const cardMenu = (e, sk) => {
        e.preventDefault();
        const p = pins();
        showMenu(e.clientX, e.clientY, [
          { label: 'Open', action: () => { dlg.close(); if (sk.id !== current?.id) openSketch(sk.id); } },
          { label: '▣ Open and present', action: () => { dlg.close(); if (sk.id !== current?.id) openSketch(sk.id); setTimeout(() => togglePresent(), 400); } },
          ...(typeof ThreeSeq !== 'undefined' ? [{ label: '▤ Add to the sequence', action: () => { dlg.close(); ThreeSeq.add({ sketch: sk.id }).then(() => ThreeSeq.enter()).catch((err) => toast(err.message, { type: 'error' })); } },
            { label: '▤ Its own sequence', hint: (() => { const x = ThreeSeq.summaryFor(sk.id); return x ? `${x.clips} clip${x.clips === 1 ? '' : 's'} · ${x.seconds.toFixed(1)} s` : 'made when you open it'; })(), action: () => { dlg.close(); if (sk.id !== current?.id) openSketch(sk.id); setTimeout(() => ThreeSeq.enter().catch((err) => toast(err.message, { type: 'error' })), 300); } }] : []),
          { label: p.has(sk.id) ? '☆ Unpin' : '★ Pin to the top', action: () => togglePin(sk.id) },
          { label: 'Rename…', action: async () => { const n = await Modal.prompt('Rename sketch', { value: sk.name }); if (n?.trim()) { sk.name = n.trim(); save(); renderPicker(); fill(); } } },
          { label: 'Duplicate', action: () => { if (sk.id === current?.id) persist(); const copy = { ...JSON.parse(JSON.stringify(sk)), id: `s${Date.now()}`, name: `${sk.name} copy`, updatedAt: Date.now() }; sketches.push(copy); if (extras[sk.id]?.media) (extras[copy.id] ||= {}).media = { ...extras[sk.id].media }; if (extras[sk.id]?.timeline) { (extras[copy.id] ||= {}).timeline = { ...extras[sk.id].timeline }; player.copyMap(clockPath(sk.id), clockPath(copy.id)).catch(() => {}); } saveExtras(); save(); renderPicker(); fill(); if (typeof ThreeSeq !== 'undefined') ThreeSeq.sceneCopied(sk.id, copy.id).catch(() => {}); toast(`Duplicated "${sk.name}"`, { timeout: 1500 }); } },
          { label: 'Delete…', danger: true, action: async () => {
            if (sketches.length === 1) { toast('Keep at least one sketch', { type: 'error' }); return; }
            if (!(await Modal.confirm('Delete sketch?', `"${sk.name}" will be deleted. You can bring it back from History.`, { ok: 'Delete', danger: true }))) return;
            trash.unshift({ name: sk.name, code: sk.code, layers: sk.layers, deletedAt: Date.now() });
            trash.length = Math.min(trash.length, 30);
            saveHistory();
            sketches = sketches.filter((s) => s.id !== sk.id);
            save();
            if (sk.id === current?.id) openSketch(sketches[0].id); else renderPicker();
            fill();
          } },
        ]);
      };
      const fill = () => {
        const needle = q.value.trim().toLowerCase();
        const p = pins();
        const by = sortSel.value;
        const cmp = by === 'name' ? (a, b) => a.name.localeCompare(b.name) : by === 'layers' ? (a, b) => (b.layers?.length || 1) - (a.layers?.length || 1) : (a, b) => b.updatedAt - a.updatedAt;
        const list = [...sketches].sort((a, b) => (p.has(b.id) - p.has(a.id)) || cmp(a, b)).filter((sk) => !needle || sk.name.toLowerCase().includes(needle));
        grid.replaceChildren(...list.map((sk) => {
          const t = thumbs[sk.id]?.url;
          const layers = sk.layers?.length || 1;
          const song = extras[sk.id]?.media?.path?.split(/[\\/]/).pop();
          const card = el('button', { class: `sb-card${sk.id === current?.id ? ' on' : ''}${p.has(sk.id) ? ' pinned' : ''}`, title: `Open "${sk.name}" (right-click for more)`, on: { click: () => { dlg.close(); if (sk.id !== current?.id) openSketch(sk.id); } } },
            el('div', { class: 'sb-thumb' }, t ? el('img', { src: t, alt: '' }) : el('span', { text: '◭' }), p.has(sk.id) ? el('span', { class: 'sb-pin', text: '★' }) : null, song ? el('span', { class: 'sb-song', text: '♪', title: song }) : null),
            el('b', { text: sk.name }, typeof ChatScenes !== 'undefined' && ChatScenes.ownerOf(sk.id) ? el('span', { class: 'sb-chat', text: ` ${ChatScenes.glyphFor(sk.id)}`, title: 'The scene of a director chat', style: { color: ChatScenes.identity(ChatScenes.ownerOf(sk.id)).color } }) : null),
            el('span', { class: 'sb-meta', text: `${layers} layer${layers === 1 ? '' : 's'} · ${new Date(sk.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}${song ? ` · ${song}` : ''}` }));
          card.addEventListener('contextmenu', (e) => cardMenu(e, sk));
          return card;
        }));
      };
      q.addEventListener('input', fill);
      dlg.addEventListener('close', () => dlg.remove());
      document.body.append(dlg);
      fill();
      dlg.showModal();
      q.focus();
    }
    function renderPicker() {
      // ★ pinned ones (pin them in the sketch browser) first, then the most recent
      const pins = new Set(store.get('three.sketchPins', []));
      const list = [...sketches].sort((a, b) => (pins.has(b.id) - pins.has(a.id)) || b.updatedAt - a.updatedAt);
      const mark = (id) => (typeof ChatScenes !== 'undefined' ? ChatScenes.glyphFor(id) : ''); // the chat that owns it (chat-scenes.js)
      picker.replaceChildren(...list.map((s) => el('option', { value: s.id, text: `${pins.has(s.id) ? '★ ' : ''}${mark(s.id) ? `${mark(s.id)} ` : ''}${s.name}`, selected: s.id === current?.id })));
      picker.title = `Your sketches (${sketches.length}) · O opens them as pictures · ★ pinned ones first`;
    }
    // opts.by: who switched ('scene' = chat-scenes.js following the chat on screen); fires 'hearth:sketch'
    function openSketch(id, opts = {}) {
      soloId = null;
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
          if (current === left) { editor.setValue(sel().code); run({ sync: true }); }
          toast(`Saved into "${left.name}"`);
        } } });
      }
      for (const c of controllers.values()) c.destroy?.();
      controllers.clear();
      for (const k of Object.keys(layerMods)) delete layerMods[k];
      rememberMedia();
      // (the Lab sequence on screen keeps its own shape and song: the scenes' come back when it closes)
      const seqOn = typeof ThreeSeq !== 'undefined' && ThreeSeq.active;
      if (left && stage && !seqOn) { (extras[left.id] ||= {}).frame = stage.size.id; saveExtras(); }
      current = sketches.find((s) => s.id === id) || sketches[0];
      materialize(current);
      // This sketch's frame size and song (with where it was in the song).
      const ex = extras[current.id] || {};
      if (ex.frame && !seqOn) stage.setMode(ex.frame, { silent: true });
      if (!seqOn) sceneMedia(current.id); // its song, else its own timeline (the sequence's song stays while it shows)
      store.set('three.current', current.id);
      selId = layerById(ex.selectedLayer)?.id || layersOf()[layersOf().length - 1].id;
      editor.setValue(sel().code);
      tweaksSlot.replaceChildren(ctlFor(sel()).el);
      renderPicker();
      renderLayers();
      renderNotes();
      renderRefsBtn();
      renderPalette();
      run();
      loadRefBytes().then((added) => { if (added && layersOf().some((L) => /\brefs\b|refTexture/.test(L.code))) run(); });
      dispatchEvent(new CustomEvent('hearth:sketch', { detail: { id: current.id, from: left?.id || null, by: opts.by || 'user' } }));
    }
    // The sketch on screen changed as data (a jam round, a backstage edit, an undo of several layers): the editor,
    // sliders and layer list follow, and only the layers whose code changed run again (in place).
    function refreshInPlace(want = null) {
      if (!current) return;
      materialize(current);
      for (const [lid, c] of controllers) if (!layerById(lid)) { c.destroy?.(); controllers.delete(lid); delete layerMods[lid]; }
      selId = layerById(want)?.id || layerById(selId)?.id || layerById(extras[current.id]?.selectedLayer)?.id || layersOf()[layersOf().length - 1].id;
      editor.setValue(sel().code);
      tweaksSlot.replaceChildren(ctlFor(sel()).el);
      renderLayers();
      run({ sync: true });
    }
    function create(name, code, layers, { timeline = null } = {}) {
      const s = { id: `s${Date.now()}`, name, code, updatedAt: Date.now(), ...(layers ? { layers: JSON.parse(JSON.stringify(layers)) } : {}) };
      sketches.push(s);
      if (timeline) { (extras[s.id] ||= {}).timeline = { len: timeline.len, fps: timeline.fps || 30 }; saveExtras(); }
      save();
      openSketch(s.id);
      return s;
    }
    async function renameSketch() {
      const name = await Modal.prompt('Rename sketch', { value: current.name });
      if (name) { current.name = name.trim(); save(); renderPicker(); }
    }
    function duplicate() { persist(); const from = current.id; const tl = extras[from]?.timeline; const s = create(`${current.name} copy`, current.code, current.layers, { timeline: tl }); if (tl) player.copyMap(clockPath(from), clockPath(s.id)).then((ok) => { if (ok && current === s) { player.unload({ silent: true }); sceneMedia(s.id); } }).catch(() => {}); if (typeof ThreeSeq !== 'undefined') ThreeSeq.sceneCopied(from, s.id).catch(() => {}); }
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
    picker.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const pins = new Set(store.get('three.sketchPins', []));
      const list = [...sketches].sort((a, b) => (pins.has(b.id) - pins.has(a.id)) || b.updatedAt - a.updatedAt).slice(0, 14);
      ThreeTweaks.menu(e.clientX, e.clientY, ['Switch to', ...list.map((x) => [`${pins.has(x.id) ? '★ ' : ''}${x.name}`, `${x.layers?.length || 1} layer${(x.layers?.length || 1) === 1 ? '' : 's'}`, () => openSketch(x.id), x.id === current?.id]), ['All as pictures…', 'O', () => browseSketches()], ['＋ New sketch', '', () => templateGallery()]]);
    });
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
      extras = await window.hub.kvGet('three-lab-extras', {}); extrasLoaded = true;
      notesAll = await window.hub.kvGet('three-notes', {});
      refsAll = await window.hub.kvGet('three-refs', {});
      thumbs = await window.hub.kvGet('three-thumbs', {});
      // The toolbar in labeled groups: what you see, the sketch, its code, its assets, capture.
      const group = (cat, ...nodes) => el('span', { class: 'tb-group', dataset: { cat } }, ...nodes);
      // One row, in the order of your workflow: your sketch and Run, then what you look at, then assets. The
      // controls you never touched (Focus, snippets, three.js version, the toolbar 📷) are in ⋯ (they still work).
      toolbar.replaceChildren(
        // round 4: New, ▦ and ⟲ moved into Sketch ▾ (Ctrl+Shift+Enter still restarts)
        group('Sketch', picker, sketchMenuBtn, runBtn),
        group('View', slidersBtn, codeBtn, consoleBtn, editBtn, presentBtn),
        group('Code', liveLabel),
        el('span', { class: 'spacer' }),
        group('Assets', paletteBox, refsBtn, stageBtn, labMoreBtn));
      { const row = player.el.querySelector('.mb-main'); row.querySelector('.mb-g-capture').append(noteBtn, notesBtn, sheetBtn); row.querySelector('.mb-g-live').append(writeBtn, midiBtn); row.querySelector('.tb-group[data-cat="Beat"]').after(el('span', { class: 'tb-group mb-g-sound', dataset: { cat: 'Sound' } }, liveBtn, trigBtn, trigPresetBtn, autoBarsBtn, npBox)); for (const n of [notesBtn, sheetBtn, writeBtn, midiBtn]) n.classList.add('mb-adv'); const rec = row.querySelector('.mb-g-live .mb-rec'); if (rec) { row.querySelector('.mb-g-capture').prepend(rec); rec.classList.add('mb-adv'); } row.querySelector('.mb-g-live').classList.add('mb-adv'); }
      // First run with per-sketch songs: the song that was loaded goes to the sketch that was open.
      const firstId = sketches.some((s) => s.id === store.get('three.current')) ? store.get('three.current') : sketches[0]?.id;
      const lastMedia = store.get('three.media', null);
      if (firstId && lastMedia && extras[firstId]?.media === undefined) { (extras[firstId] ||= {}).media = { path: lastMedia, time: 0 }; saveExtras(); }
      if (!sketches.length) { sketches = [{ id: `s${Date.now()}`, name: 'Basic scene', code: ThreeData.TEMPLATES[0].code, updatedAt: Date.now() }]; save(); }
      // the chat on screen may own another sketch (chat-scenes.js): open that one instead of the last one
      const want = typeof ChatScenes !== 'undefined' ? ChatScenes.startSketch?.(sketches.map((x) => x.id)) : null;
      openSketch(want || store.get('three.current', sketches[0].id), { by: want ? 'scene' : 'start' });
      api.director = director; // only once saved sketches are loaded, so director edits never land on a placeholder
      dispatchEvent(new Event('hearth:lab-ready'));
    })();

    // ---------- per-chat scenes (chat-scenes.js, tools/three-backstage.js) ----------
    // The sketches as data: each director chat owns one; the backstage runs the ones that aren't on screen.
    api.scenes = {
      all: () => sketches,
      get: (id) => sketches.find((x) => x.id === id) || null,
      currentId: () => current?.id || null,
      // switch to a chat's sketch (the one you leave is saved first; unsaved sliders get the usual toast)
      open(id) {
        if (!sketches.some((x) => x.id === id)) return false;
        if (id !== current?.id) { persist(); openSketch(id, { by: 'scene' }); }
        return true;
      },
      create({ name, code, layers = null, open = false, frame = null, timeline = null }) {
        const x = { id: `s${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, name, code, updatedAt: Date.now(), ...(layers ? { layers: JSON.parse(JSON.stringify(layers)) } : {}) };
        sketches.push(x);
        if (frame) { (extras[x.id] ||= {}).frame = frame; saveExtras(); }
        if (timeline) { (extras[x.id] ||= {}).timeline = { len: timeline.len || 10, fps: timeline.fps || 30 }; saveExtras(); } // its own timeline (the orb)
        save();
        if (open) { persist(); openSketch(x.id, { by: 'scene' }); } else renderPicker();
        return x;
      },
      // a copy with its song link, frame size and look (a chat that starts from another chat's scene)
      duplicate(id, name) {
        const src = sketches.find((x) => x.id === id);
        if (!src) return null;
        if (src === current) persist();
        const copy = { ...JSON.parse(JSON.stringify(src)), id: `s${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`, name, updatedAt: Date.now() };
        sketches.push(copy);
        if (extras[id]) { extras[copy.id] = JSON.parse(JSON.stringify(extras[id])); saveExtras(); }
        if (extras[id]?.timeline) player.copyMap(clockPath(id), clockPath(copy.id)).catch(() => {}); // its timeline's cues and markers
        save();
        renderPicker();
        if (typeof ThreeSeq !== 'undefined') ThreeSeq.sceneCopied(id, copy.id).catch(() => {}); // its sequence comes along
        return copy;
      },
      rename(id, name) {
        const x = sketches.find((y) => y.id === id);
        if (!x || !name || x.name === name) return false;
        x.name = name;
        save();
        renderPicker();
        return true;
      },
      // a sketch changed outside the editor (the backstage): saved; re-run when it's the one on screen
      changed(id) {
        const x = sketches.find((y) => y.id === id);
        if (!x) return;
        x.code = x.layers?.[0]?.code ?? x.code;
        x.updatedAt = Date.now();
        save();
        if (x === current) refreshInPlace();
        dispatchEvent(new CustomEvent('hearth:scene-changed', { detail: { id } })); // (precomps showing it follow: tools/three-comp.js)
      },
      layersOf: (x) => materialize(x),
      frameOf: (id) => extras[id]?.frame || null,
      setFrame(id, f) { (extras[id] ||= {}).frame = f; saveExtras(); if (id === current?.id) stage.setMode(f); },
      selectedOf: (id) => extras[id]?.selectedLayer || null,
      songOf: (id) => extras[id]?.media?.path || null,
      // the scene's own timeline (no song): { len, fps, time } or null; set / clear it; the Lab timeline of the scene
      // on screen back to its song or its own timeline (the Lab sequence calls it when it leaves)
      timelineOf: (id) => timelineOf(id), setTimeline: (id, tl) => setTimeline(id, tl),
      mediaUp: (id = current?.id) => (id ? sceneMedia(id, { playing: false }) : null),
      extrasOf: (id) => extras[id] || null, // looks / music links per layer (the Lab sequence applies a clip's look)
      thumbOf: (id) => thumbs[id]?.url || null,
      previewHost: () => previewHost,
    };

    api.openCode = (code) => create(`From chat ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, code);

    // What the Three Director (Claude) uses to build scenes from the user's prompts.
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const layersSummary = () => layersOf().map((L, i) => ({
      id: L.id, name: L.name, ...(ThreeLayers.isFilter(L.code) ? { kind: 'filter (changes the layers below it)' } : {}), ...(L.precomp && typeof ThreeComp !== 'undefined' && ThreeComp.isComp(L) ? { kind: `precomp of ${ThreeComp.describe(L)} (three_do comp)` } : {}), order: `${i + 1} of ${layersOf().length} (1 = bottom)`, selected: L.id === selId,
      visible: L.visible !== false, opacity: L.opacity ?? 1, blend: L.blend || 'normal',
      ...(L.overrides ? { placedByUser: Object.fromEntries(Object.entries(L.overrides).map(([k, o]) => [k, { position: o.p, rotationDegrees: o.rd, scale: o.s, ...(o.v === false ? { hidden: true } : {}), ...(o.fov ? { fov: o.fov } : {}) }])) } : {}),
      plays: L.in == null && L.out == null ? 'whole song' : { from: L.in ?? 0, to: L.out ?? 'end', fadeIn: L.fadeIn || 0, fadeOut: L.fadeOut || 0 },
      ...(L.x || L.y || (L.scale ?? 1) !== 1 || L.rotate ? { transform: { x: L.x || 0, y: L.y || 0, scale: L.scale ?? 1, rotate: L.rotate || 0 } } : {}),
      sliders: controllers.get(L.id)?.controls().map((c) => c.label) || [],
      ...(Object.keys(L.keys || {}).length ? { keyframes: Object.fromEntries(Object.entries(L.keys).map(([p, ks]) => [p.replace(/^s:/, 'slider '), ks.map((k) => `${k.t}s=${k.v}${k.ease && k.ease !== 'ease' ? ` (${k.ease})` : ''}`)])) } : {}),
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
      music: player.isClock ? `none: the scene's own timeline (${player.duration} s at ${player.clock.fps} fps; nothing reacts to music)` : player.loaded ? (({ file, bpm, duration, time, playing }) => ({ file, bpm, duration, time, playing }))(player.info()) : 'none loaded (demo 120 bpm beat)',
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
      getCode: () => ({ sketch: current?.name, layer: sel()?.name, layers: layersSummary(), frame: stage.size, lines: editor.value.split('\n').length, ...codeOrOutline(editor.value), ...(selCtl()?.controls().length ? { sliders: selCtl().controls() } : {}), ...(selCtl()?.unsaved().length ? { unsavedSliders: selCtl().unsaved(), note: 'The user moved these sliders but has not saved them into the code; keep their values when you rewrite.' } : {}) }),
      media: player,
      assignMedia, songOnScene, ensureTimeline, snapToBars,
      // a layer's code as it is now (the editor's text for the selected one), for diffs and the director's undo
      codeOf(ref = null) {
        const L = ref ? findLayer(ref) : sel();
        if (!L) throw new Error(`No layer "${ref}". Layers: ${layersOf().map((x) => x.name).join(', ')}`);
        return { id: L.id, name: L.name, sketchId: current?.id, sketch: current?.name, code: L.id === sel()?.id ? editor.value : L.code };
      },
      openSketch: (id) => api.openSketchById?.(id),
      setFrame: (id) => stage.setMode(id),
      // The whole sketch as it is now (every layer), and putting such a capture back (jam.js: one undo point per
      // round). A capture whose sketch is gone, or restored with asNew, becomes a new sketch.
      capture() {
        persist();
        return { sketchId: current?.id, sketch: current?.name, selId, layers: JSON.parse(JSON.stringify(layersOf())), errors: errors.length };
      },
      async restore(snap, { asNew = null, wait = 2 } = {}) {
        if (player.recording) throw new Error('The user is recording a video right now; wait until they stop.');
        if (!snap?.layers?.length) throw new Error('Nothing to restore.');
        persist();
        const s = !asNew && sketches.find((x) => x.id === snap.sketchId);
        if (!s) {
          create(asNew || snap.sketch || 'Restored sketch', snap.layers[0].code, snap.layers);
        } else {
          if (s === current) snapshot();
          s.layers = JSON.parse(JSON.stringify(snap.layers));
          s.code = s.layers[0]?.code ?? s.code;
          s.updatedAt = Date.now();
          if (snap.selId) (extras[s.id] ||= {}).selectedLayer = snap.selId;
          save();
          if (s === current) refreshInPlace(snap.selId); else openSketch(s.id);
        }
        await sleep(Math.min(15, Math.max(0.3, wait)) * 1000);
        return report();
      },
      async setCode(code, wait = 2.5) {
        if (player.recording) throw new Error('The user is recording a video right now; wait until they stop.');
        snapshot();
        editor.setValue(code);
        persist();
        renderPicker();
        run({ hot: true, layer: selId }); // one layer or many: it re-runs in place
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
        if (patch.sketchId && patch.sketchId !== current?.id) throw new Error('The scene on screen changed during this edit (the owner switched chats or sketches), so it stopped there. Check with three_console and carry on.');
        const L = findLayer(ref);
        if (!L) throw new Error(`No layer "${ref}". Layers: ${layersOf().map((x) => x.name).join(', ')}`);
        const props = Object.fromEntries(Object.entries(patch).filter(([k]) => PROP_KEYS.includes(k)));
        if (Object.keys(props).length) editLayer(L.id, props, { direct: true });
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
      // property: opacity | x | y | scale | rotate or a slider (key or label); keys: [{ time, value, ease }]; clear removes them.
      setKeyframes(ref, property, keys, clear) {
        const L = findLayer(ref);
        if (!L) throw new Error(`No layer "${ref}". Layers: ${layersOf().map((x) => x.name).join(', ')}`);
        let prop = String(property || '');
        if (!ANIM.includes(prop)) {
          const c = ctlFor(L);
          const ctl = c.controls().find((x) => x.key === prop || x.label.toLowerCase() === prop.toLowerCase());
          if (!ctl) throw new Error(`No property "${property}" on "${L.name}". Use opacity, x, y, scale, rotate or a slider: ${c.controls().map((x) => `${x.key} (${x.label})`).join(', ') || 'none'}`);
          prop = `s:${ctl.key}`;
        }
        const list = clear ? [] : (keys || []).map((k) => ({ t: Math.round(Number(k.time) * 1000) / 1000, v: k.value, ease: (ThreeLayers.EASE_IDS || ['linear', 'ease', 'hold']).includes(k.ease) ? k.ease : 'ease' })).filter((k) => Number.isFinite(k.t) && k.v != null).sort((a, b) => a.t - b.t);
        setKeys(L, prop, list);
        if (list.length) ensureTimeline(); // no song: the keys play on the scene's own timeline
        return { layer: L.name, property: prop.replace(/^s:/, ''), keyframes: list.length, ...report() };
      },
      async removeLayer(ref) {
        const L = findLayer(ref);
        if (!L) throw new Error(`No layer "${ref}".`);
        if (!(await removeLayer(L.id, { confirm: false }))) throw new Error('A sketch keeps at least one layer.');
        return { removed: L.name, ...report() };
      },
      // ---------- the running sketch: evaluate code inside it, press keys / click (play-testing) ----------
      evalInSketch: (code) => sandboxCall({ type: 'eval', code }, 6000),
      inputToSketch: (actions) => sandboxCall({ type: 'input', actions }, 70000),
      // ---------- reading and editing code in parts (big layers don't fit in one reply) ----------
      readCode(ref, from = 1, to = null) {
        const L = ref ? findLayer(ref) : sel();
        if (!L) throw new Error(`No layer "${ref}".`);
        const code = L.id === sel()?.id ? editor.value : L.code;
        const lines = code.split('\n');
        const a = Math.max(1, Math.floor(from)); const b = Math.min(lines.length, Math.floor(to ?? a + 249));
        return { layer: L.name, totalLines: lines.length, from: a, to: b, code: numbered(lines, a, b), ...(b < lines.length ? { more: `Lines ${b + 1}–${lines.length} not shown: read them with from: ${b + 1}.` } : {}) };
      },
      searchCode(pattern, { layer = null, regex = false, context = 1 } = {}) {
        let re;
        try { re = regex ? new RegExp(pattern, 'i') : new RegExp(String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); } catch (err) { throw new Error(`Bad pattern: ${err.message}`); }
        const scope = layer ? [findLayer(layer)].filter(Boolean) : layersOf();
        const hits = [];
        for (const L of scope) {
          const lines = (L.id === sel()?.id ? editor.value : L.code).split('\n');
          lines.forEach((ln, k) => {
            if (hits.length >= 120 || !re.test(ln)) return;
            const a = Math.max(0, k - context); const b = Math.min(lines.length - 1, k + context);
            hits.push({ layer: L.name, line: k + 1, text: numbered(lines, a + 1, b + 1) });
          });
        }
        return { pattern, matches: hits.length, hits };
      },
      // Exact find → replace edits (each must match once unless all: true), or replace a range of lines.
      async editCode(ref, edits = [], wait = 2.5) {
        const L = ref ? findLayer(ref) : sel();
        if (!L) throw new Error(`No layer "${ref}".`);
        let code = L.id === sel()?.id ? editor.value : L.code;
        const done = [];
        for (const [n, e] of edits.entries()) {
          if (e.lines) {
            const lines = code.split('\n');
            const [a, b] = [Number(e.lines[0]), Number(e.lines[1] ?? e.lines[0])];
            if (!(a >= 1 && b >= a - 1 && b <= lines.length)) throw new Error(`Edit ${n + 1}: lines ${a}–${b} are outside 1–${lines.length}.`);
            lines.splice(a - 1, b - a + 1, ...String(e.replace ?? '').split('\n'));
            code = lines.join('\n');
            done.push(`lines ${a}–${b} replaced`);
            continue;
          }
          const find = String(e.find ?? '');
          if (!find) throw new Error(`Edit ${n + 1}: give find (exact text) or lines [from, to].`);
          const count = code.split(find).length - 1;
          if (!count) throw new Error(`Edit ${n + 1}: the text to find isn't in "${L.name}" (search with three_search_code; whitespace must match).`);
          if (count > 1 && !e.all) throw new Error(`Edit ${n + 1}: the text appears ${count} times; add more context to make it unique, or all: true.`);
          code = e.all ? code.split(find).join(String(e.replace ?? '')) : code.replace(find, () => String(e.replace ?? ''));
          done.push(`${count > 1 ? `${count}×` : ''}"${find.slice(0, 40).replace(/\n/g, '⏎')}${find.length > 40 ? '…' : ''}" replaced`);
        }
        const report = await director.updateLayer(L.id, { code }, wait);
        return { layer: L.name, edits: done, lines: code.split('\n').length, ...report };
      },
      selectLayer(ref) {
        const L = findLayer(ref);
        if (!L) throw new Error(`No layer "${ref}".`);
        selectLayer(L.id);
        return director.getCode();
      },
      timeline(range) {
        return { ...player.timeline(range || {}), layers: layersSummary().map((x) => ({ name: x.name, plays: x.plays, keyframes: x.keyframes, lanes: lanesOf(layerById(x.id) || {}).map((p) => p.replace(/^s:/, 'slider ')) })), notes: notesOf().map(({ id, t, text, done }) => ({ id, time: t, text, done })) };
      },
      timelineEdit({ grid, markers, loop, zoom, lane, cues, speed, length, snapToBars: snapBars } = {}) {
        if (!player.loaded) ensureTimeline(); // no song: the scene's own timeline
        if (!player.loaded) throw new Error('No song loaded.');
        const did = [];
        // the scene's own timeline (no song): its length in seconds; with a song: keyframes and cues to its bars
        if (length != null) { if (!player.isClock) throw new Error('This scene plays on its song: its length is the song\'s.'); setTimeline(current.id, { ...extras[current.id].timeline, len: Number(length) }); did.push('length'); }
        if (snapBars) { const r = snapToBars(); if (!r) throw new Error('No song with bars on this scene.'); did.push(`snapped ${r.keys} keyframes and ${r.cues} cues to ${r.unit}s`); }
        if (grid === 'auto') { player.clearGrid(); did.push('grid back to the detected beats'); } else if (grid) { player.setGrid(grid); did.push('grid'); }
        if (markers) { player.editMarkers({ add: markers.add || {}, remove: markers.remove || {}, clear: markers.clear || [], range: markers.range || null, snap: markers.snap !== false }); did.push('markers'); }
        if (loop !== undefined) { if (!player.setLoop(loop ? loop.start : null, loop?.end)) throw new Error('The user locked the loop.'); did.push('loop'); }
        if (zoom !== undefined) { player.zoomTo(zoom ? zoom.start : null, zoom?.end); did.push('zoom'); }
        if (cues) { player.editCues({ add: cues.add || [], remove: cues.remove || [], clear: Boolean(cues.clear) }); did.push('cues'); }
        if (speed) { player.setRate(Number(speed)); did.push('speed'); }
        if (lane) {
          const L = findLayer(lane.layer);
          if (!L) throw new Error(`No layer "${lane.layer}".`);
          let prop = lane.property || null;
          if (prop === 'all') setLanes(L, [...lanesOf(L), ...animatedProps(L)]);
          else if (!prop) setLanes(L, []);
          else {
            if (!ThreeLayers.ANIM_META[prop]) { const c = ctlFor(L).controls().find((x) => x.key === prop || x.key === String(prop).replace(/^s:/, '') || x.label.toLowerCase() === String(prop).toLowerCase()); if (!c) throw new Error(`No property "${prop}" on "${L.name}".`); prop = `s:${c.key}`; }
            setLanes(L, lane.show === false ? lanesOf(L).filter((p) => p !== prop) : [...lanesOf(L), prop]);
          }
          did.push('lane');
        }
        return { changed: did, ...director.timeline() };
      },
      applyPreset(ref, presetId) {
        const L = findLayer(ref);
        if (!L) throw new Error(`No layer "${ref}".`);
        const r = applyPreset(L.id, presetId);
        if (!r) throw new Error(`Unknown preset "${presetId}" (or no song). Presets: ${ThreeLayers.PRESETS.map((x) => x.id).join(', ')}`);
        return { ...r, ...report() };
      },
      sliders(ref, set) {
        const L = ref ? findLayer(ref) : sel();
        if (!L) throw new Error(`No layer "${ref}".`);
        const c = ctlFor(L);
        const changed = set && Object.keys(set).length ? c.setMany(set) : [];
        return { layer: L.name, changed, sliders: c.controls(), looks: c.looksApi.list() };
      },
      looks(ref, action, name) {
        const L = ref ? findLayer(ref) : sel();
        if (!L) throw new Error(`No layer "${ref}".`);
        const api2 = ctlFor(L).looksApi;
        if (action === 'save') return { looks: api2.save(name) };
        if (action === 'apply') return { applied: api2.apply(name), sliders: ctlFor(L).controls() };
        if (action === 'delete') return { looks: api2.remove(name) };
        return { looks: api2.list() };
      },
      refs: { list: () => refsOf(), add: (p, key) => addRef(p, { key }), rename: renameRef, remove: removeRef, use: refUse, size: fmtSize, url: fileUrl,
        palette: () => current?.palette || [], setPalette: (cols) => setPalette(cols), paletteFrom: async (name) => { const r = refsOf().find((x) => x.key === name || x.name === name); if (!r || r.kind !== 'image') throw new Error(`No picture reference "${name}"`); const cols = await paletteFrom(r.path); setPalette(cols); return cols; } },
      notes: {
        list: () => notesOf().map(({ id, t, text, done, image }) => ({ id, time: t, text, done, image })),
        add: (time, text) => takeNote({ time, text: text || '' }),
        set: (id, patch) => { const n = notesOf().find((m) => m.id === id); if (!n) throw new Error(`No note ${id}`); Object.assign(n, patch); saveNotes(); renderNotes(); return n; },
        remove: (id) => { notesAll[current.id] = notesOf().filter((m) => m.id !== id); saveNotes(); renderNotes(); },
      },
      report,
      contactSheet: (o) => contactSheet(o),
      triggers: (patch) => (patch ? setTriggers(patch) : trigCfg),
      live: () => ({ input: liveKind, bpm: liveBpm?.bpm ?? null, tempoLocked: Boolean(liveBpm?.locked),
        nowPlaying: np?.title ? { title: np.title, artist: np.artist, album: np.album, app: np.app, position: Math.round(np.position || 0), duration: Math.round(np.duration || 0), playing: np.playing } : null }),
      // Shots asked for at the same time (a still while the director takes one) share the next picture: each
      // waiter used to replace the one before, which then never resolved. Tagged 'get' so a second reply never
      // falls through to the user's "save screenshot" dialog.
      shot: () => new Promise((resolve) => {
        const prev = pendingShot;
        const mine = (url) => { prev?.(url); resolve(url); };
        pendingShot = mine;
        box.send({ type: 'screenshot', tag: 'get' });
        // a slow frame (a heavy scene, a shader still compiling, software rendering) is not "not rendering": wait 15 s
        setTimeout(() => { if (pendingShot === mine) { pendingShot = null; mine(null); } }, 15000);
      }),
    };
    api.runSketch = run;
    // Nodes ⇄ Code (tools/three-nodes.js): the selected layer as a node graph over the code pane.
    if (typeof ThreeNodes !== 'undefined') ThreeNodes.attach({ host: editorHost, editor, layer: () => sel(), sketch: () => current, codeShown: () => !split.classList.contains('no-code'), showCode: setCodeVisible,
      setCode: (code, { rerun = true } = {}) => { if (rerun) snapshot(); editor.setValue(code); persist(); if (rerun) run({ hot: true, layer: selId }); },
      addLayer: (name, code) => addLayer('code', { name, code }), newSketch: (name, code) => create(name, code),
      slider: (key, v) => Boolean(selCtl()?.setByKey(key, v)), evalInSketch: (code) => sandboxCall({ type: 'eval', code }, 2000) });
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
      if (msg.type === 'ready' && msg.again) apply(); // the page restarted by itself: compile again
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
    window.ShaderNodes?.attachPlayground?.(pane, { editor }); // "◇ Nodes": edit shaders as node graphs (nodes-shader.js)
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

  // Secondary tools, one click away in the "Tools" drawer: [id, label, hint, render, icon]
  const TOOL_TABS = [
    ['models', 'Model viewer', 'Open a .glb / .fbx / .obj, audit it, copy loader code', modelTab, '🧊'],
    ['shader', 'Shader playground', 'GLSL fragment shaders with live compile', shaderTab, '✦'],
    ['textures', 'Textures', 'Sizes, power-of-two, alpha, GPU memory, resize', textureTab, '▦'],
    ['docs', 'Docs', 'three.js classes, manual, examples, forum', docsTab, '📖'],
    ['color', 'Color', 'Convert colors (three.js, GLSL, AE), tints, contrast', (p) => Kit.colorTool(p), '🎨'],
    ['easing', 'Easing', 'Draw a bezier, get CSS / GSAP / three.js / AE code', (p) => Kit.easingTool(p), '〰'],
  ];
  function toolsDrawer(anchor) {
    const r = anchor.getBoundingClientRect();
    ThreeTweaks.menu(r.left, r.bottom + 4, ['Tools', ['◭ Sketch', 'The Lab (Esc from any tool)', () => tabs.show('sketch'), tabs.current === 'sketch', 'Tools: Sketch'],
      ...TOOL_TABS.map(([id, label, hint, , icon]) => [`${icon} ${label}`, hint, () => tabs.show(id), tabs.current === id, `Tools: ${label}`]),
      'Quick', ['Open a 3D model…', 'GLB, FBX, OBJ, STL, PLY', () => { tabs.show('models'); setTimeout(() => api.openModel?.(), 80); }], ['Paste a shader…', 'Opens the playground with your clipboard', async () => { let t = ''; try { t = await navigator.clipboard.readText(); } catch { /* none */ } tabs.show('shader'); if (/void\s+main|mainImage/.test(t)) setTimeout(() => api.openShader?.(t), 80); }]]);
  }
  Tools.define({
    id: 'three', name: 'Three.js Lab', icon: '◭', color: '#4f8cff',
    description: 'Live sketches, model viewer, shaders, textures and docs',
    mount(body, head) {
      tabs = Tabs(body, [
        { id: 'sketch', label: 'Sketch', render: sketchTab },
        ...TOOL_TABS.map(([id, label, , render]) => ({ id, label, render })),
      ], { storeKey: 'three.tab' });
      // The music-visual workflow is the default path: the Sketch tab is the only one on show. The secondary tools
      // (model viewer, shaders, textures, docs, color, easing) live in a compact "Tools" drawer, and the tab strip
      // moves up into the tool header so the Lab gains a whole row.
      tabs.bar.classList.add('lab-tabs');
      const toolsBtn = el('button', { class: 'lab-tools-btn', text: '🧰 Tools ▾', title: 'Model viewer, shader playground, textures, docs, color and easing tools', dataset: { feature: 'Tools drawer' }, on: { click: (e) => toolsDrawer(e.currentTarget) } });
      const back = el('button', { class: 'lab-back', text: '◭ Sketch', title: 'Back to the sketch (Esc)', dataset: { feature: 'Back to sketch' }, on: { click: () => tabs.show('sketch') } });
      tabs.bar.prepend(back);
      tabs.bar.append(toolsBtn);
      const paintTabs = () => { const on = tabs.current; tabs.bar.classList.toggle('on-tool', on !== 'sketch'); toolsBtn.textContent = on !== 'sketch' ? `🧰 ${TOOL_TABS.find((t) => t[0] === on)?.[1] || 'Tools'} ▾` : '🧰 Tools ▾'; };
      const show0 = tabs.show;
      tabs.show = (id) => { show0(id); paintTabs(); };
      for (const b of tabs.bar.querySelectorAll('button[data-id]')) b.addEventListener('click', paintTabs);
      paintTabs();
      if (head) { head.classList.add('lab-head'); head.querySelector('.tool-desc')?.after(tabs.bar); }
      body.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tabs.current !== 'sketch' && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) tabs.show('sketch'); });
    },
    get commands() { return [
      { label: 'New three.js sketch', run: () => { tabs?.show('sketch'); } },
      { label: 'Open a 3D model', run: () => { tabs?.show('models'); setTimeout(() => api.openModel?.(), 100); } },
      { label: 'Shader playground', run: () => tabs?.show('shader') },
      { label: 'Inspect textures', run: () => tabs?.show('textures') },
      { label: 'three.js docs', run: () => tabs?.show('docs') },
      { label: 'Color converter', run: () => tabs?.show('color') },
      { label: 'Easing curve editor', run: () => tabs?.show('easing') },
      { label: 'Lab: present the preview fullscreen (P)', run: () => { tabs?.show('sketch'); setTimeout(() => api.lab?.present(), 80); } },
      { label: 'Lab: focus mode (F)', run: () => { tabs?.show('sketch'); api.lab?.focus(); } },
      { label: 'Lab: drop a cue at the playhead (C)', run: () => { tabs?.show('sketch'); api.lab?.cue(); } },
      ...(api.sketchList?.() || []).map((s) => ({ label: `Open sketch: ${s.name}`, run: () => { activate('tool:three'); tabs?.show('sketch'); api.openSketchById?.(s.id); } })),
      { label: 'Lab: contact sheet of the whole piece', run: () => { tabs?.show('sketch'); api.lab?.sheet(); } },
      { label: 'Lab console: always show', run: () => api.lab?.consoleMode('always') },
      { label: 'Lab console: only with the code', run: () => api.lab?.consoleMode('code') },
      { label: 'Lab console: only when I open it', run: () => api.lab?.consoleMode('never') },
      { label: 'Lab playback speed: 1×', run: () => api.lab?.speed(1) },
      { label: 'Lab playback speed: ½×', run: () => api.lab?.speed(0.5) },
      { label: 'Lab playback speed: ¼×', run: () => api.lab?.speed(0.25) },
    ]; },
  });

  // Entry points used by chat code blocks.
  function ensureOpen(tab) {
    activate('tool:three');
    tabs?.show(tab);
  }

  // Tools for the Three Director (Claude). Calls switch the Lab to the Sketch tab so the user sees the result.
  // Per-chat scenes: a call from a chat goes to that chat's sketch (chat-scenes.js). The one on screen is driven
  // here as before; another chat's runs backstage (tools/three-backstage.js), so no chat edits another's scene.
  let inflight = 0; let idleWaiters = [];
  const settle = () => { if (inflight) return; const w = idleWaiters; idleWaiters = []; for (const fn of w) fn(); };
  async function handleTool(tool, args, ctx = {}) {
    if (!tabs) Tools.shown(Tools.get('three')); // load the Lab in the background if needed
    if (!tabs) return { ok: false, error: 'Three.js Lab could not be loaded.' };
    for (let i = 0; i < 100 && !api.director; i += 1) await new Promise((r) => setTimeout(r, 100));
    const route = typeof ChatScenes !== 'undefined' && api.scenes ? ChatScenes.routeThree(tool, ctx.chatId) : null;
    // the Lab sequence is one for every chat (its scenes are anyone's): never backstage
    if (tool === 'three_sequence' && typeof ThreeSeq !== 'undefined') return ThreeSeq.handle(tool, args, { sketchId: route?.sketchId || null });
    // the motion-design kit (tools/three-motion.js): its layers go through three_add_layer, so they reach this chat's scene
    if (tool === 'three_motion' && typeof ThreeMotion !== 'undefined') return ThreeMotion.handle(args, { chatId: ctx.chatId, call: (t, a) => handleTool(t, a, ctx) });
    // comp (tools/three-comp.js): precomps in this chat's scene (on screen or not), parts dispatched to other chats
    if (tool === 'three_comp' && typeof ThreeComp !== 'undefined') return ThreeComp.handle(args, { chatId: ctx.chatId, sketchId: route?.sketchId || null });
    if (route && route.sketchId !== api.scenes.currentId() && typeof ThreeBackstage !== 'undefined') {
      const r = await ThreeBackstage.handle(tool, args, route);
      if (tool === 'three_new_sketch' && r?.newSketchId) ChatScenes.relink(route.chatId, r.newSketchId);
      return r;
    }
    inflight += 1;
    try {
      const r = await handleVisible(tool, args);
      if (route && tool === 'three_new_sketch' && r?.ok !== false) ChatScenes.relink(route.chatId, api.scenes.currentId());
      return r;
    } finally { inflight -= 1; settle(); }
  }
  async function handleVisible(tool, args) {
    tabs.show('sketch');
    // A hidden view renders no frames, so let the Lab render (behind the current view) while the director works.
    // Only while it's hidden: the Lab on screen keeps its place (marking it too dropped the whole view, docked chat
    // included, behind the window for the length of every call, and replayed the skins' entrance animation after it).
    const surface = H.surfaces.get('tool:three')?.el;
    const capture = () => { if (surface) { const on = !surface.classList.contains('active'); if (surface.classList.contains('capturing') !== on) surface.classList.toggle('capturing', on); } };
    capture();
    addEventListener('hearth:view', capture);
    api.directorWork?.(1); live.why = tool;
    try { return await directorCall(tool, args); } finally { removeEventListener('hearth:view', capture); surface?.classList.remove('capturing'); api.directorWork?.(-1); live.why = null; }
  }
  async function directorCall(tool, args) {
    for (let i = 0; i < 100 && !api.director; i += 1) await new Promise((r) => setTimeout(r, 100));
    const d = api.director;
    if (!d) return { ok: false, error: 'The sketch editor did not load.' };
    // footage frames and the cut list (tools/three-frames.js): frame steps / reads, frames in keyframes and markers
    if (typeof ThreeFrames !== 'undefined') { const r = await ThreeFrames.handle(tool, args, d); if (r) return r; }
    // the director's fast loop (tools/three-director.js): compact results, batches, diffs, screenshot options, undo
    if (typeof ThreeDirector !== 'undefined') { const r = await ThreeDirector.handle(tool, args, d); if (r) return r; }
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
    if (tool === 'three_triggers') return { ok: true, value: { triggers: d.triggers(args.set || null), note: 'thr is the bar (0..1 of the analyser level), gap the shortest time between two triggers in ms, lo / hi the band in Hz' } };
    if (tool === 'three_media_info') { const live = d.live(); return { ok: true, value: live.input || live.nowPlaying ? { ...d.media.info(), live } : d.media.info() }; }
    if (tool === 'three_load_media') {
      d.songOnScene(String(args.path || '')); // a song on the scene's own timeline: its cues come along
      const r = await d.media.load(String(args.path || ''));
      if (r.ok) d.assignMedia(String(args.path));
      if (!r.ok) return { ok: false, error: r.error };
      for (let i = 0; i < 240 && d.media.info().analysis === 'still analyzing'; i += 1) await new Promise((res) => setTimeout(res, 250));
      return { ok: true, value: d.media.info() };
    }
    if (tool === 'three_media_control') {
      if (!d.media.loaded) d.ensureTimeline(); // no song: the scene's own timeline
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
    if (tool === 'three_eval') {
      const r = await d.evalInSketch(String(args.code || ''));
      return r.ok ? { ok: true, value: { result: r.value, console: d.report().console?.slice?.(-5) } } : { ok: false, error: r.error };
    }
    if (tool === 'three_input') {
      const r = await d.inputToSketch(Array.isArray(args.actions) ? args.actions : []);
      if (!r.ok) return { ok: false, error: r.error };
      if (!args.screenshot) return { ok: true, value: { done: r.log } };
      const url = await d.shot();
      return { ok: true, value: { done: r.log }, ...(url ? { images: [{ data: url.split(',')[1], mime: 'image/png' }] } : {}) };
    }
    if (tool === 'three_read_code') return { ok: true, value: d.readCode(args.layer, Number(args.from) || 1, args.to != null ? Number(args.to) : null) };
    if (tool === 'three_search_code') return { ok: true, value: d.searchCode(String(args.pattern || ''), { layer: args.layer || null, regex: Boolean(args.regex), context: Math.min(5, Math.max(0, Number(args.context ?? 1))) }) };
    if (tool === 'three_edit_code') return { ok: true, value: await d.editCode(args.layer, Array.isArray(args.edits) ? args.edits : [], Number(args.wait) || 2.5) };
    if (tool === 'three_update_layer') {
      const patch = { ...(args.settings || {}) };
      if (args.code != null) patch.code = args.code;
      if (args.order != null) patch.order = args.order;
      return { ok: true, value: await d.updateLayer(args.layer, patch, Number(args.wait) || (args.code != null ? 2.5 : 0.5)) };
    }
    if (tool === 'three_timeline') return { ok: true, value: d.timeline(args.from != null || args.to != null ? { from: args.from ?? 0, to: args.to ?? Infinity } : null) };
    if (tool === 'three_timeline_edit') return { ok: true, value: d.timelineEdit(args) };
    if (tool === 'three_animate') return { ok: true, value: d.applyPreset(args.layer, args.preset) };
    if (tool === 'three_notes') {
      const action = args.action || 'list';
      if (action === 'list') {
        const list = d.notes.list();
        const open = list.filter((n) => !n.done && n.image).slice(0, 6);
        const images = [];
        for (const n of open) { try { images.push({ data: await window.hub.fs.read(n.image, { encoding: 'base64' }), mime: 'image/png' }); } catch { /* missing file */ } }
        return { ok: true, images, value: { notes: list.map(({ image, ...n }) => n), screenshots: images.length ? `The ${images.length} images are the open notes' screenshots, in this order: ${open.map((n) => n.id).join(', ')}` : 'none' } };
      }
      if (action === 'done' || action === 'reopen') return { ok: true, value: d.notes.set(args.id, { done: action === 'done' }) };
      if (action === 'edit') return { ok: true, value: d.notes.set(args.id, { text: String(args.text || '') }) };
      if (action === 'delete') { d.notes.remove(args.id); return { ok: true, value: d.notes.list() } ; }
      if (action === 'add') { const n = await d.notes.add(Number(args.time) || 0, args.text); return { ok: true, value: n }; }
      return { ok: false, error: 'action must be list, done, reopen, edit, delete or add' };
    }
    if (tool === 'three_sliders') return { ok: true, value: d.sliders(args.layer, args.set || null) };
    if (tool === 'three_looks') return { ok: true, value: d.looks(args.layer, args.action || 'list', args.name) };
    if (tool === 'three_contact_sheet') {
      const sheet = await d.contactSheet({ times: Array.isArray(args.times) ? args.times : null, count: Math.max(2, Math.min(16, Number(args.count) || 8)) });
      return { ok: true, images: [{ data: sheet.dataUrl.split(',')[1], mime: 'image/jpeg' }], value: { frames: sheet.frames, note: 'Numbered left to right, top to bottom.' } };
    }
    if (tool === 'three_references') {
      const action = args.action || 'list';
      const R = d.refs;
      const find = (n) => R.list().find((r) => r.key === n || r.name === n) || (() => { throw new Error(`No reference "${n}". References: ${R.list().map((r) => r.key).join(', ') || 'none'}`); })();
      if (action === 'list') {
        const list = R.list();
        const imgs = list.filter((r) => r.kind === 'image').slice(0, 6);
        const images = [];
        for (const r of imgs) {
          try {
            const img = new Image(); img.src = R.url(r.path); await img.decode();
            const c = document.createElement('canvas'); const sc = Math.min(1, 640 / Math.max(img.width, img.height));
            c.width = Math.max(1, Math.round(img.width * sc)); c.height = Math.max(1, Math.round(img.height * sc));
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            images.push({ data: c.toDataURL('image/jpeg', 0.85).split(',')[1], mime: 'image/jpeg' });
          } catch { /* unreadable */ }
        }
        return { ok: true, images, value: { palette: R.palette(), references: list.map((r) => ({ name: r.key, kind: r.kind, file: r.name, size: R.size(r.size), use: R.use(r) })), pictures: images.length ? `The ${images.length} images are, in order: ${imgs.map((r) => r.key).join(', ')}` : 'none' } };
      }
      if (action === 'add') {
        const p = String(args.path || '');
        const dir = await window.hub.attachmentsDir();
        if (!p.toLowerCase().startsWith(dir.toLowerCase())) return { ok: false, error: 'You can only add files the user attached in this chat (their path is in the hub\'s attachments folder). Ask the user to drop the file in the chat or in the Lab\'s References.' };
        const r = await R.add(p, args.name);
        return { ok: true, value: { added: r.key, kind: r.kind, use: R.use(r), note: 'Available in code right away; run the sketch (three_set_code / three_update_layer) to use it.' } };
      }
      if (action === 'rename') { const r = find(args.name); return { ok: true, value: { renamed: R.rename(r, String(args.to || r.key)) } }; }
      if (action === 'remove') { R.remove(find(args.name)); return { ok: true, value: { references: R.list().map((r) => r.key) } }; }
      if (action === 'palette') {
        if (args.from) return { ok: true, value: { palette: await R.paletteFrom(String(args.from)) } };
        const cols = parseColors(args.coolors || args.colors || []);
        R.setPalette(cols);
        return { ok: true, value: { palette: cols } };
      }
      return { ok: false, error: 'action must be list, add, rename, remove or palette' };
    }
    if (tool === 'three_keyframes') return { ok: true, value: d.setKeyframes(args.layer, args.property, args.keys, args.clear) };
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
    get lab() { return api.lab; }, // Lab actions (palette commands, MIDI simulation for tests)
    get director() { return api.director; }, // the Lab's layer / slider / palette API (the FX picker and its chat commands use it)
    get scenes() { return api.scenes || null; }, // the sketches as data, for per-chat scenes (chat-scenes.js)
    // resolves when no director call is changing the sketch on screen (a chat switch waits for it)
    idle: () => (inflight ? new Promise((r) => idleWaiters.push(r)) : Promise.resolve()),
    _sandbox: (parent, onMessage, params) => sandboxFrame(parent, 'sketch', onMessage, params, { lazy: true, name: 'backstage' }), // tools/three-backstage.js
    live: { counts: () => live.counts() }, // reloads vs in-place updates of the preview (dev/checks/live.js)
    _util: { codeOrOutline, numbered },
    // A picture of the Lab preview (data URL) for second opinions; null when nothing renders.
    shot: async () => (api.director ? api.director.shot() : null),
    // Files dropped in the Three Director's chat become references of the open sketch.
    addReference: (p) => (api.addRef ? api.addRef(p) : Promise.reject(new Error('Open the Three.js Lab first'))),
    isReference: (name) => /\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov|m4v|mkv|glb|gltf|obj|fbx|stl|ply|mp3|wav|ogg|m4a|flac|aac|ttf|otf|woff2?|hdr|exr)$/i.test(name),
    openShader(code) { ensureOpen('shader'); setTimeout(() => api.openShader?.(code), 60); },
    restartVisible: () => api.restartVisible?.() ?? false,
    // The chat commands' way in (tools/three-cmds.js): the Lab, loaded and shown (unless show: false), with its
    // sketch tab on top; resolves to api.cmd.
    async cmd({ show = true } = {}) {
      if (show && H.surfaceIdFor?.(H.activeId) !== 'tool:three') activate('tool:three', { focus: false });
      if (!tabs) Tools.shown(Tools.get('three'));
      if (show && tabs?.current !== 'sketch') tabs.show('sketch');
      for (let i = 0; i < 80 && !(api.cmd && api.director); i += 1) await new Promise((r) => setTimeout(r, 100));
      if (!api.cmd) throw new Error('The Three.js Lab did not load');
      return api.cmd;
    },
    toolTabs: () => TOOL_TABS.map(([id, label, hint]) => ({ id, label, hint })),
    peek: () => api.cmd || null, // the commands' completions: only when the Lab is already loaded
    showTab(id) { ensureOpen(id); },
    // run a Lab action from anywhere (the command palette): opens the Lab first
    async act(name) {
      ensureOpen('sketch');
      for (let i = 0; i < 60 && !api.actions; i += 1) await new Promise((r) => setTimeout(r, 100));
      api.actions?.[name]?.();
    },
  };
})();

// ---------- the Lab in the command palette (Ctrl+K) ----------
for (const [label, name] of [
  ['Lab: Restart the simulation', 'restart'], ['Lab: Freeze / unfreeze the picture', 'freeze'], ['Lab: Keys', 'keys'],
  ['Lab: ⚡ Triggers', 'triggers'], ['Lab: Write triggers to the timeline', 'writeTriggers'],
  ['Lab: Live sound from this PC (Spotify, YouTube…)', 'liveSystem'], ['Lab: Live sound off', 'liveOff'], ['Lab: Show / hide what\'s playing', 'nowPlaying'],
  ['Lab: Present', 'present'], ['Lab: Stage window', 'stage'], ['Lab: Show / hide the code', 'code'], ['Lab: Load music or video…', 'music'],
  ['Lab: Save a screenshot', 'shot'], ['Lab: Copy a screenshot', 'copyShot'], ['Lab: Contact sheet', 'sheet'], ['Lab: New sketch from a template', 'newSketch'],
  ['Lab: All timeline controls / fewer', 'allControls'], ['Lab: Mute / unmute the music', 'mute'],
  ['Lab: Composition guides (thirds, golden, center)', 'guides'], ['Lab: Loop this bar', 'loopBar'], ['Lab: Next snap setting', 'snap'],
  ['Lab: Quantize markers to the grid', 'quantize'], ['Lab: Remove double markers', 'dedupe'], ['Lab: Cycle looks every 4 bars / off', 'cycleLooks'],
  ['Lab: Copy all the code', 'copyCode'], ['Lab: Save the sliders into the code', 'saveSliders'], ['Lab: Save the sliders as a look…', 'saveLook'], ['Lab: Stage window always on top / normal', 'stageTop'],
  ['Lab: Shuffle the sliders (R)', 'shuffle'], ['Lab: The shuffle before (Shift+R)', 'shuffleBack'], ['Lab: Recall slot A', 'slotA'], ['Lab: Recall slot B', 'slotB'], ['Lab: Recall slot C', 'slotC'],
  ['Lab: Store the sliders in slot A', 'storeA'], ['Lab: Store the sliders in slot B', 'storeB'], ['Lab: Save as a look (quick)', 'quickLook'], ['Lab: Next look', 'nextLook'],
  ['Lab: Freeze on the next beat', 'freezeBeat'], ['Lab: Pin this frame to compare (|)', 'pin'], ['Lab: Compare off', 'compareOff'], ['Lab: Still at the exact frame size', 'still'], ['Lab: Safe zones on / off', 'safe'],
  ['Lab: Live sound on / off (Shift+L)', 'live'], ['Lab: Auto bars', 'autoBars'], ['Lab: Mark the song\'s sections', 'sections'], ['Lab: Click track on / off', 'clickTrack'], ['Lab: Quantize taps on / off (Q)', 'quantizeTaps'],
  ['Lab: Frame 9:16 (1080×1920)', 'size916'], ['Lab: Frame 16:9 (1920×1080)', 'size169'], ['Lab: Frame 4:5 (1080×1350)', 'size45'], ['Lab: Frame 1:1 (1080×1080)', 'size11'], ['Lab: Fit the frame', 'sizeFit'],
  ['Lab: Next sketch (Ctrl+PgDn)', 'nextSketch'], ['Lab: Previous sketch (Ctrl+PgUp)', 'prevSketch'], ['Lab: Tools drawer', 'tools'],
]) AppUI.addAction(label, () => ThreeLab.act(name));
