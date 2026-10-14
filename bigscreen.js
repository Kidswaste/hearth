// Big screen, the window side (round 38, bigscreen): Hearth as a real full-screen app on a big monitor.
//   · ⛶ in the rail (under ☰): full screen on / off. Also the View menu (F11 on Windows, ⌃⌘F and the green button on
//     the Mac), Ctrl/⌘+K "Full screen", /fullscreen. Remembered per screen by main (bigscreenmain.js). The first time:
//     a short hint saying how to leave. Esc never leaves it (only the Lab's Present, which is the page's own full screen).
//   · Size of everything (the whole window's zoom) per screen: Auto (from the screen's size, bigscreen-core.js) or 100 …
//     200 %; one row in Appearance, ⌘/Ctrl + / − / 0 (0 = Auto), /ui-size. Main hands the zoom to preload.js for the
//     first frame; a move to another screen re-zooms here ('big:display').
//   · Full screen with the chats list hidden (☰): resting the pointer on the rail shows the list over the page until
//     the pointer leaves (nothing new on screen otherwise).
//   The layout for wide windows is CSS only (bigscreen.css: media queries in CSS pixels, so they follow the size too).
const Bigscreen = (() => {
  const big = window.hub?.big;
  const root = document.documentElement;
  const C = () => (typeof BigCore !== 'undefined' ? BigCore : null);
  const mac = /Mac/.test(navigator.platform);
  const fullKey = mac ? '⌃⌘F' : 'F11';
  let info = { zoom: big?.startZoom || 1, pref: 'auto', auto: 1, fullscreen: false, name: 'this screen' };

  // ---------- size of everything ----------
  function apply(i) {
    if (!i) return;
    const was = info;
    info = { ...info, ...i };
    if (Math.abs((window.hub.getZoom?.() || 1) - info.zoom) > 1e-3) window.hub.setZoom(info.zoom);
    full(info.fullscreen, was.fullscreen);
    refresh();
  }
  const pct = (z) => `${Math.round(z * 100)} %`;
  async function setSize(pref) {
    if (!big) return 'Not available here';
    const p = C() ? C().normal(pref) : pref;
    apply(await big.zoom(p));
    return p === 'auto' ? `Size of everything: Auto (${pct(info.zoom)} on ${info.name})` : `Size of everything: ${pct(info.zoom)} on ${info.name}`;
  }
  // ⌘/Ctrl + / − / 0 (and the View menu): a step from the size in use, kept for this screen; 0 goes back to Auto
  async function zoomStep(delta) {
    const next = !delta ? 'auto' : C()?.step(info.zoom, delta > 0 ? 1 : -1) ?? Math.round((info.zoom + delta) * 10) / 10;
    await setSize(next);
    toast(`Size of everything ${pct(info.zoom)}${info.pref === 'auto' ? ' (Auto)' : ''}`, { timeout: 1000 });
  }

  // the row in Appearance: Auto · 100 · 125 · 150 · 175 · 200, for the screen the window is on
  const rows = new Set();
  function sizeRow({ compact = false } = {}) {
    if (!big || typeof el !== 'function') return null;
    // (round 39, settingscalm) Settings shows one control per row: the same choices in one list, its note on hover
    if (compact) {
      const sel = el('select', { class: 'big-size-pick', attrs: { 'aria-label': 'Size of everything' } });
      for (const v of C()?.CHOICES || ['auto', 1, 1.25, 1.5, 1.75, 2]) sel.append(el('option', { value: String(v), text: v === 'auto' ? 'Auto' : `${Math.round(v * 100)} %` }));
      sel.addEventListener('change', () => setSize(sel.value === 'auto' ? 'auto' : Number(sel.value)));
      const row = el('label', { class: 'big-size big-size-compact' }, el('span', { class: 'big-size-label', text: 'Size of everything' }), sel);
      row.sync = () => {
        const pref = info.pref === 'auto' || info.pref == null ? 'auto' : String(info.pref);
        if (![...sel.options].some((o) => o.value === pref)) sel.append(el('option', { value: pref, text: `${Math.round(Number(pref) * 100)} %` })); // a ⌘/Ctrl + / − step
        if (sel.value !== pref) sel.value = pref;
        const auto = `Auto (${Math.round(info.zoom * 100)} %)`;
        if (sel.options[0] && sel.options[0].textContent !== auto) sel.options[0].textContent = auto;
        const tip = `How big everything is on ${info.name}, kept for each screen (Auto picks it from the screen's size; ${mac ? '⌘' : 'Ctrl'} + / − too)`;
        if (row.title !== tip) row.title = tip;
      };
      row.sync();
      rows.add(row);
      return row;
    }
    const seg = el('div', { class: 'tw-seg big-size-seg', role: 'group', 'aria-label': 'Size of everything' });
    const note = el('span', { class: 'hint big-size-note' });
    for (const v of C()?.CHOICES || ['auto', 1, 1.25, 1.5, 1.75, 2]) {
      seg.append(el('button', { type: 'button', class: 'ghost small', dataset: { v: String(v) }, text: v === 'auto' ? 'Auto' : String(Math.round(v * 100)),
        on: { click: async () => { await setSize(v); } } }));
    }
    const row = el('div', { class: 'big-size' }, el('span', { class: 'big-size-label', text: 'Size of everything' }), seg, note);
    row.sync = () => {
      const pref = info.pref === 'auto' || info.pref == null ? 'auto' : String(info.pref);
      for (const b of seg.children) {
        const on = b.dataset.v === pref;
        b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
        if (b.dataset.v === 'auto') b.textContent = `Auto${pref === 'auto' ? ` · ${Math.round(info.zoom * 100)}` : ''}`;
      }
      const text = `${info.name}${pref !== 'auto' ? '' : ' · picked from its size'} · ${mac ? '⌘' : 'Ctrl'} + / − too`;
      if (note.textContent !== text) note.textContent = text;
    };
    row.sync();
    rows.add(row);
    return row;
  }

  // ---------- full screen ----------
  const ICON_IN = '<svg class="hi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>';
  const ICON_OUT = '<svg class="hi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>';
  let btn = null;
  function railButton() {
    const anchor = document.getElementById('panel-btn');
    if (!anchor || document.getElementById('full-btn') || !big) return;
    btn = document.createElement('button');
    btn.className = 'tool-btn'; btn.id = 'full-btn'; btn.type = 'button';
    btn.dataset.feature = 'Full screen';
    btn.addEventListener('click', () => toggle());
    anchor.after(btn);
    refresh();
  }
  async function toggle(on = 'toggle') {
    if (!big) return 'Not available here';
    const r = await big.fullscreen(on);
    return r?.fullscreen ? `Full screen (${fullKey} or ⛶ in the rail to leave)` : 'Windowed';
  }
  // entering / leaving (from any way in: the button, the menu, the system's own keys and green button)
  function full(on, was) {
    root.toggleAttribute('data-bigfull', Boolean(on));
    root.toggleAttribute('data-fullscreen', Boolean(on)); // (nativefeel's: the Mac's rail gets its top back, also when it opens full screen)
    if (on && !was) {
      try {
        if (!store.get('bigscreen.hinted')) {
          // (round 38, hintcalm) one tip at a time (hints.js); remembered once it showed
          const show = () => { if (!root.hasAttribute('data-bigfull') || store.get('bigscreen.hinted')) return null; store.set('bigscreen.hinted', 1); return toast(`Full screen. ${fullKey} or ⛶ in the rail leaves it (Esc doesn't, so typing is safe)`, { timeout: 5000 }); };
          if (window.Hints) Hints.offer({ id: 'bigscreen.full', rank: 20, once: false, ttl: 30000, still: () => root.hasAttribute('data-bigfull'), show }); else show();
        }
      } catch { /* the hint is optional */ }
    }
    if (!on) peek(false);
  }
  function refresh() {
    if (btn) {
      const on = Boolean(info.fullscreen);
      const html = on ? ICON_OUT : ICON_IN;
      if (btn.dataset.state !== String(on)) { btn.innerHTML = html; btn.dataset.state = String(on); }
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.title = on ? `Leave full screen (${fullKey})` : `Full screen (${fullKey})`;
    }
    for (const r of rows) { if (r.isConnected) r.sync(); else rows.delete(r); }
  }

  // ---------- full screen, chats list hidden: rest on the rail to see it ----------
  let peekT = 0; let open = false;
  function peek(on) {
    const panel = document.getElementById('panel');
    if (!panel) return;
    clearTimeout(peekT);
    if (open === on) return;
    open = on;
    panel.classList.toggle('big-peek', on);
  }
  function watchPeek() {
    const rail = document.getElementById('rail'); const panel = document.getElementById('panel');
    if (!rail || !panel) return;
    const can = () => root.hasAttribute('data-bigfull') && panel.classList.contains('hidden');
    rail.addEventListener('pointerenter', () => { clearTimeout(peekT); if (can() && !open) peekT = setTimeout(() => { if (can()) peek(true); }, 350); });
    const away = (e) => { if (e.relatedTarget instanceof Node && (rail.contains(e.relatedTarget) || panel.contains(e.relatedTarget) || e.relatedTarget.closest?.('#menu, .menu-fly, dialog'))) return; clearTimeout(peekT); if (open) peekT = setTimeout(() => peek(false), 300); };
    rail.addEventListener('pointerleave', away);
    panel.addEventListener('pointerleave', away);
    panel.addEventListener('pointerenter', () => { if (open) clearTimeout(peekT); });
    // a chat picked from the list: the list goes with the pointer, as before
    panel.addEventListener('click', (e) => { if (open && e.target.closest?.('.item')) peekT = setTimeout(() => peek(false), 150); });
  }

  // ---------- start ----------
  async function start() {
    if (!big) return;
    big.onDisplay((i) => apply(i));
    railButton();
    watchPeek();
    try { apply(await big.info()); } catch { /* main not ready: the start zoom stays */ }
    // once: a size picked with ⌘/Ctrl + / − before this round becomes this screen's size
    try {
      const old = Number(store.get('zoom.app', 1));
      if (!store.get('bigscreen.migrated')) {
        store.set('bigscreen.migrated', 1);
        if (old && old !== 1 && info.pref === 'auto') await setSize(old);
      }
    } catch { /* fine */ }
    if (typeof AppUI !== 'undefined') {
      AppUI.addAction('Full screen (on / off)', () => toggle());
      AppUI.addAction('Size of everything: bigger', () => zoomStep(1));
      AppUI.addAction('Size of everything: smaller', () => zoomStep(-1));
      AppUI.addAction('Size of everything: automatic for this screen', () => zoomStep(0));
    }
    // (the keys: the keys sheet's Ctrl+= / − / 0 line (keys-ui.js) and nativefeel's F11 / ⌃⌘F lines)
    if (typeof Commands !== 'undefined') {
      if (!Commands.get('fullscreen')) {
        Commands.register({ name: 'fullscreen', aliases: ['full-screen'].filter((a) => !Commands.get(a)), area: 'App', args: 'on | off | status', desc: 'Full screen on / off (remembered for this screen)',
          keywords: 'full screen fullscreen kiosk big screen monitor maximise maximize f11 present',
          complete: () => [{ value: 'on', hint: 'Full screen' }, { value: 'off', hint: 'Windowed' }, { value: 'status', hint: 'Which one now' }],
          run: async (args) => {
            const a = String(args || '').trim().toLowerCase();
            if (/^(status|\?)$/.test(a)) return `${info.fullscreen ? 'Full screen' : 'Windowed'} on ${info.name}. Size of everything ${pct(info.zoom)}${info.pref === 'auto' ? ' (Auto)' : ''}.`;
            return toggle(/^(on|yes|1)$/.test(a) ? true : /^(off|no|0)$/.test(a) ? false : 'toggle');
          } });
      }
      if (!Commands.get('ui-size')) {
        Commands.register({ name: 'ui-size', aliases: ['app-size'].filter((a) => !Commands.get(a)), area: 'Look', args: 'auto | 100 | 125 | 150 | 175 | 200', desc: 'Size of everything on this screen (Auto: picked from the screen\'s size)',
          keywords: 'zoom scale ui size bigger smaller big screen monitor 4k readable distance dpi',
          complete: () => ['auto', '100', '125', '150', '175', '200'].map((v) => ({ value: v, hint: v === 'auto' ? 'From the screen\'s size' : `${v} %` })),
          run: async (args) => {
            const a = String(args || '').trim().toLowerCase().replace('%', '');
            if (!a) return `Size of everything: ${pct(info.zoom)}${info.pref === 'auto' ? ' (Auto)' : ''} on ${info.name}. /ui-size auto | 100 | 125 | 150 | 175 | 200`;
            if (a === 'auto' || a === '0') return setSize('auto');
            const n = Number(a);
            if (!(n > 0)) return 'Say auto or a size like 125';
            return setSize(n > 3 ? n / 100 : n);
          } });
      }
    }
  }
  if (performance.getEntriesByName('hearth:ready').length) setTimeout(start, 0); else addEventListener('hearth:ready', start, { once: true });

  return { toggle, setSize, zoomStep, sizeRow, info: () => ({ ...info }), peek, fullKey };
})();
