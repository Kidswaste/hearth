// 💡 Quick idea (round 71, quickidea71), the main window's side. The small window (tray › 💡 Quick idea…, or Ctrl+Alt+I
// from any app: quickidea-window.js) saves an idea through the main process (quickideamain.js, the only writer of the
// inbox, kv 'quick-ideas'); this file:
//   · puts a ✦ Quest / 📁 Project idea in its place, quietly (the main process asks with 'tray:ideas'; the window never
//     comes forward): a saved idea in Sidequest (Codex's QuestCore.saveIdea, through the ✦ tracker's careful writer
//     QuestHud.write: the Studio's own mutate when it's open) or one line in a project's notes (Projects.setNotes).
//     A Move to… takes it out of the old place first (an idea already made into a quest stays a quest);
//   · the 💡 Ideas inbox: every idea, newest first, with ▶ for a voice memo, Move to… and Delete (to the inbox's Trash:
//     Restore, or Empty the Trash: voice memos then go to the computer's Trash). Reached from the rail's ⋯, the ✦ quest
//     tracker (its ⋯ More and a "💡 N ideas waiting" row), the small window's "💡 All ideas", Ctrl/⌘+K and /idea;
//   · 🎵 Music ideas in the Sound desk's Sessions panel (tools/bouncelog.js asks sessionsSection).
// Lazy group 'quickidea' (tier use): nothing loads before the first idea or the first look at the inbox.
const QuickIdeas = (() => {
  const C = QuickIdeaCore;
  const hub = () => window.hub?.quickIdea;
  let dlg = null, player = null, delivering = null, lastList = null;
  const failed = new Map(); // idea id → why it couldn't be put in its place (shown on its row, with Try again)

  async function op(a) {
    const h = hub(); if (!h) throw Error('💡 Ideas needs the Hearth app.');
    const r = await h.op(a); if (!r?.ok) throw Error(r?.error || 'The ideas inbox didn’t answer.');
    return r.value;
  }
  const list = async () => (lastList = await op({ op: 'list' }));

  // ---------- putting an idea in its place ----------
  async function questWrite(fn) { await Lazy.load('questhud'); return QuestHud.write(fn); }
  async function project(id) { await Lazy.load('projects'); await Projects.ready(); const p = Projects.get(id); if (!p) throw Error('That project isn’t there any more. Move the idea somewhere else.'); return p; }
  async function unplace(pl) {
    if (pl?.dest === 'quest' && pl.questIdea) {
      await questWrite((s) => { const k = (s.ideas || []).find((x) => x.id === pl.questIdea); if (k && !k.questId) s.ideas = s.ideas.filter((x) => x !== k); }); // made into a quest already: it stays a quest
    } else if (pl?.dest === 'project' && pl.projectId && pl.line) {
      await Lazy.load('projects'); await Projects.ready(); const p = Projects.get(pl.projectId);
      if (p) { const r = C.removeNote(p.notes, pl.line); if (r.removed) { Projects.setNotes(p, r.notes); await Projects.flush(); } }
    }
  }
  async function place(i) {
    if (i.placed && !C.sameTarget(i.placed, i.to)) { await unplace(i.placed); await op({ op: 'placed', id: i.id, placed: null }); }
    const t = i.to;
    if (t.dest === 'quest') {
      const q = C.questIdea(i); const r = await questWrite((s) => QuestCore.saveIdea(s, q));
      return op({ op: 'placed', id: i.id, placed: { dest: 'quest', questIdea: r.result.id } });
    }
    if (t.dest === 'project') {
      const p = await project(t.projectId), line = C.noteLine(i);
      Projects.setNotes(p, C.addNote(p.notes, line)); await Projects.flush();
      return op({ op: 'placed', id: i.id, placed: { dest: 'project', projectId: p.id, line } });
    }
    return op({ op: 'placed', id: i.id, placed: { dest: t.dest } });
  }
  // every idea not yet where it goes (one pass at a time; a failure stays on its row with Try again)
  // (asked again while a pass runs: one more pass after it, so a Move made meanwhile is never missed)
  let again = null;
  function deliver() {
    if (delivering) return (again ||= delivering.catch(() => {}).then(() => { again = null; return deliver(); }));
    return (delivering = (async () => {
      const st = await list(); let n = 0;
      for (const i of C.pending(st)) {
        try { await place(i); failed.delete(i.id); n++; } catch (err) { failed.set(i.id, calmError(err)); }
      }
      if (n || failed.size) await list().catch(() => {});
      paint();
      return n;
    })().finally(() => { delivering = null; }));
  }
  async function moveTo(i, to) {
    await op({ op: 'move', id: i.id, to }); failed.delete(i.id);
    await deliver();
    const now = lastList?.ideas.find((x) => x.id === i.id);
    if (failed.has(i.id)) toast(`Not moved: ${failed.get(i.id)}`, { type: 'error' });
    else toast(`Moved to ${C.label(now?.to || to)} · ${C.whereWords(now?.to || to)}`, { timeout: 2600 });
  }
  async function remove(i) {
    if (i.placed && (i.placed.dest === 'quest' || i.placed.dest === 'project')) await unplace(i.placed);
    await op({ op: 'trash', id: i.id }); failed.delete(i.id); await list(); paint();
    toast('Idea moved to the inbox’s Trash.', { timeout: 5000, action: { label: 'Undo', fn: () => restore(i).catch((err) => toast(calmError(err), { type: 'error' })) } });
  }
  async function restore(i) { await op({ op: 'restore', id: i.id }); await deliver(); toast(`Back in ${C.label(i.to)}.`, { timeout: 2200 }); }

  // ---------- going there ----------
  async function openWhere(i) {
    const t = i.to; close();
    if (t.dest === 'quest') { await Lazy.load('questhud'); await QuestHud.openStudio(null, 'catalog'); setTimeout(() => { const f = document.querySelector('.qj-catalog-kept'); if (f) { f.open = true; f.scrollIntoView?.({ block: 'start' }); } }, 120); return; } // Life › Find a quest › Saved ideas
    if (t.dest === 'project') { await Lazy.load('projects'); return Projects.openHome(t.projectId); }
    if (t.dest === 'music') { await Lazy.load('creative'); return BounceLog.run(''); }
    return open();
  }

  // ---------- menus ----------
  async function recentProjects() { try { await Lazy.load('projects'); await Projects.ready(); return Projects.live().slice(0, 8); } catch { return []; } }
  async function moveItems(i) {
    const ps = await recentProjects();
    return C.ORDER.map((d) => {
      if (d === 'project') return { label: `${C.DESTS.project.icon} Project`, items: ps.length ? ps.map((p) => ({ label: `📁 ${p.name}`, checked: i.to.dest === 'project' && i.to.projectId === p.id, action: () => moveTo(i, { dest: 'project', projectId: p.id, projectName: p.name }).catch((err) => toast(calmError(err), { type: 'error' })) })) : [{ label: 'No projects yet', disabled: true }] };
      return { label: `${C.DESTS[d].icon} ${C.DESTS[d].name} · ${C.DESTS[d].where}`, checked: i.to.dest === d, action: () => moveTo(i, { dest: d }).catch((err) => toast(calmError(err), { type: 'error' })) };
    });
  }
  async function rowMenu(i, x, y) {
    const mv = await moveItems(i);
    showMenu(x, y, [
      { label: 'Move to…', items: mv },
      { label: `Open ${C.label(i.to)}`, action: () => openWhere(i).catch((err) => toast(calmError(err), { type: 'error' })) },
      i.memo ? { label: 'Show the voice memo file', action: () => op({ op: 'reveal', id: i.id }).catch((err) => toast(calmError(err), { type: 'error' })) } : null,
      { label: 'Copy the words', action: () => copyText(i.text || C.title(i)) },
      '-',
      { label: 'Delete (to the Trash)', action: () => remove(i).catch((err) => toast(calmError(err), { type: 'error' })) },
    ].filter(Boolean));
  }

  // ---------- the 💡 Ideas inbox ----------
  function playMemo(i, b) {
    if (player && player.dataset.id === i.id && !player.paused) { player.pause(); b.textContent = '▶'; return; }
    player?.pause(); player = new Audio(WinMac.fileUrl(i.memo.file)); player.dataset.id = i.id;
    player.addEventListener('ended', () => { b.textContent = '▶'; }, { once: true });
    player.play().then(() => { b.textContent = '■'; }).catch(() => toast('That voice memo couldn’t be played (its file may have moved).', { type: 'error' }));
  }
  const btn = (text, run, cls = '', title = '') => el('button', { type: 'button', class: `qi-btn ${cls}`, text, title: title || null, on: { click: (e) => { e.stopPropagation(); Promise.resolve(run(e)).catch((err) => toast(calmError(err), { type: 'error' })); } } });
  function row(i, { trash = false } = {}) {
    const pend = !trash && !C.placedOk(i);
    const sub = trash ? `Deleted ${timeAgo(i.deletedAt)} · was in ${C.label(i.to)}` : pend ? (failed.has(i.id) ? `Not in ${C.label(i.to)} yet: ${failed.get(i.id)}` : `Putting it in ${C.whereWords(i.to)}…`) : `${C.whereWords(i.to)} · ${timeAgo(i.at)}`;
    const r = el('li', { class: `qi-row${pend ? ' pending' : ''}${failed.has(i.id) ? ' failed' : ''}`, dataset: { idea: i.id } },
      el('span', { class: 'qi-where', text: C.label(i.to), title: C.whereWords(i.to) }),
      el('div', { class: 'qi-main' }, el('strong', { class: 'qi-title', text: C.title(i, 120) }),
        i.text && i.text.includes('\n') ? el('span', { class: 'qi-more', text: C.cut(i.text.split('\n').slice(1).join(' '), 160) }) : null,
        el('span', { class: 'qi-sub', text: sub })));
    const acts = el('div', { class: 'qi-acts' });
    if (i.memo) { const p = btn('▶', () => playMemo(i, p), 'qi-play', `Play the voice memo (${Math.round(i.memo.seconds)} s)`); p.setAttribute('aria-label', `Play the voice memo of ${C.title(i)}`); acts.append(p); }
    if (trash) acts.append(btn('Restore', () => restore(i).then(() => list()).then(paint), 'qi-restore', 'Back in the inbox, and back where it went'));
    else {
      if (failed.has(i.id)) acts.append(btn('Try again', () => { failed.delete(i.id); return deliver(); }, 'qi-retry'));
      acts.append(btn('Move to…', (e) => { const b = e.currentTarget.getBoundingClientRect(); return moveItems(i).then((items) => showMenu(b.left, b.bottom + 4, items)); }, 'qi-move', 'Put it somewhere else: 🎵 Music, ✦ Quest, 📁 a project or 💬 Later'));
      acts.append(btn('Delete', () => remove(i), 'qi-del', 'To the inbox’s Trash (Restore brings it back)'));
    }
    r.append(acts);
    if (!trash) r.addEventListener('contextmenu', (e) => { e.preventDefault(); rowMenu(i, e.clientX, e.clientY); });
    return r;
  }
  function keyWords() {
    const k = lastList?.key; // from 'list' (quickidea:op key) when known
    return k?.key ? (k.ok ? WinMac.keyLabel(k.key.replace(/^Control\b/, 'Ctrl')) : null) : null;
  }
  function paint() {
    if (!dlg) return;
    const st = lastList || { ideas: [], trash: [], counts: { all: 0 } };
    const body = dlg.querySelector('.qi-body'); const scroll = body.scrollTop;
    const items = [];
    if (!st.ideas.length) items.push(el('p', { class: 'qi-empty', text: 'No ideas yet. Whenever one comes to you, click 💡 Quick idea… in the tray menu (or the button above), type it or hold 🎙 and say it, then click where it goes.' }));
    else items.push(el('ul', { class: 'qi-list' }, st.ideas.map((i) => row(i))));
    if (st.trash.length) {
      const fold = el('details', { class: 'qi-trash' }, el('summary', { text: `🗑 Trash · ${st.trash.length}` }),
        el('p', { class: 'qi-sub', text: 'Deleted ideas wait here for 30 days. Their voice memos go to your computer’s Trash when they leave.' }),
        el('ul', { class: 'qi-list' }, st.trash.map((i) => row(i, { trash: true }))),
        btn('Empty the Trash', async () => { if (!(await Modal.confirm('Empty the Trash?', `${st.trash.length} deleted idea${st.trash.length === 1 ? '' : 's'} leave the inbox for good. Their voice memos go to your computer’s Trash.`, { ok: 'Empty the Trash', danger: true }))) return; const r = await op({ op: 'empty-trash' }); await list(); paint(); toast(`Trash emptied${r.memos ? ` · ${r.memos} voice memo${r.memos === 1 ? '' : 's'} in your computer’s Trash` : ''}.`, { timeout: 2600 }); }, 'qi-empty-trash'));
      if (dlg.dataset.trashOpen === '1') fold.open = true;
      fold.addEventListener('toggle', () => { dlg.dataset.trashOpen = fold.open ? '1' : ''; });
      items.push(fold);
    }
    body.replaceChildren(...items); body.scrollTop = scroll;
    dlg.querySelector('.qi-count').textContent = st.ideas.length ? `${st.ideas.length} idea${st.ideas.length === 1 ? '' : 's'}` : '';
    const k = keyWords();
    dlg.querySelector('.qi-foot').textContent = `Tray menu › 💡 Quick idea…${k ? ` · or ${k} from any app` : ''} · the key is in Settings › Advanced › Keys`;
  }
  async function open() {
    if (dlg) { dlg.querySelector('button')?.focus(); await list().catch(() => {}); paint(); return 'The 💡 Ideas inbox is open.'; }
    dlg = el('dialog', { class: 'ui-modal qi-inbox', attrs: { 'aria-label': '💡 Ideas' } },
      el('div', { class: 'qi-head' }, el('h2', { text: '💡 Ideas' }), el('span', { class: 'qi-count' }), el('span', { class: 'spacer' }),
        btn('＋ Quick idea…', () => op({ op: 'open' }), 'qi-new primary', 'The small window: type it or hold 🎙, then click where it goes'),
        btn('×', () => close(), 'qi-close', 'Close')),
      el('div', { class: 'qi-body' }), el('p', { class: 'qi-foot' }));
    dlg.querySelector('.qi-close').setAttribute('aria-label', 'Close the ideas inbox');
    dlg.addEventListener('close', () => { player?.pause(); player = null; dlg?.remove(); dlg = null; });
    document.body.append(dlg); dlg.showModal();
    try { await list(); const k = await op({ op: 'key' }).catch(() => null); if (lastList) lastList.key = k; } catch (err) { dlg.querySelector('.qi-body').replaceChildren(el('p', { class: 'qi-empty', text: calmError(err) })); return 'The ideas inbox couldn’t be read just now.'; }
    paint();
    if (C.pending(lastList).length) deliver().catch(() => {});
    return `💡 Ideas: ${lastList.ideas.length} idea${lastList.ideas.length === 1 ? '' : 's'}.`;
  }
  function close() { try { dlg?.close(); } catch { /* gone */ } }

  // ---------- 🎵 Music ideas in the Sound desk › Sessions (tools/bouncelog.js) ----------
  async function sessionsSection(panel) {
    if (!panel?.isConnected) return;
    const st = await list().catch(() => null); if (!st || !panel.isConnected) return;
    panel.querySelector('.qi-sessions')?.remove();
    const music = st.ideas.filter((i) => i.to.dest === 'music');
    const sec = el('section', { class: 'qi-sessions' }, el('div', { class: 'bl-head' }, el('strong', { text: '💡 Ideas for music' }), el('span', { class: 'bl-dim', text: music.length ? 'Saved with 💡 Quick idea → 🎵 Music, newest first.' : 'None yet: tray menu › 💡 Quick idea… → 🎵 Music keeps one here.' })));
    if (music.length) sec.append(el('ul', { class: 'qi-list' }, music.slice(0, 40).map((i) => row(i))));
    panel.append(sec);
  }

  // ---------- chat (secondary: everything above is a click) ----------
  async function run(args = '') {
    const a = String(args).trim();
    if (!a || /^(list|inbox|all)$/i.test(a)) return open();
    if (/^(new|window)$/i.test(a)) { await op({ op: 'open' }); return 'The 💡 Quick idea window is open.'; }
    const w = C.parseWords(a); let to = { dest: w.dest || 'later' };
    if (w.dest === 'project') { const ps = await recentProjects(); if (!ps.length) throw Error('No projects yet: the idea needs one.'); to = { dest: 'project', projectId: ps[0].id, projectName: ps[0].name }; }
    const r = await op({ op: 'save', text: w.text, to });
    if (r.idea.to.dest === 'quest' || r.idea.to.dest === 'project') await deliver();
    return `Saved to ${r.label} · ${r.where}.`;
  }
  if (typeof Commands !== 'undefined' && !Commands.get('idea')) {
    Commands.register({ name: 'idea', args: '[words | music: … | quest: … | project: … | later: … | new]', area: 'App', desc: '💡 Ideas: the inbox (Move to…, Delete), or save an idea (to Later unless you say where); new opens the small Quick idea window',
      complete: (a) => [['new', 'the small Quick idea window'], ['list', 'the 💡 Ideas inbox'], ['music: ', 'save to Sound desk › Sessions'], ['quest: ', 'save to Sidequest’s saved ideas'], ['project: ', 'save to your latest project’s notes'], ['later: ', 'save to the inbox']].filter(([v]) => v.startsWith(String(a || '').toLowerCase())).map(([v, d]) => ({ value: v, desc: d })),
      examples: ['/idea', '/idea quest: a sunrise walk to Buttes-Chaumont', '/idea new'], keywords: 'idea ideas inbox quick note jot capture voice memo later tray inspiration',
      run: (a) => run(a) });
  }
  try { AppUI.addAction?.('💡 Quick idea…', () => op({ op: 'open' }).catch((err) => toast(calmError(err), { type: 'error' }))); AppUI.addAction?.('💡 Ideas inbox', () => open().catch((err) => toast(calmError(err), { type: 'error' }))); } catch { /* no palette */ }
  window.hub?.quickIdea?.onChanged?.(() => { if (dlg) list().then(paint).catch(() => {}); });

  return { open, close, deliver, run, sessionsSection, moveTo, remove, restore, list: () => list(), _state: () => ({ last: lastList, failed: Object.fromEntries(failed), open: Boolean(dlg) }) };
})();
window.QuickIdeas = QuickIdeas;
