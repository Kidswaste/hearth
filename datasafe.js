// 🛟 Data safety in the window (round 43, datasafe): when something of yours couldn't be read (Windows: a file held for
// a moment by an antivirus, OneDrive / iCloud for Windows, the search indexer; an online-only placeholder; a damaged file)
// Hearth says so calmly — "nothing was changed" — instead of starting empty, and 🛟 Recover… brings back chats, memory
// lines, agents / settings and tool data from every copy still around (datasafemain.js scans; it only ever adds).
//   · the card       bottom right, once per new problem: what couldn't be read, Retry, Recover…, Later
//   · recover()      🛟 Recover…: Lab scenes (tools/three-scenesafe.js), chats (Recently deleted, sync's set-asides, the
//                    cloud folder, backups), memory lines, agents and settings, tool data kept aside; tick → Bring back
//   · load / save    for new code: DataSafe.load(name, fallback) → { value, ok, state }; DataSafe.save(name, value, loaded)
//                    refuses a store that wasn't read (dev/datasafe-scan.js flags code that reads with a fallback and saves
//                    without this, or the store's own guard)
// Ways in: Settings › Advanced › Backup and files › Backups… › Recover…, Ctrl/⌘+K "Recover…", the card, /recover.
const DataSafe = (() => {
  const api = window.hub.datasafe;
  let cardEl = null; let dismissed = ''; let busy = false;
  const day = (t) => { try { return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // ---------- for new code: a read that says what happened, a save that won't go over what wasn't read ----------
  async function load(name, fallback = null) {
    const r = await window.hub.kvGet(name, fallback, { status: true });
    if (r?.state === 'ok') return { value: r.value, ok: true, state: 'ok' };
    if (r?.state === 'missing') return { value: fallback, ok: true, state: 'missing' };
    return { value: r?.prev !== undefined ? r.prev : fallback, ok: false, state: 'unreadable' };
  }
  async function save(name, value, loaded) {
    if (!loaded?.ok) { const again = await load(name, null); if (!again.ok) return { refused: true }; if (loaded) loaded.ok = true; }
    return window.hub.kvSet(name, value);
  }

  // ---------- the calm card ----------
  function rowsOf(h) {
    const rows = [];
    if (h.config) rows.push(`Settings and agents${h.config.from === 'copy' ? ` (using the automatic copy from ${day(h.config.copyAt)})` : ' (using the last good version)'}`);
    if (h.chats) rows.push(h.chats.why === 'folder' ? 'The chats folder (the list shows what it had)' : `${plural(h.chats.n || 1, 'chat file')} (still in the list)`);
    const seen = new Set();
    for (const d of h.doubts || []) {
      if (d.name.startsWith('chat:') || seen.has(d.label)) continue;
      seen.add(d.label);
      rows.push(`${d.label}${d.why === 'copy' ? ' (using its last copy)' : d.why === 'damaged' ? ' (damaged: its copy is used)' : ''}`);
    }
    for (const x of h.held || []) if (!seen.has(x.label)) { seen.add(x.label); rows.push(`${x.label} (a save is waiting for it)`); }
    return rows;
  }
  function closeCard() { cardEl?.remove(); cardEl = null; }
  async function check() {
    if (!api?.health) return null;
    const h = await api.health().catch(() => null);
    if (!h) return null;
    const rows = rowsOf(h);
    if (!rows.length) { closeCard(); return h; }
    const key = rows.join('|');
    if (key === dismissed) return h;
    showCard(rows);
    return h;
  }
  function showCard(rows) {
    closeCard();
    cardEl = el('div', { class: 'ds-card', role: 'alertdialog', 'aria-label': 'Some of your data couldn\'t be read' },
      el('b', { text: '🛟 Some of your data couldn\'t be read just now' }),
      el('p', { text: 'Nothing was changed: Hearth won\'t save over it until it reads again. Another program (an antivirus, OneDrive, iCloud) may be holding it for a moment.' }),
      el('ul', {}, rows.slice(0, 6).map((r) => el('li', { text: r }))),
      el('div', { class: 'ds-actions' },
        el('button', { type: 'button', class: 'primary small', text: 'Retry', on: { click: retry } }),
        el('button', { type: 'button', class: 'ghost small', text: 'Recover…', on: { click: () => { closeCard(); recover(); } } }),
        el('button', { type: 'button', class: 'ghost small', text: 'Later', on: { click: () => { dismissed = rows.join('|'); closeCard(); } } })));
    document.body.append(cardEl);
  }
  async function retry() {
    const r = await api.recheck().catch(() => null);
    if (!r) return;
    if (r.still?.length) { toast('Still held by another program. Nothing was changed; try again in a moment.', { timeout: 6000 }); return; }
    closeCard();
    try { H.chats = await window.hub.listChats(); if (typeof Panel !== 'undefined') Panel.render(); } catch { /* the list stays */ } // a held chat's real row
    toast('Everything reads again. Reload to see all of it?', { timeout: 15000, action: { label: 'Reload', fn: () => window.hub.reloadWindow?.() || location.reload() } });
  }
  let doubtT = 0;
  api?.onDoubt?.(() => { clearTimeout(doubtT); doubtT = setTimeout(check, 600); });

  // ---------- 🛟 Recover… ----------
  async function labScenes() {
    try { if (!window.LabSceneSafe && window.Lazy) await window.Lazy.load('lab'); await window.LabSceneSafe?.recover(); } catch (err) { toast(err.message, { type: 'error' }); }
  }
  async function recover({ quick = false } = {}) {
    if (busy) return null;
    busy = true;
    const dlg = el('dialog', { class: 'ui-modal ds-recover' });
    const body = el('div', { class: 'ds-body' }, el('p', { class: 'hint', text: 'Looking in Recently deleted, your chats folder (chats the list doesn\'t show), automatic copies, what sync kept aside, the cloud folder, your backups and Claude / Codex\'s own records of your conversations…' }));
    const go = el('button', { type: 'button', class: 'primary small', text: 'Bring back', disabled: true });
    dlg.append(el('form', { method: 'dialog' }, el('h2', { text: '🛟 Recover…' }),
      el('p', { class: 'hint', text: 'Things that aren\'t in your lists any more. Ticked ones are added next to yours: nothing of yours is replaced or deleted.' }),
      el('div', { class: 'ds-lab' }, el('span', { text: 'Lab scenes' }), el('button', { type: 'button', class: 'ghost small', text: 'Look for lost scenes…', on: { click: () => { dlg.close(); labScenes(); } } })),
      body, el('div', { class: 'dialog-actions' }, go, el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Close' }))));
    dlg.addEventListener('close', () => { dlg.remove(); busy = false; });
    document.body.append(dlg);
    dlg.showModal();
    const r = await api.scan({ quick }).catch((err) => ({ error: err.message }));
    if (!dlg.isConnected) return r;
    const boxes = [];
    const tick = (key, on, label, sub) => { const b = el('input', { type: 'checkbox', checked: on }); b.dataset.key = key; boxes.push(b); return el('label', { class: 'ds-row' }, b, el('span', {}, el('span', { class: 'ds-name', text: label }), sub ? el('small', { class: 'hint', text: sub }) : null)); };
    const sec = (title, rows) => (rows.length ? el('section', {}, el('h3', { text: title }), ...rows) : null);
    const agentName = (id) => H.agent?.(id)?.name || id;
    const parts = [
      sec(`Chats (${r.chats?.length || 0})`, (r.chats || []).map((c) => tick(c.key, !c.deleted && !c.other, c.title, `${plural(c.messages || 0, 'message')} · ${day(c.updatedAt)} · ${c.state === 'more' ? `yours has ${c.yours ?? '?'}, this copy more (comes in next to it)` : agentName(c.agentId)} · from ${c.from}${c.deleted ? ' (you deleted it)' : ''}`))),
      sec(`Memory (${r.memory?.length || 0} lines)`, (r.memory || []).map((m) => tick(m.key, !m.other, m.line, `${m.scope === 'shared' ? 'For every AI' : m.scope.startsWith('agent:') ? `For ${agentName(m.scope.slice(6))}` : m.scope} · from ${m.from}`))),
      sec(`Settings (${r.settings?.length || 0})`, (r.settings || []).map((s) => tick(s.key, !s.other, s.what === 'agent' ? `The AI “${s.name}”` : `The setting “${s.name}”`, `from ${s.from}`))),
      sec(`Tool data (${r.kv?.length || 0})`, (r.kv || []).map((k) => tick(k.key, !k.other, k.label, k.other ? `from ${k.from}: ${k.count} · joined with yours (that folder isn't changed)` : `a copy kept aside ${day(k.at)} held ${k.count}, now ${k.now} · joined with yours`))),
    ].filter(Boolean);
    if (r.error) body.replaceChildren(el('p', { class: 'hint', text: `Couldn't look: ${calmError(r.error)}` })); // (round 45, errorcalm)
    else if (!parts.length) body.replaceChildren(el('p', { class: 'hint', text: `Nothing is missing: everything in ${plural((r.sources || []).length, 'place')} Hearth looked is already in your lists.` }));
    else body.replaceChildren(...parts);
    const paint = () => { const n = boxes.filter((b) => b.checked).length; go.disabled = !n; go.textContent = n ? `Bring back ${n}` : 'Bring back'; };
    boxes.forEach((b) => b.addEventListener('change', paint)); paint();
    go.addEventListener('click', async () => {
      go.disabled = true;
      try {
        const done = await api.recover(boxes.filter((b) => b.checked).map((b) => b.dataset.key));
        dlg.close();
        if (done.chats.length) { H.chats = await window.hub.listChats(); if (typeof Panel !== 'undefined') Panel.render(); }
        // (round 78, guardloss78) the stores Recover wrote, as an arrival: what waits here is written first (merged with what
        // came back), each is read again and shown, then acked; only one nobody here could take in still asks for a reload
        let stale = done.kv.length;
        if (done.rels?.length && window.StoreAck) { try { const a = await StoreAck.arrived(done.rels.map((rel) => ({ rel, kind: 'kv', from: 'recover' }))); stale = [...a.kept, ...a.unknown].filter((r) => r !== 'memory.json' && !(done.mainHeld || []).includes(r)).length; } catch { /* the reload below */ } }
        const said = [done.chats.length && plural(done.chats.length, 'chat'), done.memory && plural(done.memory, 'memory line'), done.agents && plural(done.agents, 'AI'), done.settings && plural(done.settings, 'setting'), done.kv.length && plural(done.kv.length, 'tool store')].filter(Boolean);
        toast(said.length ? `🛟 Brought back ${said.join(', ')}${stale ? ' (reload to see the tool data)' : ''}` : 'Nothing new to bring back', { timeout: 9000, ...(stale ? { action: { label: 'Reload', fn: () => window.hub.reloadWindow?.() || location.reload() } } : {}) });
        window.DataSafe.last = done;
      } catch (err) { go.disabled = false; toast(err.message, { type: 'error' }); }
    });
    return r;
  }

  // ---------- ways in ----------
  if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Recover… (lost chats, memory, settings, Lab scenes)', () => recover());
  if (typeof Commands !== 'undefined' && !Commands.get?.('recover')) {
    Commands.register({ name: 'recover', desc: 'Find chats, memory lines, settings and tool data that aren\'t in your lists any more (automatic copies, sync, backups) and bring them back', area: 'App', keywords: 'lost missing gone deleted restore backup chats memory settings', examples: ['/recover', '/recover list'],
      args: '[list]', complete: () => [{ value: 'list', hint: 'answer here in the chat' }],
      run: async (args, ctx) => {
        if (!/^list/i.test(String(args || '').trim())) { recover(); return; }
        const r = await api.scan({});
        const n = (r.chats?.length || 0) + (r.memory?.length || 0) + (r.settings?.length || 0) + (r.kv?.length || 0);
        ctx.say(n ? `Not in your lists (${n}): ${plural(r.chats.length, 'chat')}, ${plural(r.memory.length, 'memory line')}, ${plural(r.settings.length, 'setting')}, ${plural(r.kv.length, 'tool store')}.\n${(r.chats || []).slice(0, 12).map((c) => `· ${c.title} (${plural(c.messages || 0, 'message')}, from ${c.from})`).join('\n')}\nRun /recover to pick what to bring back.` : 'Nothing is missing: every copy Hearth knows of is already in your lists.');
      } });
  }
  setTimeout(check, 300); // what the start couldn't read (the reads happened before this file loaded)

  return { check, recover, retry, closeCard, load, save, rowsOf };
})();
window.DataSafe = DataSafe;
