// ✦ 3 takes (round 130, takes130): the owner asks for a change ("make the glow more aggressive", "try a different look
// for the chorus") and gets 3 takes of it to compare live, side by side, then keeps one.
// - Ways in: the "✦ 3 takes" button beside Send in a director's chat (or any chat that works on a Lab scene), and
//   `/takes <ask>`. Nothing runs without a click: the card opens with the plan and the estimated cost first.
// - Built on the crew (tools/three-crew.js, round 22): 3 lean helper runs on the chat's AI (Claude or Astra), each on
//   its own copy of the scene on its own stage (ThreeBackstage.make), one take each (TakesCore.TAKES: all the way ·
//   colour & light · motion & rhythm). Their shared brief carries the ask and, when the scene belongs to a project,
//   the project's brief and palette. The cost line is the crew's estimate (director-cost / mcp/cost.js for the helper's
//   fixed part), in round 129's words.
// - Live: the takes' stages stay after they finish and are laid over the card's three boxes, playing the scene's song
//   (silent) in step with the Lab: each stage's clock is kept on the Lab's (seek when it drifts, play / pause with it).
// - Keep: click a take. Its layers become the scene as ONE undo step (LabTxn.step: the dock's ↶, Alt+Shift+Z,
//   /undo-edit, the toast's Undo, /takes undo). Any other way out (✕, Esc, Discard, a new ask) discards them: the
//   owner's scene is never touched before the click.
// - Stop (■, /takes stop) works any time: what the takes made so far stays in their boxes, to keep or discard.
// - Mix: when two takes changed only slider values, one the colours and the other the motion, "Take A's colours with
//   take B's motion" (TakesCore.mixPlan) is offered and kept the same way.
const LabTakes = (() => {
  const C = TakesCore;
  const AREA = 'Three.js Lab';
  let T = null; // the takes: { id, chatId, ask, crew, status: plan | running | done | stopped | kept | discarded, sceneId, sig0, line, … }
  let last = null; // the last takes, after they ended (status, what was kept): /takes status and the check read it
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const cap = (t, n) => { const s = String(t ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
  const isDirector = (a) => Boolean(a && (a.threeTools || a.dock === 'three'));
  const linked = (chatId) => Boolean(chatId && typeof ChatScenes !== 'undefined' && ChatScenes.linkOf?.(chatId));
  const whoOf = (agent, chat) => ((chat?.engine || agent?.engine) === 'codex' ? 'Astra' : 'Claude');
  const deep = (x) => JSON.parse(JSON.stringify(x));
  const err = (e) => toast(e.message || String(e), { type: 'error' });

  async function lab() {
    if (typeof ThreeCrew === 'undefined' || typeof LabTxn === 'undefined') await Lazy.load('lab');
    if (!window.ThreeLab?.scenes || !ThreeLab.director) await ThreeLab.cmd({ show: false });
    return ThreeLab.scenes;
  }
  // the project the scene belongs to: its brief (the director's compact form) and palette
  async function projectOf(chatId, sceneId) {
    try {
      if (typeof Projects === 'undefined') return {};
      const p = Projects.projectOfChat?.(chatId) || Projects.ofItem?.('scene', sceneId)?.[0] || null;
      if (!p) return {};
      if (typeof ProjectBrief === 'undefined') await Lazy.load('projectbrief').catch(() => {});
      const PB = typeof ProjectBrief !== 'undefined' ? ProjectBrief : null;
      const b = PB?.get?.(p.id) || null;
      const palette = (p.workspace?.palette?.length ? p.workspace.palette : b?.palette) || [];
      return { project: p, brief: PB?._?.entry?.(p.id)?.compact || '', palette };
    } catch { return {}; }
  }

  // ---------- plan (cost first) → run → keep / discard ----------
  async function plan(chatId, ask) {
    ask = C.askOf(ask);
    if (!ask) throw new Error('Say what to try first, e.g. "make the glow more aggressive".');
    if (T) discard({ quiet: true });
    const S = await lab();
    if (ThreeCrew.running()) throw new Error('A crew is working on another scene: stop it first (/crew stop).');
    const sceneId = (linked(chatId) && S.get(ChatScenes.linkOf(chatId)) ? ChatScenes.linkOf(chatId) : S.currentId());
    const ctx = await projectOf(chatId, sceneId);
    const crew = await ThreeCrew.plan(chatId, { n: 3, brief: ask, angles: C.TAKES.map((t) => t.angle), by: 'owner', ui: false, live: true, extra: C.extra(ctx) });
    const chat = chatId ? await Native.loadChat(chatId).catch(() => null) : null;
    const before = await LabTxn.snap(crew.base.sketchId);
    T = {
      id: crew.id, chatId, ask, crew, status: 'plan', sceneId: crew.base.sketchId, sig0: LabTxn._test.sigOf(before), at: Date.now(),
      project: ctx.project?.name || null, palette: (ctx.palette || []).slice(0, 8), brief: Boolean(ctx.brief),
      who: whoOf(crew.agent, chat),
      line: `${C.costLine(crew.est, { n: 3, out: ThreeCrew._test.OUT_EACH, who: whoOf(crew.agent, chat), model: chat?.model || crew.agent.model || '' })} · ≈ ${crew.est.secs < 90 ? `${crew.est.secs} s` : `${Math.round(crew.est.secs / 60)} min`}`,
      mixes: null,
    };
    Card.open();
    return T;
  }
  function start() {
    if (!T || T.status !== 'plan') return false;
    if (!ThreeCrew.approve()) return false;
    T.status = 'running';
    Card.paint();
    return true;
  }
  function stop() {
    if (!T) return false;
    if (T.status === 'plan') { discard(); return true; }
    if (T.status !== 'running') return false;
    T.stopping = true;
    ThreeCrew.stop();
    Card.paint();
    return true;
  }
  function discard({ quiet = false } = {}) {
    const t = T;
    if (!t) return false;
    T = null;
    if (ThreeCrew.current() === t.crew) ThreeCrew.end(); // stops what still runs, frees the stages
    t.status = t.status === 'kept' ? 'kept' : 'discarded';
    last = t;
    Card.close();
    if (!quiet && t.status === 'discarded') toast('The takes were discarded: your scene is as it was', { timeout: 2500 });
    return true;
  }
  const ready = (h) => Boolean(h && h.changed > 0 && !h.broken && h.status !== 'running' && h.status !== 'waiting');
  async function applyLayers(layers, selId, words) {
    const t = T;
    const sid = t.sceneId;
    const before = await LabTxn.snap(sid);
    if (!before) throw new Error('The scene is gone.');
    // (round 132, versions132) a version of the scene before the take, and one of the take kept (Scene versions…)
    const what = cap(words, 60);
    await window.ThreeHistory?.autoVersion?.(sid, { why: 'take', label: `Before ${what}: “${cap(t.ask, 50)}”`, by: 'you' })?.catch?.(() => null);
    window.ThreeHistory?.as?.(sid, 'takes');
    await LabTxn.restore({ ...before, layers: deep(layers), vals: {}, selId: selId || before.selId }, { keepRefs: true });
    await wait(300);
    const after = await LabTxn.snap(sid);
    LabTxn.step({ chatId: t.chatId, who: 'You', before, after, label: `the take you kept on "${before.name}"`, words });
    t.kept = { words, at: LabTxn.history().at(-1)?.at || Date.now(), sig: LabTxn._test.sigOf(after) };
    window.ThreeHistory?.autoVersion?.(sid, { why: 'take', label: `Kept ${what}: “${cap(t.ask, 50)}”`, by: 'you' })?.catch?.(() => null); // (round 132, versions132)
    t.status = 'kept';
    discard({ quiet: true });
    toast(`Kept: ${cap(words, 70)}`, { timeout: 6000, action: { label: 'Undo', fn: () => undo().catch(err) } });
    return `Kept ${words}. One Undo (↶, /undo-edit or /takes undo) puts the scene back.`;
  }
  async function keep(which) {
    const t = T;
    if (!t) throw new Error('No takes to keep (/takes <what to try>).');
    const i = typeof which === 'number' ? which : C.LETTERS.indexOf(String(which).trim().toUpperCase().slice(0, 1));
    const h = t.crew.helpers[i];
    if (!h) throw new Error('Which take? A, B or C.');
    if (!ready(h)) throw new Error(`Take ${C.LETTERS[i]} isn't ready${h.broken ? ' (its code has errors)' : h.changed ? '' : ' (it changed nothing yet)'}.`);
    if (t.crew.status === 'running') ThreeCrew.stop(); // the others stop: their copies go with the card
    return applyLayers(h.sketch.layers, h.selId, `take ${C.LETTERS[i]} (${labelOf(h, i)})`);
  }
  function mixes() {
    const t = T;
    if (!t || !['done', 'stopped'].includes(t.crew.status)) return [];
    if (!t.mixes) {
      try { t.mixes = C.mixPlan(t.crew.base.layers, t.crew.helpers.map((h) => (ready(h) ? h.sketch.layers : null)), { scan: ThreeTweaks.scan }); } catch { t.mixes = []; }
    }
    return t.mixes;
  }
  async function mix(a, b) {
    const t = T;
    const m = mixes().find((x) => x.a === a && x.b === b);
    if (!t || !m) throw new Error('No mix of those two takes (they need to differ only in slider values: one the colours, the other the motion).');
    const layers = C.mixLayers(t.crew.base.layers, t.crew.helpers.map((h) => h.sketch.layers), a, b, { scan: ThreeTweaks.scan, applyValues: ThreeTweaks.applyValues });
    if (!layers) throw new Error('Those takes can\'t be mixed.');
    return applyLayers(layers, t.crew.base.selId, m.label);
  }
  // one Undo: the step LabTxn noted (only while it's still the newest one: never someone else's later change)
  async function undo() {
    const k = last?.kept;
    if (!k) throw new Error('No kept take to undo.');
    const top = LabTxn.history().at(-1);
    if (!top || top.at !== k.at) throw new Error('Something changed the scene since: use ↶ in the dock.');
    await LabTxn.undoTurn();
    last.kept = null; last.status = 'undone';
    toast('The scene is back to before the take', { timeout: 2500 });
    return 'Undone: the scene is as it was before the take.';
  }
  const labelOf = (h, i) => (h.text && h.status !== 'running' ? C.labelOf(h.text, i) : C.TAKES[i].name);
  function describe(t = T || last) {
    if (!t) return 'No takes yet. /takes <what to try> makes 3 takes of it to compare live (cost shown first).';
    const rows = t.crew.helpers.map((h, i) => `${C.LETTERS[i]} · ${C.TAKES[i].name} · ${h.status}${ready(h) ? ` · ${labelOf(h, i)}` : ''}`);
    return `Takes of "${t.ask}" · ${t.status}${t.status === 'plan' ? ` · ${t.line} (/takes go)` : ''}\n${rows.join('\n')}`;
  }

  // ---------- live: the stages over the boxes, in step with the Lab's song ----------
  const SYNC_EPS = 0.2;
  function syncClocks() {
    const t = T;
    if (!t) return;
    const stages = t.crew.helpers.map((h) => h.stage).filter((s) => s?.clock);
    if (!stages.length) return;
    const P = window.ThreeLab?.director?.media;
    const labHere = P?.loaded && ThreeLab.scenes?.currentId() === t.sceneId;
    const ref = labHere ? { t: P.time, playing: Boolean(P.playing) } : stages[0].clock;
    for (const s of stages) {
      const c = s.clock;
      if (c.playing !== ref.playing) s.send({ type: 'media', cmd: ref.playing ? 'play' : 'pause' });
      if (Math.abs(c.t - ref.t) > SYNC_EPS) s.send({ type: 'media', cmd: 'seek', value: Math.max(0, ref.t + (ref.playing ? 0.03 : 0)) });
    }
    t.synced = { at: Date.now(), ref: Math.round(ref.t * 100) / 100, lab: Boolean(labHere), stages: stages.length };
  }

  // ---------- the card ----------
  const Card = (() => {
    let card = null; let timer = 0; let ticks = 0;
    const parts = {};
    const frameRatio = () => {
      const f = T?.crew.base.frame;
      const z = typeof ThreeMedia !== 'undefined' ? ThreeMedia.SIZES.find((x) => x.id === f && x.w) : null;
      return z ? z.w / z.h : 16 / 9;
    };
    function open() {
      close();
      const t = T;
      parts.cost = el('span', { class: 'tk-cost' });
      parts.stop = el('button', { type: 'button', class: 'ghost small tk-stop', text: '■ Stop', title: 'Stop the takes now (what they made stays, to keep or discard)', on: { click: () => stop() } });
      const head = el('div', { class: 'tk-head' },
        el('b', { text: '✦ 3 takes' }), el('span', { class: 'tk-ask', text: t.ask, title: t.ask }), el('span', { class: 'spacer' }), parts.cost, parts.stop,
        el('button', { type: 'button', class: 'ghost small tk-x', text: '✕', title: 'Discard the takes (your scene stays as it is) · Esc', on: { click: () => discard() } }));
      const pal = t.palette.length ? el('span', { class: 'tk-pal', title: 'The project\'s palette: the takes stay in it' }, ...t.palette.map((c) => el('i', { style: { background: c } }))) : null;
      parts.plan = el('div', { class: 'tk-plan' },
        el('div', { class: 'tk-what' },
          el('span', { text: `Three takes of your ask, each its own way: ${C.TAKES.map((x, i) => `${C.LETTERS[i]} ${x.name.toLowerCase()}`).join(' · ')}. ${t.project ? `They follow the project "${t.project}"${t.brief ? '\'s brief' : ''}${t.palette.length ? `${t.brief ? ' and' : '\'s'} palette` : ''}.` : ''} Your scene isn't touched until you keep one.` }),
          pal),
        el('div', { class: 'tk-go-row' },
          el('span', { class: 'tk-line', text: t.line }), el('span', { class: 'spacer' }),
          el('button', { type: 'button', class: 'ghost small', text: 'Cancel', on: { click: () => discard({ quiet: true }) } }),
          el('button', { type: 'button', class: 'primary small tk-go', text: 'Make 3 takes', on: { click: () => start() } })));
      parts.grid = el('div', { class: 'tk-grid' });
      parts.tiles = t.crew.helpers.map((h, i) => {
        const view = el('div', { class: 'tk-view', style: { aspectRatio: String(frameRatio()) } }, el('span', { class: 'tk-wait', text: 'waiting' }));
        const lab = el('span', { class: 'tk-label' });
        const st = el('span', { class: 'tk-st' });
        const btn = el('button', { type: 'button', class: 'tk-tile', dataset: { take: C.LETTERS[i] }, on: { click: () => { if (ready(h)) keep(i).catch(err); } } },
          view, el('span', { class: 'tk-cap' }, el('b', { text: C.LETTERS[i] }), el('span', { class: 'tk-name', text: C.TAKES[i].name }), st), lab);
        parts.grid.append(btn);
        return { btn, view, lab, st, h };
      });
      parts.mix = el('span', { class: 'tk-mixes' });
      parts.foot = el('div', { class: 'tk-foot' },
        el('span', { class: 'tk-hint', text: 'Click a take to keep it: one Undo puts your scene back. ✕ or Esc discards them.' }), el('span', { class: 'spacer' }), parts.mix,
        el('button', { type: 'button', class: 'ghost small tk-discard', text: 'Discard', on: { click: () => discard() } }));
      card = el('div', { class: 'tk-card', attrs: { role: 'dialog', 'aria-label': '3 takes' }, dataset: { feature: 'Lab › 3 takes' } }, head, parts.plan, parts.grid, parts.foot);
      document.body.append(card);
      document.addEventListener('keydown', onKey, true);
      window.addEventListener('resize', place);
      paint();
      timer = setInterval(tick, 400);
    }
    function onKey(e) {
      if (e.key !== 'Escape' || !card || e.defaultPrevented) return;
      if (document.querySelector('.ctx-menu, .modal-back, dialog[open]')) return;
      e.preventDefault(); e.stopPropagation();
      discard();
    }
    function tick() {
      if (!card || !T) return;
      ticks += 1;
      paint();
      place();
      if (ticks % 4 === 0) syncClocks();
    }
    // each take's stage laid over its box (scaled to fit; the stage's page doesn't take the pointer)
    function place() {
      if (!card || !T) return;
      for (const p of parts.tiles) {
        const host = p.h.stage?.host;
        if (!host) continue;
        const r = p.view.getBoundingClientRect(); const w = host.offsetWidth || 1; const hh = host.offsetHeight || 1;
        const k = Math.min(r.width / w, r.height / hh);
        host.classList.add('tk-stage-on');
        const tf = `translate(${Math.round(r.left + (r.width - w * k) / 2)}px, ${Math.round(r.top + (r.height - hh * k) / 2)}px) scale(${Math.round(k * 1000) / 1000})`;
        if (host.style.transform !== tf) host.style.transform = tf;
      }
    }
    const setText = (n, s) => { if (n && n.textContent !== s) n.textContent = s; };
    function paint() {
      const t = T;
      if (!card || !t) return;
      const c = t.crew;
      if (t.status === 'running' && c.status !== 'running') t.status = c.status === 'stopped' || t.stopping ? 'stopped' : 'done';
      card.dataset.status = t.status;
      parts.plan.hidden = t.status !== 'plan';
      parts.stop.hidden = t.status !== 'running';
      const spent = c.helpers.reduce((s, h) => s + (h.real ? h.real.input + h.real.output : h.estIn + h.estOut), 0);
      setText(parts.cost, t.status === 'plan' ? '' : `${spent >= 1000 ? `${(spent / 1000).toFixed(1)}k` : spent} tokens${c.helpers.every((h) => h.real) ? '' : ' ≈'}`);
      parts.tiles.forEach((p, i) => {
        const h = p.h;
        const st = h.status === 'waiting' ? (t.status === 'plan' ? '' : 'starting…') : h.status === 'running' ? `◌ ${h.tool || 'thinking'}` : h.status === 'done' ? (h.broken ? '⚠ errors' : h.changed ? '✓' : 'no change') : h.status === 'budget' ? '✓ (budget)' : h.status;
        setText(p.st, st);
        setText(p.lab, h.status === 'running' || h.status === 'waiting' ? (t.status === 'plan' ? cap(C.TAKES[i].angle.split(':')[1] || '', 90) : '') : labelOf(h, i));
        p.btn.disabled = !ready(h);
        p.btn.classList.toggle('ready', ready(h));
        p.btn.title = ready(h) ? `Keep take ${C.LETTERS[i]}: it becomes your scene (one Undo puts it back)` : '';
        const w = p.view.querySelector('.tk-wait');
        if (w) w.hidden = Boolean(h.stage?.host);
      });
      const ended = ['done', 'stopped'].includes(t.status);
      const ms = ended ? mixes() : [];
      const key = ms.map((m) => `${m.a}${m.b}`).join();
      if (parts.mix.dataset.k !== key) {
        parts.mix.dataset.k = key;
        parts.mix.replaceChildren(...ms.slice(0, 2).map((m) => el('button', { type: 'button', class: 'ghost small tk-mix', text: `Mix: ${m.label.replace(/^Take /, '')}`, title: `${m.label}: kept as one Undo step`, on: { click: () => mix(m.a, m.b).catch(err) } })));
      }
      setText(card.querySelector('.tk-hint'), t.status === 'plan' ? 'Nothing runs until you click Make 3 takes.' : t.status === 'running' ? 'The takes are being made on copies: your scene is untouched. ■ Stop works any time.' : 'Click a take to keep it: one Undo puts your scene back. ✕ or Esc discards them.');
    }
    function close() {
      clearInterval(timer); timer = 0; ticks = 0;
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', place);
      for (const p of parts.tiles || []) p.h.stage?.host?.classList.remove('tk-stage-on');
      card?.remove(); card = null; parts.tiles = [];
    }
    return { open, close, paint, place, get el() { return card; } };
  })();

  // ---------- the button beside Send ----------
  function paintBtn(agentId, v, chat) {
    if (!v?.form || !v.sendBtn) return;
    const want = Boolean(chat && (isDirector(H.agent(agentId)) || linked(chat.id)));
    let b = v.tkBtn;
    v.tkChat = chat?.id || null; // the chat this view shows (a project's own chat surface keeps views of its own)
    if (!want) { if (b) b.hidden = true; return; }
    if (!b || !b.isConnected) {
      b = el('button', { type: 'button', class: 'ghost tk-btn', text: '✦ 3 takes', title: 'Three takes of what you typed, side by side and live: compare, then keep one (cost shown first)', dataset: { feature: 'Lab › 3 takes' },
        on: { click: (e) => { e.preventDefault(); fromComposer(agentId, v).catch(err); } } });
      v.form.insertBefore(b, v.sendBtn);
      v.tkBtn = b;
    }
    b.hidden = false;
  }
  async function fromComposer(agentId, v) {
    const chatId = v.tkChat || H.activeChat?.[agentId] || null;
    if (T && Card.el && T.chatId === chatId && !v.input.value.trim()) return; // already open
    const ask = v.input.value.trim();
    if (!ask) { toast('Type what to try first (e.g. "make the glow more aggressive"), then ✦ 3 takes', { timeout: 3500 }); v.input.focus(); return; }
    await plan(chatId, ask);
    v.input.value = '';
    v.input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (typeof Native !== 'undefined' && Native.hooks?.render) {
    Native.hooks.render.push((agentId, v, chat) => { try { paintBtn(agentId, v, chat); } catch (e) { console.warn('takes button', e); } });
    // the chats already on screen when this loads
    for (const a of (typeof H !== 'undefined' && H.agents?.()) || []) {
      const v = Native.view(a.id); const id = H.activeChat?.[a.id];
      if (v && id) Native.load(id).then((chat) => paintBtn(a.id, v, chat)).catch(() => {});
    }
  }

  // ---------- /takes ----------
  if (typeof Commands !== 'undefined' && !Commands.get('takes')) {
    Commands.register({
      name: 'takes', area: AREA, args: '<what to try> | go | stop | keep A|B|C | discard | undo | status',
      desc: '✦ 3 takes: three takes of a change to this chat\'s Lab scene, side by side and live; keep one (cost shown first)',
      examples: ['/takes make the glow more aggressive', '/takes try a different look for the chorus', '/takes go', '/takes keep B', '/takes undo'],
      keywords: 'three takes variations options alternatives compare side by side pick try versions',
      undo: '/takes undo',
      complete: (a) => [{ value: 'go', hint: 'make the takes you were shown' }, { value: 'stop', hint: 'stop now' }, { value: 'keep ', hint: 'A, B or C' }, { value: 'discard', hint: 'drop them; the scene stays' }, { value: 'undo', hint: 'back to before the take' }, { value: 'status' }].filter((x) => !a.trim() || x.value.startsWith(a.trim().toLowerCase())),
      run: async (args, ctx) => {
        const w = String(args || '').trim();
        const chatId = ctx?.chatId || (ctx?.agentId && H.activeChat?.[ctx.agentId]) || null;
        if (!w || /^(status|list)$/i.test(w)) return describe();
        if (/^(go|start|yes|ok)$/i.test(w)) return start() ? 'Making 3 takes.' : 'No takes waiting for an OK (/takes <what to try>).';
        if (/^stop$/i.test(w)) return stop() ? 'Stopping the takes.' : 'No takes are being made.';
        if (/^(discard|cancel|close)$/i.test(w)) return discard({ quiet: true }) ? 'Discarded: your scene is as it was.' : 'No takes open.';
        if (/^undo$/i.test(w)) return undo();
        if (/^(keep|use|pick)\b/i.test(w)) return keep(w.split(/\s+/)[1] || '');
        const t = await plan(chatId, w);
        return `3 takes of "${t.ask}" ready to make: ${t.line}. Click Make 3 takes on the card (or /takes go).`;
      },
    });
  }

  return {
    plan, start, stop, discard, keep, mix, mixes, undo, describe,
    current: () => T, last: () => last, get card() { return Card.el; },
    _test: { syncClocks, place: () => Card.place(), paintBtn },
  };
})();
window.LabTakes = LabTakes;
