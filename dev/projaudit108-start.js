// (round 108, projaudit108) a project switched right after Hearth starts, before the Lab's code is in (lazy group 'lab'),
// by keys the way the owner does it (Ctrl/⌘+K, the project's name, Enter). Fixtures only (a throwaway profile).
//   setup     two projects, "Start Alpha" and "Start Beta", each with its own scene; the session ends in Alpha's Scene
//             (the Lab on Alpha's scene) and Beta's last view was its Scene too
//   restart   the window reloads (a start, the Lab's code held back); at once, while the Lab group isn't loaded: Ctrl/⌘+K › "Start Beta" › Enter
//             → Beta opens into the Lab on BETA's scene (not Alpha's, the one the Lab had last), and stays on it
//   again     a second start, the Lab loading by itself (it ended in the Lab): the switch to Alpha the same way →
//             Alpha's scene
//   node dev/smoke.js --no-lazy-wait --wait 800 --check-timeout 300000 --lib dev/projaudit108-lib.js --script dev/projaudit108-start.js
await Lazy.load('projects'); await Projects.ready();
const a = await ProjectWorkspace.create({ name: 'Start Alpha', plugins: [] });
const b = await ProjectWorkspace.create({ name: 'Start Beta', plugins: [] });
await ProjectWorkspace.go('scene');
await until(() => ThreeLab.scenes?.currentId() === b.workspace.sceneId, 20000);
await ProjectWorkspace.open(a.id, 'scene');
await until(() => H.activeId === 'tool:three' && ThreeLab.scenes?.currentId() === a.workspace.sceneId, 20000);
step('setup: two projects, each with its own scene; the Lab on Alpha\'s', a.workspace.sceneId !== b.workspace.sceneId && ThreeLab.scenes.currentId() === a.workspace.sceneId, { a: a.workspace.sceneId, b: b.workspace.sceneId });
await Projects.flush(); await wait(2500); // (the Lab's own saves: its current scene, the return points)
// (round 94, labload94) a start that ended in the Lab loads its code right after the first frame ('now'): for the first
// start it is held back ('none', as labload94 does), so the switch surely comes before the Lab is in; the second start
// is left as it is (the Lab loading by itself while the switch happens)
localStorage.setItem('lazy.lab.mode', 'none');
localStorage.setItem('pa108.start', JSON.stringify({ steps: out.steps, a: { id: a.id, name: a.name, scene: a.workspace.sceneId }, b: { id: b.id, name: b.name, scene: b.workspace.sceneId } }));
return '[PA108] setup done; next: a start';
//@@ reload
const S = JSON.parse(localStorage.getItem('pa108.start'));
out.steps.push(...S.steps);
const lab = () => Lazy.state().find((g) => g.name === 'lab')?.state;
async function switchAtStart(to, label) {
  await until(() => typeof H !== 'undefined' && H.agents().length && document.querySelector('#agent-buttons'), 60000, 20);
  const labAtSwitch = lab();
  const t0 = performance.now();
  await key('k', { ctrl: true });
  const input = await until(() => document.querySelector('.palette-input'), 8000, 20);
  if (input) { input.focus(); await typeText(to.name); }
  const row = await until(() => { const r = document.querySelector('.palette-item'); return r && /Project/.test(r.textContent) && r.textContent.includes(to.name) ? r : null; }, 15000, 40);
  if (row) await key('Enter');
  const ready = await until(() => ProjectWorkspace.state?.().phase === 'ready' && ProjectWorkspace.current()?.id === to.id && performance.now(), 60000, 50);
  const ms = ready ? Math.round(ready - t0) : null;
  // the Scene: the Lab on this project's scene (opened from its tab if the switch landed elsewhere)
  if (typeof ThreeLab === 'undefined' || H.activeId !== 'tool:three') { await ProjectWorkspace.go('scene').catch(() => {}); }
  const onIt = await until(() => H.activeId === 'tool:three' && ThreeLab.scenes?.currentId() === to.scene, 20000);
  await wait(5000); // (anything still on its way from the start: the Lab's own restore of its last scene)
  const after = { at: H.activeId, scene: typeof ThreeLab !== 'undefined' ? ThreeLab.scenes?.currentId() : null, project: ProjectWorkspace.current()?.id, phase: ProjectWorkspace.state().phase };
  step(`${label}: the Lab group not loaded yet when the switch began`, labAtSwitch !== 'loaded', { lab: labAtSwitch });
  step(`${label}: Ctrl/⌘+K › “${to.name}” › Enter opens that project`, Boolean(row) && ready, { ms, row: row?.textContent?.slice(0, 60), state: JSON.stringify(ProjectWorkspace.state()).slice(0, 240) });
  step(`${label}: …the Lab is on ${to.name}'s scene, and stays on it`, onIt && after.scene === to.scene && after.project === to.id && after.at === 'tool:three', { want: to.scene, after });
  return ms;
}
const ms1 = await switchAtStart(S.b, 'start (the Lab held back)');
localStorage.removeItem('lazy.lab.mode');
S.steps = out.steps; S.ms = [ms1];
localStorage.setItem('pa108.start', JSON.stringify(S));
return '[PA108] the first start done';
//@@ reload
const S = JSON.parse(localStorage.getItem('pa108.start'));
out.steps.push(...S.steps);
const lab = () => Lazy.state().find((g) => g.name === 'lab')?.state;
async function switchAtStart(to, label) {
  await until(() => typeof H !== 'undefined' && H.agents().length && document.querySelector('#agent-buttons'), 60000, 20);
  const labAtSwitch = lab();
  const t0 = performance.now();
  await key('k', { ctrl: true });
  const input = await until(() => document.querySelector('.palette-input'), 8000, 20);
  if (input) { input.focus(); await typeText(to.name); }
  const row = await until(() => { const r = document.querySelector('.palette-item'); return r && /Project/.test(r.textContent) && r.textContent.includes(to.name) ? r : null; }, 15000, 40);
  if (row) await key('Enter');
  const ready = await until(() => ProjectWorkspace.state?.().phase === 'ready' && ProjectWorkspace.current()?.id === to.id && performance.now(), 60000, 50);
  const ms = ready ? Math.round(ready - t0) : null;
  if (typeof ThreeLab === 'undefined' || H.activeId !== 'tool:three') { await ProjectWorkspace.go('scene').catch(() => {}); }
  const onIt = await until(() => H.activeId === 'tool:three' && ThreeLab.scenes?.currentId() === to.scene, 20000);
  await wait(5000);
  const after = { at: H.activeId, scene: typeof ThreeLab !== 'undefined' ? ThreeLab.scenes?.currentId() : null, project: ProjectWorkspace.current()?.id, phase: ProjectWorkspace.state().phase };
  step(`${label}: the Lab group's state when the switch began (noted)`, true, { lab: labAtSwitch });
  step(`${label}: Ctrl/⌘+K › “${to.name}” › Enter opens that project`, Boolean(row) && ready, { ms, row: row?.textContent?.slice(0, 60), state: JSON.stringify(ProjectWorkspace.state()).slice(0, 240) });
  step(`${label}: …the Lab is on ${to.name}'s scene, and stays on it`, onIt && after.scene === to.scene && after.project === to.id && after.at === 'tool:three', { want: to.scene, after });
  return ms;
}
const ms2 = await switchAtStart(S.a, 'again (the Lab loading by itself)');
step('slow steps (ms)', true, { switchAtStart: [...(S.ms || []), ms2] });
localStorage.removeItem('pa108.start');
out.fails = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.pass = !out.fails.length;
return JSON.stringify(out);
