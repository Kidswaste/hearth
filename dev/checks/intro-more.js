// Video projects, the controls (fast: a words-only template, one tour beat, no jams): templates and plan edits from
// the menus, words (local suggestions and Astra's rewrite), a full run, ↺ undo per step, ↻ redo one beat, Claude ⇄
// Astra handoff and take-over, the 6 s cut-down, covers, post text, the agents' op (video_edit op project),
// /intro list / open in another chat, /film, the card's right-click menus and keys, Esc stops a run.
//   node dev/smoke.js --fake-engines --script dev/checks/intro-more.js --wait 6000 --check-timeout 600000 --save-dir /tmp/intro-shots
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(step); } return null; };
const out = { fails: [] };
const ok = (cond, msg) => { if (!cond) out.fails.push(msg); return cond; };
const C = H.claudeAgent();
const A = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
const shots = window.SMOKE_SAVES || '/tmp';
const run = async (line, agentId = C.id) => { let said = ''; let err = ''; await Commands.tryRun(line, agentId, null, { say: (t) => { said += `${t}\n`; }, note: (t) => { said += `${t}\n`; }, error: (m) => { err = m; }, source: 'code', history: false }); return err ? `ERR ${err}` : said.trim(); };
const card = (p) => document.querySelector(`.surface.active .intro-card[data-pid="${p.id}"]`) || document.querySelector(`.intro-card[data-pid="${p.id}"]`);
const menuLabels = () => [...document.querySelectorAll('#menu button')].map((b) => b.firstChild?.textContent?.trim()).filter(Boolean);
const t0 = Date.now();
try {
activate(C.id); await wait(300);
Native.ensureChat(C.id, 'Intro controls');
const chatId = Native.chatOf(C.id).id;

// ---------- a plan from the words, then changed from the menus ----------
await run('/intro a 6 second loop for the board');
let p = await until(() => Intro.ofChat(chatId));
out.guess = { template: p.plan.template, secs: p.plan.secs, name: p.name };
ok(p.plan.template === 'loop' && p.plan.secs === 6, `the template and length guessed from the words ${JSON.stringify(out.guess)}`);
// right-click the card: the menu with its submenus
const c1 = await until(() => card(p));
c1.querySelector('.intro-title').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 }));
await wait(150);
out.cardMenu = menuLabels();
ok(['Plan', 'Vibe and music', 'Run', 'Claude ⇄ Astra', 'Output'].every((l) => out.cardMenu.includes(l)), `card menu ${out.cardMenu}`);
hideMenu?.();
// Plan › Template › Kinetic words (nothing to film)
IntroCard.planItems(p).find((x) => x.label === 'Template').items().find((x) => /Kinetic/.test(x.label)).action();
await until(() => p.plan.template === 'kinetic');
ok(p.plan.template === 'kinetic' && p.plan.beats.every((b) => b.kind === 'title' || b.kind === 'end'), 'template from the menu');
// a tour beat in the middle (Kind › Hearth on screen), filming the board
const b2 = p.plan.beats[1];
IntroCard.beatItems(p, b2).find((x) => x.label === 'Kind').items().find((x) => /Hearth on screen/.test(x.label)).action();
await wait(100);
p.plan.beats[1].area = 'chats';
ok(p.plan.beats[1].kind === 'tour', 'kind from the beat menu');
// Length › 2 s on that beat, then words from the local suggestions
const b2b = p.plan.beats[1];
IntroCard.beatItems(p, b2b).find((x) => x.label === 'Length').items().find((x) => x.label === '2 s').action();
await wait(100);
const sug = Intro.wordsFor(p, b2b);
out.suggestions = sug.slice(0, 5);
ok(sug.length >= 5 && sug.some((s) => /Claude and Astra/.test(s)), `word suggestions from the app ${sug}`);
IntroCard.wordItems(p, b2b)[0].action(); await wait(100);
ok(b2b.words === sug[0], 'words from the menu');
// Formats › add 1:1; Titles › Neon; Cuts › Clean
IntroCard.planItems(p).find((x) => x.label === 'Formats').items().find((x) => /^1:1/.test(x.label)).action();
IntroCard.planItems(p).find((x) => x.label === 'Titles').items().find((x) => x.label === 'Neon').action();
await wait(100);
ok(p.plan.formats.includes('1:1') && p.plan.style.titles === 'neon' && p.styleLocked, `formats and titles ${p.plan.formats} ${p.plan.style.titles}`);
// Astra rewrites the words (one lean question)
out.words = await run('/intro words');
ok(/rewrote/.test(out.words) && p.plan.beats[0].words === 'One window.', `Astra's words ${out.words} → ${p.plan.beats.map((b) => b.words)}`);
out.copy = await run('/intro copy lab');
ok(/Visuals you shape with sliders/.test(out.copy), 'copy suggestions');
out.statsCopy = await run('/intro copy');
ok(/chat commands/.test(out.statsCopy), `numbers from the app ${out.statsCopy.slice(-200)}`);
out.plan = await run('/intro plan');

// ---------- a quick run (words + one tour; no jams, no AI review) ----------
p.reviewAsk = false;
out.go = await run('/intro go');
await until(() => !Intro.running(), 300000, 400);
out.steps = Object.fromEntries(Object.entries(p.steps).map(([k, v]) => [k, `${v.status}${v.error ? ` ⚠ ${v.error}` : ''}`]));
ok(p.status === 'done', `quick run done ${p.status} ${p.error} ${JSON.stringify(out.steps)}`);
out.outputs = [];
for (const o of p.outputs) { const pr = await window.hub.video.probe(o.path); out.outputs.push(`${o.fmt} ${pr?.w}x${pr?.h} ${pr?.duration}s`); }
ok(p.outputs.length === 2, `two formats rendered ${out.outputs}`);
const tourClip1 = p.plan.beats[1].clip?.path;
ok(tourClip1, 'the tour beat filmed');
await smoke({ shot: `${shots}/intro-more-done.png` });

// ---------- ↺ undo per step ----------
const reviewWas = p.review?.at;
out.undo = await run('/intro undo render');
ok(/before Render/.test(out.undo) && p.steps.render?.status !== 'done' && p.outputs.length === 0, `undo render ${out.undo} ${p.steps.render?.status} ${p.outputs.length}`);
out.undo2 = await run('/intro undo edit');
ok(!VideoCut.sequences().some((s) => s.key === `seq:${p.name}`) || p.seq === null, `undo edit removes the fresh sequence (${p.seq})`);
ok(p.steps.edit?.status !== 'done' && p.steps.review?.status !== 'done', 'undo edit also takes the later steps back');
// ▶ from Edit again (the step pill's click)
const editPill = card(p).querySelector('.intro-step[data-step="edit"]');
editPill.click();
await until(() => !Intro.running() && p.steps.render?.status === 'done', 300000, 400);
ok(p.seq && p.steps.edit.status === 'done' && p.outputs.length === 2, `from Edit again ${JSON.stringify(Object.fromEntries(Object.entries(p.steps).map(([k, v]) => [k, v.status])))}`);
ok(p.review?.at !== reviewWas, 'the review ran again');

// ---------- ↻ redo one beat ----------
out.redo = await run('/intro redo 2');
await until(() => !Intro.running(), 200000, 400);
ok(/Beat 2 redone/.test(out.redo) && p.plan.beats[1].clip?.path && p.plan.beats[1].clip.path !== tourClip1, `redo beat 2: a new take ${out.redo}`);
ok(p.steps.render?.status === 'stale' && p.steps.review?.status === 'done', `after a redo the render is stale (${p.steps.render?.status})`);

// ---------- Claude ⇄ Astra ----------
out.handoff = await run('/intro handoff');
ok(p.lead === 'astra' && p.reviewBy === 'claude' && /Astra leads/.test(out.handoff), `handoff ${out.handoff}`);
out.takeOver = await Intro.takeOver(p, 'review');
ok(p.review?.by === 'claude' && /Claude reviewed/.test(out.takeOver), `Claude takes the review over ${out.takeOver} ${p.review?.by}`);
out.task = Intro.taskText(p);
ok(/Astra leads/.test(out.task) && /Done:/.test(out.task) && out.task.length < 1200, `the task text for the other AI (${out.task.length} chars)`);
out.handBack = await run('/intro handoff claude');

// ---------- the 6 s cut-down, covers, post text ----------
out.cut = await run('/cut-downs 6');
const cut = p.cuts.find((x) => x.secs === 6);
const cpr = cut?.outputs[0] && await window.hub.video.probe(cut.outputs[0].path);
out.cutProbe = cpr && `${cpr.w}x${cpr.h} ${cpr.duration}s`;
ok(cut && cpr && Math.abs(cpr.duration - 6) < 0.3 && cpr.w === 1080 && cpr.h === 1920, `6 s cut ${out.cut} ${out.cutProbe}`);
out.cover = await run('/intro cover end');
ok(/Cover \(end\)/.test(out.cover) && p.cover.beat === p.plan.beats.at(-1).n && Object.keys(p.cover.files).length === 2, `cover on the end card ${out.cover}`);
out.post = await run('/post-text tiktok');
out.draft = document.querySelector('.surface.active .composer textarea')?.value;
ok(/#ai/.test(out.draft || '') && /#motiondesign/.test(out.draft || ''), `post text in the chat box ${out.draft}`);
const ta = document.querySelector('.surface.active .composer textarea'); if (ta) { ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true })); }

// ---------- the agents' op (what the Video Director calls) ----------
const op = async (a) => (await VideoEditTools.handle('video_edit', { op: 'project', ...a }));
out.opStatus = (await op({ action: 'status' })).value;
ok(/Render/.test(out.opStatus) && /Beats:/.test(out.opStatus), 'op status');
out.opBeat = (await op({ action: 'beat', beat: 1, words: 'Made by two AIs' })).value;
ok(p.plan.beats[0].words === 'Made by two AIs' && p.steps.edit.status === 'stale', `op beat ${out.opBeat}`);
out.opNote = (await op({ action: 'note', text: 'Tighter cut on beat 2' })).value;
ok(p.notes.some((n) => /Tighter cut/.test(n)), 'op note');
out.opBad = await op({ action: 'nope' });
ok(out.opBad.ok === false && /project actions/.test(out.opBad.error), 'op help on a bad action');
out.opHelp = (await VideoEditTools.handle('video_edit', { op: 'help' })).value;
ok(/project \{action/.test(out.opHelp), 'video_edit help lists the project op');

// ---------- the list, reopen in another chat, the entry menu ----------
out.list = await run('/intro list');
ok(/Your video projects/.test(out.list) && out.list.includes(p.name), 'list');
if (A) {
  activate(A.id); await wait(300);
  Native.ensureChat(A.id, 'Elsewhere');
  await run(`/intro open ${p.name}`, A.id);
  out.reopened = await until(() => document.querySelector(`.surface.active .intro-card[data-pid="${p.id}"]`));
  ok(out.reopened && p.chats.includes(Native.chatOf(A.id).id), 'reopened in Astra\'s chat');
  activate(C.id); await wait(300);
}
IntroCard.entryMenu(200, 100); await wait(150);
out.entryMenu = menuLabels();
ok(out.entryMenu.includes('Your video projects') && out.entryMenu.some((l) => /Go on with/.test(l)), `entry menu ${out.entryMenu}`);
hideMenu?.();
// the key opens the same menu
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', code: 'KeyI', ctrlKey: true, altKey: true, bubbles: true }));
await wait(150);
out.keyMenu = menuLabels()[0] || document.querySelector('#menu .menu-head')?.textContent;
ok(!document.getElementById('menu').hidden, 'Ctrl+Alt+I opens the menu');
hideMenu?.();

// ---------- a step's and a beat's right-click menus ----------
card(p).querySelector('.intro-step[data-step="review"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 }));
await wait(120);
out.stepMenu = menuLabels();
ok(out.stepMenu.some((l) => /Undo Review/.test(l)) && out.stepMenu.some((l) => /does it instead/.test(l)), `step menu ${out.stepMenu}`);
hideMenu?.();
card(p).querySelector('.intro-beat-frame[data-n="2"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 }));
await wait(120);
out.beatMenu = menuLabels();
ok(out.beatMenu.some((l) => /Redo this beat/.test(l)) && out.beatMenu.includes('What it films'), `beat menu ${out.beatMenu}`);
hideMenu?.();
// a click picks a beat: its detail row; ← / → move
card(p).querySelector('.intro-beat-frame[data-n="2"]').click();
await until(() => card(p)?.querySelector('.intro-beat'));
out.beatRow = card(p).querySelector('.intro-beat-line')?.textContent;
ok(/Hearth on screen/.test(out.beatRow || ''), `beat row ${out.beatRow}`);
const film = card(p).querySelector('.intro-film'); film.focus();
film.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
await wait(200);
ok(IntroCard.selected.get(p.id) === 3, `→ picks the next beat (${IntroCard.selected.get(p.id)})`);
await smoke({ shot: `${shots}/intro-more-menus.png` });

// ---------- /film one Hearth moment; Esc stops a run ----------
out.film = await run('/film lab-push 1:1');
ok(/🎬/.test(out.film), `film ${out.film}`);
const fp = await window.hub.video.probe(Capture.last()?.path);
out.filmProbe = fp && `${fp.w}x${fp.h} ${fp.duration}s`;
ok(fp?.w === 1080 && fp?.h === 1080, `filmed square ${out.filmProbe}`);
Intro.run(p, { from: 'edit' }).catch(() => {});
await until(() => Intro.running());
await wait(300);
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
await until(() => !Intro.running(), 60000);
ok(p.status === 'stopped' || p.status === 'done', `Esc stopped it (${p.status})`);
out.status = p.status;
out.statusText = (await run('/intro status')).split('\n').slice(0, 3).join(' | ');

// ---------- remove from the list (files stay) ----------
const outPath = p.outputs[0]?.path || p.cuts[0]?.outputs[0]?.path;
out.remove = await Intro.remove(p);
ok(!Intro.get(p.id) && (!outPath || await window.hub.fs.stat(outPath)), 'removed from the list, files kept');
await until(() => document.querySelector('.intro-card.gone'));
ok(document.querySelector('.intro-card.gone'), 'its cards say it was removed');
out.dups = Commands.duplicates();
ok(!out.dups.length, 'no duplicate commands');
} catch (err) { out.thrown = String(err.stack || err).slice(0, 600); out.fails.push(`threw: ${err.message}`); }
out.secs = Math.round((Date.now() - t0) / 1000);
return JSON.stringify(out, null, 1);
