// (round 179, v2filter179) EVERY old filter type run as a v2 filter layer over a v2 scene, one after the other: does
// its translated shader mount, does the graphics card accept it, does the picture change. A survey more than a check:
// the list of types that do not work is its result (out.bad); it fails only when fewer than MIN types work.
// Long (≈ 4 min): node dev/smoke.js --check-timeout 900000 --script dev/surveys/v2filter179-all.js
// with SMOKE_GPU_FLAGS="--ignore-gpu-blocklist".
const MIN = 90;
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const D = () => ThreeLab.director;
const pv = async (code) => { let r = null; for (let i = 0; i < 6; i += 1) { r = await D().evalInSketch(code); if (r?.ok) return r.value; await wait(300); } return { error: r?.error || 'no answer' }; };
const pj = async (code) => { const v = await pv(`return JSON.stringify(${code})`); return typeof v === 'string' ? JSON.parse(v) : v; };
try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.scenes, 60000);
  await ThreeLab.cmd();
  if (window.Lazy) { try { await Lazy.load('fx'); } catch { /* the base filters only */ } }
  const S = ThreeLab.scenes; const d = D();
  // a picture that never moves (so a difference is the filter's): a colour ramp with stripes and a bright disc
  const still = "export default ({ tsl, scene }) => {\n  const { screenUV, vec3, step, fract, length, smoothstep } = tsl;\n  const disc = smoothstep(0.22, 0.2, length(screenUV.sub(0.5)));\n  scene.backgroundNode = vec3(screenUV.x, screenUV.y, 0.4).mul(step(0.5, fract(screenUV.x.mul(8))).mul(0.5).add(0.5)).add(disc.mul(0.6));\n};\n";
  const Ls = [{ id: 'main', name: 'Still picture', code: still, slot: 0 }];
  const sc = S.create({ name: 'Filters v2', code: Ls[0].code, layers: Ls, format: 'gpu', open: true });
  await until(() => S.currentId() === sc.id, 20000);
  await wait(2500);
  const types = await pj('window.__labG2.fx.types()');
  const shot = async () => String(await pj('window.__labGpu.probe(12)')).split(',').map(Number);
  const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 1) s += Math.abs(a[i] - (b[i] ?? 0)); return s / Math.max(1, a.length); };
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const base = await shot();
  // what the page's shader builder says while a type is made (three.js reports a broken node graph on the console)
  await pv("if (!window.__fxErrs) { window.__fxErrs = []; const e0 = console.error; console.error = (...a) => { try { window.__fxErrs.push(a.map(String).join(' ').slice(0, 200)); } catch (e) { /* its own */ } return e0.apply(console, a); }; } return 1;");
  const codeOf = (type) => { const t = ThreeLayers.FILTERS.find((x) => (x.type || x.id) === type); return t ? ThreeLayers.v2Filter(t.code) : `export default async ({ tweak, filter }) => {\n  const P = tweak({});\n  await filter('${type}', P);\n};\n`; };
  await d.addLayer({ name: 'FX', code: codeOf('invert') }, 2.5);
  const fxL = S.layersOf(S.get(sc.id)).at(-1);
  step('a filter layer in a v2 scene is v2 code', ThreeData.isV2Code(fxL.code) && ThreeLayers.isFilter(fxL.code));
  const inv = await until(async () => { const p = await shot(); return diff(p, base) > 20 ? p : null; }, 10000, 300);
  const st0 = await pj('window.__labG2.state()');
  step('"invert" over the scene changes the picture, on the one renderer (no WebGL canvas)', Boolean(inv) && st0?.contexts === 0, { changed: Boolean(inv), contexts: st0?.contexts, path: st0?.path });
  // the picture through a filter that changes nothing (the path itself: a merge, two colour conversions)
  await d.updateLayer(fxL.id, { code: "export default ({ scene, below }) => { scene.backgroundNode = below().rgb; };" }, 1.5);
  await wait(600);
  const thru = await shot();
  step('below(): a hand-written layer that passes the picture through leaves it as it was', diff(thru, base) < 2, { diff: Math.round(diff(thru, base) * 100) / 100, mean: [Math.round(mean(base)), Math.round(mean(thru))] });
  const good = []; const same = []; const bad = []; const dark = [];
  let errs0 = st0?.gpuErrors || 0;
  for (const type of types) {
    let why = null;
    await pv('window.__fxErrs.length = 0; return 1;');
    try {
      const r = await d.updateLayer(fxL.id, { code: codeOf(type) }, 1.2);
      const es = (r?.errors || []).map((e) => e.message || String(e));
      if (es.length) why = es[0];
    } catch (e) { why = e.message; }
    // (a layer joins the frame once its shader is translated and its pipeline made: until then the picture is the old one)
    const up = why ? null : await until(async () => { const s = await pj('window.__labG2.state()'); return s?.layers?.length === 2 ? s : null; }, 9000, 150);
    if (!why && !up) why = 'never joined the frame (9 s)';
    await wait(250);
    const st = await pj('window.__labG2.state()');
    if (!why && (st?.gpuErrors || 0) > errs0) why = `the graphics card refused it (${String(st.gpuError || '').slice(0, 120)})`;
    errs0 = st?.gpuErrors || errs0;
    if (!why) { const c = await pj('window.__labProblems && window.__labProblems.list ? window.__labProblems.list().filter((p) => p.layer).map((p) => p.message).slice(-1) : []'); if (Array.isArray(c) && c.length && !bad.some((b) => b.includes(c[0]))) why = c[0]; }
    if (!why) { const ce = await pj('window.__fxErrs'); if (Array.isArray(ce) && ce.length) why = `shader builder: ${ce[0]}`; }
    if (why) { bad.push(`${type}: ${String(why).slice(0, 160)}`); continue; }
    const p = await shot();
    if (mean(p) < 1.5 && mean(base) > 8) { dark.push(type); continue; }
    (diff(p, thru) > 1.5 ? good : same).push(type);
  }
  out.good = good.length; out.same = same; out.bad = bad; out.dark = dark;
  step(`of ${types.length} filter types: ${good.length} change the picture, ${same.length} run and leave it as it was (their defaults, or no music), ${dark.length} come out black, ${bad.length} do not work`, good.length + same.length >= MIN, { same, dark, bad });
  out.ok = !out.problems;
} catch (e) { out.error = String(e?.stack || e); }
return out;
