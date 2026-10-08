// Jam: Claude and Astra take turns on one music visual in the Three.js Lab. One action, no setup: /jam [rounds]
// [idea], the 🎛 Jam chip in the Three Director's dock, or Jam.start() (the composer's collab chip).
// - A round = a build, then (except the last round) a direction. The builder is a director with the Lab's tools
//   (the Three Director; an Astra director with hub tools builds too, /director-engine), working in a fresh engine
//   session each turn. The other agent looks at one small JPEG (3 frames over the song when it plays) and answers
//   in ≤3 lines like an art director; the next build gets that direction verbatim. The lead swaps every round when
//   both can build; otherwise Claude builds and Astra directs.
// - Frugal (product rule #1): no transcript grows. Each turn is self-contained plus a one-line running summary;
//   directions are lean turns (no tools) with ≤3 lines of context; builds keep only the Lab tools (engines.js hubOnly).
// - Safe: the jam works on a copy of the open sketch; every round's whole sketch is an undo point (one click in the
//   card); a broken build is fixed first by the next one, two in a row go back to the last good round, and the jam
//   never ends broken. Astra missing or failing: Claude critiques its own builds (said once).
// - The end: both name the best round (Astra's pick settles a disagreement), it is put back, and its sliders are
//   saved into the code plus a look. The card shows each agent's tokens.
// The card is a chat message { role: 'jam' } in the Three Director's chat, drawn by cardEl (native.js messageEl).
const Jam = (() => {
  const ROUNDS = 4;
  const MAX_ROUNDS = 8;
  const AGAIN = 2;
  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n || 0));
  const cap = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clean = (t) => String(t || '').replace(/<(remember|suggest)>[\s\S]*?<\/\1>/gi, '').replace(/\n+MCP calls:[\s\S]*$/, '').trim();
  const firstLine = (t) => clean(t).split('\n').map((l) => l.replace(/^[-*#>\s]+/, '').trim()).find(Boolean) || '';
  const lines = (t, n) => clean(t).split('\n').map((l) => l.trim()).filter(Boolean).slice(0, n).join('\n');
  const NAME = { claude: 'Claude', astra: 'Astra' };

  // ---------- who plays ----------
  const natives = () => H.agents().filter((a) => a.mode === 'native');
  const builder = (engine) => natives().find((a) => a.threeTools && a.engine === engine && a.dock === 'three') || natives().find((a) => a.threeTools && a.engine === engine) || null;
  const talker = (engine) => natives().find((a) => a.engine === engine && !a.dock) || natives().find((a) => a.engine === engine) || null;
  const sides = () => ({
    claude: { key: 'claude', name: 'Claude', build: builder('claude'), talk: talker('claude') },
    astra: { key: 'astra', name: 'Astra', build: builder('codex'), talk: talker('codex') },
  });
  const hostAgent = () => natives().find((a) => a.dock === 'three') || builder('claude') || builder('codex');

  // ---------- engine turns (each one a fresh session: nothing grows) ----------
  let J = null; // the running jam: { m, chat, host, stopped, runIds, astraDown }
  const runs = new Map();
  window.hub.onEngineEvent((ev) => { const fn = runs.get(ev.chatId); if (fn) fn(ev); });
  function run(agent, text, options = {}) {
    const id = `jam-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const L = J;
    return new Promise((resolve) => {
      if (!agent) { resolve({ ok: false, error: 'No agent for this turn' }); return; }
      if (L?.stopped) { resolve({ ok: false, stopped: true, text: '' }); return; }
      L?.runIds.add(id);
      let out = '';
      const tools = [];
      // a turn that never ends (a tool stuck) is stopped after 7 minutes
      const timer = setTimeout(() => window.hub.stop(id), 7 * 60000);
      runs.set(id, (ev) => {
        if (ev.type === 'delta') { out += ev.text; return; }
        if (ev.type === 'tool') { tools.push(ev.name); return; }
        if (ev.type === 'thinking' || ev.type === 'progress') return;
        runs.delete(id);
        L?.runIds.delete(id);
        clearTimeout(timer);
        const done = ev.type === 'done';
        if (done && ev.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: agent.id, usage: ev.usage, source: 'jam' } }));
        resolve({ ok: done, stopped: ev.type === 'stopped', text: done ? (ev.text || out) : out, usage: ev.usage || null, error: ev.message || null, tools });
      });
      window.hub.send({ agentId: agent.id, chatId: id, session: {}, text, options })
        .catch((err) => runs.get(id)?.({ type: 'error', message: err.message }));
    });
  }
  const sideOf = (agent) => (agent?.engine === 'codex' ? 'astra' : 'claude');
  function spend(m, agent, r) {
    if (!r?.usage) return;
    const t = (m.tokens[sideOf(agent)] ||= { input: 0, output: 0, turns: 0 });
    t.input += r.usage.input || 0; t.output += r.usage.output || 0; t.turns += 1;
  }

  // ---------- the Lab ----------
  async function lab() {
    await ThreeLab.cmd({ show: H.surfaceIdFor?.(H.activeId) === 'tool:three' || !J });
    const d = ThreeLab.director;
    if (!d?.capture) throw new Error('The Three.js Lab did not load.');
    return d;
  }
  const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  function scaled(img, max) {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  // a small JPEG of the preview for the card (≈ 6 KB)
  async function thumbNow(d) {
    const url = await d.shot().catch(() => null);
    const img = url && await loadImg(url);
    return img ? scaled(img, 220).toDataURL('image/jpeg', 0.72) : null;
  }
  // What the director of a round sees: 3 frames over the song when it plays, else the frame now; small JPEG on disk.
  async function lookPath(m, n, d) {
    const playing = Boolean(d.media?.loaded && d.media.info?.().playing);
    let data = null;
    try {
      const r = await HubBridge.call('three_screenshot', { size: 'small', force: true, ...(playing ? { frames: 3, gap: 0.7 } : {}) });
      data = r?.ok && r.images?.[0]?.data;
    } catch { /* falls back below */ }
    if (!data) {
      const url = await d.shot().catch(() => null);
      const img = url && await loadImg(url);
      if (img) data = scaled(img, 512).toDataURL('image/jpeg', 0.8).split(',')[1];
    }
    if (!data) return { path: null, strip: false };
    return { path: await window.hub.saveAttachment(`jam-${m.id}-r${n}.jpg`, data), strip: playing };
  }
  // The versions side by side, numbered, for the final pick (one JPEG).
  async function sheetPath(m, list) {
    const imgs = (await Promise.all(list.map((R) => loadImg(R.thumb)))).map((img, i) => ({ img, n: list[i].n })).filter((x) => x.img);
    if (!imgs.length) return null;
    const w = 220; const h = Math.round(w * imgs[0].img.height / imgs[0].img.width);
    const cols = Math.min(4, imgs.length); const rows = Math.ceil(imgs.length / cols);
    const c = document.createElement('canvas');
    c.width = cols * w + (cols - 1) * 4; c.height = rows * h + (rows - 1) * 4;
    const g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
    imgs.forEach(({ img, n }, i) => {
      const x = (i % cols) * (w + 4); const y = Math.floor(i / cols) * (h + 4);
      g.drawImage(img, x, y, w, h);
      g.fillStyle = '#000b'; g.fillRect(x + 4, y + 4, 26, 24);
      g.font = '700 17px system-ui, sans-serif'; g.fillStyle = '#ffd75e'; g.fillText(String(n), x + 10, y + 22);
    });
    return window.hub.saveAttachment(`jam-${m.id}-pick.jpg`, c.toDataURL('image/jpeg', 0.8).split(',')[1]);
  }
  // One line about the song for the builder (tempo, how loud it gets), or that there is none.
  function songLine(d) {
    try {
      const i = d.media?.info?.();
      if (!i?.loaded) return 'No song loaded (the Lab plays a demo 120 bpm beat).';
      const bpm = Math.round((i.grid?.bpm || 0) * 10) / 10;
      const loud = (i.sections || []).filter((s) => s.energy === 'loud').reduce((n, s) => n + (s.end - s.start), 0);
      const energy = i.duration ? (loud / i.duration > 0.45 ? 'high energy' : loud / i.duration > 0.15 ? 'builds to drops' : 'calm') : '';
      return `Song: ${String(i.file || '').split(/[\\/]/).pop()}${bpm ? ` · ${bpm} bpm` : ''}${energy ? ` · ${energy}` : ''}${i.drops?.length ? ` · drop at ${Math.round(i.drops[0])} s` : ''}.`;
    } catch { return ''; }
  }
  const errorsOf = (rep) => (rep?.errors || []).map((e) => `${e.layer ? `[${e.layer}] ` : ''}${e.line ? `line ${e.line}: ` : ''}${cap(e.message, 160)}`).slice(0, 3);

  // ---------- prompts (self-contained; the running summary is one line) ----------
  function summary(m) {
    const s = m.list.filter((R) => R.build).map((R) => `R${R.n} ${NAME[R.build.by]}: ${cap(R.build.text, 60)}${R.dir ? ` → ${NAME[R.dir.by]}: ${cap(R.dir.text, 50)}` : ''}`).join(' · ');
    return s.length > 240 ? `…${s.slice(-239)}` : s;
  }
  function buildPrompt(m, R, lead, d, prev) {
    const other = NAME[lead.key === 'claude' ? 'astra' : 'claude'];
    const out = [`Jam · round ${R.n}/${m.total} · you build. A jam with ${other}: you take turns on one music visual in the Three.js Lab.`];
    out.push(m.idea ? `Idea: ${m.idea}` : 'No idea given: pick one bold idea that fits the song and the open sketch, and start your reply with "Idea: <a few words> —".');
    const song = songLine(d);
    if (song) out.push(song);
    const sum = summary(m);
    if (sum) out.push(`So far: ${sum}`);
    if (prev?.errors?.length && prev.reverted == null) out.push(`The last build left errors, fix them first: ${prev.errors.join(' | ')}`);
    if (prev?.dir) out.push(`${NAME[prev.dir.by]}'s direction (your art director this round; apply it):\n${prev.dir.text}`);
    else if (R.n === 1) out.push(`Work on the open sketch "${m.sketch || 'Jam'}" (a copy of the owner's: change it or replace it freely).`);
    out.push('Use your Lab tools on the open sketch, keep the main knobs as tweak() sliders, check one small screenshot, fix errors, ask nothing. Reply with one short line: what you changed.');
    return out.join('\n');
  }
  function directPrompt(m, R, critic, look) {
    const self = critic.key === R.build.by;
    return [
      `Jam · round ${R.n}/${m.total} · you direct. ${self ? 'You built this yourself: judge it like a strict art director' : `You are the art director; ${NAME[R.build.by]} builds`} (a music visual in a Three.js Lab${m.idea ? `: ${cap(m.idea, 80)}` : ''}).`,
      `Just done: ${cap(R.build.text, 160)} The picture: ${look.strip ? '3 frames over the song, left to right' : 'the frame now'}.`,
      'Reply with at most 3 short lines: one bold, concrete change to push and one thing to cut (color, motion, beat sync, composition). No code, no praise.',
    ].join('\n');
  }
  const pickPrompt = (m, list) => [
    `Jam · final pick. The picture shows the jam's versions numbered ${list[0].n}–${list.at(-1).n}${list.length < list.at(-1).n - list[0].n + 1 ? ' (broken ones left out)' : ''}${m.idea ? ` (idea: ${cap(m.idea, 80)})` : ''}.`,
    'Reply with just the best number and up to 8 words why, like "3: cleanest beat sync".',
  ].join('\n');

  // ---------- the jam ----------
  function leadOf(n, S) {
    const both = S.claude.build && S.astra.build && !J.astraDown;
    if (both) return n % 2 ? S.claude : S.astra;
    return S.claude.build ? S.claude : S.astra;
  }
  function criticOf(lead, S) {
    const other = lead.key === 'claude' ? S.astra : S.claude;
    if (other.talk && !(other.key === 'astra' && J.astraDown)) return other;
    return lead.talk ? lead : null;
  }
  function noteOnce(m, text) { if (!m.notes.includes(text)) m.notes.push(text); }

  // The jam's sketch is the one open (you, or switching chats, may have opened another meanwhile).
  async function onJamSketch(m, d) {
    if (!m.sketchId || d.capture().sketchId === m.sketchId) return;
    d.openSketch(m.sketchId);
    await sleep(1200);
    if (d.capture().sketchId !== m.sketchId) await putBack(m, m.good ?? 0, d);
  }
  async function roundOf(n) {
    const { m } = J;
    const d = await lab();
    await onJamSketch(m, d);
    const S = sides();
    const lead = leadOf(n, S);
    const prev = m.list.at(-1);
    const R = { n, lead: lead.key, status: 'building', at: Date.now() };
    m.list.push(R);
    badge(`Jam · round ${n}/${m.total} · ${lead.name} building`);
    paint(m);
    if (typeof ThreeDirector !== 'undefined') ThreeDirector.newTurn?.(); // fresh screenshot / read caches
    const b = await run(lead.build, buildPrompt(m, R, lead, d, prev), { hubOnly: true });
    spend(m, lead.build, b);
    if (b.stopped || J.stopped) { R.status = 'stopped'; R.build = { by: lead.key, text: 'stopped' }; return; }
    let text = firstLine(b.text);
    const idea = !m.idea && text.match(/^Idea:\s*(.+?)\s+[—–-]+\s*(.*)$/i);
    if (idea) { m.idea = cap(idea[1], 80); text = idea[2] || text; }
    R.build = { by: lead.key, text: b.ok ? cap(text || 'done', 200) : `didn't finish: ${cap(b.error, 160)}`, ok: b.ok, tools: b.tools.length };
    if (!b.ok && lead.key === 'astra') { J.astraDown = true; noteOnce(m, `Astra couldn't build (${cap(b.error, 80)}): Claude builds from now on.`); }
    await sleep(700);
    const rep = d.report();
    R.errors = errorsOf(rep);
    R.ok = !R.errors.length;
    R.snap = d.capture();
    R.thumb = await thumbNow(d);
    if (R.ok) m.good = n;
    else if (prev && !prev.ok) {
      // two broken builds in a row: back to the last good round before going on
      await putBack(m, m.good ?? 0, d);
      R.reverted = m.good ?? 0;
      R.ok = false;
    }
    R.status = 'built';
    save(); paint(m);
    if (n >= m.total || !R.ok) { R.status = 'done'; return; } // a broken build gets no direction: the next one fixes it
    await directOf(m, R, lead, S, d);
    R.status = 'done';
  }
  async function directOf(m, R, lead, S, d) {
    let critic = criticOf(lead, S);
    if (!critic) return;
    await onJamSketch(m, d);
    const look = await lookPath(m, R.n, d);
    const ask = async (c) => {
      badge(`Jam · round ${R.n}/${m.total} · ${c.name} directing`);
      R.status = 'directing'; R.dir = { by: c.key, text: '…', self: c.key === lead.key }; paint(m);
      const r = await run(c.talk, directPrompt(m, R, c, look), { lean: true, images: look.path ? [look.path] : [], ...(c.key === 'astra' ? { effort: 'low' } : {}) });
      spend(m, c.talk, r);
      return r;
    };
    let r = await ask(critic);
    if (!r.ok && !r.stopped && !J.stopped && critic.key === 'astra') {
      J.astraDown = true;
      noteOnce(m, `Astra didn't answer (${cap(r.error, 80)}): Claude critiques its own builds with a screenshot from here.`);
      critic = S.claude.talk ? S.claude : null;
      if (critic) r = await ask(critic);
    }
    if (r.ok) R.dir = { by: critic.key, text: cap(lines(r.text, 3), 600), self: critic.key === lead.key };
    else delete R.dir;
  }
  async function putBack(m, n, d) {
    const snap = n === 0 ? m.start?.snap : m.list.find((R) => R.n === n)?.snap;
    if (!snap) throw new Error(`No version for round ${n}.`);
    return (d || await lab()).restore({ ...snap, sketchId: m.sketchId || snap.sketchId, sketch: m.sketch || snap.sketch }, { wait: 1.2 });
  }
  async function keepSaved(m) {
    try {
      const c = await ThreeLab.cmd({ show: false });
      c.save?.();
      const name = c.saveLook?.(`Jam ${cap(m.idea || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 28)}`);
      m.saved = { look: typeof name === 'string' ? name : 'saved', at: Date.now() };
    } catch (err) { m.saved = { error: err.message }; }
  }
  async function finale() {
    const { m } = J;
    const d = await lab();
    const good = m.list.filter((R) => R.ok && R.thumb && R.snap);
    m.phase = 'picking';
    badge('Jam · picking the best');
    paint(m);
    if (!good.length) {
      m.best = null;
      if (errorsOf(d.report()).length) await putBack(m, 0, d);
      noteOnce(m, 'No build ran cleanly, so the Lab is back where the jam started.');
      return;
    }
    let best = good.at(-1).n; let why = 'the only good version';
    if (good.length > 1) {
      const sheet = await sheetPath(m, good);
      const S = sides();
      const judges = [S.claude.talk, J.astraDown ? null : S.astra.talk].filter(Boolean);
      const answers = await Promise.all(judges.map((a) => run(a, pickPrompt(m, good), { lean: true, images: sheet ? [sheet] : [], ...(a.engine === 'codex' ? { effort: 'low' } : {}) }).then((r) => { spend(m, a, r); return [sideOf(a), r]; })));
      const picks = {};
      for (const [k, r] of answers) {
        const mm = r.ok && clean(r.text).match(/(\d+)\s*[:.)-]?\s*(.*)/);
        if (mm && good.some((R) => R.n === Number(mm[1]))) picks[k] = { n: Number(mm[1]), why: cap(mm[2], 60) };
      }
      m.picks = picks;
      const p = picks.claude && picks.astra && picks.claude.n === picks.astra.n ? { ...picks.astra, both: true } : picks.astra || picks.claude;
      if (p) { best = p.n; why = p.both ? `both picked it: ${p.why || picks.claude.why}` : `${picks.astra ? 'Astra' : 'Claude'}'s pick${picks.claude && picks.astra ? ` (Claude said ${picks.claude.n})` : ''}: ${p.why}`; } else why = 'the last good version';
    }
    if (J.stopped) return;
    m.best = { n: best, why };
    const now = d.capture();
    const want = m.list.find((R) => R.n === best);
    if (JSON.stringify(now.layers.map((L) => L.code)) !== JSON.stringify(want.snap.layers.map((L) => L.code))) await putBack(m, best, d);
    await keepSaved(m);
  }
  async function begin(m, chat, host) {
    J = { m, chat, host, stopped: false, runIds: new Set(), astraDown: false };
    m.status = 'running';
    save(); Native.refresh(host.id, { keepScroll: false });
    const S = sides();
    if (!S.astra.talk && !S.astra.build) noteOnce(m, 'No Astra agent here: Claude critiques its own builds with a screenshot.');
    try {
      for (let n = m.list.length + 1; n <= m.total && !J.stopped; n += 1) await roundOf(n);
      if (!J.stopped) await finale();
      m.status = J.stopped ? 'stopped' : 'done';
    } catch (err) {
      m.status = 'error';
      m.error = err.message;
    }
    await settle(m);
  }
  // The end, however it ended: never leave the Lab broken, text for the chat's context, the badge off.
  async function settle(m) {
    m.phase = null;
    try {
      const d = ThreeLab.director;
      if (d && d.capture().sketchId === m.sketchId && errorsOf(d.report()).length && (m.good != null || m.start)) {
        await putBack(m, m.good ?? 0, d);
        noteOnce(m, `The Lab had errors at the end, so it went back to ${m.good ? `round ${m.good}` : 'where the jam started'}.`);
      }
    } catch { /* the Lab closed */ }
    m.ms = Date.now() - m.at;
    m.text = textOf(m);
    const host = J?.host;
    const chat = J?.chat;
    J = null;
    badge(null);
    if (chat) { chat.updatedAt = Date.now(); Native.save(chat); }
    paint(m, true);
    const t = totalOf(m);
    if (m.status === 'done') {
      toast(`Jam finished${m.best ? ` · round ${m.best.n} kept` : ''} · Claude ${fmt(t.claude)} · Astra ${fmt(t.astra)} tokens`, { timeout: 4000 });
      if (host) AppUI.replyFinished?.(host.id, Native.chatOf(host.id)?.id, m.text);
    }
  }
  const totalOf = (m) => ({ claude: (m.tokens.claude?.input || 0) + (m.tokens.claude?.output || 0), astra: (m.tokens.astra?.input || 0) + (m.tokens.astra?.output || 0) });
  // What the director's next message sees of the jam (short: chats carry it as context).
  const textOf = (m) => `Jam with Astra${m.idea ? ` on “${m.idea}”` : ''}: ${m.list.length} round${m.list.length === 1 ? '' : 's'}${m.best ? `, round ${m.best.n} kept (${m.best.why})` : ''}${m.status === 'stopped' ? ', stopped' : ''}. ${m.list.filter((R) => R.build).map((R) => `R${R.n} ${NAME[R.build.by]}: ${cap(R.build.text, 70)}`).join('; ')}`;
  const save = (m = J?.m) => {
    const chat = J?.chat || (m && hostChatOf(m));
    if (!chat) return;
    chat.updatedAt = Date.now();
    Native.save(chat);
  };
  const hostChatOf = (m) => { const a = hostAgent(); const c = a && Native.chatOf(a.id); return c?.messages.includes(m) ? c : null; };

  // Starts a jam. opts: { idea, rounds, agentId (where it was asked, for the reply) }.
  let starting = false;
  async function start(opts = {}) {
    if (J || starting) throw new Error('A jam is already running: Esc or /jam stop ends it.');
    starting = true;
    try { return await prepare(opts); } finally { starting = false; }
  }
  async function prepare({ idea = '', rounds = ROUNDS } = {}) {
    let host = hostAgent();
    if (!host) {
      // no setup: the Three Director is made on the spot
      await Commands.exec('/director-setup', H.claudeAgent?.()?.id);
      for (let i = 0; i < 30 && !(host = hostAgent()); i += 1) await sleep(100);
      if (!host) throw new Error('The jam needs the Three Director: /director-setup makes it.');
    }
    if (Native.pendingFor?.(host.id)) throw new Error(`${host.name} is answering a message: start the jam when it's done.`);
    const d = await lab();
    Tools.openDock?.('three');
    const chat = Native.ensureChat(host.id, 'Jam');
    const at = Date.now();
    const m = { role: 'jam', id: `j${at.toString(36)}`, idea: cap(idea, 200), total: Math.max(1, Math.min(MAX_ROUNDS, Math.round(rounds) || ROUNDS)), list: [], status: 'running', at, tokens: {}, notes: [], text: '' };
    // the jam works on its own copy of the open sketch; the owner's stays as it was
    const before = d.capture();
    m.start = { snap: before, thumb: await thumbNow(d), from: before.sketch };
    m.sketch = `Jam · ${cap(idea || before.sketch || 'visual', 40)}`;
    await d.restore(before, { asNew: m.sketch, wait: 1.2 });
    m.sketchId = d.capture().sketchId;
    chat.messages.push({ role: 'user', text: `/jam ${m.total !== ROUNDS ? `${m.total} ` : ''}${idea}`.trim(), at, jam: true });
    chat.messages.push(m);
    J = null;
    begin(m, chat, host);
    return m;
  }
  // Two more rounds on the latest jam's result (or n).
  async function again(n = AGAIN) {
    if (J || starting) throw new Error('A jam is running: wait for it, or Esc first.');
    const host = hostAgent();
    const chat = host && Native.chatOf(host.id);
    const m = chat && [...chat.messages].reverse().find((x) => x.role === 'jam');
    if (!m) return start({ rounds: n });
    const d = await lab();
    // continue from what the Lab shows when it is the jam's sketch, else from the kept round
    if (d.capture().sketchId !== m.sketchId) await putBack(m, m.best?.n ?? m.good ?? 0, d);
    m.total = Math.min(m.list.length + MAX_ROUNDS, m.list.length + n);
    m.best = null; m.picks = null; m.saved = null;
    Tools.openDock?.('three');
    begin(m, chat, host);
    return m;
  }
  function stop() {
    if (!J) return false;
    J.stopped = true;
    for (const id of J.runIds) window.hub.stop(id);
    badge('Jam · stopping…');
    return true;
  }
  // Puts a round's version back (0 = where the jam started), with its sliders saved and a look.
  async function keep(n, m = latest()) {
    if (J) throw new Error('Stop the jam first (Esc), then pick a round.');
    if (!m) throw new Error('No jam yet: /jam starts one.');
    const R = n === 0 ? { n: 0, snap: m.start?.snap } : m.list.find((x) => x.n === n);
    if (!R?.snap) throw new Error(`No round ${n} in the last jam (it has ${m.list.length}).`);
    await putBack(m, n);
    m.best = { n, why: 'kept by you' };
    if (n > 0) await keepSaved(m);
    m.text = textOf(m);
    save(m); paint(m, true);
    return n === 0 ? 'Back to where the jam started.' : `Round ${n} is back in the Lab${m.saved?.look ? `, sliders saved and look “${m.saved.look}”` : ''}.`;
  }
  const latest = () => { const a = hostAgent(); return [...(Native.chatOf(a?.id || '')?.messages || [])].reverse().find((x) => x.role === 'jam') || null; };

  // ---------- the Lab badge ----------
  let badgeEl = null;
  function badge(text) {
    if (!text) { badgeEl?.remove(); badgeEl = null; return; }
    const host = document.querySelector('.three-stats')?.parentElement;
    if (!host) return;
    if (!badgeEl) {
      badgeEl = el('div', { class: 'jam-badge', title: 'Claude and Astra are jamming on this sketch · click: show the jam · Esc stops it' },
        el('span', { class: 'jam-badge-dot' }), el('span', { class: 'jam-badge-text' }),
        el('button', { type: 'button', class: 'jam-badge-stop', text: '■', title: 'Stop the jam (Esc)', on: { click: (e) => { e.stopPropagation(); stop(); } } }));
      badgeEl.addEventListener('click', () => { Tools.openDock?.('three'); document.querySelector(`.jam-card[data-jid="${J?.m.id}"]`)?.scrollIntoView({ block: 'nearest' }); });
    }
    if (badgeEl.parentElement !== host) host.append(badgeEl);
    badgeEl.querySelector('.jam-badge-text').textContent = text;
  }

  // ---------- the card ----------
  const openRows = new Set(); // "jamId:round" rows unfolded by the user
  const paintTimers = new Map();
  function paint(m, now = false) {
    if (!m) return;
    if (!now) {
      if (paintTimers.has(m.id)) return;
      paintTimers.set(m.id, setTimeout(() => { paintTimers.delete(m.id); paint(m, true); }, 80));
      return;
    }
    const node = document.querySelector(`.jam-card[data-jid="${m.id}"]`);
    if (node) node.replaceWith(cardEl(m, H.agent(node.dataset.host), Number(node.dataset.index)));
  }
  const thumbEl = (src, title) => (src ? el('img', { class: 'jam-thumb', src, alt: '', title }) : el('span', { class: 'jam-thumb none', title: 'no picture' }));
  function cardEl(m, agent, index) {
    const running = J?.m === m;
    if (m.status === 'running' && !running) m.status = 'stopped'; // the app closed mid-jam
    const t = totalOf(m);
    const act = (label, title, fn, cls = '') => el('button', { type: 'button', class: `msg-act ${cls}`, text: label, title, on: { click: (e) => { e.stopPropagation(); Promise.resolve(fn(e)).then((r) => { if (typeof r === 'string') toast(r, { timeout: 2500 }); }, (err) => toast(err.message, { type: 'error' })); } } });
    const cur = m.list.at(-1);
    const state = running
      ? (m.phase === 'picking' ? 'picking the best…' : cur ? `round ${cur.n}/${m.total} · ${cur.status === 'directing' && cur.dir ? `${NAME[cur.dir.by]} directing` : `${NAME[cur.lead]} building`}` : 'starting…')
      : m.status === 'done' ? `${m.list.length} rounds` : m.status === 'error' ? `stopped: ${cap(m.error, 60)}` : 'stopped';
    const head = el('div', { class: 'jam-head' },
      el('span', { class: 'jam-title', text: '🎛 Jam' }),
      el('span', { class: 'jam-idea', text: m.idea || 'the agents pick the idea', title: m.idea || '' }),
      el('span', { class: 'spacer' }),
      el('span', { class: `jam-state${running ? ' live' : ''}`, text: state }),
      el('span', { class: 'jam-tok', title: `Tokens: Claude ${(m.tokens.claude?.input || 0).toLocaleString()} in · ${(m.tokens.claude?.output || 0).toLocaleString()} out · Astra ${(m.tokens.astra?.input || 0).toLocaleString()} in · ${(m.tokens.astra?.output || 0).toLocaleString()} out`, text: `C ${fmt(t.claude)} · A ${fmt(t.astra)}` }),
      running ? act('■', 'Stop the jam (Esc)', () => stop(), 'jam-stop') : null);
    const card = el('div', { class: `jam-card ${m.status}`, dataset: { jid: m.id, host: agent?.id || '', index: String(index ?? '') } }, head);
    const rows = el('div', { class: 'jam-rows' });
    const back = (n) => (running ? null : act('↺', n === 0 ? 'Go back to the sketch as it was before the jam' : `Go back to round ${n}'s version (sliders saved + a look)`, () => keep(n, m), 'jam-back'));
    if (m.start) rows.append(el('div', { class: 'jam-row start' }, thumbEl(m.start.thumb, 'Before the jam'), el('span', { class: 'jam-line hint', text: `Start: a copy of “${cap(m.start.from || 'the open sketch', 40)}”` }), back(0)));
    for (const R of m.list) {
      const key = `${m.id}:${R.n}`;
      const open = openRows.has(key) || (running && R === cur);
      const best = m.best?.n === R.n;
      const line = R.build ? `${NAME[R.build.by]} · ${R.build.text}` : `${NAME[R.lead]} is building…`;
      const row = el('div', { class: `jam-row${R.ok === false ? ' broken' : ''}${best ? ' best' : ''}${open ? ' open' : ''}`, title: open ? 'Fold' : 'Unfold' },
        thumbEl(R.thumb, `Round ${R.n}`),
        el('span', { class: 'jam-n', text: best ? '★' : String(R.n) }),
        el('span', { class: 'jam-line', text: line }),
        R.snap ? back(R.n) : null);
      row.addEventListener('click', () => { if (openRows.has(key)) openRows.delete(key); else openRows.add(key); paint(m, true); });
      rows.append(row);
      const more = [];
      if (R.errors?.length) more.push(el('div', { class: 'jam-err', text: `⚠ ${R.errors.join(' · ')}${R.reverted != null ? ` → back to ${R.reverted ? `round ${R.reverted}` : 'the start'}` : ' → the next build fixes it first'}` }));
      if (R.dir) more.push(el('div', { class: `jam-dir by-${R.dir.by}` }, el('b', { text: `${NAME[R.dir.by]}${R.dir.self ? ' (own critique)' : ''} → ` }), R.dir.text));
      if (more.length) rows.append(el('div', { class: `jam-more${open ? '' : ' folded'}` }, ...(open ? more : [el('span', { class: 'hint', text: R.dir ? `${NAME[R.dir.by]}: ${cap(R.dir.text, 90)}` : cap(R.errors?.join(' · '), 90) })])));
    }
    card.append(rows);
    for (const n of m.notes || []) card.append(el('div', { class: 'jam-note hint', text: n }));
    if (!running && m.status !== 'running') {
      const foot = el('div', { class: 'jam-foot' });
      if (m.best) foot.append(el('span', { class: 'jam-best', text: `★ Round ${m.best.n} · ${m.best.why}${m.saved?.look ? ` · sliders saved, look “${m.saved.look}”` : ''}` }));
      foot.append(el('span', { class: 'spacer' }),
        el('span', { class: 'hint', text: `Claude ${fmt(t.claude)} · Astra ${fmt(t.astra)} tokens` }),
        act(`＋${AGAIN} rounds`, `Two more rounds on this result (/jam again)`, () => again().then(() => null), 'primary-act'));
      card.append(foot);
    }
    return card;
  }

  // ---------- commands ----------
  function parseArgs(args) {
    const w = String(args || '').trim();
    const m = w.match(/^(\d+)\s*(?:rounds?)?\s*([\s\S]*)$/i);
    return m ? { rounds: Number(m[1]), idea: m[2].trim() } : { rounds: ROUNDS, idea: w };
  }
  if (!Commands.get('jam')) {
    Commands.register({
      name: 'jam', area: 'Collab', args: '[rounds] [idea] | stop | again | keep <round>',
      desc: 'Claude and Astra take turns making a music visual in the Lab (4 rounds; Esc stops)',
      examples: ['/jam', '/jam neon tunnel that breathes with the bass', '/jam 6 liquid chrome on the drop', '/jam again', '/jam keep 2', '/jam stop'],
      keywords: 'claude astra together turns bounce collaborate visual art director jam session',
      complete: (a) => {
        const w = a.trim().toLowerCase();
        if (/^keep\b/.test(w)) return (latest()?.list || []).filter((R) => R.snap).map((R) => ({ value: `keep ${R.n}`, hint: cap(R.build?.text, 50) }));
        return [{ value: 'stop', hint: 'end the jam now (Esc)' }, { value: 'again', hint: `${AGAIN} more rounds on the result` }, { value: 'keep ', hint: 'put a round\'s version back' }, { value: '6 ', hint: 'more rounds, then your idea' }]
          .filter((x) => !w || x.value.startsWith(w));
      },
      run: async (args, ctx) => {
        const w = String(args || '').trim();
        if (/^stop$/i.test(w)) return stop() ? 'Stopping the jam…' : 'No jam is running.';
        if (/^again$/i.test(w) || /^again\s+\d+$/i.test(w)) { await again(Number(w.split(/\s+/)[1]) || AGAIN); return null; }
        if (/^keep\b/i.test(w)) { const n = Number(w.split(/\s+/)[1]); if (!Number.isFinite(n)) return 'Which round? /jam keep 2'; return keep(n); }
        const { rounds, idea } = parseArgs(w);
        const m = await start({ idea, rounds });
        const host = hostAgent();
        return ctx?.agentId && host && ctx.agentId !== host.id ? `Jamming in the ${host.name} chat next to the Lab (${m.total} rounds).` : null;
      },
    });
  }
  // Esc stops a running jam (in the Lab or its chat; not while a dialog or menu is open).
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !J || e.defaultPrevented || document.querySelector('dialog[open]') || document.getElementById('menu')?.hidden === false) return;
    const where = H.surfaceIdFor?.(H.activeId);
    if (where !== 'tool:three' && H.activeId !== J.host?.id) return;
    stop();
    toast('Stopping the jam', { timeout: 1200 });
  });
  queueMicrotask(() => { if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Jam: Claude and Astra make a visual together', () => start().catch((err) => toast(err.message, { type: 'error' }))); });

  return {
    label: '🎛 Jam', desc: 'Claude and Astra take turns making a visual (4 rounds)',
    start: (idea = '', opts = {}) => start({ idea: typeof idea === 'string' ? idea : '', ...(typeof idea === 'object' ? idea : {}), ...opts }),
    stop, again, keep, running: () => Boolean(J), latest, cardEl,
    _test: { parseArgs, buildPrompt, directPrompt, pickPrompt, summary, sides, state: () => J },
  };
})();
window.Jam = Jam;
