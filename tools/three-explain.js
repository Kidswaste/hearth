// ✦ Explain this layer (round 132, explain132): what a layer draws and how it moves, in plain words, then tweak it in
// plain words. A small card beside the ⚡ Sliders panel (docs/upgrades/explain132.md). Built on what the Lab has:
//   · the code: ThreeLab.director.codeOf (the editor's text for the selected layer), its sliders: director.sliders
//   · the AI: ONE lean helper run on the cheapest model (hub.askOnce, like the project brief: Autocompact.CHEAP), on the
//     dock's AI (Claude or Astra), only on the owner's click, with the cost shown first; no new tool, no prompt part
//   · the cache: kv 'three-explain', per layer by a hash of its code: reopening costs nothing until the code changes
//   · "Make it…": a slider / keyframe plan → HubBridge.call('three_sliders' / 'three_keyframes') under one chat id, so
//     LabTxn makes it ONE undo step (the dock's ↶, the card's ↶ Undo); anything bigger goes to the director as the
//     owner's message (Native.send, or the chat box while it's busy)
//   · "Turn into a slider": ExplainCore.sliderEdit → HubBridge.call('three_edit_code') (the existing code-edit path,
//     ONE undo step the same way)
// Ways in: a layer's right-click (tools/three-easy.js), the Sliders panel's ⋯ (tools/three-tweaks.js), /explain-layer,
// Ctrl/⌘+K "Lab: Explain this layer".
//   LabExplain.open({ layerId?, agentId? }) · run() · tweak(text) · undo() · slider(i) · close() · state()
const LabExplain = (() => {
  const C = () => ExplainCore;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const calm = (err) => (window.calmError ? calmError(err) : String(err?.message || err));
  const S = { card: null, phase: 'idle', layerId: null, name: '', hash: '', code: '', data: null, cached: false, line: '', tline: '', agentId: null, error: '', runs: 0, sent: [],
    tweak: { phase: 'idle', request: '', words: '', error: '', applied: null }, chips: new Map(), open: true };

  // ---------- the cache (kv 'three-explain'; a read that failed is never "empty") ----------
  let data = C().norm(null); let readOk = false; let readP = null;
  function ready() {
    readP ||= (async () => {
      const r = await window.hub.kvGet(C().STORE, null, { status: true }).catch(() => null);
      if (r?.state === 'ok' || r?.state === 'missing') { data = C().norm(r.value); readOk = true; } else readOk = false;
    })();
    return readP;
  }
  async function save() {
    if (!readOk) return; // unreadable: not saved over (the card still works, it just isn't cached)
    try { await window.hub.kvSet(C().STORE, data); } catch (err) { console.warn('explain cache', err); }
  }
  window.StoreAck?.hold?.(C().STORE, {
    name: 'Lab layer explanations', saver: () => save(), read: () => StoreAck.kv(C().STORE, null),
    apply: (d) => { if (!readOk) return false; data = C().norm(d); return true; },
  });

  // ---------- where it is ----------
  const dock = () => (typeof DirectorDock !== 'undefined' ? DirectorDock.entry('three') : null);
  const agentOf = (id) => H.agent(id || S.agentId || dock()?.agentId) || H.agents().find((a) => a.dock === 'three' && a.mode === 'native') || H.claudeAgent?.() || null;
  const chatOf = (a) => (a ? (H.chats || []).find((c) => c.id === H.activeChat?.[a.id]) || null : null);
  const who = (a) => ((chatOf(a)?.engine || a?.engine) === 'codex' ? 'Astra' : 'Claude');
  async function lab() {
    if (window.Lazy && !Lazy.loaded('lab')) await Lazy.load('lab');
    const c = await ThreeLab.cmd({ show: true });
    for (let i = 0; i < 100 && !ThreeLab.director; i += 1) await sleep(100);
    if (!ThreeLab.director) throw new Error('The Lab is not ready yet.');
    return { d: ThreeLab.director, c };
  }
  function layerNow(d, id = S.layerId) {
    const x = d.codeOf(id || null); // (none named: the selected layer)
    let sliders = []; try { sliders = d.sliders(x.id, null)?.sliders || []; } catch { sliders = []; }
    let keyed = []; try { const L = (d.layers().layers || []).find((l) => l.id === x.id); keyed = L?.keyframes && typeof L.keyframes === 'object' ? Object.keys(L.keyframes).map((k) => k.replace(/^s:/, '')) : []; } catch { keyed = []; }
    return { ...x, sliders: sliders.map((s) => ({ key: s.key, label: s.label, value: s.value, min: s.min, max: s.max })), keyed };
  }
  function songOf(d) {
    try {
      const m = d.media;
      if (!m?.loaded || m.isClock || !m.analysis) return null;
      const a = m.analysis;
      return { duration: a.duration || m.duration || null, bpm: a.bpm || null, sections: (a.sections || []).map((s) => ({ start: s.start, end: s.end, label: s.label || s.name || '', energy: s.energy ?? null })) };
    } catch { return null; }
  }
  const cheap = (a) => window.Autocompact?.CHEAP?.[a.engine] || null; // the cheapest model + effort (autocompact.js), like the brief
  async function ask(a, text) {
    if (window.Lazy && !Lazy.loaded('budget')) await Lazy.load('budget').catch(() => {});
    const ch = cheap(a);
    const q = { agentId: a.id, text, images: [], options: { lean: true, helper: true, persona: C().PERSONA, ...(ch ? { model: ch.model, effort: ch.effort } : { effort: 'low' }), ...(a.engine === 'codex' ? { verbosity: 'low' } : {}) } };
    S.sent = [...S.sent, { agentId: q.agentId, text: q.text, options: { ...q.options }, at: Date.now() }].slice(-10);
    const r = await window.hub.askOnce(q).catch((err) => ({ ok: false, error: err.message }));
    if (r?.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: a.id, usage: r.usage, source: 'explain layer' } }));
    if (!r?.ok) throw new Error(r?.error || 'The AI didn\'t answer.');
    return String(r.text || '');
  }
  const modelOf = (a) => cheap(a)?.model || '';

  // ---------- the card (beside the Sliders panel; folds to one line) ----------
  function placeCard() {
    if (!S.card) return;
    const slot = [...document.querySelectorAll('.tw-column .tw-slot')].find((x) => x.getClientRects().length) || document.querySelector('.tw-column .tw-slot');
    if (slot) { if (S.card.nextElementSibling !== slot) slot.before(S.card); } else if (!S.card.isConnected) document.body.append(S.card);
  }
  const btn = (text, cls, fn, title = '') => el('button', { type: 'button', class: cls, text, title, on: { click: (e) => { e.preventDefault(); Promise.resolve().then(fn).catch((err) => toast(calm(err), { type: 'error' })); } } });
  function paint() {
    if (!S.card) {
      S.card = el('details', { class: 'xpl-card', dataset: { feature: 'Explain layer' } });
      S.card.open = true;
      S.card.addEventListener('toggle', () => { S.open = S.card.open; });
    }
    const c = S.card;
    c.dataset.phase = S.phase;
    const a = agentOf();
    const head = el('summary', { class: 'xpl-head' }, el('b', { text: '✦ About' }), el('span', { class: 'xpl-name', text: S.name, title: S.name }), el('span', { class: 'xpl-who', text: a ? who(a) : '' }),
      btn('✕', 'xpl-x ghost small', () => close(), 'Close'));
    const body = [];
    if (S.phase === 'ready') {
      body.push(el('p', { class: 'xpl-note', text: 'The AI reads this layer\'s code once and says what it draws, which sliders matter and what could become a slider. Nothing is sent until you click.' }),
        el('p', { class: 'xpl-cost', text: S.line || 'Estimating the cost…' }),
        el('div', { class: 'xpl-acts' }, btn('✦ Explain it', 'xpl-run primary small', () => run()), btn('Cancel', 'ghost small', () => close())));
    } else if (S.phase === 'running') {
      body.push(el('p', { class: 'xpl-note xpl-busy', text: `${a ? who(a) : 'The AI'} is reading "${S.name}"…` }));
    } else if (S.phase === 'error') {
      body.push(el('p', { class: 'xpl-note xpl-err', text: S.error }), el('div', { class: 'xpl-acts' }, btn('Try again', 'ghost small', () => open({ layerId: S.layerId }))));
    } else if (S.phase === 'done' && S.data) {
      const x = S.data;
      body.push(el('p', { class: 'xpl-what', text: x.what }));
      if (x.sliders.length) body.push(el('div', { class: 'xpl-sec' }, el('span', { class: 'xpl-k', text: 'Sliders that matter' }), ...x.sliders.map((s) => el('span', { class: 'xpl-sl', text: `${s.key}${s.why ? ` · ${s.why}` : ''}` }))));
      if (x.hardcoded.length) {
        body.push(el('div', { class: 'xpl-sec xpl-hard' }, el('span', { class: 'xpl-k', text: 'Could be a slider' }), ...x.hardcoded.map((h, i) => {
          return h.done || S.chips.get(i) === 'added'
            ? el('span', { class: 'xpl-chip done', dataset: { i: String(i) }, text: `✓ ${h.label} is a slider` })
            : btn(`+ Turn into a slider: ${h.label} (${h.value})`, 'xpl-chip ghost small', () => slider(i), `${h.why ? `${h.why}. ` : ''}Line ${h.line}: ${h.text} becomes a tweak() slider (one code edit, one undo step)`);
        })));
      }
      if (x.parts.length) {
        const parts = el('details', { class: 'xpl-parts' }, el('summary', { text: `What each part does (${x.parts.length})` }),
          ...x.parts.map((p) => el('div', { class: 'xpl-part' }, el('span', { class: 'xpl-lines', text: p.lines ? `L${p.lines}` : '' }), el('span', { text: p.does }))));
        body.push(parts);
      }
      body.push(el('p', { class: 'xpl-cost', text: S.cached ? 'From the cache · 0 tokens (until the code changes)' : S.line }));
      // "Make it…"
      const t = S.tweak;
      const box = el('input', { type: 'text', class: 'xpl-input', placeholder: 'Make it… (e.g. slower and more blurry on the breaks)', value: t.request || '' });
      box.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); tweak(box.value).catch((err) => toast(calm(err), { type: 'error' })); } e.stopPropagation(); });
      body.push(el('div', { class: 'xpl-tweak' }, box, btn(t.phase === 'running' ? '…' : '✦ Tweak', 'xpl-go small primary', () => tweak(box.value), `One small AI pass (${S.tline || 'about 1k tokens'}): slider and keyframe changes land here as one undo step; anything bigger goes to the director`)));
      if (t.phase === 'running') body.push(el('p', { class: 'xpl-note xpl-busy', text: 'Working out the change…' }));
      else if (t.phase === 'applied') body.push(el('div', { class: 'xpl-res' }, el('span', { text: `✓ ${t.words}` }), t.applied ? btn('↶ Undo', 'xpl-undo ghost small', () => undo(), 'Put the layer back as it was') : null));
      else if (t.phase === 'undone') body.push(el('p', { class: 'xpl-note', text: '↶ Put back.' }));
      else if (t.phase === 'sent') body.push(el('p', { class: 'xpl-note', text: `✓ ${t.words}` }));
      else if (t.phase === 'error') body.push(el('p', { class: 'xpl-note xpl-err', text: t.error }));
    }
    c.replaceChildren(head, ...body);
    c.open = S.open;
    placeCard();
  }

  // ---------- open: the cache, or the cost (no AI call) ----------
  async function open({ layerId = null, agentId = null } = {}) {
    await ready();
    const { d, c } = await lab();
    try { c?.panel?.(true); } catch { /* the panel stays as it is */ }
    if (layerId) { try { d.selectLayer?.(layerId); } catch { /* by id below */ } }
    if (agentId) S.agentId = agentId;
    const a = agentOf(agentId);
    if (!a) throw new Error('Add a native AI in Settings first.');
    S.agentId = a.id;
    const L = layerNow(d, layerId);
    if (layerId && L.id !== layerId) throw new Error('That layer isn\'t in the scene on screen.');
    const h = C().hash(L.code);
    const same = S.layerId === L.id && S.hash === h && S.phase === 'done';
    S.layerId = L.id; S.name = L.name; S.code = L.code; S.hash = h; S.error = ''; S.open = true;
    if (!same) { S.tweak = { phase: 'idle', request: '', words: '', error: '', applied: null }; S.chips = new Map(); }
    const hit = C().lookup(data, L.id, h);
    S.tline = C().costLine(C().estimate({ chars: 900 + JSON.stringify(L.sliders).length, out: 150 }), who(a), modelOf(a));
    if (same) { paint(); return { cached: S.cached }; }
    if (hit) { S.data = hit.data; S.cached = true; S.phase = 'done'; S.line = ''; paint(); return { cached: true }; }
    S.data = null; S.cached = false; S.phase = 'ready';
    S.line = C().costLine(C().estimate({ chars: C().explainPrompt({ name: L.name, code: L.code, sliders: L.sliders }).length, out: 550 }), who(a), modelOf(a));
    paint();
    return { cached: false, line: S.line };
  }

  // ---------- run: the one explain pass (only from the owner's click) ----------
  async function run() {
    if (S.phase === 'running' || !S.layerId) return null;
    const { d } = await lab();
    const a = agentOf();
    S.phase = 'running'; paint();
    try {
      const L = layerNow(d);
      S.runs += 1;
      const text = await ask(a, C().explainPrompt({ name: L.name, code: L.code, sliders: L.sliders }));
      S.raw = text.slice(0, 400);
      const x = C().parseExplain(text, { code: L.code, sliders: L.sliders });
      S.data = x; S.hash = C().hash(L.code); S.code = L.code; S.cached = false; S.chips = new Map();
      data = C().put(data, { id: L.id, hash: S.hash, at: Date.now(), by: who(a), name: L.name, data: x });
      await save();
      S.phase = 'done';
    } catch (err) { S.phase = 'error'; S.error = calm(err); }
    paint();
    return S.phase === 'done' ? S.data : null;
  }

  // a director busy on another scene (backstage) would catch a call made without a chat: wait for its reply
  const busyElsewhere = (sid) => (H.chats || []).some((c) => Native.isBusy?.(c.id) && window.ChatScenes?.linkOf?.(c.id) && ChatScenes.linkOf(c.id) !== sid);

  // ---------- "Make it…": a plan applied here (one undo step) or the director ----------
  async function tweak(text) {
    const request = String(text || '').trim().replace(/^make it\s+/i, '');
    if (!request) { toast('Say how: "slower", "more blurry on the breaks"…', { timeout: 2500 }); return null; }
    if (S.tweak.phase === 'running' || !S.data) return null;
    const { d } = await lab();
    const a = agentOf();
    S.tweak = { phase: 'running', request, words: '', error: '', applied: null }; paint();
    try {
      const L = layerNow(d);
      const song = songOf(d);
      const reply = await ask(a, C().tweakPrompt({ name: L.name, request, what: S.data.what, sliders: L.sliders, keyed: L.keyed, song }));
      const plan = C().parsePlan(reply, L.sliders, { duration: song?.duration, request });
      if (plan.kind === 'director') {
        const msg = C().directorMessage(L.name, request, plan.text);
        const to = H.agent(dock()?.agentId) || a;
        if (Native.pendingFor?.(to.id)) { Native.setDraft?.(to.id, msg); S.tweak = { ...S.tweak, phase: 'sent', words: 'The director is busy: it\'s in the chat box.' }; }
        else { await Native.send(to.id, msg); S.tweak = { ...S.tweak, phase: 'sent', words: 'Sent to the director (bigger than the sliders can do).' }; }
        S.tweak.plan = plan;
        paint();
        return { kind: 'director', text: msg };
      }
      const sid = ThreeLab.scenes.currentId();
      if (busyElsewhere(sid)) throw new Error('A director is working on another scene: try this after its reply.');
      const before = await LabTxn.snap(sid);
      const at = Date.now();
      const ctx = { chatId: `explain:${at}` }; // the calls under one chat id: ONE undo step (LabTxn)
      if (Object.keys(plan.set).length) {
        const r = await HubBridge.call('three_sliders', { layer: L.id, set: plan.set }, ctx);
        if (r?.ok === false) throw new Error(`It couldn't be applied: ${r.error}`);
      }
      for (const g of plan.keys) {
        const r = await HubBridge.call('three_keyframes', { layer: L.id, property: g.property, keys: g.keys }, ctx);
        if (r?.ok === false) { await LabTxn.restore(before, { keepRefs: true }); throw new Error(`It couldn't be applied: ${r.error}`); }
      }
      await sleep(50);
      const after = await LabTxn.snap(sid);
      const words = C().planWords(plan, L.sliders);
      S.tweak = { ...S.tweak, phase: 'applied', words: `${plan.say ? `${plan.say} · ` : ''}${words}`, applied: { sid, before, after, at }, plan };
      paint();
      toast(`✦ ${words}`, { timeout: 5000, action: { label: 'Undo', fn: () => undo().catch((err) => toast(calm(err), { type: 'error' })) } });
      return plan;
    } catch (err) { S.tweak = { ...S.tweak, phase: 'error', error: calm(err) }; paint(); return null; }
  }
  // the card's ↶ Undo (what = 'tweak' | 'slider'): the same step the dock's ↶ takes back
  async function undo(what = 'tweak') {
    const ap = what === 'slider' ? S.lastSlider : S.tweak.applied;
    if (!ap) return false;
    const sig = (t) => LabTxn._test.sigOf(t);
    const cur = await LabTxn.snap(ap.sid);
    if (sig(cur) !== sig(ap.after) && !(await Modal.confirm('Put the layer back?', 'The scene changed after this. Putting it back takes the later changes too.', { ok: 'Put it back' }))) return false;
    const top = LabTxn.history().at(-1);
    if (top && top.at >= ap.at && sig(cur) === sig(ap.after)) await LabTxn.undoTurn({ force: true });
    else await LabTxn.restore(ap.before, { keepRefs: true });
    if (what === 'slider') {
      S.lastSlider = null; S.chips.delete(ap.i);
      try { S.hash = C().hash(layerNow(ThreeLab.director).code); const hit = C().lookup(data, S.layerId, S.hash); if (hit) S.data = hit.data; } catch { /* gone */ }
    }
    else S.tweak = { ...S.tweak, phase: 'undone', applied: null };
    paint();
    return true;
  }

  // ---------- "Turn into a slider": one code edit through the director's path (one undo step) ----------
  async function slider(i) {
    const h = S.data?.hardcoded?.[i];
    if (!h || S.chips.get(i) === 'added') return false;
    const { d } = await lab();
    const L = layerNow(d);
    if (C().hash(L.code) !== S.hash) throw new Error('The layer\'s code changed since it was explained: ✦ Explain it again first.');
    const { code: next, key } = C().sliderEdit(L.code, h);
    const sid = ThreeLab.scenes.currentId();
    if (busyElsewhere(sid)) throw new Error('A director is working on another scene: try this after its reply.');
    const before = await LabTxn.snap(sid);
    const at = Date.now();
    const lines = L.code.split('\n').length;
    const r = await HubBridge.call('three_edit_code', { layer: L.id, edits: [{ lines: [1, lines], replace: next }], safe: true, wait: 2 }, { chatId: `explain:${at}` });
    if (r?.ok === false) throw new Error(`The slider couldn't be added: ${r.error}`);
    await sleep(60);
    const after = await LabTxn.snap(sid);
    const ok = (d.sliders(L.id, null)?.sliders || []).some((s) => s.key === key);
    if (!ok) throw new Error('The edit didn\'t take (the layer was put back).');
    S.chips.set(i, 'added');
    S.lastSlider = { sid, before, after, at, i };
    // our own edit: the explanation still holds, so it is carried over to the new code (with this value marked as a
    // slider), at no cost; the old code keeps its entry, so an undo finds it again. Any other code change asks again.
    S.hash = C().hash(layerNow(d, L.id).code);
    S.data = { ...S.data, hardcoded: S.data.hardcoded.map((x, k) => (k === i ? { ...x, done: true } : x)) };
    data = C().put(data, { id: L.id, hash: S.hash, at: Date.now(), by: 'carried', name: L.name, data: S.data });
    await save();
    paint();
    toast(`✦ "${h.label}" is a slider now (${key})`, { timeout: 5000, action: { label: 'Undo', fn: () => undo('slider').catch((err) => toast(calm(err), { type: 'error' })) } });
    return key;
  }

  function close() { S.phase = 'idle'; S.card?.remove(); S.card = null; }
  function state() {
    return { phase: S.phase, layerId: S.layerId, name: S.name, hash: S.hash, cached: S.cached, line: S.line, tline: S.tline, runs: S.runs, sent: S.sent.slice(), error: S.error, raw: S.raw || '', data: S.data,
      tweak: { phase: S.tweak.phase, words: S.tweak.words, error: S.tweak.error, plan: S.tweak.plan || null, applied: Boolean(S.tweak.applied) }, chips: Object.fromEntries(S.chips) };
  }

  // ---------- /explain-layer and Ctrl/⌘+K ----------
  if (typeof Commands !== 'undefined' && !Commands.get('explain-layer')) {
    Commands.register({ name: 'explain-layer', aliases: ['explain-this-layer'], area: 'Lab', args: '[run | make it … | close]',
      desc: 'What the selected Lab layer draws and how it moves, in plain words, which sliders matter and what could become a slider; then "Make it…" in plain words. Shows the cost first',
      keywords: 'explain layer what does this do describe understand code sliders tweak plain words', run: async (args) => {
        const w = String(args || '').trim();
        if (/^close$/i.test(w)) { close(); return null; }
        await open();
        if (/^run$/i.test(w) && S.phase === 'ready') await run();
        else if (/^make it\s+/i.test(w) && S.phase === 'done') await tweak(w);
        return null;
      } });
  }
  if (typeof AppUI !== 'undefined') AppUI.addAction?.('Lab: Explain this layer (what it does, in plain words)', () => open().catch((err) => toast(calm(err), { type: 'error' })));

  ready();
  return { open, run, tweak, undo, slider, close, state, get card() { return S.card; } };
})();
window.LabExplain = LabExplain;
