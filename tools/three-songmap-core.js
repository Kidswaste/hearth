// ✦ Map to the song (round 130, songmap130): the pure part (no window, loads in Node too). docs/upgrades/songmap130.md
// tools/three-songmap.js shows the plan as ghosts on the Lab timeline and keeps it; this file decides the plan, from
// the song's analysis (sections, energy, the beat grid) and the scene's slider names. No AI.
//   plan(input)              → { bpm, bar, sections: [{ i, label, name, start, end, energy }], items, main }
//        input: { duration, grid: { bpm, downbeat, beatsPerBar }, sections: analysis.sections, cues: [{ time, name }],
//                 layers: [{ id, name, selected, filter, scale, sliders: [{ key, label, value, min, max, step,
//                 followsMusic }], keyed: ['s:glow', 'scale'], looks: ['Calm', …] }], tempo: brief.tempo | null }
//        items: { id, kind: 'cue', section, time, name, looks: [{ layer, name, layerName }] }
//             | { id, kind: 'keys', section, layer, layerName, prop ('s:key' | 'scale'), label, keys: [{ t, v, ease }] }
//             | { id, kind: 'link', section: null, layer, layerName, key, label, link }
//   fromAI(aiPlan, input)    → the same plan from a director's { cues, keys, links } (three_do map_song { plan })
//   merge(keys, add)         → a key list with add's keys in (same time: replaced)
//   text(item) · compact(plan) · estimate(chars) · summary(plan)
const SongMapCore = (() => {
  const BL = () => (typeof BeatLinkCore !== 'undefined' ? BeatLinkCore : typeof require === 'function' ? require('./three-beatlink-core.js') : null);
  const r3 = (x) => Math.round(Number(x) * 1000) / 1000;
  const rv = (x, int) => (int ? Math.round(x) : Number(Number(x).toPrecision(5)));
  const fmt = (t) => { const s = Math.max(0, Number(t) || 0); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
  // slider names, best first: what jumps on a drop, what pulses on the kick, what flicks on the snare
  const DROP = ['intensity', 'glow', 'bloom', 'bright', 'energy', 'power', 'strength', 'amount', 'scale', 'size', 'zoom', 'speed', 'opacity'];
  const KICK = ['pulse', 'glow', 'bloom', 'bright', 'flash', 'punch', 'scale', 'size', 'zoom', 'intensity'];
  const SNARE = ['spark', 'flash', 'shake', 'glitch', 'strobe', 'twist', 'hue', 'rotation', 'rotate', 'spin', 'noise', 'detail', 'speed'];
  const LOUD = /drop|hype|loud|full|peak|energy|bright|intense|wild|big|chorus/i;
  const QUIET = /calm|soft|quiet|chill|intro|break|dark|low|still|ambient|mellow|outro/i;
  const words = (s) => String(s || '').toLowerCase();
  const nameOf = (x) => words(`${x.key} ${x.label || ''}`);
  const isNum = (x) => Number.isFinite(Number(x.value)) && typeof x.value !== 'boolean' && typeof x.value !== 'string' && Number.isFinite(x.min) && Number.isFinite(x.max) && x.max > x.min;
  function rank(sliders, list, skip, prefer = []) {
    const ok = sliders.filter((x) => isNum(x) && !skip.has(x.key));
    for (const w of prefer) { const hit = ok.find((x) => nameOf(x).includes(w)); if (hit) return hit; }
    for (const w of list) { const hit = ok.find((x) => new RegExp(`(^|[^a-z])${w}`).test(nameOf(x)) || nameOf(x).includes(w)); if (hit) return hit; }
    return null;
  }

  // ---------- the song's sections on their downbeats ----------
  function barsOf(grid) {
    const bpm = Number(grid?.bpm) || 0;
    if (!bpm) return null;
    const bar = ((Number(grid.beatsPerBar) || 4) * 60) / bpm;
    const a = Number(grid.downbeat) || 0;
    let first = ((a % bar) + bar) % bar; if (first > bar - 0.05) first = 0; // a 1 a hair before a bar line: the song's start
    return { bar, a, first, snap: (t) => { let x = a + Math.round((t - a) / bar) * bar; if (x < 0) x += bar; return r3(x); } };
  }
  function sectionsOf(input) {
    const raw = Array.isArray(input.sections) ? input.sections : [];
    const B = barsOf(input.grid);
    const count = {};
    const out = [];
    raw.forEach((sec, i) => {
      let n = sec.label;
      if (!n) { // older analyses: loud / quiet only (as the timeline's Sections ▾ names them)
        if (i === 0) n = sec.energy === 'loud' ? 'Drop' : 'Intro';
        else if (i === raw.length - 1 && sec.energy !== 'loud') n = 'Outro';
        else if (sec.energy === 'loud') n = 'Drop';
        else n = raw[i + 1]?.energy === 'loud' ? 'Build' : 'Break';
      }
      const start = i === 0 ? (B ? r3(B.first < Number(sec.start) + B.bar / 2 ? B.first : B.snap(sec.start)) : 0) : B ? B.snap(sec.start) : r3(sec.start);
      if (out.length && start <= out[out.length - 1].start + 0.01) return; // two sections on one bar: the first stays
      count[n] = (count[n] || 0) + 1;
      out.push({ label: n, name: count[n] > 1 ? `${n} ${count[n]}` : n, start, energy: sec.energy || null });
    });
    const dur = Number(input.duration) || (raw.length ? Number(raw[raw.length - 1].end) || 0 : 0);
    out.forEach((s, i) => { s.i = i; s.end = r3(out[i + 1]?.start ?? dur); });
    return { list: out, bar: B ? r3(B.bar) : 2, bpm: Number(input.grid?.bpm) || 0 };
  }

  // ---------- the main layer: the one with the most sliders worth moving (the selected one breaks a tie) ----------
  function mainOf(layers) {
    const cand = layers.filter((L) => !L.filter);
    let best = null; let score = -1;
    for (const L of cand) {
      const n = (L.sliders || []).filter((x) => isNum(x) && [...DROP, ...KICK, ...SNARE].some((w) => nameOf(x).includes(w))).length + (L.selected ? 0.5 : 0);
      if (n > score) { score = n; best = L; }
    }
    return best || layers[0] || null;
  }
  // the brief's tempo plan for drops: slider words it names come first ("glow surges on the drop")
  function preferFrom(tempo, main) {
    const lines = (Array.isArray(tempo) ? tempo : []).filter((x) => /drop|chorus|peak/i.test(`${x.section} ${x.plan}`)).map((x) => words(x.plan)).join(' ');
    if (!lines || !main) return [];
    return (main.sliders || []).filter(isNum).flatMap((x) => [x.key, ...String(x.label || '').split(/[^a-z0-9]+/i)]).map(words).filter((w) => w.length > 2 && lines.includes(w));
  }

  // ---------- the plan ----------
  function plan(input = {}) {
    const S = sectionsOf(input);
    const layers = Array.isArray(input.layers) ? input.layers : [];
    const cues = Array.isArray(input.cues) ? input.cues : [];
    const items = [];
    // 1. a cue per section on its downbeat, carrying the looks that fit it
    const withLooks = layers.filter((L) => !L.filter && (L.looks || []).length);
    for (const s of S.list) {
      const looks = [];
      for (const L of withLooks) {
        const ln = L.looks.find((n) => words(n) === words(s.label) || words(n).startsWith(words(s.label)) || words(s.label).startsWith(words(n)))
          || (s.label === 'Drop' || s.energy === 'loud' ? L.looks.find((n) => LOUD.test(n)) : /^(Intro|Break|Outro)$/.test(s.label) || s.energy === 'quiet' ? L.looks.find((n) => QUIET.test(n)) : null);
        if (ln) looks.push({ layer: L.id, name: ln, layerName: L.name });
      }
      const same = cues.find((c) => Math.abs(Number(c.time) - s.start) < 0.05);
      if (same && words(same.name) === words(s.name) && !looks.length) continue; // already there
      items.push({ id: `c${s.i}`, kind: 'cue', section: s.i, time: s.start, name: s.name, looks });
    }
    // 2. the main layer jumps on each drop and eases out over the bar (a real slider, else its scale)
    const main = mainOf(layers);
    const taken = new Set((main?.sliders || []).filter((x) => x.followsMusic || (main.keyed || []).includes(`s:${x.key}`)).map((x) => x.key));
    const drops = S.list.filter((s, i) => s.label === 'Drop' && (i === 0 || S.list[i - 1].label !== 'Drop'));
    let dropS = null;
    if (main && drops.length) {
      const prefer = preferFrom(input.tempo, main);
      const sl = main.sliders || [];
      for (let tries = 0; tries < 4; tries += 1) {
        const x = rank(sl, DROP, taken, prefer);
        if (!x) break;
        const span = x.max - x.min;
        if (x.max - Number(x.value) >= span * 0.12) { dropS = x; break; }
        taken.add(x.key); // already at its top: no jump left
      }
      const prop = dropS ? `s:${dropS.key}` : 'scale';
      if (dropS || !(main.keyed || []).includes('scale')) {
        const int = Boolean(dropS && dropS.step === 1);
        const base = dropS ? Number(dropS.value) : Number(main.scale ?? 1);
        const peak = dropS ? rv(Math.min(dropS.max, base + (dropS.max - dropS.min) * 0.4), int) : rv(base * 1.15);
        drops.forEach((s, j) => {
          const t = s.start;
          items.push({ id: `k${j}`, kind: 'keys', section: s.i, layer: main.id, layerName: main.name, prop, label: dropS ? dropS.label || dropS.key : 'Scale',
            keys: [...(t >= 0.06 ? [{ t: r3(t - 0.05), v: rv(base, int), ease: 'linear' }] : []), { t: r3(t), v: peak, ease: 'out' }, { t: r3(t + S.bar), v: rv(base, int), ease: 'ease' }] });
        });
        if (dropS) taken.add(dropS.key);
      }
    }
    // 3. kick and snare on the most fitting sliders, unless the scene already follows them
    const linked = new Set(layers.flatMap((L) => (L.sliders || []).map((x) => x.followsMusic?.band).filter(Boolean)));
    const B = BL();
    let n = 0;
    for (const [band, list] of [['kick', KICK], ['snare', SNARE]]) {
      if (linked.has(band) || !main || !B) continue;
      const x = rank(main.sliders || [], list, taken);
      if (!x) continue;
      taken.add(x.key);
      items.push({ id: `l${n}`, kind: 'link', section: null, layer: main.id, layerName: main.name, key: x.key, label: x.label || x.key, link: B.make({ band, how: 'pulse', v: Number(x.value), min: x.min, max: x.max, int: x.step === 1 }) });
      n += 1;
    }
    return { bpm: S.bpm, bar: S.bar, sections: S.list, items, main: main ? main.name : null };
  }

  // ---------- a director's plan (three_do map_song { plan: { cues, keys, links } }) as the same items ----------
  function fromAI(ai = {}, input = {}) {
    const base = plan(input);
    const layers = Array.isArray(input.layers) ? input.layers : [];
    const find = (ref) => layers.find((L) => L.id === ref || words(L.name) === words(ref)) || null;
    const secAt = (t) => { let k = null; for (const s of base.sections) if (s.start <= t + 0.01) k = s.i; return k; };
    const items = [];
    (Array.isArray(ai.cues) ? ai.cues : []).slice(0, 24).forEach((c, i) => {
      const t = Number(c.time); if (!Number.isFinite(t)) return;
      const looks = (Array.isArray(c.looks) ? c.looks : []).map((l) => { const L = find(l.layer); return L && (L.looks || []).some((n) => words(n) === words(l.name)) ? { layer: L.id, name: L.looks.find((n) => words(n) === words(l.name)), layerName: L.name } : null; }).filter(Boolean);
      items.push({ id: `c${i}`, kind: 'cue', section: secAt(t), time: r3(Math.max(0, t)), name: String(c.name || `Cue ${i + 1}`).slice(0, 40), looks });
    });
    (Array.isArray(ai.keys) ? ai.keys : []).slice(0, 12).forEach((k, i) => {
      const L = find(k.layer); if (!L) return;
      const p = String(k.property || k.prop || '');
      const x = (L.sliders || []).find((s) => s.key === p || words(s.label) === words(p));
      const prop = x ? `s:${x.key}` : ['opacity', 'x', 'y', 'scale', 'rotate'].includes(p) ? p : null;
      if (!prop) return;
      const keys = (Array.isArray(k.keys) ? k.keys : []).map((q) => ({ t: r3(q.time ?? q.t), v: q.value ?? q.v, ease: q.ease || 'ease' })).filter((q) => Number.isFinite(q.t) && q.v != null).sort((a, b) => a.t - b.t).slice(0, 16);
      if (keys.length) items.push({ id: `k${i}`, kind: 'keys', section: secAt(keys[0].t), layer: L.id, layerName: L.name, prop, label: x ? x.label || x.key : p, keys });
    });
    const B = BL();
    (Array.isArray(ai.links) ? ai.links : []).slice(0, 6).forEach((l, i) => {
      const L = find(l.layer); if (!L || !B) return;
      const x = (L.sliders || []).find((s) => isNum(s) && (s.key === l.slider || words(s.label) === words(l.slider)));
      const band = B.DRIVER[l.band] ? l.band : 'kick';
      if (!x) return;
      const lk = B.make({ band, how: B.HOW[l.how] ? l.how : 'pulse', v: Number(x.value), min: x.min, max: x.max, int: x.step === 1 });
      if (Number.isFinite(Number(l.lo))) lk.lo = Number(l.lo);
      if (Number.isFinite(Number(l.hi))) lk.hi = Number(l.hi);
      items.push({ id: `l${i}`, kind: 'link', section: null, layer: L.id, layerName: L.name, key: x.key, label: x.label || x.key, link: lk });
    });
    return { ...base, items, by: 'ai' };
  }

  // ---------- keys into a list (same time: replaced) ----------
  function merge(keys = [], add = []) {
    const out = (keys || []).map((k) => ({ ...k }));
    for (const k of add) { const i = out.findIndex((x) => Math.abs(x.t - k.t) < 0.001); if (i >= 0) out[i] = { ...k }; else out.push({ ...k }); }
    return out.sort((a, b) => a.t - b.t);
  }

  // ---------- words ----------
  function text(it) {
    if (it.kind === 'cue') return `Cue “${it.name}” at ${fmt(it.time)}${it.looks?.length ? ` · look${it.looks.length > 1 ? 's' : ''} ${it.looks.map((l) => `${l.layerName}: ${l.name}`).join(', ')}` : ''}`;
    if (it.kind === 'keys') { const pk = it.keys.reduce((m, k) => (Math.abs(k.v) > Math.abs(m) ? k.v : m), it.keys[0]?.v ?? 0); return `${it.layerName} · ${it.label} jumps to ${pk} at ${fmt(it.keys.find((k) => k.ease === 'out')?.t ?? it.keys[0]?.t)}, eases back over the bar`; }
    if (it.kind === 'link') { const B = BL(); return `${it.layerName} · ${it.label} ♪ ${B ? B.short(it.link) : it.link.band} (${it.link.lo} → ${it.link.hi})`; }
    return '';
  }
  function compact(p) {
    const secs = p.sections.map((s) => `${s.name}@${s.start}`).join(' ');
    const lines = p.items.map((it) => (it.kind === 'cue' ? `cue ${it.name} ${it.time}${it.looks.length ? ` looks ${it.looks.map((l) => `${l.layerName}:${l.name}`).join(',')}` : ''}`
      : it.kind === 'keys' ? `keys ${it.layerName}.${it.prop.replace(/^s:/, '')} ${it.keys.map((k) => `${k.t}=${k.v}${k.ease === 'ease' ? '' : `/${k.ease}`}`).join(' ')}`
        : `link ${it.layerName}.${it.key} ${it.link.band} ${it.link.how} ${it.link.lo}-${it.link.hi}`));
    return `bpm ${p.bpm || '?'} bar ${p.bar}s · sections ${secs}\n${lines.join('\n')}`;
  }
  // a director's step: its prompt (≈ 2,200 tokens lean), what we send, its answer (≈ 400)
  const estimate = (chars) => Math.round(2600 + Number(chars || 0) / 4);
  function summary(p) {
    const n = (k) => p.items.filter((x) => x.kind === k).length;
    const bits = [n('cue') && `${n('cue')} cue${n('cue') > 1 ? 's' : ''}`, n('keys') && `${n('keys')} drop move${n('keys') > 1 ? 's' : ''}`, n('link') && `${n('link')} beat link${n('link') > 1 ? 's' : ''}`].filter(Boolean);
    const looks = p.items.reduce((s, x) => s + (x.looks?.length || 0), 0);
    return `${bits.join(' · ') || 'nothing new'}${looks ? ` · ${looks} look${looks > 1 ? 's' : ''}` : ''}`;
  }

  return { DROP, KICK, SNARE, plan, fromAI, merge, text, compact, estimate, summary, sectionsOf, mainOf, fmt };
})();
if (typeof module !== 'undefined') module.exports = SongMapCore;
else window.SongMapCore = SongMapCore;
