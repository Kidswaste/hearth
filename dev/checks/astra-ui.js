// Astra UI checks: presets, seat syntax, duo memory, doctor --run, personas, usage, director engine, editor.
const out = {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(150); } return null; };
const lastNote = (id) => [...document.querySelectorAll(`.surface[data-id="${id}"] .msg.note, .tool-dock .msg.note`)].pop()?.textContent || '';
H.config.settings = { ...(H.config.settings || {}), enginePaths: { codex: '__FAKE_CODEX__', claude: '__FAKE_CLAUDE__' } };
H.config.agents.push({ id: 'threedirector', name: 'Three Director', mode: 'native', engine: 'claude', dock: 'three', threeTools: true, color: '#9b6bff', icon: '▲', model: 'opus' });
await saveConfig();
await sleep(1000);
const A = H.agents().find((a) => a.engine === 'codex');
const C = H.agents().find((a) => a.engine === 'claude' && !a.dock);
const lastCollab = () => [...(Native.chatOf(C.id)?.messages || [])].reverse().find((y) => y.role === 'collab');
activate(C.id);
await sleep(300);

// seat syntax with model, persona and effort reaches the engine
await Commands.tryRun('/compare astra:gpt-6-luna~minimal,astra@coder~high name three colors', C.id);
const cmp = await until(() => lastCollab()?.status === 'done' && lastCollab());
out.compare = cmp && cmp.seats.map((s) => s.label);
out.compareText = cmp && cmp.parts.map((p) => p.text.slice(0, 40));
// a preset
await Commands.tryRun('/collab-preset codereview write fizzbuzz', C.id);
const cr = await until(() => lastCollab()?.mode === 'critique' && lastCollab().status === 'done' && lastCollab());
out.preset = cr && { seats: cr.seats.map((s) => s.label), parts: cr.parts.length };
// duo memory: a second duo continues the sessions
await Commands.tryRun('/duo first duo', C.id);
await until(() => lastCollab()?.task === 'first duo' && lastCollab().status === 'done');
await Commands.tryRun('/duo second duo', C.id);
const d2 = await until(() => lastCollab()?.task === 'second duo' && lastCollab().status === 'done' && lastCollab());
out.duoContinued = d2?.continued;
const codexArgs = JSON.parse(await window.hub.fs.read('__TMP__/fake-codex-astra/last-args.json'));
out.duoResumedCodex = Boolean(codexArgs.resume);
// carry reaches Claude's next message (the session exists from... a fresh chat has none, so withContext carries it)
await Native.send(C.id, 'after the duo');
await until(() => Native.chatOf(C.id).messages.at(-1)?.role === 'assistant');
out.afterDuo = Native.chatOf(C.id).messages.at(-1).text.slice(0, 120);

// doctor --run, personas, usage
await Commands.tryRun('/astra-doctor --run', C.id);
out.doctorRun = lastNote(C.id).split('Test message')[1]?.slice(0, 80);
await Commands.tryRun('/astra-persona-save critic You are a blunt art critic who loves bold color.', C.id);
out.personaSaved = lastNote(C.id).slice(0, 60);
await Commands.tryRun('/astra-persona critic', A.id);
activate(A.id);
await sleep(200);
await Native.send(A.id, 'judge my sketch');
await until(() => Native.chatOf(A.id)?.messages.at(-1)?.role === 'assistant');
const instr = JSON.parse(await window.hub.fs.read('__TMP__/fake-codex-astra/last-args.json')).configs.model_instructions_file;
out.personaFile = (await window.hub.fs.read(JSON.parse(instr))).slice(0, 90);
await Commands.tryRun('/astra-usage', A.id);
out.usage = lastNote(A.id).slice(0, 160);
await Commands.tryRun('/astra-session', A.id);
out.session = lastNote(A.id).slice(0, 80);
// director engine switch
await Commands.tryRun('/director-engine three astra', A.id);
await sleep(600);
const d = H.agent('threedirector');
out.director = { engine: d.engine, model: d.model, keep: d.otherEngine };
await Commands.tryRun('/director-engine three claude', A.id);
await sleep(600);
out.directorBack = { engine: H.agent('threedirector').engine, model: H.agent('threedirector').model };
// doctor lists prompt sizes and tool servers
await Commands.tryRun('/astra-doctor', A.id);
out.doctorPrompts = /Instructions \+ memory per message/.test(lastNote(A.id)) && /Hub tool servers present/.test(lastNote(A.id));
// scoreboard after a pick, budget, partner, auto opinion, log, handoff back
activate(C.id);
await sleep(200);
await Commands.tryRun('/pick 1', C.id);
await sleep(300);
await Commands.tryRun('/collab-scoreboard', C.id);
out.scoreboard = lastNote(C.id).slice(0, 120);
await Commands.tryRun('/collab-budget 5k', C.id);
await Commands.tryRun('/debate 3 budget test', C.id);
const bud = await until(() => { const x = lastCollab(); return x?.task === 'budget test' && x.status !== 'running' && x; }, 30000);
out.budget = bud && { status: bud.status, error: bud.error, parts: bud.parts.length };
await Commands.tryRun('/collab-budget off', C.id);
await Commands.tryRun('/opinion-auto on', C.id);
await Native.send(C.id, 'auto opinion please');
const auto = await until(() => { const ms = Native.chatOf(C.id).messages; return ms.at(-1)?.role === 'opinion' && ms.at(-1); }, 20000);
out.autoOpinion = auto?.from;
await Commands.tryRun('/opinion-auto off', C.id);
await Commands.tryRun('/astra-log 3', C.id);
out.log = lastNote(C.id).slice(0, 80);
const before = Native.chatOf(C.id).id;
await Commands.tryRun('/handoff astra --raw', C.id);
await sleep(500);
await Commands.tryRun('/handoff back', A.id);
await sleep(500);
out.handoffBack = Native.chatOf(C.id)?.id === before;
// command line, features, clone, ask with persona + screenshot, partial failure, thinking in collab parts
await Commands.tryRun('/astra-flags astra', A.id);
out.flags = /--ignore-user-config/.test(lastNote(A.id)) && /--disable/.test(lastNote(A.id));
await Commands.tryRun('/astra-feature view_image on', A.id);
await sleep(500);
out.feature = H.agent(A.id).codexFeatures;
await Commands.tryRun('/astra-feature view_image off', A.id);
await Commands.tryRun('/astra-clone reviewer', A.id);
await sleep(600);
out.clone = H.agents().filter((a) => /Reviewer/.test(a.name)).map((a) => a.name);
activate(A.id);
await sleep(200);
await Commands.tryRun('/ask-claude --shot @skeptic is this ok', A.id);
const ask = Native.chatOf(A.id).messages.at(-1);
out.askShot = ask?.role === 'opinion' && /image/.test(ask.text) ? 'has image' : ask?.text.slice(0, 60);
await Native.send(A.id, 'PARTIALFAIL now');
await until(() => Native.chatOf(A.id).messages.at(-1)?.role === 'error');
out.partial = Native.chatOf(A.id).messages.slice(-2).map((m) => `${m.role}:${m.stopped ? 'stopped:' : ''}${m.text.slice(0, 40)}`);
await Commands.tryRun('/duo thinking check', A.id);
const th = await until(() => { const x = [...Native.chatOf(A.id).messages].reverse().find((y) => y.role === 'collab'); return x?.status === 'done' && x; });
out.collabThinking = th?.parts.map((p) => Boolean(p.thinking));
// seat completion and the armed placeholder
out.completeSeat = [Commands.get('duo').complete('claude@sk', {}).map((x) => x.value), Commands.get('debate').complete('2 astra~l', {}).map((x) => x.value)];
await Commands.tryRun('/collab relay', A.id);
await sleep(100);
Native.refresh(A.id);
await sleep(300);
out.placeholder = document.querySelector(`.surface[data-id="${A.id}"] .composer textarea`).placeholder;
await Commands.tryRun('/collab off', A.id);
await sleep(100);
out.placeholderOff = document.querySelector(`.surface[data-id="${A.id}"] .composer textarea`).placeholder.slice(0, 30);
// rail star
out.railStar = [...document.querySelectorAll('#agent-buttons .agent-btn.astra-btn')].map((b) => b.dataset.id);
// the agent editor shows Astra's options
Manager.open(A.id);
await sleep(300);
const form = document.getElementById('agent-form');
out.editor = {
  web: !form.querySelector('.astra-opts').hidden,
  fileMode: !form.querySelector('[name="codexFiles"]').hidden,
  fileAccess: !form.querySelector('.file-access').hidden,
  talk: !form.querySelector('input[name="chatTools"]').closest('label').hidden,
  efforts: [...form.elements.effort.options].map((o) => o.value).join(','),
  effortValue: form.elements.effort.value,
};
form.elements.webSearch.value = 'cached';
out.editorOverflow = form.scrollWidth > form.clientWidth + 2;
out.talkLabel = form.querySelector('input[name="chatTools"]').closest('label').textContent.match(/opinion from \w+/)?.[0];
form.querySelector('.file-access').scrollIntoView();
return JSON.stringify(out, null, 1);
