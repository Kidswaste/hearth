// The Lab sequence rendered frame by frame: the standard test sequence (red · dissolve · green · footage
// /tmp/labframes-media/frames_a_30.mp4 · wipe · blue, a title, the song /tmp/hearth-test-song.wav) rendered 9:16
// with /sequence-render, then read back with ffprobe (1080×1920, 30 fps, 210 frames, the song's sound) and frame by
// frame with ffmpeg: every checked frame shows the right scene at its own exact frame (decoded from the picture), the
// footage its exact source frame, the dissolve a mix. A contact sheet of the render is saved to look at. Then the
// realtime fallback (what runs without ffmpeg) records a playable file; both land in Video Review's library.
//   node dev/make-lab-footage.js /tmp/labframes-media
//   node dev/smoke.js --check-timeout 900000 --script dev/checks/sequence-render.js --shot /tmp/sequence-render.png
const { step } = J;
const { wait, until, colorOf } = SQL;
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); } }); return text; };
const OUT = window.SEQ_SHOTS || '/tmp/hearth-sequence-render';
await SQL.build({ name: 'Render check', song: true });
step('the test sequence: 4 clips, a title, the song', ThreeSeq.edit.clips.length === 4 && ThreeSeq.status().song === 'hearth-test-song.wav' && ThreeSeq.status().frames === 210, ThreeSeq.status().clips);

// ---------- 1. render 9:16 ----------
let full = null;
ThreeSeq.on('render', (r) => { full = full || r.output; });
const t0 = performance.now();
const said = await say('/sequence-render 9:16');
const secs = Math.round((performance.now() - t0) / 100) / 10;
const path = (said.match(/\*\*(.+?)\*\*/) || [])[1];
step('the command says what it made', Boolean(path) && String(full).endsWith(path), said.slice(0, 160));
step('/sequence-render 9:16 renders the sequence into the captures folder', Boolean(full), { said: said.slice(0, 160), secs });
const pr = full ? await window.hub.video.probe(full) : null;
step('ffprobe: 1080×1920, 30 fps, 210 frames, 7.0 s, with the song\'s sound', pr && pr.w === 1080 && pr.h === 1920 && Math.abs(pr.fps - 30) < 0.01 && Math.abs(pr.duration - 7) < 0.12 && Boolean(pr.audio) && (pr.frames == null || Math.abs(pr.frames - 210) <= 1), pr);
const lib = await window.hub.kvGet('video-library', {});
step('it is in Video Review\'s library', (lib.recordings || []).includes(full), (lib.recordings || []).slice(0, 2));

// ---------- 2. the frames ----------
const FR = [15, 40, 52, 75, 110, 168, 200];
const dir = `${OUT}/.hearth-titles-chk${Date.now().toString(36)}`;
const job = (args, output, input) => new Promise((resolve, reject) => {
  const id = `chk${Math.random().toString(36).slice(2)}`;
  const off = window.hub.video.onJob((ev) => { if (ev.id !== id || ev.type !== 'done') return; off?.(); if (ev.code === 0) resolve(ev); else reject(new Error(ev.error || 'ffmpeg failed')); });
  window.hub.video.transcode({ id, input, output, args, duration: 7 }).catch(reject);
});
await job(['-y', '-i', 'INPUT', '-vf', `select='${FR.map((n) => `eq(n\\,${n})`).join('+')}'`, '-vsync', '0', 'OUTPUT'], `${dir}/f_%02d.png`, full);
await job(['-y', '-i', 'INPUT', '-vf', `select='${FR.map((n) => `eq(n\\,${n})`).join('+')}',scale=216:384,tile=7x1`, '-frames:v', '1', 'OUTPUT'], `${OUT}/sequence-render-sheet.png`, full);
const read = async (p) => {
  const b64 = await window.hub.fs.read(p, { encoding: 'base64' });
  const im = new Image(); im.src = `data:image/png;base64,${b64}`; await im.decode();
  const c = document.createElement('canvas'); c.width = 240; c.height = 240; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 240, 240);
  const px = g.getImageData(0, 0, 240, 240).data;
  const at = (fx, fy) => { const i = (Math.round(fy * 239) * 240 + Math.round(fx * 239)) * 4; return [px[i], px[i + 1], px[i + 2]]; };
  let n = 0; let ok = 0;
  for (let k = 0; k < 12; k++) { const [r, gg, b] = at((k + 0.5) / 12, 0.04); const l = 0.299 * r + 0.587 * gg + 0.114 * b; if (l > 170) { n |= 1 << k; ok++; } else if (l < 70) ok++; }
  return { center: at(0.5, 0.66), code: ok === 12 ? n : null };
};
const want = { 15: ['red', 15], 40: ['red', 40], 75: ['green', 30], 110: [null, 5], 168: ['blue', 18], 200: ['blue', 50] };
for (const [i, n] of FR.entries()) {
  const p = await read(`${dir}/f_${String(i + 1).padStart(2, '0')}.png`);
  if (n === 52) { step('rendered frame 52: the dissolve mixes red and green', colorOf(p.center) === 'mix' && p.center[0] > 60 && p.center[1] > 60, p); continue; }
  const [color, code] = want[n];
  step(`rendered frame ${n}: ${color || 'footage'} at its own frame ${code}`, (!color || colorOf(p.center) === color) && p.code === code, p);
}
window.hub.video.rmtemp(dir).catch(() => {});
step('a contact sheet of the render was saved to look at', Boolean(await window.hub.fs.stat(`${OUT}/sequence-render-sheet.png`)), `${OUT}/sequence-render-sheet.png`);

// ---------- 3. the realtime fallback (no ffmpeg) ----------
const rt = await ThreeSeq.render({ realtime: true });
const prr = rt?.path ? await window.hub.video.probe(rt.path) : null;
step('without ffmpeg: the sequence plays once into the page\'s recorder (a playable file, about the length)', Boolean(prr) && prr.duration > 5 && prr.duration < 9.5, { file: rt?.path, prr });
const lib2 = await window.hub.kvGet('video-library', {});
step('…also in Video Review\'s library', (lib2.recordings || []).includes(rt?.path));
step('the Lab is back to the sequence view after rendering', ThreeSeq.active && !ThreeSeq.rendering);
return J.done();
