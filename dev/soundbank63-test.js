// (round 63, soundbank63) Sound bank without the real plugins:
//   1. tools/soundbank-core.js: tags from fixture parameter sets (Serum-2-like and Vital-like labels) and a .vital file,
//      name words, similarity by parameter-vector distance, search, the Serum 2 JSON header, the AI batch prompt / parse.
//   2. soundbankmain.js: the bank index (sync, favorites, used in) written atomically (temp + rename; a failed write
//      leaves the old index whole; an unreadable index is kept aside), plugin folders READ-ONLY (every write is
//      checked to land in Hearth's own folder; the preset files' bytes and times unchanged), the preview queue one at
//      a time and cancelable (a stub host), then the REAL creative-vst-host.py with dev/fixtures/fake-vst-py rendering
//      cached previews (skipped plainly when python3 + numpy are missing).
//   node dev/soundbank63-test.js
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert/strict'), crypto = require('crypto');
const { spawnSync } = require('child_process');
const C = require('../tools/soundbank-core.js'), M = require('../soundbankmain.js'), V = require('../creative-vstmain.js');
const P = require('./fixtures/soundbank/params.json');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 20000, what = 'condition') => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw Error('timed out waiting for ' + what); await sleep(25); } };
const out = { checks: 0, skipped: [] }, ok = (v, msg) => { assert.ok(v, msg); out.checks++; if (process.env.SB_DEBUG) console.error("✓", msg); };
const has = (tags, ...want) => want.every(t => tags.includes(t));

// ---- 1. tags, similarity, search
const F = Object.fromEntries(Object.entries(P).filter(([k]) => k[0] !== '_').map(([k, list]) => [k, C.features(list)]));
const T = k => C.tagsOf({ features: F[k] });
ok(has(T('bass'), 'bass', 'dark', 'mono') && F.bass.transpose === -12 && Math.abs(F.bass.cutoff - .318) < .01, `bass from controls: ${T('bass')} (180 Hz cutoff on a log scale, octave −1, mono)`);
ok(has(T('pad'), 'pad', 'wide', 'wet', 'poly', 'soft') && F.pad.attack === .85 && F.pad.unison === 7, `pad: ${T('pad')} (850 ms attack, 7 unison voices, reverb)`);
ok(has(T('pluck'), 'pluck', 'bright', 'poly') && !T('pluck').includes('pad'), `pluck: ${T('pluck')} (1 ms attack, no sustain, 9 kHz)`);
ok(has(T('lead'), 'lead', 'mono') && F.lead.unison === 3 && F.lead.glide > 0, `lead: ${T('lead')} (mono + glide)`);
ok(has(T('keys'), 'keys', 'poly') && !T('keys').includes('pluck'), `keys: ${T('keys')} (fast attack, mid sustain, no unison)`);
ok(has(T('fx'), 'fx'), `fx: ${T('fx')} (noise)`);
ok(C.features([{ key: 'mono', label: 'Mono', value: false }, { key: 'reverb_on', label: 'Reverb On', value: false }, { key: 'reverb_mix', label: 'Reverb Mix', value: .9, min: 0, max: 1 }]).reverb === 0, 'an effect that is switched off counts as dry');
const vital = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/soundbank/PL Glass.vital'), 'utf8')), vf = C.vitalFeatures(vital);
ok(Math.abs(vf.attack - .3 ** 4) < 1e-3 && vf.cutoff === .875 && vf.poly === 8 && vf.mono === false && vf.reverb === .2, 'a .vital file: Vital units (envelope seconds = value⁴, cutoff in semitones, switches honoured)');
ok(has(C.tagsOf({ name: 'PL Glass', style: vital.preset_style, features: vf }), 'pluck', 'bright', 'poly'), 'the .vital file tagged pluck / bright / poly');
ok(C.tagsOf({ name: 'BA Reese Growl', features: F.pad }).filter(t => C.CATEGORIES.includes(t)).join() === 'bass', 'the name wins the category ("BA Reese" stays bass even with pad-like controls)');
ok(has(C.tagsOf({ name: 'LD_Screamer', folder: 'User / Leads' }), 'lead') && has(C.wordTags('KY Rhodes Dream'), 'keys') && has(C.wordTags('Sub 808 dark'), 'bass', 'dark'), 'name / folder words: LD_, Leads, KY Rhodes, Sub 808');
ok(C.tagsOf({ name: 'Dark Pad', features: F.pluck }).includes('dark') && !C.tagsOf({ name: 'Dark Pad', features: F.pluck }).includes('bright'), 'a name saying dark is never also tagged bright');
const E = Object.entries(F).map(([k, f]) => ({ id: k, name: k, instrument: k.startsWith('pad') || k === 'keys' ? 'Vital' : 'Serum 2', features: f, tags: T(k) }));
const sim = C.similar(E.find(x => x.id === 'pad'), E, 6);
ok(sim[0].id === 'pad2' && sim.every((x, i) => i === 0 || x.distance >= sim[i - 1].distance), `similar to pad: ${sim.map(x => `${x.id} ${x.distance}`).join(', ')}`);
ok(C.distance(E[0], E[0]) < C.distance(E[0], E.find(x => x.id === 'pluck')) && C.similar(E.find(x => x.id === 'bass'), E, 1)[0].id !== 'pad', 'distance: itself nearest; bass is not nearest to a pad');
const few = [{ id: 'a', name: 'a', tags: ['bass', 'dark'], features: { cutoff: .2 } }, { id: 'b', name: 'b', tags: ['bass', 'dark'], features: {} }, { id: 'c', name: 'c', tags: ['pad'], features: {} }];
ok(C.similar(few[0], few, 2)[0].id === 'b', 'with too few shared controls, tags decide');
const S = [{ id: 1, name: 'Reese Growl', instrument: 'Serum 2', source: 'bank', tags: ['bass', 'dark'], favorite: true }, { id: 2, name: 'Glass', instrument: 'Vital', source: 'plugin', folder: 'User', tags: ['pluck', 'bright'] }, { id: 3, name: 'Night Pad', instrument: 'Vital', source: 'hover', tags: ['pad', 'dark'], aiTags: ['wide'] }];
ok(C.search(S, 'dark').map(x => x.id).join() === '1,3' && C.search(S, 'dark bass').map(x => x.id).join() === '1' && C.search(S, 'fav').map(x => x.id).join() === '1', 'search: tags, several words, favorites');
ok(C.search(S, 'gla').map(x => x.id).join() === '2' && C.search(S, 'vital pad').map(x => x.id).join() === '3' && C.search(S, 'wide').map(x => x.id).join() === '3' && C.search(S, 'zzz').length === 0 && C.search(S, '').length === 3, 'search: name prefix, instrument, AI tags, nothing, everything');
const serum = Buffer.concat([Buffer.from('XferJson\0'), Buffer.from([0x48, 0, 0, 0]), Buffer.from('{"fileType":"SerumPreset","presetName":"Hollow Sub","presetAuthor":"me","tags":["Bass","Dark"],"x":"a}b"}'), Buffer.from([0x28, 0xb5, 0x2f, 0xfd, 1, 2, 3])]);
const meta = C.serumMeta(serum);
ok(meta.name === 'Hollow Sub' && meta.author === 'me' && meta.tags.join() === 'Bass,Dark' && C.serumMeta(Buffer.from('not a preset')) === null, 'a Serum 2 preset: name / author / tags from its JSON header (the compressed body is not read)');
const batch = E.map(x => ({ ...x, id: 'id-' + x.id })), prompt = C.aiPrompt(batch);
ok(prompt.length < 900 && prompt.split('\n').length === 2 + batch.length, `AI prompt: ${prompt.length} chars for ${batch.length} presets (one short line each)`);
const parsed = C.aiParse('Sure! {"1":["bass","DARK","nonsense"],"2":["pad"],"9":["lead"]}', batch);
ok(parsed['id-bass'].join() === 'bass,dark' && parsed['id-pad'].join() === 'pad' && Object.keys(parsed).length === 2 && Object.keys(C.aiParse('no json', batch)).length === 0, 'AI reply: only allowed tags, only the batch, prose tolerated');

// ---- 2. the main side
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-soundbank-'));
const mine = path.join(dir, 'data', 'creative-vst', 'soundbank');
const roots = { Vital: [path.join(dir, 'Documents', 'Vital', 'User', 'Presets')], 'Serum 2': [path.join(dir, 'Documents', 'Xfer', 'Serum 2 Presets', 'Presets', 'User')] };
fs.mkdirSync(path.join(roots.Vital[0], 'Plucks'), { recursive: true }); fs.mkdirSync(roots['Serum 2'][0], { recursive: true });
fs.copyFileSync(path.join(__dirname, 'fixtures/soundbank/PL Glass.vital'), path.join(roots.Vital[0], 'Plucks', 'PL Glass.vital'));
fs.writeFileSync(path.join(roots['Serum 2'][0], 'BA Hollow.SerumPreset'), serum); fs.writeFileSync(path.join(roots['Serum 2'][0], 'readme.txt'), 'not a preset');
const pluginFiles = () => Object.fromEntries([...fs.readdirSync(roots.Vital[0], { recursive: true }).map(f => path.join(roots.Vital[0], f)), ...fs.readdirSync(roots['Serum 2'][0]).map(f => path.join(roots['Serum 2'][0], f))].filter(f => fs.statSync(f).isFile()).map(f => [f, `${crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex')}:${fs.statSync(f).mtimeMs}`]));
const before = pluginFiles();
// every write the main side makes must land in its own folder (never in a plugin folder)
const writes = [], spy = {}; for (const fn of ['writeFileSync', 'renameSync', 'rmSync', 'unlinkSync', 'mkdirSync', 'copyFileSync', 'openSync']) { spy[fn] = fs[fn]; fs[fn] = function (p, ...rest) { if (fn !== 'openSync' || /[wa+]/.test(String(rest[0] || 'r'))) writes.push([fn, String(p), String(rest[0] ?? '')]); return spy[fn].call(this, p, ...rest); }; }
const defaults = M.defaultFolders({ OneDrive: 'C:\\Users\\me\\OneDrive' }, 'C:\\Users\\me', 'win32').map(f => f.path.replace(/\\/g, '/'));
ok(defaults.some(p => p.endsWith('Documents/Xfer/Serum 2 Presets/Presets/User')) && defaults.some(p => p.endsWith('Documents/Vital/User/Presets')) && defaults.some(p => p.includes('OneDrive/Documents/Vital')), 'Windows defaults: Documents\\Xfer\\Serum 2 Presets\\Presets\\User, Documents\\Vital\\User\\Presets (+ OneDrive Documents)');
const mac = M.defaultFolders({}, '/Users/me', 'darwin').map(f => f.path);
ok(mac.includes('/Users/me/Music/Vital/User/Presets') && mac.includes('/Users/me/Documents/Xfer/Serum 2 Presets/Presets/User') && mac.includes('/Users/me/Library/Audio/Presets/Xfer Records/Serum 2 Presets/Presets/User'), 'Mac defaults: ~/Music/Vital, both known Serum 2 places');

(async () => {
  let real = null, live = null;
  try {
    process.env.HEARTH_SOUNDBANK_ROOTS = JSON.stringify(roots);
    // a stub host: one at a time, cancelable
    let inflight = 0, maxInflight = 0, renders = 0, stops = 0, slow = 0;
    const stub = () => ({ scan: () => ({ ok: true, plugins: [{ name: 'Vital', path: '/x/Vital.vst3' }, { name: 'Serum 2', path: '/x/Serum2.vst3' }] }), stop: () => { stops++; },
      request: async r => { inflight++; maxInflight = Math.max(maxInflight, inflight); try { await sleep(slow || 15); if (r.action === 'inspect') return { ok: true, parameters: [] }; if (/^z1:/.test(r.state) && V.jobOf && Buffer.from('x')) { /* fine */ } renders++; if (r.state.length < 10) return { ok: false, error: 'bad state' }; return { ok: true, audio: Buffer.from('RIFF....WAVE').toString('base64'), peak: .4, silent: false, parameters: P.pad }; } finally { inflight--; } } });
    const sb = M.create({ dataDir: path.join(dir, 'data'), hostFactory: stub });
    const z = s => 'z1:' + require('zlib').deflateSync(Buffer.from(s)).toString('base64');
    const bank = [{ label: 'Night idea', name: 'Serum 2', path: '/x/Serum2.vst3', state: z('{"a":1}') }, { label: 'Soft Pad', name: 'Vital', path: '/x/Vital.vst3', state: z(JSON.stringify({ settings: vital.settings, preset_style: 'Pad' })), from: 'preset-hover' }, { label: 'Keys idea', name: 'Vital', path: '/x/Vital.vst3', state: z('{"x":2}'), features: F.keys }];
    let l = await sb.list({ bank });
    ok(l.entries.length === 3 && l.entries.find(x => x.name === 'Soft Pad').source === 'hover' && l.entries.find(x => x.name === 'Night idea').source === 'bank', 'the bank synced: 3 presets, the ✦ Preset window\'s marked');
    ok(has(l.entries.find(x => x.name === 'Soft Pad').tags, 'pad', 'pluck') === false && l.entries.find(x => x.name === 'Soft Pad').tags[0] === 'pad' && has(l.entries.find(x => x.name === 'Keys idea').tags, 'keys') && l.entries.find(x => x.name === 'Night idea').tags.length === 0, 'tags: Vital state JSON read (style Pad), desk-captured features (keys), an unknown state untagged until its preview');
    ok(!l.entries.some(x => x.source === 'plugin'), 'plugin folders are off until the owner opts in');
    sb.flush(); const ix1 = JSON.parse(spy.writeFileSync ? fs.readFileSync(path.join(mine, 'index.json'), 'utf8') : '{}');
    ok(ix1.v === 1 && Object.keys(ix1.entries).length === 3 && !fs.readdirSync(mine).some(f => f.endsWith('.tmp')), 'index.json written (temp + rename, no temp left)');
    const reese = l.entries.find(x => x.name === 'Night idea');
    sb.update(reese.id, { favorite: true }); sb.update(reese.id, { used: { kind: 'take', sketch: 'Park sketch · Belleville · 18 Oct', title: 'Belleville: 4-bar loop at 120 BPM' } }); sb.update(reese.id, { used: { kind: 'take', sketch: 'Park sketch · Belleville · 18 Oct', title: 'Belleville: 4-bar loop at 120 BPM' } });
    sb.flush(); let saved = JSON.parse(fs.readFileSync(path.join(mine, 'index.json'), 'utf8')).entries[reese.id];
    ok(saved.favorite === true && saved.usedIn.length === 1 && saved.usedIn[0].kind === 'take', 'favorite + "used in" (deduped) persisted');
    // a write that fails half way leaves the previous index whole
    const good = fs.readFileSync(path.join(mine, 'index.json'), 'utf8'), ws = fs.writeSync; fs.writeSync = () => { throw Object.assign(Error('disk full'), { code: 'ENOSPC' }); };
    sb.update(reese.id, { favorite: false }); let threw = false; try { sb.flush(); } catch { threw = true; } fs.writeSync = ws;
    ok(threw && fs.readFileSync(path.join(mine, 'index.json'), 'utf8') === good && !fs.readdirSync(mine).some(f => f.endsWith('.tmp')), 'a failed write (disk full) leaves the old index.json whole and no temp file');
    for (let i = 0; i < 40; i++) M.writeAtomic(path.join(mine, 'index.json'), JSON.stringify({ v: 1, i, entries: {} }));
    ok(JSON.parse(fs.readFileSync(path.join(mine, 'index.json'), 'utf8')).i === 39, '40 back-to-back atomic writes: the last one wins, the file always parses');
    fs.writeFileSync(path.join(mine, 'index.json'), '{"v":1,"entr'); const sb2 = M.create({ dataDir: path.join(dir, 'data'), hostFactory: stub }); l = await sb2.list({ bank });
    ok(l.entries.length === 3 && fs.existsSync(path.join(mine, 'index.json.unreadable')), 'an unreadable index is kept aside (index.json.unreadable) and rebuilt from the bank');
    sb2.stop(); sb.stop();
    // plugin folders, read-only
    const sb3 = M.create({ dataDir: path.join(dir, 'data'), hostFactory: stub });
    await sb3.list({ bank }); sb3.settings({ pluginFolders: true }); l = await sb3.list({ bank, scan: true });
    const glass = l.entries.find(x => x.source === 'plugin' && x.instrument === 'Vital'), hollow = l.entries.find(x => x.source === 'plugin' && x.instrument === 'Serum 2');
    ok(l.entries.filter(x => x.source === 'plugin').length === 2 && glass.folder === 'Plucks' && has(glass.tags, 'pluck', 'bright') && glass.author === 'Hearth test', `plugin folders: the .vital read (folder Plucks, tags ${glass.tags}), readme.txt ignored`);
    ok(hollow.name === 'Hollow Sub' && has(hollow.tags, 'bass', 'dark'), `a .SerumPreset named and tagged from its header: ${hollow.name} · ${hollow.tags}`);
    ok(l.folders.length === 2 && l.folders.every(f => f.exists), 'the folders read are listed for the ⋯ menu');
    const st = sb3.stateOf(glass.id); ok(st.ok && M.decodeState(st.state).toString() === fs.readFileSync(path.join(roots.Vital[0], 'Plucks', 'PL Glass.vital'), 'utf8'), 'loading a plugin-folder preset reads its bytes (as the desk\'s z1 state)');
    // the preview queue: one at a time, grouped per instrument, cancelable, errors kept per preset
    let q = sb3.startPreviews({ roots: [] });
    ok(q.running && q.total === 5, 'Make previews: 5 queued (3 bank + 2 plugin-folder)');
    await until(() => !sb3.status().running, 10000, 'queue to finish');
    l = await sb3.list({ bank }); const done = l.entries.filter(x => x.preview?.file);
    ok(maxInflight === 1 && done.length === 5 && stops >= 1, `rendered one at a time (max in flight ${maxInflight}), all 5 cached, the preview host stopped after the queue (${stops} stop)`);
    ok(done.every(x => fs.existsSync(path.join(mine, 'previews', x.preview.file))) && sb3.previewBytes(done[0].id).length > 0, 'preview WAVs cached in soundbank/previews and served');
    ok(has(l.entries.find(x => x.name === 'Night idea').tags, 'pad', 'wide') && l.entries.find(x => x.name === 'Night idea').featureSource === 'render', 'a preset with unknown state gets its tags from the rendered controls');
    const n0 = renders; q = sb3.startPreviews({}); ok(q.total === 0 && !q.running, 'previews are made once (cached): nothing queued the second time');
    // cancel mid-queue
    for (const x of l.entries) { const e = sb3._test.index().entries[x.id]; if (e.preview?.file) fs.rmSync(path.join(mine, 'previews', e.preview.file)); delete e.preview; }
    slow = 120; sb3.startPreviews({}); await sleep(150); const c = sb3.cancel(); await until(() => !sb3.status().running, 5000, 'cancel');
    ok(c.cancelled && renders - n0 <= 2 && sb3._test.index() && Object.values(sb3._test.index().entries).filter(x => x.preview?.file).length < 5, `cancel stops the queue and the preview host (${renders - n0} rendered before it stopped)`);
    sb3.settings({ pluginFolders: false }); l = await sb3.list({ bank }); ok(!l.entries.some(x => x.source === 'plugin'), 'plugin folders off: their presets leave the bank (the files stay where they are)');
    sb3.stop();
    // read-only proof
    const after = pluginFiles(), outside = writes.filter(([, p]) => !p.startsWith(mine) && !p.startsWith(path.join(dir, 'data', 'creative-vst', 'soundbank')));
    ok(JSON.stringify(after) === JSON.stringify(before), 'the plugin folders\' files are byte-for-byte and time-for-time unchanged');
    ok(!writes.some(([, p]) => p.startsWith(roots.Vital[0]) || p.startsWith(roots['Serum 2'][0])) && outside.length === 0, `every write (${writes.length}) landed in Hearth's own soundbank folder, none in a plugin folder`);
    for (const [fn, f] of Object.entries(spy)) fs[fn] = f;

    // ---- 3. the REAL host (fake Pedalboard): a preview rendered from a bank state, a separate process, cached
    const py = spawnSync('python3', ['-c', 'import numpy, sys; print(sys.executable)'], { encoding: 'utf8' }), PY = (py.stdout || '').trim();
    if (py.status !== 0) { out.skipped.push('real host part: python3 with numpy not found here'); return; }
    Object.assign(process.env, { PYTHONPATH: path.join(__dirname, 'fixtures', 'fake-vst-py'), PYTHONDONTWRITEBYTECODE: '1', FAKE_MIDI_NOTE: '0' });
    const proot = path.join(dir, 'plugins'); fs.mkdirSync(path.join(proot, 'Vital.vst3'), { recursive: true });
    live = V.pool({ dataDir: path.join(dir, 'data'), python: PY, roots: [proot] }); live.scan([]);
    const realBank = M.create({ dataDir: path.join(dir, 'data2'), hostFactory: () => V.create({ dataDir: path.join(dir, 'data2'), python: PY, roots: [proot], lowPriority: true }) });
    real = realBank;
    const vitalPath = path.join(proot, 'Vital.vst3');
    // a live instrument playing meanwhile, in its own host
    let r = await live.request({ action: 'open', plugin: vitalPath, name: 'Vital', live: true, buffer: 256 }); ok(r.ok && r.playing, 'a live Vital plays in its own host');
    await live.request({ action: 'sequence', plugin: vitalPath, sequence: [{ note: 60, time: 0, length: .2 }], loop: 1 });
    const state = 'z1:' + require('zlib').deflateSync(Buffer.from(JSON.stringify({ level: .9, wave: 1 }))).toString('base64');
    await realBank.list({ bank: [{ label: 'Loud Saw', name: 'Vital', path: vitalPath, state }] });
    const pre = await live.request({ action: 'live-status', plugin: vitalPath });
    realBank.startPreviews({ roots: [] }); await until(() => !realBank.status().running, 30000, 'real preview');
    const post = await live.request({ action: 'live-status', plugin: vitalPath });
    const e1 = Object.values(realBank._test.index().entries)[0];
    ok(e1.preview?.file && !e1.preview.silent && e1.preview.peak > .05, `the real host rendered a 3-s preview from the bank state (peak ${e1.preview?.peak}, ${e1.preview?.ms} ms)`);
    const wav = realBank.previewBytes(e1.id); ok(wav.subarray(0, 4).toString() === 'RIFF' && Math.abs(wav.length - 44 - 3 * 44100 * 4) < 4096, `preview WAV: ${wav.length} bytes ≈ 3 s stereo 16-bit`);
    ok(post.playing && post.blocks > pre.blocks && post.device === pre.device, `the live instrument kept playing in its own host while the preview rendered (${post.blocks - pre.blocks} blocks, ${post.underruns - pre.underruns} underruns)`);
    ok(fs.readdirSync(path.join(dir, 'data2', 'creative-vst')).filter(f => f.startsWith('session-')).length === 0 || await until(() => fs.readdirSync(path.join(dir, 'data2', 'creative-vst')).filter(f => f.startsWith('session-')).length === 0, 4000, 'preview host gone'), 'the preview host process stopped after the queue (zero idle cost)');
    await live.request({ action: 'live-stop', plugin: vitalPath }); live.stop();
  } finally {
    real?.stop(); live?.stop(); delete process.env.HEARTH_SOUNDBANK_ROOTS; await sleep(200); fs.rmSync(dir, { recursive: true, force: true });
  }
  out.result = `Sound bank: ${out.checks} checks passed (tags, similarity, search, Serum header, AI batch, atomic index, read-only plugin folders, preview queue${out.skipped.length ? '' : ', real host'}).`;
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exitCode = 1; });
