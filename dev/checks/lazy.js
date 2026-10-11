// Lazy loading (round 16, boot): with every group held back (localStorage lazy.hold), the stand-ins list everything and
// the first use of each kind loads its group and works: a command (/studio list), the Commands page and Video Review
// tabs, a palette action, an agent tool call, the Lab; then the Lab as the first screen with the Three Director docked
// (the dock attaches once the Lab is in), and the normal start (every group loaded soon after the first screen).
//   node dev/smoke.js --script dev/checks/lazy.js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
localStorage.setItem('lazy.hold', '1');
if (!H.config.agents.some((a) => a.id === 'threedirector')) {
  H.config.agents.push({ id: 'threedirector', name: 'Three Director', icon: '◆', color: '#7c5cff', mode: 'native', engine: 'claude', dock: 'three', threeTools: true });
  await saveConfig();
}
return 'held';
//@@ reload
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await sleep(100); } return false; };
const out = { ok: [], bad: [] };
const check = (what, ok, detail = '') => (ok ? out.ok : out.bad).push(`${what}${detail ? `: ${detail}` : ''}`);
const st = () => Object.fromEntries(Lazy.state().map((s) => [s.name, s.state]));
check('all held at start', Object.values(st()).every((s) => s === 'stub'), JSON.stringify(st()));
const names = new Set(Commands.list().map((d) => d.name));
const want = ['studio', 'renders', 'adobe', 'deploy', 'video', 'cut', 'commands', 'whats-new', 'meshy', 'fps', 'seq', 'fx-picker'];
check('stand-in commands listed', want.every((n) => names.has(n) || Commands.get(n)), want.filter((n) => !Commands.get(n)).join(' '));
check('Commands.list() size', Commands.list().length > 900, String(Commands.list().length));
check('no duplicates', Commands.duplicates().length === 0, Commands.duplicates().map((d) => d.name).join(' '));
check('rail tools', ['three', 'ae', 'board', 'commands'].every((id) => Tools.get(id)), Tools.all().map((t) => t.id).join(' '));
// 1. a command
const say = [];
await Commands.tryRun('/studio list', H.claudeAgent().id, null, { say: (t) => say.push(t), note: (t) => say.push(t) }).catch((err) => say.push(`ERR ${err.message}`));
await until(() => Lazy.loaded('studio'));
check('/studio list loads Studio and answers', Lazy.loaded('studio') && say.join('').length > 40, say.join(' ').slice(0, 80));
// 2. an agent tool (HubBridge prefix) of a group not loaded yet
const r = await HubBridge.call('adobe_status', {}).catch((err) => ({ ok: false, error: err.message }));
check('agent tool through a stand-in prefix loads its group', Lazy.loaded('adobe') && !/Nothing in the hub/.test(r?.error || ''), JSON.stringify(r).slice(0, 120));
// 2b. the main process loads adobemain.js / deploymain.js on their first call (main.js lazyIpc)
const ad = await window.hub.adobe.status().catch((err) => ({ error: err.message }));
const dp = await window.hub.deploy.status({}).catch((err) => ({ error: err.message }));
check('Adobe / deploy IPC answer from lazily loaded main modules', ad && !ad.error && dp && !dp.error, `${JSON.stringify(ad).slice(0, 60)} ${JSON.stringify(dp).slice(0, 60)}`);
// 3. a palette action
const act = AppUI.actions().find((a) => a.label === 'Adobe apps…');
check('palette stand-in listed', Boolean(act));
try { await act?.run(); } catch { /* the menu */ }
await until(() => Lazy.loaded('adobe') && Lazy.loaded('deploy'));
check('palette action loads its group', Lazy.loaded('deploy'), JSON.stringify(st()));
hideMenu?.();
// 4. the Commands page tab
activate('tool:commands');
await until(() => Lazy.loaded('cmdpage') && document.querySelector('[data-id="tool:commands"] .cp-head'));
check('Commands page opens from its tab', Boolean(document.querySelector('[data-id="tool:commands"] .cp-head')), JSON.stringify(st()));
// 5. Video Review tab
activate('tool:ae');
await until(() => Lazy.loaded('video') && document.querySelector('[data-id="tool:ae"] .vr-main'));
check('Video Review opens from its tab', Boolean(document.querySelector('[data-id="tool:ae"] .vr-main')));
check('no "Loading…" left', !document.querySelector('.lazy-wait'));
// 5b. the board tab
activate('tool:board');
await until(() => Lazy.loaded('board') && document.querySelector('[data-id="tool:board"] .bd-root'));
check('the board opens from its tab', Boolean(document.querySelector('[data-id="tool:board"] .bd-root')));
// 6. the Lab (docked director)
activate('tool:three');
await until(() => Lazy.loaded('lab') && typeof ThreeLab !== 'undefined' && ThreeLab.director, 30000);
check('the Lab opens from its tab', Lazy.loaded('lab') && Boolean(typeof ThreeLab !== 'undefined' && ThreeLab.director));
const dock = document.querySelector('[data-id="tool:three"] .tool-dock');
check('the director docks beside the Lab', Boolean(dock && !dock.hidden && dock.querySelector('form.composer')));
// stand-ins handed over: no stand-in left in the registry, same count of names
const left = Commands.list().filter((d) => d.__lazy || d.variants?.some((v) => v.__lazy));
const leftLoaded = left.filter((d) => Lazy.loaded(d.__lazy || d.variants.find((v) => v.__lazy).__lazy));
check('loaded groups took their stand-ins over', !leftLoaded.length, leftLoaded.map((d) => `${d.name}(${d.__lazy || d.variants.find((v) => v.__lazy).__lazy})`).slice(0, 8).join(' '));
check('still no duplicates', Commands.duplicates().length === 0, Commands.duplicates().map((d) => d.name).join(' '));
// a command another module wrapped while it was a stand-in (/director: director-cmds.js around Video Review's)
const errs = [];
const onErr = (e) => errs.push(String(e.reason?.message || e.message || e.reason));
addEventListener('unhandledrejection', onErr);
const ran = await Commands.tryRun('/director cost', H.claudeAgent().id, null, { say: () => {}, note: () => {}, error: (t) => errs.push(t) }).catch((err) => { errs.push(err.message); return false; });
await sleep(300);
removeEventListener('unhandledrejection', onErr);
const dir = Commands.get('director');
check('/director cost (wrapped stand-in) runs', ran === true && !errs.length && dir.variants?.length === 2 && !dir.variants.some((v) => v.__lazy), `${ran} ${errs.join(' ')} ${dir.variants?.length}`);
out.misses = Lazy.misses().map((m) => `${m.name}: ${m.where}`).slice(0, 12);
localStorage.removeItem('lazy.hold');
H.config.settings = { ...(H.config.settings || {}), startOn: 'threedirector' };
await saveConfig();
await sleep(600);
return JSON.stringify(out, null, 1);
//@@ reload
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await sleep(100); } return false; };
const out = { ok: [], bad: [] };
const check = (what, ok, detail = '') => (ok ? out.ok : out.bad).push(`${what}${detail ? `: ${detail}` : ''}`);
// the Lab is the first screen: it loads at once, the director's dock attaches after it
check('starts on the Lab', H.surfaceIdFor(H.activeId) === 'tool:three', H.activeId);
await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director);
check('Lab up', typeof ThreeLab !== 'undefined' && Boolean(ThreeLab.director));
const dock = document.querySelector('[data-id="tool:three"] .tool-dock');
check('dock with the director chat', Boolean(dock && !dock.hidden && dock.querySelector('form.composer')));
check('director strip', Boolean(document.querySelector('[data-id="tool:three"] .dd-strip, [data-id="tool:three"] .director-strip, [data-id="tool:three"] [class*="dd-"]')));
// every group comes in soon after the first screen, in idle time
await until(() => Lazy.state().every((s) => s.state === 'loaded'));
check('every group loaded after the first screen', Lazy.state().every((s) => s.state === 'loaded'), Lazy.state().map((s) => `${s.name}:${s.state}@${s.at}`).join(' '));
check('ready before the groups', Lazy.state().every((s) => s.name === 'lab' || s.at > (performance.getEntriesByName('hearth:ready')[0]?.startTime || 0)), `ready @${Math.round(performance.getEntriesByName('hearth:ready')[0]?.startTime)}`);
H.config.settings = { ...(H.config.settings || {}), startOn: '' };
await saveConfig();
return JSON.stringify(out, null, 1);
