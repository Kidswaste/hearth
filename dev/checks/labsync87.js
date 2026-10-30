// (round 87, labsync87) The Lab's work arriving from the other computer, in the app, through the real sync engine (a
// temp cloud folder; "the Mac" writes its version into the cloud copy as its sync would, then Sync now pulls it — the
// engine's own sync:pulled → hearth:synced → StoreAck → the Lab):
//  1. the scene on screen changed on the Mac (nothing typed here) → its new code is in the editor
//  2. a reference added on the Mac to the scene on screen (its picture in refs/, its line in three-refs) → the Lab reads
//     it and runs the scene again (before: it waited for the next scene switch)
//  3. a scene deleted on the Mac → it leaves the picker AND is in this Lab's trash (History → Deleted sketches; before:
//     only in a copy kept aside); the Mac's own trash entry arriving later takes the place of the one made here
//  4. Lab presets: a trigger preset saved on the Mac shows in this Lab's Presets menu list; a palette saved here reaches
//     the cloud copy (kv/lab-presets.json); one deleted on the Mac goes here too
//   node dev/smoke.js --check-timeout 240000 --lib dev/checks/journey-lib.js --script dev/checks/labsync87.js
const { step, wait, until } = J;
const ls = (k, d) => { try { const v = localStorage.getItem(`hub.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } }; // the Lab's storage (ui.js store)
const api = window.hub.sync;
const CLOUD = `/tmp/hearth-labsync87-${Date.now()}`;
const MAC = { id: 'studio-mac-87c4d5e6', name: 'Studio Mac', platform: 'darwin', dataDir: '/Users/q/Library/Application Support/Hearth/data', home: '/Users/q', lastSeen: Date.now() - 60000, lastOk: Date.now() - 60000 };
await window.hub.fs.write(`${CLOUD}/Hearth/.sync/machines/${MAC.id}.json`, JSON.stringify(MAC));
await window.hub.fs.write(`${CLOUD}/Hearth/files/.keep-folder`, '');
await api.on({ root: CLOUD });
await Sync.refresh();
await until(() => Sync.status().state === 'synced', 20000);
await wait(1200);
const gotIt = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Got it' && J.visible(b));
if (gotIt) { gotIt.click(); await wait(300); }
const syncNow = async () => { await Sync.now(); await wait(600); };
const cloudOf = (rel) => `${CLOUD}/Hearth/files/${rel}`;
const cloudJson = async (rel) => { try { if (!(await window.hub.fs.stat(cloudOf(rel)).catch(() => null))?.size) return null; return JSON.parse(await window.hub.fs.read(cloudOf(rel))); } catch { return null; } }; // (not read before it's there: a read of a missing file is logged)
const macEdit = async (rel, fn) => { const v = fn(await cloudJson(rel)); await window.hub.fs.write(cloudOf(rel), JSON.stringify(v, null, 2)); };
// the Lab
activate('tool:three');
await until(() => window.ThreeLab?.scenes?.all?.().length > 0 && ThreeLab.scenes.currentId() && ThreeLab.director, 40000);
const S = ThreeLab.scenes;
const base = S.get(S.currentId()).code;
const made = S.create({ name: 'Synced scene', code: `${base}\n// uses refTexture('paint') when it's here`, open: true });
await until(() => S.currentId() === made.id, 8000);
const other = S.create({ name: 'Deleted on the Mac', code: `${base}\n// to be deleted on the Mac` });
await wait(1500); await syncNow();
await until(async () => (await cloudJson('kv/three-sketches.json') || []).some((x) => x.id === other.id), 20000);
let ran = 0; addEventListener('hearth:lab-ran', () => { ran += 1; });

// ---------- 1. the scene on screen changed on the Mac ----------
await macEdit('kv/three-sketches.json', (l) => l.map((x) => (x.id === made.id ? { ...x, code: `${x.code}\n// edited on the Mac`, ...(x.layers ? { layers: x.layers.map((L, i) => (i ? L : { ...L, code: `${L.code}\n// edited on the Mac` })) } : {}), updatedAt: Date.now() + 1000 } : x)));
await syncNow();
const ed = () => ThreeLab.peek?.()?.editor?.value ?? document.querySelector('.three-lab textarea, .lab-editor textarea')?.value ?? '';
await until(() => /edited on the Mac/.test(JSON.stringify(S.get(made.id))), 20000);
step('the scene on screen, changed on the Mac: its new code is here', /edited on the Mac/.test(JSON.stringify(S.get(made.id))) && S.currentId() === made.id, { cur: S.currentId(), editor: ed().slice(-60) });

// ---------- 2. a reference added on the Mac to the scene on screen ----------
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
const refName = `${Date.now()}-paint.png`;
await window.hub.fs.write(cloudOf(`refs/${refName}`), PNG, { base64: true });
await wait(2300); // (a picture is read once it has stood its 2 s in the cloud folder)
const ran0 = ran;
await macEdit('kv/three-refs.json', (r) => ({ ...(r || {}), [made.id]: [...((r || {})[made.id] || []), { id: 'rmac87', key: 'paint', name: 'paint.png', kind: 'image', path: `hearth-data:/refs/${refName}`, size: 68, at: Date.now() }] }));
await syncNow();
await until(() => (ThreeLab.director.refs.list() || []).some((r) => r.key === 'paint'), 20000);
const ref = (ThreeLab.director.refs.list() || []).find((r) => r.key === 'paint');
step('a reference added on the Mac is in the scene\'s references here, at this computer\'s path', Boolean(ref) && !/^hearth-/.test(ref.path) && (await window.hub.fs.stat(ref.path))?.size > 0, ref);
await until(() => ran > ran0, 10000);
step('…and the scene on screen runs again with it (no scene switch needed)', ran > ran0, { ran, ran0 });

// ---------- 3. a scene deleted on the Mac ----------
const trashIds = () => { try { return (ThreeLab.scenes.wasDeleted(other.id)); } catch { return false; } };
await macEdit('kv/three-sketches.json', (l) => l.filter((x) => x.id !== other.id));
await syncNow();
await until(() => !S.get(other.id), 20000);
await until(() => trashIds(), 5000);
step('a scene deleted on the Mac leaves the picker…', !S.get(other.id));
step('…and is in this Lab\'s trash (History → Deleted sketches), restorable', S.wasDeleted(other.id));
await wait(1800); await syncNow();
const hist = await cloudJson('kv/three-history.json');
step('this computer\'s trash entry for it reaches the cloud copy (the Mac sees it too)', (hist?.trash || []).some((t) => t.id === other.id), (hist?.trash || []).map((t) => [t.id, t.there]));

// ---------- 4. Lab presets ----------
await until(() => window.LabPresets && (ls('three.presetsKnown', null) !== null), 15000);
await macEdit('kv/lab-presets.json', (x) => ({ ...(x || { v: 1 }), items: { ...(x?.items || {}), pmac87: { kind: 'trig', name: 'Mac groove', data: JSON.stringify({ kick: { lo: 40, hi: 120 } }), at: Date.now() } } }));
await syncNow();
await until(() => ls('three.trigPresets', []).some((p) => p.name === 'Mac groove'), 20000);
step('a trigger preset saved on the Mac is in this Lab\'s presets', ls('three.trigPresets', []).some((p) => p.name === 'Mac groove'), ls('three.trigPresets', []));
localStorage.setItem('hub.three.palettes', JSON.stringify([{ name: 'PC dusk', colors: ['#112233', '#ff8800'] }, ...ls('three.palettes', [])])); window.LabPresets?.changed?.();
await wait(900); await syncNow();
await until(async () => Object.values((await cloudJson('kv/lab-presets.json'))?.items || {}).some((it) => it.name === 'PC dusk'), 20000);
step('a palette saved here reaches the cloud copy', Object.values((await cloudJson('kv/lab-presets.json'))?.items || {}).some((it) => it.name === 'PC dusk'));
await macEdit('kv/lab-presets.json', (x) => { const items = { ...x.items }; delete items.pmac87; return { ...x, items }; });
await syncNow();
await until(() => !ls('three.trigPresets', []).some((p) => p.name === 'Mac groove'), 20000);
step('a preset deleted on the Mac goes here too', !ls('three.trigPresets', []).some((p) => p.name === 'Mac groove'), ls('three.trigPresets', []));

await api.off();
return J.done();
