// (round 129, next129) "Next: <step>" under a director's finished reply (docs/upgrades/next129.md). Lazy group
// "nextstep" (after "projects", in an idle moment). In a project's Lab chat or a Three Director chat, the last finished
// reply gets one small chip: "Next: <short step>" and a ✕.
//   · the step: the brief's next unticked step, else the reply's own <suggest> buttons, else a cheap local rule from
//     the scene and the chat (nextstep-core.js). No AI call is made for it.
//   · a click sends it as the owner's message (a brief step through ProjectBrief.start, which also ticks it); nothing
//     is sent without that click. ✕ hides it for that reply; typing in the chat box hides it too.
//   · one chip at a time (the last reply only); ⋯ AI setup › Habits › "Shows a Next: step under the last reply" turns
//     them off on this computer (store 'nextstep.on').
window.NextStep = (() => {
  const C = NextStepCore;
  const KEY = 'nextstep.on';
  const hidden = new Set(); // `${chatId}:${reply time}`: hidden by ✕, a click or typing
  const heard = new WeakSet(); // chat boxes listened to
  const last = { shown: null, sent: null }; // (checks) the chip on screen now, the last one clicked
  const on = () => store.get(KEY, true) !== false;
  function setOn(v) { store.set(KEY, v !== false); refresh(); }
  const isDirector = (a) => Boolean(a && (a.threeTools || a.dock === 'three'));
  const projectOf = (chat) => { try { return window.Projects?.projectOfChat?.(chat.id) || null; } catch { return null; } };
  // a project's Lab chat, or any Three Director chat
  function eligible(agentId, chat) {
    const a = H.agent(agentId);
    if (!a || a.mode !== 'native' || !chat) return false;
    if (isDirector(a)) return true;
    const p = projectOf(chat);
    return Boolean(p && p.workspace?.chatId === chat.id);
  }
  const keyOf = (chat, m) => `${chat.id}:${m.at || chat.messages.length}`;
  const SONG = /\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|aiff?)$/i;
  // the scene the chat works on, as the local rule reads it (only when the Lab is already loaded: nothing loads for it)
  function sceneOf(chat, p) {
    if (!(window.Lazy?.loaded?.('lab') && typeof ThreeLab !== 'undefined' && ThreeLab.scenes)) return null;
    const S = ThreeLab.scenes;
    let sid = null;
    try { sid = window.ChatScenes?.linkOf?.(chat.id) || p?.workspace?.sceneId || null; } catch { sid = p?.workspace?.sceneId || null; }
    const x = sid && S.get(sid);
    if (!x) return null;
    const song = S.songOf?.(sid);
    return { song: song && SONG.test(song) ? song : null, layers: (x.layers || []).map((L) => ({ id: L.id, code: L.code, keys: L.keys })), extras: S.extrasOf?.(sid) || {} };
  }
  function briefOf(p) {
    const B = window.ProjectBrief;
    if (!p || !B?.get) return null;
    try { return B.get(p.id); } catch { return null; }
  }
  // the step for this chat's last reply, or null
  function stepFor(agentId, chat) {
    if (!eligible(agentId, chat)) return null;
    const m = chat.messages?.at(-1);
    if (!m || m.role !== 'assistant' || m.stopped || window.Native?.isBusy?.(chat.id)) return null;
    const p = projectOf(chat);
    return C.pick({ brief: briefOf(p), suggest: m.suggest, scene: sceneOf(chat, p), tools: C.toolsOf(chat.messages) });
  }

  function remove(v) { for (const n of v?.root?.querySelectorAll?.('.ns-next') || []) n.remove(); }
  function paint(agentId, v, chat) {
    if (!v?.root) return;
    hear(agentId, v); hearBrief();
    const m = chat?.messages?.at(-1);
    const step = on() && m && !hidden.has(keyOf(chat, m)) && !(v.input?.value || '').trim() ? stepFor(agentId, chat) : null;
    const node = step && v.list?.querySelector(`.msg.assistant[data-index="${chat.messages.length - 1}"]`);
    const was = v.root.querySelector('.ns-next');
    if (!node) { remove(v); if (last.shown?.agentId === agentId) last.shown = null; return; }
    if (was && was.parentElement === node && was.dataset.step === step.full) return;
    remove(v);
    const key = keyOf(chat, m);
    const chip = el('div', { class: 'ns-next', dataset: { step: step.full, from: step.from }, attrs: { role: 'group', 'aria-label': 'Next step' } },
      el('button', { type: 'button', class: 'ns-go', title: `Send this as your message: “${step.full}”`, on: { click: (e) => { e.stopPropagation(); go(agentId, chat, step, key); } } },
        el('span', { class: 'ns-label', text: 'Next:' }), ` ${step.text}`),
      el('button', { type: 'button', class: 'ns-x', text: '✕', title: 'Hide this', attrs: { 'aria-label': 'Hide the next step' }, on: { click: (e) => { e.stopPropagation(); hidden.add(key); remove(v); last.shown = null; } } }));
    node.append(chip);
    last.shown = { agentId, chatId: chat.id, text: step.text, full: step.full, from: step.from };
  }
  // the click: the step as the owner's message (only now)
  function go(agentId, chat, step, key) {
    hidden.add(key);
    remove(Native.view(agentId));
    last.shown = null; last.sent = { agentId, chatId: chat.id, text: step.full, from: step.from };
    const p = projectOf(chat); const B = window.ProjectBrief;
    if (step.from === 'brief' && p && typeof B?.start === 'function') return Promise.resolve(B.start(p.id, agentId)).catch((err) => toast(calmError(err), { type: 'error' }));
    return Native.sendText(agentId, step.full);
  }
  // typing in the chat box hides the chip (for that reply)
  function hear(agentId, v) {
    if (!v.input || heard.has(v.input)) return;
    heard.add(v.input);
    v.input.addEventListener('input', () => {
      if (!v.input.value.trim() || !v.root.querySelector('.ns-next')) return;
      const chat = Native.current(agentId); const m = chat?.messages?.at(-1);
      if (m) hidden.add(keyOf(chat, m));
      remove(v); last.shown = null;
    });
  }
  function refresh() {
    hearBrief();
    if (typeof Native === 'undefined') return;
    for (const a of H.agents()) { const v = Native.view(a.id); if (v) { try { paint(a.id, v, Native.current(a.id)); } catch (err) { console.warn('next step', err); } } }
  }
  if (typeof Native !== 'undefined' && Native.hooks) {
    Native.hooks.render.push((agentId, v, chat) => { try { paint(agentId, v, chat); } catch (err) { console.warn('next step', err); } });
    Native.hooks.send.push((agentId) => remove(Native.view(agentId)));
  }
  // a brief step ticked (or a brief written) changes the step: the chips follow
  let briefHeard = false;
  const hearBrief = () => { if (briefHeard || !window.ProjectBrief?.onChange) return; briefHeard = true; window.ProjectBrief.onChange(() => requestAnimationFrame(refresh)); };
  hearBrief();
  requestAnimationFrame(refresh);
  return { refresh, stepFor, setOn, on, eligible, get last() { return last; } };
})();
