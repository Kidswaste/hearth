// The board, from anywhere: a drawer over any chat or tool (Ctrl+Shift+M, the small ▦ in the rail, /board-peek)
// with the chat's linked board (or the current one). Drag a reference — or the board's top strip — into any chat's
// composer: (round 67, moodqualities67) it attaches the reference's QUALITIES by default (board-qualities.js: palette
// hexes + shares, brightness, contrast, warmth, saturation, grain, busy vs clean, composition, shape language, motion
// and cuts; "What I like about this" first; worded by the distance slider "close to it ↔ only its spirit"), so the
// result borrows the feel instead of copying the picture. The real media (board-drop.js, round 65) is the labelled
// "Picture" button on a tile, right-click › Send the actual picture, or Shift while dropping. Click tiles to pick 2–3
// and the mix card shows their blended qualities before one click sends them.
// Also the one place that turns references into text for chats (vibeText / qualitiesText / attach).
const BoardDrawer = (() => {
  const B = Board; const D = BoardData; const V = BoardVibe; const Q = BoardQualities;
  const REF_TYPE = 'application/x-hearth-ref';
  const RULE = '(References give a vibe only: don\'t put the reference media itself in the result unless I ask for the clip.)';
  let root = null; let open = false; let shownBoard = null; let query = '';
  const picked = new Set(); let pickedBoard = null; // (round 67) tiles picked to mix

  // ---------- references → text ----------
  // Items inside a frame named like "Avoid" / "Don't", or stamped ✕, become an "avoid" line instead.
  const isAvoid = (b, it) => it.stamp === '✕' || b.items.some((f) => f.type === 'frame' && /avoid|don.?t|not this|\bno\b/i.test(f.title || '') && it.x + it.w / 2 >= f.x && it.x + it.w / 2 <= f.x + f.w && it.y + it.h / 2 >= f.y && it.y + it.h / 2 <= f.y + f.h);
  function vibeText({ board, itemIds = [], focus, rule = true } = {}) {
    const b = board || B.current();
    if (!b) return '';
    focus ||= b.focus || 'full'; // the board's default (Board menu → Chats get…, /board-focus)
    const fo = D.find(D.FOCUS, focus) || D.FOCUS[0];
    let body;
    if (itemIds.length) {
      const list = itemIds.map((id) => B.item(id, b)).filter(Boolean);
      body = `${fo.lead}:\n${list.map((it) => `- ${V.text(it, fo.keys)}`).join('\n')}`;
    } else {
      const items = b.items.filter((i) => i.type !== 'frame' && i.type !== 'link' && !i.hidden);
      const avoid = items.filter((i) => isAvoid(b, i));
      body = `${fo.lead}:\n${b.brief ? `Brief: ${String(b.brief).slice(0, 300)}\n` : ''}${V.boardText(b.name, items.filter((i) => !avoid.includes(i)), fo.keys, { avoid: fo.id === 'full' || fo.id === 'lab' ? avoid : [] })}`;
    }
    return rule ? `${body}\n${RULE}` : body;
  }

  // ---------- references → qualities (round 67) ----------
  const listOf = (b, itemIds) => (itemIds.length ? itemIds.map((id) => B.item(id, b)).filter(Boolean) : b.items.filter((i) => i.type !== 'frame' && i.type !== 'link' && !i.hidden));
  const distanceFor = (b) => Q.distanceOf(b?.qualityDistance ?? Q.DEFAULT_DISTANCE);
  function setDistance(b, n) { if (!b) return; b.qualityDistance = Q.distanceOf(n); B.save(b); }
  function setLike(b, it, text) {
    const v = String(text || '').replace(/\s+/g, ' ').trim().slice(0, Q.LIKE_MAX) || undefined;
    if (!it || (it.like || undefined) === v) return;
    if (b === B.current() && B.item(it.id)) B.patch([it.id], { like: v }, 'what I like');
    else { it.like = v; B.save(b); B._.emit('items'); }
  }
  // A reference the background reader hasn't reached yet is measured now (a few at most, 30 s each); one that can't
  // be read keeps its reason (vibeError), one that runs out of time stays "still being measured" in the text.
  async function measureNow(b, list) {
    const todo = list.filter(Q.needsMeasuring).filter((it) => it.type === 'video' ? it.src : it.type === 'web' ? it.src : it.src || it.thumb).slice(0, 6);
    if (!todo.length) return 0;
    const busy = toast(`Measuring ${todo.length === 1 ? `"${String(todo[0].title || V.KIND_WORD[todo[0].type]).slice(0, 30)}"` : `${todo.length} references`} before sending…`, { timeout: 0 });
    let done = 0;
    try {
      for (const it of todo) {
        const job = it.type === 'video' ? V.video(B.fileUrl(it.src), { maxSamples: 60 }) : V.image(B.fileUrl(it.type === 'web' ? it.src : it.thumb || it.src));
        const late = new Promise((r) => setTimeout(() => r('late'), 30000));
        try {
          const v = await Promise.race([job, late]);
          if (v !== 'late' && Q.needsMeasuring(it)) { it.vibe = v; delete it.vibeError; done++; }
        } catch (err) { it.vibeError = err.message || 'unreadable'; }
      }
    } finally { busy?.remove?.(); }
    B.save(b); B._.emit('vibe');
    return done;
  }
  async function qualitiesText(b, itemIds = [], { blend = false, distance, rule = true, measure = true } = {}) {
    const list = listOf(b, itemIds);
    if (measure) await measureNow(b, list);
    const avoid = itemIds.length ? [] : list.filter((i) => isAvoid(b, i));
    return Q.block(list.filter((i) => !avoid.includes(i)), { distance: distance ?? distanceFor(b), blend, board: itemIds.length ? null : b.name, brief: itemIds.length ? '' : b.brief || '', avoid, rule });
  }
  // The chat on screen: a native agent, or the director docked in the visible tool, or Claude.
  function currentAgentId() {
    const id = H.activeId;
    if (H.agent(id)?.mode === 'native') return id;
    if (H.isTool?.(id)) { const d = Tools.dockedAgent(id.slice(5)); if (d) return d.id; }
    return H.claudeAgent()?.id || null;
  }
  const currentChatId = () => { const a = currentAgentId(); return a ? H.activeChat?.[a] || null : null; };
  // Attach a reference's (or the board's) qualities to a chat's next message (a small text attachment chip); send:
  // true sends it at once. (round 67) Qualities are the default; a focus that names one part ("Palette only",
  // "Motion only"…) still gives the old one-part vibe text. blend: mix the references into one look.
  const PARTIAL = (focus) => focus && !['full', 'lab', 'blend'].includes(focus);
  async function attach(agentId, { boardId, itemIds = [], focus, send = false, quiet = false, blend = false, distance } = {}) {
    agentId ||= currentAgentId();
    const agent = H.agent(agentId);
    if (!agent || agent.mode !== 'native') { toast('Pick a Claude or Astra chat', { type: 'error' }); return null; }
    // no board named: the chat's linked board first (as the drawer and /board-use do), else the current one
    const chatId = H.activeChat?.[agentId];
    const b = boardId ? await B.load(boardId).catch(() => null) : (chatId && await B.boardFor(chatId).catch(() => null)) || B.current();
    // a board that can't be read is said plainly: never an empty block
    if (!b) { toast('Couldn\'t read that board, so nothing was attached. Open it on the board once, then try again.', { type: 'error', timeout: 6000 }); return null; }
    const qual = !PARTIAL(focus);
    const text = qual ? await qualitiesText(b, itemIds, { blend: blend || focus === 'blend', distance }) : vibeText({ board: b, itemIds, focus });
    const label = itemIds.length === 1 ? B.item(itemIds[0], b)?.title || 'reference' : itemIds.length ? `${itemIds.length} references` : b.name;
    const fo = D.find(D.FOCUS, focus);
    const name = qual ? `${blend && itemIds.length > 1 ? 'mix' : 'qualities'} · ${String(label).replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 40)}.txt`
      : `vibe · ${String(label).replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 40)}${fo && fo.id !== 'full' ? ` (${fo.name.toLowerCase()})` : ''}.txt`;
    if (!Native.hasView(agentId)) { activate(agentId); await new Promise((r) => setTimeout(r, 80)); }
    if (send) { await Native.addFiles(agentId, [new File([text], name, { type: 'text/plain' })]); Native.sendText(agentId, itemIds.length ? 'Use the qualities of these references (not the pictures).' : `Use the qualities of my board "${b.name}".`); }
    else {
      await Native.addFiles(agentId, [new File([text], name, { type: 'text/plain' })]);
      if (H.activeId !== agentId && H.surfaceIdFor(H.activeId) !== H.surfaceIdFor(agentId)) activate(agentId); else Native.focus(agentId);
    }
    if (!quiet) {
      const waiting = qual && /still being measured/.test(text); const failed = qual && /couldn't be measured/.test(text);
      toast(`${qual ? `Qualities (${Q.band(distance ?? distanceFor(b)).name})` : 'Vibe'} attached to ${agent.name}'s message: ${label}${waiting ? ' · some still being measured (it says so)' : ''}${failed ? ' · one couldn\'t be measured (it says so)' : ''}`, { timeout: waiting || failed ? 6000 : 2600 });
    }
    return text;
  }

  // ---------- drag a reference into any chat ----------
  const viewUnder = (target) => H.agents().find((a) => a.mode === 'native' && Native.view(a.id)?.root?.contains(target)) || null;
  let hinted = null;
  addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes(REF_TYPE)) return;
    const a = viewUnder(e.target);
    const v = a && Native.view(a.id);
    if (hinted && hinted !== v?.form) { hinted.classList.remove('bdd-drop-hint'); hinted = null; }
    if (!v) return;
    e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy';
    if (hinted !== v.form) { hinted = v.form; hinted.classList.add('bdd-drop-hint'); }
  }, true);
  addEventListener('drop', (e) => {
    if (!e.dataTransfer?.types.includes(REF_TYPE)) return;
    hinted?.classList.remove('bdd-drop-hint'); hinted = null;
    const a = viewUnder(e.target);
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    let ref = {}; try { ref = JSON.parse(e.dataTransfer.getData(REF_TYPE)); } catch { /* bad payload */ }
    // (round 14) Alt held: the chat sees the picture itself (board-eyes-ui.js), not only the vibe
    if (e.altKey && typeof BoardEyesUI !== 'undefined') { BoardEyesUI.altDrop(a.id, ref); return; }
    // (round 67) its qualities by default; Shift (or a picture payload): the real picture / clip (round 65's drop)
    if ((e.shiftKey || ref.picture) && !ref.vibe && typeof BoardDrop !== 'undefined') { BoardDrop.attach(a.id, { boardId: ref.boardId, itemIds: ref.itemIds || [] }).catch((err) => toast(err.message, { type: 'error' })); return; }
    attach(a.id, { boardId: ref.boardId, itemIds: ref.itemIds || [], focus: ref.focus, blend: Boolean(ref.blend) });
  }, true);
  addEventListener('dragend', () => { hinted?.classList.remove('bdd-drop-hint'); hinted = null; }, true);
  function dragRef(e, board, itemIds, extra = {}) {
    // the board the drawer shows (it can be another than the current one: the chat's linked board, the picker)
    const b = typeof board === 'object' && board ? board : B.current();
    e.dataTransfer.setData(REF_TYPE, JSON.stringify({ boardId: b?.id, itemIds, ...extra }));
    // dropped in any other text field, it types the qualities (an unmeasured one says so: there's no time to measure)
    e.dataTransfer.setData('text/plain', b ? Q.block(listOf(b, itemIds), { distance: distanceFor(b), blend: Boolean(extra.blend), board: itemIds.length ? null : b.name }) : '');
    e.dataTransfer.effectAllowed = 'copy';
  }

  // ---------- the drawer ----------
  function build() {
    root = el('aside', { class: 'bdd', attrs: { 'aria-label': 'Board drawer' } });
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); toggle(false); } });
    document.body.append(root);
    B.onChange((what) => { if (open && ['items', 'vibe', 'open', 'boards', 'links'].includes(what)) renderSoon(); });
    addEventListener('hearth:view', () => { if (open) renderSoon(); });
  }
  const renderSoon = debounce(() => render(), 120);
  async function render() {
    if (!root) return;
    await B.ready();
    const chatId = currentChatId();
    const linked = chatId ? await B.boardFor(chatId) : null;
    const b = shownBoard ? await B.load(shownBoard) || B.current() : linked || B.current();
    const sel = el('select', { title: 'Board', on: { change: async () => { shownBoard = sel.value; render(); } } },
      B.boards().map((x) => el('option', { value: x.id, text: `${x.name} (${x.count || 0})`, selected: x.id === b.id })));
    const isLinked = Boolean(chatId && B.boards().find((x) => x.id === b.id)?.chats?.includes(chatId));
    const items = b.items.filter((i) => i.type !== 'frame' && i.type !== 'link' && !i.hidden);
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = words.length && Board._.haystack ? items.filter((i) => words.every((w) => Board._.haystack(i).includes(w))) : items;
    const s = V.summary(items);
    const agentName = H.agent(currentAgentId())?.name || 'the chat';
    const media = (ids) => (typeof BoardDrop !== 'undefined' ? BoardDrop.attach(null, { boardId: b.id, itemIds: ids }).catch((err) => toast(err.message, { type: 'error' })) : attach(null, { boardId: b.id, itemIds: ids }));
    const qual = (ids, opts = {}) => attach(null, { boardId: b.id, itemIds: ids, ...opts });
    const partMenu = (ids) => ({ label: 'Only one part (vibe text)', items: D.FOCUS.slice(1, 13).map((f) => ({ label: `${f.name} → ${agentName}`, action: () => attach(null, { boardId: b.id, itemIds: ids, focus: f.id }) })) });
    if (pickedBoard !== b.id) { picked.clear(); pickedBoard = b.id; }
    for (const id of [...picked]) if (!items.some((i) => i.id === id)) picked.delete(id);
    const vibe = el('div', { class: 'bdd-vibe', draggable: true, title: 'Drag into a chat: the board\'s qualities (palette, light, composition, motion…), not its pictures. Shift while dropping: the pictures and clips themselves. Click: choose',
      on: { dragstart: (e) => dragRef(e, b, []), click: (e) => showMenu(e.clientX, e.clientY, [
        { label: `Send the board's qualities → ${agentName}`, hint: Q.band(distanceFor(b)).name, action: () => qual([]) },
        { label: `Send the actual pictures & clips → ${agentName}`, hint: '10 at most', action: () => media([]) },
        partMenu([]),
      ]) } },
    el('div', { class: 'bd-pal' }, s.palette.map((c) => el('span', { style: { background: c.hex, '--s': String(c.share) } }))),
    el('div', { text: [s.light != null ? `${V.words.keyWord(s.light)}, ${V.words.contrastWord(s.contrast)} contrast` : null, s.sat != null ? V.words.satWord(s.sat) : null, s.motion != null ? `motion ${V.words.motionWord(s.motion)}` : null, s.moods.slice(0, 3).join(', ')].filter(Boolean).join(' · ') || 'Add pictures, clips or sites: Hearth reads their vibe.' }));
    // close to it ↔ only its spirit: per send, remembered per board
    const bandLabel = el('b', { class: 'bdd-band', text: Q.band(distanceFor(b)).name });
    const dist = el('div', { class: 'bdd-dist', title: 'How close the chat may stay to your references.\nClose to it: every measured number, matched strictly.\nOnly its spirit: mood words only, and the chat is told not to reproduce the subject, layout or recognisable elements.' },
      el('span', { text: 'Close to it' }),
      el('input', { type: 'range', min: '0', max: '100', step: '1', value: String(distanceFor(b)), attrs: { 'aria-label': 'Distance from the references: close to it … only its spirit' },
        on: { input: (e) => { bandLabel.textContent = Q.band(e.target.value).name; }, change: (e) => { bandLabel.textContent = Q.band(e.target.value).name; setDistance(b, e.target.value); renderMix(); } } }),
      el('span', { text: 'Only its spirit' }), bandLabel);
    // the mix card: 2–3 picked tiles, their blended qualities before sending
    const mix = el('div', { class: 'bdd-mix' });
    const renderMix = () => {
      const list = [...picked].map((id) => B.item(id, b)).filter(Boolean);
      mix.hidden = !list.length;
      if (!list.length) return mix.replaceChildren();
      const clear = el('button', { text: 'Clear', title: 'Unpick them all', on: { click: () => { picked.clear(); renderGrid(); renderMix(); } } });
      if (list.length === 1) return mix.replaceChildren(el('div', { class: 'bdd-mix-h', text: '1 picked: pick 1 or 2 more to mix them' }), el('div', { class: 'bdd-mix-row' }, el('span', { class: 'spacer' }), clear));
      if (list.length > 3) return mix.replaceChildren(el('div', { class: 'bdd-mix-h', text: `${list.length} picked: mix 2 or 3 at a time` }), el('div', { class: 'bdd-mix-row' }, el('span', { class: 'spacer' }), clear));
      const c = Q.card(list, distanceFor(b));
      return mix.replaceChildren(
        el('div', { class: 'bdd-mix-h', text: `Mix of ${list.length}`, draggable: true, title: 'Drag into a chat, or press Send', on: { dragstart: (e) => dragRef(e, b, list.map((i) => i.id), { blend: true }) } }),
        el('div', { class: 'bd-pal' }, c.palette.map((p) => el('span', { title: `${p.hex} ${Math.round(p.share * 100)}%`, style: { background: p.hex, '--s': String(p.share) } }))),
        el('div', { class: 'bdd-mix-w', text: c.words.join(' · ') || 'Not measured yet' }),
        c.moods.length ? el('div', { class: 'bdd-mix-w', text: `mood: ${c.moods.join(', ')}` }) : null,
        c.waiting || c.failed ? el('div', { class: 'bdd-mix-w warn', text: [c.waiting ? `${c.waiting} still being measured (Hearth measures it when you send)` : '', c.failed ? `${c.failed} couldn't be measured (left out, and the chat is told)` : ''].filter(Boolean).join(' · ') }) : null,
        el('div', { class: 'bdd-mix-row' },
          el('button', { class: 'primary', text: `Send the mix → ${agentName}`, title: `Their blended qualities (${c.band.name}), not the pictures`, on: { click: () => qual(list.map((i) => i.id), { blend: true }) } }),
          el('span', { class: 'spacer' }), clear));
    };
    const likeText = (it) => document.createTextNode(it.like ? `♥ ${it.like}` : '+ What I like about this…');
    const editLike = (it, line) => {
      const inp = el('input', { class: 'bdd-like-in', value: it.like || '', placeholder: 'What I like about this…', attrs: { maxlength: String(Q.LIKE_MAX) } });
      let done = false;
      const finish = (keep) => { if (done) return; done = true; if (keep) setLike(b, it, inp.value); line.replaceChildren(likeText(it)); line.classList.toggle('empty', !it.like); };
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
      inp.addEventListener('blur', () => finish(true));
      inp.addEventListener('click', (e) => e.stopPropagation());
      line.replaceChildren(inp); inp.focus();
    };
    const tile = (it) => {
      const img = it.tiny || it.thumb || it.poster || (it.type === 'web' || it.type === 'image' ? it.src : null);
      const real = typeof BoardDropCore !== 'undefined' && BoardDropCore.kindOf(it);
      const st = Q.status(it);
      const t = el('div', { class: `bdd-tile${picked.has(it.id) ? ' on' : ''}`, draggable: true, title: `${it.title || it.type}\nDrag into a chat: its qualities (palette, light, composition${it.type === 'video' ? ', motion, cuts' : ''}…), not the ${real === 'video' ? 'clip' : 'picture'}${real ? ' · Shift while dropping, or the Picture button: the picture itself' : ''} · click: pick it to mix · right-click: more`,
        on: { dragstart: (e) => dragRef(e, b, [it.id]), click: () => { if (picked.has(it.id)) picked.delete(it.id); else picked.add(it.id); t.classList.toggle('on', picked.has(it.id)); renderMix(); } } },
        img ? el('img', { src: B.fileUrl(img), alt: '', loading: 'lazy', draggable: false }) : null,
        it.type === 'swatch' || it.type === 'palette' ? el('div', { class: 'bdd-t', style: { background: it.type === 'swatch' ? it.color : `linear-gradient(90deg, ${(it.colors || []).join(', ')})` } }) : null,
        it.type === 'note' || it.type === 'text' ? el('div', { class: 'bdd-t', text: String(it.text || '').replace(/[*_#`>]+/g, ''), style: { background: it.type === 'note' ? (D.NOTE_STYLES.find((q) => q.id === it.style) || D.NOTE_STYLES[0]).bg : 'var(--surface)', color: it.type === 'note' ? (D.NOTE_STYLES.find((q) => q.id === it.style) || D.NOTE_STYLES[0]).fg : 'inherit' } }) : null,
        el('span', { class: 'bdd-k', text: `${it.stamp || V.KIND_WORD[it.type] || it.type}${st.state === 'measuring' ? ' · measuring…' : st.state === 'failed' ? ' ⚠' : ''}`, title: st.reason ? `Couldn't be measured: ${st.reason}` : '' }),
        el('div', { class: 'bdd-acts' },
          el('button', { class: 'bdd-send', text: 'Qualities →', title: `Attach its qualities (${Q.band(distanceFor(b)).name}) to ${agentName}'s message`, on: { click: (e) => { e.stopPropagation(); qual([it.id]); } } }),
          real ? el('button', { class: 'bdd-pic', text: 'Picture', title: `Send the actual ${real === 'video' ? 'clip (its key frames + the file)' : 'picture'} to ${agentName} instead`, on: { click: (e) => { e.stopPropagation(); media([it.id]); } } }) : null));
      t.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, [
        { label: `Send its qualities → ${agentName}`, hint: Q.band(distanceFor(b)).name, action: () => qual([it.id]) },
        ...(real ? [{ label: `Send the actual ${real === 'video' ? 'clip' : 'picture'} → ${agentName}`, hint: real === 'video' ? 'key frames + file' : 'the picture itself', action: () => media([it.id]) }] : []),
        { label: it.like ? 'Edit what I like about this…' : 'What I like about this…', action: async () => { const v = await Modal.prompt('What I like about this', { value: it.like || '' }); if (v != null) { setLike(b, it, v); renderGrid(); } } },
        { label: picked.has(it.id) ? 'Unpick (mix)' : 'Pick it to mix with others', action: () => { if (picked.has(it.id)) picked.delete(it.id); else picked.add(it.id); renderGrid(); renderMix(); } },
        partMenu([it.id]),
        { label: 'Show on the board', action: async () => { activate('tool:board'); await B.open(b.id); setTimeout(() => { B.select(it.id); B.zoomSel(); }, 120); } },
        ...(typeof BoardEyesUI !== 'undefined' ? ['-', ...BoardEyesUI.tileItems(b, it)] : []),
      ]); });
      if (it.type === 'note' || it.type === 'text') return el('div', { class: 'bdd-cell' }, t);
      const line = el('div', { class: `bdd-like${it.like ? '' : ' empty'}`, title: 'What I like about this: it goes first in what the chat gets, as the strongest signal. Click to write it.', attrs: { role: 'button', tabindex: '0' } }, likeText(it));
      line.addEventListener('click', (e) => { e.stopPropagation(); if (!line.querySelector('input')) editLike(it, line); });
      line.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !line.querySelector('input')) { e.preventDefault(); editLike(it, line); } });
      return el('div', { class: 'bdd-cell' }, t, line);
    };
    const search = el('input', { class: 'bdd-search', type: 'search', placeholder: 'Find: words, #tags, colors, moods…', value: query, on: { input: (e) => { query = e.target.value; renderGrid(); } } });
    const grid = el('div', { class: 'bdd-grid' });
    const renderGrid = () => { const w2 = query.toLowerCase().split(/\s+/).filter(Boolean); grid.replaceChildren(...(w2.length && Board._.haystack ? items.filter((i) => w2.every((w) => Board._.haystack(i).includes(w))) : items).slice(0, 300).map(tile)); };
    root.replaceChildren(
      el('div', { class: 'bdd-head' }, sel,
        el('button', { text: '↗', title: 'Open the board', on: { click: async () => { await B.open(b.id); activate('tool:board'); toggle(false); } } }),
        el('button', { text: '✕', title: 'Close (Esc / Ctrl+Shift+M)', on: { click: () => toggle(false) } })),
      search, vibe, dist, mix, grid,
      el('div', { class: 'bdd-foot' },
        chatId ? el('button', { text: isLinked ? '✓ Linked to this chat' : 'Link to this chat', title: 'A linked board opens here first, and this chat uses it when you say “use my board”', on: { click: () => { if (isLinked) B.unlinkChat(chatId); else B.linkChat(chatId, b.id); } } }) : null,
        el('span', { class: 'spacer' }), el('span', { text: `${items.length} ref${items.length === 1 ? '' : 's'}` }),
        el('button', { text: '+', title: 'Add pictures or clips to this board', on: { click: async () => { const paths = await window.hub.openDialog({ properties: ['openFile', 'multiSelections'], title: 'Add to the board' }); if (paths?.length) { await B.open(b.id); await B.addFiles(paths); } } } })));
    renderGrid(); renderMix();
    void shown;
  }
  function toggle(on = !open) {
    if (!root) build();
    open = on;
    root.classList.toggle('open', open);
    railBtn?.classList.toggle('on', open);
    if (open) { shownBoard = null; render(); setTimeout(() => root.querySelector('.bdd-search')?.focus(), 60); }
    return open;
  }

  // ---------- the board's own right-click (round 67): what I like about this, mix 2–3 ----------
  async function askLike(b, it) { const v = await Modal.prompt('What I like about this', { value: it.like || '' }); if (v != null) setLike(b, it, v); }
  const baseExtras = B._.itemExtras;
  B._.itemExtras = (list) => {
    const b = B.current(); const one = list.length === 1 ? list[0] : null;
    const chat = H.agent(currentAgentId())?.name || 'the chat';
    return [...(baseExtras?.(list) || []),
      ...(one && B._.isMedia(one) ? [{ label: one.like ? 'Edit what I like about this…' : 'What I like about this…', action: () => askLike(b, one) },
        { label: `Send its qualities → ${chat}`, hint: Q.band(distanceFor(b)).name, action: () => attach(null, { boardId: b.id, itemIds: [one.id] }) }] : []),
      ...(list.length >= 2 && list.length <= 3 ? [{ label: `Mix these ${list.length} → ${chat}`, hint: 'their blended qualities', action: () => attach(null, { boardId: b.id, itemIds: list.map((i) => i.id), blend: true }) }] : []),
    ];
  };
  B._.askLike = askLike;

  // ---------- reachable from anywhere ----------
  let railBtn = null;
  function addRailButton() {
    const rail = document.getElementById('rail'); const before = document.getElementById('palette-btn');
    if (!rail || !before || railBtn) return;
    railBtn = el('button', { class: 'tool-btn bd-rail-peek', id: 'board-drawer-btn', title: 'Board drawer (Ctrl+Shift+M): your references; drag one into a chat to attach its qualities (not the picture)', dataset: { feature: 'Board › Drawer' }, on: { click: () => toggle() } });
    railBtn.append(Icons.node?.('board') || document.createTextNode('▦'));
    railBtn.addEventListener('contextmenu', (e) => { e.preventDefault(); showMenu(e.clientX, e.clientY, [
      { label: 'Open the board', action: () => activate('tool:board') },
      { label: 'Send the board\'s qualities to this chat', action: () => attach(null, {}) },
      { label: 'Link the board to this chat', action: () => { const c = currentChatId(); if (c) { B.linkChat(c); toast('Linked'); } else toast('Open a chat first'); } },
      { label: 'New board…', action: async () => { const n = await Modal.prompt('New board', { value: 'New board' }); if (n) B.create(n); } },
    ]); });
    rail.insertBefore(railBtn, before);
  }
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyM') { e.preventDefault(); e.stopPropagation(); toggle(); }
  }, true);
  try {
    Keys.add({ area: 'Board', keys: 'Ctrl+Shift+M', what: 'board drawer over any chat or tool (also the ▦ in the rail)' });
    Keys.add({ area: 'Board', keys: 'Drag a reference into a chat', what: 'attach its qualities (palette, light, composition, motion…), not the picture' });
    Keys.add({ area: 'Board', keys: 'Shift+drag a reference into a chat', what: 'attach the picture or clip itself' });
    Keys.add({ area: 'Board', keys: 'Right-click a drawer tile', what: 'send its qualities, the actual picture, what I like about it, or only one part' });
  } catch { /* keys.js not loaded */ }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addRailButton); else addRailButton();
  addEventListener('load', addRailButton);

  return { toggle, attach, vibeText, qualitiesText, measureNow, setLike, setDistance, distanceFor, currentAgentId, currentChatId, isOpen: () => open, render, RULE, REF_TYPE };
})();
