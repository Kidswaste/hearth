// A Lab sequence exported from Video Review's editor (seq2): red · morph (a Lab-only transition: the two scenes are
// baked together through the Lab) · green · depth wipe (the editor's own ffmpeg version) · blue, a title. The editor's
// export bakes the scenes, then ffmpeg renders: the file is read back (size, length) and frame by frame (each part's
// color, the mixes in the transitions). Then the real-time take without ffmpeg (what "Record" in the editor does for a
// Lab sequence): footage with its sound on and no song still gives a file with sound.
//   node dev/make-lab-footage.js /tmp/labframes-media
//   node dev/smoke.js --check-timeout 900000 --script dev/checks/seq2-export.js --shot /tmp/seq2-export.png
const { step } = J;
const { wait, until, colorOf } = SQL;
const Q = ThreeSeq;
const ids = await SQL.scenes();
await Q.create('Seq2 export', { empty: true, show: true });
await Q.add({ sketch: ids.red }, { dur: 2, trans: null });
await Q.add({ sketch: ids.green }, { dur: 2, trans: { type: 'lab-morph', dur: 1 } });
await Q.add({ sketch: ids.blue }, { dur: 2, trans: { type: 'lab-depth', dur: 0.5 } });
await Q.add({ text: 'EXPORT' }, { at: 0.2, dur: 0.8 });
await wait(800);
const runs = Q.bakeRuns(Q.edit);
step('the editor will bake red + green together (a Lab-only morph between them) and blue alone', runs.length === 2 && runs[0].end - runs[0].start === 1, runs);
const key = Q.key;
await Q.toEditor();
await until(() => VideoCut.active && VideoCut.path === key, 8000);
step('the sequence is open in Video Review\'s editor', VideoCut.active && VideoCut.path === key);
let out = null;
VideoCut.on('export', (ev) => { out = out || ev.output; });
const job = await VideoCut.exportCut({});
const ev = job ? await job.done : null;
const file = ev?.output || job?.output || out;
const pr = file ? await window.hub.video.probe(file) : null;
// 2 + 2 + 2 − 1 (morph) − 0.5 (depth) = 4.5 s
step('the editor\'s export: the Lab baked the scenes, ffmpeg rendered 1080×1920, 4.5 s', pr && pr.w === 1080 && pr.h === 1920 && Math.abs(pr.duration - 4.5) < 0.15, { file, pr });
step('…next to the Lab\'s renders (a sequence with no video of its own used to land in "/exports")', Boolean(file) && !/^[\\/]exports[\\/]/.test(file), file);
const FR = [15, 45, 75, 110, 125];
const OUT = '/tmp/hearth-seq2-export';
const dir = `${OUT}/.frames${Date.now().toString(36)}`;
const run = (args, output, input) => new Promise((resolve, reject) => {
  const id = `chk${Math.random().toString(36).slice(2)}`; let done = false;
  window.hub.video.onJob((e) => { if (e.id !== id || e.type !== 'done' || done) return; done = true; if (e.code === 0) resolve(e); else reject(new Error(e.error || 'ffmpeg failed')); });
  window.hub.video.transcode({ id, input, output, args, duration: 5 }).catch(reject);
});
const read = async (p) => {
  const b64 = await window.hub.fs.read(p, { encoding: 'base64' });
  const im = new Image(); im.src = `data:image/png;base64,${b64}`; await im.decode();
  const c = document.createElement('canvas'); c.width = 60; c.height = 60; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 60, 60);
  return [...g.getImageData(30, 40, 1, 1).data].slice(0, 3);
};
if (file) {
  await run(['-y', '-i', 'INPUT', '-vf', `select='${FR.map((n) => `eq(n\\,${n})`).join('+')}'`, '-vsync', '0', 'OUTPUT'], `${dir}/f_%02d.png`, file);
  const got = {};
  for (const [i, n] of FR.entries()) got[n] = await read(`${dir}/f_${String(i + 1).padStart(2, '0')}.png`);
  window.hub.video.rmtemp(dir).catch(() => {});
  step('frame 15: red · 45: the morph mixing red and green · 75: green · 125: blue', colorOf(got[15]) === 'red' && colorOf(got[45]) === 'mix' && got[45][0] > 40 && got[45][1] > 40 && colorOf(got[75]) === 'green' && colorOf(got[125]) === 'blue', got);
}
await Q.fromEditor(key);
// ---------- the real-time take: footage with its sound on, no song ----------
await Q.create('Seq2 sound', { empty: true, show: true });
await Q.add({ path: SQL.FOOTAGE }, { dur: 2, trans: null });
const fid = Q.edit.clips[0].id;
Q.select(fid);
await Q.handle('three_sequence', { op: 'status' });
const c0 = ThreeSeqData.find(Q.edit, fid);
if (c0?.clip.mute) { const n = CutData.patchAny(Q.edit, [fid], (c) => { c.mute = false; }); Q._S.undo.push(JSON.stringify(Q.edit)); Q._S.edit = n; }
await Q.add({ sketch: ids.red }, { dur: 1.5 });
await wait(800);
step('the footage clip has its sound on', Q.edit.clips[0].mute === false, Q.edit.clips[0]);
const rt = await Q.render({ realtime: true });
const prr = rt?.path ? await window.hub.video.probe(rt.path) : null;
step('real-time take (no ffmpeg path): the footage\'s sound is in the file', Boolean(prr?.audio), prr);
return J.done();
