// The video project's card in the chat (intro.js): one live card per project, drawn for a { role: 'intro', pid }
// message (one line in native.js messageEl). Progressive: a head with the name and the state, the seven steps as
// pills (✓ / n of m / ⚠, ↺ on hover), the beats as a filmstrip (width = length; hover previews, click picks one,
// right-click opens its menu), one primary action at a time; everything else behind ⋯, right-click and keys.
// Also here: every menu of a project (the entry "Make a video…", the card's, a step's, a beat's) and its keys.
const IntroCard = (() => {
  const D = IntroData;
  const cap = (t, n) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const IS_MAC = /Mac/.test(navigator.platform);
  const M = IS_MAC ? '⌘' : 'Ctrl';
  const err = (e) => toast(e.message || String(e), { type: 'error' });
  const done = (r) => { if (typeof r === 'string' && r) toast(r, { timeout: 3000 }); };
  const go = (fn) => () => Promise.resolve().then(fn).then(done, err);
  const selected = new Map(); // pid -> the beat number picked in the card

  // ---------- painting (debounced; every card of a project) ----------
  const timers = new Map();
  function paint(p, now = false) {
    if (!p) { for (const n of document.querySelectorAll('.intro-card')) if (!Intro.get(n.dataset.pid)) n.replaceWith(goneEl(n.dataset.pid)); return; }
    if (!now) { if (timers.has(p.id)) return; timers.set(p.id, setTimeout(() => { timers.delete(p.id); paint(p, true); }, 90)); return; }
    for (const node of document.querySelectorAll(`.intro-card[data-pid="${p.id}"]`)) {
      const fresh = cardEl(node._msg || { pid: p.id }, H.agent(node.dataset.host), Number(node.dataset.index));
      // the filmstrip keeps the beat under the pointer previewed through a redraw
      node.replaceWith(fresh);
    }
  }
  Intro.onChange((p) => paint(p));
  const goneEl = (pid) => el('div', { class: 'intro-card gone', dataset: { pid } }, el('span', { class: 'hint', text: '🎬 A video project that was removed from the list (its files and sequence stay).' }));

  // ---------- the card ----------
  const STATUS_ICON = { done: '✓', running: '…', error: '⚠', stale: '↻', stopped: '■', proposed: '·' };
  function cardEl(m, agent, index) {
    const p = Intro.get(m.pid);
    if (!p) { const g = goneEl(m.pid); g.dataset.host = agent?.id || ''; return g; }
    m.text = Intro.textOf(p); // the chat's context reads the latest state
    const live = Intro.current() === p;
    const t = Intro.totals(p);
    const accepted = p.steps.plan?.status === 'done';
    const card = el('div', { class: `intro-card ${p.status}${live ? ' live' : ''}`, dataset: { pid: p.id, host: agent?.id || '', index: String(index ?? '') } });
    card._msg = m;
    card.style.setProperty('--intro-accent', p.plan.style.accent || '#ffd75e');
    // head: name · template · length · formats · state · tokens · ■ / ⋯
    const state = live ? stateLine(p) : p.status === 'done' ? `rendered · ${p.outputs.length} format${p.outputs.length === 1 ? '' : 's'}` : p.status === 'error' ? `⚠ ${cap(p.error, 60)}` : p.status === 'stopped' ? 'stopped' : accepted ? 'ready to go on' : 'proposed';
    const head = el('div', { class: 'intro-head' },
      el('span', { class: 'intro-title', text: `🎬 ${p.name}`, title: 'Right-click: everything about this video project' }),
      el('span', { class: 'intro-sub', text: `${p.plan.templateName} · ${D.total(p.plan)} s`, title: D.planText(p.plan) }),
      el('span', { class: 'intro-fmts' }, ...p.plan.formats.map((f, i) => el('span', { class: `intro-fmt${i ? '' : ' main'}`, text: f, title: `${D.FORMAT[f]?.label} · ${D.FORMAT[f]?.where}${i ? '' : ' (the main format: filmed and edited in it)'}` }))),
      el('span', { class: 'spacer' }),
      el('span', { class: `intro-state${live ? ' live' : ''}`, text: state }),
      el('span', { class: 'intro-tok', text: `C ${Intro.fmt(t.claude)} · A ${Intro.fmt(t.astra)}`, title: `Tokens so far: Claude ${t.claude.toLocaleString()} · Astra ${t.astra.toLocaleString()} (jams, decisions, the review, the director pass)` }),
      live ? btn('■', 'Stop (Esc)', () => Intro.stop(), 'intro-stop') : btn('⋯', 'Everything about this project (or right-click the card)', (e) => showMenu(e.clientX, e.clientY, projectItems(p)), 'intro-more'));
    card.append(head);
    card.append(stepsEl(p, live));
    card.append(filmEl(p, live));
    const sel = selected.get(p.id);
    const b = sel != null ? p.plan.beats.find((x) => x.n === sel) : null;
    if (b) card.append(beatEl(p, b, live));
    if (!accepted && !live) card.append(proposalEl(p));
    if (p.outputs.length || p.cuts.length || p.coverThumb) card.append(outputsEl(p));
    const notes = [...(p.notes || []).slice(-2), p.director ? `✂ ${Intro.NAME[p.director.by]}'s pass: ${p.director.line}` : '', reviewLine(p)].filter(Boolean);
    for (const n of notes) card.append(el('div', { class: 'intro-note hint', text: n }));
    const foot = footEl(p, live, accepted);
    if (foot) card.append(foot);
    card.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.intro-beat-frame, .intro-step, .intro-out')) return; // their own menus
      e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, projectItems(p));
    });
    return card;
  }
  const btn = (label, title, fn, cls = '') => el('button', { type: 'button', class: `msg-act ${cls}`, text: label, title, on: { click: (e) => { e.stopPropagation(); Promise.resolve(fn(e)).then(done, err); } } });
  function stateLine(p) {
    const s = Intro.runningStep();
    const step = s && D.STEP[s.step];
    const x = s && p.steps[s.step];
    return step ? `${step.icon} ${step.name}${x?.total ? ` ${x.done}/${x.total}` : ''}${s.beat ? ` · beat ${s.beat}` : ''}${x?.sub ? ` · ${cap(x.sub, 40)}` : ''}` : 'starting…';
  }
  function reviewLine(p) {
    const r = p.review;
    if (!r) return '';
    const bits = [`⌕ ${r.exact}/${r.of} beats frame-exact`];
    if (r.black?.length) bits.push(`black frames in beat ${r.black.join(', ')}`);
    if (r.safe?.length) bits.push(`${r.safe.length} title${r.safe.length > 1 ? 's' : ''} outside the safe zone`);
    if (r.notes?.length) bits.push(`${Intro.NAME[r.by] || 'Astra'}: ${r.notes.map((x) => `${x.t.toFixed(1)}s ${cap(x.note, 50)}`).join(' · ')}`);
    return bits.join(' · ');
  }

  // the seven steps as pills
  function stepsEl(p, live) {
    const row = el('div', { class: 'intro-steps', attrs: { role: 'list' } });
    for (const s of D.STEPS) {
      const x = p.steps[s.id] || {};
      const st = x.status || 'todo';
      const pill = el('button', { type: 'button', class: `intro-step ${st}`, dataset: { step: s.id }, title: `${s.name}: ${s.what}\n${st}${x.sub ? ` · ${x.sub}` : ''}${x.error ? `\n⚠ ${x.error}` : ''}${x.by ? `\nby ${Intro.NAME[x.by] || x.by}` : ''}\nClick: run from here · Alt+click: only this step · right-click: more` },
        el('span', { class: 'intro-step-ico', text: s.icon }), el('span', { class: 'intro-step-name', text: s.name }),
        el('span', { class: 'intro-step-st', text: x.total && st === 'running' ? `${x.done}/${x.total}` : STATUS_ICON[st] || '' }));
      if (st === 'running' && x.total) pill.style.setProperty('--p', String(x.done / x.total));
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        if (live) { toast('It\'s running: ■ stops it (Esc)', { timeout: 1800 }); return; }
        if (s.id === 'plan') { showMenu(e.clientX, e.clientY, planItems(p)); return; }
        Intro.run(p, e.altKey ? { only: s.id } : { from: s.id }).catch(err);
      });
      pill.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, stepItems(p, s.id)); });
      row.append(pill);
    }
    return row;
  }

  // the beats as a filmstrip (width = length)
  function filmEl(p, live) {
    const total = D.total(p.plan) || 1;
    const strip = el('div', { class: 'intro-film', attrs: { tabindex: '0', role: 'listbox', 'aria-label': 'Beats' }, title: 'The beats: click one for its details · right-click: redo, words, length, kind… · ← / → move between them' });
    const peek = el('div', { class: 'intro-peek' });
    const running = Intro.runningStep();
    for (const b of p.plan.beats) {
      const k = D.KINDS[b.kind];
      const f = el('button', { type: 'button', class: `intro-beat-frame k-${b.kind}${b.error ? ' broken' : ''}${b.clip || b.shot ? ' has' : ''}${selected.get(p.id) === b.n ? ' on' : ''}${live && running?.beat === b.n ? ' live' : ''}`, dataset: { n: String(b.n) }, attrs: { tabindex: '-1' } },
        b.thumb ? el('img', { src: b.thumb, alt: '', attrs: { draggable: 'false' } }) : el('span', { class: 'intro-beat-ico', text: k.icon }),
        el('span', { class: 'intro-beat-n', text: String(b.n) }));
      f.style.flexGrow = String(Math.max(0.4, b.secs));
      f.style.flexBasis = `${Math.max(2, (b.secs / total) * 100)}%`;
      f.addEventListener('pointerenter', () => { peek.textContent = beatLine(b); peek.classList.add('on'); });
      f.addEventListener('pointerleave', () => peek.classList.remove('on'));
      f.addEventListener('click', (e) => { e.stopPropagation(); if (e.shiftKey) { gotoBeat(p, b).catch(err); return; } selected.set(p.id, selected.get(p.id) === b.n ? null : b.n); Intro.changed(p); });
      f.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, beatItems(p, b)); });
      strip.append(f);
    }
    strip.addEventListener('keydown', (e) => {
      const cur = selected.get(p.id) || 0;
      const n = p.plan.beats.length;
      const b = p.plan.beats.find((x) => x.n === cur);
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); selected.set(p.id, Math.max(1, Math.min(n, (cur || (e.key === 'ArrowLeft' ? n + 1 : 0)) + (e.key === 'ArrowRight' ? 1 : -1)))); Intro.changed(p); requestAnimationFrame(() => document.querySelector(`.intro-card[data-pid="${p.id}"] .intro-film`)?.focus()); }
      else if (b && e.key === 'Enter') { e.preventDefault(); gotoBeat(p, b).catch(err); }
      else if (b && (e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); Intro.redoBeat(p, b.n).then(done, err); }
      else if (b && (e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); const r = e.target.getBoundingClientRect(); showMenu(r.left, r.bottom, wordItems(p, b)); }
      else if (b && (e.key === '+' || e.key === '=' || e.key === '-')) { e.preventDefault(); setSecs(p, b, b.secs + (e.key === '-' ? -0.5 : 0.5)); }
      else if (e.key === 'Escape' && cur) { e.stopPropagation(); selected.delete(p.id); Intro.changed(p); }
    });
    return el('div', { class: 'intro-film-wrap' }, strip, peek);
  }
  const beatLine = (b) => `${b.n} · ${D.KINDS[b.kind].icon} ${D.KINDS[b.kind].label} · ${b.secs} s${b.area && (b.kind === 'tour' || b.kind === 'shot') ? ` · ${D.recipeFor(b.area).name}` : ''}${b.words ? ` · “${cap(b.words, 50)}”` : ''}${b.jam?.best ? ` · jam round ${b.jam.best} kept` : ''}${b.review ? (b.review.exact ? ' · frame-exact ✓' : ' · frames off ⚠') : ''}${b.error ? ` · ⚠ ${cap(b.error, 60)}` : ''}`;
  // the picked beat: one line, its main moves
  function beatEl(p, b, live) {
    return el('div', { class: 'intro-beat' },
      el('span', { class: 'intro-beat-line', text: beatLine(b) }),
      el('span', { class: 'spacer' }),
      live ? null : btn('↻ Redo', 'Redo this beat: its scene and its capture, then the edit (R)', () => Intro.redoBeat(p, b.n)),
      b.words != null ? btn('✎', 'Its words: suggestions from the app, or your own (W)', (e) => showMenu(e.clientX, e.clientY, wordItems(p, b))) : null,
      btn('⋯', 'Everything about this beat (or right-click it)', (e) => showMenu(e.clientX, e.clientY, beatItems(p, b))));
  }
  function proposalEl(p) {
    const n = p.plan.beats.length;
    const kinds = Object.entries(p.plan.beats.reduce((a, b) => ({ ...a, [b.kind]: (a[b.kind] || 0) + 1 }), {})).map(([k, c]) => `${c} ${D.KINDS[k].label.toLowerCase()}`).join(' · ');
    const T = D.TEMPLATE[p.plan.template];
    return el('div', { class: 'intro-proposal' },
      el('div', { class: 'intro-prop-line', text: `Proposed: ${n} beats (${kinds}) · ${D.total(p.plan)} s · ${p.plan.formats.join(' · ')} · ${D.TITLE_LOOKS.find((x) => x.id === p.plan.style.titles)?.name || p.plan.style.titles} titles, ${D.TRANSITION_SETS.find((x) => x.id === p.plan.style.trans)?.name.split(':')[0] || p.plan.style.trans} cuts` }),
      T?.hint ? el('div', { class: 'intro-prop-hint hint', text: T.hint }) : null,
      el('div', { class: 'intro-prop-vibe hint', text: p.vibe?.board ? `Vibe from “${p.vibe.board.name}”: ${cap(p.vibe.line, 110)}` : 'No board linked: Hearth\'s own colors (link one: ⋯ › Vibe › Board).' }));
  }
  function outputsEl(p) {
    const row = el('div', { class: 'intro-outs' });
    if (p.coverThumb) row.append(el('img', { class: 'intro-cover', src: p.coverThumb, alt: 'cover', title: `The cover (${D.COVER_MODES.find((x) => x.id === p.cover?.mode)?.name || 'best frame'}) · right-click the card › Output › Cover` }));
    for (const o of p.outputs) row.append(outEl(p, o, `${o.fmt}${o.dur ? ` · ${o.dur} s` : ''}`));
    for (const c of p.cuts) for (const o of c.outputs) row.append(outEl(p, o, `${c.secs} s · ${o.fmt}`));
    return row;
  }
  function outEl(p, o, label) {
    const b = el('button', { type: 'button', class: 'intro-out', text: `▶ ${label}`, title: `${base(o.path)}${o.w ? ` · ${o.w}×${o.h}` : ''}\nClick: play · drag: into a chat or another app · right-click: more`, attrs: { draggable: 'true' } });
    b.addEventListener('click', (e) => { e.stopPropagation(); Intro.openOutput(o.path).catch(err); });
    b.addEventListener('dragstart', (e) => { e.preventDefault(); window.hub.capture?.startDrag?.(o.path); });
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, [
      { label: '▶ Play it', action: () => Intro.openOutput(o.path).catch(err) },
      { label: 'Open in Video Review', action: async () => { activate('tool:ae'); await Review.ensureMounted(); await Review.open(o.path); } },
      { label: IS_MAC ? 'Show in Finder' : 'Show in the folder', action: () => window.hub.fs.reveal(o.path) },
      { label: 'Copy the path', action: () => { navigator.clipboard.writeText(o.path); toast('Path copied', { timeout: 1200 }); } },
      { label: 'Attach to this chat', action: () => { const a = H.agent(H.activeId); if (a?.mode === 'native') Native.attachPaths(a.id, [o.path]); else toast('Open a chat first', { type: 'error' }); } },
      { label: 'Read its frames (contact sheet)', action: () => Commands.tryRun(`/frames ${o.path} sheet`, H.claudeAgent()?.id).catch(err) },
    ]); });
    return b;
  }
  function footEl(p, live, accepted) {
    const foot = el('div', { class: 'intro-foot' });
    if (live) { foot.append(el('span', { class: 'hint', text: 'Esc or ■ stops it · each step is an undo point' })); return foot; }
    const next = D.STEPS.find((s) => s.id !== 'plan' && p.steps[s.id]?.status !== 'done');
    if (!accepted) {
      foot.append(btn('✦ Astra decides', 'Astra picks the template, the hook, the end words, the titles and the cuts (one small question)', () => Intro.decide(p).then((r) => r.text)),
        el('span', { class: 'spacer' }),
        btn('▶ Make it', 'Accept the plan and make the whole video: vibe → scenes → captures → edit → review → render', () => { Intro.run(p).catch(err); return null; }, 'primary-act'));
    } else if (next) {
      const st = p.steps[next.id]?.status;
      foot.append(el('span', { class: 'hint', text: st === 'error' ? `⚠ ${next.name} failed` : st === 'stale' ? `${next.name} needs updating` : `Next: ${next.name}` }), el('span', { class: 'spacer' }),
        btn(`▶ ${st === 'error' ? 'Retry' : 'Go on'} from ${next.name}`, `Run from ${next.name} to the end`, () => { Intro.run(p, { from: next.id }).catch(err); return null; }, 'primary-act'));
    } else {
      foot.append(btn('✂ Open the edit', 'The sequence in the video editor, frame by frame', () => Intro.openTheEdit(p).then(() => null)),
        btn('⤴ Post text', 'The words to paste under the video (Instagram; right-click the card › Output › Post text for others)', () => { navigator.clipboard.writeText(Intro.postText(p)); return 'Post text copied'; }),
        el('span', { class: 'spacer' }),
        btn(p.cuts.length ? '✂ Cuts again' : '✂ 15 s + 6 s', 'Make the 15 s and the 6 s cut from the same captures (nothing is filmed again)', () => Intro.makeCuts(p, [15, 6]).then((m) => `${m.length} cut-downs made`), 'primary-act'));
    }
    return foot;
  }
  async function gotoBeat(p, b) {
    await Intro.openTheEdit(p);
    await VideoCut.goto((b.at ?? 0) + Math.min(0.5, b.secs / 3));
    return null;
  }
  function setSecs(p, b, v) {
    const x = Math.max(0.6, Math.min(30, Math.round(v * 10) / 10));
    b.secs = x; p.plan.secs = D.total(p.plan);
    Intro.stale(p, ['lab', 'tour'].includes(b.kind) && x > (b.clip?.dur || 0) - 0.3 ? 'captures' : 'edit');
    Intro.changed(p);
  }

  // ---------- menus ----------
  const checked = (on) => (on ? { checked: true } : {});
  function planItems(p) {
    const ch = (o) => go(() => { Intro.replan(p, o); if (o.titles || o.trans || o.grade) p.styleLocked = true; Intro.changed(p); return null; });
    return [
      { label: '✦ Astra decides the details', hint: 'one small question', action: go(() => Intro.decide(p).then((r) => r.text)) },
      { label: 'Template', hint: p.plan.templateName, items: () => D.TEMPLATES.map((t) => ({ label: t.name, hint: `${t.secs} s · ${t.beats.length} beats`, ...checked(t.id === p.plan.template), action: ch({ template: t.id }) })) },
      { label: 'Length', hint: `${D.total(p.plan)} s`, items: () => [6, 8, 10, 15, 20, 25, 30, 45, 60].map((s) => ({ label: `${s} s`, ...checked(Math.abs(D.total(p.plan) - s) < 0.05), action: go(() => { p.plan = D.retime(p.plan, s); if (p.musicFit) return Intro.fitMusic(p).then(() => { Intro.stale(p, 'edit'); return null; }); Intro.stale(p, 'captures'); Intro.changed(p); return null; }) })) },
      { label: 'Formats', hint: p.plan.formats.join(' '), items: () => [...D.FORMATS.map((f) => ({ label: `${f.id} ${f.label}`, hint: f.where, ...checked(p.plan.formats.includes(f.id)), action: go(() => { const has = p.plan.formats.includes(f.id); if (has && p.plan.formats.length === 1) return 'Keep one format at least.'; p.plan.formats = has ? p.plan.formats.filter((x) => x !== f.id) : [...p.plan.formats, f.id]; Intro.stale(p, p.plan.formats[0] !== f.id ? 'render' : 'captures'); Intro.changed(p); return null; }) })),
        { label: 'Main format (filmed in it)', items: () => p.plan.formats.map((f) => ({ label: f, ...checked(f === p.plan.formats[0]), action: go(() => { p.plan.formats = [f, ...p.plan.formats.filter((x) => x !== f)]; Intro.stale(p, 'captures'); Intro.changed(p); return null; }) })) }] },
      { label: 'Titles', hint: p.plan.style.titles, items: () => D.TITLE_LOOKS.map((t) => ({ label: t.name, ...checked(t.id === p.plan.style.titles), action: ch({ titles: t.id }) })) },
      { label: 'Cuts', hint: p.plan.style.trans, items: () => D.TRANSITION_SETS.map((t) => ({ label: t.name, ...checked(t.id === p.plan.style.trans), action: ch({ trans: t.id }) })) },
      { label: 'Grade', hint: p.plan.style.grade, items: () => D.GRADES.map((g) => ({ label: g, ...checked(g === p.plan.style.grade), action: ch({ grade: g }) })) },
      { label: 'Words', items: () => [
        { label: '✦ Astra rewrites every line', action: go(() => Intro.rewriteWords(p)) },
        { label: 'Hook', hint: cap(p.plan.vars?.hook, 30), items: () => D.HOOKS.map((h) => D.fill(h, { name: p.plan.name })).map((h) => ({ label: h, action: go(() => { p.plan.vars.hook = h; const b0 = p.plan.beats[0]; if (b0?.kind === 'title') b0.words = h; Intro.stale(p, 'edit'); Intro.changed(p); return null; }) })) },
        { label: 'Tagline', hint: cap(p.plan.vars?.tagline, 30), items: () => D.TAGLINES.map((h) => ({ label: h, action: go(() => { p.plan.vars.tagline = h; for (const b of p.plan.beats) if (b.kind === 'end' && b.sub) b.sub = h; Intro.stale(p, 'edit'); Intro.changed(p); return null; }) })) },
        { label: 'Call to action', hint: cap(p.plan.vars?.cta, 30), items: () => D.CTAS.map((h) => ({ label: h, action: go(() => { p.plan.vars.cta = h; Intro.changed(p); return null; }) })) },
        { label: 'Name on screen…', hint: p.plan.name, action: go(async () => { const v = await Modal.prompt('The name on screen', { value: p.plan.name }); if (!v) return null; for (const b of p.plan.beats) { if (b.words === p.plan.name) b.words = v; if (b.sub === p.plan.name) b.sub = v; } p.plan.name = v; Intro.stale(p, 'edit'); Intro.changed(p); return null; }) },
      ] },
      { label: 'The plan as text', action: go(() => { navigator.clipboard.writeText(D.planText(p.plan)); return 'Plan copied'; }) },
    ];
  }
  function vibeItems(p) {
    const boards = typeof Board !== 'undefined' ? Board.boards() : [];
    return [
      { label: 'Board', hint: p.vibe?.board?.name || 'none', items: () => [
        ...boards.map((b) => ({ label: b.name, ...checked(p.boardId === b.id || (p.boardId === undefined && p.vibe?.board?.id === b.id)), action: go(async () => { p.boardId = b.id; p.vibe = await Intro.readVibe(p); Intro.stale(p, 'vibe'); Intro.changed(p); return `Vibe from “${b.name}”`; }) })),
        { label: 'No board (Hearth\'s own colors)', ...checked(p.boardId === null), action: go(async () => { p.boardId = null; p.vibe = await Intro.readVibe(p); Intro.stale(p, 'vibe'); Intro.changed(p); return null; }) },
        { label: 'Open the board', action: () => activate('tool:board') }] },
      { label: 'Music', hint: p.music?.name || 'none', items: () => [
        { label: 'Pick a song…', action: go(async () => { const f = await window.hub.openDialog({ properties: ['openFile'], filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac', 'mp4', 'mov'] }] }); const path = Array.isArray(f) ? f[0] : f; return path ? Intro.setMusic(p, path) : null; }) },
        { label: 'The Lab\'s song', action: go(() => Intro.setMusic(p, 'lab')) },
        { label: 'No music', ...checked(!p.music), action: go(() => Intro.setMusic(p, null)) },
        { label: 'Cuts on the music', hint: D.CUT_MODE[p.cutMode]?.name, items: () => D.CUT_MODES.map((c) => ({ label: c.name, ...checked(c.id === p.cutMode), action: go(async () => { p.cutMode = c.id; if (p.music) { p.music.analysis ||= null; await Intro.fitMusic(p); Intro.stale(p, 'edit'); } Intro.changed(p); return null; }) })) }] },
      { label: 'The vibe as text', disabled: !p.vibe, action: go(() => { navigator.clipboard.writeText(p.vibe.line); return 'Vibe copied'; }) },
    ];
  }
  function runItems(p) {
    const live = Intro.current() === p;
    return [
      live ? { label: '■ Stop', key: 'Esc', action: () => Intro.stop() } : { label: '▶ Make it (every step)', action: go(() => { Intro.run(p).catch(err); return null; }) },
      { label: 'From a step', disabled: live, items: () => D.STEPS.filter((s) => s.id !== 'plan').map((s) => ({ label: `${s.icon} From ${s.name}`, hint: p.steps[s.id]?.status || 'todo', action: go(() => { Intro.run(p, { from: s.id }).catch(err); return null; }) })) },
      { label: 'Only one step', disabled: live, items: () => D.STEPS.filter((s) => s.id !== 'plan').map((s) => ({ label: `${s.icon} ${s.name} only`, hint: s.what, action: go(() => { Intro.run(p, { only: s.id }).catch(err); return null; }) })) },
      { label: 'Undo a step', disabled: live || !p.history.length, items: () => [...new Set(p.history.map((h) => h.step))].reverse().map((id) => ({ label: `↺ Before ${D.STEP[id]?.name || id}`, action: go(() => Intro.undo(p, id)) })) },
    ];
  }
  function engineItems(p) {
    const N = Intro.NAME;
    return [
      { label: `⇄ ${N[Intro.other(p.lead)]} leads from here`, hint: `${N[p.lead]} now`, action: go(() => Intro.handoff(p)) },
      { label: 'Review by', hint: N[p.reviewBy || Intro.other(p.lead)], items: () => ['astra', 'claude'].map((k) => ({ label: N[k], ...checked((p.reviewBy || Intro.other(p.lead)) === k), action: go(() => { p.reviewBy = k; Intro.changed(p); return null; }) })).concat([{ label: 'No AI review (checks only)', ...checked(p.reviewAsk === false), action: go(() => { p.reviewAsk = p.reviewAsk === false ? true : false; Intro.changed(p); return null; }) }]) },
      { label: 'Jam rounds per scene', hint: String(p.rounds), items: () => [1, 2, 3, 4].map((n) => ({ label: `${n} round${n > 1 ? 's' : ''}`, ...checked(p.rounds === n), action: go(() => { p.rounds = n; Intro.changed(p); return null; }) })) },
      { label: 'Quick scenes: the open sketch, no jam', ...checked(p.quick), hint: 'no tokens', action: go(() => { p.quick = !p.quick; Intro.changed(p); return null; }) },
      { label: 'Director pass after the edit', ...checked(p.directorPass), hint: 'the Video Director polishes it', action: go(() => { p.directorPass = !p.directorPass; Intro.changed(p); return null; }) },
      { label: '✂ Director pass now', action: go(async () => { const d = await Intro.directorPass(p); return d ? `${N[d.by]}: ${d.line}` : null; }) },
      { label: 'Capture tools for this chat', hint: '≈ 550 tokens a message while on', ...checked(Boolean(p.toolsChat)), action: go(() => { const a = H.agent(H.activeId); const c = a && Native.chatOf(a.id); if (!c) return 'Open the chat first.'; if (c.captureTools) { delete c.captureTools; p.toolsChat = null; } else { c.captureTools = true; p.toolsChat = c.id; } Native.save(c); Intro.changed(p); return c.captureTools ? 'Capture tools on for this chat while it works on the video' : 'Capture tools off'; }) },
      { label: 'The task text (what the other AI gets)', action: go(() => { navigator.clipboard.writeText(Intro.taskText(p)); return 'Copied'; }) },
    ];
  }
  function outputItems(p) {
    return [
      { label: '✂ Open the edit', disabled: !p.seq, action: go(() => Intro.openTheEdit(p).then(() => null)) },
      { label: 'Cut-downs', items: () => [{ label: '15 s + 6 s', action: go(() => Intro.makeCuts(p, [15, 6]).then((m) => `${m.length} cut-downs made`)) },
        ...D.CUTDOWNS.filter((c) => !c.loop).map((c) => ({ label: c.name, action: go(() => Intro.makeCuts(p, [c.secs]).then(() => `${c.secs} s cut made`)) })),
        { label: 'Every format for each cut', action: go(() => Intro.makeCuts(p, [15, 6], { all: true }).then((m) => `${m.length} cut-downs in every format`)) }] },
      { label: 'Cover', hint: D.COVER_MODES.find((x) => x.id === p.cover?.mode)?.name.split(' (')[0] || 'best', disabled: !p.seq, items: () => D.COVER_MODES.map((c) => ({ label: c.name, ...checked(c.id === (p.cover?.mode || 'best')), action: go(async () => { p.cover = { ...(p.cover || {}), mode: c.id }; Intro.pickCoverTime(p, c.id); const f = await Intro.makeCovers(p); return `Cover: ${Object.keys(f).length} format${Object.keys(f).length > 1 ? 's' : ''}`; }) })) },
      { label: 'Post text', items: () => D.POSTS.map((x) => ({ label: x.name, action: go(() => { navigator.clipboard.writeText(Intro.postText(p, x.id)); return `${x.name} text copied`; }) })) },
      { label: 'Render one format', disabled: !p.seq, items: () => p.plan.formats.map((f) => ({ label: f, action: go(() => { Intro.run(p, { only: 'render', formats: [f] }).catch(err); return null; }) })) },
      { label: IS_MAC ? 'Show in Finder' : 'Show the folder', action: go(() => Intro.folder(p).then(() => null)) },
    ];
  }
  function projectItems(p) {
    return [
      `🎬 ${p.name}`,
      { label: 'Plan', items: () => planItems(p) },
      { label: 'Vibe and music', items: () => vibeItems(p) },
      { label: 'Run', items: () => runItems(p) },
      { label: 'Claude ⇄ Astra', items: () => engineItems(p) },
      { label: 'Output', items: () => outputItems(p) },
      { label: 'Status', more: true, action: go(() => { Native.note?.(H.activeId, Intro.status(p)); return null; }) },
      { label: 'Rename…', more: true, action: go(async () => { const v = await Modal.prompt('Rename the video project', { value: p.name }); if (v) { p.name = v.trim(); Intro.changed(p); } return null; }) },
      { label: 'Your video projects…', more: true, action: () => listMenu() },
      { label: 'Remove from the list', more: true, danger: true, action: go(async () => ((await Modal.confirm('Remove this video project?', `“${p.name}” leaves your video projects. Its recordings, renders and sequence stay where they are.`, { ok: 'Remove', danger: true })) ? Intro.remove(p) : null)) },
    ];
  }
  function stepItems(p, id) {
    const s = D.STEP[id];
    const live = Intro.current() === p;
    const ai = ['plan', 'scenes', 'edit', 'review'].includes(id);
    const x = p.steps[id] || {};
    return [
      `${s.icon} ${s.name}: ${x.status || 'todo'}`,
      id === 'plan' ? { label: 'Change the plan', items: () => planItems(p) } : { label: `▶ From ${s.name}`, disabled: live, action: go(() => { Intro.run(p, { from: id }).catch(err); return null; }) },
      id === 'plan' ? null : { label: `▶ ${s.name} only`, key: 'Alt+click', disabled: live, action: go(() => { Intro.run(p, { only: id }).catch(err); return null; }) },
      { label: `↺ Undo ${s.name}`, disabled: live || !p.history.some((h) => h.step === id), action: go(() => Intro.undo(p, id)) },
      ai ? { label: `⇄ ${Intro.NAME[Intro.other(x.by === 'claude' || x.by === 'astra' ? x.by : p.lead)]} does it instead`, disabled: live, action: go(() => Intro.takeOver(p, id)) } : null,
      id === 'vibe' ? { label: 'Vibe and music', items: () => vibeItems(p) } : null,
      id === 'edit' || id === 'review' ? { label: '✂ Open the edit', disabled: !p.seq, action: go(() => Intro.openTheEdit(p).then(() => null)) } : null,
      id === 'review' && p.review?.sheet ? { label: 'The contact sheet', action: () => Capture.openInReview ? window.hub.fs.open?.(p.review.sheet) : null } : null,
      id === 'render' ? { label: 'Output', items: () => outputItems(p) } : null,
    ].filter(Boolean);
  }
  function wordItems(p, b) {
    return [
      ...Intro.wordsFor(p, b).map((w) => ({ label: w, ...checked(w === b.words), action: go(() => { b.words = w; Intro.stale(p, 'edit'); Intro.changed(p); return null; }) })),
      '-',
      { label: 'Your own words…', action: go(async () => { const v = await Modal.prompt(`Words for beat ${b.n}`, { value: b.words || '' }); if (v == null) return null; b.words = v; Intro.stale(p, 'edit'); Intro.changed(p); return null; }) },
      b.words ? { label: 'No words on this beat', action: go(() => { b.words = ''; Intro.stale(p, 'edit'); Intro.changed(p); return null; }) } : null,
      { label: '✦ Astra rewrites every line', action: go(() => Intro.rewriteWords(p)) },
    ].filter(Boolean);
  }
  function beatItems(p, b) {
    const live = Intro.current() === p;
    const i = p.plan.beats.indexOf(b);
    const set = (fn, from = 'edit') => go(() => { fn(); p.plan.beats.forEach((x, k) => { x.n = k + 1; }); p.plan.secs = D.total(p.plan); Intro.stale(p, from); Intro.changed(p); return null; });
    return [
      `${b.n} · ${D.KINDS[b.kind].icon} ${D.KINDS[b.kind].label}`,
      { label: '↻ Redo this beat', key: 'R', disabled: live, action: go(() => Intro.redoBeat(p, b.n)) },
      ['lab', 'tour', 'shot'].includes(b.kind) ? { label: '◉ Capture it again (same scene)', disabled: live, action: go(() => Intro.redoBeat(p, b.n, { scene: false })) } : null,
      { label: 'Words', key: 'W', hint: cap(b.words || '—', 24), items: () => wordItems(p, b) },
      { label: 'Length', hint: `${b.secs} s`, items: () => [['−0.5 s', b.secs - 0.5], ['+0.5 s', b.secs + 0.5], ...[1, 1.5, 2, 3, 4, 5, 6].map((s) => [`${s} s`, s])].map(([l, v]) => ({ label: l, ...checked(Math.abs(v - b.secs) < 0.01 && !/[+−]/.test(l)), action: go(() => { setSecs(p, b, v); return null; }) })) },
      { label: 'Kind', hint: D.KINDS[b.kind].label, items: () => Object.entries(D.KINDS).map(([k, x]) => ({ label: `${x.icon} ${x.label}`, hint: x.what, ...checked(k === b.kind), action: set(() => { p.plan.beats[i] = D.swapKind(b, k); delete p.plan.beats[i].clip; delete p.plan.beats[i].shot; }, 'scenes') })) },
      b.kind === 'tour' || b.kind === 'shot' ? { label: 'What it films', hint: D.recipeFor(b.area).name, items: () => [...new Set(D.RECIPES.map((r) => r.area))].map((area) => ({ label: area, items: () => D.RECIPES.filter((r) => r.area === area).map((r) => ({ label: r.name, hint: `${r.secs} s`, ...checked(r.id === b.area), action: set(() => { b.area = r.id; delete b.clip; delete b.shot; }, 'captures') })) })) } : null,
      b.kind === 'lab' ? { label: 'Scene idea…', hint: cap(b.scene, 24), action: go(async () => { const v = await Modal.prompt(`The idea for beat ${b.n}'s Lab scene`, { value: b.scene || '' }); if (v) { b.scene = v; Intro.stale(p, 'scenes'); Intro.changed(p); } return null; }) } : null,
      b.kind === 'lab' && b.sketchId ? { label: 'Open its sketch in the Lab', action: go(async () => { await ThreeLab.cmd({ show: true }); ThreeLab.scenes?.open(b.sketchId); return null; }) } : null,
      b.clip?.path ? { label: 'Play its capture', action: go(() => Intro.openOutput(b.clip.path).then(() => null)) } : null,
      p.seq ? { label: 'Go to it in the editor', key: 'Shift+click', action: go(() => gotoBeat(p, b)) } : null,
      { label: 'Move earlier', disabled: i === 0, more: true, action: set(() => { p.plan.beats.splice(i - 1, 0, p.plan.beats.splice(i, 1)[0]); }) },
      { label: 'Move later', disabled: i === p.plan.beats.length - 1, more: true, action: set(() => { p.plan.beats.splice(i + 1, 0, p.plan.beats.splice(i, 1)[0]); }) },
      { label: 'Duplicate', more: true, action: set(() => { p.plan.beats.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(b)), id: `${b.id}d${Date.now().toString(36)}` }); }) },
      { label: 'Add a beat after', more: true, items: () => Object.entries(D.KINDS).map(([k, x]) => ({ label: `${x.icon} ${x.label}`, action: set(() => { p.plan.beats.splice(i + 1, 0, D.swapKind({ id: `b${Date.now().toString(36)}`, kind: 'title', secs: 2, words: k === 'title' ? 'New words' : '', pri: 2 }, k)); }, 'scenes') })) },
      { label: 'Remove this beat', more: true, danger: true, disabled: p.plan.beats.length < 2, action: set(() => { p.plan.beats.splice(i, 1); selected.delete(p.id); }) },
    ].filter(Boolean);
  }

  // ---------- the entry: "Make a video…" (rail ⋯, the palette, ⌘/Ctrl+Alt+I, /intro menu) ----------
  function entryItems() {
    const last = Intro.latest();
    const vd = (o) => go(async () => { const p = await Intro.create({ ...o, agentId: H.activeId }); return `Proposed “${p.name}”: ▶ Make it in the card`; });
    return [
      '🎬 Make a video',
      { label: 'Intro for Hearth', hint: '20 s · 9:16 16:9 1:1', action: vd({ template: 'product-intro' }) },
      last ? { label: `Go on with “${cap(last.name, 24)}”`, hint: last.status, action: go(async () => { await Intro.reopen(last, { agentId: H.activeId }); return null; }) } : null,
      { label: 'From a template', items: () => D.TEMPLATES.map((t) => ({ label: t.name, hint: `${t.secs} s · ${t.fmts.join(' ')}`, action: vd({ template: t.id }) })) },
      { label: 'Your video projects', disabled: !Intro.list().length, items: () => Intro.list().map((p) => ({ label: p.name, hint: `${p.status} · ${new Date(p.updated).toLocaleDateString()}`, action: go(async () => { await Intro.reopen(p, { agentId: H.activeId }); return null; }) })) },
      { label: 'Film one Hearth moment', items: () => [...new Set(D.RECIPES.map((r) => r.area))].map((area) => ({ label: area, items: () => D.RECIPES.filter((r) => r.area === area).map((r) => ({ label: r.name, hint: `${r.secs} s`, action: go(() => filmRecipe(r)) })) })) },
      last?.seq ? { label: `Cut-downs of “${cap(last.name, 20)}”`, more: true, items: () => [{ label: '15 s + 6 s', action: go(() => Intro.makeCuts(last, [15, 6]).then((m) => `${m.length} cut-downs made`)) }, ...D.CUTDOWNS.filter((c) => !c.loop).map((c) => ({ label: c.name, action: go(() => Intro.makeCuts(last, [c.secs]).then(() => `${c.secs} s cut made`)) }))] } : null,
      { label: 'How it works', more: true, action: () => Commands.tryRun('/intro help', H.activeId) },
    ].filter(Boolean);
  }
  async function filmRecipe(r, fmt = '9:16') {
    if (CaptureTour.running()) throw new Error('A tour is running (Esc stops it).');
    const out = await CaptureTour.run(D.tourText(r, fmt), { name: r.name });
    return out.recording ? `🎬 ${base(out.recording.path)}` : 'No recording';
  }
  function entryMenu(x, y) { showMenu(x ?? Math.max(8, innerWidth / 2 - 140), y ?? 90, entryItems()); }
  function listMenu() {
    const all = Intro.list();
    if (!all.length) { toast('No video project yet: /intro makes one', { timeout: 2000 }); return; }
    showMenu(Math.max(8, innerWidth / 2 - 140), 90, ['Your video projects', ...all.map((p) => ({ label: p.name, hint: `${p.status} · ${p.plan.formats.join(' ')} · ${new Date(p.updated).toLocaleDateString()}`, items: () => [
      { label: 'Show it in this chat', action: go(async () => { await Intro.reopen(p, { agentId: H.activeId }); return null; }) },
      p.outputs[0] ? { label: '▶ Play the render', action: go(() => Intro.openOutput(p.outputs[0].path).then(() => null)) } : null,
      p.seq ? { label: '✂ Open the edit', action: go(() => Intro.openTheEdit(p).then(() => null)) } : null,
      { label: 'Remove from the list', danger: true, action: go(() => Intro.remove(p)) },
    ].filter(Boolean) }))]);
  }

  // ---------- keys (all listed in the keys button; each also in a menu or a command) ----------
  const inCard = () => Boolean(document.querySelector('.surface.active .intro-card'));
  Keys.add([
    { area: 'Video project', keys: `${M}+Alt+I`, what: 'Make a video… (the video project menu)', run: () => entryMenu() },
    { area: 'Video project', keys: 'Esc', what: 'Stops a running video project', when: () => Intro.running() },
    { area: 'Video project', keys: 'Right-click the card', what: 'Plan ›, Vibe and music ›, Run ›, Claude ⇄ Astra ›, Output ›', when: inCard },
    { area: 'Video project', keys: 'Right-click a step', what: 'Run from / only it, ↺ undo it, ⇄ the other AI does it', when: inCard },
    { area: 'Video project', keys: 'Alt+click a step', what: 'Run only that step', when: inCard },
    { area: 'Video project', keys: 'Right-click a beat', what: 'Redo, words, length, kind, what it films, move, remove', when: inCard },
    { area: 'Video project', keys: 'Shift+click a beat', what: 'Go to that beat in the editor', when: inCard },
    { area: 'Video project', keys: '← / → (beats)', what: 'Pick the beat before / after', when: inCard },
    { area: 'Video project', keys: 'R (a beat)', what: 'Redo the picked beat', when: inCard },
    { area: 'Video project', keys: 'W (a beat)', what: 'Words for the picked beat', when: inCard },
    { area: 'Video project', keys: '+ / − (a beat)', what: 'Half a second longer / shorter', when: inCard },
    { area: 'Video project', keys: 'Enter (a beat)', what: 'Open the edit at that beat', when: inCard },
    { area: 'Video project', keys: 'Drag a render', what: 'Into a chat or another app', when: inCard },
  ]);
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey && e.code === 'KeyI') { e.preventDefault(); entryMenu(); return; }
    if (e.key === 'Escape' && Intro.running() && !e.defaultPrevented && !document.querySelector('dialog[open]') && document.getElementById('menu')?.hidden !== false) { Intro.stop(); toast('Stopping the video project', { timeout: 1400 }); }
  });

  return { cardEl, paint, entryItems, entryMenu, listMenu, projectItems, beatItems, stepItems, planItems, vibeItems, outputItems, engineItems, wordItems, filmRecipe, selected };
})();
window.IntroCard = IntroCard;
