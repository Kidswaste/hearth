// Task state per director chat (round 6, "brain"): what the chat is making and how far it got, kept by the hub (never
// by the model), so Claude and Astra can pick up each other's work in the same chat and scene.
//   - Recorded for free from what already happens: the owner's messages to a director (goal, latest asks) and every
//     hub tool call it makes (HubBridge.onResult): layers added, edits, nodes, keyframes, looks, frame, renders…,
//     its chat_progress checklist (open todos) and its last screenshot.
//   - Handed over once, compactly (≈ 100–250 tokens), to whichever engine runs the chat next: after /director-engine,
//     /handoff or the ⚇ menu's switch the old engine's session can't be resumed, so instead of the whole conversation
//     the new engine gets "[Task state…]" + the last few messages (Astra.beforeSend → DirectorTask.handover).
//   - Read on demand by the director (three_do { cmd: "task" }) and by the owner (/task).
// Data: data/kv/director-tasks.json { chatId: { goal, asks, done, todos, steps, shot, by, engine, at } }.
// Also here: three_do { cmd: "run", command } — a director runs a Lab / music / nodes / video chat command itself.
const DirectorTask = (() => {
  const KEY = 'director-tasks';
  const MAX_CHATS = 150;
  const cap = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`; };
  const ENGINE = { claude: 'Claude', codex: 'Astra' };
  let data = {};
  let ready = null;
  let saveTimer = 0;

  function load() {
    ready ||= (async () => { try { data = (await window.hub.kvGet(KEY)) || {}; } catch { data = {}; } })();
    return ready;
  }
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const ids = Object.keys(data).sort((a, b) => (data[b].at || 0) - (data[a].at || 0));
      for (const id of ids.slice(MAX_CHATS)) delete data[id];
      window.hub.kvSet(KEY, data).catch?.(() => {});
    }, 800);
  }
  const isDirector = (agent) => Boolean(agent && agent.mode === 'native' && (agent.dock || agent.threeTools || agent.videoTools));
  const agentOfChat = (chatId) => { const c = H.chats?.find((x) => x.id === chatId); return H.agent(c?.agentId) || H.agents().find((a) => String(chatId).startsWith(`${a.id}-`)) || null; };
  function stateOf(chatId, create = true) {
    if (!chatId) return null;
    if (!data[chatId] && create) data[chatId] = { goal: '', asks: [], done: [], todos: [], by: {}, at: Date.now() };
    return data[chatId] || null;
  }

  // ---------- recording ----------
  function noteAsk(agentId, chat, text) {
    const agent = H.agent(agentId);
    if (!isDirector(agent) || !chat?.id) return;
    const t = String(text || '').trim();
    if (!t || t.startsWith('/') || /^Jam · /.test(t)) return;
    const s = stateOf(chat.id);
    const line = cap(t.split('\nmcp:')[0], 200);
    if (!s.goal) s.goal = line;
    s.asks = [...s.asks.filter((a) => a !== line), line].slice(-3);
    s.at = Date.now();
    save();
  }
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  // One short line per thing the director changed; reads (eval, read, search, console…) leave no trace.
  function lineFor(tool, a, r) {
    const v = r?.value && typeof r.value === 'object' ? r.value : {};
    const L = (x) => cap(x ?? 'selected', 28);
    switch (tool) {
      case 'three_add_layer': return `added layer "${cap(v.added || a.name || a.template || 'Layer', 32)}"${a.template ? ` (${a.template})` : ''}`;
      case 'three_set_code': return `rewrote layer "${L(v.layer)}"`;
      case 'three_edit_code': {
        const names = [...new Set((a.edits || []).map((e) => e.layer).filter(Boolean))];
        return `edited ${names.length ? names.map(L).join(', ') : `"${L(v.layer || a.layer)}"`}`;
      }
      case 'three_update_layer': return `changed layer ${L(a.layer)}: ${[...Object.keys(a.settings || {}), a.code != null ? 'code' : null, a.order != null ? 'order' : null].filter(Boolean).join(', ') || 'settings'}`;
      case 'three_remove_layer': return `removed layer ${L(a.layer)}`;
      case 'three_nodes': { const c = cap(a.command, 60); return /^layer\b/i.test(c) ? `added node layer (${c.replace(/^layer\s*/i, '') || 'default preset'})` : `nodes: ${c}`; }
      case 'three_keyframes': return a.clear ? `cleared keyframes ${L(a.layer)}.${a.property}` : `keyframes ${L(a.layer)}.${a.property} (${(a.keys || []).length})`;
      case 'three_animate': return `animated ${L(a.layer)}: ${a.preset}`;
      case 'three_timeline_edit': return `timeline: ${Object.keys(a).filter((k) => k !== 'agentId').join(', ')}`;
      case 'three_looks': return a.action === 'save' || a.action === 'apply' ? `${a.action === 'save' ? 'saved' : 'applied'} look "${cap(a.name, 24)}"` : null;
      case 'three_sliders': return a.set && Object.keys(a.set).length ? `moved sliders ${Object.keys(a.set).slice(0, 4).join(', ')}` : null;
      case 'three_new_sketch': return `new sketch "${cap(a.name, 30)}"`;
      case 'three_set_frame': return `frame ${a.size}`;
      case 'three_load_media': return `loaded ${base(a.path)}`;
      case 'three_run': return `ran ${cap(a.command, 40)}`;
      case 'three_references': return ['add', 'palette', 'rename', 'remove'].includes(a.action) ? `references: ${a.action} ${cap(a.name || a.from || '', 24)}` : null;
      case 'three_notes': return a.action === 'done' ? `resolved note ${a.id}` : a.action === 'add' ? `added a note at ${a.time}s` : null;
      case 'video_open': return `opened ${base(a.path)}`;
      case 'video_add_note': return `note at ${a.time}s: ${cap(a.text, 40)}`;
      case 'video_export': return `exported ${a.preset}`;
      case 'ae_render': return `rendered ${base(a.project)}${a.comp ? ` / ${a.comp}` : ''}`;
      case 'ae_run_script': return `ran an AE script${a.label ? `: ${cap(a.label, 30)}` : ''}`;
      default: return null;
    }
  }
  const LOOKS = new Set(['three_screenshot', 'three_contact_sheet', 'video_frame', 'video_contact_sheet', 'chat_show']);
  function noteCall({ tool, args, result, chatId }) {
    if (!chatId) return;
    const s = stateOf(chatId);
    const agent = agentOfChat(chatId);
    if (agent?.engine) { s.engine = agent.engine; s.by[agent.engine] = (s.by[agent.engine] || 0) + 1; }
    s.at = Date.now();
    if (tool === 'chat_progress') {
      const steps = (args.steps || []).slice(0, 8).map((x) => ({ text: cap(x.text, 80), status: x.status || 'todo' }));
      s.steps = steps;
      s.todos = steps.filter((x) => x.status !== 'done').map((x) => x.text);
      save();
      return;
    }
    if (result?.ok === false) {
      if (lineFor(tool, args, null)) { s.lastError = `${tool.replace(/^three_/, '')}: ${cap(result.error, 90)}`; save(); }
      return;
    }
    if (LOOKS.has(tool)) { s.shot = { at: Date.now(), tool, by: agent?.engine || null }; save(); return; }
    const line = lineFor(tool, args, result);
    if (!line) return;
    delete s.lastError;
    // repeated edits of the same layer fold into one line ("edited "Rings" ×3")
    const last = s.done.at(-1);
    const m = last && last.replace(/ ×\d+$/, '') === line ? last.match(/ ×(\d+)$/) : null;
    if (last && last.replace(/ ×\d+$/, '') === line) s.done[s.done.length - 1] = `${line} ×${(m ? Number(m[1]) : 1) + 1}`;
    else s.done.push(line);
    if (s.done.length > 14) s.done.splice(0, s.done.length - 14);
    save();
  }

  // ---------- reading ----------
  function sceneLine(chatId) {
    try {
      const S = ThreeLab.scenes;
      const id = ChatScenes.linkOf(chatId);
      const sk = id && S?.get(id);
      if (!sk) return '';
      const sel = S.selectedOf(sk.id);
      const layers = S.layersOf(sk).map((L) => `${L.name}${L.id === sel ? '*' : ''} (${/\/\/ @nodes:v1 /.test(L.code) ? 'nodes' : ThreeLayers.isFilter(L.code) ? 'filter' : 'code'}${L.visible === false ? ', hidden' : ''})`);
      return `Scene "${sk.name}" layers, bottom first (* selected): ${layers.join(', ')}`;
    } catch { return ''; }
  }
  // The task state as the next engine (or three_do task) reads it; '' when nothing was recorded.
  function text(chatId, { from = null } = {}) {
    const s = stateOf(chatId, false);
    if (!s || (!s.goal && !s.done.length && !s.todos.length)) return '';
    const out = [`[Task state, kept by Hearth${from ? ` — you are taking over from ${from} in the same chat and scene; continue from here, don't redo finished work` : ''}]`];
    if (s.goal) out.push(`Goal: ${s.goal}`);
    const asks = s.asks.filter((a) => a !== s.goal);
    if (asks.length) out.push(`Latest asks: ${asks.join(' | ')}`);
    if (s.done.length) out.push(`Done so far: ${s.done.join('; ')}`);
    const scene = sceneLine(chatId);
    if (scene) out.push(scene);
    if (s.todos.length) out.push(`Open todos: ${s.todos.join('; ')}`);
    if (s.lastError) out.push(`Last failed call: ${s.lastError}`);
    if (s.shot) out.push(`Last look: ${ago(s.shot.at)}${s.shot.by ? ` by ${ENGINE[s.shot.by] || s.shot.by}` : ''} (take a fresh screenshot before judging).`);
    return out.join('\n');
  }

  // ---------- handing over to the other engine ----------
  // Called by Astra.beforeSend for every message. When the engine changed since the chat's last run (a director
  // switched engines, /handoff, the ⚇ switch), the old session can't be resumed: start fresh with the task state and
  // the last few messages (a director chat), or the usual earlier-conversation context (any other chat).
  function handover(chat, agent, raw, withContext) {
    const prev = chat.sessionEngine;
    const switched = Boolean((prev && prev !== agent.engine) || chat.handoffNext);
    chat.sessionEngine = agent.engine;
    if (!switched) return null;
    const from = ENGINE[prev] || chat.handoffEngine || 'the other engine';
    delete chat.handoffNext; delete chat.handoffEngine;
    chat.session = {};
    if (!isDirector(agent)) return withContext(chat, raw);
    const state = text(chat.id, { from });
    const recent = chat.messages.slice(0, -1).filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text).slice(-4)
      .map((m) => `${m.role === 'user' ? 'User' : 'Director'}: ${cap(m.text, 360)}`).join('\n');
    return [state || `[You are taking over this chat from ${from}, in the same scene.]`, recent ? `<recent_messages>\n${recent}\n</recent_messages>` : '', raw].filter(Boolean).join('\n\n');
  }

  // ---------- director tools: three_do task / run ----------
  // the chat a call belongs to: its own, else the one director chat that's answering
  function chatFor(ctx) {
    if (ctx?.chatId) return ctx.chatId;
    const busy = (H.chats || []).filter((c) => isDirector(H.agent(c.agentId)) && Native.isBusy(c.id));
    return busy.length === 1 ? busy[0].id : null;
  }
  async function taskTool(args, ctx) {
    await load();
    const chatId = chatFor(ctx);
    if (!chatId) return { ok: false, error: 'No chat to read the task of.' };
    if (Array.isArray(args.todo)) {
      const s = stateOf(chatId);
      s.todos = args.todo.map((x) => cap(x, 80)).filter(Boolean).slice(0, 8);
      s.at = Date.now();
      save();
    }
    return { ok: true, value: text(chatId) || 'Nothing recorded for this chat yet.' };
  }
  // Commands a director may run itself: the Lab, music, nodes, looks, timeline and video ones; nothing that deletes,
  // resets, signs in, changes settings or starts other agents.
  const RUN_AREAS = /lab|three|music|node|layer|look|fx|effect|timeline|scene|video|review|slider|frame|media|filter|shader|sketch|director/i;
  const RUN_DENY = /delete|remove|trash|clear|reset|wipe|purge|forget|restart|quit|login|logout|import|backup|settings|config|memory|engine|handoff|jam|collab|opinion|^do$|^run$|^every$|^at$|^ask|astra|claude/i;
  async function runTool(args, ctx) {
    const line = String(args.command || '').trim();
    const m = line.match(/^\/([\w-]+)/);
    if (!m) return { ok: false, error: 'Give a chat command line like "/make-it-react" or "/size 9:16".' };
    const def = Commands.get(m[1]);
    if (!def) return { ok: false, error: `No command /${m[1]} (three_do help commands lists the useful ones).` };
    if (RUN_DENY.test(def.name) || !RUN_AREAS.test(def.area || '')) return { ok: false, error: `/${def.name} (${def.area}) is the owner's to run: suggest it with <suggest>/${def.name}</suggest>.` };
    if (/[|;]/.test(line.slice(m[0].length))) return { ok: false, error: 'One command at a time (no pipes or chains).' };
    const chatId = chatFor(ctx);
    const agentId = (H.chats || []).find((c) => c.id === chatId)?.agentId || H.agents().find((a) => a.dock === 'three')?.id;
    let said = '';
    const grab = (t) => { said += `${said ? '\n' : ''}${typeof t === 'string' ? t : t?.textContent || ''}`; };
    const ran = await Commands.tryRun(line, agentId, null, { source: 'code', say: grab, note: grab, error: (e) => { said += `${said ? '\n' : ''}Error: ${e}`; }, history: false });
    if (!ran) return { ok: false, error: `Couldn't run ${line}.` };
    return { ok: !/^Error: /.test(said), ...(said.startsWith('Error: ') ? { error: cap(said.slice(7), 300) } : { value: cap(said, 1200) || `Ran ${line}.` }) };
  }
  if (typeof HubBridge !== 'undefined') {
    HubBridge.register(['three_task'], (name, args, ctx) => taskTool(args || {}, ctx));
    HubBridge.register(['three_run'], (name, args, ctx) => runTool(args || {}, ctx));
    HubBridge.onResult?.((call) => { load().then(() => noteCall(call)); });
  }
  if (typeof Native !== 'undefined') Native.hooks.send.push((agentId, chat, text) => { load().then(() => noteAsk(agentId, chat, text)); });

  // ---------- the owner's command ----------
  if (typeof Commands !== 'undefined' && !Commands.get('task')) {
    Commands.register({
      name: 'task', area: 'Director', args: '[clear]', desc: 'What this director chat is making and how far it got (Hearth keeps it; the other engine gets it when it takes over)',
      complete: () => [{ value: 'clear', hint: 'forget this chat\'s task state' }],
      run: async (args, ctx) => {
        await load();
        const chatId = ctx.chatId || H.activeChat?.[ctx.agentId];
        if (!chatId) return 'Open a director chat first.';
        if (/^clear$/i.test(args.trim())) { delete data[chatId]; save(); return 'Task state cleared for this chat.'; }
        const t = text(chatId);
        const s = data[chatId];
        const who = s?.by ? Object.entries(s.by).map(([e, n]) => `${ENGINE[e] || e} ${n}`).join(' · ') : '';
        return t ? `${t.replace(/^\[Task state, kept by Hearth\]\n/, '**Task state** (kept by Hearth, handed to the other engine when it takes over)\n')}${who ? `\nTool calls: ${who}` : ''}` : 'Nothing recorded for this chat yet (it fills in as the director works).';
      },
    });
  }
  load();
  return { text, handover, state: (chatId) => stateOf(chatId, false), isDirector, ready: load, _test: { lineFor, noteCall, noteAsk, runTool, taskTool } };
})();
