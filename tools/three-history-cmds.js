// The time machine from a chat (round 23, timemachine; tools/three-history*.js).
//   /history                 the time machine on the preview + the last versions here
//   /history list [n] · show <n back> · compare <a> [b] · restore <n back> · pick colors|sliders|layer <name> <n back>
//   /history thin            (versions: "3" = three back from the newest, "now")
//   /back [n] [claude|astra] · /back undo     before the director's last n turns (each turn's start is bookmarked)
//   /branch [name]           in the Lab: a new scene from the version on screen in the time machine (else from now)
(() => {
  const AREA = 'Three.js Lab';
  const C = TMCore;
  const TH = () => ThreeHistory;
  const ready = async () => { await ThreeLab.cmd({ show: true }); return ThreeHistory; };
  const inLab = (ctx) => H.surfaceIdFor?.(H.activeId) === 'tool:three' || H.agent?.(ctx?.agentId)?.dock === 'three' || Boolean(H.agent?.(ctx?.agentId)?.threeTools);
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  let lastUndo = null; // the last restore / pick / back from a command (/back undo)
  const keepUndo = (r) => { lastUndo = r?.undo || null; return r; };
  const line = (v, i, n) => `${n - 1 - i === 0 ? '●' : String(n - 1 - i).padStart(2)} ${v.mark ? '⚑' : ' '} ${TH().fmtWhen(v.at)} · ${C.whoName(v.by)} · ${v.label}`;
  const byOf = (w) => (/^(astra|codex|gpt)$/i.test(w || '') ? 'codex' : /^claude$/i.test(w || '') ? 'claude' : null);

  async function history(args) {
    const T = await ready();
    const w = words(args); const sub = (w[0] || '').toLowerCase();
    if (!sub || sub === 'open') {
      await ThreeHistoryUI.open();
      const l = await T.list();
      const t = await T.turns();
      return `⏱ ${l.length} version${l.length === 1 ? '' : 's'} of this scene${t.length ? ` · ${t.length} director turn${t.length === 1 ? '' : 's'} bookmarked` : ''} · ←/→ scrub on the preview, Enter restore, C compare, B branch\n${l.slice(-5).map((v, i, a) => line(v, l.length - a.length + i, l.length)).join('\n')}`;
    }
    if (sub === 'close') { ThreeHistoryUI.close(); return 'Time machine closed (the scene as it is now)'; }
    if (sub === 'list') { const l = await T.list(); const n = Math.max(1, Number(w[1]) || 12); return l.length ? l.slice(-n).map((v, i, a) => line(v, l.length - a.length + i, l.length)).join('\n') : 'No versions yet'; }
    const ref = async (x) => { const id = await T.resolve(x ?? '1'); if (!id) throw new Error(`No version "${x}" (1 = the one before the newest, "now")`); return id; };
    if (sub === 'show') { if (!ThreeHistoryUI.isOpen()) await ThreeHistoryUI.open(); const id = await ref(w[1]); const i = ThreeHistoryUI.versions.findIndex((v) => v.id === id); await ThreeHistoryUI.select(i < 0 ? ThreeHistoryUI.versions.length : i); return `Showing ${id === 'now' ? 'now' : ThreeHistoryUI.versions[i]?.label} (Enter keeps it, Esc goes back)`; }
    if (sub === 'compare') { const a = await ref(w[1]); const b = w[2] ? await ref(w[2]) : 'now'; await ThreeHistoryUI.compare(a, b); const c = await T.changesBetween(a, b); return `Comparing · ${c?.summary || 'no change'}`; }
    if (sub === 'restore') { const r = keepUndo(await T.restore(await ref(w[1]))); return `${r.version?.label || 'Already like that'} · /back undo takes it back`; }
    if (sub === 'pick') {
      const what = (w[1] || '').toLowerCase();
      if (what === 'layer') { const r = keepUndo(await T.pick(await ref(w[3]), 'layer', { layer: w[2] })); return r.version?.label || 'Picked'; }
      if (what === 'colors' || what === 'sliders') { const r = keepUndo(await T.pick(await ref(w[2]), what)); return r.version?.label || 'Picked'; }
      throw new Error('/history pick colors|sliders <n back> · pick layer <name> <n back>');
    }
    if (sub === 'thin') { const n = await T.thin(); return n ? `Thinned ${n} old version${n === 1 ? '' : 's'} (today: all, this week: hourly, older: daily)` : 'Nothing to thin'; }
    throw new Error('/history [list|show|compare|restore|pick|thin|close]');
  }
  const VER = (a) => ['list', 'show 1', 'compare 1', 'restore 1', 'pick colors 1', 'pick sliders 1', 'pick layer', 'thin', 'close'].filter((x) => x.startsWith(a.trim())).map((value) => ({ value }));
  Commands.register({ name: 'history', area: AREA, args: '[list|show n|compare a b|restore n|pick …|thin]', desc: 'Time machine: every version of the scene as pictures (scrub, compare, restore, branch)', when: (ctx) => inLab(ctx), whenLabel: 'in the Lab', keywords: 'versions time machine undo earlier scrub compare restore', examples: ['/history', '/history compare 3', '/history restore 1'], undo: '/back undo', run: (a) => history(a), complete: VER });

  if (!Commands.get('back')) Commands.register({
    name: 'back', area: AREA, args: '[n] [claude|astra] | undo', desc: 'Back to before the director\'s last n turns on this scene (undoable)', keywords: 'undo director edits before time machine revert',
    examples: ['/back', '/back 3', '/back 2 astra', '/back undo'], undo: '/back undo',
    run: async (args) => {
      const T = await ready();
      const w = words(args);
      if ((w[0] || '').toLowerCase() === 'undo') { if (!lastUndo) return 'Nothing to undo'; const u = lastUndo; lastUndo = null; await u(); return 'Undone'; }
      const n = Math.max(1, Number(w.find((x) => /^\d+$/.test(x))) || 1);
      const r = keepUndo(await T.back(n, { by: byOf(w.find((x) => !/^\d+$/.test(x))) }));
      return `↶ Before ${C.whoName(r.by)}'s last ${r.turns === 1 ? 'edit' : `${r.turns} edits`} · /back undo takes it back`;
    },
    complete: (a) => ['1', '2', '3', '5', '1 claude', '1 astra', 'undo'].filter((x) => x.startsWith(a.trim())).map((value) => ({ value })),
  });
  Commands.register({
    name: 'branch', area: AREA, args: '[name]', desc: 'A new scene from the version on screen in the time machine (or from now)', when: (ctx) => inLab(ctx), whenLabel: 'in the Lab', keywords: 'fork copy version scene',
    examples: ['/branch', '/branch Neon idea'],
    run: async (args) => {
      const T = await ready();
      const at = T.scrubbing?.version || null;
      const copy = await T.branch(at, { name: args.trim() || null });
      if (ThreeHistoryUI.isOpen()) ThreeHistoryUI.close();
      return `⑂ New scene **${copy.name}**${at ? ' from that version' : ''}`;
    },
  });
})();
