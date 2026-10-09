// Declutter (round 7): visible controls per surface with the tidy screen (calm on, the default) and with everything
// out (/calm off = how these surfaces looked before), plus the length of the top level of the main menus.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/declutter-count.js
// Counted like dev/checks/clutter.js: visible buttons, selects, inputs, summaries, links; a control that only shows
// while you point at its area is hidden here (visibility), one that is merely faded counts.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const SEL = 'button, select, input:not([type=hidden]), textarea, summary, a[href], [role=button]';
const vis = (n) => n.checkVisibility?.({ visibilityProperty: true }) && n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height > 0;
const count = (root, skip) => (root ? [...root.querySelectorAll(SEL)].filter((n) => vis(n) && !(skip && n.closest(skip))).length : 0);
const claude = H.claudeAgent();
const rows = {};
const surfaces = () => {
  const v = Native.view(claude.id);
  const L = H.surfaces.get('tool:three')?.el;
  const visOne = (sel) => [...(L?.querySelectorAll(sel) || [])].find(vis);
  const dockEl = [...(L?.querySelectorAll('.tool-dock') || [])].find(vis);
  const older = [...(v?.root.querySelectorAll('.messages .msg:not(:last-child) > .msg-foot') || [])];
  return {
    rail: () => count(document.getElementById('rail'), '#agent-buttons'),
    'chats panel': () => count(document.getElementById('panel'), '.chat-item'),
    'chat header': () => count(v.root.querySelector('.native-head')),
    'older message feet': () => older.reduce((s, f) => s + count(f), 0),
    'lab toolbar': () => [...L.querySelectorAll('.tb-group, .three-toolbar')].filter((g) => !g.closest('.media-bar')).reduce((s, g) => s + count(g, '.tb-group .tb-group'), 0),
    'lab preview': () => count(visOne('.stage-pill')) + (vis(visOne('.three-stats') || document.body) && visOne('.three-stats') ? 1 : 0),
    'lab timeline': () => count(visOne('.media-bar'), 'canvas'),
    'lab layers': () => count(visOne('.layers'), '.ly-row'),
    'lab sliders head': () => count(visOne('.tweaks'), '.tw-row, .tw-sec'),
    'lab console head': () => count(visOne('.three-console-head')),
    'director dock': () => count(dockEl, '.messages'),
  };
};
// a chat with two replies (older message feet), then the Lab with sliders, console and the dock
activate(claude.id); await wait(400);
for (const m of ['hello', 'think a little']) { await Native.send(claude.id, m); await until(() => !Native.isBusy(H.activeChat[claude.id]), 15000); }
await wait(300);
const chatRows = (label) => { const s = surfaces(); for (const k of ['rail', 'chats panel', 'chat header', 'older message feet']) (rows[k] ||= {})[label] = s[k](); };
chatRows('tidy');
await Commands.tryRun('/calm off', claude.id); await wait(200);
chatRows('everything');
await Commands.tryRun('/calm on', claude.id); await wait(200);
await Commands.tryRun('/director-setup', claude.id);
await until(() => H.agents().some((a) => a.dock === 'three'), 8000);
activate('tool:three'); await wait(3000);
await ThreeLab.cmd(); await wait(1500);
await Commands.tryRun('/sliders on', claude.id); await wait(1200);
const con = [...H.surfaces.get('tool:three').el.querySelectorAll('[data-feature="Console"]')].find(vis);
if (con && !con.classList.contains('on')) con.click();
await wait(500);
document.body.focus();
const labRows = (label) => { const s = surfaces(); for (const k of ['lab toolbar', 'lab preview', 'lab timeline', 'lab layers', 'lab sliders head', 'lab console head', 'director dock']) (rows[k] ||= {})[label] = s[k](); };
labRows('tidy');
await Commands.tryRun('/calm off', claude.id); await wait(200);
labRows('everything');
await Commands.tryRun('/calm on', claude.id); await wait(200);
// the top level of the menus
const menus = {};
const top = () => [...document.querySelectorAll('#menu > button')].length;
const v = Native.view(claude.id);
activate(claude.id); await wait(300);
v.list.querySelector('.msg.assistant .msg-more')?.click(); await wait(150); menus['message ⋯'] = top(); hideMenu();
v.root.querySelector('.native-head button[title="Chat options"]')?.click(); await wait(150); menus['chat ⋯'] = top(); hideMenu();
const item = document.querySelector('#panel .item');
item?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 120 })); await wait(150); menus['chat row (right-click)'] = top(); hideMenu();
const total = (label) => Object.values(rows).reduce((s, r) => s + (r[label] || 0), 0);
const width = Math.max(...Object.keys(rows).map((k) => k.length));
return `DECLUTTER COUNT (everything = /calm off, how these surfaces looked before; tidy = now)\n${Object.entries(rows).map(([k, r]) => `${k.padEnd(width)}  ${String(r.everything).padStart(3)} → ${String(r.tidy).padStart(3)}`).join('\n')}\n${'total'.padEnd(width)}  ${String(total('everything')).padStart(3)} → ${String(total('tidy')).padStart(3)}\nmenus (top level now): ${JSON.stringify(menus)}`;
