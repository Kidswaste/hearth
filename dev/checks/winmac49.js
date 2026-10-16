// (round 49, winmac49) keys in the real window (Linux here = Windows' words): "Ctrl/⌘+K" and "⇧⌘K" read Ctrl+K /
// Ctrl+Shift+K in tooltips, placeholders, <kbd>, hints, toasts, menu keys, the keys sheet, patch notes and chat notes;
// then real (trusted, CDP) keys through ui.js' shim: AltGr (the right Alt) + à types @ (no Ctrl+Alt reaches a shortcut),
// the left Ctrl+Alt on AZERTY's M key (QWERTY's ;) reads KeyM, Ctrl on AZERTY's A key (QWERTY's Q) reads KeyA.
//   node dev/smoke.js --script dev/checks/winmac49.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { steps: [], errors: [] };
const step = (label, ok, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${JSON.stringify(extra)}` : ''}`); if (!ok) out.errors.push(label); };
const mac = /Mac/.test(navigator.platform);

// ---- 1. what the window says ----
const both = 'Group (Ctrl/⌘+G) · Ungroup ⇧⌘G';
const want = mac ? 'Group (⌘G) · Ungroup ⇧⌘G' : 'Group (Ctrl+G) · Ungroup Ctrl+Shift+G';
step('tooltip', el('button', { title: both }).title === want, el('button', { title: both }).title);
step('placeholder', el('input', { placeholder: both }).placeholder === want, el('input', { placeholder: both }).placeholder);
step('<kbd>', el('kbd', { text: '⇧⌘K' }).textContent === (mac ? '⇧⌘K' : 'Ctrl+Shift+K'), el('kbd', { text: '⇧⌘K' }).textContent);
step('hint', el('span', { class: 'menu-hint', text: both }).textContent === want);
step('plain text: only "Ctrl/⌘" changes', el('span', { text: 'Ctrl/⌘+K finds it' }).textContent === (mac ? '⌘K finds it' : 'Ctrl+K finds it'));
const t = toast('Ctrl/⌘+Z puts it back', { timeout: 400 });
step('toast', t?.textContent?.includes(mac ? '⌘Z' : 'Ctrl+Z') && !t.textContent.includes('/⌘'), t?.textContent);
showMenu(200, 200, [{ label: 'Ungroup', key: 'Ctrl/⌘+Shift+G', action: () => {} }]);
await wait(80);
const mk = document.querySelector('#menu .menu-key')?.textContent;
step('menu key', mk === (mac ? '⇧⌘G' : 'Ctrl+Shift+G'), mk);
hideMenu?.();
// the keys sheet: no ⌘ / ⌥ / ⇧ on Windows, no "Ctrl" (but the right-click) on the Mac
KeysUI.open();
await wait(200);
const kbdTexts = [...document.querySelectorAll('.keys-sheet kbd, [class*=ks-] kbd')].map((k) => k.textContent);
// (the Window lines name each system's own keys, ⌘Q / Alt+F4, for that system: nativefeel.js)
const own = new Set(Keys.all().filter((k) => k.area === 'Window').map((k) => k.keys));
const badKbd = kbdTexts.filter((x) => !own.has(x) && (mac ? /^(?:Ctrl|Alt)$/.test(x) : /[⌘⌥]/.test(x)));
const what = [...document.querySelectorAll('.ks-what')].map((w) => w.textContent).join(' ');
step('keys sheet read', kbdTexts.length > 30, kbdTexts.length);
step('keys sheet: keys said this computer\'s way', !badKbd.length, badKbd.slice(0, 8));
step('keys sheet: descriptions too', !/Ctrl\/⌘|⌘\/Ctrl/.test(what));
KeysUI.close();
// patch notes and a chat note
await Lazy.load('patchnotes');
const pn = PatchNotes.block('Press **Ctrl/⌘+K** (Ctrl+W is Windows\' own)').textContent;
step('patch notes', pn.includes(mac ? '⌘K' : 'Ctrl+K') && pn.includes('Ctrl+W') && !pn.includes('/⌘'), pn);
const agent = H.claudeAgent();
activate(agent.id);
await wait(300);
const note = Native.note(agent.id, 'Try Ctrl/⌘+Shift+K');
step('chat note', note ? !note.textContent.includes('/⌘') && note.textContent.includes(mac ? '⇧⌘K' : 'Ctrl+Shift+K') : true, note?.textContent);
note?.remove?.();

// ---- 2. real keys through ui.js' shim (CDP: trusted events) ----
const seen = [];
const spy = (e) => { if (e.key === 'Control' || e.key === 'Alt' || e.key === 'AltGraph') return; seen.push({ key: e.key, code: e.code, ctrl: e.ctrlKey, alt: e.altKey }); e.preventDefault(); e.stopImmediatePropagation(); };
document.addEventListener('keydown', spy, true);
const ta = document.querySelector('.surface.active .composer textarea');
ta?.focus();
const send = async (type, params) => { await Promise.race([smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, ...params } }), wait(3000)]); await wait(40); };
// AltGr (Windows: Ctrl+Alt with the right Alt down) + à → @
await send('rawKeyDown', { key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
await send('rawKeyDown', { key: 'AltGraph', code: 'AltRight', windowsVirtualKeyCode: 18, location: 2, modifiers: 3 });
await send('rawKeyDown', { key: '@', code: 'Digit0', windowsVirtualKeyCode: 48, modifiers: 3 });
await send('keyUp', { key: 'AltGraph', code: 'AltRight', windowsVirtualKeyCode: 18, location: 2, modifiers: 2 });
await send('keyUp', { key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 0 });
// the left Ctrl+Alt on AZERTY's M (QWERTY's ;), Ctrl on AZERTY's A (QWERTY's Q)
await send('rawKeyDown', { key: 'm', code: 'Semicolon', windowsVirtualKeyCode: 77, modifiers: 3 });
await send('rawKeyDown', { key: 'a', code: 'KeyQ', windowsVirtualKeyCode: 65, modifiers: 2 });
document.removeEventListener('keydown', spy, true);
out.seen = seen;
const at = seen.find((s) => s.key === '@');
step(mac ? 'AltGr (not a Mac key): skipped' : 'AltGr + à types @: no Ctrl+Alt left for a shortcut', mac || (at && !at.ctrl && !at.alt), at);
const m = seen.find((s) => s.key === 'm');
step('the left Ctrl+Alt on AZERTY\'s M reads KeyM (Ctrl+Alt+M: next model)', m && m.code === 'KeyM' && m.ctrl && m.alt, m);
const a = seen.find((s) => s.key === 'a');
step('Ctrl on AZERTY\'s A reads KeyA', a && a.code === 'KeyA' && a.ctrl, a);
return JSON.stringify(out);
