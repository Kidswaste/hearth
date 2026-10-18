// (round 64, vstembed64) Click → sound and click → controls ready, before → after, with the fake Pedalboard shaped like
// the real one (dev/fixtures/fake-vst-py/pedalboard.py: the 1,001-text wrapper build per control at load, the by-name
// scan per read). "Before" is the round-63 host taken from git (creative-vst-host.py + creative-vst-offline.py at
// BENCH_BEFORE, default 9c5eccd); "after" is this tree. Three runs each: a cold start (new data folder), a second
// session (same data folder: the control list is on disk for "after"), and after the idle warm-up ("after" only).
//   node dev/vstembed64-bench.js                       (400 controls × 2 ms: quick)
//   BENCH_PARAMS=2600 BENCH_WRAP_MS=3 BENCH_NAME_US=0.6 node dev/vstembed64-bench.js     (Serum 2-sized, see the doc)
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const M = require('../creative-vstmain');
const PARAMS = process.env.BENCH_PARAMS || '400', WRAP = process.env.BENCH_WRAP_MS || '2', NAME = process.env.BENCH_NAME_US || '0.5', REF = process.env.BENCH_BEFORE || '9c5eccd';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const py = spawnSync('python3', ['-c', 'import numpy, sys; print(sys.executable)'], { encoding: 'utf8' });
if (py.status !== 0) { console.log(JSON.stringify({ skipped: 'python3 with numpy not found' })); process.exit(0); }
const PY = py.stdout.trim();
Object.assign(process.env, { PYTHONPATH: path.join(__dirname, 'fixtures', 'fake-vst-py'), FAKE_PB_PARAMS: PARAMS, FAKE_PB_WRAP_MS: WRAP, FAKE_PB_NAME_US: NAME, FAKE_MIDI_NOTE: '0', PYTHONDONTWRITEBYTECODE: '1' });
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-vstbench-'));
let before = null;
try {
  const dir = path.join(work, 'before'); fs.mkdirSync(dir);
  for (const f of ['creative-vst-host.py', 'creative-vst-offline.py']) fs.writeFileSync(path.join(dir, f), execFileSync('git', ['show', `${REF}:${f}`], { cwd: path.join(__dirname, '..') }));
  before = path.join(dir, 'creative-vst-host.py');
} catch { /* no git history here: "after" only */ }
const root = path.join(work, 'plugins'); fs.mkdirSync(path.join(root, 'Serum2.vst3'), { recursive: true });

async function session(helper, data, { warm = false } = {}) {
  const host = M.pool({ dataDir: data, python: PY, roots: [root], ...(helper ? { helper } : {}) });
  const plugin = host.scan().plugins[0].path, R = (action, x = {}) => host.request({ action, plugin, name: 'Serum 2', ...x });
  try {
    let warmMs = null;
    if (warm) { const t = Date.now(); await host.warm(plugin, []); warmMs = Date.now() - t; }
    const t0 = Date.now();
    const open = await R('open', { live: true, buffer: 256 }); if (!open.ok) throw Error(open.error);
    const sound = Date.now() - t0;
    let controls;
    if (helper) { const r = await R('inspect'); if (!r.ok) throw Error(r.error); controls = Date.now() - t0; }
    else { for (let i = 0; ; i++) { const r = await R('controls', i ? { limit: 240 } : {}); if (!r.ok) throw Error(r.error); if (r.ready) { if (i) await R('controls'); break; } await sleep(i < 20 ? 120 : 400); } controls = Date.now() - t0; } // as the desk asks
    return { clickToSoundMs: sound, clickToControlsMs: controls, ...(warmMs !== null ? { idleWarmMs: warmMs } : {}) };
  } finally { host.stop(); await sleep(300); }
}
(async () => {
  const out = { controls: Number(PARAMS) + 6, wrapMsPerControl: Number(WRAP), scanUsPerControl: Number(NAME), before: null, after: {} };
  if (before) {
    const data = path.join(work, 'd-before');
    out.before = { cold: await session(before, data), secondSession: await session(before, data) };
  }
  const data = path.join(work, 'd-after');
  out.after = { cold: await session(null, data), secondSession: await session(null, data), afterIdleWarm: await session(null, data, { warm: true }) };
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => fs.rmSync(work, { recursive: true, force: true }));
