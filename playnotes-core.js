// ▶ Play's playtest notes (round 62, playnotes62), the pure part: the hub window loads it as a script (global
// PlayNotesCore, lazy group "gamemode"), playnotesmain.js require()s it, dev/playnotes-test.js runs it in Node.
// While Clink plays in ▶ Play, one key (F8 by default) drops a note: a picture of that frame, the time into the session,
// what the game saves (a Lab layer's saveState(), an HTML build's window.hearthState() / window.game) and its camera,
// the frame rate then (the performance probe when attached, else the budget watch's last second), and words if you type
// or say them. Notes live per game in data/game-cache/<game>/notes (log.json + one JPEG each, atomic writes).
//   combo(text)            'F8' | 'Shift+F9' | 'Alt+N' → { key, shift, alt, ctrl, meta, text } or null (not a key a game
//                          needs: Esc, F, P, letters without a modifier, Tab… are refused)
//   matches(c, input)      a before-input-event keyDown is that key (box: the same key with Shift: a note + words)
//   folder(key)            'lab:s1abc' → 'lab-s1abc'; 'html:/x/clink/index.html' → 'html-clink-1a2b3c4d' (one folder per game)
//   clean(note)            a note as stored (only known fields, sizes capped)
//   add(log, note) / update(log, id, patch) / remove(log, id) / session(log, at) / list(log)
//   clock(secs)            '1:42' · line(note)  '0:42 · 58 fps (17.2 ms) · player 3.1, 0.4, -2 · "the jump clips"'
//   draft(note, game)      the Three Director's task ("fix this"), drafted only, never sent
//   sameState(a, b)        two saved states equal (the check)
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayNotesCore = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const MAX_NOTES = 200; // per game (the oldest go first, with their pictures)
  const MAX_STATE = 64 * 1024; // a saved state bigger than this is kept as a summary only (no jump back)
  const MAX_TEXT = 2000;
  const DEFAULT_KEY = 'F8';

  // ---------- the key ----------
  // F1–F12 (F8 by default), or a letter / digit with Ctrl / Alt / ⌘. Never Esc / Enter / Tab / Space, plain letters (the
  // game's), F (the stats chip), P with the modifier (back to editing), F11 / F12 (the system's / devtools on some setups)
  const NAMES = { ctrl: 'ctrl', control: 'ctrl', alt: 'alt', option: 'alt', opt: 'alt', shift: 'shift', cmd: 'meta', command: 'meta', meta: 'meta', '⌘': 'meta', '⌥': 'alt', '⇧': 'shift', '⌃': 'ctrl' };
  function combo(text) {
    const parts = String(text || '').trim().split(/\s*\+\s*|(?<=[⌘⌥⇧⌃])/).filter(Boolean);
    if (!parts.length) return null;
    const c = { key: '', shift: false, alt: false, ctrl: false, meta: false };
    for (const p of parts) {
      const m = NAMES[p.toLowerCase()];
      if (m) { c[m] = true; continue; }
      if (c.key) return null;
      c.key = /^f\d{1,2}$/i.test(p) ? p.toUpperCase() : p.length === 1 ? p.toUpperCase() : '';
    }
    if (!c.key) return null;
    const fn = /^F(\d{1,2})$/.exec(c.key);
    if (fn) { const n = Number(fn[1]); if (n < 1 || n > 10) return null; } // (F11 full screen / F12 devtools on some setups)
    else if (!/^[A-Z0-9]$/.test(c.key) || !(c.ctrl || c.alt || c.meta)) return null; // a plain letter is the game's
    if (c.key === 'P' && (c.ctrl || c.meta)) return null; // back to editing
    if (c.key === 'Q' || c.key === 'W') return null; // leave keys
    c.text = [c.ctrl && 'Ctrl', c.alt && 'Alt', c.shift && 'Shift', c.meta && 'Cmd', c.key].filter(Boolean).join('+');
    return c;
  }
  // before-input-event's input → 'note' | 'box' (the key with Shift added: a note + words) | null
  function matches(c, input) {
    if (!c || !input || input.type !== 'keyDown' || input.isAutoRepeat) return null;
    const k = String(input.key || '');
    const code = String(input.code || '');
    const same = /^F\d+$/.test(c.key) ? (k.toUpperCase() === c.key || code === c.key) : (k.toUpperCase() === c.key || code === `Key${c.key}` || code === `Digit${c.key}`);
    if (!same || Boolean(input.alt) !== c.alt || Boolean(input.control) !== c.ctrl || Boolean(input.meta) !== c.meta) return null;
    if (Boolean(input.shift) === c.shift) return 'note';
    return !c.shift && input.shift ? 'box' : null;
  }

  // ---------- where a game's notes live ----------
  // FNV-1a, 32 bits, as 8 hex digits (a folder name per HTML build that two builds with the same file name don't share)
  function hash(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
  const safe = (s, n = 40) => String(s || '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, n) || 'game';
  function folder(key) {
    const k = String(key || '');
    if (k.startsWith('lab:')) return `lab-${safe(k.slice(4), 60)}`;
    if (k.startsWith('html:')) {
      const parts = k.slice(5).split(/[\\/]/).filter(Boolean);
      const name = parts[parts.length - 1] === 'index.html' ? parts[parts.length - 2] : (parts[parts.length - 1] || '').replace(/\.html?$/i, '');
      return `html-${safe(name, 32)}-${hash(k)}`;
    }
    return `game-${hash(k)}`;
  }

  // ---------- a note ----------
  const num = (v, d = null) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
  const r2 = (x) => Math.round(x * 100) / 100;
  const xyz = (p) => (p && Number.isFinite(p.x) ? { x: r2(p.x), y: r2(num(p.y, 0)), z: r2(num(p.z, 0)), from: String(p.from || '').slice(0, 24) } : null);
  function clean(n = {}) {
    let state = n.state ?? null; let stateBig = false;
    try { const j = state == null ? '' : JSON.stringify(state); if (j.length > MAX_STATE) { state = null; stateBig = true; } else state = j ? JSON.parse(j) : null; } catch { state = null; }
    let cams = null;
    if (n.cams && typeof n.cams === 'object') {
      cams = {};
      for (const [k, c] of Object.entries(n.cams).slice(0, 12)) {
        if (!c || !Array.isArray(c.p) || c.p.length !== 3 || !c.p.every(Number.isFinite)) continue;
        cams[String(k).slice(0, 80)] = { p: c.p.map(Number), ...(Array.isArray(c.q) && c.q.length === 4 && c.q.every(Number.isFinite) ? { q: c.q.map(Number) } : {}), ...(Number.isFinite(c.z) ? { z: Number(c.z) } : {}) };
      }
      if (!Object.keys(cams).length) cams = null;
    }
    const p = n.perf && typeof n.perf === 'object' ? { fps: num(n.perf.fps), ms: num(n.perf.ms), worst: num(n.perf.worst), from: ['perf', 'watch'].includes(n.perf.from) ? n.perf.from : null } : null;
    return {
      id: String(n.id || '').replace(/[^\w-]/g, '').slice(0, 40),
      at: num(n.at, Date.now()),
      session: num(n.session, 0),
      secs: Math.max(0, r2(num(n.secs, 0))),
      kind: n.kind === 'html' ? 'html' : 'lab',
      text: String(n.text || '').slice(0, MAX_TEXT),
      shot: n.shot ? String(n.shot).replace(/[^\w.-]/g, '').slice(0, 60) : null,
      w: num(n.w), h: num(n.h),
      state, ...(stateBig ? { stateBig: true } : {}),
      cams,
      pos: xyz(n.pos),
      perf: p && (p.fps != null || p.ms != null) ? p : null,
      hz: num(n.hz),
      readMs: num(n.readMs),
    };
  }
  const empty = (game = {}) => ({ v: 1, game: { key: String(game.key || ''), title: String(game.title || '').slice(0, 80), kind: game.kind === 'html' ? 'html' : 'lab', ...(game.id ? { id: String(game.id) } : {}), ...(game.path ? { path: String(game.path) } : {}) }, notes: [] });
  function valid(log) { return Boolean(log && typeof log === 'object' && Array.isArray(log.notes)); }
  // add a note (newest last); the oldest beyond MAX_NOTES are returned so their pictures can go too
  function add(log, note) {
    const L = valid(log) ? log : empty();
    const n = clean(note);
    if (!n.id) n.id = `n${n.at.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    L.notes.push(n);
    const dropped = L.notes.length > MAX_NOTES ? L.notes.splice(0, L.notes.length - MAX_NOTES) : [];
    return { log: L, note: n, dropped };
  }
  function update(log, id, patch = {}) {
    const n = valid(log) ? log.notes.find((x) => x.id === id) : null;
    if (!n) return null;
    if (patch.text != null) n.text = String(patch.append && n.text ? `${n.text} ${patch.text}` : patch.text).trim().slice(0, MAX_TEXT);
    return n;
  }
  function remove(log, id) {
    if (!valid(log)) return null;
    const i = log.notes.findIndex((x) => x.id === id);
    return i < 0 ? null : log.notes.splice(i, 1)[0];
  }
  const session = (log, at) => (valid(log) ? log.notes.filter((n) => n.session === at) : []);
  // what the hub lists (no state bodies: those are read back only to jump there)
  const brief = (n, i) => ({ i: i + 1, id: n.id, at: n.at, session: n.session, secs: n.secs, text: n.text, shot: Boolean(n.shot), w: n.w, h: n.h, pos: n.pos, perf: n.perf, hz: n.hz, canJump: Boolean(n.state || n.cams), stateBig: Boolean(n.stateBig), line: line(n) });
  const list = (log) => (valid(log) ? log.notes.map(brief) : []);

  // ---------- words ----------
  function clock(secs) { const s = Math.max(0, Math.round(Number(secs) || 0)); const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; }
  const n1 = (x) => (Math.abs(x) >= 10 ? Math.round(x) : Math.round(x * 10) / 10);
  function perfText(p, hz) {
    if (!p || (p.fps == null && p.ms == null)) return '';
    const fps = p.fps != null ? `${Math.round(p.fps)} fps` : '';
    const ms = p.ms != null ? `${p.ms.toFixed(1)} ms` : '';
    return `${fps}${fps && ms ? ` (${ms})` : ms}${hz ? ` on ${Math.round(hz)} Hz` : ''}${p.worst != null && p.ms != null && p.worst > p.ms * 1.8 ? ` · worst ${Math.round(p.worst)} ms` : ''}`;
  }
  const posText = (p) => (p ? `${p.from && p.from !== 'state' ? p.from : 'player'} ${n1(p.x)}, ${n1(p.y)}, ${n1(p.z)}` : '');
  function line(n) {
    return [clock(n.secs), perfText(n.perf), posText(n.pos), n.text ? `“${n.text.length > 80 ? `${n.text.slice(0, 79)}…` : n.text}”` : ''].filter(Boolean).join(' · ');
  }
  // the state as a few readable numbers (the director's draft; never the whole thing)
  function stateText(state, max = 8) {
    if (!state || typeof state !== 'object') return '';
    const out = [];
    const walk = (v, k, d) => {
      if (out.length >= max) return;
      if (typeof v === 'number' && Number.isFinite(v)) out.push(`${k} ${n1(v)}`);
      else if (typeof v === 'boolean' || (typeof v === 'string' && v.length <= 24)) out.push(`${k} ${v}`);
      else if (Array.isArray(v) && v.length <= 4 && v.every((x) => typeof x === 'number')) out.push(`${k} ${v.map(n1).join(',')}`);
      else if (v && typeof v === 'object' && d < 3 && !Array.isArray(v)) for (const [k2, x] of Object.entries(v).slice(0, 10)) walk(x, k ? `${k}.${k2}` : k2, d + 1);
    };
    walk(state, '', 0);
    return out.join(' · ');
  }
  function draft(n, game = {}) {
    const title = game.title || 'The game';
    const bits = [perfText(n.perf, n.hz), posText(n.pos)].filter(Boolean).join(' · ');
    const st = stateText(n.state);
    return [
      `Playtest note from ${title} in ▶ Play, ${clock(n.secs)} in${bits ? ` (${bits})` : ''}:`,
      n.text ? `“${n.text}”` : '(no words: see the picture)',
      st ? `Game state then: ${st}` : '',
      'Fix this.',
    ].filter(Boolean).join('\n');
  }
  // two saved states the same (deep, numbers to 1e-6)
  function sameState(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const ka = Object.keys(a); const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => sameState(a[k], b[k]));
  }

  return { DEFAULT_KEY, MAX_NOTES, MAX_STATE, combo, matches, folder, hash, clean, empty, valid, add, update, remove, session, list, brief, clock, line, perfText, posText, stateText, draft, sameState };
}));
