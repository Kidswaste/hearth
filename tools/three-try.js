// ◧ Try it first (round 43, directorpreview). When the Three Director's edit isn't what the owner wanted, they ask
// again, which costs tokens and time. With Try it first, a director turn's edits land on a preview copy of the scene:
// the preview shows them live (◧ Before / after works as usual), and the scenes file keeps the scene as it was until
// the owner picks one of three:
//   · Keep             the edit is saved, as one step (⟲ History: one version; the toast's Undo puts it back)
//   · Undo             the scene goes back to how it was; nothing was saved, nothing is recorded
//   · Try another way  Undo + one short message: the rejected edit in one line, "try a different approach" (≈ 40 tokens)
// The bar sits at the top centre of the preview (where ◧'s chip sits; the chip waits while the bar shows) with the
// edit's cost. Off by default. Ways in: ⋯ AI setup › Habits › "In the Lab: shows me its edit first" (agent.tryFirst),
// ◎ "Show me first" (the next message only), /try-first [on | off | next | keep | undo | again | status], ⌘/Ctrl+K.
// Works the same for Claude and Astra: it follows the chat's turns (Native hooks), not the engine. Nothing is added to
// any prompt or message (0 tokens), except the one short follow-up you ask for with "Try another way".
// How the copy works: the scene stays in memory as the director edits it (the preview runs it as always), and the
// Lab's save writes TryCore.diskList(): the scene as it was when the turn started (a scene made meanwhile is left out).
// The time machine records nothing for that scene while it waits (tools/three-history.js asks holds()), so Keep is one
// version and Undo leaves no trace. Hooks: tools/three.js save() → disk(), ThreeHistory.director → touch().
const LabTry = (() => {
  const C = TryCore;
  const trials = new Map(); // chat id → { chatId, agentId, by, sceneId, before, sketch, startIds, newIds, prevLink, running, usage, line, state }
  const armed = new Set(); // agent ids whose next message is tried first (◎ Show me first, Try another way)
  const stats = { started: 0, kept: 0, undone: 0, again: 0, empty: 0 };
  const Lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null);
  const hooks = () => Lab()?.stageHooks || {};
  const isDirector = (a) => Boolean(a && a.mode !== 'web' && (a.dock === 'three' || a.threeTools));
  const directorAgent = (id) => { const a = id && H.agent?.(id); return isDirector(a) ? a : H.agents?.().find((x) => x.dock === 'three') || null; };
  const linkOf = (chatId) => (typeof ChatScenes !== 'undefined' && ChatScenes.linkOf?.(chatId)) || null;
  function engineOf(agentId, chatId) {
    const w = typeof ChatScenes !== 'undefined' ? ChatScenes.workers?.(chatId) : null;
    if (w?.active) return w.active === 'codex' ? 'codex' : 'claude';
    return H.agent?.(agentId)?.engine === 'codex' ? 'codex' : 'claude';
  }
  const err = (e) => toast(e?.message || String(e), { type: 'error' });

  // ---------- the Lab's hooks ----------
  // what the scenes file gets while trials wait (tools/three.js save)
  const disk = (list) => (trials.size ? C.diskList(list, [...trials.values()]) : list);
  // the time machine records nothing for a scene whose edit waits (tools/three-history.js record)
  const holds = (id) => Boolean(id) && [...trials.values()].some((t) => t.sceneId === id);
  // a director call is about to change scene `id` (ThreeHistory.director): the "before" is taken now if it wasn't at send
  function touch(id, chatId) {
    let t = chatId ? trials.get(chatId) : null;
    if (!t && !chatId) { const run = [...trials.values()].filter((x) => x.running); if (run.length === 1) [t] = run; }
    if (t && !t.before) take(t, id);
  }

  // ---------- a turn starts ----------
  function take(t, id = null) {
    const sc = Lab()?.scenes; const tm = Lab()?.tm;
    if (!sc || !tm) return false;
    id ||= linkOf(t.chatId) || sc.currentId();
    if (!id || !sc.get(id)) return false;
    if (id === sc.currentId()) tm.persist?.(); // code typed and slider moves into the scene first: they're the owner's, kept
    t.before = tm.state(id);
    if (!t.before) return false;
    t.sceneId = id;
    t.sketch = C.clone(sc.get(id));
    t.startIds = sc.all().map((x) => x.id);
    t.prevLink = linkOf(t.chatId);
    return true;
  }
  function onSend(agentId, chat, text) {
    const a = H.agent?.(agentId);
    if (!chat?.id || !isDirector(a) || /^\s*\//.test(String(text || ''))) return;
    const once = armed.delete(agentId);
    const t = trials.get(chat.id);
    // a message while an edit waits builds on it: the same "before", one Keep / Undo for all of it
    if (t) { t.running = true; t.state = 'working'; t.by = engineOf(agentId, chat.id); paintSoon(); return; }
    if (!once && a.tryFirst !== true) return;
    const nt = { chatId: chat.id, agentId, by: engineOf(agentId, chat.id), at: Date.now(), running: true, state: 'working', usage: null, newIds: [], before: null, sketch: null, sceneId: null, startIds: null, prevLink: null, line: '' };
    trials.set(chat.id, nt);
    stats.started += 1;
    take(nt); // the Lab isn't up yet: at its first edit (touch)
    paintSoon();
  }

  // ---------- a turn ends: what it changed ----------
  function onFinish(event, chat) {
    const t = chat?.id && trials.get(chat.id);
    if (!t) return;
    t.usage = C.addUsage(t.usage, event.usage);
    t.reply = event.type === 'done' ? String(event.text || '') : t.reply || '';
    setTimeout(() => settle(t).catch((e) => console.warn('try it first', e)), 400);
  }
  async function settle(t) {
    if (trials.get(t.chatId) !== t || Native.isBusy?.(t.chatId)) return;
    t.running = false;
    const sc = Lab()?.scenes; const tm = Lab()?.tm;
    if (!t.before || !sc || !tm) { trials.delete(t.chatId); stats.empty += 1; paint(); return; } // it only answered
    await window.ThreeHistory?.flush?.(t.sceneId).catch(() => null);
    const link = linkOf(t.chatId);
    t.newIds = link && link !== t.sceneId && !t.startIds.includes(link) && sc.get(link) ? [link] : [];
    const c = typeof TMCore !== 'undefined' ? TMCore.changes(t.before, tm.state(t.sceneId)) : null;
    const changed = c && !TMCore.none(c);
    if (!changed && !t.newIds.length) {
      trials.delete(t.chatId); stats.empty += 1;
      tm.persist?.(); // a scene made by someone else meanwhile is written now
      paint();
      return;
    }
    t.line = C.line({ summary: changed ? TMCore.summary(c) : '', newScene: t.newIds.length ? sc.get(t.newIds[0])?.name : '', reply: t.reply });
    t.state = 'ready';
    tm.persist?.(); // (only what isn't waiting is written)
    paint();
    if (shownId(t) !== sc.currentId()) chatNote(t);
  }

  // ---------- Keep · Undo · Try another way ----------
  const shownId = (t) => t.newIds?.[0] || t.sceneId;
  const pick = (chatId) => (chatId ? trials.get(chatId) : null) || [...trials.values()].find((t) => !t.running && shownId(t) === Lab()?.scenes?.currentId()) || [...trials.values()].find((t) => !t.running) || null;
  async function keep(chatId = null) {
    const t = pick(chatId);
    if (!t) return null;
    if (t.running) throw new Error('It is still working on it: wait for its reply.');
    trials.delete(t.chatId);
    const tm = Lab()?.tm;
    tm?.persist?.(); // the scenes file gets it now
    const id = shownId(t);
    const label = `${C.whoName(t.by)}'s edit, kept · ${t.line}`;
    await window.ThreeHistory?.capture?.(id, { kind: 'director', by: t.by, force: true, label }).catch(() => null);
    stats.kept += 1;
    dropNote(t);
    paint();
    const before = t.before; const scene = t.sceneId; const made = t.newIds[0] || null;
    toast(`Kept ${C.whoName(t.by)}'s edit`, { timeout: 6000, action: { label: 'Undo', fn: () => undoKept(scene, before, made).catch(err) } });
    return t;
  }
  // the toast's Undo after Keep: back to before (recorded, as any restore: it was saved)
  async function undoKept(id, before, made) {
    const sc = Lab()?.scenes;
    if (made) { if (sc?.unrecover?.([made])) { if (sc.get(id)) sc.open(id); } return; }
    putBack(id, before);
    await window.ThreeHistory?.capture?.(id, { kind: 'restore', by: 'you', force: true, label: 'Undid a kept edit' }).catch(() => null);
  }
  function putBack(id, st) {
    const sc = Lab()?.scenes; const tm = Lab()?.tm;
    if (!sc?.get(id) || !st) return false;
    if (id === sc.currentId()) return tm.show(st, { keep: true });
    const x = sc.get(id);
    x.layers = C.clone(st.layers);
    if (st.palette) x.palette = [...st.palette]; else delete x.palette;
    sc.changed(id);
    return true;
  }
  async function undo(chatId = null, { quiet = false } = {}) {
    const t = pick(chatId);
    if (!t) return null;
    if (t.running) throw new Error('It is still working on it: wait for its reply (or stop it).');
    trials.delete(t.chatId);
    const sc = Lab()?.scenes;
    if (t.newIds.length) {
      const back = t.prevLink && sc?.get(t.prevLink) ? t.prevLink : t.sceneId;
      if (sc?.currentId() === t.newIds[0] && sc.get(back)) sc.open(back);
      sc?.unrecover?.(t.newIds);
      if (t.prevLink && typeof ChatScenes !== 'undefined') ChatScenes.relink?.(t.chatId, t.prevLink);
    }
    if (t.sceneId && typeof TMCore !== 'undefined' && !TMCore.none(TMCore.changes(t.before, Lab()?.tm?.state(t.sceneId)))) putBack(t.sceneId, t.before);
    window.LabAB?.close?.({ forget: true }); // nothing to compare: it is as it was
    stats.undone += 1;
    dropNote(t);
    paint();
    if (!quiet) toast('Undone: the scene is as it was (nothing was saved)', { timeout: 3000 });
    return t;
  }
  async function again(chatId = null) {
    const t = pick(chatId);
    if (!t) return null;
    const { agentId, chatId: id, line } = t;
    await undo(t.chatId, { quiet: true });
    stats.again += 1;
    armed.add(agentId); // the next try waits for you too
    const text = C.followUp(line);
    if (H.activeChat?.[agentId] === id) await Native.send(agentId, text);
    else await Native.send(agentId, text, { chatId: id });
    return text;
  }

  // ---------- the bar (top centre of the preview's frame) ----------
  let bar = null; let ro = null; let paintT = 0;
  const paintSoon = () => { clearTimeout(paintT); paintT = setTimeout(paint, 60); };
  function current() {
    const id = Lab()?.scenes?.currentId?.();
    return id ? [...trials.values()].find((t) => (t.sceneId === id || t.newIds.includes(id) || (t.running && !t.sceneId && linkOf(t.chatId) === id))) || null : null;
  }
  function build() {
    const what = el('span', { class: 'lt-what' });
    const cost = el('span', { class: 'lt-cost' });
    const ab = el('button', { type: 'button', class: 'lt-ab', text: '◧', title: 'Before / after: press and hold to see before, click for the split view (or hold B)', attrs: { 'aria-label': 'Before / after' } });
    ab.addEventListener('pointerdown', (e) => { if (e.button !== 0 || !window.LabAB?.state?.().pair) return; e.stopPropagation(); ab.setPointerCapture?.(e.pointerId); LabAB.press('chip'); });
    ab.addEventListener('pointerup', () => { if (window.LabAB?.state?.().pair) LabAB.release('chip'); else toast('Before / after shows once the edit has settled', { timeout: 2000 }); });
    ab.addEventListener('pointercancel', () => window.LabAB?.release?.('chip'));
    const b = (cls, text, title, fn) => el('button', { type: 'button', class: cls, text, title, on: { click: () => fn().catch(err) } });
    const node = el('div', { class: 'lab-try', role: 'group', attrs: { 'aria-label': 'Try it first' }, dataset: { feature: 'Try it first' } },
      what, cost, ab,
      b('lt-keep', 'Keep', 'Keep this edit: it is saved into the scene, as one step you can undo', () => keep()),
      b('lt-undo', 'Undo', 'Back to how it was: nothing was saved', () => undo()),
      b('lt-again', 'Try another way', 'Undo, and ask for a different approach (one short message naming what you didn\'t want)', () => again()));
    node.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); showMenu(e.clientX, e.clientY, menuRows()); });
    return node;
  }
  function place() {
    const host = hooks().host; if (!bar || !host) return;
    const hr = host.getBoundingClientRect(); const fr = hooks().frameRect || hr;
    const left = `${Math.round(fr.left - hr.left + fr.width / 2)}px`; const top = `${Math.round(fr.top - hr.top + 46)}px`;
    if (bar.style.left !== left) bar.style.left = left;
    if (bar.style.top !== top) bar.style.top = top;
  }
  const setText = (node, s) => { if (node.textContent !== s) node.textContent = s; };
  function paint() {
    const t = current(); const host = hooks().host;
    if (!t || !host) {
      if (bar) { bar.remove(); bar = null; }
      host?.classList.remove('lt-on');
      return;
    }
    if (!bar) { bar = build(); if (getComputedStyle(host).position === 'static') host.style.position = 'relative'; }
    if (bar.parentNode !== host) host.append(bar);
    host.classList.add('lt-on');
    const who = C.whoName(t.by);
    const working = t.running || t.state !== 'ready';
    bar.classList.toggle('lt-working', working);
    setText(bar.querySelector('.lt-what'), working ? `◧ Trying it first: ${who}'s changes wait here, not saved` : `◧ ${who}'s edit, not saved yet · ${t.line}`);
    setText(bar.querySelector('.lt-cost'), working ? '' : C.costText(t.usage));
    bar.querySelector('.lt-what').title = working ? 'Try it first: nothing is saved until you press Keep' : t.line;
    for (const x of bar.querySelectorAll('.lt-keep, .lt-undo, .lt-again, .lt-ab')) x.hidden = working;
    place();
    if (!ro && typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(() => place()); ro.observe(host); }
  }
  // the edit is ready on a scene that isn't on screen: a line in the chat with the same three choices (+ Show it)
  function chatNote(t) {
    if (typeof Native === 'undefined' || !Native.note || H.activeChat?.[t.agentId] !== t.chatId) return;
    t.note = Native.note(t.agentId, `◧ **${C.whoName(t.by)}'s edit is waiting** on its scene, not saved yet: ${t.line}${C.costText(t.usage) ? ` · ${C.costText(t.usage)}` : ''}`, { id: `lab-try-${t.chatId}`, actions: [
      { label: 'Show it', run: () => { Lab()?.cmd?.({ show: true }).then(() => Lab().scenes.open(shownId(t))).catch(err); } },
      { label: 'Keep', run: () => keep(t.chatId).catch(err) },
      { label: 'Undo', run: () => undo(t.chatId).catch(err) },
      { label: 'Try another way', run: () => again(t.chatId).catch(err) },
    ] });
  }
  function dropNote(t) { if (t.note) { t.note.dataset.gone = '1'; t.note.remove(); t.note = null; } }
  function menuRows() {
    const t = current();
    return t && !t.running ? [
      { label: '✓ Keep', hint: 'saved into the scene, one undo step', action: () => keep().catch(err) },
      { label: '⟲ Undo', hint: 'back as it was, nothing saved', action: () => undo().catch(err) },
      { label: '↻ Try another way', hint: 'undo + one short message', action: () => again().catch(err) },
      { label: '◧ Split view', hint: 'before | now', action: () => window.LabAB?.split?.(true) },
    ] : [{ label: 'Try it first: nothing waiting', disabled: true }];
  }
  addEventListener('hearth:sketch', paintSoon);
  for (const ev of ['hearth:activate', 'hearth:view']) addEventListener(ev, () => { if (trials.size) paintSoon(); });

  // ---------- the switch (⋯ AI setup row, the command) ----------
  async function setOn(agentId, on) {
    const a = directorAgent(agentId);
    if (!a) throw new Error('No Lab director yet.');
    for (const x of new Set([a, H.agent(a.id)].filter(Boolean))) { if (on) x.tryFirst = true; else delete x.tryFirst; }
    if (typeof saveConfig === 'function') await saveConfig();
    return a;
  }
  function status() {
    const a = directorAgent(null);
    const list = [...trials.values()].map((t) => `${C.whoName(t.by)}: ${t.running ? 'working' : `waiting · ${t.line}${C.costText(t.usage) ? ` · ${C.costText(t.usage)}` : ''}`}`);
    return `Try it first is ${a?.tryFirst ? 'on' : 'off'}${a ? ` for ${a.name}` : ''}.${list.length ? ` ${list.join(' | ')}` : ' Nothing waiting.'}`;
  }

  // ---------- ways in ----------
  function register() {
    if (typeof Native !== 'undefined' && Native.hooks) { Native.hooks.send.push(onSend); Native.hooks.finish.push(onFinish); }
    if (typeof Missions !== 'undefined' && Missions.add) {
      Missions.add({ id: 'lab-try', icon: '◧', label: 'Show me first',
        when: (id) => H.agent?.(id)?.dock === 'three' && H.agent(id).tryFirst !== true,
        desc: 'Its edit shows in the preview but isn\'t saved: Keep it, Undo it, or Try another way (one short message). No extra tokens.',
        submit: (agentId) => { armed.add(agentId); return false; } }); // false: the message goes as usual
    }
    if (typeof AppUI !== 'undefined' && AppUI.addAction) AppUI.addAction('Lab: Try it first on / off (the director\'s edits wait for Keep)', () => { const a = directorAgent(null); setOn(a?.id, !a?.tryFirst).then((x) => toast(`Try it first ${x.tryFirst ? 'on' : 'off'} for ${x.name}`, { timeout: 2500 })).catch(err); });
    if (typeof Commands === 'undefined' || Commands.get?.('try-first')) return;
    const VERBS = ['on', 'off', 'next', 'keep', 'undo', 'again', 'status'];
    Commands.register({
      name: 'try-first', area: 'Three.js Lab', args: '[on | off | next | keep | undo | again | status]',
      desc: 'Try it first: the Lab director\'s edits show in the preview but wait for you (Keep saves them as one step, Undo drops them, again asks for a different approach in one short message). on / off for every message, next for the next one only. No extra tokens.',
      keywords: 'try first preview show me first keep undo discard reject try another way different approach director edit before save confirm approve',
      examples: ['/try-first on', '/try-first next', '/try-first keep', '/try-first again', '/try-first status'],
      complete: (x) => VERBS.filter((v) => v.startsWith(String(x || '').trim().toLowerCase())).map((value) => ({ value })),
      async run(args, ctx = {}) {
        const v = String(args || '').trim().toLowerCase() || 'status';
        if (v === 'on' || v === 'off') { const a = await setOn(ctx.agentId, v === 'on'); return v === 'on' ? `Try it first is on for ${a.name}: its edits wait in the preview for Keep, Undo or Try another way.` : `Try it first is off for ${a.name}: its edits are saved as they come.`; }
        if (v === 'next') { const a = directorAgent(ctx.agentId); if (!a) return 'No Lab director yet.'; armed.add(a.id); return `${a.name}'s next edit waits for you.`; }
        const chatId = ctx.chatId && trials.has(ctx.chatId) ? ctx.chatId : null;
        if (v === 'keep') return (await keep(chatId)) ? 'Kept.' : 'Nothing waiting.';
        if (v === 'undo') return (await undo(chatId)) ? 'Undone.' : 'Nothing waiting.';
        if (v === 'again') return (await again(chatId)) ? 'Asked for a different approach.' : 'Nothing waiting.';
        if (v === 'status') return status();
        return `Try: ${VERBS.join(', ')}`;
      },
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', register); else register();

  const state = () => ({ on: Boolean(directorAgent(null)?.tryFirst), armed: [...armed], trials: [...trials.values()].map((t) => ({ chatId: t.chatId, by: t.by, sceneId: t.sceneId, newIds: t.newIds, running: t.running, state: t.state, line: t.line, cost: C.costText(t.usage), usage: t.usage })), bar: Boolean(bar), stats: { ...stats } });
  return { disk, holds, touch, keep, undo, again, setOn, state, status, menuRows, paint };
})();
window.LabTry = LabTry; // the Lab's hooks call it as window.LabTry?.… (tools/three.js, tools/three-history.js)
