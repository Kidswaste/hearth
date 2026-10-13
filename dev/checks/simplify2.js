// Simplify, part 2 (round 27, simplify2): what each main surface shows at first sight, and where a "/command" is
// still visible outside the Lab. Counted like dev/checks/clutter.js (visible buttons, selects, inputs, summaries,
// links; one shown only while you point at its area doesn't count). Fails when Settings shows a /command, has more
// than 5 open sections, or a row without an explanation on hover; or when the keys sheet / command bar / Discover
// tips still show a /command.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/simplify2.js
// Set window.SIMPLIFY_SHOTS = '/dir' (via --eval) to keep a picture of each surface.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SEL = 'button, select, input:not([type=hidden]), textarea, summary, a[href], [role=button]';
const vis = (n) => Boolean(n) && n.checkVisibility?.({ visibilityProperty: true }) && n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height > 0;
const count = (root, skip) => (root ? [...root.querySelectorAll(SEL)].filter((n) => vis(n) && !(skip && n.closest(skip))).length : 0);
// a visible "/command" in text, a tooltip or a placeholder (paths like a/b and fractions like 1/2 don't count)
const CMD = /(^|[\s(“"'·:])\/[a-z][a-z-]{2,}/;
const slashes = (root) => {
  if (!root) return [];
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) if (CMD.test(t.textContent) && vis(t.parentElement)) out.push(t.textContent.trim().slice(0, 60));
  for (const n of root.querySelectorAll('[title], [placeholder]')) for (const a of ['title', 'placeholder']) { const v = n.getAttribute(a); if (v && CMD.test(v) && vis(n)) out.push(`${a}: ${v.slice(0, 60)}`); }
  return out;
};
const shot = async (name) => { if (window.SIMPLIFY_SHOTS) await smoke({ shot: `${window.SIMPLIFY_SHOTS}/${name}.png` }); };
const claude = H.claudeAgent();
const rows = {};
const fails = [];

activate(claude.id); await wait(500);
const v = Native.view(claude.id);
rows.rail = count(document.getElementById('rail'), '#agent-buttons');
rows['chat list panel'] = count(document.getElementById('panel'), '.chat-item, .item');
rows['chat header'] = count(v.root.querySelector('.native-head'));
rows['chat box row'] = count(v.root.querySelector('form.composer'));
await shot('chat');

// Settings: open controls, sections, folded rows, explanations, /commands
AppUI.openSettings(); await wait(800);
const dlg = document.querySelector('dialog.settings-dialog');
const form = dlg?.querySelector('form');
const openSecs = [...(form?.querySelectorAll('.settings-section') || [])].filter(vis);
const allSecs = [...(form?.querySelectorAll('.settings-section') || [])];
rows.settings = count(dlg);
rows['settings sections (open)'] = openSecs.length;
const explained = (r) => Boolean(r.title || r.querySelector('[title]'));
const bare = openSecs.flatMap((s) => [...s.querySelectorAll(':scope > :not(h3)')].filter((r) => vis(r) && !r.matches('.hint, p') && !explained(r)).map((r) => `${s.querySelector('h3')?.textContent}: ${(r.textContent || '').trim().slice(0, 40)}`));
const sSlash = slashes(dlg);
await shot('settings');
const more = form?.querySelector('details.settings-more');
if (more) { more.open = true; await wait(200); }
rows['settings (Advanced open)'] = count(dlg);
const sSlashAll = slashes(dlg);
await shot('settings-advanced');
const titles = allSecs.map((s) => s.querySelector('h3')?.textContent || '?');
dlg?.close(); await wait(200);
if (sSlashAll.length) fails.push(`Settings shows /commands: ${sSlashAll.slice(0, 4).join(' | ')}`);
if (openSecs.length > 5) fails.push(`Settings has ${openSecs.length} open sections`);
if (bare.length) fails.push(`Settings rows with no hover explanation: ${bare.slice(0, 4).join(' | ')}`);

// the command bar (Ctrl+;)
CmdBar.open(); await wait(300);
const bar = document.querySelector('.cmdbar');
rows['command bar'] = count(bar);
const cSlash = slashes(bar);
await shot('cmdbar');
CmdBar.close(); await wait(150);
if (cSlash.length) fails.push(`command bar shows /commands: ${cSlash.join(' | ')}`);

// the keys sheet
KeysUI.open(); await wait(300);
const ks = document.querySelector('.keys-sheet');
rows['keys sheet (buttons)'] = count(ks, '.ks-row, .ks-body');
const kSlash = slashes(ks);
await shot('keys');
KeysUI.close(); await wait(150);
if (kSlash.length) fails.push(`keys sheet shows /commands: ${kSlash.slice(0, 4).join(' | ')}`);

// Discover tips (their words; the "Try it" button runs the command out of sight)
const tipText = (typeof DiscoverData !== 'undefined' ? DiscoverData.TIPS : []).filter((t) => CMD.test(t.text)).map((t) => t.id);
if (tipText.length) fails.push(`Discover tips with /commands: ${tipText.join(', ')}`);

// menus: the chat ⋯ (right-click) and a chat row
const top = () => [...document.querySelectorAll('#menu > button')].filter(vis).length;
v.root.querySelector('.native-head button[title]')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 60 })); await wait(150);
rows['chat ⋯ menu (right-click)'] = top(); hideMenu();

// the Lab toolbar and the board's bars
activate('tool:three'); await wait(3000);
const L = H.surfaces.get('tool:three')?.el;
rows['lab toolbar'] = count([...(L?.querySelectorAll('.three-toolbar') || [])].find(vis));
activate('tool:board'); await wait(1500);
rows['board bars'] = count(document.querySelector('.bd-root'), '.bd-world');
activate(claude.id); await wait(200);

// what moved out of Settings is one click away in ⋯ AI setup: the AI's tools, and for a Lab director its habits
await Commands.tryRun('/director-setup', claude.id); await wait(1500);
const dir = H.agents().find((a) => a.dock === 'three');
await Lazy.load('options');
Options.open({ agentId: dir?.id }); await wait(500);
const opt = [...document.querySelectorAll('.opt-sheet .opt-label')].map((n) => n.textContent);
Options.hide();
const want = ['Mood board', 'Screenshots and recordings', 'Publishing', 'In the Lab: builds in node graphs', 'In the Lab: shows a progress bar while it builds', 'In the Lab: looks at a picture after each edit'];
const missing = want.filter((w) => !opt.includes(w));
if (!dir) fails.push('no director to set up'); else if (missing.length) fails.push(`AI setup lacks: ${missing.join(', ')}`);

const width = Math.max(...Object.keys(rows).map((k) => k.length));
return `SIMPLIFY2\n${Object.entries(rows).map(([k, n]) => `${k.padEnd(width)}  ${String(n).padStart(3)}`).join('\n')}\nsettings sections: ${titles.join(' · ')}\nsettings /commands (folded closed): ${sSlash.length}, (open): ${sSlashAll.length}; keys sheet: ${kSlash.length}; command bar: ${cSlash.length}; tips: ${tipText.length}\n${fails.length ? `FAIL: ${fails.join('\nFAIL: ')}` : 'PASS'}\n${JSON.stringify(rows)}`;
