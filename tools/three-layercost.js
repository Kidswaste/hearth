// ⚡ Which layer costs the frames? (round 146, layercost146), in the ⚡ Speed check's lazy group ("speedcheck"):
//   · the cost view: a small cost badge (a bar and "12 ms") on each row of Layers & knobs, ONLY while it is on. It is
//     switched from the ⚡ card's "▦ Cost on layers" button and the slow chip's ▦ (tools/three-speed-hook.js). Turning it
//     on measures once (the speed check's 3 s, each of up to 8 layers left out in turn: its own GPU time a frame); the
//     badges then stay as measured. Nothing is measured while the scene simply plays, and nothing runs per frame: a
//     badge is part of its row (tools/three-layers.js asks badge(id) / sig(id) when it builds a row).
//   · the card's "Each layer's cost" list (heaviest first, its share of the frame), each heavy layer with one-click
//     lighten actions: Fewer (its count slider halved), ½ res and No shadows (the preview only: sketch.speed.lay),
//     Hide (its eye). Each is one undo step (the card's ↶, the toast's Undo, the Lab's Ctrl/⌘+Z through LabDirect.push);
//     the card measures again after each and shows the layer's cost before → after. tools/three-speed.js applies them.
//   LabCost.on · toggle(on?) · badge(id) · sig(id) · measured(analysis) · section(analysis, ctx) · state()
const LabCost = (() => {
  const S = { on: false, scene: null, rows: new Map(), frameMs: 0, fps: 0, at: 0, paints: 0, toggles: 0 };
  const sp = () => ThreeLab.speed;
  const ms1 = (x) => SpeedCore.ms1(x);
  // heavy ≥ 35 % of the frame, mid ≥ 12 %, else light
  const level = (share) => (share >= 0.35 ? 'heavy' : share >= 0.12 ? 'mid' : 'light');
  const relayout = () => { try { sp()?.layers?.(); } catch { /* no Lab */ } };

  function measured(a) {
    if (!a?.ok) return;
    S.scene = sp()?.sceneId?.() || null;
    S.rows = new Map(a.layers.map((L, i) => [L.id, { id: L.id, name: L.name, rank: i, cost: L.cost, est: L.gpuMs == null, share: Math.min(1, L.cost / Math.max(0.1, a.frameMs)), calls: L.calls, tris: L.tris, texMB: L.texMB, shadowLights: L.shadowLights, pr: L.pr, fx: Boolean(L.fx) }]));
    S.frameMs = a.frameMs; S.fps = a.fps; S.at = Date.now();
    if (S.on) relayout();
  }
  const fresh = () => S.scene && S.scene === sp()?.sceneId?.() && S.rows.size;

  async function toggle(on = !S.on) {
    on = Boolean(on);
    S.toggles += 1;
    if (on === S.on) { if (on && !fresh() && !LabSpeed.state().busy) await LabSpeed.measure(); return S.on; }
    S.on = on;
    relayout(); LabSpeed.repaint();
    if (on) {
      if (!LabSpeed.isOpen()) await LabSpeed.open(); // (opening measures, with every layer left out in turn)
      else if (!LabSpeed.state().busy) await LabSpeed.measure();
    }
    return S.on;
  }

  // ---------- the badge on a Layers row (only while the view is on) ----------
  const tip = (r) => `${r.est ? '≈ ' : ''}${ms1(r.cost)} ms of each ${ms1(S.frameMs)} ms frame (${Math.round(r.share * 100)} %)${r.est ? ', from its draw time' : ', measured by leaving it out for a moment'} · ${SpeedCore.big(r.calls)} draw calls · ${SpeedCore.big(r.tris)} triangles${r.texMB ? ` · textures ${Math.round(r.texMB)} MB` : ''}${r.shadowLights ? ` · ${r.shadowLights} shadow light${r.shadowLights > 1 ? 's' : ''}` : ''}${r.rank === 0 ? ' · the heaviest layer' : ''}. Click: the ⚡ card, with ways to lighten it`;
  function badge(id) {
    if (!S.on || !fresh()) return null;
    const r = S.rows.get(id); if (!r) return null;
    S.paints += 1;
    const lv = level(r.share);
    const b = el('button', { type: 'button', class: `lc-badge lc-${lv}${r.rank === 0 && lv !== 'light' ? ' lc-top' : ''}`, title: tip(r), attrs: { 'aria-label': `Cost of ${r.name}: ${ms1(r.cost)} ms a frame` }, dataset: { cost: String(r.cost) }, on: { click: (e) => { e.stopPropagation(); LabSpeed.open().then(() => LabSpeed.card?.querySelector(`.lc-row[data-layer="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' })).catch(() => {}); } } },
      el('i', { class: 'lc-meter' }, el('i', { style: { width: `${Math.max(6, Math.round(r.share * 100))}%` } })),
      el('span', { class: 'lc-ms', text: `${r.est ? '~' : ''}${ms1(r.cost)} ms` }));
    return b;
  }
  const sig = (id) => { if (!S.on || !fresh()) return ''; const r = S.rows.get(id); return r ? `${r.cost}|${r.rank}|${S.at}` : ''; };

  // ---------- the card's list: each layer's cost, heaviest first, with its lighten actions ----------
  function section(a, { done, fix, undo1, btn }) {
    if (!a?.ok || !a.layers.length) return null;
    const T = Math.max(0.1, a.frameMs);
    const acts = a.acts || [];
    const lt = [...done.values()].filter((e) => e.id.startsWith('lt:'));
    const row = (id, name, cost, est, rank) => {
      const share = cost == null ? 0 : Math.min(1, cost / T); const lv = cost == null ? 'off' : level(share);
      const mine = lt.filter((e) => e.layer === id);
      const heavy = rank === 0 || share >= 0.15;
      const show = heavy ? acts.filter((x) => x.layer === id && !done.has(x.id)) : [];
      return el('div', { class: `lc-row lc-${lv}`, attrs: { 'data-layer': id } },
        el('div', { class: 'lc-line' },
          el('span', { class: 'lc-n', text: name, title: name }),
          el('i', { class: 'lc-meter' }, el('i', { style: { width: `${cost == null ? 0 : Math.max(3, Math.round(share * 100))}%` } })),
          el('span', { class: 'lc-ms', text: cost == null ? 'hidden' : `${est ? '~' : ''}${ms1(cost)} ms · ${Math.round(share * 100)}%` })),
        show.length || mine.length ? el('div', { class: 'lc-acts' },
          ...mine.map((e) => el('span', { class: 'lc-done' }, el('span', { text: `✓ ${e.label.split(' · ')[0]}${e.costNow != null && e.costWas != null ? ` · ${ms1(e.costWas)} → ${ms1(e.costNow)} ms` : e.now == null ? ' · measuring…' : ''}` }), btn('↶', 'lc-undo1', () => undo1(e), 'Undo this (one step)'))),
          ...show.map((x) => btn(x.fix.label, `lc-act lc-${x.act}`, () => fix(x.id), `${x.title}. One undo step.`))) : null);
    };
    const rows = a.layers.slice(0, 6).map((L, i) => row(L.id, L.name, L.cost, L.gpuMs == null, i));
    // a layer hidden from here: its row stays, with its ↶
    for (const id of new Set(lt.map((e) => e.layer))) if (!a.layers.some((L) => L.id === id)) rows.push(row(id, sp().name(id) || 'layer', null, false, 99));
    return el('div', { class: 'lc-sec' },
      el('div', { class: 'lc-h' }, el('b', { text: 'Each layer\'s cost' }), el('span', { text: `heaviest first · ${a.layers.some((L) => L.gpuMs == null) ? '~ from its draw time' : 'measured here'}` })),
      ...rows);
  }

  addEventListener('hearth:sketch', () => { if (S.on) { S.on = false; S.rows.clear(); relayout(); } });
  const state = () => ({ on: S.on, scene: S.scene, rows: [...S.rows.values()].sort((x, y) => x.rank - y.rank), paints: S.paints, toggles: S.toggles, at: S.at, badges: [...document.querySelectorAll('.ly-row .lc-badge')].length });
  return { get on() { return S.on; }, toggle, badge, sig, measured, section, state };
})();
