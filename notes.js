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
  const save = debounce(() => window.hub.kvSet('notes', notes), 500);
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

// Prompt library: reusable prompts with {{variables}}, inserted by typing "/" in a chat box.
// Built-in presets (prompt-library.js) are merged in at load: your own prompts (and your edits of presets) are
// kept in kv 'prompts', favorites / hidden presets / use counts in kv 'prompts-meta'.
// Blanks: {{name}}, {{name=default}} or {{name|choice a,choice b}}.
const Prompts = (() => {
  const LIB = typeof PromptLibrary !== 'undefined' ? PromptLibrary : { CATS: {}, list: [] };
  const CATS = { mine: 'My prompts', ...LIB.CATS };
  let user = null; // your prompts
  let meta = null; // { hidden: [ids], favs: [ids], uses: { id: n } }
  let prompts = null; // merged, favorites first
  const VAR = /\{\{\s*(\w+)\s*(?:([=|])([^}]*))?\}\}/g;
  const BIG = /code|text|notes|shader|json|diff|lyrics|error|message|devlog|data|numbers|steps|plan|structure/i;

  function rebuild() {
    const favs = new Set(meta.favs);
    const names = new Set(user.map((p) => p.name.toLowerCase()));
    const ids = new Set(user.map((p) => p.id));
    const builtins = LIB.list.filter((b) => !ids.has(b.id) && !names.has(b.name.toLowerCase()) && !meta.hidden.includes(b.id));
    const all = [...user.map((p) => ({ cat: 'mine', ...p })), ...builtins];
    prompts = [...all.filter((p) => favs.has(p.id)), ...all.filter((p) => !favs.has(p.id))];
    return prompts;
  }
  async function load() {
    if (!prompts) {
      user = (await window.hub.kvGet('prompts', null)) || [];
      meta = { hidden: [], favs: [], uses: {}, ...(await window.hub.kvGet('prompts-meta', {})) };
      rebuild();
    }
    return prompts;
  }
  const persist = async () => { rebuild(); await window.hub.kvSet('prompts', user); };
  const persistMeta = async () => { rebuild(); await window.hub.kvSet('prompts-meta', meta); };
  const isFav = (p) => meta.favs.includes(p.id);
  const builtinOf = (id) => LIB.list.find((b) => b.id === id);

  // [{ name, def, choices }] for each distinct blank in the text.
  function vars(text) {
    const out = new Map();
    for (const m of String(text).matchAll(VAR)) {
      if (out.has(m[1])) continue;
      out.set(m[1], { name: m[1], def: m[2] === '=' ? m[3] : m[2] === '|' ? m[3].split(',')[0].trim() : '', choices: m[2] === '|' ? m[3].split(',').map((s) => s.trim()).filter(Boolean) : null });
    }
    return [...out.values()];
  }
  const apply = (text, values) => String(text).replace(VAR, (_, n) => values[n] ?? '');

  // Asks for any {{variables}} and returns the filled-in text (or null if cancelled).
  async function fill(prompt, preset = {}) {
    const list = vars(prompt.text);
    if (prompt.id) bumpUse(prompt.id);
    if (!list.length) return prompt.text;
    const last = store.get('prompts.lastVars', {});
    const values = await Modal.form(prompt.name || 'Prompt', list.map((v) => (v.choices
      ? { name: v.name, label: v.name.replace(/_/g, ' '), type: 'select', options: v.choices, value: preset[v.name] ?? last[v.name] ?? v.def }
      : { name: v.name, label: v.name.replace(/_/g, ' '), type: BIG.test(v.name) ? 'textarea' : 'text', value: preset[v.name] ?? (v.def || (BIG.test(v.name) ? '' : last[v.name] || '')) })), { ok: 'Insert' });
    if (!values) return null;
    // short answers are offered again next time (track names, artists…)
    for (const v of list) if (!BIG.test(v.name) && values[v.name]) last[v.name] = String(values[v.name]).slice(0, 200);
    store.set('prompts.lastVars', last);
    return apply(prompt.text, values);
  }
  function bumpUse(id) {
    if (!meta) return;
    meta.uses[id] = (meta.uses[id] || 0) + 1;
    window.hub.kvSet('prompts-meta', meta);
  }

  // Dropdown under a composer textarea while the message starts with "/": chat commands (commands.js), their
  // argument suggestions, then saved prompts. With only "/" typed it shows your pinned (★) commands, the ones you
  // ran here (in this tool) and lately, then every command grouped by area; each row shows its shortcut when it
  // has one. While you type arguments, a hint line shows the argument expected next. Words that aren't a command
  // ("/make it 9 by 16") get plain-language matches (Commands.suggest). The command bar (cmdbar.js) uses the same
  // menu with { bare: true }: text without "/" is searched in plain language too.
  function attach(textarea, onPick, { agentId = null, bare = false, below = false } = {}) {
    let menu = null;
    let sel = 0;
    let items = [];
    let seq = 0;
    let lastValue = '';
    let moved = false; // arrows used since the last keystroke (a plain-language row then takes Enter)
    const close = () => { menu?.remove(); menu = null; };
    const setText = (text) => { textarea.value = text; textarea.dispatchEvent(new Event('input')); textarea.focus(); textarea.setSelectionRange(text.length, text.length); };
    const ctxNow = () => ({ agentId: typeof agentId === 'function' ? agentId() : agentId, chatId: H.activeChat?.[typeof agentId === 'function' ? agentId() : agentId] || null, source: bare ? 'bar' : 'chat' });
    const pick = async (it) => {
      close();
      if (it.kind === 'command') { setText(`/${it.def.name} `); return; }
      if (it.kind === 'arg') { setText(`/${it.def.name} ${it.value}`); return; }
      if (it.kind === 'line') { setText(it.line); return; }
      const text = await fill(it.prompt);
      if (text != null) onPick(text);
    };
    const cmdRow = (def, prefix = '') => ({ kind: 'command', def, label: `${prefix}/${def.name}${def.args ? ` ${def.args}` : ''}`, hint: def.desc, keys: def.keys || '' });
    const lineRows = (text) => (Commands.suggest?.(text, { limit: 6, ctx: ctxNow() }) || []).map((s) => ({ kind: 'line', def: s.def, line: s.line, label: s.line.trim(), hint: s.def.desc, keys: s.def.keys || '' }));
    const update = async () => {
      const my = ++seq;
      const value = textarea.value;
      if (value !== lastValue) { sel = 0; lastValue = value; moved = false; }
      const word = value.match(/^\/([\w-]*)$/);
      const withArgs = !word && value.match(/^\/([\w-]+)\s([^\n]*)$/);
      let next = [];
      let hint = null;
      if (word) {
        const q = word[1].toLowerCase();
        const pinned = new Set(Commands.favs?.() || []);
        const here = Commands.place?.() || { id: 'chat', label: 'Chat' };
        const recentHere = new Set(here.id !== 'chat' ? Commands.recent?.(here.id) || [] : []);
        const recent = new Set(Commands.recent?.() || []);
        const cmds = Commands.matching(q).slice(0, q ? 12 : 60);
        let group = '';
        for (const def of cmds) {
          // headers: "Pinned", "Recent in <tool>" and "Recent" first (only with nothing typed), then the areas
          const g = q ? '' : pinned.has(def.name) ? '★ Pinned' : recentHere.has(def.name) ? `Recent in ${here.label}` : recent.has(def.name) ? 'Recent' : def.area;
          if (g && g !== group) { next.push({ kind: 'head', label: g }); group = g; }
          const row = cmdRow(def);
          // in the command bar, Alt+1…9 run the pinned ones: show which key
          if (bare && g === '★ Pinned') { const k = [...pinned].indexOf(def.name) + 1; if (k > 0 && k < 10) row.keys = `Alt+${k}`; }
          next.push(row);
        }
        // nothing by that name: maybe a word for it ("/vertical" → /size 9:16)
        if (q.length > 2 && !cmds.length) { const s = lineRows(q); if (s.length) next.push({ kind: 'head', label: 'Did you mean' }, ...s); }
        const prompts = (await load()).filter((p) => p.name.toLowerCase().includes(q)).slice(0, q ? 6 : 4);
        if (prompts.length) next.push({ kind: 'head', label: 'Saved prompts' });
        next.push(...prompts.map((p) => ({ kind: 'prompt', prompt: p, label: p.name, hint: p.text.slice(0, 70).replace(/\n/g, ' ') })));
      } else if (withArgs) {
        const def = Commands.get(withArgs[1]);
        if (def) {
          hint = Commands.argHint?.(value, ctxNow()) || null;
          if (def.complete) {
            let opts = [];
            try { opts = (await def.complete(withArgs[2], ctxNow())) || []; } catch { /* a suggestion list must never break typing */ }
            next = opts.slice(0, 14).map((o) => ({ kind: 'arg', def, value: o.value, label: o.label || o.value, hint: o.hint || '' }));
          }
        } else if (Commands.suggest) {
          // "/make it 9 by 16": not a command, so plain-language matches
          const s = lineRows(value.slice(1));
          if (s.length) next = [{ kind: 'head', label: 'Did you mean' }, ...s];
        }
      } else if (bare && value.trim() && !value.startsWith('/') && Commands.suggest) {
        const s = lineRows(value);
        if (s.length) next = [{ kind: 'head', label: 'Commands for that' }, ...s];
      }
      if (my !== seq) return; // a newer keystroke already updated the menu
      items = next;
      const pickable = items.filter((it) => it.kind !== 'head');
      if (!pickable.length && !hint?.parts?.length) { close(); return; }
      if (!menu) { menu = el('div', { class: `slash-menu${below ? ' below' : ''}` }); textarea.parentElement.append(menu); }
      sel = Math.min(sel, Math.max(0, pickable.length - 1));
      let n = -1;
      const star = (def) => el('span', {
        class: `slash-star${Commands.isFav?.(def.name) ? ' on' : ''}`, text: Commands.isFav?.(def.name) ? '★' : '☆', title: 'Pin to the top of the / menu',
        on: { mousedown: (e) => { e.preventDefault(); e.stopPropagation(); Commands.toggleFav(def.name); lastValue = null; update(); } },
      });
      // the argument hint: "/size <9:16|16:9…>" with the one you're typing now lit up (and an example)
      const hintRow = hint?.parts?.length ? el('div', { class: 'slash-arghint' }, el('b', { text: `/${hint.def.name}` }), ...hint.parts.map((p) => el('span', { class: `arg-${p.state}`, text: ` ${p.text}` })),
        hint.variant ? el('span', { class: 'arg-eg', text: `  · ${hint.variant}` }) : null, hint.example ? el('span', { class: 'arg-eg', text: `  e.g. ${hint.example}` }) : null) : null;
      menu.replaceChildren(hintRow, ...items.map((it) => {
        if (it.kind === 'head') return el('div', { class: 'slash-head', text: it.label });
        n += 1;
        const mine = n;
        return el('div', {
          class: `slash-item${mine === sel ? ' sel' : ''}${it.kind === 'command' || it.kind === 'line' ? ' cmd' : ''}`, on: { mousedown: (e) => { e.preventDefault(); pick(it); } },
          // hover: the full description and a few examples
          title: it.kind === 'command' && it.def ? [it.def.desc, ...(Commands.examplesOf?.(it.def) || []).slice(0, 3).map((x) => `e.g. ${x}`)].join('\n') : (it.hint || ''),
        }, el('b', { text: it.label }), el('span', { class: 'hint', text: it.hint }), it.keys ? el('kbd', { text: Commands.keyText(it.keys) }) : null, it.kind === 'command' && Commands.toggleFav ? star(it.def) : null);
      }), pickable.length ? el('div', { class: 'slash-foot', text: '↑↓ choose · Tab complete · Enter run · ☆ pin · Esc close' }) : null);
      menu.querySelector('.slash-item.sel')?.scrollIntoView({ block: 'nearest' });
    };
    const pickableItems = () => items.filter((it) => it.kind !== 'head');
    textarea.addEventListener('input', update);
    textarea.addEventListener('keydown', (e) => {
      if (!menu) return;
      if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); return; }
      const list = pickableItems();
      if (!list.length) return;
      // arrows only move the highlight (rebuilding the whole menu per key made holding ↓ sluggish)
      const move = (d) => { moved = true; e.preventDefault(); e.stopImmediatePropagation(); sel = (sel + d + list.length) % list.length; const rows = menu.querySelectorAll('.slash-item'); rows.forEach((r, i) => r.classList.toggle('sel', i === sel)); rows[sel]?.scrollIntoView({ block: 'nearest' }); };
      const done = (it) => (it.kind === 'command' && textarea.value.trim() === `/${it.def.name}`)
        || (it.kind === 'arg' && textarea.value.trim() === `/${it.def.name} ${it.value}`.trim())
        || (it.kind === 'line' && (textarea.value.trim() === it.line.trim() || (!bare && !moved && e.key === 'Enter')));
      // (in a chat box, Enter on "/words that aren't a command" still goes to the chat's own "did you mean" step
      // unless you chose a row with the arrows; Tab always takes the highlighted row)
      if (e.key === 'ArrowDown') move(1);
      else if (e.key === 'ArrowUp') move(-1);
      else if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !done(list[sel]))) {
        // Enter on a fully typed command (or a picked argument) runs it (the form submits); otherwise Enter / Tab completes
        e.preventDefault(); e.stopImmediatePropagation(); pick(list[sel]);
      }
    }, true);
    textarea.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== textarea) close(); }, 150)); // (focus back already: keep it)
    return { close, update, isOpen: () => Boolean(menu) };
  }

  // ---------- library operations (also used by the chat commands) ----------
  async function add({ name, text, cat = 'mine' }) {
    await load();
    const base = String(name || 'Untitled prompt').trim().slice(0, 80);
    let n = base;
    for (let k = 2; user.some((p) => p.name.toLowerCase() === n.toLowerCase()); k += 1) n = `${base} (${k})`;
    const p = { id: `p${Date.now()}${Math.random().toString(36).slice(2, 5)}`, name: n, text: String(text || ''), cat };
    user.push(p);
    await persist();
    return p;
  }
  async function toggleFav(id) {
    await load();
    meta.favs = meta.favs.includes(id) ? meta.favs.filter((x) => x !== id) : [...meta.favs, id];
    await persistMeta();
    return meta.favs.includes(id);
  }
  async function find(q) {
    const all = await load();
    const s = String(q || '').toLowerCase().trim();
    if (!s) return null;
    return all.find((p) => p.name.toLowerCase() === s) || all.find((p) => p.name.toLowerCase().startsWith(s)) || all.find((p) => p.name.toLowerCase().includes(s));
  }
  async function search(q, cat) {
    const all = await load();
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    return all.filter((p) => (!cat || (cat === 'fav' ? isFav(p) : p.cat === cat)) && words.every((w) => `${p.name} ${p.text} ${CATS[p.cat] || p.cat}`.toLowerCase().includes(w)));
  }
  // Removes your prompt, or hides a preset (Show hidden brings presets back).
  async function removePrompt(id) {
    await load();
    const mine = user.find((p) => p.id === id);
    if (mine) { user = user.filter((p) => p !== mine); await persist(); return builtinOf(id) ? 'reset' : 'deleted'; }
    if (builtinOf(id)) { meta.hidden = [...new Set([...meta.hidden, id])]; await persistMeta(); return 'hidden'; }
    return null;
  }
  // The last message you sent in this agent's open chat, saved as a prompt.
  async function saveLast(agentId, name) {
    const chatId = H.activeChat?.[agentId];
    const chat = chatId ? await window.hub.getChat(chatId) : null;
    const last = chat?.messages?.filter((m) => m.role === 'user').at(-1);
    if (!last?.text?.trim()) return null;
    const text = last.text.trim();
    const title = name || await Modal.prompt('Save your last message as a prompt', { value: text.split('\n')[0].slice(0, 50), label: 'Name' });
    if (!title) return null;
    return add({ name: title, text, cat: 'mine' });
  }
  async function exportAll({ all = false } = {}) {
    await load();
    const list = (all ? prompts : user).map(({ name, text, cat }) => ({ name, cat, text }));
    const p = await window.hub.saveFile({ defaultPath: `hearth-prompts-${new Date().toLocaleDateString('en-CA')}.json`, filters: [{ name: 'JSON', extensions: ['json'] }], content: JSON.stringify({ hearthPrompts: 1, prompts: list }, null, 2) });
    if (p) toast(`Exported ${list.length} prompts`, { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } });
    return p ? list.length : 0;
  }
  // Imports a Hearth export, a JSON array of { name, text } (or { title, prompt / content }), or .md / .txt files
  // (one prompt each, named after the file). Same name + same text is skipped; same name, other text gets "(imported)".
  async function importFiles(paths) {
    paths ||= await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], filters: [{ name: 'Prompts', extensions: ['json', 'md', 'txt'] }] });
    if (!paths?.length) return null;
    await load();
    const report = { added: 0, same: 0, renamed: 0, bad: 0 };
    for (const file of paths) {
      const raw = await window.hub.fs.read(file);
      let items = [];
      if (/\.json$/i.test(file)) {
        try {
          const data = JSON.parse(raw);
          const arr = Array.isArray(data) ? data : data.prompts || data.items || [];
          items = arr.map((x) => ({ name: x.name || x.title, text: x.text || x.prompt || x.content, cat: x.cat || x.category }));
        } catch { report.bad += 1; continue; }
      } else items = [{ name: file.split(/[\\/]/).pop().replace(/\.\w+$/, ''), text: raw }];
      for (const it of items) {
        if (!it.name || typeof it.text !== 'string') { report.bad += 1; continue; }
        const twin = prompts.find((p) => p.name.toLowerCase() === String(it.name).toLowerCase());
        if (twin && twin.text.trim() === it.text.trim()) { report.same += 1; continue; }
        await add({ name: twin ? `${it.name} (imported)` : it.name, text: it.text, cat: (CATS[it.cat] || /^[\w -]{1,30}$/.test(it.cat || '')) ? it.cat : 'mine' });
        report[twin ? 'renamed' : 'added'] += 1;
      }
    }
    toast(`Prompts imported: ${report.added} new${report.renamed ? `, ${report.renamed} renamed (name taken)` : ''}${report.same ? `, ${report.same} already there` : ''}${report.bad ? `, ${report.bad} unreadable` : ''}`, { timeout: 6000 });
    return report;
  }
  const catLabel = (c) => CATS[c] || c;
  const categories = () => {
    const counts = {};
    for (const p of prompts || []) counts[p.cat] = (counts[p.cat] || 0) + 1;
    return Object.entries(counts).map(([id, n]) => ({ id, label: catLabel(id), n })).sort((a, b) => (a.id === 'mine' ? -1 : b.id === 'mine' ? 1 : 0) || Object.keys(CATS).indexOf(a.id) - Object.keys(CATS).indexOf(b.id));
  };

  // ---------- the library dialog ----------
  async function manage({ query = '', cat = store.get('prompts.cat', ''), select, newName } = {}) {
    await load();
    const dialog = el('dialog', { class: 'ui-modal prompts-dialog' });
    const list = el('div', { class: 'prompt-list' });
    const q = el('input', { type: 'search', placeholder: `Search ${prompts.length} prompts…`, value: query });
    const catSel = el('select', { class: 'prompt-cat' });
    const name = el('input', { placeholder: 'Name' });
    const editCat = el('select', { title: 'Category' });
    const favBtn = el('button', { type: 'button', class: 'ghost small', text: '☆', title: 'Favorite: favorites come first in the / menu' });
    const text = el('textarea', { rows: 11, placeholder: 'Prompt text. Blanks: {{topic}}, {{tone=friendly}} (default) or {{tone|friendly,bold,dry}} (a dropdown).' });
    const varHint = el('div', { class: 'hint prompt-vars' });
    const delBtn = el('button', { type: 'button', class: 'ghost danger', text: 'Delete' });
    const hiddenBtn = el('button', { type: 'button', class: 'ghost small' });
    let editing = null;
    const fillCats = () => {
      const cats = categories();
      catSel.replaceChildren(el('option', { value: '', text: `All (${prompts.length})` }), el('option', { value: 'fav', text: `★ Favorites (${meta.favs.length})` }), el('option', { value: 'used', text: 'Most used' }),
        ...cats.map((c) => el('option', { value: c.id, text: `${c.label} (${c.n})` })));
      catSel.value = cat;
      if (catSel.value !== cat) { cat = ''; catSel.value = ''; }
      const all = [...new Set([...Object.keys(CATS), ...cats.map((c) => c.id)])];
      editCat.replaceChildren(...all.map((c) => el('option', { value: c, text: catLabel(c) })), el('option', { value: '__new', text: 'New category…' }));
      hiddenBtn.textContent = `Show hidden presets (${meta.hidden.length})`;
      hiddenBtn.hidden = !meta.hidden.length;
    };
    const current = () => prompts.find((p) => p.id === editing);
    const showVars = () => {
      const vs = vars(text.value);
      varHint.textContent = vs.length ? `Blanks: ${vs.map((v) => `${v.name}${v.choices ? ` (${v.choices.length} choices)` : v.def ? ` = ${v.def}` : ''}`).join(' · ')} · ≈${Math.ceil(text.value.length / 4)} tokens` : `No blanks · ≈${Math.ceil(text.value.length / 4)} tokens`;
    };
    const pick = (p) => {
      editing = p?.id || null;
      name.value = p?.name || '';
      text.value = p?.text || '';
      editCat.value = p?.cat || (cat && !['fav', 'used'].includes(cat) ? cat : 'mine');
      favBtn.textContent = p && isFav(p) ? '★' : '☆';
      favBtn.disabled = !p;
      const mine = p && user.some((u) => u.id === p.id);
      delBtn.textContent = p?.builtin && !mine ? 'Hide preset' : p && builtinOf(p.id) ? 'Reset to preset' : 'Delete';
      delBtn.disabled = !p;
      showVars();
      renderList();
    };
    const renderList = () => {
      const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      let rows = prompts.filter((p) => (!cat || cat === 'used' || (cat === 'fav' ? isFav(p) : p.cat === cat)) && words.every((w) => `${p.name} ${p.text}`.toLowerCase().includes(w)));
      if (cat === 'used') rows = rows.filter((p) => meta.uses[p.id]).sort((a, b) => meta.uses[b.id] - meta.uses[a.id]);
      const groups = !cat && !words.length;
      const out = [];
      let last = null;
      const ordered = groups ? [...rows.filter(isFav), ...categories().flatMap((c) => rows.filter((p) => p.cat === c.id && !isFav(p)))] : rows;
      for (const p of ordered) {
        const g = groups ? (isFav(p) ? '★ Favorites' : catLabel(p.cat)) : null;
        if (g && g !== last) { out.push(el('div', { class: 'lib-group', text: g })); last = g; }
        out.push(el('button', {
          type: 'button', class: `prompt-item${editing === p.id ? ' on' : ''}`, title: p.text.slice(0, 300),
          on: { click: () => pick(p), dblclick: () => useNow(p) },
        }, `${isFav(p) ? '★ ' : ''}${p.name}`, meta.uses[p.id] ? el('span', { class: 'hint', text: ` ${meta.uses[p.id]}×` }) : null));
      }
      list.replaceChildren(...(out.length ? out : [el('p', { class: 'hint', text: 'No prompt matches.' })]));
      list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    };
    const useNow = async (p) => {
      const t = await fill(p);
      if (t == null) return;
      dialog.close();
      const a = H.activeId && H.agent(H.activeId)?.mode === 'native' ? H.activeId : null;
      if (a) { Native.setDraft(a, t); } else draftToClaude(t);
    };
    const saveCurrent = async () => {
      if (!name.value.trim()) { toast('Give the prompt a name', { type: 'error' }); return; }
      let c = editCat.value;
      if (c === '__new') { c = (await Modal.prompt('New category', { placeholder: 'e.g. Client work' }))?.trim(); if (!c) return; }
      const p = current();
      const fields = { name: name.value.trim(), text: text.value, cat: c };
      if (p && user.some((u) => u.id === p.id)) Object.assign(user.find((u) => u.id === p.id), fields);
      else if (p?.builtin) user.push({ id: p.id, ...fields, edited: true }); // your copy of a preset
      else { const n = await add(fields); editing = n.id; }
      await persist();
      fillCats(); pick(prompts.find((x) => x.id === editing)); toast('Prompt saved', { timeout: 1200 });
    };
    q.addEventListener('input', renderList);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const first = list.querySelector('.prompt-item'); first?.click(); } });
    catSel.addEventListener('change', () => { cat = catSel.value; store.set('prompts.cat', cat); renderList(); });
    text.addEventListener('input', showVars);
    favBtn.addEventListener('click', async () => { if (!editing) return; await toggleFav(editing); fillCats(); pick(current()); });
    delBtn.addEventListener('click', async () => {
      if (!editing) return;
      const r = await removePrompt(editing);
      fillCats();
      pick(r === 'reset' ? prompts.find((p) => p.id === editing) : null);
      toast(r === 'hidden' ? 'Preset hidden' : r === 'reset' ? 'Back to the preset' : 'Prompt deleted', { timeout: 1500 });
    });
    hiddenBtn.addEventListener('click', async () => { meta.hidden = []; await persistMeta(); fillCats(); renderList(); toast('Hidden presets are back', { timeout: 1500 }); });
    dialog.append(el('form', { method: 'dialog', on: { keydown: (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); } } },
      el('h2', { text: 'Prompt library' }),
      el('p', { class: 'hint', text: 'Type / at the start of any native chat message to insert one of these. Double-click a prompt to use it.' }),
      el('div', { class: 'prompts-layout' },
        el('div', { class: 'prompt-side' }, el('div', { class: 'row' }, q), catSel, list),
        el('div', { class: 'prompt-edit' }, el('div', { class: 'row' }, name, editCat, favBtn), text, varHint,
          el('div', { class: 'button-row' },
            el('button', { type: 'button', class: 'primary', text: 'Save', on: { click: saveCurrent } }),
            el('button', { type: 'button', class: 'ghost', text: 'New', on: { click: () => { pick(null); name.focus(); } } }),
            el('button', { type: 'button', class: 'ghost', text: 'Duplicate', on: { click: async () => { if (!name.value) return; const n = await add({ name: `${name.value} copy`, text: text.value, cat: editCat.value === '__new' ? 'mine' : editCat.value }); fillCats(); pick(n); } } }),
            el('button', { type: 'button', class: 'ghost', text: 'Use now', on: { click: () => useNow({ id: editing, name: name.value, text: text.value }) } }),
            delBtn))),
      el('div', { class: 'dialog-actions' },
        el('button', { type: 'button', class: 'ghost small', text: 'Import…', on: { click: async () => { if (await importFiles()) { fillCats(); renderList(); } } } }),
        el('button', { type: 'button', class: 'ghost small', text: 'Export…', title: 'Your own prompts (right-click: everything, presets included)', on: { click: () => exportAll(), contextmenu: (e) => { e.preventDefault(); exportAll({ all: true }); } } }),
        hiddenBtn,
        el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Close' }))));
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    fillCats();
    pick(select ? prompts.find((p) => p.id === select) || null : null);
    if (newName != null) { pick(null); name.value = newName; text.focus(); }
    dialog.showModal();
    (newName != null ? text : q).focus();
    return dialog;
  }

  return { attach, manage, load, fill, vars, apply, add, find, search, toggleFav, remove: removePrompt, saveLast, exportAll, importFiles, categories, CATS, isFav: (p) => Boolean(meta && isFav(p)) };
})();
