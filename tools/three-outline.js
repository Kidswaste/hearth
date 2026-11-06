// 🗂 The scene outline (round 136, outline136): the Layers list's ⋯ (one small button in its head, no new row) and a
// group's "Fade, move & key…" card. Lazy group "outline" (after "lab"); docs/upgrades/outline136.md.
//   · ⋯ › 🔍 Find a layer (Ctrl/⌘+F in the list), ✦ Name these for me (free: OutlineCore reads each layer's code and
//     sliders), ✦ Name them with AI… (one small helper pass, the cost shown first, nothing sent before the click),
//     📁 Group the picked layers, Move up / down (Alt+↑ / ↓), fold / unfold every group, Show every layer
//   · a group's right-click › Fade, move & key…: a small card that fades (each layer's own opacity scaled), moves (each
//     layer's own place offset) and ◆ keys the whole group at the playhead. Each release is one undo step.
// Every change goes through LabGroups (tools/three-groups.js): one step in the Lab's own Ctrl/⌘+Z.
const LabOutline = (() => {
  const C = () => OutlineCore;
  const host = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.groupsHost : null);
  const G = () => LabGroups;
  const GC = () => LayerGroups;
  const stats = { local: 0, ai: 0, cards: 0 };
  const sent = []; // the AI passes sent (a check reads them)
  const err = (m) => toast(m, { type: 'error', timeout: 4000 });

  // ---------- ⋯ the Layers list's menu ----------
  function menu(anchor) {
    const h = host();
    if (!h?.sketchId()) { err('Open a scene in the Lab first'); return; }
    const Ls = h.layers();
    const gs = GC().groups(Ls);
    const picked = h.picked();
    const solo = GC().soloId(Ls);
    const items = [
      'Tidy the layers',
      { label: '🔍 Find a layer…', hint: 'Ctrl/⌘+F in the list', action: () => h.find('') },
      { label: '✦ Name these for me', hint: picked.length ? `the ${picked.length} picked · free` : 'free, on this computer', action: () => nameLocal() },
      { label: '✦ Name them with AI…', hint: 'one small pass · the cost first', action: () => nameAi() },
      '-',
      { label: picked.length > 1 ? `📁 Group the ${picked.length} picked layers` : '📁 Group layers', hint: 'Ctrl/⌘+click a few, then Ctrl/⌘+G', action: () => (picked.length ? G().groupPicked() : toast('Ctrl/⌘+click (or Shift+click) a few layers first, then Ctrl/⌘+G', { timeout: 4000 })) },
      { label: '↑ Move up', hint: 'Alt+↑', action: () => G().nudge(1) },
      { label: '↓ Move down', hint: 'Alt+↓', action: () => G().nudge(-1) },
      gs.length ? { label: gs.every((g) => g.closed) ? '▾ Unfold every group' : '▸ Fold every group', action: () => foldAll(!gs.every((g) => g.closed)) } : null,
      solo ? { label: 'Show every layer', hint: 'solo off', action: () => G().solo(null) } : null,
    ].filter(Boolean);
    const r = anchor.getBoundingClientRect();
    showMenu(r.left, r.bottom + 4, items);
  }
  function foldAll(closed) {
    return G().op(closed ? 'Folded every group' : 'Unfolded every group', (Ls) => { for (const g of GC().groups(Ls)) GC().fold(Ls, g.id, closed); return true; }, { say: false });
  }

  // ---------- ✦ Name these for me ----------
  const rowsOf = (Ls) => Ls.map((L) => ({ ...L, sliders: (host().sliders(L.id) || []).map((c) => c.label || c.key) }));
  // which layers: the picked ones, else those with names like "Layer 3"; none of those: every layer (asked first)
  async function targets({ all = null } = {}) {
    const h = host();
    const Ls = h.layers();
    const picked = h.picked();
    if (picked.length) return { ids: picked };
    if (all != null) return { all };
    if (Ls.some((L) => C().isGeneric(L.name))) return {};
    const ok = await Modal.confirm('Name every layer?', 'Every layer has a name of its own already. ✦ Name these for me can rename all of them from what they show (one Ctrl/⌘+Z puts the names back).', { ok: 'Rename them all' });
    return ok ? { all: true } : null;
  }
  async function nameLocal(opts = {}) {
    const h = host();
    if (!h?.sketchId()) { err('Open a scene in the Lab first'); return 0; }
    h.persist?.(); // the code in the editor is in its layer
    const t = await targets(opts);
    if (!t) return 0;
    const pairs = C().plan(rowsOf(h.layers()), t);
    stats.local += 1;
    const n = G().names(pairs, pairs.length === 1 ? null : `✦ Named ${pairs.length} layers`);
    toast(n ? `✦ Named ${n} layer${n === 1 ? '' : 's'}: ${pairs.slice(0, 4).map(([, x]) => `"${x}"`).join(', ')}${n > 4 ? '…' : ''}` : 'Nothing to rename: these names already say what they show', { timeout: 4500, ...(n ? { action: { label: 'Undo', fn: () => G().undo() } } : {}) });
    return n;
  }

  // ---------- ✦ Name them with AI (only on a click, the cost shown first) ----------
  const dock = () => (typeof DirectorDock !== 'undefined' ? DirectorDock.entry('three') : null);
  const agentOf = () => H.agent(dock()?.agentId) || H.agents().find((a) => a.dock === 'three' && a.mode === 'native') || H.claudeAgent?.() || null;
  const chatOf = (a) => (a ? (H.chats || []).find((c) => c.id === H.activeChat?.[a.id]) || null : null);
  const who = (a) => ((chatOf(a)?.engine || a?.engine) === 'codex' ? 'Astra' : 'Claude');
  const cheap = (a) => window.Autocompact?.CHEAP?.[a?.engine] || null;
  function aiPlan(t) {
    const h = host();
    const Ls = rowsOf(h.layers()).map((L) => ({ ...L, group: L.group?.name || null }));
    const want = t.ids ? new Set(t.ids) : null;
    const list = Ls.filter((L) => !L.precomp && (want ? want.has(L.id) : t.all || C().isGeneric(L.name)));
    return { list, prompt: list.length ? C().prompt(list) : '' };
  }
  // → the cost line (what the confirm shows), or null
  function aiCost(opts = { all: true }) {
    const a = agentOf();
    if (!a || !host()?.sketchId()) return null;
    const { list, prompt } = aiPlan(host().picked().length ? { ids: host().picked() } : opts);
    return list.length ? C().costLine(C().estimateCost(prompt, list.length), who(a), cheap(a)?.model || '') : null;
  }
  async function nameAi({ confirm = true, all = null } = {}) {
    const h = host();
    const a = agentOf();
    if (!h?.sketchId()) { err('Open a scene in the Lab first'); return 0; }
    if (!a) { err('No AI to ask: set up Claude or Astra first.'); return 0; }
    h.persist?.();
    const t = h.picked().length ? { ids: h.picked() } : { all: all ?? !h.layers().some((L) => C().isGeneric(L.name)) };
    const { list, prompt } = aiPlan(t);
    if (!list.length) { toast('No layer to name', { timeout: 2000 }); return 0; }
    const line = C().costLine(C().estimateCost(prompt, list.length), who(a), cheap(a)?.model || '');
    if (confirm && !(await Modal.confirm(`✦ Name ${list.length} layer${list.length === 1 ? '' : 's'} with AI?`, `${line}. Nothing is sent until you click Name them; ✦ Name these for me does it for free.`, { ok: 'Name them' }))) return 0;
    const sid = h.sketchId();
    try {
      if (window.Lazy && !Lazy.loaded('budget')) await Lazy.load('budget').catch(() => {});
      const ch = cheap(a);
      const q = { agentId: a.id, text: prompt, images: [], options: { lean: true, helper: true, persona: C().PERSONA, ...(ch ? { model: ch.model, effort: ch.effort } : { effort: 'low' }), ...(a.engine === 'codex' ? { verbosity: 'low' } : {}) } };
      sent.push({ agentId: a.id, text: prompt, options: { ...q.options }, line, at: Date.now() }); if (sent.length > 5) sent.shift();
      stats.ai += 1;
      const tId = toast('✦ Naming the layers…', { timeout: 30000 });
      const r = await window.hub.askOnce(q).catch((e) => ({ ok: false, error: e.message }));
      try { tId?.remove?.(); } catch { /* gone */ }
      if (r?.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: a.id, usage: r.usage, source: 'layer names' } }));
      if (!r?.ok) throw new Error(r?.error || 'The AI didn\'t answer.');
      if (h.sketchId() !== sid) return 0; // another scene on screen now
      const pairs = C().parse(r.text, list);
      const n = G().names(pairs, `✦ AI named ${pairs.length} layers`);
      toast(n ? `✦ Named ${n} layer${n === 1 ? '' : 's'}` : 'No new names came back', { timeout: 4000, ...(n ? { action: { label: 'Undo', fn: () => G().undo() } } : {}) });
      return n;
    } catch (e) { err(window.calmError ? calmError(e) : e.message); return 0; }
  }

  // ---------- a group faded, moved and keyed as one ----------
  let card = null;
  function closeCard() { card?.el.remove(); card = null; removeEventListener('keydown', esc, true); }
  const esc = (e) => { if (e.key === 'Escape' && card) { e.preventDefault(); e.stopPropagation(); closeCard(); } };
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const r3 = (v) => Math.round(v * 1000) / 1000;
  function groupCard(id, { anchor = null } = {}) {
    const h = host();
    const g = GC().find(h?.layers() || [], id);
    if (!g) { err('That group is gone'); return null; }
    closeCard();
    stats.cards += 1;
    const ids = () => GC().members(h.layers(), id).map((L) => L.id);
    // the values the card works from: each layer's own opacity and place as they show at the playhead now
    const base = Object.fromEntries(ids().map((lid) => [lid, { opacity: h.value(lid, 'opacity') ?? 1, x: h.value(lid, 'x') ?? 0, y: h.value(lid, 'y') ?? 0 }]));
    let start = null; // the snapshots when a drag starts (its undo)
    const range = (label, min, max, step, value, fmt) => {
      const r = el('input', { type: 'range', min, max, step, value: String(value), attrs: { 'aria-label': label } });
      const out = el('span', { class: 'ol-v', text: fmt(value) });
      return { r, out, row: el('label', { class: 'ol-row' }, el('span', { class: 'ol-k', text: label }), r, out), fmt };
    };
    const fade = range('Fade', 0, 100, 1, 100, (v) => `${Math.round(v)}%`);
    const mx = range('Move X', -100, 100, 0.5, 0, (v) => `${v}%`);
    const my = range('Move Y', -100, 100, 0.5, 0, (v) => `${v}%`);
    const patchFor = (lid) => {
      const b = base[lid] || { opacity: 1, x: 0, y: 0 };
      return { opacity: r3(clamp01(b.opacity * Number(fade.r.value) / 100)), x: r3(b.x + Number(mx.r.value)), y: r3(b.y + Number(my.r.value)) };
    };
    const apply = (live, only) => {
      for (const lid of ids()) { const p = patchFor(lid); const one = only.reduce((o, k) => ({ ...o, [k]: p[k] }), {}); h.edit(lid, one, { live }); }
    };
    const wire = (R, keys, what) => {
      R.r.addEventListener('input', () => { if (!start) start = G().snaps(id); R.out.textContent = R.fmt(Number(R.r.value)); apply(true, keys); });
      R.r.addEventListener('change', () => { if (!start) start = G().snaps(id); apply(false, keys); G().propsDone(`${what} "${g.name}"`, start); start = null; });
    };
    wire(fade, ['opacity'], 'Faded'); wire(mx, ['x'], 'Moved'); wire(my, ['y'], 'Moved');
    const keyBtn = el('button', { type: 'button', class: 'small ol-key', text: '◆ Key here', title: 'A key at the playhead on every layer of the group: its fade and place now (one undo step)', on: { click: () => keyHere(id) } });
    const node = el('div', { class: 'ol-card lab-pop', role: 'dialog', attrs: { 'aria-label': `Fade, move and key the group ${g.name}` } },
      el('div', { class: 'ol-head' }, el('b', { text: `📁 ${g.name}` }), el('span', { class: 'ol-sub', text: `${g.ids.length} layer${g.ids.length === 1 ? '' : 's'} as one` }), el('button', { type: 'button', class: 'ghost small ol-x', text: '✕', title: 'Close (Esc)', on: { click: () => closeCard() } })),
      fade.row, mx.row, my.row,
      el('div', { class: 'ol-foot' }, el('span', { class: 'ol-sub', text: 'Each release is one undo' }), keyBtn));
    if (g.color) node.style.setProperty('--ly-gc', g.color);
    document.body.append(node);
    const a = anchor || h.panel?.querySelector(`.ly-row.ly-group[data-group="${CSS.escape(id)}"]`) || h.panel;
    const rr = a?.getBoundingClientRect?.() || { left: 40, bottom: 80, right: 300 };
    node.style.left = `${Math.max(8, Math.min(innerWidth - node.offsetWidth - 8, rr.left))}px`;
    node.style.top = `${Math.max(8, Math.min(innerHeight - node.offsetHeight - 8, rr.bottom + 4))}px`;
    card = { el: node, id, fade, mx, my, set: (k, v) => { const R = { fade, x: mx, y: my }[k]; R.r.value = String(v); R.r.dispatchEvent(new Event('input')); R.r.dispatchEvent(new Event('change')); } };
    addEventListener('keydown', esc, true);
    return card;
  }
  // ◆ every member's opacity and place keyed at the playhead (as they show now): one undo step
  function keyHere(id) {
    const h = host();
    const before = G().snaps(id);
    const m = Object.keys(before);
    if (!m.length) return false;
    let ok = true;
    for (const lid of m) for (const p of ['opacity', 'x', 'y']) ok = h.key(lid, p) && ok;
    if (!ok) { err('Load a song or turn on the scene\'s timeline first: keys sit on a timeline'); return false; }
    const g = GC().find(h.layers(), id);
    G().propsDone(`◆ Keyed "${g?.name || 'the group'}"`, before);
    toast(`◆ "${g?.name || 'The group'}" keyed at ${(h.time() ?? 0).toFixed(1)} s on its ${m.length} layer${m.length === 1 ? '' : 's'}`, { timeout: 2600 });
    return true;
  }

  return { menu, nameLocal, nameAi, aiCost, groupCard, closeCard, keyHere, foldAll, stats, sent: () => sent.slice(), get card() { return card; } };
})();
