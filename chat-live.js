// What a running reply is doing, always truthful (round 21, liveness). Long tasks used to look frozen: one "Working ·
// 312 s" line and nothing else. Now, under a running reply:
//   · the status line names the phase (thinking · writing · running <tool> on <what> · agents working), the time, the
//     steps, and "last news N s ago" once the engine has been quiet a few seconds;
//   · agents it deployed (Claude's Task / Agent subagents, Codex's spawned agents) show as a small tree: what each one
//     does, running / done / failed, its current tool, its time, its result when it ends; their steps sit under them,
//     not in the reply;
//   · a folded "Activity" panel lists the steps live (tool calls with their short args and results, thinking notes);
//   · a quiet engine is explained (engines.js pulses: the process is alive / busy / gone, which tool it is in) and,
//     after 2 min without news, offers Wait · Stop · Stop & retry from here (no Nudge: the CLIs read nothing once a
//     run started). A dead engine ends the reply with an error and the partial work kept (engines.js).
// A finished reply keeps "🤖 Deployed 3 agents · 2 done · 1 failed" (click for their results). Nothing is sent to the
// engines: all of it is read from what they already print. Commands: /activity, /subagents, /unstick.
const ChatLive = (() => {
  const S = new Map(); // chat id -> live state of its running reply
  let STALL_MS = 120000; // no news for this long: say so, with actions
  let QUIET_MS = 5000; // "last news N s ago" from here
  const MAX_STEPS = 300; // kept in memory per reply (the panel shows the last 60)
  const SHOWN = 60;
  const now = () => Date.now();
  const short = (s, n = 60) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const label = (name) => (typeof Native !== 'undefined' && Native.toolLabel ? Native.toolLabel(String(name || '')) : String(name || ''));
  // the tool itself, short: "three screenshot" (an MCP tool without its server), "Read", "Shell"
  const toolShort = (name) => { const n = String(name || ''); const m = n.match(/^mcp__(?:claude_ai_)?.+?__(.+)$/); return m ? m[1].replace(/[_-]/g, ' ') : n.split(' · ')[0]; };
  const secs = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 90 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`; };

  function state(chatId) {
    let s = S.get(chatId);
    if (!s) { s = { started: now(), lastAt: now(), phase: 'start', steps: [], byId: new Map(), agents: new Map(), pulse: null, snooze: 0, ver: 0, think: null, note: '' }; S.set(chatId, s); }
    return s;
  }
  const touch = (s) => { s.lastAt = now(); s.pulse = null; s.ver += 1; };
  const push = (s, entry) => { entry.n = (s.count = (s.count || 0) + 1); s.steps.push(entry); if (s.steps.length > MAX_STEPS) s.steps.splice(0, s.steps.length - MAX_STEPS); };
  function agentOf(s, id) {
    let a = s.agents.get(id);
    if (!a) { a = { id, description: 'Agent', kind: '', status: 'running', at: now(), steps: [], tool: null, ver: 0 }; s.agents.set(id, a); }
    return a;
  }

  // ---------- events (engine:event: the reply; engine:live: steps, agents, pulses) ----------
  function onEvent(ev) {
    if (!ev?.chatId || !Native.isBusy(ev.chatId)) return;
    const s = state(ev.chatId);
    if (ev.type === 'delta') { touch(s); s.phase = 'writing'; s.think = null; return; }
    if (ev.type === 'thinking') {
      touch(s); s.phase = 'thinking';
      // each thinking block becomes one line of the activity: its first words
      if (!s.think || ev.text === '\n\n') { if (ev.text.trim()) { s.think = { kind: 'think', text: '' }; push(s, s.think); } else { s.think = null; return; } }
      if (s.think.text.length < 120) { s.think.text = short(s.think.text + ev.text, 120); s.think.v = (s.think.v || 0) + 1; }
      return;
    }
    if (ev.type === 'tool') {
      touch(s); s.think = null;
      const entry = { kind: 'tool', id: ev.id, name: ev.name, args: ev.args || '', parent: ev.parent || null, at: now(), status: 'running', v: 0 };
      if (ev.id) s.byId.set(ev.id, entry);
      if (entry.parent) { const a = agentOf(s, entry.parent); a.tool = entry; a.steps.push(entry); if (a.steps.length > 40) a.steps.shift(); a.ver += 1; } else { push(s, entry); s.phase = 'tool'; s.tool = entry; }
      return;
    }
    if (ev.type === 'progress') touch(s);
  }
  function onLive(ev) {
    if (!ev?.chatId || !Native.isBusy(ev.chatId)) return;
    const s = state(ev.chatId);
    if (ev.type === 'pulse') { s.pulse = { ...ev, at: now() }; s.ver += 1; return; }
    touch(s);
    if (ev.type === 'status') { s.note = short(ev.text, 60); return; }
    if (ev.type === 'step') {
      const e = s.byId.get(ev.id);
      if (!e) return;
      Object.assign(e, { status: ev.ok === false ? 'failed' : 'done', summary: short(ev.summary, 140), ms: now() - e.at, v: e.v + 1 });
      if (e.parent) { const a = s.agents.get(e.parent); if (a) { if (a.tool === e) a.tool = null; a.ver += 1; } }
      if (s.tool === e) s.tool = null;
      return;
    }
    if (ev.type === 'agent') {
      const fresh = !s.agents.has(ev.id);
      const a = agentOf(s, ev.id);
      if (ev.description) a.description = ev.description;
      if (ev.kind) a.kind = ev.kind;
      if (ev.summary) a.summary = ev.summary;
      if (a.status !== ev.status) { a.status = ev.status; if (ev.status !== 'running') { a.ms = now() - a.at; a.tool = null; } }
      a.ver += 1;
      if (fresh) push(s, { kind: 'agent', id: ev.id, agent: a });
    }
  }

  // ---------- the status line ----------
  const running = (s) => [...s.agents.values()].filter((a) => a.status === 'running');
  function phaseText(s) {
    const t = s.tool;
    const busy = running(s);
    if (t && t.status === 'running') return `Running ${toolShort(t.name)}${t.args ? ` on ${short(t.args, 40)}` : ''}${now() - t.at > 20000 ? ` · ${secs(now() - t.at)}` : ''}`;
    if (busy.length) return `${busy.length} agent${busy.length > 1 ? 's' : ''} working${busy.length === 1 && busy[0].tool ? ` (${toolShort(busy[0].tool.name)})` : ''}`;
    if (s.phase === 'thinking') return 'Thinking';
    if (s.phase === 'writing') return 'Writing';
    if (s.phase === 'tool') return 'Waiting for the next step';
    return 'Starting';
  }
  // the quiet engine, explained from its pulse: a long tool (expected), busy, idle, gone
  function quietText(s, quiet) {
    const p = s.pulse && now() - s.pulse.at < 30000 ? s.pulse : null;
    const tool = p?.tool || (s.tool?.status === 'running' ? s.tool.name : '');
    if (p && !p.alive) return 'the engine process is gone: ending the reply';
    const cpu = p?.cpu != null ? `CPU ${p.cpu}%` : '';
    if (tool) return `may still be working on ${label(tool).replace(/^agent · /, 'agent ')}${cpu ? ` · ${cpu}` : ''}`;
    if (p) return p.cpu != null && p.cpu < 2 ? `process alive but idle (${cpu})` : `process alive${cpu ? ` · ${cpu}` : ''}`;
    return '';
  }
  function statusOf(chatId, p) {
    const s = S.get(chatId) || state(chatId);
    const t = now();
    const quiet = t - s.lastAt;
    const words = p?.words || 0;
    const steps = s.count || 0;
    const busy = running(s).length;
    const parts = [`${phaseText(s)}`, secs(t - (p?.started || s.started))];
    if (words) parts.push(`${words.toLocaleString()} words`);
    if (steps) parts.push(`${steps} step${steps > 1 ? 's' : ''}`);
    if (s.agents.size && !(busy && !s.tool)) parts.push(`🤖 ${s.agents.size}${busy ? ` (${busy} running)` : ''}`);
    if (s.note && quiet < 30000) parts.push(s.note);
    let stall = null;
    if (quiet >= QUIET_MS) {
      const why = quietText(s, quiet);
      if (quiet >= STALL_MS && t >= s.snooze) stall = `No news for ${secs(quiet)}${why ? ` (${why})` : ''}`;
      else parts.push(`last news ${secs(quiet)} ago${why && quiet >= 15000 ? ` · ${why}` : ''}`);
    }
    if (!stall) parts.push('Esc stops');
    return { text: parts.join(' · '), stall };
  }
  // native.js paintStatus: writes the line (only what changed) and the stall actions when they apply
  function paintStatus(chatId, st, p) {
    const { text, stall } = statusOf(chatId, p);
    let line = st.firstChild;
    if (!line || line.nodeType !== 3) { st.textContent = ''; line = document.createTextNode(''); st.append(line); }
    const want = stall || text;
    if (line.data !== want) line.data = want;
    st.classList.toggle('stalled', Boolean(stall));
    let acts = st.querySelector('.live-acts');
    if (stall && !acts) {
      const agentId = H.agents().find((a) => Native.isBusy(chatId) && Native.pendingFor(a.id) === chatId)?.id;
      acts = el('span', { class: 'live-acts' },
        el('button', { type: 'button', text: 'Wait', title: 'Keep waiting (asks again in 2 min)', on: { click: () => wait(chatId) } }),
        el('button', { type: 'button', text: 'Stop', title: 'Stop this reply (what it wrote stays)', on: { click: () => agentId && Native.stop(agentId) } }),
        el('button', { type: 'button', text: 'Stop & retry from here', title: 'Stop, then ask it to continue from where it was', on: { click: () => agentId && unstick(agentId) } }));
      st.append(acts);
    } else if (!stall && acts) acts.remove();
  }
  function wait(chatId) { const s = S.get(chatId); if (s) { s.snooze = now() + STALL_MS; s.ver += 1; } }

  // ---------- the agents tree and the activity panel (in the live reply) ----------
  const ICON = { running: '◌', done: '✓', failed: '✕', stopped: '■' };
  function agentRow(a) {
    const d = el('details', { class: `live-agent ${a.status}` }, el('summary'), el('ol', { class: 'live-agent-steps' }));
    d.addEventListener('toggle', () => { a.ver += 1; a.shown = -1; });
    return d;
  }
  function paintAgent(d, a) {
    if (d.ver === a.ver) return;
    d.ver = a.ver;
    d.className = `live-agent ${a.status}`;
    const time = secs((a.status === 'running' ? now() : a.at + (a.ms || 0)) - a.at);
    const doing = a.status === 'running' ? (a.tool ? `${toolShort(a.tool.name)}${a.tool.args ? ` ${short(a.tool.args, 30)}` : ''}` : 'thinking') : short(a.summary || (a.status === 'failed' ? 'failed' : 'done'), 90);
    const sum = d.firstChild;
    const text = `${ICON[a.status] || '◌'} ${a.description}${a.kind && a.kind !== 'general-purpose' ? ` · ${a.kind}` : ''} — ${doing} · ${time}${a.steps.length ? ` · ${a.steps.length} step${a.steps.length > 1 ? 's' : ''}` : ''}`;
    if (sum.textContent !== text) { sum.textContent = text; sum.title = a.summary || ''; }
    if (!d.open) return;
    const ol = d.lastChild;
    ol.replaceChildren(...a.steps.slice(-12).map((e) => el('li', { class: e.status, text: `${label(e.name)}${e.args ? ` · ${short(e.args, 40)}` : ''}${e.summary ? ` → ${short(e.summary, 60)}` : ''}` })));
  }
  function stepRow(e) {
    if (e.kind === 'think') return el('li', { class: 'think', text: `💭 ${e.text}` });
    if (e.kind === 'agent') return el('li', { class: 'agent', text: `🤖 deployed: ${e.agent.description}` });
    return el('li', { class: `tool ${e.status}` });
  }
  function paintStep(li, e) {
    if (li.v === e.v) return;
    li.v = e.v;
    if (e.kind === 'think') { li.textContent = `💭 ${e.text}`; return; }
    if (e.kind !== 'tool') return;
    li.className = `tool ${e.status}`;
    const mark = e.status === 'running' ? '…' : e.status === 'failed' ? '✕' : '✓';
    li.textContent = `${mark} ${label(e.name)}${e.args ? ` · ${short(e.args, 50)}` : ''}${e.summary ? ` → ${short(e.summary, 80)}` : ''}${e.ms != null && e.ms >= 1000 ? ` · ${secs(e.ms)}` : ''}`;
  }
  // called from native.js paintStreaming (≤ 16× a second): writes only what changed; the list only while it is open
  function paint(chatId, msgEl, body) {
    const s = S.get(chatId);
    if (!s || !msgEl) return;
    if (s.agents.size) {
      let tree = msgEl.querySelector(':scope > .live-agents');
      if (!tree) { tree = el('div', { class: 'live-agents' }); body.before(tree); }
      for (const a of s.agents.values()) {
        if (!a.row) a.row = agentRow(a);
        if (a.row.parentNode !== tree) tree.append(a.row);
        paintAgent(a.row, a);
      }
    }
    if (!s.count) return;
    let panel = msgEl.querySelector(':scope > .live-activity');
    if (!panel) {
      panel = el('details', { class: 'live-activity' }, el('summary'), el('ol', { class: 'live-steps' }));
      panel.addEventListener('toggle', () => { s.shownVer = -1; if (panel.open) store.set('chat.activityOpen', true); else store.set('chat.activityOpen', false); Native.repaint?.(chatId); });
      panel.open = store.get('chat.activityOpen', false);
      body.before(panel);
    }
    const failed = s.steps.filter((e) => e.status === 'failed').length;
    const sum = `Activity · ${s.count} step${s.count > 1 ? 's' : ''}${failed ? ` · ${failed} failed` : ''}`;
    if (panel.firstChild.textContent !== sum) panel.firstChild.textContent = sum;
    if (!panel.open) return;
    const ol = panel.lastChild;
    const shown = s.steps.slice(-SHOWN);
    // rows are kept per entry: new ones appended, the oldest dropped past 60, changed ones rewritten
    while (ol.firstChild && !shown.includes(ol.firstChild.entry)) ol.firstChild.remove();
    for (const e of shown) {
      if (!e.li) { e.li = stepRow(e); e.li.entry = e; }
      if (e.li.parentNode !== ol) ol.append(e.li);
      paintStep(e.li, e);
    }
    const more = s.count - shown.length;
    ol.start = more + 1;
  }

  // ---------- after the reply: what to keep in the message ----------
  function finish(event, chat, extras) {
    const s = S.get(chat.id);
    S.delete(chat.id);
    if (!s || (!s.agents.size && !s.count)) return;
    const ended = event.type === 'done' ? null : event.type === 'stopped' ? 'stopped' : 'failed';
    const agents = [...s.agents.values()].map((a) => ({ description: a.description, ...(a.kind ? { kind: a.kind } : {}), status: a.status === 'running' ? ended || 'done' : a.status, ...(a.summary ? { summary: a.summary } : {}), ms: a.ms || now() - a.at, steps: a.steps.length }));
    const tools = s.steps.filter((e) => e.kind === 'tool');
    extras.activity = { steps: s.count, failed: tools.filter((e) => e.status === 'failed').length, ...(agents.length ? { agents: agents.slice(0, 20) } : {}) };
  }
  // a finished reply that deployed agents: one quiet fold (results inside)
  function agentFold(act) {
    const ag = act.agents || [];
    const n = (st) => ag.filter((a) => a.status === st).length;
    const d = el('details', { class: 'tool-chips agent-fold' },
      el('summary', { text: `🤖 Deployed ${ag.length} agent${ag.length > 1 ? 's' : ''}${n('done') ? ` · ${n('done')} done` : ''}${n('failed') ? ` · ${n('failed')} failed` : ''}${n('stopped') ? ` · ${n('stopped')} stopped` : ''}` }));
    d.addEventListener('toggle', () => {
      if (!d.open || d.querySelector('ol')) return;
      d.append(el('ol', { class: 'tool-list' }, ag.map((a) => el('li', { class: a.status, text: `${ICON[a.status] || '•'} ${a.description}${a.kind && a.kind !== 'general-purpose' ? ` · ${a.kind}` : ''} · ${secs(a.ms || 0)}${a.steps ? ` · ${a.steps} step${a.steps > 1 ? 's' : ''}` : ''}${a.summary ? ` — ${a.summary}` : ''}` }))));
    });
    return d;
  }
  function onMessage(node, m) {
    if (!m.activity?.agents?.length || node.querySelector(':scope > .agent-fold')) return;
    const fold = agentFold(m.activity);
    const tools = node.querySelector(':scope > .tool-fold');
    if (tools) tools.after(fold); else node.prepend(fold);
  }

  // ---------- actions ----------
  // Stop & retry from here: stop, keep what it wrote, then one short message to carry on (what seemed stuck named)
  async function unstick(agentId) {
    const chatId = Native.pendingFor(agentId) || H.activeChat[agentId];
    const s = S.get(chatId);
    const stuck = s?.tool?.status === 'running' ? label(s.tool.name) : running(s || { agents: new Map() })[0]?.description || '';
    if (Native.isBusy(chatId)) {
      Native.stop(agentId);
      const t = now();
      while (Native.isBusy(chatId) && now() - t < 15000) await new Promise((r) => setTimeout(r, 150));
    }
    if (H.activeChat[agentId] !== chatId) Native.open(agentId, chatId);
    await Native.send(agentId, `Continue from where you stopped${stuck ? ` (it seemed stuck on ${stuck}: try another way if it hangs again)` : ''}.`);
  }
  function describe(chatId) {
    const s = S.get(chatId);
    if (!s) return null;
    const { text, stall } = statusOf(chatId, null);
    const lines = [`**${stall || text.replace(/ · Esc stops$/, '')}**`];
    for (const a of s.agents.values()) lines.push(`- ${ICON[a.status]} ${a.description} — ${a.status === 'running' ? (a.tool ? label(a.tool.name) : 'thinking') : a.summary || a.status} · ${secs((a.status === 'running' ? now() : a.at + (a.ms || 0)) - a.at)}`);
    const recent = s.steps.filter((e) => e.kind === 'tool').slice(-8);
    if (recent.length) lines.push('', 'Last steps:', ...recent.map((e) => `- ${e.status === 'running' ? '…' : e.status === 'failed' ? '✕' : '✓'} ${label(e.name)}${e.args ? ` · ${short(e.args, 50)}` : ''}${e.summary ? ` → ${short(e.summary, 80)}` : ''}`));
    return lines.join('\n');
  }

  // ---------- commands + right-click ----------
  function registerCommands() {
    if (typeof Commands === 'undefined') return;
    const reg = (def) => { if (!Commands.get(def.name)) Commands.register(def); };
    reg({
      name: 'activity', area: 'Chat', desc: 'What the running reply is doing: phase, last news, agents, last steps (or what the last reply did)',
      keywords: 'status stuck frozen progress steps tools subagents liveness',
      run: async (_a, ctx) => {
        const chatId = Native.pendingFor(ctx.agentId);
        const live = chatId && describe(chatId);
        if (live) return live;
        const m = [...(Native.current(ctx.agentId)?.messages || [])].reverse().find((x) => x.role === 'assistant');
        if (!m) return 'Nothing running, and no reply yet.';
        const act = m.activity;
        return `Nothing running. The last reply${m.ms ? ` took ${secs(m.ms)}` : m.stopped ? ' was stopped' : ''}${m.tools?.length ? ` with ${m.tools.length} tool calls` : ''}${act?.failed ? ` (${act.failed} failed)` : ''}${act?.agents?.length ? `, and deployed ${act.agents.length} agent${act.agents.length > 1 ? 's' : ''}:\n${act.agents.map((a) => `- ${ICON[a.status] || '•'} ${a.description} — ${a.summary || a.status}`).join('\n')}` : '.'}`;
      },
    });
    reg({
      name: 'subagents', area: 'Chat', args: '[on|off]', desc: 'Let this chat deploy agents for parts of a big task (Claude\'s Task tool / Codex agents). Off by default: it adds a tool to every message',
      keywords: 'agents deploy parallel task spawn helpers',
      complete: () => [{ value: 'on', hint: 'this chat may deploy agents' }, { value: 'off', hint: 'back to one agent' }],
      run: async (args, ctx) => {
        const chat = Native.current(ctx.agentId);
        if (!chat) return 'Open a chat first.';
        const want = /^(on|yes|1)$/i.test(args.trim()) ? true : /^(off|no|0)$/i.test(args.trim()) ? false : null;
        if (want === null) return `Agents for this chat: **${chat.subagents ? 'on' : 'off'}**. /subagents on lets it deploy agents (a little more context per message); you see them live under the reply.`;
        chat.subagents = want || undefined;
        Native.save(chat);
        return want ? 'This chat may now deploy agents for parts of a task. They show live under its replies (/activity).' : 'Agents off for this chat.';
      },
    });
    reg({
      name: 'unstick', area: 'Chat', desc: 'Stop the running reply and ask it to continue from where it was (what it wrote stays)',
      keywords: 'stuck frozen hung retry continue resume',
      run: async (_a, ctx) => { if (!Native.pendingFor(ctx.agentId)) return 'Nothing is running in this chat.'; unstick(ctx.agentId).catch((err) => toast(err.message, { type: 'error' })); return null; },
    });
  }
  function registerMenus() {
    if (typeof Declutter === 'undefined' || !Declutter.ctx) return;
    const agentOf = (node) => H.agents().find((a) => Native.view(a.id)?.root.contains(node))?.id || null;
    Declutter.ctx('.msg.streaming .stream-status, .msg.streaming .live-activity, .msg.streaming .live-agents', 'Chat', (node) => {
      const agentId = agentOf(node);
      const chatId = agentId && Native.pendingFor(agentId);
      if (!chatId) return [];
      return [
        { label: 'What is it doing?', action: () => Commands.exec('/activity', agentId) },
        { label: 'Wait (2 min more)', action: () => wait(chatId) },
        { label: 'Stop', action: () => Native.stop(agentId) },
        { label: 'Stop & retry from here', action: () => unstick(agentId) },
      ];
    });
  }

  function boot() {
    if (typeof Native === 'undefined') return;
    window.hub.onEngineEvent?.(onEvent);
    window.hub.onEngineLive?.(onLive);
    Native.hooks.finish.push(finish);
    Native.hooks.message.push(onMessage);
    registerCommands();
    // the right-click menus' registry (declutter.js) loads later in the page
    if (typeof Declutter !== 'undefined') registerMenus(); else document.addEventListener('DOMContentLoaded', registerMenus, { once: true });
  }
  boot(); // native.js and commands.js load before this file

  return { paint, paintStatus, statusOf, describe, unstick, wait, state: (chatId) => S.get(chatId) || null, _S: S,
    _tune: (o = {}) => { if (o.stallMs) STALL_MS = o.stallMs; if (o.quietMs) QUIET_MS = o.quietMs; } }; // (dev checks: shorter waits)
})();
window.ChatLive = ChatLive;
