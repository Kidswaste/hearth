// Mood board, third layer: versions you can go back to, an overview of all boards, a list view (sortable table of the
// references and their vibes), the eyedropper, palette card styles, a default vibe focus per board, frames by number
// (1–9), single-key toggles (L lens, M minimap, G grid, S star), Alt+arrows rotate, Ctrl+Alt+arrows scale, the
// Lab's / Video Review's current frame or this chat's pictures onto the board, HTML and board-file exports, and the
// drawer's width / side.
(() => {
  const B = Board; const { S, D, V, LY } = B._;
  const sel = () => B.selected();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- versions ----------
  const vKey = (id) => `board-${id}-versions`;
  async function saveVersion(label) {
    const b = S.cur; const list = await window.hub.kvGet(vKey(b.id), []);
    list.unshift({ at: Date.now(), label: label || new Date().toLocaleString(), items: JSON.parse(JSON.stringify(b.items)), brief: b.brief });
    await window.hub.kvSet(vKey(b.id), list.slice(0, 12));
    toast(`Version saved (${Math.min(12, list.length)} kept)`);
    return list.length;
  }
  async function versions() { return window.hub.kvGet(vKey(S.cur.id), []); }
  async function restoreVersion(i) {
    const list = await versions(); const v = list[i]; if (!v) return false;
    B.edit(`restore "${v.label}"`, (b) => { b.items = JSON.parse(JSON.stringify(v.items)); b.brief = v.brief; });
    toast(`Back to "${v.label}" (Ctrl+Z undoes)`);
    return true;
  }

  // ---------- all boards at a glance ----------
  function overview() {
    const grid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 150px)', gap: '10px', maxHeight: '60vh', overflow: 'auto' } });
    const dlg = el('dialog', { class: 'ui-modal' }, el('form', { method: 'dialog' }, el('h2', { text: 'Your boards' }), grid,
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'submit', class: 'primary', text: 'Close' }))));
    for (const b of B.boards()) {
      grid.append(el('button', { type: 'button', class: 'ghost', style: { display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', height: 'auto', textAlign: 'left' }, title: `${b.name}\n${b.count || 0} references`,
        on: { click: async () => { dlg.close(); await B.open(b.id); activate('tool:board'); } } },
      b.cover ? el('img', { src: B.fileUrl(b.cover), alt: '', style: { width: '100%', height: '90px', objectFit: 'cover', borderRadius: '6px' } }) : el('div', { style: { height: '90px', borderRadius: '6px', background: 'var(--surface)' } }),
      el('b', { text: `${b.star ? '★ ' : ''}${b.name}` }), el('small', { text: `${b.count || 0} refs${b.chats?.length ? ` · ${b.chats.length} chat${b.chats.length > 1 ? 's' : ''}` : ''}` })));
    }
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg); dlg.showModal();
    return dlg;
  }

  // ---------- list view: every reference with its vibe, sortable ----------
  function listView() {
    const rows = B.items().filter((i) => i.type !== 'frame').map((i) => {
      const v = i.vibe || {};
      return { id: i.id, kind: V.KIND_WORD[i.type] || i.type, name: i.title || '', light: v.light ?? '', contrast: v.contrast ?? '', sat: v.sat ?? '', warmth: v.warmth ?? '', motion: v.motion ?? '', pace: v.pace ?? '', mood: (v.moods || []).join(', '), tags: (i.tags || []).map((t) => `#${t}`).join(' '), stamp: i.stamp || '' };
    });
    const box = el('div', { style: { maxHeight: '62vh', overflow: 'auto', minWidth: '760px' } });
    const dlg = el('dialog', { class: 'ui-modal' }, el('form', { method: 'dialog' }, el('h2', { text: `${S.cur.name} · ${rows.length} references` }), box,
      el('div', { class: 'dialog-actions' }, el('span', { class: 'hint', text: 'Click a row to show it on the board · click a column to sort' }), el('span', { class: 'spacer' }), el('button', { type: 'submit', class: 'primary', text: 'Close' }))));
    DataTable(box, {
      columns: [{ key: 'kind', label: 'Kind' }, { key: 'name', label: 'Name' }, { key: 'light', label: 'Light', num: true }, { key: 'contrast', label: 'Contrast', num: true }, { key: 'sat', label: 'Sat.', num: true }, { key: 'warmth', label: 'Warmth', num: true }, { key: 'motion', label: 'Motion', num: true }, { key: 'pace', label: 's/shot', num: true }, { key: 'mood', label: 'Mood' }, { key: 'tags', label: 'Tags' }, { key: 'stamp', label: '' }],
      rows, onRow: (r) => { dlg.close(); B.select(r.id); B.zoomSel(); },
    });
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg); dlg.showModal();
    return rows.length;
  }

  // ---------- colors ----------
  async function eyedropper(at) {
    if (!window.EyeDropper) { toast('No eyedropper here: use Add › Color › Pick a color'); return null; }
    try { const r = await new window.EyeDropper().open(); return B.addSwatch([r.sRGBHex], at); } catch { return null; }
  }
  const PALETTE_STYLES = [['stripes', 'Stripes'], ['gradient', 'Gradient'], ['dots', 'Dots'], ['blocks', 'Blocks by share']];
  B.onChange((w) => { if (w === 'render' || w === 'items') paintPaletteStyles(); });
  function paintPaletteStyles() {
    for (const it of B.items()) {
      if (it.type !== 'palette') continue;
      const s = S.nodes.get(it.id)?.querySelector('.bd-stripes'); if (!s) continue;
      const style = it.pstyle || 'stripes';
      if (s.dataset.style === style && s.__k2 === s.__k) continue;
      s.dataset.style = style; s.__k2 = s.__k;
      s.style.background = style === 'gradient' ? `linear-gradient(90deg, ${(it.colors || []).join(', ')})` : '';
    }
  }

  // ---------- focus per board ----------
  function setFocus(id) { S.cur.focus = id === 'full' ? undefined : id; B.save(); toast(`Chats get this board's ${(D.find(D.FOCUS, id) || D.FOCUS[0]).name.toLowerCase()}`); }

  // ---------- keys ----------
  const K = B._.key;
  K('1 … 9', 'zoom to frame 1 … 9 (presentation order)', (e) => /^Digit[1-9]$/.test(e.code) && !e.ctrlKey && !e.altKey && !e.shiftKey, (e) => { const f = B._.framesInOrder()[Number(e.code.slice(5)) - 1]; if (f) { B.select(f.id); B.zoomToBox(f, 40); } });
  K('Alt+← / Alt+→', 'rotate the selection 1° (Shift: 15°)', (e) => e.altKey && !e.ctrlKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'), (e) => { const d = (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 15 : 1); B.patch(null, (i) => { i.rot = Math.round(((i.rot || 0) + d) * 10) / 10; }, 'rotate'); });
  K('Ctrl+Alt+↑ / ↓', 'scale the selection up / down 10 %', (e) => e.altKey && (e.ctrlKey || e.metaKey) && (e.key === 'ArrowUp' || e.key === 'ArrowDown'), (e) => { const k = e.key === 'ArrowUp' ? 1.1 : 1 / 1.1; B.patch(null, (i) => { const cx = i.x + i.w / 2; const cy = i.y + i.h / 2; i.w *= k; i.h *= k; if (i.fs) i.fs *= k; i.x = cx - i.w / 2; i.y = cy - i.h / 2; }, 'scale'); });
  const LENS_CYCLE = [null, 'palette', 'light', 'motion', 'mood'];
  K('L', 'next lens (palette → light → motion → mood → off)', (e) => e.code === 'KeyL' && !e.ctrlKey && !e.altKey && !e.shiftKey, () => { const i = LENS_CYCLE.indexOf(S.cur.lens || null); B._.setLens(LENS_CYCLE[(i + 1) % LENS_CYCLE.length]); });
  K('M', 'minimap: while moving → always → never', (e) => e.code === 'KeyM' && !e.ctrlKey && !e.altKey && !e.shiftKey, () => { const order = ['auto', 'on', 'off']; const cur = B.prefs().minimap || 'auto'; const next = order[(order.indexOf(cur) + 1) % 3]; B.setPref('minimap', next); B._.minimap(); toast(`Minimap: ${{ auto: 'while moving', on: 'always', off: 'never' }[next]}`); });
  K('G', 'snap to a grid on / off', (e) => e.code === 'KeyG' && !e.ctrlKey && !e.altKey && !e.shiftKey, () => { B.setPref('grid', !B.prefs().grid); toast(`Grid snap ${B.prefs().grid ? 'on' : 'off'}`); });
  K('S', 'star / unstar the selection (★ weighs more in the vibe)', (e) => e.code === 'KeyS' && !e.ctrlKey && !e.altKey && !e.shiftKey && S.sel.size > 0, () => { const all = sel().every((i) => i.stamp === '★'); B.patch(null, { stamp: all ? undefined : '★' }, 'star'); });
  K('Shift+F', 'fit the selected frame to what is inside it', (e) => e.code === 'KeyF' && e.shiftKey && !e.ctrlKey && !e.altKey, () => { const f = sel().find((i) => i.type === 'frame'); if (f) B._.fitFrame(f); });
  K('E', 'eyedropper: pick a color anywhere on screen as a swatch', (e) => e.code === 'KeyE' && !e.ctrlKey && !e.altKey && !e.shiftKey, () => eyedropper());
  K('Ctrl+Shift+S', 'save a version of the board', (e) => (e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyS', () => saveVersion());
  B._.KEYS('Alt+click the zoom', 'zoom to fit right away');
  B._.KEYS('Double-click a frame title', 'rename the frame');

  // ---------- from the rest of Hearth ----------
  async function addBridgeImage(tool, args, title) {
    const r = await HubBridge.call(tool, args);
    const img = r?.image || r?.images?.[0]?.data;
    if (!r?.ok || !img) { toast(r?.error || 'Nothing to grab', { type: 'error' }); return null; }
    const mime = r.mime || r.images?.[0]?.mime || 'image/png';
    const p = await window.hub.board.save(`${title.replace(/\W+/g, '-')}.${/jpe?g/.test(mime) ? 'jpg' : 'png'}`, img);
    const [it] = await B.addFiles([p]);
    if (it) B.patch([it.id], { title }, 'name');
    return it;
  }
  const fromLab = () => addBridgeImage('three_screenshot', { size: 'large' }, `Lab ${new Date().toLocaleTimeString()}`);
  const fromReview = () => addBridgeImage('video_frame', {}, `Video Review ${new Date().toLocaleTimeString()}`);
  // the pictures you attached in a chat
  async function fromChat(agentId = BoardDrawer.currentAgentId()) {
    const chat = Native.current?.(agentId);
    const paths = [...new Set((chat?.messages || []).flatMap((m) => m.images || []))];
    if (!paths.length) { toast('No pictures in this chat'); return []; }
    return B.addFiles(paths);
  }

  // ---------- more exports ----------
  const baseExport = B._.exportAs;
  B._.exportAs = async (kind) => {
    const name = (S.cur.name || 'board').replace(/[^\w\- ]+/g, '_');
    if (kind === 'board-json') {
      const p = await window.hub.saveFile({ defaultPath: `${name}.board.json`, content: JSON.stringify(S.cur, null, 2) });
      if (p) toast('Board file saved (Add › A board file opens it)');
      return p;
    }
    if (kind === 'html') {
      const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      const cards = B.items().filter((i) => i.type !== 'frame' && !i.hidden).map((i) => {
        const src = i.type === 'video' || i.type === 'gif' ? i.poster : i.src || i.thumb;
        const pal = (i.vibe?.palette || []).map((c) => `<i style="background:${c.hex}"></i>`).join('');
        const media = src && ['image', 'gif', 'video', 'web'].includes(i.type) ? `<img src="${B.fileUrl(src)}" alt="">` : i.type === 'swatch' ? `<div class="sw" style="background:${i.color}"></div>` : i.type === 'palette' ? `<div class="sw" style="background:linear-gradient(90deg,${(i.colors || []).join(',')})"></div>` : `<p>${esc(i.text || i.title)}</p>`;
        return `<figure>${media}<div class="pal">${pal}</div><figcaption>${esc(V.text(i))}</figcaption></figure>`;
      }).join('\n');
      const html = `<!doctype html><meta charset="utf-8"><title>${esc(S.cur.name)}</title><style>body{background:#111;color:#ddd;font:14px system-ui;margin:24px}main{columns:320px;gap:16px}figure{break-inside:avoid;margin:0 0 16px;background:#1b1d22;border-radius:10px;overflow:hidden}img{width:100%;display:block}.sw{height:120px}.pal{display:flex;height:10px}.pal i{flex:1}figcaption{padding:8px 10px;font-size:12px;color:#aaa}p{padding:12px;margin:0}pre{white-space:pre-wrap;background:#1b1d22;padding:12px;border-radius:10px}</style>
<h1>${esc(S.cur.name)}</h1><pre>${esc(BoardDrawer.vibeText({ rule: false }))}</pre><main>${cards}</main>`;
      const p = await window.hub.saveFile({ defaultPath: `${name}.html`, content: html });
      if (p) toast('Saved the board as a web page');
      return p;
    }
    return baseExport(kind);
  };
  D.EXPORTS.push(['board-json', 'Board file (.json, to open elsewhere)'], ['html', 'Web page (gallery + vibe)']);

  // ---------- the drawer: width and side ----------
  function drawerLayout() {
    const dr = document.querySelector('.bdd'); if (!dr) return;
    const p = B.prefs();
    dr.style.width = `${p.drawerW || 320}px`;
    dr.style.left = p.drawerSide === 'left' ? 'calc(var(--sidebar-w) + 10px)' : '';
    dr.style.right = p.drawerSide === 'left' ? 'auto' : '';
    dr.classList.toggle('bdd-left', p.drawerSide === 'left');
  }
  const mo = new MutationObserver(() => { const dr = document.querySelector('.bdd'); if (dr && !dr.__laid) { dr.__laid = true; drawerLayout(); dr.addEventListener('contextmenu', (e) => { if (e.target.closest('.bdd-tile, input, select, .bdd-vibe')) return; e.preventDefault(); showMenu(e.clientX, e.clientY, [
    { label: 'Width', items: () => [260, 320, 400, 520].map((w) => ({ label: `${(B.prefs().drawerW || 320) === w ? '✓ ' : ''}${w} px`, action: () => { B.setPref('drawerW', w); drawerLayout(); } })) },
    { label: B.prefs().drawerSide === 'left' ? 'Dock on the right' : 'Dock on the left', action: () => { B.setPref('drawerSide', B.prefs().drawerSide === 'left' ? 'right' : 'left'); drawerLayout(); } },
  ]); }); } });
  mo.observe(document.body, { childList: true });
  try { Keys.add({ area: 'Board', keys: 'Right-click the drawer', what: 'its width and side' }); } catch { /* no keys.js */ }

  // ---------- menus: a few entries in the existing ones ----------
  const baseBoardItems = B._.boardItems;
  B._.boardItems = () => [...baseBoardItems(),
    { label: 'Versions…', more: true, action: async () => {
      const list = await versions();
      showMenu(innerWidth / 2 - 120, 120, [{ label: 'Save a version now  Ctrl+Shift+S', action: () => saveVersion() }, ...list.map((v, i) => ({ label: `Back to ${v.label} (${v.items.length})`, action: () => restoreVersion(i) }))]);
    } },
    { label: 'All boards…', action: overview, more: true },
    { label: 'As a table…', action: listView, more: true },
    { label: 'Chats get…', more: true, items: () => D.FOCUS.map((f) => ({ label: `${(S.cur.focus || 'full') === f.id ? '✓ ' : '   '}${f.name}`, action: () => setFocus(f.id) })) }];
  const baseAddItems = B._.addItems;
  B._.addItems = (p) => [...baseAddItems(p),
    { label: 'Color from the screen (eyedropper)  E', action: () => eyedropper(p), more: true },
    { label: 'The Lab\'s current picture', action: fromLab, more: true },
    { label: 'Video Review\'s current frame', action: fromReview, more: true },
    { label: 'Pictures from the current chat', action: () => fromChat(), more: true }];
  const commands = [
    { name: 'board-version', desc: 'Save a version of the board, list them, or go back to one', args: '[save [name] | list | <number>]', run: async (args) => {
      await B.ready(); const a = args.trim();
      if (!a || a.startsWith('save')) { await saveVersion(a.replace(/^save\s*/, '') || null); return 'Version saved.'; }
      const list = await versions();
      if (a === 'list') return list.length ? list.map((v, i) => `${i + 1}. ${v.label} · ${v.items.length} items`).join('\n') : 'No versions yet (/board-version save).';
      return await restoreVersion(Number(a) - 1) ? 'Restored.' : 'No such version.';
    } },
    { name: 'board-overview', desc: 'All your boards with their covers (click one to open it)', run: async () => { await B.ready(); overview(); return null; } },
    { name: 'board-list', desc: 'The board as a sortable table: kind, light, contrast, saturation, warmth, motion, pacing, mood, tags', run: async () => { activate('tool:board'); await B.ready(); await wait(150); return `${listView()} rows.`; } },
    { name: 'board-eyedropper', desc: 'Pick a color anywhere on screen as a swatch (E on the board)', keys: 'E', run: async () => { await B.ready(); const it = await eyedropper(); return it ? `Added ${it.color}.` : null; } },
    { name: 'board-focus', desc: 'What this board gives chats by default: full, palette, light, motion, texture, composition, type, mood…', args: '<focus>', complete: () => D.FOCUS.map((f) => ({ value: f.id, hint: f.name })), run: async (args) => { await B.ready(); const f = D.find(D.FOCUS, args.trim() || 'full'); if (!f) return 'Unknown focus.'; setFocus(f.id); return `Default: ${f.name}.`; } },
    { name: 'board-from-lab', desc: 'Put the Lab\'s current picture on the board', run: async () => { await B.ready(); const it = await fromLab(); return it ? 'Lab frame added.' : null; } },
    { name: 'board-from-review', desc: 'Put Video Review\'s current frame on the board', run: async () => { await B.ready(); const it = await fromReview(); return it ? 'Frame added.' : null; } },
    { name: 'board-from-chat', desc: 'Put the pictures attached in this chat on the board', run: async (_a, ctx) => { await B.ready(); const m = await fromChat(ctx?.agentId); return m.length ? `${m.length} picture${m.length > 1 ? 's' : ''} added.` : null; } },
    { name: 'board-palette-style', desc: 'How the selected palette cards look: stripes, gradient, dots, blocks', args: '<style>', complete: () => PALETTE_STYLES.map(([id, n]) => ({ value: id, hint: n })), run: async (args) => { await B.ready(); const st = PALETTE_STYLES.find(([id]) => id === args.trim()); if (!st) return 'stripes, gradient, dots or blocks.'; B.patch(sel().filter((i) => i.type === 'palette').map((i) => i.id), { pstyle: st[0] === 'stripes' ? undefined : st[0] }, 'palette style'); return `Palette style: ${st[1]}.`; } },
  ];
  function registerAll() { for (const d of commands) if (!Commands.get(d.name)) Commands.register({ area: 'Board', ...d }); }
  if (document.readyState === 'loading' || document.currentScript?.defer) addEventListener('DOMContentLoaded', registerAll, { once: true }); else registerAll();

  Object.assign(B._, { saveVersion, versions, restoreVersion, overview, listView, eyedropper, setFocus, fromLab, fromReview, fromChat, drawerLayout, PALETTE_STYLES, paintPaletteStyles, plusDefs: commands });
})();
