// (round 71, quickidea71) 💡 Quick idea in the real app, on a throwaway profile, offline, no AI: the tray menu's
// "💡 Quick idea…" (clicked through the real tray menu) opens the small always-on-top window while the main window stays
// hidden; its four big buttons (🎵 Music, ✦ Quest, 📁 Project, 💬 Later), Enter → the place used last, 🎙 Hold to record
// with a FAKE microphone (getUserMedia stubbed in that window with a tone: asked only on press, closed on release, a WAV
// kept on disk), a ✦ Quest idea in Sidequest's saved ideas and a 📁 Project idea in its notes, put there quietly by the
// main window; the 💡 Ideas inbox from the rail's ⋯ (Move to… / Delete → Trash / Restore), the ✦ tracker's row and ⋯
// More item, the Sound desk Sessions' 💡 Ideas for music, Settings › Advanced › Keys, the key that clashes with the
// show / hide key staying off. The quickidea code is not on the first screen.
//   node dev/smoke.js --check-timeout 180000 --script dev/checks/quickidea71.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 150) => { for (let i = 0; i < n; i++) { let v; try { v = await fn(); } catch { v = null; } if (v) return v; await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const errors = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info.slice(0, 300) : JSON.stringify(info).slice(0, 300)}`}`); if (!ok) errors.push(name); console.log(out.steps.at(-1)); };
const T = async (what, extra = {}) => { const r = await window.hub.quickIdea.op({ op: 'test', what, ...extra }); if (!r?.ok) throw Error(r?.error || 'test op failed'); return r.value; };
const Q = (js) => T('eval', { js: `(async () => { ${js} })()` }); // inside the small window
const qstate = () => Q('return window.__quickIdea.state();');
const list = async () => (await window.hub.quickIdea.op({ op: 'list' })).value;
const kv = async (k) => (await window.hub.kvGet(k, null, { status: true }))?.value || null;
const shot = (n) => smoke({ shot: `${window.SMOKE_TMP || window.SMOKE_SAVES}/quickidea71-${n}.png` });
const qshot = (n) => T('shot', { file: `${window.SMOKE_TMP || window.SMOKE_SAVES}/quickidea71-${n}.png` });
const menuItem = (re) => [...document.querySelectorAll('#menu button, #menu [role="menuitem"], #menu .menu-item, #menu-fly button, #menu-fly2 button')].find((b) => re.test(b.textContent) && b.getClientRects().length && !b.closest('[hidden]')); // only a menu on screen (an old one's buttons stay in the DOM)
let asks = 0; const realAsk = window.hub.askOnce; window.hub.askOnce = (...a) => { asks++; return realAsk?.(...a); };
const openQuick = async () => { await T('tray'); await until(async () => (await T('state')).visible, 'the quick window shows'); await until(async () => (await Q('return Boolean(window.__quickIdea)')), 'its page'); await wait(250); };
const saved = async (re) => until(async () => { const s = await qstate(); return s.kind === 'ok' && re.test(s.status) ? s : null; }, `saved ${re}`);
const hidden = async () => until(async () => !(await T('state')).visible, 'the quick window hides after saving', 120);
// the fake microphone in the small window: a tone through Web Audio; counts asks and remembers its tracks
const FAKE_MIC = `if (!window.__mic) { window.__mic = { asks: 0, tracks: [] }; navigator.mediaDevices.getUserMedia = async () => { window.__mic.asks++; const ac = new AudioContext(); await ac.resume().catch(() => {}); const o = ac.createOscillator(); o.frequency.value = 440; const d = ac.createMediaStreamDestination(); o.connect(d); o.start(); const s = d.stream; window.__mic.tracks.push(...s.getTracks()); return s; }; } return true;`;

try {
  step('the quick idea code is not on the first screen', typeof QuickIdeas === 'undefined' && typeof QuickIdeaCore === 'undefined' && !Lazy.isIn('quickidea'));
  // a project to send ideas to (Projects' own store, on disk before the small window lists it)
  await Lazy.load('projects'); await Projects.ready();
  const clink = Projects.create({ name: 'Clink', notes: 'My three.js game.' }); await Projects.flush();
  // ---------- the tray item; the main window stays hidden ----------
  await T('hide-main'); await wait(300);
  const st0 = await T('state');
  step('the tray menu has "💡 Quick idea…" right under Show Hearth', st0.tray[1] === '💡 Quick idea…', st0.tray);
  step('its key is set (Ctrl+Alt+I by default)', st0.key?.key === 'Control+Alt+I', st0.key);
  await openQuick();
  const st1 = await T('state');
  step('the tray item opens the small window, always on top', st1.open && st1.visible && st1.onTop, st1);
  step('the main window did not come forward', !st1.mainVisible, st1);
  let s = await qstate();
  step('four big "where it goes" buttons with their places', s.dests.length === 4 && /🎵 Music.*Sound desk › Sessions/.test(s.dests[0].text) && /✦ Quest.*Sidequest › Saved ideas/.test(s.dests[1].text) && /📁 Project.*Pick a recent project/.test(s.dests[2].text) && /💬 Later.*💡 Ideas/.test(s.dests[3].text), s.dests.map((d) => d.text));
  step('Enter goes to 💬 Later the first time (↵ on its button)', s.last.dest === 'later' && s.dests[3].last, s.last);
  await qshot('window');
  // ---------- Enter: Later ----------
  await Q(`const t = document.getElementById('text'); t.value = 'call Petit Bain about the open mic'; t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true;`);
  s = await saved(/Later/); await hidden();
  let L = await list();
  step('Enter saved it to Later and the window went away', L.ideas[0]?.text === 'call Petit Bain about the open mic' && L.ideas[0].to.dest === 'later', L.ideas[0]);
  // ---------- ✦ Quest: Sidequest's saved ideas, put there by the hidden main window ----------
  await openQuick();
  await Q(`document.getElementById('text').value = 'sunrise walk to Buttes-Chaumont\\nbring the field recorder'; document.querySelector('.dest[data-dest="quest"]').click(); return true;`);
  await saved(/Quest/); await hidden();
  const qj = await until(async () => { const j = await kv('quest-journal'); return j?.ideas?.find((i) => i.title === 'sunrise walk to Buttes-Chaumont') ? j : null; }, 'the idea in Sidequest\'s saved ideas');
  const qIdea = qj.ideas.find((i) => i.title === 'sunrise walk to Buttes-Chaumont');
  step('✦ Quest → a saved idea in Sidequest (Life › Find a quest › Saved ideas)', qIdea && qIdea.goal === 'bring the field recorder' && !qIdea.questId, qIdea);
  await Lazy.load('questcore'); let ok = true; try { QuestCore.validate(qj); } catch (err) { ok = String(err.message); }
  step('the journal still validates', ok === true, ok);
  L = await list(); step('the inbox knows where it went', L.ideas[0].placed?.dest === 'quest' && L.ideas[0].placed.questIdea === qIdea.id, L.ideas[0].placed);
  step('the main window stayed hidden while it did', !(await T('state')).mainVisible);
  // ---------- 🎙 Hold to record (fake mic) → 🎵 Music ----------
  await openQuick();
  await Q(FAKE_MIC);
  step('opening the window doesn\'t touch the microphone', (await Q('return window.__mic.asks')) === 0);
  await Q(`document.getElementById('rec').dispatchEvent(new PointerEvent('pointerdown', { button: 0, pointerId: 7, bubbles: true })); return true;`);
  await until(async () => (await Q('return window.__mic.asks')) === 1 && (await qstate()).recording, 'recording');
  await wait(1300);
  const during = await Q(`return { live: window.__mic.tracks.filter((t) => t.readyState === 'live').length, label: document.getElementById('rec').textContent }`);
  await Q(`document.getElementById('rec').dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerId: 7, bubbles: true })); return true;`);
  s = await until(async () => { const x = await qstate(); return x.memo ? x : null; }, 'the memo');
  const after = await Q(`return { live: window.__mic.tracks.filter((t) => t.readyState === 'live').length, memo: document.getElementById('memo-t').textContent }`);
  step('🎙 held: the mic opens once, "Recording…" shows', during.live === 1 && /Recording/.test(during.label), during);
  step('let go: the mic closes and a voice memo is ready (WAV)', after.live === 0 && s.memo.seconds >= 0.8 && s.memo.bytes > 44 + 0.8 * 2 * 8000 && /Voice memo · 0:01/.test(after.memo), { after, memo: s.memo });
  await qshot('memo');
  await Q(`document.getElementById('text').value = 'bass line for the boss fight'; document.querySelector('.dest[data-dest="music"]').click(); return true;`);
  await saved(/Music/); await hidden();
  L = await list(); const mIdea = L.ideas[0];
  step('🎵 Music: saved with its voice memo in Hearth\'s data folder', mIdea.to.dest === 'music' && mIdea.memo && /[\\/]quick-ideas[\\/]Idea .+\.wav$/.test(mIdea.memo.file) && C_ok(mIdea), mIdea);
  let head = ''; try { const b = new Uint8Array(await (await fetch(WinMac.fileUrl(mIdea.memo.file))).arrayBuffer()); head = String.fromCharCode(...b.slice(0, 4)) + String.fromCharCode(...b.slice(8, 12)) + ':' + b.length; } catch (err) { head = `fetch: ${err.message}`; }
  step('the memo on disk is a WAV', /^RIFFWAVE:\d+/.test(head), head);
  // ---------- 📁 Project → its notes; then Enter = the same project ----------
  await openQuick();
  step('the mic was not asked again by opening', (await Q('return window.__mic.asks')) === 1);
  await Q(`document.getElementById('text').value = 'boss intro with the drums'; document.querySelector('.dest[data-dest="project"]').click(); return true;`);
  s = await qstate(); const pick = await Q(`return [...document.querySelectorAll('#plist button')].map((b) => b.textContent)`);
  step('📁 Project shows the recent projects to pick', s.picker && pick.includes('📁 Clink'), pick);
  await qshot('projects');
  await Q(`[...document.querySelectorAll('#plist button')].find((b) => b.textContent === '📁 Clink').click(); return true;`);
  await saved(/Clink/); await hidden();
  await until(() => /💡 boss intro with the drums · \d+ \w+$/m.test(Projects.get(clink.id)?.notes || ''), 'the line in Clink\'s notes');
  step('the idea is a line in Clink\'s notes (under what was there)', Projects.get(clink.id).notes.startsWith('My three.js game.\n💡 boss intro'), Projects.get(clink.id).notes);
  await openQuick();
  s = await qstate(); step('now Enter goes to 📁 Clink', s.last.dest === 'project' && s.last.projectId === clink.id && s.dests[2].last, s.last);
  await Q(`const t = document.getElementById('text'); t.value = 'a second level in the rain'; t.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true;`);
  await saved(/Clink/); await hidden();
  await until(() => /💡 a second level in the rain/.test(Projects.get(clink.id)?.notes || ''), 'the second line');
  step('Enter added it to the same project', true);
  // ---------- the 💡 Ideas inbox from the rail's ⋯ ----------
  await T('show-main'); await wait(300);
  document.getElementById('rail-more')?.click(); await wait(200);
  const ideasRow = menuItem(/^(💡 )?Ideas\b/); // (round 74) the rail ⋯ draws its icon now
  step('the rail\'s ⋯ has 💡 Ideas', Boolean(ideasRow));
  ideasRow?.click();
  const dlg = await until(() => document.querySelector('dialog.qi-inbox[open] .qi-row') && document.querySelector('dialog.qi-inbox[open]'), 'the inbox');
  const rows = () => [...dlg.querySelectorAll('.qi-body > .qi-list > .qi-row')];
  step('the inbox lists all five, newest first, each with where it went', rows().length === 5 && /📁 Clink/.test(rows()[0].textContent) && /🎵 Music/.test(rows()[2].textContent) && /💬 Later/.test(rows()[4].textContent), rows().map((r) => r.querySelector('.qi-where').textContent));
  step('a voice memo row has ▶', Boolean(rows()[2].querySelector('.qi-play')) && !rows()[4].querySelector('.qi-play'));
  await shot('inbox');
  // Move to… : Later → ✦ Quest
  const later = rows().find((r) => /Petit Bain/.test(r.textContent));
  later.querySelector('.qi-move').click();
  const qItem = await until(() => menuItem(/✦ Quest/), 'the Move to… menu'); qItem.click();
  await until(async () => (await kv('quest-journal'))?.ideas?.some((i) => /Petit Bain/.test(i.title)), 'moved into Sidequest');
  step('Move to… ✦ Quest puts it in Sidequest\'s saved ideas', true);
  // Move to… : the sunrise quest idea → 💬 Later takes it out of the journal
  await wait(200);
  const sunrise = rows().find((r) => /sunrise walk/.test(r.textContent));
  await until(() => !menuItem(/✦ Quest/), 'the first menu closed');
  sunrise.querySelector('.qi-move').click();
  (await until(() => menuItem(/💬 Later/), 'the menu')).click();
  await until(async () => !(await kv('quest-journal'))?.ideas?.some((i) => /sunrise walk/.test(i.title)), 'out of Sidequest');
  L = await list(); step('Move to… 💬 Later takes it back out of Sidequest', L.ideas.find((i) => /sunrise/.test(i.text))?.to.dest === 'later');
  // Delete → the Trash (and out of the project's notes) → Restore
  await wait(200);
  rows().find((r) => /boss intro/.test(r.textContent)).querySelector('.qi-del').click();
  await until(() => !/boss intro/.test(Projects.get(clink.id)?.notes || ''), 'the line out of the notes');
  await until(() => dlg.querySelector('.qi-trash summary')?.textContent.includes('1'), 'the Trash fold');
  step('Delete: out of the inbox, into its Trash, the notes line taken out', rows().length === 4 && /Trash · 1/.test(dlg.querySelector('.qi-trash summary').textContent) && /rain/.test(Projects.get(clink.id).notes));
  dlg.querySelector('.qi-trash').open = true; await wait(50);
  dlg.querySelector('.qi-trash .qi-restore').click();
  await until(() => /💡 boss intro/.test(Projects.get(clink.id)?.notes || '') && rows().length === 5, 'restored');
  step('Restore: back in the inbox and back in Clink\'s notes', true);
  await shot('inbox-after');
  dlg.close(); await wait(100);
  // ---------- the Sound desk's Sessions: 💡 Ideas for music ----------
  const panel = el('section', { class: 'bl-panel' }); document.body.append(panel);
  await QuickIdeas.sessionsSection(panel);
  const sec = panel.querySelector('.qi-sessions');
  step('Sessions shows 💡 Ideas for music with the memo\'s ▶', Boolean(sec) && sec.querySelectorAll('.qi-row').length === 1 && /bass line/.test(sec.textContent) && Boolean(sec.querySelector('.qi-play')), sec?.textContent.slice(0, 200));
  panel.remove();
  // ---------- the ✦ quest tracker: a row and its ⋯ More item ----------
  await Lazy.load('questhud'); await QuestHud.open();
  const row = await until(() => document.querySelector('.qh-panel [data-k="ideas"]'), 'the tracker row');
  step('the ✦ tracker says "💡 1 idea waiting · Ideas"', /💡 1 idea waiting · Ideas/.test(row.textContent), row.textContent);
  document.querySelector('.qh-panel [data-k="more"]').click(); await wait(200);
  step('its ⋯ More has 💡 Ideas…', Boolean(menuItem(/💡 Ideas…/)));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(100);
  row.click();
  await until(() => document.querySelector('dialog.qi-inbox[open]'), 'the inbox from the tracker');
  step('the tracker row opens the inbox', true);
  document.querySelector('dialog.qi-inbox[open]').close(); await wait(100);
  // ---------- Settings › Advanced › Keys; a key that clashes stays off ----------
  AppUI.openSettings(); await wait(400);
  const keyIn = [...document.querySelectorAll('dialog label')].find((l) => /Quick idea from anywhere/.test(l.textContent))?.querySelector('input');
  step('Settings › Advanced › Keys: 💡 Quick idea from anywhere = Control+Alt+I', keyIn?.value === 'Control+Alt+I', keyIn?.value);
  document.querySelector('dialog[open]')?.close(); await wait(100);
  H.config.settings = { ...H.config.settings, quickIdeaKey: 'Alt+Control+H' };
  const r1 = await saveConfig();
  const k1 = await T('state');
  step('the show / hide key itself: off, and said why', r1?.quickIdeaKeyOk === false && /show \/ hide/.test(r1.quickIdeaWhy) && k1.key.ok === false, { r1, key: k1.key });
  H.config.settings = { ...H.config.settings, quickIdeaKey: 'Control+Alt+I' }; const r2 = await saveConfig();
  step('back to Control+Alt+I', r2?.quickIdeaKey === 'Control+Alt+I', r2);
  // ---------- nothing else ----------
  step('no AI was asked', asks === 0, asks);
  step('the small window holds no microphone', (await Q('return window.__mic.tracks.filter((t) => t.readyState === "live").length')) === 0);
} catch (err) { step('run', false, String(err?.stack || err)); }
function C_ok(i) { return Boolean(i.placed && i.placed.dest === 'music'); }
out.pass = !errors.length; out.errors = errors;
return JSON.stringify(out, null, 1);
