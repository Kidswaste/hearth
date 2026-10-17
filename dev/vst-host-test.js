const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict');
const { create, discover } = require('../creative-vstmain');
(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-vst-unit-'));
  try {
    const root = path.join(temp, 'plugins'); fs.mkdirSync(root); fs.mkdirSync(path.join(root, 'Bundle.vst3')); fs.writeFileSync(path.join(root, 'Flat.vst3'), 'fixture');
    assert.equal(discover([root, root]).length, 2);
    const helper = path.join(temp, 'worker.js');
    fs.writeFileSync(helper, `const fs=require('fs'),j=JSON.parse(fs.readFileSync(process.argv[2]));if(j.action==='status')fs.writeFileSync(process.argv[3],JSON.stringify({ok:true,version:'fixture'}));else if(j.name==='hang')setInterval(()=>{},1000);else process.exit(9);`);
    const host = create({ dataDir: temp, python: process.execPath, roots: [root], helper });
    assert.equal((await host.status()).version, 'fixture'); const list = host.scan(); assert.equal(list.plugins.length, 2);
    assert.equal((await host.request({ action: 'inspect', plugin: '/unscanned.vst3' })).ok, false);
    assert.equal(host.scan(['relative-folder']).ok, false);
    const p = list.plugins[0].path;
    const crashed = await host.request({ action: 'inspect', plugin: p }); assert.equal(crashed.ok, false); assert.match(crashed.error, /exited/); assert.equal(host.busy, false);
    const running = host.request({ action: 'inspect', plugin: p, name: 'hang' }); await new Promise(r => setTimeout(r, 100)); assert.equal(host.busy, true); assert.equal((await host.status()).ok, false); host.stop(); assert.equal((await running).ok, false); assert.equal(host.busy, false); assert.equal((await host.status()).ok, true);
    assert.equal(fs.readdirSync(path.join(temp, 'creative-vst')).filter(p => p.startsWith('job-')).length, 0);
    console.log('VST host: discovery, scoped paths, crash isolation, single-operation locking, stop/retry and temporary cleanup passed.');
  } finally { if (path.dirname(temp) !== os.tmpdir()) throw Error('Unexpected test cleanup path'); fs.rmSync(temp, { recursive: true, force: true }); }
})().catch(e => { console.error(e); process.exitCode = 1; });
