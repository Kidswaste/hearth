// Helpers for the Lab sequence checks (dev/checks/sequence*.js); smoke.js puts it in front of a check that uses SQL.
//   SQL.scenes()       three test sketches, each a flat color (red, green, blue) with its own clock burned in as a
//                      12-band code across the top: the frame number of the scene's own time (performance.now)
//   SQL.probe()        what the preview's program shows now: { center: [r,g,b], code (that frame number), T }
//   SQL.build()        the standard test sequence (red 2 s · dissolve · green 2 s · cut · footage 2 s · wipe · blue 2 s,
//                      a title at 0.5 s), 9:16 at 30 fps; returns the clip ids
//   SQL.colorOf(rgb)   'red' | 'green' | 'blue' | 'white' | 'black' | 'mix'
const SQL = (() => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch { /* not yet */ } await wait(80); } return false; };
  const FOOTAGE = '/tmp/labframes-media/frames_a_30.mp4';
  const SONG = '/tmp/hearth-test-song.wav';
  const SK = (rgb) => `const c = document.createElement('canvas'); c.width = 240; c.height = 240; c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'; document.body.append(c);
const g = c.getContext('2d'); const t0 = performance.now();
function loop() { const n = Math.round((performance.now() - t0) / 1000 * 30); g.fillStyle = '${rgb}'; g.fillRect(0, 0, 240, 240);
for (let k = 0; k < 12; k++) { g.fillStyle = (n >> k) & 1 ? '#ffffff' : '#000000'; g.fillRect(k * 20, 0, 20, 20); } requestAnimationFrame(loop); }
requestAnimationFrame(loop);`;
  const sbx = (code) => ThreeLab.director.evalInSketch(code).then((x) => (x?.ok ? x.value : { error: x?.error }));
  async function lab() { activate('tool:three'); await wait(300); const c = await ThreeLab.cmd(); await until(() => ThreeLab.director && ThreeLab.scenes, 15000); return c; }
  async function scenes() {
    await lab();
    const S = ThreeLab.scenes;
    const get = (name, rgb) => S.all().find((x) => x.name === name) || S.create({ name, code: SK(rgb) });
    return { red: get('Seq Red', '#ff0000').id, green: get('Seq Green', '#00ff00').id, blue: get('Seq Blue', '#0000ff').id };
  }
  const probe = (o = {}) => sbx(`return __seqProbe(${JSON.stringify(o)})`);
  function colorOf([r, g, b] = []) {
    if (r > 200 && g > 200 && b > 200) return 'white';
    if (r < 40 && g < 40 && b < 40) return 'black';
    if (r > 180 && g < 70 && b < 70) return 'red';
    if (g > 180 && r < 70 && b < 70) return 'green';
    if (b > 180 && r < 70 && g < 70) return 'blue';
    return 'mix';
  }
  // the standard sequence, built through the Lab sequence's own API (the checks also build parts of it by hand)
  async function build({ name = 'Check seq', song = false, format = '9:16' } = {}) {
    const ids = await scenes();
    await ThreeSeq.create(name, { empty: true, format, show: true });
    const Q = ThreeSeq;
    const red = await Q.add({ sketch: ids.red }, { dur: 2, trans: null });
    const green = await Q.add({ sketch: ids.green }, { dur: 2 });
    const foot = await Q.add({ path: FOOTAGE }, { dur: 2, trans: null });
    const blue = await Q.add({ sketch: ids.blue }, { dur: 2, trans: { type: 'wipe-left', dur: 0.5 } });
    const title = await Q.add({ text: 'HELLO' }, { at: 0.5, dur: 1 });
    if (song) await Q.add({ path: SONG, song: true });
    await wait(600);
    return { ...ids, clips: { red, green, foot, blue, title } };
  }
  // the program at frame n, paused, once the preview says it's there
  async function at(n, { settle = 350 } = {}) {
    ThreeSeq.play(false);
    ThreeSeq.seek(n / ThreeSeq.fps);
    await ThreeSeq.settle(2000);
    await wait(settle);
    return probe();
  }
  return { wait, until, sbx, lab, scenes, probe, colorOf, build, at, FOOTAGE, SONG, SK };
})();
