// (round 153, trim153) Trim Hearth: the features that can be switched off, least used first, each with how much it was
// used on this computer (usage.js's counts: its commands, Ctrl/⌘+K lines, rail tools, app windows, agent tools and
// click names, plus lazy.js's own "loaded because you used it" count), its weight (KB of code, whether it loads with
// Hearth, the repeating timers it started) and an on / off switch. Nothing changes until Apply; "Suggested" only
// pre-selects what wasn't used for 30 days (never by itself). A switched-off feature doesn't load at all (lazy.js);
// its data is never touched. Turning one on is live; turning one off finishes after a reload when it had loaded.
// Lazy group 'trim' (loaded on first use): Settings › This computer & sync › Trim Hearth…, Ctrl/⌘+K, /trim, the
// command bar. Everything it reads and writes stays on this computer (localStorage 'hub.trim.off' / 'hub.trim.use').
const Trim = (() => {
  const DAY = 864e5;
  const HF = () => window.HearthFeatures;
  const ago = (t) => { if (!t) return ''; const d = Math.floor((Date.now() - t) / DAY); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 60 ? `${d} days ago` : `${Math.round(d / 30)} months ago`; };
  const kbText = (kb) => (kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`);

  function ownUse() { try { return JSON.parse(localStorage.getItem('hub.trim.use') || '{}') || {}; } catch { return {}; } }
  // how often a feature was used here: { n, last }
  function usageOf(f) {
    const W = TrimData.WORDS[f.id] || {};
    const nm = f.groups.map((g) => (window.Lazy?.names ? Lazy.names(g) : { commands: [], actions: [], tools: [], apps: [], bridge: [] }));
    const keys = new Set();
    for (const n of nm) {
      for (const c of n.commands) keys.add(`Chat command › /${c}`);
      for (const a of n.actions) keys.add(`Command palette › ${a}`);
      for (const t of [...n.tools, ...n.apps]) { keys.add(`Open › ${t}`); keys.add(`Open › tool:${t}`); keys.add(`Open › app:${t}`); }
    }
    const bridge = nm.flatMap((n) => n.bridge);
    let re = null; try { re = W.words ? new RegExp(W.words, 'i') : null; } catch { re = null; }
    let n = 0; let last = 0;
    const items = (typeof Usage !== 'undefined' && Usage.data?.items) || {};
    for (const [k, it] of Object.entries(items)) {
      if (!it?.n) continue;
      const tool = k.startsWith('Agent tool › ') ? k.slice(13) : null;
      if (keys.has(k) || (tool && bridge.some((p) => tool.startsWith(p))) || (!tool && !k.startsWith('Open › ') && re && re.test(k))) { n += it.n; last = Math.max(last, it.last || 0); }
    }
    const own = ownUse();
    // (round 164, groups164) a merged group's count + what was counted under the names it took in (LazyData.GROUPS[].also)
    const also = (g) => (typeof LazyData !== 'undefined' ? LazyData.GROUPS.find((x) => x.name === g)?.also : null) || [];
    for (const g of f.groups) for (const k of [g, ...also(g)]) if (own[k]) { n += own[k].n || 0; last = Math.max(last, own[k].last || 0); }
    return { n, last };
  }
  function weightOf(f) {
    const st = new Map((window.Lazy?.state?.() || []).map((s) => [s.name, s]));
    const kb = f.groups.reduce((a, g) => a + (TrimData.KB[g] || 0), 0);
    const atStart = f.groups.some((g) => st.get(g) && st.get(g).tier !== 'use');
    const timers = f.groups.reduce((a, g) => a + (st.get(g)?.timers || 0), 0);
    const loaded = f.groups.some((g) => st.get(g)?.state === 'loaded');
    return { kb, atStart, timers, loaded };
  }
  function rows() {
    return HF().list().filter((f) => !f.core).map((f) => ({ ...f, name: f.name || f.id, use: usageOf(f), weight: weightOf(f) }))
      .sort((a, b) => a.use.n - b.use.n || (a.use.last || 0) - (b.use.last || 0) || b.weight.kb - a.weight.kb || a.name.localeCompare(b.name));
  }
  const trackedDays = () => (typeof Usage !== 'undefined' && Usage.trackedDays ? Math.max(0, Math.round(Usage.trackedDays())) : 0);
  // not used for 30 days (or never), not one that works by itself, and on now
  const suggested = (r) => r.on && !TrimData.WORDS[r.id]?.passive && (!r.use.n || Date.now() - (r.use.last || 0) > 30 * DAY);

  // A feature switched on or off: on is live (its stand-ins come back; a group that loads at the start loads now); off
  // hides its entry points now (its stand-in commands go, its buttons hide) and a group already loaded, or one with
  // Ctrl/⌘+K lines, keys, rail tools or app windows, keeps them until the next reload → { restart: true }
  function setFeature(id, on) {
    if (!HF() || !HF().set(id, on)) return { ok: false, restart: false };
    if (!window.Lazy?.kit) return { ok: true, restart: true };
    const K = Lazy.kit();
    const was = new Map([...K.groups.values()].map((g) => [g.name, Boolean(g.off)]));
    K.applyOff();
    let restart = false;
    for (const g of K.groups.values()) {
      if (was.get(g.name) === Boolean(g.off)) continue;
      if (g.off) {
        if (g.state !== 'stub') { restart = true; continue; }
        for (const [key, cmd] of [...K.stubCmds]) {
          if (!key.startsWith(`${g.name}|`)) continue;
          K.stubCmds.delete(key);
          const self = K.stubSelf.get(key);
          if (Commands.get(cmd) === self) K.unregs.get(key)?.(); else if (self) self.when = () => false;
        }
        const m = K.groupMeta(g.name);
        if ((m.actions || []).length || (m.tools || []).length || (m.apps || []).length || (m.keys || []).length) restart = true;
      } else if (g.state === 'stub') {
        if (K.placed.has(g.name)) {
          if (!g.stubbed) K.stubNow(g);
          else { const m = K.groupMeta(g.name); K.each(g, (m.commands || []).filter((c) => !c.dcl), (c) => K.stubCommand(g, c)); }
          if (document.readyState !== 'loading') K.stubLater(g);
        }
        if (g.tier === 'soon' && K.started()) K.idle(() => (g.state === 'stub' && !g.off ? K.load(g.name, { auto: true }) : null)?.catch(() => {}));
      }
    }
    try { Commands.addInfo?.({}); } catch { /* the search index rebuilds on its own */ }
    return { ok: true, restart };
  }

  let dlg = null;
  function open() {
    dlg?.close();
    const list = rows();
    const pending = new Map(list.map((r) => [r.id, r.on])); // id → on (what Apply will save)
    const coreList = HF().list().filter((f) => f.core);
    const days = trackedDays();
    const summary = el('p', { class: 'tr-sum' });
    const note = el('p', { class: 'tr-note', attrs: { 'aria-live': 'polite' } });
    const applyBtn = el('button', { type: 'button', class: 'primary tr-apply', text: 'Apply', disabled: true });
    const alsoOff = () => {
      const offIds = [...pending].filter(([, on]) => !on).map(([id]) => id);
      const gs = new Set(HF().offGroups(new Set(offIds)));
      return list.filter((r) => pending.get(r.id) && r.groups.every((g) => gs.has(g))).map((r) => r.name);
    };
    const paint = () => {
      const on = [...pending.values()].filter(Boolean).length;
      const startKB = list.filter((r) => pending.get(r.id) && r.weight.atStart).reduce((a, r) => a + r.weight.kb, 0);
      summary.textContent = `${on} of ${list.length} features on · ${kbText(startKB)} of them load with Hearth`;
      const changed = list.filter((r) => pending.get(r.id) !== r.on);
      applyBtn.disabled = !changed.length;
      applyBtn.textContent = changed.length ? `Apply (${changed.length})` : 'Apply';
      for (const r of list) {
        const row = body.querySelector(`[data-id="${r.id}"]`);
        const sw = row?.querySelector('.tr-switch');
        if (!sw) continue;
        const v = pending.get(r.id);
        sw.setAttribute('aria-checked', String(v)); sw.classList.toggle('on', v);
        sw.querySelector('.tr-sw-t').textContent = v ? 'On' : 'Off';
        row.classList.toggle('tr-off', !v); row.classList.toggle('tr-changed', v !== r.on);
      }
      const also = alsoOff();
      note.textContent = also.length ? `Also off with them (they need it): ${also.join(', ')}.` : '';
    };
    const useText = (r) => (r.use.n ? `used ${r.use.n} time${r.use.n === 1 ? '' : 's'}${r.use.last ? ` · last used ${ago(r.use.last)}` : ''}` : (TrimData.WORDS[r.id]?.passive ? 'works by itself (no clicks to count)' : 'never used on this computer'));
    const weightText = (r) => [kbText(r.weight.kb), r.weight.atStart ? 'loads with Hearth' : 'loads only when used', r.weight.timers ? `${r.weight.timers} background timer${r.weight.timers === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
    const row = (r) => el('div', { class: `tr-row${r.on ? '' : ' tr-off'}`, dataset: { id: r.id } },
      el('div', { class: 'tr-main' },
        el('span', { class: 'tr-name', text: r.name }),
        el('span', { class: 'tr-area', text: r.area || '' }),
        el('span', { class: 'tr-desc', text: r.desc || '' }),
        el('span', { class: 'tr-meta' }, el('span', { class: `tr-use${r.use.n ? '' : ' tr-never'}`, text: useText(r) }), el('span', { class: 'tr-weight', text: weightText(r) }))),
      el('button', { type: 'button', class: 'tr-switch', attrs: { role: 'switch', 'aria-checked': String(r.on), 'aria-label': `${r.name}: on or off` },
        on: { click: () => { pending.set(r.id, !pending.get(r.id)); paint(); } } }, el('i'), el('span', { class: 'tr-sw-t', text: r.on ? 'On' : 'Off' })));
    const body = el('div', { class: 'tr-list' }, list.map(row));
    const suggest = () => {
      const pick = list.filter(suggested);
      for (const r of pick) pending.set(r.id, false);
      paint();
      note.textContent = pick.length
        ? `${pick.length} picked: not used for 30 days${days < 30 ? ` (uses counted here for ${days} day${days === 1 ? '' : 's'} so far)` : ''}. Look them over, then Apply.`
        : 'Nothing to suggest: everything that is on was used in the last 30 days.';
    };
    const apply = () => {
      let restart = false;
      const changed = list.filter((r) => pending.get(r.id) !== r.on);
      for (const r of changed) { const res = setFeature(r.id, pending.get(r.id)); restart ||= Boolean(res?.restart); }
      const offN = changed.filter((r) => !pending.get(r.id)).length; const onN = changed.length - offN;
      dlg.close();
      const words = [offN ? `${offN} switched off` : '', onN ? `${onN} back on` : ''].filter(Boolean).join(', ');
      if (restart) {
        toast(`${words}. Reload Hearth to finish (your chats and work stay as they are).`, { timeout: 12000, action: { label: 'Reload now', fn: () => window.hub?.reloadWindow?.('Trim Hearth') } });
      } else toast(`${words}. Done: nothing to reload.`, { timeout: 5000 });
    };
    applyBtn.addEventListener('click', apply);
    const core = el('details', { class: 'tr-core' },
      el('summary', { text: `Always on (${coreList.length})` }),
      el('p', { class: 'tr-desc', text: 'What Hearth is for and what keeps your work safe: these can\'t be switched off.' }),
      ...coreList.map((c) => el('div', { class: 'tr-core-row' }, el('span', { class: 'tr-name', text: c.name }), el('span', { class: 'tr-desc', text: c.desc }))));
    dlg = el('dialog', { class: 'ui-modal trim-dlg', attrs: { 'aria-label': 'Trim Hearth' } },
      el('div', { class: 'tr-head' },
        el('h2', { text: 'Trim Hearth' }),
        el('p', { class: 'tr-lead', text: 'Switched-off features don\'t load. Your data stays; turn them back on anytime.' }),
        summary,
        el('p', { class: 'tr-since', text: days ? `Uses counted on this computer for ${days} day${days === 1 ? '' : 's'}. Least used first.` : 'Uses are counted on this computer from now on. Least used first.' }),
        el('div', { class: 'tr-tools' },
          el('button', { type: 'button', class: 'ghost small tr-suggest', text: 'Suggested', title: 'Pre-selects what you haven\'t used for 30 days (nothing changes until Apply)', on: { click: suggest } }),
          el('button', { type: 'button', class: 'ghost small tr-allon', text: 'All on', title: 'Every feature back on (nothing changes until Apply)', on: { click: () => { for (const r of list) pending.set(r.id, true); paint(); note.textContent = ''; } } }),
          el('span', { class: 'spacer' }))),
      body, note, core,
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }),
        el('button', { type: 'button', class: 'ghost', text: 'Cancel', on: { click: () => dlg.close() } }), applyBtn));
    dlg.addEventListener('close', () => { dlg?.remove(); dlg = null; });
    document.body.append(dlg);
    paint();
    dlg.showModal();
    return dlg;
  }

  // the ways in: /trim, Ctrl/⌘+K (and the command bar, which lists the commands)
  if (typeof Commands !== 'undefined') Commands.register({ name: 'trim', aliases: ['trim-hearth'], area: 'App', desc: 'Trim Hearth: switch off the features you don\'t use (they stop loading; your data stays)', keywords: ['features', 'lighter', 'switch off', 'disable', 'unused', 'remove features'], run: () => { open(); return 'Trim Hearth is open.'; } });
  if (typeof AppUI !== 'undefined') AppUI.addAction('Trim Hearth… (switch off features you don\'t use)', () => open());

  return { open, rows, usageOf, weightOf, setFeature, suggested: () => rows().filter(suggested).map((r) => r.id) };
})();
