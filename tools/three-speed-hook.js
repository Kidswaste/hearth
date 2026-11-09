// ⚡ "Why is this slow?" (round 133, speed133): what loads with the Lab. The card itself (three-speed*.js, lazy group
// "speedcheck") loads on first use; this small part gives it its ways in:
//   · a small chip beside the stats line, by itself, once the preview has been under 50 fps (or under half the screen's
//     rate) for 5 s in a row while it plays: "Slow: 21 fps · Why? · ✕". Not when the frame cap you chose (or Light
//     mode's 30) is what holds it, nor while parked, frozen or still. ✕ hides it for this scene until the Lab opens it
//     again (store three.speedChip = false: never)
//   · when the graphics card drops the preview (glrecover's 'lost' / 'remaking'): the chip offers
//     "Reopen in safe mode" (1× pixels, no antialias, no shadows: one undo step), and so does the card
//   · ⚡ Speed check in the toolbar's ⋯ (This Lab, beside 🩺 Fix my scene) and ✦ More (the preview's right-click);
//     /speed-check [safe | undo | status]
// The watch is a few compares per stats message (twice a second at most), nothing per frame.
const LabSpeedHook = (() => {
  const HOLD = 5000;
  const S = { since: 0, idleAt: 0, fastAt: 0, scene: null, chip: null, mode: null, fps: 0, hidden: new Set(), shows: 0, gl: null };
  const sp = () => (typeof ThreeLab !== 'undefined' ? ThreeLab.speed : null);
  const limit = (hz) => Math.max(50, (Number(hz) || 0) / 2);
  // slow now? a frame cap you chose (or 🪶 Light mode's 30) holding it isn't "slow"
  function slow(msg, ctx) {
    const fps = Number(msg?.fps) || 0;
    if (!(fps > 0)) return false;
    if (ctx.userCap > 0 && fps >= ctx.userCap * 0.9) return false;
    if (ctx.light && fps >= 27) return false;
    return fps < limit(msg.hz);
  }
  const playing = (msg, ctx) => !ctx.parked && !ctx.frozen && !document.hidden && !msg?.pace?.still && (Number(msg?.fps) || 0) > 0;

  async function card(fn = (C) => C.open()) {
    if (typeof LabSpeed === 'undefined' && typeof Lazy !== 'undefined') await Lazy.load('speedcheck');
    if (typeof LabSpeed === 'undefined') throw new Error('The speed check did not load');
    return fn(LabSpeed);
  }
  const openIt = () => { hideChip(true); return card().catch((e) => toast(e.message, { type: 'error' })); };
  const safeIt = () => { hideChip(true); return card((C) => C.safe()).catch((e) => toast(e.message, { type: 'error' })); };
  const item = () => ({ label: '⚡ Speed check', hint: 'why is it slow? one-click fixes (no tokens)', cmd: 'speed-check', action: openIt });
  const toolbarRow = () => ['⚡ Speed check', 'Why is it slow? Measured here, one-click fixes (no tokens)', openIt, false, 'Speed check'];

  // ---------- the chip ----------
  addEventListener('hearth:lab-drop', (e) => { if (e.detail?.dropped) { S.chip?.remove(); S.chip = null; S.mode = null; S.gl = null; } }); // (round 161, fix161) Hearth's Lab let go entirely (ThreeLab.drop)
  function hideChip(forScene) {
    if (forScene && S.scene && S.mode === 'slow') S.hidden.add(S.scene);
    S.chip?.remove(); S.chip = null; S.mode = null;
  }
  function chip(mode, text) {
    const h = sp(); if (!h?.host) return null;
    if (!S.chip || S.mode !== mode) {
      S.chip?.remove();
      const go = mode === 'gl' ? { t: 'Reopen in safe mode', tip: 'Run this scene again on a fresh preview at 1× pixels, without antialias or shadows (renders keep full quality; one undo step)', fn: safeIt } : { t: 'Why?', tip: 'Measure for 3 s on this computer: what makes it slow, with one-click fixes', fn: openIt };
      S.chip = el('div', { class: `lab-speedchip ${mode}`, attrs: { role: 'status' } },
        el('span', { class: 'lab-speedchip-t' }),
        el('button', { type: 'button', class: 'lab-speedchip-go', text: go.t, title: go.tip, on: { click: (e) => { e.stopPropagation(); go.fn(); } } }),
        mode === 'slow' ? el('button', { type: 'button', class: 'lab-speedchip-cost', title: 'Which layer costs the frames? Measures once, then shows each layer\'s cost on its row in Layers & knobs', attrs: { 'aria-label': 'Show the cost of each layer' }, on: { click: (e) => { e.stopPropagation(); hideChip(true); card(() => LabCost.toggle(true)).catch((x) => toast(x.message, { type: 'error' })); } } }) : null, // (round 146, layercost146) ▦ (its glyph from tools/three-lab.css)
        el('button', { type: 'button', class: 'lab-speedchip-x', text: '✕', title: 'Hide (for this scene)', attrs: { 'aria-label': 'Hide' }, on: { click: (e) => { e.stopPropagation(); if (mode === 'gl') S.gl = null; hideChip(true); } } }));
      S.chip.addEventListener('contextmenu', (e) => e.stopPropagation());
      S.mode = mode;
      h.host.append(S.chip);
      S.shows += 1;
    }
    const t = S.chip.firstChild;
    if (t.textContent !== text) t.textContent = text;
    return S.chip;
  }
  // each stats message from the preview (tools/three.js, twice a second at most)
  function stats(msg) {
    const h = sp(); if (!h) return;
    const scene = h.sceneId();
    if (S.scene !== scene) { S.scene = scene; S.since = 0; if (S.mode === 'slow') hideChip(); }
    if (S.mode === 'gl') return; // the graphics card's chip stays until used or closed
    if (store.get('three.speedChip', true) === false) return;
    const ctx = { userCap: h.userCap(), light: h.light(), parked: h.parked(), frozen: h.frozen() };
    const now = Date.now();
    if (!(Number(msg.fps) > 0)) return; // no frames counted in this message: neither slow nor fast
    S.fps = Math.round(Number(msg.fps));
    // one message that isn't slow (a frame burst) or a moment's pause doesn't start the 5 s again: 2 s paused / 3 s fast does
    const calm = (k, ms) => { S[k] ||= now; if (now - S[k] >= ms) { S.since = 0; if (S.mode === 'slow') hideChip(); } };
    if (!playing(msg, ctx)) { calm('idleAt', 2000); return; }
    if (!slow(msg, ctx)) { calm('fastAt', 3000); return; }
    S.idleAt = 0; S.fastAt = 0;
    if (!S.since) S.since = now;
    if (now - S.since < HOLD || S.hidden.has(scene) || (typeof LabSpeed !== 'undefined' && LabSpeed.isOpen())) return;
    chip('slow', `Slow: ${S.fps} fps ·`);
  }
  // the graphics card dropped the preview: the safe way back, here and on the card
  addEventListener('hearth:lab-gl', (e) => {
    const st = e.detail?.state;
    if (st !== 'lost' && st !== 'remaking') return;
    if (window.LabSafe?.on?.(sp()?.sceneId?.())) return; // (round 147, safeopen147) Safe open's own banner says it
    S.gl = { at: Date.now(), state: st };
    chip('gl', 'The graphics card dropped the preview ·');
    if (typeof LabSpeed !== 'undefined') LabSpeed.glLost?.(S.gl);
  });
  addEventListener('hearth:sketch', () => { S.since = 0; if (S.mode === 'slow') hideChip(); });

  if (typeof Commands !== 'undefined' && !Commands.get?.('speed-check')) {
    Commands.register({
      name: 'speed-check', area: 'Three.js Lab', args: '[safe | undo | status]',
      desc: '⚡ Why is this Lab scene slow? Measures 3 s on this computer (no tokens): each layer\'s GPU time, draw calls, triangles, shaders, antialias, pixels, shadows, filters; the top 3 causes with one-click fixes (one undo each; preview-only fixes leave renders full quality). safe: 1× pixels, no antialias, no shadows',
      keywords: 'slow fps speed performance gpu lag stutter heavy frame rate antialias pixel ratio shadows bloom triangles why safe mode crash',
      examples: ['/speed-check', '/speed-check safe', '/speed-check undo'],
      complete: (a) => ['safe', 'undo', 'status'].filter((x) => x.startsWith(String(a || '').toLowerCase())).map((value) => ({ value })),
      async run(args) {
        const w = String(args || '').trim().toLowerCase();
        if (w === 'safe') { await card((C) => C.safe()); return 'Safe mode: the preview runs at 1× pixels, without antialias or shadows (renders keep full quality). /speed-check undo puts it back.'; }
        if (w === 'undo') return (await card((C) => C.undo())) ? 'Undone.' : 'Nothing to undo.';
        const r = await card((C) => (w === 'status' ? C.state() : C.open().then(() => C.state())));
        const a = r.analysis;
        if (!a?.ok) return a?.error || 'Measuring…';
        return [`${Math.round(a.fps)} fps on this computer (${a.frameMs} ms a frame).`, ...a.causes.map((c, i) => `${i + 1}. ${c.title} — ${c.fix.label} (${c.gainLine})`)].join('\n');
      },
    });
  }
  return { stats, item, toolbarRow, card, hideChip, state: () => ({ since: S.since, mode: S.mode, fps: S.fps, shows: S.shows, gl: S.gl, chip: S.chip, hidden: [...S.hidden] }), forget: () => { S.hidden.clear(); S.since = 0; S.idleAt = 0; S.fastAt = 0; } };
})();
