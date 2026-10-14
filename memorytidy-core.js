// Memory tidy, the pure part (round 38, memorytidy). Saved memory (data/memory.json: `shared`, `agents[id]`, and since
// this round `places[id]`) is plain lines, one fact each, and goes with every message an AI gets, so it should stay
// small. This file finds what makes it grow for nothing, for free (no engine call):
//   · the same fact twice (exactly, or in other words), within one scope or once in "All agents" and once for one AI;
//   · a newer fact that contradicts an older one ("Uses a Mac" → "Now on Windows", "Hates camera shake" → "Likes camera
//     shake", "Name is Sam" → "Name is Quentin"): the newest wins;
//   · wordy facts ("The user really prefers…" → "Prefers…");
//   · facts about one place kept for every AI (Lab facts in "All agents" → the Lab scope, read only by the Directors);
//   · clearly stale ones ("this week…" saved a month ago, "until Oct 3" past).
// propose() returns a list of changes the owner ticks (each one says what it saves), apply() makes them, undo() puts
// the memory back while keeping facts saved since. saveFacts() is the prevention side: a fact the AI saves with
// <remember> replaces the one it repeats or contradicts instead of piling up (and logs `replaced`, so engines.js keeps a
// chat's frozen prompt as it was: cachewise). Shared by memorytidy.js (⋯ AI setup → Memory → Tidy memory…), native.js
// (<remember>) and Node (dev/memorytidy-test.js). Tokens ≈ characters / 4, like ContextCore.
const MemoryTidyCore = (() => {
  const tok = (s) => Math.ceil(String(s || '').length / 4);
  const strip = (line) => String(line || '').trim().replace(/^[-*•]\s+/, '').trim();
  const lineOf = (text) => `- ${text}`;
  const fmt = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n || 0)));
  const DAY = 864e5;
  const STALE_DAYS = 14;
  const NUDGE_TOKENS = 800; // the Memory fold's one-line nudge from this size
  const REPLACED_KEEP = 30; // memory.replaced: the newest AI updates kept for the frozen prompts (engines.js onlyGrew)
  // the places a fact can be kept for (ContextCore.PLACES decides which AI reads them; the ids must match)
  const PLACE_LABELS = { lab: 'Lab', game: 'Forgeheart' };
  const PLACE_TESTS = {
    lab: /\b(three\.?js|the lab|lab scenes?|in the lab|sliders?|shaders?|glsl|webgl|layers?|bloom|particles?|sketch(?:es)?|tone ?mapping|camera shake|post-?processing|uniforms?|keyframes?|orbs?|director)\b/i,
    game: /\b(forgeheart|forge_\w+|foes?|enemies|drones?|stage \d+|invincib\w*|spawn\w*)\b/i,
  };
  // a fact about how to talk to the owner is for everyone, even when it names a place
  // (and who the owner is, what they make: "Makes music-driven three.js visuals" helps every chat)
  const GENERAL = /\b(answers?|repl(?:y|ies)|call me|my name|name is|language|tone|french|english|explain|emojis?|bullet)\b|^(?:the )?(?:user |owner )?(?:makes|creates|posts|is an?|works as|does)\b/i;
  const PLACE_WORDS = { lab: /\s*\b(?:in|for|of)?\s*(?:the )?(?:lab|three\.?js)(?: scenes?| sketch(?:es)?)?\b/gi, game: /\s*\b(?:in|for)?\s*(?:the )?(?:forgeheart|game)\b/gi };

  // ---------- words ----------
  const STOP = new Set('a an the user users owner owners i me my mine is are am was were be been being to of in on at for and or with it its that this these those they them their he she his her has have had do does did as by from into so than then there here also some any about just will would can could should may might up out more most other own same such too very via per now new one when if what which who how where really'.split(' '));
  const SAME = { response: 'answer', responses: 'answer', reply: 'answer', replies: 'answer', answers: 'answer', colour: 'color', colours: 'color', favourite: 'favorite' };
  const POS = /\b(prefers?|preferred|likes?|liked|loves?|loved|wants?|wanted|enjoys?|favou?rites?)\b/gi; // dropped from a fact's frame
  const NEG = /\b(not|never|no longer|no|don'?t|doesn'?t|didn'?t|won'?t|hates?|hated|dislikes?|avoids?|stopped|without)\b/gi;
  const stem = (w) => {
    let s = w;
    if (/^\d/.test(s)) return s;
    if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}y`;
    else if (s.length > 4 && /(ches|shes|sses|xes)$/.test(s)) s = s.slice(0, -2);
    else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
    if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
    else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
    return s.slice(0, 6);
  };
  const norm = (t) => strip(t).toLowerCase().replace(/[’`]/g, "'").replace(/[.!;,]+$/g, '').replace(/\b(\d+) fps\b/g, '$1fps').replace(/\s+/g, ' ').trim();
  function stems(text) {
    const t = norm(text).replace(POS, ' ').replace(NEG, ' ');
    const out = new Set();
    for (const w of t.match(/[a-z0-9][a-z0-9:+#.'-]*/g) || []) {
      const c = w.replace(/[.'-]+$/g, '').replace(/'s$/, '');
      if (!c || STOP.has(c)) continue;
      out.add(stem(SAME[c] || c));
    }
    return out;
  }
  const negative = (text) => (norm(text).match(NEG) || []).length % 2 === 1;
  // values only one of which can be true at a time
  const CLASSES = [
    ['os', /\b(mac(?:os|book)?|windows|linux|ubuntu)\b/g, (v) => (/^mac/.test(v) ? 'mac' : /ubuntu/.test(v) ? 'linux' : v)],
    ['length', /\b(short|brief|concise|terse|long|longer|detailed|verbose|thorough|in-depth)\b/g, (v) => (/^(short|brief|concise|terse)$/.test(v) ? 'short' : 'long')],
    ['aspect', /\b(9:16|16:9|1:1|4:5|4:3|21:9)\b/g, (v) => v],
    ['lang', /\b(english|french|spanish|german|italian|portuguese|japanese|dutch)\b/g, (v) => v],
    ['theme', /\b(dark|light)(?= (?:mode|theme|ui|look))/g, (v) => v],
    ['units', /\b(metric|imperial)\b/g, (v) => v],
    ['fps', /\b(24|25|30|50|60|120|144|240) ?fps\b/g, (v) => v.replace(/\s/g, '')],
    ['res', /\b(720p|1080p|1440p|4k|8k)\b/g, (v) => v],
  ];
  function values(text) {
    const t = norm(text);
    const out = {};
    for (const [k, re, canon] of CLASSES) for (const m of t.matchAll(re)) (out[k] ||= new Set()).add(canon(m[1]));
    return out;
  }
  // the words around the values: what the fact is about
  function frame(text) {
    const vs = new Set();
    const t = norm(text);
    for (const [, re] of CLASSES) for (const m of t.matchAll(re)) for (const w of m[0].split(/\s+/)) vs.add(stem(w));
    return new Set([...stems(text)].filter((w) => !vs.has(w)));
  }
  const jac = (a, b) => { if (!a.size && !b.size) return 1; let n = 0; for (const w of a) if (b.has(w)) n++; return n / (a.size + b.size - n); };
  const subset = (a, b) => { for (const w of a) if (!b.has(w)) return false; return true; };
  // "X is Y" facts: the same X with another Y is a newer value. Subjects that hold one value at a time are sure.
  const KV = /^(?:(?:my|the user'?s|user'?s|their|his|her|our)\s+)?([a-z][a-z0-9 '-]{1,40}?)\s+(?:is|are|=|:)\s+(.+)$/;
  const ONE_VALUE = /^(name|nickname|main project|current project|project|channel|youtube channel|band|studio|company|job|role|editor|daw|monitor|screen|gpu|computer|machine|laptop|os|timezone|time zone|city|location|email|handle|username|deadline|main tool|default model|favorite colou?r|brand colou?r|accent colou?r)$/;
  function keyValue(text) {
    const t = norm(text);
    let m = /^(?:call me|goes by|i'?m called|named)\s+(.+)$/.exec(t);
    if (m) return { k: 'name', v: m[1], sure: true };
    m = /^(?:lives|based|living) in\s+(.+)$/.exec(t);
    if (m) return { k: 'location', v: m[1], sure: true };
    m = KV.exec(t);
    if (!m) return null;
    const k = m[1].replace(/^(?:the|a)\s+/, '').trim();
    return { k, v: m[2], sure: ONE_VALUE.test(k) };
  }

  // How the newer fact b relates to the older fact a (or null):
  //   same: says the same thing (exactly, or with the same words) · covered: a says less than b (b keeps all of a)
  //   covers: a says more than b · near: mostly the same words · conflict: b changes a (a value, a yes / no, a name)
  // sure: safe to act on without asking (prevention acts only on sure relations; tidy ticks only sure changes).
  function relate(a, b) {
    const na = norm(a); const nb = norm(b);
    if (!na || !nb) return null;
    if (na === nb) return { kind: 'same', sure: true };
    const sa = stems(a); const sb = stems(b);
    const pa = negative(a); const pb = negative(b);
    // a value class both name, with different values, about the same thing
    const va = values(a); const vb = values(b);
    const fa = frame(a); const fb = frame(b);
    for (const k of Object.keys(va)) {
      if (!vb[k]) continue;
      const overlap = [...va[k]].some((v) => vb[k].has(v));
      if (!overlap && (jac(fa, fb) >= 0.5 || (fa.size && fb.size && (subset(fa, fb) || subset(fb, fa))))) return { kind: 'conflict', sure: pa === pb && (jac(fa, fb) >= 0.66 || (fa.size > 0 && fb.size > 0 && Math.abs(fa.size - fb.size) <= 1 && (subset(fa, fb) || subset(fb, fa)))), why: k };
    }
    const kva = keyValue(a); const kvb = keyValue(b);
    if (kva && kvb && kva.k === kvb.k && norm(kva.v) !== norm(kvb.v)) {
      const vsa = stems(kva.v); const vsb = stems(kvb.v);
      if (!subset(vsa, vsb) && !subset(vsb, vsa)) return { kind: 'conflict', sure: kva.sure && kvb.sure, why: 'value' };
    }
    const j = jac(sa, sb);
    if (pa !== pb && sa.size && j >= 0.6) return { kind: 'conflict', sure: j >= 0.75, why: 'polarity' };
    if (pa !== pb) return null;
    if (sa.size && j === 1) return { kind: 'same', sure: true };
    // numbers that differ in otherwise matching facts: a newer value
    const nums = (s) => [...s].filter((w) => /^\d/.test(w));
    const xa = nums(sa).filter((w) => !sb.has(w)); const xb = nums(sb).filter((w) => !sa.has(w));
    if (xa.length && xb.length && j >= 0.5) return { kind: 'conflict', sure: false, why: 'number' };
    if (sa.size >= 2 && subset(sa, sb)) return { kind: 'covered', sure: true };
    if (sb.size >= 2 && subset(sb, sa)) return { kind: 'covers', sure: true };
    if (j >= 0.6) return { kind: 'near', sure: j >= 0.75 };
    return null;
  }

  // ---------- shorter wording ----------
  const SHORTER = [
    [/\b(?:really|very|basically|actually|quite|definitely|simply|literally|honestly|pretty much)\s+/gi, ''],
    [/^(?:the )?(?:user|owner)'s\s+/i, ''],
    [/^(?:the )?(?:user|owner) (?:is|was) (?=(?:a|an|on|in|at|from|based|using|working|making|into|not)\b)/i, ''],
    [/^(?:the )?(?:user|owner) would (?:like|rather|prefer)(?: to)?\s+/i, 'Wants to '],
    [/^(?:the )?(?:user|owner)\s+(?=[a-z]+s\b)/i, ''],
    [/\bin order to\b/gi, 'to'],
    [/\b(?:a lot of|lots of)\b/gi, 'many'],
    [/\b(?:at the moment|at this point in time|right now)\b/gi, 'now'],
    [/\b(?:is|are) able to\b/gi, 'can'],
    [/\bdue to the fact that\b/gi, 'because'],
    [/\bwhenever (?:it is )?possible\b/gi, 'when possible'],
    [/\b(?:the )?responses\b/gi, 'answers'],
    [/\bfor example\b/gi, 'e.g.'],
    [/\s+as well\b/gi, ' too'],
    [/\s*\(\s*\)/g, ''],
    [/\s{2,}/g, ' '],
    [/[.]+$/, ''],
  ];
  function shorten(text) {
    let t = strip(text);
    for (const [re, to] of SHORTER) t = t.replace(re, to);
    t = t.trim();
    if (!t) return strip(text);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  const worthShorter = (a, b) => b !== strip(a) && (tok(a) - tok(b) >= 2 || strip(a).length - b.length >= 8);

  // ---------- stale ----------
  const SOON = /\b(today|tonight|tomorrow|yesterday|this (?:week|weekend|morning|afternoon|evening)|right now|at the moment|(?:currently|for now) (?:working on|making|building|doing|fixing|testing|finishing|busy|editing|rendering))\b/i;
  const MONTHS = 'jan feb mar apr may jun jul aug sep oct nov dec'.split(' ');
  function dateIn(text, now) {
    const t = norm(text);
    // a date that ends something ("until…", "deadline…", "due…"), not one that only tells when something happened
    if (!/\b(?:until|till|by|before|deadline|due|ends?|expires?)\b/.test(t) || /\b(?:birthday|born|anniversary|every|each)\b/.test(t)) return null;
    let m = /\b(\d{4})-(\d\d)-(\d\d)\b/.exec(t);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 23, 59).getTime();
    m = /\b(?:(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{1,2})(?:st|nd|rd|th)?)?(?:,?\s+(\d{4}))?\b/.exec(t);
    if (m && (m[1] || m[3])) {
      const year = m[4] ? Number(m[4]) : new Date(now).getFullYear();
      const d = new Date(year, MONTHS.indexOf(m[2]), Number(m[1] || m[3]), 23, 59).getTime();
      // without a year, a date more than ~6 months ahead was last year's
      return !m[4] && d - now > 180 * DAY ? new Date(year - 1, MONTHS.indexOf(m[2]), Number(m[1] || m[3]), 23, 59).getTime() : d;
    }
    return null;
  }
  // { why, sure } when a fact is clearly past its time, else null
  function stale(f, now) {
    const d = dateIn(f.text, now);
    if (d && d < now - DAY) return { why: `its date has passed (${new Date(d).toISOString().slice(0, 10)})`, sure: true };
    const m = SOON.exec(f.text);
    if (!m) return null;
    if (f.added) return now - f.added > STALE_DAYS * DAY ? { why: `says “${m[1]}” and was saved ${Math.round((now - f.added) / DAY)} days ago`, sure: true } : null;
    return { why: `says “${m[1]}” (saved before Hearth kept dates, so it is probably old)`, sure: false };
  }

  // ---------- scopes ----------
  // scope keys: 'shared' (All agents), 'place:<id>' (one place), or an agent id
  const scopesOf = (mem) => ['shared', ...Object.keys(mem?.places || {}).map((p) => `place:${p}`), ...Object.keys(mem?.agents || {})];
  function getScope(mem, scope) {
    if (scope === 'shared') return String(mem?.shared || '');
    if (scope.startsWith('place:')) return String(mem?.places?.[scope.slice(6)] || '');
    return String(mem?.agents?.[scope] || '');
  }
  function setScope(mem, scope, text) {
    const t = String(text || '').split('\n').filter((l) => l.trim()).join('\n');
    if (scope === 'shared') mem.shared = t;
    else if (scope.startsWith('place:')) { mem.places ||= {}; if (t) mem.places[scope.slice(6)] = t; else delete mem.places[scope.slice(6)]; if (!Object.keys(mem.places).length) delete mem.places; } else { mem.agents ||= {}; mem.agents[scope] = t; }
  }
  const clone = (mem) => JSON.parse(JSON.stringify({ shared: '', agents: {}, ...(mem || {}) }));
  // which scopes an agent reads (ContextCore.PLACES decides the places; a plain list when it isn't here)
  function placesOn(agent) {
    const CC = typeof module !== 'undefined' && typeof require === 'function' ? (() => { try { return require('./context-core'); } catch { return null; } })() : (typeof ContextCore !== 'undefined' ? ContextCore : null);
    if (CC?.PLACES) return CC.PLACES.filter((p) => p.on(agent)).map((p) => p.id);
    return [agent?.threeTools ? 'lab' : null, agent?.gameTools ? 'game' : null].filter(Boolean);
  }
  const visible = (agent) => ['shared', ...placesOn(agent).map((p) => `place:${p}`), agent?.id].filter(Boolean);
  const scopeLabel = (scope, agents = []) => (scope === 'shared' ? 'All agents' : scope.startsWith('place:') ? `${PLACE_LABELS[scope.slice(6)] || scope.slice(6)} only` : `${agents.find((a) => a.id === scope)?.name || scope} only`);
  // every fact: { scope, line, text, i (its line in the scope), added, pinned }
  function facts(mem, meta = {}) {
    const out = [];
    for (const scope of scopesOf(mem)) {
      getScope(mem, scope).split('\n').forEach((line, i) => {
        const text = strip(line);
        if (text) out.push({ scope, line: line.trim(), text, i, ...(meta[`${scope}|${text}`] || {}) });
      });
    }
    return out;
  }
  // tokens an agent's memory adds where it goes (the same block as engines.js / ContextCore.memoryBlock)
  const HEAD = 'What you remember about the user (saved notes, keep them in mind):';
  function tokensFor(mem, agent) {
    const notes = visible(agent).map((s) => getScope(mem, s).trim()).filter(Boolean);
    return notes.length ? tok(`${HEAD}\n${notes.join('\n')}`) : 0;
  }
  const allTokens = (mem) => facts(mem).reduce((n, f) => n + tok(f.line) + 1, 0);

  // ---------- the proposal ----------
  // mem: memory.json · meta: memory-meta facts ({ 'scope|text': { added, pinned } }) · agents: [{ id, name, threeTools… }]
  // → { changes: [{ id, kind, facts: [{ scope, text }], after, scope, why, sure, saves }], before, after }
  // kinds: merge (the same fact said two or more times), update (the newest of facts that contradict each other), shorter,
  // move (to a place's scope), drop (stale). Each fact is in at most one change; pinned facts are never dropped or replaced.
  function propose(mem, { meta = {}, agents = [], now = Date.now() } = {}) {
    const all = facts(mem, meta);
    const state = new Map(); // fact → { c: its change, kept: true when it's the fact the change keeps }
    // newer: its saved date, else its place in the scope (facts are appended), else an AI's own over "All agents"
    const newer = (a, b) => (a.added && b.added ? (a.added >= b.added ? a : b) : a.scope === b.scope ? (a.i > b.i ? a : b) : (a.scope === 'shared' ? b : a));
    // two facts one AI reads together: one scope, "All agents" with anything, or a place with an AI working there
    const reads = (scope, place) => placesOn(agents.find((a) => a.id === scope) || {}).includes(place);
    const together = (a, b) => a.scope === b.scope || a.scope === 'shared' || b.scope === 'shared'
      || (a.scope.startsWith('place:') && reads(b.scope, a.scope.slice(6))) || (b.scope.startsWith('place:') && reads(a.scope, b.scope.slice(6)));
    const changes = [];
    const push = (c) => { c.id = `c${changes.length + 1}`; changes.push(c); return c; };
    // where the kept fact ends up: "All agents" when one of them was there (everyone keeps it), else its own scope
    const keepScope = (fs, keep) => (fs.some((f) => f.scope === 'shared') ? 'shared' : fs.find((f) => f.scope.startsWith('place:'))?.scope || keep.scope);
    const WHY = { same: 'the same fact said more than once', near: 'almost the same fact said more than once', covered: 'one says everything the others do', covers: 'one says everything the others do' };
    const WHAT = { polarity: 'yes / no', value: 'a new value', number: 'a new number', os: 'the computer', length: 'answer length', aspect: 'the format', lang: 'the language', theme: 'dark / light', units: 'units', fps: 'frame rate', res: 'resolution' };
    const whyUpdate = (r) => `the newest fact replaces what it contradicts (${WHAT[r.why] || r.why})`;
    // 1. the same fact twice; 2. a newer one that contradicts an older one. One pass over pairs, oldest first; the fact a
    // change keeps can still take in more of the same (three "Uses a Mac" and a "Now uses Windows" end as one change).
    for (let x = 0; x < all.length; x++) {
      for (let y = x + 1; y < all.length; y++) {
        const a = all[x]; const b = all[y];
        const sa = state.get(a); const sb = state.get(b);
        if ((sa && !sa.kept) || (sb && !sb.kept) || (sa && sb) || !together(a, b)) continue;
        const r = relate(a.text, b.text);
        if (!r) continue;
        const kept = sa ? a : sb ? b : null; // already the kept fact of a change
        const other = kept === a ? b : a;
        const c = kept ? state.get(kept).c : null;
        let keep;
        if (r.kind === 'conflict') keep = newer(a, b);
        else keep = r.kind === 'covered' ? b : r.kind === 'covers' ? a : r.kind === 'same' ? (strip(a.text).length <= strip(b.text).length ? a : b) : newer(a, b);
        const gone = keep === a ? b : a;
        if (gone.pinned && !keep.pinned) continue;
        if (!c) {
          const nc = push({ kind: r.kind === 'conflict' ? 'update' : 'merge', facts: [a, b], keep, after: shorten(keep.text), scope: null, why: r.kind === 'conflict' ? whyUpdate(r) : WHY[r.kind], sure: r.sure && (r.kind !== 'conflict' || Boolean(keep.added || a.scope === b.scope)) });
          state.set(a, { c: nc, kept: keep === a }); state.set(b, { c: nc, kept: keep === b });
          continue;
        }
        c.facts.push(other);
        c.sure = c.sure && r.sure && (r.kind !== 'conflict' || Boolean(keep.added || a.scope === b.scope));
        if (r.kind === 'conflict') { c.kind = 'update'; c.why = whyUpdate(r); }
        state.set(other, { c, kept: keep === other });
        if (keep === other) { state.set(kept, { c, kept: false }); c.keep = other; c.after = shorten(other.text); }
      }
    }
    for (const c of changes) c.scope = keepScope(c.facts, c.keep);
    // 3. stale; 4. place facts read by AIs that don't work there; 5. wordy
    const placeOn = (p) => agents.some((a) => placesOn(a).includes(p));
    const readsPlace = (scope, p) => scope !== 'shared' && !scope.startsWith('place:') && placesOn(agents.find((a) => a.id === scope) || {}).includes(p);
    for (const f of all) {
      if (state.has(f)) continue;
      const s = !f.pinned && stale(f, now);
      if (s) { push({ kind: 'drop', facts: [f], after: null, scope: null, why: s.why, sure: s.sure }); continue; }
      const short = shorten(f.text);
      const place = !f.scope.startsWith('place:') && !GENERAL.test(f.text) ? Object.keys(PLACE_TESTS).find((p) => PLACE_TESTS[p].test(f.text) && placeOn(p) && !readsPlace(f.scope, p)) : null;
      // already known where it goes (a Director's own fact, the Lab scope, "All agents" is never the source here): drop it
      const known = place && all.find((g) => g !== f && (g.scope === `place:${place}` || reads(g.scope, place)) && ['same', 'covers'].includes(relate(g.text, f.text.replace(PLACE_WORDS[place], ''))?.kind));
      if (known) { push({ kind: 'drop', facts: [f], after: null, scope: null, why: `only matters in the ${PLACE_LABELS[place]}, and ${place === 'lab' ? 'the Three Directors' : 'the game\'s AI'} already know it (“${known.text}”)`, sure: true }); continue; }
      if (place) { push({ kind: 'move', facts: [f], after: worthShorter(f.text, short) ? short : f.text, scope: `place:${place}`, why: `only matters in the ${PLACE_LABELS[place]}: only ${place === 'lab' ? 'the Three Directors' : 'the game\'s AI'} will read it${f.scope === 'shared' ? '' : ', not every chat with this AI'}`, sure: true }); continue; }
      if (worthShorter(f.text, short)) push({ kind: 'shorter', facts: [f], after: short, scope: f.scope, why: 'fewer words, same fact', sure: true });
    }
    for (const c of changes) {
      delete c.keep;
      c.facts = c.facts.map((f) => ({ scope: f.scope, text: f.text }));
      c.saves = c.facts.reduce((n, f) => n + tok(lineOf(f.text)) + 1, 0) - (c.after ? tok(lineOf(c.after)) + 1 : 0);
    }
    const res = apply(mem, changes.filter((c) => c.sure));
    return { changes, before: allTokens(mem), after: allTokens(res.memory), facts: all.length };
  }

  // ---------- apply / undo ----------
  // makes the ticked changes; a change whose facts are no longer there (memory changed since) is skipped
  function apply(mem, changes) {
    const out = clone(mem);
    const rows = {}; // scope → [{ line, gone, before: [] }]
    const rowsOf = (scope) => (rows[scope] ||= getScope(out, scope).split('\n').filter((l) => l.trim()).map((line) => ({ line: line.trim(), gone: false, before: [] })));
    const tail = {}; // scope → lines added at its end
    let done = 0;
    for (const c of changes || []) {
      const hits = [];
      for (const f of c.facts || []) {
        const r = rowsOf(f.scope).find((x) => !x.gone && !hits.includes(x) && strip(x.line) === f.text);
        if (!r) { hits.length = 0; break; }
        hits.push(r);
      }
      if (!hits.length) continue;
      for (const r of hits) r.gone = true;
      if (c.after) {
        // in place of its first fact in the same scope (or the end of the scope it moves to)
        const firstHere = (c.facts || []).findIndex((f) => f.scope === c.scope);
        if (firstHere >= 0) hits[firstHere].before.push(lineOf(c.after));
        else (tail[c.scope] ||= []).push(lineOf(c.after));
        rowsOf(c.scope);
      }
      done += 1;
    }
    for (const scope of new Set([...Object.keys(rows), ...Object.keys(tail)])) {
      const lines = rowsOf(scope).flatMap((r) => [...r.before, ...(r.gone ? [] : [r.line])]);
      setScope(out, scope, [...lines, ...(tail[scope] || [])].join('\n'));
    }
    return { memory: out, done };
  }
  // back to `before`, keeping any fact saved since the tidy (in `now` but not in `after`)
  function undo(now, before, after) {
    const out = clone(now);
    for (const scope of new Set([...scopesOf(before), ...scopesOf(after), ...scopesOf(now)])) {
      const was = getScope(after, scope).split('\n').map((l) => l.trim()).filter(Boolean);
      const extra = [];
      for (const l of getScope(now, scope).split('\n').map((x) => x.trim()).filter(Boolean)) {
        const i = was.indexOf(l);
        if (i >= 0) was.splice(i, 1); else extra.push(l);
      }
      setScope(out, scope, [getScope(before, scope).trim(), ...extra].filter(Boolean).join('\n'));
    }
    return out;
  }

  // ---------- prevention: the AI's <remember> ----------
  // A fact the AI saves replaces the one it repeats or contradicts (only sure matches, among the scopes this AI reads),
  // instead of adding a line that says it again. Returns { memory, added, replaced: [{ scope, from, to }], skipped }.
  function saveFacts(mem, agent, list, now = Date.now()) {
    const out = clone(mem);
    const res = { memory: out, added: [], replaced: [], skipped: [] };
    const own = agent?.id;
    if (!own) return res;
    for (const raw of list || []) {
      const text = strip(String(raw || '').replace(/\s+/g, ' ')).slice(0, 300);
      if (!text) continue;
      let hit = null;
      for (const scope of visible(agent)) {
        const lines = getScope(out, scope).split('\n');
        for (let i = 0; i < lines.length; i++) {
          const t = strip(lines[i]);
          if (!t) continue;
          const r = relate(t, text);
          if (r?.sure && (!hit || (r.kind === 'same' && hit.r.kind !== 'same'))) hit = { scope, i, line: lines[i].trim(), r };
        }
      }
      if (hit && (hit.r.kind === 'same' || hit.r.kind === 'covers')) { res.skipped.push(text); continue; } // it knows it already
      if (hit) {
        const lines = getScope(out, hit.scope).split('\n');
        lines[hit.i] = lineOf(text);
        setScope(out, hit.scope, lines.join('\n'));
        res.replaced.push({ scope: hit.scope, from: hit.line, to: lineOf(text) });
        out.replaced = [...(Array.isArray(out.replaced) ? out.replaced : []), { from: hit.line, to: lineOf(text), at: now }].slice(-REPLACED_KEEP);
        continue;
      }
      setScope(out, own, [getScope(out, own).trim(), lineOf(text)].filter(Boolean).join('\n'));
      res.added.push(text);
    }
    return res;
  }
  // the Undo on "Saved to memory": takes the facts out again and puts back what they replaced
  function unsave(mem, agentId, list) {
    const out = clone(mem);
    for (const raw of list || []) {
      const to = lineOf(strip(raw));
      const rep = [...(Array.isArray(out.replaced) ? out.replaced : [])].reverse().find((r) => r.to === to);
      let put = false;
      for (const scope of scopesOf(out)) {
        if (scope !== agentId && !rep) continue;
        const lines = getScope(out, scope).split('\n');
        const i = lines.findIndex((l) => l.trim() === to);
        if (i < 0) continue;
        if (rep) lines[i] = rep.from; else lines.splice(i, 1);
        setScope(out, scope, lines.join('\n'));
        put = true;
        break;
      }
      if (put && rep) out.replaced = out.replaced.filter((r) => r !== rep);
    }
    return out;
  }

  // ---------- smarter tidy (one cheap model run, only when the owner asks) ----------
  const PERSONA = 'You tidy a short list of saved facts about a user. Reply only with the change lines asked for, nothing else.';
  function smarterPrompt(list) {
    return `Tidy these saved memory facts about the user. They go into every message, so shorter is better, but never lose a fact that still matters.
Reply with changes only, one per line, in exactly one of these forms:
N = shorter wording of fact N (same meaning)
N,M = one fact that says what facts N and M say
N x   (fact N is clearly outdated or a one-off)
Leave good facts out of your reply. No other text.

<facts>
${list.map((f, i) => `${i + 1}. ${f.text}`).join('\n')}
</facts>`;
  }
  // what one smarter tidy costs, before it runs (the engine's own lean start + the list; the reply is short)
  const LEAN_BASE = { claude: 700, codex: 2400 };
  function smarterCost(list, engine = 'claude') {
    const input = (LEAN_BASE[engine] || LEAN_BASE.claude) + tok(PERSONA) + tok(smarterPrompt(list));
    const output = Math.min(600, 20 + Math.round(list.reduce((n, f) => n + tok(f.text), 0) * 0.4));
    return { input, output, total: input + output };
  }
  // the model's reply → changes (lines it can't read, or that would make a fact longer, are skipped)
  function parseSmarter(reply, list) {
    const out = [];
    const seen = new Set();
    for (const raw of String(reply || '').split('\n')) {
      const line = raw.trim().replace(/^[-*•]\s+/, '');
      let m = /^(\d+(?:\s*[,+&]\s*\d+)*)\s*=\s*(.+)$/.exec(line);
      if (m) {
        const ids = [...new Set(m[1].split(/[,+&]/).map((n) => Number(n.trim()) - 1))];
        const fs = ids.map((i) => list[i]).filter(Boolean);
        const after = strip(m[2].replace(/^["“]|["”]$/g, '')).slice(0, 300);
        if (fs.length !== ids.length || !after || fs.some((f) => seen.has(f))) continue;
        if (fs.length === 1 && tok(after) >= tok(fs[0].text)) continue;
        if (fs.length > 1) { const scopes = new Set(fs.map((f) => f.scope)); if (scopes.size > 1 && !scopes.has('shared')) continue; }
        fs.forEach((f) => seen.add(f));
        const scope = fs.some((f) => f.scope === 'shared') ? 'shared' : fs[0].scope;
        out.push({ kind: fs.length > 1 ? 'merge' : 'shorter', facts: fs.map((f) => ({ scope: f.scope, text: f.text })), after, scope, why: fs.length > 1 ? 'the AI found these say the same' : 'the AI found a shorter way to say it', sure: true, by: 'ai' });
        continue;
      }
      m = /^(\d+)\s*(?:x|×|drop|delete|remove)\b/i.exec(line);
      if (m) {
        const f = list[Number(m[1]) - 1];
        if (!f || seen.has(f) || f.pinned) continue;
        seen.add(f);
        out.push({ kind: 'drop', facts: [{ scope: f.scope, text: f.text }], after: null, scope: null, why: 'the AI thinks it is outdated or a one-off', sure: false, by: 'ai' });
      }
    }
    for (const c of out) c.saves = c.facts.reduce((n, f) => n + tok(lineOf(f.text)) + 1, 0) - (c.after ? tok(lineOf(c.after)) + 1 : 0);
    return out;
  }

  return { tok, fmt, strip, norm, stems, relate, shorten, stale, dateIn, facts, propose, apply, undo, saveFacts, unsave, visible, placesOn, getScope, setScope, scopesOf, scopeLabel, tokensFor, allTokens, smarterPrompt, smarterCost, parseSmarter, PERSONA, PLACE_LABELS, PLACE_TESTS, NUDGE_TOKENS, STALE_DAYS };
})();
if (typeof module !== 'undefined') module.exports = MemoryTidyCore; else window.MemoryTidyCore = MemoryTidyCore;
