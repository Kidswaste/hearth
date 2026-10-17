// Opt-in only: one actual Astra review of a synthetic image, using normal account usage.
// node dev/smoke.js --eval "window.QUEST_LIVE_REVIEW=true" --script dev/checks/quest-review-live.js --check-timeout 330000
if (!window.QUEST_LIVE_REVIEW) return 'Skipped: set QUEST_LIVE_REVIEW explicitly to use the configured Astra account.';
await Lazy.load('questjournal');
const canvas = new OffscreenCanvas(480, 360), ctx = canvas.getContext('2d');
ctx.fillStyle = '#102d36'; ctx.fillRect(0,0,480,360); ctx.fillStyle = '#e6bb65'; ctx.beginPath(); ctx.arc(215,160,90,0,Math.PI*2); ctx.fill(); ctx.fillStyle = '#b785b2'; ctx.fillRect(285,255,110,14);
const blob = await canvas.convertToBlob(), bytes = new Uint8Array(await blob.arrayBuffer()), path = window.SMOKE_SAVES + '/live-review-frame.png'; await hub.fs.write(path, bytes);
const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b=>b.toString(16).padStart(2,'0')).join('');
const state = QuestCore.upgrade(QuestCore.initial()), qid = 'q-studio-visual-frame'; state.active = 'c-studio-visual'; QuestCore.setContract(state,qid,'sketch');
const item = QuestCore.submit(state,qid,{type:'file',title:'Synthetic composition test',path,kind:'image/png',bytes:bytes.length,images:[path],excerpt:'',analysis:'',coverage:'One actual image. No animation or audio.',fingerprint},'A rough graphic composition with a warm central form and a restrained contrasting accent. Review the visible work, not its description.');
const started = Date.now(); const result = await QuestReview.run(QuestCore.find(state,qid),item).promise;
QuestCore.checkReview(result); QuestCore.saveReview(state,qid,item.id,result); await hub.kvSet('quest-journal',state);
activate('tool:quests'); for(let i=0;i<160&&!document.querySelector('.qj-hero');i++) await new Promise(r=>setTimeout(r,60)); QuestJournal.navigate('collection');
[...document.querySelectorAll('.qj-portfolio-card button')].find(b=>b.textContent==='Open review & versions →').click();
await new Promise(r=>setTimeout(r,300)); document.querySelectorAll('.toast-x').forEach(b=>b.click());
await smoke({shot:window.SMOKE_SAVES+'/quest-live-scorecard.png'});
return { actualModelReview:true, ms:Date.now()-started, status:result.status, score:result.score, meetsBrief:result.meetsBrief, coverage:result.coverage, summary:result.summary, better:result.better, next:result.next, model:result.model };
