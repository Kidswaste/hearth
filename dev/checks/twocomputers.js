// Two computers (round 35): "This computer: …" in Settings → Sync and the sync menu; an AI's folders from "the other
// computer" (a record written into the throwaway config): the one at the same place here is used, the one on another
// disk shows "Pick this folder on this computer" in ⋯ AI setup → Files, ✕ skips it; the welcome note with Check this AI;
// a missing song's "Find this file" note and 🩺's list; /this-computer.
//   node dev/smoke.js --check-timeout 120000 --lib dev/checks/journey-lib.js --script dev/checks/twocomputers.js
const { step, wait, until, click } = J;
await until(() => typeof TwoComputers !== 'undefined' && TwoComputers.me, 10000);
const me = TwoComputers.me;
step('this computer: a stable id and a plain label', Boolean(me?.id && /^(Mac|Windows PC|Linux computer)/.test(me.label)), me?.label);
step('the line', TwoComputers.hereLine() === `This computer: ${me.label}`, TwoComputers.hereLine());

AppUI.openSettings();
await wait(500);
const here = document.querySelector('.settings-dialog .sync-settings .two-here');
step('Settings → Sync shows "This computer"', /^This computer: /.test(here?.textContent || ''), here?.textContent);
document.querySelector('.settings-dialog')?.close();
await wait(200);
step('the sync menu starts with it', Sync.items()[0] === TwoComputers.hereLine(), String(Sync.items()[0]));

// an AI's folders from the other computer
const claude = H.claudeAgent();
const data = (await window.hub.attachmentsDir()).replace(/[\\/]attachments[\\/]?$/, '');
await window.hub.fs.write(`${data}/projects/two-smoke/.keep`, '');
const other = { os: 'win', name: 'OTHER-PC', at: Date.now(), folders: [{ name: 'two-smoke', rel: '@data/projects/two-smoke', on: 'Hearth\'s data folder/projects/two-smoke' }, { name: 'Work', rel: null, on: 'the D: drive' }, { name: 'nowhere', rel: '@home/hearth-two-smoke-missing', on: '~/hearth-two-smoke-missing' }] };
H.agent(claude.id).fileAccess = { level: 'write', folders: [], computers: { 'OTHER-PC-1': other } };
await saveConfig();
await wait(400);
await TwoComputers.reconcile();
await wait(300);
const fa = () => H.agent(claude.id).fileAccess || {};
step('the folder at the same place here is used', (fa().folders || []).some((f) => /two-smoke$/.test(f)), JSON.stringify(fa().folders));
step('nothing else is granted (no guess)', (fa().folders || []).length === 1, JSON.stringify(fa().folders));
step('this computer wrote its own record (no absolute path in it)', Boolean(fa().computers?.[me.id]) && !/"(\/|[A-Z]:\\)/.test(JSON.stringify(fa().computers[me.id])), JSON.stringify(fa().computers?.[me.id]).slice(0, 160));

await Lazy.load('options');
Options.open({ agentId: claude.id });
await until(() => document.querySelector('.two-files'), 6000);
const rows = () => [...document.querySelectorAll('.two-files .two-folder')];
step('AI setup → Files lists the other computer\'s folders', rows().length === 2 && /the D: drive/.test(document.querySelector('.two-files')?.textContent || ''), document.querySelector('.two-files')?.textContent);
step('each with "Pick this folder on this computer"', rows().every((r) => /Pick this folder on this computer/.test(r.textContent)));
await wait(600); // (the row's first paint asks the main side, then paints again)
const fold = document.querySelector('.two-files')?.closest('details');
if (fold && !fold.open) { fold.open = true; await wait(200); }
const skipBtn = rows().find((r) => /nowhere/.test(r.textContent))?.querySelector('.two-skip');
skipBtn?.scrollIntoView({ block: 'center' });
await wait(200);
if (J.shot) await J.shot('two-files');
await click(skipBtn);
await until(() => rows().length === 1, 4000);
step('✕ Not on this computer: gone, and remembered', rows().length === 1 && (fa().computers?.[me.id]?.skip || []).includes('@home/hearth-two-smoke-missing'), JSON.stringify(fa().computers?.[me.id]?.skip));
Options.hide?.();
await wait(200);

// the welcome note (forced: no other computer is synced here)
await TwoComputers.welcome({ force: true });
const note = document.querySelector('.two-welcome');
if (J.shot) await J.shot('two-welcome');
step('the welcome note: folders and Check this AI', Boolean(note) && /Welcome to this computer/.test(note.textContent) && /Pick folders/.test(note.textContent) && /Check Claude/.test(note.textContent), note?.textContent?.slice(0, 200));
step('Sync menu offers what needs a click', Boolean(Sync.items().find((x) => x?.label === 'What needs a click on this computer…')));
await click([...note.querySelectorAll('button')].find((b) => b.textContent === 'Got it'));
step('Got it closes it', !document.querySelector('.two-welcome'));

// a missing song: the calm note with "Find this file", 🩺's list
TwoComputers.missingNote({ path: '/nowhere/two-smoke-song.mp3', retry: () => {} });
await wait(200);
const t = [...document.querySelectorAll('#toasts > *')].find((x) => /two-smoke-song\.mp3 isn't on this computer/.test(x.textContent));
step('missing file: "Find this file"', Boolean(t) && /Find this file/.test(t.textContent), t?.textContent);
step('🩺 Fix my scene can list it', TwoComputers.missingList().some((m) => m.name === 'two-smoke-song.mp3'));
const b = TwoComputers.findButton('/nowhere/x.mp3');
step('the plain button for other places', b.textContent === 'Find this file');

// chat command
H.activate?.(claude.id);
await wait(300);
await Commands.tryRun('/this-computer', claude.id);
await wait(400);
const last = [...(Native.view(claude.id)?.list.querySelectorAll('.msg.note') || [])].pop()?.textContent || '';
step('/this-computer', /This computer: /.test(last) && /Work/.test(last) && /two-smoke-song/.test(last), last.slice(0, 200));

// clean up the throwaway config
H.agent(claude.id).fileAccess = undefined;
await saveConfig();
return J.done();
