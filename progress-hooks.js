// Progress hooks (round 11): what feeds the one progress model (progress.js) from everything in Hearth that takes time.
// Measured where it can be (ffmpeg's own progress, frames rendered, steps done, rounds, seconds of a take of known
// length); estimated otherwise from this kind's history (stored locally): an agent's reply from its tool calls and the
// text streamed against its usual run, a plan's steps (chat_progress, Codex's todo list), the agent's own word when
// it gives one (a hidden <progress pct="40" note="…"/> tag, or a `progress` field in a hub tool call).
//   chats      'chat:<chatId>'     Native.hooks.send + the engine's events (reply, chat row, rail icon)
//   comps      'comp:<card id>'    the parent of its parts' replies (the comp card's head and rows)
//   flows      'flow:<runId>'      Flows.onChange: steps done / total, weighted (chat card, Commands page run)
//   projects   'intro:<pid>'       Intro.onChange: the seven steps with their n / m (the project card)
//   jams       'jam:<id>'          jam.js badge(): rounds (the jam card, the Lab badge, the Lab's rail icon)
//   renders    'job:<id>'          ffmpeg's -progress (Video Review exports, cuts, captures' MP4s: 'capconv:<id>')
//   Lab        'seq-render:<t>'    tools/three-seq.js renderEdit: frames
//   recordings 'rec'               hearth:recording: seconds against the take's length, a tour's steps
//   board      'snap:<item id>'    board.js website snapshots
//   sync       'sync'              the sync dot while a pass runs (kept off the rail list unless it is long)
//   installs   'engine:<engine>' / 'ffmpeg-install'   engine-health.js fix windows
// Token frugality: nothing reaches an engine unless the owner turns on `/progress tags on` (one line for directors).
const ProgressHooks = (() => {
  const P = Progress;
  const UI = () => (typeof ProgressUI !== 'undefined' ? ProgressUI : null);
  const railOf = (agentId) => UI()?.railOf(agentId) || `rail:${agentId}`;
  const cap = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const go = (agentId, chatId) => () => { try { activate(agentId); } catch { /* a docked director opens with its tool */ } Native.open(agentId, chatId); };

  // ---------- chat replies ----------
  // the agent's own word: <progress pct="40" note="…"/> anywhere in the reply (stripped from what you read, native.js)
  const TAG = /<progress\b[^>]*?\bpct\s*=\s*["']?(\d{1,3}(?:\.\d+)?)["']?[^>]*?(?:\bnote\s*=\s*"([^"]*)")?[^>]*\/?>/gi;
  const R = new Map(); // chat id → { agentId, started, tools, chars, tail, last, writeAtMs, steps, agentPct, note, lastSet }
  const sizeOf = (t) => { const n = String(t || '').length; return n < 80 ? 'short' : n < 400 ? 'medium' : 'long'; };
  function replyStart(agentId, chat, text) {
    const a = H.agent(agentId);
    if (!a || !chat) return;
    const engine = chat.engine || a.engine || 'claude';
    const r = { agentId, started: Date.now(), tools: 0, chars: 0, tail: '', writeAtMs: null, steps: null, agentPct: null, note: '', lastSet: 0, phase: 'starting' };
    R.set(chat.id, r);
    const comp = chat.compOf;
    if (comp) {
      P.set(`comp:${comp.card}`, {
        title: '◫ Comp · parts at work', icon: '◫', where: [`.comp-card[data-cid="${comp.card}"] > .comp-head`],
        jump: () => { const m = typeof CompDispatch !== 'undefined' && CompDispatch.cards().find((x) => x.id === comp.card); if (m) go(H.agents().find((x) => x.dock === 'three')?.id || agentId, m.host.chatId)(); },
      });
    }
    P.set(`chat:${chat.id}`, {
      title: `${a.name} · ${cap(chat.title, 40)}`, icon: engine === 'codex' ? '✦' : '✳',
      kind: `reply:${engine}:${agentId}:${sizeOf(text)}`,
      // directors work longer and call more tools than a plain chat before they write
      expect: a.dock ? { ms: 90000, tools: 6, chars: 600, writeAt: 0.8 } : undefined,
      label: 'starting', signals: { tools: 0, chars: 0 }, hungMs: 5 * 60000,
      where: [`reply:${chat.id}`, `row:${chat.id}`, ...(comp ? [() => document.querySelectorAll(`.comp-card[data-cid="${comp.card}"] .comp-row`)[comp.n - 1]] : []), railOf(agentId)],
      parent: comp ? `comp:${comp.card}` : undefined,
      jump: go(agentId, chat.id),
      actions: [{ label: '■', title: 'Stop this reply', run: () => window.hub.stop(chat.id) }],
    });
  }
  function replySignal(chatId, force = false) {
    const r = R.get(chatId);
    if (!r) return;
    const now = Date.now();
    if (!force && now - r.lastSet < 250) return; // pieces arrive many times a second: the model hears 4× a second at most
    r.lastSet = now;
    P.set(`chat:${chatId}`, { label: r.note || r.phase, signals: { tools: r.tools, chars: r.chars, writeAtMs: r.writeAtMs, steps: r.steps, agentPct: r.agentPct } });
  }
  function onEngine(ev) {
    const r = R.get(ev?.chatId);
    if (!r) return;
    if (ev.type === 'thinking') { if (r.phase === 'starting') { r.phase = 'thinking'; replySignal(ev.chatId); } return; }
    if (ev.type === 'tool') { r.tools += 1; r.phase = `using ${typeof Native.toolLabel === 'function' ? Native.toolLabel(ev.name) : ev.name}`; replySignal(ev.chatId, true); return; }
    if (ev.type === 'progress') { const st = ev.steps || []; r.steps = [st.filter((s) => s.status === 'done' || s.status === 'completed').length, st.length, st.some((s) => s.status === 'doing' || s.status === 'in_progress') ? 1 : 0]; replySignal(ev.chatId, true); return; }
    if (ev.type === 'delta') {
      const t = String(ev.text || '');
      if (r.writeAtMs == null && t.trim()) r.writeAtMs = Date.now() - r.started;
      r.chars += t.length; r.phase = 'writing';
      r.tail = (r.tail + t).slice(-600);
      if (t.includes('>') && /<progress\b/i.test(r.tail)) {
        let m; let lastM = null; TAG.lastIndex = 0;
        while ((m = TAG.exec(r.tail))) lastM = m;
        if (lastM) { r.agentPct = Math.min(100, Number(lastM[1])); if (lastM[2]) r.note = cap(lastM[2], 60); r.tail = r.tail.slice(TAG.lastIndex || r.tail.length); replySignal(ev.chatId, true); return; }
      }
      replySignal(ev.chatId);
      return;
    }
    // the reply ended
    R.delete(ev.chatId);
    if (ev.type === 'done') { P.set(`chat:${ev.chatId}`, { signals: { tools: r.tools, chars: r.chars, writeAtMs: r.writeAtMs } }); P.done(`chat:${ev.chatId}`); } else if (ev.type === 'error') P.done(`chat:${ev.chatId}`, { ok: false, label: 'failed' });
    else P.drop(`chat:${ev.chatId}`); // stopped: nothing to learn
  }
  // a plan as a checklist (chat_progress) and a `progress` field in any hub call: { progress: 40 } or { progress: { pct, note } }
  function onHubResult({ tool, args, chatId, agentId }) {
    const id = chatId || (agentId && Native.pendingFor?.(agentId)) || null;
    const r = id && R.get(id);
    if (!r) return;
    if (tool === 'chat_progress' && Array.isArray(args?.steps)) {
      const st = args.steps.map((s) => (typeof s === 'string' ? { status: 'todo' } : s));
      r.steps = [st.filter((s) => s.status === 'done').length, st.length, st.some((s) => s.status === 'doing') ? 1 : 0];
    }
    const pr = args?.progress;
    if (pr != null) { const pct = Number(typeof pr === 'object' ? pr.pct : pr); if (Number.isFinite(pct)) r.agentPct = Math.max(0, Math.min(100, pct <= 1 && typeof pr !== 'object' && String(pr).includes('.') ? pct * 100 : pct)); if (pr?.note) r.note = cap(pr.note, 60); }
    replySignal(id, true);
  }

  // ---------- flows and Commands-page runs ----------
  const W = { action: 2, ai: 4, check: 2, choice: 1, text: 1, result: 0.5, start: 0 };
  function flowShape(run) {
    const nodeOf = (id) => Flows.nodeOf(run, id);
    let doneW = 0;
    for (const e of run.steps) if (['done', 'skipped', 'error'].includes(e.status)) doneW += W[e.kind] ?? 1;
    // the steps still ahead on the most likely path (a choice: its first option)
    let left = 0; let choices = 0; let curW = 0; let id = run.at; const seen = new Set();
    const cur = run.steps.at(-1);
    while (id && !seen.has(id) && seen.size < 80) {
      seen.add(id);
      const n = nodeOf(id);
      if (!n) break;
      const w = W[n.kind] ?? 1;
      if (id === run.at && cur && cur.node === id && !['done', 'skipped', 'error'].includes(cur.status)) curW = w; else left += w;
      if (n.kind === 'choice') { choices += 1; id = (n.options || []).find((o) => o.next && !o.skip)?.next || n.next; } else id = n.next;
    }
    const total = doneW + curW + left;
    return { doneW, curW, total, choices };
  }
  function flowRun(run) {
    if (!run || typeof Flows === 'undefined') return;
    const key = `flow:${run.id}`;
    if (run.status === 'stopped') { P.drop(key); return; }
    if (run.status === 'done') { if (P.get(key)) P.done(key); return; }
    const sh = flowShape(run);
    const c = Flows.current(run);
    const w = Flows.waiting(run);
    const guided = Boolean(run.flow?.guided);
    const pct = sh.total ? (100 * (sh.doneW + 0.5 * sh.curW)) / sh.total : 0;
    const label = run.status === 'waiting-you' ? `waiting for you: ${cap(w?.title || '', 40)}` : run.status === 'hung' ? `hung: ${cap(run.why || 'pick up here', 50)}` : `${c?.node?.kind === 'ai' ? '✦' : '▶'} ${cap(c?.node?.title || 'working', 40)}`;
    P.set(key, {
      title: `${run.flow?.icon || '⇢'} ${run.flowName}`, icon: guided ? '☰' : '⇢', kind: `flow:${run.flowId}`,
      pct, estimate: sh.choices > 0, label,
      state: run.status === 'waiting-you' ? 'wait' : run.status === 'hung' ? 'hung' : 'run',
      hungMs: (run.status === 'waiting-ai' ? Flows.LIMIT.ai : Flows.LIMIT.action) + 30000,
      where: [`.msg.note[data-note-id="flow-${run.id}"]`, () => (typeof CmdPage !== 'undefined' && CmdPage.state?.view === 'run' && CmdPage.state.runId === run.id ? document.querySelector('.cp-run-head') : null), ...(guided ? ['rail:tool:commands'] : [])],
      jump: () => (typeof CmdPage !== 'undefined' ? CmdPage.openRun(run.id) : FlowsUI.open({ runId: run.id })),
      actions: run.status === 'hung' ? [{ label: '↻ Pick up here', title: 'Start the step that hung again', run: () => Flows.resume(run.id).catch((err) => toast(err.message, { type: 'error' })) }]
        : run.status === 'waiting-you' ? [] : [{ label: '■', title: 'Stop this run', run: () => Flows.stop(run.id) }],
    });
  }

  // ---------- video projects (/intro) ----------
  const STEP_W = { plan: 0.04, vibe: 0.04, scenes: 0.36, captures: 0.16, edit: 0.14, review: 0.06, render: 0.2 };
  function introProject(p) {
    if (!p || typeof IntroData === 'undefined') return;
    const key = `intro:${p.id}`;
    const running = typeof Intro !== 'undefined' && Intro.current?.()?.id === p.id && Intro.running?.();
    if (!running) { if (P.get(key)) { if (p.status === 'done') P.done(key); else if (p.status === 'error') P.done(key, { ok: false, label: cap(p.error, 60) }); else P.drop(key); } return; }
    let s = 0; let tot = 0; let cur = null;
    for (const st of IntroData.STEPS) {
      const x = p.steps?.[st.id] || {};
      const w = STEP_W[st.id] ?? 0.1;
      tot += w;
      if (x.status === 'done') s += w;
      else if (x.status === 'running') { cur = { st, x }; s += w * (x.total ? Math.min(1, (x.done || 0) / x.total) : 0.3); }
    }
    P.set(key, {
      title: `🎬 ${p.name}`, icon: '🎬', kind: 'intro', pct: (100 * s) / tot, estimate: !cur?.x?.total,
      label: cur ? `${cur.st.icon} ${cur.st.name}${cur.x.total ? ` ${cur.x.done || 0}/${cur.x.total}` : ''}${cur.x.sub ? ` · ${cap(cur.x.sub, 30)}` : ''}` : 'working',
      where: [`.intro-card[data-pid="${p.id}"]`, ...(p.chatId ? [`row:${p.chatId}`] : []), ...(p.agentId ? [railOf(p.agentId)] : [])],
      jump: () => { if (p.agentId && p.chatId) go(p.agentId, p.chatId)(); },
      actions: [{ label: '■', title: 'Stop the video project', run: () => Intro.stop?.() }],
    });
  }

  // ---------- jams (jam.js calls this from its Lab badge) ----------
  let jamKey = null;
  function jam(J, text) {
    const m = J?.m;
    if (!m || !text) return; // the end comes with hearth:jam-end
    const key = jamKey = `jam:${m.id}`;
    const done = m.list.filter((x) => x.status === 'done').length;
    const doing = m.list.some((x) => ['building', 'built', 'directing'].includes(x.status)) ? 1 : 0;
    P.set(key, {
      title: `🎛 Jam · ${cap(m.idea || 'a visual', 36)}`, icon: '🎛', kind: `jam:${m.total}`, expect: { ms: m.total * 120000 },
      label: text.replace(/^Jam · /, ''), signals: { steps: [m.phase === 'picking' ? m.total : done, m.total + 0.5, doing] },
      where: [`.jam-card[data-jid="${m.id}"]`, '.jam-badge', 'rail:tool:three'],
      jump: () => { Tools.openDock?.('three'); document.querySelector(`.jam-card[data-jid="${m.id}"]`)?.scrollIntoView({ block: 'nearest' }); },
      actions: [{ label: '■', title: 'Stop the jam', run: () => Jam.stop() }],
    });
  }

  // ---------- renders: ffmpeg's own progress ----------
  // Video Review / the cut name their jobs (tools/review.js); the Lab sequence's mux is part of its own bar
  function job(id, o) { P.set(`job:${id}`, { title: o.label || 'Rendering a video', icon: '⇪', kind: 'render', pct: 0, where: ['rail:tool:ae'], jump: () => activate('tool:ae'), actions: [{ label: '■', title: 'Cancel', run: () => window.hub.video.cancel(id) }], hungMs: 90000, ...o, label: o.sub || '' }); }
  function onJob(ev) {
    if (!ev?.id || /^seq/.test(ev.id)) return;
    const key = `job:${ev.id}`;
    if (ev.type === 'progress') {
      if (!P.get(key)) job(ev.id, {});
      P.set(key, { pct: Math.max(0, Math.min(100, ev.pct * 100)), label: ev.frame && ev.total ? `frame ${ev.frame} / ${ev.total}` : 'ffmpeg' });
    } else if (ev.type === 'done') {
      if (!P.get(key)) return;
      if (ev.code === 0) P.done(key, { label: ev.output ? base(ev.output) : 'done' }); else if (ev.cancelled) P.drop(key); else P.done(key, { ok: false, label: 'failed' });
    }
  }
  // a capture's MP4 (made by ffmpeg after the take)
  const capTimers = new Map();
  function onCapture({ id, pct }) {
    if (!id) return;
    const key = `capconv:${id}`;
    P.set(key, { title: '◉ Making the MP4', icon: '◉', kind: 'render:capture', pct: Math.max(0, Math.min(100, (pct > 1 ? pct : pct * 100))), label: 'ffmpeg', jump: () => Commands.exec?.('/captures', H.claudeAgent?.()?.id) });
    // the end isn't announced on this channel: 100 % (or silence) ends it
    clearTimeout(capTimers.get(key));
    if (pct >= 1 || pct >= 100) P.done(key); else capTimers.set(key, setTimeout(() => P.done(key), 6000));
  }

  // ---------- recordings (seconds against the take's length; a tour's steps) ----------
  let recT = 0;
  function onRecording(e) {
    const st = e.detail || {};
    clearInterval(recT); recT = 0;
    if (!st.recording) { if (P.get('rec')) P.done('rec', { label: st.path ? base(st.path) : 'saved' }); return; }
    const tick = () => {
      const s = typeof Capture !== 'undefined' ? Capture.status() : null;
      if (!s?.recording) { clearInterval(recT); recT = 0; return; }
      const tour = typeof CaptureTour !== 'undefined' ? CaptureTour.state?.() : null;
      const max = Number(s.max) || 0;
      const clock = typeof Capture.fmtClock === 'function' ? Capture.fmtClock(s.seconds) : `${Math.round(s.seconds)} s`;
      const pct = tour?.total ? (100 * tour.i) / tour.total : max ? (100 * s.seconds) / max : null;
      P.set('rec', {
        title: tour ? `◉ Tour · ${tour.name}` : '◉ Recording', icon: '◉', kind: tour ? 'record:tour' : 'record',
        ...(pct != null ? { pct } : {}), meta: { indeterminate: pct == null },
        label: `${s.paused ? 'paused · ' : ''}${clock}${max ? ` of ${Capture.fmtClock?.(max) || `${max} s`}` : ''}${tour ? ` · step ${tour.i + 1}/${tour.total}` : ''}`,
        state: s.paused ? 'wait' : 'run', where: ['rail:tool:capture'], jump: () => Commands.exec?.('/capture', H.claudeAgent?.()?.id),
        actions: [{ label: '■', title: 'Stop the recording', run: () => Capture.stop() }],
      });
    };
    tick();
    recT = setInterval(tick, 1000);
  }

  // ---------- sync passes (only on the sync dot unless one lasts) ----------
  function onSync(st) {
    if (!st) return;
    if (st.state === 'syncing' || st.state === 'starting') {
      if (!P.get('sync') || ['done', 'failed'].includes(P.get('sync').state)) P.set('sync', { title: '⇅ Sync', icon: '⇅', kind: 'sync', label: 'comparing and copying', where: ['#sync-dot'], quietMs: 4000, jump: () => Commands.exec?.('/sync status', H.claudeAgent?.()?.id) });
    } else if (P.get('sync') && !['done', 'failed'].includes(P.get('sync').state)) {
      if (st.state === 'error') P.done('sync', { ok: false, label: cap(st.error, 50) }); else P.done('sync');
    }
  }

  // ---------- wiring ----------
  function boot() {
    if (typeof Native !== 'undefined') Native.hooks.send.push(replyStart);
    window.hub.onEngineEvent?.(onEngine);
    if (typeof HubBridge !== 'undefined') HubBridge.onResult(onHubResult);
    if (typeof Flows !== 'undefined') {
      Flows.onChange((run) => flowRun(run));
      // runs left going (or hung) in the last hour show again after a restart (runs come back from disk a moment after
      // the page loads: looked at again then)
      const back = () => { for (const r of Flows.runs?.() || []) if (['running', 'waiting-ai', 'hung'].includes(r.status) && Date.now() - (r.updated || 0) < 3600000 && !P.get(`flow:${r.id}`)) flowRun(r); };
      back(); setTimeout(back, 4000);
    }
    if (typeof Intro !== 'undefined') Intro.onChange((p) => introProject(p || Intro.current?.()));
    addEventListener('hearth:intro-end', (e) => { const p = typeof Intro !== 'undefined' && Intro.get?.(e.detail?.id); const key = `intro:${e.detail?.id}`; if (!P.get(key)) return; if (e.detail?.status === 'done') P.done(key); else if (e.detail?.status === 'error') P.done(key, { ok: false, label: cap(p?.error, 60) }); else P.drop(key); });
    addEventListener('hearth:jam-end', (e) => { if (!jamKey || !P.get(jamKey)) return; const st = e.detail?.status; if (st === 'done') P.done(jamKey); else if (st === 'error') P.done(jamKey, { ok: false }); else P.drop(jamKey); jamKey = null; });
    window.hub.video?.onJob?.(onJob);
    window.hub.capture?.onProgress?.(onCapture);
    document.addEventListener('hearth:recording', onRecording);
    window.hub.sync?.onStatus?.(onSync);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  return { jam, job, flowRun, introProject, replies: () => [...R.keys()], TAG };
})();
window.ProgressHooks = ProgressHooks;
