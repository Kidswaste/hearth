// (round 154, mem154) Hearth lighter in memory (docs/upgrades/mem154.md), ONE check of the wins, tolerant of box
// variance. Its own temp data and a fixture scene (realscene-lib); never an owner's scene.
//   idle      a project chat open, idle: ≤ 4 processes, every process' working set together ≤ 850 MB (≈ 625 here)
//   playing   the Lab plays the real scene, then a chat is shown: the Lab does NOT rest while the song plays
//   rest      the song stopped, the Lab unseen past its rest time (lab.restMs, 6 s here; 5 min for the owner): its
//             preview page is let go (no three-sandbox frame, one process less, ≥ 150 MB less in all), the scene's
//             code kept
//   wake      an AI call on the scene (three_layers) brings the page back first and answers; the code is unchanged
//   show      showing the Lab runs its preview again
//   trim      Hearth hidden: the main process asks the window to trim its caches (HEARTH_TRIM_MS = 5 s in the check);
//             a draft typed before is still there after, the window shows again
//   warm      the warm preview page is let go after 5 minutes (not 15)
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/mem154.js
const out = { steps: [], measure: {} };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const T = (o) => window.hub.power.test(o);
const mem = async () => {
  try { await smoke({ cdp: 'HeapProfiler.collectGarbage' }); } catch { /* none */ }
  await wait(1500);
  const m = (await T({ metrics: true, mem: true }))?.metrics || { procs: [], pages: [] };
  const mb = Math.round(m.procs.reduce((s, q) => s + (q.mem || 0), 0) / 1024);
  return { mb, n: m.procs.length, sandbox: m.pages.some((p) => /three-sandbox/.test(p.url)), procs: m.procs.map((q) => `${q.type}${q.name ? ` ${q.name}` : ''} ${Math.round((q.mem || 0) / 1024)}`) };
};

try {
  await until(() => window.hub && performance.getEntriesByName('hearth:ready').length, 60000);
  localStorage.setItem('lab.restMs', '6000');
  if (window.Lazy && !Lazy.loaded('projects')) await Lazy.load('projects');
  await Projects.ready(); await until(() => ProjChats._ok(), 20000);
  const proj = Projects.create({ name: 'Mem154 project' }); ProjChats.setScope(proj.id);
  const claude = H.claudeAgent();
  activate(claude.id); await wait(300); Native.newChat(claude.id); await wait(200);
  await Native.send(claude.id, 'hello there, a short reply please');
  await until(() => !Native.isAgentBusy(claude.id), 30000);
  document.activeElement?.blur?.();
  await until(() => performance.now() > 45000, 90000);

  // ---------- idle ----------
  const idle = await mem(); out.measure.idle = idle;
  step('idle: a project chat open, ≤ 4 processes, every working set together ≤ 850 MB', idle.n <= 4 && idle.mb <= 850, { mb: idle.mb, n: idle.n, procs: idle.procs });

  // ---------- playing: never rests ----------
  activate('tool:three');
  await until(() => typeof ThreeLab !== 'undefined' && ThreeLab.director && ThreeLab.rest, 60000);
  await RS.open({ size: [320, 180], particles: 4 });
  await wait(3000);
  const labOn = await mem(); out.measure.lab = labOn;
  const c = await ThreeLab.cmd();
  activate(claude.id);
  await wait(12000);
  const whilePlaying = ThreeLab.rest.state();
  step('playing: the Lab unseen while its song plays is not let go', c.state.playing && whilePlaying.rested === 0 && !ThreeLab.workspace.state().released, { playing: c.state.playing, rest: whilePlaying });

  // ---------- rest ----------
  const codeNow = () => { const g = ThreeLab.director.getCode(); return JSON.stringify({ layers: (g.layers || []).map((L) => L.name), code: g.code, lines: g.lines }); };
  const code0 = codeNow();
  c.play(false);
  const rested = await until(() => ThreeLab.workspace.state().released && ThreeLab.rest.state().rested >= 1, 40000, 300);
  await wait(3000);
  const after = await mem(); out.measure.rested = after;
  step('rest: the song stopped and the Lab unseen past lab.restMs: its preview page is let go', Boolean(rested) && !after.sandbox, ThreeLab.rest.state());
  step('rest: one process less and ≥ 150 MB less than with the Lab on', after.n <= labOn.n - 1 && after.mb <= labOn.mb - 150, { lab: { mb: labOn.mb, n: labOn.n }, rested: { mb: after.mb, n: after.n } });

  // ---------- wake: an AI call ----------
  const r = await HubBridge.call('three_layers', {});
  const st = ThreeLab.workspace.state();
  step('wake: an AI call on the rested scene brings its page back first and answers', r?.ok !== false && !st.released && ThreeLab.rest.state().woke >= 1, { ok: r?.ok, error: r?.error, ws: st, rest: ThreeLab.rest.state() });
  const code1 = codeNow();
  step('wake: the scene\'s layers and code are unchanged', code1 === code0, code1 === code0 ? undefined : { before: code0.slice(0, 200), after: code1.slice(0, 200) });

  // ---------- show: the Lab runs again ----------
  await until(() => ThreeLab.workspace.state().released && ThreeLab.rest.state().rested >= 2, 40000, 300); // (rests again, unseen)
  activate('tool:three');
  const back = await until(() => !ThreeLab.workspace.state().released && ThreeLab.workspace.state().ready, 30000, 200);
  step('show: showing the Lab runs its preview again', Boolean(back), { ws: ThreeLab.workspace.state(), rest: ThreeLab.rest.state() });

  // ---------- trim: Hearth hidden ----------
  activate(claude.id); await wait(500);
  const draft = `mem154 draft ${Date.now()}`;
  const box = document.querySelector('.surface.active textarea') || document.querySelector('textarea');
  if (box) { box.focus(); box.value = draft; box.dispatchEvent(new Event('input', { bubbles: true })); box.blur(); }
  const t0 = (await T({ memtrim: true }))?.memtrim?.trims || 0;
  await T({ window: 'hide' });
  await until(() => document.visibilityState === 'hidden', 5000);
  const trimmed = await until(async () => ((await T({ memtrim: true }))?.memtrim?.trims || 0) > t0, 20000, 500);
  await T({ window: 'show' }); await until(() => document.visibilityState === 'visible', 5000); await wait(800);
  const box2 = document.querySelector('.surface.active textarea') || document.querySelector('textarea');
  step('trim: Hearth hidden, the window is asked to trim its caches', Boolean(trimmed), (await T({ memtrim: true }))?.memtrim);
  step('trim: a draft typed before is still there, the window shows again', !box || box2?.value === draft, { had: Boolean(box), value: box2?.value?.slice(0, 40) });

  // ---------- warm ----------
  const src = await (await fetch('tools/three-boot.js')).text();
  step('warm: the warm preview page is let go after 5 minutes', /const LET_GO_MS = 5 \* 60000;/.test(src));
} catch (err) { step(`threw: ${String(err?.stack || err).slice(0, 500)}`, false); }
localStorage.removeItem('lab.restMs');
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
