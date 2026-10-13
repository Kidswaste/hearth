// Chat file access (round 14): how a chat reads, writes, deletes and runs things on this computer, and how it asks.
//   · One control per chat: ⋯ → Access (or /access): Off · Read · Read & write · Full, plus the folders it may use (its
//     own project folder by default; add more with the picker, by dropping a folder on the chat or /access add).
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
  let dirs = null; // { data, home, cwd }
  const uid = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const short = (s, n = 90) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const sep = (p) => (/^[A-Za-z]:\\/.test(p) || p.includes('\\') ? '\\' : '/');
  const join = (a, ...b) => [a.replace(/[\\/]+$/, ''), ...b].join(sep(a));

  async function paths() {
    if (dirs) return dirs;
    const attach = await window.hub.attachmentsDir();
    const data = attach.replace(/[\\/]attachments[\\/]?$/, '');
    dirs = { data, home: await window.hub.fs.home(), cwd: join(data, 'workspace') };
    return dirs;
  }

  // ---------- settings (stored on the chat: chat.access = { level, folders, grants }) ----------
  const chatNow = (agentId) => (typeof Native !== 'undefined' ? Native.chatOf?.(agentId) : null);
  const agentOf = (agentId) => (typeof H !== 'undefined' ? H.agent(agentId) : null);
  // What a chat has now: its own setting, else the agent's project folder (as before round 14), else off.
  function effective(chat, agent = chat ? agentOf(chat.agentId) : null) {
    if (chat?.access && R.LEVELS.includes(chat.access.level)) return { level: chat.access.level, folders: chat.access.folders || [], grants: chat.access.grants || [], own: true };
    if (agent?.workspace) return { level: agent.engine === 'codex' && agent.codexFiles !== 'edit' ? 'read' : 'write', folders: [agent.workspace], grants: [], own: false };
    return { level: 'off', folders: [], grants: [], own: false };
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
  async function setLevel(agentId, level, chat = null) {
    if (level === 'rw' || level === 'edit' || /read\s*&\s*write/i.test(level)) level = 'write';
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
  // What a run sends (native.js send options): nothing unless the chat set its own access.
  function sendOptions(chat) {
    if (!chat?.access || !R.LEVELS.includes(chat.access.level)) return {};
    return { access: { level: chat.access.level, folders: (chat.access.folders || []).slice(0, 12) } };
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
      if (twin) { if (twin.result === 'done' && e.result !== 'done') { Object.assign(twin, e); persist(); } return; }
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
    const detail = tool === 'Bash' ? String(input.command || '') : tool === 'Edit' ? `- ${short(input.old_string, 400)}\n+ ${short(input.new_string, 400)}` : tool === 'Write' ? `${String(input.content || '').length} characters` : JSON.stringify(input).slice(0, 600);
    const base = { id, tool, action: c.action, what: c.what, target: c.targets?.[0] || '', risk: c.risk, detail: tool === 'Bash' ? detail : '' };
    if (c.verdict === 'deny') {
      log(chatId, { ...base, result: 'refused', why: c.why });
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
          return denied(r.timedOut ? 'The user didn\'t answer in time, so Hearth denied this. Ask in your reply instead.' : `The user denied this.${r.note ? ` Their note: ${r.note}` : ''}`);
        }
        by = 'you';
        if (r.always && c.grant && chat) { chat.access = { ...effective(chat), grants: [...new Set([...acc.grants, c.grant])] }; delete chat.access.own; save(chat); }
        if (r.note) base.note = r.note;
      }
    }
    // deletes Hearth can do itself go to the Trash; the command becomes a harmless echo so the run carries on
    if (c.trash?.length) {
      const r = await window.hub.fs.trash(c.trash);
      for (const p of r.done) log(chatId, { ...base, id: undefined, action: 'delete', what: `Moved to the Trash: ${R.baseName(p)}`, target: p, result: 'trashed', by });
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
    if (r.allow && r.always && chat) { chat.access = { ...effective(chat), grants: [...new Set([...(chat.access?.grants || []), grant])] }; delete chat.access.own; save(chat); }
    log(chatId, { action, what: words, target, risk, result: r.allow ? 'approved' : r.timedOut ? 'timeout' : 'denied', by: 'you', ...(r.note ? { note: r.note } : {}) });
    return Boolean(r.allow);
  }

  // ---------- what the engines report (reads; Astra's commands and edits) + Astra's .hearth-trash ----------
  async function onEngineEvent(e) {
    if (!e?.chatId) return;
    if (e.type === 'tool' && e.access) {
      const chat = await Native.load(e.chatId).catch(() => null);
      if (!chat || effective(chat).level === 'off') return;
      const a = e.access;
      if (a.changes) { for (const ch of a.changes) log(e.chatId, { action: ch.kind === 'delete' ? 'delete' : 'write', what: `${ch.kind === 'add' ? 'Created' : ch.kind === 'delete' ? 'Deleted' : 'Edited'} ${R.baseName(ch.path)}`, target: ch.path, result: 'done', tool: a.tool }); return; }
      log(e.chatId, { id: a.id, action: a.action, what: a.action === 'run' ? `Run: ${short(a.target, 140)}` : `${a.tool} ${R.baseName(a.target)}`, target: a.action === 'run' ? '' : a.target, result: 'done', tool: a.tool, ...(a.action === 'run' ? { detail: a.target } : {}) });
      return;
    }
    if (e.type === 'done' || e.type === 'error' || e.type === 'stopped') {
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
    if (acc.level === 'off' || !acc.own) { old?.remove(); return; }
    // (round 16) the same badge stays as it is (every redraw of the chat used to replace it)
    const text = badgeText(acc); const title = `File access: ${R.LEVEL_LABEL[acc.level]} (${R.LEVEL_HINT[acc.level]})\n${acc.folders.join('\n') || 'no folder'}\nClick to change`;
    if (old && old.textContent === text && old.title === title) return;
    old?.remove();
    v.meta.append(el('button', { type: 'button', class: 'access-badge', text, title, on: { click: (ev) => { ev.stopPropagation(); panel(agentId); } } }));
  }
  // The chat ⋯ menu entry: the four levels in a submenu, then folders, the log and the rest in the panel.
  function menuItem(agentId, chat) {
    const acc = effective(chat, agentOf(agentId));
    return { label: 'Access', hint: R.LEVEL_LABEL[acc.level], items: () => [
      ...R.LEVELS.map((l) => ({ label: R.LEVEL_LABEL[l], hint: R.LEVEL_HINT[l], checked: acc.level === l, action: () => setLevel(agentId, l, chat).then(() => toast(`Access: ${R.LEVEL_LABEL[l]}`, { timeout: 1600 })).catch((err) => toast(err.message, { type: 'error' })) })),
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
      body.replaceChildren(seg, el('h4', { text: 'Folders' }), folders, grants || '', recent,
        el('p', { class: 'hint access-foot', text: acc.level === 'full' ? 'Safe things inside the folders happen silently; deletes, moves, installs, network, publishing and anything outside the folders show a card here first. Deletes go to the Trash.' : 'Risky things show a card in the chat first. Change it any time: /access read · write · full · off' }));
    };
    paint();
    return dialog(`Access · ${short(chat.title, 40)}`, body);
  }
  const RESULT = { allowed: '✓', approved: '✓ you', denied: '✕ denied', refused: '⛔ refused', timeout: '⏱ no answer', trashed: '🗑 Trash', rewritten: '↪ Trash', done: '·', set: '·', restored: '↶', undone: '↶' };
  function logRow(chatId, e, after) {
    const canUndo = e.action === 'write' && (e.backup || e.created) && !e.undone && e.target;
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
    return `**Access: ${R.LEVEL_LABEL[acc.level]}** (${R.LEVEL_HINT[acc.level]})${acc.own || acc.level === 'off' ? '' : ' · from the agent\'s project folder'}\n${acc.folders.map((f, i) => `${i + 1}. \`${f}\``).join('\n') || 'No folders.'}${acc.grants.length ? `\nAllowed without asking: ${acc.grants.map((g) => `\`${g.replace(/^ext:/, '')}\``).join(', ')}` : ''}`;
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
    // native.js: a folder dropped on a chat becomes one of its folders
    async maybeFolder(agentId, p) {
      const st = await window.hub.fs.stat(p).catch(() => null);
      if (!st?.isDir) return false;
      const a = await addFolder(agentId, p);
      toast(`${R.baseName(p)} added to this chat's folders (${R.LEVEL_LABEL[a.level]})`, { timeout: 5000, action: a.level === 'read' ? { label: 'Allow edits', fn: () => setLevel(agentId, 'write') } : undefined });
      return true;
    },
    _setTimeout(ms) { timeoutMs = ms; }, _paths: paths,
  };
})();
