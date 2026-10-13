// (round 31, winmac) the window side of winmac.js: WinMac loaded before ui.js, a file whose name has # % spaces and
// accents loads as a picture through WinMac.fileUrl, ⌘ in toasts / placeholders / hints / menus on a "Mac" (the
// rewrite is checked with { mac: true }; the window here is Linux so its own text stays Ctrl), a render-folder join
const out = {};
out.loaded = typeof WinMac === 'object' && typeof WinMac.fileUrl === 'function' && typeof macText === 'function';
// a real file with an awkward name, written through the app's own fs bridge
// (inside the throwaway copy's data folder, never the home folder)
const dir = WinMac.join(WinMac.dirName(await window.hub.attachmentsDir()), 'winmac test #1');
const file = WinMac.join(dir, 'Músique 100% #2 ?.png');
const png = await new Promise((res) => { const c = document.createElement('canvas'); c.width = 3; c.height = 2; c.getContext('2d').fillRect(0, 0, 3, 2); c.toBlob((b) => b.arrayBuffer().then((a) => res(new Uint8Array(a)))); });
try { await window.hub.fs.write(file, png); out.wrote = true; } catch (err) { out.wrote = err.message; }
out.url = WinMac.fileUrl(file);
out.img = await new Promise((res) => { const i = new Image(); i.onload = () => res(`${i.naturalWidth}x${i.naturalHeight}`); i.onerror = () => res('error'); i.src = out.url; setTimeout(() => res('timeout'), 4000); });
// the old hand-built URL of the same file did not load (the # cut it)
out.oldImg = await new Promise((res) => { const i = new Image(); i.onload = () => res('loaded'); i.onerror = () => res('error'); i.src = `file://${file}`; setTimeout(() => res('timeout'), 4000); });
out.joinSep = !/\\/.test(dir) || !/\//.test(dir.slice(3)) ? 'one slash kind' : 'mixed';
// key names
out.mac = WinMac.macKeys('Copied: paste with Ctrl+V (Ctrl+click: menu)', { mac: true });
const t = toast('winmac Ctrl+K check', { timeout: 500 });
out.toastHere = t?.textContent?.includes(/Mac/.test(navigator.platform) ? '⌘K' : 'Ctrl+K');
const inp = el('input', { placeholder: 'Search (Ctrl+Shift+K)' });
out.placeholderHere = inp.placeholder;
const hint = el('span', { class: 'menu-hint', text: 'Ctrl+J' });
out.hintHere = hint.textContent;
// a menu row with an inline key and a "(Ctrl+…)" label
showMenu(200, 200, [{ label: 'Token dashboard (Ctrl+Shift+U)', action: () => {} }, { label: 'Duplicate  Ctrl+D', action: () => {} }]);
await new Promise((r) => setTimeout(r, 100));
out.menu = [...document.querySelectorAll('#menu button')].slice(0, 2).map((b) => b.textContent);
hideMenu?.();
return JSON.stringify(out);
