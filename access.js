// Chat file access (round 14): how a chat reads, writes, deletes and runs things on this computer, and how it asks.
//   · One level per AI (round 32): ⋯ AI setup → Files on this computer: Off · Read · Read & write · Full, plus the
//     folders it may use (its own project folder by default; ＋ Add a folder…, or My home folder). Every chat of that AI
//     uses it; a chat may set its own instead (right-click ⋯ → Access, /access, dropping a folder on the chat).
//   · When something is refused (it may only read, not run commands, a folder that isn't one of its own, Astra's
//     sandbox) the chat gets one line saying why, with the fix: Allow edits / Allow commands / Allow this folder.
//   · (winshell) A command the engine refused itself before Hearth's check ("blocked by policy": Claude Code's command
//     tool not switched on, Codex's sandbox on Windows) gets that line too; on Windows Astra can be let run commands
//     without its sandbox (⋯ AI setup, a warned opt-in: agent.astraNoSandbox).

//   · Claude's permission requests come through mcp/access-mcp.js (engines.js --permission-prompt-tool) as access_check:
//     the classifier (access-rules.js) lets safe things through silently, refuses what the level doesn't cover or what
//     needs a password, and shows an approval card in the chat for risky ones (Allow once · Allow for this chat · Deny,
//     with an optional note back to the model; no answer in time denies).
//   · Deletes go to the Trash: a chat's plain `rm` is done by Hearth with the Trash instead; Astra (Codex) moves files
//     into .hearth-trash/, which Hearth empties into the Trash after its turn. Edits keep a copy first, for Undo.
//   · An activity log per chat (/access log): what was read, written, deleted, run, refused, with Undo for writes.
//   · Access.ask({ agentId, action, target, risk, detail }) → Promise<boolean>: the same card for other features
//     (apps, Adobe, deploy). Secrets are masked in cards and logs (AccessRules.redact); Hearth never handles passwords.
const Access = (() => {
  const R = AccessRules;
  const LOG_KEY = 'access-log';
  const LOG_MAX = 300;
  let timeoutMs = 3 * 60000; // an unanswered card denies (tests shorten it with Access._setTimeout)
  let logs = null; // { [chatId | 'app']: entry[] }
  let dirs = null; // { data, home, cwd, win }
  let winTest = false; // tests act as if on Windows (Access._setWindows)
  const onWindows = () => winTest || Boolean(dirs?.win);
  const uid = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const short = (s, n = 90) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const sep = (p) => (/^[A-Za-z]:\\/.test(p) || p.includes('\\') ? '\\' : '/');
  const join = (a, ...b) => [a.replace(/[\\/]+$/, ''), ...b].join(sep(a));

  async function paths() {
    if (dirs) return dirs;
    const attach = await window.hub.attachmentsDir();
    const data = attach.replace(/[\\/]attachments[\\/]?$/, '');
    const platform = await Promise.resolve(window.hub.platform?.()).catch(() => '');
    dirs = { data, home: await window.hub.fs.home(), cwd: join(data, 'workspace'), win: platform === 'win32' };
    return dirs;
  }

  // ---------- settings ----------
  // (round 32) Two places, so "Full" given once sticks: the AI's own setting (agent.fileAccess = { level, folders }, set
  // in ⋯ AI setup → Files on this computer) is what every chat of that AI uses; a chat may set its own instead
  // (right-click ⋯ → Access, /access): chat.access = { level, folders, grants }. Grants ("Allow for this chat") always
  // live on the chat, also when it follows its AI (chat.access then holds only grants). Before round 32 the AI setup
  // row changed only the open chat, so every new chat started back at off / read: the owner's "read only" report.
  const chatNow = (agentId) => (typeof Native !== 'undefined' ? Native.chatOf?.(agentId) : null);
  const agentOf = (agentId) => (typeof H !== 'undefined' ? H.agent(agentId) : null);
  const aiOf = (agent) => (agent?.fileAccess && R.LEVELS.includes(agent.fileAccess.level) ? agent.fileAccess : null);
  // What a chat has now: its own setting, else its AI's, else the agent's old project folder (as before round 14),
  // else off. from: 'chat' | 'ai' | 'workspace' | 'none'.
  function effective(chat, agent = chat ? agentOf(chat.agentId) : null) {
    const grants = chat?.access?.grants || [];
    if (chat?.access && R.LEVELS.includes(chat.access.level)) return { level: chat.access.level, folders: chat.access.folders || [], grants, own: true, from: 'chat' };
    const ai = aiOf(agent);
    if (ai) return { level: ai.level, folders: (ai.folders || []).slice(), grants, own: false, from: 'ai' };
    if (agent?.workspace) return { level: agent.engine === 'codex' && agent.codexFiles !== 'edit' ? 'read' : 'write', folders: [agent.workspace], grants, own: false, from: 'workspace' };
    return { level: 'off', folders: [], grants, own: false, from: 'none' };
  }
  const isOn = (agentId) => effective(chatNow(agentId), agentOf(agentId)).level !== 'off';
  const slug = (s) => String(s || 'chat').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'chat';
  // The chat's own project folder: the agent's project folder when it has one, else Hearth's projects/<chat name>.
  async function defaultFolder(chat) {
    const agent = agentOf(chat.agentId);
    if (agent?.workspace && await window.hub.fs.stat(agent.workspace)) return agent.workspace;
    const { data } = await paths();
    const dir = join(data, 'projects', `${slug(chat.title)}-${String(chat.id).slice(-5)}`);
    if (!await window.hub.fs.stat(dir)) await window.hub.fs.write(join(dir, '.hearth-project'), `${JSON.stringify({ chat: chat.id, title: chat.title, at: Date.now() })}\n`);
    return dir;
  }
  function chatFor(agentId, chat) {
    if (chat) return chat;
    if (typeof Native === 'undefined') return null;
    return Native.chatOf?.(agentId) || Native.ensureChat?.(agentId) || null;
  }
  function save(chat) { try { Native.save(chat); } catch { /* not a native chat */ } refreshBadge(chat.agentId); }
  const normLevel = (level) => (level === 'rw' || level === 'edit' || /read\s*&\s*write/i.test(level) ? 'write' : level);
  // "Allow for this chat": remembered on the chat without freezing its level (a chat that follows its AI keeps doing so)
  function addGrant(chat, grant) { chat.access = { ...(chat.access || {}), grants: [...new Set([...(chat.access?.grants || []), grant])] }; save(chat); }
  async function setLevel(agentId, level, chat = null) {
    level = normLevel(level);
    if (!R.LEVELS.includes(level)) throw new Error(`Pick one of: ${R.LEVELS.join(', ')}`);
    chat = chatFor(agentId, chat);
    if (!chat) throw new Error('Open a chat first.');
    const cur = effective(chat);
    const a = { level, folders: [...cur.folders], grants: chat.access?.grants || [] };
    if (level !== 'off' && !a.folders.length) a.folders = [await defaultFolder(chat)];
    chat.access = a;
    save(chat);
    log(chat.id, { action: 'level', what: `Access → ${R.LEVEL_LABEL[level]}`, result: 'set', by: 'you' });
    return a;
  }
  async function addFolder(agentId, folder, chat = null) {
    chat = chatFor(agentId, chat);
    if (!chat) throw new Error('Open a chat first.');
    if (!folder) folder = await window.hub.pickFolder(effective(chat).folders[0] || (await paths()).home, 'A folder this chat may use');
    if (!folder) return null;
    const st = await window.hub.fs.stat(folder);
    if (!st?.isDir) throw new Error(`${folder} isn't a folder.`);
    const cur = effective(chat);
    chat.access = { level: cur.level === 'off' ? 'read' : cur.level, folders: [...new Set([...cur.folders, folder])].slice(0, 12), grants: chat.access?.grants || [] };
    save(chat);
    log(chat.id, { action: 'folder', what: `Folder added: ${folder}`, target: folder, result: 'set', by: 'you' });
    return chat.access;
  }
  function removeFolder(agentId, which, chat = null) {
    chat = chatFor(agentId, chat);
    const cur = effective(chat);
    const i = /^\d+$/.test(String(which)) ? Number(which) - 1 : cur.folders.findIndex((f) => f === which || R.baseName(f) === which);
    if (i < 0 || i >= cur.folders.length) throw new Error('No such folder (see /access folders).');
    const [gone] = cur.folders.splice(i, 1);
    chat.access = { level: cur.level, folders: cur.folders, grants: chat.access?.grants || [] };
    save(chat);
    return gone;
  }
  // The chat goes back to its AI's setting (its "Allow for this chat" list stays).
  function useAi(agentId, chat = null) {
    chat = chatFor(agentId, chat);
    if (!chat) return null;
    const grants = chat.access?.grants || [];
    if (grants.length) chat.access = { grants }; else delete chat.access;
    save(chat);
    const acc = effective(chat);
    log(chat.id, { action: 'level', what: `Access → as in AI setup (${R.LEVEL_LABEL[acc.level]})`, result: 'set', by: 'you' });
    return acc;
  }

  // ---------- the AI's own setting (round 32: ⋯ AI setup → Files on this computer) ----------
  async function saveAgent(agent, patch) {
    // the config watcher hands back fresh agent objects after a save: change the live one and the one in hand
    for (const t of new Set([agent, agentOf(agent.id)].filter(Boolean))) Object.assign(t, patch);
    if (typeof saveConfig === 'function') await saveConfig();
    refreshBadge(agent.id);
    document.dispatchEvent(new CustomEvent('hearth:file-access', { detail: { agentId: agent.id } })); // an open AI setup repaints
  }
  // An AI's own folder: its old project folder when it has one, else Hearth's projects/<AI name>.
  async function aiDefaultFolder(agent) {
    if (agent?.workspace && await window.hub.fs.stat(agent.workspace)) return agent.workspace;
    const { data } = await paths();
    const dir = join(data, 'projects', slug(agent?.name || 'ai'));
    if (!await window.hub.fs.stat(dir)) await window.hub.fs.write(join(dir, '.hearth-project'), `${JSON.stringify({ agent: agent?.id, title: agent?.name, at: Date.now() })}\n`);
    return dir;
  }
  const aiEffective = (agent) => effective(null, agent);
  async function setAiLevel(agentId, level) {
    level = normLevel(level);
    if (!R.LEVELS.includes(level)) throw new Error(`Pick one of: ${R.LEVELS.join(', ')}`);
    const agent = agentOf(agentId);
    if (!agent) throw new Error('No such AI.');
    let folders = aiEffective(agent).folders.slice(0, 12);
    if (level !== 'off' && !folders.length) folders = [await aiDefaultFolder(agent)];
    await saveAgent(agent, { fileAccess: { level, folders } });
    log(chatNow(agentId)?.id || null, { action: 'level', what: `${agent.name}: file access → ${R.LEVEL_LABEL[level]} (every chat that doesn't set its own)`, result: 'set', by: 'you' });
    return agentOf(agentId)?.fileAccess || agent.fileAccess;
  }
  async function addAiFolder(agentId, folder = null) {
    const agent = agentOf(agentId);
    if (!agent) throw new Error('No such AI.');
    const cur = aiEffective(agent);
    if (!folder) folder = await window.hub.pickFolder(cur.folders[0] || (await paths()).home, `A folder ${agent.name} may use`);
    if (!folder) return null;
    const st = await window.hub.fs.stat(folder);
    if (!st?.isDir) throw new Error(`${folder} isn't a folder.`);
    await saveAgent(agent, { fileAccess: { level: cur.level === 'off' ? 'read' : cur.level, folders: [...new Set([...cur.folders, folder])].slice(0, 12) } });
    log(chatNow(agentId)?.id || null, { action: 'folder', what: `${agent.name} may use: ${folder}`, target: folder, result: 'set', by: 'you' });
    return agentOf(agentId)?.fileAccess || agent.fileAccess;
  }
  async function removeAiFolder(agentId, which) {
    const agent = agentOf(agentId);
    if (!agent) throw new Error('No such AI.');
    const cur = aiEffective(agent);
    const i = /^\d+$/.test(String(which)) ? Number(which) - 1 : cur.folders.findIndex((f) => f === which || R.baseName(f) === which);
    if (i < 0 || i >= cur.folders.length) throw new Error('No such folder.');
    const [gone] = cur.folders.splice(i, 1);
    await saveAgent(agent, { fileAccess: { level: cur.level, folders: cur.folders } });
    return gone;
  }
  // (winshell) Astra without its sandbox (Windows): turning it on asks first, with what it means
  async function setNoSandbox(agentId, on, { confirm = true } = {}) {
    const agent = agentOf(agentId);
    if (!agent || agent.engine !== 'codex') throw new Error('Only Astra has a sandbox to turn off.');
    if (on && confirm && typeof Modal !== 'undefined') {
      const yes = await Modal.confirm(`Let ${agent.name} run commands without its sandbox?`,
        `On Windows, Codex's sandbox can block every command ("blocked by policy"). Without it, ${agent.name}'s commands run like your own: it starts in its folders and is told to stay there, but nothing stops a command from changing files elsewhere, using the network or deleting for good (a delete it runs itself can't go to the Trash). Edits it makes with its own edit tool still show in the activity log. Only at Read & write or Full; Read keeps the sandbox. You can turn this off again in ⋯ AI setup.`,
        { ok: 'Run without the sandbox', danger: true });
      if (!yes) return false;
    }
    await saveAgent(agent, { astraNoSandbox: on ? true : undefined });
    log(chatNow(agentId)?.id || null, { action: 'level', what: `${agent.name}: commands ${on ? 'without its sandbox (Windows)' : 'in its sandbox'}`, result: 'set', by: 'you' });
    return true;
  }
  // "My home folder": everything under it, after a plain warning (Full there = files and commands anywhere in it).
  async function addHome(agentId, { confirm = true } = {}) {
    const agent = agentOf(agentId);
    const { home } = await paths();
    if (confirm && typeof Modal !== 'undefined') {
      const yes = await Modal.confirm(`Let ${agent?.name || 'this AI'} use your whole home folder?`,
        `Your home folder (${home}) holds your documents, photos and other projects. It could then read, and at Read & write or Full also change, any file in there. ${agent?.engine === 'codex' ? 'Astra can\'t ask first: its sandbox lets it change anything in there directly (no network), so a mistake can touch any file.' : 'Deletes still go to the Trash and risky things (deleting, installing, publishing, the network) still ask you first.'} Hearth never types passwords. Only do this if you want it to work anywhere on this computer.`,
        { ok: 'Use my home folder', danger: true });
      if (!yes) return null;
    }
    return addAiFolder(agentId, home);
  }
  // What a run sends (native.js send options): the chat's own setting, else its AI's. An AI with only an old project
  // folder sends nothing (engines.js handles that one as before).
  function sendOptions(chat) {
    if (!chat) return {};
    const acc = effective(chat);
    if (acc.from !== 'chat' && acc.from !== 'ai') return {};
    return { access: { level: acc.level, folders: acc.folders.slice(0, 12) } };
  }

  // ---------- activity log ----------
  async function loadLogs() { if (!logs) { try { logs = (await window.hub.kvGet(LOG_KEY, {})) || {}; } catch { logs = {}; } } return logs; }
  let saveTimer = 0;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      // the 80 most recently active chats keep their logs
      const keys = Object.keys(logs);
      if (keys.length > 80) for (const k of keys.sort((a, b) => (logs[a].at(-1)?.at || 0) - (logs[b].at(-1)?.at || 0)).slice(0, keys.length - 80)) delete logs[k];
      window.hub.kvSet(LOG_KEY, logs).catch?.(() => {});
    }, 300);
  }
  function log(chatId, entry) {
    const e = { id: entry.id || uid(), at: Date.now(), ...entry, what: R.redact(entry.what || ''), ...(entry.detail ? { detail: R.redact(entry.detail).slice(0, 600) } : {}) };
    loadLogs().then(() => {
      const k = chatId || 'app';
      const list = (logs[k] ||= []);
      // one line per tool call: the permission check's line (with its decision, backup…) wins over the engine's report
      const twin = entry.id ? list.find((x) => x.id === entry.id) : null;
      if (twin) { if (twin.result === 'done' && e.result !== 'done') { Object.assign(twin, e); persist(); document.dispatchEvent(new CustomEvent('hearth:access-log', { detail: { chatId: k, entry: twin, update: true } })); } return; } // (round 28) aiundo.js hears the copy kept
      list.push(e);
      if (list.length > LOG_MAX) list.splice(0, list.length - LOG_MAX);
      persist();
      document.dispatchEvent(new CustomEvent('hearth:access-log', { detail: { chatId: k, entry: e } }));
    });
    return e;
  }
  async function entries(chatId) { await loadLogs(); return (logs[chatId || 'app'] || []).slice(); }
  const ICON = { read: '👁', write: '✎', delete: '🗑', move: '⇄', run: '▶', install: '⬇', network: '🌐', publish: '🚀', system: '⚙', apps: '🪟', secrets: '🔑', password: '🔒', level: '🔓', folder: '📁', undo: '↶' };

  // Undo a write: the copy kept before it goes back (the current version is kept too), a new file goes to the Trash.
  async function undo(chatId, entryId) {
    await loadLogs();
    const list = logs[chatId || 'app'] || [];
    const e = entryId === 'last' || !entryId ? [...list].reverse().find((x) => x.action === 'write' && (x.backup || x.created) && !x.undone && x.target) : list.find((x) => x.id === entryId);
    if (!e) throw new Error('Nothing to undo.');
    if (e.undone) throw new Error('Already undone.');
    if (!e.backup && !e.created) throw new Error('No copy was kept for that one.');
    const { data } = await paths();
    if (await window.hub.fs.stat(e.target)) await window.hub.fs.copy(e.target, join(data, 'access-backups', safeId(chatId), `${Date.now()}-before-undo-${R.baseName(e.target)}`));
    if (e.backup) await window.hub.fs.copy(e.backup, e.target);
    else await window.hub.fs.trash([e.target]);
    e.undone = Date.now();
    persist();
    log(chatId, { action: 'undo', what: `Undid: ${e.what}`, target: e.target, result: e.backup ? 'restored' : 'trashed', by: 'you' });
    return e;
  }
  const safeId = (id) => String(id || 'app').replace(/[^\w-]/g, '_');
  // A copy of a file before a chat changes it (skipped for big files and folders); null when it doesn't exist yet.
  async function backup(chatId, file) {
    const st = await window.hub.fs.stat(file);
    if (!st) return { created: true };
    if (st.isDir || st.size > 25 * 1048576) return {};
    const { data } = await paths();
    const to = join(data, 'access-backups', safeId(chatId), `${Date.now()}-${R.baseName(file)}`);
    try { await window.hub.fs.copy(file, to); return { backup: to }; } catch { return {}; }
  }

  // Hearth's own deletes (and other streams'): to the Trash, logged.
  async function trash(paths0, { chatId = null, why = '' } = {}) {
    const r = await window.hub.fs.trash(paths0);
    for (const p of r.done) log(chatId, { action: 'delete', what: `Moved to the Trash: ${R.baseName(p)}`, target: p, result: 'trashed', why });
    return r;
  }

  // ---------- the approval card ----------
  let tray = null;
  const trayEl = () => (tray && tray.isConnected ? tray : (tray = document.body.appendChild(el('div', { class: 'access-tray', attrs: { 'aria-live': 'polite' } }))));
  async function headsUp(agentId, chatId, text) {
    const onScreen = agentId && typeof H !== 'undefined' && H.surfaceIdFor?.(H.activeId) === H.surfaceIdFor?.(agentId) && H.activeChat[agentId] === chatId;
    let focused = true;
    try { focused = await window.hub.isWindowFocused(); } catch { /* assume yes */ }
    if (onScreen && focused) return null;
    const name = agentOf(agentId)?.name || 'A chat';
    const t = toast(`${name} asks: ${text}`, { timeout: 15000, action: agentId && chatId ? { label: 'Open', fn: () => Native.open(agentId, chatId) } : undefined });
    if (!focused) { try { window.hub.flashWindow(); new Notification(`${name} asks permission`, { body: text }).onclick = () => { window.hub.showWindow?.(); if (agentId && chatId) Native.open(agentId, chatId); }; } catch { /* no notifications */ } }
    return t;
  }
  // Resolves { allow, always, note, timedOut }. In a reply that is streaming the card joins it; otherwise it waits in
  // the tray (bottom right), e.g. for Access.ask from an app window.
  function card({ agentId, chatId, action, what, where = '', why = '', detail = '', risk = 'high', canAlways = true, trashNote = false, who = '' }) {
    return new Promise((resolve) => {
      const name = who || agentOf(agentId)?.name || 'A chat';
      const node = el('div', { class: `access-card risk-${risk === 'low' ? 'low' : 'high'}`, attrs: { role: 'group', 'aria-label': `Permission: ${what}` } });
      const note = el('input', { class: 'access-note', placeholder: 'Note for the AI (optional)', maxLength: 300 });
      let headsNote = null;
      let timer = 0;
      const done = (r) => {
        if (node.classList.contains('answered')) return;
        clearTimeout(timer);
        node.classList.add('answered');
        node.replaceChildren(el('span', { class: 'access-done', text: `${r.allow ? '✓ Allowed' : r.timedOut ? '⏱ No answer, denied' : '✕ Denied'}${r.always ? ' for this chat' : ''} · ${short(what, 120)}` }));
        headsNote?.remove?.();
        if (node.parentElement === tray) setTimeout(() => node.remove(), 2500);
        resolve({ ...r, note: note.value.trim() });
      };
      const btn = (text, cls, r, title) => el('button', { type: 'button', class: cls, text, title, on: { click: () => done(r) } });
      node.append(
        el('div', { class: 'access-head' }, el('span', { class: 'access-ico', text: ICON[action] || '⚠' }), el('b', { text: `${name} wants to ${String(R.ACTION_WORD[action] || action || 'do this').toLowerCase()}` }), risk !== 'low' ? el('span', { class: 'access-risk', text: 'careful' }) : null),
        el('div', { class: 'access-what', text: short(R.redact(what), 220) }),
        where ? el('div', { class: 'access-where', text: `in ${short(where, 160)}` }) : null,
        why ? el('div', { class: 'access-why', text: `${why}${trashNote ? ' · Hearth sends it to the Trash (recoverable)' : ''}` }) : null,
        detail ? el('details', { class: 'access-detail' }, el('summary', { text: 'Details' }), el('pre', { text: R.redact(detail).slice(0, 1500) })) : null,
        el('div', { class: 'access-row' },
          btn('Allow once', 'primary small', { allow: true }),
          canAlways ? btn('Allow for this chat', 'ghost small', { allow: true, always: true }, 'Things like this stop asking in this chat (/access grants lists them)') : null,
          btn('Deny', 'ghost small danger', { allow: false }),
          note),
        el('i', { class: 'access-clock', style: { animationDuration: `${timeoutMs}ms` } }));
      note.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done({ allow: false }); } });
      node.addEventListener('expire', () => done({ allow: false, timedOut: true }));
      timer = setTimeout(() => done({ allow: false, timedOut: true }), timeoutMs);
      const live = chatId && typeof Native !== 'undefined' ? Native.liveCard?.(chatId, node) : null;
      if (!live) trayEl().append(node);
      document.dispatchEvent(new CustomEvent('hearth:needs-you', { detail: { kind: 'permission', agentId, chatId, who: name, text: `wants to ${String(R.ACTION_WORD[action] || action || 'do this').toLowerCase()}: ${short(R.redact(what), 120)}`, node, risk } })); // (round 27) activity.js
      headsUp(agentId, chatId, short(what, 80)).then((t) => { headsNote = t; });
      setTimeout(() => node.querySelector('button')?.focus?.({ preventScroll: true }), 60);
    });
  }
  // A command that needs a password: never typed into Hearth; the owner runs it in a terminal.
  function passwordCard(agentId, chatId, command) {
    const node = el('div', { class: 'access-card risk-high answered access-pw' },
      el('span', { class: 'access-done', text: `🔒 ${short(R.redact(command), 120)} needs a password. Hearth never handles passwords: run it yourself in a terminal.` }),
      el('button', { type: 'button', class: 'ghost small', text: 'Copy command', on: { click: () => navigator.clipboard.writeText(command).then(() => toast('Copied: paste it in a Terminal window', { timeout: 2200 })) } }));
    const live = chatId && typeof Native !== 'undefined' ? Native.liveCard?.(chatId, node) : null;
    if (!live) { trayEl().append(node); setTimeout(() => node.remove(), 20000); }
  }

  // ---------- the permission check (mcp/access-mcp.js → HubBridge 'access_check') ----------
  const allowed = (updatedInput) => ({ ok: true, value: { behavior: 'allow', updatedInput } });
  const denied = (message) => ({ ok: true, value: { behavior: 'deny', message } });
  async function check({ tool, input = {}, id, agentId, chatId, cwd }) {
    // the check itself is not a tool the model may use
    if (/^mcp__access__/.test(String(tool))) return denied('That tool is Hearth\'s own permission check; don\'t call it.');
    const chat = chatId && typeof Native !== 'undefined' ? await Native.load(chatId) : null;
    const acc = effective(chat, agentOf(agentId || chat?.agentId));
    agentId ||= chat?.agentId;
    const d = await paths();
    const c = R.classify({ tool, input, level: acc.level, folders: acc.folders, cwd: cwd || d.cwd, home: d.home });
    const cmdTool = tool === 'Bash' || tool === 'PowerShell'; // (winshell) Claude Code on Windows runs commands with PowerShell
    const detail = cmdTool ? String(input.command || '') : tool === 'Edit' ? `- ${short(input.old_string, 400)}\n+ ${short(input.new_string, 400)}` : tool === 'Write' ? `${String(input.content || '').length} characters` : JSON.stringify(input).slice(0, 600);
    const base = { id, tool, action: c.action, what: c.what, target: c.targets?.[0] || '', risk: c.risk, detail: cmdTool ? detail : '' };
    if (c.verdict === 'deny') {
      log(chatId, { ...base, result: 'refused', why: c.why });
      if (!c.password && (c.action === 'write' || c.action === 'run')) refused(chatId, { kind: c.action === 'write' ? 'level' : 'run', target: c.targets?.[0] || '' });
      if (c.password) { passwordCard(agentId, chatId, String(input.command || '')); return denied(`${c.why}. Don't retry it: ask the user to run it themselves in a Terminal window (Hearth never types passwords).`); }
      return denied(`${c.why}.`);
    }
    let by = 'auto';
    // a file you attached to one of your last messages may be read wherever it is
    const attached = c.action === 'read' && c.verdict === 'ask' && input.file_path && (chat?.messages || []).filter((m) => m.role === 'user').slice(-3).some((m) => String(m.sent || '').includes(String(input.file_path)));
    if (c.verdict === 'ask' && attached) by = 'attached';
    else if (c.verdict === 'ask') {
      if (c.grant && acc.grants.includes(c.grant)) by = 'grant';
      else {
        const r = await card({ agentId, chatId, action: c.action, what: c.what, where: c.where, why: c.why, detail, risk: c.risk, canAlways: Boolean(c.grant), trashNote: Boolean(c.trash) });
        if (!r.allow) {
          log(chatId, { ...base, result: r.timedOut ? 'timeout' : 'denied', why: c.why, by: 'you', ...(r.note ? { note: r.note } : {}) });
          // nobody answered a write outside the folders: the note says why it didn't happen and offers the folder
          if (r.timedOut && c.action === 'write' && c.targets?.[0] && !R.insideAny(R.norm(c.targets[0], '', d.home), acc.folders.map((f) => R.norm(f, '', d.home)))) refused(chatId, { kind: 'outside', target: c.targets[0] });
          return denied(r.timedOut ? 'The user didn\'t answer in time, so Hearth denied this. Ask in your reply instead.' : `The user denied this.${r.note ? ` Their note: ${r.note}` : ''}`);
        }
        by = 'you';
        if (r.always && c.grant && chat) addGrant(chat, c.grant);
        if (r.note) base.note = r.note;
      }
    }
    // deletes Hearth can do itself go to the Trash; the command becomes a harmless echo so the run carries on
    if (c.trash?.length) {
      // (round 28, aiundo) a copy first (files up to 25 MB), so Undo can put it back without digging in the Trash
      const kept = new Map();
      for (const p of c.trash) { const k = await backup(chatId, p).catch(() => ({})); if (k.backup) kept.set(p, k.backup); }
      const r = await window.hub.fs.trash(c.trash);
      for (const p of r.done) log(chatId, { ...base, id: undefined, action: 'delete', what: `Moved to the Trash: ${R.baseName(p)}`, target: p, result: 'trashed', by, ...(kept.has(p) ? { backup: kept.get(p) } : {}) });
      if (r.failed.length && !r.done.length) return denied(`Hearth couldn't move it to the Trash (${r.failed[0].error}).`);
      log(chatId, { ...base, result: 'rewritten', why: 'deleted with the Trash instead', by });
      const msg = `Hearth moved ${r.done.length} item${r.done.length === 1 ? '' : 's'} to the Trash (recoverable)${r.failed.length ? `; ${r.failed.length} could not be moved` : ''}.`;
      return allowed({ ...input, command: `echo ${JSON.stringify(msg)}` });
    }
    let kept = {};
    if (c.backup) {
      const file = /^([A-Za-z]:[\\/]|\/)/.test(String(input.file_path || '')) ? String(input.file_path) : c.backup;
      kept = await backup(chatId, file);
      base.target = file;
    }
    log(chatId, { ...base, result: by === 'auto' ? 'allowed' : 'approved', by, ...kept });
    return allowed(input);
  }

  // Other features ask through the same card (apps, Adobe, deploy, paid credits). risk 'low' | 'high'.
  async function ask({ agentId = null, chatId = null, action = 'run', target = '', risk = 'high', detail = '', what = '', who = '' } = {}) {
    chatId ||= agentId && typeof H !== 'undefined' ? H.activeChat?.[agentId] || null : null;
    const chat = chatId && typeof Native !== 'undefined' ? await Native.load(chatId).catch(() => null) : null;
    const grant = `ext:${action}:${target}`;
    const words = what || `${R.ACTION_WORD[action] || action}${target ? `: ${target}` : ''}`;
    if (chat?.access?.grants?.includes(grant)) { log(chatId, { action, what: words, target, result: 'approved', by: 'grant', risk }); return true; }
    const r = await card({ agentId, chatId, action, what: words, why: '', detail: typeof detail === 'string' ? detail : JSON.stringify(detail, null, 1), risk, canAlways: Boolean(chat), who });
    if (r.allow && r.always && chat) addGrant(chat, grant);
    log(chatId, { action, what: words, target, risk, result: r.allow ? 'approved' : r.timedOut ? 'timeout' : 'denied', by: 'you', ...(r.note ? { note: r.note } : {}) });
    return Boolean(r.allow);
  }

  // ---------- why something didn't happen (round 32): one line in the chat when the reply ends ----------
  // kind: 'level' (it may only read) · 'run' (it may not run commands) · 'outside' (not one of its folders) ·
  // 'sandbox' (Astra's sandbox blocked a command) · (winshell) 'policy' (Claude Code refused its command tool before
  // Hearth's check) · 'winsandbox' (Astra's sandbox refused commands by policy, as on Windows). The line names the reason and offers the one fix: Allow edits /
  // Allow commands / Allow this folder, plus Open AI setup (where the AI's own setting lives).
  const refusals = new Map(); // chatId → [{ kind, target }]
  const writes = new Map(); // tool call id → file (Claude's edits: to read the engine's own refusals, e.g. without Hearth's check)
  function refused(chatId, r) {
    if (!chatId) return;
    const list = refusals.get(chatId) || [];
    if (!list.some((x) => x.kind === r.kind && R.dirName(x.target) === R.dirName(r.target))) list.push(r);
    refusals.set(chatId, list.slice(-4));
  }
  // Hearth's own words for a refusal (the engines word theirs differently)
  const DENIAL = /requested permissions|haven't granted|not allowed|permission denied|operation not permitted|read-only file system|sandbox|not writable|outside the (chat|allowed)/i;
  async function whyNot(chat, target) {
    const acc = effective(chat);
    if (R.rank(acc.level) < R.rank('write')) return 'level';
    const { home } = await paths();
    if (/^([A-Za-z]:[\\/]|\/|~)/.test(String(target || '')) && !R.insideAny(R.norm(target, '', home), acc.folders.map((f) => R.norm(f, '', home)))) return 'outside';
    return null;
  }
  // the nearest folder that exists, for "Allow this folder"
  async function folderOf(target) {
    let d = R.dirName(target);
    for (let i = 0; i < 8 && d; i++) { const st = await window.hub.fs.stat(d).catch(() => null); if (st?.isDir) return d; const up = R.dirName(d); if (up === d) break; d = up; }
    return null;
  }
  const absPath = (cmd) => (String(cmd || '').match(/(?:^|[\s"'=])((?:\/|[A-Za-z]:[\\/])[^\s"';|&<>]+)/) || [])[1] || '';
  // ⋯ AI setup (options.js loads on first use)
  const openSetup = (agentId) => Promise.resolve(window.Lazy?.load?.('options')).then(() => (typeof Options !== 'undefined' ? Options.open({ agentId }) : panel(agentId))).catch(() => panel(agentId));
  async function refusalNote(chatId) {
    const list = refusals.get(chatId);
    refusals.delete(chatId);
    if (!list?.length || typeof Native === 'undefined') return;
    const chat = await Native.load(chatId).catch(() => null);
    if (!chat) return;
    await paths().catch(() => {}); // (winshell) whether this is Windows, for the wording and the fix
    const agentId = chat.agentId;
    const name = agentOf(agentId)?.name || 'The AI';
    const acc = effective(chat);
    const mine = acc.from === 'chat';
    const r = list.find((x) => x.kind === 'outside') || list[0];
    const file = r.target ? `**${R.baseName(r.target)}**` : 'a file';
    const dir = r.kind === 'outside' || r.kind === 'sandbox' ? await folderOf(r.target) : null;
    const more = list.length > 1 ? ` (+${list.length - 1} more in the log)` : '';
    const text = {
      level: `✎ ${name} couldn't change ${file}: ${mine ? 'this chat' : 'it'} may only read files (${R.LEVEL_LABEL[acc.level]}).${more}`,
      run: `▶ ${name} couldn't run a command: ${mine ? 'this chat' : 'it'} may read and edit files but not run commands (${R.LEVEL_LABEL[acc.level]}).${more}`,
      outside: `✎ ${name} couldn't write ${file}: it's outside the folders ${mine ? 'this chat' : 'it'} may use${dir ? ` (\`${short(dir, 70)}\` isn't one of them)` : ''}.${more}`,
      sandbox: `✎ ${name}'s sandbox blocked a change${dir ? ` in \`${short(dir, 70)}\`` : ''}: it may only change files in its own folders.${more}`,
      policy: `▶ ${name} couldn't run a command: Claude Code blocked its command tool${r.tool ? ` (${r.tool})` : ''} before Hearth could check it${r.why ? ` ("${short(r.why, 70)}")` : ''}. If it happens again, update Claude Code.${more}`,
      winsandbox: `▶ ${name} couldn't run a command: its sandbox blocks commands${onWindows() ? ' on Windows' : ''} (blocked by policy).${R.rank(acc.level) < R.rank('write') ? ' At Read & write or Full you can let it run them without its sandbox, in AI setup.' : onWindows() ? ' You can let it run commands without its sandbox (its folders stay its working place).' : ''}${more}`,
    }[r.kind];
    const raise = (level) => (mine ? setLevel(agentId, level, chat) : setAiLevel(agentId, level));
    const allowFolder = (p) => (mine ? addFolder(agentId, p, chat) : addAiFolder(agentId, p));
    const done = (box, msg) => { box?.remove?.(); toast(msg, { timeout: 2200 }); };
    const acts = [];
    if (r.kind === 'level') acts.push({ label: 'Allow edits', title: `${R.LEVEL_LABEL.write}: ${R.LEVEL_HINT.write}`, run: (box) => raise('write').then(() => done(box, 'Edits allowed: ask again')).catch((err) => toast(err.message, { type: 'error' })) });
    if (r.kind === 'run') acts.push({ label: 'Allow commands', title: `${R.LEVEL_LABEL.full}: ${R.LEVEL_HINT.full}`, run: (box) => raise('full').then(() => done(box, 'Commands allowed (risky ones still ask): ask again')).catch((err) => toast(err.message, { type: 'error' })) });
    // (winshell) Astra on Windows: the warned opt-in, from the note itself
    if (r.kind === 'winsandbox' && onWindows() && R.rank(acc.level) >= R.rank('write') && agentOf(agentId)?.astraNoSandbox !== true) acts.push({ label: 'Run without its sandbox…', title: 'Asks first: deletes can\'t go to the Trash without the sandbox', run: (box) => setNoSandbox(agentId, true).then((on) => { if (on) done(box, 'Astra runs commands without its sandbox now: ask again'); }).catch((err) => toast(err.message, { type: 'error' })) });
    if (dir) acts.push({ label: 'Allow this folder', title: dir, run: (box) => allowFolder(dir).then(() => done(box, `${R.baseName(dir)} added: ask again`)).catch((err) => toast(err.message, { type: 'error' })) });
    // (round 32, aicheck.js) one obvious next step: a short real test with a fix on each failing line, in AI setup
    acts.push({ label: 'Check this AI', title: 'A short real test: found and signed in, reads, writes, runs a command, with a fix on each failing line (uses a few tokens)', run: () => Promise.resolve(window.Lazy?.load?.('options')).then(() => AiCheck.openAndRun(agentId)).catch((err) => toast(err.message, { type: 'error' })) });
    acts.push({ label: 'Open AI setup', title: 'Files on this computer: the level and folders for every chat with this AI', run: () => openSetup(agentId) });
    if (H.activeChat?.[agentId] === chatId && Native.note) Native.note(agentId, text, { id: 'access-refused', actions: acts });
    else toast(text.replace(/\*\*|`/g, ''), { timeout: 8000, action: { label: 'Open', fn: () => Native.open(agentId, chatId) } });
  }

  // ---------- what the engines report (reads; Astra's commands and edits) + Astra's .hearth-trash ----------
  async function onEngineEvent(e) {
    if (!e?.chatId) return;
    // a refusal the engine reported itself (Astra's sandbox; Claude without Hearth's check): why, for the note
    if (e.access?.failed) {
      const chat = await Native.load(e.chatId).catch(() => null);
      if (!chat) return;
      const a = e.access;
      for (const ch of a.changes || [{ path: a.target }]) {
        const target = a.action === 'run' ? absPath(a.target) : ch.path;
        const level = effective(chat).level;
        // (winshell) refused by the engine's own policy: below Full that's "no commands"; at Full, Claude Code's tool list
        // or Astra's sandbox (on Windows it can block every command)
        const kind = a.policy ? (R.rank(level) < R.rank('full') && agentOf(chat.agentId)?.engine !== 'codex' ? 'run' : agentOf(chat.agentId)?.engine === 'codex' ? 'winsandbox' : 'policy')
          : a.action === 'run' ? (R.rank(level) < R.rank('write') ? 'level' : 'sandbox') : (await whyNot(chat, target)) || 'sandbox';
        log(e.chatId, { action: a.action === 'run' ? 'run' : 'write', what: a.action === 'run' ? `Blocked: ${short(a.target || a.why, 140)}` : `Not written: ${R.baseName(target)}`, target: a.action === 'run' ? '' : target, result: 'refused', why: { level: 'read-only level', outside: 'outside its folders', sandbox: 'its sandbox', run: 'commands not allowed at this level', policy: `refused by Claude Code before Hearth's check${a.why ? `: ${a.why}` : ''}`, winsandbox: `its sandbox (blocked by policy)${a.why ? `: ${a.why}` : ''}` }[kind], tool: a.tool });
        refused(e.chatId, { kind, target, tool: a.tool, why: a.why || '' });
      }
      return;
    }
    if (e.type === 'step' && e.id && writes.has(e.id)) {
      const w = writes.get(e.id);
      writes.delete(e.id);
      if (e.ok === false && DENIAL.test(String(e.summary || '')) && !/user denied|didn't answer/i.test(String(e.summary || ''))) {
        const chat = await Native.load(e.chatId).catch(() => null);
        const kind = chat ? await whyNot(chat, w) : null;
        if (kind) refused(e.chatId, { kind, target: w });
      }
      return;
    }
    if (e.type === 'tool' && e.access) {
      const chat = await Native.load(e.chatId).catch(() => null);
      if (!chat) return;
      if (e.access.action === 'write' && e.access.id && e.access.target) { writes.set(e.access.id, e.access.target); if (writes.size > 200) writes.delete(writes.keys().next().value); }
      if (effective(chat).level === 'off') return;
      const a = e.access;
      if (a.changes) { for (const ch of a.changes) log(e.chatId, { action: ch.kind === 'delete' ? 'delete' : 'write', what: `${ch.kind === 'add' ? 'Created' : ch.kind === 'delete' ? 'Deleted' : 'Edited'} ${R.baseName(ch.path)}`, target: ch.path, result: 'done', tool: a.tool }); return; }
      log(e.chatId, { id: a.id, action: a.action, what: a.action === 'run' ? `Run: ${short(a.target, 140)}` : `${a.tool} ${R.baseName(a.target)}`, target: a.action === 'run' ? '' : a.target, result: 'done', tool: a.tool, ...(a.action === 'run' ? { detail: a.target } : {}) });
      return;
    }
    if (e.type === 'done' || e.type === 'error' || e.type === 'stopped') {
      if (refusals.has(e.chatId)) setTimeout(() => refusalNote(e.chatId).catch((err) => console.warn(err)), 300); // after the reply settles
      const chat = await Native.load(e.chatId).catch(() => null);
      const acc = chat ? effective(chat) : null;
      if (!acc || R.rank(acc.level) < R.rank('write') || agentOf(chat.agentId)?.engine !== 'codex') return;
      for (const f of acc.folders) {
        const bin = join(f, '.hearth-trash');
        if (!await window.hub.fs.stat(bin)) continue;
        const items = await window.hub.fs.list(bin).catch(() => []);
        if (!items.length) continue;
        const r = await window.hub.fs.trash(items.map((x) => x.path));
        for (const p of r.done) log(e.chatId, { action: 'delete', what: `Moved to the Trash: ${R.baseName(p)}`, target: p, result: 'trashed', by: 'auto' });
      }
    }
  }

  // ---------- UI: badge, menu, panel, log ----------
  function badgeText(acc) { return acc.level === 'off' ? '' : `${acc.level === 'full' ? '🔓' : '📁'} ${R.LEVEL_LABEL[acc.level]}`; }
  function refreshBadge(agentId) { try { if (typeof Native !== 'undefined') Native.refresh(agentId, { keepScroll: true }); } catch { /* not mounted */ } }
  // native.js render hook: a small chip after the chat's title (only when access is on)
  function paintBadge(agentId, v, chat) {
    if (!v?.meta) return;
    const acc = effective(chat, agentOf(agentId));
    const old = v.meta.querySelector('.access-badge');
    if (acc.level === 'off' || (acc.from !== 'chat' && acc.from !== 'ai')) { old?.remove(); return; }
    // (round 16) the same badge stays as it is (every redraw of the chat used to replace it)
    const text = badgeText(acc); const title = `File access: ${R.LEVEL_LABEL[acc.level]} (${R.LEVEL_HINT[acc.level]}) · ${acc.from === 'chat' ? 'this chat\'s own setting' : 'from AI setup'}\n${acc.folders.join('\n') || 'no folder'}\nClick to change`;
    if (old && old.textContent === text && old.title === title) return;
    old?.remove();
    v.meta.append(el('button', { type: 'button', class: 'access-badge', text, title, on: { click: (ev) => { ev.stopPropagation(); panel(agentId); } } }));
  }
  // The chat ⋯ menu entry: "As in AI setup" (the default), or this chat's own level, then folders, the log and the
  // rest in the panel.
  function menuItem(agentId, chat) {
    const agent = agentOf(agentId);
    const acc = effective(chat, agent);
    const ai = aiEffective(agent);
    const own = acc.from === 'chat';
    return { label: 'Access', hint: `${R.LEVEL_LABEL[acc.level]}${own ? ' (this chat)' : ''}`, items: () => [
      { label: `As in AI setup (${R.LEVEL_LABEL[ai.level]})`, hint: 'every chat with this AI', checked: !own, action: () => { if (chat || chatNow(agentId)) { useAi(agentId, chat); toast(`Access: as in AI setup (${R.LEVEL_LABEL[ai.level]})`, { timeout: 1600 }); } } },
      ...R.LEVELS.map((l) => ({ label: R.LEVEL_LABEL[l], hint: `only this chat: ${R.LEVEL_HINT[l]}`, checked: own && acc.level === l, action: () => setLevel(agentId, l, chat).then(() => toast(`This chat: ${R.LEVEL_LABEL[l]}`, { timeout: 1600 })).catch((err) => toast(err.message, { type: 'error' })) })),
      '-',
      { label: 'Folders, permissions and log…', key: '/access', action: () => panel(agentId) },
      { label: 'Activity log', key: '/access log', action: () => logPanel(agentId) },
    ] };
  }
  function dialog(title, body, cls = '') {
    const d = el('dialog', { class: `ui-modal access-modal ${cls}` }, el('form', { method: 'dialog' }, el('h2', { text: title }), body, el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { class: 'primary', text: 'Done' }))));
    d.addEventListener('close', () => setTimeout(() => d.remove(), 0));
    document.body.append(d);
    d.showModal();
    return d;
  }
  function panel(agentId) {
    const chat = chatFor(agentId);
    if (!chat) { toast('Open a chat first.'); return null; }
    const body = el('div', { class: 'access-panel' });
    const paint = () => {
      const acc = effective(chat);
      const seg = el('div', { class: 'access-levels', attrs: { role: 'radiogroup' } }, R.LEVELS.map((l) => el('button', { type: 'button', class: `access-level${acc.level === l ? ' on' : ''}`, attrs: { role: 'radio', 'aria-checked': String(acc.level === l) }, title: R.LEVEL_HINT[l],
        on: { click: () => setLevel(agentId, l, chat).then(paint).catch((err) => toast(err.message, { type: 'error' })) } }, el('b', { text: R.LEVEL_LABEL[l] }), el('small', { text: R.LEVEL_HINT[l] }))));
      const folders = el('div', { class: 'access-folders' }, acc.folders.length ? acc.folders.map((f, i) => el('div', { class: 'access-folder' },
        el('span', { class: 'access-fname', text: `📁 ${R.baseName(f)}`, title: f }),
        el('span', { class: 'access-fpath', text: f.length > 52 ? `…${f.slice(-51)}` : f }),
        el('button', { type: 'button', class: 'ghost small', text: 'Open', on: { click: () => window.hub.fs.open(f) } }),
        el('button', { type: 'button', class: 'ghost small', text: '✕', title: 'Remove from this chat (the folder stays)', on: { click: () => { removeFolder(agentId, i + 1, chat); paint(); } } }))) : el('p', { class: 'hint', text: 'No folder yet: a level other than Off makes this chat its own project folder.' }),
      el('button', { type: 'button', class: 'ghost small access-add', text: '＋ Add a folder…', on: { click: () => addFolder(agentId, null, chat).then(paint).catch((err) => toast(err.message, { type: 'error' })) } }));
      dropZone(folders, async (files) => { for (const f of files) { const p = window.hub.pathForFile(f); if (p) await addFolder(agentId, p, chat).catch((err) => toast(err.message, { type: 'error' })); } paint(); }, { hint: 'Drop folders this chat may use' });
      const grants = acc.grants.length ? el('div', { class: 'access-grants' }, el('h4', { text: 'Allowed without asking in this chat' }), acc.grants.map((g) => el('div', { class: 'access-grant' }, el('span', { text: g.replace(/^ext:/, '') }), el('button', { type: 'button', class: 'ghost small', text: 'Ask again', on: { click: () => { chat.access.grants = chat.access.grants.filter((x) => x !== g); save(chat); paint(); } } })))) : null;
      const recent = el('div', { class: 'access-recent' }, el('h4', {}, 'Recent activity ', el('button', { type: 'button', class: 'link', text: 'full log', on: { click: () => logPanel(agentId) } })));
      entries(chat.id).then((list) => { const last = list.slice(-6).reverse(); recent.append(...(last.length ? last.map((e) => logRow(chat.id, e, paint)) : [el('p', { class: 'hint', text: 'Nothing yet.' })])); });
      // (round 32) whose setting this is: the AI's (AI setup, every chat) or this chat's own
      const ai = aiEffective(agentOf(agentId));
      const whose = el('p', { class: 'hint access-whose' }, acc.from === 'chat'
        ? ['This chat has its own setting. ', el('button', { type: 'button', class: 'link', text: `Use AI setup's instead (${R.LEVEL_LABEL[ai.level]})`, on: { click: () => { useAi(agentId, chat); paint(); } } })]
        : ['From AI setup: every chat with this AI uses it. Picking a level here sets this chat only. ', el('button', { type: 'button', class: 'link', text: 'Open AI setup', on: { click: () => { document.querySelector('.access-modal')?.close(); openSetup(agentId); } } })]);
      body.replaceChildren(seg, whose, el('h4', { text: 'Folders' }), folders, grants || '', recent,
        el('p', { class: 'hint access-foot', text: acc.level === 'full' ? 'Safe things inside the folders happen silently; deletes, moves, installs, network, publishing and anything outside the folders show a card here first. Deletes go to the Trash.' : 'Risky things show a card in the chat first. Full adds commands; anything outside the folders asks first.' }));
    };
    paint();
    return dialog(`Access · ${short(chat.title, 40)}`, body);
  }
  // (round 32) ⋯ AI setup → "Files on this computer": the AI's own level and folders, used by every chat of that AI
  // unless a chat sets its own (then a line says so, with "Use this for this chat too").
  function aiSection(agentId, { repaint } = {}) {
    const agent = agentOf(agentId);
    const box = el('div', { class: 'access-ai' });
    if (!agent) return box;
    const again = () => { paint(); repaint?.(); };
    const fail = (err) => toast(err.message, { type: 'error' });
    const paint = () => {
      const a = agentOf(agentId) || agent;
      const acc = aiEffective(a);
      const home = dirs?.home || '';
      const sel = el('select', { class: 'opt-pick', attrs: { 'aria-label': 'Files on this computer' } }, R.LEVELS.map((l) => el('option', { value: l, text: R.LEVEL_LABEL[l], selected: acc.level === l, title: R.LEVEL_HINT[l] })));
      sel.addEventListener('change', () => setAiLevel(agentId, sel.value).then(() => { toast(`${a.name}: ${R.LEVEL_LABEL[sel.value]} in every chat`, { timeout: 1800 }); again(); }).catch(fail));
      const row = el('div', { class: 'opt-row', title: 'What it may do with files on this computer, in every chat with it (it asks before anything risky)' }, el('span', { class: 'opt-label', text: 'Files on this computer' }), sel);
      const kids = [row];
      if (acc.level !== 'off') {
        const open = a.engine === 'codex' && a.astraNoSandbox === true && acc.level !== 'read'; // (winshell) no sandbox: its own row says what that means
        if (!open) kids.push(el('p', { class: 'opt-hint access-ai-hint', text: `${{ read: 'It reads files in these folders', write: 'It reads and edits files in these folders', full: a.engine === 'codex' ? 'It reads, edits and runs commands in these folders (sandboxed, no network)' : 'It reads, edits and runs commands in these folders; deletes go to the Trash and risky things ask you first' }[acc.level]}. ${a.engine === 'codex' ? 'Anywhere else is blocked.' : 'Anywhere else it asks first.'}` }));
        kids.push(el('div', { class: 'access-ai-folders' }, acc.folders.map((f, i) => el('div', { class: `access-folder${home && f === home ? ' access-home' : ''}` },
          el('span', { class: 'access-fname', text: `${home && f === home ? '⚠ ' : '📁 '}${home && f === home ? 'Your home folder' : R.baseName(f)}`, title: f }),
          el('span', { class: 'access-fpath', text: f.length > 44 ? `…${f.slice(-43)}` : f }),
          acc.from === 'ai' ? el('button', { type: 'button', class: 'ghost small', text: '✕', title: 'It stops using this folder (the folder stays)', on: { click: () => removeAiFolder(agentId, i + 1).then(again).catch(fail) } }) : null))));
        kids.push(el('div', { class: 'opt-row access-ai-add' },
          el('button', { type: 'button', class: 'ghost small', text: '＋ Add a folder…', on: { click: () => addAiFolder(agentId).then(again).catch(fail) } }),
          home && acc.folders.includes(home) ? null : el('button', { type: 'button', class: 'ghost small', text: 'My home folder', title: 'Everywhere in your home folder (asks you first)', on: { click: () => addHome(agentId).then((r) => { if (r) again(); }).catch(fail) } })));
      }
      // (winshell) Astra on Windows: its sandbox can block every command; a warned opt-in runs them without it
      if (a.engine === 'codex' && (onWindows() || a.astraNoSandbox) && (R.rank(acc.level) >= R.rank('write') || a.astraNoSandbox)) {
        const on = a.astraNoSandbox === true;
        const b = el('button', { type: 'button', class: 'opt-switch', role: 'switch', attrs: { 'aria-checked': String(on), 'aria-label': 'Run commands without its sandbox' }, on: { click: () => setNoSandbox(agentId, !on).then(again).catch(fail) } }, el('i'));
        kids.push(el('label', { class: 'opt-row access-ai-nosandbox', title: 'On Windows, Codex\'s sandbox can block every command ("blocked by policy"). Without it, commands run like your own: its folders stay its working place, but nothing stops a command elsewhere and deletes can\'t go to the Trash.' }, el('span', { class: 'opt-label', text: `${on ? '⚠ ' : ''}Run commands without its sandbox` }), b));
        if (on) kids.push(el('p', { class: 'opt-hint access-ai-hint', text: R.rank(acc.level) < R.rank('write') ? 'Only used at Read & write or Full.' : 'It reads, edits and runs commands without its sandbox: it starts in these folders and is told to stay there, but nothing enforces it, and a delete it runs itself skips the Trash.' }));
      }
      // the open chat set its own: say so, one click follows the AI again
      const chat = chatNow(agentId);
      if (chat && effective(chat, a).from === 'chat') {
        const own = effective(chat, a);
        kids.push(el('p', { class: 'opt-hint access-ai-own' }, `The open chat has its own setting (${R.LEVEL_LABEL[own.level]}). `, el('button', { type: 'button', class: 'ghost small', text: 'Use this one there too', on: { click: () => { useAi(agentId, chat); again(); } } })));
      }
      box.replaceChildren(...kids);
    };
    paint();
    if (!dirs) paths().then(paint).catch(() => {});
    // a change from elsewhere (the chat's "Allow this folder", a command) shows here too
    const onChange = (e) => { if (!box.isConnected) document.removeEventListener('hearth:file-access', onChange); else if (e.detail?.agentId === agentId) paint(); };
    document.addEventListener('hearth:file-access', onChange);
    return box;
  }
  const RESULT = { allowed: '✓', approved: '✓ you', denied: '✕ denied', refused: '⛔ refused', timeout: '⏱ no answer', trashed: '🗑 Trash', rewritten: '↪ Trash', done: '·', set: '·', restored: '↶', undone: '↶' };
  function logRow(chatId, e, after) {
    const canUndo = (e.action === 'write' ? e.backup || e.created : e.action === 'delete' && e.backup) && !e.undone && e.target; // (round 28) a delete with a copy too
    return el('div', { class: `access-entry r-${e.result}`, title: [new Date(e.at).toLocaleString(), e.why, e.note ? `Your note: ${e.note}` : '', e.detail].filter(Boolean).join('\n') },
      el('span', { class: 'access-eico', text: ICON[e.action] || '·' }),
      el('span', { class: 'access-etext', text: short(e.what, 110) }),
      el('span', { class: 'access-eres', text: e.undone ? '↶ undone' : RESULT[e.result] || e.result || '' }),
      canUndo ? el('button', { type: 'button', class: 'ghost small', text: 'Undo', on: { click: () => undo(chatId, e.id).then(() => { toast(`Undone: ${R.baseName(e.target)}`, { timeout: 1800 }); after?.(); }).catch((err) => toast(err.message, { type: 'error' })) } }) : null,
      e.target && /^(write|read)$/.test(e.action) && !e.undone ? el('button', { type: 'button', class: 'ghost small', text: 'Show', on: { click: () => window.hub.fs.reveal(e.target).catch(() => toast('Not there anymore')) } }) : null);
  }
  async function logPanel(agentId) {
    const chat = chatFor(agentId);
    if (!chat) { toast('Open a chat first.'); return null; }
    const body = el('div', { class: 'access-log' });
    const paint = async () => {
      const list = (await entries(chat.id)).reverse();
      body.replaceChildren(...(list.length ? list.slice(0, 200).map((e) => logRow(chat.id, e, paint)) : [el('p', { class: 'hint', text: 'Nothing read, written, deleted or run in this chat yet.' })]));
    };
    await paint();
    return dialog(`Activity · ${short(chat.title, 40)}`, body, 'access-log-modal');
  }

  // ---------- chat command ----------
  function summary(chat) {
    const acc = effective(chat);
    return `**Access: ${R.LEVEL_LABEL[acc.level]}** (${R.LEVEL_HINT[acc.level]})${{ chat: ' · this chat\'s own setting', ai: ' · from AI setup', workspace: ' · from the agent\'s project folder' }[acc.from] || ''}\n${acc.folders.map((f, i) => `${i + 1}. \`${f}\``).join('\n') || 'No folders.'}${acc.grants.length ? `\nAllowed without asking: ${acc.grants.map((g) => `\`${g.replace(/^ext:/, '')}\``).join(', ')}` : ''}`;
  }
  async function command(args, ctx) {
    args = String(args || '').trim();
    const [verb0, ...rest] = args.split(/\s+/);
    const verb = (verb0 || '').toLowerCase();
    const arg = rest.join(' ').trim();
    const chat = chatFor(ctx.agentId, ctx.chat);
    if (!chat) return 'Run it in a chat.';
    if (!verb) {
      ctx.note?.(summary(chat), { id: 'access', actions: [...R.LEVELS.map((l) => ({ label: R.LEVEL_LABEL[l], run: () => setLevel(ctx.agentId, l, chat).then(() => ctx.say?.(summary(chat))) })), { label: 'Folders…', run: () => panel(ctx.agentId) }, { label: 'Log', run: () => logPanel(ctx.agentId) }] });
      return ctx.note ? null : summary(chat);
    }
    if (['off', 'read', 'write', 'full', 'rw', 'edit'].includes(verb) || /^read\s*&\s*write$/i.test(args.trim())) {
      const a = await setLevel(ctx.agentId, /^read\s*&/i.test(args.trim()) ? 'write' : verb, chat);
      return `Access for this chat: **${R.LEVEL_LABEL[a.level]}** (${R.LEVEL_HINT[a.level]})${a.folders.length ? ` in ${a.folders.map((f) => `\`${f}\``).join(', ')}` : ''}. From your next message.`;
    }
    if (verb === 'add') { const a = await addFolder(ctx.agentId, arg || null, chat); return a ? `Folders: ${a.folders.map((f) => `\`${f}\``).join(', ')} (${R.LEVEL_LABEL[a.level]}).` : null; }
    if (verb === 'remove' || verb === 'rm') return `Removed \`${removeFolder(ctx.agentId, arg, chat)}\` from this chat's folders (the folder itself stays).`;
    if (verb === 'folders') return summary(chat);
    if (verb === 'panel' || verb === 'settings') { panel(ctx.agentId); return null; }
    if (verb === 'log') {
      if (arg === 'text' || ctx.source === 'code') { const list = (await entries(chat.id)).slice(-20); return list.length ? list.map((e) => `${ICON[e.action] || '·'} ${short(e.what, 100)} — ${e.undone ? 'undone' : e.result}`).join('\n') : 'Nothing logged in this chat yet.'; }
      logPanel(ctx.agentId); return null;
    }
    if (verb === 'undo') { const e = await undo(chat.id, arg || 'last'); return `Undone: ${e.what}.`; }
    if (verb === 'grants') return summary(chat);
    if (verb === 'forget') { if (chat.access) { chat.access.grants = []; save(chat); } return 'This chat asks again for everything risky.'; }
    if (verb === 'open') { const f = effective(chat).folders[0]; if (!f) return 'No folder yet.'; window.hub.fs.open(f); return null; }
    return 'Use: /access [off | read | write | full | add <folder> | remove <n> | log | undo | forget | open]';
  }

  function init() {
    if (typeof HubBridge !== 'undefined') {
      HubBridge.register(['access_'], async (tool, args) => {
        if (tool === 'access_check') return check(args || {});
        if (tool === 'access_ask') return { ok: true, value: await ask(args || {}) };
        return { ok: false, error: `Unknown tool ${tool}` };
      });
    }
    window.hub.onEngineEvent((e) => { onEngineEvent(e).catch((err) => console.warn(err)); });
    // (round 32) steps (a tool call's result) come on the live channel: Claude's own refusals, Astra's blocked commands
    window.hub.onEngineLive?.((e) => { if (e?.type === 'step' && (e.access?.failed || writes.has(e.id))) onEngineEvent(e).catch((err) => console.warn(err)); });
    if (typeof Native !== 'undefined' && Native.hooks?.render) {
      Native.hooks.render.push(paintBadge);
      // the cards go when the reply ends; the reply keeps one small line of what it did with your files (→ the log)
      Native.hooks.finish.push((event, chat, extras) => {
        const since = [...(chat.messages || [])].reverse().find((m) => m.role === 'user')?.at || 0;
        const list = (logs?.[chat.id] || []).filter((e) => e.at >= since && !/^(level|folder|undo)$/.test(e.action));
        if (!list.length) return;
        const n = (f) => list.filter(f).length;
        extras.access = { n: list.length, written: n((e) => e.action === 'write' && /allowed|approved|done/.test(e.result)), trashed: n((e) => e.result === 'trashed'), denied: n((e) => /denied|timeout/.test(e.result)), refused: n((e) => e.result === 'refused') };
      });
      Native.hooks.message.push((node, m, index, agent) => {
        const a = m?.access;
        if (!a?.n || node.querySelector('.access-sum')) return;
        const parts = [`${a.n} file action${a.n === 1 ? '' : 's'}`, a.written && `${a.written} written`, a.trashed && `${a.trashed} to the Trash`, a.denied && `${a.denied} denied`, a.refused && `${a.refused} refused`].filter(Boolean);
        node.append(el('button', { type: 'button', class: 'access-sum', text: `🔐 ${parts.join(' · ')}`, title: 'What this reply read, wrote, deleted and ran (with Undo)', on: { click: (ev) => { ev.stopPropagation(); logPanel(agent?.id || H.activeId); } } }));
      });
    }
    if (typeof Commands !== 'undefined' && !Commands.get('access')) {
      const LEVEL_OPTS = R.LEVELS.map((l) => ({ value: l, label: `${l}`, hint: `${R.LEVEL_LABEL[l]}: ${R.LEVEL_HINT[l]}` }));
      Commands.register({
        name: 'access', area: 'Chat', args: '[off | read | write | full | add <folder> | remove <n> | log | undo | forget]',
        desc: 'What this chat may do with your files: a level, its folders, the activity log and Undo',
        keywords: 'files permission folder read write delete run commands bash trash allow deny log undo sandbox',
        examples: ['/access full', '/access add', '/access log', '/access undo'],
        complete: (a) => [...LEVEL_OPTS, { value: 'add', hint: 'add a folder (picker)' }, { value: 'remove', hint: 'remove folder n' }, { value: 'log', hint: 'what it read, wrote, deleted, ran' }, { value: 'undo', hint: 'undo the last write' }, { value: 'forget', hint: 'ask again for everything' }, { value: 'open', hint: 'open its folder' }].filter((o) => o.value.startsWith(String(a || '').trim().toLowerCase())),
        run: (a, ctx) => command(a, ctx),
      });
    }
    if (typeof Keys !== 'undefined') Keys.add({ area: 'Chat', keys: '⋯ → Access', what: 'what the chat may do with your files' });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  return {
    ask, check, trash, effective, sendOptions, setLevel, addFolder, removeFolder, isOn, menuItem, panel, logPanel, entries, undo, log,
    // (round 32) the AI's own setting (AI setup), and a chat going back to it
    aiEffective, setAiLevel, addAiFolder, removeAiFolder, addHome, useAi, aiSection, setNoSandbox, onWindows,
    // native.js: a folder dropped on a chat becomes one of its folders
    async maybeFolder(agentId, p) {
      const st = await window.hub.fs.stat(p).catch(() => null);
      if (!st?.isDir) return false;
      const a = await addFolder(agentId, p);
      toast(`${R.baseName(p)} added to this chat's folders (${R.LEVEL_LABEL[a.level]})`, { timeout: 5000, action: a.level === 'read' ? { label: 'Allow edits', fn: () => setLevel(agentId, 'write') } : undefined });
      return true;
    },
    _setTimeout(ms) { timeoutMs = ms; }, _paths: paths, _setWindows(on) { winTest = Boolean(on); },
  };
})();
