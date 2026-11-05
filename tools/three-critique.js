// ✦ Critique this (round 130, critique130): the AI looks at the Lab scene and suggests 3 concrete improvements as
// chips, in the director's dock. Built on what the Lab already has (docs/upgrades/critique130.md):
//   · the pictures: the Lab's own contact sheet (ThreeLab.director.contactSheet, the 🎞 Sheet button and
//     three_contact_sheet), at the song's key moments (CritiqueCore.moments: the drop, a quiet part, the peak) or a
//     few moments apart with no song: ONE picture, sent only on the owner's click
//   · the health: LabHealth's problems for the scene and 🩺 the scene doctor's free findings (SceneDoctor.check)
//   · the brief: ProjectBrief.get (mood, palette, steps, risks); the risks come back checked
//   · the fixes: a slider / keyframe change goes through HubBridge.call → LabTxn (one undo step: the dock's ↶ or the
//     chip's ↶ Undo); anything else is sent to the director as the owner's message (Native.sendText)
// Ways in: the dock's ✦ Critique button (director-dock.js), /lab-critique (and /critique alone: astra.js hands it
// here), Ctrl/⌘+K "Lab: Critique this scene". The card first shows what it will look at and the estimated cost;
// ✦ Critique it runs the one AI pass (a lean helper run, no tools, no memory) on the dock's AI: Claude or Astra.
//   LabCritique.open(agentId?) · run() · apply(i) · dismiss(i) · undo(i) · close() · state() · history(key?)
const LabCritique = (() => {
  const C = () => CritiqueCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const calm = (err) => (window.calmError ? calmError(err) : String(err?.message || err));
  const S = { card: null, phase: 'idle', agentId: null, key: null, est: null, line: '', items: [], risks: [], brief: null, rec: null, error: '', applied: new Map(), runs: 0, sheet: null, frames: [], sent: [] }; // sent: what went to the AI (the last 10: dev checks, /lab-critique history)

  // ---------- the store (kv 'three-critiques', synced with the projects) ----------
  let data = C().norm(null); let readOk = false; let readP = null;
  function ready() {
    readP ||= (async () => {
      const r = await window.hub.kvGet(C().STORE, null, { status: true }).catch(() => null);
      // a read that failed is never "empty": nothing is saved over it (datasafe)
      if (r?.state === 'ok' || r?.state === 'missing') { data = C().norm(r.value); readOk = true; } else readOk = false;
    })();
    return readP;
  }
  async function save() {
    if (!readOk) return; // unreadable: the history isn't saved over (the critique itself still works)
    try { await window.hub.kvSet(C().STORE, data); } catch (err) { console.warn('critique history', err); }
  }
  window.StoreAck?.hold?.(C().STORE, {
    name: 'Lab critiques', saver: () => save(), read: () => StoreAck.kv(C().STORE, null),
    apply: (d) => { if (!readOk) return false; data = C().norm(d); return true; },
  });

  // ---------- where it is ----------
  const dock = () => (typeof DirectorDock !== 'undefined' ? DirectorDock.entry('three') : null);
  const agentOf = (id) => H.agent(id || S.agentId || dock()?.agentId) || H.agents().find((a) => a.dock === 'three' && a.mode === 'native') || H.claudeAgent?.() || null;
  const chatOf = (a) => (a ? (H.chats || []).find((c) => c.id === H.activeChat?.[a.id]) || null : null);
  const who = (a, chat) => ((chat?.engine || a?.engine) === 'codex' ? 'Astra' : 'Claude');
  async function lab() {
    if (window.Lazy && !Lazy.loaded('lab')) await Lazy.load('lab');
    await ThreeLab.cmd({ show: true });
    for (let i = 0; i < 100 && !ThreeLab.director; i += 1) await sleep(100);
    if (!ThreeLab.director) throw new Error('The Lab is not ready yet.');
    return ThreeLab.director;
  }
  // the history's key: the project that holds the scene (its brief too), else the scene itself
  async function keyOf() {
    const sid = ThreeLab.scenes?.currentId?.() || 'none';
    try { if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects'); await window.Projects?.ready?.(); } catch { /* no projects: the scene's own history */ }
    const p = window.Projects?.ofItem?.('scene', sid)?.[0] || null;
    return p?.id ? `project:${p.id}` : `scene:${sid}`;
  }
  const keysOf = (key) => [key, `scene:${ThreeLab.scenes?.currentId?.() || 'none'}`]; // (the scene's own, from before it joined a project)

  // ---------- reading the scene (words and numbers; no picture) ----------
  function sceneRead(d) {
    const sid = ThreeLab.scenes.currentId();
    const sk = ThreeLab.scenes.get(sid) || {};
    let info = []; try { info = d.layers().layers || []; } catch { info = []; }
    const layers = info.map((L) => {
      let sliders = []; try { sliders = d.sliders(L.id)?.sliders || []; } catch { sliders = []; }
      return { id: L.id, name: L.name, visible: L.visible !== false, opacity: L.opacity ?? 1, keyframes: L.keyframes || null, sliders };
    });
    return { sid, scene: { name: sk.name || 'scene', frame: sk.size || sk.frame || null, palette: sk.palette || [], layers } };
  }
  function songOf(d) {
    try {
      const m = d.media;
      if (!m?.loaded || m.isClock) return null;
      const a = m.analysis || null;
      return a ? { analysis: a, bpm: a.bpm || null, duration: a.duration || m.duration || null } : null;
    } catch { return null; }
  }
  async function briefOf(key) {
    if (!key.startsWith('project:')) return null;
    try {
      if (window.Lazy && !Lazy.loaded('projectbrief')) await Lazy.load('projectbrief');
      return window.ProjectBrief?.get?.(key.slice(8)) || null;
    } catch { return null; }
  }
  function health(sid) {
    try { return (window.LabHealth?.state?.(sid) || []).slice(0, 4).map((r) => `${r.layer ? `${r.layer}: ` : ''}${r.message}${r.count > 1 ? ` (×${r.count})` : ''}`); } catch { return []; }
  }
  async function doctor() {
    try {
      if (window.Lazy && !Lazy.loaded('scenedoctor')) await Lazy.load('scenedoctor');
      const { findings } = await SceneDoctor.check();
      return (findings || []).slice(0, 4).map((f) => f.text);
    } catch { return []; }
  }

  // ---------- the card ----------
  function placeCard() {
    const e = dock();
    if (!S.card) return;
    if (e?.chips?.parentElement) { if (S.card.nextElementSibling !== e.chips) e.chips.before(S.card); } else if (!S.card.isConnected) document.body.append(S.card);
  }
  const btn = (text, cls, fn, title = '') => el('button', { type: 'button', class: cls, text, title, on: { click: () => Promise.resolve().then(fn).catch((err) => toast(calm(err), { type: 'error' })) } });
  function paint() {
    if (!S.card) S.card = el('div', { class: 'crit-card', dataset: { feature: 'Critique' } });
    const c = S.card;
    c.dataset.phase = S.phase;
    const a = agentOf();
    const head = el('div', { class: 'crit-head' }, el('b', { text: '✦ Critique' }), el('span', { class: 'crit-who', text: a ? who(a, chatOf(a)) : '' }), el('span', { class: 'spacer' }),
      btn('✕', 'crit-x ghost small', () => close(), 'Close the critique'));
    const body = [];
    if (S.phase === 'ready') {
      body.push(el('p', { class: 'crit-note', text: 'The AI looks at this scene once: one picture of 3–4 frames (the drop, a quiet part… or a few moments apart), the outline, the brief and the health, then suggests 3 improvements. Nothing is sent until you click.' }),
        el('p', { class: 'crit-cost', text: S.line || 'Estimating the cost…' }),
        el('div', { class: 'crit-acts' }, btn('✦ Critique it', 'crit-run primary small', () => run()), btn('Cancel', 'ghost small', () => close())));
    } else if (S.phase === 'running') {
      body.push(el('p', { class: 'crit-note crit-busy', text: S.status || 'Looking…' }));
    } else if (S.phase === 'error') {
      body.push(el('p', { class: 'crit-note crit-err', text: S.error }), el('div', { class: 'crit-acts' }, btn('Try again', 'ghost small', () => open(S.agentId))));
    } else if (S.phase === 'done') {
      S.items.forEach((it, i) => {
        if (it.state === 'dismissed') return;
        const ap = S.applied.get(i);
        const acts = it.state === 'applied'
          ? [el('span', { class: 'crit-done', text: '✓ Applied' }), ap ? btn('↶ Undo', 'crit-undo ghost small', () => undo(i), 'Put the scene back as it was before this change') : null]
          : it.state === 'sent' ? [el('span', { class: 'crit-done', text: '✓ Sent to the director' })]
            : [btn('Apply', 'crit-apply small', () => apply(i), it.fix.kind === 'message' ? 'Send this to the director as your message' : `Change it here, one undo step (${C().fixWords(it.fix)})`)];
        body.push(el('div', { class: `crit-chip crit-${it.fix.kind}${it.again ? ' again' : ''}`, dataset: { i: String(i), kind: it.fix.kind } },
          el('div', { class: 'crit-text' }, el('b', { class: 'crit-title', text: it.title }), it.why ? el('span', { class: 'crit-why', text: it.why }) : null,
            el('span', { class: 'crit-fix', text: `${C().fixWords(it.fix)}${it.again ? ' · said before' : ''}` })),
          el('div', { class: 'crit-acts' }, ...acts.filter(Boolean), btn('✕', 'crit-dismiss ghost small', () => dismiss(i), 'Hide this suggestion'))));
      });
      if (S.risks.length) body.push(el('div', { class: 'crit-risks' }, ...S.risks.map((r) => el('div', { class: `crit-risk ${r.ok ? 'ok' : 'warn'}`, text: `${r.ok ? '✓' : '⚠'} ${r.risk}${r.note ? ` · ${r.note}` : ''}` }))));
      if (S.items.every((it) => it.state === 'dismissed')) body.push(el('p', { class: 'crit-note', text: 'All hidden. ✦ Critique again any time.' }));
    }
    c.replaceChildren(head, ...body);
    placeCard();
  }

  // ---------- open: what it will look at, and the cost (no AI call) ----------
  async function open(agentId = null) {
    await ready();
    const d = await lab();
    if (agentId) S.agentId = agentId;
    const a = agentOf(agentId);
    if (!a) throw new Error('Add a native AI in Settings first.');
    S.agentId = a.id; S.phase = 'ready'; S.items = []; S.risks = []; S.applied = new Map(); S.error = ''; S.line = '';
    paint();
    try {
      const key = await keyOf();
      const { scene } = sceneRead(d);
      const song = songOf(d);
      const brief = await briefOf(key);
      const ms = song ? C().moments(song.analysis, 4) : null;
      const text = C().prompt({ outline: C().outline(scene), brief, song, frames: (ms || [{}, {}, {}, {}]).map((m, i) => ({ n: i + 1, t: m.t || 0, label: m.label })), history: C().recent(data, keysOf(key)), pictures: 1 });
      const chat = chatOf(a);
      S.est = C().estimate({ chars: text.length + 600, frames: ms?.length || 4 });
      S.line = C().costLine(S.est, who(a, chat), chat?.model || a.model || '', ms?.length || 4);
    } catch (err) { S.line = ''; console.warn('critique cost', err); }
    if (S.phase === 'ready') paint();
    return S.line;
  }

  // ---------- run: the one AI pass (only from the owner's click) ----------
  async function run() {
    if (S.phase === 'running') return null;
    await ready();
    const d = await lab();
    const a = agentOf();
    if (!a) throw new Error('Add a native AI in Settings first.');
    const chat = chatOf(a);
    const key = await keyOf();
    S.key = key; S.phase = 'running'; S.status = 'Taking the frames…'; S.applied = new Map(); paint();
    try {
      const { sid, scene } = sceneRead(d);
      const song = songOf(d);
      const ms = song ? C().moments(song.analysis, 4) : null;
      let sheet = null;
      S.sheetError = '';
      try { sheet = await d.contactSheet(ms ? { times: ms.map((m) => m.t), count: ms.length } : { count: 4 }); } catch (err) { S.sheetError = err.message; console.warn('critique sheet', err); }
      const frames = (sheet?.frames || []).map((f, i) => ({ n: f.n || i + 1, t: f.time ?? 0, label: ms?.[i]?.label || (ms ? '' : `+${(i * 0.6).toFixed(1)} s`) }));
      S.status = 'Reading the scene…'; paint();
      const path = sheet ? await window.hub.saveAttachment(`critique-${Date.now()}.jpg`, sheet.dataUrl.split(',')[1]) : null;
      S.sheet = path; S.frames = frames;
      const brief = await briefOf(key);
      const hist = C().recent(data, keysOf(key));
      const text = C().prompt({ outline: C().outline(scene), brief, song, frames, health: health(sid), doctor: await doctor(), history: hist, pictures: path ? 1 : 0 });
      S.status = `${who(a, chat)} is looking at ${frames.length || 'no'} frame${frames.length === 1 ? '' : 's'}…`; paint();
      S.runs += 1;
      if (window.Lazy && !Lazy.loaded('budget')) await Lazy.load('budget').catch(() => {});
      const q = { agentId: a.id, text, images: path ? [path] : [], options: { lean: true, helper: true, persona: C().PERSONA, effort: 'low', ...(a.engine === 'codex' ? { verbosity: 'low' } : {}) } };
      S.sent = [...S.sent, { agentId: q.agentId, text: q.text, images: q.images.slice(), options: { ...q.options }, at: Date.now() }].slice(-10);
      const r = await window.hub.askOnce(q)
        .catch((err) => ({ ok: false, error: err.message }));
      if (r?.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: a.id, usage: r.usage, source: 'critique' } }));
      if (!r?.ok) throw new Error(r?.error || 'The AI didn\'t answer.');
      S.raw = String(r.text || '').slice(0, 400);
      const got = C().parse(r.text, scene.layers);
      S.items = C().fresh(got.items, hist).map((it) => ({ ...it, state: 'shown' }));
      S.brief = brief;
      S.risks = got.risks.filter((x) => brief?.risks?.[x.i]).map((x) => ({ ...x, risk: brief.risks[x.i] }));
      S.rec = { at: Date.now(), by: who(a, chat), items: S.items.map((it) => ({ title: it.title, why: it.why, kind: it.fix.kind, state: 'shown' })), risks: S.risks.map((x) => ({ risk: x.risk, ok: x.ok, note: x.note })) };
      data = C().push(data, key, S.rec);
      await save();
      S.phase = 'done';
    } catch (err) { S.phase = 'error'; S.error = calm(err); }
    paint();
    return S.phase === 'done' ? S.items : null;
  }
  async function markState(i, state) {
    const it = S.items[i]; if (!it) return;
    it.state = state;
    if (S.rec && S.key) { data = C().mark(data, S.key, S.rec.at, i, state); await save(); }
  }

  // ---------- the chips ----------
  async function apply(i) {
    const it = S.items[i];
    if (!it || it.state !== 'shown') return false;
    // the director in the dock gets it (the critique may have come from the other AI)
    const a = H.agent(dock()?.agentId) || agentOf();
    if (it.fix.kind === 'message') {
      const msg = C().message(it);
      if (Native.pendingFor?.(a.id)) { Native.setDraft?.(a.id, msg); toast('The director is busy: the suggestion is in the chat box.'); }
      else await Native.send(a.id, msg);
      await markState(i, 'sent'); paint();
      return true;
    }
    // a plain slider / keyframe change: here, as ONE undo step (LabTxn: its own step, not part of the director's reply)
    await lab();
    const sid = ThreeLab.scenes.currentId();
    // a director busy on another scene (backstage) would catch a call made without a chat: wait for its reply
    if ((H.chats || []).some((c) => Native.isBusy?.(c.id) && window.ChatScenes?.linkOf?.(c.id) && ChatScenes.linkOf(c.id) !== sid)) throw new Error('A director is working on another scene: apply this after its reply.');
    const before = await LabTxn.snap(sid);
    const t0 = Date.now();
    const ctx = { chatId: `critique:${S.rec?.at || t0}:${i}` };
    const r = it.fix.kind === 'slider'
      ? await HubBridge.call('three_sliders', { layer: it.fix.layerId || it.fix.layer, set: it.fix.set }, ctx)
      : await HubBridge.call('three_keyframes', { layer: it.fix.layerId || it.fix.layer, property: it.fix.property, keys: it.fix.keys.map((k) => ({ time: k.time, value: k.value })) }, ctx);
    if (r?.ok === false) throw new Error(`It couldn't be applied: ${r.error}`);
    await sleep(50);
    const after = await LabTxn.snap(sid);
    S.applied.set(i, { sid, before, after, at: t0 });
    await markState(i, 'applied'); paint();
    toast(`✦ Applied: ${C().fixWords(it.fix)}`, { timeout: 5000, action: { label: 'Undo', fn: () => undo(i).catch((err) => toast(calm(err), { type: 'error' })) } });
    return true;
  }
  async function undo(i) {
    const ap = S.applied.get(i);
    if (!ap) return false;
    const sig = (t) => LabTxn._test.sigOf(t);
    const cur = await LabTxn.snap(ap.sid);
    if (sig(cur) !== sig(ap.after) && !(await Modal.confirm('Put the scene back?', 'The scene changed after this suggestion was applied. Putting it back to before takes the later changes too.', { ok: 'Put it back' }))) return false;
    const top = LabTxn.history().at(-1);
    if (top && top.at >= ap.at && sig(cur) === sig(ap.after)) await LabTxn.undoTurn({ force: true });
    else await LabTxn.restore(ap.before, { keepRefs: true });
    S.applied.delete(i);
    if (S.items[i]) S.items[i].state = 'shown';
    if (S.rec && S.key) { data = C().mark(data, S.key, S.rec.at, i, 'shown'); await save(); }
    paint();
    return true;
  }
  async function dismiss(i) { if (!S.items[i]) return; await markState(i, 'dismissed'); paint(); }
  function close() { S.phase = 'idle'; S.card?.remove(); S.card = null; }
  function state() {
    return { phase: S.phase, agentId: S.agentId, key: S.key, line: S.line, runs: S.runs, sheet: S.sheet, frames: S.frames.slice(), error: S.error, sent: S.sent.slice(), sheetError: S.sheetError || '', raw: S.raw || '',
      items: S.items.map((it) => ({ title: it.title, why: it.why, fix: it.fix, state: it.state, again: Boolean(it.again) })), risks: S.risks.slice() };
  }
  async function history(key = null) { await ready(); const k = key || S.key || await keyOf(); return C().recent(data, keysOf(k)); }

  // ---------- /lab-critique and Ctrl/⌘+K ----------
  if (typeof Commands !== 'undefined' && !Commands.get('lab-critique')) {
    Commands.register({ name: 'lab-critique', aliases: ['critique-scene'], area: 'Lab', args: '[run | history | close]',
      desc: 'The AI looks at the Lab scene once (a contact sheet at the song\'s key moments, the outline, the brief, the health) and suggests 3 concrete improvements as chips: Apply or ✕. Shows the cost first',
      keywords: 'critique review feedback improve suggestions art director scene look', run: async (args, ctx) => {
        const w = String(args || '').trim().toLowerCase();
        if (w === 'close') { close(); return null; }
        if (w === 'history') {
          const h = await history();
          return h.length ? `**Last critiques**\n${h.slice().reverse().map((r) => `- ${new Date(r.at).toLocaleString()} · ${r.by}: ${r.items.map((it) => `${it.title}${it.state !== 'shown' ? ` (${it.state})` : ''}`).join(' · ')}`).join('\n')}` : 'No critiques yet for this project.';
        }
        const ag = H.agent(ctx?.agentId);
        await open(ag && (ag.dock === 'three' || ag.threeTools) ? ag.id : null);
        if (w === 'run') await run();
        return null;
      } });
  }
  if (typeof AppUI !== 'undefined') AppUI.addAction?.('Lab: Critique this scene (the AI suggests 3 improvements)', () => open().catch((err) => toast(calm(err), { type: 'error' })));
  if (typeof Native !== 'undefined' && Native.hooks?.event) Native.hooks.event.push(() => { if (S.card) setTimeout(placeCard, 40); }); // a re-render of the dock: the card back above the chips

  ready();
  return { open, run, apply, dismiss, undo, close, state, history, get card() { return S.card; } };
})();
window.LabCritique = LabCritique;
