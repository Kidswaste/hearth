// Chat commands for the directors (agents docked in a tool, with hub tool sets): what they cost per message, undo of
// their code edits, their live activity, the docked chat's width / collapse / chips, lean or full tool mode, and
// which engine (Claude or Astra) backs them. /help director lists them; "/director <sub>" reaches them too.
// Registered once every script has loaded, and only under names nobody else uses (Commands.register replaces).
(() => {
  const AREA = 'Director';
  const SETS = ['threeTools', 'videoTools', 'gameTools'];
  const TOOL_OF = { threeTools: 'three', videoTools: 'ae', gameTools: 'forgeheart' };
  const isDirector = (a) => a && a.mode === 'native' && (a.dock || SETS.some((k) => a[k]));
  const directors = () => H.agents().filter(isDirector);
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const pick = (list) => (args) => list.filter((x) => String(x.value ?? x).toLowerCase().includes(String(args || '').toLowerCase())).map((x) => (typeof x === 'string' ? { value: x } : x));
  const tok = (n) => `${Math.round(n).toLocaleString()} tok`;
  // The director a command means: this chat's agent when it is one, else the one docked in the open tool, else the
  // Three Director, else the first director.
  function directorFor(ctx) {
    const a = H.agent(ctx?.agentId);
    if (isDirector(a)) return a;
    const tool = H.isTool?.(H.activeId) ? H.activeId.slice(5) : null;
    return (tool && Tools.dockedAgent(tool)) || directors().find((x) => x.threeTools) || directors()[0] || null;
  }
  const toolOf = (a) => a?.dock || SETS.map((k) => (a?.[k] ? TOOL_OF[k] : null)).find(Boolean) || null;
  function surfaceFor(ctx) {
    const a = directorFor(ctx);
    const toolId = toolOf(a) || (H.isTool?.(H.activeId) ? H.activeId.slice(5) : null);
    const s = toolId && H.surfaces.get(`tool:${toolId}`);
    if (!s?.dockedId) throw new Error('No director chat is docked in this tool.');
    return s;
  }
  async function saveAgent(a, patch) {
    Object.assign(a, patch);
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete a[k];
    await saveConfig();
  }
  const onOff = (s) => (/^(on|yes|1|true|show)$/i.test(s) ? true : /^(off|no|0|false|hide)$/i.test(s) ? false : undefined);

  const defs = [];
  const cmd = (def) => defs.push({ area: AREA, ...def });

  // ---------- cost ----------
  // What a director sends with every message (tool list + its part of the system prompt), from the main process.
  const costAgent = (a) => ({ id: a.id, name: a.name, engine: a.engine, dock: a.dock, threeTools: a.threeTools, videoTools: a.videoTools, gameTools: a.gameTools, chatTools: a.chatTools, nodesTool: a.nodesTool, toolMode: a.toolMode, selfReview: a.selfReview, hubTools: a.hubTools });
  cmd({
    name: 'director-cost', args: '[all]', desc: 'What each director costs on every message (its tools + its part of the system prompt), lean vs full',
    complete: pick(['all']),
    run: async (args, ctx) => {
      const mine = /^all$/i.test(args) || !directorFor(ctx) ? directors() : [directorFor(ctx)];
      const list = mine.length ? mine : [];
      const agents = list.flatMap((a) => [costAgent(a), ...(a.threeTools ? [{ ...costAgent(a), id: `${a.id}·other`, name: `${a.name} (${a.toolMode === 'full' ? 'lean' : 'full'} mode)`, toolMode: a.toolMode === 'full' ? undefined : 'full' }] : [])]);
      const r = await window.hub.directorCost(agents.length ? agents : null);
      if (r?.error) return `Couldn't measure: ${r.error}`;
      const rows = r.directors.map((d) => `| ${d.name}${d.engine === 'codex' ? ' (Astra)' : ''} | **${tok(d.total)}** | ${d.parts.map((p) => `${p.what} ${p.tokens}`).join(' · ')} |`);
      const sets = r.sets.map((s) => `\`${s.server}\` ${s.tools} tools ${tok(s.total)}`).join(' · ');
      return `**Fixed cost per message** (≈ characters / 4; after the first message most of it is a cheap cache read)\n\n| Director | Per message | Made of |\n| --- | ---: | --- |\n${rows.join('\n')}\n\nTool sets: ${sets}.\nLean mode (default) lists the everyday tools and puts the rest in one \`three_do\` tool; \`/director-mode full\` lists every tool and the whole guide.`;
    },
  });

  const TOPICS = ['audio', 'sliders', 'looks', 'layers', 'filters', 'keyframes', 'timeline', 'refs', 'notes', 'scene', 'live', 'games', 'frame', 'bigcode', 'all'];
  cmd({
    name: 'director-guide', args: '[topic]', desc: 'What the Three Director knows about a topic (the guide it reads on demand with three_do help)',
    complete: pick(TOPICS),
    run: async (args) => {
      if (!args) return `**The Three Director's guide.** Always sent: a short core (sketch, sliders, music, work loop, layers). On demand: ${TOPICS.slice(0, -1).map((t) => `\`${t}\``).join(', ')} (\`/director-guide audio\`).`;
      const t = await window.hub.directorGuide(args);
      return `\`\`\`text\n${String(t).slice(0, 6000)}\n\`\`\``;
    },
  });
  cmd({
    name: 'director-tools', args: '[three | video | forge | chat]', desc: 'Each tool a director gets and what it costs per message (biggest first)',
    complete: pick(['three', 'video', 'forge', 'chat']),
    run: async (args, ctx) => {
      const r = await window.hub.directorCost(null);
      if (r?.error) return r.error;
      const a = directorFor(ctx);
      const want = args ? ({ three: 'threeTools', video: 'videoTools', forge: 'gameTools', chat: 'chatTools' })[args.toLowerCase()] : (a?.threeTools ? 'threeTools' : a?.videoTools ? 'videoTools' : a?.gameTools ? 'gameTools' : 'threeTools');
      const s = r.sets.find((x) => x.key === want);
      if (!s) return 'three, video, forge or chat';
      return `**${s.server}**: ${s.tools} tools, ≈ ${s.total.toLocaleString()} tokens per message\n${[...s.each].sort((x, y) => y.tokens - x.tokens).map((t) => `- ${DirectorDock.iconOf(t.name)} \`${t.name}\` ${t.tokens}`).join('\n')}`;
    },
  });
  cmd({
    name: 'director-ask', args: '<message>', desc: 'Send a message to the docked director from any chat (opens its tool)',
    run: async (args, ctx) => {
      const a = directorFor(ctx) || directors()[0];
      if (!a) return 'No director set up yet (`/director-setup`).';
      if (!args) return `Usage: \`/director-ask make the rings pink\` (goes to ${a.name}).`;
      const tool = toolOf(a);
      if (tool) { activate(`tool:${tool}`); Tools.openDock(tool); }
      if (Native.pendingFor?.(a.id)) { Native.setDraft(a.id, args); return `${a.name} is busy: your message is in its chat box.`; }
      Native.sendText(a.id, args);
      return a.id === ctx.agentId ? null : `Sent to ${a.name}.`;
    },
  });

  // ---------- undo / history ----------
  const needThree = () => { if (typeof ThreeDirector === 'undefined') throw new Error('The Three.js Lab isn\'t loaded.'); };
  cmd({
    name: 'undo-edit', args: '[force]', desc: 'Undo the director\'s last code edit in the Lab (force: even if the layer changed since)', keys: '↶ in the docked chat',
    complete: pick(['force']),
    run: async (args) => { needThree(); const h = await DirectorDock.undoEdit({ force: /^force$/i.test(args) }); return h ? `↶ "${h.layer}" is back to before the director's ${h.tool.replace(/^three_/, '').replace(/_/g, ' ')} (${timeAgo(h.at)}). \`/redo-edit\` puts it back.` : null; },
  });
  cmd({
    name: 'redo-edit', desc: 'Redo the director\'s edit you just undid',
    run: async () => { needThree(); const h = await DirectorDock.redoEdit(); return h ? `↷ "${h.layer}" has the director's edit again.` : null; },
  });
  cmd({
    name: 'director-edits', desc: 'The code edits the director made this session (newest first), undoable with /undo-edit',
    run: () => {
      needThree();
      const list = ThreeDirector.history().slice().reverse();
      if (!list.length) return 'The director hasn\'t changed any code yet this session.';
      return `**Director's edits** (newest first; \`/undo-edit\` undoes the top one)\n${list.slice(0, 15).map((h, i) => {
        const d = h.after.split('\n').length - h.before.split('\n').length;
        return `${i + 1}. **${h.layer}** in ${h.sketch} · ${h.tool.replace(/^three_/, '').replace(/_/g, ' ')} · ${d >= 0 ? '+' : ''}${d} lines · ${timeAgo(h.at)}`;
      }).join('\n')}`;
    },
  });

  // ---------- activity ----------
  cmd({
    name: 'director-activity', args: '[n]', desc: 'The director\'s latest tool calls: what, how long, failures',
    run: (args) => {
      const n = Math.max(1, Math.min(60, Number(args) || 15));
      const log = HubBridge.log().slice(-n).reverse();
      if (!log.length) return 'No director tool calls yet.';
      return `**Director activity** (newest first)\n${log.map((e) => `- ${DirectorDock.iconOf(e.tool)} \`${e.tool}\`${e.summary ? ` ${e.summary.replace(/`/g, "'")}` : ''} · ${e.running ? 'running' : e.ms < 1000 ? `${e.ms} ms` : `${(e.ms / 1000).toFixed(1)} s`}${e.ok === false ? ` · ✖ ${e.error.replace(/`/g, "'")}` : ''}`).join('\n')}`;
    },
  });
  cmd({
    name: 'director-stats', desc: 'Tool calls this session by tool: count, average time, failures, pictures',
    run: () => {
      const by = new Map();
      for (const e of HubBridge.log()) {
        const s = by.get(e.tool) || { n: 0, ms: 0, fail: 0, img: 0, tok: 0 };
        s.n += 1; s.ms += e.ms || 0; s.fail += e.ok === false ? 1 : 0; s.img += e.image ? 1 : 0; s.tok += e.tokens || 0;
        by.set(e.tool, s);
      }
      if (!by.size) return 'No director tool calls yet this session.';
      const saved = typeof ThreeDirector !== 'undefined' ? ThreeDirector.saved() : null;
      return `| Tool | Calls | Avg | ≈ Tokens read | Failed | Pictures |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${[...by.entries()].sort((a, b) => b[1].n - a[1].n).map(([t, s]) => `| ${DirectorDock.iconOf(t)} ${t} | ${s.n} | ${Math.round(s.ms / s.n)} ms | ${s.tok.toLocaleString()} | ${s.fail || ''} | ${s.img || ''} |`).join('\n')}${saved && (saved.reads || saved.shots) ? `\n\nNot sent again (unchanged): ${saved.reads} code reads, ${saved.shots} screenshots.` : ''}`;
    },
  });
  cmd({ name: 'director-clear', desc: 'Clear the director activity strip', run: () => { HubBridge.clearLog(); return 'Activity cleared.'; } });
  cmd({
    name: 'director-peek', desc: 'Enlarge the last picture the director looked at (attach it to the chat from there)',
    run: (_a, ctx) => { const img = HubBridge.lastImage(); if (!img) return 'The director hasn\'t looked at anything yet.'; DirectorDock.viewImage(img, directorFor(ctx)?.id || ctx.agentId); return null; },
  });
  cmd({
    name: 'director-try', args: '<tool> [json args]', desc: 'Run a director tool yourself, as the director would (no tokens): e.g. three_console, three_do {"cmd":"layers"}',
    complete: (args) => pick(Object.keys(DirectorDock.ICONS).filter((t) => !t.startsWith('chat_')).concat(['three_do']))(words(args)[0] || ''),
    run: async (args) => {
      const m = String(args).match(/^(\S+)\s*([\s\S]*)$/);
      if (!m) return 'Usage: `/director-try three_console` or `/director-try three_do {"cmd":"timeline"}`';
      let a = {};
      if (m[2].trim()) { try { a = JSON.parse(m[2]); } catch (err) { return `Arguments must be JSON: ${err.message}`; } }
      const r = await HubBridge.call(m[1], a);
      if (r.ok === false) return `✖ ${r.error}`;
      if (r.images?.length) DirectorDock.viewImage({ tool: m[1], url: `data:${r.images[0].mime};base64,${r.images[0].data}`, at: Date.now() }, null);
      const v = typeof r.value === 'string' ? r.value : JSON.stringify(r.value, null, 1);
      return `\`${m[1]}\` → ${(v || 'done').length.toLocaleString()} chars (≈ ${Math.round((v || '').length / 4)} tokens)${r.images?.length ? ` + ${r.images.length} picture${r.images.length > 1 ? 's' : ''}` : ''}\n\`\`\`\n${(v || 'done').slice(0, 3000)}${v && v.length > 3000 ? '\n…' : ''}\n\`\`\``;
    },
  });

  // ---------- the docked chat ----------
  cmd({
    name: 'dock-width', args: '<px | reset | wider | narrower>', desc: 'Width of the docked director chat (remembered per tool)',
    complete: pick(['360', '420', '520', '640', 'reset', 'wider', 'narrower']),
    run: (args, ctx) => {
      const s = surfaceFor(ctx);
      const cur = DirectorDock.widthOf(s);
      const w = /^reset$/i.test(args) ? 420 : /^wider$/i.test(args) ? cur + 80 : /^narrower$/i.test(args) ? cur - 80 : Number(String(args).replace(/px$/i, ''));
      if (!Number.isFinite(w) || !args) return `The chat is **${cur} px** wide. \`/dock-width 520\`, \`wider\`, \`narrower\` or \`reset\`.`;
      return `Docked chat: **${DirectorDock.setWidth(s, w)} px**.`;
    },
  });
  cmd({
    name: 'dock-collapse', args: '[on | off]', desc: 'Fold the docked director chat to a thin bar (or open it again)', keys: 'Double-click the divider',
    complete: pick(['on', 'off']),
    run: (args, ctx) => {
      const s = surfaceFor(ctx);
      const want = onOff(args) ?? !store.get(`dockCollapsed.${s.tool.id}`, false);
      DirectorDock.setCollapsed(s, want);
      return null;
    },
  });
  cmd({
    name: 'director-chips', args: '[on | off | add <text> | remove <text> | reset]', desc: 'The quick-ask chips above the docked chat\'s box (your own too; start one with / to run a command)',
    complete: pick(['on', 'off', 'add ', 'remove ', 'reset']),
    run: (args, ctx) => {
      const [w0, ...rest] = words(args);
      const text = rest.join(' ');
      const a = directorFor(ctx);
      const toolId = toolOf(a) || 'three';
      const key = `director.chips.${toolId}`;
      if (onOff(w0) !== undefined) { store.set('director.chips', onOff(w0)); DirectorDock.refreshAll(); return `Quick chips ${onOff(w0) ? 'on' : 'off'}.`; }
      if (/^add$/i.test(w0) && text) { store.set(key, [...store.get(key, []).filter((t) => t !== text), text]); DirectorDock.refreshAll(); return `Added the chip “${text}”.`; }
      if (/^remove$/i.test(w0) && text) { store.set(key, store.get(key, []).filter((t) => t.toLowerCase() !== text.toLowerCase())); DirectorDock.refreshAll(); return `Removed “${text}”.`; }
      if (/^reset$/i.test(w0)) { store.set(key, []); DirectorDock.refreshAll(); return 'Back to the built-in chips.'; }
      return `**Quick chips** (${store.get('director.chips', true) ? 'shown' : 'hidden'})\n${DirectorDock.chipList(toolId).map((c) => `- ${c.label}${c.run ? ` → \`${c.run}\` (runs here, no tokens)` : ''}${c.own ? ' · yours' : ''}`).join('\n')}`;
    },
  });

  // ---------- how the director runs ----------
  cmd({
    name: 'director-mode', args: '[lean | full]', desc: 'Lean (default): everyday tools + one three_do tool, guide details on demand. Full: every tool and the whole guide on every message',
    complete: pick([{ value: 'lean', hint: 'cheapest per message' }, { value: 'full', hint: 'everything, every message' }]),
    run: async (args, ctx) => {
      const a = directorFor(ctx);
      if (!a) return 'No director set up yet (`/director-setup`).';
      if (!args) return `${a.name} runs in **${a.toolMode === 'full' ? 'full' : 'lean'}** mode. \`/director-mode lean\` or \`full\`; \`/director-cost\` compares them.`;
      if (!/^(lean|full)$/i.test(args)) return 'lean or full';
      await saveAgent(a, { toolMode: /^full$/i.test(args) ? 'full' : undefined });
      return `${a.name}: **${/^full$/i.test(args) ? 'full' : 'lean'}** mode from its next message${Native.current?.(a.id)?.session?.id ? ' (start a new chat to drop the old tool list from this one)' : ''}.`;
    },
  });
  cmd({
    name: 'director-engine', args: '[claude | astra]', desc: 'Back this director with Claude or with Astra (Codex: hub tools through MCP)',
    complete: pick([{ value: 'claude', hint: 'Claude Code' }, { value: 'astra', hint: 'Codex / ChatGPT, with the same tools' }]),
    run: async (args, ctx) => {
      const a = directorFor(ctx);
      if (!a) return 'No director set up yet (`/director-setup`).';
      if (!args) return `${a.name} runs on **${a.engine === 'codex' ? 'Astra (Codex)' : 'Claude'}**${a.engine === 'codex' ? `, hub tools ${a.hubTools ? 'on' : 'off'}` : ''}.`;
      const codex = /^(astra|codex|gpt|chatgpt)$/i.test(args);
      if (!codex && !/^claude$/i.test(args)) return 'claude or astra';
      if ((a.engine === 'codex') === codex) return `${a.name} already runs on ${codex ? 'Astra' : 'Claude'}.`;
      // same chat, same scene: the other engine picks up from the task state Hearth keeps (director-task.js)
      if (typeof Astra !== 'undefined' && Astra.switchDirector) Astra.switchDirector(a, codex ? 'codex' : 'claude');
      else await saveAgent(a, { engine: codex ? 'codex' : 'claude', model: undefined, effort: a.effort, ...(codex ? { hubTools: true } : {}) });
      return `${a.name} now runs on **${codex ? 'Astra (Codex, with the hub tools over MCP)' : 'Claude'}**, in the same chat and scene: its next message carries the task state (/task).${codex ? ' Codex support for MCP tools depends on your Codex version: if a tool call fails, `/director-engine claude` switches back.' : ''}`;
    },
  });
  cmd({
    name: 'astra-tools', args: '[on | off]', desc: 'Give an Astra (Codex) director the hub tools of its toolsets (Three.js / Video / Forge) through MCP',
    complete: pick(['on', 'off']),
    run: async (args, ctx) => {
      const a = H.agent(ctx.agentId)?.engine === 'codex' ? H.agent(ctx.agentId) : directors().find((x) => x.engine === 'codex');
      if (!a) return 'No Astra (Codex) director: `/director-engine astra` in a director chat makes one.';
      const on = onOff(args);
      if (on === undefined) return `${a.name}: hub tools **${a.hubTools ? 'on' : 'off'}**${SETS.some((k) => a[k]) ? '' : ' (it has no tool sets: give it some in its settings)'}.`;
      await saveAgent(a, { hubTools: on || undefined });
      return `${a.name}: hub tools **${on ? 'on' : 'off'}** from its next message.`;
    },
  });
  cmd({
    name: 'director-setup', args: '[three | video]', desc: 'Make the Three Director (or Video Director) if it\'s missing, docked in its tool',
    complete: pick(['three', 'video']),
    run: async (args) => {
      if (/^video$/i.test(args)) { activate('tool:ae'); await Review.ensureMounted?.(); if (!Tools.dockedAgent('ae')) await Review.directorSegment(); return null; }
      const have = H.agents().find((a) => a.dock === 'three' && a.threeTools);
      if (have) { activate('tool:three'); Tools.openDock('three'); return `${have.name} is already docked in the Lab.`; }
      H.config.agents.push({ id: `threedirector${H.agent('threedirector') ? Date.now() : ''}`, name: 'Three Director', icon: '◆', color: '#7c5cff', mode: 'native', engine: 'claude', dock: 'three', threeTools: true, selfReview: true, enabled: true });
      await saveConfig();
      activate('tool:three');
      return 'The Three Director is docked next to the Lab.';
    },
  });
  cmd({
    name: 'director-autoshot', args: '[on | off]', desc: 'Every code edit also returns a small preview picture (≈ 150 tokens each; off: the director asks with shot: true)',
    complete: pick(['on', 'off']),
    run: (args) => { const on = onOff(args); if (on === undefined) return `Auto preview after edits: **${store.get('director.autoShot', false) ? 'on' : 'off'}**.`; store.set('director.autoShot', on); return `Auto preview after edits **${on ? 'on' : 'off'}**.`; },
  });
  cmd({
    name: 'director-shot-size', args: '[small | medium | large]', desc: 'Default size of the director\'s screenshots (small 512 ≈ 250 tok, medium 1024 ≈ 1k, large 1280 ≈ 1.5k)',
    complete: pick(['small', 'medium', 'large']),
    run: (args) => { if (!/^(small|medium|large)$/i.test(args)) return `Director screenshots: **${store.get('director.shotSize', 'medium')}**.`; store.set('director.shotSize', args.toLowerCase()); return `Director screenshots: **${args.toLowerCase()}** by default (it can still ask for another size).`; },
  });

  // "/director <sub> …" reaches all of the above; anything else does what /director did before (Video Review).
  const SUBS = { guide: 'director-guide', tools: 'director-tools', ask: 'director-ask', cost: 'director-cost', undo: 'undo-edit', redo: 'redo-edit', edits: 'director-edits', activity: 'director-activity', stats: 'director-stats', clear: 'director-clear', peek: 'director-peek', try: 'director-try', width: 'dock-width', collapse: 'dock-collapse', chips: 'director-chips', mode: 'director-mode', engine: 'director-engine', setup: 'director-setup', autoshot: 'director-autoshot', 'shot-size': 'director-shot-size' };
  function registerAll() {
    for (const def of defs) {
      if (Commands.get(def.name)) { console.warn(`/${def.name} is taken; the director's version isn't registered`); continue; }
      Commands.register(def);
    }
    const prev = Commands.get('director');
    const sub = (args) => { const [w, ...rest] = words(args); const name = SUBS[String(w || '').toLowerCase()]; return name ? { def: Commands.get(name), rest: rest.join(' ') } : null; };
    Commands.register({
      ...(prev || {}), name: 'director', area: prev?.area || AREA, aliases: prev?.aliases || [],
      args: `[${Object.keys(SUBS).join(' | ')}]${prev ? ' · nothing: show / hide the Video Director' : ''}`,
      desc: `${prev ? `${prev.desc} · ` : ''}/director cost, undo, activity, mode, engine, width, chips…`,
      run: (args, ctx) => { const s = sub(args); if (s?.def) return s.def.run(s.rest, ctx); if (prev) return prev.run(args, ctx); return `Subcommands: ${Object.keys(SUBS).join(', ')}.`; },
      complete: (args, ctx) => { const s = sub(args); if (s?.def?.complete && /\s/.test(args)) return (s.def.complete(s.rest, ctx) || []).map((x) => ({ ...x, value: `${words(args)[0]} ${x.value}` })); return pick(Object.keys(SUBS))(args).concat(prev?.complete?.(args, ctx) || []); },
    });
  }
  // after every other script (video-cmds registers /director on DOMContentLoaded)
  if (document.readyState === 'complete') setTimeout(registerAll, 0); else addEventListener('load', () => setTimeout(registerAll, 0), { once: true });
})();
