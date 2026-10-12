// The asset library's commands and wiring (round 24, assets stream).
//   /assets [words] · find <words> · use <#n|name> [in sky|picture|model|text|song|sfx|lut|shader|preset|board|chat|sequence…]
//   free <words> [hdris|textures|models|materials] [polyhaven|ambientcg] · get <polyhaven|ambientcg> <id> [1k|2k|4k] [use]
//   add <path…> · watch <folder> · unwatch <folder> · folders · scan · tag <#n> <tags> · fav <#n> · import <#n> · forget <#n>
//   dupes · preset [name] · stats · thumbs clear · help                       (alias /asset)
// Wiring: Ctrl/⌘+Shift+A, the palette, the keys sheet; drops of a card on the Lab preview (by kind: a picture layer, the
// sky, a model layer, a text layer, the song, the grade…), the board (where it lands), a chat (attached), the board
// drawer; app downloads, renders and captures join the library as they finish; the Lab preview's right-click
// "🗂 Assets" and the chat's ＋ menu "From your assets" (AssetsHooks.previewItem / attachItems).
const AssetsHooks = (() => {
  const C = AssetsCore;
  const A = Assets;
  const MIME = 'application/x-hearth-asset';
  const fail = (err) => toast(err.message || String(err), { type: 'error', timeout: 6000 });
  let dragged = null;

  // ---------- drops ----------
  const viewUnder = (t) => H.agents().find((a) => a.mode === 'native' && Native.view(a.id)?.root?.contains(t)) || null;
  function zoneOf(t) {
    if (!t?.closest) return null;
    if (t.closest('.as-panel')) return null;
    if (t.closest('.three-preview')) return { z: 'lab', node: t.closest('.three-preview') };
    if (t.closest('.bd-root')) return { z: 'board', node: t.closest('.bd-root') };
    if (t.closest('.bdd')) return { z: 'drawer', node: t.closest('.bdd') };
    if (t.closest('.sq-tl')) return { z: 'seq', node: t.closest('.sq-tl') };
    const a = viewUnder(t);
    if (a) return { z: 'chat', agentId: a.id, node: Native.view(a.id).form || Native.view(a.id).root };
    return null;
  }
  let hinted = null;
  const hint = (n) => { if (hinted === n) return; hinted?.classList.remove('as-drop-hint'); hinted = n || null; hinted?.classList.add('as-drop-hint'); };
  document.addEventListener('dragover', (e) => {
    const types = [...(e.dataTransfer?.types || [])];
    if (!types.includes(MIME)) return;
    const z = zoneOf(e.target);
    if (!z) { hint(null); return; }
    if (z.z === 'seq' && types.includes('text/x-hearth-video')) { hint(null); return; } // the sequence takes media itself (at the drop time)
    e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy';
    hint(z.node);
  }, true);
  document.addEventListener('dragend', () => { hint(null); dragged = null; }, true);
  document.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (!dt?.types?.includes(MIME)) return;
    const z = zoneOf(e.target);
    hint(null);
    if (!z || (z.z === 'seq' && dt.types.includes('text/x-hearth-video'))) return;
    e.preventDefault(); e.stopPropagation();
    const it = A.get(dt.getData(MIME)) || dragged;
    if (!it) return;
    const shift = e.shiftKey; const x = e.clientX; const y = e.clientY;
    (async () => {
      let w;
      if (z.z === 'lab') w = await A.use(it, shift ? alt(it) : null);
      else if (z.z === 'board') { await window.Lazy?.load?.('board'); w = await A.use(it, 'board', { at: Board._?.toWorld?.(x, y) }); }
      else if (z.z === 'drawer') w = await A.use(it, 'board', { at: Board._?.center?.() });
      else if (z.z === 'seq') w = await A.use(it, 'sequence');
      else if (z.z === 'chat') w = await A.use(it, 'chat', { agentId: z.agentId, activate: false });
      if (w) toast(w, { timeout: 2600 });
    })().catch(fail);
  }, true);
  // Shift+drop on the Lab: the second use of each kind
  const alt = (it) => ({ image: 'channel', hdri: 'skylayer', model: 'replace', font: 'ref', sound: 'sfx', video: 'sequence', lut: 'ref', shader: 'ref', preset: 'preset' }[it.k] || 'ref');

  // ---------- things that join the library as they finish ----------
  const kindOk = (p) => Boolean(C.kindOf(p));
  async function catchUp() {
    const ds = await window.hub.apps?.downloads?.().catch(() => []) || [];
    await A.ready();
    const fresh = ds.filter((d) => d.state === 'completed' && d.path && kindOk(d.path) && !C.byPath(A.db, d.path)).slice(0, 200);
    if (fresh.length) await A.add(fresh.map((d) => d.path), { src: 'download', o: 'App downloads' }).catch(() => {});
  }
  function wire() {
    // an app window's download (Meshy, Sketchfab, Suno…), or Poly Haven's sky picker: indexed when it completes
    try { Apps.on('download', (d) => { if (d?.state !== 'completed' || !d.path || !kindOk(d.path)) return; const ph = d.app === 'polyhaven'; A.add([d.path], ph ? { src: 'polyhaven', o: 'Poly Haven', i: { lic: 'CC0' } } : { src: 'download', o: d.appName || d.app }).catch(() => {}); }); } catch { /* no apps */ }
    window.Lazy?.when?.('renders', () => { try { Renders.onChange((j) => { if (j?.status === 'done' && j.output && kindOk(j.output)) A.add([j.output], { src: 'render', o: j.title || 'Render' }).catch(() => {}); }); } catch { /* no render queue */ } });
    document.addEventListener('hearth:capture', (e) => { const p = e.detail?.path; if (p && kindOk(p)) A.add([p], { src: 'capture', o: 'Capture' }).catch(() => {}); });
    document.addEventListener('hearth:recording', (e) => { const d = e.detail; if (d && d.recording === false && d.path && kindOk(d.path)) A.add([d.path], { src: 'capture', o: 'Recording' }).catch(() => {}); });
    window.hub.assets?.onEvent?.((ev) => {
      if (ev?.type === 'changed' && ev.root) A.scan({ only: [ev.root], force: true }).catch(() => {});
      if (ev?.type === 'scan' && AssetsUI.isOpen()) { const s = AssetsUI.el?.querySelector('.as-status'); if (s) s.textContent = `Scanning… ${ev.found} files`; }
    });
  }

  // ---------- menus elsewhere (small hooks) ----------
  // the Lab preview's right-click
  function previewItem() {
    return { label: '🗂 Assets', items: () => {
      const recent = A.db ? C.search(A.db, '', { sort: 'recent' }).filter((x) => !x.g).slice(0, 6) : [];
      return [
        { label: 'Open the asset library', key: 'Ctrl+Shift+A', action: () => AssetsUI.open() },
        { label: 'Free skies, textures and models…', action: () => AssetsUI.open({ tab: 'free' }) },
        recent.length ? '-' : null,
        ...recent.map((it) => ({ label: `${C.KINDS[it.k]?.icon || '▫'} ${it.n.slice(0, 36)}`, hint: A.LABEL[A.labDefault(it)].replace(/^\S+\s/, ''), action: () => AssetsUI.useIt(it) })),
        '-',
        { label: '🎚 Save this layer\'s sliders as a preset', action: () => A.savePreset().then((it) => toast(`🎚 ${it.n} is in your assets`, { timeout: 2400 })).catch(fail) },
      ].filter(Boolean);
    } };
  }
  // the chat's ＋ menu: attach an asset
  function attachItems(agentId) {
    return [{ label: 'From your assets', icon: 'folder', items: () => {
      const list = A.db ? C.search(A.db, '', { sort: 'recent' }).filter((x) => !x.g).sort((a, b) => (b.f || 0) - (a.f || 0)).slice(0, 10) : [];
      return [
        ...list.map((it) => ({ label: `${C.KINDS[it.k]?.icon || '▫'} ${it.n.slice(0, 40)}`, hint: C.KINDS[it.k]?.one, action: () => A.use(it, 'chat', { agentId, activate: false }).then((w) => toast(w, { timeout: 2000 })).catch(fail) })),
        list.length ? '-' : null,
        { label: 'Open the asset library…', key: 'Ctrl+Shift+A', action: () => AssetsUI.open() },
      ].filter(Boolean);
    } }];
  }

  // ---------- /assets ----------
  const VERBS = { find: 'search the library (kind:, #tag, fav)', use: '#n [in sky | picture | model | text | song | board | chat …]', free: 'search Poly Haven / ambientCG', get: '<polyhaven|ambientcg> <id> [1k|2k|4k] [use]', add: 'files by path', watch: 'a folder (kept up to date)', unwatch: 'stop watching a folder', folders: 'the watched folders', scan: 'rescan the folders now', tag: '#n tags (+add -remove)', fav: '#n ★', import: '#n: a copy into Hearth', forget: '#n leaves the library', dupes: 'the same file in two places', preset: 'the selected layer\'s sliders as a preset', stats: 'counts, the cache', thumbs: 'clear: the thumbnail cache', help: 'what it does' };
  const TARGET_WORDS = new Set(['picture', 'channel', 'sky', 'skylayer', 'model', 'replace', 'clips', 'text', 'song', 'footage', 'sfx', 'lut', 'grade', 'shader', 'preset', 'ref', 'reference', 'board', 'chat', 'sequence', 'seq', 'lab', 'reveal']);
  const TARGET_ALIAS = { grade: 'lut', reference: 'ref', seq: 'sequence', lab: null };
  const list = (items, more = 0) => `${items.map((it, i) => C.line(it, i)).join('\n')}${more ? `\n…and ${more} more (/assets opens them all)` : ''}`;
  function split(rest) {
    const w = rest.trim().split(/\s+/).filter(Boolean);
    let target;
    if (w.length > 1 && TARGET_WORDS.has(w[w.length - 1].toLowerCase())) { const t = w.pop().toLowerCase(); target = t in TARGET_ALIAS ? TARGET_ALIAS[t] : t; if (/^(in|as|to|into|on)$/i.test(w[w.length - 1] || '')) w.pop(); }
    return { ref: w.join(' '), target };
  }
  function register() {
    if (Commands.get('assets')) return;
    Commands.register({
      name: 'assets', aliases: Commands.get('asset') ? [] : ['asset'], area: 'Assets', keys: 'Ctrl+Shift+A',
      args: '[words] | find <words> | use <#n|name> [in sky|picture|model|text|song|board|chat…] | free <words> [hdris|textures|models] [ambientcg] | get <source> <id> [2k] | add <path> | watch <folder> | tag <#n> <tags> | fav <#n> | import <#n> | dupes | preset | stats',
      desc: 'Your asset library: textures, HDRIs, 3D models, fonts, sounds, LUTs, shaders, presets from your folders, app downloads, renders, Poly Haven and ambientCG (free, CC0). Use any of them in the Lab, on the board, in a chat or the sequence',
      keywords: 'assets library textures texture hdri hdris skies models 3d fonts font sounds sfx songs luts lut shaders presets poly haven polyhaven ambientcg cc0 pbr materials folder watch favorites tags',
      examples: ['/assets', '/assets brick', '/assets find kind:hdri sunset', '/assets use #1 sky', '/assets free wood textures', '/assets free bricks ambientcg', '/assets get polyhaven kloppenheim_06 2k use', '/assets watch ~/Textures', '/assets tag #2 wall red'],
      complete: (a) => {
        const s = String(a || '');
        if (!/\s/.test(s)) return Object.keys(VERBS).filter((v) => v.startsWith(s.toLowerCase())).map((v) => ({ value: `${v} `, hint: VERBS[v] }));
        const verb = s.split(/\s+/)[0].toLowerCase();
        if (verb === 'free') return ['hdris', 'textures', 'models', 'materials ambientcg', 'hdris ambientcg'].map((v) => ({ value: `free ${s.split(/\s+/).slice(1).filter((w) => !/^(hdris|textures|models|materials|ambientcg|polyhaven)$/i.test(w)).join(' ')} ${v}`.replace(/\s+/g, ' ') }));
        if (verb === 'get') return ['polyhaven', 'ambientcg'].map((v) => ({ value: `get ${v} ` }));
        if (verb === 'thumbs') return [{ value: 'thumbs clear' }];
        if (['use', 'tag', 'fav', 'import', 'forget'].includes(verb)) {
          const items = A.db ? C.search(A.db, s.split(/\s+/).slice(1).join(' '), {}).slice(0, 8) : [];
          return items.map((it) => ({ value: `${verb} ${it.n}${verb === 'use' ? ` in ${A.labDefault(it)}` : ''}`, hint: C.KINDS[it.k]?.one }));
        }
        return [];
      },
      run: async (args, ctx) => {
        await A.ready();
        const s = String(args || '').trim();
        const [v0, ...rest] = s.split(/\s+/);
        const verb = (v0 || '').toLowerCase();
        const restText = rest.join(' ').trim();
        const human = ctx.source !== 'code';
        if (!verb || !(verb in VERBS)) { if (human) await AssetsUI.open({ q: s, tab: 'library' }); const found = A.remember(A.search(s)); return s ? (found.length ? list(found.slice(0, 8), found.length - 8 > 0 ? found.length - 8 : 0) : `Nothing called “${s}” in your assets: /assets free ${s} looks in Poly Haven.`) : `🗂 ${C.counts(A.db).all} assets (Ctrl/⌘+Shift+A).`; }
        if (verb === 'help') return 'Your asset library (Ctrl/⌘+Shift+A): textures, HDRIs, 3D models, fonts, sounds, LUTs, shaders and presets from your watched folders, app downloads, renders and captures, plus free CC0 Poly Haven and ambientCG assets. Files stay where they are (Import makes a copy). Drag a card onto the Lab (a texture becomes a picture layer or a shader input, an HDRI the sky, a model a model layer, a font a text layer, a sound the song, a LUT the grade), onto the board, a chat or the sequence; right-click: Use in…, tags, favorite, project.';
        if (verb === 'find') { const found = A.remember(A.search(restText)); return found.length ? list(found.slice(0, 12), Math.max(0, found.length - 12)) : `Nothing for “${restText}”.`; }
        if (verb === 'use') {
          const { ref, target } = split(restText);
          const it = A.find(ref);
          if (!it) return `No asset “${ref}” (/assets find <words>).`;
          return A.use(it, target || null, { agentId: ctx.agentId, ctx: { chatId: ctx.chatId } });
        }
        if (verb === 'free') {
          const w = rest.slice(); let source = 'polyhaven'; let type = null;
          for (let i = w.length - 1; i >= 0; i -= 1) { const x = w[i].toLowerCase(); if (x === 'ambientcg' || x === 'acg') { source = 'ambientcg'; w.splice(i, 1); } else if (x === 'polyhaven' || x === 'poly') { w.splice(i, 1); } else if (/^(hdris?|skies|sky)$/.test(x)) { type = 'hdris'; w.splice(i, 1); } else if (/^textures?$/.test(x)) { type = 'textures'; w.splice(i, 1); } else if (/^models?$/.test(x)) { type = 'models'; w.splice(i, 1); } else if (/^materials?$/.test(x)) { type = 'materials'; source = 'ambientcg'; w.splice(i, 1); } }
          if (source === 'ambientcg' && type === 'textures') type = 'materials';
          if (source === 'polyhaven' && type === 'materials') type = 'textures';
          const q = w.join(' ');
          if (human) { await AssetsUI.open({ tab: 'free', q }); AssetsFree.view(AssetsUI.el.querySelector('.as-body'), { q, source, type }); }
          const r = await AssetsFree.search(q, { source, type });
          return r.length ? `${AssetsFree.SRC[source].name} (CC0), ${r.length} found:\n${r.slice(0, 8).map((x, i) => `${i + 1}. ${C.KINDS[x.kind]?.icon || ''} ${x.name} · \`${x.id}\``).join('\n')}\n/assets get ${source} <id> [1k|2k|4k] [use]` : `Nothing for “${q}” on ${AssetsFree.SRC[source].name}.`;
        }
        if (verb === 'get') {
          const w = rest.slice();
          const source = /^(ambientcg|acg)$/i.test(w[0] || '') ? (w.shift(), 'ambientcg') : /^(polyhaven|poly)$/i.test(w[0] || '') ? (w.shift(), 'polyhaven') : 'polyhaven';
          const useNow = w.some((x) => /^use$/i.test(x));
          const size = w.find((x) => /^\d+k$/i.test(x)) || null;
          const id = w.find((x) => !/^use$/i.test(x) && !/^\d+k$/i.test(x));
          if (!id) return 'Which one? /assets free <words> lists their ids.';
          const tst = toast(`⤓ ${id} from ${AssetsFree.SRC[source].name}…`, { timeout: 0 });
          let it;
          try { it = await AssetsFree.get({ source, id, size }); } finally { tst?.remove?.(); }
          A.remember([it]);
          const used = useNow ? await A.use(it, null, { agentId: ctx.agentId, ctx: { chatId: ctx.chatId } }) : '';
          return `⤓ ${it.n} is in your assets (${C.KINDS[it.k]?.one}, CC0)${used ? `\n${used}` : ' · /assets use #1'}`;
        }
        if (verb === 'add') { const one = restText.replace(/^["']|["']$/g, ''); const ps = (await window.hub.fs.stat(one).catch(() => null)) ? [one] : restText.split(/\s+(?=\/|[A-Za-z]:\\)/).map((p) => p.replace(/^["']|["']$/g, '')); const items = await A.add(ps, { src: 'file' }); A.remember(items); return items.length ? `🗂 Added:\n${list(items)}` : 'Nothing added (an absolute path to an asset file, or a folder: it is watched).'; }
        if (verb === 'watch') { if (!restText) { const p = await window.hub.pickFolder(null, 'A folder of assets to watch'); if (!p) return null; const f = await A.watch(p); return `🗂 Watching ${f.p} (${f.n} files).`; } const f = await A.watch(restText.replace(/^["']|["']$/g, '')); return `🗂 Watching ${f.p} (${f.n} files).`; }
        if (verb === 'unwatch') { const f = await A.unwatch(restText, { forgetItems: true }); return f ? `Stopped watching ${f.p}.` : `Not a watched folder: ${restText}`; }
        if (verb === 'folders') return A.folders().length ? A.folders().map((f, i) => `${i + 1}. ${f.p} · ${f.n} files${f.at ? ` · scanned ${timeAgo(f.at)}` : ''}`).join('\n') : 'No watched folders yet: /assets watch <folder> (or ＋ › Watch a folder… in the library).';
        if (verb === 'scan') { const r = await A.scan({ force: true }); return `🗂 ${r.folders} folder${r.folders === 1 ? '' : 's'} scanned: ${r.added} new, ${r.removed} gone.`; }
        if (verb === 'dupes') { const d = A.remember(A.all().filter((x) => x.alt?.length)); return d.length ? d.slice(0, 12).map((it, i) => `${C.line(it, i)}\n   ${[it.p, ...it.alt].join('\n   ')}`).join('\n') : 'No duplicates: every file is in the library once.'; }
        if (verb === 'preset') { const it = await A.savePreset(restText || null, { chatId: ctx.chatId }); A.remember([it]); return `🎚 ${it.n} is a preset in your assets (/assets use #1 puts it on the selected layer).`; }
        if (verb === 'stats') { const c = C.counts(A.db); const i = await window.hub.assets.cacheInfo(); return `🗂 ${c.all} assets: ${C.ORDER.filter((k) => c[k]).map((k) => `${c[k]} ${C.KINDS[k].label.toLowerCase()}`).join(', ') || 'none yet'}; ${c.fav} favorites, ${c.dupes} with duplicates, ${c.gone} gone · ${A.folders().length} watched folders · index ≈ ${C.size(JSON.stringify(A.db).length)} · thumbnails ${i.files} (${C.size(i.bytes)}).`; }
        if (verb === 'thumbs') { if (!/clear/i.test(restText)) return '/assets thumbs clear'; const n = await window.hub.assets.clearThumbs(); for (const it of A.all()) if (it.t === 1) it.t = 0; A.changed('edit'); return `Cleared ${n} cached pictures (remade when you scroll past them).`; }
        // verbs on one item
        const parts = rest.slice();
        let it = null; let tail = '';
        if (verb === 'tag') { const r0 = parts.shift(); it = A.find(r0); tail = parts.join(' '); } else it = A.find(restText);
        if (!it) return `No asset “${verb === 'tag' ? rest[0] || '' : restText}” (/assets find <words>, then #n).`;
        if (verb === 'tag') { if (!tail) return `${it.n}: #${(it.tg || []).join(' #') || '(no tags)'}`; if (/[+-]/.test(tail[0])) C.tagEdit(it, tail); else C.setTags(it, tail, 'add'); A.changed('edit', { items: [it] }); return `${it.n}: #${it.tg.join(' #')}`; }
        if (verb === 'fav') { const on = C.toggleFav(it); A.changed('edit', { items: [it] }); return on ? `★ ${it.n}` : `${it.n} is no longer a favorite.`; }
        if (verb === 'import') { const p = await A.importCopy(it); return `${it.n} is copied into Hearth: ${p}`; }
        if (verb === 'forget') { C.forget(A.db, it.h); A.changed('forget', { items: [it] }); return `${it.n} left the library (the file stays).`; }
        return null;
      },
    });
  }

  addEventListener('DOMContentLoaded', () => { if (!Commands.get('assets')) register(); });
  if (document.readyState !== 'loading') register();
  try {
    AppUI.addAction?.('Assets: the asset library', () => AssetsUI.open(), 'Ctrl+Shift+A');
    AppUI.addAction?.('Assets: free textures, HDRIs and models (Poly Haven, ambientCG)', () => AssetsUI.open({ tab: 'free' }));
    AppUI.addAction?.('Assets: watch a folder…', () => window.hub.pickFolder(null, 'A folder of assets to watch').then((p) => p && A.watch(p).then((f) => toast(`🗂 Watching ${f.p} (${f.n} files)`, { timeout: 2400 }))).catch(fail));
    AppUI.addAction?.('Assets: rescan the watched folders', () => A.scan({ force: true }).then((r) => toast(`🗂 ${r.added} new, ${r.removed} gone`, { timeout: 2000 })).catch(fail));
    AppUI.addAction?.('Assets: save the selected layer\'s sliders as a preset', () => A.savePreset().then((it) => toast(`🎚 ${it.n} is in your assets`, { timeout: 2400 })).catch(fail));
  } catch { /* the palette is optional */ }
  Keys.add([
    { area: 'Assets', keys: 'Ctrl+Shift+A', what: 'The asset library (textures, HDRIs, models, fonts, sounds, LUTs…)', run: () => AssetsUI.toggle() },
    { area: 'Assets', keys: 'Double-click / Enter', what: 'Use the asset in the Lab (by kind: picture, sky, model, text, song, grade…)' },
    { area: 'Assets', keys: 'Drag a card', what: 'Onto the Lab preview, the board, a chat or the sequence' },
    { area: 'Assets', keys: 'Shift+drop on the Lab', what: 'The other use: replace the model, a shader input, a sky layer, a sound in the sequence' },
    { area: 'Assets', keys: 'F · T · Delete', what: 'In the library: favorite · tags · remove from the library (the file stays)' },
    { area: 'Assets', keys: 'Right-click a card', what: 'Use in…, favorite, tags, rename, project, reveal, import a copy, duplicates' },
  ]);
  // Ctrl/⌘+Shift+A (the Lab's own Shift+A recalls a slider slot: without Ctrl it stays the Lab's)
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey || e.code !== 'KeyA' || e.defaultPrevented) return;
    e.preventDefault();
    AssetsUI.toggle();
  });
  wire();

  return { previewItem, attachItems, catchUp, register, zoneOf, dragging: (it) => { dragged = it; } };
})();
window.AssetsHooks = AssetsHooks;
