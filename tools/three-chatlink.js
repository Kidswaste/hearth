// (round 92, labchat92) A chat and the Lab, working together (loads with the Lab: lazy group 'lab').
//   · ▶ Apply to scene on a reply's code block (a whole layer): replace the selected layer of the chat's scene, another
//     layer, or add it as a new layer — on screen or backstage, through the same path as an AI's call (one undo step,
//     the time machine, the layer's history). The chat then shows what happened (runs / its errors, console lines)
//     with ↶ Undo, "Tell Claude what happened" / "Send the error to Claude" (the owner's click sends it, nothing else
//     does) and "Open in the Lab". A layer the owner typed in after that reply was written asks first.
//   · Chats started from the Lab (Ask Claude about this layer, the console's Ask to fix, a reference's Ask) are linked to
//     the scene they came from (before: a new chat with no scene, so its AI's Lab calls were refused, or a chat linked
//     to another scene fixed that one), and their draft starts with one line about the scene.
// Nothing here runs by itself: every action is a click.
const LabChatLink = (() => {
  const C = () => window.LabChatCore;
  const ownerToken = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; // the owner's own apply (three-director.js handGuard)
  const pending = new Map(); // agentId → { sceneId, at }: the next new chat sent from there links to that scene
  const stats = { applied: 0, added: 0, undone: 0, told: 0, linked: 0, asked: 0 };
  const S = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.scenes : null);
  const CS = () => (typeof ChatScenes !== 'undefined' ? ChatScenes : null);
  const fail = (err) => toast(typeof calmError === 'function' ? calmError(err) : String(err?.message || err), { type: 'error' });
  const whoOf = (agentId) => { const a = H.agent(agentId); return a?.engine === 'codex' ? 'Astra' : a?.name && !/director/i.test(a.name) ? a.name : 'Claude'; };
  const layersOf = (sceneId) => { const sk = S()?.get(sceneId); try { return sk ? S().layersOf(sk) || [] : []; } catch { return []; } };
  const layerOf = (sceneId, id) => layersOf(sceneId).find((L) => L.id === id) || null;
  const selectedOf = (sceneId) => { const Ls = layersOf(sceneId); const id = S()?.selectedOf?.(sceneId); return Ls.find((L) => L.id === id) || Ls.at(-1) || null; };
  // the code of a layer as it is now (the editor's text for the selected layer on screen)
  function codeNow(sceneId, id) {
    const d = ThreeLab.director;
    if (d && S()?.currentId() === sceneId) { try { const x = d.codeOf(id); if (x?.sketchId === sceneId) return x.code; } catch { /* gone */ } }
    return layerOf(sceneId, id)?.code ?? null;
  }

  // ---------- chats started from the Lab ----------
  if (typeof Native !== 'undefined' && Native.hooks?.send) {
    Native.hooks.send.push((agentId, chat) => {
      const p = pending.get(agentId);
      if (!p || !chat?.id) return;
      pending.delete(agentId);
      if (Date.now() - p.at > 30 * 60 * 1000 || (chat.messages?.length || 0) > 2) return; // only the new chat it was meant for
      if (!CS() || CS().linkOf(chat.id) || H.agent(agentId)?.dock === 'three' || !S()?.get(p.sceneId)) return;
      CS().linkGuest(chat.id, p.sceneId, { why: 'lab' });
      stats.linked += 1;
    });
  }
  // the agent's chat for this scene: its open chat when it's linked to it, else a new chat that links to the scene
  // with its first message
  function chatFor(agentId, sceneId) {
    const chatId = H.activeChat?.[agentId] || null;
    const link = chatId && CS()?.linkOf(chatId);
    if (H.agent(agentId)?.dock === 'three') return; // a docked director's chat gets the scene on screen by itself
    if (chatId && link === sceneId) return;
    if (chatId) Native.newChat(agentId); // another conversation (or another scene's) stays as it is
    pending.set(agentId, { sceneId, at: Date.now() });
  }
  // the one line about the scene a chat started from the Lab gets in its draft
  function sceneLine(sceneId) {
    const sk = S()?.get(sceneId);
    if (!sk || !C()) return '';
    const sel = selectedOf(sceneId);
    let picked = null;
    try { if (S().currentId() === sceneId) picked = ThreeLab.director?.layers?.()?.picked || null; } catch { /* none */ }
    return C().sceneLine({ scene: sk.name, layers: layersOf(sceneId).map((L) => L.name), selected: sel?.name, picked });
  }
  // Start a message about the scene: agent (default: the first with the Lab's tools, else Claude), never sent here
  function ask(text, { sceneId = S()?.currentId(), agentId = null, line = true } = {}) {
    const agent = agentId ? H.agent(agentId) : (H.agents().find((a) => a.threeTools) || H.claudeAgent?.());
    if (!agent) { toast('Add a Claude chat first (＋ in the rail).', { type: 'error' }); return null; }
    activate(agent.id);
    if (sceneId) chatFor(agent.id, sceneId);
    const head = line && sceneId ? sceneLine(sceneId) : '';
    Native.setDraft(agent.id, head ? `${head}\n${text}` : text);
    stats.asked += 1;
    return agent.id;
  }

  // ---------- ▶ Apply to scene ----------
  // agentId / chatId: the chat the reply is in; code: the block; msgAt: when that reply was written (ms)
  async function menu(agentId, chatId, code, anchor, msgAt = 0) {
    if (!chatId) { toast('This chat has no messages yet.', { type: 'error' }); return; }
    await ThreeLab.cmd({ show: false });
    for (let i = 0; i < 50 && !(S() && ThreeLab.director); i += 1) await new Promise((r) => setTimeout(r, 100));
    if (!S()) throw new Error('The Three.js Lab did not load');
    await CS()?.ready?.();
    let sceneId = CS()?.linkOf(chatId) || null;
    const linkIt = !sceneId || !S().get(sceneId);
    if (linkIt) sceneId = S().currentId();
    const sk = S().get(sceneId);
    if (!sk) throw new Error('No Lab scene to apply it to.');
    const sel = selectedOf(sceneId);
    const others = layersOf(sceneId).filter((L) => L.id !== sel?.id).reverse();
    const go = (o) => () => apply(agentId, chatId, code, sceneId, { ...o, link: linkIt, msgAt }).catch(fail);
    const items = [
      { label: `Apply to “${sk.name}”${linkIt ? ' (open in the Lab: this chat links to it)' : ''}`, disabled: true },
      sel ? { label: `Replace “${sel.name}” (the selected layer)`, action: go({ layerId: sel.id }) } : null,
      others.length ? { label: 'Replace another layer', items: others.slice(0, 20).map((L) => ({ label: `Replace “${L.name}”`, action: go({ layerId: L.id }) })) } : null,
      { label: 'Add it as a new layer', hint: 'on top', action: go({ add: true }) },
      { label: 'Open it as a new sketch', hint: 'this scene stays as it is', action: () => ThreeLab.openCode(code) },
    ].filter(Boolean);
    const r = anchor?.getBoundingClientRect?.() || { left: 200, bottom: 200 };
    showMenu(r.left, r.bottom + 4, items);
  }
  const said = (r) => (r && r.ok === false ? String(r.error || 'It failed.') : null);
  async function apply(agentId, chatId, code, sceneId, { layerId = null, add = false, link = false, msgAt = 0 } = {}) {
    if (!C()?.wholeLayer(code)) throw new Error('That block isn\'t a whole layer (an ES module that imports three and draws), so it can\'t replace one.');
    if (link && CS()) { CS().linkGuest(chatId, sceneId, { why: 'apply' }); stats.linked += 1; }
    const sk = S().get(sceneId);
    let L = layerId ? layerOf(sceneId, layerId) : null;
    if (!add && !L) throw new Error('That layer isn\'t in the scene any more.');
    let before = null;
    if (!add) {
      before = codeNow(sceneId, L.id);
      const hand = ThreeLab.director?.handAt?.(sceneId, L.id) || 0;
      if (hand && hand > msgAt && before !== code) {
        const yes = await Modal.confirm(`Replace “${L.name}”?`, `You changed “${L.name}” by hand after this reply was written. Replacing it drops those changes from the layer (↶ Undo in the chat, or its history, brings them back).`, { ok: 'Replace it' });
        if (!yes) return null;
      }
    }
    const ctx = { chatId };
    const t0 = Date.now();
    const r = add
      ? await HubBridge.call('three_add_layer', { name: 'From chat', code, wait: 2.5, report: 'full', _owner: ownerToken }, ctx)
      : await HubBridge.call('three_update_layer', { layer: L.id, code, wait: 2.5, report: 'full', _owner: ownerToken }, ctx);
    if (said(r)) throw new Error(said(r));
    if (add) { L = layersOf(sceneId).at(-1); stats.added += 1; } else stats.applied += 1;
    // the whole report (report: 'full'): every error and console line of the layer, not only what this chat's AI
    // hasn't seen; an error a few frames in (the scene's health) gets up to 1.2 s to arrive
    const health = () => (window.LabHealth?.state(sceneId) || []).filter((x) => (!x.layer || x.layer === L?.id) && (x.last || 0) >= t0 - 50);
    const one = layersOf(sceneId).length === 1; // (a one-layer scene's lines carry no layer name)
    const mine = (v) => { const x = v && typeof v === 'object' ? v : {}; const pre = `[${L?.name}] `; return { errors: (Array.isArray(x.errors) ? x.errors : []).filter((e) => !e.layer || e.layer === L?.name), console: (Array.isArray(x.console) ? x.console : []).filter((l) => String(l).startsWith(pre) || (one && !/^\[/.test(String(l)))).map((l) => (String(l).startsWith(pre) ? String(l).slice(pre.length) : String(l))) }; };
    for (let i = 0; i < 8 && !mine(r.value).errors.length && !health().length; i += 1) await new Promise((res) => setTimeout(res, 150));
    const out = C().outcome(mine(r.value), health(), L?.name);
    const job = { agentId, chatId, sceneId, scene: sk?.name || 'the scene', layerId: L?.id, layer: L?.name || 'From chat', how: add ? 'added' : 'replaced', before, code, out };
    showResult(job);
    return job;
  }
  function showResult(job, { undone = false } = {}) {
    const who = whoOf(job.agentId);
    const o = job.out;
    const con = !undone && o.console.length ? ` · console: ${o.console.slice(-2).map((l) => `\`${l.replace(/`/g, "'")}\``).join(' ')}` : '';
    const text = undone
      ? `↶ Undone: “${job.layer}” in **${job.scene}** is as it was before.`
      : `▶ ${job.how === 'added' ? 'Added' : 'Applied'} to **${job.layer}** in **${job.scene}**:\n${o.words}${con}`; // (two lines: the scene's own error, not a Hearth error to calm)
    const acts = [];
    if (!undone) acts.push({ label: '↶ Undo', title: 'Put the layer back as it was', run: () => undo(job).catch(fail) });
    acts.push({ label: o.errors.length && !undone ? `Send the error to ${who}` : `Tell ${who} what happened`, title: 'Sends a short message: what was applied, its errors and console lines (you see it in the chat)', run: () => tell(job, undone).catch(fail) });
    acts.push({ label: 'Open in the Lab', title: 'Show this scene in the Lab', run: () => openIt(job.sceneId).catch(fail) });
    if (H.activeChat?.[job.agentId] !== job.chatId) return; // the owner moved to another chat: the chat's 🔗 chip and the Lab say it
    Native.note(job.agentId, text, { id: 'lab-apply', actions: acts });
  }
  async function undo(job) {
    let r;
    if (job.how === 'added') r = await HubBridge.call('three_remove_layer', { layer: job.layerId }, { chatId: job.chatId });
    else {
      const now = codeNow(job.sceneId, job.layerId);
      if (now == null) throw new Error('That layer isn\'t in the scene any more.');
      if (now !== job.code && !(await Modal.confirm(`Undo on “${job.layer}”?`, `“${job.layer}” changed after it was applied. Undo puts back the code from before the apply, dropping those changes.`, { ok: 'Undo' }))) return;
      r = await HubBridge.call('three_update_layer', { layer: job.layerId, code: job.before, wait: 1.5, _owner: ownerToken }, { chatId: job.chatId });
    }
    if (said(r)) throw new Error(said(r));
    stats.undone += 1;
    showResult(job, { undone: true });
  }
  async function tell(job, undone) {
    const text = C().tellText({ how: job.how, layer: job.layer, scene: job.scene, out: job.out, undone });
    stats.told += 1;
    document.querySelector(`.msg.note[data-note-id="lab-apply"]`)?.remove();
    await Native.send(job.agentId, text);
  }
  async function openIt(sceneId) {
    activate('tool:three');
    await ThreeLab.cmd({ show: true });
    if (S().currentId() !== sceneId) await (CS()?.openScene ? CS().openScene(sceneId) : S().open(sceneId));
  }

  return { menu, apply, ask, chatFor, sceneLine, ownerToken, stats, _pending: pending };
})();
window.LabChatLink = LabChatLink;
