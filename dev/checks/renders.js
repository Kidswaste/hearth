// The render queue (round 13, renders*.js), driven like a user: /renders render of the open video in three presets
// (one runs, the others wait their turn, the ⇪ badge counts them, their bars wait), pause (the ffmpeg process is
// suspended: the number holds) and resume, cancel a waiting one (its caller hears the end), the files checked with
// ffprobe (sizes, GIF), the done note (Open, Show in folder, Copy path, Video Review), a Video Review export through
// the same queue (its library and its bar as before), a failure in plain words with its fix (and in /habits errors),
// re-render with the same settings (a new file), the list and its history tab, right-click menus, Trash, a
// recording shown live, the Render panel (presets as chips, all socials, details, remembered choices), /renders
// subcommands, no duplicate commands, and the smoothness rules (few DOM writes while it runs, nothing when idle).
//   sh dev/make-test-videos.sh /tmp/hearth-test-videos
//   node dev/smoke.js --check-timeout 600000 --script dev/checks/renders.js --shot /tmp/renders.png
const SHOTS = window.RENDERS_SHOTS || '/tmp/hearth-checks/renders';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const shot = async (name) => { try { await smoke({ shot: `${SHOTS}-${name}.png` }); } catch { /* pictures are optional */ } };
const C = H.claudeAgent();
const say = async (line) => { let text = ''; await Commands.tryRun(line, C.id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const job = (re) => Renders.list().find((j) => re.test(j.title) || re.test(j.output || ''));
const badge = () => document.getElementById('rq-badge');
const toasts = () => [...document.querySelectorAll('#toasts .toast')];
try {
  // ---- 0. the commands ----
  ok(Commands.get('renders'), '/renders is registered');
  ok(!(Commands.duplicates?.() || []).length, `no duplicate commands (${JSON.stringify(Commands.duplicates?.() || []).slice(0, 200)})`);
  const pre = await say('/renders presets');
  ok(['vertical', 'story', 'feed45', 'square', 'yt1080', 'yt4k', 'gif', 'webm', 'master', 'audio'].every((id) => pre.includes(`**${id}**`)), 'the presets are listed');
  ok(!badge() || badge().hidden, 'no badge while nothing renders');

  // ---- 1. a video in Video Review ----
  const VIDS = `${window.SMOKE_SAVES}/rq`;
  await window.hub.fs.write(`${VIDS}/.keep`, '');
  for (const f of (await window.hub.fs.list('/tmp/hearth-test-videos')).filter((x) => !x.isDir && /drop_visual_16x9\.mp4|square_loop/.test(x.name))) await window.hub.fs.copy(f.path, `${VIDS}/${f.name}`);
  activate('tool:ae'); await Review.ensureMounted();
  H.config.settings = { ...H.config.settings, videoDirs: [VIDS] };
  await Review.load(true);
  await until(() => Review.videos.length >= 2, 10000);
  const A = `${VIDS}/drop_visual_16x9.mp4`;
  await Review.open(A); await Review.waitReady?.().catch(() => null);
  activate(C.id); await wait(200);

  // ---- 2. three presets: one runs, two wait ----
  const said = await say('/renders render yt4k square gif quality=draft');
  out.said = said;
  ok(/In the queue/.test(said), `the command queues them (${said.slice(0, 120)})`);
  const j4k = job(/YouTube 4K/); const jsq = job(/Square/); const jgif = job(/GIF/);
  ok(j4k && jsq && jgif, 'three jobs');
  await until(() => j4k.status === 'running', 15000);
  ok(j4k.status === 'running' && jsq.status === 'queued' && jgif.status === 'queued', `one at a time (${[j4k, jsq, jgif].map((j) => j?.status).join(' ')})`);
  ok(await until(() => badge() && !badge().hidden && badge().textContent.includes('3'), 3000), `the badge shows 3 (${badge()?.textContent})`);
  ok(Progress.get(`job:${jsq.id}`)?.state === 'wait' && /waiting/.test(Progress.get(`job:${jsq.id}`)?.label || ''), `a waiting job's bar waits (${Progress.get(`job:${jsq.id}`)?.label})`);
  ok(/next/.test(Renders.words(jsq)) && /2 in line/.test(Renders.words(jgif)), `places in line (${Renders.words(jsq)} / ${Renders.words(jgif)})`);
  // the list, open while it runs: DOM writes stay few
  Renders.open();
  ok(document.querySelectorAll('.rq-pop .rq-row').length >= 3, 'the list shows the three');
  await until(() => j4k.pct > 3, 30000);
  let muts = 0;
  const mo = new MutationObserver((l) => { muts += l.length; });
  mo.observe(document.querySelector('.rq-pop'), { subtree: true, childList: true, characterData: true, attributes: true });
  mo.observe(badge(), { subtree: true, childList: true, characterData: true, attributes: true });
  await wait(3000);
  mo.disconnect();
  out.writesPerSec = Math.round((muts / 3) * 10) / 10;
  ok(out.writesPerSec <= 8, `the list and badge repaint at most twice a second (${out.writesPerSec} DOM changes / s)`);
  out.words = Renders.words(j4k);
  await shot('list');

  // ---- 3. pause / resume (suspended: the number holds) ----
  ok(await Renders.pause(j4k.id), 'pause');
  ok(j4k.status === 'paused', `paused (${j4k.status})`);
  const p0 = j4k.pct; await wait(2500);
  ok(j4k.pct === p0, `nothing moves while paused (${p0} → ${j4k.pct})`);
  ok(jsq.status === 'queued', 'a suspended job keeps its turn');
  ok(/paused/.test(await say('/renders')) , '/renders says paused');
  ok(await Renders.resume(j4k.id), 'resume');
  await until(() => j4k.pct > p0, 20000);
  ok(j4k.pct > p0 && j4k.status === 'running', `it goes on after resume (${p0} → ${j4k.pct})`);

  // ---- 4. cancel a waiting one ----
  const cs = await say('/renders cancel 3');
  ok(/Cancelled 1/.test(cs) && jgif.status === 'cancelled', `cancel the third (${cs} · ${jgif.status})`);

  // ---- 5. they finish one after the other ----
  ok(await until(() => j4k.status === 'done' && jsq.status === 'done', 400000), `both done (${j4k.status} ${jsq.status} ${j4k.error?.reason || jsq.error?.reason || ''})`);
  const p4k = await window.hub.video.probe(j4k.output); const psq = await window.hub.video.probe(jsq.output);
  ok(p4k?.w === 3840 && p4k?.h === 2160, `4K file (${p4k?.w}×${p4k?.h})`);
  ok(psq?.w === 1080 && psq?.h === 1080 && psq.audio, `square file with sound (${psq?.w}×${psq?.h})`);
  ok(/exports/.test(jsq.output), `next to the source, in exports (${jsq.output})`);
  ok(jsq.started >= j4k.ended - 1500, 'the second started when the first ended');
  ok(jsq.size > 0 && jsq.seconds != null, 'size and time known');
  const note = toasts().find((t) => t.classList.contains('rq-done') && t.textContent.includes(Renders.core.base(jsq.output)));
  out.note = note?.textContent;
  ok(note && ['Open', 'Folder', 'Copy path', 'Review'].every((b) => [...note.querySelectorAll('button')].some((x) => x.textContent === b)), `the done note has Open / Show in folder / Copy path / Review (${out.note})`);
  ok(Renders.actionsFor(jsq).some((a) => a.label === 'Show in folder') && Renders.core.revealLabel('darwin') === 'Reveal in Finder' && Renders.core.revealLabel('win32') === 'Show in Explorer', 'reveal named per system');
  const lib = await window.hub.kvGet('video-library', {});
  ok((lib.recordings || []).includes(jsq.output), 'renders from the queue join Video Review\'s library');
  await shot('done');

  // ---- 6. a Video Review export goes through the same queue ----
  const x = await Review.runExport('square', { path: `${VIDS}/square_loop.mp4` });
  ok(x?.id && Renders.owns(x.id), 'Review.runExport is a queue job');
  const ev = await x.done;
  ok(ev.code === 0, `the export finished (${ev.code} ${ev.error || ''})`);
  ok(Renders.get(x.id)?.status === 'done', 'and is done in the queue');
  ok(Progress.get(`job:${x.id}`)?.state === 'done' || !Progress.get(`job:${x.id}`), 'its bar finished');
  ok(Review.state.lib.exports.includes(ev.output), 'it is in Video Review\'s exports');
  // (Video Review's folder watcher also says "New render: …" for a file landing in a watched folder: not a done note)
  const doneNotes = () => toasts().filter((t) => /square_loop_square/.test(t.textContent) && !/^New render/.test(t.textContent));
  await until(() => doneNotes().length, 5000); await wait(500);
  ok(doneNotes().length === 1 && doneNotes()[0].classList.contains('rq-done'), `one done note for it, the queue's (${doneNotes().map((t) => `${t.className}: ${t.textContent}`).join(' // ')})`);

  // ---- 7. a failure in plain words, with its fix, in the error log ----
  const bad = Renders.enqueue({ input: `${VIDS}/gone.mp4`, preset: 'vertical' });
  await until(() => bad.status === 'failed', 15000);
  out.fail = bad.error;
  ok(bad.status === 'failed' && /isn't there/.test(bad.error?.reason || '') && /Retry/.test(bad.error?.fix || ''), `plain words and a fix (${JSON.stringify(bad.error)})`);
  ok(toasts().some((t) => t.classList.contains('rq-fail') && /Fix:/.test(t.textContent) && [...t.querySelectorAll('button')].some((b) => /Retry/.test(b.textContent))), 'the failure note says the fix, with Retry');
  await wait(1700);
  ok(Habits.top(30).some((e) => /Render failed/.test(e.sample) && e.fix), 'it is in /habits errors with its fix');
  ok(Renders._test.unseen() > 0 || badge()?.dataset.state === 'failed', 'the badge keeps it until seen');

  // ---- 8. re-render with the same settings, then Trash ----
  const ag = await say('/renders again 2');
  out.again = ag;
  const nj = Renders.list().at(-1);
  ok(/same settings/.test(ag) && nj && nj.id !== jsq.id, `re-render queued (${ag})`);
  await until(() => nj.status === 'done', 120000);
  ok(nj.status === 'done' && / \(2\)\.mp4$/.test(nj.output || ''), `a new file next to it (${nj.output})`);
  const tr = await say(`/renders trash ${nj.output.split('/').pop().replace(/\.mp4$/, '')}`);
  ok(/Trash/.test(tr) && !(await window.hub.fs.stat(nj.output).catch(() => null)), `moved to the Trash (${tr})`);

  // ---- 9. the list, history, right-click ----
  Renders.close(); Renders.open({ tab: 'history' });
  await wait(200);
  ok(document.querySelectorAll('.rq-pop .rq-row').length >= 4, `the history lists them (${document.querySelectorAll('.rq-pop .rq-row').length})`);
  const row = document.querySelector(`.rq-pop .rq-row[data-rq="${jsq.id}"]`);
  row?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 200 }));
  await wait(200);
  const menuText = document.getElementById('menu')?.textContent || '';
  out.menu = menuText.slice(0, 200);
  ok(/Show in folder/.test(menuText) && /Copy path/.test(menuText) && /Open in Video Review/.test(menuText) && /Re-render/.test(menuText), `right-click: reveal, copy path, Video Review, re-render (${out.menu})`);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  Renders.close();
  const hist = await window.hub.kvGet('renders', {});
  ok((hist.history || []).length >= 4 && hist.history.some((h) => h.id === jsq.id && h.again), 'the history is saved, with how to make it again');

  // ---- 10. a recording shows live ----
  await Capture.record({ target: 'selector:#rail', fps: 30, audio: 'none', countdown: 0, mp4: false, cursor: 'off' });
  ok(await until(() => Renders.list().some((j) => j.kind === 'record' && j.status === 'running'), 4000), 'a recording is in the list');
  await wait(1500);
  await Capture.stop({ quiet: true }).catch((err) => { out.recError = err.message; });
  const rec = Renders.list().find((j) => j.kind === 'record');
  ok(await until(() => rec?.status === 'done' && rec.output, 15000), `the recording is done with its file (${rec?.status} ${rec?.output})`);

  // ---- 11. the Render panel ----
  activate('tool:ae'); await wait(200);
  ok(store.get('renders.last', {}).presets?.includes('yt4k'), '/renders render remembers its presets too');
  store.set('renders.last', { presets: ['vertical'] });
  const dlg = await Renders.panel({ source: 'video' });
  await wait(200);
  const chips = [...dlg.querySelectorAll('.rq-chip')].map((c) => c.textContent);
  out.chips = chips.join(' | ');
  ok(['Reels / TikTok / Shorts', 'Story', 'Square', 'YouTube 1080p', 'YouTube 4K', 'GIF loop', 'WebM (VP9)', 'ProRes master', 'Audio only', '✦ All socials'].every((c) => chips.includes(c)), `the presets are chips (${out.chips})`);
  [...dlg.querySelectorAll('.rq-chip')].find((c) => c.textContent === '✦ All socials').click(); await wait(50);
  const goBtn = dlg.querySelector('.modal-actions .primary');
  ok(/Render [45]/.test(goBtn.textContent), `all socials picks four (${goBtn.textContent})`);
  dlg.querySelector('.rq-d-more').click(); await wait(50);
  ok(dlg.querySelector('.rq-d-details') && /Frame rate/.test(dlg.textContent) && /Quality/.test(dlg.textContent) && /Size/.test(dlg.textContent), 'details: frame rate, quality, size');
  await shot('panel');
  [...dlg.querySelectorAll('.rq-chip')].find((c) => c.textContent === 'Draft').click(); await wait(50);
  goBtn.click(); await wait(400);
  const socials = Renders.list().filter((j) => j.status !== 'done' && j.status !== 'failed' && j.status !== 'cancelled');
  ok(socials.length >= 4, `four socials queued (${socials.length})`);
  ok(JSON.stringify(store.get('renders.last', {}).presets) === JSON.stringify(['vertical', 'feed45', 'square', 'yt1080']) && store.get('renders.last', {}).quality === 'draft', `the choices are remembered (${JSON.stringify(store.get('renders.last'))})`);
  const pa = await say('/renders pause all');
  ok(/Paused [45]/.test(pa), `/renders pause all (${pa})`);
  const ca = await say('/renders cancel all');
  ok(/Cancelled [45]/.test(ca), `/renders cancel all (${ca})`);
  await until(() => !Renders.list().some((j) => ['queued', 'running', 'starting', 'paused'].includes(j.status)), 10000);
  ok(!Renders.list().some((j) => ['queued', 'running', 'starting', 'paused'].includes(j.status)), 'nothing left running');
  // the export menu has the entry
  ok(typeof Review.exportMenu === 'function', 'Video Review export menu');

  // ---- 12. idle: nothing ticks ----
  await say('/renders clear');
  Renders.open(); await wait(300);
  let idle = 0;
  const mo2 = new MutationObserver((l) => { idle += l.length; });
  mo2.observe(document.querySelector('.rq-pop'), { subtree: true, childList: true, characterData: true, attributes: true });
  await wait(2000); mo2.disconnect();
  ok(idle === 0, `the open list is still when nothing runs (${idle} changes)`);
  Renders.close();
  await wait(700);
  ok(!badge() || badge().hidden || badge().dataset.state === 'failed', 'the badge leaves when nothing renders');
} catch (err) {
  fail.push(`threw: ${err.stack || err.message}`);
}
return JSON.stringify({ ok: !fail.length, problems: fail, ...out }, null, 1);
