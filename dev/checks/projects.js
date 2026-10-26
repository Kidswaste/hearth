// Projects (round 23): a project made by hand (/project new: the chat comes along), from a make (automatically: same
// name, mark and color, its rooms in one group), from a suggestion (names + links, no tokens); Home's cards with covers
// and "continue where you left off"; Search everything across chats / scenes / boards / commands with type filters and
// keys; the chats list grouped by project (collapsible, not repeated under agents, ⏷ only one project, grouping off);
// the Lab's sketch picker grouped by project; Ctrl/⌘+Shift+K; then the data on disk.
//   node dev/smoke.js --fake-engines --script dev/checks/projects.js --check-timeout 400000 --shot /tmp/hearth-projects/end.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(120); } return false; };
const out = { steps: [], problems: [] };
const step = (ok, label, extra) => { out.steps.push(`${ok ? '✓' : '✖'} ${label}${extra !== undefined ? ` · ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`); if (!ok) out.problems.push(label); };
const say = async (text, id = H.claudeAgent().id, source = 'code') => { let msg = ''; await Commands.tryRun(text, id, null, { source, say: (t) => { msg = String(t); }, note: (t) => { msg = String(t); }, error: (t) => { msg = `Error: ${t}`; } }); return msg; };
const SHOTS = '/tmp/hearth-projects';
const errs = []; addEventListener('error', (e) => errs.push(e.message));
const claude = H.claudeAgent();
const mkChat = (title, agentId = claude.id, ago = 0) => { const at = Date.now() - ago; const c = { id: `${agentId}-t${Math.random().toString(36).slice(2, 8)}`, agentId, title, createdAt: at, updatedAt: at, session: {}, messages: [{ role: 'user', text: `about ${title}: the moth wings glow`, at }] }; Native.adopt(c, { openIt: false }); return c.id; };

// ---- 0. the group loads on first use (stand-ins first) ----
step(Boolean(Commands.get('project') && Commands.get('everything') && Commands.get('home')), 'the commands are there before the group loads (lazy stand-ins)');
await Lazy.load('projects');
await Projects.ready();
step(typeof ProjectsSearch !== 'undefined' && typeof ProjectsHome !== 'undefined' && Tools.get('home'), 'the projects group loaded: Projects, Search, Home (a rail tool)');

// ---- 1. by hand: /project new (the chat comes along) ----
const c1 = mkChat('Kiln notes');
Native.open(claude.id, c1);
await until(() => H.activeChat[claude.id] === c1, 5000);
const m1 = await say('/project new Kiln Works', claude.id, 'chat');
const kiln = Projects.find('Kiln Works');
step(kiln && kiln.items.some((x) => x.type === 'chat' && x.ref === c1), 'by hand: /project new Kiln Works holds the chat it came from', m1.slice(0, 120));
step(kiln && /^#[0-9a-f]{6}$/i.test(kiln.ident.color) && kiln.ident.glyph, 'it has a mark and color (the makes\' identity)', kiln?.ident);
const c2 = mkChat('Glaze tests');
const m2 = await say('/project add Glaze tests to Kiln Works');
step(kiln.items.some((x) => x.ref === c2), '/project add <chat> to <project>', m2.slice(0, 100));

// ---- 2. from a make: same name, mark, color; its rooms in the project's group ----
const pm = await say('/makes plan a three.js animation that cuts into a video');
const make = Makes.live()[0];
await until(() => Projects.all().some((p) => p.make === make?.id), 8000);
const mp = Projects.all().find((p) => p.make === make?.id);
step(mp && mp.name === make.name && mp.ident.color === make.ident.color && mp.ident.glyph === make.ident.glyph, 'from a make: a project with the make\'s name, mark and color', [mp?.name, make?.name]);
const roomIds = make.parts.map((p) => p.chatId).filter(Boolean);
step(roomIds.length === 2 && roomIds.every((id) => mp.items.some((x) => x.ref === id)), 'its rooms are in it', mp && C_count(mp));
function C_count(p) { return ProjectsCore.countText(p); }
await until(() => mp.items.some((x) => x.type === 'scene'), 15000);
step(mp.items.some((x) => x.type === 'scene'), 'the Lab room\'s scene joined it (chat-scenes link event)', C_count(mp));
Panel.render();
await wait(200);
const pg = document.querySelector(`#chat-groups .pj-group[data-project="${mp.id}"]`);
step(pg && pg.querySelectorAll('.item').length === 2 && !document.querySelector(`#chat-groups .mk-group:not(.pj-group)[data-make="${make.id}"]`), 'the chats list: one group for the make\'s project (no second make group)', pg?.textContent.slice(0, 80));
step(pg && pg.querySelector('.mk-st') && pg.dataset.make === make.id, 'the group keeps the make\'s status (its progress paints there)');

// ---- 3. a suggestion (names, links, timing; no tokens) ----
const sc = [mkChat('Stoop Ronin · characters', claude.id, 3600e3), mkChat('stoop ronin website', claude.id, 7200e3), mkChat('Stoop Ronin script')];
await Lazy.load('lab');
await ThreeLab.cmd({ show: false });
await until(() => ThreeLab.scenes, 15000);
const sk1 = ThreeLab.scenes.create({ name: 'Stoop Ronin intro', code: "const P = tweak({ katana: [1, 0, 4], dusk: '#ff7a1a' });\nscene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshNormalMaterial()));" });
const sk2 = ThreeLab.scenes.create({ name: 'Stoop Ronin rooftop', code: '// rooftop chase\n' });
Projects.forget('sketches');
const ss = await Projects.suggestions(4);
const s0 = ss.find((s) => s.key === 'stoop ronin');
step(s0 && s0.things.filter((t) => t.type === 'chat').length === 3 && s0.things.filter((t) => t.type === 'scene').length === 2, 'suggested: "3 chats and 2 scenes are about “Stoop Ronin”"', s0?.why);
const ms = await say('/project suggest');
step(/Stoop Ronin/.test(ms), '/project suggest lists it', ms.split('\n')[0]);

// ---- 4. Home: cards with covers, suggestions, continue ----
const tiny = (() => { const c = document.createElement('canvas'); c.width = 32; c.height = 18; const g = c.getContext('2d'); g.fillStyle = '#ff7a1a'; g.fillRect(0, 0, 32, 18); return c.toDataURL('image/jpeg', 0.6); })();
const th = (await window.hub.kvGet('three-thumbs', {})) || {};
th[sk1.id] = { url: tiny, at: Date.now() };
await window.hub.kvSet('three-thumbs', th);
Projects.forget('sceneThumbs');
await Projects.openHome();
await until(() => document.querySelector('.pj-home .pj-sugg'), 8000);
const sugg = [...document.querySelectorAll('.pj-home .pj-sugg')].find((n) => /Stoop Ronin/.test(n.textContent));
step(sugg && /make it a project/i.test(sugg.textContent), 'Home shows the suggestion with Make it', sugg?.textContent.slice(0, 120));
await smoke({ shot: `${SHOTS}/1-home-suggestion.png` });
sugg.querySelector('button.primary').click();
await until(() => Projects.find('Stoop Ronin'), 5000);
const ronin = Projects.find('Stoop Ronin');
step(ronin && ronin.from === 'suggest' && ronin.items.length >= 5, 'Make it: a project made from the suggestion', ronin && C_count(ronin));
await until(() => document.querySelector('.pj-home .pj-p-head'), 5000);
step(document.querySelector('.pj-home .pj-p-cover img')?.src.startsWith('data:image'), 'its page has a cover: the scene\'s picture');
// (sweep67) Codex's desk (02895c4 / d6eb475): shelf sections (On your desk, Instruments, Conversations when 2+ chats), the notes
// under "Project notes & setup", and every chat / scene in the lazy "Project files" shelf (the old .pj-sec lists are gone)
step(document.querySelectorAll('.pj-home .pw-shelf-section').length >= 2 && [...document.querySelectorAll('.pj-home .pw-shelf-section h3')].some((h) => /Conversations/.test(h.textContent)) && /Project files · \d+/.test(document.querySelector('.pj-home .pw-project-files summary')?.textContent || '') && document.querySelector('.pj-home .pj-notes'), 'its page lists chats and scenes, with notes');
await smoke({ shot: `${SHOTS}/2-project-page.png` });
ProjectsHome.show(null);
await until(() => document.querySelectorAll('.pj-home .pj-card').length >= 3, 5000);
const cards = [...document.querySelectorAll('.pj-home .pj-card')];
const rc = cards.find((c) => c.dataset.project === ronin.id);
step(cards.length >= 3 && rc?.querySelector('.pj-cover img'), 'Home: one card per project, the cover on its card', cards.length);
step(rc && rc.querySelectorAll('.pj-go').length >= 2, 'continue where you left off: last chat and last scene on the card', [...(rc?.querySelectorAll('.pj-go') || [])].map((b) => b.textContent));
await smoke({ shot: `${SHOTS}/3-home.png` });
const goChat = [...rc.querySelectorAll('.pj-go')].find((b) => /chat$/.test(b.textContent));
goChat.click();
await until(() => H.activeId === claude.id && sc.includes(H.activeChat[claude.id]), 5000);
step(sc.includes(H.activeChat[claude.id]), 'Continue › chat opens the project\'s latest chat', H.chats.find((c) => c.id === H.activeChat[claude.id])?.title);

// ---- 5. Search everything ----
await Lazy.load('board');
await Board.ready();
Board.addNote('Stoop Ronin katana reference: dusk light');
await Board.save(Board.current(), { now: true });
Projects.forget('boards'); ProjectsSearch.fresh();
const r1 = await ProjectsSearch.find('stoop ronin');
const kinds = [...new Set(r1.hits.map((h) => h.type))];
step(['project', 'chat', 'scene'].every((k) => kinds.includes(k)), 'one search finds the project, its chats and its scenes', kinds);
const r2 = await ProjectsSearch.find('katana');
step(r2.hits.some((h) => h.type === 'scene' && h.ref === sk1.id) && r2.hits.some((h) => h.type === 'board' && h.item), 'scene sliders / code and board items are searched', r2.hits.map((h) => `${h.type}:${h.title}`).slice(0, 5));
const r3 = await ProjectsSearch.find('scene: rooftop');
step(r3.filter === 'scene' && r3.hits.length === 1 && r3.hits[0].ref === sk2.id, '"scene:" keeps one kind', r3.hits.map((h) => h.title));
const r4 = await ProjectsSearch.find('everything');
step(r4.hits.some((h) => h.type === 'command' && h.ref === 'everything'), 'commands are searched too');
const ms2 = await ProjectsSearch.messages('moth wings');
step(ms2.length >= 3, 'messages come from the chats\' index (store thread)', ms2.length);
// Ctrl+Shift+K, typing, Tab to a kind, ↓ Enter opens in place
handleShortcut({ key: 'k', shift: true });
await until(() => ProjectsSearch.isOpen(), 5000);
const inp = document.querySelector('.pj-search input');
inp.value = 'stoop'; inp.dispatchEvent(new Event('input'));
await until(() => document.querySelectorAll('.pj-search .pj-result').length >= 4, 5000);
step(document.querySelectorAll('.pj-search .pj-result').length >= 4, 'Ctrl/⌘+Shift+K opens it; results as you type', document.querySelectorAll('.pj-search .pj-result').length);
await smoke({ shot: `${SHOTS}/4-search.png` });
const key = (k, o = {}) => inp.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
key('Tab'); key('Tab'); key('Tab'); // All → Projects → Chats → Scenes
await until(() => document.querySelector('.pj-search .pj-chip.on')?.dataset.f === 'scene' && [...document.querySelectorAll('.pj-search .pj-result')].length, 5000);
const types = [...document.querySelectorAll('.pj-search .pj-result .p-kind')].map((n) => n.textContent);
step(document.querySelector('.pj-search .pj-chip.on')?.dataset.f === 'scene' && types.every((t) => /Scene/.test(t)), 'Tab moves to a kind (Scenes only)', types.slice(0, 3));
key('ArrowDown'); key('ArrowUp'); key('Enter');
await until(() => !ProjectsSearch.isOpen() && [sk1.id, sk2.id].includes(ThreeLab.scenes.currentId()), 15000);
step([sk1.id, sk2.id].includes(ThreeLab.scenes.currentId()), 'Enter opens the scene in the Lab', ThreeLab.scenes.get(ThreeLab.scenes.currentId())?.name);
const eMsg = await say('/everything katana');
step(/Stoop Ronin intro/.test(eMsg), '/everything <words> answers in a chat (code source)', eMsg.split('\n')[0]);

// ---- 6. the chats list ----
Panel.render(); await wait(100);
const rg = document.querySelector(`#chat-groups .pj-group[data-project="${ronin.id}"]`);
step(rg && rg.querySelectorAll('.item').length === 3, 'the chats list groups the project\'s chats under its name and mark', rg?.querySelector('.group-name')?.textContent);
step(!sc.some((id) => document.querySelector(`#chat-groups .group[data-id="${claude.id}"] .item[data-key="${id}"]`)), 'they aren\'t repeated under their agent');
rg.querySelector('.group-toggle').click(); await wait(80);
step(document.querySelector(`#chat-groups .pj-group[data-project="${ronin.id}"]`).querySelectorAll('.item').length === 0, 'the group collapses');
document.querySelector(`#chat-groups .pj-group[data-project="${ronin.id}"] .group-toggle`).click(); await wait(80);
await say(`/project filter ${ronin.name}`);
await wait(80);
const shown = [...document.querySelectorAll('#chat-groups .item')].map((r) => r.dataset.key);
step(shown.length === 3 && sc.every((id) => shown.includes(id)) && /Stoop Ronin/.test(document.querySelector('#chat-groups .panel-view')?.textContent || ''), '⏷ only one project: just its chats, the chip names it', document.querySelector('#chat-groups .panel-view')?.textContent);
await smoke({ shot: `${SHOTS}/5-chats-filtered.png` });
await say('/project filter off');
await say('/project group off');
await wait(80);
step(!document.querySelector('#chat-groups .pj-group'), 'Group by project off: agents only');
await say('/project group on');
await wait(80);
step(Boolean(document.querySelector('#chat-groups .pj-group')), '…and back on');
// the chat's right-click menu has Project ›
const row = document.querySelector(`#chat-groups .item[data-key="${c2}"]`);
row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200 }));
await wait(80);
step([...document.querySelectorAll('#menu .menu-item, #menu button, #menu div')].some((n) => /^Project/.test(n.textContent.trim())), 'right-click a chat › Project');
hideMenu?.();

// ---- 7. the Lab's sketch picker ----
await say('/project add scene to Kiln Works');
ThreeLab.scenes.open(sk2.id); await wait(300); ThreeLab.scenes.open(sk1.id); await wait(300);
const og = [...document.querySelectorAll('optgroup')].map((g) => g.label);
step(og.some((l) => /Stoop Ronin/.test(l)), 'the Lab\'s sketch picker groups scenes by project', og.slice(0, 4));

// ---- 8. on disk, small and mergeable ----
await wait(500);
const disk = await window.hub.kvGet('projects', null);
step(disk && disk.list.length === Projects.all().length && JSON.stringify(disk).length < 20000 && disk.list.every((p) => p.items.every((x) => x.id === `${x.type}:${x.ref}`)), 'kv projects: every project, small (refs, no pictures), items with ids', JSON.stringify(disk).length);
step(!Commands.duplicates().length, 'no duplicate commands', Commands.duplicates().map((d) => d.name));
step(!errs.length, 'no page errors', errs.slice(0, 3));
return JSON.stringify(out, null, 1);
