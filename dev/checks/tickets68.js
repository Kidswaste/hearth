// (round 68, tickets68) 🎟 My ticket in the real app, on a throwaway profile, with showsync61's saved sample shows
// (dev/fixtures/showsync through shows:test; no network) and a generated PDF and PNG (made here: a one-page PDF written by
// hand, a PNG drawn on a canvas). Downloads is the check's own scratch folder (tickets:op test), never the real one; the
// computer's file picker answers with the check's PDF (tests only). By clicking:
//   · a show card (✦ Shows this week → a show): "🎟 Add my ticket" (the tickets code not loaded before), the Downloads
//     suggestion "Is this your ticket for …?" → Add it → a COPY under the show (the Downloads file untouched) → the button
//     reads "🎟 Open my ticket" → the bright view (the PNG, the whole window, white, the brightness hint) → × Close
//   · another show: "🎟 Add my ticket" → the picker → the PDF in the view; a picture dropped on the card (by its bytes) → 2
//     tickets, ‹ › between them; ⋯ More › Remove → the trash folder (the owner's PDF still where it was)
//   · the ✦ tracker on a show's day: "🎟 Ticket ready · …" → the view; a show quest with a file named like it in Downloads:
//     "Is this your ticket for …?" → Add it; the show quest's card: "🎟 Open my ticket"
//   · the weekend plan's night out: "🎟 Add my ticket" beside 👋 Bring someone
//   · after the night: the view says it's kept with the night, Shows I went to has "🎟 My ticket", Remove (two clicks) → trash
//   · /shows ticket <show> opens the view; no AI call anywhere
//   node dev/smoke.js --script dev/checks/tickets68.js
const atlasImageSource = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...atlasImageSource, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.tileFixture = String(value); queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } atlasImageSource.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 160) => { for (let i = 0; i < n; i++) { let v; try { v = await fn(); } catch { v = null; } if (v) return v; await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const errors = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info.slice(0, 300) : JSON.stringify(info).slice(0, 300)}`}`); if (!ok) errors.push(name); };
const said = [];
const run = async (line) => { said.length = 0; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => said.push(String(t)), note: () => {}, error: (t) => said.push('ERROR ' + t) }); await until(() => said.some((t) => !/^Reading/.test(t)), line, 250); return said.filter((t) => !/^Reading/.test(t)).join('\n'); };
const top = () => [...document.querySelectorAll('dialog.qj-dialog[open]')].at(-1) || null;
const label = (b) => (b.querySelector('.qj-action-text')?.textContent ?? b.textContent).trim();
const btnIn = (root, re) => [...(root?.querySelectorAll('button') || [])].find((b) => re.test(label(b)));
const tv = () => document.querySelector('dialog.tk-view[open]');
const vis = (n) => Boolean(n && !n.hidden && n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden');
const shot = (n) => smoke({ shot: `${window.SMOKE_TMP || window.SMOKE_SAVES}/tickets68-${n}.png` }); // (--tmp <dir> keeps them)
const op = async (req) => { const r = await window.hub.tickets.op(req); if (!r?.ok) throw Error(r?.error); return r.value; };
const closeAll = async () => { tv()?.close(); document.querySelectorAll('dialog.qj-dialog[open]').forEach((x) => x.close()); await wait(150); };
let asks = 0; const realAsk = window.hub.askOnce; window.hub.askOnce = (...a) => { asks++; return realAsk(...a); };

// a generated PNG (a ticket-looking picture) and a one-page PDF written by hand (Helvetica text + black squares)
function png(title) {
  const cv = document.createElement('canvas'); cv.width = 600; cv.height = 900; const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 900); g.fillStyle = '#111'; g.font = 'bold 44px sans-serif'; g.fillText('TICKET', 40, 90); g.font = '28px sans-serif'; g.fillText(title, 40, 140);
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) if ((x * 7 + y * 13 + x * y) % 3 === 0 || (x < 7 && y < 7 && (x % 6 === 0 || y % 6 === 0 || (x > 1 && x < 5 && y > 1 && y < 5)))) g.fillRect(90 + x * 20, 260 + y * 20, 20, 20);
  return cv.toDataURL('image/png').split(',')[1];
}
function pdf(title) {
  let boxes = ''; for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) if ((x * 5 + y * 11 + x * y) % 3 === 0) boxes += `${150 + x * 14} ${250 + y * 14} 14 14 re f\n`;
  const content = `BT /F1 40 Tf 60 740 Td (E-TICKET) Tj ET\nBT /F1 22 Tf 60 700 Td (${title.replace(/[()\\]/g, '')}) Tj ET\n0 0 0 rg\n${boxes}`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}endstream`];
  let s = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o, i) => { offs.push(s.length); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = s.length; s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return btoa(s);
}

try {
  const t = await window.hub.shows.test({ dev: window.SMOKE_DEV }); if (!t?.ok) throw Error('shows:test unavailable: ' + JSON.stringify(t));
  await run('/shows');
  const DL = `${window.SMOKE_TMP}/Downloads`, OWN = `${window.SMOKE_TMP}/owner`;
  const tinfo = await op({ op: 'test', downloads: DL });
  await Lazy.load('questcore'); await Lazy.load('questjournal');
  await until(() => typeof TicketsHook !== 'undefined', 'the hook'); await TicketsHook.ready;
  step('the ticket view and adding are not loaded before a click', !Lazy.isIn('tickets') && typeof Tickets === 'undefined');
  const shows = ShowSync.upcoming();
  const ufo = shows.find((s) => /Ben UFO/.test(s.title)); const other = shows.find((s) => s !== ufo && !s.dateOnly && s.lineup.length);
  const ufoFile = `${DL}/ben-ufo-shotgun-ticket.png`; await window.hub.fs.write(ufoFile, png('Ben UFO · La Machine'), { base64: true });
  await window.hub.fs.write(`${DL}/holiday-photo.png`, png('Holiday'), { base64: true });
  const myPdf = `${OWN}/My e-ticket.pdf`; await window.hub.fs.write(myPdf, pdf(other.title), { base64: true });
  const before = await window.hub.fs.stat(ufoFile);

  // ---------- 1. a show card: the Downloads suggestion → Add it → Open my ticket (the PNG) ----------
  activate('tool:quests');
  await until(() => QuestJournal.ready?.(), 'journal ready');
  QuestJournal.navigate('world');
  (await until(() => document.querySelector('[data-focus="map-shows"]'), 'shows icon')).click();
  (await until(() => [...document.querySelectorAll('dialog.qj-dialog[open] .ss-row')].find((r) => /Ben UFO/.test(r.textContent)), 'Ben UFO row')).click();
  const add = await until(() => btnIn(top(), /^🎟 Add my ticket$/), 'the button on the show card');
  step('show card: a labelled "🎟 Add my ticket" beside the other show buttons', vis(add) && !!btnIn(top(), /Make it a quest/), [...top().querySelectorAll('.qj-actions button')].map(label));
  const sug = await until(() => top()?.querySelector('.tk-suggest'), 'the Downloads suggestion');
  step('"Is this your ticket for …?" names the file in Downloads (the holiday picture isn\'t offered)', /Is this your ticket for .*Ben UFO/.test(sug.textContent) && /ben-ufo-shotgun-ticket\.png/.test(sug.textContent) && !/holiday/.test(sug.textContent), sug.textContent);
  await shot('suggest');
  btnIn(sug, /^Add it$/).click();
  await until(() => btnIn(top(), /^🎟 Open my ticket$/), 'relabelled');
  const list1 = (await op({ op: 'list' })).list, mine = list1.find((x) => x.key === ufo.key);
  step('Add it: a copy kept under the show in Hearth\'s data folder; the card now says "🎟 Open my ticket"', !!mine && mine.files.length === 1 && mine.files[0].kind === 'image' && mine.files[0].url.includes('/tickets/' + ufo.key + '/') && !top().querySelector('.tk-suggest'), mine?.files[0]?.url);
  const after = await window.hub.fs.stat(ufoFile);
  step('the Downloads file is untouched (same place, size, date)', !!after && after.size === before.size && after.mtime === before.mtime);
  step('loaded on that click', Lazy.isIn('tickets'));
  btnIn(top(), /^🎟 Open my ticket$/).click();
  await until(() => tv()?.querySelector('.tk-img')?.complete && tv().querySelector('.tk-img').naturalWidth > 0, 'the picture in the view');
  const r = tv().getBoundingClientRect(), bg = getComputedStyle(tv()).backgroundColor;
  const covers = [[2, 2], [innerWidth - 3, 2], [2, innerHeight - 3], [innerWidth - 3, innerHeight - 3]].every(([x, y]) => tv().contains(document.elementFromPoint(x, y)));
  step('the view: the whole window, white, the ticket big', covers && /255, 255, 255/.test(bg) && tv().querySelector('.tk-img').getBoundingClientRect().height > innerHeight * 0.5, { w: r.width, h: r.height, iw: innerWidth, ih: innerHeight, dw: document.documentElement.clientWidth, bg, img: tv().querySelector('.tk-img').getBoundingClientRect().height });
  step('…with the brightness hint and ⛶ Full screen, × Close', /brightness all the way up/.test(tv().querySelector('.tk-bright').textContent) && !!btnIn(tv(), /Full screen/) && !!btnIn(tv(), /Close/));
  await shot('view-png');
  btnIn(tv(), /Close/).click(); await wait(100);
  step('× Close: back to the show card', !tv() && !!top());
  await closeAll();

  // ---------- 2. another show: the picker → the PDF; a picture dropped on the card; Remove → trash ----------
  (await until(() => document.querySelector('[data-focus="map-shows"]'), 'shows icon')).click();
  (await until(() => [...document.querySelectorAll('dialog.qj-dialog[open] .ss-row')].find((x) => x.dataset.show === other.key), 'the other show\'s row')).click();
  await op({ op: 'test', picks: [myPdf] });
  (await until(() => btnIn(top(), /^🎟 Add my ticket$/), 'Add my ticket (2)')).click();
  await until(() => btnIn(top(), /^🎟 Open my ticket$/), 'relabelled (2)');
  step('the picker: the PDF kept for that show', (await op({ op: 'list' })).list.find((x) => x.key === other.key)?.files[0]?.kind === 'pdf');
  btnIn(top(), /^🎟 Open my ticket$/).click();
  const frame = await until(() => tv()?.querySelector('iframe.tk-pdf'), 'the PDF frame');
  await new Promise((ok) => { frame.addEventListener('load', ok, { once: true }); setTimeout(ok, 2500); });
  await wait(600);
  step('the PDF in the view, filling the window', vis(frame) && frame.getBoundingClientRect().height > innerHeight * 0.6 && /\.pdf#toolbar=0/.test(frame.src), frame.src.slice(-60));
  await shot('view-pdf');
  tv().close(); await wait(80);
  // a picture dropped on the card (dragged from a browser: no path, its bytes)
  const card = top(); const dt = new DataTransfer();
  const bin = Uint8Array.from(atob(png(other.title)), (c) => c.charCodeAt(0)); dt.items.add(new File([bin], 'screenshot.png', { type: 'image/png' }));
  card.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  step('dragging a file over the card: the drop outline', card.classList.contains('tk-dropping'));
  card.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  await until(async () => (await op({ op: 'list' })).list.find((x) => x.key === other.key)?.files.length === 2, 'the dropped picture');
  step('dropped on the card: a second ticket for that show', true);
  btnIn(top(), /^🎟 Open my ticket$/).click();
  await until(() => tv()?.querySelector('.tk-n'), 'two tickets');
  step('the view: 1 / 2 with ‹ ›', tv().querySelector('.tk-n').textContent === '1 / 2' && !!tv().querySelector('.tk-next'));
  tv().querySelector('.tk-next').click(); await until(() => tv().querySelector('.tk-img'), 'the second ticket');
  step('› shows the dropped picture', tv().querySelector('.tk-n').textContent === '2 / 2');
  btnIn(tv(), /More/).click();
  const rm = await until(() => [...document.querySelectorAll('#menu button, #menu [role="menuitem"], #menu .menu-item')].find((x) => /Remove this ticket/.test(x.textContent)), 'the Remove item');
  rm.click();
  await until(async () => (await op({ op: 'list' })).list.find((x) => x.key === other.key)?.files.length === 1, 'removed');
  const trash = await window.hub.fs.list(`${window.SMOKE_SAVES}/tickets-trash`).catch(() => null);
  step('⋯ More › Remove: to the trash (tests: a folder), one ticket left, the view follows', Array.isArray(trash) ? trash.length === 1 : !!trash, { trash: Array.isArray(trash) ? trash.map((x) => x.name || x) : trash });
  step('the owner\'s own PDF still where it was', !!(await window.hub.fs.stat(myPdf)));
  await closeAll();

  // ---------- 3. the ✦ tracker on the show's day; a show quest with its file in Downloads ----------
  const tonight = { key: 'tonight68a1', title: 'Tonight at Petit Bain', start: Date.now() - 30 * 60e3, venue: { name: 'Petit Bain', address: '7 Port de la Gare' }, lineup: [] };
  await Tickets.addPath(tonight, ufoFile, { from: 'pick' });
  const base = shows.find((s) => s !== ufo && s !== other && !s.dateOnly && s.lineup.length) || other;
  const quest = { ...base, key: 'soonquest68', start: Date.now() + 36 * 3600e3, end: null }; // a show quest the day after tomorrow at the latest
  { await ShowSync.makeQuest(quest); await window.hub.fs.write(`${DL}/${quest.lineup[0].replace(/[^\w ]+/g, '')} ticket.pdf`, pdf(quest.title), { base64: true }); }
  activate(H.claudeAgent().id); await wait(150);
  await QuestHud.refresh(); QuestHud.close(); await QuestHud.open();
  const ready = await until(() => [...document.querySelectorAll('.qh-panel .tk-hud')].find((b) => /Tonight at Petit Bain/.test(b.textContent)), 'Ticket ready row');
  step('✦ tracker on the day: "🎟 Ticket ready · <show>"', vis(ready) && /^🎟 Ticket ready · /.test(ready.textContent), ready.textContent);
  if (quest) {
    const row = await until(() => document.querySelector(`.qh-panel .tk-hud-suggest[data-ticket="${quest.key}"]`), 'the tracker suggestion');
    step('✦ tracker: "Is this your ticket for …?" for a show quest coming up', /Is this your ticket for/.test(row.textContent) && /in Downloads/.test(row.textContent), row.textContent);
    await shot('tracker'); (document.querySelector('.qh-panel .qh-body') || {}).scrollTop = 0;
    row.querySelector('.tk-hud-add').click();
    await until(async () => (await op({ op: 'list' })).list.some((x) => x.key === quest.key), 'added from the tracker');
    step('…Add it keeps a copy for that show', true);
    QuestHud.close(); await QuestHud.open();
    const cardBtn = await until(() => [document.querySelector(`.qh-panel [data-k="ticket-card:${quest.key}"]`)].find((b) => b && /Open/.test(b.textContent)), 'the show quest card\'s button', 60).catch(() => null);
    step('the show quest\'s card in the tracker: "🎟 Open my ticket"', !!cardBtn && /🎟 Open my ticket/.test(cardBtn.textContent), cardBtn?.textContent || [...document.querySelectorAll('.qh-panel .qh-title')].map((x) => x.textContent));
  }
  (await until(() => [...document.querySelectorAll('.qh-panel .tk-hud')].find((b) => /Tonight at Petit Bain/.test(b.textContent)), 'Ticket ready row (2)')).click();
  await until(() => tv()?.querySelector('.tk-img'), 'the view from the tracker');
  step('…its click opens the bright view', /Tonight at Petit Bain/.test(tv().querySelector('.tk-what').textContent));
  tv().close(); QuestHud.close(); await wait(100);

  // ---------- 4. the weekend plan's night out ----------
  const onLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  const d0 = new Date(); d0.setHours(18, 0, 0, 0); while (d0.getDay() !== 4 || d0.getTime() < Date.now() - 6 * 3600e3) d0.setDate(d0.getDate() + 1);
  const THU = d0.getTime(); await Lazy.load('weekendplan'); WeekendPlanCore.setClock(() => THU);
  const fri = new Date(THU + 24 * 3600e3); fri.setHours(20, 0, 0, 0);
  WeekendPlan._test.shows = [{ ...ufo, key: 'tkfri0001', start: fri.getTime(), end: fri.getTime() + 4 * 3600e3, doors: null }];
  WeekendPlan._test.projects = []; WeekendPlan._test.takes = [];
  QuestHud.close(); await QuestHud.open();
  (await until(() => [...document.querySelectorAll('.qh-panel .wp-hud')].find(vis), 'Plan my weekend')).click();
  const wpT = await until(() => document.querySelector('.wp-panel .wp-slot[data-slot="night"] .wp-ticket'), 'the night slot\'s ticket button');
  step('weekend plan: the night out has "🎟 Add my ticket" beside 👋 Bring someone', vis(wpT) && wpT.textContent === '🎟 Add my ticket' && !!document.querySelector('.wp-panel .wp-slot[data-slot="night"] .wp-bring:not(.wp-ticket)'), wpT.textContent);
  await shot('weekend');
  await op({ op: 'test', picks: [myPdf] });
  wpT.click();
  await until(() => document.querySelector('.wp-panel .wp-slot[data-slot="night"] .wp-ticket')?.textContent === '🎟 Open my ticket', 'the slot relabelled');
  step('…pick → kept; the slot says "🎟 Open my ticket"; the weekend card still open', !!document.querySelector('.wp-panel'));
  WeekendPlan.close(); QuestHud.close();
  if (onLine) delete navigator.onLine; WeekendPlanCore.setClock(null);

  // ---------- 5. after the night: kept with it (Shows I went to), removed in two clicks ----------
  const past = { key: 'pastshow68', title: 'Last week at La Cigale', start: Date.now() - 4 * 24 * 3600e3, venue: { name: 'La Cigale', address: '120 Bd de Rochechouart' }, lineup: ['Arlo Parks'] };
  await Tickets.addPath(past, myPdf, { from: 'pick' }); await TicketsHook.refresh();
  await ShowPrep.went({ ...past, end: null, doors: null, links: {}, tickets: [], platforms: [] }, { rating: 4, moment: 'The encore' });
  await ShowPrep.openCard('log');
  const logBtn = await until(() => [...(top()?.querySelectorAll('.sp-entry') || [])].find((e) => /Last week at La Cigale/.test(e.textContent))?.querySelector('.tk-log'), 'the log\'s ticket button');
  step('Shows I went to: the night has "🎟 My ticket"', vis(logBtn));
  logBtn.click();
  await until(() => tv()?.classList.contains('tk-after'), 'the after view');
  step('after the night: "kept with it in Shows I went to", Remove visible', /night is over/.test(tv().querySelector('.tk-bright').textContent) && !!tv().querySelector('.tk-remove'));
  await shot('view-after');
  tv().querySelector('.tk-remove').click(); await wait(80);
  step('Remove asks for a second click first', /Click again/.test(tv().querySelector('.tk-remove').textContent) && (await op({ op: 'list' })).list.some((x) => x.key === past.key));
  tv().querySelector('.tk-remove').click();
  await until(async () => !(await op({ op: 'list' })).list.some((x) => x.key === past.key), 'removed after the night');
  step('…the second click moves it to the trash; the view closes', !tv());
  await closeAll();

  // ---------- 6. chat (secondary) ----------
  const reply = await run(`/shows ticket ${ufo.lineup[0] || ufo.title}`);
  await until(() => tv(), 'the view from chat');
  step('/shows ticket <show> opens the view', /is open/.test(reply) && /Ben UFO/.test(tv().querySelector('.tk-what').textContent), reply);
  tv().close();
  step('no AI call during the whole check; nothing outside Hearth\'s data folder was written', asks === 0 && (await window.hub.fs.list(DL)).length >= 2, { asks, dir: tinfo.dir });
} catch (err) {
  step('no exception', false, err.stack || err.message);
}
window.hub.askOnce = realAsk;
return JSON.stringify({ pass: !errors.length, errors, ...out }, null, 1);
