// Smoke check for the polish pass (polish.css, look.js, juice.js):
//   node dev/smoke.js --script dev/checks/polish.js --shot /tmp/polish.png
// Tokens per look, /corners and /motion reaching the new UI, menu shortcut keys, /appearance vs the Lab's /look,
// forged tooltips for cut-off text and beside lists, the Shuffle die.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const A = H.claudeAgent();
const cmd = (c) => Commands.tryRun(c, A.id);
const out = {};
const cs = (e, p) => (e ? getComputedStyle(e).getPropertyValue(p).trim() : null);
const root = document.documentElement;
Look.applyPreset('forgeheart', { quiet: true });
await wait(1200);

// tokens: forge looks have square corners, gold = the look's accent
out.tokens = { rmd: cs(root, '--r-md'), gold: cs(root, '--ui-gold') !== '', ai: cs(root, '--ui-ai') };

// /appearance opens the picker; /look stays the Lab's saved slider looks
out.lookCmd = Commands.get('look')?.area;
out.appearanceCmd = Commands.get('appearance')?.area;
await cmd('/appearance');
await wait(400);
out.appearanceOpens = !!document.querySelector('dialog.look-dialog[open]');
document.querySelector('dialog.look-dialog')?.close();

// context menus show shortcut keys on the right
activate(A.id);
await wait(300);
showMenu(100, 100, [{ label: 'Rename  F2', action() {} }, { label: 'Plain', action() {} }]);
out.menuKey = document.querySelector('#menu .menu-key')?.textContent;
out.menuText = document.querySelector('#menu button')?.firstChild?.nodeValue;
hideMenu();

// /corners round reaches the FX picker and nodes; /corners back
await cmd('/corners round');
await wait(300);
out.roundRmd = cs(root, '--r-md');
await cmd('/corners cut');
await wait(300);
out.cutRmd = cs(root, '--r-md');

// /motion calm stops the node wire flow (no idle loops)
await cmd('/motion calm');
await wait(200);
const probe = el('div', { class: 'nv' }, el('svg', {}));
const wire = document.createElementNS('http://www.w3.org/2000/svg', 'path');
wire.setAttribute('class', 'nv-wire-flow');
probe.firstChild.append(wire);
document.body.append(probe);
out.calmWire = cs(wire, 'animation-name');
await cmd('/motion full');
await wait(200);
out.fullWire = cs(wire, 'animation-name');
probe.remove();

// a cut-off title shows its full text in a forged tooltip
const long = el('div', { style: { width: '80px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', position: 'fixed', left: '400px', top: '300px' }, text: 'A very long chat title that does not fit' });
document.body.append(long);
long.matches = (sel) => (sel === ':hover' ? true : Element.prototype.matches.call(long, sel));
long.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
await wait(700);
out.fullTip = document.querySelector('.juice-tip.full')?.textContent;
long.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
long.remove();

// the Lab: Shuffle's die rolls on its own, Freeze and Tap carry their materials
activate('tool:three');
await wait(5000);
const sh = document.querySelector('.tw-shuffle');
if (sh) {
  sh.disabled = false;
  sh.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
  out.die = !!sh.querySelector('.j-die.j-roll') && /Shuffle/.test(sh.textContent);
}
out.freezeBg = (cs(document.querySelector('.freeze-btn'), 'background-image') || '').slice(0, 15);
out.tapBorder = cs(document.querySelector('.mb-tap'), 'border-top-color');
const ok = out.tokens.rmd === '0px' && out.lookCmd !== 'Look' && out.appearanceCmd === 'Look' && out.appearanceOpens && out.menuKey === 'F2' && out.menuText === 'Rename'
  && out.roundRmd === '8px' && out.cutRmd === '0px' && out.calmWire === 'none' && out.fullWire === 'nv-flow' && /very long chat title/.test(out.fullTip || '') && out.die !== false;
return JSON.stringify({ ok, ...out });
