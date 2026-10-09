// Video projects (round 8): the owner's intro video for socials, end to end, as one flow the chats run and the owner
// steers with few choices. /intro (or rail ⋯ → 🎬 Make a video…) proposes a plan (beats, length, formats) that one
// click accepts; Astra can decide the details. Then, step by step, each visible in one live card in the chat:
//   plan → vibe (the linked mood board: palette, light, motion, moods; never its footage) → scenes (Claude ⇄ Astra
//   jam a Lab scene per visual beat, jam.js) → captures (Hearth filmed by capture tours, capture-tour.js; Lab
//   scenes recorded from the Lab) → edit (one sequence in the video editor: titles, transitions, grade, music cut
//   on the bars) → review (frame-exact checks of every beat, a contact sheet, notes as markers) → render (every
//   format, a cover each).
// Every step is an undo point (↺ in the card), any beat can be redone alone, and Claude and Astra can take over each
// other's step. The project object ties the board, the Lab scenes, the captures, the edit and the renders together
// (kv `video-projects`), listed in one place (/intro list) and reopened in any chat (/intro open <name>).
// Frugal (product rule #1): model turns happen only where they add something (the jams, Astra's one-line decisions,
// one lean review with one picture, an optional director pass with the editor + capture tools for that run only);
// planning, words, cuts on the music, covers and checks are local (no tokens).
// The card is in intro-card.js, commands / menus / the agents' op in intro-cmds.js, data + math in intro-data.js.
const Intro = (() => {
  const D = IntroData;
  const KEY = 'video-projects';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cap = (t, n) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const dirOf = (p) => String(p || '').replace(/[\\/][^\\/]*$/, '');
  const join = (...a) => a.filter(Boolean).join(/\\/.test(a[0] || '') ? '\\' : '/').replace(/([^:])[\\/]{2,}/g, '$1/');
  const clone = (x) => JSON.parse(JSON.stringify(x ?? null));
  const NAME = { claude: 'Claude', astra: 'Astra' };
  const other = (k) => (k === 'astra' ? 'claude' : 'astra');

  // ---------- the projects (data/kv/video-projects.json) ----------
  let data = { list: [] };
  let loaded = null;
  const load = () => (loaded ||= (async () => { try { data = (await window.hub.kvGet(KEY, { list: [] })) || { list: [] }; } catch { data = { list: [] }; } if (!Array.isArray(data.list)) data.list = []; })());
  let saveTimer = 0;
  function save(now = false) {
    clearTimeout(saveTimer);
    const write = () => window.hub.kvSet(KEY, { list: data.list.slice(0, 60) }).catch(() => {});
    if (now) return write();
    saveTimer = setTimeout(write, 250);
    return null;
  }
  const listeners = new Set();
  function changed(p) { if (p) p.updated = Date.now(); save(); for (const fn of listeners) { try { fn(p); } catch (err) { console.warn(err); } } }
  const get = (id) => data.list.find((p) => p.id === id) || null;
  const find = (q) => { const s = String(q || '').toLowerCase().trim(); if (!s) return null; return get(q) || data.list.find((p) => p.name.toLowerCase() === s) || data.list.find((p) => p.name.toLowerCase().includes(s)) || null; };
  // the project a chat works on: the newest one with a card in that chat
  const ofChat = (chatId) => data.list.filter((p) => p.chatId === chatId || p.chats?.includes(chatId)).sort((a, b) => b.updated - a.updated)[0] || null;
  const latest = () => [...data.list].sort((a, b) => b.updated - a.updated)[0] || null;

  // ---------- who plays ----------
  const natives = () => H.agents().filter((a) => a.mode === 'native' && a.enabled !== false);
  const claudeTalk = () => H.claudeAgent?.() || natives().find((a) => a.engine === 'claude' && !a.dock) || null;
  const astraTalk = () => natives().find((a) => a.engine === 'codex' && !a.dock) || null;
  const videoDirector = () => natives().find((a) => a.videoTools && a.dock === 'ae') || natives().find((a) => a.videoTools) || null;
  const talkOf = (k) => (k === 'astra' ? astraTalk() : claudeTalk());
  const sideOf = (agent) => (agent?.engine === 'codex' ? 'astra' : 'claude');

  // ---------- the app's own numbers (for stat beats and the copy) ----------
  function counts() {
    const n = (x) => (Array.isArray(x) ? x.length : 0);
    const FX = typeof EditFX !== 'undefined' ? EditFX : {};
    let commands = 0; try { commands = Commands.list?.().length || 0; } catch { /* not loaded */ }
    let effects = 0; try { effects = (typeof ThreeFX !== 'undefined' && ThreeFX.items?.().length) || 0; } catch { /* lazy */ }
    return {
      commands: commands ? Math.floor(commands / 10) * 10 : 0, transitions: n(FX.TRANSITIONS), looks: n(FX.LOOKS), titles: n(FX.TITLE_STYLES), templates: n(FX.TEMPLATES) + D.TEMPLATES.length,
      effects, tours: typeof CaptureTour !== 'undefined' ? n(CaptureTour.OPS) : 0, formats: D.FORMATS.length, agents: natives().length, shapes: n(FX.SHAPES),
    };
  }

  // ---------- the vibe of the linked board (local: BoardVibe, no tokens) ----------
  async function boardOf(p) {
    if (typeof Board === 'undefined') return null;
    try {
      await Board.ready?.();
      if (p.boardId) { const b = await Board.load?.(p.boardId); if (b) return b; }
      if (p.boardId === null) return null; // "no board" chosen
      return await Board.boardFor?.(p.chatId) || null;
    } catch { return null; }
  }
  async function readVibe(p) {
    const b = await boardOf(p);
    if (!b || !(b.items || []).some((i) => i.type !== 'frame')) return { line: 'No mood board linked: Hearth\'s own colors (Forgeheart gold, ember, AI violet).', palette: ['#ffd75e', '#ff7a3c', '#9b8bff'], moods: ['warm', 'bold'], board: null };
    const items = b.items.filter((i) => i.type !== 'frame' && !(i.stamp === '✕'));
    const s = BoardVibe.summary(items);
    const text = BoardVibe.boardText(b.name, items, ['palette', 'light', 'color', 'motion', 'mood']);
    return { line: text.split('\n').slice(1, 5).join(' · '), palette: (s.palette || []).slice(0, 5).map((c) => c.hex), moods: s.moods || [], summary: { palette: s.palette, light: s.light, contrast: s.contrast, sat: s.sat, warmth: s.warmth, motion: s.motion, pace: s.pace, moods: s.moods }, board: { id: b.id, name: b.name, items: items.length } };
  }

  // ---------- creating a project: a plan proposed in one card ----------
  // A guess of the template from the owner's words ("a teaser", "6 second loop", "changelog for this week"…)
  const GUESS = [[/loop/i, 'loop'], [/speedrun|everything/i, 'speedrun'], [/nodes?|graph/i, 'nodes-story'], [/drop/i, 'drop'], [/question|\?/i, 'question'], [/week/i, 'week-recap'], [/teaser|tease/i, 'teaser'], [/change ?log|what'?s new|update/i, 'changelog'], [/launch|release|out now/i, 'launch'], [/tutorial|how[- ]to|steps/i, 'tutorial'],
    [/before|after/i, 'before-after'], [/kinetic|words only|text only|no footage/i, 'kinetic'], [/music|song|beat/i, 'music-visual'], [/jam/i, 'jam-story'], [/board|reference|mood/i, 'board-to-video'],
    [/number|stat/i, 'stat-hype'], [/cinema|trailer/i, 'cinematic'], [/countdown|3.?2.?1/i, 'countdown'], [/tip/i, 'daily-tip'], [/behind|making of/i, 'behind-scenes'], [/bumper|6 ?s(ec)?\b/i, 'bumper'],
    [/hook|shorts/i, 'shorts-hook'], [/thank|milestone/i, 'milestone'], [/dev ?log/i, 'dev-log'], [/lab|visuals? only/i, 'lab-showcase'], [/carousel|screenshots|stills/i, 'carousel'], [/tour|features/i, 'feature-tour'], [/spotlight|one feature/i, 'one-feature']];
  function guess(idea) { for (const [re, id] of GUESS) if (re.test(idea)) return id; return 'product-intro'; }
  const secsIn = (idea) => { const m = String(idea || '').match(/(\d{1,3})\s*(s|sec|secs|second|seconds)\b/i); return m ? Number(m[1]) : null; };
  const fmtsIn = (idea) => [...String(idea || '').matchAll(/\b(9:16|16:9|1:1|4:5|vertical|square|wide|portrait)\b/gi)].map((m) => D.parseFormat(m[1])).filter(Boolean);

  async function create({ idea = '', template = null, secs = null, formats = null, name = null, agentId = null, chatId = null, boardId } = {}) {
    await load();
    const t = D.findTemplate(template) || D.TEMPLATE[guess(idea)];
    const host = hostFor(agentId);
    const chat = host ? (chatId && Native.chatOf(host.id)?.id === chatId ? Native.chatOf(host.id) : Native.ensureChat(host.id, 'Video project')) : null;
    const at = Date.now();
    const p = {
      id: `v${at.toString(36)}`, name: name || (idea && !/^(a|an|the)?\s*(intro|video|teaser)?$/i.test(idea.trim()) ? cap(idea.replace(/\b\d{1,3}\s*s(ec(ond)?s?)?\b/gi, '').trim(), 40) : 'Hearth intro'),
      idea: cap(idea, 200), at, updated: at, status: 'planned', chatId: chat?.id || null, agentId: host?.id || null, chats: [],
      boardId: boardId === undefined ? undefined : boardId, music: null, cutMode: 'bars', rounds: 2, quick: false, lead: 'claude',
      steps: {}, history: [], notes: [], tokens: {}, outputs: [], cuts: [], cover: null, seq: null,
    };
    const vibe = await readVibe(p).catch(() => null);
    p.vibe = vibe;
    p.plan = D.makePlan({ template: t.id, secs: secs || secsIn(idea), formats: formats || fmtsIn(idea), name: 'Hearth', vibe: vibe?.summary, counts: counts() });
    p.steps.plan = { status: 'proposed', at };
    data.list.unshift(p);
    if (chat) post(p, chat, host);
    changed(p);
    return p;
  }
  // the chat that shows a project's card: where it was asked (a native chat), else the Video Director's, else Claude's
  function hostFor(agentId) {
    const a = agentId && H.agent(agentId);
    if (a && a.mode === 'native') return a;
    const act = H.agent(H.activeId);
    if (act?.mode === 'native') return act;
    return videoDirector() || claudeTalk();
  }
  // a card for the project in a chat (the message holds only its id and a short text the chat's context reads)
  function post(p, chat, host) {
    chat.messages.push({ role: 'intro', pid: p.id, at: Date.now(), text: textOf(p) });
    if (chat.id !== p.chatId && !p.chats.includes(chat.id)) p.chats.push(chat.id);
    // the Video Director gets the capture tools in this chat while it works on the video (removed when it's done)
    if (host?.videoTools && p.status !== 'done') { chat.captureTools = true; p.toolsChat = chat.id; }
    chat.updatedAt = Date.now();
    Native.save(chat);
    Native.refresh?.(host.id, { keepScroll: false });
  }
  async function reopen(q, { agentId } = {}) {
    await load();
    const p = typeof q === 'object' ? q : find(q) || latest();
    if (!p) throw new Error('No video project yet: /intro makes one.');
    const host = hostFor(agentId);
    if (!host) throw new Error('No chat to show it in.');
    const chat = Native.ensureChat(host.id, p.name);
    post(p, chat, host);
    changed(p);
    return p;
  }
  // What the chat's context reads of a card (the next message to the agent knows where the video stands)
  function textOf(p) {
    const st = D.STEPS.map((s) => `${s.name} ${p.steps[s.id]?.status || 'todo'}`).join(', ');
    return `[Video project “${p.name}”: ${D.planText(p.plan, { short: true })}. Steps: ${st}.${p.outputs.length ? ` Renders: ${p.outputs.map((o) => `${o.fmt} ${base(o.path)}`).join(', ')}.` : ''} /intro status for more.]`;
  }
  // The task state for whoever runs the next step (Claude or Astra), ≈ 150 tokens: the brain's handoff, for videos
  function taskText(p) {
    const done = D.STEPS.filter((s) => p.steps[s.id]?.status === 'done').map((s) => s.name);
    const beats = p.plan.beats.map((b) => `${b.n} ${b.kind}${b.clip ? ' ✓' : ''}${b.error ? ' ⚠' : ''}`).join(', ');
    return [`[Video project “${p.name}”${p.lead ? ` · ${NAME[p.lead]} leads` : ''}] ${D.planText(p.plan, { short: true })}`, `Done: ${done.join(', ') || 'nothing yet'} · beats: ${beats}`,
      p.vibe?.line ? `Vibe (board, not footage): ${cap(p.vibe.line, 220)}` : '', p.seq ? `Edit: sequence ${p.seq.slice(4)} in the video editor (video_edit_read).` : '', p.review?.notes?.length ? `Review notes: ${p.review.notes.map((x) => `${x.t.toFixed(1)}s ${x.note}`).join(' | ')}` : ''].filter(Boolean).join('\n');
  }

  // ---------- undo points: a copy of the project before each step ----------
  const SNAP_KEYS = ['plan', 'steps', 'vibe', 'seq', 'outputs', 'cover', 'review', 'music', 'musicFit', 'notes'];
  function snapshot(p, step) {
    const s = { step, at: Date.now(), state: clone(Object.fromEntries(SNAP_KEYS.map((k) => [k, p[k]]))) };
    // the edit itself, when there is one (the editor's own undo stays as it is)
    if (p.seq && typeof VideoCut !== 'undefined' && VideoCut.path === p.seq && VideoCut.edit) s.edit = clone(VideoCut.edit);
    p.history.push(s);
    if (p.history.length > 24) p.history.splice(0, p.history.length - 24);
  }
  // Puts the project back to before `step` last ran (a step id), or the last step. Files it made stay in the
  // captures / exports folders; an edit made by that step goes back too (a fresh sequence is removed).
  async function undo(p, step = null) {
    if (R) throw new Error('The project is running: ■ stop it first.');
    const i = step ? p.history.map((h) => h.step).lastIndexOf(step) : p.history.length - 1;
    if (i < 0) throw new Error(step ? `Nothing to undo for ${D.STEP[step]?.name || step}.` : 'Nothing to undo.');
    const h = p.history[i];
    const hadSeq = p.seq;
    for (const k of SNAP_KEYS) p[k] = clone(h.state[k]);
    p.history.splice(i);
    if (typeof VideoCut !== 'undefined') {
      try {
        if (hadSeq && !p.seq) VideoCut.deleteSequence(hadSeq);
        else if (p.seq && h.edit) { await openEdit(p); VideoCut.commit(h.edit, `Video project: back to before ${D.STEP[h.step]?.name || h.step}`); }
      } catch (err) { note(p, `The edit couldn't go back (${err.message}).`); }
    }
    p.status = 'planned';
    changed(p);
    return `Back to before ${D.STEP[h.step]?.name || h.step}.`;
  }
  const note = (p, text) => { if (!p.notes.includes(text)) p.notes.push(text); if (p.notes.length > 12) p.notes.shift(); };

  // ---------- engine turns ----------
  const runs = new Map();
  window.hub.onEngineEvent((ev) => { const fn = runs.get(ev.chatId); if (fn) fn(ev); });
  // a director turn with tools (fresh session each time; nothing grows)
  function turn(agent, text, options = {}) {
    const id = `intro-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    return new Promise((resolve) => {
      if (!agent) { resolve({ ok: false, error: 'No agent for this step' }); return; }
      if (R?.stopped) { resolve({ ok: false, stopped: true }); return; }
      R?.runIds.add(id);
      let out = ''; const tools = [];
      const timer = setTimeout(() => window.hub.stop(id), 8 * 60000);
      runs.set(id, (ev) => {
        if (ev.type === 'delta') { out += ev.text; return; }
        if (ev.type === 'tool') { tools.push(ev.name); return; }
        if (ev.type === 'thinking' || ev.type === 'progress') return;
        runs.delete(id); R?.runIds.delete(id); clearTimeout(timer);
        const done = ev.type === 'done';
        if (done && ev.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: agent.id, usage: ev.usage, source: 'intro' } }));
        resolve({ ok: done, stopped: ev.type === 'stopped', text: done ? (ev.text || out) : out, usage: ev.usage || null, error: ev.message || null, tools });
      });
      window.hub.send({ agentId: agent.id, chatId: id, session: {}, text, options }).catch((err) => runs.get(id)?.({ type: 'error', message: err.message }));
    });
  }
  // a lean question (no tools): Astra's decisions, the words, the review
  async function ask(p, side, text, { images = [] } = {}) {
    const order = side === 'astra' ? [astraTalk(), claudeTalk()] : [claudeTalk(), astraTalk()];
    for (const agent of order.filter(Boolean)) {
      if (R?.stopped) return null;
      const r = await window.hub.askOnce({ agentId: agent.id, text, images, options: { lean: true, ...(agent.engine === 'codex' ? { effort: 'low' } : {}) } }).catch((err) => ({ ok: false, error: err.message }));
      if (r?.ok) { spend(p, agent, r); if (r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: agent.id, usage: r.usage, source: 'intro' } })); return { ...r, by: sideOf(agent) }; }
    }
    return null;
  }
  function spend(p, agent, r) {
    if (!r?.usage) return;
    const t = (p.tokens[sideOf(agent)] ||= { input: 0, output: 0, turns: 0 });
    t.input += r.usage.input || 0; t.output += r.usage.output || 0; t.turns += 1;
  }

  // ---------- the plan: Astra decides the details (one lean question) ----------
  async function decide(p, { side = 'astra' } = {}) {
    const opts = D.TEMPLATES.map((t) => t.id).join(' | ');
    const prompt = [`Intro · plan. Decide the details of a ${p.plan.secs} s motion-design video presenting Hearth (an app: Claude and Astra chats, a Three.js Lab, a mood board, a video editor) for social media${p.idea ? `; the owner asked: ${cap(p.idea, 120)}` : ''}.`,
      `Now: ${D.planText(p.plan, { short: true })}.`, p.vibe?.line ? `Board vibe: ${cap(p.vibe.line, 200)}` : '',
      `Templates: ${opts}. Title looks: ${D.TITLE_LOOKS.map((x) => x.id).join(' ')}. Cuts: ${D.TRANSITION_SETS.map((x) => x.id).join(' ')}.`,
      'Reply with up to 5 lines, nothing else: "template: <id>", "hook: <≤6 words>", "end: <≤4 words>", "titles: <look>", "cuts: <set>".'].filter(Boolean).join('\n');
    const r = await ask(p, side, prompt);
    const dec = r ? D.parseDecision(r.text) : {};
    if (!r || !Object.keys(dec).length) return { by: 'Hearth', dec: {}, text: 'No answer: the plan stays as it is.' };
    snapshot(p, 'plan');
    replan(p, { template: dec.template, secs: dec.secs, formats: dec.formats, hook: dec.hook, titles: dec.titles, trans: dec.trans, grade: dec.grade, tagline: dec.tagline, cta: dec.cta });
    if (dec.end) { const e = p.plan.beats.findLast((b) => b.kind === 'end'); if (e) e.sub = dec.end.toLowerCase() === 'hearth' ? e.sub : dec.end; }
    p.steps.plan = { ...(p.steps.plan || {}), by: r.by, decided: Object.keys(dec) };
    changed(p);
    return { by: NAME[r.by], dec, text: `${NAME[r.by]} decided: ${Object.entries(dec).map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(' ') : v}`).join(' · ')}` };
  }
  // A new plan from changed choices; the beats keep what they made when the template stays
  function replan(p, ch = {}) {
    const keepBeats = !ch.template || ch.template === p.plan.template;
    const old = p.plan;
    const n = D.makePlan({
      template: ch.template || old.template, secs: ch.secs || old.secs, formats: ch.formats || old.formats, name: old.name, hook: ch.hook || old.vars?.hook, tagline: ch.tagline || old.vars?.tagline, cta: ch.cta || old.vars?.cta,
      vibe: p.vibe?.summary, counts: counts(), titles: ch.titles || (keepBeats ? old.style.titles : null), trans: ch.trans || (keepBeats ? old.style.trans : null), grade: ch.grade || (keepBeats ? old.style.grade : null),
    });
    if (keepBeats && old.beats.length === n.beats.length) n.beats = n.beats.map((b, i) => ({ ...old.beats[i], secs: b.secs, words: ch.hook && i === 0 && b.kind === 'title' ? b.words : old.beats[i].words }));
    p.plan = n;
    if (p.musicFit) fitMusic(p).catch(() => {});
    stale(p, 'scenes');
  }
  // later steps need doing again after a change (their results stay until then)
  function stale(p, from) {
    const i = D.STEP[from]?.i ?? 0;
    for (const s of D.STEPS.slice(i)) if (p.steps[s.id]?.status === 'done') p.steps[s.id].status = 'stale';
  }
  const setStep = (p, id, patch) => { p.steps[id] = { ...(p.steps[id] || {}), ...patch }; changed(p); };

  // ---------- music: the song, its beats, cuts on the bars ----------
  async function analyse(path) {
    if (typeof ThreeMedia === 'undefined' || !ThreeMedia.analyze) return null;
    const u8 = await window.hub.fs.read(path, { encoding: 'buffer', maxBytes: 200 * 1048576 });
    const a = await ThreeMedia.analyze(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
    return { bpm: a.bpm || a.grid?.bpm, beats: a.beats || [], drops: a.drops || [], duration: a.duration };
  }
  async function setMusic(p, path) {
    if (!path || path === 'none' || path === 'off') { p.music = null; p.musicFit = null; changed(p); return 'No music: the cuts keep the plan\'s lengths.'; }
    if (path === 'lab') {
      const c = ThreeLab.peek?.() || await ThreeLab.cmd({ show: false });
      const info = c?.player?.loaded ? c.player.info() : null;
      if (!info?.file) throw new Error('The Lab has no song loaded.');
      path = info.path || info.file;
    }
    if (!(await window.hub.fs.stat(path))) throw new Error(`No file ${path}`);
    p.music = { path, name: base(path) };
    changed(p);
    await fitMusic(p);
    stale(p, 'edit');
    return `Music: ${base(path)}${p.music.bpm ? ` · ${p.music.bpm} bpm` : ''} · ${D.CUT_MODE[p.cutMode]?.name || 'cuts on the bars'}`;
  }
  async function fitMusic(p) {
    if (!p.music) return;
    const a = p.music.analysis || await analyse(p.music.path).catch(() => null);
    if (!a) { note(p, 'The song couldn\'t be analysed: the cuts keep the plan\'s lengths.'); return; }
    p.music.analysis = { bpm: a.bpm, beats: a.beats.slice(0, 600), drops: a.drops.slice(0, 8), duration: a.duration };
    p.music.bpm = Math.round(a.bpm * 10) / 10;
    const f = D.fitToMusic(p.plan.beats, a, p.cutMode);
    p.plan.beats = f.beats;
    p.plan.secs = D.total(p.plan);
    p.musicFit = { start: f.start, bpm: f.bpm, mode: p.cutMode };
    changed(p);
  }

  // ---------- running the steps ----------
  let R = null; // the running flow: { p, stopped, step, runIds, beat }
  const running = () => Boolean(R);
  const STEP_FN = {};
  async function run(p, { from = null, only = null, beats = null, formats = null } = {}) {
    if (R) throw new Error(`“${R.p.name}” is running: ■ stops it (/intro stop).`);
    if (p.plan.beats.length === 0) throw new Error('The plan has no beats.');
    R = { p, stopped: false, step: null, runIds: new Set(), beats, formats };
    p.status = 'running'; p.error = null;
    if (p.steps.plan?.status !== 'done') p.steps.plan = { ...(p.steps.plan || {}), status: 'done', at: Date.now() };
    changed(p);
    const order = D.STEPS.map((s) => s.id).filter((id) => id !== 'plan');
    const startAt = only ? order.indexOf(only) : from ? Math.max(0, order.indexOf(from)) : order.findIndex((id) => p.steps[id]?.status !== 'done');
    const todo = only ? [only] : order.slice(startAt < 0 ? order.length : startAt);
    const t0 = Date.now();
    const labWas = labState();
    try {
      for (const id of todo) {
        if (R.stopped) break;
        R.step = id;
        snapshot(p, id);
        setStep(p, id, { status: 'running', at: Date.now(), done: 0, total: 0, error: null });
        try {
          await STEP_FN[id](p);
          if (!R.stopped) setStep(p, id, { status: 'done', ms: Date.now() - p.steps[id].at });
        } catch (err) {
          setStep(p, id, { status: 'error', error: cap(err.message, 200) });
          throw err;
        }
      }
      p.status = R.stopped ? 'stopped' : p.steps.render?.status === 'done' ? 'done' : 'planned';
    } catch (err) {
      p.status = 'error'; p.error = cap(err.message, 200);
    } finally {
      for (const s of D.STEPS) if (p.steps[s.id]?.status === 'running') p.steps[s.id].status = R.stopped ? 'stopped' : 'error';
      const stopped = R.stopped;
      R = null;
      await labBack(labWas).catch(() => {});
      p.ms = (p.ms || 0) + (Date.now() - t0);
      if (p.status === 'done' && p.toolsChat) toolsOff(p);
      changed(p);
      finished(p, stopped);
    }
    return p;
  }
  function stop() {
    if (!R) return false;
    R.stopped = true;
    for (const id of R.runIds) window.hub.stop(id);
    try { if (typeof Jam !== 'undefined' && Jam.running()) Jam.stop(); } catch { /* jam ended */ }
    try { if (typeof CaptureTour !== 'undefined' && CaptureTour.running()) CaptureTour.stop(); } catch { /* tour ended */ }
    return true;
  }
  function finished(p, stopped) {
    const t = totals(p);
    const msg = stopped ? `Video project “${p.name}” stopped` : p.status === 'error' ? `Video project “${p.name}”: ${p.error}` : p.status === 'done' ? `🎬 “${p.name}” rendered: ${p.outputs.map((o) => o.fmt).join(' · ')} · Claude ${fmt(t.claude)} · Astra ${fmt(t.astra)} tokens` : `Video project “${p.name}”: ${D.STEPS.filter((s) => p.steps[s.id]?.status === 'done').map((s) => s.name).join(', ')} done`;
    toast(msg, { type: p.status === 'error' ? 'error' : undefined, timeout: 6000, action: p.outputs[0] ? { label: 'Open', fn: () => openOutput(p.outputs[0].path) } : undefined });
    if (p.status === 'done' && p.agentId && p.chatId) AppUI.replyFinished?.(p.agentId, p.chatId, msg);
    dispatchEvent(new CustomEvent('hearth:intro-end', { detail: { id: p.id, status: p.status } }));
  }
  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n || 0));
  const totals = (p) => ({ claude: (p.tokens.claude?.input || 0) + (p.tokens.claude?.output || 0), astra: (p.tokens.astra?.input || 0) + (p.tokens.astra?.output || 0) });
  function toolsOff(p) {
    try { const a = H.agent(p.agentId); const c = a && Native.chatOf(a.id); if (c && c.id === p.toolsChat) { delete c.captureTools; Native.save(c); } } catch { /* the chat is gone */ }
    p.toolsChat = null;
  }
  const progress = (p, id, done, total, sub = '') => setStep(p, id, { done, total, sub });
  const want = (p, b) => !R?.beats || R.beats.includes(b.n);

  // The Lab as it was (the open sketch and frame size) comes back at the end of a run
  function labState() { try { const S = ThreeLab.scenes; const c = ThreeLab.peek?.(); return { sketch: S?.currentId?.() || null, size: c?.state?.frame?.id || null, surface: H.surfaceIdFor?.(H.activeId) }; } catch { return {}; } }
  async function labBack(w) {
    if (!w) return;
    try { const S = ThreeLab.scenes; if (w.sketch && S?.get(w.sketch) && S.currentId() !== w.sketch) S.open(w.sketch); } catch { /* the Lab closed */ }
    try { const c = ThreeLab.peek?.(); if (c && w.size && c.state?.frame?.id !== w.size) c.size(w.size); } catch { /* no size */ }
  }

  // ---------- step: vibe ----------
  STEP_FN.vibe = async (p) => {
    const v = await readVibe(p);
    p.vibe = v;
    const vs = D.vibeStyle(v.summary);
    // the vibe fills what the template left open (an explicit choice stays)
    if (v.summary) {
      p.plan.style.accent = vs.accent; p.plan.style.backdrop = vs.backdrop;
      if (!p.styleLocked) { p.plan.style.grade = vs.grade || p.plan.style.grade; p.plan.style.trans = vs.trans || p.plan.style.trans; p.plan.style.titles = vs.titles || p.plan.style.titles; }
    }
    if (p.music && !p.musicFit) await fitMusic(p);
    progress(p, 'vibe', 1, 1, v.board ? `board “${v.board.name}” (${v.board.items} references)` : 'Hearth\'s own colors');
  };

  // ---------- step: scenes (a jam per Lab beat) ----------
  STEP_FN.scenes = async (p) => {
    const labs = p.plan.beats.filter((b) => b.kind === 'lab' && want(p, b));
    progress(p, 'scenes', 0, labs.length);
    if (!labs.length) return;
    for (const [i, b] of labs.entries()) {
      if (R.stopped) return;
      b.status = 'scene'; b.error = null; changed(p);
      R.beat = b.n;
      try {
        if (p.quick || typeof Jam === 'undefined') {
          // no jam: the open sketch (no tokens)
          const c = await ThreeLab.cmd({ show: true });
          b.sketchId = ThreeLab.scenes?.currentId() || null; b.scene = b.scene || c.state.sketch; b.by = 'you';
        } else await jamBeat(p, b);
      } catch (err) { b.error = cap(err.message, 140); note(p, `Beat ${b.n}: ${b.error}`); }
      b.status = b.error ? 'error' : 'scened';
      progress(p, 'scenes', i + 1, labs.length);
    }
    R.beat = null;
  };
  async function jamBeat(p, b) {
    // the jam needs the Three Director (made on the spot) and an idle one
    for (let i = 0; i < 60 && Jam.running(); i += 1) await sleep(500);
    const idea = D.sceneIdea(b, p.vibe || {}, { fmt: p.plan.formats[0] });
    // the lead engine starts the jam: Claude builds first, or Astra when it leads and can build
    const m = await Jam.start(idea, { rounds: Math.max(1, Math.min(4, p.rounds || 2)) });
    b.jam = { id: m.id, rounds: m.total };
    for (let i = 0; i < 1200 && Jam.running(); i += 1) { if (R.stopped) { Jam.stop(); break; } await sleep(500); }
    const done = Jam.latest() || m;
    b.sketchId = done.sketchId;
    b.jam = { id: done.id, rounds: done.list.length, best: done.best?.n || null, why: done.best?.why || '', status: done.status };
    const best = done.list.find((x) => x.n === done.best?.n) || done.list.filter((x) => x.ok).at(-1);
    if (best?.thumb) b.thumb = best.thumb;
    b.by = 'jam';
    for (const [k, t] of Object.entries(done.tokens || {})) { const x = (p.tokens[k] ||= { input: 0, output: 0, turns: 0 }); x.input += t.input || 0; x.output += t.output || 0; x.turns += t.turns || 0; }
    if (done.status !== 'done') throw new Error(`the jam ${done.status === 'stopped' ? 'was stopped' : `ended: ${done.error || done.status}`}`);
  }

  // ---------- step: captures (tours for Hearth's own UI, the Lab recorded, stills) ----------
  STEP_FN.captures = async (p) => {
    const list = p.plan.beats.filter((b) => ['lab', 'tour', 'shot'].includes(b.kind) && want(p, b));
    progress(p, 'captures', 0, list.length);
    if (!list.length) return;
    if (typeof Capture === 'undefined') throw new Error('Capture isn\'t available.');
    if (Capture.recording) throw new Error('A recording is already running: stop it first (⌘/Ctrl+Alt+R).');
    const fmt0 = p.plan.formats[0];
    for (const [i, b] of list.entries()) {
      if (R.stopped) return;
      R.beat = b.n;
      b.status = 'capturing'; b.error = null; changed(p);
      try {
        if (b.kind === 'lab') {
          // a take much shorter than the beat (a busy machine whose encoder fell behind) is taken again once; then
          // the scene's still with a slow push stands in, said on the card
          b.clip = await recordLab(p, b, fmt0);
          if (!R.stopped && (b.clip.dur || 0) < b.secs * 0.6) b.clip = await recordLab(p, b, fmt0);
          if (!R.stopped && (b.clip.dur || 0) < b.secs * 0.6) {
            note(p, `Beat ${b.n}: the Lab take was too short (${(b.clip.dur || 0).toFixed(1)} s), so a still of the scene with a slow push stands in (redo the beat to film it again).`);
            b.shot = (await Capture.shot({ target: 'lab', crop: fmt0, fit: 'crop', clean: true, quiet: true, name: `beat ${b.n} lab still` })).path;
            b.clip = null;
          } else b.shot = null;
        }
        else if (b.kind === 'tour') {
          b.clip = await recordTour(p, b, fmt0);
          // a take much shorter than the beat is filmed again once (then it plays slower to fill its beat)
          if (!R.stopped && (b.clip.dur || 0) < b.secs * 0.6) b.clip = await recordTour(p, b, fmt0);
        }
        else { b.shot = await shotOf(b, fmt0); b.clip = null; }
        b.status = 'captured';
      } catch (err) { b.error = cap(err.message, 140); b.status = 'error'; note(p, `Beat ${b.n} (${D.KINDS[b.kind].label}): ${b.error}`); }
      progress(p, 'captures', i + 1, list.length);
    }
    R.beat = null;
    if (list.every((b) => b.error)) throw new Error('Nothing could be captured (see the notes).');
  };
  const pad = 0.8; // seconds recorded past a beat (transitions overlap the next beat)
  async function probe(path) { try { return await window.hub.video.probe(path); } catch { return null; } }
  async function recordLab(p, b, fmt0) {
    const c = await ThreeLab.cmd({ show: true });
    const S = ThreeLab.scenes;
    if (b.sketchId && S?.get(b.sketchId) && S.currentId() !== b.sketchId) { await ThreeLab.idle?.(); S.open(b.sketchId); await sleep(1600); }
    try { c.size(fmt0); } catch { /* the Lab keeps its size */ }
    await sleep(900);
    await Capture.record({ target: 'lab', size: fmt0, fps: p.fps || 30, countdown: 0, audio: 'none', cursor: 'off', clicks: 'off', keys: false, mp4: true, name: `${p.name} beat ${b.n} Lab` });
    const t0 = performance.now();
    while ((performance.now() - t0) / 1000 < b.secs + pad) { if (R.stopped) break; await sleep(100); }
    const r = await Capture.stop({ quiet: true });
    const info = await probe(r.path);
    return { path: r.path, dur: info?.duration || r.duration, w: info?.w, h: info?.h, at: Date.now(), from: 'lab' };
  }
  async function recordTour(p, b, fmt0) {
    const recipe = D.recipeFor(b.area);
    // the tour is padded with a wait so the take lasts the beat (and a little more for the transition)
    const extra = Math.max(0, b.secs + pad - recipe.secs);
    const text = D.tourText({ ...recipe, steps: `${recipe.steps}${extra > 0.05 ? `\nwait ${extra.toFixed(2)}s` : ''}` }, fmt0, { fps: p.fps || 30 });
    const out = await CaptureTour.run(text, { name: `${p.name} · ${recipe.name}` });
    const rec = out.recording;
    if (!rec?.path) throw new Error(`the tour “${recipe.name}” made no recording${out.skipped?.length ? ` (${out.skipped[0]})` : ''}`);
    if (out.skipped?.length) note(p, `Beat ${b.n}: ${out.skipped.length} tour step${out.skipped.length > 1 ? 's' : ''} skipped (${cap(out.skipped[0], 80)})`);
    const info = await probe(rec.path);
    return { path: rec.path, dur: info?.duration || rec.duration, w: info?.w, h: info?.h, at: Date.now(), from: 'tour', recipe: recipe.id };
  }
  async function shotOf(b, fmt0) {
    const area = D.areaOf(b.area);
    const open = D.SHOT_OPEN[area] || 'claude';
    const tool = Tools.get(open);
    if (tool) activate(`tool:${tool.id}`); else { const a = open === 'astra' ? astraTalk() : claudeTalk(); if (a) activate(a.id); }
    await sleep(700);
    const r = await Capture.shot({ target: D.SHOT_TARGET[area] || 'tool', crop: fmt0, fit: 'crop', clean: true, quiet: true, name: `beat ${b.n} ${area}` });
    return r.path;
  }

  // ---------- step: edit (one sequence, built as data, committed as one undo step) ----------
  async function openEdit(p) {
    if (typeof VideoCut === 'undefined') throw new Error('The video editor isn\'t available.');
    activate('tool:ae', { focus: false });
    await Review.ensureMounted();
    if (!p.seq || !VideoCut.sequences().some((s) => s.key === p.seq)) {
      p.seq = await VideoCut.newSequence(`${p.name}`, { format: p.plan.formats[0] });
    } else if (!VideoCut.active || VideoCut.path !== p.seq) {
      if (VideoCut.active) VideoCut.leave();
      await VideoCut.enter({ path: p.seq });
    }
    return p.seq;
  }
  // The edit, from the plan and what each beat made: main track (recordings, stills, colors) with the style's
  // transitions, titles and shapes on text tracks, the grade, the music cut on the bars, a marker per beat.
  function buildEdit(p) {
    const C = CutData; const FX = EditFX;
    const plan = p.plan; const st = plan.style;
    const ts = D.TRANSITION_SETS.find((x) => x.id === st.trans) || D.TRANSITION_SETS[0];
    const tl = D.TITLE_LOOKS.find((x) => x.id === st.titles) || D.TITLE_LOOKS[0];
    const f = D.FORMAT[plan.formats[0]] || D.FORMATS[0];
    const tdOf = (i) => (i > 0 && ts.dur > 0 && ts.list[0] !== 'cut' ? Math.min(ts.dur, plan.beats[i].secs * 0.45, plan.beats[i - 1].secs * 0.45) : 0);
    let e = { ...C.empty(), clips: [] };
    const starts = [];
    let t = 0;
    plan.beats.forEach((b, i) => {
      const tdNext = i + 1 < plan.beats.length ? tdOf(i + 1) : 0;
      const dur = D.r2(b.secs + tdNext); // the next transition overlaps the end of this one
      let clip;
      if (b.clip?.path && (b.kind === 'lab' || b.kind === 'tour')) {
        const max = b.clip.dur || dur + 0.3;
        const a = Math.min(0.3, Math.max(0, max - dur)); // skip the take's first frames (a tour settling)
        clip = { ...C.videoClip(b.clip.path, a, Math.min(max, a + dur), max), mute: true };
        if (clip.out - clip.in < dur - 0.02) { clip.speed = Math.max(0.25, (clip.out - clip.in) / dur); } // a short take plays a little slower
      } else if (b.shot) {
        clip = { id: C.uid(), kind: 'image', src: b.shot, dur, mute: true };
        // a slow push in on a still (the editor's Ken Burns keyframes)
        const mo = FX.MOTION?.['ken-burns-in']?.fn?.(dur);
        if (mo) for (const [prop, keys] of Object.entries(mo)) for (const [tt, v, e0] of keys) { clip.keys ||= {}; (clip.keys[prop] ||= []).push({ t: tt, v, ease: e0 || 'ease' }); }
      }
      else clip = { id: C.uid(), kind: 'color', fill: b.kind === 'end' ? st.backdrop : b.kind === 'stat' ? st.backdrop : st.backdrop, dur, mute: true };
      clip.fadeIn = 0; clip.fadeOut = 0;
      clip.label = `${b.n} ${D.KINDS[b.kind].label}`;
      const td = tdOf(i);
      if (td > 0) clip.trans = { type: ts.list[(i - 1) % ts.list.length], dur: D.r2(td) };
      e.clips.push(clip);
      starts.push(D.r2(t));
      t += b.secs;
    });
    // the first clip fades in, the last one out (a loop flows back to the start instead)
    if (e.clips.length) { e.clips[0].fadeIn = plan.loop ? 0 : 0.25; e.clips.at(-1).fadeOut = plan.loop ? 0 : 0.4; }
    if (plan.loop && e.clips.length > 1) {
      const first = e.clips[0];
      const back = { ...C.copy(first), id: C.uid(), trans: { type: 'dissolve', dur: 0.45 }, label: 'loop' };
      if (back.kind === 'video') back.out = Math.min(back.max || back.out, back.in + 0.5); else back.dur = 0.5;
      e.clips.push(back);
    }
    // the grade on everything on the main track
    if (st.grade && FX.LOOK?.[st.grade]) e = C.patchAny(e, e.clips.map((c) => c.id), (c) => { c.color = { look: st.grade }; });
    // shapes first (they sit under the words), then the words
    plan.beats.forEach((b, i) => {
      const s = starts[i]; const d = Math.max(0.4, b.secs - 0.1);
      if (b.kind === 'end') { e = C.addItem(e, { kind: 'title', text: '', shape: 'glow-ember', start: s, dur: d, anim: 'fade', out: 'fade', animDur: 0.5, ...(st.accent ? { color: st.accent } : {}) }); }
      if (b.kind === 'stat') e = C.addItem(e, { kind: 'title', text: '', shape: 'pulse-ring', start: s, dur: d, anim: 'pop', out: 'fade', animDur: 0.4, ...(st.accent ? { color: st.accent } : {}) });
    });
    plan.beats.forEach((b, i) => {
      if (!b.words) return;
      const s = starts[i] + (i ? 0.08 : 0); const d = Math.max(0.4, b.secs - 0.16);
      const [style, anim] = b.kind === 'end' ? tl.end : (i === 0 && b.kind === 'title') || b.kind === 'stat' ? tl.hook : b.kind === 'title' ? tl.hook : tl.body;
      const text = b.kind === 'stat' ? `${b.words}${b.sub ? `\n${b.sub}` : ''}` : b.kind === 'end' && b.sub ? `${b.words}\n${b.sub}` : b.words;
      e = C.addItem(e, { kind: 'title', text, start: s, dur: d, style: FX.TSTYLE?.[style] ? style : 'bold', anim: FX.TANIM?.[anim] ? anim : 'fade-up', out: 'fade', animDur: Math.min(0.6, d / 3) });
    });
    // the music: its first beat at 0, faded out at the end
    if (p.music?.path) {
      const a = p.musicFit?.start || 0; const total = C.total(e); const max = p.music.analysis?.duration || a + total + 1;
      e = C.addItem(e, { kind: 'audio', src: p.music.path, in: a, out: Math.min(max, a + total), max, start: 0, volume: p.musicVol ?? 0.9, fadeIn: 0, fadeOut: p.musicFade === false ? 0 : Math.min(1.2, total / 4) });
    }
    // a marker at each beat (its kind and words), the edit's playhead story for the review and the agents
    const MC = Object.fromEntries((FX.MARKER_COLORS || []).map(([n, hex]) => [n, hex]));
    const kindColor = { title: 'gold', lab: 'violet', tour: 'blue', shot: 'green', stat: 'orange', end: 'pink' };
    plan.beats.forEach((b, i) => { e = C.addMarker(e, starts[i] + 0.01, `${b.n} ${D.KINDS[b.kind].label}${b.words ? `: ${cap(b.words, 30)}` : ''}`); const m = e.markers.find((x) => Math.abs(x.t - (starts[i] + 0.01)) < 1e-3); if (m && MC[kindColor[b.kind]]) m.color = MC[kindColor[b.kind]]; });
    e = C.setSeq(e, { w: f.w, h: f.h, fps: 30 });
    delete e.lastItem;
    return { edit: e, starts };
  }
  STEP_FN.edit = async (p) => {
    progress(p, 'edit', 0, 2, 'opening the editor');
    await openEdit(p);
    const { edit, starts } = buildEdit(p);
    p.plan.beats.forEach((b, i) => { b.at = starts[i]; });
    VideoCut.commit(edit, `Video project: ${p.name}`);
    await VideoCut.goto(0);
    p.steps.edit.secs = D.r2(CutData.total(edit));
    progress(p, 'edit', 1, 2, `${edit.clips.length} clips · ${(edit.tracks || []).reduce((n, k) => n + k.items.length, 0)} titles / layers${p.music ? ' · music' : ''}`);
    if (p.directorPass && !R.stopped) await directorPass(p);
    progress(p, 'edit', 2, 2);
  };

  // ---------- the Video Director's pass (opt-in per project; the editor + capture tools for this run only) ----------
  async function directorPass(p, { side = p.lead } = {}) {
    let agent = null; let options = { hubOnly: true, captureTools: true };
    if (side === 'astra') { agent = astraTalk(); options = { ...options, asDirector: 'video' }; } else {
      agent = videoDirector();
      // no Video Director yet: made on the spot (you turned the pass on), docked in Video Review like /director-setup video
      if (!agent) {
        H.config.agents.push({ id: `videodirector${H.agent('videodirector') ? Date.now() : ''}`, name: 'Video Director', icon: '🎬', color: '#bd8bff', mode: 'native', engine: 'claude', dock: 'ae', videoTools: true, selfReview: true, enabled: true });
        await saveConfig();
        setTimeout(() => { try { Tools.syncDocks?.(); } catch { /* the dock shows later */ } }, 300);
        for (let i = 0; i < 30 && !(agent = videoDirector()); i += 1) await sleep(100);
      }
      if (!agent) { agent = claudeTalk(); options = { ...options, asDirector: 'video' }; }
    }
    if (!agent) { note(p, 'No director for the pass.'); return null; }
    const text = [`Intro · director. You polish the edit of a video project in the video editor (Video Review). ${taskText(p)}`,
      'Read the edit (video_edit_read), look at one or two exact frames (video_edit_frame), then make at most 4 small improvements with video_edit (timing on the cuts, title words / styles, transitions). Board references give a vibe, never footage. Reply with one short line: what you changed.'].join('\n');
    const r = await turn(agent, text, options);
    spend(p, agent, r);
    const line = cap(String(r.text || '').replace(/\n+MCP calls:[\s\S]*$/, '').split('\n').find(Boolean) || '', 160);
    p.director = { by: sideOf(agent), ok: r.ok, line: r.ok ? line : `didn't finish: ${cap(r.error, 100)}`, tools: r.tools?.length || 0, at: Date.now() };
    changed(p);
    return p.director;
  }

  // ---------- step: review (frame-exact checks, a contact sheet, notes as markers) ----------
  function statsOf(img) {
    const c = document.createElement('canvas'); c.width = 48; c.height = Math.max(1, Math.round(48 * img.height / img.width));
    const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let sum = 0; let sum2 = 0; let sat = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] * 0.2126 + d[i + 1] * 0.7152 + d[i + 2] * 0.0722) / 255; sum += l; sum2 += l * l; const mx = Math.max(d[i], d[i + 1], d[i + 2]); sat += mx ? (mx - Math.min(d[i], d[i + 1], d[i + 2])) / mx : 0; }
    const luma = sum / n; const contrast = Math.sqrt(Math.max(0, sum2 / n - luma * luma));
    return { luma: D.r2(luma), contrast: D.r2(contrast * 2), sat: D.r2(sat / n), black: luma < 0.03 && contrast < 0.02 };
  }
  const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  function small(img, w = 132) { const c = document.createElement('canvas'); c.width = w; c.height = Math.round(w * img.height / img.width); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', 0.7); }
  STEP_FN.review = async (p) => {
    await openEdit(p);
    const fitted = fitSafe(p);
    const e = VideoCut.edit; const fps = VideoCut.fps;
    const beats = p.plan.beats;
    progress(p, 'review', 0, beats.length);
    const frames = [];
    for (const [i, b] of beats.entries()) {
      if (R.stopped) return;
      const at = b.at ?? 0;
      // the beat's first whole frame after its transition, and its middle (the frame the card and the sheet show)
      const first = CutData.frameOf(at + Math.min(0.5, b.secs / 3), fps);
      const mid = CutData.frameOf(at + b.secs / 2, fps);
      const im1 = await VideoComp.frameImage(CutData.frameTime(first, fps), { maxW: 240, edit: e, q: 0.7 });
      const im2 = await VideoComp.frameImage(CutData.frameTime(mid, fps), { maxW: 360, edit: e, q: 0.75 });
      const img = await loadImg(im2.url);
      const s = img ? statsOf(img) : { black: true };
      const checks = [...(im1.checks || []), ...(im2.checks || [])];
      const exact = checks.every((x) => x.got === x.want);
      b.thumb = img ? small(img) : b.thumb;
      b.review = { frame: mid, exact, checked: checks.length, ...s, words: Boolean(b.words) };
      frames.push({ b, img, t: CutData.frameTime(mid, fps), s });
      progress(p, 'review', i + 1, beats.length);
    }
    // titles that reach into the apps' buttons / captions are fitted into the safe zone first (smaller, higher)
    const safe = (() => { try { return (VideoCut.safeCheck(zoneOf(p)) || []).filter((x) => !x.inside && x.text); } catch { return []; } })();
    const black = beats.filter((b) => b.review?.black).map((b) => b.n);
    const inexact = beats.filter((b) => b.review && !b.review.exact).map((b) => b.n);
    // a contact sheet of the beats for the one lean look (and the card)
    const sheet = await sheetOf(p, frames);
    p.review = { fitted, at: Date.now(), exact: beats.length - inexact.length, of: beats.length, inexact, black, safe: safe.slice(0, 6).map((x) => `${cap(x.text, 40)} (${x.at.toFixed(1)} s)`), sheet, notes: [] };
    if (p.reviewAsk !== false && sheet && !R.stopped) {
      const side = p.reviewBy || other(p.lead);
      const r = await ask(p, side, [`Intro · review. A ${p.plan.secs} s video for socials (${p.plan.formats[0]}); the picture shows one frame per beat, left to right, each labelled with its time.`,
        `Beats: ${beats.map((b) => `${(b.at || 0).toFixed(1)}s ${b.kind}${b.words ? ` “${cap(b.words, 24)}”` : ''}`).join(' · ')}`,
        'Reply one per line as "m:ss | note" with at most 3 concrete fixes (timing, readability, color, motion). No praise.'].join('\n'), { images: [sheet] });
      if (r) {
        p.review.notes = D.parseNotes(r.text);
        p.review.by = r.by;
        // the notes become markers with notes in the edit (one undo step)
        let n = VideoCut.edit;
        for (const x of p.review.notes) { n = CutData.addMarker(n, x.t, `✎ ${NAME[r.by]}`); const m = n.markers.find((k) => k.label === `✎ ${NAME[r.by]}` && Math.abs(k.t - x.t) < 1e-3 && !k.note); if (m) m.note = x.note; }
        if (p.review.notes.length) VideoCut.commit(n, `Review notes by ${NAME[r.by]}`);
      }
    }
    if (!p.cover) p.cover = { mode: 'best' };
    pickCoverTime(p);
  };
  // The safe zone of the main format: every vertical app for 9:16, the feed grid for 4:5, YouTube's player for 16:9
  const zoneOf = (p) => ({ '9:16': 'all', '4:5': 'feed45', '16:9': 'youtube' }[p.plan.formats[0]] || 'all');
  // Words outside it get smaller and move toward the middle, a few passes, one undo step; returns how many moved
  function fitSafe(p) {
    if (!['9:16', '4:5', '16:9'].includes(p.plan.formats[0]) || p.safeFit === false) return 0;
    let e; const moved = new Set();
    for (let pass = 0; pass < 6; pass += 1) {
      let bad = [];
      try { bad = (VideoCut.safeCheck(zoneOf(p)) || []).filter((x) => !x.inside && x.text); } catch { break; }
      if (!bad.length) break;
      e = CutData.patchAny(VideoCut.edit, bad.map((x) => x.id), (it) => { it.size = Math.round((it.size || 1) * 0.86 * 100) / 100; const y = it.y ?? EditFX.TSTYLE[it.style]?.s?.y ?? 0.5; if (y > 0.66) it.y = Math.max(0.62, Math.round((y - 0.05) * 100) / 100); if (y < 0.2) it.y = 0.22; });
      for (const x of bad) moved.add(x.id);
      VideoCut.commit(e, 'Video project: words into the safe zone');
    }
    if (moved.size) note(p, `${moved.size} title${moved.size > 1 ? 's' : ''} fitted into the safe zone (smaller / higher).`);
    return moved.size;
  }
  async function sheetOf(p, frames) {
    const ok = frames.filter((x) => x.img);
    if (!ok.length) return null;
    const w = 200; const h = Math.round(w * ok[0].img.height / ok[0].img.width);
    const cols = Math.min(4, ok.length); const rows = Math.ceil(ok.length / cols);
    const c = document.createElement('canvas'); c.width = cols * w + (cols - 1) * 4; c.height = rows * h + (rows - 1) * 4;
    const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    ok.forEach((x, i) => {
      const X = (i % cols) * (w + 4); const Y = Math.floor(i / cols) * (h + 4);
      g.drawImage(x.img, X, Y, w, h);
      g.fillStyle = '#000b'; g.fillRect(X + 4, Y + 4, 64, 22);
      g.font = '600 14px system-ui, sans-serif'; g.fillStyle = '#ffd75e'; g.fillText(`${x.b.n} · ${x.t.toFixed(1)}s`, X + 9, Y + 20);
    });
    p.sheetThumb = c.toDataURL('image/jpeg', 0.6);
    return window.hub.saveAttachment(`intro-${p.id}-sheet.jpg`, c.toDataURL('image/jpeg', 0.8).split(',')[1]);
  }
  // the cover's time from the review's frame stats (no tokens)
  function pickCoverTime(p, mode = p.cover?.mode || 'best') {
    const beats = p.plan.beats.filter((b) => b.review);
    if (!beats.length) return null;
    if (mode === 'playhead' && typeof VideoCut !== 'undefined') { p.cover = { ...(p.cover || {}), mode, t: VideoCut.time }; return p.cover.t; }
    if (mode === 'middle') { p.cover = { ...(p.cover || {}), mode, t: p.plan.secs / 2 }; return p.cover.t; }
    const scored = beats.map((b, i) => ({ b, s: D.coverScore({ ...b.review, kind: b.kind, index: i }, mode) })).sort((a, b) => b.s - a.s);
    const best = scored[0].b;
    p.cover = { ...(p.cover || {}), mode, t: (best.at || 0) + best.secs / 2, beat: best.n };
    return p.cover.t;
  }

  // ---------- step: render (every format, a cover each) ----------
  async function projectDir(p) {
    const info = await Capture.info();
    return join(info.dir, 'projects', `${D.slug(p.name)}-${p.id.slice(-4)}`);
  }
  STEP_FN.render = async (p) => {
    await openEdit(p);
    const info = await Capture.info();
    const fmts = R.formats || p.plan.formats;
    progress(p, 'render', 0, fmts.length);
    const dir = await projectDir(p);
    const stem = D.slug(p.name);
    const outs = [];
    if (!info.ffmpeg) {
      // no ffmpeg: the edit is recorded in real time (WebM, the main format only)
      const job = await VideoCut.exportCut({ record: true });
      const ev = await job.done;
      outs.push({ fmt: p.plan.formats[0], path: ev.output, at: Date.now() });
      note(p, 'ffmpeg isn\'t installed: the main format was recorded in real time as WebM; the other formats need ffmpeg.');
    } else {
      // the main format renders the sequence as it is (titles drawn, everything composited, once); the others
      // reframe that render with a blurred fill, so the words stay inside the frame and nothing is drawn twice
      const main = p.plan.formats[0];
      const mainOut = join(dir, `${stem}_${main.replace(':', 'x')}.mp4`);
      const order = [main, ...fmts.filter((f) => f !== main)];
      let mainInfo = fmts.includes(main) ? null : await probe(mainOut);
      for (const [i, fmt0] of order.entries()) {
        if (R.stopped) return;
        progress(p, 'render', i, order.length, `rendering ${fmt0}`);
        const out = fmt0 === main ? mainOut : join(dir, `${stem}_${fmt0.replace(':', 'x')}.mp4`);
        if (fmt0 === main) {
          if (!fmts.includes(main)) continue; // only other formats asked: reframe the main render there is
          const job = await VideoCut.exportCut({ out });
          if (!job) throw new Error('The render did not start.');
          const ev = await job.done;
          if (ev.code !== 0) throw new Error(`The ${fmt0} render failed: ${ev.error || ev.code}`);
          mainInfo = await probe(out);
        } else await reframe(mainOut, mainInfo, fmt0, out);
        const pr = fmt0 === main ? mainInfo : await probe(out);
        outs.push({ fmt: fmt0, path: out, w: pr?.w, h: pr?.h, dur: pr?.duration ? D.r2(pr.duration) : null, fps: pr?.fps, at: Date.now() });
        progress(p, 'render', i + 1, order.length);
      }
    }
    // keep renders of other formats from earlier runs (a single-format re-render replaces only its own)
    p.outputs = [...p.outputs.filter((o) => !outs.some((x) => x.fmt === o.fmt)), ...outs].sort((a, b) => p.plan.formats.indexOf(a.fmt) - p.plan.formats.indexOf(b.fmt));
    try { await makeCovers(p, dir); } catch (err) { note(p, `Covers: ${err.message}`); }
  };
  // A render reframed for another format (Video Review's export preset, blurred fill): one ffmpeg pass
  async function reframe(src, info, fmt0, out) {
    if (!info?.w) throw new Error(`The ${p0(fmt0)} copy needs the main render first.`);
    const f = D.FORMAT[fmt0];
    const { args } = VideoData.ffmpegArgs(f.preset, { w: info.w, h: info.h, fps: info.fps }, { fit: 'blur' });
    const job = await Review.startJob({ label: `Video project → ${fmt0}`, input: src, output: out, args, duration: info.duration || 0 });
    if (!job) throw new Error(`The ${fmt0} copy did not start.`);
    const ev = await job.done;
    if (ev.code !== 0) throw new Error(`The ${fmt0} copy failed: ${ev.error || ev.code}`);
    return out;
  }
  const p0 = (f) => D.FORMAT[f]?.label || f;
  // The cover: the chosen frame as a PNG at the main format, then a copy fitted to each other format
  async function makeCovers(p, dir = null) {
    dir ||= await projectDir(p);
    await openEdit(p);
    const t = p.cover?.t ?? pickCoverTime(p) ?? 0;
    const im = await VideoComp.frameImage(CutData.frameTime(CutData.frameOf(t, VideoCut.fps), VideoCut.fps), { maxW: VideoCut.frameSize().W, edit: VideoCut.edit, mime: 'image/png' });
    const img = await loadImg(im.url);
    if (!img) throw new Error('no frame');
    const files = {};
    for (const fmt0 of p.plan.formats) {
      const f = D.FORMAT[fmt0];
      const c = fmt0 === p.plan.formats[0] ? (() => { const k = document.createElement('canvas'); k.width = img.width; k.height = img.height; k.getContext('2d').drawImage(img, 0, 0); return k; })() : Capture.socialCrop(img, { w: f.w, h: f.h }, { fit: 'fit', bg: 'blur' });
      const out = join(dir, `${D.slug(p.name)}_cover_${fmt0.replace(':', 'x')}.png`);
      const b64 = c.toDataURL('image/png').split(',')[1];
      await window.hub.fs.write(out, Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0)));
      files[fmt0] = out;
      if (fmt0 === p.plan.formats[0]) p.coverThumb = small(img, 120);
    }
    p.cover = { ...(p.cover || {}), t, files };
    changed(p);
    return files;
  }

  // ---------- one beat again ----------
  // Redo a beat: its scene (a new jam) and its capture, then the edit and the review again; the render goes stale.
  async function redoBeat(p, n, { scene = true } = {}) {
    const b = p.plan.beats.find((x) => x.n === Number(n));
    if (!b) throw new Error(`No beat ${n} (the plan has ${p.plan.beats.length}).`);
    if (R) throw new Error('The project is running: ■ stop it first.');
    const steps = [];
    if (b.kind === 'lab' && scene) steps.push('scenes');
    if (['lab', 'tour', 'shot'].includes(b.kind)) steps.push('captures');
    if (p.steps.edit?.status === 'done' || p.steps.edit?.status === 'stale' || p.seq) steps.push('edit', 'review');
    b.redo = (b.redo || 0) + 1;
    if (!steps.length) steps.push('edit');
    for (const id of steps) { await run(p, { only: id, beats: ['scenes', 'captures'].includes(id) ? [b.n] : null }); if (p.status === 'error' || p.status === 'stopped') break; }
    if (p.steps.render?.status === 'done') { p.steps.render.status = 'stale'; changed(p); }
    return `Beat ${b.n} redone${b.error ? ` (⚠ ${b.error})` : ''}.`;
  }
  // Claude ⇄ Astra: who leads the next AI steps (the jams start with them, the director pass and the plan's
  // decisions are theirs; the other one reviews). The project's task text travels with every turn.
  function handoff(p, to = null) {
    p.lead = to === 'claude' || to === 'astra' ? to : other(p.lead);
    p.reviewBy = other(p.lead);
    changed(p);
    return `${NAME[p.lead]} leads the next steps of “${p.name}” (${NAME[other(p.lead)]} reviews).`;
  }
  // A step again by the other engine (decisions, the director pass, the review)
  async function takeOver(p, step) {
    const by = other(p.steps[step]?.by || p.lead);
    if (step === 'plan') return (await decide(p, { side: by })).text;
    if (step === 'review') { p.reviewBy = by; p.reviewAsk = true; await run(p, { only: 'review' }); return `${NAME[by]} reviewed it.`; }
    if (step === 'edit') { const d = await directorPass(p, { side: by }); return d ? `${NAME[d.by]}: ${d.line}` : 'No director.'; }
    if (step === 'scenes') { handoff(p, by); await run(p, { only: 'scenes' }); return `${NAME[by]} led the scenes again.`; }
    throw new Error(`${D.STEP[step]?.name || step} isn't an AI step.`);
  }

  // ---------- words ----------
  async function rewriteWords(p, { side = 'astra' } = {}) {
    const beats = p.plan.beats.filter((b) => b.words);
    const r = await ask(p, side, [`Intro · words. Rewrite the on-screen words of a ${p.plan.secs} s social video presenting Hearth (Claude and Astra chats, a Three.js Lab, a mood board, a frame-exact video editor${p.idea ? `; the owner wants: ${cap(p.idea, 100)}` : ''}).`,
      `Beats numbered 1–${p.plan.beats.length}: ${beats.map((b) => `${b.n} (${b.kind}, ${b.secs}s) “${b.words}”`).join(' · ')}`,
      'Reply one per line as "n | words" (≤ 6 words each, punchy, true to the app). Nothing else.'].join('\n'));
    if (!r) throw new Error('No answer.');
    const w = D.parseWords(r.text, p.plan.beats);
    if (!Object.keys(w).length) throw new Error('The answer had no words.');
    snapshot(p, 'plan');
    for (const [n, words] of Object.entries(w)) { const b = p.plan.beats.find((x) => x.n === Number(n)); if (b) b.words = words; }
    stale(p, 'edit');
    changed(p);
    return `${NAME[r.by]} rewrote ${Object.keys(w).length} lines.`;
  }
  // The local suggestions for a beat's words (no tokens): the area's lines, the hooks, the numbers
  function wordsFor(p, b) {
    const vars = { name: p.plan.name, ...p.plan.vars, counts: counts() };
    const area = b.kind === 'tour' || b.kind === 'shot' ? D.areaOf(b.area) : b.kind === 'lab' ? 'lab' : null;
    const out = [];
    if (area) for (let i = 0; i < 5; i += 1) out.push(D.copyFor(area, i, vars));
    if (b.kind === 'title' || b.n === 1) out.push(...D.HOOKS.map((h) => D.fill(h, vars)));
    if (b.kind === 'end') out.push(vars.name, ...D.TAGLINES, ...D.CTAS);
    if (b.kind === 'stat') out.push(...D.featureLines(counts()));
    return [...new Set(out)].slice(0, 14);
  }
  // The post's caption for a platform (to paste under the video)
  function postText(p, platform = 'instagram') {
    const P = D.POSTS.find((x) => x.id === platform) || D.POSTS[0];
    const lines = p.plan.beats.filter((b) => b.words && b.kind !== 'end' && b.kind !== 'title').map((b) => b.words);
    return D.fill(P.text, { hook: p.plan.vars?.hook || D.HOOKS[1], line: lines[0] || p.plan.vars?.tagline, lines: lines.slice(0, 3).join(', '), cta: p.plan.vars?.cta || D.CTAS[0], tags: P.tags, name: p.plan.name }).trim();
  }

  // ---------- cut-downs: "the 15 s and the 6 s" ----------
  // Each cut is its own sequence built from the same captures (nothing is filmed again), rendered in the main
  // format (all: every format).
  async function makeCuts(p, secsList = [15, 6], { all = false } = {}) {
    if (R) throw new Error('The project is running: ■ stop it first.');
    if (!p.plan.beats.some((b) => b.clip || b.shot) && p.plan.beats.some((b) => ['lab', 'tour', 'shot'].includes(b.kind))) throw new Error('Capture the beats first (▶ Make it).');
    const info = await Capture.info();
    const made = [];
    R = { p, stopped: false, step: 'render', runIds: new Set() };
    p.status = 'running'; changed(p);
    try {
      for (const want0 of secsList) {
        if (R.stopped) break;
        // 'loop': the 6 s cut that ends where it starts
        const isLoop = want0 === 'loop';
        const secs = isLoop ? 6 : Number(want0);
        const plan = { ...D.cutDown(p.plan, secs), ...(isLoop ? { loop: true } : {}) };
        const sub = { ...p, plan: { ...plan, beats: plan.beats }, music: p.music, musicFit: p.musicFit, seq: null, name: `${p.name} · ${isLoop ? 'loop' : `${secs} s`}` };
        if (p.music?.analysis) { const f = D.fitToMusic(plan.beats, p.music.analysis, p.cutMode); sub.plan.beats = f.beats; }
        activate('tool:ae', { focus: false });
        await Review.ensureMounted();
        const key = await VideoCut.newSequence(sub.name, { format: plan.formats[0] });
        sub.seq = key;
        const { edit } = buildEdit(sub);
        VideoCut.commit(edit, `Cut-down ${secs} s`);
        const dir = await projectDir(p);
        const outs = [];
        let mainInfo = null; let mainOut = null;
        for (const fmt0 of all ? plan.formats : [plan.formats[0]]) {
          if (!info.ffmpeg) break;
          const out = join(dir, `${D.slug(p.name)}_${isLoop ? 'loop' : `${secs}s`}_${fmt0.replace(':', 'x')}.mp4`);
          if (fmt0 === plan.formats[0]) {
            const job = await VideoCut.exportCut({ out });
            const ev = await job.done;
            if (ev.code !== 0) throw new Error(`The ${secs} s render failed: ${ev.error || ev.code}`);
            mainOut = out; mainInfo = await probe(out);
          } else await reframe(mainOut, mainInfo, fmt0, out);
          const pr = fmt0 === plan.formats[0] ? mainInfo : await probe(out);
          outs.push({ fmt: fmt0, path: out, dur: pr?.duration ? D.r2(pr.duration) : null, w: pr?.w, h: pr?.h });
        }
        const c = { secs, ...(isLoop ? { loop: true } : {}), seq: key, beats: plan.beats.length, outputs: outs, at: Date.now() };
        p.cuts = [...p.cuts.filter((x) => x.secs !== secs || Boolean(x.loop) !== isLoop), c].sort((a, b) => b.secs - a.secs);
        made.push(c);
        changed(p);
      }
    } finally {
      R = null; p.status = p.steps.render?.status === 'done' ? 'done' : 'planned'; changed(p);
    }
    // back to the main edit
    if (p.seq) { try { await openEdit(p); } catch { /* fine */ } }
    return made;
  }

  // ---------- more from one project ----------
  // A copy of the plan (another template / words to try): the vibe, the music and the beats' scenes come along, nothing
  // it made (captures, edit, renders) does.
  async function duplicate(p, { agentId } = {}) {
    const at = Date.now();
    const q = { ...clone(p), id: `v${at.toString(36)}`, name: `${p.name} (2)`, at, updated: at, status: 'planned', chats: [], history: [], notes: [], tokens: {}, outputs: [], cuts: [], cover: null, seq: null, review: null, director: null, coverThumb: null, sheetThumb: null, toolsChat: null };
    q.steps = { plan: { status: 'proposed', at } };
    q.plan.beats = q.plan.beats.map((b) => { const x = { ...b }; for (const k of ['clip', 'shot', 'thumb', 'review', 'error', 'status', 'at', 'redo']) delete x[k]; return x; });
    data.list.unshift(q);
    const host = hostFor(agentId);
    if (host) { const chat = Native.ensureChat(host.id, q.name); q.chatId = chat.id; q.agentId = host.id; post(q, chat, host); }
    changed(q);
    return q;
  }
  // Extras from the main render (local, ffmpeg): a GIF, a boomerang, PNG frames for After Effects, captions, an EDL,
  // the cover pinned on the board (it's your own picture, so it may go there)
  async function extra(p, kind) {
    const main = p.outputs[0]?.path;
    if (['gif', 'boomerang', 'frames'].includes(kind)) {
      if (!main) throw new Error('Render it first.');
      const r = await FrameRead.edit(main, kind === 'frames' ? 'sequence' : kind, kind === 'gif' ? { fps: 15, w: 540 } : {});
      p.extras = { ...(p.extras || {}), [kind]: r.path }; changed(p);
      return r.path;
    }
    if (kind === 'srt' || kind === 'edl') { await openEdit(p); const f = kind === 'srt' ? await VideoCut.exportCaptions() : await VideoCut.exportEdl(); if (f) { p.extras = { ...(p.extras || {}), [kind]: f }; changed(p); } return f; }
    if (kind === 'board') {
      const f = p.cover?.files?.[p.plan.formats[0]];
      if (!f) throw new Error('Make the cover first (Output › Cover).');
      const b = await boardOf(p);
      if (!b) throw new Error('No board linked.');
      await Board.addFiles([f], null, b);
      return `Cover pinned on “${b.name}”`;
    }
    throw new Error(`Extras: gif, boomerang, frames, srt, edl, board`);
  }

  // ---------- opening things ----------
  async function openOutput(path) { if (typeof CaptureView !== 'undefined') return CaptureView.open(path); activate('tool:ae'); await Review.ensureMounted(); return Review.open(path); }
  async function openTheEdit(p) { await openEdit(p); return p.seq; }
  async function folder(p) { const d = await projectDir(p); const f = p.outputs[0]?.path; if (f) window.hub.fs.reveal(f); else window.hub.fs.open?.(d); return d; }
  async function remove(p) {
    if (R?.p === p) throw new Error('It\'s running: ■ stop it first.');
    data.list = data.list.filter((x) => x !== p);
    if (p.toolsChat) toolsOff(p);
    save(true);
    for (const fn of listeners) { try { fn(null); } catch { /* fine */ } }
    return `Removed “${p.name}” from your video projects (its files and sequence stay).`;
  }

  // the status as text (for /intro status and the agents)
  function status(p) {
    const st = D.STEPS.map((s) => { const x = p.steps[s.id] || {}; return `${s.icon} ${s.name}: ${x.status || 'todo'}${x.total ? ` ${x.done}/${x.total}` : ''}${x.sub ? ` · ${x.sub}` : ''}${x.error ? ` · ⚠ ${x.error}` : ''}`; });
    const t = totals(p);
    return [`**🎬 ${p.name}** · ${D.planText(p.plan, { short: true })} · ${NAME[p.lead]} leads · tokens C ${fmt(t.claude)} · A ${fmt(t.astra)}`,
      ...st.map((l) => `- ${l}`),
      `Beats: ${p.plan.beats.map((b) => `${b.n} ${D.KINDS[b.kind].icon}${b.secs}s${b.clip || b.shot ? '✓' : ''}${b.error ? '⚠' : ''}`).join(' · ')}`,
      p.vibe?.line ? `Vibe: ${cap(p.vibe.line, 160)}` : '', p.music ? `Music: ${p.music.name}${p.music.bpm ? ` · ${p.music.bpm} bpm` : ''} · ${D.CUT_MODE[p.cutMode]?.name}` : '',
      p.outputs.length ? `Renders: ${p.outputs.map((o) => `${o.fmt} ${o.w || ''}×${o.h || ''} ${o.dur || ''}s`).join(' · ')}` : '', p.cuts.length ? `Cut-downs: ${p.cuts.map((c) => `${c.secs} s`).join(', ')}` : '',
      ...(p.notes || []).slice(-3).map((x) => `⚠ ${x}`)].filter(Boolean).join('\n');
  }

  load();
  return {
    load, save, get, find, list: () => data.list.slice(), latest, ofChat, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, changed,
    create, reopen, post, run, stop, running, current: () => R?.p || null, runningStep: () => (R ? { step: R.step, beat: R.beat } : null),
    undo, decide, replan, stale, setMusic, fitMusic, redoBeat, duplicate, extra, handoff, takeOver, directorPass, rewriteWords, wordsFor, postText, makeCuts, makeCovers, pickCoverTime,
    openOutput, openTheEdit, folder, remove, status, textOf, taskText, counts, readVibe, guess, totals, fmt, NAME, other,
    agents: { claude: claudeTalk, astra: astraTalk, video: videoDirector },
    _test: { buildEdit, statsOf, snapshot, STEP_FN, state: () => R },
  };
})();
window.Intro = Intro;
