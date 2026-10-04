// Live Forgeheart debug game: a persistent game view shown beside the Forge Debug agent's chat.
// Claude drives it through the forge_* tools (mcp/forge-game-mcp.js → gamebridge.js → here).
const ForgeGame = (() => {
  const DEFAULT_BUILD = 'C:\\Users\\quent\\Desktop\\forgeheart_music_test5.html';
  const PARTITION = 'persist:forgeheart-debug';
  let view = null;
  let ready = false;
  let logBox = null;
  let buildSel = null;
  let patches = [];

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
      log(`Claude: spawn ${type === 'boss' ? 'the boss' : `${count} × ${type}`}${mult !== 1 ? ` (×${mult})` : ''}`, 'claude');
      return exec(`(() => { const want = ${JSON.stringify(type)}, made = {};
        if (want === 'boss') { spawnBoss(); return { spawned: 'boss', enemies: C.en.length }; }
        const keys = Object.keys(FOES); let n = 0;
        for (let i = 0; i < ${count}; i++) { const t = want === 'random' ? keys[Math.floor(Math.random() * keys.length)] : want;
          if (want !== 'random' && !FOES[t]) throw new Error('Unknown enemy type ' + t + '. Known: ' + keys.join(', '));
          const f = spawnFoe(t, ${mult}); if (!f) break; n++; made[f.type] = (made[f.type] || 0) + 1; }
        return { spawned: n, byType: made, enemiesNow: C.en.length, cap: combatEnemyCap(), note: n < ${count} ? 'Stopped at the enemy cap' : undefined }; })()`);
    }
    if (tool === 'forge_debug') {
      log(`Claude: debug ${Object.entries(args).map(([k, v]) => `${k}=${v}`).join(', ')}`, 'claude');
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
      surface?.classList.add('capturing');
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
        btn('DevTools', 'Game console & profiler', () => view.openDevTools())),
      el('div', { class: 'game-view' }, view),
      logBox);
    fillBuilds();
    window.hub.kvGet('forge-patches', []).then((p) => { patches = p; renderPatchBadge(); });
  }

  // Bridge calls from Claude arrive here; answers go back to the main process.
  window.hub.onGameCall(async ({ id, tool, args }) => {
    let result;
    try { result = await handleTool(tool, args); } catch (err) { result = { ok: false, error: err.message }; }
    window.hub.gameResult(id, result);
  });

  return { mount, exec, reload, handleTool, isReady: () => ready };
})();
