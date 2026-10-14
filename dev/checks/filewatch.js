// Files changed outside Hearth (round 42, filewatch), in the real app on a temp folder. "Another app" writes through
// fw:test (Hearth's own fs:write counts as Hearth's, so it can't stand in for Photoshop / VS Code):
//   · a picture a Lab scene uses (its reference, added from the temp folder) saved again → the texture swapped in place
//     (no reload of the preview), one quiet "logo.png updated from disk" line
//   · the scene's song saved again (longer) → read again in place, same path, still playing
//   · editors' swap / temp files (.swp, ~$, .DS_Store, .crdownload, Photoshop Temp, a safe save's .sb- file) → nothing
//   · a safe save (temp file renamed over the picture) → one update
//   · a burst of 200 writes → one batch, one update
//   · the song deleted → twocomputers' "Find this file" note
//   · a file an AI changed, changed again outside → its undo says "changed outside Hearth"; one it created, deleted → nothing
//     left to undo
//   · a chat box's attachment saved again before sending → the chip reads the new text
//   · idle: no timer of the service runs, no polling
//   node dev/smoke.js --check-timeout 240000 --script dev/checks/filewatch.js --shot /tmp/filewatch.png
const out = { steps: [] };
let bad = 0;
const step = (name, ok, info) => { if (!ok) bad += 1; out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); };
const { wait, until } = SQL;
const DIR = `/tmp/hearth-filewatch-${Date.now().toString(36)}`;
const fw = window.hub.fw;
const outside = (ops) => fw.test({ outside: ops });
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const png = (w, h, color) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = color; g.fillRect(0, 0, w, h); return c.toDataURL('image/png').split(',')[1]; };
function wav(secs, freq = 220) {
  const sr = 22050; const n = Math.round(secs * sr); const b = new ArrayBuffer(44 + n * 2); const v = new DataView(b);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin((i * 2 * Math.PI * freq) / sr) * 12000 * ((i % (sr / 2)) < 800 ? 1 : 0.15)), true);
  return b64(new Uint8Array(b));
}
const toastHas = (re) => [...document.querySelectorAll('#toasts > *')].some((x) => re.test(x.textContent));
const CODE = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer(); renderer.setSize(innerWidth, innerHeight); document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 10); camera.position.z = 2;
const tex = refTexture('logo'); window.__fwTex = tex;
scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: tex })));
renderer.setAnimationLoop(() => renderer.render(scene, camera));`;

try {
  await until(() => typeof FileWatch !== 'undefined' && FileWatch.counts, 20000);
  step('loaded right after the first screen (lazy group filewatch)', typeof FileWatch !== 'undefined' && Lazy.isIn('filewatch'));
  const logo = `${DIR}/logo.png`; const song = `${DIR}/song.wav`;
  await outside([{ op: 'write', path: logo, b64: png(64, 32, '#ff0000') }, { op: 'write', path: song, b64: wav(2) }]);

  // ---------- the Lab: a scene with the picture as a reference, the song on its timeline ----------
  await SQL.lab();
  const d = ThreeLab.director; const S = ThreeLab.scenes; const cmd = ThreeLab.peek();
  const sbx = async (code) => { const r = await d.evalInSketch(code).catch(() => null); return r?.ok ? r.value : null; };
  const sc = S.create({ name: 'Filewatch check', code: CODE, open: true });
  await until(() => S.currentId() === sc.id, 8000);
  const r = await d.refs.add(logo, 'logo');
  step('a reference remembers the file it came from', r?.src === logo, r?.src);
  cmd.run();
  step('the scene shows the picture (64 px wide)', await until(async () => (await sbx('return window.__fwTex?.image?.width || 0')) === 64, 20000), await sbx('return window.__fwTex?.image?.width || 0'));
  await cmd.loadSong(song);
  await until(() => cmd.player.loaded && Math.abs(cmd.player.duration - 2) < 0.1, 15000);
  cmd.player.toggle(true);
  const playing0 = await until(() => cmd.player.playing, 5000); // (headless audio may not start: then "the same state" is checked)
  const wants = await until(async () => ((await fw.state()).topics?.lab || 0) >= 3, 8000);
  step('the Lab\'s files are followed (the song, the picture\'s copy and its original)', wants, (await fw.state()).topics);
  const st1 = await fw.state();
  step('one watch per folder, none per file', st1.roots.length <= st1.files && st1.roots.every((x) => x.mode === 'watch'), st1.roots.map((x) => `${x.dir} ${x.recursive ? 'R' : ''} ${x.mode}`));

  // ---------- the picture saved again in "Photoshop" ----------
  const live0 = JSON.stringify(ThreeLab.live.counts());
  const ref0 = FileWatch.counts.refs;
  await outside([{ op: 'write', path: logo, b64: png(128, 64, '#00ff00') }]);
  const swapped = await until(async () => (await sbx('return window.__fwTex?.image?.width || 0')) === 128, 10000);
  step('picture saved again → the texture swapped in place (128 px now)', swapped, await sbx('return [window.__fwTex?.image?.width, window.__refUpdates]'));
  step('… without reloading or re-running the preview', JSON.stringify(ThreeLab.live.counts()) === live0, { before: live0, after: ThreeLab.live.counts() });
  step('… one update', FileWatch.counts.refs - ref0 === 1, FileWatch.counts);
  step('… one quiet line: "logo.png updated from disk"', await until(() => toastHas(/logo\.png updated from disk/), 4000), [...document.querySelectorAll('#toasts > *')].map((x) => x.textContent));

  // ---------- the song saved again (longer) ----------
  const songs0 = FileWatch.counts.songs;
  await outside([{ op: 'write', path: song, b64: wav(3, 330) }]);
  step('the song saved again → read again in place (3 s now)', await until(() => Math.abs(cmd.player.duration - 3) < 0.1, 15000), cmd.player.duration);
  step(`… same file, ${playing0 ? 'still playing' : 'same play state'}, one update`, cmd.player.path === song && (await until(() => cmd.player.playing === playing0, 5000)) && FileWatch.counts.songs - songs0 === 1, { path: cmd.player.path, playing: cmd.player.playing, before: playing0, songs: FileWatch.counts.songs - songs0 });

  // ---------- editors' swap / temp files ----------
  await wait(1500);
  const b0 = FileWatch.counts.batches; const u0 = await sbx('return window.__refUpdates || 0');
  await outside(['.logo.png.swp', '~$logo.png', '.DS_Store', 'logo.png.crdownload', 'Photoshop Temp1234', 'logo.png.sb-1a2b3c4d-AbCdEf', '.song.wav.icloud', 'x.tmp', '.#logo.png'].map((n) => ({ op: 'write', path: `${DIR}/${n}`, text: 'junk' })));
  await wait(2500);
  step('swap / temp / placeholder files → nothing', FileWatch.counts.batches === b0 && (await sbx('return window.__refUpdates || 0')) === u0, { batches: FileWatch.counts.batches - b0 });

  // ---------- a safe save: a temp file renamed over the picture ----------
  const r1 = FileWatch.counts.refs;
  await outside([{ op: 'write', path: `${logo}.sb-99aa88bb-XyZabc`, b64: png(80, 40, '#0000ff') }, { op: 'rename', path: `${logo}.sb-99aa88bb-XyZabc`, to: logo }]);
  step('a safe save (temp + rename over) → one update', await until(async () => (await sbx('return window.__fwTex?.image?.width || 0')) === 80, 10000) && FileWatch.counts.refs - r1 === 1, { refs: FileWatch.counts.refs - r1 });

  // ---------- a burst of 200 writes ----------
  await wait(1200);
  const b1 = FileWatch.counts.batches; const r2 = FileWatch.counts.refs;
  const fst = await fw.state();
  await outside([{ op: 'burst', path: logo, n: 200, b64s: [png(96, 48, '#ff00ff'), png(100, 50, '#ffff00')] }]);
  await until(async () => (await sbx('return window.__fwTex?.image?.width || 0')) === 100, 10000);
  await wait(3000);
  const lst = await fw.state();
  step('a burst of 200 writes → one batch, one update', FileWatch.counts.batches - b1 === 1 && FileWatch.counts.refs - r2 === 1 && (await sbx('return window.__fwTex?.image?.width || 0')) === 100, { batches: FileWatch.counts.batches - b1, refs: FileWatch.counts.refs - r2, rawEvents: lst.raw - fst.raw, mainBatches: lst.batches - fst.batches });

  // ---------- the song deleted outside → "Find this file" ----------
  cmd.player.toggle(false);
  await outside([{ op: 'unlink', path: `${DIR}/.song.wav.icloud` }]); // (the placeholder written above: with it there, a delete reads as "offloaded to iCloud")
  await wait(1200);
  await outside([{ op: 'unlink', path: song }]);
  step('the song deleted → "Find this file" (once)', await until(() => toastHas(/song\.wav isn't on this computer/) && toastHas(/Find this file/), 12000), [...document.querySelectorAll('#toasts > *')].map((x) => x.textContent));
  step('… and 🩺 Fix my scene can list it', (window.TwoComputers?.missingList?.() || []).some((m) => m.name === 'song.wav'));

  // ---------- what the AIs changed ----------
  await Lazy.load('aiundo');
  await AiUndo.ready();
  const notes = `${DIR}/ai/notes.md`; const made = `${DIR}/ai/new.md`;
  await outside([{ op: 'write', path: notes, text: 'written by Claude' }, { op: 'write', path: made, text: 'made by Claude' }]);
  const claude = H.claudeAgent();
  const e1 = AiUndo._test.add({ area: 'file', chat: null, by: claude.id, what: 'Edited notes.md', target: 'in ai', tk: `file:${notes}`, u: { chat: 'fw-check', entry: 'fw-1', path: notes, created: false, backup: null } });
  const e2 = AiUndo._test.add({ area: 'file', chat: null, by: claude.id, what: 'Created new.md', target: 'in ai', tk: `file:${made}`, u: { chat: 'fw-check', entry: 'fw-2', path: made, created: true, backup: null } });
  for (const [e, p] of [[e1, notes], [e2, made]]) { const s = await window.hub.fs.stat(p); e.after = { mtime: s.mtime, size: s.size }; }
  FileWatch.gatherAi();
  step('the AIs\' files are followed', await until(async () => ((await fw.state()).topics?.ai || 0) >= 2, 6000), (await fw.state()).topics);
  await wait(300);
  await outside([{ op: 'write', path: notes, text: 'then edited in VS Code by you' }]);
  step('changed again outside → its undo says so', await until(() => e1.outside && !e1.outside.gone, 8000) && /changed outside Hearth since/.test(AiUndo.summary()), AiUndo.summary().split('\n').slice(0, 3));
  await outside([{ op: 'unlink', path: made }]);
  step('a file it created, deleted outside → nothing left to undo (said plainly)', await until(() => /deleted outside Hearth/.test(e2.cant || ''), 8000), e2.cant);
  await Lazy.load('undoall');
  const recent = await (async () => { try { await UndoAll.ready?.(); } catch { /* fine */ } return UndoAll.summary?.() || ''; })();
  step('Recent changes (Ctrl/⌘+Z\'s list) says it too', /changed outside Hearth since/.test(recent) || !UndoAll.summary, String(recent).split('\n').slice(0, 4));

  // ---------- a chat box's attachment saved again before sending ----------
  const brief = `${DIR}/brief.md`;
  await outside([{ op: 'write', path: brief, text: '# Brief\nversion one' }]);
  activate(claude.id);
  await wait(300);
  await Native.attachPaths(claude.id, [brief]);
  const v = Native.view(claude.id);
  step('the chat box\'s attachment is followed', await until(async () => ((await fw.state()).topics?.[`attach:${claude.id}`] || 0) >= 1, 6000), (await fw.state()).topics);
  await wait(500);
  await outside([{ op: 'write', path: brief, text: '# Brief\nversion two, saved in VS Code' }]);
  step('saved again before sending → the chip reads the new text', await until(() => /version two/.test(v.attachments.find((a) => a.src === brief)?.content || ''), 8000), v.attachments.map((a) => a.content));
  v.attachments.length = 0; Native.renderChips(claude.id);

  // ---------- idle ----------
  await wait(3500);
  const s0 = await fw.state();
  await window.hub.power.test({ probe: 'start' });
  await wait(12000);
  const p = await window.hub.power.test({ probe: 'take' });
  const s1 = await fw.state();
  const fwTimers = (p.probe?.top || []).filter((l) => /filewatch/.test(l));
  step('idle: no timer of the service runs, no polling, no batch', !fwTimers.length && !s1.polling && s1.polls === s0.polls && s1.batches === s0.batches, { fwTimers, top: (p.probe?.top || []).slice(0, 5), polling: s1.polling, statPolls: p.probe?.statPollsPerMin });
  const words = await Commands.tryRun('/watching', claude.id).catch((err) => err.message);
  await wait(400);
  const note = [...(Native.view(claude.id)?.list.querySelectorAll('.msg.note') || [])].pop()?.textContent || '';
  step('/watching says what Hearth follows', /Files Hearth follows/.test(note) && /The Lab/.test(note), note.slice(0, 240) || words);
  await outside([{ op: 'rmdir', path: DIR }]);
} catch (e) { step('no exception', false, `${e.message}\n${e.stack}`); }
out.pass = !bad;
out.counts = typeof FileWatch !== 'undefined' ? FileWatch.counts : null;
return JSON.stringify(out, null, 1);
