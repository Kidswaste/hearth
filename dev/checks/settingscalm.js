// settingscalm (round 39): Settings read top to bottom in a few plain sections, one obvious control per row, the
// rest folded with one line saying where it stands. Counts what shows at first sight per section (buttons, selects,
// inputs, summaries, links, the way simplify2 / simplify3 count them) and fails when:
//   · first sight shows more than BUDGET controls or more than 4 open sections (Advanced folded apart)
//   · a visible row or a fold has no one-sentence explanation on hover
//   · a fold has no line about where it stands, or that line doesn't follow a switch flipped inside it
//   · a Settings row Find anything knows (appsearch-data.js + SettingsFind's switches) isn't found in its section
//   · something Settings had before this pass is no longer in it (nothing may end up reachable only by a command)
//   · a "/command" shows anywhere in Settings
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/settingscalm.js --shot /tmp/sc.png
// Set window.SC_SHOTS = '/dir' (via --eval) to keep a picture of first sight and of everything open.
const BUDGET = 19; // 17 with three looks up front; a fourth tile shows while you're on a look that isn't one of them · (round 53, diskcalm) +1: the folded "Space Hearth uses" line in This computer & sync
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const SEL = 'button, select, input:not([type=hidden]), textarea, summary, a[href], [role=button]';
const vis = (n) => Boolean(n) && n.checkVisibility?.({ visibilityProperty: true }) && n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height > 0;
const count = (root) => (root ? [...root.querySelectorAll(SEL)].filter(vis).length : 0);
const CMD = /(^|[\s(“"'·:])\/[a-z][a-z-]{2,}/;
const shot = async (name) => { if (window.SC_SHOTS) await smoke({ shot: `${window.SC_SHOTS}/${name}.png` }); };
const fails = [];
const out = { first: {}, open: {} };
// a top-level part of the form: its title (h3, or the fold's own title)
const nameOf = (n) => (n.querySelector(':scope > summary .sc-title')?.textContent.trim() || n.querySelector(':scope > h3, :scope > summary')?.textContent.trim() || n.className || n.tagName).slice(0, 40);
const parts = (form) => [...form.children].filter((n) => !n.matches('h2') && vis(n));

await wait(1200);
await AppUI.openSettings(); await wait(700);
let dlg = document.querySelector('dialog.settings-dialog[open]');
let form = dlg?.querySelector('form');
if (!form) return 'FAIL: Settings did not open';

// ---------- first sight ----------
out.firstTotal = count(dlg);
for (const p of parts(form)) { const n = count(p); if (n) out.first[nameOf(p)] = n; }
const openSecs = [...form.querySelectorAll('.settings-section')].filter(vis);
out.openSections = openSecs.map((s) => s.querySelector('h3')?.textContent.trim());
out.formHeight = Math.round(form.scrollHeight);
await shot('settings-first');
if (out.firstTotal > BUDGET) fails.push(`first sight shows ${out.firstTotal} controls (budget ${BUDGET})`);
if (openSecs.length > 4) fails.push(`${openSecs.length} open sections at first sight: ${out.openSections.join(', ')}`);

// every row on screen and every fold says what it is on hover (one sentence)
const explained = (r) => Boolean(r.title || r.querySelector('[title]'));
const bare = openSecs.flatMap((s) => [...s.querySelectorAll(':scope > :not(h3)')].filter((r) => vis(r) && !r.matches('.hint, p, .sf-slot') && !explained(r)).map((r) => `${s.querySelector('h3')?.textContent}: ${(r.textContent || '').trim().slice(0, 40)}`));
if (bare.length) fails.push(`rows with no hover explanation: ${bare.slice(0, 4).join(' | ')}`);

// ---------- the folds: each says where it stands, and the line follows a change ----------
const folds = [...form.querySelectorAll('details')].filter((d) => !d.matches('.look-more')); // (Every look: the look picker's own list, inside a fold)
out.folds = folds.map((d) => `${nameOf(d)}: ${d.querySelector(':scope > summary .sc-state')?.textContent.trim() || '(no line)'}`);
const noLine = folds.filter((d) => !d.querySelector(':scope > summary .sc-state')?.textContent.trim()).map(nameOf);
const noTip = folds.filter((d) => !d.querySelector(':scope > summary')?.title).map(nameOf);
if (folds.length < 4) fails.push(`only ${folds.length} folds`);
if (noLine.length) fails.push(`folds without a line about where they stand: ${noLine.join(', ')}`);
if (noTip.length) fails.push(`folds without a hover explanation: ${noTip.join(', ')}`);

// flip the chime (Advanced › Chats): the Chats fold's line changes at once, and back
const chime = [...form.querySelectorAll('.sf-row')].find((r) => /A chime when a reply ends/.test(r.textContent));
const chatsFold = chime?.closest('details.sc-fold');
const before = chatsFold?.querySelector(':scope > summary .sc-state')?.textContent;
const wasOn = store.get('chat.chime', false);
chime?.querySelector(`[data-v="${wasOn ? 'off' : 'on'}"]`)?.click();
const changed = await until(() => chatsFold?.querySelector(':scope > summary .sc-state')?.textContent !== before, 3000);
chime?.querySelector(`[data-v="${wasOn ? 'on' : 'off'}"]`)?.click();
await until(() => store.get('chat.chime', !wasOn) === wasOn, 3000);
out.foldFollows = { before, changed: Boolean(changed) };
if (!changed) fails.push(`the Chats fold's line didn't follow the chime switch (${before})`);

// ---------- everything open ----------
for (const d of form.querySelectorAll('details')) d.open = true;
await wait(250);
out.openTotal = count(dlg);
for (const p of parts(form)) { const n = count(p); if (n) out.open[nameOf(p)] = n; }
if (window.SC_SHOTS) for (let i = 0, y = 0; y < form.scrollHeight && i < 8; i += 1, y += form.clientHeight - 60) { form.scrollTop = y; await wait(120); await shot(`settings-open-${i}`); }
form.scrollTop = 0;
const slash = [];
const w = document.createTreeWalker(dlg, NodeFilter.SHOW_TEXT);
for (let t = w.nextNode(); t; t = w.nextNode()) if (CMD.test(t.textContent) && vis(t.parentElement)) slash.push(t.textContent.trim().slice(0, 50));
for (const n of dlg.querySelectorAll('[title], [placeholder]')) for (const a of ['title', 'placeholder']) { const v = n.getAttribute(a); if (v && CMD.test(v)) slash.push(`${a}: ${v.slice(0, 50)}`); }
if (slash.length) fails.push(`/commands in Settings: ${slash.slice(0, 4).join(' | ')}`);

// nothing Settings had before this pass went missing (moved is fine, gone is not)
const KEPT = ['Match my computer', 'Size of everything', 'Let Astra pick', 'More looks', 'Textures', 'Glow', 'Motion', 'Density', 'Corners', 'Chat font', 'Accent', 'Tooltips', 'Save as…', 'Sparkles when you click',
  'AI setup', 'Look now', 'What\'s new', 'Install updates by themselves', 'Keyboard keys', 'Show / hide Hearth', 'Open on start', 'Desktop notifications', 'Enter sends', 'A chime when a reply ends',
  'running in the tray', 'Start Hearth', 'Unload websites', 'Meshy key', 'The pick-up card', 'Don\'t show tips', 'Weekly tidy', 'Pause every timer', 'English (US)', 'Check this computer',
  'Claude program', 'Codex program', 'Forgeheart project', 'Forgeheart debug build', 'After Effects install', '.aep projects', 'Backups', 'Pack Hearth for a Mac', 'Open data folder', 'Edit config.json', 'Edit theme.css'];
const text = form.textContent;
const gone = KEPT.filter((k) => !text.includes(k));
if (typeof Sync !== 'undefined' && !form.querySelector('.sync-settings')) gone.push('Sync');
if (!form.querySelector('.check-grid input[data-id]')) gone.push('Tools in the rail');
if (gone.length) fails.push(`gone from Settings: ${gone.join(', ')}`);
dlg.close(); await wait(150);

// ---------- every row Find anything knows is in its section ----------
if (window.Lazy && !Lazy.isIn('appsearch')) await Lazy.load('appsearch');
await AppUI.openSettings(); await wait(500);
dlg = document.querySelector('dialog.settings-dialog[open]');
const miss = [];
const rows = [...AppSearchData.SETTINGS];
for (const s of SettingsFind.live()) { const sec = AppSearchData.HOMES[s.home] || s.home; rows.push({ id: `set:sw:${s.cmd}`, sec, find: s.label }); }
for (const r of rows) {
  const n = AppSearch.locateSetting(dlg, r);
  const sec = n?.closest('.settings-section')?.querySelector('h3')?.textContent.trim();
  if (!n || (r.sec && sec !== r.sec)) miss.push(`${r.id} (${sec || 'nowhere'} ≠ ${r.sec})`);
  else if (r.find && !r.sel && !n.textContent.toLowerCase().includes(r.find.toLowerCase().trim())) miss.push(`${r.id} (text)`);
  else if (r.adv !== undefined && Boolean(n.closest('details.settings-more')) !== r.adv) miss.push(`${r.id} (Advanced: ${Boolean(n.closest('details.settings-more'))})`);
}
out.reachable = `${rows.length - miss.length} of ${rows.length}`;
if (miss.length) fails.push(`rows Find anything can't find where it says: ${miss.slice(0, 6).join(', ')}`);
// the Settings search still opens the folds a match is in
const inp = dlg.querySelector('.sf-search');
inp.value = 'chime'; inp.dispatchEvent(new Event('input')); await wait(150);
const hit = [...dlg.querySelectorAll('.sf-row')].find((r) => /chime/i.test(r.textContent));
if (!vis(hit)) fails.push('searching "chime" doesn\'t show its row (its folds stay closed)');
dlg.close();

const fmt = (o) => Object.entries(o).map(([k, n]) => `  ${k.padEnd(34)} ${String(n).padStart(3)}`).join('\n');
return `SETTINGSCALM\nfirst sight: ${out.firstTotal} controls, ${out.openSections.length} open sections (${out.openSections.join(' · ')}), ${out.formHeight} px tall\n${fmt(out.first)}\neverything open: ${out.openTotal}\n${fmt(out.open)}\nfolds:\n  ${out.folds.join('\n  ')}\nreachable: ${out.reachable}\n${fails.length ? `FAIL: ${fails.join('\nFAIL: ')}` : 'PASS'}`;
