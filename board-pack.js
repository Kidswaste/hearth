// Mood board pack (round 11, "pack11"): more ways to sort and use references, tucked behind the Board menu (▦ › Board
// name), right-click on items, chat commands (/board-collection, /board-groups, /board-lab-look, /board-timeline) and
// the agents' board_do tool.
//   · smart collections: saved searches that stay live (words, #tags, colors, moods, kinds), plus the board's own
//     moods offered as ready collections; one click lights them up and frames them
//   · vibe groups: references that feel alike gathered into frames named by their shared mood
//   · moodboard → palette → Lab look in one click: the board's (or the selection's) colors become the Lab sketch's
//     palette, recolor its color sliders and are saved as a look named after the board
//   · a timeline of the board's clips: each clip as a strip with its cuts, pace and length, side by side (click a
//     shot to watch it), and its pacing sent to the video editor (/cut-to-vibe)
// Pure helpers (clusterVibes, groupName) are exported for Node tests (dev/board-unit-test.js).
const BoardPack = (() => {
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  // ---------- pure: vibe features, k-means, names ----------
  function features(v) {
    if (!v) return null;
    const pal = v.palette || [];
    // dominant hue as a point on the color wheel (so red and magenta are near)
    let hx = 0; let hy = 0;
    for (const c of pal.slice(0, 4)) {
      const m = /^#?([0-9a-f]{6})$/i.exec(c.hex || ''); if (!m) continue;
      const n = parseInt(m[1], 16); const r = (n >> 16) / 255; const g = ((n >> 8) & 255) / 255; const b = (n & 255) / 255;
      const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const d = mx - mn; if (d < 0.08) continue;
      let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= Math.PI / 3;
      hx += Math.cos(h) * d * (c.share || 0.25); hy += Math.sin(h) * d * (c.share || 0.25);
    }
    return [clamp(v.light ?? 0.5), clamp(v.sat ?? 0.3), clamp(((v.warmth ?? 0) + 1) / 2), clamp(v.motion ?? 0), clamp(v.contrast ?? 0.4), hx, hy];
  }
  function clusterVibes(items, k = 0) {
    const pts = items.map((it) => ({ it, f: features(it.vibe) })).filter((p) => p.f);
    if (pts.length < 2) return pts.length ? [pts.map((p) => p.it)] : [];
    const K = k || clamp(Math.round(Math.sqrt(pts.length / 2)), 2, 6);
    const kk = Math.min(K, pts.length);
    // seeds: farthest-point (deterministic: start from the darkest)
    const d2 = (a, b) => a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0);
    const cs = [[...pts.reduce((a, b) => (b.f[0] < a.f[0] ? b : a)).f]];
    while (cs.length < kk) { let best = null; let bd = -1; for (const p of pts) { const d = Math.min(...cs.map((c) => d2(p.f, c))); if (d > bd) { bd = d; best = p; } } cs.push([...best.f]); }
    let asg = new Array(pts.length).fill(0);
    for (let it = 0; it < 12; it += 1) {
      asg = pts.map((p) => { let bi = 0; let bd = Infinity; cs.forEach((c, i) => { const d = d2(p.f, c); if (d < bd) { bd = d; bi = i; } }); return bi; });
      for (let i = 0; i < cs.length; i += 1) { const m = pts.filter((_, j) => asg[j] === i); if (m.length) cs[i] = cs[i].map((_, x) => m.reduce((s, p) => s + p.f[x], 0) / m.length); }
    }
    return cs.map((_, i) => pts.filter((__, j) => asg[j] === i).map((p) => p.it)).filter((g) => g.length);
  }
  // the words most of a group shares (its moods), else its light / motion
  function groupName(items, taken = new Set()) {
    const count = new Map();
    for (const it of items) for (const w of new Set(it.vibe?.moods || [])) count.set(w, (count.get(w) || 0) + 1);
    const words = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([w]) => w).filter((w) => !taken.has(w));
    if (words.length) return words.slice(0, 2).join(' · ');
    const avg = (k) => items.reduce((s, i) => s + (i.vibe?.[k] ?? 0), 0) / (items.length || 1);
    return `${avg('light') > 0.55 ? 'bright' : avg('light') < 0.35 ? 'dark' : 'mid'} · ${avg('motion') > 0.4 ? 'fast' : 'calm'}`;
  }
  // board moods shared by two or more references → ready collections
  function moodCollections(items) {
    const count = new Map();
    for (const it of items) for (const w of new Set(it.vibe?.moods || [])) count.set(w, (count.get(w) || 0) + 1);
    return [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, n]) => ({ name: w, query: w, n }));
  }
  const PURE = { features, clusterVibes, groupName, moodCollections };
  if (typeof window === 'undefined') return PURE;

  // ================= in the app =================
  const B = Board;
  const say = (m, o = {}) => { try { toast(m, { timeout: 3200, ...o }); } catch { /* headless */ } };
  const refs = () => B.items().filter((i) => i.type !== 'frame' && i.type !== 'link' && !i.hidden);
  const fmt = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${(Math.round(s * 10) / 10)} s`);
  async function showBoard() { activate('tool:board'); await B.ready(); for (let i = 0; i < 40 && !B.isMounted(); i += 1) await new Promise((r) => setTimeout(r, 50)); }

  // ---------- smart collections (saved on the board: board.collections = [{ name, query }]) ----------
  const collections = () => (B.current()?.collections || []).slice();
  function saveCollection(name, query) {
    const n = String(name || query || '').trim().slice(0, 40); const q = String(query || name || '').trim();
    if (!n || !q) throw new Error('A collection needs words to look for: /board-collection save <name> <words>');
    B.edit('collection', (bb) => { bb.collections = [...(bb.collections || []).filter((c) => c.name.toLowerCase() !== n.toLowerCase()), { name: n, query: q }]; });
    return { name: n, query: q, n: B._.matches(q).length };
  }
  function removeCollection(name) { let gone = false; B.edit('collection', (bb) => { const before = (bb.collections || []).length; bb.collections = (bb.collections || []).filter((c) => c.name.toLowerCase() !== String(name).toLowerCase()); gone = bb.collections.length < before; }); return gone; }
  // light up a collection: the rest dims (like a search), its items are selected and framed in view
  function showCollection(q) {
    const c = collections().find((x) => x.name.toLowerCase() === String(q).toLowerCase());
    const query = c ? c.query : String(q || '');
    const m = B._.matches(query);
    B._.applyFilter(m);
    B.select(m.map((i) => i.id));
    if (m.length) B.zoomSel();
    return { name: c?.name || query, n: m.length, items: m };
  }
  function collectionItems() {
    const saved = collections().map((c) => ({ label: `${c.name}  ${B._.matches(c.query).length}`, items: [
      { label: 'Show them', action: () => showCollection(c.name) },
      { label: 'Frame them', action: () => { showCollection(c.name); B.frameSelection(); } },
      { label: 'Send their vibe to the chat', action: () => { showCollection(c.name); Commands.tryRun?.('/board-use selection', H.claudeAgent()?.id); } },
      { label: 'Delete the collection', danger: true, action: () => removeCollection(c.name) },
    ] }));
    const moods = moodCollections(refs()).filter((m) => !collections().some((c) => c.query === m.query));
    return [
      ...saved,
      moods.length ? { label: 'Moods on this board', items: () => moods.map((m) => ({ label: `${m.name}  ${m.n}`, action: () => showCollection(m.query) })) } : null,
      { label: 'Save a collection…', action: async () => { const q = await Modal.prompt('Smart collection', { placeholder: 'words, #tags, colors (teal), moods, kinds (clip)', label: 'It stays live: new references that match join it.' }); if (q?.trim()) { const r = saveCollection(q.trim(), q.trim()); say(`Collection “${r.name}”: ${r.n} now`); } } },
      { label: 'Show everything', action: () => B._.applyFilter(null) },
    ].filter(Boolean);
  }

  // ---------- vibe groups: framed, named by their moods ----------
  function vibeGroups({ k = 0, list = null } = {}) {
    const items = (list || (B.selected().length > 1 ? B.selected() : refs())).filter((i) => i.vibe && !i.locked && i.type !== 'frame');
    if (items.length < 3) throw new Error('Vibe groups need three or more references with a vibe read.');
    const groups = clusterVibes(items, k);
    const bb = B._.LY.bbox(B.items().length ? B.items() : items);
    let x = bb.x + bb.w + 320; const y0 = bb.y;
    const taken = new Set(); const made = [];
    const boxes = [];
    for (const g of groups) {
      const name = groupName(g, taken); for (const w of name.split(' · ')) taken.add(w);
      const cols = Math.ceil(Math.sqrt(g.length));
      const cw = Math.max(...g.map((i) => i.w || 300)); const ch = Math.max(...g.map((i) => i.h || 220));
      const gap = 40; const pad = 60;
      g.forEach((it, j) => boxes.push({ id: it.id, x: x + pad + (j % cols) * (cw + gap), y: y0 + pad + Math.floor(j / cols) * (ch + gap) }));
      const fw = pad * 2 + cols * cw + (cols - 1) * gap; const fh = pad * 2 + Math.ceil(g.length / cols) * (ch + gap) - gap;
      made.push({ title: name, x, y: y0, w: fw, h: fh, n: g.length });
      x += fw + 160;
    }
    B.edit('vibe groups', (b) => {
      for (const p of boxes) { const it = b.items.find((i) => i.id === p.id); if (it) { it.x = p.x; it.y = p.y; } }
      for (const f of made) b.items.unshift({ ...B._.newItem('frame', { title: f.title, x: f.x, y: f.y, w: f.w, h: f.h }, b) });
    });
    B.zoomFit();
    return made.map((f) => ({ name: f.title, n: f.n }));
  }

  // ---------- moodboard → palette → Lab look ----------
  async function labLook({ name = null, list = null } = {}) {
    const items = list || (B.selected().length ? B.selected() : refs());
    const pal = (BoardVibe.summary(items).palette || []).slice(0, 6).map((c) => c.hex);
    if (pal.length < 2) throw new Error('No colors read on the board yet (references with pictures give a palette).');
    if (typeof ThreeLab === 'undefined') throw new Error('The Three.js Lab isn\'t loaded.');
    const L = await ThreeLab.cmd({ show: true });
    L.palette(pal.join(' '));
    let recolored = true; try { L.recolor(); } catch { recolored = false; }
    const look = String(name || `${B.current().name} palette`).slice(0, 40);
    let saved = null; try { saved = L.saveLook(look); } catch { saved = null; }
    return { palette: pal, look: saved ? look : null, recolored };
  }

  // ---------- the clips on a timeline ----------
  let tl = null;
  function clipsOf(list = null) { return (list || refs()).filter((i) => i.type === 'video'); }
  function timelineText(list = null) {
    return clipsOf(list).map((it) => { const v = it.vibe || {}; return `${it.title || 'clip'}: ${fmt(v.duration || 0)}, ${v.cutCount ? `${v.cutCount} cuts, ≈${v.pace}s a shot, ${v.cutsPerMin}/min` : 'one shot'}, motion ${v.motion ?? '?'}`; }).join('\n');
  }
  function timeline(list = null) {
    const clips = clipsOf(list);
    if (!clips.length) throw new Error('No clips on this board (drop a video in).');
    tl?.remove();
    const longest = Math.max(...clips.map((c) => c.vibe?.duration || 1));
    const rows = clips.map((it) => {
      const v = it.vibe || {}; const d = v.duration || 0;
      const bar = el('div', { class: 'bdp-bar', title: 'Click a shot to watch it' });
      bar.style.width = `${Math.max(6, (d / longest) * 100)}%`;
      if (it.thumb || it.poster) bar.style.backgroundImage = `url("${B.fileUrl(it.thumb || it.poster)}")`;
      const cuts = [0, ...(v.cuts || []), d];
      for (let i = 0; i < cuts.length - 1; i += 1) {
        const shot = el('button', { class: 'bdp-shot', title: `Shot ${i + 1}: ${fmt(cuts[i])} → ${fmt(cuts[i + 1])} (${fmt(cuts[i + 1] - cuts[i])})`, on: { click: () => { tl?.remove(); B.select([it.id]); B.zoomSel(); B._.viewLarge?.(it); setTimeout(() => { const vEl = document.querySelector('.bd-large video, dialog video'); if (vEl) vEl.currentTime = cuts[i] + 0.02; }, 300); } } });
        shot.style.left = `${(cuts[i] / (d || 1)) * 100}%`; shot.style.width = `${((cuts[i + 1] - cuts[i]) / (d || 1)) * 100}%`;
        bar.append(shot);
      }
      return el('div', { class: 'bdp-row' },
        el('div', { class: 'bdp-name', text: it.title || 'clip', title: it.title || '' }),
        el('div', { class: 'bdp-lane' }, bar),
        el('div', { class: 'bdp-meta', text: v.cutCount ? `${fmt(d)} · ≈${v.pace}s/shot · ${v.cutsPerMin}/min` : `${fmt(d)} · one shot` }));
    });
    const all = clips.flatMap((c) => { const v = c.vibe || {}; const cuts = [0, ...(v.cuts || []), v.duration || 0]; return cuts.slice(1).map((x, i) => x - cuts[i]); }).filter((x) => x > 0);
    const avg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 0;
    tl = el('div', { class: 'bdp-timeline', role: 'dialog', 'aria-label': 'Clips on a timeline' },
      el('div', { class: 'bdp-head' },
        el('b', { text: `Clips on a timeline · ${clips.length}` }),
        el('span', { class: 'bdp-sub', text: avg ? `the board cuts every ≈${avg.toFixed(1)} s` : '' }),
        el('button', { class: 'small', text: '✂ Pace my edit like this', title: 'The video editor suggests cuts at this pacing (/cut-to-vibe)', on: { click: () => { tl?.remove(); Commands.tryRun?.('/cut-to-vibe', H.claudeAgent()?.id); } } }),
        el('button', { class: 'small', text: '✕', title: 'Close (Esc)', on: { click: () => tl?.remove() } })),
      ...rows);
    tl.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); tl.remove(); } });
    (B._.S.ui.root || document.body).append(tl);
    tl.tabIndex = -1; tl.focus();
    return { clips: clips.length, avg: Number(avg.toFixed(2)) };
  }

  // ---------- menus: the Board menu, right-click on items ----------
  const baseBoard = B._.boardItems;
  B._.boardItems = () => [...baseBoard(),
    { label: 'Collections', items: () => collectionItems() },
    { label: 'Group by vibe (framed, named)', action: () => { try { const g = vibeGroups(); say(`${g.length} groups: ${g.map((x) => x.name).join(' / ')}`); } catch (err) { say(err.message, { type: 'error' }); } } },
    { label: 'Palette → Lab look', action: () => labLook().then((r) => say(`Lab palette ${r.palette.join(' ')}${r.look ? ` · look “${r.look}”` : ''}`), (err) => say(err.message, { type: 'error' })) },
    { label: 'Clips on a timeline', action: () => { try { timeline(); } catch (err) { say(err.message, { type: 'error' }); } } },
  ];
  const baseExtras = B._.itemExtras;
  B._.itemExtras = (list) => [...(baseExtras?.(list) || []),
    list.length > 1 ? { label: 'Group these by vibe', action: () => { try { vibeGroups({ list }); } catch (err) { say(err.message, { type: 'error' }); } } } : null,
    { label: 'Their palette → Lab look', action: () => labLook({ list }).then((r) => say(`Lab palette ${r.palette.join(' ')}`), (err) => say(err.message, { type: 'error' })), more: true },
    list.some((i) => i.type === 'video') ? { label: 'Clips on a timeline', action: () => timeline(list), more: true } : null,
  ].filter(Boolean);

  // ---------- chat commands ----------
  const defs = [
    { name: 'board-collection', aliases: ['board-collections'], desc: 'Smart collections on the board: show <name|words>, save <name> <words>, delete <name>, list (they stay live as references arrive)', args: '[show|save|delete|list] [name] [words]', examples: ['/board-collection save Night teal night', '/board-collection show Night'],
      complete: (a) => [...collections().map((c) => ({ value: `show ${c.name}` })), ...moodCollections(refs()).map((m) => ({ value: `show ${m.name}`, hint: `${m.n}` })), { value: 'save' }, { value: 'list' }].filter((x) => !a || x.value.startsWith(String(a).toLowerCase())).slice(0, 16),
      run: async (args) => {
        await showBoard(); const w = String(args || '').trim().split(/\s+/).filter(Boolean); const v = (w[0] || 'list').toLowerCase();
        if (v === 'save') { const r = saveCollection(w[1], w.slice(2).join(' ') || w[1]); return `Collection **${r.name}** (${r.query}): ${r.n} now, more as matching references arrive.`; }
        if (v === 'delete' || v === 'remove') return removeCollection(w.slice(1).join(' ')) ? 'Collection deleted.' : 'No such collection.';
        if (v === 'show') { const r = showCollection(w.slice(1).join(' ')); return `${r.name}: ${r.n} reference${r.n === 1 ? '' : 's'} lit up and selected.`; }
        const saved = collections().map((c) => `• ${c.name} (${c.query}): ${B._.matches(c.query).length}`); const moods = moodCollections(refs()).map((m) => `• ${m.name}: ${m.n}`);
        return [saved.length ? `Saved:\n${saved.join('\n')}` : 'No saved collections yet (/board-collection save <name> <words>).', moods.length ? `Moods on this board:\n${moods.join('\n')}` : ''].filter(Boolean).join('\n');
      } },
    { name: 'board-groups', aliases: ['board-group-vibe'], desc: 'Gather references that feel alike into frames named by their shared mood (the selection, or the whole board)', args: '[how many]', examples: ['/board-groups', '/board-groups 4'],
      run: async (args) => { await showBoard(); const g = vibeGroups({ k: Number(String(args || '').trim()) || 0 }); return `${g.length} vibe groups: ${g.map((x) => `**${x.name}** (${x.n})`).join(', ')}. Ctrl+Z undoes.`; } },
    { name: 'board-lab-look', aliases: ['board-to-look'], desc: 'The board\'s palette (or the selection\'s) → the Lab sketch\'s palette, its color sliders recolored, saved as a look', args: '[look name]',
      run: async (args) => { await B.ready(); const r = await labLook({ name: String(args || '').trim() || null }); return `🎨 Lab palette ${r.palette.join(' ')}${r.recolored ? ', color sliders recolored' : ''}${r.look ? `, saved as the look “${r.look}”` : ''}.`; } },
    { name: 'board-timeline', aliases: ['board-clips'], desc: 'The board\'s clips side by side on a timeline: their shots, pace and length (click a shot to watch it)', run: async () => { await showBoard(); const r = timeline(); return `${r.clips} clip${r.clips === 1 ? '' : 's'} on a timeline${r.avg ? `, cutting every ≈${r.avg} s` : ''}. ✂ sends that pacing to the video editor.`; } },
  ];
  function registerAll() { for (const d of defs) { if (Commands.get(d.name)) continue; Commands.register({ area: 'Board', ...d, aliases: (d.aliases || []).filter((a) => !Commands.get(a)) }); } }
  if (document.readyState === 'loading' || document.currentScript?.defer) addEventListener('DOMContentLoaded', registerAll, { once: true }); else registerAll();

  // ---------- the agents' board_do (mcp/board-mcp.js) ----------
  async function handle(tool, a = {}) {
    try {
      await B.ready();
      const op = String(a.op || '');
      if (op === 'collections') return { ok: true, value: { saved: collections().map((c) => ({ ...c, n: B._.matches(c.query).length })), moods: moodCollections(refs()) } };
      if (op === 'collection') { const r = saveCollection(a.name, a.query); return { ok: true, value: r }; }
      if (op === 'show') { const r = showCollection(a.name || a.query); return { ok: true, value: { name: r.name, n: r.n, items: r.items.slice(0, 30).map((i) => `${i.id} ${i.title || i.type}`) } }; }
      if (op === 'groups') { activate('tool:board'); return { ok: true, value: vibeGroups({ k: Number(a.k) || 0 }) }; }
      if (op === 'lab-look') { const r = await labLook({ name: a.name || null }); return { ok: true, value: r }; }
      if (op === 'timeline') return { ok: true, value: timelineText() || 'no clips on this board' };
      return { ok: false, error: 'op: collections | collection {name, query} | show {name} | groups {k?} | lab-look {name?} | timeline' };
    } catch (err) { return { ok: false, error: err.message }; }
  }
  if (typeof HubBridge !== 'undefined') HubBridge.register(['board_do'], handle);

  return { ...PURE, collections, saveCollection, removeCollection, showCollection, vibeGroups, labLook, timeline, timelineText, handle, defs };
})();
if (typeof module !== 'undefined') module.exports = BoardPack;
