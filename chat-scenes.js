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
  const AVATARS = { claude: { glyph: '✳', icon: 'claude', name: 'Claude', color: '#d97757' }, codex: { glyph: 'A', icon: 'astra', name: 'Astra', color: '#10a37f' } };

  let data = { links: {}, videos: {}, idents: {} };
  let loaded = false;
  const save = debounce(() => window.hub.kvSet('chat-scenes', data), 400);
  const workers = new Map(); // chatId -> { list: ['claude', 'codex'], active: 'codex' | null } set by a jam (jam.js) while it runs

  // ---------- identity ----------
  function hash(str) { let h = 0x811c9dc5; for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
  // From the hash of the chat id; a director chat's is kept the first time it's seen (data.idents), picked so it
  // differs from the colors and glyphs of that director's recent chats, so side by side they never look alike.
  function identity(chatId) {
    if (!chatId) return { color: NEUTRAL, colorName: 'gold', glyph: '◇' };
    const mk = window.Makes?.identFor?.(chatId); // (round 11) a make's rooms share the make's color and mark (makes.js)
    if (mk) return mk;
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
  const busy = (chatId) => Boolean(chatId && (Native.isBusy(chatId) || workers.has(chatId) || HubBridge.log().some((e) => e.running && e.chatId === chatId)));
  // The agents on a chat's scene: its own engine, or both while a jam runs on it.
  function jamOn(chatId) {
    const J = window.Jam;
    if (!J || !chatId) return false;
    try { return Boolean(J.activeFor?.(chatId) ?? J.isActive?.(chatId) ?? (J.chatId === chatId && J.running)); } catch { return false; }
  }
  function agentsOn(chatId) {
    if (workers.get(chatId)?.list.length) return workers.get(chatId).list;
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

  // ---------- the starter for a new chat: the orb (round 10) ----------
  // A new chat's scene is a glowing orb built as node graphs in two layers (Backdrop at the bottom, Orb on top), in
  // the chat's color, moving on the scene's own timeline (10 s, frame-exact, with keyframes already on it: the orb
  // breathes, its glow swells, the camera drifts), not on the music until you ask ("make it react").
  // tools/three-nodes.js builds the graphs (ThreeNodes.orbScene); the timeline lives with the sketch (tools/three.js).
  const orbOf = (tint) => (typeof ThreeNodes !== 'undefined' && ThreeNodes.orbScene ? ThreeNodes.orbScene(tint) : null);
  function starterLayers(tint) {
    const sc = orbOf(tint);
    if (!sc) return null;
    return sc.layers.map((L, i) => ({ ...(typeof ThreeLayers !== 'undefined' ? ThreeLayers.defaults() : {}), id: i ? 'orb' : 'main', name: L.name, code: L.code, color: (typeof ThreeLayers !== 'undefined' ? ThreeLayers.COLORS : ['#ffd75e', '#48ddff'])[i], slot: i, keys: JSON.parse(JSON.stringify(L.keys || {})), ...(L.lanes ? { lanes: [...L.lanes] } : {}) }));
  }
  const starterTimeline = () => ({ ...(orbOf('#ffc23d')?.timeline || { len: 10, fps: 30 }) });
  // one sketch's worth of starter: { name, code, layers, timeline } for ThreeLab.scenes.create
  function starterSketch(name, tint, frame) {
    const layers = starterLayers(tint);
    return layers ? { name, code: layers[0].code, layers, timeline: starterTimeline(), frame } : { name, code: legacyStarter(tint), frame };
  }
  // The orb layer's code on its own (a whole sketch: tests and /scene use it as "a starter").
  const starter = (tint) => orbOf(tint)?.layers[1].code || legacyStarter(tint);
  // The previous starter (rounds 4–9): kept to recognise an untouched one and to bring it up to the orb.
  const legacyStarter = (tint) => `import * as THREE from 'three';

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
  // untouched: the orb's two layers with their code and keyframes as made (or the previous one-layer starter)
  const keysSig = (Ls) => JSON.stringify(Ls.map((L) => L.keys || {}));
  function pristine(sk, tint) {
    const Ls = lab()?.layersOf(sk) || [];
    const want = starterLayers(tint);
    if (want && Ls.length === want.length && Ls.every((L, i) => L.code === want[i].code) && keysSig(Ls) === keysSig(want)) return true;
    return Ls.length <= 1 && (Ls[0]?.code ?? sk.code) === legacyStarter(tint);
  }
  const isLegacy = (sk) => (lab()?.layersOf(sk) || []).length <= 1;
  // an untouched starter takes the orb in place (the previous starter, or another color): same sketch, new layers
  function makeOrb(sk, tint) {
    const S = lab();
    const layers = starterLayers(tint);
    if (!layers) return false;
    const have = S.layersOf(sk);
    // the same layers (a recolor): changed in place, so the Lab's sliders keep their layers; else the orb's layers
    if (have.length === layers.length && have.every((L, i) => L.id === layers[i].id)) have.forEach((L, i) => { L.code = layers[i].code; L.keys = layers[i].keys; });
    else { sk.layers = layers; S.setTimeline?.(sk.id, starterTimeline()); }
    sk.code = S.layersOf(sk)[0].code;
    S.changed(sk.id);
    return true;
  }
  function draftSketch() {
    const S = lab();
    const d = store.get(DRAFT_KEY, null);
    const have = d && S.get(d.id);
    if (have && !ownerOf(have.id) && pristine(have, d.tint)) {
      if (isLegacy(have) && starterLayers(d.tint)) makeOrb(have, d.tint); // an untouched draft from before the orb
      return have;
    }
    const sk = S.create(starterSketch('New chat', NEUTRAL, S.frameOf(S.currentId())));
    store.set(DRAFT_KEY, { id: sk.id, tint: NEUTRAL });
    return sk;
  }
  function freshScene(chatId) {
    const S = lab();
    return S.create(starterSketch(titleOf(chatId), identity(chatId).color, S.frameOf(S.currentId())));
  }
  function recolorStarter(sk, tint) {
    const d = store.get(DRAFT_KEY, null);
    const from = d?.id === sk.id ? d.tint : NEUTRAL;
    if (!pristine(sk, from) || (from === tint && !isLegacy(sk))) return;
    if (makeOrb(sk, tint)) return;
    lab().layersOf(sk)[0].code = legacyStarter(tint);
    lab().changed(sk.id);
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
      if (sk) await openScene(sk);
      // an older chat without a scene keeps what's open; it becomes its scene on first use
    } else await openScene(draftSketch().id); // a new chat: a fresh starter
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
    // a jam's turns (jam.js) run under their own ids: they work on the jam's sketch, on screen or backstage
    const jr = chatId && window.Jam?.routeFor?.(chatId);
    if (jr?.sketchId && S.get(jr.sketchId)) { setTimeout(paintAll, 0); return jr; }
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
  // Claude's spark / Astra's star (icons.js), lit while that agent works on the scene
  function avatar(engine, on) {
    const a = AVATARS[engine] || AVATARS.claude;
    const svg = typeof Icons !== 'undefined' ? Icons.node(a.icon) : null;
    const n = el('span', { class: `scene-av${on ? ' on' : ''}${svg ? ' svg' : ''}`, dataset: { engine }, title: `${a.name}${on ? ' is working on it' : ''}` }, svg || a.glyph);
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
    const who = agentsOn(owner);
    const active = workers.get(owner)?.active || null; // a jam: the one building / directing right now
    tag.style.setProperty('--scene-color', id.color);
    tag.classList.toggle('viewing', viewing);
    tag.classList.toggle('at-work', working);
    tag.classList.toggle('duo', who.length > 1);
    // the tag is redrawn only when what it shows changes (no DOM churn while a director works)
    const sig = [id.glyph, titleOf(owner), viewing, ...who.map((e) => `${e}${working && (!active || active === e) ? '+' : ''}`)].join('|');
    if (tag.dataset.sig !== sig) {
      tag.dataset.sig = sig;
      tag.replaceChildren(el('span', { class: 'scene-glyph', text: id.glyph }), el('span', { class: 'scene-name', text: titleOf(owner) }),
        viewing ? el('span', { class: 'scene-note', text: 'other chat' }) : null,
        el('span', { class: 'scene-avs' }, ...who.map((e) => avatar(e, working && (!active || active === e)))));
    }
    const whoText = who.length > 1 ? `Claude and Astra are jamming on it${active ? ` (${AVATARS[active]?.name} now)` : ''}` : working ? 'working on it now' : '';
    tag.title = viewing ? `The scene of the chat "${titleOf(owner)}" (not the chat in the dock). Click to go to that chat.` : `This is the scene of the chat "${titleOf(owner)}"${whoText ? `: ${whoText}` : ''}. Each director chat has its own scene (/scene).`;
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
    g.classList.toggle('at-work', busy(chat?.id));
    g.title = chat ? `This chat's color and mark: its scene in the Lab has the same (/scene)` : 'A new chat: it gets its own color and scene when you send';
  }
  function paintHeads() { for (const a of H.agents().filter(isDirector)) { const v = Native.view(a.id); if (v) paintHead(a.id, v, Native.current(a.id)); } }
  // chat rows: the glyph in the chat's color; a working chat you aren't looking at gets a dot in its color
  function paintRow(r, item, agent) {
    if (!isDirector(agent) || !item.chatId) return;
    const id = identity(item.chatId);
    r.style.setProperty('--chat-ident', id.color);
    r.classList.add('has-ident');
    r.prepend(paintIdent(el('span', { class: 'chat-ident' }), item.chatId));
  }
  // A row's mark: the scene's still with the chat's glyph in its corner, or the glyph alone (no picture yet).
  // Written only when the picture changed.
  function paintIdent(node, chatId) {
    const id = identity(chatId);
    const url = thumbOf(chatId);
    if (node.textContent !== id.glyph) node.textContent = id.glyph;
    // the scene's own sequence (tools/three-seq.js), in the still's tooltip and a small ▤ mark
    const sq = typeof ThreeSeq !== 'undefined' ? ThreeSeq.summaryFor?.(linkOf(chatId)) : null;
    const sqTip = sq ? ` · ▤ its sequence: ${sq.clips} clip${sq.clips === 1 ? '' : 's'}, ${sq.seconds.toFixed(1)} s` : '';
    if (node.classList.contains('has-seq') !== Boolean(sq?.clips)) node.classList.toggle('has-seq', Boolean(sq?.clips));
    if ((node.dataset.thumb || '') === String(url ? url.length + url.slice(-24) : '')) { const t = url ? `This chat's scene (its own sketch in the Lab)${sqTip}` : sqTip.slice(3); if (node.title !== t) node.title = t; return node; }
    node.dataset.thumb = url ? url.length + url.slice(-24) : '';
    node.classList.toggle('thumb', Boolean(url));
    node.style.backgroundImage = url ? `url("${url}")` : '';
    node.title = url ? `This chat's scene (its own sketch in the Lab)${sqTip}` : sqTip.slice(3);
    return node;
  }
  // a working chat you aren't looking at: its busy dot turns into a small dot in its color
  function paintRows() {
    for (const r of document.querySelectorAll('#chat-groups .item.has-ident')) {
      let b = r.querySelector('.busy');
      const on = Native.isBusy(r.dataset.key) || workers.has(r.dataset.key); // a jam works on it too
      if (!on) { if (b?.dataset.scene) b.remove(); continue; } // a dot we added (the list didn't redraw since)
      if (!b) { r.querySelector('.unread-dot')?.remove(); b = el('span', { class: 'busy', dataset: { scene: '1' } }); r.append(b); }
      const agentId = r.closest('.group')?.dataset.id;
      const bg = H.activeChat[agentId] !== r.dataset.key;
      b.classList.toggle('bg-busy', bg);
      b.title = bg ? 'Working in the background on its own scene' : 'Working';
    }
  }
  // "Your sketches": the picker carries the color of the chat that owns the open sketch, each option its owner's
  let pickerSeen = null;
  function paintPicker() {
    const picker = document.querySelector('.three-sketch-select');
    if (!picker) return;
    if (pickerSeen !== picker) { pickerSeen = picker; new MutationObserver(() => paintPicker()).observe(picker, { childList: true }); }
    const owner = ownerOf(picker.value);
    const color = owner ? identity(owner).color : '';
    if (picker.style.getPropertyValue('--scene-color') !== color) picker.style.setProperty('--scene-color', color);
    picker.classList.toggle('has-scene', Boolean(owner));
    for (const o of picker.options) { const c = ownerOf(o.value) ? identity(ownerOf(o.value)).color : ''; if (o.style.color !== c && (o.style.color || c)) o.style.color = c; }
  }
  let painting = false;
  function paintAll() {
    if (painting) return;
    painting = true;
    queueMicrotask(() => { painting = false; try { paintTag(); paintHeads(); paintRows(); paintPicker(); } catch (err) { console.warn(err); } });
  }

  // ---------- scene stills (rows) and the cross-fade between scenes ----------
  // Each director chat keeps a small still of its scene (kv 'chat-scene-thumbs'), refreshed only when the scene
  // changes: when you leave it (the picture the cross-fade uses anyway), when a director turn ends on it, after a
  // backstage edit (three-backstage.js) and at each jam round (jam.js). Nothing runs per frame.
  let thumbs = {};
  const saveThumbs = debounce(() => { for (const id of Object.keys(thumbs)) if (!summaryOf(id)) delete thumbs[id]; window.hub.kvSet('chat-scene-thumbs', thumbs); }, 1500);
  function thumbOf(chatId) {
    if (!chatId) return null;
    if (thumbs[chatId]?.url) return thumbs[chatId].url;
    const sk = data.links[chatId]?.sketch;
    try { return (sk && lab()?.thumbOf?.(sk)) || null; } catch { return null; }
  }
  async function shrink(url, max = 112) {
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { return null; }
    if (!img.width || !img.height) return null;
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.72);
  }
  async function setThumb(chatId, url) {
    if (!chatId || !url || !summaryOf(chatId)) return false;
    const small = await shrink(url);
    if (!small) return false;
    thumbs[chatId] = { url: small, at: Date.now() };
    saveThumbs();
    for (const n of document.querySelectorAll(`#chat-groups .item[data-key="${CSS.escape(chatId)}"] > .chat-ident`)) paintIdent(n, chatId);
    return true;
  }
  const previewCover = () => lab()?.previewHost()?.querySelector(':scope > .scene-cover') || null;
  const labShown = () => { const h = lab()?.previewHost(); return Boolean(h?.offsetParent) && !h.classList.contains('on-stage') && document.visibilityState === 'visible'; };
  // The picture on screen now: null when the Lab isn't showing, its page is still loading, or it takes too long.
  let lastSnap = null; // the last picture taken for a switch (tests: why there was no fade)
  async function snapNow(ms = 700) {
    const cover = previewCover();
    const t0 = performance.now();
    lastSnap = { shown: labShown(), loading: !cover?.classList.contains('out') };
    if (!lastSnap.shown || lastSnap.loading || !ThreeLab.director?.shot) return null;
    const S = lab(); const at = S.currentId();
    const url = await Promise.race([ThreeLab.director.shot().catch(() => null), new Promise((r) => { setTimeout(() => r(null), ms); })]);
    Object.assign(lastSnap, { ms: Math.round(performance.now() - t0), got: Boolean(url) });
    return url && S.currentId() === at ? url : null;
  }
  // Switching scenes: the old picture lies over the preview while the new scene loads, then fades away
  // (polish.css .scene-cover, an opacity animation on the compositor). Switching again while it loads keeps the
  // first picture; it's cleared as soon as it has faded, so a later reload never flashes an old scene.
  let fadeN = 0;
  function clearCover(cover) { if (cover.classList.contains('snap')) { cover.classList.remove('snap'); cover.style.backgroundImage = ''; } }
  async function openScene(sketchId) {
    const S = lab();
    if (!S || !sketchId) return;
    if (S.currentId() === sketchId) { S.open(sketchId); return; }
    const leaving = S.currentId();
    const owner = ownerOf(leaving);
    const url = await snapNow();
    const cover = previewCover();
    const n = ++fadeN;
    if (url && cover) { cover.style.backgroundImage = `url("${url}")`; cover.classList.add('snap'); }
    if (url && owner) setThumb(owner, url); // the scene you leave, as you left it
    if (S.currentId() !== sketchId) S.open(sketchId);
    if (!cover) return;
    if (!cover.dataset.fade) { cover.dataset.fade = '1'; cover.addEventListener('animationend', () => { if (cover.classList.contains('out')) clearCover(cover); }); }
    if (cover.classList.contains('out') && url) { clearCover(cover); return; } // nothing reloaded (the Stage window…)
    setTimeout(() => { if (fadeN === n && cover.classList.contains('out')) clearCover(cover); }, 6000);
  }
  // a director turn ended on the scene on screen: a fresh still once it has drawn
  const refreshT = new Map();
  function refreshThumbSoon(chatId, ms = 1600) {
    clearTimeout(refreshT.get(chatId));
    refreshT.set(chatId, setTimeout(async () => {
      refreshT.delete(chatId);
      const S = lab();
      if (!S || linkOf(chatId) !== S.currentId()) return;
      const url = await snapNow(1500);
      if (url && linkOf(chatId) === S.currentId()) setThumb(chatId, url);
    }, ms));
  }

  // ---------- notifications about a chat carry its color and mark ----------
  const markOf = (chatId) => { const c = chatId && summaryOf(chatId); return c && isDirector(H.agent(c.agentId)) ? identity(chatId) : null; };
  // a toast (ui.js) about a director chat: its glyph in front, a thin edge in its color
  function markToast(node, chatId) {
    const id = markOf(chatId);
    if (!node || !id) return node;
    node.classList.add('scene-toast');
    node.style.setProperty('--chat-ident', id.color);
    node.prepend(el('span', { class: 'chat-ident', text: id.glyph }));
    return node;
  }
  // a system notification's title: "▲ Three Director · Scene A replied"
  const noteTitle = (chatId, text) => { const id = markOf(chatId); return id ? `${id.glyph} ${text} · ${titleOf(chatId)}` : text; };

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
  // a scene's sequence changed (tools/three-seq.js): the rows' marks follow (written only when they differ)
  addEventListener('hearth:sequences', () => { for (const r of document.querySelectorAll('#chat-groups .item.has-ident')) { const n = r.querySelector('.chat-ident'); if (n && r.dataset.key) paintIdent(n, r.dataset.key); } });
  addEventListener('hearth:view', () => { sync(); if (typeof DirectorDock !== 'undefined') for (const t of ['three', 'ae']) DirectorDock.entry(t)?.paint(); });

  // "New chat" (also when the dock already shows an empty one): a fresh starter
  async function onNewChat(agentId) {
    const S = lab();
    if (H.agent(agentId)?.dock !== 'three' || !S || !loaded) return;
    shown.three = 'new';
    await ThreeLab.idle();
    const cur = S.currentId();
    if (!(isDraft(cur) && !ownerOf(cur))) await openScene(draftSketch().id);
    paintAll();
  }
  Native.hooks.newChat?.push(onNewChat);
  Native.hooks.send.push(onSend);
  Native.hooks.event.push((ev, chat) => { paintAll(); if (ev?.type === 'done' && chat && isThreeChat(chat.id)) refreshThumbSoon(chat.id); });
  Native.hooks.send.push(() => paintAll());
  Native.hooks.render.push(paintHead);
  if (Panel.hooks) { Panel.hooks.row.push(paintRow); Panel.hooks.render.push(() => { followTitles(); paintAll(); }); }
  HubBridge.onCall(() => paintAll());

  (async () => {
    try { const d = await window.hub.kvGet('chat-scenes', null); if (d) data = { links: d.links || {}, videos: d.videos || {}, idents: d.idents || {} }; } catch { /* first run */ }
    try { thumbs = (await window.hub.kvGet('chat-scene-thumbs', null)) || {}; } catch { /* first run */ }
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
        const own = !song && S.timelineOf?.(sk);
        return `${id.glyph} **${x.name}** is this chat's scene (${id.colorName}) · ${S.layersOf(x).length} layer${S.layersOf(x).length === 1 ? '' : 's'} · ${S.frameOf(sk) || 'fit'}${song ? ` · ♪ ${song}` : own ? ` · ⏱ its own timeline, ${own.len} s (/scene-timeline)` : ''} · ${onScreen ? 'on screen' : 'not on screen (the director works on it backstage)'}`;
      },
    });
  }

  // ---------- /scene-timeline: the scene's one clock (round 10, orb) ----------
  // The scene on screen's timeline: its song, else its own (length, frame-exact). Every keyframe, cue and the
  // sequence sit on it. No new buttons: the timeline's name opens its length menu; this is the chat side.
  if (!Commands.get('scene-timeline')) {
    const fmtS = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
    Commands.register({
      name: 'scene-timeline', area: 'Three.js Lab', args: '[length <s> | go <time|f120> | play | pause | snap]',
      desc: 'The scene\'s timeline (its song, else its own, no song needed): what is on it · its length · go to a time or frame · play / pause · snap keyframes and cues to the song\'s bars',
      keywords: 'scene timeline clock length seconds frames keyframes no song orb',
      examples: ['/scene-timeline', '/scene-timeline length 20', '/scene-timeline go f120', '/scene-timeline snap'],
      complete: (a) => [{ value: 'length 10', hint: 'seconds (no song)' }, { value: 'length 20', hint: 'seconds (no song)' }, { value: 'go 0', hint: 'a time (s, m:ss) or a frame (f120)' }, { value: 'play' }, { value: 'pause' }, { value: 'snap', hint: 'keyframes and cues to the song\'s bars' }].filter((x) => x.value.startsWith(String(a || '').trim().toLowerCase().split(' ')[0] || '')),
      run: async (args) => {
        const c = await ThreeLab.cmd({ show: false });
        for (let i = 0; i < 50 && !lab(); i += 1) await new Promise((r) => setTimeout(r, 100));
        const S = lab(); const d = ThreeLab.director;
        if (!S || !d) return 'The Lab did not load.';
        const P = c.player || d.media;
        const id = S.currentId();
        const [sub, ...rest] = String(args || '').trim().split(/\s+/);
        const v = rest.join(' ');
        const verb = (sub || '').toLowerCase();
        if (verb === 'length') {
          const n = Number.parseFloat(v);
          if (!(n >= 1 && n <= 600)) return 'A length in seconds, 1 to 600: /scene-timeline length 20';
          if (S.songOf(id)) return `This scene plays on its song (${S.songOf(id).split(/[\\/]/).pop()}): its timeline is the song. Its own timeline comes back when you take the song out.`;
          S.setTimeline(id, { ...(S.timelineOf(id) || { fps: 30 }), len: n });
          return `⏱ The scene's timeline is ${n} s now (its keyframes stay where they are).`;
        }
        if (!P.loaded) d.ensureTimeline();
        if (verb === 'go') {
          const f = /^f(\d+)$/i.exec(v) || /^(\d+)f$/i.exec(v);
          const fps = P.clock?.fps || 30;
          const m = /^(\d+):(\d+(?:\.\d+)?)$/.exec(v);
          const t = f ? Number(f[1]) / fps : m ? Number(m[1]) * 60 + Number(m[2]) : Number.parseFloat(v);
          if (!Number.isFinite(t)) return 'Go where? A time (4.5, 0:04.5) or a frame (f120).';
          P.seek(t);
          return `⏱ ${fmtS(P.time)}${P.clock ? ` · f${P.clock.frame}` : ''}`;
        }
        if (verb === 'play' || verb === 'pause') { P.toggle(verb === 'play'); return verb === 'play' ? '▶ Playing the scene\'s timeline' : '⏸ Paused'; }
        if (verb === 'snap') {
          const r = d.snapToBars();
          return r ? `✦ ${r.keys} keyframes and ${r.cues} cues on the song's ${r.unit}s (/undo-… : the toast's Undo, or Ctrl+Z for the cues)` : 'No song with bars on this scene: snapping needs one (🎵 loads a song; keyframes keep their seconds).';
        }
        if (verb) return 'Use /scene-timeline, /scene-timeline length <s>, go <time|f120>, play, pause or snap.';
        const tl = d.timeline();
        const keys = (tl.layers || []).reduce((n, L) => n + Object.values(L.keyframes || {}).reduce((m, ks) => m + ks.length, 0), 0);
        const seq = typeof ThreeSeq !== 'undefined' ? ThreeSeq.summaryFor?.(id) : null;
        const song = S.songOf(id);
        const own = P.clock;
        return `⏱ **${S.get(id)?.name}** · ${song ? `on its song ${song.split(/[\\/]/).pop()} (${fmtS(tl.duration)}, ${Math.round(tl.grid?.bpm || 0)} BPM)` : own ? `its own timeline: ${tl.duration} s at ${own.fps} fps, frame ${own.frame} of ${own.frames} (no song: nothing reacts to music)` : 'no timeline yet'} · ${keys} keyframe${keys === 1 ? '' : 's'} · ${tl.cues?.length || 0} cue${tl.cues?.length === 1 ? '' : 's'}${seq ? ` · ▤ its sequence: ${seq.clips} clip${seq.clips === 1 ? '' : 's'}, ${seq.seconds.toFixed(1)} s` : ''}`;
      },
    });
  }

  return {
    identity, linkOf, ownerOf, link, unlink, relink, routeThree, glyphFor, sync, paintAll, starter,
    // comp-dispatch.js: a chat (made in the background) gets a fresh scene of its own, in its color, not opened
    fresh(chatId) { const sk = freshScene(chatId); link(chatId, sk.id, { rename: false }); data.links[chatId].auto = sk.name; save(); return sk; },
    // scene stills: the row picture of a chat (jam rounds and backstage edits refresh it), and the switch's fade
    setThumb, thumbOf, openScene, markToast, noteTitle,
    // tools/three.js at start: the sketch of the chat on screen, if it owns one (else null)
    startSketch(ids) { const a = threeAgent(); const sk = a && loaded ? data.links[H.activeChat[a.id]]?.sketch : null; return sk && ids.includes(sk) ? sk : null; },
    // jam.js: who works on a chat's scene while a jam runs (['claude', 'codex'], and which one is at it now: its
    // avatar glows), null when it ends
    setWorkers(chatId, list, active = null) {
      if (!chatId) return;
      const was = workers.get(chatId);
      if (list?.length) { if (was?.active === active && String(was.list) === String(list)) return; workers.set(chatId, { list: [...list], active }); } else if (!was) return; else workers.delete(chatId);
      paintAll();
    },
    workers: (chatId) => workers.get(chatId) || null,
    lastSnap: () => lastSnap,
    data: () => data,
  };
})();
