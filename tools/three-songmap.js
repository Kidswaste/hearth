// ✦ Map to the song (round 130, songmap130). docs/upgrades/songmap130.md
// The Lab timeline's "✦ Map" (next to the song's name; also Sections ▾, /map-song, Ctrl/⌘+K) proposes a plan for the
// scene from the song's analysis and the layers' slider names (tools/three-songmap-core.js), with no AI:
//   · a cue per section (Intro, Build, Drop…) on its downbeat, carrying the saved looks that fit it
//   · the main layer's slider (intensity, glow…; the brief's tempo plan first) jumps on each drop and eases out over the bar
//   · kick and snare beat links on the most fitting sliders, when the scene doesn't follow them yet
// The plan shows as GHOSTS: dashed, dimmed lines and diamonds on the timeline and a list under the song's row. Nothing in
// the scene changes until Keep: Keep all, Keep this section, or ✕ one item. A keep is ONE undo step (the toast's Undo,
// the panel's ↶, the Lab's Ctrl/⌘+Z). "✦ Ask the AI to refine" sends the plan and the scene's outline to the director,
// after its cost is shown; its answer (three_do map_song { plan }) replaces the ghosts.
// The AI: three_do map_song { apply, plan } (op below, via tools/three-director.js). Lazy group "songmap".
const SongMap = (() => {
  const C = () => SongMapCore;
  const Lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null);
  const hooks = () => Lab()?.stageHooks || {};
  const player = () => hooks().player || null;
  const host = () => window.LabMatHook?.host?.() || null; // the Lab's layers and selection
  const sceneNow = () => hooks().sketchId?.() || null;
  const err = (e) => toast(window.calmError ? calmError(e) : e?.message || String(e), { type: 'error', timeout: 5000 });
  const S = { plan: null, sid: null, ver: 0, panel: null, hooked: null, last: null, busy: '' };
  const stats = { plans: 0, kept: 0, undone: 0, asked: 0 };

  // ---------- what the plan reads: the song, the layers' sliders and looks, the brief's tempo plan ----------
  function input() {
    const P = player();
    if (!P?.loaded || P.isClock) throw new Error('Load a song first (🎵 in the Lab timeline): the map follows its sections.');
    const a = P.analysis;
    if (!a?.sections?.length) throw new Error('The song is still being analyzed: try again in a moment.');
    const tl = P.timeline();
    const grid = { bpm: tl.grid?.bpm || a.bpm || 0, downbeat: tl.grid?.downbeat ?? a.beats?.[a.downIndex || 0] ?? 0, beatsPerBar: tl.grid?.beatsPerBar || 4 };
    const h = host();
    const sel = h?.sel?.();
    const layers = (h?.layers() || []).map((L) => {
      const c = hooks().ctlOf?.(L.id);
      let sliders = []; let looks = [];
      try { sliders = c ? c.controls() : []; } catch { sliders = []; }
      try { looks = c?.looksApi?.list() || []; } catch { looks = []; }
      return { id: L.id, name: L.name, selected: sel?.id === L.id, filter: Boolean(window.ThreeLayers?.isFilter?.(L.code || '')), scale: L.scale ?? 1, sliders, looks, keyed: Object.keys(L.keys || {}).filter((k) => L.keys[k]?.length) };
    });
    let tempo = null;
    try { const p = typeof Projects !== 'undefined' ? Projects.ofItem('scene', sceneNow())[0] : null; tempo = p && typeof ProjectBrief !== 'undefined' ? ProjectBrief.get(p.id)?.tempo || null : null; } catch { tempo = null; }
    return { duration: P.duration, grid, sections: a.sections, cues: tl.cues, layers, tempo };
  }
  function propose({ ai = null } = {}) {
    const inp = input();
    S.plan = ai ? C().fromAI(ai, inp) : C().plan(inp);
    S.sid = sceneNow();
    stats.plans += 1;
    changed();
    return S.plan;
  }
  const live = () => (S.plan && S.sid === sceneNow() ? S.plan : null);
  function changed() { S.ver += 1; hook(); player()?.redraw?.(); paint(); }

  // ---------- ghosts on the timeline (dashed, dimmed; nothing in the scene) ----------
  function hook() {
    const P = player();
    if (!P?.addHooks || S.hooked === P) return;
    S.hooked = P;
    P.addHooks({
      frameKey: () => (live() ? `songmap${S.ver}` : ''),
      drawOver: (g, { X, s0, sp, h, LT, ruler }) => {
        const p = live();
        if (!p) return;
        let geo = null;
        g.save();
        g.globalAlpha = 0.85;
        g.font = '10px system-ui, sans-serif';
        for (const it of p.items) {
          if (it.kind === 'cue') {
            if (it.time < s0 || it.time > s0 + sp) continue;
            const x = Math.round(X(it.time)) + 0.5;
            g.strokeStyle = '#c9a7ffaa'; g.setLineDash([4, 4]); g.lineWidth = 1;
            g.beginPath(); g.moveTo(x, ruler || 0); g.lineTo(x, h); g.stroke();
            g.setLineDash([]);
            g.fillStyle = '#c9a7ffcc'; g.fillText(`✦ ${it.name}${it.looks.length ? ' ◐' : ''}`, x + 3, (ruler || 12) + 11);
          } else if (it.kind === 'keys') {
            if (!geo) { try { geo = player()?._keysGeo?.() || {}; } catch { geo = {}; } }
            const yy = geo.trackY?.(it.layer);
            const y = Number.isFinite(yy) ? yy : (LT || h) - 9;
            g.strokeStyle = '#ffd27acc'; g.setLineDash([3, 3]);
            const xs = it.keys.filter((k) => k.t >= s0 && k.t <= s0 + sp).map((k) => X(k.t));
            if (xs.length > 1) { g.beginPath(); g.moveTo(xs[0], y); g.lineTo(xs[xs.length - 1], y); g.stroke(); }
            g.setLineDash([]);
            for (const x of xs) { g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.stroke(); }
          }
        }
        g.restore();
      },
    });
  }

  // ---------- keeping: items into the scene as ONE undo step ----------
  const keyOf = (it) => `${it.layer}|${it.prop}`;
  function stateOf(items) {
    const P = player();
    const before = { cues: P.timeline().cues.map((c) => ({ time: c.time, name: c.name, ...(c.looks?.length ? { looks: c.looks.map((l) => ({ ...l })) } : {}) })), keys: {}, links: {} };
    for (const it of items) {
      if (it.kind === 'keys' && !(keyOf(it) in before.keys)) before.keys[keyOf(it)] = hooks().keysOf(it.layer, it.prop);
      if (it.kind === 'link') { const b = hooks().ctlOf?.(it.layer)?.binding(it.key); before.links[`${it.layer}|${it.key}`] = b ? JSON.parse(JSON.stringify(b)) : null; }
    }
    return before;
  }
  function putBack(before) {
    const P = player();
    P.editCues({ clear: true, add: before.cues, undo: false });
    for (const [k, keys] of Object.entries(before.keys)) { const i = k.indexOf('|'); hooks().setKeys(k.slice(0, i), k.slice(i + 1), keys); }
    for (const [k, link] of Object.entries(before.links)) { const i = k.indexOf('|'); hooks().ctlOf?.(k.slice(0, i))?.link(k.slice(i + 1), link, { undo: false }); }
  }
  function keep(ids = null, o = {}) {
    const p = live();
    if (!p) throw new Error('No song map to keep: ✦ Map first.');
    const items = p.items.filter((it) => !ids || ids.includes(it.id));
    if (!items.length) return { kept: 0 };
    const before = stateOf(items);
    const cues = items.filter((it) => it.kind === 'cue');
    if (cues.length) player().editCues({ add: cues.map((c) => ({ time: c.time, name: c.name, ...(c.looks.length ? { looks: c.looks.map((l) => ({ layer: l.layer, name: l.name })) } : {}) })), undo: false });
    const byProp = {};
    for (const it of items.filter((x) => x.kind === 'keys')) (byProp[keyOf(it)] ||= []).push(...it.keys);
    for (const [k, add] of Object.entries(byProp)) { const i = k.indexOf('|'); hooks().setKeys(k.slice(0, i), k.slice(i + 1), C().merge(before.keys[k], add)); }
    for (const it of items.filter((x) => x.kind === 'link')) hooks().ctlOf?.(it.layer)?.link(it.key, it.link, { undo: false });
    const rec = { sid: sceneNow(), before, undone: false, n: items.length };
    S.last = rec;
    stats.kept += 1;
    const label = `Song map (${items.length} item${items.length === 1 ? '' : 's'})`;
    // the owner's click: one step of the Lab's Ctrl/⌘+Z (with a song: in the timeline's own undo). An AI's call: its reply's step
    if (!o.ai) window.LabDirect?.push?.(null, label, () => undo({ quiet: true }));
    p.items = p.items.filter((it) => !items.includes(it));
    if (!p.items.length) S.plan = null;
    changed();
    if (!o.quiet) toast(`✦ Kept: ${label.toLowerCase()}`, { timeout: 5000, action: { label: 'Undo', fn: () => undo() } });
    return { kept: items.length, items: items.map((it) => C().text(it)) };
  }
  function undo({ quiet = false } = {}) {
    const r = S.last;
    if (!r || r.undone) { if (!quiet) toast('Nothing to undo.', { timeout: 1500 }); return false; }
    if (r.sid !== sceneNow()) { if (!quiet) toast('That song map was on another scene.', { timeout: 2000 }); return false; }
    r.undone = true; stats.undone += 1;
    putBack(r.before);
    if (!quiet) toast('↶ The song map is undone', { timeout: 1500 });
    paint();
    return true;
  }
  function drop(id) { const p = live(); if (!p) return; p.items = p.items.filter((it) => it.id !== id); changed(); }
  function close() { S.plan = null; S.panel?.remove(); S.panel = null; changed(); }

  // ---------- ✦ Ask the AI to refine (the cost first) ----------
  const directorOf = () => H.agents().find((a) => a.dock === 'three') || H.agents().find((a) => a.threeTools) || null;
  function outline() {
    const inp = input();
    return inp.layers.map((L) => `${L.name}${L.filter ? ' (filter)' : ''}: ${L.sliders.filter((x) => typeof x.value === 'number').map((x) => `${x.key}=${x.value} [${x.min}..${x.max}]${x.followsMusic ? ` ♪${x.followsMusic.band}` : ''}`).join(', ') || 'no sliders'}${L.looks.length ? ` · looks ${L.looks.join(', ')}` : ''}`).join('\n');
  }
  function askText() {
    const p = live();
    return `Refine this song map for the scene on screen (ghosts the owner sees; nothing is applied). Keep what works, fix what doesn't (which slider moves on the drops, the looks per section, the beat links; slider ranges below). Answer with ONE call: three_do map_song { plan: { cues, keys, links } } (help map_song), without apply. Then one line on what you changed.\nPlan:\n${C().compact(p)}\nScene:\n${outline()}`;
  }
  async function ask({ confirm = true } = {}) {
    if (!live()) propose();
    const dir = directorOf();
    if (!dir) throw new Error('No Three Director to ask (Director › Make the Three Director).');
    const text = askText();
    const c = C().estimate(text.length);
    if (confirm && !(await Modal.confirm('Ask the AI to refine the song map?', `${dir.name} gets the plan and the scene's outline (sliders, looks): ≈${c.toLocaleString()} tokens with its reply. Its plan comes back as ghosts: nothing changes until you keep it.`, { ok: `Ask (≈${c.toLocaleString()} tokens)` }))) return false;
    stats.asked += 1;
    if (typeof Tools !== 'undefined') Tools.openDock?.('three');
    await Native.send(dir.id, text);
    return true;
  }

  // ---------- the panel under the song's row ----------
  function paint() {
    const p = live();
    if (!p) { if (S.panel) { S.panel.remove(); S.panel = null; } return; }
    const P = player();
    if (!S.panel || !S.panel.isConnected) {
      S.panel = el('div', { class: 'sm-panel' });
      const bar = P?.el; const wrap = bar?.querySelector('.mb-tl-wrap');
      if (wrap) bar.insertBefore(S.panel, wrap); else (bar || document.body).append(S.panel);
    }
    const b = (text, title, fn, cls = 'ghost small') => el('button', { type: 'button', class: cls, text, title, on: { click: (e) => { e.stopPropagation(); try { const r = fn(); if (r?.catch) r.catch(err); } catch (x) { err(x); } } } });
    const row = (it) => el('div', { class: `sm-item sm-${it.kind}`, dataset: { id: it.id } }, el('span', { class: 'sm-dot', text: it.kind === 'cue' ? '┆' : it.kind === 'keys' ? '◇' : '♪' }), el('span', { class: 'sm-text', text: C().text(it) }),
      b('✓', 'Keep this one', () => keep([it.id]), 'ghost small sm-keep1'), b('✕', 'Skip this one (the ghost goes away)', () => drop(it.id), 'ghost small sm-x'));
    const groups = [];
    for (const s of p.sections) {
      const its = p.items.filter((it) => it.section === s.i);
      if (!its.length) continue;
      groups.push(el('div', { class: 'sm-sec', dataset: { sec: String(s.i) } }, el('div', { class: 'sm-sec-head' }, el('b', { text: s.name }), el('span', { class: 'hint', text: ` ${C().fmt(s.start)}` }), el('span', { class: 'spacer' }), b('Keep this section', `Keep the ${its.length} item${its.length > 1 ? 's' : ''} of “${s.name}”`, () => keep(its.map((x) => x.id)), 'ghost small sm-keepsec')), ...its.map(row)));
    }
    const rest = p.items.filter((it) => it.section == null || !p.sections.some((s) => s.i === it.section));
    if (rest.length) groups.push(el('div', { class: 'sm-sec', dataset: { sec: 'song' } }, el('div', { class: 'sm-sec-head' }, el('b', { text: 'Whole song' }), el('span', { class: 'spacer' }), b('Keep these', 'Keep the beat links', () => keep(rest.map((x) => x.id)), 'ghost small sm-keepsec')), ...rest.map(row)));
    const undoOn = S.last && !S.last.undone && S.last.sid === sceneNow();
    S.panel.replaceChildren(
      el('div', { class: 'sm-head' },
        el('b', { text: `✦ Map to the song${p.by === 'ai' ? ' (refined by the AI)' : ''}` }),
        el('span', { class: 'hint sm-sum', text: ` ${C().summary(p)} · ghosts until you keep them` }),
        el('span', { class: 'spacer' }),
        b('Keep all', 'Keep every item (one undo step)', () => keep(), 'primary small sm-keepall'),
        b('✦ Ask the AI to refine', 'The director gets this plan and the scene\'s outline and sends back a better one (the cost shows first)', () => ask()),
        ...(undoOn ? [b('↶', 'Undo the last keep', () => undo(), 'ghost small sm-undo')] : []),
        b('Close', 'Close the plan (nothing is kept)', () => close(), 'ghost small sm-close')),
      el('div', { class: 'sm-list' }, ...groups));
  }
  async function open({ quiet = false, fresh = true } = {}) {
    if (fresh || !live()) propose();
    if (!quiet && !S.plan?.items.length) toast('The scene already follows this song: nothing new to propose.', { timeout: 3000 });
    return S.plan;
  }

  // ---------- the AI: three_do map_song { apply, plan } ----------
  async function op(args = {}, d = null, ctx = {}) {
    const linked = ctx.chatId && typeof ChatScenes !== 'undefined' ? ChatScenes.linkOf?.(ctx.chatId) : null;
    if (linked && linked !== sceneNow()) return { ok: false, error: 'map_song needs this chat\'s scene on screen (the owner sees the plan as ghosts on its timeline).' };
    try {
      if (args.plan && typeof args.plan === 'object') propose({ ai: args.plan });
      else if (!live() || !args.apply) propose();
      const p = live();
      if (!args.apply) return { ok: true, value: { shown: 'to the owner as ghosts (nothing changed yet)', plan: C().compact(p), keep: 'apply: true keeps it all (one undo step)' } };
      const r = keep(null, { ai: true, quiet: true });
      return { ok: true, value: { kept: r.kept, items: r.items } };
    } catch (e) { return { ok: false, error: e.message }; }
  }

  // ---------- /map-song and Ctrl/⌘+K ----------
  if (typeof Commands !== 'undefined' && !Commands.get('map-song')) {
    Commands.register({
      name: 'map-song', area: 'Three.js Lab', args: '[keep|ai|undo|close]',
      desc: 'Map the scene to the song: cues on its sections, moves on the drops, looks per section and kick / snare links, shown as ghosts first',
      examples: ['/map-song', '/map-song keep', '/map-song ai', '/map-song undo'],
      keywords: 'song map timeline sections cues drop keyframes looks beat link kick snare plan assistant',
      complete: (a) => ['keep', 'ai', 'undo', 'close'].filter((x) => x.startsWith(a.trim().toLowerCase())).map((value) => ({ value })),
      run: async (args) => {
        const w = String(args || '').trim().toLowerCase();
        if (w === 'close') { close(); return 'Closed (nothing kept)'; }
        if (w === 'undo') return undo() ? 'Undone' : 'Nothing to undo';
        if (w === 'ai') { await ask(); return null; }
        if (w === 'keep' || w === 'apply') { if (!live()) propose(); const r = keep(); return `Kept ${r.kept} item${r.kept === 1 ? '' : 's'}`; }
        const p = await open();
        return `✦ ${C().summary(p)}: shown as ghosts on the timeline`;
      },
    });
  }
  if (typeof AppUI !== 'undefined') AppUI.addAction?.('Lab: ✦ Map the scene to the song (cues, drop moves, looks, beat links as ghosts first)', () => open().catch(err));

  return { open, close, keep, undo, drop, ask, askText, op, propose, stats, get plan() { return live(); }, get last() { return S.last; }, get panel() { return S.panel; } };
})();
window.SongMap = SongMap;
