// Mood board from the chat: /board, /ref, /vibe, /board-use, /board-add <url>… (area "Board"), and the board_ tools
// both engines get when the board toolset is on (mcp/board-mcp.js → gamebridge.js → HubBridge → here). Commands that
// only read the board cost no tokens (/vibe prints locally); /board-use and /ref attach a short vibe text to your
// next message. Chats get vibes, never the reference files.
const BoardCmds = (() => {
  const B = Board; const D = BoardData; const V = BoardVibe;
  const AREA = 'Board';
  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const opts = (list, args) => { const q = String(args || '').toLowerCase().split(/\s+/).pop(); return list.map((x) => (typeof x === 'string' ? { value: x } : x)).filter((x) => !q || String(x.value).toLowerCase().includes(q)).slice(0, 16); };
  const idOpts = (list) => list.map((x) => ({ value: x.id, hint: x.name }));
  const showBoard = async () => { activate('tool:board'); await B.ready(); await new Promise((r) => setTimeout(r, B.isMounted() ? 30 : 250)); };
  const needSel = () => { const s = B.selected(); if (!s.length) throw new Error('Select something on the board first (or name it: /board-search <words>).'); return s; };
  // the chat's linked board, else the current one
  const boardOf = async (ctx) => (ctx?.chatId ? B.boardFor(ctx.chatId) : (await B.ready(), B.current()));
  const focusOf = (w) => D.FOCUS.find((f) => f.id === w || f.name.toLowerCase().startsWith(w));
  // where new things go on a board that isn't on screen: to the right of what's there
  const freeSpot = (b) => { const bb = BoardLayout.bbox(b.items); return b.items.length ? { x: bb.x + bb.w + 80, y: bb.y } : { x: 0, y: 0 }; };

  const defs = [];
  const cmd = (d) => defs.push(d);
  cmd({ name: 'board', desc: 'Open the mood board (or switch to a board by name)', args: '[board]', keys: 'Ctrl+Shift+M = drawer', examples: ['/board', '/board night refs'], keywords: 'moodboard references miro canvas inspiration',
    complete: (a) => opts(B.boards().map((b) => ({ value: b.name, hint: `${b.count || 0} refs` })), a),
    run: async (args) => { await showBoard(); if (args.trim()) { const b = await B.open(args.trim()); if (!b) return `No board called "${args}" (/boards lists them).`; } return `▦ **${B.current().name}** · ${B.items().length} items. Drop pictures, clips or links; right-click for everything.`; } });
  cmd({ name: 'boards', desc: 'List your boards (✓ = linked to this chat)', run: async (_a, ctx) => { await B.ready(); return B.boards().map((b) => `${b.id === B.current().id ? '▸' : '•'} **${b.name}** · ${b.count || 0} refs${ctx?.chatId && (b.chats || []).includes(ctx.chatId) ? ' · ✓ linked here' : ''}`).join('\n'); } });
  cmd({ name: 'board-new', desc: 'A new board (optionally from a template)', args: '<name> [| template]', examples: ['/board-new Night drive', '/board-new Intro | social-reel'],
    complete: (a) => (a.includes('|') ? opts(D.TEMPLATES.map((t) => ({ value: `${a.split('|')[0].trim()} | ${t.id}`, hint: t.name })), a.split('|')[1]) : []),
    run: async (args) => { const [name, tpl] = args.split('|').map((s) => s.trim()); await B.ready(); const b = await B.create(name || 'New board', { template: tpl || null }); activate('tool:board'); return `New board **${b.name}**${tpl ? ` from ${tpl}` : ''}.`; } });
  cmd({ name: 'board-rename', desc: 'Rename the current board', args: '<name>', run: async (args) => { await B.ready(); await B.rename(args); return `Renamed to **${B.current().name}**.`; } });
  cmd({ name: 'board-delete', desc: 'Delete the current board (Undo in the notification)', run: async () => { await B.ready(); const n = B.current().name; if (!await Modal.confirm('Delete this board?', `"${n}"`, { ok: 'Delete', danger: true })) return 'Kept.'; await B.remove(); return `Deleted **${n}**.`; } });
  cmd({ name: 'board-duplicate', desc: 'Copy the current board', run: async () => { await B.ready(); const b = await B.duplicate(); return `Copied as **${b.name}**.`; } });
  cmd({ name: 'board-add', aliases: ['pin'], desc: 'Add a website, a picture / clip link or file path, colors or a note to the board (the chat\'s linked board)', args: '<url | path | #hex… | text>', examples: ['/board-add https://example.com', '/board-add #ff2e88 #0b0f1a', '/board-add warm grain, slow push-ins'],
    run: async (args, ctx) => {
      const t = args.trim(); if (!t) return 'Give a link, a file path, colors or text.';
      const b = await boardOf(ctx); if (b !== B.current()) await B.open(b.id);
      const at = B.isMounted() && B.visible() ? null : freeSpot(b);
      let it;
      if (/^([a-z]:\\|\/|~\/)/i.test(t) && !/\s/.test(t.replace(/\\ /g, ''))) it = (await B.addFiles([t], at))[0];
      else if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) && !t.includes(' ')) it = await B.addUrl(`https://${t}`, at);
      else it = await B.addTextSmart(t, at);
      return it ? `Added to **${B.current().name}**: ${V.KIND_WORD[it.type] || it.type} ${it.title ? `"${it.title}"` : ''} (its vibe is read in the background).` : 'Nothing added.';
    } });
  cmd({ name: 'board-note', desc: 'A note on the board (Markdown)', args: '<text>', run: async (args, ctx) => { const b = await boardOf(ctx); if (b !== B.current()) await B.open(b.id); B.addNote(args, B.visible() ? null : freeSpot(b)); return `Note added to **${b.name}**.`; } });
  cmd({ name: 'board-text', desc: 'A big text / title on the board', args: '<text>', run: async (args, ctx) => { const b = await boardOf(ctx); if (b !== B.current()) await B.open(b.id); B.addText(args || 'Title', B.visible() ? null : freeSpot(b)); return 'Text added.'; } });
  cmd({ name: 'board-color', desc: 'A color or palette card: hex colors or a palette from the library', args: '<#hex… | palette name>', examples: ['/board-color #e6b450', '/board-color neon noir'],
    complete: (a) => opts(D.PALETTES.map((p) => ({ value: p.name.toLowerCase(), hint: p.tags })), a),
    run: async (args) => {
      await B.ready();
      const hexes = args.match(/#?(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi);
      const pal = D.find(D.PALETTES, args);
      if (pal && !hexes) { B.addSwatch(pal.colors, null, { title: pal.name }); return `Palette **${pal.name}** added: ${pal.colors.join(' ')}`; }
      if (!hexes) return 'Give colors (#e6b450) or a palette name (/board-color neon noir).';
      B.addSwatch(hexes.map((h) => (h.startsWith('#') ? h : `#${h}`))); return `Added ${hexes.length} color${hexes.length > 1 ? 's' : ''}.`;
    } });
  cmd({ name: 'board-harmony', desc: 'A palette built from one color (complementary, triadic, analogous…)', args: '<harmony> <#hex>', examples: ['/board-harmony triadic #e6b450'],
    complete: (a) => (words(a).length <= 1 ? opts(D.HARMONIES.map((h) => ({ value: h.id, hint: h.name })), a) : []),
    run: async (args) => { const [h, c] = words(args); const hm = D.find(D.HARMONIES, h); const hex = (c || '').match(/#?[0-9a-f]{6}/i)?.[0]; if (!hm || !hex) return 'Like /board-harmony triadic #e6b450.'; await B.ready(); const cols = D.harmony(hm.id, hex.startsWith('#') ? hex : `#${hex}`); B.addSwatch(cols, null, { title: hm.name }); return `${hm.name}: ${cols.join(' ')}`; } });
  cmd({ name: 'board-frame', desc: 'A frame (around the selection, or a size)', args: '[size] [| title]', examples: ['/board-frame story | Hook', '/board-frame'],
    complete: (a) => opts(D.FRAME_SIZES.map((f) => ({ value: f.id, hint: f.name })), a),
    run: async (args) => { await showBoard(); const [sz, title] = args.split('|').map((s) => s.trim()); const f = sz && D.find(D.FRAME_SIZES, sz); if (f) B.addFrame({ title: title || f.name, w: f.w, h: f.h }); else B.frameSelection(B.selected().map((i) => i.id), title || sz || 'Frame'); return 'Frame added.'; } });
  cmd({ name: 'board-template', desc: 'Add a template\'s frames to this board (moodboard, music video treatment, storyboard…)', args: '<template>', examples: ['/board-template music-video'],
    complete: (a) => opts(D.TEMPLATES.map((t) => ({ value: t.id, hint: `${t.cat} · ${t.name}` })), a),
    run: async (args) => { const t = D.find(D.TEMPLATES, args); if (!t) return `Templates: ${D.TEMPLATES.slice(0, 12).map((x) => x.id).join(', ')}… (/board-template + Tab)`; await showBoard(); B.applyTemplate(t.id); return `Template **${t.name}** added (${t.frames.length} frames).`; } });
  cmd({ name: 'board-layout', aliases: ['board-arrange'], desc: 'Auto-arrange the selection (or everything): grid, masonry, timeline, collage, rainbow…', args: '<layout>', examples: ['/board-layout masonry', '/board-layout by-hue'],
    complete: (a) => opts(D.LAYOUTS.map((l) => ({ value: l.id, hint: l.name })), a),
    run: async (args) => { const l = D.find(D.LAYOUTS, args || 'grid'); if (!l) return 'Unknown layout (/board-layout + Tab).'; await showBoard(); const n = B.arrange(l.id); return n ? `Arranged ${n} items: ${l.name}. Ctrl+Z undoes.` : 'Nothing to arrange.'; } });
  cmd({ name: 'board-align', desc: 'Align the selection: left, center, right, top, middle, bottom', args: '<side>', complete: (a) => opts(['left', 'center', 'right', 'top', 'middle', 'bottom'], a),
    run: async (args) => { await showBoard(); needSel(); const map = { center: 'hcenter', middle: 'vcenter' }; Board._.alignSel(map[args.trim()] || args.trim() || 'left'); return 'Aligned.'; } });
  cmd({ name: 'board-distribute', desc: 'Even gaps across the selection: h or v', args: '<h|v>', complete: (a) => opts(['h', 'v'], a), run: async (args) => { await showBoard(); needSel(); Board._.distributeSel(args.trim().startsWith('v') ? 'v' : 'h'); return 'Distributed.'; } });
  cmd({ name: 'board-lens', desc: 'Look at the board through its vibe: palette, light, motion, texture, type, mood… (off)', args: '<lens|off>', examples: ['/board-lens palette', '/board-lens motion', '/board-lens off'],
    complete: (a) => opts([{ value: 'off' }, ...D.LENSES.map((l) => ({ value: l.id, hint: l.desc }))], a),
    run: async (args) => { await showBoard(); const id = args.trim(); const l = id && id !== 'off' ? D.find(D.LENSES, id) : null; if (id && id !== 'off' && !l) return 'Unknown lens.'; Board._.setLens(l?.id || null); return l ? `Lens: **${l.name}** (${l.desc}).` : 'Lens off.'; } });
  cmd({ name: 'board-zoom', desc: 'Zoom: fit, sel (selection), a percent (2–3200)', args: '<fit|sel|percent>', complete: (a) => opts(['fit', 'sel', '25', '50', '100', '200', '400', '1600'], a),
    run: async (args) => { await showBoard(); const w = args.trim(); if (!w || w === 'fit') B.zoomFit(); else if (w.startsWith('sel')) B.zoomSel(); else { const p = parseFloat(w); if (!p) return 'Like /board-zoom 200'; B.setZoom(Math.max(2, Math.min(3200, p)) / 100); } return 'Zoomed.'; } });
  cmd({ name: 'board-bg', desc: 'Board background: dots, grid, paper, blueprint, black…', args: '<background>', complete: (a) => opts(D.BACKGROUNDS.map((b) => ({ value: b.id, hint: b.name })), a),
    run: async (args) => { await showBoard(); const bg = D.find(D.BACKGROUNDS, args); if (!bg) return 'Unknown background.'; B.current().bg = bg.id; B.save(); B.applyBg(); return `Background: ${bg.name}.`; } });
  cmd({ name: 'board-minimap', desc: 'Minimap: auto (while moving), on, off', args: '<auto|on|off>', complete: (a) => opts(['auto', 'on', 'off'], a), run: async (args) => { await showBoard(); B.setPref('minimap', ['on', 'off'].includes(args.trim()) ? args.trim() : 'auto'); Board._.minimap(); return 'Minimap set.'; } });
  cmd({ name: 'board-snap', desc: 'Snapping to other items on / off (guides)', args: '<on|off>', complete: (a) => opts(['on', 'off'], a), run: async (args) => { await B.ready(); B.setPref('snap', args.trim() !== 'off'); return `Snapping ${args.trim() !== 'off' ? 'on' : 'off'}.`; } });
  cmd({ name: 'board-grid', desc: 'Snap to a grid on / off', args: '<on|off> [size]', complete: (a) => opts(['on', 'off'], a), run: async (args) => { await B.ready(); const [w, n] = words(args); B.setPref('grid', w !== 'off'); if (Number(n)) B.setPref('gridSize', Number(n)); return `Grid snap ${w !== 'off' ? 'on' : 'off'}.`; } });
  cmd({ name: 'board-export', desc: 'Export: png, png2, jpg, sel, frames, pages, contact, palette-png/css/json/gpl, md, vibe-json, csv, zip, clip', args: '<kind>', complete: (a) => opts(D.EXPORTS.map(([id, l]) => ({ value: id, hint: l })), a),
    run: async (args) => { await showBoard(); const k = args.trim() || 'png'; const r = await Board._.exportAs(k); return r ? `Exported (${k}).` : null; } });
  cmd({ name: 'board-present', desc: 'Present: fly between the frames (→ next, ← back, Esc ends)', args: '[transition]', complete: (a) => opts(D.TRANSITIONS.map((t) => ({ value: t.id, hint: t.name })), a),
    run: async (args) => { await showBoard(); const t = args.trim() && D.find(D.TRANSITIONS, args.trim()); if (t) B.setPref('transition', t.id); return Board._.present() ? 'Presenting (Esc ends).' : 'Nothing to present.'; } });
  cmd({ name: 'board-search', desc: 'Find on the board: words, #tags, colors (teal), moods, kinds (clip, site)', args: '<words>', examples: ['/board-search teal night', '/board-search #hero'],
    run: async (args) => { await showBoard(); const m = Board._.search(args); return `${m.length} match${m.length === 1 ? '' : 'es'}${m.length ? `: ${m.slice(0, 8).map((i) => i.title || i.type).join(', ')}` : ''}.`; } });
  cmd({ name: 'board-select', desc: 'Select: all, none, pictures, clips, sites, notes, colors, frames, stamped, #tag, or words', args: '<what>', complete: (a) => opts(['all', 'none', 'pictures', 'clips', 'sites', 'notes', 'colors', 'frames', 'stamped', ...(Board._.allTags?.() || []).map((t) => `#${t}`)], a),
    run: async (args) => {
      await showBoard(); const w = args.trim().toLowerCase();
      const K = { all: () => true, none: () => false, pictures: (i) => i.type === 'image' || i.type === 'gif', clips: (i) => i.type === 'video', sites: (i) => i.type === 'web', notes: (i) => i.type === 'note' || i.type === 'text', colors: (i) => i.type === 'swatch' || i.type === 'palette', frames: (i) => i.type === 'frame', stamped: (i) => Boolean(i.stamp) };
      const list = K[w] ? B.items().filter(K[w]) : w.startsWith('#') ? B.items().filter((i) => i.tags?.includes(w.slice(1))) : Board._.matches(w);
      B.select(list.map((i) => i.id)); return `${list.length} selected.`;
    } });
  cmd({ name: 'board-tag', desc: 'Tag the selection (#night, #hero…); "-tag" removes it', args: '<tag…>', run: async (args) => { await showBoard(); needSel(); for (const t of words(args)) { if (t.startsWith('-')) { const tag = Board._.cleanTag(t.slice(1)); B.patch(null, (i) => { i.tags = (i.tags || []).filter((x) => x !== tag); }, 'untag'); } else Board._.addTag(t); } return 'Tagged.'; } });
  cmd({ name: 'board-stamp', desc: 'Stamp the selection: ★ ♥ ✓ ✕ ? ! … (none removes)', args: '<stamp>', complete: (a) => opts(D.STAMPS.map(([s, n]) => ({ value: s, hint: n })).concat([{ value: 'none' }]), a),
    run: async (args) => { await showBoard(); needSel(); const w = args.trim(); const s = D.STAMPS.find(([st, n]) => st === w || n.toLowerCase().startsWith(w.toLowerCase())); B.patch(null, { stamp: w === 'none' ? undefined : s?.[0] || '★' }, 'stamp'); return 'Stamped.'; } });
  cmd({ name: 'board-note-on', desc: 'Your note on the selected item(s) (chats read it with the vibe)', args: '<text>', run: async (args) => { await showBoard(); needSel(); B.patch(null, { note: args.trim() || undefined }, 'note'); return 'Noted.'; } });
  cmd({ name: 'board-look', desc: 'A look for the selected pictures: bw, sepia, faded, teal-orange, cyber, dream… (none)', args: '<filter>', complete: (a) => opts(D.FILTERS.map((f) => ({ value: f.id, hint: f.name })), a),
    run: async (args) => { await showBoard(); needSel(); const f = D.find(D.FILTERS, args.trim() || 'none'); if (!f) return 'Unknown look.'; B.patch(null, { filter: f.id === 'none' ? undefined : f.id }, `look: ${f.name}`); return `Look: ${f.name}.`; } });
  cmd({ name: 'board-blend', desc: 'Blend mode of the selection (multiply, screen, overlay…)', args: '<mode>', complete: (a) => opts(D.BLENDS, a), run: async (args) => { await showBoard(); needSel(); const m = D.BLENDS.find((x) => x === args.trim()) || 'normal'; B.patch(null, { blend: m === 'normal' ? undefined : m }, 'blend'); return `Blend: ${m}.`; } });
  cmd({ name: 'board-opacity', desc: 'Opacity of the selection (0–100)', args: '<percent>', run: async (args) => { await showBoard(); needSel(); const p = Math.max(5, Math.min(100, parseFloat(args) || 100)) / 100; B.patch(null, { opacity: p === 1 ? undefined : p }, 'opacity'); return `Opacity ${Math.round(p * 100)} %.`; } });
  cmd({ name: 'board-rotate', desc: 'Rotate the selection by degrees (0 straightens)', args: '<degrees>', run: async (args) => { await showBoard(); needSel(); const d = parseFloat(args) || 0; B.patch(null, (i) => { i.rot = d === 0 ? 0 : ((((i.rot || 0) + d) % 360) + 540) % 360 - 180; }, 'rotate'); return 'Rotated.'; } });
  cmd({ name: 'board-crop', desc: 'Crop the selected pictures to a ratio: 1:1, 4:5, 9:16, 16:9, 2.39:1… (free resets)', args: '<ratio>', complete: (a) => opts(D.CROPS.map(([l]) => l.split(' ')[0]), a),
    run: async (args) => { await showBoard(); needSel(); const c = D.CROPS.find(([l]) => l.split(' ')[0].toLowerCase() === args.trim().toLowerCase()); if (!c) return 'Like /board-crop 4:5'; Board._.cropTo(c[1]); return `Cropped ${c[0]}.`; } });
  cmd({ name: 'board-clip', desc: 'The selected clip on the board: in, out, clear, loop, sound, speed <x>, grab, poster', args: '<in|out|clear|loop|sound|speed x|grab|poster>', complete: (a) => opts(['in', 'out', 'clear', 'loop', 'sound', 'speed', 'grab', 'poster'], a),
    run: async (args) => {
      await showBoard(); const it = needSel().find((i) => i.type === 'video'); if (!it) return 'Select a clip.';
      const [w, n] = words(args); const live = Board._.liveVideo(it.id); const t = live?.currentTime ?? it.lastT ?? 0;
      if (w === 'in') B.patch([it.id], { vin: t }, 'in'); else if (w === 'out') B.patch([it.id], { vout: t }, 'out'); else if (w === 'clear') B.patch([it.id], { vin: undefined, vout: undefined }, 'clear in / out');
      else if (w === 'loop') B.patch([it.id], { loop: it.loop === false ? undefined : false }, 'loop'); else if (w === 'sound') B.patch([it.id], { muted: it.muted === false ? undefined : false }, 'sound');
      else if (w === 'speed') B.patch([it.id], { speed: Number(n) || undefined }, 'speed'); else if (w === 'grab') await Board._.frameGrab(it); else if (w === 'poster') await Board._.posterHere(it);
      else return 'in, out, clear, loop, sound, speed <x>, grab or poster.';
      return `Clip ${w} done${['in', 'out', 'grab'].includes(w) ? ` at ${Board._.fmtTime(t)}` : ''}.`;
    } });
  cmd({ name: 'board-grab', desc: 'Frame grab: the selected clip at a time (seconds) as a still on the board', args: '[seconds]', run: async (args) => { await showBoard(); const it = needSel().find((i) => i.type === 'video'); if (!it) return 'Select a clip.'; await Board._.frameGrab(it, args.trim() ? Number(args) : undefined); return 'Grabbed a still.'; } });
  cmd({ name: 'board-compare', desc: 'Compare two selected items (wipe, side by side, onion, difference + their vibes)', run: async () => { await showBoard(); const s = needSel(); if (s.length !== 2) return 'Select exactly two.'; Board._.compare(s[0], s[1]); return null; } });
  cmd({ name: 'board-similar', desc: 'Select what feels like the selected item', run: async () => { await showBoard(); const s = needSel(); const hits = Board._.findSimilar(s[0]) || []; return `${hits.length} similar.`; } });
  cmd({ name: 'board-palette', desc: 'A palette card from the selection (or the whole board)', run: async () => { await showBoard(); const s = B.selected(); const it = Board._.paletteCard(s.length ? s : B.items().filter((i) => i.vibe)); return it ? `Palette: ${(it.colors || [it.color]).join(' ')}` : null; } });
  cmd({ name: 'board-reread', desc: 'Read the vibe of the selection again (or everything)', run: async () => { await showBoard(); const ids = B.selected().length ? B.selected().map((i) => i.id) : B.items().filter((i) => Board._.isMedia(i)).map((i) => i.id); B.reanalyze(ids); return `Reading ${ids.length}…`; } });
  cmd({ name: 'board-undo', desc: 'Undo on the board (Ctrl+Z there)', run: async () => { await B.ready(); B.undo(); return null; } });
  cmd({ name: 'board-redo', desc: 'Redo on the board', run: async () => { await B.ready(); B.redo(); return null; } });
  cmd({ name: 'board-link', desc: 'Link this chat to a board (the drawer and /board-use pick it here)', args: '[board]', complete: (a) => opts(B.boards().map((b) => ({ value: b.name })), a),
    run: async (args, ctx) => { await B.ready(); if (!ctx?.chatId) return 'Send a message first (the chat needs to exist).'; const e = args.trim() ? B.findBoard(args.trim()) : B.current(); if (!e) return 'No such board.'; B.linkChat(ctx.chatId, e.id); return `This chat now uses **${e.name}**.`; } });
  cmd({ name: 'board-unlink', desc: 'Unlink this chat from its board', run: async (_a, ctx) => { await B.ready(); if (ctx?.chatId) B.unlinkChat(ctx.chatId); return 'Unlinked.'; } });
  cmd({ name: 'board-use', desc: 'Attach the board\'s vibe (linked or current) to your next message; "send" sends it now', args: '[focus] [send]', examples: ['/board-use', '/board-use palette', '/board-use motion send', '/board-use opposite'], keywords: 'reference vibe style inspiration',
    complete: (a) => opts(D.FOCUS.map((f) => ({ value: f.id, hint: f.name })).concat([{ value: 'send', hint: 'send right away' }]), a),
    run: async (args, ctx) => {
      const w = words(args.toLowerCase()); const b = await boardOf(ctx);
      const f = focusOf(w.find((x) => x !== 'send') || 'full') || D.FOCUS[0];
      if (!b.items.some((i) => i.type !== 'frame')) return `**${b.name}** is empty: /board-add a link, or drop pictures on the board.`;
      await BoardDrawer.attach(ctx?.agentId, { boardId: b.id, focus: f.id, send: w.includes('send') });
      return w.includes('send') ? null : `Attached **${b.name}**'s vibe (${f.name.toLowerCase()}) to your message: add what you want and send.`;
    } });
  cmd({ name: 'ref', aliases: ['refs'], desc: 'Attach the vibe of the references matching your words (or the selection) to your next message', args: '<words> [| focus]', examples: ['/ref neon', '/ref #hero | palette', '/ref'],
    complete: (a) => (a.includes('|') ? opts(D.FOCUS.map((f) => ({ value: `${a.split('|')[0].trim()} | ${f.id}`, hint: f.name })), a.split('|')[1]) : opts((Board._.allTags?.() || []).map((t) => `#${t}`), a)),
    run: async (args, ctx) => {
      const [q, fq] = args.split('|').map((s) => s.trim()); const b = await boardOf(ctx); if (b !== B.current()) await B.open(b.id);
      const list = q ? (Board._.matches ? Board._.matches(q) : []) : B.selected();
      if (!list.length) return q ? `Nothing on **${b.name}** matches "${q}".` : 'Name what to use (/ref neon) or select references on the board.';
      const f = focusOf((fq || 'full').toLowerCase()) || D.FOCUS[0];
      await BoardDrawer.attach(ctx?.agentId, { boardId: b.id, itemIds: list.slice(0, 12).map((i) => i.id), focus: f.id });
      return `Attached the vibe of ${Math.min(12, list.length)} reference${list.length === 1 ? '' : 's'}${list.length > 12 ? ' (first 12)' : ''}.`;
    } });
  cmd({ name: 'vibe', desc: 'Show a vibe here (free, nothing sent): the board\'s, the selection\'s, or of references matching words', args: '[words | board | sel]', examples: ['/vibe', '/vibe sel', '/vibe neon'],
    run: async (args, ctx) => {
      const b = await boardOf(ctx); const q = args.trim();
      if (q === 'sel' || q === 'selection') { const s = B.selected(); return s.length ? s.map((i) => `- ${V.text(i)}`).join('\n') : 'Nothing selected.'; }
      if (q && q !== 'board') { const m = b === B.current() && Board._.matches ? Board._.matches(q) : b.items.filter((i) => JSON.stringify(i).toLowerCase().includes(q.toLowerCase())); return m.length ? m.slice(0, 12).map((i) => `- ${V.text(i)}`).join('\n') : `Nothing matches "${q}".`; }
      return BoardDrawer.vibeText({ board: b, rule: false });
    } });
  cmd({ name: 'board-peek', aliases: ['board-drawer'], desc: 'The board drawer over this chat (Ctrl+Shift+M): drag a reference into the chat for its vibe', keys: 'Ctrl+Shift+M', run: async () => { await B.ready(); BoardDrawer.toggle(); return null; } });
  cmd({ name: 'board-save-reply', desc: 'Save the last reply of this chat as a note on the board', run: async (_a, ctx) => { const t = Native.lastReplyText?.(ctx?.agentId); if (!t) return 'No reply to save.'; const b = await boardOf(ctx); if (b !== B.current()) await B.open(b.id); B.addNote(t.slice(0, 4000), B.visible() ? null : freeSpot(b), { style: 'paper', w: 420, h: 360 }); return `Saved to **${b.name}**.`; } });
  cmd({ name: 'board-clean', desc: 'Move media no board uses any more to the Recycle Bin', run: async () => { await B.ready(); await Board._.cleanMedia(); return null; } });
  cmd({ name: 'board-tools', desc: 'Let this agent use the board itself (board tools: list, vibe, add, arrange; ≈ 350 tokens a message): on, off, or directors', args: '<on|off|directors>', complete: (a) => opts(['on', 'off', 'directors'], a),
    run: async (args, ctx) => {
      const w = args.trim() || 'on'; const on = w !== 'off';
      const targets = w === 'directors' ? H.agents().filter((a) => a.dock && a.mode === 'native') : [H.agent(ctx?.agentId)].filter(Boolean);
      if (!targets.length) return 'Run this in a chat.';
      for (const a of targets) { if (on) a.boardTools = true; else delete a.boardTools; }
      await saveConfig();
      return `Board tools ${on ? 'on' : 'off'} for ${targets.map((a) => a.name).join(', ')}${on ? ' (from the next message; it reads references as vibes, never as footage)' : ''}.`;
    } });

  // ---------- the board_ tools (mcp/board-mcp.js) ----------
  async function boardArg(a, ctx) {
    await B.ready();
    if (a.board) { const e = B.findBoard(a.board); if (!e) throw new Error(`No board "${a.board}". board_list lists them.`); return B.load(e.id); }
    return ctx?.chatId ? B.boardFor(ctx.chatId) : B.current();
  }
  async function smallPreview(it) {
    const p = it.tiny || it.thumb || it.poster || (it.type === 'image' || it.type === 'web' ? it.src : null);
    if (!p) return null;
    const img = await V.loadImage(B.fileUrl(p));
    return { data: await Board._.imgToJpeg(img, 384, 0.72), mime: 'image/jpeg' };
  }
  const itemLine = (it) => `${it.id} ${V.KIND_WORD[it.type] || it.type}${it.title ? ` "${String(it.title).slice(0, 40)}"` : ''}${it.tags?.length ? ` ${it.tags.map((t) => `#${t}`).join(' ')}` : ''}${it.stamp ? ` ${it.stamp}` : ''}${it.vibe?.moods?.length ? ` · ${it.vibe.moods.slice(0, 2).join(', ')}` : ''}`;
  async function handle(tool, a, ctx) {
    if (tool === 'board_list') {
      await B.ready();
      const linked = ctx?.chatId ? (await B.boardFor(ctx.chatId))?.id : null;
      return { ok: true, value: { boards: B.boards().map((b) => `${b.id} "${b.name}" ${b.count || 0} refs${b.id === linked && b.chats?.includes(ctx.chatId) ? ' (linked to this chat)' : ''}${b.id === B.current().id ? ' (on screen)' : ''}`), use: 'board_vibe for the vibe; references give a vibe, never footage.' } };
    }
    if (tool === 'board_vibe') {
      const b = await boardArg(a, ctx);
      const fo = D.find(D.FOCUS, a.focus || 'full') || D.FOCUS[0];
      if (a.item) {
        const it = b.items.find((i) => i.id === a.item) || b.items.find((i) => (i.title || '').toLowerCase().includes(String(a.item).toLowerCase()));
        if (!it) return { ok: false, error: `No item "${a.item}" on "${b.name}" (board_vibe { items: true } lists them).` };
        const out = { ok: true, value: { vibe: V.text(it, fo.keys), preview: it.tiny || it.thumb || it.poster || null, ...(it.vibe?.cuts?.length ? { cuts: it.vibe.cuts.slice(0, 20) } : {}), rule: 'Reference only: borrow its vibe, do not place this media in the output unless the owner asks for the clip itself.' } };
        if (a.image) { const im = await smallPreview(it).catch(() => null); if (im) out.image = im.data, out.mime = im.mime; }
        return out;
      }
      const value = { vibe: BoardDrawer.vibeText({ board: b, focus: fo.id, rule: false }) };
      if (a.items) { const list = b.items.filter((i) => i.type !== 'frame'); const q = String(a.query || '').toLowerCase(); value.items = (q ? list.filter((i) => JSON.stringify([i.title, i.tags, i.note, i.text, i.vibe?.moods]).toLowerCase().includes(q)) : list).slice(0, Math.min(60, a.limit || 40)).map(itemLine); }
      if (a.query && !a.items) { const q = String(a.query).toLowerCase(); value.matches = b.items.filter((i) => i.type !== 'frame' && JSON.stringify([i.title, i.tags, i.note, i.text, i.vibe?.moods]).toLowerCase().includes(q)).slice(0, 8).map((i) => V.text(i, fo.keys)); }
      return { ok: true, value };
    }
    if (tool === 'board_add') {
      const b = await boardArg(a, ctx);
      if (b !== B.current()) await B.open(b.id);
      const at = B.visible() ? null : freeSpot(b);
      const kind = a.kind || (a.url ? 'url' : a.colors ? 'colors' : a.path ? 'file' : 'note');
      let it;
      if (kind === 'url') it = await B.addUrl(a.url, at);
      else if (kind === 'file') it = (await B.addFiles([a.path], at))[0];
      else if (kind === 'colors') it = B.addSwatch([].concat(a.colors), at, a.title ? { title: a.title } : {});
      else if (kind === 'text') it = B.addText(a.text || 'Title', at);
      else if (kind === 'frame') it = B.addFrame({ title: a.title || 'Frame', ...(a.w ? { w: a.w, h: a.h || a.w } : {}) }, at);
      else it = B.addNote(a.text || '', at, a.style ? { style: a.style } : {});
      if (!it) return { ok: false, error: 'Nothing added.' };
      const patch = {}; if (a.title && kind !== 'frame' && kind !== 'colors') patch.title = a.title; if (a.note) patch.note = a.note; if (a.tags) patch.tags = [].concat(a.tags).map(Board._.cleanTag);
      if (Object.keys(patch).length) B.patch([it.id], patch, 'tag');
      return { ok: true, value: `added ${it.id} (${V.KIND_WORD[it.type] || it.type}) to "${b.name}"` };
    }
    if (tool === 'board_arrange') {
      const b = await boardArg(a, ctx);
      if (b !== B.current()) await B.open(b.id);
      const l = D.find(D.LAYOUTS, a.layout || 'grid'); if (!l) return { ok: false, error: `Layouts: ${D.LAYOUTS.map((x) => x.id).join(', ')}` };
      const ids = a.items ? [].concat(a.items) : a.frame ? [b.items.find((i) => i.type === 'frame' && (i.id === a.frame || (i.title || '').toLowerCase() === String(a.frame).toLowerCase()))?.id].filter(Boolean) : undefined;
      const n = B.arrange(l.id, ids);
      if (B.isMounted()) setTimeout(() => B.zoomFit(), 60);
      return { ok: true, value: `arranged ${n} items: ${l.name} (the owner can Ctrl+Z)` };
    }
    return { ok: false, error: `Unknown board tool ${tool}` };
  }
  if (typeof HubBridge !== 'undefined') HubBridge.register(['board_'], handle);

  function registerAll() {
    let skipped = [];
    for (const d of defs) {
      if (Commands.get(d.name)) { skipped.push(d.name); continue; }
      Commands.register({ area: AREA, ...d, aliases: (d.aliases || []).filter((a) => !Commands.get(a)) });
    }
    if (skipped.length) console.warn('Board: command names already taken', skipped);
  }
  if (document.readyState === 'loading' || document.currentScript?.defer) addEventListener('DOMContentLoaded', registerAll, { once: true }); else registerAll();
  return { handle, defs };
})();
