// Labcut (round 18): what makes the Lab sequence (tools/three-seq.js) a complete, light video editor now that it is the
// owner's only video timeline. Pure data and math, no DOM: it loads in Node for tests, in the Lab (lazy group "lab")
// and, sent as text with the titles / transitions code, in the preview page (tools/three-sandbox.html), so what the
// timeline computes is what the preview and the frame-by-frame render draw.
//   framing    footage and pictures: fit (fill / fit inside / on a blurred fill), a framing { x, y, z } (x, y: −1…1,
//              where the crop sits in what overflows; z: zoom) per output format, keyframed from → to across the clip
//              (Ken Burns on stills; a reframe that follows the action for 9:16 vs 16:9)
//   sound      per-clip volume and fades, several sound tracks (song · voice · sfx), the music ducking under the voice
//              (the same envelope in the preview's gains and in ffmpeg's volume expression)
//   text       captions from .srt / .vtt or typed lines (a Captions track), caption looks from the app's title styles,
//              lower thirds; captions back out as an .srt next to a render
//   cuts       chop a clip on every bar / beat of the song; the compact transition library (one searchable picker)
//   color      a per-clip color look (the EditFX looks: one SVG color matrix the preview page applies to the clip)
//   outputs    one sequence, several outputs (9:16 · 1:1 · 16:9 · 4:5), rendered one after the other
const SeqCut = (() => {
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const smooth = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
  const lerp = (a, b, t) => a + (b - a) * t;

  // ---------- framing: fit, crop / pan, zoom, Ken Burns, per output format ----------
  const FITS = { cover: 'Fill the frame (crop)', contain: 'Fit inside (bars)', blur: 'Fit on a blurred fill' };
  const SPOTS = {
    center: ['Center', { x: 0, y: 0 }], left: ['Left', { x: -1, y: 0 }], right: ['Right', { x: 1, y: 0 }],
    top: ['Top', { x: 0, y: -1 }], bottom: ['Bottom', { x: 0, y: 1 }],
    'left-third': ['Left third', { x: -0.5, y: 0 }], 'right-third': ['Right third', { x: 0.5, y: 0 }],
  };
  const ZOOMS = [1, 1.1, 1.25, 1.5, 2];
  // camera moves across a clip (from → to): Ken Burns on stills, a slow drift on footage
  const MOTIONS = [
    { id: 'none', name: 'Still (no move)', a: null, b: null },
    { id: 'push-in', name: 'Slow push in', a: { z: 1 }, b: { z: 1.14 } },
    { id: 'pull-out', name: 'Slow pull out', a: { z: 1.14 }, b: { z: 1 } },
    { id: 'pan-right', name: 'Pan left → right', a: { x: -1, z: 1.12 }, b: { x: 1, z: 1.12 } },
    { id: 'pan-left', name: 'Pan right → left', a: { x: 1, z: 1.12 }, b: { x: -1, z: 1.12 } },
    { id: 'pan-down', name: 'Tilt top → bottom', a: { y: -1, z: 1.12 }, b: { y: 1, z: 1.12 } },
    { id: 'pan-up', name: 'Tilt bottom → top', a: { y: 1, z: 1.12 }, b: { y: -1, z: 1.12 } },
    { id: 'push-left', name: 'Push in, drifting left', a: { x: 0.4, z: 1.02 }, b: { x: -0.6, z: 1.2 } },
    { id: 'push-right', name: 'Push in, drifting right', a: { x: -0.4, z: 1.02 }, b: { x: 0.6, z: 1.2 } },
    { id: 'punch', name: 'Punch in (fast)', a: { z: 1 }, b: { z: 1.3 }, ease: 'out' },
  ];
  const MOTION = Object.fromEntries(MOTIONS.map((m) => [m.id, m]));
  const DEFAULT_STILL_MOTION = 'push-in'; // pictures move a little by default (a picture that sits still reads as a freeze)
  const pt = (o, d = {}) => ({ x: clamp(Number(o?.x ?? d.x ?? 0), -1, 1), y: clamp(Number(o?.y ?? d.y ?? 0), -1, 1), z: clamp(Number(o?.z ?? d.z ?? 1), 0.25, 6) });
  // the auto move of a clip (✦ Auto): one of the gentle ones, the same for the same clip
  function autoMotion(id) { let h = 7; for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const pool = ['push-in', 'pull-out', 'pan-right', 'pan-left', 'push-left', 'push-right']; return pool[h % pool.length]; }
  // The framing a clip has in a format: { fit, a: {x,y,z}, b: {x,y,z} | null, ease }. A clip's own per-format framing
  // (frames[fmt]) wins over its framing for every format (frame), then its motion; stills get the default move.
  function frameSpec(c, fmt) {
    if (!c) return null;
    const own = c.frames?.[fmt] || null;
    const base = own || c.frame || null;
    const fit = FITS[own?.fit] ? own.fit : FITS[c.fit] ? c.fit : 'cover';
    const mid = c.motion === 'auto' ? autoMotion(c.id) : c.motion ?? (c.kind === 'image' && !base?.to ? DEFAULT_STILL_MOTION : null);
    const m = mid && MOTION[mid];
    const a0 = pt(base);
    if (base?.to) return { fit, a: a0, b: pt(base.to, a0), ease: base.ease || 'inout' };
    if (m?.a) {
      // a move keeps the framing you set (the move happens around it)
      const a = pt({ x: (m.a.x ?? 0) + a0.x, y: (m.a.y ?? 0) + a0.y, z: (m.a.z ?? 1) * a0.z });
      const b = pt({ x: (m.b.x ?? 0) + a0.x, y: (m.b.y ?? 0) + a0.y, z: (m.b.z ?? 1) * a0.z });
      return { fit, a, b, ease: m.ease || 'inout' };
    }
    if (fit === 'cover' && !a0.x && !a0.y && a0.z === 1) return { fit, a: null, b: null };
    return { fit, a: a0, b: null };
  }
  const EASE = { inout: smooth, out: (t) => 1 - (1 - clamp(t, 0, 1)) ** 3, linear: (t) => clamp(t, 0, 1) };
  function frameAt(spec, p) {
    if (!spec?.a) return { x: 0, y: 0, z: 1 };
    if (!spec.b) return spec.a;
    const k = (EASE[spec.ease] || smooth)(p);
    return { x: lerp(spec.a.x, spec.b.x, k), y: lerp(spec.a.y, spec.b.y, k), z: lerp(spec.a.z, spec.b.z, k) };
  }
  // Where a source sw × sh lands in a W × H frame: { x, y, w, h } (fit + zoom, then the pan inside what overflows)
  function place(sw, sh, W, H, fit = 'cover', f = { x: 0, y: 0, z: 1 }) {
    if (!(sw > 0 && sh > 0)) return null;
    const k = (fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh)) * (f.z || 1);
    const w = sw * k; const h = sh * k;
    const ox = Math.max(0, (w - W) / 2); const oy = Math.max(0, (h - H) / 2);
    return { x: (W - w) / 2 - f.x * ox, y: (H - h) / 2 - f.y * oy, w, h };
  }
  // framing presets (the clip's Frame menu, /sequence frame): a spot, a zoom, a move from → to
  function parseFrame(text) {
    const s = String(text || '').toLowerCase().trim();
    const out = {};
    const spot = (w) => { const k = Object.keys(SPOTS).find((x) => x === w.replace(/\s+/g, '-') || SPOTS[x][0].toLowerCase() === w); return k ? { ...SPOTS[k][1] } : null; };
    const m = /from\s+([a-z -]+?)\s+to\s+([a-z -]+?)(?:\s+zoom|$)/.exec(s);
    if (m) { const a = spot(m[1].trim()); const b = spot(m[2].trim()); if (a && b) { Object.assign(out, a); out.to = b; } }
    const z = /(?:zoom\s*)?(\d+(?:\.\d+)?)\s*(%|x|×)/.exec(s);
    if (z) { const v = Number(z[1]); out.z = z[2] === '%' ? v / 100 : v; }
    const x = /\bx\s*(-?\d+(?:\.\d+)?)/.exec(s); const y = /\by\s*(-?\d+(?:\.\d+)?)/.exec(s);
    if (x) out.x = clamp(Number(x[1]), -1, 1);
    if (y) out.y = clamp(Number(y[1]), -1, 1);
    if (!m) { const sp = spot(s.replace(/\s*(?:zoom\s*)?\d+(?:\.\d+)?\s*(%|x|×)/, '').replace(/\bx\s*-?[\d.]+|\by\s*-?[\d.]+/g, '').trim()); if (sp) Object.assign(out, sp); }
    if (out.to && out.z) out.to.z = out.z;
    if (/\bfit\b|inside|bars/.test(s)) out.fit = 'contain';
    if (/blur/.test(s)) out.fit = 'blur';
    if (/\bfill\b|crop/.test(s)) out.fit = 'cover';
    if (/^(reset|auto|center|centre)$/.test(s)) return { reset: true };
    return Object.keys(out).length ? out : null;
  }

  // ---------- sound: volume, fades, ducking under the voice ----------
  const VOLUMES = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
  const FADES = [0, 0.25, 0.5, 1, 2, 4];
  const DUCKS = [{ id: 0.5, name: 'A little (−6 dB)' }, { id: 0.25, name: 'Clearly (−12 dB)' }, { id: 0.12, name: 'A lot (−18 dB)' }];
  const DEFAULT_DUCK = 0.25;
  const DUCK_RAMP = 0.25; // seconds the music takes to go down / come back up
  // "50%", "0.5", "-6 dB" → a gain
  function parseVolume(v) {
    const s = String(v ?? '').trim().toLowerCase();
    if (/^(mute|off|0)$/.test(s)) return 0;
    let m = /^(-?\d+(?:\.\d+)?)\s*db$/.exec(s);
    if (m) return r4(10 ** (Number(m[1]) / 20));
    m = /^(\d+(?:\.\d+)?)\s*%$/.exec(s);
    if (m) return r4(Number(m[1]) / 100);
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return r4(clamp(n > 4 ? n / 100 : n, 0, 4));
  }
  const dbOf = (g) => (g > 0 ? `${(20 * Math.log10(g)).toFixed(1)} dB` : '−∞');
  // a clip's own envelope at its local time (fades in / out)
  function envelope(c, local, len) {
    let k = 1;
    if (c.fadeIn > 0) k = Math.min(k, local / c.fadeIn);
    if (c.fadeOut > 0) k = Math.min(k, (len - local) / c.fadeOut);
    return clamp(k, 0, 1);
  }
  // when the voice speaks: merged ranges of the voice clips (a hair before and after, so a breath doesn't pump)
  const isVoice = (k) => k?.type === 'audio' && /^voice/i.test(k.name || '');
  function voiceRanges(e, itemEnd) {
    const rs = (e?.tracks || []).filter((k) => isVoice(k) && !k.mute).flatMap((k) => k.items.filter((x) => !x.off).map((x) => [x.start - 0.1, itemEnd(x) + 0.15])).sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const r of rs) { const last = out[out.length - 1]; if (last && r[0] <= last[1] + 0.3) last[1] = Math.max(last[1], r[1]); else out.push([r4(Math.max(0, r[0])), r4(r[1])]); }
    return out;
  }
  // the music's gain at T (1 → amount inside a range, ramps of DUCK_RAMP on both sides)
  function duckAt(ranges, T, amount = DEFAULT_DUCK) {
    if (!ranges?.length) return 1;
    let k = 0;
    for (const [a, b] of ranges) {
      if (T < a - DUCK_RAMP || T > b + DUCK_RAMP) continue;
      const v = T < a ? 1 - (a - T) / DUCK_RAMP : T > b ? 1 - (T - b) / DUCK_RAMP : 1;
      k = Math.max(k, clamp(v, 0, 1));
    }
    return 1 - k * (1 - amount);
  }
  // ffmpeg: the same envelope and ducking for one sound part in program time (after adelay: t is program time)
  function ffFades(p) {
    const out = [];
    if (p.fadeIn > 0) out.push(`afade=t=in:st=0:d=${p.fadeIn.toFixed(3)}`);
    if (p.fadeOut > 0) out.push(`afade=t=out:st=${Math.max(0, p.len - p.fadeOut).toFixed(3)}:d=${p.fadeOut.toFixed(3)}`);
    return out;
  }
  function ffDuck(ranges, amount = DEFAULT_DUCK, from = 0) {
    const rs = (ranges || []).map(([a, b]) => [a - from, b - from]).filter(([, b]) => b > -DUCK_RAMP);
    if (!rs.length) return null;
    const R = DUCK_RAMP.toFixed(3);
    // per range: the ramp in, held, the ramp out (clip(…, 0, 1)); max over ranges; 1 − k (1 − amount)
    const one = ([a, b]) => `clip(min((t-${(a - DUCK_RAMP).toFixed(3)})/${R},(${(b + DUCK_RAMP).toFixed(3)}-t)/${R}),0,1)`;
    const k = rs.map(one).reduce((acc, x) => (acc ? `max(${acc},${x})` : x), '');
    return `volume='1-${(1 - amount).toFixed(3)}*${k}':eval=frame`;
  }

  // ---------- captions and lower thirds ----------
  // caption looks: the app's own caption title styles (cut-presets TITLE_STYLES "Captions")
  const CAPTION_LOOKS = [
    { id: 'clean', name: 'Clean', style: 'caption', anim: 'fade' },
    { id: 'box', name: 'On a box', style: 'caption-box', anim: 'fade' },
    { id: 'social', name: 'Social (big, stroked)', style: 'caption-tiktok', anim: 'pop-words' },
    { id: 'gold', name: 'Forgeheart gold', style: 'caption-gold', anim: 'words-rise' },
    { id: 'subtitle', name: 'Subtitle (small)', style: 'subtitle', anim: 'none' },
  ];
  const CAPTION_LOOK = Object.fromEntries(CAPTION_LOOKS.map((l) => [l.id, l]));
  const tcOf = (s) => { const m = /^(?:(\d+):)?(\d+):(\d+)(?:[.,](\d{1,3}))?$/.exec(String(s).trim()); if (!m) return null; return (Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3]) + (m[4] ? Number(m[4].padEnd(3, '0')) / 1000 : 0); };
  // .srt and .vtt: [{ a, b, text }] (styling tags dropped, lines joined with a line break)
  function parseSubs(text) {
    const out = [];
    const blocks = String(text || '').replace(/\r/g, '').replace(/^﻿/, '').split(/\n\s*\n/);
    for (const bl of blocks) {
      const ls = bl.split('\n').map((x) => x.trim()).filter(Boolean);
      const i = ls.findIndex((x) => /-->/.test(x));
      if (i < 0) continue;
      const [sa, sb] = ls[i].split('-->').map((x) => x.trim().split(/\s+/)[0]);
      const a = tcOf(sa); const b = tcOf(sb);
      const words = ls.slice(i + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').trim();
      if (a == null || b == null || !(b > a) || !words) continue;
      out.push({ a: r4(a), b: r4(b), text: words });
    }
    return out.sort((x, y) => x.a - y.a);
  }
  const srtTime = (t) => { const ms = Math.round(Math.max(0, t) * 1000); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
  // title items (text track) → .srt (a range render: from its In, the rest moved up)
  function toSRT(items, { from = 0, to = Infinity } = {}) {
    const cues = items.filter((x) => x.b > from && x.a < to).map((x) => ({ a: Math.max(0, x.a - from), b: Math.min(to, x.b) - from, text: x.text }));
    return cues.map((c, i) => `${i + 1}\n${srtTime(c.a)} --> ${srtTime(c.b)}\n${c.text}\n`).join('\n');
  }
  // typed lines → cues: spread over [start, end] (one each, equal), or `each` seconds a line from start; a beat grid
  // (each = bar length) keeps them on the music
  function typedCues(lines, { start = 0, end = null, each = null } = {}) {
    const ls = [].concat(lines || []).flatMap((x) => String(x).split(/\n|\s\|\s/)).map((x) => x.trim()).filter(Boolean);
    if (!ls.length) return [];
    const step = each > 0 ? each : end != null && end > start ? (end - start) / ls.length : 2;
    return ls.map((text, i) => ({ a: r4(start + i * step), b: r4(start + (i + 1) * step - 0.04), text }));
  }
  function captionItem(cue, look = 'clean') {
    const L = CAPTION_LOOK[look] || CAPTION_LOOKS[0];
    return { kind: 'title', start: r4(cue.a), dur: r4(Math.max(0.1, cue.b - cue.a)), text: cue.text, style: L.style, anim: L.anim, out: 'fade', animDur: 0.18, caption: L.id, mute: true };
  }
  // a lower third: a name, and a second line (role) when given ("Ada Lovelace — Engineer" or "Ada | Engineer")
  function lowerThird(text, { preset = 'forge', at = 0, dur = 4 } = {}) {
    const [a, b] = String(text || 'Name').split(/\s+[—–|-]\s+|\s*\|\s*/);
    return { kind: 'title', start: r4(Math.max(0, at)), dur: r4(Math.max(0.5, dur)), text: b ? `${a}\n${b}` : a, lower: preset, out: 'fade', mute: true };
  }

  // ---------- cuts on the music ----------
  // the bar (or beat, or n bars) lines strictly inside (a, b): where "Chop on every bar" splits
  function chopTimes(grid, a, b, { every = 'bar', songStart = 0 } = {}) {
    if (!grid?.bpm || !(b > a)) return [];
    const beat = 60 / grid.bpm; const bar = beat * (grid.bpb || 4);
    const step = every === 'beat' ? beat : typeof every === 'number' ? bar * every : bar;
    const a0 = (grid.anchor || 0) + songStart;
    const out = [];
    for (let t = a0 + Math.ceil((a + 0.05 - a0) / step) * step; t < b - 0.05 && out.length < 400; t += step) out.push(r4(t));
    return out;
  }

  // ---------- transitions: the compact library (one searchable picker) ----------
  // the ones most edits use first, then every other one by group (EditFX + the Lab moves)
  const TRANS_PICKS = ['cut', 'dissolve', 'dip-black', 'dip-white', 'flash-white', 'wipe-left', 'wipe-up', 'soft-wipe-left', 'push-left', 'push-up', 'zoom-in', 'zoom-out', 'whip-left', 'spin', 'glitch', 'rgb-split', 'pixelate', 'iris-open', 'blur-dissolve', 'light-leak', 'film-burn'];
  function transLibrary(FX, labMoves = []) {
    const T = FX?.TRANS || {};
    const picks = TRANS_PICKS.filter((id) => T[id]).map((id) => ({ id, name: T[id].name, group: '★ Most used' }));
    const seen = new Set(picks.map((x) => x.id));
    const lab = labMoves.map((t) => ({ id: t.id, name: t.name, group: '✦ Lab moves', desc: t.desc }));
    for (const x of lab) seen.add(x.id);
    const rest = (FX?.TRANSITIONS || []).filter((t) => !seen.has(t.id)).map((t) => ({ id: t.id, name: t.name, group: t.group }));
    return [...picks, ...lab, ...rest];
  }
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  function search(list, q) {
    const s = norm(q);
    if (!s) return list;
    const words = s.split(' ');
    return list.filter((x) => { const h = norm(`${x.name} ${x.id} ${x.group || ''}`); return words.every((w) => h.includes(w)); });
  }

  // ---------- color looks per clip ----------
  // the EditFX look (and its strength) as one color matrix + gamma, ready for an SVG filter in the preview page
  function lookSpec(FX, color) {
    if (!FX || !color?.look) return null;
    const g = FX.grade({ look: color.look, amt: color.amt ?? 1 });
    const cm = g ? FX.colorMath(g) : null;
    if (!cm) return null;
    return { id: `${color.look}@${color.amt ?? 1}`, m: FX.svgMatrix(cm), gamma: Number((cm.gamma || 1).toFixed(4)) };
  }
  const LOOK_PICKS = ['teal-orange', 'blockbuster', 'moody', 'golden-hour', 'bw', 'portra', 'super8', 'bleach'];

  // ---------- outputs: one sequence, several formats ----------
  const OUTPUT_SETS = { socials: ['9:16', '1:1', '16:9'], all: ['9:16', '4:5', '1:1', '16:9'], vertical: ['9:16', '4:5'] };
  function parseOutputs(text, formats) {
    const s = String(text || '').toLowerCase();
    if (OUTPUT_SETS[s.trim()]) return OUTPUT_SETS[s.trim()].slice();
    const fs = (s.match(/\d+:\d+/g) || []).filter((f) => formats[f]);
    return [...new Set(fs)];
  }

  return {
    FITS, SPOTS, ZOOMS, MOTIONS, MOTION, DEFAULT_STILL_MOTION, autoMotion, frameSpec, frameAt, place, parseFrame,
    VOLUMES, FADES, DUCKS, DEFAULT_DUCK, DUCK_RAMP, parseVolume, dbOf, envelope, isVoice, voiceRanges, duckAt, ffFades, ffDuck,
    CAPTION_LOOKS, CAPTION_LOOK, parseSubs, toSRT, srtTime, typedCues, captionItem, lowerThird,
    chopTimes, TRANS_PICKS, transLibrary, search, lookSpec, LOOK_PICKS, OUTPUT_SETS, parseOutputs,
  };
})();
if (typeof module !== 'undefined') module.exports = SeqCut;
