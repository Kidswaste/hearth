// (round 69, photos69) Photos in My Paris, in the app (isolated profile), on fixture records and photos MADE HERE the
// way phones write them (JPEGs with EXIF date, offset-less Paris wall clock, GPS, orientation; a PNG; a HEIC the Linux
// test machine can't open). Everything by CLICKING: the Paris map › a moment › 📷 Add photos (several files) and a drop
// of photos on another moment; the strip of thumbs, the viewer (‹ ›, keys, Remove → Trash), the pin getting the photo,
// 📷 From a folder… (suggestions by time and GPS; nothing added until Add), My month in Paris's "Photos on the card"
// toggle and the saved card. Checks the copies (long edge 2048 + 400 thumb, turned the right way up, JPEG, GPS removed,
// date kept), the originals byte-identical, nothing sent anywhere, no timers.
//   node dev/smoke.js --script dev/checks/photos69.js
const source = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
Object.defineProperty(HTMLImageElement.prototype, 'src', { ...source, set(value) { if (String(value).startsWith('https://tile.openstreetmap.org/')) { this.dataset.fixture = 'offline'; queueMicrotask(() => this.dispatchEvent(new Event('error'))); return; } source.set.call(this, value); } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, what, n = 200) => { for (let i = 0; i < n; i++) { try { if (await fn()) return; } catch { /* not yet */ } await wait(60); } throw Error(`timed out: ${what}`); };
const out = { steps: [] }; const fails = []; const skipped = [];
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : `: ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) fails.push(name); };
const root = () => document.querySelector('.qj');
const tmp = `${window.SMOKE_TMP || window.SMOKE_SAVES}/photos69`;
const sent = [];
const net = (u) => /^(?:https?|wss?):/i.test(String(u)) && !/^https?:\/\/(?:127\.0\.0\.1|localhost)[:/]/i.test(String(u));
const ofetch = window.fetch; window.fetch = function (u, ...a) { if (net(u?.url || u)) sent.push(String(u?.url || u)); return ofetch.call(this, u, ...a); };
const oopen = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u, ...a) { if (net(u)) sent.push(String(u)); return oopen.call(this, m, u, ...a); };
const OWS = window.WebSocket; window.WebSocket = function (u, p) { if (net(u)) sent.push(String(u)); return new OWS(u, p); };
const T = { n: 0 };
for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame', 'requestIdleCallback']) { const orig = window[name]; if (!orig) continue; window[name] = function (...a) { if (/parisphotos/.test(new Error().stack || '')) T.n++; return orig.apply(this, a); }; }
const sha = async (b) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', b))).map((x) => x.toString(16).padStart(2, '0')).join('');
// a real photo-like JPEG (w × h, a coloured frame with a marker top-left so "which way up" can be seen) + EXIF
async function photo(w, h, color, exif, type = 'image/jpeg') {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = color; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(0, 0, w / 4, h / 4); g.fillStyle = '#000'; g.fillRect(w / 3, h / 3, w / 3, h / 3);
  const b = new Uint8Array(await (await new Promise((r) => c.toBlob(r, type, 0.9))).arrayBuffer());
  return exif && type === 'image/jpeg' ? ParisPhotosCore.withExif(b, ParisPhotosCore.makeExif(exif)) : b;
}

try {
  // ---------- 1. fixtures: a journal (Le Bataclan done this month), a show night at La Cigale this month ----------
  await Lazy.load('questcore');
  const now = new Date(), Y = now.getFullYear(), M = now.getMonth();
  const at = (d, h) => new Date(Y, M, d, h).getTime();
  const showStart = at(1, 20), bataclanDone = at(2, 15);
  const showKey = 'fixturecigale69';
  await window.hub.kvSet('show-nights', { v: 1, prep: {}, went: [{ id: `went-${showKey}`, key: showKey, show: { key: showKey, title: 'Fixture Band at La Cigale', start: showStart, end: null, doors: null, venue: { key: '', name: 'La Cigale', address: '120 boulevard de Rochechouart, 75018 Paris', lat: 48.8822, lon: 2.3404, url: '' }, lineup: ['Fixture Band'], links: {}, tickets: [], platforms: [] }, rating: 4, moment: 'Loud and kind', photo: null, note: '', questId: '', at: new Date(showStart).toISOString(), updatedAt: new Date(showStart).toISOString() }] });
  await Lazy.load('questjournal');
  const C = QuestCore, P = QuestParis, K = ParisPhotosCore;
  const s = C.upgrade(C.initial()); P.addGuide(s);
  const c = P.startPlace(s, 'pp-bataclan'); c.quests.forEach((q) => { s.records[q.id] = { startedAt: new Date(bataclanDone).toISOString(), completedAt: new Date(bataclanDone).toISOString() }; });
  C.validate(s); await window.hub.kvSet('quest-journal', s);
  ParisPhotos._test.zone = 'Europe/Paris'; // the owner's computer: cameras write Paris wall-clock time
  const Z = 'Europe/Paris', ex = (t, more = {}) => ({ date: K.exifDate(t, Z), ...more });
  // the photos (originals), as a phone import: during the show, near La Cigale, turned (orientation 6); a PNG; a HEIC
  const orig = `${tmp}/originals`, files = {
    show1: [`${orig}/IMG_1001.JPG`, await photo(3000, 2000, '#c0396b', ex(showStart + 90 * 60e3, { gps: { lat: 48.8826, lon: 2.3408 }, orientation: 6, make: 'Apple' }))],
    show2: [`${orig}/IMG_1002.JPG`, await photo(2400, 1600, '#2f7fd0', ex(showStart + 120 * 60e3, { gps: { lat: 48.8824, lon: 2.3401 } }))],
    png: [`${orig}/screenshot.png`, await photo(600, 400, '#3a9c5a', null, 'image/png')],
    heic: [`${orig}/IMG_1003.HEIC`, new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode('ftypheic'), 0, 0, 0, 0, ...new TextEncoder().encode('mif1heic'), ...new Array(200).fill(9)])],
    bat: [`${orig}/IMG_2001.JPG`, await photo(1800, 1200, '#d9b777', ex(bataclanDone - 60 * 60e3, { gps: { lat: 48.8632, lon: 2.3709 } }))],
  };
  for (const [p, b] of Object.values(files)) await window.hub.fs.write(p, b);
  const hashes = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([k, [, b]]) => [k, await sha(b)])));
  step('fixtures: a journal, a show night, 5 originals (2 JPEG with EXIF + GPS, a PNG, a HEIC, 1 more JPEG)', true);

  // ---------- 2. by clicking: ✦ chip → Open Sidequest Studio → Map → the La Cigale pin → its moment ----------
  const click = (b, what) => { if (!b) throw Error(`no button: ${what}`); b.click(); };
  const byText = (scope, t) => [...(scope || document).querySelectorAll('button')].find((b) => b.textContent.trim() === t || b.textContent.trim().startsWith(t));
  await QuestHud.refresh();
  await until(() => document.querySelector('#rail .qh-chip') && !document.querySelector('#rail .qh-chip').hidden, 'the ✦ chip');
  click(document.querySelector('#rail .qh-chip'), '✦ chip');
  await until(() => document.querySelector('.qh-foot [data-k="studio"]'), 'the tracker panel');
  click(document.querySelector('.qh-foot [data-k="studio"]'), 'Open Sidequest Studio');
  const mapKey = () => root()?.querySelector('.qj-command-tab[data-nav-group="map"]');
  await until(() => mapKey() && QuestJournal.ready(), 'the Studio');
  ParisJournal._test.dir = `${tmp}/cards`;
  click(mapKey(), 'Map');
  await until(() => root()?.querySelectorAll('.qj-atlas-pin[data-place^="mp-"]').length >= 2, 'My Paris pins');
  const pins = () => [...root().querySelectorAll('.qj-atlas-pin[data-place^="mp-"]')];
  const pinOf = (re) => pins().find((b) => re.test(b.getAttribute('aria-label')));
  step('the map shows the two moments, no photo on their pins yet', pins().length === 2 && !pins().some((b) => b.querySelector('img.qj-atlas-logo')), pins().map((b) => b.getAttribute('aria-label')));
  const strip = () => root().querySelector('.pj-strip');
  step('📷 From a folder… sits in the strip under the map, beside My month in Paris', Boolean(byText(strip(), '📷 From a folder…')) && Boolean(byText(strip(), 'My month in Paris')));
  click(pinOf(/Cigale/), 'the Cigale pin');
  await until(() => root().querySelector('dialog[open].pj-dialog .pp-row'), 'the moment with its photo row');
  let d = root().querySelector('dialog[open].pj-dialog');
  step('the moment shows "📷 Add photos" (visible label) and a Keep location box, off by default', Boolean(byText(d, '📷 Add photos')) && d.querySelector('.pp-keep input')?.checked === false && !d.querySelector('.pp-thumb'));

  // ---------- 3. 📷 Add photos: several at once (JPEG ×2, PNG, HEIC) ----------
  ParisPhotos._test.pick = [files.show1[0], files.show2[0], files.png[0], files.heic[0]];
  click(byText(d, '📷 Add photos'), '📷 Add photos');
  await until(() => /Added 3 photos/.test(d.querySelector('.pp-status')?.textContent || ''), 'three added', 400);
  const status = d.querySelector('.pp-status').textContent;
  step('3 photos added (copies), the HEIC left out with a plain why on this computer (Linux: no HEIC reader)', /Added 3 photos \(copies; your originals are untouched\)/.test(status) && /1 left out: HEIC/.test(status) && /HEIC photos/.test(status), status);
  await until(() => d.querySelectorAll('.pp-thumb img').length === 3, 'the strip');
  const thumbs = [...d.querySelectorAll('.pp-thumb img')];
  await until(() => thumbs.every((i) => i.complete && i.naturalWidth > 0), 'thumbs drawn');
  step('the moment shows a strip of 3 thumbs (400 px copies, file: URLs), in the order they were taken', thumbs.every((i) => i.src.startsWith('file:') && /\.thumb\.jpg$/.test(i.src) && Math.max(i.naturalWidth, i.naturalHeight) <= 400), thumbs.map((i) => `${i.naturalWidth}x${i.naturalHeight}`));
  const kept = (await window.hub.kvGet('paris-photos')).photos, made = ParisPhotos._test.made;
  const rec1 = kept.find((p) => p.name === 'IMG_1001.JPG'), recPng = kept.find((p) => p.name === 'screenshot.png');
  step('kept list: 3 rows on the show moment, relative paths in paris-photos/<month>/, the date taken (EXIF, Paris time)', kept.length === 3 && kept.every((p) => p.moment === `show-${showKey}` && /^paris-photos\/\d{4}-\d\d\/ph-[a-z0-9-]+\.jpg$/.test(p.file)) && rec1.taken === new Date(showStart + 90 * 60e3).toISOString() && rec1.takenFrom === 'zone' && !rec1.gps, rec1);
  const m1 = made.find((x) => x.id === rec1.id), mPng = made.find((x) => x.id === recPng.id);
  step('sizes: the 3000×2000 photo turned upright (EXIF 6) → 1365×2048 + 267×400 thumb; the 600×400 PNG not blown up', m1.w === 1365 && m1.h === 2048 && m1.tw === 267 && m1.th === 400 && mPng.w === 600 && mPng.h === 400, { m1, mPng });
  const abs = (rel) => WinMac.join(ParisPhotos.root, ...rel.split('/'));
  const copy = new Uint8Array(await window.hub.fs.read(abs(rec1.file), { encoding: 'buffer' })), cx = K.readExif(copy);
  step('the stored copy is a JPEG with the date kept and NO GPS (Keep location off), upright (no orientation tag)', cx.kind === 'jpeg' && cx.gps === null && cx.date === K.exifDate(showStart + 90 * 60e3, Z) && cx.orientation === 1 && cx.w === 1365 && cx.h === 2048, cx);
  const same = await Promise.all(Object.entries(files).map(async ([k, [p]]) => (await sha(new Uint8Array(await window.hub.fs.read(p, { encoding: 'buffer' })))) === hashes[k]));
  step('the originals are byte-identical (only read)', same.every(Boolean));
  await smoke({ shot: `${tmp}/photos-moment.png` });

  // ---------- 4. the viewer: click a thumb, ‹ ›, keys, Remove (two clicks → the copies to the Trash) ----------
  click(d.querySelector('.pp-thumb'), 'the first thumb');
  await until(() => root().querySelector('dialog[open].pp-viewer img.pp-big')?.naturalWidth > 0, 'the viewer');
  let v = root().querySelector('dialog[open].pp-viewer');
  const first = v.dataset.photo;
  step('a thumb opens the viewer: the 2048 copy, "1 of 3 · taken …"', /^1 of 3 · taken /.test(v.querySelector('.pp-cap').textContent) && Math.max(v.querySelector('.pp-big').naturalWidth, v.querySelector('.pp-big').naturalHeight) === 2048, v.querySelector('.pp-cap').textContent);
  click(byText(v, 'Next ›'), 'Next ›'); await until(() => v.dataset.photo !== first, 'next photo');
  step('Next › goes to photo 2', /^2 of 3/.test(v.querySelector('.pp-cap').textContent));
  v.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await until(() => v.dataset.photo === first, 'back with ←');
  step('← goes back', /^1 of 3/.test(v.querySelector('.pp-cap').textContent));
  click(byText(v, 'Remove photo'), 'Remove photo');
  step('Remove asks for a second click first (nothing removed yet)', /Click again/.test(v.textContent) && (await window.hub.kvGet('paris-photos')).photos.length === 3);
  click(byText(v, 'Click again'), 'Click again');
  await until(() => /Trash/.test(v.querySelector('.pp-vstatus')?.textContent || ''), 'the Trash answer');
  const vs = v.querySelector('.pp-vstatus').textContent;
  if (/Couldn't move it to the Trash/.test(vs)) { skipped.push('Trash on this Linux test machine'); step('Remove: the Trash refused here, so nothing was removed and it says why', (await window.hub.kvGet('paris-photos')).photos.length === 3, vs); }
  else {
    const left = (await window.hub.kvGet('paris-photos')).photos;
    const gone = await window.hub.fs.stat(abs(rec1.file));
    step('Remove: Hearth\'s copies went to the Trash, the original stays, 2 photos left', left.length === 2 && !left.some((p) => p.id === first) && !gone && Boolean(await window.hub.fs.stat(files.show1[0])) && /^1 of 2/.test(v.querySelector('.pp-cap').textContent), vs);
  }
  click(byText(v, '×'), 'close viewer'); await wait(200);
  click(byText(d, '×'), 'close moment'); await wait(200);
  await until(() => pinOf(/Cigale/)?.querySelector('img.qj-atlas-logo'), 'the pin\'s photo');
  step('the La Cigale pin now shows one of its photos (the thumb), and its dot is filled', /\.thumb\.jpg$/.test(pinOf(/Cigale/).querySelector('img.qj-atlas-logo').src) && Boolean(root().querySelector('.pj-dot.pj-show.has-photo')));

  // ---------- 5. drop photos on another moment (Le Bataclan) ----------
  click(pinOf(/Bataclan/), 'the Bataclan pin');
  await until(() => root().querySelector('dialog[open].pj-dialog .pp-row'), 'the Bataclan moment');
  d = root().querySelector('dialog[open].pj-dialog');
  const card = d.querySelector('.pj-moment'), dt = new DataTransfer();
  dt.items.add(new File([files.bat[1]], 'IMG_2001.JPG', { type: 'image/jpeg', lastModified: bataclanDone }));
  card.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
  const outlined = card.classList.contains('pp-drop');
  card.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  await until(() => /Added 1 photo/.test(d.querySelector('.pp-status')?.textContent || ''), 'the dropped photo', 300);
  step('dropping a photo on a moment outlines it, then adds it (1 thumb)', outlined && d.querySelectorAll('.pp-thumb').length === 1, d.querySelector('.pp-status').textContent);
  // dropping the same photo again: "already here"
  card.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  await until(() => /already here/.test(d.querySelector('.pp-status')?.textContent || ''), 'the same photo again');
  step('the same photo twice is kept once ("already here")', d.querySelectorAll('.pp-thumb').length === 1);
  click(byText(d, '×'), 'close'); await wait(200);

  // ---------- 6. 📷 From a folder…: suggestions by time and GPS; nothing added until Add ----------
  const imp = `${tmp}/import/DCIM/100APPLE`;
  await window.hub.fs.write(`${imp}/IMG_3001.JPG`, await photo(1600, 1200, '#8844aa', ex(showStart + 150 * 60e3, { gps: { lat: 48.8821, lon: 2.3409 } }))); // the show, close by
  await window.hub.fs.write(`${imp}/IMG_3002.JPG`, await photo(1600, 1200, '#aa4488', ex(bataclanDone - 2 * 3600e3, { gps: { lat: 48.8633, lon: 2.3706 } }))); // Le Bataclan, before ticking it done
  await window.hub.fs.write(`${imp}/IMG_3003.JPG`, await photo(1600, 1200, '#44aa88', ex(showStart + 100 * 60e3, { gps: { lat: 48.8462, lon: 2.3371 } }))); // show time but 4 km away
  await window.hub.fs.write(`${imp}/IMG_3004.JPG`, await photo(1600, 1200, '#4488aa', ex(at(3, 9) + 86400e3 * 3))); // nothing that day
  await window.hub.fs.write(`${tmp}/import/DCIM/IMG_3005.JPG`, await photo(1600, 1200, '#aa8844', ex(showStart + 30 * 60e3))); // the show, no GPS (time alone), one folder up
  await window.hub.fs.write(`${tmp}/import/notes.txt`, new TextEncoder().encode('not a photo'));
  const before = (await window.hub.kvGet('paris-photos')).photos.length;
  ParisPhotos._test.folder = `${tmp}/import`;
  click(byText(strip(), '📷 From a folder…'), '📷 From a folder…');
  await until(() => root().querySelector('dialog[open].pp-folder'), 'the suggestions', 300);
  d = root().querySelector('dialog[open].pp-folder');
  const groups = [...d.querySelectorAll('.pp-group')].map((g) => ({ moment: g.dataset.moment, n: g.querySelectorAll('.pp-tile').length, why: [...g.querySelectorAll('small')].map((x) => x.textContent).join(' | ') }));
  step('From a folder: 5 photos read (the .txt ignored), suggested for 2 moments by time and GPS, the far one and the off day left out', /^5 photos in import/.test(d.querySelector('.pp-intro').textContent) && groups.length === 2 && groups.find((g) => g.moment === `show-${showKey}`)?.n === 2 && groups.find((g) => /^place-/.test(g.moment))?.n === 1 && /2 didn't match any moment/.test(d.textContent), { groups, intro: d.querySelector('.pp-intro').textContent });
  step('each suggestion says why ("taken … · N m from La Cigale"), ticked, with "nothing is added until you click Add"', /taken \d+ \w+ · \d\d:\d\d · \d+ m from La Cigale/.test(groups.find((g) => g.moment === `show-${showKey}`).why) && [...d.querySelectorAll('.pp-tile input')].every((x) => x.checked) && /nothing is added until you click Add/.test(d.textContent));
  step('nothing was added by the suggestions alone', (await window.hub.kvGet('paris-photos')).photos.length === before);
  await smoke({ shot: `${tmp}/photos-folder.png` });
  const batGroup = [...d.querySelectorAll('.pp-group')].find((g) => /^place-/.test(g.dataset.moment));
  click(byText(batGroup, 'Add 1 to this moment'), 'Add 1 to this moment');
  await until(() => /Added 1 photo/.test(d.querySelector('.pp-fstatus')?.textContent || ''), 'added from the folder', 300);
  const showGroup = [...d.querySelectorAll('.pp-group')].find((g) => g.dataset.moment === `show-${showKey}`);
  showGroup.querySelectorAll('.pp-tile input')[1].click(); // untick one
  click(byText(showGroup, 'Add 2 to this moment'), 'Add (1 ticked)');
  await until(() => /Added 1 photo/.test(d.querySelector('.pp-fstatus')?.textContent || '') && /La Cigale/.test(d.querySelector('.pp-fstatus').textContent), 'one of two', 300);
  const after = (await window.hub.kvGet('paris-photos')).photos;
  step('Add on a group adds only the ticked photos to that moment (Bataclan +1, the show +1 of 2)', after.length === before + 2 && after.filter((p) => /^place-/.test(p.moment)).length === 2, after.map((p) => `${p.moment}:${p.name}`));
  click(byText(d, '×'), 'close'); await wait(200);

  // ---------- 7. My month in Paris: "Photos on the card" (toggle) and the saved card ----------
  click(byText(strip(), 'My month in Paris'), 'My month in Paris');
  await until(() => root().querySelector('dialog[open].pj-recap .pj-cardpics'), 'the recap with its photos toggle');
  d = root().querySelector('dialog[open].pj-recap');
  const tog = d.querySelector('.pj-cardpics input');
  step('My month in Paris: "Photos on the card (4 of up to 4)", ticked, with the 4 it will use', tog.checked && /Photos on the card \(4 of up to 4\)/.test(d.querySelector('.pj-cardpics').textContent) && d.querySelectorAll('.pp-cardpics img').length === 4, d.querySelector('.pj-cardpics').textContent);
  await smoke({ shot: `${tmp}/photos-recap.png` });
  click(byText(d, 'Save image card'), 'Save image card');
  await until(() => ParisJournal._test.saved.length === 1, 'the card');
  await window.hub.fs.copy(ParisJournal._test.saved[0].file, `${tmp}/card-with-photos.png`); // (kept to look at; the next save writes the same name)
  tog.click(); await wait(50);
  click(byText(d, 'Save image card'), 'Save image card (no photos)');
  await until(() => ParisJournal._test.saved.length === 2, 'the second card');
  const [c1, c2] = ParisJournal._test.saved;
  step('the saved card carries 4 photos; with the toggle off, none (remembered on this computer)', c1.photos === 4 && c2.photos === 0 && c1.w === 1080 && c1.h === 1350 && ParisJournal.prefs.cardPhotos === false && store.get('parisjournal64', {}).cardPhotos === false, { c1, c2 });
  tog.click();
  click(byText(d, '×'), 'close'); await wait(200);

  // ---------- 8. nothing sent, no timers, lazy ----------
  step('Photos ride in the Studio\'s lazy group (nothing on the first screen)', Lazy.isIn('questjournal') && typeof ParisPhotos === 'object');
  const t0 = T.n; await wait(1200);
  step('idle: the photos code runs no timers', T.n === t0, T.n - t0);
  step('nothing sent anywhere during the whole check', sent.length === 0, sent);
} catch (err) { step('the check ran to the end', false, String(err?.stack || err).slice(0, 500)); }
return JSON.stringify({ pass: !fails.length, errors: fails, ...(skipped.length ? { skipped } : {}), ...out }, null, 1);
