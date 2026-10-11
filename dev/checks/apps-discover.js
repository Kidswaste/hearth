// Apps (round 14, "pack other AI in Apps, make me discover things"): the curated AI apps in the one picker (kinds,
// search, favorites first), Discover matched to where you are (the Lab → 3D / video AI, the board → image AI, the
// editor → video editing AI, a chat → research / site builders) with a why, what you open or dismiss stops being
// suggested, the once-a-day "Try this" note (and /apps discover off), a chat suggesting an app (card + apps_open
// suggest), "send to app" (a board picture / a Lab still on the clipboard + the app's window with a hint), and the
// adobe stream's Firefly replacing the stand-in.
//   node dev/smoke.js --fake-meshy --check-timeout 300000 --script dev/checks/apps-discover.js --shot /tmp/apps-discover.png
const SHOTS = window.APPS_SHOTS || '/tmp/hearth-checks/apps-discover';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const shot = async (name) => { try { await smoke({ shot: `${SHOTS}-${name}.png` }); } catch { /* optional */ } };
const C = H.claudeAgent();
const say = async (line, agentId = C.id) => { let text = ''; await Commands.tryRun(line, agentId, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const D = AppsDiscover;
try {
  const B = (await hub.apps.status()).testBase;
  await D.load();
  // ---- 0. the catalog ----
  const ids = ['midjourney', 'pika', 'luma', 'kling', 'ideogram', 'krea', 'leonardo', 'firefly', 'recraft', 'tripo', 'genie', 'csm', 'udio', 'stableaudio', 'chatgpt', 'gemini', 'perplexity', 'notebooklm', 'claudeai', 'grok', 'v0', 'bolt', 'lovable', 'replit', 'framer', 'descript', 'capcut', 'captions'];
  ok(ids.every((id) => Apps.get(id)?.url && Apps.get(id).desc && Apps.get(id).price), `the AI apps (missing: ${ids.filter((id) => !Apps.get(id)).join(' ')})`);
  out.count = Apps.list().length;
  ok(out.count >= 44, `${out.count} apps`);
  ok(!(Commands.duplicates?.() || []).length, 'no duplicate commands');
  ok(Apps.get('meshy').fits && Apps.get('suno').price, 'the first apps know what they fit');
  const m = Apps.menuItems().map((x) => (typeof x === 'string' ? x : x.label)).join(' | ');
  ok(/✨ Discover/.test(m) && /🔎 Search every app/.test(m) && /Chat/.test(m) && /Code/.test(m) && /Edit/.test(m), `the menu: discover, search, kinds (${m.slice(0, 200)})`);
  // the adobe stream's Firefly replaces the stand-in; a stand-in never replaces it back
  Apps.register({ id: 'firefly', name: 'Firefly (Adobe stream)', icon: 'F', url: 'https://firefly.adobe.com', group: 'Make' });
  Apps.register({ id: 'firefly', name: 'stand-in', url: 'https://x', fallback: true });
  ok(Apps.get('firefly').name === 'Firefly (Adobe stream)', 'Firefly: the adobe stream\'s own wins');

  // ---- 1. Discover follows where you are ----
  activate('tool:three'); await wait(400);
  const lab = D.suggest(3);
  ok(lab.length === 3 && lab.every((s) => s.app.fits.includes('lab') || s.app.fits.includes('song')), `the Lab → 3D / video / music AI (${lab.map((s) => s.app.id)})`);
  ok(lab.every((s) => /^(You're in the Lab|A song is in the Lab): /.test(s.why)), `with a why (${lab[0]?.why})`);
  activate('tool:board'); await wait(300);
  const board = D.suggest(3);
  ok(board.every((s) => s.app.fits.includes('board')), `the board → picture AI (${board.map((s) => s.app.id)})`);
  activate(C.id); await wait(300);
  const chat = D.suggest(3);
  ok(chat.every((s) => s.app.fits.includes('chat')), `a chat → research / sites (${chat.map((s) => s.app.id)})`);
  // what you open stops being suggested; two "not for me" and it's gone
  const first = chat[0].app.id;
  await D.noteOpen(first);
  ok(!D.suggest(20).some((s) => s.app.id === first), 'an app you opened is not suggested again');
  const second = D.suggest(1)[0].app.id;
  await D.dismiss(second); ok(D.suggest(20).some((s) => s.app.id === second), 'one "not for me" keeps it');
  await D.dismiss(second); ok(!D.suggest(20).some((s) => s.app.id === second), 'two and it\'s gone');
  ok((await hub.kvGet('apps-habits', {})) && (await until(async () => (await hub.kvGet('apps-habits', {})).opened?.[first], 3000)), 'habits are kept (kv apps-habits)');
  // /apps discover: the picker; text for agents
  await say('/apps discover');
  ok(await until(() => document.querySelectorAll('dialog.apps-grid .apps-card').length >= 3, 4000), 'the Discover picker');
  await shot('discover');
  document.querySelector('dialog.apps-grid')?.close();
  const dt = await HubBridge.call('apps_open', { op: 'discover' });
  ok(dt.ok && /`\/apps \w+`/.test(dt.value), 'agents read the suggestions');

  // ---- 2. the "Try this" note: at most once a day, can be switched off ----
  ok(/No more "Try this"/.test(await say('/apps discover off')) && D.isOff(), '/apps discover off');
  ok(!(await D.maybeChip({ force: true })), 'off: no note');
  await say('/apps discover on');
  const chip = await D.maybeChip({ force: true });
  ok(chip && await until(() => document.querySelector('#toasts .toast.apps-try')?.textContent.includes(`Try ${chip.app.name}`), 3000), 'a "Try this" note');
  await shot('try');
  ok(!(await D.maybeChip()), 'not twice the same day');
  document.querySelector('#toasts .toast.apps-try .toast-x')?.click();

  // ---- 3. favorites and search ----
  ok(/★ Tripo comes first/.test(await say('/apps fav tripo')), '/apps fav');
  ok(Apps.menuItems().some((x) => x.label === '★ 🔺 Tripo'), 'a favorite is first in the menu');
  await say('/apps search video');
  ok(await until(() => { const cards = [...document.querySelectorAll('dialog.apps-grid .apps-card')].filter((c) => c.style.display !== 'none'); return cards.length && cards.some((c) => /Pika/.test(c.textContent)) && !cards.some((c) => /Coolors/.test(c.textContent)); }, 4000), 'search filters every app');
  await shot('search');
  document.querySelector('dialog.apps-grid')?.close();

  // ---- 4. a chat suggests an app ----
  await say('/apps suggest kling for the fight shot');
  ok(await until(() => [...document.querySelectorAll('.surface.active .msg.note')].some((n) => /Kling/.test(n.textContent) && /fight shot/.test(n.textContent) && [...n.querySelectorAll('button')].some((b) => /Open Kling/.test(b.textContent))), 3000), 'a card with Open Kling');
  const sg = await HubBridge.call('apps_open', { app: 'udio', suggest: true, why: 'a vocal take of the song' });
  ok(sg.ok && await until(() => [...document.querySelectorAll('.msg.note')].some((n) => /Udio/.test(n.textContent)), 3000), 'apps_open suggest: a card');

  // ---- 5. send to app ----
  Apps.register({ id: 'aitest', name: 'AI test', icon: 'A', url: `${B}/web/plain`, takes: ['image'], group: 'Make', desc: 'a fake AI page' });
  const pic = await hub.apps.fetchTo({ url: `${B}/web/files/send-pic.png`, appId: 'test', appName: 'Test' });
  await Board.ready(); await Board.addFiles([pic.path]);
  const s1 = await say('/apps send-to aitest board');
  ok(/on the clipboard/.test(s1) && /paste/.test(s1), `a board picture → the clipboard + a hint (${s1})`);
  ok(await until(async () => (await hub.apps.windows()).some((w) => w.id === 'aitest' && w.visible), 6000), 'the app\'s window opened');
  activate('tool:three'); await ThreeLab.cmd(); await wait(800);
  const s2 = await HubBridge.call('apps_open', { app: 'aitest', send: 'lab' });
  ok(s2.ok && /a still of the Lab/.test(s2.value), `a Lab still (${s2.value || s2.error})`);
  ok(D.sendable().some((a) => a.id === 'midjourney') && D.sendable().length > 20, 'many apps take a picture');
  await hub.apps.closeAll();
  activate(C.id);
} catch (err) { fail.push(`threw: ${err.message} ${err.stack?.split('\n')[1] || ''}`); }
out.ok = !fail.length;
out.problems = fail;
return JSON.stringify(out, null, 1);
