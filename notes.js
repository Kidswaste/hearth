// Notes: a slide-over scratchpad with several Markdown notes (Ctrl+J), saved automatically.
const Notes = (() => {
  let notes = [];
  let currentId = null;
  let panel = null;
  let preview = false;
  const save = debounce(() => window.hub.kvSet('notes', notes), 500);

  async function load() {
    notes = await window.hub.kvGet('notes', []);
    if (!notes.length) notes = [{ id: `n${Date.now()}`, title: 'Scratchpad', text: '', updatedAt: Date.now() }];
    currentId ||= notes[0].id;
  }
  const current = () => notes.find((n) => n.id === currentId) || notes[0];
  const titleOf = (text) => (text.split('\n').find((l) => l.trim()) || 'Untitled').replace(/^#+\s*/, '').slice(0, 40);

  function render() {
    if (!panel) return;
    const note = current();
    const list = panel.querySelector('.notes-list');
    list.replaceChildren(...[...notes].sort((a, b) => b.updatedAt - a.updatedAt).map((n) => el('button', {
      class: `notes-item${n.id === note.id ? ' on' : ''}`, text: n.title || 'Untitled', title: `Edited ${timeAgo(n.updatedAt)}`,
      on: { click: () => { currentId = n.id; render(); } },
    })));
    const area = panel.querySelector('textarea');
    if (area.value !== note.text) area.value = note.text;
    const view = panel.querySelector('.notes-preview');
    view.hidden = !preview;
    area.hidden = preview;
    if (preview) view.innerHTML = renderMarkdown(note.text || '*Empty note*');
    panel.querySelector('.notes-mode').textContent = preview ? 'Edit' : 'Preview';
    panel.querySelector('.notes-meta').textContent = `${note.text.length} chars · ${note.text.trim() ? note.text.trim().split(/\s+/).length : 0} words`;
  }

  async function open() {
    if (panel) { panel.querySelector('textarea').focus(); return; }
    await load();
    const area = el('textarea', { class: 'notes-text', placeholder: 'Write anything. Markdown works. Saved automatically.', spellcheck: true });
    area.addEventListener('input', () => {
      const note = current();
      note.text = area.value;
      note.title = titleOf(area.value);
      note.updatedAt = Date.now();
      save();
      panel.querySelector('.notes-meta').textContent = `${note.text.length} chars`;
      const btn = panel.querySelector('.notes-item.on');
      if (btn) btn.textContent = note.title;
    });
    panel = el('aside', { class: 'notes-panel' },
      el('div', { class: 'notes-head' },
        el('b', { text: 'Notes' }),
        el('span', { class: 'spacer' }),
        el('button', { class: 'ghost small', text: '＋ New', on: { click: () => { const n = { id: `n${Date.now()}`, title: 'Untitled', text: '', updatedAt: Date.now() }; notes.push(n); currentId = n.id; save(); preview = false; render(); area.focus(); } } }),
        el('button', { class: 'ghost small notes-mode', text: 'Preview', on: { click: () => { preview = !preview; render(); } } }),
        el('button', { class: 'ghost small', text: '×', title: 'Close (Ctrl+J)', on: { click: close } })),
      el('div', { class: 'notes-list' }),
      area,
      el('div', { class: 'notes-preview body' }),
      el('div', { class: 'notes-foot' },
        el('span', { class: 'hint notes-meta' }),
        el('span', { class: 'spacer' }),
        el('button', { class: 'ghost small', text: 'Copy', on: { click: () => copyText(current().text, 'Note copied') } }),
        el('button', { class: 'ghost small', text: 'Send to Claude', on: { click: () => draftToClaude(current().text) } }),
        el('button', { class: 'ghost small', text: 'Save as file…', on: { click: () => window.hub.saveFile({ defaultPath: `${current().title || 'note'}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }], content: current().text }) } }),
        el('button', { class: 'ghost small danger', text: 'Delete', on: { click: remove } })));
    document.body.append(panel);
    render();
    area.focus();
  }

  async function remove() {
    const note = current();
    if (note.text.trim() && !(await Modal.confirm('Delete note?', `"${note.title}" will be deleted.`, { ok: 'Delete', danger: true }))) return;
    notes = notes.filter((n) => n.id !== note.id);
    if (!notes.length) notes.push({ id: `n${Date.now()}`, title: 'Scratchpad', text: '', updatedAt: Date.now() });
    currentId = notes[0].id;
    save();
    render();
  }

  function close() { panel?.remove(); panel = null; }
  function toggle() { if (panel) close(); else open(); }

  // Adds text to the current note (used by "Save to notes" in right-click menus).
  async function append(text) {
    await load();
    const note = current();
    note.text = `${note.text}${note.text && !note.text.endsWith('\n') ? '\n\n' : ''}${text}\n`;
    note.title = titleOf(note.text);
    note.updatedAt = Date.now();
    await window.hub.kvSet('notes', notes);
    if (panel) render();
    toast('Saved to notes', { action: { label: 'Open', fn: open }, timeout: 3000 });
  }

  return { open, close, toggle, append };
})();

// Prompt library: reusable prompts with {{variables}}, inserted by typing "/" in a chat box.
const Prompts = (() => {
  const DEFAULTS = [
    { name: 'Explain this code', text: 'Explain what this code does, step by step, and point out anything risky:\n\n```\n{{code}}\n```' },
    { name: 'Fix this bug', text: 'This code has a bug: {{symptom}}\n\n```\n{{code}}\n```\n\nFind the cause and give me the corrected code.' },
    { name: 'Three.js performance review', text: 'Review this three.js code for performance (draw calls, allocations in the render loop, overdraw, texture sizes) and suggest concrete fixes:\n\n```js\n{{code}}\n```' },
    { name: 'After Effects expression', text: 'Write an After Effects expression for the {{property}} property that {{behavior}}. Return only the expression and a one-line note on where to paste it.' },
    { name: 'ExtendScript for After Effects', text: 'Write an After Effects ExtendScript (.jsx) that {{task}}. It runs inside an undo group already. Use app.project.activeItem for the current comp and alert() for errors.' },
    { name: 'itch.io devlog post', text: 'Write an itch.io devlog post for Forgeheart about: {{topic}}. Friendly, concise, with a short intro, bullet list of changes and a call to action.' },
    { name: 'Patch notes polish', text: 'Turn these raw notes into player-facing patch notes grouped under New, Changes, Balance and Fixes:\n\n{{notes}}' },
    { name: 'Summarize', text: 'Summarize this in {{length}} bullet points:\n\n{{text}}' },
    { name: 'Translate to French', text: 'Translate to natural French:\n\n{{text}}' },
    { name: 'Brainstorm names', text: 'Give me 15 name ideas for {{thing}}. Mix styles: short, descriptive, playful. Mark your top 3.' },
  ];
  let prompts = null;

  async function load() {
    if (!prompts) {
      prompts = await window.hub.kvGet('prompts', null);
      if (!prompts) { prompts = DEFAULTS.map((p, i) => ({ id: `p${i}`, ...p })); await window.hub.kvSet('prompts', prompts); }
    }
    return prompts;
  }
  const vars = (text) => [...new Set([...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))];

  // Asks for any {{variables}} and returns the filled-in text (or null if cancelled).
  async function fill(prompt) {
    const names = vars(prompt.text);
    if (!names.length) return prompt.text;
    const values = await Modal.form(prompt.name, names.map((n) => ({ name: n, label: n.replace(/_/g, ' '), type: /code|text|notes/.test(n) ? 'textarea' : 'text' })), { ok: 'Insert' });
    if (!values) return null;
    return prompt.text.replace(/\{\{(\w+)\}\}/g, (_, n) => values[n] ?? '');
  }

  // Dropdown under a composer textarea while the message starts with "/": chat commands (commands.js), their
  // argument suggestions, then saved prompts.
  function attach(textarea, onPick) {
    let menu = null;
    let sel = 0;
    let items = [];
    let seq = 0;
    const close = () => { menu?.remove(); menu = null; };
    const setText = (text) => { textarea.value = text; textarea.dispatchEvent(new Event('input')); textarea.focus(); textarea.setSelectionRange(text.length, text.length); };
    const pick = async (it) => {
      close();
      if (it.kind === 'command') { setText(`/${it.def.name} `); return; }
      if (it.kind === 'arg') { setText(`/${it.def.name} ${it.value}`); return; }
      const text = await fill(it.prompt);
      if (text != null) onPick(text);
    };
    const update = async () => {
      const my = ++seq;
      const value = textarea.value;
      const word = value.match(/^\/([\w-]*)$/);
      const withArgs = !word && value.match(/^\/([\w-]+)\s([^\n]*)$/);
      let next = [];
      if (word) {
        const q = word[1].toLowerCase();
        next = Commands.matching(q).slice(0, 8).map((def) => ({ kind: 'command', def, label: `/${def.name}${def.args ? ` ${def.args}` : ''}`, hint: def.desc }));
        const prompts = (await load()).filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
        next.push(...prompts.map((p) => ({ kind: 'prompt', prompt: p, label: p.name, hint: p.text.slice(0, 70).replace(/\n/g, ' ') })));
      } else if (withArgs) {
        const def = Commands.get(withArgs[1]);
        if (def?.complete) {
          const opts = (await def.complete(withArgs[2], { agentId: null })) || [];
          next = opts.slice(0, 10).map((o) => ({ kind: 'arg', def, value: o.value, label: o.label || o.value, hint: o.hint || '' }));
        }
      }
      if (my !== seq) return; // a newer keystroke already updated the menu
      items = next;
      if (!items.length) { close(); return; }
      if (!menu) { menu = el('div', { class: 'slash-menu' }); textarea.parentElement.append(menu); }
      sel = Math.min(sel, items.length - 1);
      menu.replaceChildren(...items.map((it, i) => el('div', {
        class: `slash-item${i === sel ? ' sel' : ''}${it.kind === 'command' ? ' cmd' : ''}`, on: { mousedown: (e) => { e.preventDefault(); pick(it); } },
      }, el('b', { text: it.label }), el('span', { class: 'hint', text: it.hint }))));
      menu.children[sel]?.scrollIntoView({ block: 'nearest' });
    };
    textarea.addEventListener('input', update);
    textarea.addEventListener('keydown', (e) => {
      if (!menu) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel + 1) % items.length; update(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel - 1 + items.length) % items.length; update(); }
      else if (e.key === 'Tab' || (e.key === 'Enter' && !(items[sel].kind === 'command' && textarea.value.trim() === `/${items[sel].def.name}`))) {
        // Enter on a fully typed command runs it (the form submits); otherwise Enter / Tab completes
        e.preventDefault(); e.stopImmediatePropagation(); pick(items[sel]);
      } else if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); }
    }, true);
    textarea.addEventListener('blur', () => setTimeout(close, 150));
  }

  async function manage() {
    await load();
    const dialog = el('dialog', { class: 'ui-modal prompts-dialog' });
    const list = el('div', { class: 'prompt-list' });
    const name = el('input', { placeholder: 'Name' });
    const text = el('textarea', { rows: 9, placeholder: 'Prompt text. Use {{variable}} for blanks you fill in each time.' });
    let editing = null;
    const persist = () => window.hub.kvSet('prompts', prompts);
    const renderList = () => list.replaceChildren(...prompts.map((p) => el('button', {
      type: 'button', class: `prompt-item${editing === p.id ? ' on' : ''}`, text: p.name,
      on: { click: () => { editing = p.id; name.value = p.name; text.value = p.text; renderList(); } },
    })));
    const saveCurrent = () => {
      if (!name.value.trim()) { toast('Give the prompt a name', { type: 'error' }); return; }
      if (editing) Object.assign(prompts.find((p) => p.id === editing), { name: name.value.trim(), text: text.value });
      else { editing = `p${Date.now()}`; prompts.push({ id: editing, name: name.value.trim(), text: text.value }); }
      persist(); renderList(); toast('Prompt saved', { timeout: 1200 });
    };
    dialog.append(el('form', { method: 'dialog' },
      el('h2', { text: 'Prompt library' }),
      el('p', { class: 'hint', text: 'Type / at the start of any native chat message to insert one of these.' }),
      el('div', { class: 'prompts-layout' }, list, el('div', { class: 'prompt-edit' }, name, text,
        el('div', { class: 'button-row' },
          el('button', { type: 'button', class: 'primary', text: 'Save', on: { click: saveCurrent } }),
          el('button', { type: 'button', class: 'ghost', text: 'New', on: { click: () => { editing = null; name.value = ''; text.value = ''; renderList(); name.focus(); } } }),
          el('button', { type: 'button', class: 'ghost', text: 'Use now', on: { click: async () => { const t = await fill({ name: name.value, text: text.value }); if (t != null) { dialog.close(); draftToClaude(t); } } } }),
          el('button', { type: 'button', class: 'ghost danger', text: 'Delete', on: { click: () => { if (!editing) return; prompts = prompts.filter((p) => p.id !== editing); editing = null; name.value = ''; text.value = ''; persist(); renderList(); } } })))),
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Close' }))));
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    renderList();
    dialog.showModal();
  }

  return { attach, manage, load, fill };
})();
