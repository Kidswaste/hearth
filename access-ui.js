// File access's dialogs (round 139, room139): the Access panel of a chat (its level, folders, what it may do without
// asking, recent activity), the activity log and AI setup's "Files on this computer" box, once part of access.js. They
// open from a click (the chat's 🔐 chip, its ⋯ menu, /access panel, ⋯ AI setup), so they wait in a lazy group
// ('accessui', a calm moment after the start). access.js keeps every check, ask and card, and its Access.panel /
// logPanel / aiSection load this group first (AI setup's group, 'options', comes after it, so aiSection stays a plain call).
const AccessUI = (() => {
  const U = Access._ui;
  const { R, ICON, short, chatFor, chatNow, agentOf, effective, aiEffective, entries, undo, save, paths, openSetup, setLevel, useAi, addFolder, removeFolder,
    setAiLevel, addAiFolder, removeAiFolder, addHome, onWindows, setNoSandbox } = U;
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
    const box = el('div', { class: 'access-ai', attrs: { 'data-agent': agentId } });
    if (!agent) return box;
    const again = () => { paint(); repaint?.(); };
    const fail = (err) => toast(err.message, { type: 'error' });
    const paint = () => {
      const a = agentOf(agentId) || agent;
      const acc = aiEffective(a);
      const home = U.dirs()?.home || '';
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
      // (round 35, twocomputers) the other computer's folders: used here when found at the same place, else one
      // click ("Pick this folder on this computer")
      if (acc.level !== 'off' && typeof TwoComputers !== 'undefined') { const t = TwoComputers.filesRows?.(a, again); if (t) kids.push(t); }
      box.replaceChildren(...kids);
    };
    paint();
    if (!U.dirs()) paths().then(paint).catch(() => {});
    // a change from elsewhere (the chat's "Allow this folder", a command) shows here too
    // (round 34, lightweight) one listener for every box: a closed ⋯ AI setup's box is let go at once, not
    // kept (with its whole sheet) until a file-access change happens to come by
    box.lwPaint = paint; // (held by the box only: a box nobody shows is collected with its paint)
    for (const r of aiBoxes) if (!r.deref()) aiBoxes.delete(r);
    aiBoxes.add(new WeakRef(box));
    if (!aiHeard) { aiHeard = true; document.addEventListener('hearth:file-access', (e) => { for (const r of aiBoxes) { const b = r.deref(); if (!b) aiBoxes.delete(r); else if (b.isConnected && b.dataset.agent === e.detail?.agentId) b.lwPaint(); } }); }
    return box;
  }
  const aiBoxes = new Set(); // WeakRefs of the boxes shown (data-agent: whose)
  let aiHeard = false;
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
  return { panel, logPanel, aiSection, logRow, dialog };
})();
