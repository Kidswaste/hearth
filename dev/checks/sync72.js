// (round 72, sync72) The sync indicator and its panel, by clicks: "✓ Synced" in the rail → a click opens the panel (where
// things stand in words, Sync now); a file the other computer is still sending → "↻ 1 waiting", the panel names it and
// why; a chat renamed on both computers → "⚠ 1 conflict", the panel shows both versions side by side with Keep PC /
// Keep Mac / Keep both, a click on Keep Mac settles it; a store item changed two ways → Keep both keeps both; a real
// sync error → "Last problem" in plain words; nothing polls while the panel is open; Escape / a click elsewhere close it.
// This computer is made to look like a Windows PC (the panel's words), "the other computer" is a Mac (its machine record
// in the temp cloud folder). Only a temp folder is used as the cloud.
//   node dev/smoke.js --check-timeout 240000 --lib dev/checks/journey-lib.js --script dev/checks/sync72.js
const { step, wait, until, click } = J;
const api = window.hub.sync;
const claude = H.claudeAgent();
const CLOUD = `${window.SMOKE_TMP || '/tmp'}/hearth-sync72-${Date.now()}`; // (round 88, checkfix88) in the run's own scratch folder, removed after the run (a /tmp folder was left by every run)
const F = (rel) => `${CLOUD}/Hearth/files/${rel}`;
const dot = () => document.getElementById('sync-dot');
const chip = () => dot()?.querySelector('.sync-chip')?.textContent || '';
const panel = () => document.querySelector('.sync-panel');
const settle = () => wait(2300); // the engine waits 2 s after a cloud file changes (it may still be written)
const btn = (re, root = panel()) => [...(root?.querySelectorAll('button') || [])].find((b) => re.test(b.textContent));
// this computer as a Windows PC for the panel's words (read when the panel's code loads, on the first click)
Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });

// 0. on, with "the other computer" (a Mac) already in the cloud folder
const MAC = { id: 'studio-mac-1a2b3c4d', name: 'Studio Mac', platform: 'darwin', dataDir: '/Users/q/Library/Application Support/Hearth/data', home: '/Users/q', lastSeen: Date.now() - 60000, lastOk: Date.now() - 60000 };
await window.hub.fs.write(`${CLOUD}/Hearth/.sync/machines/${MAC.id}.json`, JSON.stringify(MAC));
await window.hub.fs.write(`${CLOUD}/Hearth/files/.keep-folder`, '');
const mine = { id: 'sync72-chat', agentId: claude.id, title: 'Intro video', updatedAt: Date.now(), messages: [{ role: 'user', at: 1, text: 'hello' }] };
await window.hub.saveChat(mine);
await window.hub.kvSet('sync72-items', [{ id: 'i1', name: 'Neon' }, { id: 'i2', name: 'Grain' }]);
await api.on({ root: CLOUD });
await api.autoResolve(false); // conflicts stay for the owner's choices (settled by themselves is round 26's check)
await Sync.refresh();
await until(() => Sync.status().state === 'synced', 20000);
await until(() => /Synced/.test(chip()), 4000);
step('the indicator says "✓ Synced" in the rail, its name says when', /^✓ Synced$/.test(chip()) && /^Sync: Synced (just now|\d+ min ago)$/.test(dot()?.getAttribute('aria-label') || ''), { chip: chip(), name: dot()?.getAttribute('aria-label') });

// the one-time "Welcome to this computer" note (a first sync with another computer) sits where the panel opens: Got it.
// (round 88, checkfix88) waited for, not a fixed 1.5 s: on a busy box it came later, over the open panel, and a click
// on "Sync now" landed on its "Check Claude" (AI setup opened: "Claude Code isn't installed", three runs in a row).
// It comes through the hints queue once sync has met the Mac (store two.welcomed is set when it shows).
await until(() => store.get('two.welcomed', 0) && document.querySelector('.two-welcome'), 10000);
const gotIt = [...document.querySelectorAll('.two-welcome button')].find((b) => b.textContent.trim() === 'Got it' && J.visible(b));
if (gotIt) { await click(gotIt); await until(() => !document.querySelector('.two-welcome'), 2000); }

// 1. a click opens the panel: plain words, Sync now
await click('#sync-dot');
await until(() => panel()?.querySelector('h2'), 20000); // (its code loads on first use: behind the after-start groups on a busy start)
step('a click on the indicator opens the sync panel next to it', Boolean(panel()) && panel().getAttribute('role') === 'dialog' && /Synced/.test(panel().querySelector('h2')?.textContent || ''), panel()?.textContent?.slice(0, 160));
if (!panel()) return J.done();
step('it says where (the folder), when it checked, and the other computer', /with /.test(panel().textContent) && /checked/.test(panel().textContent) && /Studio Mac \(Mac\)/.test(panel().textContent), panel()?.querySelector('.sp-title .hint')?.textContent);
// (round 88) a note offered now (the welcome again, an update note…) waits until the panel closes: never over it
{ // (the box's own busyness — a long task just now on a loaded machine — is set aside: the panel alone must hold them)
  const jank = window.Jank?.busy; if (jank) window.Jank.busy = () => false;
  const why = window.Hints?.busy?.(); if (jank) window.Jank.busy = jank;
  step('while the panel is open, notes that come by themselves wait (hints: "dialog")', why === 'dialog', why);
}
step('Sync now, Deleted files, ⋯ More', Boolean(btn(/^Sync now$/)) && Boolean(btn(/Deleted files/)) && Boolean(panel().querySelector('[aria-label="More sync options"]')));
await click(btn(/^Sync now$/));
await until(() => btn(/^Sync now$/) && !btn(/^Sync now$/).disabled, 8000);
step('Sync now from the panel: still synced', Sync.status().state === 'synced');

// 2. nothing polls while it is open (it redraws on the engine's own status messages only)
const calls = { status: 0, conflicts: 0, preview: 0 };
const orig = { status: api.status, conflicts: api.conflicts, preview: api.preview };
for (const k of Object.keys(calls)) api[k] = (...a) => { calls[k] += 1; return orig[k](...a); };
await wait(4000);
for (const k of Object.keys(calls)) api[k] = orig[k];
step('open for 4 s with nothing changing: no status / conflict calls (no polling)', !calls.status && !calls.conflicts && !calls.preview, calls);

// 3. something on its way: the other computer's journal announces a bigger file than the cloud holds so far
const arriving = { id: 'sync72-arriving', agentId: claude.id, title: 'Arriving from the Mac', updatedAt: Date.now(), messages: [{ role: 'user', at: 2, text: 'still downloading' }] };
await window.hub.fs.write(F('chats/sync72-arriving.json'), JSON.stringify(arriving));
await window.hub.fs.write(`${CLOUD}/Hearth/.sync/journal/${MAC.id}.jsonl`, `${JSON.stringify({ t: Date.now(), op: 'put', rel: 'chats/sync72-arriving.json', h: 'x', s: 99999 })}\n`);
await settle();
await click(btn(/^Sync now$/));
await until(() => Sync.status().state === 'pending', 8000);
await until(() => /waiting/.test(chip()) && /Waiting/.test(panel()?.textContent || ''), 4000);
const cs = dot()?.querySelector('.sync-chip');
step('a file still arriving: "↻ 1 waiting" in the rail, whole (not cut off)', /^↻ 1 waiting$/.test(chip()) && cs.scrollWidth <= cs.clientWidth + 1, { chip: chip(), scroll: cs?.scrollWidth, client: cs?.clientWidth, dot: dot()?.getBoundingClientRect().width, rail: document.getElementById('rail').clientWidth });
const waitRow = [...(panel()?.querySelectorAll('.sp-wait li') || [])].map((li) => li.textContent).join(' | ');
step('the panel names it and says why, in words', /Waiting \(1\)/.test(panel().textContent) && /sync72-arriving|Arriving/.test(waitRow) && /on its way from Studio Mac/.test(waitRow), waitRow);
// it arrives whole: the journal now says its real size
const size = (await window.hub.fs.stat(F('chats/sync72-arriving.json'))).size;
await window.hub.fs.write(`${CLOUD}/Hearth/.sync/journal/${MAC.id}.jsonl`, `${JSON.stringify({ t: Date.now() - 10, op: 'put', rel: 'chats/sync72-arriving.json', h: 'x', s: 99999 })}\n${JSON.stringify({ t: Date.now(), op: 'put', rel: 'chats/sync72-arriving.json', s: size })}\n`);
await click(btn(/^Sync now$/));
await until(() => Sync.status().state === 'synced', 8000);
step('once it is whole it arrives, "✓ Synced" again', Sync.status().state === 'synced' && /✓ Synced/.test(chip()) && Boolean(await window.hub.getChat('sync72-arriving')), chip());

// 4. a chat renamed on both computers: "⚠ 1 conflict — choose", both versions side by side, Keep Mac
const here = await window.hub.getChat('sync72-chat');
await window.hub.saveChat({ ...here, title: 'Intro video (PC cut)' });
const cloudChat = JSON.parse(await window.hub.fs.read(F('chats/sync72-chat.json')));
await window.hub.fs.write(F('chats/sync72-chat.json'), JSON.stringify({ ...cloudChat, title: 'Intro video (Mac cut)', messages: [...cloudChat.messages, { role: 'user', at: 3, text: 'tightened the logo reveal on the Mac' }] }));
await settle();
await click(btn(/^Sync now$/));
await until(() => Sync.status().state === 'conflict', 8000);
await until(() => panel()?.querySelector('.sp-conflict'), 6000);
step('a conflict: "⚠ 1 conflict" in the rail, "1 conflict — choose" on the panel', /^⚠ 1 conflict$/.test(chip()) && /1 conflict — choose/.test(panel().querySelector('h2')?.textContent || ''), { chip: chip(), h2: panel()?.querySelector('h2')?.textContent });
const card = panel().querySelector('.sp-conflict');
const sides = [...card.querySelectorAll('.sp-side')];
step('both versions side by side: This PC on the left, Mac on the right, each with when', sides.length === 2 && /^This PC/.test(sides[0].textContent) && /^Mac/.test(sides[1].textContent) && sides.every((s) => /edited/.test(s.textContent)), sides.map((s) => s.textContent.slice(0, 60)));
step('each side shows what it has: its own title', /PC cut/.test(sides[0].textContent) && /Mac cut/.test(sides[1].textContent), sides.map((s) => s.textContent.slice(0, 120)));
const keeps = [...card.querySelectorAll('.sp-keep')].map((b) => b.textContent);
step('three plain choices: Keep PC, Keep Mac, Keep both', JSON.stringify(keeps) === JSON.stringify(['Keep PC', 'Keep Mac', 'Keep both']), keeps);
await smoke({ shot: '/tmp/sync72-panel-conflict.png' });
await click(btn(/^Keep Mac$/, card));
await until(() => !panel()?.querySelector(`.sp-conflict[data-id="${card.dataset.id}"]`), 8000);
const kept = await window.hub.getChat('sync72-chat');
step('Keep Mac: the Mac\'s version is the chat now, the conflict is gone from the panel', /Mac cut/.test(kept?.title || '') && (kept.messages || []).some((m) => /logo reveal/.test(m.text)), kept?.title);
step('a calm note says where the other version waits', recentToasts().some((t) => /Keep Mac: done/.test(t.message) && /Deleted files/.test(t.message)), recentToasts().slice(-2).map((t) => t.message));
await click(btn(/^Sync now$/));
await until(() => Sync.status().state === 'synced', 8000);
step('settled: "✓ Synced" again', /✓ Synced/.test(chip()));

// 5. a stored item changed two ways: Keep both keeps both, the other one named "(from Mac)"
await window.hub.kvSet('sync72-items', [{ id: 'i1', name: 'Neon (here)' }, { id: 'i2', name: 'Grain' }]);
const cloudItems = JSON.parse(await window.hub.fs.read(F('kv/sync72-items.json')));
cloudItems[0].name = 'Neon (Mac)';
await window.hub.fs.write(F('kv/sync72-items.json'), JSON.stringify(cloudItems));
await settle();
await click(btn(/^Sync now$/));
await until(() => panel()?.querySelector('.sp-conflict'), 8000);
const card2 = panel().querySelector('.sp-conflict');
step('a data conflict lists the item by its name on both sides', /Neon \(here\)/.test(card2?.textContent || '') && /Neon \(Mac\)/.test(card2?.textContent || ''), card2?.textContent?.slice(0, 160));
await click(btn(/^Keep both$/, card2));
await until(() => !panel()?.querySelector('.sp-conflict'), 8000);
const items = await window.hub.kvGet('sync72-items', []);
step('Keep both: both versions of the item stay, the other one named "(from Mac)"', items.length === 3 && items.some((x) => x.name === 'Neon (here)') && items.some((x) => /^Neon \(Mac\) \(from Mac\)$/.test(x.name)), items.map((x) => x.name));

// 6. a real problem: a file in the cloud copy where this computer has a folder of that name
const dataDir = (await window.hub.attachmentsDir()).replace(/[\\/]attachments$/, '');
await window.hub.fs.write(`${dataDir}/sync72clash/a.md`, 'a note in a folder');
await window.hub.fs.write(F('sync72clash'), 'a file where the folder is');
await settle();
await click(btn(/^Sync now$/));
await until(() => panel()?.querySelector('.sp-warn'), 8000);
const warn = panel()?.querySelector('.sp-warn');
step('"Last problem" in plain words, what it was about, Details for the raw reason', /Last problem \((just now|\d+ min ago)\)/.test(warn?.textContent || '') && /sync72clash/.test(warn?.textContent || '') && /sync72clash/.test(warn?.querySelector('details')?.textContent || ''), warn?.textContent?.slice(0, 220));
await smoke({ shot: '/tmp/sync72-panel-problem.png' });

// 7. closing: Escape, a click elsewhere; the right-click menu is still there
await J.key('Escape');
await until(() => !panel(), 2000);
step('Escape closes the panel', !panel());
await click('#sync-dot');
await until(() => panel(), 4000);
await click('main', { at: [0.6, 0.5] });
await until(() => !panel(), 2000);
step('a click elsewhere closes it', !panel());
await click('#sync-dot', { right: true });
await wait(250);
step('right-click still opens the sync menu', /Sync now/.test(document.getElementById('menu')?.textContent || '') && /Pause sync/.test(document.getElementById('menu')?.textContent || ''));
hideMenu();
// the panel's buttons all have names (the a11y audit counts unnamed buttons)
await click('#sync-dot');
await until(() => panel(), 4000);
const unnamed = [...panel().querySelectorAll('button')].filter((b) => !(b.textContent.trim() || b.getAttribute('aria-label')));
step('every button in the panel has a name', !unnamed.length, unnamed.length);
SyncPanel.close();
await api.off();
// (round 88) every click above reached what it aimed at (J.click notes what covered it otherwise)
step('nothing covered the panel or the indicator while they were used', !(J.out.misses || []).length, J.out.misses);
return J.done();
