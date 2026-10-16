// Round 20 (soak): the "Freshen" safety net. Hearth stays open for hours on two machines; dev/soak.js hunts down what
// grows, and this is the net under it: every few minutes (never while the window is hidden) it notes the memory
// the window uses (JS heap floor, DOM nodes, all of Hearth's processes from bg:state). The first calm reading after
// 10 minutes is the baseline. When, after 2 hours or more, it grew a lot past that (thresholds below), one quiet
// toast offers "Freshen": a reload of the window that keeps everything (the screen you were on, every agent's open
// chat, what you were typing, where each chat was scrolled, the chats list's scroll, the Lab scene and its sequence
// with the playhead). Never automatic, and never offered while you're busy (typing, a reply streaming, a render or a
// recording running, the Lab playing): it waits for a calm moment, and offers at most every 2 hours.
//   /freshen          now · /freshen status (the numbers) · /freshen off | on (the offer)   ·  Ctrl+K → Freshen
// What a reload keeps lives in sessionStorage (this window only) and is used once.
const Freshen = (() => {
  const KEY = 'hearth.freshen'; // sessionStorage: the state to put back after the reload
  const VIEW = 'hearth.view'; // (round 52, chatkeep) localStorage: the view, kept all the time (any reload / crash puts it back)
  const MEM = 'hearth.mem'; // (round 52) the last memory reading (the crash record gets it from the page that comes back)
  const EVERY = 5 * 60000; // a reading every 5 minutes (one getElementsByTagName + one IPC: well under 1 ms of work)
  const BASE_AFTER = 10 * 60000; // the baseline: the first calm reading after 10 minutes (startup's caches are warm)
  const MIN_UP = 2 * 3600000; // nothing is offered before 2 hours
  const AGAIN = 2 * 3600000; // nor more often than every 2 hours
  // "grew a lot": the JS heap floor ×2 and +250 MB, or DOM nodes ×2.5 and +25k, or all processes +1.5 GB
  const LIMITS = { heap: { x: 2, plus: 250 * 1048576 }, nodes: { x: 2.5, plus: 25000 }, total: { plus: 1536 * 1048576 } };
  const t0 = performance.now();
  let base = null; let last = null; let offeredAt = 0; let timer = 0; let lastInput = performance.now();
  let restoredDone; const restored = new Promise((r) => { restoredDone = r; }); // (checks wait for it)
  const heaps = []; // the last three heap readings: their minimum is the floor (a reading can land before a GC)
  const on = () => store.get('freshen.offer', true) !== false;
  const mb = (b) => `${Math.round(b / 1048576)} MB`;
  const hrs = (ms) => (ms >= 3600000 ? `${Math.round(ms / 360000) / 10} h` : `${Math.round(ms / 60000)} min`);

  // ---------- readings ----------
  async function read() {
    const heap = performance.memory?.usedJSHeapSize || 0;
    heaps.push(heap); if (heaps.length > 3) heaps.shift();
    let total = 0;
    try { total = ((await window.hub.bgState?.())?.procs || []).reduce((a, p) => a + (p.mb || 0) * 1048576, 0); } catch { /* older main */ }
    last = { at: performance.now(), heap: Math.min(...heaps), nodes: document.getElementsByTagName('*').length, total };
    try { localStorage.setItem(MEM, JSON.stringify({ t: Date.now(), up: Math.round((last.at - t0) / 60000), heapMB: Math.round(last.heap / 1048576), nodes: last.nodes, totalMB: Math.round(total / 1048576) })); } catch { /* a convenience */ }
    if (!base && last.at - t0 >= BASE_AFTER && !busy()) base = { ...last };
    return last;
  }
  // what grew past its limit (names), compared with the baseline
  function over(r = last) {
    if (!base || !r) return [];
    const out = [];
    if (r.heap > base.heap * LIMITS.heap.x && r.heap > base.heap + LIMITS.heap.plus) out.push('heap');
    if (r.nodes > base.nodes * LIMITS.nodes.x && r.nodes > base.nodes + LIMITS.nodes.plus) out.push('nodes');
    if (base.total && r.total > base.total + LIMITS.total.plus) out.push('total');
    return out;
  }
  // (round 54, labsmooth54) the Lab's globals are stand-ins until its lazy group is in: peeking at them (typeof ThreeLab)
  // from here counted as an early touch (the lazy manifest's miss list) and could pull the whole group in mid-start.
  // Not loaded yet = the Lab isn't open, playing or holding a scene: nothing to read.
  const labIn = () => (window.Lazy?.isIn ? Lazy.isIn('lab') : true) && typeof ThreeLab !== 'undefined';
  // busy: typing (input in the last 20 s), a reply streaming, a render / recording running, the Lab playing
  function busy() {
    if (performance.now() - lastInput < 20000) return true;
    try {
      if ((H.chats || []).some((c) => Native.isBusy(c.id))) return true;
      if (typeof Renders !== 'undefined' && Renders.list?.().some((j) => ['running', 'queued'].includes(j.status))) return true;
      if (typeof Capture !== 'undefined' && Capture.recording) return true;
      if (labIn() && ThreeLab.peek?.()?.state?.playing) return true;
      if (labIn() && typeof ThreeSeq !== 'undefined' && ThreeSeq.active && ThreeSeq.status?.()?.playing) return true;
    } catch { /* a module not loaded yet is not busy */ }
    return false;
  }
  for (const t of ['keydown', 'pointerdown', 'wheel']) addEventListener(t, () => { lastInput = performance.now(); }, { capture: true, passive: true });

  async function tick() {
    timer = 0;
    if (document.hidden) return; // parked: visibilitychange starts it again
    if (window.Power?.quietNow?.()) { arm(); return; } // (round 52, presentready) not during a Lab show
    await read();
    const up = performance.now() - t0;
    const grew = over();
    if (on() && grew.length && up >= MIN_UP && Date.now() - offeredAt >= AGAIN && !busy()) offer(grew);
    arm();
  }
  const arm = () => { if (!timer && !document.hidden) timer = setTimeout(tick, EVERY); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(timer); timer = 0; } else arm(); });

  function offer(grew) {
    offeredAt = Date.now();
    const what = grew.includes('total') ? `${mb(last.total)} in all` : grew.includes('heap') ? `${mb(last.heap)} of memory` : `${Math.round(last.nodes / 1000)}k page parts`;
    toast(`Hearth has been open ${hrs(performance.now() - t0)} and grew to ${what}. Freshen reloads the window and keeps everything.`, { timeout: 20000, action: { label: 'Freshen', fn: () => now({ reason: 'offer' }) } });
  }

  // ---------- the reload that keeps everything ----------
  function capture() {
    const s = { at: Date.now(), active: H.activeId, chats: {}, panelTop: document.getElementById('chat-groups')?.scrollTop || 0 };
    for (const a of H.agents().filter((x) => x.mode === 'native')) {
      const v = Native.view(a.id);
      const draft = v?.input?.value || '';
      const list = v?.list;
      const atEnd = list ? list.scrollHeight - list.scrollTop - list.clientHeight < 40 : true;
      if (H.activeChat[a.id] || draft) s.chats[a.id] = { chatId: H.activeChat[a.id] || null, draft, top: list ? Math.round(list.scrollTop) : 0, atEnd };
    }
    try {
      if (labIn() && ThreeLab.peek?.()) {
        const seqOn = typeof ThreeSeq !== 'undefined' && Boolean(ThreeSeq.active);
        s.lab = { sceneId: ThreeLab.scenes?.currentId?.() || null, seqKey: seqOn ? ThreeSeq.key : null, seqT: seqOn ? ThreeSeq.time || 0 : 0 };
      }
    } catch { /* the Lab is optional */ }
    try { if (typeof Board !== 'undefined' && Board.isMounted?.()) s.board = Board.current?.()?.id || null; } catch { /* optional */ }
    return s;
  }
  function save(reason = 'cmd') {
    const s = { ...capture(), reason };
    try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* full: a plain reload still keeps the saved data */ }
    return s;
  }
  async function now({ reason = 'cmd' } = {}) {
    save(reason);
    try { await window.hub.safetynet?.reloading?.(`Freshen (${reason})`); } catch { /* an older main */ }
    await new Promise((r) => setTimeout(r, 120));
    location.reload(); // (the Lab, the board and the resume card save what they hold on beforeunload, as on a quit)
  }
  // after the reload: put it all back (once), when the chats are in and each part has loaded
  async function restore() {
    let s = null;
    try { s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); sessionStorage.removeItem(KEY); } catch { return; }
    if (!s || Date.now() - s.at > 120000) return comeBack();
    return putBack(s);
  }
  // (round 52, chatkeep) the window crashed and reloaded itself, was reloaded on purpose (Ctrl/⌘+Shift+R, an update,
  // Reload) or Hearth stopped unexpectedly: the screen, each AI's open chat (the docked director's too) and the Lab
  // scene come back as they were, and one calm line says what happened. Before this a crash landed on the first
  // chat of the rail with the Lab closed: the director's chat "disappeared" with its scene. A normal start is as before.
  // light: what's on screen by ids only (no layout read: it runs at once on every change of screen, chat or scene, so a
  // crash a moment after a new chat's first message still knows that chat); the full one (scroll places) on leaving
  function keepView(light = false) {
    try {
      let v;
      if (light) {
        v = { active: H.activeId, chats: {}, panelTop: 0 };
        for (const a of H.agents().filter((x) => x.mode === 'native')) if (H.activeChat[a.id]) v.chats[a.id] = { chatId: H.activeChat[a.id], top: 0, atEnd: true };
        try { if (labIn() && ThreeLab.peek?.()) v.lab = { sceneId: ThreeLab.scenes?.currentId?.() || null }; } catch { /* the Lab is optional */ }
      } else { v = capture(); for (const c of Object.values(v.chats)) delete c.draft; } // drafts have their own saves (and the work journal)
      v.at = Date.now();
      localStorage.setItem(VIEW, JSON.stringify(v));
    } catch { /* a convenience */ }
  }
  let viewQ = false;
  const viewSoon = () => { if (viewQ) return; viewQ = true; queueMicrotask(() => { viewQ = false; keepView(true); }); };
  let lastLine = null;
  const lineFor = (x, back) => {
    const what = back.chat && back.scene ? 'your chat and scene are back' : back.chat ? 'your chat is back' : back.scene ? 'your scene is back' : 'everything is where you left it';
    if (x.kind === 'page') {
      const r = String(x.reason || '');
      const why = /oom|memory/.test(r) ? ' (out of memory)' : r === 'killed' ? ' (the system stopped it)' : ' (out of memory?)';
      return `Hearth's window crashed${why} and reloaded — ${what}`;
    }
    if (x.kind === 'reload') return `The window reloaded${x.why && x.why !== 'reloaded' ? ` (${x.why})` : ''} — ${what}`;
    return `Hearth stopped unexpectedly last time — ${what}`;
  };
  async function comeBack() {
    let x = null; let v = null;
    try { x = await window.hub.safetynet?.last?.(); } catch { x = null; }
    if (!x) return null;
    // a reload nobody in Hearth asked for (a developer tool): your "Start on" screen wins, as at a start
    if (x.kind === 'reload' && x.why === 'reloaded' && H.settings?.()?.startOn) return null;
    try { v = JSON.parse(localStorage.getItem(VIEW) || 'null'); } catch { v = null; }
    const age = v ? Date.now() - (v.at || 0) : Infinity;
    if (!v || age > (x.kind === 'process' ? 12 * 3600000 : 30 * 60000) || age < -60000) return null;
    let mem = null; try { mem = JSON.parse(localStorage.getItem(MEM) || 'null'); } catch { mem = null; }
    const back = await putBack({ ...v, reason: 'chatkeep' });
    lastLine = lineFor(x, back);
    // what the page knew goes with the crash record (data/devreport-crashes.json)
    try { await window.hub.devreport?.annotate?.({ lastMemory: mem, showing: v.active, lab: v.lab?.sceneId || null, chats: Object.keys(v.chats || {}).length }); } catch { /* an older main */ }
    // a crash's line is the safetynet card's title (one line, not two); a reload says it here
    if (x.kind === 'reload') toast(lastLine, { timeout: 5000 });
    return { kind: x.kind, line: lastLine, back };
  }
  async function putBack(s) {
    const back = { chat: false, scene: false };
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    for (const [agentId, c] of Object.entries(s.chats || {})) {
      if (!H.agent(agentId)) continue;
      if (c.chatId && H.chats.some((x) => x.id === c.chatId) && H.activeChat[agentId] !== c.chatId) { try { Native.open(agentId, c.chatId); back.chat = true; } catch { /* deleted meanwhile */ } }
      else if (c.chatId && H.activeChat[agentId] === c.chatId) back.chat = true;
    }
    if (s.lab?.sceneId || s.active === 'tool:three') {
      try {
        if (window.Lazy) await Lazy.load('lab');
        if (s.active === 'tool:three') { activate('tool:three', { focus: false }); await ThreeLab.cmd(); }
        if (s.reason === 'chatkeep' && s.active === 'tool:three') await until(() => ThreeLab.director && ThreeLab.scenes, 20000); // (its scenes read first)
        if (s.lab?.sceneId && ThreeLab.scenes?.currentId?.() !== s.lab.sceneId && ThreeLab.peek?.()) ThreeLab.scenes.open(s.lab.sceneId);
        if (s.lab?.sceneId && ThreeLab.scenes?.currentId?.() === s.lab.sceneId) back.scene = true;
        if (s.lab?.seqKey && typeof ThreeSeq !== 'undefined' && s.active === 'tool:three') { await ThreeSeq.open(s.lab.seqKey, { show: true }); ThreeSeq.seek?.(s.lab.seqT || 0); }
      } catch (err) { console.warn('freshen: lab', err); }
    }
    if (s.active && s.active !== H.activeId && (H.agent(s.active) || String(s.active).startsWith('tool:'))) {
      if (String(s.active) === 'tool:board' && window.Lazy) await Lazy.load('board').catch(() => {});
      activate(s.active, { focus: false });
    }
    await wait(60);
    // drafts and scroll, once each chat has drawn
    for (const [agentId, c] of Object.entries(s.chats || {})) {
      const v = Native.view(agentId);
      if (!v) continue;
      if (c.draft && !v.input.value) { v.input.value = c.draft; v.input.dispatchEvent(new Event('input', { bubbles: true })); }
      const put = () => { if (c.atEnd) v.list.scrollTop = v.list.scrollHeight; else v.list.scrollTop = c.top; };
      put(); requestAnimationFrame(put); setTimeout(put, 400);
    }
    const g = document.getElementById('chat-groups');
    if (g && s.panelTop) { g.scrollTop = s.panelTop; setTimeout(() => { g.scrollTop = s.panelTop; }, 400); }
    if (s.reason !== 'soak' && s.reason !== 'chatkeep') toast('Freshened: everything is where you left it', { timeout: 2500 });
    return back;
  }
  async function until(fn, ms) { const t = Date.now(); while (Date.now() - t < ms) { try { if (fn()) return true; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 150)); } return false; }
  let cameBack = null;
  const up = () => {
    setTimeout(() => restore().then((r) => { cameBack = r || null; }).catch((err) => console.warn('freshen', err)).finally(() => {
      restoredDone();
      // from now on the view is kept (a reload or a crash puts it back): on a change of screen / chat / scene, on leaving
      keepView(true);
      addEventListener('hearth:view', viewSoon);
      addEventListener('hearth:sketch', viewSoon);
      addEventListener('pagehide', () => keepView());
      document.addEventListener('visibilitychange', () => { if (document.hidden) keepView(); });
    }), 0);
    arm();
  };
  // (round 40, firstscreen) loaded right after the first frame (lazy group 'resume'): the first screen may be up already
  if (performance.getEntriesByName('hearth:ready').length) up(); else addEventListener('hearth:ready', up, { once: true });

  // ---------- the command and the palette ----------
  function status() {
    const up = performance.now() - t0;
    return { up, base, last, over: over(), offer: on(), busy: busy(), offeredAt };
  }
  function statusText() {
    const s = status();
    const row = (k, f) => (s.last ? `${f(s.last[k])}${s.base ? ` (at the start ${f(s.base[k])})` : ''}` : '–');
    return [`**Freshen** · open ${hrs(s.up)} · the offer is ${s.offer ? 'on' : 'off'}`,
      `- memory (JS): ${row('heap', mb)}`, `- page parts: ${row('nodes', (n) => `${Math.round(n / 100) / 10}k`)}`, `- all of Hearth: ${row('total', mb)}`,
      s.over.length ? `Grew past the limit: ${s.over.join(', ')}. /freshen reloads and keeps everything.` : s.base ? 'All within the limits.' : 'The baseline is noted after 10 minutes.'].join('\n');
  }
  if (typeof Commands !== 'undefined' && !Commands.get('freshen')) {
    Commands.register({
      name: 'freshen', args: '[status|off|on]', area: 'App', keywords: 'reload refresh memory slow leak long session',
      desc: 'Reload the window and keep everything (chats, drafts, scroll, the Lab): for a long session that got heavy',
      examples: ['/freshen', '/freshen status'],
      complete: () => [{ value: 'status', hint: 'how much memory the window uses, against the start' }, { value: 'off', hint: 'never offer it' }, { value: 'on', hint: 'offer it after hours, when it grew a lot' }],
      run: async (args, ctx) => {
        const a = String(args || '').trim().toLowerCase();
        if (a === 'status') { await read(); return statusText(); }
        if (a === 'off' || a === 'on') { store.set('freshen.offer', a === 'on'); return `Freshen ${a === 'on' ? 'will be offered when the window grew a lot after hours' : 'won\'t be offered (/freshen still works)'}.`; }
        ctx?.say?.('Freshening…');
        setTimeout(() => now({ reason: 'cmd' }), 150);
        return '';
      },
    });
  }
  AppUI.addAction?.('Freshen the window (reload, keeps everything)', () => now({ reason: 'palette' }));
  return { now, save, restored, status, read, over, restore, capture, keepView, comeBack, lineFor, get cameBack() { return cameBack; }, LIMITS };
})();
