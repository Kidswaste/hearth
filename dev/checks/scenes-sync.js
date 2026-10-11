// Scenes and chat links that arrive from the other computer (cloud sync) join the ones in memory instead of being
// overwritten: a new scene appears in the Lab, a chat made there finds its scene, a newer version of a scene replaces
// the old one, and a chat whose scene was replaced by a starter while it was on its way gets it back.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/scenes-sync.js --shot /tmp/scenes-sync.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const fail = []; const out = {};
const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const arrive = (...rels) => window.dispatchEvent(new CustomEvent('hearth:synced', { detail: { files: rels.map((rel) => ({ rel, kind: 'kv' })) } }));
try {
  const C = H.claudeAgent(); activate(C.id);
  await Commands.tryRun('/director-setup', C.id); await wait(1500);
  await until(() => H.agents().some((a) => a.dock === 'three'));
  const dir = H.agents().find((a) => a.dock === 'three');
  await ThreeLab.cmd(); await until(() => ThreeLab.scenes?.all?.().length, 10000);
  const S = ThreeLab.scenes;
  const code = S.get(S.currentId()).code;

  // 1. a scene made on the other computer + its chat's link
  const disk = await window.hub.kvGet('three-sketches', []);
  disk.push({ id: 'sOther1', name: 'Neon Rose', code, updatedAt: Date.now() });
  await window.hub.kvSet('three-sketches', disk);
  const cs = await window.hub.kvGet('chat-scenes', { links: {}, videos: {}, idents: {} });
  cs.links.chatFromMac = { sketch: 'sOther1', auto: '', at: Date.now() };
  await window.hub.kvSet('chat-scenes', cs);
  arrive('kv/three-sketches.json', 'kv/chat-scenes.json');
  ok(await until(() => S.get('sOther1'), 4000), 'the new scene joins the Lab');
  ok(await until(() => ChatScenes.linkOf('chatFromMac') === 'sOther1', 4000), 'and its chat finds it');

  // 2. a newer version of a scene that isn't on screen replaces the old one
  const d2 = await window.hub.kvGet('three-sketches', []);
  const o = d2.find((x) => x.id === 'sOther1'); o.name = 'Neon Rose v2'; o.updatedAt = Date.now() + 1000;
  await window.hub.kvSet('three-sketches', d2); arrive('kv/three-sketches.json');
  ok(await until(() => S.get('sOther1')?.name === 'Neon Rose v2', 4000), 'a newer version replaces it');

  // 3. a scene deleted here doesn't come back by itself; one linked but not here yet isn't taken for deleted
  ok(!S.wasDeleted('sOther1') && S.wasDeleted('nope') === false, 'wasDeleted knows deleted from not arrived');

  // 4. a chat whose scene was replaced by a starter while it was on its way gets it back
  Native.newChat(dir.id); await wait(300);
  await Native.send(dir.id, 'hello'); await until(() => !Native.isBusy(H.activeChat[dir.id]), 20000); await wait(500);
  const chatId = H.activeChat[dir.id];
  const starter = ChatScenes.linkOf(chatId);
  ok(starter, `the new chat has its starter (${starter})`);
  const cs2 = await window.hub.kvGet('chat-scenes', {});
  ChatScenes.link(chatId, starter); // (as when the link was replaced while the original was away)
  const internal = (await window.hub.kvGet('chat-scenes', {})).links?.[chatId];
  out.link = internal;
  // simulate: the chat's link had pointed at sAway, the starter replaced it
  ChatScenes._data.links[chatId] = { sketch: starter, auto: '', at: Date.now(), lost: 'sAway' };
  const d3 = await window.hub.kvGet('three-sketches', []);
  d3.push({ id: 'sAway', name: 'Away scene', code, updatedAt: Date.now() });
  await window.hub.kvSet('three-sketches', d3); arrive('kv/three-sketches.json');
  ok(await until(() => ChatScenes.linkOf(chatId) === 'sAway', 5000), `the original came back to its chat (${ChatScenes.linkOf(chatId)})`);
  ok(await until(() => S.currentId() === 'sAway', 5000), 'and is on screen');
} catch (err) { fail.push(`threw: ${err.message}`); }
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
