// The "/" menu, grown up (round 9, chatcore). With only "/" typed it no longer lists 60 commands: it shows what you
// pinned, what you ran lately (here first), a few commands for the place you're in (in the Lab: the Lab's; in a chat
// that made things: those), then one row per area ("Lab ›  142") that opens in place (→ or Enter; ← or ‹ back returns).
// Typing filters across everything as before, the place's commands ranked first (commands.js), argument hints inline.
// notes.js (Prompts.attach, the menu itself) asks rows() for the "/" view and handles the area rows.
// (round 10, flows) Only the principal commands are listed by area; every other command lives in a flow (Flows ›, the
// first row) and in "Every command ›" at the end, and still runs typed by name.
const ChatSlash = (() => {
  const PIN_MAX = 6; const RECENT_MAX = 6; const HERE_MAX = 6; const AREAS_SHOWN = 7;
  const MORE = '*more'; const FLOWS = '*flows'; const EVERY = '*every'; const ALL = '*all:';
  const tucked = (d) => Boolean(Commands.isTucked?.(d));
  // what the owner reaches for most in each tool (docs: the night brief's usage tracking)
  const HABITS = { three: ['save', 'shuffle', 'tap', 'freeze', 'size', 'live', 'sequence'], ae: ['editor', 'frames'], board: ['board-use', 'board-add', 'vibe'] };
  const cmdRow = (def) => ({ kind: 'command', def, label: `/${def.name}${def.args ? ` ${def.args}` : ''}`, hint: def.desc, keys: def.keys || '' });
  // the commands of an area, most used first, then by name
  function areaCmds(area, { every = true } = {}) {
    const n = Commands.counts?.() || {};
    return Commands.list().filter((d) => !d.hidden && d.area === area && (every || !tucked(d))).sort((a, b) => (n[b.name] || 0) - (n[a.name] || 0) || a.name.localeCompare(b.name));
  }
  // a few commands for what's on screen: the place's area, or the chat's own things
  function hereRows(place, ctx) {
    if (place.id !== 'chat') {
      // your habits there first (the Lab: Save, Shuffle, Tap, Freeze, frame sizes, Live sound, the sequence), then its most used
      const first = (HABITS[place.id] || []).map((x) => Commands.get(x)).filter(Boolean);
      return { label: `In ${place.label}`, list: [...new Set([...first, ...areaCmds(place.area, { every: false })])].slice(0, HERE_MAX) };
    }
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
  function areaRows(place, { every = false } = {}) {
    const counts = new Map();
    // (the Flows area's own commands sit behind the "⇢ Flows ›" row)
    for (const d of Commands.list()) if (!d.hidden && (every || (!tucked(d) && d.area !== 'Flows'))) counts.set(d.area, (counts.get(d.area) || 0) + 1);
    const n = Commands.counts?.() || {};
    const use = new Map();
    for (const d of Commands.list()) use.set(d.area, (use.get(d.area) || 0) + (n[d.name] || 0));
    const order = (Commands.areas?.() || [...counts.keys()]).filter((a) => counts.has(a));
    const ranked = [...order].sort((a, b) => (use.get(b) || 0) - (use.get(a) || 0) || order.indexOf(a) - order.indexOf(b));
    const areas = [...new Set([place.area, ...ranked])].filter((a) => counts.has(a));
    const rows = areas.map((a) => ({ kind: 'area', area: every ? `${ALL}${a}` : a, label: `${a} ›`, hint: `${counts.get(a)}` }));
    if (every) return rows;
    return rows.length > AREAS_SHOWN + 1 ? [...rows.slice(0, AREAS_SHOWN), { kind: 'area', area: MORE, label: 'More areas ›', hint: `${rows.length - AREAS_SHOWN}` }, ...rows.slice(AREAS_SHOWN)] : rows;
  }
  // rows for the menu: { kind: 'head' | 'command' | 'area' | 'back', … } (notes.js draws and picks them)
  function rows({ expanded = null, ctx = null } = {}) {
    const place = Commands.place?.() || { id: 'chat', label: 'Chat', area: 'Chat' };
    const back = { kind: 'back', label: '‹ All areas', hint: '← back' };
    if (expanded === MORE) return [back, { kind: 'head', label: 'Every area' }, ...areaRows(place).filter((r) => r.area !== MORE), { kind: 'area', area: EVERY, label: 'Every command (in flows too) ›', hint: `${Commands.list().filter((d) => !d.hidden).length}` }];
    if (expanded === EVERY) return [back, ...pageRow(), { kind: 'head', label: 'Every command, by area (they run typed by name)' }, ...areaRows(place, { every: true })];
    if (expanded === FLOWS) return [back, ...flowRows()];
    if (expanded && expanded.startsWith(ALL)) {
      const area = expanded.slice(ALL.length); const list = areaCmds(area);
      return [back, { kind: 'head', label: `${area} · ${list.length} (all)` }, ...list.map(cmdRow)];
    }
    if (expanded) {
      const list = areaCmds(expanded, { every: false });
      const rest = areaCmds(expanded).length - list.length;
      return [back, { kind: 'head', label: `${expanded} · ${list.length}` }, ...list.map(cmdRow), ...(rest ? [{ kind: 'area', area: `${ALL}${expanded}`, label: `${rest} more ${expanded} commands ›`, hint: 'in flows' }] : [])];
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
    out.push({ kind: 'head', label: 'Commands, by area' });
    // the areas as rows: the place's area and the ones you use most (7), the rest behind "More areas ›"
    for (const r of areaRows(place).slice(0, AREAS_SHOWN + 1)) out.push(r);
    // (round 10) then the flows: one row that opens them, and the runs that wait for you
    if (typeof FlowsUI !== 'undefined' && typeof Flows !== 'undefined') {
      out.push({ kind: 'head', label: 'Flows' }, { kind: 'area', area: FLOWS, label: '⇢ Flows ›', hint: 'Doctor, Make a video, Record…' }, ...pageRow());
      for (const r of Flows.active().filter((x) => x.status === 'waiting-you' || x.status === 'hung').slice(0, 2)) out.push({ kind: 'run', run: () => FlowsUI.open({ runId: r.id }), label: `${r.status === 'hung' ? '↻' : '⏸'} ${r.flowName}`, hint: Flows.STATUS_LABEL[r.status] });
    }
    return out;
  }
  // Flows ›: the journeys, then every command as a flow, then yours (picking one starts it in this chat)
  function flowRows() {
    if (typeof FlowsUI === 'undefined') return [];
    FlowsUI.ensure();
    const row = (f) => ({ kind: 'run', run: () => FlowsUI.startIn(f.id, { open: true }).catch((err) => toast(err.message, { type: 'error' })), label: `${f.icon || '⇢'} ${f.name}`, hint: f.commands ? `${f.commands.length}` : (f.desc || '').slice(0, 60) });
    const mine = FlowsUI.yours();
    return [...pageRow(), { kind: 'head', label: 'Journeys' }, ...FlowsUI.journeys().map(row), ...(mine.length ? [{ kind: 'head', label: 'Yours' }, ...mine.map(row)] : []),
      { kind: 'head', label: 'Every command, as flows' }, ...FlowsUI.generated().map(row), { kind: 'run', run: () => FlowsUI.open({}), label: 'Open the flows view…', hint: 'Ctrl+Shift+F' }];
  }
  // (round 11) the Commands page: every command explained, with a preview, run one question at a time
  function pageRow() {
    return typeof CmdPage === 'undefined' ? [] : [{ kind: 'run', run: () => CmdPage.open(), label: '☰ Every command, step by step…', hint: 'the Commands page · Ctrl+Shift+F' }];
  }
  return { rows, areaCmds, hereRows, flowRows };
})();
