// The credit log, as data (round 67, credits67): who did what on each piece (a Lab scene), kept as counts and a few
// short notes, never every event. No DOM, no Lab, so it runs in Node too (node dev/credits-test.js). credits.js feeds it
// from the time machine, the slider panel, the Sound desk and the recordings, and shows it as plain credits.
//   kv credit-log: { v: 1, owner, since, pieces: { sceneId: piece }, desk: sound (all pieces) }
//   piece = { name, since, last, start: '' | 'me' | 'ai' | 'template' | 'other' (what the owner said the starting code was),
//     you: { code, layers, sliders, shuffle, other, restores }, ai: { claude, codex, crew }, prompts: { claude, codex },
//     moves (slider moves in the panel, saved or not), sound: sound, rec: { 'park-jam', 'park-song', 'live-set' },
//     first: 'you' | 'ai' | null (the first change recorded), notes: [{ at, who, text }], seenV: [version ids], seenM: [mark times] }
//   sound = { [instrument]: { hand (knob moves on the desk), editor (plugin window closed with changes), ai: { chat, hover }, preset, undo } }
const CreditsCore = (() => {
  const NOTES = 10; // short notes kept per piece
  const SEEN = 300; // version ids remembered per piece (the time machine can emit the same one twice)
  const AI = ['claude', 'codex', 'crew'];
  const NAMES = { claude: 'Claude', codex: 'Codex', crew: 'an AI crew helper' };
  const REC = { 'park-jam': ['park loop', 'park loops'], 'park-song': ['park song', 'park songs'], 'live-set': ['live set run', 'live set runs'] };
  const START = { me: 'written by hand', ai: 'AI-written', template: 'a Hearth template', other: 'from elsewhere' };
  const num = (x) => (Number.isFinite(x) && x > 0 ? Math.floor(x) : 0);
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

  const blank = (now = Date.now()) => ({ v: 1, owner: 'Quentin', since: now, pieces: {}, desk: {}, rec: {} });
  const blankPiece = (name = '', now = Date.now()) => ({
    name: String(name || '').slice(0, 80), since: now, last: now, start: '',
    you: { code: 0, layers: 0, sliders: 0, shuffle: 0, other: 0, restores: 0 }, ai: { claude: 0, codex: 0, crew: 0 },
    prompts: { claude: 0, codex: 0 }, moves: 0, sound: {}, rec: {}, first: null, notes: [], seenV: [], seenM: [],
  });
  // a log read from disk (or another computer's copy) made whole: missing parts come back empty, bad numbers as 0
  function heal(log) {
    const L = log && typeof log === 'object' && log.v === 1 ? log : blank();
    if (typeof L.owner !== 'string' || !L.owner.trim()) L.owner = 'Quentin';
    if (!Number.isFinite(L.since)) L.since = Date.now();
    if (!L.pieces || typeof L.pieces !== 'object') L.pieces = {};
    if (!L.desk || typeof L.desk !== 'object') L.desk = {};
    if (!L.rec || typeof L.rec !== 'object') L.rec = {};
    for (const [id, p] of Object.entries(L.pieces)) {
      if (!p || typeof p !== 'object') { delete L.pieces[id]; continue; }
      const b = blankPiece(p.name, Number.isFinite(p.since) ? p.since : L.since);
      for (const k of Object.keys(b)) if (k !== 'first' && (p[k] == null || typeof p[k] !== typeof b[k] || Array.isArray(b[k]) !== Array.isArray(p[k]))) p[k] = b[k];
      for (const k of Object.keys(b.you)) p.you[k] = num(p.you[k]);
      for (const k of Object.keys(b.ai)) p.ai[k] = num(p.ai[k]);
      for (const k of Object.keys(b.prompts)) p.prompts[k] = num(p.prompts[k]);
      p.moves = num(p.moves);
      if (p.first !== 'you' && p.first !== 'ai') p.first = null;
    }
    return L;
  }
  function piece(log, id, name, now = Date.now()) {
    if (!log.pieces[id]) log.pieces[id] = blankPiece(name, now);
    const p = log.pieces[id];
    if (name && p.name !== name) p.name = String(name).slice(0, 80);
    p.last = now;
    return p;
  }
  const note = (p, who, text, at) => { p.notes.push({ at, who, text: String(text || '').replace(/\s+/g, ' ').slice(0, 90) }); if (p.notes.length > NOTES) p.notes.splice(0, p.notes.length - NOTES); };
  const remember = (arr, x, max) => { arr.push(x); if (arr.length > max) arr.splice(0, arr.length - max); };

  // what a time machine version says about who did what: { side: 'ai' | 'you' | null, who, part }
  function classify(v) {
    if (!v) return { side: null };
    const by = v.by || 'you';
    if (AI.includes(by)) return v.kind === 'restore' || v.kind === 'pick' ? { side: null, who: by } : { side: 'ai', who: by, part: 'edit' };
    if (by !== 'you') return { side: null };
    const part = { run: 'code', layers: 'layers', sliders: 'sliders', shuffle: 'shuffle', turn: 'other', scene: 'other' }[v.kind];
    if (part) return { side: 'you', who: 'you', part };
    if (v.kind === 'restore' || v.kind === 'pick') return { side: null, who: 'you', part: 'restores' };
    return { side: null, who: 'you' }; // start (opened), branch: no one's work
  }
  // a new version in the time machine. Returns true when the log changed.
  function noteVersion(log, id, name, v, now = Date.now()) {
    if (!v?.id) return false;
    const p = piece(log, id, name, now);
    let changed = false;
    if (v.mark && Number.isFinite(v.mark.at) && !p.seenM.includes(v.mark.at) && (v.mark.by === 'claude' || v.mark.by === 'codex')) {
      remember(p.seenM, v.mark.at, 100);
      p.prompts[v.mark.by] += 1;
      if (v.mark.text) note(p, 'you', `Asked ${NAMES[v.mark.by]}: “${v.mark.text.slice(0, 60)}”`, v.mark.at);
      changed = true;
    }
    if (p.seenV.includes(v.id)) return changed;
    remember(p.seenV, v.id, SEEN);
    const c = classify(v);
    if (c.part === 'restores') { p.you.restores += 1; return true; }
    if (!c.side) return true;
    if (c.side === 'ai') p.ai[c.who] += 1; else p.you[c.part] += 1;
    if (!p.first) p.first = c.side;
    note(p, c.who, v.label || v.kind, v.at || now);
    return true;
  }
  // slider moves in the panel (each let-go counts once), saved into the code or not
  function noteMoves(log, id, name, n = 1, now = Date.now()) {
    if (!id || !num(n)) return false;
    const p = piece(log, id, name, now);
    p.moves += num(n);
    if (!p.first) p.first = 'you';
    return true;
  }
  // the Sound desk: source 'desk' (knob gesture) · 'editor' (plugin window closed with changes) · 'ai-chat' · 'preset-hover'
  // (AI-written) · 'preset' (a saved preset loaded: whose it is isn't known) · 'undo'. Counted per instrument, in the
  // piece open in the Lab at that moment (if any) and in the desk's own totals.
  function bumpSound(s, instrument, source, n) {
    const k = String(instrument || 'an instrument').slice(0, 60);
    const x = s[k] ||= { hand: 0, editor: 0, ai: { chat: 0, hover: 0 }, preset: 0, undo: 0 };
    if (source === 'desk') x.hand += n;
    else if (source === 'editor') x.editor += 1;
    else if (source === 'ai-chat') x.ai.chat += 1;
    else if (source === 'preset-hover') x.ai.hover += 1;
    else if (source === 'preset') x.preset += 1;
    else if (source === 'undo') x.undo += 1;
    else return false;
    return true;
  }
  function noteSound(log, id, name, { source, instrument, changed = 1 } = {}, now = Date.now()) {
    const n = Math.max(1, num(changed));
    const ok = bumpSound(log.desk, instrument, source, n);
    if (ok && id) {
      const p = piece(log, id, name, now);
      bumpSound(p.sound, instrument, source, n);
      if (source === 'ai-chat' || source === 'preset-hover') note(p, 'ai', `AI changed the ${instrument || 'instrument'} patch`, now);
    }
    return ok;
  }
  // a recording (hearth:quest-week): park-jam, park-song, live-set
  function noteRecording(log, id, name, { kind, title } = {}, now = Date.now()) {
    if (!REC[kind]) return false;
    const where = id ? piece(log, id, name, now) : null;
    log.rec = log.rec || {};
    log.rec[kind] = num(log.rec[kind]) + 1;
    if (where) { where.rec[kind] = num(where.rec[kind]) + 1; note(where, 'you', `Recorded: ${title || REC[kind][0]}`, now); }
    return true;
  }

  // ---------- the credits, in plain words ----------
  const handOf = (p) => p.you.code + p.you.layers + p.you.sliders + p.you.shuffle + p.you.other;
  const aiOf = (p) => AI.reduce((s, k) => s + p.ai[k], 0);
  // the time machine's versions from before the log started on this piece (thinned there, so "at least")
  function earlier(versions, since) {
    const out = { you: 0, ai: {}, n: 0 };
    for (const v of versions || []) {
      if (!v || !(v.at < since)) continue;
      const c = classify(v);
      if (c.side === 'you') out.you += 1;
      else if (c.side === 'ai') out.ai[c.who] = (out.ai[c.who] || 0) + 1;
      out.n += 1;
    }
    return out;
  }
  function soundLine(s, owner) {
    const parts = [];
    for (const [inst, x] of Object.entries(s || {})) {
      const hand = num(x.hand); const ed = num(x.editor); const ai = num(x.ai?.chat) + num(x.ai?.hover);
      const bits = [];
      if (hand || ed) bits.push(`tuned by hand by ${owner} in ${inst} (${[hand ? plural(hand, 'knob move') : '', ed ? `${plural(ed, 'session')} in the plugin's own window` : ''].filter(Boolean).join(', ')})`);
      if (ai) bits.push(`${plural(ai, 'AI patch change')} in ${inst}${x.ai?.chat && x.ai?.hover ? ` (${x.ai.chat} from the desk's AI chat, ${x.ai.hover} from ✦ Preset)` : x.ai?.hover ? ' (✦ Preset)' : ' (the desk\'s AI chat)'}`);
      if (num(x.preset)) bits.push(`${plural(num(x.preset), 'saved preset')} loaded in ${inst} (whose presets they are is not recorded)`);
      if (bits.length) parts.push(bits.join('; '));
    }
    return parts.join(' · ');
  }
  const recLine = (rec) => Object.entries(rec || {}).filter(([k, n]) => REC[k] && num(n)).map(([k, n]) => plural(num(n), ...REC[k])).join(', ');

  // credits(piece, { owner, versions (the time machine's list, to see what came before the log), desk }) →
  //   { lines: [{ k, text }], text (one paragraph to copy) }
  function credits(p, { owner = 'Quentin', versions = null } = {}) {
    const lines = [];
    if (!p) return { lines: [{ k: 'Visual', text: 'not recorded' }, { k: 'Sound', text: 'not recorded' }], text: 'Credits: not recorded.' };
    const hand = handOf(p); const ai = aiOf(p); const moves = p.moves;
    const who = AI.filter((k) => p.ai[k]).map((k) => `${NAMES[k]}: ${plural(p.ai[k], 'edit')}`);
    const handBits = [hand ? plural(hand, 'edit') : '', moves ? plural(moves, 'slider move') : ''].filter(Boolean);
    const detail = [p.you.code ? `${p.you.code} to the code` : '', p.you.layers ? `${p.you.layers} to layers` : '', p.you.sliders ? `${p.you.sliders} slider saves` : '', p.you.shuffle ? `${p.you.shuffle} shuffles kept` : ''].filter(Boolean);
    let visual;
    if (!hand && !ai && !moves) visual = 'not recorded';
    else if (ai && !hand && !moves) visual = `written by AI (${list(who)}); no hand edits recorded`;
    else if (!ai) visual = `by hand, ${owner}: ${list(handBits)}${detail.length ? ` (${detail.join(', ')})` : ''}; no AI edits recorded`;
    else if (p.first === 'ai') visual = `AI-drafted (${list(who)}), then edited and tuned by hand by ${owner}: ${list(handBits)}${detail.length ? ` (${detail.join(', ')})` : ''}`;
    else visual = `started and edited by hand by ${owner}: ${list(handBits)}${detail.length ? ` (${detail.join(', ')})` : ''}, with AI edits (${list(who)})`;
    lines.push({ k: 'Visual code', text: visual });
    lines.push({ k: 'Starting code', text: START[p.start] ? `${START[p.start]} (as ${owner} noted it)` : 'not recorded' });
    const e = versions ? earlier(versions, p.since) : null;
    if (e?.n) {
      const aiE = AI.filter((k) => e.ai[k]).map((k) => `${NAMES[k]} ${e.ai[k]}`);
      lines.push({ k: 'Before the log', text: `the time machine kept ${plural(e.n, 'older version')} (${owner} ${e.you}${aiE.length ? `, ${aiE.join(', ')}` : ', no AI'}); older history is thinned, so these are lower counts` });
    }
    const pr = ['claude', 'codex'].filter((k) => p.prompts[k]).map((k) => `${plural(p.prompts[k], 'prompt')} to ${NAMES[k]}`);
    if (pr.length) lines.push({ k: 'Direction', text: `${owner} (${list(pr)})` });
    else if (ai) lines.push({ k: 'Direction', text: 'not recorded' });
    const s = soundLine(p.sound, owner);
    const r = recLine(p.rec);
    lines.push({ k: 'Sound', text: s || (r ? '' : 'not recorded (the Sound desk wasn\'t used while this scene was open)') });
    if (r) lines.push({ k: 'Recorded', text: `${r} (played by ${owner})` });
    const shown = lines.filter((l) => l.text);
    const text = shown.map((l) => `${l.k}: ${l.text}`).join(' · ');
    return { lines: shown, text };
  }
  // the desk's totals, all pieces
  function deskCredits(log) {
    const s = soundLine(log?.desk, log?.owner || 'Quentin');
    const r = recLine(log?.rec);
    return [s ? `Sound desk: ${s}` : 'Sound desk: not recorded', r ? `Recorded: ${r}` : ''].filter(Boolean).join(' · ');
  }

  // ---------- "How it was made": which versions become stills, and their cards ----------
  // versions: the time machine's list (oldest first). Consecutive versions by the same hand doing the same kind of thing
  // are one chapter; each chapter shows its last version. Returns [{ vid, card, by }] (≤ max), the first being the start.
  function chapterOf(v) {
    const c = classify(v);
    if (c.side === 'ai') return `ai:${c.who}`;
    if (c.side === 'you') return `you:${c.part === 'sliders' || c.part === 'shuffle' ? 'tune' : c.part}`;
    return null;
  }
  function cardFor(key, n, owner) {
    const [side, what] = key.split(':');
    const times = n > 1 ? ` (${plural(n, 'edit')})` : '';
    if (side === 'ai') return `${what === 'crew' ? 'An AI crew helper' : NAMES[what]} edited the scene${times}`;
    if (what === 'code') return `${owner} edited the code by hand${times}`;
    if (what === 'tune') return `${owner} re-tuned the sliders${times}`;
    if (what === 'layers') return `${owner} changed the layers${times}`;
    return `${owner}'s own changes${times}`;
  }
  function reelPlan(versions, { owner = 'Quentin', start = '', max = 8 } = {}) {
    const vs = (versions || []).filter((v) => v && v.id);
    if (!vs.length) return [];
    const startCard = start === 'ai' ? 'Start: AI draft' : start === 'me' ? `Start: ${owner}'s first sketch` : start === 'template' ? 'Start: a Hearth template' : 'Start: the scene as first recorded';
    const chapters = [];
    for (const v of vs) {
      const k = chapterOf(v);
      if (!k) continue;
      const last = chapters.at(-1);
      if (last && last.key === k) { last.vid = v.id; last.n += 1; } else chapters.push({ key: k, vid: v.id, n: 1, first: v.id });
    }
    // the start: the first version (before any chapter's change); when the first chapter is the AI's and the owner said
    // nothing about the start, the start card stays neutral (what came before the first version is not recorded)
    const out = [{ vid: vs[0].id, card: startCard, by: vs[0].by || 'you' }];
    let keep = chapters;
    const room = Math.max(1, max - 1);
    if (keep.length > room) {
      // the biggest chapters stay (and the last one: the piece as it is now), in their order
      const last = keep.at(-1);
      const big = [...keep.slice(0, -1)].sort((a, b) => b.n - a.n).slice(0, room - 1);
      keep = keep.filter((c) => c === last || big.includes(c));
    }
    for (const c of keep) {
      const item = { vid: c.vid, card: cardFor(c.key, c.n, owner), by: c.key.startsWith('ai:') ? c.key.slice(3) : 'you' };
      if (c.vid === out[0].vid) out[0] = { ...item, card: `Start: ${item.card}` }; // (the oldest version kept is itself a change)
      else out.push(item);
    }
    return out;
  }
  // seconds per still and for the closing credits card, so the reel lasts 10–20 s
  function reelTimes(n) {
    const end = 3.5;
    const each = Math.min(3.5, Math.max(1.6, (15 - end) / Math.max(1, n)));
    let total = each * n + end;
    const scale = total < 10 ? 10 / total : total > 20 ? 20 / total : 1;
    total = Math.round((each * scale * n + end * scale) * 100) / 100;
    return { each: Math.round(each * scale * 100) / 100, end: Math.round(end * scale * 100) / 100, total };
  }
  const SIZES = { '9:16': { w: 1080, h: 1920 }, '16:9': { w: 1920, h: 1080 } };
  // the cut (tools/cut-data.js CutData): one picture clip per still, with short fades, then the credits card
  function reelEdit(files, endFile, times) {
    const clip = (img, dur) => ({ kind: 'title', text: '', img, dur, bg: '#000000', fg: '#ffffff', mute: true, fadeIn: 0.25, fadeOut: 0.25 });
    return { v: 1, clips: [...files.map((f) => clip(f, times.each)), clip(endFile, times.end)], markers: [], mark: null };
  }
  const safeName = (s) => String(s || 'piece').replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 60) || 'piece';

  return { blank, blankPiece, heal, piece, classify, noteVersion, noteMoves, noteSound, noteRecording, credits, deskCredits, earlier, reelPlan, reelTimes, reelEdit, SIZES, NAMES, safeName };
})();
if (typeof module !== 'undefined') module.exports = CreditsCore;
