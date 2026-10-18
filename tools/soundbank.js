// (round 63, soundbank63) Sound bank: one searchable picker of every Serum 2 / Vital preset the owner has — the Sound
// desk's bank, what the ✦ Preset window saved, and (opt-in, read-only) the plugins' own user preset folders.
// Opened from the desk's "Keep a patch › Sound bank…", /sounds, or Ctrl/⌘+K. One floating panel (it sits beside the
// desk, so a preset can be dragged onto the desk or its Park jam fold):
//   hover a row = its 3-second preview (rendered once, offline, only after "Make previews": soundbankmain.js queue),
//   click = load it live in the open instrument (WorkbenchVST.api.loadPreset, vstlive61), drag = into the desk / a park
//   jam (marks "used in" that park sketch), ★ = favorite, ≈ = similar sounds (parameter-vector distance, local),
//   search words and tags ("dark bass", "pad fav", "#pluck"). Tags are made locally from the controls
//   (tools/soundbank-core.js); "Tag with AI" (⋯ menu) is opt-in, one small prompt per 20 presets.
// Zero idle cost: no timers or listeners until the panel opens (a 700 ms queue poll only while previews render).
const SoundBank = (() => {
  const C = SoundBankCore, A = () => WorkbenchVST.api;
  let win = null, list = null, statusEl = null, input = null, chips = null, entries = [], settings = {}, folders = [], queue = {}, similarOf = null, similarRows = null;
  let poll = null, audio = null, hoverTimer = null, playingId = null, dropOff = null, lastAI = null, aiListening = false;
  const aiRuns = new Map();
  const urls = new Map(), pending = new Map(), loadedBy = new Map(); // preview blob URLs (≤ 24) · features captured at save · instrument → preset id
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const SB = () => { if (typeof hub === 'undefined' || !hub.soundbank) throw Error('The sound bank is not available here.'); return hub.soundbank; };
  const byId = id => entries.find(x => x.id === id);
  const label = x => x.source === 'hover' ? '✦ Preset window' : x.source === 'plugin' ? `${x.instrument} folder${x.folder ? ' · ' + x.folder : ''}` : 'bank';
  const el2 = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  // ---------- data ----------
  async function bankList() { // the Sound desk's bank (12 presets, in the workbench project), with features captured at save
    if (typeof WorkbenchUI === 'undefined') return [];
    await WorkbenchUI.ready(); const v = WorkbenchUI.snapshot().vst || {};
    return (v.presets || []).map(p => ({ label: p.label, name: p.name, path: p.path, state: p.state, from: p.from, features: pending.get(`${p.name}\n${p.label}`) }));
  }
  async function refresh({ scan = false } = {}) {
    const r = await SB().list({ bank: await bankList(), scan }); if (!r?.ok) throw Error(r?.error || 'The sound bank could not be read.');
    entries = r.entries; settings = r.settings; folders = r.folders || []; queue = r.queue || {}; return r;
  }
  function visible() { return similarOf ? similarRows || [] : C.search(entries, input?.value || ''); }

  // ---------- the panel ----------
  function open(query) {
    if (!win?.isConnected) build();
    if (query !== undefined && input) { input.value = query; similarOf = null; }
    win.hidden = false; place(); input?.focus({ preventScroll: true });
    listenDrops(true);
    return refresh().then(() => { paint(); if (queue.running) watch(); return win; });
  }
  function place() { // beside the ✦ Preset window, never on it (both float at the desk's right)
    const ph = document.querySelector('.ph-win'); win.style.top = ''; if (!ph?.checkVisibility?.()) return;
    const a = ph.getBoundingClientRect(), b = win.getBoundingClientRect();
    if (a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom) return;
    win.style.top = `${Math.round(Math.min(a.bottom + 8, innerHeight - 220))}px`;
  }
  function close() { if (!win) return; stopHover(); listenDrops(false); clearInterval(poll); poll = null; win.remove(); win = null; list = null; for (const u of urls.values()) URL.revokeObjectURL(u); urls.clear(); }
  function build() {
    win = el2('section', 'sb-win'); win.setAttribute('role', 'dialog'); win.setAttribute('aria-label', 'Sound bank');
    const head = el2('div', 'sb-head'), title = el2('strong', 'sb-title', 'Sound bank'), count = el2('span', 'sb-count'), more = el2('button', 'sb-btn', '⋯'), x = el2('button', 'sb-btn', '✕');
    more.type = x.type = 'button'; more.title = 'Previews, AI tags, plugin folders'; x.title = 'Close (Esc)'; more.setAttribute('aria-label', 'Sound bank menu'); x.setAttribute('aria-label', 'Close the sound bank');
    more.onclick = () => { const r = more.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, menuItems()); };
    x.onclick = close; head.append(title, count, more, x);
    input = el2('input', 'sb-search'); input.type = 'search'; input.placeholder = 'Search: dark bass, pad, fav…'; input.setAttribute('aria-label', 'Search presets');
    input.oninput = () => { similarOf = null; paintList(); };
    chips = el2('div', 'sb-chips'); statusEl = el2('div', 'sb-status'); list = el2('div', 'sb-list'); list.setAttribute('role', 'listbox');
    win.append(head, input, chips, statusEl, list);
    win.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });
    list.addEventListener('mouseleave', stopHover);
    document.body.append(win);
  }
  function paint() { if (!win) return; const c = win.querySelector('.sb-count'), t = `${entries.length}`; if (c.textContent !== t) c.textContent = t; paintChips(); paintStatus(); paintList(); }
  function paintChips() {
    const counts = new Map(); for (const x of entries) for (const t of [...(x.tags || []), ...(x.aiTags || [])]) counts.set(t, (counts.get(t) || 0) + 1);
    const top = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 9).map(([t]) => t), q = C.tokens(input.value);
    chips.replaceChildren(...['fav', ...top].map(t => { const b = el2('button', 'sb-chip' + (q.includes(t) ? ' on' : ''), t === 'fav' ? '★' : t); b.type = 'button'; b.title = t === 'fav' ? 'Favorites' : `Tag: ${t}`; b.onclick = () => { const w = C.tokens(input.value); input.value = (w.includes(t) ? w.filter(x => x !== t) : [...w, t]).join(' '); similarOf = null; paintChips(); paintList(); }; return b; }));
  }
  function paintStatus() {
    if (!statusEl) return; const missing = entries.filter(x => !x.preview?.file && !x.preview?.error).length; statusEl.replaceChildren();
    if (similarOf) { const b = el2('button', 'sb-link', '‹ all'); b.type = 'button'; b.onclick = () => { similarOf = null; paintStatus(); paintList(); }; statusEl.append(b, el2('span', null, ` Similar to “${byId(similarOf)?.name || '…'}”`)); return; }
    if (queue.running) { const b = el2('button', 'sb-link', 'Stop'); b.type = 'button'; b.onclick = () => cancelPreviews().catch(err => toast(err.message, { type: 'error' })); statusEl.append(el2('span', null, `Previews ${queue.done}/${queue.total}${queue.errors ? ` · ${queue.errors} failed` : ''} · `), b); return; }
    if (!entries.length) { statusEl.append(el2('span', null, settings.pluginFolders ? 'No presets yet: save one in the Sound desk.' : 'No presets yet. Save one in the Sound desk, or include the plugins’ own folders (⋯).')); return; }
    if (missing) { const b = el2('button', 'sb-link', `Make previews (${missing})`); b.type = 'button'; b.onclick = () => makePreviews().catch(err => toast(err.message, { type: 'error' })); statusEl.append(b, el2('span', null, ' · hover to listen, click to play live')); }
    else statusEl.append(el2('span', null, 'Hover to listen · click to play live · drag onto the desk'));
    if (queue.errors && queue.lastError) statusEl.title = `Last preview problem: ${queue.lastError}`;
  }
  function paintList() {
    if (!list) return; const rows = visible().slice(0, 200), cur = A()?.current?.();
    list.replaceChildren(...rows.map(x => row(x, cur)));
    if (!rows.length && entries.length) list.append(el2('p', 'sb-empty', 'Nothing matches. Try a tag: bass, lead, pad, pluck, keys, fx, dark, bright, mono, wide.'));
  }
  function row(x, cur) {
    const r = el2('div', 'sb-row'); r.dataset.id = x.id; r.setAttribute('role', 'option'); r.draggable = true; r.tabIndex = 0;
    if (cur && loadedBy.get(cur.name) === x.id) r.classList.add('on');
    const star = el2('button', 'sb-star' + (x.favorite ? ' on' : ''), x.favorite ? '★' : '☆'); star.type = 'button'; star.title = x.favorite ? 'Unfavorite' : 'Favorite'; star.setAttribute('aria-label', star.title);
    star.onclick = ev => { ev.stopPropagation(); favorite(x.id, !x.favorite).catch(err => toast(err.message, { type: 'error' })); };
    const main = el2('div', 'sb-main'), name = el2('div', 'sb-name', x.name), meta = el2('div', 'sb-meta');
    const tags = [...new Set([...(x.tags || []), ...(x.aiTags || [])])];
    meta.textContent = [x.instrument, label(x), tags.slice(0, 4).join(' '), x.distance !== undefined ? `≈ ${x.distance}` : ''].filter(Boolean).join(' · ');
    if (x.usedIn?.length) { const u = el2('span', 'sb-used', ` · used in ${x.usedIn.length}`); u.title = x.usedIn.map(v => `${v.kind === 'take' ? 'Take' : 'Park sketch'}: ${v.title || v.sketch}`).join('\n'); meta.append(u); }
    main.append(name, meta);
    const pv = el2('span', 'sb-pv', x.preview?.file ? '▶' : x.preview?.error ? '!' : ''); pv.title = x.preview?.file ? 'Preview ready: hover to listen' : x.preview?.error ? `No preview: ${x.preview.error}` : 'No preview yet';
    const sim = el2('button', 'sb-btn sb-sim', '≈'); sim.type = 'button'; sim.title = 'Similar to this'; sim.setAttribute('aria-label', `Presets similar to ${x.name}`);
    sim.onclick = ev => { ev.stopPropagation(); showSimilar(x.id).catch(err => toast(err.message, { type: 'error' })); };
    r.append(star, main, pv, sim);
    r.onmouseenter = () => hover(x.id); r.onmouseleave = stopHover;
    r.onclick = () => loadLive(x.id).then(t => toast(t)).catch(err => toast(err.message, { type: 'error' }));
    r.onkeydown = ev => { if (ev.key === 'Enter') r.click(); };
    r.oncontextmenu = ev => { ev.preventDefault(); showMenu(ev.clientX, ev.clientY, rowItems(x)); };
    r.ondragstart = ev => { stopHover(); ev.dataTransfer.setData('application/x-hearth-sound', x.id); ev.dataTransfer.setData('text/plain', x.name); ev.dataTransfer.effectAllowed = 'copy'; };
    return r;
  }
  function rowItems(x) {
    return [{ label: 'Play live', action: () => loadLive(x.id).then(t => toast(t)).catch(err => toast(err.message, { type: 'error' })) },
      { label: 'Similar to this', action: () => showSimilar(x.id) },
      { label: x.favorite ? 'Unfavorite' : 'Favorite', action: () => favorite(x.id, !x.favorite) },
      x.preview?.file ? null : { label: 'Make its preview', action: () => makePreviews([x.id]) },
      x.usedIn?.length ? { label: 'Used in', items: x.usedIn.map(v => ({ label: `${v.kind === 'take' ? 'Take' : 'Park sketch'} · ${v.title || v.sketch}`, action: () => {} })) } : null,
      x.file ? { label: 'Show the file', more: true, action: () => hub.fs?.reveal?.(x.file) } : null].filter(Boolean);
  }
  function menuItems() {
    const missing = entries.filter(x => !x.preview?.file && !x.preview?.error).length;
    return [queue.running ? { label: 'Stop making previews', action: () => cancelPreviews() } : { label: `Make previews${missing ? ` (${missing})` : ''}`, disabled: !missing, action: () => makePreviews() },
      { label: 'Tag with AI…', items: [{ label: 'Claude', action: () => tagWithAI('claude').then(t => toast(t)).catch(err => toast(err.message, { type: 'error' })) }, { label: 'Astra', action: () => tagWithAI('codex').then(t => toast(t)).catch(err => toast(err.message, { type: 'error' })) }] },
      '-',
      { label: `${settings.pluginFolders ? '✓ ' : ''}Include Serum 2 / Vital folders (read-only)`, action: () => pluginFolders(!settings.pluginFolders).then(t => toast(t)) },
      { label: 'Add a preset folder…', action: () => addFolder().then(t => t && toast(t)).catch(err => toast(err.message, { type: 'error' })) },
      settings.pluginFolders ? { label: 'Folders read', more: true, items: folders.map(f => ({ label: `${f.exists ? '' : '(not found) '}${f.path}`, action: () => f.exists && hub.fs?.reveal?.(f.path) })) } : null].filter(Boolean);
  }

  // ---------- hover = preview ----------
  async function previewUrl(id) {
    if (urls.has(id)) { const u = urls.get(id); urls.delete(id); urls.set(id, u); return u; }
    const bytes = await SB().preview(id); if (!bytes) return null;
    const u = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' })); urls.set(id, u);
    while (urls.size > 24) { const [k, v] = urls.entries().next().value; URL.revokeObjectURL(v); urls.delete(k); }
    return u;
  }
  function hover(id) {
    clearTimeout(hoverTimer); const x = byId(id) || similarRows?.find(r => r.id === id); if (!x?.preview?.file) return;
    hoverTimer = setTimeout(() => play(id).catch(() => {}), 140); // a short dwell: sweeping the list doesn't spray sounds
  }
  async function play(id) {
    const u = await previewUrl(id); if (!u) return false;
    audio ||= new Audio(); audio.volume = .45; if (audio.src !== u) audio.src = u; audio.currentTime = 0; playingId = id;
    await audio.play().catch(() => {}); return true;
  }
  function stopHover() { clearTimeout(hoverTimer); hoverTimer = null; if (audio && !audio.paused) audio.pause(); playingId = null; }

  // ---------- click = load live ----------
  async function desk() {
    const here = () => document.querySelector('.wb-sound-desk')?.checkVisibility?.({ visibilityProperty: true });
    if (!here() || !A().instruments().length) { activate('tool:creative'); CreativePlayground.openFeature('vst'); }
    for (let i = 0; i < 300 && !(here() && A().instruments().length); i++) await wait(50);
    if (!A().instruments().length) throw Error('Set up live audio and add Serum 2 or Vital in the Sound desk first (Creative Playground → Serum 2 / Vital).');
  }
  async function loadLive(id, { used } = {}) {
    const x = byId(id); if (!x) throw Error('No such preset.');
    stopHover();
    const st = await SB().state(id); if (!st?.ok) throw Error(st?.error || 'Could not read this preset.');
    if (A().current()?.name !== x.instrument || !A().current()?.ready) {
      if (A().current()?.name !== x.instrument) { await desk(); if (!A().instruments().includes(x.instrument)) throw Error(`${x.instrument} isn't installed in the Sound desk.`); await A().open(x.instrument, { live: true }); }
      for (let i = 0; i < 600 && !(A().current()?.name === x.instrument && A().current()?.ready); i++) await wait(50);
    }
    if (A().current()?.name !== x.instrument) throw Error(`${x.instrument} didn't open.`);
    await A().loadPreset({ state: st.state, label: x.name });
    loadedBy.set(x.instrument, x.id); SB().update(x.id, { lastLoaded: true, ...(used ? { used } : {}) }).catch(() => {});
    if (!A().current()?.live) A().start().catch(() => {});
    if (used) await refresh().catch(() => {});
    paintList();
    return `🎛 ${x.name} is live in ${x.instrument}.`;
  }
  // drag a row onto the desk (load live) or its Park jam fold (load live + "used in" the park sketch)
  function listenDrops(on) {
    dropOff?.(); dropOff = null; if (!on) return;
    const over = ev => { if (ev.dataTransfer?.types?.includes('application/x-hearth-sound') && ev.target.closest?.('.wb-sound-desk')) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; } };
    const drop = ev => {
      const id = ev.dataTransfer?.getData('application/x-hearth-sound'); if (!id || !ev.target.closest?.('.wb-sound-desk')) return; ev.preventDefault();
      const park = ev.target.closest('.wb-park'), sketch = (() => { try { return WorkbenchUI.snapshot().title; } catch { return 'Park sketch'; } })();
      if (park) park.open = true;
      loadLive(id, park ? { used: { kind: 'sketch', sketch, title: sketch } } : {}).then(t => toast(park ? `${t} Used in “${sketch}”.` : t)).catch(err => toast(err.message, { type: 'error' }));
    };
    document.addEventListener('dragover', over); document.addEventListener('drop', drop);
    dropOff = () => { document.removeEventListener('dragover', over); document.removeEventListener('drop', drop); };
  }

  // ---------- previews, favorites, similar, folders ----------
  async function makePreviews(ids = []) {
    const roots = (() => { try { return WorkbenchUI.snapshot().vst.roots || []; } catch { return []; } })();
    const r = await SB().previews({ ids, roots, bank: await bankList() }); if (!r?.ok) throw Error(r?.error || 'Previews could not start.');
    queue = r; paintStatus(); watch();
    return r.total ? `Making ${r.total - r.done} preview${r.total - r.done === 1 ? '' : 's'} in the background (one at a time; live audio keeps priority).` : 'Every preset already has its preview.';
  }
  function watch() { // only while previews render
    if (poll) return;
    poll = setInterval(async () => {
      try {
        const q = await SB().queue(); const advanced = q.done !== queue.done || q.running !== queue.running; queue = q;
        if (advanced) { await refresh(); paint(); } else paintStatus();
        if (!q.running) { clearInterval(poll); poll = null; }
      } catch { clearInterval(poll); poll = null; }
    }, 700);
  }
  async function cancelPreviews() { queue = await SB().cancel(); await refresh(); paint(); return 'Previews stopped.'; }
  async function favorite(id, on) { const r = await SB().update(id, { favorite: !!on }); if (!r?.ok) throw Error(r?.error); const x = byId(id); if (x) x.favorite = !!on; paintList(); return on ? `★ ${x?.name}` : `☆ ${x?.name}`; }
  async function showSimilar(id) { const r = await SB().similar(id, 12); if (!r?.ok) throw Error(r?.error); similarOf = id; similarRows = r.similar; paintStatus(); paintList(); return r.similar; }
  async function pluginFolders(on) { await SB().settings({ pluginFolders: !!on }); await refresh({ scan: true }); paint(); return on ? `Reading Serum 2 / Vital user folders (read-only): ${entries.filter(x => x.source === 'plugin').length} presets.` : 'Plugin folders left out of the sound bank.'; }
  async function addFolder(p) {
    const dir = p || await hub.pickFolder('', 'A folder of Serum 2 (.SerumPreset) or Vital (.vital) presets — read only'); if (!dir) return null;
    await SB().settings({ addFolder: dir }); await refresh({ scan: true }); paint(); return `Added ${dir} (read-only).`;
  }

  // ---------- "tag with AI": opt-in, one small prompt per batch ----------
  function helper(engineId, text) {
    const agent = H.agents().find(a => a.mode === 'native' && a.engine === engineId && !a.dock); if (!agent) throw Error(`Add ${engineId === 'codex' ? 'Astra' : 'Claude'} to Hearth first.`);
    const id = `soundbank-${Date.now().toString(36)}`;
    if (!aiListening) { hub.onEngineEvent(ev => aiRuns.get(ev.chatId)?.(ev)); aiListening = true; } // one listener for the session (preload has no off)
    return new Promise((resolve, reject) => {
      let out = '', done = false; const finish = (err, v) => { if (done) return; done = true; aiRuns.delete(id); clearTimeout(timer); err ? reject(err) : resolve(v); };
      const timer = setTimeout(() => { hub.stop(id).catch(() => {}); finish(Error('The AI took too long.')); }, 120000);
      aiRuns.set(id, ev => {
        if (ev.type === 'delta') out += ev.text || '';
        else if (ev.type === 'done') { if (ev.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: agent.id, usage: ev.usage, source: 'soundbank' } })); finish(null, { text: ev.text || out, usage: ev.usage }); }
        else if (ev.type === 'error' || ev.type === 'stopped') finish(Error(ev.message || 'Stopped.'));
      });
      // the quest-review / preset-hover toolless run: no tools, files, memory or web; one fixed persona line
      hub.send({ agentId: agent.id, chatId: id, session: {}, text, options: { questReview: true, lean: true, helper: true, persona: C.AI_PERSONA, webSearch: 'disabled' } }).catch(finish);
    });
  }
  async function tagWithAI(engine = 'claude') {
    if (!entries.length) await refresh();
    const batch = entries.filter(x => !x.aiTags?.length).slice(0, 20); if (!batch.length) return 'Every preset already has AI tags.';
    const r = await helper(engine, C.aiPrompt(batch)), tags = C.aiParse(r.text, batch);
    for (const [id, t] of Object.entries(tags)) await SB().update(id, { aiTags: t });
    await refresh(); paint(); lastAI = { tagged: Object.keys(tags).length, asked: batch.length, usage: r.usage || null };
    const tok = r.usage ? ` · ${(r.usage.input_tokens || r.usage.inputTokens || 0) + (r.usage.output_tokens || r.usage.outputTokens || 0)} tokens` : '';
    return `AI tagged ${lastAI.tagged} of ${batch.length} presets${tok}.`;
  }

  // ---------- "used in": a park take recorded while a bank preset is loaded ----------
  function track() {
    try {
      A().on('preset', ev => {
        const cur = A().current(); if (!cur) return;
        if (ev.action === 'save' && cur.ready) { // features of the sound just kept (from the desk's control cache: no plugin call)
          try { const all = []; for (let o = 0; o < 4000; o += 200) { const page = A().parameters({ offset: o, limit: 200 }); all.push(...page.parameters); if (all.length >= page.count) break; } pending.set(`${cur.name}\n${ev.label}`, C.features(all)); } catch { /* still reading: tags come from the name or the preview */ }
          if (win) refresh().then(paint).catch(() => {});
        } else if (ev.action === 'load' && ev.label) { const x = entries.find(e => e.instrument === cur.name && e.name === ev.label); if (x) loadedBy.set(cur.name, x.id); }
      });
    } catch { /* WorkbenchVST without the api: nothing to track */ }
    document.addEventListener('hearth:quest-week', ev => {
      const d = ev.detail; if (d?.kind !== 'park-jam') return;
      const cur = A()?.current?.(), id = cur && loadedBy.get(cur.name); if (!id) return;
      SB().update(id, { used: { kind: 'take', sketch: d.sketch, title: d.title } }).catch(() => {});
    });
  }
  track();

  // ---------- chat ----------
  async function find(words) { await refresh(); const hit = C.search(entries, words)[0]; if (!hit) throw Error(`No preset matches “${words}”. /sounds to browse.`); return hit; }
  async function command(args = '') {
    const a = String(args || '').trim(), [w, ...rest] = a.split(/\s+/), more = rest.join(' '), sub = (w || '').toLowerCase();
    if (!a || sub === 'open' || sub === 'show') { await open(); return `🎛 Sound bank: ${entries.length} presets.`; }
    if (sub === 'close' || sub === 'hide') { close(); return null; }
    if (sub === 'previews' || sub === 'preview') { if (!win) await open(); return makePreviews(); }
    if (sub === 'stop' || sub === 'cancel') return cancelPreviews();
    if (sub === 'load' || sub === 'play') { const x = await find(more); return loadLive(x.id); }
    if (sub === 'similar' || sub === 'like') { const x = more ? await find(more) : entries.find(e => e.id === loadedBy.get(A()?.current?.()?.name)); if (!x) throw Error('Name a preset: /sounds similar <name>'); await open(); const s = await showSimilar(x.id); return `Similar to ${x.name}: ${s.slice(0, 5).map(y => y.name).join(', ') || 'nothing yet'}.`; }
    if (sub === 'fav' && more) { const x = await find(more); return favorite(x.id, !x.favorite); }
    if (sub === 'folders') return pluginFolders(!/^(off|no|hide)$/i.test(more));
    if (sub === 'ai') return tagWithAI(/astra|codex/i.test(more) ? 'codex' : 'claude');
    if (sub === 'status') { await refresh(); const q = queue.running ? `previews ${queue.done}/${queue.total}` : 'no previews rendering'; return `${entries.length} presets (${entries.filter(x => x.preview?.file).length} with previews, ${entries.filter(x => x.favorite).length} ★) · ${q} · plugin folders ${settings.pluginFolders ? 'on (read-only)' : 'off'}.`; }
    await open(a); return `🎛 ${visible().length} match “${a}”.`;
  }
  const SUBS = [['', 'open the picker'], ['dark bass', 'search words and tags'], ['fav', 'favorites'], ['previews', 'make the missing 3-s previews'], ['stop', 'stop making previews'], ['load ', 'play a preset live'], ['similar ', 'presets like this one'], ['folders on', 'include Serum 2 / Vital user folders (read-only)'], ['ai', 'tag with AI (one small prompt)'], ['status', 'counts and queue']];
  const complete = a => SUBS.filter(([v]) => v.startsWith(String(a || '').trim().toLowerCase())).map(([value, desc]) => ({ value, desc }));
  if (typeof Commands !== 'undefined' && !Commands.get('sounds')) Commands.register({ name: 'sounds', aliases: ['sound-bank'], args: '[words | fav | previews | stop | load <name> | similar <name> | folders on|off | ai | status]', desc: 'Sound bank: find, preview and load Serum 2 / Vital presets', area: 'Create', run: command, complete, examples: ['/sounds dark bass', '/sounds previews', '/sounds similar warm pad'] });
  if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Sound desk: sound bank (find a preset)', () => command(''));
  return { open, close, command, loadLive, makePreviews, cancelPreviews, favorite, showSimilar, pluginFolders, addFolder, tagWithAI, refresh, complete,
    get open_() { return !!win?.isConnected; }, _test: { entries: () => entries, queue: () => queue, playing: () => playingId, audio: () => audio, hover, play, loadedBy: () => loadedBy, pending: () => pending } };
})();
