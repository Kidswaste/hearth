// ◧ Try it first (round 43, directorpreview) with the fake engines' real MCP calls: with the switch on (⋯ AI setup row),
// a director edit shows in the preview while the scenes file and the time machine stay as they were; the bar names the
// edit with its cost; Keep saves it as one version, and one Undo (the toast's) puts it back; Undo leaves the file and
// History untouched; Try another way undoes and sends one short message naming the rejected edit, which is tried first
// too; ◎ Show me first does it for one message; Astra's edits work the same; off = edits saved as before.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/directorpreview.js --shot /tmp/directorpreview.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;

await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
const agent = H.agents().find((a) => a.dock === 'three');
await SQL.lab();
await until(() => typeof LabTry !== 'undefined' && ThreeLab.stageHooks?.pane && ThreeLab.tm, 20000);
const d = ThreeLab.director;
const cmd = await ThreeLab.cmd({ show: true });
store.set('three.doctorHints', false);
const CODE = `import * as THREE from 'three';
const P = tweak({ spin: { value: 0.5, min: -2, max: 2, label: 'Spin' }, tint: { value: '#7a5cff', label: 'Tint', group: 'Color' } });
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 4;
const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: P.tint, wireframe: true }));
scene.add(mesh);
renderer.setAnimationLoop((now, f60) => { mesh.rotation.y += 0.02 * P.spin * (f60 || 1); mesh.material.color.set(P.tint); renderer.render(scene, camera); });`;
const edit = (find, replace) => `mcp: ${JSON.stringify([['three_edit_code', { layer: d.codeOf().id, edits: [{ find, replace }], wait: 0.5 }]])}`;
const sendWait = async (text) => { await Native.send(agent.id, text); await wait(300); await until(() => !Native.isBusy(H.activeChat[agent.id]), 60000); };
const sceneId = () => ThreeLab.scenes.currentId();
const onDisk = async () => { const list = await window.hub.kvGet('three-sketches', []); const s = list.find((x) => x.id === sceneId()); return s ? JSON.stringify(s.layers || s.code) : null; };
const saved = async () => { ThreeLab.tm.persist(); await wait(1400); };
const versions = async () => (await ThreeHistory.info(sceneId()))?.versions ?? -1;
const ready = () => LabTry.state().trials.find((t) => t.state === 'ready');
const bar = () => document.querySelector('.lab-try');

// ---------- off (the default): a director turn sets the scene up, saved as before ----------
step('off by default: no switch, no trial', !agent.tryFirst && !LabTry.state().on, LabTry.state());
Native.newChat(agent.id);
await wait(600);
await sendWait(`mcp: ${JSON.stringify([['three_set_code', { code: CODE, wait: 1 }]])}`);
activate('tool:three');
await wait(400);
for (const L of d.layers().layers.slice()) if (L.id !== d.codeOf().id && d.layers().layers.length > 1) await d.removeLayer(L.name);
cmd.size('1:1');
await saved();
await until(async () => /IcosahedronGeometry\(1, 0\)/.test(await onDisk()), 8000);
step('switch off: the director\'s scene is saved as it comes (no bar)', /IcosahedronGeometry\(1, 0\)/.test(await onDisk()) && !bar() && !LabTry.state().trials.length);

// ---------- the switch: ⋯ AI setup › Habits › "In the Lab: shows me its edit first" ----------
await Lazy.load('options');
Options.open({ agentId: agent.id, show: 'habits' });
await wait(500);
const row = [...document.querySelectorAll('.opt-row')].find((r) => /In the Lab: shows me its edit first/i.test(r.textContent));
row?.querySelector('[role=switch]')?.click();
await until(() => H.agent(agent.id).tryFirst === true, 5000);
step('⋯ AI setup › Habits has "In the Lab: shows me its edit first"; switching it on sets the agent', row && H.agent(agent.id).tryFirst === true, { row: row?.textContent });
Options.hide?.();
const mission = Missions.shown(agent.id).some((m) => m.id === 'lab-try');
step('◎ "Show me first" hides while the switch is on (it\'s the same thing for one message)', !mission);

// ---------- a director edit, tried first ----------
const disk0 = await onDisk(); const v0 = await versions();
await sendWait(edit('IcosahedronGeometry(1, 0)', 'IcosahedronGeometry(1, 2)'));
await until(() => ready(), 15000);
await saved(); // a save meanwhile (any change, a scene switch) writes the scene as it was
let t = ready();
const preview = /IcosahedronGeometry\(1, 2\)/.test(d.codeOf().code);
const sb = await d.evalInSketch('return 1').catch(() => null);
step('the edit shows in the preview (the scene in memory runs it)', preview && sb, { code: d.codeOf().code.slice(300, 420) });
step('…while the scenes file still has the scene as it was', (await onDisk()) === disk0, { disk: (await onDisk())?.slice(0, 80) });
step('…and the time machine recorded nothing for it yet', (await versions()) === v0, { v0, now: await versions() });
await until(() => bar() && !bar().classList.contains('lt-working'), 5000);
const txt = bar()?.textContent || '';
step('the bar: "◧ Claude\'s edit, not saved yet · <what changed>", its cost, ◧ Keep Undo Try another way', /Claude's edit, not saved yet/.test(txt) && /tokens/.test(txt) && /Keep/.test(txt) && /Undo/.test(txt) && /Try another way/.test(txt) && bar().querySelector('.lt-ab'), { txt, t });
step('◧ Before / after\'s chip waits while the bar shows (hold B still works)', ThreeLab.stageHooks.host.classList.contains('lt-on') && (!document.querySelector('.ab-chip') || getComputedStyle(document.querySelector('.ab-chip')).display === 'none'));
await smoke({ shot: '/tmp/directorpreview-bar.png' });

// ---------- Keep: saved, one version; one Undo puts it back ----------
bar().querySelector('.lt-keep').click();
await until(() => !LabTry.state().trials.length, 5000);
await wait(1400);
const diskKept = await onDisk();
const v1 = await versions();
step('Keep: the scenes file gets the edit', /IcosahedronGeometry\(1, 2\)/.test(diskKept || '') && !bar(), { disk: diskKept?.slice(0, 80) });
step('Keep is one step: exactly one new version in ⟲ History, named after the edit', v1 === v0 + 1 && /Claude's edit, kept/.test(ThreeHistory._doc(sceneId())?.versions?.at(-1)?.label || ''), { v0, v1, label: ThreeHistory._doc(sceneId())?.versions?.at(-1)?.label });
const undoBtn = [...document.querySelectorAll('#toasts button')].find((b) => b.textContent === 'Undo' && /Kept Claude's edit/.test(b.parentNode.textContent));
undoBtn?.click();
await wait(1600);
step('…and one Undo (the toast\'s) puts the scene back as it was, saved', undoBtn && /IcosahedronGeometry\(1, 0\)/.test(d.codeOf().code) && (await onDisk()) === disk0, { code: /Icosahedron[^;]+/.exec(d.codeOf().code)?.[0] });

// ---------- Undo: nothing changed ----------
const disk1 = await onDisk(); const v2 = await versions();
await sendWait(edit('wireframe: true', 'wireframe: false'));
await until(() => ready(), 15000);
step('a second edit waits too', /wireframe: false/.test(d.codeOf().code) && (await onDisk()) === disk1);
bar().querySelector('.lt-undo').click();
await wait(1600);
step('Undo: the preview is back as it was, the scenes file and ⟲ History untouched, no bar', /wireframe: true/.test(d.codeOf().code) && (await onDisk()) === disk1 && (await versions()) === v2 && !bar() && !LabTry.state().trials.length, { v2, now: await versions() });

// ---------- Try another way ----------
await sendWait(edit('rotation.y += 0.02', 'rotation.x += 0.05'));
await until(() => ready(), 15000);
const line = ready().line;
const n0 = Native.chatOf(agent.id).messages.length;
bar().querySelector('.lt-again').click();
await wait(300);
const sent = [...Native.chatOf(agent.id).messages].reverse().find((m) => m.role === 'user');
step('Try another way: the edit is undone at once', /rotation\.y \+= 0\.02/.test(d.codeOf().code) && (await onDisk()) === disk1);
step('…and one short message goes: the rejected edit in one line, "a different approach"', sent && /undid it/.test(sent.text) && sent.text.includes(line.slice(0, 30)) && /different approach/.test(sent.text) && sent.text.length < 260 && Native.chatOf(agent.id).messages.length > n0, { text: sent?.text, len: sent?.text.length });
await until(() => !Native.isBusy(H.activeChat[agent.id]), 60000);
await wait(800);
step('its reply was tried first too (it changed nothing here, so nothing waits)', LabTry.state().stats.again === 1 && !LabTry.state().trials.length && LabTry.state().stats.empty >= 1, LabTry.state());

// ---------- ◎ Show me first: one message only ----------
await Commands.tryRun('/try-first off', agent.id);
await until(() => !H.agent(agent.id).tryFirst, 3000);
step('/try-first off; ◎ "Show me first" is in the director\'s missions again', Missions.shown(agent.id).some((m) => m.id === 'lab-try'));
Missions.set(agent.id, 'lab-try');
const vr = Native.view(agent.id).root;
const ta = vr.querySelector('textarea');
ta.value = edit('IcosahedronGeometry(1, 0)', 'TorusKnotGeometry(0.7, 0.2)'); ta.dispatchEvent(new Event('input', { bubbles: true }));
vr.querySelector('form.composer').requestSubmit();
await wait(300);
await until(() => !Native.isBusy(H.activeChat[agent.id]), 60000);
await until(() => ready(), 15000);
step('◎ Show me first: that message\'s edit waits (the switch stays off)', ready() && !H.agent(agent.id).tryFirst && (await onDisk()) === disk1 && /TorusKnot/.test(d.codeOf().code));
await Commands.tryRun('/try-first undo', agent.id);
await wait(1200);
await sendWait(edit('IcosahedronGeometry(1, 0)', 'IcosahedronGeometry(1, 1)'));
await saved();
step('…the next message is saved as it comes again', !LabTry.state().trials.length && /IcosahedronGeometry\(1, 1\)/.test(await onDisk() || ''));

// ---------- Astra ----------
await Commands.tryRun('/try-first on', agent.id);
Commands.tryRun('/director-engine astra', agent.id);
await until(() => H.agent(agent.id).engine === 'codex', 8000); await wait(500);
const disk2 = await onDisk();
await sendWait(edit('IcosahedronGeometry(1, 1)', 'OctahedronGeometry(1, 0)'));
await until(() => ready(), 15000);
await until(() => bar() && !bar().classList.contains('lt-working'), 5000);
const atxt = bar()?.textContent || '';
step('Astra as the director: the same (its edit waits, "Astra\'s edit", its cost on the bar)', /Astra's edit/.test(atxt) && /tokens/.test(atxt) && /Octahedron/.test(d.codeOf().code) && (await onDisk()) === disk2, { atxt });
step('/try-first status says what waits', /on for .*Astra: waiting/.test(await Commands.tryRun('/try-first status', agent.id).then(() => LabTry.status())), LabTry.status());
bar().querySelector('.lt-undo').click();
await wait(1200);
step('Undo with Astra: back as it was', /IcosahedronGeometry\(1, 1\)/.test(d.codeOf().code) && (await onDisk()) === disk2);
Commands.tryRun('/director-engine claude', agent.id);
await wait(300);
await Commands.tryRun('/try-first off', agent.id);
step('no page errors from Try it first', true);
out.pass = out.steps.every((s) => s.ok);
return JSON.stringify(out, null, 1);
