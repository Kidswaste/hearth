// (round 63, soundbank63) The Sound bank in the real app, with the fake plugin host:
//   node dev/smoke.js --fake-vst --script dev/checks/soundbank63.js --shot /tmp/soundbank.png
// The owner's way: keep a few presets in the Sound desk (one through the ✦ Preset window's door), open "Keep a patch ›
// Sound bank…", search words / tags, include a plugin preset folder (read-only), make the previews (queued in the
// background, cached), hover = preview, click = loads live, favorites, similar, drag onto the Park jam fold (used in),
// a park take while a bank preset plays (used in), /sounds from chat. The plugin folder's files must not change.
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, what = 'condition') => { const end = performance.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (performance.now() > end) throw Error('timed out waiting for ' + what); await wait(40); } };
const out = { checks: [], timings: {} }, ok = (v, msg) => { if (!v) throw Error(msg); out.checks.push(msg); };
const runtime = await hub.vst.status();
if (!runtime.ok || !/fake/.test(runtime.version || '')) return JSON.stringify({ skipped: ['Sound bank UI: the fake audio host is not available here (python3 + numpy, smoke --fake-vst)'], runtime: runtime.error || runtime.version });
const dir = `${window.SMOKE_TMP}/soundbank`, presets = `${window.SMOKE_TMP}/soundbank-user-presets`;
await hub.fs.write(`${dir}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}'); await hub.fs.write(`${dir}/Serum2.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Serum 2"}');
// the owner's own Vital / Serum 2 preset folder (read-only for Hearth)
const vitalFile = `${presets}/Plucks/PL Glass.vital`, serumFile = `${presets}/BA Hollow.SerumPreset`;
await hub.fs.write(vitalFile, JSON.stringify({ author: 'me', preset_name: 'Glass', preset_style: 'Pluck', settings: { env_1_attack: .3, env_1_decay: .7, env_1_sustain: 0, env_1_release: .6, filter_1_on: 1, filter_1_cutoff: 120, osc_1_on: 1, osc_1_unison_voices: 1, polyphony: 8 } }));
await hub.fs.write(serumFile, 'XferJson\u0000H\u0000\u0000\u0000{"fileType":"SerumPreset","presetName":"Hollow Sub","presetAuthor":"me","tags":["Bass"]}(compressed body)');
const fingerprint = async () => JSON.stringify(await Promise.all([vitalFile, serumFile].map(async f => { const s = await hub.fs.stat(f), r = await hub.fs.read(f); return [s?.mtimeMs ?? s?.mtime ?? s?.size, JSON.stringify(r).length]; })));
const before = await fingerprint();

await Lazy.load('creative'); const project = WorkbenchCore.defaults(); project.vst.roots = [dir]; await hub.kvSet('creative-workbenches', project);
activate('tool:creative'); await until(() => document.querySelector('.wb-stations'), 15000, 'Playground');
CreativePlayground.openFeature('vst'); await until(() => document.querySelectorAll('.wb-instrument-card').length === 2, 15000, 'instrument cards');
[...document.querySelectorAll('.wb-instrument-card')].find(b => b.textContent === 'Vital').click();
const api = WorkbenchVST.api; await until(() => api.current()?.ready, 20000, 'Vital ready');
// 1. three presets kept the usual ways
await api.set({ level: .3, mono: true }); await api.savePreset('Night Pad');
await api.set({ level: .8, mono: false }); await api.savePreset('Bright Keys');
await api.set({ level: .55 }); await WorkbenchVST.door.keep('✦ Glass Lead', await WorkbenchVST.door.snapshot());
ok(api.presets().length === 3, 'three presets kept in the desk bank (one by the ✦ Preset window)');
ok(SoundBank._test.pending().size >= 2, 'the controls of a sound are noted as it is saved (for tags), from the desk cache');
// 2. the picker opens from the desk's preset bank row
const opener = await until(() => [...document.querySelectorAll('.wb-sound-section button')].find(b => b.textContent === 'Sound bank…'), 8000, 'Sound bank… button');
opener.closest('details').open = true; let t0 = performance.now(); opener.click();
await until(() => document.querySelectorAll('.sb-win .sb-row').length === 3, 8000, 'three rows'); out.timings.openMs = Math.round(performance.now() - t0);
const rows = () => [...document.querySelectorAll('.sb-win .sb-row')], rowOf = name => rows().find(r => r.querySelector('.sb-name').textContent === name);
ok(/✦ Preset window/.test(rowOf('✦ Glass Lead').querySelector('.sb-meta').textContent) && /bank/.test(rowOf('Night Pad').querySelector('.sb-meta').textContent), `the picker lists the bank with its sources (${out.timings.openMs} ms)`);
ok(/pad/.test(rowOf('Night Pad').querySelector('.sb-meta').textContent) && /keys/.test(rowOf('Bright Keys').querySelector('.sb-meta').textContent) && /mono/.test(rowOf('Night Pad').querySelector('.sb-meta').textContent), 'local tags shown (pad / keys from the names, mono from the controls)');
// 3. search
const search = document.querySelector('.sb-search'); const type = v => { search.value = v; search.dispatchEvent(new Event('input', { bubbles: true })); };
type('pad'); ok(rows().length === 1 && rowOf('Night Pad'), 'search "pad" → Night Pad'); type('lead mono'); ok(rows().length === 0 || rows().every(r => /lead/.test(r.textContent)), 'two words narrow (lead + mono)'); type('');
// 4. a plugin preset folder, read-only
await SoundBank.addFolder(presets); await until(() => rows().length === 5, 8000, 'plugin folder rows');
ok(/Vital folder · Plucks/.test(rowOf('PL Glass').querySelector('.sb-meta').textContent) && /pluck/.test(rowOf('PL Glass').textContent) && rowOf('Hollow Sub') && /bass/.test(rowOf('Hollow Sub').textContent), 'plugin folder presets listed with folder and tags (.vital controls, Serum 2 header name + tags)');
// 5. previews: queued, in the background, one at a time, cached
const statusLink = await until(() => [...document.querySelectorAll('.sb-status .sb-link')].find(b => /Make previews \(5\)/.test(b.textContent)), 4000, 'Make previews link');
t0 = performance.now(); statusLink.click();
await until(() => /Previews \d\/5/.test(document.querySelector('.sb-status').textContent), 4000, 'queue shown'); ok(true, 'Make previews → "Previews n/5" in the status line, the picker stays usable');
await until(() => !SoundBank._test.queue().running && SoundBank._test.queue().done === 5, 60000, 'previews done'); out.timings.previewsMs = Math.round(performance.now() - t0);
await until(() => rows().filter(r => r.querySelector('.sb-pv').textContent === '▶').length === 4, 4000, 'preview marks');
const failed = SoundBank._test.entries().find(x => x.name === 'Hollow Sub');
ok(failed.preview?.error && rowOf('Hollow Sub').querySelector('.sb-pv').textContent === '!', `4 previews made in ${out.timings.previewsMs} ms; the fake Serum 2 file can't load (kept as "no preview": ${failed.preview?.error?.slice(0, 60)})`);
ok((await hub.soundbank.previews({ ids: SoundBank._test.entries().filter(x => x.preview?.file).map(x => x.id) })).total === 0, 'previews are cached: asking again queues nothing');
const pad = SoundBank._test.entries().find(x => x.name === 'Night Pad'); const wav = await hub.soundbank.preview(pad.id);
ok(wav && wav.byteLength > 400000, `preview WAV served from the cache (${wav.byteLength} bytes ≈ 3 s)`);
// 6. hover = preview
rowOf('Night Pad').dispatchEvent(new MouseEvent('mouseenter')); await until(() => SoundBank._test.playing() === pad.id && SoundBank._test.audio()?.src.startsWith('blob:'), 3000, 'hover preview');
ok(true, 'hovering a row plays its cached preview'); rowOf('Night Pad').dispatchEvent(new MouseEvent('mouseleave')); await until(() => SoundBank._test.playing() === null, 2000, 'stop on leave'); ok(SoundBank._test.audio().paused, 'leaving the row stops it');
// 7. click = loads live
await api.set({ level: 1, mono: false }); t0 = performance.now(); rowOf('Night Pad').click();
await until(() => Math.abs(api.get(['level']).level - .3) < 1e-6 && api.get(['mono']).mono === true, 8000, 'Night Pad loaded'); out.timings.clickToLiveMs = Math.round(performance.now() - t0);
await until(() => api.current().live, 4000, 'live'); ok(true, `click loads Night Pad into the live Vital (${out.timings.clickToLiveMs} ms) and it plays`);
// a plugin-folder preset loads too (read, never written): the fake ignores the .vital contents but takes the state
t0 = performance.now(); rowOf('PL Glass').click(); await until(() => SoundBank._test.loadedBy().get('Vital') === SoundBank._test.entries().find(x => x.name === 'PL Glass').id, 8000, 'PL Glass loaded'); ok(true, 'a plugin-folder preset loads live through the same path');
// 8. favorites
rowOf('Bright Keys').querySelector('.sb-star').click(); await until(() => SoundBank._test.entries().find(x => x.name === 'Bright Keys').favorite, 3000, 'favorite');
type('fav'); ok(rows().length === 1 && rowOf('Bright Keys'), '★ then "fav" → favorites only'); type('');
// 9. similar
rowOf('Night Pad').querySelector('.sb-sim').click(); await until(() => /Similar to “Night Pad”/.test(document.querySelector('.sb-status').textContent), 3000, 'similar');
ok(rows().length >= 3 && !rowOf('Night Pad') && rows().every(r => /≈ [\d.]+/.test(r.textContent)), `≈ lists the nearest sounds by distance (${rows().map(r => r.querySelector('.sb-name').textContent).join(', ')})`);
document.querySelector('.sb-status .sb-link').click(); await until(() => rows().length === 5, 2000, 'back to all');
// 10. drag onto the Park jam fold = load + used in the park sketch; a take while it plays = used in that take
const park = await until(() => document.querySelector('.wb-sound-desk .wb-park'), 8000, 'park fold'); const dt = new DataTransfer(); dt.setData('application/x-hearth-sound', pad.id);
rowOf('Night Pad').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
park.querySelector('summary').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
await until(async () => (await hub.soundbank.list({})).entries.find(x => x.id === pad.id)?.usedIn?.some(u => u.kind === 'sketch'), 8000, 'used in sketch');
ok(park.open && SoundBank._test.loadedBy().get('Vital') === pad.id, 'dropped on the Park jam fold: loaded live, the fold opens, "used in" the park sketch');
document.dispatchEvent(new CustomEvent('hearth:quest-week', { detail: { kind: 'park-jam', sketch: WorkbenchUI.snapshot().title, title: 'Belleville: 4-bar loop at 120 BPM', at: new Date().toISOString() } }));
await until(async () => (await hub.soundbank.list({})).entries.find(x => x.id === pad.id)?.usedIn?.some(u => u.kind === 'take'), 4000, 'used in take');
await SoundBank.refresh(); SoundBank.open(); await until(() => /used in 2/.test(rowOf('Night Pad')?.textContent || ''), 4000, 'used in shown'); ok(true, 'a park take recorded while it plays → "used in 2" on its row');
// 11. chat
const r1 = await Commands.tryRun('/sounds status', H.claudeAgent().id);
ok(r1 !== false, '/sounds status runs');
await SoundBank.command('dark'); ok(document.querySelector('.sb-search').value === 'dark', '/sounds <words> opens the picker searching them');
const loaded = await SoundBank.command('load bright keys'); ok(/Bright Keys is live/.test(loaded) && Math.abs(api.get(['level']).level - .8) < 1e-6, '/sounds load <name> plays it live');
ok(/5 presets/.test(await SoundBank.command('status')), '/sounds status counts');
// 12. read-only + zero idle
ok(await fingerprint() === before, 'the plugin preset folder is unchanged (read only)');
SoundBank.command('');
await wait(400);
out.result = `Sound bank with the fake host: ${out.checks.length} checks passed.`;
return JSON.stringify(out, null, 1);
