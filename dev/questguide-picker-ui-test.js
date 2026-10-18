const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id, { hidden: false, disabled: false, textContent: '', value: '', dataset: {}, firstElementChild: { style: {} }, setAttribute() {}, scrollIntoView() { this.scrolled = true; }, focus() {} });
  return nodes.get(id);
};
const snap = { session: { kind: 'music', title: 'Fixture song', paused: true, done: [] }, total: 5, completed: 1, index: 1, step: { id: 'tempo', check: 'bpm', targetBpm: 95, app: 'fl' }, fl: {}, project: {} };
let reply, resolvePick, picks = 0;
vm.runInNewContext(fs.readFileSync(require.resolve('../questguide-window.js'), 'utf8'), {
  document: { getElementById: node },
  questCompanion: { onChange() {}, onError() {}, call: async a => {
    if (a.op === 'state') return { ok: true, value: snap };
    picks++; return new Promise(resolve => { resolvePick = () => resolve(reply); });
  } },
});
(async () => {
  await new Promise(resolve => setImmediate(resolve));
  const button = node('choose-project');
  const pending = button.onclick();
  assert.equal(button.disabled, true); assert.match(button.textContent, /reading/);
  await button.onclick(); assert.equal(picks, 1, 'double click does not open two pickers');
  reply = { ok: false, error: 'This project format is unsupported.' }; resolvePick(); await pending;
  assert.equal(node('error').hidden, false); assert.equal(node('error').scrolled, true, 'error is brought into view above the scrolled setup');
  assert.equal(button.disabled, false);
  const success = button.onclick();
  reply = { ok: true, value: { ...snap, project: { path: 'C:\\Songs\\fixture.flp', bpm: 95 } } }; resolvePick(); await success;
  assert.match(node('project-path').textContent, /Connected · fixture.flp · 95 BPM/);
  assert.match(node('project-path').textContent, /Resume/);
  assert.equal(node('project-path').scrolled, true);
  assert.equal(node('connect').textContent, 'Project connected');
  assert.equal(node('error').hidden, true); assert.equal(button.disabled, false);
  console.log('PASS: picker busy state, duplicate click, visible error, connection and paused guidance');
})().catch(e => { console.error(e); process.exitCode = 1; });
