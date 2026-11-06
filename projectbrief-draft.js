// (round 129, draft129) ✦ Build a first draft: on the plan card (projectbrief.js), one click asks the project's director
// (Claude or Astra, whichever directs the project's chat) to work through the brief's first steps in ONE reply: new
// layers in the palette's colors, keyframed to the song's sections where the tempo plan says, with the existing Lab tools.
//   · only on the owner's click (never by itself); "up to step N" picks how far it goes (all by default)
//   · before it runs: one line with the estimated tokens and the model (director-cost's measure of the chat's fixed part,
//     projectbrief-core.js draftCost)
//   · while it runs: "Building step 2 of 5…" and Stop (the engine's own stop: what landed stays, still undoable)
//   · each step is ticked on the card as it lands (the director calls three_do brief {done: N}; projectbrief.js's handler)
//   · safe to undo: a checkpoint of the scene (LabTxn.snap, tools/three-txn.js) before it starts, and "↶ Undo the draft"
//     puts the scene back exactly as it was, in one step: the reply's own undo step (LabTxn.undoTurn, the dock's ↶, so
//     ↷ can bring it back) and, if anything else is left, the checkpoint itself (LabTxn.restore). The ticks go back too.
// The checkpoint lives in this window (a restart forgets it; the dock's ↶ and the Lab's history still have the reply).
const BriefDraft = (() => {
  const C = ProjectBriefCore;
  const B = () => ProjectBrief._;
  const runs = new Map(); // projectId → { status: running|stopping|done|stopped|error|undone, chatId, agentId, sceneId, steps, landed: Set, before, afterSig, at, error, touched }
  const upto = new Map(); // projectId → the "up to step N" choice (0: all)
  const costs = new Map(); // `${agentId}|${n}` → Promise<line>
  const calm = (err) => (window.calmError ? calmError(err) : String(err?.message || err));
  const paint = () => B().paint();
  const sig = (t) => LabTxn._test.sigOf(t);
  const who = (a, chat) => ((chat?.engine || a?.engine) === 'codex' ? 'Astra' : 'Claude');

  // the chat that builds: the card's own chat when it's this project's, else the project's Lab chat (opened)
  async function chatFor(pid, agentId) {
    const p = B().project(pid);
    if (!p) throw new Error('That project isn\'t here.');
    let id = agentId ? H.activeChat?.[agentId] : null;
    if (!id || B().projectOfChat(id)?.id !== pid) {
      await ProjectBrief.open(pid);
      id = p.workspace?.chatId || window.ProjectWorkspace?.currentChat?.()?.id || null;
    }
    const chat = id ? await Native.load(id) : null;
    const a = chat && H.agent(chat.agentId);
    if (!chat || !a || a.mode !== 'native') throw new Error(`“${p.name}” has no director chat to build in: open the project's chat first.`);
    return { p, chat, a };
  }
  const sceneOf = (chatId, p) => (typeof ChatScenes !== 'undefined' ? ChatScenes.linkOf?.(chatId) : null) || ThreeLab.scenes.currentId() || p.workspace?.sceneId || null;
  const needLab = async () => { if (window.Lazy && !Lazy.loaded('lab')) await Lazy.load('lab'); if (typeof LabTxn === 'undefined') throw new Error('The Lab isn\'t ready.'); };

  // ---------- the cost line (before running) ----------
  function costLine(pid, agentId, n) {
    const p = B().project(pid);
    const chatId = (agentId && H.activeChat?.[agentId] && B().projectOfChat(H.activeChat[agentId])?.id === pid) ? H.activeChat[agentId] : p?.workspace?.chatId;
    const chat = chatId ? (H.chats || []).find((c) => c.id === chatId) : null;
    const a = H.agent(chat?.agentId || agentId) || B().agentOf(p);
    if (!a) return Promise.resolve('');
    const key = `${a.id}|${chat?.model || ''}|${n}`;
    if (!costs.has(key)) {
      costs.set(key, (async () => {
        let base = 0;
        try { // director-cost: the chat's fixed part per message (system prompt + tool lists), as the Lab tools see it
          const r = await window.hub.directorCost?.([{ ...JSON.parse(JSON.stringify(a)), threeTools: true, exact: true }]);
          base = r?.directors?.[0]?.total || 0;
        } catch { /* unknown: the default below */ }
        const full = chat ? await Native.load(chat.id).catch(() => null) : null;
        const last = full?.messages?.findLast?.((m) => m.role === 'assistant' && m.usage?.input);
        base = Math.max(base || 9000, last?.usage?.input || 0); // the chat so far is re-read too
        return C.draftLine(C.draftCost({ steps: n, base }), who(a, chat), chat?.model || a.model || '');
      })());
      setTimeout(() => costs.delete(key), 120000);
    }
    return costs.get(key);
  }

  // ---------- run, stop, undo ----------
  async function run(pid, { agentId = null, upto: to = null } = {}) {
    const cur = runs.get(pid);
    if (cur && (cur.status === 'running' || cur.status === 'stopping')) throw new Error('A draft is already being built.');
    const e = B().entry(pid); const b = e?.brief;
    if (!b) throw new Error('No brief yet: prepare one first.');
    const steps = C.draftSteps(b, e.done || [], to ?? upto.get(pid) ?? 0);
    if (!steps.length) throw new Error('Those steps are all ticked already.');
    await needLab();
    const { p, chat, a } = await chatFor(pid, agentId);
    if (Native.isBusy(chat.id)) throw new Error(`${a.name} is still answering in that chat: wait for it, or stop it first.`);
    const sceneId = sceneOf(chat.id, p);
    const before = sceneId ? await LabTxn.snap(sceneId) : null;
    if (!before) throw new Error('The project\'s scene isn\'t there: open it in the Lab first.');
    await window.ThreeHistory?.autoVersion?.(sceneId, { why: 'draft', label: 'Before the first draft', by: a.engine === 'codex' || chat.engine === 'codex' ? 'codex' : 'claude' })?.catch?.(() => null); // (round 132, versions132) Scene versions…
    const r = { status: 'running', chatId: chat.id, agentId: a.id, sceneId, steps, landed: new Set(), before, doneBefore: (e.done || []).slice(), at: Date.now(), who: who(a, chat), touched: [] };
    runs.set(pid, r);
    paint();
    const text = C.draftMessage(b, p.name, { steps, keep: before.layers.map((L) => L.name) });
    try { await Native.send(a.id, text, { chatId: chat.id }); } catch (err) { finish(pid, 'error', calm(err)); throw err; }
    // a reply that never started (or one the finish hook missed) still ends the run
    const poll = setInterval(() => { if (runs.get(pid) !== r || !['running', 'stopping'].includes(r.status)) { clearInterval(poll); return; } if (!Native.isBusy(r.chatId)) { clearInterval(poll); finish(pid, r.status === 'stopping' ? 'stopped' : 'done'); } }, 2000);
    return r;
  }
  async function finish(pid, how, error = null) {
    const r = runs.get(pid);
    if (!r || !['running', 'stopping'].includes(r.status)) return;
    r.status = how === 'done' && r.status === 'stopping' ? 'stopped' : how; r.error = error; r.endAt = Date.now();
    paint();
    if (r.status !== 'done') await new Promise((ok) => setTimeout(ok, 800)); // a call that was already on its way lands first
    try {
      const after = await LabTxn.snap(r.sceneId);
      r.afterSig = sig(after);
      // the owner's layers the draft changed anyway (said on the card; ↶ Undo the draft puts them back)
      const now = new Map((after?.layers || []).map((L) => [L.id, L]));
      r.touched = r.before.layers.filter((L) => JSON.stringify(now.get(L.id) || null) !== JSON.stringify(L)).map((L) => L.name);
    } catch { r.afterSig = null; }
    paint();
  }
  function stop(pid) {
    const r = runs.get(pid);
    if (!r || r.status !== 'running') return false;
    r.status = 'stopping';
    paint();
    window.hub.stop(r.chatId);
    return true;
  }
  async function undo(pid, { force = false } = {}) {
    const r = runs.get(pid);
    if (!r?.before || !['done', 'stopped', 'error'].includes(r.status)) throw new Error('No draft to undo.');
    await needLab();
    const cur = await LabTxn.snap(r.sceneId);
    if (!cur) throw new Error('The scene isn\'t there anymore.');
    const later = r.afterSig && sig(cur) !== r.afterSig;
    if (later && !force && !(await Modal.confirm('Undo the draft?', 'The scene changed after the draft (you or another chat). Undoing puts it back as it was before the draft, so those later changes go too.', { ok: 'Undo anyway', danger: true }))) return false;
    // the draft is one reply: its own undo step first (the dock's ↶; ↷ can bring it back) …
    const top = LabTxn.history().at(-1);
    if (!later && top && top.at >= r.at && top.scene === r.before.name) { try { await LabTxn.undoTurn(); } catch { /* the checkpoint below */ } }
    // … then the checkpoint, for anything else (references it added, a change outside the reply's step)
    const now = await LabTxn.snap(r.sceneId);
    if (sig(now) !== sig(r.before)) await LabTxn.restore(r.before);
    B().set(pid, { done: r.doneBefore.slice() });
    r.status = 'undone';
    paint();
    toast('↶ The draft is undone: the scene is back as it was.', { timeout: 3000 });
    return true;
  }
  // three_do brief {done: N} from the director's chat: tick step N (1-based) of its project's brief
  function tick(pid, n, chatId) {
    const e = B().entry(pid); const k = Math.floor(Number(n)) - 1;
    if (!e?.brief || !(k >= 0 && k < e.brief.steps.length)) return `There is no step ${n} in the brief (it has ${e?.brief?.steps.length || 0}).`;
    B().set(pid, { done: [...new Set([...(e.done || []), k])].sort((x, y) => x - y) });
    const r = runs.get(pid);
    if (r && r.chatId === chatId && r.steps.includes(k)) r.landed.add(k);
    paint();
    return `Step ${k + 1} ticked: "${e.brief.steps[k]}".`;
  }
  if (typeof Native !== 'undefined' && Native.hooks?.finish) Native.hooks.finish.push((event, chat) => {
    for (const [pid, r] of runs) if (r.chatId === chat?.id && ['running', 'stopping'].includes(r.status)) finish(pid, event.type === 'done' ? 'done' : event.type === 'stopped' || r.status === 'stopping' ? 'stopped' : 'error', event.type === 'error' ? String(event.error || event.message || '') : null);
  });

  // ---------- on the card ----------
  const btn = (text, title, fn, cls = 'ghost small') => el('button', { type: 'button', class: cls, text, title, on: { click: async (ev) => { ev.stopPropagation(); const x = ev.currentTarget; x.disabled = true; try { await fn(); } catch (err) { toast(calm(err), { type: 'error' }); } finally { x.disabled = false; } } } });
  function row(pid, { agentId = null } = {}) {
    const e = B().entry(pid); const b = e?.brief;
    if (!b) return null;
    const r = runs.get(pid);
    const node = el('div', { class: 'pb-draft' });
    if (r && (r.status === 'running' || r.status === 'stopping')) {
      const i = Math.min(r.landed.size + 1, r.steps.length);
      const k = r.steps.find((s) => !r.landed.has(s));
      node.classList.add('busy');
      node.append(el('span', { class: 'pb-draft-now', attrs: { role: 'status' }, text: r.status === 'stopping' ? 'Stopping… (what landed stays)' : `Building step ${i} of ${r.steps.length}…`, title: k != null ? b.steps[k] : '' }),
        r.status === 'running' ? btn('Stop', 'Stop the draft here: what landed stays, and ↶ Undo the draft still takes it all back', () => stop(pid)) : null);
      return node;
    }
    if (r && ['done', 'stopped', 'error'].includes(r.status)) {
      const n = r.landed.size;
      const words = r.status === 'done' ? `✦ Draft built by ${r.who}: ${n} of ${r.steps.length} steps ticked.` : r.status === 'stopped' ? `Stopped: ${n} of ${r.steps.length} steps landed (kept).` : `The draft stopped on an error${r.error ? ` (${r.error})` : ''}; what landed is kept.`;
      node.append(el('div', { class: 'pb-acts' }, el('span', { class: 'pb-draft-now', attrs: { role: 'status' }, text: words }),
        btn('↶ Undo the draft', 'Put the scene back exactly as it was before the draft (one step)', () => undo(pid), 'small'),
        btn('Keep it', 'Keep the draft (the dock\'s ↶ can still undo the reply)', () => { runs.delete(pid); paint(); })));
      if (r.touched?.length) node.append(el('span', { class: 'pb-note', text: `It also changed your layer${r.touched.length > 1 ? 's' : ''} ${r.touched.map((t) => `“${t}”`).join(', ')}: ↶ Undo the draft puts ${r.touched.length > 1 ? 'them' : 'it'} back.` }));
    }
    const left = C.draftSteps(b, e.done || [], 0);
    if (!left.length) return node.childNodes.length ? node : null;
    const pick = el('select', { class: 'pb-upto', title: 'How far the draft goes', on: { change: () => { upto.set(pid, Number(pick.value)); paint(); } } },
      el('option', { value: '0', text: `all ${b.steps.length} steps` }), ...b.steps.map((s, k) => el('option', { value: String(k + 1), text: `up to step ${k + 1}`, title: s })));
    pick.value = String(upto.get(pid) || 0);
    const n = C.draftSteps(b, e.done || [], upto.get(pid) || 0).length;
    const cost = el('span', { class: 'pb-cost pb-note', text: n ? 'Estimating the cost…' : 'Those steps are ticked already.' });
    if (n) costLine(pid, agentId, n).then((t) => { cost.textContent = t || ''; }).catch(() => { cost.textContent = ''; });
    const go = btn('✦ Build a first draft', `The director builds ${n} step${n === 1 ? '' : 's'} of the brief in one reply; one ↶ takes it all back`, () => run(pid, { agentId }), 'small primary');
    go.disabled = !n;
    node.append(el('div', { class: 'pb-acts' }, go, pick), cost);
    return node;
  }
  const key = (pid) => { const r = runs.get(pid); return JSON.stringify([upto.get(pid) || 0, r ? [r.status, r.landed.size, r.touched?.length || 0] : null]); };

  return { run, stop, undo, tick, row, key, state: (pid) => { const r = runs.get(pid); return r ? { status: r.status, steps: r.steps.slice(), landed: [...r.landed], sceneId: r.sceneId, chatId: r.chatId, touched: (r.touched || []).slice(), before: r.before } : null; }, costLine };
})();
window.BriefDraft = BriefDraft;
