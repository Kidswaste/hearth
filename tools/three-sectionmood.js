// 🎭 Give each section its mood (round 138, sectionmood138). docs/upgrades/sectionmood138.md
// The Lab timeline's Sections ▾ › "🎭 Give each section its mood…" proposes, for every section of the song, where the
// scene's 🎛 mood dials sit (Energy, Darkness, Chaos, Warmth…) and which saved look fits, with no AI:
//   · the section's mood comes from the brief's tempo plan when it names the section ("drop: punchy, break: dark"),
//     else intro / break calm, build rising, drop punchy, outro fading (tools/three-sectionmood-core.js)
//   · a mood is a key on each dial at the section's downbeat (held, or from → to over a build / an outro); the keys are
//     baked onto the mapped sliders like any keyed dial (DialsCore.bake), so the preview, renders, the Lab sequence and
//     ◉ Perform play them; a look rides on the section's cue (as ✦ Map to the song's do), so playback and Perform's
//     1–9 play it
//   · no dials yet: "🎛 Suggest dials first (free)" adds the free ones from the slider names (DialsCore.suggestLocal)
// The proposal shows as GHOSTS on the timeline, the same way ✦ Map's do (dashed, dimmed, per section), with a list under
// the song's row. Nothing changes until Keep: Keep all, Keep this section, or ✕ one item. A keep is ONE undo step (the
// toast's Undo, the panel's ↶, the Lab's Ctrl/⌘+Z). ✦ Ask the AI to refine: one small helper pass, the cost first.
// Lazy group "sectionmood" (after lab, songmap, dials).
const SectionMood = (() => {
  const C = () => SectionMoodCore;
  const DC = () => DialsCore;
  const Lab = () => (typeof ThreeLab !== 'undefined' ? ThreeLab : null);
  const hooks = () => Lab()?.stageHooks || {};
  const player = () => hooks().player || null;
  const host = () => window.LabMatHook?.host?.() || null;
  const sceneNow = () => hooks().sketchId?.() || null;
  const HEX = /^#[0-9a-f]{6}$/i;
  const err = (e) => toast(window.calmError ? calmError(e) : e?.message || String(e), { type: 'error', timeout: 5000 });
  const S = { plan: null, sid: null, ver: 0, panel: null, hooked: null, last: null, over: {}, tempo: undefined, sent: [], busy: false };
  const stats = { plans: 0, kept: 0, undone: 0, asked: 0, suggested: 0 };

  // ---------- what the plan reads ----------
  function briefTempo() {
    if (S.tempo !== undefined) return S.tempo; // (a check's own tempo plan)
    try { const p = typeof Projects !== 'undefined' ? Projects.ofItem('scene', sceneNow())[0] : null; return p && typeof ProjectBrief !== 'undefined' ? ProjectBrief.get(p.id)?.tempo || null : null; } catch { return null; }
  }
  const cuesNow = () => player().timeline().cues.map((c) => ({ time: c.time, name: c.name, ...(c.looks?.length ? { looks: c.looks.map((l) => ({ ...l })) } : {}) }));
  function input() {
    const P = player();
    if (!P?.loaded || P.isClock) throw new Error('Load a song first (🎵 in the Lab timeline): the moods follow its sections.');
    const a = P.analysis;
    if (!a?.sections?.length) throw new Error('The song is still being analyzed: try again in a moment.');
    const tl = P.timeline();
    const grid = { bpm: tl.grid?.bpm || a.bpm || 0, downbeat: tl.grid?.downbeat ?? a.beats?.[a.downIndex || 0] ?? 0, beatsPerBar: tl.grid?.beatsPerBar || 4 };
    const layers = (host()?.layers() || []).map((L) => {
      let looks = []; try { looks = hooks().ctlOf?.(L.id)?.looksApi?.list() || []; } catch { looks = []; }
      return { id: L.id, name: L.name, filter: Boolean(window.ThreeLayers?.isFilter?.(L.code || '')), looks };
    });
    return { duration: P.duration, grid, sections: a.sections, cues: cuesNow(), layers, tempo: briefTempo(), dials: DC().norm(hooks().dials?.() || null) };
  }
  function propose() {
    S.plan = C().plan(input(), { over: S.over, by: Object.values(S.over).some((o) => o.by === 'ai') ? 'ai' : 'local' });
    S.sid = sceneNow();
    stats.plans += 1;
    changed();
    return S.plan;
  }
  const live = () => (S.plan && S.sid === sceneNow() ? S.plan : null);
  function changed() { S.ver += 1; hook(); player()?.redraw?.(); paint(); }
  const secOf = (p, i) => p.sections.find((s) => s.i === i);

  // ---------- ghosts on the timeline (dashed, dimmed, per section; nothing in the scene) ----------
  function hook() {
    const P = player();
    if (!P?.addHooks || S.hooked === P) return;
    S.hooked = P;
    P.addHooks({
      frameKey: () => (live() ? `sectionmood${S.ver}` : ''),
      drawOver: (g, { X, s0, sp, h, ruler }) => {
        const p = live();
        if (!p) return;
        const top = (ruler || 14) + 16;
        const rows = [...new Set(p.items.filter((it) => it.kind === 'dial').map((it) => it.dial))];
        g.save();
        g.font = '10px system-ui, sans-serif';
        for (const s of p.sections) {
          if (s.end < s0 || s.start > s0 + sp) continue;
          const x0 = Math.round(X(s.start)) + 0.5; const x1 = X(Math.min(s.end, s0 + sp));
          const its = p.items.filter((it) => it.section === s.i);
          if (!its.length) continue;
          g.globalAlpha = 0.8; g.strokeStyle = '#7fd6c2aa'; g.setLineDash([2, 5]); g.lineWidth = 1;
          g.beginPath(); g.moveTo(x0, ruler || 0); g.lineTo(x0, h); g.stroke();
          g.setLineDash([]); g.fillStyle = '#7fd6c2dd';
          g.fillText(`🎭 ${s.mood}`, x0 + 3, top - 4);
          its.filter((it) => it.kind === 'dial').forEach((it) => {
            const r = rows.indexOf(it.dial); const y0 = top + r * 13; const yv = (v) => y0 + 10 * (1 - v);
            g.strokeStyle = '#7fd6c2cc'; g.setLineDash([4, 3]);
            const k = it.keys;
            g.beginPath(); g.moveTo(X(k[0].t), yv(k[0].v));
            if (k.length > 1) g.lineTo(X(k[1].t), yv(k[1].v));
            g.lineTo(x1, yv(k[k.length - 1].v)); g.stroke();
            g.setLineDash([]);
            for (const q of k) { const x = X(q.t); const y = yv(q.v); g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 4, y); g.lineTo(x, y + 4); g.lineTo(x - 4, y); g.closePath(); g.stroke(); }
            if (r >= 0 && s === p.sections.find((z) => p.items.some((q) => q.section === z.i && q.dial === it.dial))) g.fillText(it.dialName, x0 + 8, y0 + 8);
          });
          const looks = its.filter((it) => it.kind === 'look');
          if (looks.length) g.fillText(`◐ ${looks.map((l) => l.name).join(', ')}`, x0 + 3, top + rows.length * 13 + 9);
        }
        g.restore();
      },
    });
  }

  // ---------- the dials' keys, baked onto the sliders (as 🎛 Dials does) ----------
  const propsOf = (dial) => [...new Set([...dial.maps.map((m) => `${m.layer}|${m.key}`), ...(dial.baked || [])])];
  function keysNow(props) { const o = {}; for (const p of props) { const [l, k] = p.split('|'); o[p] = hooks().keysOf?.(l, `s:${k}`) || []; } return o; }
  function setKeysAll(byProp) { for (const [p, ks] of Object.entries(byProp)) { const [l, k] = p.split('|'); hooks().setKeys?.(l, `s:${k}`, ks); } }
  function bake(dial) {
    const have = keysNow(propsOf(dial));
    const { set, skipped } = DC().bake(dial, have);
    const gone = DC().unbake(dial.id, have, dial.maps);
    const out = {};
    for (const src of [gone, set]) for (const [l, ps] of Object.entries(src)) for (const [p, ks] of Object.entries(ps)) out[`${l}|${p.slice(2)}`] = ks;
    for (const [p, ks] of Object.entries(out)) if (JSON.stringify(ks) === JSON.stringify(have[p] || [])) delete out[p];
    setKeysAll(out);
    dial.baked = dial.keys.length ? dial.maps.filter((m) => !skipped.includes(m)).map((m) => `${m.layer}|${m.key}`) : [];
    return skipped;
  }

  // ---------- keeping: ONE undo step ----------
  function keep(ids = null, { quiet = false } = {}) {
    const p = live();
    if (!p) throw new Error('No section moods to keep: 🎭 first.');
    const items = p.items.filter((it) => !ids || ids.includes(it.id));
    if (!items.length) return { kept: 0 };
    const h = hooks(); const P = player();
    const data = DC().norm(h.dials?.() || null);
    const before = { dials: h.dials?.() || null, keys: {}, cues: null };
    const touched = new Set();
    for (const it of items.filter((x) => x.kind === 'dial')) {
      const d = data.list.find((x) => x.id === it.dial); const s = secOf(p, it.section);
      if (!d || !s) continue;
      if (!touched.has(d)) Object.assign(before.keys, Object.fromEntries(Object.entries(keysNow(propsOf(d))).filter(([k]) => !(k in before.keys))));
      d.keys = C().mergeKeys(d.keys, it.keys, s.start, s.end);
      touched.add(d);
    }
    const skipped = [];
    for (const d of touched) skipped.push(...bake(d).map((m) => m.label));
    if (touched.size) h.setDials(DC().norm(data));
    const looks = items.filter((x) => x.kind === 'look');
    if (looks.length) {
      before.cues = cuesNow();
      const add = [];
      for (const t of [...new Set(looks.map((x) => x.time))]) {
        const group = looks.filter((x) => x.time === t);
        const cue = before.cues.find((c) => Math.abs(c.time - t) < 0.05);
        const ls = (cue?.looks || []).filter((l) => !group.some((g) => g.layer === l.layer)).concat(group.map((g) => ({ layer: g.layer, name: g.name })));
        add.push({ time: cue ? cue.time : t, name: cue?.name || group[0].cueName, looks: ls });
      }
      P.editCues({ add, undo: false });
    }
    const rec = { sid: sceneNow(), before, undone: false, n: items.length };
    S.last = rec; stats.kept += 1;
    const label = `🎭 Section moods (${items.length} item${items.length === 1 ? '' : 's'})`;
    window.LabDirect?.push?.(null, label, () => undo({ quiet: true })); // the Lab's Ctrl/⌘+Z (with a song: the timeline's own undo)
    p.items = p.items.filter((it) => !items.includes(it));
    if (!p.items.length) S.plan = null;
    changed();
    if (!quiet) toast(`🎭 Kept: ${items.length} item${items.length === 1 ? '' : 's'}${skipped.length ? ` · left alone (your own keys): ${[...new Set(skipped)].join(', ')}` : ''}`, { timeout: 5000, action: { label: 'Undo', fn: () => undo() } });
    return { kept: items.length, skipped };
  }
  function undo({ quiet = false } = {}) {
    const r = S.last;
    if (!r || r.undone) { if (!quiet) toast('Nothing to undo.', { timeout: 1500 }); return false; }
    if (r.sid !== sceneNow()) { if (!quiet) toast('Those moods were on another scene.', { timeout: 2000 }); return false; }
    r.undone = true; stats.undone += 1;
    setKeysAll(r.before.keys);
    hooks().setDials?.(r.before.dials);
    if (r.before.cues) player().editCues({ clear: true, add: r.before.cues, undo: false });
    if (!quiet) toast('↶ The section moods are undone', { timeout: 1500 });
    paint();
    return true;
  }
  function drop(id) { const p = live(); if (!p) return; p.items = p.items.filter((it) => it.id !== id); changed(); }
  function close() { S.plan = null; S.over = {}; S.panel?.remove(); S.panel = null; changed(); }
  function setMood(i, mood) { S.over[i] = { mood }; propose(); }

  // ---------- no dials yet: the free ones from the slider names (one undo step) ----------
  function controls() {
    const h = hooks();
    return (host()?.layers() || []).flatMap((L) => {
      let list = []; try { list = h.ctlOf(L.id)?.controls() || []; } catch { list = []; }
      return list.filter((x) => !x.options && ((typeof x.value === 'number' && Number.isFinite(x.min)) || (typeof x.value === 'string' && HEX.test(x.value))))
        .map((x) => ({ layer: L.id, layerName: L.name, key: x.key, label: x.label || x.key, kind: typeof x.value === 'number' ? 'number' : 'color', value: typeof x.value === 'string' ? x.value.toLowerCase() : x.value, min: x.min, max: x.max, int: x.step === 1, live: x.live }));
    });
  }
  function suggestDials() {
    const h = hooks(); const sid = sceneNow();
    const before = h.dials?.() || null;
    const d = DC().norm(before);
    const props = DC().suggestLocal(controls(), { have: d.list.map((x) => x.name) });
    let n = 0;
    for (const p of props) { if (d.list.length >= DC().MAX) break; const id = DC().newId(d); d.list.push({ id, name: p.name, value: 0.5, maps: p.maps, keys: [] }); d.sel ||= id; n += 1; }
    if (!n) { toast('No slider names here say speed, glow, contrast, noise or warmth: make a dial in 🎛 Dials (＋ Learn) first', { timeout: 4000 }); return 0; }
    h.setDials(DC().norm(d)); stats.suggested += 1;
    window.LabDirect?.push?.(null, `🎛 ${n} dial${n === 1 ? '' : 's'} suggested`, () => { if (sceneNow() !== sid) return false; hooks().setDials?.(before); if (live()) propose(); return true; });
    toast(`🎛 Added ${props.slice(0, n).map((p) => p.name).join(', ')} (from the slider names): 🎛 Dials shows them`, { timeout: 3500 });
    propose();
    return n;
  }

  // ---------- ✦ Ask the AI to refine: one small helper pass, the cost first ----------
  const dock = () => (typeof DirectorDock !== 'undefined' ? DirectorDock.entry('three') : null);
  const agentOf = () => H.agent(dock()?.agentId) || H.agents().find((a) => a.dock === 'three' && a.mode === 'native') || H.claudeAgent?.() || null;
  const who = (a) => { const c = a ? (H.chats || []).find((x) => x.id === H.activeChat?.[a.id]) : null; return (c?.engine || a?.engine) === 'codex' ? 'Astra' : 'Claude'; };
  const cheap = (a) => window.Autocompact?.CHEAP?.[a?.engine] || null;
  async function ask({ confirm = true } = {}) {
    const p = live() || propose();
    const a = agentOf();
    if (!a) throw new Error('No AI to ask: set up Claude or Astra first.');
    const prompt = C().askPrompt(p, input());
    const line = DC().costLine(C().estimate(prompt), who(a), cheap(a)?.model || '');
    if (confirm && !(await Modal.confirm('✦ Ask the AI to refine the moods?', `${line}. It gets the section names, their moods, the dial names and the saved looks (words only). Its moods come back as ghosts: nothing changes until you keep them.`, { ok: 'Ask' }))) return false;
    if (S.busy) return false;
    S.busy = true; stats.asked += 1; paint();
    try {
      if (window.Lazy && !Lazy.loaded('budget')) await Lazy.load('budget').catch(() => {});
      const ch = cheap(a);
      const q = { agentId: a.id, text: prompt, images: [], options: { lean: true, helper: true, persona: C().PERSONA, ...(ch ? { model: ch.model, effort: ch.effort } : { effort: 'low' }), ...(a.engine === 'codex' ? { verbosity: 'low' } : {}) } };
      S.sent = [...S.sent, { agentId: a.id, text: q.text, at: Date.now() }].slice(-5);
      const r = await window.hub.askOnce(q).catch((e) => ({ ok: false, error: e.message }));
      if (r?.ok && r.usage) document.dispatchEvent(new CustomEvent('hearth:usage', { detail: { agentId: a.id, usage: r.usage, source: 'section moods' } }));
      if (!r?.ok) throw new Error(r?.error || 'The AI didn\'t answer.');
      const over = C().parseAI(r.text, live() || p);
      if (!Object.keys(over).length) { toast('The AI kept the moods as they are.', { timeout: 2500 }); return true; }
      Object.assign(S.over, over);
      propose();
      return true;
    } finally { S.busy = false; paint(); }
  }

  // ---------- the panel under the song's row ----------
  const FROM = { brief: 'from the brief', default: '', you: 'yours', ai: 'the AI\'s' };
  function paint() {
    const p = live();
    if (!p) { if (S.panel) { S.panel.remove(); S.panel = null; } return; }
    const P = player();
    if (!S.panel || !S.panel.isConnected) {
      S.panel = el('div', { class: 'smo-panel' });
      const bar = P?.el; const wrap = bar?.querySelector('.mb-tl-wrap');
      if (wrap) bar.insertBefore(S.panel, wrap); else (bar || document.body).append(S.panel);
    }
    const b = (text, title, fn, cls = 'ghost small') => el('button', { type: 'button', class: cls, text, title, on: { click: (e) => { e.stopPropagation(); try { const r = fn(); if (r?.catch) r.catch(err); } catch (x) { err(x); } } } });
    const row = (it) => el('div', { class: `smo-item smo-${it.kind}`, dataset: { id: it.id } }, el('span', { class: 'smo-text', text: C().text(it) }),
      b('✕', 'Skip this one (its ghost goes away)', () => drop(it.id), 'ghost small smo-x'));
    const groups = p.sections.map((s) => {
      const its = p.items.filter((it) => it.section === s.i);
      const sel = el('select', { class: 'smo-mood', title: 'This section\'s mood', on: { change: (e) => { try { setMood(s.i, e.target.value); } catch (x) { err(x); } } } },
        ...C().NAMES.map((m) => el('option', { value: m, text: `${C().MOODS[m].icon} ${m}`, ...(m === s.mood ? { attrs: { selected: '' } } : {}) })));
      sel.value = s.mood;
      return el('div', { class: 'smo-sec', dataset: { sec: String(s.i) } },
        el('div', { class: 'smo-sec-head' }, el('b', { text: s.name }), el('span', { class: 'hint', text: ` ${SongMapCore.fmt(s.start)} ` }), sel,
          FROM[s.from] ? el('span', { class: 'hint smo-from', text: ` ${FROM[s.from]}`, title: s.plan || '' }) : null, el('span', { class: 'spacer' }),
          its.length ? b('Keep this section', `Keep the ${its.length} item${its.length > 1 ? 's' : ''} of “${s.name}” (one undo step)`, () => keep(its.map((x) => x.id)), 'ghost small smo-keepsec') : el('span', { class: 'hint', text: 'nothing new' })),
        ...its.map(row));
    });
    const undoOn = S.last && !S.last.undone && S.last.sid === sceneNow();
    const need = p.needDials ? el('div', { class: 'smo-need' },
      el('span', { text: p.otherDials.length ? `No dial here says Energy, Darkness, Chaos or Warmth (${p.otherDials.join(', ')}): ` : 'No 🎛 mood dials on this scene yet: ' }),
      b('🎛 Suggest dials first (free)', 'Energy, Darkness, Chaos, Warmth from the slider names (one undo step), then the moods use them', () => suggestDials(), 'ghost small smo-suggest')) : null;
    S.panel.replaceChildren(
      el('div', { class: 'smo-head' },
        el('b', { text: `🎭 Section moods${p.by === 'ai' ? ' (refined by the AI)' : ''}` }),
        el('span', { class: 'hint smo-sum', text: ` ${p.items.length} item${p.items.length === 1 ? '' : 's'} · ghosts until you keep them` }),
        el('span', { class: 'spacer' }),
        p.items.length ? b('Keep all', 'Keep every item (one undo step)', () => keep(), 'primary small smo-keepall') : null,
        b(S.busy ? '✦ Asking…' : '✦ Ask the AI to refine', 'One small AI pass reads the sections and their moods and sends better ones back as ghosts (the cost shows first)', () => ask(), 'ghost small smo-ai'),
        undoOn ? b('↶', 'Undo the last keep', () => undo(), 'ghost small smo-undo') : null,
        b('Close', 'Close (nothing is kept)', () => close(), 'ghost small smo-close')),
      ...(need ? [need] : []),
      el('div', { class: 'smo-list' }, ...groups));
  }
  // tempo: a tempo plan to use instead of the brief's (checks)
  async function open({ quiet = false, tempo } = {}) {
    S.tempo = tempo; S.over = {};
    propose();
    if (!quiet && !S.plan.items.length && !S.plan.needDials) toast('Every section already has its mood: nothing new to propose.', { timeout: 3000 });
    return S.plan;
  }

  return { open, close, keep, undo, drop, setMood, suggestDials, ask, propose, stats, sent: () => S.sent.slice(), get plan() { return live(); }, get last() { return S.last; }, get panel() { return S.panel; } };
})();
window.SectionMood = SectionMood;
