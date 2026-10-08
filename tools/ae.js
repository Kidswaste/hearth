// After Effects toolkit: expression builder, scripts that run inside AE, aerender queue,
// timecode/retime/bitrate calculators, comp presets, palette extraction, project finder, shortcuts.
const AEKit = (() => {
  let tabs = null;
  let aeStatus = null;
  const api = {};

  async function status() {
    aeStatus ||= await window.hub.ae.status();
    return aeStatus;
  }

  const IS_MAC = /Mac/.test(navigator.platform);
  const UNDO = IS_MAC ? '⌘Z' : 'Ctrl+Z';
  const clean = (msg) => String(msg).replace(/^Error invoking remote method[^:]*: (Error: )?/, '');
  // Mac keyboard names for AE's (Windows-written) shortcut list.
  const macKeys = (k) => (IS_MAC ? k.replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧').replace(/Alt\b/g, '⌥ Option').replace(/Page Up/g, 'Page Up (fn↑)').replace(/Page Down/g, 'Page Down (fn↓)') : k);

  // Runs ExtendScript in After Effects (AE starts if it isn't open). Wrapped in one undo step.
  async function runCode(code, label = 'Hearth script') {
    const st = await status();
    if (!st.found) { toast(st.reason || 'After Effects was not found. Set its folder in Settings → Folders.', { type: 'error', timeout: 8000 }); return false; }
    try {
      const r = await window.hub.ae.run(code, label);
      if (r && r.ok === false) { toast(r.error, { type: 'error', timeout: 10000 }); return false; }
      toast(`Sent "${label}" to After Effects. One ${UNDO} in AE undoes it.`, { timeout: 3500 });
      return true;
    } catch (err) { toast(clean(err.message), { type: 'error' }); return false; }
  }

  // Renders a parameter form; returns { node, values() }.
  function paramForm(params, onChange) {
    const inputs = {};
    const node = el('div', { class: 'param-form' }, params.map((p) => {
      let input;
      if (p.type === 'select') input = el('select', {}, p.options.map((o) => el('option', { value: o, text: o, selected: o === p.value })));
      else if (p.type === 'checkbox') input = el('input', { type: 'checkbox', checked: Boolean(p.value) });
      else input = el('input', { type: p.type === 'number' ? 'number' : 'text', value: p.value, step: 'any' });
      inputs[p.name] = input;
      input.addEventListener('input', onChange);
      input.addEventListener('change', onChange);
      return el('label', { class: p.type === 'checkbox' ? 'check' : '' }, p.type === 'checkbox' ? [input, p.label] : [p.label, input]);
    }));
    const values = () => Object.fromEntries(params.map((p) => {
      const i = inputs[p.name];
      if (p.type === 'checkbox') return [p.name, i.checked];
      if (p.type === 'number') return [p.name, i.value === '' ? 0 : Number(i.value)];
      return [p.name, i.value];
    }));
    return { node, values };
  }

  const codeBlock = (code, lang = 'js') => el('pre', { class: 'code-view', html: highlight(code, lang) });

  // ---------- Expressions ----------
  function expressionsTab(pane) {
    let favorites = new Set(store.get('ae.favExpr', []));
    let custom = [];
    let selected = null;
    const search = el('input', { type: 'search', placeholder: 'Search expressions…' });
    const list = el('div', { class: 'lib-list' });
    const detail = el('div', { class: 'lib-detail' });
    const describe = el('textarea', { rows: 3, placeholder: 'Describe what you want, e.g. "position drifts slowly toward the mouse null and overshoots"' });
    pane.append(el('div', { class: 'lib-layout' },
      el('div', { class: 'lib-side' }, search, list,
        el('div', { class: 'lib-ask' }, el('b', { text: 'Ask Claude for an expression' }), describe,
          el('div', { class: 'row' },
            el('input', { class: 'ae-prop', placeholder: 'Property (e.g. Position)' }),
            el('button', { class: 'primary small', text: 'Write it', on: { click: askClaudeExpr } })))),
      detail));
    function askClaudeExpr() {
      if (!describe.value.trim()) { toast('Describe the behavior first', { type: 'error' }); return; }
      const prop = pane.querySelector('.ae-prop').value.trim() || 'the property';
      askClaude(`Write an After Effects expression (JavaScript engine) for ${prop} that: ${describe.value.trim()}\n\nReturn the expression in one \`\`\`js block, then one line on where to paste it and any controls (sliders, nulls) to create first.`);
    }
    function all() {
      return [
        ...custom.map((x) => ({ ...x, cat: 'My expressions', custom: true, params: [], code: () => x.code })),
        ...AEData.EXPRESSIONS,
      ];
    }
    function renderList() {
      const qv = search.value.trim().toLowerCase();
      const items = all().filter((x) => !qv || `${x.name} ${x.cat} ${x.where || ''}`.toLowerCase().includes(qv));
      const groups = new Map();
      const favs = items.filter((x) => favorites.has(x.name));
      if (favs.length) groups.set('★ Favorites', favs);
      for (const x of items) { if (!groups.has(x.cat)) groups.set(x.cat, []); groups.get(x.cat).push(x); }
      list.replaceChildren(...[...groups].map(([g, xs]) => el('div', {}, el('div', { class: 'lib-group', text: g }),
        xs.map((x) => el('button', { class: `lib-item${selected === x.name ? ' on' : ''}`, text: x.name, on: { click: () => show(x) } })))),
      el('button', { class: 'ghost small lib-add', text: '＋ Save my own expression', on: { click: addCustom } }));
    }
    async function addCustom(existing) {
      const v = await Modal.form(existing?.name ? 'Edit expression' : 'Save an expression', [
        { name: 'name', label: 'Name', value: existing?.name || '' },
        { name: 'where', label: 'Where it goes (optional)', value: existing?.where || '' },
        { name: 'code', label: 'Expression', type: 'textarea', rows: 8, value: existing?.code || '' },
      ], { ok: 'Save' });
      if (!v || !v.name.trim() || !v.code.trim()) return;
      custom = custom.filter((x) => x.name !== existing?.name);
      custom.push({ name: v.name.trim(), where: v.where.trim(), code: v.code });
      await window.hub.kvSet('ae-expressions', custom);
      renderList();
    }
    function show(x) {
      selected = x.name;
      renderList();
      const preview = el('div');
      let code = '';
      const form = paramForm(x.params || [], () => update());
      const update = () => { code = x.code(form.values()); preview.replaceChildren(codeBlock(code)); };
      const fav = el('button', { class: 'ghost small', text: favorites.has(x.name) ? '★ Favorite' : '☆ Favorite', on: { click: () => {
        if (favorites.has(x.name)) favorites.delete(x.name); else favorites.add(x.name);
        store.set('ae.favExpr', [...favorites]);
        fav.textContent = favorites.has(x.name) ? '★ Favorite' : '☆ Favorite';
        renderList();
      } } });
      detail.replaceChildren(el('h3', { text: x.name }),
        x.where ? el('p', { class: 'hint', text: `Paste on: ${x.where}. Alt+click the property's stopwatch in AE, then paste.` }) : null,
        x.params?.length ? form.node : null, preview,
        el('div', { class: 'row' },
          el('button', { class: 'primary small', text: 'Copy expression', on: { click: () => copyText(code, 'Expression copied') } }), fav,
          el('button', { class: 'ghost small', text: 'Explain / adapt with Claude', on: { click: () => draftToClaude(`Here's an After Effects expression I'm using on ${x.where || 'a property'}:\n\n\`\`\`js\n${code}\n\`\`\`\n\n`) } }),
          x.custom ? el('button', { class: 'ghost small', text: 'Edit', on: { click: () => addCustom(custom.find((c) => c.name === x.name)) } }) : null,
          x.custom ? el('button', { class: 'ghost small danger', text: 'Delete', on: { click: async () => { custom = custom.filter((c) => c.name !== x.name); await window.hub.kvSet('ae-expressions', custom); detail.replaceChildren(); renderList(); } } }) : null));
      update();
    }
    search.addEventListener('input', renderList);
    (async () => {
      custom = await window.hub.kvGet('ae-expressions', []);
      renderList();
      show(AEData.EXPRESSIONS[0]);
    })();
  }

  // ---------- Scripts ----------
  function scriptsTab(pane) {
    let mine = [];
    const banner = el('div', { class: 'ae-banner' });
    const list = el('div', { class: 'lib-list' });
    const detail = el('div', { class: 'lib-detail' });
    pane.append(banner, el('div', { class: 'lib-layout' }, el('div', { class: 'lib-side' }, list), detail));
    status().then((st) => {
      banner.className = `ae-banner ${st.found ? 'ok' : 'bad'}`;
      banner.textContent = st.found
        ? `After Effects ${st.version || ''} found. "Run in After Effects" starts AE if needed and runs the script as one undoable step.${IS_MAC ? ' The first time, macOS asks to let Hearth control After Effects: allow it.' : ''}`
        : st.reason || 'After Effects not found. Set its folder in Settings → Folders.';
    });
    const renderList = () => list.replaceChildren(
      el('div', { class: 'lib-group', text: 'Built in' }),
      ...AEData.SCRIPTS.map((s) => el('button', { class: 'lib-item', text: s.name, title: s.desc, on: { click: () => showBuiltin(s) } })),
      el('div', { class: 'lib-group', text: 'My scripts' }),
      ...mine.map((s) => el('button', { class: 'lib-item', text: s.name, on: { click: () => showMine(s) } })),
      el('button', { class: 'ghost small lib-add', text: '＋ New script', on: { click: () => showMine({ id: `j${Date.now()}`, name: 'New script', code: '// app.project.activeItem is the open comp\nvar comp = app.project.activeItem;\nif (!(comp instanceof CompItem)) throw new Error("Open a composition first.");\n\n' }) } }));
    const install = async (name, code) => {
      try { const r = await window.hub.ae.install(name, code); toast(`Installed. In AE: File → Scripts → ${name}.jsx (restart AE if it's open).`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(r.file) }, timeout: 7000 }); } catch (err) { toast(clean(err.message), { type: 'error' }); }
    };
    function showBuiltin(s) {
      const preview = el('div');
      let code = '';
      const form = paramForm(s.params, () => update());
      const update = () => { code = s.code(form.values()); preview.replaceChildren(codeBlock(code)); };
      detail.replaceChildren(el('h3', { text: s.name }), el('p', { class: 'hint', text: s.desc }), s.params.length ? form.node : null,
        el('div', { class: 'row' },
          el('button', { class: 'primary small', text: '▶ Run in After Effects', on: { click: () => runCode(code, s.name) } }),
          el('button', { class: 'ghost small', text: 'Copy', on: { click: () => copyText(code, 'Script copied') } }),
          el('button', { class: 'ghost small', text: 'Install in AE Scripts menu', on: { click: () => install(s.name, `app.beginUndoGroup(${JSON.stringify(s.name)});\n${code}\napp.endUndoGroup();\n`) } }),
          el('button', { class: 'ghost small', text: 'Copy to My scripts', on: { click: () => showMine({ id: `j${Date.now()}`, name: `${s.name} (custom)`, code }) } })),
        preview);
      update();
    }
    function showMine(s) {
      const name = el('input', { value: s.name });
      const host = el('div', { class: 'ae-editor' });
      const editor = new CodeEditor(host, { lang: 'js', value: s.code, onRun: () => runCode(editor.value, name.value) });
      const persist = async () => {
        s.name = name.value.trim() || 'Untitled';
        s.code = editor.value;
        mine = [...mine.filter((m) => m.id !== s.id), s];
        await window.hub.kvSet('ae-scripts', mine);
        renderList();
        toast('Script saved', { timeout: 1200 });
      };
      detail.replaceChildren(el('h3', { text: 'My script' }), el('label', {}, 'Name', name), host,
        el('p', { class: 'hint', text: 'ExtendScript (ES3). Throw an Error to show a message in AE. Ctrl+Enter runs it.' }),
        el('div', { class: 'row' },
          el('button', { class: 'primary small', text: '▶ Run in After Effects', on: { click: () => runCode(editor.value, name.value) } }),
          el('button', { class: 'ghost small', text: 'Save', on: { click: persist } }),
          el('button', { class: 'ghost small', text: 'Install in AE Scripts menu', on: { click: () => install(name.value, `app.beginUndoGroup(${JSON.stringify(name.value)});\n${editor.value}\napp.endUndoGroup();\n`) } }),
          el('button', { class: 'ghost small', text: 'Ask Claude to write/fix', on: { click: () => draftToClaude(`Help me with this After Effects ExtendScript (ES3, runs via File → Scripts). Goal: \n\n\`\`\`js\n${editor.value}\n\`\`\``) } }),
          el('button', { class: 'ghost small danger', text: 'Delete', on: { click: async () => { mine = mine.filter((m) => m.id !== s.id); await window.hub.kvSet('ae-scripts', mine); detail.replaceChildren(); renderList(); } } })));
    }
    (async () => { mine = await window.hub.kvGet('ae-scripts', []); renderList(); showBuiltin(AEData.SCRIPTS[0]); })();
    api.newScript = (code) => showMine({ id: `j${Date.now()}`, name: 'From chat', code });
  }

  // ---------- Render queue (aerender) ----------
  function renderTab(pane) {
    let queue = [];
    let history = [];
    let running = null;
    const project = el('input', { placeholder: 'Choose an .aep project…' });
    const comp = el('input', { placeholder: 'Comp name (exact). Empty = use the project\'s Render Queue' });
    const om = el('select', {}, el('option', { value: '', text: 'Output module: default' }));
    const output = el('input', { placeholder: 'Output file (empty = AE\'s render queue setting)' });
    const start = el('input', { type: 'number', placeholder: 'Start frame' });
    const end = el('input', { type: 'number', placeholder: 'End frame' });
    const mfr = el('input', { type: 'checkbox', checked: true });
    const queueBox = el('div', { class: 'render-queue' });
    const historyBox = el('div', { class: 'render-history' });
    const logBox = el('pre', { class: 'render-log' });
    const pickProject = async () => {
      const [p] = await window.hub.openDialog({ filters: [{ name: 'After Effects project', extensions: ['aep'] }] });
      if (p) project.value = p;
    };
    const pickOutput = async () => {
      const base = (comp.value || 'render').replace(/[\\/:*?"<>|]/g, '_');
      const r = await window.hub.saveFile({ defaultPath: `${base}.mp4`, filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'avi'] }], content: '' });
      if (r) output.value = r;
    };
    pane.append(el('div', { class: 'render-layout' },
      el('div', { class: 'render-form' },
        el('h3', { text: 'New render' }),
        el('label', {}, 'Project', el('div', { class: 'folder-row' }, project, el('button', { class: 'ghost small', text: 'Browse…', on: { click: pickProject } }))),
        el('label', {}, 'Composition', comp),
        el('label', {}, 'Output module template', om),
        el('label', {}, 'Output file', el('div', { class: 'folder-row' }, output, el('button', { class: 'ghost small', text: 'Choose…', on: { click: pickOutput } }))),
        el('div', { class: 'grid2' }, el('label', {}, 'Start frame (optional)', start), el('label', {}, 'End frame (optional)', end)),
        el('label', { class: 'check' }, mfr, 'Multi-frame rendering (faster on multi-core CPUs)'),
        el('div', { class: 'row' },
          el('button', { class: 'primary small', text: '＋ Add to queue', on: { click: add } }),
          el('button', { class: 'ghost small', text: '▶ Start queue', on: { click: next } })),
        el('p', { class: 'hint', text: 'Renders run in the background with aerender, so After Effects stays free. Save the project first: aerender renders the saved file.' })),
      el('div', { class: 'render-right' }, el('h3', { text: 'Queue' }), queueBox, el('h3', { text: 'Log' }), logBox, el('h3', { text: 'History' }), historyBox)));
    // Output file pick uses a save dialog; it writes an empty placeholder we delete before rendering.
    function add() {
      if (!project.value.trim()) { toast('Choose a project first', { type: 'error' }); return; }
      queue.push({ id: `r${Date.now()}`, project: project.value.trim(), comp: comp.value.trim(), omTemplate: om.value, output: output.value.trim(), start: start.value, end: end.value, multiFrames: mfr.checked, state: 'queued', pct: 0 });
      renderQueue();
      if (!running) toast('Added. Press Start queue when ready.', { timeout: 2000 });
    }
    async function next() {
      if (running) return;
      const job = queue.find((j) => j.state === 'queued');
      if (!job) { if (!queue.length) toast('The queue is empty', { type: 'error' }); return; }
      running = job;
      job.state = 'rendering';
      job.startedAt = Date.now();
      logBox.textContent = '';
      if (job.output) {
        const st = await window.hub.fs.stat(job.output);
        if (st && st.size === 0) await window.hub.fs.trash([job.output]);
      }
      try { await window.hub.ae.render(job); } catch (err) { job.state = 'failed'; job.error = clean(err.message); running = null; renderQueue(); toast(job.error, { type: 'error' }); }
      renderQueue();
    }
    window.hub.ae.onRender((ev) => {
      const job = queue.find((j) => j.id === ev.id);
      if (!job) return;
      if (ev.type === 'log') {
        logBox.textContent += `${ev.line}\n`;
        if (logBox.textContent.length > 60000) logBox.textContent = logBox.textContent.slice(-40000);
        logBox.scrollTop = logBox.scrollHeight;
      }
      if (ev.type === 'progress') { job.pct = ev.pct; job.eta = ev.eta; job.frame = ev.frame; job.total = ev.total; updateRow(job); }
      if (ev.type === 'done') {
        job.state = ev.cancelled ? 'cancelled' : ev.code === 0 ? 'done' : 'failed';
        job.seconds = ev.seconds;
        if (job.state === 'failed') job.error = ev.error || (logBox.textContent.match(/aerender ERROR[^\n]*/i) || [`aerender exited with code ${ev.code}`])[0];
        history.unshift({ ...job, finishedAt: Date.now() });
        history = history.slice(0, 50);
        window.hub.kvSet('ae-renders', history);
        running = null;
        renderQueue();
        renderHistory();
        const name = job.comp || job.project.split(/[\\/]/).pop();
        if (job.state === 'done') {
          toast(`Render finished: ${name} (${job.seconds}s)`, job.output ? { action: { label: 'Show', fn: () => window.hub.fs.reveal(job.output) }, timeout: 9000 } : {});
          window.hub.isWindowFocused().then((f) => { if (!f) { new Notification('Render finished', { body: `${name} · ${job.seconds}s` }); window.hub.flashWindow(); } });
        } else if (job.state === 'failed') toast(`Render failed: ${job.error}`, { type: 'error', timeout: 9000 });
        next();
      }
    });
    function updateRow(job) {
      const row = queueBox.querySelector(`[data-id="${job.id}"]`);
      if (!row) { renderQueue(); return; }
      row.querySelector('.bar span').style.width = `${Math.round((job.pct || 0) * 100)}%`;
      row.querySelector('.render-state').textContent = job.state === 'rendering'
        ? `${Math.round((job.pct || 0) * 100)}% · frame ${job.frame}/${job.total}${job.eta != null ? ` · ~${job.eta}s left` : ''}` : job.state;
    }
    function renderQueue() {
      queueBox.replaceChildren(...(queue.length ? queue.map((j) => el('div', { class: `render-row ${j.state}`, dataset: { id: j.id } },
        el('div', { class: 'render-name' }, el('b', { text: j.comp || '(Render Queue)' }), el('span', { class: 'hint', text: j.project.split(/[\\/]/).pop() })),
        el('div', { class: 'bar' }, el('span', { style: { width: `${Math.round((j.pct || 0) * 100)}%` } })),
        el('span', { class: 'render-state', text: j.state === 'failed' ? `failed: ${j.error || ''}` : j.state }),
        j.state === 'rendering' ? el('button', { class: 'ghost small', text: 'Cancel', on: { click: () => window.hub.ae.cancel(j.id) } })
          : j.state === 'queued' ? el('button', { class: 'ghost small', text: 'Remove', on: { click: () => { queue = queue.filter((x) => x !== j); renderQueue(); } } })
            : el('button', { class: 'ghost small', text: 'Clear', on: { click: () => { queue = queue.filter((x) => x !== j); renderQueue(); } } }))) : [el('p', { class: 'hint', text: 'Nothing queued.' })]));
    }
    function renderHistory() {
      historyBox.replaceChildren(...(history.length ? history.slice(0, 15).map((h) => el('div', { class: `render-row ${h.state}` },
        el('div', { class: 'render-name' }, el('b', { text: h.comp || '(Render Queue)' }), el('span', { class: 'hint', text: `${fmtDate(h.finishedAt)} · ${h.seconds ?? '?'}s · ${h.state}` })),
        h.output ? el('button', { class: 'ghost small', text: 'Show file', on: { click: () => window.hub.fs.reveal(h.output) } }) : null,
        el('button', { class: 'ghost small', text: 'Render again', on: { click: () => { queue.push({ ...h, id: `r${Date.now()}`, state: 'queued', pct: 0 }); renderQueue(); next(); } } }))) : [el('p', { class: 'hint', text: 'Finished renders show up here.' })]));
    }
    (async () => {
      const tmpl = await window.hub.ae.templates();
      om.append(...tmpl.map((t) => el('option', { value: t, text: t })));
      history = await window.hub.kvGet('ae-renders', []);
      renderQueue();
      renderHistory();
    })();
    api.prefillRender = (aep) => { project.value = aep; comp.focus(); };
  }

  // ---------- Calculators ----------
  const FPS = [['23.976', 24000 / 1001, false], ['24', 24, false], ['25', 25, false], ['29.97 NDF', 30000 / 1001, false], ['29.97 DF', 30000 / 1001, true], ['30', 30, false], ['50', 50, false], ['59.94 DF', 60000 / 1001, true], ['60', 60, false]];
  function framesToTc(frames, fpsEntry) {
    const [, fps, drop] = fpsEntry;
    const nominal = Math.round(fps);
    let f = Math.round(frames);
    const neg = f < 0;
    f = Math.abs(f);
    if (drop) {
      const dropN = nominal === 60 ? 4 : 2;
      const per10 = nominal * 600 - dropN * 9;
      const perMin = nominal * 60 - dropN;
      const d = Math.floor(f / per10);
      const m = f % per10;
      f += dropN * 9 * d + (m > dropN ? dropN * Math.floor((m - dropN) / perMin) : 0);
    }
    const ff = f % nominal; const s = Math.floor(f / nominal) % 60; const m = Math.floor(f / (nominal * 60)) % 60; const h = Math.floor(f / (nominal * 3600));
    const p = (x) => String(x).padStart(2, '0');
    return `${neg ? '-' : ''}${p(h)}:${p(m)}:${p(s)}${drop ? ';' : ':'}${p(ff)}`;
  }
  function tcToFrames(tc, fpsEntry) {
    const [, fps, drop] = fpsEntry;
    const nominal = Math.round(fps);
    const parts = tc.trim().split(/[:;.]/).map(Number);
    if (parts.some(Number.isNaN)) return null;
    while (parts.length < 4) parts.unshift(0);
    const [h, m, s, f] = parts;
    let frames = ((h * 3600 + m * 60 + s) * nominal) + f;
    if (drop) {
      const dropN = nominal === 60 ? 4 : 2;
      const totalMin = h * 60 + m;
      frames -= dropN * (totalMin - Math.floor(totalMin / 10));
    }
    return frames;
  }
  function calcTab(pane) {
    const fpsSel = el('select', {}, FPS.map(([label], i) => el('option', { value: i, text: label, selected: label === '30' })));
    const fps = () => FPS[Number(fpsSel.value)];
    // Timecode math
    const a = el('input', { value: '00:00:10:00' });
    const b = el('input', { value: '00:00:02:15' });
    const op = el('select', {}, el('option', { value: '+', text: '+' }), el('option', { value: '-', text: '−' }));
    const tcOut = el('div', { class: 'calc-out' });
    const framesIn = el('input', { type: 'number', value: 300 });
    const secondsIn = el('input', { type: 'number', value: 10, step: 'any' });
    const convOut = el('div', { class: 'calc-out' });
    const updateTc = () => {
      const fa = tcToFrames(a.value, fps()); const fb = tcToFrames(b.value, fps());
      if (fa == null || fb == null) { tcOut.textContent = 'Use HH:MM:SS:FF'; return; }
      const r = op.value === '+' ? fa + fb : fa - fb;
      tcOut.replaceChildren(el('b', { text: framesToTc(r, fps()) }), el('span', { class: 'hint', text: ` = ${r} frames = ${(r / fps()[1]).toFixed(3)} s` }));
      const fr = Number(framesIn.value || 0); const sec = Number(secondsIn.value || 0);
      convOut.replaceChildren(
        el('div', {}, `${fr} frames → `, el('b', { text: framesToTc(fr, fps()) }), el('span', { class: 'hint', text: ` (${(fr / fps()[1]).toFixed(3)} s)` })),
        el('div', {}, `${sec} s → `, el('b', { text: framesToTc(Math.round(sec * fps()[1]), fps()) }), el('span', { class: 'hint', text: ` (${Math.round(sec * fps()[1])} frames)` })));
    };
    // Retime
    const durIn = el('input', { type: 'number', value: 10, step: 'any' });
    const speedIn = el('input', { type: 'number', value: 50, step: 'any' });
    const targetDur = el('input', { type: 'number', value: 6, step: 'any' });
    const srcFps = el('input', { type: 'number', value: 120, step: 'any' });
    const retimeOut = el('div', { class: 'calc-out' });
    const updateRetime = () => {
      const d = Number(durIn.value); const sp = Number(speedIn.value) / 100; const td = Number(targetDur.value); const sf = Number(srcFps.value); const cf = fps()[1];
      retimeOut.replaceChildren(
        el('div', {}, `At ${speedIn.value}% speed a ${d}s clip lasts `, el('b', { text: `${(d / sp).toFixed(3)} s` }), ` · Time Stretch ${(100 / sp).toFixed(2)}%`),
        el('div', {}, `To fit ${d}s into ${td}s: speed `, el('b', { text: `${((d / td) * 100).toFixed(2)}%` }), ` · Time Stretch ${((td / d) * 100).toFixed(2)}%`),
        el('div', {}, `${sf} fps footage conformed to ${fps()[0]} plays at `, el('b', { text: `${((cf / sf) * 100).toFixed(2)}%` }), ` speed (smooth slow motion up to ${(sf / cf).toFixed(2)}×)`));
    };
    // Bitrate / size
    const lenIn = el('input', { type: 'number', value: 60, step: 'any' });
    const rateIn = el('input', { type: 'number', value: 8, step: 'any' });
    const audioIn = el('input', { type: 'number', value: 320, step: 'any' });
    const sizeIn = el('input', { type: 'number', value: 100, step: 'any' });
    const preset = el('select', {}, el('option', { value: '', text: 'Platform presets…' }), AEData.BITRATES.map(([name, mbps]) => el('option', { value: mbps, text: `${name}: ${mbps} Mbps` })));
    const sizeOut = el('div', { class: 'calc-out' });
    const updateSize = () => {
      const len = Number(lenIn.value); const v = Number(rateIn.value); const au = Number(audioIn.value) / 1000;
      const mb = ((v + au) * len) / 8;
      const fit = ((Number(sizeIn.value) * 8) / len) - au;
      sizeOut.replaceChildren(
        el('div', {}, `${len}s at ${v} Mbps video + ${audioIn.value} kbps audio ≈ `, el('b', { text: `${mb.toFixed(1)} MB` })),
        el('div', {}, `To fit ${sizeIn.value} MB in ${len}s use about `, el('b', { text: fit > 0 ? `${fit.toFixed(2)} Mbps video` : 'too small for that duration' })));
    };
    preset.addEventListener('change', () => { if (preset.value) { rateIn.value = preset.value; updateSize(); preset.value = ''; } });
    for (const i of [a, b, op, framesIn, secondsIn, fpsSel]) i.addEventListener('input', () => { updateTc(); updateRetime(); });
    fpsSel.addEventListener('change', () => { updateTc(); updateRetime(); });
    for (const i of [durIn, speedIn, targetDur, srcFps]) i.addEventListener('input', updateRetime);
    for (const i of [lenIn, rateIn, audioIn, sizeIn]) i.addEventListener('input', updateSize);
    pane.append(el('div', { class: 'calc-grid' },
      el('div', { class: 'calc-card' }, el('h3', { text: 'Timecode' }), el('label', {}, 'Frame rate', fpsSel),
        el('div', { class: 'row' }, a, op, b), tcOut, el('div', { class: 'grid2' }, el('label', {}, 'Frames', framesIn), el('label', {}, 'Seconds', secondsIn)), convOut),
      el('div', { class: 'calc-card' }, el('h3', { text: 'Retime / speed' }),
        el('div', { class: 'grid2' }, el('label', {}, 'Clip length (s)', durIn), el('label', {}, 'Speed (%)', speedIn), el('label', {}, 'Target length (s)', targetDur), el('label', {}, 'Footage fps', srcFps)), retimeOut,
        el('p', { class: 'hint', text: 'Uses the frame rate selected in the Timecode card.' })),
      el('div', { class: 'calc-card' }, el('h3', { text: 'Bitrate & file size' }), preset,
        el('div', { class: 'grid2' }, el('label', {}, 'Length (s)', lenIn), el('label', {}, 'Video (Mbps)', rateIn), el('label', {}, 'Audio (kbps)', audioIn), el('label', {}, 'Size limit (MB)', sizeIn)), sizeOut)));
    updateTc(); updateRetime(); updateSize();
  }

  // ---------- Comp presets ----------
  function presetsTab(pane) {
    const dur = el('input', { type: 'number', value: 10, step: 'any', class: 'kit-num' });
    const groups = [...new Set(AEData.PRESETS.map((p) => p.group))];
    pane.append(el('div', { class: 'row' }, el('span', { class: 'hint', text: 'Duration for new comps (s)' }), dur,
      el('button', { class: 'ghost small', text: '＋ Custom size…', on: { click: custom } })),
    ...groups.map((g) => el('div', {}, el('h3', { text: g }), el('div', { class: 'preset-grid' }, AEData.PRESETS.filter((p) => p.group === g).map(card)))));
    function card(p) {
      const ratio = (p.w / p.h).toFixed(3);
      return el('div', { class: 'preset-card' },
        el('div', { class: 'preset-shape', style: { aspectRatio: `${p.w} / ${p.h}` } }),
        el('b', { text: p.name }), el('span', { class: 'hint', text: `${p.w}×${p.h} · ${p.fps} fps · ${ratio}:1` }),
        el('div', { class: 'row' },
          el('button', { class: 'ghost small', text: 'Copy size', on: { click: () => copyText(`${p.w}x${p.h}`, 'Size copied') } }),
          el('button', { class: 'primary small', text: 'Create in AE', on: { click: () => runCode(AEData.scriptCreateComp({ name: p.name, w: p.w, h: p.h, fps: p.fps, duration: Number(dur.value) || 10 }), `Create comp ${p.name}`) } })));
    }
    async function custom() {
      const v = await Modal.form('Custom composition', [
        { name: 'name', label: 'Name', value: 'Comp' }, { name: 'w', label: 'Width', type: 'number', value: 1920 }, { name: 'h', label: 'Height', type: 'number', value: 1080 },
        { name: 'fps', label: 'Frame rate', type: 'number', value: 30 }, { name: 'duration', label: 'Duration (s)', type: 'number', value: Number(dur.value) || 10 }], { ok: 'Create in AE' });
      if (v) runCode(AEData.scriptCreateComp(v), `Create comp ${v.name}`);
    }
  }

  // ---------- Palette from image ----------
  function paletteTab(pane) {
    const out = el('div', { class: 'palette-out' });
    const count = el('select', {}, [4, 5, 6, 8, 10].map((k) => el('option', { value: k, text: `${k} colors`, selected: k === 6 })));
    const preview = el('img', { class: 'palette-img' });
    const intro = el('div', { class: 'drop-hint', text: 'Drop an image (a frame, a moodboard, a screenshot) to pull its main colors.' });
    let lastImg = null;
    pane.append(el('div', { class: 'three-toolbar' },
      el('button', { class: 'ghost small', text: 'Open image…', on: { click: async () => { const [p] = await window.hub.openDialog({ filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }] }); if (p) load(`file:///${p.replace(/\\/g, '/')}`); } } }),
      count), intro, el('div', { class: 'palette-layout' }, preview, out));
    dropZone(pane, (files) => { const f = files.find((x) => x.type.startsWith('image/')); if (f) load(URL.createObjectURL(f)); }, { hint: 'Drop an image' });
    count.addEventListener('change', () => lastImg && extract(lastImg));
    async function load(url) {
      const img = new Image();
      img.src = url;
      await img.decode();
      intro.hidden = true;
      preview.src = url;
      lastImg = img;
      extract(img);
    }
    function extract(img) {
      const k = Number(count.value);
      const c = document.createElement('canvas');
      const scale = 96 / Math.max(img.naturalWidth, img.naturalHeight);
      c.width = Math.max(1, Math.round(img.naturalWidth * scale)); c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const px = [];
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
      // k-means with k-means++ style spread seeding.
      let centers = [px[Math.floor(Math.random() * px.length)]];
      while (centers.length < k) {
        const dist = px.map((p) => Math.min(...centers.map((cc) => (p[0] - cc[0]) ** 2 + (p[1] - cc[1]) ** 2 + (p[2] - cc[2]) ** 2)));
        const sum = dist.reduce((s, x) => s + x, 0);
        let r = Math.random() * sum;
        let idx = 0;
        while (r > dist[idx] && idx < dist.length - 1) { r -= dist[idx]; idx += 1; }
        centers.push(px[idx]);
      }
      let counts = [];
      for (let it = 0; it < 12; it += 1) {
        const sums = centers.map(() => [0, 0, 0]);
        counts = centers.map(() => 0);
        for (const p of px) {
          let best = 0; let bd = Infinity;
          centers.forEach((cc, j) => { const dd = (p[0] - cc[0]) ** 2 + (p[1] - cc[1]) ** 2 + (p[2] - cc[2]) ** 2; if (dd < bd) { bd = dd; best = j; } });
          sums[best][0] += p[0]; sums[best][1] += p[1]; sums[best][2] += p[2]; counts[best] += 1;
        }
        centers = centers.map((cc, j) => (counts[j] ? sums[j].map((s) => s / counts[j]) : cc));
      }
      const total = counts.reduce((s, x) => s + x, 0);
      const colors = centers.map((cc, j) => ({ rgb: cc.map((v) => v / 255), share: counts[j] / total }))
        .filter((x) => x.share > 0).sort((x, y) => y.share - x.share)
        .map((x) => ({ ...x, hex: Kit.hexOf({ r: x.rgb[0], g: x.rgb[1], b: x.rgb[2] }) }));
      const ae = colors.map((x) => `[${x.rgb.map((v) => v.toFixed(4)).join(', ')}, 1]`);
      out.replaceChildren(
        el('div', { class: 'palette-swatches' }, colors.map((x) => el('button', {
          class: 'palette-swatch', style: { background: x.hex, flex: String(Math.max(0.6, x.share * 6)) }, title: `${x.hex} · ${Math.round(x.share * 100)}% · click to copy`,
          on: { click: () => copyText(x.hex, `${x.hex} copied`) },
        }, el('span', { text: x.hex })))),
        el('div', { class: 'row' },
          el('button', { class: 'ghost small', text: 'Copy HEX list', on: { click: () => copyText(colors.map((x) => x.hex).join('\n'), 'Colors copied') } }),
          el('button', { class: 'ghost small', text: 'Copy AE color arrays', on: { click: () => copyText(ae.join('\n'), 'AE colors copied') } }),
          el('button', { class: 'ghost small', text: 'Copy CSS variables', on: { click: () => copyText(colors.map((x, i) => `--color-${i + 1}: ${x.hex};`).join('\n'), 'CSS copied') } }),
          el('button', { class: 'primary small', text: 'Create swatch solids in AE', on: { click: () => runCode(AEData.scriptSwatches(colors.map((x) => ({ hex: x.hex, rgb: x.rgb.map((v) => Number(v.toFixed(4))) }))), 'Palette swatches') } })));
    }
  }

  // ---------- Projects ----------
  function projectsTab(pane) {
    const search = el('input', { type: 'search', placeholder: 'Filter projects…' });
    const box = el('div');
    let projects = [];
    const scan = async () => {
      box.replaceChildren(el('p', { class: 'hint', text: 'Scanning for .aep files…' }));
      const home = await window.hub.fs.home();
      const sep = home.includes('\\') ? '\\' : '/';
      const dirs = H.settings().aeProjectDirs?.length ? H.settings().aeProjectDirs : ['Documents', 'Desktop', IS_MAC ? 'Movies' : 'Videos'].map((d) => `${home}${sep}${d}`);
      projects = await window.hub.ae.projects(dirs);
      render();
    };
    const render = () => {
      const qv = search.value.toLowerCase();
      DataTable(box.replaceChildren() || box, {
        columns: [
          { key: 'name', label: 'Project' },
          { key: 'mtime', label: 'Modified', render: (r) => timeAgo(r.mtime) },
          { key: 'size', label: 'Size', num: true, render: (r) => fmtBytes(r.size) },
          { key: 'path', label: '', render: (r) => el('span', { class: 'row' },
            el('button', { class: 'ghost small', text: 'Open in AE', on: { click: (e) => { e.stopPropagation(); store.set('review.lastProject', r.path); window.hub.fs.open(r.path); } } }),
            el('button', { class: 'ghost small', text: 'Render…', on: { click: (e) => { e.stopPropagation(); store.set('review.lastProject', r.path); tabs.show('render'); setTimeout(() => api.prefillRender?.(r.path), 50); } } }),
            el('button', { class: 'ghost small', text: 'Folder', on: { click: (e) => { e.stopPropagation(); window.hub.fs.reveal(r.path); } } })) },
        ],
        rows: projects.filter((p) => !qv || p.path.toLowerCase().includes(qv)),
        empty: 'No .aep files found. Add folders in Settings → Folders.',
      });
    };
    search.addEventListener('input', render);
    pane.append(el('div', { class: 'three-toolbar' }, search, el('button', { class: 'ghost small', text: 'Rescan', on: { click: scan } }),
      el('span', { class: 'hint', text: `Searches Documents, Desktop and ${IS_MAC ? 'Movies' : 'Videos'} (change in Settings → Folders).` })), box);
    api.projects = () => projects;
    scan();
  }

  // ---------- Shortcuts ----------
  function shortcutsTab(pane) {
    const search = el('input', { type: 'search', placeholder: 'Search shortcuts (e.g. keyframe, precompose, F9)…' });
    const box = el('div');
    const render = () => {
      const qv = search.value.toLowerCase();
      DataTable(box.replaceChildren() || box, {
        columns: [{ key: 0, label: 'Area', width: '110px' }, { key: 1, label: 'Keys', render: (r) => el('kbd', { text: macKeys(r[1]) }), width: '220px' }, { key: 2, label: 'Action' }],
        rows: AEData.SHORTCUTS.filter((r) => !qv || `${r.join(' ')} ${macKeys(r[1])}`.toLowerCase().includes(qv)),
      });
    };
    search.addEventListener('input', render);
    pane.append(el('div', { class: 'three-toolbar' }, search, el('span', { class: 'hint', text: IS_MAC ? 'After Effects defaults, Mac keys (⌘ Cmd, ⌥ Option, ⇧ Shift).' : 'Windows defaults for After Effects.' })), box);
    render();
  }

  // The tool opens on Video Review. The hands-on AE tools live in a Toolkit drawer that slides over the
  // right side of the review (the "Toolkit" segment, /toolkit or Ctrl+K) and stays closed until asked for.
  let reviewRoot = null;
  let kitRoot = null;
  let kitBody = null;
  function openKit(open = true, tab) {
    if (!kitRoot) return false;
    kitRoot.hidden = !open;
    reviewRoot.querySelectorAll('.vr-seg button').forEach((b, i) => { if (i !== 1) b.classList.toggle('on', i === (open ? 2 : 0)); });
    if (open && !tabs) {
      tabs = Tabs(kitBody, [
        { id: 'expressions', label: 'Expressions', render: expressionsTab },
        { id: 'scripts', label: 'Scripts', render: scriptsTab },
        { id: 'render', label: 'Render queue', render: renderTab },
        { id: 'calc', label: 'Calculators', render: calcTab },
        { id: 'presets', label: 'Comp presets', render: presetsTab },
        { id: 'palette', label: 'Palette', render: paletteTab },
        { id: 'projects', label: 'Projects', render: projectsTab },
        { id: 'shortcuts', label: 'Shortcuts', render: shortcutsTab },
        { id: 'color', label: 'Color', render: (p) => Kit.colorTool(p) },
        { id: 'easing', label: 'Easing', render: (p) => Kit.easingTool(p) },
      ], { storeKey: 'ae.tab' });
    }
    if (open && tab) tabs.show(tab);
    return open;
  }
  const KIT_TABS = ['expressions', 'scripts', 'render', 'calc', 'presets', 'palette', 'projects', 'shortcuts', 'color', 'easing'];
  const kitCommand = (tab) => () => { activate('tool:ae'); setTimeout(() => openKit(true, tab), 30); };

  Tools.define({
    id: 'ae', name: 'Video Review', icon: '▶', color: '#bd8bff',
    description: 'Watch what After Effects renders and steer it',
    mount(body) {
      reviewRoot = el('div', { class: 'review-root' });
      kitBody = el('div', { class: 'vr-kit-body' });
      kitRoot = el('div', { class: 'toolkit-root vr-kit', hidden: true },
        el('div', { class: 'vr-kit-head' }, el('b', { text: 'After Effects toolkit' }), el('span', { class: 'spacer' }),
          el('button', { class: 'vr-ico', text: '✕', title: 'Close the toolkit (Esc)', on: { click: () => openKit(false) } })), kitBody);
      kitRoot.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.target.closest('textarea, .code-editor')) { e.stopPropagation(); openKit(false); } });
      body.classList.add('ae-body');
      body.append(reviewRoot, kitRoot);
      Review.mount(reviewRoot);
    },
    commands: [
      { label: 'Review renders', run: () => openKit(false) },
      { label: 'AE expression library', run: kitCommand('expressions') },
      { label: 'Run an AE script', run: kitCommand('scripts') },
      { label: 'Render with aerender', run: kitCommand('render') },
      { label: 'Timecode calculator', run: kitCommand('calc') },
      { label: 'Create a comp from a preset', run: kitCommand('presets') },
      { label: 'Extract a color palette', run: kitCommand('palette') },
      { label: 'Find AE projects', run: kitCommand('projects') },
      { label: 'AE keyboard shortcuts', run: kitCommand('shortcuts') },
    ],
  });

  return { runCode, framesToTc, tcToFrames, FPS, openKit, KIT_TABS, status: async () => { aeStatus = null; return status(); }, projects: () => api.projects?.() || [], newScript: (code) => { openKit(true, 'scripts'); setTimeout(() => api.newScript?.(code), 50); } };
})();
