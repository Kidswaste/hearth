// (round 109, projopen109) "the other computer", on a FRESH profile and an empty data folder: the bundle
// dev/projopen109-src.js exported (two layers with their own frame loops + a .gltf of several files) is imported by
// clicks (Projects › ⋯ › ⇩ Import project…, the file picked by the open dialog: smoke's --open; the card's Import).
//   first    the imported project opens by itself: the time from Import to ready, split into what it waited for:
//            the import itself, the Lab group's code (Lazy 'lab'), the preview page's start, its first scene drawn
//            (the model's files and pictures in), the textures and shaders (ready-prep: assets / compile), and the
//            rest (the board, the sound, the Desk). Every piece's moment read from the host and the page
//   away     (the 90 s hang of round 108) the project opened again and, while it's on "Building your scene…" (and in a
//            second try, on "Preparing textures and shaders" / "Warming shaders"), ProjectWorkspace.go('overview'): the
//            open ends (ready, no error) within seconds, not 90 s at "Warming shaders"; then its scene opened from the
//            Desk draws (the model loaded, both loops' frames moving)
//   node dev/smoke.js --check-timeout 600000 --open <bundle> --lib dev/projaudit108-lib.js --script dev/projopen109-dst.js
const slow = {}; const T = {}; const tl = [];
const now = () => Math.round(performance.now());
const mark = (k) => { if (T[k] == null) T[k] = now(); };
// the preview page's messages: the first of each kind, and the ready-prep's own numbers
const prepped = [];
addEventListener('message', (e) => {
  const d = e.data; if (!d || d.source !== 'three-sandbox' || !d.type) return;
  if (d.type === 'lab3d' && d.ev === 'loaded') mark('modelLoaded');
  else if (d.type === 'ready-progress') mark(`progress:${d.stage}`);
  else mark(`page:${d.type}`);
  if (d.type === 'ready' && !T.loafArmed) { T.loafArmed = now(); sbx(LOAF).catch(() => {}); }
  if (d.type === 'ready-prepped') prepped.push({ at: now(), ms: d.ms, assetsMs: d.assets?.ms, compileMs: d.compileMs, renderers: d.renderers, textures: d.textures, pending: d.pending, gl: d.gl });
});
// this window's long animation frames (when it was busy, and with what)
const hostLoafs = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (hostLoafs.length < 400) hostLoafs.push({ at: Math.round(e.startTime), ms: Math.round(e.duration), s: [...(e.scripts || [])].sort((a, b) => b.duration - a.duration).slice(0, 3).map((x) => `${Math.round(x.duration)} ${(x.invoker || '').slice(0, 40)} ${x.sourceFunctionName || ''}@${String(x.sourceURL || '').split('/').pop().slice(0, 30)}:${x.sourceCharPosition}`) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch { /* none */ }
// the opening card's words, as they change
new MutationObserver(() => { const s = document.querySelector('.pw-load-status')?.textContent; if (s && tl.at(-1)?.[0] !== s) tl.push([s, now()]); }).observe(document.body, { subtree: true, childList: true, characterData: true });
const labGroup = () => Lazy.state().find((g) => g.name === 'lab') || {};
// the preview page's long animation frames (buffered): when it was busy, and with what
const LOAF = `if (!window.__po109) { window.__po109 = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (window.__po109.length < 400) window.__po109.push({ at: Math.round(e.startTime), ms: Math.round(e.duration), block: Math.round(e.blockingDuration || 0), s: [...(e.scripts || [])].sort((a, b) => b.duration - a.duration).slice(0, 3).map((x) => Math.round(x.duration) + ' ' + (x.invoker || '').slice(0, 40) + ' ' + (x.sourceFunctionName || '') + '@' + String(x.sourceURL || '').split('/').pop().slice(0, 30) + ':' + x.sourceCharPosition) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch { /* none */ } } return 1`;
const page = async () => { const v = await sbx(`return JSON.stringify({ loafs: window.__po109 || null, origin: performance.timeOrigin, nav: (() => { const n = performance.getEntriesByType('navigation')[0]; return n ? { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null; })(), wg: window.__labWarmGap?.state?.(), lc: window.__labCompile?.state?.(), gl: globalThis.__rdyGl?.(), models: globalThis.lab3d?.list?.() || [] })`); try { return JSON.parse(v); } catch { return { error: String(v?.error || v).slice(0, 200) }; } };
try {
  const A = JSON.parse(await hub.fs.read(`${window.SMOKE_SAVES}/po109-expect.json`));
  await Lazy.load('projects'); await Projects.ready();
  const P = Projects;
  let id = null;
  await safe('first', async () => {
    slow.labModeAtStart = window.LabIntent?.state?.().mode ?? null;
    await click(document.querySelector('#agent-buttons [data-space=projects]'));
    const more = await until(() => [...document.querySelectorAll('.pj-quick-more')].find(visible), 15000);
    await click(more);
    const picked = await pickMenu(/^⇩ Import project…/);
    const tCard = now();
    const c = await until(() => card()?.querySelector('.pb-go') && card(), 30000);
    T.card = now();
    step('Projects › ⋯ › ⇩ Import project… (the file picked) opens the import card', picked && Boolean(c), { picked });
    await wait(1200); // (the owner reads the card: what comes in)
    const before = new Set(P.all().map((x) => x.id));
    const t0 = now(); T.importClick = t0;
    slow.labAtImport = labGroup().state;
    await click(c.querySelector('.pb-go'));
    const got = await until(() => P.all().find((x) => !before.has(x.id)), 60000, 20); T.imported = now();
    const opened = await until(() => got && ProjectWorkspace.state().project === got.id && ProjectWorkspace.state().phase !== 'opening' && performance.now(), 100000, 20);
    T.ready = opened ? Math.round(opened) : null;
    id = got?.id;
    step('…Import adds the project, and it opens by itself (ready)', got?.name === A.name && ProjectWorkspace.state().phase === 'ready', { name: got?.name, state: JSON.stringify(ProjectWorkspace.state()).slice(0, 300) });
    await wait(1500);
    const pg = await page();
    const g = labGroup();
    const off = pg.origin ? Math.round(pg.origin - performance.timeOrigin) : null; // the page's clock → this window's
    const rel = (x) => (x == null ? null : x - t0);
    const timings = ProjectWorkspace.state().timings || {};
    const ps = prepped.at(-1) || {};
    const split = {
      total: rel(T.ready),
      import: rel(T.imported),
      labCode: g.ms != null ? { from: rel(Math.round(g.at - (g.ms || 0))), ms: Math.round(g.ms) } : null, // (Lazy's at = when it was in)
      pageStart: off != null ? { from: rel(off), dcl: pg.nav ? rel(off + pg.nav.dcl) : null, ready: rel(T['page:ready']) } : null,
      firstDrawn: rel(T['page:stack-drawn']),
      model: rel(T.modelLoaded),
      prep: { assetsMs: ps.assetsMs ?? null, compileMs: ps.compileMs ?? null, ms: ps.ms ?? null, end: rel(ps.at), pending: ps.pending ?? null, gl: ps.gl || null },
      workspace: timings,
      card: tl.map(([s, t]) => `${rel(t)} ${s}`),
    };
    slow.first = split;
    slow.firstPageBusy = (pg.loafs || []).filter((x) => x.ms >= 100).map((x) => `${off != null ? rel(off + x.at) : x.at}+${x.ms}${x.block ? ` (block ${x.block})` : ''}: ${x.s.join(' | ')}`).slice(0, 30);
    slow.firstHostBusy = hostLoafs.filter((x) => x.at >= t0 && x.ms >= 100).map((x) => `${rel(x.at)}+${x.ms}: ${x.s.join(' | ')}`).slice(0, 30);
    slow.firstPage = { wg: pg.wg && { held: pg.wg.held, oldRule: pg.wg.oldRule, cards: pg.wg.cards, cardOld: pg.wg.cardOld, maxHoldMs: pg.wg.maxHoldMs, gaps: pg.wg.gaps, programs: pg.wg.programs }, lc: pg.lc && { ahead: pg.lc.ahead, scenes: pg.lc.scenes }, gl: pg.gl, models: (pg.models || []).map((m) => ({ name: m.name, loaded: m.loaded, error: m.error })) };
    slow.labIntent = window.LabIntent?.state?.() ?? null;
    step('the first open: every piece of its time measured (slow steps)', split.total > 0 && split.labCode && split.pageStart, { total: split.total });
  });

  // ---------- away: the Desk asked for while the open is still building its scene ----------
  const away = async (label, when) => {
    await ProjectWorkspace.home(); await wait(1500);
    let fired = null; const t0 = now();
    const mo = new MutationObserver(() => {
      const s = document.querySelector('.pw-load-status')?.textContent || '';
      if (!fired && when.test(s)) { fired = { at: now() - t0, status: s }; ProjectWorkspace.go('overview').catch((e) => { fired.err = e.message; }); }
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
    const opening = ProjectWorkspace.open(id).catch((e) => ({ error: e.message }));
    const end = await until(() => (ProjectWorkspace.state().phase !== 'opening' && ProjectWorkspace.state().project === id ? performance.now() : null), 100000, 50);
    mo.disconnect();
    const r = await Promise.race([opening, wait(5000).then(() => 'still running')]);
    const ms = end ? Math.round(end - t0) : null;
    const st = ProjectWorkspace.state();
    slow[`away_${label}`] = { ms, fired, phase: st.phase, error: st.error || r?.error || null, at: H.activeId, abandoned: ThreeLab.workspace?.state?.().abandoned ?? null, timings: st.timings || null };
    step(`away (${label}): ProjectWorkspace.go('overview') mid-open → the open ends ready within 20 s (not 90 s at "Warming shaders")`, fired && ms != null && ms < 20000 && st.phase === 'ready' && !r?.error, slow[`away_${label}`]);
    // then the scene from the Desk: the Lab on it, the model loaded, both loops' frames moving
    const t1 = now();
    await ProjectWorkspace.go('scene').catch((e) => { slow[`away_${label}`].sceneErr = e.message; });
    const sid = P.get(id).workspace.sceneId;
    const inLab = await until(() => H.activeId === 'tool:three' && ThreeLab.scenes?.currentId() === sid, 30000);
    const st2 = await modelLoaded('car');
    const frames = async () => { const v = await sbx('return JSON.stringify(Object.fromEntries(Object.entries(window.__scenes || {}).map(([k, e]) => [k, e?.renderer?.info?.render?.frame ?? 0])))'); try { return JSON.parse(v); } catch { return {}; } };
    await until(async () => Object.keys(await frames()).length >= 3, 15000, 300);
    const f0 = await frames(); await wait(1500); const f1 = await frames();
    const moving = Object.keys(f1).filter((k) => f1[k] > (f0[k] ?? 0)).length;
    slow[`away_${label}`].scene = { ms: now() - t1, inLab: Boolean(inLab), model: st2 && { loaded: st2.loaded, error: st2.error }, frames: [f0, f1] };
    step(`away (${label}): …then its scene from the Desk draws (the model loaded, two or more loops moving)`, inLab && st2?.loaded && moving >= 2, slow[`away_${label}`].scene);
    await ProjectWorkspace.go('overview').catch(() => {});
  };
  if (id) {
    await safe('away building', () => away('building', /^Building your scene/));
    await safe('away warming', () => away('warming', /Preparing textures and shaders|Warming shaders/));
    // and a plain reopen after both: ready, no error
    await safe('reopen', async () => {
      await ProjectWorkspace.home(); await wait(1000);
      const t0 = now(); await ProjectWorkspace.open(id).catch((e) => step('reopen', false, e.message));
      slow.reopen = { ms: now() - t0, phase: ProjectWorkspace.state().phase };
      step('a plain reopen after that: ready', ProjectWorkspace.state().phase === 'ready', slow.reopen);
    });
  }
} catch (err) {
  step('no exception', false, String(err?.stack || err).slice(0, 700));
}
step('slow steps (ms)', true, slow);
out.fails = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.pass = !out.fails.length;
return JSON.stringify(out);
