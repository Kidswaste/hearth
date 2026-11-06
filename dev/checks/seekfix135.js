// (round 135, seekfix135) a seek sent while play is starting lands and holds (docs/upgrades/seekfix135.md).
// Press play, then seek 0, 10, 50 and 200 ms later, 20 times each, on:
//   A. the fixture song (the preview's song element and its audio clock: audio.time)
//   B. a scene's own timeline (no song: the player's silent clock, the same element path)
// Each try starts paused at 1 s and seeks to a target far from it. Twice after the seek (≈ 0.35 s and ≈ 0.9 s) it
// reads the song element's time, the sketch's audio.time (what the layers see) and the Lab timeline's playhead; each
// must lie between the target − one frame and the target + the time since the seek + one frame (so a play that
// started from 1 s / 0 and lost the seek, or a later step that put it back, fails). Every 4th try loads the song (or
// the timeline) again first and presses play + seeks as soon as the Lab has the file, while the preview still reads it.
// Only the check's own temp data (smoke.js) and the fixture song; never an owner's scene.
//   node dev/make-test-song.js /tmp/hearth-autoedit-song.wav 128 0 --form
//   node dev/smoke.js --check-timeout 900000 --script dev/checks/seekfix135.js
const out = { steps: [] };
const step = (name, ok, info) => { out.steps.push(`${ok ? '✓' : '✖'} ${name}${info === undefined ? '' : ` · ${typeof info === 'string' ? info : JSON.stringify(info)}`}`); if (!ok) (out.problems ||= []).push(name); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch { /* not yet */ } await wait(60); } return null; };
const SONG = '/tmp/hearth-autoedit-song.wav';
const r3 = (x) => (Number.isFinite(Number(x)) ? Math.round(Number(x) * 1000) / 1000 : x);
const DELAYS = [0, 10, 50, 200]; const N = 20; const FRAME = 1 / 30;

try {
  activate('tool:three');
  const cmd = await ThreeLab.cmd({ show: true });
  await until(() => ThreeLab.scenes && ThreeLab.director && ThreeLab.stageHooks?.pane, 60000);
  const SC = ThreeLab.scenes; const hk = ThreeLab.stageHooks; const D = ThreeLab.director;
  const CODE = `import * as THREE from 'three';
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100); camera.position.z = 4;
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ff8030' }));
scene.add(cube);
renderer.setAnimationLoop(() => { cube.rotation.y = audio.time; renderer.render(scene, camera); });`;
  const ev = async (code) => { for (let i = 0; i < 6; i++) { const e = await D.evalInSketch(code); if (e?.ok) return e.value; await wait(80); } return null; };
  const P = () => hk.player;
  const read = async () => { const v = await ev('JSON.stringify(window.__labAV ? [__labAV.state().time, audio.time, __labAV.state().leadMs / 1000] : [null, null, 0])'); return v ? JSON.parse(v) : [null, null, 0]; };

  // one run: DELAYS × N tries of play → (delay) → seek
  async function run(label, targets, reload) {
    const res = {}; const bad = [];
    for (const delay of DELAYS) {
      const fails = []; let worst = 0;
      for (let i = 0; i < N; i++) {
        const T = targets[i % targets.length];
        // paused at 1 s, settled; every 4th try right after the song (or the timeline) is loaded again instead
        const fresh = i % 4 === 3;
        if (fresh) { cmd.play(false); await wait(120); await reload(); }
        else { cmd.play(false); await wait(120); cmd.seek(1); await until(async () => { const [el] = await read(); return !P().playing && el != null && Math.abs(el - 1) < 0.05; }, 4000); await wait(60); }
        cmd.play(true);
        if (delay) await wait(delay);
        const seekAt = performance.now(); cmd.seek(T);
        const look = [];
        for (const at of [350, 900]) {
          await wait(Math.max(0, at - (performance.now() - seekAt)));
          const [el, heard, lead] = await read(); const lab = P().time; const since = (performance.now() - seekAt) / 1000;
          look.push({ el: r3(el), heard: r3(heard), lab: r3(lab), since: r3(since) });
          const lo = T - FRAME - (lead || 0); const hi = T + since + FRAME;
          for (const [k, v] of [['element', el], ['audio.time', heard], ['timeline', lab]]) {
            const off = !(v >= lo && v <= hi);
            if (off) fails.push({ i, fresh, T, at, k, v: r3(v), lo: r3(lo), hi: r3(hi) });
            else worst = Math.max(worst, T - v);
          }
        }
        if (i < 2) (res[`d${delay}`] ||= { looks: [] }).looks.push(look);
      }
      (res[`d${delay}`] ||= {}).fails = fails.length; res[`d${delay}`].worstEarlyMs = Math.round(worst * 1000);
      if (fails.length) { res[`d${delay}`].first = fails.slice(0, 4); bad.push(delay); }
      step(`${label}: play, then seek ${delay} ms later, ${N}×: the element, audio.time and the timeline land within one frame of the target and hold`, !fails.length, { fails: fails.length, worstEarlyMs: Math.round(worst * 1000), first: fails.slice(0, 3) });
    }
    cmd.play(false);
    out[label] = res;
    return bad;
  }

  // ---------- A. the fixture song ----------
  const sk = SC.create({ name: 'Seek check', code: CODE, layers: [ThreeLayers.defaults({ id: 'sfMain', name: 'Main', code: CODE, slot: 0 })], frame: '16:9' });
  SC.open(sk.id);
  await until(() => SC.currentId() === sk.id, 20000);
  await cmd.loadSong(SONG);
  await until(() => P().loaded && P().analysis && P().duration > 30, 60000);
  await until(async () => (await read())[0] != null, 20000);
  step('the fixture song loads', P().duration > 30, { duration: r3(P().duration) });
  const dur = P().duration;
  // (loaded again: the next play + seek go out as soon as the player has the file, while the preview still reads it)
  const reSong = async () => { P().unload({ silent: true }); await wait(150); P().load(SONG); const t0 = performance.now(); while (!P().loaded && performance.now() - t0 < 10000) await wait(1); };
  await run('song', [0.62, 0.47, 0.81, 0.3, 0.7].map((f) => r3(f * dur)), reSong);
  await until(() => P().analysis && P().duration > 30, 30000); await wait(300);

  // ---------- B. a scene's own timeline (no song) ----------
  const sk2 = SC.create({ name: 'Seek check (timeline)', code: CODE, layers: [ThreeLayers.defaults({ id: 'sfClock', name: 'Main', code: CODE, slot: 0 })], frame: '16:9', timeline: { len: 60, fps: 30 } });
  SC.open(sk2.id);
  await until(() => SC.currentId() === sk2.id && P().isClock && P().loaded && Math.abs(P().duration - 60) < 0.5, 30000);
  await until(async () => (await read())[0] != null, 20000);
  step('a scene with its own timeline (no song)', Boolean(P().isClock), { duration: r3(P().duration) });
  const reClock = async () => { P().loadClock({ key: sk2.id, seconds: 60, fps: 30, startAt: 1, playing: false }); };
  await run('timeline', [37, 22, 48.5, 15, 30], reClock);
} catch (err) {
  step('the check ran to the end', false, String(err?.stack || err).slice(0, 600));
}
out.ok = !out.problems;
return JSON.stringify(out, null, 1);
