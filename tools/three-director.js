// The Three Director's fast loop (round 2): leaner tool results and fewer round trips for the calls the owner's
// director makes most (eval, edit, screenshot, read, search, sliders). tools/three.js asks handle() first; null
// means "use the Lab's own handler". Every result here is what the model reads, so it is kept short:
//   - three_edit_code: atomic multi-layer batches, a compact diff, errors, new console lines, fps, optional thumbnail
//   - three_set_code / update_layer / console: a compact report (report: 'full' / full: true for the old one)
//   - three_screenshot: size, region crop, seek first, compare with the previous picture, a strip of frames
//   - three_read_code / three_search_code: plain numbered text (no JSON escaping), merged and trimmed context
//   - three_eval: results cut at `max` chars with a hint; console only when the eval printed something
//   - three_sliders / three_get_code: sliders as one line each instead of JSON objects
// It also keeps the director's code history (every code change it made, per layer) for one-click undo.
// (round 21, labdirector) The loop got faster and cheaper:
//   - code changes answer when the change is on screen (the preview's first new frame, or its error) instead of
//     after a fixed 2.5 s; the frame size answers in one line
//   - pictures are made small by the preview itself (no full-size PNG), 768 px by default, encoded off the thread
//   - the scene state (sketch, frame, music, layers) is said once per reply, then only when it changed
//   - an edit says where it landed (line, −/+), not the code the director just sent (diff: true for the diff)
//   - errors are one line each: [layer] line N: message → the code on that line
//   - safe: true undoes an edit that breaks its layer; three_do undo reverts the last change without resending code
// (round 37, directorlean) Less input per turn (dev/directorlean-measure.js: ≈ 67 % less added per typical ask):
//   - what this chat's engine session already has is not sent again in a later reply (code it read or wrote, slider
//     tables, scene state, console lines): one line, or only the lines that changed (per chat, per session)
//   - get_code / select_layer: one line per layer + only the selected layer's code (an outline past 160 lines)
//   - pictures: small (512 px) by default, a later one in the same reply 384 px; the Lab's own pictures (play-test,
//     notes, references, contact sheet) made small too (trim); play / seek answers with the transport in one line
//   - slider moves answer with the sliders that moved; add_layer with code doesn't list the sliders it wrote
// (round 49, directorfrugal) Fewer steps (each one re-reads the whole context; dev/directorfrugal-measure.js: six typical
// tasks 32 → 18 steps, ≈ 54 % fewer input tokens):
//   - a change that shows (edit, new layer, rewrite, layer settings, slider move, frame size) brings its own 384 px
//     picture unless it errored or nothing visibly changed; code changes say "errors: none" (no console / screenshot step)
//   - errors carry the usual fix and the ±2 lines around the first one (no read_code / help step before the fix)
//   - get_code's outline lists each layer's colours with their lines (a palette is one edit_code over every layer)
//   - help topics this chat's session already has are one line (seen(): asked by mcp/three-mcp.js via bridge.js)
const ThreeDirector = (() => {
  const clip = (s, n = 160) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fmtK = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n ?? 0));

  // ---------- compact reports ----------
  const statLine = (s) => (s && typeof s === 'object'
    ? `${s.fps} fps${s.worstFrameMs > 40 ? ` (worst ${s.worstFrameMs} ms)` : ''} · render ${s.renderMs} ms · ${s.drawCalls} draws · ${fmtK(s.triangles)} tris${s.points ? ` · ${fmtK(s.points)} pts` : ''}${s.textures ? ` · ${s.textures} tex` : ''}`
    : String(s || ''));
  const frameLine = (f) => (f ? `${f.id === 'fit' ? 'fit' : f.id} ${f.width}×${f.height}` : '');
  const musicLine = (m) => (m && typeof m === 'object' ? `${String(m.file || '').split(/[\\/]/).pop()} · ${Math.round((m.bpm || 0) * 10) / 10} bpm · ${(m.time || 0).toFixed(1)}/${Math.round(m.duration || 0)} s${m.playing ? ' · playing' : ''}` : String(m || ''));
  // One line per slider: "punch = 1.2 · Bass punch [0–3] (Music) ♪bass" — what the model needs, a third of the JSON.
  function sliderLine(c) {
    const v = typeof c.value === 'string' ? c.value : JSON.stringify(c.value);
    const range = c.min != null ? ` [${c.min}–${c.max}]` : c.options ? ` {${c.options.join('|')}}` : '';
    const music = c.followsMusic ? ` ♪${typeof c.followsMusic === 'object' ? c.followsMusic.source || c.followsMusic.band || 'music' : c.followsMusic}` : '';
    return `${c.key} = ${v} · ${c.label || c.key}${range}${c.group ? ` (${c.group})` : ''}${music}${c.live === false ? ' (setup only)' : ''}`;
  }
  const sliderLines = (list) => (Array.isArray(list) ? list.map(sliderLine) : list);
  // a list of the selected layer's slider names in a result: dropped where the director has the code (or doesn't need
  // them); the "none: add named controls" nudge stays
  const namesOff = (v) => { if (v && /^\d+: /.test(String(v.sliders ?? ''))) delete v.sliders; return v; };
  function compact(r, { lines = 8 } = {}) {
    if (!r || typeof r !== 'object') return r;
    const out = {};
    for (const k of ['added', 'updated', 'removed']) if (r[k]) out[k] = r[k];
    out.sketch = r.sketch;
    out.layer = r.layer;
    if (r.errors?.length) out.errors = r.errors.map((e) => `${e.layer ? `[${e.layer}] ` : ''}${e.line ? `line ${e.line}: ` : ''}${clip(e.message, 240)}`);
    const con = (r.console || []).slice(-lines).map((l) => clip(l, 220));
    if (con.length) out.console = con;
    out.stats = statLine(r.stats);
    out.frame = frameLine(r.frame);
    out.sliders = Array.isArray(r.sliders) ? `${r.sliders.length}: ${r.sliders.map((s) => s.label || s.key).join(', ')}` : r.sliders;
    if (r.unsavedSliders) out.unsavedSliders = r.unsavedSliders;
    if (r.layers?.length > 1) out.layers = r.layers.map((L) => `${L.name}${L.selected ? '*' : ''}${L.visible === false ? ' (hidden)' : ''}`).join(', ');
    out.music = musicLine(r.music);
    if (r.note) out.note = r.note;
    return out;
  }

  // ---------- diffs ----------
  // Line diff of the changed middle (common head / tail trimmed, LCS inside when small): ops with new line numbers.
  function diffOps(a, b) {
    const A = a.split('\n'); const B = b.split('\n');
    let s = 0; while (s < A.length && s < B.length && A[s] === B[s]) s += 1;
    let e = 0; while (e < A.length - s && e < B.length - s && A[A.length - 1 - e] === B[B.length - 1 - e]) e += 1;
    const a2 = A.slice(s, A.length - e); const b2 = B.slice(s, B.length - e);
    const ops = []; // [type, text, newLine]
    if (a2.length * b2.length <= 250000) {
      const n = a2.length; const m = b2.length;
      const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
      for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1) L[i][j] = a2[i] === b2[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      let i = 0; let j = 0;
      while (i < n || j < m) {
        // removed lines first, then the added ones, like a unified diff
        if (i < n && j < m && a2[i] === b2[j]) { ops.push([' ', b2[j], s + j + 1]); i += 1; j += 1; } else if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) { ops.push(['-', a2[i], s + j + 1]); i += 1; } else { ops.push(['+', b2[j], s + j + 1]); j += 1; }
      }
    } else {
      for (const t of a2) ops.push(['-', t, s + 1]);
      b2.forEach((t, k) => ops.push(['+', t, s + k + 1]));
    }
    return ops;
  }
  // hunks: changed lines only, "@@ 42" headers where a new run starts
  function diff(a, b, { max = 40 } = {}) {
    const out = []; let lastLine = -2; let shown = 0; let hidden = 0;
    for (const [t, text, ln] of diffOps(a, b)) {
      if (t === ' ') { lastLine = -2; continue; }
      if (shown >= max) { hidden += 1; continue; }
      if (lastLine === -2) out.push(`@@ ${ln}`);
      out.push(`${t} ${clip(text.replace(/\s+$/, ''), 160)}`);
      lastLine = ln; shown += 1;
    }
    if (hidden) out.push(`… ${hidden} more changed lines`);
    return out.length ? out.join('\n') : '(no change)';
  }
  // Where an edit landed, without echoing the code the director just sent: "line 14 −1 +1, line 30 +2".
  function landed(a, b) {
    const runs = []; let cur = null;
    for (const [t, , ln] of diffOps(a, b)) {
      if (t === ' ') { cur = null; continue; }
      if (!cur) runs.push(cur = { at: ln, minus: 0, plus: 0 });
      if (t === '-') cur.minus += 1; else cur.plus += 1;
    }
    if (!runs.length) return 'no change';
    const shown = runs.slice(0, 6).map((r) => `line ${r.at}${r.minus ? ` −${r.minus}` : ''}${r.plus ? ` +${r.plus}` : ''}`).join(', ');
    return runs.length > 6 ? `${shown}, … ${runs.length - 6} more` : shown;
  }

  // ---------- edits ----------
  // Same rules as the Lab's editCode (exact find, once unless all; or a line range), done in memory so a batch over
  // several layers applies all or nothing.
  function applyEdits(code, edits, name) {
    const done = [];
    for (const [n, e] of edits.entries()) {
      if (e.lines) {
        const lines = code.split('\n');
        const [a, b] = [Number(e.lines[0]), Number(e.lines[1] ?? e.lines[0])];
        if (!(a >= 1 && b >= a - 1 && b <= lines.length)) throw new Error(`Edit ${n + 1}: lines ${a}–${b} are outside 1–${lines.length} of "${name}".`);
        lines.splice(a - 1, b - a + 1, ...String(e.replace ?? '').split('\n'));
        code = lines.join('\n');
        done.push(`lines ${a}–${b}`);
        continue;
      }
      const find = String(e.find ?? '');
      if (!find) throw new Error(`Edit ${n + 1}: give find (exact text) or lines [from, to].`);
      const count = code.split(find).length - 1;
      if (!count) {
        // the usual miss is whitespace: say where a trimmed version of the first line is, so the next try lands
        const norm = (t) => t.replace(/\s+/g, ' ').trim();
        const first = norm(find.split('\n').find((l) => l.trim()) || '');
        const at = first ? code.split('\n').findIndex((l) => norm(l).includes(first)) : -1;
        throw new Error(`Edit ${n + 1}: the text to find isn't in "${name}"${at >= 0 ? ` (its first line is at line ${at + 1}: check the whitespace, or use lines)` : ' (three_search_code finds it)'}.`);
      }
      if (count > 1 && !e.all) throw new Error(`Edit ${n + 1}: the text appears ${count} times in "${name}"; add context to make it unique, or all: true.`);
      code = e.all ? code.split(find).join(String(e.replace ?? '')) : code.replace(find, () => String(e.replace ?? ''));
      done.push(count > 1 ? `${count}× replaced` : 'replaced');
    }
    return { code, done };
  }

  // ---------- the director's code history (undo / redo) ----------
  const history = []; // newest last: { sketchId, sketch, layerId, layer, before, after, tool, at }
  const redoStack = [];
  const HISTORY_MAX = 40;
  const listeners = new Set();
  const changed = () => { for (const fn of listeners) { try { fn(); } catch (err) { console.warn(err); } } };
  function record(entry) {
    if (entry.before === entry.after) return;
    if (window.ThreeCrew?.isCrewSketch?.(entry.sketchId)) return; // (round 22) a crew variation: thrown away or kept whole
    history.push({ ...entry, at: Date.now() });
    if (history.length > HISTORY_MAX) history.shift();
    redoStack.length = 0;
    changed();
  }
  // A history entry of a sketch that isn't on screen (another director chat's scene) is undone in that sketch's data,
  // without switching the Lab to it (tools/three-backstage.js).
  const forEntry = (d, h) => (h?.sketchId && d.codeOf().sketchId !== h.sketchId && typeof ThreeBackstage !== 'undefined' && ThreeLab.scenes?.get(h.sketchId) ? ThreeBackstage.dataDirector(h.sketchId) : d);
  // Puts a layer's code back. Opens the sketch it belonged to when another one is open now.
  async function restore(d, h, code) {
    d = forEntry(d, h);
    if (h.sketchId && d.codeOf().sketchId !== h.sketchId) {
      d.openSketch(h.sketchId);
      await sleep(400);
      if (d.codeOf().sketchId !== h.sketchId) throw new Error(`The sketch "${h.sketch}" isn't there anymore.`);
    }
    let cur;
    try { cur = d.codeOf(h.layerId); } catch { throw new Error(`The layer "${h.layer}" isn't there anymore.`); }
    const r = await d.updateLayer(h.layerId, { code }, 0.8);
    return { layer: cur.name, report: r };
  }
  // sketchId: the last change in that scene (three_do undo from a chat undoes that chat's own change)
  async function undo(d, { force = false, sketchId = null } = {}) {
    const i = sketchId ? history.findLastIndex((x) => x.sketchId === sketchId) : history.length - 1;
    const h = history[i];
    if (!h) throw new Error(sketchId ? 'No code change of yours to undo in this scene.' : 'The director hasn\'t changed any code yet.');
    const cur = (() => { try { return forEntry(d, h).codeOf(h.layerId).code; } catch { return null; } })();
    if (cur != null && cur !== h.after && !force) throw new Error(`"${h.layer}" changed after the director's edit (you or a slider save?). /undo-edit force puts the director's "before" back anyway.`);
    const r = await restore(d, h, h.before);
    history.splice(history.indexOf(h), 1); redoStack.push(h); changed();
    return { ...h, restored: 'before', errors: r.report?.errors?.length || 0 };
  }
  async function redo(d) {
    const h = redoStack.at(-1);
    if (!h) throw new Error('Nothing to redo.');
    const r = await restore(d, h, h.after);
    redoStack.pop(); history.push(h); changed();
    return { ...h, restored: 'after', errors: r.report?.errors?.length || 0 };
  }

  // ---------- don't send the same thing twice ----------
  // (round 37, directorlean) What the director's engine session already has is not sent again: the engine resumes the
  // same session every message and its history keeps every earlier tool result, so code, slider tables and the scene
  // state it got in an earlier reply of this chat are a one-line "unchanged" (force: true re-sends) or only the lines
  // that changed. Kept per chat ("bucket"); forgotten when the session changes (a new chat, compact / continue lighter,
  // a handover to the other engine, an error or a stop) and after KEEP_TURNS replies. Calls that name no chat (tests,
  // /director try) keep the old rule: within one reply, reset whenever the user sends a director a message.
  const KEEP_TURNS = 8;
  const bucketNew = (session = null, chat = null) => ({ session, chat, turn: 0, seen: new Map(), lastSig: null, pics: 0 });
  let loose = bucketNew();
  const chatBuckets = new Map(); // chatId → bucket
  const crewBuckets = new Map(); // (round 22, labcrew) each crew helper keeps its own "already said" state
  const savedNotes = { reads: 0, shots: 0, state: 0, waitMs: 0, pics: {}, code: 0, trimmed: 0 };
  // seen: key → { text, turn, how } ('read' | 'wrote'); valid this reply, or an earlier one of the same session
  const seenOf = (B, key) => { const e = B.seen.get(key); return e && B.turn - e.turn <= KEEP_TURNS ? e : null; };
  const see = (B, key, text, how = 'read') => { B.seen.set(key, { text, turn: B.turn, how }); if (B.seen.size > 400) B.seen.delete(B.seen.keys().next().value); };
  const agoOf = (B, e) => (e.turn === B.turn ? 'earlier in this reply' : `${B.turn - e.turn} message${B.turn - e.turn === 1 ? '' : 's'} ago`);
  const forgetBefore = (B, turn) => { for (const [k, e] of B.seen) if (e.turn < turn) B.seen.delete(k); };
  // A user message to a director: a new reply. chatId + chat: that chat's bucket goes on when the chat resumes the
  // session its last finished reply had, else starts empty. No arguments (tests): everything starts empty.
  function newTurn(chatId = null, chat = null) {
    loose = bucketNew();
    for (const B of crewBuckets.values()) { for (const [k] of B.seen) if (!k.startsWith('state:')) B.seen.delete(k); B.lastSig = null; }
    if (chatId == null) { chatBuckets.clear(); return; }
    const sid = chat?.session?.id || null;
    const B = chatBuckets.get(chatId);
    if (B && sid && B.session === sid) { B.turn += 1; B.chat = chat; B.lastSig = null; B.pics = 0; return; }
    chatBuckets.delete(chatId);
    chatBuckets.set(chatId, bucketNew(sid, chat));
    if (chatBuckets.size > 24) chatBuckets.delete(chatBuckets.keys().next().value);
  }
  // A finished reply: 'done' fixes the session the next reply resumes (a session that changed under this reply keeps
  // only what this reply sent); an error / stop forgets the chat (what the engine kept is unknown).
  function endTurn(event, chat) {
    const B = chat && chatBuckets.get(chat.id);
    if (!B) return;
    const sid = chat.session?.id || null;
    if (event?.type !== 'done' || !sid) { chatBuckets.delete(chat.id); return; }
    if (B.session && B.session !== sid) forgetBefore(B, B.turn);
    B.session = sid; B.chat = chat;
  }
  // The bucket of a call: its chat's (backstage routes carry it, on-screen calls get ctx.chatId), a crew helper's own.
  function bucketOf(d, ctx) {
    if (d?.route?.crew) {
      const k = d.route.chatId;
      if (!crewBuckets.has(k)) { crewBuckets.set(k, bucketNew()); if (crewBuckets.size > 12) crewBuckets.delete(crewBuckets.keys().next().value); }
      return crewBuckets.get(k);
    }
    const id = d?.route?.chatId || ctx?.chatId || null;
    const B = id ? chatBuckets.get(id) : null;
    if (!B) return loose;
    // the chat's session was dropped after the message went (a handover to the other engine, a compact): only what
    // this reply sent counts
    if (B.session && (B.chat?.session?.id || null) !== B.session) { forgetBefore(B, B.turn); B.session = null; }
    return B;
  }
  // (round 49, directorfrugal) Text the tool server answers by itself (a help topic) that this chat's session already
  // has: the server asks here first (three_seen, bridge.js; key + a hash of the text) and sends one "same as before"
  // line instead of the topic again. Same memory and rules as the code it read (per chat session, KEEP_TURNS).
  function seen(args = {}, ctx = {}) {
    const B = bucketOf(null, ctx);
    const key = `said:${String(args.key || '')}`; const sig = String(args.sig ?? '');
    const e = seenOf(B, key);
    if (!args.force && e && e.text === sig) { savedNotes.help = (savedNotes.help || 0) + 1; return { ok: true, value: { ago: agoOf(B, e) } }; }
    see(B, key, sig);
    return { ok: true, value: {} };
  }
  // The scene state is said once, then only when it changed (the director has it from the first result).
  function onlyNew(v, d = null, B = bucketOf(d)) {
    for (const k of ['sketch', 'layer', 'frame', 'music', 'layers', 'note']) {
      if (v[k] === undefined) continue;
      const t = JSON.stringify(v[k]);
      if (seenOf(B, `state:${k}`)?.text === t) { delete v[k]; savedNotes.state += 1; } else see(B, `state:${k}`, t);
    }
    // (round 37) console lines: only those it hasn't had (the console keeps its last lines; each result showed them all)
    if (Array.isArray(v.console)) {
      const was = seenOf(B, 'state:console');
      const fresh = was ? newLines(JSON.parse(was.text), v.console) : v.console;
      see(B, 'state:console', JSON.stringify(v.console));
      if (fresh.length) v.console = fresh; else { delete v.console; savedNotes.state += 1; }
    }
    return v;
  }

  // ---------- settling: answer when the change is on screen ----------
  // The Lab tells us every message of its preview (tools/three.js → onBox): a layer's first new frame ('drawn') or
  // its error. The Lab's director waits (after a run) end at the first of them + a short grace for console lines,
  // so a change answers in ≈ its build time instead of a fixed 2.5 s. Nothing drawn: the full wait, as before.
  const GRACE = 220;
  const waiters = new Set();
  function onBox(m) { if (m && (m.type === 'drawn' || m.type === 'error' || m.type === 'ran')) for (const w of [...waiters]) w(m); }
  const mark = (k) => { if (typeof HubBridge !== 'undefined') HubBridge.mark?.(k); }; // (round 74, labcalls74) hop steps
  function settle(ms) {
    return new Promise((resolve) => {
      let grace = 0; let drew = false;
      const done = () => { waiters.delete(w); clearTimeout(cap); clearTimeout(grace); mark(drew ? 'page:grace' : 'page:wait'); resolve(); };
      // 'ran' (the code loaded) without a first frame soon after: answer anyway (a layer that draws nothing new)
      const w = (m) => { if (m.type === 'ran') { if (!drew) { mark('page:ran'); clearTimeout(grace); grace = setTimeout(done, 900); } return; } if (!drew) mark('page:drawn'); drew = true; clearTimeout(grace); grace = setTimeout(done, GRACE); };
      const cap = setTimeout(done, Math.max(0, ms));
      waiters.add(w);
    });
  }
  if (typeof Native !== 'undefined') {
    Native.hooks.send.push((agentId, chat) => { if (H.agent(agentId)?.threeTools) newTurn(chat?.id ?? null, chat); });
    Native.hooks.event.push((event, chat) => { try { endTurn(event, chat); } catch { /* not a director chat */ } });
  }
  // 24x24 grey thumbnail of a canvas, to tell "nothing visibly changed" without sending the picture again
  function signature(c) {
    const t = document.createElement('canvas'); t.width = 24; t.height = 24;
    const g = t.getContext('2d', { willReadFrequently: true }); g.drawImage(c, 0, 0, 24, 24);
    const px = g.getImageData(0, 0, 24, 24).data; const out = new Uint8Array(576);
    for (let i = 0; i < 576; i += 1) out[i] = (px[i * 4] * 0.3 + px[i * 4 + 1] * 0.59 + px[i * 4 + 2] * 0.11) | 0;
    return out;
  }
  const sigDiff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 1) s += Math.abs(a[i] - b[i]); return s / a.length / 255; };
  // at: seconds, or 'drop' / 'kick' / 'snare' / 'hit' (the next one after the playhead) / a cue's name
  function resolveAt(d, at) {
    if (at == null || at === '') return null;
    if (Number.isFinite(Number(at))) return Number(at);
    const info = d.media.info();
    if (!info.loaded) return null;
    const name = String(at).toLowerCase();
    const after = (list) => (list || []).find((t) => t > (info.time || 0) + 0.05) ?? (list || [])[0] ?? null;
    if (name === 'drop') return after(info.drops);
    if (info.hits?.[name]) return after(info.hits[name].first);
    try { const cue = (d.timeline().cues || []).find((c) => String(c.name || '').toLowerCase() === name); if (cue) return cue.time ?? cue.t ?? null; } catch { /* no timeline */ }
    return null;
  }

  // ---------- pictures ----------
  // medium was 1024 px (≈ 790 image tokens for 16:9); 768 px reads the same for judging a look (≈ 440).
  // (round 37, directorlean) small (512 px, ≈ 200 tokens) is the default: colour, layout and motion read fine there,
  // and every picture stays in the session's history (re-read with every later step). medium / large / a region crop
  // for detail. A later picture in the same reply that names no size is a thumbnail (384 px, ≈ 110).
  const SIZES = { small: 512, medium: 768, large: 1280 };
  const LATER_PX = 384;
  const SHOT_Q = 0.72;
  let prevShot = null; // the last picture the director got (canvas), for compare
  const loadImg = async (url) => { const img = new Image(); img.src = url; await img.decode(); return img; };
  // region [x, y, w, h] in 0..1 of the frame, then scaled to fit `max` px; returns a canvas.
  function frameCanvas(img, { max = 1024, region = null } = {}) {
    let [sx, sy, sw, sh] = [0, 0, img.width, img.height];
    if (Array.isArray(region) && region.length === 4) {
      const [x, y, w, h] = region.map((v) => Math.max(0, Math.min(1, Number(v) || 0)));
      if (w > 0.01 && h > 0.01) { sx = Math.round(x * img.width); sy = Math.round(y * img.height); sw = Math.max(8, Math.round(Math.min(w, 1 - x) * img.width)); sh = Math.max(8, Math.round(Math.min(h, 1 - y) * img.height)); }
    }
    const scale = Math.min(1, max / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(sw * scale)); c.height = Math.max(1, Math.round(sh * scale));
    c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return c;
  }
  // Tiles canvases in a row (or a grid past 4) with small labels; the whole sheet fits `max`.
  function tile(canvases, labels, max) {
    const cols = Math.min(4, canvases.length); const rows = Math.ceil(canvases.length / cols);
    const cw = Math.max(...canvases.map((c) => c.width)); const ch = Math.max(...canvases.map((c) => c.height));
    const scale = Math.min(1, max / Math.max(cw * cols, ch * rows));
    const w = Math.round(cw * scale); const h = Math.round(ch * scale);
    const out = document.createElement('canvas');
    out.width = w * cols + (cols - 1) * 4; out.height = h * rows + (rows - 1) * 4;
    const g = out.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, out.width, out.height);
    canvases.forEach((c, i) => {
      const x = (i % cols) * (w + 4); const y = Math.floor(i / cols) * (h + 4);
      g.drawImage(c, x, y, w, h);
      if (labels[i]) { g.font = '600 13px system-ui, sans-serif'; const tw = g.measureText(labels[i]).width; g.fillStyle = '#000a'; g.fillRect(x + 4, y + 4, tw + 10, 20); g.fillStyle = '#ffd75e'; g.fillText(labels[i], x + 9, y + 19); }
    });
    return out;
  }
  // encoded by the browser off the window's thread (ui.js canvasDataUrl) when it can
  const jpeg = async (c, q = 0.8) => (typeof canvasDataUrl === 'function' ? await canvasDataUrl(c, 'image/jpeg', q) : c.toDataURL('image/jpeg', q)).split(',')[1];
  // The preview's picture at most `max` px on its long side: made small by the preview itself (a JPEG, no full-size
  // PNG to encode, pass over and shrink here) when the Lab offers it; region crops need the full picture.
  async function grab(d, max, region) {
    const t = performance.now();
    if (!region && d.shotSmall) {
      // the first picture back can be a Lab thumbnail's (360 px) that was already on its way: ask again if it's short
      for (let i = 0; i < 2; i += 1) {
        const url = await d.shotSmall(max);
        if (!url) break;
        const im = await loadImg(url).catch(() => null);
        if (im && i === 0 && max > 400 && Math.max(im.width, im.height) <= 362) continue;
        shotStat('small', t); return url;
      }
    }
    const url = await d.shot();
    shotStat('full', t);
    return url;
  }
  // how pictures were made (saved().shots: small = by the preview, full = the full-size PNG), with their time
  const shotStat = (k, t) => { const x = (savedNotes.pics[k] ||= { n: 0, ms: 0 }); x.n += 1; x.ms += Math.round(performance.now() - t); };
  // A small picture for edit results (≈ 100–200 image tokens).
  async function thumb(d, max = 384) {
    const url = await grab(d, max);
    if (!url) return null;
    return jpeg(frameCanvas(await loadImg(url), { max }), 0.75);
  }
  // (round 49, directorfrugal) A change that shows answers with its own small picture (384 px, ≈ 110 tokens), so the
  // director doesn't spend a whole step (the fixed part re-sent + a 512 px screenshot) to look. Only when it shows:
  // not when the result has errors, not when the picture didn't visibly change since the last one this reply had
  // (a short note says so instead), not in a batch that takes its own screenshot (bridge.js passes ctx.batch).
  // shot: true always sends one, shot: false never; /director-autoshot off (the AI setup row) = only when asked.
  const AUTO_KEY = (d) => JSON.stringify([null, null, d?.route?.crew ? d.route.chatId : 0]); // = a plain screenshot's view
  async function autoShot(d, args, B, ctx, value) {
    mark('handler');
    const images = await autoShot0(d, args, B, ctx, value);
    mark(images ? 'picture' : 'picture:none');
    // "errors: none" is said after the picture: an error that came in meanwhile (a slow module load) is reported
    // instead, without the picture of a broken layer
    if (value?.errors === 'none') {
      let rep = null; try { rep = d.report(); } catch { /* backstage without a report */ }
      if (rep?.errors?.length) {
        delete value.errors; delete value.picture; withErrorLines(d, value, rep);
        if (images) { B.lastSig = null; B.pics = Math.max(0, B.pics - 1); }
        return null;
      }
    }
    return images;
  }
  async function autoShot0(d, args, B, ctx, value) {
    if (args.shot === false || ctx?.batch?.shot) return null;
    const on = args.shot === true || store.get('director.autoShot', true) !== false;
    if (!on || (args.shot !== true && Array.isArray(value?.errors) && value.errors.length)) return null;
    let c;
    try { const url = await grab(d, LATER_PX); if (!url) return null; c = frameCanvas(await loadImg(url), { max: LATER_PX }); } catch { return null; }
    const sig = signature(c); const key = AUTO_KEY(d);
    if (args.shot !== true && B.lastSig?.key === key && sigDiff(sig, B.lastSig.sig) < 0.004) { if (value && typeof value === 'object') value.picture = 'no visible change'; savedNotes.shots += 1; return null; }
    B.lastSig = { key, sig }; prevShot = c; B.pics += 1; savedNotes.autoShots = (savedNotes.autoShots || 0) + 1;
    return [{ data: await jpeg(c, 0.75), mime: 'image/jpeg' }];
  }
  const withPic = (value, images) => ({ ok: true, value, ...(images ? { images } : {}) });
  async function screenshot(d, args, B = bucketOf(d)) {
    const asked = Boolean(args.size || args.region || args.compare || Number(args.frames) >= 2 || args.force);
    const later = !asked && B.pics > 0;
    const max = later ? LATER_PX : SIZES[args.size] || SIZES[store.get('director.shotSize', 'small')] || SIZES.small; // /director-shot-size
    const at = resolveAt(d, args.at);
    if (args.at != null && at == null) return { ok: false, error: `Can't go to "${args.at}": give seconds, drop, kick, snare, hit or a cue name (and load a song).` };
    if (at != null && d.media.loaded) { d.media.seek(at); await sleep(450); }
    const n = Math.max(0, Math.min(8, Math.round(Number(args.frames) || 0)));
    if (n >= 2) {
      const gap = Math.max(0.1, Math.min(5, Number(args.gap) || 0.5));
      const shots = []; const labels = [];
      const t0 = d.media.loaded ? d.media.info().time : null;
      for (let i = 0; i < n; i += 1) {
        const url = await grab(d, max, args.region);
        if (url) { shots.push(frameCanvas(await loadImg(url), { max, region: args.region })); labels.push(t0 != null ? `${i + 1} · ${(d.media.info().time || 0).toFixed(2)} s` : `${i + 1} · +${(i * gap).toFixed(1)} s`); }
        if (i < n - 1) await sleep(gap * 1000);
      }
      if (!shots.length) return { ok: false, error: 'No image: the sketch is not rendering (check three_console).' };
      const sheet = tile(shots, labels, Math.min(1600, Math.round(max * 1.5)));
      prevShot = shots.at(-1);
      B.pics += 1;
      return { ok: true, images: [{ data: await jpeg(sheet, SHOT_Q), mime: 'image/jpeg' }], value: `${shots.length} frames of "${d.codeOf().sketch}" ${gap} s apart, left to right${shots.length > 4 ? ', then the next row' : ''} (${sheet.width}×${sheet.height}).` };
    }
    const url = await grab(d, max, args.region);
    if (!url) return { ok: false, error: 'No image: the sketch is not rendering (check three_console for errors).' };
    const img = await loadImg(url);
    const c = frameCanvas(img, { max, region: args.region });
    // the same view as a picture sent earlier in this reply, nothing visibly changed: say so instead of sending it again
    // (a later thumbnail of an unchanged view too; a size asked for by name is its own view)
    const sigKey = JSON.stringify([args.size || null, args.region || null, d.route?.crew ? d.route.chatId : 0]);
    const sig = signature(c);
    if (!args.force && !args.compare && B.lastSig?.key === sigKey && sigDiff(sig, B.lastSig.sig) < 0.004) {
      savedNotes.shots += 1;
      return { ok: true, value: 'No visible change since your previous picture in this reply (same picture, not sent again; force: true sends it).' };
    }
    B.lastSig = { key: sigKey, sig };
    let out = c; let note = '';
    if (args.compare && prevShot) { out = tile([prevShot, c], ['before', 'now'], Math.min(1600, max * 2)); note = ' Left: the previous screenshot, right: now.'; } else if (args.compare) note = ' (No earlier screenshot to compare with yet.)';
    if (later) note += ' A later picture in this reply: small; size: small|medium for detail.';
    prevShot = c;
    B.pics += 1;
    // the preview's own small JPEG at the right size goes out as it is (no second encode)
    const asIs = out === c && !args.region && /^data:image\/jpeg/.test(url) && img.width === c.width && img.height === c.height;
    const data = asIs ? url.split(',')[1] : await jpeg(out, SHOT_Q);
    const f = onlyNew({ frame: frameLine(d.report().frame) }, d, B).frame;
    return { ok: true, images: [{ data, mime: 'image/jpeg' }], value: `Screenshot (${out.width}×${out.height}${f ? `, frame ${f}` : ''}${args.region ? ', cropped' : ''}).${note}` };
  }

  // ---------- reading / searching code ----------
  const pad = (n, w) => String(n).padStart(w);
  // (round 37, directorlean) A layer's code the director already has (it read the whole layer, or wrote it with
  // add_layer / set_code / update_layer, or edited a copy it had) is "known": the same text again is one line, a few
  // changed lines (the owner's slider save, a hand edit) are sent as a diff of the known copy.
  const codeKey = (L) => `code:${L.sketchId}:${L.id}`;
  // The changed lines of `known` → `now` as hunks, or null when there are too many for a diff to be the cheaper read
  // (over 40 changed lines, or over half the layer).
  function codeDiff(known, now) {
    if (known === now) return null;
    const n = diffOps(known, now).filter(([t]) => t !== ' ').length;
    if (!n || n > 40 || n > now.split('\n').length * 0.5) return null;
    return diff(known, now, { max: 40 });
  }
  // A big layer's outline: functions, classes, top-level names, section comments, tweak() and renderer / scene calls,
  // with line numbers (the same marks as the Lab's own outline), to read in parts.
  const OUTLINE_AT = 160; // get_code sends a layer whole up to this many lines (was 350)
  const MARK = /^\s{0,2}(export\s+)?(async\s+)?function\s+\w+|^\s{0,2}class\s+\w+|^\s{0,2}(const|let|var)\s+\w+\s*=\s*(tweak\(|new |\(|async|function|\[|\{)|^\s*\/\/\s*[-=#*]{2,}|^\s*\/\/\s*[A-Z][A-Z ]{3,}|^import |^\s*(renderer|scene|camera)\.\w+\s*\(/;
  function outline(code, max = 160) {
    const marks = [];
    code.split('\n').forEach((ln, k) => { if (MARK.test(ln)) marks.push(`${pad(k + 1, 4)}| ${ln.trim().slice(0, 110)}`); });
    return marks.length > max ? `${marks.slice(0, max).join('\n')}\n… ${marks.length - max} more` : marks.join('\n');
  }
  const NODES_LINE = /^(\s*\/\/ @nodes:v1 )\{.{200,}\}$/;
  function readCode(d, args, B = bucketOf(d)) {
    const L = d.codeOf(args.layer || null);
    const lines = L.code.split('\n');
    let a = Math.max(1, Math.floor(Number(args.from) || 1));
    let b = args.to != null ? Math.floor(Number(args.to)) : a + 249;
    if (args.around != null) { const c = Math.floor(Number(args.around)); a = Math.max(1, c - 20); b = c + 20; }
    b = Math.min(lines.length, b);
    const w = String(b).length;
    // a node-built layer's graph is one long JSON comment line (often most of the layer's bytes): three_nodes edits it
    const body = lines.slice(a - 1, b).map((ln, k) => `${pad(a + k, w)}| ${ln.replace(/\s+$/, '').replace(NODES_LINE, '$1{…} (the node graph: change it with three_nodes)')}`).join('\n');
    const head = `── ${L.name} · lines ${a}–${b} of ${lines.length}${b < lines.length ? ` (more: from ${b + 1})` : ''}`;
    const whole = a === 1 && b >= lines.length;
    const rk = `read:${L.sketchId}:${L.id}:${a}-${b}`;
    if (!args.force) {
      const k = seenOf(B, codeKey(L));
      const r = seenOf(B, rk);
      const same = k?.text === L.code ? k : r?.text === body ? r : null;
      if (same) { savedNotes.reads += 1; return `${head}: unchanged since you ${same.how === 'wrote' ? 'wrote' : 'read'} ${whole ? 'it' : 'them'} ${agoOf(B, same)} (force: true re-sends).`; }
      const dd = whole && k ? codeDiff(k.text, L.code) : null;
      if (dd) { savedNotes.code += 1; see(B, codeKey(L), L.code); return `${head}: changed since you ${k.how === 'wrote' ? 'wrote' : 'read'} it ${agoOf(B, k)}; only the changed lines (new line numbers; force: true sends all of it):\n${dd}`; }
    }
    see(B, rk, body);
    if (whole) see(B, codeKey(L), L.code);
    return `${head}\n${body}`;
  }
  // ---------- the scene outline (get_code, select_layer, layers) ----------
  // One line per layer, bottom first: "2. Sparkles* · 70 lines · sliders: Size, Glow · plays 30–60 s · keys: opacity 0s=0, 2s=1"
  function layerLine(L, i, { lines = null, sliders = 'names', colors = '' } = {}) {
    const bits = [];
    if (L.kind) bits.push(L.kind);
    if (lines != null) bits.push(`${lines} lines`);
    if (L.visible === false) bits.push('hidden');
    if (L.opacity != null && L.opacity !== 1) bits.push(`opacity ${L.opacity}`);
    if (L.blend && L.blend !== 'normal') bits.push(L.blend);
    if (L.plays && typeof L.plays === 'object') bits.push(`plays ${L.plays.from}–${L.plays.to} s${L.plays.fadeIn ? ` fade in ${L.plays.fadeIn}` : ''}${L.plays.fadeOut ? ` fade out ${L.plays.fadeOut}` : ''}`);
    if (L.transform) bits.push(Object.entries(L.transform).map(([k, v]) => `${k} ${v}`).join(' '));
    const sl = Array.isArray(L.sliders) ? L.sliders : [];
    if (sl.length) bits.push(sliders === 'count' ? `${sl.length} slider${sl.length === 1 ? '' : 's'}` : `sliders: ${sl.join(', ')}`);
    if (L.keyframes) bits.push(`keys: ${Object.entries(L.keyframes).map(([p, ks]) => `${p} ${ks.slice(0, 6).join(', ')}${ks.length > 6 ? ` +${ks.length - 6}` : ''}`).join('; ')}`);
    if (L.placedByUser) bits.push(`placed by the owner: ${JSON.stringify(L.placedByUser)}`);
    if (colors) bits.push(`colors ${colors}`);
    return `${i + 1}. ${L.name}${L.selected ? '*' : ''}${bits.length ? ` · ${bits.join(' · ')}` : ''}`;
  }
  const layerLines = (list, opts = {}, linesOf = () => null, colorsOf = () => '') => (Array.isArray(list) ? list.map((L, i) => layerLine(L, i, { ...opts, lines: linesOf(L), colors: colorsOf(L) })).join('\n') : list);
  // (round 49, directorfrugal) the colours a layer's code sets, with their line ("#ff3cac l9"), in get_code's outline:
  // a palette change is then one edit_code over every layer (find the colour itself), with no read of each layer first
  function codeColors(code, max = 6) {
    const out = []; const had = new Set();
    String(code || '').split('\n').forEach((ln, k) => {
      if (/^\s*\/\//.test(ln)) return;
      for (const m of ln.matchAll(/(['"])#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\1|\b0x([0-9a-fA-F]{6})\b/g)) {
        const c = m[2] ? `#${m[2]}` : `0x${m[3]}`;
        if (had.has(c.toLowerCase())) continue;
        had.add(c.toLowerCase()); out.push(`${c} l${k + 1}`);
      }
    });
    return out.length > max ? `${out.slice(0, max).join(', ')} +${out.length - max}` : out.join(', ');
  }
  // Sliders when the code that declares them is in hand: their defaults are in its tweak() block, so only what the
  // code doesn't say (music links, setup-only reads) gets a line.
  function sliderNote(list) {
    if (!Array.isArray(list) || !list.length) return undefined;
    const extra = list.filter((c) => c.followsMusic || c.live === false).map(sliderLine);
    return extra.length ? [`${list.length} in the code's tweak() block; these also:`, ...extra] : `${list.length} in the code's tweak() block (three_sliders for live values)`;
  }
  const unsavedLines = (list) => (Array.isArray(list) && list.length ? list.map((u) => `${u.name}${u.line ? ` (line ${u.line})` : ''}: ${u.inCode} in the code → ${typeof u.slider === 'string' ? u.slider : JSON.stringify(u.slider)} on the slider`) : undefined);
  // get_code / select_layer: the scene as an outline (one line per layer), and only the selected layer's code: whole,
  // as an outline past OUTLINE_AT lines, "unchanged" when the director has it, or the lines that changed.
  function sceneCode(d, r, ref, B) {
    const L = d.codeOf(ref ?? null);
    const lineCount = (x) => { try { return d.codeOf(x.id).code.split('\n').length; } catch { return null; } };
    const colorsIn = (x) => { try { return codeColors(d.codeOf(x.id).code); } catch { return ''; } };
    const value = { sketch: r.sketch, layer: L.name, layers: layerLines(r.layers, { sliders: 'count' }, lineCount, colorsIn), frame: frameLine(r.frame) || undefined };
    const n = L.code.split('\n').length;
    const k = seenOf(B, codeKey(L));
    const dd = k && k.text !== L.code ? codeDiff(k.text, L.code) : null;
    let inHand = true;
    if (k && k.text === L.code) { value.code = `unchanged since you ${k.how === 'wrote' ? 'wrote' : 'read'} it ${agoOf(B, k)} (${n} lines; three_read_code force: true re-sends)`; savedNotes.code += 1; } else if (dd) { value.changes = `since you ${k.how === 'wrote' ? 'wrote' : 'read'} it ${agoOf(B, k)} (${n} lines now; three_read_code force: true sends all):\n${dd}`; savedNotes.code += 1; see(B, codeKey(L), L.code, k.how); } else if (n > OUTLINE_AT) {
      inHand = false;
      value.outline = outline(L.code.replace(/\/\/ @nodes:v1 \{.*\}[ \t]*$/m, '// @nodes:v1 {…}'));
      value.note = `${n} lines, so its outline: read parts with three_read_code (from / to), find with three_search_code, change with three_edit_code.`;
    } else {
      // the node graph's one-line JSON stays out (tools/three-nodes.js: three_nodes changes it)
      value.code = L.code.replace(/\/\/ @nodes:v1 \{.*\}[ \t]*$/m, '// @nodes:v1 {…} (the node graph this layer is made from: change it with three_nodes)');
      see(B, codeKey(L), L.code);
    }
    value.sliders = inHand ? sliderNote(r.sliders) : sliderLines(r.sliders);
    value.unsavedSliders = unsavedLines(r.unsavedSliders);
    // (the Lab's own note is about unsaved sliders, said here; backstage's says the scene isn't on screen)
    const notes = [value.note, value.unsavedSliders ? 'The owner moved these sliders without saving: keep their values when you change the code.' : null, r.unsavedSliders?.length ? null : r.note];
    value.note = notes.filter(Boolean).join(' ') || undefined;
    const st = onlyNew({ sketch: value.sketch, frame: value.frame, note: value.note }, d, B); // said once (the layer and its code always)
    for (const k of ['sketch', 'frame', 'note']) value[k] = st[k];
    return value;
  }
  // the transport after play / pause / seek / loop: one line (it was the whole song analysis, ≈ 800 tokens)
  function mediaLine(info) {
    if (!info || typeof info !== 'object') return info;
    const t = (x) => (Math.round((Number(x) || 0) * 10) / 10).toFixed(1);
    if (!info.loaded && info.sceneTimeline) { const s = info.sceneTimeline; return `scene timeline ${s.playing ? 'playing' : 'paused'} at ${t(s.time)} / ${t(s.seconds)} s (frame ${s.frame})`; }
    if (!info.loaded) return info.note || 'No music loaded.';
    const lp = info.loop && typeof info.loop === 'object' ? ` · loop ${t(info.loop.start)}–${t(info.loop.end)} s${info.loop.locked ? ' (locked)' : ''}${info.loop.on === false ? ' (off)' : ''}` : info.loop === 'whole song' ? ' · looping the song' : '';
    return `${String(info.file || '').split(/[\\/]/).pop()} ${info.playing ? 'playing' : 'paused'} at ${t(info.time)} / ${t(info.duration)} s${lp} (three_do media_info: grid, sections, hits)`;
  }
  function searchCode(d, args) {
    const pattern = String(args.pattern || '');
    if (!pattern) throw new Error('Give a pattern.');
    let re;
    try { re = new RegExp(args.regex ? pattern : pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); } catch (err) { throw new Error(`Bad pattern: ${err.message}`); }
    const ctx = Math.min(5, Math.max(0, Number(args.context ?? 1)));
    const max = Math.min(200, Math.max(1, Number(args.max) || 40));
    const layers = args.layer ? [d.codeOf(args.layer)] : d.layers().layers.map((x) => d.codeOf(x.id));
    const blocks = []; let total = 0; let shown = 0; let inLayers = 0;
    for (const L of layers) {
      const lines = L.code.split('\n');
      const hits = []; lines.forEach((ln, k) => { if (re.test(ln)) hits.push(k); });
      if (!hits.length) continue;
      total += hits.length; inLayers += 1;
      // merge overlapping windows so shared context prints once
      const wins = [];
      for (const k of hits) {
        if (shown >= max) break;
        shown += 1;
        const [a, b] = [Math.max(0, k - ctx), Math.min(lines.length - 1, k + ctx)];
        const last = wins.at(-1);
        if (last && a <= last.b + 1) { last.b = Math.max(last.b, b); last.hits.add(k); } else wins.push({ a, b, hits: new Set([k]) });
      }
      if (!wins.length) continue;
      const w = String(wins.at(-1).b + 1).length;
      const out = [`── ${L.name}`];
      wins.forEach((win, i) => {
        if (i) out.push('  ⋮');
        // strip the window's common indentation, so deep code doesn't cost a wall of spaces
        const seg = lines.slice(win.a, win.b + 1);
        const ind = Math.min(...seg.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
        seg.forEach((ln, j) => out.push(`${pad(win.a + j + 1, w)}${win.hits.has(win.a + j) ? '>' : ' '} ${clip(ln.slice(Number.isFinite(ind) ? ind : 0).replace(/\s+$/, ''), 160)}`));
      });
      blocks.push(out.join('\n'));
    }
    if (!total) return `No match for “${pattern}” in ${args.layer ? `"${layers[0].name}"` : `${layers.length} layer${layers.length === 1 ? '' : 's'}`}.`;
    return `${total} match${total === 1 ? '' : 'es'} in ${inLayers} layer${inLayers === 1 ? '' : 's'} for “${pattern}”${shown < total ? ` (first ${shown}; pass max for more)` : ''}:\n${blocks.join('\n')}`;
  }

  // A rewrite of a layer that was really in use: it had sliders and wasn't a Lab starter, and the new code is a
  // different piece (not the same code with changes).
  function rewroteReal(before, after) {
    if (!/\btweak\s*\(/.test(before) || before.split('\n').length < 12) return false;
    if (typeof ThreeData !== 'undefined' && (ThreeData.TEMPLATES || []).some((t) => t.code === before)) return false;
    const a = new Set(before.split('\n').map((l) => l.trim()).filter((l) => l.length > 8));
    const b = after.split('\n').map((l) => l.trim()).filter((l) => l.length > 8);
    return b.filter((l) => a.has(l)).length < b.length * 0.5;
  }

  // ---------- the handler ----------
  const consoleTail = (d) => d.report().console || [];
  // Errors with a line number get that line of code next to them, which saves a read_code call to look.
  // One line per error: "[Rings] line 14: nope is not defined → mesh.rotation.y = nope.x;" (layer, line, message
  // and the code there), at most 4.
  function withErrorLines(d, value, r) {
    // the same error every frame is one line (×n)
    const seen = new Map();
    for (const e of r?.errors || []) { const k = `${e.layer}|${e.line}|${e.message}`; if (seen.has(k)) seen.get(k).n += 1; else seen.set(k, { e, n: 1 }); }
    const errs = [...seen.values()];
    if (!errs.length) return value;
    const hinted = new Set();
    value.errors = errs.slice(0, 4).map(({ e, n }) => {
      let code = '';
      if (e.line) { try { const t = d.codeOf(e.layer || null).code.split('\n')[e.line - 1]; if (t != null) code = ` → ${clip(t.trim(), 120)}`; } catch { /* layer gone */ } }
      const msg = String(e.message || '').split('\n')[0].replace(/^Uncaught /, '');
      // (round 49, directorfrugal) the usual fix, once per kind: saves a help lookup or a guess
      const h = errHint(msg);
      const hint = h && !hinted.has(h) ? (hinted.add(h), ` (fix: ${h})`) : '';
      return `${e.layer ? `[${e.layer}] ` : ''}${e.line ? `line ${e.line}: ` : ''}${clip(msg, 200)}${n > 1 ? ` (×${n})` : ''}${code}${hint}`;
    });
    if (errs.length > 4) value.errors.push(`… ${errs.length - 4} more (three_console)`);
    // (round 49) the lines around the first error, so the fix needs no read_code call first
    const first = errs.find(({ e }) => e.line)?.e;
    if (first) { try { const near = errorContext(d.codeOf(first.layer || null).code, first.line); if (near) value.near = near; } catch { /* layer gone */ } }
    return value;
  }
  // (round 49, directorfrugal) the common three.js / JS errors and their usual fix, in a few words
  const HINTS = [
    [/\bTHREE is not defined/, "add import * as THREE from 'three'"],
    [/\b(\w+) is not defined/, (m) => `declare ${m[1]} first, or import it (addons: 'three/addons/…')`],
    [/Cannot read properties of (undefined|null) \(reading '([^']+)'\)/, (m) => `what comes before .${m[2]} is ${m[1]} there: create it before use, or guard with ?.`],
    [/Cannot set properties of (undefined|null)/, (m) => `the object is ${m[1]} there: create it before use`],
    [/(\S+) is not a constructor/, (m) => `${m[1].replace(/^THREE\./, '')} isn't in core three: import it from 'three/addons/…' (or check its name)`],
    [/(\S+) is not a function/, (m) => `${m[1]} isn't a function here: check its name (three renames some APIs) or what it's called on (three_eval shows it)`],
    [/has already been declared/, 'the same name is declared twice: rename or remove one'],
    [/Assignment to constant variable/, 'a const is reassigned: make it let'],
    [/Failed to resolve module specifier|dynamically imported module|Cannot use import statement/, "imports come from 'three' or 'three/addons/…' only"],
    [/Unexpected (token|end of input|identifier|string)|missing \) after|Invalid or unexpected token|SyntaxError/, 'a bracket, comma or quote is off near that line'],
    [/Maximum call stack/, 'a function calls itself without end'],
    [/ERROR: \d+:\d+|shader|GLSL|compile/i, 'the GLSL line it names (help shader)'],
    [/CONTEXT_LOST|out of memory|Array buffer allocation/i, 'too heavy: fewer objects, smaller textures, dispose old ones'],
  ];
  function errHint(msg) {
    for (const [re, h] of HINTS) { const m = re.exec(msg); if (m) return typeof h === 'function' ? h(m) : h; }
    return '';
  }
  // ±2 numbered lines around an error's line ("41>" marks it), indentation trimmed
  function errorContext(code, line, k = 2) {
    const lines = code.split('\n');
    if (!(line >= 1 && line <= lines.length)) return '';
    const a = Math.max(1, line - k); const b = Math.min(lines.length, line + k);
    const seg = lines.slice(a - 1, b);
    const ind = Math.min(...seg.filter((l) => l.trim()).map((l) => l.match(/^\s*/)[0].length));
    const w = String(b).length;
    return seg.map((ln, j) => `${pad(a + j, w)}${a + j === line ? '>' : '|'} ${clip(ln.slice(Number.isFinite(ind) ? ind : 0).replace(/\s+$/, ''), 140)}`).join('\n');
  }
  // a code-changing result with no errors says so in two words (no separate console call to check)
  const clean = (value) => { if (value && typeof value === 'object' && !value.errors?.length && !value.reverted) value.errors = 'none'; return value; };
  // Lines added since `before` (the console keeps the last 30; a layer's re-run drops its old lines).
  function newLines(before, after) {
    for (let k = Math.min(before.length, after.length); k > 0; k -= 1) {
      const tail = before.slice(-k);
      for (let i = 0; i + k <= after.length; i += 1) if (after.slice(i, i + k).every((x, j) => x === tail[j])) return after.slice(i + k);
    }
    return after;
  }

  // ctx.chatId: the chat whose run made the call (tools/three.js passes it; backstage routes carry it in d.route)
  async function handle(tool, args, d, ctx = {}) {
    if (!d.codeOf) return null; // an older Lab without the hooks: its own handler answers
    const B = bucketOf(d, ctx);
    if (tool === 'three_edit_code') {
      const edits = Array.isArray(args.edits) ? args.edits : [];
      if (!edits.length) return { ok: false, error: 'No edits given.' };
      // group by layer (an edit's own layer, else the call's), keeping their order
      const groups = new Map();
      for (const e of edits) {
        const L = d.codeOf(e.layer ?? args.layer ?? null);
        if (!groups.has(L.id)) groups.set(L.id, { L, list: [] });
        groups.get(L.id).list.push(e);
      }
      const plans = [...groups.values()].map(({ L, list }) => ({ L, ...applyEdits(L.code, list, L.name) })); // throws before anything changes
      const keysOf = (id) => { try { return d.sliders(id, null).sliders.map((c) => c.key); } catch { return []; } };
      const sliderKeysBefore = new Map(plans.map((p) => [p.L.id, keysOf(p.L.id)]));
      const results = [];
      const t0 = performance.now();
      for (const [i, p] of plans.entries()) {
        const last = i === plans.length - 1;
        // sketchId: a batch never continues into another scene if the one on screen changes mid-way (chat-scenes.js)
        // (the wait is a cap now: the Lab answers at the layer's first new frame, see settle)
        const r = await d.updateLayer(p.L.id, { code: p.code, sketchId: p.L.sketchId }, last ? Math.min(15, Math.max(0.5, Number(args.wait) || 2.5)) : 0.4);
        record({ sketchId: p.L.sketchId, sketch: p.L.sketch, layerId: p.L.id, layer: p.L.name, before: p.L.code, after: p.code, tool });
        // the director had this layer and wrote these edits: it has the result too (later reads say "unchanged")
        const k = seenOf(B, codeKey(p.L));
        if (k?.text === p.L.code) see(B, codeKey(p.L), p.code, 'wrote');
        results.push({ p, r });
      }
      const final = results.at(-1).r;
      savedNotes.waitMs += Math.max(0, 2500 - Math.round(performance.now() - t0));
      // safe: true — an edit that broke one of its layers is put back at once (the director reads why, nothing stays broken)
      const names = new Set(plans.map((p) => p.L.name));
      const broke = (final.errors || []).filter((e) => !e.layer || names.has(e.layer));
      if (args.safe && broke.length) {
        const why = withErrorLines(d, {}, { errors: broke }).errors;
        for (const p of [...plans].reverse()) {
          await d.updateLayer(p.L.id, { code: p.L.code, sketchId: p.L.sketchId }, 0.6);
          const k = history.findLastIndex((h) => h.layerId === p.L.id && h.after === p.code);
          if (k >= 0) history.splice(k, 1);
          if (seenOf(B, codeKey(p.L))?.text === p.code) see(B, codeKey(p.L), p.L.code, 'wrote');
        }
        changed();
        return { ok: true, value: { reverted: `The edit broke ${[...names].map((n) => `"${n}"`).join(', ')}, so it was undone (the code is as before).`, errors: why } };
      }
      if (args.report === 'full') return { ok: true, value: { edits: results.map(({ p }) => ({ layer: p.L.name, edits: p.done, lines: p.code.split('\n').length })), ...final } };
      const value = { ...compact(final, { lines: 8 }) };
      delete value.updated;
      // where each edit landed (the director knows what it wrote); diff: true for the lines themselves
      value.changed = results.map(({ p }) => `${p.L.name}: ${landed(p.L.code, p.code)} → ${p.code.split('\n').length} lines`).join('; ');
      if (args.diff) value.diff = results.map(({ p }) => `${plans.length > 1 ? `── ${p.L.name}\n` : ''}${diff(p.L.code, p.code)}`).join('\n');
      // sliders the edit added or removed, so there's no need to re-read them
      const delta = plans.flatMap((p) => { const was = sliderKeysBefore.get(p.L.id) || []; const now = keysOf(p.L.id); return [...now.filter((k) => !was.includes(k)).map((k) => `+${k}`), ...was.filter((k) => !now.includes(k)).map((k) => `-${k}`)]; });
      if (delta.length) value.slidersChanged = delta.join(' ');
      delete value.sliders;
      clean(withErrorLines(d, value, final));
      onlyNew(value, d, B);
      return withPic(value, await autoShot(d, args, B, ctx, value)); // (round 49) a small picture when it shows
    }
    if (tool === 'three_set_code') {
      if (!String(args.code || '').trim()) return { ok: false, error: 'No code given.' };
      const before = d.codeOf();
      if (!d.backstage) toast('Three Director updated the sketch', { timeout: 1500 });
      const r = await d.setCode(String(args.code), Number(args.wait) || 2.5);
      record({ sketchId: before.sketchId, sketch: before.sketch, layerId: before.id, layer: before.name, before: before.code, after: String(args.code), tool });
      see(B, codeKey(before), String(args.code), 'wrote');
      const value = args.report === 'full' ? r : onlyNew(clean(namesOff(withErrorLines(d, compact(r), r))), d, B);
      // the owner's rule: a new effect is a new layer. Rewriting a real layer (one with sliders, not a starter) gets a
      // one-line reminder, so the habit holds for the rest of the chat (≈ 30 tokens, only then).
      if (args.report !== 'full' && rewroteReal(before.code, String(args.code))) value.note = `Rewrote "${before.name}" (/undo-edit restores it). New elements or effects go in a new layer: three_add_layer.`;
      // (round 35, concise.js) a small change sent as a whole layer: one line on what edits would have cost (only then)
      else if (args.report !== 'full' && window.Concise?.rewriteNote) { const n = Concise.rewriteNote(before.code, String(args.code)); if (n) value.note = n; }
      return args.report === 'full' ? { ok: true, value } : withPic(value, await autoShot(d, args, B, ctx, value));
    }
    if (tool === 'three_add_layer') {
      if (!args.code && !args.template) return { ok: false, error: 'Give complete code (alpha: true, no background) or a template.' };
      if (!d.backstage) toast(`Three Director added a layer${args.name ? ` "${args.name}"` : ''}`, { timeout: 1500 });
      const r = await d.addLayer({ name: args.name, code: args.code, template: args.template, position: args.position, props: args.settings || {} }, Number(args.wait) || 2.5);
      if (args.report === 'full') return { ok: true, value: r };
      const value = clean(withErrorLines(d, compact(r), r));
      if (args.code) {
        namesOff(value);
        // (round 37) the director wrote this code: it has its sliders (only their names stay) and its text
        try { const L = d.codeOf(r.added || 'top'); if (L.code === String(args.code)) see(B, codeKey(L), L.code, 'wrote'); } catch { /* gone already */ }
      } else {
        // a template's sliders as lines (keys, values, ranges): the next call is usually a slider move, not a read
        try { const sl = d.sliders(r.added || null, null); if (sl?.sliders?.length) value.sliders = sliderLines(sl.sliders); } catch { /* backstage: names only */ }
      }
      onlyNew(value, d, B);
      return withPic(value, await autoShot(d, args, B, ctx, value));
    }
    if (tool === 'three_update_layer') {
      const patch = { ...(args.settings || {}) };
      let before = null;
      if (args.code != null) { patch.code = args.code; before = d.codeOf(args.layer); }
      if (args.order != null) patch.order = args.order;
      const r = await d.updateLayer(args.layer, patch, Number(args.wait) || (args.code != null ? 2.5 : 0.5));
      if (before) { record({ sketchId: before.sketchId, sketch: before.sketch, layerId: before.id, layer: before.name, before: before.code, after: String(args.code), tool }); see(B, codeKey(before), String(args.code), 'wrote'); }
      if (args.report === 'full') return { ok: true, value: r };
      const value = onlyNew(namesOff(withErrorLines(d, compact(r), r)), d, B);
      if (before) clean(value);
      return withPic(value, await autoShot(d, args, B, ctx, value));
    }
    // the frame size: one line (it was the whole Lab report after a fixed 1.5 s). fit ⇄ an exact size reloads the
    // preview (answer at its first frame); between exact sizes it only resizes.
    if (tool === 'three_set_frame' && d.setFrame && !d.backstage) {
      const ids = typeof ThreeMedia !== 'undefined' ? ThreeMedia.SIZES.map((x) => x.id) : null;
      if (ids && !ids.includes(args.size)) return { ok: false, error: `size must be one of ${ids.join(', ')}` };
      const was = d.report().frame;
      const reload = (was?.id === 'fit') !== (args.size === 'fit');
      d.setFrame(args.size);
      await settle(reload ? 3000 : 350);
      const r = d.report();
      const value = withErrorLines(d, { frame: frameLine(r.frame) }, r);
      see(B, 'state:frame', JSON.stringify(value.frame));
      return withPic(value, await autoShot(d, args, B, ctx, value));
    }
    // three_do undo: the director's last code change in this scene, back (no code re-sent)
    if (tool === 'three_undo') {
      const h = await undo(d, { force: Boolean(args.force), sketchId: (() => { try { return d.codeOf().sketchId; } catch { return null; } })() });
      B.seen.delete(codeKey({ sketchId: h.sketchId, id: h.layerId })); // its code is the "before" now: read it again if needed
      return { ok: true, value: `Undid your ${h.tool.replace(/^three_/, '')} of "${h.layer}"${h.errors ? ` (${h.errors} error${h.errors === 1 ? '' : 's'} now: three_console)` : ''}.` };
    }
    // keyframes / animation presets are the everyday way to move things (time first): a one-line result, not the
    // whole Lab report (≈ 2.8k characters before)
    if ((tool === 'three_keyframes' && d.setKeyframes) || (tool === 'three_animate' && d.applyPreset)) {
      const r = await (tool === 'three_keyframes' ? d.setKeyframes(args.layer, args.property, args.keys, args.clear) : d.applyPreset(args.layer, args.preset)); // (round 73) a backstage scene's preset reads its saved timeline first
      if (args.report === 'full') return { ok: true, value: r };
      const errs = (r.errors || []).map((e) => `${e.layer ? `[${e.layer}] ` : ''}${clip(e.message, 200)}`);
      const what = tool === 'three_keyframes' ? `${r.layer}.${r.property}: ${r.keyframes} key${r.keyframes === 1 ? '' : 's'}` : `${r.layer || args.layer}: ${args.preset}${r.keys != null ? ` (${r.keys} keys)` : ''}`;
      return { ok: true, value: { set: what, ...(errs.length ? { errors: errs } : {}), layers: (r.layers || []).map((L) => L.name).join(', ') || undefined } };
    }
    // (round 37) the scene state once (like the other results), the selected layer's slider names left out (three_sliders)
    if (tool === 'three_console') {
      if (args.full) return { ok: true, value: d.report() };
      // (round 49) errors as one line each with their code, the usual fix and the lines around the first (no read_code next)
      const rep = d.report();
      const value = onlyNew(namesOff(withErrorLines(d, compact(rep, { lines: 14 }), rep)), d, B);
      if (!value.console) value.console = 'no new lines since your last look';
      return { ok: true, value };
    }
    if (tool === 'three_screenshot') return screenshot(d, args, B);
    if (tool === 'three_read_code') return { ok: true, value: readCode(d, args, B) };
    if (tool === 'three_search_code') return { ok: true, value: searchCode(d, args) };
    if (tool === 'three_eval' && Number(args.samples) > 1) {
      // the same expression n times, every ms: watch a value move (does it jump on kicks?) without screenshots
      const n = Math.min(30, Math.round(Number(args.samples)));
      const every = Math.max(16, Math.min(2000, Number(args.every) || 100));
      const vals = [];
      const t0 = d.media.loaded ? d.media.info().time : null;
      for (let i = 0; i < n; i += 1) {
        const r = await d.evalInSketch(String(args.code || ''));
        if (!r.ok) return { ok: false, error: `Sample ${i + 1}: ${r.error}` };
        vals.push(typeof r.value === 'string' ? r.value : clip(JSON.stringify(r.value), 200));
        if (i < n - 1) await sleep(every);
      }
      return { ok: true, value: `${n} samples every ${every} ms${t0 != null ? ` from ${t0.toFixed(2)} s on the song` : ''}:\n${vals.join('\n')}` };
    }
    if (tool === 'three_eval') {
      const before = consoleTail(d);
      const r = await d.evalInSketch(String(args.code || ''));
      if (!r.ok) return { ok: false, error: r.error };
      const max = Math.max(200, Math.min(50000, Number(args.max) || 3000));
      let text = typeof r.value === 'string' ? r.value : JSON.stringify(r.value);
      if (text === undefined) text = 'undefined';
      if (text.length > max) text = `${text.slice(0, max)}\n… [cut: ${text.length.toLocaleString()} chars in all. Return less (pick fields, .slice(), counts) or pass max.]`;
      const printed = newLines(before, consoleTail(d)).slice(-8);
      return { ok: true, value: printed.length ? { result: text, console: printed } : text };
    }
    if (tool === 'three_sliders') {
      const r = d.sliders(args.layer, args.set || null);
      // (capturefix2) the helpers' raw answer (sliders with keys and values, changed): /model material said nothing and
      // the asset library saved a preset with no values since the lean lines (round 37)
      if (args.report === 'full') return { ok: true, value: r };
      const looks = r.looks?.length ? r.looks.map((l) => (typeof l === 'string' ? l : l.name)).join(', ') : undefined;
      const set = args.set && typeof args.set === 'object' ? Object.keys(args.set) : [];
      // (round 37) a move answers with the sliders it moved (the rest didn't change); keys it couldn't set are named
      if (set.length) {
        const moved = new Set(r.changed || []);
        const lines = (r.sliders || []).filter((c) => moved.has(c.key)).map(sliderLine);
        const missed = set.filter((k) => !(r.sliders || []).some((c) => moved.has(c.key) && (c.key === k || String(c.label || '').toLowerCase() === k.toLowerCase())));
        const value = { layer: r.layer, moved: lines.length ? lines : 'nothing', ...(missed.length ? { notSet: `${missed.join(', ')} (locked, unknown or a bad value; keys: ${(r.sliders || []).map((c) => c.key).join(', ')})` } : {}), others: `${(r.sliders || []).length - lines.length} unchanged`, looks };
        return withPic(value, lines.length ? await autoShot(d, args, B, ctx, value) : null); // (round 49) a move that shows: its small picture
      }
      // a read: the table, or one line when this session already has the same table
      const lines = sliderLines(r.sliders);
      const sk = `sliders:${(() => { try { const L = d.codeOf(args.layer || null); return `${L.sketchId}:${L.id}`; } catch { return r.layer; } })()}`;
      const k = Array.isArray(lines) && !args.force ? seenOf(B, sk) : null;
      if (k && k.text === lines.join('\n')) { savedNotes.state += 1; return { ok: true, value: { layer: r.layer, sliders: `unchanged since you read them ${agoOf(B, k)} (force: true re-sends)`, looks } }; }
      if (Array.isArray(lines)) see(B, sk, lines.join('\n'));
      return { ok: true, value: { layer: r.layer, sliders: lines, looks } };
    }
    // (round 37, directorlean) the scene as an outline + the selected layer's code (unchanged / a diff when known)
    if (tool === 'three_get_code') return { ok: true, value: sceneCode(d, d.getCode(), null, B) };
    if (tool === 'three_select_layer' && d.selectLayer) return { ok: true, value: sceneCode(d, d.selectLayer(args.layer), args.layer, B) };
    if (tool === 'three_layers' && d.layers) {
      const r = d.layers();
      // (capturefix2) Hearth's own helpers (◇ shader, ✦ particles, 🅰 type, physics, models, assets) read the rows
      // (report: 'full', as three_add_layer has): since the lean text below (round 37) their layer lookups threw
      // ("v?.layers?.find is not a function") and a layer they had just added wasn't found
      if (args.report === 'full') return { ok: true, value: r };
      const value = { sketch: r.sketch, layers: `${layerLines(r.layers)}\n(bottom first, * = selected)`, note: r.note };
      const st = onlyNew({ sketch: value.sketch, note: value.note }, d, B);
      return { ok: true, value: { ...value, ...st, sketch: st.sketch, note: st.note } };
    }
    if (tool === 'three_help') return { ok: true, value: 'Help topics are answered by the three-lab tool server (three_do { cmd: "help", topic }).' };
    return null;
  }

  // ---------- (round 37, directorlean) the Lab's own results, trimmed for the model ----------
  // tools/three.js passes what its own handlers answered (the tools handle() leaves to it) through here: pictures the
  // Lab sends whole (a play-test's full-size PNG, notes' screenshots, references, the contact sheet) are made small,
  // and play / pause / seek / loop answer with the transport in one line instead of the whole song analysis.
  const PIC_MAX = { three_input: SIZES.small, three_notes: SIZES.small, three_references: SIZES.small, three_contact_sheet: 1024 };
  async function shrinkImages(images, max) {
    const out = [];
    for (const im of images) {
      try {
        const img = await loadImg(`data:${im.mime || 'image/png'};base64,${im.data}`);
        if (Math.max(img.width, img.height) <= max && im.mime === 'image/jpeg') { out.push(im); continue; }
        out.push({ data: await jpeg(frameCanvas(img, { max }), SHOT_Q), mime: 'image/jpeg' });
      } catch { out.push(im); }
    }
    return out;
  }
  async function trim(tool, args, r) {
    if (!r || r.ok === false) return r;
    let out = r;
    if (tool === 'three_media_control' && ['play', 'pause', 'seek', 'loop', undefined].includes(args?.action) && r.value && typeof r.value === 'object' && 'loaded' in r.value) {
      const line = mediaLine(r.value);
      savedNotes.trimmed += Math.max(0, JSON.stringify(r.value).length - line.length);
      out = { ...out, value: line };
    }
    if (PIC_MAX[tool] && out.images?.length) out = { ...out, images: await shrinkImages(out.images, PIC_MAX[tool]) };
    return out;
  }

  return {
    handle, trim,
    // /undo-edit, /redo-edit, the dock's ↶ button
    // (round 73, labtools73) what an AI did in its last reply is one step (tools/three-txn.js), when it's the newest change
    undo: async (opts) => {
      if (window.LabTxn?.wantsUndo?.(history)) return LabTxn.undoTurn(opts || {});
      window.LabTxn?.noteCodeUndo?.();
      return undo(ThreeLab.director || (await ThreeLab.cmd({ show: false }), ThreeLab.director), opts);
    },
    redo: async () => (window.LabTxn?.wantsRedo?.() ? LabTxn.redoTurn() : redo(ThreeLab.director || (await ThreeLab.cmd({ show: false }), ThreeLab.director))),
    history: () => history.slice(),
    canRedo: () => redoStack.length > 0 || Boolean(window.LabTxn?.wantsRedo?.()),
    // a reply undone as a whole: its code edits leave the per-edit history too (no second undo of them)
    forget(sketchId, from, to) { let n = 0; for (let i = history.length - 1; i >= 0; i -= 1) { const h = history[i]; if (h.sketchId === sketchId && h.at >= from && h.at <= to) { history.splice(i, 1); n += 1; } } if (n) changed(); return n; },
    onHistory(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    newTurn, seen, saved: () => JSON.parse(JSON.stringify(savedNotes)),
    // (round 28, lookmatch) the small-picture path, for pictures made outside a tool call (a reference for the director)
    pictures: { frameCanvas, tile, jpeg, loadImg },
    // tools/three.js: every preview message (onBox), and its director's waits after a run (settle)
    onBox, settle,
    _test: { diff, landed, applyEdits, compact, sliderLine, newLines, statLine, signature, sigDiff, onlyNew, codeDiff, outline, layerLine, layerLines, sliderNote, unsavedLines, mediaLine, sceneCode, bucketOf, endTurn, namesOff, OUTLINE_AT, errHint, errorContext, codeColors },
  };
})();
// (round 37) loadable in Node for its unit test (dev/directorlean-test.js); the app loads it as a plain script
if (typeof module !== 'undefined' && module.exports) module.exports = ThreeDirector;
