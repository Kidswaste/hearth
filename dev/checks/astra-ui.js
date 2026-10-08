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
