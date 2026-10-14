// undoall (round 41): one "Undo last change" for the whole app, driven with real keys (CDP key events, like a keyboard):
// a Settings switch flipped → Ctrl+Z puts it back (the row follows) → Ctrl+Shift+Z redoes it; ⋯ AI setup's Mood board
// switch → Ctrl+Z (the sheet follows, the toast says "Undid: Turned … Mood board for Claude"); a chat deleted → Ctrl+Z
// restores it → redo deletes it again → undo; a chat renamed / moved to a folder → back; text boxes keep their own
// undo (typed text goes, the log doesn't move); the Lab keeps its own (a slider panel's Ctrl+Z, the Lab on screen);
// Activity › Recent changes lists them with ↶ / ↷; Find anything "undo"; /undo-change list; the log on disk; no
// duplicate commands; loaded after the first screen.
//   node dev/smoke.js --check-timeout 240000 --script dev/checks/undoall.js --shot /tmp/undoall.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(80); } return null; };
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
// a real key press (trusted, as from the keyboard): Ctrl = 2, Shift = 8
async function key(k, code, mods = 0, vk = 0) {
  for (const type of ['rawKeyDown', 'keyUp']) await Promise.race([smoke({ cdp: 'Input.dispatchKeyEvent', params: { type, key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers: mods } }), wait(3000)]);
  await wait(250);
}
const ctrlZ = () => key('z', 'KeyZ', 2, 90);
const ctrlShiftZ = () => key('Z', 'KeyZ', 10, 90);
const toastText = () => [...document.querySelectorAll('#toasts > *')].map((t) => t.textContent).join(' | ');
// like a click does: the folds it sits in are open (else it can't take the focus), then the focus on it
const focusOn = (n) => { for (let d = n.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true; if (!n.matches('button, input, select, textarea, [tabindex]')) n.setAttribute('tabindex', '-1'); n.focus(); };
const top = () => UndoAll.list().at(-1);

try {
  step('loaded after the first screen (its own lazy group)', Lazy.state().some((g) => g.name === 'undoall'), Lazy.state().find((g) => g.name === 'undoall')?.state);
  await Lazy.load('undoall');
  await until(() => typeof UndoAll !== 'undefined');
  await UndoAll.ready();
  step('/undo-change and /redo-change exist, no duplicate command', Commands.get('undo-change') && Commands.get('redo-change') && !Commands.duplicates().length, Commands.duplicates().map((d) => d.name));
  const C = H.claudeAgent();
  activate(C.id);
  await wait(300);

  // ---------- 1. a Settings switch ----------
  await AppUI.openSettings(); await wait(700);
  const dlg = document.querySelector('dialog[open]');
  const row = [...dlg.querySelectorAll('.sf-row')].find((r) => /A chime when a reply ends/.test(r.textContent));
  const was = store.get('chat.chime', false);
  const btn = row?.querySelector(`.sf-seg button[data-v="${was ? 'off' : 'on'}"]`);
  focusOn(btn); btn.click();
  await until(() => top()?.kind === 'switch', 6000); // the entry lands once its command is done
  focusOn(btn);
  step('flip "A chime when a reply ends": one entry, in plain words', top()?.kind === 'switch' && /chime/i.test(top()?.label || ''), top()?.label);
  await ctrlZ();
  const back = await until(() => store.get('chat.chime', false) === was, 4000);
  const onBtn = row.querySelector('.sf-seg button.on');
  step('Ctrl+Z in Settings: the switch is back, the row shows it, the toast says "Undid: … · Redo"', back && onBtn?.dataset.v === (was ? 'on' : 'off') && /Undid: .*chime/i.test(toastText()) && /Redo/.test(toastText()), { now: store.get('chat.chime', false), row: onBtn?.dataset.v, toast: toastText() });
  await ctrlShiftZ();
  step('Ctrl+Shift+Z redoes it', await until(() => store.get('chat.chime', false) !== was, 4000) && /Redid: /.test(toastText()), toastText());
  await ctrlZ();
  await until(() => store.get('chat.chime', false) === was, 4000);
  dlg.querySelector('form')?.requestSubmit?.(); dlg.close?.();
  await wait(300);

  // ---------- 2. ⋯ AI setup: Mood board for Claude ----------
  await Lazy.load('options');
  Options.open({ agentId: C.id });
  const sheet = await until(() => document.querySelector('aside.opt-sheet'));
  const sw = () => [...sheet.querySelectorAll('.opt-row')].find((r) => r.querySelector('.opt-label')?.textContent === 'Mood board')?.querySelector('.opt-switch');
  const boardWas = Boolean(H.agent(C.id).boardTools);
  focusOn(sw()); sw().click();
  await until(() => Boolean(H.agent(C.id).boardTools) !== boardWas && top()?.kind === 'config', 4000);
  await wait(400);
  step('AI setup: Mood board switched → "Turned … Mood board for Claude"', top()?.kind === 'config' && new RegExp(`^Turned ${boardWas ? 'off' : 'on'} Mood board for ${C.name}$`).test(top()?.label || ''), top()?.label);
  focusOn(sw());
  await ctrlZ();
  const bBack = await until(() => Boolean(H.agent(C.id).boardTools) === boardWas, 4000);
  await wait(400);
  const shown = document.querySelector('aside.opt-sheet') && sw()?.getAttribute('aria-checked') === String(boardWas);
  step('Ctrl+Z: Mood board is back for Claude, saved, the sheet shows it', bBack && shown && /Undid: Turned .*Mood board for/.test(toastText()), { boardTools: H.agent(C.id).boardTools, shown, toast: toastText() });
  const onDisk = (await window.hub.getConfig()).config?.agents?.find((a) => a.id === C.id);
  step('…and config.json says so too', Boolean(onDisk?.boardTools) === boardWas, onDisk?.boardTools);
  document.querySelector('aside.opt-sheet .opt-head button[title^="Close"]')?.click();
  await wait(200);

  // ---------- 3. chats: deleted, renamed, moved ----------
  const id = `${C.id}-uatest${Date.now().toString(36)}`;
  await window.hub.saveChat({ id, agentId: C.id, title: 'Logo ideas', messages: [{ role: 'user', text: 'Some logo ideas please', at: Date.now() }], createdAt: Date.now(), updatedAt: Date.now() });
  H.chats = await window.hub.listChats(); Panel.render();
  await Native.remove(id);
  step('delete a chat: "Deleted chat “Logo ideas”"', top()?.label === 'Deleted chat “Logo ideas”' && !H.chats.some((c) => c.id === id), top()?.label);
  document.activeElement?.blur?.();
  await ctrlZ();
  step('Ctrl+Z: the chat is back', await until(() => H.chats.some((c) => c.id === id), 5000), toastText());
  await ctrlShiftZ();
  step('Ctrl+Shift+Z: deleted again', await until(() => !H.chats.some((c) => c.id === id), 5000));
  await ctrlZ();
  await until(() => H.chats.some((c) => c.id === id), 5000);
  UndoAll._test.acting();
  await Native.rename(id, 'Logo ideas v2');
  step('rename: "Renamed chat “Logo ideas” to “Logo ideas v2”"', /Renamed chat “Logo ideas” to “Logo ideas v2”/.test(top()?.label || ''), top()?.label);
  await ctrlZ();
  step('Ctrl+Z: the old title is back', await until(() => H.chats.find((c) => c.id === id)?.title === 'Logo ideas', 4000), H.chats.find((c) => c.id === id)?.title);
  UndoAll._test.acting();
  ChatUX.setMeta(id, { folder: 'Work' });
  step('move to a folder: "Moved chat “Logo ideas” to “Work”"', top()?.label === 'Moved chat “Logo ideas” to “Work”', top()?.label);
  await ctrlZ();
  step('Ctrl+Z: out of the folder again', await until(() => !ChatUX.metaOf(id)?.folder, 3000), ChatUX.metaOf(id));

  // ---------- 4. text boxes keep their own undo ----------
  const box = document.querySelector(`.surface:not(.hidden) .composer textarea`) || [...document.querySelectorAll('.composer textarea')].find((t) => t.checkVisibility?.());
  UndoAll._test.acting();
  ChatUX.setMeta(id, { folder: 'Later' }); // something for Ctrl+Z to (not) take back
  const n0 = top();
  box.focus(); box.value = '';
  await smoke({ cdp: 'Input.insertText', params: { text: 'typed words' } });
  await wait(150);
  const typed = box.value;
  await ctrlZ();
  step('in the message box Ctrl+Z undoes the typing, not the app\'s last change', typed === 'typed words' && box.value === '' && !n0.undone && ChatUX.metaOf(id)?.folder === 'Later', { typed, after: box.value, logTop: n0.label, undone: n0.undone });
  box.blur();

  // ---------- 5. the Lab keeps its own undo ----------
  await SQL.lab();
  const S = ThreeLab.scenes;
  const CODE = 'const P = tweak({ glow: { value: 1.2, min: 0, max: 3, label: \'Glow amount\' } });\nconst c = document.createElement(\'canvas\'); document.body.append(c);';
  const sc = S.create({ name: 'Undo test', code: CODE, layers: [ThreeLayers.defaults({ id: 'main', name: 'Orb', code: CODE })], open: true });
  await until(() => S.currentId() === sc.id, 6000);
  const ctl = await until(() => ThreeLab.stageHooks.ctlOf('main')?.el?.isConnected && ThreeLab.stageHooks.ctlOf('main'), 10000);
  const head = ctl?.el.querySelector('.tw-head b') || ctl?.el;
  if (head) focusOn(head);
  await ctrlZ();
  step('the Lab on screen, focus in its sliders: Ctrl+Z is the Lab\'s (the app\'s change stays)', ctl && !n0.undone && ChatUX.metaOf(id)?.folder === 'Later', { ctl: Boolean(ctl), undone: n0.undone });
  document.activeElement?.blur?.();
  await ctrlZ();
  step('the Lab on screen, focus nowhere: still the Lab\'s (nothing app-wide undone)', !n0.undone, n0.undone);
  activate(C.id);
  await wait(400);
  document.activeElement?.blur?.();
  await ctrlZ();
  step('back in the chat: Ctrl+Z undoes the app\'s last change', await until(() => n0.undone && !ChatUX.metaOf(id)?.folder, 3000), toastText());

  // ---------- 6. Activity › Recent changes · Find anything · in words ----------
  const pop = await UndoAll.openPart();
  const part = await until(() => pop?.querySelector('.ua-part:not([hidden])'));
  const rowsNow = [...(part?.querySelectorAll('.ua-row') || [])];
  step('Activity › Recent changes lists them (undone ones struck, ↷ on the last undone)', rowsNow.length >= 4 && part.querySelector('.ua-row.ua-undone .ua-redo'), rowsNow.map((r) => r.textContent).slice(0, 6));
  part.querySelector('.ua-row.ua-undone .ua-redo')?.click();
  step('↷ on a row redoes it', await until(() => ChatUX.metaOf(id)?.folder === 'Later', 3000), ChatUX.metaOf(id));
  await wait(200);
  part.querySelector('.ua-row:not(.ua-undone) .ua-undo')?.click();
  step('↶ on a row undoes it', await until(() => !ChatUX.metaOf(id)?.folder, 3000), ChatUX.metaOf(id));
  Activity.close?.();
  AppUI.palette();
  const pin = await until(() => document.querySelector('.palette-input'), 4000);
  if (pin) { pin.value = 'undo'; pin.dispatchEvent(new Event('input')); }
  await wait(600);
  const found = [...document.querySelectorAll('.palette .palette-item .p-label')].slice(0, 8).map((n) => n.textContent);
  pin?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  step('Find anything "undo": Undo last change', found.some((t) => /Undo last change/.test(t)), found);
  let listed = '';
  await Commands.tryRun('/undo-change list', C.id, undefined, { source: 'code', say: (t) => { listed += t; }, note: (t) => { listed += t; } });
  step('/undo-change list says them in words', /Recent changes/.test(String(listed)) && /Logo ideas/.test(String(listed)), String(listed).slice(0, 300));
  await wait(700);
  const file = (await window.hub.attachmentsDir()).replace(/[\\/]attachments[\\/]?$/, '') + '/.undo-hold/log.json';
  const saved = JSON.parse(await window.hub.fs.read(file).catch(() => '{}'));
  step('the log is kept on this computer (data/.undo-hold/log.json)', (saved.list || []).length === UndoAll.list().length, (saved.list || []).length);
  Keys.groups(true);
  step('the keys sheet lists Ctrl+Z / Ctrl+Shift+Z', Keys.all().some((k) => k.keys === 'Ctrl+Z' && /undo the last change/.test(k.what)), null);
  await window.hub.deleteChat(id).catch(() => {});
} catch (err) { step(`threw: ${err.message}`, false, err.stack?.split('\n').slice(0, 3).join(' · ')); }
const failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify({ pass: !failed.length, failed, ...out }, null, 1);
