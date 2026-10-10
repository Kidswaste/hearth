// Apps (round 14): the app-windows framework, driven like a user against fake pages (dev/fake-meshy.js): the one
// "Apps" entry (rail ⋯, Ctrl+K, /apps, the Lab's Tools drawer), an app in its own window and session, the page's
// title back in Hearth, a download landing in Downloads/Hearth/<App> and offered to the right place (a Suno song →
// the Lab's song), the window's "send to chat" (address + picture in the composer), Suno's prompt helper typed into
// its boxes (and the simple page's one box), Coolors' palette into the Lab, Poly Haven's free sky as a Lab layer,
// the agents' apps_open tool, hiding (kept) then parking (destroyed after a few hidden seconds here), no duplicate
// commands, keys listed.
//   node dev/smoke.js --fake-meshy --check-timeout 300000 --script dev/checks/apps-windows.js --shot /tmp/apps-windows.png
const SHOTS = window.APPS_SHOTS || '/tmp/hearth-checks/apps-windows';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return false; };
const out = {}; const fail = [];
const ok = (cond, what) => { if (!cond) fail.push(what); return Boolean(cond); };
const shot = async (name) => { try { await smoke({ shot: `${SHOTS}-${name}.png` }); } catch { /* optional */ } };
const C = H.claudeAgent();
const say = async (line, agentId = C.id) => { let text = ''; await Commands.tryRun(line, agentId, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const win = async (id) => (await hub.apps.windows()).find((w) => w.id === id);
try {
  const st = await hub.apps.status();
  const B = st.testBase;
  ok(B, 'the fake server is up (--fake-meshy)');

  // ---- 0. the registry and the one entry ----
  ok(['meshy', 'suno', 'figma', 'spline', 'sketchfab', 'polyhaven', 'coolors', 'fonts', 'unsplash', 'runway', 'elevenlabs', 'youtube', 'instagram', 'tiktok', 'pinterest', 'mixamo'].every((id) => Apps.get(id)), `the apps are registered (${Apps.list().map((a) => a.id).join(' ')})`);
  ok(!(Commands.duplicates?.() || []).length, `no duplicate commands (${JSON.stringify(Commands.duplicates?.() || []).slice(0, 200)})`);
  ok(['apps', 'apps-tools', 'meshy', 'suno', 'polyhaven'].every((n) => Commands.get(n)), 'the commands exist');
  ok(Commands.get('hdri')?.name === 'polyhaven', '/hdri is /polyhaven');
  ok(typeof Simplify === 'undefined' || Simplify.TUCKED.some(([id]) => id === 'apps-btn'), 'Apps is in the rail\'s ⋯');
  ok(document.getElementById('apps-btn')?.hidden === true, 'no new rail button on screen');
  const list = await say('/apps list');
  ok(/\*\*3D\*\*/.test(list) && /Meshy/.test(list) && /Poly Haven/.test(list), `/apps list (${list.slice(0, 80)})`);
  ok(Keys.all().some((k) => k.area === 'App windows'), 'the app windows\' keys are listed');
  // the menu itself (the rail's ⋯ → Apps clicks the hidden button)
  document.getElementById('apps-btn').click();
  await wait(250);
  const menuText = document.getElementById('menu')?.textContent || '';
  ok(/3D/.test(menuText) && /Sound/.test(menuText) && /Downloads from apps/.test(menuText), `the Apps menu (${menuText.slice(0, 120)})`);
  await shot('menu');
  hideMenu?.();

  // ---- 1. a page in its own window ----
  Apps.register({ id: 'testpage', name: 'Test page', icon: 'T', url: `${B}/web/plain`, desc: 'a fake page', group: 'More' });
  ok(Apps.get('testpage') && Apps.find('test page')?.id === 'testpage', 'register + find');
  await say('/apps testpage');
  ok(await until(async () => (await win('testpage'))?.visible), 'the window opened');
  ok(await until(async () => (await win('testpage'))?.title === 'Plain page', 10000), `its page title comes back (${(await win('testpage'))?.title})`);
  // a second open reuses it
  await Apps.open('testpage');
  ok((await hub.apps.windows()).filter((w) => w.id === 'testpage').length === 1, 'one window per app');
  // the agents' tool
  const listT = await HubBridge.call('apps_open', {});
  ok(listT.ok && /meshy: Meshy/.test(listT.value) && /testpage/.test(listT.value), 'apps_open lists the apps');
  const bad = await HubBridge.call('apps_open', { app: 'nope' });
  ok(!bad.ok && /No app/.test(bad.error), 'an unknown app is a clear error');

  // ---- 2. send to chat: address + a picture in the composer ----
  activate(C.id); await wait(200);
  await hub.apps.nav('testpage', 'to-chat');
  const draft = await until(() => { const ta = document.querySelector('.surface.active .composer textarea'); return ta && /From Test page/.test(ta.value) ? ta.value : null; }, 12000);
  ok(draft && draft.includes(`${B}/web/plain`), `the page's address is in the composer (${String(draft).slice(0, 100)})`);
  ok(await until(() => document.querySelector('.surface.active .composer')?.textContent.match(/testpage-page|\.jpg/) || document.querySelectorAll('.surface.active .composer .attach, .surface.active .composer .chip, .surface.active .attachments > *').length, 6000), 'a picture of the page is attached');
  Native.setDraft(C.id, '');

  // ---- 3. Suno: a download → the Lab's song; the prompt typed into its boxes ----
  Apps.register({ ...Apps.get('suno'), url: `${B}/web/suno` });
  await say('/suno');
  ok(await until(async () => (await win('suno'))?.title === 'Create · Fake Suno', 10000), 'Suno (the fake page) opened in its window');
  await hub.apps.nav('suno', 'download', `${B}/web/files/fake-suno-song.wav`);
  const dl = await until(() => Apps.downloads().find((d) => d.app === 'suno' && d.state === 'completed'), 15000);
  ok(dl && /apps-downloads[\\/]Suno[\\/]fake-suno-song\.wav$/.test(dl.path), `the download lands in Downloads/Hearth/Suno (${dl?.path})`);
  ok(dl && (await hub.fs.stat(dl.path))?.size > 1000, 'the file is there');
  const tst = [...document.querySelectorAll('#toasts .toast')].find((t) => /fake-suno-song/.test(t.textContent));
  ok(tst && /Use as the Lab/.test(tst.textContent), `the toast offers the Lab's song first (${tst?.textContent})`);
  const used = await say('/suno use');
  ok(/Using fake-suno-song\.wav as the Lab's song/.test(used), `/suno use (${used})`);
  ok(await until(() => ThreeLab.peek()?.media?.()?.path?.includes?.('fake-suno-song') || document.querySelector('.surface.active .media-bar, .surface.active .three-media')?.textContent.includes('fake-suno-song'), 8000) || /Lab/.test(used), 'the song is in the Lab');
  const pr = await say('/suno prompt neon night drive', C.id);
  const last = AppsSuno.last();
  ok(last && /neon|synthwave/.test(last.style) && /\[Intro\]/.test(last.lyrics), `/suno prompt writes style + structure (${last?.style})`);
  out.sunoPrompt = last?.style;
  const pasted = await AppsSuno.paste(last);
  ok(/Pasted into Suno: style, lyrics, title/.test(pasted), `typed into the three boxes (${pasted})`);
  const back = await hub.apps.paste('suno', { text: 'x', field: 'nothing-like-this', strict: true });
  ok(back && back.ok, 'a field it can\'t name falls back to a box');
  // the simple page: one description box
  Apps.register({ id: 'simplesuno', name: 'Simple', url: `${B}/web/simple` });
  await Apps.open('simplesuno');
  await until(async () => (await win('simplesuno'))?.title === 'Simple', 8000);
  const strict = await hub.apps.paste('simplesuno', { text: 'abc', field: 'style', strict: true });
  ok(strict && !strict.ok, 'strict: no style box on the simple page');
  const loose = await hub.apps.paste('simplesuno', { text: 'dreamy', field: 'prompt' });
  ok(loose?.ok && /description/.test(loose.box), `the description box takes it (${loose?.box})`);
  const toolPaste = await HubBridge.call('apps_open', { app: 'suno', paste: 'lofi, tape', field: 'style' });
  ok(toolPaste.ok && /owner presses/.test(toolPaste.value), 'an agent can type a prompt into Suno (the owner presses Create)');
  await hub.apps.close('simplesuno', { destroy: true });

  // ---- 4. Coolors: the palette in the address → the Lab ----
  Apps.register({ ...Apps.get('coolors'), url: `${B}/web/coolors/264653-2a9d8f-e9c46a-f4a261` });
  await say('/apps coolors');
  await until(async () => /coolors/.test((await win('coolors'))?.url || ''), 8000);
  const pal = await say('/apps coolors palette');
  ok(/#264653 #2a9d8f #e9c46a #f4a261/.test(pal), `/apps coolors palette (${pal})`);
  ok(JSON.stringify(ThreeLab.director?.refs?.palette?.() || []) === JSON.stringify(['#264653', '#2a9d8f', '#e9c46a', '#f4a261']), 'the Lab\'s palette changed');

  // ---- 5. Poly Haven: a free sky as a Lab layer ----
  const before = ThreeLab.director.layers().layers.length;
  await say('/polyhaven sunset');
  const card = await until(() => [...document.querySelectorAll('dialog.apps-grid .apps-card')].find((c) => /Fake Sunset/.test(c.textContent)), 10000);
  ok(card, 'the sky picker shows the fake sunset');
  await shot('polyhaven');
  [...(card?.querySelectorAll('button') || [])].find((b) => /Sky in the Lab/.test(b.textContent))?.click();
  ok(await until(() => ThreeLab.director.layers().layers.length > before && JSON.stringify(ThreeLab.director.layers()).includes('🌅 Fake Sunset'), 15000), `the sky is a Lab layer (${JSON.stringify(ThreeLab.director.layers().layers).slice(0, 160)})`);
  ok(Apps.downloads().some((d) => d.app === 'polyhaven' && /sunset_fake_1k\.hdr$/.test(d.name)), 'its file is in the downloads list');

  // ---- 6. downloads dialog, routes ----
  await say('/apps downloads');
  ok(await until(() => document.querySelectorAll('dialog.apps-grid .apps-card').length >= 2, 4000), 'the downloads picker lists them');
  await shot('downloads');
  document.querySelector('dialog.apps-grid')?.close();
  let routeErr = '';
  try { await Apps.route('/nope.txt', 'teleport'); } catch (err) { routeErr = err.message; }
  ok(/Unknown place/.test(routeErr), 'an unknown route is a clear error');

  // ---- 7. hide (kept), then parked ----
  await hub.apps.close('testpage');
  const hid = await win('testpage');
  ok(hid && !hid.visible, 'closing only hides it');
  ok(await until(async () => !(await win('testpage')), 12000), 'a hidden window is parked (destroyed) after a while');
  await Apps.open('testpage');
  ok(await until(async () => (await win('testpage'))?.visible, 8000), 'it opens again');
  const closed = await say('/apps close all');
  ok(/Closed every app window/.test(closed) && !(await hub.apps.windows()).length, '/apps close all');
  activate(C.id);
} catch (err) { fail.push(`threw: ${err.message} ${err.stack?.split('\n')[1] || ''}`); }
out.ok = !fail.length;
out.problems = fail;
return JSON.stringify(out, null, 1);
