// Trim (round 18): the groups moved after the first screen (capture, codeflow, addons) work when used first.
// With every group held back (localStorage lazy.hold): a Forge Debug chat opened first mounts its game once Forge is
// in; /capture-… and Ctrl/⌘+K capture lines are listed and load capture; /code-outline loads the code flow view.
//   node dev/smoke.js --script dev/checks/trim-lazy.js
localStorage.setItem('lazy.hold', '1');
if (!H.config.agents.some((a) => a.id === 'forgedebugtrim')) {
  H.config.agents.push({ id: 'forgedebugtrim', name: 'Forge Debug', icon: '⚒', color: '#e07a2f', mode: 'native', engine: 'claude', gameTools: true, companion: 'forge-game', askAll: false });
  await saveConfig();
}
return 'held';
//@@ reload
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await sleep(100); } return false; };
const out = { ok: [], bad: [] };
const check = (what, ok, detail = '') => (ok ? out.ok : out.bad).push(`${what}${detail ? `: ${detail}` : ''}`);
const st = () => Object.fromEntries(Lazy.state().map((s) => [s.name, s.state]));
check('held at start', ['capture', 'codeflow', 'addons'].every((n) => st()[n] === 'stub'), JSON.stringify(st()));
check('capture / forge / code flow commands listed', ['capture', 'shot', 'forge', 'code-outline', 'kit'].every((n) => Commands.get(n)), ['capture', 'shot', 'forge', 'code-outline', 'kit'].filter((n) => !Commands.get(n)).join(' '));
check('capture keys listed', Keys.all().some((k) => k.area === 'Capture' && /^Capture menu/.test(k.what)));
check('Forgeheart tab listed', Boolean(Tools.get('forgeheart')));
// a Forge Debug chat first: its game pane fills once Forge is in
activate('forgedebugtrim');
await until(() => Lazy.loaded('addons') && document.querySelector('.surface[data-id="forgedebugtrim"] .companion-game')?.childElementCount > 0);
check('Forge Debug chat mounts its game', Boolean(document.querySelector('.surface[data-id="forgedebugtrim"] .companion-game')?.childElementCount), JSON.stringify(st()));
// a capture palette action
const act = AppUI.actions().find((a) => /^Capture: the capture menu/i.test(a.label) || /the capture menu/i.test(a.label));
check('capture palette line listed', Boolean(act), act?.label);
try { await act?.run(); } catch { /* the menu */ }
await until(() => Lazy.loaded('capture'));
check('capture palette line loads capture', Lazy.loaded('capture') && typeof Capture !== 'undefined');
await sleep(300);
check('capture menu opened', Boolean(document.querySelector('#menu:not([hidden]), .ctx-menu')));
hideMenu?.();
check('rail ⋯ → Capture entry back', Boolean(document.getElementById('capture-btn')));
// /code-outline
const r = await Commands.tryRun('/code-outline', H.claudeAgent().id, null, { say: () => {}, note: () => {} }).catch((err) => `ERR ${err.message}`);
check('/code-outline loads the code flow view', Lazy.loaded('codeflow') && typeof CodeFlow !== 'undefined', String(r).slice(0, 60));
localStorage.removeItem('lazy.hold');
H.config.agents = H.config.agents.filter((a) => a.id !== 'forgedebugtrim');
await saveConfig();
if (out.bad.length) throw new Error(`trim-lazy: ${out.bad.join(' | ')}`);
return JSON.stringify(out, null, 1);
