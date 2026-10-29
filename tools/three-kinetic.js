// 🅰 Text that moves (round 45, kinetictype): kinetic type presets that move with the music, 0 tokens. The hub side.
// - One picker (＋ Add › 🅰 Text that moves…, right-click a 🅰 layer › 🅰 Type › Text that moves…, Lab search, Find
//   anything, /text-moves): 22 presets as live previews on a 120 BPM beat (word by word pop, letter cascade, typewriter,
//   glitch in, slide & blur, scale punch on kick, wave, split reveal, outline draw, bounce, neon flicker, zoom through,
//   stagger rise, highlight sweep, countdown, line per bar, snare shake, wide to tight, spin in, stamp on kick, elastic
//   snap, lyric line), and one row of controls: what it moves on (beat / bar / kick / snare / seconds), every how many
//   hits, the stagger between letters, the intensity, the easing; the font, the color (from the scene's palette),
//   outline and shadow.
// - A preset is an ordinary 🅰 type layer (tools/three-type*.js): its code is the tweak() sliders + textLayer(P, opts),
//   with the "Moves with the music" sliders (kSync, kEvery, kHold, kFlow, kFx, kDur) read by the preview page
//   (tools/three-sandbox.html, the math in tools/three-kinetic-core.js), so it is saved with the scene, its templates
//   (the words stay a field), recipes and packs, renders the same frame every time, and Save / Shuffle / keyframes work.
// - Lyric lines: paste the lines, then tap along (Space at each line), put them on your markers (the Hit lane: H while
//   the song plays) or let them be spread on the song.
// - Every change made here is one undo step (↶ in the picker, Ctrl/⌘+Z while it is open, /text-moves undo).
const LabKinetic = (() => {
  const KC = KineticCore;
  const TD = () => TypeData;
  const LT = () => LabType;
  const PRESETS = KC.PRESETS;
  const SYNC_NAMES = { beat: 'Beat', bar: 'Bar', kick: 'Kick', snare: 'Snare', seconds: 'Seconds', off: 'Own timing' };
  // fonts: a few that every computer has, two from Google (offline: the system font)
  const FONTS = [
    ['', 'Preset font'], ['system-ui, -apple-system, "Segoe UI", sans-serif', 'Sans bold'], ['Impact, "Arial Narrow Bold", "Helvetica Neue", sans-serif', 'Condensed'],
    ['Georgia, "Times New Roman", serif', 'Serif'], ['Consolas, "Courier New", monospace', 'Mono'], ['"Arial Rounded MT Bold", "Nunito", "Segoe UI", sans-serif', 'Rounded'],
    ['google:Anton', 'Anton (Google)'], ['google:Bebas Neue', 'Bebas Neue (Google)'],
  ];
  const EASE_NAMES = { out: 'Out', smooth: 'Smooth', linear: 'Linear', in: 'In', inOut: 'In-out', expo: 'Expo', expoInOut: 'Expo in-out', back: 'Back (overshoot)', elastic: 'Elastic', bounce: 'Bounce', sine: 'Sine' };
  const undoStack = []; // [{ label, sketchId, layer, before, after, added }]
  const clip = (s, n) => String(s ?? '').slice(0, n);

  // ---------- the scene on screen (or a chat's scene, through the director's tools) ----------
  async function call(tool, args, ctx = {}) {
    const r = await HubBridge.call(tool, args, { chatId: ctx.chatId || null });
    if (!r || r.ok === false) throw new Error(r?.error || `${tool} failed`);
    return r.value;
  }
  const sketchId = () => { try { return ThreeLab.scenes?.currentId?.() || null; } catch { return null; } };
  async function layers(ctx = {}) {
    const v = !ctx.chatId && ThreeLab.director?.layers ? ThreeLab.director.layers() : await call('three_layers', {}, ctx);
    return Array.isArray(v?.layers) ? v.layers : [];
  }
  async function codeOf(id, ctx = {}) {
    if (!ctx.chatId && ThreeLab.director) return ThreeLab.director.codeOf(id).code;
    const v = await call('three_read_code', { layer: id, from: 1, to: 4000, force: true }, ctx);
    const txt = typeof v === 'string' ? v : String(v.code || '');
    return txt.split('\n').filter((ln) => !/^── /.test(ln)).map((ln) => ln.replace(/^\s*\d+\| /, '')).join('\n');
  }
  const isTypeRow = (L) => /^type/.test(L.kind || '');
  // the 🅰 layer a change goes to: the one named, else the selected one, else the top one
  async function typeLayer(ref, ctx = {}) {
    const pool = (await layers(ctx)).filter(isTypeRow);
    if (!pool.length) return null;
    if (ref) { const r = String(ref).toLowerCase(); return pool.find((L) => L.id === ref || L.name.toLowerCase() === r) || pool.find((L) => L.name.toLowerCase().includes(r.replace(/^🅰\s*/, ''))) || null; }
    return pool.find((L) => L.selected) || pool[pool.length - 1];
  }
  // one change = one undo step (the code before and after)
  async function write(L, code, label, ctx = {}) {
    const before = await codeOf(L.id, ctx);
    if (before === code) return { layer: L.name, same: true };
    await call('three_update_layer', { layer: L.id, code, wait: 0.8 }, ctx);
    undoStack.push({ label, sketchId: sketchId(), layer: L.id, name: L.name, before, after: code, ctx });
    if (undoStack.length > 60) undoStack.shift();
    paintUndo();
    return { layer: L.name, id: L.id };
  }
  async function undo() {
    const u = undoStack.pop();
    paintUndo();
    if (!u) return { none: true };
    if (u.added) { await call('three_remove_layer', { layer: u.layer }, u.ctx).catch(() => null); return { undone: u.label, layer: u.name }; }
    const now = await codeOf(u.layer, u.ctx).catch(() => null);
    if (now == null) throw new Error(`"${u.name}" isn't in this scene any more`);
    await call('three_update_layer', { layer: u.layer, code: u.before, wait: 0.6 }, u.ctx);
    return { undone: u.label, layer: u.name };
  }

  // ---------- presets → layer code (through the type layer's own code maker) ----------
  const PK = () => TD().PKIN || ['kSync', 'kEvery', 'kHold', 'kFlow', 'kFx', 'kDur'];
  // c: the picker's controls { sync, every, stagger, amount, ease, font, color, color2, outline, shadow, text, lyrics }
  function sliderValues(p, c = {}) {
    const S = TD().SLIDERS;
    const v = { ...Object.fromEntries(PK().map((k) => [k, S[k].value])), ...p.sliders };
    if (c.sync) { v.kSync = c.sync; if (c.sync === 'seconds' && v.kSecs == null) v.kSecs = 0.5; }
    if (c.every != null && c.every !== '') v.kEvery = Number(c.every);
    if (c.secs != null) v.kSecs = Number(c.secs);
    if (c.stagger != null) v.stagger = Number(c.stagger);
    if (c.amount != null) v.amount = Number(c.amount);
    if (c.ease) v.ease = c.ease;
    if (c.color) v.color = c.color;
    if (c.color2) v.color2 = c.color2;
    if (c.outline) { v.outline = Math.max(Number(v.outline) || 0, 0.03); v.outlineColor = c.outlineColor || v.outlineColor || '#000000'; } else if (c.outline === false && !/outline-draw/.test(v.inAnim)) v.outline = 0;
    if (c.shadow) { v.glow = Math.max(Number(v.glow) || 0, 0.7); v.glowColor = '#000000'; }
    if (v.kSync === 'seconds' && v.kSecs == null) v.kSecs = 0.5;
    return v;
  }
  function codeFor(p, c = {}) {
    const opts = { ...p.opts };
    if (c.font) opts.font = c.font;
    if (Array.isArray(c.lyrics)) { opts.lyrics = c.lyrics; delete opts.text; } else if (!Array.isArray(opts.lyrics)) opts.text = clip(c.text || p.words, 400);
    const name = c.lyrics ? 'Lyrics' : String(opts.text || p.name).split(/\r?\n/)[0].slice(0, 24);
    return { code: LT().codeFor({ id: `kinetic ${p.id}`, name: p.name, sliders: sliderValues(p, c), opts }, { name, opts }), name };
  }
  const presetOf = (code) => { try { const id = LT().optsOf(code).kinetic; return id ? KC.preset(id) : null; } catch { return null; } };

  // add a layer in a preset, or turn a 🅰 layer into it (its words, lyrics and font kept unless the controls say)
  async function apply(q, { layer = null, text = null, controls = {}, ctx = {} } = {}) {
    const p = typeof q === 'object' && q ? q : KC.preset(q || 'pop-words');
    if (!p) throw new Error(`No preset "${q}". /text-moves list shows the ${PRESETS.length}.`);
    const c = { ...controls };
    if (text != null && text !== '') c.text = String(text).replace(/\s*\/\s*/g, '\n');
    const L = layer ? await typeLayer(layer === true ? null : layer, ctx) : null;
    if (layer && !L) throw new Error('No 🅰 type layer to change in this scene');
    if (L) {
      const old = await codeOf(L.id, ctx);
      let o = {}; try { o = LT().optsOf(old); } catch { /* hand-written */ }
      if (c.text == null && !Array.isArray(p.opts.lyrics)) { if (Array.isArray(o.lyrics)) c.lyrics = o.lyrics; else if (o.text) c.text = o.text; }
      if (Array.isArray(p.opts.lyrics) && !c.lyrics && Array.isArray(o.lyrics)) c.lyrics = o.lyrics;
      if (!c.font && o.font) c.font = o.font;
      const { code } = codeFor(p, c);
      return { ...(await write(L, code, `${p.name} on "${L.name}"`, ctx)), preset: p.name };
    }
    const { code, name } = codeFor(p, c);
    const nm = `🅰 ${name}`.slice(0, 38);
    const out = await call('three_add_layer', { name: nm, code, wait: 1 }, ctx);
    const row = (await layers(ctx).catch(() => [])).find((x) => x.name === (out.added || nm));
    if (row) { undoStack.push({ label: `${p.name} added`, sketchId: sketchId(), layer: row.id, name: row.name, added: true, ctx }); paintUndo(); }
    return { layer: row?.name || nm, id: row?.id || null, preset: p.name, added: true };
  }
  // one control on a 🅰 layer (a slider value, the font, the words): one undo step
  async function setOn(layer, values, ctx = {}) {
    const L = await typeLayer(layer, ctx);
    if (!L) throw new Error('No 🅰 type layer in this scene: ＋ Add › 🅰 Text that moves… makes one');
    let code = await codeOf(L.id, ctx); const done = [];
    for (const [k, v] of Object.entries(values)) {
      if (k === 'font' || k === 'text') { code = LT().setOpts(code, (o) => { if (k === 'text') { o.text = clip(v, 400); delete o.lyrics; } else o.font = v; }); done.push(`${k} = ${v}`); continue; }
      const x = LT().setValue(code, k, v); code = x.code; done.push(`${TD().SLIDERS[x.key]?.label || x.key} = ${x.value}`);
    }
    return { ...(await write(L, code, done.join(', '), ctx)), set: done };
  }

  // ---------- lyric lines: tap along, on markers, or spread on the song ----------
  function markers() {
    const P = ThreeLab.peek?.()?.player;
    if (!P?.loaded) return [];
    let tl = {}; try { tl = P.timeline(); } catch { return []; }
    const hits = tl.markers?.hit || [];
    return hits.length ? hits.slice() : (tl.cues || []).map((c) => c.time).filter(Number.isFinite);
  }
  const splitLines = (text) => String(text || '').split(/\r?\n/).map((s) => s.replace(/^\s*\[[^\]]*\]\s*$/, '').trim()).filter(Boolean);
  async function lyricLines(text, { how = 'markers', preset = 'lyric-line', controls = {}, layer = null, ctx = {} } = {}) {
    const LY = TypeLyrics;
    const p = KC.preset(preset) || KC.preset('lyric-line');
    const parsed = LY.parse(String(text || ''), '');
    const lines0 = parsed.lines.length ? parsed.lines : splitLines(text).map((t) => ({ text: t }));
    if (!lines0.length) throw new Error('Paste the lyric lines first (one line each)');
    let lines; let note;
    const m = LT().music();
    if (how === 'markers') {
      const mk = markers();
      if (!mk.length) throw new Error('No markers on the song yet: play it and tap H at each line (the Hit lane), then try again — or tap along');
      const r = KC.linesOnMarks(lines0.map((x) => x.text), mk, { duration: m?.duration ?? Infinity });
      lines = r.lines; note = `${r.used} line${r.used === 1 ? '' : 's'} on your markers${r.used < lines.length ? `, ${lines.length - r.used} after them` : ''}`;
    } else if (parsed.timed) { lines = parsed.lines; note = 'their own times'; }
    else if (m) { const r = LY.align(lines0.map((x) => ({ text: x.text })), m); lines = r.lines; note = r.how; }
    else { const r = LY.align(lines0.map((x) => ({ text: x.text })), { duration: Math.max(lines0.length * 3 + 4, 20), bpm: 120 }); lines = r.lines; note = 'no song: one line every few seconds'; }
    const pk = LY.pack(lines);
    const L = layer ? await typeLayer(layer, ctx) : null;
    let r;
    if (L) {
      const old = await codeOf(L.id, ctx);
      let code = LT().setOpts(old, (o) => { o.lyrics = pk; delete o.text; });
      for (const k of TD().PLYR) if (!new RegExp(`^[ \\t]*${k}\\s*:`, 'm').test(code)) code = LT().setValue(code, k, TD().SLIDERS[k].value).code;
      r = await write(L, code, `${lines.length} lyric lines (${note})`, ctx);
    } else r = await apply(p, { controls: { ...controls, lyrics: pk }, ctx });
    if (how === 'tap') { try { await LT().tapMode(r.id || r.layer); note = 'tap Space at each line'; } catch (err) { note = err.message; } }
    return { ...r, lines: lines.length, how: note };
  }
  // the lyric lines of a 🅰 layer put on the song's markers again (after tapping more markers)
  async function linesToMarkers(layer = null, ctx = {}) {
    const L = await typeLayer(layer, ctx);
    if (!L) throw new Error('No 🅰 lyrics layer in this scene');
    const old = await codeOf(L.id, ctx);
    const o = LT().optsOf(old);
    if (!Array.isArray(o.lyrics)) throw new Error(`"${L.name}" has no lyric lines`);
    const mk = markers();
    if (!mk.length) throw new Error('No markers on the song yet: tap H at each line while it plays');
    const r = KC.linesOnMarks(TypeLyrics.unpack(o.lyrics).map((x) => x.text), mk, { duration: LT().music()?.duration ?? Infinity });
    const code = LT().setOpts(old, (x) => { x.lyrics = TypeLyrics.pack(r.lines); });
    return { ...(await write(L, code, `lyric lines on ${r.used} markers`, ctx)), lines: r.lines.length, onMarkers: r.used };
  }

  // ---------- live previews (the picker's cards): a 2D canvas, the same step math on a 120 BPM beat ----------
  const PV = { o: { a: 1, x: 0, y: 0, s: 1, sx: 1, sy: 1, r: 0, glow: 0, ch: null, blur: 0 }, P: null, clock: KC.clockHits(0.5, 0), kick: KC.listHits(Array.from({ length: 400 }, (_, i) => i * 0.5 + (i % 4 === 3 ? 0.25 : 0))) };
  const SCR = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&*';
  // the in / out animations, close to the preview page's (tools/three-sandbox.html TY_ANIM) in a few lines
  function anim(id, e, p, o, c) {
    switch (id) {
      case 'typewriter': o.a = p > 0 ? 1 : 0; break;
      case 'wave': o.a = Math.min(1, e * 2); o.y = -(1 - e) * 0.8 * c.k + Math.sin(e * Math.PI) * 0.18; break;
      case 'glitch': case 'scramble': case 'split-flap': if (p <= 0) { o.a = 0; break; } if (p < 1) { const h = KC.hash(Math.floor(p * 22) * 13 + c.gi * 7); o.x = (h - 0.5) * 0.5; o.a = h > 0.28 ? 1 : 0.25; if (h > 0.6) o.ch = SCR[Math.floor(h * 997) % SCR.length]; } break;
      case 'slide-up': o.y = -(1 - e) * 1.2 * c.k; o.a = e; break;
      case 'slide-down': o.y = (1 - e) * 1.2 * c.k; o.a = e; break;
      case 'slide-left': case 'slide-blur': o.x = (1 - e) * 1.8 * c.k; o.a = e; o.blur = id === 'slide-blur' ? (1 - e) * 6 : 0; break;
      case 'slide-right': o.x = -(1 - e) * 1.8 * c.k; o.a = e; break;
      case 'scale-pop': o.s = Math.max(0, KC.EASE.back(Math.min(1, Math.max(0, p)))); o.a = Math.min(1, p * 3); break;
      case 'blur-in': o.blur = (1 - e) * 6; o.a = e; break;
      case 'drop': case 'bounce': o.y = (1 - KC.EASE.bounce(Math.min(1, Math.max(0, p)))) * 2 * c.k; o.a = Math.min(1, p * 4); break;
      case 'spin': o.r = (1 - e) * Math.PI * c.k; o.s = e; o.a = e; break;
      case 'zoom': o.s = 1 + (1 - e) * 2 * c.k; o.a = e; break;
      case 'zoom-through': o.s = 0.15 + 0.85 * e; o.a = Math.min(1, e * 1.5); o.blur = (1 - e) * 3; break;
      case 'elastic': o.x = -(1 - KC.EASE.elastic(Math.min(1, Math.max(0, p)))) * 1.5 * c.k; o.a = Math.min(1, p * 3); break;
      case 'tracking': case 'split': o.x = (id === 'split' ? -c.rel : c.rel) * (1 - e) * 0.9; o.a = e; break;
      case 'rise': o.y = -(1 - e) * 0.9 * c.k; o.sy = 0.3 + 0.7 * e; o.a = e; break;
      case 'neon': o.a = p <= 0 ? 0 : p >= 1 ? 1 : KC.hash(Math.floor(p * 24) + c.gi * 5) > 0.45 ? 1 : 0.1; break;
      case 'outline-draw': o.sx = Math.max(0.02, e); o.a = Math.min(1, e * 2); break;
      case 'stretch': o.sy = 1 + (1 - KC.EASE.elastic(Math.min(1, Math.max(0, p)))) * 1.4; o.sx = 0.35 + 0.65 * e; o.a = Math.min(1, p * 3); break;
      default: o.a = e;
    }
  }
  // the glyphs of a card laid out once (per text and size): x / line / word / letter-in-word / letter-in-line
  function layoutCard(card, g, text, W, H) {
    const key = `${text}|${card.font}|${W}x${H}`;
    if (card.lay?.key === key) return card.lay;
    const lines = text.split('\n').slice(0, 4);
    let size = Math.min(H / (lines.length * 1.25 + 0.2), 34);
    g.font = `800 ${size}px ${card.font}`;
    const widest = Math.max(...lines.map((l) => g.measureText(l).width), 1);
    if (widest > W * 0.9) { size *= (W * 0.9) / widest; g.font = `800 ${size}px ${card.font}`; }
    const glyphs = []; let gi = 0; let wi = 0;
    lines.forEach((ln, li) => {
      const w = g.measureText(ln).width; let x = (W - w) / 2; let iw = 0; let il = 0; let inWord = false;
      for (const ch of Array.from(ln)) {
        const adv = g.measureText(ch).width;
        if (/\s/.test(ch)) { if (inWord) { wi += 1; inWord = false; iw = 0; } x += adv; continue; }
        inWord = true;
        glyphs.push({ ch, x: x + adv / 2, li, wi, iw: iw++, il: il++, gi: gi++, lineMid: W / 2 });
        x += adv;
      }
      if (inWord) wi += 1;
    });
    const top = H / 2 - ((lines.length - 1) * size * 1.15) / 2;
    card.lay = { key, glyphs, size, nLines: lines.length, nWords: Math.max(1, wi), top, lh: size * 1.15 };
    return card.lay;
  }
  function drawCard(card, t) {
    const cv = card.canvas; const g = card.g;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = cv.clientWidth || 168; const H = cv.clientHeight || 72;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); card.lay = null; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const p = card.p; const v = sliderValues(p, card.ctl());
    const text = card.text();
    const lay = layoutCard(card, g, text, W, H);
    const unit = v.unit || 'glyph';
    const nU = unit === 'word' ? lay.nWords : unit === 'line' ? lay.nLines : lay.glyphs.length;
    const order = v.order || 'forward';
    const sync = v.kSync || 'off';
    const hit = sync === 'seconds' ? KC.clockHits(Math.max(0.04, Number(v.kSecs) || 0.5), 0) : sync === 'bar' ? KC.clockHits(2, 0) : sync === 'kick' || sync === 'snare' ? PV.kick : PV.clock;
    const P = (PV.P ||= KC.newPlan());
    const nR = KC.nRanks(nU, order);
    const hold = (v.outAnim || 'fade') === 'none' ? 0 : Number(v.kHold) || 0;
    const lyric = Array.isArray(p.opts.lyrics);
    KC.plan(P, { hit, t, start: 0, nR, every: lyric ? 0 : v.kEvery, hold: lyric ? 3 : hold, swap: v.kFlow === 'one at a time', durFrac: Number(v.kDur) || 0.6 });
    const stag = Math.max(0, Number(v.stagger) || 0); const amt = Number(v.amount ?? 1);
    const o = PV.o; const col = v.color || '#ffffff'; const col2 = v.color2 || '#ffd75e';
    g.font = `800 ${lay.size}px ${card.font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const outline = Number(v.outline) > 0;
    const fillIn = v.inAnim === 'outline-draw' ? Math.max(0, Math.min(1, (t - P.allIn - P.dur) / (P.gap * 0.6))) : 1;
    for (const gl of lay.glyphs) {
      const u = unit === 'word' ? gl.wi : unit === 'line' ? gl.li : gl.gi;
      const rk = KC.rankOf(u, nU, order); const ri = Math.min(P.nR - 1, KC.stepOf(rk));
      const inner = unit === 'word' ? gl.iw : unit === 'line' ? gl.il : 0;
      const t0 = P.starts[ri] + inner * stag; const tO = P.outs[ri] + inner * stag * 0.5;
      let pr = (t - t0) / P.dur; let id = v.inAnim; let e;
      if (t >= tO && v.outAnim !== 'none') { const q = (t - tO) / P.dur; if (q >= 1) continue; if (q > 0) { id = v.outAnim; pr = 1 - Math.min(1, q); } }
      e = KC.ease(v.ease, pr);
      o.a = 1; o.x = 0; o.y = 0; o.s = 1; o.sx = 1; o.sy = 1; o.r = 0; o.glow = 0; o.ch = null; o.blur = 0;
      anim(id, e, pr, o, { k: amt, gi: gl.gi, rel: (gl.x - gl.lineMid) / lay.size });
      const m = KC.fx(v.kFx, o, P, gl.gi, rk, amt);
      if (o.a <= 0.01) continue;
      g.save();
      g.globalAlpha = Math.min(1, o.a);
      g.translate(gl.x + o.x * lay.size, lay.top + gl.li * lay.lh - o.y * lay.size);
      if (o.r) g.rotate(o.r);
      g.scale(o.s * o.sx, o.s * o.sy);
      if (o.blur > 0.3) g.filter = `blur(${o.blur.toFixed(1)}px)`;
      const ch = o.ch || gl.ch;
      if (outline) { g.lineWidth = 1.2; g.strokeStyle = v.outlineColor || '#000'; g.strokeText(ch, 0, 0); }
      if (fillIn > 0.01) { g.globalAlpha *= fillIn; g.fillStyle = m > 0 ? col2 : col; g.fillText(ch, 0, 0); }
      g.restore();
    }
    // the beat it moves on: a dot that flashes on each hit
    g.globalAlpha = P.k >= 0 ? 0.25 + 0.75 * P.pulse : 0.2; g.fillStyle = col2;
    g.beginPath(); g.arc(W - 8, 8, 3, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
  }

  // ---------- the picker ----------
  let open0 = null;
  const btnUndo = { el: null };
  function paintUndo() { const b = btnUndo.el; if (!b) return; const n = undoStack.length; b.disabled = !n; const tip = n ? `Undo: ${undoStack[n - 1].label}` : 'Nothing to undo'; if (b.title !== tip) b.title = tip; }
  function lastControls() { try { return JSON.parse(store.get('three.kinetic.controls', '{}')) || {}; } catch { return {}; } }
  function saveControls(c) { try { const { text, lyrics, ...rest } = c; store.set('three.kinetic.controls', JSON.stringify(rest)); } catch { /* a convenience */ } }
  function palette() { try { const s = ThreeLab.scenes.get(ThreeLab.scenes.currentId()); return (s?.palette || []).filter((x) => /^#[0-9a-f]{6}$/i.test(x)).slice(0, 6); } catch { return []; } }

  async function open({ layer = null, lyrics = false } = {}) {
    if (open0) open0.close();
    await ThreeLab.cmd();
    if (lyrics) return lyricsDialog({ layer });
    // a 🅰 layer to change (named, or the selected one when it is a type layer), else a new layer
    let L = null; let o = {};
    if (layer) { L = await typeLayer(layer).catch(() => null); }
    else { const sel = (await layers().catch(() => [])).find((x) => x.selected); if (sel && isTypeRow(sel)) L = sel; }
    if (L) { try { o = LT().optsOf(await codeOf(L.id)); } catch { o = {}; } }
    const C = { ...lastControls(), text: o.text || store.get('three.kinetic.text', '') || 'MAKE IT MOVE' };
    const cur = presetOf(L ? await codeOf(L.id).catch(() => '') : '');
    const shade = el('div', { class: 'kt-shade', on: { pointerdown: (e) => { if (e.target === shade) close(); } } });
    const box = el('div', { class: 'kt-dlg', attrs: { role: 'dialog', 'aria-label': 'Text that moves' } });
    shade.append(box);
    const close = () => { cancelAnimationFrame(raf); io?.disconnect(); shade.remove(); btnUndo.el = null; open0 = null; removeEventListener('keydown', onKey, true); };
    const textIn = el('input', { type: 'text', class: 'kt-text', value: C.text, placeholder: 'Your words (/ starts a new line)', attrs: { 'aria-label': 'The words' } });
    const search = el('input', { type: 'search', class: 'kt-search', placeholder: `Search ${PRESETS.length} presets (pop, glitch, kick, wave, lyrics…)`, attrs: { 'aria-label': 'Search the presets' } });
    const grid = el('div', { class: 'kt-grid', attrs: { role: 'listbox', 'aria-label': 'Presets' } });
    const undoB = el('button', { type: 'button', class: 'ghost small kt-undo', text: '↶', attrs: { 'aria-label': 'Undo the last change' }, on: { click: () => undo().then((r) => r.undone && toast(`↶ ${r.undone}`, { timeout: 1600 })).catch((e) => toast(e.message, { type: 'error' })) } });
    btnUndo.el = undoB; paintUndo();
    const where = el('span', { class: 'kt-where', text: L ? `changes “${L.name}”` : 'adds a layer' });
    box.append(el('div', { class: 'kt-head' }, el('b', { text: '🅰 Text that moves' }), where, undoB, el('button', { type: 'button', class: 'ghost small', text: '✕', attrs: { 'aria-label': 'Close' }, on: { click: () => close() } })), textIn, search, grid);

    // ---- the controls: one row for the timing, one for the look ----
    const ctl = () => ({ ...C, text: textIn.value.trim() || 'MAKE IT MOVE' });
    const chip = (label, on, fn, tip) => el('button', { type: 'button', class: `kt-chip${on ? ' on' : ''}`, text: label, title: tip, attrs: { 'aria-pressed': String(Boolean(on)) }, on: { click: fn } });
    const timing = el('div', { class: 'kt-row', attrs: { role: 'group', 'aria-label': 'What it moves on' } });
    const look = el('div', { class: 'kt-row', attrs: { role: 'group', 'aria-label': 'The look' } });
    const range = (label, key, min, max, step, val, tip) => {
      const out = el('span', { class: 'kt-val', text: String(val) });
      const r = el('input', { type: 'range', min, max, step, value: val, title: tip, attrs: { 'aria-label': label } });
      r.addEventListener('input', () => { C[key] = Number(r.value); out.textContent = r.value; });
      r.addEventListener('change', () => { C[key] = Number(r.value); changed({ [key]: Number(r.value) }); });
      return el('label', { class: 'kt-range' }, el('span', { text: label }), r, out);
    };
    // a control moved: the previews follow; on a layer being changed, the layer follows too (one undo step)
    const KEYS = { sync: 'kSync', every: 'kEvery', stagger: 'stagger', amount: 'amount', ease: 'ease', color: 'color', color2: 'color2' };
    let target = L;
    function changed(part) {
      saveControls(C);
      paintRows();
      if (!target) return;
      const vals = {};
      for (const [k, v] of Object.entries(part)) {
        if (KEYS[k]) vals[KEYS[k]] = v;
        if (k === 'font' && v) vals.font = v;
        if (k === 'outline') { vals.outline = v ? 0.03 : 0; }
        if (k === 'shadow') { vals.glow = v ? 0.7 : 0; if (v) vals.glowColor = '#000000'; }
      }
      if (part.sync === 'seconds') vals.kSecs = 0.5;
      if (!Object.keys(vals).length) return;
      setOn(target.id, vals).then((r) => r.same || toast(`🅰 ${r.set.join(' · ')}`, { timeout: 1200 })).catch((e) => toast(e.message, { type: 'error' }));
    }
    function paintRows() {
      timing.replaceChildren(
        el('span', { class: 'kt-lab', text: 'Moves on' }),
        ...['beat', 'bar', 'kick', 'snare', 'seconds'].map((s) => chip(SYNC_NAMES[s], C.sync === s, () => { C.sync = C.sync === s ? null : s; changed({ sync: C.sync || 'beat' }); }, KC.SYNCS.find((x) => x.id === s).hint)),
        el('select', { class: 'kt-sel', title: 'How many hits between steps', attrs: { 'aria-label': 'Every how many hits' }, on: { change: (e) => { C.every = e.target.value === '' ? null : Number(e.target.value); changed({ every: C.every ?? 1 }); } } },
          ...[['', 'every hit (preset)'], ['1', 'every hit'], ['2', 'every 2 hits'], ['4', 'every 4 hits'], ['0', 'all together']].map(([v, l]) => el('option', { value: v, text: l, selected: String(C.every ?? '') === v }))),
        range('Stagger', 'stagger', 0, 0.15, 0.005, C.stagger ?? 0.03, 'Seconds between the letters of one step'),
        range('Intensity', 'amount', 0, 2, 0.05, C.amount ?? 1, 'How far / how big the moves are'),
        el('select', { class: 'kt-sel', title: 'Easing', attrs: { 'aria-label': 'Easing' }, on: { change: (e) => { C.ease = e.target.value || null; changed({ ease: C.ease || 'out' }); } } },
          el('option', { value: '', text: 'Easing (preset)', selected: !C.ease }), ...KC.EASE_IDS.map((k) => el('option', { value: k, text: EASE_NAMES[k] || k, selected: C.ease === k }))));
      const pal = [...new Set(['#ffffff', ...palette()])].slice(0, 7);
      look.replaceChildren(
        el('select', { class: 'kt-sel', title: 'Font', attrs: { 'aria-label': 'Font' }, on: { change: (e) => { C.font = e.target.value || null; changed({ font: C.font }); } } }, ...FONTS.map(([v, l]) => el('option', { value: v, text: l, selected: (C.font || '') === v }))),
        el('span', { class: 'kt-lab', text: 'Color' }),
        ...pal.map((hex, i) => { const b = el('button', { type: 'button', class: `kt-sw${C.color === hex ? ' on' : ''}`, title: `${hex}${i ? ' (from the scene\'s palette)' : ''}`, attrs: { 'aria-label': `Color ${hex}` }, on: { click: () => { C.color = C.color === hex ? null : hex; const nx = pal[(i + 1) % pal.length]; C.color2 = C.color ? (nx === hex ? '#ffd75e' : nx) : null; changed({ color: C.color || '#ffffff', ...(C.color2 ? { color2: C.color2 } : {}) }); } } }); b.style.background = hex; return b; }),
        chip('Outline', C.outline, () => { C.outline = !C.outline; changed({ outline: C.outline }); }, 'A thin outline around the letters'),
        chip('Shadow', C.shadow, () => { C.shadow = !C.shadow; changed({ shadow: C.shadow }); }, 'A soft dark shadow around the letters'));
    }
    paintRows();
    const lyrB = el('button', { type: 'button', class: 'ghost small', text: '🎤 Lyric lines…', title: 'Paste lyric lines, then tap along, put them on your markers or let them be spread on the song', on: { click: () => { close(); lyricsDialog({ layer: L?.id || null }); } } });
    box.append(timing, look, el('div', { class: 'kt-foot' }, lyrB, el('span', { class: 'hint', text: 'Click a preset (or Enter) · Ctrl/⌘+Z undoes · Esc closes' })));

    // ---- the cards ----
    let rows = []; let at = 0; const cards = [];
    const go = (p) => {
      store.set('three.kinetic.text', textIn.value.trim());
      if (Array.isArray(p.opts.lyrics) && !target) { close(); lyricsDialog({ preset: p.id, controls: ctl() }); return; }
      apply(p, { layer: target ? target.id : null, controls: ctl() }).then((r) => {
        toast(`🅰 ${r.preset} · “${r.layer}”`, { timeout: 1600 });
        if (!target && r.id) { target = { id: r.id, name: r.layer }; where.textContent = `changes “${r.layer}”`; }
        cardsOn(p.id);
      }).catch((e) => toast(e.message, { type: 'error', timeout: 5000 }));
    };
    const cardsOn = (id) => { for (const c of cards) c.btn.classList.toggle('cur', c.p.id === id); };
    for (const p of PRESETS) {
      const canvas = el('canvas', { class: 'kt-cv', attrs: { 'aria-hidden': 'true' } });
      const btn = el('button', { type: 'button', class: 'kt-card', title: p.desc, attrs: { role: 'option', 'aria-label': `${p.name}: ${p.desc}` }, on: { click: () => go(p), pointerenter: () => { card.hot = true; }, pointerleave: () => { card.hot = false; } } },
        canvas, el('b', { text: p.name }), el('span', { class: 'kt-sync', text: `♪ ${SYNC_NAMES[p.sliders.kSync] || 'Beat'}${p.sliders.kFx && p.sliders.kFx !== 'none' ? ` · ${p.sliders.kFx}` : ''}` }));
      const card = { p, btn, canvas, g: canvas.getContext('2d'), vis: true, hot: false, lay: null, ctl: () => C,
        // (a Google font isn't loaded here: the previews use the preset's)
        get font() { return C.font && !/^google:/i.test(C.font) ? C.font : (p.opts.font || 'system-ui, -apple-system, "Segoe UI", sans-serif'); },
        text: () => { const typed = textIn.value.trim(); return (Array.isArray(p.opts.lyrics) ? 'THE LINE\nYOU SING' : !typed || /^make it move$/i.test(typed) ? p.words : typed).replace(/\s*\/\s*/g, '\n').slice(0, 40); } };
      card.btn.dataset.id = p.id;
      cards.push(card);
    }
    const draw = () => {
      const w = search.value.toLowerCase().trim();
      rows = cards.filter((c) => !w || `${c.p.id} ${c.p.name} ${c.p.desc} ${c.p.sliders.kSync} ${c.p.sliders.kFx || ''} ${Array.isArray(c.p.opts.lyrics) ? 'lyrics lyric karaoke' : ''}`.toLowerCase().includes(w));
      at = Math.min(at, Math.max(0, rows.length - 1));
      grid.replaceChildren(...rows.map((c, i) => { c.btn.classList.toggle('on', i === at); return c.btn; }));
    };
    search.addEventListener('input', () => { at = 0; draw(); });
    textIn.addEventListener('input', () => { for (const c of cards) c.lay = null; C.text = textIn.value; });
    const onKey = (e) => {
      if (!shade.isConnected) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && document.activeElement?.tagName !== 'INPUT') { e.preventDefault(); e.stopPropagation(); undoB.click(); return; }
      if (e.target === search || e.target === grid || grid.contains(e.target)) {
        const cols = Math.max(1, Math.round(grid.clientWidth / 180));
        const mv = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
        if (mv) { e.preventDefault(); at = Math.max(0, Math.min(rows.length - 1, at + mv)); draw(); rows[at]?.btn.scrollIntoView({ block: 'nearest' }); }
        if (e.key === 'Enter' && rows[at] && e.target === search) { e.preventDefault(); go(rows[at].p); }
      }
    };
    addEventListener('keydown', onKey, true);
    draw();
    if (cur) cardsOn(cur.id);
    document.body.append(shade);
    // previews only for the cards in view; the loop stops when the picker closes or the window hides
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((es) => { for (const x of es) { const c = cards.find((k) => k.btn === x.target); if (c) c.vis = x.isIntersecting; } }, { root: grid }) : null;
    if (io) for (const c of cards) io.observe(c.btn);
    // (gpuload84) the cards draw 30 times a second, not on every frame of the screen (240 on a fast one: a grid of
    // canvases redrawn that often loaded the graphics card enough to crackle other apps' sound)
    let raf = 0; const t0 = performance.now(); let next = 0;
    const loop = (now) => {
      if (!shade.isConnected) return;
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      if (now < next - 1) return;
      next = now - next > 1000 / 30 ? now + 1000 / 30 : next + 1000 / 30;
      const t = (performance.now() - t0) / 1000;
      for (const c of rows) if (c.vis) { try { drawCard(c, t); } catch (err) { console.warn('kinetic preview', err); c.vis = false; } }
    };
    raf = requestAnimationFrame(loop);
    search.focus();
    open0 = { close, el: shade, get target() { return target; } };
    return open0;
  }

  // ---------- the lyric lines dialog: paste, then how to time them ----------
  function lyricsDialog({ layer = null, preset = 'lyric-line', controls = {} } = {}) {
    const mk = markers().length;
    const shade = el('div', { class: 'kt-shade', on: { pointerdown: (e) => { if (e.target === shade) shade.remove(); } } });
    const ta = el('textarea', { class: 'kt-lyr', rows: 8, placeholder: 'Paste the lyric lines, one per line (an .lrc / .srt keeps its times)', attrs: { 'aria-label': 'Lyric lines' } });
    const run = (how) => {
      const txt = ta.value;
      if (!txt.trim()) { ta.focus(); return; }
      shade.remove();
      lyricLines(txt, { how, preset, controls, layer }).then((r) => toast(`🅰 ${r.lines} lyric lines · ${r.how}`, { timeout: 2600 })).catch((e) => toast(e.message, { type: 'error', timeout: 6000 }));
    };
    const box = el('div', { class: 'kt-dlg kt-small', attrs: { role: 'dialog', 'aria-label': 'Lyric lines' } },
      el('div', { class: 'kt-head' }, el('b', { text: '🎤 Lyric lines' }), el('span', { class: 'kt-where', text: 'each line rises in word by word as it is sung' })),
      ta,
      el('div', { class: 'kt-row' },
        el('button', { type: 'button', class: 'primary small', text: '🎤 Tap along', title: 'The song plays: press Space as each line starts (⌫ back, Enter keeps)', on: { click: () => run('tap') } }),
        el('button', { type: 'button', class: 'small', text: `On my markers${mk ? ` (${mk})` : ''}`, title: mk ? 'Line 1 on marker 1, line 2 on marker 2… (the Hit lane: H while the song plays)' : 'No markers yet: tap H at each line while the song plays, then come back', disabled: !mk, on: { click: () => run('markers') } }),
        el('button', { type: 'button', class: 'small', text: 'Spread on the song', title: 'Put on the song\'s beats and onsets by the music analysis; fix it later with Tap along', on: { click: () => run('align') } })),
      el('div', { class: 'hint', text: 'Esc closes' }));
    shade.append(box);
    shade.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); shade.remove(); } });
    document.body.append(shade);
    ta.focus();
    return { close: () => shade.remove(), el: shade, run };
  }

  // ---------- the director: three_do type { op: "kinetic", preset, text, sync, layer } ----------
  async function op(a = {}, ctx = {}) {
    if (!a.preset && !a.sync && !a.text && !a.lyrics) return PRESETS.map((p) => `${p.id}: ${p.name} (♪ ${p.sliders.kSync}) ${p.desc}`).join('\n');
    if (a.lyrics) return lyricLines(a.lyrics, { how: a.how || 'align', layer: a.layer || null, ctx });
    const controls = Object.fromEntries(Object.entries({ sync: a.sync, every: a.every, stagger: a.stagger, amount: a.intensity ?? a.amount, ease: a.ease, color: a.color, font: a.font }).filter(([, v]) => v != null && v !== ''));
    if (!a.preset && a.layer !== undefined) return setOn(a.layer || null, Object.fromEntries(Object.entries({ kSync: controls.sync, kEvery: controls.every, stagger: controls.stagger, amount: controls.amount, ease: controls.ease, color: controls.color }).filter(([, v]) => v != null)), ctx);
    return apply(a.preset || 'pop-words', { layer: a.layer || (a.replace ? true : null), text: a.text, controls, ctx });
  }

  // ---------- chat command, Ctrl/⌘+K ----------
  const said = (r) => `🅰 ${r.preset ? `${r.preset} · ` : ''}“${r.layer}”${r.set ? `: ${r.set.join(' · ')}` : ''}${r.lines ? ` · ${r.lines} lines · ${r.how}` : ''}`;
  function registerCommands() {
    if (typeof Commands === 'undefined' || Commands.get('text-moves')) return;
    Commands.register({
      name: 'text-moves', area: 'Three.js Lab', aliases: ['moving-text', 'words-on-beat'],
      args: '[<preset> [words] | on beat|bar|kick|snare|seconds | every <n> | stagger <s> | intensity <x> | ease <name> | lyrics <lines> | markers | undo | list]',
      desc: '🅰 Text that moves with the music: 22 kinetic type presets (word by word pop, letter cascade, punch on kick, zoom through, countdown, lyric lines…) on the beat / bar / kick, 0 tokens',
      examples: ['/text-moves', '/text-moves pop-words LET IT GO', '/text-moves countdown', '/text-moves on kick', '/text-moves every 2', '/text-moves lyrics first line / second line', '/text-moves markers', '/text-moves undo'],
      keywords: 'kinetic typography text animation animated text moving words on the beat lyrics lyric video title opener word by word kick punch countdown typewriter',
      complete: (a) => {
        const w = a.trim().toLowerCase();
        if (/^on\b/.test(w)) return ['beat', 'bar', 'kick', 'snare', 'seconds', 'off'].map((x) => ({ value: `on ${x}`, hint: KC.SYNCS.find((s) => s.id === x)?.hint || '' })).filter((x) => x.value.startsWith(w));
        if (/^ease\b/.test(w)) return KC.EASE_IDS.map((x) => ({ value: `ease ${x}` })).filter((x) => x.value.startsWith(w));
        const verbs = [{ value: 'on ', hint: 'beat, bar, kick, snare, seconds' }, { value: 'every ', hint: 'hits per step' }, { value: 'stagger ', hint: 'seconds between letters' }, { value: 'intensity ', hint: '0–2' }, { value: 'ease ', hint: 'the easing' }, { value: 'lyrics ', hint: 'lines (/ between them)' }, { value: 'markers', hint: 'lyric lines on your markers' }, { value: 'undo' }, { value: 'list' }];
        return [...PRESETS.map((p) => ({ value: `${p.id} `, hint: p.name })), ...verbs].filter((x) => !w || x.value.startsWith(w)).slice(0, 40);
      },
      run: async (args) => {
        const w = String(args || '').trim();
        const [verb, ...rest] = w.split(/\s+/); const tail = rest.join(' '); const v = (verb || '').toLowerCase();
        if (!v) { await open(); return null; }
        await ThreeLab.cmd();
        if (v === 'list') return PRESETS.map((p) => `- \`${p.id}\` ${p.name} (♪ ${SYNC_NAMES[p.sliders.kSync] || 'Beat'}): ${p.desc}`).join('\n');
        if (v === 'undo') { const r = await undo(); return r.none ? 'Nothing to undo' : `↶ ${r.undone}`; }
        if (v === 'on') { const s = (rest[0] || '').toLowerCase(); if (!KC.SYNC_IDS.includes(s)) return 'on beat | bar | kick | snare | seconds | off'; return said(await setOn(null, { kSync: s, ...(s === 'seconds' ? { kSecs: Number(rest[1]) || 0.5 } : {}) })); }
        if (v === 'every') return said(await setOn(null, { kEvery: Number(rest[0]) }));
        if (v === 'stagger') return said(await setOn(null, { stagger: Number(rest[0]) }));
        if (v === 'intensity') return said(await setOn(null, { amount: Number(rest[0]) }));
        if (v === 'ease') return said(await setOn(null, { ease: rest[0] }));
        if (v === 'lyrics' || v === 'lyric') { if (!tail) { lyricsDialog(); return null; } return said(await lyricLines(tail.replace(/\s*\/\s*/g, '\n'), { how: 'align' })); }
        if (v === 'markers') return said(await linesToMarkers(null));
        const p = KC.preset(v);
        if (p) return said(await apply(p, { text: tail || null }));
        return said(await apply('pop-words', { text: w }));
      },
    });
  }
  registerCommands();
  if (typeof AppUI !== 'undefined' && AppUI.addAction) {
    AppUI.addAction('Lab: 🅰 Text that moves with the music (kinetic type presets, text animation)…', () => open().catch((e) => toast(e.message, { type: 'error' })));
    AppUI.addAction('Lab: 🎤 Lyric lines that move (paste, tap along or put on markers)…', () => ThreeLab.cmd().then(() => lyricsDialog()).catch((e) => toast(e.message, { type: 'error' })));
  }

  return { open, lyricsDialog, apply, setOn, undo, op, lyricLines, linesToMarkers, markers, codeFor, presetOf, sliderValues, drawCard, PRESETS, get undoDepth() { return undoStack.length; }, get picker() { return open0; } };
})();
window.LabKinetic = LabKinetic;
