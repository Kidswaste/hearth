// Makes (round 11), the pure part (no DOM; loads in Node for dev/makes-test.js). A "make" is one thing Hearth creates
// for the owner, however it started: a planned make with rooms (a Lab chat, a Video chat, a board frame… made ahead
// of time), a /dispatch comp and its parts, an /intro video project, a jam, a Commands-page or Flows run that makes
// something, a render or a recording. Every make has ONE identity (a name, a color and a mark from the same palette
// as the chats' scenes) that everything it owns shows: its rooms' titles ("<Name> · Lab", "<Name> · Video"…), their
// marks and colors, their Lab scenes (named after the room), file names of what is recorded in it, its board frame,
// its cards. The consistency rules live here, in one place:
//   identity(seed)        → { ci, gi, color, colorName, glyph }: the same seed gives the same look everywhere
//   nameFor(text) / genName(seed)  → the make's name (words from the idea, else "<Color> <Thing>")
//   roomTitle(make, part) → "<Name> · Lab", "<Name> · Lab 2/3 · red pulse"
//   fileBase(make, part)  → "Neon Tunnel · Lab" (file-safe on Mac and Windows), slug(make) → "neon-tunnel"
//   parsePlan(text)       → { name, auto, parts: [{ kind, brief }] }  ("a three.js animation that cuts into a video" → Lab, Video)
//   create / rename / setPart / progress / dismiss / restore / statusOf / pctOf / waitText / contextLine (pure data)
//   CREATORS              → the Commands that create something, and how they join a make
const MakesCore = (() => {
  // the scenes' palette (chat-scenes.js uses the same colors and marks, so a make's rooms look like one family)
  const PALETTE = [['#ffc23d', 'gold'], ['#ff7a1a', 'ember'], ['#a970ff', 'violet'], ['#ff3d7f', 'rose'], ['#56c6ff', 'sky'], ['#7cd992', 'mint'], ['#c8f04a', 'lime'], ['#c9d3ff', 'ice']];
  const GLYPHS = ['◆', '▲', '●', '■', '★', '✦', '⬢', '✚', '❖', '✿', '♥', '♣'];
  const COLOR_WORD = { gold: 'Gold', ember: 'Ember', violet: 'Violet', rose: 'Rose', sky: 'Sky', mint: 'Mint', lime: 'Lime', ice: 'Ice' };
  const THINGS = ['Comet', 'Orbit', 'Tide', 'Spark', 'Drift', 'Pulse', 'Bloom', 'Signal', 'Halo', 'Echo', 'Prism', 'Flare', 'Wave', 'Vector', 'Nova', 'Ridge'];

  // Room kinds: a chat of one agent (a director docked in its tool, or a plain chat), or a frame on the board. "step"
  // is a part with no room of its own (a video project's steps, a run's commands, a render).
  const KINDS = {
    lab: { label: 'Lab', icon: '◭', room: 'chat', agent: 'three', who: 'Three Director', holds: 'the three.js scene (its own Lab sketch, in this make\'s color)' },
    video: { label: 'Video', icon: '🎬', room: 'chat', agent: 'ae', who: 'Video Director', holds: 'the edit: cuts, titles, the song and the renders' },
    board: { label: 'Board', icon: '▦', room: 'board', who: 'the mood board', holds: 'references for the vibe (never the footage)' },
    chat: { label: 'Chat', icon: '✳', room: 'chat', agent: 'claude', who: 'Claude', holds: 'the words: script, captions, the plan' },
    astra: { label: 'Astra', icon: 'A', room: 'chat', agent: 'astra', who: 'Astra', holds: 'Astra\'s side: art direction and decisions' },
    capture: { label: 'Capture', icon: '◉', room: null, who: 'capture', holds: 'recordings of Hearth itself' },
    step: { label: 'Step', icon: '•', room: null, who: '', holds: '' },
  };
  const isRoom = (kind) => Boolean(KINDS[kind]?.room);
  const CATS = { plan: 'Make', comp: 'Comp', intro: 'Video project', jam: 'Jam', run: 'Run', render: 'Render', capture: 'Capture', board: 'Board', scene: 'Scene', sequence: 'Sequence' };

  // ---------- identity ----------
  function hash(str) { let h = 0x811c9dc5; for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
  // avoid: [[ci, gi], …] of makes still on screen; a clash moves to the next color / mark (deterministic for the same avoid list)
  function identity(seed, avoid = []) {
    const h = hash(seed);
    let ci = h % PALETTE.length;
    let gi = Math.floor(h / PALETTE.length) % GLYPHS.length;
    const near = (avoid || []).slice(0, PALETTE.length - 1);
    for (let k = 0; k < PALETTE.length && near.some((n) => n[0] === ci); k += 1) ci = (ci + 1) % PALETTE.length;
    for (let k = 0; k < GLYPHS.length && near.some((n) => n[1] === gi); k += 1) gi = (gi + 1) % GLYPHS.length;
    return identOf(ci, gi);
  }
  const identOf = (ci, gi) => ({ ci, gi, color: PALETTE[ci][0], colorName: PALETTE[ci][1], glyph: GLYPHS[gi] });
  const genName = (seed, ident = identity(seed)) => `${COLOR_WORD[ident.colorName]} ${THINGS[Math.floor(hash(`${seed}·name`) / 7) % THINGS.length]}`;

  // ---------- names ----------
  const cap = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const titleCase = (s) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());
  const KIND_WORDS = /\b(three\.?js|3d|three|webgl|shaders?|scenes?|animations?|animated|visuals?|orbs?|particles?|lab|sketch(es)?|loops?|videos?|edits?|cuts?|footage|clips?|renders?|montages?|reels?|films?|trailers?|intros?|teasers?|boards?|moodboards?|mood|refs|references?|captions?|scripts?|copy|words|astra|claude|chats?|recordings?|captures?|tours?|parts?)\b/gi;
  const STOP = new Set('a an the that then which into to of with for me make makes making let lets let\'s we are about going create build i want some my our is it and its new quick short little one cut cuts into goes turns leads transitions followed by plan up please can you could us gonna will be from on in at this'.split(' '));
  // the name a plan's words give: "called X" / "named X" / "X" in quotes, else the descriptive words left once the
  // kinds and filler are gone ("a neon tunnel three.js animation that cuts into a video" → "Neon Tunnel"); '' when none
  function nameFor(text) {
    const s = String(text || '');
    const q = /(?:called|named|titled)\s+["“']?([^"”'.,;\n]{2,40})/i.exec(s) || /["“]([^"”]{2,40})["”]/.exec(s);
    if (q) return cap(q[1].trim(), 40);
    const words = s.replace(KIND_WORDS, ' ').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter((w) => w && !STOP.has(w.toLowerCase()) && !/^\d+s?$/.test(w));
    return words.length ? cap(titleCase(words.slice(0, 3).join(' ').toLowerCase()), 40) : '';
  }
  const label = (part, make) => {
    const k = KINDS[part.kind] || KINDS.step;
    if (part.label) return part.label;
    const same = (make?.parts || []).filter((p) => p.kind === part.kind);
    return same.length > 1 ? `${k.label} ${same.indexOf(part) + 1}` : k.label;
  };
  // "<Name> · Lab" — the one naming scheme of every room, scene, frame and file of a make
  const roomTitle = (make, part) => cap(`${make.name} · ${label(part, make)}${part.sub ? ` · ${part.sub}` : ''}`, 80);
  const fileBase = (make, part = null) => cap(`${make.name}${part ? ` · ${label(part, make)}` : ''}`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim(), 70);
  const slug = (make) => String(make.name || 'make').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').slice(0, 40) || 'make';

  // ---------- plans: words → parts ----------
  // "a three.js animation that cuts into a video" → [lab, video]; "board refs, then a lab scene, then the edit" → [board, lab, video]
  const SPLIT = /\s*(?:\bthat\s+(?:then\s+)?(?:cuts?|goes|turns|leads|transitions?|flows?)\s+(?:in)?to\b|\bcuts?\s+(?:in)?to\b|\b(?:and\s+)?then\b|\bfollowed\s+by\b|\binto\b|→|->|=>|;|\+|,|\band\s+(?=(?:a|an|the)\s))\s*/i;
  const CLASSIFY = [
    ['board', /\b(mood ?board|board|refs|references?|vibe)\b/i],
    ['lab', /\b(three\.?js|3d|webgl|shaders?|scenes?|animations?|animated|visuals?|orbs?|particles?|lab|sketch(es)?|loops?|generative|motion design)\b/i],
    ['video', /\b(videos?|edit(ing)?|cuts?|footage|clips?|renders?|montages?|reels?|films?|trailers?|intros?|teasers?|timeline|editor)\b/i],
    ['astra', /\b(astra|art direct(ion|or)?)\b/i],
    ['chat', /\b(captions?|scripts?|copy|words|text|voice ?over|post|tagline)\b/i],
  ];
  function kindOf(seg) { for (const [k, re] of CLASSIFY) if (re.test(seg)) return k; return null; }
  function parsePlan(text, { kinds = null } = {}) {
    const idea = cap(text, 300);
    let parts = [];
    if (Array.isArray(kinds) && kinds.length) parts = kinds.map((k) => (typeof k === 'string' ? { kind: k, brief: '' } : { kind: k.kind, brief: k.brief || '', sub: k.sub || '' })).filter((p) => KINDS[p.kind]);
    else {
      for (const seg of String(text || '').split(SPLIT).map((x) => x.trim()).filter(Boolean)) {
        const k = kindOf(seg);
        if (!k) { if (parts.length) parts.at(-1).brief = `${parts.at(-1).brief} ${seg}`.trim(); continue; }
        if (parts.at(-1)?.kind === k) { parts.at(-1).brief = `${parts.at(-1).brief}, ${seg}`; continue; }
        parts.push({ kind: k, brief: seg.replace(/^(a|an|the)\s+/i, '') });
      }
    }
    if (!parts.length) parts = [{ kind: 'lab', brief: cap(text, 160) }];
    const name = nameFor(text);
    return { idea, name, auto: !name, parts: parts.slice(0, 6) };
  }

  // ---------- the make itself (plain data) ----------
  let n = 0;
  const newId = (at = Date.now()) => `mk${at.toString(36)}${(n++ % 1296).toString(36).padStart(2, '0')}`;
  // create({ name?, idea?, parts: [{ kind, brief?, sub?, label?, chatId?, own? }], cat, by, from, src, avoid, at })
  function create(o = {}) {
    const at = o.at || Date.now();
    const id = o.id || newId(at);
    const ident = o.ident || identity(id, o.avoid);
    const name = cap(o.name || '', 48) || genName(id, ident);
    const make = {
      id, name, auto: !o.name, ident, cat: CATS[o.cat] ? o.cat : 'plan', idea: cap(o.idea || '', 300),
      by: o.by || null, from: o.from || null, src: o.src || null,
      parts: [], outputs: [], progress: null, at, updated: at, dismissed: null,
    };
    for (const p of o.parts || []) addPart(make, p);
    return make;
  }
  function addPart(make, p) {
    const i = make.parts.length + 1;
    const part = {
      id: p.id || `p${i}`, kind: KINDS[p.kind] ? p.kind : 'step', brief: cap(p.brief || '', 1200), sub: cap(p.sub || '', 40),
      ...(p.label ? { label: cap(p.label, 24) } : {}), chatId: p.chatId || null, own: p.own !== false, status: p.status || 'planned', progress: null, outputs: [],
    };
    make.parts.push(part);
    return part;
  }
  const part = (make, partId) => (make?.parts || []).find((p) => p.id === partId || p.chatId === partId) || null;
  // the rooms to rename: [{ part, title }] (only the rooms this make made: a chat it adopted keeps its own name)
  function rename(make, name) {
    const nm = cap(name, 48);
    if (!nm) return [];
    make.name = nm; make.auto = false; make.updated = Date.now();
    return make.parts.filter((p) => p.own && (p.chatId || p.frameId)).map((p) => ({ part: p, title: roomTitle(make, p) }));
  }
  const STATUS_PCT = { planned: 0, waiting: 0, working: 35, ready: 75, done: 100, stuck: 0 };
  const clamp = (x) => Math.max(0, Math.min(100, Number(x) || 0));
  // the progress stream (progress bars): one part's, or the whole make's (partId null)
  function progress(make, partId, p = {}) {
    const rec = { pct: p.pct == null ? null : clamp(p.pct), label: cap(p.label || '', 80), eta: p.eta == null ? null : Math.max(0, Number(p.eta) || 0), at: p.at || Date.now() };
    const target = partId ? part(make, partId) : make;
    if (!target) return null;
    target.progress = rec;
    if (partId && rec.pct >= 100 && target.status !== 'done') target.status = 'done';
    else if (partId && rec.pct > 0 && ['planned', 'waiting'].includes(target.status)) target.status = 'working';
    make.updated = rec.at;
    return rec;
  }
  function pctOf(make) {
    if (make.progress?.pct != null) return make.progress.pct;
    if (!make.parts.length) return make.done ? 100 : 0;
    const each = make.parts.map((p) => (p.status === 'done' ? 100 : p.progress?.pct != null ? p.progress.pct : STATUS_PCT[p.status] ?? 0));
    return Math.round(each.reduce((a, b) => a + b, 0) / each.length);
  }
  function statusOf(make) {
    if (make.dismissed) return 'dismissed';
    const s = make.parts.map((p) => p.status);
    if (make.done || (s.length && s.every((x) => x === 'done'))) return 'done';
    if (s.includes('stuck')) return 'stuck';
    if (s.includes('working')) return 'working';
    if (s.some((x) => x === 'ready' || x === 'done')) return 'going';
    return 'planned';
  }
  const STATUS_LABEL = { planned: 'planned', going: 'under way', working: 'working…', stuck: 'stuck', done: 'done', dismissed: 'dismissed' };
  // what a room waits for: the part before it that isn't done ("waiting for Lab"), or nothing (it can start)
  function waitFor(make, p) {
    const i = make.parts.indexOf(p);
    for (let k = i - 1; k >= 0; k -= 1) if (make.parts[k].status !== 'done') return make.parts[k];
    return null;
  }
  function waitText(make, p) {
    if (p.status !== 'planned' && p.status !== 'waiting') return STATUS_LABEL[p.status] || p.status;
    const w = waitFor(make, p);
    return w ? `planned · waiting for ${label(w, make)}${w.brief ? ` (${cap(w.brief, 40)})` : ''}` : 'planned · ready to start';
  }
  const chain = (make) => make.parts.map((p) => label(p, make)).join(' → ');
  // the one line a room's agent gets (only when it matters: its first message, or words about the other rooms)
  function contextLine(make, p) {
    const i = make.parts.indexOf(p);
    const next = make.parts[i + 1];
    const prev = make.parts[i - 1];
    const k = KINDS[p.kind] || KINDS.step;
    return `[Make “${make.name}” · this room: ${label(p, make)} (${i + 1} of ${make.parts.length}: ${chain(make)})${p.brief ? ` · it holds: ${cap(p.brief, 80)}` : ` · it holds ${k.holds}`}${prev ? ` · before it: ${label(prev, make)} (${prev.status})` : ''}${next ? ` · next: ${label(next, make)} takes it from here` : ''}. Name what you make “${fileBase(make, p)}”.]`;
  }
  function dismiss(make, at = Date.now()) { make.dismissed = at; make.updated = at; return make.parts.filter((p) => p.own && p.chatId).map((p) => p.chatId); }
  function restore(make) { make.dismissed = null; make.updated = Date.now(); return make.parts.filter((p) => p.own && p.chatId).map((p) => p.chatId); }
  function addOutput(make, o, partId = null) {
    const path = String(o.path || o || '');
    if (!path || make.outputs.some((x) => x.path === path)) return null;
    const out = { path, kind: o.kind || (/\.(png|jpe?g|webp)$/i.test(path) ? 'still' : /\.(mp4|webm|mov|gif)$/i.test(path) ? 'video' : 'file'), at: o.at || Date.now(), part: partId || null };
    make.outputs.unshift(out);
    make.outputs.length = Math.min(make.outputs.length, 40);
    make.updated = out.at;
    return out;
  }

  // ---------- the Commands that create something (the audit): how each joins a make ----------
  // standalone: a run of it outside any make becomes a make of its own; otherwise what it makes joins the make whose
  // room you are in (its file names carry that make's name). adapter: the module that already tells Makes about it.
  const CREATORS = {
    makes: { what: 'a planned make with its rooms', standalone: true, adapter: 'makes' },
    dispatch: { what: 'a comp: parts made by several chats', standalone: true, adapter: 'comp', cat: 'comp' },
    intro: { what: 'a video project', standalone: true, adapter: 'intro', cat: 'intro' },
    film: { what: 'a video project (one beat filmed)', standalone: true, adapter: 'intro', cat: 'intro' },
    jam: { what: 'a jam (Claude ⇄ Astra rounds on a scene)', standalone: true, adapter: 'jam', cat: 'jam' },
    'sequence-render': { what: 'a Lab sequence render', standalone: true, cat: 'render' },
    'edit-render': { what: 'an editor render', standalone: true, cat: 'render' },
    render: { what: 'a render', standalone: true, cat: 'render' },
    'render-again': { what: 'a render, again', standalone: false, cat: 'render' },
    'export-all': { what: 'every social format', standalone: true, cat: 'render' },
    'cut-export': { what: 'an exported cut', standalone: false, cat: 'render' },
    'cut-export-all': { what: 'every exported cut', standalone: true, cat: 'render' },
    comp: { what: 'a comp render (with "render")', standalone: false, cat: 'render', when: /^render\b/i },
    record: { what: 'a recording', standalone: false, adapter: 'capture', cat: 'capture' },
    tour: { what: 'a recorded tour', standalone: false, adapter: 'capture', cat: 'capture' },
    make: { what: 'a GIF / trim / social copy', standalone: false, adapter: 'capture', cat: 'capture' },
    still: { what: 'a still of the Lab', standalone: false, adapter: 'capture', cat: 'capture' },
    screenshot: { what: 'a screenshot', standalone: false, adapter: 'capture', cat: 'capture' },
    shot: { what: 'a screenshot', standalone: false, adapter: 'capture', cat: 'capture' },
    'board-new': { what: 'a board', standalone: false, cat: 'board' },
    scene: { what: 'a fresh scene (with "new")', standalone: false, cat: 'scene', when: /^new\b/i },
    'footage-sequence': { what: 'a sequence from footage', standalone: false, cat: 'sequence' },
    'motion-intro': { what: 'a motion-design intro scene', standalone: false, cat: 'scene' },
  };
  function creatorOf(name, args = '') {
    const c = CREATORS[String(name || '').replace(/^\//, '').toLowerCase()];
    if (!c) return null;
    if (c.when && !c.when.test(String(args || '').trim())) return null;
    return c;
  }

  return { PALETTE, GLYPHS, KINDS, CATS, STATUS_LABEL, CREATORS, hash, identity, identOf, genName, nameFor, label, roomTitle, fileBase, slug, parsePlan, kindOf, create, addPart, part, rename, progress, pctOf, statusOf, waitFor, waitText, chain, contextLine, dismiss, restore, addOutput, creatorOf, isRoom, cap };
})();
if (typeof module !== 'undefined') module.exports = MakesCore;
