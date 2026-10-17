const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const { create, discover } = require('../creative-vstmain');
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-vst-unit-'));
  let host;
  try {
    const root = path.join(temp, 'plugins'); fs.mkdirSync(root);
    fs.mkdirSync(path.join(root, 'Serum2.vst3')); fs.writeFileSync(path.join(root, 'Vital.vst3'), 'fixture'); fs.writeFileSync(path.join(root, 'Other.vst3'), 'excluded');
    assert.deepEqual(discover([root, root]).map(p => p.name), ['Serum 2', 'Vital']);
    // (round 58, codexcare58) one plugin, one row: a symlinked root, and (Windows / Mac) the same bundle in another case
    const alias = path.join(temp, 'alias'); fs.symlinkSync(root, alias, 'junction'); assert.equal(discover([root, alias]).length, 2); assert.equal(discover([root, path.join(temp, 'missing')]).length, 2);
    const twice = path.join(temp, 'twice'); fs.mkdirSync(path.join(twice, 'Vital.vst3'), { recursive: true }); fs.mkdirSync(path.join(twice, 'vital.VST3')); assert.equal(discover([twice], true).length, 1); assert.equal(discover([twice], false).length, 2);
    const { pathKey } = require('../creative-vstmain'); assert.equal(pathKey('/A/Caf\u0065\u0301.vst3', true), pathKey('/a/caf\u00e9.VST3', true)); assert.notEqual(pathKey('/A/x', false), pathKey('/a/x', false));
    const none = create({ dataDir: path.join(temp, 'fresh'), roots: [root], helper: path.join(temp, 'unused.js') }); none.scan();
    if (!process.env.HEARTH_VST_PYTHON) { const t0 = Date.now(); assert.equal((await none.status()).missing, true); assert.match((await none.request({ action: 'inspect', plugin: path.join(root, 'Vital.vst3') })).error, /Install the local audio runtime first/); assert(Date.now() - t0 < 2000, 'no runtime: answered at once'); }
    const helper = path.join(temp, 'worker.js');
    fs.writeFileSync(helper, `const fs=require('fs'),net=require('net'),config=JSON.parse(fs.readFileSync(process.argv[2]));const server=net.createServer(s=>{let data='';s.on('data',d=>{data+=d;if(!data.endsWith('\\n'))return;const j=JSON.parse(data);if(j.token!==config.token)return s.end(JSON.stringify({ok:false,error:'token'})+'\\n');if(j.action==='inspect')process.exit(9);if(j.action==='live-start')return;s.end(JSON.stringify({ok:true,version:'fixture',name:j.name})+'\\n')})});server.listen(0,'127.0.0.1',()=>fs.writeFileSync(process.argv[3],JSON.stringify({ok:true,port:server.address().port})));`);
    host = create({ dataDir: temp, python: process.execPath, roots: [root], helper });
    assert.equal((await host.status()).version, 'fixture'); const list = host.scan(); assert.equal(list.plugins.length, 2);
    assert.equal((await host.request({ action: 'inspect', plugin: '/unscanned.vst3' })).ok, false);
    assert.equal(host.scan(['relative-folder']).ok, false);
    const p = list.plugins[0].path;
    assert.equal((await host.request({ action: 'names', plugin: p, name: 'Serum 2 FX' })).ok, false);
    const crashed = await host.request({ action: 'inspect', plugin: p }); assert.equal(crashed.ok, false); assert.match(crashed.error, /disconnected|exited/); assert.equal(host.busy, false);
    await new Promise(r => setTimeout(r, 100)); assert.equal((await host.status()).ok, true);
    const running = host.request({ action: 'live-start', plugin: p }); await new Promise(r => setTimeout(r, 100)); assert.equal(host.busy, true); host.stop(); assert.equal((await running).ok, false); assert.equal(host.busy, false);
    await new Promise(r => setTimeout(r, 100)); assert.equal((await host.status()).ok, true);
    host.stop(); await new Promise(r => setTimeout(r, 200));
    assert.equal(fs.readdirSync(path.join(temp, 'creative-vst')).filter(p => p.startsWith('session-')).length, 0);
    console.log('VST host: strict two-instrument discovery, scoped paths/names, persistent IPC, crash recovery, cancellation and session cleanup passed.');
  } finally { host?.stop(); if (path.dirname(temp) !== os.tmpdir()) throw Error('Unexpected test cleanup path'); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
