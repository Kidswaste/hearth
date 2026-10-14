// 🎨 "Make it look like this" (round 28, lookmatch), on generated test pictures and a generated clip: loaded with the
// Lab; the ◎ mission (Lab director only), ✦ More › ✨ Look & motion, a board item's right-click, a picture dropped on
// the preview (Chrome's own drag with a file) all lead to it; a warm, faded, grainy picture → ◐ Grade with warmth,
// lifted blacks and grain, the palette from it, the card, closer than before; Strength moves the layer; ↶ Undo puts
// the scene back; a cool black & white picture with bars → saturation 0, bars; a clip → its motion; asking the
// director shows the cost first and sends a small picture + the numbers; the mission's picker lists the board.
//   node dev/smoke.js --fake-engines --check-timeout 240000 --script dev/checks/lookmatch.js --shot /tmp/lookmatch.png
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push({ name, ok: Boolean(ok), ...(info === undefined ? {} : { info }) }); };
const { wait, until } = SQL;
const cdp = (name, params) => smoke({ cdp: name, params });

await Commands.tryRun('/director-setup', H.claudeAgent().id);
await until(() => H.agents().some((a) => a.dock === 'three'));
await SQL.lab();
await until(() => typeof LookMatch !== 'undefined', 15000);
const dir = H.agents().find((a) => a.dock === 'three');
const d = ThreeLab.director;
step('loaded with the Lab: LookCore, LookMatch, /look-match', typeof LookCore !== 'undefined' && Boolean(Commands.get('look-match')));
step('the ◎ mission "Make it look like this" is there for the Lab director (only)', Missions.shown(dir.id).some((m) => m.id === 'lab-lookmatch') && !Missions.shown(H.claudeAgent().id).some((m) => m.id === 'lab-lookmatch'));
const look = LabEasy.previewItem().items().find((x) => /Look & motion/.test(x.label)).items();
step('✦ More › ✨ Look & motion › 🎨 Make it look like this', look.some((x) => /^🎨 Make it look like this/.test(x.label)), look.map((x) => x.label));

// ---------- test pictures, made here ----------
const save = (name, c) => window.hub.saveAttachment(name, c.toDataURL('image/png').split(',')[1]);
function canvas(w = 320, h = 180) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
async function warmPic() {
  const c = canvas(); const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 320, 180); gr.addColorStop(0, '#4a3020'); gr.addColorStop(0.5, '#c07840'); gr.addColorStop(1, '#f6d8a8'); g.fillStyle = gr; g.fillRect(0, 0, 320, 180);
  g.fillStyle = '#e0602a'; g.beginPath(); g.arc(90, 80, 40, 0, 7); g.fill(); g.fillStyle = '#f2b04a'; g.beginPath(); g.arc(230, 100, 46, 0, 7); g.fill();
  const id = g.getImageData(0, 0, 320, 180); let s = 3;
  for (let i = 0; i < id.data.length; i += 4) { s = (s * 16807) % 2147483647; const nz = ((s / 2147483647) - 0.5) * 70; for (let k = 0; k < 3; k += 1) id.data[i + k] = Math.max(0, Math.min(255, 40 + id.data[i + k] * 0.8 + nz)); }
  g.putImageData(id, 0, 0);
  return save('look-warm.png', c);
}
async function coolBwPic() {
  const c = canvas(); const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 320, 180);
  const gr = g.createLinearGradient(0, 0, 320, 0); gr.addColorStop(0, '#050505'); gr.addColorStop(0.5, '#808080'); gr.addColorStop(1, '#ffffff'); g.fillStyle = gr; g.fillRect(0, 26, 320, 128);
  g.fillStyle = '#e8e8e8'; g.fillRect(40, 50, 60, 80); g.fillStyle = '#202020'; g.fillRect(200, 60, 70, 70);
  return save('look-noir-bars.png', c);
}
async function clip() {
  const c = canvas(240, 136); const g = c.getContext('2d');
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' }); const parts = [];
  rec.ondataavailable = (e) => parts.push(e.data);
  rec.start(100);
  const t0 = performance.now();
  await new Promise((resolve) => { const tick = () => { const t = (performance.now() - t0) / 1000; g.fillStyle = '#102040'; g.fillRect(0, 0, 240, 136); g.fillStyle = '#40c0ff'; for (let i = 0; i < 6; i += 1) { g.beginPath(); g.arc((t * 160 + i * 50) % 260 - 10, 30 + i * 16, 12, 0, 7); g.fill(); } if (t < 2.2) requestAnimationFrame(tick); else resolve(); }; tick(); });
  rec.stop(); await new Promise((r) => { rec.onstop = r; });
  const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(new Blob(parts, { type: 'video/webm' })); });
  return window.hub.saveAttachment('look-clip.webm', b64);
}
const warm = await warmPic(); const noir = await coolBwPic();

// a plain, neutral, colorful scene to match onto
await d.newSketch('look probe', `const c = document.createElement('canvas'); c.width = 320; c.height = 180; c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 320, 180); gr.addColorStop(0, '#000'); gr.addColorStop(1, '#fff'); g.fillStyle = gr; g.fillRect(0, 0, 320, 180);
g.fillStyle = '#d04020'; g.beginPath(); g.arc(80, 90, 40, 0, 7); g.fill(); g.fillStyle = '#30a050'; g.beginPath(); g.arc(160, 90, 40, 0, 7); g.fill(); g.fillStyle = '#2050c0'; g.beginPath(); g.arc(240, 90, 40, 0, 7); g.fill();`, 3);
await wait(1500);
const layersNow = async () => { const h = await LabGrade.findLayers(d); return { grade: h.grade ? d.sliders(h.grade.id)?.sliders || [] : null, lens: Boolean(h.lens) }; };
const val = (sl, k) => sl?.find((s) => s.key === k)?.value;
step('a fresh scene has no ◐ Grade', (await layersNow()).grade === null);

// ---------- 1. a warm, faded, grainy picture ----------
let t0 = performance.now();
const r1 = await LookMatch.run({ path: warm, kind: 'image', title: 'look-warm.png' }).catch((e) => ({ error: e.message }));
const ms1 = Math.round(performance.now() - t0);
const L1 = await layersNow();
step('warm, faded, grainy → ◐ Grade: warmer, lifted blacks, grain', L1.grade && val(L1.grade, 'temp') > 0.05 && val(L1.grade, 'liftLum') > 0 && val(L1.grade, 'grain') > 0.05, { error: r1.error, why: r1.match?.why, temp: val(L1.grade, 'temp'), lift: val(L1.grade, 'liftLum'), grain: val(L1.grade, 'grain'), ms: ms1 });
step('… its colors became the sketch palette', JSON.stringify(d.refs.palette()) === JSON.stringify(r1.match?.palette) && r1.match.palette.length >= 3, d.refs.palette());
step('… and the scene got closer to it (read before and after)', r1.score != null && r1.before != null && r1.score > r1.before, { before: r1.before, after: r1.score });
const card = LookMatch.card;
step('the card: the reference, its palette, what changed, how close, Strength, Undo / Before / Fine-tune / Ask', card?.isConnected && card.querySelectorAll('.lm-pal span').length >= 3 && /close/.test(card.textContent) && ['↶ Undo', 'Before', '◐ Fine-tune', '✦ Ask the director'].every((t) => [...card.querySelectorAll('button')].some((b) => b.textContent === t)), card?.textContent.slice(0, 200));
const range = card?.querySelector('input[type=range]');
if (range) { range.value = '0.4'; range.dispatchEvent(new Event('input')); }
await wait(300);
step('Strength moves the layer\'s amount', Math.abs(val((await layersNow()).grade, 'amount') - 0.4) < 0.02, val((await layersNow()).grade, 'amount'));
const hold = [...card.querySelectorAll('button')].find((b) => b.textContent === 'Before');
hold.dispatchEvent(new PointerEvent('pointerdown')); await wait(200);
const held = val((await layersNow()).grade, 'amount');
hold.dispatchEvent(new PointerEvent('pointerup')); await wait(200);
step('hold "Before": the look steps aside, then comes back', held === 0 && Math.abs(val((await layersNow()).grade, 'amount') - 0.4) < 0.02, { held });
await LookMatch.undo();
const U = await layersNow();
step('↶ Undo: no grade, the palette as before, the card gone', U.grade === null && !U.lens && d.refs.palette().length === 0 && !LookMatch.card, { U, pal: d.refs.palette() });

// ---------- 2. black & white with bars, picked from the board's right-click ----------
activate('tool:board');
await until(() => Board.isMounted() && Board.current(), 15000);
await Board.addFiles([noir]);
const it = await until(() => Board.items().find((x) => x.src && /look-noir/.test(x.src) && x.vibe), 20000) && Board.items().find((x) => /look-noir/.test(x.src || ''));
Board.select([it.id]);
Board._.itemMenu({ clientX: 300, clientY: 300, preventDefault() {}, stopPropagation() {} });
await wait(200);
const useBtn = [...document.querySelectorAll('#menu button')].find((b) => /Use this look in the Lab/.test(b.textContent));
step('a board item\'s right-click: "🎨 Use this look in the Lab"', Boolean(useBtn), [...document.querySelectorAll('#menu button')].map((b) => b.textContent).slice(0, 12));
useBtn?.click();
await until(() => LookMatch.state().on && /noir/.test(LookMatch.state().source || it.title || ''), 60000);
await until(async () => (await layersNow()).grade, 10000);
const L2 = await layersNow();
const s2 = LookMatch.state();
step('black & white with bars → saturation 0, the bars, the Lab shown', L2.grade && val(L2.grade, 'saturation') === 0 && /:/.test(val(L2.grade, 'bars') || '') && ThreeLab.scenes?.previewHost?.()?.isConnected, { why: s2.why, sat: val(L2.grade, 'saturation'), bars: val(L2.grade, 'bars') });
await LookMatch.undo();

// ---------- 3. a clip: its look + its motion ----------
const vid = await clip();
const r3 = await LookMatch.run({ path: vid, kind: 'video', title: 'look-clip.webm' }).catch((e) => ({ error: e.message }));
step('a clip → frames merged, its motion read (lively), cool blue', r3.ref?.kind === 'clip' && r3.ref.frames >= 3 && r3.ref.motion > 0 && val((await layersNow()).grade, 'temp') < 0, { error: r3.error, motion: r3.ref?.motion, frames: r3.ref?.frames, temp: val((await layersNow()).grade, 'temp'), words: r3.ref && LookCore.words(r3.ref) });

// ---------- 4. asking the director: the cost first, then a small picture + the numbers ----------
const lastUserMsg = () => (Native.chatOf(dir.id)?.messages || []).filter((m) => m.role === 'user').at(-1) || null;
const asking = LookMatch.askDirector('more chrome');
const dlg = await until(() => document.querySelector('dialog.ui-modal[open]'), 8000) && document.querySelector('dialog.ui-modal[open]');
const costText = dlg?.textContent || '';
step('ask: the cost shows first (picture + numbers, in tokens)', /tokens/.test(costText) && /small picture/.test(costText), costText.slice(0, 260));
dlg?.querySelector('button.primary')?.click();
await asking.catch(() => null);
await until(() => /look like this/.test(lastUserMsg()?.text || ''), 15000);
const um = lastUserMsg();
step('… the director gets a small picture of the reference and the numbers + your words', um && /look like this/.test(um.text) && /more chrome/.test(um.text) && /palette #/.test(um.text) && (um.images || []).length === 1, { text: um?.text, images: um?.images, atts: um?.attachments });
await until(() => !Native.isBusy?.(H.activeChat[dir.id]), 30000);
await LookMatch.undo();

// ---------- 5. the ◎ mission: the picker (board, renders, your matched looks); cancel gives your words back ----------
const n0 = (Native.chatOf(dir.id)?.messages || []).length;
const handled = Missions.start(dir.id, 'lab-lookmatch', 'wilder shapes');
const pdlg = await until(() => document.querySelector('dialog.lm-dlg[open]'), 8000) && document.querySelector('dialog.lm-dlg[open]');
await until(() => pdlg.querySelectorAll('.lm-tile').length > 0, 8000);
const secs = [...pdlg.querySelectorAll('.lm-sec')].map((x) => x.textContent);
step('mission → the picker: drop / choose a file, the mood board, your matched looks', handled && pdlg && pdlg.querySelector('.lm-drop') && secs.includes('From your mood board') && secs.includes('A look you matched before') && pdlg.querySelectorAll('.lm-tile').length >= 1, { secs, tiles: pdlg?.querySelectorAll('.lm-tile').length });
[...pdlg.querySelectorAll('button')].find((b) => b.textContent === 'Cancel').click();
await wait(300);
step('cancel: nothing sent, your words back in the box', (Native.chatOf(dir.id)?.messages || []).length === n0 && !document.querySelector('dialog.lm-dlg[open]'));

// ---------- 6. a picture dropped on the preview offers "Match this look" ----------
await ThreeLab.cmd({ show: true });
const host = ThreeLab.scenes.previewHost();
const hr = host.getBoundingClientRect();
const data = { items: [], files: [warm], dragOperationsMask: 1 };
// (the drag comes in over the Lab's toolbar first, like a real one from the Finder / Explorer)
const tb = [...document.querySelectorAll('.three-toolbar')].find((x) => x.offsetParent)?.getBoundingClientRect() || { left: hr.left + 4, top: hr.top + 4, width: 0, height: 0 };
await cdp('Input.dispatchDragEvent', { type: 'dragEnter', x: tb.left + 10, y: tb.top + tb.height / 2, data });
for (const type of ['dragOver', 'drop']) await cdp('Input.dispatchDragEvent', { type, x: hr.left + hr.width / 2, y: hr.top + hr.height / 2, data });
await wait(300);
// (round 38, dragdrop) the dropped picture becomes a picture layer first; its note offers "🎨 Match its look" (the menu)
const lookToast = () => [...document.querySelectorAll('#toasts button')].find((b) => /Match its look/.test(b.textContent));
await until(() => lookToast() || [...document.querySelectorAll('#menu button')].some((b) => /^🎨 Match this look/.test(b.textContent)), 15000);
lookToast()?.click();
await wait(300);
const dropBtn = [...document.querySelectorAll('#menu button')].find((b) => /^🎨 Match this look/.test(b.textContent));
step('a picture dropped on the preview → "🎨 Match this look"', Boolean(dropBtn), [...document.querySelectorAll('#menu button')].map((b) => b.textContent).slice(0, 6));
dropBtn?.click();
await until(() => LookMatch.state().on, 60000);
step('… which matches it (the ◐ Grade is there, the card shows)', Boolean((await layersNow()).grade) && LookMatch.card?.isConnected, LookMatch.state().why);
// (the card stays up for the screenshot)
out.recent = LookMatch.recent().map((r) => r.name);
out.ok = out.steps.every((s) => s.ok);
out.failed = out.steps.filter((s) => !s.ok).map((s) => s.name);
return JSON.stringify(out, null, 1);
