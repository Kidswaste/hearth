// Forgeheart juice: little spark bursts when you press a button (gold for important ones, the agent's color on
// the rail, cyan otherwise) and when a notification pops. Forgeheart 2 (data-look="v2") adds a chrome glint on
// presses, a molten ring + sparks when you send, embers when you save, a pop / shake on notifications and forged
// tooltips. Presentation only, event-driven (no loops while idle); off outside the Forgeheart skins, with
// /motion off or /sparkles off, and when the OS asks for reduced motion.
const Juice = (() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const on = () => /\bforge\b/.test(root.dataset.skin || '') && !reduced.matches && !store.get('juice.off', false) && root.dataset.motion !== 'off';
  const v2 = () => on() && /\bv2\b/.test(root.dataset.look || '');
  // (round 17, hz240) theme colors are read once and kept until the look changes: reading a computed style in a
  // pointerdown / toast handler forced a style pass of the whole page right in the middle of the interaction
  const cssCache = new Map();
  const css = (name, fallback) => { let v = cssCache.get(name); if (v === undefined) { v = getComputedStyle(root).getPropertyValue(name).trim(); cssCache.set(name, v); } return v || fallback; };
  new MutationObserver(() => cssCache.clear()).observe(root, { attributes: true, attributeFilter: ['style', 'class', 'data-skin', 'data-look', 'data-scheme', 'data-tex'] });
  let layer = null;
  let lastAt = 0;
  const layerEl = () => { if (!layer || !layer.isConnected) { layer = document.createElement('div'); layer.className = 'juice-layer'; document.body.append(layer); } return layer; };
  function burst(x, y, { color = '#48ddff', count = 5, spread = 22, force = false } = {}) {
    if (!on()) return;
    const now = performance.now();
    if (!force && now - lastAt < 40) return; // no storms from fast repeats
    lastAt = now;
    layerEl();
    for (let i = 0; i < count; i += 1) {
      const p = document.createElement('i');
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.8;
      const d = spread * (0.6 + Math.random() * 0.6);
      p.className = `juice-spark${i % 3 === 0 ? ' big' : ''}`;
      p.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 4}px;--c:${color};animation-delay:${Math.random() * 40}ms`;
      layer.append(p);
      setTimeout(() => p.remove(), 520);
    }
  }
  // a chrome streak crossing the button you press (Forgeheart 2); soft: the quieter sheen of pointing at a button
  // (round 17, hz240: that sheen was a background-position animation, repainted every frame; this one is moved by the
  // compositor). Callers measure in an animation frame (glintSoon), where the layout is worked out anyway.
  let glints = 0;
  function glint(b, soft = false) {
    if (!b.isConnected || glints >= 4) return;
    const r = b.getBoundingClientRect();
    if (!r.width || r.width > 480 || r.height > 120) return;
    const g = document.createElement('div');
    g.className = soft ? 'juice-glint soft' : 'juice-glint';
    glints += 1; setTimeout(() => { glints -= 1; }, 460);
    g.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    layerEl().append(g);
    setTimeout(() => g.remove(), soft ? 640 : 460);
  }
  // a molten ring rolling out of a point (sending)
  function ring(x, y, color) {
    const r = document.createElement('i');
    r.className = 'juice-ring';
    r.style.cssText = `left:${x}px;top:${y}px;--c:${color}`;
    layerEl().append(r);
    setTimeout(() => r.remove(), 520);
  }
  // embers drifting up (saving, success)
  function embers(x, y, { color = '#ffc23d', count = 9 } = {}) {
    if (!v2()) return;
    for (let i = 0; i < count; i += 1) {
      const p = document.createElement('i');
      p.className = 'juice-ember';
      p.style.cssText = `left:${x + (Math.random() - 0.5) * 18}px;top:${y}px;--dx:${(Math.random() - 0.5) * 36}px;--dy:${24 + Math.random() * 34}px;--c:${i % 3 ? color : css('--fh-ember', '#ff7a1a')};animation-delay:${Math.random() * 120}ms`;
      layerEl().append(p);
      setTimeout(() => p.remove(), 1100);
    }
  }
  // measuring happens in the next animation frame (with the frame's own style and layout), never in the handler
  const soon = (fn) => requestAnimationFrame(fn);
  const centerOf = (b, fn) => soon(() => { const r = b.getBoundingClientRect(); if (r.width) fn(r.left + r.width / 2, r.top + r.height / 2, r); });
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !on()) return;
    const b = e.target.closest?.('button, .agent-btn, .tool-btn, .item');
    if (!b || b.disabled) return;
    // Lab favorites get their own little moments: Freeze frosts, Tap pulses a ring, Shuffle rolls the die
    if (v2() && b.matches('.freeze-btn')) { centerOf(b, (x, y) => { ring(x, y, css('--fh-info', '#56c6ff')); glint(b); }); return; }
    if (b.closest('.three-preview, .mb-tl-wrap, canvas')) return;
    const primary = b.matches('.primary, #broadcast button');
    // (the rail sets each button's --agent inline: no computed style needed)
    const agent = b.matches('.agent-btn') ? (b.style.getPropertyValue('--agent').trim() || css('--accent', '#ffc23d')) : '';
    if (v2()) {
      if (b.matches('.primary, .ghost, .agent-btn, .tool-btn, #broadcast button, .tw-chip, .stage-btn, .suggest-chip, .look-tile, .seg button, .dialog-actions button')) soon(() => glint(b));
      const gold = css('--fh-gold', '#ffc23d');
      burst(e.clientX, e.clientY, primary ? { color: gold, count: 8, spread: 30 } : agent ? { color: agent, count: 6, spread: 24 } : { color: css('--fh-info', '#56c6ff'), count: 4, spread: 16 });
      if (b.dataset.feature === 'Tap tempo') centerOf(b, (x, y) => ring(x, y, gold));
      if (/^🎲/.test((b.textContent || '').trim())) {
        // "🎲 Shuffle": only the die rolls (its glyph gets a span the first time), a bare 🎲 rolls whole
        let die = b;
        const first = [...b.childNodes].find((n) => n.nodeType === 3 && n.nodeValue.trim());
        if (b.querySelector(':scope > .j-die')) die = b.querySelector(':scope > .j-die');
        else if (first && first.nodeValue.trim() !== '🎲' && first.nodeValue.trimStart().startsWith('🎲')) {
          const rest = first.nodeValue.trimStart().slice(2);
          die = el('span', { class: 'j-die', text: '🎲' });
          first.replaceWith(die, document.createTextNode(rest));
        }
        // restart the roll on the next frame (no forced layout to replay it)
        die.classList.remove('j-roll'); soon(() => die.classList.add('j-roll'));
        for (const c of ['--fh-ai', '--fh-hot', '--fh-info']) burst(e.clientX, e.clientY, { color: css(c, '#a970ff'), count: 3, spread: 26, force: true });
      }
      if (/^save\b/i.test((b.textContent || '').trim()) || /^Save\b/.test(b.title || '')) centerOf(b, (x, y, r) => embers(x, r.top + 4, { color: gold, count: 12 }));
      return;
    }
    burst(e.clientX, e.clientY, primary ? { color: '#ffd75e', count: 8, spread: 30 } : agent ? { color: agent, count: 6, spread: 24 } : { color: '#48ddff', count: 4, spread: 16 });
  }, true);
  // sending a message: sparks and a molten ring from the Send button (Enter or click)
  addEventListener('submit', (e) => {
    if (!v2()) return;
    const f = e.target;
    if (!(f instanceof HTMLFormElement) || !f.matches('.composer, #broadcast')) return;
    const b = f.querySelector('button[type=submit], button:not([type])');
    requestAnimationFrame(() => {
      const r = (b || f).getBoundingClientRect();
      const x = r.left + r.width / 2; const y = r.top + r.height / 2;
      ring(x, y, css('--fh-gold', '#ffc23d'));
      burst(x, y, { color: css('--fh-hot', '#ff3d7f'), count: 10, spread: 40, force: true });
    });
  }, true);
  // a small burst at the left edge of each new notification
  // (only the body's direct children are watched, until the toast box exists; then just that box)
  const onToasts = (list) => {
    if (!on()) return;
    for (const m of list) for (const t of m.addedNodes) {
      if (!(t instanceof HTMLElement) || !t.classList.contains('toast')) continue;
      const bad = t.classList.contains('error');
      if (v2()) t.classList.add(bad ? 'j-shake' : 'j-pop');
      const color = bad ? css('--fh-stop', css('--r-ultima', '#ff6a6a')) : css('--fh-gold', css('--r-rare', '#ffd75e'));
      requestAnimationFrame(() => { const r = t.getBoundingClientRect(); if (r.width) burst(r.left + 4, r.top + r.height / 2, { color, count: 5, spread: 18 }); });
    }
  };
  const watchBox = (box) => { new MutationObserver(onToasts).observe(box, { childList: true }); };
  const box0 = document.getElementById('toasts');
  if (box0) watchBox(box0);
  else {
    const wait = new MutationObserver((list) => {
      const box = document.getElementById('toasts');
      if (!box) return;
      wait.disconnect(); watchBox(box); onToasts([{ addedNodes: [...box.children] }]); // the first toast came with the box
    });
    wait.observe(document.body, { childList: true });
  }
  // Shift+Esc: clear every notification
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && e.shiftKey) document.querySelectorAll('#toasts .toast').forEach((t) => t.remove()); });
  AppUI.addAction('Sparkle effects on / off', () => { const off = !store.get('juice.off', false); store.set('juice.off', off); document.documentElement.toggleAttribute('data-calm', off); toast(off ? 'Sparkles off' : 'Sparkles on ✦', { timeout: 1500 }); });
  document.documentElement.toggleAttribute('data-calm', store.get('juice.off', false));
  AppUI.addAction('Copy the last reply in this chat', () => Native.copyLastReply(H.activeId));
  AppUI.addAction('Fold all long replies in this chat', () => Native.foldAll(H.activeId, true));
  AppUI.addAction('Clear all notifications', () => document.querySelectorAll('#toasts .toast').forEach((t) => t.remove()), 'Shift+Esc');
  AppUI.addAction('Recent notifications', () => { const l = recentToasts(); Modal.alert('Recent notifications', l.length ? l.map((t) => `${new Date(t.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}  ${t.type === 'error' ? '⚠ ' : ''}${t.message}`).join('\n') : 'None yet'); });
  // middle-click an agent on the rail: a new chat with it
  addEventListener('auxclick', (e) => {
    if (e.button !== 1) return;
    const b = e.target.closest?.('#rail .agent-btn'); const a = b && H.agents().find((x) => x.id === b.dataset.id);
    if (!a || a.mode !== 'native') return;
    e.preventDefault(); activate(a.id); Native.newChat(a.id);
  });
  // the window title follows what you look at
  const retitle = () => { const a = H.agent?.(H.activeId); const t = a?.name || (String(H.activeId || '').startsWith('tool:') ? Tools.get?.(H.activeId.slice(5))?.name : ''); document.title = t ? `${t} · Hearth` : 'Hearth'; };
  addEventListener('hearth:view', retitle); // start.js: the agent / tool on screen changed (was a 1.5 s poll)
  retitle(); // (round 40, firstscreen) loaded right after the first frame: the view on screen may be set already

  // a hidden window rests every animation (look.css: [data-away])
  const away = () => root.toggleAttribute('data-away', document.hidden);
  document.addEventListener('visibilitychange', away);
  away();

  // ---------- forged tooltips (Forgeheart 2; /tips off for the system ones) ----------
  // The title moves to data-tip while ours shows (so the system one stays away) and always comes back.
  // (round 17, hz240) one tip node, made once and reused; nothing is measured while the pointer moves: the "is this
  // text cut short?" test and the placement run once, when the tip is due, in an animation frame
  let tip = null; let tipFor = null; let tipTimer = 0; let tipShown = false;
  const tipsOn = () => /\bv2\b/.test(root.dataset.look || '') && (typeof Look === 'undefined' || Look.fx().tips !== false);
  function hideTip() {
    clearTimeout(tipTimer);
    if (tipFor && tipFor.dataset.tip != null) {
      if (!tipFor.hasAttribute('title')) tipFor.setAttribute('title', tipFor.dataset.tip);
      delete tipFor.dataset.tip;
    }
    tipFor = null;
    if (tipShown) { tip.remove(); tipShown = false; }
  }
  // rows of a list or menu: the tip goes beside the list, so it never covers the next rows
  const LISTS = '.fx-list, .palette-list, .slash-menu, #menu, .mb-menu, .nv-menu, .nv-picker-list, .look-grid, .prompt-list, #chat-groups';
  // (tipFor is what the pointer is over: pointerout clears it, so no :hover test, which needed a fresh style pass)
  function showTip(t, full) {
    if (!t.isConnected || tipFor !== t) return;
    const text = full || t.getAttribute('title');
    if (!text) return;
    if (!full) { t.dataset.tip = text; t.removeAttribute('title'); }
    if (!tip) tip = el('div', { class: 'juice-tip' });
    tip.className = `juice-tip${full ? ' full' : ''}`; tip.textContent = text; tip.style.left = '-9999px'; tip.style.top = '0px';
    document.body.append(tip); tipShown = true;
    const r = t.getBoundingClientRect(); const w = tip.offsetWidth; const h = tip.offsetHeight;
    const list = full ? null : t.closest(LISTS);
    const lr = list?.getBoundingClientRect();
    if (lr && (lr.right + 8 + w < innerWidth || lr.left - 8 - w > 0)) {
      tip.style.left = `${lr.right + 8 + w < innerWidth ? lr.right + 8 : lr.left - 8 - w}px`;
      tip.style.top = `${Math.max(6, Math.min(innerHeight - h - 6, r.top))}px`;
      return;
    }
    const below = r.bottom + 6 + h < innerHeight;
    tip.style.left = `${Math.max(6, Math.min(innerWidth - w - 6, (full ? r.left - 9 : r.left + r.width / 2 - w / 2)))}px`;
    tip.style.top = `${full ? (below ? r.top - 4 : Math.max(6, r.top - h - 6)) : below ? r.bottom + 6 : Math.max(6, r.top - h - 6)}px`;
  }
  // text cut short with an ellipsis (chat titles, render names, effect names…) shows in full on hover
  const clipped = (n) => {
    for (let x = n, i = 0; x && i < 3 && x !== document.body; x = x.parentElement, i += 1) {
      if (x.closest('[title], input, textarea, select, [contenteditable=true]')) return null;
      if (x.scrollWidth > x.clientWidth + 1 && getComputedStyle(x).textOverflow === 'ellipsis') return x;
    }
    return null;
  };
  // (round 49, scroll240) rows passing under a resting pointer while you scroll aren't pointed at: the browser's hover
  // updates after each scrolled frame used to arm a tip (and measure it) for every row crossed
  let scrolledAt = -1e9;
  const scrolling = () => performance.now() - scrolledAt < 300;
  for (const ev of ['wheel', 'touchmove']) addEventListener(ev, () => { scrolledAt = performance.now(); }, { capture: true, passive: true });
  // … and while the scroll a wheel started is still gliding (a scroll on its own, like a chat following its reply, isn't)
  addEventListener('scroll', () => { const t = performance.now(); if (t - scrolledAt < 1000) scrolledAt = t; }, { capture: true, passive: true });
  addEventListener('pointerover', (e) => {
    if (!tipsOn()) return;
    if (scrolling()) { if (tipFor) hideTip(); return; }
    const t = e.target.closest?.('[title]');
    if (!t || !t.getAttribute('title')) {
      // cut-short text: measured once the pointer rests on it (520 ms), not on every element it crosses
      const n = !t && e.target instanceof HTMLElement ? e.target : null;
      if (!n || n === tipFor || n === tip) return;
      hideTip();
      tipFor = n;
      tipTimer = setTimeout(() => requestAnimationFrame(() => {
        if (tipFor !== n) return;
        const c = clipped(n);
        const text = c?.textContent.trim();
        if (!c || !text || text.length > 400) return;
        tipFor = c; showTip(c, text);
      }), 520);
      return;
    }
    if (t === tipFor) return;
    hideTip();
    tipFor = t;
    tipTimer = setTimeout(() => requestAnimationFrame(() => showTip(t)), 420);
  }, true);
  addEventListener('pointerout', (e) => { if (tipFor && !tipFor.contains(e.relatedTarget)) hideTip(); }, true);

  // ---------- the chrome sheen crossing a button you point at (Forgeheart 2) ----------
  // (round 17, hz240) was `animation: m-sweep` (background-position: the button repainted every frame for 0.6 s, a
  // dozen at once when the pointer crossed the rail); now the soft glint, a streak the compositor moves. Same buttons.
  const SWEEP = '.m-chrome, .m-gold, .m-sheen, .agent-btn, .suggest-chip, .look-tile, .tweaks .tw-shuffle:not(:disabled), .lab-tabs .lab-tools-btn, .lab-tabs .lab-back, .ghost, .dialog-actions button:not(.primary), .code-act, .find-bar button';
  let swept = null; let sweptAt = 0;
  addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch' || !on() || root.dataset.motion === 'calm' || scrolling()) return; // (round 49) no glints from rows scrolling past
    const b = e.target.closest?.(SWEEP) || e.target.closest?.('.nv-node')?.querySelector(':scope > .nv-head');
    if (!b || (b === swept && performance.now() - sweptAt < 700) || b.disabled || (!v2() && !b.matches('.m-chrome, .m-gold, .m-sheen'))) return;
    if (b !== e.target && b.contains(e.relatedTarget)) return; // moving inside the same button
    swept = b; sweptAt = performance.now();
    requestAnimationFrame(() => glint(b, true));
  }, { passive: true });
  for (const ev of ['pointerdown', 'wheel', 'keydown', 'blur']) addEventListener(ev, () => { if (tipFor) hideTip(); }, true);

  return { burst, embers, ring, glint, hideTip };
})();
