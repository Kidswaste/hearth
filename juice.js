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
  const css = (name, fallback) => getComputedStyle(root).getPropertyValue(name).trim() || fallback;
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
  // a chrome streak crossing the button you press (Forgeheart 2)
  function glint(b) {
    const r = b.getBoundingClientRect();
    if (!r.width || r.width > 480 || r.height > 120) return;
    const g = document.createElement('div');
    g.className = 'juice-glint';
    g.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    layerEl().append(g);
    setTimeout(() => g.remove(), 460);
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
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !on()) return;
    const b = e.target.closest?.('button, .agent-btn, .tool-btn, .item');
    if (!b || b.disabled || b.closest('.three-preview, .mb-tl-wrap, canvas')) return;
    const primary = b.matches('.primary, #broadcast button');
    const agent = b.matches('.agent-btn') ? getComputedStyle(b).getPropertyValue('--agent').trim() : '';
    if (v2()) {
      if (b.matches('.primary, .ghost, .agent-btn, .tool-btn, #broadcast button, .tw-chip, .stage-btn, .suggest-chip, .look-tile, .seg button, .dialog-actions button')) glint(b);
      const gold = css('--fh-gold', '#ffc23d');
      burst(e.clientX, e.clientY, primary ? { color: gold, count: 8, spread: 30 } : agent ? { color: agent, count: 6, spread: 24 } : { color: css('--fh-info', '#56c6ff'), count: 4, spread: 16 });
      if (/^save\b/i.test((b.textContent || '').trim()) || /^Save\b/.test(b.title || '')) { const r = b.getBoundingClientRect(); embers(r.left + r.width / 2, r.top + 4, { color: gold }); }
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
    const r = (b || f).getBoundingClientRect();
    const x = r.left + r.width / 2; const y = r.top + r.height / 2;
    requestAnimationFrame(() => {
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
      requestAnimationFrame(() => { const r = t.getBoundingClientRect(); if (r.width) burst(r.left + 4, r.top + r.height / 2, { color: bad ? '#ff6a6a' : '#ffd75e', count: 5, spread: 18 }); });
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
  setInterval(() => { if (!document.hidden) retitle(); }, 1500);

  // a hidden window rests every animation (look.css: [data-away])
  const away = () => root.toggleAttribute('data-away', document.hidden);
  document.addEventListener('visibilitychange', away);
  away();

  // ---------- forged tooltips (Forgeheart 2; /tips off for the system ones) ----------
  // The title moves to data-tip while ours shows (so the system one stays away) and always comes back.
  let tip = null; let tipFor = null; let tipTimer = 0;
  const tipsOn = () => /\bv2\b/.test(root.dataset.look || '') && (typeof Look === 'undefined' || Look.fx().tips !== false);
  function hideTip() {
    clearTimeout(tipTimer);
    if (tipFor && tipFor.dataset.tip != null) {
      if (!tipFor.hasAttribute('title')) tipFor.setAttribute('title', tipFor.dataset.tip);
      delete tipFor.dataset.tip;
    }
    tipFor = null;
    tip?.remove(); tip = null;
  }
  function showTip(t) {
    if (!t.isConnected || tipFor !== t || !t.matches(':hover')) return;
    const text = t.getAttribute('title');
    if (!text) return;
    t.dataset.tip = text;
    t.removeAttribute('title');
    tip = el('div', { class: 'juice-tip', text });
    document.body.append(tip);
    const r = t.getBoundingClientRect(); const w = tip.offsetWidth; const h = tip.offsetHeight;
    const below = r.bottom + 6 + h < innerHeight;
    tip.style.left = `${Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2))}px`;
    tip.style.top = `${below ? r.bottom + 6 : Math.max(6, r.top - h - 6)}px`;
  }
  addEventListener('pointerover', (e) => {
    if (!tipsOn()) return;
    const t = e.target.closest?.('[title]');
    if (!t || t === tipFor || !t.getAttribute('title')) return;
    hideTip();
    tipFor = t;
    tipTimer = setTimeout(() => showTip(t), 420);
  }, true);
  addEventListener('pointerout', (e) => { if (tipFor && !tipFor.contains(e.relatedTarget)) hideTip(); }, true);
  for (const ev of ['pointerdown', 'wheel', 'keydown', 'blur']) addEventListener(ev, () => { if (tipFor) hideTip(); }, true);

  return { burst, embers, ring, glint, hideTip };
})();
