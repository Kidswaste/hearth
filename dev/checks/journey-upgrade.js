// Journey 5: the first launch after `git pull`, on a data/ folder made by the app as it was before the night build
// (dev/fixtures/old-data, made by dev/checks/journey-olddata-make.js in the old app; it also holds that config.json
// with the old Forgeheart preset and the two docked directors, and a hearth-origin.json from another folder, so the
// moved-folder path fix runs too). Nothing may be lost, migrations must be sane, no errors.
//   node dev/smoke.js --fake-engines --data dev/fixtures/old-data --check-timeout 300000 --lib dev/checks/journey-lib.js --script dev/checks/journey-upgrade.js --shot /tmp/j5.png
const { wait, until, step, shot, visible } = J;
J.shotDir = window.JOURNEY_SHOTS || '/tmp';
await wait(1500);
// 1. config: agents, directors docked, the theme
const ids = H.agents().map((a) => a.id);
step('all four agents kept', ['claude', 'astra', 'threedirector', 'videodirector'].every((id) => ids.includes(id)), ids);
step('directors still docked (not in the rail)', H.agent('threedirector')?.dock === 'three' && H.agent('videodirector')?.dock === 'ae' && !document.querySelector('#agent-buttons [data-id="threedirector"]'));
const html = document.documentElement;
step('old Forgeheart preset → Forgeheart look', H.config.theme.preset && /forge/i.test(H.config.theme.preset) && html.dataset.skin === 'forge', { preset: H.config.theme.preset, skin: html.dataset.skin, look: html.dataset.look });
await shot('first-launch');

// 2. chats: all there, titles, pin, messages, usage
const list = await window.hub.listChats();
step('5 chats listed', list.length === 5, list.map((c) => `${c.agentId}:${c.title}${c.pinned ? ' 📌' : ''}`));
const story = list.find((c) => c.title === 'Story time');
const pinned = list.find((c) => c.pinned);
step('renamed + pinned chats kept', Boolean(story) && Boolean(pinned));
let msgs = 0; let withUsage = 0;
for (const c of list) { const full = await Native.load(c.id); msgs += full.messages.length; withUsage += full.messages.filter((m) => m.usage).length; }
step('every message loads (12) with its usage', msgs === 12 && withUsage === 6, { msgs, withUsage });
const panelItems = [...document.querySelectorAll('#panel .item')].filter(visible).map((n) => n.textContent.trim().slice(0, 40));
step('chats panel shows the chats', panelItems.length >= 3, panelItems.slice(0, 6));

// 3. memory, meter, usage
const mem = await window.hub.getMemory();
step('memory kept', /music-driven/.test(mem.shared) && /fake engines/.test(mem.agents?.claude || ''), mem);
const today = Meter._test.sumOf(Meter._test.dayKeys(30));
step('meter counts the old usage', today.i > 0 && today.o > 0, today);

// 4. an old chat resumes with a new message
const C = H.claudeAgent();
activate(C.id); await wait(300);
await Native.open?.(C.id, pinned.id);
await wait(500);
await Native.send(C.id, 'and one more thing');
await until(() => !Native.isBusy(pinned.id), 30000);
const after = await Native.load(pinned.id);
step('old chat continues (same engine session)', after.messages.length === 6 && after.session === (list.find((c) => c.id === pinned.id).session ?? after.session), { n: after.messages.length });

// 5. the Lab: old sketch (no layers) opens as one layer, beat map kept; the director's old chat in the dock
activate('tool:three'); const lab = await ThreeLab.cmd(); await wait(3000);
step('old sketch opens (one layer)', lab.state.sketch === 'Basic scene' && lab.layers().length === 1, { sketch: lab.state.sketch, layers: lab.layers().map((x) => x.name) });
const bm = await window.hub.kvGet('three-beatmaps');
step('beat map kept', JSON.stringify(bm).includes('"bpm":120'), Object.keys(bm || {}));
step('Three Director docked with its old chat', visible(Native.view('threedirector')?.input) && (await window.hub.listChats()).some((c) => c.agentId === 'threedirector'));
await shot('lab');

// 6. Video Review: old notes
activate('tool:ae'); await Review.ensureMounted(); await wait(1500);
const vn = await window.hub.kvGet('video-notes');
step('video notes kept', JSON.stringify(vn).includes('Flash too strong'), vn && Object.keys(vn));

// 7. nothing in data/kv was overwritten with an empty value
const kv = ['three-sketches', 'three-beatmaps', 'video-notes', 'ui-usage'];
const empty = [];
for (const k of kv) { const v = await window.hub.kvGet(k); if (v == null || (typeof v === 'object' && !Object.keys(v).length)) empty.push(k); }
step('kv stores intact', !empty.length, empty);
const errs = [...document.querySelectorAll('.toast.error, .toast[data-type=error]')].map((t) => t.textContent.trim().slice(0, 100));
step('no error toasts', !errs.length, errs);
return J.done();
