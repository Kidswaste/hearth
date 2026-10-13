// Crew (round 22, labcrew): the Three Director deploys N helpers that each explore one variation of the chat's scene,
// in parallel, on backstage copies; you watch their live thumbnails in one small grid and pick one.
// - Start: `/crew 3 neon tunnel` (any chat with a Three Director), or the director itself (three_do crew
//   {op: "start"}) when you turned crew on for that chat (`/crew on`: one prompt line, only then).
// - Cost first: the grid opens with the estimate (tokens from the helper's real per-step cost, director-cost / mcp/cost.js,
//   and time) and waits for Start (or `/crew go`). A running total while it works; ■ / `/crew stop` stops anytime.
// - Each helper is its own lean engine run (engines.js options.crew): a fresh session, a short shared brief (no chat
//   history), the scene's code in the brief, six Lab tools (HUB_TOOL_MODE=crew: ≈ 710 tokens instead of ≈ 1,780 + chat
//   575), a call budget and a token budget Hearth enforces (it stops a helper past it). Its tool calls are routed to its
//   own stage (ThreeBackstage.make: a small hidden sandbox per helper, 12 fps), so helpers never touch your scene or
//   each other's. Why not Claude's Task subagents (/subagents): they share the director's run and its HUB_CHAT_ID (all
//   would edit the same scene), carry the director's whole tool list (≈ 3,200 tokens a step) plus Claude Code's own
//   subagent prompt, can't be capped per helper, and Codex has no equivalent: separate lean runs are cheaper and safer.
// - Pick: click a tile (double-click / "Use #n" / `/crew pick 2`), or "✦ Director picks" (one lean question with a
//   numbered contact sheet). The pick becomes the chat's scene (its layers replace the scene's; ↶ Undo / `/crew undo`);
//   the others are discarded unless you keep them as sketches (`/crew keep 3`, `/crew keep all`).
// - Merge: the director reads a variation's changes (crew {op: "code", n, layer}: a diff against your scene) and copies
//   layers over (crew {op: "copy", from, layer}), so "the motion from #2 and the colors from #4" is two calls.
// - The crew shows in the liveness tree of the director's reply when the director deployed it (ChatLive.feed).
const ThreeCrew = (() => {
  const MIN = 2; const MAX = 6; const DEF = 3;
  const CALLS = 4; // tool calls per helper (said in its brief; Hearth stops it at CALLS + 2)
  const BUDGET = 24000; // tokens per helper (input + output): estimated live, the helper is stopped past it
  const STEP_S = 9; // ≈ seconds per model step on a real engine (one inference + its tool call)
  const AVG_CTX = 450; // ≈ tokens each step adds to the context (a code edit + its short result)
  const OUT_EACH = 900; // ≈ output tokens per helper (the code it writes + one line)
  const ROLE_TOK = 60; // the helper's role line (engines.js options.crew)
  const CODE_MAX = 6000; // the scene's code goes into the brief up to this many characters (saves a read step)
  const TIMEOUT = 6 * 60000;
  const THUMB = 240;
  const ANGLES = [
    'color: a bolder palette (new hues, contrast, light) on the same forms and motion',
    'motion: different movement and timing (faster, snappier, or a new path) on the same look',
    'look: materials, light and texture (glass, chrome, glow, grain…)',
    'music: a different reaction to the song (kick hits, bass swells, drops)',
    'form: a new shape or arrangement of the main element',
    'camera: a camera move, depth and framing',
  ];
  const fmtK = (n) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n || 0)));
  const cap = (t, n) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  const tok = (s) => Math.ceil(String(s ?? '').length / 4);
  const deep = (x) => JSON.parse(JSON.stringify(x));
  const secs = (s) => (s < 90 ? `${Math.round(s)} s` : `${Math.round(s / 60)} min`);
  const clampN = (n) => Math.max(MIN, Math.min(MAX, Math.round(Number(n) || DEF)));

  let C = null; // the crew (one at a time): { id, chatId, agent, brief, n, base, helpers, status, by, est, … }
  const byHelper = new Map(); // a helper's run id (its chatId for the engine and the hub) -> helper
  let fixedTok = null; // a helper's fixed cost per model step (its tools + its prompt), from mcp/cost.js
  let seq = 0;

  // ---------- who / where ----------
  const summaryOf = (chatId) => H.chats.find((c) => c.id === chatId) || null;
  const directorAgent = () => (typeof Tools !== 'undefined' && Tools.dockedAgent?.('three')) || H.agents().find((a) => a.mode === 'native' && a.dock === 'three') || null;
  const agentFor = (chatId) => H.agent(summaryOf(chatId)?.agentId) || directorAgent();
  async function lab() {
    if (!window.ThreeLab?.scenes || !ThreeLab.director) await ThreeLab.cmd({ show: false });
    if (!ThreeLab.scenes) throw new Error('The Three.js Lab did not load.');
    return ThreeLab.scenes;
  }
  const sketchIdFor = (chatId, S) => (chatId && typeof ChatScenes !== 'undefined' && ChatScenes.linkOf(chatId) && S.get(ChatScenes.linkOf(chatId)) ? ChatScenes.linkOf(chatId) : S.currentId());
  // the scene as it is now (the one on screen: with its unsaved code edits)
  function snapshotOf(sketchId) {
    const S = ThreeLab.scenes;
    if (S.currentId() === sketchId && ThreeLab.director?.capture) { const c = ThreeLab.director.capture(); return { layers: c.layers, selId: c.selId }; }
    const x = S.get(sketchId);
    return { layers: deep(S.layersOf(x)), selId: S.selectedOf(sketchId) };
  }
  async function isOn(chatId) { try { return Boolean(chatId && (await Native.loadChat(chatId))?.crew); } catch { return false; } }

  // ---------- cost ----------
  async function fixed(agent) {
    if (fixedTok) return fixedTok;
    try {
      const r = await window.hub.directorCost([{ id: 'crew', name: 'Crew helper', engine: agent?.engine || 'claude', threeTools: true, toolMode: 'crew', nodesTool: false, chatTools: false }]);
      fixedTok = (r?.directors?.[0]?.total || 910) + ROLE_TOK;
    } catch { fixedTok = 970; }
    return fixedTok;
  }
  // input of step k = fixed + brief + what the earlier steps added; parallel helpers cost time once
  function estimate(n, briefTok, fx) {
    const steps = CALLS + 1;
    let input = 0;
    for (let k = 0; k < steps; k += 1) input += fx + briefTok + k * AVG_CTX;
    const each = Math.min(BUDGET, input + OUT_EACH);
    return { each, total: each * n, cap: BUDGET * n, secs: Math.round((steps * STEP_S + 8) * (1 + 0.08 * (n - 1))), fixed: fx, steps, brief: briefTok };
  }
  const spentOf = (h) => (h.real ? h.real.input + h.real.output : h.estIn + h.estOut);
  const total = (c = C) => (c ? c.helpers.reduce((s, h) => s + spentOf(h), 0) + (c.pickTokens || 0) : 0);

  // ---------- the brief (short, shared, no chat history) ----------
  function codeBlock(base) {
    const all = base.layers.map((L) => `── Layer "${L.name}"${L.id === base.selId ? ' (selected)' : ''}\n${L.code}`).join('\n');
    if (all.length <= CODE_MAX) return all;
    const L = base.layers.find((x) => x.id === base.selId) || base.layers.at(-1);
    return L.code.length <= CODE_MAX ? `── Layer "${L.name}" (selected; read the others with three_read_code)\n${L.code}` : 'The code is long: read it with three_read_code.';
  }
  // (round 33, swarmlean) byte-stable for the prompt caches: everything the helpers share comes first (scene, brief, code),
  // only the last two lines differ (who and which angle), so helpers 2–n read the shared part from the cache
  function briefFor(c, h) {
    const names = c.base.layers.map((L) => `${L.name}${L.id === c.base.selId ? ' (selected)' : ''}`).join(', ');
    return `Crew of ${c.n} helpers: variations of one scene, in parallel, each on its own copy.
Scene "${c.base.name}" · ${c.base.frame || 'fit'} · layers (bottom first): ${names}. It already runs on your own copy (no music there: a demo beat).
The owner's brief: ${c.brief || 'make it more striking'}
Make ONE clear, good-looking variation along your angle (below; the other helpers take other angles); keep the layers and their sliders working.
Budget: at most ${CALLS} tool calls, then one line saying what you changed.
${codeBlock(c.base)}
Crew · helper ${h.n}/${c.n} · ${h.angle.split(':')[0]}
Your angle: ${h.angle}.`;
  }

  // ---------- the crew's own scene data (the variations live here until one is picked or kept) ----------
  function scenesOf(c) {
    const H0 = (id) => c.helpers.find((h) => h.sketch.id === id) || null;
    return {
      get: (id) => H0(id)?.sketch || null,
      layersOf: (x) => x.layers,
      selectedOf: (id) => H0(id)?.selId || c.base.selId,
      frameOf: () => c.base.frame,
      setFrame() {}, // a variation keeps the scene's frame
      songOf: () => null,
      changed: (id) => { const h = H0(id); if (h) { h.sketch.updatedAt = Date.now(); h.changed += 1; } },
      create() { throw new Error('Crew helpers work on their own copy: use three_set_code / three_add_layer.'); },
    };
  }

  // ---------- plan → start ----------
  async function plan(chatId, { n = DEF, brief = '', angles = null, by = 'owner' } = {}) {
    if (C && ['plan', 'running'].includes(C.status)) throw new Error(`A crew is already ${C.status === 'plan' ? 'waiting for your OK' : 'working'} (/crew stop).`);
    const S = await lab();
    const agent = agentFor(chatId);
    if (!agent) throw new Error('No Three Director yet: /director-setup makes one.');
    const sketchId = sketchIdFor(chatId, S);
    const x = S.get(sketchId);
    if (!x) throw new Error('This chat has no scene yet.');
    end(); // the previous crew's stages and panel
    n = clampN(n);
    const snap = snapshotOf(sketchId);
    const id = `c${(seq += 1)}${Date.now().toString(36).slice(-4)}`;
    const pick = Array.isArray(angles) && angles.length ? angles.map((a) => cap(a, 160)) : [];
    const c = {
      id, chatId: chatId || null, agent, brief: cap(brief, 400), n, by, status: 'plan', at: Date.now(),
      base: { sketchId, name: x.name, frame: S.frameOf(sketchId) || 'fit', layers: snap.layers, selId: snap.selId },
      helpers: [], picked: null, kept: [], pickTokens: 0, notes: [],
    };
    c.helpers = Array.from({ length: n }, (_, i) => ({
      n: i + 1, id: `crew-${id}-${i + 1}`, angle: pick[i] || ANGLES[i % ANGLES.length], status: 'waiting', crew: c,
      sketch: { id: `crew_${id}_${i + 1}`, name: `${x.name} · crew #${i + 1}`, layers: deep(snap.layers), code: snap.layers[0]?.code || '' },
      selId: snap.selId, calls: 0, estIn: 0, estOut: 0, ctx: 0, real: null, text: '', tool: null, thumb: null, changed: 0, errors: 0, at: 0, ms: 0,
    }));
    const fx = await fixed(agent);
    const briefTok = Math.max(...c.helpers.map((h) => tok(briefFor(c, h))));
    c.est = estimate(n, briefTok, fx);
    c.decided = new Promise((r) => { c.decide = r; });
    c.finished = new Promise((r) => { c.finish = r; });
    C = c;
    Panel.open(c);
    return c;
  }

  function approve() {
    const c = C;
    if (!c || c.status !== 'plan') return false;
    c.status = 'running'; c.startedAt = Date.now();
    c.decide(true);
    const scenes = scenesOf(c);
    for (const h of c.helpers) {
      byHelper.set(h.id, h);
      h.stage = ThreeBackstage.make({ long: 360, cap: 12, scenes, idleMs: 10 * 60000, onStill: (url) => setThumb(h, url) });
      h.route = { chatId: h.id, sketchId: h.sketch.id, crew: true, stage: h.stage };
      // its page starts right away (thumbnails from the first second; no tokens)
      h.stage.handle('three_console', {}, h.route).then(() => setTimeout(() => refreshThumb(h), 900)).catch(() => {});
    }
    // (round 33, swarmlean) the first helper warms the prompt cache, the others start once it is streaming (≤ 4 s)
    const [first, ...rest] = c.helpers;
    let warmed = false;
    const others = () => { if (warmed) return; warmed = true; for (const h of rest) if (c.status === 'running' && h.status === 'waiting') run(c, h); };
    c.warm = others;
    setTimeout(others, 4000);
    run(c, first);
    live(c, null);
    Panel.paint();
    return true;
  }
  function cancel() {
    const c = C;
    if (!c || c.status !== 'plan') return false;
    c.status = 'cancelled';
    c.decide(false); c.finish(c);
    Panel.close();
    return true;
  }

  // ---------- one helper = one lean engine run ----------
  function run(c, h) {
    h.status = 'running'; h.at = Date.now();
    h.ctx = tok(briefFor(c, h));
    h.estIn = (c.est?.fixed || 0) + h.ctx; // its first inference: fixed + the brief
    h.timer = setTimeout(() => stopHelper(h, 'timeout'), TIMEOUT);
    // (round 33, swarmlean) a helper thinks with low effort (medium when the director is on Deep); its own model: Lab builds
    const effort = typeof SwarmLean !== 'undefined' ? SwarmLean.helperOptions(c.agent.id).effort : null;
    window.hub.send({ agentId: c.agent.id, chatId: h.id, session: {}, text: briefFor(c, h), options: { crew: true, hubOnly: true, asDirector: 'three', ...(effort ? { effort } : {}) } })
      .catch((err) => done(h, 'failed', { message: err.message }));
  }
  function stopHelper(h, why = 'stopped') {
    if (h.status === 'waiting' && h.crew.status === 'running') { h.status = 'running'; h.at = Date.now(); h.stopWhy = why; done(h, why, {}); return; } // not started yet (round 33)
    if (h.status !== 'running') return;
    h.stopWhy = why;
    if (!window.hub.stop(h.id)) done(h, why, {});
  }
  window.hub.onEngineEvent((ev) => {
    const h = byHelper.get(ev?.chatId);
    if (!h || h.status !== 'running') return;
    if (h.n === 1) h.crew.warm?.(); // its first word: the others can read the shared brief from the cache
    if (ev.type === 'delta') { if (h.text.length < 600) h.text += ev.text; return; }
    if (ev.type === 'tool') { h.tool = String(ev.name || '').replace(/^mcp__.+?__/, '').replace(/^three_/, ''); return; }
    if (ev.type === 'done') done(h, 'done', ev);
    else if (ev.type === 'error') done(h, 'failed', ev);
    else if (ev.type === 'stopped') done(h, h.stopWhy || 'stopped', ev);
  });
  async function done(h, status, ev) {
    if (h.status !== 'running') return;
    clearTimeout(h.timer);
    h.status = status; h.ms = Date.now() - h.at; h.tool = null;
    if (ev.text) h.text = String(ev.text);
    h.text = cap(String(h.text).replace(/<(remember|suggest)>[\s\S]*?<\/\1>/gi, '').replace(/\n+MCP calls:[\s\S]*$/, ''), 200);
    if (ev.message && status === 'failed') h.error = cap(ev.message, 160);
    try { if (h.stage && h.changed) h.broken = h.stage.director(h.sketch.id, h.route).report().errors.length > 0; } catch { /* its page is gone */ }
    // its answer; the engine's real usage replaces the estimate
    h.estOut += tok(h.text);
    if (ev.usage) {
      h.real = { input: ev.usage.input || 0, output: ev.usage.output || 0, cached: ev.usage.cached || 0 };
      document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: h.crew.agent.id, usage: ev.usage, source: 'crew' } }));
    }
    live(h.crew, h);
    await refreshThumb(h);
    Panel.paint();
    const c = h.crew;
    if (c.status === 'running' && c.helpers.every((x) => x.status !== 'running' && x.status !== 'waiting')) settle(c);
  }
  async function settle(c) {
    if (c.settling) return;
    c.settling = true;
    c.ms = Date.now() - c.startedAt;
    await Promise.all(c.helpers.map((h) => refreshThumb(h).catch(() => {}))); // the last picture of each, as it ended
    c.status = c.helpers.some((h) => h.stopWhy === 'stopped') ? 'stopped' : 'done';
    for (const h of c.helpers) { byHelper.delete(h.id); h.stage?.dispose(); h.stage = null; } // GPU back
    Panel.paint();
    toast(`Crew ${c.status === 'stopped' ? 'stopped' : 'done'}: ${c.helpers.filter(usable).length} variation${c.helpers.filter(usable).length === 1 ? '' : 's'} · ${fmtK(total(c))} tokens · pick one in the grid`, { timeout: 5000 });
    c.finish(c);
  }
  // a variation worth picking: it changed something and isn't broken
  const usable = (h) => h.changed > 0 && !h.broken;

  // what each tool call cost and returned (the hub sees every call: the estimate is exact on the results)
  if (typeof HubBridge !== 'undefined') {
    HubBridge.onResult(async ({ tool, args, result, chatId }) => {
      const h = byHelper.get(chatId);
      if (!h || h.status !== 'running') return;
      const imgs = [].concat(result?.images || []);
      let resTok = result?.ok === false ? tok(result.error) + 2 : tok(HubBridge.fmtText(result?.value));
      for (const im of imgs) resTok += await HubBridge.imageTokens(im).catch(() => 0);
      const argTok = tok(JSON.stringify(args || {}));
      h.calls += 1;
      // the call it wrote, then the next inference reads everything so far again (mostly from the prompt cache)
      h.estOut += argTok; h.ctx += argTok + resTok; h.estIn += (h.crew.est?.fixed || 0) + h.ctx;
      // the last code change or console read says whether it's broken now
      if (result?.value && typeof result.value === 'object' && /edit_code|set_code|add_layer|update_layer|console/.test(tool)) h.broken = Array.isArray(result.value.errors) && result.value.errors.length > 0;
      if (result?.ok === false) h.errors += 1;
      if (spentOf(h) > BUDGET) stopHelper(h, 'budget');
      else if (h.calls > CALLS + 2) stopHelper(h, 'budget');
    });
    // its steps in the liveness tree of the director's reply (while that reply runs)
    HubBridge.onCall((e) => {
      const h = e && byHelper.get(e.chatId);
      if (!h || !h.crew.chatId || typeof ChatLive === 'undefined' || !ChatLive.feed) return;
      if (e.running) ChatLive.feed({ chatId: h.crew.chatId, type: 'tool', id: `crew-${e.id}`, name: e.tool, args: e.summary, parent: h.id });
      else ChatLive.feed({ chatId: h.crew.chatId, type: 'step', id: `crew-${e.id}`, ok: e.ok, summary: e.error || '' });
    });
  }
  function live(c, h) {
    if (!c?.chatId || typeof ChatLive === 'undefined' || !ChatLive.feed) return;
    for (const x of h ? [h] : c.helpers) {
      const st = x.status === 'running' || x.status === 'waiting' ? 'running' : x.status === 'done' || x.status === 'budget' ? 'done' : 'failed';
      ChatLive.feed({ chatId: c.chatId, type: 'agent', id: x.id, description: `Crew #${x.n} · ${x.angle.split(':')[0]}`, kind: 'crew', status: st, ...(x.text || x.error ? { summary: x.error || x.text } : {}) });
    }
  }

  // ---------- thumbnails ----------
  function setThumb(h, url) { if (url && url !== h.thumb) { h.thumb = url; Panel.tile(h); } }
  async function refreshThumb(h) { if (h.stage) setThumb(h, await h.stage.thumb(THUMB).catch(() => null)); }

  // ---------- pick / undo / keep / discard ----------
  const helperOf = (n, c = C) => { const h = c?.helpers[Number(n) - 1]; if (!h) throw new Error(`No variation #${n}${c ? ` (1–${c.n})` : ''}.`); return h; };
  async function apply(sketchId, layers, selId) {
    const S = await lab();
    if (!S.get(sketchId)) throw new Error('The chat\'s scene is gone.');
    window.ThreeHistory?.as?.(sketchId, 'crew'); // (round 23) the time machine marks it as the crew's
    if (S.currentId() === sketchId) await ThreeLab.director.restore({ sketchId, layers: deep(layers), selId }, { wait: 0.4 });
    else { const x = S.get(sketchId); x.layers = deep(layers); S.changed(sketchId); }
  }
  async function pick(n, { by = 'owner', reason = '' } = {}) {
    const c = C;
    if (!c) throw new Error('No crew yet: /crew 3 <brief>');
    if (c.status === 'running') throw new Error('The crew is still working: wait, or /crew stop first.');
    const h = helperOf(n, c);
    if (!h.changed) throw new Error(`#${n} didn't change anything.`);
    const before = c.picked ? c.picked.before : snapshotOf(c.base.sketchId);
    await apply(c.base.sketchId, h.sketch.layers, h.selId);
    c.picked = { n: h.n, by, reason: cap(reason, 120), before, at: Date.now() };
    Panel.paint();
    toast(`#${h.n} is this chat's scene now${by === 'director' && reason ? ` (${cap(reason, 60)})` : ''}`, { timeout: 6000, action: { label: 'Undo', fn: () => undoPick().catch((err) => toast(err.message, { type: 'error' })) } });
    return `#${h.n} is the scene now${reason ? ` (${by}: ${reason})` : ''}. /crew undo puts the scene back as it was; /crew keep all keeps the others as sketches.`;
  }
  async function undoPick() {
    const c = C;
    if (!c?.picked) throw new Error('Nothing picked to undo.');
    await apply(c.base.sketchId, c.picked.before.layers, c.picked.before.selId);
    const n = c.picked.n;
    c.picked = null;
    Panel.paint();
    toast('The scene is back to before the crew', { timeout: 2500 });
    return `Undid #${n}: the scene is as it was before the crew.`;
  }
  async function keep(which = 'all') {
    const c = C;
    if (!c) throw new Error('No crew yet.');
    const S = await lab();
    const list = /^all$/i.test(String(which)) ? c.helpers.filter((h) => h.changed && h.n !== c.picked?.n) : [helperOf(which, c)];
    const made = [];
    for (const h of list) {
      if (h.keptAs && S.get(h.keptAs)) continue;
      const x = S.create({ name: h.sketch.name, code: h.sketch.layers[0]?.code || '', layers: h.sketch.layers, frame: c.base.frame !== 'fit' ? c.base.frame : null });
      h.keptAs = x.id; c.kept.push(x.id); made.push(x.name);
    }
    Panel.paint();
    return made.length ? `Kept as sketches: ${made.join(', ')} (Your sketches).` : 'Nothing new to keep.';
  }
  async function directorPicks() {
    const c = C;
    if (!c || c.status === 'running' || c.status === 'plan') throw new Error('Let the crew finish first.');
    const tiles = c.helpers.filter((h) => h.thumb && h.changed);
    if (!tiles.length) throw new Error('No variations to pick from.');
    Panel.busy('✦ Looking…');
    try {
      const sheet = await sheetOf(tiles);
      const img = sheet ? await window.hub.saveAttachment(`crew-pick-${Date.now()}.jpg`, sheet.split(',')[1]).catch(() => null) : null;
      const prompt = `Pick the strongest of these ${tiles.length} variations of one music visual, for ${c.brief || `the scene "${c.base.name}"`}. The image shows them numbered 1–${tiles.length}.\nReply with the number, a dash and at most 8 words why.`;
      const r = await window.hub.askOnce({ agentId: c.agent.id, text: prompt, images: img ? [img] : [], options: { lean: true } }).catch(() => null);
      if (r?.usage) { c.pickTokens += (r.usage.input || 0) + (r.usage.output || 0); document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: c.agent.id, usage: r.usage, source: 'crew' } })); }
      const m = r?.ok && /\b([1-9])\b/.exec(r.text || '');
      const k = m ? Number(m[1]) : 0;
      if (!k || k > tiles.length) throw new Error('The director didn\'t name one: pick it yourself.');
      return await pick(tiles[k - 1].n, { by: 'director', reason: cap(String(r.text).replace(/^\s*\d+\s*[-–—:.)]\s*/, ''), 80) });
    } finally { Panel.busy(null); }
  }
  // stop everything; a crew waiting for its OK is cancelled
  function stop() {
    const c = C;
    if (!c) return false;
    if (c.status === 'plan') return cancel();
    if (c.status !== 'running') return false;
    for (const h of c.helpers) stopHelper(h, 'stopped');
    return true;
  }
  // a new crew (or closing the app's crew) ends the last one: its stages go, its data stays until replaced
  function end() {
    if (!C) return;
    if (C.status === 'running') stop();
    for (const h of C.helpers) { byHelper.delete(h.id); h.stage?.dispose(); h.stage = null; }
    Panel.close();
  }

  // ---------- merge: what a variation changed, and layer copies into the chat's scene ----------
  function findLayer(layers, ref) {
    if (ref == null || ref === '' || ref === 'selected') return null;
    if (/^\d+$/.test(String(ref))) return layers[Number(ref) - 1] || null;
    const r = String(ref).toLowerCase();
    return layers.find((L) => L.id === ref) || layers.find((L) => L.name.toLowerCase() === r) || layers.find((L) => L.name.toLowerCase().includes(r)) || null;
  }
  // the lines a variation changed in a layer, against the scene before the crew (numbered as in the variation)
  function diffLines(a, b) {
    const A = a.split('\n'); const B = b.split('\n');
    const inA = new Map(); for (const l of A) inA.set(l, (inA.get(l) || 0) + 1);
    const inB = new Map(); for (const l of B) inB.set(l, (inB.get(l) || 0) + 1);
    const out = [];
    A.forEach((l, i) => { if (!inB.get(l)) out.push(`-${i + 1}| ${l}`); else inB.set(l, inB.get(l) - 1); });
    B.forEach((l, i) => { if (!inA.get(l)) out.push(`+${i + 1}| ${l}`); else inA.set(l, inA.get(l) - 1); });
    return out;
  }
  function codeOf(n, layer, { full = false } = {}) {
    const h = helperOf(n);
    const L = findLayer(h.sketch.layers, layer) || h.sketch.layers.find((x) => x.id === h.selId) || h.sketch.layers.at(-1);
    const was = C.base.layers.find((x) => x.id === L.id);
    if (!full && was) {
      const d = diffLines(was.code, L.code);
      return `#${h.n} "${L.name}": ${d.length ? `${d.length} lines changed (- before, + #${h.n})\n${d.slice(0, 120).join('\n')}${d.length > 120 ? '\n…' : ''}` : 'unchanged'}`;
    }
    const lines = L.code.split('\n');
    return `#${h.n} "${L.name}"${was ? '' : ' (new layer)'} · ${lines.length} lines\n${lines.slice(0, 250).map((l, i) => `${i + 1}| ${l}`).join('\n')}`;
  }
  // a variation's layer into the chat's scene through the director's own tools (undoable there: three_do undo)
  async function copy(from, layer, { into = '' } = {}) {
    const c = C;
    if (!c) throw new Error('No crew yet.');
    const h = helperOf(from, c);
    const L = findLayer(h.sketch.layers, layer);
    if (!L) throw new Error(`#${h.n} has no layer "${layer}". Its layers: ${h.sketch.layers.map((x) => x.name).join(', ')}`);
    const S = await lab();
    const target = S.layersOf(S.get(c.base.sketchId));
    const same = into === 'add' ? null : findLayer(target, into) || target.find((x) => x.id === L.id) || target.find((x) => x.name === L.name);
    const ctx = { chatId: c.chatId };
    const r = same ? await HubBridge.call('three_update_layer', { layer: same.name, code: L.code }, ctx)
      : await HubBridge.call('three_add_layer', { name: `${L.name} #${h.n}`, code: L.code }, ctx);
    if (r?.ok === false) throw new Error(r.error);
    return same ? `Copied "${L.name}" from #${h.n} over "${same.name}" (three_do undo reverts it).` : `Added "${L.name} #${h.n}" from #${h.n} as a new layer.`;
  }

  // ---------- reading it ----------
  const STATE = { waiting: '·', running: '◌', done: '✓', failed: '✕', stopped: '■', budget: '⊘', timeout: '⏱' };
  function line(h) {
    const t = h.status === 'running' ? `${h.tool ? `${h.tool} · ` : ''}${h.calls}/${CALLS} calls` : h.status === 'budget' ? 'budget reached' : h.status;
    return `${STATE[h.status] || '•'} #${h.n} ${h.angle.split(':')[0]} · ${t} · ${fmtK(spentOf(h))}${h.real ? '' : ' ≈'}${h.text && h.status !== 'running' ? ` · ${h.text}` : ''}${h.error ? ` · ${h.error}` : ''}${h.broken ? ' · has errors' : ''}`;
  }
  function describe(c = C) {
    if (!c) return 'No crew yet. /crew 3 <brief> explores 3 variations of this scene in parallel (cost shown first).';
    const head = `Crew on "${c.base.name}"${c.brief ? ` · ${c.brief}` : ''} · ${c.status}${c.status === 'plan' ? ` · ≈ ${fmtK(c.est.total)} tokens, ≈ ${secs(c.est.secs)} (/crew go)` : ` · ${fmtK(total(c))} tokens${c.ms ? ` · ${secs(c.ms / 1000)}` : ''}`}`;
    const pk = c.picked ? `\nPicked #${c.picked.n}${c.picked.reason ? ` (${c.picked.by}: ${c.picked.reason})` : ''}.` : '';
    return `${head}\n${c.helpers.map(line).join('\n')}${pk}`;
  }
  async function sheetOf(tiles, tileW = 160) {
    const load = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
    const imgs = await Promise.all(tiles.map((h) => (h.thumb ? load(h.thumb) : null)));
    const first = imgs.find(Boolean);
    if (!first) return null;
    const cols = tiles.length <= 3 ? tiles.length : 3;
    const th = Math.round(tileW * (first.height / first.width)); const pad = 4;
    const cv = Object.assign(document.createElement('canvas'), { width: cols * (tileW + pad) + pad, height: Math.ceil(tiles.length / cols) * (th + pad) + pad });
    const g = cv.getContext('2d');
    g.fillStyle = '#0b0e10'; g.fillRect(0, 0, cv.width, cv.height);
    g.font = 'bold 16px Consolas, monospace';
    tiles.forEach((h, i) => {
      const x = pad + (i % cols) * (tileW + pad); const y = pad + Math.floor(i / cols) * (th + pad);
      if (imgs[i]) g.drawImage(imgs[i], x, y, tileW, th);
      g.fillStyle = '#000b'; g.fillRect(x, y, 24, 22);
      g.fillStyle = '#ffd75e'; g.fillText(String(i + 1), x + 6, y + 16);
    });
    return cv.toDataURL('image/jpeg', 0.8);
  }

  // ---------- the grid (one small card over the app; nothing on screen when no crew) ----------
  const Panel = (() => {
    let card = null; let grid = null; let head = null; let costEl = null; let planEl = null; let foot = null; let sel = 0; let timer = 0; let busyText = null;
    const tiles = new Map(); // helper → { btn, img, num, st }
    function open(c) {
      close();
      sel = 0;
      costEl = el('span', { class: 'crew-cost' });
      head = el('div', { class: 'crew-head' },
        el('b', { text: `👥 Crew · ${c.n} variations` }), el('span', { class: 'crew-brief', text: c.brief || `of "${c.base.name}"`, title: c.brief || c.base.name }), el('span', { class: 'spacer' }), costEl,
        el('button', { type: 'button', class: 'ghost small crew-stop', text: '■', title: 'Stop the crew', on: { click: () => stop() } }),
        el('button', { type: 'button', class: 'ghost small crew-x', text: '✕', title: 'Close the grid (the variations stay)', on: { click: () => { if (C?.status === 'plan') cancel(); else close(); } } }));
      planEl = el('div', { class: 'crew-plan' });
      grid = el('div', { class: 'crew-grid' });
      foot = el('div', { class: 'crew-foot' });
      card = el('div', { class: 'crew-panel', attrs: { role: 'dialog', 'aria-label': 'Crew variations' }, dataset: { feature: 'Crew' } }, head, planEl, grid, foot);
      for (const h of c.helpers) {
        const img = el('img', { alt: '', hidden: true });
        const st = el('span', { class: 'crew-st' });
        const btn = el('button', {
          type: 'button', class: 'crew-tile', dataset: { n: String(h.n) }, title: h.angle,
          on: {
            click: () => { sel = h.n; paint(); },
            dblclick: () => pick(h.n).catch((err) => toast(err.message, { type: 'error' })),
            contextmenu: (e) => { e.preventDefault(); sel = h.n; paint(); showMenu(e.clientX, e.clientY, menuFor(h)); },
          },
        }, img, el('span', { class: 'crew-num', text: `#${h.n}` }), el('span', { class: 'crew-angle', text: h.angle.split(':')[0] }), st);
        tiles.set(h, { btn, img, st });
        grid.append(btn);
      }
      document.body.append(card);
      paint();
      clearInterval(timer);
      timer = setInterval(tick, 1000);
    }
    let ticks = 0;
    function tick() {
      if (!card || !C) return;
      paint();
      // live thumbnails while the helpers work (each stage's small picture, every 3 s; only when you can see them)
      ticks += 1;
      if (C.status === 'running' && ticks % 3 === 0 && document.visibilityState === 'visible') for (const h of C.helpers) if (h.status === 'running') refreshThumb(h);
    }
    const setText = (node, t) => { if (node && node.textContent !== t) node.textContent = t; };
    function menuFor(h) {
      const c = C;
      return [
        { label: `Use #${h.n} as this chat's scene`, disabled: !h.changed || c?.status === 'running', action: () => pick(h.n).catch((err) => toast(err.message, { type: 'error' })) },
        { label: 'Keep as a sketch', disabled: !h.changed || Boolean(h.keptAs), action: () => keep(h.n).then((t) => toast(t, { timeout: 3000 })).catch((err) => toast(err.message, { type: 'error' })) },
        { label: 'Copy a layer into this chat\'s scene', disabled: !h.changed || c?.status === 'running', items: h.sketch.layers.map((L) => ({ label: L.name, action: () => copy(h.n, L.id).then((t) => toast(t, { timeout: 3000 })).catch((err) => toast(err.message, { type: 'error' })) })) },
        '-',
        { label: 'What it changed', action: () => { try { toast(cap(codeOf(h.n, null), 300), { timeout: 8000 }); } catch (err) { toast(err.message, { type: 'error' }); } } },
        { label: 'Stop this helper', disabled: h.status !== 'running', action: () => stopHelper(h, 'stopped') },
      ];
    }
    function tile(h) {
      const t = tiles.get(h);
      if (!t) return;
      if (h.thumb && t.img.src !== h.thumb) { t.img.src = h.thumb; t.img.hidden = false; }
    }
    function paint() {
      const c = C;
      if (!card || !c) return;
      setText(costEl, c.status === 'plan' ? `≈ ${fmtK(c.est.total)} tokens · ≈ ${secs(c.est.secs)}` : `${fmtK(total(c))}${c.helpers.every((h) => h.real) ? '' : ' ≈'} tokens · ${secs(((c.ms || (Date.now() - c.startedAt)) / 1000))}`);
      card.classList.toggle('running', c.status === 'running');
      card.querySelector('.crew-stop').hidden = !(c.status === 'running');
      // plan: what it will cost, and the OK
      if (c.status === 'plan') {
        if (!planEl.firstChild) {
          planEl.append(
            el('span', { class: 'crew-est', text: `${c.n} helpers, each on its own copy with one angle, ≤ ${CALLS} tool calls and ≤ ${fmtK(BUDGET)} tokens. Estimated ≈ ${fmtK(c.est.total)} tokens in all (≈ ${fmtK(c.est.each)} each, mostly cached; ${fmtK(c.est.fixed)} fixed per step) and ≈ ${secs(c.est.secs)}.${(window.Budget?.passLine?.(c.agent?.id, c.est.total) || '').replace(/^\s+/, ' ')}` }),
            el('span', { class: 'spacer' }),
            el('button', { type: 'button', class: 'ghost small', text: 'Cancel', on: { click: () => cancel() } }),
            el('button', { type: 'button', class: 'primary small crew-go', text: `Start ${c.n} helpers`, on: { click: () => approve() } }));
        }
      } else if (planEl.firstChild) planEl.replaceChildren();
      planEl.hidden = c.status !== 'plan';
      for (const h of c.helpers) {
        const t = tiles.get(h);
        if (!t) continue;
        const st = h.status === 'running' ? `◌ ${h.tool || 'thinking'} · ${h.calls}/${CALLS} · ${fmtK(spentOf(h))}` : h.status === 'waiting' ? '·' : `${STATE[h.status] || ''} ${h.status === 'budget' ? 'budget' : h.status === 'done' ? (h.broken ? 'errors' : 'done') : h.status} · ${fmtK(spentOf(h))}`;
        setText(t.st, st);
        const cls = `crew-tile ${h.status}${sel === h.n ? ' on' : ''}${c.picked?.n === h.n ? ' picked' : ''}${h.keptAs ? ' kept' : ''}`;
        if (t.btn.className !== cls) t.btn.className = cls;
        const title = `${h.angle}${h.text ? `\n${h.text}` : ''}${h.error ? `\n${h.error}` : ''}\nDouble-click to use it · right-click for more`;
        if (t.btn.title !== title) t.btn.title = title;
        tile(h);
      }
      // the end: pick (yours or the director's), undo
      const ended = ['done', 'stopped'].includes(c.status);
      const want = ended ? `${c.picked ? 'picked' : 'pick'}|${sel}|${busyText || ''}` : '';
      if (foot.dataset.k !== want) {
        foot.dataset.k = want;
        foot.replaceChildren(...(!ended ? [] : [
          el('button', { type: 'button', class: 'ghost small crew-dpick', text: busyText || '✦ Director picks', disabled: Boolean(busyText), title: 'The director looks at them side by side and picks one with a reason (one small question)', on: { click: () => directorPicks().catch((err) => toast(err.message, { type: 'error' })) } }),
          el('span', { class: 'spacer' }),
          c.picked ? el('button', { type: 'button', class: 'ghost small', text: `↶ Undo #${c.picked.n}`, on: { click: () => undoPick().catch((err) => toast(err.message, { type: 'error' })) } }) : null,
          el('button', { type: 'button', class: 'primary small crew-use', text: sel ? `Use #${sel}` : 'Click one', disabled: !sel, on: { click: () => pick(sel).catch((err) => toast(err.message, { type: 'error' })) } }),
        ].filter(Boolean)));
      }
    }
    function close() { clearInterval(timer); timer = 0; card?.remove(); card = null; tiles.clear(); }
    return { open, paint, tile, close, busy: (t) => { busyText = t; paint(); }, get el() { return card; }, select: (n) => { sel = n; paint(); } };
  })();

  // ---------- the director's tool: three_do crew { op, … } ----------
  async function tool(_t, args = {}, ctx = {}) {
    const op = String(args.op || 'list');
    try {
      if (op === 'start') {
        const chatId = ctx.chatId || null;
        if (chatId && !(await isOn(chatId))) return { ok: false, error: 'Crew is off for this chat (the owner turns it on with /crew on). Work on the scene yourself.' };
        const c = await plan(chatId, { n: args.n, brief: args.brief, angles: args.angles, by: 'director' });
        if (!(await c.decided)) return { ok: true, value: 'The owner said no to the crew (its cost). Carry on alone.' };
        if (args.wait === false) return { ok: true, value: `Crew started: ${c.n} helpers. crew {op: "list"} shows how far they are.` };
        await c.finished;
        const sheet = await sheetOf(c.helpers.filter((h) => h.thumb));
        return { ok: true, value: `${describe(c)}\nThe owner picks in the grid; pick only when asked (crew {op: "pick", n, reason}). To merge: crew {op: "code", n, layer} shows what #n changed, crew {op: "copy", from, layer} copies a layer.`, ...(sheet ? { images: [{ data: sheet.split(',')[1], mime: 'image/jpeg' }] } : {}) };
      }
      if (op === 'list' || op === 'status') return { ok: true, value: describe() };
      if (op === 'pick') return { ok: true, value: await pick(args.n, { by: 'director', reason: args.reason || '' }) };
      if (op === 'undo') return { ok: true, value: await undoPick() };
      if (op === 'keep') return { ok: true, value: await keep(args.n ?? 'all') };
      if (op === 'stop') return { ok: true, value: stop() ? 'Stopping the crew.' : 'No crew is running.' };
      if (op === 'code') return { ok: true, value: codeOf(args.n, args.layer, { full: Boolean(args.full) }) };
      if (op === 'copy') return { ok: true, value: await copy(args.from ?? args.n, args.layer, { into: args.into || '' }) };
      return { ok: false, error: 'crew op: start {n, brief, angles} | list | pick {n, reason} | code {n, layer, full} | copy {from, layer, into} | keep {n|all} | undo | stop' };
    } catch (err) { return { ok: false, error: err.message }; }
  }
  if (typeof HubBridge !== 'undefined') HubBridge.register(['three_crew'], tool);

  // ---------- /crew ----------
  function parseArgs(w) {
    const m = /^(\d+)\s*(.*)$/s.exec(w);
    return m ? { n: Number(m[1]), brief: m[2].trim() } : { n: DEF, brief: w };
  }
  function registerCommands() {
    if (typeof Commands === 'undefined' || Commands.get('crew')) return;
    Commands.register({
      name: 'crew', area: 'Three.js Lab', args: '[2–6] <brief> | go | stop | pick <n|auto> | undo | keep <n|all> | copy <n> <layer> | on | off',
      desc: 'Deploy a crew: 2–6 helpers explore variations of this chat\'s scene in parallel (cost shown first), you pick one',
      examples: ['/crew 3 make it hit harder on the drop', '/crew go', '/crew pick 2', '/crew pick auto', '/crew undo', '/crew keep all', '/crew copy 4 Orb', '/crew on'],
      keywords: 'agents helpers parallel variations explore deploy subagents team options alternatives',
      undo: '/crew undo',
      complete: (a) => {
        const w = a.trim().toLowerCase();
        const nums = (C?.helpers || []).map((h) => h.n);
        if (/^pick\b/.test(w)) return [...nums.map((n) => ({ value: `pick ${n}`, hint: C.helpers[n - 1].angle.split(':')[0] })), { value: 'pick auto', hint: 'the director picks, with a reason' }];
        if (/^keep\b/.test(w)) return [{ value: 'keep all', hint: 'every variation as a sketch' }, ...nums.map((n) => ({ value: `keep ${n}` }))];
        return [{ value: '3 ', hint: 'three helpers and your brief' }, { value: 'go', hint: 'start the crew you were shown' }, { value: 'stop', hint: 'stop it now' }, { value: 'pick ', hint: 'use one' }, { value: 'undo', hint: 'the scene as before' }, { value: 'keep all', hint: 'keep the others as sketches' }, { value: 'on', hint: 'the director may deploy a crew itself' }, { value: 'off' }]
          .filter((x) => !w || x.value.startsWith(w));
      },
      run: async (args, ctx) => {
        const w = String(args || '').trim();
        const chatId = ctx?.chatId || (ctx?.agentId && H.activeChat?.[ctx.agentId]) || null;
        if (!w || /^(status|list)$/i.test(w)) { if (C && !Panel.el && C.status !== 'cancelled') Panel.open(C); return describe(); }
        if (/^(on|off)$/i.test(w)) {
          const chat = ctx?.chat || (chatId && (await Native.loadChat(chatId)));
          if (!chat) return 'Open the director\'s chat first.';
          chat.crew = /^on$/i.test(w) || undefined;
          Native.save(chat);
          return chat.crew ? 'Crew on for this chat: the director may deploy helpers for open look questions (≈ 90 more prompt tokens a message; it always shows you the cost and waits for your OK).' : 'Crew off for this chat: only /crew starts one.';
        }
        if (/^(go|start|yes|ok)$/i.test(w)) return approve() ? 'Crew started.' : 'No crew is waiting for an OK (/crew 3 <brief>).';
        if (/^(stop|cancel)$/i.test(w)) return stop() ? 'Stopping the crew.' : 'No crew is running.';
        if (/^undo$/i.test(w)) return undoPick();
        if (/^pick\s+auto$/i.test(w)) return directorPicks();
        if (/^pick\b/i.test(w)) { const n = Number(w.split(/\s+/)[1]); return Number.isFinite(n) ? pick(n) : 'Which one? /crew pick 2'; }
        if (/^keep\b/i.test(w)) return keep(w.split(/\s+/)[1] || 'all');
        if (/^copy\b/i.test(w)) { const [, n, ...rest] = w.split(/\s+/); return copy(Number(n), rest.join(' ')); }
        if (/^code\b/i.test(w)) { const [, n, ...rest] = w.split(/\s+/); return `\`\`\`diff\n${codeOf(Number(n), rest.join(' ') || null)}\n\`\`\``; }
        const { n, brief } = parseArgs(w);
        const c = await plan(chatId, { n, brief, by: 'owner' });
        return `Crew of ${c.n} ready on "${c.base.name}": ≈ ${fmtK(c.est.total)} tokens, ≈ ${secs(c.est.secs)}. Start it in the grid (or /crew go).`;
      },
    });
  }
  registerCommands();

  return {
    plan, approve, cancel, stop, pick, undo: undoPick, keep, copy, code: codeOf, directorPicks, describe, tool, estimate,
    current: () => C, running: () => C?.status === 'running',
    // chat-scenes.js routes a helper's tool calls to its own stage; three-director.js keeps crew edits out of your undo
    routeFor: (id) => { const h = byHelper.get(id); return h && h.status === 'running' && h.stage ? h.route : null; },
    isCrewSketch: (id) => Boolean(id && String(id).startsWith('crew_')),
    get panel() { return Panel.el; },
    _test: { briefFor, diffLines, Panel, CALLS, BUDGET, get fixed() { return fixedTok; } },
  };
})();
window.ThreeCrew = ThreeCrew;
