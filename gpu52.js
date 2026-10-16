// The best graphics path on each computer (round 52, gpu52), the window's side (loads with glrecover.js, after the
// first screen). gpu52main.js picks the path at the start; this shows it and lets you change it:
//   · Settings › Advanced › Graphics: one plain line, "Graphics: NVIDIA GeForce RTX 4090 (D3D11) · 240 Hz · hardware
//     video ✓" (the screen's refresh is measured too: "(drawing 60 fps)" when the window can't keep up with it)
//   · /graphics (glrecover.js) adds the line; /graphics power auto|high|saver, /graphics backend auto|d3d11|vulkan|metal…
//     and /graphics blocklist ignore|keep are the hidden choices (each takes effect at the next start; a path that
//     doesn't reach the card goes back to the default by itself)
//   · Hearth started without the card on a computer that has one: one calm note with why (and Restart when it helps)
// Nothing is sent anywhere, no tokens.
const Gpu52 = (() => {
  const S = { info: null, fps: 0, shown: new Set() };
  const api = () => window.hub?.gpu52;

  // the screen's real pace here: the median gap between ~40 frames (only when asked: Settings open, /graphics)
  function measureFps(frames = 40) {
    return new Promise((resolve) => {
      const gaps = []; let last = 0; let n = 0;
      const tick = (t) => { if (last) gaps.push(t - last); last = t; if (++n <= frames) requestAnimationFrame(tick); else { gaps.sort((a, b) => a - b); const m = gaps[gaps.length >> 1] || 0; resolve(m ? Math.round(1000 / m) : 0); } };
      requestAnimationFrame(tick);
      setTimeout(() => resolve(0), 2000); // (a hidden window draws no frames)
    });
  }
  async function info({ fps = false } = {}) {
    if (fps && document.visibilityState === 'visible') S.fps = await measureFps();
    try { S.info = await api()?.info?.({ fps: S.fps }); } catch { /* old main */ }
    return S.info;
  }
  const summary = () => (S.info?.line ? S.info.line.replace(/^Graphics:\s*/, '') : 'Graphics card, screen refresh, hardware video');

  // Settings › Advanced › Graphics: the line (filled when it arrives) and what the hidden choices are
  function mount(node) {
    if (!node) return;
    const lineEl = el('div', { class: 'sf-hint gpu52-line', text: S.info?.line || 'Graphics: looking…' });
    const extra = el('div', { class: 'sf-hint gpu52-more' });
    node.replaceChildren(lineEl, extra);
    info({ fps: true }).then((i) => {
      if (!i) return;
      lineEl.textContent = i.line;
      const d = i.decision || {};
      const bits = [];
      if (!d.auto) bits.push(`your pick: ${i.backend}`);
      if (d.power && d.power !== 'auto') bits.push(d.power === 'high' ? 'always the fast card' : 'the power-saving card');
      if (d.ignoreBlocklist) bits.push('driver guard off');
      if (d.fellBack) bits.push('your pick didn\'t start: back on the usual path');
      extra.textContent = `${bits.length ? `${bits.join(' · ')} — ` : ''}ask in a chat to use another card or way of drawing (from the next start)`; // (no /command on Settings: settingscalm)
      node.closest('details')?.dispatchEvent(new Event('sf-changed', { bubbles: true }));
    });
  }

  // ---------- the hidden choices (/graphics …) ----------
  const CHOICES = { power: ['auto', 'high', 'saver'], blocklist: ['keep', 'ignore'] };
  const backends = () => ({ win32: ['auto', 'd3d11', 'vulkan', 'd3d11on12', 'gl'], darwin: ['auto', 'metal', 'gl'] }[S.info?.decision?.platform || (navigator.userAgent.includes('Mac') ? 'darwin' : /Windows/.test(navigator.userAgent) ? 'win32' : 'linux')] || ['auto', 'gl', 'vulkan']);
  const WORDS = { power: { auto: 'the fast card for the Lab and games (Windows: for all of Hearth), the small one otherwise', high: 'always the fast card', saver: 'always the power-saving card' } };
  async function set(what, value) {
    const s = H.config.settings || (H.config.settings = {});
    if (what === 'power') { if (!CHOICES.power.includes(value)) return `Pick one: ${CHOICES.power.join(', ')}`; s.gpuPower = value === 'auto' ? undefined : value; }
    else if (what === 'backend') { if (!backends().includes(value)) return `Pick one: ${backends().join(', ')}`; s.gpuBackend = value === 'auto' ? undefined : value; }
    else if (what === 'blocklist') { if (!CHOICES.blocklist.includes(value)) return 'Pick one: keep, ignore'; s.gpuIgnoreBlocklist = value === 'ignore' ? true : undefined; }
    else return null;
    await saveConfig();
    try { await api()?.reset?.(); } catch { /* old main */ }
    const said = what === 'power' ? WORDS.power[value] : what === 'backend' ? (value === 'auto' ? 'the usual path' : value) : value === 'ignore' ? 'without the driver guard' : 'with the driver guard';
    return { text: `Graphics: ${said} from the next start. Restart Hearth to use it now${what !== 'power' && value !== 'auto' && value !== 'keep' ? ' (if it doesn\'t reach the card, Hearth goes back to the usual path by itself)' : ''}.`, restart: true };
  }
  // /graphics [status | power … | backend … | blocklist …] → text, or null (glrecover.js shows its status)
  async function cmd(args = '', ctx = null) {
    const [what, value] = String(args).trim().toLowerCase().split(/\s+/);
    if (!what || what === 'status') return null;
    if (!value) return `/graphics ${what} ${what === 'backend' ? backends().join('|') : (CHOICES[what] || []).join('|')}`;
    const r = await set(what, value);
    if (!r || typeof r === 'string') return r;
    if (ctx?.note) { ctx.note(r.text, { actions: [{ label: 'Restart', run: () => window.hub.restartApp?.() }] }); return ''; }
    return r.text;
  }
  const complete = (args = '') => {
    const [what] = String(args).trim().split(/\s+/);
    const list = what === 'power' ? CHOICES.power : what === 'backend' ? backends() : what === 'blocklist' ? CHOICES.blocklist : null;
    if (list && /\s/.test(args)) return list.map((v) => ({ value: `${what} ${v}`, hint: what === 'power' ? WORDS.power[v] : v === 'auto' ? 'the usual path' : '' }));
    return [{ value: 'status', hint: 'what draws Hearth now' }, { value: 'power ', hint: 'which card on a two-card laptop' }, { value: 'backend ', hint: 'how WebGL reaches the card (advanced)' }, { value: 'blocklist ', hint: 'the driver guard (advanced)' }];
  };

  // ---------- started without the card: one calm note ----------
  function offer(n) {
    if (!n || n.shown || S.shown.has(n.id)) return;
    S.shown.add(n.id);
    const show = () => { api()?.shown?.().catch?.(() => {}); return toast(n.text, { timeout: 30000, ...(n.restart ? { action: { label: 'Restart', fn: () => window.hub.restartApp?.() } } : {}) }); };
    if (window.Hints) Hints.offer({ id: `gpu52:${n.id}`, kind: 'notice', rank: 3, once: false, ttl: 60 * 60000, show }); else show();
  }
  api()?.onNote?.(offer);
  setTimeout(() => { info().then((i) => offer(i?.note)).catch(() => {}); }, 0);

  return { info, mount, summary, measureFps, cmd, complete, set };
})();
window.Gpu52 = Gpu52;
