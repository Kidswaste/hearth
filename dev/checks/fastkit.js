// (Nov 10, fastkit) The fast kit (docs/upgrades/fastkit.md): the ready v2 layers of tools/three-data.js (V2_LAYERS with
// fast: true: spectrum, particle swarm, glow lights, camera tracking, footage backdrop), on the real GPU. Its own temp
// data; never an owner's scene. Each piece alone in a v2 scene at 1920×1080, Max fps, Force high:
//   · mounted on the scene's ONE WebGPURenderer (no WebGL context), frames drawn, no error
//   · one draw call of its own (the frame's copy to the screen is the other one counted), the same when its count slider grows (bars 96 → 512, lights 60 → 2000, particles 150k → 600k,
//     trail 16 → 32): one draw however many pieces
//   · its frame time from __labG2.bench (frames back to back until the graphics card is done), before and after
//   · written the cheap way: nothing made inside onFrame (read from its code), 6–12 sliders, a one-line description
// then the footage backdrop and the tracking layer with a camera picture handed to the page (the camera's texture on
// the WebGPU renderer), the five together (one draw each), and where they are offered: the ＋ Layer list and the
// effects picker of a v2 scene (not of an old one), three_add_layer { template: 'v2-…' } (refused in an old scene).
//   SMOKE_GPU_FLAGS="--ignore-gpu-blocklist" ELECTRON="$PWD/electron/electron.exe" node dev/smoke.js --check-timeout 420000 --script dev/checks/fastkit.js
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const D = () => ThreeLab.director;
const pv = async (code) => { let r = null; for (let i = 0; i < 6; i += 1) { r = await D().evalInSketch(code); if (r?.ok) return r.value; await wait(300); } return { error: r?.error || 'no answer' }; };
const pj = async (code) => { const v = await pv(`return JSON.stringify(${code})`); return typeof v === 'string' ? JSON.parse(v) : v; };
const G2 = () => pj('window.__labG2 ? window.__labG2.state() : null');
const med = (a) => { const s = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const bench = async () => { await pj('await window.__labG2.bench(60)'); const r = []; let px = null; for (let k = 0; k < 5; k += 1) { const b = await pj('await window.__labG2.bench(120)'); r.push(b?.msPerFrame); px = b?.px || px; } return { ms: med(r), all: r, px }; };
const errors = () => (D().report?.()?.errors || []).map((e) => String(e.message || e).slice(0, 160));
const name1 = (L) => L.name.replace(/ \(v2\)$/, '');

// the pieces: the count slider, what it goes up to, how the frame then reads (2 triangles a piece + 1: the copy to the screen)
const GROW = {
  'v2-spectrum': ['How many', 512, (s) => s.triangles === 1025],
  'v2-swarm': ['Particles (thousands)', 600, (s) => s.triangles === 1200001],
  'v2-glow': ['How many', 2000, (s) => s.triangles === 4001],
  'v2-tracking': ['Trail length', 32, () => true],
  'v2-footage': null,
};
async function open(name, list) {
  const layers = list.map((L, i) => ({ id: i ? `l${i + 1}` : 'main', name: name1(L), code: L.code, slot: i }));
  const before = (await G2())?.frames || 0;
  const s = ThreeLab.scenes.create({ name, code: layers[0].code, layers, open: true, format: 'gpu' });
  await until(() => ThreeLab.workspace.state().ready, 60000);
  const st = await until(async () => { const g = await G2(); return g && g.layers.length === list.length && g.frames > before + 30 && g.layers.every((x) => x.t > 0.2) ? g : null; }, 120000, 400);
  return { scene: s, state: st };
}

try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 60000);
  const c = await ThreeLab.cmd();
  c.fps('0'); ThreeLab.quality?.set('high', { quiet: true });

  // ---------- the kit as written ----------
  const kit = ThreeData.V2_LAYERS.filter((L) => L.fast);
  step('the kit: five fast v2 layers', kit.length === 5 && Object.keys(GROW).every((id) => kit.some((L) => L.id === id)), kit.map((L) => L.id));
  for (const L of kit) {
    const sliders = (L.code.match(/\blabel:/g) || []).length; const groups = new Set([...L.code.matchAll(/group: '([^']+)'/g)].map((m) => m[1]));
    const at = L.code.indexOf('onFrame(('); const body = L.code.slice(L.code.indexOf('=> {', at) + 4, L.code.indexOf('\n  });', at));
    const made = body.match(/\bnew\s+[A-Z]|\[\s*\]|=\s*\{|\.map\(|\.slice\(|\.filter\(|Array\.from|=>|['"]\s*\+|\+\s*['"]/g);
    step(`${L.id}: ${sliders} sliders in ${groups.size} groups, a one-line description, nothing made inside onFrame`, sliders >= 6 && sliders <= 12 && groups.size >= 2 && L.desc && !/\n/.test(L.desc) && at > 0 && body.length > 80 && !made && ThreeData.isV2Code(L.code) && !/EffectComposer|CanvasTexture|requestAnimationFrame/.test(L.code), made || undefined);
  }

  // ---------- each piece alone, at 1080p ----------
  c.customSize(1920, 1080); c.size('custom'); await wait(1200);
  for (const L of kit) {
    const o = await open(`fastkit ${L.id}`, [L]); const s0 = o.state;
    step(`${L.id}: on the one renderer, drawing`, Boolean(s0) && s0.backend === 'webgpu' && s0.contexts === 0, s0 ? { frames: s0.frames, compileMs: s0.layers[0].compileMs, path: s0.path, contexts: s0.contexts } : await G2());
    if (!s0) continue;
    await wait(1500);
    const e0 = errors(); const s1 = await G2();
    step(`${L.id}: no error, no draw refused by the graphics card`, !e0.length && !s1.err && s1.gpuErrors === 0, e0.length ? e0 : s1.err || s1.gpuError || undefined);
    const lit = await pj('window.__labG2.lit()');
    step(`${L.id}: a picture (not black)`, lit && lit.lit > 8, lit);
    if (window.FASTKIT_SHOTS) await smoke({ shot: `${window.FASTKIT_SHOTS}/${L.id}.png` }); // (--eval "window.FASTKIT_SHOTS='<folder>'": a picture of each piece)
    const b0 = await bench();
    const m = { calls: s1.calls, triangles: s1.triangles, ms: b0.ms, px: b0.px, compileMs: s0.layers[0].compileMs };
    step(`${L.id}: one draw of its own (+ the frame's copy to the screen)`, s1.calls === 2, { calls: s1.calls, triangles: s1.triangles });
    const g = GROW[L.id];
    if (g) {
      ThreeLab.search.selectLayer('main'); await wait(300);
      try { c.setSlider(g[0], g[1]); } catch (err) { m.sliderErr = String(err); }
      const s2 = await until(async () => { const x = await G2(); return x && x.layers.length === 1 && x.layers[0].t > 0.2 && g[2](x) ? x : null; }, 30000, 300);
      await wait(800);
      const s3 = await G2(); const b1 = await bench(); const e1 = errors();
      Object.assign(m, { grown: `${g[0]} → ${g[1]}`, callsGrown: s3?.calls, trianglesGrown: s3?.triangles, msGrown: b1.ms });
      step(`${L.id}: "${g[0]}" → ${g[1]}: still one draw of its own, no error`, Boolean(s2) && s3.calls === 2 && !e1.length && !s3.err, { calls: s3?.calls, triangles: s3?.triangles, err: e1[0] || s3?.err || m.sliderErr });
    }
    out.measure[L.id] = m;
  }
  step('measured at 1920 × 1080', Object.values(out.measure).every((m) => m.px && m.px[0] === 1920 && m.px[1] === 1080), Object.values(out.measure)[0]?.px);

  // ---------- a camera picture: the footage backdrop shows it, the tracking layer follows ----------
  const foot = kit.find((L) => L.id === 'v2-footage'); const trk = kit.find((L) => L.id === 'v2-tracking');
  await open('fastkit camera', [foot, trk]);
  const sent = await pv(`const cv = new OffscreenCanvas(64, 36); const g = cv.getContext('2d'); g.fillStyle = '#e02020'; g.fillRect(0, 0, 64, 36);
    const bmp = await createImageBitmap(cv); window.postMessage({ target: 'three-sandbox', type: 'motionin-frame', bmp, mirror: false }, '*'); await new Promise((r) => setTimeout(r, 300)); return webcam.on;`);
  ThreeLab.search.selectLayer('main'); await wait(300);
  try { c.setSlider('Show', 'camera'); c.setSlider('Darker edges', 0); } catch (err) { out.cameraSliderErr = String(err); }
  const red = await until(async () => { const p = await pj('window.__labG2.pixel(0.2, 0.2)'); return p && p[0] > 150 && p[1] < 90 && p[2] < 90 ? p : null; }, 8000, 300);
  step('footage backdrop: the camera\'s picture fills the frame (its texture on the WebGPU renderer)', sent === true && Boolean(red), { on: sent, pixel: red || await pj('window.__labG2.pixel(0.2, 0.2)'), err: out.cameraSliderErr });
  ThreeLab.search.selectLayer('l2'); await wait(300);
  try { c.setSlider('Follow', 'face'); c.setSlider('Marker size', 1.2); } catch (err) { out.trackSliderErr = String(err); }
  // (no tracker runs here: a face rests in the middle of the frame, 0.5 / 0.5: its marker is there, over the red picture)
  const mid = await until(async () => { const p = await pj('window.__labG2.pixel(0.5, 0.5)'); return p && p[1] > 120 && p[2] > 120 ? p : null; }, 8000, 300);
  const eC = errors();
  step('tracking: with the camera on, the marker sits where the tracker says (a face: the middle)', Boolean(mid) && !eC.length, { pixel: mid || await pj('window.__labG2.pixel(0.5, 0.5)'), err: eC[0] || out.trackSliderErr });
  await pv("window.postMessage({ target: 'three-sandbox', type: 'motionin-off' }, '*'); return true;");

  // ---------- the five together + where they are offered ----------
  const order = ['v2-footage', 'v2-swarm', 'v2-glow', 'v2-spectrum'].map((id) => kit.find((L) => L.id === id));
  const all = await open('fastkit all', order);
  const added = await D().addLayer({ template: 'v2-tracking' }, 1).catch((err) => ({ error: String(err.message || err) }));
  const s5 = await until(async () => { const g = await G2(); return g && g.layers.length === 5 && g.layers.every((x) => x.t > 0.2) ? g : null; }, 60000, 400);
  step('three_add_layer { template: "v2-tracking" } adds the fast layer to a v2 scene', added?.added === 'Camera tracking' && Boolean(s5), added?.error || added?.added);
  await wait(1500);
  if (window.FASTKIT_SHOTS) await smoke({ shot: `${window.FASTKIT_SHOTS}/all.png` });
  const sA = await G2(); const bA = await bench(); const eA = errors();
  out.measure.all = { layers: sA?.layers.length, calls: sA?.calls, triangles: sA?.triangles, ms: bA.ms, px: bA.px, path: sA?.path };
  step('the five together: one draw each (+ the frame\'s own passes), no error, no WebGL context', Boolean(all.state) && sA && sA.calls <= 7 && sA.contexts === 0 && !eA.length && !sA.err && sA.gpuErrors === 0, { gpuError: sA?.gpuError, calls: sA?.calls, path: sA?.path, merges: sA?.merges, err: eA[0] || sA?.err });
  // scene after scene with sprites / simulations (three.js shares ONE geometry between all sprites: letting go of a scene must not take it from the next)
  for (const id of ['v2-music', 'v2-fast', 'v2-music']) { const t = ThreeData.V2_TEMPLATES.find((x) => x.id === id); await open(`fastkit ${id}`, t.layers.map((k) => ThreeData.v2Layer(k))); await wait(1200); }
  const sT = await G2(); const litT = await pj('window.__labG2.lit()');
  step('switching between the v2 templates (sprites, a simulation): every draw accepted, the picture there', sT && sT.gpuErrors === 0 && sT.layers.length === 3 && litT.lit > 200, { gpuErrors: sT?.gpuErrors, gpuError: sT?.gpuError, lit: litT?.lit });
  await open('fastkit all again', order);
  const fx2 = ThreeFX.items('layer').filter((x) => x.cat === 'Fast (v2)').map((x) => x.id);
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '＋ Layer' && b.offsetParent);
  btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true })); await wait(200);
  const menu = document.querySelector('.ly-addmenu'); const heads = menu ? [...menu.querySelectorAll('.menu-head')].map((x) => x.textContent) : null; const rows = menu ? [...menu.querySelectorAll('.menu-item b')].map((x) => x.textContent) : [];
  menu?.remove();
  step('a v2 scene: the ＋ Layer list and the effects picker lead with the fast layers', fx2.length === ThreeData.V2_LAYERS.length && kit.every((L) => fx2.includes(L.id)) && heads && /Fast layers/.test(heads[0]) && kit.every((L) => rows.includes(name1(L))), { picker: fx2.length, heads });
  // an old-format scene: not offered, and refused by id
  ThreeLab.scenes.create({ name: 'fastkit old', code: ThreeData.TEMPLATES[0].code, open: true });
  await until(() => ThreeLab.workspace.state().ready, 60000); await wait(800);
  const fx1 = ThreeFX.items('layer').filter((x) => x.cat === 'Fast (v2)').length;
  const no = await D().addLayer({ template: 'v2-spectrum' }, 1).then(() => 'added', (err) => String(err.message || err));
  step('an old-format scene: the fast layers are not offered, and adding one by id is refused with the reason', fx1 === 0 && /v2 scene only/.test(no), { picker: fx1, said: no.slice(0, 120) });

  out.summary = [...kit.map((L) => { const m = out.measure[L.id] || {}; return `${L.id}: ${m.ms} ms a frame, ${m.calls} draw, ${m.triangles} triangles${m.grown ? ` · ${m.grown}: ${m.msGrown} ms, ${m.callsGrown} draw, ${m.trianglesGrown} triangles` : ''}`; }), `all five: ${out.measure.all.ms} ms a frame, ${out.measure.all.calls} draws (${out.measure.all.path})`];
} catch (err) { out.error = String(err?.stack || err); }
return JSON.stringify(out, null, 1);
