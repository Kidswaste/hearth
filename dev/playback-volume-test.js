const assert = require('assert/strict'), fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const master = require('../volumemain'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-volume-unit-'));
const handlers = {}, events = {}, broadcasts = [], jobs = [];
const frame = { send: (...args) => broadcasts.push(args) }, wc = { mainFrame: frame, isDestroyed: () => false };
frame.framesInSubtree = [frame];
master.init({ app: { getPath: () => dir, on() {} }, session: { defaultSession: { registerPreloadScript() {} } },
  ipcMain: { on: (n, fn) => events[n] = fn, handle: (n, fn) => handlers[n] = fn },
  webContents: { getAllWebContents: () => [wc] }, getWin: () => ({ webContents: wc }) });
const event = { sender: wc, senderFrame: frame };
const source = fs.readFileSync(path.join(__dirname, '../creative-vstmain.js'), 'utf8');
const body = source.slice(source.indexOf('function pool(options)'), source.indexOf('// (round 62, parkjam62) <data>'));
const host = { alive: true, scan: () => ({ ok: true }), knows: () => true, stop() {},
  request: async r => { jobs.push(r); return { ok: true }; }, send: r => { jobs.push(r); return true; } };
const pool = vm.runInNewContext(`${body};pool`, { require: () => master, create: () => host, STREAMED: ['volume'], EMBED_ACTIONS: [], process, performance });
(async () => {
  assert.equal(master.get(), .75);
  const p = pool({}); await p.request({ action: 'live-start', plugin: 'Vital', gain: .2 });
  assert(Math.abs(jobs.at(-1).gain - .15) < 1e-9);
  await handlers['volume:set'](event, .5);
  assert.equal(jobs.at(-1).gain, .1);
  p.send({ action: 'volume', plugin: 'Vital', gain: .4 });
  assert.equal(jobs.at(-1).gain, .2);
  await handlers['volume:set'](event, 0);
  assert.equal(jobs.at(-1).gain, 0);
  await handlers['volume:set'](event, .75);
  assert(Math.abs(jobs.at(-1).gain - .3) < 1e-9);
  await p.request({ action: 'render', plugin: 'Vital', gain: .4 });
  assert.equal(jobs.at(-1).gain, .4, 'Render output unaffected');
  await assert.rejects(() => handlers['volume:set']({ sender: {}, senderFrame: frame }, 1));
  await assert.rejects(() => handlers['volume:set'](event, NaN));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'playback-volume.json'))).volume, .75);
  assert.equal(broadcasts.at(-1)[1], .75);
  console.log('Playback volume: persistence, sender validation, VST scaling/mute/unmute, and export isolation passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
