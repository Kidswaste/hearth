// Astra: the Codex (ChatGPT login) chat agent as a full partner to Claude, and the ways the two work together.
// - Per-chat engine options (model, effort, web search, persona…) reach the engine through Native's send()
//   (beforeSend), and the collaboration's outcome is carried into the host chat's next message, once.
// - Collaborations run both engines in the background with their own engine sessions, so later rounds send
//   only what's new (frugal): Duo (side by side), Relay (one drafts, the other improves), Critique (draft →
//   review → revision), Debate (rounds, then one merged answer), Council (several seats, a chair sums up),
//   Compare (same task, different models or agents). Each is a "collab" message drawn as one compact card.
// - Handoff continues a chat with the other agent from a compact summary.
// - Everything is a chat command (area Astra / Collab) and the composer's ⚇ chip picks a collab mode.
const Astra = (() => {
  const fmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n || 0));
  const MODELS = { codex: ['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'], claude: ['opus', 'sonnet', 'haiku', 'fable'] };
  const EFFORTS = { codex: ['minimal', 'low', 'medium', 'high', 'xhigh'], claude: ['low', 'medium', 'high', 'xhigh', 'max'] };
  const WEB = ['off', 'cached', 'live'];
  const REMEMBER = /<remember>([\s\S]*?)<\/remember>/gi;
  const SUGGEST = /<suggest>([\s\S]*?)<\/suggest>/gi;
  // Text without memory / suggestion tags, including a tag that is still streaming in.
  const clean = (t) => String(t || '').replace(REMEMBER, '').replace(SUGGEST, '').replace(/<(remember|suggest)>[\s\S]*$/i, '').replace(/<(rem|sug)[a-z]*$/i, '').trim();
  // (CSS variables such as --seat go in a style attribute: el()'s style object can't set custom properties)
  const cap = (t, n) => { const s = String(t || ''); return s.length > n ? `${s.slice(0, n)}…` : s; };

  // Personas (presets): per chat with /astra-persona, as seats in a council (claude@skeptic), or as an agent's default.
  const PERSONAS = {
    coder: { label: 'Coder', text: 'You are a senior software engineer. Give working, minimal code with short explanations; point out edge cases and how to test it.' },
    reviewer: { label: 'Reviewer', text: 'You are a meticulous reviewer. Find the real problems (bugs, unclear parts, risks) ranked by importance and say how to fix each. No praise padding.' },
    writer: { label: 'Writer', text: 'You are a skilled writer and editor. Write clearly and vividly, match the requested tone, and keep it tight.' },
    researcher: { label: 'Researcher', text: 'You are a careful researcher. Separate facts from guesses, say how sure you are, compare options with pros and cons, and say where facts come from.' },
    director: { label: 'Director helper', text: 'You help direct music-driven Three.js visuals and short videos: think in shots, motion, color, timing on the beat and readability at 9:16; give concrete visual suggestions the director can build.' },
    skeptic: { label: 'Skeptic', text: 'You are a constructive skeptic: challenge assumptions, look for what could go wrong, and propose safer alternatives.' },
    teacher: { label: 'Teacher', text: 'You explain step by step with simple examples, avoid jargon, and check the key idea landed.' },
    brainstorm: { label: 'Brainstormer', text: 'You brainstorm boldly: many varied, short ideas, then mark the 2–3 most promising and why.' },
    planner: { label: 'Planner', text: 'You turn goals into a short ordered plan: next actions, risks, and what "done" looks like.' },
    concise: { label: 'Concise', text: 'Answer as briefly as possible: the answer first, no preamble, bullets over prose.' },
    translator: { label: 'Translator', text: 'You translate faithfully and naturally, keeping tone and formatting, and flag ambiguous phrases.' },
    product: { label: 'Product designer', text: 'You think like a product designer: user needs, the simplest useful version, trade-offs, and what to measure.' },
    debugger: { label: 'Debugger', text: 'You debug methodically: hypotheses ranked by likelihood, the quickest check for each, then the fix.' },
    shader: { label: 'Shader artist', text: 'You are a graphics expert (GLSL, three.js): visually striking, performance-aware, and you explain the uniforms worth tweaking.' },
  };
  // Effort / verbosity bundles for /astra-preset (the model stays as it is).
  const PRESETS = {
    frugal: { label: 'Frugal', effort: 'minimal', verbosity: 'low', desc: 'fewest tokens: minimal reasoning, short answers' },
    fast: { label: 'Fast', effort: 'low', verbosity: 'low', desc: 'quick answers' },
    balanced: { label: 'Balanced', effort: 'medium', verbosity: null, desc: 'medium reasoning' },
    deep: { label: 'Deep', effort: 'high', verbosity: null, desc: 'careful reasoning (Astra\'s default)' },
    max: { label: 'Max', effort: 'xhigh', verbosity: 'high', desc: 'the most reasoning and detail (most tokens)' },
  };
  const MODES = {
    duo: { icon: '⚇', label: 'Duo', desc: 'both answer side by side' },
    relay: { icon: '⇄', label: 'Relay', desc: 'one drafts, the other improves it' },
    critique: { icon: '✎', label: 'Critique', desc: 'one drafts, the other reviews, the first revises' },
    debate: { icon: '⚔', label: 'Debate', desc: 'rounds of answers, then one merged answer' },
    council: { icon: '◎', label: 'Council', desc: 'several seats answer, a chair sums up' },
    compare: { icon: '⚖', label: 'Compare', desc: 'same task, different models or agents' },
  };

  // ---------- agents ----------
  const natives = () => H.agents().filter((a) => a.mode === 'native');
  const astra = () => natives().find((a) => a.engine === 'codex' && /astra/i.test(a.name) && !a.dock) || natives().find((a) => a.engine === 'codex' && !a.dock) || natives().find((a) => a.engine === 'codex');
  const claude = () => natives().find((a) => a.engine === 'claude' && !a.dock) || natives().find((a) => a.engine === 'claude');
  const partner = (agent) => Native.partnerOf?.(agent) || (agent?.engine === 'codex' ? claude() : astra());
  const engineName = (agent) => (agent?.engine === 'codex' ? 'Astra' : 'Claude');
  // "claude", "astra", "c", "a", "gpt", "codex", an agent id or name, "me" (this chat's agent).
  function findAgent(word, hostId) {
    const w = String(word || '').trim().toLowerCase();
    if (!w) return null;
    if (['me', 'this', 'here', 'host'].includes(w)) return H.agent(hostId);
    if (['claude', 'c', 'anthropic'].includes(w)) return claude();
    if (['astra', 'a', 'gpt', 'chatgpt', 'codex', 'openai'].includes(w)) return astra();
    return natives().find((a) => a.id.toLowerCase() === w) || natives().find((a) => a.name.toLowerCase() === w)
      || natives().find((a) => a.name.toLowerCase().startsWith(w)) || null;
  }
  // A seat: "astra", "astra:gpt-6-luna", "claude@skeptic", "astra:gpt-6-sol@coder", "astra~low" (effort), or a bare persona ("skeptic").
  function parseSeat(word, hostId, i = 0) {
    const m = String(word).trim().match(/^([^:@~]+)?(?::([^@~]+))?(?:@([^~]+))?(?:~(\w+))?$/);
    if (!m) return null;
    let agent = findAgent(m[1], hostId);
    let persona = m[3] ? m[3].toLowerCase() : null;
    if (!agent && m[1] && PERSONAS[m[1].toLowerCase()]) { persona = m[1].toLowerCase(); agent = i % 2 ? astra() : claude(); }
    if (!agent) return null;
    const effort = m[4] && (EFFORTS[agent.engine] || []).includes(m[4].toLowerCase()) ? m[4].toLowerCase() : null;
    return seatOf(agent, { model: m[2] || null, persona, effort });
  }
  function seatOf(agent, { model = null, persona = null, effort = null } = {}) {
    const p = persona && PERSONAS[persona];
    return {
      ...(effort ? { effort } : {}),
      agentId: agent.id, name: agent.name, engine: agent.engine, color: agent.color || (agent.engine === 'codex' ? '#10a37f' : '#d97757'),
      model: model || null, persona: persona || null,
      label: `${agent.name}${model ? ` · ${model}` : ''}${effort ? ` ~${effort}` : ''}${p ? ` (${p.label})` : persona ? ` (${persona})` : ''}`,
    };
  }
  const personaText = (agent, key) => {
    const p = PERSONAS[key];
    if (!p && !key) return null;
    return `You are ${agent?.name || 'an assistant'}, chatting with the user in their personal desktop app. ${p ? p.text : key} Use Markdown when it helps.`;
  };

  // ---------- running engines in the background ----------
  const runs = new Map(); // engine chat id -> event handler
  window.hub.onEngineEvent((ev) => { const fn = runs.get(ev.chatId); if (fn) fn(ev); });
  // One turn of one seat. Resolves { ok, text, usage, ms, session, error, stopped }.
  function call(seat, text, { session = {}, images = [], live = null, onText = null } = {}) {
    const id = `collab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const agent = H.agent(seat.agentId);
    live?.runIds.add(id);
    return new Promise((resolve) => {
      if (live?.stopped) { resolve({ ok: false, stopped: true, text: '', session }); return; }
      const started = Date.now();
      let out = '';
      let thinking = '';
      const tools = [];
      runs.set(id, (ev) => {
        if (ev.type === 'delta') { out += ev.text; onText?.(out); return; }
        if (ev.type === 'thinking') { thinking += ev.text; return; }
        if (ev.type === 'tool') { tools.push(ev.name); return; }
        if (ev.type === 'progress') return;
        runs.delete(id);
        live?.runIds.delete(id);
        const done = ev.type === 'done';
        if (done && ev.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: seat.agentId, usage: ev.usage, source: 'collab' } }));
        resolve({ ok: done, stopped: ev.type === 'stopped', text: done ? (ev.text || out) : out, usage: ev.usage || null, error: ev.message || null, needsLogin: ev.needsLogin, session: ev.session || session, ms: Date.now() - started, thinking: thinking.trim(), tools });
      });
      const options = { lean: true, images, model: seat.model || undefined, effort: seat.effort || undefined, persona: seat.persona ? personaText(agent, seat.persona) : undefined };
      window.hub.send({ agentId: seat.agentId, chatId: id, session, text, options })
        .catch((err) => runs.get(id)?.({ type: 'error', message: err.message }));
    });
  }

  // ---------- collaborations ----------
  const live = new Map(); // collab id -> { m, chat, hostId, runIds, stopped }
  const openRounds = new Set(); // "collabId:round" folds the user opened
  const paintTimers = new Map();
  function paint(m, now = false) {
    if (!now) {
      if (paintTimers.has(m.id)) return;
      paintTimers.set(m.id, setTimeout(() => { paintTimers.delete(m.id); paint(m, true); }, 90));
      return;
    }
    const node = document.querySelector(`.collab-card[data-cid="${m.id}"]`);
    if (!node) return;
    const list = node.closest('.messages');
    const stick = list && list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    node.replaceWith(collabEl(m, H.agent(node.dataset.host), Number(node.dataset.index)));
    if (stick) list.scrollTop = list.scrollHeight;
  }
  const save = (L) => { L.chat.updatedAt = Date.now(); Native.save(L.chat); };

  // A part = one seat's turn in a round. Text streams into it; tags are handled when it ends.
  async function turn(L, seatIdx, round, kind, prompt, { images = [] } = {}) {
    const m = L.m;
    const seat = m.seats[seatIdx];
    const part = { seat: seatIdx, round, kind, text: '', status: 'running' };
    m.parts.push(part);
    paint(m);
    const r = await call(seat, prompt, { session: L.sessions[seatIdx] || {}, images, live: L, onText: (t) => { part.text = clean(t); paint(m); } });
    L.sessions[seatIdx] = r.session || L.sessions[seatIdx];
    const raw = r.text || '';
    part.text = clean(raw);
    part.status = r.ok ? 'done' : r.stopped ? 'stopped' : 'error';
    if (r.usage) part.usage = r.usage;
    if (r.ms) part.ms = r.ms;
    if (!r.ok && !r.stopped) part.error = r.error || 'No answer';
    const facts = [...raw.matchAll(REMEMBER)].map((x) => x[1].trim()).filter(Boolean);
    if (facts.length) { part.remembered = facts; Native.rememberFacts(seat.agentId, facts); }
    const sug = [...raw.matchAll(SUGGEST)].map((x) => x[1].trim()).filter(Boolean).slice(0, 3);
    if (sug.length) part.suggest = sug;
    if (r.thinking) part.thinking = r.thinking.slice(0, 8000);
    if (r.tools?.length) part.tools = [...new Set(r.tools)].slice(0, 12);
    if (r.needsLogin) part.needsLogin = H.agent(seat.agentId)?.engine;
    save(L);
    paint(m);
    // a token budget (/collab-budget) stops the collaboration once it is spent
    const budget = Number(store.get('astra.collabBudget', 0)) || 0;
    if (budget && !L.stopped) {
      const spent = totals(m).all;
      if (spent.input + spent.output >= budget) { L.stopped = true; m.error = `Stopped at the token budget (${fmt(budget)}): /collab-budget changes it.`; for (const rid of L.runIds) window.hub.stop(rid); }
    }
    return part;
  }
  const ok = (part) => part?.status === 'done';
  const seatKey = (s) => [s.agentId, s.model || '', s.persona || '', s.effort || ''].join('|');
  const answerOf = (part) => String(part?.text || '').replace(/\n+Changes:[^\n]*$/i, '').trim();

  // Starts a collaboration in the host chat: the task as your message, then the card.
  async function start(hostId, mode, task, seats, { rounds = 1, images = [], judge = null, auto = null } = {}) {
    if (!task.trim() && !images.length) throw new Error('Say what they should work on, e.g. /duo explain closures');
    if (seats.length < (mode === 'compare' ? 2 : 2)) throw new Error('A collaboration needs two participants (set up an Astra and a Claude agent).');
    const chat = Native.ensureChat(hostId, task);
    const at = Date.now();
    chat.messages.push({ role: 'user', text: task || '(see attachments)', at, collab: mode, ...(images.length ? { attachments: images.map((p) => ({ kind: 'image', name: p.split(/[\\/]/).pop() })) } : {}) });
    const m = { role: 'collab', id: `c${at.toString(36)}`, mode, task, seats, rounds, judge, parts: [], status: 'running', at, text: '' };
    chat.messages.push(m);
    // the same agent in two seats gets a second shade so its columns / dots can be told apart
    seats.forEach((st, i) => { const before = seats.slice(0, i).filter((x) => x.agentId === st.agentId).length; if (before) seats[i] = { ...st, color: `color-mix(in srgb, ${st.color} ${100 - before * 30}%, ${before % 2 ? '#7c8cff' : '#ffd75e'})` }; });
    const L = { m, chat, hostId, runIds: new Set(), stopped: false, sessions: [], images };
    // A duo / compare in a chat that had one with the same seats continues those engine sessions, so both
    // remember the earlier duo turns (and later turns send only the new message).
    if ((mode === 'duo' || mode === 'compare') && chat.duoSessions) L.sessions = seats.map((s) => chat.duoSessions[seatKey(s)] || undefined);
    m.continued = L.sessions.some((x) => x?.id) || undefined;
    live.set(m.id, L);
    lastCollab.set(hostId, { mode, task, seats, rounds, judge });
    save(L);
    Native.refresh(hostId, { keepScroll: false });
    try {
      await RUNNERS[mode](L, task, images);
      m.status = L.stopped ? 'stopped' : m.parts.some((p) => p.status === 'error') && !m.final ? 'error' : 'done';
    } catch (err) {
      m.status = 'error';
      m.error = err.message;
    }
    finishCollab(L);
    const after = auto?.after;
    if (m.status === 'done' && (m.mode === 'duo' || m.mode === 'compare') && latestBySeat(m).filter(ok).length >= 2) {
      if (after === 'merge') await merge(hostId, m);
      if (after === 'judge') await judgeBest(hostId, m);
    }
    return m;
  }
  function finishCollab(L) {
    const { m } = L;
    live.delete(m.id);
    m.ms = Date.now() - m.at;
    // engine sessions are kept so a later merge resumes the judge (it already knows its own answer)
    m.sessions = L.sessions.map((s) => (s?.id ? { id: s.id, ...(s.totals ? { totals: s.totals } : {}) } : null));
    if (m.mode === 'duo' || m.mode === 'compare') {
      L.chat.duoSessions ||= {};
      m.seats.forEach((s, i) => { if (m.sessions[i]) L.chat.duoSessions[seatKey(s)] = m.sessions[i]; });
    }
    m.text = collabText(m);
    const fin = m.final != null ? m.parts[m.final] : null;
    if (fin?.suggest) m.suggest = fin.suggest;
    // the host chat's next message carries the outcome once (only when its engine session wouldn't see it)
    L.chat.carry = carryText(m) || L.chat.carry;
    save(L);
    Native.refresh(L.hostId, { keepScroll: true });
    const t = totals(m);
    if (m.status === 'done') {
      toast(`${MODES[m.mode].label} finished · ${fmt(t.all.input + t.all.output)} tokens`, { timeout: 2500 });
      AppUI.replyFinished?.(L.hostId, L.chat.id, m.text); // unread dot / notification when you're elsewhere
    }
  }

  // ----- the modes -----
  const RUNNERS = {
    // Both answer the same message at the same time.
    async duo(L, task, images) {
      await Promise.all(L.m.seats.map((_, i) => turn(L, i, 1, 'answer', task, { images })));
    },
    async compare(L, task, images) { return RUNNERS.duo(L, task, images); },
    // A drafts; then the other improves the latest version, alternating, for `rounds` passes.
    async relay(L, task, images) {
      const { m } = L;
      let last = await turn(L, 0, 1, 'draft', task, { images });
      for (let r = 1; r <= m.rounds && ok(last) && !L.stopped; r += 1) {
        const i = r % 2; const prev = m.seats[last.seat];
        const prompt = L.sessions[i]?.id
          ? `${prev.name} improved it further:\n\n<version>\n${answerOf(last)}\n</version>\n\nImprove it further the same way: reply with the full improved version, then one last line "Changes: …".`
          : `Request from the user:\n<request>\n${task}\n</request>\n\nDraft by ${prev.name}:\n<draft>\n${answerOf(last)}\n</draft>\n\nImprove this draft: fix mistakes, fill gaps, tighten it. Reply with the full improved version only, then one last line "Changes: …" listing what you changed.`;
        last = await turn(L, i, r + 1, 'improve', prompt, { images: L.sessions[i]?.id ? [] : images });
      }
      if (ok(last)) m.final = m.parts.indexOf(last);
    },
    // A drafts; B critiques; A revises; repeat; B can approve early with LGTM.
    async critique(L, task, images) {
      const { m } = L;
      let draft = await turn(L, 0, 1, 'draft', task, { images });
      for (let r = 1; r <= m.rounds && ok(draft) && !L.stopped; r += 1) {
        const first = !L.sessions[1]?.id;
        const review = await turn(L, 1, r, 'critique', first
          ? `Request from the user:\n<request>\n${task}\n</request>\n\n${m.seats[0].name}'s answer:\n<answer>\n${answerOf(draft)}\n</answer>\n\nCritique this answer: the 3–5 most important problems and how to fix each. Don't rewrite it. If it is already excellent, reply only "LGTM".`
          : `Here is the revised answer:\n<answer>\n${answerOf(draft)}\n</answer>\n\nReview it again: what is still wrong? If it's good now, reply only "LGTM".`, { images: first ? images : [] });
        if (!ok(review) || /^\s*LGTM\b/i.test(review.text)) break;
        draft = await turn(L, 0, r + 1, 'revision', `${m.seats[1].name}'s review of your answer:\n<review>\n${review.text}\n</review>\n\nRevise your answer accordingly (keep what was right). Reply with the full revised answer only.`);
      }
      if (ok(draft)) m.final = m.parts.indexOf(draft);
    },
    // Round 1 all answer; each later round sees the others' latest answers; then the judge merges.
    async debate(L, task, images) {
      const { m } = L;
      let latest = await Promise.all(m.seats.map((_, i) => turn(L, i, 1, 'answer', task, { images })));
      for (let r = 2; r <= Math.max(2, m.rounds) && !L.stopped; r += 1) {
        const prev = latest;
        latest = await Promise.all(m.seats.map((s, i) => {
          if (!ok(prev[i])) return prev[i];
          const others = prev.filter((p, j) => j !== i && ok(p)).map((p) => `${m.seats[p.seat].label} answered:\n<answer>\n${answerOf(p)}\n</answer>`).join('\n\n');
          if (!others) return prev[i];
          return turn(L, i, r, 'rebuttal', `${others}\n\nWhere do you agree or disagree? Defend or update your answer. Reply with your full updated answer, starting with one short line on what changed and why (start with AGREED if you now fully agree).`);
        }));
        // everyone agrees: no more rounds needed (saves tokens)
        if (latest.filter(ok).length && latest.filter(ok).every((p) => /^\s*\**AGREED\b/i.test(p.text))) break;
      }
      await synthesize(L, latest, 'Debate over.');
    },
    // Seats answer (several can be the same engine with different personas); the chair sums up.
    async council(L, task, images) {
      const latest = await Promise.all(L.m.seats.map((_, i) => turn(L, i, 1, 'answer', task, { images })));
      // rounds ≥ 2: each seat reads the others and notes what they got wrong or missed (short), then the chair decides
      if (L.m.rounds >= 2 && !L.stopped) {
        await Promise.all(latest.map((p) => {
          if (!ok(p)) return p;
          const others = latest.filter((x) => x !== p && ok(x)).map((x) => `${L.m.seats[x.seat].label}:\n<answer>\n${answerOf(x)}\n</answer>`).join('\n\n');
          return turn(L, p.seat, 2, 'critique', `The other council members answered:\n\n${others}\n\nIn at most 5 short lines: what did they get wrong or miss, and what would you keep from them?`);
        }));
      }
      await synthesize(L, latest, 'The council has answered (and reviewed each other).');
    },
  };
  // The judge (host seat by default) writes the final answer; it already knows its own answer from its session.
  // A finished debate gets another round (then a new final answer); a relay gets another improvement pass.
  async function oneMore(hostId, m) {
    const chat = Native.chatOf(hostId);
    if (!chat || live.has(m.id)) return;
    const L = { m, chat, hostId, runIds: new Set(), stopped: false, sessions: (m.sessions || []).map((x) => x || undefined), images: [] };
    live.set(m.id, L);
    m.status = 'running';
    const nums = m.parts.map((p) => p.round).filter((r) => typeof r === 'number');
    const r = (nums.length ? Math.max(...nums) : 1) + 1;
    if (m.mode === 'relay') {
      const last = m.final != null ? m.parts[m.final] : [...m.parts].reverse().find(ok);
      const i = last.seat === 0 ? 1 : 0;
      const next = await turn(L, i, r, 'improve', `${m.seats[last.seat].name}'s latest version:\n\n<version>\n${answerOf(last)}\n</version>\n\nImprove it further: reply with the full improved version, then one last line "Changes: …".`);
      if (ok(next)) m.final = m.parts.indexOf(next);
    } else {
      if (m.final != null && m.parts[m.final]?.kind === 'final') m.final = undefined;
      const prev = latestBySeat(m);
      const latest = await Promise.all(prev.map((p) => {
        if (!ok(p)) return p;
        const others = prev.filter((x) => x !== p && ok(x)).map((x) => `${m.seats[x.seat].label} answered:\n<answer>\n${answerOf(x)}\n</answer>`).join('\n\n');
        return turn(L, p.seat, r, 'rebuttal', `One more round. ${others}\n\nWhere do you still disagree? Reply with your full updated answer, starting with one short line on what changed.`);
      }));
      await synthesize(L, latest, 'Debate over.');
    }
    m.rounds = r;
    m.status = L.stopped ? 'stopped' : 'done';
    finishCollab(L);
  }
  async function synthesize(L, latest, lead) {
    const { m } = L;
    if (L.stopped) return;
    const good = latest.filter(ok);
    if (good.length < 2) { if (good[0]) m.final = m.parts.indexOf(good[0]); return; }
    const j = judgeSeat(L);
    const others = good.filter((p) => p.seat !== j).map((p) => `${m.seats[p.seat].label}:\n<answer>\n${answerOf(p)}\n</answer>`).join('\n\n');
    const prompt = L.sessions[j]?.id
      ? `${lead} The others' latest answers:\n\n${others}\n\nWrite the single best final answer for the user: combine the strongest points, settle disagreements, drop repetition. Reply with the final answer only.`
      : `Request from the user:\n<request>\n${m.task}\n</request>\n\n${good.map((p) => `${m.seats[p.seat].label}:\n<answer>\n${answerOf(p)}\n</answer>`).join('\n\n')}\n\nWrite the single best final answer for the user: combine the strongest points, settle disagreements, drop repetition. Reply with the final answer only.`;
    const fin = await turn(L, j, 'final', 'final', prompt);
    if (ok(fin)) m.final = m.parts.indexOf(fin);
  }
  function judgeSeat(L) {
    const { m } = L;
    if (Number.isInteger(m.judge) && m.seats[m.judge]) return m.judge;
    const host = m.seats.findIndex((s) => s.agentId === L.hostId && !s.persona);
    return host >= 0 ? host : 0;
  }

  // ----- after the fact: pick, merge, stop, again -----
  async function pick(hostId, m, seatIdx) {
    const chat = Native.chatOf(hostId);
    const part = [...m.parts].reverse().find((p) => p.seat === seatIdx && ok(p));
    if (!chat || !part) return;
    if (m.picked !== seatIdx) score(m, seatIdx);
    m.picked = seatIdx;
    m.final = m.parts.indexOf(part);
    m.text = collabText(m);
    chat.carry = carryText(m);
    Native.save(chat);
    paint(m, true);
    toast(`Kept ${m.seats[seatIdx].name}'s answer: your next message continues from it`, { timeout: 2200 });
  }
  // Scoreboard (data/kv/astra-scoreboard.json): { "<agent name>": { kept, offered, modes: { duo: n } } }
  async function score(m, seatIdx) {
    try {
      const board = await window.hub.kvGet('astra-scoreboard', {}) || {};
      for (const [i, st] of m.seats.entries()) {
        const row = (board[st.name] ||= { kept: 0, offered: 0, modes: {} });
        row.offered += 1;
        if (i === seatIdx) { row.kept += 1; row.modes[m.mode] = (row.modes[m.mode] || 0) + 1; }
      }
      await window.hub.kvSet('astra-scoreboard', board);
    } catch { /* the scoreboard is a nicety */ }
  }
  async function merge(hostId, m, judgeIdx = null) {
    const chat = Native.chatOf(hostId);
    if (!chat || live.has(m.id)) return;
    const answers = latestBySeat(m).filter(ok);
    if (answers.length < 2) { toast('Two answers are needed to merge', { type: 'error' }); return; }
    const L = { m, chat, hostId, runIds: new Set(), stopped: false, sessions: (m.sessions || []).map((s) => s || undefined), images: [] };
    live.set(m.id, L);
    m.status = 'running';
    if (m.final != null && m.parts[m.final]?.kind === 'final') m.final = undefined; // a new merge replaces the old one
    if (Number.isInteger(judgeIdx)) m.judge = judgeIdx;
    await synthesize(L, answers, 'Two answers to the same request.');
    m.status = L.stopped ? 'stopped' : 'done';
    m.picked = undefined;
    finishCollab(L);
  }
  function latestBySeat(m) {
    return m.seats.map((_, i) => [...m.parts].reverse().find((p) => p.seat === i && !['final', 'critique', 'verdict'].includes(p.kind))).filter(Boolean);
  }
  function stop(id) {
    const L = live.get(id);
    if (!L) return false;
    L.stopped = true;
    for (const rid of L.runIds) window.hub.stop(rid);
    return true;
  }
  function stopAllIn(hostId) {
    let n = 0;
    for (const [id, L] of live) if (L.hostId === hostId && stop(id)) n += 1;
    return n;
  }

  // ----- what the collab means for the conversation -----
  const seatsLabel = (m) => m.seats.map((s) => s.label).join(' × ');
  function collabText(m) {
    const fin = m.final != null ? m.parts[m.final] : null;
    if (fin) return `**${MODES[m.mode].label} · ${seatsLabel(m)}** (${m.picked != null ? `kept ${m.seats[m.picked].name}'s answer` : `final by ${m.seats[fin.seat].name}`})\n\n${answerOf(fin)}`;
    return `**${MODES[m.mode].label} · ${seatsLabel(m)}**\n\n${latestBySeat(m).filter(ok).map((p) => `_${m.seats[p.seat].label}:_\n\n${answerOf(p)}`).join('\n\n---\n\n')}`;
  }
  function carryText(m) {
    const fin = m.final != null ? m.parts[m.final] : null;
    const body = fin ? cap(answerOf(fin), 3000) : latestBySeat(m).filter(ok).map((p) => `[${m.seats[p.seat].name}]: ${cap(answerOf(p), 1500)}`).join('\n\n');
    if (!body) return null;
    return `[Earlier in this chat, outside your session, the user ran a ${MODES[m.mode].label.toLowerCase()} (${seatsLabel(m)}) on: "${cap(m.task, 300)}". ${fin ? 'The answer they kept' : 'The answers'}:\n${body}]`;
  }
  function totals(m) {
    const per = m.seats.map(() => ({ input: 0, output: 0, ms: 0, turns: 0 }));
    for (const p of m.parts) {
      const t = per[p.seat];
      if (!t) continue;
      t.input += p.usage?.input || 0; t.output += p.usage?.output || 0; t.ms += p.ms || 0; t.turns += 1;
    }
    const all = per.reduce((a, t) => ({ input: a.input + t.input, output: a.output + t.output }), { input: 0, output: 0 });
    return { per, all };
  }

  // ---------- the card ----------
  const KIND = { answer: 'answered', draft: 'drafted', improve: 'improved', critique: 'reviewed', revision: 'revised', rebuttal: 'replied', final: 'final answer', verdict: 'judged' };
  function partEl(m, p, { compact = false } = {}) {
    const s = m.seats[p.seat] || {};
    const head = el('div', { class: 'collab-part-head' },
      el('i', { class: 'collab-dot', style: { background: s.color } }),
      el('b', { text: s.label || '?' }),
      el('span', { class: 'hint', text: `${KIND[p.kind] || p.kind}${p.status === 'running' ? '…' : ''}` }),
      el('span', { class: 'spacer' }),
      p.usage ? el('span', { class: 'collab-tok', text: `${fmt(p.usage.input)} in · ${fmt(p.usage.output)} out${p.ms ? ` · ${(p.ms / 1000).toFixed(1)}s` : ''}` }) : null,
      p.status === 'stopped' ? el('span', { class: 'hint', text: 'stopped' }) : null,
      ok(p) && !compact ? el('button', { type: 'button', class: 'msg-act', text: 'Copy', title: 'Copy this part', on: { click: (e) => { e.stopPropagation(); copyText(answerOf(p), 'Copied'); } } }) : null);
    const body = el('div', { class: `body${compact ? ' collab-scroll' : ''}` });
    if (p.status === 'error') body.append(el('div', { class: 'collab-error', text: p.error || 'No answer' }),
      p.needsLogin ? el('button', { type: 'button', class: 'primary small', text: 'Sign in', on: { click: () => window.hub.login(p.needsLogin) } }) : null);
    else if (p.text) body.innerHTML = renderMarkdown(p.text);
    else if (p.status === 'running') body.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    const extra = [
      p.tools?.length ? el('div', { class: 'tool-chips', text: `Used ${p.tools.join(', ')}` }) : null,
      p.thinking ? el('details', { class: 'thinking collab-thinking' }, el('summary', { text: 'Thought process' }), el('div', { class: 'thinking-text', text: p.thinking })) : null,
    ];
    return el('div', { class: `collab-part ${p.status}`, attrs: { style: `--seat: ${s.color}` } }, head, ...extra, body,
      p.remembered?.length ? el('div', { class: 'memory-chip' }, `Saved to ${s.name}'s memory: ${p.remembered.join(' · ')} `,
        el('button', { class: 'undo-memory-collab', text: 'Undo', on: { click: async (e) => { await Native.forgetFacts(s.agentId, p.remembered); p.remembered = undefined; e.target.parentElement.replaceWith(el('div', { class: 'memory-chip', text: 'Removed from memory' })); } } })) : null);
  }
  function collabEl(m, agent, index) {
    const hostId = agent?.id;
    const running = m.status === 'running' && live.has(m.id);
    if (m.status === 'running' && !running) m.status = 'stopped'; // the app closed mid-way
    const t = totals(m);
    const mode = MODES[m.mode] || { icon: '⚇', label: m.mode };
    const act = (label, title, fn, cls = '') => el('button', { type: 'button', class: `msg-act ${cls}`, text: label, title, on: { click: (e) => { e.stopPropagation(); fn(e); } } });
    const head = el('div', { class: 'collab-head' },
      el('span', { class: 'collab-mode', text: `${m.folded ? '▸' : '▾'} ${mode.icon} ${mode.label}`, title: m.folded ? 'Unfold' : 'Fold this card', on: { click: () => toggleFold(hostId, m) } }),
      el('span', { class: 'collab-task', text: cap(m.task, 90), title: m.task }),
      m.continued ? el('span', { class: 'hint', text: '↻', title: 'Both continued their earlier duo sessions in this chat (/duo --fresh starts over)' }) : null,
      el('span', { class: 'spacer' }),
      ...m.seats.map((s, i) => el('span', { class: 'collab-seat', on: { click: () => { if (s.agentId !== hostId) activate(H.surfaceIdFor(s.agentId)); } }, attrs: { style: `--seat: ${s.color}` }, title: `${s.label}: ${t.per[i].input.toLocaleString()} in · ${t.per[i].output.toLocaleString()} out · ${t.per[i].turns} turn(s)` },
        el('i', { class: 'collab-dot' }), `${s.name} ${fmt(t.per[i].input + t.per[i].output)}`)),
      el('span', { class: 'collab-total', title: `${t.all.input.toLocaleString()} in · ${t.all.output.toLocaleString()} out${m.ms ? ` · ${(m.ms / 1000).toFixed(1)} s` : ''}`, text: `Σ ${fmt(t.all.input + t.all.output)}` }),
      running ? act('■ Stop', 'Stop this collaboration', () => stop(m.id), 'collab-stop') : act('⋯', 'More', (e) => cardMenu(e, hostId, m)));
    const card = el('div', { class: `collab-card mode-${m.mode} ${m.status}${m.folded ? ' folded' : ''}`, dataset: { cid: m.id, host: hostId || '', index: String(index ?? '') } }, head);
    if (m.folded && !running) {
      // folded: one line with the kept / final answer's start
      const fin = m.final != null ? m.parts[m.final] : null;
      card.append(el('div', { class: 'collab-folded hint', text: fin ? `${m.seats[fin.seat]?.name}: ${cap(answerOf(fin).replace(/\s+/g, ' '), 160)}` : `${latestBySeat(m).filter(ok).length} answers` }));
      return card;
    }
    if (m.mode === 'duo' || m.mode === 'compare') {
      const grid = el('div', { class: 'collab-grid', attrs: { style: `--cols: ${Math.min(m.seats.length, 3)}` } });
      for (const p of latestBySeat(m)) {
        const col = partEl(m, p, { compact: true });
        if (m.picked === p.seat) col.classList.add('picked');
        if (!running && ok(p)) col.append(el('div', { class: 'collab-col-foot' }, act(m.picked === p.seat ? '✓ Kept' : 'Pick this one', 'Keep this answer: your next message continues from it', () => pick(hostId, m, p.seat), 'primary-act'), act('Copy', 'Copy this answer', () => copyText(answerOf(p), 'Answer copied'))));
        grid.append(col);
      }
      card.append(grid);
      const merged = m.final != null && m.parts[m.final]?.kind === 'final' ? m.parts[m.final] : [...m.parts].reverse().find((p) => p.kind === 'final' && p.status === 'running');
      if (merged) { const f = partEl(m, merged); f.classList.add('collab-final'); card.append(f); }
      const verdict = [...m.parts].reverse().find((p) => p.kind === 'verdict');
      if (verdict) { const v = partEl(m, verdict); v.classList.add('collab-verdict'); card.append(v); }
      if (!running && latestBySeat(m).filter(ok).length >= 2) {
        card.append(el('div', { class: 'collab-actions' },
          act('⧉ Merge both', `${m.seats[judgeSeat({ m, hostId })]?.name || 'The host'} merges the answers into one`, () => merge(hostId, m)),
          m.seats.length === 2 ? act(`Merge by ${m.seats[1 - judgeSeat({ m, hostId })]?.name}`, 'The other agent writes the merged answer', () => merge(hostId, m, 1 - judgeSeat({ m, hostId }))) : null,
          act('⚖ Judge', 'One of them reads both answers and keeps the better one (short verdict)', () => judgeBest(hostId, m)),
          m.seats.length === 2 ? act('± Differences', 'Show where the two answers differ, line by line', () => showDiff(m)) : null));
      }
    } else {
      // rounds fold away so the card stays short; the final answer stays visible
      const rounds = [...new Set(m.parts.filter((p, i) => i !== m.final).map((p) => p.round))];
      for (const r of rounds) {
        const parts = m.parts.filter((p, i) => p.round === r && i !== m.final);
        const key = `${m.id}:${r}`;
        const sum = parts.map((p) => `${m.seats[p.seat]?.name} ${KIND[p.kind] || p.kind}${p.status === 'running' ? '…' : ''}`).join(' · ');
        const tok = parts.reduce((n, p) => n + (p.usage ? p.usage.input + p.usage.output : 0), 0);
        const d = el('details', { class: 'collab-round', open: openRounds.has(key) || (running && parts.some((p) => p.status === 'running')) },
          el('summary', {}, el('b', { text: r === 'final' ? 'Final' : `Round ${r}` }), ` ${sum}`, tok ? el('span', { class: 'collab-tok', text: ` · ${fmt(tok)}` }) : null),
          ...parts.map((p) => partEl(m, p)));
        d.addEventListener('toggle', () => { if (d.open) openRounds.add(key); else openRounds.delete(key); });
        card.append(d);
      }
      const fin = m.final != null ? m.parts[m.final] : null;
      if (fin) {
        const f = partEl(m, fin);
        f.classList.add('collab-final');
        card.append(f);
      } else if (!running && m.status !== 'running' && latestBySeat(m).filter(ok).length >= 2) {
        card.append(el('div', { class: 'collab-actions' }, act('⧉ Merge answers', 'Write one final answer from them', () => merge(hostId, m))));
      }
    }
    if (m.error) card.append(el('div', { class: 'collab-error', text: m.error }));
    if (!running && m.suggest?.length && hostId) card.append(el('div', { class: 'suggest-chips' }, m.suggest.map((s) => el('button', { class: 'suggest-chip', text: s, title: 'Send this', on: { click: () => Native.sendText(hostId, s) } }))));
    return card;
  }
  function cardMenu(e, hostId, m) {
    const r = e.currentTarget.getBoundingClientRect();
    const fin = m.final != null ? m.parts[m.final] : null;
    showMenu(r.left - 160, r.bottom + 4, [
      { label: 'Run it again', action: () => start(hostId, m.mode, m.task, m.seats, { rounds: m.rounds, judge: m.judge }).catch((err) => toast(err.message, { type: 'error' })) },
      { label: 'Run again, order swapped', action: () => start(hostId, m.mode, m.task, [...m.seats].reverse(), { rounds: m.rounds }).catch((err) => toast(err.message, { type: 'error' })) },
      fin ? { label: 'Copy the final answer', action: () => copyText(answerOf(fin), 'Answer copied') } : null,
      fin ? { label: 'Put the final answer in the composer', action: () => Native.setDraft(hostId, answerOf(fin)) } : null,
      m.mode === 'duo' || m.mode === 'compare' ? { label: 'Follow up with both…', action: async () => { const q = await Modal.prompt('Follow up with both', { multiline: true, label: `${m.seats.map((x) => x.name).join(' and ')} continue where they left off.` }); if (q?.trim()) start(hostId, 'duo', q.trim(), m.seats).catch((err) => toast(err.message, { type: 'error' })); } } : null,
      m.mode === 'debate' || m.mode === 'council' ? { label: 'One more round (then a new final answer)', action: () => oneMore(hostId, m) } : null,
      m.mode === 'relay' && fin ? { label: 'One more improvement pass', action: () => oneMore(hostId, m) } : null,
      ...m.seats.map((s, i) => (latestBySeat(m).some((p) => p.seat === i && p.status === 'error') && !live.has(m.id) ? { label: `Retry ${s.label}`, action: () => retrySeat(hostId, m, i) } : null)),
      fin && typeof Notes !== 'undefined' ? { label: 'Save the final answer to Notes', action: () => Notes.append(`**${MODES[m.mode].label}: ${cap(m.task, 80)}**\n\n${answerOf(fin)}`) } : null,
      { label: 'Copy everything (Markdown)', action: () => copyText(collabMarkdown(m), 'Collaboration copied') },
      { label: 'Save as a Markdown file…', action: async () => { const p = await window.hub.saveFile({ defaultPath: `${MODES[m.mode].label} - ${cap(m.task, 40).replace(/[\\/:*?"<>|]/g, '_')}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }], content: collabMarkdown(m) }); if (p) toast('Saved', { action: { label: 'Show', fn: () => window.hub.fs.reveal(p) } }); } },
      fin ? { label: 'Read the final answer aloud', action: () => { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(answerOf(fin).replace(/```[\s\S]*?```/g, ' (code) ').replace(/[#*_`>|]/g, ''))); } } : null,
      { label: 'Token totals', action: () => Modal.alert('Collaboration tokens', totalsText(m)) },
      ...m.seats.filter((s, i, all) => all.findIndex((x) => x.agentId === s.agentId) === i && s.agentId !== hostId)
        .map((s) => ({ label: `Continue with ${s.name}`, action: () => handoff(hostId, s.agentId, { from: m }) })),
    ].filter(Boolean));
  }
function toggleFold(hostId, m) {
    m.folded = !m.folded || undefined;
    const chat = Native.chatOf(hostId);
    if (chat) Native.save(chat);
    paint(m, true);
  }
  // The judge (host seat unless chosen) reads both answers, names the better one and why; that one is kept.
  async function judgeBest(hostId, m, judgeIdx = null) {
    const chat = Native.chatOf(hostId);
    const answers = latestBySeat(m).filter(ok);
    if (!chat || live.has(m.id) || answers.length < 2) return;
    const L = { m, chat, hostId, runIds: new Set(), stopped: false, sessions: [], images: [] };
    live.set(m.id, L);
    m.status = 'running';
    const j = Number.isInteger(judgeIdx) ? judgeIdx : judgeSeat(L);
    const list = answers.map((p, i) => `Answer ${i + 1} (${m.seats[p.seat].label}):\n<answer>\n${answerOf(p)}\n</answer>`).join('\n\n');
    const v = await turn(L, j, 'final', 'verdict', `Request from the user:\n<request>\n${m.task}\n</request>\n\n${list}\n\nWhich answer serves the user better? Be fair to both (one may be yours). Reply with only the number on the first line, then at most 3 short lines on why.`);
    const n = Number((String(v.text).trim().split('\n')[0].match(/\b([1-9])\b/) || [])[1]); // the number on the first line
    m.status = L.stopped ? 'stopped' : 'done';
    finishCollab(L);
    if (ok(v) && answers[n - 1]) pick(hostId, m, answers[n - 1].seat);
  }
  // A small line diff (longest common subsequence) between the two answers.
  function diffLines(a, b) {
    const x = a.split('\n'); const y = b.split('\n');
    if (x.length * y.length > 250000) return null;
    const dp = Array.from({ length: x.length + 1 }, () => new Uint16Array(y.length + 1));
    for (let i = x.length - 1; i >= 0; i -= 1) for (let k = y.length - 1; k >= 0; k -= 1) dp[i][k] = x[i] === y[k] ? dp[i + 1][k + 1] + 1 : Math.max(dp[i + 1][k], dp[i][k + 1]);
    const out = [];
    let i = 0; let k = 0;
    while (i < x.length && k < y.length) {
      if (x[i] === y[k]) { out.push([' ', x[i]]); i += 1; k += 1; } else if (dp[i + 1][k] >= dp[i][k + 1]) { out.push(['-', x[i]]); i += 1; } else { out.push(['+', y[k]]); k += 1; }
    }
    while (i < x.length) out.push(['-', x[i++]]);
    while (k < y.length) out.push(['+', y[k++]]);
    return out;
  }
  function showDiff(m) {
    const [a, b] = latestBySeat(m).filter(ok);
    if (!a || !b) return;
    const d = diffLines(answerOf(a), answerOf(b));
    if (!d) { toast('Those answers are too long to compare line by line', { type: 'error' }); return; }
    const same = d.filter(([t]) => t === ' ').length;
    const box = el('div', { class: 'collab-diff' }, d.map(([t, line]) => el('div', { class: `d${t === '+' ? 'add' : t === '-' ? 'del' : 'same'}`, text: `${t} ${line}` })));
    const dlg = el('dialog', { class: 'ui-modal collab-diff-dialog' },
      el('h2', { text: `− ${m.seats[a.seat].label}  ·  + ${m.seats[b.seat].label}` }),
      el('p', { class: 'hint', text: `${same} line${same === 1 ? '' : 's'} in common, ${d.length - same} different` }), box,
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { class: 'primary', text: 'Close', on: { click: () => dlg.close() } })));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    dlg.showModal();
  }
  // A seat that failed in a duo / compare answers again (the others keep their answers).
  async function retrySeat(hostId, m, i) {
    const chat = Native.chatOf(hostId);
    if (!chat || live.has(m.id)) return;
    const L = { m, chat, hostId, runIds: new Set(), stopped: false, sessions: [], images: [] };
    live.set(m.id, L);
    m.status = 'running';
    m.parts = m.parts.filter((p) => !(p.seat === i && p.status === 'error'));
    await turn(L, i, 1, 'answer', m.task);
    m.status = L.stopped ? 'stopped' : 'done';
    finishCollab(L);
  }
  function totalsText(m) {
    const t = totals(m);
    return [...m.seats.map((s, i) => `${s.label}: ${t.per[i].input.toLocaleString()} in · ${t.per[i].output.toLocaleString()} out · ${t.per[i].turns} turn${t.per[i].turns === 1 ? '' : 's'}${t.per[i].ms ? ` · ${(t.per[i].ms / 1000).toFixed(1)} s` : ''}`),
      `Total: ${t.all.input.toLocaleString()} in · ${t.all.output.toLocaleString()} out`].join('\n');
  }
  function collabMarkdown(m) {
    return `## ${MODES[m.mode].label}: ${m.task}\n\n${m.parts.map((p) => `### ${m.seats[p.seat]?.label} · ${KIND[p.kind] || p.kind}${p.round !== 'final' ? ` (round ${p.round})` : ''}\n\n${p.text || p.error || ''}`).join('\n\n')}\n\n_${totalsText(m).replace(/\n/g, ' · ')}_\n`;
  }

  // ---------- Native hooks ----------
  // Per-chat options + a pending collab outcome + the fallback context for a lost engine session.
  function beforeSend(chat, raw, withContext) {
    const agent = H.agent(chat.agentId);
    const waiting = pendingSettings.get(chat.agentId);
    if (waiting && chat.messages.filter((m) => m.role === 'user').length <= 1) {
      for (const [k, v] of Object.entries(waiting)) { if (v == null) delete chat[k]; else chat[k] = v; }
      pendingSettings.delete(chat.agentId);
    }
    let text = withContext(chat, raw);
    if (chat.carry && chat.session?.id) text = `${chat.carry}\n\n${text}`;
    delete chat.carry;
    const options = {};
    if (chat.effort) options.effort = chat.effort;
    if (chat.web) options.webSearch = chat.web === 'off' ? 'disabled' : chat.web;
    if (chat.verbosity) options.verbosity = chat.verbosity;
    if (chat.persona) options.persona = personaText(agent, chat.persona);
    if (chat.model) options.model = chat.model;
    const once = nextOnce.get(chat.agentId); // one message only
    if (once) { Object.assign(options, once); nextOnce.delete(chat.agentId); }
    if (chat.session?.id && chat.messages.length > 1) options.fallbackText = withContext({ ...chat, session: {} }, raw);
    return { text, options };
  }
  // Codex features Hearth switches off (engines.js); /astra-feature turns one back on per agent.
  const FEATURES = ['shell_tool', 'unified_exec', 'apps', 'browser_use', 'browser_use_external', 'computer_use', 'multi_agent', 'plugins', 'skill_search', 'tool_suggest', 'view_image', 'sleep_tool', 'goals', 'hooks', 'image_generation', 'shell_snapshot', 'in_app_browser', 'workspace_dependencies', 'remote_plugin'];
  const nextOnce = new Map(); // agent id -> engine options for the next message only
  // Capability hints under the empty chat (Astra) or a collab tip (Claude when Astra exists).
  let doctorCache = null;
  function emptyHints(agent) {
    if (agent.engine === 'codex') {
      const chips = [
        ['🧠', `${agent.model || 'default model'} · ${agent.effort || 'default'} effort`, '/astra-model'],
        ['🖼', 'images: attach or paste', null],
        ['📁', agent.workspace ? `files: ${agent.codexFiles === 'edit' ? 'edit' : 'read'} ${agent.workspace.split(/[\\/]/).filter(Boolean).pop()}` : 'files: off', '/astra-files '],
        ['🌐', `web: ${agent.webSearch && agent.webSearch !== 'disabled' ? agent.webSearch : 'off'}`, '/astra-web '],
        ['💬', agent.chatTools ? 'talk-back on' : 'talk-back off', '/astra-talkback '],
      ];
      const status = el('div', { class: 'astra-onboard hint' });
      checkOnboarding(status);
      window.hub.getUsage().then((all) => {
        const u = all?.[new Date().toLocaleDateString('en-CA')]?.[agent.id];
        if (u && status.isConnected) status.after(el('div', { class: 'hint astra-today', text: `Today: ${fmt((u.input || 0) + (u.output || 0))} tokens in ${u.replies || 0} replies` }));
      }).catch(() => {});
      return el('div', { class: 'astra-hints' },
        el('div', { class: 'astra-chips' }, chips.map(([i, t, cmd]) => el('button', { type: 'button', class: 'astra-chip', title: cmd ? `Change with ${cmd.trim()}` : '', text: `${i} ${t}`, on: { click: () => { if (cmd) Native.setDraft(agent.id, cmd); } } }))),
        el('div', { class: 'astra-chips astra-personas' }, el('span', { class: 'hint', text: 'Persona:' }), ['coder', 'reviewer', 'writer', 'researcher', 'director'].map((k) => el('button', { type: 'button', class: `astra-chip${(chatValue(agent.id, 'persona')) === k ? ' on' : ''}`, text: PERSONAS[k].label, title: PERSONAS[k].text, on: { click: (e) => { const on = chatValue(agent.id, 'persona') === k; chatPatch(agent.id, { persona: on ? null : k }); e.currentTarget.classList.toggle('on', !on); toast(on ? 'Persona off' : `Persona for this chat: ${PERSONAS[k].label}`, { timeout: 1400 }); } } }))),
        el('div', { class: 'astra-try' }, 'Try ', ...['/duo', '/relay', '/debate', '/astra-persona', '/astra-doctor'].flatMap((c, i) => [i ? ' · ' : '', el('a', { href: '#', text: c, on: { click: (e) => { e.preventDefault(); Native.setDraft(agent.id, `${c} `); } } })])),
        status);
    }
    if (astra() && agent.engine === 'claude') {
      return el('div', { class: 'astra-hints' }, el('div', { class: 'astra-try' }, `Work with ${astra().name}: `,
        ...['/duo', '/relay', '/critique', '/debate', '/handoff'].flatMap((c, i) => [i ? ' · ' : '', el('a', { href: '#', text: c, on: { click: (e) => { e.preventDefault(); Native.setDraft(agent.id, `${c} `); } } })]),
        ' or the ⚇ chip.'));
    }
    return null;
  }
  // First time an Astra chat is empty: is Codex there and signed in? (cached for 10 minutes)
  async function checkOnboarding(node) {
    try {
      if (!doctorCache || Date.now() - doctorCache.at > 600000) doctorCache = { at: Date.now(), r: await window.hub.engineDoctor() };
      const c = doctorCache.r.codex;
      // keep the app's engine status in step (it is read once at start; Settings → Engines can change it)
      if (H.engineStatus) for (const e of ['codex', 'claude']) if (doctorCache.r[e]) H.engineStatus[e] = doctorCache.r[e].found;
      if (!c.found) node.textContent = '⚠ Codex wasn\'t found on this computer. Install the Codex (ChatGPT) app or set its path in Settings → Engines, then run /astra-doctor.';
      else if (c.loggedIn === false) {
        node.replaceChildren('⚠ Codex isn\'t signed in. ', el('a', { href: '#', text: 'Sign in with ChatGPT', on: { click: (e) => { e.preventDefault(); window.hub.login('codex'); } } }));
      } else node.textContent = `✓ ${c.version || 'Codex'} · signed in`;
    } catch { node.textContent = ''; }
  }

  // ---------- handoff ----------
  // Continues this chat with another agent, from a compact summary (written by the current agent in its own
  // session when it has one, else built from the last messages without spending tokens).
  // From a chat that was handed off: go back to the original chat, carrying what happened here (once).
  async function handoffBack(hostId) {
    const chat = Native.chatOf(hostId);
    if (!chat?.handoffFrom) throw new Error('This chat wasn\'t handed off from another one.');
    const origin = await Native.loadChat(chat.handoffFrom);
    if (!origin) throw new Error('The original chat is gone.');
    const since = chat.messages.slice(1).filter((m) => m.role !== 'error' && m.text).slice(-8)
      .map((m) => `${m.role === 'user' ? 'User' : H.agent(hostId)?.name || 'Assistant'}: ${cap(m.text, 700)}`).join('\n\n');
    if (since) origin.carry = `[While this chat was handed off to ${H.agent(hostId)?.name}, you two said:\n${since}]`;
    Native.adopt(origin);
    toast(`Back in "${origin.title}"${since ? ': your next message carries what happened meanwhile' : ''}`, { timeout: 3000 });
  }
  async function handoff(hostId, targetId, { raw = false, from = null, model = null, persona = null } = {}) {
    const host = H.agent(hostId);
    const target = H.agent(targetId);
    const chat = Native.chatOf(hostId);
    if (!target || target.mode !== 'native') throw new Error('Hand off to which agent? e.g. /handoff astra');
    if (target.id === hostId) throw new Error(`This chat is already with ${host.name}.`);
    let summary = '';
    if (from) summary = collabText(from);
    else if (!chat?.messages.length) throw new Error('Nothing to hand off yet.');
    else if (!raw && chat.session?.id && !Native.isBusy(chat.id)) {
      const t = toast(`${host.name} is writing a handoff summary…`, { timeout: 60000 });
      const r = await call(seatOf(host), 'Write a compact handoff summary of this conversation for another assistant who will continue it: the goal, decisions and preferences, what exists now (with exact names), and what is left to do. Under 200 words, no preamble.', { session: chat.session });
      t.remove();
      if (r.ok) { summary = clean(r.text); chat.session = r.session; Native.save(chat); }
    }
    if (!summary) {
      const lines = chat.messages.filter((m) => m.role !== 'error' && m.text).slice(-8)
        .map((m) => `**${m.role === 'user' ? 'User' : m.role === 'opinion' ? `${m.from}` : host.name}:** ${cap(m.text, 700)}`);
      summary = lines.join('\n\n');
    }
    const now = Date.now();
    const copy = {
      id: `${targetId}-${now.toString(36)}`, agentId: targetId, title: `${chat?.title || 'Handoff'} (→ ${target.name})`, createdAt: now, updatedAt: now,
      session: {}, continuedFrom: host.name, handoffFrom: chat?.id, ...(model ? { model } : {}), ...(persona ? { persona } : {}),
      messages: [{ role: 'assistant', text: `**Handoff from ${host.name}**${chat?.title ? ` ("${chat.title}")` : ''}\n\n${summary}`, at: now }],
    };
    Native.adopt(copy);
    toast(`Continuing with ${target.name} from a ${raw || !chat?.session?.id ? 'short excerpt' : 'summary'} (${fmt(Math.ceil(summary.length / 4))} tokens)`, { timeout: 3500 });
  }

  // ---------- composer chip: the collab mode for your next messages ----------
  const modeKey = (agentId) => `astra.collab.${agentId}`;
  const getMode = (agentId) => store.get(modeKey(agentId), null) || { mode: 'solo', rounds: 1, swap: false };
  function setMode(agentId, patch) {
    const next = { ...getMode(agentId), ...patch };
    store.set(modeKey(agentId), next);
    syncChip(agentId);
    return next;
  }
  const chipEls = new Map(); // agent id -> { chip, root, input }
  function syncChip(agentId) {
    const c = chipEls.get(agentId);
    const agent = H.agent(agentId);
    if (!c || !agent) return;
    c.root.classList.toggle('engine-codex', agent.engine === 'codex');
    const st = getMode(agentId);
    const md = MODES[st.mode];
    c.chip.textContent = md ? `${md.icon} ${md.label}${st.mode !== 'duo' && st.mode !== 'compare' && st.rounds > 1 ? ` ×${st.rounds}` : ''}` : '⚇';
    const mate = seatsFor(agentId).find((x) => x.agentId !== agentId);
    if (mate) c.chip.style.setProperty('--mate', mate.color); // a dot in the partner's color
    c.chip.classList.toggle('on', Boolean(md));
    c.chip.hidden = !partner(agent);
    const prev = md && [...(Native.chatOf(agentId)?.messages || [])].reverse().find((x) => x.role === 'collab' && x.mode === st.mode && x.status === 'done');
    const cost = prev ? ` Last ${md.label.toLowerCase()} here: ${fmt(totals(prev).all.input + totals(prev).all.output)} tokens.` : '';
    c.chip.title = md ? `${md.label}: ${md.desc}. Your next message goes to ${seatsFor(agentId).map((s) => s.name).join(' and ')}.${cost} Click to change, right-click for presets.` : `Collab: answer with ${partner(agent)?.name || 'the other agent'} too (Duo, Relay, Debate…). Right-click for presets.`;
    c.root.classList.toggle('collab-armed', Boolean(md));
    armPlaceholder(agentId);
  }
  function armPlaceholder(agentId) {
    const c = chipEls.get(agentId);
    if (!c) return;
    const md = MODES[getMode(agentId).mode];
    const want = md ? `${md.icon} ${md.label}: message ${seatsFor(agentId).map((x) => x.name).join(' and ')}…` : null;
    if (want && c.input.placeholder !== want) { c.input.dataset.solo = c.input.placeholder; c.input.placeholder = want; }
    if (!want && c.input.dataset.solo) { c.input.placeholder = c.input.dataset.solo; delete c.input.dataset.solo; }
  }
  function seatsFor(agentId) {
    const host = H.agent(agentId);
    const st0 = getMode(agentId);
    // a chosen partner (/collab-partner), else the other engine's main agent
    const other = (st0.partner && H.agent(st0.partner)?.mode === 'native' && st0.partner !== agentId ? H.agent(st0.partner) : null) || partner(host);
    if (!host || !other) return [];
    const st = getMode(agentId);
    const seats = [seatOf(host, { persona: st.personas?.host || null }), seatOf(other, { persona: st.personas?.partner || null })];
    return st.swap ? seats.reverse() : seats;
  }
  // Which seat writes final answers (debate / council / merge) in composer mode: you choose host or partner.
  function judgeFor(agentId) {
    const st = getMode(agentId);
    if (st.judge !== 'partner') return null;
    const i = seatsFor(agentId).findIndex((s) => s.agentId !== agentId);
    return i >= 0 ? i : null;
  }
  function chipMenu(agentId, anchor) {
    const st = getMode(agentId);
    const r = anchor.getBoundingClientRect();
    const host = H.agent(agentId);
    const other = H.agent(seatsFor(agentId).find((x) => x.agentId !== agentId)?.agentId) || partner(host);
    const items = [
      { label: `${st.mode === 'solo' ? '✓ ' : ''}Solo: just ${host.name}`, action: () => setMode(agentId, { mode: 'solo' }) },
      ...Object.entries(MODES).filter(([k]) => k !== 'compare').map(([k, md]) => ({ label: `${st.mode === k ? '✓ ' : ''}${md.icon} ${md.label}: ${md.desc}`, action: () => setMode(agentId, { mode: k }) })),
      { label: `Order: ${seatsFor(agentId).map((s) => s.name).join(' → ')} (swap)`, action: () => setMode(agentId, { swap: !st.swap }) },
      { label: `Rounds: ${st.rounds} (click for ${st.rounds >= 4 ? 1 : st.rounds + 1})`, action: () => setMode(agentId, { rounds: st.rounds >= 4 ? 1 : st.rounds + 1 }) },
      { label: `Final answer by: ${st.judge === 'partner' ? other?.name : host.name} (switch)`, action: () => setMode(agentId, { judge: st.judge === 'partner' ? 'host' : 'partner' }) },
      { label: `After a duo: ${st.after === 'merge' ? 'merge them' : st.after === 'judge' ? 'judge them' : 'nothing'} (switch)`, action: () => setMode(agentId, { after: st.after === 'merge' ? 'judge' : st.after === 'judge' ? null : 'merge' }) },
      ...natives().filter((a) => a.id !== agentId && !a.dock && a.id !== other?.id).slice(0, 4).map((a) => ({ label: `Partner: ${a.name} instead of ${other?.name}`, action: () => setMode(agentId, { partner: a.id }) })),
      { label: '✦ Ready-made collaborations…', action: () => Commands.tryRun('/collab-preset', agentId) },
      { label: `👁 Second opinion from ${other?.name} on the last reply`, action: () => Native.secondOpinion(agentId) },
      { label: `↪ Hand this chat off to ${other?.name}`, action: () => handoff(agentId, other.id).catch((err) => toast(err.message, { type: 'error' })) },
    ];
    showMenu(r.left, Math.max(8, r.top - 8 - items.length * 30), items);
  }
  // Native.mount is wrapped: the chip goes next to the attach button and armed composers route to collab.
  function wrapMount() {
    const mount = Native.mount;
    Native.mount = (agentId, root) => {
      const v = mount(agentId, root);
      const form = root.querySelector('form.composer');
      if (!form) return v;
      const chip = el('button', { type: 'button', class: 'ghost collab-chip', text: '⚇', dataset: { feature: 'Collab chip' } });
      chip.addEventListener('click', (e) => { e.preventDefault(); chipMenu(agentId, chip); });
      chip.addEventListener('contextmenu', (e) => { e.preventDefault(); Commands.tryRun('/collab-preset', agentId); }); // right-click: ready-made collaborations
      form.querySelector('.attach-btn')?.before(chip);
      chipEls.set(agentId, { chip, root, input: v.input });
      new MutationObserver(() => { if (MODES[getMode(agentId).mode] && !v.input.placeholder.includes(MODES[getMode(agentId).mode].label)) armPlaceholder(agentId); }).observe(v.input, { attributes: true, attributeFilter: ['placeholder'] });
      v.input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !v.input.value && stopAllIn(agentId)) toast('Stopping the collaboration', { timeout: 1200 }); });
      // capture phase on the surface: runs before the composer's own submit handler
      root.addEventListener('submit', (e) => {
        if (e.target !== form) return;
        const st = getMode(agentId);
        const text = v.input.value.trim();
        const chatNow = Native.chatOf(agentId);
        if (!text && !(chatNow && Native.isBusy(chatNow.id)) && stopAllIn(agentId)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
        if (!MODES[st.mode] || !text || text.startsWith('/')) return;
        const chat = Native.chatOf(agentId);
        if (chat && Native.isBusy(chat.id)) return; // it queues as usual
        e.preventDefault();
        e.stopImmediatePropagation();
        v.input.value = '';
        v.input.dispatchEvent(new Event('input'));
        const att = Native.takeAttachments(agentId);
        start(agentId, st.mode, `${text}${att.full}`, seatsFor(agentId), { rounds: st.rounds, images: att.images, judge: judgeFor(agentId), auto: { after: st.after } }).catch((err) => toast(err.message, { type: 'error' }));
      }, true);
      syncChip(agentId);
      return v;
    };
  }
  wrapMount();
  window.hub.onConfigChanged(() => { doctorCache = null; setTimeout(() => { for (const id of chipEls.keys()) syncChip(id); }, 50); });

  // ---------- doctor ----------
  async function doctorReport() {
    const r = await window.hub.engineDoctor();
    doctorCache = { at: Date.now(), r };
    const a = astra();
    const line = (okv, text) => `- ${okv === true ? '✓' : okv === false ? '✗' : '•'} ${text}`;
    const fixes = [];
    const out = ['**Astra diagnostics**'];
    for (const [key, e] of Object.entries({ codex: r.codex, claude: r.claude })) {
      out.push(line(e.found, e.found ? `${e.label} found (${e.from}): \`${e.path}\`${e.version ? ` · ${e.version}` : ''}` : `${e.label} not found`));
      if (!e.found) fixes.push(`Install the ${key === 'codex' ? 'Codex (ChatGPT)' : 'Claude'} desktop app or point Settings → Engines at the \`${key}\` program.`);
      else if (!e.version) fixes.push(`${e.label} didn't answer \`--version\`: it may be damaged or too old; update the app.`);
      if (key === 'codex' && e.found) {
        out.push(line(e.loggedIn, e.loggedIn ? `Signed in${e.loginText ? `: ${e.loginText}` : ''}` : `Not signed in${e.loginText ? ` (${e.loginText})` : ''}`));
        if (!e.loggedIn) fixes.push('Run `/astra-login` and sign in with ChatGPT in the window that opens.');
      }
    }
    if (a) {
      out.push(line(null, `${a.name}: ${a.model || 'default model'} · effort ${a.effort || 'default'} · files ${a.workspace ? `${a.codexFiles === 'edit' ? 'edit' : 'read'} (${a.workspace})` : 'off'} · web ${a.webSearch && a.webSearch !== 'disabled' ? a.webSearch : 'off'} · apps ${a.chatgptApps ? 'on' : 'off'} · talk-back ${a.chatTools ? 'on' : 'off'}`));
      if (a.workspace && r.platform === 'win32') out.push(line(null, 'Windows: Codex\'s sandbox is weaker there; keep file access on "read" unless you need edits.'));
    } else { out.push(line(false, 'No Astra agent: add one with ＋ → Astra')); fixes.push('Add an Astra agent (＋ → preset "Astra").'); }
    out.push(line(r.workspaceOk, `Platform ${r.platform} · sessions in \`${r.workspace}\`${r.workspaceOk === false ? ' (not writable!)' : ''}`));
    if (r.workspaceOk === false) fixes.push('Hearth can\'t write its workspace folder: check the data folder\'s permissions.');
    const missing = Object.entries(r.mcp || {}).filter(([, okv]) => !okv).map(([k]) => k);
    out.push(line(!missing.length, missing.length ? `Hub tool servers missing: ${missing.join(', ')}` : `Hub tool servers present (${Object.keys(r.mcp || {}).join(', ')})${r.bridge ? ' · bridge running' : ''}`));
    if (r.prompts?.length) out.push('', '**Instructions + memory per message** (before your text)', ...r.prompts.map((p) => `- ${p.name} (${p.engine === 'codex' ? 'Astra' : 'Claude'}): ~${fmt(p.tokens)} tokens${p.tools.length ? ` + tools: ${p.tools.join(', ')}` : ''}`));
    if (fixes.length) out.push('', '**To fix**', ...fixes.map((f) => `- ${f}`));
    else out.push('', 'All good.');
    return out.join('\n');
  }

  // ---------- per-chat / per-agent settings ----------
  function targetAgent(ctx, { codexOnly = false } = {}) {
    const here = H.agent(ctx.agentId);
    if (here?.mode === 'native' && (!codexOnly || here.engine === 'codex')) return here;
    return astra();
  }
  const isDefault = (args) => /(^|\s)--default\b/.test(args);
  const stripFlags = (args) => args.replace(/(^|\s)--\w+\b/g, ' ').trim();
  function setAgent(agent, patch) {
    Object.assign(agent, patch);
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete agent[k];
    saveConfig();
  }
  // Per-chat settings; with no chat open yet they wait for the first message (beforeSend applies them).
  const pendingSettings = new Map(); // agent id -> { key: value | null }
  const chatValue = (agentId, key) => { const chat = Native.chatOf(agentId); return chat ? chat[key] : pendingSettings.get(agentId)?.[key]; };
  function chatPatch(agentId, patch) {
    const chat = Native.chatOf(agentId);
    if (!chat) { pendingSettings.set(agentId, { ...pendingSettings.get(agentId), ...patch }); return; }
    for (const [k, v] of Object.entries(patch)) { if (v == null) delete chat[k]; else chat[k] = v; }
    Native.save(chat);
    if ('model' in patch) Native.refresh(agentId, { keepScroll: true }); // the header's model menu
  }
  function chatSetting(ctx, key, value, label) {
    chatPatch(ctx.agentId, { [key]: value });
    return Native.chatOf(ctx.agentId) ? label : `${label} (from this new chat's first message)`;
  }
  function statusText(agentId) {
    const agent = H.agent(agentId);
    const chat = Native.chatOf(agentId);
    const cs = chat || pendingSettings.get(agentId) || {}; // this chat's settings (or the ones waiting for it)
    const st = getMode(agentId);
    const collabs = (chat?.messages || []).filter((m) => m.role === 'collab');
    const ct = collabs.reduce((n, m) => { const t = totals(m).all; return n + t.input + t.output; }, 0);
    return [
      `**${agent.name}** (${engineName(agent)} engine)`,
      `- Model: ${cs?.model || agent.model || 'default'}${cs?.model ? ' (this chat)' : ''}`,
      `- Effort: ${cs?.effort || agent.effort || 'default'}${cs?.effort ? ' (this chat)' : ''}`,
      agent.engine === 'codex' ? `- Web search: ${cs?.web || (agent.webSearch && agent.webSearch !== 'disabled' ? agent.webSearch : 'off')}${cs?.web ? ' (this chat)' : ''}` : null,
      agent.engine === 'codex' && (cs?.verbosity || agent.verbosity) ? `- Verbosity: ${cs?.verbosity || agent.verbosity}` : null,
      `- Persona: ${cs?.persona ? `${PERSONAS[cs.persona]?.label || 'custom'} (this chat)` : agent.systemPrompt ? 'custom instructions' : 'plain'}`,
      `- Files: ${agent.workspace ? `${agent.engine === 'codex' ? (agent.codexFiles === 'edit' ? 'edit' : 'read only') : 'read + edit'} in ${agent.workspace}` : 'off'}`,
      agent.engine === 'codex' ? `- ChatGPT apps: ${agent.chatgptApps ? 'on' : 'off'} · talk-back tools: ${agent.chatTools ? 'on' : 'off'} · suggestions: ${agent.suggestNext ? 'on' : 'off'}` : null,
      `- Memory: auto-save ${agent.autoMemory === false ? 'off' : 'on'}`,
      `- Session: ${chat?.session?.id ? `\`${chat.session.id.slice(0, 13)}…\`` : 'new (next message starts one)'}${chat?.session?.totals ? ` · thread so far ${fmt(chat.session.totals.input)} in · ${fmt(chat.session.totals.output)} out` : ''}`,
      `- Collab mode: ${MODES[st.mode] ? `${MODES[st.mode].label}${st.rounds > 1 ? ` ×${st.rounds}` : ''}` : 'solo'}${collabs.length ? ` · ${collabs.length} collab(s) here, ${fmt(ct)} tokens` : ''}`,
    ].filter(Boolean).join('\n');
  }

  // ---------- commands ----------
  const R = (def) => Commands.register(def);
  const completeFrom = (list) => (args) => list.filter((x) => x.value.toLowerCase().startsWith(args.toLowerCase().trim()) || !args.trim());
  // Models you typed yourself are remembered per engine (completion and Ctrl+Alt+M include them).
  const recentModels = (eng) => store.get(`astra.models.${eng}`, []) || [];
  function rememberModel(eng, model) {
    if (!model || MODELS[eng]?.includes(model)) return;
    store.set(`astra.models.${eng}`, [model, ...recentModels(eng).filter((x) => x !== model)].slice(0, 6));
  }
  const modelChoices = (agentId) => {
    const a = H.agent(agentId);
    const eng = a?.mode === 'native' ? a.engine : 'codex';
    return [...new Set([...(MODELS[eng] || []), a?.model, ...recentModels(eng)].filter(Boolean))].map((m) => ({ value: m, hint: m === a?.model ? 'agent default' : MODELS[eng]?.includes(m) ? '' : 'used before' }));
  };
  // Optional leading "a→b" / "a>b" / "a to b" and a round count, then the task.
  function parseLead(args, hostId) {
    let rest = args.trim();
    let order = null;
    let rounds = null;
    const dir = rest.match(/^([\w@:.~-]+?)\s*(?:→|->|>|\bto\b)\s*([\w@:.~-]+)\s+/i);
    if (dir) {
      const a = parseSeat(dir[1], hostId, 0); const b = parseSeat(dir[2], hostId, 1);
      if (a && b) { order = [a, b]; rest = rest.slice(dir[0].length); }
    }
    const n = rest.match(/^(\d)\s+/);
    if (n && Number(n[1]) >= 1 && Number(n[1]) <= 6) { rounds = Number(n[1]); rest = rest.slice(n[0].length); }
    return { order, rounds, task: rest.trim() };
  }
  // Optional leading comma list of seats ("claude,astra@skeptic,astra:gpt-6-luna").
  function parseSeats(args, hostId) {
    const all = args.trim().match(/^all\s+([\s\S]*)$/i); // every chat agent in the rail
    if (all) return { seats: natives().filter((a) => !a.dock).slice(0, 6).map((a) => seatOf(a)), task: all[1].trim() };
    const m = args.trim().match(/^([\w@:.~-]+(?:,[\w@:.~-]+)+)\s+([\s\S]*)$/);
    if (!m) return { seats: null, task: args.trim() };
    const seats = m[1].split(',').map((w, i) => parseSeat(w, hostId, i));
    if (seats.some((s) => !s)) return { seats: null, task: args.trim() };
    return { seats, task: m[2].trim() };
  }
  // "--judge astra" anywhere in the arguments: that agent writes the final answer.
  function judgeFlag(args, hostId) {
    const m = args.match(/(^|\s)--judge[= ]([\w-]+)/);
    return m ? { judge: findAgent(m[2], hostId), rest: args.replace(m[0], ' ').trim() } : { judge: null, rest: args };
  }
  const judgeIndex = (seats, agent) => { if (!agent) return null; const i = seats.findIndex((x) => x.agentId === agent.id && !x.persona); return i >= 0 ? i : seats.findIndex((x) => x.agentId === agent.id); };
  const defaultPair = (hostId) => { const s = seatsFor(hostId); return s.length ? s : [claude(), astra()].filter(Boolean).map((a) => seatOf(a)); };
  const go = (ctx, mode, task, seats, opts = {}) => {
    const host = H.agent(ctx.agentId);
    if (!host || host.mode !== 'native') throw new Error('Run collaborations from a native chat (Claude or Astra).');
    const eff = task.match(/^~(\w+)\s+/); // "~low <task>": every seat thinks with that effort (when its engine has it)
    if (eff) { task = task.slice(eff[0].length); seats = seats.map((st) => (!st.effort && (EFFORTS[st.engine] || []).includes(eff[1].toLowerCase()) ? { ...st, effort: eff[1].toLowerCase(), label: `${st.label} ~${eff[1].toLowerCase()}` } : st)); }
    const att = Native.takeAttachments(ctx.agentId); // text files join the task, pictures go to every seat
    start(ctx.agentId, mode, `${task}${att.full}`, seats, { ...opts, images: att.images }).catch((err) => toast(err.message, { type: 'error' }));
  };
  const lastCollab = new Map(); // host id -> the last collab's settings (for /collab-again)
  const lastCollabMsg = (agentId) => [...(Native.chatOf(agentId)?.messages || [])].reverse().find((m) => m.role === 'collab');
  const seatHint = 'seats: claude, astra, astra:<model>, claude@<persona>';
  function completeSeats(a) {
    const words = a.split(/\s+/);
    if (words.length > 1 && !/^\d$/.test(words[0])) return [];
    const last = words.at(-1);
    const head = a.slice(0, a.length - last.length);
    const part = last.split(',').pop();
    const before = last.slice(0, last.length - part.length);
    const m = part.match(/^([^:@~]+)([:@~])([\w.-]*)$/);
    if (m) {
      const ag = findAgent(m[1]);
      const pool = m[2] === '@' ? Object.keys(PERSONAS) : m[2] === ':' ? [...(MODELS[ag?.engine] || []), ...recentModels(ag?.engine)] : EFFORTS[ag?.engine] || [];
      return pool.filter((x) => x.startsWith(m[3])).slice(0, 12).map((x) => ({ value: `${head}${before}${m[1]}${m[2]}${x}`, hint: m[2] === '@' ? PERSONAS[x]?.label : '' }));
    }
    if (!part) return [{ value: `${a}claude,astra `, hint: seatHint }];
    return ['claude', 'astra', 'all', ...natives().filter((x) => !x.dock).map((x) => x.name.toLowerCase())].filter((x, i, l) => l.indexOf(x) === i && x.startsWith(part.toLowerCase()) && x !== part.toLowerCase()).map((x) => ({ value: `${head}${before}${x}`, hint: 'seat' }));
  }

  R({ name: 'duo', area: 'Collab', args: '[seats] <message>', desc: 'Claude and Astra answer side by side; pick one or merge them',
    complete: (a) => (a ? completeSeats(a) : [{ value: 'claude,astra ', hint: seatHint }]),
    run: (args, ctx) => {
      if (/(^|\s)--fresh\b/.test(args)) { const c = Native.chatOf(ctx.agentId); if (c) delete c.duoSessions; } // forget earlier duo turns
      const { seats, task } = parseSeats(stripFlags(args), ctx.agentId);
      go(ctx, 'duo', task, seats || defaultPair(ctx.agentId));
    } });
  R({ name: 'relay', area: 'Collab', args: '[a→b] [passes] <task>', desc: 'One drafts, the other improves it (passes alternate)',
    complete: (a) => (a ? [] : [{ value: 'claude→astra 1 ', hint: 'Claude drafts, Astra improves' }, { value: 'astra→claude 2 ', hint: 'Astra drafts, two improvement passes' }]),
    run: (args, ctx) => { const { order, rounds, task } = parseLead(args, ctx.agentId); go(ctx, 'relay', task, order || defaultPair(ctx.agentId), { rounds: rounds || getMode(ctx.agentId).rounds || 1 }); } });
  R({ name: 'critique', aliases: ['review-by'], area: 'Collab', args: '[a→b] [rounds] <task>', desc: 'One drafts, the other reviews it, the first revises (stops early on LGTM)',
    complete: (a) => (a ? [] : [{ value: 'claude→astra 1 ', hint: 'Astra reviews Claude' }, { value: 'astra→claude 2 ', hint: 'Claude reviews Astra twice' }]),
    run: (args, ctx) => { const { order, rounds, task } = parseLead(args, ctx.agentId); go(ctx, 'critique', task, order || defaultPair(ctx.agentId), { rounds: rounds || getMode(ctx.agentId).rounds || 1 }); } });
  R({ name: 'debate', area: 'Collab', args: '[rounds] [seats] <question>', desc: 'They answer, read each other and reply for N rounds, then one merged final answer',
    complete: (a) => (a ? completeSeats(a) : [{ value: '2 ', hint: 'two rounds (default)' }, { value: '3 claude,astra@skeptic ', hint: seatHint }]),
    run: (args, ctx) => {
      const { judge, rest: a1 } = judgeFlag(args, ctx.agentId);
      const { rounds, task: rest } = parseLead(a1, ctx.agentId);
      const { seats, task } = parseSeats(rest, ctx.agentId);
      const list = seats || defaultPair(ctx.agentId);
      go(ctx, 'debate', task, list, { rounds: rounds || Math.max(2, getMode(ctx.agentId).rounds), judge: judgeIndex(list, judge) });
    } });
  R({ name: 'council', area: 'Collab', args: '[seats] <question>', desc: 'Several seats (agents and personas) answer, the chair writes the final answer',
    complete: (a) => (a ? completeSeats(a) : [{ value: 'claude,astra,astra@skeptic ', hint: seatHint }, { value: 'coder,reviewer,researcher ', hint: 'personas, engines alternate' }]),
    run: (args, ctx) => {
      const { judge, rest } = judgeFlag(args, ctx.agentId);
      const { seats, task } = parseSeats(rest, ctx.agentId);
      const def = [...defaultPair(ctx.agentId), seatOf(astra() || claude(), { persona: 'skeptic' })].filter((s) => s.agentId);
      const list = (seats || def).slice(0, 6);
      go(ctx, 'council', task, list, { judge: judgeIndex(list, judge) });
    } });
  R({ name: 'compare', area: 'Collab', args: '<seats> <task>', desc: 'Same task to different models or agents side by side (e.g. astra:gpt-6-sol,astra:gpt-6-luna)',
    complete: (a) => (a ? completeSeats(a) : [{ value: 'claude,astra ', hint: 'two engines' }, ...((MODELS.codex.length > 1) ? [{ value: `astra:${MODELS.codex[0]},astra:${MODELS.codex[2]} `, hint: 'two Astra models' }] : []), { value: `claude:${MODELS.claude[0]},claude:${MODELS.claude[1]} `, hint: 'two Claude models' }]),
    run: (args, ctx) => {
      const { seats, task } = parseSeats(args, ctx.agentId);
      if (!seats) return 'Name what to compare first, e.g. `/compare astra:gpt-6-sol,astra:gpt-6-luna explain monads` or `/compare claude,astra …`.';
      go(ctx, 'compare', task, seats.slice(0, 3));
    } });
  R({ name: 'handoff', area: 'Collab', args: '[agent] [--raw]', desc: 'Continue this chat with the other agent from a compact summary (--raw: last messages, no extra turn)',
    complete: () => [{ value: 'back', hint: 'return to the chat this one came from' }, ...natives().filter((a) => !a.dock).map((a) => ({ value: a.name.toLowerCase(), hint: a.engine === 'codex' ? 'Astra engine' : 'Claude engine' }))],
    run: async (args, ctx) => {
      const host = H.agent(ctx.agentId);
      if (/^back\b/i.test(args.trim())) { await handoffBack(ctx.agentId); return; }
      const seat = stripFlags(args) ? parseSeat(stripFlags(args), ctx.agentId) : null;
      const target = (seat && H.agent(seat.agentId)) || partner(host);
      await handoff(ctx.agentId, target?.id, { raw: /--raw\b/.test(args), model: seat?.model, persona: seat?.persona });
    } });
  R({ name: 'collab', area: 'Collab', args: '[duo|relay|critique|debate|council|off] [rounds]', desc: 'Set the composer\'s collab mode (the ⚇ chip): your next messages go to both',
    complete: completeFrom([...Object.entries(MODES).filter(([k]) => k !== 'compare').map(([k, m]) => ({ value: k, hint: m.desc })), { value: 'off', hint: 'back to solo' }, { value: 'swap', hint: 'swap who goes first' }]),
    run: (args, ctx) => {
      const [w, n] = args.toLowerCase().split(/\s+/);
      if (!w) { const c = chipEls.get(ctx.agentId); if (c) chipMenu(ctx.agentId, c.chip); return; }
      if (w === 'swap') { setMode(ctx.agentId, { swap: !getMode(ctx.agentId).swap }); return `Order: ${seatsFor(ctx.agentId).map((s) => s.name).join(' → ')}`; }
      if (['off', 'solo', 'none'].includes(w)) { setMode(ctx.agentId, { mode: 'solo' }); return 'Collab off: messages go to this agent only.'; }
      if (!MODES[w] || w === 'compare') return `Unknown mode “${w}”. Try duo, relay, critique, debate or council.`;
      const st = setMode(ctx.agentId, { mode: w, ...(Number(n) ? { rounds: Math.min(6, Math.max(1, Number(n))) } : {}) });
      return `${MODES[w].icon} ${MODES[w].label} on: your next messages go to ${seatsFor(ctx.agentId).map((s) => s.name).join(' and ')}${st.rounds > 1 && w !== 'duo' ? ` (${st.rounds} rounds)` : ''}. /collab off to stop.`;
    } });
  R({ name: 'pick', area: 'Collab', args: '<1|2|name>', desc: 'Keep one answer of the last duo / compare (your next message continues from it)',
    complete: (a, ctx) => (lastCollabMsg(ctx.agentId)?.seats || []).map((s, i) => ({ value: String(i + 1), hint: s.label })),
    run: (args, ctx) => {
      const m = lastCollabMsg(ctx.agentId);
      if (!m) return 'No collaboration in this chat yet.';
      const n = Number(args);
      const idx = n ? n - 1 : m.seats.findIndex((s) => s.name.toLowerCase().startsWith(args.toLowerCase()) || (findAgent(args, ctx.agentId)?.id === s.agentId));
      if (idx < 0 || !m.seats[idx]) return `Pick 1–${m.seats.length}.`;
      pick(ctx.agentId, m, idx);
    } });
  R({ name: 'merge', area: 'Collab', args: '[judge]', desc: 'Merge the last collaboration\'s answers into one (judge: claude or astra)',
    complete: () => [{ value: 'claude' }, { value: 'astra' }],
    run: async (args, ctx) => {
      const m = lastCollabMsg(ctx.agentId);
      if (!m) return 'No collaboration in this chat yet.';
      const j = args ? m.seats.findIndex((s) => s.agentId === findAgent(args, ctx.agentId)?.id) : null;
      await merge(ctx.agentId, m, j >= 0 ? j : null);
    } });
  R({ name: 'collab-stop', area: 'Collab', desc: 'Stop the collaborations running in this chat',
    run: (args, ctx) => { const n = stopAllIn(ctx.agentId); return n ? `Stopping ${n} collaboration${n > 1 ? 's' : ''}.` : 'Nothing is running.'; } });
  R({ name: 'collab-again', area: 'Collab', args: '[new task|swap]', desc: 'Run the last collaboration again (optionally with a new task)',
    complete: () => [{ value: 'swap', hint: 'same task, the other one goes first' }],
    run: (args, ctx) => {
      const last = lastCollab.get(ctx.agentId) || lastCollabMsg(ctx.agentId);
      if (!last) return 'No collaboration to repeat yet.';
      if (args.trim() === 'swap') { go(ctx, last.mode, last.task, [...last.seats].reverse(), { rounds: last.rounds }); return; }
      go(ctx, last.mode, args || last.task, last.seats, { rounds: last.rounds, judge: last.judge });
    } });
  R({ name: 'collab-stats', area: 'Collab', desc: 'Token totals of every collaboration in this chat, per participant',
    run: (args, ctx) => {
      const ms = (Native.chatOf(ctx.agentId)?.messages || []).filter((m) => m.role === 'collab');
      if (!ms.length) return 'No collaborations in this chat yet.';
      const by = new Map();
      for (const m of ms) { const t = totals(m); m.seats.forEach((s, i) => { const x = by.get(s.name) || { input: 0, output: 0, turns: 0 }; x.input += t.per[i].input; x.output += t.per[i].output; x.turns += t.per[i].turns; by.set(s.name, x); }); }
      const all = [...by.values()].reduce((n, x) => n + x.input + x.output, 0);
      return [`**${ms.length} collaboration${ms.length > 1 ? 's' : ''} in this chat** · ${fmt(all)} tokens`, ...[...by].map(([n, x]) => `- ${n}: ${x.input.toLocaleString()} in · ${x.output.toLocaleString()} out · ${x.turns} turns`)].join('\n');
    } });
  R({ name: 'collab-export', area: 'Collab', args: '[all]', desc: 'Copy the last collaboration (or all of this chat\'s) with every round as Markdown',
    complete: () => [{ value: 'all', hint: 'every collaboration in this chat' }],
    run: (args, ctx) => {
      if (args.trim() === 'all') {
        const ms = (Native.chatOf(ctx.agentId)?.messages || []).filter((x) => x.role === 'collab');
        if (!ms.length) return 'No collaboration in this chat yet.';
        copyText(ms.map(collabMarkdown).join('\n---\n\n'), `${ms.length} collaborations copied`);
        return;
      }
      const m = lastCollabMsg(ctx.agentId); if (!m) return 'No collaboration in this chat yet.'; copyText(collabMarkdown(m), 'Collaboration copied');
    } });
  R({ name: 'opinion', aliases: ['second-opinion'], area: 'Collab', args: '[claude|astra]', desc: 'Second opinion on the last reply from the other agent (works both ways)',
    complete: () => [{ value: 'claude' }, { value: 'astra' }],
    run: (args, ctx) => { const shot = /--shot\b/.test(args); const to = stripFlags(args) ? findAgent(stripFlags(args), ctx.agentId) : null; Native.secondOpinion(ctx.agentId, to?.id || null, shot ? { screenshot: true } : {}); } });
  for (const [name, who] of [['ask-astra', 'astra'], ['ask-claude', 'claude']]) {
    R({ name, area: 'Collab', args: '<question>', desc: `Quick answer from ${who === 'astra' ? 'Astra' : 'Claude'} right in this chat (one lean turn)`,
      run: async (args, ctx) => {
        const target = findAgent(who, ctx.agentId);
        if (!target) return `No ${who === 'astra' ? 'Astra' : 'Claude'} agent is set up.`;
        // "--shot" attaches a screenshot of the window; "@persona" answers in that persona
        const shot = /(^|\s)--shot\b/.test(args);
        const pm = args.match(/(^|\s)@([\w-]+)/);
        const persona = pm && PERSONAS[pm[2].toLowerCase()] ? pm[2].toLowerCase() : null;
        const q = args.replace(/(^|\s)--shot\b/, ' ').replace(persona ? pm[0] : /$^/, ' ').trim();
        if (!q) return `Ask something: /${name} [--shot] [@persona] <question>`;
        const chat = Native.ensureChat(ctx.agentId, q);
        const t = toast(`Asking ${target.name}…`, { timeout: 60000 });
        const images = Native.takeAttachments(ctx.agentId).images;
        if (shot) { const p = await window.hub.captureWindow(); if (p) images.push(p); }
        const r = await window.hub.askOnce({ agentId: target.id, text: q, images, options: { lean: true, ...(persona ? { persona: personaText(target, persona) } : {}) } });
        t.remove();
        if (!r.ok) throw new Error(r.error || 'No answer');
        if (r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: target.id, usage: r.usage, source: 'quick ask' } }));
        chat.messages.push({ role: 'user', text: `/${name} ${args}`, at: Date.now() }, { role: 'opinion', from: target.name, text: clean(r.text), at: Date.now(), ...(r.usage ? { cost: r.usage } : {}) });
        Native.save(chat);
        Native.refresh(ctx.agentId);
      } });
  }

  R({ name: 'astra', area: 'Astra', args: '[message]', desc: 'Open Astra (and send it a message)',
    run: async (args) => {
      const a = astra();
      if (!a) return 'No Astra agent yet: add one with ＋ → Astra.';
      activate(H.surfaceIdFor(a.id));
      if (args) await Native.send(a.id, args);
    } });
  R({ name: 'astra-new', area: 'Astra', desc: 'New chat with Astra', run: () => { const a = astra(); if (!a) return 'No Astra agent yet.'; activate(H.surfaceIdFor(a.id)); Native.newChat(a.id); } });
  R({ name: 'astra-model', aliases: ['model'], area: 'Astra', args: '[model] [--default]', desc: 'Switch this chat\'s model (--default: the agent\'s default)',
    complete: (a, ctx) => modelChoices(ctx.agentId).filter((x) => x.value.startsWith(a.trim())),
    run: (args, ctx) => {
      const agent = targetAgent(ctx);
      if (!agent) return 'No native agent here.';
      const model = stripFlags(args);
      if (!model) return `Models for ${agent.name}: ${modelChoices(agent.id).map((x) => `\`${x.value}\``).join(', ')} (now: ${Native.chatOf(agent.id)?.model || agent.model || 'default'}). Ctrl+Alt+M cycles them.`;
      rememberModel(agent.engine, model);
      if (isDefault(args)) { setAgent(agent, { model }); return `${agent.name} now uses ${model} by default.`; }
      return chatSetting({ agentId: agent.id }, 'model', model, `This chat now uses ${model}.`);
    } });
  R({ name: 'astra-effort', aliases: ['effort'], area: 'Astra', args: '[level] [--default]', desc: 'Reasoning effort for this chat (minimal…xhigh for Astra, low…max for Claude)',
    complete: (a, ctx) => (EFFORTS[H.agent(ctx.agentId)?.engine] || EFFORTS.codex).map((v) => ({ value: v })).filter((x) => x.value.startsWith(a.trim())),
    run: (args, ctx) => {
      const agent = targetAgent(ctx);
      const level = stripFlags(args).toLowerCase();
      const allowed = EFFORTS[agent.engine];
      if (!level) return `Effort for ${agent.name}: ${allowed.join(', ')} (now: ${Native.chatOf(agent.id)?.effort || agent.effort || 'default'}). Lower = fewer tokens.`;
      if (level === 'default') return chatSetting({ agentId: agent.id }, 'effort', null, 'This chat uses the agent\'s effort again.');
      if (!allowed.includes(level)) return `${agent.name} accepts ${allowed.join(', ')}.`;
      if (isDefault(args)) { setAgent(agent, { effort: level }); return `${agent.name}'s default effort is now ${level}.`; }
      return chatSetting({ agentId: agent.id }, 'effort', level, `This chat now thinks with ${level} effort.`);
    } });
  R({ name: 'astra-preset', area: 'Astra', args: '<frugal|fast|balanced|deep|max> [--default]', desc: 'Effort + verbosity bundles for this chat',
    complete: completeFrom(Object.entries(PRESETS).map(([k, p]) => ({ value: k, hint: p.desc }))),
    run: (args, ctx) => {
      const agent = targetAgent(ctx);
      const p = PRESETS[stripFlags(args).toLowerCase()];
      if (!p) return `Presets: ${Object.entries(PRESETS).map(([k, x]) => `\`${k}\` (${x.desc})`).join(', ')}.`;
      const effort = EFFORTS[agent.engine].includes(p.effort) ? p.effort : 'low';
      if (isDefault(args)) { setAgent(agent, { effort, verbosity: agent.engine === 'codex' ? p.verbosity || undefined : agent.verbosity }); return `${agent.name} defaults to ${p.label}.`; }
      chatPatch(agent.id, { effort, ...(agent.engine === 'codex' ? { verbosity: p.verbosity || null } : {}) });
      return `${p.label}: ${p.desc} (effort ${effort}${agent.engine === 'codex' && p.verbosity ? `, ${p.verbosity} verbosity` : ''}).`;
    } });
  R({ name: 'astra-web', area: 'Astra', args: '[off|cached|live] [--default]', desc: 'Web search for Astra in this chat (adds tokens when used)',
    complete: completeFrom(WEB.map((v) => ({ value: v, hint: v === 'cached' ? 'cached results, cheaper' : v === 'live' ? 'fresh results' : 'no web' }))),
    run: (args, ctx) => {
      const agent = targetAgent(ctx, { codexOnly: true });
      if (!agent) return 'No Astra agent yet.';
      const v = stripFlags(args).toLowerCase();
      if (!WEB.includes(v)) return `Web search: ${WEB.join(', ')} (now: ${Native.chatOf(agent.id)?.web || agent.webSearch || 'off'}).`;
      if (isDefault(args)) { setAgent(agent, { webSearch: v === 'off' ? undefined : v }); return `${agent.name}'s web search is ${v} by default.`; }
      return chatSetting({ agentId: agent.id }, 'web', v === (agent.webSearch || 'off') ? null : v, `Web search ${v} for this chat.`);
    } });
  R({ name: 'astra-verbosity', area: 'Astra', args: '[low|medium|high|default]', desc: 'How long Astra\'s answers are in this chat',
    complete: completeFrom(['low', 'medium', 'high', 'default'].map((v) => ({ value: v }))),
    run: (args, ctx) => {
      const agent = targetAgent(ctx, { codexOnly: true });
      const v = args.toLowerCase().trim();
      if (!['low', 'medium', 'high', 'default'].includes(v)) return 'Verbosity: low, medium, high or default.';
      return chatSetting({ agentId: agent.id }, 'verbosity', v === 'default' ? null : v, v === 'default' ? 'Default answer length.' : `Answers: ${v} verbosity.`);
    } });
  R({ name: 'astra-thinking', area: 'Astra', args: '[on|off|concise|detailed]', desc: 'Show Astra\'s thinking summaries (off saves tokens)',
    complete: completeFrom(['on', 'off', 'concise', 'detailed'].map((v) => ({ value: v }))),
    run: (args, ctx) => {
      const agent = targetAgent(ctx, { codexOnly: true });
      const v = args.toLowerCase().trim();
      if (v === 'off') setAgent(agent, { showThinking: false, reasoningSummary: undefined });
      else if (v === 'on') setAgent(agent, { showThinking: undefined, reasoningSummary: undefined });
      else if (['concise', 'detailed'].includes(v)) setAgent(agent, { showThinking: undefined, reasoningSummary: v });
      else return `Thinking: ${agent.showThinking === false ? 'off' : agent.reasoningSummary || 'on'}. Use on, off, concise or detailed.`;
      return `${agent.name}'s thinking: ${v}.`;
    } });
  R({ name: 'astra-persona', aliases: ['persona'], area: 'Astra', args: '[name|off|your own text] [--default]', desc: 'Give this chat a persona (coder, reviewer, writer, researcher, director…)',
    complete: (a) => [...Object.entries(PERSONAS).map(([k, p]) => ({ value: k, label: p.label, hint: p.text.slice(0, 60) })), { value: 'off', hint: 'back to plain' }].filter((x) => x.value.startsWith(a.trim().toLowerCase())),
    run: (args, ctx) => {
      const agent = targetAgent(ctx);
      const raw = stripFlags(args);
      const key = raw.toLowerCase();
      if (!raw) return `Personas: ${Object.entries(PERSONAS).map(([k, p]) => `\`${k}\` ${p.label}`).join(' · ')}. Or type your own: \`/astra-persona You are a…\``;
      if (['off', 'none', 'plain'].includes(key)) {
        if (isDefault(args)) { setAgent(agent, { systemPrompt: undefined }); return `${agent.name} has no default persona now.`; }
        return chatSetting({ agentId: agent.id }, 'persona', null, 'Persona off for this chat.');
      }
      const value = PERSONAS[key] ? key : raw;
      if (isDefault(args)) { setAgent(agent, { systemPrompt: personaText(agent, value) }); return `${agent.name}'s default persona: ${PERSONAS[key]?.label || 'custom'}.`; }
      return chatSetting({ agentId: agent.id }, 'persona', value, `Persona for this chat: ${PERSONAS[key]?.label || 'custom'} (replaces its instructions; memory stays).`);
    } });
  R({ name: 'astra-personas', area: 'Astra', desc: 'List the persona presets',
    run: () => Object.entries(PERSONAS).map(([k, p]) => `- \`${k}\` **${p.label}**: ${p.text}`).join('\n') });
  R({ name: 'astra-files', area: 'Astra', args: '[pick|read|edit|off]', desc: 'Opt-in file access for Astra: a folder it can read (or edit) inside Codex\'s sandbox',
    complete: completeFrom([{ value: 'pick', hint: 'choose the folder' }, { value: 'read', hint: 'read only (default)' }, { value: 'edit', hint: 'may change files in that folder' }, { value: 'off', hint: 'no file access' }]),
    run: async (args, ctx) => {
      const agent = targetAgent(ctx, { codexOnly: true });
      if (!agent) return 'No Astra agent yet.';
      const v = args.trim();
      if (!v) return `Files: ${agent.workspace ? `${agent.codexFiles === 'edit' ? 'edit' : 'read'} in ${agent.workspace}` : 'off'}. /astra-files pick to choose a folder; read / edit / off.`;
      if (v === 'off') { setAgent(agent, { workspace: undefined, codexFiles: undefined }); return 'File access off.'; }
      if (v === 'read' || v === 'edit') {
        if (!agent.workspace) return 'Pick a folder first: /astra-files pick';
        if (v === 'edit' && !(await Modal.confirm('Let Astra edit files?', `Astra will be able to change files inside ${agent.workspace} (Codex's sandbox blocks writes elsewhere and the network). Commit your work in git first so changes are easy to undo.`, { ok: 'Allow edits' }))) return;
        setAgent(agent, { codexFiles: v === 'edit' ? 'edit' : undefined });
        return `Astra can ${v === 'edit' ? 'read and edit' : 'read'} files in ${agent.workspace}.`;
      }
      const folder = v === 'pick' ? await window.hub.pickFolder(agent.workspace || '', 'Folder Astra may read') : v;
      if (!folder) return;
      setAgent(agent, { workspace: folder });
      return `Astra can read files in ${folder} (read-only). /astra-files edit to allow changes. Adds the shell tool's description to each message.`;
    } });
  R({ name: 'astra-apps', area: 'Astra', args: '[on|off]', desc: 'Apps connected to your ChatGPT account (adds tokens per message)',
    complete: completeFrom([{ value: 'on' }, { value: 'off' }]),
    run: (args, ctx) => {
      const agent = targetAgent(ctx, { codexOnly: true });
      const v = args.trim().toLowerCase();
      if (!['on', 'off'].includes(v)) return `ChatGPT apps are ${agent.chatgptApps ? 'on' : 'off'} for ${agent.name}. They're set up at chatgpt.com → Settings → Apps; each one adds its tool descriptions to every message.`;
      setAgent(agent, { chatgptApps: v === 'on' ? true : undefined });
      return `ChatGPT apps ${v} for ${agent.name}.`;
    } });
  R({ name: 'astra-talkback', area: 'Astra', args: '[on|off]', desc: 'Let Astra ask you questions, show plans and get Claude\'s opinion (adds tool descriptions)',
    complete: completeFrom([{ value: 'on' }, { value: 'off' }]),
    run: (args, ctx) => {
      const agent = targetAgent(ctx, { codexOnly: true });
      const v = args.trim().toLowerCase();
      if (!['on', 'off'].includes(v)) return `Talk-back tools are ${agent.chatTools ? 'on' : 'off'} for ${agent.name}.`;
      setAgent(agent, { chatTools: v === 'on' ? true : undefined });
      return `Talk-back ${v}: ${v === 'on' ? 'question cards, live plans, pictures and second opinions from Claude' : 'plain chat'}.`;
    } });
  R({ name: 'astra-suggest', area: 'Astra', args: '[on|off]', desc: 'Next-step suggestion buttons under Astra\'s replies (a few tokens)',
    complete: completeFrom([{ value: 'on' }, { value: 'off' }]),
    run: (args, ctx) => {
      const agent = targetAgent(ctx, { codexOnly: true });
      const v = args.trim().toLowerCase();
      if (!['on', 'off'].includes(v)) return `Suggestions are ${agent.suggestNext || agent.chatTools ? 'on' : 'off'}.`;
      setAgent(agent, { suggestNext: v === 'on' ? true : undefined });
      return `Suggestions ${v}.`;
    } });
  R({ name: 'astra-memory-shared', area: 'Astra', args: '<fact>', desc: 'Add a fact every agent keeps in mind (shared memory)',
    run: async (args) => {
      if (!args) return 'Say what every agent should remember.';
      const memory = await window.hub.getMemory();
      memory.shared = [String(memory.shared || '').trim(), `- ${args.trim()}`].filter(Boolean).join('\n');
      await window.hub.saveMemory(memory);
      return `Every agent now remembers: ${args.trim()}`;
    } });
  R({ name: 'astra-clone', area: 'Astra', args: '<persona>', desc: 'Add an Astra variant with that persona (e.g. Astra Reviewer), handy as a collab partner',
    complete: (a) => Object.entries(PERSONAS).filter(([k]) => k.startsWith(a.trim())).map(([k, p]) => ({ value: k, hint: p.label })),
    run: (args) => {
      const base = astra();
      const key = args.trim().toLowerCase();
      if (!base) return 'No Astra agent to copy yet.';
      if (!PERSONAS[key]) return `Personas: ${Object.keys(PERSONAS).join(', ')}.`;
      const name = `${base.name} ${PERSONAS[key].label}`.slice(0, 30);
      if (H.agents().some((a) => a.name === name)) return `${name} already exists.`;
      let id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      for (let n = 2; H.config.agents.some((a) => a.id === id); n += 1) id = `${id}-${n}`;
      H.config.agents.push({ id, name, mode: 'native', engine: 'codex', model: base.model, effort: base.effort, color: base.color, icon: '✦', url: base.url, askAll: false, systemPrompt: personaText({ name }, key) });
      saveConfig();
      return `Added ${name} to the rail. /collab-partner ${name.toLowerCase()} makes it this chat's partner.`;
    } });
  R({ name: 'astra-feature', area: 'Astra', args: '<feature> <on|off>', desc: 'Switch one of Codex\'s disabled features back on for Astra (each adds tool definitions to every message)',
    complete: (a) => FEATURES.filter((f) => f.startsWith(a.trim().split(/\s+/)[0] || '')).map((f) => ({ value: `${f} `, hint: (astra()?.codexFeatures || []).includes(f) ? 'on' : 'off' })),
    run: (args, ctx) => {
      const agent = targetAgent(ctx, { codexOnly: true });
      const [f, v] = args.trim().split(/\s+/);
      if (!agent) return 'No Astra agent yet.';
      if (!FEATURES.includes(f) || !['on', 'off'].includes(v)) return `Usage: /astra-feature <${FEATURES.join('|')}> on|off. On now: ${(agent.codexFeatures || []).join(', ') || 'none'}.`;
      const set = new Set(agent.codexFeatures || []);
      if (v === 'on') set.add(f); else set.delete(f);
      setAgent(agent, { codexFeatures: set.size ? [...set] : undefined });
      return `Codex feature ${f} ${v} for ${agent.name}${v === 'on' ? ' (adds its tools to every message)' : ''}.`;
    } });
  R({ name: 'astra-flags', area: 'Astra', args: '[agent]', desc: 'The exact command line Hearth runs for an agent (frugal flags, features, sandbox)',
    complete: () => natives().map((a) => ({ value: a.name.toLowerCase() })),
    run: async (args, ctx) => {
      const agent = (args && findAgent(args, ctx.agentId)) || targetAgent(ctx);
      const r = await window.hub.engineDoctor();
      const p = r.prompts?.find((x) => x.id === agent?.id);
      if (!p?.args) return 'No command line for that agent.';
      return `**${p.name}** runs (new chat):\n\`\`\`\n${p.engine === 'codex' ? 'codex' : 'claude'} ${p.args.map((x) => (/[\s"']/.test(x) ? JSON.stringify(x) : x)).join(' ')}\n\`\`\``;
    } });
  R({ name: 'astra-memory', area: 'Astra', args: '[fact to remember]', desc: 'Show Astra\'s memory, or add a fact to it',
    run: async (args, ctx) => {
      const agent = targetAgent(ctx);
      const memory = await window.hub.getMemory();
      if (args) { await Native.rememberFacts(agent.id, [args]); return `Saved to ${agent.name}'s memory: ${args}`; }
      const notes = (memory.agents?.[agent.id] || '').trim();
      return `**${agent.name}'s memory**\n${notes || '_empty_'}\n\n**Shared**\n${(memory.shared || '').trim() || '_empty_'}\n\nEdit everything in Memory (the rail's memory button).`;
    } });
  R({ name: 'astra-forget', area: 'Astra', args: '<text>', desc: 'Remove memory lines containing this text',
    run: async (args, ctx) => {
      const agent = targetAgent(ctx);
      if (!args) return 'Say what to forget.';
      const memory = await window.hub.getMemory();
      const lines = (memory.agents?.[agent.id] || '').split('\n');
      const drop = lines.filter((l) => l.toLowerCase().includes(args.toLowerCase()));
      if (!drop.length) return 'Nothing matches.';
      await Native.forgetFacts(agent.id, drop.map((l) => l.replace(/^- /, '').trim()));
      return `Forgot ${drop.length} line${drop.length > 1 ? 's' : ''}.`;
    } });
  R({ name: 'astra-status', area: 'Astra', desc: 'This chat\'s model, effort, persona, files, session and collab totals',
    run: (args, ctx) => statusText(targetAgent(ctx).id) });
  R({ name: 'astra-reset', area: 'Astra', desc: 'Start a fresh engine session for this chat (the next message carries the conversation)',
    run: (args, ctx) => { const chat = Native.chatOf(ctx.agentId); if (!chat) return 'No chat yet.'; chat.session = {}; Native.save(chat); return 'Next message starts a fresh engine session with the conversation as context.'; } });
  R({ name: 'astra-tokens', area: 'Astra', desc: 'Tokens of this chat: replies, second opinions, collaborations',
    run: (args, ctx) => {
      const chat = Native.chatOf(ctx.agentId);
      if (!chat) return 'No chat yet.';
      const sum = (f) => chat.messages.reduce((n, m) => n + f(m), 0);
      const rin = sum((m) => m.usage?.input || 0); const rout = sum((m) => m.usage?.output || 0);
      const oin = sum((m) => m.cost?.input || 0); const oout = sum((m) => m.cost?.output || 0);
      const c = chat.messages.filter((m) => m.role === 'collab').reduce((a, m) => { const t = totals(m).all; return { input: a.input + t.input, output: a.output + t.output }; }, { input: 0, output: 0 });
      return [`**Tokens in this chat**`, `- Replies: ${rin.toLocaleString()} in · ${rout.toLocaleString()} out`, oin ? `- Second opinions / quick asks: ${oin.toLocaleString()} in · ${oout.toLocaleString()} out` : null,
        c.input ? `- Collaborations: ${c.input.toLocaleString()} in · ${c.output.toLocaleString()} out (/collab-stats per participant)` : null,
        chat.session?.totals ? `- Codex thread total so far: ${chat.session.totals.input.toLocaleString()} in (${(chat.session.totals.cached || 0).toLocaleString()} cached) · ${chat.session.totals.output.toLocaleString()} out` : null].filter(Boolean).join('\n');
    } });
  R({ name: 'astra-doctor', aliases: ['doctor'], area: 'Astra', desc: 'Check Codex and Claude: found? version? signed in? with fixes',
    args: '[--run]', complete: () => [{ value: '--run', hint: 'also send Astra a tiny test message (a few tokens)' }],
    run: async (args) => {
      const report = await doctorReport();
      if (!/--run\b/.test(args) || !astra()) return report;
      const t0 = Date.now();
      const r = await window.hub.askOnce({ agentId: astra().id, text: 'Reply with just: OK', options: { lean: true, effort: 'minimal', verbosity: 'low' } });
      return `${report}\n\n**Test message**: ${r.ok ? `✓ \"${cap(clean(r.text), 60)}\" in ${((Date.now() - t0) / 1000).toFixed(1)} s${r.usage ? ` · ${fmt(r.usage.input)} in · ${fmt(r.usage.output)} out` : ''}` : `✗ ${r.error}`}`;
    } });
  R({ name: 'astra-login', area: 'Astra', desc: 'Sign Codex in with your ChatGPT account (opens its own window)',
    run: async () => { const okv = await window.hub.login('codex'); doctorCache = null; return okv ? 'Finish signing in in the window that opened, then run /astra-doctor.' : 'Codex wasn\'t found: run /astra-doctor.'; } });
  R({ name: 'astra-settings', area: 'Astra', desc: 'Open Astra\'s agent settings', run: () => { const a = astra(); if (a) Manager.open(a.id); else Manager.open(); } });
  R({ name: 'director-engine', area: 'Astra', args: '[three|video] [claude|astra]', desc: 'Run a docked director (Three / Video) on Claude or on Astra',
    complete: (a) => {
      const words = a.split(/\s+/);
      if (words.length <= 1) return natives().filter((x) => x.dock).map((x) => ({ value: `${x.dock} `, hint: `${x.name} · ${engineName(x)}` }));
      return [{ value: `${words[0]} claude`, hint: 'Claude engine' }, { value: `${words[0]} astra`, hint: 'Astra (Codex) engine' }];
    },
    run: (args) => {
      const [where, which] = args.toLowerCase().split(/\s+/);
      const directors = natives().filter((x) => x.dock);
      if (!where) return directors.length ? directors.map((d) => `- ${d.name} (${d.dock}): ${engineName(d)}${d.model ? ` · ${d.model}` : ''}`).join('\n') : 'No docked directors.';
      const d = directors.find((x) => x.dock === where || x.name.toLowerCase().startsWith(where) || x.id === where);
      if (!d) return `No director docked in “${where}”.`;
      const engine = ['astra', 'codex', 'gpt', 'a'].includes(which) ? 'codex' : ['claude', 'c'].includes(which) ? 'claude' : null;
      if (!engine) return `${d.name} runs on ${engineName(d)}. Say claude or astra.`;
      if (engine === d.engine) return `${d.name} already runs on ${engineName(d)}.`;
      // the other engine's model / effort are kept so switching back restores them
      const keep = { model: d.model, effort: d.effort };
      const back = d.otherEngine || {};
      const fallbackModel = engine === 'codex' ? astra()?.model : claude()?.model;
      setAgent(d, { engine, model: back.model || fallbackModel || undefined, effort: EFFORTS[engine].includes(back.effort || d.effort) ? back.effort || d.effort : undefined, otherEngine: keep });
      return `${d.name} now runs on ${engineName(d)}${d.model ? ` (${d.model})` : ''}. Its chats start fresh engine sessions; its tools work through MCP. ${engine === 'codex' ? 'Astra-backed directors cost more tokens per turn (tool definitions).' : ''}`;
    } });

  // ---------- collaboration presets (one searchable picker: /collab-preset) ----------
  const COLLAB_PRESETS = {
    brainstorm: { label: 'Brainstorm', mode: 'council', seats: 'claude@brainstorm,astra@brainstorm,astra@skeptic', desc: 'ideas from both, a skeptic, then the best picks' },
    codereview: { label: 'Code review', mode: 'critique', seats: 'claude@coder,astra@reviewer', rounds: 1, desc: 'Claude codes, Astra reviews, Claude fixes' },
    pair: { label: 'Pair programming', mode: 'relay', seats: 'astra@coder,claude@coder', rounds: 2, desc: 'Astra drafts the code, Claude and Astra improve it' },
    factcheck: { label: 'Fact check', mode: 'critique', seats: 'claude,astra@researcher', rounds: 1, desc: 'Claude answers, Astra checks the facts' },
    write: { label: 'Writing room', mode: 'relay', seats: 'claude@writer,astra@writer', rounds: 1, desc: 'Claude drafts, Astra edits' },
    plan: { label: 'Plan it', mode: 'council', seats: 'claude@planner,astra@planner,astra@skeptic', desc: 'two plans and a risk check, merged' },
    teach: { label: 'Explain it', mode: 'duo', seats: 'claude@teacher,astra@teacher', desc: 'two explanations side by side' },
    debug: { label: 'Debug', mode: 'duo', seats: 'claude@debugger,astra@debugger', desc: 'two debugging takes side by side' },
    visual: { label: 'Visual direction', mode: 'council', seats: 'claude@director,astra@shader,astra@skeptic', desc: 'ideas for the Lab: shots, shaders, a critic' },
    redteam: { label: 'Red team', mode: 'debate', seats: 'claude,astra@skeptic', rounds: 2, desc: 'Astra attacks the idea, Claude defends, then a verdict' },
    product: { label: 'Product call', mode: 'debate', seats: 'claude@product,astra@product', rounds: 2, desc: 'two product designers argue it out' },
    translate: { label: 'Translation check', mode: 'critique', seats: 'claude@translator,astra@translator', rounds: 1, desc: 'one translates, the other checks' },
    eli5: { label: 'Explain simply', mode: 'duo', seats: 'claude@teacher~low,astra@teacher~low', desc: 'two short, simple explanations (low effort)' },
    names: { label: 'Name it', mode: 'council', seats: 'claude@brainstorm,astra@brainstorm,claude@product', desc: 'names, taglines and a pick' },
    email: { label: 'Email polish', mode: 'relay', seats: 'claude@writer,astra@concise', rounds: 1, desc: 'Claude writes it, Astra makes it shorter' },
    security: { label: 'Security pass', mode: 'critique', seats: 'claude@coder,astra@skeptic', rounds: 2, desc: 'Astra looks for risks in Claude\'s code, twice' },
    summary: { label: 'Summary duel', mode: 'duo', seats: 'claude@concise,astra@concise', desc: 'two tight summaries side by side (pick one)' },
  };
  function runPreset(ctx, key, task) {
    const p = COLLAB_PRESETS[key];
    if (!p) return `Presets: ${Object.keys(COLLAB_PRESETS).join(', ')}.`;
    if (!task) { Native.setDraft(ctx.agentId, `/collab-preset ${key} `); return `${p.label}: ${p.desc}. Type the task after the preset name.`; }
    const seats = p.seats.split(',').map((w, i) => parseSeat(w, ctx.agentId, i)).filter(Boolean);
    if (seats.length < 2) return 'This preset needs both a Claude and an Astra agent.';
    go(ctx, p.mode, task, seats, { rounds: p.rounds || (p.mode === 'debate' ? 2 : 1) });
  }
  R({ name: 'collab-preset', aliases: ['cp'], area: 'Collab', args: '<preset> <task>', desc: 'Ready-made collaborations: brainstorm, code review, pair, fact check, red team…',
    complete: (a) => {
      const [w, ...rest] = a.split(/\s+/);
      if (rest.length) return [];
      return Object.entries(COLLAB_PRESETS).filter(([k, p]) => !w || k.startsWith(w.toLowerCase()) || p.label.toLowerCase().includes(w.toLowerCase())).map(([k, p]) => ({ value: `${k} `, label: p.label, hint: p.desc }));
    },
    run: (args, ctx) => {
      const [w, ...rest] = args.trim().split(/\s+/);
      if (!w) {
        const v = chipEls.get(ctx.agentId);
        const r = v?.chip.getBoundingClientRect() || { left: 200, top: 400 };
        showMenu(r.left, Math.max(8, r.top - 30 * Object.keys(COLLAB_PRESETS).length), Object.entries(COLLAB_PRESETS).map(([k, p]) => ({ label: `${MODES[p.mode].icon} ${p.label}: ${p.desc}`, action: () => runPreset(ctx, k, '') })));
        return;
      }
      const key = Object.keys(COLLAB_PRESETS).find((k) => k === w.toLowerCase()) || Object.keys(COLLAB_PRESETS).find((k) => k.startsWith(w.toLowerCase()));
      return runPreset(ctx, key, rest.join(' ').trim());
    } });
  for (const key of ['brainstorm', 'pair', 'factcheck', 'redteam']) {
    const p = COLLAB_PRESETS[key];
    R({ name: key, area: 'Collab', args: '<task>', desc: `${p.label}: ${p.desc}`, run: (args, ctx) => runPreset(ctx, key, args) });
  }

  // ---------- your own personas (kept in data/kv/astra-personas.json) ----------
  (async () => {
    try { for (const [k, p] of Object.entries(await window.hub.kvGet('astra-personas', {}) || {})) if (!PERSONAS[k]) PERSONAS[k] = { ...p, custom: true }; } catch { /* none yet */ }
  })();
  const saveCustomPersonas = () => window.hub.kvSet('astra-personas', Object.fromEntries(Object.entries(PERSONAS).filter(([, p]) => p.custom).map(([k, p]) => [k, { label: p.label, text: p.text }])));
  R({ name: 'astra-persona-save', area: 'Astra', args: '<name> <instructions>', desc: 'Save your own persona (usable in /astra-persona and as council seats)',
    run: async (args) => {
      const m = args.match(/^([a-z][\w-]{1,24})\s+([\s\S]{10,})$/i);
      if (!m) return 'Usage: /astra-persona-save critic You are a blunt art critic who…';
      const key = m[1].toLowerCase();
      if (PERSONAS[key] && !PERSONAS[key].custom) return `“${key}” is a built-in persona; pick another name.`;
      PERSONAS[key] = { label: m[1], text: m[2].trim().slice(0, 1200), custom: true };
      await saveCustomPersonas();
      return `Saved persona “${key}”. Use it with /astra-persona ${key} or a seat like astra@${key}.`;
    } });
  R({ name: 'astra-persona-delete', area: 'Astra', args: '<name>', desc: 'Delete one of your saved personas',
    complete: (a) => Object.entries(PERSONAS).filter(([k, p]) => p.custom && k.startsWith(a.trim())).map(([k]) => ({ value: k })),
    run: async (args) => {
      const key = args.trim().toLowerCase();
      if (!PERSONAS[key]?.custom) return 'Only your own personas can be deleted.';
      delete PERSONAS[key];
      await saveCustomPersonas();
      return `Deleted persona “${key}”.`;
    } });

  // ---------- sessions, usage, screenshots ----------
  R({ name: 'astra-session', area: 'Astra', desc: 'This chat\'s engine session id, and how to continue it in a terminal',
    run: (args, ctx) => {
      const chat = Native.chatOf(ctx.agentId);
      const agent = H.agent(ctx.agentId);
      if (!chat?.session?.id) return 'No engine session yet (send a message first).';
      copyText(chat.session.id, 'Session id copied');
      return agent.engine === 'codex'
        ? `Codex thread \`${chat.session.id}\` (copied). Continue it in a terminal with \`codex resume ${chat.session.id}\` (Hearth's sessions live in its data/workspace folder).`
        : `Claude session \`${chat.session.id}\` (copied). Continue it in a terminal from Hearth's data/workspace folder with \`claude --resume ${chat.session.id}\`.`;
    } });
  R({ name: 'astra-usage', area: 'Astra', args: '[days]', desc: 'Tokens used by Astra and Claude agents, today and over the last days',
    run: async (args) => {
      const days = Math.min(90, Math.max(1, Number(args) || 7));
      const all = await window.hub.getUsage() || {};
      const keys = Object.keys(all).sort().slice(-days);
      const by = new Map();
      for (const d of keys) for (const [id, u] of Object.entries(all[d] || {})) {
        const a = H.agent(id);
        const name = a ? `${a.name} (${engineName(a)})` : id;
        const x = by.get(name) || { input: 0, output: 0, replies: 0, today: 0 };
        x.input += u.input || 0; x.output += u.output || 0; x.replies += u.replies || 0;
        if (d === keys.at(-1) && d === new Date().toLocaleDateString('en-CA')) x.today += (u.input || 0) + (u.output || 0);
        by.set(name, x);
      }
      if (!by.size) return 'No token usage recorded yet.';
      return [`**Tokens, last ${days} day${days > 1 ? 's' : ''}** (replies, second opinions and collaborations)`,
        ...[...by].sort((a, b) => (b[1].input + b[1].output) - (a[1].input + a[1].output)).map(([n, x]) => `- ${n}: ${fmt(x.input)} in · ${fmt(x.output)} out · ${x.replies} replies${x.today ? ` · today ${fmt(x.today)}` : ''}`)].join('\n');
    } });
  R({ name: 'attach-screen', area: 'Chat', desc: 'Attach a screenshot of the Hearth window to your next message (both engines can see it)',
    run: async (args, ctx) => {
      const p = await window.hub.captureWindow();
      if (!p) return 'Couldn\'t take the screenshot.';
      await Native.attachPaths(ctx.agentId, [p]);
      Native.focus(ctx.agentId);
    } });
  R({ name: 'attach-lab', area: 'Chat', desc: 'Attach the Three.js Lab preview to your next message',
    run: async (args, ctx) => {
      if (typeof ThreeLab === 'undefined' || !ThreeLab.shot) return 'The Three.js Lab isn\'t open.';
      const url = await ThreeLab.shot();
      if (!url) return 'The Lab has no picture yet (open a sketch).';
      const p = await window.hub.saveAttachment(`lab-${Date.now()}.png`, url.split(',')[1]);
      await Native.attachPaths(ctx.agentId, [p]);
      Native.focus(ctx.agentId);
    } });

  R({ name: 'collabs', area: 'Collab', desc: 'List the collaborations in this chat; pick one to jump to it',
    run: (args, ctx) => {
      const ms = (Native.chatOf(ctx.agentId)?.messages || []).filter((m) => m.role === 'collab');
      if (!ms.length) return 'No collaborations in this chat yet.';
      const c = chipEls.get(ctx.agentId);
      const r = c?.chip.getBoundingClientRect() || { left: 200, top: 400 };
      showMenu(r.left, Math.max(8, r.top - 30 * Math.min(ms.length, 12)), ms.slice(-12).reverse().map((m) => ({
        label: `${MODES[m.mode]?.icon || '⚇'} ${cap(m.task, 50)} · ${fmt(totals(m).all.input + totals(m).all.output)}`,
        action: () => { const n = document.querySelector(`.collab-card[data-cid="${m.id}"]`); n?.scrollIntoView({ block: 'center' }); n?.classList.add('flash-msg'); setTimeout(() => n?.classList.remove('flash-msg'), 800); },
      })));
    } });
  R({ name: 'astra-compare-models', area: 'Astra', args: '<task>', desc: 'The same task on each Astra model, side by side (tokens × models)',
    run: (args, ctx) => {
      const a = astra();
      if (!a) return 'No Astra agent yet.';
      if (!args) return 'Say what to compare, e.g. /astra-compare-models summarize this in 3 bullets';
      go(ctx, 'compare', args, MODELS.codex.slice(0, 3).map((m) => seatOf(a, { model: m })));
    } });
  R({ name: 'astra-color', area: 'Astra', args: '[#hex|reset]', desc: 'Astra\'s accent color (stars, cards, chip)',
    run: (args) => {
      const v = args.trim();
      if (v === 'reset') { store.set('astra.accent', null); document.documentElement.style.removeProperty('--astra'); return 'Astra\'s accent is back to default.'; }
      if (!/^#[0-9a-f]{3,8}$/i.test(v)) return 'Give a color like #19c39c (or reset).';
      store.set('astra.accent', v);
      document.documentElement.style.setProperty('--astra', v);
      return `Astra's accent is now ${v}.`;
    } });
  { const c = store.get('astra.accent', null); if (c) document.documentElement.style.setProperty('--astra', c); }

  R({ name: 'collab-budget', area: 'Collab', args: '[tokens|off]', desc: 'Stop any collaboration once it has used this many tokens (e.g. 40k)',
    complete: completeFrom([{ value: '20k' }, { value: '50k' }, { value: '100k' }, { value: 'off' }]),
    run: (args) => {
      const v = args.trim().toLowerCase();
      if (!v) { const b = store.get('astra.collabBudget', 0); return b ? `Collaborations stop at ${fmt(b)} tokens.` : 'No token budget for collaborations (/collab-budget 50k sets one).'; }
      if (v === 'off') { store.set('astra.collabBudget', 0); return 'No token budget.'; }
      const n = Math.round(parseFloat(v) * (/k$/.test(v) ? 1000 : /m$/.test(v) ? 1e6 : 1));
      if (!(n > 0)) return 'Give a number like 40k.';
      store.set('astra.collabBudget', n);
      return `Collaborations now stop once they have used ${fmt(n)} tokens.`;
    } });
  R({ name: 'collab-scoreboard', aliases: ['scoreboard'], area: 'Collab', args: '[reset]', desc: 'Whose answers you keep: picks and judge verdicts per agent and mode',
    run: async (args) => {
      if (args.trim() === 'reset') { await window.hub.kvSet('astra-scoreboard', {}); return 'Scoreboard cleared.'; }
      const board = await window.hub.kvGet('astra-scoreboard', {}) || {};
      const rows = Object.entries(board).sort((a, b) => b[1].kept - a[1].kept);
      if (!rows.length) return 'No picks yet: keep an answer in a duo (Pick this one, /pick or ⚖ Judge).';
      return ['**Scoreboard** (answers kept / offered)', ...rows.map(([n, r]) => `- ${n}: ${r.kept} / ${r.offered} (${Math.round((r.kept / (r.offered || 1)) * 100)}%)${Object.keys(r.modes).length ? ` · ${Object.entries(r.modes).map(([k, x]) => `${MODES[k]?.label || k} ${x}`).join(', ')}` : ''}`)].join('\n');
    } });
  R({ name: 'collab-partner', area: 'Collab', args: '[agent|default]', desc: 'Who this chat collaborates with (e.g. Astra Coder instead of Astra)',
    complete: (a) => [{ value: 'default', hint: 'the other engine\'s main agent' }, ...natives().filter((x) => !x.dock).map((x) => ({ value: x.name.toLowerCase(), hint: engineName(x) }))].filter((x) => x.value.startsWith(a.trim().toLowerCase())),
    run: (args, ctx) => {
      const v = args.trim();
      if (!v) return `Partner: ${seatsFor(ctx.agentId).find((x) => x.agentId !== ctx.agentId)?.name || 'none'}.`;
      if (v === 'default') { setMode(ctx.agentId, { partner: null }); return `Partner: ${partner(H.agent(ctx.agentId))?.name}.`; }
      const a = findAgent(v, ctx.agentId);
      if (!a || a.id === ctx.agentId) return `No other chat agent called “${v}”.`;
      setMode(ctx.agentId, { partner: a.id });
      return `This chat now collaborates with ${a.name}.`;
    } });
  // Auto second opinion: after each reply in a chat with it on, the partner judges it (one lean turn each).
  window.hub.onEngineEvent((ev) => {
    if (ev.type !== 'done' || String(ev.chatId).startsWith('collab-')) return;
    const agentId = Object.keys(H.activeChat).find((id) => H.activeChat[id] === ev.chatId);
    const chat = agentId && Native.chatOf(agentId);
    const last = chat?.messages.at(-1);
    if (!chat?.autoOpinion || last?.role !== 'assistant' || last.compactSummary) return;
    setTimeout(() => Native.secondOpinion(agentId), 400);
  });
  R({ name: 'opinion-auto', area: 'Collab', args: '[on|off]', desc: 'After every reply in this chat, the other agent gives a second opinion (one lean turn per reply)',
    complete: completeFrom([{ value: 'on' }, { value: 'off' }]),
    run: (args, ctx) => {
      const v = args.trim().toLowerCase();
      const chat = Native.chatOf(ctx.agentId);
      if (!['on', 'off'].includes(v)) return `Auto second opinions are ${chat?.autoOpinion ? 'on' : 'off'} in this chat.`;
      if (!chat) return 'Start the chat first, then switch it on.';
      if (v === 'on') chat.autoOpinion = true; else delete chat.autoOpinion;
      Native.save(chat);
      return v === 'on' ? `${Native.partnerOf(H.agent(ctx.agentId))?.name || 'The other agent'} will judge every reply in this chat.` : 'Auto second opinions off.';
    } });
  // One message with other settings, the chat keeps its own.
  const sendOnce = (ctx, opts, text, label) => {
    const agent = H.agent(ctx.agentId);
    if (agent?.mode !== 'native') return 'Use it in a native chat.';
    if (!text) return `Add the message: /${label} <message>`;
    const allowed = Object.fromEntries(Object.entries(opts).filter(([k, v]) => k !== 'effort' || EFFORTS[agent.engine].includes(v)));
    if (opts.effort && !allowed.effort) allowed.effort = agent.engine === 'claude' ? 'low' : 'minimal';
    nextOnce.set(ctx.agentId, allowed);
    Native.send(ctx.agentId, text).catch((err) => { nextOnce.delete(ctx.agentId); toast(err.message, { type: 'error' }); });
  };
  R({ name: 'astra-quick', aliases: ['quick'], area: 'Astra', args: '<message>', desc: 'Send one message with the lowest effort (fewest tokens); the chat keeps its setting',
    run: (args, ctx) => sendOnce(ctx, { effort: 'minimal', verbosity: 'low' }, args, 'astra-quick') });
  R({ name: 'astra-deep', aliases: ['deep'], area: 'Astra', args: '<message>', desc: 'Send one message with the most reasoning (xhigh for Astra, max for Claude)',
    run: (args, ctx) => sendOnce(ctx, { effort: H.agent(ctx.agentId)?.engine === 'claude' ? 'max' : 'xhigh' }, args, 'astra-deep') });
  R({ name: 'astra-web-once', aliases: ['web'], area: 'Astra', args: '<question>', desc: 'Ask Astra one question with live web search (the chat stays without web)',
    run: (args, ctx) => (H.agent(ctx.agentId)?.engine === 'codex' ? sendOnce(ctx, { webSearch: 'live' }, args, 'astra-web-once') : 'Web search is an Astra (Codex) option: run it in an Astra chat, or /ask-astra.') });
  R({ name: 'redo-with', area: 'Collab', args: '[agent]', desc: 'Ask your last message again to the other agent, right here (one lean turn)',
    complete: () => natives().filter((a) => !a.dock).map((a) => ({ value: a.name.toLowerCase() })),
    run: async (args, ctx) => {
      const chat = Native.chatOf(ctx.agentId);
      const last = [...(chat?.messages || [])].reverse().find((m) => m.role === 'user' && !String(m.text).startsWith('/'));
      if (!last) return 'No message of yours to ask again.';
      const target = (args && findAgent(args, ctx.agentId)) || partner(H.agent(ctx.agentId));
      if (!target) return 'No other agent to ask.';
      const t = toast(`Asking ${target.name}…`, { timeout: 60000 });
      const r = await window.hub.askOnce({ agentId: target.id, text: last.sent || last.text, images: last.images || [], options: { lean: true } });
      t.remove();
      if (!r.ok) throw new Error(r.error || 'No answer');
      chat.messages.push({ role: 'opinion', from: target.name, text: clean(r.text), at: Date.now(), ...(r.usage ? { cost: r.usage } : {}) });
      Native.save(chat);
      Native.refresh(ctx.agentId);
    } });
  R({ name: 'duo-last', area: 'Collab', desc: 'Run your last message again as a duo (both agents, side by side)',
    run: (args, ctx) => {
      const last = [...(Native.chatOf(ctx.agentId)?.messages || [])].reverse().find((m) => m.role === 'user' && !String(m.text).startsWith('/'));
      if (!last) return 'No message of yours yet.';
      go(ctx, 'duo', last.sent || last.text, defaultPair(ctx.agentId));
    } });
  R({ name: 'collab-persona', area: 'Collab', args: '<this-persona|-> <partner-persona|->', desc: 'Personas for this chat\'s collab seats (e.g. coder reviewer; - for none)',
    complete: (a) => Object.keys(PERSONAS).filter((k) => k.startsWith(a.split(/\s+/).pop() || '')).map((k) => ({ value: `${a.split(/\s+/).slice(0, -1).concat(k).join(' ')} ` })),
    run: (args, ctx) => {
      const [h, p] = args.trim().toLowerCase().split(/\s+/);
      const val = (x) => (!x || x === '-' || x === 'none' ? null : PERSONAS[x] ? x : undefined);
      if (val(h) === undefined || val(p) === undefined) return `Personas: ${Object.keys(PERSONAS).join(', ')} (or - for none).`;
      setMode(ctx.agentId, { personas: { host: val(h), partner: val(p) } });
      return `Collab seats: ${seatsFor(ctx.agentId).map((x) => x.label).join(' × ')}.`;
    } });
  R({ name: 'astra-prompt', area: 'Astra', desc: 'Show the instructions + memory each agent sends with every message (and their size)',
    run: async () => {
      const r = await window.hub.engineDoctor();
      if (!r.prompts?.length) return 'No chat agents.';
      return r.prompts.map((p) => `**${p.name}** (${p.engine === 'codex' ? 'Astra' : 'Claude'} engine) · ~${fmt(p.tokens)} tokens${p.tools.length ? ` · tools: ${p.tools.join(', ')}` : ''}\n\n> ${cap(p.text || '', 1800).replace(/\n/g, '\n> ')}`).join('\n\n');
    } });
  // Errors that another agent can work around come with a one-click way out.
  window.hub.onEngineEvent((ev) => {
    if (ev.type !== 'error' || String(ev.chatId).startsWith('collab-')) return;
    const agentId = Object.keys(H.activeChat).find((id) => H.activeChat[id] === ev.chatId);
    const agent = H.agent(agentId);
    if (!agent) return;
    const other = partner(agent);
    if (/usage limit|rate.?limit|quota|\b429\b/i.test(ev.message || '') && other) toast(`${agent.name} hit its usage limit.`, { type: 'error', timeout: 12000, action: { label: `Continue with ${other.name}`, fn: () => handoff(agentId, other.id).catch((err) => toast(err.message, { type: 'error' })) } });
    else if (/model\b.*\b(not supported|does not exist|not found|unavailable)|unsupported model|model_not_found/i.test(ev.message || '')) toast(`${agent.name}'s model isn't available.`, { type: 'error', timeout: 12000, action: { label: 'Pick another', fn: () => Native.setDraft(agentId, '/astra-model ') } });
  });
  R({ name: 'astra-log', area: 'Astra', args: '[lines]', desc: 'The last lines of the engine log (exit codes, errors), for troubleshooting',
    run: async (args) => {
      const dir = String(await window.hub.attachmentsDir()).replace(/[\\/]attachments[\\/]?$/, '');
      let text = '';
      try { text = await window.hub.fs.read(`${dir}/engine.log`); } catch { return 'No engine log yet.'; }
      const n = Math.min(40, Math.max(3, Number(args) || 12));
      return `**Engine log** (last ${n})\n\`\`\`\n${text.trim().split('\n').slice(-n).map((l) => cap(l, 240)).join('\n')}\n\`\`\``;
    } });
  R({ name: 'astra-help', area: 'Astra', desc: 'What Astra can do, and how Claude and Astra work together',
    run: () => [
      '**Astra** is your ChatGPT (Codex) agent. Same memory, personas and attachments as Claude; frugal by default.',
      '- Tune a chat: `/astra-model`, `/astra-effort`, `/astra-preset`, `/astra-web`, `/astra-verbosity`, `/astra-persona`.',
      '- Opt-ins (cost tokens): `/astra-files`, `/astra-talkback`, `/astra-suggest`, `/astra-apps`.',
      '- Check it: `/astra-doctor`, `/astra-status`, `/astra-tokens`, `/astra-usage`, `/astra-log`.',
      '',
      '**Together with Claude** (the ⚇ chip, or):',
      '- `/duo` side by side · `/relay a→b N` draft + improve · `/critique a→b N` review loop · `/debate N` · `/council seats` · `/compare seats`.',
      '- `/handoff [agent|back]` · `/opinion` (both ways) · `/opinion-auto on` · `/ask-astra` · `/ask-claude`.',
      '- Seats: `claude`, `astra`, `astra:<model>`, `claude@<persona>`, `astra~low`, `all`. `/collab-preset` has ready-made ones.',
      '- Keys: Ctrl/⌘+Alt+D duo · M next model · O second opinion · H hand off · S stop.',
    ].join('\n') });

  // ---------- rail: a star marks agents running on the Astra (Codex) engine ----------
  function markRail() {
    for (const b of document.querySelectorAll('#agent-buttons .agent-btn[data-id]')) b.classList.toggle('astra-btn', H.agent(b.dataset.id)?.engine === 'codex');
  }
  const railBox = document.getElementById('agent-buttons');
  if (railBox) new MutationObserver(markRail).observe(railBox, { childList: true });

  // ---------- keys & palette ----------
  addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !e.altKey) return;
    const id = H.activeId;
    const agent = H.agent(id);
    const targetId = agent?.mode === 'native' ? id : H.isTool(id) ? Tools.dockedAgent(id.slice(5))?.id || null : null;
    if (!targetId || !Native.hasView(targetId)) return;
    if (e.code === 'KeyC') { const c = chipEls.get(targetId); if (c && !c.chip.hidden) { e.preventDefault(); chipMenu(targetId, c.chip); } }
    if (e.code === 'KeyD') { e.preventDefault(); const st = getMode(targetId); setMode(targetId, { mode: st.mode === 'duo' ? 'solo' : 'duo' }); toast(getMode(targetId).mode === 'duo' ? '⚇ Duo on' : 'Duo off', { timeout: 1200 }); }
    if (e.code === 'KeyM') {
      e.preventDefault();
      const a = H.agent(targetId);
      const list = [...new Set([...(MODELS[a.engine] || []), ...recentModels(a.engine)])];
      const cur = chatValue(targetId, 'model') || a.model;
      const next = list[(list.indexOf(cur) + 1) % list.length];
      chatPatch(targetId, { model: next === a.model ? null : next });
      Native.refresh(targetId, { keepScroll: true });
      toast(`Model: ${next}`, { timeout: 1200 });
    }
    if (e.code === 'KeyO') { e.preventDefault(); Native.secondOpinion(targetId); }
    if (e.code === 'KeyH') { e.preventDefault(); const o = partner(H.agent(targetId)); if (o) handoff(targetId, o.id).catch((err) => toast(err.message, { type: 'error' })); }
    if (e.code === 'KeyS' && stopAllIn(targetId)) { e.preventDefault(); toast('Stopping the collaboration', { timeout: 1200 }); }
  });
  queueMicrotask(() => {
    if (typeof AppUI === 'undefined' || !AppUI.addAction) return;
    AppUI.addAction('Astra: diagnostics (doctor)', () => Commands.exec('/astra-doctor', astra()?.id || H.claudeAgent()?.id));
    AppUI.addAction('Astra: new chat', () => Commands.exec('/astra-new'));
    AppUI.addAction('Astra: sign in with ChatGPT', () => window.hub.login('codex'));
    AppUI.addAction('Collab: Duo mode on / off', () => { const id = H.activeId; if (H.agent(id)?.mode === 'native') setMode(id, { mode: getMode(id).mode === 'duo' ? 'solo' : 'duo' }); }, 'Ctrl+Alt+D');
    AppUI.addAction('Collab: second opinion on the last reply', () => { if (H.agent(H.activeId)?.mode === 'native') Native.secondOpinion(H.activeId); }, 'Ctrl+Alt+O');
    AppUI.addAction('Astra: next model for this chat', () => dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', ctrlKey: true, altKey: true })), 'Ctrl+Alt+M');
  });

  return {
    collabEl, emptyHints, beforeSend, start, handoff, stop, PERSONAS, MODES, PRESETS,
    _test: { parseSeat, parseLead, parseSeats, carryText, collabText, totals, live },
  };
})();
