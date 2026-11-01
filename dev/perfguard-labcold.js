// (round 100, perf100) The Lab's COLD first start, for dev/perfguard.js (part `labcold`): one launch of Hearth on the
// heavy profile (the Lab not used in it), the Lab's button pressed 3 s after the first screen, while the start is still
// busy (part `fresh` measures the same press after a calm start of 5 minutes):
//   labcold.first   press → the preview drawing its first frame (__labPace); twin labcold.cpu: the window thread's CPU
//   labcold.shown   press → the preview frame on screen
// The result is written to <SMOKE_TMP>/perfguard-labcold.json.
//   node dev/smoke.js --fake-engines --no-lazy-wait --data /tmp/hearth-bigprofile72 --wait 100 --check-timeout 300000 --script dev/perfguard-labcold.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, what, ms = 30000, step = 25) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } throw Error(`timed out: ${what}`); };
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(15000)]);
const R = { samples: {}, notes: {}, problems: [] };
const add = (k, v) => { if (Number.isFinite(v)) (R.samples[k] ||= []).push(Math.round(v * 10) / 10); };
window.hub.openExternal = () => {};
await cdp('Performance.enable');
const thr = async () => { const m = (await cdp('Performance.getMetrics'))?.metrics || []; const v = m.find((x) => x.name === 'ThreadTime')?.value; return Number.isFinite(v) ? v * 1000 : NaN; };
try {
  await until(() => typeof H !== 'undefined' && H.agents().length > 0 && document.querySelector('#agent-buttons .space-button'), 'app', 60000, 10);
  R.notes.readyAt = Math.round(performance.now());
  await wait((Number(window.PF100_LAB_AT) || 3) * 1000); // (--eval "window.PF100_LAB_AT = 60": pressed after a calm start instead)
  R.notes.labBefore = window.LabBoot?.state ? JSON.stringify(LabBoot.state()).slice(0, 200) : null;
  R.notes.lazyLab = window.Lazy?.state ? JSON.stringify(Lazy.state()?.groups?.lab ?? Lazy.state()?.lab ?? null).slice(0, 120) : null;
  const drawn = async () => (await smoke({ target: 'three-sandbox', cdp: 'Runtime.evaluate', params: { expression: 'window.__labPace?.state()?.drawn', returnByValue: true } }))?.result?.value;
  const frameOn = () => document.querySelector('.surface[data-id="tool:three"] .three-preview .three-frame')?.checkVisibility?.({ visibilityProperty: true });
  await frame(); const c0 = await thr(); const t0 = performance.now(); let shown = null;
  R.notes.pressedAt = Math.round(t0);
  activate('tool:three');
  await until(async () => { if (shown == null && frameOn()) shown = performance.now() - t0; const n = shown != null ? await drawn().catch(() => null) : null; return n > 0; }, 'the Lab drawing', 60000, 20);
  add('labcold.first', performance.now() - t0); add('labcold.shown', shown); add('labcold.cpu', (await thr()) - c0);
} catch (err) { R.problems.push(`labcold: ${String(err?.message || err).slice(0, 300)}`); }
await window.hub.fs.write(`${window.SMOKE_TMP}/perfguard-labcold.json`, JSON.stringify(R, null, 1));
return JSON.stringify(R);
