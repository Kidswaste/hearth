// Declutter (round 7): Alt / Ctrl reveal, the keys sheet, right-click menus with submenus, keyboard in menus.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/declutter.js --shot /tmp/dc.png
// Set window.DC_SHOTS = '/dir' (with --eval) for a picture of each step.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(80); } return false; };
const vis = (n) => Boolean(n && n.checkVisibility?.({ visibilityProperty: true }) && n.getBoundingClientRect().width > 0);
const shot = async (name) => { if (window.DC_SHOTS) await smoke({ shot: `${window.DC_SHOTS}/${name}.png` }); };
const out = { ok: [], bad: [] };
const check = (name, cond, info) => { (cond ? out.ok : out.bad).push(info === undefined ? name : `${name}: ${typeof info === 'string' ? info : JSON.stringify(info)}`); };
const key = (type, k, extra = {}) => dispatchEvent(new KeyboardEvent(type, { key: k, code: extra.code || (k === 'Alt' ? 'AltLeft' : k === 'Control' ? 'ControlLeft' : k), bubbles: true, cancelable: true, ...extra }));
const menuOpen = () => !document.getElementById('menu').hidden;
const menuLabels = () => [...document.querySelectorAll('#menu > button')].map((b) => b.firstChild?.nodeValue || b.textContent);
const ctxAt = (node, dx = 20, dy = 10) => { const r = node.getBoundingClientRect(); node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + Math.min(dx, r.width / 2), clientY: r.top + Math.min(dy, r.height / 2), button: 2 })); };
const close = () => { hideMenu(); document.querySelectorAll('.mb-menu.lab-pop').forEach((m) => m.remove()); };
const claude = H.claudeAgent();

// ---------- the keys button and sheet ----------
activate(claude.id); await wait(400);
const kb = document.getElementById('keys-btn');
check('keys button in the rail, bottom left', vis(kb) && kb.getBoundingClientRect().left < 80 && kb.getBoundingClientRect().bottom > innerHeight - 80, kb?.getBoundingClientRect().toJSON?.());
kb.click(); await wait(300);
const sheet = document.querySelector('.keys-sheet');
check('keys sheet opens', vis(sheet));
const lines = () => [...document.querySelectorAll('.keys-sheet .ks-line')];
out.sheetLines = lines().length;
out.registry = Keys.all().length;
out.areas = [...Keys.groups(true).keys()];
check('sheet lists the registry', lines().length >= 150, lines().length);
check('chat keys first in a chat', /Chat box/.test(document.querySelector('.keys-sheet .ks-group h4')?.textContent), document.querySelector('.keys-sheet .ks-group h4')?.textContent);
await shot('keys-sheet');
const q = document.querySelector('.keys-sheet .ks-search');
q.value = 'freeze'; q.dispatchEvent(new Event('input')); await wait(150);
check('sheet search filters', lines().length > 0 && lines().length < 12, lines().map((l) => l.textContent).slice(0, 5));
await shot('keys-search');
q.value = ''; q.dispatchEvent(new Event('input'));
// a line that runs: Ctrl+J (notes)
q.value = 'notes ctrl'; q.dispatchEvent(new Event('input')); await wait(120);
lines().find((l) => /Notes/.test(l.textContent))?.click(); await wait(500);
check('clicking a sheet line runs it (Ctrl+J notes)', vis(document.querySelector('.notes-panel')));
Notes.close?.(); await wait(200);
check('sheet closed after running a line', !document.querySelector('.keys-sheet') || document.querySelector('.keys-sheet.out'));
// Ctrl+/ opens it too
handleShortcut({ key: '/' }); await wait(300);
check('Ctrl+/ opens the sheet', vis(document.querySelector('.keys-sheet')));
document.querySelector('.keys-sheet').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(250);
check('Esc closes the sheet', !document.querySelector('.keys-sheet:not(.out)'));

// right-click the keys button: the switches; the sheet's Customise… lists every area
ctxAt(kb, 8, 8); await wait(150);
check('right-click the keys button', menuLabels().some((l) => /Key badges/.test(l)) && menuLabels().some((l) => /^Customise/.test(l)), menuLabels());
[...document.querySelectorAll('#menu > button')].find((b) => /^Customise/.test(b.textContent))?.click(); await wait(150);
check('Customise lists every area', menuLabels().some((l) => /^Lab sliders/.test(l)) && menuLabels().some((l) => /^Chat/.test(l)), menuLabels());
await shot('customise-areas');
close();

// ---------- Alt reveal ----------
const add = document.getElementById('add-btn');
check('＋ add agent tucked away', !vis(add));
key('keydown', 'Alt', { altKey: true }); await wait(260);
check('holding Alt reveals (class)', document.documentElement.classList.contains('reveal-alt'));
check('holding Alt shows ＋ in place', vis(add));
await shot('alt-chat');
key('keyup', 'Alt'); await wait(80);
check('letting go of Alt tucks it away', !document.documentElement.classList.contains('reveal-alt') && !vis(add));
// Alt + a key is a shortcut: nothing shows
key('keydown', 'Alt', { altKey: true }); key('keydown', 't', { altKey: true, code: 'KeyT' }); await wait(260);
check('Alt+T does not reveal', !document.documentElement.classList.contains('reveal-alt'));
key('keyup', 't', { altKey: true, code: 'KeyT' }); key('keyup', 'Alt'); await wait(60);
// key repeat: one hold, many keydowns
key('keydown', 'Alt', { altKey: true }); for (let i = 0; i < 5; i += 1) key('keydown', 'Alt', { altKey: true, repeat: true }); await wait(260);
check('Alt key repeat keeps one reveal', document.documentElement.classList.contains('reveal-alt'));
dispatchEvent(new Event('blur')); await wait(50);
check('window blur clears the reveal', !document.documentElement.classList.contains('reveal-alt'));
key('keyup', 'Alt');
// double-tap: stays
key('keydown', 'Alt', { altKey: true }); key('keyup', 'Alt'); await wait(80); key('keydown', 'Alt', { altKey: true }); key('keyup', 'Alt'); await wait(120);
check('double-tap Alt latches the reveal', document.documentElement.classList.contains('reveal-alt') && vis(add));
key('keydown', 'Escape'); await wait(80);
check('Esc un-latches', !document.documentElement.classList.contains('reveal-alt'));
await wait(1500); document.querySelectorAll('#toasts .toast').forEach((t) => t.remove());

// ---------- Ctrl hints ----------
key('keydown', 'Control', { ctrlKey: true }); await wait(520);
const hints = [...document.querySelectorAll('.key-hint')].map((h) => h.textContent);
check('holding Ctrl shows key badges', hints.length >= 4, hints);
out.ctrlHintsChat = hints;
await shot('ctrl-chat');
key('keyup', 'Control'); await wait(60);
check('letting go of Ctrl removes them', !document.querySelector('.key-hint'));
key('keydown', 'Control', { ctrlKey: true }); key('keydown', 'k', { ctrlKey: true, code: 'KeyK' }); await wait(520);
check('Ctrl+K shows no badges', !document.querySelector('.key-hint'));
key('keyup', 'k', { ctrlKey: true }); key('keyup', 'Control'); await wait(60);
document.querySelector('.palette-card, dialog[open]')?.closest('dialog')?.close?.();
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(150);

// ---------- right-click: a message, submenus, keys, flyout ----------
const v = Native.view(claude.id);
v.input.value = 'think hello there'; v.form.requestSubmit();
await until(() => v.root.querySelector('.msg.assistant .msg-foot') && !Native.isBusy(Native.chatOf(claude.id)?.id), 15000); await wait(300);
const reply = [...v.root.querySelectorAll('.msg.assistant')].at(-1);
ctxAt(reply.querySelector('.body'), 40, 8); await wait(200);
check('right-click a message opens its menu', menuOpen() && menuLabels().some((l) => /^Reply/.test(l)), menuLabels());
out.msgMenu = menuLabels();
const replyRow = [...document.querySelectorAll('#menu > button')].find((b) => /^Reply/.test(b.textContent));
replyRow.dispatchEvent(new PointerEvent('pointerenter')); await wait(380);
check('pointing at a › row opens it beside (flyout)', vis(document.getElementById('menu-fly')) && document.querySelectorAll('#menu-fly button').length >= 2, document.getElementById('menu-fly')?.textContent?.slice(0, 80));
await shot('msg-menu-fly');
replyRow.click(); await wait(200);
check('clicking a › row opens the submenu in place with ‹ back', menuLabels()[0] === '‹ back' && menuLabels().some((l) => /Quote/.test(l)), menuLabels());
await shot('msg-submenu');
key('keydown', 'ArrowLeft'); await wait(200);
check('← goes back', menuLabels().some((l) => /^Mark/.test(l)), menuLabels());
key('keydown', 'ArrowDown'); key('keydown', 'ArrowDown'); await wait(60);
check('↓ highlights rows', document.querySelectorAll('#menu > button.kb-on').length === 1, document.querySelector('#menu > button.kb-on')?.textContent);
key('keydown', 'Escape'); await wait(80);
check('Esc closes the menu', !menuOpen());
// a thinking block
const th = reply.querySelector('details.thinking');
if (th) { ctxAt(th, 30, 6); await wait(150); check('right-click a thinking block', menuLabels().some((l) => /every thinking/.test(l)), menuLabels()); close(); }
// the chat header
ctxAt(v.root.querySelector('.native-head'), 200, 10); await wait(200);
check('right-click the chat header: chat menu with submenus', menuLabels().some((l) => /^View/.test(l)) && menuLabels().some((l) => /^Organise/.test(l)), menuLabels());
close();
// the composer edge
ctxAt(v.form, 4, 4); await wait(150);
check('right-click around the chat box', menuLabels().some((l) => /Attach/.test(l)) && menuLabels().some((l) => /Customise this/.test(l)), menuLabels());
// Customise this… → pin the attach button
[...document.querySelectorAll('#menu > button')].find((b) => /Customise this/.test(b.textContent))?.click(); await wait(200);
out.customise = menuLabels();
[...document.querySelectorAll('#menu > button')].find((b) => /Attach/.test(b.textContent))?.click(); await wait(200);
check('Customise this… pins a control back', Declutter.pinned('chat-attach'));
Declutter.pin('chat-attach', false);
document.querySelectorAll('#toasts .toast').forEach((t) => t.remove());
// the rail
ctxAt(document.querySelector('#rail .spacer'), 10, 10); await wait(150);
check('right-click the rail', menuLabels().some((l) => /Panels/.test(l)), menuLabels());
close();
ctxAt(document.querySelector('#agent-buttons .agent-btn'), 10, 10); await wait(150);
check('right-click an agent: Recent chats › and Move ›', menuLabels().some((l) => /Move/.test(l)), menuLabels());
close();
// a long menu filters (type a letter)
showMenu(200, 200, Array.from({ length: 14 }, (_, i) => ({ label: `Item ${i} ${i % 2 ? 'odd' : 'even'}`, action: () => { window.__picked = i; } })).concat([{ label: 'Sub', items: [{ label: 'Deep treasure', action: () => { window.__picked = 'deep'; } }] }]));
await wait(100);
check('a long menu has a filter field', vis(document.querySelector('#menu .menu-filter')));
key('keydown', 't'); key('keydown', 'r'); await wait(60);
document.querySelector('#menu .menu-filter').value = 'treasure'; document.querySelector('#menu .menu-filter').dispatchEvent(new Event('input')); await wait(60);
check('filter finds submenu items', menuLabels().some((l) => /Sub › Deep treasure/.test(l)), menuLabels());
key('keydown', 'Enter'); await wait(60);
check('Enter runs the first match', window.__picked === 'deep', window.__picked);

// ---------- a menu over a modal dialog (menus live in the top layer) ----------
AppUI.openSettings(); await wait(500);
window.__over = 0;
showMenu(300, 200, [{ label: 'Over the dialog', action: () => { window.__over = 1; } }]); await wait(150);
const mb = document.querySelector('#menu > button');
const mr = mb.getBoundingClientRect();
check('a menu opens above a modal dialog', document.elementFromPoint(mr.left + 10, mr.top + 5)?.closest?.('#menu') != null);
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x: Math.round(mr.left + 10), y: Math.round(mr.top + 5), button: 'left', clickCount: 1 } });
await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x: Math.round(mr.left + 10), y: Math.round(mr.top + 5), button: 'left', clickCount: 1 } });
await wait(150);
check('…and its items can be clicked there', window.__over === 1);
ctxAt(document.querySelector('dialog.settings-dialog h2'), 10, 6); await wait(150);
check('right-click Settings: Go to › sections', menuLabels().some((l) => /^Go to/.test(l)), menuLabels());
close();
document.querySelector('dialog.settings-dialog')?.close(); await wait(200);
Meter.dashboard(); await wait(500);
ctxAt(document.querySelector('dialog.meter-dlg .mt-head'), 10, 6); await wait(150);
check('right-click the token dashboard: Range › / Show ›', menuLabels().some((l) => /^Range/.test(l)) && menuLabels().some((l) => /^Show/.test(l)), menuLabels());
close(); document.querySelector('dialog.meter-dlg')?.close(); await wait(200);
CmdBar.open(); await wait(300);
ctxAt(document.querySelector('.cmdbar .cmdbar-row'), 2, 2); await wait(150);
check('right-click the command bar: Recent › / Pinned ›', menuLabels().some((l) => /^Recent/.test(l)), menuLabels());
close(); CmdBar.close(); await wait(150);

// ---------- the Lab ----------
activate('tool:three'); await wait(3000);
await ThreeLab.cmd(); await wait(1500);
await Commands.tryRun('/sliders on', claude.id); await wait(1200);
const L = H.surfaces.get('tool:three').el;
await shot('lab-calm');
const refs = L.querySelector('[data-feature="References"]');
check('Lab References tucked', !vis(refs));
key('keydown', 'Alt', { altKey: true }); await wait(300);
check('Alt shows References / Stage / shuffle steps in place', vis(refs) && vis(L.querySelector('[data-feature="Shuffle back"]')));
await shot('lab-alt');
key('keyup', 'Alt'); await wait(80);
key('keydown', 'Control', { ctrlKey: true }); await wait(520);
out.ctrlHintsLab = [...document.querySelectorAll('.key-hint')].map((h) => h.textContent);
check('Ctrl badges in the Lab (F, Shift+2…, R, Ctrl+S)', out.ctrlHintsLab.includes('F') && out.ctrlHintsLab.some((h) => /⇧2|Shift\+2/.test(h)), out.ctrlHintsLab);
await shot('lab-ctrl');
key('keyup', 'Control'); await wait(60);
const pick = [...L.querySelectorAll('.three-sketch-select')].find(vis);
ctxAt(pick, 20, 8); await wait(150);
check('right-click the sketch picker (its own Lab menu, filterable)', Boolean(document.querySelector('.mb-menu.lab-pop .menu-item')), document.querySelector('.mb-menu.lab-pop')?.textContent?.slice(0, 80));
close();
const tb = [...L.querySelectorAll('.tb-group')].find(vis);
ctxAt(tb, 2, 2); await wait(150);
check('right-click the Lab toolbar', menuLabels().some((l) => /^Sketch/.test(l)) && menuLabels().some((l) => /^Capture/.test(l)), menuLabels());
await shot('lab-toolbar-menu');
close();
ctxAt([...L.querySelectorAll('.tweaks .tw-head')].find(vis), 6, 6); await wait(150);
check('right-click the sliders panel', menuLabels().some((l) => /^Looks/.test(l)) && menuLabels().some((l) => /^Slots/.test(l)), menuLabels());
close();
const con = [...L.querySelectorAll('.three-console-wrap')].find(vis);
if (con) { ctxAt(con, 10, 30); await wait(150); check('right-click the console', menuLabels().some((l) => /Clear/.test(l)), menuLabels()); close(); }
const bar = [...L.querySelectorAll('.media-bar')].find(vis);
ctxAt([...bar.querySelectorAll('.tb-group')].find(vis) || bar, 2, 2); await wait(150);
check('right-click the timeline buttons', menuLabels().some((l) => /Load audio/.test(l)) && menuLabels().some((l) => /^Song/.test(l)), menuLabels());
close();
// a slider row: the Lab's two-column menu, folded into submenus
const row = [...L.querySelectorAll('.tw-row')].find(vis);
ctxAt(row, 30, 8); await wait(200);
const pop = document.querySelector('.mb-menu.lab-pop');
out.sliderMenu = [...(pop?.querySelectorAll('.menu-item b') || [])].map((b) => b.textContent);
check('right-click a slider: Lab menu', Boolean(pop) && out.sliderMenu.length >= 4, out.sliderMenu);
const sub = pop?.querySelector('.menu-item.has-sub');
if (sub) { sub.click(); await wait(120); check('Lab menu submenu with ‹ back', pop.querySelector('.menu-back') != null, [...pop.querySelectorAll('.menu-item b')].map((b) => b.textContent)); }
await shot('slider-menu');
close();
// the effects picker: right-click a row
ThreeFX.openPicker('add'); await wait(800);
const fxRow = [...document.querySelectorAll('.fx-picker .fx-row')].find(vis);
if (fxRow) { ctxAt(fxRow, 40, 8); await wait(150); check('right-click an effect: add / use on the layer / ★', menuLabels().some((l) => /Use it on the selected layer/.test(l)), menuLabels()); close(); }
ThreeFX.close(); await wait(150);
// a layer: Opacity › / Blend ›
const ly = [...L.querySelectorAll('.ly-row')].find(vis);
ctxAt(ly, 60, 8); await wait(200);
out.layerMenu = [...(document.querySelector('.mb-menu.lab-pop')?.querySelectorAll('.menu-item b') || [])].map((b) => b.textContent);
check('right-click a layer: folded into Opacity › / Blend ›', out.layerMenu.includes('Opacity') && out.layerMenu.includes('Blend'), out.layerMenu);
check('Lab menus end with Customise this…', out.layerMenu.at(-1) === 'Customise this…', out.layerMenu);
close();
// the preview picture (a real right-click inside the sandboxed iframe)
const frame = [...L.querySelectorAll('.three-preview iframe')].find(vis);
if (frame) {
  const r = frame.getBoundingClientRect();
  const x = Math.round(r.left + r.width / 2); const y = Math.round(r.top + Math.min(80, r.height / 3));
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mousePressed', x, y, button: 'right', clickCount: 1 } });
  await smoke({ cdp: 'Input.dispatchMouseEvent', params: { type: 'mouseReleased', x, y, button: 'right', clickCount: 1 } });
  await until(() => menuOpen(), 2000);
  check('right-click the Lab picture', menuLabels().some((l) => /Frame size/.test(l)), menuLabels());
  [...document.querySelectorAll('#menu > button')].find((b) => /Frame size/.test(b.textContent))?.click(); await wait(200);
  check('preview Frame size › lists the sizes', menuLabels().some((l) => /9:16/.test(l)), menuLabels());
  await shot('preview-menu');
  close();
}

// ---------- Video Review: rarer tools wait behind Alt ----------
activate('tool:ae'); await wait(2000);
const VR = H.surfaces.get('tool:ae').el;
const scopes = VR.querySelector('.vr-tgroup .vr-ico[title^="Scopes"]');
check('Video Review scopes tucked', scopes && !vis(scopes));
key('keydown', 'Alt', { altKey: true }); await wait(260);
check('Alt shows them in Video Review', vis(scopes));
await shot('video-alt');
key('keyup', 'Alt'); await wait(60);
await shot('video-calm');

// ---------- a long tab bar (Forgeheart) and tucking any button yourself ----------
activate('tool:forgeheart'); await wait(1500);
const FH = H.surfaces.get('tool:forgeheart')?.el;
const tabs = [...(FH?.querySelectorAll('.tabbar > button') || [])];
check('long tab bar keeps 5 + the open one', tabs.length >= 7 && tabs.filter(vis).length <= 6, [tabs.length, tabs.filter(vis).length]);
ctxAt(FH.querySelector('.tabbar'), 10, 6); await wait(150);
check('right-click a tab bar lists every tab', menuLabels().filter((l) => !/Customise/.test(l)).length === tabs.length, menuLabels());
await shot('forge-tabs');
close();
const panelBtn = document.getElementById('panel-btn');
ctxAt(panelBtn, 6, 6); await wait(150);
const tuckRow = [...document.querySelectorAll('#menu > button')].find((b) => /Customise this/.test(b.textContent));
tuckRow?.click(); await wait(150);
const tk = [...document.querySelectorAll('#menu > button')].find((b) => /^Tuck “/.test(b.textContent));
check('Customise this… offers to tuck the button you right-clicked', Boolean(tk), menuLabels());
tk?.click(); await wait(150);
check('a button you tucked leaves the screen', !vis(panelBtn));
key('keydown', 'Alt', { altKey: true }); await wait(260);
check('…and holding Alt shows it', vis(panelBtn));
key('keyup', 'Alt'); await wait(60);
let tucked = ''; await Commands.tryRun('/tucked', claude.id, null, { say: (t) => { tucked += t; } });
check('/tucked lists it', /panel/i.test(tucked) || /Show\/hide chats/i.test(tucked), tucked.slice(0, 80));
await Commands.tryRun('/tucked clear', claude.id, null, { say: () => {} }); await wait(100);
check('/tucked clear brings it back', vis(panelBtn));
document.querySelectorAll('#toasts .toast').forEach((t) => t.remove());

// ---------- director dock ----------
activate(claude.id); await wait(300);
await Commands.tryRun('/director-setup', claude.id);
await until(() => H.agents().some((a) => a.dock === 'three'), 8000);
activate('tool:three'); await wait(2500);
const dock = [...L.querySelectorAll('.tool-dock')].find(vis);
check('dock chips tucked away', !vis(dock?.querySelector('.dd-chips')));
ctxAt(dock.querySelector('.dd-strip'), 30, 6); await wait(150);
check('right-click the dock: quick asks + Dock ›', menuLabels().some((l) => /Jam/.test(l)) && menuLabels().some((l) => /^Dock/.test(l)), menuLabels());
await shot('dock-menu');
close();

// ---------- chat commands ----------
const say = async (line) => { let txt = ''; await Commands.tryRun(line, claude.id, null, { say: (t) => { txt += t; }, note: (t) => { txt += t; } }); return txt; };
out.calm = await say('/customise lab');
check('/customise lists the tucked controls', /References/.test(out.calm), out.calm.slice(0, 120));
await say('/calm off'); await wait(100);
check('/calm off shows everything', vis(refs));
await say('/calm on'); await wait(100);
check('/calm on tucks again', !vis(refs));
await say('/reveal'); await wait(100);
check('/reveal latches', document.documentElement.classList.contains('reveal-alt'));
await say('/reveal off'); await wait(60);
check('Commands registered', ['calm', 'reveal', 'customise', 'pin-control', 'unpin-control', 'rightclick', 'shortcuts'].every((n) => Commands.get(n)), ['calm', 'reveal', 'customise', 'pin-control', 'unpin-control', 'rightclick', 'shortcuts'].filter((n) => !Commands.get(n)));

return `DECLUTTER ${out.bad.length ? 'FAIL' : 'OK'} ${out.ok.length} ok, ${out.bad.length} bad\n${out.bad.map((b) => `  ✗ ${b}`).join('\n')}\n` + JSON.stringify({ ...out, ok: out.ok.length }, null, 1).slice(0, 6000);
