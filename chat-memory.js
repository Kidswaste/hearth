// Memory that costs only when it matters (round 24, context). Two new places for facts, both approved by you: a chat's
// pinned facts and a project's key facts (round 23 projects). They go along with a message only when it is about them
// (it shares words with the fact, or names the project), a few at a time, as one short line ("[Memory, approved by the
// user: …]"), with a running token count. Nothing is added while there are no facts, and nothing is ever added to the
// system prompt. The agent's own <remember> facts still work as before; their chip now offers "This chat only" and
// "This project only", which move a fact out of the always-sent memory into the scoped one. Opt-ins:
//   /memory approve on   a <remember> fact waits for your OK (keep it for this chat, the project, or everywhere)
//   /memory relevant on  this agent's saved memory leaves the system prompt and goes only with the messages it fits
// `/memory here` shows what this chat and its project keep (and what they cost), `/memory pin|project|forget|edit`.
const ChatMemory = (() => {
  const C = ContextCore;
  const KV = 'context-memory';
  let data = null; // { chats: { [chatId]: [{ t, at, always? }] }, projects: { [projectId]: [...] }, sent: { [chatId]: { n, tokens } } }
  let loading = null;
  const load = () => (data ? Promise.resolve(data) : (loading ||= window.hub.kvGet(KV, {}).then((d) => {
    data = { chats: {}, projects: {}, sent: {}, ...(d && typeof d === 'object' ? d : {}) };
    return data;
  }).catch(() => { data = { chats: {}, projects: {}, sent: {} }; return data; })));
  const saveSoon = saver(() => { if (data) window.hub.kvSet(KV, data); }, 500); // (round 78) a saver: StoreAck flushes it
  // (round 78, guardloss78) facts pinned / forgotten on the other computer (or brought back by 🛟 Recover): what waits here
  // is written first, then read again, then sync is told (a fact forgotten stays forgotten)
  window.StoreAck?.hold(KV, { saver: saveSoon, read: () => StoreAck.kv(KV, {}), apply: (d) => { if (data) data = { chats: {}, projects: {}, sent: {}, ...(d && typeof d === 'object' ? d : {}) }; } });
  const approveOn = () => store.get('memory.approve', false) === true;
  const bucket = (scope) => (scope === 'project' ? data.projects : data.chats);
  const factsOf = (scope, id) => (data && id ? (bucket(scope)[id] || []).map((f) => ({ ...f, scope })) : []);
  function add(scope, id, text, { always = false } = {}) {
    const t = String(text || '').replace(/\s+/g, ' ').trim().replace(/^[-*•]\s+/, '').slice(0, 240);
    if (!t || !id) return null;
    const list = (bucket(scope)[id] ||= []);
    if (list.some((f) => f.t.toLowerCase() === t.toLowerCase())) return { t, duplicate: true };
    const f = { t, at: Date.now(), ...(always ? { always: true } : {}) };
    list.push(f);
    if (list.length > 40) list.shift();
    saveSoon();
    return f;
  }
  function forget(scope, id, words) {
    const list = bucket(scope)[id] || [];
    const w = String(words || '').toLowerCase();
    const gone = list.filter((f) => f.t.toLowerCase().includes(w));
    bucket(scope)[id] = list.filter((f) => !gone.includes(f));
    if (!bucket(scope)[id].length) delete bucket(scope)[id];
    if (gone.length) saveSoon();
    return gone;
  }
  const projectOf = (chatId) => {
    try { return typeof Projects !== 'undefined' && Projects.isLoaded?.() ? Projects.projectOfChat(chatId) : null; } catch { return null; }
  };

  // ---------- the agent's own memory, when it goes only where relevant (/memory relevant on) ----------
  let memCache = null; let memAt = 0;
  // (round 31, tokensaver) relevant is the default once the memory grows past a few lines (ContextCore.memoryRelevant,
  // the same rule engines.js uses for the system prompt); standing preferences ("never…", "call me…") go every time.
  async function agentFacts(agent) {
    if (!agent) return [];
    if (!memCache || Date.now() - memAt > 10000) { memCache = await window.hub.getMemory().catch(() => ({ agents: {} })); memAt = Date.now(); }
    if (!C.memoryRelevant(agent, memCache)) return [];
    const lines = C.memoryNotes(memCache, agent).flatMap((m) => String(m || '').split('\n')).map((l) => l.trim().replace(/^[-*•]\s+/, '')).filter(Boolean);
    return lines.map((t) => ({ t, scope: 'agent', ...(C.standing(t) ? { always: true } : {}) }));
  }
  // what always-on memory costs this agent per message (the system prompt's memory part, engines.js)
  async function alwaysTokens(agent) {
    if (!agent) return 0;
    const m = await window.hub.getMemory().catch(() => null);
    if (C.memoryRelevant(agent, m)) return 0;
    const notes = C.memoryNotes(m, agent); // (round 38, memorytidy) its places count
    return notes.length ? C.tok(C.memoryBlock(notes)) : 0;
  }

  // ---------- with a message: only the facts it is about ----------
  async function compose(agentId, chat, raw, msg) {
    if (!msg || msg.role !== 'user' || String(msg.text || '').startsWith('/')) return undefined;
    await load();
    const p = projectOf(chat.id);
    // (round 31, tokensaver) a fact already sent in this chat is in its history: never twice (each copy would be
    // re-read by every later message); after 30 messages it may go again (a long chat's start can be compacted away)
    const sent = new Set((chat.messages || []).slice(-31).filter((m) => m !== msg).flatMap((m) => m.memSent || []).map((t) => t.toLowerCase()));
    const facts = [...factsOf('chat', chat.id), ...(p ? factsOf('project', p.id) : []), ...(await agentFacts(H.agent(agentId)))].filter((f) => !sent.has(f.t.toLowerCase()));
    if (!facts.length) return undefined;
    const pick = C.relevant(facts, msg.text, { project: p?.name || '' });
    if (!pick.length) return undefined;
    const line = C.memoryLine(pick);
    const tokens = C.tok(`\n\n${line}`);
    msg.memSent = pick.map((f) => f.t);
    msg.memTokens = tokens;
    const s = (data.sent[chat.id] ||= { n: 0, tokens: 0 });
    s.n += 1; s.tokens += tokens;
    saveSoon();
    return `${raw}\n\n${line}`;
  }

  // ---------- <remember>: scope it, or (opt-in) approve it first ----------
  function intercept(chat, facts, message) {
    if (!approveOn()) return false;
    if (message) message.memProposed = true;
    return true;
  }
  async function scopeFacts(agentId, chatId, facts, scope, { fromAgent = true } = {}) {
    await load();
    const id = scope === 'project' ? projectOf(chatId)?.id : chatId;
    if (!id) { toast('This chat isn\'t in a project', { timeout: 1800 }); return false; }
    if (fromAgent) await Native.forgetFacts(agentId, facts).catch(() => {});
    for (const f of facts) add(scope, id, f);
    return true;
  }
  function chipHook(node, m, index, agent) {
    if (m.role === 'user' && m.memSent?.length) {
      const total = data?.sent?.[H.activeChat?.[agent.id]]?.tokens;
      node.querySelector('.msg-foot')?.prepend(el('span', { class: 'mem-sent', text: '🧠', title: `Memory sent with this message (≈ ${m.memTokens} tokens, only because it was about them):\n${m.memSent.map((t) => `• ${t}`).join('\n')}${total ? `\nThis chat so far: ≈ ${total} tokens of memory` : ''}\n(/memory here)` }));
    }
    if (m.role !== 'assistant' || !m.remembered?.length) return;
    const chip = node.querySelector('.memory-chip');
    if (!chip) return;
    const chatId = H.activeChat?.[agent.id];
    const done = (text) => { chip.replaceChildren(text); };
    const btn = (label, title, fn) => el('button', { class: 'mem-scope', type: 'button', text: label, title, on: { click: async (e) => { e.stopPropagation(); await fn(); } } });
    const inProject = Boolean(projectOf(chatId));
    if (m.memProposed) {
      chip.replaceChildren(`Remember? ${m.remembered.join(' · ')} `,
        btn('This chat', 'Sent with this chat\'s messages that are about it', async () => { if (await scopeFacts(agent.id, chatId, m.remembered, 'chat', { fromAgent: false })) { m.memProposed = false; done(`Kept for this chat: ${m.remembered.join(' · ')}`); } }),
        inProject ? btn('This project', 'Sent with the project\'s chats when they are about it', async () => { if (await scopeFacts(agent.id, chatId, m.remembered, 'project', { fromAgent: false })) { m.memProposed = false; done(`Kept for the project: ${m.remembered.join(' · ')}`); } }) : null,
        btn('Everywhere', `${agent.name} keeps it in every chat`, async () => { await Native.rememberFacts(agent.id, m.remembered); m.memProposed = false; done(`Saved to memory: ${m.remembered.join(' · ')}`); }),
        btn('×', 'Don\'t remember it', async () => { m.memProposed = false; m.remembered = []; chip.remove(); }));
      return;
    }
    chip.append(btn('This chat only', 'Move it out of the memory sent with every message: only this chat\'s messages about it carry it', async () => { if (await scopeFacts(agent.id, chatId, m.remembered, 'chat')) done(`Kept for this chat only: ${m.remembered.join(' · ')}`); }),
      inProject ? btn('This project only', 'Only the project\'s chats carry it, when they are about it', async () => { if (await scopeFacts(agent.id, chatId, m.remembered, 'project')) done(`Kept for the project only: ${m.remembered.join(' · ')}`); }) : null);
  }

  // ---------- /memory here | pin | project | forget | edit | relevant | approve ----------
  const SUBS = ['here', 'pin', 'project', 'forget', 'edit', 'relevant', 'approve'];
  const handles = (args) => SUBS.includes(String(args || '').trim().split(/\s+/)[0].toLowerCase());
  async function run(args, ctx) {
    await load();
    const [w0, ...rest] = String(args || '').trim().split(/\s+/);
    const w = w0.toLowerCase();
    const arg = rest.join(' ').trim();
    const agent = H.agent(ctx.agentId);
    const chatId = ctx.chatId || H.activeChat?.[ctx.agentId];
    const p = chatId ? projectOf(chatId) : null;
    if (w === 'relevant') {
      if (!agent) return 'Run this in a chat.';
      const before = await alwaysTokens({ ...agent, memoryWhenRelevant: false });
      // (round 31) on / off force it; auto (the default) = in the prompt while small, relevant once it grows
      if (arg === 'off') agent.memoryWhenRelevant = false; else if (arg === 'auto') delete agent.memoryWhenRelevant; else if (arg === 'on' || !arg) agent.memoryWhenRelevant = true;
      await saveConfig();
      const m = await window.hub.getMemory().catch(() => null);
      return C.memoryRelevant(agent, m)
        ? `${agent.name}'s memory now goes only with the messages it is about (it was ≈ ${before} tokens on every message)${agent.memoryWhenRelevant === true ? '' : ', the default for a memory this size'}. \`/memory relevant off\` puts it back in the system prompt.`
        : `${agent.name}'s memory is in its system prompt (≈ ${before} tokens on every message)${agent.memoryWhenRelevant === false ? '' : ', the default while it is small'}.${agent.memoryWhenRelevant === false ? ' \`/memory relevant auto\` lets Hearth choose.' : ''}`;
    }
    if (w === 'approve') {
      store.set('memory.approve', arg !== 'off');
      return approveOn() ? 'Facts an agent wants to remember now wait for your OK: keep them for this chat, the project, or everywhere.' : 'Agents save what they remember right away again (Undo and "This chat only" on the chip).';
    }
    if (!chatId) return 'Open a chat first.';
    if (w === 'pin') { const f = add('chat', chatId, arg.replace(/\s--always\b/, ''), { always: /\s--always\b/.test(arg) }); return !f ? 'Usage: /memory pin <fact> (add --always to send it with every message of this chat)' : f.duplicate ? `Already pinned: ${f.t}` : `📌 Pinned for this chat: ${f.t} (≈ ${C.tok(f.t)} tokens, sent only with messages about it${f.always ? '; always, as asked' : ''}).`; }
    if (w === 'project') {
      if (!p) return 'This chat isn\'t in a project (`/project new <name>` or right-click the chat › Project).';
      if (!arg) return `**${p.name}** key facts:\n${factsOf('project', p.id).map((f) => `- ${f.t}`).join('\n') || '(none yet: /memory project <fact>)'}`;
      const f = add('project', p.id, arg);
      return f.duplicate ? `Already a key fact: ${f.t}` : `Key fact for **${p.name}**: ${f.t} (its chats carry it when they are about it).`;
    }
    if (w === 'forget') {
      if (!arg) return 'Usage: /memory forget <words>';
      const gone = [...forget('chat', chatId, arg), ...(p ? forget('project', p.id, arg) : [])];
      return gone.length ? `Forgot ${gone.length}: ${gone.map((f) => f.t).join(' · ')}` : `Nothing here contains “${arg}” (/forget <words> for the agent's own memory).`;
    }
    if (w === 'edit') {
      const fields = [{ name: 'chat', label: 'This chat (one fact per line; "!" first = always)', type: 'textarea', rows: 6, value: factsOf('chat', chatId).map((f) => `${f.always ? '!' : ''}${f.t}`).join('\n') }];
      if (p) fields.push({ name: 'project', label: `Project “${p.name}” (one fact per line)`, type: 'textarea', rows: 6, value: factsOf('project', p.id).map((f) => f.t).join('\n') });
      const v = await Modal.form('Memory for this chat', fields, { ok: 'Save' });
      if (!v) return undefined;
      const parse = (text) => String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 40).map((l) => ({ t: l.replace(/^!\s*/, '').slice(0, 240), at: Date.now(), ...(l.startsWith('!') ? { always: true } : {}) }));
      data.chats[chatId] = parse(v.chat); if (!data.chats[chatId].length) delete data.chats[chatId];
      if (p) { data.projects[p.id] = parse(v.project); if (!data.projects[p.id].length) delete data.projects[p.id]; }
      saveSoon();
      return 'Saved.';
    }
    // here: what this chat and its project keep, what they cost, and the agent's always-on memory
    const mine = factsOf('chat', chatId); const proj = p ? factsOf('project', p.id) : [];
    const always = await alwaysTokens(agent);
    const rel = agent ? C.memoryRelevant(agent, await window.hub.getMemory().catch(() => null)) : false;
    const s = data.sent[chatId];
    const line = (f) => `- ${f.always ? '📌 ' : ''}${f.t} · ${C.tok(f.t)} tok`;
    return [`**Memory for this chat** (sent only with the messages it is about)`,
      mine.length ? mine.map(line).join('\n') : '- none pinned (`/memory pin <fact>`)',
      p ? `\n**Project “${p.name}”**\n${proj.length ? proj.map(line).join('\n') : '- no key facts yet (`/memory project <fact>`)'}` : null,
      `\nSent so far here: ${s ? `${s.n} message${s.n === 1 ? '' : 's'} carried memory, ≈ ${s.tokens} tokens in all` : 'nothing'}.`,
      agent ? (rel ? `${agent.name}'s saved memory goes only where relevant too.` : `${agent.name}'s saved memory: ≈ ${always} tokens on every message${always > 150 ? ' (`/memory relevant on` sends only the facts a message is about)' : ''}.`) : null,
      `\n\`/memory pin|project|forget|edit\` · \`/memory approve on\`: OK a fact before an agent keeps it.`].filter((x) => x != null).join('\n');
  }

  // /memory shares its name (commands.js `when`): these words run here, anything else opens the memory as before
  function register() {
    if (typeof Commands === 'undefined') return;
    Commands.register({ name: 'memory', area: 'Memory', args: '[here | pin | project | forget | edit | relevant on|off | approve on|off]', when: (ctx, args) => handles(args), whenLabel: 'here, pin, project…',
      desc: 'This chat\'s and its project\'s facts, sent only with the messages they are about', examples: ['/memory here', '/memory pin I want 9:16', '/memory relevant on'],
      complete: (a) => (/\s/.test(a) ? [] : ['here', 'pin', 'project', 'forget', 'edit', 'relevant on', 'relevant off', 'relevant auto', 'approve on', 'approve off'].filter((x) => x.startsWith(a)).map((value) => ({ value }))),
      run });
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', register); else register();

  // ---------- hooks ----------
  Native.hooks.compose.push(compose);
  Native.hooks.message.push(chipHook);
  load();
  try { Keys.add({ area: 'Chat', keys: '🧠 on your message', what: 'the memory it carried (only facts it was about)' }); } catch { /* keys.js not loaded */ }

  return { load, factsOf, add, forget, compose, intercept, handles, run, agentFacts, alwaysTokens, SUBS, get data() { return data; } };
})();
window.ChatMemory = ChatMemory;
