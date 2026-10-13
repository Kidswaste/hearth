// The Lab gallery (round 27, gallery): the first screen stays light (the gallery group loads on first use), the
// Lab's New opens it, 20+ built-in starting points in every mood + your scenes + the library, pictures drawn in ONE
// hidden preview page and kept on disk, search, hover preview, a new scene from one (no errors in the Lab), one added
// as layers, /gallery start, the new-chat starter's chip, the ◎ mission "Start from something like…" (pick → the
// director gets your words), and EVERY built-in starting point compiled and run in the preview page: drawn, no
// errors, sliders, something following the music, a picture that isn't black.
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/gallery.js --shot /tmp/gallery.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;
const lazyState = () => Lazy.state().find((g) => g.name === 'gallery')?.state;

step('first screen: the gallery group is not loaded yet (tier "use")', lazyState() === 'stub', lazyState());
await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
await SQL.lab();
await until(() => typeof LabGalleryHook !== 'undefined', 15000);
const dir = H.agents().find((a) => a.dock === 'three');
step('the ◎ mission "Start from something like…" is there for the Lab director (only)', Missions.shown(dir.id).some((m) => m.id === 'lab-start') && !Missions.shown(H.claudeAgent().id).some((m) => m.id === 'lab-start'));
step('still not loaded with the Lab open', lazyState() === 'stub', lazyState());

// ---------- the Lab's New opens the gallery ----------
await ThreeLab.act('newSketch');
const opened = await until(() => document.querySelector('dialog.lab-gal-dlg[open]'), 15000);
step('Lab: New sketch → the gallery (loaded on first use)', opened && lazyState() === 'loaded', lazyState());
await until(() => document.querySelectorAll('.lab-gal-card').length > 120, 8000);
const secs = [...document.querySelectorAll('.lab-gal-sec')].map((h) => h.textContent);
const starts = LabGallery.items().filter((x) => x.kind === 'start');
step('20+ built-in starting points, every mood shown', starts.length >= 20 && LabGalleryData.MOODS.every((m) => secs.includes(m.label)), { starts: starts.length, secs: secs.slice(0, 20) });
step('your scenes and the library are in it too (backgrounds, 3D, shaders, particles, type, nodes, code sketches)', ['Your scenes', 'Backgrounds', '3D scenes', 'Shaders', 'Particles', 'Kinetic type', 'Node presets', 'Code sketches'].every((s) => secs.includes(s)), secs);
step('one search box, mood chips', document.querySelector('.lab-gal-search') && document.querySelectorAll('.lab-gal-chip').length >= 8);
// pictures for the cards in view, one hidden page
const pics = await until(() => document.querySelectorAll('.lab-gal-pic.has').length >= 6, 45000);
const frames = document.querySelectorAll('.lab-gal-stage iframe').length;
step('pictures drawn for the cards in view (≥ 6), in ONE preview page', pics && frames === 1, { pictures: document.querySelectorAll('.lab-gal-pic.has').length, frames });
await smoke({ shot: '/tmp/gallery-open.png' });

// ---------- search, chips ----------
const search = document.querySelector('.lab-gal-search');
search.value = 'tunnel'; search.dispatchEvent(new Event('input'));
await wait(400);
const names = () => [...document.querySelectorAll('.lab-gal-card .lab-gal-name')].map((n) => n.textContent);
step('search "tunnel": the hyper tunnel first, other tunnels too', names()[0] === 'Hyper tunnel' && names().length >= 3, names().slice(0, 8));
search.value = 'something like a pink chrome blob'; search.dispatchEvent(new Event('input'));
await wait(400);
step('a sentence finds the best matches ("something like a pink chrome blob")', names().slice(0, 3).includes('Chrome blob'), names().slice(0, 6));
search.value = ''; search.dispatchEvent(new Event('input'));
await wait(300);
[...document.querySelectorAll('.lab-gal-chip')].find((b) => b.textContent.includes('Chrome & glossy'))?.click();
await wait(300);
step('a mood chip shows that mood only', names().length >= 4 && names().every((n) => starts.find((s) => s.name === n)?.group === 'chrome'), names());

// ---------- hover: the shared preview over the card ----------
const card = document.querySelector('.lab-gal-card');
card.dispatchEvent(new PointerEvent('pointerenter'));
const prev = await until(() => document.querySelector('.lab-gal-stage.on') && LabGallery.previewing, 12000);
const st = document.querySelector('.lab-gal-stage').getBoundingClientRect(); const pr = card.querySelector('.lab-gal-pic').getBoundingClientRect();
step('hover: the preview plays laid over the card', prev && Math.abs(st.left - pr.left) < 3 && Math.abs(st.width - pr.width) < 3, { stage: [st.left, st.top, st.width], pic: [pr.left, pr.top, pr.width] });
await wait(1200);
await smoke({ shot: '/tmp/gallery-hover.png' });
card.dispatchEvent(new PointerEvent('pointerleave'));
await wait(200);
step('leaving the card hides it', !document.querySelector('.lab-gal-stage.on'));

// ---------- a new scene from one ----------
const before = ThreeLab.scenes.all().length;
[...document.querySelectorAll('.lab-gal-chip')].find((b) => b.textContent === 'All')?.click();
await wait(200);
[...document.querySelectorAll('.lab-gal-card')].find((c) => c.querySelector('.lab-gal-name').textContent === 'Outrun sunset')?.click();
await until(() => ThreeLab.scenes.all().length > before && ThreeLab.director.report().sketch === 'Outrun sunset', 8000);
await wait(3500);
const rep = ThreeLab.director.report();
step('click: a new scene from it, opened, its 3 layers, no errors', !document.querySelector('dialog.lab-gal-dlg') && rep.sketch === 'Outrun sunset' && rep.layers.length === 3 && !rep.errors.length, { sketch: rep.sketch, layers: rep.layers.map((l) => l.name), errors: rep.errors });
await smoke({ shot: '/tmp/gallery-outrun.png' });
const sliders = rep.layers[0]?.sliders || [];
step('its sliders have plain names (Sky top, Grid speed, Kick lights the grid…)', ['Sky top', 'Grid speed', 'Kick lights the grid'].every((s) => sliders.includes(s)), sliders);

// ---------- as layers ----------
const n0 = ThreeLab.director.layers().layers.length;
const burst = LabGallery.items().find((x) => x.key === 'b:beat-burst');
await LabGallery.use(burst, 'layer');
await wait(2500);
const r2 = ThreeLab.director.report();
step('＋ Layer: its layers on top of the scene (its look filter left out)', r2.layers.length === n0 + 2 && r2.layers.at(-1).name === 'Beat burst' && !r2.errors.length, { layers: r2.layers.map((l) => l.name), errors: r2.errors });

// ---------- /gallery start ----------
await Commands.tryRun('/gallery start liquid gradient', dir.id);
await until(() => ThreeLab.director.report().sketch === 'Liquid gradient', 6000);
step('/gallery start <name>: a new scene right away', ThreeLab.director.report().sketch === 'Liquid gradient');

// ---------- the new-chat starter's chip ----------
store.set('scenes.draft.three', { id: ThreeLab.scenes.currentId(), tint: '#888888' });
LabGalleryHook.paintChip();
const chip = document.querySelector('.lab-gal-chip-start button');
step('a new chat\'s starter shows "Start from something like…" on the preview', chip?.offsetParent && /Start from something like/.test(chip.textContent));
chip?.click();
step('… which opens the gallery', await until(() => document.querySelector('dialog.lab-gal-dlg[open]'), 5000));
LabGallery.close();
store.set('scenes.draft.three', null);
LabGalleryHook.paintChip();

// ---------- the ◎ mission ----------
Missions.set?.(dir.id, 'lab-start');
const text = 'something like a chrome blob but slower and pink';
const handled = Missions.start(dir.id, 'lab-start', text);
await until(() => document.querySelector('dialog.lab-gal-dlg[open]'), 5000);
const q = document.querySelector('.lab-gal-search')?.value || '';
await wait(300);
const first = document.querySelector('.lab-gal-card .lab-gal-name')?.textContent;
step('mission: your words search the gallery', handled && q.includes('chrome blob') && first === 'Chrome blob', { q, first });
document.querySelector('.lab-gal-card')?.click();
const lastUser = () => (Native.chatOf(dir.id)?.messages || []).filter((m) => m.role === 'user').at(-1)?.text || '';
await until(() => /Started from "Chrome blob"/.test(lastUser()), 10000);
const sketchNow = ThreeLab.director.report().sketch;
step('mission: the picked scene opens, your words go to the director with what you started from', sketchNow.startsWith('Chrome blob') && /^🖼 Started from "Chrome blob"/.test(lastUser()) && lastUser().endsWith('slower and pink'), { sketch: sketchNow, sent: lastUser() });
await until(() => !Native.isBusy?.(H.activeChat[dir.id]), 30000);

// ---------- every built-in starting point runs ----------
const t0 = Date.now();
const res = await LabGallery.check({ settle: 500 });
const bad = res.filter((r) => !r.drawn || r.errors.length || r.missing || !r.music || r.sliders < 3 || !r.picture || (r.bright != null && r.bright < 4));
step(`every built-in starting point (${res.length}) runs: drawn, no errors, sliders, follows the music, not black`, res.length >= 20 && !bad.length, { bad, ms: Date.now() - t0, each: res.map((r) => `${r.id} b${r.bright} ${r.ms}ms`) });
step('pictures kept on disk (kv lab-gallery-thumbs)', LabGallery.cacheSize() >= 6, LabGallery.cacheSize());

out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out, null, 1);
