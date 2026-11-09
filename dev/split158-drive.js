// (round 158, split158) The drive behind the Lab-core coverage (docs/upgrades/split158.md): what the first Lab paint and
// the everyday Lab use run. Not a check: a smoke.js script for --coverage (CDP precise coverage), realscene-lib's scene.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --coverage /tmp/cov158.json --lib dev/checks/realscene-lib.js --script dev/split158-drive.js
//   node dev/coverage-report.js /tmp/cov158.json --file tools/three.js
// Steps: open the Lab, the real scene playing, select each layer (a real click on its row), move knobs (input events
// on the sliders), the AI director's everyday calls on the fresh scene, stop.
const out = { steps: [] };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  const info = await RS.open({ play: true });
  out.steps.push(`open ${JSON.stringify(info.layers)}`);
  await wait(3000);
  const lab = () => document.querySelector('.surface.active') || document;
  for (const r of [...lab().querySelectorAll('.ly-row[data-id]')]) { r.click(); await wait(400); }
  out.steps.push('layers selected');
  const ranges = [...lab().querySelectorAll('input[type=range]')].filter((n) => n.getClientRects().length).slice(0, 8);
  for (const n of ranges) {
    const lo = Number(n.min || 0), hi = Number(n.max || 1);
    for (const f of [0.3, 0.6, 0.45]) { n.value = String(lo + (hi - lo) * f); n.dispatchEvent(new Event('input', { bubbles: true })); await wait(60); }
    n.dispatchEvent(new Event('change', { bubbles: true }));
  }
  out.steps.push(`knobs moved: ${ranges.length}`);
  for (const [tool, args] of [['three_layers', {}], ['three_sliders', {}], ['three_select_layer', { name: 'Beat burst' }], ['three_get_code', {}], ['three_screenshot', {}],
    ['three_add_layer', { name: 'Drive layer', code: "import * as THREE from 'three';\nconst r = new THREE.WebGLRenderer({ alpha: true }); r.setSize(innerWidth, innerHeight); document.body.append(r.domElement);" }],
    ['three_update_layer', { name: 'Drive layer', visible: false }], ['three_console', {}], ['three_remove_layer', { name: 'Drive layer' }]]) {
    const r = await HubBridge.call(tool, args, {});
    out.steps.push(`${tool}: ${r?.ok === false ? r.error : 'ok'}`);
  }
  await wait(2000);
  await RS.close();
  await wait(1000);
} catch (err) { out.error = String(err?.stack || err); }
return out;
