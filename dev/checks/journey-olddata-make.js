// Journey 5, part 1: runs INSIDE THE OLD APP (the commit before the night build) to make a realistic data/ folder the
// way the owner had it: Forgeheart theme, Claude / Astra chats (thinking, code, a remembered fact, a pinned and a
// renamed chat), the docked Three Director and Video Director with chats, Lab sketches + slider looks + a song's
// beat map, video notes, settings. dev/journey-upgrade.sh drives the whole thing; by hand:
//   git archive a8442ba | tar -x -C /tmp/old && cp dev/smoke.js /tmp/old/dev/ (+ dev/fake-*.js)
//   node /tmp/old/dev/smoke.js --fake-engines --keep --script dev/checks/journey-olddata-make.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = {};
// the owner's agents: the two directors, docked in their tools
const add = (a) => { if (!H.config.agents.some((x) => x.id === a.id)) H.config.agents.push(a); };
add({ id: 'threedirector', name: 'Three Director', icon: '◆', color: '#7c5cff', mode: 'native', engine: 'claude', dock: 'three', threeTools: true, selfReview: true });
add({ id: 'videodirector', name: 'Video Director', icon: '▶', color: '#ff7a59', mode: 'native', engine: 'claude', dock: 'ae', videoTools: true });
// Forgeheart (the old preset), a font size, an engine path setting
H.config.theme = { ...H.config.theme, scheme: 'dark', skin: 'forge', background: '#0b0e10', sidebar: '#111518', text: '#eae0d5', accent: '#ffd75e', font: "'FH Oxanium', 'Segoe UI', sans-serif", preset: 'forgeheart' };
H.config.settings = { ...H.config.settings, videoDirs: [window.OLD_VIDS || '/tmp/hearth-test-videos'], fontSize: 14 };
await saveConfig(); await wait(2500);
out.agents = H.agents().map((a) => a.id);
// memory
const mem = await window.hub.getMemory();
await window.hub.saveMemory({ ...mem, shared: `${mem.shared || ''}The owner makes music-driven Three.js visuals.`.trim(), agents: { ...(mem.agents || {}), claude: 'Prefers short answers.' } });
// chats
const C = H.claudeAgent();
const A = H.agents().find((a) => a.engine === 'codex');
const say = async (id, text) => { await Native.send(id, text); await wait(300); await until(() => !Native.isBusy(H.activeChat[id]), 60000); };
activate(C.id); await wait(300);
Native.newChat(C.id); await say(C.id, 'think code a spinning cube please');
await say(C.id, 'table remember compare two shaders');
const firstChat = H.activeChat[C.id];
Native.newChat(C.id); await say(C.id, 'long write me a story');
await Native.rename?.(H.activeChat[C.id], 'Story time');
await Native.togglePin?.(firstChat);
activate(A.id); await wait(300);
Native.newChat(A.id); await say(A.id, 'think hello astra code');
// the directors' chats
activate('tool:three'); await wait(4000);
Native.newChat('threedirector'); await say('threedirector', 'tool make it pulse on the kick');
activate('tool:ae'); await wait(2500);
Native.newChat('videodirector'); await say('videodirector', 'hello director');
// Lab data: a song's beat map and per-sketch extras, the way the Lab stored them
const song = window.OLD_SONG || '/tmp/hearth-test-song.wav';
await window.hub.kvSet('three-beatmaps', { [song]: { grid: { bpm: 120, anchor: 0.02, bpb: 4 }, marks: { kick: [0.02, 0.52, 1.02, 1.52], snare: [0.52, 1.52], hit: [8.02] } } });
activate('tool:three'); await wait(1500);
out.kv = await window.hub.kvGet('three-sketches').then((s) => (s ? Object.keys(s).length || s.length : null)).catch(() => null);
// video notes (the shape Video Review kept)
await window.hub.kvSet('video-notes', { [`${H.config.settings.videoDirs[0]}/neon_tunnel_v1.mp4`]: [{ id: 'n1', t: 1.2, text: 'Flash too strong here', done: false, at: Date.now() }] });
out.chats = (await window.hub.listChats?.())?.length;
out.ok = true;
return JSON.stringify(out);
