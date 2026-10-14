// Native feel (round 36, nativefeel): the window side. <html data-os> + the frame the main process made; the look's
// kind on form controls (frames keep theirs: the Lab stays transparent); the Mac's inset frame drawn here by setting
// data-frame (traffic-light room in the rail, headers move the window, their buttons and the chat title stay clickable,
// menus / dialogs over a header never move it); light / dark following the computer (◐ in Appearance, /lightdark,
// not saved while following, a pick of your own stops it); the menu bar's actions; a new screen scale (CDP's device
// scale factor) → 'hearth:dpr' and the Lab preview's renderer at the new ratio.
//   node dev/smoke.js --check-timeout 120000 --script dev/checks/nativefeel.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(120); } return false; };
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.message || err).slice(0, 300) }); } };
const root = document.documentElement;
const cs = (n, p) => getComputedStyle(n).getPropertyValue(p).trim();

await safe('loaded', async () => {
  step('NativeFeel + NativeCore loaded, data-os', typeof NativeFeel === 'object' && typeof NativeCore === 'object' && root.dataset.os === 'linux', { os: root.dataset.os });
  step('the frame main.js made reaches the page (Linux: the system one)', window.hub.native?.frame === 'system' && !root.dataset.frame, { frame: window.hub.native?.frame });
  const info = await window.hub.native.info();
  step('native:info answers', info && info.platform === 'linux' && typeof info.osDark === 'boolean', info);
});

await safe('color-scheme', async () => {
  const scheme = root.dataset.scheme;
  step('form controls in the look\'s kind', cs(root, 'color-scheme') === scheme, { scheme, cs: cs(root, 'color-scheme') });
  const f = document.createElement('iframe'); document.body.append(f);
  step('a frame keeps the page default (the Lab stays transparent)', cs(f, 'color-scheme') === 'normal', cs(f, 'color-scheme'));
  f.remove();
  const r = await window.hub.native.info();
  step('nativeTheme follows the look (menus, dialogs, title bar)', r.source === scheme, r);
});

await safe('inset frame', async () => {
  root.dataset.frame = 'inset';
  const strip = document.createElement('div'); strip.id = 'nf-drag'; document.body.prepend(strip);
  await wait(50);
  const rail = document.getElementById('rail');
  const head = document.querySelector('.native-head');
  const title = head?.querySelector('.chat-title'); const btn = head?.querySelector('button'); const spacer = head?.querySelector('.spacer');
  const region = (n) => (n ? cs(n, 'app-region') || cs(n, '-webkit-app-region') : null);
  step('Mac: room for the traffic lights in the rail', cs(rail, 'padding-top') === '44px', cs(rail, 'padding-top'));
  step('Mac: the top of the rail moves the window', region(strip) === 'drag' && strip.getBoundingClientRect().height === 40, { r: region(strip), h: strip.getBoundingClientRect().height });
  step('Mac: the chat header moves the window, its buttons and title (double-click rename) don\'t', region(head) === 'drag' && region(btn) === 'no-drag' && region(title) === 'no-drag' && region(spacer) !== 'no-drag', { head: region(head), btn: region(btn), title: region(title), spacer: region(spacer) });
  const th = document.querySelector('.tool-head'); const tb = th?.querySelector('button');
  step('Mac: tool headers too', !th || (region(th) === 'drag' && (!tb || region(tb) === 'no-drag')), { th: th && region(th), tb: tb && region(tb) });
  showMenu(300, 10, [{ label: 'x', action: () => {} }]); await wait(60);
  const m = document.getElementById('menu');
  step('Mac: a menu opened over a header takes clicks', region(m) === 'no-drag', region(m));
  hideMenu();
  root.toggleAttribute('data-fullscreen', true); await wait(30);
  step('Mac full screen: the rail as usual, no drag strip', cs(rail, 'padding-top') === '12px' && cs(strip, 'display') === 'none', cs(rail, 'padding-top'));
  root.toggleAttribute('data-fullscreen', false);
  await smoke({ shot: '/tmp/nativefeel-inset.png' });
  delete root.dataset.frame; strip.remove();
  await wait(30);
  step('off the Mac: nothing changes', cs(rail, 'padding-top') !== '44px' && region(head) !== 'drag', { pad: cs(rail, 'padding-top'), head: region(head) });
});

await safe('scrollbars', async () => {
  root.dataset.os = 'win'; await wait(30);
  const box = el('div', { style: { width: '200px', height: '80px', overflow: 'auto', position: 'fixed', left: '-400px', top: '0' } }, el('div', { style: { height: '400px' } }));
  document.body.append(box); await wait(30);
  const w = box.offsetWidth - box.clientWidth;
  step('Windows: a slim scrollbar (12 px track, 4 px thumb)', w === 12, w);
  root.dataset.os = 'mac'; await wait(30);
  const m = box.offsetWidth - box.clientWidth;
  root.dataset.os = 'linux'; box.remove();
  step('the Mac: thin (9 px) on the Forge looks, the system\'s own on plain ones', root.matches('[data-look~=v2], [data-skin~=forge]') ? m === 9 : m >= 0, { m, look: root.dataset.look || '', skin: root.dataset.skin || '' });
});

await safe('light / dark', async () => {
  const before = H.config.theme.preset || '';
  const info = await window.hub.native.info();
  Look.applyPreset('forgeheart', { quiet: true }); await wait(400);
  step('a look of your own: not following', !NativeFeel.following() && !('followOS' in H.config.theme));
  let said = '';
  const say = { say: (t) => { said = String(t); } };
  await Commands.tryRun('/lightdark auto', H.claudeAgent().id, null, say);
  const r = said;
  await until(() => NativeFeel.following(), 4000);
  await until(async () => (await window.hub.native.info()).source === 'system', 3000);
  const osDark = (await window.hub.native.info()).osDark;
  const want = osDark ? 'forgeheart' : 'forge-light';
  await until(() => H.config.theme.preset === want, 5000);
  step('/lightdark auto: follows the computer (pair Forgeheart / Forge Light)', NativeFeel.following() && H.config.theme.followOS?.dark === 'forgeheart' && H.config.theme.followOS?.light === 'forge-light', { r: String(r?.text || r || '').slice(0, 160), pair: H.config.theme.followOS });
  step(`the computer is ${osDark ? 'dark' : 'light'} → ${want}`, H.config.theme.preset === want, { preset: H.config.theme.preset });
  const src = (await window.hub.native.info()).source;
  step('nativeTheme left to the system while following', src === 'system', src);
  // the switch itself isn't saved (two computers in different modes never fight through sync)
  const disk = await window.hub.getConfig();
  step('the followed look is not written to config.json; the pair is', disk.config.theme.followOS?.light === 'forge-light' && disk.config.theme.preset === 'forgeheart', { preset: disk.config.theme.preset });
  // ◐ button in Appearance
  Look.openDialog(); await wait(200);
  const b = document.querySelector('dialog.look-dialog .nf-follow');
  step('◐ Match my computer in Appearance, on', b && b.classList.contains('on') && b.getAttribute('aria-pressed') === 'true', b?.outerHTML?.slice(0, 160));
  document.querySelector('dialog.look-dialog')?.close();
  // a pick of your own stops following
  Look.applyPreset('molten', { quiet: true }); await wait(600);
  step('picking a look yourself stops following', !NativeFeel.following() && H.config.theme.preset === 'molten');
  await until(async () => (await window.hub.native.info()).source === 'dark', 3000);
  step('nativeTheme back to the look\'s kind', (await window.hub.native.info()).source === 'dark');
  await Commands.tryRun('/lightdark', H.claudeAgent().id, null, say);
  step('/lightdark says what it does', /stays/.test(said), said.slice(0, 120));
  if (before) Look.applyPreset(before, { quiet: true });
  await wait(300);
});

await safe('menu actions', async () => {
  NativeFeel.menu({ action: 'keys' }); await until(() => document.querySelector('.keys-sheet'), 3000);
  step('Help → Keyboard shortcuts opens the keys sheet', Boolean(document.querySelector('.keys-sheet')));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  document.querySelector('.keys-sheet')?.closest('dialog')?.close?.();
  NativeFeel.menu({ action: 'settings' }); await until(() => document.querySelector('dialog.settings-dialog[open]'), 4000);
  step('Settings… opens Settings', Boolean(document.querySelector('dialog.settings-dialog[open]')));
  document.querySelector('dialog.settings-dialog[open]')?.close();
  const z0 = await window.hub.getZoom(); NativeFeel.menu({ action: 'zoom', arg: 1 }); await wait(150);
  const z1 = await window.hub.getZoom(); NativeFeel.menu({ action: 'zoom', arg: 0 }); await wait(150);
  step('View → Bigger text / Normal text', z1 > z0 && (await window.hub.getZoom()) === 1, { z0, z1 });
  step('keys sheet lines for the window keys (shown on the Mac / Windows only)', Keys.all().filter((k) => k.area === 'Window').length === 7 && Keys.all().filter((k) => k.area === 'Window').every((k) => typeof k.when === 'function' && !k.when()));
  let tb = '';
  await Commands.tryRun('/titlebar native', H.claudeAgent().id, null, { say: (t) => { tb = String(t); } });
  step('/titlebar off the Mac says so', /Only on a Mac/.test(tb), tb.slice(0, 100));
});

await safe('screen scale', async () => {
  activate('tool:three'); await wait(400);
  await ThreeLab.cmd?.();
  const d = ThreeLab.director;
  const sbx = async (code) => { for (let i = 0; i < 8; i++) { const r = await d.evalInSketch(code).catch(() => null); if (r?.ok) return r.value; await wait(700); } return null; };
  const before = await sbx('return devicePixelRatio');
  let got = null;
  const on = (e) => { got = e.detail; };
  addEventListener('hearth:dpr', on);
  await smoke({ cdp: 'Emulation.setDeviceMetricsOverride', params: { width: 0, height: 0, deviceScaleFactor: 2, mobile: false } });
  await until(() => got, 4000);
  step('a new screen scale → hearth:dpr in the hub', got && got.to === 2, got);
  // the sandbox (its own frame: the emulated scale may not reach it here): the scale changes inside it, the same check
  // its matchMedia listener runs, then its renderer draws at the new ratio without a re-run
  await until(async () => (await sbx('return document.querySelectorAll("canvas").length')) > 0, 15000);
  await wait(600);
  const px0 = await sbx('return [...document.querySelectorAll("canvas")].filter((c) => c.clientWidth > 4).map((c) => +(c.width / c.clientWidth).toFixed(2))');
  const changed = await sbx('const d0 = devicePixelRatio; Object.defineProperty(window, "devicePixelRatio", { get: () => d0 * 2, configurable: true }); return window.__labDprCheck()');
  await wait(500);
  const px1 = await sbx('return [...document.querySelectorAll("canvas")].filter((c) => c.clientWidth > 4).map((c) => +(c.width / c.clientWidth).toFixed(2))');
  step('the Lab preview follows a new scale (its canvas at twice the pixels, no re-run)', changed === true && Array.isArray(px0) && Array.isArray(px1) && px1.some((k, i) => k >= (px0[i] || 1) * 1.8), { px0, px1, changed });
  await sbx('delete window.devicePixelRatio; return window.__labDprCheck()');
  await smoke({ cdp: 'Emulation.clearDeviceMetricsOverride', params: {} });
  await until(() => got && got.to === 1, 4000);
  removeEventListener('hearth:dpr', on);
});

out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out);
