// Splash (round 19): the loading screen and the lighter start.
// Phase 1 (a normal start): the milestones came in order and the splash is gone, the features line too once every
// 'soon' group loaded; the slow-start reasons answer (boot:status); capture.css arrives with its group, back in its
// old place (before polish8.css); the Swirl sheet isn't loaded in the Forgeheart look. Then: Swirl on + the splash held.
// Phase 2 (Swirl, held): the Swirl sheet loads at start right after forge-skin.css and the splash waited for it; held,
// the splash says it's taking longer (and why) and "Open anyway" lets you in.
//   node dev/smoke.js --script dev/checks/splash.js
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await sleep(50); } return false; };
const out = { ok: [], bad: [] };
const check = (what, ok, detail = '') => (ok ? out.ok : out.bad).push(`${what}${detail ? `: ${detail}` : ''}`);
const s = Splash.state();
const m = s.marks;
check('milestones in order', m.start <= m.shell && m.shell <= m.chats && m.chats <= m.ready && m.ready <= m.gone, JSON.stringify(m));
check('splash gone after the first screen', !document.getElementById('splash') && s.done);
check('nothing left pending', s.pending.length === 0, s.pending.join(' '));
await until(() => Lazy.state().filter((g) => g.tier === 'soon').every((g) => g.state === 'loaded'));
await sleep(600);
check('features milestone + line gone', Splash.state().marks.features >= m.ready && !document.getElementById('boot-line'), JSON.stringify(Splash.state().marks));
const bs = await window.hub.bootStatus();
check('boot:status answers', bs && bs.syncing === null && Array.isArray(bs.reads) && bs.times?.appReady > 0 && bs.times.window >= bs.times.appReady && bs.times.shown > 0, JSON.stringify(bs));
// /startup (and its palette line): the steps of this start
let said = '';
await Commands.tryRun('/startup', H.claudeAgent().id, null, { say: (t) => { said += t; } });
check('/startup lists the steps', /This start/.test(said) && /first screen ready/.test(said) && /on screen/.test(said), said);
check('/startup palette line', AppUI.actions().some((a) => /^Startup: how long/.test(a.label)));
check('engine status arrived', Object.keys(H.engineStatus || {}).length > 0, JSON.stringify(H.engineStatus));
const links = () => [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href'));
const L = links();
check('capture.css loaded with capture, before polish8.css', L.includes('capture.css') && L.indexOf('capture.css') === L.indexOf('polish8.css') - 1, L.join(' '));
check('capture.css parsed', Boolean(document.querySelector('link[href="capture.css"]')?.sheet?.cssRules?.length));
check('Swirl sheet not loaded in Forgeheart', !L.includes('swirl-skin.css') || /swirl/.test(document.documentElement.dataset.skin || ''), document.documentElement.dataset.skin);
// next start: the Swirl look, the splash held
await Commands.exec('/theme swirl');
await sleep(400);
localStorage.setItem('splash.hold', '1');
return JSON.stringify(out);
//@@ reload
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await sleep(50); } return false; };
const out = { ok: [], bad: [] };
const check = (what, ok, detail = '') => (ok ? out.ok : out.bad).push(`${what}${detail ? `: ${detail}` : ''}`);
localStorage.removeItem('splash.hold');
const L = [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href'));
check('Swirl look on', /swirl/.test(document.documentElement.dataset.skin || ''), document.documentElement.dataset.skin);
check('Swirl sheet right after forge-skin.css', L.indexOf('swirl-skin.css') === L.indexOf('forge-skin.css') + 1, L.join(' '));
const sheet = document.querySelector('link[href="swirl-skin.css"]')?.sheet;
check('Swirl sheet parsed', Boolean(sheet?.cssRules?.length), String(sheet?.cssRules?.length));
const sp = document.getElementById('splash');
check('held splash still up over a ready app', Boolean(sp) && performance.getEntriesByName('hearth:ready').length === 1);
await until(() => sp?.classList.contains('slow'), 6000);
const hint = sp?.querySelector('.sp-slow')?.textContent || '';
check('says it is taking longer, and why', /Taking longer than usual/.test(hint) && /held for a test/.test(hint), hint);
const go = sp?.querySelector('.sp-go');
check('"Open anyway" shown', go && !go.hidden);
go?.click();
await until(() => !document.getElementById('splash'), 3000);
check('"Open anyway" lets you in', !document.getElementById('splash') && Splash.state().done);
await Commands.exec('/theme forgeheart');
await sleep(400);
return JSON.stringify(out);
