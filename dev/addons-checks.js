// Smoke checks for the add-ons stream: node dev/smoke.js --script dev/addons-checks.js --shot /tmp/addons.png
// Runs the add-on chat commands headlessly (on the throwaway copy smoke.js makes) and reports what they returned.
const out = {};
const said = [];
const agentId = H.claudeAgent().id;
const ctx = { agentId, chatId: null, input: null, say: (t) => said.push(t), draft: (t) => said.push(`DRAFT ${t}`), send: () => {} };
const run = async (line) => {
  const hit = Commands.parse(line);
  if (!hit) return `NOT A COMMAND: ${line}`;
  try { const r = await hit.def.run(hit.args, ctx); return typeof r === 'string' ? r : r === undefined ? '(no text)' : JSON.stringify(r); } catch (e) { return `ERROR ${e.message}`; }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const closeDialogs = () => document.querySelectorAll('dialog[open]').forEach((d) => d.close());

// prompts: presets merged, saved prompts survive, favorites
const before = await Prompts.load();
out.promptCount = before.length;
out.promptCats = Prompts.categories().map((c) => `${c.id}:${c.n}`).join(' ');
const mine = await Prompts.add({ name: 'My caption test', text: 'Caption for {{title}} in a {{tone|warm,dry}} tone {{n=3}}' });
out.vars = JSON.stringify(Prompts.vars(mine.text));
out.applied = Prompts.apply(mine.text, { title: 'X', tone: 'dry', n: 3 });
out.fav = await run('/prompt-fav My caption test');
out.favFirst = (await Prompts.load())[0].name;
out.promptList = (await run('/prompt-list three')).split('\n').length;
out.promptShow = (await run('/prompt-show New visualizer sketch')).slice(0, 120);
const hide = await Prompts.remove('b:continue');
out.hidden = `${hide} → ${(await Prompts.find('Continue'))?.name || 'gone'}`;
// a saved prompts list from before the upgrade (the 10 old defaults saved as p0…) must not duplicate the presets
const names = (await Prompts.load()).map((p) => p.name);
out.dupes = names.filter((n, i) => names.indexOf(n) !== i).join(', ') || 'none';

// notes
out.note = await run('/note buy new strings #gear');
out.todo = await run('/todo export the Shorts cut');
out.daily = await run('/daily-note');
out.noteFind = await run('/note-find strings');
const inbox = await Notes.find('Inbox');
out.inbox = inbox?.text;
out.tags = (await Notes.tags()).join(',');
Notes.close();

// memory
out.remember = await run('/remember all: I make 9:16 music visuals for Shorts --pin');
out.remember2 = await run('/remember Prefer short answers --days 7');
out.memList = await run('/memory-list');
out.memCost = await run('/memory-cost');
out.forget = await run('/forget short answers');
out.memAfter = (await window.hub.getMemory());

// kit
out.color = (await run('/color #ff8800')).split('\n').slice(0, 4).join(' | ');
out.harmony = (await run('/harmony #7c5cff')).split('\n')[0];
out.contrast = await run('/contrast #777 on #fff');
out.bpm = (await run('/bpm 128')).split('\n')[0];
out.bpmMs = await run('/bpm 500ms');
out.frame = (await run('/frame tiktok')).split('\n').slice(0, 3).join(' | ');
out.frame2 = (await run('/frame 16:9 1280')).split('\n')[0];
out.tc = await run('/tc 00:00:10:00 + 8 bars - 12f @128bpm');
out.tc24 = await run('/tc 900f @24');
out.ease = (await run('/ease out back')).split('\n').slice(0, 3).join(' | ');
out.gradient = (await run('/gradient #120c2c #7c5cff #ff6a3d')).length;
out.labPalette = await run('/lab-palette Test pal #112233 #445566');
out.labPalettes = store.get('three.palettes', []).map((p) => p.name).join(',');

// agents
out.presets = Manager.PRESETS.length;
out.personas = Manager.PERSONAS.length;
out.presetList = (await run('/agent-presets shader')).slice(0, 160);

// forge workspace
out.task = await run('/forge-task Fix rift timer #bug !1');
out.tasks = await run('/forge-task');
out.devStart = await run('/forge-devlog start');
out.devStatus = await run('/forge-devlog');
out.devStop = await run('/forge-devlog stop tested the timer');
out.forgeNoAgent = await run('/forge-status');

// data
out.trash = await run('/trash restore nothing-like-this');
out.cmdCount = Commands.list().length;
out.areas = [...new Set(Commands.list().map((d) => d.area))].join(', ');
out.said = said.length;

// the dialogs open without errors
await run('/prompts three'); await sleep(200); out.promptsDialog = document.querySelectorAll('.prompts-dialog .prompt-item').length; closeDialogs();
await run('/kit gradient'); await sleep(200); out.kitTabs = document.querySelectorAll('.kit-dialog .tabbar button').length;
for (const id of ['color', 'palette', 'harmony', 'contrast', 'easing', 'bpm', 'frame', 'timecode']) document.querySelector(`.kit-dialog .tabbar button[data-id="${id}"]`)?.click();
await sleep(100); closeDialogs();
await run('/memory'); await sleep(300); out.memRows = document.querySelectorAll('.memory-facts .memory-row').length; out.memPills = document.querySelector('.memory-cost')?.textContent; closeDialogs();
await run('/downloads'); await sleep(200); closeDialogs();
await run('/trash'); await sleep(200); closeDialogs();
H.config.settings = { ...H.config.settings, backupDir: `${(await window.hub.attachmentsDir()).replace(/[\\/]data[\\/]attachments$/, '')}/../hearth-smoke-backups` };
await saveConfig(); await sleep(400);
out.backup = await run('/backup');
const list = await window.hub.backup.list();
out.backupList = list.items.length;
if (list.items[0]) {
  const r = await window.hub.backup.restore(list.items[0].path, { dryRun: true });
  out.restorePreview = `chats +${r.chats.add} same ${r.chats.same} · kv +${r.kv.add} same ${r.kv.same} differ ${r.kv.differ.length} · memory +${r.memory.add}`;
}
await run('/backups'); await sleep(300); out.backupRows = document.querySelectorAll('.backups-dialog .download-row').length; closeDialogs();
await Notes.show('Inbox'); await sleep(200);
document.querySelector('.notes-mode').click(); await sleep(100);
out.notesPreviewChecks = document.querySelectorAll('.notes-preview li.note-todo input').length;
const manager = Manager.open(null, { preset: Manager.findPreset('Shader guru') });
await sleep(150);
out.agentForm = `${document.querySelector('#agent-form [name=name]').value} / ${document.querySelector('#agent-form [name=systemPrompt]').value.slice(0, 40)}`;
document.getElementById('agent-dialog').close();
await run('/kit frame');
await sleep(300);
return JSON.stringify(out, null, 1);
