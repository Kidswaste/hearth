// (round 128, aiprep128) The project brief, the pure part (no DOM; loads in Node for dev/aiprep128-test.js). Before a
// director builds, one cheap AI pass reads what the project already has (its moodboard, Lab references, the song's
// analysis, the scene's outline, the owner's written intent) and writes a short plan: mood, palette, a tempo plan on the
// song's sections, 3–6 first steps, risks and (only when truly ambiguous) questions. projectbrief.js is the window side.
//   inputs(raw)                    → what the AI reads, small and clean (names, numbers, colors; no paths, secrets redacted)
//   fingerprints(inputs)           → { board, refs, song, scene, notes }: short hashes, so a brief knows when it's stale
//   changed(stored, now)           → ['the moodboard', …] what changed since the brief
//   request(inputs, { consent, picture }) → { text, images }: a picture only with the project's explicit consent
//   parse(text, inputs)            → the brief { mood, look, palette, tempo, steps, risks, questions } or null
//   compact(brief, name)           → the director's prompt part (≤ PART_MAX characters, byte-stable for one brief)
//   full(brief, name) / toText / fromText → the whole brief (three_do brief), and the "Edit the brief" round trip
//   prepare(projectId, opts, deps) → the whole flow with the window's reads / AI / store injected (the test's fake ones)
//   (round 129, draft129) draftSteps / draftMessage / draftCost / draftLine: ✦ Build a first draft (projectbrief-draft.js)
// Store: kv 'project-briefs' { v: 1, list: [{ id: projectId, brief, compact, fp, at, by, eyes, done }] } (eyes: the owner
// allowed "Let the AI look at the moodboard" for this project) (a list of
// objects with ids: cloud sync merges two computers' changes item by item; sync-kinds.js syncs it with the projects).
const ProjectBriefCore = (() => {
  const req = (f) => { try { return typeof require === 'function' ? require(f) : null; } catch { return null; } };
  const BV = () => (typeof BoardVibe !== 'undefined' ? BoardVibe : req('./board-vibe.js'));
  const AR = () => (typeof AccessRules !== 'undefined' ? AccessRules : req('./access-rules.js'));
  const STORE = 'project-briefs';
  const PART_MAX = 600; // the director's prompt part, at most (characters)
  const HEX = /^#[0-9a-f]{6}$/i;
  const cap = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  // secrets never go into a prompt: AccessRules.redact (keys, tokens, passwords, URLs with a password), else the same idea
  const redact = (s) => { const a = AR(); return a?.redact ? a.redact(String(s ?? '')) : String(s ?? '').replace(/\b(sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{12,})/g, '•••').replace(/((?:api[_-]?key|token|secret|password)["']?\s*[:=]\s*["']?)[^\s"'&]+/gi, '$1•••'); };
  const clean = (s, n) => cap(redact(s), n);
  const hash = (v) => { const t = typeof v === 'string' ? v : JSON.stringify(v ?? null); let h = 2166136261; for (let i = 0; i < t.length; i += 1) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const mmss = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.round((s || 0) % 60)).padStart(2, '0')}`;
  const isPic = (it) => ['image', 'gif', 'video', 'web'].includes(it?.type);

  // ---------- what the project has ----------
  // raw: { project: { name, notes, workspace? }, notes (the owner's intent, overrides the project's), board: { name,
  // items }, refs: [{ name, kind }], song: { name|path, analysis }, scene: { name, layers: [{ name }], palette, frame } }
  function inputs(raw = {}) {
    const p = raw.project || {};
    const out = { name: clean(p.name || 'this project', 60), intent: clean(raw.notes ?? p.workspace?.description ?? p.notes ?? '', 900) };
    const b = raw.board;
    if (b && Array.isArray(b.items)) {
      const items = b.items.filter((i) => i && i.type !== 'link');
      const V = BV();
      const s = V?.summary ? V.summary(items) : { palette: [], moods: [], tags: [], notes: [], byKind: {} };
      const swatch = items.filter((i) => i.type === 'swatch' || i.type === 'palette').flatMap((i) => (i.colors || [i.color]).filter(Boolean));
      const palette = [...new Set([...(s.palette || []).map((c) => c.hex), ...swatch].filter((h) => HEX.test(h)).map((h) => h.toLowerCase()))].slice(0, 6);
      const notes = items.filter((i) => i.type === 'note' || i.type === 'text' || i.note).map((i) => clean(i.note || i.text || '', 140)).filter(Boolean).slice(0, 6);
      const titles = items.filter((i) => isPic(i) && i.title).map((i) => clean(i.title, 40)).slice(0, 8);
      out.board = {
        name: clean(b.name || 'Moodboard', 48), count: items.filter((i) => i.type !== 'frame').length, kinds: s.byKind || {}, palette,
        moods: [...(s.moods || []), ...(s.tags || []).map((t) => `#${t}`)].slice(0, 8), notes, titles,
        light: s.light ?? null, contrast: s.contrast ?? null, sat: s.sat ?? null, warmth: s.warmth ?? null, motion: s.motion ?? null,
        pictures: items.filter(isPic).length,
        // what the fingerprint follows: each item's id, kind, title, note and vibe palette (moving one on the board doesn't count)
        sig: hash(items.map((i) => [i.id, i.type, i.title || '', i.note || i.text || '', (i.colors || [i.color]).join(), (i.vibe?.palette || []).map((c) => c.hex).join()])),
      };
    }
    if (Array.isArray(raw.refs) && raw.refs.length) out.refs = raw.refs.slice(0, 12).map((r) => ({ name: clean(r.name || r.key || 'reference', 40), kind: String(r.kind || 'file').slice(0, 12) }));
    const sg = raw.song;
    if (sg && (sg.analysis || sg.name || sg.path)) {
      const a = sg.analysis || {};
      const level = Array.isArray(a.level) ? a.level : null; const fps = a.fps || 30;
      const energyOf = (x) => { if (x.energy) return x.energy; if (!level) return null; const s0 = Math.floor(x.start * fps); const e0 = Math.max(s0 + 1, Math.floor(x.end * fps)); let m = 0; for (let i = s0; i < e0 && i < level.length; i += 1) m += level[i]; m /= e0 - s0; return m > 0.66 ? 'loud' : m < 0.33 ? 'quiet' : 'medium'; };
      out.song = {
        name: clean(sg.name || String(sg.path || '').split(/[\\/]/).pop() || 'the song', 60),
        bpm: a.bpm ? Math.round(a.bpm * 10) / 10 : null, key: a.key || a.keyName || null, duration: a.duration ? Math.round(a.duration) : null,
        sections: (a.sections || []).slice(0, 16).map((x) => ({ label: x.label || 'Section', start: Math.round(x.start || 0), end: Math.round(x.end || 0), energy: energyOf(x) })),
        drops: (a.drops || []).slice(0, 6).map((t) => Math.round(t)),
        analysed: Boolean(sg.analysis),
      };
    }
    const sc = raw.scene;
    if (sc) out.scene = { name: clean(sc.name || 'scene', 48), layers: (sc.layers || []).slice(0, 16).map((l) => clean(l.name || 'layer', 32)), palette: (sc.palette || []).filter((h) => HEX.test(h)).slice(0, 6), frame: sc.frame || sc.size || null };
    return out;
  }

  // ---------- staleness ----------
  function fingerprints(x) {
    return {
      board: x.board ? x.board.sig : '', refs: x.refs ? hash(x.refs) : '',
      song: x.song ? hash(x.song.name) : '', // (the song by name: a check doesn't analyse it again)
      scene: x.scene ? hash([x.scene.name, x.scene.layers]) : '', notes: x.intent ? hash(x.intent) : '',
    };
  }
  const WHAT = { board: 'the moodboard', refs: 'the references', song: 'the song', scene: 'the scene', notes: 'your notes' };
  // what changed since the brief (the scene is left out: the director changes it while it follows the brief)
  function changed(stored, now) {
    if (!stored || !now) return [];
    return ['board', 'refs', 'song', 'notes'].filter((k) => (stored[k] || '') !== (now[k] || '')).map((k) => WHAT[k]);
  }

  // ---------- the one AI pass ----------
  const HEAD = 'Write the project brief for a music-visual project in Hearth\'s three.js Lab.';
  function prompt(x, { pictures = 0 } = {}) {
    const L = [HEAD, `Project: "${x.name}"`];
    if (x.intent) L.push(`The owner's intent: ${x.intent}`);
    if (x.board) {
      const b = x.board;
      L.push(`Moodboard "${b.name}": ${b.count} items${Object.keys(b.kinds).length ? ` (${Object.entries(b.kinds).map(([k, n]) => `${n} ${k}`).join(', ')})` : ''}`);
      if (b.palette.length) L.push(`  palette: ${b.palette.join(' ')}`);
      const looks = [b.light != null && `light ${b.light}`, b.contrast != null && `contrast ${b.contrast}`, b.sat != null && `saturation ${b.sat}`, b.warmth != null && `warmth ${b.warmth}`, b.motion != null && `motion ${b.motion}`].filter(Boolean);
      if (looks.length) L.push(`  look (0..1): ${looks.join(', ')}`);
      if (b.moods.length) L.push(`  mood words: ${b.moods.join(', ')}`);
      if (b.titles.length) L.push(`  pictures: ${b.titles.join('; ')}`);
      if (b.notes.length) L.push(`  notes: ${b.notes.map((n) => `"${n}"`).join('; ')}`);
      if (pictures) L.push(`  the attached picture is the moodboard as one overview (the owner allowed you to look at it)`);
    }
    if (x.refs) L.push(`Lab references: ${x.refs.map((r) => `${r.name} (${r.kind})`).join(', ')}`);
    if (x.song) {
      const s = x.song;
      L.push(`Song "${s.name}": ${[s.bpm && `${s.bpm} BPM`, s.key && `key ${s.key}`, s.duration && `${mmss(s.duration)} long`].filter(Boolean).join(', ') || 'not analysed yet'}`);
      if (s.sections.length) L.push(`  sections: ${s.sections.map((c) => `${c.label} ${mmss(c.start)}–${mmss(c.end)}${c.energy ? ` ${c.energy}` : ''}`).join(' · ')}`);
      if (s.drops.length) L.push(`  drops at ${s.drops.map(mmss).join(', ')}`);
    }
    if (x.scene) L.push(`Current scene "${x.scene.name}": ${x.scene.layers.length ? `layers ${x.scene.layers.join(', ')}` : 'empty'}${x.scene.palette.length ? `; palette ${x.scene.palette.join(' ')}` : ''}${x.scene.frame ? `; frame ${x.scene.frame}` : ''}`);
    L.push('', 'Reply with JSON only, no prose:',
      '{"mood": "3–6 words", "look": "one sentence on the visual look", "palette": ["#rrggbb", …4–6, from the moodboard where it has colors],',
      ' "tempo": [{"section": "Intro 0:00", "plan": "what happens visually"}, …one per song section, [] without a song],',
      ' "steps": ["3–6 concrete first steps for the director, each one build action"], "risks": ["0–3, e.g. heavy shader on a 4K export"],',
      ' "questions": ["0–3 questions for the owner, ONLY if something is truly ambiguous; else []"]}');
    return L.join('\n');
  }
  // the request: words always; the moodboard's one overview picture only with this project's explicit consent
  function request(x, { consent = false, picture = null } = {}) {
    const images = consent === true && picture && x.board?.pictures ? [picture] : [];
    return { text: prompt(x, { pictures: images.length }), images };
  }

  // ---------- the answer ----------
  const list = (v, n, m) => (Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? [v] : []).map((s) => clean(typeof s === 'string' ? s : s?.text || s?.step || '', m)).filter(Boolean).slice(0, n);
  function parse(text, x = {}) {
    const t = String(text || '');
    const a = t.indexOf('{'); const z = t.lastIndexOf('}');
    if (a < 0 || z <= a) return null;
    let j; try { j = JSON.parse(t.slice(a, z + 1)); } catch { return null; }
    if (!j || typeof j !== 'object') return null;
    const fromBoard = x.board?.palette || [];
    let palette = (Array.isArray(j.palette) ? j.palette : []).map((h) => String(h).trim().toLowerCase()).map((h) => (/^#[0-9a-f]{3}$/.test(h) ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h)).filter((h) => HEX.test(h));
    if (!palette.length) palette = fromBoard.length ? fromBoard : x.scene?.palette || [];
    const steps = list(j.steps, 6, 160);
    if (!steps.length) return null;
    return {
      mood: clean(j.mood || '', 60), look: clean(j.look || '', 200), palette: [...new Set(palette)].slice(0, 6),
      tempo: (Array.isArray(j.tempo) ? j.tempo : []).slice(0, 10).map((s) => ({ section: clean(s?.section || '', 40), plan: clean(s?.plan || '', 140) })).filter((s) => s.plan),
      steps, risks: list(j.risks, 3, 140), questions: list(j.questions, 3, 160),
    };
  }

  // ---------- what the director gets ----------
  // A fixed shape from the brief alone (no times, no counts that move): the same brief gives the same bytes (cachewise).
  function compact(b, name = 'this project') {
    if (!b) return '';
    const head = `PROJECT BRIEF ("${cap(name, 40)}"; whole brief: three_do brief). Follow it unless the owner says otherwise.`;
    const bits = [b.mood && `Mood: ${b.mood}.`, b.palette?.length && `Palette: ${b.palette.join(' ')}.`,
      b.tempo?.length && `Tempo: ${b.tempo.slice(0, 4).map((s) => `${s.section}: ${cap(s.plan, 50)}`).join('; ')}.`,
      b.steps?.length && `Steps: ${b.steps.map((s, i) => `${i + 1}) ${cap(s, 70)}`).join(' ')}`,
      b.questions?.length && `Open questions: ${b.questions.map((q) => cap(q, 60)).join(' / ')}`].filter(Boolean);
    let out = head;
    for (const s of bits) { const next = `${out}\n${s}`; if (next.length > PART_MAX) { const room = PART_MAX - out.length - 2; if (room > 40) out = `${out}\n${s.slice(0, room)}…`; break; } out = next; }
    return out;
  }
  // the whole brief as text: three_do brief, and the Edit dialog (fromText reads it back)
  function toText(b) {
    if (!b) return '';
    return [`Mood: ${b.mood || ''}`, `Look: ${b.look || ''}`, `Palette: ${(b.palette || []).join(' ')}`,
      'Tempo:', ...(b.tempo || []).map((s) => `- ${s.section}: ${s.plan}`),
      'Steps:', ...(b.steps || []).map((s) => `- ${s}`), 'Risks:', ...(b.risks || []).map((s) => `- ${s}`),
      'Questions:', ...(b.questions || []).map((s) => `- ${s}`)].join('\n');
  }
  function fromText(text) {
    const b = { mood: '', look: '', palette: [], tempo: [], steps: [], risks: [], questions: [] };
    let sec = null;
    for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
      const line = raw.trim(); if (!line) continue;
      const m = /^(mood|look|palette|tempo|steps|risks|questions)\s*:\s*(.*)$/i.exec(line);
      if (m) {
        const k = m[1].toLowerCase(); const v = m[2].trim();
        if (k === 'mood' || k === 'look') { b[k] = clean(v, k === 'mood' ? 60 : 200); sec = null; } else if (k === 'palette') { b.palette = (v.match(/#[0-9a-f]{6}\b/gi) || []).map((h) => h.toLowerCase()).slice(0, 6); sec = null; } else { sec = k; if (v) line2(sec, v); }
        continue;
      }
      if (sec) line2(sec, line.replace(/^[-•*]\s*|^\d+[.)]\s*/, ''));
    }
    function line2(k, v) {
      if (!v) return;
      if (k === 'tempo') { const i = v.indexOf(':'); b.tempo.push(i > 0 && i < 40 ? { section: clean(v.slice(0, i), 40), plan: clean(v.slice(i + 1), 140) } : { section: '', plan: clean(v, 140) }); } else b[k].push(clean(v, 160));
    }
    b.steps = b.steps.slice(0, 6); b.risks = b.risks.slice(0, 3); b.questions = b.questions.slice(0, 3); b.tempo = b.tempo.slice(0, 10);
    return b.steps.length ? b : null; // (a brief without steps isn't a plan: the edit is refused, the old one kept)
  }
  function full(b, name = 'this project', { at = 0, stale = [] } = {}) {
    if (!b) return `No brief for "${name}" yet: the owner can prepare one (the plan card's ✦ Prepare, or /brief). Look at the moodboard (board_vibe) and references yourself meanwhile.`;
    return `Project brief for "${name}"${at ? ` (written ${new Date(at).toISOString().slice(0, 10)})` : ''}${stale.length ? `; since then ${stale.join(', ')} changed: check them before relying on it` : ''}\n${toText(b)}`;
  }

  // ---------- the store ----------
  const empty = () => ({ v: 1, list: [] });
  const norm = (d) => (d && d.v === 1 && Array.isArray(d.list) ? { ...d, list: d.list.filter((e) => e && typeof e.id === 'string') } : empty());
  const entry = (d, id) => norm(d).list.find((e) => e.id === id) || null;
  // put: the entry for this project replaced (other projects' entries untouched: sync merges them one by one)
  function put(d, id, patch) {
    const n = norm(d); const i = n.list.findIndex((e) => e.id === id);
    const e = { ...(i >= 0 ? n.list[i] : { id }), ...patch, id };
    const list = n.list.slice(); if (i >= 0) list[i] = e; else list.push(e);
    return { ...n, list };
  }

  // what get() / prepare() hand out: the brief's fields with when / by whom, the consent, the steps done, the part's text
  const view = (e) => (e?.brief ? { ...e.brief, id: e.id, at: e.at || 0, by: e.by || null, eyes: e.eyes === true, done: Array.isArray(e.done) ? e.done.slice() : [], compact: e.compact || '', pictures: e.pictures || 0 } : null);

  // ---------- the whole flow ----------
  // deps: { gather(projectId, opts) → raw, ask({ text, images }) → { ok, text, usage, error }, picture(raw) → path | null,
  //         read() → the store, write(store), now() }. Pictures: only with the project's stored consent (`eyes`), or opts.eyes
  //         true, which only the owner's own tick passes. Returns the stored entry.
  async function prepare(projectId, opts = {}, deps = {}) {
    if (!projectId) throw new Error('No project.');
    const now = deps.now ? deps.now() : Date.now();
    const store = await deps.read();
    const was = entry(store, projectId);
    const consent = opts.eyes === true || (opts.eyes !== false && was?.eyes === true);
    const raw = await deps.gather(projectId, opts);
    const x = inputs(raw);
    const pic = consent && x.board?.pictures && deps.picture ? await deps.picture(raw).catch(() => null) : null;
    const rq = request(x, { consent, picture: pic });
    const r = await deps.ask(rq);
    if (!r?.ok) throw new Error(r?.error || 'The AI did not answer.');
    const brief = parse(r.text, x);
    if (!brief) throw new Error('The AI\'s answer wasn\'t a brief (no steps in it). Try again.');
    const e = { brief, compact: compact(brief, x.name), fp: fingerprints(x), at: now, by: r.by || null, eyes: consent, done: [], pictures: rq.images.length };
    await deps.write(put(await deps.read(), projectId, e));
    return { ...view({ id: projectId, ...e }), usage: r.usage || null };
  }

  // ---------- ✦ Build a first draft (round 129, draft129) ----------
  // The steps a draft builds: the brief's steps up to `upto` (1-based; all when none) that aren't ticked yet (0-based).
  function draftSteps(b, done = [], upto = 0) {
    const n = b?.steps?.length || 0;
    const end = upto > 0 ? Math.min(n, Math.floor(upto)) : n;
    const d = new Set(done || []);
    return Array.from({ length: end }, (_x, k) => k).filter((k) => !d.has(k));
  }
  const DRAFT_HEAD = 'Draft · build';
  // The one message the director gets on the owner's click (the owner's own message: no prompt part, no budget). keep:
  // the names of the layers already in the scene (the owner's): left alone unless a step names them.
  function draftMessage(b, name = 'this project', { steps = [], keep = [] } = {}) {
    if (!b || !steps.length) return '';
    const nums = steps.map((k) => k + 1);
    const run = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    const span = nums.length === 1 ? `step ${nums[0]}` : run ? `steps ${nums[0]}–${nums.at(-1)}` : `steps ${nums.join(', ')}`;
    const L = [`${DRAFT_HEAD} ${span} of the project brief for "${cap(name, 40)}" in this one reply: a first draft the owner can undo in one click.`];
    if (b.mood || b.look) L.push([b.mood && `Mood: ${b.mood}.`, b.look && `Look: ${b.look}`].filter(Boolean).join(' '));
    if (b.palette?.length) L.push(`Palette: ${b.palette.join(' ')}`);
    if (b.tempo?.length) L.push(`Tempo plan: ${b.tempo.map((t) => `${t.section ? `${t.section}: ` : ''}${cap(t.plan, 80)}`).join('; ')}`);
    L.push('Steps to build:', ...steps.map((k) => `${k + 1}) ${b.steps[k]}`));
    const keepWords = keep.length ? `Leave the layers already in the scene (${keep.slice(0, 12).map((n) => `"${cap(n, 30)}"`).join(', ')}) as they are unless a step names them.` : 'The scene starts empty or nearly: build on top.';
    L.push(`How: for each step add NEW layers (three_do add_layer) in the palette's colors; keyframe them to the song's sections where the tempo plan says (three_do keyframes, timeline_edit cues; three_do media_info has the section times); use looks and materials where a step asks. ${keepWords} When a step has landed, tick it: three_do {"cmd": "brief", "done": N} with its number (full tool list: three_brief {"done": N}). At the end take one three_screenshot, check it against the brief, and say in 2–4 lines what you built and what to try next.`);
    return L.join('\n');
  }
  // A rough cost of the draft run, from the chat's per-message base (the fixed prompt + tools + the chat so far, as
  // director-cost / chat-cost measure it): each step ≈ 3 model round trips (add, keyframes, tick), + 2 (the look, the
  // end); every trip re-reads the base (mostly from the cache) plus the tool results so far (≈ 500 tokens a trip).
  function draftCost({ steps = 1, base = 9000 } = {}) {
    const trips = Math.max(1, steps) * 3 + 2;
    const input = Math.round(trips * base + 500 * (trips * (trips - 1)) / 2);
    const output = Math.round(Math.max(1, steps) * 1400 + 300);
    return { trips, input, output, cachedShare: trips > 1 ? Math.round(((trips - 1) * base / input) * 100) / 100 : 0 };
  }
  const kfmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
  const draftLine = (c, who = 'Claude', model = '') => `About ${kfmt(c.input)} tokens in (most re-read from the cache) and ${kfmt(c.output)} out · ${who}${model ? ` · ${model}` : ''}`;

  const api = { STORE, PART_MAX, inputs, fingerprints, changed, prompt, request, parse, compact, toText, fromText, full, norm, entry, put, view, prepare, hash, redact, HEAD, draftSteps, draftMessage, draftCost, draftLine, DRAFT_HEAD };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
