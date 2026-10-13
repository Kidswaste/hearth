// ✦ Describe it (round 29, instantscene): a scene from your words with 0 tokens. The first screen stays light (the
// window loads with the gallery group on first use); the ◎ mission "Make it from my words" opens 3 different picks
// with pictures and what was matched; a pick opens as a new scene that runs without errors, with the look on top, the
// palette and the sliders from the words and the music reaction; the card offers the director (cost first, nothing
// sent until you say so); closing without a pick gives your words back; the gallery's search offers "Make it from my
// words"; /describe make; picks of other kinds (particles, type) run too; the empty Lab shows "✦ Describe it".
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/instantscene.js --shot /tmp/instant.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;
const lazyState = () => Lazy.state().find((g) => g.name === 'gallery')?.state;

step('first screen: the gallery group (Describe it\'s window) is not loaded yet', lazyState() === 'stub', lazyState());
await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
await SQL.lab();
await until(() => typeof LabInstantHook !== 'undefined', 15000);
const dir = H.agents().find((a) => a.dock === 'three');
step('the ◎ mission "Make it from my words" is there for the Lab director only', Missions.shown(dir.id).some((m) => m.id === 'lab-describe') && !Missions.shown(H.claudeAgent().id).some((m) => m.id === 'lab-describe'));
step('✦ More › ✨ Look & motion has "✦ Describe it…" (the /describe command is placed)', typeof LabEasy === 'undefined' || !LabEasy.placed || LabEasy.placed().has('describe'));

// ---------- the mission: 3 picks ----------
const text = 'dreamy pink chrome tunnel that pulses on the kick, slow';
const handled = Missions.start(dir.id, 'lab-describe', text);
const opened = await until(() => document.querySelector('dialog.lab-inst-dlg[open]') && document.querySelectorAll('.lab-inst-card').length === 3, 20000);
step('mission: the window opens with 3 picks (the gallery group loaded on first use)', handled && opened && lazyState() === 'loaded', { lazy: lazyState() });
const picks = LabInstant.picks;
step('3 different picks, each with what was matched and why', new Set(picks.map((p) => p.base.key)).size === 3 && picks.every((p) => p.why.length >= 3), picks.map((p) => `${p.name} ← ${p.base.name}: ${p.why.join(' · ')}`));
const readTxt = document.querySelector('.lab-inst-read')?.textContent || '';
step('it says what it understood (pink, chrome, tunnel, slow, kick…)', ['pink', 'chrome', 'tunnel', 'slow', 'kick'].every((w) => readTxt.includes(w)), readTxt);
const drawn = await until(() => document.querySelectorAll('.lab-inst-pic.has:not(.base)').length >= 3, 90000);
step('each of the 3 picks is drawn as it will open (the gallery\'s one shared page)', drawn && document.querySelectorAll('.lab-gal-stage iframe').length === 1, { drawn: document.querySelectorAll('.lab-inst-pic.has:not(.base)').length, err: LabInstant.drawErr });
await smoke({ shot: '/tmp/instant-picks.png' });

// typing changes the picks at once (no tokens, no wait)
const input = document.querySelector('.lab-inst-input');
input.value = 'neon synthwave grid, fast'; input.dispatchEvent(new Event('input'));
await wait(400);
step('typing other words: other picks, at once', LabInstant.picks[0]?.base.name === 'Outrun sunset', LabInstant.picks.map((p) => p.base.name));
input.value = text; input.dispatchEvent(new Event('input'));
await wait(400);

// ---------- a pick → a new scene ----------
const before = ThreeLab.scenes.all().length;
const pick = LabInstant.picks[0];
document.querySelector('.lab-inst-card[data-i="0"]').click();
await until(() => ThreeLab.scenes.all().length > before && ThreeLab.director.report().sketch?.startsWith(pick.name), 10000);
await until(() => LabInstant.last?.react || Date.now() < 0, 9000);
// the Lab's preview really draws it (not the scene before: more than the starter's one cube)
const drew = await until(() => { const st = ThreeLab.director.report().stats; return st && typeof st === 'object' && (st.triangles !== 12 || st.geometries > 1); }, 40000);
await wait(1000);
const rep = ThreeLab.director.report();
const names = rep.layers.map((l) => l.name);
step('click: a new scene from your words, drawn in the Lab, running without errors', drew && rep.sketch?.startsWith(pick.name) && !rep.errors.length && !document.querySelector('dialog.lab-inst-dlg'), { sketch: rep.sketch, layers: names, errors: rep.errors, drew, stats: rep.stats });
step('the matched look on top (◐ Grade)', !pick.grade || names.at(-1) === '◐ Grade', { grade: pick.grade?.name, top: names.at(-1) });
const pal = ThreeLab.director.refs?.palette?.() || [];
step('your colors are the sketch palette', pick.palette && pal.join() === pick.palette.colors.join(), { pal, want: pick.palette?.colors });
const subj = LabInstant.layersOf(pick).filter((L) => !L.filter);
step('sliders set from the words (colors, slow speed, the kick)', subj.some((L) => L.changed > 2), subj.map((L) => `${L.name}: ${L.changed} changed`));
step('the music reaction from the words ("pulses on the kick" → Pump on kick)', LabInstant.last?.react?.preset === 'Pump on kick', LabInstant.last?.react);
await smoke({ shot: '/tmp/instant-scene.png' });

// ---------- the director, only if you want (cost first) ----------
const askBtn = document.querySelector('.lab-inst-made .lab-inst-ask');
step('the card offers the director with the cost on the button', askBtn && /≈\d+ tokens/.test(askBtn.textContent), askBtn?.textContent);
const userMsgs = () => (Native.chatOf(dir.id)?.messages || []).filter((m) => m.role === 'user');
const n0 = userMsgs().length;
askBtn?.click();
await until(() => document.querySelector('dialog.ui-modal[open]'), 4000);
const dlgBox = document.querySelector('dialog.ui-modal[open]');
const modalText = dlgBox?.textContent || '';
[...(dlgBox?.querySelectorAll('button') || [])].find((b) => /cancel/i.test(b.textContent))?.click();
await wait(400);
step('asking shows the cost first; Cancel sends nothing', /≈\d+ tokens/.test(modalText) && userMsgs().length === n0, modalText.slice(0, 200));
await LabInstant.ask({ confirm: false });
await until(() => userMsgs().length > n0, 8000);
step('… and once you say yes, your words and what was made go to the director', /Made from my words/.test(userMsgs().at(-1)?.text || '') && userMsgs().at(-1).text.includes(pick.base.name), (userMsgs().at(-1)?.text || '').slice(0, 300));
await until(() => !Native.isBusy?.(H.activeChat[dir.id]), 30000);

// ---------- closing without a pick ----------
let got = 'none';
await LabInstant.open({ text: 'warm gold blob', onPick: (p) => { got = p; } });
LabInstant.close();
step('closing without a pick: nothing made (the mission puts your words back)', got === null);

// ---------- the gallery's search ----------
await LabGallery.open({ query: 'slow neon grid that pulses on the kick' });
await until(() => document.querySelector('.lab-inst-galrow'), 5000);
const row = document.querySelector('.lab-inst-galrow');
step('the gallery\'s search offers "✦ Make it from my words" when it reads like a description', row && /Make it from my words/.test(row.textContent));
row?.click();
await until(() => document.querySelector('dialog.lab-inst-dlg[open]'), 5000);
step('… which opens Describe it with those words', document.querySelector('.lab-inst-input')?.value === 'slow neon grid that pulses on the kick' && !document.querySelector('dialog.lab-gal-dlg:not(.lab-inst-dlg)'));
LabInstant.close();
await LabGallery.open({ query: 'tunnel' });
await wait(300);
step('a one-word search stays a plain search (no row)', !document.querySelector('.lab-inst-galrow'));
LabGallery.close();

// ---------- /describe make, and other kinds of picks ----------
const said = [];
await Commands.tryRun('/describe make neon tunnel, fast', dir.id, undefined, { say: (t) => said.push(t) });
await wait(3000);
const r3 = ThreeLab.director.report();
step('/describe make <words>: the first pick at once, no errors', /New scene/.test(said.join(' ')) && !r3.errors.length, { said, sketch: r3.sketch, errors: r3.errors });
const kinds = [];
for (const [words, kind] of [['glowing fireflies drifting, slow', 'particles'], ['"FRIDAY" typewriter title', 'type'], ['bouncing balls on the beat', 'physics']]) {
  const p = LabInstant.plan(words).picks.find((x) => x.base.kind === kind);
  if (!p) { kinds.push({ kind, missing: true }); continue; }
  await LabInstant.make(p, words);
  await wait(3500);
  const r = ThreeLab.director.report();
  kinds.push({ kind, base: p.base.name, layers: r.layers.map((l) => l.name), errors: r.errors.slice(0, 3) });
}
step('picks of other kinds (particles, type, physics) run without errors', kinds.every((k) => !k.missing && !k.errors.length), kinds);

// ---------- the empty Lab ----------
const shape = ThreeLayers.TEMPLATES.find((x) => x.id === 'empty');
const blank = ThreeLab.scenes.create({ name: 'Blank test', code: shape.code, layers: [ThreeLayers.defaults({ name: 'Shape', code: shape.code, slot: 0 })] });
ThreeLab.director.openSketch(blank.id);
await wait(1200);
step('another scene on screen: the "made from your words" card goes', !document.querySelector('.lab-inst-made'));
LabInstantHook.paint();
await until(() => document.querySelector('.lab-inst-empty .lab-inst-start'), 3000);
const chip = document.querySelector('.lab-inst-empty .lab-inst-start');
step('the empty Lab (just the plain Shape) shows "✦ Describe it"', chip?.offsetParent && /Describe it/.test(chip.textContent));
chip?.click();
step('… which opens the window', await until(() => document.querySelector('dialog.lab-inst-dlg[open]'), 5000));
LabInstant.close();
await smoke({ shot: '/tmp/instant-empty.png' });

out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out, null, 1);
