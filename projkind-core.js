// (round 182, projclean182) What a project IS, for the clean Projects screen (projects-home.js) and the new-project
// card (projcreate.js). Pure: loads in Node (dev/projkind-test.js). docs/upgrades/projclean182.md.
//   KINDS / kindOf(p)        a project is a game, music or a video: `workspace.kind`, else read from how it started
//   pitchOf(p)               one line on what the project is going to be: `p.pitch`, else its description / notes
//   shelfOf(p, formats)      'older' when its scenes were all made for the old player (no v2 scene), unless the owner
//                            moved it (`p.shelf`); formats: Map sceneId → the scene's format ('gpu' = v2)
//   arrange(list, opts)      the screen's lists: { pinned, current, older, counts } after the kind filter and the sort
//   followUps(p)             what could come next, with no AI: { follow: in the same series, fresh: a different series }
//   ideasPrompt / parseIdeas the same two lists asked of an AI (one small call, on the owner's click)
//   nextName(name)           "Clink" → "Clink II" → "Clink III"
(function (root, make) { if (typeof module === 'object') module.exports = make(); else root.ProjKindCore = make(); })(typeof self !== 'undefined' ? self : this, () => {
  const KINDS = [
    { id: 'game', icon: '🎮', label: 'Game', plural: 'Games', line: 'Something you play', persona: 'builder', start: 'game' },
    { id: 'music', icon: '🎵', label: 'Music', plural: 'Music', line: 'A visual for a song', persona: 'partner', start: 'visualizer' },
    { id: 'video', icon: '🎞', label: 'Video', plural: 'Videos', line: 'A film, a loop or an edit', persona: 'director', start: 'empty' },
  ];
  const IDS = KINDS.map((k) => k.id);
  const kind = (id) => KINDS.find((k) => k.id === id) || null;
  // the new-project card: the starts a kind offers (ProjCreateCore.STARTS ids), its own first
  const STARTS = { game: ['game', 'empty'], music: ['visualizer', 'particles', 'type', 'shader', 'empty'], video: ['footage', 'model', 'type', 'shader', 'particles', 'empty'] };
  const START_KIND = { game: 'game', visualizer: 'music', particles: 'music', footage: 'video', model: 'video' };
  const cap = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

  function kindOf(p) {
    const w = p?.workspace || {};
    if (IDS.includes(w.kind)) return w.kind;
    return START_KIND[w.start] || null;
  }
  const PITCH_MAX = 200;
  function pitchOf(p) {
    if (!p) return '';
    if (p.pitch) return cap(p.pitch, PITCH_MAX);
    const d = p.workspace?.description || String(p.notes || '').split(/\n/).map((l) => l.trim()).find(Boolean) || '';
    return cap(d, PITCH_MAX);
  }

  // ---------- the "Older version" shelf ----------
  const sceneIds = (p) => [...new Set([p?.workspace?.sceneId, ...(p?.items || []).filter((x) => x.type === 'scene').map((x) => x.ref)].filter(Boolean))];
  // formats: Map / object sceneId → format; a scene missing from it isn't here (not arrived, deleted): it says nothing
  function shelfOf(p, formats) {
    if (p?.shelf === 'older' || p?.shelf === 'current') return p.shelf;
    if (!formats) return 'current';
    const get = (id) => (formats instanceof Map ? (formats.has(id) ? formats.get(id) || '' : undefined) : (id in formats ? formats[id] || '' : undefined));
    const known = sceneIds(p).map(get).filter((f) => f !== undefined);
    if (!known.length) return 'current'; // no scene yet (or none here): a project being started, not an old one
    return known.some((f) => f === 'gpu') ? 'current' : 'older';
  }

  // ---------- the screen's lists ----------
  const SORTS = [['recent', 'Last worked on'], ['new', 'Newest first'], ['name', 'Name']];
  const recentAt = (p) => Math.max(p.updated || 0, p.opened || 0, p.at || 0);
  function sorted(list, mode = 'recent') {
    const l = list.slice();
    if (mode === 'name') l.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base', numeric: true }));
    else if (mode === 'new') l.sort((a, b) => (b.at || 0) - (a.at || 0));
    else l.sort((a, b) => recentAt(b) - recentAt(a));
    return l;
  }
  // opts: { kind: 'all' | a kind id | 'none' (no kind yet), sort, formats, series }
  function arrange(list, { kind: k = 'all', sort = 'recent', formats = null, series = '' } = {}) {
    const all = (list || []).filter(Boolean);
    const counts = { all: 0, game: 0, music: 0, video: 0, none: 0, older: 0 };
    const cur = []; const old = [];
    for (const p of all) {
      const older = shelfOf(p, formats) === 'older';
      const pk = kindOf(p) || 'none';
      if (older) counts.older += 1; else { counts.all += 1; counts[pk] += 1; }
      if (k !== 'all' && pk !== k) continue;
      if (series && (p.series || '') !== series) continue;
      (older ? old : cur).push(p);
    }
    const s = sorted(cur, sort);
    return { pinned: s.filter((p) => p.pin), current: s.filter((p) => !p.pin), older: sorted(old, sort), counts };
  }
  const seriesOf = (list) => { const m = new Map(); for (const p of list || []) if (p?.series) m.set(p.series, (m.get(p.series) || 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, n]) => ({ name, n })); };

  // ---------- what could come next (no AI) ----------
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  function nextName(name) {
    const n = String(name || 'Project').trim();
    const r = /^(.*\S)\s+(II|III|IV|V|VI|VII|VIII|IX)$/.exec(n);
    if (r) return cap(`${r[1]} ${ROMAN[ROMAN.indexOf(r[2]) + 1]}`, 48);
    const d = /^(.*\S)\s+(\d{1,3})$/.exec(n);
    if (d) return cap(`${d[1]} ${Number(d[2]) + 1}`, 48);
    return cap(`${n} II`, 48);
  }
  const FOLLOW = {
    game: (n) => [
      ['A sequel', 'game', nextName(n), `The next chapter of ${n}: new levels and one new mechanic, with the same feel.`],
      ['Its trailer', 'video', `${n} · Trailer`, `A 30-second trailer for ${n}, cut to its best moments.`],
      ['Its theme, as a visual', 'music', `${n} · Theme`, `A visual for ${n}'s main theme, in the game's own look.`],
    ],
    music: (n) => [
      ['The next track', 'music', nextName(n), `The next song in the world of ${n}: the same palette, one new idea for the motion.`],
      ['A vertical cut', 'video', `${n} · Vertical`, `The strongest 20 seconds of ${n}, reframed 9:16 for Shorts and Reels.`],
      ['A playable version', 'game', `${n} · Play`, `A tiny game that moves to the song of ${n}: one button, on the beat.`],
    ],
    video: (n) => [
      ['A part two', 'video', nextName(n), `What happens after ${n}: the same look, a new scene.`],
      ['A teaser', 'video', `${n} · Teaser`, `A 15-second teaser for ${n}: one image, one move, the title.`],
      ['Its score, as a visual', 'music', `${n} · Score`, `A music visual built from the look of ${n}.`],
    ],
  };
  const FRESH = {
    game: ['A small game', 'A new little game around one verb (dodge, build or match), finished before it grows.'],
    music: ['A music visual', 'A visual for one song: a single strong idea that reacts to the kick.'],
    video: ['A short film', 'A 20-second piece: one place, one change of light, an ending.'],
  };
  // { follow: [{ id, label, kind, name, pitch, series }], fresh: [...] }
  function followUps(p) {
    const k = kindOf(p); const n = cap(p?.name || 'Project', 40); const series = p?.series || n;
    const follow = (FOLLOW[k] || FOLLOW.video)(n).map(([label, kind, name, pitch], i) => ({ id: `f${i}`, label, kind, name: cap(name, 48), pitch, series }));
    const fresh = IDS.filter((id) => id !== k).concat(k ? [k] : []).slice(0, 3).map((id, i) => ({ id: `n${i}`, label: FRESH[id][0], kind: id, name: '', pitch: FRESH[id][1], series: '' }));
    return { follow, fresh };
  }
  // the same, asked of an AI (the owner's click): what this project is, and what else they made
  function ideasPrompt(p, others = [], extra = {}) {
    const k = kindOf(p);
    const facts = { name: cap(p?.name, 48), kind: k || 'not set', goingToBe: pitchOf(p) || null, series: p?.series || null, mood: extra.mood ? cap(extra.mood, 200) : null,
      otherProjects: others.filter((o) => o && o.id !== p?.id).slice(0, 12).map((o) => `${cap(o.name, 40)}${kindOf(o) ? ` (${kindOf(o)})` : ''}`) };
    return ['Suggest what this maker could make next. They make small finished pieces: games, music visuals and short videos, built with three.js.',
      `Facts: ${JSON.stringify(facts)}`,
      'Reply with JSON only:',
      '{"follow": [3 follow-ups that continue THIS project (a sequel, a spin-off, a trailer, a different cut): {"label": "2–4 words", "kind": "game"|"music"|"video", "name": "a project name, 1–4 words", "pitch": "one sentence: what it is going to be"}],',
      ' "fresh": [3 ideas for a DIFFERENT series, unlike their other projects, one of each kind: the same shape]}',
      'Concrete and small enough to finish in a week. No filler words.'].join('\n');
  }
  function parseIdeas(text, p) {
    const t = String(text || ''); const a = t.indexOf('{'); const z = t.lastIndexOf('}');
    if (a < 0 || z <= a) return null;
    let j; try { j = JSON.parse(t.slice(a, z + 1)); } catch { return null; }
    const series = p?.series || cap(p?.name || '', 40);
    const row = (group) => (x, i) => ({ id: `${group[0]}a${i}`, label: cap(x?.label || x?.name, 40), kind: IDS.includes(x?.kind) ? x.kind : (kindOf(p) || 'video'), name: cap(x?.name, 48), pitch: cap(x?.pitch, PITCH_MAX), series: group === 'follow' ? series : '', ai: true });
    const list = (v, group) => (Array.isArray(v) ? v : []).map(row(group)).filter((x) => x.pitch && x.label).slice(0, 3);
    const out = { follow: list(j?.follow, 'follow'), fresh: list(j?.fresh, 'fresh') };
    return out.follow.length || out.fresh.length ? out : null;
  }

  return { KINDS, IDS, kind, STARTS, START_KIND, kindOf, pitchOf, PITCH_MAX, sceneIds, shelfOf, SORTS, sorted, arrange, seriesOf, nextName, followUps, ideasPrompt, parseIdeas, cap };
});
