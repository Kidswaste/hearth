// ✦ Direction (round 67, direction67): the math behind the Lab's Direction card. No DOM, no tokens; loads in Node
// (dev/direction-test.js). tools/three-direction.js is the card.
//   TRY_ANGLES · tryBrief(idea, anchor) · combineText(keep, from, part) · COMBINE_PARTS
//   plain(params, base, dial) → { id: value }: plain sliders (busy -1 calmer … +1 busier, warm -1 colder … +1 warmer,
//     harsh -1 softer … +1 harsher) over VarCore params ({ id, kind, value, min, max, int, group, key, label })
//   warmHex(hex, warm) · markText(marks, name) · whereOf(x, y) · driftOf(distances) · anchorText(anchor, name)
const DirCore = (() => {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const HEX = /^#[0-9a-f]{6}$/i;

  // ---------- Try 4 ways: one idea, four takes that are really different (the crew runs them) ----------
  const TRY_ANGLES = [
    'color and light: a clearly different palette and lighting mood on the same idea',
    'motion: a different rhythm and movement (much calmer or much wilder), new timing',
    'form: a different main shape, arrangement or composition',
    'texture: a different surface and material (glass, grain, chrome, ink, soft glow)',
  ];
  function tryBrief(idea, anchor = null) {
    const i = String(idea || '').replace(/\s+/g, ' ').trim();
    const feel = anchor?.feel ? ` It should feel like: ${String(anchor.feel).trim()}.` : '';
    return `${i || 'Take this scene somewhere new'}. Rough is fine: make your take clearly different from the others, not polished.${feel}`.slice(0, 400);
  }
  const COMBINE_PARTS = [
    { id: 'light', label: 'its light' }, { id: 'colors', label: 'its colours' }, { id: 'motion', label: 'its motion' },
    { id: 'shapes', label: 'its shapes' }, { id: 'camera', label: 'its camera' }, { id: 'texture', label: 'its texture' },
  ];
  function combineText(keep, from, part) {
    const p = COMBINE_PARTS.find((x) => x.id === part)?.label || String(part || 'the best part');
    return `Combine the crew's takes: keep #${keep} as the base and bring in ${p} from #${from}. `
      + `Read what #${from} changed with three_do crew {op: "code", n: ${from}}, then put only that into the scene (crew {op: "copy"} for a whole layer, or edit the layer). Keep everything else of #${keep}; say in one line what you took.`;
  }

  // ---------- plain sliders ----------
  const words = (p) => `${p.key || ''} ${p.label || ''}`.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_.·-]+/g, ' ').toLowerCase();
  const BUSY = /count|num\b|number|amount|density|particles?|instances|rings|segments|detail|complex|turbul|jitter|chaos|freq|layers|lines|stars|dots/;
  const HARSH = /contrast|bloom|glow|sharp|grain|edge|strength|intensity|chroma|aberr|glitch|saturat|punch|hard/;
  const SOFT = /blur|soft|fog|haze|smooth|feather|vignette|dof/;
  function hexToHsl(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    const r = ((n >> 16) & 255) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const l = (mx + mn) / 2; const d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s; const x = c * (1 - Math.abs(((h / 60) % 2) - 1)); const m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return `#${[r, g, b].map((v) => Math.round(clamp(v + m, 0, 1) * 255).toString(16).padStart(2, '0')).join('')}`;
  }
  // warmer (+1) turns a colour toward orange (30°), colder (-1) toward teal-blue (205°), by up to 50°; greys stay grey
  function warmHex(hex, warm) {
    if (!HEX.test(String(hex)) || !warm) return hex;
    const [h, s, l] = hexToHsl(hex);
    if (s < 0.06) return hex;
    const gap = ((((warm > 0 ? 30 : 205) - h) % 360) + 540) % 360 - 180;
    const deg = Math.sign(gap) * Math.min(Math.abs(gap), 50 * Math.abs(warm));
    return hslToHex(h + deg, s, l);
  }
  const roundNum = (p, x) => {
    x = clamp(x, p.min, p.max);
    if (p.int) return Math.round(x);
    const span = p.max - p.min; const q = span >= 100 ? 0.1 : span >= 10 ? 0.01 : span >= 1 ? 0.001 : 0.0001;
    return Number((Math.round(x / q) * q).toFixed(4));
  };
  // every param's value for this dial (the base where nothing applies, so the dials at 0 give the base back)
  function plain(params, base = {}, dial = {}) {
    const busy = clamp(Number(dial.busy) || 0, -1, 1); const warm = clamp(Number(dial.warm) || 0, -1, 1); const harsh = clamp(Number(dial.harsh) || 0, -1, 1);
    const out = {};
    for (const p of params || []) {
      const v = p.id in base ? base[p.id] : p.value;
      out[p.id] = v;
      if (p.kind === 'color') { if (warm) out[p.id] = warmHex(v, warm); continue; }
      if (p.kind !== 'number' || typeof v !== 'number' || !(p.max > p.min)) continue;
      const w = words(p);
      let f = 1;
      if (busy && (p.group === 'motion' || BUSY.test(w))) f *= 2 ** (busy * 1.2); // ×2.3 at busiest, ×0.43 at calmest
      if (harsh && HARSH.test(w)) f *= 2 ** harsh;
      if (harsh && SOFT.test(w)) f *= 2 ** -harsh;
      if (f === 1) continue;
      const span = p.max - p.min;
      // a value near 0 has nothing to scale: busier lifts it into the range, calmer leaves it
      const x = Math.abs(v) < span * 0.02 ? (f > 1 ? p.min + span * 0.15 * (f - 1) : v) : v * f;
      out[p.id] = roundNum(p, x);
    }
    return out;
  }
  const dialWord = (k, v) => {
    const n = Math.round(Math.abs(v) * 100);
    if (!n) return '';
    const [lo, hi] = { busy: ['calmer', 'busier'], warm: ['colder', 'warmer'], harsh: ['softer', 'harsher'] }[k];
    return `${n}% ${v < 0 ? lo : hi}`;
  };

  // ---------- Mark it up: circles on the picture → plain words for the director ----------
  function whereOf(x, y) {
    const col = x < 0.34 ? 'left' : x > 0.66 ? 'right' : 'centre';
    const row = y < 0.34 ? 'top' : y > 0.66 ? 'bottom' : 'middle';
    return row === 'middle' && col === 'centre' ? 'the centre' : row === 'middle' ? `the ${col} side` : `${row} ${col === 'centre' ? 'centre' : col}`;
  }
  const pct = (v) => `${Math.round(clamp(v, 0, 1) * 100)}%`;
  function markText(marks, name = 'the scene') {
    const list = (marks || []).filter((m) => m && (m.kind === 'more' || m.kind === 'wrong'));
    if (!list.length) return '';
    const lines = list.map((m, i) => `${i + 1}. ${m.kind === 'more' ? 'MORE OF THIS' : 'WRONG'}${m.note ? `: ${String(m.note).trim().slice(0, 160)}` : ''} · ${whereOf(m.x, m.y)} (x ${pct(m.x)}, y ${pct(m.y)}, radius ${pct(m.r)} of the width)`);
    return `I marked up "${name}" on the attached picture: green circles = more of this, red circles = wrong.\n${lines.join('\n')}\n`
      + 'Change the scene from these marks: push what is green further, fix or remove what is red, keep the rest. three_screenshot { region } shows a mark up close.';
  }

  // ---------- Vision anchor: how far the newest version drifted from it ----------
  // distances: BoardVibe.distance(anchorFrame, now) per anchor frame (0 = the same feel … 1 = nothing alike)
  function driftOf(distances) {
    const d = (distances || []).filter((x) => Number.isFinite(x));
    if (!d.length) return null;
    const score = Math.round(clamp(Math.min(...d), 0, 1) * 100); // close to any one of the frames is on track
    return { score, level: score < 25 ? 'ok' : score < 45 ? 'some' : 'far', word: score < 25 ? 'on track' : score < 45 ? 'drifting a little' : 'drifting away' };
  }
  function anchorText(anchor, name = 'the scene') {
    if (!anchor) return '';
    const parts = [];
    if (anchor.feel) parts.push(`It should feel like: ${String(anchor.feel).trim()}`);
    if (anchor.words) parts.push(`In a few words: ${String(anchor.words).trim()}`);
    const n = (anchor.frames || []).length;
    return `The vision for "${name}"${n ? ` (${n} reference frame${n > 1 ? 's' : ''} attached)` : ''}. ${parts.join('. ')}. Keep new versions close to this; say when a change would move away from it.`;
  }

  return { TRY_ANGLES, tryBrief, COMBINE_PARTS, combineText, plain, dialWord, warmHex, markText, whereOf, driftOf, anchorText, _test: { hexToHsl, hslToHex, words } };
})();
if (typeof module !== 'undefined') module.exports = DirCore;
