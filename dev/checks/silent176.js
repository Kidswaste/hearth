// (round 176, silent176) on Windows a check's copy of Hearth stays off the owner's screen (dev/smoke-silent.js) and
// still draws at full speed there. Elsewhere (xvfb) there is nothing to hide: the steps only note what they saw.
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const t0 = Date.now(); while (!(window.hub && performance.getEntriesByName('hearth:ready').length) && Date.now() - t0 < 60000) await wait(200);
  await wait(1500);
  const win = /Windows/.test(navigator.userAgent);
  const at = { x: window.screenX, y: window.screenY, w: outerWidth, h: outerHeight, screen: [screen.width, screen.height] };
  step('the window is off the screen', !win || (at.x + at.w < 0 && at.y + at.h < 0), at);
  step('the page is still "visible" to itself (nothing sleeps)', document.visibilityState === 'visible', document.visibilityState);
  let frames = 0; const t = performance.now();
  await new Promise((r) => { const f = () => { frames += 1; if (performance.now() - t < 2000) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
  step('frames are drawn at speed out there', frames >= 50, { frames, in: '2 s' });
  let ticks = 0; const iv = setInterval(() => { ticks += 1; }, 20); await wait(1000); clearInterval(iv);
  step('timers are not slowed', ticks >= 35, { ticks, of: 50 });
  out.ok = !out.problems;
} catch (e) { out.error = String(e?.stack || e); }
return out;
