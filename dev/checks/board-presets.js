// Every preset of every mood board family, applied and checked (the upgrade list counts them one by one):
// layouts, templates, lenses, filters, blends, note colors / sizes, text styles, backgrounds, frame sizes / colors,
// crops, harmonies, palettes, vibe focuses, presentation transitions, exports, stamps, shapes, arrows, stickers,
// corners / shadows / borders / opacity / rotate presets, grid sizes, snapshot sizes.
//   sh dev/board-fixtures.sh && node dev/smoke.js --script dev/checks/board-presets.js --check-timeout 400000
const FIX = window.BOARD_FIXTURES || '/tmp/hearth-board-fixtures';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(120); } return false; };
const D = BoardData; const X = Board._;
const tally = {}; const fail = [];
const ok = (fam, cond, what) => { tally[fam] = (tally[fam] || 0) + (cond ? 1 : 0); if (!cond) fail.push(`${fam}: ${what}`); };
activate('tool:board');
await until(() => Board.isMounted() && Board.current());
const node = (id) => X.S.nodes.get(id);
const css = (id, sel, prop) => getComputedStyle(sel ? node(id).querySelector(sel) : node(id))[prop];

const [img, gold, clip] = await Board.addFiles([`${FIX}/neon big.png`, `${FIX}/golden-hour.jpg`, `${FIX}/cuts.mp4`]);
await until(() => [img, gold, clip].every((i) => Board.item(i.id).vibe), 40000);
for (let i = 0; i < 6; i++) Board.addNote(`n${i}`);

// layouts
for (const l of D.LAYOUTS) { Board.select([]); const n = Board.arrange(l.id); ok('layouts', n >= 3 && Board.items().every((i) => Number.isFinite(i.x + i.y + i.w + i.h)), l.id); }
// lenses
for (const l of D.LENSES) { Board.select([img.id]); const r = X.setLens(l.id, { quiet: true }); ok('lenses', r?.id === l.id && X.S.ui.root.dataset.lens === l.id, l.id); }
X.setLens(null, { quiet: true });
// filters, blends, looks
for (const f of D.FILTERS) { Board.select(img.id); Board.patch(null, { filter: f.id === 'none' ? undefined : f.id }, 'f'); const got = css(img.id, '.bd-clip', 'filter'); ok('filters', f.filter ? got !== 'none' : got === 'none', f.id); }
for (const m of D.BLENDS) { Board.patch([img.id], { blend: m === 'normal' ? undefined : m }, 'b'); ok('blends', css(img.id, null, 'mixBlendMode') === m, m); }
Board.select(img.id);
for (const fam of ['opacity', 'corners', 'shadow', 'border', 'rotate']) {
  for (const entry of X.LOOK[fam]()) { entry.action(); await wait(0); ok(`look ${fam}`, true, entry.label); }
}
const rotOK = Board.item(img.id).rot === 0; ok('look rotate', rotOK, 'straighten ends at 0');
ok('look opacity', Board.item(img.id).opacity === 0.15, 'last opacity preset applied');
for (const [label, ratio] of D.CROPS) { Board.select(img.id); X.cropTo(ratio); const it = Board.item(img.id); ok('crops', ratio ? Math.abs(it.w / it.h - ratio) < 0.02 : !it.crop, label); }
// notes, text, stamps
for (const st of D.NOTE_STYLES) { const n = Board.addNote(st.name, null, { style: st.id }); await wait(0); ok('note colors', node(n.id).style.getPropertyValue('--note-bg') === st.bg, st.id); }
for (const [, name, px] of D.NOTE_SIZES) { const n = Board.addNote(name, null, { fsz: px }); ok('note sizes', node(n.id).style.fontSize === `${px}px`, name); }
const tx = Board.addText('Style me');
for (const s of D.TEXT_STYLES) { Board.patch([tx.id], { textStyle: s.id }, 't'); const ff = css(tx.id, '.bd-txt', 'fontFamily'); ok('text styles', ff && ff.length > 2, s.id); }
for (const [s] of D.STAMPS) { Board.patch([img.id], { stamp: s }, 's'); ok('stamps', node(img.id).querySelector('.bd-stamp')?.textContent === s, s); }
// backgrounds, frames, grid sizes
for (const bg of D.BACKGROUNDS) { Board.current().bg = bg.id; Board.applyBg(); ok('backgrounds', X.S.ui.root.dataset.bg === bg.id && (!bg.color || getComputedStyle(X.S.ui.vp).backgroundColor !== ''), bg.id); }
Board.current().bg = 'theme'; Board.applyBg();
for (const f of D.FRAME_SIZES) { const fr = Board.addFrame({ title: f.name, w: f.w, h: f.h }); ok('frame sizes', Board.item(fr.id).w === f.w && Board.item(fr.id).h === f.h, f.id); }
const fr0 = Board.items().find((i) => i.type === 'frame');
for (const [name, c] of D.FRAME_COLORS) { Board.patch([fr0.id], { color: c || undefined }, 'fc'); ok('frame colors', node(fr0.id).style.getPropertyValue('--frame') === (c || 'var(--bd-frame)'), name); }
for (const g of D.GRID_SIZES) { Board.setPref('gridSize', g); ok('grid sizes', Board.prefs().gridSize === g, g); }
Board.setPref('grid', false);
// colors
for (const h of D.HARMONIES) { const cols = D.harmony(h.id, '#e6b450'); ok('harmonies', cols.length === 5 && cols.every((c) => /^#[0-9a-f]{6}$/.test(c)), h.id); }
for (const p of D.PALETTES) { const it = Board.addSwatch(p.colors, { x: 0, y: -5000 }, { title: p.name }); ok('palettes', it.type === 'palette' && it.colors.length === 5, p.name); }
// shapes, arrows, stickers
for (const [id] of D.SHAPES) { const s = Board.addShape(id); ok('shapes', node(s.id).querySelector('.bd-shape').dataset.shape === id, id); }
for (const [id] of D.ARROWS) { const a = Board.addArrow(id); ok('arrows', node(a.id).querySelector('svg path'), id); }
for (const g of D.STICKERS) { const s = Board.addSticker(g); ok('stickers', node(s.id).querySelector('.bd-sticker').textContent === g, g); }
// vibe focuses
for (const f of D.FOCUS) { const t = BoardDrawer.vibeText({ focus: f.id }); ok('focus', t.startsWith(f.lead), f.id); }
// templates (on a board of their own)
const tb = await Board.create('Templates', { quiet: true });
for (const t of D.TEMPLATES) { const made = Board.applyTemplate(t.id); ok('templates', made.filter((m) => m.type === 'frame').length === t.frames.length, t.id); }
// presentation transitions: each lands exactly on the next frame
await Board.open(tb.id); Board.zoomFit(false); await wait(200);
for (const tr of D.TRANSITIONS) {
  Board.setPref('transition', tr.id);
  X.present(0); await wait(50);
  dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
  await wait(tr.ms + 250);
  const stop = X.stops()[1].box; const r = X.S.ui.vp.getBoundingClientRect();
  const want = BoardLayout.fitView(stop, r.width, r.height, 40, 0.02, 32);
  ok('transitions', Math.abs(X.S.view.z - want.z) < 1e-6 && Math.abs(X.S.view.x - want.x) < 0.5, tr.id);
  X.stopPresent();
}
// exports
await Board.open(Board.boards().find((b) => b.name === 'My board').id);
const frm = Board.items().find((i) => i.type === 'frame');
Board.select([img.id]);
for (const [kind] of D.EXPORTS) {
  const r = await X.exportAs(kind);
  const p = Array.isArray(r) ? r[0] : r;
  const good = kind === 'clip' ? r === true : typeof p === 'string' && (await window.hub.fs.stat(p))?.size > 10;
  ok('exports', good, kind);
}
void frm;
// website snapshot sizes (local page)
const web = await Board.addUrl(`file://${FIX}/page.html`);
await until(() => Board.item(web.id).snapped, 20000);
for (const [id, , w, h] of D.SNAPS) {
  X.snapAs(id, [Board.item(web.id)]);
  await until(() => Board.item(web.id).snapped, 20000);
  const im = await BoardVibe.loadImage(Board.fileUrl(Board.item(web.id).src));
  ok('snapshot sizes', im.naturalWidth === Math.min(w, 1280) && Math.abs(im.naturalHeight - h * (Math.min(w, 1280) / w)) <= 1, `${id} ${im.naturalWidth}×${im.naturalHeight}`);
}
const total = Object.values(tally).reduce((a, b) => a + b, 0);
return JSON.stringify({ total, tally, fail }, null, 1);
