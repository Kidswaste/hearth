// Flows UI (round 10): the flow engine (flows.js) plugged into Hearth, and what the owner sees.
// - The view: a flow as nodes with connecting dots (nodes.js), the step it's on lit, the steps before it filled with
//   what was chosen / typed / made, the options as buttons right on the node, Validate ✓ to move on; a list of every
//   flow and run on the left (☰), the steps of the run on the right. Ctrl/⌘+Shift+F, /flows, "/" → Flows ›.
// - Runs live on disk (kv flow-runs) and as a small live card in the chat they started from (answer from there).
// - Authoring: ✎ Edit any flow (add / remove / rewire nodes, change their text), save it as yours (kv flows-mine);
//   /flow-make <what> asks Claude to write one from the command registry.
// - Chats: when a chat has a flow going and your message is about it ("next step", "where are we"…), one line about
//   the run rides along, and the reply can move it with <flow answer="…"/> (stripped from the reply). Nothing is
//   added otherwise (token frugality). /flow-status and /flow-step are plain commands any chat or director can run.
const FlowsUI = (() => {
  const KIND = {
    start: { icon: '●', color: '#c9b79c', label: 'Start' },
    action: { icon: '▶', color: '#48ddff', label: 'Run a command' },
    choice: { icon: '◇', color: '#ffd75e', label: 'A choice' },
    text: { icon: '✎', color: '#7cd992', label: 'Your words' },
    ai: { icon: '✦', color: '#bd8bff', label: 'The AI does it' },
    check: { icon: '⏱', color: '#ff8c42', label: 'Wait for…' },
    result: { icon: '★', color: '#ff6b9d', label: 'Result' },
  };
  const STATE_RUN = { done: 'ok', waiting: 'wait', running: 'running', hung: 'warn', stopped: 'warn', skipped: 'skip', error: 'error' };
  const short = (s, n = 90) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const plain = (s) => String(s || '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1');
  const nativeAgent = () => H.agents().find((a) => a.mode === 'native' && a.engine === 'claude' && !a.dock) || H.claudeAgent();
  const astraAgent = () => (Native.astraAgent ? Native.astraAgent() : H.agents().find((a) => a.mode === 'native' && a.engine === 'codex'));
  // the chat on screen: the agent you're on, or the tool's docked director, or Claude
  function hereAgent() {
    const a = H.agent(H.activeId);
    if (a?.mode === 'native') return a.id;
    const sid = String(H.surfaceIdFor?.(H.activeId) || '');
    const docked = sid.startsWith('tool:') && Tools.dockedAgent?.(sid.slice(5));
    return (docked && (docked.id || docked)) || nativeAgent()?.id;
  }

  // ---------- principal commands (the "/" menu) ----------
  const ADD_KEY = 'flows.principal.add'; const DEL_KEY = 'flows.principal.remove';
  let pCache = null; let pAt = 0;
  // the base list, yours added / removed (/principal), and the 4 commands you run most (3 runs or more)
  function principal() {
    if (pCache && performance.now() - pAt < 1500) return pCache;
    const counts = Commands.counts?.() || {};
    const top = Object.entries(counts).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).map(([k]) => k).filter((k) => Commands.get(k)).slice(0, 4);
    const del = new Set(store.get(DEL_KEY, []));
    pCache = new Set([...FlowsData.PRINCIPAL, ...store.get(ADD_KEY, []), ...top].map((n) => Commands.get(n)?.name || n).filter((n) => !del.has(n)));
    pAt = performance.now();
    return pCache;
  }
  const isTucked = (def) => Boolean(def) && !def.hidden && !principal().has(def.name);
  function setPrincipal(name, on) {
    const n = Commands.get(name)?.name; if (!n) throw new Error(`No command /${name}`);
    const add = new Set(store.get(ADD_KEY, [])); const del = new Set(store.get(DEL_KEY, []));
    if (on) { add.add(n); del.delete(n); } else { add.delete(n); del.add(n); }
    store.set(ADD_KEY, [...add]); store.set(DEL_KEY, [...del]); pCache = null;
  }

  // ---------- the flows ----------
  let mine = []; // your flows (kv flows-mine)
  let genKey = '';
  // journeys, the flows made from the commands (again when commands were added), yours
  function ensure() {
    const defs = Commands.list();
    const key = `${defs.length}`;
    if (key === genKey) return;
    genKey = key;
    for (const f of Flows.list()) if (f.source === 'commands') Flows.remove(f.id);
    for (const f of FlowsData.generate(defs, Commands.counts?.() || {})) Flows.define(f, { source: 'commands' });
    for (const j of FlowsData.JOURNEYS) if (!Flows.get(j.id) || Flows.get(j.id).source === 'journey') Flows.define(j, { source: 'journey' });
    for (const f of mine) Flows.define(f, { source: 'mine' });
  }
  const journeys = () => FlowsData.JOURNEYS.map((j) => Flows.get(j.id)).filter(Boolean);
  const generated = () => Flows.list().filter((f) => f.source === 'commands');
  const yours = () => Flows.list().filter((f) => f.source === 'mine');
  // where a command went: { principal, flow, journeys }
  function whereIs(name) {
    ensure();
    const def = Commands.get(String(name || '').replace(/^\//, ''));
    if (!def) return null;
    const flow = generated().find((f) => f.commands?.includes(def.name));
    return { def, principal: principal().has(def.name), flow, journeys: FlowsData.journeysWith(def.name).map((id) => Flows.get(id)).filter(Boolean) };
  }
  async function saveMine(flow) {
    const v = Flows.validate(flow);
    if (!v.ok) throw new Error(v.errors.join(' · '));
    const f = { ...v.flow, source: 'mine' };
    delete f.generated; delete f.commands;
    mine = [...mine.filter((x) => x.id !== f.id), f];
    await window.hub.kvSet('flows-mine', mine);
    Flows.define(f, { source: 'mine' });
    return f;
  }
  async function deleteMine(id) {
    mine = mine.filter((x) => x.id !== id);
    await window.hub.kvSet('flows-mine', mine);
    Flows.remove(id); genKey = ''; ensure();
  }
  const freeId = (base) => { let id = Flows.slug(base); for (let k = 2; Flows.get(id); k++) id = `${Flows.slug(base)}-${k}`; return id; };

  // ---------- the environment the engine runs in ----------
  const waiters = new Map(); // agentId → { res, rej } for AI steps sent into a chat
  // a command, run like you typed it in the run's chat; its notes still show there (Doctor's card with its buttons),
  // their text is the step's output
  async function runCommand(line, { run, node }) {
    const agentId = run.agentId || nativeAgent()?.id;
    let out = ''; let err = null;
    const show = node.kind !== 'check' && !node.quiet && agentId && Native.view?.(agentId);
    const grab = (t) => { out += `${out ? '\n' : ''}${plain(t)}`; };
    const handled = await Commands.tryRun(line, agentId, null, {
      source: 'flow', history: false,
      say: (t) => { grab(t); if (show) Native.note(agentId, String(t)); },
      note: (t, o) => { grab(t); if (show) Native.note(agentId, String(t), o); },
      error: (m) => { err = m; },
    });
    if (!handled) throw new Error(`${line.split(/\s/)[0]} isn't a command`);
    if (err) throw new Error(err);
    return out.trim() || `✓ ${line}`;
  }
  async function ask({ engine, prompt, run, node, inChat }) {
    const target = node.agent ? H.agent(node.agent) : engine === 'astra' ? astraAgent() : (run.agentId && H.agent(run.agentId)?.engine === 'claude' ? H.agent(run.agentId) : nativeAgent());
    if (!target) throw new Error(engine === 'astra' ? 'No Astra chat agent is set up' : 'No Claude chat agent is set up');
    if (inChat) { // into that chat, visibly: the reply is the output
      return new Promise((res, rej) => {
        waiters.set(target.id, { res, rej });
        Native.send(target.id, prompt).catch((e) => { waiters.delete(target.id); rej(e); });
      });
    }
    // a lean one-off question (no tools, no history): a step costs about one plain reply
    const r = await window.hub.askOnce({ agentId: target.id, text: prompt, options: { lean: true } });
    if (r?.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: target.id, usage: r.usage, source: 'flow' } }));
    if (!r?.ok) throw new Error(r?.error || `${target.name} gave no answer`);
    return r.text;
  }
  async function cmdOptions(name, run) {
    const def = Commands.get(name);
    if (!def?.complete) return [];
    const ctx = Commands.context(run.agentId || nativeAgent()?.id, null, { source: 'flow' });
    const list = (await def.complete('', ctx)) || [];
    return list.slice(0, 24).map((o) => ({ label: o.label || String(o.value), value: String(o.value).trim(), hint: o.hint || '' }));
  }

  async function setup() {
    Flows.configure({
      load: async (k, d) => (await window.hub.kvGet(k, d)) ?? d,
      save: (k, v) => window.hub.kvSet(k, v),
      cmdInfo: (name) => { const d = Commands.get(name); return d ? { name: d.name, args: d.args || '', desc: d.desc || '' } : null; },
      cmdOptions, runCommand, ask,
    });
    Commands.setTuck?.(isTucked);
    try { mine = (await window.hub.kvGet('flows-mine', [])) || []; } catch { mine = []; }
    ensure();
    await Flows.restore();
    Flows.onChange(onRunChange);
    // replies of chats an AI step waits for
    Native.hooks.event.push((event, chat) => {
      const w = waiters.get(chat.agentId);
      if (!w) return;
      waiters.delete(chat.agentId);
      if (event.type === 'done') w.res([...chat.messages].reverse().find((m) => m.role === 'assistant')?.text || '');
      else w.rej(new Error(event.type === 'stopped' ? 'The reply was stopped' : event.message || 'The engine stopped'));
    });
    Native.hooks.compose.push(composeHook);
    Native.hooks.finish.push(finishHook);
    Native.hooks.render.push((agentId, v, chat) => { if (chat) for (const r of Flows.ofChat(chat.id).slice(0, 3)) if (live(r)) cardSoon(r); });
    // hung steps: a quiet look every 5 s (no DOM), only while something runs
    setInterval(() => { if (Flows.active().some((r) => r.status === 'running' || r.status === 'waiting-ai')) Flows.checkHung(); }, 5000);
    const hung = Flows.runs().filter((r) => r.status === 'hung' && Date.now() - r.updated < 864e5);
    if (hung.length) toast(`${hung.length} flow${hung.length > 1 ? 's' : ''} stopped halfway when Hearth closed`, { timeout: 7000, action: { label: 'Pick up here', fn: () => open({ runId: hung[0].id }) } });
  }
  const live = (r) => r.status !== 'stopped' && (r.status !== 'done' || Date.now() - (r.ended || r.updated) < 30 * 60000);

  // ---------- the live card in the chat ----------
  const cardTimers = new Map(); const cardKeys = new Map();
  function cardSoon(run) {
    if (cardTimers.has(run.id)) return;
    cardTimers.set(run.id, setTimeout(() => { cardTimers.delete(run.id); card(run); }, 120));
  }
  function card(run) {
    const agentId = run.agentId;
    const v = agentId && Native.view?.(agentId);
    if (!v || !run.chatId || H.activeChat[agentId] !== run.chatId) return;
    const w = Flows.waiting(run);
    const flow = Flows.get(run.flowId);
    const done = run.steps.filter((e) => e.status === 'done').length;
    const head = `**${flow?.icon || '⇢'} ${run.flowName}** · ${done} step${done === 1 ? '' : 's'} · ${Flows.STATUS_LABEL[run.status] || run.status}`;
    const body = w ? `\n\n**${w.title}**${w.guess != null ? ` · Hearth thinks: ${(w.options.find((o) => o.value === w.guess) || {}).label || w.guess}` : ''}${w.hint ? ` · \`${w.hint}\`` : ''}`
      : run.status === 'hung' || run.status === 'stopped' ? `\n\n${run.why || 'Stopped'}`
        : run.status === 'done' ? `\n\n${short(run.result, 220)}` : `\n\n${Flows.current(run)?.node?.title || ''}…`;
    const actions = [];
    if (w && w.options.length && w.options.length <= 4) for (const o of w.options) actions.push({ label: o.label, title: o.hint || '', run: () => act(() => Flows.answer(run.id, o.value)) });
    else if (w) actions.push({ label: w.kind === 'text' ? 'Answer…' : 'Choose…', run: () => open({ runId: run.id }) });
    if (run.status === 'hung' || run.status === 'stopped') actions.push({ label: '↻ Pick up here', run: () => act(() => Flows.resume(run.id)) });
    if (run.status === 'done') actions.push({ label: '↻ Again', title: 'Same answers, a new result', run: () => act(async () => open({ runId: (await Flows.rerun(run.id)).id })) }, { label: '✎ Refine', title: 'Keep it and say what to change', run: () => refineAsk(run) });
    actions.push({ label: 'Open ›', run: () => openPage(run.id) });
    const text = `${head}${body}`;
    const key = `${text}|${actions.map((a) => a.label).join(',')}`;
    if (cardKeys.get(run.id) === key && v.list.querySelector(`.msg.note[data-note-id="flow-${run.id}"]`)) return; // nothing changed
    cardKeys.set(run.id, key);
    const box = Native.note(agentId, text, { id: `flow-${run.id}`, actions });
    box?.classList.add('flow-card', `flow-${run.status}`);
    box?.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, runMenu(run)); });
  }
  async function act(fn) { try { await fn(); } catch (err) { toast(err.message, { type: 'error' }); } }
  async function refineAsk(run) {
    const t = await Modal.prompt(`Refine “${run.flowName}”`, { label: 'Keep the result and change only this:', placeholder: 'shorter, warmer colors, a slower start…' });
    if (t != null && t.trim()) act(() => Flows.refine(run.id, t.trim()));
  }
  function runMenu(run) {
    const w = Flows.waiting(run);
    return [
      { label: 'Open the flow', action: () => openPage(run.id) },
      { label: 'Node view (advanced)', action: () => open({ runId: run.id }) },
      w && w.options.length ? { label: w.title, items: w.options.map((o) => ({ label: o.label, hint: o.hint ? short(o.hint, 40) : '', action: () => act(() => Flows.answer(run.id, o.value)) })) } : null,
      ['hung', 'stopped'].includes(run.status) ? { label: '↻ Pick up here', action: () => act(() => Flows.resume(run.id)) } : null,
      run.status === 'done' ? { label: '↻ Run again (same answers)', action: () => act(() => Flows.rerun(run.id)) } : null,
      run.status === 'done' ? { label: '✎ Refine the result…', action: () => refineAsk(run) } : null,
      { label: 'Change an answer ›', items: run.steps.map((e, i) => ({ e, i })).filter(({ e }) => ['choice', 'text'].includes(e.kind) && e.status === 'done').map(({ e, i }) => ({ label: e.title, hint: short(e.choice || e.input, 30), action: () => changeAnswer(run, i) })) },
      { label: 'Copy where it is', action: () => { navigator.clipboard.writeText(Flows.line(run)); toast('Copied', { timeout: 1200 }); } },
      !['done', 'stopped'].includes(run.status) ? { label: '■ Stop', danger: true, action: () => Flows.stop(run.id) } : null,
    ];
  }
  async function changeAnswer(run, index) {
    const e = run.steps[index];
    const node = Flows.nodeOf(run, e.node);
    let value;
    if (node.kind === 'choice') {
      value = await new Promise((res) => { const r = document.activeElement?.getBoundingClientRect?.() || { left: innerWidth / 2 - 120, bottom: 120 }; showMenu(r.left, r.bottom + 4, (node.options || []).map((o) => ({ label: o.label, checked: o.value === e.input, action: () => res(o.value) }))); setTimeout(() => res(undefined), 60000); });
    } else value = await Modal.prompt(`Change “${e.title}”`, { value: e.input || '', label: 'A new run continues from here with this answer (this one stays as it is).' });
    if (value == null) return;
    act(async () => open({ runId: (await Flows.branch(run.id, index, value)).id }));
  }

  // ---------- chats: one line when your words are about the flow, and <flow …/> in replies ----------
  const ABOUT = /\b(flow|step|steps|where are we|where we are|next step|continue|carry on|pick (it )?up|resume|hung|stuck|validate|go on)\b/i;
  function chatRun(chatId) { return Flows.ofChat(chatId).find((r) => r.status !== 'done' && r.status !== 'stopped' && Date.now() - r.updated < 6 * 3600e3) || null; }
  function composeHook(agentId, chat, text) {
    if (!chat || /^\//.test(text)) return undefined;
    const run = chatRun(chat.id);
    if (!run || !ABOUT.test(text)) return undefined;
    return `${text}\n\n[Hearth flow: ${Flows.line(run)}. To move it, end your reply with <flow answer="…"/> (or resume="1"); /flow-status for details.]`;
  }
  const TAG = /<flow\b([^>]*?)\/?>(?:<\/flow>)?/gi;
  function finishHook(event, chat) {
    if (event.type !== 'done' || !event.text || !/<flow\b/i.test(event.text)) return;
    const tags = [...event.text.matchAll(TAG)].map((m) => Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]])));
    const run = chatRun(chat.id);
    setTimeout(() => act(async () => {
      for (const t of tags.slice(0, 3)) {
        const r = t.run ? Flows.run(t.run) : run;
        if (!r) continue;
        if (t.resume) await Flows.resume(r.id);
        else if (t.answer != null && t.answer !== '…' && Flows.waiting(r)) await Flows.answer(r.id, t.answer);
      }
    }), 0);
  }

  // ---------- starting ----------
  async function startIn(flowId, { agentId, chatId, open: show = false } = {}) {
    ensure();
    const flow = Flows.get(flowId) || Flows.list().find((f) => f.name.toLowerCase().includes(String(flowId).toLowerCase()));
    if (!flow) throw new Error(`No flow “${flowId}” (/flows lists them)`);
    const a = agentId || hereAgent();
    let c = chatId || H.activeChat?.[a] || null;
    if (!c && a && Native.ensureChat) c = Native.ensureChat(a, `Flow: ${flow.name}`).id;
    const p = Flows.start(flow.id, { agentId: a, chatId: c });
    if (show) { const r = await Promise.race([p, new Promise((res) => setTimeout(() => res(null), 60))]); openPage((r || Flows.runs()[0]).id); }
    return p;
  }

  // (round 11) runs open on the Commands page (cmdpage.js), one question at a time; the node view is the advanced one
  const openPage = (runId) => (typeof CmdPage !== 'undefined' ? CmdPage.openRun(runId) : open({ runId }));

  // ---------- the view ----------
  let D = null; // { dlg, view, reg, mode, flowId, runId, draft, sel, pick, … }
  function onRunChange(run) {
    cardSoon(run);
    if (D?.mode === 'run' && D.runId === run.id) paintSoon();
    if (D) listSoon();
  }
  let paintRaf = 0; let listRaf = 0;
  const paintSoon = () => { if (!paintRaf) paintRaf = requestAnimationFrame(() => { paintRaf = 0; paint(); }); };
  const listSoon = () => { if (!listRaf) listRaf = requestAnimationFrame(() => { listRaf = 0; renderList(); }); };

  // one registry per view: a node type per flow node (a choice's options are its outputs)
  function typeFor(reg, n) {
    const k = KIND[n.kind] || KIND.action;
    const outs = n.kind === 'choice' ? (n.options || []).map((o, i) => ({ name: `o${i}`, label: o.label, type: 'step' }))
      : n.kind === 'result' && !n.next ? [] : [{ name: 'next', type: 'step', label: n.kind === 'check' ? 'then' : 'next' }];
    if (n.onError || n.onFail || (D?.mode === 'edit' && (n.kind === 'action' || n.kind === 'ai' || n.kind === 'check'))) outs.push({ name: 'err', type: 'step', label: n.kind === 'check' ? 'if not' : 'if it fails' });
    reg.define({ type: `f:${n.id}`, title: `${k.icon} ${n.title || k.label}`, category: k.label, color: k.color, width: 250, hidden: true, desc: `${k.label}${n.title ? `: ${n.title}` : ''}`, inputs: [{ name: 'in', type: 'step', multi: true, label: 'from' }], outputs: outs });
  }
  function makeRegistry() {
    const reg = NodeView.createRegistry({ name: 'flow', types: { step: { color: '#ffd75e', label: 'Step' } }, sliderLabel: null, bypass: false });
    // new steps from the picker (edit mode)
    for (const [kind, k] of Object.entries(KIND)) if (kind !== 'start') reg.define({ type: `k:${kind}`, title: `${k.icon} ${k.label}`, category: 'Steps', color: k.color, width: 250, desc: k.label, inputs: [{ name: 'in', type: 'step', multi: true }], outputs: kind === 'choice' ? [{ name: 'o0', type: 'step', label: 'Yes' }, { name: 'o1', type: 'step', label: 'No' }] : kind === 'result' ? [] : [{ name: 'next', type: 'step' }] });
    return reg;
  }
  function flowToGraph(flow, reg, keepXY = true) {
    for (const n of flow.nodes) typeFor(reg, n);
    const g = { v: 1, kind: 'flow', nodes: flow.nodes.map((n) => ({ id: n.id, type: `f:${n.id}`, x: n.x || 0, y: n.y || 0, ...(n.id === flow.start ? { badge: 'start' } : {}) })), links: [], frames: [], notes: [] };
    const ids = new Set(flow.nodes.map((n) => n.id));
    const link = (a, port, b) => { if (b && ids.has(b)) g.links.push({ from: [a, port], to: [b, 'in'] }); };
    for (const n of flow.nodes) {
      if (n.kind === 'choice') (n.options || []).forEach((o, i) => link(n.id, `o${i}`, o.next === null ? null : o.next || n.next));
      else link(n.id, 'next', n.next || n.refinedTo);
      link(n.id, 'err', n.onError || n.onFail);
    }
    if (!keepXY || !flow.nodes.some((n) => n.x || n.y)) layoutFlow(flow, g);
    return g;
  }
  // left to right in the order you meet the steps from the start (loops back don't push a step further right)
  const nextsOf = (n) => [...(n.options || []).map((o) => o.next || (o.next === null ? null : n.next)), n.next, n.onError, n.onFail, n.refinedTo].filter(Boolean);
  function layoutFlow(flow, g) {
    const by = new Map(flow.nodes.map((n) => [n.id, n]));
    const depth = new Map(); const order = [];
    const queue = flow.start && by.has(flow.start) ? [[flow.start, 0]] : [];
    while (queue.length) {
      const [id, d] = queue.shift();
      if (depth.has(id)) continue;
      depth.set(id, d); order.push(id);
      for (const nx of nextsOf(by.get(id))) if (by.has(nx) && !depth.has(nx)) queue.push([nx, d + 1]);
    }
    const max = Math.max(0, ...depth.values());
    for (const n of flow.nodes) if (!depth.has(n.id)) { depth.set(n.id, max + 1); order.push(n.id); }
    const hOf = (n) => 64 + (n.kind === 'choice' ? (n.options || []).length * 24 : 24) + ({ text: 90, result: 110, action: 40, ai: 50, check: 40 }[n.kind] || 30);
    const cols = new Map();
    for (const id of order) { const d = depth.get(id); if (!cols.has(d)) cols.set(d, []); cols.get(d).push(id); }
    const heights = new Map([...cols].map(([d, ids]) => [d, ids.reduce((s, id) => s + hOf(by.get(id)) + 28, 0)]));
    const tall = Math.max(0, ...heights.values());
    for (const [d, ids] of cols) {
      let y = Math.round((tall - heights.get(d)) / 2);
      for (const id of ids) { const gn = g.nodes.find((x) => x.id === id); if (gn) { gn.x = d * 300; gn.y = Math.round(y / 16) * 16; } y += hOf(by.get(id)) + 28; }
    }
  }
  // the whole flow when it fits at a readable size, else the step it's on at a readable size
  function frame(run) {
    if (!D?.view) return;
    D.view.fit(null);
    if (D.view.view.z < 0.72) { D.view.zoom(0.85); const at = run && (Flows.current(run)?.entry.node || run.steps.at(-1)?.node); D.view.center(at || (run?.flow || D.draft || Flows.get(D.flowId))?.start); }
  }
  // the edited graph back into the flow (edit mode): positions, wires, removed and new steps
  function graphToFlow(g, flow) {
    const by = new Map(flow.nodes.map((n) => [n.id, n]));
    const nodes = [];
    for (const gn of g.nodes) {
      let n = by.get(gn.id);
      if (!n && gn.type.startsWith('k:')) {
        const kind = gn.type.slice(2);
        n = { id: gn.id.replace(/^k/, kind).replace(/[^\w-]/g, '') || `${kind}${nodes.length}`, kind, title: KIND[kind].label };
        if (kind === 'choice') n.options = [{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }];
        if (kind === 'action') n.cmd = '/help';
        if (kind === 'ai') { n.prompt = 'Write …'; n.engine = 'claude'; }
        if (kind === 'check') n.ask = 'Is it done?';
        if (kind === 'text') n.var = n.id;
        gn.newId = n.id;
      }
      if (!n) continue;
      n = { ...n, x: Math.round(gn.x), y: Math.round(gn.y) };
      delete n.next; delete n.onError; delete n.onFail; delete n.refinedTo;
      if (n.options) n.options = n.options.map((o) => ({ ...o, next: null }));
      nodes.push(n);
    }
    const idOf = (id) => g.nodes.find((x) => x.id === id)?.newId || id;
    for (const l of g.links) {
      const a = nodes.find((n) => n.id === idOf(l.from[0])); const b = idOf(l.to[0]);
      if (!a) continue;
      if (/^o\d+$/.test(l.from[1]) && a.options) { const o = a.options[Number(l.from[1].slice(1))]; if (o) o.next = b; } else if (l.from[1] === 'err') { if (a.kind === 'check') a.onFail = b; else a.onError = b; } else a.next = b;
    }
    for (const n of nodes) if (n.options) n.options = n.options.map((o) => { const x = { ...o }; if (x.next == null) delete x.next; return x; });
    const start = nodes.some((n) => n.id === flow.start) ? flow.start : nodes[0]?.id;
    return { ...flow, nodes, start };
  }

  function open({ flowId, runId, edit = false, draft = null } = {}) {
    ensure();
    if (!D) build();
    if (!D.dlg.open) D.dlg.showModal();
    if (draft) show({ mode: 'edit', flowId: draft.id, draft });
    else if (runId) show({ mode: 'run', runId });
    else if (flowId) show({ mode: edit ? 'edit' : 'flow', flowId });
    else { const a = Flows.active()[0]; show(a ? { mode: 'run', runId: a.id } : { mode: 'flow', flowId: D.flowId || 'doctor' }); }
    return D;
  }
  function build() {
    const title = el('b', { class: 'fl-title' });
    const pill = el('span', { class: 'fl-pill' });
    const primary = el('button', { class: 'primary small fl-primary', type: 'button' });
    const more = el('button', { class: 'ghost small', type: 'button', text: '⋯', title: 'More: run again, refine, edit, save as yours, JSON, stop' });
    const listBtn = el('button', { class: 'ghost small fl-listbtn', type: 'button', text: '☰', title: 'Every flow and run (L)' });
    const close = el('button', { class: 'ghost small', type: 'button', text: '✕', title: 'Close (Esc)' });
    const list = el('div', { class: 'fl-list' });
    const host = el('div', { class: 'fl-canvas' });
    const side = el('div', { class: 'fl-side' });
    const dlg = el('dialog', { class: 'nv-dialog fl-dialog' },
      el('div', { class: 'nv-dialog-head fl-head' }, listBtn, title, pill, el('span', { class: 'spacer' }), primary, more, close),
      el('div', { class: 'fl-body' }, list, host, side));
    document.body.append(dlg);
    D = { dlg, title, pill, primary, more, listBtn, list, host, side, view: null, reg: null, mode: null, pick: null, query: '' };
    D.listOpen = store.get('flows.list', true);
    dlg.classList.toggle('fl-nolist', !D.listOpen);
    listBtn.addEventListener('click', () => { D.listOpen = !D.listOpen; store.set('flows.list', D.listOpen); dlg.classList.toggle('fl-nolist', !D.listOpen); requestAnimationFrame(() => D.view?.relayout()); });
    close.addEventListener('click', () => dlg.close());
    primary.addEventListener('click', () => primaryAct());
    more.addEventListener('click', () => showMenuAt(more, moreMenu()));
    dlg.addEventListener('close', () => { D.view?.destroy(); D.view = null; D.mode = null; });
    // buttons and fields on the nodes get their own clicks (the node editor would start a drag)
    host.addEventListener('pointerdown', (e) => { if (e.target.closest('.fl-opt, .fl-deco button, .fl-deco input, .fl-deco textarea, .fl-deco .fl-out, .fl-chip')) e.stopPropagation(); }, true);
    host.addEventListener('click', onCanvasClick);
    host.addEventListener('dblclick', (e) => { const o = e.target.closest('.fl-opt'); if (o) { selectOption(o.dataset.value); validate(); } });
    dlg.addEventListener('keydown', onKey);
  }
  function show(s) {
    Object.assign(D, { mode: s.mode, flowId: s.flowId || null, runId: s.runId || null, draft: s.draft || null, pick: null, sel: null, lastFocus: null });
    const run = D.runId ? Flows.run(D.runId) : null;
    const flow = run ? run.flow : D.draft || Flows.get(D.flowId);
    if (!flow) { toast('No such flow', { type: 'error' }); return; }
    if (D.mode === 'edit' && !D.draft) D.draft = JSON.parse(JSON.stringify(flow));
    D.view?.destroy();
    if (store.get('nodes.flows.minimap', null) == null) store.set('nodes.flows.minimap', false); // the steps fill the view: no minimap at first
    D.reg = makeRegistry();
    const g = flowToGraph(D.mode === 'edit' ? D.draft : flow, D.reg);
    D.view = NodeView.create(D.host, {
      registry: D.reg, graph: g, readOnly: D.mode !== 'edit', roMove: true, storeKey: 'nodes.flows', live: false,
      onChange: D.mode === 'edit' ? onEdit : null,
      onSelect: (ids) => { D.sel = ids.length === 1 ? ids[0] : null; if (D.mode === 'edit') renderSide(); },
      onOpen: (id) => { if (D.mode === 'run') focusStep(id); },
      nodeMenu: (n) => nodeMenu(n.id),
      menuItems: D.mode === 'edit' ? [{ label: 'Check this flow', action: () => renderSide(true) }] : [],
    });
    requestAnimationFrame(() => { paint(); frame(run); });
    renderList();
    renderHead();
    renderSide();
  }
  const currentRun = () => (D?.mode === 'run' ? Flows.run(D.runId) : null);
  function renderHead() {
    const run = currentRun();
    const flow = run ? Flows.get(run.flowId) || run.flow : D.draft || Flows.get(D.flowId);
    D.title.textContent = `${flow?.icon || '⇢'} ${run ? run.flowName : flow?.name || ''}${D.mode === 'edit' ? ' · editing' : ''}`;
    D.pill.textContent = run ? Flows.STATUS_LABEL[run.status] : D.mode === 'edit' ? 'not saved' : `${flow?.nodes.length || 0} steps`;
    D.pill.className = `fl-pill${run ? ` fl-${run.status}` : ''}`;
    const w = run && Flows.waiting(run);
    const pickLabel = w && w.kind !== 'text' ? (w.options.find((o) => String(o.value) === String(D.pick?.node === w.node.id ? D.pick.value : w.guess ?? w.last)) || {}).label : '';
    const label = D.mode === 'edit' ? 'Save as mine' : !run ? '▶ Start' : w ? `Validate${pickLabel ? `: ${short(pickLabel, 24)}` : ''} ✓` : ['hung', 'stopped'].includes(run.status) ? '↻ Pick up here' : run.status === 'done' ? '↻ Again' : '■ Stop';
    if (D.primary.textContent !== label) D.primary.textContent = label;
    D.primary.title = w ? 'Move on with this answer (Enter)' : run?.status === 'done' ? 'The same answers again: a new result' : '';
    D.primary.disabled = Boolean(w && w.kind !== 'text' && D.pick?.node !== w.node.id && w.guess == null && w.last == null);
  }
  async function primaryAct() {
    const run = currentRun();
    if (D.mode === 'edit') return saveDraft();
    if (!run) { const r = await startIn(D.flowId).catch((err) => { toast(err.message, { type: 'error' }); return null; }); if (r) show({ mode: 'run', runId: r.id }); return; }
    const w = Flows.waiting(run);
    if (w) return validate();
    if (['hung', 'stopped'].includes(run.status)) return act(() => Flows.resume(run.id));
    if (run.status === 'done') return act(async () => { const r = Flows.rerun(run.id); show({ mode: 'run', runId: Flows.runs()[0].id }); await r; });
    Flows.stop(run.id);
  }
  // Validate: the picked option, the typed words, or (nothing picked) what Hearth guessed / you said last time
  function validate() {
    const run = currentRun(); const w = run && Flows.waiting(run);
    if (!w) return;
    let value;
    if (w.kind === 'text') value = D.host.querySelector(`.nv-node[data-id="${CSS.escape(w.node.id)}"] .fl-input`)?.value ?? '';
    else value = D.pick?.node === w.node.id ? D.pick.value : w.guess ?? w.last;
    if (value == null) { toast('Pick an option on the node first', { timeout: 1600 }); return; }
    D.pick = null;
    act(() => Flows.answer(run.id, value));
  }
  function selectOption(value) {
    const run = currentRun(); const w = run && Flows.waiting(run);
    if (!w || w.kind === 'text') return;
    D.pick = { node: w.node.id, value };
    for (const r of D.host.querySelectorAll('.fl-opt')) r.classList.toggle('fl-sel', r.dataset.value === String(value));
    renderHead();
  }
  function onCanvasClick(e) {
    const o = e.target.closest('.fl-opt');
    if (o) { selectOption(o.dataset.value); return; }
    const b = e.target.closest('[data-fl]');
    if (!b) return;
    const run = currentRun();
    const what = b.dataset.fl;
    if (what === 'validate') validate();
    else if (what === 'yes' || what === 'no') act(() => Flows.answer(run.id, what));
    else if (what === 'resume') act(() => Flows.resume(run.id));
    else if (what === 'again') primaryAct();
    else if (what === 'refine') refineAsk(run);
    else if (what === 'chip') { const inp = b.closest('.fl-deco').querySelector('.fl-input'); inp.value = b.dataset.value; inp.focus(); }
    else if (what === 'change') changeAnswer(run, Number(b.dataset.i));
    else if (what === 'copy') { navigator.clipboard.writeText(b.dataset.text || ''); toast('Copied', { timeout: 1200 }); }
  }
  function onKey(e) {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    const run = currentRun(); const w = run && Flows.waiting(run);
    if (e.key === 'Enter' && w && (!typing || e.target.classList.contains('fl-input')) && (!e.shiftKey || e.ctrlKey || e.metaKey) && !(e.target.tagName === 'TEXTAREA' && !(e.ctrlKey || e.metaKey))) { e.preventDefault(); validate(); return; }
    if (!typing && w && /^[1-9]$/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) { const o = w.options[Number(e.key) - 1]; if (o) { e.preventDefault(); selectOption(o.value); } return; }
    if (!typing && e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey && !e.altKey && e.target === D.dlg) D.listBtn.click();
  }

  // the run on the nodes: status per node, decorations (what was chosen / typed / made, the options as buttons)
  function paint(depth = 0) {
    if (!D?.view) return;
    renderHead();
    const run = currentRun();
    if (!run) { for (const n of (D.draft || Flows.get(D.flowId))?.nodes || []) decorate(n, null, null); D.view.relayout(); if (D.mode !== 'edit' && depth < 3 && unOverlap()) paint(depth + 1); return; }
    // refine added steps: the graph grows
    const have = new Set(D.view.getGraph().nodes.map((n) => n.id));
    if (run.flow.nodes.some((n) => !have.has(n.id))) { D.view.setGraph(flowToGraph(run.flow, D.reg, false), { keepView: true, history: false }); }
    const latest = new Map();
    run.steps.forEach((e, i) => { if (e.status !== 'retried') latest.set(e.node, { e, i }); });
    for (const n of run.flow.nodes) {
      const hit = latest.get(n.id);
      const st = hit ? STATE_RUN[hit.e.status] || null : null;
      const text = hit && (hit.e.status === 'skipped' || (hit.e.status === 'running' && hit.e.kind === 'ai')) ? stepText(hit.e) : '';
      const was = D.view.runOf(n.id);
      if ((was?.state || null) !== st || (was?.text || '') !== text) D.view.setRun(n.id, st, text);
      decorate(n, hit?.e || null, run, hit?.i);
    }
    D.view.relayout();
    if (depth < 3 && unOverlap()) return paint(depth + 1);
    renderSide();
    // keep the step that waits in sight
    const cur = Flows.current(run);
    if (cur && D.lastFocus !== `${run.id}:${run.steps.length}` && D.lastFocus) D.view.center(cur.entry.node);
    D.lastFocus = `${run.id}:${run.steps.length}`;
  }
  // steps grow with what they made: push the ones below down so nothing overlaps (only ever down, so it settles)
  function unOverlap() {
    const g = D.view.getGraph();
    const cols = new Map();
    for (const n of g.nodes) { const k = Math.round(n.x / 50); if (!cols.has(k)) cols.set(k, []); cols.get(k).push(n); }
    let moved = false;
    for (const list of cols.values()) {
      list.sort((a, b) => a.y - b.y);
      let bottom = -Infinity;
      for (const n of list) {
        const h = D.host.querySelector(`.nv-node[data-id="${CSS.escape(n.id)}"]`)?.offsetHeight || 80;
        if (n.y < bottom + 26) { n.y = Math.ceil((bottom + 26) / 16) * 16; moved = true; }
        bottom = n.y + h;
      }
    }
    if (moved) D.view.setGraph(g, { keepView: true, history: false });
    return moved;
  }
  function stepText(e) {
    if (e.status === 'skipped') return 'skipped';
    if (e.status === 'hung') return e.error || 'hung';
    if (e.kind === 'choice') return e.choice || '';
    if (e.kind === 'text') return e.input ? `“${short(e.input, 40)}”` : '';
    if (e.status === 'waiting') return 'waiting for you';
    if (e.status === 'running') return e.kind === 'ai' ? `${e.engine === 'astra' ? 'Astra' : 'Claude'} is on it…` : 'running…';
    return short(e.output || e.error || '', 60);
  }
  function decorate(n, e, run, index) {
    const nodeEl = D.host.querySelector(`.nv-node[data-id="${CSS.escape(n.id)}"]`);
    if (!nodeEl) return;
    const w = run && Flows.waiting(run);
    const isNow = w && w.node.id === n.id;
    const hung = run && e && (e.status === 'hung' || (e.status === 'stopped' && run.status === 'stopped'));
    const lastResult = run && run.status === 'done' && n.kind === 'result' && e && run.steps.at(-1) === e;
    const key = JSON.stringify([e?.status, e?.choice, e?.input, e?.output, isNow && w.options.length, isNow && w.hint, isNow && w.guess, isNow && w.last, hung && run.why, lastResult, D.mode]);
    // the options are the node's own output rows: lit when chosen, buttons when it's their turn
    const opts = n.kind === 'choice' ? (isNow ? w.options : e?.options || n.options || []) : n.kind === 'check' && isNow ? w.options : [];
    const rows = [...nodeEl.querySelectorAll('.nv-row.out')];
    rows.forEach((r, i) => {
      const o = n.kind === 'choice' ? (n.options || [])[i] : null;
      r.classList.toggle('fl-opt', Boolean(isNow && n.kind === 'choice' && o));
      r.classList.toggle('fl-chosen', Boolean(e?.status === 'done' && o && e.input === o.value));
      r.classList.toggle('fl-guess', Boolean(isNow && o && w.guess === o.value));
      r.classList.toggle('fl-last', Boolean(isNow && o && w.last === o.value));
      r.classList.toggle('fl-sel', Boolean(isNow && o && D.pick?.node === n.id && D.pick.value === o.value));
      if (o) { r.dataset.value = o.value; if (o.hint) r.title = o.hint; }
    });
    if (nodeEl.dataset.flKey === key && nodeEl.querySelector('.fl-deco')) return;
    nodeEl.dataset.flKey = key;
    nodeEl.querySelector('.fl-deco')?.remove();
    const body = nodeEl.querySelector('.nv-body');
    if (!body) return;
    const deco = el('div', { class: `fl-deco fl-k-${n.kind}` });
    const what = n.kind === 'action' || (n.kind === 'check' && n.cmd) ? (e?.input || n.cmd) : n.kind === 'ai' ? `${n.agent ? 'in the chat · ' : ''}${n.engine === 'astra' ? 'Astra' : 'Claude'}: ${short(e?.input || n.prompt, 120)}` : n.kind === 'check' ? n.ask : n.kind === 'text' ? '' : '';
    if (what) deco.append(el('div', { class: 'fl-what', text: short(what, 140), title: String(e?.input || n.cmd || n.prompt || n.ask || '') }));
    // what it made
    if (e && (e.kind === 'action' || e.kind === 'ai' || e.kind === 'check' || e.kind === 'result') && e.output) {
      deco.append(el('div', { class: `fl-out${e.kind === 'result' ? ' fl-result' : ''}`, text: e.kind === 'result' ? e.output : short(e.output, 220), title: 'Right-click the node to copy it' }));
    }
    if (e?.kind === 'text' && e.status === 'done') deco.append(el('div', { class: 'fl-said', text: e.input ? `“${short(e.input, 160)}”` : '(nothing)' }));
    if (e?.status === 'done' && (e.kind === 'choice' || e.kind === 'text') && !e.copied && !e.replayed) deco.append(el('button', { type: 'button', class: 'ghost tiny fl-change', text: '✎ change', title: 'Change this answer and continue from here (a branch: this run stays)', dataset: { fl: 'change', i: String(index) } }));
    if (isNow) {
      if (w.guess != null && n.kind === 'choice') deco.append(el('div', { class: 'fl-hint', text: `Hearth thinks: ${(w.options.find((o) => o.value === w.guess) || {}).label || w.guess}` }));
      if (w.last != null) deco.append(el('div', { class: 'fl-hint', text: `Last time: ${short(w.last, 60)}` }));
      if (n.kind === 'choice') {
        if (w.options.length > (n.options || []).length) { // options from a command (/theme): chips
          deco.append(el('div', { class: 'fl-chips' }, w.options.slice((n.options || []).length).map((o) => el('button', { type: 'button', class: `fl-chip fl-opt${D.pick?.value === o.value ? ' fl-sel' : ''}`, text: short(o.label, 28), title: o.hint || '', dataset: { value: o.value } }))));
        }
        if ((n.options || []).length > 8) {
          const q = el('input', { class: 'fl-filter', type: 'search', placeholder: `Filter ${n.options.length}…`, spellcheck: false });
          q.addEventListener('input', () => { const s = q.value.toLowerCase(); rows.forEach((r) => { r.hidden = Boolean(s) && !r.textContent.toLowerCase().includes(s) && !(r.title || '').toLowerCase().includes(s); }); D.view.relayout(); });
          q.addEventListener('keydown', (k) => { if (k.key === 'Enter') { const first = rows.find((r) => !r.hidden && r.classList.contains('fl-opt')); if (first) { k.preventDefault(); k.stopPropagation(); selectOption(first.dataset.value); } } });
          deco.append(q);
        }
        deco.append(el('button', { type: 'button', class: 'primary small fl-validate', text: 'Validate ✓', dataset: { fl: 'validate' } }));
      } else if (n.kind === 'text') {
        if (w.hint) deco.append(el('code', { class: 'fl-arghint', text: w.hint }));
        const multi = !n.argsOf;
        const inp = el(multi ? 'textarea' : 'input', { class: 'fl-input', rows: multi ? 3 : undefined, placeholder: n.placeholder || (n.argsOf ? 'arguments (or leave empty)' : 'type here…'), value: w.last ?? '', spellcheck: multi });
        // Enter validates (Ctrl/⌘+Enter in the bigger box, where Enter makes a new line)
        inp.addEventListener('keydown', (k) => { k.stopPropagation(); if (k.key === 'Enter' && (!multi || k.ctrlKey || k.metaKey)) { k.preventDefault(); validate(); } });
        deco.append(inp);
        if (n.argsOf) {
          const chips = el('div', { class: 'fl-chips' });
          deco.append(chips);
          cmdOptions(String(run.vars[n.argsOf] || ''), run).then((list) => chips.append(...list.slice(0, 10).map((o) => el('button', { type: 'button', class: 'fl-chip', text: short(o.label, 24), title: o.hint || '', dataset: { fl: 'chip', value: o.value } })))).catch(() => {});
        }
        deco.append(el('button', { type: 'button', class: 'primary small fl-validate', text: 'Validate ✓', dataset: { fl: 'validate' } }));
        setTimeout(() => { if (D?.dlg.open && !D.dlg.contains(document.activeElement?.closest?.('.fl-input') || null)) inp.focus({ preventScroll: true }); }, 60);
      } else if (n.kind === 'check') {
        deco.append(el('div', { class: 'fl-row' }, el('button', { type: 'button', class: 'primary small', text: 'Yes ✓', dataset: { fl: 'yes' } }), n.onFail ? el('button', { type: 'button', class: 'ghost small', text: 'No', dataset: { fl: 'no' } }) : null));
      }
    }
    if (hung) deco.append(el('div', { class: 'fl-why', text: run.why || 'Stopped here' }), el('button', { type: 'button', class: 'primary small', text: '↻ Pick up here', dataset: { fl: 'resume' } }));
    if (lastResult) deco.append(el('div', { class: 'fl-row' }, el('button', { type: 'button', class: 'primary small', text: '↻ Again', title: 'The same answers, a new result', dataset: { fl: 'again' } }), el('button', { type: 'button', class: 'ghost small', text: '✎ Refine', title: 'Keep it and say what to change', dataset: { fl: 'refine' } }), el('button', { type: 'button', class: 'ghost small', text: '⧉', title: 'Copy the result', dataset: { fl: 'copy', text: run.result || '' } })));
    if (!deco.childNodes.length) return;
    body.append(deco);
  }
  function focusStep(id) {
    const run = currentRun(); if (!run) return;
    const i = run.steps.map((e) => e.node).lastIndexOf(id);
    D.side.querySelector(`[data-step="${i}"]`)?.scrollIntoView({ block: 'nearest' });
  }
  function nodeMenu(id) {
    const run = currentRun();
    const items = [];
    if (run) {
      const i = run.steps.map((e) => e.node).lastIndexOf(id);
      const e = run.steps[i];
      if (e?.output) items.push({ label: 'Copy what it made', action: () => navigator.clipboard.writeText(e.output) });
      if (e && ['choice', 'text'].includes(e.kind) && e.status === 'done') items.push({ label: 'Change this answer…', action: () => changeAnswer(run, i) });
      if (e && i >= 0) items.push({ label: 'Go back here (a branch)', action: () => act(async () => show({ mode: 'run', runId: (await Flows.branch(run.id, i)).id })) });
    } else if (D.mode === 'edit') {
      items.push({ label: 'Start here', action: () => { D.draft.start = id; refreshDraft(); } });
    }
    return items;
  }

  // the steps of a run (right), the flow's facts (preview), the inspector (edit)
  function renderSide(checkNow = false) {
    if (!D) return;
    const run = currentRun();
    if (D.mode === 'edit') return renderInspector(checkNow);
    if (!run) {
      const f = Flows.get(D.flowId);
      if (!f) return;
      const runs = Flows.runs().filter((r) => r.flowId === f.id).slice(0, 6);
      D.side.replaceChildren(
        el('p', { class: 'fl-desc', text: f.desc || '' }),
        f.commands ? el('p', { class: 'fl-small', text: `${f.commands.length} commands, each one choice away (they still run typed by name).` }) : null,
        el('div', { class: 'fl-row' }, el('button', { type: 'button', class: 'primary small', text: '▶ Start', on: { click: () => primaryAct() } }), el('button', { type: 'button', class: 'ghost small', text: '✎ Edit a copy', on: { click: () => editCopy(f) } })),
        runs.length ? el('div', { class: 'fl-sub', text: 'Runs' }) : null,
        ...runs.map((r) => runRow(r)));
      return;
    }
    const steps = run.steps.map((e, i) => el('div', { class: `fl-step fl-s-${e.status}${e.copied ? ' fl-copied' : ''}`, dataset: { step: String(i) }, title: e.started ? new Date(e.started).toLocaleTimeString() : '',
      on: { click: () => D.view.center(e.node), contextmenu: (ev) => { ev.preventDefault(); ev.stopPropagation(); showMenu(ev.clientX, ev.clientY, [
        e.output ? { label: 'Copy what it made', action: () => navigator.clipboard.writeText(e.output) } : null,
        ['choice', 'text'].includes(e.kind) && e.status === 'done' ? { label: 'Change this answer…', action: () => changeAnswer(run, i) } : null,
        { label: 'Go back here (a branch)', action: () => act(async () => show({ mode: 'run', runId: (await Flows.branch(run.id, i)).id })) }]); } } },
      el('span', { class: 'fl-ico', text: { done: '✓', waiting: '⏸', running: '◐', hung: '!', skipped: '–', retried: '↻', stopped: '■', error: '✕' }[e.status] || '·' }),
      el('span', { class: 'fl-st', text: e.title }), el('span', { class: 'fl-sv', text: short(stepText(e), 46) })));
    const family = [run.parent && Flows.run(run.parent.run), ...(run.branches || []).map((id) => Flows.run(id))].filter(Boolean);
    D.side.replaceChildren(
      el('div', { class: 'fl-sub', text: `Steps · started ${new Date(run.created).toLocaleString()}` }), ...steps,
      run.status === 'done' && run.result ? el('div', { class: 'fl-sub', text: 'Result' }) : null,
      run.status === 'done' && run.result ? el('div', { class: 'fl-result-side', text: run.result }) : null,
      family.length ? el('div', { class: 'fl-sub', text: run.parent ? 'Came from · branches' : 'Branches' }) : null,
      ...family.map((r) => runRow(r)));
  }
  const runRow = (r) => el('button', { type: 'button', class: `fl-run fl-${r.status}${D?.runId === r.id ? ' on' : ''}`, title: Flows.line(r), on: { click: () => show({ mode: 'run', runId: r.id }), contextmenu: (ev) => { ev.preventDefault(); ev.stopPropagation(); showMenu(ev.clientX, ev.clientY, runMenu(r)); } } },
    el('span', { class: 'fl-dot' }), el('span', { class: 'fl-rn', text: `${r.flowName}${r.parent ? ` · ${r.parent.kind}` : ''}` }), el('span', { class: 'fl-rs', text: `${Flows.STATUS_LABEL[r.status]} · ${timeAgoShort(r.updated)}` }));
  const timeAgoShort = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'now' : s < 3600 ? `${Math.round(s / 60)} min` : s < 86400 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} d`; };

  // every flow and run (left): what waits first, then the journeys, every command as a flow, yours, recent runs
  function renderList() {
    if (!D) return;
    const q = D.query.toLowerCase();
    const hit = (f) => !q || `${f.name} ${f.desc || ''} ${(f.commands || []).join(' ')}`.toLowerCase().includes(q);
    const item = (f) => el('button', { type: 'button', class: `fl-item${D.flowId === f.id && D.mode !== 'run' ? ' on' : ''}`, title: f.desc || '',
      on: { click: () => show({ mode: 'flow', flowId: f.id }), dblclick: () => act(async () => show({ mode: 'run', runId: (await startIn(f.id)).id })), contextmenu: (ev) => { ev.preventDefault(); ev.stopPropagation(); showMenu(ev.clientX, ev.clientY, flowMenu(f)); } } },
      el('span', { class: 'fl-ic', text: f.icon || '⇢' }), el('span', { text: f.name }), f.commands ? el('span', { class: 'fl-n', text: String(f.commands.length) }) : null);
    let search = D.list.querySelector('.fl-search');
    if (!search) {
      search = el('input', { class: 'fl-search', type: 'search', placeholder: 'Find a flow or a command…', spellcheck: false });
      search.addEventListener('input', () => { D.query = search.value; renderList(); });
      search.addEventListener('keydown', (k) => k.stopPropagation());
    }
    const now = Flows.runs().filter((r) => r.status !== 'done' && r.status !== 'stopped').slice(0, 8);
    const recent = Flows.runs().filter((r) => r.status === 'done' || r.status === 'stopped').slice(0, 6);
    const sec = (label, nodes) => (nodes.length ? [el('div', { class: 'fl-sub', text: label }), ...nodes] : []);
    const body = el('div', { class: 'fl-list-body' },
      ...sec('Going now', now.map(runRow)),
      ...sec('Journeys', journeys().filter(hit).map(item)),
      ...sec('Yours', yours().filter(hit).map(item)),
      ...sec('Every command, as flows', generated().filter(hit).map(item)),
      ...sec('Recent runs', q ? [] : recent.map(runRow)));
    D.list.replaceChildren(search, body);
  }
  function flowMenu(f) {
    return [
      { label: '▶ Start', action: () => act(async () => show({ mode: 'run', runId: (await startIn(f.id)).id })) },
      { label: '✎ Edit a copy', action: () => editCopy(f) },
      f.source === 'mine' ? { label: '✎ Edit', action: () => show({ mode: 'edit', flowId: f.id }) } : null,
      { label: 'Copy as JSON', action: () => { navigator.clipboard.writeText(JSON.stringify(cleanFlow(f), null, 2)); toast('Copied', { timeout: 1200 }); } },
      f.commands ? { label: `Its ${f.commands.length} commands ›`, items: f.commands.slice(0, 60).map((c) => ({ label: `/${c}`, action: () => Commands.exec(`/${c}`, hereAgent()) })) } : null,
      f.source === 'mine' ? { label: 'Delete', danger: true, action: async () => { if (await Modal.confirm('Delete this flow?', f.name, { ok: 'Delete', danger: true })) { await deleteMine(f.id); renderList(); } } } : null,
    ];
  }
  const cleanFlow = (f) => { const c = JSON.parse(JSON.stringify(f)); delete c.source; delete c.generated; return c; };
  function editCopy(f) {
    const c = cleanFlow(f);
    c.id = freeId(`${f.id}-mine`); c.name = `${f.name} (mine)`; delete c.commands;
    show({ mode: 'edit', flowId: c.id, draft: c });
  }
  function moreMenu() {
    const run = currentRun();
    const flow = run ? run.flow : D.draft || Flows.get(D.flowId);
    return [
      run && run.status === 'done' ? { label: '↻ Run again (same answers)', action: () => primaryAct() } : null,
      run && run.status === 'done' ? { label: '✎ Refine the result…', action: () => refineAsk(run) } : null,
      run && ['hung', 'stopped'].includes(run.status) ? { label: '↻ Pick up here', action: () => act(() => Flows.resume(run.id)) } : null,
      run ? { label: 'Change an answer ›', items: runMenu(run).find((x) => x?.label === 'Change an answer ›')?.items || [] } : null,
      run && !['done', 'stopped'].includes(run.status) ? { label: '■ Stop this run', action: () => Flows.stop(run.id) } : null,
      D.mode !== 'edit' && flow ? { label: '✎ Edit this flow (a copy)', action: () => editCopy(Flows.get(run?.flowId) || flow) } : null,
      D.mode === 'edit' ? { label: 'Check this flow', action: () => renderSide(true) } : null,
      { label: 'Copy as JSON', action: () => { navigator.clipboard.writeText(JSON.stringify(cleanFlow(D.draft || flow), null, 2)); toast('Copied', { timeout: 1200 }); } },
      { label: 'Paste a flow (JSON)…', action: async () => { const t = await Modal.prompt('Paste a flow', { multiline: true, label: 'JSON of a flow (what /flow-make or Copy as JSON gives)' }); if (!t) return; const v = Flows.fromText(t); if (!v.ok) toast(v.errors.join(' · '), { type: 'error' }); else show({ mode: 'edit', flowId: v.flow.id, draft: { ...v.flow, id: freeId(v.flow.id) } }); } },
      { label: 'Ask Claude to make a flow…', action: async () => { const t = await Modal.prompt('Make a flow for…', { placeholder: 'shuffle until I like it, then save and record 8 bars' }); if (t) makeFlow(t, hereAgent()).catch((err) => toast(err.message, { type: 'error' })); } },
      { label: 'Run in the chat card too', action: () => { if (run) { cardKeys.delete(run.id); card(run); } }, more: true },
      { label: 'Forget finished runs', action: async () => { for (const r of Flows.runs()) if (r.status === 'done' || r.status === 'stopped') Flows.stop(r.id); toast('Done', { timeout: 1000 }); }, more: true },
    ];
  }

  // ---------- authoring ----------
  let editTimer = 0;
  function onEdit(graph, info) {
    if (!D?.draft) return;
    const before = D.draft.nodes.length;
    D.draft = graphToFlow(graph, D.draft);
    D.pill.textContent = 'not saved';
    if (D.mode === 'edit') renderSide();
    // a new step from the picker becomes a real step (its own outputs): redraw once
    if (info?.kind === 'add' || graph.nodes.some((n) => n.type.startsWith('k:')) || D.draft.nodes.length !== before) { clearTimeout(editTimer); editTimer = setTimeout(refreshDraft, 0); }
  }
  function refreshDraft() {
    if (!D?.view || !D.draft) return;
    D.view.setGraph(flowToGraph(D.draft, D.reg), { keepView: true, history: false });
    requestAnimationFrame(() => paint());
    renderSide();
  }
  function renderInspector(checkNow) {
    const f = D.draft;
    const v = Flows.validate(f);
    const n = f.nodes.find((x) => x.id === D.sel);
    const field = (label, value, onSet, { area = false, list = null, ph = '' } = {}) => {
      const inp = el(area ? 'textarea' : 'input', { value: value ?? '', rows: area ? 4 : undefined, placeholder: ph, spellcheck: area });
      if (list) inp.setAttribute('list', list);
      inp.addEventListener('keydown', (k) => k.stopPropagation());
      inp.addEventListener('change', () => { onSet(inp.value); refreshDraft(); });
      return el('label', { class: 'fl-field' }, el('span', { text: label }), inp);
    };
    const parts = [
      field('Name', f.name, (x) => { f.name = x; renderHead(); }),
      field('What it does', f.desc, (x) => { f.desc = x; }),
    ];
    if (n) {
      parts.push(el('div', { class: 'fl-sub', text: `${KIND[n.kind]?.icon || ''} ${KIND[n.kind]?.label || n.kind} · ${n.id}${f.start === n.id ? ' · start' : ''}` }));
      parts.push(field('Title', n.title, (x) => { n.title = x; }));
      if (n.kind === 'action' || (n.kind === 'check')) parts.push(field(n.kind === 'check' ? 'Poll this command (or leave empty and ask)' : 'Command ({answers} fill in)', n.cmd, (x) => { n.cmd = x || undefined; }, { list: 'fl-cmds', ph: '/shuffle colors' }));
      if (n.kind === 'check') parts.push(field('Or ask you', n.ask, (x) => { n.ask = x || undefined; }), field('Done when the output has (regex)', n.match, (x) => { n.match = x || undefined; }));
      if (n.kind === 'ai') parts.push(field('Prompt ({answers} fill in)', n.prompt, (x) => { n.prompt = x; }, { area: true }), field('Engine (claude / astra)', n.engine || 'claude', (x) => { n.engine = /astra/i.test(x) ? 'astra' : 'claude'; }));
      if (n.kind === 'choice') parts.push(field('Options, one per line (Label = value)', (n.options || []).map((o) => (o.label === o.value ? o.label : `${o.label} = ${o.value}`)).join('\n'), (x) => {
        const old = n.options || [];
        n.options = x.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => { const [a, b] = l.split(/\s*=\s*/); const o = { label: a, value: b ?? a.toLowerCase() }; if (old[i]?.next) o.next = old[i].next; if (old[i]?.set) o.set = old[i].set; return o; });
      }, { area: true }));
      if (n.kind === 'text') parts.push(field('Placeholder', n.placeholder, (x) => { n.placeholder = x || undefined; }));
      if (n.kind === 'result') parts.push(field('Shows ({last} = the latest output)', n.text, (x) => { n.text = x; }, { area: true }));
      if (['choice', 'text', 'action', 'ai'].includes(n.kind)) parts.push(field('Keeps the answer as {…}', n.var || n.id, (x) => { n.var = Flows.slug(x).replace(/-/g, '_') || undefined; }));
      parts.push(el('div', { class: 'fl-row' }, el('button', { type: 'button', class: 'ghost small', text: 'Start here', on: { click: () => { f.start = n.id; refreshDraft(); } } }), el('button', { type: 'button', class: 'ghost small danger', text: 'Remove', on: { click: () => { D.view.removeNodes([n.id]); } } })));
    } else parts.push(el('p', { class: 'fl-small', text: 'Select a step to change its text. Tab or double-click the background adds a step; drag from a dot to another step to wire them.' }));
    if (checkNow || !v.ok || v.warnings.length) parts.push(el('div', { class: 'fl-sub', text: v.ok ? 'Check: OK' : 'Check' }), ...v.errors.map((x) => el('div', { class: 'fl-err', text: x })), ...v.warnings.map((x) => el('div', { class: 'fl-warn', text: x })));
    let dl = document.getElementById('fl-cmds');
    if (!dl) { dl = el('datalist', { id: 'fl-cmds' }, Commands.list().map((d) => el('option', { value: `/${d.name}${d.args ? ' ' : ''}`, label: d.desc }))); document.body.append(dl); }
    D.side.replaceChildren(...parts);
  }
  async function saveDraft() {
    try {
      const f = { ...D.draft };
      const existing = Flows.get(f.id);
      if (existing && existing.source !== 'mine') f.id = freeId(`${f.id}-mine`);
      const saved = await saveMine(f);
      toast(`Saved “${saved.name}” · /flow ${saved.id}`, { timeout: 2500 });
      show({ mode: 'flow', flowId: saved.id });
    } catch (err) { renderSide(true); toast(`Not saved: ${err.message}`, { type: 'error', timeout: 6000 }); }
  }
  // "make a flow for X": Claude writes the JSON from the commands that fit (a lean one-off question)
  async function makeFlow(what, agentId) {
    ensure();
    const words = String(what).toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const picked = new Map();
    for (const s of Commands.suggest?.(what, { limit: 12 }) || []) picked.set(s.def.name, s.def);
    for (const d of Commands.list()) { if (picked.size >= 40) break; if (!d.hidden && words.some((w) => d.name.includes(w) || String(d.desc).toLowerCase().includes(w))) picked.set(d.name, d); }
    for (const n of ['help', 'freeze', 'shuffle', 'save-look']) if (picked.size < 8 && Commands.get(n)) picked.set(n, Commands.get(n));
    const lines = [...picked.values()].slice(0, 40).map((d) => `/${d.name}${d.args ? ` ${d.args}` : ''} — ${short(d.desc, 70)}`).join('\n');
    const prompt = `Flow · make\nWrite a Hearth flow for: ${what}\nA flow is JSON {"id","name","desc","nodes":[…]} of steps run in order: {"id","kind","title","next"} with kind one of: action {"cmd":"/name args"}, choice {"options":[{"label","value","next"}],"var"}, text {"var","placeholder"}, ai {"engine":"claude|astra","prompt"}, check {"ask":"Is it done?"}, result {"text":"{last}"}. {var} in cmd / prompt / text fills in an answer; {last} is the latest output. 3–9 steps, end with a result.\nUse only these commands:\n${lines}\nReply with only the JSON in a \`\`\`json block.`;
    const a = H.agent(agentId)?.engine === 'claude' ? H.agent(agentId) : nativeAgent();
    const t = toast('Claude is writing the flow…', { timeout: 60000 });
    const r = await window.hub.askOnce({ agentId: a.id, text: prompt, options: { lean: true } });
    t?.remove?.();
    if (!r?.ok) throw new Error(r?.error || 'No answer');
    const v = Flows.fromText(r.text);
    if (!v.ok) throw new Error(`The flow it wrote doesn't work: ${v.errors.slice(0, 3).join(' · ')}`);
    const draft = { ...v.flow, id: freeId(v.flow.id), icon: v.flow.icon || '✦' };
    open({ draft });
    return draft;
  }

  // ---------- commands ----------
  function registerCommands() {
    const A = 'Flows';
    const R = (def) => { if (Commands.get(def.name) && !def.override) { console.warn(`Flows: /${def.name} exists`); return; } Commands.register({ area: A, ...def }); };
    const flowOpts = (a) => { ensure(); const s = String(a || '').toLowerCase(); return [...journeys(), ...yours(), ...generated()].filter((f) => !s || f.id.includes(s) || f.name.toLowerCase().includes(s)).slice(0, 20).map((f) => ({ value: f.id, label: `${f.icon || ''} ${f.name}`, hint: short(f.desc, 50) })); };
    const runOf = (ctx, id) => (id ? Flows.run(id) : null) || (ctx.chatId && chatRun(ctx.chatId)) || Flows.active()[0] || null;
    R({ name: 'flows', aliases: ['journeys'], args: '[flow | runs | nodes [flow]]', desc: 'Flows: step lists you walk through (Doctor, Make a video, Record, Lab scene…) on the Commands page, the runs going on; nodes: the node view (advanced, edit your own)',
      examples: ['/flows', '/flows doctor', '/flows runs', '/flows nodes'], keywords: 'steps wizard guided nodes journey process',
      complete: flowOpts,
      run: (args) => {
        let a = String(args || '').trim();
        const nodes = /^nodes\b/i.test(a); if (nodes) a = a.replace(/^nodes\s*/i, '');
        const page = typeof CmdPage !== 'undefined' && !nodes;
        if (/^runs?$/i.test(a)) { const id = Flows.runs()[0]?.id; if (page && id) CmdPage.openRun(id); else open({ runId: id }); return; }
        const id = a ? (Flows.get(a) || flowOpts(a)[0] && Flows.get(flowOpts(a)[0].value) || {}).id || 'doctor' : null;
        if (page) CmdPage.open(id || 'flows'); else open(id ? { flowId: id } : {});
      } });
    R({ name: 'flow', args: '<flow> [first answers…]', desc: 'Start a flow in this chat (its live card here, the steps as nodes): /flow doctor, /flow make-video', examples: ['/flow doctor', '/flow make-video', '/flow lab-scene'],
      keywords: 'start run journey steps', complete: flowOpts,
      run: async (args, ctx) => {
        const [id, ...rest] = String(args || '').trim().split(/\s+/);
        if (!id) { open({}); return; }
        const run = await startIn(id, { agentId: ctx.agentId, chatId: ctx.chatId, open: ctx.source !== 'code' && ctx.source !== 'flow' });
        for (const a of rest.join(' ').split(/\s*;\s*/).filter(Boolean)) { if (!Flows.waiting(run)) break; await Flows.answer(run.id, a); }
        return null;
      } });
    R({ name: 'flow-status', args: '[all]', desc: 'Where the flows of this chat are (one line each; chats and directors can run it)', examples: ['/flow-status', '/flow-status all'],
      run: (args, ctx) => {
        const list = /all/.test(args) ? Flows.runs().slice(0, 10) : (ctx.chatId ? Flows.ofChat(ctx.chatId) : []).slice(0, 5);
        const show = list.length ? list : Flows.active().slice(0, 5);
        return show.length ? show.map((r) => `- ${Flows.line(r)}`).join('\n') : 'No flow is going. /flows lists them.';
      } });
    R({ name: 'flow-step', args: '<answer> | resume | again | refine <what> | stop | back <n> [answer]', desc: 'Move this chat\'s flow on: answer the step waiting (an option or words), pick it up where it hung, run it again, refine the result',
      examples: ['/flow-step yes', '/flow-step resume', '/flow-step refine warmer colors', '/flow-step back 2 no'],
      complete: (a, ctx) => { const r = runOf(ctx || {}); const w = r && Flows.waiting(r); return [...(w ? w.options.map((o) => ({ value: o.value, hint: o.label })) : []), { value: 'resume' }, { value: 'again' }, { value: 'refine ' }, { value: 'stop' }]; },
      run: async (args, ctx) => {
        const r = runOf(ctx);
        if (!r) return 'No flow is going in this chat. /flow <name> starts one.';
        const a = String(args || '').trim();
        if (/^resume$/i.test(a)) await Flows.resume(r.id);
        else if (/^again$/i.test(a)) return Flows.line(await Flows.rerun(r.id));
        else if (/^refine\b/i.test(a)) await Flows.refine(r.id, a.replace(/^refine\s*/i, ''));
        else if (/^stop$/i.test(a)) Flows.stop(r.id);
        else if (/^back\s+\d+/i.test(a)) { const m = a.match(/^back\s+(\d+)\s*(.*)$/i); return Flows.line(await Flows.branch(r.id, Number(m[1]) - 1, m[2] || undefined)); }
        else if (a) await Flows.answer(r.id, a);
        return Flows.line(r);
      } });
    R({ name: 'flow-edit', args: '[flow]', desc: 'Edit a flow as nodes (a copy of a built-in one; yours in place) and save it as yours', complete: flowOpts,
      run: (args) => { ensure(); const f = Flows.get(String(args || '').trim()) || Flows.get(D?.flowId) || Flows.get('doctor'); if (f.source === 'mine') open({ flowId: f.id, edit: true }); else { open({ flowId: f.id }); editCopy(f); } } });
    R({ name: 'flow-make', args: '<what it should do>', desc: 'Ask Claude to write a flow from the commands that fit (one short question), then edit and save it', examples: ['/flow-make shuffle until I like it, then save the look and record 8 bars'],
      keywords: 'create author generate wizard', run: async (args, ctx) => { if (!String(args || '').trim()) return 'Say what it should do: /flow-make shuffle, keep, record'; const d = await makeFlow(args, ctx.agentId); return `Claude wrote “${d.name}” (${d.nodes.length} steps): check it in the editor, then Save as mine.`; } });
    R({ name: 'flow-where', aliases: ['where-is'], args: '<command>', desc: 'Where a command went: in the "/" menu, or which flow holds it (it still runs typed by name)', examples: ['/flow-where board-align'],
      complete: (a) => Commands.list().filter((d) => d.name.startsWith(String(a || '').replace(/^\//, ''))).slice(0, 12).map((d) => ({ value: d.name })),
      run: (args) => {
        const w = whereIs(args);
        if (!w) return `No command “${args}”.`;
        return `\`/${w.def.name}\` ${w.principal ? 'is in the "/" menu' : 'is tucked out of the "/" menu (it still runs typed by name)'}${w.flow ? ` · flow **${w.flow.name}** (\`/flow ${w.flow.id}\`)` : ''}${w.journeys.length ? ` · also in ${w.journeys.map((f) => `**${f.name}**`).join(', ')}` : ''}.`;
      } });
    R({ name: 'principal', args: '[list | add <command> | remove <command> | reset]', desc: 'The commands the "/" menu shows (the rest live in flows and still run by name)', examples: ['/principal', '/principal add board-align', '/principal remove still'],
      complete: (a) => (/^(add|remove)\s/.test(a) ? Commands.list().filter((d) => d.name.startsWith(a.split(/\s+/)[1] || '')).slice(0, 12).map((d) => ({ value: `${a.split(/\s+/)[0]} ${d.name}` })) : ['list', 'add ', 'remove ', 'reset'].map((v) => ({ value: v }))),
      run: (args) => {
        const [verb, name] = String(args || 'list').trim().split(/\s+/);
        if (/^reset$/i.test(verb)) { store.set(ADD_KEY, []); store.set(DEL_KEY, []); pCache = null; return 'The "/" menu shows the principal commands again.'; }
        if (/^(add|remove)$/i.test(verb)) { setPrincipal(String(name || '').replace(/^\//, ''), /^add$/i.test(verb)); return `\`/${Commands.get(name.replace(/^\//, '')).name}\` ${/^add$/i.test(verb) ? 'is in' : 'left'} the "/" menu.`; }
        const p = [...principal()].map((n) => Commands.get(n)).filter(Boolean);
        return `**${p.length} principal commands** (the "/" menu): ${p.map((d) => `\`/${d.name}\``).join(' ')}\n${Commands.list().length - p.length} more live in flows (\`/flows\`) and still run typed by name.`;
      } });
  }

  function registerKeys() {
    Keys.add([
      { area: 'Flows', keys: '/flows nodes', what: 'The node view of the flows (advanced): edit your own, the runs as nodes', run: () => open({}) },
      { area: 'Flows', keys: 'Enter', what: 'Validate the step that waits (the option you picked, or your words)' },
      { area: 'Flows', keys: '1…9', what: 'Pick option 1…9 of the step that waits' },
      { area: 'Flows', keys: 'Double-click an option', what: 'Pick it and validate' },
      { area: 'Flows', keys: 'L', what: 'Show / hide the list of flows and runs', run: () => D?.listBtn.click() },
      { area: 'Flows', keys: 'Right-click a step', what: 'Copy what it made, change its answer (a branch), go back there' },
      { area: 'Flows', keys: 'Right-click a flow card in a chat', what: 'Answer, pick up here, run again, refine, change an answer, stop' },
    ]);
    addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && (e.key === 'F' || e.key === 'f') && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName) && !e.target.isContentEditable) { e.preventDefault(); if (D?.dlg.open) D.dlg.close(); else if (typeof CmdPage !== 'undefined') CmdPage.toggle(); else open({}); }
    }, true);
  }
  function registerPalette() {
    AppUI.addAction?.('Flows: the node view (advanced)', () => open({}));
  }

  window.addEventListener('DOMContentLoaded', () => {
    registerCommands();
    registerKeys();
    try { registerPalette(); } catch { /* the palette lists commands anyway */ }
    setup().catch((err) => console.warn('Flows:', err));
  });

  return { open, startIn, whereIs, principal, isTucked, setPrincipal, ensure, makeFlow, journeys, generated, yours, saveMine, flowToGraph, get view() { return D; } };
})();
