// (round 179, moodread179) The mood read in the window, with the fake engines (dev/fake-common.js answers its passes and
// says how many pictures each was given). A throwaway project whose moodboard gets two pictures drawn here:
//   1. nothing without the click: ◐ Mood read on the plan card opens the panel with the cost; no AI pass has run
//   2. produced and stored: a run (the cost question skipped) reads both pictures at full size (the engine really got one
//      file per look), a second look by Astra, then the board; kept in kv 'mood-reads'; the panel shows the board read,
//      each picture's read next to its measured numbers, and the second look
//   3. delivered: three_brief ends with MOOD READ … and the inspiration rule, with no literal "seen" line and no
//      reference's title; the next project brief's prompt carries the read; the brief is stale until then
//   4. refreshed on change: a third picture on the board → the panel says so; a refresh reads only that one + the board
//   5. the owner's corrections lead what the director gets; "This is mine" on a picture names it as the exception
//   6. the copy path: three_references add of a moodboard picture dragged into the chat is refused unless it is marked
//      mine (or asked: true)
// Only the check's own temp data folder (smoke.js); no owner data.
//   node dev/smoke.js --fake-engines --check-timeout 300000 --script dev/checks/moodread179.js
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000, every = 120) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(every); } return null; };
const out = { info: {} }; const fail = [];
const ok = (c, m, info) => { if (!c) fail.push(info === undefined ? m : `${m} (${JSON.stringify(info).slice(0, 400)})`); return Boolean(c); };
try {
  await Lazy.load('projects'); await Projects.ready();
  const claude = H.claudeAgent();
  const p = await ProjectWorkspace.create({ name: 'Mood Tide', agentId: claude.id, plugins: [] });
  await until(() => ProjectWorkspace.current()?.id === p.id && ProjectWorkspace.state().phase === 'ready', 40000);
  await Lazy.load('lab'); await Lazy.load('projectbrief'); await Lazy.load('board');
  ok(typeof MoodRead !== 'undefined' && typeof MoodReadCore !== 'undefined', 'the projectbrief group has MoodRead');
  const bid = p.workspace.boardId; const chatId = p.workspace.chatId;
  ok(bid && await MoodRead.boardIdFor(chatId) === bid, 'the project\'s chat reads the project\'s moodboard', bid);

  // ---------- two pictures drawn here, on the project's board ----------
  const pic = async (name, draw) => { const c = document.createElement('canvas'); c.width = 480; c.height = 320; draw(c.getContext('2d')); return window.hub.board.save(name, c.toDataURL('image/png').split(',')[1]); };
  const warmP = await pic('mr-warm.png', (g) => { g.fillStyle = '#140c08'; g.fillRect(0, 0, 480, 320); g.fillStyle = '#e68c3c'; g.fillRect(40, 180, 200, 120); });
  const coolP = await pic('mr-cool.png', (g) => { g.fillStyle = '#dfe8f5'; g.fillRect(0, 0, 480, 320); g.fillStyle = '#7ab8ff'; g.fillRect(100, 60, 280, 200); });
  const thirdP = await pic('mr-third.png', (g) => { g.fillStyle = '#20c060'; g.fillRect(0, 0, 480, 320); });
  await Board.ready(); await Board.open(bid);
  const bb = Board.current();
  const mk = async (id, title, src) => ({ id, type: 'image', title, src, x: 0, y: 0, w: 240, h: 160, rot: 0, added: Date.now(), sized: true, natural: [480, 320], vibe: await BoardVibe.image(Board.fileUrl(src)) });
  bb.items.push(await mk('mrwarm', 'Warm corner', warmP), await mk('mrcool', 'Pale blue slab', coolP));
  await Board.save(bb, { now: true });

  // ---------- 1. nothing without the click ----------
  await ProjectBrief.open(p.id);
  const card = () => [...document.querySelectorAll(`.pb-card[data-pid="${CSS.escape(p.id)}"]`)].find((n) => n.checkVisibility?.() ?? n.getClientRects().length > 0);
  const moodBtn = await until(() => [...(card()?.querySelectorAll('button') || [])].find((b) => /^◐ Mood read/.test(b.textContent)), 15000);
  ok(moodBtn, 'the plan card has ◐ Mood read');
  moodBtn?.click();
  const panel = await until(() => document.querySelector('dialog.mr-panel[open]'), 10000);
  const cost = await until(() => { const t = panel?.querySelector('.mr-cost')?.textContent || ''; return /tokens in/.test(t) ? t : null; }, 10000);
  ok(panel && /About \d+k? tokens in and \d+k? out, in 9 AI passes over 2 pictures/.test(cost || ''), 'the panel states the cost before anything runs', cost);
  await wait(1200);
  ok(!MoodRead.get(bid) && !MoodRead._.running.size, 'nothing is read without the click');

  // ---------- 2. produced and stored ----------
  const r = await MoodRead.run(bid, { confirm: false });
  out.info.run = { read: r?.read, failed: r?.failed, usage: r?.usage };
  ok(r && r.read === 2 && !r.failed.length, 'both pictures read, nothing failed', out.info.run);
  const e = MoodRead.get(bid);
  ok(/pictures seen: 1/.test(e?.items?.mrwarm?.seen || '') && e.items.mrcool?.feeling && e.items.mrwarm.claims?.key === 'low', 'each look really got the picture file; the read is stored per picture', e?.items?.mrwarm);
  const astra = H.agents().find((a) => a.mode === 'native' && a.engine === 'codex');
  ok(e.items.mrwarm.second?.feeling && (!astra || e.items.mrwarm.second.by === astra.name), 'a second, independent look (Astra when it is there)', e.items.mrwarm.second || e.items.mrwarm.secondError);
  ok(/2 pictures/.test(e.board?.mood || '') && e.board.make?.length, 'the board pass covers both pictures', e.board?.mood);
  const kv = await window.hub.kvGet('mood-reads', null);
  ok(kv?.list?.some((x) => x.id === bid && x.board && Object.keys(x.items).length === 2), 'kept in the mood-reads store');
  const text = await until(() => { const t = document.querySelector('dialog.mr-panel[open] .mr-body')?.textContent || ''; return /ember light held back/.test(t) && /Warm corner/.test(t) ? t : null; }, 10000);
  ok(text && /Measured here: .*The read agrees on \d of 6/.test(text) && /Second look \(/.test(text) && /What the AI saw/.test(text), 'the panel shows the board read, each picture next to its measurements, and the second look', (text || '').slice(0, 300));
  ok(/Contradicts: .*brightness: the read says low, the measurement says high/.test(text || ''), 'a read that contradicts the measurement is flagged (the pale picture read as low-key)', (text || '').match(/Contradicts[^.]*/)?.[0]);

  // ---------- 3. delivered ----------
  const tb = await HubBridge.call('three_brief', {}, { chatId });
  const v = String(tb?.value || '');
  ok(/MOOD READ of the moodboard/.test(v) && /ember light held back/.test(v) && /INSPIRATION, NOT RE-CREATION/.test(v) && /To make new work in this mood/.test(v), 'three_brief ends with the mood read and the inspiration rule', v.slice(-500));
  ok(!/pictures seen|a test picture/.test(v) && !/Warm corner|Pale blue slab/.test(v) && /none goes into the scene as is/.test(v), 'no literal description, no reference\'s title; nothing is marked mine yet');
  const raw = await ProjectBrief._.gather(p.id, {}, { light: true });
  ok(raw.moodRead?.length && /Mood read of the moodboard/.test(ProjectBriefCore.prompt(ProjectBriefCore.inputs(raw))), 'the project brief\'s AI pass is given the read');

  // ---------- 4. refreshed on change ----------
  Board.current().items.push(await mk('mrthird', 'Green field', thirdP));
  await Board.save(Board.current(), { now: true });
  const st = MoodReadCore.stale(MoodRead.get(bid), Board.current().items, '');
  ok(st.add.length === 1 && st.add[0] === 'mrthird', 'a new picture: the read knows what it doesn\'t cover', st);
  ok(/board changed \(1 new or changed\)/.test(String((await HubBridge.call('three_brief', {}, { chatId }))?.value || '')), 'the director is told the read is behind the board');
  const pl = await MoodRead.plan(bid, {});
  ok(pl.todo.length === 1 && pl.est.calls === 5, 'a refresh would read only the new picture (4 passes) + the board', { todo: pl.todo.length, calls: pl.est.calls });
  const at0 = MoodRead.get(bid).items.mrwarm.at;
  const r2 = await MoodRead.run(bid, { confirm: false });
  const e2 = MoodRead.get(bid);
  ok(r2.read === 1 && r2.usage.calls === 5 && e2.items.mrthird?.feeling && e2.items.mrwarm.at === at0 && /3 pictures/.test(e2.board.mood), 'refreshed: one picture read, the old reads kept, the board read again', { read: r2.read, calls: r2.usage.calls, mood: e2.board.mood });
  ok((await MoodRead.plan(bid, {})).est.calls === 0, 'and now it is up to date: nothing to pay');

  // ---------- 5. the owner's words lead; "mine" is the exception ----------
  await MoodRead._.set(bid, { corrections: 'less cosy, more threat' });
  ok(await MoodRead.setMine(bid, 'mrwarm', true) && Board.item('mrwarm')?.footage === true, '"This is mine" marks the picture on the board');
  ok((await MoodRead.plan(bid, {})).est.calls === 0, 'marking a picture mine costs nothing: no picture is read again');
  const v2 = String((await HubBridge.call('three_brief', {}, { chatId }))?.value || '');
  ok(/owner's own words on it.*less cosy, more threat/.test(v2) && /owner's own material.*"Warm corner"/.test(v2) && !/Pale blue slab/.test(v2), 'the corrections lead, and only the owner\'s own picture is named as usable as is', v2.slice(-400));

  // ---------- 6. the copy path ----------
  const att = await BoardDrop._.intoAttachments(coolP, 'Pale blue slab.png');
  const mineAtt = await BoardDrop._.intoAttachments(warmP, 'Warm corner.png');
  await wait(700); // (the drop cache is saved a moment later)
  const no = await MoodRead.refGate(att, {}, { chatId });
  ok(/moodboard reference, not marked as the owner's own/.test(no || ''), 'a moodboard picture dragged into the chat is refused as a scene reference', no);
  ok(await MoodRead.refGate(mineAtt, {}, { chatId }) === null, '…the owner\'s own picture is allowed');
  ok(await MoodRead.refGate(att, { asked: true }, { chatId }) === null, '…and so is one the owner asked for in their message');
  const own = await window.hub.saveAttachment('own-upload.png', (await window.hub.fs.read(thirdP, { encoding: 'base64' })));
  ok(await MoodRead.refGate(own, {}, { chatId }) === null, 'a file the owner attached themselves is not touched by the gate');
  document.querySelector('dialog.mr-panel[open]')?.close();
  out.info.errors = HubBridge.log().filter((x) => x.error).map((x) => `${x.tool}: ${String(x.error).slice(0, 120)}`).slice(-6);
} catch (err) { fail.push(`threw: ${err.stack || err}`); }
out.problems = fail;
out.ok = fail.length === 0;
return JSON.stringify(out, null, 1);
