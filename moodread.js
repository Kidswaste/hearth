// (round 179, moodread179) The mood read, the window side (lazy group `projectbrief`; moodread-core.js has the pure
// parts and the prompts). A moodboard read deeply, on the owner's click and at whatever it costs:
//   · every picture at full size (1568 px; a clip: six full frames), three looks each + a second, independent look
//     (Astra when it is set up, else a fresh Claude pass), then one pass over the whole board
//   · kept with the board (kv 'mood-reads', synced with the projects): paid once; a new or changed picture is read
//     again alone, then the board pass
//   · the panel (◐ Mood read on a project's plan card, the board's menu, /moodread): the cost before a run, progress
//     with Stop, the board read, then every picture's read next to its measured numbers and the second look, with what
//     disagrees named; ✎ Edit the read, My corrections, ✎ Correct on a picture, ↻ Read again, "This is mine"
//   · the directors: three_do brief ends with the board read and the inspiration rule (MoodRead.directorText), the
//     project brief is written from it (MoodRead.briefLines), and three_references add refuses a moodboard picture
//     that isn't marked as the owner's own (MoodRead.refGate)
// Nothing is read or sent by itself: a read runs when the owner confirms its cost.
const MoodRead = (() => {
  const C = MoodReadCore;
  let data = C.norm(null); let readOk = false; let readP = null;
  const running = new Map(); // boardId → { i, n, title, step, stop }
  const listeners = new Set();
  const calm = (err) => (window.calmError ? calmError(err) : String(err?.message || err));
  const emit = (id) => { for (const fn of listeners) { try { fn(id); } catch (err) { console.warn(err); } } repaint(id); };

  // ---------- the store ----------
  function ready() {
    readP ||= (async () => {
      const r = await window.hub.kvGet(C.STORE, null, { status: true }).catch(() => null);
      if (r?.state === 'ok' || r?.state === 'missing') { data = C.norm(r.value); readOk = true; } else readOk = false; // a read that failed is never "empty" (datasafe)
    })();
    return readP;
  }
  const write = async () => { if (!readOk) throw new Error('The mood reads couldn\'t be read, so nothing is saved over them.'); await window.hub.kvSet(C.STORE, data); };
  window.StoreAck?.hold(C.STORE, { name: 'Mood reads', saver: () => write().catch(() => {}), read: () => StoreAck.kv(C.STORE, null), apply: (d) => { if (!readOk) return false; data = C.norm(d); emit(null); return true; } });
  const entry = (id) => C.entry(data, id);
  const set = async (id, patch) => { data = C.put(data, id, patch); await write(); emit(id); };

  // ---------- the board ----------
  async function boardOf(id) {
    if (window.Lazy && !Lazy.loaded('board')) await Lazy.load('board');
    await Board.ready();
    const b = Board.current()?.id === id ? Board.current() : await Board.load(id).catch(() => null);
    if (!b) return null;
    const name = Board.boards().find((x) => x.id === id)?.name || b.name || 'Moodboard';
    return { id, name, items: b.items || [], brief: typeof b.brief === 'string' ? b.brief : '' };
  }
  // the board a chat / project works with: the project's, else the chat's linked board, else the one on screen
  async function boardIdFor(chatId) {
    const P = typeof Projects !== 'undefined' ? Projects : null;
    const p = chatId && P?.projectOfChat?.(chatId);
    const own = p && (p.workspace?.boardId || p.items.filter((x) => x.type === 'board').sort((a, b) => (b.at || 0) - (a.at || 0))[0]?.ref);
    if (own) return own;
    if (typeof Board === 'undefined') return null;
    await Board.ready();
    return (chatId && Board.boardFor ? (await Board.boardFor(chatId).catch(() => null))?.id : null) || Board.current()?.id || null;
  }

  // ---------- one reference at full size, as files the AI can open ----------
  const b64 = (canvas) => BoardEyes.jpeg(canvas, 0.9);
  async function pictures(it) {
    const tag = `moodread-${it.id}-${Date.now().toString(36)}`;
    if (C.isClip(it)) {
      if (typeof FrameRead === 'undefined') await window.Lazy?.load?.('capture')?.catch?.(() => {});
      try {
        const fr = await BoardEyes.framesOf(it, { count: C.CLIP_FRAMES, mode: 'even', width: C.FULL });
        const out = [];
        for (const [k, f] of fr.frames.entries()) out.push(await window.hub.saveAttachment(`${tag}-f${k + 1}.jpg`, f.canvas ? b64(f.canvas) : await window.hub.fs.read(f.path, { encoding: 'base64' })));
        if (out.length) return out;
      } catch (err) { console.warn('mood read: frames', err); }
    }
    const c = await BoardEyes.stillOf(it, C.FULL); // (a clip whose frames can't be read here: its poster at least)
    return [await window.hub.saveAttachment(`${tag}.jpg`, b64(c))];
  }

  // ---------- the AIs ----------
  const native = (a) => a && a.mode === 'native';
  const reader = () => H.claudeAgent?.() || H.agents().find(native) || null;
  const secondReader = (first) => H.agents().find((a) => native(a) && a.engine !== first?.engine) || null;
  let secondBroken = false; // the other AI failed once in this run: a fresh pass of the first reader gives the second look
  async function ask(rq) {
    const first = reader();
    if (!first) return { ok: false, error: 'Add a native AI in Settings first.' };
    let a = first;
    if (rq.second && !secondBroken) a = secondReader(first) || first;
    const once = (agent) => window.hub.askOnce({ agentId: agent.id, text: rq.text, images: rq.images || [], options: { lean: true, helper: true, persona: rq.persona } }).catch((err) => ({ ok: false, error: err.message }));
    let r = await once(a);
    if (!r?.ok && a !== first) { secondBroken = true; a = first; r = await once(a); }
    if (r?.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: a.id, usage: r.usage, source: 'mood read' } }));
    return { ...r, by: a.name };
  }
  // the cost in the owner's own measured price, when there is one (budget-core.js), else tokens alone
  function price(tokens) {
    try { const a = reader(); const u = BudgetCore.used(Meter.stats, a.id, BudgetCore.weekDays()); const $ = BudgetCore.priceOf(u.cost ? u : BudgetCore.used(Meter.stats, a.id, BudgetCore.lastWeekDays()), tokens); return $ >= 0.01 ? ` (about ${BudgetCore.money($)} at this week's average price)` : ''; } catch { return ''; }
  }

  // ---------- run ----------
  // opts: { scope, second, force, only: one item id (↻ Read again), confirm: false to skip the cost question (checks) }
  async function plan(boardId, opts = {}) {
    await ready();
    const b = await boardOf(boardId);
    if (!b) throw new Error('That board isn\'t here.');
    const e = entry(boardId);
    const scope = opts.scope === undefined ? (e?.scope || null) : (opts.scope?.length ? opts.scope : null);
    const list = C.media(b.items, scope);
    const st = C.stale({ ...(e || {}), scope }, b.items, b.brief);
    const todo = opts.force ? list : list.filter((it) => st.add.includes(it.id) || opts.only === it.id);
    const second = opts.second !== false;
    const est = C.estimate(todo, { second, board: todo.length || st.board ? list.length : 0 });
    return { b, e, scope, list, todo, st, second, est, line: `${C.costLine(est)}${price(est.in + est.out)}` };
  }
  async function run(boardId, opts = {}) {
    if (running.has(boardId)) return running.get(boardId).task;
    const p = await plan(boardId, opts);
    if (!p.list.length) throw new Error('This board has no pictures or clips to read yet.');
    if (!p.est.calls) { toast('The mood read is up to date: nothing to read again.'); return { entry: p.e, read: 0, failed: [] }; }
    if (opts.confirm !== false) {
      const who = [reader()?.name, p.second ? (secondReader(reader())?.name || `a second ${reader()?.name} pass`) : null].filter(Boolean).join(' + ');
      const yes = await Modal.confirm(`Read “${p.b.name}” deeply?`, `${p.todo.length ? `${p.todo.length} of ${p.list.length} picture${p.list.length === 1 ? '' : 's'} to read at full size (three looks each${p.second ? ' and a second, independent look' : ''}), then the whole board.` : 'The pictures are read; only the whole-board pass runs again.'} ${p.line}. Read by ${who}, on ${reader()?.name}'s own model. It is kept with the board, so you pay for a picture once.`, { ok: 'Read it' });
      if (!yes) return null;
    }
    const state = { i: 0, n: p.todo.length, title: '', step: 'starting', stop: false };
    secondBroken = false;
    state.task = (async () => {
      try {
        const out = await C.run(boardId, { scope: p.scope, second: p.second, force: opts.force || undefined }, {
          board: async () => p.b,
          pictures, ask, read: async () => data, write: async (d) => { data = d; await write(); emit(boardId); },
          summary: (items) => { try { return BoardVibe.boardText(p.b.name, items, ['palette', 'light', 'color', 'texture', 'motion']).split('\n').slice(1).join('; '); } catch { return ''; } },
          progress: (s) => { Object.assign(state, s); repaint(boardId); }, stopped: () => state.stop,
        });
        const u = out.usage;
        toast(out.stopped ? `Mood read stopped: what was read is kept (${out.read} picture${out.read === 1 ? '' : 's'}).` : `◐ The mood read of “${p.b.name}” is ready${out.failed.length ? ` (${out.failed.length} couldn't be read)` : ''} · ${C.kfmt(u.in)} tokens in, ${C.kfmt(u.out)} out`, { timeout: 6000, action: { label: 'Show', fn: () => open(boardId) } });
        return out;
      } finally { running.delete(boardId); emit(boardId); }
    })();
    running.set(boardId, state);
    repaint(boardId);
    return state.task;
  }
  // ↻ Read again (one picture): its stored read dropped first, so the run takes it up
  async function again(boardId, itemId) {
    const e = entry(boardId); if (!e) return null;
    const items = { ...e.items }; const keep = items[itemId]?.edit; delete items[itemId];
    if (keep) items[itemId] = { sig: '', edit: keep, error: 'to be read again' };
    await set(boardId, { items });
    return run(boardId, {});
  }

  // ---------- the owner's edits ----------
  async function edit(boardId) {
    const e = entry(boardId);
    if (!e?.board) { toast('No mood read to edit yet.', { type: 'error' }); return; }
    const text = await Modal.prompt(`The mood read · ${e.name || 'Moodboard'}`, { value: C.toText(e.board), multiline: true, label: 'Change anything; keep the headings (Mood, Essence, Shared, Threads, Tensions, Not, Colour … Make). Lists: one per line starting with "- ". The directors get your version, and the next refresh is told to keep your wording.' });
    if (text == null) return;
    const b = C.fromText(text);
    if (!b) { toast('A mood read needs its "Mood:" line: nothing changed.', { type: 'error' }); return; }
    await set(boardId, { board: { ...e.board, ...b, edited: Date.now() } });
    toast('Mood read saved: the directors get your version.', { timeout: 2600 });
  }
  async function corrections(boardId) {
    const e = entry(boardId);
    const text = await Modal.prompt('My corrections', { value: e?.corrections || '', multiline: true, label: 'In your own words: what the read gets wrong, what matters most, what to leave out. It leads what the directors get, and every refresh reads it first.' });
    if (text == null) return;
    await set(boardId, { corrections: C.cap(text, 800) || undefined });
  }
  async function correct(boardId, itemId) {
    const e = entry(boardId); const r = e?.items?.[itemId]; if (!r) return;
    const text = await Modal.prompt('Correct this picture\'s read', { value: `Feeling: ${r.edit?.feeling || r.feeling || ''}\nTake: ${r.edit?.take || r.take || ''}`, multiline: true, label: 'What it feels like, and what to carry into new work. The next whole-board pass uses your version.' });
    if (text == null) return;
    const feeling = C.cap((/^feeling:\s*(.*)$/im.exec(text) || [])[1] || '', 420); const take = C.cap((/^take:\s*(.*)$/im.exec(text) || [])[1] || '', 420);
    const same = feeling === (r.feeling || '') && take === (r.take || '');
    await set(boardId, { items: { ...e.items, [itemId]: { ...r, edit: same ? undefined : { feeling, take } } }, board: e.board ? { ...e.board, sig: '' } : e.board }); // (the board pass is due again)
  }
  // "This is mine: may be used as is" (the item's `footage` mark, board-ask.js): on the board on screen only
  async function setMine(boardId, itemId, on) {
    if (Board.current()?.id !== boardId) { toast('Open this board first (the mark is saved with the picture on it).', { type: 'error' }); return false; }
    Board.patch([itemId], { footage: on || undefined }, on ? 'mine: may be used as is' : 'reference only');
    emit(boardId);
    return true;
  }

  // ---------- what the directors and the brief get ----------
  async function directorText(chatId) {
    await ready();
    const id = await boardIdFor(chatId).catch(() => null);
    const e = id && entry(id);
    if (!e?.board) return id && C.media((await boardOf(id).catch(() => null))?.items || []).length ? `No mood read of the moodboard yet (the owner can run one: ◐ Mood read). Until then: references are inspiration. ${C.RULE.replace(/^[^:]*: this read is the mood to work in\. /, '')}` : '';
    const b = await boardOf(id).catch(() => null);
    return C.directorText(e, b || {});
  }
  const briefLines = (boardId, items) => { const e = entry(boardId); return e?.board ? C.briefLines(e, { items }) : []; };
  // three_references add: a file that came from the moodboard (a tile dragged into the chat keeps its source in the
  // inspo-drop cache) and isn't marked as the owner's own is refused, unless the owner asked for that file in this message
  async function refGate(path, args = {}, ctx = {}) {
    try {
      const kv = await window.hub.kvGet('inspo-drop', null).catch(() => null);
      const hit = Object.entries(kv?.cache || {}).find(([, p]) => String(p).toLowerCase() === String(path).toLowerCase());
      if (!hit) return null;
      const src = hit[0].split('|')[0];
      if (window.Lazy && !Lazy.loaded('board')) await Lazy.load('board');
      await Board.ready();
      const boards = [ctx.chatId && await Board.boardFor(ctx.chatId).catch(() => null), Board.current()].filter(Boolean);
      const it = boards.flatMap((b) => b.items || []).find((i) => i.src === src || i.thumb === src || i.tiny === src);
      if (it?.footage === true) return null;
      if (args.asked === true) return null;
      return `"${it?.title || 'This picture'}" is a moodboard reference, not marked as the owner's own material: borrow its feel (three_do brief has the mood read), don't put the file in the scene. If the owner asked in their last message for this very file in the scene, call again with asked: true; otherwise they can mark it "This is mine" on the board, or drop it into the Lab themselves.`;
    } catch (err) { console.warn('mood read: gate', err); return null; }
  }

  // ---------- the panel ----------
  const btn = (text, title, fn, cls = 'ghost small') => el('button', { type: 'button', class: cls, text, title, on: { click: async (ev) => { ev.preventDefault(); ev.stopPropagation(); const b = ev.currentTarget; b.disabled = true; try { await fn(); } catch (err) { toast(calm(err), { type: 'error' }); } finally { b.disabled = false; } } } });
  const ago = (t) => (typeof timeAgo === 'function' ? timeAgo(t) : new Date(t).toLocaleString());
  const line = (label, text) => (text ? el('p', { class: 'mr-line' }, el('b', { text: `${label} ` }), text) : null);
  const listOf = (label, arr) => (arr?.length ? el('div', { class: 'mr-list' }, el('b', { text: label }), el('ul', {}, arr.map((s) => el('li', { text: s })))) : null);
  let panel = null; // { boardId, dialog, body, opts }
  function pictureRow(boardId, it, n, r) {
    const thumb = it.tiny || it.poster || it.thumb || (it.type === 'image' ? it.src : '');
    const row = el('div', { class: 'mr-pic', dataset: { item: it.id } }, thumb ? el('img', { class: 'mr-thumb', src: Board.fileUrl(thumb), alt: '', attrs: { loading: 'lazy' } }) : el('span', { class: 'mr-thumb' }));
    const body = el('div', { class: 'mr-pic-body' });
    const mineBox = el('input', { type: 'checkbox', checked: C.mine(it), on: { change: async () => { if (!(await setMine(boardId, it.id, mineBox.checked))) mineBox.checked = C.mine(it); } } });
    body.append(el('div', { class: 'mr-pic-head' }, el('b', { text: `${n} · ${it.title || (C.isClip(it) ? 'Clip' : 'Picture')}` }), el('label', { class: 'mr-mine', title: 'Yours (your own footage, photo or artwork): the AIs may put this file itself in a scene. Off: it is a reference, only its mood is used.' }, mineBox, ' This is mine: may be used as is')));
    if (!r) { body.append(el('p', { class: 'mr-note', text: 'Not read yet.' })); row.append(body); return row; }
    if (r.error) { body.append(el('p', { class: 'mr-flag', text: `Couldn't be read: ${r.error}` }), el('div', { class: 'mr-acts' }, btn('↻ Read again', 'Read this picture again', () => again(boardId, it.id)))); row.append(body); return row; }
    if (it.like) body.append(line('You like:', it.like));
    body.append(line('What the AI saw (only for you, to check it looked; never passed on):', r.seen));
    body.append(line(r.edit?.feeling ? 'Feeling (your correction):' : 'Feeling:', r.edit?.feeling || r.feeling));
    if (r.words?.length) body.append(el('p', { class: 'mr-words' }, r.words.map((w) => el('span', { class: 'mr-word', text: w }))));
    body.append(line(r.edit?.take ? 'To carry over (your correction):' : 'To carry over:', r.edit?.take || r.take));
    body.append(el('details', { class: 'mr-more' }, el('summary', { text: 'The three looks' }),
      ...['colour', 'light', 'texture', 'shape', 'composition', 'depth', 'motion', 'era', 'echoes'].map((k) => line(`${k[0].toUpperCase()}${k.slice(1)}:`, r[k]))));
    // accuracy: the read's claims next to the numbers measured on this computer, and next to the second look
    const ck = C.check(r, it.vibe);
    if (ck.n) body.append(el('p', { class: ck.flags.length ? 'mr-check mr-flag' : 'mr-check' }, `Measured here: ${Object.values(ck.measured).join(', ')}. The read agrees on ${ck.agree + ck.near} of ${ck.n}${ck.flags.length ? `. Contradicts: ${ck.flags.join('; ')}` : ''}`));
    else body.append(el('p', { class: 'mr-check mr-note', text: 'Not measured on this computer yet, so nothing to check the read against.' }));
    const ag = C.agreement(r);
    if (ag) body.append(el('p', { class: ag.differ.length ? 'mr-check mr-flag' : 'mr-check' }, `Second look (${r.second.by || 'another AI'}): “${r.second.feeling}” Same on ${ag.same} of ${ag.n}${ag.shared.length ? `; both said ${ag.shared.join(', ')}` : ''}${ag.differ.length ? `. Disagrees: ${ag.differ.join('; ')}` : ''}`));
    else if (r.secondError) body.append(el('p', { class: 'mr-check mr-note', text: `No second look (${r.secondError}).` }));
    body.append(el('div', { class: 'mr-acts' }, btn('✎ Correct', 'Put the feeling and what to carry over in your own words', () => correct(boardId, it.id)), btn('↻ Read again', 'Read this picture again (its three looks and the second look), then the board', () => again(boardId, it.id))));
    row.append(body);
    return row;
  }
  async function paint() {
    if (!panel) return;
    const { boardId, body } = panel;
    const b = await boardOf(boardId).catch(() => null);
    if (!panel || panel.boardId !== boardId) return;
    const e = entry(boardId); const run0 = running.get(boardId);
    const nodes = [];
    if (!b) { body.replaceChildren(el('p', { text: 'That board isn\'t here.' })); return; }
    const all = C.media(b.items);
    const starred = all.filter((it) => it.stamp === '★' || it.stamp === '♥' || it.like);
    const picked = (Board.current()?.id === boardId ? Board.selected() : []).filter((it) => C.MEDIA.includes(it.type));
    const scope = panel.opts.scope === undefined ? (e?.scope || null) : panel.opts.scope;
    const st = C.stale({ ...(e || {}), scope }, b.items, b.brief);
    const list = C.media(b.items, scope);
    // what to read
    const pick = el('select', { class: 'mr-scope', attrs: { 'aria-label': 'Which pictures' }, on: { change: () => { panel.opts.scope = pick.value === 'all' ? null : (pick.value === 'starred' ? starred : picked).map((it) => it.id); paint(); } } },
      el('option', { value: 'all', text: `The whole board (${all.length})`, selected: !scope }),
      starred.length && starred.length < all.length ? el('option', { value: 'starred', text: `Only starred or liked (${starred.length})`, selected: Boolean(scope) && scope.length === starred.length && !picked.length }) : null,
      picked.length ? el('option', { value: 'picked', text: `Only what is selected on the board (${picked.length})`, selected: Boolean(scope) && scope.length === picked.length }) : null,
      scope && !(scope.length === starred.length) && !(picked.length && scope.length === picked.length) ? el('option', { value: 'kept', text: `The pictures of the last read (${list.length})`, selected: true }) : null);
    const second = el('input', { type: 'checkbox', checked: panel.opts.second !== false, on: { change: () => { panel.opts.second = second.checked; paint(); } } });
    const p = await plan(boardId, { scope, second: panel.opts.second }).catch(() => null);
    if (!panel || panel.boardId !== boardId) return;
    const head = el('div', { class: 'mr-head' });
    if (run0) head.append(el('p', { class: 'mr-now', text: run0.n ? `Reading ${Math.min(run0.i + 1, run0.n)} of ${run0.n}: ${run0.title} · ${run0.step}` : `Reading: ${run0.step}` }), el('div', { class: 'mr-acts' }, btn('Stop', 'Stop after this picture; what was read is kept', () => { run0.stop = true; })));
    else {
      const due = p?.est.calls > 0;
      head.append(el('div', { class: 'mr-acts' }, pick, el('label', { class: 'mr-second', title: 'Each picture is also read once more, alone, by another AI (Astra when it is set up); the two reads are shown side by side. About a quarter of the cost.' }, second, ' Second, independent look'),
        btn(e?.board ? (due ? `↻ Refresh the read${p.todo.length ? ` (${p.todo.length} to read)` : ''}` : '✓ Up to date') : '◐ Read this board deeply', 'Asks first, with the cost', () => run(boardId, { scope, second: panel.opts.second }), 'small primary'),
        e?.board ? btn('Read everything again', 'Every picture from scratch (the full cost again)', () => run(boardId, { scope, second: panel.opts.second, force: true })) : null));
      head.append(el('p', { class: 'mr-note mr-cost', text: due ? `${p.line}.` : e?.board ? `Read ${ago(e.board.at)}${e.by ? ` by ${e.by}` : ''}${e.second ? `, second look by ${e.second}` : ''}${e.usage ? ` · it cost ${C.kfmt(e.usage.in)} tokens in, ${C.kfmt(e.usage.out)} out so far` : ''}.` : '' }));
      if (e?.board && (st.add.length || st.gone.length)) head.append(el('p', { class: 'mr-flag', text: `The board changed since the read: ${[st.add.length && `${st.add.length} new or changed picture${st.add.length === 1 ? '' : 's'}`, st.gone.length && `${st.gone.length} removed`].filter(Boolean).join(', ')}. Refresh reads only those.` }));
      if (st.outside) head.append(el('p', { class: 'mr-note', text: `${st.outside} picture${st.outside === 1 ? ' is' : 's are'} outside this read (your pick).` }));
    }
    nodes.push(head);
    // the board read
    const br = e?.board;
    if (br) {
      nodes.push(el('section', { class: 'mr-board' }, el('h3', { text: br.mood }), e.corrections ? line('Your corrections:', e.corrections) : null, el('p', { class: 'mr-essence', text: br.essence }),
        listOf('What the pictures share', br.shared), listOf('Threads inside the board', (br.threads || []).map((t) => `${t.name}: ${t.feel}${t.pictures?.length ? ` (pictures ${t.pictures.join(', ')})` : ''}`)),
        listOf('Where they disagree', br.tensions), ...C.BOARD_LINES.map((k) => line(`${k[0].toUpperCase()}${k.slice(1)}:`, br[k])), listOf('This mood is not', br.not), listOf('To make new work in it', br.make),
        el('div', { class: 'mr-acts' }, btn('✎ Edit the read', 'Change any line; the directors get your version', () => edit(boardId)), btn('My corrections…', 'What the read gets wrong, in your words: it leads what the directors get', () => corrections(boardId)),
          btn('What the directors get', 'The exact text a director receives with the project brief', async () => { await Modal.alert('What a director gets', C.directorText(entry(boardId), b)); }))));
    } else if (!run0) nodes.push(el('p', { class: 'mr-note', text: 'Not read yet. A read looks at every picture at full size, three times, then at the board as a whole. The directors then work from the mood it finds, not from the pictures.' }));
    // every picture
    const num = new Map(all.map((it, i) => [it.id, i + 1]));
    const flagged = list.filter((it) => { const r = e?.items?.[it.id]; return r && !r.error && (C.check(r, it.vibe).flags.length || C.agreement(r)?.differ.length); }).length;
    if (e && Object.keys(e.items || {}).length) nodes.push(el('h4', { class: 'mr-sub', text: `Picture by picture${flagged ? ` · ${flagged} to check (a measurement or the second look disagrees)` : ''}` }), el('div', { class: 'mr-pics' }, list.map((it) => pictureRow(boardId, it, num.get(it.id), e.items[it.id]))));
    const y = body.scrollTop;
    body.replaceChildren(...nodes.filter(Boolean));
    body.scrollTop = y;
  }
  let paintT = 0;
  function repaint(id) { if (!panel || (id && panel.boardId !== id) || paintT) return; paintT = setTimeout(() => { paintT = 0; paint().catch((err) => console.warn('mood read panel', err)); }, 60); }
  async function open(boardId) {
    await ready();
    boardId ||= await boardIdFor(H.activeChat?.[H.activeId] || null);
    if (!boardId) { toast('Open a project or a moodboard first.', { type: 'error' }); return null; }
    close();
    const b = await boardOf(boardId);
    const body = el('div', { class: 'mr-body' });
    const dialog = el('dialog', { class: 'ui-modal mr-panel', attrs: { 'aria-label': 'Mood read' } }, el('div', { class: 'mr-top' }, el('h2', { text: `◐ Mood read · ${b?.name || 'Moodboard'}` }), el('button', { type: 'button', class: 'ghost small', text: 'Close', on: { click: () => close() } })), body);
    dialog.addEventListener('close', () => { if (panel?.dialog === dialog) panel = null; setTimeout(() => dialog.remove(), 0); });
    document.body.append(dialog);
    panel = { boardId, dialog, body, opts: { scope: undefined, second: true } };
    dialog.showModal();
    await paint();
    return dialog;
  }
  function close() { try { panel?.dialog.close(); } catch { /* gone */ } panel = null; }

  // a short state for the plan card's button
  function status(boardId) {
    const e = boardId && entry(boardId);
    if (running.has(boardId)) return 'reading…';
    return e?.board ? 'read' : '';
  }

  // ---------- /moodread, the board's menu, Ctrl/⌘+K ----------
  if (typeof Commands !== 'undefined' && !Commands.get('moodread')) {
    Commands.register({ name: 'moodread', area: 'Projects', args: '[run|edit|show]',
      desc: 'This project\'s moodboard read deeply: every picture at full size, the mood in precise words, checked against the measurements; the directors work from it (inspiration, not copies)',
      keywords: 'mood read moodboard deep inspiration references precise accurate copy', run: async (args, ctx) => {
        await ready();
        const id = await boardIdFor(ctx?.chatId || H.activeChat?.[H.activeId] || null);
        if (!id) return 'Open a project or a moodboard first.';
        const a = String(args || '').trim().toLowerCase();
        if (a === 'edit') { await edit(id); return null; }
        await open(id);
        if (a === 'run') run(id, {}).catch((err) => toast(calm(err), { type: 'error' }));
        return null;
      } });
  }
  if (typeof AppUI !== 'undefined') AppUI.addAction?.('Mood read: read this moodboard deeply (inspiration, not copies)', () => open().catch((err) => toast(calm(err), { type: 'error' })));
  // the board changes: the panel shows what is new
  let boardHeard = false;
  const hearBoard = () => { if (boardHeard || typeof Board === 'undefined' || !Board.onChange) return; boardHeard = true; Board.onChange((what) => { if (['items', 'vibe', 'boards'].includes(what)) repaint(null); }); };
  listeners.add(hearBoard);

  ready();
  return { ready, open, close, run, again, plan, edit, corrections, correct, setMine, directorText, briefLines, refGate, status, boardIdFor, get: (id) => entry(id), onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, _: { data: () => data, set, pictures, ask, running, paint } };
})();
window.MoodRead = MoodRead;
