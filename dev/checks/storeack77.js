// (round 77, storeack77) Stores the window holds, when the other computer's version arrives, in the app, through the
// real sync engine (a temp cloud folder; "the Mac" edits the cloud copy, then Sync now pulls it — the engine's own
// sync:pulled → hearth:synced → StoreAck): the Notes panel open with the caret in the middle of a note being typed →
// the Mac's new note shows in the list, the caret and focus stay, what was typed is kept (written first, merged); the
// Mac's note deleted here right away stays deleted in the cloud. The board on screen: a picture added on the Mac
// appears on it, taken off here it stays off. The Lab: a scene made on the Mac joins the picker, a scene deleted on the
// Mac leaves it. Each time sync is told (ack): the guard no longer holds the old base.
//   node dev/smoke.js --check-timeout 240000 --lib dev/checks/journey-lib.js --script dev/checks/storeack77.js
const { step, wait, until, click, type } = J;
const api = window.hub.sync;
const CLOUD = `/tmp/hearth-storeack77-${Date.now()}`;
const MAC = { id: 'studio-mac-77a2b3c4', name: 'Studio Mac', platform: 'darwin', dataDir: '/Users/q/Library/Application Support/Hearth/data', home: '/Users/q', lastSeen: Date.now() - 60000, lastOk: Date.now() - 60000 };
await window.hub.fs.write(`${CLOUD}/Hearth/.sync/machines/${MAC.id}.json`, JSON.stringify(MAC));
await window.hub.fs.write(`${CLOUD}/Hearth/files/.keep-folder`, '');
await api.on({ root: CLOUD });
await Sync.refresh();
await until(() => Sync.status().state === 'synced', 20000);
await wait(1200);
const gotIt = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Got it' && J.visible(b));
if (gotIt) { await click(gotIt); await wait(300); }
const cloudOf = (rel) => `${CLOUD}/Hearth/files/${rel}`;
const cloudJson = async (rel) => { try { return JSON.parse(await window.hub.fs.read(cloudOf(rel))); } catch { return null; } };
// the Mac's change, as its sync would leave it in the cloud folder
const macEdit = async (rel, fn) => { const v = fn(await cloudJson(rel)); await window.hub.fs.write(cloudOf(rel), JSON.stringify(v, null, 2)); };
const acks = []; const sa0 = StoreAck.arrived; StoreAck.arrived = async (f) => { const r = await sa0(f); acks.push(r); return r; }; // what StoreAck acked each time
const pulled = []; addEventListener('hearth:synced', (e) => pulled.push(...(e.detail?.files || []).map((f) => f.rel)));
const syncNow = async () => { await Sync.now(); await wait(600); };

// ---------- 1. Notes: typing while the Mac's note arrives ----------
await Notes.create({ text: '# Shot list\n- one\n- two\n- three', focus: true });
await wait(900); await syncNow();
await until(async () => (await cloudJson('kv/notes.json'))?.some?.((n) => /Shot list/.test(n.text)), 15000);
step('the note is in the cloud folder (first sync)', (await cloudJson('kv/notes.json'))?.some((n) => /Shot list/.test(n.text)));
await macEdit('kv/notes.json', (l) => [{ id: 'nmac77', title: 'From the Mac', text: '# From the Mac\nsketch ideas', updatedAt: Date.now() }, ...l]);
const area = document.querySelector('.notes-panel textarea');
await click(area);
const at = area.value.indexOf('- one') + '- one'.length;
area.setSelectionRange(at, at);
await type(', typed here');
const caret = area.selectionStart;
await syncNow();
await until(() => [...document.querySelectorAll('.notes-panel .notes-item')].some((b) => /From the Mac/.test(b.textContent)), 15000);
step('the Mac\'s note shows in the open Notes list by itself', [...document.querySelectorAll('.notes-panel .notes-item')].some((b) => /From the Mac/.test(b.textContent)), [...document.querySelectorAll('.notes-panel .notes-item')].map((b) => b.textContent));
step('…the note being typed in keeps focus, caret and what was typed', document.activeElement === area && area.selectionStart === caret && area.value.includes('- one, typed here'), { focus: document.activeElement === area, caret: [area.selectionStart, caret], text: area.value });
const disk = await window.hub.kvGet('notes', []);
step('…and both are on disk (written first, then read again)', disk.some((n) => n.id === 'nmac77') && disk.some((n) => /typed here/.test(n.text)), disk.map((n) => n.title));
step('sync was told the window holds what arrived (ack)', acks.some((a) => a.acked.includes('kv/notes.json')), acks);
await smoke({ shot: '/tmp/storeack77-notes.png' });
// the Mac's note deleted here right away: it stays deleted
await click([...document.querySelectorAll('.notes-panel .notes-item')].find((b) => /From the Mac/.test(b.textContent)));
await click([...document.querySelectorAll('.notes-panel button')].find((b) => b.textContent.trim() === 'Delete'));
await until(() => [...document.querySelectorAll('dialog button')].some((b) => b.textContent.trim() === 'Delete' && J.visible(b)), 4000);
await click([...document.querySelectorAll('dialog button')].find((b) => b.textContent.trim() === 'Delete' && J.visible(b)));
await wait(900); await syncNow(); await syncNow();
const cn = await cloudJson('kv/notes.json');
step('the Mac\'s note deleted here right after it arrived stays deleted (in the cloud too)', !cn?.some((n) => n.id === 'nmac77') && !(await window.hub.kvGet('notes', [])).some((n) => n.id === 'nmac77') && cn?.some((n) => /typed here/.test(n.text)), cn?.map((n) => n.title));
Notes.close();

// ---------- 2. the board on screen ----------
activate('tool:board');
await until(() => Board.isMounted() && Board.current(), 20000);
const b = Board.current();
Board.addNote('mood');
await wait(800); await Board.save(b, { now: true }); await syncNow();
await until(async () => (await cloudJson(`kv/board-${b.id}.json`))?.items?.length > 0, 15000);
await macEdit(`kv/board-${b.id}.json`, (v) => ({ ...v, items: [...v.items, { id: 'imac77', type: 'note', text: 'from the Mac', x: 40, y: 40, w: 220, h: 120 }] }));
await syncNow();
await until(() => Board.items().some((i) => i.id === 'imac77') && document.querySelector('.bd-item[data-id="imac77"]'), 15000);
step('a note added on the Mac appears on the board on screen', Board.items().some((i) => i.id === 'imac77') && Boolean(document.querySelector('.bd-item[data-id="imac77"]')), Board.items().map((i) => i.id));
step('…the board on screen is the same board (view kept)', Board.current() === b);
await smoke({ shot: '/tmp/storeack77-board.png' });
Board.removeItems(['imac77']);
await wait(900); await syncNow(); await syncNow();
const cb = await cloudJson(`kv/board-${b.id}.json`);
step('taken off here right after it arrived, it stays off (in the cloud too)', !cb?.items?.some((i) => i.id === 'imac77') && !Board.items().some((i) => i.id === 'imac77'), cb?.items?.map((i) => i.id));

// ---------- 3. the Lab's scenes ----------
activate('tool:three');
await until(() => window.ThreeLab?.scenes?.all?.().length > 0 && ThreeLab.scenes.currentId(), 40000);
await wait(1500); await syncNow();
await until(async () => Array.isArray(await cloudJson('kv/three-sketches.json')), 15000);
await macEdit('kv/three-sketches.json', (l) => [...l, { id: 'smac77', name: 'Mac scene', code: '// from the Mac', updatedAt: Date.now() }]);
await syncNow();
await until(() => ThreeLab.scenes.get('smac77'), 15000);
step('a scene made on the Mac joins the Lab by itself', Boolean(ThreeLab.scenes.get('smac77')));
const cur = ThreeLab.scenes.currentId();
await macEdit('kv/three-sketches.json', (l) => l.filter((x) => x.id !== 'smac77'));
await syncNow();
await until(() => !ThreeLab.scenes.get('smac77'), 15000);
step('…deleted on the Mac, it leaves the Lab (the scene on screen stays open)', !ThreeLab.scenes.get('smac77') && ThreeLab.scenes.currentId() === cur, { cur, now: ThreeLab.scenes.currentId() });
step('the Lab\'s scenes were acked', acks.some((a) => a.acked.includes('kv/three-sketches.json')), acks);

StoreAck.arrived = sa0;
await api.off();
return J.done();
