// Isolated app with real chat/file collection and a mocked reviewer. No account usage.
const wait = ms => new Promise(r => setTimeout(r, ms));
const check = (v, m) => { if (!v) throw Error(m); };
const until = async (fn, m) => { for (let i = 0; i < 160; i++) { if (fn()) return; await wait(60); } throw Error(m); };
await Lazy.load('projects'); await Projects.ready(); await Lazy.load('questjournal'); activate('tool:quests');
await until(() => QuestJournal.ready(), 'Journal not ready');
const project = Projects.create({ name: 'Proof Workshop' }); await Projects.flush();
const chatId = 'auto-proof-chat', agentId = H.agents().find(a => a.mode === 'native').id;
Projects.add(project, 'chat', chatId, 'Folio attack', { links: false }); await Projects.flush();
const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 80;
const ctx = canvas.getContext('2d'); ctx.fillStyle = '#efbc53'; ctx.fillRect(0, 0, 120, 80);
const imagePath = await hub.saveAttachment('before-after.png', canvas.toDataURL('image/png').split(',')[1]);
const textPath = window.SMOKE_SAVES + '/attack-test.txt'; await hub.fs.write(textPath, 'Expected: one attack then recovery. Actual: one attack then recovery. PASS at normal speed.');
// Linked audio uses the same bounded decoder as manual proof; it is never played.
const wav = new ArrayBuffer(44 + 1600), v = new DataView(wav), ascii = (at, s) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
ascii(0, 'RIFF'); v.setUint32(4, 1636, true); ascii(8, 'WAVE'); ascii(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); ascii(36, 'data'); v.setUint32(40, 1600, true);
const wavPath = window.SMOKE_SAVES + '/proof-tone.wav'; await hub.fs.write(wavPath, new Uint8Array(wav));
const audio = await QuestReview.localFile(wavPath); check(JSON.parse(audio.analysis).durationSeconds === .1 && audio.coverage.includes('cannot hear'), 'Linked audio decoding/coverage failed');
await hub.saveChat({ id: chatId, agentId, title: 'Folio attack', messages: [{ role: 'assistant', at: Date.now(), text: 'I reworked Folio’s attack pose. Here is the before/after comparison. Tested at normal speed: clean recovery, no extra strike.', opens: [{ path: imagePath }, { path: textPath }] }] });
const C = QuestCore, q = { id: 'q-auto-proof-fixture', projectId: project.id, projectName: project.name, title: 'Polish Folio’s attack', path: 'game', done: 'Improve Folio’s attack pose. Show a before/after and test the attack.', tiny: 'Open Folio.', deep: 'Optional polish.', minutes: 10, xp: 35, tool: 'lab', projectTask: { target: 'Folio', chatId } };
await QuestJournal.mutate(s => { C.trackSide(s, q); s.records[q.id] = { acceptedAt: new Date(Date.now() - 1000).toISOString() }; });
let calls = 0, mode = 'fail';
QuestReview.run = (quest, item) => {
  calls++; check(item.proof.images.length === 1, 'Comparison image omitted'); check(item.proof.attachments.length === 1, 'Text export omitted');
  check(item.proof.excerpt.includes('PASS at normal speed'), 'Actual linked test file not read'); check(item.proof.sources[0].chatId === chatId, 'Source chat missing');
  return { promise: mode === 'fail' ? Promise.reject(Error('Fixture offline; proof kept.')) : Promise.resolve({ status: 'reviewed', score: 85, dimensions: [22,21,22,20], meetsBrief: true, summary: 'A focused attack change with a comparison and test. Goal met.', better: 'Optional: refine the trail.', next: 'Keep the result.', coverage: 'Saved chat, image and actual test note.', limitations: 'The test is reported, not independently played.' }), cancel() {} };
};
QuestJournal.questDetail(q.id); check(calls === 0, 'Opening a quest sent evidence'); document.querySelector('.qj dialog[open]').close();
await Promise.all([QuestJournal.finishQuest(q.id), QuestJournal.finishQuest(q.id)]);
check(calls === 1 && C.submissions(QuestJournal.snapshot(), q.id).length === 1, 'Double finish created duplicate work');
check(!C.latest(QuestJournal.snapshot(), q.id).review && C.xp(QuestJournal.snapshot()) === 0, 'Failed review granted progress');
document.querySelector('.qj dialog[open]').close(); mode = 'good'; await Lazy.load('questhud'); await QuestGuide.review({ questId: q.id });
check(calls === 2 && C.submissions(QuestJournal.snapshot(), q.id).length === 1, 'Retry duplicated proof');
check(C.canFinish(QuestJournal.snapshot(), q.id), 'Accepted result not completable');
document.querySelector('.qj dialog[open]').close(); await QuestJournal.finishQuest(q.id); check(calls === 2, 'Already accepted work was reviewed again');
const evidence = [...document.querySelectorAll('.qj dialog[open] details')].find(d => d.querySelector('summary')?.textContent.startsWith('Evidence'));
evidence.open = true; check(evidence.textContent.includes('Source · Folio attack'), 'Source not shown');
await smoke({ shot: window.SMOKE_SAVES + '/automatic-proof-review.png' }); document.querySelector('.qj dialog[open]').close();
const missing = { ...q, id: 'q-auto-proof-missing', title: 'Document the bass filter', done: 'Test the resonance on the bass filter.', projectTask: { target: 'resonance' } };
await QuestJournal.mutate(s => C.trackSide(s, missing)); await QuestHud.refresh(); await QuestHud.checkOff(missing.id, 'finish');
check(calls === 2 && document.querySelector('.qj dialog[open]').textContent.includes('couldn’t confidently match'), 'Unrelated work sent for review'); document.querySelector('.qj dialog[open]').close();
// Closing during async gathering must prevent a late save or model request.
const originalCollect = QuestProof.collect; let release;
QuestProof.collect = async (...args) => { await new Promise(r => { release = r; }); return originalCollect(...args); };
const pending = QuestJournal.finishQuest(missing.id); await until(() => release, 'Collection did not begin');
document.querySelector('.qj dialog[open]').close(); release(); await pending; QuestProof.collect = originalCollect;
check(calls === 2 && C.submissions(QuestJournal.snapshot(), missing.id).length === 0, 'Cancelled gathering submitted proof');
await QuestJournal.flush();
return 'Real project chat/images/text collected; duplicate clicks, offline retry, sources, unrelated fallback, cancel and XP verified.';
//@@ reload
await Lazy.load('questjournal'); activate('tool:quests');
for (let i = 0; i < 160 && !QuestJournal.ready(); i++) await new Promise(r => setTimeout(r, 60));
const s = QuestJournal.snapshot(), item = QuestCore.latest(s, 'q-auto-proof-fixture');
if (item.review.score !== 85 || item.proof.sources.length !== 1 || item.proof.attachments.length !== 1 || QuestCore.xp(s) !== 0) throw Error('Gathered proof did not survive reload');
return 'Gathered proof, sources and review survive reload; no automatic XP.';
