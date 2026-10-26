// ✦ Direction (round 67, direction67: tools/three-direction.js) in the app, on a throwaway scene made here and taken
// back at the end. Try 4 ways only opens the crew's plan (cost first) and cancels it: no engine runs.
//   node dev/smoke.js --script dev/checks/direction67.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
if (!H.agents().some((a) => a.dock === 'three')) { await Commands.tryRun('/director-setup three', H.agents()[0]?.id); await wait(1000); }
activate('tool:three'); await ThreeLab.cmd(); await until(() => ThreeLab.scenes, 15000);
await Lazy.load('labdirection');
// the first template plus a few named sliders, read every frame (so they're live)
const code = `${ThreeData.TEMPLATES[0].code}
const P = tweak({ speed: 1, count: 40, bloom: 0.5, tint: '#3366ff' });
(function loop() { void (P.speed + P.count + P.bloom + P.tint.length); requestAnimationFrame(loop); })();
`;
const sc = ThreeLab.scenes.create({ name: 'Direction check', code, open: true });
const TH = window.ThreeHistory;
try {
  await until(() => ThreeLab.scenes.currentId() === sc.id);
  await wait(1500);
  ok(await until(() => LabDirection.mountChip() && LabDirection.chip?.isConnected), 'the ✦ chip is in the Lab toolbar');
  out.chip = LabDirection.chip.textContent;
  LabDirection.chip.click();
  ok(LabDirection.card?.isConnected, 'a click opens the card');
  out.sections = [...LabDirection.card.querySelectorAll('.dir-sec-h b')].map((b) => b.textContent);
  ok(out.sections.length === 5, 'five parts: Try 4 ways, Mark it up, plain sliders, vision, branches');

  // plain sliders: busier moves the scene's values, the middle puts them back
  const before = JSON.stringify(ThreeLab.director.layers().layers.map((L) => ThreeLab.director.sliders(L.id)?.sliders?.map((s) => s.value)));
  LabDirection._S.dial.busy = 1; LabDirection._S.dial.warm = 0.8;
  await LabDirection.dial(false);
  await wait(300);
  const after = JSON.stringify(ThreeLab.director.layers().layers.map((L) => ThreeLab.director.sliders(L.id)?.sliders?.map((s) => s.value)));
  out.sliders = { params: LabDirection._S.base?.params.length, changed: before !== after };
  ok(LabDirection._S.base?.params.length >= 3 && before !== after, 'busier / warmer change the scene\'s sliders');
  LabDirection._S.dial = { busy: 0, warm: 0, harsh: 0 };
  await LabDirection.dial(false);
  await wait(300);
  const back = JSON.stringify(ThreeLab.director.layers().layers.map((L) => ThreeLab.director.sliders(L.id)?.sliders?.map((s) => s.value)));
  ok(back === before, 'back to the middle gives the values back');

  // Mark it up: the layer opens over the preview, a circle asks More of this / Wrong
  await LabDirection.markUp();
  const M = LabDirection.marking;
  ok(M?.layer?.isConnected && M.img.src.startsWith('data:'), 'Mark it up freezes the picture over the preview');
  const r = M.svg.getBoundingClientRect();
  const ev = (type, x, y) => M.svg.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 1, clientX: r.left + x * r.width, clientY: r.top + y * r.height }));
  ev('pointerdown', 0.3, 0.4); ev('pointermove', 0.38, 0.4); ev('pointerup', 0.38, 0.4);
  await wait(50);
  ok(M.marks.length === 1 && !M.pop.hidden, 'a dragged circle asks what it is');
  [...M.pop.querySelectorAll('button')].find((b) => b.textContent === 'Wrong').click();
  await wait(50);
  out.mark = { kind: M.marks[0]?.kind, svg: M.svg.querySelectorAll('circle.wrong').length, bar: M.bar.textContent.slice(0, 80) };
  ok(M.marks[0]?.kind === 'wrong' && out.mark.svg === 1, 'Wrong marks it red');
  ok(/Send to the director \(1\)/.test(M.bar.textContent), 'the bar offers Send to the director (1)');
  LabDirection.endMarking();
  ok(!document.querySelector('.dir-mk'), 'Cancel takes the layer away');

  // branches: two edits, back to the first, one more edit → two lines
  const s0 = await TH.stateOf('now', sc.id);
  const edit = (st, tag) => ({ ...st, layers: st.layers.map((L, i) => (i === 0 ? { ...L, code: `${L.code}\n// ${tag}` } : L)) });
  const v1 = (await TH.apply(sc.id, edit(s0, 'one'), { kind: 'pick', label: 'one' })).version;
  await TH.apply(sc.id, edit(s0, 'two'), { kind: 'pick', label: 'two' });
  await TH.restore(v1.id, { id: sc.id });
  await TH.apply(sc.id, edit(edit(s0, 'one'), 'three'), { kind: 'pick', label: 'three' });
  const br = await TH.branches(sc.id);
  out.branches = br.map((b) => `${b.label}${b.current ? ' *' : ''}`);
  ok(br.length === 2 && br[0].current && /three/.test(br[0].label) && /two/.test(br[1].label), 'going back and working on makes a second branch');
  await LabDirection.refreshBranches();
  ok(/2 lines in this scene/.test(LabDirection.card.textContent) && [...LabDirection.card.querySelectorAll('.dir-branch button')].some((b) => b.textContent === 'Go there'), 'the card lists the branches with Go there');
  const strip = (await TH.list(sc.id)).filter((v, i, l) => v.p && i > 0 && l[i - 1].id !== v.p);
  ok(strip.length >= 1, 'the time machine sees where a branch starts (⑂)');

  // the vision card: a frame, words; measured
  await LabDirection.addFrame(sc.id);
  const a = ThreeLab.scenes.extrasOf(sc.id)?.direction?.anchor;
  out.vision = { frames: a?.frames?.length, vibe: Boolean(a?.frames?.[0]?.vibe) };
  ok(a?.frames?.length === 1 && a.frames[0].vibe, 'Add this frame keeps a frame with its measured look');
  const th = await TH.thumbs(sc.id); const vid = Object.keys(th).pop();
  if (vid) await LabDirection.measure(sc.id, th[vid]);
  out.drift = LabDirection._S.drift.get(sc.id) || null;
  ok(!vid || out.drift?.word, 'a version\'s picture gets a drift word');

  // Try 4 ways: the crew's plan with 4 helpers and the 4 angles, cost first; cancelled here
  LabDirection._S.idea = 'neon tunnel';
  await LabDirection.tryFour();
  const c = ThreeCrew.current();
  out.crew = c && { status: c.status, n: c.n, angles: c.helpers.map((h) => h.angle.split(':')[0]), brief: c.brief.slice(0, 60) };
  ok(c?.status === 'plan' && c.n === 4 && /neon tunnel/.test(c.brief), 'Try 4 ways opens the crew\'s plan with 4 helpers (cost first)');
  ok(c && c.helpers.map((h) => h.angle).join('|') === DirCore.TRY_ANGLES.join('|'), '…each on a really different angle');
  ThreeCrew.cancel();
} catch (e) { fail.push(`threw: ${e.message}`); } finally {
  LabDirection.endMarking();
  LabDirection.close();
  try { ThreeCrew.cancel(); } catch { /* none */ }
  ThreeLab.scenes.remove(sc.id);
}
return { pass: !fail.length, fail, ...out };
