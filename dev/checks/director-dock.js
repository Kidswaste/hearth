// The docked Three Director end to end with the fake engines: real MCP calls from the fake Claude (and then the fake
// Codex = Astra as a director), the activity strip, thumbnail, undo of its edit, chips, width / collapse, and the
// /director commands.
//   node dev/smoke.js --fake-engines --script dev/checks/director-dock.js --wait 6000 --check-timeout 240000 --shot /tmp/dock.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const out = {};
const run = (text, id) => Commands.tryRun(text, id);
// 1. the director, docked in the Lab
await run('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
const agent = H.agents().find((a) => a.dock === 'three');
activate('tool:three');
await ThreeLab.cmd();
await until(() => H.surfaces.get('tool:three')?.el.querySelector('.dd-strip'));
const host = H.surfaces.get('tool:three').el;
out.strip = Boolean(host.querySelector('.dd-strip'));
out.chips = [...host.querySelectorAll('.dd-chip')].map((c) => c.textContent);
// 2. a reply that really calls the three-lab MCP server
const before = ThreeLab.director.codeOf().code;
const calls = [
  ['three_console', {}],
  ['three_do', { cmd: 'layers' }],
  ['three_do', { cmd: 'help', topic: 'audio' }],
  ['three_edit_code', { edits: [{ find: before.split('\n')[0], replace: `${before.split('\n')[0]} // edited by the director` }], shot: true }],
  ['three_screenshot', { size: 'small' }],
  ['three_search_code', { pattern: 'renderer' }],
];
await Native.send(agent.id, `mcp please\nmcp: ${JSON.stringify(calls)}`);
await until(() => !Native.isBusy(H.activeChat[agent.id]), 90000);
const reply = Native.current(agent.id).messages.at(-1);
out.reply = reply.text.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(0, 150));
out.toolsInChat = reply.tools;
out.edited = ThreeLab.director.codeOf().code.includes('// edited by the director');
out.icons = [...host.querySelectorAll('.dd-call')].map((c) => c.textContent).join('');
out.sum = host.querySelector('.dd-sum').textContent;
out.thumb = !host.querySelector('.dd-thumb').hidden;
out.undoEnabled = !host.querySelector('.dd-undo').disabled;
// 3. one click undo
host.querySelector('.dd-undo').click();
await until(() => ThreeDirector.canRedo(), 8000);
await until(() => !ThreeLab.director.codeOf().code.includes('// edited by the director'), 8000);
out.undone = !ThreeLab.director.codeOf().code.includes('// edited by the director');
await run('/redo-edit', agent.id);
out.redone = ThreeLab.director.codeOf().code.includes('// edited by the director');
await run('/undo-edit', agent.id);
// 4. commands
const notes = () => [...Native.view(agent.id).list.querySelectorAll('.msg.note')].map((n) => n.textContent);
await run('/director-cost', agent.id);
await wait(300);
out.cost = notes().at(-1)?.slice(0, 400);
await run('/director cost all', agent.id);
await wait(300);
out.costAll = notes().at(-1)?.slice(0, 300);
await run('/director-edits', agent.id); await wait(100);
out.edits = notes().at(-1)?.slice(0, 200);
await run('/director-activity 5', agent.id); await wait(100);
out.activity = notes().at(-1)?.slice(0, 300);
await run('/director-stats', agent.id); await wait(100);
out.stats = notes().at(-1)?.slice(0, 300);
await run('/dock-width 520', agent.id);
out.width = getComputedStyle(host).getPropertyValue('--dock-w');
await run('/director-chips add Make it pink', agent.id);
out.ownChip = [...host.querySelectorAll('.dd-chip')].some((c) => c.textContent === 'Make it pink');
await run('/director-mode', agent.id); await wait(100);
out.mode = notes().at(-1);
await run('/director-try three_do {"cmd":"timeline"}', agent.id); await wait(200);
out.try = notes().at(-1)?.slice(0, 160);
out.videoDirectorStill = Commands.get('director').desc.slice(0, 120);
// 5. collapse to the thin bar and back
await run('/dock-collapse on', agent.id);
out.collapsed = host.classList.contains('dock-collapsed') && host.querySelector('.tool-dock').getBoundingClientRect().width;
host.querySelector('.dd-rail').click();
out.expanded = !host.classList.contains('dock-collapsed') && host.querySelector('.tool-dock').getBoundingClientRect().width;
// 6. Astra (fake Codex) as the director, with the same hub tools over MCP
await run('/director-engine astra', agent.id);
await until(() => H.agent(agent.id).engine === 'codex');
await wait(500);
await Native.send(agent.id, `mcp again\nmcp: ${JSON.stringify([['three_console', {}], ['three_sliders', {}]])}`);
await until(() => !Native.isBusy(H.activeChat[agent.id]), 90000);
const r2 = Native.current(agent.id).messages.at(-1);
out.astra = r2.text.split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(0, 150));
out.astraTools = r2.tools;
await run('/director-engine claude', agent.id);
await wait(300);
return JSON.stringify(out, null, 1);
