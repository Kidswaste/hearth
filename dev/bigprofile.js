#!/usr/bin/env node
// (round 70, bigprofile70) A HEAVY made-up profile like the owner's after months of daily use, for the lag hunt
// (dev/checks/bigprofile70.js) and by hand. Never real data: everything is made up here (fixed seed), written into a
// throwaway folder that `node dev/smoke.js --data <dir>` copies into its own app copy. What it holds:
//   · 1,500 chats over two years (dev/make-chatlist-fixture.js: folders, tags, pins, archived), 120 of them LONG
//     (250–900 messages: Markdown, code, tables, thinking, token usage, pictures attached with their files), .prev
//     copies of a third, 150 chats in the trash, bookmarks / snippets
//   · Sidequest's journal (kv quest-journal, built with Codex's own QuestCore and checked by its validate()): the Paris
//     map full (100 places, the guide in), 60 campaigns, 220 side quests, ~300 finished with a journal note, ideas,
//     rewards and redemptions, streak bonus weeks
//   · 50 Lab scenes (kv three-sketches: 2–4 layers of real-sized code each) and their history
//   · the shows: data/showsync (both Paris sources with 600 shows over the coming weeks, venues geocoded, followed
//     artists / venues), a show log of 120 nights (kv show-nights) and 40 prepared, 80 shows with tickets (data/tickets,
//     real small files), 60 leave reminders (data/leavesoon)
//   · My Paris photos: 400 photos (copies + thumbs in data/paris-photos/<month>/, kv paris-photos) on the map's places
//   · 200 music sessions (kv music-sessions), the Sound bank index (6,000 presets), creative sketches on disk
//   · a year of feature-usage, 400 days of token stats, a 4,000-line work journal, 800 attachments
// Sync with the other computer is switched on by the check (into its own scratch cloud folder): the first pass and
// then the minute-by-minute passes are part of what it measures.
//   node dev/bigprofile.js [dir] [--chats 1500] [--long 120] [--projects 40]      (default /tmp/hearth-bigprofile70)
//   (round 72) --projects N adds N projects with their chats, scenes, moodboards and desks (addProjects below)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const { make } = require('./make-chatlist-fixture');

function bigprofile(dir = '/tmp/hearth-bigprofile70', { chats = 1500, long = 120, seed = 70, projects = 0 } = {}) {
  const base = make(dir, chats, seed);
  let s = (seed * 7919) >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[int(0, 15)]).join('');
  const b36 = (n) => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[int(0, 35)]).join('');
  const now = Date.now(); const DAY = 864e5;
  const iso = (t) => new Date(t).toISOString();
  const W = (f) => path.join(dir, f);
  const mk = (d) => fs.mkdirSync(W(d), { recursive: true });
  const json = (f, v) => { mk(path.dirname(f)); fs.writeFileSync(W(f), JSON.stringify(v)); };
  const out = { dir, chats };

  // ---------- attachments (pictures pasted into chats, frame grabs, dropped files) ----------
  mk('attachments');
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20 * 1024, 9), Buffer.from([0xff, 0xd9])]);
  const attach = [];
  for (let i = 0; i < 800; i++) { const n = `img-${i}-${b36(6)}.png`; fs.writeFileSync(W(`attachments/${n}`), jpg); attach.push(n); }
  out.attachments = attach.length;

  // ---------- long chats: months of director / Lab / music chats ----------
  const WORDS = 'orb particles bloom kick snare intro logo shader noise flow glitch neon chrome glass ember forge spark title beat drop bass synth camera orbit loop palette vinyl poster grain fog rain city night ocean tunnel portal crystal liquid smoke galaxy ribbon terrain ascii kinetic mask sequence render export reel Serum Vital Paris show quest'.split(' ');
  const sentence = (n) => Array.from({ length: n }, () => pick(WORDS)).join(' ');
  const reply = (k) => {
    const parts = [`Here is **${sentence(3)}** with \`${pick(WORDS)}\`.`, '', `- ${sentence(8)}`, `- ${sentence(10)}`, `- ${sentence(6)}`, '', sentence(40 + int(0, 80))];
    if (k % 5 === 1) parts.push('', '```js', ...Array.from({ length: int(6, 40) }, (_, j) => `const v${j} = ${pick(WORDS).length * j}; // ${sentence(4)}`), '```');
    if (k % 11 === 3) parts.push('', '| part | value | note |', '|---|---|---|', ...Array.from({ length: int(3, 12) }, (_, j) => `| ${pick(WORDS)} | ${j * 3} | ${sentence(4)} |`));
    return parts.join('\n');
  };
  const chatDir = W('chats'); const longIds = [];
  for (let i = 0; i < long; i++) {
    const agentId = i % 5 === 4 ? 'astra' : 'claude'; const id = `${agentId}-long${i}`; const at = now - Math.pow(i / long, 1.6) * 200 * DAY;
    const n = int(250, 900); const messages = [];
    for (let k = 0; k < n; k++) {
      const t = at - (n - k) * int(20, 300) * 1e3;
      if (k % 2 === 0) {
        const m = { role: 'user', text: `${sentence(int(5, 30))}?`, at: t };
        if (rnd() < 0.08) { const imgs = Array.from({ length: int(1, 3) }, () => path.join('data', 'attachments', pick(attach))); m.attachments = imgs.map((p) => ({ kind: 'image', name: path.basename(p) })); m.images = imgs; m.sent = m.text; }
        messages.push(m);
      } else {
        const m = { role: 'assistant', text: reply(k), at: t, usage: { input: int(800, 9000), output: int(200, 3000), cacheRead: int(0, 40000), cacheWrite: int(0, 4000) }, model: agentId === 'astra' ? 'gpt-5-codex' : 'claude-opus' };
        if (rnd() < 0.2) { m.thinking = sentence(int(20, 120)); m.thinkMs = int(800, 9000); }
        if (rnd() < 0.15) m.tools = Array.from({ length: int(1, 6) }, () => pick(['three_set', 'three_layer', 'Read', 'Edit', 'mcp__hearth__quest_add', 'mcp__hearth__board_add']));
        messages.push(m);
      }
    }
    const chat = { id, agentId, title: `${pick(['Intro reel', 'Lab: ', 'Clink level', 'Track idea', 'Show poster', 'Paris walk'])} ${sentence(2)} (long ${i})`, createdAt: messages[0].at, updatedAt: messages.at(-1).at, messages };
    if (i < 6) chat.pinned = true;
    fs.writeFileSync(path.join(chatDir, `${id}.json`), JSON.stringify(chat));
    longIds.push(id);
  }
  out.long = long;
  // .prev copies (every save keeps one) and the trash
  const names = fs.readdirSync(chatDir);
  names.forEach((n, i) => { if (i % 3 === 0) fs.copyFileSync(path.join(chatDir, n), path.join(chatDir, n.replace(/\.json$/, '.prev.json'))); });
  mk('trash'); names.slice(0, 150).forEach((n) => fs.copyFileSync(path.join(chatDir, n), W(`trash/x${n}`)));
  json('kv/chat-bookmarks.json', Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`${pick(longIds)}:${i}`, { at: now - i * 1e6, note: `mark ${i}` }])));
  json('kv/chat-snippets.json', Array.from({ length: 120 }, (_, i) => ({ id: `sn${i}`, title: `Snippet ${i}`, text: sentence(40), at: now - i * DAY })));

  // ---------- Sidequest's journal (Codex's QuestCore: built and validated as the app would) ----------
  const C = require(path.join(ROOT, 'tools', 'quest-core'));
  const P = require(path.join(ROOT, 'tools', 'quest-paris'));
  const q = C.upgrade(C.initial());
  q.atlas.places = [];
  const kinds = C.mapKinds.map((k) => k.id);
  for (let i = 0; i < 34; i++) C.savePlace(q, { name: `My spot ${i}`, lat: 48.835 + (i % 10) * 0.006, lon: 2.30 + Math.floor(i / 10) * 0.025 + (i % 3) * 0.002, kind: kinds[i % kinds.length], quest: `Go back and ${sentence(4)}.` });
  P.addGuide(q);
  q.atlas.places.forEach((p, i) => { if (i % 2 === 0) p.visitedAt = iso(now - i * 3 * DAY); if (i % 6 === 0) p.favorite = true; });
  const paths = C.paths.map((p) => p.id);
  const quest = (id, i) => ({ id, title: `${pick(['Make', 'Finish', 'Try', 'Visit', 'Record', 'Sketch'])} ${sentence(3)}`, done: `Done when ${sentence(8)}.`, tiny: `Open it and ${sentence(4)}.`, deep: sentence(30), minutes: pick([5, 15, 30, 45, 60]), xp: pick([10, 15, 25, 40]), tool: pick([null, 'lab', 'sounds', 'tiles', null]) });
  while (q.campaigns.length < 60) { const c = q.campaigns.length; q.campaigns.push({ id: `c-bp-${c}`, title: `Campaign ${c}: ${sentence(2)}`, subtitle: 'MADE UP / BIGPROFILE', path: pick(paths), badge: `Badge ${c}`, why: sentence(14), quests: Array.from({ length: int(3, 8) }, (_, k) => quest(`q-bp-${c}-${k}`)) }); }
  for (let i = 0; i < 220; i++) q.sideQuests.push({ ...quest(`q-side-bp-${i}`), path: pick(paths) });
  const all = C.allQuests(q).map((x) => x.id); let finished = 0;
  for (const id of all) {
    const r = rnd();
    if (r < 0.55) { const t = now - int(1, 200) * DAY; q.records[id] = { startedAt: iso(t - 3600e3), completedAt: iso(t), note: `${sentence(int(10, 60))}.`, ...(rnd() < 0.3 ? { artifact: { label: `${pick(WORDS)}.png`, path: `C:/Users/you/Pictures/${b36(8)}.png`, kind: 'image' } } : {}) }; finished += 1; }
    else if (r < 0.65) q.records[id] = { startedAt: iso(now - int(1, 30) * DAY) };
  }
  q.ideas = Array.from({ length: 60 }, (_, i) => ({ id: `idea-bp-${i}`, title: `Idea ${i}: ${sentence(3)}`, goal: sentence(10), path: pick(paths), minutes: pick([5, 15, 30]), createdAt: iso(now - i * DAY) }));
  const checked = C.validate(q);
  json('kv/quest-journal.json', checked);
  json('kv/quest-journal-before-restore.json', checked);
  out.quests = { campaigns: checked.campaigns.length, sideQuests: checked.sideQuests.length, finished, places: checked.atlas.places.length, bytes: fs.statSync(W('kv/quest-journal.json')).size };

  // ---------- Lab scenes ----------
  const code = (i, l) => `import * as THREE from 'three';\n// scene ${i} layer ${l}\n${Array.from({ length: int(150, 450) }, (_, k) => `const v${k} = ${(k * 0.37).toFixed(2)}; // knob ${k} ${pick(WORDS)}`).join('\n')}\nconst scene = new THREE.Scene();\nexport default scene;\n`;
  const sketches = Array.from({ length: 50 }, (_, i) => { const layers = Array.from({ length: int(2, 4) }, (_, l) => ({ id: l ? `l${l}` : 'main', name: l ? `Layer ${l}` : 'Main', code: code(i, l), slot: l, visible: true, opacity: 1 })); return { id: `sk${i}`, name: `Scene ${i}: ${sentence(2)}`, code: layers[0].code, updatedAt: now - i * 2 * DAY, layers }; });
  json('kv/three-sketches.json', sketches);
  json('kv/three-history.json', Object.fromEntries(sketches.slice(0, 20).map((k) => [k.id, Array.from({ length: 20 }, (_, j) => ({ at: now - j * 3600e3, code: k.code.slice(0, 4000) }))])));
  out.labScenes = sketches.length;

  // ---------- the shows ----------
  const S = require(path.join(ROOT, 'showsync-core'));
  const VENUES = ['La Cigale', 'Le Trabendo', 'La Machine du Moulin Rouge', 'Rex Club', 'Le Bataclan', 'La Maroquinerie', 'Petit Bain', 'Badaboum', 'Le Pop-Up du Label', 'La Gaîté Lyrique', 'Supersonic', 'New Morning', 'Le Point Éphémère', 'Le Klub', 'La Bellevilloise', 'Glazart', 'Concrete', 'Le Djoon', 'Dehors Brut', 'Le Chinois'];
  const venue = (k) => ({ key: VENUES[k].toLowerCase().replace(/[^a-z0-9]+/g, '-'), name: VENUES[k], address: `${int(1, 200)} rue ${pick(WORDS)}, 750${String(int(1, 20)).padStart(2, '0')} Paris`, lat: 48.83 + (k % 7) * 0.008, lon: 2.30 + Math.floor(k / 7) * 0.03, image: '' });
  const showsOf = (src, n) => Array.from({ length: n }, (_, i) => { const t0 = new Date(now + int(-2, 40) * DAY); t0.setHours(int(19, 23), 0, 0, 0); const v = venue(int(0, VENUES.length - 1)); const id = `${src.platform}-${hex(10)}`; return { id, key: hex(12), title: `${sentence(2)} · ${pick(['live', 'club night', 'release party', 'DJ set'])}`, start: t0.getTime(), end: null, doors: null, dateOnly: false, cancelled: false, venue: v, platform: src.platform, url: `https://${src.platform}.example/e/${id}`, price: `${int(10, 40)} €`, soldOut: rnd() < 0.1, lineup: Array.from({ length: int(1, 5) }, () => sentence(2)), links: {} }; });
  const srcs = S.defaultSources(); const cache = S.emptyCache(); cache.refreshedAt = now - 3 * 3600e3;
  for (const src of srcs) cache.sources[src.id] = { id: src.id, platform: src.platform, url: src.url, label: src.label, kind: src.kind, shows: showsOf(src, 300), lastOk: now - 3 * 3600e3, lastTry: now - 3 * 3600e3, via: 'html', problem: null };
  const follows = Array.from({ length: 25 }, (_, i) => ({ id: `follow-bp-${i}`, platform: 'shotgun', kind: i % 3 ? 'artist' : 'venue', url: `https://shotgun.live/en/artists/bp-${i}`, label: `Artist ${i}` }));
  json('showsync/settings.json', { v: 1, enabled: true, from: 'paris', follows });
  json('showsync/cache.json', cache);
  json('showsync/geo.json', Object.fromEntries(VENUES.map((_, k) => { const v = venue(k); return [v.address, { lat: v.lat, lon: v.lon, at: now - 30 * DAY }]; })));
  json('showsync/logos.json', {});
  const allShows = Object.values(cache.sources).flatMap((x) => x.shows);
  const PC = require(path.join(ROOT, 'showprep-core'));
  const went = allShows.slice(0, 120).map((x, i) => ({ show: { ...x, start: now - (i + 1) * 3 * DAY }, rating: int(1, 5), moment: `${sentence(int(4, 14))}.`, at: iso(now - (i + 1) * 3 * DAY + 5 * 3600e3) }));
  const prep = Object.fromEntries(allShows.slice(120, 160).map((x) => [x.key, { show: x, remind: true, at: iso(now - DAY) }]));
  const nights = PC.validate({ v: 1, went: went.map((e) => PC.entry(e, e.at)), prep });
  json('kv/show-nights.json', nights);
  // tickets (a PDF / picture per show, real small files)
  const TC = require(path.join(ROOT, 'tickets-core'));
  const tix = TC.empty();
  for (const x of allShows.slice(160, 240)) {
    const id = b36(10); const file = `${id}-ticket.pdf`; mk(`tickets/${x.key}`); fs.writeFileSync(W(`tickets/${x.key}/${file}`), Buffer.from(`%PDF-1.4\n% made-up ticket ${x.title}\n${'x'.repeat(3000)}\n%%EOF\n`));
    TC.addFile(tix, x, { id, name: `${x.title}.pdf`, file, kind: 'pdf', bytes: 3040, sha: hex(64), addedAt: iso(now - int(1, 20) * DAY), from: 'downloads' });
  }
  json('tickets/index.json', TC.validate(tix));
  // leave reminders
  const LC = require(path.join(ROOT, 'leavesoon-core'));
  const rem = { v: 1, items: allShows.slice(240, 300).map((x, i) => { const target = now + (i - 10) * 6 * 3600e3; return { key: `show:${x.key}`, kind: 'show', title: x.title, place: { name: x.venue.name, lat: x.venue.lat, lon: x.venue.lon }, targetAt: target, words: 'doors', travel: { mode: 'metro', min: 25, text: '25 min by Métro', how: 'Line 2' }, from: 'Home', origin: '', leaveAt: target - 35 * 60e3, notifyAt: target - 45 * 60e3, state: i < 10 ? 'fired' : 'on', ref: { show: x.key }, createdAt: now - DAY }; }) };
  json('leavesoon/reminders.json', LC.validate(rem));
  out.shows = { cached: allShows.length, went: nights.went.length, tickets: Object.keys(tix.shows).length, reminders: rem.items.length };

  // ---------- My Paris photos ----------
  const PP = require(path.join(ROOT, 'tools', 'parisphotos-core'));
  const photos = [];
  const thumb = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(6 * 1024, 3), Buffer.from([0xff, 0xd9])]);
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60 * 1024, 5), Buffer.from([0xff, 0xd9])]);
  for (let i = 0; i < 400; i++) {
    const t = now - int(1, 300) * DAY; const month = iso(t).slice(0, 7); const id = `ph-${b36(10)}`;
    mk(`paris-photos/${month}`); fs.writeFileSync(W(`paris-photos/${month}/${id}.jpg`), big); fs.writeFileSync(W(`paris-photos/${month}/${id}.thumb.jpg`), thumb);
    photos.push({ id, moment: pick(checked.atlas.places).id, file: `paris-photos/${month}/${id}.jpg`, thumb: `paris-photos/${month}/${id}.thumb.jpg`, w: 2048, h: 1536, taken: iso(t), takenFrom: 'offset', name: `IMG_${1000 + i}.HEIC`, source: `C:/Users/you/Pictures/iPhone/IMG_${1000 + i}.HEIC`, hash: hex(64), addedAt: iso(t + 3600e3) });
  }
  json('kv/paris-photos.json', PP.validate({ v: 1, photos }));
  out.photos = photos.length;

  // ---------- music: sessions, the Sound bank, sketches on disk ----------
  const BC = require(path.join(ROOT, 'tools', 'bouncelog-core'));
  mk('creative-sketches/Sound desk');
  const wav = Buffer.alloc(32 * 1024, 0);
  const sessions = Array.from({ length: 200 }, (_, i) => { const t = now - i * 1.3 * DAY; const sk = Array.from({ length: int(0, 4) }, (_, k) => { const p = W(`creative-sketches/Sound desk/Sketch bp ${i}-${k}.wav`); fs.writeFileSync(p, wav); return { path: p, at: iso(t + k * 600e3), seconds: int(4, 60) }; }); return { id: `ses-bp-${i}`, start: iso(t), end: iso(t + int(10, 180) * 60e3), minutes: int(10, 180), used: { park: rnd() < 0.2, liveset: rnd() < 0.3, arrange: rnd() < 0.2 }, instruments: [pick(['Serum 2', 'Vital'])], place: rnd() < 0.2 ? 'Parc des Buttes-Chaumont' : '', sketches: sk, logged: null, bpm: int(80, 140) }; });
  json('kv/music-sessions.json', BC.validate({ v: 1, sessions }));
  const presets = {}; for (let i = 0; i < 6000; i++) presets[`p${i}`] = { id: `p${i}`, name: `Preset ${i}`, plugin: i % 2 ? 'Vital' : 'Serum 2', path: `C:/Users/you/Documents/Vital/Factory/Preset ${i}.vital`, tags: ['bass', 'pad'], features: Array.from({ length: 16 }, (_, k) => ((i * k) % 97) / 97) };
  json('creative-vst/soundbank/index.json', { v: 1, presets, banks: {}, settings: {} });
  out.sessions = sessions.length;

  // ---------- months of use: feature usage, token stats, the work journal ----------
  const items = {}; for (let i = 0; i < 4000; i++) items[`Area ${i % 40} › Button ${i}`] = { n: 1 + (i % 50), first: now - 300 * DAY, last: now - (i % 90) * DAY };
  const udays = {}; for (let d = 0; d < 365; d++) udays[iso(now - d * DAY).slice(0, 10)] = Object.fromEntries(Array.from({ length: 60 }, (_, j) => [`Area ${j % 40} › Button ${(d * 7 + j) % 4000}`, 1 + (j % 5)]));
  json('kv/ui-usage.json', { since: now - 365 * DAY, items, days: udays, hidden: [] });
  const tdays = {}; for (let d = 0; d < 400; d++) tdays[iso(now - d * DAY).slice(0, 10)] = { a: { claude: { i: 9000, o: 2000, r: 12 }, astra: { i: 4000, o: 900, r: 5 } }, m: {}, t: {}, h: {} };
  json('kv/token-stats.json', { v: 1, since: now - 400 * DAY, backfilledAt: now - 300 * DAY, days: tdays, chats: {} });
  json('safetynet/journal.json', Array.from({ length: 4000 }, (_, i) => ({ at: now - i * 6e4, what: `edit ${i}`, file: `notes/${i}.md` })));
  json('kv/notes.json', Array.from({ length: 150 }, (_, i) => ({ id: `n${i}`, title: `Note ${i}`, text: sentence(80), at: now - i * DAY })));
  if (projects) Object.assign(out, addProjects(dir, { count: projects, sketches, longIds, sentence, int, pick, now, DAY, W, mk, json, rnd }));
  return out;
}

// (round 72, projects72) projects on top of the heavy profile, like the owner's after months of Codex's workspaces:
// each project has its own chat (a native agent), its scene (one of the 50 Lab scenes), its moodboard and its desk.
//   · project 0 "Clink" is the heavy one: a 700-message chat, 14 related long chats, 4 scenes, 3 boards, 400 files
//     (half on disk, half "not arrived from the other computer"), 220 captures and 120 renders, 3,800 characters of notes
//   · projects 1–2 are medium (a 400-message chat, 6 related chats, 120 files), the rest small (40–120 messages)
//   · "Not arrived: scene" links a scene that isn't on this computer; "Not arrived: chat" a chat that isn't
//   · 2 archived and 3 paused projects; device-local return points are left to the app (localStorage)
function addProjects(dir, { count, sketches, longIds, sentence, int, pick, now, DAY, W, mk, json, rnd }) {
  const chatDir = W('chats');
  // the scenes draw for real (a renderer per layer, meshes, sliders), like the owner's: a scene that never renders
  // waits out the sandbox's 700 ms "nothing drew" fallback and would make every open look slow. Light on purpose: the
  // test machine draws with software GL (SwiftShader), where a heavy scene's own GPU work would hide Hearth's
  // Each layer says when its own code starts (a 'fixture-layer-start' message to the window): dev/checks/projects72.js
  // counts from there to the page's 'stack-drawn' as the scene's own work, apart from Hearth's
  const draw = (l) => `\ntry { parent.postMessage({ type: 'fixture-layer-start', at: Date.now() }, '*'); } catch { /* a page without a parent */ }\nconst P${l} = tweak({ spin: { value: 0.5, min: -2, max: 2, label: 'Spin' }, size: { value: 1, min: 0.2, max: 3, label: 'Size' }, tint: { value: '#${['ff9866', '7a5cff', '56c6ff', 'c8f04a'][l % 4]}', label: 'Tint', group: 'Color' } });\nconst renderer = new THREE.WebGLRenderer({ alpha: ${l ? 'true' : 'false'} });\nrenderer.setSize(innerWidth, innerHeight);\ndocument.body.append(renderer.domElement);\nconst camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);\ncamera.position.z = 5;\nconst meshes = Array.from({ length: 6 }, (_, i) => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 1), new THREE.MeshBasicMaterial({ color: P${l}.tint, wireframe: true })); m.position.set((i % 3) - 1, Math.floor(i / 3) - 0.5, -${l}); scene.add(m); return m; });\nrenderer.setAnimationLoop((now, f60) => { for (const m of meshes) { m.rotation.y += 0.01 * P${l}.spin * (f60 || 1); m.scale.setScalar(P${l}.size); } renderer.render(scene, camera); });\n`;
  for (const s of sketches) { for (const L of s.layers) L.code = L.code.replace('export default scene;\n', draw(L.slot)); s.code = s.layers[0].code; }
  json('kv/three-sketches.json', sketches);
  const chatOf =(id, title, n, at) => {
    const messages = Array.from({ length: n }, (_, k) => (k % 2 === 0
      ? { role: 'user', text: `${sentence(int(5, 25))}?`, at: at - (n - k) * 90e3 }
      : { role: 'assistant', text: `Here is **${sentence(3)}**.\n\n- ${sentence(9)}\n- ${sentence(7)}\n\n${sentence(int(30, 90))}`, at: at - (n - k) * 90e3, usage: { input: 2000, output: 600 } }));
    fs.writeFileSync(path.join(chatDir, `${id}.json`), JSON.stringify({ id, agentId: 'claude', title, createdAt: messages[0]?.at || at, updatedAt: at, session: {}, messages }));
  };
  mk('workspace/projects');
  const files = (i, n) => Array.from({ length: n }, (_, k) => { const f = W(`workspace/projects/p${i}/${pick(['ref', 'take', 'sketch', 'poster', 'clip'])}-${k}.${pick(['png', 'wav', 'mp4', 'txt', 'blend'])}`); if (k % 2 === 0) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, 'x'); } return f; });
  const boards = { list: [], current: null, links: {}, prefs: {} };
  const list = []; const links = { links: {}, videos: {}, idents: {} };
  const ident = (i) => ({ ci: i % 8, gi: i % 12, color: ['#ffc23d', '#ff7a1a', '#a970ff', '#ff3d7f', '#56c6ff', '#7cd992', '#c8f04a', '#c9d3ff'][i % 8], glyph: ['◆', '▲', '●', '■', '★', '✦', '⬢', '✚', '❖', '✿', '♥', '♣'][i % 12] });
  for (let i = 0; i < count; i++) {
    const id = `pjbp${i}`; const at = now - i * 1.5 * DAY; const heavy = i === 0; const medium = i === 1 || i === 2;
    const name = i === 0 ? 'Clink' : i === count - 2 ? 'Not arrived: scene' : i === count - 1 ? 'Not arrived: chat' : `${pick(['Stoop', 'Neon', 'Ember', 'Glass', 'Orbit', 'Tunnel'])} ${pick(['Ronin', 'Reel', 'Poster', 'Loop', 'Drift', 'Tide'])} ${i}`;
    const chatId = i === count - 1 ? 'claude-project-notarrived' : `claude-project-${id}`;
    if (i !== count - 1) chatOf(chatId, name, heavy ? 700 : medium ? 400 : int(40, 120), at);
    const sceneId = i === count - 2 ? 'sk-not-arrived' : sketches[i % sketches.length].id;
    const boardId = `bdbp${i}`;
    const board = { id: boardId, name: `${name} · Moodboard`, created: at, updated: at, seq: 40, view: { x: 80, y: 80, z: 0.6 }, chats: [chatId], items: Array.from({ length: heavy ? 120 : 30 }, (_, k) => ({ id: `i${k}`, type: 'text', text: sentence(int(2, 12)), textStyle: 'clean', fs: 48, x: (k % 10) * 560, y: Math.floor(k / 10) * 160, w: 520, h: 110, rot: 0, added: at })) };
    json(`kv/board-${boardId}.json`, board);
    boards.list.push({ id: boardId, name: board.name, updated: at, count: board.items.length, chats: [chatId] });
    const items = [{ type: 'chat', ref: chatId, name }, { type: 'scene', ref: sceneId, name: sketches[i % sketches.length].name }, { type: 'board', ref: boardId, name: board.name }];
    const related = heavy ? 14 : medium ? 6 : int(0, 2);
    for (let r = 0; r < related; r++) { const c = longIds[(i * 7 + r) % longIds.length]; items.push({ type: 'chat', ref: c, name: '' }); if (r < 3) links.links[c] = { sketch: sketches[(i + r + 10) % sketches.length].id, auto: '', at }; }
    if (heavy) { for (const s of sketches.slice(40, 44)) items.push({ type: 'scene', ref: s.id, name: s.name }); for (const k of [1, 2]) { const b = `bdbp0x${k}`; json(`kv/board-${b}.json`, { ...board, id: b, name: `Clink · Board ${k}`, items: board.items.slice(0, 40) }); boards.list.push({ id: b, name: `Clink · Board ${k}`, updated: at, count: 40, chats: [] }); items.push({ type: 'board', ref: b, name: `Clink · Board ${k}` }); } }
    for (const f of files(i, heavy ? 400 : medium ? 120 : int(0, 12))) items.push({ type: 'file', ref: f, name: path.basename(f) });
    if (heavy) { for (let k = 0; k < 220; k++) items.push({ type: 'capture', ref: W(`captures/clink-${k}.png`), name: `clink-${k}.png` }); for (let k = 0; k < 120; k++) items.push({ type: 'render', ref: `rj-bp-${k}`, name: `Clink render ${k}` }); }
    links.links[chatId] = { sketch: sceneId, auto: '', at };
    const status = i >= count - 7 && i < count - 4 ? 'paused' : i >= count - 4 && i < count - 2 ? 'archived' : 'active';
    list.push({ id, name, ident: ident(i), status, notes: heavy ? sentence(700).slice(0, 3800) : sentence(int(0, 40)), from: 'hand', make: null, cover: null, at: at - 30 * DAY, updated: at, opened: at,
      items: items.map((x, k) => ({ id: `${x.type}:${x.ref}`, type: x.type, ref: x.ref, name: x.name, at: at - k * 6e4 })),
      workspace: { v: 1, persona: pick(['partner', 'director', 'builder']), plugins: [], description: rnd() < 0.5 ? sentence(20) : '', chatId, sceneId, boardId } });
  }
  boards.current = boards.list[0].id;
  json('kv/projects.json', { v: 1, list, dismissed: [] });
  json('kv/boards.json', boards);
  json('kv/chat-scenes.json', links);
  return { projects: list.length, projectItems: list.reduce((n, p) => n + p.items.length, 0) };
}

if (require.main === module) {
  const a = process.argv.slice(2); const o = (n, d) => { const i = a.indexOf(n); return i >= 0 ? Number(a[i + 1]) : d; };
  const dir = a.find((x, i) => !x.startsWith('--') && !/^--/.test(a[i - 1] || ''));
  const t0 = Date.now();
  const r = bigprofile(dir || undefined, { chats: o('--chats', 1500), long: o('--long', 120), projects: o('--projects', 0) });
  console.log(JSON.stringify({ ...r, ms: Date.now() - t0 }));
}
module.exports = { bigprofile, addProjects };
