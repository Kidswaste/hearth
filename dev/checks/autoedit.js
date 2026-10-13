// Auto-edit (round 27, autoedit): "drop a song, get a whole music video". The 🎬 next to the song (shown only with a
// song), the plan as a strip (a block per section, nothing made yet), changing a section from its menu (length, scene,
// transition, look), the director's view and edits (three_do autoedit), a section that wants a new scene: Make it shows
// the crew's cost first and makes nothing when you say no, then Make it with existing scenes: the Lab sequence (one
// clip per cut, every cut on a bar, the song under it, a marker per section, a look per clip, lyrics as captions),
// Render ▾ (9:16 / 16:9 / 1:1 through the usual render), ✦ More › ⇪ Make, the ◎ mission, and no "/command" talk.
//   node dev/make-test-song.js /tmp/hearth-autoedit-song.wav 128 0 --form
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/autoedit.js --shot /tmp/autoedit.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;
const SONG = '/tmp/hearth-autoedit-song.wav';
const rowsOf = () => [...document.querySelectorAll('#menu button')].filter((b) => b.offsetParent).map((b) => b.textContent.trim());
const clickRow = (start) => { const b = [...document.querySelectorAll('#menu button')].find((x) => x.offsetParent && x.textContent.trim().replace(/^● /, '').startsWith(start)); b?.click(); return Boolean(b); };
const esc = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
const seen = [];

await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
const dir = H.agents().find((a) => a.dock === 'three');
const ids = Object.values(await SQL.scenes());
const c = await SQL.lab();
const loaded = await until(() => typeof AutoEdit !== 'undefined' && typeof AutoEditCore !== 'undefined', 20000);
step('loaded with the Lab: AutoEdit, AutoEditCore, the transitions and looks it offers exist', loaded && AutoEditCore.TRANS.every((t) => t.id === 'cut' || EditFX.TRANS[t.id]) && AutoEditCore.LOOKS.every((l) => EditFX.LOOK[l.id]),
  AutoEditCore.TRANS.filter((t) => t.id !== 'cut' && !EditFX.TRANS[t.id]).map((t) => t.id).concat(AutoEditCore.LOOKS.filter((l) => !EditFX.LOOK[l.id]).map((l) => l.id)));

// ---------- 1. the 🎬 next to the song ----------
const vb = () => document.querySelector('.mb-video');
step('🎬 is hidden without a song', vb() && vb().hidden);
await c.loadSong(SONG);
await until(() => c.player.analysis?.sections?.length, 30000);
await wait(300);
step('🎬 shows next to the song once one is loaded', vb() && !vb().hidden && vb().offsetParent, c.player.analysis?.sections?.map((s) => s.label));
const seqsBefore = (await ThreeSeq.list()).length;
vb().click();
await until(() => AutoEdit.plan && document.querySelectorAll('.ae-sec').length, 40000);
const p0 = AutoEdit.plan;
const blocks = [...document.querySelectorAll('.ae-sec')];
step('the plan shows as a strip: a block per section, intro to outro, drops included', blocks.length === p0.sections.length && blocks.length >= 4 && p0.sections.some((s) => s.label === 'Drop') && /Intro|Build/.test(p0.sections[0].label), p0.sections.map((s) => `${s.label} ${s.bars}`));
step('…its scenes: the one on screen and your saved ones (nothing new to pay for with 3 scenes)', p0.sections.every((s) => s.scene.kind === 'scene') && new Set(p0.sections.map((s) => s.scene.sketch)).size >= 2, p0.sections.map((s) => s.scene.name));
step('…intensity follows the energy (the drops are the most intense, cut on every bar)', p0.sections.filter((s) => s.label === 'Drop').every((s) => s.intensity >= Math.max(...p0.sections.filter((x) => x.label !== 'Drop').map((x) => x.intensity)) && s.cuts <= 2), p0.sections.map((s) => [s.label, s.intensity, s.cuts]));
step('nothing is made yet (no new sequence)', (await ThreeSeq.list()).length === seqsBefore && !AutoEdit.key);
const panelText = () => document.querySelector('.ae-panel')?.innerText || '';
seen.push(panelText());
await smoke({ shot: '/tmp/autoedit-strip.png' });

// ---------- 2. changing a section from its menu ----------
const b1 = document.querySelector('.ae-sec[data-i="1"]'); const r1 = b1.getBoundingClientRect();
b1.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r1.left + 10, clientY: r1.top + 10 }));
await until(() => rowsOf().some((t) => t.startsWith('Scene')), 3000);
const menu = rowsOf(); seen.push(...menu);
step('a block\'s menu: Scene, Length, Transition in, Look', ['Scene', 'Length', 'Transition in', 'Look'].every((s) => menu.some((t) => t.startsWith(s))), menu);
const bars0 = AutoEdit.plan.sections[1].bars; const next0 = AutoEdit.plan.sections[2].bars;
clickRow('Length'); await until(() => rowsOf().some((t) => t.startsWith('+1 bar')), 2000); clickRow('+1 bar'); await wait(150);
step('Length › +1 bar: the section grows a bar, the next one gives it', AutoEdit.plan.sections[1].bars === bars0 + 1 && AutoEdit.plan.sections[2].bars === next0 - 1, [bars0, AutoEdit.plan.sections[1].bars, next0, AutoEdit.plan.sections[2].bars]);
const other = ThreeLab.scenes.get(ids.find((id) => id !== AutoEdit.plan.sections[1].scene.sketch));
document.querySelector('.ae-sec[data-i="1"]').dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: r1.left + 10, clientY: r1.top + 10 }));
await until(() => rowsOf().some((t) => t.startsWith('Scene')), 2000); clickRow('Scene'); await until(() => rowsOf().some((t) => t.includes('A new one')), 2000);
seen.push(...rowsOf());
clickRow(other.name); await wait(150);
step('Scene › another scene', AutoEdit.plan.sections[1].scene.sketch === other.id, AutoEdit.plan.sections[1].scene);
document.querySelector('.ae-sec[data-i="1"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r1.left + 10, clientY: r1.top + 10 }));
await until(() => rowsOf().some((t) => t.startsWith('Transition in')), 2000); clickRow('Transition in'); await until(() => rowsOf().some((t) => t.includes('Glitch stutter')), 2000);
clickRow('⋯ Glitch stutter'); await wait(150);
step('right-click › Transition in › Glitch stutter', AutoEdit.plan.sections[1].trans === 'lab-stutter', AutoEdit.plan.sections[1].trans);
esc();

// ---------- 3. the director: three_do autoedit ----------
const show = await HubBridge.call('three_do', { cmd: 'autoedit', op: 'show' });
step('three_do autoedit show: the plan in a few lines (one per section)', show.ok && show.value.split('\n').length === AutoEdit.plan.sections.length + 1 && /Glitch stutter/.test(show.value), show.value?.slice(0, 300) || show.error);
const set = await HubBridge.call('three_do', { cmd: 'autoedit', op: 'set', section: 1, look: 'bw', cuts: 1 });
step('three_do autoedit set: a look and the cuts of a section (the strip follows)', set.ok && AutoEdit.plan.sections[0].look === 'bw' && AutoEdit.plan.sections[0].cuts === 1 && /Black & white/.test(document.querySelector('.ae-sec[data-i="0"]').textContent), set.error);
const bad = await HubBridge.call('three_do', { cmd: 'autoedit', op: 'set', section: 1, trans: 'nope' });
step('…a wrong value is a clean error', !bad.ok && /No transition/.test(bad.error), bad.error);

// ---------- 4. a new scene: the crew's cost first, nothing made on "no" ----------
await HubBridge.call('three_do', { cmd: 'autoedit', op: 'set', section: 2, scene: 'new' });
step('a section can ask for a new scene (shown dashed, the cost line in the footer)', document.querySelector('.ae-sec[data-i="1"]').classList.contains('new') && /new scene.*tokens/.test(document.querySelector('.ae-sum').textContent), document.querySelector('.ae-sum').textContent);
document.querySelector('.ae-make').click();
await until(() => document.querySelector('.crew-panel') && ThreeCrew.current()?.status === 'plan', 10000);
step('Make it: the crew shows its cost and waits (the plan stays, the strip moves up)', ThreeCrew.current()?.status === 'plan' && ThreeCrew.current().helpers[0].angle.includes(`For the ${AutoEdit.plan.sections[1].label}`) && /second, different take/.test(ThreeCrew.current().helpers[1].angle) && document.querySelector('.ae-panel').classList.contains('ae-up'), ThreeCrew.current()?.helpers?.map((h) => h.angle.slice(0, 60)));
await smoke({ shot: '/tmp/autoedit-cost.png' });
ThreeCrew.cancel();
await until(() => !AutoEdit.busy, 5000);
step('…no: nothing made, the new scene stays in the plan', !AutoEdit.key && (await ThreeSeq.list()).length === seqsBefore && AutoEditCore.newOnes(AutoEdit.plan).length === 1);
await HubBridge.call('three_do', { cmd: 'autoedit', op: 'set', section: 2, scene: other.name });

// ---------- 5. Make it ----------
await HubBridge.call('three_do', { cmd: 'autoedit', op: 'lyrics', text: 'first line here\nsecond line there\nthird line now\nfourth line goes\nfifth line flows\nsixth line glows' });
document.querySelector('.ae-make').click();
await until(() => AutoEdit.key && !AutoEdit.busy, 30000);
const e = ThreeSeq.edit; const P = AutoEdit.plan;
const sm = AutoEditCore.summary(P);
step('Make it: a new Lab sequence, shown, one clip per cut of the plan', AutoEdit.key && ThreeSeq.key === AutoEdit.key && ThreeSeq.active && e.clips.length === sm.clips && (await ThreeSeq.list()).length === seqsBefore + 1, { clips: e.clips.length, plan: sm });
const g = P.song.grid; const bar = 60 / g.bpm * (g.bpb || 4);
const T = ThreeSeqData.timing(e);
const off = T.slice(1).filter((x) => { const k = (x.cut - g.anchor) / bar; return Math.abs(k - Math.round(k)) > 0.02; });
step('…every cut on a bar of the song, the song under it from 0', !off.length && ThreeSeqData.songOf(e)?.src === SONG && ThreeSeqData.songOf(e).in === 0, { off: off.map((x) => x.cut), bar });
step('…a marker per section, a look per clip, the transitions of the plan', e.markers.filter((m) => m.autoedit).length === P.sections.length && e.clips.filter((x) => x.section === 'Intro').every((x) => x.grade?.look === 'bw') && e.clips.some((x) => x.trans?.type === 'lab-stutter'), e.markers.map((m) => m.label));
const caps = e.tracks.filter((k) => /^Captions/.test(k.name)).flatMap((k) => k.items);
step('…the lyrics as captions, only where the plan says lyrics', caps.length >= 1 && caps.every((q) => { const s = P.sections.find((x) => q.start >= x.a - 0.01 && q.start < x.b); return s?.words; }), caps.map((q) => [q.text, q.start]));
step('…the strip steps aside for the sequence', !document.querySelector('.ae-panel'));
await AutoEdit.open();
step('…🎬 again: the same plan, Render on now', AutoEdit.plan.sections[1].trans === 'lab-stutter' && !document.querySelector('.ae-render').disabled && /Make it again/.test(document.querySelector('.ae-make').textContent));
await wait(1200);
await smoke({ shot: '/tmp/autoedit-made.png' });
const n0 = e.clips.length;
ThreeSeq.undo();
step('…one undo step takes the whole edit back', ThreeSeq.edit.clips.length !== n0);
ThreeSeq.redo();

// ---------- 6. Render ▾: the usual render path ----------
const calls = []; const real = ThreeSeq.render;
ThreeSeq.render = async (o) => { calls.push(o); return { path: `/tmp/fake ${o.format}.mp4` }; };
document.querySelector('.ae-render').click();
await until(() => rowsOf().some((t) => t.startsWith('All three')), 2000);
const rr = rowsOf(); seen.push(...rr);
clickRow('16:9'); await until(() => calls.length, 3000);
step('Render ▾: 9:16, 16:9, 1:1 or all three, through the sequence\'s render', ['9:16', '16:9', '1:1', 'All three'].every((s) => rr.some((t) => t.replace(/^● /, '').startsWith(s))) && calls[0]?.format === '16:9', { rows: rr, calls });
const all3 = await HubBridge.call('three_do', { cmd: 'autoedit', op: 'render', format: 'all' });
step('three_do autoedit render all: one video per frame size', all3.ok && calls.slice(1).map((x) => x.format).join() === '9:16,16:9,1:1', all3.value || all3.error);
ThreeSeq.render = real;

// ---------- 7. reached without commands: ✦ More › ⇪ Make, the ◎ mission ----------
const make = LabEasy.previewItem().items().find((x) => x.label.startsWith('⇪ Make')).items();
step('✦ More › ⇪ Make: "A music video from this song"', make.some((x) => x.label.startsWith('🎬 A music video')) && LabEasy.placed().has('music-video'), make.map((x) => x.label));
const mids = (id) => Missions.shown(id).map((m) => m.id);
step('◎ mission "Make a music video from this song": in the Lab\'s director only', mids(dir.id).includes('lab-music-video') && !mids(H.claudeAgent().id).includes('lab-music-video'));
AutoEdit.close();
Missions.set(dir.id, 'lab-music-video');
Missions.submit(dir.id, 'neon rain, slow camera');
await until(() => document.querySelector('.ae-panel') && AutoEdit.plan?.brief === 'neon rain, slow camera' && !AutoEdit.busy, 20000);
step('…sending it opens a fresh plan steered by your words (nothing sent to the AI, nothing made)', AutoEdit.plan?.brief === 'neon rain, slow camera' && !AutoEdit.key, AutoEdit.plan?.brief);
const said = []; await Commands.tryRun('/music-video', H.claudeAgent().id, null, { say: (t) => said.push(String(t)), note: (t) => said.push(String(t)) });
step('/music-video (the internal API) answers with the plan', /🎬 .* · \d+ clips/.test(said.join('\n')), said.join('\n').slice(0, 200));
seen.push(panelText());
const cmdTalk = seen.filter((t) => /(^|\s)\/[a-z][\w-]{2,}/.test(t));
step('no "/command" talk in the strip and its menus', !cmdTalk.length, cmdTalk.slice(0, 5));
AutoEdit.close();
const failed = out.steps.filter((s) => !s.ok);
return JSON.stringify({ passed: out.steps.length - failed.length, failed: failed.length, steps: out.steps }, null, 1);
