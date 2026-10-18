/* (round 64, vstembed64) Serum 2 / Vital's own window inside the Sound desk (docs/upgrades/vstembed64.md).
   The plugin host opens the plugin's editor and makes its window a child of Hearth's window (Windows; on the Mac a
   borderless window kept over this spot); this file keeps it on the desk's placeholder: where it is in the window
   (physical pixels), the part that is on screen (scrolled / clipped by the desk), hidden while the desk is hidden or a
   menu / dialog / panel covers it. Event-driven only (layout, scroll, resize, DPI, clicks that open menus): no timer,
   nothing per frame, a message only when something changed. Pure helpers are exported for Node tests (no DOM there).
   The frame: a slim header ("Vital · its own window" + Open editor here / Pop out / Close editor), the placeholder
   sized to the editor, and one plain line when the editor can't be inside Hearth. */
(function(root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.WorkbenchVSTEmbed = api; })(globalThis, () => {
  // Hearth UI that can sit over the desk: menus, dialogs, floating panels. The ✦ Preset window keeps clear of the frame
  // by itself (it is in its KEEP_CLEAR list), so it isn't one of these.
  const OVERLAYS = 'dialog[open], #menu:not([hidden]), #menu-fly:not([hidden]), #menu-fly2:not([hidden]), .mb-menu, .sb-win, .cmdbar, .palette, [role="dialog"]:not(.ph-win):not(.vx-frame), [role="menu"]:not([hidden]), [role="listbox"].popup';
  const DOCKS = '.wb-storydock';
  const box = r => ({ l: r.left, t: r.top, r: r.right ?? r.left + r.width, b: r.bottom ?? r.top + r.height });
  function intersect(a, b) { const l = Math.max(a.l, b.l), t = Math.max(a.t, b.t), r = Math.min(a.r, b.r), bt = Math.min(a.b, b.b); return r > l && bt > t ? { l, t, r, b: bt } : null; }
  const hits = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  /** Where the editor goes: rect = the placeholder (CSS px, viewport), clips = the boxes that clip it (scrolling
   *  ancestors + the window), covers = boxes of Hearth UI drawn over the desk, dpr = devicePixelRatio, hidden = the desk
   *  isn't shown. → { x, y, clip: [x, y, w, h] | null (all of it shows), visible } in physical client pixels. */
  function geometry({ rect, clips = [], covers = [], dpr = 1, hidden = false }) {
    const r = box(rect), x = Math.round(r.l * dpr), y = Math.round(r.t * dpr);
    if (hidden || !(r.r > r.l) || !(r.b > r.t)) return { x, y, clip: null, visible: false };
    let seen = r;
    for (const c of clips) { seen = intersect(seen, box(c)); if (!seen) return { x, y, clip: null, visible: false }; }
    if (covers.some(c => hits(seen, box(c)))) return { x, y, clip: null, visible: false };
    const whole = seen.l === r.l && seen.t === r.t && seen.r === r.r && seen.b === r.b;
    const px = v => Math.round(v * dpr);
    return { x, y, clip: whole ? null : [px(seen.l), px(seen.t), px(seen.r) - px(seen.l), px(seen.b) - px(seen.t)], visible: true };
  }
  /** The placeholder's CSS size for the editor's own size (physical px). */
  const cssSize = (size, dpr = 1) => Array.isArray(size) && size[0] > 0 ? { w: Math.round(size[0] / dpr), h: Math.round(size[1] / dpr) } : null;
  /** The frame's words for a host state ({ mode, note, why }) and the instrument's name. */
  function words(st = {}, name = 'The instrument') {
    const mode = st.mode || 'closed';
    if (mode === 'embedded') return { title: `${name} · its own window`, buttons: ['pop', 'close'], line: '' };
    if (mode === 'opening') return { title: `Opening ${name}’s window…`, buttons: [], line: '' };
    if (mode === 'floating') return { title: `${name}’s window is open on its own`, buttons: st.embeddable === false ? ['close'] : ['here', 'close'], line: st.note || '' };
    return { title: `${name}’s own window`, buttons: ['here', 'pop'], line: st.note || '' };
  }

  /** The editor frame for one instrument. o: { e (element helper), name, call(action, data) → Promise, fire(action,
   *  data), say(text), os ('win' | 'mac' | 'linux'), remember(choice), auto (open it here at once) }. */
  function frame(o) {
    const { e } = o;
    const el = e('section', null, 'vx-frame'), head = e('div', null, 'vx-head'), title = e('span', '', 'vx-title'), tools = e('span', null, 'vx-tools');
    const slot = e('div', null, 'vx-slot'), line = e('p', '', 'wb-note vx-line');
    el.setAttribute('aria-label', `${o.name} editor`); slot.setAttribute('aria-hidden', 'true');
    head.append(title, tools); el.append(head, slot, line);
    let st = { mode: 'closed' }, sent = '', queued = 0, alive = true, scrollers = [], drawn = '', refreshing = false;
    // (round 64) liveset64's 🎤 Live set on screen: the editor is parked (hidden, still open) so the set's preset pads
    // keep the stage; when it closes, an editor left on a previous instance (a preset twin switch) is reopened on the new one
    const parked = () => document.documentElement.classList.contains('liveset-open');
    function freshen() {
      if (!st.stale || refreshing || parked() || !alive || !['embedded', 'floating'].includes(st.mode)) return;
      refreshing = true; o.call('editor-refresh').then(r => apply(r.editor || r)).catch(() => {}).finally(() => { refreshing = false; });
    }
    const label = { here: 'Open editor here', pop: 'Pop out', close: 'Close editor' };
    const act = {
      here: () => st.mode === 'floating' ? run('editor-embed', { embed: measure() }) : open(true),
      pop: () => st.mode === 'embedded' ? run('editor-pop') : open(false),
      close: () => run('editor-close')
    };
    async function run(action, data = {}) {
      const r = await o.call(action, data);
      apply(r.editor || r);
      if (action === 'editor-embed' || (action === 'editor' && data.embed)) o.remember?.(st.mode === 'embedded' ? 'here' : 'off');
      if (action === 'editor-close' || action === 'editor-pop') o.remember?.('off');
      return st;
    }
    async function open(here) {
      if (st.mode !== 'closed') return st;
      apply({ mode: 'opening' });
      return run('editor', here ? { embed: { ...measure(), visible: true } } : {}).catch(err => { apply({ mode: 'closed', note: '' }); throw err; });
    }
    function paint() {
      const w = words(st, o.name), key = JSON.stringify([w, st.size, st.mode]);
      if (key === drawn) return; drawn = key;
      title.textContent = w.title; line.textContent = w.line; line.hidden = !w.line;
      tools.replaceChildren(...w.buttons.map(k => { const b = e('button', label[k], `vx-btn vx-${k}`); b.type = 'button'; b.onclick = async () => { b.disabled = true; try { await act[k](); } catch (err) { o.say?.(err.message); } finally { b.disabled = false; } }; return b; }));
      el.dataset.mode = st.mode;
      const size = st.mode === 'embedded' ? cssSize(st.size, devicePixelRatio || 1) : null;
      slot.style.width = size ? `${size.w}px` : ''; slot.style.height = size ? `${size.h}px` : '';
    }
    /** The host's view of the editor ({ mode, size, note, embeddable }), from a button's reply or the 1 s readout. */
    function apply(next) {
      if (!next || typeof next !== 'object') return;
      if (!el.isConnected && alive) { requestAnimationFrame(() => { if (alive) apply(next); }); return; } // placed in the page first (its scrollers, its size)
      const was = st.mode; st = { ...st, ...next }; paint(); freshen();
      if (st.mode === 'embedded') { if (was !== 'embedded') { sent = ''; watch(true); } schedule(); } else if (was === 'embedded') watch(false);
    }
    function measure() {
      const r = slot.getBoundingClientRect(), shown = alive && el.isConnected && slot.offsetParent !== null && !document.hidden && !parked();
      // (fixed-position panels have no offsetParent: a non-empty box is what counts)
      const covers = shown ? [...document.querySelectorAll(OVERLAYS)].filter(n => !el.contains(n)).map(n => n.getBoundingClientRect()).filter(b => b.width && b.height) : [];
      const clips = [{ left: 0, top: 0, right: innerWidth, bottom: innerHeight }, ...scrollers.map(n => n.getBoundingClientRect())];
      // bars stuck to the bottom of the Playground (the storyboard strip): the editor ends where they start
      for (const n of document.querySelectorAll(DOCKS)) { const d = n.getBoundingClientRect(); if (d.height && d.top > r.top) clips.push({ left: -1e6, top: -1e6, right: 1e6, bottom: d.top }); }
      return geometry({ rect: r, clips, covers, dpr: devicePixelRatio || 1, hidden: !shown });
    }
    function send() {
      queued = 0; if (st.mode !== 'embedded' || !el.isConnected) return; // a frame no longer on the page never speaks (a newer one does)
      const g = measure(), key = JSON.stringify(g); if (key === sent) return; sent = key;
      o.fire('editor-place', { embed: g });
    }
    const schedule = () => { if (!queued) queued = requestAnimationFrame(send); };
    const later = () => { schedule(); setTimeout(schedule, 60); setTimeout(schedule, 320); }; // menus open / animate after the click
    let ro = null, mo = null, mo2 = null, mo3 = null, mq = null;
    const onDpr = () => { paint(); schedule(); mq?.removeEventListener('change', onDpr); mq = matchMedia(`(resolution: ${devicePixelRatio}dppx)`); mq.addEventListener('change', onDpr); drawn = ''; paint(); };
    function scrollParents() {
      const out = [];
      for (let n = el; n && n !== document.body; n = n.parentElement) { const cs = getComputedStyle(n); if (/(auto|scroll|hidden|clip)/.test(cs.overflowX + cs.overflowY)) out.push(n); }
      return out;
    }
    function watch(on) {
      if (on && !ro) {
        scrollers = scrollParents();
        ro = new ResizeObserver(schedule); ro.observe(slot); ro.observe(el); scrollers.forEach(n => ro.observe(n));
        // something above it grows / shrinks: its containers change size (up to the first scroller)
        for (let n = el.parentElement, k = 0; n && n !== document.body && k < 8; n = n.parentElement, k++) { ro.observe(n); if (scrollers.includes(n)) break; }
        // panels added to the page, menus / folds shown or hidden ([hidden], <details open>, <dialog open>)
        mo = new MutationObserver(later); mo.observe(document.body, { childList: true });
        mo2 = new MutationObserver(later); mo2.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] });
        mo3 = new MutationObserver(() => { later(); freshen(); }); mo3.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] }); // the Live set parks it
        addEventListener('scroll', schedule, { capture: true, passive: true }); addEventListener('resize', schedule);
        addEventListener('pointerdown', later, true); addEventListener('contextmenu', later, true); addEventListener('keydown', later, true); addEventListener('keyup', later, true);
        document.addEventListener('visibilitychange', schedule); document.addEventListener('hearth:activate', later);
        onDpr();
      } else if (!on && ro) {
        ro.disconnect(); mo.disconnect(); mo2.disconnect(); mo3.disconnect(); ro = mo = mo2 = mo3 = null;
        removeEventListener('scroll', schedule, { capture: true }); removeEventListener('resize', schedule);
        removeEventListener('pointerdown', later, true); removeEventListener('contextmenu', later, true); removeEventListener('keydown', later, true); removeEventListener('keyup', later, true);
        document.removeEventListener('visibilitychange', schedule); document.removeEventListener('hearth:activate', later);
        mq?.removeEventListener('change', onDpr); mq = null;
      }
    }
    /** The desk is going away (another tool, the desk redraws): the editor hides, stays open for the way back. */
    function detach() { if (!alive) return; alive = false; if (st.mode === 'embedded') { o.fire('editor-place', { embed: { visible: false } }); } watch(false); }
    paint();
    if (o.state) apply(o.state); // the desk redrew while the editor was open: pick it up where it is
    if (o.auto) setTimeout(() => { if (alive && st.mode === 'closed' && el.isConnected) open(true).catch(err => o.say?.(err.message)); }, 0);
    return { el, slot, apply, open, detach, measure, run, get state() { return st; }, place: send };
  }
  return { OVERLAYS, geometry, cssSize, words, frame, intersect };
});
