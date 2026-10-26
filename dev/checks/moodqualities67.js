// Moodboard qualities (round 67, moodqualities67), in the window: a throwaway board with a measured picture, a second
// one, one the reader hasn't reached yet and one whose file is gone; the board drawer's tiles are dragged into the
// chat box by synthetic drag events:
//   plain drop → a "qualities · …" text (palette hexes, numbers), never the picture; "What I like" written on the tile
//   goes first; Shift+drop and the tile's Picture button → the picture itself (round 65's drop);
//   an unmeasured tile is measured at send time; a missing file says "couldn't be measured" (not an empty block);
//   the distance slider is remembered on the board and "only its spirit" says not to reproduce the subject;
//   two tiles clicked → the mix card with the blended palette, one click sends a "mix · …" text;
//   right-click › Send the actual picture / What I like about this…; /board-ask's question gets the same block.
//   node dev/smoke.js --fake-engines --script dev/checks/moodqualities67.js --shot /tmp/moodqualities67.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(120); } return null; };
const fail = []; const ok = (c, what) => { if (!c) fail.push(what); return Boolean(c); };
const out = {};
const menuRows = () => [...document.querySelectorAll('#menu button')];
const closeMenu = () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); window.hideMenu?.(); };
try {
  if (typeof Board === 'undefined') await Lazy.load('board');
  ok(typeof BoardQualities !== 'undefined', 'the board group has BoardQualities');
  const C = H.claudeAgent();
  activate(C.id);
  await until(() => Native.hasView(C.id));
  Native.newChat?.(C.id);
  const v = Native.view(C.id);

  // ---------- pictures drawn here, saved in the test copy's board folder ----------
  const pic = async (name, draw) => { const c = document.createElement('canvas'); c.width = 240; c.height = 160; draw(c.getContext('2d')); return window.hub.board.save(name, c.toDataURL('image/png').split(',')[1]); };
  const warmP = await pic('mq-warm.png', (g) => { g.fillStyle = '#e68c3c'; g.fillRect(0, 0, 240, 90); g.fillStyle = '#281914'; g.fillRect(0, 90, 240, 70); });
  const coolP = await pic('mq-cool.png', (g) => { g.fillStyle = '#1e2a5a'; g.fillRect(0, 0, 240, 160); g.strokeStyle = '#7ab8ff'; g.lineWidth = 6; for (let r = 10; r < 120; r += 18) { g.beginPath(); g.arc(120, 80, r, 0, 7); g.stroke(); } });
  const lateP = await pic('mq-late.png', (g) => { g.fillStyle = '#20c060'; g.fillRect(0, 0, 240, 160); });
  await Board.ready();
  const b = await Board.create('Mood qualities check', { quiet: true });
  await Board.open(b.id);
  const bb = Board.current();
  const vibeOf = async (p) => { const x = await BoardVibe.image(Board.fileUrl(p)); return x; };
  const mk = (id, title, src, vibe) => ({ id, type: 'image', title, src, x: 0, y: 0, w: 240, h: 160, rot: 0, added: Date.now(), sized: true, natural: [240, 160], ...(vibe ? { vibe } : {}) });
  const warm = mk('mqwarm', 'Warm dusk', warmP, await vibeOf(warmP));
  const cool = mk('mqcool', 'Blue rings', coolP, await vibeOf(coolP));
  const late = mk('mqlate', 'Not read yet', lateP, null);
  const gone = mk('mqgone', 'Missing file', lateP.replace(/mq-late\.png$/, 'mq-gone.png'), null);
  bb.items.push(warm, cool, late, gone);
  await Board.save(bb, { now: true });
  // keep the background reader off the two unmeasured ones: the drop must measure them itself
  ok(BoardQualities.status(late).state === 'measuring' && BoardQualities.status(gone).state === 'measuring', 'two references start unmeasured');

  BoardDrawer.toggle(true);
  await until(() => document.querySelectorAll('.bdd-tile').length >= 4, 8000);
  const tileOf = (it) => [...document.querySelectorAll('.bdd-tile')].find((t) => t.title.split('\n')[0] === it.title);
  const cellOf = (it) => tileOf(it)?.closest('.bdd-cell');
  ok(document.querySelector('.bdd-dist input[type=range]'), 'the distance slider is in the drawer');
  ok(/Close to it/.test(document.querySelector('.bdd-dist')?.textContent || '') && /Only its spirit/.test(document.querySelector('.bdd-dist')?.textContent || ''), 'the slider is labelled at both ends');
  ok(cellOf(warm)?.querySelector('.bdd-like') && /What I like about this/.test(cellOf(warm).querySelector('.bdd-like').textContent), 'each picture tile shows a "What I like about this" line');
  ok(tileOf(warm)?.querySelector('.bdd-pic')?.textContent === 'Picture' && /Qualities/.test(tileOf(warm)?.querySelector('.bdd-send')?.textContent || ''), 'tiles have labelled Qualities and Picture buttons');
  ok(/its qualities/.test(tileOf(warm)?.title || ''), `a tile says what a drag does (${tileOf(warm)?.title})`);

  // ---------- what I like: click the line, type, Enter ----------
  cellOf(warm).querySelector('.bdd-like').click();
  const inp = await until(() => cellOf(warm).querySelector('.bdd-like-in'));
  ok(inp, 'clicking the like line opens a field');
  if (inp) { inp.value = 'the orange band over the dark ground'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
  await wait(300);
  ok(Board.item('mqwarm')?.like === 'the orange band over the dark ground', `the like is stored on the item (${Board.item('mqwarm')?.like})`);

  // ---------- drops ----------
  const drop = async (src, { shiftKey = false } = {}) => {
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }));
    const q = v.input.getBoundingClientRect();
    v.input.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: q.left + 10, clientY: q.top + 10, shiftKey }));
    v.input.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: q.left + 10, clientY: q.top + 10, shiftKey }));
    src.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true }));
  };
  const settle = async (n, ms = 30000) => { await until(() => v.attachments.length >= n, ms); await wait(300); };
  const reset = () => { v.attachments.length = 0; Native.renderChips(C.id); };

  // 1. a plain drop: qualities, like first
  reset(); await drop(tileOf(warm)); await settle(1);
  const t1 = v.attachments[0]?.content || '';
  out.plain = t1.slice(0, 900);
  ok(v.attachments.length === 1 && v.attachments[0].kind === 'text' && /^qualities · /.test(v.attachments[0].name), `plain drop → a qualities text (${v.attachments[0]?.name})`);
  ok(/palette: #[0-9a-f]{6} \d+%/i.test(t1) && /brightness: \d\.\d\d of 1/.test(t1) && /composition:/.test(t1) && /shape language:/.test(t1), 'it carries palette hexes with shares, brightness, composition, shape language');
  ok(t1.indexOf('WHAT I LIKE') > 0 && t1.indexOf('WHAT I LIKE') < t1.indexOf('REFERENCE 1') && t1.includes('the orange band over the dark ground'), 'what I like goes first');
  ok(/NOT sent/.test(t1) && /Vibe only/.test(t1), 'it says the picture was not sent, and keeps the vibe-only rule');

  // 2. Shift+drop and the Picture button: the picture itself
  reset(); await drop(tileOf(warm), { shiftKey: true }); await settle(1);
  ok(v.attachments.length === 1 && v.attachments[0].kind === 'image', `Shift+drop → the picture (${v.attachments[0]?.kind})`);
  reset(); tileOf(cool).querySelector('.bdd-pic').click(); await settle(1);
  ok(v.attachments.length === 1 && v.attachments[0].kind === 'image', 'the tile\'s Picture button → the picture');

  // 3. not measured yet: measured at send time · a missing file: said plainly
  reset(); await drop(tileOf(late)); await settle(1, 40000);
  const t3 = v.attachments[0]?.content || '';
  ok(/palette: #/.test(t3) && !/still being measured/.test(t3) && Board.item('mqlate')?.vibe?.light != null, 'an unmeasured picture is measured when sent');
  reset(); await drop(tileOf(gone)); await settle(1, 40000);
  const t4 = v.attachments[0]?.content || '';
  out.gone = t4.split('\n').find((l) => /couldn't be measured/.test(l));
  ok(/couldn't be measured/.test(t4) && !/palette: #/.test(t4), `a missing file says it couldn't be measured (${out.gone})`);

  // 4. the distance slider: remembered per board; spirit wording
  const range = document.querySelector('.bdd-dist input');
  range.value = '90'; range.dispatchEvent(new Event('input', { bubbles: true })); range.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(200);
  ok(Board.current().qualityDistance === 90 && /only its spirit/.test(document.querySelector('.bdd-band')?.textContent || ''), `distance remembered on the board (${Board.current().qualityDistance})`);
  reset(); await drop(tileOf(warm)); await settle(1);
  const t5 = v.attachments[0]?.content || '';
  ok(/Don't reproduce the subject, layout or recognisable elements/.test(t5) && !/#[0-9a-f]{6} \d+%/i.test(t5) && !/Warm dusk/.test(t5), 'spirit: mood words only, no hexes, no title, the don\'t-reproduce rule');
  range.value = '20'; range.dispatchEvent(new Event('change', { bubbles: true })); await wait(200);

  // 5. pick two tiles → the mix card → send
  await until(() => tileOf(warm) && tileOf(cool));
  tileOf(warm).click(); tileOf(cool).click();
  const mixCard = await until(() => { const m = document.querySelector('.bdd-mix'); return m && !m.hidden && /Mix of 2/.test(m.textContent) ? m : null; });
  ok(mixCard, 'two picked tiles show the mix card');
  ok(mixCard?.querySelectorAll('.bd-pal span').length >= 2, 'the mix card shows the blended palette');
  out.mixWords = mixCard?.querySelector('.bdd-mix-w')?.textContent;
  if (typeof smoke === 'function') await smoke({ shot: window.MQ_SHOT || '/tmp/moodqualities67-drawer.png' }).catch(() => {});
  reset();
  [...(mixCard?.querySelectorAll('button') || [])].find((x) => /Send the mix/.test(x.textContent))?.click();
  await settle(1);
  const t6 = v.attachments[0]?.content || '';
  ok(/^mix · /.test(v.attachments[0]?.name || '') && /BLEND OF 2 REFERENCES/.test(t6) && /reference 1: "the orange band/.test(t6), `Send the mix → one blended block (${v.attachments[0]?.name})`);
  [...document.querySelectorAll('.bdd-mix button')].find((x) => x.textContent === 'Clear')?.click();

  // 6. right-click a tile
  const t8 = tileOf(cool); const tr = t8.getBoundingClientRect();
  t8.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: tr.left + 5, clientY: tr.top + 5 }));
  await wait(200);
  out.tileMenu = menuRows().map((x) => x.textContent.trim());
  ok(out.tileMenu.some((x) => /^Send its qualities/.test(x)) && out.tileMenu.some((x) => /^Send the actual picture/.test(x)) && out.tileMenu.some((x) => /What I like about this/.test(x)) && out.tileMenu.some((x) => /Pick it to mix/.test(x)), `tile menu (${out.tileMenu.slice(0, 6)})`);
  reset();
  menuRows().find((x) => /^Send the actual picture/.test(x.textContent.trim()))?.click();
  await settle(1);
  ok(v.attachments[0]?.kind === 'image', 'right-click › Send the actual picture → the picture');
  closeMenu();

  // 7. /board-ask: the drafted question gets the same qualities block
  reset();
  Board.select?.(['mqwarm']);
  await Board._.ask('common', { agentId: C.id, itemIds: ['mqwarm'] });
  await settle(1);
  ok(/^qualities · /.test(v.attachments[0]?.name || '') && /WHAT I LIKE/.test(v.attachments[0]?.content || ''), `board ask → the qualities block (${v.attachments[0]?.name})`);
  reset();

  BoardDrawer.toggle(false);
  await Board.remove?.(b.id);
} catch (err) { fail.push(`threw: ${err.stack || err.message}`); }
return JSON.stringify({ ok: !fail.length, fail, out }, null, 1);
