#!/usr/bin/env node
// Agentic deployment (deploy-core.js + deploymain.js) in plain Node with the fake CLIs in dev/fake-deploy/ (they log
// every call): finding the CLIs and the sign-ins, the static page build of a Lab scene (three.js copied from a local
// copy, addons followed through their imports, references), video / folder builds, the 127.0.0.1 preview server,
// deploys on Vercel / Netlify / Cloudflare Pages / GitHub Pages (a real git push into a bare repository), failures in
// plain words, rollback and remove, and the history model.
//   node dev/deploy-test.js        (three.js from /opt/cdn-cache/three@0.186.1/package or $HEARTH_THREE_DIR)
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const assert = require('assert');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-deploy-'));
const STATE = path.join(tmp, 'fake-state');
process.env.FAKE_DEPLOY_STATE = STATE;
const FAKES = path.join(__dirname, 'fake-deploy');
const ext = process.platform === 'win32' ? '.cmd' : '';
const paths = { vercel: path.join(FAKES, `vercel${ext}`), netlify: path.join(FAKES, `netlify${ext}`), cloudflare: path.join(FAKES, `wrangler${ext}`), github: path.join(FAKES, `gh${ext}`) };
const THREE = process.env.HEARTH_THREE_DIR || '/opt/cdn-cache/three@0.186.1/package';
const C = require('../deploy-core.js');
const M = require('../deploymain.js');
M._test.setDataDir(path.join(tmp, 'data'));
const calls = () => { try { return fs.readFileSync(path.join(STATE, 'calls.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)); } catch { return []; } };
const lastCall = (cli) => calls().filter((c) => c.cli === cli).pop();
const get = (url) => new Promise((resolve, reject) => http.get(url, (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: d })); }).on('error', reject));
const steps = [];
const step = (name, fn) => steps.push([name, fn]);
let sceneBuild = null;

step('core: slugs, addresses, imports, three paths', () => {
  assert.strictEqual(C.slug('My Orb — v2!'), 'my-orb-v2');
  assert.strictEqual(C.slug('é'), 'hearth-e');
  assert.strictEqual(C.slug(''), 'hearth-page');
  assert.ok(C.slug('x'.repeat(80)).length <= 40);
  assert.deepStrictEqual(C.parseUrl(C.provider('vercel'), 'Inspect: https://vercel.com/x\nhttps://orb-abc.vercel.app\nProduction: https://orb.vercel.app [2s]'), { url: 'https://orb.vercel.app' });
  assert.strictEqual(C.parseUrl(C.provider('netlify'), 'noise {"deploy_id":"d1","deploy_url":"https://d1--orb.netlify.app","url":"https://orb.netlify.app","site_id":"s"} more').deployId, 'd1');
  assert.strictEqual(C.parseUrl(C.provider('cloudflare'), 'Take a peek over at https://ab12.orb.pages.dev').url, 'https://ab12.orb.pages.dev');
  assert.strictEqual(C.parseUrl(C.provider('vercel'), 'no address'), null);
  assert.deepStrictEqual(C.importsOf("import * as THREE from 'three';\nimport { EffectComposer } from \"three/addons/postprocessing/EffectComposer.js\";\nexport { X } from './x.js';\nconst m = await import('three/addons/loaders/GLTFLoader.js');\nimport './side.js';").sort(), ['./side.js', './x.js', 'three', 'three/addons/loaders/GLTFLoader.js', 'three/addons/postprocessing/EffectComposer.js']);
  assert.strictEqual(C.threePath('three'), 'build/three.module.js');
  assert.strictEqual(C.threePath('three/addons/a/B.js'), 'examples/jsm/a/B.js');
  assert.strictEqual(C.threePath('three/examples/jsm/a/B.js'), 'examples/jsm/a/B.js');
  assert.strictEqual(C.threePath('lil-gui'), null);
  assert.strictEqual(C.provider('gh-pages').id, 'github');
  assert.strictEqual(C.provider('Cloudflare Pages').id, 'cloudflare');
});

step('core: history (replace, previous, find)', () => {
  let h = [];
  h = C.add(h, { provider: 'vercel', slug: 'orb', name: 'Orb', prod: true, url: 'u1' });
  const first = h[0];
  h[0].at -= 1000;
  h = C.add(h, { provider: 'vercel', slug: 'orb', name: 'Orb', prod: true, url: 'u2' });
  assert.strictEqual(h[1].state, 'replaced');
  assert.strictEqual(h[0].state, 'live');
  assert.strictEqual(C.previous(h, h[0]).id, first.id);
  h = C.add(h, { provider: 'netlify', slug: 'orb', name: 'Orb', prod: true, url: 'n1' });
  assert.strictEqual(h.find((x) => x.provider === 'vercel' && x.state === 'live').url, 'u2', 'another service is another site');
  assert.strictEqual(C.find(h, '2').url, 'u2');
  assert.strictEqual(C.find(h, 'n1').provider, 'netlify');
  assert.strictEqual(C.find(h, 'last').url, 'n1');
  assert.match(C.line(h[0], 0), /^1\. ◆ \*\*Orb\*\* on Netlify · live/);
});

step('finds the CLIs (overrides, PATH) and the sign-ins', async () => {
  const s = await M.status({ check: true, paths });
  for (const p of s.providers) { assert.strictEqual(p.found, true, p.id); assert.strictEqual(p.signedIn, true, `${p.id} signed in`); }
  assert.strictEqual(s.providers.find((p) => p.id === 'netlify').account, 'owner@example.com');
  fs.writeFileSync(path.join(STATE, 'signedout-vercel'), '');
  fs.writeFileSync(path.join(STATE, 'signedout-gh'), '');
  fs.writeFileSync(path.join(STATE, 'signedout-wrangler'), '');
  const s2 = await M.status({ check: true, paths });
  assert.strictEqual(s2.providers.find((p) => p.id === 'vercel').signedIn, false);
  assert.strictEqual(s2.providers.find((p) => p.id === 'github').signedIn, false);
  assert.strictEqual(s2.providers.find((p) => p.id === 'cloudflare').signedIn, false, 'wrangler says it in its text (exit 0)');
  for (const f of ['vercel', 'gh', 'wrangler']) fs.rmSync(path.join(STATE, `signedout-${f}`));
  // not installed: the install line, per OS
  const saved = process.env.PATH; process.env.PATH = path.join(tmp, 'empty');
  M._test.cache.vercel = null;
  const miss = await M.providerStatus('vercel', { paths: {} });
  process.env.PATH = saved;
  if (!miss.found) assert.match(miss.reason, /npm install -g vercel/);
});

step('a Lab scene builds into a self-contained page (three.js + addons + references)', async () => {
  if (!fs.existsSync(path.join(THREE, 'build', 'three.module.js'))) throw new Error(`no local three.js at ${THREE} (set HEARTH_THREE_DIR)`);
  const ref = path.join(tmp, 'tex.png');
  fs.writeFileSync(ref, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const code = "import * as THREE from 'three';\nimport { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';\nconst r = new THREE.WebGLRenderer(); document.body.append(r.domElement);\nconst P = tweak({ speed: [1, 0, 3] });";
  const b = await M.build({ kind: 'scene', name: 'Neon Orb', version: '0.186.1', layers: [{ id: 'main', code, name: 'Layer 1', opacity: 0.8, blend: 'screen' }, { id: 'l2', code: 'console.log(audio.bass)' }], refs: [{ key: 'tex', kind: 'image', path: ref }, { key: 'gone', kind: 'image', path: '/nope.png' }], palette: ['#ff0000'], frame: { w: 1080, h: 1920 } }, { threeDir: THREE });
  sceneBuild = b;
  assert.strictEqual(b.slug, 'neon-orb');
  assert.strictEqual(path.basename(b.dir), 'neon-orb', 'the build folder is named after the site (Vercel names new projects after it)');
  for (const f of ['index.html', 'lab.html', 'three/build/three.module.js', 'three/build/three.core.js', 'three/examples/jsm/postprocessing/EffectComposer.js', 'three/examples/jsm/postprocessing/Pass.js', 'three/examples/jsm/shaders/CopyShader.js', 'three/examples/jsm/controls/OrbitControls.js', 'assets/tex.png', 'hearth-build.json']) assert.ok(fs.existsSync(path.join(b.dir, f)), f);
  const lab = fs.readFileSync(path.join(b.dir, 'lab.html'), 'utf8');
  assert.ok(!lab.includes('cdn.jsdelivr.net/npm/three@'), 'three.js comes from ./three/');
  assert.match(lab, /const base = new URL\('three', location\.href\)\.href;/);
  const html = fs.readFileSync(path.join(b.dir, 'index.html'), 'utf8');
  assert.match(html, /<title>Neon Orb<\/title>/);
  assert.match(html, /src="lab\.html\?mode=sketch&v=0\.186\.1&n=1&fw=1080&fh=1920"/);
  assert.match(html, /"blend":"screen"/);
  assert.match(html, /"file":"assets\/tex\.png"/);
  assert.ok(!html.includes('</script><'), 'scene code is escaped inside the page');
  assert.ok(b.notes.some((n) => /gone/.test(n)) && b.notes.some((n) => /without the Lab's song/.test(n)), b.notes.join(' | '));
  await assert.rejects(M.build({ kind: 'scene', name: 'empty', layers: [] }, { threeDir: THREE }), /no code/);
});

step('the preview server (127.0.0.1, types, no escaping the folder)', async () => {
  const pv = await M.preview(sceneBuild.dir);
  assert.match(pv.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  const index = await get(pv.url);
  assert.strictEqual(index.status, 200); assert.match(index.type, /text\/html/);
  const js = await get(`${pv.url}three/build/three.module.js`);
  assert.strictEqual(js.status, 200); assert.match(js.type, /javascript/);
  assert.strictEqual((await get(`${pv.url}..%2f..%2fetc%2fpasswd`)).status, 403);
  assert.strictEqual((await get(`${pv.url}nope.js`)).status, 404);
  assert.strictEqual((await M.preview(sceneBuild.dir)).url, pv.url, 'one server per build');
});

step('video and folder builds', async () => {
  const vid = path.join(tmp, 'render final.mp4');
  fs.writeFileSync(vid, 'not really a video');
  const v = await M.build({ kind: 'video', name: 'Render final', path: vid });
  assert.ok(fs.existsSync(path.join(v.dir, 'media', 'video.mp4')));
  assert.match(fs.readFileSync(path.join(v.dir, 'index.html'), 'utf8'), /<video src="media\/video\.mp4"[^>]* autoplay muted loop playsinline controls/);
  const site = path.join(tmp, 'site');
  fs.mkdirSync(site); fs.writeFileSync(path.join(site, 'package.json'), '{}');
  const f = await M.build({ kind: 'folder', path: site });
  assert.strictEqual(f.dir, site); assert.strictEqual(f.asIs, true);
  assert.ok(f.notes.some((n) => /project/.test(n)));
  await assert.rejects(M.build({ kind: 'video', path: '/no/such.mp4' }), /not found/);
});

step('Vercel: deploy, the address, rollback, remove', async () => {
  const events = [];
  const r = await M.deploy({ provider: 'vercel', dir: sceneBuild.dir, slug: 'neon-orb', prod: true }, (e) => events.push(e), { paths });
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.url, 'https://neon-orb.vercel.app');
  assert.deepStrictEqual(lastCall('vercel').args, ['deploy', sceneBuild.dir, '--yes', '--name', 'neon-orb', '--prod']);
  assert.ok(events.some((e) => e.type === 'progress') && events.some((e) => e.type === 'log'));
  const rb = await M.rollback({ provider: 'vercel' }, { deployId: 'https://neon-orb-old.vercel.app' }, () => {}, { paths });
  assert.strictEqual(rb.how, 'switched');
  assert.deepStrictEqual(lastCall('vercel').args, ['rollback', 'https://neon-orb-old.vercel.app', '--yes']);
  assert.strictEqual((await M.remove({ provider: 'vercel', slug: 'neon-orb', deployId: 'https://x.vercel.app' }, 'deploy', { paths })).whole, false);
  assert.deepStrictEqual(lastCall('vercel').args, ['remove', 'https://x.vercel.app', '--yes']);
  await M.remove({ provider: 'vercel', slug: 'neon-orb' }, 'site', { paths });
  assert.deepStrictEqual(lastCall('vercel').args, ['remove', 'neon-orb', '--yes']);
});

step('signed out and failures: plain words', async () => {
  fs.writeFileSync(path.join(STATE, 'signedout-vercel'), '');
  const r = await M.deploy({ provider: 'vercel', dir: sceneBuild.dir, slug: 'neon-orb', prod: true }, () => {}, { paths });
  assert.strictEqual(r.ok, false); assert.match(r.error, /not signed in to Vercel: \/deploy login vercel/);
  fs.rmSync(path.join(STATE, 'signedout-vercel'));
  fs.writeFileSync(path.join(STATE, 'fail-wrangler'), '');
  const f = await M.deploy({ provider: 'cloudflare', dir: sceneBuild.dir, slug: 'neon-orb', prod: true }, () => {}, { paths });
  assert.strictEqual(f.ok, false); assert.match(f.error, /Cloudflare Pages: .*Deployment failed/);
  fs.rmSync(path.join(STATE, 'fail-wrangler'));
  const miss = await M.deploy({ provider: 'vercel', dir: sceneBuild.dir, slug: 'x' }, () => {}, { paths: { vercel: '/no/vercel' } });
  if (!miss.ok && miss.install) assert.match(miss.error, /npm install -g vercel/);
  assert.match((await M.deploy({ provider: 'nope', dir: sceneBuild.dir }, () => {}, { paths })).error, /Unknown service/);
});

step('Netlify: makes the site once, deploys, rolls back through its API', async () => {
  const r = await M.deploy({ provider: 'netlify', dir: sceneBuild.dir, slug: 'neon-orb', prod: true }, () => {}, { paths });
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.site, 'site-neon-orb'); assert.strictEqual(r.url, 'https://neon-orb.netlify.app'); assert.match(r.deployId, /^dep/);
  const cs = calls().filter((c) => c.cli === 'netlify');
  assert.deepStrictEqual(cs[cs.length - 2].args, ['sites:create', '--name', 'neon-orb', '--json']);
  assert.deepStrictEqual(cs[cs.length - 1].args, ['deploy', '--dir', sceneBuild.dir, '--json', '--site', 'site-neon-orb', '--prod']);
  // the name is taken now: a second "first" deploy picks another name
  const r2 = await M.deploy({ provider: 'netlify', dir: sceneBuild.dir, slug: 'neon-orb', prod: false }, () => {}, { paths });
  assert.match(r2.site, /^site-neon-orb-[a-z0-9]{4}$/);
  assert.match(r2.url, /^https:\/\/dep.*--neon-orb-.*\.netlify\.app$/, 'a draft gets its own address');
  // with the site known: no create
  const before = calls().length;
  await M.deploy({ provider: 'netlify', dir: sceneBuild.dir, slug: 'neon-orb', prod: true, site: 'site-neon-orb' }, () => {}, { paths });
  assert.strictEqual(calls().slice(before).filter((c) => c.args[0] === 'sites:create').length, 0);
  const rb = await M.rollback({ provider: 'netlify' }, { site: 'site-neon-orb', deployId: 'dep1', url: 'https://neon-orb.netlify.app' }, () => {}, { paths });
  assert.strictEqual(rb.ok, true);
  assert.deepStrictEqual(lastCall('netlify').args, ['api', 'restoreSiteDeploy', '--data', '{"site_id":"site-neon-orb","deploy_id":"dep1"}']);
  await M.remove({ provider: 'netlify', site: 'site-neon-orb' }, 'deploy', { paths });
  assert.deepStrictEqual(lastCall('netlify').args, ['sites:delete', 'site-neon-orb', '--force']);
});

step('Cloudflare Pages: project (once), deploy, rollback = the earlier build again', async () => {
  const r = await M.deploy({ provider: 'cloudflare', dir: sceneBuild.dir, slug: 'neon-orb', prod: true }, () => {}, { paths });
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.url, 'https://neon-orb.pages.dev'); assert.match(r.deployUrl, /^https:\/\/[a-z0-9]+\.neon-orb\.pages\.dev$/);
  assert.deepStrictEqual(lastCall('wrangler').args, ['pages', 'deploy', sceneBuild.dir, '--project-name', 'neon-orb', '--branch', 'main', '--commit-dirty=true']);
  const again = await M.deploy({ provider: 'cloudflare', dir: sceneBuild.dir, slug: 'neon-orb', prod: true }, () => {}, { paths });
  assert.strictEqual(again.ok, true, 'an existing project is fine');
  const rb = await M.rollback({ provider: 'cloudflare', slug: 'neon-orb' }, { provider: 'cloudflare', slug: 'neon-orb', build: sceneBuild.dir }, () => {}, { paths });
  assert.strictEqual(rb.how, 'republished');
  assert.match((await M.rollback({ provider: 'cloudflare' }, { build: '/gone' }, () => {}, { paths })).error, /earlier build is gone/);
  await M.remove({ provider: 'cloudflare', slug: 'neon-orb' }, 'deploy', { paths });
  assert.deepStrictEqual(lastCall('wrangler').args, ['pages', 'project', 'delete', 'neon-orb', '--yes']);
});

step('GitHub Pages: repo, a real git push of the build to gh-pages, Pages on', async () => {
  const git = M.findCli('git');
  if (!git) { console.log('  (no git here: skipped)'); return; }
  const r = await M.deploy({ provider: 'github', dir: sceneBuild.dir, slug: 'neon-orb', prod: true }, () => {}, { paths });
  assert.strictEqual(r.ok, true, r.error);
  assert.strictEqual(r.url, 'https://owner.github.io/neon-orb/'); assert.strictEqual(r.owner, 'owner');
  const bare = path.join(STATE, 'remotes', 'neon-orb.git');
  const { execFileSync } = require('child_process');
  const files = execFileSync('git', ['--git-dir', bare, 'ls-tree', '-r', '--name-only', 'gh-pages'], { encoding: 'utf8' }).split('\n');
  for (const f of ['index.html', 'lab.html', '.nojekyll', 'three/build/three.module.js', 'assets/tex.png']) assert.ok(files.includes(f), f);
  assert.ok(calls().some((c) => c.cli === 'gh' && c.args.join(' ') === 'api -X POST repos/owner/neon-orb/pages -f source[branch]=gh-pages -f source[path]=/'));
  assert.ok(!fs.existsSync(path.join(sceneBuild.dir, '.git')), 'the build folder stays as it is');
  const again = await M.deploy({ provider: 'github', dir: sceneBuild.dir, slug: 'neon-orb', prod: true, owner: 'owner' }, () => {}, { paths });
  assert.strictEqual(again.ok, true, `an existing repository is fine: ${again.error}`);
  await M.remove({ provider: 'github', slug: 'neon-orb', owner: 'owner' }, 'site', { paths });
  assert.deepStrictEqual(lastCall('gh').args, ['repo', 'delete', 'owner/neon-orb', '--yes']);
});

step('sign in opens the CLI\'s own flow (never a password field in Hearth)', () => {
  const r = M.login('netlify', { paths });
  assert.strictEqual(r.started, true); assert.strictEqual(r.command, 'netlify login');
  assert.deepStrictEqual(C.provider('github').login, ['auth', 'login', '--web', '--git-protocol', 'https']);
  assert.throws(() => M.login('nope'), /Unknown service/);
});

(async () => {
  let failed = 0;
  for (const [name, fn] of steps) {
    try { await fn(); console.log(`✓ ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}\n  ${String(err.stack).split('\n').slice(0, 6).join('\n  ')}`); }
  }
  M.stopPreviews();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `${failed} of ${steps.length} failed` : `deploy: all ${steps.length} passed`);
  process.exit(failed ? 1 : 0);
})();
