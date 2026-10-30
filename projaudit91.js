// (round 91, projaudit91) What the round-91 walk through every project flow found missing, in one place (lazy group
// "projects", after projects-cmds.js; the pure parts are projaudit-core.js):
//   · Ctrl/⌘+K finds a project by its name and switches to it (before: only a chat of the same name, opened in Chats)
//   · the name ▾ in the workspace bar follows a rename, a delete or an arrival at once (before: the old name until the
//     next view change)
//   · a file dropped from the computer on a project's Desk joins the project, and so does a chat dragged there from
//     the chats list (before: "Drop a .hearthproject file here", nothing added)
//   · a scene made in the Lab while a project is in front of you (New, Duplicate, a template) joins it, as a capture
//     or a render made there already does (before: it belonged to no project)
//   · a rename made on both computers at once: the one whose name lost is told, with a way back to it (the other
//     computer's sync panel keeps it aside; before: the name changed here without a word)
//   · a project deleted while its Desk is open: the Desk goes back to Projects (before: it stayed on the deleted one)
const ProjAudit = (() => {
  const A = ProjAuditCore;
  const P = Projects;
  const C = ProjectsCore;
  const MINE = 'projects.renamedHere'; // this computer's own renames: { id: { name, at } } (never synced)

  // ---------- Ctrl/⌘+K ----------
  function paletteRows() {
    if (!P.isLoaded()) return [];
    return A.paletteRows(P.live()).map((r) => ({ ...r, hint: C.countText(P.get(r.id) || { items: [] }), run: () => ProjectWorkspace.open(r.id).catch((err) => { if (!err?.shown) toast(calmError(err), { type: 'error' }); }) }));
  }
  try { AppUI.addSource?.(paletteRows); } catch { /* the palette is optional */ }

  // ---------- the workspace bar, renames from the other computer, a deleted open project ----------
  let names = new Map(P.all().map((p) => [p.id, p.name]));
  const mine = () => { try { return store.get(MINE, {}) || {}; } catch { return {}; } };
  const keepMine = (m) => { try { store.set(MINE, Object.fromEntries(Object.entries(m).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0)).slice(0, 40))); } catch { /* storage off */ } };
  P.onChange((e) => {
    const why = e?.why;
    if (why === 'rename' && e.project) { const m = mine(); m[e.project.id] = { name: e.project.name, at: Date.now() }; keepMine(m); }
    if (why === 'sync') {
      const told = A.renamedAway([...names].map(([id, name]) => ({ id, name })), P.all(), mine(), Date.now());
      if (told.length) {
        const m = mine();
        for (const t of told) {
          delete m[t.id];
          toast(`“${t.mine}” is now “${t.now}”: it was renamed on your other computer at the same time.`, { timeout: 12000, action: { label: `Use “${C.cap(t.mine, 24)}”`, fn: () => { const p = P.get(t.id); if (p) P.rename(p, t.mine); } } });
        }
        keepMine(m);
      }
    }
    names = new Map(P.all().map((p) => [p.id, p.name]));
    if (['rename', 'ident', 'status', 'delete', 'restore', 'sync', 'create'].includes(why)) {
      try { window.WorkspaceNav?.sync(); } catch { /* not drawn yet */ }
      // the project whose Desk is open was deleted (here or on the other computer): back to Projects
      const open = window.ProjectsHome?.openProject?.();
      if ((why === 'delete' || why === 'sync') && open && !P.get(open)) setTimeout(() => { if (!P.get(open)) ProjectWorkspace.home().catch(() => {}); }, 0);
    }
  });

  // ---------- drops on a project's Desk ----------
  const isChatDrag = (e) => [...(e.dataTransfer?.types || [])].includes('application/x-hearth-chat');
  const isFileDrag = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  // dragover on the Desk: a chat from the list or files from the computer are taken
  const deskDrag = (e) => isChatDrag(e) || isFileDrag(e);
  // the drop: true when it was the Desk's (files / a chat added), false for a .hearthproject (imported, as before)
  function deskDrop(e, id) {
    const p = P.get(id);
    if (!p) return false;
    const files = [...(e.dataTransfer?.files || [])].map((f) => { let path = ''; try { path = window.hub.pathForFile?.(f) || ''; } catch { /* not a File from a drop */ } return { name: f.name, path: path || (typeof f.path === 'string' ? f.path : '') }; });
    let chatId = '';
    try { chatId = e.dataTransfer?.getData('application/x-hearth-chat') || ''; } catch { /* none */ }
    const d = A.dropped(files, { types: e.dataTransfer?.types || [], chatId });
    if (d.kind === 'bundle' || d.kind === 'none') return false;
    e.preventDefault();
    if (d.kind === 'chat') {
      const c = (H.chats || []).find((x) => x.id === d.chatId);
      const n = P.add(p, 'chat', d.chatId, c?.title || '');
      toast(n ? `“${C.cap(c?.title || 'The chat', 40)}” is in “${p.name}”` : `Already in “${p.name}”`, { timeout: 3000 });
      return true;
    }
    let n = 0;
    for (const path of d.paths) n += P.add(p, 'file', path, String(path).split(/[\\/]/).pop(), { links: false });
    toast(n ? `${n === 1 ? 'The file is' : `${n} files are`} in “${p.name}” (they stay where they are)` : `Already in “${p.name}”`, { timeout: 3500 });
    return true;
  }

  // ---------- a scene made in the Lab while a project is in front of you ----------
  let known = null;
  const sceneIds = () => { try { return new Set((ThreeLab.scenes?.all?.() || []).map((s) => s.id)); } catch { return null; } };
  addEventListener('hearth:sketch', (e) => {
    const id = e.detail?.id;
    if (!known?.size) { known = sceneIds(); return; } // (the Lab's first scene on screen: what it had then)
    const had = known; known = sceneIds() || had;
    const p = P.here();
    if (!A.sceneJoins({ project: p, surface: H.activeId === 'tool:three' ? 'scene' : '', sceneId: id, by: e.detail?.by, had, now: Date.now() })) return;
    P.add(p, 'scene', id, ThreeLab.scenes?.get?.(id)?.name || '', { links: false });
  });
  if (window.Lazy?.loaded?.('lab')) known = sceneIds();
  else window.Lazy?.when?.('lab', () => { setTimeout(() => { known ||= sceneIds(); }, 0); });

  return { deskDrag, deskDrop, paletteRows };
})();
window.ProjAudit = ProjAudit;
