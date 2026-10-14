// 🔎 Search core (round 36, labsearch; shared since round 37, appsearch): the ranking, without the DOM (Node-tested:
// dev/labsearch-test.js, dev/appsearch-test.js). Lab search (tools/three-search.js) and the app-wide Find anything
// (Ctrl/⌘+K, appsearch.js) both rank with it; each brings its own words (a vocabulary: synonym groups, phrases, how
// much each kind of row leans ahead), the engine is the same:
//   · plain words: "make it brighter" (little words dropped), "glow" → bloom, "slow motion" → playback speed ½,
//     "vertical video" → ▦ All formats + 9:16 (the Lab's SYN groups and PHRASES below; the app's in appsearch-data.js)
//   · typos: one wrong / missing / extra / swapped letter in words of 4+ letters, two in words of 7+ ("blom", "glwo")
//   · prefixes while typing ("partic" → particles)
// Fast on the whole index: an inverted index (word → items), a sorted word list for prefixes, word lookups memoised
// per index, so a keystroke scores only the items that share a word with the query (well under a millisecond on
// ~3 000 items; the UI measures every keystroke).
//   LabSearchCore.build([{ id, kind, label, hint?, path?, tags?, boost? }], { vocab? }) → index (the Lab's words by default)
//   LabSearchCore.search(index, 'words', { limit, recent: Map(id → rank) }) → [{ item, score }]
//   LabSearchCore.vocab({ syn: ['word word…'], phrases: [['said', 'meant']], kind: { kind: lean }, base? }) → a vocabulary
// SearchCore is the same object (the name the app-wide search uses).
const LabSearchCore = (() => {
  // ---------- words ----------
  const STOP = new Set('a an the it its it s this that these my me i im to of in on for with and or please let lets want wanna can could would you your some be is are do does how what where which there here up just so very really thing things stuff make get turn more bit little much lot'.split(' '));
  const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/×/g, 'x').replace(/½/g, ' half ').replace(/¼/g, ' quarter ').replace(/[’']/g, '');
  // light stemming, the same on both sides: plurals, -ing, -er / -est on longer words ("brighter" → bright)
  function stem(w) {
    if (/^\d/.test(w) || w.length < 4) return w;
    if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
    if (/(ss|us|is)$/.test(w)) return w;
    if (/(ch|sh|x)es$/.test(w)) return w.slice(0, -2);
    if (w.endsWith('s')) return w.slice(0, -1);
    if (w.length >= 6 && w.endsWith('ing')) return w.slice(0, -3);
    if (w.length >= 6 && w.endsWith('est')) return w.slice(0, -3);
    if (w.length >= 6 && w.endsWith('er')) return w.slice(0, -2);
    return w;
  }
  // "9:16", "1080x1920", "r160" stay one word
  const words = (s) => (fold(s).match(/[a-z0-9]+(?::[0-9]+)?/g) || []).map(stem);

  // ---------- plain words → the Lab's words ----------
  // groups of words that mean the same thing here (each word finds the others, a little lower)
  const SYN = [
    'glow bloom glare halo shine radiant neon luminous',
    'blur soft defocus dof bokeh hazy',
    'grain noise film analog grainy',
    'glitch datamosh corrupt broken distort jitter',
    'color colour palette recolor hue tint colors',
    'bright brightness exposure lighter light lift luminance gain brighten',
    'dark darker dim shadow darken crush',
    'fast faster quick speed tempo hurry',
    'slow slower slowdown slowmo calm gentle',
    'vertical portrait tall 9:16 tiktok reels shorts story',
    'horizontal landscape widescreen wide 16:9 youtube',
    'square 1:1 instagram',
    'render export mp4 movie video file output',
    'music song audio sound track tune',
    'react reactive follow audioreactive pulse',
    'undo revert takeback',
    'delete remove trash erase',
    'copy duplicate clone',
    'rename name',
    'hide invisible hidden',
    'freeze pause still stop',
    'screenshot snapshot photo picture capture image still',
    'fullscreen present show presentation',
    'template starter starting preset',
    'random surprise shuffle randomize dice luck',
    'fix repair doctor broken error problem wrong',
    'text title type typography lyric word font letters',
    'particle spark dust confetti embers',
    'camera webcam tracking',
    '3d model glb gltf mesh object',
    'shader glsl fragment',
    'loop seamless repeat cycle',
    'variation version alternative take option',
    'share pack send',
    'key shortcut hotkey keyboard keybind',
    'help guide how explain tutorial',
    'grade lut cinematic grading',
    'vhs retro 80s crt tape',
    'kaleidoscope kaleido mirror symmetry',
    'pixel pixelate mosaic 8bit',
    'director ai claude astra chat assistant',
    'stage vj projector second screen output',
    'slider knob control parameter param setting',
    'layer layers',
    'size aspect ratio resolution format frame',
    'bpm tempo beat',
    'cue marker',
    'intro opener reveal logo',
    'scene sketch project',
  ];
  // a few phrases that say what they want in other words (all of its words in the query, in order)
  const PHRASES = [
    ['slow motion', 'playback speed half slow'], ['slow mo', 'playback speed half slow'], ['half speed', 'playback speed half'],
    ['vertical video', 'all formats 9:16 vertical'], ['tiktok', 'all formats 9:16'], ['instagram story', 'all formats 9:16'], ['reels', 'all formats 9:16'],
    ['square video', 'all formats 1:1'], ['youtube', 'all formats 16:9'], ['every format', 'all formats'], ['all sizes', 'all formats'],
    ['make it pop', 'polish finished glow'], ['look finished', 'make it look finished polish'], ['look better', 'make it look finished polish'], ['look good', 'make it look finished polish'],
    ['black screen', 'fix my scene restart'], ['nothing shows', 'fix my scene restart'], ['doesnt work', 'fix my scene'], ['not working', 'fix my scene'],
    ['start over', 'restart from scratch'], ['from scratch', 'restart from scratch'],
    ['react to the music', 'make it react music'], ['audio reactive', 'make it react music'], ['music reactive', 'make it react music'], ['beat sync', 'make it react music beat'],
    ['depth of field', 'blur dof bokeh'], ['color grade', 'grade'], ['color grading', 'grade'],
    ['new scene', 'new from template gallery'], ['new sketch', 'new from template gallery'], ['start from', 'gallery template starting'],
    ['go back', 'undo'], ['undo that', 'undo'],
    ['more light', 'brightness exposure adjust'], ['less light', 'brightness exposure adjust dark'], ['brighter', 'brightness exposure adjust'], ['darker', 'brightness exposure adjust dark'],
    ['second screen', 'stage window'], ['save sliders', 'save into the code sliders'],
  ];
  // how much each kind of the Lab's rows leans ahead among equals
  const KIND = { action: 0.18, layer: 0.22, fx: 0.08, slider: 0.1, look: 0.1, template: 0.14, gallery: 0.04, scene: 0.06, help: -0.05, key: -0.08, ask: -9 };
  // (round 37, appsearch) a vocabulary: its synonym groups (as words), its phrases ([said, meant] as words), each word's
  // synonyms, its kinds' leans; `base` adds another vocabulary's groups and phrases under these
  function vocab({ syn = [], phrases = [], kind = {}, base = null } = {}) {
    const groups = [...(base?.groups || []), ...syn.map((g) => [...new Set(words(g))])];
    const ph = [...phrases.map(([p, e]) => [words(p).filter((w) => !STOP.has(w)), [...new Set(words(e))]]), ...(base?.phrases || [])];
    const synOf = new Map();
    for (const g of groups) for (const w of g) synOf.set(w, [...new Set([...(synOf.get(w) || []), ...g.filter((x) => x !== w)])]);
    return { groups, phrases: ph, synOf, kind: { ...(base?.kind || {}), ...kind } };
  }
  const LAB = vocab({ syn: SYN, phrases: PHRASES, kind: KIND });

  // ---------- typos ----------
  // optimal string alignment distance (a swap counts once), stopped as soon as it can't be ≤ max
  function dist(a, b, max) {
    const la = a.length; const lb = b.length;
    if (Math.abs(la - lb) > max) return max + 1;
    let p2 = null; let p1 = Array.from({ length: lb + 1 }, (_, j) => j);
    for (let i = 1; i <= la; i += 1) {
      const cur = [i]; let low = i;
      for (let j = 1; j <= lb; j += 1) {
        let v = Math.min(p1[j] + 1, cur[j - 1] + 1, p1[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
        cur.push(v); if (v < low) low = v;
      }
      if (low > max) return max + 1;
      p2 = p1; p1 = cur;
    }
    return p1[lb];
  }
  const allowed = (w) => (w.length >= 7 ? 2 : w.length >= 4 ? 1 : 0);

  // ---------- the index ----------
  const FIELDS = [['label', 1], ['tags', 0.6], ['hint', 0.5], ['path', 0.4]];
  function build(items, { vocab: V = LAB } = {}) {
    const list = items.filter((it) => it && it.label);
    const post = new Map(); // word → Map(item index → best field weight)
    const labels = []; const labelLen = [];
    list.forEach((it, i) => {
      for (const [f, w] of FIELDS) {
        for (const t of words(it[f])) {
          let m = post.get(t);
          if (!m) { m = new Map(); post.set(t, m); }
          if ((m.get(i) || 0) < w) m.set(i, w);
        }
      }
      const lw = words(it.label);
      labels.push(lw.join(' '));
      labelLen.push(lw.length);
    });
    const vocab = [...post.keys()].sort();
    return { items: list, post, vocab, labels, labelLen, memo: new Map(), V };
  }
  // the index words a query word reaches: [[index word, quality]] (exact 1, prefix .8 / .7, a typo .6 / .45)
  // (a synonym or a phrase's word: `exact`, the word itself only, so "halo" never becomes "half")
  function reach(ix, q, last, exact = false) {
    if (exact) return ix.post.has(q) ? [[q, 1]] : [];
    const key = `${q}|${last ? 1 : 0}`;
    if (ix.memo.has(key)) return ix.memo.get(key);
    const out = new Map();
    if (ix.post.has(q)) out.set(q, 1);
    // prefixes: the word being typed (the last one) from 1 letter, the others from 3
    if (q.length >= (last ? 1 : 3)) {
      let lo = 0; let hi = ix.vocab.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (ix.vocab[mid] < q) lo = mid + 1; else hi = mid; }
      for (let i = lo; i < ix.vocab.length && ix.vocab[i].startsWith(q); i += 1) if (!out.has(ix.vocab[i])) out.set(ix.vocab[i], q.length >= 3 ? 0.8 : 0.7);
    }
    const max = allowed(q);
    if (max) {
      for (const t of ix.vocab) {
        if (out.has(t) || Math.abs(t.length - q.length) > max || (t[0] !== q[0] && !(t[0] === q[1] && t[1] === q[0]))) continue; // the first letter is rarely the typo
        const d = dist(q, t, max);
        if (d <= max) out.set(t, d === 1 ? 0.6 : 0.45);
        // a typo in the word being typed: "partcl" → particle
        else if (last && t.length > q.length && dist(q, t.slice(0, q.length), 1) <= 1 && q.length >= 4) out.set(t, 0.5);
      }
    }
    const r = [...out];
    if (ix.memo.size > 4000) ix.memo.clear();
    ix.memo.set(key, r);
    return r;
  }
  // what the query asks for: terms, each a list of alternatives [[word, weight]]; `need`: it must match
  function parse(text, V = LAB) {
    let ws = words(text);
    const kept = ws.filter((w) => !STOP.has(w));
    if (kept.length) ws = kept;
    const terms = [];
    const used = new Set();
    for (const [p, e] of V.phrases) {
      if (!p.length) continue;
      for (let i = 0; i + p.length <= ws.length; i += 1) {
        if (p.every((w, k) => ws[i + k] === w) && ![...p.keys()].some((k) => used.has(i + k))) {
          p.forEach((_, k) => used.add(i + k));
          terms.push({ alts: [...e.map((w) => [w, 0.9]), ...p.map((w) => [w, 0.7])], phrase: true, need: true, words: p });
        }
      }
    }
    ws.forEach((w, i) => {
      if (used.has(i)) return;
      terms.push({ alts: [[w, 1], ...(V.synOf.get(w) || []).map((s) => [s, 0.8])], need: true, last: i === ws.length - 1, words: [w] });
    });
    return terms;
  }
  function search(ix, text, { limit = 40, recent = null } = {}) {
    const V = ix.V || LAB;
    const terms = parse(text, V);
    if (!terms.length) return [];
    const n = ix.items.length;
    const total = new Float32Array(n);
    const hits = new Uint8Array(n);
    const inLabel = new Uint8Array(n); // terms found in the item's name (its name all found: a strong hint it's the one)
    const touched = new Set();
    for (const term of terms) {
      const got = new Map(); // item → this term's score
      const lab = new Set();
      for (const [w, ww] of term.alts) {
        for (const [t, q] of reach(ix, w, term.last && ww === 1, ww < 1)) {
          const m = ix.post.get(t);
          if (!m) continue;
          const one = w.length < 2; // a single letter: names only (fast, and what you mean)
          for (const [i, f] of m) {
            if (one && f < 1) continue;
            const s = q * ww * f;
            if (f === 1) lab.add(i);
            // a phrase adds up its words (all formats + 9:16 beats either alone); a plain word keeps its best
            got.set(i, term.phrase ? (got.get(i) || 0) + s : Math.max(got.get(i) || 0, s));
          }
        }
      }
      for (const [i, s] of got) { total[i] += Math.min(term.phrase ? 2.2 : 1, s); hits[i] += 1; touched.add(i); }
      for (const i of lab) inLabel[i] += term.phrase ? term.words.length : 1;
    }
    const qFlat = words(text).filter((w) => !STOP.has(w)).join(' ') || words(text).join(' ');
    const out = [];
    // one term may be missed when there are 3 or more (plain sentences), never with fewer
    const slack = terms.length >= 3 ? 1 : 0;
    for (const i of touched) {
      const missed = terms.length - hits[i];
      if (missed > slack) continue;
      const it = ix.items[i];
      let s = total[i] - missed * 0.9;
      const lab = ix.labels[i];
      if (lab === qFlat) s += 1;
      else if (qFlat && lab.startsWith(qFlat)) s += 0.6;
      else if (qFlat.length > 2 && lab.includes(qFlat)) s += 0.3;
      s += 0.5 * Math.min(1, inLabel[i] / Math.max(1, ix.labelLen[i])); // "Glow" for glwo beats "Glow amount"
      s += V.kind[it.kind] || 0;
      s += Math.max(-0.5, Math.min(0.4, Number(it.boost) || 0));
      if (recent?.has(it.id)) s += 0.35 - Math.min(0.3, recent.get(it.id) * 0.03);
      if (it.danger) s -= 0.25;
      out.push({ item: it, score: Math.round(s * 1000) / 1000 });
    }
    out.sort((a, b) => b.score - a.score || a.item.label.length - b.item.label.length);
    return out.slice(0, limit);
  }

  // ---------- menus → rows ----------
  // (round 37, appsearch; was Lab search's own walk) a showMenu list ({ label, hint, key, items, action }) or a
  // ThreeTweaks.menu / popMenu list ([label, hint, fn | rows, checked]) walked into rows { id, kind: 'action', label,
  // hint, path, sub?, checked?, danger?, run }. Nothing is copied: a row runs the menu's own function (`run(fn)` wraps
  // the call), a submenu is a row too (`sub(label, items, tuple)` opens it). The same row in two menus is listed once;
  // short generic labels ("9:16", "Off") once per submenu. `seen` is shared across calls (one list from many menus).
  const clean = (x) => String(x ?? '').replace(/^✓\s*/, '').trim();
  const SKIP = new Set(['‹ back', 'More…', 'Customise this…']);
  function menuRows(list, path, out, seen, { sub, run, max = 1500 } = {}, depth = 0) {
    if (depth > 4 || out.length > max) return out;
    let arr;
    try { arr = typeof list === 'function' ? list() : list; } catch { return out; }
    if (!Array.isArray(arr)) return out; // (a submenu built later, e.g. from a promise: not listed)
    for (const it of arr) {
      if (!it || typeof it === 'string') continue;
      let label; let hint; let items = null; let fn = null; let checked = false; let danger = false; let key = '';
      const tuple = Array.isArray(it);
      if (tuple) {
        [label, hint] = it; checked = Boolean(it[3]);
        if (Array.isArray(it[2])) items = it[2]; else if (typeof it[2] === 'function') fn = it[2];
      } else {
        if (it.back || it.disabled || it.sep) continue;
        ({ label, hint, key = '' } = it); checked = Boolean(it.checked); danger = Boolean(it.danger);
        if (it.items) items = it.items; else if (typeof it.action === 'function') fn = it.action;
      }
      label = clean(label);
      if (!label || SKIP.has(label)) { if (items) menuRows(items, path, out, seen, { sub, run, max }, depth + 1); continue; }
      const bare = fold(label.replace(/…$/, '')).trim();
      const k = words(bare).length >= 2 || bare.length >= 10 ? `|${bare}` : `${fold(path.at(-1) || '')}|${bare}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const where = path.join(' › ');
      if (items) {
        out.push({ id: `a:${where}›${label}`, kind: 'action', label, hint: String(hint || ''), path: where, sub: true, run: () => sub?.(label, items, tuple) });
        menuRows(items, [...path, label], out, seen, { sub, run, max }, depth + 1);
      } else if (fn) {
        out.push({ id: `a:${where}›${label}`, kind: 'action', label, hint: [hint, key].filter(Boolean).join(' · '), path: where, checked, danger, run: run ? () => run(fn) : () => fn() });
      }
    }
    return out;
  }

  // ---------- help: short answers to "how do I…", each pointing at where it lives ----------
  // { title, text, tags, go: the label of the Lab row to run from the answer (optional) }
  const HELP = [
    { title: 'How do I make it react to the music?', tags: 'music react beat kick bass audio reactive sync', text: 'Right-click the preview › ✦ More › ♪ Music › ✦ Make it react to the music. The kick, bass and loudness move the right sliders. A layer\'s right-click does it for that layer only. "Stop everything following the sound" undoes it.', go: '✦ Make it react to the music' },
    { title: 'How do I change the frame size (9:16, 1:1…)?', tags: 'frame size vertical square format aspect 9:16 16:9 4:5 1:1 tiktok instagram', text: 'Right-click the preview › Frame size, or Shift+1…5 (Fit, 9:16, 16:9, 4:5, 1:1). For every size at once, reframed: ▦ All formats (toolbar ⋯).', go: '▦ All formats' },
    { title: 'How do I add an effect (glow, grain, glitch…)?', tags: 'effect filter glow bloom grain glitch vhs ascii add', text: 'Layers › ＋ Layer (or X in the Lab) opens the effects picker: filters change every layer below them. Or type the effect\'s name here: Enter adds it above the selected layer.' },
    { title: 'How do I save my sliders?', tags: 'save sliders keep values code', text: 'Sliders › Save (Ctrl/⌘+S) writes the values into the code. Ctrl/⌘+Shift+S keeps them as a look you can switch back to.' },
    { title: 'How do I try random versions?', tags: 'shuffle random variations surprise', text: 'R shuffles the selected layer\'s sliders (Shift+R: the one before). 🎲 Variations (toolbar ⋯) shows 6 takes of the whole scene to click, no tokens.', go: '🎲 Variations' },
    { title: 'How do I render a video?', tags: 'render export video mp4 file', text: 'Right-click the preview › ⇪ Export. For 16:9, 9:16, 1:1 and 4:5 in one go: ▦ All formats.' },
    { title: 'How do I start from something?', tags: 'new scene gallery template start starting point', text: 'Sketch ▾ › New… opens the gallery of starting points (by mood, your scenes, history). Your own: 📐 My templates.' },
    { title: 'How do I make a template of this scene?', tags: 'template save reuse my templates form', text: '✦ More › 📐 My templates › Save as my template…: its words, colors, pictures and sliders become a short form.', go: 'Save as my template…' },
    { title: 'Something looks wrong or black', tags: 'fix broken black error doctor problem restart', text: '🩺 Fix my scene (✦ More, toolbar ⋯) checks the scene for free and fixes what it can in one click. ⟲ Restart from scratch (Ctrl/⌘+Shift+Enter) reloads the preview.', go: '🩺 Fix my scene' },
    { title: 'How do I freeze a frame?', tags: 'freeze pause still frame', text: 'F (or \\) freezes the picture; . steps one frame while frozen. Right-click the preview › Freeze too.' },
    { title: 'How do I present full screen or on a second screen?', tags: 'present fullscreen stage window second screen projector vj', text: 'P presents the preview full screen; Esc leaves. The Stage window (right-click › View) puts it on a second monitor.' },
    { title: 'How do I tap the tempo?', tags: 'tap tempo bpm beat grid', text: 'Press T on the beat while the song plays (Shift+T: this tap is the 1). Auto bars and the grid follow.' },
    { title: 'How do I ask the director?', tags: 'director ai claude astra ask chat', text: 'The docked chat next to the Lab is the Three Director: describe what you want in plain words. Toolbar ⋯ › Director shows what it is making and undoes its last edit.' },
    { title: 'How do I loop it perfectly?', tags: 'loop seamless gif repeat', text: '✦ More › ⇪ Make › ∞ Make it loop finds a seamless loop.' },
    { title: 'How do I share a scene?', tags: 'share pack send file hearthpack', text: '✦ More › ⇪ Share saves the scene and every file it uses as one .hearthpack.' },
    { title: 'What are the Lab\'s keys?', tags: 'keys shortcuts keyboard hotkeys', text: '? in the Lab (or the keys button bottom left) lists them; every key also has a menu row.', go: 'Lab keys' },
  ];
  return { build, search, parse, words, stem, dist, fold, vocab, menuRows, LAB, SYN: LAB.groups, PHRASES: LAB.phrases, HELP, STOP };
})();
const SearchCore = LabSearchCore; // (round 37, appsearch) the shared name
if (typeof module !== 'undefined') module.exports = LabSearchCore;
