// The "/" menu, grown up (round 9, chatcore). With only "/" typed it no longer lists 60 commands: it shows what you
// pinned, what you ran lately (here first), a few commands for the place you're in (in the Lab: the Lab's; in a chat
// that made things: those), then one row per area ("Lab ›  142") that opens in place (→ or Enter; ← or ‹ back returns).
// Typing filters across everything as before, the place's commands ranked first (commands.js), argument hints inline.
// notes.js (Prompts.attach, the menu itself) asks rows() for the "/" view and handles the area rows.
const ChatSlash = (() => {
  const PIN_MAX = 6; const RECENT_MAX = 6; const HERE_MAX = 6; const AREAS_SHOWN = 8;
  const MORE = '*more';
  const cmdRow = (def) => ({ kind: 'command', def, label: `/${def.name}${def.args ? ` ${def.args}` : ''}`, hint: def.desc, keys: def.keys || '' });
  // the commands of an area, most used first, then by name
  function areaCmds(area) {
    const n = Commands.counts?.() || {};
    return Commands.list().filter((d) => !d.hidden && d.area === area).sort((a, b) => (n[b.name] || 0) - (n[a.name] || 0) || a.name.localeCompare(b.name));
  }
  // a few commands for what's on screen: the place's area, or the chat's own things
  function hereRows(place, ctx) {
    if (place.id !== 'chat') return { label: `In ${place.label}`, list: areaCmds(place.area).slice(0, HERE_MAX) };
    const chat = ctx?.agentId ? Native.current?.(ctx.agentId) : null;
    const made = chat && typeof ChatThings !== 'undefined' ? ChatThings.ofChat(chat) : [];
    const c = chat && typeof ChatContext !== 'undefined' && ChatContext.data ? ChatContext.gather(chat.id, chat) : {};
    const names = [
      made.length ? 'things' : null,
      c.sequence || c.project ? 'render-again' : null,
      c.board ? 'attach-board' : null,
      c.scene ? 'attach-frame' : null,
      made.some((t) => t.k === 'video') ? 'open-last' : null,
      Object.keys(c).some((k) => c[k] && k !== 'inherited' && (!Array.isArray(c[k]) || c[k].length)) ? 'chat-context' : null,
    ].filter(Boolean);
    return { label: 'For this chat', list: names.map((x) => Commands.get(x)).filter((d) => d && !d.hidden).slice(0, HERE_MAX) };
  }
  // one row per area: the place's area first, then the ones you use most, then the menu order; past AREAS_SHOWN,
  // a "More areas ›" row (which opens the full list in place)
  function areaRows(place) {
    const counts = new Map();
    for (const d of Commands.list()) if (!d.hidden) counts.set(d.area, (counts.get(d.area) || 0) + 1);
    const n = Commands.counts?.() || {};
    const use = new Map();
    for (const d of Commands.list()) use.set(d.area, (use.get(d.area) || 0) + (n[d.name] || 0));
    const order = (Commands.areas?.() || [...counts.keys()]).filter((a) => counts.has(a));
    const ranked = [...order].sort((a, b) => (use.get(b) || 0) - (use.get(a) || 0) || order.indexOf(a) - order.indexOf(b));
    const areas = [...new Set([place.area, ...ranked])].filter((a) => counts.has(a));
    const rows = areas.map((a) => ({ kind: 'area', area: a, label: `${a} ›`, hint: `${counts.get(a)}` }));
    return rows.length > AREAS_SHOWN + 1 ? [...rows.slice(0, AREAS_SHOWN), { kind: 'area', area: MORE, label: 'More areas ›', hint: `${rows.length - AREAS_SHOWN}` }, ...rows.slice(AREAS_SHOWN)] : rows;
  }
  // rows for the menu: { kind: 'head' | 'command' | 'area' | 'back', … } (notes.js draws and picks them)
  function rows({ expanded = null, ctx = null } = {}) {
    const place = Commands.place?.() || { id: 'chat', label: 'Chat', area: 'Chat' };
    if (expanded === MORE) return [{ kind: 'back', label: '‹ All areas', hint: '← back' }, { kind: 'head', label: 'Every area' }, ...areaRows(place).filter((r) => r.area !== MORE)];
    if (expanded) {
      const list = areaCmds(expanded);
      return [{ kind: 'back', label: '‹ All areas', hint: '← back' }, { kind: 'head', label: `${expanded} · ${list.length}` }, ...list.map(cmdRow)];
    }
    const out = [];
    const used = new Set();
    const group = (label, defs) => {
      const fresh = defs.filter((d) => d && !d.hidden && !used.has(d.name));
      if (!fresh.length) return;
      out.push({ kind: 'head', label });
      for (const d of fresh) { used.add(d.name); out.push(cmdRow(d)); }
    };
    group('★ Pinned', (Commands.favs?.() || []).map((x) => Commands.get(x)).slice(0, PIN_MAX));
    const recentHere = place.id !== 'chat' ? (Commands.recent?.(place.id) || []) : [];
    if (recentHere.length) group(`Recent in ${place.label}`, recentHere.map((x) => Commands.get(x)).slice(0, RECENT_MAX));
    group('Recent', (Commands.recent?.() || []).map((x) => Commands.get(x)).filter((d) => d && !used.has(d.name)).slice(0, Math.max(2, RECENT_MAX - recentHere.length)));
    const here = hereRows(place, ctx);
    group(here.label, here.list);
    out.push({ kind: 'head', label: 'All commands, by area' });
    // the areas as rows: the place's area and the ones you use most (8), the rest behind "More areas ›"
    for (const r of areaRows(place).slice(0, AREAS_SHOWN + 1)) out.push(r);
    return out;
  }
  return { rows, areaCmds, hereRows };
})();
