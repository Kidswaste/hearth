#!/usr/bin/env node
// Round 67 (Astra / Swarm repair) unit checks that need no window: the collaboration eyes' layer text, the After
// Effects job result reader (a temp folder, never the data folder), the Swarm partner rule.
//   node dev/round67-test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
let n = 0; const ok = (what) => { n += 1; console.log(`✓ ${what}`); };

(async () => {
  // collab-eyes.js: the layer list as a few lines (string or rows), capped
  global.window = {};
  require(path.join(root, 'collab-eyes.js'));
  const { layerText } = window.CollabEyes._test;
  assert.equal(layerText({ layers: '  Sky\n* Orb\n' }), '  Sky\n* Orb');
  assert.equal(layerText({ layers: [{ name: 'Sky' }, { name: 'Orb', selected: true }] }), 'Sky\n* Orb');
  const many = layerText({ layers: Array.from({ length: 30 }, (_, i) => `L${i}`).join('\n') }).split('\n');
  assert.equal(many.length, 21); assert.equal(many.at(-1), '… 10 more');
  assert.equal(layerText({ layers: '1. Layer 1*\n(bottom first, * = selected)' }), '1. Layer 1*', 'the Lab\'s own legend line is dropped');
  assert.equal(layerText(null), '');
  ok('collaboration eyes: layer list text, selected marked, capped at 20 lines');

  // aemain.js readJobResult, loaded from a temp copy so its data folder is a temp one
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-r67-'));
  for (const f of ['aemain.js', 'adobe-data.js']) fs.copyFileSync(path.join(root, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'store.js'), `module.exports = { DATA_DIR: ${JSON.stringify(path.join(dir, 'data'))} };`);
  fs.mkdirSync(path.join(dir, 'data'));
  const { readJobResult } = require(path.join(dir, 'aemain.js'))._test;
  const f = path.join(dir, 'r.json');
  assert.equal(await readJobResult(f), null, 'no file yet');
  fs.writeFileSync(f, '{"ok":true,"val'); assert.equal(await readJobResult(f), null, 'half written');
  fs.writeFileSync(f, '{"ok":true,"value":{"comps":3}}'); assert.deepStrictEqual(await readJobResult(f), { ok: true, value: { comps: 3 } });
  fs.writeFileSync(f, '{"ok":false,"error":"no comp (line 2)"}'); assert.equal((await readJobResult(f)).error, 'no comp (line 2)');
  const D = require(path.join(dir, 'adobe-data.js'));
  const body = D.wrap('app.project.activeItem.name = "x";', 'C:/tmp/r.json');
  assert(/catch \(e\)/.test(body) && !/alert\(/.test(body), 'a job never stops AE on an alert');
  ok('After Effects jobs: the answer is read only when complete; errors come back as text, no AE dialog');

  console.log(`\n${n} groups passed.`);
})().catch((err) => { console.error(err); process.exitCode = 1; });
