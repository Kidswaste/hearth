// The render queue with the Lab sequence (round 13): a short test sequence (red 1.5 s · green 1.5 s, the song
// /tmp/hearth-test-song.wav) rendered from the sequence itself shows in the queue (paused from there: the frames stop,
// then go on), its done note replaces the sequence's own (one note, with Reveal / Copy path / Video Review); presets
// rendered from the queue (/renders render square gif seq): the Lab lane runs one at a time, Square renders at its
// own pixels, the GIF is the sequence's render converted after it (a chain); cancelling a sequence render from the
// queue frees the Lab; a comp render (ThreeSeq.renderScene) is shown too; re-render a sequence render from history.
//   node dev/make-lab-footage.js /tmp/labframes-media
//   node dev/smoke.js --check-timeout 900000 --script dev/checks/renders-seq.js --shot /tmp/renders-seq.png
const { wait, until } = SQL;
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const C = H.claudeAgent();
const say = async (line) => { let text = ''; await Commands.tryRun(line, C.id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const toasts = () => [...document.querySelectorAll('#toasts .toast')];
const seqJobs = () => Renders.list().filter((j) => j.kind === 'seq');
try {
  const ids = await SQL.scenes();
  await ThreeSeq.create('RQ seq', { empty: true, format: '9:16', show: true });
  await ThreeSeq.add({ sketch: ids.red }, { dur: 1.5, trans: null });
  await ThreeSeq.add({ sketch: ids.green }, { dur: 1.5, trans: null });
  await ThreeSeq.add({ path: SQL.SONG, song: true });
  await wait(600);
  ok(ThreeSeq.status().frames === 90, `a 90-frame sequence (${ThreeSeq.status().frames})`);

  // ---- 1. rendered from the sequence: shown, paused, resumed, one note ----
  const p1 = ThreeSeq.render({ format: '1:1', crf: 26 });
  ok(await until(() => seqJobs().some((j) => j.status === 'running'), 15000), 'the sequence render is in the queue');
  const j1 = seqJobs().find((j) => j.status === 'running');
  out.title = j1?.title;
  ok(/RQ seq/.test(j1?.title || ''), `named after the sequence (${j1?.title})`);
  await until(() => j1.pct > 12, 60000);
  ok(await Renders.pause(j1.id), 'pause from the queue');
  await wait(1200);
  const held = j1.pct; await wait(2500);
  out.paused = [held, j1.pct];
  ok(j1.pct === held && j1.status === 'paused', `frames stop while paused (${held} → ${j1.pct})`);
  ok(ThreeSeq.rendering, 'the render is still there');
  await Renders.resume(j1.id);
  const r1 = await p1;
  await wait(800);
  ok(j1.status === 'done' && j1.output === r1.path, `done with its file (${j1.status} ${j1.output})`);
  ok(j1.again?.type === 'seq-direct' && j1.again.key && j1.again.opts.format === '1:1', 'it knows how to render it again');
  const notes = toasts().filter((t) => t.textContent.includes(Renders.core.base(r1.path)));
  out.notes = notes.map((t) => t.textContent);
  ok(notes.length === 1 && notes[0].classList.contains('rq-done'), `one note, the queue's (${out.notes.join(' // ')})`);
  ok(!toasts().some((t) => /^Rendered /.test(t.textContent)), 'not the sequence\'s own note as well');

  // ---- 2. presets from the queue: Square at its pixels, GIF converted after ----
  const said = await say('/renders render square gif seq quality=draft');
  out.said = said;
  const sq = seqJobs().find((j) => /Square/.test(j.title) && j.status !== 'done');
  const gseq = seqJobs().find((j) => /GIF/.test(j.title));
  const gconv = Renders.list().find((j) => j.kind === 'ffmpeg' && j.after === gseq?.id);
  ok(sq && gseq && gconv, `three jobs: Square, the sequence for the GIF, the conversion (${said})`);
  await until(() => sq?.status === 'running' || gseq?.status === 'running', 20000);
  ok([sq, gseq].filter((j) => j.status === 'running' || j.status === 'starting').length === 1, `the Lab renders one at a time (${sq?.status} ${gseq?.status})`);
  ok(gconv.status === 'queued' && /waiting/.test(Renders.words(gconv)), 'the conversion waits for its sequence render');
  ok(await until(() => gconv.status === 'done' && sq.status === 'done', 400000), `all done (${sq.status} ${gseq.status} ${gconv.status} ${sq.error?.reason || gseq.error?.reason || gconv.error?.reason || ''})`);
  const psq = await window.hub.video.probe(sq.output); const pg = await window.hub.video.probe(gconv.output);
  ok(psq?.w === 1080 && psq?.h === 1080 && psq.audio, `Square at 1080×1080 with the song (${psq?.w}×${psq?.h})`);
  ok(pg?.codec === 'gif' && pg?.w === 720, `the GIF (${pg?.codec} ${pg?.w})`);
  ok(toasts().some((t) => t.textContent.includes(Renders.core.base(gconv.output))) && !toasts().some((t) => t.classList.contains('rq-done') && t.textContent.includes(Renders.core.base(gseq.output))), 'one note for the chain (the GIF), not its middle step');

  // ---- 3. cancel a sequence render from the queue ----
  const p3 = ThreeSeq.render({ format: '9:16', crf: 30 }).catch((err) => err);
  await until(() => seqJobs().some((j) => j.status === 'running'), 15000);
  const j3 = seqJobs().find((j) => j.status === 'running');
  await until(() => j3.pct > 5, 60000);
  const c3 = await say('/renders cancel 1');
  const e3 = await p3;
  ok(/Cancelled/.test(c3) && j3.status === 'cancelled' && e3 instanceof Error, `cancelled (${c3} · ${j3.status})`);
  ok(!ThreeSeq.rendering, 'the Lab is free again');
  ok(!toasts().some((t) => t.classList.contains('rq-fail') && /RQ seq/.test(t.textContent)), 'a cancel is not a failure');

  // ---- 4. a comp / scene render (renderScene, quiet) shows too, without a note of its own ----
  const p4 = ThreeSeq.renderScene(ids.blue, { secs: 1, format: '1:1', name: 'RQ comp' });
  ok(await until(() => seqJobs().some((j) => /RQ comp/.test(j.title)), 20000), 'a comp render is in the queue');
  const r4 = await p4;
  const j4 = seqJobs().find((j) => /RQ comp/.test(j.title));
  ok(j4?.status === 'done' && j4.output === r4.path, 'and done');

  // ---- 5. re-render from history ----
  const ag = await Renders.retry(j1.id);
  ok(ag?.kind === 'seq', 're-render goes through the queue');
  ok(await until(() => ag.status === 'done', 200000), `re-rendered (${ag?.status} ${ag?.error?.reason || ''})`);
  ok(ag.output && ag.output !== j1.output, `a new file (${ag.output})`);
  const hist = Renders.history();
  ok(hist.filter((h) => h.kind === 'seq').length >= 4, 'the history keeps the sequence renders');
} catch (err) {
  fail.push(`threw: ${err.stack || err.message}`);
}
return JSON.stringify({ ok: !fail.length, problems: fail, ...out }, null, 1);
