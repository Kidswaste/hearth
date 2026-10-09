// Video projects from chat (round 8): /intro and its few siblings, the palette, the rail's ⋯ entry "🎬 Make a
// video…", and the agents' way in: video_edit { op: "project", action } (tools/video-edit-tools.js routes it here),
// so the Video Director (Claude or Astra) reads and drives the project with the tools it already has (no new tool
// definitions, no extra tokens per message). Everything here is local (no tokens) except what it starts.
const IntroCmds = (() => {
  const D = IntroData;
  const cap = (t, n) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  const IS_MAC = /Mac/.test(navigator.platform);
  const M = IS_MAC ? '⌘' : 'Ctrl';
  const AREA = 'Video project';

  // the project a command means: named, else this chat's, else the newest
  async function target(ctx, name = '') {
    await Intro.load();
    const p = (name && Intro.find(name)) || (ctx?.chatId && Intro.ofChat(ctx.chatId)) || (ctx?.agentId && Intro.ofChat(Native.chatOf(ctx.agentId)?.id)) || Intro.latest();
    if (!p) throw new Error('No video project yet: /intro makes one (or ⋯ in the rail → 🎬 Make a video…).');
    return p;
  }
  const stepOf = (w) => { const s = String(w || '').toLowerCase(); return D.STEPS.find((x) => x.id === s || x.name.toLowerCase() === s || x.id.startsWith(s))?.id || null; };

  const SUBS = [
    ['go', 'accept the plan and make the whole video'], ['decide', 'Astra decides the details (template, hook, end, titles, cuts)'], ['status', 'where it stands'], ['plan', 'the plan as text'],
    ['template ', 'another beat template'], ['length ', 'seconds (rescales the beats)'], ['formats ', '9:16 16:9 1:1 4:5 (the first is filmed)'], ['board ', 'the board whose vibe it uses (none = Hearth\'s colors)'],
    ['music ', 'a song file, "lab" (the Lab\'s song) or none'], ['cuts ', 'on the music: bars, beats, 2bars, half, drop, free'], ['beat ', '<n> words|secs|kind|films|idea <value>'], ['redo ', '<beat> its scene and capture again'],
    ['run ', '<step> only that step'], ['from ', '<step> from that step on'], ['undo', '[step] back to before it'], ['stop', 'stop the run (Esc)'], ['handoff', 'Claude ⇄ Astra: who leads the next steps'],
    ['director', 'the Video Director polishes the edit (editor + capture tools for that run)'], ['words', 'Astra rewrites the on-screen words'], ['copy ', '[area] word suggestions from the app'],
    ['cover ', 'best|hook|lab|end|middle|playhead'], ['cut-downs ', '15 6 [all]: shorter cuts from the same captures'], ['post ', 'instagram|tiktok|youtube|x|linkedin|threads: the words under the video'],
    ['render ', '[format] render again'], ['review', 'the frame-exact review again'], ['edit', 'open the edit'], ['list', 'your video projects'], ['open ', '<name> show a project in this chat'],
    ['rename ', '<name>'], ['rounds ', '1–4 jam rounds per scene'], ['quick ', 'on|off: scenes from the open sketch, no jams'], ['templates', 'the beat templates'], ['tours', 'the tour recipes (one Hearth moment each)'],
    ['folder', 'its files'], ['remove ', '<name> from the list (files stay)'], ['help', 'how it works'],
  ];
  const HELP = [
    '**🎬 Video projects** — a motion-design video for socials, made with the chats, end to end:',
    '1. `/intro` (or ⋯ in the rail → 🎬 Make a video…, ' + M + '+Alt+I) proposes a plan: beats, length, formats. **▶ Make it** accepts it; **✦ Astra decides** lets Astra pick the details.',
    '2. Then, in one live card: **Vibe** (the linked mood board: palette, light, motion; never its footage) → **Scenes** (Claude ⇄ Astra jam a Lab scene per visual beat) → **Captures** (Hearth filmed by capture tours, the Lab recorded) → **Edit** (one sequence in the video editor: titles, transitions, grade, music cut on the bars) → **Review** (every beat checked frame-exact, a contact sheet, Astra\'s notes as markers) → **Render** (every format, a cover each).',
    '3. Each step is an undo point (right-click it › ↺), any beat can be redone alone (right-click it › ↻), and Claude and Astra can take over each other\'s step (⇄).',
    '4. Done: **✂ 15 s + 6 s** makes the short cuts from the same captures, **⤴ Post text** copies the words for under the video.',
    'Commands: `/intro go · decide · status · redo <beat> · undo [step] · handoff · cut-downs 15 6 · cover best · post tiktok · list · open <name>` (`/intro help`). The Video Director can drive it too (video_edit op project).',
  ].join('\n');

  async function runIntro(args, ctx) {
    const w = String(args || '').trim();
    const [sub0, ...rest0] = w.split(/\s+/);
    const sub = sub0.toLowerCase();
    const rest = rest0.join(' ').trim();
    const say = (t) => t;
    switch (sub) {
      case 'help': return HELP;
      case 'menu': IntroCard.entryMenu(); return null;
      case 'list': case 'projects': {
        await Intro.load();
        const all = Intro.list();
        if (!all.length) return 'No video project yet: `/intro` makes one.';
        return ['**Your video projects** (`/intro open <name>` shows one here):', ...all.slice(0, 20).map((p) => `- **${p.name}** · ${p.status} · ${D.planText(p.plan, { short: true })}${p.outputs.length ? ` · ${p.outputs.map((o) => o.fmt).join(' ')}` : ''} · ${new Date(p.updated).toLocaleDateString()}`)].join('\n');
      }
      case 'templates': return ['**Beat templates** (`/intro template <id>`):', ...D.TEMPLATES.map((t) => `- \`${t.id}\` **${t.name}** · ${t.secs} s · ${t.beats.length} beats · ${t.fmts.join(' ')} — ${t.hint}`)].join('\n');
      case 'tours': return ['**Tour recipes** (one Hearth moment each; `/film <id>` films one now, `/intro beat <n> films <id>` puts it in a beat):', ...[...new Set(D.RECIPES.map((r) => r.area))].map((a) => `- ${a}: ${D.RECIPES.filter((r) => r.area === a).map((r) => `\`${r.id}\` ${r.name}`).join(' · ')}`)].join('\n');
      case 'open': case 'show': { const p = await Intro.reopen(rest || null, { agentId: ctx.agentId }); return ctx.agentId && p.agentId !== ctx.agentId ? null : null; }
      case 'stop': return Intro.stop() ? 'Stopping the video project…' : 'No video project is running.';
      default: break;
    }
    // a new project: /intro, /intro <idea words>, /intro new <idea>
    const isSub = SUBS.some(([s]) => s.trim() === sub) || ['new', 'start', 'make'].includes(sub);
    if (!w || !isSub || sub === 'new' || sub === 'start' || sub === 'make') {
      const idea = ['new', 'start', 'make'].includes(sub) ? rest : w;
      // /intro with nothing: this chat's unfinished project comes back instead of a new one
      if (!idea) { await Intro.load(); const cur = ctx.chatId && Intro.ofChat(ctx.chatId); if (cur && cur.status !== 'done') { await Intro.reopen(cur, { agentId: ctx.agentId }); return null; } }
      const p = await Intro.create({ idea, agentId: ctx.agentId, chatId: ctx.chatId });
      return ctx.agentId && p.agentId !== ctx.agentId ? `Proposed “${p.name}” in the ${H.agent(p.agentId)?.name} chat.` : null;
    }
    const p = await target(ctx);
    switch (sub) {
      case 'go': case 'make-it': Intro.run(p).catch((e) => toast(e.message, { type: 'error' })); return say(`Making “${p.name}” (Esc stops it).`);
      case 'decide': return (await Intro.decide(p)).text;
      case 'status': return Intro.status(p);
      case 'plan': return `\`\`\`\n${D.planText(p.plan)}\n\`\`\``;
      case 'template': { const t = D.findTemplate(rest); if (!t) return `Templates: ${D.TEMPLATES.map((x) => x.id).join(', ')}`; Intro.replan(p, { template: t.id }); Intro.changed(p); return `Template: ${t.name} (${t.beats.length} beats, ${D.total(p.plan)} s).`; }
      case 'length': { const s = parseFloat(rest); if (!(s >= 2 && s <= 120)) return 'Length in seconds: /intro length 15'; p.plan = D.retime(p.plan, s); if (p.musicFit) await Intro.fitMusic(p); Intro.stale(p, 'captures'); Intro.changed(p); return `${D.total(p.plan)} s.`; }
      case 'formats': case 'format': { const f = rest.split(/[\s,]+/).map(D.parseFormat).filter(Boolean); if (!f.length) return 'Formats: 9:16 16:9 1:1 4:5 (the first is the one filmed)'; const was = p.plan.formats[0]; p.plan.formats = [...new Set(f)]; Intro.stale(p, p.plan.formats[0] !== was ? 'captures' : 'render'); Intro.changed(p); return `Formats: ${p.plan.formats.join(' · ')}.`; }
      case 'board': {
        if (/^(none|off|no)$/i.test(rest)) { p.boardId = null; } else if (rest) { const b = Board.boards().find((x) => x.name.toLowerCase() === rest.toLowerCase()) || Board.boards().find((x) => x.name.toLowerCase().includes(rest.toLowerCase())); if (!b) return `Boards: ${Board.boards().map((x) => x.name).join(', ') || 'none yet'}`; p.boardId = b.id; } else p.boardId = undefined;
        p.vibe = await Intro.readVibe(p); Intro.stale(p, 'vibe'); Intro.changed(p);
        return p.vibe.board ? `Vibe from “${p.vibe.board.name}”: ${cap(p.vibe.line, 160)}` : p.vibe.line;
      }
      case 'music': return Intro.setMusic(p, rest || null);
      case 'cuts': case 'cut': { const m = D.CUT_MODE[rest.toLowerCase()]; if (!m) return `On the music: ${D.CUT_MODES.map((x) => x.id).join(', ')}`; p.cutMode = m.id; if (p.music) { await Intro.fitMusic(p); Intro.stale(p, 'edit'); } Intro.changed(p); return m.name; }
      case 'beat': {
        const [n, what, ...v0] = rest.split(/\s+/); const v = v0.join(' ');
        const b = p.plan.beats.find((x) => x.n === Number(n));
        if (!b) return `Which beat? 1–${p.plan.beats.length}: /intro beat 2 words Two minds`;
        const k = String(what || '').toLowerCase();
        if (k === 'words' || k === 'text') b.words = v;
        else if (k === 'secs' || k === 'length') { const s = parseFloat(v); if (!(s > 0.3)) return 'Seconds: /intro beat 2 secs 3'; b.secs = s; p.plan.secs = D.total(p.plan); }
        else if (k === 'kind') { if (!D.KINDS[v]) return `Kinds: ${Object.keys(D.KINDS).join(', ')}`; const i = p.plan.beats.indexOf(b); p.plan.beats[i] = D.swapKind(b, v); delete p.plan.beats[i].clip; }
        else if (k === 'films' || k === 'area' || k === 'tour') { if (!D.RECIPE[v]) return `Recipes: ${D.RECIPES.map((r) => r.id).join(', ')}`; b.area = v; delete b.clip; delete b.shot; }
        else if (k === 'idea' || k === 'scene') b.scene = v;
        else return 'What? /intro beat <n> words|secs|kind|films|idea <value>';
        Intro.stale(p, ['kind', 'films', 'area', 'tour', 'idea', 'scene'].includes(k) ? 'scenes' : 'edit'); Intro.changed(p);
        return `Beat ${b.n}: ${k} → ${cap(v, 60)}.`;
      }
      case 'redo': { const n = Number(rest.split(/\s+/)[0]); if (!n) return 'Which beat? /intro redo 3'; return Intro.redoBeat(p, n, { scene: !/capture/i.test(rest) }); }
      case 'run': case 'only': { const s = stepOf(rest); if (!s || s === 'plan') return `Steps: ${D.STEPS.slice(1).map((x) => x.id).join(', ')}`; Intro.run(p, { only: s }).catch((e) => toast(e.message, { type: 'error' })); return `${D.STEP[s].name} only…`; }
      case 'from': { const s = stepOf(rest); if (!s || s === 'plan') return `Steps: ${D.STEPS.slice(1).map((x) => x.id).join(', ')}`; Intro.run(p, { from: s }).catch((e) => toast(e.message, { type: 'error' })); return `From ${D.STEP[s].name}…`; }
      case 'undo': return Intro.undo(p, rest ? stepOf(rest) : null);
      case 'handoff': case 'switch': return Intro.handoff(p, /claude/i.test(rest) ? 'claude' : /astra/i.test(rest) ? 'astra' : null);
      case 'director': { const d = await Intro.directorPass(p, { side: /astra/i.test(rest) ? 'astra' : /claude/i.test(rest) ? 'claude' : p.lead }); return d ? `${Intro.NAME[d.by]}: ${d.line}` : 'No director.'; }
      case 'words': return Intro.rewriteWords(p, { side: /claude/i.test(rest) ? 'claude' : 'astra' });
      case 'copy': {
        const vars = { name: p.plan.name, ...p.plan.vars, counts: Intro.counts() };
        const area = rest.toLowerCase();
        if (area && D.LINES[area]) return [`**Words for ${area}** (click one to put it in the chat box):`, ...D.LINES[area].map((l) => `- ${D.fill(l, vars)}`)].join('\n');
        return ['**Hooks**', ...D.HOOKS.slice(0, 8).map((h) => `- ${D.fill(h, vars)}`), '**From the app\'s own numbers**', ...D.featureLines(Intro.counts()).map((l) => `- ${l}`), `Areas: ${Object.keys(D.LINES).join(', ')} (/intro copy lab)`].join('\n');
      }
      case 'cover': { const mode = D.COVER_MODES.find((x) => x.id === rest.toLowerCase())?.id || 'best'; p.cover = { ...(p.cover || {}), mode }; Intro.pickCoverTime(p, mode); const f = await Intro.makeCovers(p); return `Cover (${mode}) at ${(p.cover.t || 0).toFixed(2)} s: ${Object.values(f).map((x) => x.split(/[\\/]/).pop()).join(', ')}`; }
      case 'cut-downs': case 'cutdowns': case 'cuts-down': {
        const secs = rest.split(/\s+/).map(Number).filter((x) => x >= 2 && x <= 60);
        const made = await Intro.makeCuts(p, secs.length ? secs : [15, 6], { all: /\ball\b/i.test(rest) });
        return made.map((c) => `✂ ${c.secs} s: ${c.beats} beats${c.outputs.length ? ` → ${c.outputs.map((o) => `${o.fmt} ${o.dur || ''}s`).join(', ')}` : ''}`).join('\n') || 'No cut made.';
      }
      case 'post': { const t = Intro.postText(p, rest.toLowerCase() || 'instagram'); ctx.draft?.(t); return ctx.draft ? null : t; }
      case 'render': { const f = D.parseFormat(rest); Intro.run(p, { only: 'render', formats: f ? [f] : null }).catch((e) => toast(e.message, { type: 'error' })); return `Rendering ${f || p.plan.formats.join(' · ')}…`; }
      case 'review': Intro.run(p, { only: 'review' }).catch((e) => toast(e.message, { type: 'error' })); return 'Reviewing every beat, frame by frame…';
      case 'edit': await Intro.openTheEdit(p); return null;
      case 'rename': if (!rest) return 'A name: /intro rename Hearth teaser'; p.name = rest.slice(0, 60); Intro.changed(p); return `Renamed “${p.name}”.`;
      case 'rounds': { const n = Number(rest); if (!(n >= 1 && n <= 4)) return 'Jam rounds per scene: 1–4'; p.rounds = n; Intro.changed(p); return `${n} jam round${n > 1 ? 's' : ''} per scene.`; }
      case 'quick': p.quick = rest ? /^(on|yes|true)$/i.test(rest) : !p.quick; Intro.changed(p); return p.quick ? 'Quick scenes: the open sketch, no jams (no tokens).' : 'Scenes: Claude ⇄ Astra jam each one.';
      case 'folder': return `Files: ${await Intro.folder(p)}`;
      case 'remove': case 'delete': { const q = rest ? Intro.find(rest) : p; if (!q) return 'Which one? /intro list'; return Intro.remove(q); }
      default: return HELP;
    }
  }

  const reg = (def) => { if (!Commands.get(def.name)) Commands.register(def); };
  reg({
    name: 'intro', aliases: ['make-video', 'video-project'].filter((a) => !Commands.get(a)), area: AREA, args: '[idea] | go | decide | status | redo <beat> | undo [step] | cut-downs 15 6 | list | help…',
    desc: 'Make a motion-design video for socials with the chats: plan → board vibe → Claude ⇄ Astra Lab scenes → capture tours → editor → frame-exact review → every format',
    examples: ['/intro', '/intro a 15 s teaser for the new board', '/intro go', '/intro decide', '/intro status', '/intro redo 3', '/intro handoff', '/intro cut-downs 15 6', '/intro post tiktok', '/intro list'],
    keywords: 'intro video social reel tiktok shorts trailer promo motion design make a video project teaser launch',
    undo: '/intro undo',
    complete: (a) => {
      const w = a.trimStart().toLowerCase();
      const [s, ...r] = w.split(/\s+/);
      if (r.length || /\s$/.test(w)) {
        const rest = r.join(' ');
        const pick = (list) => list.filter((x) => !rest || x.value.toLowerCase().startsWith(`${s} ${rest}`.toLowerCase()));
        if (s === 'template') return pick(D.TEMPLATES.map((t) => ({ value: `template ${t.id}`, hint: `${t.name} · ${t.secs} s` })));
        if (s === 'formats') return [{ value: 'formats 9:16 16:9 1:1', hint: 'the usual three' }, { value: 'formats 9:16', hint: 'vertical only' }, { value: 'formats 16:9 9:16', hint: 'wide first' }, { value: 'formats 9:16 16:9 1:1 4:5', hint: 'all four' }];
        if (s === 'length') return [6, 10, 15, 20, 30, 45].map((n) => ({ value: `length ${n}`, hint: `${n} s` }));
        if (s === 'cuts') return pick(D.CUT_MODES.map((m) => ({ value: `cuts ${m.id}`, hint: m.name })));
        if (s === 'cover') return pick(D.COVER_MODES.map((m) => ({ value: `cover ${m.id}`, hint: m.name })));
        if (s === 'post') return pick(D.POSTS.map((m) => ({ value: `post ${m.id}`, hint: m.name })));
        if (s === 'run' || s === 'from' || s === 'undo') return pick(D.STEPS.slice(1).map((m) => ({ value: `${s} ${m.id}`, hint: m.what })));
        if (s === 'music') return [{ value: 'music lab', hint: 'the song loaded in the Lab' }, { value: 'music none', hint: 'no music' }];
        if (s === 'board') return [...(typeof Board !== 'undefined' ? Board.boards() : []).map((b) => ({ value: `board ${b.name}`, hint: 'its vibe' })), { value: 'board none', hint: 'Hearth\'s own colors' }];
        if (s === 'open' || s === 'remove') return Intro.list().map((p) => ({ value: `${s} ${p.name}`, hint: p.status }));
        if (s === 'copy') return Object.keys(D.LINES).map((k) => ({ value: `copy ${k}`, hint: 'word suggestions' }));
        if (s === 'cut-downs') return [{ value: 'cut-downs 15 6', hint: 'the 15 s and the 6 s' }, { value: 'cut-downs 30', hint: '30 s' }, { value: 'cut-downs 15 6 all', hint: 'every format' }];
        return [];
      }
      return SUBS.map(([value, hint]) => ({ value, hint })).filter((x) => !w || x.value.startsWith(w));
    },
    run: runIntro,
  });
  reg({ name: 'video-projects', area: AREA, desc: 'Your video projects in one place (show one in this chat, play its render, open its edit)', keywords: 'videos intro projects list renders', run: async () => { await Intro.load(); IntroCard.listMenu(); return null; } });
  reg({ name: 'cut-downs', aliases: Commands.get('cutdowns') ? [] : ['cutdowns'], area: AREA, args: '[15 6] [all]', desc: 'The 15 s and the 6 s cut of your video project, from the same captures (nothing is filmed again)', examples: ['/cut-downs', '/cut-downs 30 10', '/cut-downs 15 6 all'], keywords: 'shorter cut 15 6 seconds bumper', run: (a, ctx) => runIntro(`cut-downs ${a}`, ctx) });
  reg({ name: 'post-text', area: AREA, args: '[instagram|tiktok|youtube|x|linkedin|threads]', desc: 'The words to post under your video (from its plan), in the chat box', complete: () => D.POSTS.map((x) => ({ value: x.id, hint: x.name })), run: (a, ctx) => runIntro(`post ${a}`, ctx) });
  reg({ name: 'film', area: AREA, args: '<recipe> [9:16|16:9|1:1|4:5]', desc: 'Film one Hearth moment with a ready tour (the Lab, the board, the editor, the chats, a jam…)', examples: ['/film lab', '/film board 16:9', '/film jam-card'], keywords: 'record tour hearth ui recipe capture moment',
    complete: (a) => D.RECIPES.filter((r) => !a.trim() || r.id.startsWith(a.trim())).map((r) => ({ value: r.id, hint: `${r.area} · ${r.name}` })),
    run: async (a) => { const [id, f] = String(a || '').trim().split(/\s+/); const r = D.RECIPE[id]; if (!r) return `Recipes: ${D.RECIPES.map((x) => x.id).join(', ')}`; return IntroCard.filmRecipe(r, D.parseFormat(f) || '9:16'); } });

  // ---------- the palette (Ctrl+K) ----------
  queueMicrotask(() => {
    if (typeof AppUI === 'undefined' || !AppUI.addAction) return;
    AppUI.addAction('Make a video… (a video project with the chats)', () => IntroCard.entryMenu());
    AppUI.addAction('Video project: intro for Hearth (20 s, 3 formats)', () => Intro.create({ template: 'product-intro', agentId: H.activeId }).catch((e) => toast(e.message, { type: 'error' })));
    AppUI.addAction('Video projects: the list', () => Intro.load().then(() => IntroCard.listMenu()));
    AppUI.addAction('Video project: make the 15 s and 6 s cuts', () => Intro.load().then(() => { const p = Intro.latest(); if (!p) throw new Error('No video project yet'); return Intro.makeCuts(p, [15, 6]); }).catch((e) => toast(e.message, { type: 'error' })));
    AppUI.addAction('Video project: stop', () => Intro.stop());
  });

  // ---------- the one entry on screen: "🎬 Make a video…" in the rail's ⋯ menu (a hidden rail button it clicks) ----------
  function railEntry() {
    if (document.getElementById('intro-btn')) return;
    const anchor = document.getElementById('config-btn');
    if (!anchor) return;
    const btn = el('button', { class: 'tool-btn', id: 'intro-btn', hidden: true, text: '🎬', title: 'Make a video…', dataset: { feature: 'Make a video' } });
    btn.addEventListener('click', () => { const r = (document.getElementById('rail-more') || anchor).getBoundingClientRect(); IntroCard.entryMenu(r.right + 6, Math.max(8, r.top - 220)); });
    anchor.before(btn);
    if (typeof Simplify !== 'undefined' && Array.isArray(Simplify.TUCKED) && !Simplify.TUCKED.some(([id]) => id === 'intro-btn')) Simplify.TUCKED.push(['intro-btn', `🎬 Make a video…  ${M}+Alt+I`]);
  }
  addEventListener('DOMContentLoaded', railEntry);
  railEntry();

  // ---------- the agents: video_edit { op: "project", action, … } ----------
  // status (default) · plan · task · beat {n, words?, secs?, films?, idea?} · redo {beat} · run {step} · words {lines:{n:words}} ·
  // cover {mode} · cuts {secs:[15,6]} · note {text}. Long runs (run, redo, cuts) start and return at once: the card shows them.
  const AGENT_HELP = 'project actions: status · plan · task · beat {beat, words|secs|films|idea} · redo {beat} · run {step: vibe|scenes|captures|edit|review|render} · cover {mode} · cuts {secs: [15, 6]} · note {text}';
  async function agentOp(a = {}) {
    await Intro.load();
    const p = (a.name && Intro.find(a.name)) || Intro.current() || Intro.latest();
    if (!p) return 'No video project. The owner starts one with /intro.';
    const act = String(a.action || 'status').toLowerCase();
    const bn = Number(a.beat ?? a.n);
    const beat = bn ? p.plan.beats.find((x) => x.n === bn) : null;
    switch (act) {
      case 'help': return AGENT_HELP;
      case 'status': return Intro.status(p).replace(/\*\*/g, '');
      case 'task': return Intro.taskText(p);
      case 'plan': return D.planText(p.plan);
      case 'beat': {
        if (!beat) throw new Error(`beat: 1–${p.plan.beats.length}`);
        if (a.words != null) beat.words = String(a.words).slice(0, 80);
        if (a.secs != null) { beat.secs = Math.max(0.6, Math.min(30, Number(a.secs) || beat.secs)); p.plan.secs = D.total(p.plan); }
        if (a.films && D.RECIPE[a.films]) { beat.area = a.films; delete beat.clip; }
        if (a.idea) beat.scene = String(a.idea).slice(0, 160);
        Intro.stale(p, a.films || a.idea ? 'scenes' : 'edit'); Intro.changed(p);
        return `beat ${beat.n}: ${D.planText({ ...p.plan, beats: [beat] }).split('\n')[1]}`;
      }
      case 'redo': if (!beat) throw new Error('beat: which one'); if (Intro.running()) throw new Error('the project is running'); Intro.redoBeat(p, beat.n).catch((e) => toast(e.message, { type: 'error' })); return `redoing beat ${beat.n} (the card shows it)`;
      case 'run': { const s = stepOf(a.step); if (!s || s === 'plan') throw new Error(`step: ${D.STEPS.slice(1).map((x) => x.id).join('|')}`); if (Intro.running()) throw new Error('the project is running'); Intro.run(p, { only: s }).catch((e) => toast(e.message, { type: 'error' })); return `${s} started`; }
      case 'cover': { const mode = D.COVER_MODES.find((x) => x.id === a.mode)?.id || 'best'; p.cover = { ...(p.cover || {}), mode }; Intro.pickCoverTime(p, mode); const f = await Intro.makeCovers(p); return `cover ${mode} at ${(p.cover.t || 0).toFixed(2)}s: ${Object.keys(f).join(' ')}`; }
      case 'cuts': { const secs = [].concat(a.secs || [15, 6]).map(Number).filter((x) => x >= 2 && x <= 60); const m = await Intro.makeCuts(p, secs); return m.map((c) => `${c.secs}s: ${c.outputs.map((o) => o.path.split(/[\\/]/).pop()).join(', ')}`).join('; '); }
      case 'note': { const t = cap(a.text, 160); if (t) { p.notes.push(`✎ ${t}`); Intro.changed(p); } return 'noted on the card'; }
      default: throw new Error(AGENT_HELP);
    }
  }

  return { runIntro, agentOp, HELP, AGENT_HELP, SUBS };
})();
window.IntroCmds = IntroCmds;
