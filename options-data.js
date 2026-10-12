// Options (options.js) data, no DOM (dev/options-test.js runs it in Node). The owner: "I hate commands, let's just make
// them options… a bunch of tabs of all the options I have and a hover description… turn on and off stuff, set a slider
// to min or max, tell it X or Y, show A or B or C, work in detailed mode, smart mode, director mode, presets for those".
// Every chat command becomes one control, read from its usage hint (args):
//   '' → a button · on|off → a switch · a|b|c → buttons (a list past 6) · <n>, <0.1–8>, <percent>… → a slider / number
//   <text>, <name>… → a "tell it" box (its own suggestions as buttons when it has a few) · mixed → buttons + a box
const OptionsData = (() => {
  const NUM = /^(n|#|count|times|seconds|secs|minutes|mins|hours|days|frames|fps|bpm|ms|px|size|percent|%|amount|level|value|speed|steps|bars|beats|width|height|zoom|scale|opacity|volume|depth)$/i;
  const RANGE = /^(-?\d+(?:\.\d+)?)\s*(?:–|-|\.\.|to)\s*(-?\d+(?:\.\d+)?)\s*(%|s|px|x)?$/;
  const WORD = /^[\w.:+#-]+(?: [\w.:+#-]+)?$/; // a value you click ('on', '9:16', 'auto on')

  // top-level split on | (not inside <> or [])
  function alts(s) {
    const out = []; let depth = 0; let cur = '';
    for (const ch of s) {
      if (ch === '<' || ch === '[') depth += 1; else if (ch === '>' || ch === ']') depth = Math.max(0, depth - 1);
      if (ch === '|' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
    }
    out.push(cur.trim());
    return out.filter(Boolean);
  }
  const unwrap = (s) => { const t = s.trim(); const m = /^([[<])(.*)([\]>])$/.exec(t); return m && !/[[\]<>]/.test(m[2]) ? m[2].trim() : null; };

  // args → { kind, values, min, max, step, opt, hint }
  function control(args) {
    const raw = String(args || '').split(' · ')[0].trim();
    if (!raw) return { kind: 'action' };
    let s = raw; let opt = false;
    if (/^\[.*\]$/.test(s) && !/\]\s*\[/.test(s)) { s = s.slice(1, -1).trim(); opt = true; } else if (/^<.*>$/.test(s) && alts(s.slice(1, -1)).length > 1) s = s.slice(1, -1).trim();
    const parts = alts(s);
    if (parts.length > 1) {
      const words = parts.filter((p) => WORD.test(p) && !/^(text|name|words|path|url)$/i.test(p));
      const free = parts.filter((p) => !words.includes(p));
      const lower = words.map((w) => w.toLowerCase());
      if (!free.length && lower.every((w) => ['on', 'off', 'status'].includes(w)) && lower.includes('on') && lower.includes('off')) return { kind: 'toggle', opt };
      if (!free.length) return { kind: 'choice', values: words, opt };
      return { kind: 'mixed', values: words, hint: free.map((f) => f.replace(/[<>[\]]/g, '')).join(' or '), opt };
    }
    const one = unwrap(s) ?? (opt && WORD.test(s) ? s : null);
    if (one != null) {
      const r = RANGE.exec(one);
      if (r) { const min = Number(r[1]); const max = Number(r[2]); return { kind: 'number', min, max, step: niceStep(min, max), unit: r[3] || '', opt }; }
      if (/^(percent|%)$/i.test(one)) return { kind: 'number', min: 0, max: 100, step: 1, unit: '%', opt };
      if (NUM.test(one)) return { kind: 'number', min: null, max: null, step: 1, hint: one, opt };
      if (opt && WORD.test(raw.slice(1, -1)) && !/[<]/.test(raw) && !/^(text|name|words|search|filter|title|note|path|url|query|range|tab|area|group|agent|board|frame|preset|kind)$/i.test(one)) return { kind: 'choice', values: ['', one], opt }; // '' = as is (no word)
      return { kind: 'text', hint: one, opt };
    }
    return { kind: 'text', hint: raw.replace(/[<>[\]]/g, ''), opt };
  }
  function niceStep(min, max) { const span = Math.abs(max - min); if (span <= 2) return 0.01; if (span <= 20) return 0.1; return 1; }

  // 'board-snap' → 'Board snap'
  const humanize = (name) => { const t = String(name || '').replace(/[-_]+/g, ' ').trim(); return t ? t[0].toUpperCase() + t.slice(1) : ''; };

  // ---------- tabs: areas grouped so there are few of them ----------
  const TABS = [
    { id: 'chat', label: 'This chat', icon: '💬', areas: ['Chat', 'Messages', 'Compose', 'Style', 'Memory', 'Export'] },
    { id: 'modes', label: 'Modes & presets', icon: '◈', areas: [] },
    { id: 'lab', label: 'Lab', icon: '◭', areas: ['Three.js Lab', 'Lab', 'Nodes', 'Shader nodes', 'Director', 'Assist', 'Assets', 'Video'] },
    { id: 'agents', label: 'Agents', icon: '☉', areas: ['Agents', 'Astra', 'Prompts', 'Voice', 'Collab'] },
    { id: 'board', label: 'Board', icon: '▦', areas: ['Board'] },
    { id: 'capture', label: 'Capture', icon: '◉', areas: ['Capture'] },
    { id: 'forge', label: 'Forge', icon: '⚒', areas: ['Forge', 'Kit'] },
    { id: 'app', label: 'App', icon: '⚙', areas: ['App', 'View', 'Look', 'Meter', 'Notes', 'Projects', 'Flows', 'Data', 'Studio', 'Publish', 'Apps', 'Adobe', 'Navigate', 'Yours'] },
  ];
  const PLACE_TAB = { chat: 'chat', three: 'lab', board: 'board', capture: 'capture', forgeheart: 'forge', 'forge-game': 'forge', kit: 'forge', options: 'chat' };
  function tabOf(area) { for (const t of TABS) if (t.areas.includes(area)) return t.id; return 'app'; }

  // the kinds of controls, in the order a tab shows them
  const SECTIONS = [
    { kind: 'toggle', label: 'Switches', hint: 'On or off' },
    { kind: 'choice', label: 'Pick one', hint: 'Show A, B or C' },
    { kind: 'number', label: 'Amounts', hint: 'A slider: drag, or min / max' },
    { kind: 'mixed', label: 'Pick or tell it', hint: 'A button, or your own words' },
    { kind: 'text', label: 'Tell it', hint: 'Type, then Enter' },
    { kind: 'action', label: 'Do it', hint: 'One click' },
  ];

  // ---------- modes: a few settings at once (a chat's way of working) ----------
  const MODES = [
    { id: 'quick', label: 'Quick', icon: '⚡', desc: 'Short answers, less thinking: fastest and cheapest.', lines: ['/effort low', '/tone concise'] },
    { id: 'smart', label: 'Smart', icon: '✦', desc: 'The everyday balance: it thinks as much as the question needs, no forced tone.', lines: ['/effort medium', '/tone off', '/style off'] },
    { id: 'detailed', label: 'Detailed', icon: '☰', desc: 'Thinks hard and explains fully: reasoning, examples, edge cases. Slower, more tokens.', lines: ['/effort high', '/style Give thorough, detailed answers: your reasoning, examples and the edge cases.'] },
    { id: 'director', label: 'Director', icon: '◈', desc: 'For the Lab director: every Lab tool and the whole guide on every message, thinking hard (more tokens, fewer look-ups).', lines: ['/effort high', '/director-mode full'] },
  ];

  // a preset: the options you set, as lines to run again
  const lineOf = (name, value) => `/${name}${value === '' || value == null ? '' : ` ${value}`}`;
  const validName = (n) => String(n || '').trim().replace(/\s+/g, ' ').slice(0, 40);

  return { control, alts, humanize, TABS, PLACE_TAB, tabOf, SECTIONS, MODES, lineOf, validName };
})();
if (typeof module !== 'undefined') module.exports = OptionsData;
