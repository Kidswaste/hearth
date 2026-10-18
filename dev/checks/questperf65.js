// (round 65, questperf65) "Every click / dialog open in Sidequest Studio re-renders the whole journal and map: 87–131 ms
// each on my RTX 4080 PC" (the owner's profile: quest-journal.js dialog() from outing-desk.js open and the journal's
// buttons, the dialog's × close, quest-atlas.js fit() from a rail click). On a big, realistic journal:
//   100 map places (40 of the owner's own pins + the Paris guide filling the journal's 100), 30 visited, 20 Paris place
//   quests in progress, 3 walks, 40 shows this week (the saved Shotgun / DICE responses padded to 40), a show log, an
//   Outing desk notebook with 160 events in its feed and 40 saved outings.
// Each interaction is one traced stretch (dev/trace-stats.js segments); per interaction: script ms (event handlers,
// timers, microtasks, frame callbacks, with the style / layout they force), the frame's style / layout ms and elements
// restyled, plus the in-page wall time from the click to the next frame. Budget: script ≤ 16 ms per click / dialog
// (window.QP_BUDGET overrides; window.QP_REPORT = 1 reports without failing). Offline map tiles, no network, no AI.
//   node dev/smoke.js --script dev/checks/questperf65.js --check-timeout 240000
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.fixture = 'offline'; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const until = async (fn, what, n = 200) => { for (let i = 0; i < n; i++) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { fixture: {}, interactions: {} }; const fails = [];
const root = () => document.querySelector('.qj');
const dlg = () => [...document.querySelectorAll('dialog.qj-dialog[open]')].at(-1);
const btn = (txt, scope = root()) => [...scope.querySelectorAll('button')].find((b) => (typeof txt === 'string' ? b.textContent.trim() === txt || b.getAttribute('aria-label') === txt : txt.test(b.getAttribute('aria-label') || b.textContent)));
const closeAll = async () => { document.querySelectorAll('dialog.qj-dialog[open]').forEach((d) => d.close()); await wait(150); };
window.hub.openExternal = () => {};

try {
  // ---------- the fixture ----------
  const t = await window.hub.shows.test({ dev: window.SMOKE_DEV }); if (!t?.ok) throw Error('shows:test unavailable');
  // this week's shows padded to 40 (copies of the saved responses' shows at other Paris venues, other nights)
  const pad = (v) => { if (!v?.shows?.length) return v; const base = v.shows, shows = base.slice(); const now = Date.now();
    for (let i = 0; shows.length < 40; i++) { const b = base[i % base.length]; const lat = 48.83 + (i % 8) * 0.009, lon = 2.29 + Math.floor(i / 8) * 0.018;
      shows.push({ ...b, key: `qp65-${i}`, id: `qp65-${i}`, title: `Fixture night ${i}`, start: now + (6 + i * 3) * 3600e3, end: null, cancelled: false, venue: { ...(b.venue || {}), key: `qp65-venue-${i}`, name: `Fixture club ${i}`, lat, lon } }); }
    return { ...v, shows }; };
  for (const fn of ['get', 'refresh', 'settings']) { const real = window.hub.shows[fn]; window.hub.shows[fn] = async (...a) => { const r = await real(...a); return r?.ok ? { ...r, value: pad(r.value) } : r; }; }
  await Lazy.load('questcore');
  const C = QuestCore;
  await Lazy.load('questjournal');
  const P = QuestParis;
  const s = C.upgrade(C.initial());
  s.atlas.places = s.atlas.places.slice(0, 0); // the owner's own pins only (Codex's six samples dropped: 40 own + 60 guide = the journal's 100)
  const kinds = C.mapKinds.map((k) => k.id);
  for (let i = 0; i < 40; i++) C.savePlace(s, { name: `My spot ${i}`, lat: 48.835 + (i % 10) * 0.006, lon: 2.30 + Math.floor(i / 10) * 0.025 + (i % 3) * 0.002, kind: kinds[i % kinds.length], quest: 'Fixture place.' });
  P.addGuide(s);
  s.atlas.places.forEach((p, i) => { if (i % 3 === 0 && i < 90) p.visitedAt = new Date(Date.now() - i * 86400e3).toISOString(); if (i % 7 === 0) p.favorite = true; });
  const gids = P.guide.map((g) => g.id).filter((id) => s.atlas.places.some((p) => p.id === id || p.guide === id));
  for (const gid of gids.slice(0, 20)) { const c = P.startPlace(s, gid); s.records[c.quests[0].id] = { startedAt: new Date().toISOString(), completedAt: new Date().toISOString() }; s.records[c.quests[1].id] = { startedAt: new Date().toISOString() }; }
  for (let w = 0; w < 3; w++) { const stops = gids.slice(20 + w * 3, 23 + w * 3); s.campaigns.push({ id: `c-walk-qp65-${w}`, title: `Walk ${w}`, subtitle: 'PARIS / WALK / 2 H', path: 'life', badge: 'Paris walker', why: 'Fixture walk.',
    walk: { v: 1, budget: 120, m: 2300, km: 2.3, total: 100, start: { id: null, name: 'Oberkampf', lat: 48.8648, lon: 2.3683, kind: 'metro', lines: [], minutes: 0 }, end: { id: null, name: 'République', lat: 48.8675, lon: 2.3637, kind: 'metro', lines: [], minutes: 0 }, stops: stops.map((x) => ({ id: x, name: P.byId(x).name, lat: P.byId(x).lat, lon: P.byId(x).lon, kind: P.byId(x).kind, lines: [], minutes: 20 })), link: 'https://www.google.com/maps/dir/?api=1' },
    quests: stops.map((x, i) => ({ id: `q-walk-qp65-${w}-${i + 1}`, title: `${i + 1}. ${P.byId(x).name}`, done: 'Fixture stop.', tiny: 'Fixture.', deep: 'Fixture.', minutes: 30, xp: 25, tool: null, place: x })) }); }
  s.campaigns.at(-1).quests.forEach((q) => { s.records[q.id] = { startedAt: new Date().toISOString(), completedAt: new Date().toISOString() }; });
  const checked = C.validate(s);
  await window.hub.kvSet('quest-journal', checked);
  await window.hub.kvSet('show-nights', { v: 1, prep: {}, went: Array.from({ length: 6 }, (_, i) => ({ id: `went-qp65-${i}`, key: `qp65went${i}`, show: { key: `qp65went${i}`, title: `Fixture gig ${i}`, start: Date.now() - (i + 2) * 86400e3, end: null, doors: null, venue: { key: '', name: 'La Cigale', address: '120 boulevard de Rochechouart, 75018 Paris', lat: 48.8822, lon: 2.3404, url: '' }, lineup: ['Fixture'], links: {}, tickets: [], platforms: [] }, rating: 4, moment: 'A moment', photo: null, note: '', questId: '', at: new Date(Date.now() - (i + 1) * 86400e3).toISOString(), updatedAt: new Date().toISOString() })) });
  const o = OutingCore.initial(); const day = 86400e3;
  o.feed = Array.from({ length: 160 }, (_, i) => OutingCore.event({ id: `paris-qp65-${i}`, title: `Fixture outing ${i}`, kind: ['music', 'visual', 'game', 'learn', 'wander'][i % 5], url: `https://www.paris.fr/evenements/qp65-${i}`, venue: `Fixture venue ${i}`, start: new Date(Date.now() + (i % 30) * day).toISOString(), lat: 48.84 + (i % 12) * 0.004, lon: 2.31 + (i % 9) * 0.008 }));
  o.fetchedAt = new Date().toISOString();
  for (const e of o.feed.slice(0, 40)) OutingCore.save(o, e);
  await window.hub.kvSet('sidequest-outings-v1', o);
  out.fixture = { places: checked.atlas.places.length, own: checked.atlas.places.filter((p) => !P.byId(p.id) && !p.guide).length, visited: checked.atlas.places.filter((p) => p.visitedAt).length, campaigns: checked.campaigns.length, outings: o.feed.length, saved: o.saved.length };

  // ---------- open the Studio's map (the world page), let every layer arrive ----------
  activate('tool:quests');
  await until(() => root() && QuestJournal.ready(), 'journal');
  QuestJournal.navigate('world');
  await until(() => root().querySelector('.qj-atlas .qj-atlas-pin'), 'map');
  await until(() => root().querySelectorAll('.qj-atlas-pin[data-place^="show-venue-"]').length >= 3, 'show pins');
  await wait(1500); await QuestJournal.flush();
  out.fixture.pinsDrawn = root().querySelectorAll('.qj-atlas-pin').length;
  out.fixture.showPins = root().querySelectorAll('.qj-atlas-pin[data-place^="show-venue-"]').length;
  out.fixture.elements = root().querySelectorAll('*').length; out.fixture.shows = ShowSync.snap?.shows?.length; out.fixture.week = ShowSync.week?.().length;
  const own = () => root().querySelector('.qj-atlas-pin[data-place^="place-"]:not(.selected)');

  // window.QP_PROFILE = 1: a CPU profile of 20 re-renders of the map page (where render() time goes), then stop
  if (window.QP_PROFILE) {
    await smoke({ cdp: 'Profiler.enable' }); await smoke({ cdp: 'Profiler.setSamplingInterval', params: { interval: 100 } }); await smoke({ cdp: 'Profiler.start' });
    const t0 = performance.now(); for (let i = 0; i < 20; i++) QuestJournal.navigate('world'); const per = (performance.now() - t0) / 20;
    const prof = (await smoke({ cdp: 'Profiler.stop' })).profile || {}; const nodes = prof.nodes || [], byId = new Map(nodes.map((n) => [n.id, n])), cnt = {};
    (prof.samples || []).forEach((id, i) => { cnt[id] = (cnt[id] || 0) + (prof.timeDeltas[i] || 0); });
    const key = (n) => `${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber + 1} ${n.callFrame.functionName}`;
    const tot = (n) => { let t = cnt[n.id] || 0; for (const c of n.children || []) t += tot(byId.get(c)); n.t = t; return t; }; nodes.filter((n) => !nodes.some((m) => (m.children || []).includes(n.id))).forEach(tot);
    const self = {}, incl = {}; for (const n of nodes) { self[key(n)] = (self[key(n)] || 0) + (cnt[n.id] || 0) / 20e3; incl[key(n)] = (incl[key(n)] || 0) + n.t / 20e3; }
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${v.toFixed(2)} ${k}`);
    return JSON.stringify({ perRenderMs: +per.toFixed(1), selfPerRender: top(self), inclPerRender: top(incl) });
  }
  // ---------- the interactions (each a traced stretch) ----------
  const seq = [];
  const it = async (name, fn) => { await QuestJournal.flush(); await frame(); await wait(200); performance.mark(`hz240:${name}`); seq.push(name); const t0 = performance.now(); await fn(); await QuestJournal.flush(); await frame(); out.interactions[name] = { wallMs: Math.round(performance.now() - t0) }; await wait(300); performance.mark('hz240:between'); };
  await smoke({ trace: 'start', detail: true });
  const pinId = own().dataset.place;
  await it('pin-click', async () => { own().click(); await until(() => root().querySelector('.qj-atlas-pin.selected'), 'selected'); });
  await it('favorite', async () => { btn(/^(Save|Remove) favorite$/).click(); await wait(0); });
  await it('visit-stamp', async () => { btn(/^(Stamp my visit|Undo visit stamp)$/).click(); await wait(0); });
  await it('details-dialog', async () => { btn('Place details').click(); await until(dlg, 'details'); });
  await it('dialog-close', async () => { dlg().querySelector('.qj-close').click(); await until(() => !dlg(), 'closed'); });
  await it('outing-desk', async () => { btn('Outing desk').click(); await until(() => dlg()?.classList.contains('od-dialog') && dlg().querySelector('.od-card'), 'outing desk'); });
  await it('outing-close', async () => { dlg().querySelector('.qj-close').click(); await until(() => !dlg(), 'closed'); });
  await it('chip-shows', async () => { root().querySelector('.qmf-chip[data-layer="shows"]').click(); await wait(0); });
  await it('chip-shows-back', async () => { root().querySelector('.qmf-chip[data-layer="shows"]').click(); await wait(0); });
  await it('rail-away', async () => { activate(H.railAgents()[0].id); });
  await it('rail-back', async () => { activate('tool:quests'); await until(() => root().querySelector('.qj-atlas .qj-atlas-pin'), 'map back'); });
  if (window.QP_EXP) { // experiment: the same dialog with the map's pins / the whole page content skipped
    const pinsL = root().querySelector('.qj-atlas-pins');
    pinsL.style.contentVisibility = 'hidden';
    await it('x-dialog-nopins', async () => { btn('Place details').click(); await until(dlg, 'details'); });
    await it('x-close-nopins', async () => { dlg().querySelector('.qj-close').click(); await until(() => !dlg(), 'closed'); });
    pinsL.style.contentVisibility = '';
    const kids = [...root().children].filter((n) => n.tagName !== 'DIALOG'); kids.forEach((n) => { n.style.contentVisibility = 'hidden'; });
    await it('x-dialog-nopage', async () => { btn('Place details').click(); await until(dlg, 'details'); });
    await it('x-close-nopage', async () => { dlg().querySelector('.qj-close').click(); await until(() => !dlg(), 'closed'); });
    kids.forEach((n) => { n.style.contentVisibility = ''; });
    out.counts = { atlas: root().querySelectorAll('.qj-atlas *').length, pins: root().querySelectorAll('.qj-atlas-pins *').length, qj: root().querySelectorAll('*').length, doc: document.querySelectorAll('body *').length };
  }
  await it('nav-map', async () => { root().querySelector('[data-nav-group="map"]').click(); await wait(0); });
  const tr = await smoke({ trace: 'stop', detail: true, dump: window.QP_DUMP || undefined });
  out.pinSelected = root().querySelector('.qj-atlas-pin.selected')?.dataset.place === pinId || root().querySelector('.qj-atlas-pin.selected')?.dataset.place;
  out.journalAfter = { favorite: QuestJournal.snapshot().atlas.places.find((p) => p.id === pinId)?.favorite };
  const SCRIPT = ['FunctionCall', 'EventDispatch', 'TimerFire', 'FireAnimationFrame', 'v8.callFunction', 'RunMicrotasks', 'FireIdleCallback'];
  const BUDGET = window.QP_BUDGET || 16;
  for (const name of seq) {
    const g = tr.detail?.segments?.[name]; if (!g) { fails.push(`${name}: no trace segment`); continue; }
    const ph = Object.fromEntries(String(g.phases || '').split(', ').map((x) => { const m = /^(.*) ([\d.]+)$/.exec(x); return m ? [m[1], +m[2]] : [x, 0]; })); // (trace-stats: the top phases as 'Name ms, …')
    const script = Math.round(SCRIPT.reduce((a, k) => a + (ph[k] || 0), 0) * 10) / 10;
    Object.assign(out.interactions[name], { scriptMs: script, cpuMs: g.cpuMs, longestCpu: g.longestCpu, style: `${g.style.n}×${g.style.elements}el ${g.style.ms}ms`, layoutMs: g.layout.ms, forced: g.forced.n, forcedMs: g.forced.ms, top: (g.scripts || []).slice(0, 3), phases: g.phases });
    if (name !== 'rail-away' && script > BUDGET) fails.push(`${name}: ${script} ms script (budget ${BUDGET})`);
  }
  out.budget = BUDGET;
} catch (err) { fails.push(`error: ${err.stack || err.message || err}`); }
await closeAll();
if (fails.length && !window.QP_REPORT) throw Error(JSON.stringify({ fails, out }));
return JSON.stringify({ ok: !fails.length, fails, ...out });
