// ⧉ Make a batch (round 42, labbatch), driven like the owner would: a Lab scene (a Background color slider, a type
// layer's words) saved as one of My templates; the ways in (✦ More › ⇪ Make, the toolbar's ⋯, My templates' picker
// foot and a card's right-click) with nothing loaded before use; the dialog (a pasted CSV naming Title and Background,
// 16:9 + 9:16 picked, the names it will get, "Make 6 videos"); the preview grid (one still per row, each in its own
// color, drawn by the export page); then real renders with ffmpeg (3 rows × 2 formats, tiny and short): 6 MP4s with
// the right names and sizes in one folder, each in its row's color, "Batch summary.csv" listing them, one render-queue
// row and one progress line while it runs, the computer kept awake; a second batch cancelled mid-way (what was made
// stays, the rest is "cancelled" in the summary, no half file); /batch status; the AI's way (/batch … lines … now).
//   node dev/smoke.js --fake-engines --check-timeout 480000 --script dev/checks/labbatch.js --shot /tmp/labbatch.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return false; };
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const safe = async (name, fn) => { try { await fn(); } catch (err) { step(name, false, { error: String(err?.stack || err?.message || err).slice(0, 500) }); } };
const lazyState = (g = 'labbatch') => Lazy.state().find((x) => x.name === g)?.state;
const exists = async (p) => Boolean(await window.hub.fs.stat(p).catch(() => null));
// the average color of a picture's top-left corner (a blob / an image URL)
async function cornerOf(src, right = false) {
  const bmp = await createImageBitmap(src);
  const c = new OffscreenCanvas(bmp.width, bmp.height); const g = c.getContext('2d'); g.drawImage(bmp, 0, 0);
  const w = Math.max(2, Math.floor(bmp.width / 5));
  const px = g.getImageData(right ? bmp.width - w : 0, 0, w, Math.max(2, Math.floor(bmp.height / 5))).data;
  const s = [0, 0, 0]; for (let i = 0; i < px.length; i += 4) { s[0] += px[i]; s[1] += px[i + 1]; s[2] += px[i + 2]; }
  return s.map((v) => Math.round(v / (px.length / 4)));
}
// a video's first frame, its corner color (the file read as bytes: a blob URL in a <video>)
async function videoCorner(p, right = false) {
  const u8 = await window.hub.fs.read(p, { encoding: 'buffer' });
  const url = URL.createObjectURL(new Blob([u8], { type: 'video/mp4' }));
  const v = document.createElement('video'); v.muted = true; v.src = url;
  try {
    await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('the video did not load')); setTimeout(r, 6000); });
    v.currentTime = 0.04; await new Promise((r) => { v.onseeked = r; setTimeout(r, 2000); });
    const c = document.createElement('canvas'); c.width = v.videoWidth || 16; c.height = v.videoHeight || 16;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return await cornerOf(await new Promise((r) => c.toBlob(r)), right);
  } finally { URL.revokeObjectURL(url); }
}
const isColor = (rgb, want) => { const [r, g, b] = rgb; return want === 'red' ? r > 150 && g < 90 && b < 90 : want === 'green' ? g > 150 && r < 90 && b < 90 : b > 150 && r < 90 && g < 90; };
const dirs = [];
let tpl = null;

try {
  step('first screen: Make a batch is not loaded (tier "use"), its command is known (lazy manifest)', lazyState() === 'stub' && Boolean(Commands.get('batch')), lazyState());
  activate('tool:three'); await wait(400);
  await ThreeLab.cmd({ show: true });
  await until(() => typeof LabEasy !== 'undefined' && typeof LabExport !== 'undefined' && typeof LabBatchHook !== 'undefined' && ThreeLab.director, 30000);
  const d = ThreeLab.director; const S = ThreeLab.scenes;
  const make = LabEasy.previewGroups().find((x) => /Make/.test(x.label)).items();
  step('Right-click the preview › ⇪ Make & export has ⧉ Make a batch… (after ▦ All formats); the toolbar\'s ⋯ too; still not loaded', /All formats/.test(make[0]?.label) && /Make a batch/.test(make[1]?.label) && LabEasy.toolbarItems().some((r) => /Make a batch/.test(r[0])) && lazyState() === 'stub', make.slice(0, 3).map((x) => x.label));

  // ---------- a scene worth batching, saved as a template ----------
  const CODE = `const P = tweak({ bg: { value: '#ff0000', label: 'Background' } });
const c = document.createElement('canvas'); c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d');
function f() { requestAnimationFrame(f); c.width = innerWidth; c.height = innerHeight; g.fillStyle = P.bg; g.fillRect(0, 0, c.width, c.height); }
f();`;
  const TYPE = 'const P = tweak({ size: { value: 0.08, min: 0.02, max: 0.4, label: \'Size\' } });\n\ntextLayer(P, {"text":"HEARTH","mode":"2d"});\n';
  const layers = [ThreeLayers.defaults({ id: 'main', name: 'Backdrop', code: CODE }), ThreeLayers.defaults({ id: 'words', name: 'Title', code: TYPE, slot: 1 })];
  const sc = S.create({ name: 'Batch source', code: CODE, layers, frame: '16:9', open: true });
  await until(() => S.currentId() === sc.id, 6000);
  await wait(2000);
  await LabTemplatesHook.lib(async (T) => { tpl = await T.saveCurrent({ name: 'Batch check' }); });
  step('a template "Batch check" with its fields (Title, Background, Size)', tpl?.fields >= 3, tpl);

  // ---------- My templates' ways in ----------
  await LabTemplates.open();
  const foot = await until(() => document.querySelector('dialog.lt-dlg[open] .lt-batch'), 8000);
  const card = document.querySelector('.lt-card[data-id]');
  card?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
  await wait(200);
  const menuRows = [...document.querySelectorAll('button')].filter((x) => !x.closest('dialog.lt-dlg')).map((x) => x.textContent).filter((x) => /batch|Fill it in/i.test(x));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(100);
  step('My templates\' picker: "⧉ Make a batch…" at its foot and on a card\'s right-click', Boolean(foot) && menuRows.some((t) => /Make a batch/.test(t)), { menuRows: menuRows.slice(0, 10) });
  card?.focus();
  foot.click();
  const dlg = await until(() => document.querySelector('dialog.lb-dlg[open]'), 30000);
  step('it opens the batch dialog (its files load now, after My templates and All formats); "From" is that template', dlg && lazyState() === 'loaded' && LabBatch._S.st?.t?.name === 'Batch check' && /Batch check/.test(dlg.querySelector('.lb-src option:checked')?.textContent || ''), { lazy: lazyState(), from: dlg?.querySelector('.lb-src option:checked')?.textContent });

  // ---------- the dialog: a pasted CSV, two formats ----------
  const st = LabBatch._S.st;
  const ta = dlg.querySelector('.lb-rows');
  ta.value = 'Title,Background\nAlpha,#ff0000\nBeta,#00ff00\nGamma,#0000ff\n';
  ta.dispatchEvent(new Event('input'));
  for (const b of dlg.querySelectorAll('.lb-fmt input')) { const want = ['16:9', '9:16'].includes(b.dataset.fmt); if (b.checked !== want) b.click(); }
  await until(() => st.parsed?.rows.length === 3, 3000);
  await wait(250);
  const status = dlg.querySelector('.lb-status').textContent; const example = dlg.querySelector('.lb-example').textContent; const goText = dlg.querySelector('.lb-go').textContent;
  step('a pasted CSV: 3 rows, columns Title and Background; 16:9 + 9:16 → "Make 6 videos"; the first name shown ("Alpha 16x9.mp4")', /3 rows/.test(status) && /Title, Background/.test(status) && goText === '⇪ Make 6 videos' && /Alpha 16x9\.mp4/.test(example), { status, example, goText });
  // the preview grid
  const pv = await until(() => LabBatch.last.previews?.n === 3 && LabBatch.last.previews.fid === '16:9' && dlg.querySelectorAll('.lb-pic img').length === 3, 150000);
  const imgs = [...dlg.querySelectorAll('.lb-pic img')];
  const cols = [];
  for (const p of st.prev) cols.push(await cornerOf(p.blob).catch((e) => String(e.message)));
  step('the preview grid: one still per row (the first rows, at 16:9), each in its own color, named as the file will be', pv && isColor(cols[0], 'red') && isColor(cols[1], 'green') && isColor(cols[2], 'blue') && /Beta 16x9/.test(dlg.querySelectorAll('.lb-cname')[1]?.textContent || ''),
    { cols, previews: LabBatch.last.previews, hosts: document.querySelectorAll('.lab-xp-host').length });
  step('no export page left open after the previews', document.querySelectorAll('.lab-xp-host').length === 0);
  await smoke({ shot: '/tmp/labbatch-dialog.png' });

  // ---------- a real batch: 3 rows × 2 formats, tiny and short ----------
  const rows = st.rowsOk(); const t = st.t;
  LabBatch.close();
  step('closing the dialog frees it (no dialog, no preview pictures kept)', !document.querySelector('dialog.lb-dlg') && !LabBatch._S.st);
  let res = null; const seen = new Set(); let maxRows = 0; let rq = null; let awake = null;
  await safe('batch', async () => {
    const off = window.Progress?.on?.((it) => { seen.add(it.key.split(':')[0]); });
    const tick = setInterval(() => {
      const n = (window.Progress?.list?.() || []).filter((x) => /^lab-(export|formats|batch):/.test(x.key) && !x.done).length; maxRows = Math.max(maxRows, n);
      const j = window.Renders?.list?.().find((x) => /Batch · Batch check/.test(x.title || '') && ['running', 'starting'].includes(x.status)); if (j && !rq) rq = { title: j.title, status: j.status };
      const a = window.Power?.state?.()?.awake; if (a?.n && !awake) awake = a.text;
    }, 60);
    const t0 = performance.now();
    res = await LabBatch.start({ t, rows, formats: ['16:9', '9:16'], pattern: '{title} {format}', long: 160, frames: 6, fps: 30 });
    clearInterval(tick); off?.();
    dirs.push(res.dir);
    out.ms = Math.round(performance.now() - t0);
    step('one render-queue row and one progress line for the whole batch (its videos add none); the computer kept awake meanwhile', rq && seen.has('lab-batch') && !seen.has('lab-export') && maxRows === 1 && /awake/.test(awake || ''), { rq, seen: [...seen], maxRows, awake });
    const names = res.files.map((f) => f.path.split(/[\\/]/).pop());
    step('6 MP4s with the right names, in the rows\' order, in one folder', res.files.length === 6 && names.join('|') === 'Alpha 16x9.mp4|Alpha 9x16.mp4|Beta 16x9.mp4|Beta 9x16.mp4|Gamma 16x9.mp4|Gamma 9x16.mp4' && new Set(res.files.map((f) => f.path.replace(/[\\/][^\\/]+$/, ''))).size === 1 && /Batch check · batch/.test(res.dir), { names, dir: res.dir });
    const probes = await Promise.all(res.files.map((f) => window.hub.video.probe(f.path)));
    step('the right sizes (160×90, 90×160), 6 frames each, H.264', probes.every((p, i) => p?.codec === 'h264' && p.frames === 6 && (i % 2 === 0 ? p.w === 160 && p.h === 90 : p.w === 90 && p.h === 160)), probes.map((p) => p && `${p.codec} ${p.w}x${p.h} ${p.frames}f`));
    const vc = [];
    for (const f of res.files.filter((_, i) => i % 2 === 0)) vc.push(await videoCorner(f.path).catch((e) => String(e.message)));
    step('each video is its row\'s values (Alpha red, Beta green, Gamma blue)', Array.isArray(vc[0]) && isColor(vc[0], 'red') && isColor(vc[1], 'green') && isColor(vc[2], 'blue'), vc);
    const csv = await window.hub.fs.read(res.summary);
    const tab = BatchCore.parseTable(csv).rows;
    const files = (await window.hub.fs.list(res.dir)).map((x) => x.name).sort();
    step('"Batch summary.csv": a line per video (file, format, size, frames, made) with the values used', tab.length === 7 && tab[0].slice(0, 8).join(',') === 'Row,File,Format,Width,Height,Frames,Seconds,Status' && tab[0].includes('Title') && tab[0].includes('Background')
      && tab.slice(1).every((r) => r[7] === 'made') && tab[1][1] === 'Alpha 16x9.mp4' && tab[1][tab[0].indexOf('Background')] === '#ff0000' && tab[6][tab[0].indexOf('Title')] === 'Gamma'
      && files.length === 7 && files.includes('Batch summary.csv'), { head: tab[0], first: tab[1], files });
  });

  // ---------- a recipe on each: replayed once on a scratch copy, the scene on screen untouched ----------
  await safe('recipe', async () => {
    if (typeof LabRecipes === 'undefined') await Lazy.load('labrecipes');
    const STRIPE = `const c = document.createElement('canvas'); c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d');
function f() { requestAnimationFrame(f); c.width = innerWidth; c.height = innerHeight; g.clearRect(0, 0, c.width, c.height); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width * 0.3, c.height); }
f();`;
    const rc = await LabRecipes.save(RecipeCore.make({ name: 'Batch stripe', steps: [{ k: 'layer', name: 'Stripe', code: STRIPE, props: {} }] }));
    const scenes0 = S.all().length; const on0 = S.currentId();
    const r = await LabBatch.start({ t, rows: rows.slice(0, 1), formats: ['16:9'], recipe: rc, pattern: '{title} with stripe', long: 160, frames: 4, fps: 30, quiet: true });
    dirs.push(r.dir);
    const left = await videoCorner(r.files[0].path).catch((e) => e.message); const right = await videoCorner(r.files[0].path, true).catch((e) => e.message);
    await wait(300);
    step('a recipe on each video: its layer is in the render (a white stripe on the left of Alpha\'s red); the scratch copy is gone and the scene on screen is back', r.files.length === 1 && /Alpha with stripe\.mp4$/.test(r.files[0].path) && Array.isArray(left) && left.every((v) => v > 200) && isColor(right, 'red')
      && S.all().length === scenes0 && S.currentId() === on0, { left, right, scenes: [scenes0, S.all().length], on: S.get(S.currentId())?.name });
    await LabRecipes.remove(rc).catch(() => {});
  });

  // ---------- cancel mid-batch ----------
  await safe('cancel', async () => {
    const p = LabBatch.start({ t, rows, formats: ['16:9', '9:16'], pattern: '{n} {title} {format}', long: 160, frames: 90, fps: 30, quiet: true });
    await until(() => LabBatch.status().running?.done >= 1 && LabExport.status().running?.frames >= 3, 180000);
    const mid = LabBatch.status().running;
    LabBatch.cancel();
    const r = await p;
    dirs.push(r.dir);
    let files = [];
    await until(async () => { files = (await window.hub.fs.list(r.dir)).map((x) => x.name).sort(); return files.filter((n) => /\.mp4$/.test(n)).length === r.files.length; }, 8000); // (the half video goes a moment after)
    const tab = BatchCore.parseTable(await window.hub.fs.read(r.summary)).rows;
    const statuses = tab.slice(1).map((x) => x[7]);
    const job = window.Renders?.list?.().filter((x) => /Batch · Batch check/.test(x.title || '')).pop();
    step('cancel mid-batch: it stops in the middle of a video, what was made stays, no half file, the rest "cancelled" in the summary; the queue row says cancelled',
      r.cancelled && r.files.length >= 1 && r.files.length < 6 && files.filter((n) => /\.mp4$/.test(n)).length === r.files.length && statuses.filter((s) => s === 'made').length === r.files.length && statuses.filter((s) => s === 'cancelled').length === 6 - r.files.length && job?.status === 'cancelled' && !LabBatch.status().running,
      { mid, files, statuses, job: job && { status: job.status } });
    const said = []; await Commands.tryRun('/batch status', H.claudeAgent().id, undefined, { say: (x) => said.push(x) });
    step('/batch status says what the last batch made and where', /Last batch: \d+ made/.test(said.join(' ')) && /cancelled/.test(said.join(' ')), said.join(' '));
  });

  // ---------- every song in a folder: one video each, with its sound, titled from the file's name ----------
  await safe('songs', async () => {
    const SONG = '/tmp/hearth-test-song.wav'; const DIR = '/tmp/hearth-labbatch-songs';
    await window.hub.fs.copy(SONG, `${DIR}/01 first_song.wav`); await window.hub.fs.copy(SONG, `${DIR}/02 Second-Song.wav`); await window.hub.fs.write(`${DIR}/cover.png`, 'x');
    const t2 = TemplateCore.make({ ...t.scene, extras: { ...t.scene.extras, media: { path: SONG } } }, [...t.fields, { id: 'm:song', kind: 'audio', label: 'Song', value: SONG, where: 'song' }], { name: 'Batch song' });
    const st2 = await LabBatch.open({ template: 'scene' });
    st2.t = t2;
    await st2.useFolder(DIR, 'audio');
    await until(() => st2.parsed?.rows.length === 2, 3000);
    const rs = st2.rowsOk();
    step('"Every song in a folder…": one row per song (not the picture), the title from each file\'s name', rs.length === 2 && rs[0].values['t:words'] === 'first song' && rs[1].values['t:words'] === 'Second - Song' && /02 Second-Song\.wav$/.test(rs[1].values['m:song']), rs.map((r) => r.values));
    LabBatch.close();
    const r = await LabBatch.start({ t: t2, rows: rs, formats: ['1:1'], long: 96, secs: 0.5, fps: 30, quiet: true });
    dirs.push(r.dir);
    const pr = await Promise.all(r.files.map((f) => window.hub.video.probe(f.path)));
    step('…each video has its song\'s sound and the length asked (0.5 s = 15 frames)', r.files.length === 2 && pr.every((p) => p?.audio && p.frames === 15 && p.w === 96) && /first song 1x1\.mp4$/.test(r.files[0].path), pr.map((p) => p && `${p.w}x${p.h} ${p.frames}f audio ${p.audio?.codec || 'none'}`));
    await window.hub.fs.trash?.([DIR]);
  });

  // ---------- the AI's way ----------
  await safe('ai', async () => {
    let said = '';
    await Commands.tryRun('/batch "Batch check" lines One | Two formats 1:1 secs 0.2 long 96 now', H.claudeAgent().id, undefined, { source: 'code', say: (x) => { said += x; } });
    await until(() => LabBatch.status().running, 8000);
    await until(() => !LabBatch.status().running, 120000);
    const l = LabBatch.status().last;
    if (l?.dir) dirs.push(l.dir);
    step('for the AI: /batch <template> lines A | B formats 1:1 … now makes them in the background', /Making 2 videos/.test(said) && l?.files.length === 2 && l.files.every((f) => f.w === 96 && f.h === 96) && /One 1x1\.mp4$/.test(l.files[0].path), { said, files: l?.files.map((f) => f.path.split(/[\\/]/).pop()) });
  });
} catch (e) { step('no exception', false, `${e.message}\n${e.stack}`); }

// cleanup: the folders and the template to the Trash; leave the dialog on screen for the picture
await safe('cleanup', async () => {
  for (const d of dirs) await window.hub.fs.trash?.([d]);
  const all = await LabTemplates.list({ fresh: true });
  const t = all.find((x) => x.name === 'Batch check');
  if (t) await LabTemplates.remove(t);
  step('cleanup: the batches\' folders and the template removed, nothing running, no export page', !LabBatch.status().running && document.querySelectorAll('.lab-xp-host').length === 0 && !(await Promise.all(dirs.map(exists))).some(Boolean));
});
out.errors = (window.__errors || []).slice(0, 5);
out.ok = out.steps.every((s) => s.ok);
return JSON.stringify(out, null, 1);
