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
  function compact(r, { lines = 8 } = {}) {
    if (!r || typeof r !== 'object') return r;
    const out = {};
    for (const k of ['added', 'updated', 'removed']) if (r[k]) out[k] = r[k];
    out.sketch = r.sketch;
    out.layer = r.layer;
    if (r.errors?.length) out.errors = r.errors.map((e) => `${e.layer ? `[${e.layer}] ` : ''}${e.line ? `line ${e.line}: ` : ''}${clip(e.message, 400)}`);
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
  // Line diff of the changed middle (common head / tail trimmed, LCS inside when small): hunks with new line numbers.
  function diff(a, b, { max = 40 } = {}) {
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
    // hunks: changed lines only, "@@ 42" headers where a new run starts
    const out = []; let lastLine = -2; let shown = 0; let hidden = 0;
    for (const [t, text, ln] of ops) {
      if (t === ' ') { lastLine = -2; continue; }
      if (shown >= max) { hidden += 1; continue; }
      if (lastLine === -2) out.push(`@@ ${ln}`);
      out.push(`${t} ${clip(text.replace(/\s+$/, ''), 160)}`);
      lastLine = ln; shown += 1;
    }
    if (hidden) out.push(`… ${hidden} more changed lines`);
    return out.length ? out.join('\n') : '(no change)';
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
  async function undo(d, { force = false } = {}) {
    const h = history.at(-1);
    if (!h) throw new Error('The director hasn\'t changed any code yet.');
    const cur = (() => { try { return forEntry(d, h).codeOf(h.layerId).code; } catch { return null; } })();
    if (cur != null && cur !== h.after && !force) throw new Error(`"${h.layer}" changed after the director's edit (you or a slider save?). /undo-edit force puts the director's "before" back anyway.`);
    const r = await restore(d, h, h.before);
    history.pop(); redoStack.push(h); changed();
    return { ...h, restored: 'before', errors: r.report?.errors?.length || 0 };
  }
  async function redo(d) {
    const h = redoStack.at(-1);
    if (!h) throw new Error('Nothing to redo.');
    const r = await restore(d, h, h.after);
    redoStack.pop(); history.push(h); changed();
    return { ...h, restored: 'after', errors: r.report?.errors?.length || 0 };
  }

  // ---------- within one reply: don't send the same thing twice ----------
  // Reset whenever the user sends a director a message (a compacted / new chat starts a new reply anyway).
  const readCache = new Map(); // "layerId:a-b" -> text it was given
  let lastSig = null; // { key, sig } of the last screenshot this reply
  const savedNotes = { reads: 0, shots: 0 };
  function newTurn() { readCache.clear(); lastSig = null; }
  if (typeof Native !== 'undefined') Native.hooks.send.push((agentId) => { if (H.agent(agentId)?.threeTools) newTurn(); });
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
  const SIZES = { small: 512, medium: 1024, large: 1280 };
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
  const jpeg = (c, q = 0.82) => c.toDataURL('image/jpeg', q).split(',')[1];
  // A small picture for edit results (≈ 100–200 image tokens).
  async function thumb(d, max = 384) {
    const url = await d.shot();
    if (!url) return null;
    return jpeg(frameCanvas(await loadImg(url), { max }), 0.75);
  }
  async function screenshot(d, args) {
    const max = SIZES[args.size] || SIZES[store.get('director.shotSize', 'medium')] || SIZES.medium; // /director-shot-size
    const at = resolveAt(d, args.at);
    if (args.at != null && at == null) return { ok: false, error: `Can't go to "${args.at}": give seconds, drop, kick, snare, hit or a cue name (and load a song).` };
    if (at != null && d.media.loaded) { d.media.seek(at); await sleep(450); }
    const n = Math.max(0, Math.min(8, Math.round(Number(args.frames) || 0)));
    if (n >= 2) {
      const gap = Math.max(0.1, Math.min(5, Number(args.gap) || 0.5));
      const shots = []; const labels = [];
      const t0 = d.media.loaded ? d.media.info().time : null;
      for (let i = 0; i < n; i += 1) {
        const url = await d.shot();
        if (url) { shots.push(frameCanvas(await loadImg(url), { max, region: args.region })); labels.push(t0 != null ? `${i + 1} · ${(d.media.info().time || 0).toFixed(2)} s` : `${i + 1} · +${(i * gap).toFixed(1)} s`); }
        if (i < n - 1) await sleep(gap * 1000);
      }
      if (!shots.length) return { ok: false, error: 'No image: the sketch is not rendering (check three_console).' };
      const sheet = tile(shots, labels, Math.min(1600, Math.round(max * 1.5)));
      prevShot = shots.at(-1);
      return { ok: true, images: [{ data: jpeg(sheet), mime: 'image/jpeg' }], value: `${shots.length} frames of "${d.codeOf().sketch}" ${gap} s apart, left to right${shots.length > 4 ? ', then the next row' : ''} (${sheet.width}×${sheet.height}).` };
    }
    const url = await d.shot();
    if (!url) return { ok: false, error: 'No image: the sketch is not rendering (check three_console for errors).' };
    const c = frameCanvas(await loadImg(url), { max, region: args.region });
    // the same view again in this reply, and nothing visibly changed: say so instead of sending the picture again
    const key = JSON.stringify([max, args.region || null]);
    const sig = signature(c);
    if (!args.force && !args.compare && lastSig?.key === key && sigDiff(sig, lastSig.sig) < 0.004) {
      savedNotes.shots += 1;
      return { ok: true, value: 'No visible change since your previous screenshot in this reply (same picture, not sent again; force: true sends it).' };
    }
    lastSig = { key, sig };
    let out = c; let note = '';
    if (args.compare && prevShot) { out = tile([prevShot, c], ['before', 'now'], Math.min(1600, max * 2)); note = ' Left: the previous screenshot, right: now.'; } else if (args.compare) note = ' (No earlier screenshot to compare with yet.)';
    prevShot = c;
    const f = d.report().frame;
    return { ok: true, images: [{ data: jpeg(out), mime: 'image/jpeg' }], value: `Screenshot of "${d.codeOf().sketch}" (${out.width}×${out.height}${f ? `, frame ${frameLine(f)}` : ''}${args.region ? ', cropped' : ''}).${note}` };
  }

  // ---------- reading / searching code ----------
  const pad = (n, w) => String(n).padStart(w);
  function readCode(d, args) {
    const L = d.codeOf(args.layer || null);
    const lines = L.code.split('\n');
    let a = Math.max(1, Math.floor(Number(args.from) || 1));
    let b = args.to != null ? Math.floor(Number(args.to)) : a + 249;
    if (args.around != null) { const c = Math.floor(Number(args.around)); a = Math.max(1, c - 20); b = c + 20; }
    b = Math.min(lines.length, b);
    const w = String(b).length;
    const body = lines.slice(a - 1, b).map((ln, k) => `${pad(a + k, w)}| ${ln.replace(/\s+$/, '')}`).join('\n');
    const head = `── ${L.name} · lines ${a}–${b} of ${lines.length}${b < lines.length ? ` (more: from ${b + 1})` : ''}`;
    const ck = `${L.sketchId}:${L.id}:${a}-${b}`;
    if (!args.force && readCache.get(ck) === body) { savedNotes.reads += 1; return `${head}: unchanged since you read them earlier in this reply (force: true re-sends).`; }
    readCache.set(ck, body);
    return `${head}\n${body}`;
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

  // ---------- the handler ----------
  const consoleTail = (d) => d.report().console || [];
  // Errors with a line number get that line of code next to them, which saves a read_code call to look.
  function withErrorLines(d, value, r) {
    const errs = (r?.errors || []).filter((e) => e.line);
    if (!errs.length) return value;
    const lines = [];
    for (const e of errs.slice(0, 4)) {
      try { const code = d.codeOf(e.layer || null).code.split('\n'); const t = code[e.line - 1]; if (t != null) lines.push(`${e.layer ? `[${e.layer}] ` : ''}${e.line}| ${clip(t.trim(), 160)}`); } catch { /* layer gone */ }
    }
    if (lines.length) value.errorLines = lines;
    return value;
  }
  // Lines added since `before` (the console keeps the last 30; a layer's re-run drops its old lines).
  function newLines(before, after) {
    for (let k = Math.min(before.length, after.length); k > 0; k -= 1) {
      const tail = before.slice(-k);
      for (let i = 0; i + k <= after.length; i += 1) if (after.slice(i, i + k).every((x, j) => x === tail[j])) return after.slice(i + k);
    }
    return after;
  }

  async function handle(tool, args, d) {
    if (!d.codeOf) return null; // an older Lab without the hooks: its own handler answers
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
      for (const [i, p] of plans.entries()) {
        const last = i === plans.length - 1;
        // sketchId: a batch never continues into another scene if the one on screen changes mid-way (chat-scenes.js)
        const r = await d.updateLayer(p.L.id, { code: p.code, sketchId: p.L.sketchId }, last ? Math.min(15, Math.max(0.5, Number(args.wait) || 2.5)) : 0.4);
        record({ sketchId: p.L.sketchId, sketch: p.L.sketch, layerId: p.L.id, layer: p.L.name, before: p.L.code, after: p.code, tool });
        results.push({ p, r });
      }
      const final = results.at(-1).r;
      if (args.report === 'full') return { ok: true, value: { edits: results.map(({ p }) => ({ layer: p.L.name, edits: p.done, lines: p.code.split('\n').length })), ...final } };
      const value = { ...compact(final, { lines: 8 }) };
      delete value.updated;
      value.changed = results.map(({ p }) => `${p.L.name}: ${p.done.join(', ')} → ${p.code.split('\n').length} lines`).join('; ');
      value.diff = results.map(({ p }) => `${plans.length > 1 ? `── ${p.L.name}\n` : ''}${diff(p.L.code, p.code)}`).join('\n');
      // sliders the edit added or removed, so there's no need to re-read them
      const delta = plans.flatMap((p) => { const was = sliderKeysBefore.get(p.L.id) || []; const now = keysOf(p.L.id); return [...now.filter((k) => !was.includes(k)).map((k) => `+${k}`), ...was.filter((k) => !now.includes(k)).map((k) => `-${k}`)]; });
      if (delta.length) value.slidersChanged = delta.join(' ');
      delete value.sliders;
      withErrorLines(d, value, final);
      const img = (args.shot ?? store.get('director.autoShot', false)) ? await thumb(d) : null; // /director-autoshot
      return { ok: true, value, ...(img ? { images: [{ data: img, mime: 'image/jpeg' }] } : {}) };
    }
    if (tool === 'three_set_code') {
      if (!String(args.code || '').trim()) return { ok: false, error: 'No code given.' };
      const before = d.codeOf();
      toast('Three Director updated the sketch', { timeout: 1500 });
      const r = await d.setCode(String(args.code), Number(args.wait) || 2.5);
      record({ sketchId: before.sketchId, sketch: before.sketch, layerId: before.id, layer: before.name, before: before.code, after: String(args.code), tool });
      return { ok: true, value: args.report === 'full' ? r : withErrorLines(d, compact(r), r) };
    }
    if (tool === 'three_update_layer') {
      const patch = { ...(args.settings || {}) };
      let before = null;
      if (args.code != null) { patch.code = args.code; before = d.codeOf(args.layer); }
      if (args.order != null) patch.order = args.order;
      const r = await d.updateLayer(args.layer, patch, Number(args.wait) || (args.code != null ? 2.5 : 0.5));
      if (before) record({ sketchId: before.sketchId, sketch: before.sketch, layerId: before.id, layer: before.name, before: before.code, after: String(args.code), tool });
      return { ok: true, value: args.report === 'full' ? r : compact(r) };
    }
    if (tool === 'three_console') return { ok: true, value: args.full ? d.report() : compact(d.report(), { lines: 14 }) };
    if (tool === 'three_screenshot') return screenshot(d, args);
    if (tool === 'three_read_code') return { ok: true, value: readCode(d, args) };
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
      return { ok: true, value: { layer: r.layer, ...(r.changed?.length ? { changed: r.changed } : {}), sliders: sliderLines(r.sliders), ...(r.looks?.length ? { looks: r.looks.map((l) => (typeof l === 'string' ? l : l.name)).join(', ') } : {}) } };
    }
    if (tool === 'three_get_code') {
      const r = d.getCode();
      const { layers, sliders, ...rest } = r;
      return { ok: true, value: { ...rest, frame: frameLine(r.frame), ...(layers?.length > 1 ? { layers: layers.map((L) => `${L.name}${L.selected ? '*' : ''}${L.kind ? ' (filter)' : ''}`).join(', ') } : {}), ...(sliders ? { sliders: sliderLines(sliders) } : {}) } };
    }
    if (tool === 'three_help') return { ok: true, value: 'Help topics are answered by the three-lab tool server (three_do { cmd: "help", topic }).' };
    return null;
  }

  return {
    handle,
    // /undo-edit, /redo-edit, the dock's ↶ button
    undo: async (opts) => undo(ThreeLab.director || (await ThreeLab.cmd({ show: false }), ThreeLab.director), opts),
    redo: async () => redo(ThreeLab.director || (await ThreeLab.cmd({ show: false }), ThreeLab.director)),
    history: () => history.slice(),
    canRedo: () => redoStack.length > 0,
    onHistory(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    newTurn, saved: () => ({ ...savedNotes }),
    _test: { diff, applyEdits, compact, sliderLine, newLines, statLine, signature, sigDiff },
  };
})();
