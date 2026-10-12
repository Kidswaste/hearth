// ◐ Grade (round 24 "grade"): the cinematic grade's shader, LUTs, presets, panel, scopes, and a sequence clip's grade
// in the preview and in a render. Pixel math through window.__grade.run (the cgrade shader on a row of known colors,
// off screen): each control moves the pixels the way it should; a .cube made here (an inverting 3D LUT, a 1D gamma
// curve) gives the known results; the grade exported as a .cube and read back gives the grade's own pixels; then the
// Lab (◐ Grade + ◐ Film & lens = one pass, off = the picture as it was), the panel and its scopes, and the standard
// test sequence (/tmp/labframes-media footage) with a noir grade on the red clip, in the preview and in an export.
//   node dev/smoke.js --check-timeout 400000 --script dev/checks/grade.js --shot /tmp/grade.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
await SQL.lab();
const d = ThreeLab.director;
const sbx = async (code) => { let r; for (let i = 0; i < 4; i++) { r = await d.evalInSketch(code); if (r?.ok) return r.value; await wait(600); } return { error: r?.error }; };
const G = GradeCore;
step('loaded with the Lab: GradeCore, LabGrade, /grade, the two filters in the picker list', typeof LabGrade !== 'undefined' && Boolean(Commands.get('grade')) && ThreeLayers.FILTERS.some((t) => t.id === 'cinegrade') && ThreeLayers.FILTERS.some((t) => t.id === 'cinelens'));
await d.newSketch('grade probe', `const c = document.createElement('canvas'); c.width = 320; c.height = 180; c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 320, 0); gr.addColorStop(0, '#000'); gr.addColorStop(1, '#fff'); g.fillStyle = gr; g.fillRect(0, 0, 320, 90);
g.fillStyle = '#d04020'; g.fillRect(0, 90, 107, 90); g.fillStyle = '#30a050'; g.fillRect(107, 90, 107, 90); g.fillStyle = '#2050c0'; g.fillRect(214, 90, 106, 90);`, 3);
await until(async () => Array.isArray(await sbx('return window.__grade.pack()')), 15000);
const pack = await sbx('return window.__grade.pack()');
step('the starter LUT pack: 14 looks, the same names in the page and the hub', Array.isArray(pack) && pack.length === 14 && pack.join() === G.PACK_IDS.join(), pack);

// ---------- 1. each control, on a row of colors ----------
const COLS = [[0, 0, 0], [64, 64, 64], [128, 128, 128], [192, 192, 192], [255, 255, 255], [200, 60, 40], [40, 160, 70], [40, 80, 200], [150, 120, 110], [230, 40, 40]];
const BASE = G.defaults('grade');
const run = (P, cols = COLS) => sbx(`return window.__grade.run(${JSON.stringify({ ...BASE, ...P })}, ${JSON.stringify(cols)})`);
const L = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
const sat = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b);
const md = (a, b) => { let s = 0; let n = 0; for (let i = 0; i < a.length; i++) for (let k = 0; k < 3; k++) { s += Math.abs(a[i][k] - b[i][k]); n += 1; } return Math.round((s / n) * 100) / 100; };
const id = await run({});
step('neutral grade = the picture (mean difference ≤ 1 of 255)', Array.isArray(id) && md(id, COLS) <= 1, { md: Array.isArray(id) ? md(id, COLS) : id });
const T = {};
const ctl = async (name, P, test) => { const o = await run(P); let ok = false; try { ok = Array.isArray(o) && test(o); } catch { ok = false; } T[name] = Array.isArray(o) ? o.slice(0, 6) : o; step(`control: ${name}`, ok, Array.isArray(o) ? o.map((c) => c.join('/')).join(' ') : o); };
await ctl('exposure +1 brightens the mids, black stays black', { exposure: 1 }, (o) => L(o[2]) > L(id[2]) + 25 && L(o[0]) < 3);
await ctl('exposure −1 darkens', { exposure: -1 }, (o) => L(o[2]) < L(id[2]) - 25);
await ctl('temperature + warms (red up, blue down)', { temp: 1 }, (o) => o[2][0] > o[2][2] + 15);
await ctl('tint + leans magenta (green down)', { tint: 1 }, (o) => o[2][1] < o[2][0] - 8 && o[2][1] < o[2][2] - 8);
await ctl('contrast 1.6 spreads darks and lights', { contrast: 1.6 }, (o) => L(o[1]) < L(id[1]) - 10 && L(o[3]) > L(id[3]) + 10);
await ctl('lift + raises the blacks only a little in the whites', { liftLum: 0.6 }, (o) => L(o[0]) > 20 && Math.abs(L(o[4]) - 255) < 3);
await ctl('gamma + brightens the mids, keeps black and white', { gammaLum: 0.6 }, (o) => L(o[2]) > L(id[2]) + 15 && L(o[0]) < 3 && L(o[4]) > 250);
await ctl('gain − dims the whites', { gainLum: -0.5 }, (o) => L(o[4]) < 200);
await ctl('lift wheel toward blue tints the shadows blue', { liftHue: 240, liftAmt: 1 }, (o) => o[1][2] > o[1][0] + 10);
await ctl('gain wheel toward orange tints the highlights warm', { gainHue: 30, gainAmt: 1 }, (o) => o[3][0] > o[3][2] + 15);
await ctl('luma curve mids up', { cL2: 0.7 }, (o) => L(o[2]) > L(id[2]) + 20 && L(o[0]) < 3 && L(o[4]) > 250);
await ctl('red curve mids up: only red moves', { cR2: 0.7 }, (o) => o[2][0] > id[2][0] + 20 && Math.abs(o[2][2] - id[2][2]) < 25);
await ctl('HSL: reds shifted 120° become green, blue stays', { qHue: 0, qRange: 40, qShift: 120 }, (o) => o[9][1] > o[9][0] && md([o[7]], [id[7]]) < 3);
await ctl('HSL: reds desaturated', { qHue: 0, qRange: 40, qSat: -1 }, (o) => sat(o[9]) < sat(id[9]) * 0.4 && md([o[6]], [id[6]]) < 3);
await ctl('saturation 0 = grey', { saturation: 0 }, (o) => sat(o[5]) < 3 && sat(o[7]) < 3);
await ctl('vibrance + lifts the dull color more than the vivid one', { vibrance: 1 }, (o) => (sat(o[8]) - sat(id[8])) / Math.max(1, sat(id[8])) > (sat(o[9]) - sat(id[9])) / Math.max(1, sat(id[9])));
await ctl('split toning: blue shadows, warm highlights', { split: 1, splitShadows: '#2040ff', splitHighlights: '#ffa040' }, (o) => o[1][2] > o[1][0] + 8 && o[3][0] > o[3][2] + 8);
for (const t of G.TONES.slice(1)) await ctl(`tone mapping ${t}: a different curve, black black and white near white`, { tone: t }, (o) => md(o, id) > 1 && L(o[0]) < 6 && L(o[4]) > 225 && o.flat().every(Number.isFinite));
await ctl('vignette darkens the ends of the row', { vignette: 1, vigSoft: 0.3 }, (o) => true && L(o[0]) <= L(id[0]) && L(o[9]) < L(id[9]) - 10);
const flat = [...Array(16)].map(() => [128, 128, 128]);
const flatW = [...Array(16)].map(() => [245, 245, 245]);
const sd = (o) => { const m = o.reduce((s, c) => s + c[0], 0) / o.length; return Math.sqrt(o.reduce((s, c) => s + (c[0] - m) ** 2, 0) / o.length); };
const gm = await run({ grain: 1, grainSize: 1, grainLuma: 1 }, flat); const gw = await run({ grain: 1, grainSize: 1, grainLuma: 1 }, flatW);
step('control: grain adds noise, more in the mids than near white (luma response)', Array.isArray(gm) && sd(gm) > 4 && sd(gw) < sd(gm), { mids: Array.isArray(gm) ? sd(gm) : gm, whites: Array.isArray(gw) ? sd(gw) : gw });
const bw = await run({ bars: '2.39:1' }, [...Array(16)].map(() => [255, 255, 255]));
step('control: 2.39 letterbox on a wider-than-2.39 row = bars at the sides, picture in the middle', Array.isArray(bw) && L(bw[0]) < 3 && L(bw[15]) < 3 && L(bw[8]) > 250, Array.isArray(bw) ? bw.map((c) => c[0]).join(' ') : bw);
await ctl('amount 0: the picture as it was', { exposure: 2, saturation: 0, amount: 0 }, (o) => md(o, id) <= 1);

// ---------- 2. LUTs: .cube files made here, known results ----------
const N = 17;
const inv = new Float32Array(N ** 3 * 3);
for (let b = 0; b < N; b++) for (let g = 0; g < N; g++) for (let r = 0; r < N; r++) { const i = (r + g * N + b * N * N) * 3; inv[i] = 1 - r / (N - 1); inv[i + 1] = 1 - g / (N - 1); inv[i + 2] = 1 - b / (N - 1); }
const home = await window.hub.fs.home();
const dir = `${home}/.hearth-grade-check-${Date.now().toString(36)}`;
await window.hub.fs.write(`${dir}/Invert test.cube`, G.writeCube({ title: 'invert', N, data: inv }));
await window.hub.fs.write(`${dir}/gamma2.cube`, `TITLE "gamma 2"\nLUT_1D_SIZE 256\n${[...Array(256)].map((_, i) => { const v = (i / 255) ** 2; return `${v} ${v} ${v}`; }).join('\n')}\n`);
const r1 = await LabGrade.importCube(`${dir}/Invert test.cube`);
const r2 = await LabGrade.importCube(`${dir}/gamma2.cube`);
step('.cube import: a 3D (17³) and a 1D (256 points, made 3D) LUT', r1.name === 'invert-test' && r1.was === '3d' && r2.name === 'gamma2' && r2.was === '1d', { r1: r1.name, r2: r2.name });
await until(async () => (await sbx('return window.__grade.luts()'))?.includes?.('gamma2'), 5000);
const vi = await run({ lut: 'invert-test' });
step('3D LUT applied: every color inverted (≤ 2 of 255)', Array.isArray(vi) && vi.every((c, i) => c.every((v, k) => Math.abs(v - (255 - COLS[i][k])) <= 2)), Array.isArray(vi) ? vi.map((c) => c.join('/')).join(' ') : vi);
const vh = await run({ lut: 'invert-test', lutMix: 0.5 });
step('LUT strength 50 %: halfway (≈ 128 everywhere)', Array.isArray(vh) && vh.every((c) => c.every((v) => Math.abs(v - 127.5) <= 3)), Array.isArray(vh) ? vh.slice(0, 5).map((c) => c.join('/')).join(' ') : vh);
const vg = await run({ lut: 'gamma2' });
step('1D LUT applied: x² (≤ 3 of 255)', Array.isArray(vg) && vg.every((c, i) => c.every((v, k) => Math.abs(v - (COLS[i][k] / 255) ** 2 * 255) <= 3)), Array.isArray(vg) ? vg.map((c) => c.join('/')).join(' ') : vg);
const packRes = {};
for (const p of G.PACK_IDS) { const o = await run({ lut: p }); packRes[p] = Array.isArray(o) ? md(o, id) : o; }
step('every starter LUT changes the picture (mean difference > 3) and stays in range', Object.values(packRes).every((x) => typeof x === 'number' && x > 3), packRes);
const pageLut = await sbx('return window.__grade.luts().length');
step('the imported LUTs reached the preview page (sent to every Lab page)', pageLut >= 16, pageLut);

// ---------- 3. the Lab: ◐ layers, one pass, export .cube round trip ----------
const probe = async () => String(await sbx('return window.__labGpu.probe(24)')).split(',').map(Number);
out.trace = [];
const trace = async (label) => { await wait(300); out.trace.push(`${label}: ${await sbx('return window.__grade.info().map((x) => x.id + "=" + x.type).join(" ")')} · sel ${d.layers().selected}`); };
await wait(800);
const p0 = await probe();
const said = await say('/grade kodak'); await trace("const said = await say('/grade");
await until(async () => (await LabGrade.findLayers()).lens && (await LabGrade.findLayers()).grade, 12000);
const ly = await LabGrade.findLayers();
step('/grade kodak: ◐ Grade over ◐ Film & lens', Boolean(ly.grade && ly.lens) && /Kodak/.test(said), { said, layers: d.layers().layers.map((x) => x.name) });
await until(async () => (await sbx('return window.__labGpu.info()'))?.fused?.some?.((f) => f[0] === ly.grade.id && f[1] === ly.lens.id), 12000);
const inf = await sbx('return window.__labGpu.info()');
step('the whole grade is one pass: ◐ Grade draws inside ◐ Film & lens', inf?.fused?.some?.((f) => f[0] === ly.grade.id && f[1] === ly.lens.id), inf?.fused);
await wait(600);
const p1 = await probe();
const mdArr = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return Math.round((s / a.length) * 100) / 100; };
step('the preview changed under the grade', mdArr(p0, p1) > 3, mdArr(p0, p1));
const st = await LabGrade.state();
const ex = await say(`/grade export ${dir}/roundtrip.cube`);
const cubeText = await window.hub.fs.read(`${dir}/roundtrip.cube`).catch(() => '');
const parsed = (() => { try { return G.parseCube(cubeText); } catch (e) { return { error: e.message }; } })();
step('/grade export: a 33³ .cube with a title (for Premiere / Resolve)', parsed.N === 33 && /TITLE/.test(cubeText) && /LUT_3D_SIZE 33/.test(cubeText), { said: ex.slice(0, 120), N: parsed.N, error: parsed.error });
await LabGrade.importCube(`${dir}/roundtrip.cube`); await trace('await LabGrade.importCube(`${d');
await until(async () => (await sbx('return window.__grade.luts()'))?.includes?.('roundtrip'), 5000);
const own = await run({ ...st.grade, vignette: 0, grain: 0, bars: 'off' });
const back = await run({ lut: 'roundtrip' });
step('export round trip: the .cube read back gives the grade\'s own pixels (≤ 2.5 of 255)', Array.isArray(own) && Array.isArray(back) && md(own, back) <= 2.5, { md: Array.isArray(own) && Array.isArray(back) ? md(own, back) : [own, back], own: String(own).slice(0, 80), back: String(back).slice(0, 80), cube: cubeText.split('\n').slice(5, 9).join(' | ') });
await say('/grade set amount=0'); await trace("await say('/grade set amount=0");
await say('/grade bloom 0'); await trace("await say('/grade bloom 0');");
const lensL = (await LabGrade.findLayers()).lens; d.sliders(lensL.id, { amount: 0 });
await wait(900);
const offInfo = await sbx('return window.__labGpu.info()');
const p2 = await probe();
step('grade and lens at amount 0 step aside: the picture as it was (≤ 2)', mdArr(p0, p2) <= 2, { md: mdArr(p0, p2), note: offInfo?.note?.passSkipped });
await say('/grade lut noir 100%'); await trace("await say('/grade lut noir 100");
await say('/grade set amount=1 grain=0 vignette=0'); await trace("await say('/grade set amount=1");
await wait(900);
const p3 = await probe();
let grey = 0; for (let i = 0; i < p3.length; i += 3) if (Math.abs(p3[i] - p3[i + 1]) < 12 && Math.abs(p3[i + 1] - p3[i + 2]) < 12) grey += 1;
step('/grade lut noir: the preview goes black & white', grey / (p3.length / 3) > 0.9, { grey: Math.round((grey / (p3.length / 3)) * 100) });

// ---------- 4. the panel and its scopes ----------
await LabGrade.open();
const panel = document.querySelector('.cg-panel');
step('the panel opens over the preview', Boolean(panel?.isConnected) && Boolean(panel.closest('.three-preview')));
const tabsOk = {};
for (const b of [...panel.querySelectorAll('.cg-tab')]) { b.click(); await wait(80); tabsOk[b.dataset.tab] = panel.querySelector('.cg-body').children.length; }
step('every tab shows its controls', Object.values(tabsOk).every((n) => n > 0) && Object.keys(tabsOk).length === 9, tabsOk);
panel.querySelector('.cg-tab[data-tab="tone"]').click(); await wait(80);
const before = await probe();
const expo = [...panel.querySelectorAll('.cg-row')].find((r) => /Exposure/.test(r.textContent))?.querySelector('input');
expo.value = '1.5'; expo.dispatchEvent(new Event('input', { bubbles: true }));
await wait(1000);
const after = await probe();
step('moving Exposure in the panel brightens the preview', after.reduce((a, b) => a + b, 0) > before.reduce((a, b) => a + b, 0) * 1.08, { before: Math.round(before.reduce((a, b) => a + b, 0) / before.length), after: Math.round(after.reduce((a, b) => a + b, 0) / after.length), expo: Boolean(expo), state: (await LabGrade.state()).grade?.exposure, hubLayers: d.layers().layers.map((x) => `${x.id}:${x.name}`).join(' | '), ids: await sbx('return JSON.stringify(window.__grade.info().map((x) => x.id))'), page: await sbx('return JSON.stringify(window.__grade.info().map((x) => [x.type, x.P.exposure, x.P.amount, x.P.lut, x.skip, x.into]))'), toasts: [...document.querySelectorAll('#toasts .toast')].map((t) => t.textContent).slice(-3) });
panel.querySelector('.cg-tab[data-tab="scopes"]').click();
const lit = async () => { const c = panel.querySelector('.cg-scope'); if (!c) return 0; const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < px.length; i += 4) if (px[i + 1] > 40) n += 1; return n; };
const scopes = {};
for (const m of ['wave', 'vector', 'hist']) {
  [...panel.querySelectorAll('.cg-chip')].find((b) => ({ wave: /Waveform/, vector: /Vectorscope/, hist: /Histogram/ })[m].test(b.textContent))?.click();
  await until(async () => (await lit()) > 30, 6000);
  scopes[m] = await lit();
}
step('scopes draw from the picture: waveform, vectorscope, histogram', Object.values(scopes).every((n) => n > 30), scopes);
const sc = G.scopes(new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]), 2, 1);
step('scope math: a red and a blue pixel land on the R and B targets\' side, two histogram ends', sc.hist[0][63] === 1 && sc.hist[2][63] === 1 && sc.vec.reduce((a, b) => a + b, 0) === 2);
await LabGrade.close();
await wait(1500);
const code = d.codeOf(ly.grade.id).code;
step('closing the panel keeps the moves in the scene (the layer\'s code has the new exposure)', /exposure: \{ value: 1\.5/.test(code), code.match(/exposure: \{[^}]*\}/)?.[0]);
step('the scopes stop reading the picture once the panel is closed', !document.querySelector('.cg-scope'));

// ---------- 5. a sequence clip's grade: preview and render ----------
const built = await SQL.build({ name: 'Grade check' });
await wait(800);
const redBefore = await SQL.at(7);
const said2 = await say('/grade clip 1 noir');
await wait(1500);
const edit = ThreeSeq.edit;
const c1 = edit.clips.find((c) => c.id === built.clips.red);
step('/grade clip 1 noir: the red clip carries the grade', Boolean(c1?.cgrade?.grade?.lut === 'noir'), { said: said2, spec: c1?.cgrade });
await SQL.at(7); const redAfter = await SQL.probe({ yc: 0.5 }); const barAt = await SQL.probe({ yc: 0.9 });
const isGrey = (c) => Array.isArray(c) && Math.abs(c[0] - c[1]) < 20 && Math.abs(c[1] - c[2]) < 20;
step('the preview shows the red clip in black & white, with noir\'s 2.39 bars', SQL.colorOf(redBefore.center) === 'red' && isGrey(redAfter.center) && L(redAfter.center) > 30 && L(barAt.center) < 5, { before: redBefore.center, after: redAfter.center, bar: barAt.center });
let greenAt = await SQL.at(75);
await until(async () => { greenAt = await SQL.probe(); return SQL.colorOf(greenAt.center) !== 'black'; }, 6000); // (a clip mounted by the seek draws its first frame)
step('the next clip (green) is not graded', SQL.colorOf(greenAt.center) === 'green', { c: greenAt.center, T: greenAt.T, layers: SQL.colorOf(greenAt.center) === 'green' ? null : await sbx('return JSON.stringify(window.__seqLayers()) + JSON.stringify(window.__seqInfo())') });
let still = null;
try { still = await LabExport.render({ format: 'still', size: '180x320', at: 7 / 30, source: 'seq', quiet: true }); } catch (e) { still = { error: e.message }; }
let px = null;
if (still?.path) {
  const u8 = await window.hub.fs.read(still.path, { encoding: 'buffer' });
  const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
  const cv = new OffscreenCanvas(bmp.width, bmp.height); const g = cv.getContext('2d'); g.drawImage(bmp, 0, 0);
  px = [...g.getImageData(Math.floor(bmp.width / 2), Math.floor(bmp.height * 0.5), 1, 1).data].slice(0, 3);
}
step('the render (export page) shows the red clip graded the same way (preview = render)', isGrey(px) && Math.abs(L(px) - L(redAfter.center)) < 25, { px, preview: redAfter.center, still: still?.path || still });
await say('/grade clip 1 none');
await wait(1200);
const redOff = await SQL.at(7);
step('/grade clip 1 none: red again', SQL.colorOf(redOff.center) === 'red', redOff.center);
out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out);
