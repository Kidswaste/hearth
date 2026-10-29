// (Oct 29) a jam started in a project lands in it: its chat and its copy of the scene are the project's items.
//   node dev/smoke.js --fake-engines --script dev/checks/jam-project.js --wait 6000 --check-timeout 400000
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const C = H.claudeAgent();
await Lazy.load('projects'); activate('tool:three');
await until(() => window.ThreeLab?.scenes?.currentId?.(), 30000);
const scene = ThreeLab.scenes.currentId();
const p = Projects.create({ name: 'Jam project test' });
Projects.add(p, 'scene', scene, '');
await Commands.tryRun('/jam 1 a test jam', C.id);
const m = await until(() => Jam.latest(), 30000);
await until(() => !Jam.running(), 240000);
const chatId = (H.chats || []).find((c) => c.messages?.some?.((x) => x.id === m?.id))?.id || Native.chatOf(H.agents().find((a) => a.dock === 'three')?.id)?.id;
const proj = Projects.get(p.id);
const items = proj.items.map((x) => `${x.type}:${x.ref}`);
const copyId = ThreeLab.scenes.currentId();
const out = { status: m?.status, chatInProject: items.includes(`chat:${chatId}`), copyInProject: copyId !== scene && items.includes(`scene:${copyId}`), items };
out.ok = out.status === 'done' && out.chatInProject && out.copyInProject;
return JSON.stringify(out);
