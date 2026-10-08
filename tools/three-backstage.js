// The backstage: where a director chat's scene runs while you look at another chat's scene (chat-scenes.js routes
// the call here). It's a second, hidden Lab sandbox with the same director API shape the Lab gives
// tools/three-director.js (codeOf, updateLayer, report, shot, evalInSketch…), so the director's usual loop works:
// edit code, see errors / console / fps, take screenshots, evaluate code. Edits land in that chat's sketch (saved
// like any edit) and show the next time you open the chat. No music backstage (the demo beat plays) and no
// references; tools that need the scene on screen (sliders, looks, music, timeline, notes, input…) answer with a
// short note. One call at a time; the sandbox only runs while a background director works.
const ThreeBackstage = (() => {
  const LONG = 640; // the backstage frame's long side in px (pictures for the model are ≤ 1280 anyway)
  const WAIT_MAX = 15;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clip = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const PROP_KEYS = ['name', 'visible', 'opacity', 'blend', 'in', 'out', 'fadeIn', 'fadeOut', 'x', 'y', 'scale', 'rotate'];
  const OK_TOOLS = new Set(['three_get_code', 'three_read_code', 'three_search_code', 'three_edit_code', 'three_set_code', 'three_update_layer', 'three_console', 'three_screenshot', 'three_eval', 'three_layers', 'three_add_layer', 'three_remove_layer', 'three_set_frame', 'three_new_sketch', 'three_select_layer', 'three_media_info']);

  let host = null; let box = null;
  let loaded = null; // { id, sig } of what the sandbox runs
  let errors = []; let consoleLines = []; let lastStats = null; let pendingShot = null;
  let started = null; let onStart = null; // resolves when a fresh page draws its first frame (or fails)
  const evals = new Map();
  let chain = Promise.resolve();
  let idleTimer = 0;
  const log = []; // { at, chatId, sketch, tool } the last calls (/scene shows them)

  function onMessage(m) {
    if ((m.type === 'stats' || m.type === 'error') && onStart) { const fn = onStart; onStart = null; fn(); }
    if (m.type === 'error') errors.push({ layer: m.layer || null, message: String(m.message || ''), line: m.line || null });
    else if (m.type === 'console') { consoleLines.push({ level: m.level, text: clip(m.text, 500), layer: m.layer || null }); if (consoleLines.length > 60) consoleLines.splice(0, consoleLines.length - 60); }
    else if (m.type === 'stats') lastStats = { fps: m.fps, worstFrameMs: m.worst, renderMs: m.ms, drawCalls: m.calls, triangles: m.triangles, points: m.points, lines: m.lines, textures: m.textures };
    else if (m.type === 'shot' && pendingShot) { const fn = pendingShot; pendingShot = null; fn(m.dataUrl); }
    else if ((m.type === 'eval-result' || m.type === 'input-result') && evals.has(m.id)) { evals.get(m.id)(m); evals.delete(m.id); }
  }
  function frameOf(id) {
    const f = ThreeLab.scenes?.frameOf(id) || 'fit';
    const z = ThreeMedia.SIZES.find((x) => x.id === f && x.w);
    return z ? { id: z.id, width: z.w, height: z.h } : { id: 'fit', width: 1280, height: 720 };
  }
  function ensureBox() {
    if (box) return;
    // behind the app (not off screen: a cross-origin frame outside the viewport stops drawing)
    host = el('div', { class: 'lab-backstage', attrs: { 'aria-hidden': 'true' } });
    document.body.append(host);
    box = ThreeLab._sandbox(host, onMessage, () => '&dpr=1');
  }
  // Nothing backstage for a minute: the page goes blank (no GPU or CPU while nothing works in the background).
  function sleepSoon() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (box) { box.frame.src = 'about:blank'; loaded = null; } }, 60000);
  }

  const sketchOf = (id) => { const s = ThreeLab.scenes?.get(id); if (!s) throw new Error('This chat\'s sketch is gone (deleted?). Ask the owner, or make one with three_new_sketch.'); return s; };
  const layersOf = (s) => ThreeLab.scenes.layersOf(s);
  const sigOf = (s) => JSON.stringify(layersOf(s).map((L) => [L.id, L.code, L.visible, L.opacity, L.blend, L.x, L.y, L.scale, L.rotate]));

  // (Re)runs the sketch from scratch: a fresh page, every layer bottom first.
  async function load(s, { force = false } = {}) {
    ensureBox();
    clearTimeout(idleTimer);
    const sig = sigOf(s);
    if (!force && loaded?.id === s.id && loaded.sig === sig && box.ready) return false;
    const f = frameOf(s.id);
    const k = LONG / Math.max(f.width, f.height);
    host.style.width = `${Math.round(f.width * k)}px`;
    host.style.height = `${Math.round(f.height * k)}px`;
    errors = []; consoleLines = []; lastStats = null;
    started = new Promise((r) => { onStart = r; setTimeout(r, 9000); });
    box.reload();
    box.send({ type: 'tweak-init', values: {}, keys: {}, mods: {} });
    box.send({ type: 'run-layers', layers: layersOf(s).map((L, z) => ({ id: L.id, code: L.code, z, slot: L.slot ?? z, name: L.name, visible: L.visible !== false, opacity: L.opacity ?? 1, blend: L.blend || 'normal', x: L.x || 0, y: L.y || 0, scale: L.scale ?? 1, rotate: L.rotate || 0, overrides: L.overrides || null })) });
    loaded = { id: s.id, sig };
    return true;
  }
  // a fresh page takes a moment to load three.js: wait for its first frame, then a little for the change to show
  const settle = async (wait) => { await started; await sleep(Math.min(WAIT_MAX, Math.max(0.3, Number(wait) || 2.5)) * 500); };

  // ---------- the director API, for one sketch ----------
  // quiet: data only, nothing runs (an undo of a background chat's edit)
  function director(sketchId, route, { quiet = false } = {}) {
    const s = () => sketchOf(sketchId);
    const selId = () => { const Ls = layersOf(s()); const want = ThreeLab.scenes.selectedOf(sketchId); return (Ls.find((L) => L.id === want) || Ls.at(-1)).id; };
    function findLayer(ref) {
      const Ls = layersOf(s());
      if (ref == null || ref === '' || ref === 'selected') return Ls.find((L) => L.id === selId());
      if (ref === 'top') return Ls.at(-1);
      if (ref === 'bottom') return Ls[0];
      if (typeof ref === 'number' || /^\d+$/.test(String(ref))) return Ls[Number(ref) - 1];
      const r = String(ref).toLowerCase();
      return Ls.find((L) => L.id === ref) || Ls.find((L) => L.name.toLowerCase() === r) || Ls.find((L) => L.name.toLowerCase().includes(r));
    }
    const must = (ref) => { const L = findLayer(ref); if (!L) throw new Error(`No layer "${ref}". Layers: ${layersOf(s()).map((x) => x.name).join(', ')}`); return L; };
    const layerName = (id) => layersOf(s()).find((L) => L.id === id)?.name;
    const summary = () => layersOf(s()).map((L, i, all) => ({ id: L.id, name: L.name, ...(ThreeLayers.isFilter(L.code) ? { kind: 'filter (changes the layers below it)' } : {}), order: `${i + 1} of ${all.length} (1 = bottom)`, selected: L.id === selId(), visible: L.visible !== false, opacity: L.opacity ?? 1, blend: L.blend || 'normal' }));
    const NOTE = `Backstage: this chat's scene "${s().name}" isn't on screen (the owner is looking at another chat), so it runs hidden, without music (demo beat) or references. Your edits are saved to it and show when the owner opens this chat.`;
    const report = () => ({
      sketch: s().name,
      layer: layerName(selId()),
      layers: summary(),
      errors: errors.map((e) => ({ layer: layerName(e.layer), message: e.message, line: e.line || undefined })),
      console: consoleLines.slice(-30).map((l) => `${l.layer && layersOf(s()).length > 1 ? `[${layerName(l.layer) || l.layer}] ` : ''}${l.level === 'log' ? '' : `[${l.level}] `}${l.text}`),
      stats: lastStats || 'no frames rendered yet (nothing calls renderer.render, or it failed)',
      frame: frameOf(sketchId),
      sliders: 'backstage: sliders show when the owner opens this chat',
      music: 'none backstage (demo 120 bpm beat)',
      note: NOTE,
    });
    const changed = () => ThreeLab.scenes.changed(sketchId);
    const d = {
      backstage: true,
      codeOf(ref = null) { const L = must(ref); const x = s(); return { id: L.id, name: L.name, sketchId: x.id, sketch: x.name, code: L.code }; },
      getCode() { const L = must(null); return { sketch: s().name, layer: L.name, layers: summary(), frame: frameOf(sketchId), lines: L.code.split('\n').length, ...ThreeLab._util.codeOrOutline(L.code), note: NOTE }; },
      layers: () => ({ sketch: s().name, selected: layerName(selId()), layers: summary(), note: NOTE }),
      report,
      async updateLayer(ref, patch = {}, wait = 1.5) {
        const L = must(ref);
        for (const [k, v] of Object.entries(patch)) if (PROP_KEYS.includes(k)) L[k] = v;
        if (patch.code != null) L.code = String(patch.code);
        if (patch.order != null) {
          const Ls = layersOf(s());
          const rest = Ls.filter((x) => x !== L);
          const to = patch.order === 'top' ? rest.length : patch.order === 'bottom' ? 0 : Math.max(0, Math.min(rest.length, Number(patch.order) - 1));
          rest.splice(to, 0, L);
          Ls.splice(0, Ls.length, ...rest);
        }
        changed();
        if (quiet) return { updated: L.name, sketch: s().name };
        await load(s());
        await settle(wait);
        return { updated: L.name, ...report() };
      },
      async setCode(code, wait = 2.5) { return d.updateLayer(null, { code }, wait); },
      async addLayer({ name, code, template, props = {} }, wait = 2.5) {
        const Ls = layersOf(s());
        const t = code == null ? ([...ThreeLayers.TEMPLATES, ...ThreeLayers.FILTERS].find((x) => x.id === template) || ThreeLayers.TEMPLATES[0]) : null;
        const slot = Math.max(-1, ...Ls.map((L) => L.slot || 0)) + 1;
        let nm = name || t?.name || 'Layer'; let n = 2;
        while (Ls.some((L) => L.name === nm)) { nm = `${name || t?.name || 'Layer'} ${n}`; n += 1; }
        const L = ThreeLayers.defaults({ color: ThreeLayers.COLORS[slot % ThreeLayers.COLORS.length], slot, ...Object.fromEntries(Object.entries(props).filter(([k]) => PROP_KEYS.includes(k))), name: nm, code: code ?? t.code });
        Ls.push(L);
        changed();
        await load(s());
        await settle(wait);
        return { added: L.name, ...report() };
      },
      async removeLayer(ref) {
        const L = must(ref);
        const Ls = layersOf(s());
        if (Ls.length < 2) throw new Error('A sketch keeps at least one layer.');
        Ls.splice(Ls.indexOf(L), 1);
        changed();
        await load(s());
        await settle(1);
        return { removed: L.name, ...report() };
      },
      selectLayer(ref) { const L = must(ref); return { selected: L.name, note: 'Backstage: the selection is only for your next calls (the owner\'s selected layer stays).', ...d.getCode() }; },
      sliders() { throw new Error('Sliders need the scene on screen. Change the values in the code with three_edit_code instead, or ask the owner to open this chat.'); },
      evalInSketch: (code) => new Promise((resolve) => {
        const id = `b${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
        evals.set(id, (m) => resolve(m.ok ? { ok: true, value: m.value } : { ok: false, error: m.error }));
        box.send({ type: 'eval', code, id });
        setTimeout(() => { if (evals.delete(id)) resolve({ ok: false, error: 'The sketch did not answer (is it running?)' }); }, 6000);
      }),
      shot: () => new Promise((resolve) => {
        const prev = pendingShot;
        const mine = (url) => { prev?.(url); resolve(url); };
        pendingShot = mine;
        box.send({ type: 'screenshot', tag: 'get' });
        setTimeout(() => { if (pendingShot === mine) { pendingShot = null; mine(null); } }, 5000);
      }),
      media: { loaded: false, info: () => ({ loaded: false, note: 'no music backstage' }), seek() {}, toggle() {}, setLoop: () => false },
      timeline() { throw new Error('The timeline needs the scene on screen.'); },
      openSketch() {},
      route,
    };
    return d;
  }

  // ---------- calls ----------
  async function run(tool, args, route) {
    const x = sketchOf(route.sketchId);
    const d = director(route.sketchId, route);
    if (!OK_TOOLS.has(tool)) {
      return { ok: false, error: `${tool.replace(/^three_/, '')} needs this chat's scene on screen, and the owner is looking at another chat right now. Your scene "${x.name}" runs backstage: three_edit_code / set_code / update_layer / add_layer, three_screenshot, three_eval and three_console work here. Tell the owner what's left, or carry on with those.` };
    }
    if (tool === 'three_new_sketch') {
      const s = ThreeLab.scenes.create({ name: String(args.name || 'Untitled'), code: String(args.code || ''), frame: ThreeLab.scenes.frameOf(route.sketchId) });
      route.sketchId = s.id;
      await load(s, { force: true });
      await settle(args.wait);
      return { ok: true, newSketchId: s.id, value: { ...director(s.id, route).report(), made: s.name } };
    }
    if (tool === 'three_set_frame') {
      if (!ThreeMedia.SIZES.some((z) => z.id === args.size)) return { ok: false, error: `size must be one of ${ThreeMedia.SIZES.map((z) => z.id).join(', ')}` };
      ThreeLab.scenes.setFrame(route.sketchId, args.size);
      await load(x, { force: true });
      await settle(1.2);
      return { ok: true, value: d.report() };
    }
    if (tool === 'three_media_info') return { ok: true, value: { loaded: false, note: 'No music backstage: the song plays when the owner opens this chat.', song: ThreeLab.scenes.songOf(route.sketchId)?.split(/[\\/]/).pop() || 'none linked' } };
    if (await load(x)) await settle(1.2); // a fresh page: let it start before reading it
    if (typeof ThreeDirector !== 'undefined') { const r = await ThreeDirector.handle(tool, args, d); if (r) return r; }
    if (tool === 'three_layers') return { ok: true, value: d.layers() };
    if (tool === 'three_get_code') return { ok: true, value: d.getCode() };
    if (tool === 'three_add_layer') return { ok: true, value: await d.addLayer({ name: args.name, code: args.code, template: args.template, props: args.settings || {} }, args.wait) };
    if (tool === 'three_remove_layer') return { ok: true, value: await d.removeLayer(args.layer) };
    if (tool === 'three_select_layer') return { ok: true, value: d.selectLayer(args.layer) };
    if (tool === 'three_eval') { const r = await d.evalInSketch(String(args.code || '')); return r.ok ? { ok: true, value: r.value } : r; }
    if (tool === 'three_console') return { ok: true, value: d.report() };
    if (tool === 'three_screenshot') {
      const url = await d.shot();
      return url ? { ok: true, images: [{ data: url.split(',')[1], mime: 'image/png' }], value: `Screenshot of "${x.name}" (backstage).` } : { ok: false, error: 'No image: the sketch is not rendering (check three_console).' };
    }
    return { ok: false, error: `Unknown tool ${tool}` };
  }
  // One at a time: two background chats take turns with the sandbox.
  function handle(tool, args, route) {
    const p = chain.then(async () => {
      log.push({ at: Date.now(), chatId: route.chatId, sketch: route.sketchId, tool });
      if (log.length > 30) log.shift();
      try { return await run(tool, args || {}, route); } catch (err) { return { ok: false, error: err.message }; } finally { sleepSoon(); }
    });
    chain = p.catch(() => {});
    return p;
  }

  return { handle, dataDirector: (sketchId) => director(sketchId, null, { quiet: true }), log: () => log.slice(), get running() { return loaded?.id || null; }, OK_TOOLS };
})();
