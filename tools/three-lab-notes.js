// (round 158, split158) The Lab's notes: a note with a screenshot (N), the notes list, a note's card.
// Moved out of tools/three.js as it was, loaded on first use (lazy group `labpartnotes`, tools/three.js labPart): the names
// it reads inside the Lab (the sketch tab: its state, helpers, the other parts' stand-ins) go through K.
(window.LabParts ||= {}).notes = (K) => {
  async function takeNote({ text: given, time } = {}) {
    if (!K.current) return null;
    const t = time ?? (K.player.loaded ? K.player.time : 0);
    if (time != null && K.player.loaded) { K.player.seek(time); await K.sleep(500); }
    // the frame is captured right away, while you type the note
    const shotP = K.director.shot();
    const text = given ?? await Modal.prompt(`Note at ${K.fmtMs(t)}`, { placeholder: 'What should change here? (the screenshot is saved with it)', multiline: true });
    if (text == null) return null;
    const shot = await shotP;
    let image = null;
    if (shot) { try { image = await window.hub.saveAttachment(`note ${K.current.name} ${K.fmtMs(t).replace(/:/g, '-')}.png`.replace(/[\\/:*?"<>|]/g, '_'), shot.split(',')[1]); } catch { image = null; } }
    const n = { id: `n${Date.now().toString(36)}`, t: Math.round(t * 1000) / 1000, text: String(text).trim() || '(no text)', image, at: Date.now(), done: false };
    K.notesOf().push(n);
    K.notesOf().sort((a, b) => a.t - b.t);
    K.saveNotes();
    K.renderNotes();
    if (given == null) toast(`Note saved at ${K.fmtMs(t)}`, { timeout: 1800 });
    return n;
  }
  function placeCard(card, x, y) {
    document.body.append(card);
    const r = card.getBoundingClientRect();
    Object.assign(card.style, { left: `${Math.max(8, Math.min(innerWidth - r.width - 8, x - r.width / 2))}px`, top: `${Math.max(8, Math.min(innerHeight - r.height - 8, y - r.height - 12))}px` });
    const close = (e) => { if (!card.contains(e.target) && !e.target.closest?.('.ui-modal')) { card.remove(); removeEventListener('pointerdown', close, true); } };
    setTimeout(() => addEventListener('pointerdown', close, true));
  }
  function openNote(id, x, y) {
    const n = K.notesOf().find((m) => m.id === id);
    if (!n) return;
    document.querySelector('.note-card')?.remove();
    const ta = el('textarea', { class: 'note-text', rows: 3 });
    ta.value = n.text;
    ta.addEventListener('change', () => { n.text = ta.value.trim() || '(no text)'; K.saveNotes(); K.renderNotes(); });
    const card = el('div', { class: 'note-card' },
      el('div', { class: 'note-head' }, el('b', { text: `📌 ${K.fmtMs(n.t)}` }), el('span', { class: 'hint', text: n.done ? 'done' : '' }), el('span', { class: 'spacer' }), K.btn('×', 'Close', () => card.remove())),
      n.image ? el('img', { class: 'note-img', src: K.fileUrl(n.image), title: 'The frame when you took the note' }) : null,
      ta,
      el('div', { class: 'note-actions' },
        K.btn(n.done ? 'Reopen' : '✓ Done', n.done ? 'Mark it as still to do' : 'Mark it as handled', () => { n.done = !n.done; K.saveNotes(); K.renderNotes(); card.remove(); }),
        K.btn('Delete', 'Delete this note', () => { K.notesAll[K.current.id] = K.notesOf().filter((m) => m !== n); K.saveNotes(); K.renderNotes(); card.remove(); }),
        el('span', { class: 'spacer' }),
        K.btn('Send to director', 'Put this note and its screenshot in the Three Director\'s chat box', () => { card.remove(); sendNotes([n]); }, 'primary small')));
    placeCard(card, x, y);
  }
  function notesList(anchor) {
    document.querySelector('.note-card')?.remove();
    const list = K.notesOf();
    const card = el('div', { class: 'note-card note-list' },
      el('div', { class: 'note-head' }, el('b', { text: `Notes on "${K.current?.name}"` }), el('span', { class: 'spacer' }), K.btn('📌 New', 'Take a note at the playhead (N)', () => { card.remove(); takeNote(); }), K.btn('×', 'Close', () => card.remove())),
      list.length ? el('div', { class: 'note-rows' }, list.map((n) => el('div', { class: `note-row${n.done ? ' done' : ''}` },
        n.image ? el('img', { class: 'note-thumb', src: K.fileUrl(n.image) }) : el('span', { class: 'note-thumb empty', text: '📌' }),
        el('button', { class: 'note-time', text: K.fmtMs(n.t), title: 'Jump there', on: { click: () => K.player.seek(n.t) } }),
        el('span', { class: 'note-sum', text: n.text, title: n.text }),
        K.btn(n.done ? '↺' : '✓', n.done ? 'Reopen' : 'Done', () => { n.done = !n.done; K.saveNotes(); K.renderNotes(); card.remove(); notesList(anchor); }),
        K.btn('🗑', 'Delete', () => { K.notesAll[K.current.id] = K.notesOf().filter((m) => m !== n); K.saveNotes(); K.renderNotes(); card.remove(); notesList(anchor); })))) : el('p', { class: 'hint', text: 'No notes yet. Press N (or 📌 Note) at a moment you want changed.' }),
      list.some((n) => !n.done) ? el('div', { class: 'note-actions' }, el('span', { class: 'spacer' }), K.btn('Send open notes to the director', 'Puts every open note with its screenshot in the Three Director\'s chat box', () => { card.remove(); sendNotes(list.filter((n) => !n.done)); }, 'primary small')) : null);
    const r = anchor.getBoundingClientRect();
    placeCard(card, r.left + r.width / 2, r.top);
  }
  async function sendNotes(list) {
    const agent = H.agents().find((a) => a.threeTools);
    if (!agent) { toast('Add an agent with Three.js tools first (the Three Director)', { type: 'error' }); return; }
    activate(agent.id);
    const paths = list.map((n) => n.image).filter(Boolean);
    if (paths.length) await Native.attachPaths(agent.id, paths);
    Native.setDraft(agent.id, `My notes on "${K.current.name}" (song times${paths.length ? '; the screenshots are attached in the same order' : ''}):\n${list.map((n) => `- ${K.fmtMs(n.t)} [${n.id}]: ${n.text}`).join('\n')}\nPlease make these changes, then mark each note done (three_notes).`);
  }
  return { takeNote, openNote, notesList };
};
