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
//   })
//
// ctx: { agentId, chatId, input, say(text), draft(text), send(text), chat, agent, note(text, opts) }
//   say(text)   shows a note in the chat (not sent to the agent; falls back to a toast)
//   draft(text) puts text in the composer for you to edit and send
//   send(text)  sends text to this chat's agent as your message
//   note(text, { actions: [{ label, run }], id })  a note with buttons (id: replaces an older note with that id)
//
// Additive helpers: Commands.recent() (names, newest first), Commands.areas() (menu order),
// Commands.run(name, args, agentId), Commands.AREA_ORDER, Commands.closest(word) (typo → nearest command).
const Commands = (() => {
  const cmds = new Map(); // name -> def
  const alias = new Map(); // alias -> name
  const NAME = /^[a-z0-9][\w-]*$/i;
  // Menu / help order of the areas; unknown areas follow alphabetically.
  const AREA_ORDER = ['Yours', 'Chat', 'Messages', 'Compose', 'Agents', 'Style', 'Memory', 'Export', 'View', 'Navigate', 'App'];
  const areaRank = (a) => { const i = AREA_ORDER.indexOf(a); return i < 0 ? AREA_ORDER.length : i; };
  // Commands you ran lately come first in the "/" menu.
  const RECENT_KEY = 'commands.recent';
  const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };
  const noteRecent = (name) => { try { localStorage.setItem(RECENT_KEY, JSON.stringify([name, ...recent().filter((n) => n !== name)].slice(0, 8))); } catch { /* not critical */ } };

  function register(def) {
    if (!def?.name || !NAME.test(def.name) || typeof def.run !== 'function') throw new Error(`Bad command: ${def?.name}`);
    const name = def.name.toLowerCase();
    cmds.set(name, { area: 'Other', desc: '', args: '', aliases: [], ...def, name });
    for (const a of def.aliases || []) alias.set(String(a).toLowerCase(), name);
    return () => unregister(name);
  }
  function unregister(name) {
    const def = cmds.get(name);
    if (!def) return;
    cmds.delete(name);
    for (const a of def.aliases) if (alias.get(a.toLowerCase()) === name) alias.delete(a.toLowerCase());
  }
  const get = (name) => { const n = String(name || '').toLowerCase(); return cmds.get(n) || cmds.get(alias.get(n)); };
  const list = () => [...cmds.values()].sort((a, b) => areaRank(a.area) - areaRank(b.area) || a.area.localeCompare(b.area) || a.name.localeCompare(b.name));
  const areas = () => [...new Set(list().map((d) => d.area))];

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
    if (!q) { // nothing typed yet: your recent commands, then everything by area
      const rec = recent().map(get).filter((d) => d && !d.hidden);
      return [...rec, ...shown.filter((d) => !rec.includes(d))];
    }
    const starts = shown.filter((d) => d.name.startsWith(q) || d.aliases.some((a) => a.toLowerCase().startsWith(q)));
    const has = shown.filter((d) => !starts.includes(d) && (d.name.includes(q) || d.desc.toLowerCase().includes(q) || d.area.toLowerCase() === q));
    const rec = recent();
    const byRecent = (a, b) => ((rec.indexOf(a.name) + 1 || 99) - (rec.indexOf(b.name) + 1 || 99));
    return [...starts.sort(byRecent), ...has];
  }

  function context(agentId, input) {
    const chatId = H.activeChat?.[agentId] || null;
    return {
      agentId,
      chatId,
      input,
      say: (text) => Native.note(agentId, String(text)),
      draft: (text) => Native.setDraft(agentId, text),
      send: (text) => Native.sendText(agentId, text),
      note: (text, opts) => Native.note(agentId, String(text), opts),
      get chat() { return Native.current?.(agentId) || null; },
      get agent() { return H.agent(agentId) || null; },
    };
  }

  // The registered command nearest to a mistyped name (1–2 letters off), or null.
  function closest(word) {
    const w = String(word || '').toLowerCase();
    if (w.length < 3 || get(w)) return null;
    const dist = (a, b) => {
      const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
      for (let j = 1; j <= b.length; j++) d[0][j] = j;
      for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      return d[a.length][b.length];
    };
    let best = null;
    for (const d of cmds.values()) {
      for (const n of [d.name, ...d.aliases]) {
        const k = dist(w, n.toLowerCase());
        if (k <= (w.length > 5 ? 2 : 1) && (!best || k < best.k)) best = { def: d, k };
      }
    }
    return best?.def || null;
  }

  // Runs the command in text if there is one. Returns true when it was handled (the message isn't sent).
  async function tryRun(text, agentId, input) {
    const hit = parse(text);
    if (!hit) return false;
    const ctx = context(agentId, input);
    try {
      const out = await hit.def.run(hit.args, ctx);
      if (typeof out === 'string' && out) ctx.say(out);
      Usage.track(`Chat command › /${hit.def.name}`);
      noteRecent(hit.def.name);
    } catch (err) {
      toast(`/${hit.def.name}: ${err.message}`, { type: 'error' });
    }
    return true;
  }

  // Runs a command from code (agents' suggestion chips, other tools): Commands.exec('/astra hi', agentId)
  const exec = (text, agentId = H.claudeAgent()?.id) => tryRun(text.startsWith('/') ? text : `/${text}`, agentId, null);
  const run = (name, args = '', agentId) => exec(`/${name}${args ? ` ${args}` : ''}`, agentId);

  // ---- built-in commands ----
  register({
    name: 'help', aliases: ['commands', '?'], area: 'Chat', desc: 'List every chat command', args: '[filter]',
    run: (args) => {
      const rows = list().filter((d) => !args || `${d.name} ${d.desc} ${d.area}`.toLowerCase().includes(args.toLowerCase()));
      let area = '';
      const lines = [];
      for (const d of rows) {
        if (d.area !== area) { area = d.area; lines.push(`\n**${area}**`); }
        lines.push(`- \`/${d.name}${d.args ? ` ${d.args}` : ''}\` ${d.desc}${d.keys ? ` · ${d.keys}` : ''}${d.aliases.length ? ` (also /${d.aliases.join(', /')})` : ''}`);
      }
      return lines.length ? `${args ? '' : `${list().length} commands · click one to run it (or fill it in) · \`/help <word>\` filters\n`}${lines.join('\n').trim()}` : `No command matches “${args}”.`;
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

  return { register, unregister, get, list, parse, matching, tryRun, exec, paletteActions, recent, areas, run, AREA_ORDER, closest };
})();
