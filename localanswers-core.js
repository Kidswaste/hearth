// 💡 Answered by Hearth (round 45, localanswers): the pure part, no DOM, Node-tested (dev/localanswers-test.js).
// The owner often asks the AI about Hearth itself ("how do I export 9:16?", "where's the spending limit?", "how do I
// make it move with the beat?", "what changed today?"): each is a full paid AI turn. This decides, on this computer and
// for free, whether a plain chat message is such a question and what Hearth's own answer is:
//   · shape(text)            the cheap gate (sync, every send): a short question, no code, no file names, not a request
//                            to the AI ("can you…", "write…"), not about programming or the owner's own writing / code
//   · build({ C, D, extra }) the answers: Find anything's "how do I…" answers, Settings and ⋯ AI setup rows
//                            (appsearch-data.js), Lab search's answers (tools/three-search-core.js), EXTRA below; ranked
//                            with the shared search core and the app's + the Lab's words
//   · answer(ix, text, o)    → { id, kind, title, text, go, score, key } | null: confident only when EVERY word of the
//                            question that says what it's about is explained by that one answer (a work question always
//                            has a word of its own: "spiral", "logo", "chapter", "1:20"…), at least one of them not a
//                            generic one ("fix", "better"), the score high enough. o.director: the Lab director chat —
//                            only a question about the Lab's UI ("where's the slider…", "which key…"), only Lab answers
//   · news(notes, text)      "what changed today?" / "what's new in the Lab?" → from the patch notes (WhatsNewCore
//                            when there, else the parts' names)
//   · keyOf(text)            the question's words, sorted: "Ask the AI anyway" adds it to the misses (it stops answering)
const LocalAnswersCore = (() => {
  // ---------- the gate ----------
  const OPEN = /^(?:(?:so|and|ok|okay|hey|hi|um|quick question|btw)[,:]?\s+)?(?:how|where|which|what|whats|wheres|hows|is there|are there|can i|could i|do i|does hearth|is it possible|any way)\b/;
  const CODE = /```|`[^`]+`|[{};<>]|=>|\w\(\)|\b[\w-]+\.(?:js|mjs|ts|tsx|jsx|py|css|html?|json|glsl|frag|vert|md|txt|png|jpe?g|gif|mp4|mov|wav|mp3|blend|glb|gltf|aep|psd)\b|https?:\/\/|\b[a-z]:\\|["“][^"”]{3,}["”]/i;
  // a request to the AI, not a question about the app
  const ASK_AI = /^(?:(?:can|could|would|will) you|please|pls)\b|\bfor me\b|\b(?:can|could|would) you\b/;
  // the owner's own work: writing, code, debugging
  const WORK_VERB = /\b(?:write|rewrite|draft|translate|summari[sz]e|explain|debug|refactor|optimi[sz]e|implement|proofread|brainstorm|rephrase|paraphrase|critique|compose)\b/;
  const WORK_NOUN = /\b(?:my|this|that|these|those|our|his|her|their|the)\s+(?:code|function|functions|script|shader|story|chapter|essay|novel|poem|book|character|characters|plot|paragraph|sentence|draft|article|email|letter|bug|bugs|error|errors|variable|component|repo|repository|program|level|lyrics|verse|chorus|edit|logo|pitch|script's|stack trace|class|method|loop|array|query)\b/;
  const TECH = /\b(?:javascript|typescript|python|java|c\+\+|c#|rust|golang|kotlin|swift|sql|regex|regexp|vue|angular|svelte|node\.?js|npm|webgl|glsl|hlsl|three\.?js|uniforms?|vertex|fragment|github|docker|css|html|div|flexbox|array|integer|const|recursion|algorithm|compiler?|loop through|for loop|async|await|promise|typeerror|undefined|null|nan|stack trace|exception|segfault)\b/;
  const NEWS = /\b(?:what(?:s| is| has| have)? (?:new|changed)|what changed|whats changed|patch notes|change ?log|release notes|latest (?:update|changes|version)|recent changes|since (?:the )?(?:last )?update|new in (?:the )?(?:latest|last|this) (?:update|round|version))\b/;
  const fold = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
  // → { text, news } when it may be a question about Hearth, else null (sent as it is)
  function shape(text) {
    const t = String(text ?? '').trim();
    if (!t || t.length > 180 || /\n/.test(t) || t.startsWith('/') || t.startsWith('>')) return null;
    if (CODE.test(t)) return null;
    const f = fold(t);
    if (f.split(' ').length > 20) return null;
    if (ASK_AI.test(f) || WORK_VERB.test(f) || WORK_NOUN.test(f) || TECH.test(f) || /^why\b|\bwhy (?:is|does|do|isnt|doesnt|did|wont|cant)\b/.test(f)) return null;
    const isNews = NEWS.test(f);
    if (!isNews && !(t.endsWith('?') || OPEN.test(f))) return null;
    return { text: t, news: isNews };
  }

  // ---------- words ----------
  // said in every question, they don't say what it's about (the core's own little words are dropped too)
  const DROP = new Set('hearth hearths app apps i we us our you your it its they them there here whats wheres hows thats theres whos dont doesnt cant wont isnt im ive id find open see show use using used set put go goe going turn switch change changing add do doe did done have ha had need want possible able anyway again version way option feature thing place spot located location button menu setting where how what which when who why can could should would will is are was were be been get got let lets please one some any anything something somewhere claude astra ai ais assistant agent chatgpt codex gpt today lately recently now currently still also even ever exactly actually there also mine myself onto into from about'.split(' '));
  // a question whose only words are these says too little to be sure ("how do I fix it?")
  const GENERIC = new Set('fix better good nice fast faster slow slower big bigger small smaller look work start stop run new help problem issue idea best right wrong less all every cool nicer quick easy easier simple'.split(' '));
  // the UI words a question in the Lab director chat must have to be about the Lab's own UI (else it's for the director)
  const UI = /\b(?:where(?:s| is| are| do i find| can i find)?|button|buttons|menu|menus|slider|sliders|toolbar|key|keys|shortcut|shortcuts|keyboard|right[- ]click|setting|settings|panel|tab|icon|which)\b/;

  // ---------- extra answers (what the other catalogs don't say in one place) ----------
  // { title, tags, text, go?: { type: 'lab', label } | { type: 'set'|'ai', id } | { type: 'menu', sel, label } |
  //   { type: 'tool', id } | { type: 'news' } | { type: 'palette' } | { type: 'mission', id }, lab?: true (a Lab answer) }
  const EXTRA = [
    { title: 'How do I make a 9:16 (vertical) version for TikTok, Reels or Shorts?', tags: '9:16 vertical portrait tiktok reels shorts story export render video all formats square 1:1 4:5 16:9 instagram youtube', text: 'In the Lab, toolbar ⋯ › ▦ All formats makes 16:9, 9:16, 1:1 and 4:5 in one go, each reframed. For the preview alone: right-click it › Frame size › 9:16 (Shift+2).', go: { type: 'lab', label: '▦ All formats' }, lab: true, boost: 0.1 },
    { title: 'How do I render or export a video of my Lab scene?', tags: 'render export video mp4 movie file output save lab scene', text: 'Right-click the Lab preview › ⇪ Make & export. Every format at once: ▦ All formats (toolbar ⋯). Renders wait in the render queue.', go: { type: 'lab', label: '⇪ Make & export' }, lab: true },
    { title: 'How do I make many videos from one template?', tags: 'batch many videos bulk list csv titles songs folder every song template mass at once lots', text: 'Right-click the Lab preview › ⇪ Make & export › ⧉ Make a batch…: a template or this scene, one title per line (or a CSV or a folder of songs), the formats; Make queues them.', go: { type: 'lab', label: '⧉ Make a batch…' }, lab: true },
    { title: 'Where is the spending limit?', tags: 'spending limit weekly limit budget cap tokens cost money max maximum', text: '⋯ AI setup › Spending › Weekly limit: a weekly limit of tokens for this AI, and what happens near it.', go: { type: 'ai', id: 'ai:limit' } },
    { title: 'How do I pin a chat to the top?', tags: 'pin chat top pinned keep favourite favorite', text: 'Right-click the chat header (or its ⋯) › Organise › Pin to top.', go: { type: 'menu', sel: '.surface.active .native-head', label: 'Organise' } },
    { title: 'How do I rename a chat?', tags: 'rename chat title name', text: 'Right-click the chat header (or its ⋯) › Organise › Rename…, or double-click the chat\'s title.', go: { type: 'menu', sel: '.surface.active .native-head', label: 'Organise' } },
    { title: 'How do I export or copy a whole chat?', tags: 'export copy chat markdown json file save conversation download', text: 'Right-click the chat header (or its ⋯) › Copy & export: Copy as Markdown, Export as a Markdown file, or as JSON to import later.', go: { type: 'menu', sel: '.surface.active .native-head', label: 'Copy & export' } },
    { title: 'How do I delete a chat?', tags: 'delete remove trash chat conversation', text: 'Right-click the chat header (or its ⋯) › Delete chat. It stays in Recently deleted for 30 days (Ctrl/⌘+K › Recently deleted chats).', go: { type: 'menu', sel: '.surface.active .native-head', label: 'Delete chat' } },
    { title: 'How do I switch the model of a chat?', tags: 'model switch opus sonnet haiku chat pick which model', text: 'Right-click the chat header (or its ⋯) › Model: this chat only. For every chat with this AI: ⋯ AI setup › How hard it thinks.', go: { type: 'menu', sel: '.surface.active .native-head', label: 'Model' } },
    { title: 'How do I attach a file or a picture?', tags: 'attach file picture image screenshot upload send board capture', text: '＋ next to Send: files, the board, a capture, the Lab\'s frame or a screen region. Or drop / paste them in the chat box.' },
    { title: 'How do I undo a change in Hearth?', tags: 'undo change revert back mistake recent changes', text: 'Ctrl/⌘+Z outside a text box undoes the last change. ◉ Activity › Recent changes lists them; one click undoes any. The Lab has its own undo and ⟲ History.' },
    { title: 'How do I search everything in Hearth?', tags: 'search everything find anything palette command ctrl k where is', text: 'Ctrl/⌘+K is Find anything: every setting, AI setup row, menu, chat and answer, in plain words. Enter takes you there.', go: { type: 'palette' } },
    { title: 'Where is the mood board?', tags: 'mood board moodboard references refs vibe images board', text: '▦ Board in the rail: drag pictures, videos and websites in. A chat uses its vibe when you drag a reference into the chat.', go: { type: 'tool', id: 'board' } },
    { title: 'How do I see what changed since my last update?', tags: 'since away missed digest update changes rounds catch up', text: 'Settings › Updates & what\'s new › What\'s new… › Since you were away: the top changes of every round you missed, one page.', go: { type: 'set', id: 'set:whatsnew' } },
    { title: 'How do I update Hearth?', tags: 'update upgrade latest version new version install', text: 'Settings › Updates & what\'s new › Look for updates now. Nothing installs without you; ↶ Go back undoes an update.', go: { type: 'set', id: 'set:update-now' } },
    { title: 'How do I make Hearth bigger or smaller on screen?', tags: 'zoom bigger smaller size text ui scale everything screen readable', text: 'Settings › Look & size › Size of everything: Auto picks it from the screen; 100 … 200 %, kept per screen.', go: { type: 'set', id: 'set:ui-size' } },
    { title: 'How do I ask Claude and Astra together?', tags: 'astra claude together both side by side swarm debate ask everyone several ais second opinion', text: '◎ in the chat box: Side by side, Debate, Swarm or Ask everyone for the next message (📌: every message).', go: { type: 'ai', id: 'ai:next' } },
    { title: 'How do I randomize or shuffle the Lab sliders?', tags: 'shuffle random randomize sliders variations surprise dice lab', text: 'R shuffles the selected layer\'s sliders (Shift+R: back). 🎲 Variations (toolbar ⋯) shows 6 takes of the whole scene, no tokens.', go: { type: 'lab', label: '🎲 Variations' }, lab: true },
    { title: 'How do I compare before and after in the Lab?', tags: 'before after compare ab a/b difference lab', text: 'Lab toolbar ⋯ › ◧ Before / after: hold or tap B to flip between them.', lab: true },
  ];

  // ---------- the answers ----------
  // a few ways questions say it (on top of Find anything's and the Lab's)
  const PHRASES = [['back up', 'backup backups'], ['tokens go', 'tokens go'], ['move with the music', 'move slider music'], ['react to the music', 'react music']];
  const kindLean = { extra: 0.3, help: 0.3, labhelp: 0.3, aisetup: 0.06, setting: 0.04 };
  // build({ C: LabSearchCore, D: AppSearchData, extra }) → { ix, V, items }
  function build({ C, D, extra = EXTRA } = {}) {
    const items = [];
    const goOf = (g) => (!g ? null : g.startsWith('set:') ? { type: 'set', id: g } : g.startsWith('ai:') ? { type: 'ai', id: g } : g.startsWith('mission:') ? { type: 'mission', id: g.slice(8) } : null);
    for (const h of extra) items.push({ id: `x:${h.title}`, kind: 'extra', label: h.title, tags: h.tags, hint: h.text, text: h.text, go: h.go || null, lab: Boolean(h.lab), boost: h.boost || 0 });
    for (const h of D?.HELP || []) items.push({ id: `h:${h.title}`, kind: 'help', label: h.title, tags: h.tags, hint: h.text, text: h.text, go: goOf(h.go), lab: /\blab\b/i.test(h.title) });
    for (const h of C?.HELP || []) items.push({ id: `l:${h.title}`, kind: 'labhelp', label: h.title, tags: `lab ${h.tags}`, hint: h.text, text: h.text, go: { type: 'lab', label: h.go || '', q: h.go ? '' : h.tags.split(' ').slice(0, 2).join(' ') }, lab: true });
    for (const s of D?.SETTINGS || []) {
      if (s.id.startsWith('set:sw:')) continue;
      items.push({ id: `s:${s.id}`, kind: 'setting', label: s.label, tags: s.tags, hint: s.hint, path: s.path, text: `${s.path} › ${s.label.replace(/…$/, '')}: ${lower(s.hint)}.`, go: { type: 'set', id: s.id } });
    }
    for (const r of D?.AI_SETUP || []) {
      const tail = r.path.split(' › ').at(-1);
      const where = r.label.startsWith(tail) ? r.path.split(' › ').slice(0, -1).join(' › ') : r.path;
      items.push({ id: `a:${r.id}`, kind: 'aisetup', label: r.label, tags: r.tags, hint: r.hint, path: r.path, text: `${where} › ${r.label.replace(/…$/, '')}: ${lower(r.hint)}.`, go: { type: 'ai', id: r.id } });
    }
    const V = C.vocab({ syn: D?.SYN || [], phrases: [...PHRASES, ...(D?.PHRASES || [])], kind: kindLean, base: C.LAB });
    return { ix: C.build(items, { vocab: V }), V, items, C };
  }
  const lower = (s) => { const t = String(s || '').replace(/[.\s]+$/, ''); return /^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t; };

  // the words that say what a question is about (raw, so the core stems them once)
  function content(C, text) {
    const raw = C.fold(text).match(/[a-z0-9]+(?::[0-9]+)?/g) || [];
    return raw.filter((w) => { const s = C.stem(w); return !C.STOP.has(s) && !C.STOP.has(w) && !DROP.has(s) && !DROP.has(w); });
  }
  function keyOf(text, C = (typeof LabSearchCore !== 'undefined' ? LabSearchCore : null)) {
    if (!C) return fold(text);
    return [...new Set(content(C, text).map((w) => C.stem(w)))].sort().join(' ');
  }
  // is every word of the question explained by this answer? (its own words, its synonyms, a phrase's meaning, a typo)
  function covers(C, V, item, terms) {
    const iw = item.__w || (item.__w = new Set(['label', 'tags', 'hint', 'path'].flatMap((f) => C.words(item[f]))));
    const near = (w) => {
      if (iw.has(w)) return true;
      const max = w.length >= 7 ? 2 : w.length >= 4 ? 1 : 0;
      for (const t of iw) {
        if (w.length >= 4 && t.startsWith(w)) return true;
        if (max && Math.abs(t.length - w.length) <= max && t[0] === w[0] && C.dist(w, t, max) <= max) return true;
      }
      return false;
    };
    // solid: terms found as said (or a phrase's meaning), not a generic word; a term found only by a synonym counts
    // for "all" but not for "solid" ("spending limit" must not land on "save my sliders" through save ↔ spend ↔ limit)
    let solid = 0;
    for (const term of terms) {
      const hard = term.phrase ? term.alts.some(([w]) => near(w)) : term.alts.some(([w, wt]) => wt >= 1 && near(w));
      const ok = hard || term.alts.some(([w]) => iw.has(w));
      if (!ok) return { all: false, solid };
      if (hard && (term.phrase || term.words.some((w) => !GENERIC.has(w)))) solid += 1;
    }
    return { all: true, solid };
  }
  const MIN = 1.2; // the top answer's score (all terms found once ≈ 1 a term + the name / kind leans)
  // answer(built, text, { director, misses: Set of keys }) → the answer, or null (send it as usual)
  function answer(built, text, { director = false, misses = null, limit = 8 } = {}) {
    const sh = shape(text);
    if (!sh || sh.news) return null;
    const { C, V, ix } = built;
    if (director && !UI.test(fold(text))) return null;
    const words = content(C, text);
    if (!words.length || words.length > 7) return null;
    const key = keyOf(text, C);
    if (misses?.has(key)) return null;
    const q = words.join(' ');
    const terms = C.parse(q, V);
    if (!terms.length) return null;
    const res = C.search(ix, q, { limit: 40 });
    let n = 0;
    for (const r of res) {
      if (r.score < MIN || n >= limit) break;
      if (director && !r.item.lab) continue;
      n += 1;
      const cov = covers(C, V, r.item, terms);
      if (!cov.all || !cov.solid) continue;
      const it = r.item;
      return { id: it.id, kind: it.kind, title: it.label, text: twoLines(it.text), go: it.go, score: r.score, key, lab: it.lab };
    }
    return null;
  }
  // at most two plain lines: whole sentences up to ≈ 230 characters
  function twoLines(s, max = 230) {
    const t = String(s || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]*)`/g, '$1').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const parts = t.match(/[^.!?]+[.!?]+(?:\s|$)/g) || [t];
    let out = '';
    for (const p of parts) { if ((out + p).length > max) break; out += p; }
    return (out || `${t.slice(0, t.lastIndexOf(' ', max - 1))}…`).trim();
  }

  // ---------- what changed ----------
  // notes: [{ round, text }] newest first; W: WhatsNewCore (optional) → { id, kind: 'news', title, text, go, key } | null
  const NEWS_WORDS = new Set('new changed change changes patch notes note changelog release latest update updates round version recent recently today lately week since last this the in with of hearth app what whats has have is are got'.split(' '));
  const GROUP_WORDS = { lab: /\b(lab|three|scenes?|preview|renders?|music|director|slider)/, chats: /\b(chats?|ai|ais|astra|claude|missions?|messages?|replies)\b/, tokens: /\b(tokens?|cost|spending|cheaper|money)\b/, macwin: /\b(mac|windows|pc)\b/ };
  const partsOf = (text) => String(text || '').split(/\n(?=## )/).slice(1).map((c) => c.split('\n')[0].replace(/^##\s*/, '').replace(/^[^\p{L}\p{N}]+/u, '').trim()).filter((p) => p && !/^good to know/i.test(p));
  function news(notes, text, { W = (typeof WhatsNewCore !== 'undefined' ? WhatsNewCore : null), misses = null } = {}) {
    const sh = shape(text);
    if (!sh || !sh.news || !notes?.length) return null;
    const key = `news ${fold(text).replace(/[^a-z0-9 ]+/g, '')}`;
    if (misses?.has(key)) return null;
    const rest = fold(text).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w && !NEWS_WORDS.has(w) && !DROP.has(w));
    const newest = notes[0];
    const head = (n) => (/^#\s+(.+)$/m.exec(n.text || '') || [])[1] || `Round ${n.round}`;
    if (!rest.length) {
      const parts = partsOf(newest.text);
      if (!parts.length) return null;
      const list = parts.slice(0, 4).join(', ') + (parts.length > 4 ? ` and ${parts.length - 4} more` : '');
      return { id: `news:${newest.round}`, kind: 'news', title: head(newest), text: twoLines(`Round ${newest.round}, the newest: ${list}.`), go: { type: 'news', round: newest.round }, key, score: 9 };
    }
    // about something: "what's new in the Lab?" → the newest rounds' parts in that group, or naming those words
    const want = rest.join(' ');
    const group = Object.entries(GROUP_WORDS).find(([, re]) => re.test(want))?.[0] || null;
    const hits = [];
    for (const n of notes.slice(0, 3)) {
      const items = W ? W.parse(n.text, n.round).items.filter((x) => x.kind === 'feature') : partsOf(n.text).map((p) => ({ name: p, line: '', group: null, part: p }));
      for (const it of items) {
        const hay = fold(`${it.name} ${it.line || ''}`);
        if ((group && it.group === group) || rest.every((w) => hay.includes(w.replace(/s$/, '')))) hits.push({ ...it, round: n.round });
      }
    }
    if (!hits.length) return null;
    const names = [...new Set(hits.map((h) => h.name))];
    const line = names.slice(0, 4).join(', ') + (names.length > 4 ? ` and ${names.length - 4} more` : '');
    const first = hits[0];
    return { id: `news:${first.round}:${want}`, kind: 'news', title: `What's new: ${want}`, text: twoLines(`Lately${group ? ` in ${group === 'macwin' ? 'Mac & Windows' : group === 'tokens' ? 'saving tokens' : group === 'chats' ? 'chats' : 'the Lab'}` : ''}: ${line}${first.line ? ` — ${first.name}: ${first.line}` : ''}.`), go: { type: 'news', round: first.round, part: first.part || first.name }, key, score: 8 };
  }

  return { shape, build, answer, news, keyOf, content, covers, twoLines, fold, EXTRA, DROP, GENERIC, UI, MIN };
})();
if (typeof module !== 'undefined') module.exports = LocalAnswersCore;
