// Live Forgeheart debug game: a persistent game view shown beside the Forge Debug agent's chat.
// Claude drives it through the forge_* tools (mcp/forge-game-mcp.js → gamebridge.js → here). You drive it with the
// toolbar, its ⋯ menu (quick actions, stat watch, snapshots, patch sets) and the /forge-* chat commands.
const ForgeGame = (() => {
  const DEFAULT_BUILD = 'C:\\Users\\quent\\Desktop\\forgeheart_music_test5.html';
  const PARTITION = 'persist:forgeheart-debug';
  let view = null;
  let ready = false;
  let logBox = null;
  let buildSel = null;
  let patches = [];
  let actor = 'Claude'; // who the log says did it (you, from the ⋯ menu and /forge-* commands)

  const buildPath = () => H.settings().forgeDebugBuild || DEFAULT_BUILD;
  const fileUrl = (p) => `file:///${p.replace(/\\/g, '/')}`;

  function log(text, kind = '') {
    if (!logBox) return;
    logBox.prepend(el('div', { class: `game-log-row ${kind}` }, el('span', { class: 'hint', text: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }), el('span', { text })));
    while (logBox.children.length > 60) logBox.lastChild.remove();
  }

  // Runs code in the game page like the DevTools console: last expression's value, Promises awaited,
  // result made JSON-safe (cycles, DOM nodes, huge arrays trimmed).
  async function exec(code) {
    if (!view || !ready) return { ok: false, error: 'The game is still loading.' };
    const wrapped = `(async () => {
      const __safe = (v) => { const seen = new WeakSet(); let n = 0;
        const s = JSON.stringify(v, (k, x) => {
          if (++n > 20000) return undefined;
          if (typeof x === 'function') return '[function ' + (x.name || 'anonymous') + ']';
          if (x && typeof x === 'object') { if (x.nodeType) return '[' + x.nodeName + ']'; if (seen.has(x)) return '[circular]'; seen.add(x);
            if (Array.isArray(x) && x.length > 200) return x.slice(0, 200).concat(['… ' + (x.length - 200) + ' more']); }
          if (typeof x === 'number' && !isFinite(x)) return String(x);
          return x; });
        return s === undefined ? 'undefined' : s.length > 30000 ? s.slice(0, 30000) + '… (truncated)' : s; };
      try { let r = (0, eval)(${JSON.stringify(code)}); if (r && typeof r.then === 'function') r = await r; return { ok: true, json: __safe(r) }; }
      catch (e) { return { ok: false, error: String(e && e.stack || e).slice(0, 2000) }; }
    })()`;
    try {
      const r = await view.executeJavaScript(wrapped);
      if (!r.ok) return r;
      let value;
      try { value = JSON.parse(r.json); } catch { value = r.json; }
      return { ok: true, value };
    } catch (err) { return { ok: false, error: err.message }; }
  }

  const SNIPPETS = {
    status: `(() => { const st = (() => { try { return stats(); } catch { return {}; } })();
      const by = {}; for (const e of C.en) by[e.type] = (by[e.type] || 0) + 1;
      const gear = {}; for (const k in S.eq) if (S.eq[k]) gear[k] = (S.eq[k].uq ? '★ ' : '') + (S.eq[k].rname || S.eq[k].base || S.eq[k].slot) + ' (ilvl ' + S.eq[k].ilvl + ')';
      const title = document.getElementById('mm-start');
      return { onTitleScreen: !!(title && (title.offsetWidth || title.offsetHeight)), stage: S.stage, maxStage: S.maxStage, gold: S.gold, hp: Math.round(C.hp), hpMax: Math.round(st.hp || 0), dps: Math.round(st.dps || 0),
        enemies: C.en.length, enemyCap: combatEnemyCap(), byType: by, boss: C.boss ? (C.boss.name || C.boss.type || true) : null,
        debug: window.__fhDbg, gear, inventory: S.inv.length, treePoints: Object.keys(S.tree || {}).length }; })()`,
  };

  // ---------- tool handlers (called by Claude through the bridge) ----------
  async function handleTool(tool, args) {
    if (tool === 'forge_status') return exec(SNIPPETS.status);
    if (tool === 'forge_spawn') {
      const type = String(args.type || 'random');
      const count = Math.max(1, Math.min(200, Number(args.count) || 10));
      const mult = Number(args.mult) || 1;
      log(`${actor}: spawn ${type === 'boss' ? 'the boss' : `${count} × ${type}`}${mult !== 1 ? ` (×${mult})` : ''}`, 'claude');
      return exec(`(() => { const want = ${JSON.stringify(type)}, made = {};
        if (want === 'boss') { spawnBoss(); return { spawned: 'boss', enemies: C.en.length }; }
        const keys = Object.keys(FOES); let n = 0;
        for (let i = 0; i < ${count}; i++) { const t = want === 'random' ? keys[Math.floor(Math.random() * keys.length)] : want;
          if (want !== 'random' && !FOES[t]) throw new Error('Unknown enemy type ' + t + '. Known: ' + keys.join(', '));
          const f = spawnFoe(t, ${mult}); if (!f) break; n++; made[f.type] = (made[f.type] || 0) + 1; }
        return { spawned: n, byType: made, enemiesNow: C.en.length, cap: combatEnemyCap(), note: n < ${count} ? 'Stopped at the enemy cap' : undefined }; })()`);
    }
    if (tool === 'forge_debug') {
      log(`${actor}: debug ${Object.entries(args).map(([k, v]) => `${k}=${v}`).join(', ')}`, 'claude');
      const r = await exec(`(async () => { const a = ${JSON.stringify(args)}, D = window.__fhDbg, done = [];
        if (a.start) {
          const b = document.getElementById('mm-start');
          if (b && (b.offsetWidth || b.offsetHeight)) {
            b.click();
            await new Promise((r) => setTimeout(r, 200));
            // A fresh save asks for a road first; the debug instance skips the tutorials.
            const road = document.querySelector('#roadselectoverlay [data-sk="mid"]');
            if (road) { road.click(); done.push('picked "I know what I\\'m doing" (no tutorials)'); }
            // Wait (up to 4 s) for the title screen to finish closing so the next status is accurate.
            for (let i = 0; i < 40 && (b.offsetWidth || b.offsetHeight); i++) await new Promise((r) => setTimeout(r, 100));
            done.push('started from the title screen');
          } else done.push('already in game');
        }
        for (const k of ['god', 'oneshot', 'paused']) if (k in a) { D[k] = !!a[k]; done.push(k + '=' + D[k]); }
        if ('timeScale' in a) { D.timeScale = Math.min(8, Math.max(0.1, +a.timeScale || 1)); done.push('timeScale=' + D.timeScale); }
        if ('gold' in a) { S.gold = typeof goldClamp === 'function' ? goldClamp(+a.gold || 0) : +a.gold; done.push('gold=' + S.gold); }
        if ('stage' in a) { const n = Math.max(1, Math.min(400, Math.round(+a.stage || 1))); S.maxStage = Math.max(S.maxStage || 1, n); ST = null; if (typeof touchGear === 'function') touchGear(); startStage(n, true); done.push('stage=' + n); }
        if (a.killAll) { let k = 0; for (const e of C.en) { e.hp = 0; k++; } done.push('killed ' + k); }
        if (a.heal) { C.hp = stats().hp; done.push('healed to ' + Math.round(C.hp)); }
        if (a.openDeck && typeof window.__fhToggleDebug === 'function') { window.__fhToggleDebug(); done.push('deck toggled'); }
        try { if (typeof renderHdr === 'function') renderHdr(); save(); } catch (e) {}
        return { changed: done, debug: D }; })()`);
      syncToolbar();
      return r;
    }
    if (tool === 'forge_eval') {
      log(`Claude ran code: ${String(args.code || '').replace(/\s+/g, ' ').slice(0, 90)}`, 'claude');
      return exec(String(args.code || ''));
    }
    if (tool === 'forge_screenshot') {
      if (!view || !ready) return { ok: false, error: 'The game is still loading.' };
      // A hidden view renders no frames, so let the game surface render (behind the current view) while capturing.
      const surface = view.closest('.surface');
      if (!surface?.classList.contains('active')) surface?.classList.add('capturing'); // (the one on screen stays put)
      let img = null;
      try {
        for (let i = 0; i < 4 && !img; i += 1) {
          await new Promise((r) => setTimeout(r, 150));
          try { img = await view.capturePage(); if (img.isEmpty()) img = null; } catch { img = null; }
        }
      } finally { surface?.classList.remove('capturing'); }
      if (!img) return { ok: false, error: 'Could not capture the game (is the hub window minimized?).' };
      const { width } = img.getSize();
      if (width > 1280) img = img.resize({ width: 1280, quality: 'good' });
      log('Claude took a screenshot', 'claude');
      // JPEG keeps the image Claude reads small (~100 KB instead of ~600 KB as PNG).
      const jpeg = await new Promise((resolve) => {
        const c = document.createElement('canvas');
        const i = new Image();
        i.onload = () => { c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); resolve(c.toDataURL('image/jpeg', 0.82).split(',')[1]); };
        i.onerror = () => resolve(null);
        i.src = img.toDataURL();
      });
      if (!jpeg) return { ok: true, value: 'Screenshot of the live game attached.', image: img.toDataURL().split(',')[1], mime: 'image/png' };
      return { ok: true, value: 'Screenshot of the live game attached.', image: jpeg, mime: 'image/jpeg', png: img.toDataURL().split(',')[1] };
    }
    if (tool === 'forge_reload') { log('Claude reloaded the game', 'claude'); await reload(); return { ok: true, value: `Reloaded. ${patches.filter((p) => p.enabled).length} patch(es) re-applied.` }; }
    if (tool === 'forge_patch_save') {
      const name = String(args.name || '').trim();
      if (!name) return { ok: false, error: 'A patch needs a name.' };
      const r = await exec(String(args.code || ''));
      if (!r.ok) return { ok: false, error: `The patch failed, so it was not saved: ${r.error}` };
      patches = patches.filter((p) => p.name !== name);
      patches.push({ name, code: String(args.code), description: args.description || '', enabled: true, at: Date.now() });
      await window.hub.kvSet('forge-patches', patches);
      log(`Claude saved patch "${name}"`, 'claude');
      renderPatchBadge();
      return { ok: true, value: { saved: name, result: r.value, note: 'Applied now and after every reload.' } };
    }
    if (tool === 'forge_patch_list') return { ok: true, value: patches.map(({ name, description, enabled, code }) => ({ name, description, enabled, code })) };
    if (tool === 'forge_patch_remove') {
      const before = patches.length;
      patches = patches.filter((p) => p.name !== args.name);
      await window.hub.kvSet('forge-patches', patches);
      renderPatchBadge();
      return before === patches.length ? { ok: false, error: `No patch named "${args.name}"` } : { ok: true, value: `Removed "${args.name}". Reload the game to fully undo it.` };
    }
    return { ok: false, error: `Unknown tool ${tool}` };
  }

  // ---------- loading & patches ----------
  async function waitForGame() {
    for (let i = 0; i < 80; i += 1) {
      try { if (await view.executeJavaScript('typeof S === "object" && typeof C === "object" && typeof spawnFoe === "function"')) return true; } catch { /* still loading */ }
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  }
  async function onLoaded() {
    ready = false;
    const ok = await waitForGame();
    ready = ok;
    if (!ok) { log('The game loaded but its debug globals were not found (is this a Forgeheart build?)', 'bad'); return; }
    const on = patches.filter((p) => p.enabled);
    for (const p of on) {
      const r = await exec(p.code);
      log(r.ok ? `Patch "${p.name}" applied` : `Patch "${p.name}" failed: ${r.error.split('\n')[0]}`, r.ok ? '' : 'bad');
    }
    log(`Game ready${on.length ? ` · ${on.length} patch(es)` : ''}`);
    syncToolbar();
  }
  function reload() {
    return new Promise((resolve) => {
      if (!view) { resolve(); return; }
      ready = false;
      const done = () => { view.removeEventListener('dom-ready', done); onLoaded().then(resolve); };
      view.addEventListener('dom-ready', done);
      view.reload();
    });
  }

  // ---------- toolbar ----------
  let toolbarRefs = {};
  async function syncToolbar() {
    if (!ready || !toolbarRefs.god) return;
    const r = await exec('window.__fhDbg');
    if (!r.ok) return;
    const d = r.value;
    toolbarRefs.god.checked = !!d.god;
    toolbarRefs.oneshot.checked = !!d.oneshot;
    toolbarRefs.pause.textContent = d.paused ? '▶ Resume' : '⏸ Pause';
    toolbarRefs.speed.value = String(d.timeScale);
  }
  function renderPatchBadge() {
    if (toolbarRefs.patches) toolbarRefs.patches.textContent = `Patches (${patches.filter((p) => p.enabled).length})`;
  }
  async function patchesDialog() {
    const dlg = el('dialog', { class: 'ui-modal gallery-dialog' });
    const list = el('div', { class: 'download-list' });
    const render = () => list.replaceChildren(...(patches.length ? patches.map((p) => el('div', { class: 'patch-row' },
      el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: p.enabled, on: { change: async (e) => { p.enabled = e.target.checked; await window.hub.kvSet('forge-patches', patches); renderPatchBadge(); } } }), el('b', { text: p.name })),
      p.description ? el('span', { class: 'hint', text: p.description }) : null,
      el('pre', { class: 'code-view', html: highlight(p.code, 'js') }),
      el('div', { class: 'row' },
        el('button', { type: 'button', class: 'ghost small', text: 'Apply now', on: { click: async () => { const r = await exec(p.code); toast(r.ok ? `Applied "${p.name}"` : r.error, { type: r.ok ? 'info' : 'error' }); } } }),
        el('button', { type: 'button', class: 'ghost small danger', text: 'Delete', on: { click: async () => { patches = patches.filter((x) => x !== p); await window.hub.kvSet('forge-patches', patches); renderPatchBadge(); render(); } } })))) : [el('p', { class: 'hint', text: 'No patches yet. Ask Forge Debug for a change and tell it to keep it ("make drones twice as fast and keep it").' })]));
    dlg.append(el('form', { method: 'dialog' }, el('h2', { text: 'Game patches' }),
      el('p', { class: 'hint', text: 'Patches run after every reload of the debug game. Turning one off takes effect on the next reload.' }), list,
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'ghost', text: 'Reload game', on: { click: () => { dlg.close(); reload(); } } }),
        el('button', { type: 'submit', text: 'Close' }))));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    render();
    dlg.showModal();
  }
  async function fillBuilds() {
    const desktop = (await window.hub.fs.home()) + '\\Desktop';
    const candidates = [];
    for (const dir of [desktop, H.settings().forgeheartFolder].filter(Boolean)) {
      try {
        const files = await window.hub.fs.list(dir, { match: '^(forgeheart.*|index)\\.html$' });
        for (const f of files) if (!/\.bak\.html$/i.test(f.name) && f.size > 5e6) candidates.push(f);
      } catch { /* folder missing */ }
    }
    const current = buildPath();
    if (!candidates.some((c) => c.path === current)) candidates.unshift({ path: current, name: current.split('\\').pop(), mtime: 0 });
    candidates.sort((a, b) => b.mtime - a.mtime);
    buildSel.replaceChildren(...candidates.map((c) => el('option', { value: c.path, text: `${c.name}${c.mtime ? ` · ${new Date(c.mtime).toLocaleDateString()}` : ''}${c.path.includes('\\Desktop\\') ? ' (Desktop)' : ''}`, selected: c.path === current, title: c.path })),
      el('option', { value: '__pick', text: 'Choose another file…' }));
  }
  async function setBuild(p) {
    H.config.settings = { ...H.config.settings, forgeDebugBuild: p };
    await saveConfig();
    ready = false;
    view.loadURL(fileUrl(p));
    log(`Switched to ${p.split('\\').pop()}`);
  }

  function mount(container) {
    if (view?.isConnected) { container.append(el('p', { class: 'hint', text: 'The debug game is already open beside another agent.' })); return; }
    ready = false;
    buildSel = el('select', { class: 'game-build', title: 'Which Forgeheart build the debug game runs' });
    buildSel.addEventListener('change', async () => {
      if (buildSel.value === '__pick') {
        const [p] = await window.hub.openDialog({ filters: [{ name: 'Forgeheart build', extensions: ['html'] }] });
        if (p) await setBuild(p);
        fillBuilds();
      } else setBuild(buildSel.value);
    });
    const btn = (text, title, fn) => el('button', { class: 'ghost small', text, title, on: { click: fn } });
    const god = el('input', { type: 'checkbox', on: { change: (e) => handleTool('forge_debug', { god: e.target.checked }) } });
    const oneshot = el('input', { type: 'checkbox', on: { change: (e) => handleTool('forge_debug', { oneshot: e.target.checked }) } });
    const pause = btn('⏸ Pause', 'Pause / resume the simulation', async () => { const r = await exec('window.__fhDbg.paused'); handleTool('forge_debug', { paused: !(r.ok && r.value) }); });
    const speed = el('select', { title: 'Simulation speed', on: { change: (e) => handleTool('forge_debug', { timeScale: Number(e.target.value) }) } },
      ['0.25', '0.5', '1', '2', '4'].map((v) => el('option', { value: v, text: `${v}×`, selected: v === '1' })));
    const patchBtn = btn('Patches (0)', 'Saved on-the-fly changes that re-apply on every reload', patchesDialog);
    toolbarRefs = { god, oneshot, pause, speed, patches: patchBtn };
    logBox = el('div', { class: 'game-log' });
    view = el('webview', { attrs: { partition: PARTITION, src: fileUrl(buildPath()) } });
    view.addEventListener('dom-ready', function first() { view.removeEventListener('dom-ready', first); onLoaded(); });
    container.append(
      el('div', { class: 'game-bar' }, buildSel,
        btn('⟳', 'Reload (patches re-apply)', () => reload()),
        btn('Deck (F1)', 'Open the in-game Debug Deck', () => handleTool('forge_debug', { openDeck: true })),
        pause, speed,
        el('label', { class: 'check small', title: 'Invulnerable' }, god, 'God'),
        el('label', { class: 'check small', title: 'Enemies die in one hit' }, oneshot, '1-shot'),
        btn('＋10 foes', 'Spawn 10 random enemies', () => handleTool('forge_spawn', { type: 'random', count: 10 })),
        patchBtn,
        btn('📷', 'Screenshot', async () => { const r = await handleTool('forge_screenshot', {}); if (r.ok) { const p = await window.hub.saveFile({ defaultPath: 'forgeheart-debug.png', filters: [{ name: 'PNG', extensions: ['png'] }], content: r.png, base64: true }); if (p) toast('Screenshot saved'); } }),
        btn('DevTools', 'Game console & profiler', () => view.openDevTools()),
        btn('⋯', 'More: heal, kill all, boss, stage, gold, stat watch, snapshots, patch sets, run code', moreMenu)),
      el('div', { class: 'game-view' }, view, watchBox = el('div', { class: 'fg-watch', hidden: true, title: 'Stat watch (⋯ → Stat watch, /forge-watch)' })),
      logBox);
    if (store.get('forge.watchOn', false)) setTimeout(() => setWatch(true), 500);
    fillBuilds();
    window.hub.kvGet('forge-patches', []).then((p) => { patches = p; renderPatchBadge(); });
  }

  // ---------- quick actions, stat watch, snapshots, patch sets (the ⋯ menu and /forge-* commands) ----------
  const needGame = () => { if (!view || !ready) throw new Error('Open Forge Debug first (the game is not loaded).'); };
  const fmtVal = (v) => (typeof v === 'number' ? (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : Math.abs(v) >= 1e4 ? `${Math.round(v / 1e3)}k` : String(Math.round(v * 100) / 100)) : typeof v === 'object' ? JSON.stringify(v).slice(0, 60) : String(v));
  // Small debug actions by name: heal, kill, boss, gold <n>, stage <n>, next, spawn <type> <n>, god, oneshot, pause, speed <x>.
  async function quick(action, arg) {
    actor = 'You';
    try { return await quickAction(action, arg); } finally { actor = 'Claude'; }
  }
  async function quickAction(action, arg) {
    needGame();
    const n = Number(arg);
    switch (action) {
      case 'heal': return handleTool('forge_debug', { heal: true });
      case 'kill': return handleTool('forge_debug', { killAll: true });
      case 'boss': return handleTool('forge_spawn', { type: 'boss' });
      case 'gold': return handleTool('forge_debug', { gold: Number.isFinite(n) ? n : 1e6 });
      case 'stage': return handleTool('forge_debug', { stage: Number.isFinite(n) ? n : 1 });
      case 'next': { const r = await exec('S.stage'); return handleTool('forge_debug', { stage: (r.ok ? r.value : 0) + 1 }); }
      case 'god': case 'oneshot': case 'paused': { const r = await exec(`window.__fhDbg.${action}`); return handleTool('forge_debug', { [action]: arg == null ? !(r.ok && r.value) : /^(on|1|true|yes)$/i.test(arg) }); }
      case 'speed': return handleTool('forge_debug', { timeScale: Number.isFinite(n) && n > 0 ? n : 1 });
      case 'spawn': { const [type = 'random', count = '10', mult = '1'] = String(arg || '').split(/\s+/); return handleTool('forge_spawn', { type, count: Number(count) || 10, mult: Number(mult) || 1 }); }
      case 'start': return handleTool('forge_debug', { start: true });
      default: throw new Error(`Unknown action ${action}`);
    }
  }
  async function enemyTypes() { const r = ready ? await exec('Object.keys(FOES)') : null; return r?.ok ? r.value : []; }

  // Watch: a small overlay on the game with expressions refreshed every second while it's visible.
  const WATCH_DEFAULT = [['Stage', 'S.stage'], ['Gold', 'S.gold'], ['HP', 'Math.round(C.hp)'], ['Enemies', 'C.en.length'], ['DPS', 'Math.round(stats().dps)']];
  const watchList = () => store.get('forge.watch', WATCH_DEFAULT);
  let watchBox = null;
  let watchTimer = null;
  async function paintWatch() {
    if (!watchBox?.isConnected || watchBox.hidden || !ready) return;
    if (!watchBox.offsetParent) return; // the game isn't on screen
    const list = watchList();
    const r = await exec(`(() => [${list.map(([, ex]) => `(() => { try { return ${ex}; } catch (e) { return '⚠ ' + e.message; } })()`).join(',')}])()`);
    if (!r.ok) return;
    watchBox.replaceChildren(...list.map(([label, ex], i) => el('div', { class: 'fg-watch-row', title: `${ex} · right-click to remove`, on: { contextmenu: (e) => { e.preventDefault(); store.set('forge.watch', watchList().filter((_, j) => j !== i)); paintWatch(); } } },
      el('span', { text: label }), el('b', { text: fmtVal(r.value[i]) }))));
  }
  function setWatch(on) {
    if (!watchBox) return false;
    watchBox.hidden = on == null ? !watchBox.hidden : !on;
    store.set('forge.watchOn', !watchBox.hidden);
    clearInterval(watchTimer);
    if (!watchBox.hidden) { paintWatch(); watchTimer = setInterval(() => { if (!watchBox?.isConnected) clearInterval(watchTimer); else paintWatch(); }, 1000); }
    return !watchBox.hidden;
  }
  function addWatch(expr, label) {
    const ex = String(expr || '').trim();
    if (!ex) return null;
    store.set('forge.watch', [...watchList().filter(([, e]) => e !== ex), [label || (ex.length <= 16 ? ex : `…${ex.slice(-15)}`), ex]].slice(-12));
    setWatch(true);
    return ex;
  }

  // Snapshots: the debug game's whole localStorage (its save), so a situation can be set up once and restored.
  // Only the debug partition is touched, never your normal game.
  const snapshots = () => window.hub.kvGet('forge-snapshots', []);
  async function snapshot(name) {
    needGame();
    const r = await exec(`(() => { try { if (typeof save === 'function') save(); } catch (e) {} const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return { data: o, stage: S.stage, gold: S.gold }; })()`);
    if (!r.ok) throw new Error(r.error);
    const all = await snapshots();
    const label = String(name || `Stage ${r.value.stage} · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`).slice(0, 60);
    const next = [{ name: label, at: Date.now(), stage: r.value.stage, gold: r.value.gold, data: r.value.data }, ...all.filter((s) => s.name !== label)].slice(0, 20);
    await window.hub.kvSet('forge-snapshots', next);
    log(`Snapshot "${label}" saved`);
    return label;
  }
  async function restore(name) {
    needGame();
    const all = await snapshots();
    const s = all.find((x) => x.name === name) || all.find((x) => x.name.toLowerCase().includes(String(name || '').toLowerCase())) || (!name ? all[0] : null);
    if (!s) throw new Error(name ? `No snapshot "${name}"` : 'No snapshots yet (/forge-snap saves one).');
    const r = await exec(`(() => { localStorage.clear(); const o = ${JSON.stringify(s.data)}; for (const k in o) localStorage.setItem(k, o[k]); return Object.keys(o).length; })()`);
    if (!r.ok) throw new Error(r.error);
    // the game would save its current state over the restored one on unload: this page can't write storage any more
    await exec('window.save = () => {}; Storage.prototype.setItem = Storage.prototype.removeItem = Storage.prototype.clear = function () {}; true');
    await reload();
    log(`Restored snapshot "${s.name}"`);
    return s.name;
  }
  async function snapshotsDialog() {
    const all = await snapshots();
    const dlg = el('dialog', { class: 'ui-modal gallery-dialog' });
    const list = el('div', { class: 'download-list' }, all.length ? all.map((s) => el('div', { class: 'download-row' },
      el('span', { class: 'dl-name', text: s.name }), el('span', { class: 'hint', text: `stage ${s.stage} · ${fmtVal(s.gold)} gold · ${timeAgo(s.at)}` }),
      el('button', { type: 'button', class: 'ghost small', text: 'Restore', on: { click: async () => { dlg.close(); try { await restore(s.name); toast(`Restored "${s.name}"`); } catch (err) { toast(err.message, { type: 'error' }); } } } }),
      el('button', { type: 'button', class: 'ghost small danger', text: '×', on: { click: async () => { await window.hub.kvSet('forge-snapshots', (await snapshots()).filter((x) => x.name !== s.name)); dlg.close(); snapshotsDialog(); } } }))) : el('p', { class: 'hint', text: 'No snapshots yet. A snapshot keeps the debug game\'s save so you can come back to a situation (a stage, a build, a boss).' }));
    dlg.append(el('form', { method: 'dialog' }, el('h2', { text: 'Game snapshots' }), list,
      el('div', { class: 'dialog-actions' }, el('button', { type: 'button', class: 'primary', text: '＋ Snapshot now', on: { click: async () => { const n = await Modal.prompt('Snapshot name', { value: '' , placeholder: 'e.g. Boss 50 with drone build' }); if (n == null) return; try { await snapshot(n.trim() || undefined); dlg.close(); snapshotsDialog(); } catch (err) { toast(err.message, { type: 'error' }); } } } }),
        el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Close' }))));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }

  // Patch sets: named groups of enabled patches ("balance test", "visual debug"…), switched in one go.
  const patchSets = () => window.hub.kvGet('forge-patch-sets', {});
  async function savePatchSet(name) {
    const sets = await patchSets();
    sets[name] = patches.filter((p) => p.enabled).map((p) => p.name);
    await window.hub.kvSet('forge-patch-sets', sets);
    return sets[name];
  }
  async function applyPatchSet(name, { doReload = true } = {}) {
    const sets = await patchSets();
    const key = Object.keys(sets).find((k) => k.toLowerCase() === String(name).toLowerCase()) || Object.keys(sets).find((k) => k.toLowerCase().includes(String(name).toLowerCase()));
    if (!key && !/^(none|off)$/i.test(name)) throw new Error(`No patch set "${name}". Sets: ${Object.keys(sets).join(', ') || 'none yet'}`);
    const on = new Set(key ? sets[key] : []);
    for (const p of patches) p.enabled = on.has(p.name);
    await window.hub.kvSet('forge-patches', patches);
    renderPatchBadge();
    if (doReload && view) await reload();
    return key || 'none';
  }
  async function setPatch(name, enabled) {
    const p = patches.find((x) => x.name.toLowerCase() === String(name).toLowerCase()) || patches.find((x) => x.name.toLowerCase().includes(String(name).toLowerCase()));
    if (!p) throw new Error(`No patch "${name}"`);
    p.enabled = enabled == null ? !p.enabled : enabled;
    await window.hub.kvSet('forge-patches', patches);
    renderPatchBadge();
    if (p.enabled && ready) await exec(p.code);
    return p;
  }
  async function exportPatches() {
    const p = await window.hub.saveFile({ defaultPath: 'forgeheart-patches.json', filters: [{ name: 'JSON', extensions: ['json'] }], content: JSON.stringify({ forgePatches: 1, patches, sets: await patchSets() }, null, 2) });
    if (p) toast(`Exported ${patches.length} patches`);
  }
  async function importPatches() {
    const [file] = await window.hub.openDialog({ filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (!file) return;
    const data = JSON.parse(await window.hub.fs.read(file));
    let added = 0;
    for (const p of data.patches || []) if (p?.name && p.code && !patches.some((x) => x.name === p.name)) { patches.push({ ...p, enabled: false }); added += 1; }
    await window.hub.kvSet('forge-patches', patches);
    if (data.sets) await window.hub.kvSet('forge-patch-sets', { ...data.sets, ...(await patchSets()) });
    renderPatchBadge();
    toast(`Imported ${added} patch${added === 1 ? '' : 'es'} (off until you enable them)`);
  }

  async function runCode() {
    needGame();
    const code = await Modal.prompt('Run in the game', { multiline: true, value: store.get('forge.lastCode', 'S.gold'), label: 'Like the DevTools console: the last expression\'s value is shown in the log.' });
    if (!code) return;
    store.set('forge.lastCode', code);
    const r = await exec(code);
    log(r.ok ? `› ${fmtVal(r.value)}` : `✕ ${r.error.split('\n')[0]}`, r.ok ? '' : 'bad');
  }

  function moreMenu(e) {
    const sub = (fn) => () => fn().catch?.((err) => toast(err.message, { type: 'error' }));
    showMenu(e.clientX, e.clientY, [
      { label: '▶ Start (skip the title screen)', action: sub(() => quick('start')) },
      { label: '❤ Heal', action: sub(() => quick('heal')) },
      { label: '☠ Kill all enemies', action: sub(() => quick('kill')) },
      { label: '👑 Spawn the boss', action: sub(() => quick('boss')) },
      { label: 'Spawn enemies…', action: sub(async () => { const types = await enemyTypes(); const v = await Modal.form('Spawn enemies', [{ name: 'type', label: 'Type', type: 'select', options: ['random', ...types] }, { name: 'count', label: 'How many', type: 'number', value: 20 }, { name: 'mult', label: 'Strength ×', type: 'number', value: 1 }], { ok: 'Spawn' }); if (v) await quick('spawn', `${v.type} ${v.count} ${v.mult}`); }) },
      { label: '💰 Gold +1M', action: sub(async () => { const r = await exec('S.gold'); await quick('gold', (r.ok ? r.value : 0) + 1e6); }) },
      { label: '⏭ Next stage', action: sub(() => quick('next')) },
      { label: 'Go to stage…', action: sub(async () => { const v = await Modal.prompt('Go to stage', { value: '50' }); if (v) await quick('stage', v); }) },
      { label: `${watchBox && !watchBox.hidden ? '✓ ' : ''}Stat watch`, action: () => setWatch() },
      { label: 'Watch an expression…', action: async () => { const v = await Modal.prompt('Watch', { placeholder: 'e.g. S.inv.length or C.boss?.hp', label: 'An expression evaluated in the game every second' }); if (v) addWatch(v); } },
      { label: '📸 Snapshots…', action: () => snapshotsDialog() },
      { label: 'Patch sets…', action: () => patchSetsMenu(e) },
      { label: 'Run code…', action: sub(runCode) },
      { label: 'Export patches…', action: () => exportPatches() },
      { label: 'Import patches…', action: () => importPatches().catch((err) => toast(err.message, { type: 'error' })) },
    ]);
  }
  async function patchSetsMenu(e) {
    const sets = await patchSets();
    setTimeout(() => showMenu(e.clientX, e.clientY, [
      { label: 'Save the enabled patches as a set…', action: async () => { const n = await Modal.prompt('Patch set name'); if (n?.trim()) { const s = await savePatchSet(n.trim()); toast(`Set "${n.trim()}": ${s.length} patch(es)`); } } },
      ...Object.entries(sets).map(([k, v]) => ({ label: `Use "${k}" (${v.length})`, action: () => applyPatchSet(k).then((x) => toast(`Patch set "${x}" on`)).catch((err) => toast(err.message, { type: 'error' })) })),
      { label: 'All patches off', action: () => applyPatchSet('none') },
    ]), 30);
  }

  HubBridge.register(['forge_'], handleTool);

  return {
    mount, exec, reload, handleTool, isReady: () => ready, quick, enemyTypes, setWatch, addWatch, watchList, snapshot, restore, snapshots, snapshotsDialog,
    patches: () => patches.slice(), patchSets, savePatchSet, applyPatchSet, setPatch, exportPatches, importPatches, patchesDialog, log,
  };
})();
