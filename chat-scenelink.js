// (round 72, labbridge72) Which Lab scene a chat works on, always in view: a small "🔗 Scene: <name>" chip over the chat
// box of every chat linked to a scene (a docked director's own, or a plain Claude / Astra chat's guest link, see
// chat-scenes.js linkGuest). A plain chat that has the Lab's tools but no scene yet shows "🔗 Link this chat to a scene".
// Click: open it in the Lab · link it to the scene on screen, another one, or a fresh one · unlink. A call that found no
// scene (its error tells the AI to wait) also leaves one note in the chat with the same Link button.
// Written only when what it shows changes (the chat, its link, the scene's name, on screen or not).
const SceneLink = (() => {
  const CS = () => (typeof ChatScenes !== 'undefined' ? ChatScenes : null);
  const labIn = () => (!window.Lazy?.isIn || Lazy.isIn('lab')) && typeof ThreeLab !== 'undefined' && ThreeLab.scenes ? ThreeLab.scenes : null;
  const labAgent = (a) => Boolean(a && a.mode === 'native' && (a.threeTools || a.dock === 'three'));

  // { chatId, sketch, name } for a linked chat, { chatId, sketch: null } for a Lab chat without a scene, else null
  function stateOf(agentId) {
    const cs = CS(); const chatId = H.activeChat?.[agentId] || null;
    if (!cs || !chatId) return null;
    const sketch = cs.linkOf(chatId);
    if (sketch) return { chatId, sketch, name: cs.sceneName(chatId) };
    const a = H.agent(agentId);
    if (a?.dock === 'three') return null; // a director's chat gets its scene by itself (its first message)
    return labAgent(a) || cs.isLabChat?.(chatId) ? { chatId, sketch: null } : null;
  }

  async function lab() {
    if (!labIn()) await ThreeLab.cmd({ show: false });
    for (let i = 0; i < 50 && !labIn(); i += 1) await new Promise((r) => setTimeout(r, 100));
    if (!labIn()) throw new Error('The Three.js Lab did not load');
    return labIn();
  }
  const say = (agentId, text) => (Native.note ? Native.note(agentId, text, { id: 'scene-link', quiet: true }) : toast(text, { timeout: 3000 }));
  async function linkTo(agentId, chatId, sketchId) {
    const S = await lab();
    CS().linkGuest(chatId, sketchId);
    paintSoon();
    say(agentId, `🔗 This chat works on **${S.get(sketchId)?.name || 'that scene'}** now: its AI's Lab calls reach it, on screen or not.`);
  }
  async function fresh(agentId, chatId) {
    await lab();
    const sk = CS().freshGuest(chatId); // a calm starter in the chat's color, like a director's new chat (not opened)
    paintSoon();
    say(agentId, `🔗 This chat works on a fresh scene, **${sk.name}**: its AI builds it backstage until you open it.`);
  }
  async function openIt(sketchId) {
    activate('tool:three');
    await lab();
    await (CS().openScene ? CS().openScene(sketchId) : ThreeLab.scenes.open(sketchId));
  }
  // the scenes to pick from: the one on screen first, then the latest ones
  function choices(agentId, chatId, current) {
    const S = labIn();
    const items = [];
    if (!S) return [{ label: 'Load the Lab to pick a scene…', action: () => lab().then(() => menu(agentId, chatId)).catch((err) => toast(calmError(err), { type: 'error' })) }];
    const on = S.currentId();
    if (on && on !== current) items.push({ label: `The scene open in the Lab: ${S.get(on)?.name}`, action: () => linkTo(agentId, chatId, on).catch(fail) });
    const recent = S.all().filter((x) => x.id !== on && x.id !== current).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 10);
    if (recent.length) items.push({ label: 'Another scene', items: recent.map((x) => ({ label: x.name, hint: CS().glyphFor?.(x.id) || '', action: () => linkTo(agentId, chatId, x.id).catch(fail) })) });
    items.push({ label: 'A fresh scene', hint: 'a calm starter', action: () => fresh(agentId, chatId).catch(fail) });
    return items;
  }
  const fail = (err) => toast(typeof calmError === 'function' ? calmError(err) : err.message, { type: 'error' });
  function menu(agentId, chatId, at = null) {
    const st = stateOf(agentId);
    if (!st || st.chatId !== chatId) return;
    const chip = Native.view(agentId)?.form.querySelector('.scene-link-chip');
    const r = at || chip?.getBoundingClientRect() || { left: 200, top: 200 };
    const items = st.sketch ? [
      { label: `Open “${st.name}” in the Lab`, action: () => openIt(st.sketch).catch(fail) },
      { label: 'Link to another scene', items: () => choices(agentId, chatId, st.sketch) },
      // a director's own scene stays its own (its chat switches it); a guest link can go
      CS().isGuest?.(chatId) ? { label: 'Unlink this chat', more: true, action: () => { CS().unlink(chatId); paintSoon(); } } : null,
    ].filter(Boolean) : ['Link this chat to a scene', ...choices(agentId, chatId, null)];
    showMenu(r.left, (r.top || 0) - 4, items);
  }

  function paint(agentId) {
    const v = Native.view(agentId);
    const box = v?.form?.querySelector('.composer-box');
    if (!box) return;
    const st = stateOf(agentId);
    let chip = box.querySelector(':scope > .scene-link-chip');
    if (!st) { chip?.remove(); return; }
    const S = labIn();
    const onScreen = Boolean(st.sketch && S && S.currentId() === st.sketch);
    const sig = `${st.chatId}|${st.sketch || ''}|${st.name || ''}|${onScreen}`;
    if (chip?.dataset.sig === sig) return;
    if (!chip) {
      chip = el('button', { type: 'button', class: 'scene-link-chip', dataset: { feature: 'Scene link' },
        on: { click: (e) => { e.preventDefault(); menu(agentId, H.activeChat[agentId]); }, contextmenu: (e) => { e.preventDefault(); e.stopPropagation(); menu(agentId, H.activeChat[agentId], { left: e.clientX, top: e.clientY }); } } });
      box.prepend(chip);
    }
    chip.dataset.sig = sig;
    chip.classList.toggle('unlinked', !st.sketch);
    chip.textContent = st.sketch ? `🔗 Scene: ${String(st.name).slice(0, 28)}` : '🔗 Link this chat to a scene';
    chip.title = st.sketch ? `This chat works on the Lab scene “${st.name}”${onScreen ? ' (on screen)' : ' (not on screen: its AI works on it backstage)'}.\nClick: open it, or link another scene` : 'This chat has the Lab\'s tools but no scene yet: click to pick the one it works on.';
  }
  let t = 0;
  function paintSoon() { clearTimeout(t); t = setTimeout(() => { for (const a of H.agents().filter((x) => x.mode === 'native')) if (Native.hasView?.(a.id)) paint(a.id); }, 60); }

  // a call that found no scene: one note in that chat (when it's the one on screen) with the Link button
  addEventListener('hearth:scene-link-needed', (e) => {
    const chatId = e.detail?.chatId;
    const c = chatId && H.chats.find((x) => x.id === chatId);
    if (!c || H.activeChat[c.agentId] !== chatId) { paintSoon(); return; }
    Native.note(c.agentId, '🔗 This chat isn\'t linked to a Lab scene yet, so its AI couldn\'t use the Lab. Pick the scene it works on:', { id: 'scene-link',
      actions: [{ label: '🔗 Link this chat to a scene', run: (box) => { const r = box.querySelector('.note-acts button')?.getBoundingClientRect(); menu(c.agentId, chatId, r ? { left: r.left, top: r.bottom + 160 } : null); } }] });
    paintSoon();
  });
  addEventListener('hearth:scene-link', paintSoon);
  addEventListener('hearth:sketch', paintSoon);
  addEventListener('hearth:view', paintSoon);
  if (typeof Native !== 'undefined') { Native.hooks.render.push((agentId) => paint(agentId)); Native.hooks.send.push(() => paintSoon()); }
  window.Lazy?.when?.('lab', paintSoon);
  paintSoon();
  return { paint, paintSoon, menu, stateOf, linkTo };
})();
window.SceneLink = SceneLink;
