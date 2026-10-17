const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const { create, discover } = require('../creative-vstmain');
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-vst-unit-'));
  try {
    const root = path.join(temp, 'plugins'); fs.mkdirSync(root); fs.mkdirSync(path.join(root, 'Bundle.vst3')); fs.writeFileSync(path.join(root, 'Flat.vst3'), 'fixture');
    assert.equal(discover([root, root]).length, 2);
    // (round 58, codexcare58) one plugin, one row: a symlinked root and (Windows / Mac) the same folder in another case
    const alias = path.join(temp, 'alias'); fs.symlinkSync(root, alias, 'junction'); assert.equal(discover([root, alias]).length, 2);
    const twice = path.join(temp, 'twice'); fs.mkdirSync(path.join(twice, 'Synth.vst3'), { recursive: true }); fs.mkdirSync(path.join(twice, 'synth.VST3')); assert.equal(discover([twice], true).length, 1); assert.equal(discover([twice], false).length, 2); assert.equal(discover([root, path.join(temp, 'missing')]).length, 2);
    const { pathKey } = require('../creative-vstmain'); assert.equal(pathKey('/A/Caf\u0065\u0301.vst3', true), pathKey('/a/caf\u00e9.VST3', true)); assert.notEqual(pathKey('/A/x', false), pathKey('/a/x', false));
    const helper = path.join(temp, 'worker.js');
    fs.writeFileSync(helper, `const fs=require('fs'),j=JSON.parse(fs.readFileSync(process.argv[2]));if(j.action==='status')fs.writeFileSync(process.argv[3],JSON.stringify({ok:true,version:'fixture'}));else if(j.name==='hang')setInterval(()=>{},1000);else process.exit(9);`);
    const host = create({ dataDir: temp, python: process.execPath, roots: [root], helper });
    assert.equal((await host.status()).version, 'fixture'); const list = host.scan(); assert.equal(list.plugins.length, 2);
    assert.equal((await host.request({ action: 'inspect', plugin: '/unscanned.vst3' })).ok, false);
    assert.equal(host.scan(['relative-folder']).ok, false);
    const p = list.plugins[0].path;
    const crashed = await host.request({ action: 'inspect', plugin: p }); assert.equal(crashed.ok, false); assert.match(crashed.error, /exited/); assert.equal(host.busy, false);
    const running = host.request({ action: 'inspect', plugin: p, name: 'hang' }); await new Promise(r => setTimeout(r, 100)); assert.equal(host.busy, true); assert.equal((await host.status()).ok, false); host.stop(); assert.equal((await running).ok, false); assert.equal(host.busy, false); assert.equal((await host.status()).ok, true);
    // (round 58, codexcare58) a plugin that never answers is stopped at the job's time limit with a plain message
    const quick = create({ dataDir: temp, python: process.execPath, roots: [root], helper, jobMs: 300 }); quick.scan();
    const slow = await quick.request({ action: 'inspect', plugin: p, name: 'hang' }); assert.equal(slow.ok, false); assert.match(slow.error, /timed out/); assert.equal(quick.busy, false);
    const none = create({ dataDir: path.join(temp, 'fresh'), roots: [root], helper }); none.scan();
    if (!process.env.HEARTH_VST_PYTHON) assert.equal((await none.status()).missing, true), assert.match((await none.request({ action: 'inspect', plugin: p })).error, /Install the local VST runtime first/);
    assert.equal(fs.readdirSync(path.join(temp, 'creative-vst')).filter(p => p.startsWith('job-')).length, 0);
    console.log('VST host: discovery, scoped paths, crash isolation, single-operation locking, stop/retry and temporary cleanup passed.');
  } finally { if (path.dirname(temp) !== os.tmpdir()) throw Error('Unexpected test cleanup path'); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
