// Lab drop (report #61): a project's chat builds in the Lab every turn (project-workspace.js asDirector) without being
// a Three Director, and a .glb dropped in it kept its own path (Access on: a plain "open it with Read" file), so
// three_references add refused it (only the attachments folder). Now the project chat handles drops like the director:
//   Lab open → the file is added to the sketch's references (a "reference: …" note in the message);
//   Lab can't take it → a copy in the attachments folder, which three_references add accepts;
//   a chat outside any project is unchanged (no copy, no reference).
// ThreeLab.addReference is stubbed so the check doesn't need a sketch on screen.
//   node dev/smoke.js --fake-engines --check-timeout 120000 --script dev/checks/labdrop61.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const fail = []; const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const out = {};
let realAdd = null;
try {
  if (typeof ThreeLab === 'undefined') await Lazy.load('lab');
  realAdd = ThreeLab.addReference;
  await Lazy.load('projects'); await Projects.ready();
  const C = H.claudeAgent();
  activate(C.id);
  await until(() => Native.hasView(C.id));
  Native.newChat(C.id);
  await Native.send(C.id, 'hello'); await wait(150);
  await until(() => H.activeChat[C.id] && !Native.isBusy(H.activeChat[C.id]), 60000);
  const chatId = H.activeChat[C.id];
  const v = Native.view(C.id);
  const attDir = await window.hub.attachmentsDir();
  const dir = `/tmp/hearth-labdrop61-${Date.now().toString(36)}`;
  const glb = `${dir}/hyper_buildings.glb`;
  await window.hub.fs.write(glb, 'glTF fake model');
  const reset = () => { v.attachments.length = 0; Native.renderChips(C.id); };
  const added = [];

  // outside a project: as before (no reference, no copy in the attachments folder)
  ThreeLab.addReference = async (p) => { added.push(p); return { key: 'hyper_buildings', name: 'hyper_buildings.glb', kind: 'model' }; };
  reset(); await Native.addPath(C.id, glb);
  ok(!added.length, `a chat outside a project doesn't add Lab references (${added.length})`);
  ok(!v.attachments.some((a) => String(a.path || '').startsWith(attDir)), 'a chat outside a project keeps no copy');

  // in a project with a workspace: the Lab takes it as a reference
  const p = Projects.create({ name: 'Lab drop 61' });
  p.workspace = { description: 'check' };
  Projects.add(p, 'chat', chatId, 'Lab drop chat', { links: false });
  ok(Projects.projectOfChat(chatId)?.id === p.id, 'the chat is in the project');
  reset(); await Native.addPath(C.id, glb);
  out.added = added.slice();
  ok(added.length === 1 && added[0] === glb, `the project chat adds the .glb to the sketch's references (${JSON.stringify(added)})`);
  ok(v.attachments.some((a) => a.kind === 'text' && /hyper_buildings/.test(a.content || '')), 'the message says the reference name');

  // the Lab can't take it: a copy in the attachments folder (what three_references add accepts)
  ThreeLab.addReference = () => Promise.reject(new Error('Open the Three.js Lab first'));
  reset(); await Native.addPath(C.id, glb);
  const f = v.attachments.find((a) => a.kind === 'file');
  out.copy = f?.path;
  ok(f && f.path.toLowerCase().startsWith(attDir.toLowerCase()), `the .glb is copied into the attachments folder (${f?.path})`);
  ok(f && (await window.hub.fs.read(f.path)) === 'glTF fake model', 'the copy has the file\'s content');
  reset();
} catch (err) { fail.push(`threw: ${err.stack || err.message}`); }
if (realAdd) ThreeLab.addReference = realAdd;
return JSON.stringify({ ok: !fail.length, fail, ...out }, null, 1);
