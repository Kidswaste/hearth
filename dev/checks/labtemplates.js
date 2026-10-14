// 📐 My templates (round 35, labtemplates), driven like the owner would: a Lab scene (a colored background slider, a
// size slider, a picture reference, a palette, a type layer's words) saved from ✦ More › 📐 My templates › Save as my
// template… (one slider left out on the card); its files in data/templates/<id>/ (template.json with tpl: tokens,
// thumb.jpg, files/logo.png); the picker (✦ More › New from my template…, search, newest first); the form (the fields,
// the live preview stage over its box, which follows a new color); Create → a new scene with the fields applied (code,
// words, the picture swapped, the palette), its first version in the time machine, one Undo; the AI's way
// (/my-template use … through three_run); the .hearthpack round trip (Share as a pack → Open → Add to my templates);
// Delete → the Trash; the ways in (Sketch ▾, the toolbar's ⋯, the gallery's top row) and nothing loaded before use.
//   node dev/smoke.js --check-timeout 240000 --save-dir /tmp/hearth-labtemplates-saves --script dev/checks/labtemplates.js --shot /tmp/labtemplates.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;
const DIR = '/tmp/hearth-labtemplates';
const lazyState = () => Lazy.state().find((g) => g.name === 'labtemplates')?.state;
const png = (color) => { const c = document.createElement('canvas'); c.width = 16; c.height = 16; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, 16, 16); return c.toDataURL('image/png').split(',')[1]; };
// the share of pixels a test likes in a picture (a data URL)
async function share(url, test) {
  if (!url) return -1;
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 0; i < px.length; i += 4) if (test(px[i], px[i + 1], px[i + 2])) n += 1;
  return Math.round((n / (px.length / 4)) * 1000) / 1000;
}
const RED = (r, g, b) => r > 170 && g < 80 && b < 80;
const GREEN = (r, g, b) => g > 170 && r < 80 && b < 80;
const exists = async (p) => Boolean(await window.hub.fs.stat(p).catch(() => null));

try {
  step('first screen: My templates is not loaded (tier "use")', lazyState() === 'stub', lazyState());
  await SQL.lab();
  await until(() => typeof LabTemplatesHook !== 'undefined', 15000);
  const d = ThreeLab.director; const S = ThreeLab.scenes;
  const more = LabEasy.previewItem().items();
  const mt = more.find((x) => /My templates/.test(x.label));
  step('✦ More › 📐 My templates (New from my template… · Save as my template…), the toolbar\'s ⋯ and Sketch ▾ have it; still not loaded', mt && mt.items().map((x) => x.label).join('|') === 'New from my template…|Save as my template…'
    && LabEasy.toolbarItems().some((r) => /My templates/.test(r[0])) && /My templates/.test(LabTemplatesHook.sketchRow()[0]) && lazyState() === 'stub', more.map((x) => x.label));

  // ---------- a scene worth keeping ----------
  await window.hub.fs.write(`${DIR}/logo.png`, png('#ffffff'), { base64: true });
  await window.hub.fs.write(`${DIR}/brand.png`, png('#0000ff'), { base64: true });
  const CODE = `const P = tweak({ bg: { value: '#ff0000', label: 'Background' }, size: { value: 40, min: 10, max: 200, label: 'Logo size' }, speed: { value: 1, min: 0, max: 4, label: 'Speed' } });
const c = document.createElement('canvas'); c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d'); const img = new Image(); if (refs.logo) img.src = refs.logo;
function f() { requestAnimationFrame(f); c.width = innerWidth; c.height = innerHeight; g.fillStyle = P.bg; g.fillRect(0, 0, c.width, c.height); if (img.complete && img.naturalWidth) g.drawImage(img, 8, 8, P.size, P.size); }
f();`;
  const TYPE = 'const P = tweak({ size: { value: 0.1, min: 0.02, max: 0.4, label: \'Size\' } });\n\ntextLayer(P, {"text":"HEARTH","mode":"2d"});\n';
  const layers = [ThreeLayers.defaults({ id: 'main', name: 'Backdrop', code: CODE }), ThreeLayers.defaults({ id: 'words', name: 'Words', code: TYPE, slot: 1 })];
  const sc = S.create({ name: 'Template source', code: CODE, layers, frame: '1:1', open: true });
  await until(() => S.currentId() === sc.id, 6000);
  await d.refs.add(`${DIR}/logo.png`, 'logo');
  d.refs.setPalette(['#123456', '#abcdef']);
  await wait(2500);
  const red0 = await share(await d.shotSmall(96), RED);

  // ---------- save ----------
  mt.items()[1].action();
  const saveDlg = await until(() => document.querySelector('dialog.lt-save[open]'), 15000);
  const groups = [...document.querySelectorAll('dialog.lt-save .lt-save-group')].map((g) => g.dataset.group);
  step('Save as my template… opens the card: a picture of the preview, the name, the parts grouped (text, media, palette, sliders per layer), all ticked', saveDlg && document.querySelector('.lt-save-pic img')?.src.startsWith('data:image')
    && groups.join(',') === 'text,media,palette,s:main,s:words' && [...document.querySelectorAll('dialog.lt-save input[data-field]')].every((x) => x.checked), { groups, red0 });
  document.querySelector('dialog.lt-save .lt-save-group[data-group="s:main"]').open = true;
  await smoke({ shot: '/tmp/labtemplates-save.png' });
  document.querySelector('dialog.lt-save input[data-field="s:main|speed"]').click();
  const nameIn = document.querySelector('dialog.lt-save .lt-name-in');
  nameIn.value = 'Check template'; nameIn.dispatchEvent(new Event('input'));
  document.querySelector('dialog.lt-save .lt-save-ok').click();
  await until(() => LabTemplates.last.saved?.name === 'Check template', 15000);
  const sv = LabTemplates.last.saved;
  const root = await LabTemplates.root();
  let json = null; try { json = JSON.parse(await window.hub.fs.read(`${sv.dir}/template.json`)); } catch { /* none */ }
  const ids = (json?.fields || []).map((f) => f.id);
  step('saved as files in the data folder: template.json (portable: tpl: tokens), thumb.jpg, files/logo.png; Speed left out', json && sv.dir.startsWith(root) && await exists(`${sv.dir}/thumb.jpg`) && await exists(`${sv.dir}/files/logo.png`)
    && json.scene.refs[0].path === 'tpl:files/logo.png' && ids.includes('t:words') && ids.includes('m:ref:logo') && ids.includes('palette') && ids.includes('s:main|bg') && !ids.includes('s:main|speed'), { dir: sv.dir, ids });

  // ---------- the picker ----------
  mt.items()[0].action();
  await until(() => document.querySelector('dialog.lt-dlg[open] .lt-card'), 15000);
  const card = document.querySelector('.lt-card[data-id]');
  const search = document.querySelector('dialog.lt-dlg .lt-search');
  search.value = 'zzzz'; search.dispatchEvent(new Event('input')); await wait(300);
  const none = !document.querySelector('.lt-card') && /Nothing like/.test(document.querySelector('.lt-body').textContent);
  search.value = 'check'; search.dispatchEvent(new Event('input')); await wait(300);
  step('New from my template… opens the picker: its picture card; search narrows it', card && card.querySelector('img')?.src.startsWith('data:image/jpeg') && /Check template/.test(card.textContent) && none && document.querySelectorAll('.lt-card').length === 1, card?.textContent);
  await smoke({ shot: '/tmp/labtemplates-picker.png' });

  // ---------- the form + live preview ----------
  document.querySelector('.lt-card').click();
  await until(() => document.querySelector('dialog.lt-form[open]') && LabTemplates.last.preview?.runs >= 1, 25000);
  const fm = LabTemplates.formApi;
  const rows = [...document.querySelectorAll('dialog.lt-form .lt-row')].map((r) => r.dataset.field);
  const host = document.querySelector('.lab-backstage.lt-stage-on'); const box = document.querySelector('.lt-prev-box');
  const hr = host?.getBoundingClientRect(); const br = box?.getBoundingClientRect();
  const over = hr && br && Math.abs(hr.left + hr.width / 2 - (br.left + br.width / 2)) < 4 && Math.abs(hr.top + hr.height / 2 - (br.top + br.height / 2)) < 4;
  await wait(800);
  const pvRed = await share(await fm.pv.stage.thumb(120), RED);
  step('picking it opens the form: words, a picture slot, the palette, the sliders (no Speed); the live preview runs over its box', rows[0] === 't:words' && rows.includes('m:ref:logo') && rows.includes('palette') && rows.includes('s:main|bg') && !rows.includes('s:main|speed') && over && pvRed > 0.5 && !LabTemplates.last.preview.errors,
    { rows, pvRed, preview: LabTemplates.last.preview });
  const runs0 = LabTemplates.last.preview.runs;
  fm.set('t:words', 'HELLO');
  fm.set('s:main|bg', '#00ff00');
  fm.set('s:main|size', 150);
  fm.set('m:ref:logo', `${DIR}/brand.png`);
  await until(() => LabTemplates.last.preview.runs > runs0 && !fm.pv.busy, 15000);
  await wait(1200);
  const pvGreen = await share(await fm.pv.stage.thumb(120), GREEN);
  const slotName = document.querySelector('.lt-row[data-field="m:ref:logo"] .lt-mname')?.textContent;
  step('the preview follows the values typed (the background turns green); the picture slot shows the new file', pvGreen > 0.4 && slotName === 'brand.png', { pvGreen, slotName });
  await smoke({ shot: '/tmp/labtemplates-form.png' });

  // ---------- create ----------
  const prev = S.currentId();
  document.querySelector('dialog.lt-form .lt-create').click();
  await until(() => LabTemplates.last.created && S.currentId() === LabTemplates.last.created.id, 15000);
  const cr = LabTemplates.last.created;
  await wait(2500);
  const x = S.get(cr.id);
  const Ls = S.layersOf(x);
  const refs = d.refs.list();
  const hist = await (window.ThreeHistory?.list?.(cr.id) || Promise.resolve([]));
  const green = await share(await d.shotSmall(96), GREEN);
  step('Create: a new scene with the fields applied (green, size 150, "HELLO", the new picture, the palette, the frame), the source untouched', x && x.name === 'Check template' && Ls[0].code.includes("'#00ff00'") && Ls[0].code.includes('value: 150') && Ls[1].code.includes('"text":"HELLO"')
    && refs.some((r) => r.key === 'logo' && r.name === 'brand.png') && JSON.stringify(d.refs.palette()) === '["#123456","#abcdef"]' && S.frameOf(cr.id) === '1:1' && green > 0.4
    && S.layersOf(S.get(sc.id))[0].code === CODE, { name: x?.name, changed: cr.changed, green, refs: refs.map((r) => r.name) });
  step('its own history entry: the first version in the time machine, named after the template', hist.some((v) => /From my template "Check template"/.test(v.label || '')), hist.map((v) => v.label));
  const undoBtn = [...document.querySelectorAll('.toast button, .toasts button')].find((b) => b.textContent === 'Undo');
  if (undoBtn) undoBtn.click(); else await LabTemplates.undoCreate(cr.id);
  await until(() => !S.get(cr.id), 6000);
  step('one Undo (the toast\'s): the new scene goes (to History\'s deleted sketches) and the one before is back', !S.get(cr.id) && S.currentId() === prev, { viaToast: Boolean(undoBtn) });

  // ---------- the AI's way: an on-demand command, no new tool ----------
  let said = '';
  const fields = await Commands.tryRun('/my-template fields check', H.claudeAgent().id, undefined, { source: 'code', say: (t) => { said += t; } });
  const fieldsText = said; said = '';
  const viaAI = typeof HubBridge !== 'undefined' ? await HubBridge.call('three_run', { command: '/my-template use Check template {"Words": "VIA AI", "Background": "#0000ff"}' }, {}) : null;
  const made = LabTemplates.last.created;
  step('for the AI: /my-template fields lists them; three_run "/my-template use … {values}" makes the scene straight away', fields !== false && /Words: text = "HEARTH"/.test(fieldsText) && /Background/.test(fieldsText)
    && viaAI?.ok && /Made "Check template/.test(viaAI.value) && S.get(made.id) && S.layersOf(S.get(made.id))[1].code.includes('"text":"VIA AI"') && S.layersOf(S.get(made.id))[0].code.includes("'#0000ff'"), { fieldsText: fieldsText.slice(0, 300), viaAI });
  const del = HubBridge?.call ? await HubBridge.call('three_run', { command: '/my-template delete Check template' }, {}) : null;
  step('the AI can\'t delete a template (the owner\'s to do)', /owner/.test(del?.value || del?.error || ''), del);

  // ---------- the .hearthpack round trip ----------
  const t1 = LabTemplates.byName('Check template', await LabTemplates.list({ fresh: true }));
  const sharing = LabTemplates.share(t1);
  await until(() => document.querySelector('dialog.pk-card[open] .pk-ok'), 15000);
  const saveCardText = document.querySelector('dialog.pk-card[open]')?.textContent || '';
  document.querySelector('dialog.pk-card[open] .pk-ok').click();
  const sh = await sharing;
  step('⇪ Share as a pack…: one .hearthpack (kind "template", its picture file inside)', sh?.ok && /\.hearthpack$/.test(sh.path) && sh.files >= 1 && /template with \d+ fields/i.test(saveCardText), { path: sh?.path, files: sh?.files, card: saveCardText.slice(0, 160) });
  const opening = LabPacks.openFile(sh.path);
  await until(() => document.querySelector('dialog.pk-card[open] .pk-ok'), 15000);
  const okLabel = document.querySelector('dialog.pk-card[open] .pk-ok')?.textContent;
  document.querySelector('dialog.pk-card[open] .pk-ok').click();
  await opening;
  const imp = LabPacks.last.imported;
  const t2 = LabTemplates.byName(imp?.template || '', await LabTemplates.list({ fresh: true }));
  step('opening it: "Add to my templates" → a second template with the same fields and its own copy of the picture', okLabel === 'Add to my templates' && t2 && t2.id !== t1.id && t2.fields.length === t1.fields.length && t2._thumb && await exists(`${t2._dir}/files/logo.png`)
    && t2.scene.refs[0].path.startsWith(t2._dir) && !(await exists(imp.dir)), { okLabel, imp, name: t2?.name, unpackedLeft: await exists(imp?.dir || '/nope') });

  // ---------- delete → the Trash ----------
  let rmErr = null;
  try { await LabTemplates.remove(t2); } catch (e) { rmErr = e.message; }
  const gone = !(await exists(t2._dir));
  const left = (await LabTemplates.list({ fresh: true })).map((t) => t.name);
  step('Delete moves the template\'s folder to the Trash (the other one stays)', !rmErr && gone && left.includes('Check template') && !left.includes(t2.name), { rmErr, left });

  // ---------- the gallery's top row ----------
  if (typeof LabGalleryHook !== 'undefined') {
    LabGalleryHook.open();
    await until(() => document.querySelector('.lab-gal-dlg .lt-gal-row'), 15000);
    const row = document.querySelector('.lab-gal-dlg .lt-gal-row');
    step('the gallery ("Start from something like…") shows 📐 My templates on top; it opens the picker', row && /My templates \(1\)/.test(row.textContent), row?.textContent);
    row?.click();
    await until(() => document.querySelector('dialog.lt-dlg[open]'), 6000);
    LabTemplates.close();
  }
  out.lazy = lazyState();
  out.errors = (window.__errors || []).slice(0, 5);
  // leave the form on screen for the final picture
  await LabTemplates.form(t1);
  await until(() => LabTemplates.last.preview?.runs >= 1, 15000);
  await wait(600);
} catch (e) { step('no exception', false, `${e.message}\n${e.stack}`); }
return JSON.stringify(out);
