// Video projects (intro*.js) end to end with the fake engines: a mood board linked to the chat, /intro proposes a
// plan, Astra decides the details, a song cuts it on the beat, ▶ Make it runs every step for real — the vibe, a
// Claude ⇄ Astra jam per Lab beat (real MCP builds), capture tours filming Hearth itself, the edit assembled in the
// video editor, the Video Director's pass with the editor + capture tools (real MCP calls), the frame-exact review
// with Astra's notes as markers, and ffmpeg renders in three formats with covers — then redo a beat, undo a step,
// Claude ⇄ Astra handoff, the 6 s cut-down, post text, the agents' op, menus, keys and commands.
// Before: sh dev/board-fixtures.sh && node dev/make-test-song.js /tmp/hearth-intro-song.wav 120 30
//   node dev/smoke.js --fake-engines --eval "window.INTRO_OUT='/tmp/intro-out'" --script dev/checks/intro.js --wait 6000 --check-timeout 900000 --shot /tmp/intro.png
// window.INTRO_OUT (optional): the renders, covers and the sheet are copied there to look at afterwards.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const out = { fails: [] };
const ok = (cond, msg) => { if (!cond) out.fails.push(msg); return cond; };
const C = H.claudeAgent();
const FIX = '/tmp/hearth-board-fixtures';
const SONG = '/tmp/hearth-intro-song.wav';
const OUT = window.INTRO_OUT || null;
const shots = window.SMOKE_SAVES || '/tmp';
const run = async (line, agentId = C.id) => { let said = ''; let err = ''; await Commands.tryRun(line, agentId, null, { say: (t) => { said += `${t}\n`; }, note: (t) => { said += `${t}\n`; }, error: (m) => { err = m; }, source: 'code', history: false }); return err ? `ERR ${err}` : said.trim(); };
const card = (p) => document.querySelector(`.intro-card[data-pid="${p.id}"]`);
const t0 = Date.now();
try {

// ---------- commands, keys, entry ----------
out.cmds = ['intro', 'video-projects', 'cut-downs', 'post-text', 'film'].map((n) => [n, Commands.get(n)?.area]);
ok(out.cmds.every(([, a]) => a === 'Video project'), `commands registered ${JSON.stringify(out.cmds)}`);
out.alias = Commands.get('make-video')?.name;
out.dups = Commands.duplicates();
ok(!out.dups.length, `no duplicate commands ${out.dups}`);
out.keys = (Keys.groups(true).get('Video project') || []).map((k) => k.keys);
ok(out.keys.length >= 12, `keys listed (${out.keys.length})`);
out.tucked = Simplify.TUCKED.some(([id]) => id === 'intro-btn') && Boolean(document.getElementById('intro-btn'));
ok(out.tucked, 'the rail ⋯ entry');
out.entry = IntroCard.entryItems().map((x) => (typeof x === 'string' ? x : x.label));
ok(out.entry.includes('Intro for Hearth') && out.entry.includes('From a template'), `entry menu ${out.entry}`);
// the palette lists it
out.palette = AppUI.actions().filter((a) => /video/i.test(a.label || a[0] || '')).length;

// ---------- a board with a vibe, linked to this chat ----------
activate(C.id); await wait(300);
Native.ensureChat(C.id, 'Intro test');
const chatId = Native.chatOf(C.id).id;
await run('/board-new Intro refs');
activate(C.id); await wait(200);
await run('/board-link Intro refs');
await run(`/board-add ${FIX}/neon big.png`);
await run(`/board-add ${FIX}/golden-hour.jpg`);
await run('/board-add #ff2e88 #0b0f1a #2de2e6');
const board = await Board.boardFor(chatId);
await until(() => board.items.filter((i) => i.type === 'image').every((i) => i.vibe), 30000);
activate(C.id); await wait(300);

// ---------- /intro proposes a plan ----------
await run('/intro');
let p = await until(() => Intro.ofChat(chatId));
ok(p, 'a project for this chat');
await until(() => card(p));
out.proposal = { template: p.plan.template, beats: p.plan.beats.length, formats: p.plan.formats, secs: p.plan.secs, vibe: p.vibe?.board?.name, palette: p.vibe?.palette, card: Boolean(card(p)), steps: card(p)?.querySelectorAll('.intro-step').length, film: card(p)?.querySelectorAll('.intro-beat-frame').length, foot: card(p)?.querySelector('.intro-foot')?.textContent };
ok(out.proposal.vibe === 'Intro refs' && out.proposal.palette?.length, `the board's vibe in the plan ${JSON.stringify(out.proposal)}`);
ok(out.proposal.steps === 7 && out.proposal.film === p.plan.beats.length && /Make it/.test(out.proposal.foot), 'the proposal card');
await smoke({ shot: `${shots}/intro-proposal.png` });

// ---------- Astra decides (one lean question) ----------
out.decide = await run('/intro decide');
ok(p.plan.template === 'launch' && p.plan.style.titles === 'forge' && p.plan.style.trans === 'bold', `Astra decided ${out.decide} → ${p.plan.template} ${p.plan.style.titles} ${p.plan.style.trans}`);
out.decideTokens = JSON.stringify(p.tokens);
ok(p.tokens.astra?.turns === 1, `Astra's tokens counted ${out.decideTokens}`);
// the details, by command (the owner's few choices)
out.len = await run('/intro length 10');
out.fmts = await run('/intro formats 9:16 16:9 1:1');
out.rounds = await run('/intro rounds 2');
out.cuts = await run('/intro cuts half');
out.music = await run(`/intro music ${SONG}`);
ok(/120/.test(out.music) && p.music?.bpm > 115 && p.music?.bpm < 125, `music analysed ${out.music}`);
// cuts land on half bars (1 s at 120 bpm)
let acc = 0; out.cutTimes = p.plan.beats.map((b) => { acc += b.secs; return Math.round(acc * 100) / 100; });
ok(out.cutTimes.every((t) => Math.abs(t - Math.round(t)) < 0.03), `cuts on the music ${out.cutTimes}`);
// the director pass is on for this project (Engines menu)
const eng = IntroCard.engineItems(p).find((x) => /Director pass after/.test(x.label));
eng.action(); await wait(100);
ok(p.directorPass === true, 'director pass on from the menu');
out.plan = IntroData.planText(p.plan);

// ---------- ▶ Make it ----------
const mk = [...card(p).querySelectorAll('.intro-foot button')].find((b) => /Make it/.test(b.textContent));
mk.click();
await until(() => Intro.running(), 5000);
// mid-run: the card shows a live step, then a jam runs, then tours film
out.liveState = await until(() => card(p)?.querySelector('.intro-state.live')?.textContent, 20000);
await until(() => p.steps.scenes?.status === 'running' && typeof Jam !== 'undefined' && Jam.running(), 120000);
out.jamRunning = Jam.running();
await smoke({ shot: `${shots}/intro-jam.png` });
await until(() => p.steps.captures?.status === 'running' && CaptureTour.running(), 240000);
out.tourRunning = CaptureTour.running();
await smoke({ shot: `${shots}/intro-tour.png` });
await until(() => !Intro.running(), 600000, 500);
out.runSecs = Math.round((Date.now() - t0) / 1000);
out.status = p.status;
out.error = p.error;
out.steps = Object.fromEntries(Object.entries(p.steps).map(([k, v]) => [k, `${v.status}${v.error ? ` ⚠ ${v.error}` : ''}${v.sub ? ` · ${v.sub}` : ''}`]));
ok(p.status === 'done', `the project is done (${p.status}: ${p.error}) ${JSON.stringify(out.steps)}`);
out.beats = p.plan.beats.map((b) => `${b.n} ${b.kind} ${b.secs}s${b.clip ? ` clip ${b.clip.path.split('/').pop()} ${b.clip.dur}s ${b.clip.w}x${b.clip.h}` : ''}${b.shot ? ' shot' : ''}${b.jam ? ` jam ${b.jam.status} best ${b.jam.best}/${b.jam.rounds}` : ''}${b.review ? ` review exact ${b.review.exact} luma ${b.review.luma}` : ''}${b.error ? ` ⚠ ${b.error}` : ''} “${b.words || ''}”`);
out.notes = p.notes;
// (software WebGL can make the Lab take too short to use: then the scene's still with a push stands in, said on the card)
ok(p.plan.beats.filter((b) => b.kind === 'lab').every((b) => b.jam?.status === 'done' && b.sketchId && (b.clip?.dur >= b.secs * 0.6 || (b.shot && p.notes.some((n) => /Lab take was too short/.test(n))))), 'every Lab beat jammed and recorded (or its still, said)');
out.labTakes = p.plan.beats.filter((b) => b.kind === 'lab').map((b) => (b.clip ? `clip ${b.clip.dur}s` : `still ${b.shot?.split('/').pop()}`));
ok(p.plan.beats.filter((b) => b.kind === 'tour').every((b) => b.clip?.dur >= b.secs * 0.6), `every tour beat filmed (${p.plan.beats.filter((b) => b.kind === 'tour').map((b) => `${b.clip?.dur}/${b.secs}`)})`);
out.tokens = p.tokens;
ok(p.tokens.claude?.turns >= 2 && p.tokens.astra?.turns >= 2, `both engines worked ${JSON.stringify(p.tokens)}`);

// the edit
out.seq = p.seq;
ok(VideoCut.sequences().some((s) => s.key === p.seq), 'the sequence exists');
await Intro.openTheEdit(p);
const e = VideoCut.edit;
out.edit = { clips: e.clips.length, kinds: e.clips.map((c) => c.kind), trans: e.clips.map((c) => c.trans?.type || '-'), titles: (e.tracks || []).filter((k) => k.type === 'text').flatMap((k) => k.items.map((x) => x.text || x.shape)), audio: (e.tracks || []).filter((k) => k.type === 'audio').flatMap((k) => k.items.map((x) => x.src.split('/').pop())), markers: e.markers.map((m) => `${m.t.toFixed(2)} ${m.label}${m.note ? ` — ${m.note}` : ''}`), seq: e.seq, total: CutData.total(e) };
ok(out.edit.clips === p.plan.beats.length && out.edit.audio.length === 1 && out.edit.markers.length >= p.plan.beats.length, `the edit ${JSON.stringify(out.edit)}`);
ok(Math.abs(p.steps.edit.secs - IntroData.total(p.plan)) < 0.1, `the assembled edit lasts the plan (${p.steps.edit.secs} vs ${IntroData.total(p.plan)}; ${out.edit.total} after the director's pass)`);
// the director's pass (real MCP calls): dissolves everywhere, a note on the card, the capture list read
out.director = p.director;
ok(p.director?.ok && p.director.tools >= 4, `the director pass ${JSON.stringify(p.director)}`);
ok(e.clips.slice(1).every((c) => c.trans?.type === 'dissolve'), 'the director put dissolves on every cut');
ok(p.notes.some((n) => /Dissolves on every cut/.test(n)), 'the director noted it on the card (video_edit op project)');
// the review
out.review = { fitted: p.review?.fitted, exact: p.review?.exact, of: p.review?.of, black: p.review?.black, safe: p.review?.safe, notes: p.review?.notes, by: p.review?.by, sheet: Boolean(p.review?.sheet) };
ok(p.review && p.review.exact === p.review.of && p.review.of === p.plan.beats.length, `every beat frame-exact ${JSON.stringify(out.review)}`);
ok(p.review?.notes?.length === 2 && e.markers.filter((m) => m.note).length >= 2, 'review notes as markers');
// renders: three formats, the right sizes and length
out.outputs = [];
for (const o of p.outputs) { const pr = await window.hub.video.probe(o.path); out.outputs.push({ fmt: o.fmt, w: pr?.w, h: pr?.h, dur: pr?.duration, fps: pr?.fps, codec: pr?.codec, audio: pr?.audio?.codec }); }
const want = { '9:16': [1080, 1920], '16:9': [1920, 1080], '1:1': [1080, 1080] };
ok(out.outputs.length === 3 && out.outputs.every((o) => o.w === want[o.fmt][0] && o.h === want[o.fmt][1] && Math.abs(o.dur - out.edit.total) < 0.25 && o.audio), `renders ${JSON.stringify(out.outputs)}`);
out.cover = p.cover;
ok(p.cover?.files && Object.keys(p.cover.files).length === 3, 'a cover per format');
for (const f of Object.values(p.cover?.files || {})) ok(await window.hub.fs.stat(f), `cover ${f}`);
await until(() => card(p)?.querySelectorAll('.intro-out').length === 3);
out.cardDone = { state: card(p)?.querySelector('.intro-state')?.textContent, outs: [...card(p).querySelectorAll('.intro-out')].map((b) => b.textContent), foot: card(p).querySelector('.intro-foot')?.textContent, thumbs: card(p).querySelectorAll('.intro-beat-frame img').length };
ok(out.cardDone.thumbs === p.plan.beats.length, 'every beat has a thumbnail');
activate(C.id); await wait(500);
await smoke({ shot: `${shots}/intro-done.png` });
if (OUT) {
  for (const o of p.outputs) await window.hub.fs.copy(o.path, `${OUT}/${o.path.split('/').pop()}`);
  for (const f of Object.values(p.cover?.files || {})) await window.hub.fs.copy(f, `${OUT}/${f.split('/').pop()}`);
  if (p.review?.sheet) await window.hub.fs.copy(p.review.sheet, `${OUT}/sheet.jpg`);
  for (const b of p.plan.beats) if (b.clip) await window.hub.fs.copy(b.clip.path, `${OUT}/beat${b.n}-${b.kind}.${b.clip.path.split('.').pop()}`);
}

// ---------- the chat's context knows the project ----------
const m = Native.chatOf(C.id).messages.find((x) => x.role === 'intro' && x.pid === p.id);
out.contextText = m?.text;
ok(/Video project/.test(m?.text || '') && /Render done/.test(m?.text || ''), 'the card leaves a short text in the chat');

} catch (err) { out.thrown = String(err.stack || err).slice(0, 600); out.fails.push(`threw: ${err.message}`); }
out.secs = Math.round((Date.now() - t0) / 1000);
return JSON.stringify(out, null, 1);
