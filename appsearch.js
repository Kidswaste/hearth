// 🔎 Find anything (round 37, appsearch): Ctrl/⌘+K, in plain words, over the whole app. The owner wants things easy
// to find without commands, so the palette (appui.js, the same box as before: nothing new on screen) ranks with the
// Lab search's engine (tools/three-search-core.js, shared: plain words, synonyms, typos, prefixes) over:
//   · every Settings row (SettingsFind's switches + AppSearchData.SETTINGS) and every look → Settings opens on it,
//     Advanced / More looks unfolded, the row lit
//   · every ⋯ AI setup row (AppSearchData.AI_SETUP) → AI setup opens, its fold opened, the row lit
//   · the app's menus as they are right now: the chat header (the chat ⋯ menu), the chat box, the chats list, the rail
//     (an AI, a tool, the rail itself, the token pill), a tool's header and dock: read by right-clicking them out of
//     sight (Keys' "Right-click" lines name them; showMenu is held while they build, nothing opens) → Enter runs the
//     menu's own row, a submenu opens
//   · the palette's own rows: AIs, tools, chats by title, Ctrl/⌘+K actions and every chat command said in plain words
//     (what it does, never its "/name")
//   · ◎ Missions → the next message of this chat becomes it · chats by what was said in them (recall's index on the
//     store thread, asked after a short pause, then the plain text search) → the chat opens on that message
//   · the Lab's things when the Lab is open (Lab search's own index and rows: LabSearch.find), + "Search the Lab for…"
//   · patch notes ("what's new: lab search") → the notes open on that part · short "how do I…" answers with Show me
//   · last: "Ask <AI>: <your words>" puts them in the chat box, not sent
// Two indexes: the fixed one (actions, Settings, AI setup, help, patch notes) made once and again only when something
// joined; the live one (menus, chats, AIs, tools, missions) made on each opening. Each keystroke is one search in each
// (timed: AppSearch.last). Lazy group "appsearch" (tier "use"): it loads the first time Ctrl/⌘+K opens.
const AppSearch = (() => {
  const C = LabSearchCore;
  const D = AppSearchData;
  const V = C.vocab({ syn: D.SYN, phrases: D.PHRASES, kind: D.KIND });
  const RECENT = 'appsearch.recent';
  const MAX = 40;
  const last = { ms: 0, maxMs: 0, searches: 0, buildMs: 0, liveMs: 0, items: 0, query: '', ran: null, menus: 0, lab: false };
  let fixedIx = null; let fixedSig = '';
  let liveIx = null;
  let news = null; // patch-notes parts, read once
  let switches = null; // SettingsFind's switches, once its file is in
  let labOn = false; // Lab search's index is ready (the Lab is the open window)
  const deepCache = new Map(); // words → rows found in chats' messages
  const err = (e) => toast(e?.message || String(e), { type: 'error', timeout: 5000 });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => C.fold(s).replace(/[^a-z0-9]+/g, ' ').trim();

  // ---------- plain words for a command row ("/name — what it does" → what it does) ----------
  function plain(label) {
    const m = /^\/([\w:.-]+)\s+—\s+([\s\S]*)$/.exec(String(label || ''));
    if (!m) return null;
    let t = m[2].replace(/\s*\([^()]*(?:^|\s|`)\/[a-z][^()]*\)/gi, '').replace(/`?(^|\s)\/[a-z][\w-]*`?/gi, '$1').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim();
    if (!t) t = m[1].replace(/-/g, ' ');
    return { name: m[1], text: t.charAt(0).toUpperCase() + t.slice(1) };
  }
  // the palette's rows say what they do (appui.js calls this on every opening, before showing anything)
  // (round 38, inputlatency) each label's plain words are worked out once (≈ 1,000 rows, five patterns each, on every
  // opening: ≈ 3 ms in the task right after Ctrl/⌘+K, where the first letters typed wait)
  const plainMemo = new Map();
  const plainOf = (label) => { let p = plainMemo.get(label); if (p === undefined) { p = plain(label); if (plainMemo.size > 4000) plainMemo.clear(); plainMemo.set(label, p); } return p; };
  function tidy(items) {
    for (const it of items) {
      if (it.kind !== 'Action' || it.cmdName) continue;
      const p = plainOf(it.label);
      if (p) { it.cmdName = p.name; it.label = p.text; }
    }
    return items;
  }

  // ---------- the fixed sources ----------
  function settingsItems() {
    const out = D.SETTINGS.map((r) => ({ ...r, run: () => toSettings(r) }));
    for (const s of switches || []) {
      const sec = D.HOMES[s.home] || s.home;
      const adv = D.ADVANCED.has(sec);
      const r = { id: `set:sw:${s.cmd}`, kind: 'setting', sec, adv, label: s.label, find: s.label, hint: s.tip, tags: `${s.cmd.replace(/-/g, ' ')} on off switch`, path: `Settings › ${adv ? 'Advanced › ' : ''}${sec}` };
      out.push({ ...r, run: () => toSettings(r) });
    }
    // every look (Enter: Settings on that look, More looks unfolded)
    try {
      for (const [id, t] of Object.entries(AppUI.THEMES || {})) {
        const r = { id: `set:look:${id}`, kind: 'setting', sec: 'Look', label: `Look: ${String(t.label || id).replace(/ \(.*\)$/, '')}`, hint: `${t.group || ''}${t.scheme ? ` · ${t.scheme}` : ''}`, tags: `look theme appearance colors ${t.scheme || ''} ${t.group || ''}`, path: 'Settings › Look', sel: `.look-tile[data-id="${CSS.escape(id)}"]`, boost: -0.1 };
        out.push({ ...r, run: () => toSettings(r) });
      }
    } catch { /* no looks */ }
    return out;
  }
  const aiItems = () => D.AI_SETUP.map((r) => ({ ...r, run: () => toAiSetup(r) }));
  function helpItems() {
    return D.HELP.map((h) => ({ id: `h:${h.title}`, kind: 'help', label: h.title, hint: h.text.slice(0, 120), path: 'How do I…', tags: h.tags, help: h, run: () => showHelp(h) }));
  }
  // the palette's actions (chat commands in plain words, Ctrl/⌘+K actions of every module) and tools' own rows
  function actionItems(base) {
    const out = [];
    for (const it of base) {
      if (it.kind === 'Action') out.push({ id: `p:${it.cmdName ? `/${it.cmdName}` : it.label}`, kind: it.cmdName ? 'cmd' : 'action', label: it.label, hint: '', tags: it.cmdName ? it.cmdName.replace(/-/g, ' ') : '', path: '', keys: it.keys, run: it.run });
      else if (!['Agent', 'Tool', 'Again'].includes(it.kind) && !it.chat && !it.web) out.push({ id: `t:${it.kind}|${it.label}`, kind: 'action', label: it.label, hint: '', path: it.kind, keys: it.keys, run: it.run });
    }
    return out;
  }
  // patch notes: one row per part of a round ("## 🔎 Lab search" → What's new: Lab search), the newest rounds
  async function loadNews() {
    if (news) return;
    news = [];
    try {
      const idx = (await (await fetch('docs/patch-notes/index.txt', { cache: 'no-store' })).text()).split('\n').map((l) => l.trim()).filter((l) => /^round-\d+\.md$/.test(l)).slice(0, 8);
      const texts = await Promise.all(idx.map((f) => fetch(`docs/patch-notes/${f}`, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => '')));
      idx.forEach((file, i) => {
        const round = Number((/round-(\d+)/.exec(file) || [])[1]) || 0;
        for (const part of texts[i].split(/\n(?=## )/).slice(1)) {
          const [head, ...body] = part.split('\n');
          const title = head.replace(/^##\s*/, '').trim();
          const words = title.replace(/^[^\p{L}\p{N}]+/u, '').trim();
          if (!words) continue;
          const text = body.join(' ').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
          news.push({ id: `n:${file}|${title}`, kind: 'news', label: `What's new: ${words}`, hint: `Round ${round} · ${text.replace(/^Find it:\s*/i, '').slice(0, 110)}`, path: '📰 Patch notes', tags: `whats new patch notes changed ${text.slice(0, 400)}`, boost: Math.max(-0.3, (round - 40) * 0.02), run: () => toNews(file, title) });
        }
      });
    } catch { /* no notes in this copy */ }
  }
  function buildFixed(base) {
    const sig = `${base.length}|${switches?.length || 0}|${news?.length || 0}`;
    if (fixedIx && sig === fixedSig) return;
    fixedSig = sig;
    fixedIx = C.build([...settingsItems(), ...aiItems(), ...helpItems(), ...(news || []), ...actionItems(base)], { vocab: V });
  }

  // ---------- the live sources ----------
  // the menus of what you can point at, read without opening them: the right-click is sent to the control while
  // showMenu / popMenu only note what they were handed
  const MENUS = [
    ['Right-click the chat header', '.surface.active .native-head', 'Chat ⋯ (right-click)'],
    ['Right-click around the chat box', '.surface.active form.composer', 'The chat box (right-click)'],
    ['Right-click a chat in the list', '#panel .item.active, #panel .item', 'A chat in the list (right-click)'],
    ['Right-click a chat group', '#panel .group-head', 'A chat group (right-click)'],
    ['Right-click an agent', '#agent-buttons .agent-btn.active:not(.tool-btn-rail), #agent-buttons .agent-btn:not(.tool-btn-rail)', 'An AI in the rail (right-click)'],
    ['Right-click a tool in the rail', '#agent-buttons .tool-btn-rail.active, #agent-buttons .tool-btn-rail', 'A tool in the rail (right-click)'],
    ['Right-click the rail', '#rail .spacer', 'The rail (right-click)'],
    ['Right-click the token pill', '#rail .meter-pill', 'The token pill (right-click)'],
    ['Right-click a tool header', '.surface.active .tool-head', 'The tool\'s header (right-click)'],
    ['Right-click the dock', '.surface.active .dd-strip', 'The director dock (right-click)'],
  ];
  const visible = (n) => n?.isConnected && (n.checkVisibility ? n.checkVisibility({ visibilityProperty: true }) : n.offsetParent !== null);
  function firstVisible(sel) {
    for (const one of sel.split(/,\s*(?![^()]*\))/)) { for (const n of document.querySelectorAll(one)) if (visible(n)) return n; }
    return null;
  }
  function capture(node) {
    const got = [];
    const keep = { showMenu: window.showMenu, popMenu: window.popMenu };
    window.showMenu = (x, y, items) => { got.push({ items, tuple: false }); };
    window.popMenu = (x, y, items) => { got.push({ items, tuple: true }); };
    try {
      const r = node.getBoundingClientRect();
      node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + Math.min(r.width / 2, 40), clientY: r.top + Math.min(r.height / 2, 14), button: 2 }));
    } catch (e) { console.warn('find anything: a menu', e); } finally { window.showMenu = keep.showMenu; window.popMenu = keep.popMenu; }
    return got.find((g) => g.items && (typeof g.items === 'function' || g.items.length)) || null;
  }
  function menuItems(inLab) {
    const out = []; const seen = new Set();
    let n = 0;
    for (const [, sel, where] of MENUS) {
      const node = firstVisible(sel);
      if (!node || (inLab && node.closest('.tool-surface'))) continue; // the Lab's own menus: Lab search has them
      const m = capture(node);
      if (!m) continue;
      n += 1;
      C.menuRows(m.items, [where], out, seen, { sub: (label, items, tuple) => openSub(label, items, tuple), run: (fn) => fn() });
    }
    last.menus = n;
    for (const it of out) it.kind = 'menu';
    return out;
  }
  function liveItems(base) {
    const out = [];
    const seenChat = new Set();
    for (const it of base) {
      if (it.kind === 'Agent') out.push({ id: `ag:${it.label}`, kind: 'agent', label: it.label, hint: 'open', path: 'The rail', keys: it.keys, tags: 'ai agent open chat', run: it.run });
      else if (it.kind === 'Tool') out.push({ id: `tl:${it.label}`, kind: 'tool', label: it.label, hint: 'open', path: 'The rail', keys: it.keys, tags: 'tool open', run: it.run });
      else if (it.chat || /\schat$/.test(it.kind || '')) {
        const id = `ch:${it.kind}|${it.label}`;
        if (seenChat.has(id)) continue;
        seenChat.add(id);
        out.push({ id, kind: 'chat', label: it.label || 'Untitled', hint: it.kind, path: 'Chats', tags: 'chat conversation', run: it.run });
      }
    }
    // ◎ missions for the chat you're in
    if (typeof Missions !== 'undefined') {
      const a = agentNow();
      if (a) {
        for (const m of Missions.shown(a.id)) out.push({ id: `mission:${m.id}`, kind: 'mission', label: `${m.icon || '◎'} ${m.label}`, hint: m.desc, path: '◎ Missions (the chat box)', tags: 'mission next message', run: () => pickMission(a.id, m) });
      }
    }
    return out;
  }
  // the AI a search row talks to: the chat you're in, or the director beside the tool you're in, or Claude
  function agentNow() {
    const id = H.activeId;
    const a = id && H.agent(id);
    if (a?.mode === 'native') return a;
    const sid = String(id ? H.surfaceIdFor?.(id) : '');
    return (sid.startsWith('tool:') && Tools.dockedAgent?.(sid.slice(5))) || H.claudeAgent?.() || null;
  }
  const inLab = () => String(H.surfaceIdFor?.(H.activeId) || '') === 'tool:three';

  // ---------- an opening ----------
  // prepare(base): the palette's rows (appui.js gathers them on each opening); the live index is made again
  let base = [];
  function prepare(items) {
    const t0 = performance.now();
    base = items;
    tidy(items);
    buildFixed(items);
    const lab = inLab();
    liveIx = C.build([...menuItems(lab), ...liveItems(items)], { vocab: V });
    last.liveMs = Math.round((performance.now() - t0) * 10) / 10;
    last.items = fixedIx.items.length + liveIx.items.length;
    labOn = false;
    if (lab) labReady().catch(() => {});
    // what joins a moment later: Settings' switches, the patch notes
    later().catch(() => {});
    return items;
  }
  let laterBusy = false;
  async function later() {
    if (laterBusy || (switches && news)) return;
    laterBusy = true;
    try {
      if (!switches) {
        try { await window.loadSettingsFind?.(); } catch { /* not this time */ }
        switches = typeof SettingsFind !== 'undefined' ? SettingsFind.live() : [];
      }
      await loadNews();
      fixedSig = ''; buildFixed(base);
      refresh();
    } finally { laterBusy = false; }
  }
  async function labReady() {
    if (window.Lazy && !Lazy.isIn('labsearch')) await Lazy.load('labsearch');
    if (typeof LabSearch === 'undefined' || !inLab()) return;
    LabSearch.buildIndex();
    labOn = true;
    last.lab = true;
    refresh();
    LabSearch.loadLater?.().then(refresh).catch(() => {});
  }
  // the palette shows again what it shows (it asks find() again with the words in the box)
  const refresh = () => { try { AppUI.paletteRefresh?.(); } catch { /* closed */ } };

  // ---------- searching ----------
  const recentMap = () => { try { return new Map((store.get(RECENT, []) || []).map((id, i) => [id, i])); } catch { return new Map(); } };
  const KIND_TEXT = { setting: 'Settings', aisetup: 'AI setup', menu: 'Menu', mission: 'Mission', agent: 'AI', tool: 'Tool', chat: 'Chat', msg: 'In a chat', action: 'Action', cmd: 'Action', lab: 'Lab', news: 'What\'s new', help: 'How to', ask: 'Ask' };
  function rowOf(r) {
    const it = r.item;
    return { kind: KIND_TEXT[it.kind] || 'Action', label: `${it.checked ? '✓ ' : ''}${it.label}`, detail: [it.path, it.hint].filter(Boolean).join(' · ').slice(0, 160), keys: it.keys || '', id: it.id, score: r.score, run: () => runItem(it) };
  }
  // find(words) → the palette's rows, best first (sync: what's in the indexes now; the chats' messages join a moment later)
  function find(q, { limit = MAX } = {}) {
    const t0 = performance.now();
    q = String(q || '').trim();
    if (!fixedIx || !liveIx) prepare(base);
    const recent = recentMap();
    let res = [...C.search(liveIx, q, { limit, recent }), ...C.search(fixedIx, q, { limit, recent })];
    if (labOn && typeof LabSearch !== 'undefined') {
      try { for (const r of LabSearch.find(q, 12)) res.push({ item: { ...r.item, id: `lab:${r.item.id}`, kind: 'lab', labKind: r.item.kind, path: `Lab › ${r.item.path || ''}`.replace(/ › $/, ''), labItem: r.item }, score: r.score + 0.1 }); } catch { /* the Lab went away */ }
    }
    const deep = deepCache.get(q.toLowerCase());
    if (deep) res.push(...deep);
    res.sort((a, b) => b.score - a.score);
    // the same thing found twice (a menu row and its Ctrl/⌘+K action): once
    const seen = new Set(); const out = [];
    for (const r of res) {
      const k = norm(r.item.label);
      if (seen.has(k)) continue;
      seen.add(k); out.push(r);
      if (out.length >= limit) break;
    }
    if (labOn && q) out.push({ item: { id: 'lab-more', kind: 'lab', label: `Search the Lab for “${q}”`, hint: 'its effects, layers, sliders, templates…', path: '🔎 Lab search', run: () => LabSearchHook.open({ query: q }) }, score: -1 });
    if (q) { const a = agentNow(); if (a) out.push({ item: { id: 'ask', kind: 'ask', label: `Ask ${a.name}: ${q}`, hint: 'puts your words in its chat box, not sent', path: '', run: () => ask(a, q) }, score: -2 }); }
    const rows = out.map(rowOf);
    if (q.length >= 3 && !deep) deepSoon(q);
    const ms = performance.now() - t0;
    last.ms = Math.round(ms * 100) / 100; last.maxMs = Math.max(last.maxMs, last.ms); last.searches += 1; last.query = q;
    return rows;
  }

  // ---------- chats by what was said in them ----------
  // a short pause after the last key, then recall's index (store thread, a few ms) and, when it has nothing yet, the
  // plain text search; the rows join the list under the same words
  let deepTimer = 0; let deepSeq = 0;
  function deepSoon(q) {
    clearTimeout(deepTimer);
    const n = ++deepSeq;
    deepTimer = setTimeout(async () => {
      let rows = [];
      try {
        const r = await window.hub.recall?.({ q, budgetMs: 40, limit: 6 });
        const hits = [...(r?.decisions || []), ...(r?.open || []), ...(r?.mentions || [])].slice(0, 5);
        rows = hits.map((h, i) => msgRow(h.agentId, h.chatId, h.title, h.snippet, h.k, 0.9 - i * 0.05));
        if (!rows.length) {
          const s = await window.hub.searchChatText?.(q);
          rows = (s || []).slice(0, 5).map((h, i) => msgRow(h.agentId, h.id, h.title, h.snippet, null, 0.85 - i * 0.05));
        }
      } catch { /* no store thread here */ }
      if (deepCache.size > 60) deepCache.clear();
      deepCache.set(q.toLowerCase(), rows);
      if (n === deepSeq && rows.length) refresh();
    }, 180);
  }
  function msgRow(agentId, chatId, title, snippet, k, score) {
    const who = H.agent(agentId)?.name || '';
    return { item: { id: `msg:${chatId}:${k ?? ''}`, kind: 'msg', label: String(snippet || title || '').replace(/\s+/g, ' ').trim().slice(0, 120), hint: '', path: `${title || 'Chat'}${who ? ` · ${who}` : ''}`, run: () => jumpChat(agentId, chatId, k) }, score };
  }
  async function jumpChat(agentId, chatId, k) {
    if (!H.agent(agentId)) throw new Error('That chat\'s AI isn\'t here any more');
    activate(agentId);
    Native.open(agentId, chatId);
    if (k == null) return;
    for (let i = 0; i < 30; i += 1) { if (Native.jumpTo?.(agentId, k)) return; await sleep(100); }
  }

  // ---------- what a row does ----------
  function remember(id) {
    if (!id || id === 'ask' || id === 'lab-more') return;
    try { const l = (store.get(RECENT, []) || []).filter((x) => x !== id); l.unshift(id); store.set(RECENT, l.slice(0, 30)); } catch { /* storage off */ }
  }
  async function runItem(it) {
    last.ran = { id: it.id, kind: it.kind, label: it.label };
    remember(it.id);
    if (typeof Usage !== 'undefined') Usage.track?.(`Find anything › ${KIND_TEXT[it.kind] || 'Action'}`, { area: 'Find anything', label: KIND_TEXT[it.kind] || 'Action' });
    // after the palette is gone (a row may open a menu, a dialog or a drawer of its own)
    await sleep(0);
    try {
      if (it.labItem) await it.labItem.run(it.labKind === 'fx' ? { alt: false } : undefined);
      else await it.run();
    } catch (e) { err(e); }
  }
  // a submenu row: that submenu, under the top of the window
  function openSub(label, items, tuple) {
    const x = Math.max(8, Math.round(innerWidth / 2 - 150)); const y = 90;
    const list = typeof items === 'function' ? items() : items;
    if (tuple) popMenu(x, y, [label, ...list]); else showMenu(x, y, list);
  }
  // light it up: every fold around it opened, scrolled to the middle, the keys sheet's gold flash
  function reveal(n) {
    if (!n) return false;
    for (let d = n.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true;
    if (n.matches('summary') && n.parentElement?.matches('details')) n.parentElement.open = true;
    n.scrollIntoView({ block: 'center' });
    n.classList.remove('ks-flash');
    requestAnimationFrame(() => requestAnimationFrame(() => { n.classList.add('ks-flash'); setTimeout(() => n.classList.remove('ks-flash'), 1600); }));
    return true;
  }
  // Settings: the row by its words in its section (a button in a row of buttons), else the section
  function locateSetting(dlg, r) {
    if (r.sel) { const n = dlg.querySelector(r.sel); if (n) return n; }
    const want = norm(r.find || '');
    const secs = [...dlg.querySelectorAll('.settings-section')].filter((s) => !r.sec || s.querySelector('h3')?.textContent.trim() === r.sec);
    for (const s of secs) {
      if (!want) return s;
      for (const row of s.querySelectorAll(':scope > :not(h3)')) {
        if (!norm(row.textContent).includes(want)) continue;
        if (row.matches('.button-row, .look-picker, .check-grid')) { const b = [...row.querySelectorAll('button, label')].find((x) => norm(x.textContent).includes(want)); if (b) return b; }
        return row;
      }
    }
    return secs[0] || null;
  }
  async function toSettings(r) {
    await AppUI.openSettings();
    const dlg = await until(() => document.querySelector('dialog.settings-dialog[open]'), 3000);
    if (!dlg) throw new Error('Settings did not open');
    const n = locateSetting(dlg, r);
    last.jumped = { id: r.id, found: Boolean(n), text: n?.textContent.trim().slice(0, 80) || '' };
    reveal(n);
    return n;
  }
  // ⋯ AI setup: opened on the row's fold (for the chat you're in), the row found by its words, every fold around it opened
  function locateAi(body, r) {
    const want = norm(r.find || r.label);
    const nodes = [...body.querySelectorAll('.opt-h, .opt-fold-h, .opt-label, summary, button, .bud-sec h4')];
    const n = nodes.find((x) => norm(x.textContent) === want) || nodes.find((x) => norm(x.textContent).startsWith(want)) || nodes.find((x) => norm(x.textContent).includes(want));
    if (!n) return null;
    if (n.matches('.opt-fold-h')) return n.closest('summary') || n;
    return n.closest('.opt-row, .opt-rule, summary') || (n.matches('.opt-h') ? n : n.closest('section') || n);
  }
  async function toAiSetup(r) {
    if (window.Lazy && !Lazy.isIn('options')) await Lazy.load('options');
    const a = agentNow();
    Options.hide();
    Options.open({ agentId: a?.id, show: r.fold || undefined });
    const n = await until(() => (Options.sheet ? locateAi(Options.sheet.body, r) : null), 4000);
    last.jumped = { id: r.id, found: Boolean(n), text: n?.textContent.trim().slice(0, 80) || '' };
    if (!n) return null;
    await new Promise((res) => requestAnimationFrame(res)); // after the fold's own scroll (Options.open)
    reveal(n);
    return n;
  }
  // (the reader's Markdown draws a round's ## parts one level down: any heading with that text)
  async function toNews(file, title) {
    const up = typeof Updater !== 'undefined' ? Updater.patchNotes(file) : Promise.resolve();
    await up;
    const h = await until(() => [...document.querySelectorAll('dialog.pn-dialog .pn-body :is(h2, h3, h4, h5)')].find((x) => x.textContent.trim() === title), 4000);
    reveal(h);
    last.jumped = { id: `n:${file}|${title}`, found: Boolean(h) };
  }
  function pickMission(agentId, m) {
    activate(agentId);
    Missions.set(agentId, m.id);
    toast(m.id === 'normal' ? 'Your next message: a normal reply' : `Your next message: ${m.icon || '◎'} ${m.label}`, { timeout: 2500 });
    setTimeout(() => Native.focus?.(agentId), 60);
  }
  function ask(a, q) {
    activate(a.id);
    Native.setDraft?.(a.id, q);
    setTimeout(() => Native.focus?.(a.id), 60);
    toast(`In ${a.name}'s box, not sent: press Enter when it reads right`, { timeout: 3000 });
  }
  async function showHelp(h) {
    const go = h.go ? findById(h.go) : null;
    if (!go) { await Modal.alert(h.title, h.text); return; }
    if (await Modal.confirm(h.title, h.text, { ok: 'Show me' })) await runItem(go);
  }
  function findById(id) {
    for (const ix of [fixedIx, liveIx]) { const it = ix?.items.find((x) => x.id === id); if (it) return it; }
    return null;
  }
  async function until(fn, ms) {
    const end = performance.now() + ms;
    for (;;) { const v = fn(); if (v) return v; if (performance.now() > end) return null; await sleep(60); }
  }

  // warm up in idle moments (the first searches on a fresh index are the slow ones)
  let warmed = false;
  function warm() {
    if (warmed) return;
    warmed = true;
    const qs = ['a', 's', 'dark mode', 'cheaper', 'files', 'new chat', 'setings'];
    const next = () => { const q = qs.shift(); if (!q || !fixedIx) return; try { C.search(fixedIx, q); C.search(liveIx, q); } catch { /* only a warm-up */ } (window.requestIdleCallback || setTimeout)(next); };
    (window.requestIdleCallback || setTimeout)(next);
  }

  return { prepare, find, tidy, plain, warm, later, toSettings, toAiSetup, locateSetting, locateAi, jumpChat, findById, runItem, last, vocab: V,
    get index() { return { fixed: fixedIx, live: liveIx }; }, get labOn() { return labOn; } };
})();
