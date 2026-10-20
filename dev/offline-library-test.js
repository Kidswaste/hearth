const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { create, valid } = require('../offline-library');
const { check } = require('../offline-project');
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-offline-test-'));
  let requests = 0, online = true;
  const modules = {
    'build/three.module.js': "export * from './three.core.js';",
    'build/three.core.js': 'export const test = 1;',
    'examples/jsm/controls/OrbitControls.js': "import * as THREE from 'three'; export class OrbitControls {}",
    'examples/jsm/utils/Test.js': "export * from '../math/TestMath.js';",
    'examples/jsm/math/TestMath.js': 'export const value = 4;',
  };
  const lib = create({ dataDir: root, fetcher: async url => {
    requests++;
    if (!online) throw new Error('fetch failed');
    const rel = url.split('/0.186.1/')[1] || url.split('three@0.186.1/')[1];
    return new Response(modules[rel] || 'not found', { status: modules[rel] ? 200 : 404 });
  } });
  try {
    for (const rel of ['../secret.js', 'build/../../secret.js', 'build/%2e%2e/a.js', 'build/a\\b.js', '/build/a.js']) assert.equal(valid('0.186.1', rel), false);
    assert.equal(valid('../data', 'build/three.module.js'), false);
    assert.equal((await lib.prepare('0.186.1', [], false)).ready, false);
    assert.equal(requests, 0, 'inspection never starts a download');
    const code = "import { value } from 'three/addons/utils/Test.js'";
    const ready = await lib.prepare('0.186.1', [code], true);
    assert.equal(ready.ready, true); assert.equal(ready.files, 5);
    const before = requests;
    online = false;
    const fresh = create({ dataDir: root, fetcher: async () => { throw new Error('must stay offline'); } });
    assert.equal((await fresh.prepare('0.186.1', [code], true)).ready, true, 'disk survives a new instance');
    assert.equal(requests, before);
    const response = await fresh.response({ url: 'hearth-three://library/0.186.1/build/three.module.js', method: 'GET' });
    assert.equal(response.status, 200); assert.match(await response.text(), /three.core/);
    assert.equal((await fresh.response({ url: 'hearth-three://other/0.186.1/build/three.module.js', method: 'GET' })).status, 400);
    assert.equal((await fresh.response({ url: 'hearth-three://library/0.186.1/build/three.module.js', method: 'POST' })).status, 400);
    const bad = create({ dataDir: root, fetcher: async () => new Response('<html>error</html>') });
    await assert.rejects(bad.read('0.170.0', 'build/three.module.js'), /Invalid/);
    assert.equal(fs.existsSync(bad.fileOf('0.170.0', 'build/three.module.js')), false, 'failed downloads never become cached');
    const missing = await lib.prepare('0.186.1', ["import 'three/addons/absent.js'"], true);
    assert.equal(missing.ready, false);
    fs.mkdirSync(path.join(root, 'kv'));
    fs.writeFileSync(path.join(root, 'kv/projects.json'), JSON.stringify({ list: [{ id: 'trip', name: 'Trip', items: [{ type: 'scene', ref: 'not-here' }, { type: 'chat', ref: 'not-here' }] }] }));
    const report = await check({ dataDir: root, projectId: 'trip', library: fresh });
    assert.equal(report.ready, false); assert.deepEqual(report.missingScenes, ['not-here']); assert.equal(report.chats[0].local, false);
    assert.ok(require('../deploymain').labPage().includes("const base = new URL('three', location.href).href"), 'exports still use their own local library');
    console.log('PASS: recursive caching, restart/offline, failures, path boundaries, project gaps, standalone export');
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('hearth-offline-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
