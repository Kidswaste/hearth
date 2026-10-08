// Per-chat scenes: every docked director chat owns its own scene, so switching chats switches the scene and it's
// always clear which chat (and which agent) works on what.
//   - Three Director: each chat owns a Lab sketch (layers, sliders, look, song link, frame size live in the sketch).
//     Switching chats in the panel or the dock opens that chat's sketch (the one you leave is saved first). "New
//     chat" opens a calm starter in the chat's color, named after the chat when you send the first message (and
//     renamed when the chat gets a title). Older chats link lazily: the sketch on screen becomes theirs the first
//     time you use them (a copy when it already belongs to another chat), so nothing is migrated or lost.
//   - Identity: each chat gets a color + glyph (a stable hash of its id, from the Forgeheart palette), shown on its
//     row, in the dock header, and as a thin frame + corner tag on the Lab preview with the chat's title and the
//     agent working on it (Claude / Astra / both in a jam), glowing while it works. Background chats that are
//     working show a small dot in their color on their row.
//   - Routing: a director's tool calls carry their chat (engines.js HUB_CHAT_ID → mcp/common.js → bridge.js), and
//     tools/three.js sends them to that chat's sketch: the one on screen as before, another chat's backstage
//     (tools/three-backstage.js). A chat's director never edits another chat's scene.
//   - Video Director: each chat remembers its video and opens it again when you come back to the chat.
// No settings. Commands for power use: /scene, /scene link, /scene new, /scene unlink.
// Data: data/kv/chat-scenes.json { links: { chatId: { sketch, auto, at } }, videos: { chatId: path }, idents: { chatId: [color, glyph] } }.
const ChatScenes = (() => {
  // Forgeheart colors, all readable on the dark looks (text stays the normal ink; the color marks glyphs / frames)
  const PALETTE = [['#ffc23d', 'gold'], ['#ff7a1a', 'ember'], ['#a970ff', 'violet'], ['#ff3d7f', 'rose'], ['#56c6ff', 'sky'], ['#7cd992', 'mint'], ['#c8f04a', 'lime'], ['#c9d3ff', 'ice']];
  const GLYPHS = ['◆', '▲', '●', '■', '★', '✦', '⬢', '✚', '❖', '✿', '♥', '♣'];
  const NEUTRAL = '#ffc23d';
  const AVATARS = { claude: { glyph: '✳', name: 'Claude', color: '#d97757' }, codex: { glyph: 'A', name: 'Astra', color: '#10a37f' } };

  let data = { links: {}, videos: {}, idents: {} };
  let loaded = false;
  const save = debounce(() => window.hub.kvSet('chat-scenes', data), 400);
  const workers = new Map(); // chatId -> ['claude', 'astra'] set by a jam (jam.js) while it runs

  // ---------- identity ----------
  function hash(str) { let h = 0x811c9dc5; for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
  // From the hash of the chat id; a director chat's is kept the first time it's seen (data.idents), picked so it
  // differs from the colors and glyphs of that director's recent chats, so side by side they never look alike.
  function identity(chatId) {
    if (!chatId) return { color: NEUTRAL, colorName: 'gold', glyph: '◇' };
    const kept = data.idents[chatId];
    const h = hash(chatId);
    let ci = kept ? kept[0] : h % PALETTE.length;
    let gi = kept ? kept[1] : Math.floor(h / PALETTE.length) % GLYPHS.length;
    const c = !kept && loaded && summaryOf(chatId);
    if (c && isDirector(H.agent(c.agentId))) {
      const near = H.chats.filter((x) => x.agentId === c.agentId && x.id !== chatId && data.idents[x.id]).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, PALETTE.length - 1).map((x) => data.idents[x.id]);
      for (let k = 0; k < PALETTE.length && near.some((n) => n[0] === ci); k += 1) ci = (ci + 1) % PALETTE.length;
      for (let k = 0; k < GLYPHS.length && near.some((n) => n[1] === gi); k += 1) gi = (gi + 1) % GLYPHS.length;
      data.idents[chatId] = [ci, gi];
      save();
    }
    const [color, colorName] = PALETTE[ci];
    return { color, colorName, glyph: GLYPHS[gi] };
  }

  // ---------- chats ----------
  const summaryOf = (chatId) => H.chats.find((c) => c.id === chatId) || null;
  const agentOfChat = (chatId) => H.agent(summaryOf(chatId)?.agentId) || null;
  const threeAgent = () => (typeof Tools !== 'undefined' ? Tools.dockedAgent('three') : null);
  const isDirector = (agent) => Boolean(agent?.mode === 'native' && agent.dock);
  const isThreeChat = (chatId) => agentOfChat(chatId)?.dock === 'three';
  const titleOf = (chatId) => summaryOf(chatId)?.title || 'New chat';
  const busy = (chatId) => Boolean(chatId && (Native.isBusy(chatId) || HubBridge.log().some((e) => e.running && e.chatId === chatId)));
  // The agents on a chat's scene: its own engine, or both while a jam runs on it.
  function jamOn(chatId) {
    const J = window.Jam;
    if (!J || !chatId) return false;
    try { return Boolean(J.activeFor?.(chatId) ?? J.isActive?.(chatId) ?? (J.chatId === chatId && J.running)); } catch { return false; }
  }
  function agentsOn(chatId) {
    if (workers.get(chatId)?.length) return workers.get(chatId);
    if (jamOn(chatId)) return ['claude', 'codex'];
    return [agentOfChat(chatId)?.engine || 'claude'];
  }

  // ---------- links ----------
  const lab = () => (typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes) || null;
  function linkOf(chatId) {
    const L = chatId && data.links[chatId];
    if (!L) return null;
    const S = lab();
    if (S && !S.get(L.sketch)) return null; // the sketch was deleted: the chat links again on its next use
    return L.sketch;
  }
  // The chat that owns a sketch (only chats that still exist count; a chat back from the trash gets it again).
  function ownerOf(sketchId) {
    if (!sketchId) return null;
    let best = null;
    for (const [chatId, L] of Object.entries(data.links)) if (L.sketch === sketchId && summaryOf(chatId) && (!best || L.at > data.links[best].at)) best = chatId;
    return best;
  }
  function link(chatId, sketchId, { rename = true } = {}) {
    if (!chatId || !sketchId) return;
    // one owner per sketch: the chat that had it lets go
    for (const [id, L] of Object.entries(data.links)) if (L.sketch === sketchId && id !== chatId) delete data.links[id];
    const S = lab();
    const sk = S?.get(sketchId);
    data.links[chatId] = { sketch: sketchId, auto: '', at: Date.now() }; // auto: the name we gave it (follows the chat's title)
    if (rename && sk && isDraft(sketchId)) {
      clearDraft(sketchId);
      recolorStarter(sk, identity(chatId).color);
      S.rename(sketchId, titleOf(chatId));
      data.links[chatId].auto = sk.name;
    }
    save();
    paintAll();
  }
  function unlink(chatId) { delete data.links[chatId]; save(); paintAll(); }
  // Chat titles change (first message, auto-title, rename): sketches that still carry the name we gave follow.
  function followTitles() {
    const S = lab();
    if (!S) return;
    for (const [chatId, L] of Object.entries(data.links)) {
      const sk = S.get(L.sketch); const c = summaryOf(chatId);
      if (!sk || !c || !L.auto || sk.name !== L.auto || c.title === sk.name || c.title === 'New chat') continue;
      S.rename(sk.id, c.title);
      L.auto = c.title;
      save();
    }
  }

  // ---------- the starter for a new chat ----------
  const starter = (tint) => `import * as THREE from 'three';

// A calm start for this chat's scene: a slow glowing shape on a soft gradient. Ask the director for anything.
const P = tweak({
  tint: { value: '${tint}', label: 'Tint', group: 'Colors' },
  drift: { value: 0.25, min: 0, max: 2, label: 'Drift', group: 'Motion' },
  breathe: { value: 0.35, min: 0, max: 1.5, label: 'Music breath', group: 'Music' },
});
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);
const tint = new THREE.Color(P.tint);
scene.background = tint.clone().multiplyScalar(0.07);
const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 3), new THREE.MeshBasicMaterial({ color: tint, wireframe: true, transparent: true, opacity: 0.55 }));
const points = Array.from({ length: 700 }, () => new THREE.Vector3().randomDirection().multiplyScalar(2.2 + Math.random() * 2.6));
const dust = new THREE.Points(new THREE.BufferGeometry().setFromPoints(points), new THREE.PointsMaterial({ color: tint, size: 0.035, transparent: true, opacity: 0.7 }));
scene.add(core, dust);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
renderer.setAnimationLoop((now) => {
  const t = now / 1000;
  tint.set(P.tint);
  core.material.color.copy(tint);
  dust.material.color.copy(tint);
  scene.background.copy(tint).multiplyScalar(0.07);
  core.rotation.set(t * P.drift * 0.6, t * P.drift, 0);
  dust.rotation.y = -t * P.drift * 0.2;
  core.scale.setScalar(1 + Math.sin(t * 0.8) * 0.04 + audio.bass * P.breathe * 0.3);
  renderer.render(scene, camera);
});
`;
  // The open "new chat" starter (one per director, reused while nobody touched it).
  const DRAFT_KEY = 'scenes.draft.three';
  const isDraft = (sketchId) => store.get(DRAFT_KEY, null)?.id === sketchId;
  const clearDraft = (sketchId) => { if (isDraft(sketchId)) store.set(DRAFT_KEY, null); };
  const pristine = (sk, tint) => { const code = (lab()?.layersOf(sk) || [])[0]?.code ?? sk.code; return (sk.layers?.length || 1) === 1 && code === starter(tint); };
  function draftSketch() {
    const S = lab();
    const d = store.get(DRAFT_KEY, null);
    const have = d && S.get(d.id);
    if (have && !ownerOf(have.id) && pristine(have, d.tint)) return have;
    const sk = S.create({ name: 'New chat', code: starter(NEUTRAL), frame: S.frameOf(S.currentId()) });
    store.set(DRAFT_KEY, { id: sk.id, tint: NEUTRAL });
    return sk;
  }
  function freshScene(chatId) {
    const S = lab();
    const sk = S.create({ name: titleOf(chatId), code: starter(identity(chatId).color), frame: S.frameOf(S.currentId()) });
    return sk;
  }
  function recolorStarter(sk, tint) {
    const S = lab();
    const d = store.get(DRAFT_KEY, null);
    const from = d?.id === sk.id ? d.tint : NEUTRAL;
    if (!pristine(sk, from) || from === tint) return;
    S.layersOf(sk)[0].code = starter(tint);
    S.changed(sk.id);
  }

  // ---------- following the chat on screen ----------
  const shown = {}; // toolId -> chat id (or 'new') the tool shows the scene / video of
  let syncing = Promise.resolve();
  function sync() { syncing = syncing.then(() => Promise.all([syncThree(), syncVideo()])).catch((err) => console.warn(err)); return syncing; }
  async function syncThree() {
    const S = lab();
    const agent = threeAgent();
    if (!S || !agent || !loaded) { paintAll(); return; }
    let chatId = H.activeChat[agent.id] || null;
    const key = chatId || 'new';
    if (shown.three === key) { followTitles(); paintAll(); return; }
    const first = shown.three === undefined;
    shown.three = key;
    if (first) {
      // The app just started on "New chat": show the chat whose scene is on screen (its sketch was the last open).
      const owner = ownerOf(S.currentId());
      if (!chatId && owner && summaryOf(owner)?.agentId === agent.id) {
        chatId = owner; shown.three = owner;
        H.activeChat[agent.id] = owner;
        Native.refresh(agent.id);
        Panel.highlight();
      } else if (chatId && linkOf(chatId)) { await ThreeLab.idle(); S.open(linkOf(chatId)); }
      paintAll();
      return;
    }
    await ThreeLab.idle(); // a director call changing the sketch on screen finishes first
    if (chatId) {
      const sk = linkOf(chatId);
      if (sk) S.open(sk);
      // an older chat without a scene keeps what's open; it becomes its scene on first use
    } else S.open(draftSketch().id); // a new chat: a fresh starter
    followTitles();
    paintAll();
  }
  // Video Director: each chat comes back to its video.
  async function syncVideo() {
    if (typeof Review === 'undefined' || typeof Tools === 'undefined') return;
    const agent = Tools.dockedAgent('ae');
    if (!agent) return;
    const chatId = H.activeChat[agent.id] || null;
    const key = chatId || 'new';
    if (shown.ae === key) return;
    const prev = shown.ae;
    shown.ae = key;
    let cur = null;
    try { cur = Review.current?.path || null; } catch { return; }
    if (prev && prev !== 'new' && cur && summaryOf(prev)) { data.videos[prev] = cur; save(); }
    const want = chatId && data.videos[chatId];
    if (want && want !== cur && H.surfaces.get('tool:ae')?.mounted) { try { await Review.open(want); } catch { /* moved or deleted */ } }
  }

  // A message in a director chat: that chat's scene is the one it talks about.
  function onSend(agentId, chat) {
    const agent = H.agent(agentId);
    if (agent?.dock === 'ae' && typeof Review !== 'undefined') { try { const p = Review.current?.path; if (p) { data.videos[chat.id] = p; save(); } } catch { /* not mounted */ } return; }
    if (agent?.dock !== 'three' || H.activeChat[agentId] !== chat.id) return;
    const S = lab();
    if (!S) return; // the Lab isn't loaded: its first call links (routeThree)
    shown.three = chat.id;
    const cur = S.currentId();
    const mine = linkOf(chat.id);
    const owner = ownerOf(cur);
    if (mine === cur) return;
    if (!owner) {
      // the sketch on screen belongs to no chat (a new chat's starter, or one you opened): this chat takes it
      const before = mine && S.get(mine)?.name;
      link(chat.id, cur);
      if (before) toast(`This chat now works on "${S.get(cur).name}" ("${before}" stays in Your sketches)`, { timeout: 4500, action: { label: 'Undo', fn: () => { link(chat.id, mine, { rename: false }); S.open(mine); } } });
    } else if (mine) {
      S.open(mine); // the sketch on screen is another chat's: back to this chat's own
      toast(`Back to this chat's scene "${S.get(mine).name}"`, { timeout: 2500 });
    } else {
      // an older chat used for the first time while another chat's scene shows: it gets its own copy
      const copy = S.duplicate(cur, titleOf(chat.id));
      link(chat.id, copy.id, { rename: false });
      data.links[chat.id].auto = copy.name;
      S.open(copy.id);
      toast(`This chat has its own scene now (a copy of "${S.get(cur)?.name}")`, { timeout: 3500 });
    }
  }

  // ---------- routing director calls (tools/three.js) ----------
  // → { chatId, sketchId } or null (no chat: the sketch on screen, as before)
  function routeThree(tool, chatId) {
    const S = lab();
    if (!S || !loaded) return null;
    if (!chatId || !isThreeChat(chatId)) {
      // no chat given (tests, /director try, an older run): the one director chat that's answering, if only one is
      const working = H.chats.filter((c) => isThreeChat(c.id) && Native.isBusy(c.id));
      if (working.length !== 1) return null;
      chatId = working[0].id;
    }
    let sk = linkOf(chatId);
    if (!sk) {
      const cur = S.currentId();
      const owner = ownerOf(cur);
      if (!owner) { link(chatId, cur); sk = cur; } else {
        const copy = S.duplicate(cur, titleOf(chatId));
        link(chatId, copy.id, { rename: false });
        data.links[chatId].auto = copy.name;
        sk = copy.id;
      }
    }
    setTimeout(paintAll, 0);
    return { chatId, sketchId: sk };
  }
  function relink(chatId, sketchId) { if (chatId && sketchId) { data.links[chatId] = { sketch: sketchId, auto: '', at: Date.now() }; save(); paintAll(); } }

  // ---------- painting ----------
  function avatar(engine, on) {
    const a = AVATARS[engine] || AVATARS.claude;
    const n = el('span', { class: `scene-av${on ? ' on' : ''}`, text: a.glyph, title: `${a.name}${on ? ' is working on it' : ''}` });
    n.style.setProperty('--av', a.color);
    return n;
  }
  let tag = null;
  function paintTag() {
    const S = lab();
    const host = S?.previewHost();
    if (!host) return;
    const agent = threeAgent();
    const owner = ownerOf(S.currentId());
    host.classList.toggle('scene-framed', Boolean(owner));
    if (!owner || !agent) { tag?.remove(); return; }
    const id = identity(owner);
    host.style.setProperty('--scene-color', id.color);
    tag ||= el('button', { type: 'button', class: 'scene-tag', dataset: { feature: 'Scene tag' }, on: { click: () => tagClick() } });
    const viewing = H.activeChat[agent.id] !== owner;
    const working = busy(owner);
    tag.style.setProperty('--scene-color', id.color);
    tag.classList.toggle('viewing', viewing);
    tag.classList.toggle('busy', working);
    tag.replaceChildren(el('span', { class: 'scene-glyph', text: id.glyph }), el('span', { class: 'scene-name', text: titleOf(owner) }),
      viewing ? el('span', { class: 'scene-note', text: 'other chat' }) : null,
      ...agentsOn(owner).map((e) => avatar(e, working)));
    tag.title = viewing ? `The scene of the chat "${titleOf(owner)}" (not the chat in the dock). Click to go to that chat.` : `This is the scene of the chat "${titleOf(owner)}"${working ? ': working on it now' : ''}. Each director chat has its own scene (/scene).`;
    if (tag.parentElement !== host) host.append(tag);
  }
  function tagClick() {
    const S = lab(); const owner = ownerOf(S?.currentId());
    const agent = owner && agentOfChat(owner);
    if (!agent) return;
    if (H.activeChat[agent.id] !== owner) { shown.three = owner; Native.open(agent.id, owner); Tools.openDock('three'); } else Commands.exec('/scene', agent.id);
  }
  // the dock header: the chat's glyph next to its title, a thin line in its color
  function paintHead(agentId, v, chat) {
    const agent = H.agent(agentId);
    if (!isDirector(agent) || !v?.title) return;
    const id = identity(chat?.id);
    v.root.style.setProperty('--chat-ident', id.color);
    v.root.classList.add('has-ident');
    let g = v.title.previousElementSibling?.classList.contains('chat-ident') ? v.title.previousElementSibling : null;
    if (!g) { g = el('span', { class: 'chat-ident' }); v.title.before(g); }
    g.textContent = id.glyph;
    g.classList.toggle('busy', busy(chat?.id));
    g.title = chat ? `This chat's color and mark: its scene in the Lab has the same (/scene)` : 'A new chat: it gets its own color and scene when you send';
  }
  function paintHeads() { for (const a of H.agents().filter(isDirector)) { const v = Native.view(a.id); if (v) paintHead(a.id, v, Native.current(a.id)); } }
  // chat rows: the glyph in the chat's color; a working chat you aren't looking at gets a dot in its color
  function paintRow(r, item, agent) {
    if (!isDirector(agent) || !item.chatId) return;
    const id = identity(item.chatId);
    r.style.setProperty('--chat-ident', id.color);
    r.classList.add('has-ident');
    r.prepend(el('span', { class: 'chat-ident', text: id.glyph }));
  }
  // a working chat you aren't looking at: its busy dot turns into a small dot in its color
  function paintRows() {
    for (const r of document.querySelectorAll('#chat-groups .item.has-ident')) {
      let b = r.querySelector('.busy');
      const on = Native.isBusy(r.dataset.key);
      if (!on) { if (b?.dataset.scene) b.remove(); continue; } // a dot we added (the list didn't redraw since)
      if (!b) { r.querySelector('.unread-dot')?.remove(); b = el('span', { class: 'busy', dataset: { scene: '1' } }); r.append(b); }
      const agentId = r.closest('.group')?.dataset.id;
      const bg = H.activeChat[agentId] !== r.dataset.key;
      b.classList.toggle('bg-busy', bg);
      b.title = bg ? 'Working in the background on its own scene' : 'Working';
    }
  }
  let painting = false;
  function paintAll() {
    if (painting) return;
    painting = true;
    queueMicrotask(() => { painting = false; try { paintTag(); paintHeads(); paintRows(); } catch (err) { console.warn(err); } });
  }

  // The glyph of the chat that owns a sketch (the Lab's sketch list shows it).
  function glyphFor(sketchId) { const o = ownerOf(sketchId); return o ? identity(o).glyph : ''; }

  // Opening a sketch from "Your sketches" that belongs to another chat: offer to go to that chat.
  addEventListener('hearth:sketch', (e) => {
    paintAll();
    const { id, by } = e.detail || {};
    if (by !== 'user') return;
    const owner = ownerOf(id); const agent = owner && agentOfChat(owner);
    if (!agent || H.activeChat[agent.id] === owner) return;
    toast(`"${lab()?.get(id)?.name}" is the scene of the chat "${titleOf(owner)}"`, { timeout: 6000, action: { label: 'Go to that chat', fn: () => { shown.three = owner; Native.open(agent.id, owner); Tools.openDock('three'); } } });
  });
  addEventListener('hearth:lab-ready', () => sync());
  addEventListener('hearth:view', () => { sync(); if (typeof DirectorDock !== 'undefined') for (const t of ['three', 'ae']) DirectorDock.entry(t)?.paint(); });

  // "New chat" (also when the dock already shows an empty one): a fresh starter
  async function onNewChat(agentId) {
    const S = lab();
    if (H.agent(agentId)?.dock !== 'three' || !S || !loaded) return;
    shown.three = 'new';
    await ThreeLab.idle();
    const cur = S.currentId();
    if (!(isDraft(cur) && !ownerOf(cur))) S.open(draftSketch().id);
    paintAll();
  }
  Native.hooks.newChat?.push(onNewChat);
  Native.hooks.send.push(onSend);
  Native.hooks.event.push(() => paintAll());
  Native.hooks.send.push(() => paintAll());
  Native.hooks.render.push(paintHead);
  if (Panel.hooks) { Panel.hooks.row.push(paintRow); Panel.hooks.render.push(() => { followTitles(); paintAll(); }); }
  HubBridge.onCall(() => paintAll());

  (async () => {
    try { const d = await window.hub.kvGet('chat-scenes', null); if (d) data = { links: d.links || {}, videos: d.videos || {}, idents: d.idents || {} }; } catch { /* first run */ }
    loaded = true;
    sync();
    Panel.render();
  })();

  // ---------- /scene ----------
  // The director chat a command talks about: the one it was typed in, or the docked Three Director's open chat.
  function chatFor(ctx) {
    const a = H.agent(ctx.agentId);
    if (a?.dock === 'three') return { agent: a, chatId: H.activeChat[a.id] || null };
    const t = threeAgent();
    return t ? { agent: t, chatId: H.activeChat[t.id] || null } : { agent: null, chatId: null };
  }
  if (!Commands.get('scene')) {
    Commands.register({
      name: 'scene', area: 'Three.js Lab', args: '[link | new | unlink]',
      desc: 'This director chat\'s own scene: show which sketch it owns · link the open one · a fresh one · unlink',
      keywords: 'chat sketch per chat own scene which',
      examples: ['/scene', '/scene link', '/scene new'],
      complete: () => [{ value: 'link', hint: 'the open sketch becomes this chat\'s scene' }, { value: 'new', hint: 'a fresh starter scene for this chat' }, { value: 'unlink', hint: 'this chat lets go of its scene (the sketch stays)' }],
      run: async (args, ctx) => {
        const { agent, chatId } = chatFor(ctx);
        if (!agent) return 'Per-chat scenes are for the Three Director: /director-setup docks one in the Lab.';
        await ThreeLab.cmd({ show: false });
        for (let i = 0; i < 50 && !lab(); i += 1) await new Promise((r) => setTimeout(r, 100));
        const S = lab();
        if (!S) return 'The Lab did not load.';
        const sub = String(args || '').trim().toLowerCase();
        const name = (id) => `"${S.get(id)?.name}"`;
        if (sub === 'new') {
          if (!chatId) { S.open(draftSketch().id); return 'A fresh scene is open: it becomes this chat\'s when you send your first message.'; }
          const sk = freshScene(chatId);
          link(chatId, sk.id, { rename: false });
          data.links[chatId].auto = sk.name;
          S.open(sk.id);
          return `This chat has a fresh scene: ${name(sk.id)}.`;
        }
        if (!chatId) return 'This is a new chat: the scene on screen becomes its scene when you send your first message.';
        if (sub === 'link') {
          const cur = S.currentId();
          const was = ownerOf(cur);
          link(chatId, cur, { rename: false });
          return `${name(cur)} is this chat's scene now${was && was !== chatId ? ` (the chat "${titleOf(was)}" let go of it: it gets its own scene when you use it)` : ''}.`;
        }
        if (sub === 'unlink') {
          const sk = linkOf(chatId);
          if (!sk) return 'This chat has no scene yet.';
          unlink(chatId);
          return `This chat let go of ${name(sk)} (the sketch stays in Your sketches). Its next message makes the sketch on screen its scene.`;
        }
        if (sub) return 'Use /scene, /scene link, /scene new or /scene unlink.';
        const sk = linkOf(chatId);
        const id = identity(chatId);
        if (!sk) return `${id.glyph} This chat (${id.colorName}) has no scene yet: the sketch on screen becomes its scene when you send a message here. /scene link links it now, /scene new makes a fresh one.`;
        const x = S.get(sk);
        const song = S.songOf(sk)?.split(/[\\/]/).pop();
        const onScreen = S.currentId() === sk;
        return `${id.glyph} **${x.name}** is this chat's scene (${id.colorName}) · ${S.layersOf(x).length} layer${S.layersOf(x).length === 1 ? '' : 's'} · ${S.frameOf(sk) || 'fit'}${song ? ` · ♪ ${song}` : ''} · ${onScreen ? 'on screen' : 'not on screen (the director works on it backstage)'}`;
      },
    });
  }

  return {
    identity, linkOf, ownerOf, link, unlink, relink, routeThree, glyphFor, sync, paintAll, starter,
    // tools/three.js at start: the sketch of the chat on screen, if it owns one (else null)
    startSketch(ids) { const a = threeAgent(); const sk = a && loaded ? data.links[H.activeChat[a.id]]?.sketch : null; return sk && ids.includes(sk) ? sk : null; },
    // jam.js: who works on a chat's scene while a jam runs (['claude', 'codex']), null when it ends
    setWorkers(chatId, list) { if (list?.length) workers.set(chatId, list); else workers.delete(chatId); paintAll(); },
    data: () => data,
  };
})();
