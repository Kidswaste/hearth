// Assist (assist.js) with the fake engines: shuffle & pick (picker, click, ✦ Astra picks, keep + undo, hold Shuffle,
// save as a named look), names from content (/name, /name astra, quick looks), /usual, next-step chips after a
// director reply (+ "What would Astra do?"), /decide saved, Review with Astra (frame + sheet, undo), the token log.
//   sh dev/make-test-videos.sh /tmp/hearth-test-videos
//   node dev/smoke.js --fake-engines --check-timeout 400000 --script dev/checks/assist.js --shot /tmp/assist.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(150); } return null; };
const shots = window.ASSIST_SHOTS || '/tmp';
const out = {};
const C = H.claudeAgent();
const run = (line, id = C.id) => Commands.tryRun(line, id);
const fails = [];
const ok = (name, cond, info) => { out[name] = info === undefined ? Boolean(cond) : info; if (!cond) fails.push(name); };

// ---------- the Lab ----------
activate('tool:three'); await wait(3500);
const c = await ThreeLab.cmd(); await wait(1500);
const d = ThreeLab.director;
const vals = () => JSON.stringify(Object.fromEntries(d.sliders().sliders.map((s) => [s.key, s.value])));
ok('sliders', d.sliders().sliders.length > 0, d.sliders().sliders.length);
const base0 = vals();

// 1. /shuffle-pick 4: a picker with Before + 4 thumbnails, nothing changed yet
await run('/shuffle-pick 4');
const picker = await until(() => document.querySelector('.as-pick'), 20000);
ok('pickerOpen', picker);
const tiles = [...document.querySelectorAll('.as-pick .as-tile')];
ok('tiles', tiles.length === 5 && tiles.every((t) => t.querySelector('img')), `${tiles.length} tiles, ${tiles.filter((t) => t.querySelector('img')).length} with pictures`);
ok('unchangedUntilPick', vals() === base0);
// click variation 3: the sliders take its values
tiles[3].click(); await wait(400);
ok('clickApplies', vals() !== base0 && document.querySelectorAll('.as-tile.on').length === 1);
// ✦ Astra picks (fake Astra answers "2 — …")
document.querySelector('.as-pick .as-astra').click();
const verdict = await until(() => { const v = document.querySelector('.as-verdict'); return v && !v.hidden && v.textContent; }, 30000);
ok('astraVerdict', /picks 2/.test(verdict || ''), verdict);
ok('astraTile', document.querySelector('.as-tile.on .as-num')?.textContent === '✦ 2');
await smoke({ shot: `${shots}/assist-picker.png` });
const picked = vals();
// keyboard: Enter keeps; the toast offers Undo
document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
await wait(300);
ok('keptClosed', !document.querySelector('.as-pick') && vals() === picked);
ok('undoToast', [...document.querySelectorAll('.toast')].some((t) => /Kept variation 2/.test(t.textContent) && /Undo/.test(t.textContent)));
await run('/assist undo'); await wait(300);
ok('undoBack', vals() === base0);

// 2. hold 🎲 Shuffle: the picker opens, and the release doesn't also shuffle
const sb = document.querySelector('.tw-shuffle');
const hist0 = c.shuffleInfo().history;
sb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
await wait(700);
sb.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, button: 0 }));
sb.click();
const p2 = await until(() => document.querySelector('.as-pick .as-tile img') && document.querySelectorAll('.as-pick .as-tile').length === 5, 20000);
ok('holdOpens', p2);
await wait(300);
// "↻ 4 more" from variation 1, then ✦ Save as look: a name from its colors, not "Look 1"
document.querySelectorAll('.as-pick .as-tile')[1].click(); await wait(300);
const more = [...document.querySelectorAll('.as-pick button')].find((b) => /more/.test(b.textContent));
more.click();
await until(() => document.querySelector('.as-pick .as-tile .as-num')?.textContent === 'Now', 20000);
ok('moreFromThis', document.querySelector('.as-pick .as-tile .as-num')?.textContent === 'Now');
ok('holdNoExtraShuffle', c.shuffleInfo().history >= hist0, `${hist0} → ${c.shuffleInfo().history}`);
const looks0 = c.looks().length;
[...document.querySelectorAll('.as-pick button')].find((b) => /Save as look/.test(b.textContent)).click();
await wait(500);
const lookNames = c.looks();
ok('savedNamedLook', lookNames.length === looks0 + 1 && !/^Look \d+$/.test(lookNames.at(-1)), lookNames);

// 3. quick look names and the ✦ in the looks row
c.saveLook(''); await wait(300);
ok('quickLookName', !/^Look \d+$/.test(c.looks().at(-1)), c.looks().at(-1));
ok('lookDecideBtn', Boolean(document.querySelector('.tw-chip.as-decide')));
const r = await Decide.run('saved'); await wait(600);
ok('decideSaved', /Astra/.test(r.by) && c.looks().includes(r.pick), `${r.pick} by ${r.by}`);
await Decide.undo(); await wait(300);

// 4. names: /name (no tokens), /name astra, undo
const sk0 = c.state.sketch;
const logN0 = store.get('assist.log', []).length;
await run('/name'); await wait(300);
const sk1 = c.state.sketch;
ok('nameLocal', sk1 && sk1 !== sk0 && store.get('assist.log', []).length === logN0, `${sk0} → ${sk1}`);
await run('/assist undo'); await wait(200);
ok('nameUndo', c.state.sketch === sk0);
await run('/name astra'); await wait(300);
ok('nameAstra', c.state.sketch === 'Ember Tide', c.state.sketch);
await run('/assist undo'); await wait(200);

// 5. your usual frame: learned from clicks, applied by /usual (with undo)
c.size('4:5'); Usage.track('Test › a click'); c.size('fit'); Usage.track('Test › another click');
await run('/usual'); await wait(400);
ok('usual', c.state.frame.id === '4:5', c.state.frame.id);
await run('/assist undo'); await wait(300);
ok('usualUndo', c.state.frame.id === 'fit');

// 6. next steps after a director reply (no model call), then "✦ What would Astra do?"
await run('/director-setup'); await until(() => H.agents().find((a) => a.dock === 'three'), 8000);
const dir = H.agents().find((a) => a.dock === 'three');
activate('tool:three'); await wait(1500);
c.shuffle({}); await wait(300); // an unsaved change → a "Save" step
const logN1 = store.get('assist.log', []).length;
Native.sendText(dir.id, 'hello there');
const steps = await until(() => { const g = document.querySelector('.as-next'); return g && [...g.querySelectorAll('.dd-chip')].map((b) => b.textContent); }, 30000);
ok('nextSteps', steps && steps.length >= 2 && steps.at(-1) === '✦ What would Astra do?' && store.get('assist.log', []).length === logN1, steps);
await smoke({ shot: `${shots}/assist-next.png` });
document.querySelector('.as-astra-step').click();
const idea = await until(() => { const b = document.querySelector('.as-astra-step'); return b && /pulse/.test(b.textContent) && b.textContent; }, 30000);
ok('astraNext', idea, idea);
await smoke({ shot: `${shots}/assist-next-astra.png` });
// /next in a chat: the same steps as a note with buttons
await run('/next', dir.id); await wait(400);
// a jam's end shows "Jam 2 more"
dispatchEvent(new CustomEvent('hearth:jam-end', { detail: { status: 'done' } })); await wait(500);
ok('jamSteps', [...document.querySelectorAll('.as-next .dd-chip')].some((b) => /Jam 2 more/.test(b.textContent)));

// ---------- Video Review ----------
const SRC = window.VIDS || '/tmp/hearth-test-videos';
const VIDS = `${window.SMOKE_SAVES}/renders`;
await window.hub.fs.write(`${VIDS}/.keep`, '');
for (const f of (await window.hub.fs.list(SRC)).filter((x) => !x.isDir && /\.mp4$/.test(x.name))) await window.hub.fs.copy(f.path, `${VIDS}/${f.name}`);
activate(C.id); await wait(300);
await run(`/video-folders add ${VIDS}`); await wait(1500);
activate('tool:ae'); await Review.ensureMounted(); await until(() => Review.videos.length >= 3, 10000);
await Review.open(Review.videos.find((v) => /neon_tunnel_v2/.test(v.path)) || Review.videos[0]); await Review.waitReady?.().catch(() => null); await wait(800);
Review.seek(1.2); await wait(500);
const n0 = Review.notes().length;
await run('/review-astra'); await wait(600);
const added = Review.notes().filter((n) => n.by === 'Astra');
ok('reviewNotes', added.length === 2 && added.every((n) => n.frame), added.map((n) => `${n.t.toFixed(2)} ${n.text}`));
await smoke({ shot: `${shots}/assist-review.png` });
await run('/assist undo'); await wait(300);
ok('reviewUndo', Review.notes().length === n0);
await run('/review-astra sheet'); await wait(600);
const sheetNotes = Review.notes().filter((n) => n.by === 'Astra');
ok('reviewSheet', sheetNotes.length === 2 && Math.abs(sheetNotes[0].t - 1) < 0.1 && Math.abs(sheetNotes[1].t - 2) < 0.1, sheetNotes.map((n) => n.t));
ok('reviewChip', DirectorDock.CHIPS.ae.some((x) => x.run === '/review-astra'));

// ---------- costs, commands ----------
const log = store.get('assist.log', []);
out.log = log.map((e) => `${e.kind} by ${e.by}: ${e.input}+${e.output} tokens, ${e.promptChars} ch, ${e.images} img`);
ok('duplicates', Commands.duplicates().length === 0, Commands.duplicates());
ok('commands', ['shuffle-pick', 'astra-pick', 'name', 'usual', 'next', 'review-astra', 'assist'].every((n) => Commands.get(n)?.area === 'Assist'));
out.fails = fails;
out.ok = !fails.length;
return JSON.stringify(out, null, 1);
