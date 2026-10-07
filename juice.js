// Forgeheart juice: little spark bursts when you press a button (gold for important ones, the agent's color on
// the rail, cyan otherwise) and when a notification pops. Presentation only; off outside the Forgeheart skins and
// when Windows asks for reduced motion.
const Juice = (() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const on = () => /\bforge\b/.test(document.documentElement.dataset.skin || '') && !reduced.matches;
  let layer = null;
  let lastAt = 0;
  function burst(x, y, { color = '#48ddff', count = 5, spread = 22 } = {}) {
    if (!on()) return;
    const now = performance.now();
    if (now - lastAt < 40) return; // no storms from fast repeats
    lastAt = now;
    if (!layer) { layer = document.createElement('div'); layer.className = 'juice-layer'; document.body.append(layer); }
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
  addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !on()) return;
    const b = e.target.closest?.('button, .agent-btn, .tool-btn, .item');
    if (!b || b.disabled || b.closest('.three-preview, .mb-tl-wrap, canvas')) return;
    const primary = b.matches('.primary, #broadcast button');
    const agent = b.matches('.agent-btn') ? getComputedStyle(b).getPropertyValue('--agent').trim() : '';
    burst(e.clientX, e.clientY, primary ? { color: '#ffd75e', count: 8, spread: 30 } : agent ? { color: agent, count: 6, spread: 24 } : { color: '#48ddff', count: 4, spread: 16 });
  }, true);
  // a small burst at the left edge of each new notification
  // (only the body's direct children are watched, until the toast box exists; then just that box)
  const onToasts = (list) => {
    if (!on()) return;
    for (const m of list) for (const t of m.addedNodes) {
      if (!(t instanceof HTMLElement) || !t.classList.contains('toast')) continue;
      requestAnimationFrame(() => { const r = t.getBoundingClientRect(); if (r.width) burst(r.left + 4, r.top + r.height / 2, { color: t.classList.contains('error') ? '#ff6a6a' : '#ffd75e', count: 5, spread: 18 }); });
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
  return { burst };
})();
