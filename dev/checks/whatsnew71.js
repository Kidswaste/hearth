// (round 71, whatsnew71) ✦ Try what's new for rounds 66–70, in the real app, by CLICKING (no chat command; it fails if
// one is used after the fixtures), with the fake instrument host and an isolated profile, offline (saved Shotgun / DICE
// responses, no map tiles):
//   node dev/smoke.js --fake-vst --check-timeout 300000 --script dev/checks/whatsnew71.js --shot /tmp/whatsnew71.png
// EVERY step of the five tours (trynew71-core.js) is walked like the owner would: the card says its sentence with a
// "Show me" button and no ring yet; Show me opens the place; then the ring must sit on the step's OWN button (its first
// target, never the fallback), and that button must be visible and on top at its centre. So a tour that points at a
// button that moved, was renamed or went away fails here. Fixtures make every button able to show: a journal (the ✦
// panel), this week's sample shows (a show's card), a Thursday-evening clock (🗓 Plan my weekend), Vital open on the
// fake host with one session holding a sketch (Sessions › 🎛 Put on a pad, 🎹 Map my controller), a board with one
// measured picture (the drawer's slider). Then: the one card after an update ("Since you were last here: N updates —
// take the 1-minute tours?" with Later, never again after Later), the ✦ tracker's "✦ New tours", What's new's tour row,
// the patch notes' "✦ Show me", Take the tours running them in order, Skip / Later / Done kept.
const atlasImageSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...atlasImageSource, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.tileFixture = String(value); queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } return atlasImageSource.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 200) => { for (let i = 0; i < n; i++) { let v; try { v = await fn(); } catch { v = null; } if (v) return v; await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [], timings: {} }; const fails = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info.slice(0, 300) : JSON.stringify(info).slice(0, 300)}`}`); if (!ok) fails.push(name); };
const vis = (n) => Boolean(n && n.isConnected && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
const card = () => document.querySelector('.tour-card');
const ringEl = () => document.querySelector('.tour-ring:not(.tour-ring-solo)');
const shot = (n) => smoke({ shot: `${window.SMOKE_TMP || window.SMOKE_SAVES}/whatsnew71-${n}.png` });
const agent = H.claudeAgent().id;

try {
  step('the tours are not on the first screen', typeof TryNew71Core === 'undefined' && !Lazy.isIn('trynew'));

  // ---------- fixtures (the only commands of the run: the shows sync, as invite67 / follow70 do) ----------
  const t = await window.hub.shows.test({ dev: window.SMOKE_DEV }); if (!t?.ok) throw Error('shows:test unavailable: ' + JSON.stringify(t));
  await Lazy.load('questcore'); await Lazy.load('questjournal'); await Lazy.load('questhud');
  await window.hub.kvSet('quest-journal', QuestCore.validate(QuestCore.upgrade(QuestCore.initial())));
  await QuestHud.refresh();
  const said = []; await Commands.tryRun('/shows', agent, null, { say: (x) => said.push(String(x)), note: () => {}, error: (x) => said.push('ERROR ' + x) });
  await until(() => said.some((x) => !/^Reading/.test(x)), '/shows read', 250).catch(() => null);
  await ShowSync.ensure();
  step('fixture: shows of the week with a time', ShowSync.upcoming().some((s) => !s.dateOnly && s.start > Date.now()), ShowSync.upcoming().length);
  // a Thursday 19:00 this week (🗓 Plan my weekend shows Thursday evening → Sunday)
  const thu = new Date(); thu.setDate(thu.getDate() + ((4 - thu.getDay() + 7) % 7)); thu.setHours(19, 0, 0, 0);
  WeekendPlanCore.setClock(() => thu.getTime());
  // the Sound desk: Vital on the fake host, one session with a 30-second sketch
  const runtime = await window.hub.vst.status();
  const music = Boolean(runtime.ok && /fake/.test(runtime.version || ''));
  step('fixture: the fake instrument host (smoke --fake-vst)', music, runtime.error || runtime.version);
  if (music) {
    const dir = `${window.SMOKE_TMP}/whatsnew71`; const SEP = navigator.platform.startsWith('Win') ? '\\' : '/';
    await window.hub.fs.write(`${dir}/Vital.vst3/Contents/Resources/moduleinfo.json`, '{"Name":"Vital"}');
    await Lazy.load('creative');
    const rate = 48000; const n = 30 * rate; const ch = new Float32Array(n); for (let i = 0; i < n; i += 24000) ch[i] = 0.8;
    const folder = (await window.hub.bouncelog.folder('Tour jam')).path; const sketch = `${folder}${SEP}Sketch 2026-10-26 21.00.00.wav`;
    await window.hub.fs.write(sketch, ParkJamCore.encodeWav({ rate, channels: [ch, Float32Array.from(ch)] }));
    await window.hub.kvSet('music-sessions', { v: 1, sessions: [{ id: 'ses-tour', start: new Date(Date.now() - 3600e3).toISOString(), end: new Date(Date.now() - 2400e3).toISOString(), minutes: 20, used: { park: false, liveset: true, arrange: false }, instruments: ['Vital'], place: '', sketches: [{ path: sketch, at: new Date(Date.now() - 2500e3).toISOString(), seconds: 30, bpm: 120 }] }] });
    const project = WorkbenchCore.defaults(); project.vst.roots = [dir]; project.title = 'Tour jam'; await window.hub.kvSet('creative-workbenches', project);
    activate('tool:creative'); await until(() => document.querySelector('.wb-stations'), 'Playground');
    CreativePlayground.openFeature('vst'); await until(() => document.querySelector('.wb-instrument-card'), 'instrument cards');
    [...document.querySelectorAll('.wb-instrument-card')].find((b) => b.textContent === 'Vital')?.click(); // the owner's instrument, open as he left it
    await until(() => WorkbenchVST.api.current()?.ready, 'Vital ready', 300).catch(() => null);
  }
  // the moodboard: a board with one measured picture
  await Lazy.load('board'); await Board.ready();
  const c = document.createElement('canvas'); c.width = 240; c.height = 160; const g = c.getContext('2d'); g.fillStyle = '#e68c3c'; g.fillRect(0, 0, 240, 90); g.fillStyle = '#281914'; g.fillRect(0, 90, 240, 70);
  const pic = await window.hub.board.save('wn71-warm.png', c.toDataURL('image/png').split(',')[1]);
  const b = await Board.create('Tour board', { quiet: true }); await Board.open(b.id);
  const bb = Board.current(); bb.items.push({ id: 'wn71warm', type: 'image', title: 'Warm dusk', src: pic, x: 0, y: 0, w: 240, h: 160, rot: 0, added: Date.now(), sized: true, natural: [240, 160], vibe: await BoardVibe.image(Board.fileUrl(pic)) });
  await Board.save(bb, { now: true });
  activate(agent);

  // from here on: clicks only
  let commands = 0; const realRun = Commands.tryRun; Commands.tryRun = (...a) => { commands++; return realRun.apply(Commands, a); };

  // ---------- 1. the ✦ tracker's "✦ New tours" → the card (no command, loads the group) ----------
  await QuestHud.open();
  const nt = await until(() => document.querySelector('.qh-panel .qh-try71'), 'the tracker\'s ✦ New tours', 80).catch(() => null);
  step('the ✦ tracker has "✦ New tours 0/5"', vis(nt) && /New tours 0\/5/.test(nt.textContent), nt?.textContent);
  nt?.click();
  await until(() => window.TryNew?.card7, 'the tours card');
  const k7 = TryNew.card7;
  step('its card: five tour chips, Take the tours, Later', k7.querySelectorAll('.tn7-chip').length === 5 && vis(k7.querySelector('.tn7-go')) && vis(k7.querySelector('.tn7-later')), [...k7.querySelectorAll('.tn7-chip')].map((x) => x.textContent).join(' | '));
  k7.querySelector('.tn7-later').click(); await wait(200);
  step('Later from the tracker is just a close (the after-update card is still to come)', !TryNew.card7 && store.get('trynew.since71', null) == null);

  // ---------- 2. EVERY step: sentence + Show me first, then the ring on its own button ----------
  const T7 = TryNew71Core;
  for (const tour of T7.TOURS) {
    TryNew.startTour(tour.id);
    for (let i = 0; i < tour.steps.length; i++) {
      const s = tour.steps[i]; const name = `${tour.name} › ${s.title}`;
      if (tour.id === 'music' && !music) { step(`${name}: skipped (no fake instrument host)`, false); continue; }
      let info = ''; let ok = false;
      try {
        await until(() => card()?.dataset.tour === `try71-${tour.id}` && card().dataset.step === String(i) && card().querySelector('.tour-show'), `${name}: its card`);
        const first = !ringEl() && card().querySelector('.tour-show').classList.contains('primary') && card().querySelector('.tour-text').textContent === s.text;
        const t0 = performance.now();
        card().querySelector('.tour-show').click();
        const ring = await until(() => ringEl(), `${name}: the ring`, 260);
        out.timings[s.id] = Math.round(performance.now() - t0);
        await wait(380); // the ring follows a panel that slides in
        // the step's OWN button (its first target list, never the fallback)
        const own = TryNew.targetOf({ target: s.target }).map((f) => f()).find(Boolean);
        await wait(200); // (finding it scrolls it into view, as the tour does: the ring follows)
        const rr = ring.getBoundingClientRect(); const br = own?.getBoundingClientRect();
        const onIt = Boolean(br && Math.abs(rr.left + 4 - br.left) < 3 && Math.abs(rr.top + 4 - br.top) < 3 && Math.abs(rr.width - 8 - br.width) < 3);
        const inView = Boolean(br && br.width > 2 && br.height > 2 && br.top >= 0 && br.left >= 0 && br.bottom <= innerHeight && br.right <= innerWidth);
        const hit = br ? document.elementsFromPoint(br.left + br.width / 2, br.top + br.height / 2).find((x) => !x.classList.contains('tour-ring') && !x.closest('.tour-card')) : null;
        const onTop = Boolean(hit && (hit === own || own.contains(hit)));
        ok = first && Boolean(own) && vis(own) && onIt && inView && onTop && !card().querySelector('.tour-hint');
        info = `${out.timings[s.id]} ms · ${own ? `${own.tagName.toLowerCase()}.${String(own.className).split(' ').filter(Boolean).slice(0, 2).join('.')} “${own.textContent.trim().slice(0, 30)}”` : 'its button is NOT there'}${first ? '' : ' · (no Show me first)'}${onIt ? '' : ` · ring elsewhere ${JSON.stringify([rr.left, rr.top, rr.width, br?.left, br?.top, br?.width].map(Math.round))} in ${ring.parentElement?.tagName}.${ring.parentElement?.className} ${getComputedStyle(ring).position}`}${inView ? '' : ' · off screen'}${onTop ? '' : ` · covered by ${hit?.className || 'nothing'}`}`;
      } catch (err) { info = err.message; }
      step(`${name}: Show me rings its own visible button`, ok, info);
      if (['weekend', 'invite', 'herepin', 'pads', 'slow', 'direction', 'moodboard'].includes(s.id)) await shot(s.id);
      const nx = card()?.querySelector('.tour-next');
      if (nx) { nx.click(); await wait(250); }
    }
    await until(() => !Tour.current, `${tour.name}: ends on Done`, 60).catch(() => null);
    step(`${tour.name}: Done ✓ is kept`, TryNew.progress7()[tour.id]?.state === 'done', TryNew.progress7()[tour.id]);
  }
  // a weekday: 🗓 Plan my weekend isn't there; the step rings the ✦ chip instead (its sentence says when it shows)
  WeekendPlanCore.setClock(() => thu.getTime() - 2 * 86400e3);
  TryNew.startTour('nights');
  await until(() => card()?.dataset.tour === 'try71-nights' && card().querySelector('.tour-show'), 'nights again');
  card().querySelector('.tour-show').click();
  const wr = await until(() => ringEl(), 'the weekday ring', 160).catch(() => null);
  const chip = document.querySelector('#rail .qh-chip'); const cr = chip?.getBoundingClientRect(); const wrr = wr?.getBoundingClientRect();
  step('on a Tuesday, the weekend step rings the ✦ chip (and says “from Thursday evening”)', Boolean(cr && wrr && Math.abs(wrr.left + 4 - cr.left) < 3) && /Thursday evening/.test(card().querySelector('.tour-text').textContent));
  WeekendPlanCore.setClock(null);
  // Skip and Later
  card().querySelector('.tour-skip').click(); await wait(150);
  step('Skip: that tour is "skipped"', TryNew.progress7().nights?.state === 'skipped');
  TryNew.startTour('help');
  await until(() => card()?.dataset.tour === 'try71-help', 'help again');
  card().querySelector('.tour-later').click(); await wait(150);
  step('Later: "later" never takes a seen tour back', TryNew.progress7().help?.state === 'done');

  // ---------- 3. the one card after an update ----------
  store.set('trynew.tours71', {}); store.set('trynew.since71', null); store.set('trynew.offer', null);
  const rounds = (await (await fetch('docs/patch-notes/index.txt', { cache: 'no-store' })).text()).split('\n').map((l) => Number((/^round-(\d+)\.md$/.exec(l.trim()) || [])[1]) || 0).filter(Boolean);
  const want = rounds.filter((r) => r > 65).length;
  const sc = TryNew.since({ seen: 65, rounds });
  step('after an update: "Since you were last here: N updates — take the 1-minute tours?" (N = rounds missed)', vis(sc) && sc.querySelector('.tn7-lead').textContent === `Since you were last here: ${want} update${want === 1 ? '' : 's'} — take the 1-minute tours?`, sc?.querySelector('.tn7-lead')?.textContent);
  step('calm: one small card, its buttons Take the tours · Later · What changed', vis(sc.querySelector('.tn7-go')) && vis(sc.querySelector('.tn7-later')) && vis(sc.querySelector('.tn7-what')) && sc.getBoundingClientRect().width <= 400 && document.querySelectorAll('.tn-card').length === 1);
  step('it stands for the digest and the older offer (seen marked, one card)', Number(store.get('whatsnew.seen', 0)) >= Math.max(...rounds.filter((r) => r <= 70)) && store.get('trynew.offer', null) === 'since71');
  await shot('since');
  sc.querySelector('.tn7-later').click(); await wait(200);
  step('Later: it closes and never comes by itself again', !TryNew.card7 && store.get('trynew.since71', null) === 'later' && TryNew.since({ seen: 65, rounds }) === null && TryNew.offerSince({ seen: 65, rounds }) === false);
  // Take the tours: they run in order
  store.set('trynew.since71', null);
  TryNew.since({ seen: 65, rounds }).querySelector('.tn7-go').click();
  await until(() => card()?.dataset.tour === 'try71-nights', 'the first tour');
  step('Take the tours: Paris nights first, then the others in order', JSON.stringify(TryNew.chain7) === JSON.stringify(T7.TOURS.map((x) => x.id)) && store.get('trynew.since71', null) === 'started', TryNew.chain7);
  card().querySelector('.tour-skip').click();
  await until(() => card()?.dataset.tour === 'try71-sidequest', 'the next tour after Skip').catch(() => null);
  step('Skip moves on to the next tour', card()?.dataset.tour === 'try71-sidequest', card()?.dataset.tour);
  card()?.querySelector('.tour-later')?.click(); await wait(150);
  step('Later stops the run', !Tour.current && TryNew.chain7 === null);

  // ---------- 4. What's new and the patch notes ----------
  await Lazy.load('whatsnew'); await WhatsNew.open({ since: 65 });
  const row = await until(() => document.querySelector('dialog.wn-dialog[open] .tn7-row .tn7-chip') && document.querySelector('dialog.wn-dialog[open] .tn7-row'), 'the tours row', 80).catch(() => null);
  step('What\'s new (rounds 66–70): a row of the five tours', Boolean(row) && row.querySelectorAll('.tn7-chip').length === 5, row?.textContent);
  row?.querySelector('[data-tour="music"]')?.click();
  await until(() => card()?.dataset.tour === 'try71-music', 'music from What\'s new').catch(() => null);
  step('its chip closes What\'s new and starts that tour', card()?.dataset.tour === 'try71-music' && !document.querySelector('dialog.wn-dialog[open]'));
  Tour.stop();
  await Updater.patchNotes('round-68.md');
  const pn = await until(() => document.querySelector('dialog.pn-dialog[open] .tn-pn'), 'patch notes button', 80).catch(() => null);
  step('patch notes of round 68: "✦ Show me" with its tours', vis(pn) && /Show me/.test(pn.textContent), pn?.textContent);
  pn?.click();
  await until(() => card()?.dataset.tour, 'a tour from the patch notes').catch(() => null);
  step('it runs the tours that cover round 68', /^try71-/.test(card()?.dataset.tour || '') && T7.forRound(68).map((x) => `try71-${x.id}`).includes(card()?.dataset.tour), card()?.dataset.tour);
  Tour.stop();

  Commands.tryRun = realRun;
  step('no chat command was used (clicks only)', commands === 0, commands);
} catch (err) { step('the run', false, `${err.message} ${String(err.stack || '').split('\n')[1] || ''}`); }
out.pass = fails.length === 0;
out.fails = fails;
return JSON.stringify(out, null, 1);
