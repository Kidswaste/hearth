// Check this computer (round 28, firstrun): a new computer ready in two minutes. On the first launch on a fresh
// computer (no chats yet; engine-health.js asks once the startup check is in) and from Settings › Advanced ›
// "Check this computer…", one calm list in plain words (firstrun-core.js): Claude, Codex for Astra, ffmpeg, the sync
// folder (join the Hearth already in your cloud drive), folders chats use from the other computer, the Mac's privacy
// permissions, Windows paths + the SmartScreen note, updates. Each line has its state and one button.
//   · Nothing installs by itself: a button runs the documented command only after the click (the command is shown on
//     the line first, click it to copy) in a visible Terminal / PowerShell window, or opens the official page.
//   · Every check is the existing one: EngineHealth.check / problemsOf (engines.checkInstalls), hub.ffmpegStatus,
//     Sync (status / detect / setup), reach (firstrunmain.js → reachmain.resolveOne), the updater's status.
//   · Live: a line re-checks every few seconds after its button (until it's ready or 10 minutes), everything again
//     when Hearth gets the focus back (from Terminal, System Settings…).
//   · Skippable: shown once by itself; after that only from Settings (or /check-computer, Ctrl/⌘+K).
const FirstRun = (() => {
  const C = FirstRunCore;
  const ACKS = 'firstrun.acks';
  const SEEN = 'firstrun.seen';
  const STATE_WORD = { ok: 'Ready', fix: 'To do', optional: 'Optional', note: 'Good to know', checking: 'Checking…' };
  const PART = (id) => (id === 'claude' || id === 'codex' ? 'engines' : /^(perm|win)-/.test(id) ? 'main' : id);
  let f = {}; // what's known so far (firstrun-core's input)
  let dlg = null; let list = null; let head = null;
  let sig = '';
  const watches = new Map(); // row id → interval
  let focusT = 0; let lastFocus = 0;

  const used = () => {
    const a = (typeof H !== 'undefined' ? H.agents() : []).filter((x) => x.mode === 'native');
    return { claude: a.some((x) => x.engine !== 'codex'), codex: a.some((x) => x.engine === 'codex') };
  };
  const acks = () => { try { return store.get(ACKS, {}) || {}; } catch { return {}; } };

  // ---------- gathering (each part paints as soon as it's in) ----------
  const parts = {
    async engines(o, only) {
      const r = await EngineHealth.check({ fresh: o.fresh, engines: only });
      const out = { ...(f.engines || {}) };
      for (const e of only || ['claude', 'codex']) if (r?.[e]) out[e] = { report: r[e], problems: EngineHealth.problemsOf(r[e]) };
      f.engines = out;
      // the sign-in command for the copy in use (shown before its button)
      const bins = Object.fromEntries(['claude', 'codex'].map((e) => [e, out[e]?.report?.chosen]).filter(([, p]) => p));
      if (Object.keys(bins).length) { const m = await window.hub.firstrun.facts({ bins }); f.login = m.login; }
    },
    async main() {
      const m = await window.hub.firstrun.facts({});
      Object.assign(f, { platform: m.platform, perms: m.perms, longPaths: m.longPaths, appDir: m.appDir, home: m.home, commands: m.commands, test: m.test });
      f.ffmpeg = f.ffmpeg ? { ...f.ffmpeg, command: m.commands.ffmpeg } : f.ffmpeg;
      f._ffcmd = m.commands.ffmpeg;
    },
    async ffmpeg(o) {
      const st = await window.hub.ffmpegStatus({ fresh: o.fresh });
      f.ffmpeg = { found: Boolean(st?.ffmpeg), command: f._ffcmd || null };
    },
    async sync() {
      const status = await Sync.refresh();
      const detect = status?.on ? null : await window.hub.sync.detect().catch(() => null);
      f.sync = { status, detect, line: Sync.line() };
    },
    async folders() { f.folders = await window.hub.firstrun.folders(); },
    async update() {
      let u = null;
      try { u = await window.hub.update.status({ fetch: false }); } catch (err) { u = { ok: false, reason: 'fetch', message: err.message }; }
      f.update = u;
    },
  };
  async function gather({ fresh = false, only = null, engines = null } = {}) {
    f.used = used(); f.acks = acks();
    const names = only || Object.keys(parts);
    await Promise.all(names.map((n) => parts[n]({ fresh }, n === 'engines' ? engines : undefined).catch((err) => console.warn('firstrun', n, err)).finally(paint)));
    return rows();
  }
  const rows = () => C.rows(f);

  // ---------- drawing (compare before write) ----------
  function rowEl(r) {
    const btn = r.action ? el('button', { type: 'button', class: `${r.state === 'fix' ? 'primary' : 'ghost'} small fr-b`, text: r.action.label,
      title: r.cmd ? `Runs the command above in a visible ${f.platform === 'win32' ? 'PowerShell' : 'Terminal'} window` : '', on: { click: (e) => act(r, e.currentTarget) } }) : null;
    return el('div', { class: 'fr-row', dataset: { id: r.id, state: r.state } },
      el('span', { class: 'fr-ic', text: r.icon }),
      el('div', { class: 'fr-main' },
        el('div', { class: 'fr-t' }, el('b', { text: r.title }), el('span', { class: 'fr-s', text: STATE_WORD[r.state] || '' })),
        el('div', { class: 'fr-x', text: r.text }),
        r.cmd ? el('code', { class: 'fr-cmd', text: r.cmd, title: 'The exact command the button runs (click to copy)', on: { click: () => copyText(r.cmd, 'Command copied') } }) : null,
        r.link ? el('a', { class: 'fr-link', href: '#', text: `${r.link.label} ↗`, on: { click: (e) => { e.preventDefault(); window.hub.openExternal(r.link.url); } } }) : null),
      btn);
  }
  function paint() {
    if (!dlg?.open) return;
    const all = rows();
    const s = C.summary(all);
    const next = JSON.stringify(all);
    if (head.textContent !== s.line) head.textContent = s.line;
    head.dataset.need = String(s.need);
    if (next === sig) return;
    sig = next;
    const busy = new Set([...list.querySelectorAll('.fr-b[disabled]')].map((b) => b.closest('.fr-row')?.dataset.id));
    list.replaceChildren(...all.map((r) => { const n = rowEl(r); if (busy.has(r.id) && watches.has(r.id)) n.querySelector('.fr-b')?.setAttribute('disabled', ''); return n; }));
  }

  // ---------- fixes (only after a click) ----------
  // o.folder: the folder a test picks (the native folder dialog can't be answered headless)
  async function act(r, b, o = {}) {
    const a = r.action;
    if (!a) return null;
    if (b) b.disabled = true;
    const done = () => { if (b) b.disabled = false; };
    try {
      if (a.kind === 'engine') { const res = await EngineHealth.fix(a.engine, a.act); if (res?.ok) watch(r.id); else done(); return res; }
      if (a.kind === 'ffmpeg') { const res = await EngineHealth.installFfmpeg(); if (res?.ok) watch(r.id); else done(); return res; }
      if (a.kind === 'sync') { done(); const d = await Sync.setup({ change: Boolean(a.change) }); d?.addEventListener('close', () => setTimeout(() => recheck('sync'), 400)); watch(r.id); return d; }
      if (a.kind === 'folder') {
        done();
        const name = a.path.split(/[\\/]/).filter(Boolean).pop() || a.path;
        const here = o.folder || await window.hub.pickFolder(f.home || '', `Where is “${name}” on this computer?`);
        if (!here) return null;
        H.config.settings = { ...H.config.settings, reachFolders: { ...(H.settings().reachFolders || {}), [a.path]: here } };
        await saveConfig();
        toast(`Chats that used ${C.shortPath(a.path, f.home)} now use ${C.shortPath(here, f.home)} on this computer.`, { timeout: 5000 });
        await gather({ only: ['folders'] });
        return here;
      }
      if (a.kind === 'perm') { const res = await window.hub.firstrun.perm(a.which, a.how); done(); await gather({ only: ['main'] }); if (res?.opened) watch(r.id); return res; }
      if (a.kind === 'run') {
        const res = await window.hub.firstrun.run(a.id);
        if (!res?.ok) { done(); toast(`Couldn't open a window (${res?.error || 'unknown'}). Run it yourself: ${res?.command || r.cmd || ''}`, { type: 'error', timeout: 0, action: (res?.command || r.cmd) ? { label: 'Copy', fn: () => copyText(res?.command || r.cmd, 'Command copied') } : undefined }); return res; }
        toast(`Running in the ${res.window} window… this list checks again when it's done.`, { timeout: 5000 });
        watch(r.id);
        return res;
      }
      if (a.kind === 'ack') { store.set(ACKS, { ...acks(), [a.id]: Date.now() }); f.acks = acks(); paint(); return true; }
      if (a.kind === 'update') { done(); await Updater.check({ loud: true }); await gather({ only: ['update'] }); return true; }
      if (a.kind === 'link') { done(); window.hub.openExternal(a.url); watch(r.id); return true; }
    } catch (err) { done(); toast(err.message || String(err), { type: 'error' }); }
    return null;
  }
  // a line re-checks itself after its button: every 5 s (engines 8 s) until it's ready, the list closes, or 10 minutes
  function watch(id) {
    clearInterval(watches.get(id));
    const t0 = Date.now();
    const part = PART(id);
    const tick = async () => {
      const row = rows().find((x) => x.id === id);
      if (!dlg?.open || Date.now() - t0 > 10 * 60000 || row?.state === 'ok') { clearInterval(watches.get(id)); watches.delete(id); paint(); return; }
      await gather({ only: [part], fresh: true, engines: part === 'engines' ? [id] : null });
    };
    watches.set(id, setInterval(tick, part === 'engines' ? 8000 : 5000));
  }
  const recheck = (part) => gather({ only: part ? [part] : null, fresh: true });
  function onFocus() { // back from Terminal / System Settings / the cloud app: everything again (at most every 4 s)
    if (!dlg?.open || Date.now() - lastFocus < 4000) return;
    clearTimeout(focusT);
    focusT = setTimeout(() => { lastFocus = Date.now(); recheck(); }, 600);
  }

  // ---------- the list ----------
  function open({ auto = false } = {}) {
    if (dlg?.open) { gather({ fresh: true }); return dlg; }
    sig = '';
    head = el('p', { class: 'fr-sum', text: 'Checking…' });
    list = el('div', { class: 'fr-list' });
    dlg = el('dialog', { class: 'ui-modal fr-dialog' });
    const close = () => dlg.close();
    dlg.append(el('form', { method: 'dialog' },
      el('h2', { text: auto ? 'Set up this computer' : 'Check this computer' }),
      el('p', { class: 'hint fr-intro', text: 'One line per thing Hearth uses. Nothing installs by itself: a button shows its command first and runs it in a window you can see.' }),
      head, list,
      el('div', { class: 'dialog-actions' },
        el('button', { type: 'button', class: 'ghost', text: 'Check again', title: 'Look at everything again now', on: { click: () => recheck() } }),
        el('span', { class: 'spacer' }),
        el('span', { class: 'hint fr-later', text: auto ? 'Comes back from Settings › Advanced' : '' }),
        el('button', { type: 'button', class: auto ? 'ghost' : 'primary', text: auto ? 'Skip for now' : 'Done', on: { click: close } }))));
    dlg.addEventListener('close', () => {
      for (const t of watches.values()) clearInterval(t);
      watches.clear();
      window.removeEventListener('focus', onFocus);
      const d = dlg; setTimeout(() => d.remove(), 0);
    });
    window.addEventListener('focus', onFocus);
    document.body.append(dlg);
    dlg.showModal();
    paint();
    gather({ fresh: !auto });
    return dlg;
  }

  // the first launch (engine-health.js, after its startup check): a fresh computer sees the list once
  function auto(report = {}, o = {}) {
    const d = C.autoDecision({ seen: store.get(SEEN, false), test: o.test ?? report.test, chats: o.chats ?? (H.chats || []).length });
    if (d === 'skip') return false;
    store.set(SEEN, d === 'show' ? 'shown' : 'in use');
    if (d === 'mark') return false;
    if (report.claude || report.codex) f.engines = Object.fromEntries(['claude', 'codex'].filter((e) => report[e]).map((e) => [e, { report: report[e], problems: EngineHealth.problemsOf(report[e]) }]));
    open({ auto: true });
    return true;
  }

  // ---------- reachable: Settings › Advanced (appui.js), Ctrl/⌘+K, /check-computer ----------
  AppUI.addAction?.('Check this computer…', () => open());
  if (!Commands.get('check-computer')) {
    Commands.register({ name: 'check-computer', aliases: ['setup-computer'], area: 'Hearth', desc: 'Is this computer ready? Claude, Codex, ffmpeg, sync, folders, permissions, updates: one list, one button each',
      keywords: 'first run setup new computer doctor permissions ffmpeg sync install', run: async () => { open(); return 'Opened “Check this computer”.'; } });
  }

  return { open, auto, gather, rows, act, recheck, close: () => dlg?.close(), get facts() { return f; }, get dialog() { return dlg?.open ? dlg : null; } };
})();
