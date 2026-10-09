// Capture: Hearth screenshots and records itself, for the owner (an intro video for socials) and for the chats.
// Main side in capturemain.js (capturePage, the hub page's own frame for getDisplayMedia, the REC window, ffmpeg);
// presets in capture-data.js; library + player in capture-view.js; the frame reader in capture-frames.js; the
// annotation editor in capture-annotate.js; scripted tours in capture-tour.js; commands, keys, menus and the agents'
// capture_* tools in capture-cmds.js.
//
// API (everything also reachable by a chat command, see capture-cmds.js):
//   Capture.shot({ target, crop, fit, beautify, clean, hideRail, format, scale, delay, copy, name, attach, annotate, quiet })
//     target: window | tool | chat | dock | lab | rail | panel | composer | region | element | transcript | selector:<css>
//     → { path, w, h, kind: 'shot' }
//   Capture.record({ preset, target, fps, mbps, size, audio, cursor, clicks, keys, countdown, max, mp4, name }) → status
//   Capture.stop() → { path, mp4, webm, duration } · pause() · resume() · mark(label) · status()
//   Capture.pickRegion({ ratio }) → { rect, el } (drag a rectangle, or click a thing; Esc cancels)
//   Capture.beautify(src, preset) / Capture.socialCrop(src, frame, { fit, focus }) → canvas
//   Capture.menu(x, y)   the one capture menu (submenus for everything else)
//   Capture.last()       the newest capture { path, kind, w, h, at }
//   Capture.fx           the overlay layer the recorder and tours draw in (cursor, ripples, keys, captions)
const Capture = (() => {
  const D = CaptureData;
  const api = () => window.hub.capture;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frames2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const IS_MAC = /Mac/.test(navigator.platform);
  const mod = IS_MAC ? '⌘' : 'Ctrl';
  const base = (p) => String(p || '').split(/[\\/]/).pop();
  const fileUrl = (p) => `file:///${String(p).replace(/\\/g, '/').replace(/^\/+/, '')}`.replace(/#/g, '%23').replace(/\?/g, '%3F');

  // ---------- preferences (remembered; one good default each) ----------
  const DEF = {
    shot: { target: 'window', crop: '', fit: 'crop', beautify: '', clean: false, hideRail: false, format: 'png', scale: 'native', copy: false, delay: 0 },
    rec: { preset: 'quick', target: 'window', fps: 30, mbps: 8, size: 'native', audio: 'none', cursor: 'off', clicks: 'off', keys: false, countdown: 3, max: 0, mp4: true, clean: false },
    tc: 'smpte',
  };
  const prefs = (() => { const p = store.get('capture.prefs', {}); return { shot: { ...DEF.shot, ...(p.shot || {}) }, rec: { ...DEF.rec, ...(p.rec || {}) }, tc: p.tc || DEF.tc, told: p.told || {} }; })();
  const savePrefs = () => store.set('capture.prefs', prefs);
  function setPref(group, key, value) { prefs[group][key] = value; savePrefs(); return value; }

  // ---------- keys (keys.js lists every hidden gesture; queued until it loads) ----------
  const keyList = [];
  const keyAdd = (k) => { keyList.push(k); try { if (window.Keys?.add) window.Keys.add({ area: 'Capture', ...k }); } catch { /* the keys list is optional */ } };
  addEventListener('DOMContentLoaded', () => { if (window.Keys?.add && !keyAdd.flushed) { keyAdd.flushed = true; for (const k of keyList) { try { window.Keys.add({ area: 'Capture', ...k }); } catch { /* optional */ } } } });

  // ---------- menus with submenus ----------
  // Items with `items: [...]` (or a function returning them) open in place with a "‹ back" row. Works with the
  // plain showMenu of renderer.js and keeps working if it learns submenus itself.
  function menu(x, y, items, parent = null) {
    const list = (typeof items === 'function' ? items() : items).filter(Boolean);
    const conv = list.map((it) => (it.items ? {
      label: `${it.label}  ›`, more: it.more, danger: it.danger,
      action: () => setTimeout(() => menu(x, y, it.items, list), 0),
    } : it));
    if (parent) conv.unshift({ label: '‹ back', action: () => setTimeout(() => menu(x, y, parent), 0) });
    showMenu(x, y, conv);
  }
  const check = (on) => (on ? '✓ ' : '');

  // ---------- where things are ----------
  const visible = (n) => Boolean(n && n.isConnected && n.checkVisibility?.({ visibilityProperty: true }) !== false && n.getClientRects().length);
  function surfaceEl() {
    let sid = '';
    try { sid = H.surfaceIdFor(H.activeId) || ''; } catch { /* early */ }
    return (sid && document.querySelector(`#surfaces > .surface[data-id="${CSS.escape(sid)}"]`)) || [...document.querySelectorAll('#surfaces > .surface')].find(visible) || document.getElementById('main') || document.getElementById('surfaces');
  }
  const TARGETS = {
    window: { label: 'The whole window', el: () => null },
    tool: { label: 'This tool / chat (no rail)', el: () => surfaceEl() },
    chat: { label: 'The chat messages', el: () => { const s = surfaceEl(); const dock = s?.querySelector('.tool-dock:not([hidden])'); return (dock && visible(dock) ? dock : s)?.querySelector('.messages-wrap') || s?.querySelector('.messages'); } },
    dock: { label: 'The docked director chat', el: () => { const d = surfaceEl()?.querySelector('.tool-dock:not([hidden])'); return d && visible(d) ? d : null; } },
    lab: { label: 'The Lab preview', el: () => [...document.querySelectorAll('.three-preview')].find(visible) || null },
    composer: { label: 'The chat box', el: () => surfaceEl()?.querySelector('.composer') || null },
    rail: { label: 'The rail', el: () => document.getElementById('rail') },
    panel: { label: 'The chats list', el: () => document.getElementById('panel') },
    region: { label: 'A region you drag (or a thing you click)', pick: true },
    element: { label: 'A thing you click', pick: true },
    transcript: { label: 'The whole chat as one tall picture', tall: true },
  };
  const TARGET_ALIAS = { app: 'window', hearth: 'window', full: 'window', all: 'window', panel: 'tool', view: 'tool', surface: 'tool', messages: 'chat', conversation: 'chat', director: 'dock', preview: 'lab', canvas: 'lab', area: 'region', rect: 'region', thing: 'element', pick: 'element', tall: 'transcript', scroll: 'transcript', list: 'panel', sidebar: 'panel', input: 'composer', box: 'composer' };
  const targetId = (t) => { const s = String(t || '').toLowerCase(); return TARGETS[s] ? s : TARGET_ALIAS[s] || (s.startsWith('selector:') ? s : null); };
  function elementFor(t) {
    if (String(t).startsWith('selector:')) { const sel = String(t).slice(9); const all = [...document.querySelectorAll(sel)]; return all.find(visible) || all[0] || null; }
    return TARGETS[t]?.el?.() || null;
  }
  // CSS pixels → window DIPs (Hearth's own zoom setting scales the page)
  const zoom = () => { try { return window.hub.getZoom() || 1; } catch { return 1; } };
  function rectOf(node) {
    const r = node.getBoundingClientRect();
    const x = Math.max(0, r.left); const y = Math.max(0, r.top);
    const w = Math.min(innerWidth, r.right) - x; const h = Math.min(innerHeight, r.bottom) - y;
    if (w < 2 || h < 2) return null;
    return { x, y, width: w, height: h };
  }
  const toDip = (r) => { const z = zoom(); return { x: r.x * z, y: r.y * z, width: r.width * z, height: r.height * z }; };

  // ---------- clean UI: no toasts, menus, scrollbars, carets, hover states (and optionally no rail / chats list) ----------
  let cleanDepth = 0;
  function clean(on, { hideRail = false } = {}) {
    cleanDepth = Math.max(0, cleanDepth + (on ? 1 : -1));
    document.documentElement.classList.toggle('cap-clean', cleanDepth > 0);
    if (on && hideRail) document.documentElement.classList.add('cap-norail');
    if (!on && !cleanDepth) document.documentElement.classList.remove('cap-norail');
    if (on) hideMenu?.();
  }

  // ---------- the overlay layer: cursor, ripples, keys, captions, titles (recordings and tours draw here) ----------
  let fxRoot = null;
  function fx() {
    if (fxRoot?.isConnected) return fxRoot;
    fxRoot = el('div', { id: 'cap-fx', attrs: { 'aria-hidden': 'true' } });
    document.body.append(fxRoot);
    return fxRoot;
  }
  // While recording, animations run on the main thread (an outline color rides along, which can't be composited):
  // the page capture only sees frames the page commits, and compositor-only animations reach it at a fraction of the
  // rate (measured 6 vs 13 frames a second on a slow machine). Outside recordings they stay on the compositor.
  function anim(node, frames, opts) {
    const k = rec ? frames.map((f, i) => ({ ...f, outlineColor: `rgba(0,0,0,${i ? 0.01 : 0})` })) : frames;
    return node.animate(k, opts);
  }
  // A 2-pixel poke while recording: the page capture only sends a frame when the page repaints, and can drop a lone
  // change that lands right after the previous frame. When no frame came for a while, one tiny repaint makes it send the
  // current picture (a static screen costs a few 2-pixel repaints a second; a moving one none).
  let beat = null;
  function heartbeat(on) {
    beat?.dot.remove(); beat = null;
    if (!on) return;
    const dot = el('i', { class: 'cap-beat' });
    document.body.append(dot); // its own 2-pixel layer, never the full-window overlay (that would repaint the window)
    beat = { dot, n: 0 };
  }
  function poke() { if (!beat) return; beat.n ^= 1; beat.dot.style.backgroundColor = beat.n ? 'rgba(0,0,0,0.02)' : 'rgba(0,0,0,0.03)'; }

  // a cursor drawn into the page (the page capture has no OS cursor): follows the mouse, or glides on tours
  const cursorFx = {
    style: 'off', node: null, x: innerWidth / 2, y: innerHeight / 2, keys: false, clicks: 'off',
    set(style, { clicks, keys } = {}) {
      this.style = style || 'off';
      if (clicks) this.clicks = clicks;
      if (keys != null) this.keys = Boolean(keys);
      this.node?.remove(); this.node = null;
      if (this.style !== 'off') {
        this.node = el('div', { class: `cap-cursor cap-cursor-${this.style}` });
        fx().append(this.node);
        this.place(this.x, this.y);
      }
      this.listen(this.style !== 'off' || this.clicks !== 'off' || this.keys);
    },
    place(x, y) { this.x = x; this.y = y; if (this.node) this.node.style.transform = `translate(${x}px, ${y}px)`; },
    // a smooth glide on the compositor (tours): one animation, the end position written once
    async glide(x, y, ms = 700, ease = D.EASES[0].css) {
      if (!this.node) { this.place(x, y); return; }
      const from = `translate(${this.x}px, ${this.y}px)`; const to = `translate(${x}px, ${y}px)`;
      const a = anim(this.node, [{ transform: from }, { transform: to }], { duration: ms, easing: ease, fill: 'forwards' });
      await a.finished.catch(() => {});
      this.place(x, y); a.cancel();
    },
    ripple(x, y) {
      if (this.clicks === 'off') return;
      const r = el('div', { class: `cap-ripple cap-ripple-${this.clicks}` });
      r.style.transform = `translate(${x}px, ${y}px)`;
      fx().append(r);
      const k = this.clicks === 'burst' ? [{ opacity: 1, scale: 0.3 }, { opacity: 0, scale: 2.2 }] : this.clicks === 'pulse' ? [{ opacity: 0.7, scale: 0.6 }, { opacity: 0, scale: 1.6 }] : [{ opacity: 0.9, scale: 0.2 }, { opacity: 0, scale: 1.8 }];
      const a = anim(r, k.map((f) => ({ opacity: f.opacity, transform: `translate(${x}px, ${y}px) scale(${f.scale})` })), { duration: 520, easing: 'cubic-bezier(.2,.7,.3,1)' });
      a.finished.finally(() => r.remove());
    },
    keyShow(text) {
      if (!this.keys) return;
      let box = fx().querySelector('.cap-keys');
      if (!box) { box = el('div', { class: 'cap-keys' }); fx().append(box); }
      const k = el('kbd', { text });
      box.append(k);
      while (box.children.length > 4) box.firstChild.remove();
      anim(k, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 140, easing: 'ease-out' });
      setTimeout(() => anim(k, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 }).finished.finally(() => k.remove()), 1400);
    },
    listening: false,
    onMove: null, onDown: null, onKey: null,
    listen(on) {
      if (on === this.listening) return;
      this.listening = on;
      if (on) {
        this.onMove = (e) => this.place(e.clientX, e.clientY);
        this.onDown = (e) => this.ripple(e.clientX, e.clientY);
        this.onKey = (e) => {
          if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
          const typing = e.target?.closest?.('input, textarea, [contenteditable="true"]') && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1;
          if (typing) return; // letters typed in a box aren't shortcuts
          this.keyShow(keyLabel(e));
        };
        addEventListener('pointermove', this.onMove, { passive: true, capture: true });
        addEventListener('pointerdown', this.onDown, { passive: true, capture: true });
        addEventListener('keydown', this.onKey, { capture: true });
      } else {
        removeEventListener('pointermove', this.onMove, { capture: true });
        removeEventListener('pointerdown', this.onDown, { capture: true });
        removeEventListener('keydown', this.onKey, { capture: true });
      }
    },
  };
  function keyLabel(e) {
    const parts = [];
    if (e.ctrlKey) parts.push(IS_MAC ? '⌘' : 'Ctrl');
    if (e.altKey) parts.push(IS_MAC ? '⌥' : 'Alt');
    if (e.shiftKey) parts.push(IS_MAC ? '⇧' : 'Shift');
    const k = { ' ': 'Space', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'Esc', Enter: '↵' }[e.key] || (e.key.length === 1 ? e.key.toUpperCase() : e.key);
    parts.push(k);
    return parts.join(IS_MAC ? '' : '+');
  }

  // ---------- picking a region or a thing ----------
  // Drag a rectangle, or click a thing (it outlines what's under the pointer). Shift keeps a ratio, Alt draws from the
  // center, Space moves the rectangle while dragging, arrows nudge it after, Enter takes it, Esc cancels.
  function pickRegion({ ratio = null, hint = '' } = {}) {
    return new Promise((resolve) => {
      hideMenu?.();
      const ov = el('div', { class: 'cap-pick' });
      const box = el('div', { class: 'cap-pick-box', hidden: true });
      const hover = el('div', { class: 'cap-pick-hover', hidden: true });
      const tip = el('div', { class: 'cap-pick-tip', text: hint || `Drag a region · or click a thing · Shift keeps ${ratio ? ratio.label || 'the ratio' : 'a square'} · Alt from the center · Esc cancels` });
      const size = el('div', { class: 'cap-pick-size', hidden: true });
      ov.append(hover, box, size, tip);
      document.body.append(ov);
      let start = null; let rect = null; let moving = null; let hoverEl = null; let done = false;
      const under = (x, y) => document.elementsFromPoint(x, y).find((n) => !ov.contains(n) && n !== document.documentElement && n !== document.body) || null;
      const paint = () => {
        if (!rect) { box.hidden = true; size.hidden = true; return; }
        Object.assign(box.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
        box.hidden = false; size.hidden = false;
        const z = zoom(); const dpr = devicePixelRatio || 1;
        size.textContent = `${Math.round(rect.width * dpr)} × ${Math.round(rect.height * dpr)}${z !== 1 ? '' : ''}`;
        Object.assign(size.style, { left: `${rect.x}px`, top: `${Math.max(0, rect.y - 22)}px` });
      };
      const finish = (val) => {
        if (done) return; done = true;
        ov.remove(); removeEventListener('keydown', onKey, true);
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(null); return; }
        if (e.key === 'Enter' && rect) { e.preventDefault(); e.stopPropagation(); finish({ rect, el: null }); return; }
        if (rect && e.key.startsWith('Arrow') && !start) {
          e.preventDefault(); e.stopPropagation();
          const d = e.shiftKey ? 10 : 1;
          if (e.altKey) { if (e.key === 'ArrowRight') rect.width += d; if (e.key === 'ArrowLeft') rect.width = Math.max(4, rect.width - d); if (e.key === 'ArrowDown') rect.height += d; if (e.key === 'ArrowUp') rect.height = Math.max(4, rect.height - d); }
          else { if (e.key === 'ArrowRight') rect.x += d; if (e.key === 'ArrowLeft') rect.x -= d; if (e.key === 'ArrowDown') rect.y += d; if (e.key === 'ArrowUp') rect.y -= d; }
          paint();
        }
        if (e.key === ' ' && start) { e.preventDefault(); moving = moving || { x: lastX, y: lastY }; }
      };
      let lastX = 0; let lastY = 0;
      addEventListener('keydown', onKey, true);
      addEventListener('keyup', (e) => { if (e.key === ' ') moving = null; }, true);
      ov.addEventListener('pointermove', (e) => {
        lastX = e.clientX; lastY = e.clientY;
        if (!start) {
          const n = under(e.clientX, e.clientY);
          if (n !== hoverEl) {
            hoverEl = n;
            const r = n && rectOf(n);
            hover.hidden = !r;
            if (r) Object.assign(hover.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.width}px`, height: `${r.height}px` });
          }
          return;
        }
        if (moving) { const dx = e.clientX - moving.x; const dy = e.clientY - moving.y; start.x += dx; start.y += dy; moving = { x: e.clientX, y: e.clientY }; }
        let w = e.clientX - start.x; let h = e.clientY - start.y;
        if (e.shiftKey) { const k = ratio ? ratio.w / ratio.h : 1; const aw = Math.abs(w); const ah = Math.abs(h); if (aw / k > ah) h = Math.sign(h || 1) * (aw / k); else w = Math.sign(w || 1) * (ah * k); }
        const cx = e.altKey ? start.x - w : start.x;
        const cy = e.altKey ? start.y - h : start.y;
        const x0 = Math.min(cx, start.x + w); const y0 = Math.min(cy, start.y + h);
        rect = { x: Math.max(0, x0), y: Math.max(0, y0), width: Math.min(innerWidth, Math.max(cx, start.x + w)) - Math.max(0, x0), height: Math.min(innerHeight, Math.max(cy, start.y + h)) - Math.max(0, y0) };
        hover.hidden = true;
        paint();
      });
      ov.addEventListener('pointerdown', (e) => { if (e.button !== 0) { finish(null); return; } ov.setPointerCapture(e.pointerId); start = { x: e.clientX, y: e.clientY }; rect = null; });
      ov.addEventListener('pointerup', (e) => {
        if (!start) return;
        const dragged = rect && rect.width > 6 && rect.height > 6;
        start = null;
        if (dragged && !e.ctrlKey) { finish({ rect, el: null }); return; } // Ctrl held: adjust with the arrows, Enter takes it
        if (!dragged) { const n = under(e.clientX, e.clientY); const r = n && rectOf(n); if (r) finish({ rect: r, el: n }); }
      });
      ov.addEventListener('contextmenu', (e) => { e.preventDefault(); finish(null); });
    });
  }

  // ---------- pictures: load, crop to a social frame, beautify ----------
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      if (src instanceof HTMLCanvasElement || src instanceof HTMLImageElement) { resolve(src); return; }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read the picture'));
      img.src = /^data:|^blob:|^file:/.test(src) ? src : fileUrl(src);
    });
  }
  const dims = (im) => ({ w: im.naturalWidth || im.width, h: im.naturalHeight || im.height });
  // crop: fill the frame (cut the sides), fit: the whole picture on a background; focus: 0..1 where to keep
  function socialCrop(img, frame, { fit = 'crop', focus = { x: 0.5, y: 0.5 }, bg = 'blur', exact = true } = {}) {
    const { w: iw, h: ih } = dims(img);
    const k = frame.w / frame.h;
    let W = frame.w; let H = frame.h;
    if (!exact) { if (iw / ih > k) { H = ih; W = Math.round(ih * k); } else { W = iw; H = Math.round(iw / k); } }
    const c = el('canvas', { width: W, height: H });
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    if (fit === 'fit') {
      paintBackground(g, W, H, D.BACKGROUNDS.find((b) => b.id === bg) || D.BACKGROUNDS.find((b) => b.id === 'blur'), img);
      const s = Math.min(W / iw, H / ih) * 0.92;
      const dw = iw * s; const dh = ih * s;
      g.save(); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = Math.round(W * 0.03); g.shadowOffsetY = Math.round(W * 0.01);
      g.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh); g.restore();
    } else {
      let sw = iw; let sh = ih;
      if (iw / ih > k) sw = ih * k; else sh = iw / k;
      const sx = Math.max(0, Math.min(iw - sw, focus.x * iw - sw / 2));
      const sy = Math.max(0, Math.min(ih - sh, focus.y * ih - sh / 2));
      g.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    }
    if (frame.safe) { // story safe zones drawn as faint bands (a guide picture, never on recordings)
      g.fillStyle = 'rgba(255,0,0,.12)'; g.fillRect(0, 0, W, H * frame.safe.top); g.fillRect(0, H * (1 - frame.safe.bottom), W, H * frame.safe.bottom);
    }
    return c;
  }
  function paintBackground(g, W, H, bg, img) {
    if (!bg || bg.kind === 'none') { g.clearRect(0, 0, W, H); return; }
    if (bg.kind === 'blur' && img) {
      g.save(); g.filter = `blur(${Math.round(Math.max(W, H) / 22)}px) saturate(1.4) brightness(.8)`;
      g.drawImage(img, -W * 0.1, -H * 0.1, W * 1.2, H * 1.2); g.restore(); return;
    }
    const st = bg.stops || ['#000'];
    if (bg.kind === 'mesh') {
      // a mesh gradient: the first color as the base, soft blobs of the others at fixed spots
      g.fillStyle = st[0]; g.fillRect(0, 0, W, H);
      const spots = [[0.18, 0.22, 0.75], [0.82, 0.3, 0.7], [0.5, 0.85, 0.8], [0.12, 0.88, 0.55], [0.88, 0.9, 0.5]];
      st.slice(1).forEach((c, i) => {
        const [x, y, r] = spots[i % spots.length];
        const gr = g.createRadialGradient(x * W, y * H, 0, x * W, y * H, Math.max(W, H) * r);
        gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = 0.85; g.fillStyle = gr; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
      });
      return;
    }
    let fill = st[0];
    if (bg.kind === 'linear' && st.length > 1) {
      const a = ((bg.angle ?? 135) * Math.PI) / 180; const r = Math.hypot(W, H) / 2;
      const gr = g.createLinearGradient(W / 2 - Math.sin(a) * r, H / 2 + Math.cos(a) * r, W / 2 + Math.sin(a) * r, H / 2 - Math.cos(a) * r);
      st.forEach((s, i) => gr.addColorStop(i / (st.length - 1), s)); fill = gr;
    } else if (bg.kind === 'radial' && st.length > 1) {
      const gr = g.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      st.forEach((s, i) => gr.addColorStop(i / (st.length - 1), s)); fill = gr;
    }
    g.fillStyle = fill; g.fillRect(0, 0, W, H);
  }
  const roundRect = (g, x, y, w, h, r) => { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); };
  // The picture on a background with padding, rounded corners, a shadow and an optional window bar / phone bezel.
  // "bg:aurora pad:l corners:24 shadow:strong bar:mac" (any order, each optional) → overrides for beautify()
  function beautyArgs(words) {
    const o = {};
    for (const w of [].concat(words || [])) {
      const [k, v] = String(w).toLowerCase().split(':');
      if (v == null) continue;
      if ((k === 'bg' || k === 'background') && D.BACKGROUNDS.some((b) => b.id === v)) o.bg = v;
      else if (k === 'pad' || k === 'padding') { const p = D.PADS.find((x) => x.id === v); if (p) o.pad = p.pad; else if (Number.isFinite(Number(v))) o.pad = Math.min(0.4, Number(v) / 100); }
      else if (k === 'corners' || k === 'radius') { const c = D.CORNERS.find((x) => x.id === v); o.radius = c ? c.radius : Math.max(0, Number(v) || 0); }
      else if (k === 'shadow') { const sh = D.SHADOWS.find((x) => x.id === v); if (sh) o.shadow = sh.shadow; }
      else if ((k === 'bar' || k === 'chrome' || k === 'window') && D.CHROME.some((c) => c.id === v)) o.chrome = v;
    }
    return o;
  }
  // the owner's own mix, remembered (menus: Beautify → Background / Padding / Corners / Shadow / Window bar)
  const beautyMix = () => store.get('capture.beautyMix', {});
  function setBeautyMix(k, v) { const m = { ...beautyMix(), [k]: v }; store.set('capture.beautyMix', m); return m; }
  function beautify(img, preset = 'forge', over = {}) {
    const p = { ...(D.BEAUTIFY.find((b) => b.id === preset) || D.BEAUTIFY[1]), ...(preset === 'mine' ? beautyMix() : {}), ...over };
    const { w: iw, h: ih } = dims(img);
    const pad = Math.round(Math.max(iw, ih) * (p.pad ?? 0.08));
    const bar = p.chrome === 'mac' || p.chrome === 'win' || p.chrome === 'minimal' ? Math.round(Math.max(28, iw * 0.022)) : p.chrome === 'browser' ? Math.round(Math.max(44, iw * 0.034)) : 0;
    const bezel = p.chrome === 'phone' ? Math.round(Math.min(iw, ih) * 0.045) : 0;
    const cw = iw + bezel * 2; const ch = ih + bar + bezel * 2;
    const W = cw + pad * 2; const H = ch + pad * 2;
    const c = el('canvas', { width: W, height: H });
    const g = c.getContext('2d');
    paintBackground(g, W, H, D.BACKGROUNDS.find((b) => b.id === p.bg) || D.BACKGROUNDS[0], img);
    const r = Math.round((p.radius || 0) * (Math.max(iw, ih) / 1400));
    if (p.shadow) {
      g.save(); g.shadowColor = `rgba(0,0,0,${p.shadow})`; g.shadowBlur = Math.round(pad * 0.6 + 12); g.shadowOffsetY = Math.round(pad * 0.18 + 4);
      roundRect(g, pad, pad, cw, ch, r + bezel); g.fillStyle = '#111'; g.fill(); g.restore();
    }
    g.save(); roundRect(g, pad, pad, cw, ch, r + bezel); g.clip();
    if (bezel) { g.fillStyle = '#0b0b0d'; g.fillRect(pad, pad, cw, ch); }
    if (bar) {
      const dark = p.chrome !== 'minimal' || true;
      g.fillStyle = p.chrome === 'win' ? '#202020' : p.chrome === 'browser' ? '#2a2a2e' : dark ? '#1d1d20' : '#eee';
      g.fillRect(pad, pad, cw, bar);
      const cy = pad + bar / 2; const rr = Math.max(5, bar * 0.2);
      if (p.chrome === 'mac' || p.chrome === 'browser') ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => { g.beginPath(); g.arc(pad + bar * 0.6 + i * rr * 3.2, cy, rr, 0, Math.PI * 2); g.fillStyle = col; g.fill(); });
      if (p.chrome === 'minimal') [0, 1, 2].forEach((i) => { g.beginPath(); g.arc(pad + bar * 0.6 + i * rr * 3, cy, rr * 0.8, 0, Math.PI * 2); g.fillStyle = '#5b5b62'; g.fill(); });
      if (p.chrome === 'win') { g.fillStyle = '#cfcfcf'; g.font = `${Math.round(bar * 0.42)}px system-ui, sans-serif`; g.textBaseline = 'middle'; g.fillText('Hearth', pad + bar * 0.5, cy); g.fillText('—   ☐   ✕', pad + cw - bar * 3.2, cy); }
      if (p.chrome === 'browser') { const ax = pad + bar * 3.6; roundRect(g, ax, pad + bar * 0.22, cw - (ax - pad) - bar * 0.6, bar * 0.56, bar * 0.28); g.fillStyle = '#3b3b40'; g.fill(); g.fillStyle = '#c9c9cf'; g.font = `${Math.round(bar * 0.34)}px system-ui, sans-serif`; g.textBaseline = 'middle'; g.fillText('hearth.app', ax + bar * 0.4, cy); }
    }
    g.drawImage(img, pad + bezel, pad + bar + bezel, iw, ih);
    if (bezel) { // the speaker notch of a phone
      const nw = cw * 0.28; roundRect(g, pad + (cw - nw) / 2, pad + bezel * 0.35, nw, bezel * 0.5, bezel * 0.25); g.fillStyle = '#0b0b0d'; g.fill();
    }
    g.restore();
    return c;
  }
  const canvasData = (c, format = 'png', q = 0.92) => c.toDataURL(format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png', q);

  // ---------- screenshots ----------
  let last = null;
  const recent = [];
  function remember(item) {
    last = { ...item, at: Date.now() };
    recent.unshift(last); recent.length = Math.min(recent.length, 30);
    document.dispatchEvent(new CustomEvent('hearth:capture', { detail: last }));
    return last;
  }
  async function countdown(n, label = '') {
    if (!n) return;
    const box = el('div', { class: 'cap-count' }, el('b', { text: String(n) }), label ? el('span', { text: label }) : null);
    fx().append(box);
    for (let i = n; i > 0; i -= 1) {
      box.firstChild.textContent = String(i);
      box.firstChild.animate([{ transform: 'scale(1.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, easing: 'ease-out' });
      await sleep(1000);
    }
    box.remove();
    await frames2();
  }
  // the picture of a target as a data URL (no file), for the canvas work and stitching
  async function grab(rect, o = {}) {
    const r = await api().shot({ rect: rect ? toDip(rect) : undefined, save: false, format: 'png', scale: o.scale || 'native' });
    return r.dataUrl;
  }
  async function labPicture({ size = null } = {}) {
    if (typeof ThreeLab === 'undefined') throw new Error('The Three.js Lab isn\'t loaded');
    let restore = null;
    if (size) {
      const c = await ThreeLab.cmd({ show: true });
      const before = c.state.frame?.id;
      if (before !== size) { c.size(size); restore = () => c.size(before); await sleep(2200); }
    }
    try {
      const url = await ThreeLab.shot();
      if (!url) throw new Error('The Lab preview isn\'t drawing (open the Lab first)');
      return url;
    } finally { restore?.(); }
  }
  // the chat as one tall picture: scroll it page by page, capture each, stitch (no reflow, nothing re-rendered)
  async function transcript({ lastN = 0, maxH = 30000 } = {}) {
    const wrap = TARGETS.chat.el();
    const scroller = wrap && ([wrap, ...wrap.querySelectorAll('.messages')].find((n) => n.scrollHeight > n.clientHeight + 2) || wrap);
    if (!scroller) throw new Error('No chat on screen');
    const r = rectOf(scroller);
    if (!r) throw new Error('The chat isn\'t visible');
    const keep = scroller.scrollTop; const behavior = scroller.style.scrollBehavior;
    scroller.style.scrollBehavior = 'auto';
    let from = 0;
    if (lastN > 0) { const msgs = [...scroller.querySelectorAll('.msg')]; const m = msgs[Math.max(0, msgs.length - lastN)]; if (m) from = Math.max(0, m.offsetTop - 8); }
    const total = scroller.scrollHeight;
    const view = scroller.clientHeight;
    clean(true);
    document.documentElement.classList.add('cap-stitching');
    let canvas = null; let g = null; let k = 1;
    try {
      for (let y = from; y < total; y += view) {
        scroller.scrollTop = y;
        await frames2(); await sleep(60);
        const top = scroller.scrollTop;
        const img = await loadImage(await grab(r));
        if (!canvas) {
          k = img.naturalWidth / r.width;
          const H = Math.min(maxH, Math.round((total - from) * k));
          canvas = el('canvas', { width: img.naturalWidth, height: H });
          g = canvas.getContext('2d');
        }
        g.drawImage(img, 0, Math.round((top - from) * k));
        if ((top - from + view) * k >= canvas.height || top + view >= total) break;
      }
    } finally {
      scroller.scrollTop = keep; scroller.style.scrollBehavior = behavior;
      document.documentElement.classList.remove('cap-stitching');
      clean(false);
    }
    return canvas;
  }

  async function shot(opts = {}) {
    const o = { ...prefs.shot, ...opts };
    let t = targetId(o.target) || (String(o.target || '').startsWith('selector:') ? o.target : 'window');
    if (o.selector) t = `selector:${o.selector}`;
    const frame = o.crop ? D.parseFrame(o.crop) : null;
    if (o.crop && !frame) throw new Error(`Unknown frame "${o.crop}" (try 9:16, 4:5, 1:1, 16:9, reels…)`);
    let rect = null; let node = null;
    if (TARGETS[t]?.pick) {
      const p = await pickRegion({ ratio: frame, hint: t === 'element' ? 'Click the thing to capture · Esc cancels' : '' });
      if (!p) return null;
      rect = p.rect; node = p.el;
      await frames2();
    } else if (t !== 'window' && t !== 'transcript' && t !== 'lab') {
      node = elementFor(t);
      if (!node) throw new Error(`Nothing to capture for "${o.target}" on screen`);
      rect = rectOf(node);
      if (!rect) throw new Error(`"${o.target}" isn't visible`);
    }
    if (o.delay) await countdown(Number(o.delay), 'screenshot');
    let src = null; // a canvas / data URL when the picture needs work in the page
    let saved = null;
    const needsWork = Boolean(frame || o.beautify || o.annotate || t === 'transcript' || t === 'lab' || o.format === 'webp');
    if (t === 'transcript') src = await transcript({ lastN: Number(o.lastN) || 0 });
    else if (t === 'lab' && (o.full !== false)) src = await labPicture({ size: o.labSize || null }).catch(async (err) => { if (o.full) throw err; const n = elementFor('lab'); if (!n) throw err; return grab(rectOf(n)); });
    else {
      clean(Boolean(o.clean) || Boolean(o.hideRail), { hideRail: Boolean(o.hideRail) });
      try {
        if (o.clean || o.hideRail) { await frames2(); await sleep(o.hideRail ? 160 : 40); if (node) rect = rectOf(node) || rect; }
        if (needsWork) src = await grab(t === 'window' ? null : rect, { scale: o.scale });
        else saved = await api().shot({ rect: t === 'window' ? undefined : toDip(rect), format: o.format, quality: o.quality, scale: o.scale, name: o.name || nameFor(t) });
      } finally { if (o.clean || o.hideRail) clean(false); }
    }
    if (!saved) {
      let img = await loadImage(src);
      if (frame) img = socialCrop(img, frame, { fit: o.fit, bg: o.fitBg || 'blur', exact: o.exact !== false });
      if (o.beautify) img = beautify(img, o.beautify === true ? 'forge' : o.beautify);
      const fmt = o.format || 'png';
      const data = img instanceof HTMLCanvasElement ? canvasData(img, fmt, o.quality ?? 0.92) : src;
      const path = await api().save({ name: o.name || nameFor(t, frame), data, ext: fmt === 'jpg' ? 'jpg' : fmt === 'webp' ? 'webp' : 'png' });
      const { w, h } = dims(img);
      saved = { path, w, h };
    }
    const item = remember({ kind: 'shot', path: saved.path, w: saved.w, h: saved.h, target: t, frame: frame?.id || null });
    if (o.copy) { try { await copyImage(saved.path); } catch { /* clipboard is a bonus */ } }
    if (o.annotate && typeof CaptureAnnotate !== 'undefined') {
      const p = await CaptureAnnotate.open(saved.path);
      if (p) Object.assign(item, remember({ ...item, path: p }));
    }
    if (o.attach) await attachToChat(item.path, o.attach === true ? null : o.attach);
    if (!o.quiet) toast(`📷 ${base(item.path)} · ${item.w}×${item.h}${o.copy ? ' · copied' : ''}`, { timeout: 3500, action: { label: 'Open', fn: () => CaptureView.open(item.path) } });
    return item;
  }
  function nameFor(t, frame) {
    const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-');
    let where = t;
    if (t === 'tool') { try { const sid = H.surfaceIdFor(H.activeId) || ''; where = sid.startsWith('tool:') ? (Tools.get(sid.slice(5))?.name || sid.slice(5)) : (H.agent(sid)?.name || 'chat'); } catch { /* a plain name */ } }
    if (String(t).startsWith('selector:')) where = 'element';
    return `Hearth ${where}${frame ? ` ${frame.id.replace(':', 'x')}` : ''} ${stamp}`;
  }

  // ---------- the clipboard: the page's own clipboard API (as the Lab does), main's as a fallback ----------
  async function copyImage(src) {
    try {
      const img = await loadImage(src);
      const c = el('canvas', { width: dims(img).w, height: dims(img).h });
      c.getContext('2d').drawImage(img, 0, 0);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch { return api().copyImage(String(src)); }
  }

  // ---------- chats: attach a capture to the chat you're in ----------
  function chatAgent(agentId) {
    if (agentId && H.agent(agentId)?.mode === 'native') return H.agent(agentId);
    const active = H.activeId || '';
    const toolId = active.startsWith('tool:') ? active.slice(5) : null;
    return (toolId && H.agents().find((a) => a.dock === toolId && a.mode === 'native')) || (H.agent(active)?.mode === 'native' ? H.agent(active) : null) || H.claudeAgent();
  }
  async function attachToChat(path, agentId = null) {
    const agent = chatAgent(agentId);
    if (!agent) throw new Error('No chat agent to attach it to');
    let p = path;
    // chats read attachments from the attachments folder (Claude's Read tool is limited to it)
    if (/\.(png|jpe?g|webp|gif)$/i.test(p)) { try { p = await window.hub.saveAttachment(base(p), await window.hub.fs.read(p, { encoding: 'base64' })); } catch { /* keep the original */ } }
    else if (/\.(webm|mp4|mov|m4v)$/i.test(p) && typeof FrameRead !== 'undefined') {
      // a video: its contact sheet goes in (pictures, not the file)
      const sheet = await FrameRead.sheet(p, { layout: '4x3' });
      p = await window.hub.saveAttachment(base(sheet.path), await window.hub.fs.read(sheet.path, { encoding: 'base64' }));
    }
    await Native.attachPaths(agent.id, [p]);
    toast(`Attached to ${agent.name}: write what you want and send`, { timeout: 2500 });
    return agent.id;
  }

  // ---------- recording ----------
  let rec = null; // { opts, stream, recorder, started, pausedAt, pausedMs, marks, id, path, timer, … }
  const pending = { stop: null };
  const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function elapsed() { if (!rec) return 0; const now = rec.pausedAt || performance.now(); return Math.max(0, (now - rec.started - rec.pausedMs) / 1000); }
  function status() {
    if (!rec) return { recording: false, last: last ? { path: last.path, kind: last.kind } : null };
    return { recording: true, paused: Boolean(rec.pausedAt), seconds: Math.round(elapsed() * 10) / 10, framesIn: rec.framesIn || 0, framesOut: rec.framesOut || 0, target: rec.opts.target, fps: rec.opts.fps, size: rec.size, audio: rec.audioNote || rec.opts.audio, marks: rec.marks.length, path: rec.path, tour: rec.tour || null };
  }
  function resolveRec(opts = {}) {
    const preset = D.RECORD.find((p) => p.id === (opts.preset || prefs.rec.preset)) || null;
    const o = { ...prefs.rec, ...(preset || {}), ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined && v !== '')) };
    o.fps = Math.max(5, Math.min(120, Number(o.fps) || 30));
    o.mbps = Math.max(1, Math.min(120, Number(o.mbps) || 8));
    o.target = targetId(o.target) || (String(o.target || '').startsWith('selector:') ? o.target : 'window');
    if (o.target === 'transcript') o.target = 'chat';
    return o;
  }
  // The audio: the hub page's own sound comes with the page capture on every platform; the whole computer's sound only on
  // Windows (macOS needs extra software for that, explained once); the microphone is mixed in with Web Audio.
  async function audioFor(o, display) {
    const tracks = [];
    let note = '';
    const wantMic = o.audio === 'mic' || o.audio === 'app+mic';
    const appTracks = display.getAudioTracks();
    if ((o.audio === 'app' || o.audio === 'app+mic' || o.audio === 'system') && !appTracks.length) note = 'no app sound track';
    if (o.audio === 'system' && !/Win/.test(navigator.platform)) {
      note = 'Hearth\'s own sound (this computer can\'t share its whole sound)';
      if (!prefs.told.loopback) { prefs.told.loopback = true; savePrefs(); toast(IS_MAC ? 'macOS can\'t record the whole computer\'s sound without extra software (BlackHole, Loopback). Hearth records its own sound instead (the Lab\'s music, previews).' : 'Only Windows can share the whole computer\'s sound. Hearth records its own sound instead.', { timeout: 9000 }); }
    }
    let mic = null;
    if (wantMic) {
      try { mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); } catch (err) { note = `no microphone (${err.message})`; }
    }
    const srcs = [...(o.audio !== 'mic' ? appTracks : []), ...(mic ? mic.getAudioTracks() : [])];
    if (srcs.length === 1) tracks.push(srcs[0]);
    else if (srcs.length > 1) {
      const ctx = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      for (const t of srcs) ctx.createMediaStreamSource(new MediaStream([t])).connect(dest);
      tracks.push(...dest.stream.getAudioTracks());
      rec.audioCtx = ctx;
    }
    rec.mic = mic;
    return { tracks, note };
  }
  // output size of the canvas pipeline: native (device pixels of the target), 1080p / 720p (fit), or a social frame
  // The take's size. final: what the file should be (a social frame, 1080p / 720p, or the target's own pixels).
  // The canvas records the target's own pixels in the final shape and never upscales: the MP4 step scales to the final
  // size (Lanczos), so the encoder isn't fed 1080×1920 frames from a 940-pixel-high window (a Retina screen is ≈ native).
  function outSize(o, srcW, srcH) {
    const even = (n) => Math.max(2, Math.round(n / 2) * 2);
    const frame = o.size && o.size !== 'native' && !/^\d+p$/.test(o.size) ? D.parseFrame(o.size) : null;
    let final;
    if (frame) final = { w: frame.w, h: frame.h };
    else if (/^\d+p$/.test(o.size)) { const H = Number.parseInt(o.size, 10); const k = srcW >= srcH ? H / srcH : H / srcW; final = { w: even(srcW * k), h: even(srcH * k) }; }
    else final = { w: even(srcW), h: even(srcH) };
    const ratio = final.w / final.h;
    let nw = srcW; let nh = srcH;
    if (nw / nh > ratio) nw = nh * ratio; else nh = nw / ratio;
    const s = Math.min(1, final.w / nw);
    return { w: even(nw * s), h: even(nh * s), frame, final };
  }
  const codecStrikes = {};
  async function record(opts = {}) {
    if (rec) return status();
    const o = resolveRec(opts);
    rec = { opts: o, marks: [], pausedMs: 0, pausedAt: 0, started: 0, chunks: Promise.resolve(), tour: opts.tour || null };
    try {
      // the target is pinned now (a region is picked before the countdown)
      let node = null; let fixedRect = null;
      if (TARGETS[o.target]?.pick) {
        const p = await pickRegion({ ratio: D.parseFrame(o.size), hint: 'Drag the region to record (or click a thing) · Esc cancels' });
        if (!p) { rec = null; return { recording: false, cancelled: true }; }
        node = p.el; fixedRect = node ? null : p.rect;
      } else if (o.target !== 'window') {
        node = elementFor(o.target);
        if (!node) throw new Error(`Nothing to record for "${o.target}" on screen`);
      }
      const wantsApp = o.audio === 'app' || o.audio === 'app+mic' || o.audio === 'system';
      await api().prep({ audio: o.audio === 'system' && /Win/.test(navigator.platform) ? 'system' : wantsApp ? 'app' : 'none', source: o.source || 'frame' });
      const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: o.fps, max: o.fps } }, audio: wantsApp });
      rec.display = display;
      const { tracks: audioTracks, note } = await audioFor(o, display);
      rec.audioNote = note || null;
      const vTrack = display.getVideoTracks()[0];
      // whole window at its own size: the page capture goes straight to the recorder; anything else is drawn into a
      // canvas each captured frame (crop to the target, scale, social frame)
      // every take goes through a canvas on a steady clock: the page capture only sends a frame when something changed,
      // so without it a still screen would make a file that ends at the last change, at a varying frame rate
      const direct = false;
      let videoTrack = vTrack;
      if (!direct) {
        // frames straight from the capture track (WebCodecs): no <video> to keep on screen; the page capture only sends a
        // frame when something changed, so a still UI costs nothing
        const R = rec;
        let source = null; let sw = 0; let shh = 0;
        let next = null;
        if (o.reader !== 'video' && typeof MediaStreamTrackProcessor !== 'undefined') {
          const reader = new MediaStreamTrackProcessor({ track: vTrack }).readable.getReader();
          R.reader = reader;
          next = async () => { const { value, done } = await reader.read(); return done ? null : value; };
        } else {
          // older engines: a hidden <video> on the page, drawn on each animation frame while it plays
          const v = el('video', { muted: true, playsInline: true, autoplay: true, class: 'cap-hidden-video' });
          v.srcObject = new MediaStream([vTrack]);
          document.body.append(v);
          await v.play().catch(() => {});
          R.video = v;
          next = () => new Promise((res) => requestAnimationFrame(() => res(R.video === v && v.videoWidth ? v : null)));
        }
        // a still page may not send its first picture until it repaints: poke it while waiting
        heartbeat(true);
        const pokes = setInterval(poke, 300);
        const first = await Promise.race([next(), sleep(8000).then(() => null)]).finally(() => clearInterval(pokes));
        if (!first) throw new Error('The page capture sent no picture');
        const dimsOf = (f) => (f instanceof HTMLVideoElement ? [f.videoWidth, f.videoHeight] : [f.displayWidth, f.displayHeight]);
        [sw, shh] = dimsOf(first);
        const srcRect = () => {
          const r = fixedRect || (node ? rectOf(node) : null) || { x: 0, y: 0, width: innerWidth, height: innerHeight };
          const k = sw / innerWidth;
          return { x: r.x * k, y: r.y * k, w: r.width * k, h: r.height * k };
        };
        const r0 = srcRect();
        const size = outSize(o, r0.w, r0.h);
        const c = el('canvas', { width: size.w, height: size.h });
        const g = c.getContext('2d', { alpha: false });
        g.imageSmoothingQuality = 'high';
        const draw = (f) => {
          [sw, shh] = dimsOf(f);
          let { x, y, w, h } = srcRect();
          if (size.frame) { // cover the social frame, centered on the target
            const k = size.w / size.h; const cx = x + w / 2; const cy = y + h / 2;
            if (w / h > k) w = h * k; else h = w / k;
            x = Math.max(0, Math.min(sw - w, cx - w / 2)); y = Math.max(0, Math.min(shh - h, cy - h / 2));
          }
          g.drawImage(f, x, y, w, h, 0, 0, size.w, size.h);
        };
        draw(first); if (first.close) first.close();
        (async () => {
          for (;;) {
            source = await next().catch(() => null);
            if (!source || rec !== R) { source?.close?.(); break; }
            R.framesIn = (R.framesIn || 0) + 1;
            R.lastIn = performance.now();
            try { draw(source); } finally { source.close?.(); }
          }
        })();
        // a frame every 1/fps whether or not the picture changed (constant frame rate, the real length)
        videoTrack = c.captureStream(0).getVideoTracks()[0];
        // (an unchanged canvas sends nothing: it repaints itself first, a GPU copy)
        const period = 1000 / o.fps;
        R.lastIn = performance.now(); R.lastPoke = 0;
        R.ticker = setInterval(() => {
          if (rec !== R || R.pausedAt) return;
          g.drawImage(c, 0, 0); videoTrack.requestFrame(); R.framesOut = (R.framesOut || 0) + 1;
          const now = performance.now();
          if (now - R.lastIn > period * 2.5 && now - R.lastPoke > period * 2.5) { R.lastPoke = now; poke(); }
        }, period);
        R.canvas = c;
        R.size = `${size.w}×${size.h}`;
        R.final = size.final.w !== size.w || size.final.h !== size.h ? size.final : null;
      } else {
        const s = vTrack.getSettings();
        rec.size = `${s.width || '?'}×${s.height || '?'}`;
      }
      // Mac / Windows: H.264 first (their hardware encoders keep up at 1080×1920 60 fps); elsewhere VP9 / VP8. A codec
      // that gave two empty takes this session is skipped until Hearth restarts.
      const bad = Object.entries(codecStrikes).filter(([, n]) => n >= 2).map(([c]) => c);
      const order = /Mac|Win/.test(navigator.platform) ? ['h264', 'vp9', 'vp8'] : ['vp9', 'vp8', 'h264'];
      const mime = [...(o.codec ? [o.codec] : []), ...order].filter((c) => c === o.codec || !bad.includes(c)).map((c) => `video/webm;codecs=${c},opus`).concat(['video/webm']).find((m) => MediaRecorder.isTypeSupported(m));
      rec.mime = mime;
      const recorder = new MediaRecorder(new MediaStream([videoTrack, ...audioTracks]), { mimeType: mime, videoBitsPerSecond: Math.round(o.mbps * 1e6), audioBitsPerSecond: 192000 });
      rec.recorder = recorder;
      recorder.onerror = (e) => { rec && (rec.recError = e.error?.message || 'encoder error'); console.warn('capture: recorder', e.error); };
      const file = await api().recOpen({ name: o.name || `Hearth ${o.target === 'window' ? 'recording' : o.target} ${new Date().toISOString().slice(0, 19).replace('T', ' ').replace(/:/g, '-')}` });
      rec.id = file.id; rec.path = file.path;
      const R0 = rec;
      recorder.ondataavailable = (e) => { if (e.data?.size) R0.chunks = R0.chunks.then(async () => api().recWrite(file.id, new Uint8Array(await e.data.arrayBuffer()))); };
      // effects drawn into the page while filming (they are part of the picture on purpose)
      if (o.clean) clean(true);
      cursorFx.set(o.cursor, { clicks: o.clicks, keys: o.keys });
      await countdown(Number(o.countdown) || 0, 'recording');
      recorder.start(1000);
      rec.started = performance.now();
      await api().indicator({ on: true, time: '0:00', label: rec.tour ? 'tour' : '' });
      rec.timer = setInterval(tick, 500);
      document.documentElement.classList.add('cap-recording');
      document.dispatchEvent(new CustomEvent('hearth:recording', { detail: status() }));
      return status();
    } catch (err) {
      cleanupRec();
      rec = null;
      throw err;
    }
  }
  function tick() {
    if (!rec) return;
    const s = elapsed();
    api().indicator({ on: true, time: fmtClock(s), paused: Boolean(rec.pausedAt), label: rec.tour ? `tour ${rec.tour}` : rec.marks.length ? `◆${rec.marks.length}` : '' });
    if (rec.opts.max && s >= rec.opts.max && !rec.pausedAt) stop().catch((e) => toast(e.message, { type: 'error' }));
  }
  function cleanupRec() {
    if (!rec) return;
    clearInterval(rec.timer);
    clearInterval(rec.ticker);
    try { rec.display?.getTracks().forEach((t) => t.stop()); } catch { /* gone */ }
    try { rec.mic?.getTracks().forEach((t) => t.stop()); } catch { /* gone */ }
    try { rec.audioCtx?.close(); } catch { /* gone */ }
    try { rec.reader?.cancel(); } catch { /* done */ }
    if (rec.video) { rec.video.srcObject = null; rec.video.remove(); rec.video = null; }
    if (rec.opts?.clean) clean(false);
    cursorFx.set('off', { clicks: 'off', keys: false });
    heartbeat(false);
    api().indicator({ on: false });
    document.documentElement.classList.remove('cap-recording');
  }
  function pause() {
    if (!rec?.recorder || rec.pausedAt) return status();
    rec.recorder.pause(); rec.pausedAt = performance.now(); tick();
    return status();
  }
  function resume() {
    if (!rec?.recorder || !rec.pausedAt) return status();
    rec.pausedMs += performance.now() - rec.pausedAt; rec.pausedAt = 0; rec.recorder.resume(); tick();
    return status();
  }
  function mark(label = '') {
    if (!rec) return null;
    const m = { time: Math.round(elapsed() * 100) / 100, label: String(label || `Marker ${rec.marks.length + 1}`).slice(0, 80) };
    rec.marks.push(m); tick();
    return m;
  }
  async function stop({ quiet = false, open = false } = {}) {
    if (!rec) return null;
    if (pending.stop) return pending.stop;
    const r = rec;
    pending.stop = (async () => {
      const duration = elapsed();
      // no new frames, then a moment for the encoder to finish the ones it still holds (big frames on a slow machine)
      clearInterval(r.ticker); r.ticker = null;
      try { if (r.recorder.state === 'recording') r.recorder.pause(); } catch { /* stopping anyway */ }
      await sleep(Math.min(1200, 250 + (r.canvas ? (r.canvas.width * r.canvas.height) / 4000 : 0)));
      await new Promise((res) => { r.recorder.onstop = res; try { if (r.recorder.state !== 'inactive') r.recorder.stop(); else res(); } catch { res(); } });
      cleanupRec();
      rec = null;
      await r.chunks;
      const p = await api().recClose(r.id);
      if (!p) {
        // an encoder that wrote nothing in a real take: two strikes and the next takes use another codec
        const codec = String(r.mime || '').match(/codecs=(\w+)/)?.[1];
        if (duration < 1.5) throw new Error('Nothing was recorded: the take was too short');
        if (codec && !r.opts.codec) codecStrikes[codec] = (codecStrikes[codec] || 0) + 1;
        throw new Error(`Nothing was recorded${codec ? ` (the ${codec.toUpperCase()} encoder gave nothing${r.recError ? `: ${r.recError}` : ''})` : ''}`);
      }
      if (r.mime) delete codecStrikes[String(r.mime).match(/codecs=(\w+)/)?.[1]];
      const busy = quiet ? null : toast(r.opts.mp4 ? 'Finishing the recording (MP4)…' : 'Finishing the recording…', { timeout: 0 });
      let fin = { webm: p };
      try { fin = await api().finish({ path: p, mp4: Boolean(r.opts.mp4 || r.final), fps: r.opts.fps, id: r.id, size: r.final }); } catch (err) { fin.error = err.message; } finally { busy?.remove(); }
      const main = fin.mp4 || fin.webm || p;
      const marks = r.marks;
      if (marks.length) { const all = await window.hub.kvGet('capture-marks', {}); all[main] = marks; if (fin.webm && fin.webm !== main) all[fin.webm] = marks; window.hub.kvSet('capture-marks', all); }
      if (typeof Review !== 'undefined') { try { Review.noteRecording(main); } catch { /* the library is a bonus */ } }
      const item = remember({ kind: 'video', path: main, webm: fin.webm, mp4: fin.mp4 || null, duration: fin.duration || duration, w: fin.w, h: fin.h, fps: r.opts.fps, marks });
      if (!quiet) {
        const extra = fin.mp4Error ? ' (MP4 failed: kept the WebM)' : !fin.ffmpeg && r.opts.mp4 ? ' (WebM: install ffmpeg for MP4)' : '';
        toast(`🎬 ${base(main)} · ${fmtClock(item.duration || 0)}${r.audioNote ? ` · ${r.audioNote}` : ''}${extra}`, { timeout: 7000, action: { label: 'Open', fn: () => CaptureView.open(main) } });
      }
      document.dispatchEvent(new CustomEvent('hearth:recording', { detail: { recording: false, path: main } }));
      if (open) CaptureView.open(main);
      return { path: main, webm: fin.webm, mp4: fin.mp4 || null, duration: Math.round((fin.duration || duration) * 100) / 100, size: fin.w ? `${fin.w}×${fin.h}` : r.size, fps: r.opts.fps, marks, audio: r.audioNote || r.opts.audio, error: fin.mp4Error || fin.error || null };
    })();
    try { return await pending.stop; } finally { pending.stop = null; }
  }
  const toggleRecord = (opts) => (rec ? stop() : record(opts));
  // a running tour shows its step in the REC window ("tour 3/12")
  function tourLabel(t) { if (rec) { rec.tour = t; tick(); } }

  // the indicator window's ■ / ❚❚ and the keys that work even inside the Lab's frame (capturemain.js)
  window.hub.capture.onIndicator(({ action }) => { if (action === 'stop') stop().catch((e) => toast(e.message, { type: 'error' })); if (action === 'pause') (rec?.pausedAt ? resume() : pause()); });
  window.hub.capture.onKey(({ key }) => {
    const run = (p) => Promise.resolve().then(p).catch((e) => toast(e.message, { type: 'error' }));
    if (key === 'menu') { const x = innerWidth / 2 - 120; menu(Math.max(8, x), 80, mainItems()); }
    if (key === 'region') run(() => shot({ target: 'region' }));
    if (key === 'record') run(() => toggleRecord());
    if (key === 'pause') { if (rec) (rec.pausedAt ? resume() : pause()); }
    if (key === 'library') CaptureView.library();
    if (key === 'tour' && typeof CaptureTour !== 'undefined') run(() => (CaptureTour.running() ? CaptureTour.stop() : CaptureTour.picker()));
  });

  // ---------- the one capture menu ----------
  function mainItems() {
    const shotItem = (label, o) => ({ label, action: () => shot(o).catch((e) => toast(e.message, { type: 'error' })) });
    const R = rec;
    const crops = D.SOCIAL.slice(0, 10).map((f) => shotItem(`${f.id}  ${f.w}×${f.h}`, { target: prefs.shot.target === 'region' ? 'region' : 'tool', crop: f.id }));
    return [
      R ? { label: `■ Stop recording (${fmtClock(elapsed())})  ${mod}+Alt+R`, action: () => stop().catch((e) => toast(e.message, { type: 'error' })) } : null,
      R ? { label: R.pausedAt ? '▶ Resume  ' : '❚❚ Pause', action: () => (R.pausedAt ? resume() : pause()) } : null,
      R ? { label: '◆ Marker here', action: () => mark() } : null,
      shotItem('📷 Screenshot of this tool', { target: 'tool' }),
      { label: '📷 Screenshot of…', items: () => [
        shotItem('The whole window', { target: 'window' }),
        shotItem(`A region or a thing (drag / click)  ${mod}+Alt+A`, { target: 'region' }),
        shotItem('The chat messages', { target: 'chat' }),
        shotItem('The whole chat as one tall picture', { target: 'transcript' }),
        shotItem('The Lab preview at full size', { target: 'lab' }),
        shotItem('The docked director chat', { target: 'dock' }),
        shotItem('The chat box', { target: 'composer' }),
        shotItem('In 3 seconds (for hover states)', { target: 'window', delay: 3 }),
      ] },
      { label: '⬚ Social frame…', items: () => [...crops, { label: 'More sizes…', action: () => pickFrame((f) => shot({ target: 'tool', crop: f.id })) }] },
      { label: '✨ Beautified (for posts)…', items: () => D.BEAUTIFY.map((b) => shotItem(b.label, { target: 'window', beautify: b.id, clean: true })) },
      R ? null : { label: `● Record Hearth  ${mod}+Alt+R`, action: () => record().catch((e) => toast(e.message, { type: 'error' })) },
      R ? null : { label: '● Record…', items: () => [
        ...D.RECORD.map((p) => ({ label: p.label, action: () => record({ preset: p.id }).catch((e) => toast(e.message, { type: 'error' })) })),
        { label: 'Record a region (drag / click)', action: () => record({ target: 'region' }).catch((e) => toast(e.message, { type: 'error' })) },
      ] },
      typeof CaptureTour !== 'undefined' ? { label: '▶ Tours (hands-free recordings)…', items: () => CaptureTour.menuItems() } : null,
      { label: `▦ Captures  ${mod}+Alt+V`, action: () => CaptureView.library() },
      { label: '🎞 Read frames of a video…', action: () => FrameRead.pickAndRead() },
      { label: 'Settings…', more: true, items: () => settingsItems() },
    ];
  }
  function settingsItems() {
    const P = prefs;
    const setS = (k, v, label) => ({ label: `${check(P.shot[k] === v)}${label}`, action: () => setPref('shot', k, v) });
    const setR = (k, v, label) => ({ label: `${check(P.rec[k] === v)}${label}`, action: () => setPref('rec', k, v) });
    return [
      { label: 'Screenshots…', items: () => [
        { label: `${check(P.shot.clean)}Clean (no toasts, menus, scrollbars)`, action: () => setPref('shot', 'clean', !P.shot.clean) },
        { label: `${check(P.shot.hideRail)}Hide the rail and chats list`, action: () => setPref('shot', 'hideRail', !P.shot.hideRail) },
        { label: `${check(P.shot.copy)}Also copy to the clipboard`, action: () => setPref('shot', 'copy', !P.shot.copy) },
        { label: 'Format…', items: () => [setS('format', 'png', 'PNG (lossless)'), setS('format', 'jpg', 'JPEG (small)'), setS('format', 'webp', 'WebP')] },
        { label: 'Pixel size…', items: () => [setS('scale', 'native', 'Screen pixels (sharp on Retina)'), setS('scale', 1, '1× (CSS size)')] },
        { label: 'Social crop…', items: () => [setS('fit', 'crop', 'Fill the frame (crop the sides)'), setS('fit', 'fit', 'Fit inside on a background')] },
      ] },
      { label: 'Recording…', items: () => [
        { label: 'Preset…', items: () => D.RECORD.map((p) => setR('preset', p.id, p.label)) },
        { label: 'Frames per second…', items: () => D.FPS.map((f) => setR('fps', f, `${f} fps`)) },
        { label: 'Quality…', items: () => D.QUALITY.map((q) => setR('mbps', q.mbps, `${q.label} (${q.mbps} Mb/s)`)) },
        { label: 'Sound…', items: () => D.AUDIO.map((a) => setR('audio', a.id, a.label)) },
        { label: 'Cursor…', items: () => D.CURSORS.map((c) => setR('cursor', c.id, c.label)) },
        { label: 'Clicks…', items: () => D.CLICKS.map((c) => setR('clicks', c.id, c.label)) },
        { label: `${check(P.rec.keys)}Show the keys you press`, action: () => setPref('rec', 'keys', !P.rec.keys) },
        { label: 'Countdown…', items: () => D.COUNTDOWN.map((n) => setR('countdown', n, n ? `${n} seconds` : 'None')) },
        { label: 'Longest take…', items: () => D.MAX_LENGTH.map((n) => setR('max', n, n ? `${n >= 60 ? `${n / 60} min` : `${n} s`}` : 'No limit')) },
        { label: `${check(P.rec.mp4)}Also make an MP4 (ffmpeg)`, action: () => setPref('rec', 'mp4', !P.rec.mp4) },
        { label: `${check(P.rec.clean)}Hide toasts while recording`, action: () => setPref('rec', 'clean', !P.rec.clean) },
      ] },
      { label: 'Timecodes…', items: () => D.TC_STYLES.map((t) => ({ label: `${check(P.tc === t.id)}${t.label}`, action: () => { P.tc = t.id; savePrefs(); } })) },
      { label: 'Captures folder…', action: () => chooseFolder() },
      { label: 'Open the captures folder', action: async () => window.hub.fs.open((await info()).dir) },
    ];
  }
  // a searchable picker for the long families (frames, backgrounds…): one list with a filter box
  function picker(title, items, onPick) {
    const input = el('input', { type: 'search', placeholder: 'Filter…', class: 'cap-picker-q' });
    const list = el('div', { class: 'cap-picker-list' });
    const paint = () => {
      const q = input.value.trim().toLowerCase();
      list.replaceChildren(...items.filter((it) => !q || `${it.id} ${it.label}`.toLowerCase().includes(q)).map((it) => el('button', { type: 'button', class: 'cap-picker-row', on: { click: () => { dlg.close(); onPick(it); } } }, el('b', { text: it.id }), el('span', { text: it.label }))));
    };
    input.addEventListener('input', paint);
    const dlg = el('dialog', { class: 'ui-modal cap-picker' }, el('h2', { text: title }), input, list, el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }), el('button', { type: 'button', text: 'Close', on: { click: () => dlg.close() } })));
    dlg.addEventListener('close', () => setTimeout(() => dlg.remove(), 0));
    document.body.append(dlg);
    paint();
    dlg.showModal();
    input.focus();
    return dlg;
  }
  const pickFrame = (fn) => picker('Social frame', D.SOCIAL.map((f) => ({ ...f, label: `${f.label} · ${f.w}×${f.h}` })), fn);
  async function chooseFolder() {
    const cur = (await info()).dir;
    const p = await window.hub.pickFolder(cur, 'Where captures are saved');
    if (!p) return null;
    H.config.settings = { ...H.config.settings, captureDir: p };
    await saveConfig();
    infoCache = null;
    toast(`Captures go to ${p}`, { timeout: 2500 });
    return p;
  }
  let infoCache = null;
  async function info() { infoCache ||= await api().dir(); return infoCache; }

  // ---------- sending a capture to the other tools ----------
  async function openInReview(p, { cut = false } = {}) {
    if (typeof Review === 'undefined') throw new Error('Video Review isn\'t available');
    activate('tool:ae');
    await Review.ensureMounted?.();
    await Review.open(p);
    if (cut && typeof VideoCut !== 'undefined') { await Review.waitReady?.(); await VideoCut.enter?.(); }
    const marks = (await window.hub.kvGet('capture-marks', {}))[p] || [];
    // recording markers become timeline notes once
    if (marks.length && Review.addNote && !(Review.notes?.(p) || Review.notes?.() || []).some((n) => /^◆/.test(n.text || ''))) {
      await Review.waitReady?.();
      for (const m of marks) { try { await Review.addNote(`◆ ${m.label}`, { t: m.time, cat: 'general', frame: false }); } catch { /* notes are a bonus */ } }
    }
    return true;
  }
  async function addToEdit(p) {
    if (typeof VideoCut === 'undefined') throw new Error('The editor isn\'t available');
    if (!VideoCut.active) throw new Error('Open the editor timeline first (E in Video Review)');
    return VideoCut.addClip(p);
  }
  async function addToLab(p) {
    const r = await HubBridge.call('three_load_media', { path: p });
    if (!r?.ok) throw new Error(r?.error || 'The Lab couldn\'t load it');
    activate('tool:three');
    return true;
  }

  // (the capture tools for chats, commands and keys live in capture-cmds.js)
  return {
    shot, record, stop, pause, resume, mark, status, toggleRecord, pickRegion, beautify, socialCrop, loadImage, canvasData, paintBackground,
    beautyArgs, beautyMix, setBeautyMix, anim, menu, mainItems, settingsItems, picker, pickFrame, chooseFolder, info, clean, fx, cursorFx, keyAdd, keys: () => keyList.slice(),
    tourLabel, copyImage, attachToChat, openInReview, addToEdit, addToLab, elementFor, rectOf, targetId, TARGETS, surfaceEl, transcript, labPicture, countdown,
    last: () => last, recent: () => recent.slice(), remember, prefs, setPref, fileUrl, base, fmtClock, get recording() { return Boolean(rec); },
  };
})();
