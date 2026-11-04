// (round 118, startup118) Notes' panel loads after the first screen (lazy group 'notes', lazy-data.js); the prompt
// library that used to share notes.js stays on the first screen (it answers "/" in every chat box).
// Notes: a slide-over scratchpad with several Markdown notes (Ctrl+J), saved automatically.
// Notes can be pinned, tagged (#tags anywhere in the text), searched, made from templates (daily note, shot list,
// track breakdown…), hold checklists you tick in the preview, link to each other ([[Note title]]) and to chats.
const Notes = (() => {
  let notes = [];
  let loaded = false;
  let currentId = null;
  let panel = null;
  let preview = false;
  let filter = '';
  const save = saver(() => window.hub.kvSet('notes', notes), 500); // (round 29) written during long typing too, and on leaving
  const saveNow = () => window.hub.kvSet('notes', notes);
  const day = (d = new Date()) => d.toLocaleDateString('en-CA'); // YYYY-MM-DD
  const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Templates for new notes ({date}, {time} and {weekday} are filled in).
  const TEMPLATES = {
    blank: { label: 'Blank note', text: '' },
    daily: { label: 'Daily note', text: '# {date} ({weekday})\n\n## Today\n- [ ] \n\n## Notes\n\n\n## Ideas\n\n#daily' },
    idea: { label: 'Visual idea', text: '# Visual idea: \n\n**Track:** \n**Mood:** \n**Palette:** \n**Frame:** 9:16\n\n## What happens\n- Intro: \n- Build: \n- Drop: \n\n## Reacts to\n- Kick → \n- Snare → \n- Highs → \n\n#idea' },
    track: { label: 'Track breakdown', text: '# Track: \n\n**Artist:** \n**BPM:** \n**Key:** \n\n| Time | Section | Bars | Visual |\n|---|---|---|---|\n| 0:00 | Intro | 8 | |\n| | Build | 8 | |\n| | Drop | 16 | |\n| | Break | 8 | |\n| | Outro | 8 | |\n\n#track' },
    shots: { label: 'Shot list', text: '# Shot list: \n\n- [ ] Shot 1 · 9:16 · \n- [ ] Shot 2 · 16:9 · \n- [ ] Shot 3 · 1:1 · \n- [ ] Thumbnail frame\n- [ ] Loop version\n\n#shots' },
    bug: { label: 'Bug report', text: '# Bug: \n\n**Where:** \n**Build:** \n\n## Steps\n1. \n2. \n\n## Expected\n\n\n## Actual\n\n\n#bug' },
    devlog: { label: 'Devlog draft', text: '# Devlog {date}\n\n## New\n- \n\n## Changes\n- \n\n## Fixes\n- \n\n## Next\n- \n\n#devlog' },
    meeting: { label: 'Call / meeting', text: '# Call: \n{date} {time}\n\n**With:** \n\n## Notes\n\n\n## Decisions\n- \n\n## Actions\n- [ ] \n\n#meeting' },
    checklist: { label: 'Checklist', text: '# Checklist\n\n- [ ] \n- [ ] \n- [ ] \n' },
    weekly: { label: 'Weekly review', text: '# Week of {date}\n\n## Shipped\n- \n\n## Slipped\n- \n\n## Next week\n- [ ] \n- [ ] \n- [ ] \n\n#weekly' },
    post: { label: 'Social post plan', text: '# Post: \n\n**Platform:** Shorts / TikTok / Reels\n**Hook (first 2 s):** \n**Caption:** \n**Hashtags:** \n**Post at:** \n\n- [ ] Export 1080×1920\n- [ ] Thumbnail\n- [ ] Credit the artist\n\n#post' },
    release: { label: 'Release notes', text: '# Release {date}\n\n## Highlights\n- \n\n## Balance\n- \n\n## Fixes\n- \n\n- [ ] Build tested\n- [ ] Notes posted\n- [ ] Uploaded\n\n#release' },
  };
  const fillTemplate = (text) => text.replace(/\{date\}/g, day()).replace(/\{time\}/g, now()).replace(/\{weekday\}/g, new Date().toLocaleDateString(undefined, { weekday: 'long' }));

  async function load() {
    if (!loaded) {
      notes = await window.hub.kvGet('notes', []);
      loaded = true;
    }
    if (!notes.length) notes = [{ id: `n${Date.now()}`, title: 'Scratchpad', text: '', updatedAt: Date.now() }];
    if (!notes.some((n) => n.id === currentId)) currentId = notes[0].id;
    return notes;
  }
  // (round 77, storeack77) notes from the other computer (StoreAck, storeack-core.js): what you typed is written first
  // (merged line by line with what arrived), then the list and the open note show what's on disk now — the note you're
  // typing in keeps your caret and scroll — and sync is told, so a note deleted here right after it arrived stays deleted
  window.StoreAck?.hold('notes', {
    saver: save, read: () => StoreAck.kv('notes', null),
    apply: (v) => {
      if (!loaded) return;
      if (!Array.isArray(v)) return false;
      notes = v.length ? v : [{ id: `n${Date.now()}`, title: 'Scratchpad', text: '', updatedAt: Date.now() }];
      if (!notes.some((n) => n.id === currentId)) currentId = notes[0].id;
      if (panel) StoreAck.keepCaret(panel.querySelector('textarea'), render);
    },
  });
  const current = () => notes.find((n) => n.id === currentId) || notes[0];
  const titleOf = (text) => (text.split('\n').find((l) => l.trim()) || 'Untitled').replace(/^#+\s*/, '').slice(0, 40);
  const tagsOf = (text) => [...new Set([...String(text || '').matchAll(/(^|[\s(])#([a-z][\w-]{1,30})/gi)].map((m) => m[2].toLowerCase()))];
  const allTags = () => [...new Set(notes.flatMap((n) => tagsOf(n.text)))].sort();
  const words = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
  const todoCount = (t) => { const all = t.match(/^\s*[-*+]\s+\[[ xX]\]/gm) || []; return { all: all.length, done: all.filter((x) => /\[[xX]\]/.test(x)).length }; };
  const touch = (note) => { note.title = titleOf(note.text); note.updatedAt = Date.now(); };
  const find = (q) => {
    const s = String(q || '').toLowerCase().trim();
    if (!s) return null;
    return notes.find((n) => n.id === q) || notes.find((n) => (n.title || '').toLowerCase() === s) || notes.find((n) => (n.title || '').toLowerCase().startsWith(s)) || notes.find((n) => (n.title || '').toLowerCase().includes(s));
  };
  function matches(n, q) {
    if (!q) return true;
    return q.split(/\s+/).every((w) => (w.startsWith('#') ? tagsOf(n.text).includes(w.slice(1).toLowerCase()) : `${n.title}\n${n.text}`.toLowerCase().includes(w.toLowerCase())));
  }
  const sorted = () => [...notes].sort((a, b) => (Boolean(b.pinned) - Boolean(a.pinned)) || b.updatedAt - a.updatedAt);

  // Preview: Markdown plus clickable checkboxes, [[note links]] and #tags.
  function renderPreview(view, note) {
    view.innerHTML = renderMarkdown(note.text || '*Empty note*')
      .replace(/\[\[([^\]<]{1,80})\]\]/g, '<a href="#" class="note-link" data-note="$1">$1</a>');
    let i = 0;
    for (const li of view.querySelectorAll('li')) {
      const m = li.innerHTML.match(/^\[([ xX])\]\s?/);
      if (!m) continue;
      const index = i++;
      li.innerHTML = li.innerHTML.slice(m[0].length);
      li.classList.add('note-todo');
      if (m[1] !== ' ') li.classList.add('done');
      li.prepend(el('input', { type: 'checkbox', checked: m[1] !== ' ', on: { change: () => toggleTodo(note, index) } }));
    }
    for (const a of view.querySelectorAll('a.note-link')) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const hit = find(a.dataset.note.replace(/&amp;/g, '&'));
        if (hit) { currentId = hit.id; render(); } else create({ text: `# ${a.textContent}\n\n`, focus: true });
      });
    }
  }
  function toggleTodo(note, index) {
    let k = 0;
    note.text = note.text.split('\n').map((line) => {
      if (!/^\s*[-*+]\s+\[[ xX]\]/.test(line)) return line;
      if (k++ !== index) return line;
      return line.replace(/\[([ xX])\]/, (_, c) => (c === ' ' ? '[x]' : '[ ]'));
    }).join('\n');
    touch(note);
    save();
    render();
  }

  function render() {
    if (!panel) return;
    const note = current();
    const list = panel.querySelector('.notes-list');
    const shown = sorted().filter((n) => matches(n, filter));
    list.replaceChildren(...shown.map((n) => el('button', {
      class: `notes-item${n.id === note.id ? ' on' : ''}${n.pinned ? ' pinned' : ''}`, text: `${n.pinned ? '📌 ' : ''}${n.title || 'Untitled'}`, title: `Edited ${timeAgo(n.updatedAt)}${tagsOf(n.text).length ? ` · #${tagsOf(n.text).join(' #')}` : ''}`,
      on: { click: () => { currentId = n.id; render(); }, contextmenu: (e) => { e.preventDefault(); currentId = n.id; render(); moreMenu(e.clientX, e.clientY); } },
    })), shown.length ? null : el('span', { class: 'hint', text: 'No note matches.' }));
    const tags = allTags();
    panel.querySelector('.notes-tags').replaceChildren(...tags.slice(0, 24).map((t) => el('button', {
      class: `notes-tag${filter === `#${t}` ? ' on' : ''}`, text: `#${t}`, on: { click: () => { filter = filter === `#${t}` ? '' : `#${t}`; panel.querySelector('.notes-search').value = filter; render(); } },
    })));
    panel.querySelector('.notes-tags').hidden = !tags.length;
    const area = panel.querySelector('textarea');
    if (area.value !== note.text) area.value = note.text;
    const view = panel.querySelector('.notes-preview');
    view.hidden = !preview;
    area.hidden = preview;
    if (preview) renderPreview(view, note);
    panel.querySelector('.notes-mode').textContent = preview ? 'Edit' : 'Preview';
    panel.querySelector('.notes-pin').classList.toggle('on', Boolean(note.pinned));
    renderMeta();
    panel.querySelector('.notes-links').replaceChildren(...(note.links || []).map((l, i) => el('span', { class: 'notes-link-chip' },
      el('button', { class: 'ghost small', text: `${l.kind === 'chat' ? '💬' : l.kind === 'sketch' ? '🎛' : '🔗'} ${l.label}`, title: 'Open', on: { click: () => openLink(l) } }),
      el('button', { class: 'ghost small', text: '×', title: 'Unlink', on: { click: () => { note.links.splice(i, 1); save(); render(); } } }))));
  }
  function renderMeta() {
    const note = current();
    const t = todoCount(note.text);
    panel.querySelector('.notes-meta').textContent = `${note.text.length} chars · ${words(note.text)} words${t.all ? ` · ☑ ${t.done}/${t.all}` : ''}`;
  }

  async function open() {
    if (panel) { panel.querySelector('textarea').focus(); return; }
    await load();
    const area = el('textarea', { class: 'notes-text', placeholder: 'Write anything. Markdown works, - [ ] makes a checklist, #tags and [[links to notes]] too. Saved automatically.', spellcheck: true });
    area.addEventListener('input', () => {
      const note = current();
      note.text = area.value;
      touch(note);
      save();
      renderMeta();
      const btn = panel.querySelector('.notes-item.on');
      if (btn) btn.textContent = `${note.pinned ? '📌 ' : ''}${note.title}`;
    });
    // Ctrl+Enter ticks / unticks the checklist item on the cursor's line (or makes the line one)
    area.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey && e.key === 'Enter')) return;
      e.preventDefault();
      const v = area.value; const s = area.selectionStart;
      const a = v.lastIndexOf('\n', s - 1) + 1; let b = v.indexOf('\n', s); if (b < 0) b = v.length;
      const line = v.slice(a, b);
      const next = /\[[ ]\]/.test(line) ? line.replace('[ ]', '[x]') : /\[[xX]\]/.test(line) ? line.replace(/\[[xX]\]/, '[ ]') : `- [ ] ${line.replace(/^\s*[-*+]\s+/, '')}`;
      area.setRangeText(next, a, b, 'end');
      area.dispatchEvent(new Event('input'));
    });
    const search = el('input', { class: 'notes-search', type: 'search', placeholder: 'Search notes or #tag', value: filter });
    search.addEventListener('input', () => { filter = search.value.trim(); render(); });
    panel = el('aside', { class: 'notes-panel' },
      el('div', { class: 'notes-head' },
        el('b', { text: 'Notes' }),
        search,
        el('button', { class: 'ghost small', text: '＋ New', title: 'New note (right-click for templates)', on: { click: (e) => templateMenu(e.clientX, e.clientY), contextmenu: (e) => { e.preventDefault(); templateMenu(e.clientX, e.clientY); } } }),
        el('button', { class: 'ghost small notes-pin', text: '📌', title: 'Pin this note to the front', on: { click: () => pin() } }),
        el('button', { class: 'ghost small notes-mode', text: 'Preview', on: { click: () => { preview = !preview; render(); } } }),
        el('button', { class: 'ghost small', text: '⋯', title: 'More: daily note, link this chat, export, import…', on: { click: (e) => moreMenu(e.clientX, e.clientY) } }),
        el('button', { class: 'ghost small', text: '×', title: 'Close (Ctrl+J)', on: { click: close } })),
      el('div', { class: 'notes-list' }),
      el('div', { class: 'notes-tags' }),
      area,
      el('div', { class: 'notes-preview body' }),
      el('div', { class: 'notes-links' }),
      el('div', { class: 'notes-foot' },
        el('span', { class: 'hint notes-meta' }),
        el('span', { class: 'spacer' }),
        el('button', { class: 'ghost small', text: 'Copy', on: { click: () => copyText(current().text, 'Note copied') } }),
        el('button', { class: 'ghost small', text: 'Send to Claude', on: { click: () => draftToClaude(current().text) } }),
        el('button', { class: 'ghost small', text: 'Save as file…', on: { click: () => saveAsFile() } }),
        el('button', { class: 'ghost small danger', text: 'Delete', on: { click: remove } })));
    document.body.append(panel);
    render();
    area.focus();
  }

  function templateMenu(x, y) {
    showMenu(x, y, Object.entries(TEMPLATES).map(([id, t]) => ({ label: t.label, action: () => create({ template: id, focus: true }) })));
  }
  function moreMenu(x, y) {
    const agentId = H.activeId && H.agent(H.activeId)?.mode === 'native' ? H.activeId : H.claudeAgent()?.id;
    const chatId = agentId && H.activeChat?.[agentId];
    showMenu(x, y, [
      { label: '📅 Today\'s daily note', action: () => daily() },
      { label: current().pinned ? 'Unpin' : '📌 Pin', action: () => pin() },
      { label: 'Duplicate', action: () => create({ text: current().text, focus: true }) },
      chatId ? { label: '💬 Link the open chat', action: () => linkChat(agentId) } : null,
      { label: '🎛 Link a Lab sketch…', action: () => linkSketch() },
      { label: 'Send to the open chat (draft)', action: () => sendToChat(current().id, agentId) },
      { label: 'Save as a prompt', action: () => Prompts.add({ name: current().title, text: current().text, cat: 'mine' }).then(() => toast('Saved to the prompt library', { timeout: 1500 })) },
      { label: 'Save as file…', action: () => saveAsFile() },
      { label: 'Export all notes (Markdown)…', action: () => exportAll() },
      { label: 'Import Markdown / text files…', action: () => importFiles() },
    ].filter(Boolean));
  }

  async function create({ template = 'blank', text, title, focus = false, daily: dailyKey } = {}) {
    await load();
    const body = text ?? fillTemplate(TEMPLATES[template]?.text || '');
    const n = { id: `n${Date.now()}${Math.random().toString(36).slice(2, 5)}`, title: title || titleOf(body) || 'Untitled', text: body, updatedAt: Date.now(), createdAt: Date.now() };
    if (dailyKey) n.daily = dailyKey;
    notes.push(n);
    currentId = n.id;
    await saveNow();
    if (focus) { preview = false; if (!panel) await open(); filter = ''; if (panel) panel.querySelector('.notes-search').value = ''; render(); const area = panel.querySelector('textarea'); area.focus(); area.setSelectionRange(area.value.length, area.value.length); }
    return n;
  }

  // Today's daily note: opens it, or makes it from the Daily template.
  async function daily() {
    await load();
    const key = day();
    const hit = notes.find((n) => n.daily === key);
    if (hit) { currentId = hit.id; if (!panel) await open(); render(); return hit; }
    return create({ template: 'daily', daily: key, focus: true });
  }

  async function pin(id) {
    await load();
    const note = id ? find(id) : current();
    if (!note) return null;
    note.pinned = !note.pinned;
    save();
    render();
    return note;
  }

  async function remove() {
    const note = current();
    if (note.text.trim() && !(await Modal.confirm('Delete note?', `"${note.title}" will be deleted.`, { ok: 'Delete', danger: true }))) return;
    notes = notes.filter((n) => n.id !== note.id);
    if (!notes.length) notes.push({ id: `n${Date.now()}`, title: 'Scratchpad', text: '', updatedAt: Date.now() });
    currentId = sorted()[0].id;
    save();
    render();
    // one-step undo
    toast(`Deleted "${note.title}"`, { action: { label: 'Undo', fn: () => { notes.push(note); currentId = note.id; save(); render(); } } });
  }

  function close() { panel?.remove(); panel = null; }
  function toggle() { if (panel) close(); else open(); }

  function saveAsFile(note = current()) {
    return window.hub.saveFile({ defaultPath: `${(note.title || 'note').replace(/[\\/:*?"<>|]+/g, ' ')}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }], content: note.text });
  }
  async function exportAll() {
    await load();
    const body = sorted().map((n) => `<!-- note: ${n.title} · ${new Date(n.updatedAt).toISOString()} -->\n${n.text.trim()}\n`).join('\n---\n\n');
    const p = await window.hub.saveFile({ defaultPath: `hearth-notes-${day()}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }], content: body });
    if (p) toast(`Exported ${notes.length} notes`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } });
    return p;
  }
  async function importFiles() {
    const paths = await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Markdown or text', extensions: ['md', 'txt', 'markdown'] }] });
    if (!paths?.length) return 0;
    await load();
    let n = 0;
    for (const p of paths) {
      const text = await window.hub.fs.read(p);
      // an export from this panel splits back into its notes
      const parts = /<!-- note: /.test(text) ? text.split(/\n---\n\n(?=<!-- note: )/) : [text];
      for (const part of parts) {
        const clean = part.replace(/^<!-- note: [^\n]*-->\n/, '').trim();
        if (!clean || notes.some((x) => x.text.trim() === clean)) continue;
        notes.push({ id: `n${Date.now()}${n}`, title: titleOf(clean), text: `${clean}\n`, updatedAt: Date.now(), createdAt: Date.now() });
        n += 1;
      }
    }
    await saveNow();
    render();
    toast(n ? `Imported ${n} note${n === 1 ? '' : 's'}` : 'Nothing new to import (duplicates skipped)');
    return n;
  }

  // ---------- links to chats and sketches ----------
  async function linkChat(agentId, noteId) {
    await load();
    const note = noteId ? find(noteId) : current();
    const chatId = H.activeChat?.[agentId];
    if (!note || !chatId) return null;
    const chat = H.chats.find((c) => c.id === chatId);
    note.links ||= [];
    if (!note.links.some((l) => l.id === chatId)) note.links.push({ kind: 'chat', id: chatId, agentId, label: (chat?.title || 'Chat').slice(0, 40) });
    save();
    render();
    return note;
  }
  async function linkSketch() {
    const sketches = await window.hub.kvGet('three-sketches', []);
    if (!sketches.length) { toast('No Lab sketches yet', { type: 'error' }); return; }
    const v = await Modal.form('Link a Lab sketch', [{ name: 'id', label: 'Sketch', type: 'select', options: [...sketches].sort((a, b) => b.updatedAt - a.updatedAt).map((s) => ({ value: s.id, label: s.name })) }], { ok: 'Link' });
    if (!v) return;
    const s = sketches.find((x) => x.id === v.id);
    const note = current();
    note.links ||= [];
    if (!note.links.some((l) => l.id === s.id)) note.links.push({ kind: 'sketch', id: s.id, label: s.name.slice(0, 40) });
    save();
    render();
  }
  function openLink(l) {
    if (l.kind === 'chat') {
      if (!H.chats.some((c) => c.id === l.id)) { toast('That chat is gone (check Recently deleted chats)', { type: 'error' }); return; }
      activate(l.agentId); Native.open(l.agentId, l.id);
    } else if (l.kind === 'sketch') {
      activate('tool:three');
      toast(`Open "${l.label}" from Your sketches`, { timeout: 2500 });
    }
  }

  // Adds text to the current note (used by "Save to notes" in right-click menus).
  async function append(text) {
    await load();
    const note = current();
    note.text = `${note.text}${note.text && !note.text.endsWith('\n') ? '\n\n' : ''}${text}\n`;
    touch(note);
    await saveNow();
    if (panel) render();
    toast('Saved to notes', { action: { label: 'Open', fn: open }, timeout: 3000 });
  }

  // Quick capture into the "Inbox" note (made on first use), with the time.
  async function capture(text, { todo = false } = {}) {
    await load();
    let inbox = notes.find((n) => n.inbox);
    if (!inbox) { inbox = { id: `n${Date.now()}`, title: 'Inbox', text: '# Inbox\n', updatedAt: Date.now(), createdAt: Date.now(), inbox: true, pinned: true }; notes.push(inbox); }
    inbox.text = `${inbox.text.replace(/\n*$/, '\n')}${todo ? '- [ ] ' : `- ${day()} ${now()} · `}${text.trim()}\n`;
    touch(inbox);
    await saveNow();
    if (panel) render();
    return inbox;
  }

  async function sendToChat(id, agentId) {
    await load();
    const note = id ? find(id) : current();
    if (!note) return false;
    if (agentId && H.agent(agentId)?.mode === 'native') { activate(agentId); Native.setDraft(agentId, note.text); } else draftToClaude(note.text);
    return true;
  }

  async function show(id) {
    await load();
    const note = find(id);
    if (!note) return null;
    currentId = note.id;
    if (!panel) await open(); else render();
    return note;
  }

  return {
    open, close, toggle, append, capture, create, daily, pin, show, sendToChat, linkChat, exportAll, importFiles, find: async (q) => { await load(); return find(q); },
    list: async () => { await load(); return sorted(); }, tags: async () => { await load(); return allTags(); }, tagsOf, TEMPLATES,
    search: async (q) => { await load(); return sorted().filter((n) => matches(n, q)); },
  };
})();
