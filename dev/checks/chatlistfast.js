// A fast chats list with a big history (round 42, chatlistfast): 3,000 made-up chats (dev/make-chatlist-fixture.js:
// Claude and Astra, two years, 20 folders, tags, pins, archived chats) and the list measured the way the owner uses it,
// with real input (CDP): the list drawn (open), the panel shown, ~1,000 rows of one AI shown and wheeled through,
// typing in the search box, renaming (F2), moving to a folder (menu and drag), switching chats by clicking, one chat
// changing (a reply saved), and memory (DOM nodes, JS heap after GC). Per stretch: in-page timings (input → handled,
// input → next frame) and the timeline trace (main-thread busy ms, frames over 4.2 ms, the longest task).
// Then what must still work: ↑ / ↓ / Home / End / Enter through a long list (past what is drawn), right-click menu,
// F2 rename, Delete, pins on top, drag onto a folder, Ctrl/⌘+Z (undoall) for a rename / a move / a delete, the search
// (titles, #tags, folders) finding the same chats as a plain scan, archived chats only under their filter.
// Fails above the budgets (BUDGET below; window.CLF_REPORT = 1 reports without failing).
//   node dev/smoke.js --data /tmp/hearth-chatlist-fixture --check-timeout 600000 --lib dev/checks/smooth-lib.js --script dev/checks/chatlistfast.js
// (dev/run-checks.js makes the fixture when it's missing: node dev/make-chatlist-fixture.js /tmp/hearth-chatlist-fixture 3000)
const { wait, until } = M;
const out = { chats: 0, budgets: {}, numbers: {}, problems: [] };
const fail = (m) => out.problems.push(m);
const r1 = (x) => Math.round(x * 10) / 10;
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? r1(s[Math.min(s.length - 1, Math.floor(s.length * p))]) : null; };
const med = (a) => pct(a, 0.5);
const cdp = (method, params) => Promise.race([smoke({ cdp: method, params }), wait(5000)]);
const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra });
const click = async (x, y, button = 'left') => { await mouse('mousePressed', x, y, { button }); await mouse('mouseReleased', x, y, { button }); };
const mid = (n) => { const r = n.getBoundingClientRect(); return [r.left + Math.min(r.width / 2, 80), r.top + r.height / 2]; };
const KEYS = { Escape: [27], Enter: [13], Backspace: [8], ArrowDown: [40], ArrowUp: [38], Home: [36], End: [35], F2: [113], Delete: [46] };
async function key(k, modifiers = 0) {
  const sp = KEYS[k];
  const p = sp ? { key: k, code: k, windowsVirtualKeyCode: sp[0], ...(k === 'Enter' ? { text: '\r' } : {}) } : { key: k, code: /[a-z]/i.test(k) ? `Key${k.toUpperCase()}` : k === ' ' ? 'Space' : '', windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), ...(modifiers ? {} : { text: k }) };
  await cdp('Input.dispatchKeyEvent', { type: (sp && k !== 'Enter') || modifiers ? 'rawKeyDown' : 'keyDown', modifiers, ...p });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', modifiers, ...p });
}
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const settle = async () => { await frame(); await frame(); await wait(30); };
const root = () => document.getElementById('chat-groups');
const rowsNow = () => [...root().querySelectorAll('.item')];
const rowOf = (id) => root().querySelector(`.item[data-key="${CSS.escape(id)}"]`);
const mark = (n) => performance.mark(`hz240:${n}`);
// Xvfb + software GL on 4 shared CPUs (other agents' checks run too): frame timings move 2–5× with the load, so the
// budgets that fail are the work the list itself does (in-page script time, counts); input → frame is reported, and
// only fails far above what any load here gave.
const BUDGET = window.CLF_BUDGET || {
  renderMs: 8, // the whole list drawn again (the 3,000-chat model + what's on screen), median (before: 16)
  showMoreMs: 15, // "Show more" with ~1,000 rows of one AI already out: the click's own work, median of the last 5 (before: 40+)
  listNodes: 900, // elements inside the list with ~1,000 rows of one AI out (before: 2,968)
  scrollBusyPerSec: 260, // wheeling through those rows: main-thread busy ms per second (trace; before: 417 on a quiet machine)
  scrollListMsPerSec: 40, // … of it, the list's own script (panel.js) per second
  letterMs: 12, // the search: one letter's draw (filter 3,000 chats + what changes on screen), median (before: 16–30 on a quiet machine)
  keyHandledP95: 6, // … a key's handlers in the search box, p95 (before: 30)
  keyToFrameP95: 200, // … input → next frame, p95 (reported; fails only far over: before 85 on a quiet machine)
  searchResultsMs: 150, // after the last key: the results on screen
  oneChangeMs: 12, // one chat's title changing (a reply saved, a rename): the list's work, median (before: 27–34)
  oneChangeNodes: 12, // … elements added / removed in the list, counted with what's inside them (before: the whole list)
  highlightMs: 2, // switching chats: the list marking the open one, median
  switchHandledP95: 80, // a chat clicked in the list: its handlers (most of it is the chat itself drawing), p95
  heapMB: 40, // JS heap after GC with the list up
};
out.budgets = BUDGET;
const n = out.numbers;

// ---------- the history is there ----------
const claude = H.claudeAgent();
if (!H.panelOpen) { H.panelOpen = true; applyLayout(); }
await until(() => (H.chats || []).length >= 3000 && rowsNow().length > 20, 30000);
out.chats = H.chats.length;
if (out.chats < 3000) fail(`the fixture didn't load: ${out.chats} chats (make it: node dev/make-chatlist-fixture.js)`);
await until(() => typeof ChatUX !== 'undefined' && ChatUX.allFolders().length >= 10, 10000);
await until(() => typeof UndoAll !== 'undefined', 15000);
document.querySelectorAll('.qs-card').forEach((c) => c.querySelector('.qs-x, button[title^="Close"]')?.click());
await wait(1500);
const all = () => H.chats;
const metaOf = (id) => ChatUX.metaOf(id);
const claudeChats = () => all().filter((c) => c.agentId === claude.id && !metaOf(c.id).archived);

// in-page timings of real input: when its handlers were done and the next frame after it
const ev = [];
let evOn = null;
for (const t of ['keydown', 'input', 'click', 'contextmenu']) {
  addEventListener(t, (e) => { if (!evOn || !e.isTrusted) return; const x = { type: t, t0: e.timeStamp, done: performance.now(), label: evOn }; ev.push(x); requestAnimationFrame(() => { x.frame = performance.now(); }); }, false);
}
const evOf = (label, type) => ev.filter((x) => x.label === label && (!type || x.type === type));

await cdp('HeapProfiler.collectGarbage');
await smoke({ trace: 'start', detail: true });

// ---------- open: the IPC, the list drawn, the panel shown ----------
mark('open');
{
  const ipc = []; for (let i = 0; i < 3; i++) { const t = performance.now(); await window.hub.listChats(); ipc.push(performance.now() - t); }
  n.listIpcMs = med(ipc);
  n.listedAtBootMs = Math.round(performance.getEntriesByName('hearth:chats-listed')[0]?.startTime || 0) || null; // the history first in the list, from the window's start
  const ren = []; const renFrame = [];
  for (let i = 0; i < 6; i++) { const t = performance.now(); Panel.render(); ren.push(performance.now() - t); await frame(); renFrame.push(performance.now() - t); await wait(60); }
  n.renderMs = med(ren); n.renderToFrameMs = med(renFrame);
  const show = [];
  for (let i = 0; i < 3; i++) { H.panelOpen = false; applyLayout(); await settle(); const t = performance.now(); H.panelOpen = true; applyLayout(); await frame(); show.push(performance.now() - t); await settle(); }
  n.panelShowMs = med(show);
  n.listNodesAtOpen = root().querySelectorAll('*').length;
}

// ---------- ~1,000 rows of Claude's chats out, then wheeled through ----------
mark('show-more');
{
  const group = () => root().querySelector(`.group[data-id="${claude.id}"]`);
  if (group()?.querySelector('.caret')?.textContent === '▸') group().querySelector('.group-toggle').click();
  const times = []; const sync = [];
  for (let i = 0; i < 30; i++) {
    const b = group()?.querySelector(':scope > .show-more');
    if (!b) break;
    b.scrollIntoView({ block: 'nearest' }); await frame();
    const t = performance.now(); b.click(); sync.push(performance.now() - t); await frame(); times.push(performance.now() - t);
    await wait(20);
  }
  n.showMoreClicks = times.length; n.showMoreMs = med(sync.slice(-5)); n.showMoreToFrameMs = med(times.slice(-5)); n.showMoreFirstMs = r1(times[0] || 0);
  n.listNodesExpanded = root().querySelectorAll('*').length;
  n.rowsInDom = rowsNow().length;
  n.rowsListed = Math.min(claudeChats().length, 40 * (times.length + 1));
}
mark('scroll');
{
  const r = root(); r.scrollTop = 0; await settle();
  const [x, y] = mid(r);
  const t = performance.now();
  for (let i = 0; i < 60; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: 400 }); await wait(16); }
  for (let i = 0; i < 20; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: -900 }); await wait(16); }
  n.scrollSecs = r1((performance.now() - t) / 1000);
  n.scrollReached = Math.round(r.scrollTop);
  await settle();
  mark('gaps');
  // no gap anywhere: at 12 places down the list, the screen's top, middle and bottom show a row, a folder or a header
  // (a long group draws only the rows near the screen: what it doesn't draw must never be what you see)
  const R = r.getBoundingClientRect(); let blank = 0; let tried = 0; const where = [];
  for (let k = 0; k <= 12; k++) {
    r.scrollTop = (r.scrollHeight - r.clientHeight) * (k / 12); await frame(); await frame();
    for (const yy of [R.top + 4, R.top + R.height / 2, R.bottom - 6]) {
      tried += 1;
      const hitEl = document.elementFromPoint(R.left + 60, yy);
      // the list's own padding at its very end and the small gap between two groups are empty on purpose
      const edge = (k === 12 && yy > R.bottom - 20) || hitEl?.matches?.('.group') && !hitEl.classList.contains('vlist');
      if (!edge && !hitEl?.closest?.('.item, .folder-head, .group-head, .show-more, .none, .panel-view')) { blank += 1; where.push(`${k}/12 ${Math.round(yy - R.top)}px: ${hitEl?.className || hitEl?.tagName}`); }
    }
  }
  n.blankSpots = `${blank}/${tried}`;
  if (blank) fail(`${blank} of ${tried} places down the list showed nothing (a gap in a long group): ${where.join(' · ')}`);
  // wheeling fast, checked in the very frame after each notch
  r.scrollTop = 0; await settle();
  let blankFast = 0;
  for (let i = 0; i < 30; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: 1200 }); await frame(); const hitEl = document.elementFromPoint(R.left + 60, R.top + R.height / 2); if (!hitEl?.closest?.('.item, .folder-head, .group-head, .show-more, .none')) blankFast += 1; }
  n.blankWhileWheeling = blankFast;
  if (blankFast > 1) fail(`wheeling fast: ${blankFast} of 30 frames showed a gap in the middle of the list`);
  r.scrollTop = 0; await settle();
}
mark('idle1'); await wait(300);

// ---------- typing in the search box ----------
mark('search');
const typed = 'neon';
{
  const s = document.getElementById('chat-search');
  s.focus(); await frame();
  evOn = 'search';
  let lastMut = 0; const mo = new MutationObserver(() => { lastMut = performance.now(); }); mo.observe(root(), { childList: true, subtree: true, characterData: true });
  for (const ch of typed) { await key(ch); await wait(45); }
  const tLast = evOf('search', 'input').at(-1)?.done || performance.now();
  await wait(600); mo.disconnect(); evOn = null;
  n.searchResultsMs = r1(Math.max(0, lastMut - tLast));
  const k = evOf('search', 'keydown');
  n.keyHandledP95 = pct(evOf('search').filter((x) => x.type === 'input').map((x) => x.done - x.t0), 0.95);
  n.keyToFrameP95 = pct(k.map((x) => (x.frame || x.done) - x.t0), 0.95);
  n.keyToFrameMax = pct(k.map((x) => (x.frame || x.done) - x.t0), 1);
  // the same chats as a plain scan of the titles (+ folders, #tags) would find, per AI (the first page of each)
  const q = typed.toLowerCase();
  const want = all().filter((c) => !metaOf(c.id).archived && (c.title.toLowerCase().includes(q) || (metaOf(c.id).folder || '').toLowerCase().includes(q)));
  const shown = new Set(rowsNow().map((r) => r.dataset.key));
  const missing = want.filter((c) => !shown.has(c.id));
  const byAgent = {}; for (const c of want) byAgent[c.agentId] = (byAgent[c.agentId] || 0) + 1;
  n.searchHits = want.length;
  // (40 per AI are shown before "Show more": compare those)
  const firstPage = Object.values(Object.groupBy(want, (c) => c.agentId)).flatMap((l) => l.sort((x, y) => (y.pinned - x.pinned) || y.updatedAt - x.updatedAt).slice(0, 40));
  const missingFirst = firstPage.filter((c) => !shown.has(c.id) && !(metaOf(c.id).folder && root().querySelector('.folder-head')?.textContent.startsWith('▸')));
  if (missingFirst.length) fail(`search "${typed}": ${missingFirst.length} of the first ${firstPage.length} matches missing (${missingFirst.slice(0, 3).map((c) => c.title).join(' · ')})`);
  if ([...shown].some((id) => { const c = all().find((x) => x.id === id); return c && !c.title.toLowerCase().includes(q) && !(metaOf(id).folder || '').toLowerCase().includes(q) && !(metaOf(id).tags || []).some((t2) => `#${t2}`.startsWith(q)); })) fail(`search "${typed}": a row that doesn't match is shown`);
  // one letter's draw, programmatically (the same typing, timed without the machine's frame waits)
  const lt = [];
  for (let k = 1; k <= typed.length; k++) { const t = performance.now(); Panel.setFilter(typed.slice(0, k)); if (Panel.flush) Panel.flush(); else Panel.render(); lt.push(performance.now() - t); await frame(); }
  for (let k = typed.length - 1; k >= 0; k--) { const t = performance.now(); Panel.setFilter(typed.slice(0, k)); if (Panel.flush) Panel.flush(); else Panel.render(); lt.push(performance.now() - t); await frame(); }
  n.letterMs = med(lt); n.letterMaxMs = r1(Math.max(...lt));
  // #tags
  s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); await settle();
  s.value = '#urgent'; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(300); await settle();
  const tagRows = rowsNow().filter((r) => r.dataset.key && r.dataset.key !== '__draft');
  if (!tagRows.length || tagRows.some((r) => !(metaOf(r.dataset.key).tags || []).includes('urgent'))) fail(`search "#urgent": ${tagRows.length} rows, not all tagged`);
  await key('Escape'); await settle(); await wait(200);
  if (s.value) fail('Esc in the search box did not clear it');
}
mark('idle2'); await wait(300);

// ---------- one chat changing (a reply saved / renamed): the list's own work ----------
mark('one-change');
{
  root().scrollTop = 0; await settle();
  const ids = claudeChats().filter((c) => !metaOf(c.id).folder).slice(0, 6).map((c) => c.id);
  const tms = []; const nodes = [];
  const weigh = (list) => { let k = 0; for (const m of list) for (const x of [...m.addedNodes, ...m.removedNodes]) if (x.nodeType === 1) k += 1 + x.getElementsByTagName('*').length; return k; };
  let muts = 0; const mo = new MutationObserver((l) => { muts += weigh(l); });
  mo.observe(root(), { childList: true, subtree: true });
  for (const id of ids) {
    const sum = H.chats.find((c) => c.id === id);
    const chatNow = { ...sum, title: `${sum.title} ·` };
    // what Native's remember() does for a saved chat: the summary to the front, the list asked to follow
    H.chats = [{ ...chatNow }, ...H.chats.filter((c) => c.id !== id)];
    await mo.takeRecords(); muts = 0;
    const t = performance.now(); (Panel.soon || Panel.render)(); if (Panel.flush) Panel.flush(); else Panel.render(); tms.push(performance.now() - t);
    muts += weigh(mo.takeRecords());
    nodes.push(muts);
    await frame(); await wait(80);
    if (!rowOf(id)?.textContent.includes(chatNow.title)) fail(`a changed title didn't show in the list (${chatNow.title})`);
  }
  mo.disconnect();
  n.oneChangeMs = med(tms); n.oneChangeNodes = med(nodes);
}
// the list's model, kept up to date chat by chat, is what a full sort of H.chats gives
function modelSame(when) {
  if (!Panel._model) return;
  const m = Panel._model(); const cmp = Panel.SORTS[store.get('panel.sort', 'recent')] || Panel.SORTS.recent;
  for (const agentId of new Set(H.chats.map((c) => c.agentId))) {
    const want = H.chats.filter((c) => c.agentId === agentId).sort((a, b) => (b.pinned - a.pinned) || cmp(a, b)).map((c) => c.id).join();
    if ((m.get(agentId) || []).map((c) => c.id).join() !== want) { fail(`${when}: the list's order for ${agentId} differs from a fresh sort`); return; }
  }
}
modelSame('after six chats changed');

// ---------- renaming with F2 (real keys), Ctrl+Z puts it back ----------
mark('rename');
let renamed = null;
{
  const r = rowsNow().find((x) => x.closest(`.group[data-id="${claude.id}"]`) && x.dataset.key !== '__draft');
  renamed = { id: r.dataset.key, old: H.chats.find((c) => c.id === r.dataset.key)?.title };
  r.focus(); await frame();
  evOn = 'rename';
  await key('F2'); await wait(100);
  const input = root().querySelector('input.rename');
  if (!input) fail('F2 opened no rename box');
  else {
    // a reply to another chat arrives while renaming: the rename box stays, with its focus
    const other = claudeChats().find((c) => c.id !== renamed.id && !metaOf(c.id).folder);
    H.chats = [{ ...other, updatedAt: Date.now() }, ...H.chats.filter((c) => c.id !== other.id)];
    (Panel.soon || Panel.render)(); if (Panel.flush) Panel.flush(); await frame();
    if (!root().querySelector('input.rename') || document.activeElement !== root().querySelector('input.rename')) fail('a reply arriving closed the rename box');
    input.select();
    for (const ch of 'Renamed X') await key(ch);
    await key('Enter');
    await until(() => H.chats.find((c) => c.id === renamed.id)?.title === 'Renamed X', 4000);
    await settle();
    if (!rowOf(renamed.id)?.textContent.includes('Renamed X')) fail('the renamed chat shows its old title in the list');
  }
  evOn = null;
  n.renameEnterToFrameMs = r1(((evOf('rename', 'keydown').at(-1)?.frame) || 0) - (evOf('rename', 'keydown').at(-1)?.t0 || 0));
  await wait(200);
  document.activeElement?.blur?.(); document.body.focus();
  await key('z', 2); // Ctrl+Z
  await until(() => H.chats.find((c) => c.id === renamed.id)?.title === renamed.old, 5000);
  await settle();
  if (H.chats.find((c) => c.id === renamed.id)?.title !== renamed.old) fail('Ctrl+Z did not undo the rename');
  else if (!rowOf(renamed.id)?.textContent.includes(renamed.old)) fail('after Ctrl+Z the list still shows the new title');
}

// ---------- moving to a folder: the menu's way (setMeta), then a drag onto a folder ----------
mark('move');
{
  const free = claudeChats().filter((c) => !metaOf(c.id).folder && !c.pinned).slice(0, 2);
  const [a] = free;
  const t = performance.now(); ChatUX.setMeta(a.id, { folder: 'Work' }); if (Panel.flush) Panel.flush(); n.moveMs = r1(performance.now() - t);
  await settle();
  const inFolder = (id, f) => { const r = rowOf(id); if (!r) return null; let p = r.previousElementSibling; while (p && !p.classList.contains('folder-head')) p = p.previousElementSibling; return p ? p.textContent.includes(f) : false; };
  if (inFolder(a.id, 'Work') === false) fail('a chat moved to "Work" is not under its folder');
  // Ctrl+Z puts it back
  document.body.focus(); await key('z', 2);
  await until(() => !metaOf(a.id).folder, 4000);
  if (metaOf(a.id).folder) fail('Ctrl+Z did not undo the move to a folder');
  // drag: a loose row onto the first folder header of its AI (scrolled to where the folders start: in a long group
  // only the rows near the screen are drawn)
  await settle();
  const firstHead = () => root().querySelector(`.group[data-id="${claude.id}"] > .folder-head`);
  for (let i = 0; i < 200 && !firstHead(); i++) { root().scrollTop += root().clientHeight * 0.8; await frame(); }
  const head = firstHead();
  head?.scrollIntoView({ block: 'center' }); await settle();
  let src = head?.previousElementSibling;
  while (src && !src.matches('.item')) src = src.previousElementSibling;
  const folderName = head?.dataset.folder || head?.textContent.replace(/^[▾▸] 📁 /, '');
  const bId = src?.dataset.key;
  if (!head || !src) fail(`drag: ${head ? '' : 'no folder header'} ${src ? '' : 'no chat to drag next to it'}`.trim());
  else {
    const dt = new DataTransfer();
    src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    head.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt });
    head.dispatchEvent(over);
    if (!over.defaultPrevented) fail('drag: a folder header does not take a dragged chat');
    head.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    src.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: dt }));
    await settle();
    if (metaOf(bId).folder !== folderName) fail(`drag onto "${folderName}": the chat's folder is ${metaOf(bId).folder || 'none'}`);
    else {
      // dragged onto its AI's header: out of the folder again
      const gh = root().querySelector(`.group[data-id="${claude.id}"] > .group-head`);
      const src2 = rowOf(bId);
      if (src2 && gh) {
        const dt2 = new DataTransfer();
        src2.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt2 }));
        gh.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt2 }));
        gh.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt2 }));
        await settle();
        if (metaOf(bId).folder) fail('drag onto the AI\'s header did not take the chat out of its folder');
      }
    }
    if (root().querySelector('.drop-on')) fail('drag: a drop mark stayed after the drop');
  }
}

// ---------- switching chats by clicking rows ----------
mark('switch');
{
  root().scrollTop = 0; await settle();
  evOn = 'switch';
  const rows = rowsNow().filter((r) => r.closest(`.group[data-id="${claude.id}"]`) && r.dataset.key !== '__draft').slice(1, 9);
  for (const r of rows) { const [x, y] = mid(r); await click(x, y); await wait(250); if (H.activeChat[claude.id] !== r.dataset.key) fail(`clicking "${r.textContent.slice(0, 30)}" did not open it`); }
  evOn = null;
  const c = evOf('switch', 'click');
  n.switchHandledP95 = pct(c.map((x) => x.done - x.t0), 0.95);
  n.switchToFrameP95 = pct(c.map((x) => (x.frame || x.done) - x.t0), 0.95);
  const hl = []; for (let i = 0; i < 20; i++) { const t = performance.now(); Panel.highlight(); hl.push(performance.now() - t); }
  n.highlightMs = med(hl);
}
mark('end');
const tr = await smoke({ trace: 'stop', detail: true });
const seg = tr.detail?.segments || {};
const S = (k) => seg[k] || {};
n.trace = Object.fromEntries(['open', 'show-more', 'scroll', 'search', 'one-change', 'rename', 'move', 'switch'].map((k) => [k, { busyMs: S(k).busyMs, framesOver4: S(k).frames?.over4, worstFrame: S(k).frames?.worst, longest: S(k).longTasks?.max, style: S(k).style?.elements, layout: S(k).layout?.objects, top: (S(k).scripts || []).slice(0, 2) }]));
n.scrollWorstFrameMs = S('scroll').frames?.worst ?? null;
n.scrollBusyPerSec = n.scrollSecs ? r1((S('scroll').busyMs || 0) / n.scrollSecs) : null;
n.scrollListMsPerSec = n.scrollSecs ? r1(parseFloat(seg.scroll?.files?.['panel.js'] || '0') / n.scrollSecs) : null;

// ---------- keyboard through a long list (past what is drawn), Enter opens ----------
{
  // ~1,000 rows of Claude are still out: from the first row, End, Home, then 80 × ↓
  const s = document.getElementById('chat-search');
  s.focus(); await key('ArrowDown'); await frame();
  const first = document.activeElement;
  if (!first?.matches?.('#chat-groups .item')) fail('↓ from the search box did not reach the list');
  await key('End'); await settle();
  const last = document.activeElement;
  const claudeRows = claudeChats().length;
  if (!last?.matches?.('#chat-groups .item')) fail('End left the list');
  await key('Home'); await settle();
  if (document.activeElement !== root().querySelector('.item')) fail('Home did not go to the first chat');
  // past the rows drawn at first (a long group draws ~100 around the screen): 250 × ↓
  const seen = new Set();
  for (let i = 0; i < 250; i++) { await key('ArrowDown'); seen.add(document.activeElement?.dataset?.key); }
  await settle();
  const at = document.activeElement;
  n.arrowDownReached = seen.size;
  if (seen.size < 245) fail(`250 × ↓ visited ${seen.size} different chats`);
  for (let i = 0; i < 5; i++) await key('ArrowUp');
  if (!document.activeElement?.matches?.('#chat-groups .item')) fail('↑ left the list');
  else if (document.activeElement === at) fail('↑ did not move');
  const now = document.activeElement;
  if (!now?.matches?.('#chat-groups .item') || !now.checkVisibility?.()) fail('after 250 × ↓ and 5 × ↑ the focused row is not in the list / not visible');
  else {
    await settle();
    const r = now.getBoundingClientRect(); const L = root().getBoundingClientRect();
    if (r.bottom > L.bottom + 2 || r.top < L.top - 2) fail('after the arrows the focused row is scrolled out of view');
    const id = now.dataset.key;
    await key('Enter'); await settle();
    if (H.activeChat[claude.id] !== id && H.activeChat[now.closest('.group')?.dataset.id] !== id) fail('Enter did not open the focused chat');
  }
  // one Tab stop: exactly one row has tabindex 0
  const zero = rowsNow().filter((r) => r.tabIndex === 0).length;
  if (zero !== 1) fail(`${zero} rows are Tab stops (one expected)`);
  n.claudeRows = claudeRows;
}

// ---------- right-click, Shift+F10, pins, Delete + Ctrl+Z ----------
{
  root().scrollTop = 0; await settle();
  const r = rowsNow().find((x) => x.closest(`.group[data-id="${claude.id}"]`) && x.dataset.key !== '__draft' && !x.querySelector('.pin-mark'));
  const [x, y] = mid(r); await click(x, y, 'right'); await wait(250);
  const labels = [...document.querySelectorAll('#menu button')].filter((b) => b.checkVisibility?.()).map((b) => b.textContent.trim());
  if (!labels.some((l) => /Rename/.test(l)) || !labels.some((l) => /Pin to top/.test(l))) fail(`right-click: no chat menu (${labels.slice(0, 5).join(', ')})`);
  await key('Escape'); await wait(150);
  // pin it: it goes to the top of its group
  const id = r.dataset.key;
  Native.togglePin(id); await wait(300); await settle();
  modelSame('after a pin');
  const firstRow = root().querySelector(`.group[data-id="${claude.id}"] > .item:not(.draft)`);
  if (firstRow?.dataset.key !== id && !H.chats.find((c) => c.id === id)?.pinned) fail('a pinned chat is not pinned');
  else if (firstRow?.dataset.key !== id) {
    // pinned chats come first among the chats without a folder (a pinned chat in a folder stays in its folder)
    if (!metaOf(id).folder) fail('a pinned chat is not at the top of its group');
  }
  Native.togglePin(id); await wait(300);
  // Delete key → gone; Ctrl+Z → back
  const victim = rowsNow().find((x) => x.closest(`.group[data-id="${claude.id}"]`) && x.dataset.key !== '__draft' && x.dataset.key !== H.activeChat[claude.id]);
  const vid = victim.dataset.key;
  const realConfirm = window.confirm; window.confirm = () => true;
  victim.focus(); await key('Delete');
  window.confirm = realConfirm;
  await until(() => !H.chats.some((c) => c.id === vid), 4000); await settle();
  if (H.chats.some((c) => c.id === vid) || rowOf(vid)) fail('Delete did not remove the chat from the list');
  document.body.focus(); await key('z', 2);
  await until(() => H.chats.some((c) => c.id === vid), 6000); await settle(); await wait(200);
  modelSame('after a delete and its undo');
  if (!H.chats.some((c) => c.id === vid)) fail('Ctrl+Z did not bring the deleted chat back');
  else if (!rowOf(vid)) fail('the restored chat is not in the list');
}

// ---------- archived chats: only under their filter ----------
{
  const arch = all().filter((c) => metaOf(c.id).archived).slice(0, 3).map((c) => c.id);
  if (arch.some((id) => rowOf(id))) fail('an archived chat shows in the list');
  Panel.setView('archived'); await settle();
  const shown = rowsNow().map((r) => r.dataset.key);
  if (!shown.length || shown.some((id) => !metaOf(id).archived)) fail(`/filter archived: ${shown.length} rows, not all archived`);
  Panel.setView('folder:shaders'); await settle();
  if (rowsNow().some((r) => (metaOf(r.dataset.key).folder || '').toLowerCase() !== 'shaders')) fail('/filter folder:shaders shows other chats');
  Panel.setView(null); await settle();
}

// ---------- memory ----------
for (let i = 0; i < 3; i++) { await cdp('HeapProfiler.collectGarbage'); await wait(150); }
n.heapMB = r1(performance.memory.usedJSHeapSize / 1048576);
n.domNodes = document.getElementsByTagName('*').length;
n.listNodesEnd = root().querySelectorAll('*').length;

// ---------- budgets ----------
const over = (k, v, b) => { if (v != null && b != null && v > b) fail(`${k}: ${v} (budget ${b})`); };
over('render ms', n.renderMs, BUDGET.renderMs);
over('Show more ms (its own work)', n.showMoreMs, BUDGET.showMoreMs);
over('list nodes with ~1,000 rows out', n.listNodesExpanded, BUDGET.listNodes);
over('scroll: busy ms per second', n.scrollBusyPerSec, BUDGET.scrollBusyPerSec);
over('scroll: the list\'s script ms per second', n.scrollListMsPerSec, BUDGET.scrollListMsPerSec);
over('search: one letter ms', n.letterMs, BUDGET.letterMs);
over('search: key handlers p95', n.keyHandledP95, BUDGET.keyHandledP95);
over('search: key → frame p95', n.keyToFrameP95, BUDGET.keyToFrameP95);
over('search: results after the last key ms', n.searchResultsMs, BUDGET.searchResultsMs);
over('one chat changing ms', n.oneChangeMs, BUDGET.oneChangeMs);
over('one chat changing: elements added / removed', n.oneChangeNodes, BUDGET.oneChangeNodes);
over('switch: marking the open chat ms', n.highlightMs, BUDGET.highlightMs);
over('switch: click handlers p95', n.switchHandledP95, BUDGET.switchHandledP95);
over('JS heap MB', n.heapMB, BUDGET.heapMB);
if (window.CLF_REPORT) { out.wouldFail = out.problems; out.problems = []; }
out.pass = !out.problems.length;
return JSON.stringify(out, null, 1);
