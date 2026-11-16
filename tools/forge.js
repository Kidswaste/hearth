// Forgeheart workspace: dashboard, build player with live reload, docs, Miro boards, tasks,
// patch notes, release packaging, balance CSVs, backup cleanup + diff, file search, devlog.
const Forge = (() => {
  // The live project (GitHub: Kidswaste/forgeheart main is built into this folder).
  const DEFAULT_FOLDER = 'C:\\Users\\quent\\Documents\\Codex\\2026-09-08\\continue-and-finish-the-user-s\\outputs';
  const SKIP = ['_harness', 'node_modules', '.git', 'saves'];
  const MAIN_BUILD = 'forgeheart_drone_hybrid.html';
  const DEFAULT_BOARDS = [
    { name: 'Forgeheart — Game Manual Board', url: 'https://miro.com/app/board/uXjVH44x9wI=/' },
    { name: 'PRIVATE - Forgeheart', url: 'https://miro.com/app/board/uXjVHnFKYyg=/' },
    { name: 'Unique + Behaviour', url: 'https://miro.com/app/board/uXjVH31nV-k=/' },
  ];
  const DEFAULT_BRIEF = `Forgeheart is my browser game: a fullscreen survivor with loot forging and a factory simulation, shipped as a single HTML file and released on itch.io.
Main build: ${MAIN_BUILD}. Design notes, pass reports and patch notes live as Markdown files in the project folder; affix balance data is in CSV.
When you suggest changes, be concrete (numbers, names, files) and keep the game's existing systems (drones, forging, affixes, ascendancy lattice, rifts) consistent.`;
  let tabs = null;
  const api = {};

  const folder = () => H.settings().forgeheartFolder || DEFAULT_FOLDER;
  // (round 31, winmac) the folder's own slash: \ on Windows, / on the Mac (a Mac folder got files named "x\y.md")
  const join = (...p) => { const sep = /^[A-Za-z]:|\\/.test(p[0] || '') ? '\\' : '/'; return p.join(sep).replace(/[\\/]+/g, sep); };
  const baseName = (p) => p.split(/[\\/]/).pop();
  const pretty = (file) => baseName(file).replace(/\.(md|html|csv|json|zip)$/i, '').replace(/[_-]+/g, ' ').replace(/\b20\d\d \d\d \d\d\b/, (d) => d.replace(/ /g, '-'));
  const isBackup = (name) => /\.bak\.html$/i.test(name);

  async function files() {
    return window.hub.fs.list(folder(), { recursive: true, depth: 2, skipDirs: SKIP })
      .then((all) => all.filter((f) => !f.isDir));
  }
  const kv = {
    get: (name, fallback) => window.hub.kvGet(name, fallback),
    set: (name, value) => window.hub.kvSet(name, value),
  };

  // ---------- Dashboard ----------
  function dashboardTab(pane) {
    const grid = el('div', { class: 'dash-grid' });
    const refresh = el('button', { class: 'ghost small', text: '⟳ Refresh', on: { click: load } });
    pane.append(el('div', { class: 'three-toolbar' },
      el('b', { text: folder() }), refresh,
      el('button', { class: 'ghost small', text: 'Open folder', on: { click: () => window.hub.fs.open(folder()) } }),
      el('span', { class: 'spacer' }),
      el('button', { class: 'primary small', text: '💬 Forgeheart chat', title: 'New Claude chat that starts with your project brief', on: { click: () => forgeChat() } })), grid);
    async function load() {
      const st = await window.hub.fs.stat(folder());
      if (!st) {
        grid.replaceChildren(el('div', { class: 'dash-card wide' }, el('h3', { text: 'Project folder not found' }), el('p', { class: 'hint', text: folder() }),
          el('button', { class: 'primary small', text: 'Choose the Forgeheart folder…', on: { click: async () => { const f = await window.hub.pickFolder(DEFAULT_FOLDER, 'Forgeheart project folder'); if (f) { H.config.settings = { ...H.config.settings, forgeheartFolder: f }; await saveConfig(); load(); } } } })));
        return;
      }
      const all = await files();
      const top = all.filter((f) => !f.path.slice(folder().length + 1).match(/[\\/]/));
      const builds = top.filter((f) => /\.html$/i.test(f.name) && !isBackup(f.name)).sort((a, b) => b.mtime - a.mtime);
      const main = top.find((f) => f.name === MAIN_BUILD) || builds[0];
      const docs = top.filter((f) => /\.md$/i.test(f.name)).sort((a, b) => b.mtime - a.mtime);
      const backups = top.filter((f) => isBackup(f.name));
      const zips = top.filter((f) => /\.zip$/i.test(f.name)).sort((a, b) => b.mtime - a.mtime);
      const tasks = await kv.get('forge-tasks', []);
      const log = await kv.get('forge-devlog', { entries: [] });
      const today = new Date().toDateString();
      const todayMin = log.entries.filter((e) => new Date(e.start).toDateString() === today).reduce((s, e) => s + e.minutes, 0);
      const weekMin = log.entries.filter((e) => Date.now() - e.start < 7 * 864e5).reduce((s, e) => s + e.minutes, 0);
      const card = (title, ...kids) => el('div', { class: 'dash-card' }, el('h3', { text: title }), ...kids);
      const go = (tab) => () => tabs.show(tab);
      grid.replaceChildren(
        card('Main build', main ? el('div', {}, el('b', { text: main.name }), el('p', { class: 'hint', text: `${fmtBytes(main.size)} · changed ${timeAgo(main.mtime)}` }),
          el('div', { class: 'row' }, el('button', { class: 'primary small', text: '▶ Play here', on: { click: () => { tabs.show('builds'); setTimeout(() => api.play?.(main.path), 50); } } }),
            el('button', { class: 'ghost small', text: 'Open in browser', on: { click: () => window.hub.fs.open(main.path) } }))) : el('p', { class: 'hint', text: 'No HTML build found.' })),
        card('Latest release', zips[0] ? el('div', {}, el('b', { text: zips[0].name }), el('p', { class: 'hint', text: `${fmtBytes(zips[0].size)} · ${timeAgo(zips[0].mtime)}` }),
          el('div', { class: 'row' }, el('button', { class: 'ghost small', text: 'Package a new release', on: { click: go('release') } }),
            el('button', { class: 'ghost small', text: 'itch.io dashboard', on: { click: () => window.hub.openExternal('https://itch.io/dashboard') } }))) : el('button', { class: 'ghost small', text: 'Package a release', on: { click: go('release') } })),
        card('Tasks', el('div', { class: 'dash-counts' }, ['todo', 'doing', 'done'].map((col) => el('div', {}, el('b', { text: tasks.filter((t) => t.col === col).length }), el('span', { class: 'hint', text: col })))),
          el('button', { class: 'ghost small', text: 'Open board', on: { click: go('tasks') } })),
        card('Notes & docs', el('p', {}, el('b', { text: docs.length }), ' Markdown files'), docs[0] ? el('p', { class: 'hint', text: `Latest: ${pretty(docs[0].name)} (${timeAgo(docs[0].mtime)})` }) : null,
          el('button', { class: 'ghost small', text: 'Browse docs', on: { click: go('docs') } })),
        card('Backups', el('p', {}, el('b', { text: backups.length }), ` backup files · ${fmtBytes(backups.reduce((s, b) => s + b.size, 0))}`),
          el('button', { class: backups.length > 30 ? 'primary small' : 'ghost small', text: 'Clean up / compare', on: { click: go('backups') } })),
        card('Devlog', el('p', {}, el('b', { text: `${Math.floor(todayMin / 60)}h ${todayMin % 60}m` }), ' today'), el('p', { class: 'hint', text: `${Math.round(weekMin / 6) / 10} h in the last 7 days` }),
          el('button', { class: 'ghost small', text: 'Open devlog', on: { click: go('devlog') } })),
        card('What the chat knows', el('p', { class: 'hint', text: 'Your brief, and a digest of your design notes, go with every message of the Forge chat.' }),
          el('p', { class: 'hint forge-digest-line', text: digestLine(await kv.get('forge-digest', null)) }),
          el('button', { class: 'ghost small', text: 'Edit brief', on: { click: editBrief } }),
          el('button', { class: 'ghost small', text: '✦ Digest my notes', title: 'The AI reads your design notes once and writes a short digest of the game (what it is, its systems, where it stands). It costs one larger AI call; the digest is kept until you make a new one', on: { click: (e) => { const b = e.currentTarget; b.disabled = true; makeDigest().catch((err) => toast(calmError(err), { type: 'error' })).finally(() => { b.disabled = false; load(); }); } } }),
          el('button', { class: 'ghost small', text: 'Read it', title: 'The digest the chat carries (you can edit it)', on: { click: () => editDigest().then(() => load()).catch((err) => toast(calmError(err), { type: 'error' })) } })));
    }
    load();
    api.refreshDashboard = load;
  }

  async function editBrief() {
    const brief = await kv.get('forge-brief', DEFAULT_BRIEF);
    const next = await Modal.prompt('Forgeheart brief', { value: brief, multiline: true, label: 'What Forgeheart is, in your words. The Forge chat gets it with every message.' });
    if (next != null) { await kv.set('forge-brief', next); knowledge({ fresh: true }).catch(() => {}); toast('Brief saved: the Forge chat reads it from its next message', { timeout: 2200 }); }
  }
  // (round 183, forgechat183) The chat is back in this window: the Forge agent (the one that drives the live game with
  // the forge_* tools) is docked on the right, and it knows the game (knowledge() below rides along with its messages).
  // 💬 Forgeheart chat opens that dock; with something to ask (a doc, a task, the balance table) it lands in its box.
  // No Forge agent yet: one is made (like the Lab's /director-setup). Only when that isn't possible, the old way.
  const forgeAgent = () => (typeof Tools !== 'undefined' && Tools.dockedAgent ? Tools.dockedAgent('forgeheart') : null) || H.agents().find((a) => a.mode === 'native' && a.dock === 'forgeheart') || null;
  async function ensureAgent() {
    let a = forgeAgent();
    if (a) return a;
    if (!H.agents().some((x) => x.mode === 'native')) return null;
    const id = H.agent('forgedirector') ? `forgedirector${Date.now().toString(36)}` : 'forgedirector';
    H.config.agents.push({ id, name: 'Forge Director', icon: '⚒', color: '#e07a2f', mode: 'native', engine: 'claude', dock: 'forgeheart', gameTools: true, companion: 'forge-game', askAll: false, enabled: true });
    await saveConfig();
    a = H.agent(id);
    try { const t = Tools.get?.('forgeheart'); if (t) Tools.shown?.(t); } catch { /* the dock follows on the next show */ }
    toast('The Forge Director is in the Forgeheart window: it drives the live game and knows your notes.', { timeout: 5000 });
    return a;
  }
  async function forgeChat(extra = '') {
    const a = await ensureAgent().catch(() => null);
    if (!a) { const brief = await kv.get('forge-brief', DEFAULT_BRIEF); draftToClaude(`${brief}${extra ? `\n\n${extra}` : ''}\n\n`); return; }
    activate('tool:forgeheart');
    Tools.openDock?.('forgeheart');
    if (extra) { try { Native.setDraft(a.id, `${extra}\n\n`); } catch (err) { console.warn('forge chat draft', err); } }
    setTimeout(() => { try { Native.focus?.(a.id); } catch { /* not mounted yet */ } }, 60);
  }
  // ---------- what the Forge chat knows ----------
  // The brief (the owner's own words, ✎ in the Dashboard), where the project lives, and the names of the design notes;
  // the notes themselves are read on demand with forge_docs. Built once the tool is in, again when the brief changes
  // or every few minutes; the same facts give the same bytes (the prompt part stays cached).
  const KNOW_MAX = 4200; // (2600 without a digest in practice: the brief, the folder, the notes' names)
  const DIGEST_MAX = 1800;
  let know = ''; let knowAt = 0;
  async function knowledge({ fresh = false } = {}) {
    if (know && !fresh && Date.now() - knowAt < 300000) return know;
    const brief = String(await kv.get('forge-brief', DEFAULT_BRIEF).catch(() => DEFAULT_BRIEF) || DEFAULT_BRIEF).trim().slice(0, 1500);
    let notes = [];
    try { notes = (await files()).filter((f) => /\.md$/i.test(f.name)).sort((x, y) => String(x.name).localeCompare(String(y.name))).map((f) => baseName(f.name).replace(/\.md$/i, '')); } catch { /* the folder isn't here */ }
    const dg = await kv.get('forge-digest', null).catch(() => null);
    const digest = dg?.text ? `What the game is, digested from the design notes${dg.at ? ` (${new Date(dg.at).toISOString().slice(0, 10)})` : ''}:\n${String(dg.text).trim().slice(0, DIGEST_MAX)}` : '';
    const head = 'FORGEHEART: the owner\'s own game. You are its chat, inside the Forgeheart window, beside the live game (the ▶ Live game tab). Speak as someone who knows this game; when a question is about its design, numbers or history, read the notes first instead of guessing.';
    const where = `Project folder: ${folder()} (main build ${MAIN_BUILD}).`;
    let list = '';
    if (notes.length) { list = `Design notes (${notes.length}; forge_docs {name} reads one, forge_docs {find: "words"} searches them all): `; const room = KNOW_MAX - head.length - brief.length - digest.length - where.length - list.length - 40; let names = ''; for (const n of notes) { if (names.length + n.length + 2 > room) { names += '…'; break; } names += `${names ? ', ' : ''}${n}`; } list += names; }
    know = [head, brief, digest, where, list].filter(Boolean).join('\n').slice(0, KNOW_MAX);
    knowAt = Date.now();
    return know;
  }
  // ---------- ✦ Digest my notes ----------
  // One AI call (the owner's click): the newest notes first, each from its start, up to DIGEST_IN characters in all;
  // the answer is a plain digest of the game (≤ DIGEST_MAX), kept in kv 'forge-digest' { text, at, notes, by } and
  // carried by knowledge(). The owner can read and edit it.
  const DIGEST_IN = 90000;
  const digestLine = (dg) => (dg?.text ? `Digest: ${dg.text.length} characters from ${dg.notes || '?'} notes, ${timeAgo(dg.at)}${dg.edited ? ' (you edited it)' : ''}.` : 'No digest yet: the chat knows the brief and the notes\' names, and reads a note when it needs one.');
  function digestPrompt(notes) {
    return ['Below are the design notes of one game, newest first. Write a DIGEST of the game for an assistant that will help its maker: so it can talk about the game as someone who knows it.',
      `At most ${DIGEST_MAX} characters, plain text, no Markdown headings. In this order: 1) what the game is and its core loop, in two sentences; 2) its systems, one line each with the real names and key numbers from the notes; 3) where it stands: what changed lately and what is open; 4) the maker's own vocabulary worth knowing.`,
      'Only what the notes say. No praise, no advice.', '',
      ...notes.map((n) => `<note name="${n.name}" changed="${n.changed}">\n${n.text}\n</note>`)].join('\n');
  }
  let digesting = null; // (one digest at a time: the Dashboard's card is rebuilt each time it shows, with a fresh button)
  function makeDigest() { digesting ||= makeDigest0().finally(() => { digesting = null; }); return digesting; }
  async function makeDigest0() {
    const a = forgeAgent() || H.claudeAgent?.() || H.agents().find((x) => x.mode === 'native');
    if (!a) throw Error('Add a native AI in Settings first.');
    const all = (await files()).filter((f) => /\.md$/i.test(f.name)).sort((x, y) => (y.mtime || 0) - (x.mtime || 0));
    if (!all.length) throw Error('No design notes (.md) in the project folder.');
    const per = Math.max(1500, Math.floor(DIGEST_IN / all.length));
    const notes = []; let used = 0;
    for (const f of all) { if (used >= DIGEST_IN) break; const text = String(await window.hub.fs.read(f.path).catch(() => '') || '').slice(0, per); if (!text.trim()) continue; used += text.length; notes.push({ name: baseName(f.name).replace(/\.md$/i, ''), changed: f.mtime ? new Date(f.mtime).toISOString().slice(0, 10) : '', text }); }
    const note = toast(`✦ Reading ${notes.length} notes…`, { timeout: 0 });
    try {
      const r = await window.hub.askOnce({ agentId: a.id, text: digestPrompt(notes), options: { lean: true, helper: true, persona: 'You digest a game\'s design notes into what an assistant needs to know. Plain, exact, no filler.' } });
      if (r?.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: a.id, usage: r.usage, source: 'forge digest' } }));
      const text = r?.ok ? String(r.text || '').trim().slice(0, DIGEST_MAX) : '';
      if (text.length < 80) throw Error(r?.error || 'No digest came back. Try again.');
      await kv.set('forge-digest', { text, at: Date.now(), notes: notes.length, by: a.name });
      await knowledge({ fresh: true });
      toast(`✦ The Forge chat now carries a digest of ${notes.length} notes (${text.length} characters)`, { timeout: 6000 });
      return text;
    } finally { note?.remove?.(); }
  }
  async function editDigest() {
    const dg = await kv.get('forge-digest', null);
    const next = await Modal.prompt('What the chat knows: the digest', { value: dg?.text || '', multiline: true, label: `What Forgeheart is, from your notes (at most ${DIGEST_MAX} characters). The Forge chat gets it with every message. Empty: no digest.` });
    if (next == null) return;
    const text = String(next).trim().slice(0, DIGEST_MAX);
    await kv.set('forge-digest', text ? { ...(dg || {}), text, at: dg?.at || Date.now(), edited: Date.now() } : null);
    await knowledge({ fresh: true });
    toast(text ? 'Digest saved: the Forge chat reads it from its next message' : 'Digest removed', { timeout: 2400 });
  }
  // forge_docs (mcp/forge-game-mcp.js → tools/forge-game.js): the design notes, listed, read or searched
  async function docsTool(args = {}) {
    const all = (await files()).filter((f) => /\.md$/i.test(f.name)).sort((x, y) => (y.mtime || 0) - (x.mtime || 0));
    const nameOf = (f) => baseName(f.name).replace(/\.md$/i, '');
    if (args.find) {
      const q = String(args.find).trim();
      if (q.length < 2) return { ok: false, error: 'find needs at least two characters.' };
      const hits = (await window.hub.fs.search(folder(), q, { match: '\\.md$' })) || [];
      const known = new Set(all.map((f) => String(f.path).toLowerCase())); // (only notes forge_docs {name} can open: the search walks deeper than the list)
      const mine = hits.filter((h) => known.has(String(h.path).toLowerCase()));
      return { ok: true, value: { find: q, notes: mine.slice(0, 20).map((h) => ({ name: nameOf(h), matches: h.count, lines: (h.snippets || []).slice(0, 4).map((s) => String(s.text || '').slice(0, 240)) })), more: mine.length > 20 ? mine.length - 20 : undefined } };
    }
    if (args.name) {
      const want = String(args.name).toLowerCase().replace(/\.md$/, '');
      const f = all.find((x) => nameOf(x).toLowerCase() === want) || all.find((x) => nameOf(x).toLowerCase().includes(want));
      if (!f) return { ok: false, error: `No note named "${args.name}". forge_docs {} lists them.` };
      const text = String(await window.hub.fs.read(f.path) || '');
      const from = Math.max(0, Number(args.offset) || 0); const CAP = 12000;
      return { ok: true, value: { name: nameOf(f), changed: f.mtime ? new Date(f.mtime).toISOString().slice(0, 10) : undefined, length: text.length, offset: from || undefined, text: text.slice(from, from + CAP), more: text.length > from + CAP ? `forge_docs {name: "${nameOf(f)}", offset: ${from + CAP}}` : undefined } };
    }
    return { ok: true, value: { folder: folder(), mainBuild: MAIN_BUILD, brief: String(await kv.get('forge-brief', DEFAULT_BRIEF) || '').slice(0, 1500), notes: all.slice(0, 120).map((f) => ({ name: nameOf(f), changed: f.mtime ? new Date(f.mtime).toISOString().slice(0, 10) : undefined, kb: Math.max(1, Math.round((f.size || 0) / 1024)) })) } };
  }
  // the knowledge rides along with every message of an agent that has the game's tools (engines.js part 'gamebrief')
  if (typeof Native !== 'undefined' && Native.hooks?.options) {
    Native.hooks.options.push((agentId, chat, _raw, _last, options) => { if (options.lean || options.crew) return; const a = H.agent(agentId); if (!a?.gameTools) return; if (know) options.gameBrief = know; if (Date.now() - knowAt > 300000) knowledge().catch(() => {}); /* (a note added since: in the list from the next message) */ });
    knowledge().catch(() => {});
  }
  // ---------- what the game is doing right now, with each message ----------
  // One line added to what the Forge chat is sent (not to what the owner sees in the bubble): the live game's stage,
  // gold, HP, enemies, boss and debug switches, and the tab (and note) the owner is looking at. So "why is this so
  // hard?" needs no forge_status first. Only while the game is up; at most 0.7 s is waited for it.
  const short = (n) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e4 ? `${Math.round(n / 1e3)}k` : String(Math.round(n)));
  function nowLine(st, where = {}) {
    const bits = [];
    if (st && typeof st === 'object') {
      if (st.onTitleScreen) bits.push('on the title screen');
      if (st.stage != null) bits.push(`stage ${st.stage}${st.maxStage != null && st.maxStage !== st.stage ? ` (best ${st.maxStage})` : ''}`);
      if (st.gold != null) bits.push(`gold ${short(Number(st.gold) || 0)}`);
      if (st.hp != null) bits.push(`HP ${Math.round(st.hp)}${st.hpMax != null ? `/${Math.round(st.hpMax)}` : ''}`);
      if (st.dps != null) bits.push(`DPS ${short(Number(st.dps) || 0)}`);
      if (st.enemies != null) { const top = Object.entries(st.byType || {}).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(', '); bits.push(`${st.enemies} enem${st.enemies === 1 ? 'y' : 'ies'}${top ? ` (${top})` : ''}`); }
      if (st.boss) bits.push(`boss: ${typeof st.boss === 'string' ? st.boss : st.boss.name || st.boss.type || 'yes'}`);
      const d = st.debug || {}; const sw = [d.god && 'god', d.oneshot && '1-shot', d.paused && 'paused', d.timeScale != null && d.timeScale !== 1 && `speed ${d.timeScale}×`].filter(Boolean);
      if (sw.length) bits.push(sw.join(', '));
    }
    const tab = where.tab && where.tab !== 'live' ? `the owner is on the ${where.tab} tab${where.doc ? `, reading "${where.doc}"` : ''}` : '';
    if (!bits.length && !tab) return '';
    return `[Forgeheart now: ${[bits.join(' · '), tab].filter(Boolean).join(' | ')}]`.slice(0, 420);
  }
  if (typeof Native !== 'undefined' && Native.hooks?.compose) {
    Native.hooks.compose.push(async (agentId, chat, raw, msg) => {
      const a = H.agent(agentId);
      if (!a?.gameTools || a.dock !== 'forgeheart' || msg?.role !== 'user' || typeof raw !== 'string' || /\[Forgeheart now:/.test(raw)) return undefined;
      let st = null;
      if (typeof ForgeGame !== 'undefined' && ForgeGame.isReady()) { try { const r = await Promise.race([ForgeGame.handleTool('forge_status', {}), new Promise((res) => setTimeout(() => res(null), 700))]); st = r?.ok ? r.value : null; } catch { /* no line */ } }
      const line = nowLine(st, { tab: tabs?.current, doc: tabs?.current === 'docs' && api.openDoc ? baseName(api.openDoc).replace(/\.md$/i, '') : '' });
      return line ? `${raw}\n\n${line}` : undefined;
    });
  }
  // ▶ Live game: the debug game the forge_* tools drive, here in the window (it used to sit beside its own chat elsewhere)
  function liveTab(pane) {
    pane.classList.add('forge-live');
    const box = el('div', { class: 'companion-game forge-live-game' });
    pane.append(box);
    const go = () => { try { ForgeGame.mount(box); } catch (err) { box.append(el('p', { class: 'hint', text: calmError(err) })); } };
    if (typeof ForgeGame !== 'undefined') go(); else if (window.Lazy) Lazy.when('addons', go);
  }
  const showLive = () => { activate('tool:forgeheart'); tabs?.show('live'); };

  // ---------- Builds (player with live reload) ----------
  function buildsTab(pane) {
    const list = el('div', { class: 'build-list' });
    const stage = el('div', { class: 'build-stage' });
    const frameBox = el('div', { class: 'build-frame' });
    const title = el('b', { class: 'build-title', text: 'Pick a build' });
    const live = el('input', { type: 'checkbox', checked: store.get('forge.liveReload', true) });
    const vp = el('select', {}, [['fit', 'Fit window'], ['1920x1080', '1920×1080'], ['1280x720', '1280×720'], ['960x600', 'itch.io embed 960×600'], ['390x844', 'Phone 390×844'], ['1024x768', 'Tablet 1024×768']].map(([v, t]) => el('option', { value: v, text: t, selected: v === store.get('forge.viewport', 'fit') })));
    let view = null;
    let current = null;
    pane.append(el('div', { class: 'build-layout' }, el('div', { class: 'build-side' }, list),
      el('div', { class: 'build-main' },
        el('div', { class: 'three-toolbar' }, title,
          el('label', { class: 'check small', title: 'Reload when the build file changes on disk' }, live, 'Live reload'), vp,
          el('button', { class: 'ghost small', text: '⟳', title: 'Reload', on: { click: () => view?.reload() } }),
          el('button', { class: 'ghost small', text: 'DevTools', title: 'Open the game\'s developer tools (console, performance)', on: { click: () => view?.openDevTools() } }),
          el('button', { class: 'ghost small', text: '📷', title: 'Screenshot', on: { click: shot } }),
          el('button', { class: 'ghost small', text: 'Open in browser', on: { click: () => current && window.hub.fs.open(current) } }),
          el('button', { class: 'ghost small', text: 'Show file', on: { click: () => current && window.hub.fs.reveal(current) } })),
        stage)));
    stage.append(frameBox);
    live.addEventListener('change', () => { store.set('forge.liveReload', live.checked); if (current) watch(); });
    vp.addEventListener('change', () => { store.set('forge.viewport', vp.value); layout(); });
    new ResizeObserver(() => layout()).observe(stage);
    function layout() {
      if (vp.value === 'fit') { Object.assign(frameBox.style, { width: '100%', height: '100%', transform: '' }); return; }
      const [w, h] = vp.value.split('x').map(Number);
      const r = stage.getBoundingClientRect();
      const scale = Math.min(1, (r.width - 20) / w, (r.height - 20) / h);
      Object.assign(frameBox.style, { width: `${w}px`, height: `${h}px`, transform: `scale(${scale})` });
    }
    function watch() {
      window.hub.fs.unwatch('forge-build');
      if (live.checked && current) window.hub.fs.watch('forge-build', current);
    }
    window.hub.fs.onChanged((ev) => {
      if (ev.id === 'forge-build' && view) { view.reload(); toast('Build changed on disk, reloaded', { timeout: 1500 }); }
    });
    async function shot() {
      if (!view) return;
      const img = await view.capturePage();
      const p = await window.hub.saveFile({ defaultPath: `forgeheart-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`, filters: [{ name: 'PNG', extensions: ['png'] }], content: img.toDataURL().split(',')[1], base64: true }).catch(() => null);
      if (p) toast('Screenshot saved', { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } });
    }
    function play(path) {
      current = path;
      title.textContent = baseName(path);
      frameBox.replaceChildren();
      view = el('webview', { attrs: { src: WinMac.fileUrl(path), partition: 'persist:forgeheart-play' } });
      frameBox.append(view);
      layout();
      watch();
      for (const b of list.querySelectorAll('.build-item')) b.classList.toggle('on', b.dataset.path === path);
    }
    async function load() {
      const all = (await files()).filter((f) => /\.html$/i.test(f.name) && !isBackup(f.name)).sort((a, b) => b.mtime - a.mtime);
      list.replaceChildren(el('div', { class: 'lib-group', text: `${all.length} builds` }), ...all.map((f) => el('button', {
        class: `build-item${f.name === MAIN_BUILD ? ' main' : ''}`, dataset: { path: f.path }, title: f.path, on: { click: () => play(f.path) },
      }, el('b', { text: f.name === MAIN_BUILD ? `★ ${f.name}` : f.name }), el('span', { class: 'hint', text: `${fmtBytes(f.size)} · ${timeAgo(f.mtime)}` }))));
      if (!current) { const main = all.find((f) => f.name === MAIN_BUILD) || all[0]; if (main) play(main.path); }
    }
    load();
    api.play = play;
  }

  // ---------- Docs ----------
  function docsTab(pane) {
    const search = el('input', { type: 'search', placeholder: 'Search inside all docs…' });
    const list = el('div', { class: 'doc-list' });
    const viewer = el('div', { class: 'doc-viewer' });
    let docs = [];
    let selected = new Set();
    let open = null;
    pane.append(el('div', { class: 'doc-layout' },
      el('div', { class: 'doc-side' }, search,
        el('div', { class: 'row' },
          el('button', { class: 'ghost small', text: 'Send selected to Claude', on: { click: sendSelected } }),
          el('button', { class: 'ghost small', text: 'Find checklists → tasks', on: { click: importChecklists } }),
          el('button', { class: 'ghost small', text: '＋ New doc', on: { click: newDoc } })), list),
      viewer));
    async function load() {
      docs = (await files()).filter((f) => /\.md$/i.test(f.name)).sort((a, b) => b.mtime - a.mtime);
      render();
    }
    async function render(hits) {
      const rows = hits || docs.map((d) => ({ ...d }));
      list.replaceChildren(...rows.map((d) => el('div', { class: `doc-item${open === d.path ? ' on' : ''}` },
        el('input', { type: 'checkbox', checked: selected.has(d.path), title: 'Select for "Send to Claude"', on: { change: (e) => { if (e.target.checked) selected.add(d.path); else selected.delete(d.path); } } }),
        el('div', { class: 'doc-text', on: { click: () => show(d.path) } }, el('b', { text: pretty(d.name) }),
          el('span', { class: 'hint', text: d.count ? `${d.count} match${d.count > 1 ? 'es' : ''} · ${d.snippets[0]?.text || ''}` : `${timeAgo(d.mtime)} · ${fmtBytes(d.size)}` })))));
    }
    const doSearch = debounce(async () => {
      const q = search.value.trim();
      if (q.length < 2) { render(); return; }
      render(await window.hub.fs.search(folder(), q, { match: '\\.md$' }));
    }, 250);
    search.addEventListener('input', doSearch);
    async function show(path, edit = false) {
      open = path; api.openDoc = path; // (round 183) the Forge chat is told which note is on screen
      const text = await window.hub.fs.read(path);
      render();
      const body = el('div', { class: 'doc-body body', html: renderMarkdown(text) });
      let editor = null;
      const editBtn = el('button', { class: 'ghost small', text: edit ? 'Preview' : 'Edit' });
      const saveBtn = el('button', { class: 'primary small', text: 'Save', hidden: !edit });
      viewer.replaceChildren(el('div', { class: 'three-toolbar' }, el('b', { text: baseName(path) }), el('span', { class: 'spacer' }), editBtn, saveBtn,
        el('button', { class: 'ghost small', text: 'Ask Claude about this', on: { click: () => forgeChat(`<doc name="${baseName(path)}">\n${text}\n</doc>`) } }),
        el('button', { class: 'ghost small', text: 'Copy', on: { click: () => copyText(text, 'Doc copied') } }),
        el('button', { class: 'ghost small', text: 'Show file', on: { click: () => window.hub.fs.reveal(path) } })), body);
      const toEdit = () => {
        body.replaceWith(editor = el('textarea', { class: 'doc-edit', value: text, spellcheck: true }));
        editBtn.textContent = 'Preview'; saveBtn.hidden = false;
      };
      editBtn.addEventListener('click', () => {
        if (editor) { body.innerHTML = renderMarkdown(editor.value); editor.replaceWith(body); editor = null; editBtn.textContent = 'Edit'; saveBtn.hidden = true; } else toEdit();
      });
      saveBtn.addEventListener('click', async () => { await window.hub.fs.write(path, editor.value); toast('Saved', { timeout: 1200 }); load(); });
      if (edit) toEdit();
    }
    async function sendSelected() {
      if (!selected.size) { toast('Tick some docs first', { type: 'error' }); return; }
      const parts = await Promise.all([...selected].map(async (p) => `<doc name="${baseName(p)}">\n${await window.hub.fs.read(p)}\n</doc>`));
      forgeChat(parts.join('\n\n'));
    }
    async function newDoc() {
      const name = await Modal.prompt('New doc', { value: `NOTES_${new Date().toISOString().slice(0, 10)}.md` });
      if (!name) return;
      const path = join(folder(), name.endsWith('.md') ? name : `${name}.md`);
      if (await window.hub.fs.stat(path)) { toast('A file with that name exists', { type: 'error' }); return; }
      await window.hub.fs.write(path, `# ${pretty(name)}\n\n`);
      await load();
      show(path, true);
    }
    async function importChecklists() {
      const found = [];
      for (const d of docs) {
        const text = await window.hub.fs.read(d.path);
        for (const m of text.matchAll(/^\s*[-*] \[ \] (.+)$/gm)) found.push({ title: m[1].trim(), doc: d.name });
      }
      const existing = new Set((await kv.get('forge-tasks', [])).map((t) => t.title.toLowerCase()));
      const fresh = found.filter((f) => !existing.has(f.title.toLowerCase()));
      if (!fresh.length) { toast(found.length ? 'All unchecked items are already tasks' : 'No "- [ ]" checklist items found in the docs'); return; }
      api.importTasks?.(fresh.map((f) => ({ title: f.title, notes: `From ${f.doc}` })), 'Checklist items from docs');
    }
    load();
  }

  // ---------- Miro boards ----------
  function boardTab(pane) {
    let boards = [];
    const select = el('select');
    const webHost = el('div', { class: 'board-web' });
    let web = null;
    pane.append(el('div', { class: 'three-toolbar' }, select,
      el('button', { class: 'ghost small', text: '＋ Add board', on: { click: addBoard } }),
      el('button', { class: 'ghost small', text: 'Remove', on: { click: removeBoard } }),
      el('span', { class: 'spacer' }),
      el('button', { class: 'ghost small', text: 'Summarize with Claude', on: { click: () => boardAsk('Summarize this Miro board: its main sections, the key rules/formulas, and anything that looks unfinished or contradictory.') } }),
      el('button', { class: 'ghost small', text: 'Board → task list', on: { click: () => boardAsk('Read this Miro board and turn every open question, TODO or unfinished area into a Markdown checklist ("- [ ] …"), grouped by area. I will paste it into my task board.') } }),
      el('button', { class: 'ghost small', text: 'Check build vs board', on: { click: () => boardAsk('Read this Miro board (the game manual) and list the rules, numbers or systems I should double-check in the current build, as a checklist.') } })), webHost);
    function current() { return boards[Number(select.value)] || boards[0]; }
    function showBoard() {
      const b = current();
      if (!b) return;
      store.set('forge.board', select.value);
      if (!web) web = WebPane(webHost, { url: b.url, partition: 'persist:miro', zoomKey: 'miro' });
      else web.view.loadURL(b.url);
    }
    function renderSelect() {
      select.replaceChildren(...boards.map((b, i) => el('option', { value: i, text: b.name, selected: String(i) === String(store.get('forge.board', 0)) })));
    }
    async function addBoard() {
      const v = await Modal.form('Add a Miro board', [{ name: 'name', label: 'Name', value: '' }, { name: 'url', label: 'Board link (https://miro.com/app/board/…)', value: '' }], { ok: 'Add' });
      if (!v || !/^https:\/\/miro\.com\/app\/board\//.test(v.url)) { if (v) toast('That isn\'t a Miro board link', { type: 'error' }); return; }
      boards.push({ name: v.name || 'Board', url: v.url });
      await kv.set('forge-boards', boards);
      store.set('forge.board', boards.length - 1);
      renderSelect(); showBoard();
    }
    async function removeBoard() {
      const b = current();
      if (!b || !(await Modal.confirm('Remove board?', `"${b.name}" will be removed from this list (not from Miro).`, { ok: 'Remove' }))) return;
      boards = boards.filter((x) => x !== b);
      await kv.set('forge-boards', boards);
      store.set('forge.board', 0);
      renderSelect(); showBoard();
    }
    // Claude reads boards through the Miro connector, so make sure it's switched on (read-only).
    async function boardAsk(task) {
      const agent = H.claudeAgent();
      if (!agent) { toast('Add a native Claude agent first', { type: 'error' }); return; }
      if (agent.engine === 'claude' && !agent.connectors?.['claude.ai Miro']) {
        const ok = await Modal.confirm('Let Claude read Miro?', `${agent.name} needs the Miro connector to read boards. Turn it on in read-only mode? (You can change it later in the agent's settings.)`, { ok: 'Turn on read-only' });
        if (!ok) return;
        const a = H.config.agents.find((x) => x.id === agent.id);
        a.connectors = { ...a.connectors, 'claude.ai Miro': 'read' };
        await saveConfig();
        if (!(await window.hub.getConnectors())) await window.hub.refreshConnectors();
      }
      const b = current();
      askClaude(`${task}\n\nBoard: ${b.name}\n${b.url}\n\nUse the Miro tools to read it.`);
    }
    select.addEventListener('change', showBoard);
    (async () => {
      boards = await kv.get('forge-boards', null);
      if (!boards) { boards = DEFAULT_BOARDS; await kv.set('forge-boards', boards); }
      renderSelect();
      showBoard();
    })();
  }

  // ---------- Tasks (kanban) ----------
  function tasksTab(pane) {
    const COLS = [['backlog', 'Backlog'], ['todo', 'To do'], ['doing', 'Doing'], ['done', 'Done']];
    const TAGS = ['feature', 'bug', 'balance', 'ux', 'art', 'perf', 'release'];
    let tasks = [];
    let filterTag = '';
    const search = el('input', { type: 'search', placeholder: 'Filter tasks…' });
    const tagSel = el('select', {}, el('option', { value: '', text: 'All tags' }), TAGS.map((t) => el('option', { value: t, text: t })));
    const board = el('div', { class: 'kanban' });
    pane.append(el('div', { class: 'three-toolbar' }, search, tagSel,
      el('button', { class: 'ghost small', text: 'Paste a checklist…', title: 'Turn "- [ ] item" lines (e.g. from Claude) into tasks', on: { click: pasteChecklist } }),
      el('button', { class: 'ghost small', text: 'Clear done', on: { click: clearDone } }),
      el('span', { class: 'spacer' }), el('span', { class: 'hint', text: 'Drag cards between columns · double-click to edit' })), board);
    const save = () => kv.set('forge-tasks', tasks);
    function render() {
      const q = search.value.toLowerCase();
      const visible = tasks.filter((t) => (!filterTag || t.tag === filterTag) && (!q || `${t.title} ${t.notes || ''}`.toLowerCase().includes(q)));
      board.replaceChildren(...COLS.map(([id, label]) => {
        const items = visible.filter((t) => t.col === id).sort((a, b) => (a.priority || 2) - (b.priority || 2) || a.order - b.order);
        const add = el('input', { class: 'kanban-add', placeholder: '＋ Add a task (Enter)' });
        add.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' || !add.value.trim()) return;
          const m = add.value.match(/#(\w+)/);
          tasks.push({ id: `t${Date.now()}`, title: add.value.replace(/#\w+/, '').trim(), col: id, tag: TAGS.includes(m?.[1]) ? m[1] : '', priority: 2, order: Date.now(), createdAt: Date.now(), doneAt: id === 'done' ? Date.now() : undefined });
          save(); render();
          board.querySelector(`[data-col="${id}"] .kanban-add`)?.focus();
        });
        const col = el('div', { class: 'kanban-col', dataset: { col: id } }, el('div', { class: 'kanban-head' }, el('b', { text: label }), el('span', { class: 'hint', text: items.length })), add,
          el('div', { class: 'kanban-cards' }, items.map(cardEl)));
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
        col.addEventListener('dragleave', () => col.classList.remove('over'));
        col.addEventListener('drop', (e) => {
          e.preventDefault();
          col.classList.remove('over');
          const t = tasks.find((x) => x.id === e.dataTransfer.getData('text/task'));
          if (!t) return;
          t.col = id;
          t.order = Date.now();
          t.doneAt = id === 'done' ? Date.now() : undefined;
          save(); render();
        });
        return col;
      }));
    }
    function cardEl(t) {
      const card = el('div', { class: `kanban-card p${t.priority || 2}`, draggable: true },
        el('div', { class: 'kanban-title', text: t.title }),
        el('div', { class: 'kanban-meta' },
          t.tag ? el('span', { class: `tag tag-${t.tag}`, text: t.tag }) : null,
          t.priority === 1 ? el('span', { class: 'tag hot', text: 'P1' }) : null,
          t.due ? el('span', { class: `hint${new Date(t.due) < new Date() && t.col !== 'done' ? ' bad' : ''}`, text: `due ${t.due}` }) : null,
          t.notes ? el('span', { class: 'hint', text: '📝' }) : null));
      card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/task', t.id); card.classList.add('dragging'); });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
      card.addEventListener('dblclick', () => edit(t));
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showMenu(e.clientX, e.clientY, [
          { label: 'Edit…', action: () => edit(t) },
          ...COLS.filter(([id]) => id !== t.col).map(([id, label]) => ({ label: `Move to ${label}`, action: () => { t.col = id; t.doneAt = id === 'done' ? Date.now() : undefined; save(); render(); } })),
          { label: 'Ask Claude how to do this', action: () => forgeChat(`Task: ${t.title}${t.notes ? `\nNotes: ${t.notes}` : ''}\n\nHow should I approach this in the build?`) },
          { label: 'Delete', danger: true, action: () => { tasks = tasks.filter((x) => x !== t); save(); render(); } },
        ]);
      });
      return card;
    }
    async function edit(t) {
      const v = await Modal.form('Edit task', [
        { name: 'title', label: 'Title', value: t.title },
        { name: 'tag', label: 'Tag', type: 'select', value: t.tag || '', options: [{ value: '', label: '(none)' }, ...TAGS] },
        { name: 'priority', label: 'Priority', type: 'select', value: String(t.priority || 2), options: [{ value: '1', label: 'P1 (urgent)' }, { value: '2', label: 'P2 (normal)' }, { value: '3', label: 'P3 (later)' }] },
        { name: 'due', label: 'Due date', type: 'date', value: t.due || '' },
        { name: 'notes', label: 'Notes', type: 'textarea', value: t.notes || '' }], { ok: 'Save' });
      if (!v) return;
      Object.assign(t, { title: v.title.trim() || t.title, tag: v.tag, priority: Number(v.priority), due: v.due || undefined, notes: v.notes });
      save(); render();
    }
    async function clearDone() {
      const n = tasks.filter((t) => t.col === 'done').length;
      if (!n || !(await Modal.confirm('Clear done tasks?', `${n} done task(s) will be removed. Patch notes made later won't include them.`, { ok: 'Clear' }))) return;
      tasks = tasks.filter((t) => t.col !== 'done');
      save(); render();
    }
    async function pasteChecklist() {
      const text = await Modal.prompt('Paste a checklist', { multiline: true, label: 'Lines like "- [ ] Fix rift timer" (or plain lines) become To-do tasks. "- [x]" lines go to Done.' });
      if (!text) return;
      const items = text.split('\n').map((l) => l.match(/^\s*(?:[-*]\s*)?(\[( |x)\]\s*)?(.+)$/i)).filter((m) => m && m[3].trim() && !/^#/.test(m[3]))
        .map((m) => ({ title: m[3].trim(), done: m[2]?.toLowerCase() === 'x' }));
      importTasks(items, null);
    }
    async function importTasks(items, title) {
      let chosen = items;
      if (title) {
        const v = await Modal.form(title, items.slice(0, 60).map((it, i) => ({ name: `i${i}`, label: `${it.title}${it.notes ? ` (${it.notes})` : ''}`, type: 'checkbox', value: true })), { ok: 'Add as tasks' });
        if (!v) return;
        chosen = items.slice(0, 60).filter((_, i) => v[`i${i}`]);
      }
      const now = Date.now();
      chosen.forEach((it, i) => tasks.push({ id: `t${now}${i}`, title: it.title, notes: it.notes || '', col: it.done ? 'done' : 'todo', priority: 2, order: now + i, createdAt: now, doneAt: it.done ? now : undefined }));
      save(); render();
      toast(`Added ${chosen.length} task(s)`);
    }
    search.addEventListener('input', render);
    tagSel.addEventListener('change', () => { filterTag = tagSel.value; render(); });
    (async () => { tasks = await kv.get('forge-tasks', []); render(); })();
    api.reloadTasks = async () => { tasks = await kv.get('forge-tasks', []); render(); };
    api.importTasks = (items, title) => { tabs.show('tasks'); importTasks(items, title); };
  }

  // ---------- Patch notes ----------
  function patchTab(pane) {
    const since = el('input', { type: 'date' });
    const sources = el('div', { class: 'patch-sources' });
    const out = el('textarea', { class: 'patch-out', spellcheck: true });
    pane.append(el('div', { class: 'patch-layout' },
      el('div', { class: 'patch-left' }, el('h3', { text: '1 · Pick what goes in' }), el('label', {}, 'Changes since', since), sources,
        el('button', { class: 'primary small', text: 'Build draft →', on: { click: build } })),
      el('div', { class: 'patch-right' }, el('h3', { text: '2 · Edit and ship' }), out,
        el('div', { class: 'row' },
          el('button', { class: 'ghost small', text: 'Copy', on: { click: () => copyText(out.value, 'Patch notes copied') } }),
          el('button', { class: 'ghost small', text: 'Save to project…', on: { click: saveNotes } }),
          el('button', { class: 'primary small', text: 'Polish with Claude', on: { click: () => askClaude(`Turn these raw Forgeheart notes into player-facing itch.io patch notes grouped under New, Changes, Balance and Fixes. Keep numbers exact, drop internal jargon, keep it scannable.\n\n${out.value}`) } }),
          el('button', { class: 'ghost small', text: 'Preview', on: { click: () => { Modal.confirm('Preview', ''); const d = document.querySelector('dialog.ui-modal:last-of-type'); d.querySelector('.modal-text').replaceWith(el('div', { class: 'body patch-preview', html: renderMarkdown(out.value) })); } } })))));
    let docs = [];
    let tasks = [];
    async function load() {
      const zips = (await files()).filter((f) => /\.zip$/i.test(f.name)).sort((a, b) => b.mtime - a.mtime);
      if (!since.value) since.value = new Date(zips[0]?.mtime || Date.now() - 14 * 864e5).toLocaleDateString('en-CA');
      const from = new Date(`${since.value}T00:00`).getTime();
      docs = (await files()).filter((f) => /\.md$/i.test(f.name) && f.mtime >= from && !/^PATCH_NOTES_/i.test(f.name)).sort((a, b) => a.mtime - b.mtime);
      tasks = (await kv.get('forge-tasks', [])).filter((t) => t.col === 'done' && (t.doneAt || 0) >= from);
      sources.replaceChildren(
        el('div', { class: 'lib-group', text: `Docs changed (${docs.length})` }),
        ...docs.map((d) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: true, dataset: { path: d.path } }), `${pretty(d.name)} `, el('span', { class: 'hint', text: timeAgo(d.mtime) }))),
        el('div', { class: 'lib-group', text: `Tasks done (${tasks.length})` }),
        ...tasks.map((t) => el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: true, dataset: { task: t.id } }), t.title)));
    }
    since.addEventListener('change', load);
    async function build() {
      const picked = [...sources.querySelectorAll('input[data-path]:checked')].map((i) => i.dataset.path);
      const pickedTasks = new Set([...sources.querySelectorAll('input[data-task]:checked')].map((i) => i.dataset.task));
      const date = new Date().toISOString().slice(0, 10);
      let md = `# Forgeheart update (${date})\n\n`;
      for (const p of picked) {
        const text = await window.hub.fs.read(p);
        const bullets = text.split('\n').filter((l) => /^\s*[-*]\s+\S/.test(l) && !/\[ \]/.test(l)).slice(0, 10).map((l) => l.trim().replace(/^\*/, '-').replace(/\[x\]\s*/i, ''));
        md += `## ${pretty(baseName(p))}\n\n${bullets.length ? bullets.join('\n') : `- ${text.split('\n').find((l) => l.trim() && !l.startsWith('#'))?.trim() || 'See notes'}`}\n\n`;
      }
      const done = tasks.filter((t) => pickedTasks.has(t.id));
      if (done.length) md += `## Done\n\n${done.map((t) => `- ${t.title}`).join('\n')}\n`;
      out.value = md;
      store.set('forge.patchDraft', md);
    }
    async function saveNotes() {
      const name = `PATCH_NOTES_${new Date().toISOString().slice(0, 10)}.md`;
      const path = join(folder(), name);
      if (await window.hub.fs.stat(path) && !(await Modal.confirm('Overwrite?', `${name} already exists.`, { ok: 'Overwrite' }))) return;
      await window.hub.fs.write(path, out.value);
      toast(`Saved ${name}`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(path) } });
    }
    out.addEventListener('input', debounce(() => store.set('forge.patchDraft', out.value), 500));
    out.value = store.get('forge.patchDraft', '');
    load();
  }

  // ---------- Release ----------
  const DEFAULT_CHECKS = ['Play the main build start to finish', 'No errors in the console (DevTools)', 'Update the version / build label in game', 'Write patch notes',
    'Package the zip (index.html at the root)', 'Upload to itch.io (Edit game → Uploads → "played in the browser")', 'Check the embed size and fullscreen button on itch', 'Post a devlog'];
  function releaseTab(pane) {
    const buildSel = el('select');
    const label = el('input', { value: new Date().toISOString().slice(0, 10) });
    const result = el('div');
    const checklist = el('div', { class: 'checklist' });
    const history = el('div');
    pane.append(el('div', { class: 'release-layout' },
      el('div', { class: 'calc-card' }, el('h3', { text: 'Package for itch.io' }),
        el('label', {}, 'Build', buildSel), el('label', {}, 'Release label', label),
        el('p', { class: 'hint', text: 'Copies the build into a zip as index.html (what itch.io HTML games need), named like your earlier releases.' }),
        el('button', { class: 'primary small', text: 'Create zip', on: { click: pack } }), result),
      el('div', { class: 'calc-card' }, el('h3', { text: 'Release checklist' }), checklist,
        el('div', { class: 'row' }, el('button', { class: 'ghost small', text: '＋ Add step', on: { click: addStep } }), el('button', { class: 'ghost small', text: 'Reset ticks', on: { click: resetTicks } }))),
      el('div', { class: 'calc-card' }, el('h3', { text: 'Past releases' }), history)));
    let state = { steps: DEFAULT_CHECKS, done: {} };
    const save = () => kv.set('forge-release', state);
    function renderChecks() {
      const doneCount = state.steps.filter((s) => state.done[s]).length;
      checklist.replaceChildren(el('div', { class: 'bar' }, el('span', { style: { width: `${(doneCount / state.steps.length) * 100}%` } })),
        ...state.steps.map((s) => el('label', { class: `check${state.done[s] ? ' done' : ''}` },
          el('input', { type: 'checkbox', checked: Boolean(state.done[s]), on: { change: (e) => { state.done[s] = e.target.checked; save(); renderChecks(); } } }), s,
          el('button', { class: 'msg-act', text: '×', title: 'Remove step', on: { click: (e) => { e.preventDefault(); state.steps = state.steps.filter((x) => x !== s); save(); renderChecks(); } } }))));
    }
    async function addStep() { const s = await Modal.prompt('Add a checklist step'); if (s) { state.steps.push(s.trim()); save(); renderChecks(); } }
    function resetTicks() { state.done = {}; save(); renderChecks(); }
    async function load() {
      const all = await files();
      const top = all.filter((f) => !f.path.slice(folder().length + 1).match(/[\\/]/));
      const builds = top.filter((f) => /\.html$/i.test(f.name) && !isBackup(f.name)).sort((a, b) => b.mtime - a.mtime);
      buildSel.replaceChildren(...builds.map((b) => el('option', { value: b.path, text: `${b.name} (${fmtBytes(b.size)}, ${timeAgo(b.mtime)})`, selected: b.name === MAIN_BUILD })));
      const zips = top.filter((f) => /\.zip$/i.test(f.name)).sort((a, b) => b.mtime - a.mtime);
      history.replaceChildren(...(zips.length ? zips.map((z) => el('div', { class: 'render-row' }, el('div', { class: 'render-name' }, el('b', { text: z.name }), el('span', { class: 'hint', text: `${fmtBytes(z.size)} · ${fmtDate(z.mtime)}` })),
        el('button', { class: 'ghost small', text: 'Show', on: { click: () => window.hub.fs.reveal(z.path) } }))) : [el('p', { class: 'hint', text: 'No zips yet.' })]));
      state = await kv.get('forge-release', state);
      renderChecks();
    }
    async function pack() {
      const build = buildSel.value;
      if (!build) return;
      const out = join(folder(), `FORGEHEART_itch_release_${label.value.trim().replace(/[^\w.-]+/g, '_')}.zip`);
      if (await window.hub.fs.stat(out) && !(await Modal.confirm('Overwrite?', `${baseName(out)} already exists.`, { ok: 'Overwrite' }))) return;
      result.replaceChildren(el('p', { class: 'hint', text: 'Zipping…' }));
      try {
        const r = await window.hub.fs.zip([{ path: build, name: 'index.html' }], out);
        result.replaceChildren(el('p', {}, '✅ ', el('b', { text: baseName(r.path) }), ` · ${fmtBytes(r.size)}`),
          el('div', { class: 'row' }, el('button', { class: 'ghost small', text: 'Show zip', on: { click: () => window.hub.fs.reveal(r.path) } }),
            el('button', { class: 'ghost small', text: 'Open itch.io dashboard', on: { click: () => window.hub.openExternal('https://itch.io/dashboard') } })));
        state.done['Package the zip (index.html at the root)'] = true;
        save(); renderChecks(); load();
      } catch (err) { result.replaceChildren(el('p', { class: 'bad', text: calmError(err, { what: 'The zip' }) })); } // (round 45, errorcalm)
    }
    load();
  }

  // ---------- Balance CSV ----------
  function parseCsv(text) {
    const rows = [];
    let row = []; let cell = ''; let inQ = false;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') inQ = false; else cell += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i += 1;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.filter((r) => r.length > 1 || r[0] !== '');
  }
  const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  function balanceTab(pane) {
    const fileSel = el('select');
    const filter = el('input', { type: 'search', placeholder: 'Filter rows…' });
    const stats = el('div', { class: 'csv-stats' });
    const box = el('div', { class: 'csv-box' });
    const dirty = el('span', { class: 'hint' });
    let header = []; let rows = []; let original = ''; let table = null; let path = null;
    pane.append(el('div', { class: 'three-toolbar' }, fileSel, filter,
      el('button', { class: 'ghost small', text: '＋ Row', on: { click: () => { rows.push(Object.fromEntries(header.map((h) => [h, '']))); mark(); show(); } } }),
      el('button', { class: 'primary small', text: 'Save', on: { click: save } }),
      el('button', { class: 'ghost small', text: 'Revert', on: { click: () => open(path) } }),
      el('button', { class: 'ghost small', text: 'Ask Claude about balance', on: { click: () => forgeChat(`Here is my balance table ${baseName(path || '')}:\n\n\`\`\`csv\n${toCsv()}\n\`\`\`\n\n`) } }),
      dirty), stats, box);
    const isNum = (h) => rows.length && rows.every((r) => r[h] === '' || !Number.isNaN(Number(r[h])));
    function toCsv() { return [header.join(','), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(','))].join('\n'); }
    function mark() { dirty.textContent = toCsv() === original ? '' : '● unsaved changes'; }
    function show() {
      const q = filter.value.toLowerCase();
      const visible = rows.filter((r) => !q || header.some((h) => String(r[h]).toLowerCase().includes(q)));
      const numCols = header.filter(isNum);
      const columns = [...header.map((h) => ({ key: h, label: h, num: numCols.includes(h) })),
        { key: '_del', label: '', render: (r) => el('button', { class: 'msg-act', text: '×', title: 'Delete row', on: { click: (e) => { e.stopPropagation(); rows = rows.filter((x) => x !== r); mark(); show(); } } }) }];
      box.replaceChildren();
      table = DataTable(box, { columns, rows: visible, editable: true, onEdit: () => { mark(); renderStats(numCols, visible); } });
      renderStats(numCols, visible);
    }
    function renderStats(numCols, visible) {
      stats.replaceChildren(...numCols.slice(0, 12).map((h) => {
        const vals = visible.map((r) => r[h]).filter((v) => v !== '' && !Number.isNaN(Number(v))).map(Number);
        if (!vals.length) return null;
        const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
        return el('div', { class: 'stat' }, el('span', { text: h }), el('b', { text: `${Math.min(...vals)} – ${Math.max(...vals)}` }), el('span', { class: 'hint', text: `avg ${avg.toFixed(2)}` }));
      }));
    }
    async function open(p) {
      path = p;
      original = (await window.hub.fs.read(p)).replace(/\r\n/g, '\n').replace(/\n$/, '');
      const parsed = parseCsv(original);
      header = parsed[0] || [];
      rows = parsed.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] !== undefined && r[i] !== '' && !Number.isNaN(Number(r[i])) ? Number(r[i]) : r[i] ?? ''])));
      original = toCsv();
      mark();
      show();
    }
    async function save() {
      if (!path) return;
      await window.hub.fs.write(path, `${toCsv()}\n`);
      original = toCsv();
      mark();
      toast('CSV saved', { timeout: 1200 });
    }
    filter.addEventListener('input', debounce(show, 200));
    fileSel.addEventListener('change', () => open(fileSel.value));
    (async () => {
      const csvs = (await files()).filter((f) => /\.csv$/i.test(f.name)).sort((a, b) => b.mtime - a.mtime);
      fileSel.replaceChildren(...csvs.map((f) => el('option', { value: f.path, text: f.name })));
      if (csvs[0]) open(csvs[0].path); else box.append(el('p', { class: 'hint', text: 'No CSV files in the project folder.' }));
    })();
  }

  // ---------- Backups ----------
  function backupsTab(pane) {
    const keep = el('input', { type: 'number', value: store.get('forge.keepBackups', 5), min: 0, class: 'kit-num' });
    const summary = el('div', { class: 'backup-summary' });
    const groupsBox = el('div');
    const diffBox = el('div', { class: 'diff-box' });
    const aSel = el('select'); const bSel = el('select');
    let backups = []; let builds = [];
    pane.append(el('div', { class: 'backup-layout' },
      el('div', { class: 'calc-card' }, el('h3', { text: 'Clean up backups' }),
        el('div', { class: 'row' }, 'Keep the newest', keep, 'backups of each build'),
        summary,
        el('button', { class: 'primary small', text: 'Move the rest to the Recycle Bin', on: { click: clean } }),
        el('p', { class: 'hint', text: 'Nothing is deleted for good: everything goes to the Recycle Bin, where you can restore it.' }), groupsBox),
      el('div', { class: 'calc-card' }, el('h3', { text: 'Compare two versions' }),
        el('div', { class: 'row' }, aSel, '→', bSel, el('button', { class: 'primary small', text: 'Compare', on: { click: compare } })),
        el('p', { class: 'hint', text: 'Line-by-line diff of two builds or backups (lines over 400 characters are shortened).' }), diffBox)));
    keep.addEventListener('input', () => { store.set('forge.keepBackups', Number(keep.value)); plan(); });
    const groupOf = (name) => name.split('.')[0];
    function plan() {
      const groups = new Map();
      for (const b of backups) { const g = groupOf(b.name); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(b); }
      const n = Math.max(0, Number(keep.value) || 0);
      const toTrash = [];
      for (const list of groups.values()) { list.sort((x, y) => y.mtime - x.mtime); toTrash.push(...list.slice(n)); }
      const bytes = toTrash.reduce((s, b) => s + b.size, 0);
      summary.replaceChildren(el('p', {}, el('b', { text: backups.length }), ` backups (${fmtBytes(backups.reduce((s, b) => s + b.size, 0))}). Cleaning moves `, el('b', { text: toTrash.length }), ` files and frees `, el('b', { text: fmtBytes(bytes) }), '.'));
      groupsBox.replaceChildren(...[...groups].map(([g, list]) => el('details', { class: 'model-section' }, el('summary', { text: `${g} · ${list.length} backups · ${fmtBytes(list.reduce((s, b) => s + b.size, 0))}` }),
        ...list.map((b, i) => el('div', { class: `render-row${i >= n ? ' faded' : ''}` }, el('div', { class: 'render-name' }, el('span', { text: b.name.replace(`${g}.`, '').replace('.bak.html', '') }), el('span', { class: 'hint', text: `${fmtDate(b.mtime)} · ${fmtBytes(b.size)}${i >= n ? ' · will be recycled' : ''}` })),
          el('button', { class: 'ghost small', text: 'Compare to current', on: { click: () => { aSel.value = b.path; bSel.value = builds.find((x) => groupOf(x.name) === g)?.path || bSel.value; compare(); } } }),
          el('button', { class: 'ghost small', text: 'Restore…', on: { click: () => restore(b, g) } }))))));
      return toTrash;
    }
    async function clean() {
      const toTrash = plan();
      if (!toTrash.length) { toast('Nothing to clean'); return; }
      if (!(await Modal.confirm('Recycle old backups?', `${toTrash.length} files (${fmtBytes(toTrash.reduce((s, b) => s + b.size, 0))}) go to the Recycle Bin. The newest ${keep.value} of each build stay.`, { ok: 'Move to Recycle Bin' }))) return;
      toast('Moving backups to the Recycle Bin…', { timeout: 2500 });
      const r = await window.hub.fs.trash(toTrash.map((b) => b.path));
      toast(`Recycled ${r.done.length} backups${r.failed.length ? `, ${r.failed.length} failed` : ''}`, { type: r.failed.length ? 'error' : 'info' });
      load();
    }
    async function restore(b, g) {
      const target = builds.find((x) => groupOf(x.name) === g);
      if (!target) { toast('No current build to restore over', { type: 'error' }); return; }
      if (!(await Modal.confirm('Restore this backup?', `${target.name} will be replaced by the backup from ${fmtDate(b.mtime)}. The current file goes to the Recycle Bin first.`, { ok: 'Restore', danger: true }))) return;
      await window.hub.fs.trash([target.path]);
      await window.hub.fs.copy(b.path, target.path);
      toast(`Restored ${target.name}`);
      load();
    }
    async function compare() {
      if (!aSel.value || !bSel.value || aSel.value === bSel.value) { toast('Pick two different files', { type: 'error' }); return; }
      diffBox.replaceChildren(el('p', { class: 'hint', text: 'Comparing… (large builds take a few seconds)' }));
      const d = await window.hub.fs.diff(aSel.value, bSel.value);
      if (d.tooBig) { diffBox.replaceChildren(el('p', { class: 'hint', text: `Too many differences to show (${d.linesA} vs ${d.linesB} lines).` })); return; }
      if (!d.hunks.length) { diffBox.replaceChildren(el('p', { class: 'ok', text: 'These two files are identical.' })); return; }
      diffBox.replaceChildren(el('p', {}, el('b', { class: 'ok', text: `+${d.added}` }), ' ', el('b', { class: 'bad', text: `−${d.removed}` }), ` lines · ${d.hunks.length} change${d.hunks.length > 1 ? 's' : ''}`),
        ...d.hunks.slice(0, 200).map((h) => el('div', { class: 'diff-hunk' }, el('div', { class: 'diff-head', text: `@@ line ${h.startA} → ${h.startB}` }),
          ...h.lines.map(([op, t]) => el('div', { class: `diff-line ${op === '+' ? 'add' : op === '-' ? 'del' : ''}`, text: `${op === '=' ? ' ' : op} ${t}` })))));
    }
    async function load() {
      const top = (await files()).filter((f) => !f.path.slice(folder().length + 1).match(/[\\/]/));
      backups = top.filter((f) => isBackup(f.name));
      builds = top.filter((f) => /\.html$/i.test(f.name) && !isBackup(f.name));
      const opts = [...builds.map((b) => ({ ...b, label: `★ ${b.name}` })), ...[...backups].sort((x, y) => y.mtime - x.mtime).map((b) => ({ ...b, label: `${b.name} (${fmtDate(b.mtime)})` }))];
      for (const sel of [aSel, bSel]) sel.replaceChildren(...opts.map((o) => el('option', { value: o.path, text: o.label })));
      if (backups.length) aSel.value = [...backups].sort((x, y) => y.mtime - x.mtime)[0].path;
      const main = builds.find((b) => b.name === MAIN_BUILD);
      if (main) bSel.value = main.path;
      plan();
    }
    load();
  }

  // ---------- Files & screenshots ----------
  function filesTab(pane) {
    const search = el('input', { type: 'search', placeholder: 'Find files by name, or text inside them (2+ characters)…' });
    const inside = el('input', { type: 'checkbox' });
    const results = el('div');
    const gallery = el('div', { class: 'gallery-grid' });
    pane.append(el('div', { class: 'three-toolbar' }, search, el('label', { class: 'check small' }, inside, 'Search inside files')), results, el('h3', { text: 'Screenshots & images' }), gallery);
    let all = [];
    const run = debounce(async () => {
      const q = search.value.trim();
      if (q.length < 2) { results.replaceChildren(); return; }
      const rows = inside.checked ? await window.hub.fs.search(folder(), q) : all.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())).slice(0, 200);
      results.replaceChildren();
      DataTable(results, {
        columns: [{ key: 'name', label: 'File', render: (r) => el('span', {}, el('b', { text: r.name }), r.snippets ? el('div', { class: 'hint', text: r.snippets[0]?.text }) : null) },
          { key: 'mtime', label: 'Modified', render: (r) => timeAgo(r.mtime) }, { key: 'size', label: 'Size', num: true, render: (r) => fmtBytes(r.size) },
          { key: 'path', label: '', render: (r) => el('span', { class: 'row' }, el('button', { class: 'ghost small', text: 'Open', on: { click: (e) => { e.stopPropagation(); window.hub.fs.open(r.path); } } }), el('button', { class: 'ghost small', text: 'Show', on: { click: (e) => { e.stopPropagation(); window.hub.fs.reveal(r.path); } } })) }],
        rows, empty: 'No matches',
      });
    }, 250);
    search.addEventListener('input', run);
    inside.addEventListener('change', run);
    (async () => {
      all = await files();
      const imgs = all.filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f.name)).sort((a, b) => b.mtime - a.mtime);
      gallery.replaceChildren(...(imgs.length ? imgs.map((f) => el('figure', { class: 'gallery-item-img', title: f.path, on: { click: () => lightbox(f) } },
        el('img', { src: WinMac.fileUrl(f.path), loading: 'lazy' }), el('figcaption', { text: `${f.name} · ${timeAgo(f.mtime)}` }))) : [el('p', { class: 'hint', text: 'No images in the project.' })]));
    })();
    function lightbox(f) {
      const box = el('div', { class: 'lightbox', on: { click: (e) => { if (e.target === box) box.remove(); } } },
        el('img', { src: WinMac.fileUrl(f.path) }),
        el('div', { class: 'row' }, el('b', { text: f.name }),
          el('button', { class: 'ghost small', text: 'Open', on: { click: () => window.hub.fs.open(f.path) } }),
          el('button', { class: 'ghost small', text: 'Show', on: { click: () => window.hub.fs.reveal(f.path) } }),
          el('button', { class: 'ghost small', text: 'Close', on: { click: () => box.remove() } })));
      document.body.append(box);
    }
  }

  // ---------- Devlog ----------
  function devlogTab(pane) {
    const timer = el('div', { class: 'devlog-timer' });
    const listBox = el('div');
    let log = { running: null, entries: [] };
    let tick = null;
    pane.append(el('div', { class: 'release-layout' },
      el('div', { class: 'calc-card' }, el('h3', { text: 'Work session' }), timer),
      el('div', { class: 'calc-card wide' }, el('h3', { text: 'Log' }),
        el('div', { class: 'row' },
          el('button', { class: 'ghost small', text: '＋ Add past session', on: { click: addPast } }),
          el('button', { class: 'ghost small', text: 'Export Markdown…', on: { click: exportMd } }),
          el('button', { class: 'primary small', text: 'Draft itch devlog (last 7 days)', on: { click: draftDevlog } })), listBox)));
    const save = () => kv.set('forge-devlog', log);
    const fmtMin = (m) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;
    function renderTimer() {
      clearInterval(tick);
      if (log.running) {
        const label = el('div', { class: 'devlog-clock' });
        const upd = () => { const s = Math.floor((Date.now() - log.running.start) / 1000); label.textContent = `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };
        upd();
        tick = setInterval(() => { if (!label.isConnected) clearInterval(tick); else upd(); }, 1000);
        timer.replaceChildren(label, el('p', { class: 'hint', text: `Started ${new Date(log.running.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` }),
          el('button', { class: 'primary', text: '■ Stop & log it', on: { click: stop } }));
      } else {
        timer.replaceChildren(el('div', { class: 'devlog-clock idle', text: '0:00:00' }), el('button', { class: 'primary', text: '▶ Start working', on: { click: start } }),
          el('p', { class: 'hint', text: 'Keeps running if you close the hub. Stopping asks what you did.' }));
      }
    }
    function start() { log.running = { start: Date.now() }; save(); renderTimer(); }
    async function stop() {
      const minutes = Math.max(1, Math.round((Date.now() - log.running.start) / 60000));
      const note = await Modal.prompt(`Logged ${fmtMin(minutes)}. What did you work on?`, { multiline: true, placeholder: 'e.g. Rift balance pass, fixed shop comparison' });
      if (note == null) return;
      log.entries.unshift({ id: `d${Date.now()}`, start: log.running.start, minutes, note: note.trim() });
      log.running = null;
      save(); renderTimer(); renderList();
    }
    async function addPast() {
      const v = await Modal.form('Add a session', [{ name: 'date', label: 'Date', type: 'date', value: new Date().toLocaleDateString('en-CA') }, { name: 'minutes', label: 'Minutes', type: 'number', value: 60 }, { name: 'note', label: 'What you did', type: 'textarea' }], { ok: 'Add' });
      if (!v) return;
      log.entries.push({ id: `d${Date.now()}`, start: new Date(`${v.date}T12:00`).getTime(), minutes: v.minutes, note: v.note.trim() });
      log.entries.sort((a, b) => b.start - a.start);
      save(); renderList();
    }
    function renderList() {
      const days = new Map();
      for (const e of log.entries) { const d = new Date(e.start).toLocaleDateString('en-CA'); if (!days.has(d)) days.set(d, []); days.get(d).push(e); }
      listBox.replaceChildren(...(days.size ? [...days].map(([d, es]) => el('div', { class: 'devlog-day' },
        el('div', { class: 'lib-group', text: `${new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · ${fmtMin(es.reduce((s, e) => s + e.minutes, 0))}` }),
        ...es.map((e) => el('div', { class: 'render-row' }, el('div', { class: 'render-name' }, el('span', { text: e.note || '(no note)' }), el('span', { class: 'hint', text: fmtMin(e.minutes) })),
          el('button', { class: 'msg-act', text: '×', title: 'Delete', on: { click: () => { log.entries = log.entries.filter((x) => x !== e); save(); renderList(); } } }))))) : [el('p', { class: 'hint', text: 'No sessions yet.' })]));
    }
    function md(entries) {
      return entries.map((e) => `- ${new Date(e.start).toLocaleDateString('en-CA')} (${fmtMin(e.minutes)}): ${e.note}`).join('\n');
    }
    function exportMd() {
      window.hub.saveFile({ defaultPath: 'forgeheart-devlog.md', filters: [{ name: 'Markdown', extensions: ['md'] }], content: `# Forgeheart devlog\n\n${md(log.entries)}\n` });
    }
    function draftDevlog() {
      const week = log.entries.filter((e) => Date.now() - e.start < 7 * 864e5);
      if (!week.length) { toast('No sessions in the last 7 days', { type: 'error' }); return; }
      askClaude(`Write a friendly itch.io devlog post for Forgeheart covering this week's work (${fmtMin(week.reduce((s, e) => s + e.minutes, 0))} total). Short intro, a bullet list of what changed for players, one line about what's next.\n\n${md(week)}`);
    }
    (async () => { log = await kv.get('forge-devlog', log); renderTimer(); renderList(); })();
    api.reloadDevlog = async () => { log = await kv.get('forge-devlog', log); renderTimer(); renderList(); };
  }

  // ---------- for chat commands (/forge, /forge-task, /forge-devlog) ----------
  async function open(tab) {
    activate('tool:forgeheart');
    for (let i = 0; i < 40 && !tabs; i += 1) await new Promise((r) => setTimeout(r, 50));
    if (tab) tabs?.show(tab);
    return Boolean(tabs);
  }
  const TAB_IDS = ['live', 'dashboard', 'builds', 'docs', 'board', 'tasks', 'patch', 'release', 'balance', 'backups', 'files', 'devlog'];
  // "Fix rift timer #bug !1" → a To-do task tagged bug, priority 1.
  async function addTask(text, { col = 'todo' } = {}) {
    const tag = (text.match(/#(\w+)/) || [])[1] || '';
    const prio = Number((text.match(/!([123])\b/) || [])[1] || 2);
    const title = text.replace(/#\w+/g, '').replace(/!([123])\b/, '').replace(/\s+/g, ' ').trim();
    if (!title) return null;
    const tasks = await kv.get('forge-tasks', []);
    const t = { id: `t${Date.now()}`, title, col, tag, priority: prio, order: Date.now(), createdAt: Date.now() };
    tasks.push(t);
    await kv.set('forge-tasks', tasks);
    await api.reloadTasks?.();
    return t;
  }
  async function taskList(col) {
    const tasks = await kv.get('forge-tasks', []);
    return tasks.filter((t) => (col ? t.col === col : t.col !== 'done')).sort((a, b) => (a.priority || 2) - (b.priority || 2) || a.order - b.order);
  }
  // start / stop (with what you did) / status of the devlog work timer
  async function devlog(action = 'status', note = '') {
    const log = await kv.get('forge-devlog', { running: null, entries: [] });
    const fmtMin = (m) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;
    if (action === 'start') {
      if (log.running) return `Already running since ${new Date(log.running.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
      log.running = { start: Date.now() };
      await kv.set('forge-devlog', log);
      await api.reloadDevlog?.();
      return 'Devlog timer started.';
    }
    if (action === 'stop') {
      if (!log.running) return 'The devlog timer is not running.';
      const minutes = Math.max(1, Math.round((Date.now() - log.running.start) / 60000));
      log.entries.unshift({ id: `d${Date.now()}`, start: log.running.start, minutes, note: note.trim() });
      log.running = null;
      await kv.set('forge-devlog', log);
      await api.reloadDevlog?.();
      return `Logged ${fmtMin(minutes)}${note ? `: ${note}` : ''}.`;
    }
    const today = new Date().toDateString();
    const todayMin = log.entries.filter((e) => new Date(e.start).toDateString() === today).reduce((sum, e) => sum + e.minutes, 0);
    const weekMin = log.entries.filter((e) => Date.now() - e.start < 7 * 864e5).reduce((sum, e) => sum + e.minutes, 0);
    return `${log.running ? `⏱ Running for ${fmtMin((Date.now() - log.running.start) / 60000)}. ` : ''}Today ${fmtMin(todayMin)} · last 7 days ${fmtMin(weekMin)}.`;
  }

  Tools.define({
    id: 'forgeheart', name: 'Forgeheart', icon: '⚒', color: '#e07a2f',
    description: 'Builds, docs, boards, tasks, releases and balance',
    mount(body, head) {
      if (!forgeAgent()) head.append(el('button', { class: 'ghost small forge-chat-btn', text: '💬 Forgeheart chat', title: 'Put the Forge chat in this window: it drives the live game and knows your notes', on: { click: (e) => { const b = e.currentTarget; forgeChat().then(() => { if (forgeAgent()) b.remove(); }); } } })); // (round 183) with its chat docked, the dock's own 💬 button is the one
      tabs = Tabs(body, [
        { id: 'live', label: '▶ Live game', render: liveTab }, // (round 183, forgechat183) the game the chat drives
        { id: 'dashboard', label: 'Dashboard', render: dashboardTab, onShow: () => api.refreshDashboard?.() },
        { id: 'builds', label: 'Play builds', render: buildsTab },
        { id: 'docs', label: 'Docs', render: docsTab },
        { id: 'board', label: 'Miro boards', render: boardTab },
        { id: 'tasks', label: 'Tasks', render: tasksTab },
        { id: 'patch', label: 'Patch notes', render: patchTab },
        { id: 'release', label: 'Release', render: releaseTab },
        { id: 'balance', label: 'Balance CSV', render: balanceTab },
        { id: 'backups', label: 'Backups & diff', render: backupsTab },
        { id: 'files', label: 'Files', render: filesTab },
        { id: 'devlog', label: 'Devlog', render: devlogTab },
      ], { storeKey: 'forge.tab' });
    },
    commands: [
      { label: 'Forgeheart: the live game', run: () => showLive() },
      { label: 'Play the Forgeheart build', run: () => tabs?.show('builds') },
      { label: 'Forgeheart chat (with project brief)', run: () => forgeChat() },
      { label: 'Forgeheart docs', run: () => tabs?.show('docs') },
      { label: 'Forgeheart Miro board', run: () => tabs?.show('board') },
      { label: 'Forgeheart tasks', run: () => tabs?.show('tasks') },
      { label: 'Write patch notes', run: () => tabs?.show('patch') },
      { label: 'Package an itch.io release', run: () => tabs?.show('release') },
      { label: 'Edit balance CSV', run: () => tabs?.show('balance') },
      { label: 'Clean up Forgeheart backups', run: () => tabs?.show('backups') },
      { label: 'Start/stop the devlog timer', run: () => tabs?.show('devlog') },
    ],
  });

  return { forgeChat, forgeAgent, ensureAgent, knowledge, docsTool, showLive, nowLine, makeDigest, editDigest, digestPrompt, parseCsv, open, addTask, taskList, devlog, TAB_IDS, folder };
})();
