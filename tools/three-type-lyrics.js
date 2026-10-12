// Lyrics for the Lab's kinetic type (round 25, type): plain math, no DOM (runs in Node for dev/type-test.js).
// - parse(text, name?) reads pasted lyrics, .lrc (also "enhanced" <mm:ss.xx> word times) or .srt / .vtt into lines
//   [{ a, b, text, w }] (a / b: seconds or null; w: word start times or null).
// - align(lines, music, opts) puts untimed lines on the song: the singing span split by syllables, each line start
//   snapped to an onset near the beat (kick / snare / hats from the music analysis, the user's hit markers), words
//   spread by syllables and snapped to onsets inside the line. Timed lines are only tightened onto onsets nearby.
// - tap(lines, i, t, music) is the tap-along correction: line i starts at t (snapped within 80 ms), the lines after it
//   move with it; untap(lines, i) undoes by returning the saved line.
// - toLRC / toSRT / pack / unpack (the compact form a type layer's code keeps: [[a, b, "text", [w…]]…]).
const TypeLyrics = (() => {
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const tcOf = (s) => { const m = /^(?:(\d+):)?(\d+):(\d+)(?:[.,](\d{1,3}))?$/.exec(String(s).trim()); if (!m) return null; return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + (m[4] ? Number(m[4].padEnd(3, '0')) / 1000 : 0); };
  const lrcT = (m, s, f) => Number(m) * 60 + Number(s) + (f ? Number(String(f).padEnd(3, '0').slice(0, 3)) / 1000 : 0);

  // ---------- reading ----------
  function kindOf(text, name = '') {
    if (/\.lrc$/i.test(name) || /^\s*\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/m.test(text)) return 'lrc';
    if (/\.(srt|vtt)$/i.test(name) || /-->/.test(text)) return 'srt';
    return 'plain';
  }
  function parseLRC(text) {
    const out = []; let offset = 0;
    for (const raw of String(text).replace(/\r/g, '').split('\n')) {
      const off = /^\s*\[offset:\s*([+-]?\d+)\s*\]/i.exec(raw);
      if (off) { offset = Number(off[1]) / 1000; continue; }
      const stamps = []; let rest = raw; let m;
      while ((m = /^\s*\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/.exec(rest))) { stamps.push(lrcT(m[1], m[2], m[3])); rest = rest.slice(m[0].length); }
      if (!stamps.length) continue; // ([ti:], [ar:]… tags)
      // enhanced LRC: <mm:ss.xx> before each word
      const w = []; const words = [];
      const parts = rest.split(/(<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>)/);
      let pend = null;
      for (const p of parts) {
        const wm = /^<(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?>$/.exec(p);
        if (wm) { pend = lrcT(wm[1], wm[2], wm[3]); continue; }
        for (const word of p.split(/\s+/).filter(Boolean)) { words.push(word); w.push(pend); pend = null; }
      }
      const line = words.join(' ').trim();
      for (const a of stamps) out.push({ a: r3(Math.max(0, a - offset)), b: null, text: line, w: w.some((x) => x != null) ? w.map((x) => (x == null ? null : r3(Math.max(0, x - offset)))) : null });
    }
    out.sort((x, y) => x.a - y.a);
    // an empty timed line ends the one before (a gap); otherwise a line lasts until the next
    const lines = [];
    for (let i = 0; i < out.length; i += 1) {
      const L = out[i]; const nx = out[i + 1];
      if (!L.text) { if (lines.length && lines[lines.length - 1].b == null) lines[lines.length - 1].b = L.a; continue; }
      lines.push({ ...L, b: nx ? nx.a : null });
    }
    for (const L of lines) if (L.w) { let last = L.a; L.w = L.w.map((x) => { last = x == null ? last : x; return last; }); }
    return lines;
  }
  function parseSRT(text) {
    const out = [];
    for (const bl of String(text || '').replace(/\r/g, '').replace(/^﻿/, '').split(/\n\s*\n/)) {
      const ls = bl.split('\n').map((x) => x.trim()).filter(Boolean);
      const i = ls.findIndex((x) => /-->/.test(x));
      if (i < 0) continue;
      const [sa, sb] = ls[i].split('-->').map((x) => x.trim().split(/\s+/)[0]);
      const a = tcOf(sa); const b = tcOf(sb);
      const words = ls.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').replace(/\{\\[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
      if (a == null || b == null || !(b > a) || !words) continue;
      out.push({ a: r3(a), b: r3(b), text: words, w: null });
    }
    return out.sort((x, y) => x.a - y.a);
  }
  // pasted lyrics: one line each; [Chorus] / (x2) / blank lines dropped; "x2" repeats are kept once
  function parsePlain(text) {
    return String(text || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/^\s*\[[^\]]*\]\s*$/, '').replace(/\s+/g, ' ').trim())
      .filter((l) => l && !/^\(?x\d+\)?$/i.test(l)).map((t) => ({ a: null, b: null, text: t, w: null }));
  }
  function parse(text, name = '') {
    const k = kindOf(text, name);
    const lines = k === 'lrc' ? parseLRC(text) : k === 'srt' ? parseSRT(text) : parsePlain(text);
    return { kind: k, lines, timed: lines.length > 0 && lines.every((L) => L.a != null) };
  }

  // ---------- syllables (enough to share time between lines and words) ----------
  function syllables(word) {
    const w = String(word).toLowerCase().replace(/[^a-zà-ÿ]/g, '');
    if (!w) return /\d/.test(word) ? 2 : 1;
    if (w.length <= 3) return 1;
    const v = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '').match(/[aeiouyà-ÿ]{1,2}/g);
    return Math.max(1, v ? v.length : 1);
  }
  const lineSyl = (t) => String(t).split(/\s+/).filter(Boolean).reduce((s, w) => s + syllables(w), 0);

  // ---------- the music: onsets and the beat grid from the Lab's analysis ----------
  // music: { duration, bpm, beats: [s], downbeat, bpb, onsets: { kick: [{t}|s], snare, hats }, markers: { kick: [s], snare, hit },
  //   sections: [{ start, end, label }] }
  function onsetsOf(music) {
    const all = [];
    const take = (arr, w) => { for (const x of arr || []) { const t = typeof x === 'number' ? x : x?.t; if (Number.isFinite(t)) all.push({ t, w }); } };
    const o = music?.onsets || {};
    take(o.kick, 1); take(o.snare, 0.9); take(o.hats, 0.45); take(o.vocal, 1.2);
    const mk = music?.markers || {};
    take(mk.kick, 1.3); take(mk.snare, 1.2); take(mk.hit, 1.4);
    all.sort((a, b) => a.t - b.t);
    // merge hits closer than 25 ms (the strongest stays)
    const out = [];
    for (const x of all) { const p = out[out.length - 1]; if (p && x.t - p.t < 0.025) { if (x.w > p.w) { p.t = x.t; p.w = x.w; } } else out.push({ ...x }); }
    return out;
  }
  function beatsOf(music) {
    if (music?.beats?.length) return music.beats.slice();
    const bpm = music?.bpm || 120; const d = music?.duration || 0; const sp = 60 / bpm; const a0 = music?.downbeat || 0;
    const out = []; for (let t = a0 - Math.floor(a0 / sp) * sp; t < d; t += sp) out.push(r3(t));
    return out;
  }
  // index of the last element ≤ t (sorted numbers, or {t})
  function lastAt(arr, t, key = null) { let lo = 0; let hi = arr.length - 1; let k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; const v = key ? arr[m][key] : arr[m]; if (v <= t) { k = m; lo = m + 1; } else hi = m - 1; } return k; }
  // the onset nearest t inside ±win (scored: closer, stronger, on a beat), or null
  function snap(t, ons, beats, { win = 0.25, beatPeriod = 0.5 } = {}) {
    if (!ons.length) return null;
    let k = lastAt(ons, t - win, 't'); if (k < 0) k = 0;
    let best = null; let bs = Infinity;
    for (let i = k; i < ons.length && ons[i].t <= t + win; i += 1) {
      const o = ons[i]; const d = Math.abs(o.t - t);
      if (d > win) continue;
      const bi = lastAt(beats, o.t + beatPeriod / 2);
      const onBeat = bi >= 0 && Math.abs(beats[bi] - o.t) < 0.045;
      const s = d / win - o.w * 0.25 - (onBeat ? 0.2 : 0);
      if (s < bs) { bs = s; best = o.t; }
    }
    return best;
  }
  // where the singing is: after the intro (the first section that isn't an intro, or a bar in), before the outro
  function span(music, lines) {
    const d = music?.duration || 0;
    const bpm = music?.bpm || 120; const bar = (60 / bpm) * (music?.bpb || 4);
    const secs = music?.sections || [];
    let a = Math.min(d * 0.15, bar);
    let b = d - Math.min(d * 0.1, bar);
    const firstReal = secs.find((s) => !/intro/i.test(s.label || ''));
    if (secs.length > 1 && firstReal && firstReal.start > 0 && firstReal.start < d * 0.4) a = firstReal.start;
    const lastS = secs[secs.length - 1];
    if (secs.length > 2 && /outro/i.test(lastS?.label || '') && lastS.start > d * 0.6) b = lastS.start;
    // enough room for the words (≈ 0.22 s a syllable at least)
    const need = lines.reduce((s, L) => s + lineSyl(L.text) * 0.22 + 0.3, 0);
    if (b - a < need) { a = Math.max(0, Math.min(a, d - need)); b = Math.min(d, Math.max(b, a + need)); }
    return { a: Math.max(0, a), b: Math.max(a + 0.5, b) };
  }

  // ---------- align: lines (and words) onto the song ----------
  function align(lines0, music, { from = null, to = null, words = true, tighten = true } = {}) {
    const lines = lines0.map((L) => ({ a: L.a ?? null, b: L.b ?? null, text: L.text, w: L.w ? L.w.slice() : null }));
    if (!lines.length) return { lines, how: 'nothing to align' };
    const ons = onsetsOf(music); const beats = beatsOf(music);
    const bp = 60 / (music?.bpm || 120);
    const timed = lines.every((L) => L.a != null);
    let how;
    if (timed) {
      how = 'timed: tightened onto onsets';
      if (tighten && ons.length) for (const L of lines) { const s = snap(L.a, ons, beats, { win: 0.12, beatPeriod: bp }); if (s != null) { const dlt = s - L.a; L.a = r3(s); if (L.w) L.w = L.w.map((x) => r3(x + dlt)); } }
    } else {
      const sp = span(music, lines);
      const A = from ?? sp.a; const B = to ?? sp.b;
      const wts = lines.map((L) => lineSyl(L.text) + 1.5);
      const tot = wts.reduce((s, x) => s + x, 0);
      let acc = 0; let prev = -Infinity;
      for (let i = 0; i < lines.length; i += 1) {
        const rough = A + ((B - A) * acc) / tot;
        acc += wts[i];
        let s = ons.length ? snap(rough, ons, beats, { win: Math.max(0.2, bp * 0.6), beatPeriod: bp }) : null;
        if (s == null) { const bi = lastAt(beats, rough + bp / 2); s = bi >= 0 && Math.abs(beats[bi] - rough) < bp ? beats[bi] : rough; }
        if (s < prev + 0.6) s = snap(prev + 0.6 + bp * 0.5, ons, beats, { win: bp, beatPeriod: bp }) ?? prev + 0.6;
        lines[i].a = r3(s); prev = s;
      }
      how = `spread over ${r3(A)}–${r3(B)} s by syllables, starts snapped to ${ons.length ? 'onsets' : 'beats'}`;
    }
    // ends: the next line's start (a small gap), the last one by its length
    for (let i = 0; i < lines.length; i += 1) {
      const L = lines[i]; const nx = lines[i + 1];
      const want = L.a + clamp(lineSyl(L.text) * 0.3 + 0.4, 1, 8);
      if (L.b == null || !timed) L.b = r3(nx ? Math.max(L.a + 0.2, Math.min(nx.a - 0.05, want + 1.5)) : Math.min(music?.duration || want, want));
      if (L.b <= L.a) L.b = r3(L.a + 0.2);
    }
    if (words) for (const L of lines) if (!L.w) L.w = wordTimes(L, ons, beats, bp);
    return { lines, how, onsets: ons.length };
  }
  // words of a line: spread by syllables over the first 85 % of it, each snapped to an onset within ±0.15 s, in order
  function wordTimes(L, ons = [], beats = [], bp = 0.5) {
    const ws = String(L.text).split(/\s+/).filter(Boolean);
    if (!ws.length) return [];
    const syl = ws.map(syllables); const tot = syl.reduce((s, x) => s + x, 0);
    const dur = Math.max(0.2, (L.b - L.a) * 0.85);
    const out = []; let acc = 0; let prev = L.a - 0.001;
    for (let i = 0; i < ws.length; i += 1) {
      let t = L.a + (dur * acc) / tot; acc += syl[i];
      if (i > 0 && ons.length) { const s = snap(t, ons, beats, { win: 0.15, beatPeriod: bp }); if (s != null && s > prev + 0.06 && s < L.b - 0.05) t = s; }
      t = i === 0 ? L.a : Math.max(t, prev + 0.06);
      out.push(r3(t)); prev = t;
    }
    return out;
  }
  // tap-along: line i starts at t (snapped to an onset within 80 ms); the lines after it move with it until a line
  // already tapped; its words keep their places in the line
  function tap(lines, i, t, music = null, { tapped = null } = {}) {
    if (!lines[i]) return lines;
    const ons = music ? onsetsOf(music) : [];
    const s = ons.length ? snap(t, ons, beatsOf(music), { win: 0.08 }) ?? t : t;
    const L = lines[i]; const d = s - (L.a ?? s);
    const move = (X, dd) => { X.a = r3((X.a ?? s) + dd); if (X.b != null) X.b = r3(X.b + dd); if (X.w) X.w = X.w.map((x) => r3(x + dd)); };
    move(L, d);
    for (let k = i + 1; k < lines.length; k += 1) { if (tapped?.has(k)) break; move(lines[k], d); }
    if (i > 0 && lines[i - 1].b != null && lines[i - 1].b > L.a - 0.05) lines[i - 1].b = r3(Math.max(lines[i - 1].a + 0.1, L.a - 0.05));
    if (i > 0 && lines[i - 1].w) lines[i - 1].w = lines[i - 1].w.map((x) => Math.min(x, r3(lines[i - 1].b - 0.05)));
    return lines;
  }
  // every line moved by dt seconds
  const shift = (lines, dt) => lines.map((L) => ({ ...L, a: L.a == null ? null : r3(Math.max(0, L.a + dt)), b: L.b == null ? null : r3(Math.max(0, L.b + dt)), w: L.w ? L.w.map((x) => r3(Math.max(0, x + dt))) : null }));

  // ---------- writing ----------
  const mmss = (t) => { const c = Math.round(Math.max(0, t) * 100); return `${String(Math.floor(c / 6000)).padStart(2, '0')}:${String(Math.floor(c / 100) % 60).padStart(2, '0')}.${String(c % 100).padStart(2, '0')}`; };
  function toLRC(lines, { words = false } = {}) {
    return lines.map((L) => {
      if (words && L.w?.length) { const ws = L.text.split(/\s+/); return `[${mmss(L.a)}]${ws.map((w, i) => `<${mmss(L.w[i] ?? L.a)}>${w}`).join(' ')}`; }
      return `[${mmss(L.a)}]${L.text}`;
    }).join('\n');
  }
  const srtT = (t) => { const ms = Math.round(Math.max(0, t) * 1000); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
  const toSRT = (lines) => lines.map((L, i) => `${i + 1}\n${srtT(L.a)} --> ${srtT(L.b ?? L.a + 2)}\n${L.text}\n`).join('\n');
  // the compact form in a type layer's code: [[a, b, "text", [w…]]…]
  const pack = (lines) => lines.map((L) => [r3(L.a ?? 0), r3(L.b ?? (L.a ?? 0) + 2), L.text, ...(L.w?.length ? [L.w.map(r3)] : [])]);
  const unpack = (arr) => (Array.isArray(arr) ? arr.filter((x) => Array.isArray(x) && x.length >= 3).map((x) => ({ a: +x[0], b: +x[1], text: String(x[2]), w: Array.isArray(x[3]) ? x[3].map(Number) : null })) : []);

  return { parse, parseLRC, parseSRT, parsePlain, kindOf, syllables, lineSyl, onsetsOf, beatsOf, snap, span, align, wordTimes, tap, shift, toLRC, toSRT, pack, unpack };
})();
if (typeof module !== 'undefined') module.exports = TypeLyrics;
else if (typeof window !== 'undefined') window.TypeLyrics = TypeLyrics;
