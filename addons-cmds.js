// Chat commands (and Ctrl+K actions) for the add-ons: prompt library, notes, memory, Kit (color, easing, BPM,
// frames, timecode), agent presets, Forgeheart + Forge Debug, backups, trash, downloads and importing past chats.
// Everything here is drivable from any native chat: type / to see them, /help <word> to filter.
const Addons = (() => {
  const reg = (area) => (def) => {
    // another stream may own a name (chat registers /memory, /remember…, the Lab /bpm, /ease…): theirs wins, ours
    // stays reachable under `alt` or its first free alias (e.g. /kit-bpm, /easing)
    const free = (def.aliases || []).filter((a) => !Commands.get(a));
    let name = def.name;
    if (Commands.get(name)) {
      name = [def.alt, ...free].find((n) => n && !Commands.get(n));
      if (!name) { console.warn(`Add-ons: /${def.name} is taken and has no free alternative`); return null; }
    }
    const { alt, ...rest } = def;
    return Commands.register({ area, ...rest, name, aliases: free.filter((a) => a !== name) });
  };
  const words = (args) => String(args || '').trim().split(/\s+/).filter(Boolean);
  const startsWith = (list, a) => list.filter((x) => String(x.value).toLowerCase().startsWith(String(a || '').toLowerCase()));
  const mdList = (rows, fmt) => rows.map((r) => `- ${fmt(r)}`).join('\n');
  const nativeAgent = (ctx) => (ctx?.agentId && H.agent(ctx.agentId)?.mode === 'native' ? ctx.agentId : H.claudeAgent()?.id);

  // ---------- prompts ----------
  const P = reg('Prompts');
  const promptArgs = async (a) => (await Prompts.search(a)).slice(0, 12).map((p) => ({ value: p.name, hint: Prompts.CATS[p.cat] || p.cat }));
  const catArgs = (a) => startsWith(Prompts.categories().map((c) => ({ value: c.id, hint: `${c.label} (${c.n})` })), a);
  P({ name: 'prompts', aliases: ['library'], args: '[search or category]', desc: 'Open the prompt library (170 presets + yours), searched or on a category',
    complete: async (a) => { await Prompts.load(); return [...catArgs(a), ...(await promptArgs(a)).slice(0, 6)]; },
    run: async (args) => {
      await Prompts.load();
      const cat = Prompts.categories().find((c) => c.id === args.toLowerCase() || c.label.toLowerCase() === args.toLowerCase());
      await Prompts.manage(cat ? { cat: cat.id, query: '' } : { query: args, cat: args ? '' : undefined });
    } });
  P({ name: 'prompt-new', args: '[name]', desc: 'Write a new prompt (blanks: {{topic}}, {{tone=friendly}}, {{tone|a,b,c}})',
    run: (args) => { Prompts.manage({ newName: args || '', cat: '' }); } });
  P({ name: 'prompt-save-last', aliases: ['save-prompt'], args: '[name]', desc: 'Save the last message you sent in this chat as a prompt',
    run: async (args, ctx) => {
      const p = await Prompts.saveLast(nativeAgent(ctx), args || undefined);
      return p ? `Saved **${p.name}** to your prompts: type / and part of its name in any chat to use it.` : 'No message of yours in this chat yet.';
    } });
  P({ name: 'prompt-fav', args: '<name>', desc: 'Favorite (or unfavorite) a prompt: favorites come first in the / menu', complete: promptArgs,
    run: async (args) => {
      const p = await Prompts.find(args);
      if (!p) return `No prompt matches “${args}”.`;
      return (await Prompts.toggleFav(p.id)) ? `★ **${p.name}** is a favorite.` : `**${p.name}** is no longer a favorite.`;
    } });
  P({ name: 'prompt-list', args: '[category or search]', desc: 'List prompts in the chat (by category or search)', complete: async (a) => { await Prompts.load(); return catArgs(a); },
    run: async (args) => {
      await Prompts.load();
      const cat = Prompts.categories().find((c) => c.id === args.toLowerCase());
      if (!args) return `**Prompt categories**\n${mdList(Prompts.categories(), (c) => `\`${c.id}\` ${c.label}: ${c.n}`)}\n\nFavorites: ${(await Prompts.search('', 'fav')).length}. /prompt-list <category> lists one.`;
      const rows = await Prompts.search(cat ? '' : args, cat?.id);
      return rows.length ? `**${cat ? cat.label : `“${args}”`}** (${rows.length})\n${mdList(rows.slice(0, 60), (p) => `${Prompts.isFav(p) ? '★ ' : ''}${p.name}`)}` : 'Nothing matches.';
    } });
  P({ name: 'prompt-show', args: '<name>', desc: 'Show a prompt\'s text and its blanks', complete: promptArgs,
    run: async (args) => {
      const p = await Prompts.find(args);
      if (!p) return `No prompt matches “${args}”.`;
      const vs = Prompts.vars(p.text);
      return `**${p.name}** · ${Prompts.CATS[p.cat] || p.cat}${p.builtin ? ' · preset' : ''}\n\n\`\`\`\n${p.text}\n\`\`\`${vs.length ? `\nBlanks: ${vs.map((v) => `${v.name}${v.choices ? ` (${v.choices.join(' / ')})` : v.def ? ` = ${v.def}` : ''}`).join(' · ')}` : ''}`;
    } });
  P({ name: 'prompt-random', args: '[category]', desc: 'A random prompt from a category, ready to fill in', complete: async (a) => { await Prompts.load(); return catArgs(a); },
    run: async (args, ctx) => {
      const rows = await Prompts.search('', args ? args.toLowerCase() : undefined);
      if (!rows.length) return 'No prompts there.';
      const p = rows[Math.floor(Math.random() * rows.length)];
      const text = await Prompts.fill(p);
      if (text != null) ctx.draft(text);
    } });
  P({ name: 'prompt-export', args: '[all]', desc: 'Export your prompts to a JSON file (all = presets too)', run: async (args) => { await Prompts.exportAll({ all: /all/i.test(args) }); } });
  P({ name: 'prompt-import', desc: 'Import prompts from JSON, Markdown or text files (duplicates skipped)', run: async () => { await Prompts.importFiles(); } });

  // ---------- notes ----------
  const N = reg('Notes');
  const noteArgs = async (a) => (await Notes.search(a)).slice(0, 10).map((n) => ({ value: n.title, hint: timeAgo(n.updatedAt) }));
  N({ name: 'note', alt: 'inbox', aliases: ['n'], args: '[text]', desc: 'Quick capture into your Inbox note (no text: open Notes)',
    run: async (args) => { if (!args) { Notes.open(); return; } await Notes.capture(args); return `📝 Saved to **Inbox**: ${args}`; } });
  N({ name: 'todo', args: '<text>', desc: 'Add a checklist item to your Inbox note',
    run: async (args) => { if (!args) return 'Usage: /todo buy strings'; await Notes.capture(args, { todo: true }); return `☐ Added to **Inbox**: ${args}`; } });
  N({ name: 'notes', alt: 'notes-find', args: '[search or #tag]', desc: 'Open Notes, filtered', complete: async (a) => [...(await Notes.tags()).map((t) => ({ value: `#${t}` })).filter((x) => x.value.startsWith(a)), ...await noteArgs(a)].slice(0, 12),
    run: async (args) => { if (args) { const hit = (await Notes.search(args))[0]; if (hit) { await Notes.show(hit.id); return; } return `No note matches “${args}”.`; } Notes.open(); } });
  N({ name: 'daily-note', aliases: ['today-note', 'dn'], desc: 'Open today\'s daily note (made from the Daily template)', run: async () => { await Notes.daily(); } });
  N({ name: 'note-new', args: '[template]', desc: 'New note from a template (daily, idea, track, shots, bug, devlog, meeting…)',
    complete: (a) => startsWith(Object.entries(Notes.TEMPLATES).map(([id, t]) => ({ value: id, hint: t.label })), a),
    run: async (args) => {
      const t = Object.keys(Notes.TEMPLATES).find((k) => k === args.toLowerCase()) || Object.entries(Notes.TEMPLATES).find(([, v]) => v.label.toLowerCase().includes(args.toLowerCase()))?.[0];
      if (args && !t) return `Templates: ${Object.entries(Notes.TEMPLATES).map(([k, v]) => `\`${k}\` ${v.label}`).join(' · ')}`;
      await Notes.create({ template: t || 'blank', focus: true });
    } });
  N({ name: 'note-send', args: '[note]', desc: 'Put a note into this chat\'s message box', complete: noteArgs,
    run: async (args, ctx) => { const n = args ? await Notes.find(args) : (await Notes.list())[0]; if (!n) return 'No such note.'; ctx.draft(n.text); } });
  N({ name: 'note-find', args: '<words or #tag>', desc: 'Search your notes from the chat', complete: noteArgs,
    run: async (args) => {
      const rows = await Notes.search(args);
      if (!rows.length) return `No note matches “${args}”.`;
      return `**${rows.length} note${rows.length === 1 ? '' : 's'}**\n${mdList(rows.slice(0, 20), (n) => {
        const i = args && !args.startsWith('#') ? n.text.toLowerCase().indexOf(args.toLowerCase().split(/\s+/)[0]) : -1;
        return `${n.pinned ? '📌 ' : ''}**${n.title}** · ${timeAgo(n.updatedAt)}${i >= 0 ? ` · …${n.text.slice(Math.max(0, i - 30), i + 60).replace(/\s+/g, ' ')}…` : ''}`;
      })}`;
    } });
  N({ name: 'note-pin', args: '[note]', desc: 'Pin a note to the front (or unpin)', complete: noteArgs,
    run: async (args) => { const n = await Notes.pin(args || undefined); return n ? `${n.pinned ? '📌 Pinned' : 'Unpinned'} **${n.title}**.` : 'No such note.'; } });
  N({ name: 'note-link', args: '[note]', desc: 'Link this chat to a note (shown under the note; click to come back)', complete: noteArgs,
    run: async (args, ctx) => {
      const agentId = nativeAgent(ctx);
      if (!H.activeChat?.[agentId]) return 'Open a saved chat first.';
      const n = await Notes.linkChat(agentId, args ? (await Notes.find(args))?.id : undefined);
      return n ? `🔗 Linked this chat to **${n.title}**.` : 'No such note.';
    } });
  N({ name: 'note-reply', desc: 'Save the last reply in this chat to your notes',
    run: async (args, ctx) => {
      const chatId = H.activeChat?.[nativeAgent(ctx)];
      const chat = chatId ? await window.hub.getChat(chatId) : null;
      const last = chat?.messages?.filter((m) => m.role === 'assistant').at(-1);
      if (!last) return 'No reply in this chat yet.';
      await Notes.append(`> From “${chat.title}”\n\n${last.text}`);
    } });
  N({ name: 'note-chat', desc: 'Save this whole chat as a new note (Markdown)',
    run: async (args, ctx) => {
      const chatId = H.activeChat?.[nativeAgent(ctx)];
      if (!chatId) return 'Open a saved chat first.';
      const md = await Native.markdownOf(chatId);
      const n = await Notes.create({ text: md });
      return `Saved as the note **${n.title}** (${md.length.toLocaleString()} characters).`;
    } });
  N({ name: 'note-export', desc: 'Export every note to one Markdown file', run: async () => { await Notes.exportAll(); } });
  N({ name: 'note-import', desc: 'Import Markdown / text files as notes', run: async () => { await Notes.importFiles(); } });

  // ---------- memory ----------
  const M = reg('Memory');
  const scopeArg = (text, ctx) => {
    const m = String(text).match(/^(all|everyone|shared|me)\s*:\s*/i);
    return m ? { scope: 'shared', text: text.slice(m[0].length) } : { scope: nativeAgent(ctx) || 'shared', text };
  };
  M({ name: 'memory', args: '[search]', desc: 'Open memory: facts, categories, pins, expiry and what it costs per message', run: (args) => { MemoryEditor.open({ query: args }); } });
  M({ name: 'remember', args: '[all:] <fact> [--pin] [--days N]', desc: 'Remember a fact (this agent; "all:" for every agent)',
    run: async (args, ctx) => {
      if (!args) return 'Usage: /remember I post 9:16 visuals on Shorts (add "all:" for every agent, --pin, --days 7)';
      const pin = /\s--pin\b/.test(args);
      const days = Number((args.match(/\s--days\s+(\d+)/) || [])[1]) || undefined;
      const { scope, text } = scopeArg(args.replace(/\s--pin\b/, '').replace(/\s--days\s+\d+/, ''), ctx);
      const f = await MemoryEditor.remember(text, { scope, pinned: pin, days });
      if (!f) return 'Nothing to remember.';
      if (f.duplicate) return `Already remembered: ${f.text}`;
      return `🧠 Remembered for ${scope === 'shared' ? 'every agent' : H.agent(scope)?.name}${pin ? ' (pinned)' : ''}${days ? ` for ${days} day(s)` : ''}: ${f.text} · ${MemoryEditor.CATS[f.cat]}`;
    } });
  M({ name: 'forget', args: '<words>', desc: 'Forget the memories that contain these words',
    complete: async (a) => (await MemoryEditor.facts()).filter((f) => f.text.toLowerCase().includes(a.toLowerCase())).slice(0, 10).map((f) => ({ value: f.text })),
    run: async (args) => {
      if (!args) return 'Usage: /forget <words from the fact>';
      const hits = (await MemoryEditor.facts()).filter((f) => f.text.toLowerCase().includes(args.toLowerCase()));
      if (!hits.length) return `No memory contains “${args}”.`;
      if (hits.length > 1 && !(await Modal.confirm(`Forget ${hits.length} memories?`, hits.map((f) => `• ${f.text}`).join('\n'), { ok: 'Forget', danger: true }))) return;
      const gone = await MemoryEditor.forget(args);
      return `Forgot ${gone.length}: ${gone.map((f) => f.text).join(' · ')}`;
    } });
  M({ name: 'memory-cost', aliases: ['memcost'], desc: 'How many tokens memory adds to every message, per agent', run: () => MemoryEditor.costText() });
  M({ name: 'memory-list', args: '[search]', desc: 'List what your agents remember',
    run: async (args) => {
      const all = (await MemoryEditor.facts()).filter((f) => !args || f.text.toLowerCase().includes(args.toLowerCase()));
      if (!all.length) return args ? 'Nothing matches.' : 'Memory is empty.';
      return mdList(all, (f) => `${f.pinned ? '📌 ' : ''}${f.text} · ${f.scope === 'shared' ? 'all' : H.agent(f.scope)?.name || f.scope} · ${MemoryEditor.CATS[f.cat] || f.cat}${f.expires ? ` · until ${new Date(f.expires).toLocaleDateString()}` : ''}`);
    } });
  const memArgs = async (a) => (await MemoryEditor.facts()).filter((f) => f.text.toLowerCase().includes(a.toLowerCase())).slice(0, 10).map((f) => ({ value: f.text }));
  M({ name: 'memory-pin', args: '<words>', desc: 'Pin a memory (goes first, never expires)', complete: memArgs,
    run: async (args) => {
      const f = await MemoryEditor.setPinned(args);
      return f ? `${f.pinned ? '📌 Pinned' : 'Unpinned'}: ${f.text}` : 'No memory matches.';
    } });
  M({ name: 'memory-expire', args: '<words> <days>', desc: 'Forget a memory after some days (0 = never)', complete: memArgs,
    run: async (args) => {
      const m = args.match(/^(.*\S)\s+(\d+)$/);
      if (!m) return 'Usage: /memory-expire <words> <days>';
      const r = await MemoryEditor.setExpiry(m[1], Number(m[2]));
      return r ? (Number(m[2]) ? `⏳ “${r.text}” will be forgotten on ${new Date(r.expires).toLocaleDateString()}.` : `“${r.text}” never expires.`) : 'No memory matches.';
    } });
  M({ name: 'memory-export', desc: 'Export memory (with categories, pins, expiry) to a file', run: async () => { await MemoryEditor.exportAll(); } });
  M({ name: 'memory-import', desc: 'Import memory from an export or a text list (merges)', run: async () => { await MemoryEditor.importFile(); } });

  // ---------- kit ----------
  const K = reg('Kit');
  const colorOut = (c) => `${'```'}\n${Kit.formats(c).map(([l, v]) => `${l.padEnd(17)} ${v}`).join('\n')}\n${'```'}`;
  K({ name: 'kit', args: '[tab]', desc: 'Open the Kit: color, palette, harmony, contrast, gradient, easing, BPM, frames, timecode',
    complete: (a) => startsWith(Kit.TABS.map((t) => ({ value: t.id, hint: t.label })), a), run: (args) => { Kit.open(args || undefined); } });
  K({ name: 'color', aliases: ['colour'], args: '[any color]', desc: 'A color in every format (hex, three.js, GLSL, AE…)',
    run: (args) => { if (!args) { Kit.open('color'); return; } const c = Kit.parseColor(args); if (!c) return `“${args}” doesn't look like a color.`; return `**${Kit.hexOf(c)}**\n${colorOut(c)}`; } });
  K({ name: 'harmony', args: '<color>', desc: 'Color schemes around a color (complementary, triadic…)',
    run: (args) => {
      if (!args) { Kit.open('harmony'); return; }
      const h = Kit.harmonies(args);
      return h.length ? mdList(h, (x) => `**${x.label}**: ${x.colors.map((c) => `\`${c}\``).join(' ')}`) : `“${args}” doesn't look like a color.`;
    } });
  K({ name: 'contrast', args: '<text color> <background>', desc: 'WCAG contrast check, with a readable fix',
    run: (args) => {
      const [a, b] = args.split(/\s+(?:on\s+)?/);
      if (!b) { Kit.open('contrast', args); return; }
      const r = Kit.contrastReport(a, b);
      if (!r) return 'Give two colors, e.g. /contrast #ffffff #7c5cff';
      return `**${r.text}** · AA text ${r.aa ? '✓' : '✕'} · AA large ${r.aaLarge ? '✓' : '✕'} · AAA ${r.aaa ? '✓' : '✕'}${r.fix ? `\nNearest readable text color: \`${r.fix}\`` : ''}`;
    } });
  K({ name: 'gradient', args: '<colors…> [radial|conic] [angle]', desc: 'Gradient code: CSS, GLSL, three.js texture, OKLab ramp',
    run: (args) => {
      const cols = Kit.hexList(args);
      if (cols.length < 2) { Kit.open('gradient', args); return; }
      const type = /radial/i.test(args) ? 'radial' : /conic/i.test(args) ? 'conic' : 'linear';
      const angle = Number((args.match(/\b(\d{1,3})\s*(?:deg|°)/) || [])[1] || 90);
      return Kit.gradientCode(cols, { type, angle }).map(([l, v]) => `**${l}**\n${'```'}\n${v}\n${'```'}`).join('\n');
    } });
  K({ name: 'palette', alt: 'kit-palette', args: '[hex codes | picture path]', desc: 'Make a palette: from a picture, the clipboard, the Lab frame or hex codes',
    run: async (args) => {
      if (!args) { Kit.open('palette'); return; }
      const cols = /^[a-z]:\\|^\/|\.(png|jpe?g|webp|gif|bmp)$/i.test(args.trim()) ? await Kit.paletteFromImage(args.trim().replace(/^"|"$/g, '')) : Kit.hexList(args);
      if (!cols.length) return 'No colors found.';
      store.set('kit.palette', cols);
      return `${cols.map((c) => `\`${c}\``).join(' ')}\n/save-palette <name> saves it for the Three.js Lab.`;
    } });
  K({ name: 'lab-palette', alt: 'save-palette', args: '<name> [hex codes]', desc: 'Save a palette (or the last Kit palette) to the Lab\'s 🎨 menu',
    run: (args) => {
      const cols = Kit.hexList(args);
      const name = args.replace(/#?\b([0-9a-f]{6}|[0-9a-f]{3})\b/gi, '').trim() || 'Kit palette';
      const use = cols.length ? cols : Kit.lastPalette();
      if (!use.length) return 'No palette yet: /kit-palette or give hex codes.';
      Kit.savePaletteToLab(name, use);
      return `🎨 Saved **${name}** (${use.join(' ')}) to the Lab palettes.`;
    } });
  K({ name: 'ease', aliases: ['easing'], args: '[preset | x1,y1,x2,y2]', desc: 'An easing curve as CSS, GSAP, JS, GLSL and AE (or open the editor)',
    complete: (a) => startsWith(Object.keys(Kit.EASE_PRESETS).map((k) => ({ value: k })), a).concat(Object.keys(Kit.EASE_PRESETS).filter((k) => !k.toLowerCase().startsWith(a.toLowerCase()) && k.toLowerCase().includes(a.toLowerCase())).map((k) => ({ value: k }))).slice(0, 12),
    run: (args) => {
      if (!args) { Kit.open('easing'); return; }
      const nums = args.match(/-?\d*\.?\d+/g)?.map(Number);
      const name = Object.keys(Kit.EASE_PRESETS).find((k) => k.toLowerCase() === args.toLowerCase()) || Object.keys(Kit.EASE_PRESETS).find((k) => k.toLowerCase().includes(args.toLowerCase()));
      const pts = name ? Kit.EASE_PRESETS[name] : nums?.length === 4 ? nums : null;
      if (!pts) return `Unknown curve. Presets: ${Object.keys(Kit.EASE_PRESETS).join(', ')}`;
      const out = Kit.easingOutputs(pts).filter(([l]) => /^(CSS|GSAP|AE keyframe)/.test(l));
      return `**${name || 'cubic-bezier'}**\n${out.map(([l, v]) => `- ${l}: \`${v}\``).join('\n')}\n(/kit easing shows the JS, GLSL and AE expression versions)`;
    } });
  K({ name: 'bpm', alt: 'kit-bpm', args: '<bpm> | <ms>ms', desc: 'Note lengths at a tempo (ms, frames, Hz), or the BPM of a duration',
    run: (args) => {
      if (!args) { Kit.open('bpm'); return; }
      const ms = args.match(/^(\d+(?:\.\d+)?)\s*ms$/i);
      if (ms) return `${ms[1]} ms per beat = **${Kit.bpmFromMs(Number(ms[1])).toFixed(2)} BPM** (per bar: ${Kit.bpmFromMs(Number(ms[1]), 4).toFixed(2)} BPM)`;
      const b = Number(args);
      return b > 0 && b < 1000 ? Kit.bpmText(b) : 'Usage: /kit-bpm 128 or /kit-bpm 469ms';
    } });
  K({ name: 'frame', aliases: ['aspect'], args: '<WxH | 16:9 1280 | format>', desc: 'Frame size: ratio, safe zones for Shorts / TikTok / Reels…, three.js code',
    complete: (a) => startsWith(Kit.FORMATS.map((f) => ({ value: f.id, hint: `${f.label} ${f.w}×${f.h}` })), a),
    run: (args) => {
      if (!args) { Kit.open('frame'); return; }
      const r = Kit.parseFrame(args);
      return r ? Kit.frameText(r.w, r.h) : 'Try /aspect 1080x1920, /aspect 16:9 1280, /aspect 9:16 h1920 or /aspect tiktok';
    } });
  K({ name: 'tc', aliases: ['timecode'], args: '<time math> [@fps] [@bpm]', desc: 'Timecode calculator: 00:01:00:00 + 12f - 2s, 8 bars @128bpm, 900f @24',
    run: (args) => {
      if (!args) { Kit.open('timecode'); return; }
      const fps = Number((args.match(/@\s*(\d+(?:\.\d+)?)\s*(?:fps)?\b(?!\s*bpm)/i) || [])[1]) || store.get('kit.fps', 30);
      const bpm = Number((args.match(/@?\s*(\d+(?:\.\d+)?)\s*bpm/i) || [])[1]) || undefined;
      const expr = args.replace(/@?\s*\d+(?:\.\d+)?\s*bpm/i, '').replace(/@\s*\d+(?:\.\d+)?\s*(fps)?/i, '').trim();
      return Kit.timeText(expr, { fps, bpm, drop: /;|\bdf\b/i.test(args) }) || 'Use timecodes (hh:mm:ss:ff), m:ss, 90s, 1500ms, 48f, 8 bars, joined with + and -';
    } });

  // ---------- agents ----------
  const A = reg('Agents');
  const presetArgs = (a) => Manager.PRESETS.filter((p) => p.name.toLowerCase().includes(String(a).toLowerCase())).slice(0, 12).map((p) => ({ value: p.name, hint: p.persona ? 'persona' : p.mode }));
  A({ name: 'agent-new', aliases: ['new-agent'], args: '[preset]', desc: 'Add an agent from a preset (42 personas, websites…): opens it ready to save', complete: presetArgs,
    run: async (args) => {
      const p = args ? Manager.findPreset(args) : null;
      if (args && !p) { const pick = await Manager.pickPreset(args); if (pick) Manager.open(null, { preset: pick }); return; }
      if (!p) { const pick = await Manager.pickPreset(); if (pick) Manager.open(null, { preset: pick }); return; }
      Manager.open(null, { preset: p });
    } });
  A({ name: 'agent-presets', aliases: ['personas'], args: '[search]', desc: 'List the agent presets and personas',
    run: (args) => {
      const rows = Manager.PRESETS.filter((p) => !args || `${p.name} ${p.systemPrompt || ''}`.toLowerCase().includes(args.toLowerCase()));
      if (!rows.length) return 'No preset matches.';
      const per = rows.filter((p) => p.persona); const web = rows.filter((p) => p.mode === 'web'); const other = rows.filter((p) => !p.persona && p.mode !== 'web');
      return [other.length ? `**Agents**: ${other.map((p) => p.name).join(', ')}` : '', per.length ? `**Personas** (${per.length})\n${mdList(per, (p) => `${p.icon} **${p.name}**: ${p.systemPrompt.slice(0, 90)}${p.systemPrompt.length > 90 ? '…' : ''}`)}` : '',
        web.length ? `**Websites**: ${web.map((p) => p.name).join(', ')}` : '', '\n/agent-new <name> adds one.'].filter(Boolean).join('\n');
    } });

  // ---------- forgeheart + forge debug ----------
  const F = reg('Forge');
  const debugAgent = () => H.agents().find((a) => a.companion === 'forge-game' && a.mode === 'native');
  // Opens Forge Debug if needed and waits for the game (up to 20 s).
  async function game() {
    if (ForgeGame.isReady()) return true;
    const a = debugAgent();
    if (!a) throw new Error('No Forge Debug agent (add one with /agent-new Forge Debug).');
    activate(a.id, { focus: false });
    for (let i = 0; i < 100 && !ForgeGame.isReady(); i += 1) await new Promise((r) => setTimeout(r, 200));
    if (!ForgeGame.isReady()) throw new Error('The debug game did not load (check the build in Forge Debug).');
    return true;
  }
  const show = (r) => (r?.ok === false ? `✕ ${r.error}` : `\`\`\`json\n${JSON.stringify(r?.value ?? r, null, 1).slice(0, 2500)}\n\`\`\``);
  F({ name: 'forge', args: '[tab]', desc: 'Open the Forgeheart workspace (dashboard, builds, docs, tasks, devlog…)',
    complete: (a) => startsWith(Forge.TAB_IDS.map((t) => ({ value: t })), a), run: async (args) => { await Forge.open(Forge.TAB_IDS.find((t) => t.startsWith(args.toLowerCase())) || (args ? null : 'dashboard')); } });
  F({ name: 'forge-chat', args: '[question]', desc: 'New Forgeheart chat with the project brief', run: (args) => { Forge.forgeChat(args); } });
  F({ name: 'forge-task', aliases: ['ftask'], args: '<task> [#tag] [!1-3]', desc: 'Add a Forgeheart task (no text: list the open ones)',
    run: async (args) => {
      if (!args) { const rows = await Forge.taskList(); return rows.length ? `**Open tasks** (${rows.length})\n${mdList(rows.slice(0, 30), (t) => `${t.priority === 1 ? '🔥 ' : ''}${t.title}${t.tag ? ` #${t.tag}` : ''} · ${t.col}`)}` : 'No open tasks.'; }
      const t = await Forge.addTask(args);
      return t ? `✓ Task added: **${t.title}**${t.tag ? ` #${t.tag}` : ''}${t.priority !== 2 ? ` (P${t.priority})` : ''}` : 'Give the task a title.';
    } });
  F({ name: 'forge-devlog', aliases: ['devlog'], args: '[start | stop <what you did> | status]', desc: 'Devlog work timer',
    complete: (a) => startsWith(['start', 'stop', 'status'].map((v) => ({ value: v })), a),
    run: async (args) => { const [cmd, ...rest] = words(args); return Forge.devlog(['start', 'stop'].includes(cmd) ? cmd : 'status', rest.join(' ')); } });
  F({ name: 'forge-status', desc: 'Live debug game: stage, gold, HP, enemies, gear', run: async () => { await game(); return show(await ForgeGame.handleTool('forge_status', {})); } });
  F({ name: 'forge-spawn', args: '[type|boss] [count]', desc: 'Spawn enemies in the debug game',
    complete: async (a) => startsWith(['random', 'boss', ...(await ForgeGame.enemyTypes())].map((v) => ({ value: v })), a),
    run: async (args) => { await game(); const [type = 'random', count] = words(args); return show(type === 'boss' ? await ForgeGame.quick('boss') : await ForgeGame.quick('spawn', `${type} ${count || 10}`)); } });
  for (const [name, action, desc] of [['forge-heal', 'heal', 'Heal to full'], ['forge-kill', 'kill', 'Kill every enemy'], ['forge-boss', 'boss', 'Spawn the boss'], ['forge-next', 'next', 'Go to the next stage'], ['forge-start', 'start', 'Start the game from the title screen']]) {
    F({ name, desc: `Debug game: ${desc.toLowerCase()}`, run: async () => { await game(); return show(await ForgeGame.quick(action)); } });
  }
  for (const [name, flag, desc] of [['forge-god', 'god', 'invulnerable'], ['forge-oneshot', 'oneshot', 'enemies die in one hit'], ['forge-pause', 'paused', 'pause / resume']]) {
    F({ name, args: '[on|off]', desc: `Debug game: ${desc}`, complete: (a) => startsWith([{ value: 'on' }, { value: 'off' }], a), run: async (args) => { await game(); return show(await ForgeGame.quick(flag, args || undefined)); } });
  }
  F({ name: 'forge-speed', args: '<0.1–8>', desc: 'Debug game speed', complete: (a) => startsWith(['0.25', '0.5', '1', '2', '4', '8'].map((v) => ({ value: v })), a),
    run: async (args) => { await game(); return show(await ForgeGame.quick('speed', args || 1)); } });
  F({ name: 'forge-stage', args: '<n>', desc: 'Jump to a stage', run: async (args) => { await game(); return show(await ForgeGame.quick(args === 'next' ? 'next' : 'stage', args)); } });
  F({ name: 'forge-gold', args: '<amount>', desc: 'Set gold', run: async (args) => { await game(); return show(await ForgeGame.quick('gold', String(args).replace(/k$/i, '000').replace(/m$/i, '000000'))); } });
  F({ name: 'forge-eval', args: '<code>', desc: 'Run code in the debug game (like its console)', run: async (args) => { await game(); return show(await ForgeGame.exec(args)); } });
  F({ name: 'forge-reload', desc: 'Reload the debug game (patches re-apply)', run: async () => { await game(); await ForgeGame.reload(); return 'Reloaded.'; } });
  F({ name: 'forge-watch', args: '[expression | on | off | reset]', desc: 'Stat watch overlay on the game (add an expression to watch)',
    run: async (args) => {
      await game();
      if (!args || /^(on|off)$/i.test(args)) return `Stat watch ${ForgeGame.setWatch(args ? /on/i.test(args) : undefined) ? 'on' : 'off'}.`;
      if (/^reset$/i.test(args)) { store.set('forge.watch', null); ForgeGame.setWatch(true); return 'Stat watch back to its defaults.'; }
      return `Watching \`${ForgeGame.addWatch(args)}\`.`;
    } });
  F({ name: 'forge-snap', args: '[name]', desc: 'Snapshot the debug game (its whole save) to come back to later', run: async (args) => { await game(); return `📸 Snapshot **${await ForgeGame.snapshot(args || undefined)}** saved. /forge-restore brings it back.`; } });
  F({ name: 'forge-restore', args: '[snapshot]', desc: 'Restore a debug game snapshot (newest if no name)',
    complete: async (a) => (await ForgeGame.snapshots()).filter((s) => s.name.toLowerCase().includes(a.toLowerCase())).map((s) => ({ value: s.name, hint: timeAgo(s.at) })),
    run: async (args) => { await game(); return `Restored **${await ForgeGame.restore(args || undefined)}**.`; } });
  F({ name: 'forge-snaps', desc: 'Debug game snapshots', run: () => { ForgeGame.snapshotsDialog(); } });
  F({ name: 'forge-patches', desc: 'The saved debug-game patches', run: () => { ForgeGame.patchesDialog(); } });
  F({ name: 'forge-patch', args: '<name> [on|off]', desc: 'Turn a saved patch on or off',
    complete: (a) => ForgeGame.patches().filter((p) => p.name.toLowerCase().includes(a.toLowerCase())).map((p) => ({ value: p.name, hint: p.enabled ? 'on' : 'off' })),
    run: async (args) => { const m = args.match(/^(.*?)(?:\s+(on|off))?$/i); const p = await ForgeGame.setPatch(m[1], m[2] ? /on/i.test(m[2]) : undefined); return `Patch **${p.name}** ${p.enabled ? 'on (applied now)' : 'off (reload to fully undo)'}.`; } });
  F({ name: 'forge-set', args: 'save|use <name> | list', desc: 'Patch sets: save the enabled patches as a set, or switch sets',
    complete: async (a) => startsWith([{ value: 'save' }, { value: 'use' }, { value: 'list' }, ...Object.keys(await ForgeGame.patchSets()).map((k) => ({ value: `use ${k}` }))], a),
    run: async (args) => {
      const [cmd, ...rest] = words(args); const name = rest.join(' ');
      if (cmd === 'save' && name) return `Set **${name}**: ${(await ForgeGame.savePatchSet(name)).join(', ') || 'no patches'}.`;
      if (cmd === 'use' && name) return `Patch set **${await ForgeGame.applyPatchSet(name)}** on; the game reloaded.`;
      const sets = await ForgeGame.patchSets();
      return Object.keys(sets).length ? mdList(Object.entries(sets), ([k, v]) => `**${k}**: ${v.join(', ') || '(none)'}`) : 'No patch sets yet: /forge-set save <name>.';
    } });
  F({ name: 'forge-shot', desc: 'Screenshot of the debug game into this chat\'s attachments',
    run: async (args, ctx) => {
      await game();
      const r = await ForgeGame.handleTool('forge_screenshot', {});
      if (!r.ok) return r.error;
      const p = await window.hub.saveAttachment(`forgeheart-${Date.now()}.png`, r.png || r.image);
      const agentId = nativeAgent(ctx);
      await Native.attachPaths(agentId, [p]);
      return '📷 Screenshot attached to your next message.';
    } });

  // ---------- data: backup, trash, downloads, import ----------
  const D = reg('Data');
  D({ name: 'backup', args: '[now | list | as]', desc: 'Back up Hearth now (to your backup folder), or list / save a copy elsewhere',
    complete: (a) => startsWith(['now', 'list', 'as'].map((v) => ({ value: v })), a),
    run: async (args) => {
      if (/^list/i.test(args)) { AppUI.backupsDialog(); return; }
      if (/^as/i.test(args)) { await AppUI.exportData(); return; }
      const r = await AppUI.backupNow();
      return r ? `💾 Backup saved: \`${r.path}\` (${fmtBytes(r.size)})` : undefined;
    } });
  D({ name: 'backups', desc: 'Your backups: list, restore, folder, automatic backups', run: () => { AppUI.backupsDialog(); } });
  D({ name: 'restore', alt: 'restore-backup', args: '[backup zip path]', desc: 'Restore from a backup (adds what\'s missing, never deletes)', run: async (args) => { await AppUI.restoreBackup(args || undefined); } });
  D({ name: 'trash', aliases: ['deleted'], args: '[search | restore <title>]', desc: 'Recently deleted chats (restore, peek, delete for good)',
    run: async (args) => {
      const m = args.match(/^restore\s+(.+)/i);
      if (!m) { AppUI.trashDialog({ query: args }); return; }
      const items = await window.hub.listChatTrash();
      const c = items.find((x) => x.title.toLowerCase().includes(m[1].toLowerCase()));
      if (!c) return `No deleted chat matches “${m[1]}”.`;
      await window.hub.restoreChat(c.id);
      H.chats = await window.hub.listChats();
      Panel.render();
      return `Restored **${c.title}**.`;
    } });
  D({ name: 'downloads', args: '[search]', desc: 'Files downloaded from website agents', run: (args) => { AppUI.downloadsDialog({ query: args }); } });
  D({ name: 'import', alt: 'import-chats', args: '[path to export .zip/.json]', desc: 'Import past chats from claude.ai / ChatGPT (checks first, then imports)', run: async (args) => { await importChats(args || undefined); } });

  // ---------- import flow: check the file, show what will happen, then import with progress ----------
  function importReport(r) {
    const span = r.first ? ` from ${new Date(r.first).toLocaleDateString()} to ${new Date(r.last).toLocaleDateString()}` : '';
    return [`${r.imported} new chat${r.imported === 1 ? '' : 's'} (${r.messages.toLocaleString()} messages)${span}`,
      ...Object.entries(r.counts || {}).map(([src, n]) => `· ${n} from ${src} → ${H.agent(r.sources[src])?.name || r.sources[src]}`),
      r.alreadyThere ? `${r.alreadyThere} already imported (kept as they are, with anything you added since)` : '',
      r.duplicates ? `${r.duplicates} duplicate${r.duplicates === 1 ? '' : 's'} inside the export (counted once)` : '',
      r.empty ? `${r.empty} empty conversation${r.empty === 1 ? '' : 's'} skipped` : '',
      r.failed ? `${r.failed} unreadable conversation${r.failed === 1 ? '' : 's'} skipped` : '',
      r.titles?.length ? `\nFor example: ${r.titles.slice(0, 5).map((t) => `“${t}”`).join(', ')}` : ''].filter(Boolean).join('\n');
  }
  let progressSink = null; // the running import's toast
  window.hub.onImportProgress?.((p) => progressSink?.(p));
  async function importChats(path) {
    const status = $('import-status');
    if (status) status.textContent = 'Checking…';
    const check = await window.hub.importChats({ path, dryRun: true });
    if (!check) { if (status) status.textContent = ''; return null; }
    if (check.error) { if (status) status.textContent = check.error; toast(check.error, { type: 'error' }); return check; }
    if (!check.imported) { if (status) status.textContent = 'Nothing new to import.'; Modal.alert('Nothing new to import', importReport(check)); return check; }
    if (status) status.textContent = '';
    if (!(await Modal.confirm('Import past chats?', importReport(check), { ok: `Import ${check.imported}` }))) return null;
    const t = toast('Importing…', { timeout: 0 });
    progressSink = (p) => { const span = t.querySelector('span'); if (span) span.textContent = `Importing… ${p.done} / ${p.total}`; };
    const r = await window.hub.importChats({ path: check.path });
    t.remove();
    progressSink = null;
    if (r?.error) { toast(r.error, { type: 'error' }); return r; }
    H.chats = await window.hub.listChats();
    Panel.render();
    const where = Object.values(r.sources).map((id) => H.agent(id)?.name).filter(Boolean).join(' and ');
    if (status) status.textContent = `Imported ${r.imported} chats${where ? ` into ${where}` : ''}${r.skipped ? ` (${r.skipped} skipped: empty, duplicate or already imported)` : ''}.`;
    toast(`Imported ${r.imported} chats${where ? ` into ${where}` : ''}`, { timeout: 5000 });
    return r;
  }

  // ---------- Ctrl+K actions ----------
  for (const [label, run] of [
    ['Kit: color, palette, harmony, contrast, gradient', () => Kit.open('color')], ['Kit: easing curves', () => Kit.open('easing')],
    ['Kit: BPM ↔ ms calculator', () => Kit.open('bpm')], ['Kit: frame sizes & safe zones', () => Kit.open('frame')], ['Kit: timecode calculator', () => Kit.open('timecode')],
    ['Daily note', () => Notes.daily()], ['New note from a template…', () => Commands.exec('/note-new', nativeAgent())],
    ['Agent presets & personas…', async () => { const p = await Manager.pickPreset(); if (p) Manager.open(null, { preset: p }); }],
    ['Memory: what it costs per message', async () => Modal.alert('Memory cost', (await MemoryEditor.costText()).replace(/\*\*/g, ''))],
    ['Backups…', () => AppUI.backupsDialog()], ['Back up now', () => AppUI.backupNow()], ['Restore from a backup…', () => AppUI.restoreBackup()],
    ['Forge Debug: snapshots', () => ForgeGame.snapshotsDialog()], ['Forge Debug: stat watch on / off', () => game().then(() => ForgeGame.setWatch()).catch((e) => toast(e.message, { type: 'error' }))],
  ]) AppUI.addAction(label, run);

  // a quiet automatic backup a little after start-up, when it's on (Backups… → Auto)
  setTimeout(() => AppUI.autoBackup().catch(() => {}), 30000);

  return { importChats, importReport };
})();
