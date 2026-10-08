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
//   })
//
// ctx: { agentId, chatId, input, say(text), draft(text), send(text) }
//   say(text)   shows a note in the chat (not sent to the agent; falls back to a toast)
//   draft(text) puts text in the composer for you to edit and send
//   send(text)  sends text to this chat's agent as your message
const Commands = (() => {
  const cmds = new Map(); // name -> def
  const alias = new Map(); // alias -> name
  const NAME = /^[a-z0-9][\w-]*$/i;

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
  const list = () => [...cmds.values()].sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name));

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
    const starts = shown.filter((d) => d.name.startsWith(q) || d.aliases.some((a) => a.toLowerCase().startsWith(q)));
    const has = shown.filter((d) => !starts.includes(d) && (d.name.includes(q) || d.desc.toLowerCase().includes(q)));
    return [...starts, ...has];
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
    };
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
    } catch (err) {
      toast(`/${hit.def.name}: ${err.message}`, { type: 'error' });
    }
    return true;
  }

  // Runs a command from code (agents' suggestion chips, other tools): Commands.exec('/astra hi', agentId)
  const exec = (text, agentId = H.claudeAgent()?.id) => tryRun(text.startsWith('/') ? text : `/${text}`, agentId, null);

  // ---- built-in commands ----
  register({
    name: 'help', aliases: ['commands', '?'], area: 'Chat', desc: 'List every chat command', args: '[filter]',
    run: (args) => {
      const rows = list().filter((d) => !args || `${d.name} ${d.desc} ${d.area}`.toLowerCase().includes(args.toLowerCase()));
      let area = '';
      const lines = [];
      for (const d of rows) {
        if (d.area !== area) { area = d.area; lines.push(`\n**${area}**`); }
        lines.push(`- \`/${d.name}${d.args ? ` ${d.args}` : ''}\` ${d.desc}${d.aliases.length ? ` (also /${d.aliases.join(', /')})` : ''}`);
      }
      return lines.length ? lines.join('\n').trim() : `No command matches “${args}”.`;
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

  return { register, unregister, get, list, parse, matching, tryRun, exec, paletteActions };
})();
