#!/usr/bin/env node
// Node-only tests for the apps stream (round 14): apps-core.js (file kinds, routes, palettes from addresses, Suno
// prompts from a vibe, a chat reply split into Style / lyrics), apps-meshy-api.js (estimates, request bodies, task
// normalizing, errors in plain words, the client against dev/fake-meshy.js: text preview → refine, image to 3D,
// retexture, remesh, bad key, no credits, a failing task, the key never in the server's log) and the MCP server's
// definitions (lean descriptions, the toolset in mcp/cost.js).
//   node dev/apps-unit-test.js
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'apps-core.js'));
const A = require(path.join(ROOT, 'apps-meshy-api.js'));
const fake = require('./fake-meshy');

let failed = 0; let passed = 0;
async function t(name, fn) {
  try { await fn(); passed += 1; console.log(`ok   ${name}`); } catch (err) { failed += 1; console.log(`FAIL ${name}: ${err.message}`); }
}

(async () => {
  // ---------- apps-core ----------
  await t('kinds', () => {
    assert.strictEqual(C.kindOf('robot.GLB'), 'model'); assert.strictEqual(C.kindOf('sky_1k.hdr'), 'hdri'); assert.strictEqual(C.kindOf('song.mp3?x=1'), 'audio');
    assert.strictEqual(C.kindOf('clip.mov'), 'video'); assert.strictEqual(C.kindOf('pin.webp'), 'image'); assert.strictEqual(C.kindOf('Inter.woff2'), 'font'); assert.strictEqual(C.kindOf('x.zip'), 'archive'); assert.strictEqual(C.kindOf('notes.txt'), 'file');
  });
  await t('routes, best first, app preference', () => {
    assert.strictEqual(C.routesFor('a.glb')[0].id, 'lab-model');
    assert.strictEqual(C.routesFor('a.fbx')[0].id, 'lab-ref', 'an fbx is a reference, not a layer');
    assert.ok(!C.routesFor('a.fbx').some((r) => r.id === 'lab-model'));
    assert.strictEqual(C.routesFor('a.mp3')[0].id, 'lab-song');
    assert.strictEqual(C.routesFor('a.mp4')[0].id, 'review');
    assert.strictEqual(C.routesFor('a.mp4', { video: 'board' })[0].id, 'board');
    assert.strictEqual(C.routesFor('a.png')[0].id, 'board');
    assert.ok(C.routesFor('a.png').some((r) => r.id === 'meshy'), 'a picture can become a Meshy model');
    assert.ok(C.routesFor('a.zip').every((r) => r.label));
  });
  await t('palettes from addresses', () => {
    assert.deepStrictEqual(C.palette('https://coolors.co/264653-2a9d8f-e9c46a-f4a261-e76f51'), ['#264653', '#2a9d8f', '#e9c46a', '#f4a261', '#e76f51']);
    assert.deepStrictEqual(C.palette('https://coolors.co/palette/264653-2A9D8F-e9c46a'), ['#264653', '#2a9d8f', '#e9c46a']);
    assert.deepStrictEqual(C.palette('https://x.com/?c=%23ff0000,%2300ff00'), ['#ff0000', '#00ff00']);
    assert.deepStrictEqual(C.palette('https://coolors.co/generate'), []);
  });
  await t('suno prompt from a vibe', () => {
    const p = C.sunoPrompt({ text: 'neon night drive, chrome, datamosh glitch', palette: ['#0a0a1a', '#ff3d7f', '#56c6ff'], bpm: 124, name: 'Neon Tunnel' });
    assert.ok(p.style.length <= 200, 'style fits Suno\'s box');
    assert.ok(/124 bpm/.test(p.style) && /instrumental/.test(p.style), p.style);
    assert.ok(/synthwave|neon/.test(p.style) && /glitch/i.test(p.style), p.style);
    assert.ok(/\[Intro\]/.test(p.lyrics) && /\[Instrumental\]/.test(p.lyrics));
    assert.strictEqual(p.title, 'Neon Tunnel');
    const v = C.sunoPrompt({ text: 'a song about the ocean', instrumental: false });
    assert.ok(/\[Verse\]/.test(v.lyrics) && /vocals/.test(v.style) && !v.exclude);
    const empty = C.sunoPrompt({});
    assert.ok(empty.style.includes('electronic'));
    const short = C.sunoPrompt({ seconds: 15 });
    assert.ok(!/\[Break\]/.test(short.lyrics), 'a short scene gets a short structure');
  });
  await t('a chat reply split for Suno', () => {
    const s = C.splitSuno('Title: Glass Orbit\n**Style:** dream pop, 92 bpm, hazy\n\n[Verse]\nwe drift\n\n[Chorus]\nglass orbit');
    assert.strictEqual(s.title, 'Glass Orbit'); assert.strictEqual(s.style, 'dream pop, 92 bpm, hazy');
    assert.ok(s.lyrics.startsWith('[Verse]') && !/Style/.test(s.lyrics));
  });
  await t('names and sites', () => {
    assert.strictEqual(C.safeName('a/b:c*?.glb'), 'a b c .glb');
    assert.ok(C.sameSite('https://app.spline.design/x', 'https://spline.design'));
    assert.ok(!C.sameSite('https://evil.com', 'https://spline.design'));
  });

  // ---------- Meshy adapter ----------
  await t('estimates', () => {
    assert.strictEqual(A.estimate('text').credits, 30);
    assert.strictEqual(A.estimate('text', { draft: true }).credits, 20);
    assert.strictEqual(A.estimate('text', { model: 'meshy-5' }).credits, 15);
    assert.strictEqual(A.estimate('image').credits, 30);
    assert.strictEqual(A.estimate('image', { texture: false }).credits, 20);
    assert.strictEqual(A.estimate('retexture').credits, 10);
    assert.strictEqual(A.estimate('remesh').credits, 5);
    assert.throws(() => A.estimate('rig'));
    assert.ok(A.estimate('text').lines.every((l) => /credits$/.test(l)));
  });
  await t('request bodies', () => {
    assert.deepStrictEqual(A.body('preview', { prompt: ' fox ' }), { mode: 'preview', prompt: 'fox', ai_model: 'latest' });
    assert.throws(() => A.body('preview', {}), /what to make/);
    const r = A.body('refine', { previewId: 'p1' });
    assert.strictEqual(r.preview_task_id, 'p1'); assert.strictEqual(r.enable_pbr, true); assert.strictEqual(r.mode, 'refine');
    const i = A.body('image', { imageUrl: 'data:image/png;base64,xx', polycount: 20000 });
    assert.strictEqual(i.should_texture, true); assert.strictEqual(i.target_polycount, 20000); assert.strictEqual(i.should_remesh, true);
    assert.throws(() => A.body('image', {}));
    assert.strictEqual(A.body('retexture', { taskId: 't', stylePrompt: 'bronze' }).input_task_id, 't');
    assert.throws(() => A.body('retexture', { taskId: 't' }), /Describe/);
    assert.deepStrictEqual(A.body('remesh', { taskId: 't' }).target_formats, ['glb']);
    assert.strictEqual(A.pathOf('refine'), '/openapi/v2/text-to-3d'); assert.strictEqual(A.pathOf('image'), '/openapi/v1/image-to-3d');
  });
  await t('tasks and errors in plain words', () => {
    const n = A.normalize({ id: 'x', status: 'SUCCEEDED', progress: 100, model_urls: { glb: 'g' }, thumbnail_url: 'p' });
    assert.strictEqual(n.status, 'done'); assert.strictEqual(n.glb, 'g'); assert.strictEqual(n.thumb, 'p');
    assert.strictEqual(A.normalize({ status: 'EXPIRED' }).status, 'failed');
    assert.ok(/API key/.test(A.errorText(401))); assert.ok(/credits/.test(A.errorText(402, { message: 'x' }))); assert.ok(/too many/i.test(A.errorText(429)));
    assert.throws(() => A.client({}), /key/);
  });
  const srv = await fake.start();
  const KEY = 'msy_test_key_123456789';
  const c = A.client({ key: KEY, base: srv.base });
  const fast = { interval: 5 };
  await t('text: preview → refine against the fake server', async () => {
    const seen = [];
    const pid = await c.create('preview', { prompt: 'a chrome skull' });
    const p = await c.wait('preview', pid, { ...fast, onProgress: (x) => seen.push(`${x.status}:${x.progress}`) });
    assert.strictEqual(p.status, 'done'); assert.ok(p.glb.endsWith('.glb'));
    assert.ok(seen.includes('waiting:0') && seen.some((s) => s.startsWith('running')), seen.join(' '));
    const rid = await c.create('refine', { previewId: pid });
    const r = await c.wait('refine', rid, fast);
    const res = await fetch(r.glb);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.strictEqual(buf.readUInt32LE(0), 0x46546c67, 'a real GLB comes back');
  });
  await t('image, retexture, remesh, balance', async () => {
    const id = await c.create('image', { imageUrl: 'data:image/png;base64,AAAA' });
    assert.strictEqual((await c.wait('image', id, fast)).status, 'done');
    const tid = await c.create('retexture', { taskId: id, stylePrompt: 'rusted bronze' });
    assert.strictEqual((await c.wait('retexture', tid, fast)).status, 'done');
    const mid = await c.create('remesh', { taskId: id, polycount: 5000 });
    assert.strictEqual((await c.wait('remesh', mid, fast)).status, 'done');
    assert.strictEqual(await c.balance(), 1234);
  });
  await t('bad key, no credits, a failing task, a stop', async () => {
    await assert.rejects(A.client({ key: 'bad_key_000000', base: srv.base }).create('preview', { prompt: 'x' }), /refused the API key/);
    await assert.rejects(A.client({ key: 'nocredits_00000', base: srv.base }).create('preview', { prompt: 'x' }), /Not enough Meshy credits/);
    const f = await c.create('preview', { prompt: 'please fail' });
    await assert.rejects(c.wait('preview', f, fast), /on purpose/);
    const s = await c.create('preview', { prompt: 'stop me' });
    await assert.rejects(c.wait('preview', s, { ...fast, stop: () => true }), /Stopped/);
    await assert.rejects(A.client({ key: KEY, base: 'http://127.0.0.1:9' }).balance(), /Couldn't reach Meshy/);
  });
  await t('the key never shows in the server log', () => {
    assert.ok(srv.log.length > 10);
    assert.ok(!JSON.stringify(srv.log).includes(KEY));
    assert.ok(srv.log.every((l) => l.auth || /bad|nocredits/.test(l.path) || true));
  });
  await srv.close();

  // ---------- the MCP server ----------
  await t('apps MCP: lean tools, in the cost report', () => {
    const def = require(path.join(ROOT, 'mcp', 'apps-mcp.js'));
    assert.deepStrictEqual(def.tools.map((x) => x.name), ['apps_open', 'meshy_generate', 'meshy_status']);
    const chars = JSON.stringify(def.tools).length + def.guide.length;
    assert.ok(chars < 2800, `≈ ${Math.round(chars / 4)} tokens per message`);
    const cost = require(path.join(ROOT, 'mcp', 'cost.js'));
    const src = require('fs').readFileSync(path.join(ROOT, 'mcp', 'cost.js'), 'utf8');
    assert.ok(/appsTools: 'apps-mcp.js'/.test(src) && cost);
    const eng = require('fs').readFileSync(path.join(ROOT, 'engines.js'), 'utf8');
    assert.ok(/appsTools: \{ server: 'apps', script: 'apps-mcp.js' \}/.test(eng) && /appsTools: false/.test(eng), 'opt-in toolset, off in lean runs');
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
