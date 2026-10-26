// Native feel, the window side (round 36, nativefeel): Hearth as the Mac and Windows expect a desktop app to be.
//   · <html data-os="mac|win|linux"> (nativefeel.css: each system's scrollbars), data-frame="inset" (the Mac's hidden
//     title bar: the traffic lights sit in the rail, the headers move the window, a double-click zooms it the way
//     System Settings says) and data-fullscreen.
//   · Light / dark: a look can follow the computer's own setting (◐ Match my computer in Appearance, /lightdark,
//     Ctrl+K): Forgeheart by day-light pairs with Forge Light, Chrome Forge with Chrome Light… A switch of the
//     computer's mode changes the look live, without saving it (two computers in different modes never fight through
//     sync); picking a look yourself stops following. A config that never picked a look follows on the Mac and Windows.
//     Menus, dialogs, the title bar and form controls follow the look's kind (main: nativeTheme.themeSource).
//   · A new screen scale (another monitor, Windows' 125 / 150 %): 'hearth:dpr' { from, to } + a resize, so canvases
//     redraw crisp (the Lab's wave and sequence listen; the preview's sandbox watches its own).
//   · The menu bar's actions (Settings, keyboard shortcuts, report, text size, keep on top), the window keys in the keys sheet.
const NativeFeel = (() => {
  const root = document.documentElement;
  const N = window.hub?.native || { frame: 'system', os: /Mac/.test(navigator.platform) ? 'mac' : /Win/.test(navigator.platform) ? 'win' : 'linux' };
  root.dataset.os = N.os;
  if (N.frame === 'inset') root.dataset.frame = 'inset';

  // ---------- light / dark ----------
  // the pairs live in nativefeel-core.js (shared with the main process): loaded here once the first screen is up, not
  // as one more first-screen script
  const C = () => (typeof NativeCore !== 'undefined' ? NativeCore : null);
  let coreP = null;
  const core = () => (C() ? Promise.resolve(C()) : (coreP ||= new Promise((res) => {
    const s = document.createElement('script'); s.src = 'nativefeel-core.js';
    s.onload = () => res(C()); s.onerror = () => { coreP = null; res(null); };
    document.head.append(s);
  })));
  const theme = () => H.config?.theme || {};
  const themes = () => (typeof AppUI !== 'undefined' && AppUI.THEMES) || {};
  // the pair of looks that follows the computer, or null. A config that never picked a look follows on the Mac and
  // Windows (Linux' own dark setting isn't reliable, and the test machines run there)
  function pair() {
    const t = theme();
    if (t.followOS && typeof t.followOS === 'object') return t.followOS;
    if (!t.preset && !('followOS' in t) && N.os !== 'linux') return C()?.followPair(null, themes()) || null;
    return null;
  }
  let last = ''; let busy = null; let osDark = null;
  async function sync() {
    if (!H.config || !window.hub?.native?.look) return;
    const p = pair();
    if (p && osDark != null) want(p); // (the mode known already: the look is right in this same frame, the system is asked after)
    const t = theme();
    const key = `${t.scheme}|${t.background}|${Boolean(p)}`;
    if (key === last && !p) return;
    last = key;
    let r = null;
    try { r = await window.hub.native.look({ scheme: t.scheme || 'dark', background: t.background || '', follow: Boolean(p) }); } catch { return; }
    if (!p || r?.osDark == null) return;
    osDark = Boolean(r.osDark);
    want(p);
  }
  function want(p) {
    const id = (osDark ? p.dark : p.light) || null; // (NativeCore.followTarget; here so a saved pair works before the core loads)
    if (id && id !== theme().preset && themes()[id] && typeof Look !== 'undefined') Look.applyPreset(id, { quiet: true, auto: true });
  }
  // once per change of the look (renderer.js writes data-skin / data-scheme on every config load and look change)
  const soon = () => { if (busy) return; busy = Promise.resolve().then(() => { busy = null; return sync(); }); };
  new MutationObserver(soon).observe(root, { attributes: true, attributeFilter: ['data-skin', 'data-scheme'] });

  const following = () => Boolean(pair());
  async function setFollow(on) {
    if (!H.config) return 'Not ready yet';
    if (!(await core())) return 'Couldn\'t load nativefeel-core.js';
    const t = H.config.theme || (H.config.theme = {});
    if (on) t.followOS = C().followPair(t.preset, themes());
    else { delete t.followOS; if (!t.preset) t.followOS = false; } // (a config with no look of its own stops too)
    last = '';
    await saveConfig();
    await sync();
    refreshButtons();
    const p = t.followOS;
    return on ? `◐ The look follows your computer: ${themes()[p.dark]?.label || 'dark'} when it's dark, ${themes()[p.light]?.label || 'light'} when it's light. Picking a look yourself stops it.`
      : `The look stays ${themes()[t.preset]?.label || 'as it is'}, whatever your computer's light / dark mode.`;
  }
  // ◐ in Appearance (look.js puts it next to "Let Astra pick")
  const buttons = new Set();
  function refreshButtons() {
    for (const b of buttons) {
      if (!b.isConnected) { buttons.delete(b); continue; }
      const on = following();
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.title = on ? 'The look follows your computer\'s light / dark mode · click: keep this look' : 'Follow your computer\'s light / dark mode (this look and its light or dark partner)';
    }
  }
  function followButton() {
    if (typeof el !== 'function') return null;
    const b = el('button', { type: 'button', class: 'ghost small nf-follow', text: '◐ Match my computer', on: { click: async () => toast(await setFollow(!following()), { timeout: 4000 }) } });
    buttons.add(b);
    queueMicrotask(refreshButtons);
    return b;
  }

  // ---------- the Mac's title area ----------
  if (N.frame === 'inset') {
    const strip = document.createElement('div');
    strip.id = 'nf-drag';
    strip.setAttribute('aria-hidden', 'true');
    const put = () => document.body.prepend(strip);
    if (document.body) put(); else addEventListener('DOMContentLoaded', put, { once: true });
    // a double-click the system didn't take (a header's empty part): what System Settings → Desktop & Dock says
    addEventListener('dblclick', (e) => {
      const t = e.target;
      if (t === strip || (t instanceof Element && (t.matches('.native-head, .tool-head, .native-head > .spacer') && !t.closest('button, input, select, textarea, a')))) window.hub.native.titleDblClick?.();
    });
  }
  window.hub?.native?.onState?.((st) => { root.toggleAttribute('data-fullscreen', Boolean(st?.fullscreen)); });
  window.hub?.native?.onOsScheme?.(() => { last = ''; sync(); });

  // ---------- screen scale ----------
  let dpr = devicePixelRatio;
  function watchDpr() {
    let mq = null;
    try { mq = matchMedia(`(resolution: ${dpr}dppx)`); } catch { return; }
    mq.addEventListener('change', () => {
      const from = dpr; dpr = devicePixelRatio;
      if (Math.abs(dpr - from) > 1e-3) { dispatchEvent(new CustomEvent('hearth:dpr', { detail: { from, to: dpr } })); dispatchEvent(new Event('resize')); }
      watchDpr();
    }, { once: true });
  }
  watchDpr();

  // ---------- the menu bar ----------
  function menu({ action, arg } = {}) {
    if (action === 'settings') AppUI.openSettings();
    else if (action === 'keys') { if (typeof KeysUI !== 'undefined') KeysUI.open(); else AppUI.shortcutsHelp?.(); }
    else if (action === 'zoom') AppUI.zoom(arg > 0 ? 0.1 : arg < 0 ? -0.1 : 0);
    else if (action === 'onTop') AppUI.toggleOnTop?.();
    else if (action === 'slow') window.Jank?.openCard?.(); // (round 67, slowbutton67) 🐢 That was slow
    else if (action === 'broke') window.BugWatch?.open(); // (round 68) 🪲 Something broke
    else if (action === 'report') (window.Lazy ? Lazy.load('devreport') : Promise.resolve()).then(() => DevReport.open()).catch(() => Commands.tryRun?.('/report', H.claudeAgent()?.id));
  }
  window.hub?.native?.onMenu?.(menu);

  // ---------- start ----------
  function start() {
    core().then(soon);
    const mac = N.os === 'mac'; const win = N.os === 'win';
    if (typeof Keys !== 'undefined') {
      const A = 'Window';
      Keys.add(
        { area: A, keys: '⌘Q', what: 'Quit Hearth (your work is saved first)', when: () => mac },
        { area: A, keys: '⌘H', what: 'Hide Hearth (⌥⌘H: hide the other apps)', when: () => mac },
        { area: A, keys: '⌘M', what: 'Minimise the window to the Dock', when: () => mac },
        { area: A, keys: '⌃⌘F', what: 'Full screen', when: () => mac },
        { area: A, keys: 'Alt', what: 'Show the menu bar (File, Edit, View, Window, Help)', when: () => win },
        { area: A, keys: 'Alt+F4', what: 'Close the window ("Closing the window keeps Hearth running": it stays in the tray)', when: () => win },
        { area: A, keys: 'F11', what: 'Full screen', when: () => win },
      );
    }
    if (typeof AppUI !== 'undefined') AppUI.addAction('Light / dark: match my computer (on / off)', async () => toast(await setFollow(!following()), { timeout: 4000 }));
    if (typeof Commands !== 'undefined' && !Commands.get('lightdark')) {
      Commands.register({ name: 'lightdark', aliases: ['followos'].filter((a) => !Commands.get(a)), area: 'Look', args: 'auto | off | status', desc: 'The look follows your computer\'s light / dark mode (auto) or stays as it is (off)',
        keywords: 'dark mode light mode system appearance os follow match computer night day theme',
        complete: () => [{ value: 'auto', hint: 'Follow the computer' }, { value: 'off', hint: 'Keep this look' }, { value: 'status', hint: 'What it does now' }],
        run: async (args) => {
          const a = String(args || '').trim().toLowerCase();
          if (/^(auto|on|follow|system|match|yes)$/.test(a)) return setFollow(true);
          if (/^(off|no|keep|stop)$/.test(a)) return setFollow(false);
          const p = pair();
          return p ? `◐ Following your computer (${osDark == null ? 'its mode' : osDark ? 'dark now' : 'light now'}): ${themes()[p.dark]?.label || '—'} / ${themes()[p.light]?.label || '—'}. /lightdark off keeps the look.`
            : `The look stays ${themes()[theme().preset]?.label || 'as it is'}. /lightdark auto follows your computer's light / dark mode.`;
        } });
    }
    if (typeof Commands !== 'undefined' && !Commands.get('titlebar')) {
      Commands.register({ name: 'titlebar', area: 'App', args: 'inset | native', desc: 'Mac: the traffic lights in the rail (inset) or the plain title bar (native), after a restart',
        complete: () => [{ value: 'inset', hint: 'Traffic lights in the rail (default)' }, { value: 'native', hint: 'The plain macOS title bar' }],
        run: async (args) => {
          const a = String(args || '').trim().toLowerCase();
          if (N.os !== 'mac') return 'Only on a Mac: Windows keeps its own title bar (dark or light with the look).';
          if (!/^(inset|native)$/.test(a)) return `Title bar: ${N.frame === 'inset' ? 'inset (traffic lights in the rail)' : 'the plain macOS one'}. /titlebar native or /titlebar inset (after a restart).`;
          H.config.settings = { ...(H.config.settings || {}), macTitleBar: a === 'native' ? 'native' : undefined };
          await saveConfig();
          toast(`Title bar: ${a} after a restart`, { timeout: 6000, action: { label: 'Restart now', fn: () => window.hub.restartApp() } });
          return `Title bar: ${a} after a restart.`;
        } });
    }
  }
  if (performance.getEntriesByName('hearth:ready').length) setTimeout(start, 0); else addEventListener('hearth:ready', start, { once: true });

  return { sync, setFollow, following, pair, followButton, menu, frame: N.frame, os: N.os, dpr: () => dpr };
})();
