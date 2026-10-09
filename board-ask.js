// Mood board, fifth layer: ask a chat about references (a drafted question + their vibe, nothing sent until you send),
// the explicit "use this clip itself" permission (the one time a chat may get the file), saved views, loop a shot /
// jump between cuts on a clip, note starters, untangle overlaps / gather the selection, and board styles that restyle
// every note, text and picture in one click.
(() => {
  const B = Board; const { S, D, V, LY } = B._;
  const sel = () => B.selected();
  const one = () => (sel().length === 1 ? sel()[0] : null);

  // ---------- ask a chat about the references (drafted, you send) ----------
  const ASKS = [
    ['common', 'What do they have in common?', 'What do these references have in common? Name the shared vibe in a few words, then the 3 strongest traits.'],
    ['brief', 'Write a creative brief', 'Write a short creative brief from these references: mood, palette, light, motion, type, and what to avoid.'],
    ['palette', 'Make a palette from them', 'Build a 5-color palette from these references, with a role for each color (background, main, accent…).'],
    ['scene', 'Suggest a Lab scene', 'Suggest a three.js scene for the Lab that borrows this vibe (forms, materials, light, motion), not the footage.'],
    ['shots', 'Make a shot list', 'Turn these references into a shot list for a short video: shot, framing, movement, duration.'],
    ['name', 'Name the mood', 'Give this mood 5 short names, and the one you would pick.'],
    ['missing', 'What is missing?', 'Looking at these references as a moodboard, what is missing or inconsistent?'],
    ['odd', 'Find the odd one out', 'Which of these references does not fit the others, and why?'],
    ['type', 'Suggest fonts', 'Suggest 3 font pairings (heading / body) that fit this vibe.'],
    ['music', 'What would it sound like?', 'Describe the music that fits this vibe: tempo, instruments, energy.'],
    ['edit', 'How should it be cut?', 'How should a video with this vibe be edited: pacing, transitions, rhythm?'],
    ['words', 'Words for a caption', 'Write 5 short captions that match this vibe.'],
  ];
  async function ask(askId, { agentId, itemIds = sel().map((i) => i.id) } = {}) {
    const a = ASKS.find(([id]) => id === askId) || ASKS[0];
    agentId ||= BoardDrawer.currentAgentId();
    await BoardDrawer.attach(agentId, { itemIds, quiet: true });
    Native.setDraft(agentId, a[2]);
    toast(`Question drafted for ${H.agent(agentId)?.name || 'the chat'} with the vibe attached: edit it and send`);
    return a[2];
  }

  // ---------- explicit footage permission ----------
  // Off by default: chats only ever get vibes. Switched on for an item, its vibe line carries the file path and says the
  // owner allows using the clip / picture itself.
  function allowFootage(list = sel(), on = !list.every((i) => i.footage)) {
    B.patch(list.map((i) => i.id), { footage: on || undefined }, on ? 'allow as footage' : 'vibe only');
    toast(on ? 'Chats may use these as footage (their file goes with the vibe)' : 'Vibe only again');
    return on;
  }
  const baseText = V.text;
  V.text = (it, keys) => { const t = baseText(it, keys); return it?.footage && it.src ? `${t} · FOOTAGE ALLOWED by the owner: ${it.src}` : t; };

  // ---------- saved views ----------
  function saveView(name) {
    const b = S.cur; b.views = [...(b.views || []).filter((v) => v.name !== name), { name: name || `View ${(b.views?.length || 0) + 1}`, view: { ...S.view } }].slice(-12);
    B.save(); toast(`View "${b.views.at(-1).name}" saved`);
    return b.views.at(-1);
  }
  function goView(name) { const v = (S.cur.views || []).find((x) => x.name === name) || (S.cur.views || [])[Number(name) - 1]; if (!v) return false; B._.animateTo(v.view, 'fly'); return true; }

  // ---------- clips: loop the shot, jump between cuts ----------
  function clipTime(it) { return B._.liveVideo(it.id)?.currentTime ?? it.lastT ?? 0; }
  function loopShot(it = sel().find((i) => i.type === 'video')) {
    if (!it?.vibe?.cuts) return toast('Select a clip whose cuts were read');
    const t = clipTime(it); const c = [0, ...it.vibe.cuts, it.duration || it.vibe.duration];
    let i = c.findIndex((x, k) => t >= x && t < c[k + 1]); if (i < 0) i = 0;
    B.patch([it.id], { vin: c[i], vout: c[i + 1], loop: undefined }, 'loop this shot');
    return [c[i], c[i + 1]];
  }
  function jumpCut(dir, it = sel().find((i) => i.type === 'video')) {
    if (!it?.vibe?.cuts) return null;
    B._.startPreview(it.id); const v = B._.liveVideo(it.id); if (!v) return null;
    const t = v.currentTime; const cuts = [0, ...it.vibe.cuts];
    const next = dir > 0 ? cuts.find((c) => c > t + 0.05) : [...cuts].reverse().find((c) => c < t - 0.3);
    if (next == null) return null;
    v.currentTime = next; it.lastT = next; return next;
  }
  B._.key('Shift+.  /  Shift+,', 'the selected clip jumps to the next / previous cut', (e) => e.shiftKey && !e.ctrlKey && (e.code === 'Period' || e.code === 'Comma'), (e) => jumpCut(e.code === 'Period' ? 1 : -1));

  // ---------- note starters ----------
  const NOTE_STARTERS = [
    ['todo', 'To try', '## To try\n- [ ] \n- [ ] \n- [ ] '], ['shots', 'Shot list', '## Shots\n1. \n2. \n3. '], ['brief', 'Brief', '## Brief\n**Mood:** \n**For:** \n**Avoid:** '],
    ['questions', 'Questions', '## Questions\n- \n- '], ['dodont', 'Do / don\'t', '**Do**\n- \n\n**Don\'t**\n- '], ['palette', 'Palette roles', '**Background** \n**Main** \n**Accent** \n**Text** '],
    ['timing', 'Timing', '## Timing\n0:00 \n0:05 \n0:10 '], ['refs', 'Why these refs', '**What I like:** \n**What to take:** \n**What to leave:** '],
  ];
  function starter(id, at) { const s = NOTE_STARTERS.find(([k]) => k === id) || NOTE_STARTERS[0]; return B.addNote(s[2], at, { style: 'paper', w: 300, h: 240 }); }

  // ---------- untangle / gather ----------
  // push overlapping items apart (a few relaxation passes), frames stay
  function untangle(list = sel().length > 1 ? sel() : B.items().filter((i) => !['frame', 'link'].includes(i.type))) {
    list = list.filter((i) => !i.locked && !['frame', 'link'].includes(i.type));
    let moved = 0;
    B.edit('untangle', () => {
      for (let pass = 0; pass < 40; pass++) {
        let any = false;
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const a = list[i]; const b = list[j]; const gap = 16;
          const ox = Math.min(a.x + a.w + gap, b.x + b.w + gap) - Math.max(a.x, b.x); const oy = Math.min(a.y + a.h + gap, b.y + b.h + gap) - Math.max(a.y, b.y);
          if (ox <= 0 || oy <= 0) continue;
          any = true; moved++;
          if (ox < oy) { const d = ox / 2 * (a.x < b.x ? -1 : 1); a.x += d; b.x -= d; } else { const d = oy / 2 * (a.y < b.y ? -1 : 1); a.y += d; b.y -= d; }
        }
        if (!any) break;
      }
    });
    return moved;
  }
  function gather(list = sel()) {
    if (!list.length) return 0;
    const c = B._.center(); const r = LY.arrange(list, 'collage', { x: c.x - 400, y: c.y - 300 });
    B.applyBoxes(r, 'gather'); return list.length;
  }

  // ---------- board styles: restyle everything at once ----------
  const STYLES = [
    ['editorial', 'Editorial', { note: 'paper', text: 'serif', border: 'thin', radius: 'square', shadow: '' }],
    ['neon', 'Neon night', { note: 'ink', text: 'neon', border: '', radius: 'soft', shadow: 'glow', bg: 'night' }],
    ['polaroid', 'Polaroid wall', { note: 'kraft', text: 'hand', border: 'polaroid', radius: 'square', shadow: 'soft', bg: 'cork' }],
    ['minimal', 'Minimal', { note: 'paper', text: 'thin', border: '', radius: '', shadow: '', bg: 'white' }],
    ['brutal', 'Brutalist', { note: 'slate', text: 'impact', border: 'thick', radius: 'square', shadow: 'hard', bg: 'studio-gray' }],
    ['forge', 'Forgeheart', { note: 'forge', text: 'oxanium', border: 'gold', radius: 'soft', shadow: 'glow', bg: 'forge' }],
    ['gallery', 'Gallery', { note: 'index', text: 'small-caps', border: '', radius: 'square', shadow: 'float', bg: 'blank-light' }],
    ['dream', 'Dreamy', { note: 'lilac', text: 'script', border: '', radius: 'round', shadow: 'soft', bg: 'lilac' }],
    ['blueprint', 'Blueprint', { note: 'blueprint', text: 'mono-caps', border: 'thin', radius: 'square', shadow: '', bg: 'blueprint' }],
    ['chrome', 'Chrome', { note: 'chrome', text: 'chrome', border: '', radius: 'soft', shadow: 'float', bg: 'charcoal' }],
    ['retro', 'Retro', { note: 'peach', text: 'retro', border: 'thick', radius: 'soft', shadow: 'hard', bg: 'sand' }],
    ['plain', 'Back to plain', { note: 'lemon', text: 'clean', border: '', radius: '', shadow: '', bg: 'theme' }],
  ];
  function styleBoard(id) {
    const st = STYLES.find(([k]) => k === id); if (!st) return false;
    const s = st[2];
    B.edit(`style: ${st[1]}`, (b) => {
      for (const it of b.items) {
        if (it.type === 'note') it.style = s.note;
        else if (it.type === 'text' && !it.arrangeLabel) it.textStyle = s.text;
        else if (['image', 'gif', 'video', 'web'].includes(it.type)) { it.border = s.border || undefined; it.radius = s.radius || undefined; it.shadow = s.shadow || undefined; }
      }
      if (s.bg) b.bg = s.bg;
    });
    B.applyBg();
    toast(`Board style: ${st[1]} (Ctrl+Z undoes)`);
    return true;
  }

  // ---------- tooltips carry the mood ----------
  B.onChange((w) => {
    if (w !== 'vibe' && w !== 'render') return;
    for (const it of B.items()) { const n = S.nodes.get(it.id); if (n && it.vibe?.moods?.length && it.title) { const t = `${it.title}${it.note ? ` · ${it.note}` : ''} · ${it.vibe.moods.slice(0, 3).join(', ')}`; if (n.title !== t) n.title = t; } }
  });
  // usage tracking names for the few visible controls (usage.js reads data-feature)
  B.onChange((w) => { if (w === 'mount') { S.ui.boardBtn.dataset.feature = 'Board › Boards'; S.ui.addBtn.dataset.feature = 'Board › Add'; S.ui.zoomBtn.dataset.feature = 'Board › Zoom'; } });

  // ---------- menus ----------
  B._.itemExtras = (list) => [
    { label: 'Ask a chat about it', items: () => ASKS.map(([id, label]) => ({ label, action: () => ask(id, { itemIds: list.map((i) => i.id) }) })) },
    ...(list.some((i) => ['video', 'image', 'gif'].includes(i.type)) ? [{ label: list.every((i) => i.footage) ? '✓ Chats may use it as footage' : 'Allow chats to use it as footage', action: () => allowFootage(list), more: true }] : []),
    ...(list.length === 1 && list[0].type === 'video' && list[0].vibe?.cuts ? [{ label: 'Loop this shot', action: () => loopShot(list[0]), more: true }] : []),
  ];
  const baseBoard = B._.boardItems;
  B._.boardItems = () => [...baseBoard(),
    { label: 'Style everything', items: () => STYLES.map(([id, n]) => ({ label: n, action: () => styleBoard(id) })) },
    { label: 'Views', items: () => [{ label: 'Save this view…', action: async () => { const n = await Modal.prompt('Name this view', { value: `View ${(S.cur.views?.length || 0) + 1}` }); if (n) saveView(n); } }, ...(S.cur.views || []).map((v) => ({ label: `Go to ${v.name}`, action: () => goView(v.name) }))], more: true },
    { label: 'Untangle overlaps', action: () => untangle(), more: true },
    { label: 'Ask a chat about the board', more: true, items: () => ASKS.map(([id, label]) => ({ label, action: () => ask(id, { itemIds: [] }) })) }];
  const baseAdd = B._.addItems;
  B._.addItems = (p) => [...baseAdd(p), { label: 'Note starter', more: true, items: () => NOTE_STARTERS.map(([id, n]) => ({ label: n, action: () => starter(id, p) })) }];

  // ---------- commands ----------
  const defs = [
    { name: 'board-ask', desc: 'Draft a question about the selected references (or the board) with their vibe attached: common, brief, palette, scene, shots, name, missing, odd, type, music, edit, words', args: '<question>', complete: () => ASKS.map(([id, n]) => ({ value: id, hint: n })),
      run: async (args, ctx) => { await B.ready(); const q = await ask(args.trim() || 'common', { agentId: ctx?.agentId, itemIds: sel().map((i) => i.id) }); return q ? null : 'Unknown question.'; } },
    { name: 'board-footage', desc: 'Allow (or stop) chats using the selected clip / picture itself as footage — off by default, chats get vibes', args: '[on|off]', complete: () => [{ value: 'on' }, { value: 'off' }],
      run: async (args) => { await B.ready(); if (!sel().length) return 'Select it on the board first.'; const on = allowFootage(sel(), args.trim() ? args.trim() !== 'off' : undefined); return on ? 'Footage allowed for the selection.' : 'Vibe only.'; } },
    { name: 'board-view', desc: 'Save the current view under a name, or fly to a saved one', args: '<save name | name | number>', complete: () => (S.cur?.views || []).map((v) => ({ value: v.name })),
      run: async (args) => { activate('tool:board'); await B.ready(); const a = args.trim(); if (a.startsWith('save')) { const v = saveView(a.replace(/^save\s*/, '') || undefined); return `Saved "${v.name}".`; } return goView(a) ? null : 'No such view (/board-view save <name>).'; } },
    { name: 'board-loop-shot', desc: 'The selected clip loops the shot it is on (in / out at its cuts)', run: async () => { await B.ready(); const r = loopShot(); return Array.isArray(r) ? `Looping ${B._.fmtTime(r[0])}–${B._.fmtTime(r[1])}.` : null; } },
    { name: 'board-starter', desc: 'A note starter: todo, shots, brief, questions, dodont, palette, timing, refs', args: '<starter>', complete: () => NOTE_STARTERS.map(([id, n]) => ({ value: id, hint: n })), run: async (args) => { await B.ready(); starter(args.trim()); return 'Note added.'; } },
    { name: 'board-untangle', desc: 'Push overlapping items apart (the selection, or everything)', run: async () => { activate('tool:board'); await B.ready(); return `${untangle() ? 'Untangled' : 'Nothing overlapped'}.`; } },
    { name: 'board-gather', desc: 'Bring the selection together in the middle of the view', run: async () => { await B.ready(); return `Gathered ${gather()}.`; } },
    { name: 'board-style', desc: 'Restyle every note, text and picture at once: editorial, neon, polaroid, minimal, brutal, forge, gallery, dream, blueprint, chrome, retro, plain', args: '<style>', complete: () => STYLES.map(([id, n]) => ({ value: id, hint: n })),
      run: async (args) => { activate('tool:board'); await B.ready(); return styleBoard(args.trim()) ? null : 'Unknown style.'; } },
  ];
  function registerAll() { for (const d of defs) if (!Commands.get(d.name)) Commands.register({ area: 'Board', ...d }); }
  if (document.readyState === 'loading' || document.currentScript?.defer) addEventListener('DOMContentLoaded', registerAll, { once: true }); else registerAll();

  Object.assign(B._, { ASKS, ask, allowFootage, saveView, goView, loopShot, jumpCut, NOTE_STARTERS, starter, untangle, gather, STYLES, styleBoard, askDefs: defs });
})();
