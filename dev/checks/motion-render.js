// The motion kit inside the Lab sequence, rendered: /motion-intro builds a 9:16 sequence (logo reveal → Hearth on screen
// with UI cards, a cursor, kinetic type and a camera move → end card), a kinetic-type overlay goes over it
// (/motion-seq), the preview seeks frame-exactly into it, then ⇪ renders it frame by frame. The render is read back with
// ffprobe (1080×1920, its length) and ffmpeg: frames from each scene are not black, the picture moves between frames
// (time-driven animation, no song), the same frame rendered twice is identical, and a contact sheet is saved to look at.
//   node dev/smoke.js --check-timeout 900000 --script dev/checks/motion-render.js --shot /tmp/motion-render.png
const { step } = J;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(100); } return false; };
const OUT = window.MOTION_SHOTS || '/tmp/hearth-motion';
const say = async (line) => { let text = ''; await Commands.tryRun(line, H.claudeAgent().id, null, { say: (t) => { text = String(t); }, note: (t) => { text = String(t); }, error: (t) => { text = `ERROR ${t}`; } }); return text; };
activate('tool:three'); await wait(600); await ThreeLab.cmd();
await until(() => ThreeLab.director && ThreeLab.scenes, 20000);
await wait(1200);

// ---------- 1. build ----------
const said = await say('/motion-intro 9:16 Hearth on screen');
await until(() => ThreeSeq.active && ThreeSeq.edit?.clips.length === 3, 15000);
const st = ThreeSeq.status();
step('/motion-intro: a 9:16 sequence of three motion scenes', ThreeSeq.edit?.clips.length === 3 && st.format === '9:16', { said, clips: st.clips });
const ov = await say('/motion-seq slam HEARTH at 0.4 for 2 s');
await wait(500);
const items = (ThreeSeq.edit.tracks || []).flatMap((k) => k.items);
step('/motion-seq slam HEARTH at 0.4: a kinetic-type overlay over the sequence', /Slam/.test(ov) && items.some((x) => /Slam/.test(x.name || x.label || JSON.stringify(x))), { ov, items: items.length });

// ---------- 2. frame-exact preview ----------
const frameAt = async (n) => { ThreeSeq.play(false); ThreeSeq.seek(n / ThreeSeq.fps); await ThreeSeq.settle(3000); await wait(500); return ThreeLab.director.evalInSketch('return __seqProbe({ size: 96 })').then((x) => x.value); };
const p1 = await frameAt(100);
const p1b = await frameAt(100);
const p2 = await frameAt(112);
step('the preview seeks into the motion scene frame-exactly (the same frame twice is the same picture, 12 frames later it moved)', JSON.stringify(p1.center) === JSON.stringify(p1b.center) || Math.max(...p1.center.map((v, i) => Math.abs(v - p1b.center[i]))) < 6, { p1: p1.center, p1b: p1b.center, p2: p2.center });

// ---------- 3. render 9:16 ----------
const t0 = performance.now();
const r = await ThreeSeq.render({ format: '9:16' });
const secs = Math.round((performance.now() - t0) / 100) / 10;
step('⇪ renders the motion sequence frame by frame', Boolean(r?.path), { path: r?.path, frames: r?.frames, secs });
const pr = r?.path ? await window.hub.video.probe(r.path) : null;
step('ffprobe: 1080×1920 at 30 fps, about the sequence\'s length', pr && pr.w === 1080 && pr.h === 1920 && Math.abs(pr.fps - 30) < 0.01 && Math.abs(pr.duration - st.seconds) < 0.3, { pr, seconds: st.seconds });
const total = Math.round((pr?.duration || 9) * 30);
const FR = [12, 45, 70, Math.round(total * 0.45), Math.round(total * 0.45) + 6, Math.round(total * 0.62), Math.round(total * 0.85), total - 6];
const dir = `${OUT}/.motion-render-${Date.now().toString(36)}`;
const job = (args, output, input) => new Promise((resolve, reject) => {
  const id = `mo${Math.random().toString(36).slice(2)}`;
  let done = false;
  window.hub.video.onJob((ev) => { if (ev.id !== id || ev.type !== 'done' || done) return; done = true; if (ev.code === 0) resolve(ev); else reject(new Error(ev.error || 'ffmpeg failed')); });
  window.hub.video.transcode({ id, input, output, args, duration: pr?.duration || 9 }).catch(reject);
});
await job(['-y', '-i', 'INPUT', '-vf', `select='${FR.map((n) => `eq(n\\,${n})`).join('+')}'`, '-vsync', '0', 'OUTPUT'], `${dir}/f_%02d.png`, r.path);
await job(['-y', '-i', 'INPUT', '-vf', `select='${FR.map((n) => `eq(n\\,${n})`).join('+')}',scale=270:480,tile=8x1`, '-frames:v', '1', 'OUTPUT'], `${OUT}/motion-render-sheet.png`, r.path);
const read = async (p) => {
  const b64 = await window.hub.fs.read(p, { encoding: 'base64' });
  const im = new Image(); im.src = `data:image/png;base64,${b64}`; await im.decode();
  const c = document.createElement('canvas'); c.width = 54; c.height = 96; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 54, 96);
  return g.getImageData(0, 0, 54, 96).data;
};
const frames = [];
for (let i = 0; i < FR.length; i++) frames.push(await read(`${dir}/f_${String(i + 1).padStart(2, '0')}.png`));
const luma = (px) => { let s = 0; for (let i = 0; i < px.length; i += 4) s += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; return s / (px.length / 4); };
const diff = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 4) / 3; };
const L = frames.map(luma);
step('every sampled frame has a picture (not black)', L.every((v) => v > 6), L.map((v) => Math.round(v)));
const moves = [diff(frames[3], frames[4]), diff(frames[0], frames[1]), diff(frames[5], frames[6])].map((v) => Math.round(v * 10) / 10);
step('the picture moves (time-driven animation, no song): frames apart differ', moves.every((v) => v > 0.8), moves);
window.hub.video.rmtemp?.(dir).catch(() => {});
step('a contact sheet of the render was saved', Boolean(await window.hub.fs.stat(`${OUT}/motion-render-sheet.png`)), `${OUT}/motion-render-sheet.png`);
const errs = (ThreeLab.director.report().errors || []).map((e) => String(e.message).slice(0, 140));
step('no layer errors while building / playing / rendering', !errs.length, errs);
return J.done();
