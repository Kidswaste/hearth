// Lean attachments (round 40, attachlean): a big code file, a 4K screenshot and a long paste attached to a Claude chat
// with the fake engine. The chips show their cost before sending ("sent at 1568 px", "≈ 2.1k of 25k tok", "Pasted
// text"); what reaches the engine is trimmed (the fake engine's "attachinfo" reports the message size, the tools and
// folders it got and the pictures it was told to open); clicking a chip's cost sends it whole; the same file attached
// in the next message is one line; a one-line change goes as a diff; a new chat sends it again.
//   node dev/smoke.js --fake-engines --check-timeout 180000 --script dev/checks/attachlean.js --shot /tmp/attachlean.png
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(100); } return null; };
const problems = []; const ok = (c, what) => { if (!c) problems.push(what); return Boolean(c); };
const out = {};
const DIR = '/tmp/hearth-attachlean-check';
const C = H.claudeAgent();
const v = () => Native.view(C.id);
const chips = () => [...v().chips.querySelectorAll('.attach-chip')].map((c) => c.textContent);
const info = (m) => { const x = /attach<<<(.*)>>>/.exec(m?.text || ''); return x ? JSON.parse(x[1]) : null; };
const reply = async (text) => { await Native.send(C.id, text); await wait(150); await until(() => !Native.isBusy(H.activeChat[C.id]), 60000); await wait(250); return Native.current(C.id).messages.at(-1); };
const costed = (n) => until(() => v().attachments.length >= n && v().attachments.every((a) => a.lean || !(a.kind === 'image' || a.kind === 'text')) && !v().chips.querySelector('.attach-lean.wait'), 20000);
try {
  await wait(800);
  if (typeof AttachLean === 'undefined') await Lazy.load('attachlean');
  ok(typeof AttachLean !== 'undefined' && typeof AttachLeanCore !== 'undefined', 'the attachlean group loads');
  ok(Commands.get('send-whole') && Commands.get('attach-costs') && !(Commands.duplicates?.() || []).length, 'commands /send-whole and /attach-costs, no duplicates');

  // ---------- fixtures: a 2,000-line code file, a 4K screenshot ----------
  const code = Array.from({ length: 2000 }, (_, i) => (i % 40 === 0 ? `function step${i}(state, input) {` : i % 40 === 39 ? '}' : `  state.v${i} = mix(input.a${i}, input.b${i}, ${i % 7} / 7); // keeps the orb moving`));
  code[1201] = 'function renderOrbHalo(scene, beat) {';
  code[1202] = '  const halo = scene.getObjectByName("halo"); halo.scale.setScalar(1 + beat * 0.4);';
  const CODE = `${DIR}/orb-engine.js`;
  await window.hub.fs.write(CODE, code.join('\n'));
  const cv = document.createElement('canvas'); cv.width = 3840; cv.height = 2160;
  const g = cv.getContext('2d'); const grad = g.createLinearGradient(0, 0, 3840, 2160); grad.addColorStop(0, '#1b1030'); grad.addColorStop(1, '#e6b450'); g.fillStyle = grad; g.fillRect(0, 0, 3840, 2160);
  g.fillStyle = '#fff'; g.font = '120px sans-serif'; g.fillText('Hearth 4K screenshot', 300, 600);
  const PNG = `${DIR}/Screen Shot 4K.png`;
  await window.hub.fs.write(PNG, cv.toDataURL('image/png').split(',')[1], { base64: true });

  activate(C.id);
  await until(() => Native.hasView(C.id));
  Native.newChat(C.id);
  await wait(200);
  v().attachments.length = 0; Native.renderChips(C.id);

  // ---------- attach: a big file + a picture + a long paste ----------
  await Native.attachPaths(C.id, [CODE, PNG]);
  const ta = v().input;
  ta.focus();
  const PASTE = Array.from({ length: 120 }, (_, i) => `Shot ${i + 1}: the orb breathes with the pad, the halo flares on the kick, and the camera drifts left over four bars while the palette warms toward amber for section ${i % 8}.`).join('\n\n');
  const dt = new DataTransfer(); dt.setData('text/plain', PASTE);
  const pe = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  ta.dispatchEvent(pe);
  await costed(3);
  out.chips = chips();
  ok(pe.defaultPrevented && v().attachments.some((a) => a.name === 'Pasted text'), 'a long paste becomes a "Pasted text" chip');
  ok(/orb-engine\.js · ≈ [\d.]+k of \d+k tok/.test(out.chips[0] || ''), `the code file's chip: ≈ sent of whole tokens (${out.chips[0]})`);
  ok(/sent at 1568 px · ≈ 1\.8k tok/.test(out.chips[1] || ''), `the picture's chip: sent at 1568 px (${out.chips[1]})`);
  ok(/Pasted text · ≈ [\d.]+k? of [\d.]+k tok/.test(out.chips[2] || ''), `the paste's chip (${out.chips[2]})`);
  const img = v().attachments[1];
  ok(img.lean?.small && /1568px\.png$/.test(img.lean.small) && img.path === PNG, 'the 1568 px copy is made; the chip still shows your file');
  const small = img.lean?.small ? await createImageBitmap(new Blob([await window.hub.fs.read(img.lean.small, { encoding: 'buffer' })])) : null;
  out.smallSize = small ? [small.width, small.height] : null;
  ok(small && small.width === 1568 && small.height === 882, `the copy is 1568 × 882 (${out.smallSize})`);
  ok(await window.hub.fs.stat(PNG), 'the original is untouched');
  const ac = await Commands.tryRun('/attach-costs', C.id);
  out.costs = typeof ac === 'string' ? ac : v().list.querySelector('.msg.note:last-of-type')?.textContent;

  // ---------- send: what reaches the engine is trimmed ----------
  const r1 = await reply('what does renderOrbHalo do with the beat? attachinfo');
  const u1 = Native.current(C.id).messages.at(-2);
  const i1 = info(r1);
  out.first = { sent: u1.sent?.length, info: i1, meta: u1.attachments };
  ok(i1 && i1.chars < 30000, `the message that reached the engine is small (${i1?.chars} chars; the code file alone is ${code.join('\n').length})`);
  ok(/renderOrbHalo\(scene, beat\)/.test(u1.sent) && /sent="part"/.test(u1.sent) && /The whole file is at .*lean-.*orb-engine\.js/.test(u1.sent), 'the code file goes as an outline + the part asked about + where the whole is');
  ok(i1?.tools === 'Read' && (i1.dirs || []).length >= 1, `Claude gets the Read tool on the attachments folder (${i1?.tools} ${JSON.stringify(i1?.dirs)})`);
  ok((i1?.images || []).length === 1 && /1568px\.png$/.test(i1.images[0]), `the picture sent is the 1568 px copy (${i1?.images})`);
  ok(u1.attachments?.find((a) => a.name === 'orb-engine.js')?.lean?.wholeTokens > 20000, 'the message keeps what each attachment cost');

  // ---------- the same file again: one line ----------
  await Native.attachPaths(C.id, [CODE]);
  await costed(1);
  out.sameChip = chips()[0];
  ok(/same as \d\d:\d\d/.test(out.sameChip || ''), `the chip says it's the same as before (${out.sameChip})`);
  const r2 = await reply('and what calls it? attachinfo');
  const u2 = Native.current(C.id).messages.at(-2);
  out.second = { sent: u2.sent, info: info(r2) };
  ok(/Unchanged since your message at \d\d:\d\d/.test(u2.sent || '') && (u2.sent || '').length < 600, `the second attach is one line (${(u2.sent || '').length} chars)`);

  // ---------- changed by one line: only the diff ----------
  code[1202] = '  const halo = scene.getObjectByName("halo"); halo.scale.setScalar(1 + beat * 0.8);';
  await window.hub.fs.write(CODE, code.join('\n'));
  await Native.attachPaths(C.id, [CODE]);
  await costed(1);
  await reply('I doubled the flare, does it look right? attachinfo');
  const u3 = Native.current(C.id).messages.at(-2);
  out.third = (u3.sent || '').slice(0, 400);
  ok(/Changed since your message at \d\d:\d\d/.test(u3.sent || '') && /^\+ {2}const halo.*0\.8\);$/m.test(u3.sent || '') && (u3.sent || '').length < 1500, 'a one-line change goes as a diff');

  // ---------- send whole: one click on the cost ----------
  await Native.attachPaths(C.id, [PNG, CODE]);
  await costed(2);
  for (const b of v().chips.querySelectorAll('button.attach-lean')) b.click();
  await wait(100);
  out.wholeChips = chips();
  ok(out.wholeChips.every((t) => /whole · ≈/.test(t)), `clicking the cost: "whole" (${out.wholeChips})`);
  const r4 = await reply('compare with the full picture attachinfo');
  const u4 = Native.current(C.id).messages.at(-2);
  const i4 = info(r4);
  out.whole = { info: i4, sentLen: (u4.sent || '').length };
  ok((i4?.images || [])[0] === PNG, `send whole: the original picture (${i4?.images})`);
  ok((u4.sent || '').length > code.join('\n').length, 'send whole: the whole file');

  // ---------- a new chat: sent again (its engine has never seen it) ----------
  Native.newChat(C.id);
  await wait(200);
  await Native.attachPaths(C.id, [CODE]);
  await costed(1);
  ok(!/same as/.test(chips()[0] || ''), 'a new chat: not "same as"');
  await reply('summarize this attachinfo');
  const u5 = Native.current(C.id).messages.at(-2);
  ok(/sent="part"/.test(u5.sent || '') && !/Unchanged since/.test(u5.sent || ''), 'a new chat gets the outline + parts again');

  // ---------- small things are untouched ----------
  await window.hub.fs.write(`${DIR}/note.md`, '# Note\nthe intro needs more punch\n');
  await Native.attachPaths(C.id, [`${DIR}/note.md`]);
  await costed(1);
  out.smallChip = chips()[0];
  ok(/≈ \d+ tok$/.test((out.smallChip || '').replace(/×$/, '').trim()) && !v().chips.querySelector('button.attach-lean'), `a small file: its cost, nothing to click (${out.smallChip})`);
  const u6 = (await reply('ok')) && Native.current(C.id).messages.at(-2);
  ok(/<file name="note.md">\n# Note\nthe intro needs more punch\n\n<\/file>/.test(u6.sent || ''), 'a small file is sent exactly as before');
} catch (e) {
  problems.push(`threw: ${e.message} ${e.stack?.split('\n')[1] || ''}`);
}
return JSON.stringify({ ok: !problems.length, problems, out }, null, 1);
