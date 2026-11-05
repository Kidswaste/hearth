// (round 129, next129) The "Next:" chip and project templates, by clicks (docs/upgrades/next129.md):
//   1. the chip under a fake director reply in a project's Lab chat: from the brief's next unticked step, else the
//      reply's own suggestion, else the local rule (a song with no layer keyed to it; an edit with no look since)
//   2. clicking it sends the step as the owner's message (and only then); typing hides it; ⋯ AI setup's switch turns
//      the chips off (and on again)
//   3. Share & keep › Save as a template… (with the moodboard ticked), then ＋ New project › Start from › My templates:
//      a new project with fresh ids and the scene's layers, palette, size, frame rate and the moodboard's note
//   4. the template's ✕ asks first: Cancel keeps it, Move to Trash takes it away
// Only the check's own temp data folder is used (smoke.js), never real data. Fixture: /tmp/hearth-test-song.wav.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --lib dev/checks/journey-lib.js --script dev/checks/next129.js
const { step, wait, until, click } = J;
J.shotDir = window.SMOKE_TMP || '/tmp';
const SONG = '/tmp/hearth-test-song.wav';
const btn = (root, re) => [...(root || document).querySelectorAll('button')].find((b) => re.test(b.textContent.trim()) && J.visible(b));
const byName = (n) => Projects.all().find((p) => p.name === n) || null;
const ready = (n) => ProjectWorkspace.current()?.name === n && ProjectWorkspace.state().phase === 'ready';
const section = async (name, fn) => { try { await fn(); } catch (err) { step(`${name}: stopped`, false, String(err?.stack || err).slice(0, 400)); await smoke({ shot: `${J.shotDir}/next129-${name.slice(0, 2)}.png` }).catch(() => {}); for (const d of document.querySelectorAll('dialog[open]')) d.close(); } };
const LAYER = (name) => `import * as THREE from 'three';
const P = tweak({ size: { value: 1, min: 0.2, max: 3, label: '${name} size' } });
const renderer = new THREE.WebGLRenderer({ alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 5;
const m = new THREE.Mesh(new THREE.TorusGeometry(1, 0.3), new THREE.MeshBasicMaterial({ color: '#ff2e88' }));
scene.add(m);
renderer.setAnimationLoop((t) => { m.rotation.y = t / 1000; m.scale.setScalar(P.size); renderer.render(scene, camera); });
`;

await Lazy.load('projects'); await Projects.ready();
await Lazy.load('lab');
await Lazy.load('projectbrief').catch(() => {});
await Lazy.load('nextstep');
const realBrief = window.ProjectBrief;
const claude = H.claudeAgent();
await ProjectWorkspace.create({ name: 'Next One', brief: '', persona: 'partner', agentId: claude.id, sceneId: '', boardId: '', plugins: [], files: [], describe: false });
await until(() => ready('Next One'), 40000);
const pa = byName('Next One');
const S = ThreeLab.scenes; const sid = pa.workspace.sceneId;
S.get(sid).layers = [ThreeLayers.defaults({ id: 'main', name: 'Tunnel', code: LAYER('Tunnel'), slot: 0 }), ThreeLayers.defaults({ name: 'Glow', code: LAYER('Glow'), slot: 1 })];
S.get(sid).palette = ['#112233', '#445566', '#778899'];
S.changed(sid);
await ProjectWorkspace.open(pa.id, 'chat');
const agentId = claude.id;
await until(() => Native.current(agentId)?.id === pa.workspace.chatId, 15000);
const chat = Native.current(agentId);
const v = Native.view(agentId);
const chip = () => { const n = v.root.querySelector('.ns-next'); return n && J.visible(n) ? n : null; };
const chipText = () => chip()?.querySelector('.ns-go')?.textContent.replace(/\s+/g, ' ').trim() || '';
const reply = (extra = {}) => { const at = Date.now(); chat.messages.push({ role: 'user', text: 'make a tunnel', at: at - 5 }, { role: 'assistant', text: 'Done: a tunnel of rings.', at, ...extra }); return Native.refresh(agentId); };
let briefNow = { steps: ['Build the tunnel', 'Fade the tunnel in on the intro'], done: [0] };
window.ProjectBrief = { ...(realBrief || {}), get: (id) => (id === pa.id ? briefNow : null), onChange: () => () => {}, start: undefined }; // (no start: the click sends the step itself)

// ---------- 1. where the step comes from ----------
await section('1. the chip', async () => {
  await reply({ suggest: ['Add a glow pass'], tools: ['three_edit_code'] });
  await until(() => chip(), 8000);
  step('a finished director reply in the project\'s Lab chat: one chip, "Next:" + the brief\'s next unticked step, and a ✕', chipText() === 'Next: Fade the tunnel in on the intro' && v.root.querySelectorAll('.ns-next').length === 1 && Boolean(chip()?.querySelector('.ns-x')) && chip()?.dataset.from === 'brief', chipText());
  briefNow = null; NextStep.refresh(); await wait(100);
  step('no brief: the reply\'s own suggestion', chipText() === 'Next: Add a glow pass' && chip()?.dataset.from === 'suggest', chipText());
  delete chat.messages.at(-1).suggest;
  S.setExtras(sid, { media: { path: SONG } });
  NextStep.refresh(); await wait(100);
  step('no brief, no suggestion, a song and no layer keyed to it: "Key the main layer to the drop"', chipText() === 'Next: Key the main layer to the drop' && chip()?.dataset.from === 'rule', chipText());
  S.setExtras(sid, { media: null });
  NextStep.refresh(); await wait(100);
  step('…no song, an edit with no screenshot since: "Check it on screen"', chipText() === 'Next: Check it on screen', chipText());
  chat.messages.at(-1).tools = ['three_edit_code', 'three_screenshot'];
  NextStep.refresh(); await wait(100);
  step('…looked at after the edit, nothing else to say: no chip (no AI call is made for one)', !chip());
});

// ---------- 2. click sends, typing hides, the setting turns it off ----------
await section('2. click, typing, setting', async () => {
  briefNow = { steps: ['Build the tunnel', 'Fade the tunnel in on the intro'], done: [0] };
  await reply({});
  await until(() => chip(), 8000);
  const n0 = chat.messages.length;
  await wait(1500);
  step('nothing is sent until the chip is clicked', chat.messages.length === n0 && !Native.isBusy(chat.id));
  await click(chip().querySelector('.ns-go'));
  await until(() => chat.messages.slice(n0).some((m) => m.role === 'user'), 8000);
  const sent = chat.messages.slice(n0).find((m) => m.role === 'user');
  step('clicking the chip sends the step as the owner\'s message; the chip goes', sent?.text === 'Fade the tunnel in on the intro' && !chip(), sent?.text);
  await until(() => !Native.isBusy(chat.id) && chat.messages.at(-1)?.role === 'assistant', 60000);
  await reply({});
  await until(() => chip(), 8000);
  v.input.focus(); await J.type('h');
  await wait(150);
  step('typing in the chat box hides it', Boolean(v.input.value) && !chip());
  v.input.value = ''; v.input.dispatchEvent(new Event('input', { bubbles: true }));
  await reply({});
  await until(() => chip(), 8000);
  await Lazy.load('options');
  Options.open({ agentId });
  await until(() => [...document.querySelectorAll('.opt-row')].find((r) => /Shows a “Next:” step/.test(r.textContent)), 8000);
  const row = [...document.querySelectorAll('.opt-row')].find((r) => /Shows a “Next:” step/.test(r.textContent));
  const sw = row?.querySelector('.opt-switch');
  step('⋯ AI setup › Habits has the switch, on', sw?.getAttribute('aria-checked') === 'true');
  sw?.click(); await wait(200);
  step('switched off: the chip goes (this computer\'s setting)', store.get('nextstep.on', true) === false && !chip());
  await reply({});
  await wait(300);
  step('…and a new reply gets none', !chip());
  sw?.click(); await wait(200);
  await reply({});
  await until(() => chip(), 8000);
  step('switched on again: it comes back', Boolean(chip()));
  Options.hide?.();
});
window.ProjectBrief = realBrief;

// ---------- 3. save as a template, then start a project from it ----------
let tpl = null;
await section('3. save as template + start from it', async () => {
  pa.prefs = { ...(pa.prefs || {}), aspect: '9:16', fps: 60 }; Projects.changed(pa, 'prefs');
  S.setFrame(sid, '9:16');
  await Lazy.load('board');
  const b = await Board.load(pa.workspace.boardId);
  Board.addNote('night city, rain on glass', undefined, {}, b);
  await Lazy.load('projmenu');
  ProjectMenu.items(pa).find((x) => x?.id === 'template').action();
  await until(() => document.querySelector('dialog.ptpl[open]'), 15000);
  const d = document.querySelector('dialog.ptpl[open]');
  step('Share & keep › Save as a template… opens its card: name, cover, "Include the song", the moodboard tick', Boolean(d.querySelector('input')) && Boolean(d.querySelector('.ptpl-cover')) && /Include the song/.test(d.textContent) && /moodboard’s notes and pictures/.test(d.textContent));
  const name = d.querySelector('input'); name.value = 'Neon Tunnel';
  await click([...d.querySelectorAll('label.check')].find((l) => /moodboard/.test(l.textContent)).querySelector('input'));
  await click(btn(d, /^Save template$/));
  await until(() => ProjTemplates.last.saved?.name === 'Neon Tunnel', 20000);
  const saved = ProjTemplates.last.saved;
  const json = saved && JSON.parse(await window.hub.fs.read(`${saved.dir}/template.json`));
  step('saved in My templates\' folder with its project part: palette, 9:16, 60 fps, the moodboard\'s note, no song', json?.project?.frame === '9:16' && json.project.fps === 60 && JSON.stringify(json.project.palette) === JSON.stringify(['#112233', '#445566', '#778899']) && json.project.board?.notes?.includes('night city, rain on glass') && json.project.song === false && !json.scene.extras.media, json?.project);
  // ＋ New project › Start from › My templates
  await ProjectWorkspace.wizard();
  await until(() => document.querySelector('dialog.pcw[open] .pcw-tpl'), 15000);
  const c = document.querySelector('dialog.pcw[open]');
  c.querySelector('input').focus(); await J.type('From Template');
  const card = [...c.querySelectorAll('.pcw-tpl')].find((x) => x.textContent.includes('Neon Tunnel'));
  step('the new-project card lists it under "My templates", with its cover (here the Lab draws nothing: its palette picture)', Boolean(card) && /My templates/.test(c.querySelector('[data-sec=start]').textContent) && /data:image\/jpeg/.test(card.querySelector('.pcw-tpl-img')?.style.backgroundImage || ''));
  await click(card.querySelector('.pcw-tpl-pick'));
  step('picking it fills the size and frame rate (9:16 · 60 fps) and its palette', /9:16 · vertical · 60 fps/.test(c.querySelector('[data-sec=look] .pcw-sum').textContent) && /3 colors/.test(c.querySelector('[data-sec=look] .pcw-sum').textContent) && /Neon Tunnel/.test(c.querySelector('[data-sec=start] .pcw-sum').textContent), c.querySelector('[data-sec=look] .pcw-sum').textContent);
  await click(btn(c, /^Create project/));
  await until(() => ready('From Template'), 60000);
  const pb = byName('From Template');
  const nid = pb?.workspace?.sceneId; const x = nid && S.get(nid);
  step('a new project with fresh ids (project, chat, scene, moodboard)', pb && pb.id !== pa.id && nid !== sid && pb.workspace.chatId !== pa.workspace.chatId && pb.workspace.boardId !== pa.workspace.boardId, { pb: pb?.workspace });
  const srcLayers = S.layersOf(S.get(sid));
  step('…its scene has the template\'s layers (the second with a fresh id), palette, 9:16 and 60 fps', JSON.stringify(x?.layers?.map((L) => L.name)) === '["Tunnel","Glow"]' && x.layers[1].id !== srcLayers[1].id && JSON.stringify(x.palette) === JSON.stringify(['#112233', '#445566', '#778899']) && S.frameOf(nid) === '9:16' && pb.workspace.fps === 60 && pb.prefs?.fps === 60, { layers: x?.layers?.map((L) => [L.name, L.id]), palette: x?.palette, frame: S.frameOf(nid), fps: pb?.workspace?.fps });
  await until(async () => (await Board.load(pb.workspace.boardId))?.items?.some((it) => it.type === 'note' && /night city/.test(it.text)), 8000);
  const nb = await Board.load(pb.workspace.boardId);
  step('…and the moodboard\'s note; the source project is unchanged', nb?.items?.some((it) => it.type === 'note' && /night city/.test(it.text)) && byName('Next One')?.workspace?.sceneId === sid && S.get(sid).layers.length === 2);
  tpl = saved;
});

// ---------- 4. delete asks first ----------
await section('4. delete asks', async () => {
  if (!tpl) throw Error('no template from 3');
  await ProjectWorkspace.wizard();
  await until(() => document.querySelector('dialog.pcw[open] .pcw-tpl'), 15000);
  const c = document.querySelector('dialog.pcw[open]');
  const x = () => [...c.querySelectorAll('.pcw-tpl')].find((n) => n.textContent.includes('Neon Tunnel'))?.querySelector('.pcw-tpl-x');
  await click(x());
  await until(() => btn(document, /^Move to Trash$/), 5000);
  step('its ✕ asks first ("Delete this template?", Move to Trash)', /Delete this template\?/.test(document.body.textContent) && Boolean(btn(document, /^Move to Trash$/)));
  await click([...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'Cancel' && !c.contains(b)));
  await wait(300);
  step('Cancel keeps it (its folder and its card)', Boolean(await window.hub.fs.stat(tpl.dir).catch(() => null)) && Boolean(x()));
  await click(x());
  await until(() => btn(document, /^Move to Trash$/), 5000);
  await click(btn(document, /^Move to Trash$/));
  await until(() => ProjTemplates.last.removed?.id === tpl.id, 8000);
  await wait(300);
  step('Move to Trash: the folder goes to the Trash and the card leaves the list', !(await window.hub.fs.stat(tpl.dir).catch(() => null)) && !x());
  c.close();
});

return J.done();
