// A Chrome view (round 31, chromeview stream): a page of the Hearth Chrome, shown and used inside a Hearth window.
// The owner: "I should only interact with [Chrome] to login, then I wanna do everything within the app". Chrome runs
// out of sight (chromemain.js); this draws its page's frames on a canvas and sends the owner's mouse, wheel, keys,
// typed text (IME too) and pastes to it (chromeview-core.js maps them, chromeviewmain.js passes them on).
//   ChromeView.mount(host, { api, key | id, url, label, app, mac, bar, extra, onNav, onDownload, onClose })
//     api: window.hub.cview (the hub) or window.appWin.cview (an app window): start / stop / visible / resize / nav /
//          cursor / menu / signIn / signedIn / input / ack / onFrame / onEvent
//     bar: its own slim bar (‹ Back · Forward › · ↻ · the address · ⋯); app windows have theirs (bar: false)
//     extra(): more rows for its ⋯ / right-click menu ({ label, action })
//   → { el, id, go(op, url), selection(), signIn(), destroy(), state }
// Frames stop when the view can't be seen (another chat in front, the window hidden or minimized, a popup over it):
// a page nobody looks at costs nothing. Right-click: the page's own menu when it has one, else Hearth's (back, reload,
// copy, paste, open a link in a new view…). A popup the page opens shows over it as another Chrome view.
const ChromeView = (() => {
  const K = window.ChromeViewCore;
  const views = new Map(); // view id → view
  const wired = new WeakSet();
  const mk = (tag, props = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k === 'on') for (const [e, f] of Object.entries(v)) n.addEventListener(e, f); else if (k === 'attrs') for (const [a, b] of Object.entries(v)) n.setAttribute(a, b); else n[k] = v;
    }
    for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
    return n;
  };
  function wire(api) {
    if (wired.has(api)) return;
    wired.add(api);
    api.onFrame((f) => views.get(f?.view)?.frame(f));
    api.onEvent((e) => views.get(e?.view)?.event(e));
  }
  const MAC = /Mac/i.test(navigator.platform || navigator.userAgent || '');

  // ---------- a small menu of its own (the same in the hub and in app windows) ----------
  let menuEl = null;
  function closeMenu() { menuEl?.remove(); menuEl = null; }
  function menu(x, y, items) {
    closeMenu();
    const rows = items.filter(Boolean).map((it) => (it === '-' ? mk('hr') : mk('button', { class: 'cv-mi', disabled: Boolean(it.disabled), on: { click: () => { closeMenu(); it.action?.(); } } }, mk('span', { text: it.label }), it.hint ? mk('small', { text: it.hint }) : null)));
    menuEl = mk('div', { class: 'cv-menu', attrs: { role: 'menu' } }, rows);
    document.body.append(menuEl);
    const r = menuEl.getBoundingClientRect();
    menuEl.style.left = `${Math.max(4, Math.min(x, innerWidth - r.width - 6))}px`;
    menuEl.style.top = `${Math.max(4, Math.min(y, innerHeight - r.height - 6))}px`;
    setTimeout(() => addEventListener('pointerdown', function off(e) { if (!menuEl?.contains(e.target)) { closeMenu(); removeEventListener('pointerdown', off, true); } }, true), 0);
  }
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

  function mount(host, o = {}) {
    const api = o.api;
    if (!api || !K) throw new Error('Chrome views need Hearth\'s desktop app');
    wire(api);
    const mac = o.mac ?? MAC;
    const id = `cv-${Math.random().toString(36).slice(2, 10)}`;
    const st = { url: o.url || '', title: '', address: K.address(o.url || ''), back: false, forward: false, loading: false, signIn: null, signing: false, visible: false, paused: false, gone: false, target: null, frames: 0, meta: null, started: false };
    const btn = (text, title, fn, cls = 'cv-btn') => mk('button', { class: cls, text, title, type: 'button', on: { click: fn } });
    const addr = mk('input', { class: 'cv-addr', type: 'text', spellcheck: false, attrs: { 'aria-label': 'Address' } });
    const bBack = btn('‹ Back', 'Back', () => go('back'));
    const bFwd = btn('Forward ›', 'Forward', () => go('forward'));
    const bar = o.bar === false ? null : mk('div', { class: 'cv-bar' },
      bBack, bFwd, btn('↻', 'Reload', () => go('reload')), addr,
      btn('⋯', 'More', (e) => { const r = e.currentTarget.getBoundingClientRect(); menu(r.right - 220, r.bottom + 4, moreItems()); }));
    const canvas = mk('canvas', { class: 'cv-canvas' });
    const keys = mk('textarea', { class: 'cv-keys', attrs: { 'aria-label': `Typing into ${o.label || 'the page'}`, autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off' }, spellcheck: false });
    const note = mk('div', { class: 'cv-note', hidden: true });
    const strip = mk('div', { class: 'cv-strip', hidden: true });
    const load = mk('div', { class: 'cv-load', hidden: true });
    const stage = mk('div', { class: 'cv-stage' }, canvas, keys, load, note);
    const el = mk('div', { class: 'cv' }, bar, strip, stage);
    el.dataset.view = id;
    host.append(el);
    const ctx = canvas.getContext('2d', { alpha: false });

    // ---------- frames ----------
    let drawing = false; let queued = null;
    async function draw(f) {
      if (drawing) { queued = f; return; } // (one at a time: Chrome waits for the ack, so at most one more is coming)
      drawing = true;
      const t0 = performance.now();
      try {
        const bmp = await createImageBitmap(new Blob([f.data], { type: 'image/jpeg' }));
        if (canvas.width !== bmp.width || canvas.height !== bmp.height) { canvas.width = bmp.width; canvas.height = bmp.height; }
        ctx.drawImage(bmp, 0, 0);
        st.meta = { ...f.meta, frameW: bmp.width, frameH: bmp.height };
        bmp.close?.();
        place();
        st.frames += 1;
        if (!st.started) { st.started = true; if (note.dataset.kind === 'start') showNote(null); }
      } catch { /* a broken frame: the next one comes */ }
      drawing = false;
      api.ack(id, Math.round(performance.now() - t0));
      if (queued) { const q = queued; queued = null; draw(q); }
    }
    // the canvas covers the frame's place in the stage (letterboxed while a resize catches up)
    let placed = '';
    function place() {
      const m = st.meta; if (!m) return;
      const b = K.fit(stage.clientWidth, stage.clientHeight, m.frameW, m.frameH);
      const key = `${b.x}|${b.y}|${b.w}|${b.h}`;
      if (key === placed) return;
      placed = key;
      Object.assign(canvas.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
    }

    // ---------- size and visibility ----------
    const size = () => ({ width: Math.max(1, Math.round(stage.clientWidth)), height: Math.max(1, Math.round(stage.clientHeight)), dpr: devicePixelRatio || 1 });
    let seen = false; let inView = false;
    // seen: on screen (IntersectionObserver) and not hidden by visibility (the hub keeps chats it isn't showing that way)
    const shown = () => { try { return stage.checkVisibility ? stage.checkVisibility({ visibilityProperty: true }) : true; } catch { return true; } };
    function wanted() { return seen && !st.paused && !st.signing && !st.gone && document.visibilityState === 'visible'; }
    function sync() {
      const on = wanted();
      if (on === st.visible || !st.target) return;
      st.visible = on;
      api.visible(id, on, size()).catch(() => {});
    }
    const look = () => { seen = inView && shown(); sync(); };
    const io = new IntersectionObserver((list) => { inView = list.some((x) => x.isIntersecting); look(); });
    io.observe(stage);
    const onVis = () => look();
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('hearth:activate', onVis); // (the hub switched chats)
    const poll = setInterval(() => { if (st.visible || (inView && !seen)) look(); }, 1500); // (anything else that hides it: checked slowly, only while it draws)
    let rzTimer = 0; let lastSize = '';
    const ro = new ResizeObserver(() => {
      place();
      clearTimeout(rzTimer);
      rzTimer = setTimeout(() => { const s = size(); const k = `${s.width}x${s.height}@${s.dpr}`; if (k === lastSize || !st.target || s.width < 4 || s.height < 4) return; lastSize = k; api.resize(id, s).catch(() => {}); }, 120);
    });
    ro.observe(stage);
    const dprQ = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
    const onDpr = () => { lastSize = ''; ro.disconnect(); ro.observe(stage); };
    dprQ.addEventListener?.('change', onDpr);

    // ---------- the mouse ----------
    const clicks = new K.Clicks();
    const pt = (e) => { const r = stage.getBoundingClientRect(); return K.toPage(e.clientX - r.left, e.clientY - r.top, { w: r.width, h: r.height }, st.meta || { deviceWidth: r.width, deviceHeight: r.height }); };
    const sendIn = (list) => { if (st.target && !st.signing) api.input(id, list); };
    let moveQ = null; let wheelQ = null; let raf = 0;
    const flush = () => { raf = 0; const out = []; if (moveQ) { out.push({ m: 'Input.dispatchMouseEvent', p: moveQ }); moveQ = null; } if (wheelQ) { out.push({ m: 'Input.dispatchMouseEvent', p: wheelQ }); wheelQ = null; } if (out.length) sendIn(out); };
    const later = () => { if (!raf) raf = requestAnimationFrame(flush); };
    const now = () => { if (raf) { cancelAnimationFrame(raf); flush(); } };
    let curAt = 0; let curPt = null; let curTimer = 0;
    function askCursor(p) {
      curPt = p;
      if (curTimer) return;
      const wait = Math.max(0, 160 - (performance.now() - curAt));
      curTimer = setTimeout(async () => { curTimer = 0; curAt = performance.now(); const q = curPt; if (!q) return; const c = await api.cursor(id, q.x, q.y).catch(() => 'default'); if (stage.style.cursor !== c) stage.style.cursor = c; }, wait);
    }
    stage.addEventListener('pointerdown', (e) => {
      closeMenu();
      e.preventDefault();
      keys.focus({ preventScroll: true });
      if (e.button === 2) return; // (right-click: the contextmenu event below)
      const p = pt(e); if (!p) return;
      try { stage.setPointerCapture(e.pointerId); } catch { /* fine */ }
      now();
      const n = clicks.press(e.button, p.x, p.y, e.timeStamp || performance.now());
      sendIn([{ m: 'Input.dispatchMouseEvent', p: K.mouse('mouseMoved', e, p) }, { m: 'Input.dispatchMouseEvent', p: K.mouse('mousePressed', e, p, n) }]);
    });
    stage.addEventListener('pointermove', (e) => { const p = pt(e); if (!p) return; moveQ = K.mouse('mouseMoved', e, p); later(); if (!e.buttons) askCursor(p); });
    stage.addEventListener('pointerup', (e) => {
      if (e.button === 2) return;
      const p = pt(e) || (st.meta ? { x: 0, y: 0 } : null); if (!p) return;
      now();
      sendIn([{ m: 'Input.dispatchMouseEvent', p: K.mouse('mouseReleased', e, p, clicks.count()) }]);
    });
    stage.addEventListener('wheel', (e) => { e.preventDefault(); const p = pt(e); if (!p) return; wheelQ = K.addWheel(wheelQ, K.wheel(e, p, st.meta?.deviceHeight || stage.clientHeight)); later(); }, { passive: false });
    stage.addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      const p = pt(e); if (!p) return;
      const r = await api.menu(id, p.x, p.y).catch(() => ({ handled: false }));
      if (r?.handled) return; // (the page showed its own menu)
      menu(e.clientX, e.clientY, contextItems(r || {}));
    });

    // ---------- the keyboard, typed text, pastes ----------
    let composing = false;
    // (the hub's ui.js makes ⌘ also read as Ctrl on a Mac, for its own shortcuts: the page gets the real Control key)
    const real = (e) => ({ key: e.key, code: e.code, keyCode: e.keyCode, location: e.location, repeat: e.repeat, isComposing: e.isComposing, altKey: e.altKey, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.getModifierState ? e.getModifierState('Control') : e.ctrlKey });
    const keyMsgs = (e, up) => K.keys(real(e), { mac, up }).map((p) => ({ m: 'Input.dispatchKeyEvent', p }));
    keys.addEventListener('keydown', (e) => {
      if (composing || e.isComposing || e.keyCode === 229 || e.key === 'Dead') return; // (an input method / a dead key: the text comes as a composition)
      if (K.reserved(real(e), { mac })) return; // (Hearth's own: reload, back, close, the palette…)
      const mod = mac ? e.metaKey : e.ctrlKey;
      if (mod && !e.altKey && String(e.key).toLowerCase() === 'v') { e.stopPropagation(); return; } // (the paste event below brings the clipboard)
      e.preventDefault(); e.stopPropagation();
      now();
      sendIn(keyMsgs(e, false));
    });
    keys.addEventListener('keyup', (e) => {
      if (composing || e.isComposing || e.keyCode === 229 || K.reserved(real(e), { mac })) return;
      e.preventDefault(); e.stopPropagation();
      sendIn(keyMsgs(e, true));
    });
    keys.addEventListener('paste', (e) => {
      e.preventDefault(); e.stopPropagation();
      const text = e.clipboardData?.getData('text/plain') || '';
      if (text) { sendIn([{ m: 'Input.insertText', p: { text } }]); return; }
      // a picture or a file: Chrome pastes it from the clipboard itself (the same computer's clipboard)
      const base = { key: 'v', code: 'KeyV', windowsVirtualKeyCode: 86, modifiers: mac ? 4 : 2 };
      sendIn([{ m: 'Input.dispatchKeyEvent', p: { type: 'rawKeyDown', ...base, ...(mac ? { commands: ['paste'] } : {}) } }, { m: 'Input.dispatchKeyEvent', p: { type: 'keyUp', ...base } }]);
    });
    keys.addEventListener('compositionstart', () => { composing = true; });
    keys.addEventListener('compositionupdate', (e) => { const t = e.data || ''; sendIn([{ m: 'Input.imeSetComposition', p: { text: t, selectionStart: t.length, selectionEnd: t.length } }]); });
    keys.addEventListener('compositionend', (e) => { composing = false; const t = e.data || ''; if (t) sendIn([{ m: 'Input.insertText', p: { text: t } }]); keys.value = ''; });
    keys.addEventListener('input', () => { if (composing) return; const t = keys.value; keys.value = ''; if (t) sendIn([{ m: 'Input.insertText', p: { text: t } }]); }); // (an emoji picker, dictation…)
    keys.addEventListener('focus', () => el.classList.add('focused'));
    keys.addEventListener('blur', () => el.classList.remove('focused'));

    // ---------- the bar, the menus ----------
    function paintBar() {
      if (!bar) return;
      bBack.disabled = !st.back; bFwd.disabled = !st.forward;
      if (document.activeElement !== addr && addr.value !== st.address) addr.value = st.address;
      addr.title = st.url;
    }
    addr.addEventListener('focus', () => { addr.value = st.url; addr.select(); });
    addr.addEventListener('blur', () => { addr.value = st.address; });
    addr.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { go('go', addr.value); keys.focus({ preventScroll: true }); } else if (e.key === 'Escape') { addr.value = st.address; keys.focus({ preventScroll: true }); } });
    const copy = (t) => navigator.clipboard?.writeText(String(t || '')).catch(() => {});
    function moreItems() {
      return [
        { label: 'Sign in (opens Chrome once)', hint: 'the page in Chrome\'s own window, just for signing in', action: () => signIn() },
        { label: 'Copy the address', action: () => copy(st.url) },
        ...(o.extra?.() || []),
      ];
    }
    function contextItems(r) {
      return [
        { label: '‹ Back', disabled: !st.back, action: () => go('back') },
        { label: 'Forward ›', disabled: !st.forward, action: () => go('forward') },
        { label: '↻ Reload', action: () => go('reload') },
        '-',
        r.selection ? { label: 'Copy', action: () => copy(r.selection) } : null,
        r.editable ? { label: 'Paste', action: async () => { const t = await navigator.clipboard?.readText?.().catch(() => '') || ''; if (t) sendIn([{ m: 'Input.insertText', p: { text: t } }]); } } : null,
        { label: 'Select all', action: () => api.nav(id, 'select-all') },
        r.link ? '-' : null,
        r.link ? { label: 'Open the link in a new view', action: () => api.nav(id, 'open-link', r.link) } : null,
        r.link ? { label: 'Copy the link', action: () => copy(r.link) } : null,
        r.image ? { label: 'Copy the picture\'s address', action: () => copy(r.image) } : null,
        '-',
        { label: 'Copy the address', action: () => copy(st.url) },
        ...(o.extra?.() || []),
      ];
    }

    // ---------- notes over the page (opening, signing in, shown elsewhere, closed) and the sign-in strip ----------
    function showNote(kind, text, buttons = []) {
      if (!kind) { note.hidden = true; delete note.dataset.kind; return; }
      note.dataset.kind = kind;
      note.replaceChildren(mk('div', { class: 'cv-note-card' }, mk('p', { text }), buttons.length ? mk('div', { class: 'cv-acts' }, buttons) : null));
      note.hidden = false;
    }
    function paintStrip() {
      const need = st.signIn && !st.signing;
      strip.hidden = !need;
      if (!need) return;
      strip.replaceChildren(
        mk('span', { text: st.signIn === 'refused' ? 'Google wants this sign-in in Chrome\'s own window.' : 'This page wants you to sign in.' }),
        btn('Sign in (opens Chrome once)', 'Chrome\'s own window comes up for the sign-in, then goes away by itself', () => signIn(), 'cv-btn cv-go'),
        btn('✕', 'Not now', () => { strip.hidden = true; st.signIn = null; }));
    }
    async function signIn() {
      showNote('signing', 'Opening Chrome for the sign-in…');
      const r = await api.signIn(id, {}).catch((err) => ({ ok: false, error: err.message }));
      if (!r?.ok) { showNote(null); o.onError?.(r?.error || 'Chrome didn\'t open'); }
      return r;
    }

    // ---------- from Chrome ----------
    const popups = [];
    function event(e) {
      if (e.type === 'nav') {
        Object.assign(st, { url: e.url || st.url, title: e.title || '', address: e.address || K.address(e.url), back: Boolean(e.back), forward: Boolean(e.forward), signIn: e.signIn || null });
        paintBar(); paintStrip();
        o.onNav?.({ ...st });
      } else if (e.type === 'loading') { st.loading = Boolean(e.on); load.hidden = !st.loading; o.onLoading?.(st.loading); }
      else if (e.type === 'signing') {
        st.signing = Boolean(e.on);
        if (st.signing) showNote('signing', 'Signing in, in Chrome\'s own window. This page comes back here when you\'re done.', [btn('I\'m signed in', 'Chrome goes back out of sight, the page carries on here', () => api.signedIn(id).catch(() => {}), 'cv-btn cv-go')]);
        else { showNote(null); keys.focus({ preventScroll: true }); }
        paintStrip(); sync();
      } else if (e.type === 'popup') openPopup(e.id, e.url);
      else if (e.type === 'closed') { st.gone = true; sync(); if (o.onClose) o.onClose(e); else showNote('closed', 'This page was closed.', o.key && o.url ? [btn('Open it again', '', () => restart(), 'cv-btn cv-go')] : []); }
      else if (e.type === 'detached') { st.visible = false; showNote('detached', 'This page is showing in another Hearth window.', [btn('Show it here', '', () => restart(), 'cv-btn cv-go')]); }
      else if (e.type === 'download') o.onDownload?.(e.d);
    }
    function openPopup(pid, url) {
      if (!pid || popups.some((p) => p.pid === pid)) return;
      const layer = mk('div', { class: 'cv-popup' });
      const head = mk('div', { class: 'cv-popup-head' });
      el.append(layer);
      layer.append(head);
      const child = mount(layer, { api, id: pid, url, label: `${o.label || 'Page'} › popup`, mac, bar: false, extra: o.extra,
        onNav: (s) => { head.firstChild && (head.firstChild.textContent = `↗ ${s.title || s.address}`); },
        onClose: () => closePopup(pid, false), onDownload: o.onDownload, onError: o.onError });
      head.append(mk('span', { class: 'cv-popup-title', text: `↗ ${K.address(url) || 'A window the page opened'}` }), btn('✕ Close', 'Close this window', () => closePopup(pid, true)));
      popups.push({ pid, layer, child });
      st.paused = true; sync(); // (the page under it stops drawing while it's covered)
    }
    function closePopup(pid, close) {
      const i = popups.findIndex((p) => p.pid === pid); if (i < 0) return;
      const [p] = popups.splice(i, 1);
      p.child.destroy({ close });
      p.layer.remove();
      if (!popups.length) { st.paused = false; sync(); keys.focus({ preventScroll: true }); }
    }

    // ---------- life ----------
    async function begin() {
      showNote('start', `Opening ${o.label || 'the page'}…`);
      st.gone = false;
      const s = size(); lastSize = `${s.width}x${s.height}@${s.dpr}`;
      const r = await api.start(id, { key: o.key || null, id: o.id || null, url: o.url || '', label: o.label || '', app: o.app || null, visible: wanted() || !seen, ...s }).catch((err) => ({ ok: false, error: err.message }));
      if (!r?.ok) { showNote('error', r?.error || 'Chrome didn\'t answer', o.key && o.url ? [btn('Try again', '', () => restart(), 'cv-btn cv-go')] : []); st.gone = true; return r; }
      st.target = r.id; st.visible = wanted() || !seen;
      if (seen) sync(); // (not yet measured: the first IntersectionObserver call settles it)
      if (r.signing) event({ type: 'signing', on: true });
      return r;
    }
    function restart() { showNote(null); st.started = false; return begin(); }
    function go(op, url) { if (op === 'home') return api.nav(id, 'go', o.url); return api.nav(id, op, url); }
    async function selection() { const r = await api.nav(id, 'copy').catch(() => null); return r?.value || ''; }
    function destroy({ close = false } = {}) {
      for (const p of [...popups]) closePopup(p.pid, close);
      views.delete(id);
      io.disconnect(); ro.disconnect(); dprQ.removeEventListener?.('change', onDpr);
      document.removeEventListener('visibilitychange', onVis); document.removeEventListener('hearth:activate', onVis); clearInterval(poll);
      clearTimeout(curTimer); clearTimeout(rzTimer);
      api.stop(id, { close }).catch(() => {});
      el.remove();
    }
    const view = { el, id, st, frame: (f) => { if (!st.gone) draw(f); }, event, go, selection, signIn, destroy, restart, focus: () => keys.focus({ preventScroll: true }), get state() { return { ...st, meta: st.meta ? { ...st.meta } : null, popups: popups.map((p) => p.pid) }; } };
    views.set(id, view);
    paintBar();
    begin();
    return view;
  }

  return { mount, views, menu, closeMenu };
})();
window.ChromeView = ChromeView;
