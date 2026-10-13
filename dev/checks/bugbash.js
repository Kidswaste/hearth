// (round 29, bugbash) Regressions for the app bugs the bug bash fixed (docs/upgrades/bugbash.md):
// 1. the Lab opened by ThreeLab.cmd() (a command, a director call, the palette) right after its lazy group came in,
//    before its tab was ever shown, mounted twice: two Labs in one body, two preview pages, and keys pressed on the
//    visible preview went to the hidden Lab (Ctrl+Z, . and the rest did nothing).
//   node dev/smoke.js --check-timeout 300000 --script dev/checks/bugbash.js --shot /tmp/bugbash.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [] };
const step = (what, ok, detail) => { out.steps.push(`${ok ? '✓' : '✖'} ${what}${detail === undefined ? '' : ` · ${JSON.stringify(detail)}`}`); return ok; };

// 1. one Lab, however it is opened
await until(() => typeof ThreeLab !== 'undefined' && Lazy.loaded('lab'), 30000); // the lab group comes in soon after the first screen
const S = H.surfaces.get('tool:three');
step('the Lab tab was never shown yet', !S?.mounted, { mounted: S?.mounted });
const c = await ThreeLab.cmd();
await until(() => c.state && S.el.querySelector('iframe.three-frame'), 15000);
await wait(2500);
const count = { panes: S.el.querySelectorAll('.tabpane').length, frames: S.el.querySelectorAll('iframe.three-frame').length, timelines: S.el.querySelectorAll('canvas.mb-timeline').length };
step('ThreeLab.cmd() on a Lab never shown mounts it once (one pane, one preview page, one timeline)', count.panes === 1 && count.frames === 1 && count.timelines === 1, count);

out.ok = out.steps.every((s) => s.startsWith('✓'));
return JSON.stringify(out, null, 1);
