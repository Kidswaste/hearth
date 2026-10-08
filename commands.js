// Chat commands: "/name arguments" typed in any native chat composer runs a command instead of sending a
// message. Every feature registers its commands here so it can be driven from the chat; palette actions
// (Ctrl+K) and tools' commands are reachable too through /do.
//
//   Commands.register({
//     name: 'astra',                 // typed as /astra (letters, digits, - and _)
//     aliases: ['gpt'],              // optional other names
//     args: '<message>',             // optional usage hint shown in the menu and /help
//     desc: 'Send this to Astra',    // one line
//     area: 'Chat',                  // group in /help and the menu
//     run: async (args, ctx) => {}, // args = the rest of the line (string); may return text to show in the chat
//     complete: (args, ctx) => [],   // optional: argument suggestions [{ value, label?, hint? }]
//     hidden: false,                 // optional: works when typed but stays out of the menu
//     keys: 'Alt+T',                 // optional: the keyboard shortcut doing the same, shown in the menu
//     when: (ctx, args) => bool,     // optional: share the name with another stream's command; this one runs
//     whenLabel: 'in Video Review',  //   when `when` holds (e.g. in its tool), the other one otherwise
//     override: true,                // optional: deliberately replace an existing command (no warning)
//     examples: ['/size 9:16'],      // optional: ready-to-run lines shown in /help (with try-it buttons)
//     keywords: 'vertical portrait', // optional: more words the plain-language search knows it by
//     undo: '/undo-sliders',         // optional: how to take it back (listed by /undo-report)
//   })
// Names are shared by every stream: registering a taken name or alias replaces it and logs a console warning
// (Commands.duplicates() lists them; dev/checks/qa-commands.js). Check Commands.get(name) first, or use `when`.
//
// ctx: { agentId, chatId, input, source, place, say(text), draft(text), send(text), chat, agent, note(text, opts) }
//   say(text)   shows a note in the chat (not sent to the agent; falls back to a toast)
//   draft(text) puts text in the composer for you to edit and send
//   send(text)  sends text to this chat's agent as your message
//   note(text, { actions: [{ label, run }], id })  a note with buttons (id: replaces an older note with that id)
//   source      'chat' (a composer), 'bar' (the Ctrl+; command bar), 'timer' (/every, /at) or 'code'
//   place       where you are: 'chat' or the visible tool's id ('three', 'ae', 'forgeheart'…)
//
// Additive helpers: Commands.recent() (names, newest first), Commands.areas() (menu order),
// Commands.run(name, args, agentId), Commands.AREA_ORDER, Commands.closest(word) (typo → nearest command).
// Round 3 (the command bar, cmdbar.js): recent(place) per tool, favs() / toggleFav(name) / isFav(name),
// history() of command lines, last(), onRun(fn), place(), argHint(text), suggest(text) (plain words → command
// lines, all local, no tokens), didYouMean(text), examplesOf(def), addInfo({ name: { examples, keywords, args,
// undo } }), context(agentId, input, opts). tryRun(text, agentId, input, opts) takes { source, say, note, error }
// and pipes: "/calc 2*8 | draft" (draft · copy · send · note · say · file · speak · /another-command); "/a ; /b"
// typed straight runs as a chain. Commands a command runs (/run, aliases) print where it was run (the bar card…).
const Commands = (() => {
  const cmds = new Map(); // name -> def
  const alias = new Map(); // alias -> name
  const NAME = /^[a-z0-9][\w-]*$/i;
  // Menu / help order of the areas; unknown areas follow alphabetically.
  const AREA_ORDER = ['Yours', 'Chat', 'Messages', 'Compose', 'Agents', 'Style', 'Memory', 'Export', 'View', 'Navigate', 'App'];
  const areaRank = (a) => { const i = AREA_ORDER.indexOf(a); return i < 0 ? AREA_ORDER.length : i; };
  const readLS = (k, def) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v ?? def; } catch { return def; } };
  const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* not critical */ } };
  // Commands you ran lately come first in the "/" menu.
  const RECENT_KEY = 'commands.recent';
  const recentAll = () => readLS(RECENT_KEY, []);
  const noteRecent = (name) => writeLS(RECENT_KEY, [name, ...recentAll().filter((n) => n !== name)].slice(0, 8));
  // Where you are: the visible tool (Lab, Video Review, Forge…) or 'chat'. Recent commands are also kept per
  // place, so the "/" menu in the Lab offers what you ran in the Lab first.
  const PLACE_AREA = { three: 'Three.js Lab', ae: 'Video', forgeheart: 'Forge', 'forge-game': 'Forge', kit: 'Kit' };
  function place() {
    let sid = '';
    try { sid = H.surfaceIdFor(H.activeId) || ''; } catch { /* before the app is up */ }
    if (!String(sid).startsWith('tool:')) return { id: 'chat', label: 'Chat', area: 'Chat' };
    const id = sid.slice(5);
    let tool = null;
    try { tool = Tools.enabled().find((t) => t.id === id) || null; } catch { /* tools not loaded */ }
    return { id, label: tool?.name || id, area: PLACE_AREA[id] || (/forge/.test(id) ? 'Forge' : tool?.name || id) };
  }
  const PLACE_KEY = 'commands.recentByPlace';
  const recentAt = (p) => readLS(PLACE_KEY, {})[p] || [];
  function notePlace(name, p) { const all = readLS(PLACE_KEY, {}); all[p] = [name, ...(all[p] || []).filter((n) => n !== name)].slice(0, 8); writeLS(PLACE_KEY, all); }
  // recent() = everywhere (as before); recent('three') = what you ran while the Lab was on screen.
  const recent = (p) => (p ? recentAt(p) : recentAll());
  // Pinned ("starred") commands come first in the "/" menu (/star, ☆ in the menu and in /help).
  const FAV_KEY = 'commands.favs';
  const favs = () => readLS(FAV_KEY, []);
  const isFav = (name) => favs().includes(get(name)?.name || String(name || '').toLowerCase());
  function toggleFav(name, on) {
    const n = get(name)?.name || String(name || '').replace(/^\//, '').toLowerCase();
    const want = on ?? !favs().includes(n);
    writeLS(FAV_KEY, want ? [...favs().filter((x) => x !== n), n] : favs().filter((x) => x !== n));
    return want;
  }
  // Every command line you ran (oldest first, 150 kept): ↑ / ↓ in the command bar, /cmd-history.
  const HIST_KEY = 'commands.history';
  const history = () => readLS(HIST_KEY, []);
  function addHistory(line) {
    const t = String(line || '').trim();
    if (t) writeLS(HIST_KEY, [...history().filter((x) => x !== t), t].slice(-150));
  }
  // How often you ran each command (/cmd-stats; the plain-language search prefers the ones you use).
  const COUNT_KEY = 'commands.counts';
  const counts = () => readLS(COUNT_KEY, {});
  // Commands that never become "the last command" (/repeat would loop on itself).
  const NOT_LAST = new Set(['repeat', 'help', 'cmd-history', 'every', 'at', 'timers', 'timer-cancel', 'macro', 'how', 'what']);
  let lastLine = readLS('commands.last', '');
  const listeners = new Set();
  // Extra info other files add by name (examples, keywords, argument words, undo), kept apart from the defs so it
  // survives re-registering and load order (cmdbar-data.js).
  const info = new Map();

  // 'Ctrl+Shift+S' as the Mac shows it (⌘ does what Ctrl does in Hearth, Alt is ⌥)
  const keyText = (k) => (/Mac/.test(navigator.platform) ? String(k).replace(/Ctrl\+/g, '⌘').replace(/Alt\+/g, '⌥') : k);
  const dups = []; // [{ name, was, by }] names registered twice (see register)
  function noteDup(name, prev, def) {
    dups.push({ name, was: `/${prev.name} (${prev.area})`, by: `/${def.name} (${def.area || 'Other'})`, at: (new Error().stack || '').split('\n').slice(3, 6).map((l) => l.trim().replace(/^at /, '').replace(/\(?file:\/\/\S*\/([^/]+:\d+):\d+\)?/, '$1')).join(' < ') });
    console.warn(`Commands: /${name} registered again by /${def.name} (${def.area || 'Other'}), replacing /${prev.name} (${prev.area})`);
  }
  // Shared names: a def with `when: (ctx, args) => bool` (and `whenLabel`, e.g. 'in Video Review') shares its name
  // with whatever else registers that name (or has it as an alias), in any load order: the variant whose `when`
  // holds runs, otherwise the plain one. E.g. /compare is the Video A/B compare in Video Review, the token
  // comparison anywhere else.
  function combine(name, variants) {
    const base = variants.find((v) => !v.when) || variants[0];
    const pick = (ctx, args) => variants.find((v) => v.when && v !== base && v.when(ctx, String(args || ''))) || base;
    const extra = variants.filter((v) => v !== base && v.whenLabel).map((v) => ` · ${v.whenLabel}: ${v.desc}`).join('');
    const aliases = [...new Set(variants.filter((v) => v.name === name).flatMap((v) => v.aliases || []))];
    const examples = [...new Set(variants.flatMap((v) => v.examples || []))];
    const keywords = variants.map((v) => v.keywords || '').join(' ').trim();
    return { ...base, name, aliases, variants, desc: `${base.desc}${extra}`, when: undefined,
      examples: examples.length ? examples : undefined, keywords: keywords || undefined,
      run: (args, ctx) => pick(ctx, args).run(args, ctx),
      complete: (args, ctx) => pick(ctx, args).complete?.(args, ctx) || [] };
  }
  function register(def) {
    if (!def?.name || !NAME.test(def.name) || typeof def.run !== 'function') throw new Error(`Bad command: ${def?.name}`);
    const name = def.name.toLowerCase();
    let full = { area: 'Other', desc: '', args: '', aliases: [], ...def, name };
    const prev = cmds.get(name) || cmds.get(alias.get(name));
    if (prev && !def.override && (def.when || prev.when || prev.variants)) {
      full = combine(name, [...(prev.variants || [prev]), full]);
    } else if (!def.override) {
      // Otherwise names are first come, first served across streams and a second register() of a name or alias
      // replaces the first silently, so warn (dev aid; `override: true` marks a deliberate replacement).
      if (prev) noteDup(name, prev, def);
      for (const a of def.aliases || []) {
        const k = String(a).toLowerCase(), owner = cmds.get(k) || cmds.get(alias.get(k));
        if (owner && owner.name !== name) noteDup(k, owner, def);
      }
    }
    cmds.set(name, full);
    for (const a of full.aliases) alias.set(String(a).toLowerCase(), name);
    index = null;
    return () => unregister(name);
  }
  function unregister(name) {
    const def = cmds.get(name);
    if (!def) return;
    cmds.delete(name);
    for (const a of def.aliases) if (alias.get(a.toLowerCase()) === name) alias.delete(a.toLowerCase());
    index = null;
  }
  const get = (name) => { const n = String(name || '').toLowerCase(); return cmds.get(n) || cmds.get(alias.get(n)); };
  const list = () => [...cmds.values()].sort((a, b) => areaRank(a.area) - areaRank(b.area) || a.area.localeCompare(b.area) || a.name.localeCompare(b.name));
  const areas = () => [...new Set(list().map((d) => d.area))];
  const examplesOf = (def) => [...new Set([...(def?.examples || []), ...(info.get(def?.name)?.examples || [])])];
  const keywordsOf = (def) => `${def?.keywords || ''} ${info.get(def?.name)?.keywords || ''}`.trim();
  const undoOf = (def) => def?.undo || info.get(def?.name)?.undo || '';
  // addInfo({ size: { examples: ['/size 9:16'], keywords: 'vertical', args: { vertical: '9:16' }, undo: '…' } })
  function addInfo(map) {
    for (const [name, v] of Object.entries(map || {})) {
      const k = name.toLowerCase();
      const was = info.get(k) || {};
      info.set(k, { ...was, ...v, examples: [...new Set([...(was.examples || []), ...(v.examples || [])])], args: { ...(was.args || {}), ...(v.args || {}) } });
    }
    index = null;
  }

  // "/name rest of line" -> { def, args } when name is a registered command, else null.
  function parse(text) {
    const m = String(text || '').match(/^\/([\w-]+)(?:\s+([\s\S]*))?$/);
    if (!m) return null;
    const def = get(m[1]);
    return def ? { def, args: (m[2] || '').trim() } : null;
  }

  // Commands that start with what's typed (then ones that contain it), for the composer menu.
  function matching(query) {
    const q = String(query || '').toLowerCase();
    const shown = list().filter((d) => !d.hidden);
    if (!q) { // nothing typed yet: pinned commands, recent ones (here first, then anywhere), then everything by area
      const pins = favs().map(get).filter((d) => d && !d.hidden);
      const rec = [...recentAt(place().id), ...recentAll()].map(get).filter((d, i, a) => d && !d.hidden && !pins.includes(d) && a.indexOf(d) === i);
      return [...pins, ...rec, ...shown.filter((d) => !rec.includes(d) && !pins.includes(d))];
    }
    const starts = shown.filter((d) => d.name.startsWith(q) || d.aliases.some((a) => a.toLowerCase().startsWith(q)));
    const has = shown.filter((d) => !starts.includes(d) && (d.name.includes(q) || d.desc.toLowerCase().includes(q) || d.area.toLowerCase() === q || keywordsOf(d).toLowerCase().split(/\s+/).includes(q)));
    // the exact name first, then pinned, what you ran here, recent anywhere
    const rec = [...favs(), ...recentAt(place().id), ...recentAll()];
    const rank = (d) => (d.name === q ? -1 : (rec.indexOf(d.name) + 1 || 99));
    return [...starts.sort((a, b) => rank(a) - rank(b)), ...has];
  }

  // opts (all optional): { source: 'bar' | 'timer' | …, say(text), note(text, opts), draft(text) } redirect output.
  function context(agentId, input, opts = {}) {
    const chatId = H.activeChat?.[agentId] || null;
    return {
      agentId,
      chatId,
      input,
      source: opts.source || 'chat',
      place: place().id,
      say: opts.say || ((text) => Native.note(agentId, String(text))),
      draft: opts.draft || ((text) => Native.setDraft(agentId, text)),
      send: (text) => Native.sendText(agentId, text),
      note: opts.note || ((text, o) => Native.note(agentId, String(text), o)),
      get chat() { return Native.current?.(agentId) || null; },
      get agent() { return H.agent(agentId) || null; },
    };
  }

  const editDist = (a, b) => {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  };
  // The registered command nearest to a mistyped name (1–2 letters off), or null.
  function closest(word) {
    const w = String(word || '').toLowerCase();
    if (w.length < 3 || get(w)) return null;
    let best = null;
    for (const d of cmds.values()) {
      for (const n of [d.name, ...d.aliases]) {
        const k = editDist(w, n.toLowerCase());
        if (k <= (w.length > 5 ? 2 : 1) && (!best || k < best.k)) best = { def: d, k };
      }
    }
    return best?.def || null;
  }

  // ---------- plain language → commands (local index, no tokens) ----------
  // "make it 9 by 16" → /size 9:16 · "dark theme" → /theme midnight · "bpm 128" → /bpm 128 · "freeze" → /freeze
  // Words are scored against names (and their parts), aliases, keywords, descriptions and areas; leftover words
  // that are argument values (completions, numbers, ratios, on / off, argument words from addInfo) become args.
  const STOP = new Set('a an the it its this that these to for of in with and or please pls can could would will you i me my we our us make set turn switch change put use go get let do does want wanna need like into be is are some so just then thing stuff how what which way should'.split(' '));
  const stem = (w) => (w.length > 4 ? w.replace(/(ings?|ed|es|s)$/, '') : w);
  let index = null; // [{ def, name, parts, aliases, kw, desc, area }]
  function buildIndex() {
    index = [...cmds.values()].map((def) => ({
      def,
      parts: new Set(def.name.split(/[-_]/).map(stem)),
      aliases: new Set(def.aliases.map((a) => a.toLowerCase())),
      kw: new Set(keywordsOf(def).toLowerCase().split(/[\s,]+/).filter(Boolean).map(stem)),
      desc: new Set(String(def.desc || '').toLowerCase().replace(/[^\w\s:-]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem)),
      area: String(def.area || '').toLowerCase(),
    }));
    return index;
  }
  // Normalizes the words: "9 by 16" / "9x16" → 9:16, "1080 by 1920" → 9:16, "120 %" → 120%, "turn off" → off.
  function words(text) {
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    let s = String(text || '').toLowerCase().replace(/^\//, '').replace(/[“”"'!?,.;]+(\s|$)/g, ' ');
    s = s.replace(/\b(\d{1,4})\s*(?:by|x|×|:|\/|to)\s*(\d{1,4})\b/g, (m, a, b) => {
      let x = Number(a), y = Number(b);
      if (x > 32 || y > 32) { const g = gcd(x, y); x /= g; y /= g; }
      return x <= 32 && y <= 32 ? `${x}:${y}` : `${a}x${b}`;
    });
    s = s.replace(/(\d)\s+%/g, '$1%').replace(/(\d)\s*(minutes?|mins?)\b/g, '$1m').replace(/(\d)\s*(seconds?|secs?)\b/g, '$1s').replace(/(\d)\s*(hours?|hrs?)\b/g, '$1h')
      .replace(/(\d)\s+(ms|s|m|h|bpm|bars?|beats?)\b/g, '$1$2');
    return s.split(/\s+/).filter(Boolean);
  }
  const ARGISH = /^(on|off|\d[\d.:%x]*|#[0-9a-f]{3,8}|[+-]\d*|\d+(ms|s|m|h|bpm|bars?|beats?))$/i;
  // Sentences that combine commands: "every 5 minutes shuffle" → /every 5m /shuffle, "in 10 minutes freeze" →
  // /after 10m /freeze, "at 9pm backup now" → /at 9pm /backup now, "shuffle 3 times" → /repeat 3 /shuffle,
  // "freeze then still" → /run /freeze ; /still, "do it again" → /repeat.
  const UNIT = { minute: '1m', hour: '1h', second: '1s', sec: '1s', min: '1m', bar: '1bar', beat: '1beat' };
  const DUR = /^(\d+(?:\.\d+)?(?:ms|s|m|h)|\d+(?:bars?|beats?))$/;
  function compose(text, ctx) {
    const s = words(text).join(' ');
    const best = (t) => suggest(t, { limit: 1, ctx, inner: true })[0];
    const one = (t) => { const b = best(t); return b && !b.fill && !/^\/(every|at|after|run|repeat)\b/.test(b.line) ? b : null; };
    if (/^(again|do it again|repeat( that| it)?|once more|one more time)$/.test(s)) return [{ line: '/repeat', def: get('repeat') }];
    let m = s.match(/^(?:every|each)\s+(\d+\s?(?:bars?|beats?)|\S+)\s+(.+)$/);
    if (m) {
      const d = UNIT[m[1]] || m[1].replace(/\s/g, '');
      const b = (DUR.test(d) || /^\d+(bars?|beats?)$/.test(d)) && one(m[2]);
      if (b) return [{ line: `/every ${d.replace(/(\d)(bars?|beats?)$/, '$1 $2')} ${b.line.trim()}`, def: get('every') }];
    }
    m = s.match(/^(?:in|after)\s+(\S+)\s+(.+)$/);
    if (m && (DUR.test(m[1]) || UNIT[m[1]])) { const b = one(m[2]); if (b) return [{ line: `/after ${UNIT[m[1]] || m[1]} ${b.line.trim()}`, def: get('after') }]; }
    m = s.match(/^at\s+(\d{1,2}(?::\d{2})?\s?(?:am|pm)?|noon|midnight)\s+(.+)$/);
    if (m) { const b = one(m[2]); if (b) return [{ line: `/at ${m[1].replace(/\s/g, '')} ${b.line.trim()}`, def: get('at') }]; }
    m = s.match(/^(.+?)\s+(\d+)\s*(?:times|x)$/) || s.match(/^(twice|thrice)\s+(.+)$/);
    if (m) {
      const [n, rest] = /^(twice|thrice)$/.test(m[1]) ? [m[1] === 'twice' ? 2 : 3, m[2]] : [Number(m[2]), m[1]];
      const b = one(rest);
      if (b && n > 1 && n <= 50) return [{ line: `/repeat ${n} ${b.line.trim()}`, def: get('repeat') }];
    }
    const parts = s.split(/\s+(?:and then|then|after that)\s+|\s*;\s*/).filter(Boolean);
    if (parts.length > 1 && parts.length <= 6) {
      const lines = parts.map(one);
      if (lines.every(Boolean)) return [{ line: `/run ${lines.map((b) => b.line.trim()).join(' ; ')}`, def: get('run') }];
    }
    return [];
  }
  function suggest(text, { limit = 5, ctx = null, inner = false } = {}) {
    const composed = inner ? [] : compose(text, ctx).filter((c) => c.def).map((c) => ({ ...c, score: 30, fill: false }));
    if (composed.length) return [...composed, ...suggest(text, { limit: limit - 1, ctx, inner: true })].slice(0, limit);
    const all = words(text);
    const toks = all.filter((w) => !STOP.has(w));
    if (!toks.length) return [];
    const here = place();
    const rec = recentAll();
    const fv = favs();
    const runs = counts();
    const scored = [];
    for (const e of index || buildIndex()) {
      const d = e.def;
      let score = 0, strong = 0;
      const used = new Set();
      const argMap = info.get(d.name)?.args || {};
      const argSet = new Set(Object.values(argMap).map((v) => String(v).toLowerCase()));
      const argVals = [];
      for (const t of toks) {
        const st = stem(t);
        let s = 0;
        if (t === d.name) s = 9;
        else if (e.aliases.has(t)) s = 7;
        else if (argMap[t] != null) { argVals.push(argMap[t]); s = 4; }
        else if (argSet.has(t)) { argVals.push(t); s = 4; } // "9:16" is /size's (and /crop's) own value
        else if (e.parts.has(st)) s = e.parts.size === 1 ? 6 : 4;
        else if (e.kw.has(st)) s = 4;
        else if (t.length > 4 && [...e.parts].some((p) => p.length > 3 && editDist(st, p) === 1)) s = 2.5;
        else if (e.desc.has(st)) s = 1.2;
        else if (e.area && (e.area === t || e.area.split(/[\s.]+/).includes(t))) s = 1;
        if (s >= 4) strong += 1;
        if (s > 0) { score += s; used.add(t); }
      }
      if (!score || (!strong && score < 3.5)) continue;
      // context: commands of the tool on screen, pinned and recent ones, rank a little higher
      if (d.area === here.area || (d.variants && ctx && d.variants.some((v) => v.when && (() => { try { return v.when(ctx, ''); } catch { return false; } })()))) score += 2;
      if (fv.includes(d.name)) score += 1;
      if (rec.includes(d.name)) score += 0.5;
      if (runs[d.name]) score += Math.min(1.5, Math.log2(1 + runs[d.name]) * 0.4);
      if (d.hidden) score -= 1;
      score += Number(info.get(d.name)?.boost) || 0; // the ones you use most win ties (cmdbar-data.js)
      scored.push({ def: d, score, used, argVals });
    }
    scored.sort((a, b) => b.score - a.score || a.def.name.length - b.def.name.length);
    const out = [];
    for (const s of scored.slice(0, Math.max(limit * 3, 12))) {
      const d = s.def;
      // leftover words that look like values: completions of this command, numbers, on / off…
      const left = toks.filter((t) => !s.used.has(t));
      let opts = [];
      if (d.complete && left.length) {
        try { const r = d.complete('', ctx || { agentId: null }); if (Array.isArray(r)) opts = r; } catch { /* suggestions are optional */ }
      }
      const args = [...s.argVals];
      let bonus = 0;
      for (const t of left) {
        const o = opts.find((x) => String(x.value).toLowerCase() === t) || (t.length > 2 && opts.find((x) => String(x.value).toLowerCase().startsWith(t) || String(x.hint || x.label || '').toLowerCase().split(/\W+/).includes(t)));
        if (o) { args.push(String(o.value)); bonus += 3; } else if (ARGISH.test(t)) { args.push(t); bonus += 0.5; }
      }
      // "turn off the click track": an on/off word before the command name counts too
      if (!args.length && /\[?on ?\| ?off/.test(d.args || '')) { const w = all.find((x) => x === 'on' || x === 'off'); if (w) args.push(w); }
      const needs = /^</.test(String(d.args || '').trim());
      // a command that takes another /command (/every, /at, /run…) is never complete from words alone
      const wantsCmd = /<\/|\/command/.test(String(d.args || ''));
      const argText = [...new Set(args)].join(' ').replace(/(\d)(bars?|beats?)\b/g, '$1 $2');
      const fill = (needs && !argText) || wantsCmd;
      out.push({ def: d, line: `/${d.name}${argText ? ` ${argText}` : ''}${fill ? ' ' : ''}`, score: s.score + bonus, fill });
    }
    out.sort((a, b) => b.score - a.score);
    const seen = new Set();
    return out.filter((x) => !seen.has(x.line) && seen.add(x.line)).slice(0, limit);
  }
  // For a line that isn't a command: [{ def, line, score }] (a typo of a name first, then plain-language matches).
  function didYouMean(text, { limit = 3 } = {}) {
    const t = String(text || '').trim();
    const first = t.replace(/^\//, '').split(/\s+/)[0];
    if (/[/\\.]/.test(first)) return []; // a path ("/Users/me/x.js is broken") is a message, not a command
    const out = [];
    const typo = closest(first);
    if (typo) out.push({ def: typo, line: `/${typo.name}${t.includes(' ') ? ` ${t.slice(t.indexOf(' ') + 1).trim()}` : ''}`, score: 99 });
    for (const s of suggest(t, { limit: limit + 1 })) if (s.score >= 4 && !out.some((o) => o.def === s.def)) out.push(s);
    return out.slice(0, limit);
  }

  // The argument you are typing now, for the hint above the box: "/size 9" → { now: '<9:16|16:9|…>', … }.
  // parts: [{ text, state: 'done' | 'now' | 'next' }] from the command's args spec.
  // ctx (optional, { agentId }): a shared name shows the arguments of the variant that runs here (/look in the Lab).
  function argHint(text, ctx = null) {
    const m = String(text || '').match(/^\/([\w-]+)\s([\s\S]*)$/);
    const def = m && get(m[1]);
    if (!def) return null;
    let v = def;
    if (def.variants && ctx) { try { v = def.variants.find((x) => x.when && x.when(ctx, m[2])) || def.variants.find((x) => !x.when) || def; } catch { v = def; } }
    const spec = String(v.args || '').match(/<[^>]*>|\[[^\]]*\]|[^\s<[]+/g) || [];
    const typed = m[2];
    const n = typed.trim() ? typed.trim().split(/\s+/).length : 0;
    const at = Math.min(/\s$/.test(typed) || !typed ? n : n - 1, Math.max(spec.length - 1, 0));
    const parts = spec.map((p, i) => ({ text: p, state: i < at ? 'done' : i === at ? 'now' : 'next' }));
    return { def, parts, now: spec[at] || '', example: (v.examples || [])[0] || examplesOf(def)[0] || '', variant: v.when ? v.whenLabel || v.area : '' };
  }

  // "/x args | draft" → { cmd: '/x args', to: 'draft' } (only a known target after the last " | " is a pipe).
  const PIPE = /^([\s\S]*?\S)\s+\|\s*(draft|copy|send|note|notes|say|file|speak|grep\s+[^|]+|head(?:\s+\d+)?|\/[\w-]+[^|]*)\s*$/i;
  function splitPipe(text) {
    const m = String(text || '').match(PIPE);
    return m && parse(m[1].trim()) ? { cmd: m[1].trim(), to: m[2].trim() } : null;
  }
  // Text without Markdown marks (for pipes into the draft, the clipboard and other commands).
  const plain = (t) => String(t || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim();
  async function pipeTo(to, text, agentId, opts, raw = text) {
    const t = to.toLowerCase();
    if (!text) { toast('Nothing to pipe: that command printed no text', { timeout: 2500 }); return; }
    if (t === 'draft') { (opts.draft || ((x) => Native.setDraft(agentId, x)))(text); toast('The output is in the message box', { timeout: 1800 }); }
    else if (t === 'copy') { await navigator.clipboard.writeText(text); toast('Output copied', { timeout: 1600 }); }
    else if (t === 'send') await Native.sendText(agentId, text);
    else if (t === 'note' || t === 'notes') { await Notes.append(text); toast('Output saved to Notes', { timeout: 1800 }); }
    else if (t === 'say') (opts.say || ((x) => Native.note(agentId, x)))(text);
    else if (t === 'file') { const p = await window.hub.saveFile({ defaultPath: `hearth-output-${new Date().toLocaleDateString('en-CA')}.md`, content: text }); if (p) toast(`Saved ${p.split(/[\\/]/).pop()}`, { timeout: 2000 }); }
    else if (t === 'speak') { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text.slice(0, 4000))); }
    // grep <word> / head [n]: keep only matching lines / the first n, shown here (Markdown kept, so `/commands` stay clickable)
    else if (t.startsWith('grep ')) { const w = to.slice(5).trim().toLowerCase(); const keep = raw.split('\n').filter((l) => l.toLowerCase().includes(w)); (opts.say || ((x) => Native.note(agentId, x)))(keep.length ? keep.join('\n') : `No line with “${w}”.`); }
    else if (/^head\b/.test(t)) { const n = Number(t.split(/\s+/)[1]) || 10; (opts.say || ((x) => Native.note(agentId, x)))(raw.split('\n').filter((l) => l.trim()).slice(0, n).join('\n')); }
    else if (t.startsWith('/')) await tryRun(`${to} ${text.replace(/\s*\n+\s*/g, ' ')}`.slice(0, 4000), agentId, null, { ...opts, history: false });
  }

  // Runs the command in text if there is one. Returns true when it was handled (the message isn't sent).
  // opts: see context(); also { history: false } (don't add to the history), error(msg) (instead of a toast).
  // Commands run by a command (/run steps, your /alias, macros) inherit where its output goes (the bar's card,
  // a pipe's capture, a timer's toast) unless they pass their own opts; they don't enter the history.
  let active = null;
  async function tryRun(text, agentId, input, opts) {
    const nested = !opts && Boolean(active);
    opts = opts || (active ? { ...active, history: false } : {});
    // "/size 9:16 ; /freeze" typed straight: a chain (like /run), unless the first command takes commands itself
    const first = parse(text);
    if (first && /\s;\s*\/[\w-]/.test(text) && !/<\/|\/command|<name> <|\/cmd/.test(String(first.def.args || '')) && get('run') && first.def.name !== 'run') {
      text = `/run ${String(text).trim()}`;
    }
    const pipe = splitPipe(text);
    const hit = parse(pipe ? pipe.cmd : text);
    if (!hit) return false;
    let captured = '';
    const grab = (t) => { captured += `${captured ? '\n' : ''}${String(t ?? '')}`; };
    const ctx = context(agentId, input, pipe ? { ...opts, say: grab, note: (t) => grab(t) } : opts);
    let ok = true;
    const outer = active;
    active = { source: ctx.source, say: ctx.say, note: ctx.note, draft: opts.draft, error: opts.error };
    try {
      const out = await hit.def.run(hit.args, ctx);
      if (typeof out === 'string' && out) ctx.say(out);
      Usage.track(`Chat command › /${hit.def.name}`);
      noteRecent(hit.def.name);
      notePlace(hit.def.name, ctx.place);
      if (!nested) { const c = counts(); c[hit.def.name] = (c[hit.def.name] || 0) + 1; writeLS(COUNT_KEY, c); }
      if (pipe) await pipeTo(pipe.to, plain(captured), agentId, opts, captured);
    } catch (err) {
      ok = false;
      (opts.error || ((msg) => toast(msg, { type: 'error' })))(`/${hit.def.name}: ${err.message}`);
    } finally { active = outer; }
    const line = String(text).trim();
    if (opts.history !== false && ctx.source !== 'timer') addHistory(line);
    if (!nested && opts.history !== false && !NOT_LAST.has(hit.def.name) && ctx.source !== 'timer') { lastLine = line; writeLS('commands.last', line); }
    for (const fn of listeners) { try { fn({ line, def: hit.def, args: hit.args, ok, source: ctx.source, place: ctx.place, agentId, nested: nested || opts.history === false }); } catch { /* a listener never breaks a command */ } }
    return true;
  }
  // onRun(({ line, def, args, ok, source, place, agentId }) => …) after every command; returns an unsubscribe.
  const onRun = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

  // Runs a command from code (agents' suggestion chips, other tools): Commands.exec('/astra hi', agentId)
  const exec = (text, agentId = H.claudeAgent()?.id, opts) => tryRun(text.startsWith('/') ? text : `/${text}`, agentId, null, opts);
  const run = (name, args = '', agentId) => exec(`/${name}${args ? ` ${args}` : ''}`, agentId);

  // ---- built-in commands ----
  function helpList(filter) {
    const f = String(filter || '').toLowerCase();
    const rows = list().filter((d) => !f || `${d.name} ${d.desc} ${d.area} ${keywordsOf(d)}`.toLowerCase().includes(f));
    let area = '';
    const lines = [];
    for (const d of rows) {
      if (d.area !== area) { area = d.area; lines.push(`\n**${area}**`); }
      lines.push(`- \`/${d.name}${d.args ? ` ${d.args}` : ''}\` ${d.desc}${d.keys ? ` · ${keyText(d.keys)}` : ''}${d.aliases.length ? ` (also /${d.aliases.join(', /')})` : ''}`);
    }
    return lines.length ? `${f ? '' : `${list().length} commands · click one to run it (or fill it in) · \`/help\` alone opens the searchable view\n`}${lines.join('\n').trim()}` : `No command matches “${filter}”.`;
  }
  register({
    name: 'help', aliases: ['commands', '?'], area: 'Chat', desc: 'Every chat command: alone, the searchable help view (areas, examples, keys); /help <word> lists matches here; /help list: everything as text', args: '[filter | list]',
    examples: ['/help', '/help lab', '/help list'],
    run: (args, ctx) => {
      const a = String(args || '').trim();
      const view = typeof CmdBar !== 'undefined' && CmdBar.help;
      if (/^list\b/i.test(a)) return helpList(a.replace(/^list\s*/i, ''));
      if (view && (!a || ctx?.source === 'bar')) { CmdBar.help(a); return null; }
      return helpList(a);
    },
  });
  register({
    name: 'do', aliases: ['action'], area: 'App', args: '<action>', desc: 'Run any Ctrl+K palette action or tool command by name',
    complete: (args) => paletteActions().filter((a) => a.label.toLowerCase().includes(args.toLowerCase())).slice(0, 12).map((a) => ({ value: a.label, hint: a.kind })),
    run: (args) => {
      if (!args) { AppUI.palette(); return; }
      const q = args.toLowerCase();
      const all = paletteActions();
      const hit = all.find((a) => a.label.toLowerCase() === q) || all.find((a) => a.label.toLowerCase().startsWith(q)) || all.find((a) => a.label.toLowerCase().includes(q));
      if (!hit) return `No action matches “${args}”. Try /do with no name to open the palette.`;
      hit.run();
    },
  });
  register({
    name: 'prompt', area: 'Chat', args: '<name>', desc: 'Insert a saved prompt from the prompt library',
    complete: async (args) => (await Prompts.load()).filter((p) => p.name.toLowerCase().includes(args.toLowerCase())).slice(0, 10).map((p) => ({ value: p.name })),
    run: async (args, ctx) => {
      const all = await Prompts.load();
      const p = all.find((x) => x.name.toLowerCase() === args.toLowerCase()) || all.find((x) => x.name.toLowerCase().includes(args.toLowerCase()));
      if (!p) { Prompts.manage(); return; }
      const text = await Prompts.fill(p);
      if (text != null) ctx.draft(text);
    },
  });

  // Palette actions and tool commands, as { label, kind, run }.
  function paletteActions() {
    const out = [];
    for (const t of Tools.enabled?.() || []) {
      for (const c of t.commands || []) out.push({ kind: t.name, label: c.label, run: () => { activate(`tool:${t.id}`); setTimeout(c.run, 50); } });
    }
    for (const a of AppUI.actions?.() || []) out.push({ kind: 'Action', label: a.label, run: a.run });
    return out;
  }

  return {
    register, unregister, get, list, parse, duplicates: () => dups.slice(), keyText, matching, tryRun, exec, paletteActions, recent, areas, run, AREA_ORDER, closest,
    // round 3: command bar, plain-language search, favorites, history, examples
    place, favs, isFav, toggleFav, history, addHistory, counts, last: () => lastLine, onRun, context, suggest, didYouMean, argHint, splitPipe,
    addInfo, info: (name) => info.get(String(name || '').toLowerCase()) || {}, examplesOf, keywordsOf, undoOf, helpList, words,
  };
})();
