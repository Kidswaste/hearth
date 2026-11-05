// ✦ Critique this (round 130, critique130): the pure part, no DOM (loads in Node: dev/checks/critique130.js reads it
// in the window, the fake engines answer its prompt). tools/three-critique.js is the window side.
// One AI pass, on the owner's click only: it looks at ONE contact sheet of the Lab scene (3–4 frames at the song's key
// moments: the drop, a quiet part, the peak; or a few moments apart with no song), and reads the scene's outline (layers,
// slider values, keyframes), the project brief (mood, palette, steps, risks), the health state (LabHealth, the scene
// doctor's free findings) and the last critiques (so the advice isn't repeated). It answers JSON: 4 improvements, best
// first (3 are shown; a 4th fills in for one that repeats earlier advice), and the brief's risks checked.
// Each improvement has a fix:
//   { kind: 'slider', layer, set: { key: value } }       a plain slider change: applied here, one undo step
//   { kind: 'keys', layer, property, keys: [{ time, value }] }  keyframes on a property that has none: applied here
//   { kind: 'message', text }                            anything else: sent to the director as the owner's message
// Store: kv 'three-critiques' (synced with the projects: sync-kinds.js's three-* rule) { v: 1, list: [{ id, list: [rec] }] }
//   id = 'project:<projectId>' (or 'scene:<sceneId>' outside a project), its last 5 critiques, newest last:
//   rec = { at, by, items: [{ title, why, kind, state: 'shown' | 'applied' | 'sent' | 'dismissed' }], risks: [{ risk, ok, note }] }
const CritiqueCore = (() => {
  const STORE = 'three-critiques';
  const KEEP = 5; // critiques kept per project
  const SHOW = 3; // improvements shown
  const HEAD = 'Critique this Lab scene';
  const PERSONA = 'You are a sharp, kind art director for music visuals made in a three.js editor. Be concrete and brief. Reply with JSON only.';
  const cap = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const mmss = (s) => { const t = Math.max(0, Math.round(Number(s) || 0)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
  const secret = (s) => (typeof AccessRules !== 'undefined' && AccessRules.redact ? AccessRules.redact(String(s ?? '')) : String(s ?? '')).replace(/\b(sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{12,})/g, '•••');

  // ---------- the moments to look at ----------
  // song analysis { duration, sections: [{ start, end, label, energy }], drops: [s], level: [0..1 per frame], fps }
  // → up to n moments [{ t, label }] (the drop first in importance; sorted by time), or null with no song
  function moments(a, n = 4) {
    if (!a || !(num(a.duration) > 0)) return null;
    const dur = a.duration;
    const level = Array.isArray(a.level) ? a.level : null; const fps = a.fps || 30;
    const energy = (s) => {
      if (num(s.energy)) return s.energy;
      if (s.energy === 'loud') return 0.9; if (s.energy === 'quiet') return 0.1; if (s.energy === 'medium') return 0.5;
      if (!level) return null;
      const i0 = Math.floor(s.start * fps); const i1 = Math.max(i0 + 1, Math.floor(s.end * fps)); let m = 0; let k = 0;
      for (let i = i0; i < i1 && i < level.length; i += 1) { m += level[i]; k += 1; }
      return k ? m / k : null;
    };
    const secs = (a.sections || []).filter((s) => num(s.start) != null && num(s.end) > s.start).map((s) => ({ ...s, e: energy(s) }));
    const picks = [];
    const add = (t, label) => { if (num(t) == null) return; const x = Math.max(0, Math.min(dur - 0.1, t)); if (picks.length < n && !picks.some((p) => Math.abs(p.t - x) < 1.5)) picks.push({ t: r3(x), label }); };
    const drop = (a.drops || []).find((t) => num(t) != null);
    if (drop != null) add(drop + 0.3, 'the drop');
    const rated = secs.filter((s) => s.e != null);
    if (rated.length) {
      const quiet = rated.reduce((m, s) => (s.e < m.e ? s : m));
      const loud = rated.reduce((m, s) => (s.e > m.e ? s : m));
      if (drop == null) add((loud.start + loud.end) / 2, 'the peak');
      add((quiet.start + quiet.end) / 2, 'a quiet part');
      add((loud.start + loud.end) / 2, 'the peak');
    }
    add(Math.min(dur * 0.1, 8), 'the opening');
    for (const f of [0.5, 0.75, 0.3, 0.9]) add(dur * f, `${Math.round(f * 100)} % in`);
    return picks.sort((x, y) => x.t - y.t);
  }

  // ---------- the scene's outline (words and numbers) ----------
  // scene { name, frame, palette, layers: [{ id, name, visible, opacity, keyframes, sliders: [{ key, label, value, min, max }] }] }
  function outline(scene, { max = 1800 } = {}) {
    if (!scene) return '';
    const L = [`Scene "${cap(scene.name || 'scene', 48)}"${scene.frame ? ` · frame ${cap(typeof scene.frame === 'string' ? scene.frame : `${scene.frame.w || scene.frame.width}×${scene.frame.h || scene.frame.height}`, 20)}` : ''}${(scene.palette || []).length ? ` · palette ${scene.palette.slice(0, 6).join(' ')}` : ''}`];
    L.push('Layers, bottom first (sliders: key value (min–max)):');
    for (const l of (scene.layers || []).slice(0, 14)) {
      const sl = (l.sliders || []).filter((s) => s.key != null).slice(0, 8).map((s) => {
        const v = typeof s.value === 'number' ? r3(s.value) : cap(JSON.stringify(s.value), 12);
        return `${s.key} ${v}${num(s.min) != null && num(s.max) != null ? ` (${r3(s.min)}–${r3(s.max)})` : ''}`;
      });
      const keys = l.keyframes && typeof l.keyframes === 'object' ? Object.keys(l.keyframes) : [];
      L.push(`- "${cap(l.name, 32)}"${l.visible === false ? ' (hidden)' : ''}${num(l.opacity) != null && l.opacity !== 1 ? ` opacity ${r3(l.opacity)}` : ''}${sl.length ? `: ${sl.join(', ')}` : ''}${keys.length ? ` · keyed: ${keys.slice(0, 4).join(', ')}` : ''}`);
    }
    const t = L.join('\n');
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  }

  // ---------- the history (the last critiques of this project) ----------
  const norm = (d) => ({ v: 1, list: Array.isArray(d?.list) ? d.list.filter((e) => e && typeof e.id === 'string' && Array.isArray(e.list)) : [] });
// one id, or several (a project's and its scene's own, from before the scene joined the project): merged by time
  function recent(data, ids) {
    const want = [].concat(ids).filter(Boolean);
    const seen = new Set();
    return norm(data).list.filter((e) => want.includes(e.id)).flatMap((e) => e.list).sort((a, b) => (a.at || 0) - (b.at || 0))
      .filter((r) => (seen.has(r.at) ? false : seen.add(r.at))).slice(-KEEP);
  }
  function push(data, id, rec) {
    const d = norm(data);
    const e = d.list.find((x) => x.id === id);
    const list = [...(e?.list || []), rec].slice(-KEEP);
    return { ...d, list: e ? d.list.map((x) => (x.id === id ? { ...x, list } : x)) : [...d.list, { id, list }] };
  }
  function mark(data, id, at, i, state) {
    const d = norm(data);
    return { ...d, list: d.list.map((e) => (e.id !== id ? e : { ...e, list: e.list.map((r) => (r.at !== at ? r : { ...r, items: r.items.map((it, k) => (k === i ? { ...it, state } : it)) })) })) };
  }
  // the same advice again? (the words that matter, ≥ half shared)
  const STOP = new Set('the and for with that this its into from more less than then they them have has are was were your you when where what which over under onto just very much make makes made give gives some each also only a an of on in to at by it is as or be'.split(' '));
  const words = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9#\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
  function similar(a, b) {
    const A = words(a); const B = words(b);
    if (!A.size || !B.size) return false;
    let k = 0; for (const w of A) if (B.has(w)) k += 1;
    return k / Math.min(A.size, B.size) >= 0.6;
  }
  const said = (hist) => hist.flatMap((r) => (r.items || []).map((it) => it.title)).filter(Boolean);
  // the first 3 that weren't said before; earlier advice fills in only when there aren't 3 new ones (marked again)
  function fresh(items, hist) {
    const old = said(hist);
    const isOld = (it) => old.some((t) => similar(t, it.title));
    const out = items.filter((it) => !isOld(it)).slice(0, SHOW);
    for (const it of items) { if (out.length >= SHOW) break; if (!out.includes(it)) out.push({ ...it, again: true }); }
    return out;
  }

  // ---------- the brief, in a few lines ----------
  function briefLines(b) {
    if (!b) return [];
    const L = [];
    if (b.mood) L.push(`mood: ${cap(b.mood, 80)}`);
    if (b.look) L.push(`look: ${cap(b.look, 120)}`);
    if ((b.palette || []).length) L.push(`palette: ${b.palette.slice(0, 6).join(' ')}`);
    const done = new Set(b.done || []);
    if ((b.steps || []).length) L.push(`steps: ${b.steps.slice(0, 6).map((s, i) => `${done.has(i) ? '✓' : '○'} ${cap(s, 60)}`).join(' · ')}`);
    if ((b.risks || []).length) L.push(`risks: ${b.risks.slice(0, 4).map((r, i) => `[${i}] ${cap(r, 70)}`).join(' · ')}`);
    return L;
  }

  // ---------- the prompt ----------
  // x = { outline, brief, song: { bpm, duration }, frames: [{ n, t, label }], health: ['…'], doctor: ['…'], history: [rec], pictures }
  function prompt(x) {
    const L = [HEAD, `You see ${x.pictures ? 'ONE contact sheet picture of it' : 'no picture of it (none could be taken)'}${x.frames?.length ? `: frames numbered left to right, ${x.frames.map((f) => `${f.n} at ${mmss(f.t)}${f.label ? ` (${f.label})` : ''}`).join(', ')}` : ''}.`];
    if (x.song) L.push(`Song: ${x.song.bpm ? `${Math.round(x.song.bpm)} BPM, ` : ''}${x.song.duration ? `${mmss(x.song.duration)} long` : ''}.`);
    L.push('', x.outline || 'Scene: (no outline)');
    const bl = briefLines(x.brief);
    if (bl.length) L.push('', 'The project brief:', ...bl.map((l) => `  ${l}`));
    const h = [...(x.health || []), ...(x.doctor || [])].slice(0, 6);
    L.push('', h.length ? `Health: ${h.map((s) => cap(s, 110)).join(' | ')}` : 'Health: no errors.');
    const old = said(x.history || []);
    if (old.length) L.push('', `Earlier critiques (do NOT repeat these; build on them): ${old.slice(-12).map((t) => `"${cap(t, 60)}"`).join(' · ')}`);
    L.push('',
      'Give exactly 4 improvements, best first. Each: a short concrete title with numbers where they help (e.g. "The drop lacks contrast: push glow 0.4 → 0.8") and a one-line why grounded in what you see.',
      'fix: a slider change you can name exactly → {"kind":"slider","layer":"<layer name>","set":{"<key>":<value in its range>}}; keyframes on a property with no keys yet → {"kind":"keys","layer":"…","property":"opacity|scale|<slider key>","keys":[{"time":s,"value":v}]}; anything else (code, new layers, colours, camera) → {"kind":"message","text":"<what to ask the director, one or two sentences>"}.',
      bl.some((l) => l.startsWith('risks:')) ? 'Also check each brief risk by its [index] against what you see: "risks":[{"i":0,"ok":true|false,"note":"…"}].' : 'No brief risks to check: "risks": [].',
      'JSON only: {"items":[{"title":"…","why":"…","fix":{…}}],"risks":[…]}');
    return secret(L.join('\n'));
  }

  // ---------- the answer ----------
  // layers: the scene's [{ name, id, sliders: [{ key, label, min, max }], keyframes }] to check a fix against
  function parse(text, layers = []) {
    const s = String(text || '');
    const a = s.indexOf('{'); const b = s.lastIndexOf('}');
    let j = null; try { j = a >= 0 && b > a ? JSON.parse(s.slice(a, b + 1)) : null; } catch { j = null; }
    if (!j || !Array.isArray(j.items)) throw new Error('The critique didn\'t come back in a readable form. Try again.');
    const byName = (n) => layers.find((l) => l.name === n || l.id === n) || layers.find((l) => String(l.name).toLowerCase() === String(n || '').toLowerCase()) || null;
    const items = j.items.filter((it) => it && it.title).slice(0, 6).map((it) => {
      const title = cap(it.title, 110); const why = cap(it.why, 160);
      const f = it.fix || {};
      const ask = cap(f.text || `${title}. ${why}`, 400);
      let fix = { kind: 'message', text: ask };
      const L = byName(f.layer);
      if (f.kind === 'slider' && L && f.set && typeof f.set === 'object') {
        const set = {};
        for (const [k, v] of Object.entries(f.set)) {
          const sl = (L.sliders || []).find((x) => x.key === k || x.label === k);
          if (!sl) continue;
          if (typeof v === 'number' && num(sl.min) != null && num(sl.max) != null) set[sl.key] = r3(Math.max(sl.min, Math.min(sl.max, v)));
          else if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') set[sl.key] = v;
        }
        if (Object.keys(set).length) fix = { kind: 'slider', layer: L.name, layerId: L.id, set };
      } else if (f.kind === 'keys' && L && typeof f.property === 'string' && Array.isArray(f.keys)) {
        const keyed = L.keyframes && typeof L.keyframes === 'object' ? Object.keys(L.keyframes) : [];
        const prop = f.property.trim();
        const keys = f.keys.filter((k) => num(k?.time) != null && (num(k.value) != null)).slice(0, 16).map((k) => ({ time: r3(k.time), value: r3(k.value) }));
        const taken = keyed.some((p) => p === prop || p === `slider ${prop}`);
        if (keys.length >= 2 && !taken) fix = { kind: 'keys', layer: L.name, layerId: L.id, property: prop, keys };
      }
      return { title, why, fix };
    });
    if (items.length < 1) throw new Error('The critique had no improvements in it. Try again.');
    const risks = (Array.isArray(j.risks) ? j.risks : []).filter((r) => r && Number.isInteger(r.i)).slice(0, 6).map((r) => ({ i: r.i, ok: r.ok === true, note: cap(r.note, 120) }));
    return { items, risks };
  }

  // the owner's message for a fix the director makes (and for "send it instead")
  const dot = (t) => (/[.!?…]$/.test(t) ? t : `${t}.`);
  const message = (it) => (it.fix?.kind === 'message' && it.fix.text
    ? `${dot(it.fix.text)}${it.why ? ` (Why: ${dot(it.why)})` : ''}`
    : `${dot(it.title)}${it.why ? ` ${dot(it.why)}` : ''} Please make this change and keep everything else.`);
  // what the chip says it will do
  function fixWords(f) {
    if (!f) return '';
    if (f.kind === 'slider') return `${f.layer}: ${Object.entries(f.set).map(([k, v]) => `${k} → ${v}`).join(', ')}`;
    if (f.kind === 'keys') return `${f.layer}: ${f.keys.length} keys on ${f.property}`;
    return 'sends it to the director';
  }

  // ---------- the cost (shown before running) ----------
  // a lean helper run: its own small prompt, the critique's words, one picture (≈ w×h / 750 tokens, longest side ≤ 1568)
  function estimate({ chars = 2000, frames = 4, aspect = 16 / 9 } = {}) {
    const cols = Math.max(1, Math.min(4, frames));
    const rows = Math.ceil(frames / cols);
    let w = cols * 426 + 6; let h = rows * (Math.round(420 / aspect) + 28) + 6;
    const s = Math.min(1, 1568 / Math.max(w, h)); w *= s; h *= s;
    const picture = frames ? Math.round((w * h) / 750) : 0;
    return { input: Math.round(1600 + chars / 3.6 + picture), output: 450, picture };
  }
  const kfmt = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(Math.round(n)));
  const costLine = (c, who = 'Claude', model = '', frames = 4) => `About ${kfmt(c.input)} tokens in (${frames ? `1 picture of ${frames} frames` : 'no picture'}) and ${kfmt(c.output)} out · ${who}${model ? ` · ${model}` : ''}`;

  const api = { STORE, KEEP, SHOW, HEAD, PERSONA, moments, outline, norm, recent, push, mark, similar, said, fresh, briefLines, prompt, parse, message, fixWords, estimate, costLine, mmss };
  if (typeof module !== 'undefined') module.exports = api;
  return api;
})();
if (typeof window !== 'undefined') window.CritiqueCore = CritiqueCore;
