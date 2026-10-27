// 💡 Quick idea (round 71, quickidea71): the pure parts, shared by the main process (quickideamain.js: the store, the
// voice memo files), the small window (quickidea-window.js: the WAV encoder) and the main window (quickidea.js: the
// inbox, putting an idea where it goes). No DOM, no Electron; Node-tested (dev/quickidea71-test.js).
// The store: kv 'quick-ideas' { v: 1, ideas: [idea], trash: [idea + deletedAt], last: { dest, projectId?, projectName? } }
//   idea: { id, text, at, to: { dest, projectId?, projectName? }, memo?: { file, seconds }, placed: null | placement }
//   dest: 'music' (Sound desk › Sessions) | 'quest' (Sidequest's saved ideas) | 'project' (a project's notes) | 'later'
//   placement: where it really is now: { dest, at, questIdea? (Codex's idea id), projectId?, line? (the notes line) }
//   An idea whose placement isn't its target yet ("pending") is put there by the main window (quickidea.js), which
//   first takes it out of the old place on a Move to…: one path for saving, moving, restoring.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.QuickIdeaCore = api;
}(typeof self !== 'undefined' ? self : this, () => {
  const KEY = 'quick-ideas';
  const MAX_IDEAS = 500, MAX_TRASH = 100, TRASH_DAYS = 30, MAX_TEXT = 2000, MAX_MEMO_S = 300;
  const DEFAULT_KEY = 'Control+Alt+I';
  const DESTS = {
    music: { icon: '🎵', name: 'Music', where: 'Sound desk › Sessions' },
    quest: { icon: '✦', name: 'Quest', where: 'Sidequest › Saved ideas' },
    project: { icon: '📁', name: 'Project', where: 'the project’s notes' },
    later: { icon: '💬', name: 'Later', where: '💡 Ideas' },
  };
  const ORDER = ['music', 'quest', 'project', 'later'];
  const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const str = (v, n) => (typeof v === 'string' ? v : '').slice(0, n);
  const empty = () => ({ v: 1, ideas: [], trash: [], last: { dest: 'later' } });
  let seq = 0;
  const newId = (now = Date.now()) => `qi-${now.toString(36)}-${(seq++ % 1296).toString(36).padStart(2, '0')}${Math.random().toString(36).slice(2, 6)}`;

  // ---------- text ----------
  function clean(text) { return String(text ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, MAX_TEXT); }
  const hm = (ms) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const dayWords = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  function cut(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); if (s.length <= n) return s; const c = s.slice(0, n - 1); const sp = c.lastIndexOf(' '); return `${(sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[\s,.;:–-]+$/, '')}…`; }
  // what a row shows: its first line, or "Voice memo · 14:05" for a memo with no words
  function title(idea, n = 80) {
    const first = String(idea?.text || '').split('\n').find((l) => l.trim()) || '';
    if (first) return cut(first, n);
    return idea?.memo ? `Voice memo · ${hm(idea.at)}` : 'Idea';
  }

  // ---------- targets ----------
  function target(to) {
    const dest = ORDER.includes(to?.dest) ? to.dest : 'later';
    if (dest !== 'project') return { dest };
    const projectId = str(to.projectId, 120);
    if (!projectId) return { dest: 'later' };
    return { dest, projectId, projectName: str(to.projectName, 80) };
  }
  const sameTarget = (a, b) => Boolean(a && b) && a.dest === b.dest && (a.dest !== 'project' || a.projectId === b.projectId);
  const placedOk = (idea) => sameTarget(idea?.placed, idea?.to);
  const pending = (store) => (store?.ideas || []).filter((i) => !placedOk(i));
  // where it lives, in words ("Sidequest › Saved ideas", "Clink’s notes")
  function whereWords(to) { const t = target(to); return t.dest === 'project' ? `${t.projectName || 'the project'}’s notes` : DESTS[t.dest].where; }
  function label(to) { const t = target(to); return t.dest === 'project' && t.projectName ? `📁 ${t.projectName}` : `${DESTS[t.dest].icon} ${DESTS[t.dest].name}`; }

  // ---------- the store ----------
  function cleanIdea(x, inTrash = false) {
    if (!isObj(x) || typeof x.id !== 'string' || !/^[\w-]{3,80}$/.test(x.id)) return null;
    const at = Number(x.at); if (!Number.isFinite(at) || at <= 0) return null;
    const text = clean(x.text);
    const memo = isObj(x.memo) && typeof x.memo.file === 'string' && /\.wav$/i.test(x.memo.file) ? { file: x.memo.file.slice(0, 1000), seconds: Math.max(0, Math.min(MAX_MEMO_S + 5, Number(x.memo.seconds) || 0)) } : undefined;
    if (!text && !memo) return null;
    const out = { id: x.id, text, at, to: target(x.to), placed: null };
    if (memo) out.memo = memo;
    if (isObj(x.placed) && ORDER.includes(x.placed.dest)) {
      const p = { dest: x.placed.dest, at: Number(x.placed.at) || at };
      if (typeof x.placed.questIdea === 'string') p.questIdea = x.placed.questIdea.slice(0, 120);
      if (typeof x.placed.projectId === 'string') p.projectId = x.placed.projectId.slice(0, 120);
      if (typeof x.placed.line === 'string') p.line = x.placed.line.slice(0, 600);
      out.placed = p;
    }
    if (inTrash) { const d = Number(x.deletedAt); out.deletedAt = Number.isFinite(d) && d > 0 ? d : at; }
    return out;
  }
  // a damaged FILE throws (never read as "empty"); a damaged ROW is dropped, never the whole list
  function validate(v) {
    if (v == null) return empty();
    if (!isObj(v) || v.v !== 1 || !Array.isArray(v.ideas)) throw Error('The ideas inbox is damaged.');
    const seen = new Set(), keep = (list, t) => list.map((x) => cleanIdea(x, t)).filter((x) => x && !seen.has(x.id) && seen.add(x.id));
    const ideas = keep(v.ideas, false), trash = keep(Array.isArray(v.trash) ? v.trash : [], true);
    return { v: 1, ideas: ideas.slice(0, MAX_IDEAS), trash: trash.slice(0, MAX_TRASH), last: target(v.last) };
  }
  // a new idea (music / later are where they go as soon as they're saved; quest / project wait for the main window)
  function make({ text, to, memo } = {}, now = Date.now()) {
    const t = target(to), body = clean(text);
    const m = memo && typeof memo.file === 'string' ? { file: memo.file, seconds: Math.max(0, Math.min(MAX_MEMO_S, Number(memo.seconds) || 0)) } : undefined;
    if (!body && !m) throw Error('Type an idea or hold 🎙 to record one first.');
    const idea = { id: newId(now), text: body, at: now, to: t, placed: t.dest === 'music' || t.dest === 'later' ? { dest: t.dest, at: now } : null };
    if (m) idea.memo = m;
    return idea;
  }
  function add(store, idea) {
    if (store.ideas.length >= MAX_IDEAS) throw Error(`The ideas inbox holds ${MAX_IDEAS} ideas. Delete a few old ones first.`);
    store.ideas.unshift(idea); store.last = { ...idea.to }; return idea;
  }
  const find = (store, id) => store.ideas.find((i) => i.id === id) || null;
  function move(store, id, to) {
    const i = find(store, id); if (!i) throw Error('That idea isn’t in the inbox any more.');
    i.to = target(to); if (i.to.dest === 'music' || i.to.dest === 'later') { if (!i.placed || i.placed.dest === 'music' || i.placed.dest === 'later') i.placed = { dest: i.to.dest, at: Date.now() }; }
    return i;
  }
  function setPlaced(store, id, placed) { const i = find(store, id); if (!i) return null; i.placed = placed ? { ...placed, at: Number(placed.at) || Date.now() } : null; return i; }
  // Delete: to the inbox's own Trash (Restore brings it back; its voice memo goes to the computer's Trash when emptied)
  function trash(store, id, now = Date.now()) {
    const n = store.ideas.findIndex((i) => i.id === id); if (n < 0) throw Error('That idea isn’t in the inbox any more.');
    const [i] = store.ideas.splice(n, 1); i.deletedAt = now; store.trash.unshift(i);
    const gone = store.trash.splice(MAX_TRASH); return { idea: i, gone };
  }
  function restore(store, id) {
    const n = store.trash.findIndex((i) => i.id === id); if (n < 0) throw Error('That idea isn’t in the Trash any more.');
    if (store.ideas.length >= MAX_IDEAS) throw Error(`The ideas inbox holds ${MAX_IDEAS} ideas. Delete a few old ones first.`);
    const [i] = store.trash.splice(n, 1); delete i.deletedAt; i.placed = i.to.dest === 'music' || i.to.dest === 'later' ? { dest: i.to.dest, at: Date.now() } : null;
    store.ideas.unshift(i); store.ideas.sort((a, b) => b.at - a.at); return i;
  }
  // older than 30 days in the Trash (or all of it): out for good; their memos go to the computer's Trash
  function purge(store, now = Date.now(), all = false) {
    const keep = [], gone = [];
    for (const i of store.trash) (all || now - i.deletedAt > TRASH_DAYS * 864e5 ? gone : keep).push(i);
    store.trash = keep; return gone;
  }
  function counts(store) {
    const c = { all: store.ideas.length, music: 0, quest: 0, project: 0, later: 0, trash: store.trash.length, pending: pending(store).length };
    for (const i of store.ideas) c[i.to.dest]++;
    return c;
  }

  // ---------- Sidequest: a saved idea in Codex's journal (QuestCore.saveIdea's shape) ----------
  const PATH_WORDS = [
    ['music', /\b(beat|loop|track|song|melod|chord|bass|drum|kick|snare|synth|serum|vital|sample|vocal|lyric|mix|bpm|music|sound|riff|hook|verse|chorus)/i],
    ['visual', /\b(three|scene|shader|visual|render|video|clip|colou?r|palette|light|texture|particle|animation|motion|logo|poster|photo|draw|paint)/i],
    ['game', /\b(game|clink|level|player|enemy|boss|mechanic|forgeheart|npc|quest log|controller)/i],
  ];
  function guessPath(text) { for (const [p, re] of PATH_WORDS) if (re.test(text || '')) return p; return 'life'; }
  function questIdea(idea) {
    const lines = String(idea.text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const t = cut(lines[0] || title(idea), 150);
    const rest = lines.slice(1).join(' ');
    const goal = cut(rest || (idea.memo ? `Listen to the voice memo in 💡 Ideas, then do one small first step.${lines[0] ? ` (${lines[0]})` : ''}` : lines[0] || t), 500);
    return { title: t, goal, path: idea.memo && !lines.length ? 'music' : guessPath(idea.text), minutes: 15 };
  }

  // ---------- a project's notes: one line per idea, taken out again on a Move to… ----------
  function noteLine(idea) { return `💡 ${cut(String(idea.text || '').replace(/\s*\n\s*/g, ' · ') || title(idea), 300)}${idea.memo ? ' (voice memo in 💡 Ideas)' : ''} · ${dayWords(idea.at)}`; }
  function addNote(notes, line, max = 4000) {
    const base = String(notes || '').replace(/\r/g, '').replace(/\s+$/, '');
    const next = base ? `${base}\n${line}` : line;
    if (next.length > max) throw Error('That project’s notes are full (4,000 characters). Tidy them a little, then move the idea again.');
    return next;
  }
  function removeNote(notes, line) {
    const rows = String(notes || '').split('\n'); const n = rows.lastIndexOf(line);
    if (n < 0) return { notes: String(notes || ''), removed: false };
    rows.splice(n, 1); return { notes: rows.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, ''), removed: true };
  }
  // the quick window's project buttons: the projects you touched last (Projects' own order: updated / opened), not archived
  function recentProjects(kv, n = 6) {
    const list = Array.isArray(kv?.list) ? kv.list : [];
    return list.filter((p) => isObj(p) && typeof p.id === 'string' && p.status !== 'archived')
      .sort((a, b) => Math.max(b.updated || 0, b.opened || 0) - Math.max(a.updated || 0, a.opened || 0))
      .slice(0, n).map((p) => ({ id: p.id, name: cut(String(p.name || 'Project'), 40) }));
  }

  // ---------- the voice memo ----------
  // 16-bit PCM mono WAV from Float32 chunks (the small window records with Web Audio: never MediaRecorder's webm)
  function encodeWav(chunks, sampleRate) {
    const n = chunks.reduce((s, c) => s + c.length, 0), bytes = new Uint8Array(44 + n * 2), v = new DataView(bytes.buffer);
    const tag = (o, s) => { for (let i = 0; i < 4; i++) bytes[o + i] = s.charCodeAt(i); };
    tag(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); tag(8, 'WAVE'); tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); tag(36, 'data'); v.setUint32(40, n * 2, true);
    let o = 44; for (const c of chunks) for (let i = 0; i < c.length; i++, o += 2) { const s = Math.max(-1, Math.min(1, c[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return bytes;
  }
  // what the main process accepts from the window: a real PCM WAV, ≤ 5 minutes + a little; → { seconds } or throws
  function checkWav(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : null;
    if (!b || b.length < 46) throw Error('That recording was empty.');
    const s = (o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]); const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (s(0) !== 'RIFF' || s(8) !== 'WAVE' || s(12) !== 'fmt ' || v.getUint16(20, true) !== 1) throw Error('That recording isn’t a WAV file.');
    const ch = v.getUint16(22, true), rate = v.getUint32(24, true), bits = v.getUint16(34, true);
    if (ch < 1 || ch > 2 || rate < 8000 || rate > 192000 || bits !== 16) throw Error('That recording isn’t a WAV file Hearth makes.');
    const seconds = (b.length - 44) / (rate * ch * 2);
    if (seconds > MAX_MEMO_S + 5) throw Error('Voice memos are up to 5 minutes long.');
    return { seconds: Math.round(seconds * 10) / 10, rate, channels: ch };
  }
  function stamp(d = new Date()) { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`; }
  const memoName = (d = new Date(), n = 1) => `Idea ${stamp(d)}${n > 1 ? ` ${n}` : ''}.wav`;

  // ---------- the hotkey ----------
  // "Control+Alt+I" = "ctrl+alt+i" = "Alt+Ctrl+I": the same keys (so the show / hide key and this one can't be one)
  function keyNorm(accel) {
    const parts = String(accel || '').split('+').map((x) => x.trim().toLowerCase()).filter(Boolean); if (!parts.length) return '';
    const alias = { control: 'ctrl', cmdorctrl: 'ctrl', commandorcontrol: 'ctrl', option: 'alt', altgr: 'alt', command: 'cmd', super: 'cmd', meta: 'cmd' };
    const key = parts.pop(); return [...new Set(parts.map((m) => alias[m] || m))].sort().concat(key).join('+');
  }
  const sameKey = (a, b) => Boolean(keyNorm(a)) && keyNorm(a) === keyNorm(b);

  // ---------- chat: "/idea quest: try a 7/8 loop" ----------
  function parseWords(s) {
    const m = String(s || '').trim().match(/^(music|quest|later|project)\s*[:›>-]\s*([\s\S]*)$/i);
    return m ? { dest: m[1].toLowerCase(), text: m[2].trim() } : { dest: null, text: String(s || '').trim() };
  }

  return { KEY, DESTS, ORDER, MAX_IDEAS, MAX_TRASH, TRASH_DAYS, MAX_MEMO_S, DEFAULT_KEY, empty, clean, cut, title, hm, dayWords, target, sameTarget, placedOk, pending, whereWords, label,
    validate, make, add, find, move, setPlaced, trash, restore, purge, counts, guessPath, questIdea, noteLine, addNote, removeNote, recentProjects,
    encodeWav, checkWav, stamp, memoName, keyNorm, sameKey, parseWords };
}));
