// Simplify, part 3 (round 33, simplify3): what every always-visible surface shows at first sight, counted the way
// dev/checks/simplify2.js does (visible buttons, selects, inputs, summaries, links; one shown only while you point
// at its area doesn't count), plus the length of the ⋯ menus and of ⋯ AI setup (open sections, its height).
// Fails when AI setup doesn't read top to bottom as who → personality → instructions → what it can use → how hard
// it thinks → the rest, when a long section isn't folded with a one-line summary, when a fold loses its contents,
// or when an always-visible surface shows jargon (MCP, sandbox_mode, effort).
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/simplify3.js
// Set window.SIMPLIFY_SHOTS = '/dir' (via --eval) to keep a picture of each surface.
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const SEL = 'button, select, input:not([type=hidden]), textarea, summary, a[href], [role=button]';
const vis = (n) => Boolean(n) && n.checkVisibility?.({ visibilityProperty: true }) && n.getBoundingClientRect().width > 0 && n.getBoundingClientRect().height > 0;
const count = (root, skip) => (root ? [...root.querySelectorAll(SEL)].filter((n) => vis(n) && !(skip && n.closest(skip))).length : 0);
const names = (root, skip) => (root ? [...root.querySelectorAll(SEL)].filter((n) => vis(n) && !(skip && n.closest(skip))).map((n) => (n.textContent || n.getAttribute('aria-label') || n.title || n.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 16)) : []);
// jargon the owner shouldn't meet on screen (words, tooltips, placeholders)
const JARGON = /\bMCP\b|sandbox_mode|\beffort\b|\bstdio\b|\bJSONL?\b/i;
const jargon = (root) => {
  if (!root) return [];
  const out = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) if (JARGON.test(t.textContent) && vis(t.parentElement)) out.push(t.textContent.trim().slice(0, 60));
  for (const n of root.querySelectorAll('[title], [placeholder]')) for (const a of ['title', 'placeholder']) { const v = n.getAttribute(a); if (v && JARGON.test(v) && vis(n)) out.push(`${a}: ${v.slice(0, 60)}`); }
  return out;
};
const shot = async (name) => { if (window.SIMPLIFY_SHOTS) await smoke({ shot: `${window.SIMPLIFY_SHOTS}/${name}.png` }); };
const menuRows = () => [...document.querySelectorAll('#menu:not([hidden]) > button, .mb-menu.lab-pop .menu-item')].filter(vis).map((b) => b.textContent.trim().replace(/\s+/g, ' ').slice(0, 24));
const closeMenus = () => { hideMenu(); document.querySelectorAll('.mb-menu.lab-pop').forEach((m) => m.remove()); };
const claude = H.claudeAgent();
const rows = {};
const lists = {};
const fails = [];
const seenJargon = [];
const put = (k, root, skip) => { rows[k] = count(root, skip); lists[k] = names(root, skip).join(' | ').slice(0, 200); seenJargon.push(...jargon(root).map((j) => `${k}: ${j}`)); };

// ---------- the chat ----------
activate(claude.id); await wait(600);
document.querySelectorAll('.qs-card').forEach((c) => c.querySelector('.qs-x, button[title^="Close"]')?.click());
const v = Native.view(claude.id);
put('rail', document.getElementById('rail'), '#agent-buttons');
put('chat header', v.root.querySelector('.native-head'));
put('composer row', v.root.querySelector('form.composer'));
put('empty chat', v.root.querySelector('.messages'));
await shot('chat');
v.root.querySelector('.native-head button[title]')?.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 60 })); await wait(200);
lists['chat ⋯ menu (right-click)'] = menuRows().join(' | '); rows['chat ⋯ menu (right-click)'] = menuRows().length;
await shot('chat-menu'); closeMenus(); await wait(100);
// the composer's right-click (Work with Astra etc.)
v.form.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 400, clientY: 600 })); await wait(200); // around the text box (the box keeps cut / copy / paste)
lists['composer right-click'] = menuRows().join(' | '); rows['composer right-click'] = menuRows().length; closeMenus();
// no command names in the chat's menus
const slashRows = ['chat ⋯ menu (right-click)', 'composer right-click'].flatMap((k) => (lists[k] || '').split(' | ').filter((t) => /(^|[^\w/.])\/[a-z][a-z-]{2,}/.test(t)));
if (slashRows.length) fails.push(`menus show /commands: ${slashRows.join(' | ')}`);
// ◎ Missions
const ms = [...v.root.querySelectorAll('form.composer button')].find((b) => b.textContent.trim() === '◎');
ms?.click(); await wait(400);
const pick = [...document.querySelectorAll('.ms-pop, .ms-picker, .missions-pop')].find(vis);
put('◎ missions picker', pick);
await shot('missions'); if (pick) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); ms?.click(); } closeMenus(); await wait(200);
document.querySelectorAll('.ms-pop, .ms-picker, .missions-pop').forEach((p) => vis(p) && p.remove());

// a reply, then the message ⋯ menu
v.input.value = 'hello there'; v.form.requestSubmit();
await until(() => v.root.querySelector('.msg.assistant .msg-foot') && !Native.isBusy(Native.chatOf(claude.id)?.id), 15000);
await wait(400);
put('message actions (reply)', v.root.querySelector('.msg.assistant .msg-foot'), '.tok-badge, .mt-badge, .msg-badge');
v.root.querySelector('.msg.assistant .msg-more')?.click(); await wait(200);
lists['message ⋯ menu'] = menuRows().join(' | '); rows['message ⋯ menu'] = menuRows().length; closeMenus();

// ---------- ⋯ AI setup ----------
await Lazy.load('options');
Options.open({ agentId: claude.id });
const S = await until(() => document.querySelector('aside.opt-sheet'));
await until(() => S.querySelector('.cn-box, .opt-conns > *'), 4000); await wait(600);
put('AI setup', S);
const secs = [...S.querySelectorAll('.opt-sec')];
const title = (s) => (s.querySelector('.opt-h')?.textContent || '').trim();
const order = secs.map(title);
rows['AI setup sections'] = secs.length;
rows['AI setup sections open'] = secs.filter((s) => s.tagName !== 'DETAILS' || s.open).length;
rows['AI setup height (px)'] = Math.round(S.querySelector('.opt-body')?.scrollHeight || 0);
lists['AI setup sections'] = order.join(' → ');
await shot('aisetup');
const firstOf = (re) => order.findIndex((t) => re.test(t));
const want = [/^Personality/, /^Instructions/, /^What it can use/, /^How hard it thinks/];
const idx = want.map(firstOf);
if (idx.some((i) => i < 0) || idx.some((i, k) => k && i < idx[k - 1])) fails.push(`AI setup order: ${order.join(' → ')}`);
if (!S.querySelector('.opt-who')) fails.push('AI setup: no "who" chips on top');
else if (S.querySelector('.opt-who').compareDocumentPosition(secs[0]) & Node.DOCUMENT_POSITION_PRECEDING) fails.push('AI setup: who is not first');
// the long ones fold, each with a one-line summary of where it stands
const long = secs.filter((s) => s.tagName === 'DETAILS');
const unsummed = long.filter((s) => !(s.querySelector(':scope > summary .opt-sum')?.textContent || '').trim()).map(title);
if (long.length < 3) fails.push(`AI setup folds only ${long.length} sections`);
if (unsummed.length) fails.push(`folded without a summary: ${unsummed.join(', ')}`);
const shown = (n) => vis(n);
// what it can use: files, tools, connections, hooks all inside
const use = secs.find((s) => /^What it can use/.test(title(s)));
const inUse = { files: Boolean(use?.querySelector('.access-ai')), tools: [...(use?.querySelectorAll('.opt-label') || [])].some((l) => l.textContent === 'Mood board'), connections: Boolean(use?.querySelector('.opt-conns')), hooks: Boolean(use?.querySelector('.hk-sec')) };
if (Object.values(inUse).some((x) => !x)) fails.push(`What it can use lacks: ${Object.entries(inUse).filter(([, x]) => !x).map(([k]) => k).join(', ')}`);
// open every fold: nothing was lost (personality, instructions, missions, memory, habits, spending, Check this AI)
for (const d of long) d.open = true;
await wait(300);
rows['AI setup (all open)'] = count(S);
const all = S.textContent;
const kept = ['Remembers things you tell it', 'Suggests what to do next', 'Shrinks long chats by itself', 'Check this AI', 'Mood board', 'Connected apps'].filter((t) => !all.includes(t));
if (kept.length) fails.push(`AI setup lost: ${kept.join(', ')}`);
if (!S.querySelector('.ms-grid')) fails.push('AI setup lost the missions');
if (!S.querySelector('.bud-sec')) fails.push('AI setup lost Spending');
seenJargon.push(...jargon(S).map((j) => `AI setup (open): ${j}`));
await shot('aisetup-open');
for (const d of long) d.open = false;
Options.hide(); await wait(200);

// ---------- Settings ----------
AppUI.openSettings(); await wait(800);
const dlg = document.querySelector('dialog.settings-dialog');
put('Settings', dlg);
await shot('settings');
dlg?.close(); await wait(200);

// ---------- the Lab ----------
activate('tool:three'); await wait(3500);
document.querySelectorAll('.qs-card').forEach((c) => c.querySelector('.qs-x, button[title^="Close"]')?.click());
const L = H.surfaces.get('tool:three')?.el;
put('Lab toolbar', [...(L?.querySelectorAll('.three-toolbar') || [])].find(vis));
await shot('lab');
[...(L?.querySelectorAll('[data-feature="Lab more"]') || [])].find(vis)?.click(); await wait(250);
lists['Lab ⋯ menu'] = menuRows().join(' | '); rows['Lab ⋯ menu'] = menuRows().length; closeMenus();
activate(claude.id); await wait(200);

const uniq = [...new Set(seenJargon)];
if (uniq.length) fails.push(`jargon on screen: ${uniq.slice(0, 5).join(' | ')}`);
const width = Math.max(...Object.keys(rows).map((k) => k.length));
return `SIMPLIFY3\n${Object.entries(rows).map(([k, n]) => `${k.padEnd(width)}  ${String(n).padStart(4)}   ${(lists[k] || '').slice(0, 150)}`).join('\n')}\nAI setup: ${lists['AI setup sections']}\n${fails.length ? `FAIL: ${fails.join('\nFAIL: ')}` : 'PASS'}\n${JSON.stringify(rows)}`;
