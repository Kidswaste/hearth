// Opt-in real installed-plugin verification. Opens audio output muted; never activates native editors.
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const { create } = require('../creative-vstmain');
(async () => {
  if (!process.env.HEARTH_VST_PYTHON) throw Error('Set HEARTH_VST_PYTHON to the scoped test runtime.');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-live-audio-'));
  const host = create({ dataDir: dir, python: process.env.HEARTH_VST_PYTHON });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  try {
    assert.equal((await host.status()).realtime, true);
    const plugins = host.scan().plugins; assert(plugins.every(p => ['Serum 2', 'Vital'].includes(p.name)));
    for (const plugin of plugins) {
      const call = (action, extra = {}) => host.request({ action, plugin: plugin.path, name: plugin.name, ...extra });
      const begin = Date.now(), loaded = await call('inspect'); assert(loaded.ok, loaded.error); assert(loaded.parameters.length);
      const devices = await call('devices'); const device = devices.devices.find(d => d.api === 'Windows WASAPI' && /Universal Audio/.test(d.name))?.id;
      let live = await call('live-start', { device, gain: 0, buffer: 512 }); assert(live.ok, live.error); assert(live.playing);
      assert((await call('midi', { note: 60, on: true })).ok); await sleep(700);
      const parameter = loaded.parameters.find(p => /vol|gain|level/i.test(p.key) && typeof p.value === 'number' && Number.isFinite(p.min) && Number.isFinite(p.max)); assert(parameter);
      const changed = parameter.value === parameter.min ? parameter.max : parameter.min;
      const patchBegan = Date.now(), patch = await call('patch', { parameters: { [parameter.key]: changed } }); assert(patch.ok, patch.error); const patchMs = Date.now() - patchBegan;
      assert((await call('patch', { parameters: { [parameter.key]: parameter.value } })).ok);
      await sleep(700); live = await call('live-status'); assert(live.playing); assert(live.blocks > 50); assert(live.peak > 0); assert.equal(live.gain, 0);
      const snap = await call('snapshot'); assert(snap.ok, snap.error); let preserved = await call('live-status'); assert.equal(preserved.device, device ?? null); assert.equal(preserved.gain, 0); assert(preserved.playing);
      const render = await call('render', { duration: .5, notes: [{ note: 60, time: 0, length: .2 }] }); assert(render.ok, render.error); assert(Buffer.from(render.audio, 'base64').subarray(0, 4).toString() === 'RIFF');
      preserved = await call('live-status'); assert.equal(preserved.device, device ?? null); assert(preserved.playing);
      assert.equal((await call('patch', { parameters: { missing_fake_parameter: .5 } })).ok, false);
      assert.equal((await call('volume', { gain: 99 })).ok, false);
      assert((await call('panic')).ok); assert((await call('live-stop')).ok);
      console.log(JSON.stringify({ plugin: plugin.name, elapsedMs: Date.now() - begin, patchMs, live, wavBytes: Buffer.from(render.audio, 'base64').length }));
    }
    assert.equal((await host.request({ action: 'inspect', plugin: plugins[0].path, name: 'Serum 2 FX' })).ok, false);
    host.stop(); await sleep(300); assert((await host.status()).ok); console.log('Muted real-time integration passed: allowlist, both instruments, MIDI, live patch, device-preserving snapshots/bounces, panic and host restart.');
  } finally { host.stop(); await sleep(500); fs.rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
