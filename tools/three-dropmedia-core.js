// Drop media on the timeline (round 140, dropmedia140): the pure part (loads in Node). docs/upgrades/dropmedia140.md
//   kindOf(name, mime)              image · video · audio · null (what the timeline takes)
//   grid({ bpm, bpb, downbeat })    the beat and bar lengths and where bar 1 is
//   snap(t, step, anchor)           t on the nearest line of that step
//   boundary(a, o)                  where a picture dropped at a ends: the next cue, else its section's end, else 4 bars
//   plan(items, o)                  where each dropped item lands: [{ name, kind, a, b, fadeIn, fadeOut }]
//     one item: on the nearest beat (alt: exactly where it was dropped); a picture to the next cue / section end, a clip
//     for its own length · several: one after another from the drop, each starting on a bar (alt: on beats), a picture
//     one bar (alt: one beat) long, a clip its own length
//   tagFor(hex, colors)             the group colour tag nearest to a palette colour (outline136's tags)
//   footageCode(key)                a clip as a layer: the reference's video, its own time following the timeline
const DropMediaCore = (() => {
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const IMG = /\.(png|jpe?g|gif|webp|bmp|avif|svg)$/i;
  const VID = /\.(mp4|mov|webm|m4v|mkv)$/i;
  const AUD = /\.(mp3|wav|ogg|flac|m4a|aac|opus)$/i;
  function kindOf(name, mime = '') {
    const n = String(name || '');
    if (IMG.test(n)) return 'image';
    if (VID.test(n)) return 'video';
    if (AUD.test(n)) return 'audio';
    const m = String(mime || '');
    if (/^image\/hei[cf]/.test(m)) return null;
    if (/^image\//.test(m)) return 'image';
    if (/^video\//.test(m)) return 'video';
    if (/^audio\//.test(m)) return 'audio';
    return null;
  }
  const WORD = { image: 'picture', video: 'clip', audio: 'song' };
  const stem = (n) => String(n || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').slice(0, 40) || 'Dropped';

  function grid({ bpm = 120, bpb = 4, downbeat = 0 } = {}) {
    const beat = 60 / (bpm > 0 ? bpm : 120);
    return { beat, bar: beat * (bpb || 4), anchor: Number(downbeat) || 0 };
  }
  const snap = (t, step, anchor = 0) => r4(anchor + Math.round((t - anchor) / step) * step);
  const ceilTo = (t, step, anchor = 0) => r4(anchor + Math.ceil((t - anchor) / step - 1e-6) * step);

  // a picture dropped at a: up to the next cue, or to the end of the section it's in (whichever comes first)
  function boundary(a, { cues = [], sections = [], duration = 0, bar = 2 } = {}) {
    const ends = [];
    const cue = cues.map((c) => (typeof c === 'number' ? c : c.time ?? c.t)).filter((t) => t > a + 0.05).sort((x, y) => x - y)[0];
    if (cue != null) ends.push(cue);
    const sec = sections.find((s) => s.start <= a + 1e-3 && s.end > a + 0.05);
    if (sec) ends.push(sec.end);
    let b = ends.length ? Math.min(...ends) : a + bar * 4;
    if (duration > 0) b = Math.min(b, duration);
    return r4(Math.max(b, a + 0.1));
  }
  const fadeFor = (len, beat) => r4(Math.max(0, Math.min(0.5, beat / 2, len / 4)));

  // items: [{ name, kind ('image' | 'video'), duration? (a clip's seconds) }]
  // o: { t, alt, bpm, bpb, downbeat, duration (the timeline's), cues, sections }
  function plan(items, o = {}) {
    const g = grid(o);
    const D = o.duration > 0 ? o.duration : Infinity;
    const list = (items || []).filter((x) => x.kind === 'image' || x.kind === 'video');
    const out = [];
    const t0 = Math.max(0, Number(o.t) || 0);
    if (list.length === 1) {
      const it = list[0];
      const a = Math.max(0, o.alt ? r4(t0) : snap(t0, g.beat, g.anchor));
      const b = it.kind === 'video' ? r4(Math.min(D, a + (it.duration > 0 ? it.duration : g.bar * 4))) : boundary(a, { ...o, bar: g.bar, duration: o.duration });
      out.push({ name: it.name, kind: it.kind, a, b, ...fades(it, b - a, g) });
      return out;
    }
    const step = o.alt ? g.beat : g.bar;
    let a = Math.max(0, snap(t0, step, g.anchor));
    for (const it of list) {
      if (a >= D) break;
      const len = it.kind === 'video' ? (it.duration > 0 ? it.duration : g.bar * 4) : step;
      const b = r4(Math.min(D, a + len));
      out.push({ name: it.name, kind: it.kind, a, b, ...fades(it, b - a, g) });
      a = it.kind === 'video' ? ceilTo(b, step, g.anchor) : b;
    }
    return out;
  }
  function fades(it, len, g) {
    if (it.kind === 'video') { const f = r4(Math.min(0.25, len / 8)); return { fadeIn: f, fadeOut: f }; }
    const f = fadeFor(len, g.beat); return { fadeIn: f, fadeOut: f };
  }

  const rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  function tagFor(hex, colors) {
    const c = rgb(hex); if (!c || !colors?.length) return null;
    let best = null; let bd = Infinity;
    for (const [, h] of colors) { const d = rgb(h); if (!d) continue; const x = (c[0] - d[0]) ** 2 + (c[1] - d[1]) ** 2 + (c[2] - d[2]) ** 2; if (x < bd) { bd = x; best = h; } }
    return best;
  }
  const hexes = (cols) => (cols || []).map((x) => (typeof x === 'string' ? x : x?.hex || x?.value || x?.color || '')).filter((x) => rgb(x)).map((x) => (x.startsWith('#') ? x : `#${x}`));

  function footageCode(key, from = 0) {
    const k = String(key).replace(/[^\w$]/g, '_');
    return `import * as THREE from 'three';

// A clip dropped on the timeline: refTexture('${k}') (🖼 References). Its own time follows the timeline from "Starts at".
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const P = tweak({
  fit: { value: 'cover', options: ['cover', 'fit', 'stretch'], label: 'Fit', group: 'Clip' },
  zoom: { value: 1, min: 0.25, max: 4, label: 'Zoom', group: 'Clip' },
  from: { value: ${r4(Math.max(0, Number(from) || 0))}, min: 0, max: 3600, step: 0.01, label: 'Starts at (s)', group: 'Clip' },
});
const tex = refTexture('${k}', { loop: false });
const v = tex.video;
const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
scene.add(quad);
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));
let lastT = null;
renderer.setAnimationLoop(() => {
  const now = audio.time;
  if (v && v.readyState >= 1) {
    const end = v.duration && isFinite(v.duration) ? v.duration - 0.03 : Infinity;
    const want = Math.max(0, Math.min(end, now - P.from));
    const rolling = lastT != null && now > lastT && now - lastT < 0.2;
    if (rolling && now - P.from >= 0 && want < end) { if (v.paused) v.play().catch(() => {}); if (Math.abs(v.currentTime - want) > 0.25) v.currentTime = want; }
    else { if (!v.paused) v.pause(); if (Math.abs(v.currentTime - want) > 0.02) v.currentTime = want; }
  }
  lastT = now;
  const img = tex.image; const iw = img?.videoWidth || 1; const ih = img?.videoHeight || 1;
  const ra = innerWidth / innerHeight; const ia = iw / ih;
  let sx = 1; let sy = 1;
  if (P.fit === 'cover') { if (ra > ia) sy = ra / ia; else sx = ia / ra; } else if (P.fit === 'fit') { if (ra > ia) sx = ia / ra; else sy = ra / ia; }
  quad.scale.set(sx * P.zoom, sy * P.zoom, 1);
  renderer.render(scene, camera);
});
`;
  }

  return { kindOf, WORD, stem, grid, snap, ceilTo, boundary, plan, tagFor, hexes, footageCode };
})();
if (typeof module !== 'undefined') module.exports = DropMediaCore;
