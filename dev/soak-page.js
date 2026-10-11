// The page side of dev/soak.js: one cycle of a realistic long session, driven with real input through journey-lib's
// J (CDP mouse / keyboard / wheel), the way the owner works for hours. Kept to a steady state on purpose (chats,
// board items, model layers, renders are added AND removed), so anything that still grows is a leak, not data.
//   Soak.setup({ cloud, song, clip, glbDir })   test scenes, a sequence, sync on the fake cloud, the test app page
//   Soak.cycle(i)                                one round of everything (≈ 40–70 s)
//   Soak.pause() / resume()                      the harness samples between cycles; frames() measures a scroll
//   Soak.stats()                                 counters from the page (attached nodes, maps, probe)
//   Soak.snapshot() / compare(a, b)              what Freshen must keep (chats, drafts, Lab scene, scroll)
window.Soak = (() => {
  const { wait, until, click, key, type, mouse, visible } = J;
  const st = { o: null, cycle: 0, acts: {}, errs: {}, scenes: [], seqKey: null, soakChats: [], boardItems: [], appsOpen: 0, paused: false, renders: 0 };
  const rnd = (n) => Math.floor(Math.random() * n);
  const OLD = 40;
  const pick = (a) => a[rnd(a.length)];
  const claude = () => H.claudeAgent();
  const astra = () => Native.astraAgent?.() || H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
  const say = async (line, agentId = claude().id) => { let text = ''; await Commands.tryRun(line, agentId, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); }, error: (e) => { text = `error: ${e}`; } }); return text; };
  async function act(name, fn) {
    const t = performance.now();
    try { await fn(); } catch (err) { (st.errs[name] ||= []).push(String(err?.message || err).slice(0, 160)); if (st.errs[name].length > 5) st.errs[name].shift(); }
    const a = st.acts[name] ||= { n: 0, ms: 0 }; a.n++; a.ms += performance.now() - t;
    await escape();
  }
  async function escape() { if (document.querySelector('#menu:not([hidden]), .palette, dialog[open]')) { await key('Escape'); await wait(150); } hideMenu?.(); document.querySelectorAll('dialog[open]').forEach((d) => d.close()); }
  const center = (n) => { const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const wheel = (x, y, dy, extra = {}) => smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy, ...extra } });

  // a GLB: one little mesh with an animation clip (as in dev/checks/lab3d-models.js)
  function glb() {
    const pos = new Float32Array([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0, 0, 0, -0.5]); const idx = new Uint16Array([0, 1, 2, 0, 2, 3, 1, 3, 2, 0, 3, 1]);
    const t = new Float32Array([0, 1]); const tr = new Float32Array([0, 0, 0, 0, 0.5, 0]);
    const parts = [pos, idx, t, tr]; const views = []; let off = 0; const chunks = [];
    for (const p of parts) { const b = new Uint8Array(p.buffer); const pad = (4 - (b.length % 4)) % 4; views.push({ buffer: 0, byteOffset: off, byteLength: b.length }); chunks.push(b, new Uint8Array(pad)); off += b.length + pad; }
    const bin = new Uint8Array(off); let o = 0; for (const c of chunks) { bin.set(c, o); o += c.length; }
    const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'soakbot' }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }], materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.9, 0.5, 0.2, 1] } }],
      buffers: [{ byteLength: off }], bufferViews: views,
      accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-0.5, 0, -0.5], max: [0.5, 1, 0] }, { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' }, { bufferView: 2, componentType: 5126, count: 2, type: 'SCALAR', min: [0], max: [1] }, { bufferView: 3, componentType: 5126, count: 2, type: 'VEC3' }],
      animations: [{ name: 'Bounce', samplers: [{ input: 2, output: 3 }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] }] };
    let js = new TextEncoder().encode(JSON.stringify(json)); const jpad = (4 - (js.length % 4)) % 4; js = new Uint8Array([...js, ...new Array(jpad).fill(0x20)]);
    const total = 12 + 8 + js.length + 8 + bin.length; const u = new Uint8Array(total); const dv = new DataView(u.buffer);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true); dv.setUint32(12, js.length, true); dv.setUint32(16, 0x4e4f534a, true); u.set(js, 20);
    dv.setUint32(20 + js.length, bin.length, true); dv.setUint32(24 + js.length, 0x004e4942, true); u.set(bin, 28 + js.length);
    return u;
  }
  const CANVAS = `const c = document.createElement('canvas'); c.width = 320; c.height = 320; c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d'); function loop(now) { g.fillStyle = 'hsl(' + (now / 20 % 360) + ',70%,50%)'; g.fillRect(0, 0, 320, 320); requestAnimationFrame(loop); } requestAnimationFrame(loop);`;

  async function setup(o) {
    st.o = o;
    activate(claude().id); await wait(500);
    // the Lab: three test scenes (a lit three.js cube, PBR spheres with an environment map, a 2D canvas)
    activate('tool:three'); await ThreeLab.cmd(); await until(() => ThreeLab.scenes && ThreeLab.director, 20000);
    const S = ThreeLab.scenes; const T = ThreeData.TEMPLATES;
    const get = (name, code) => S.all().find((x) => x.name === name) || S.create({ name, code });
    st.scenes = [get('Soak cube', T[0].code).id, get('Soak pbr', T[1].code).id, get('Soak canvas', CANVAS).id];
    S.open(st.scenes[0]); await wait(2500);
    // the scene's sequence: the three scenes, 2 s each
    if (!o.again) {
      try { st.seqKey = await ThreeSeq.create('Soak seq', { empty: true, format: '16:9', show: true }); for (const id of st.scenes) await ThreeSeq.add({ sketch: id }, { dur: 2 }); await wait(800); await ThreeSeq.leave(); } catch (err) { (st.errs.setup ||= []).push(`seq: ${err.message}`); }
      await hub.fs.write(`${o.glbDir}/soakbot.glb`, glb());
      // the owner's history: 40 older chats of 80 messages (≈ 200 KB each), opened a few per cycle
      const words = 'the scene glows warmer when the kick lands and the camera drifts slowly through the particles while the palette follows the cover'.split(' ');
      const para = (k) => Array.from({ length: 420 }, (_, j) => words[(j * 7 + k) % words.length]).join(' ');
      for (let i = 0; i < OLD; i++) {
        const messages = Array.from({ length: 80 }, (_, k) => ({ role: k % 2 ? 'assistant' : 'user', at: Date.now() - (i * 864e5) + k * 1000, text: `${k}: ${para(i + k)}` }));
        await hub.saveChat({ id: `soak-old-${i}`, agentId: claude().id, title: `Older chat ${i}`, updatedAt: Date.now() - (i + 1) * 864e5, messages });
      }
      H.chats = await hub.listChats(); Panel.render();
      // sync on the fake cloud folder
      try { await Commands.tryRun(`/sync on ${o.cloud}`, claude().id); await until(() => Sync.status().state === 'synced', 30000); } catch (err) { (st.errs.setup ||= []).push(`sync: ${err.message}`); }
    } else st.seqKey = (ThreeSeq.list?.() || []).find?.((k) => /Soak seq/.test(k)) || 'seq:Soak seq';
    // the test app page (dev/fake-meshy.js serves it)
    const B = (await hub.apps.status()).testBase;
    if (B) Apps.register({ id: 'soakpage', name: 'Soak page', icon: 'S', url: `${B}/web/plain`, desc: 'a fake page', group: 'More' });
    activate(claude().id); await wait(400);
    return { scenes: st.scenes.length, seq: st.seqKey, sync: Sync.status().state, apps: Boolean(B), errs: st.errs };
  }

  // ---------- chats: new, typed, sent, streamed, switched, scrolled; the soak's own chats stay ≤ 6 ----------
  async function chats() {
    const C = claude(); activate(C.id); await wait(300);
    if (st.cycle % 2 === 1 || !H.activeChat[C.id]) { Native.newChat(C.id); await wait(200); }
    const v = Native.view(C.id);
    for (const word of [pick(['long', 'code', 'table', 'think', 'tool']), pick(['hello', 'suggest', 'long'])]) {
      await click(v.input); await type(`${word} soak ${st.cycle}`); await key('Enter');
      await wait(400);
      await until(() => !Native.isBusy(H.activeChat[C.id]), 30000);
    }
    const id = H.activeChat[C.id];
    if (id && !st.soakChats.includes(id)) st.soakChats.push(id);
    // a draft left in the composer (Freshen keeps it)
    await click(v.input); await type(`draft ${st.cycle}`);
    // scroll the conversation with the wheel
    const [x, y] = center(v.list);
    for (let i = 0; i < 6; i++) { await wheel(x, y, i < 3 ? -400 : 400); await wait(60); }
    // switch between chats in the chats list (real clicks)
    const rows = [...document.querySelectorAll('#chat-groups .item[data-key]')].filter((r) => visible(r) && r.dataset.key !== '__draft');
    for (let i = 0; i < Math.min(4, rows.length); i++) { const r = pick(rows); if (r.isConnected && visible(r)) { await click(r); await wait(350); } }
    // older chats from the history, four per cycle (all forty come back in turn)
    for (let k = 0; k < 4; k++) { const id = `soak-old-${(st.cycle * 4 + k) % OLD}`; if (H.chats.some((c) => c.id === id)) { await Native.open(C.id, id); await wait(400); const [ox, oy] = center(v.list); await wheel(ox, oy, -600); await wait(80); } }
    if (id) { await Native.open(C.id, id); await wait(300); }
    // the chats list scrolled
    const g = document.getElementById('chat-groups');
    if (visible(g)) { const [gx, gy] = center(g); await wheel(gx, gy, 300); await wait(80); await wheel(gx, gy, -300); }
    // Astra, now and then
    const A = astra();
    if (A && st.cycle % 3 === 0) {
      activate(A.id); await wait(300);
      const va = Native.view(A.id);
      if (va) { await click(va.input); await type(`hello soak ${st.cycle}`); await key('Enter'); await wait(400); await until(() => !Native.isBusy(H.activeChat[A.id]), 30000); }
      activate(C.id); await wait(200);
    }
    // keep a steady state: the oldest soak chats go to the trash
    while (st.soakChats.length > 6) { const old = st.soakChats.shift(); if (H.chats.some((c) => c.id === old) && old !== H.activeChat[C.id]) await Native.remove(old); }
    document.querySelectorAll('.toast').forEach((t) => t.remove?.());
  }

  // ---------- the chat's menus: message right-click, chat ⋯, the palette ----------
  async function menus() {
    const C = claude(); activate(C.id); await wait(200);
    const v = Native.view(C.id);
    const msg = [...v.list.querySelectorAll('.msg.assistant .body')].filter(visible).pop();
    if (msg) { await click(msg, { right: true }); await wait(250); const sub = [...document.querySelectorAll('#menu .item, #menu button')].find((b) => visible(b) && /More|Copy as|Share/.test(b.textContent)); if (sub) { await click(sub); await wait(200); } await key('Escape'); }
    const more = [...v.root.querySelectorAll('button')].find((b) => b.textContent.trim() === '⋯' && visible(b));
    if (more) { await click(more); await wait(250); await key('Escape'); }
    // the palette: Ctrl+K, a search, Escape
    await key('k', { ctrl: true }); await wait(250); await type(pick(['lab', 'board', 'sync', 'theme', 'render'])); await wait(300); await key('Escape'); await wait(150);
    // the "/" menu in the composer
    await click(v.input); await key('Backspace'); await type('/'); await wait(250); await type('he'); await wait(200); await key('Escape');
    for (let i = 0; i < 3; i++) await key('Backspace');
  }

  // ---------- the Lab: scene switches, sliders, sequence playback, a 3D model layer ----------
  async function lab() {
    activate('tool:three'); await ThreeLab.cmd(); await wait(400);
    const S = ThreeLab.scenes;
    for (let i = 0; i < 3; i++) { S.open(st.scenes[(st.cycle + i) % st.scenes.length]); await wait(1800); }
    // sliders: shuffle (R on the preview) and the Save the owner presses all the time
    const pic = [...document.querySelectorAll('.three-preview')].find(visible);
    if (pic) { await click(pic, { at: [0.5, 0.6] }); await key('r'); await wait(500); await say('/shuffle subtle'); await wait(400); }
    // the sequence: open, play 3 s, stop, back to the scene
    if (st.seqKey) {
      await ThreeSeq.open(st.seqKey, { show: true }); await wait(800);
      ThreeSeq.play(true); await wait(3000); ThreeSeq.play(false); await wait(300);
      await ThreeSeq.leave(); await wait(800);
    }
    // a 3D model layer, every other cycle: added, looked at, removed
    if (st.cycle % 2 === 0) {
      S.open(st.scenes[0]); await wait(1500);
      await say(`/model add ${st.o.glbDir}/soakbot.glb`);
      await wait(2500);
      await say('/model material chrome'); await wait(600);
      try { await ThreeLab.director.removeLayer('🧊 soakbot'); } catch { /* not there */ }
      await wait(800);
    }
  }

  // ---------- the board: wheel zoom, middle-button pan, items added and removed ----------
  async function board() {
    activate('tool:board'); await until(() => Board.isMounted() && Board.current(), 15000);
    const vp = document.querySelector('.bd-vp'); if (!vp) return;
    const [x, y] = center(vp);
    for (let i = 0; i < 5; i++) { await wheel(x + rnd(200) - 100, y + rnd(200) - 100, i % 2 ? 240 : -240, { modifiers: 2 }); await wait(60); }
    await mouse('mouseMoved', x, y, { button: 'none' });
    await mouse('mousePressed', x, y, { button: 'middle' });
    for (let i = 1; i <= 8; i++) await mouse('mouseMoved', x + i * 20, y + i * 10, { button: 'middle', buttons: 4 });
    await mouse('mouseReleased', x + 160, y + 80, { button: 'middle' });
    for (let i = 0; i < 4; i++) { await wheel(x, y, i % 2 ? 300 : -300); await wait(60); }
    const n = await Board.addNote(`soak note ${st.cycle}`); if (n?.id) st.boardItems.push(n.id);
    const s = Board.addSwatch?.('#ff5a1f'); if (s?.id) st.boardItems.push(s.id);
    await wait(500);
    // right-click an item
    const node = [...vp.querySelectorAll('.bd-item')].filter(visible).pop();
    if (node) { await click(node, { right: true }); await wait(250); await key('Escape'); }
    if (st.boardItems.length > 6) { Board.removeItems(st.boardItems.splice(0, st.boardItems.length - 6)); await wait(300); }
    Board.zoomFit?.(); await wait(400);
  }

  // ---------- app windows: opened, hidden, sometimes closed for good ----------
  async function apps() {
    if (!Apps.get('soakpage')) return;
    await Apps.open('soakpage'); await wait(1500);
    await hub.apps.close('soakpage', st.cycle % 3 === 0 ? { destroy: true } : {});
    await wait(300);
    window.focus();
  }

  // ---------- the Commands page: search, hover previews, back ----------
  async function commandsPage() {
    const btn = document.querySelector('#agent-buttons .agent-btn[data-id="tool:commands"]');
    if (btn && visible(btn)) await click(btn); else activate('tool:commands');
    await until(() => CmdPage.isOpen() && document.querySelectorAll('.cp-row').length > 50, 10000);
    const search = document.querySelector('.cp-search');
    if (search) { await click(search); await type(pick(['vertical', 'record', 'theme', 'sync', 'model'])); await wait(400); }
    const rows = [...document.querySelectorAll('.cp-row[data-name]')].filter(visible).slice(0, 8);
    for (const r of rows.slice(0, 4)) { const [x, y] = center(r); await mouse('mouseMoved', x, y, { button: 'none' }); await wait(350); }
    if (search) { search.select(); await key('Backspace'); }
    const list = document.querySelector('.cp-list, .cp-rows') || rows[0]?.parentElement;
    if (list) { const [x, y] = center(list); await wheel(x, y, 800); await wait(100); await wheel(x, y, -800); }
    activate(claude().id); await wait(300);
  }

  // ---------- renders: a tracked job (like a sequence render) and a small real transcode ----------
  async function renders() {
    const t = Renders.track({ kind: 'seq', title: `Soak render ${st.cycle}`, pk: `soak-${st.cycle}`, cancel: () => {} });
    for (let p = 10; p <= 100; p += 30) { t.progress(p, `${p}%`); await wait(120); }
    t.done(`/tmp/soak-${st.cycle}.mp4`);
    if (st.o.clip && st.cycle % 3 === 0) {
      const j = Renders.enqueue({ input: st.o.clip, preset: 'square', opts: { quality: 'draft' } });
      if (j?.id) await until(() => !['queued', 'running'].includes(Renders.get(j.id)?.status), 30000);
      st.renders++;
    }
    if (st.cycle % 4 === 0) Renders.panel?.(); await wait(300); Renders.close?.();
  }

  // ---------- sync: a pass, and the "other computer" changing a chat now and then ----------
  async function sync() {
    if (typeof Sync === 'undefined' || !Sync.status().on) return;
    if (st.cycle % 2 === 0) {
      const chat = { id: 'soak-other', agentId: claude().id, title: 'From the other computer', updatedAt: Date.now(), messages: [{ role: 'user', at: Date.now(), text: `hello ${st.cycle}` }] };
      await hub.fs.write(`${st.o.cloud}/Hearth/files/chats/soak-other.json`, JSON.stringify(chat));
    }
    await Sync.now(); await wait(500);
  }

  async function cycle(i) {
    st.cycle = i;
    await act('chats', chats);
    await act('menus', menus);
    await act('lab', lab);
    await act('board', board);
    await act('apps', apps);
    await act('commands', commandsPage);
    await act('renders', renders);
    await act('sync', sync);
    activate(claude().id); await wait(300);
    return { cycle: i, errs: Object.keys(st.errs).length };
  }

  // the harness samples between cycles: nothing of ours runs meanwhile
  // (the same state at every sample: the Lab on its first scene behind the chat, so samples compare like with like)
  const pause = async () => {
    st.paused = true;
    try { if (st.scenes[0] && typeof ThreeLab !== 'undefined' && ThreeLab.scenes?.currentId?.() !== st.scenes[0]) { ThreeLab.scenes.open(st.scenes[0]); await wait(1500); } } catch { /* not loaded */ }
    activate(claude().id); await wait(200);
  };
  const resume = () => { st.paused = false; };
  // frame time while the chat scrolls (rAF intervals, ms): p50 / p95 / max
  async function frames() {
    const v = Native.view(claude().id); if (!v) return null;
    const [x, y] = center(v.list);
    const d = []; let last = 0; let on = true;
    const tick = (t) => { if (last) d.push(t - last); last = t; if (on) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    for (let i = 0; i < 16; i++) { await wheel(x, y, i % 8 < 4 ? -240 : 240); await wait(110); }
    on = false; await wait(50);
    d.sort((a, b) => a - b);
    const q = (p) => Math.round((d[Math.min(d.length - 1, Math.floor(p * d.length))] || 0) * 10) / 10;
    return { n: d.length, p50: q(0.5), p95: q(0.95), max: q(1) };
  }
  function stats() {
    return {
      attached: (() => { let n = 1; const w = document.createTreeWalker(document, NodeFilter.SHOW_ALL); while (w.nextNode()) n++; return n; })(),
      chats: H.chats.length, boardItems: Board.items?.().length, toasts: document.querySelectorAll('.toast').length,
      probe: window.__soakProbe?.live(), gl: window.__soakProbe?.gl(), mem: window.Freshen?.status?.(),
    };
  }
  // what Freshen must keep
  async function snapshot() {
    const C = claude(); const v = Native.view(C.id);
    return { chat: H.activeChat[C.id], draft: v?.input?.value || '', scroll: Math.round(v?.list?.scrollTop || 0), scene: ThreeLab.scenes?.currentId?.(), active: H.activeId, chats: H.chats.length, board: Board.items?.().length };
  }
  function compare(a, b) {
    if (!a || !b) return { ok: false, a, b };
    const miss = Object.keys(a).filter((k) => (k === 'scroll' ? Math.abs(a[k] - b[k]) > 40 : a[k] !== b[k]));
    return { ok: !miss.length, miss, a, b };
  }
  const summary = () => ({ acts: Object.fromEntries(Object.entries(st.acts).map(([k, v]) => [k, `${v.n}× ${Math.round(v.ms / v.n)} ms`])), errs: st.errs, renders: st.renders });
  return { setup, cycle, pause, resume, frames, stats, snapshot, compare, summary, st };
})();
