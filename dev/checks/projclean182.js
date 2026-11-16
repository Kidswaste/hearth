// (round 182, projclean182) The clean Projects screen, in the window (throwaway data; fake engines):
//   1. the cards: a cover, a name, one line; Games · Music · Videos with counts; the project last worked on is the wide
//      Continue card; a project whose scenes are all old-format sits under "Older version", not with the others
//   2. a tab shows only its kind; a pin puts a project first; the one line can be written from the card
//   3. the project menu: What it is going to be, Kind, Series, Pinned, Move to / back from "Older version"
//   4. what could come next: follow-ups of the last project and a different series; a click opens the new-project card
//      with the kind picked, the name and the line filled in, and the series named
//   5. the new-project card keeps games, music and videos apart (a kind shows only its starts), and Create makes a
//      project of that kind, with its line and its series
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/projclean182.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000, every = 100) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { info: {} }; const fail = [];
const ok = (c, m, info) => { if (!c) fail.push(info === undefined ? m : `${m} (${JSON.stringify(info).slice(0, 400)})`); return Boolean(c); };
try {
  await Lazy.load('projects'); await Projects.ready();
  ok(typeof ProjKindCore !== 'undefined', 'the projects group has ProjKindCore');
  // two scenes on disk: one made for the old player, one v2 (the Lab isn't loaded: the screen reads their formats)
  await window.hub.kvSet('three-sketches', [{ id: 'sk-old', name: 'Old scene', code: '', layers: [], updatedAt: 1 }, { id: 'sk-new', name: 'New scene', format: 'gpu', code: '', layers: [], updatedAt: 2 }]);
  dispatchEvent(new Event('hearth:sketch')); // (the scene list read at start is let go)
  const mk = (name, ws, extra = {}) => { const p = Projects.create({ name }); p.workspace = { v: 1, ...ws }; Object.assign(p, extra); return p; };
  const game = mk('Clink', { kind: 'game', sceneId: 'sk-new' }, { updated: Date.now() - 5000, pitch: 'A coin game that never stops.' });
  const music = mk('Night Drive', { start: 'visualizer', sceneId: 'sk-new' }, { updated: Date.now() - 3000, series: 'Night' });
  const video = mk('Harbor Film', { kind: 'video', sceneId: 'sk-new' }, { updated: Date.now() - 1000 });
  const old = mk('Stoop Ronin', { kind: 'music', sceneId: 'sk-old' }, { updated: Date.now() - 100 });
  video.workspace.boardId = 'bd-harbor';
  const earlier = Projects.get('pj-earlier-chats') || (() => { const p = Projects.create({ id: 'pj-earlier-chats', name: 'Earlier chats' }); return p; })();
  earlier.workspace = { v: 1, sceneId: 'sk-old' }; earlier.updated = Date.now() + 60000;
  // the last project's plan and its moodboard's mood, as their stores keep them
  await window.hub.kvSet('project-briefs', { v: 1, list: [{ id: video.id, brief: { mood: 'storm', steps: ['Block the harbor in fog', 'Light the one lamp', 'Cut on the thunder'] }, done: [0] }] });
  await window.hub.kvSet('mood-reads', { v: 1, list: [{ id: 'bd-harbor', items: {}, board: { mood: 'Cold light giving up at the edges' } }] });
  await Projects.flush();
  Projects.changed?.(null, 'check');
  await ProjectWorkspace.home();
  const root = await until(() => document.querySelector('.pj-home.pj-clean .pj-bar')?.closest('.pj-home'));
  ok(root, 'the clean Projects screen is up');
  const cards = () => [...root.querySelectorAll('.pj-home-body > .pj-card, .pj-home-body > .pj-grid > .pj-card')];
  const names = () => cards().map((c) => c.querySelector('.pj-name')?.textContent);
  const tab = (k) => root.querySelector(`.pj-tab[data-kind="${k}"]`);

  // ---------- 1. the cards ----------
  await until(() => names().length === 4 && root.querySelector('.pj-older'));
  ok(names().join() === 'Harbor Film,Night Drive,Clink,Earlier chats', 'the three current projects, the last worked on first', names());
  ok(cards()[0].classList.contains('pj-feature') && /Continue/.test(cards()[0].querySelector('.pj-eyebrow')?.textContent || ''), 'the project last worked on is the wide Continue card');
  ok(tab('all')?.querySelector('i').textContent === '3' && tab('game')?.querySelector('i').textContent === '1' && tab('music')?.querySelector('i').textContent === '1' && tab('video')?.querySelector('i').textContent === '1', 'Games · Music · Videos count the current projects', [...root.querySelectorAll('.pj-tab')].map((b) => b.textContent));
  const olderBox = root.querySelector('.pj-older');
  ok(/Older version · 1/.test(olderBox?.querySelector('summary')?.textContent || '') && !olderBox.open && !names().includes('Stoop Ronin'), 'the old-player project is folded under “Older version”, closed', olderBox?.querySelector('summary')?.textContent);
  olderBox.open = true; olderBox.dispatchEvent(new Event('toggle'));
  ok(await until(() => olderBox.querySelector('.pj-card .pj-name')?.textContent === 'Stoop Ronin'), 'opened, it shows the project');
  const clink = () => root.querySelector(`.pj-card[data-project="${game.id}"]`);
  ok(clink().querySelector('.pj-card-description')?.textContent === 'A coin game that never stops.' && /Game/.test(clink().querySelector('.pj-kind')?.textContent || '') && !clink().querySelector('.pj-meta') && !clink().querySelector('.pj-continue'), 'a card: its line and its kind, no counts and no chips', clink().textContent);
  ok(/Music/.test(root.querySelector(`.pj-card[data-project="${music.id}"] .pj-kind`)?.textContent || '') && root.querySelector(`.pj-card[data-project="${music.id}"] .pj-series`)?.textContent === 'Night', 'a visualizer start reads as Music; the series shows');
  ok(await until(() => /Next step\s*Light the one lamp/.test(cards()[0].querySelector('.pj-upnext')?.textContent || '') && /Mood\s*Cold light giving up/.test(cards()[0].querySelector('.pj-upnext').textContent)), 'the Continue card says the plan\'s next step and the moodboard\'s mood', cards()[0].querySelector('.pj-upnext')?.textContent);
  const earlierCard = root.querySelector('.pj-card[data-project="pj-earlier-chats"]');
  ok(earlierCard && !earlierCard.classList.contains('pj-feature') && !earlierCard.closest('.pj-older') && [...root.querySelectorAll('.pj-home-body > .pj-grid > .pj-card')].at(-1) === earlierCard, '“Earlier chats” is last: never the Continue card, never folded away');
  ok(!root.querySelector('.pw-gallery-hero'), 'no hero banner unless the animated front page is on');

  // ---------- 2. a tab, a pin, the line ----------
  tab('game').click();
  ok(await until(() => names().join() === 'Clink'), 'Games shows only the game', names());
  ok(!root.querySelector('.pj-older') , 'and no old game to fold');
  tab('music').click();
  ok(await until(() => names().join() === 'Night Drive' && /Older version · 1/.test(root.querySelector('.pj-older summary')?.textContent || '')), 'Music shows the music project, the old one folded', names());
  tab('all').click();
  await until(() => names().length === 4);
  { const dt = new DataTransfer(); const c = root.querySelector(`.pj-card[data-project="${music.id}"]`);
    c.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    tab('video').dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    tab('video').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    ok(await until(() => ProjKindCore.kindOf(Projects.get(music.id)) === 'video'), 'a card dropped on Videos becomes a video', Projects.get(music.id).workspace);
    Projects.setWorkspace(Projects.get(music.id), { kind: 'music' }); await until(() => tab('music')?.querySelector('i').textContent === '1'); }
  Projects.setField(game, 'pin', true);
  ok(await until(() => clink()?.querySelector('.pj-pin') && cards()[0].classList.contains('pj-feature') && names()[0] !== 'Clink' && names()[1] === 'Clink'), 'a pinned project comes first (after Continue, which stays) and shows ★', names());
  const add = root.querySelector(`.pj-card[data-project="${video.id}"] .pj-pitch-add`);
  ok(add && /going to be/.test(add.textContent), 'a project with no line offers to write it');
  Projects.setField(video, 'pitch', 'One harbor, one storm, twenty seconds.');
  ok(await until(() => root.querySelector(`.pj-card[data-project="${video.id}"] p.pj-card-description`)?.textContent === 'One harbor, one storm, twenty seconds.'), 'written, it shows on the card');

  // ---------- 3. the project menu ----------
  await Lazy.load('projmenu');
  const rows = ProjectMenu.items(old);
  const row = (id) => rows.find((r) => r && r.id === id);
  ok(['pitch', 'kind', 'series', 'pin', 'shelf'].every(row), 'the menu has What it is going to be, Kind, Series, Pinned and the shelf', rows.filter((r) => r?.id).map((r) => r.id));
  ok(/Move back/.test(row('shelf').label), 'an old-player project can be moved back', row('shelf')?.label);
  await row('shelf').action();
  ok(await until(() => names().includes('Stoop Ronin') && !root.querySelector('.pj-older')), 'moved back: it is with the current projects', names());
  const rows2 = ProjectMenu.items(old);
  ok(/Older version/.test(rows2.find((r) => r?.id === 'shelf').label), 'and can be folded away again');
  Projects.setField(old, 'shelf', null);
  await until(() => root.querySelector('.pj-older'));
  const kindRows = row('kind').items();
  await kindRows.find((r) => /Video/.test(r.label)).action();
  ok(ProjKindCore.kindOf(Projects.get(old.id)) === 'video', 'Kind changes what the project is');

  // ---------- 4. what could come next ----------
  const next = await until(() => root.querySelector('.pj-next'));
  const ideas = [...(next?.querySelectorAll('.pj-idea') || [])];
  ok(next && ideas.length >= 5 && /After “Harbor Film”/.test(next.textContent) && /A different series/.test(next.textContent), 'follow-ups of the last project, and a different series', next?.textContent.slice(0, 300));
  await Lazy.load('projcreate');
  ideas[0].click();
  const wiz = await until(() => document.querySelector('dialog.pcw[open]'));
  ok(wiz && wiz.querySelector('.pcw-kind.on')?.dataset.kind === 'video' && wiz.querySelector('input[aria-label="Project name"]').value === 'Harbor Film II' && /What happens after Harbor Film/.test(wiz.querySelector('textarea').value) && /series “Harbor Film”/.test(wiz.querySelector('.pcw-series')?.textContent || ''), 'a follow-up opens the new-project card filled in: kind, name, line, series', wiz && { kind: wiz.querySelector('.pcw-kind.on')?.dataset.kind, name: wiz.querySelector('input').value });

  // ---------- 5. games, music and videos apart at creation ----------
  const chips = () => [...wiz.querySelectorAll('[aria-label="Start from"] .pcw-chip')].map((b) => b.textContent);
  ok(!chips().some((t) => /Game|Audio visualizer/.test(t)) && chips().some((t) => /Footage/.test(t)), 'Video offers video starts only', chips());
  wiz.querySelector('.pcw-kind[data-kind="game"]').click();
  ok(await until(() => chips().some((t) => /Game/.test(t)) && !chips().some((t) => /Audio visualizer|Footage|Particles/.test(t))), 'Game offers the game starts only', chips());
  ok(wiz.querySelector('.pcw-chip.on') && /Game/.test(wiz.querySelector('[aria-label="Start from"] .pcw-chip.on')?.textContent || ''), 'and starts from the Game start');
  wiz.querySelector('.pcw-kind[data-kind="music"]').click();
  ok(await until(() => chips().some((t) => /Audio visualizer/.test(t)) && !chips().some((t) => /🎮|Footage/.test(t))), 'Music offers the music starts only', chips());
  wiz.querySelector('.pcw-kind[data-kind="music"]').click();
  ok(await until(() => chips().some((t) => /🎮/.test(t)) && chips().some((t) => /Footage/.test(t))), 'no kind picked: every start, as before');
  wiz.querySelector('.pcw-kind[data-kind="game"]').click();
  wiz.querySelector('input[aria-label="Project name"]').value = 'Harbor Run';
  wiz.querySelector('form').requestSubmit();
  const made = await until(() => Projects.live().find((p) => p.name === 'Harbor Run' && p.workspace?.sceneId && ProjCreate.last?.made?.id === p.id), 90000, 250);
  ok(made && made.workspace.kind === 'game' && /What happens after Harbor Film/.test(made.pitch || '') && made.series === 'Harbor Film', 'Create makes a game, with its line and its series', made && { kind: made.workspace?.kind, pitch: made.pitch, series: made.series });
  out.info.steps = ProjCreate.last?.steps;
  await wait(1500);
  await ProjectWorkspace.home().catch(() => {});
  await until(() => document.querySelector('.pj-home.pj-clean .pj-bar'), 8000);
  await wait(600);
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
