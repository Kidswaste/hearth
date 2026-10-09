// Robust (round 9): the black Lab preview after `/director-engine astra`. Cause: every config save re-appended every
// surface (renderer.js syncSurfaces), which restarts the frames inside them; the Lab's sandbox came back up empty
// (it said "ready" again for the same load, and nobody ran the sketch). Now surfaces only move when out of order, and
// a sandbox that restarts by itself runs its sketch again. Checked: the preview keeps drawing through an engine
// switch and a plain config save (same page, no reload), and a forced restart (the Lab moved in the page) redraws.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --lib dev/checks/journey-lib.js --script dev/checks/robust-lab.js
const { step, wait, until } = J;
const claude = H.claudeAgent();
activate(claude.id); await wait(300);
Commands.tryRun('/director-setup', claude.id);
await until(() => [...document.querySelectorAll('dialog[open] button, .modal button')].some((b) => /Add it/.test(b.textContent)) || H.agents().some((a) => a.dock === 'three'), 6000);
[...document.querySelectorAll('dialog[open] button, .modal button')].find((b) => /Add it/.test(b.textContent))?.click();
await until(() => H.agents().some((a) => a.dock === 'three'), 8000);
const dir = H.agents().find((a) => a.dock === 'three');
activate(dir.id); await wait(1500);
// the preview's own pixels: a canvas exists and isn't black
const pixels = async () => {
  const r = await ThreeLab.director.evalInSketch('const c = document.querySelector("canvas"); if (!c) return { canvas: false }; const g = document.createElement("canvas"); g.width = 24; g.height = 24; const x = g.getContext("2d"); x.drawImage(c, 0, 0, 24, 24); const d = x.getImageData(0, 0, 24, 24).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return { canvas: true, lum: Math.round(s / (24 * 24 * 3)) }').catch((e) => ({ error: String(e) }));
  return r?.value || r;
};
const drawing = async (ms = 15000) => { let p = null; await until(async () => { p = await pixels(); return p?.canvas && p.lum > 2; }, ms); return p; };
const frame = () => H.surfaces.get('tool:three')?.el.querySelector('iframe.three-frame');
const p0 = await drawing();
step('the Lab preview draws with Claude as the director', p0?.canvas && p0.lum > 2, p0);
let loads = 0;
frame().addEventListener('load', () => { loads += 1; });
const reloads0 = ThreeLab.live.counts().reloads.preview || 0;

Commands.tryRun('/director-engine astra', dir.id);
await until(() => H.agent(dir.id).engine === 'codex', 8000);
await wait(2500);
const p1 = await pixels();
step('/director-engine astra: the preview still draws (no black frame)', p1?.canvas && p1.lum > 2, p1);
step('… and the page wasn\'t restarted', loads === 0 && (ThreeLab.live.counts().reloads.preview || 0) === reloads0, { loads });
await smoke({ shot: '/tmp/robust-lab-astra.png' });

// any config save (a setting, a new agent) leaves the Lab alone too
H.config.layout = { ...(H.config.layout || {}), robustProbe: Date.now() };
await window.hub.saveConfig(H.config);
await wait(2000);
const p2 = await pixels();
step('a plain config save: the preview still draws, same page', p2?.canvas && p2.lum > 2 && loads === 0, { p2, loads });

// the safety net: the Lab's surface moved in the page (the browser restarts its frames) → the sketch runs again
const s = H.surfaces.get('tool:three').el;
s.parentNode.append(s);
await until(() => loads > 0, 5000);
const p3 = await drawing(15000);
step('a sandbox restarted by the browser runs its sketch again (not black)', loads > 0 && p3?.canvas && p3.lum > 2, { loads, p3 });

Commands.tryRun('/director-engine claude', dir.id);
await until(() => H.agent(dir.id).engine === 'claude', 8000);
await wait(1500);
const p4 = await pixels();
step('back to Claude: still drawing', p4?.canvas && p4.lum > 2, p4);
return J.done();
