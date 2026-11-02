// (round 108, projaudit108) a project holding a GIANT chat (dev/bigchat84-fixture.js: 6,000 messages, ≈ 63 MB, in project
// "Clink"; a rare word in message #30), by clicks, on a throwaway copy of the fixture (never real data):
//   switch   from "Neon Tide 1", the name ▾ › Clink: ready, its Desk drawn
//   find     the Desk's Find in this project: the rare word typed → a Messages row → a click opens the giant chat on
//            that message
//   export   the Desk's ⋯ › ⇪ Export project… → its card → Export…: the .hearthproject written, the giant chat in it
//   node dev/smoke.js --fake-engines --data <fixture> --wait 1000 --check-timeout 600000 --lib dev/projaudit108-lib.js --script dev/projaudit108-big.js
const RARE = 'zanzibar84quokka';
const slow = {};
try {
  await until(() => document.querySelector('#agent-buttons .space-button'), 60000);
  await Lazy.load('projects'); await Projects.ready();
  const clink = Projects.get('pjbp0'); const other = Projects.get('pjbp1');
  // (the fixture keeps Clink and Neon Tide 1 archived: out of the name ▾ by design; put back to Active as the owner would)
  for (const x of [clink, other]) if (x?.status === 'archived') Projects.setStatus(x, 'active');
  await Projects.flush();
  step('fixture: "Clink" holds the giant chat', clink?.items.some((x) => x.ref === 'claude-giant0'), clink?.items.length);
  await safe('switch', async () => {
    const tA = performance.now();
    await ProjectWorkspace.open(other.id).catch((e) => step('open "Neon Tide 1"', false, e.message)); await ProjectWorkspace.go('overview').catch(() => {});
    await until(() => deskName() === other.name && nameBtn(), 60000);
    slow.firstOpen = Math.round(performance.now() - tA);
    step(`first: "${other.name}" open on its Desk (the name ▾ there)`, Boolean(nameBtn()) && deskName() === other.name, { ms: slow.firstOpen, desk: deskName(), state: JSON.stringify(ProjectWorkspace.state()).slice(0, 300) });
    await click(nameBtn());
    await until(() => menuItem(/Clink/), 4000);
    const t0 = performance.now();
    await click(menuItem(/Clink/));
    await until(() => ProjectWorkspace.current()?.id === 'pjbp0' && ProjectWorkspace.state().phase === 'ready', 120000, 50);
    slow.switch = Math.round(performance.now() - t0);
    step('the name ▾ › Clink: the project with the giant chat is open (ready)', ProjectWorkspace.current()?.id === 'pjbp0' && ProjectWorkspace.state().phase === 'ready', { ms: slow.switch, state: JSON.stringify(ProjectWorkspace.state()).slice(0, 300) });
  });
  await safe('find', async () => {
    await ProjectWorkspace.go('overview');
    const tI = performance.now();
    await until(() => deskName() === 'Clink' && ProjFind.state().ready.includes('pjbp0'), 120000, 100);
    slow.findIndex = Math.round(performance.now() - tI);
    const box = await until(() => { const b = document.querySelector('.pw-desk .pf-input, .pj-home .pf-input'); return b && visible(b) ? b : null; }, 30000);
    step('the Desk: Find in this project', Boolean(box));
    await click(box);
    const t0 = performance.now();
    await typeText(RARE);
    const row = await until(() => [...document.querySelectorAll('.pf-group[data-g="chat"] .pf-row')].find(visible), 60000, 50);
    slow.find = Math.round(performance.now() - t0);
    step(`…“${RARE}” (in message #30 of the giant chat) is found`, Boolean(row), { ms: slow.find, desk: deskName(), stats: JSON.stringify(ProjFind.state().stats || {}).slice(0, 300), groups: [...document.querySelectorAll('.pf-group')].map((g) => g.dataset.g) });
    if (!row) return;
    const hit = ProjFind._S?.rows?.[Number(row.dataset.i)];
    const t1 = performance.now();
    await click(row);
    const agent = H.chats.find((c) => c.id === 'claude-giant0')?.agentId || 'claude';
    const node = await until(() => H.activeChat[agent] === 'claude-giant0' && Native.view(agent)?.list?.querySelector(`.msg[data-index="${hit?.k ?? 30}"]`), 60000, 50);
    slow.findOpen = Math.round(performance.now() - t1);
    step('…its row opens the giant chat on that message', Boolean(node) && (node.textContent || '').includes(RARE), { ms: slow.findOpen, k: hit?.k, text: node?.textContent?.slice(0, 80) });
  });
  await safe('export', async () => {
    await onDesk('pjbp0');
    await openDots();
    const picked = await pickMenu(/^⇪ Export project…/);
    const t0 = performance.now();
    const c = await until(() => card()?.querySelector('.pb-go') && card(), 120000, 50);
    slow.exportCard = Math.round(performance.now() - t0);
    step('the Desk\'s ⋯ › ⇪ Export project… opens the card (what goes: the giant chat)', picked && Boolean(c) && /Its chats · \d+ chats · [\d.]+ MB/.test(c?.textContent || ''), { ms: slow.exportCard, picked, desk: deskName(), state: JSON.stringify(ProjectWorkspace.state()).slice(0, 200), status: card()?.textContent?.slice(0, 300) || [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | ').slice(0, 300) });
    if (!c) return;
    const t1 = performance.now();
    await click(c.querySelector('.pb-go'));
    await until(() => !card() && ProjBundle.last?.exported, 300000, 100);
    slow.export = Math.round(performance.now() - t1);
    const file = ProjBundle.last?.exported;
    const st = file ? await hub.fs.stat(file).catch(() => null) : null;
    step('…Export… writes the .hearthproject, the giant chat in it (several MB)', st?.size > 2 * 1048576, { file, size: st?.size, ms: slow.export });
  });
} catch (err) {
  step('no exception', false, String(err?.stack || err).slice(0, 700));
}
step('slow steps (ms)', true, slow);
out.fails = out.steps.filter((s) => !s.ok).map((s) => s.name);
out.pass = !out.fails.length;
return JSON.stringify(out);
