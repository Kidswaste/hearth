// Clutter report (round 4, simplify): how many controls each surface shows at first sight, and how long the menus
// are. Run before and after a UI change to see whether it got calmer:
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/clutter.js --shot /tmp/clutter.png
// Counted: visible buttons, selects, inputs, summaries and links (a control hidden by CSS or [hidden] doesn't count;
// one faded in on hover does, so hover-only tricks don't game it). Lists of content (chats, slider rows, effects in
// the picker) are reported apart as "items". Set window.CLUTTER_SHOTS = '/dir' to keep a picture of each surface.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const SEL = 'button, select, input:not([type=hidden]), textarea, summary, a[href], [role=button]';
const vis = (n) => n.checkVisibility?.({ visibilityProperty: true }) && n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height > 0;
const count = (root, { skip = null } = {}) => (root ? [...root.querySelectorAll(SEL)].filter((n) => vis(n) && !(skip && n.closest(skip))).length : null);
const names = (root, { skip = null } = {}) => (root ? [...root.querySelectorAll(SEL)].filter((n) => vis(n) && !(skip && n.closest(skip))).map((n) => (n.dataset?.feature || n.textContent || n.title || n.placeholder || n.type || '').trim().replace(/\s+/g, ' ').slice(0, 18)) : []);
const rows = {};
const add = (surface, root, opts = {}) => { rows[surface] = { controls: count(root, opts), ...(opts.items ? { items: opts.items() } : {}), list: names(root, opts).join(' | ').slice(0, 220) }; };
const shot = async (name) => { if (window.CLUTTER_SHOTS) await smoke({ shot: `${window.CLUTTER_SHOTS}/${name}.png` }); };
const menuCount = () => [...document.querySelectorAll('#menu:not([hidden]) > button, .mb-menu.lab-pop .menu-item')].filter(vis).length;
const closeMenus = () => { hideMenu(); document.querySelectorAll('.mb-menu.lab-pop').forEach((m) => m.remove()); };
const claude = H.claudeAgent();

// ---------- chat ----------
activate(claude.id); await wait(500);
const view = () => Native.view(claude.id);
const surf = () => view().root;
add('rail', document.getElementById('rail'), { skip: '#agent-buttons', items: () => document.querySelectorAll('#agent-buttons button').length });
add('chats panel', document.getElementById('panel'), { skip: '.chat-item, .group-head', items: () => document.querySelectorAll('#panel .chat-item').length });
add('chat header', surf().querySelector('.native-head'));
add('chat empty state', surf().querySelector('.messages'));
add('composer (+ ask-all bar)', null);
rows['composer (+ ask-all bar)'] = { controls: count(surf().querySelector('form.composer')) + (vis(document.getElementById('broadcast')) ? count(document.getElementById('broadcast')) : 0), list: names(surf().querySelector('form.composer')).join(' | ') + (vis(document.getElementById('broadcast')) ? ' | +ask-all bar' : '') };
add('meter', null);
rows.meter = { controls: count(document.querySelector('.meter-strip')) + (vis(document.querySelector('.meter-pill')) ? 1 : 0), list: `${vis(document.querySelector('.meter-strip')) ? 'strip' : ''}${vis(document.querySelector('.meter-pill')) ? 'pill' : ''}` };
await shot('chat-empty');
// a reply to look at
view().input.value = 'hello there'; view().form.requestSubmit();
await until(() => surf().querySelector('.msg.assistant .msg-foot') && !Native.isBusy(Native.chatOf(claude.id)?.id), 15000);
await wait(400);
add('message actions (reply)', surf().querySelector('.msg.assistant .msg-foot'), { skip: '.tok-badge, .mt-badge, .msg-badge' });
add('message actions (yours)', surf().querySelector('.msg.user .msg-foot'));
surf().querySelector('.msg.assistant .msg-more')?.click(); await wait(200);
rows['message ⋯ menu'] = { controls: menuCount() }; await shot('msg-menu'); closeMenus();
surf().querySelector('.native-head button[title="Chat options"], .native-head .chat-menu-btn')?.click(); await wait(200);
rows['chat options menu'] = { controls: menuCount() }; closeMenus();
surf().querySelector('.collab-chip')?.click(); await wait(200);
rows['collab chip menu'] = { controls: menuCount() }; await shot('collab'); closeMenus();
add('chat header (with a chat)', surf().querySelector('.native-head'));
await shot('chat');

// ---------- settings / appearance ----------
AppUI.openSettings(); await wait(600);
add('settings', document.querySelector('dialog.settings-dialog'));
await shot('settings');
document.querySelector('dialog.settings-dialog')?.close(); await wait(200);
Look.openDialog(); await wait(400);
add('appearance', document.querySelector('dialog.look-dialog'), { skip: '.look-grid', items: () => [...document.querySelectorAll('dialog.look-dialog .look-tile')].filter(vis).length });
await shot('appearance');
document.querySelector('dialog.look-dialog')?.close(); await wait(200);

// ---------- Lab ----------
activate('tool:three'); await wait(3500);
const c = await ThreeLab.cmd(); await wait(1200);
const lab = () => H.surfaces.get('tool:three').el;
const L = lab();
add('lab toolbar', [...L.querySelectorAll('.three-toolbar')].find(vis));
add('lab preview pill', [...L.querySelectorAll('.stage-pill')].find(vis));
add('lab timeline', [...L.querySelectorAll('.media-bar')].find(vis));
await Commands.tryRun('/sliders on', claude.id); await wait(1200);
add('lab layers', [...L.querySelectorAll('.layers')].find(vis), { skip: '.ly-row', items: () => [...L.querySelectorAll('.ly-row')].filter(vis).length });
add('lab sliders (panel)', [...L.querySelectorAll('.tweaks')].find(vis), { skip: '.tw-row', items: () => [...L.querySelectorAll('.tw-row')].filter(vis).length });
const firstRow = [...L.querySelectorAll('.tw-row')].find(vis);
add('lab one slider row', firstRow);
await shot('lab');
[...L.querySelectorAll('[data-feature="Lab more"]')].find(vis)?.click(); await wait(250);
rows['lab ⋯ menu'] = { controls: menuCount() }; closeMenus();
[...L.querySelectorAll('[data-feature="Preview more"]')].find(vis)?.click(); await wait(250);
rows['preview ⋯ menu'] = { controls: menuCount() }; closeMenus();
ThreeFX.openPicker('add'); await wait(900);
add('fx picker (first view)', document.querySelector('.fx-picker'), { skip: '.fx-row', items: () => [...document.querySelectorAll('.fx-picker .fx-row')].filter(vis).length });
await shot('fx');
ThreeFX.close(); await wait(200);
await Commands.tryRun('/nodes', claude.id); await wait(1800);
add('nodes', [...L.querySelectorAll('.tn-pane')].find(vis), { items: () => [...L.querySelectorAll('.nv-node')].filter(vis).length });
await shot('nodes');
await Commands.tryRun('/nodes code', claude.id); await wait(800);

// ---------- Video Review ----------
activate('tool:ae'); await wait(2500);
add('video review', H.surfaces.get('tool:ae')?.el, { skip: '.vr-item, .vr-lib-item, .vr-card', items: () => [...(H.surfaces.get('tool:ae')?.el.querySelectorAll('.vr-item, .vr-lib-item, .vr-card') || [])].filter(vis).length });
await shot('video');

// ---------- director dock (adds the Three Director like a new user would) ----------
activate(claude.id); await wait(300);
await Commands.tryRun('/director-setup', claude.id);
await until(() => H.agents().some((a) => a.dock === 'three'), 8000);
activate('tool:three'); await wait(2500);
const dock = [...lab().querySelectorAll('.tool-dock')].find(vis);
add('director dock', dock, { skip: '.messages' });
await shot('dock');

const total = Object.values(rows).reduce((s, r) => s + (r.controls || 0), 0);
const width = Math.max(...Object.keys(rows).map((k) => k.length));
const table = Object.entries(rows).map(([k, r]) => `${k.padEnd(width)}  ${String(r.controls ?? '-').padStart(4)}${r.items != null ? `  (+${r.items} items)` : ''}${r.list ? `   ${r.list}` : ''}`).join('\n');
console.log(`\nCLUTTER\n${table}\n${'total'.padEnd(width)}  ${String(total).padStart(4)}\n`);
return JSON.stringify({ total, rows: Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, r.items != null ? [r.controls, r.items] : r.controls])) });
