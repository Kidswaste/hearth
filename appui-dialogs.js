// AppUI's dialogs (round 83, firstscreen83: moved out of appui.js, so the first screen doesn't parse them): Settings,
// Downloads, Recently deleted chats, Backups and the restore, the old usage list. appui.js keeps their names
// (AppUI.openSettings, AppUI.trashDialog…) and loads this file the first time one opens, or in an idle moment after the
// first screen (lazy group 'appdialogs'). The code is the same as before; what it shares with appui.js (the looks, the
// downloads of this session, createShortcuts…) comes through AppUI._dialogs.
const AppUIDialogs = (() => {
  const { THEMES, SPELL_LANGS, loadFind, createShortcuts, packForMac, backupNow, exportData, downloads, dlHistory, clearLog, setView } = AppUI._dialogs;

  // ---------- settings dialog ----------
  async function openSettings(query = '') {
    try { await loadFind(); } catch (err) { console.warn(err); }
    try { if (window.Lazy) await Lazy.load('updater'); } catch (err) { console.warn(err); } // (round 87, firstscreen87) its What's new row reads Updater
    if (typeof query !== 'string') query = '';
    document.querySelector('dialog.settings-dialog[open]')?.close();
    const s = { ...H.settings() };
    const hidden = new Set(H.config.tools?.hidden || []);
    // (round 27, simplify2) every row says what it does on hover (tip)
    const field = (label, input, hint, tip) => el('label', { title: tip || hint || '' }, label, input, hint ? el('span', { class: 'hint', text: hint }) : null);
    const check = (label, checked, hint, tip) => {
      const input = el('input', { type: 'checkbox', checked: Boolean(checked) });
      return [el('label', { class: 'check', title: tip || hint || '' }, input, label, hint ? el('span', { class: 'hint inline', text: hint }) : null), input];
    };
    const startOn = el('select', {}, el('option', { value: '', text: 'Projects' }), // (lazyfix66) no choice = Projects (Codex's projects-first start)
      H.agents().map((a) => el('option', { value: a.id, text: a.name, selected: s.startOn === a.id })),
      Tools.all().map((t) => el('option', { value: `tool:${t.id}`, text: t.name, selected: s.startOn === `tool:${t.id}` })));
    const hotkey = el('input', { value: s.hotkey ?? 'Control+Alt+H', placeholder: 'e.g. Control+Alt+H (empty = off)' });
    const ideaKey = el('input', { value: s.quickIdeaKey ?? 'Control+Alt+I', placeholder: 'e.g. Control+Alt+I (empty = off)' }); // (round 71, quickidea71) 💡 Quick idea from any app
    const ideaKeyNote = el('span', { class: 'hint' });
    window.hub.quickIdea?.op({ op: 'key' }).then((r) => { const k = r?.value; if (k && k.key && !k.ok && k.key === ideaKey.value.trim()) ideaKeyNote.textContent = `Off: ${k.why || 'another app uses it'}. Pick another key.`; }).catch(() => {});
    const [trayRow, trayIn] = check('Closing the window keeps Hearth running in the tray', s.closeToTray, '', 'The window closes but Hearth keeps going (replies, renders, sync); the tray icon brings it back');
    const isMac = /Mac/.test(navigator.platform);
    const [startupRow, startupIn] = check(isMac ? 'Start Hearth when you log in' : 'Start Hearth when Windows starts', s.launchAtStartup, '', isMac ? 'Hearth opens by itself when you sign in (on a Mac, also add Hearth.app in System Settings › General › Login Items)' : 'Hearth opens by itself when you sign in to this computer');
    const claudePath = el('input', { value: s.enginePaths?.claude || '', placeholder: 'Found automatically (Claude desktop app or the claude command)' });
    const codexPath = el('input', { value: s.enginePaths?.codex || '', placeholder: 'Found automatically (Codex / ChatGPT app or the codex command)' });
    const [notifyRow, notifyIn] = check('Desktop notifications while I\'m elsewhere', s.notify !== false, '', 'A system notification when an AI finishes, something needs you, or a long job ends while you are in another window or app');
    // (round 44, notify) Tell me when…: what notifies, five switches under the one above (notify-core.js SWITCHES)
    const NC = typeof NotifyCore !== 'undefined' ? NotifyCore : null;
    const whenBoxes = NC ? NC.SWITCHES.map((sw) => { const [row, input] = check(sw.label, NC.prefs(s)[sw.id], '', sw.tip); input.dataset.notify = sw.id; row.classList.add('nt-when'); return [row, input]; }) : [];
    const whenNow = () => ({ notify: notifyIn.checked, notifyWhen: Object.fromEntries(whenBoxes.map(([, i]) => [i.dataset.notify, i.checked])) });
    const whenDim = () => { for (const [row, i] of whenBoxes) { i.disabled = !notifyIn.checked; row.style.opacity = notifyIn.checked ? '' : '0.55'; } };
    notifyIn.addEventListener('change', whenDim); whenDim();
    const sleepSel = el('select', {}, [['0', 'Never'], ['10', 'after 10 minutes'], ['30', 'after 30 minutes'], ['60', 'after an hour']].map(([v, l]) => el('option', { value: v, text: l, selected: String(s.sleepWebsAfter || 0) === v })));
    const langs = new Set(s.spellLanguages || ['en-US']);
    const langBoxes = SPELL_LANGS.map(([code, label]) => {
      const input = el('input', { type: 'checkbox', checked: langs.has(code), dataset: { code } });
      return el('label', { class: 'check' }, input, label);
    });
    const toolBoxes = Tools.all().map((t) => {
      const input = el('input', { type: 'checkbox', checked: !hidden.has(t.id), dataset: { id: t.id } });
      return el('label', { class: 'check' }, input, `${t.icon} ${t.name}`);
    });
    const folderInput = (value, title) => {
      const input = el('input', { value: value || '', placeholder: 'Not set' });
      const pick = el('button', { type: 'button', class: 'ghost small', text: 'Choose…', on: { click: async () => { const f = await window.hub.pickFolder(input.value, title); if (f) input.value = f; } } });
      return [el('div', { class: 'folder-row' }, input, pick), input];
    };
    const [fhRow, fhIn] = folderInput(s.forgeheartFolder, 'Forgeheart project folder');
    const dbgIn = el('input', { value: s.forgeDebugBuild || '', placeholder: 'Default: forgeheart_music_test5.html on your Desktop' });
    const dbgRow = el('div', { class: 'folder-row' }, dbgIn, el('button', { type: 'button', class: 'ghost small', text: 'Choose…', on: { click: async () => {
      const [p] = await window.hub.openDialog({ filters: [{ name: 'Forgeheart build', extensions: ['html'] }] });
      if (p) dbgIn.value = p;
    } } }));
    const [aeRow, aeIn] = folderInput(s.aePath, 'After Effects "Support Files" folder');
    const aeDirs = el('textarea', { rows: 2, value: (s.aeProjectDirs || []).join('\n'), placeholder: 'One folder per line (default: your Documents)' });

    const dialog = el('dialog', { class: 'ui-modal settings-dialog' });
    const section = (title, ...kids) => el('section', { class: 'settings-section' }, el('h3', { text: title }), ...kids);
    const home = (sec, id) => { sec.dataset.home = id; return sec; }; // settings-find.js puts each switch in its home
    const gbtn = (text, title, fn, cls = 'ghost') => el('button', { type: 'button', class: cls, text, title, on: { click: fn } });
    const run = (line) => () => { dialog.close(); Commands.tryRun(line, H.claudeAgent()?.id); };
    // (round 27, simplify2) the owner found the app "way too complex… unclear" and loved how calm ⋯ AI setup is, so
    // Settings reads the same way. (round 39, settingscalm) "so much simpler": four plain sections read top to bottom
    // (Look & size · Your AIs · This computer & sync · Updates & what's new), one obvious control per row, the rest in
    // folds that say in one line where they stand (simplify3's pattern), the rarer folds under Advanced. Nothing left:
    // every row is still here (the search and Ctrl/⌘+K find it and open its folds), no command names on screen.
    const states = [];
    const openFolds = (() => { try { return new Set(store.get('settings.open', []) || []); } catch { return new Set(); } })();
    const keepOpen = (key, on) => { if (on) openFolds.add(key); else openFolds.delete(key); try { store.set('settings.open', [...openFolds]); } catch { /* no storage */ } };
    // a fold: its title, one line about where it stands (right), a one-sentence tooltip; the section inside keeps its
    // name (hidden: the fold shows it) so the search, the right-click "Go to" and Find anything find it by that name
    const fold = (key, title, tip, state, sec, cls = '') => {
      const line = el('span', { class: 'sc-state' });
      const sum = el('summary', { class: 'sc-sum', title: tip }, el('span', { class: 'sc-title', text: title }), line);
      const d = el('details', { class: `sc-fold ${cls}`.trim(), dataset: { fold: key } }, sum, sec);
      d.open = openFolds.has(key);
      sum.addEventListener('click', () => setTimeout(() => keepOpen(key, d.open), 0)); // only what you open yourself stays open
      states.push(() => { let t = ''; try { t = state() || ''; } catch { /* not ready */ } t = t.charAt(0).toUpperCase() + t.slice(1); if (line.textContent !== t) line.textContent = t; });
      return d;
    };
    const paintStates = () => { for (const f of states) f(); };
    const list3 = (names, none) => (names.length ? `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}` : none);
    const swOn = (cmd) => (typeof SettingsFind !== 'undefined' ? SettingsFind.state(cmd) : undefined);
    const lookName = () => { const t = THEMES[H.config.theme?.preset]; return t ? t.label.replace(/ \(.*\)$/, '') : 'Custom'; };

    // ---- Look & size ----
    const look = Look.picker({ split: true });
    const sizeRow = typeof Bigscreen !== 'undefined' ? Bigscreen.sizeRow({ compact: true }) : null;
    const lookSec = section('Look & size', look, sizeRow,
      fold('look', 'More looks and tweaks', 'Every other look, following your computer\'s light / dark mode, your saved looks, glow, motion, spacing, sparkles',
        () => [lookName(), window.NativeFeel?.following?.() ? 'follows your computer' : '', swOn('sparkles') === false ? 'no sparkles' : ''].filter(Boolean).join(' · '),
        home(section('More looks and tweaks', look.rest, el('span', { class: 'sf-slot' })), 'look')));

    // ---- Your AIs ----
    const aiSec = section('Your AIs',
      el('div', { class: 'settings-ai', title: 'Personality, standing instructions, what each AI can use (files, the board, the Lab, apps), memory, how hard it thinks' },
        el('span', { text: 'Who they are and what they can use' }), el('span', { class: 'spacer' }),
        gbtn('⋯ AI setup', 'Opens AI setup for the chat you are in', () => { dialog.close(); (window.Lazy?.load ? Lazy.load('options') : Promise.resolve()).then(() => Options.open({})).catch(() => activate('tool:options')); }, 'ghost small')),
      fold('programs', 'Claude and Codex programs', 'Where the Claude and Codex programs are, only when Hearth can\'t find them by itself',
        () => { const c = claudePath.value.trim(); const x = codexPath.value.trim(); return c || x ? [c ? 'Claude: your own path' : '', x ? 'Codex: your own path' : ''].filter(Boolean).join(' · ') : 'Found by themselves'; },
        section('Claude and Codex programs', field('Claude program (only if it isn\'t found)', claudePath, '', 'Where the Claude program is, when Hearth can\'t find it by itself'), field('Codex program (only if it isn\'t found)', codexPath, '', 'Where the Codex program is, when Hearth can\'t find it by itself'))));

    // ---- This computer & sync ----
    const syncSec = typeof Sync !== 'undefined' ? Sync.settingsSection(section) : null; // round 10: sync through your cloud drive
    const pcSec = syncSec || section('This computer & sync');
    pcSec.querySelector('h3').textContent = 'This computer & sync';
    if (syncSec) {
      for (const b of syncSec.querySelectorAll('.button-row > button:not([title])')) b.title = 'Keeps your Mac and PC the same through a cloud drive folder you already use (iCloud Drive, Google Drive, Dropbox, OneDrive)';
      syncSec.querySelector('label.check')?.setAttribute('title', 'Very big captures and renders travel too, in pieces that resume after a break');
      syncSec.querySelector('.two-here')?.setAttribute('title', 'The name this computer goes by in sync and in your chats');
      // (round 89, packs89) off by default; sends only the newest part of a very long chat (16 MB or more) through the
      // cloud folder. Used only while BOTH computers have it on (Hearth checks); else everything syncs as before.
      const pkIn = el('input', { type: 'checkbox' }); const pkHint = el('span', { class: 'hint inline' });
      const pkRow = el('label', { class: 'check sync-packs', title: 'A very long chat (thousands of messages) sends only its newest part each time, instead of the whole chat. Turn it on on both computers.' }, pkIn, 'Send very long chats in pieces (both computers need this update)', pkHint);
      const pkShow = (p) => { pkIn.checked = Boolean(p?.on); pkHint.textContent = !p?.on ? '' : p.gate?.ok ? ' On: in use.' : p.gate?.why === 'older' || p.gate?.why === 'alone' || p.gate?.why === 'unreadable' ? ' On here: waiting for your other computer to have it on too (until then everything syncs as before).' : ''; };
      pkIn.addEventListener('change', () => window.hub.sync.packs?.(pkIn.checked).then(pkShow).catch(() => {}));
      window.hub.sync.status?.().then((st) => { pkRow.hidden = !st?.on; pkShow(st?.packs); }).catch(() => { pkRow.hidden = true; });
      (syncSec.querySelector('label.check')?.after ? syncSec.querySelector('label.check').after(pkRow) : syncSec.append(pkRow));
    }
    pcSec.append(
      // (round 45, backupauto) "Last backup: 2 h ago ✓" with Backups… (backupauto.js; loaded right after the first screen)
      (() => { if (window.BackupAuto) return BackupAuto.line(); const slot = el('span', { class: 'sf-slot' }); window.Lazy?.load?.('backupauto').then(() => { if (window.BackupAuto) slot.replaceWith(BackupAuto.line()); }).catch(() => {}); return slot; })(),
      // (round 53, diskcalm) "Space Hearth uses: 2.4 GB: backups 1.2 GB · game cache 600 MB · …" with Free up per cache (diskcalm.js)
      (() => { if (window.DiskCalm) return DiskCalm.line(); const slot = el('span', { class: 'sf-slot' }); window.Lazy?.load?.('diskcalm').then(() => { if (window.DiskCalm) slot.replaceWith(DiskCalm.line()); }).catch(() => {}); return slot; })(),
      // (round 90, devices90) "Your computers": each computer Hearth knows, Forget this computer…, very long chats' pieces' space (devices90.js; shown while sync is on)
      (() => { if (!syncSec) return el('span'); if (window.Devices90) return Devices90.line(); const slot = el('span', { class: 'dv-slot' }); window.Lazy?.load?.('devices90').then(() => { if (window.Devices90) slot.replaceWith(Devices90.line()); }).catch(() => {}); return slot; })(),
      el('div', { class: 'button-row', title: 'Claude, Codex, ffmpeg, sync, folders from the other computer, permissions, updates: one list, one button each' },
        gbtn('Check this computer…', 'Is this computer ready? Each thing with its state and one button to fix it (nothing installs without your click)', () => { dialog.close(); (window.Lazy?.load ? Lazy.load('firstrun') : Promise.resolve()).then(() => FirstRun.open()); })), // (round 28, firstrun)
      fold('start', 'Starting and closing', 'What Hearth does when your computer starts, when it opens and when you close its window',
        () => [`Opens on ${startOn.value ? startOn.selectedOptions[0]?.text || '…' : 'Projects'}`, startupIn.checked ? 'starts with your computer' : '', trayIn.checked ? 'stays in the tray' : ''].filter(Boolean).join(' · '),
        home(section('Starting and closing', field('Open on start', startOn, '', 'What Hearth shows when it opens'), startupRow, trayRow, el('span', { class: 'sf-slot' })), 'start')));

    // ---- Updates & what's new ----
    const upLine = () => { const u = typeof Updater !== 'undefined' ? Updater.status : null; return !u ? 'Hearth looks for updates by itself every half hour.' : u.ok ? (u.behind ? `${u.behind} new change${u.behind === 1 ? '' : 's'} ready: ⬆ in the rail.` : 'Hearth is up to date.') : 'Could not look for updates just now.'; };
    const upText = el('span', { class: 'sc-line', text: upLine() });
    const upSec = section('Updates & what\'s new',
      el('div', { class: 'sc-row', title: 'Hearth looks for updates by itself; Look now asks at once (nothing is installed without you)' }, upText, el('span', { class: 'spacer' }),
        gbtn('Look now', 'Ask for updates now (nothing is installed without you)', async () => { await Updater.check({ loud: true }); upText.textContent = upLine(); }, 'ghost small')),
      el('div', { class: 'button-row', title: 'What changed lately, in plain words' },
        // (round 33, simplify3) one "What's new…" for the patch notes and what fits how you work (were two buttons)
        gbtn('What\'s new…', 'Shows what changed lately: every change in plain words, or only what fits how you work', (e) => { const r = e.currentTarget.getBoundingClientRect(); showMenu(r.left, r.bottom + 4, [
          { label: 'Since you were away', hint: 'the top changes of the rounds you missed, one page', action: () => { dialog.close(); Updater.sinceAway(); } }, // (round 42, whatsnew)
          { label: 'Patch notes', hint: 'every change, round by round', action: () => { dialog.close(); Updater.patchNotes(); } },
          { label: 'What\'s new for me', hint: 'what fits how you work', action: run('/whats-new') },
          { label: 'Try what\'s new', hint: 'hands-on: rounds 61–63, 30–60 s each', action: run('/try') }, // (round 64, newtour64)
          // (round 37, updatesafe) after an update: back to the version before it, chats and data kept
          ...(Updater.status?.back ? [{ label: 'Go back to the previous version', hint: `before the last update (${Updater.status.back.from})`, action: () => { dialog.close(); Updater.goBack(); } }] : [])]); })),
      fold('updates', 'Updates and tips', 'Whether updates install by themselves, and whether tips show by themselves',
        () => [swOn('update') === false ? 'Updates wait for your click' : 'Updates install by themselves', swOn('hints') === true ? 'no tips' : 'tips on'].join(' · '),
        home(section('Updates and tips', el('span', { class: 'sf-slot' })), 'updates')));

    // ---- Advanced: the rarer folds ----
    const onOf = (sec) => { const rows = [...sec.querySelectorAll('.sf-row')]; return { on: rows.filter((r) => r.querySelector('.sf-seg button.on')?.dataset.v === 'on').length, n: rows.length }; };
    const chatsSec = home(section('Chats', el('span', { class: 'sf-slot' })), 'chats');
    const notifySec = section('Tell me when…', notifyRow, ...whenBoxes.map(([row]) => row));
    const boardSec = home(section('Mood board', el('span', { class: 'sf-slot' })), 'board');
    // (round 52, gpu52) what draws Hearth: the card, the screen's refresh, hardware video (gpu52.js fills it)
    const gpuBox = el('div', { class: 'gpu52-box' });
    (window.Lazy?.load ? Lazy.load('glrecover') : Promise.resolve()).then(() => window.Gpu52?.mount(gpuBox)).catch(() => {});
    const adv = el('details', { class: 'settings-more sc-fold sc-adv', dataset: { fold: 'advanced' } },
      el('summary', { class: 'sc-sum', title: 'The rarer settings: chats, notifications, keys, the mood board, spelling, the rail, folders, backups and files' }, el('span', { class: 'sc-title', text: 'Advanced' }), el('span', { class: 'sc-state', text: 'Chats, notifications, keys, mood board, spelling, the rail, folders, backups' })),
      fold('chats', 'Chats', 'How the chats behave: Enter, long replies, sounds, notifications, spelling',
        () => { const c = onOf(chatsSec); return [swOn('enter-sends') === false ? 'Ctrl/⌘+Enter sends' : 'Enter sends', `${c.on} of ${c.n} on`].join(' · '); }, chatsSec),
      fold('notify', 'Tell me when…', 'Which desktop notifications Hearth shows while you are in another app (your computer\'s Focus / Do Not Disturb still holds them)',
        () => (NC ? NC.summary(whenNow()) : notifyIn.checked ? 'On' : 'Off'), notifySec),
      fold('keys', 'Keys', 'Your keyboard keys, and one key that shows or hides Hearth from anywhere',
        () => (hotkey.value.trim() ? `Show / hide: ${hotkey.value.trim()}` : 'No show / hide key'),
        home(section('Keys',
          el('div', { class: 'button-row', title: 'Your keyboard keys and what hides behind Alt (the keys button bottom left shows them too)' },
            gbtn('Keyboard keys…', 'Shows every key, what waits behind Alt, and every right-click menu', () => { dialog.close(); KeysUI.open(); })),
          field('Show / hide Hearth from anywhere', hotkey, '', 'A hotkey (key combination) that brings Hearth up or hides it, even from another app (e.g. Control+Alt+H; empty: off)'),
          el('label', { title: 'A key combination that opens the small 💡 Quick idea window from any app (the tray menu has it too). Empty: off. A key another app already uses stays off.' }, '💡 Quick idea from anywhere', ideaKey, ideaKeyNote)), 'keys')), // (round 71, quickidea71)
      fold('board', 'Mood board', 'How items snap while you drag them on the mood board, and its small map',
        () => { const g = swOn('board-snap'); const m = swOn('board-minimap'); return g === undefined ? 'Guides, grid, minimap' : `Guides ${g ? 'on' : 'off'} · grid ${swOn('board-grid') ? 'on' : 'off'} · minimap ${m || 'auto'}`; }, boardSec),
      fold('spell', 'Spell check languages', 'The languages the message box checks your spelling in',
        () => list3(langBoxes.filter((l) => l.querySelector('input').checked).map((l) => l.textContent), 'None'),
        section('Spell check languages', el('div', { class: 'check-grid', title: 'The languages the message box checks your spelling in' }, langBoxes))),
      fold('rail', 'Tools in the rail', 'Which tools have a button in the rail on the left',
        () => { const off = toolBoxes.filter((l) => !l.querySelector('input').checked).length; return off ? `${off} off the rail` : 'Every tool in the rail'; },
        section('Tools in the rail', el('div', { class: 'check-grid', title: 'Untick a tool to take it off the rail (it stays in the rail\'s ⋯)' }, toolBoxes))),
      fold('folders', 'Folders', 'Where the Forgeheart game and After Effects are, when they are somewhere unusual',
        () => list3([[fhIn, 'Forgeheart'], [dbgIn, 'debug build'], [aeIn, 'After Effects']].filter(([i]) => i.value.trim()).map(([, n]) => n).concat(aeDirs.value.trim() ? ['.aep folders'] : []), 'Found by themselves'),
        section('Folders', field('Forgeheart project', fhRow, '', 'The game project the Forge agents work in'), field('Forgeheart debug build', dbgRow, '', 'The game page the Forge Debug agent plays (beside the Forge Debug agent)'), field('After Effects install (only if it isn\'t found)', aeRow, '', 'Only when After Effects is installed somewhere unusual'), field('Where to look for .aep projects', aeDirs, '', 'Folders searched for After Effects projects'))),
      fold('hearth', 'Housekeeping', 'Memory, the weekly tidy of buttons you never press, timers, and the keys of services Hearth talks to',
        () => [swOn('habits') === false ? 'no weekly tidy' : 'weekly tidy on', swOn('timers-pause') ? 'timers paused' : '', Number(sleepSel.value) ? 'unloads idle websites' : ''].filter(Boolean).join(' · '),
        home(section('Housekeeping',
          field('Unload websites I haven\'t opened', sleepSel, '', 'Frees memory; a website loads again when you open it'),
          // (round 33, simplify3) moved from Keys: used once, when you subscribe to Meshy (Apps › Meshy › More has it too)
          el('div', { class: 'button-row', title: 'The keys of services Hearth talks to' },
            gbtn('Meshy key…', 'Paste your Meshy API key once (stored encrypted on this computer, never shown to a chat)', run('/meshy key')),
            gbtn('Paris Métro status key…', 'A free IDFM PRIM key: leave reminders check the Métro lines on your way (stored encrypted on this computer, sent only to PRIM)', () => { dialog.close(); Lazy.load('leavesoon').then(() => LeaveSoon.keyDialog()).catch((err) => toast(calmError(err), { type: 'error' })); })) /* (round 69, ratp69) */, el('span', { class: 'sf-slot' })), 'hearth')),
      fold('graphics', 'Graphics', 'The graphics card Hearth draws with, the screen\'s refresh rate and hardware video (ask in a chat to use another card or way of drawing)',
        () => (window.Gpu52 ? Gpu52.summary() : 'Graphics card, screen refresh, hardware video'), section('Graphics', gpuBox)),
      fold('files', 'Backup and files', 'Backups of your chats and settings, Hearth\'s shortcuts and its own files',
        () => { if (window.BackupAuto) return BackupAuto.lineText().text; const d = Number(H.settings().autoBackupDays) || 0; return d ? `Backs up by itself ${d === 1 ? 'daily' : d === 7 ? 'weekly' : d === 30 ? 'monthly' : `every ${d} days`}` : 'Backups when you ask'; },
        section('Backup and files',
          el('div', { class: 'button-row', title: 'Backups, shortcuts and Hearth\'s own files' },
            // (round 39) one Backups… (back up now, a copy as one file, restore, automatic backups) instead of "Back up hub data…"
            el('button', { type: 'button', class: 'ghost', text: 'Backups…', title: 'Back up now, save a copy as one file, restore, or back up by itself every day / week', on: { click: () => { dialog.close(); backupsDialog(); } } }),
            el('button', { type: 'button', class: 'ghost', text: isMac ? 'Create Hearth.app in Applications' : 'Create Start menu & desktop shortcuts', title: 'Open Hearth like any other app', on: { click: createShortcuts } }),
            el('button', { type: 'button', class: 'ghost', text: 'Pack Hearth for a Mac…', title: 'One zip with the app, your chats, sketches, settings and memory, plus the Mac setup script', on: { click: packForMac } }),
            el('button', { type: 'button', class: 'ghost', text: 'Open data folder', title: 'Where Hearth keeps your chats and files', on: { click: () => window.hub.openDataFolder() } }),
            el('button', { type: 'button', class: 'ghost', text: 'Edit config.json', title: 'Every setting as a text file (for experts)', on: { click: () => window.hub.openFile('config') } }),
            el('button', { type: 'button', class: 'ghost', text: 'Edit theme.css', title: 'Your own colours and styles as a text file (for experts)', on: { click: () => window.hub.openFile('theme') } })))));
    adv.open = openFolds.has('advanced');
    adv.querySelector(':scope > summary').addEventListener('click', () => setTimeout(() => keepOpen('advanced', adv.open), 0));
    const form = el('form', { method: 'dialog' },
      el('h2', { text: 'Settings' }),
      lookSec, aiSec, pcSec, upSec, adv,
      el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }),
        el('button', { type: 'button', text: 'Cancel', on: { click: () => dialog.close() } }),
        el('button', { type: 'submit', class: 'primary', text: 'Save' })));
    // the fold lines follow what you change inside them (a switch answers a moment later: sf-changed)
    let paintSoon = 0;
    const later = () => { clearTimeout(paintSoon); paintSoon = setTimeout(paintStates, 250); };
    for (const t of ['change', 'input', 'click']) form.addEventListener(t, () => { requestAnimationFrame(paintStates); later(); });
    form.addEventListener('sf-changed', paintStates);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      H.config.settings = {
        ...H.config.settings,
        startOn: startOn.value || undefined,
        closeToTray: trayIn.checked,
        launchAtStartup: startupIn.checked,
        notify: notifyIn.checked,
        ...(NC ? { notifyWhen: whenNow().notifyWhen } : {}),
        sleepWebsAfter: Number(sleepSel.value) || undefined,
        hotkey: hotkey.value.trim(),
        quickIdeaKey: ideaKey.value.trim(), // (round 71, quickidea71) empty: off
        spellLanguages: langBoxes.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.dataset.code),
        forgeheartFolder: fhIn.value.trim() || undefined,
        forgeDebugBuild: dbgIn.value.trim() || undefined,
        aePath: aeIn.value.trim() || undefined,
        aeProjectDirs: aeDirs.value.split('\n').map((x) => x.trim()).filter(Boolean),
        enginePaths: claudePath.value.trim() || codexPath.value.trim() ? { claude: claudePath.value.trim() || undefined, codex: codexPath.value.trim() || undefined } : undefined,
      };
      H.config.tools = { ...H.config.tools, hidden: toolBoxes.map((l) => l.querySelector('input')).filter((i) => !i.checked).map((i) => i.dataset.id) };
      const result = await saveConfig();
      dialog.close();
      if (result && result.hotkeyOk === false) toast(`The hotkey "${hotkey.value}" couldn't be registered (another app may use it).`, { type: 'error' });
      else if (result && result.quickIdeaKeyOk === false) toast(`The 💡 Quick idea key "${result.quickIdeaKey}" is off: ${result.quickIdeaWhy || 'another app uses it'}. The tray menu still has 💡 Quick idea…`, { type: 'error' }); // (round 71, quickidea71)
      else toast('Settings saved', { timeout: 1500 });
    });
    dialog.append(form);
    if (typeof SettingsFind !== 'undefined') try { SettingsFind.mount(form, section, { query }); } catch (err) { console.warn(err); }
    for (const sec of form.querySelectorAll('.settings-section')) if (!sec.querySelector(':scope > :not(h3):not(.sf-slot)')) (sec.closest('details.sc-fold:not(.sc-adv)') || sec).remove(); // a home no switch came to
    paintStates();
    dialog.addEventListener('close', () => dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
  }

  // ---------- downloads ----------
  // This session's downloads plus a log of the last 100 finished ones (kv 'downloads-log'), searchable.
  async function downloadsDialog({ query = '' } = {}) {
    const history = await dlHistory();
    const dlg = el('dialog', { class: 'ui-modal downloads-dialog' });
    const q = el('input', { type: 'search', placeholder: 'Search downloads…', value: query });
    const list = el('div', { class: 'download-list' });
    const folderOf = (p) => p.slice(0, Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')));
    const paint = () => {
      const rows = [...new Map([...history, ...[...downloads.values()].reverse()].map((d) => [d.id, d])).values()]
        .sort((a, b) => (b.state === 'progressing') - (a.state === 'progressing') || (b.at || Date.now()) - (a.at || Date.now()))
        .filter((d) => !q.value || `${d.name} ${d.url || ''}`.toLowerCase().includes(q.value.toLowerCase()));
      list.replaceChildren(...(rows.length ? rows.map((d) => {
        const pct = d.total ? Math.round((d.received / d.total) * 100) : null;
        return el('div', { class: `download-row ${d.state}` },
          el('span', { class: 'dl-name', text: d.name, title: d.url || d.path }),
          d.state === 'progressing' ? el('span', { class: 'dl-bar', title: `${pct ?? '?'}%` }, el('span', { style: { width: `${pct ?? 30}%` } })) : null,
          el('span', { class: 'hint', text: d.state === 'completed' ? `${fmtBytes(d.total || d.received)}${d.at ? ` · ${timeAgo(d.at)}` : ''}` : d.state === 'progressing' ? `${pct ?? '?'}% of ${d.total ? fmtBytes(d.total) : '?'}` : d.state }),
          el('button', { type: 'button', class: 'ghost small', text: 'Open', disabled: d.state !== 'completed', on: { click: () => window.hub.fs.open(d.path) } }),
          el('button', { type: 'button', class: 'ghost small', text: 'Show', on: { click: () => window.hub.fs.reveal(d.path) } }),
          d.url && d.state !== 'completed' ? el('button', { type: 'button', class: 'ghost small', text: 'Try again', title: 'Opens the link in your browser', on: { click: () => window.hub.openExternal(d.url) } }) : null,
          d.url ? el('button', { type: 'button', class: 'ghost small', text: '🔗', title: 'Copy the link', on: { click: () => copyText(d.url, 'Link') } }) : null);
      }) : [el('p', { class: 'hint', text: history.length || downloads.size ? 'Nothing matches.' : 'Nothing downloaded yet. Files you download from website agents land in your Downloads folder and show up here.' })]));
    };
    q.addEventListener('input', paint);
    const latest = [...downloads.values()].at(-1) || history[0];
    dlg.append(el('form', { method: 'dialog', on: { keydown: (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); } } }, el('h2', { text: 'Downloads' }), q, list,
      el('div', { class: 'dialog-actions' },
        latest ? el('button', { type: 'button', class: 'ghost small', text: 'Open the folder', on: { click: () => window.hub.fs.open(folderOf(latest.path)) } }) : null,
        el('button', { type: 'button', class: 'ghost small', text: 'Clear the list', title: 'Forgets the list (the files stay)', on: { click: async () => { clearLog(); history.length = 0; for (const [id, d] of downloads) if (d.state !== 'progressing') downloads.delete(id); await window.hub.kvSet('downloads-log', []); paint(); } } }),
        el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Close' }))));
    dlg.addEventListener('close', () => { dlg.remove(); setView(null); });
    document.body.append(dlg);
    setView(() => { if (dlg.isConnected) paint(); });
    paint();
    dlg.showModal();
    return dlg;
  }

  // ---------- recently deleted chats ----------
  const dataDir = async () => { const a = await window.hub.attachmentsDir(); return a.slice(0, Math.max(a.lastIndexOf('/'), a.lastIndexOf('\\'))); };
  const sepOf = (p) => (p.includes('\\') ? '\\' : '/');
  async function trashDialog({ query = '' } = {}) {
    let items = await window.hub.listChatTrash();
    const dlg = el('dialog', { class: 'ui-modal trash-dialog' });
    const q = el('input', { type: 'search', placeholder: 'Search deleted chats…', value: query });
    const list = el('div', { class: 'download-list' });
    const refreshChats = async () => { H.chats = await window.hub.listChats(); Panel.render(); };
    const restore = async (c) => { await window.hub.restoreChat(c.id); items = items.filter((x) => x !== c); };
    const forever = async (cs) => {
      const dir = await dataDir(); const sep = sepOf(dir);
      const r = await window.hub.fs.trash(cs.map((c) => `${dir}${sep}trash${sep}${c.id}.json`));
      const gone = new Set(r.done.map((p) => p.split(/[\\/]/).pop().replace(/\.json$/, '')));
      items = items.filter((x) => !gone.has(x.id));
      if (r.failed.length) toast(`${r.failed.length} couldn't be moved: ${r.failed[0].error}`, { type: 'error' });
      return r;
    };
    const peek = async (c) => {
      const dir = await dataDir();
      try {
        const chat = JSON.parse(await window.hub.fs.read(`${dir}${sepOf(dir)}trash${sepOf(dir)}${c.id}.json`));
        Modal.alert(c.title, chat.messages.slice(0, 6).map((m) => `${m.role === 'user' ? 'You' : H.agent(chat.agentId)?.name || 'Agent'}: ${(m.text || '').slice(0, 280)}`).join('\n\n') || '(empty)');
      } catch (err) { toast(err.message, { type: 'error' }); }
    };
    const paint = () => {
      const rows = items.filter((c) => !q.value || `${c.title} ${H.agent(c.agentId)?.name || ''}`.toLowerCase().includes(q.value.toLowerCase()));
      list.replaceChildren(...(rows.length ? rows.map((c) => el('div', { class: 'download-row' },
        el('span', { class: 'dl-name', text: c.title, title: c.title }),
        el('span', { class: 'hint', text: `${H.agent(c.agentId)?.name || c.agentId} · ${c.messages} msgs · deleted ${timeAgo(c.deletedAt)} · ${Math.max(0, 30 - Math.floor((Date.now() - c.deletedAt) / 864e5))} d left` }),
        el('button', { type: 'button', class: 'ghost small', text: 'Peek', on: { click: () => peek(c) } }),
        el('button', { type: 'button', class: 'ghost small', text: 'Restore', on: { click: async () => { await restore(c); await refreshChats(); paint(); toast(`Restored "${c.title}"`, { timeout: 2000 }); } } }),
        el('button', { type: 'button', class: 'ghost small danger', text: '×', title: 'Delete for good (to the Recycle Bin / Trash)', on: { click: async () => { await forever([c]); paint(); } } })))
        : [el('p', { class: 'hint', text: items.length ? 'Nothing matches.' : 'Nothing deleted in the last 30 days.' })]));
    };
    q.addEventListener('input', paint);
    dlg.append(el('form', { method: 'dialog', on: { keydown: (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.preventDefault(); } } }, el('h2', { text: 'Recently deleted chats' }),
      el('p', { class: 'hint', text: 'Deleted chats are kept here for 30 days. Deleting them for good moves the files to your Recycle Bin / Trash.' }), q, list,
      el('div', { class: 'dialog-actions' },
        el('button', { type: 'button', class: 'ghost small', text: 'Restore all', on: { click: async () => { for (const c of [...items]) await restore(c); await refreshChats(); paint(); } } }),
        el('button', { type: 'button', class: 'ghost small danger', text: 'Empty…', on: { click: async () => { if (!items.length || !(await Modal.confirm('Empty recently deleted?', `${items.length} chat(s) go to your Recycle Bin / Trash.`, { ok: 'Empty', danger: true }))) return; await forever([...items]); items = await window.hub.listChatTrash(); paint(); } } }),
        el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Close' }))));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    paint();
    dlg.showModal();
    return dlg;
  }

  // ---------- backups ----------
  // The list of backups and a restore that merges (adds what's missing; never deletes anything of yours). /backup, /restore.
  function restoreText(r) {
    return [`Chats: ${r.chats.add} to add${r.chats.newer ? ` · ${r.chats.newer} newer in the backup` : ''}${r.chats.older ? ` · ${r.chats.older} older in the backup (yours kept)` : ''} · ${r.chats.same} identical`,
      r.kv.merge?.length ? `Brought back into your lists (what you don't have; nothing removed): ${r.kv.merge.map((m) => `${m.name === 'three-sketches' ? 'Lab scenes' : m.name} +${m.n}`).slice(0, 8).join(', ')}` : '',
      r.media?.add ? `Big media files to bring back: ${r.media.add}` : '',
      `Tool data (notes, prompts, sketches…): ${r.kv.add} to add${r.kv.differ.length ? ` · ${r.kv.differ.length} differ (yours kept): ${r.kv.differ.slice(0, 8).join(', ')}${r.kv.differ.length > 8 ? '…' : ''}` : ''}`,
      `Memory: ${r.memory.add} line(s) to add · Attachments: ${r.attachments.add} to add`,
      r.agentsMissing.length ? `Agents in the backup you don't have (add them by hand): ${r.agentsMissing.join(', ')}` : '',
      r.titles.length ? `\nFor example: ${r.titles.slice(0, 5).map((t) => `"${t}"`).join(', ')}` : ''].filter(Boolean).join('\n');
  }
  async function restoreBackup(file) {
    file ||= await window.hub.backup.pick();
    if (!file) return null;
    let r;
    try { r = await window.hub.backup.restore(file, { dryRun: true }); } catch (err) { toast(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), { type: 'error' }); return null; }
    const nothing = !r.chats.add && !r.chats.newer && !r.kv.add && !r.memory.add && !r.attachments.add && !r.kv.merge?.length && !r.media?.add;
    if (nothing) { Modal.alert('Nothing to restore', `Everything in that backup is already here.\n\n${restoreText(r)}`); return r; }
    const v = await new Promise((resolve) => {
      const newer = el('input', { type: 'checkbox' });
      const d = el('dialog', { class: 'ui-modal' });
      d.append(el('form', { method: 'dialog' }, el('h2', { text: 'Restore from backup' }),
        el('p', { class: 'modal-text pre-line', text: `Adds what's missing here; nothing of yours is deleted.\n\n${restoreText(r)}` }),
        r.chats.newer ? el('label', { class: 'check' }, newer, `Also replace ${r.chats.newer} chat(s) with the backup's newer version (yours are kept in data/trash first)`) : null,
        el('div', { class: 'dialog-actions' }, el('span', { class: 'spacer' }),
          el('button', { type: 'button', text: 'Cancel', on: { click: () => d.close() } }),
          el('button', { type: 'submit', class: 'primary', text: 'Restore', value: 'ok' }))));
      d.addEventListener('close', () => { d.remove(); resolve(d.returnValue === 'ok' ? { newer: newer.checked } : null); });
      document.body.append(d);
      d.showModal();
    });
    if (!v) return null;
    const done = await window.hub.backup.restore(file, { dryRun: false, newer: Boolean(v.newer) });
    H.chats = await window.hub.listChats();
    Panel.render();
    toast(`Restored: ${done.chats.add} chat(s)${done.chats.replaced ? `, ${done.chats.replaced} updated` : ''}, ${done.kv.add} tool store(s)${done.kv.merge?.length ? `, ${done.kv.merge.reduce((a, m) => a + m.n, 0)} item(s) back in your lists` : ''}, ${done.memory.add} memory line(s), ${done.attachments.add} attachment(s). Reload to see restored tool data.`, { timeout: 9000, action: { label: 'Reload', fn: () => window.hub.reloadWindow() } });
    return done;
  }
  async function backupsDialog() {
    // (round 45, backupauto) Settings › Backups: by date, what's inside, checked, Restore missing things, Show in Finder /
    // Explorer, where this computer keeps them (backupauto.js); this older dialog only if that can't load
    if (!window.BackupAuto && window.Lazy?.load) { try { await Lazy.load('backupauto'); } catch { /* the older dialog */ } }
    if (window.BackupAuto) return BackupAuto.dialog();
    const dlg = el('dialog', { class: 'ui-modal backups-dialog' });
    const list = el('div', { class: 'download-list' });
    const dirLabel = el('code', {});
    const auto = el('select', { title: 'Back up automatically when the last backup is older than this' },
      [['0', 'Off'], ['1', 'Daily'], ['7', 'Weekly'], ['30', 'Monthly']].map(([v, t]) => el('option', { value: v, text: t, selected: String(H.settings().autoBackupDays || 0) === v })));
    auto.addEventListener('change', async () => { H.config.settings = { ...H.config.settings, autoBackupDays: Number(auto.value) || undefined }; await saveConfig(); toast('Saved', { timeout: 1000 }); });
    const paint = async () => {
      const { dir, items } = await window.hub.backup.list();
      dirLabel.textContent = dir;
      list.replaceChildren(...(items.length ? items.map((b) => el('div', { class: 'download-row' },
        el('span', { class: 'dl-name', text: b.name }), el('span', { class: 'hint', text: `${fmtBytes(b.size)} · ${timeAgo(b.mtime)}` }),
        el('button', { type: 'button', class: 'ghost small', text: 'Restore…', on: { click: async () => { await restoreBackup(b.path); } } }),
        el('button', { type: 'button', class: 'ghost small', text: 'Show', on: { click: () => window.hub.fs.reveal(b.path) } })))
        : [el('p', { class: 'hint', text: 'No backups in this folder yet.' })]));
    };
    dlg.append(el('form', { method: 'dialog' }, el('h2', { text: 'Backups' }),
      el('p', { class: 'hint' }, 'Chats, notes, prompts, memory, tool data, settings and theme (never website logins). Folder: ', dirLabel, ' ',
        el('button', { type: 'button', class: 'ghost small', text: 'Change…', on: { click: async () => { const f = await window.hub.pickFolder(dirLabel.textContent, 'Backup folder'); if (f) { H.config.settings = { ...H.config.settings, backupDir: f }; await saveConfig(); setTimeout(paint, 300); } } } })),
      list,
      el('div', { class: 'dialog-actions' },
        el('button', { type: 'button', class: 'primary small', text: 'Back up now', on: { click: async () => { await backupNow(); paint(); } } }),
        el('button', { type: 'button', class: 'ghost small', text: 'Save a copy as…', on: { click: exportData } }),
        el('button', { type: 'button', class: 'ghost small', text: 'Restore from a file…', on: { click: () => restoreBackup() } }),
        // (round 43, scenesafe → datasafe) 🛟 Recover…: lost chats, memory lines, settings, tool data and Lab scenes from
        // backups and every other copy, added next to yours (datasafe.js; the Lab scenes row opens tools/three-scenesafe.js)
        el('button', { type: 'button', class: 'ghost small', text: 'Recover…', title: 'Lost chats, memory, settings, tool data and Lab scenes from backups, automatic copies or sync, added next to yours', on: { click: async () => { dlg.close(); try { if (!window.DataSafe && window.Lazy) await window.Lazy.load('datasafe'); await window.DataSafe?.recover(); } catch (err) { toast(err.message, { type: 'error' }); } } } }),
        el('label', { class: 'hint' }, 'Auto ', auto),
        el('span', { class: 'spacer' }), el('button', { type: 'submit', text: 'Close' }))));
    dlg.addEventListener('close', () => dlg.remove());
    document.body.append(dlg);
    await paint();
    dlg.showModal();
    return dlg;
  }

  // ---------- usage stats ----------
  async function usageDialog() {
    if (typeof Meter !== 'undefined') return Meter.dashboard(); // the token meter's dashboard replaces this list
    const usage = await window.hub.getUsage();
    const days = Object.keys(usage).sort().reverse().slice(0, 14);
    const agents = [...new Set(days.flatMap((d) => Object.keys(usage[d])))];
    const totals = Object.fromEntries(agents.map((a) => [a, days.reduce((s, d) => s + (usage[d][a]?.input || 0) + (usage[d][a]?.output || 0), 0)]));
    const max = Math.max(1, ...days.map((d) => agents.reduce((s, a) => s + (usage[d][a]?.input || 0) + (usage[d][a]?.output || 0), 0)));
    const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
    const body = el('div', { class: 'usage' },
      el('div', { class: 'usage-totals' }, agents.length ? agents.map((a) => el('div', { class: 'usage-total' },
        el('span', { class: 'dot', style: { background: H.agent(a)?.color || 'var(--accent)' } }),
        el('b', { text: H.agent(a)?.name || a }), el('span', { text: `${fmt(totals[a])} tokens · ${days.reduce((s, d) => s + (usage[d][a]?.replies || 0), 0)} replies (14 days)` }))) : el('p', { class: 'hint', text: 'No native replies recorded yet.' })),
      el('div', { class: 'usage-chart' }, days.map((d) => el('div', { class: 'usage-row' },
        el('span', { class: 'usage-day', text: new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) }),
        el('div', { class: 'usage-bar' }, agents.map((a) => {
          const v = (usage[d][a]?.input || 0) + (usage[d][a]?.output || 0);
          return v ? el('span', { title: `${H.agent(a)?.name || a}: ${fmt(v)} tokens`, style: { width: `${(v / max) * 100}%`, background: H.agent(a)?.color || 'var(--accent)' } }) : null;
        })),
        el('span', { class: 'usage-val', text: fmt(agents.reduce((s, a) => s + (usage[d][a]?.input || 0) + (usage[d][a]?.output || 0), 0)) })))));
    Modal.confirm('Token usage', '').then(() => {});
    const dlg = document.querySelector('dialog.ui-modal:last-of-type');
    dlg.querySelector('.modal-text').replaceWith(body);
    dlg.querySelector('.dialog-actions button[type=button]')?.remove();
  }

  return { openSettings, downloadsDialog, trashDialog, backupsDialog, restoreBackup, usageDialog };
})();
