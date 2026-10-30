// (round 91, projaudit91) Project handling's small pure pieces found missing in the round-91 audit (Node + window;
// dev/projaudit91-test.js). Nothing here reads or writes anything.
//   renamedAway(was, now, mine, at) → [{ id, mine, now }]: projects this computer renamed lately (mine: { id: { name, at } })
//                  whose name an arrival from the other computer replaced: a rename on both computers at once settles on
//                  ONE name (the other is kept aside in the sync panel); the computer whose name lost is told, with a
//                  way back to its name, instead of finding it changed without a word
//   paletteRows(list) → the Ctrl/⌘+K rows for projects: [{ id, label, kind, keys, name }] (the live ones)
//   dropped(files, o) → what a drop on a project's Desk means: { kind: 'bundle' | 'files' | 'chat' | 'none', paths, chatId }
//   sceneJoins(o) → should a scene made in the Lab just now join the project in front of you (the Lab on screen)?
const ProjAuditCore = (() => {
  const DAY = 864e5;
  function renamedAway(was, now, mine = {}, at = Date.now()) {
    const before = new Map((Array.isArray(was) ? was : was instanceof Map ? [...was.values()] : []).map((p) => [p.id, p.name]));
    const out = [];
    for (const p of Array.isArray(now) ? now : []) {
      const m = mine[p?.id];
      if (!m || !m.name || at - (m.at || 0) > DAY) continue; // only a rename made here lately
      if (before.get(p.id) !== m.name || p.name === m.name) continue; // this window held its own name, and it is gone now
      out.push({ id: p.id, mine: m.name, now: p.name });
    }
    return out;
  }
  const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();
  // every live project as a palette row; the palette's own matching ranks them (the "Project" word in front finds them all)
  function paletteRows(list) {
    return (Array.isArray(list) ? list : []).filter((p) => p && p.status !== 'archived').map((p) => ({ id: p.id, label: `${p.ident?.glyph ? `${p.ident.glyph} ` : ''}${p.name}`, kind: 'Project', keys: '', name: p.name }));
  }
  const BUNDLE = /\.hearthproject$/i;
  // files: [{ name, path }] (path: hub.pathForFile), types: the drag's types
  function dropped(files = [], { types = [], chatId = '' } = {}) {
    const fs = (files || []).filter(Boolean);
    if (fs.some((f) => BUNDLE.test(f.name || f.path || ''))) return { kind: 'bundle', paths: [], chatId: '' };
    if (chatId && [...types].includes('application/x-hearth-chat')) return { kind: 'chat', paths: [], chatId: String(chatId) };
    const paths = fs.map((f) => f.path).filter((p) => typeof p === 'string' && p);
    return paths.length ? { kind: 'files', paths, chatId: '' } : { kind: 'none', paths: [], chatId: '' };
  }
  // o: { project (the workspace's open project), surface ('scene' while the Lab is its Scene tab), sceneId, by ('user'
  // for a scene the owner made: New / Duplicate / a template), had (Set of scene ids that existed before) }
  // A scene the Lab makes is named by its time (s<ms>): only one made in the last minute counts as new (a scene that
  // arrived from the other computer, or one the Lab only now read, never joins by itself)
  const madeAt = (id) => { const m = /^s(\d{12,14})$/.exec(String(id || '')); return m ? Number(m[1]) : 0; };
  function sceneJoins(o = {}) {
    const now = o.now || Date.now();
    return Boolean(o.project && o.surface === 'scene' && o.sceneId && o.had?.size && !o.had.has(o.sceneId) && Math.abs(now - madeAt(o.sceneId)) < 60000 && (o.by || 'user') === 'user' && !(o.project.items || []).some((x) => x.type === 'scene' && x.ref === o.sceneId));
  }
  return { renamedAway, paletteRows, dropped, sceneJoins, madeAt };
})();
if (typeof module !== 'undefined') module.exports = ProjAuditCore;
