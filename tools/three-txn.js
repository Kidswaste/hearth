// A Lab tool call applies whole or not at all, and what an AI did in one reply is one undo step (round 73, labtools73).
// Every three_ tool call (an agent's, a three_do batch, the helpers' own calls through HubBridge.call: 3D models,
// ◉ materials, physics…) passes through here (bridge.js setAround):
//   · before a call that can change a scene, the chat's scene is noted (its layers, slider values, references, timeline
//     length and palette); a call that fails (or a batch that stops at a failing op) after changing some of it is put
//     back, so a scene is never left half-applied; the error says so in words
//   · a call that changed something answers what it changed in plain words (`applied: added layer "🧊 Duck";
//     "Base": keyframes opacity (2)`): the same words on screen and backstage (both come from the scene's data)
//   · shot: true on any call adds a fresh small picture of the scene (when the call didn't send one)
//   · the calls of one AI reply on one scene are one undo step: the dock's ↶ / Alt+Shift+Z / /undo-edit take the whole
//     reply back (and ↷ puts it back); a change by you or another chat in between starts a new step
// Calls made inside another call (a model's add → add_layer → sliders) are part of the outer one. Nothing runs while
// idle; a call costs one copy of its scene's layers before and after (a few ms).
const LabTxn = (() => {
  const S = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.scenes : null);
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const clip = (t, n) => { const s = String(t ?? ''); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  // calls that only read, or that work beyond one scene's layers (the sequence, comps, crews, play-tests, songs…)
  const READ = /^three_(get_code|read_code|search_code|screenshot|console|layers|contact_sheet|timeline|eval|input|help|media_info|task|select_layer|seen|brief)$/; // (round 128, aiprep128: brief)
  const OUTSIDE = /^three_(sequence|comp|make|crew|play|perf|autoedit|loop|load_media|media_control|run|footage|triggers|new_sketch|set_frame|motion|perform)$/; // (round 131, perform131) perform: keys for the live mode, never the scene
  const READ_OP = /^(list|info|help|library|presets|types|status|check|show|find)$/i;
  const isRead = (tool, a = {}) => READ.test(tool) || OUTSIDE.test(tool) || READ_OP.test(String(a.op ?? a.action ?? '')) || (tool === 'three_nodes' && /^\s*(list|presets|types|help)\b/i.test(String(a.command || '')))
    || (tool === 'three_sliders' && !(a.set && typeof a.set === 'object' && Object.keys(a.set).length) && !(a.dial != null && a.value != null)) // (round 74) sliders read, none set · (round 135, mooddial135) a dial turned is a change
    || (tool === 'three_map_song' && !a.apply) // (round 130, songmap130) the song map as ghosts: nothing in the scene changes
    || (tool === 'three_references' && a.action === 'like'); // (round 131, refmatch131) the picture and its palette: a read
  // tools whose own answer already says what changed (no second line about it)
  const SAYS = /^three_(edit_code|set_code|add_layer|update_layer|undo|sliders)$/;
  const stats = { calls: 0, rolledBack: 0, turnsUndone: 0, shots: 0, lastMs: 0 };
  const mark = (k) => { if (typeof HubBridge !== 'undefined') HubBridge.mark?.(k); }; // (round 74, labcalls74) hop steps

  // ---------- a scene, as data ----------
  const sceneFor = (ctx = {}) => (ctx.chatId && typeof ChatScenes !== 'undefined' ? ChatScenes.linkOf?.(ctx.chatId) : null) || S()?.currentId() || null;
  const onScreen = (id) => Boolean(id && id === S()?.currentId() && typeof ThreeLab !== 'undefined' && ThreeLab.director);
  function scanVals(code) {
    try { return ThreeTweaks.scan(code).items.filter((it) => it.key != null).map((it) => ({ key: it.key, value: it.orig })); } catch { return []; }
  }
  // the scene's timeline map (cues, markers): the song's or its own clock's
  const mapPath = (id) => S()?.songOf?.(id) || `scene:${id}`;
  const player = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.director?.media : null);
  async function snap(id) {
    const sc = S(); const sk = id && sc?.get(id);
    if (!sk) return null;
    const here = onScreen(id);
    let layers;
    // (round 74, labcalls74) read only: the scene isn't saved (stamped "updated now") just to be noted
    try { layers = here && ThreeLab.director.capture ? ThreeLab.director.capture({ save: false }).layers : clone(sc.layersOf(sk)); } catch { layers = clone(sc.layersOf(sk)); }
    const vals = {}; const links = {};
    for (const L of layers) {
      let list = null;
      if (here) { try { list = ThreeLab.director.sliders(L.id, null)?.sliders; } catch { list = null; } }
      vals[L.id] = Object.fromEntries((Array.isArray(list) ? list : scanVals(L.code)).map((x) => [x.key, x.value]));
      if (Array.isArray(list)) { const lk = list.filter((x) => x.followsMusic).map((x) => [x.key, clone(x.followsMusic)]); if (lk.length) links[L.id] = Object.fromEntries(lk); } // (round 130, songmap130) ♪ beat links (three_do map_song sets them)
    }
    let map = null;
    try { const m = await player()?.mapAt?.(mapPath(id)); if (m) map = { cues: (m.cues || []).map((c) => ({ t: c.t, name: c.name, ...(c.looks?.length ? { looks: c.looks } : {}) })), marks: m.marks || {} }; } catch { /* no map */ }
    return { id, name: sk.name, layers, vals, links: here ? links : null, map, selId: sc.selectedOf?.(id) || null, refs: (ThreeLab.refsOf?.(id) || []).map((r) => ({ id: r.id, key: r.key })), timeline: clone(sc.timelineOf?.(id) || null), palette: clone(sk.palette || null) };
  }
  // what counts as "the scene" (the playhead's time in its timeline doesn't)
  const sigOf = (t) => (t ? JSON.stringify([t.layers, t.vals, t.refs.map((r) => r.id), t.timeline ? t.timeline.len : null, t.palette, t.map, t.links || null]) : '');

  // ---------- what changed, in plain words ----------
  const PROPS = ['visible', 'opacity', 'blend', 'in', 'out', 'fadeIn', 'fadeOut', 'x', 'y', 'scale', 'rotate'];
  const fmt = (v) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : v == null ? 'none' : clip(typeof v === 'string' ? v : JSON.stringify(v), 24));
  function onlySliders(a, b) {
    try {
      const A = ThreeTweaks.scan(a).items; const B = ThreeTweaks.scan(b).items;
      return A.length === B.length && ThreeTweaks.applyValues(a, A, B.map((it) => it.orig)) === b;
    } catch { return false; }
  }
  const lookWords = (o) => (!o ? 'off' : Object.entries(o).map(([k, x]) => `${window.MatCore ? MatCore.describe(x) : x.k}${k === '*' || k === '#Model' ? '' : ` (${k})`}`).join(', '));
  function describe(b, a) {
    if (!b || !a) return '';
    const out = [];
    const bl = new Map(b.layers.map((L) => [L.id, L])); const al = new Map(a.layers.map((L) => [L.id, L]));
    for (const L of a.layers) if (!bl.has(L.id)) out.push(`added layer "${L.name}"`);
    for (const L of b.layers) if (!al.has(L.id)) out.push(`removed layer "${L.name}"`);
    for (const L of a.layers) {
      const B = bl.get(L.id);
      if (!B) continue;
      const bits = [];
      if (B.name !== L.name) bits.push(`renamed from "${B.name}"`);
      if (B.code !== L.code && !onlySliders(B.code, L.code)) bits.push('code edited');
      const bv = b.vals[L.id] || {}; const av = a.vals[L.id] || {};
      const moved = Object.keys(av).filter((k) => k in bv && JSON.stringify(bv[k]) !== JSON.stringify(av[k]));
      for (const k of moved.slice(0, 5)) bits.push(`${k} ${fmt(bv[k])} → ${fmt(av[k])}`);
      if (moved.length > 5) bits.push(`${moved.length - 5} more sliders`);
      for (const k of PROPS) if (JSON.stringify(B[k] ?? null) !== JSON.stringify(L[k] ?? null)) bits.push(`${k} ${fmt(B[k])} → ${fmt(L[k])}`);
      const props = new Set([...Object.keys(B.keys || {}), ...Object.keys(L.keys || {})]);
      for (const p of props) {
        const x = B.keys?.[p] || []; const y = L.keys?.[p] || [];
        if (JSON.stringify(x) === JSON.stringify(y)) continue;
        bits.push(y.length ? `keyframes ${p.replace(/^s:/, '')} (${y.length})` : `keyframes ${p.replace(/^s:/, '')} removed`);
      }
      const lb = B.overrides?.['@look'] || null; const la = L.overrides?.['@look'] || null;
      if (JSON.stringify(lb) !== JSON.stringify(la)) bits.push(`material ${lookWords(la)}`);
      if (JSON.stringify(B.camMoves || []) !== JSON.stringify(L.camMoves || [])) bits.push(`camera moves (${(L.camMoves || []).length})`);
      const lanesB = B.lanes || (B.lane ? [B.lane] : []); const lanesA = L.lanes || (L.lane ? [L.lane] : []);
      for (const p of lanesA) if (!lanesB.includes(p)) bits.push(`lane ${p.replace(/^s:/, '')} shown`);
      for (const p of lanesB) if (!lanesA.includes(p)) bits.push(`lane ${p.replace(/^s:/, '')} hidden`);
      if (bits.length) out.push(`"${L.name}": ${bits.join(', ')}`);
    }
    const same = a.layers.filter((L) => bl.has(L.id)).map((L) => L.id);
    const was = b.layers.filter((L) => al.has(L.id)).map((L) => L.id);
    if (same.join() !== was.join()) out.push('layer order changed');
    const br = new Set(b.refs.map((r) => r.id));
    for (const r of a.refs) if (!br.has(r.id)) out.push(`reference "${r.key}" added`);
    const ar = new Set(a.refs.map((r) => r.id));
    for (const r of b.refs) if (!ar.has(r.id)) out.push(`reference "${r.key}" removed`);
    if ((b.timeline?.len ?? null) !== (a.timeline?.len ?? null)) out.push(a.timeline ? `scene timeline ${a.timeline.len} s` : 'scene timeline removed');
    if (JSON.stringify(b.palette) !== JSON.stringify(a.palette)) out.push(`palette ${(a.palette || []).join(' ') || 'cleared'}`);
    if (b.map && a.map) {
      const key = (c) => `${c.t}|${c.name}`;
      const cb = new Set(b.map.cues.map(key)); const ca = new Set(a.map.cues.map(key));
      for (const c of a.map.cues) if (!cb.has(key(c))) out.push(`cue "${c.name}" at ${fmt(c.t)} s`);
      for (const c of b.map.cues) if (!ca.has(key(c))) out.push(`cue "${c.name}" removed`);
      for (const lane of new Set([...Object.keys(b.map.marks || {}), ...Object.keys(a.map.marks || {})])) {
        const x = (b.map.marks[lane] || []).length; const y = (a.map.marks?.[lane] || []).length;
        if (JSON.stringify(b.map.marks[lane] || []) !== JSON.stringify(a.map.marks?.[lane] || [])) out.push(`${lane} markers ${x} → ${y}`);
      }
    }
    return out.join('; ');
  }

  // ---------- putting a scene back ----------
  // keepRefs: an undo leaves files it added in the references (a redo needs them); a failed call's are taken out
  async function restore(t, { keepRefs = false } = {}) {
    const sc = S(); const sk = sc?.get(t.id);
    if (!sk) throw new Error(`The scene "${t.name}" isn't there anymore.`);
    if (onScreen(t.id) && ThreeLab.director.restore) {
      await ThreeLab.director.restore({ sketchId: t.id, layers: t.layers, selId: t.selId }, { wait: 0.4 });
      // slider moves the Lab on screen kept unsaved: back to what they were
      for (const L of t.layers) {
        const want = t.vals[L.id] || {};
        let now = null; try { now = ThreeLab.director.sliders(L.id, null)?.sliders; } catch { continue; }
        const set = Object.fromEntries((now || []).filter((x) => x.key in want && JSON.stringify(x.value) !== JSON.stringify(want[x.key])).map((x) => [x.key, want[x.key]]));
        if (Object.keys(set).length) { try { ThreeLab.director.sliders(L.id, set); } catch { /* gone */ } }
        // (round 130, songmap130) ♪ beat links back as they were (the sliders' own undo is left alone)
        const ctl = t.links && ThreeLab.stageHooks?.ctlOf?.(L.id);
        if (ctl?.link) for (const x of now || []) { const was = t.links[L.id]?.[x.key] || null; if (JSON.stringify(x.followsMusic || null) !== JSON.stringify(was) && (was ? was.how : x.followsMusic?.how)) ctl.link(x.key, was, { undo: false }); }
      }
    } else {
      sk.layers = clone(t.layers);
      sc.changed(t.id);
    }
    if (!keepRefs) { const keep = new Set(t.refs.map((r) => r.id)); for (const r of ThreeLab.refsOf?.(t.id) || []) if (!keep.has(r.id)) ThreeLab.removeReference?.(r.id, { sketchId: t.id }); }
    if ((sc.timelineOf?.(t.id)?.len ?? null) !== (t.timeline?.len ?? null)) sc.setTimeline?.(t.id, t.timeline || null);
    const P = player();
    if (t.map && P?.editMapAt) {
      const now = await P.mapAt(mapPath(t.id)).catch(() => null);
      if (now && JSON.stringify({ cues: (now.cues || []).map((c) => ({ t: c.t, name: c.name, ...(c.looks?.length ? { looks: c.looks } : {}) })), marks: now.marks || {} }) !== JSON.stringify(t.map)) {
        await P.editMapAt(mapPath(t.id), { cues: { clear: true, add: t.map.cues.map((c) => ({ time: c.t, name: c.name, ...(c.looks ? { looks: c.looks } : {}) })) }, markers: { clear: Object.keys(now.marks || {}), add: t.map.marks } });
      }
    }
    if (JSON.stringify(sk.palette || null) !== JSON.stringify(t.palette)) { if (t.palette) sk.palette = clone(t.palette); else delete sk.palette; sc.changed(t.id); }
  }

  // ---------- one undo step per AI reply ----------
  const turns = new Map(); // chatId → the reply number (a message sent to it starts the next)
  const undoStack = []; const redoStack = []; const MAX = 12;
  let lastUndo = null; // 'turn' | 'code'
  if (typeof Native !== 'undefined' && Native.hooks?.send) Native.hooks.send.push((agentId, chat) => { if (chat?.id) turns.set(chat.id, (turns.get(chat.id) || 0) + 1); });
  const whoOf = (chatId) => { const c = (typeof H !== 'undefined' ? H.chats || [] : []).find((x) => x.id === chatId); const ag = c && H.agent?.(c.agentId); return (c?.engine || ag?.engine) === 'codex' ? 'Astra' : ag?.name && !/director/i.test(ag.name) ? ag.name : 'Claude'; };
  function remember(ctx, tool, before, after, at, words) {
    if (!ctx.chatId || !before || !after || sigOf(before) === sigOf(after)) return;
    const key = `${ctx.chatId}|${turns.get(ctx.chatId) || 0}|${before.id}`;
    const top = undoStack.findLast((e) => e.sceneId === before.id);
    if (top && top.key === key && sigOf(top.after) === sigOf(before)) {
      Object.assign(top, { after, lastAt: Date.now(), calls: top.calls + 1 });
      if (words) top.words.push(words);
    } else {
      undoStack.push({ key, chatId: ctx.chatId, who: whoOf(ctx.chatId), sceneId: before.id, scene: before.name, at, lastAt: Date.now(), before, after, calls: 1, words: words ? [words] : [] });
      if (undoStack.length > MAX) undoStack.shift();
    }
    redoStack.length = 0;
  }
  const label = (e) => e.label || `what ${e.who} did in one reply to "${e.scene}" (${e.calls} call${e.calls === 1 ? '' : 's'})`;
  // (round 130, takes130) a change made outside any tool call that is one undo step of its own (✦ 3 takes: a take kept):
  // the dock's ↶ / Alt+Shift+Z / /undo-edit take it back whole, like an AI's reply
  function step({ chatId = null, who = 'You', before, after, label: text = '', words = '' } = {}) {
    if (!before || !after || before.id !== after.id || sigOf(before) === sigOf(after)) return false;
    const now = Date.now();
    undoStack.push({ key: `step|${now}|${Math.random()}`, chatId, who, sceneId: before.id, scene: before.name, at: now, lastAt: now, before, after, calls: 1, words: words ? [words] : [], ...(text ? { label: text } : {}) });
    if (undoStack.length > MAX) undoStack.shift();
    redoStack.length = 0; lastUndo = null;
    return true;
  }
  // the dock's ↶ takes the newest of: a whole reply (here) or a code edit made outside any chat (ThreeDirector's history)
  function wantsUndo(codeHistory = []) {
    const e = undoStack.at(-1);
    if (!e) return false;
    const newestCode = codeHistory.at(-1);
    return !newestCode || newestCode.at <= e.lastAt + 50;
  }
  const wantsRedo = () => lastUndo === 'turn' && redoStack.length > 0;
  async function undoTurn({ force = false } = {}) {
    const e = undoStack.at(-1);
    if (!e) throw new Error('Nothing an AI did to undo.');
    const cur = await snap(e.sceneId);
    if (!cur) throw new Error(`The scene "${e.scene}" isn't there anymore.`);
    if (!force && sigOf(cur) !== sigOf(e.after)) throw new Error(`"${e.scene}" changed after ${e.who}'s last reply (you or another chat?). /undo-edit force puts it back anyway.`);
    await restore(e.before, { keepRefs: true });
    undoStack.pop(); redoStack.push(e); lastUndo = 'turn'; stats.turnsUndone += 1;
    window.ThreeDirector?.forget?.(e.sceneId, e.at, e.lastAt);
    return { turn: true, restored: 'before', layer: e.scene, who: e.who, calls: e.calls, label: label(e), tool: 'three_last_reply', at: e.at, errors: 0, what: e.words.join('; ') };
  }
  async function redoTurn() {
    const e = redoStack.at(-1);
    if (!e) throw new Error('Nothing to redo.');
    await restore(e.after, { keepRefs: true });
    redoStack.pop(); undoStack.push(e); lastUndo = undoStack.length ? 'turn' : null;
    return { turn: true, restored: 'after', layer: e.scene, who: e.who, calls: e.calls, label: label(e), tool: 'three_last_reply', at: e.at, errors: 0 };
  }

  // ---------- (round 137, replydiff137) what each reply changed, for the review under it (tools/three-replydiff.js) ----------
  // When a reply ends, its calls' before / after per scene are kept (kv labtxn-replies, the newest 10, 2 weeks) and the
  // reply gets labDiff: { id, layers } (the "Changed 3 layers · Review" line). Nothing extra while a reply runs.
  const REPLIES = 'labtxn-replies'; const KEEP_REPLIES = 10; const KEEP_MS = 14 * 864e5;
  let replies = null; let repliesRead = null;
  const readReplies = () => (repliesRead ||= (async () => {
    let d = null; try { d = await window.hub.kvGet(REPLIES, null); } catch { d = null; }
    const old = Array.isArray(d?.list) ? d.list : [];
    replies = (replies || []).concat(old.filter((r) => !(replies || []).some((x) => x.id === r.id)));
    return replies;
  })());
  const saveReplies = () => { const cut = Date.now() - KEEP_MS; replies = replies.filter((r) => r.at >= cut).sort((a, b) => b.at - a.at).slice(0, KEEP_REPLIES); window.hub.kvSet(REPLIES, { v: 1, list: replies }).catch?.(() => {}); };
  // the layers a change touched (added, removed, or any of its data / slider values)
  function layersChanged(b, a) {
    const bl = new Map(b.layers.map((L) => [L.id, L])); const al = new Map(a.layers.map((L) => [L.id, L]));
    const ids = new Set();
    for (const id of new Set([...bl.keys(), ...al.keys()])) if (JSON.stringify(bl.get(id) || null) !== JSON.stringify(al.get(id) || null) || JSON.stringify(b.vals[id] || null) !== JSON.stringify(a.vals[id] || null) || JSON.stringify(b.links?.[id] || null) !== JSON.stringify(a.links?.[id] || null)) ids.add(id);
    return ids.size;
  }
  function onFinish(event, chat, extras) {
    if (!chat?.id) return;
    const pre = `${chat.id}|${turns.get(chat.id) || 0}|`;
    const mine = undoStack.filter((e) => e.key.startsWith(pre));
    if (!mine.length) return;
    const scenes = [];
    for (const e of mine) {
      const s = scenes.find((x) => x.sceneId === e.sceneId);
      if (s) Object.assign(s, { after: e.after, lastAt: e.lastAt, key: e.key }); else scenes.push({ sceneId: e.sceneId, scene: e.scene, key: e.key, at: e.at, lastAt: e.lastAt, before: e.before, after: e.after });
    }
    const real = scenes.filter((s) => sigOf(s.before) !== sigOf(s.after));
    if (!real.length) return;
    const id = `rd${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const layers = real.reduce((n, s) => n + layersChanged(s.before, s.after), 0);
    extras.labDiff = { id, layers, scenes: real.length };
    const rec = { id, chatId: chat.id, who: mine[0].who, at: mine[0].at, scenes: real.map((s) => ({ ...s, before: clone(s.before), after: clone(s.after) })) };
    (replies ||= []).unshift(rec);
    readReplies().then(saveReplies);
  }
  if (typeof Native !== 'undefined' && Native.hooks?.finish) Native.hooks.finish.push(onFinish);
  const reply = async (id) => { await readReplies(); return (replies || []).find((r) => r.id === id) || null; };
  // the reply's own undo step is still the newest one, and the scene is as the reply left it
  const isTop = (key) => { const e = undoStack.at(-1); return Boolean(e && e.key === key); };

  // ---------- the wrapper (bridge.js) ----------
  const open = new Map(); // scene id → { chatId }: a call running on it (calls inside it are part of it)
  const inject = { tool: null, n: 0 }; // dev checks: the nth call of that tool inside another call fails
  async function around(tool, args, ctx, next) {
    const a = args || {};
    if (isRead(tool, a) || !S()) return next();
    const id = sceneFor(ctx);
    const o = id && open.get(id);
    if (!id || (o && o.chatId === (ctx.chatId || null))) { // a call inside a call
      if (inject.tool === tool && (inject.n -= 1) <= 0) { inject.tool = null; return { ok: false, error: 'A test failure (injected by a check).' }; }
      return next({ ...ctx, batch: { ...(ctx.batch || {}), shot: true } }); // its helper's answer: no picture of its own (the outer call's caller asks)
    }
    const t0 = performance.now(); const at = Date.now();
    const before = await snap(id);
    mark('txn:before');
    if (!before) return next();
    open.set(id, { chatId: ctx.chatId || null });
    let r;
    try { r = await next(); } catch (err) { r = { ok: false, error: err.message }; } finally { open.delete(id); }
    mark('call');
    stats.calls += 1;
    const after = await snap(id);
    mark('txn:after');
    const failed = !r || r.ok === false || r.partial;
    const changedIt = after && sigOf(after) !== sigOf(before);
    if (failed && changedIt && !/took over 55 s/.test(String(r?.error || ''))) {
      // a failed call left part of its work: the scene goes back to how it was before the call
      try {
        await restore(before);
        stats.rolledBack += 1;
        const note = 'Nothing was left half-done: the scene is back as it was before this call.';
        if (r?.partial) r = { ...r, value: `${r.value}\n${note.replace('this call', 'this batch')}` };
        else r = { ...(r || {}), ok: false, error: `${String(r?.error || 'It failed.').replace(/\s*$/, '')} ${note}`, rolledBack: true };
      } catch (err) { r = { ...(r || {}), ok: false, error: `${r?.error || 'It failed.'} (It could not be put back: ${err.message}.)` }; }
      stats.lastMs = Math.round(performance.now() - t0);
      return r;
    }
    if (!failed && changedIt) {
      const words = describe(before, after);
      remember(ctx, tool, before, after, at, words);
      if (words && !SAYS.test(tool)) r = withWords(r, words);
      mark('txn:words');
    }
    if (!failed && a.shot === true && !r.images?.length && tool !== 'three_screenshot') { r = await withShot(r, ctx); mark('picture'); }
    stats.lastMs = Math.round(performance.now() - t0);
    return r;
  }
  function withWords(r, words) {
    const v = r.value;
    if (v && typeof v === 'object' && !Array.isArray(v)) return { ...r, value: { ...v, applied: words } };
    if (typeof v === 'string') return { ...r, value: `${v}\napplied: ${words}` };
    if (v === undefined) return { ...r, value: { applied: words } };
    return { ...r, value: { result: v, applied: words } };
  }
  // a fresh small picture of the chat's scene (on screen or backstage), as three_screenshot would send it
  async function withShot(r, ctx) {
    try {
      const s = await HubBridge.call('three_screenshot', { size: 'small', force: true }, { chatId: ctx.chatId || null });
      if (s?.ok !== false && s.images?.length) { stats.shots += 1; return { ...r, images: [...(r.images || []), ...s.images] }; }
    } catch { /* no picture: the answer stands */ }
    return r;
  }
  if (typeof HubBridge !== 'undefined' && HubBridge.setAround) HubBridge.setAround(around);

  return { reply, isTop, around, snap, describe, restore, step, undoTurn, redoTurn, wantsUndo, wantsRedo, noteCodeUndo: () => { lastUndo = 'code'; }, stats, history: () => undoStack.map((e) => ({ who: e.who, scene: e.scene, calls: e.calls, at: e.at, words: e.words.slice() })), _test: { isRead, sigOf, failNested: (tool, n = 1) => { inject.tool = tool; inject.n = n; } } }; // (round 137, replydiff137) reply, isTop
})();
window.LabTxn = LabTxn;
