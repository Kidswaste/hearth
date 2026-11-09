// (round 128, projmenu128) The one project menu (projmenu.js), in the app:
//   same     the same rows from the chats list's project bar (name ▾), a Home card (⋯ and right-click), the Desk's ⋯ and
//            ProjectMenu.items for Ctrl/⌘+K; its header (mark, name, one status line)
//   rows     every row runs what it should (the parts it calls are stood in for while it runs, so nothing heavy opens)
//            or is left out for a project without that part (no scene, no moodboard, no files, no chat)
//   trips    Rename… / Colour and mark… / Archive · Unarchive by clicks, saved to kv projects
//   delete   Delete the project… asks first, naming what's inside; Cancel keeps it; Delete → Recently deleted, its chat
//            stays (in Earlier chats)
//   keys     Ctrl/⌘+Shift+O opens it on its first row; ↓ moves, Enter runs; Ctrl/⌘+K has "Project menu" and the
//            "Project: …" rows; the Lab reads the project's Aspect & frame rate
// Only the check's own temp data folder is used (smoke.js), never real data.
//   node dev/smoke.js --fake-engines --check-timeout 600000 --script dev/checks/projmenu128.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(80); } return false; };
const out = { steps: [], problems: [] };
const step = (label, ok, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra).slice(0, 600)}` : ''}`); if (!ok) out.problems.push(label); return ok; };
const errs = []; addEventListener('error', (e) => errs.push(e.message));
const vis = (n) => Boolean(n && n.isConnected && n.getClientRects().length && n.checkVisibility?.({ visibilityProperty: true }) !== false);
const menuOpen = () => vis(document.querySelector('#menu')) && !document.querySelector('#menu').hidden;
const rows = () => [...document.querySelectorAll('#menu > button')].filter(vis);
const rowText = (b) => (b.firstChild?.nodeType === 3 ? b.firstChild.textContent : b.textContent).trim();
const labels = () => rows().map(rowText);
const row = (re) => rows().find((b) => re.test(rowText(b)));
const close = () => { try { hideMenu(); } catch { /* none */ } };
const key = (k, o = {}) => (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, code: o.code || (k.length === 1 ? `Key${k.toUpperCase()}` : k), ctrlKey: Boolean(o.ctrl), shiftKey: Boolean(o.shift), bubbles: true, cancelable: true }));
const section = async (name, fn) => { try { await fn(); } catch (err) { step(`${name}: stopped`, false, String(err?.stack || err).slice(0, 400)); } finally { close(); } };
// a stand-in for one function while a row runs: records its calls
const spies = [];
const spy = (obj, name, ret = null) => { if (!obj) return null; const was = obj[name]; const s = { calls: [] }; obj[name] = (...a) => { s.calls.push(a); return typeof ret === 'function' ? ret(...a) : Promise.resolve(ret); }; spies.push(() => { obj[name] = was; }); return s; };
const unspy = () => { while (spies.length) spies.pop()(); };

await Lazy.load('projects'); await Projects.ready();
await Lazy.load('projmenu');
const P = Projects; const M = ProjectMenu;
step('the projmenu group loads after projects (ProjectMenu, the Ctrl/⌘+K action, its key line)', typeof M?.items === 'function' && AppUI.actions().some((a) => a.label === 'Project menu') && Keys.all().some((k) => k.keys === M.KEY));

// a project with everything (the wizard's own create: chat, scene, moodboard) and a bare one
const pa = await ProjectWorkspace.create({ name: 'Menu Alpha', plugins: [] });
const fileRef = `${window.SMOKE_TMP || '/tmp'}/pm128/footage.mp4`;
P.add(pa, 'file', fileRef, 'footage.mp4', { links: false });
const pb = P.create({ name: 'Menu Bare' });
await P.flush();
step('setup: Menu Alpha has its chat, scene and moodboard; Menu Bare is empty', Boolean(pa.workspace?.chatId && pa.workspace?.sceneId && pa.workspace?.boardId) && !pb.items.length);
await ProjectWorkspace.go('overview');
await until(() => vis(document.querySelector('.pj-home .pj-p-name')) && document.querySelector('.pj-home .pj-p-name').textContent === 'Menu Alpha', 20000);

// ---------- 1. the same menu from the Desk, a Home card (⋯ and right-click) and the bar ----------
const seen = {};
await section('1. the same menu everywhere', async () => {
  const want = M.items(pa, { where: 'desk' }).filter((x) => typeof x === 'object').map((x) => x.id);
  step('ProjectMenu.items: the same rows for the bar, Home, the Desk, the key and Ctrl/⌘+K', ['bar', 'home', 'key', 'palette', 'menu'].every((w) => JSON.stringify(M.items(pa, { where: w }).filter((x) => typeof x === 'object').map((x) => x.id)) === JSON.stringify(want)), want);
  step('…in sections: Open · Make · AI · Look · Share & keep · Settings · Close', JSON.stringify(M.items(pa).filter((x) => typeof x === 'string')) === JSON.stringify(['Open', 'Make', 'AI', 'Look', 'Share & keep', 'Settings', 'Close']), M.items(pa).filter((x) => typeof x === 'string'));
  step('Projects.menu (Search everything\'s project rows) is the same menu', JSON.stringify(P.menu(pa).filter((x) => typeof x === 'object').map((x) => x.id)) === JSON.stringify(want));
  // the Desk's ⋯
  const dots = [...document.querySelectorAll('.pj-home .pj-p-actions button')].find((b) => b.textContent.trim() === '⋯');
  dots?.scrollIntoView({ block: 'center' }); await wait(150); dots?.click();
  await until(menuOpen, 4000);
  seen.desk = labels();
  const head = document.querySelector('#menu .pm-head');
  step('the Desk\'s ⋯ opens it with its header: mark, name, one status line', vis(head) && head.querySelector('.pm-mark')?.textContent === pa.ident.glyph && head.querySelector('.pm-name')?.textContent === 'Menu Alpha' && /\d+ chats? · \d+ scenes?/.test(head.querySelector('.pm-status')?.textContent || ''), head?.textContent);
  step('…every row has a visible label (icons beside the words)', seen.desk.length >= 20 && seen.desk.every((t) => t.length > 1) && document.querySelectorAll('#menu > button .menu-ico').length >= 10, { n: seen.desk.length, icons: document.querySelectorAll('#menu > button .menu-ico').length });
  close();
  // Home: the card's ⋯ and its right-click
  await ProjectWorkspace.home();
  await until(() => document.querySelector(`.pj-card[data-project="${pa.id}"] .pj-card-more`), 15000);
  const card = document.querySelector(`.pj-card[data-project="${pa.id}"]`);
  card.querySelector('.pj-card-more').click();
  await until(menuOpen, 4000);
  seen.card = labels();
  step('Home: the card\'s ⋯ opens the menu (the card itself doesn\'t open)', vis(document.querySelector('#menu .pm-head')) && !ProjectWorkspace.current(), ProjectWorkspace.current()?.id);
  close();
  const r = card.getBoundingClientRect();
  card.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 }));
  await until(menuOpen, 4000);
  seen.right = labels();
  close();
  // the chats list's project bar
  ProjChats.setScope(pa.id); Panel.render(); await wait(150);
  const bar = document.querySelector('#panel .pc-bar .pc-project');
  bar?.click();
  await until(menuOpen, 4000);
  seen.bar = labels();
  close();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  step('the bar\'s name ▾, the card\'s ⋯, its right-click and the Desk\'s ⋯ show the same rows', seen.desk.length > 0 && same(seen.desk, seen.card) && same(seen.desk, seen.right) && same(seen.desk, seen.bar), { desk: seen.desk, bar: seen.bar.filter((x) => !seen.desk.includes(x)), card: seen.card.filter((x) => !seen.desk.includes(x)) });
});

// ---------- 2. every row runs, or is left out ----------
await section('2. every row runs or is hidden', async () => {
  const ids = (p) => M.items(p).filter((x) => typeof x === 'object').map((x) => x.id);
  const bare = ids(pb);
  const missing = ['lab', 'moodboard', 'song', 'render', 'folder', 'describe', 'personality', 'access'].filter((id) => bare.includes(id));
  step('a bare project: no Open in the Lab / moodboard / song / render / folder / AI description / personality / files rows', !missing.length, { shown: missing });
  step('…and its always-there rows are', ['desk', 'chats', 'newchat', 'newscene', 'rename', 'look', 'cover', 'export', 'duplicate', 'ai', 'frame', 'archive', 'delete'].every((id) => bare.includes(id)), bare);
  const briefRows = ids(pa).filter((id) => id === 'brief' || id === 'next');
  const briefThere = typeof ProjectBrief !== 'undefined' || Lazy.groups().some((g) => g.name === 'projectbrief' || g.also?.includes('projectbrief')); // (round 164: in 'projects')
  step(`the brief rows ${briefThere ? 'show (ProjectBrief is there)' : 'are hidden (no ProjectBrief this round yet)'}`, briefThere ? briefRows.length === 2 : !briefRows.length, briefRows);
  // each leaf row of Menu Alpha, with what it calls stood in for
  await Lazy.load('versions');
  const S = {
    open: spy(ProjectWorkspace, 'open'), cont: spy(P, 'continueIn'), scope: spy(ProjChats, 'setScope'), notes: spy(P, 'notesPrompt'), rename: spy(P, 'renamePrompt'),
    bundle: spy(P, 'bundle'), banner: spy(window.ProjectFrontpage, 'edit'), offline: spy(window.Offline, 'prepare'), versions: spy(Versions, 'open'), describe: spy(ProjectWorkspace, 'describe'),
    settings: spy(ProjectWorkspace, 'settings'), reveal: spy(MediaFile, 'reveal'), dialog: spy(M.io, 'pick', []), act: spy(ThreeLab, 'act'), panel: spy(LabExport, 'panel'),
    form: spy(Modal, 'form', null), brief: typeof ProjectBrief !== 'undefined' ? spy(ProjectBrief, 'prepare') : null, briefOpen: typeof ProjectBrief !== 'undefined' ? spy(ProjectBrief, 'open') : null,
  };
  const expect = {
    desk: () => S.open.calls.some((a) => a[0] === pa.id && a[1] === 'overview'), lab: () => S.open.calls.some((a) => a[0] === pa.id && a[1] === 'scene'),
    chats: () => S.scope.calls.some((a) => a[0] === pa.id), continue: () => S.cont.calls.some((a) => a[0] === pa), newscene: () => S.act.calls.some((a) => a[0] === 'newSketch'),
    moodboard: () => S.dialog.calls.length > 0, song: () => S.dialog.calls.length > 0, notes: () => S.notes.calls.length > 0, rename: () => S.rename.calls.length > 0,
    describe: () => S.describe.calls.length > 0, look: () => vis(document.querySelector('dialog.pm-look[open]')), banner: () => S.banner.calls.length > 0,
    export: () => S.bundle.calls.length > 0, duplicate: () => S.bundle.calls.length > 0, folder: () => S.reveal.calls.some((a) => a[0] === fileRef), render: () => S.panel.calls.length > 0,
    offline: () => S.offline.calls.length > 0, versions: () => S.versions.calls.some((a) => a[0]?.id === pa.id), personality: () => S.settings.calls.length > 0, frame: () => S.form.calls.length > 0,
    access: () => menuOpen() && labels().some((t) => /^As in AI setup/.test(t)), archive: () => P.get(pa.id)?.status === 'archived', delete: () => vis(document.querySelector('dialog[open] .danger-fill')),
    template: () => vis(document.querySelector('dialog.ptpl[open]')), // (round 129, next129) Save as a template… opens its card
    brief: () => S.brief?.calls.length > 0, next: () => (S.briefOpen?.calls.length || 0) > 0 || typeof ProjectBrief?.next === 'function',
  };
  const res = {};
  for (const it of M.items(pa).filter((x) => typeof x === 'object')) {
    for (const s of Object.values(S)) if (s) s.calls.length = 0;
    if (it.items) { const sub = (typeof it.items === 'function' ? it.items() : it.items).filter((x) => typeof x === 'object'); res[it.id] = sub.length > 0 && sub.every((x) => x.disabled || x.items || typeof x.action === 'function'); continue; }
    if (!expect[it.id]) { res[it.id] = 'no expectation'; continue; }
    try { it.action(); } catch (err) { res[it.id] = `threw ${err.message}`; continue; }
    res[it.id] = await until(expect[it.id], 4000);
    close();
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    if (it.id === 'archive') P.setStatus(pa, 'active');
    await wait(60);
  }
  unspy();
  const bad = Object.entries(res).filter(([, v]) => v !== true);
  step('Menu Alpha: every row runs what it should (submenus have rows)', !bad.length, { bad, ran: Object.keys(res).length });
  // New chat ›: the AIs, the project's Default AI first
  const ais = H.agents().filter((a) => a.mode === 'native');
  const astra = ais.find((a) => a.engine === 'codex') || ais.at(-1);
  M.items(pa).find((x) => x.id === 'ai').items().find((x) => x.label === astra.name).action();
  const nc = M.items(pa).find((x) => x.id === 'newchat').items();
  step('Settings › Default AI: kept on the project, offered first in New chat ›', P.get(pa.id).prefs?.agentId === astra.id && nc.length === ais.length && nc[0].label === `With ${astra.name}` && /default/.test(nc[0].hint), nc.map((x) => `${x.label} ${x.hint}`));
});

// ---------- 3. Rename / Colour and mark / Archive round trips (by clicks) ----------
await section('3. rename, colour and mark, archive', async () => {
  ProjChats.setScope(pa.id); Panel.render(); await wait(150);
  const openBar = async () => { close(); document.querySelector('#panel .pc-bar .pc-project')?.click(); return until(menuOpen, 4000); };
  await openBar(); row(/^Rename…$/)?.click();
  await until(() => document.querySelector('dialog[open] input'), 4000);
  { const i = document.querySelector('dialog[open] input'); i.value = 'Menu Alpha Two'; [...document.querySelectorAll('dialog[open] button')].find((b) => /^OK$/.test(b.textContent.trim()))?.click(); }
  await until(() => P.get(pa.id).name === 'Menu Alpha Two', 4000);
  await until(() => document.querySelector('#panel .pc-bar .pc-name')?.textContent === 'Menu Alpha Two', 3000);
  step('Rename… renames it (data and the bar)', P.get(pa.id).name === 'Menu Alpha Two' && document.querySelector('#panel .pc-bar .pc-name')?.textContent === 'Menu Alpha Two', document.querySelector('#panel .pc-bar .pc-name')?.textContent);
  await openBar(); row(/^Colour and mark…$/)?.click();
  await until(() => document.querySelector('dialog.pm-look[open]'), 4000);
  const ci = (pa.ident.ci + 3) % ProjectsCore.MC.PALETTE.length; const gi = (pa.ident.gi + 5) % ProjectsCore.MC.GLYPHS.length;
  document.querySelectorAll('dialog.pm-look .pm-swatch')[ci]?.click();
  document.querySelectorAll('dialog.pm-look .pm-glyph')[gi]?.click();
  [...document.querySelectorAll('dialog.pm-look button')].find((b) => b.textContent.trim() === 'Done')?.click();
  await until(() => document.querySelector('#panel .pc-bar .pc-mark')?.textContent === ProjectsCore.MC.GLYPHS[gi], 3000);
  step('Colour and mark… sets both (data and the bar\'s mark)', pa.ident.ci === ci && pa.ident.gi === gi && pa.ident.color === ProjectsCore.MC.PALETTE[ci][0] && document.querySelector('#panel .pc-bar .pc-mark')?.textContent === pa.ident.glyph, pa.ident);
  await openBar(); row(/^Archive$/)?.click();
  await wait(200);
  step('Archive archives it (out of the live list)', P.get(pa.id).status === 'archived' && !P.live().includes(P.get(pa.id)));
  await openBar();
  const un = row(/^Unarchive$/);
  un?.click(); await wait(200);
  step('…its menu then says Unarchive, which brings it back', Boolean(un) && P.get(pa.id).status === 'active' && P.live().includes(P.get(pa.id)));
  await P.flush(); await wait(300);
  const disk = await window.hub.kvGet('projects', null);
  const d = disk?.list?.find((x) => x.id === pa.id);
  step('…all three are saved (kv projects)', d?.name === 'Menu Alpha Two' && d?.ident?.ci === ci && d?.ident?.gi === gi && d?.status === 'active' && d?.prefs?.agentId, d && { name: d.name, ident: d.ident, status: d.status, prefs: d.prefs });
});

// ---------- 4. Delete asks first, then Recently deleted ----------
await section('4. delete', async () => {
  const pc = P.create({ name: 'Menu Gamma' });
  const chat = H.chats.find((c) => c.id === pa.workspace.chatId);
  const loose = { id: `${H.claudeAgent().id}-pm${Date.now().toString(36)}`, agentId: H.claudeAgent().id, title: 'Gamma notes', createdAt: Date.now(), updatedAt: Date.now(), session: {}, messages: [{ role: 'user', text: 'gamma', at: Date.now() }] };
  Native.adopt(loose, { openIt: false }); await until(() => H.chats.some((c) => c.id === loose.id), 5000);
  P.add(pc, 'chat', loose.id, loose.title);
  P.add(pc, 'file', fileRef, 'footage.mp4', { links: false });
  ProjChats.setScope(pc.id); Panel.render(); await wait(150);
  const openBar = async () => { close(); document.querySelector('#panel .pc-bar .pc-project')?.click(); return until(menuOpen, 4000); };
  await openBar(); row(/^Delete the project…$/)?.click();
  await until(() => document.querySelector('dialog[open] .danger-fill'), 4000);
  const text = document.querySelector('dialog[open]')?.textContent || '';
  step('Delete the project… asks first, naming what\'s inside and where it goes', Boolean(P.get(pc.id)) && /1 chat/.test(text) && /1 file/.test(text) && /Recently deleted/.test(text) && /Earlier chats/.test(text), text.slice(0, 300));
  [...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Cancel')?.click();
  await wait(250);
  step('…Cancel keeps it', Boolean(P.get(pc.id)));
  await openBar(); row(/^Delete the project…$/)?.click();
  await until(() => document.querySelector('dialog[open] .danger-fill'), 4000);
  document.querySelector('dialog[open] .danger-fill')?.click();
  await until(() => !P.get(pc.id), 4000);
  step('…Delete puts it in Recently deleted; its chat stays', !P.get(pc.id) && P.trashed().some((x) => x.id === pc.id) && H.chats.some((c) => c.id === loose.id) && Boolean(chat));
  const back = P.restoreProject(pc.id);
  step('…and it comes back from there whole', back?.items?.length === 2);
});

// ---------- 5. keyboard, Ctrl/⌘+K, the Lab ----------
await section('5. keys, Ctrl/⌘+K, the Lab', async () => {
  ProjChats.setScope(pa.id); Panel.render(); await wait(150);
  close();
  key('O', { ctrl: true, shift: true, code: 'KeyO' });
  await until(menuOpen, 4000);
  const first = document.querySelector('#menu .kb-on');
  step('Ctrl/⌘+Shift+O opens the open project\'s menu on its first row', menuOpen() && document.querySelector('#menu .pm-name')?.textContent === P.get(pa.id).name && first && rowText(first) === 'Open the Desk', first && rowText(first));
  key('ArrowDown');
  const second = document.querySelector('#menu .kb-on');
  step('…↓ moves to the next row', second && second !== first, second && rowText(second));
  const notes = spy(P, 'notesPrompt');
  for (let i = 0; i < 30 && rowText(document.querySelector('#menu .kb-on') || document.body) !== 'Notes…'; i += 1) key('ArrowDown');
  key('Enter');
  await until(() => notes.calls.length, 3000);
  unspy();
  step('…↓ to Notes… and Enter runs it (for this project)', notes.calls[0]?.[0]?.id === pa.id && !menuOpen());
  const pr = M.paletteRows();
  step('Ctrl/⌘+K: "Project menu" and the "Project: …" rows of the open project', AppUI.actions().some((a) => a.label === 'Project menu' && a.keys === M.KEY) && ['Project: Open the Desk', 'Project: Rename…', 'Project: Archive', 'Project: Delete the project…', 'Project: New chat ›'].every((l) => pr.some((r) => r.label === l)), pr.map((r) => r.label));
  const rn = spy(P, 'renamePrompt');
  pr.find((r) => r.label === 'Project: Rename…')?.run();
  unspy();
  step('…a row runs for the project in front of you', rn.calls[0]?.[0]?.id === pa.id, rn.calls[0]?.[0]?.name);
  // Aspect & frame rate: kept on the project, and the Lab's scenes take it
  const v = spy(Modal, 'form', { aspect: '9:16', fps: '24' });
  await M.items(pa).find((x) => x.id === 'frame').action();
  unspy();
  await wait(200);
  const sid = pa.workspace.sceneId;
  step('Aspect & frame rate… saves it on the project and its scene uses it in the Lab', v.calls.length === 1 && P.get(pa.id).prefs?.aspect === '9:16' && P.get(pa.id).prefs?.fps === 24 && ThreeLab.scenes.frameOf(sid) === '9:16', { prefs: P.get(pa.id).prefs, frame: ThreeLab.scenes.frameOf(sid) });
  // Cover picture › a frame of its main scene (opens it in the Lab, takes the picture)
  const path = await M.coverFromLab(P.get(pa.id)).catch((err) => `failed: ${err.message}`);
  const drew = !/^failed/.test(path);
  step(drew ? 'Cover picture › a frame of its main scene becomes its cover' : 'Cover picture › a frame of its main scene: the Lab draws nothing on this machine (no GPU picture), so it says so calmly', drew ? typeof path === 'string' && P.get(pa.id).cover === ProjectsCore.itemId('capture', path) : /Nothing is drawing/.test(path), { path, scene: ThreeLab.scenes.currentId(), onScreen: ThreeLab.onScreen() });
});

step('no page errors', !errs.length, errs.slice(0, 3));
return JSON.stringify(out, null, 1);
