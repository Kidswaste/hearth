// (round 179, moodread179) The mood read, the pure part (no DOM; loads in Node for dev/moodread-test.js). A moodboard is
// read DEEPLY, on the owner's click and at whatever it costs: every picture at full size, three looks each (surface:
// colour, light, texture · structure: shape, composition, depth, motion · meaning: era, echoes, feeling), a second,
// independent look to cross-check, then one pass over the whole board (what the pictures share, the threads they fall
// into, where they disagree, what the board is not). The read is kept with the board (paid once; only a new or changed
// picture is read again) and is what a director gets: QUALITIES to make something new from, never a description to
// rebuild a reference from. moodread.js is the window side.
//   media(items, scope)             → the pictures / clips a read covers
//   itemSig(it) / stale(entry, items) → what changed since the read: { add, gone, board }
//   estimate(items, opts)           → { calls, in, out }: the cost before a run, in tokens
//   lookPrompt(n, it, ctx) / secondPrompt(it) / boardPrompt(board, reads, ctx) → the AI passes
//   parseLook(n, text) / parseSecond(text) / parseBoard(text) → their answers, cleaned
//   check(read, vibe)               → the read's own claims next to the measured numbers: { n, agree, flags }
//   agreement(read)                 → the first read next to the second look: { n, same, differ }
//   directorText(entry, board)      → what three_do brief hands a director (the board read + the inspiration rule)
//   toText(boardRead) / fromText(text) → the owner's "Edit the read" round trip
//   run(boardId, opts, deps)        → the whole flow, the window's pictures / AI / store injected (the test's fake ones)
// Store: kv 'mood-reads' { v: 1, list: [{ id: boardId, name, items: { itemId: read }, board, scope, at, by, second, usage }] }
const MoodReadCore = (() => {
  const req = (f) => { try { return typeof require === 'function' ? require(f) : null; } catch { return null; } };
  const BV = () => (typeof BoardVibe !== 'undefined' ? BoardVibe : req('./board-vibe.js'));
  const STORE = 'mood-reads';
  const MEDIA = ['image', 'gif', 'video', 'web'];
  const FULL = 1568; // the long side a picture is sent at (the most a model takes in)
  const CLIP_FRAMES = 6;
  const cap = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const hash = (v) => { const t = typeof v === 'string' ? v : JSON.stringify(v ?? null); let h = 2166136261; for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const isClip = (it) => it?.type === 'video' || it?.type === 'gif';
  const mine = (it) => it?.footage === true; // the owner's own material: may be used as is (board-ask.js sets it)

  // ---------- which pictures, and what changed ----------
  const media = (items, scope = null) => (items || []).filter((i) => i && MEDIA.includes(i.type) && !i.hidden && (i.src || i.thumb || i.poster) && (!scope || scope.includes(i.id)));
  // a picture is read again when its file or the owner's words on it change (moving it, or marking it "mine", doesn't)
  const itemSig = (it) => hash([it.id, it.type, it.src || '', it.natural || it.vibe?.size || '', it.duration || '', it.like || '', it.note || '']);
  const wordsOf = (items) => (items || []).filter((i) => i && (i.type === 'note' || i.type === 'text') && i.text).map((i) => cap(i.text, 200)).slice(0, 8);
  const boardSig = (items, scope, brief = '') => hash([media(items, scope).map(itemSig).sort(), wordsOf(items), brief || '']);
  function stale(entry, items, brief = '') {
    const list = media(items, entry?.scope || null);
    const reads = entry?.items || {};
    const add = list.filter((it) => !reads[it.id] || reads[it.id].error || reads[it.id].sig !== itemSig(it)).map((it) => it.id);
    const ids = new Set(list.map((it) => it.id));
    const gone = Object.keys(reads).filter((id) => !ids.has(id));
    const outside = entry?.scope ? media(items).filter((it) => !entry.scope.includes(it.id)).length : 0;
    return { add, gone, board: !entry?.board || entry.board.sig !== boardSig(items, entry?.scope || null, brief) || add.length > 0 || gone.length > 0, outside };
  }

  // ---------- the cost, before a run ----------
  const tokensOf = (w, h) => { const k = Math.min(1, FULL / Math.max(w, h, 1)); return Math.round((w * k * h * k) / 750); };
  const PROMPT_IN = 650; const LOOK_OUT = 380; const SECOND_OUT = 200; const BOARD_PER = 260; const BOARD_OUT = 1100;
  function pictureTokens(it) {
    const [w, h] = it.natural || it.vibe?.size || [1280, 1280];
    return tokensOf(w, h) * (isClip(it) ? CLIP_FRAMES : 1);
  }
  // opts: { second: a second look per picture (default true), board: n pictures the board pass covers (default all given) }
  function estimate(items, { second = true, board = null } = {}) {
    const list = items || [];
    const looks = 3 + (second ? 1 : 0);
    let tin = 0; let out = 0;
    for (const it of list) { tin += looks * (pictureTokens(it) + PROMPT_IN) + 2 * 400; out += 3 * LOOK_OUT + (second ? SECOND_OUT : 0); }
    const n = board ?? list.length;
    const pass = n > 0;
    if (pass) { tin += 900 + n * BOARD_PER; out += BOARD_OUT; }
    return { calls: list.length * looks + (pass ? 1 : 0), pictures: list.length, in: Math.round(tin), out: Math.round(out) };
  }
  const kfmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
  const costLine = (e) => `About ${kfmt(e.in)} tokens in and ${kfmt(e.out)} out, in ${e.calls} AI passes over ${e.pictures} picture${e.pictures === 1 ? '' : 's'}`;

  // ---------- the looks at one picture ----------
  const PERSONA = 'You read reference pictures for an art director: precise, concrete, never generic. You describe what a picture FEELS like and how it gets that feeling, so someone can make NEW work in the same mood. Reply with JSON only.';
  const QUALITIES = 'Describe QUALITIES only: never name or describe the subject, people, objects, words, logos or the exact layout (composition is balance, weight, rhythm and empty space, not "a figure on the left"). Be specific: "dusty rose bleeding into slate, the two never touching" beats "muted pink and gray". No filler words like "striking", "beautiful", "aesthetic".';
  const CLAIMS = '"claims": {"key": "low"|"mid"|"high" (overall brightness), "contrast": "soft"|"medium"|"hard", "warmth": "cool"|"neutral"|"warm", "saturation": "near monochrome"|"muted"|"natural"|"saturated"|"neon", "grain": "smooth"|"fine"|"heavy", "detail": "clean"|"some"|"busy"}';
  const kindLine = (it) => (isClip(it) ? `This reference is a ${it.type === 'gif' ? 'gif' : 'clip'}${it.duration ? ` (${Math.round(it.duration * 10) / 10} s)` : ''}: the attached pictures are frames from it, in order. Read them as one moving thing.` : 'The attached picture is one reference, at full size.');
  const ownerLine = (it) => { const o = [it.like && `What the owner likes about it (the strongest signal; read the picture through it): "${cap(it.like, 240)}"`, it.note && `The owner's note on it: "${cap(it.note, 160)}"`].filter(Boolean); return o.length ? o.join('\n') : ''; };
  const LOOK_HEADS = ['Mood read, look 1 of 3: SURFACE.', 'Mood read, look 2 of 3: STRUCTURE.', 'Mood read, look 3 of 3: MEANING.'];
  const SECOND_HEAD = 'Mood read, second opinion.';
  const BOARD_HEAD = 'Mood read, the whole board.';
  // n: 0 surface, 1 structure, 2 meaning (ctx.before: the first two looks' words, for the third)
  function lookPrompt(n, it, ctx = {}) {
    const L = [LOOK_HEADS[n], kindLine(it), ownerLine(it), 'Look closely and slowly: zoom into corners, edges and the darkest and brightest areas before you answer.'].filter(Boolean);
    if (n === 0) {
      L.push('Reply with JSON only:',
        '{"seen": "one literal line on what is in the picture (the owner reads this only to check you looked; it is never passed on)",',
        ' "colour": "the colours and HOW THEY SIT TOGETHER: which carries the frame, which is the accent and how much of it, how they meet (bleed, hard edge, glow, haze), what is absent",',
        ' "light": "where the light comes from and its quality (hard, diffused, practical, glowing from inside), how deep the blacks go, how the highlights behave, the contrast",',
        ' "texture": "the surface and the grain: film grain, noise, compression, print, softness or bite of focus, bloom, halation, scan lines, dust",',
        ` ${CLAIMS}}`, QUALITIES.replace('Describe QUALITIES only', 'Apart from "seen", describe QUALITIES only'));
    } else if (n === 1) {
      L.push('Reply with JSON only:',
        '{"shape": "the shape language: hard or soft, geometric or organic, thin or heavy, repeated or singular; the character of the edges",',
        ' "composition": "balance and weight, symmetry or tension, how full or empty the frame is, how the eye travels, the rhythm of the elements",',
        ' "depth": "the space: flat or deep, layered or one plane, fog or clarity, scale (intimate, monumental), how near the viewer stands",',
        ` "motion": "${isClip(it) ? 'how it moves: speed, smooth or jittery, the rhythm of cuts, what accelerates or holds, how light changes over time' : 'the motion or stillness it implies: frozen, drifting, mid-gesture, vibrating; the rhythm a moving version would have'}"}`, QUALITIES);
    } else {
      if (ctx.before) L.push(`Your first two looks found:\n${ctx.before}`);
      L.push('Reply with JSON only:',
        '{"era": "the era, medium and craft it belongs to or imitates (e.g. late-90s DV, risograph print, 70s sci-fi paperback, early CGI), and how faithfully",',
        ' "echoes": "the movements, genres or traditions it echoes (name styles and movements, not this picture\'s own maker)",',
        ' "feeling": "the feeling, in two precise sentences: the emotional temperature, the tension in it, what it withholds",',
        ' "words": ["4–6 mood words, each earning its place; no near-synonyms"],',
        ' "take": "what to carry into NEW work to get this feeling: 1–2 sentences of qualities and method, with no subject and no layout"}', QUALITIES);
    }
    return L.join('\n');
  }
  // a second, independent look (another AI when there is one): only the feeling and the same fixed claims, to compare
  function secondPrompt(it) {
    return [SECOND_HEAD, kindLine(it), 'Without any other description to lean on, say what this reference feels like.', 'Reply with JSON only:',
      `{"feeling": "two precise sentences", "words": ["4–6 mood words"], ${CLAIMS}}`, QUALITIES].join('\n');
  }

  // ---------- the answers ----------
  const json = (text) => { const t = String(text || ''); const a = t.indexOf('{'); const z = t.lastIndexOf('}'); if (a < 0 || z <= a) return null; try { const j = JSON.parse(t.slice(a, z + 1)); return j && typeof j === 'object' ? j : null; } catch { return null; } };
  const SCALES = {
    key: ['low', 'mid', 'high'], contrast: ['soft', 'medium', 'hard'], warmth: ['cool', 'neutral', 'warm'],
    saturation: ['near monochrome', 'muted', 'natural', 'saturated', 'neon'], grain: ['smooth', 'fine', 'heavy'], detail: ['clean', 'some', 'busy'],
  };
  function claimsOf(c) {
    const out = {};
    for (const [k, scale] of Object.entries(SCALES)) { const v = String(c?.[k] ?? '').toLowerCase().trim().replace(/-key$/, '').replace(/^neon.*$/, 'neon').replace(/ (grain|detail|contrast)$/, ''); if (scale.includes(v)) out[k] = v; }
    return out;
  }
  const strs = (v, n, m) => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? v.split(/[,;]\s*/) : []).map((s) => cap(s, m)).filter(Boolean).slice(0, n);
  const LOOK_KEYS = [['seen', 'colour', 'light', 'texture'], ['shape', 'composition', 'depth', 'motion'], ['era', 'echoes', 'feeling', 'take']];
  function parseLook(n, text) {
    const j = json(text); if (!j) return null;
    const out = {};
    for (const k of LOOK_KEYS[n]) out[k] = cap(j[k] ?? (k === 'colour' ? j.color : ''), k === 'seen' ? 200 : 420);
    if (n === 0) out.claims = claimsOf(j.claims);
    if (n === 2) out.words = strs(j.words, 6, 28);
    return LOOK_KEYS[n].filter((k) => k !== 'seen').some((k) => out[k]) ? out : null;
  }
  function parseSecond(text) { const j = json(text); if (!j) return null; const out = { feeling: cap(j.feeling, 420), words: strs(j.words, 6, 28), claims: claimsOf(j.claims) }; return out.feeling || out.words.length ? out : null; }

  // ---------- accuracy you can see ----------
  // the measured numbers (board-vibe.js, read on this computer) as the same fixed words
  function measured(v) {
    if (!v || v.light == null) return null;
    const W = BV()?.words; if (!W) return null;
    return {
      key: W.keyWord(v.light).replace('-key', ''), contrast: W.contrastWord(v.contrast), warmth: W.warmWord(v.warmth || 0),
      saturation: W.satWord(v.sat).replace('neon-saturated', 'neon'), grain: W.grainWord(v.grain).replace(' grain', ''), detail: W.edgeWord(v.edges).replace(' detail', ''),
    };
  }
  const NUM = { key: 'light', contrast: 'contrast', warmth: 'warmth', saturation: 'sat', grain: 'grain', detail: 'edges' };
  const LABEL = { key: 'brightness', contrast: 'contrast', warmth: 'warmth', saturation: 'saturation', grain: 'grain', detail: 'detail' };
  // one step apart on a scale is a judgement call (the number sits near a border); two or more is a contradiction
  function check(read, vibe) {
    const m = measured(vibe); const c = read?.claims || {};
    if (!m) return { n: 0, agree: 0, near: 0, flags: [], measured: null };
    let n = 0; let agree = 0; let near = 0; const flags = [];
    for (const k of Object.keys(SCALES)) {
      if (!c[k] || !m[k]) continue;
      n += 1;
      const d = Math.abs(SCALES[k].indexOf(c[k]) - SCALES[k].indexOf(m[k]));
      if (d === 0) agree += 1; else if (d === 1) near += 1;
      else flags.push(`${LABEL[k]}: the read says ${c[k]}, the measurement says ${m[k]} (${vibe[NUM[k]]})`);
    }
    return { n, agree, near, flags, measured: m };
  }
  // the first read next to the second look: the fixed claims side by side, and the mood words both used
  function agreement(read) {
    const a = read?.claims || {}; const b = read?.second?.claims || null;
    if (!read?.second) return null;
    let n = 0; let same = 0; const differ = [];
    for (const k of Object.keys(SCALES)) {
      if (!a[k] || !b?.[k]) continue;
      n += 1;
      const d = Math.abs(SCALES[k].indexOf(a[k]) - SCALES[k].indexOf(b[k]));
      if (d === 0) same += 1; else if (d > 1) differ.push(`${LABEL[k]}: ${a[k]} / ${b[k]}`);
    }
    const stem = (w) => String(w).toLowerCase().replace(/[^a-z]/g, '').slice(0, 5);
    const first = new Set((read.words || []).map(stem));
    const shared = (read.second.words || []).filter((w) => first.has(stem(w)));
    return { n, same, differ, shared };
  }

  // ---------- the whole board ----------
  const feelingOf = (r) => r.edit?.feeling || r.feeling || '';
  const takeOf = (r) => r.edit?.take || r.take || '';
  function pictureLine(r, n, it) {
    const bits = [`PICTURE ${n}${isClip(it) ? ' (clip)' : ''}${it?.stamp === '★' || it?.stamp === '♥' ? ' (the owner starred it)' : ''}${mine(it) ? ' (the owner\'s own material)' : ''}:`];
    if (it?.like) bits.push(`the owner likes: "${cap(it.like, 200)}".`);
    if (r.edit?.feeling) bits.push('(the owner corrected this read.)');
    bits.push(`feeling: ${feelingOf(r)}`, r.words?.length ? `words: ${r.words.join(', ')}.` : '', `colour: ${r.colour}`, `light: ${r.light}`, `texture: ${r.texture}`, `shape: ${r.shape}`, `composition: ${r.composition}`, `depth: ${r.depth}`, `motion: ${r.motion}`, `era: ${r.era}`, r.echoes ? `echoes: ${r.echoes}` : '', takeOf(r) ? `take: ${takeOf(r)}` : '');
    return bits.filter(Boolean).join(' ');
  }
  // reads: [{ n, it, read }] (n: the picture's number on the board, kept in the threads)
  function boardPrompt(board, reads, ctx = {}) {
    const L = [BOARD_HEAD, `Moodboard "${cap(board.name || 'Moodboard', 60)}": ${reads.length} reference${reads.length === 1 ? '' : 's'}, each already read closely (below). Now read the BOARD: what its owner is reaching for.`];
    if (board.brief) L.push(`The owner's words for the board: "${cap(board.brief, 400)}"`);
    const words = wordsOf(board.items);
    if (words.length) L.push(`Notes the owner wrote on the board: ${words.map((w) => `"${w}"`).join('; ')}`);
    if (ctx.corrections) L.push(`THE OWNER'S CORRECTIONS (they outrank everything below): "${cap(ctx.corrections, 800)}"`);
    if (ctx.previous) L.push(`The owner edited the previous read of this board to the text below. Keep their wording wherever it still fits the pictures:\n${ctx.previous}`);
    if (ctx.summary) L.push(`Measured on the owner's computer across the board: ${ctx.summary}`);
    L.push('', ...reads.map((x) => pictureLine(x.read, x.n, x.it)), '',
      'Do NOT average the pictures: when they pull in different directions, say so and keep the directions apart as threads. Weigh what the owner likes and starred above the rest.',
      'Reply with JSON only:',
      '{"mood": "the board\'s mood in one precise line (not a list of adjectives)",',
      ' "essence": "3–5 sentences: what this board is reaching for and how it gets there",',
      ' "shared": ["3–6 qualities nearly every picture has, each concrete"],',
      ' "threads": [{"name": "2–4 words", "feel": "one sentence", "pictures": [numbers]} … 1–4 distinct directions inside the board],',
      ' "tensions": ["0–4: where pictures disagree, and which side the owner\'s likes lean to"],',
      ' "not": ["2–5 things this mood is NOT, the near-misses a maker would fall into"],',
      ' "colour": "how colour behaves across the board", "light": "…", "texture": "…", "shape": "…", "space": "composition and depth", "motion": "movement and rhythm", "era": "era, medium and what it echoes",',
      ' "make": ["4–6 principles for making NEW work in this mood: methods and qualities, never a subject or a layout taken from a reference"]}', QUALITIES);
    return L.join('\n');
  }
  const BOARD_LINES = ['colour', 'light', 'texture', 'shape', 'space', 'motion', 'era'];
  function parseBoard(text) {
    const j = json(text); if (!j) return null;
    const out = {
      mood: cap(j.mood, 160), essence: cap(j.essence, 900), shared: strs(j.shared, 6, 200),
      threads: (Array.isArray(j.threads) ? j.threads : []).slice(0, 4).map((t) => ({ name: cap(t?.name, 40), feel: cap(t?.feel, 260), pictures: (Array.isArray(t?.pictures) ? t.pictures : []).map(Number).filter((x) => Number.isFinite(x) && x > 0).slice(0, 60) })).filter((t) => t.name || t.feel),
      tensions: strs(j.tensions, 4, 260), not: strs(j.not, 5, 200), make: strs(j.make, 6, 260),
    };
    for (const k of BOARD_LINES) out[k] = cap(j[k] ?? (k === 'colour' ? j.color : ''), 360);
    return out.mood && (out.essence || out.shared.length) ? out : null;
  }

  // ---------- the owner's edit: the board read as text, and back ----------
  function toText(b) {
    if (!b) return '';
    return [`Mood: ${b.mood || ''}`, `Essence: ${b.essence || ''}`,
      'Shared:', ...(b.shared || []).map((s) => `- ${s}`),
      'Threads:', ...(b.threads || []).map((t) => `- ${t.name}: ${t.feel}${t.pictures?.length ? ` [${t.pictures.join(', ')}]` : ''}`),
      'Tensions:', ...(b.tensions || []).map((s) => `- ${s}`), 'Not:', ...(b.not || []).map((s) => `- ${s}`),
      ...BOARD_LINES.map((k) => `${k[0].toUpperCase()}${k.slice(1)}: ${b[k] || ''}`),
      'Make:', ...(b.make || []).map((s) => `- ${s}`)].join('\n');
  }
  function fromText(text) {
    const b = { mood: '', essence: '', shared: [], threads: [], tensions: [], not: [], make: [] };
    for (const k of BOARD_LINES) b[k] = '';
    let sec = null;
    for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
      const line = raw.trim(); if (!line) continue;
      const m = /^(mood|essence|shared|threads|tensions|not|make|colou?r|light|texture|shape|space|motion|era)\s*:\s*(.*)$/i.exec(line);
      if (m && !/^[-•*]/.test(line)) {
        const k = m[1].toLowerCase().replace(/^color$/, 'colour'); const v = m[2].trim();
        if (['shared', 'threads', 'tensions', 'not', 'make'].includes(k)) { sec = k; if (v) add(k, v); } else { b[k] = cap(v, k === 'essence' ? 900 : 360); sec = null; }
        continue;
      }
      if (sec) add(sec, line.replace(/^[-•*]\s*|^\d+[.)]\s*/, ''));
    }
    function add(k, v) {
      if (!v) return;
      if (k !== 'threads') { b[k].push(cap(v, 260)); return; }
      const pics = (/\[([\d,\s]+)\]\s*$/.exec(v) || [])[1];
      const body = v.replace(/\[[\d,\s]+\]\s*$/, '').trim(); const i = body.indexOf(':');
      b.threads.push({ name: cap(i > 0 && i < 44 ? body.slice(0, i) : '', 40), feel: cap(i > 0 && i < 44 ? body.slice(i + 1) : body, 260), pictures: pics ? pics.split(',').map((x) => Number(x.trim())).filter(Boolean) : [] });
    }
    return b.mood ? b : null; // (a read without its mood line isn't one: the edit is refused, the old one kept)
  }

  // ---------- what a director gets (three_do brief) ----------
  const RULE = 'INSPIRATION, NOT RE-CREATION: this read is the mood to work in. Make something NEW in it: your own subject, forms and layout. Never rebuild a reference\'s subject, layout or recognisable elements, and never put a reference\'s file in the scene (refTexture, a footage layer, a fill).';
  const mineLine = (items) => { const own = (items || []).filter((it) => mine(it) && MEDIA.includes(it.type)).map((it) => `"${cap(it.title || it.file || it.type, 48)}"`); return own.length ? `The one exception, the owner's own material (marked "mine" on the board; may be used as is when it serves the piece): ${own.slice(0, 12).join(', ')}.` : 'No reference on this board is marked as the owner\'s own material, so none goes into the scene as is unless the owner asks for that file in their message.'; };
  function directorText(entry, board = {}) {
    const b = entry?.board;
    if (!b) return '';
    const st = board.items ? stale(entry, board.items, board.brief) : null;
    const n = Object.values(entry.items || {}).filter((r) => r && !r.error).length;
    const head = `MOOD READ of the moodboard "${cap(entry.name || board.name || 'Moodboard', 60)}" (${n} reference${n === 1 ? '' : 's'} read closely at full size${entry.scope ? ', the owner\'s pick from the board' : ''}${b.at ? `, ${new Date(b.at).toISOString().slice(0, 10)}` : ''}${b.edited ? '; the owner edited it' : ''})${st && (st.add.length || st.gone.length) ? `. Since then the board changed (${[st.add.length && `${st.add.length} new or changed`, st.gone.length && `${st.gone.length} removed`].filter(Boolean).join(', ')}): the read doesn't cover that yet` : ''}`;
    const L = [head, `Mood: ${b.mood}`];
    if (entry.corrections) L.push(`The owner's own words on it (they outrank the rest): "${cap(entry.corrections, 800)}"`);
    if (b.essence) L.push(b.essence);
    if (b.shared?.length) L.push('What the references share:', ...b.shared.map((s) => `- ${s}`));
    if (b.threads?.length) L.push('Threads inside the board (directions, not pictures to rebuild):', ...b.threads.map((t) => `- ${t.name}: ${t.feel}`));
    if (b.tensions?.length) L.push('Where the references disagree:', ...b.tensions.map((s) => `- ${s}`));
    for (const k of BOARD_LINES) if (b[k]) L.push(`${k[0].toUpperCase()}${k.slice(1)}: ${b[k]}`);
    if (b.not?.length) L.push('This mood is NOT:', ...b.not.map((s) => `- ${s}`));
    if (b.make?.length) L.push('To make new work in this mood:', ...b.make.map((s) => `- ${s}`));
    L.push('', RULE, mineLine(board.items));
    return L.join('\n');
  }
  // the few lines the project brief's own AI pass reads (projectbrief-core.js): the read in short + the same rule
  function briefLines(entry, board = {}) {
    const b = entry?.board; if (!b) return [];
    return [`Mood read of the moodboard (every picture read closely; trust it over the measured numbers): ${b.mood}`, b.essence && `  ${cap(b.essence, 500)}`,
      b.threads?.length && `  threads: ${b.threads.map((t) => `${t.name} (${cap(t.feel, 90)})`).join('; ')}`, b.not?.length && `  it is not: ${b.not.map((s) => cap(s, 70)).join('; ')}`,
      b.make?.length && `  to make new work in it: ${b.make.map((s) => cap(s, 110)).join('; ')}`,
      `  References are inspiration: no step may import, trace or rebuild a reference. ${mineLine(board.items)}`].filter(Boolean);
  }

  // ---------- the store ----------
  const empty = () => ({ v: 1, list: [] });
  const norm = (d) => (d && d.v === 1 && Array.isArray(d.list) ? { ...d, list: d.list.filter((e) => e && typeof e.id === 'string') } : empty());
  const entry = (d, id) => norm(d).list.find((e) => e.id === id) || null;
  function put(d, id, patch) {
    const n = norm(d); const i = n.list.findIndex((e) => e.id === id);
    const e = { ...(i >= 0 ? n.list[i] : { id, items: {} }), ...patch, id };
    const list = n.list.slice(); if (i >= 0) list[i] = e; else list.push(e);
    return { ...n, list };
  }
  const addUsage = (u, r) => { const x = r?.usage || {}; return { in: (u?.in || 0) + (x.input_tokens || x.input || x.in || 0) + (x.cache_read_input_tokens || 0) + (x.cache_creation_input_tokens || 0), out: (u?.out || 0) + (x.output_tokens || x.output || x.out || 0), calls: (u?.calls || 0) + 1 }; };

  // ---------- the whole flow ----------
  // deps: { board(id) → { id, name, items, brief }, pictures(it) → [paths] (full size; a clip: its frames),
  //         ask({ text, images, second }) → { ok, text, usage, by, error }, read() → the store, write(store), now(),
  //         summary(items) → the measured board line | '', progress({ i, n, title, step }), stopped() → bool }
  // opts: { scope: [item ids] | null (null: the whole board; undefined: as the last read), second (default true),
  //         force: read every picture again }. Returns { entry, read, failed, usage, stopped }.
  async function run(boardId, opts = {}, deps = {}) {
    if (!boardId) throw new Error('No board.');
    const now = () => (deps.now ? deps.now() : Date.now());
    const b = await deps.board(boardId);
    if (!b) throw new Error('That board isn\'t here.');
    let store = await deps.read();
    const was = entry(store, boardId);
    const scope = opts.scope === undefined ? (was?.scope || null) : (opts.scope && opts.scope.length ? opts.scope.slice() : null);
    const second = opts.second !== false;
    const list = media(b.items, scope);
    if (!list.length) throw new Error('This board has no pictures or clips to read yet.');
    const num = new Map(media(b.items).map((it, i) => [it.id, i + 1])); // a picture's number on the board
    const items = {};
    for (const it of list) if (was?.items?.[it.id]) items[it.id] = was.items[it.id];
    const todo = list.filter((it) => opts.force || !items[it.id] || items[it.id].error || items[it.id].sig !== itemSig(it));
    let usage = { in: 0, out: 0, calls: 0 }; const failed = []; let by = was?.by || null; let secondBy = was?.second || null; let stopped = false;
    const save = async (patch = {}) => { store = put(await deps.read(), boardId, { name: b.name, items: { ...items }, scope, by, second: secondBy, ...patch }); await deps.write(store); };
    const ask = async (rq) => { const r = await deps.ask(rq); usage = addUsage(usage, r); if (!r?.ok) throw new Error(r?.error || 'The AI did not answer.'); return r; };
    for (const [i, it] of todo.entries()) {
      if (deps.stopped?.()) { stopped = true; break; }
      const title = it.title || `Picture ${num.get(it.id)}`;
      try {
        deps.progress?.({ i, n: todo.length, title, step: 'opening it at full size' });
        const images = await deps.pictures(it);
        if (!images?.length) throw new Error('its file could not be opened');
        const read = { sig: itemSig(it), frames: images.length, edit: items[it.id]?.edit || undefined };
        const look = async (n, before = '') => {
          const r = await ask({ text: lookPrompt(n, it, { before }), images, persona: PERSONA });
          const got = parseLook(n, r.text);
          if (!got) throw new Error(`look ${n + 1} came back unreadable`);
          Object.assign(read, got); by = r.by || by;
          return got;
        };
        // the first two looks and the second opinion don't lean on each other: asked together (a read is long enough)
        deps.progress?.({ i, n: todo.length, title, step: `surface and structure${second ? ', and a second, independent look' : ''}` });
        const other = second ? ask({ text: secondPrompt(it), images, persona: PERSONA, second: true }).then((r) => { const got = parseSecond(r.text); if (got) { read.second = { ...got, by: r.by || null }; secondBy = r.by || secondBy; } else read.secondError = 'it came back unreadable'; }).catch((err) => { read.secondError = cap(err.message, 120); }) : null;
        const [l0, l1] = await Promise.all([look(0), look(1)]).catch(async (err) => { await other; throw err; });
        deps.progress?.({ i, n: todo.length, title, step: 'meaning: era, echoes, feeling' });
        await look(2, ['colour', 'light', 'texture', 'shape', 'composition', 'depth', 'motion'].map((k) => `${k}: ${{ ...l0, ...l1 }[k] || ''}`).join('\n'));
        await other;
        read.at = now();
        items[it.id] = read;
      } catch (err) {
        failed.push(`${title}: ${err.message}`);
        if (!items[it.id] || items[it.id].sig !== itemSig(it)) items[it.id] = { sig: itemSig(it), error: cap(err.message, 160), at: now() };
      }
      await save(); // after every picture: a stopped or broken run keeps what it paid for
    }
    const good = list.filter((it) => items[it.id] && !items[it.id].error);
    let board = was?.board || null;
    const sig = boardSig(b.items, scope, b.brief);
    if (!stopped && good.length && (opts.force || todo.length || !board || board.sig !== sig || Object.keys(was?.items || {}).some((id) => !items[id]))) {
      deps.progress?.({ i: todo.length, n: todo.length, title: b.name, step: 'the whole board: what the pictures share, where they disagree' });
      try {
        const r = await ask({ text: boardPrompt(b, good.map((it) => ({ n: num.get(it.id), it, read: items[it.id] })), { corrections: was?.corrections || '', previous: board?.edited ? toText(board) : '', summary: deps.summary ? deps.summary(list) : '' }), images: [], persona: PERSONA });
        const got = parseBoard(r.text);
        if (!got) throw new Error('the board pass came back unreadable');
        board = { ...got, sig, at: now(), pictures: good.length }; by = r.by || by;
      } catch (err) { failed.push(`the whole board: ${err.message}`); }
    }
    const total = { in: (was?.usage?.in || 0) + usage.in, out: (was?.usage?.out || 0) + usage.out, calls: (was?.usage?.calls || 0) + usage.calls };
    await save({ board, at: now(), usage: total });
    return { entry: entry(store, boardId), read: todo.length - failed.filter((f) => !f.startsWith('the whole board')).length, failed, usage, stopped };
  }

  const api = { STORE, MEDIA, FULL, CLIP_FRAMES, PERSONA, RULE, LOOK_HEADS, SECOND_HEAD, BOARD_HEAD, SCALES, BOARD_LINES, media, mine, isClip, itemSig, boardSig, stale, tokensOf, pictureTokens, estimate, costLine, kfmt, lookPrompt, secondPrompt, boardPrompt, parseLook, parseSecond, parseBoard, measured, check, agreement, toText, fromText, directorText, briefLines, mineLine, norm, entry, put, run, hash, cap };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
