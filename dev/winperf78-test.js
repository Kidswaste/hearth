// (round 78, winperf78) The Windows slow paths cut this round, tested here without a Windows PC (fakes for PowerShell /
// reg / git where Windows would run them; a real git checkout for the updater):
//   cloud-files   ONE long-lived PowerShell for the cloud-files probe: questions in order, one start for many, noise
//                 ignored, a dead / silent server → the one-shot call (as before), broken after 2 failures, quits idle
//   winpolish     drive types kept a week with each drive's serial: no PowerShell when fresh, a changed serial not trusted
//   gpu52         the graphics preference check remembers what it checked (asked again weekly, not every start)
//   updater       settle / bring back at the start: git asked once, then not again while HEAD, the tracked files and the
//                 stash log stay as they were
//   chatmedia     the per-reply media search is asynchronous and finds the same files
//   mainlag-probe the process counter: spawn / execFile / exec counted once each, promisified execFile still gives
//                 { stdout, stderr }, the Windows knobs delay a child's answer
//   node dev/winperf78-test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0; let fail = 0;
const ok = (c, name, info) => { if (c) { pass += 1; console.log(`✓ ${name}`); } else { fail += 1; console.log(`✖ ${name}${info === undefined ? '' : ` ${JSON.stringify(info).slice(0, 300)}`}`); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'winperf78-'));

// a fake long-lived PowerShell: answers each JSON line (after some noise) unless told otherwise
function fakePs({ silent = false, dieOn = -1, noise = true } = {}) {
  const made = [];
  const spawn = (exe, args, opts) => {
    const c = new EventEmitter();
    c.args = args; c.opts = opts; c.killed = false; c.lines = [];
    c.stdout = new EventEmitter(); c.stdout.setEncoding = () => {};
    c.stdin = new EventEmitter();
    c.kill = () => { c.killed = true; setImmediate(() => c.emit('exit', 0)); };
    c.stdin.end = () => {};
    c.stdin.write = (text) => {
      const paths = JSON.parse(text);
      c.lines.push(paths);
      if (silent) return true;
      if (c.lines.length - 1 === dieOn) { setImmediate(() => c.emit('exit', 1)); return true; }
      setTimeout(() => {
        if (noise) c.stdout.emit('data', 'WARNING: something PowerShell says\r\n');
        const out = `@@H ${JSON.stringify(paths.map((p) => ({ path: p, attributes: /cloud/.test(p) ? 0x400000 : 0x20 })))}\r\n`;
        c.stdout.emit('data', out.slice(0, 7)); c.stdout.emit('data', out.slice(7)); // in two chunks
      }, 5);
      return true;
    };
    made.push(c);
    return c;
  };
  return { spawn, made };
}

(async () => {
  try {
    // ---------- cloud-files: the long-lived PowerShell ----------
    {
      const CF = require('../cloud-files');
      CF.server.reset({ first: 300, answer: 300, idle: 200 });
      const ps = fakePs();
      const [a, b] = await Promise.all([CF.attributes(['C:/x/a.json', 'C:/x/cloud.png'], { platform: 'win32', spawn: ps.spawn }), CF.attributes(['C:/x/b.json'], { platform: 'win32', spawn: ps.spawn })]);
      const c = await CF.attributes(['C:/x/c.json', 'C:/x/c.json'], { platform: 'win32', spawn: ps.spawn });
      ok(ps.made.length === 1 && CF.server.state().asked === 3, 'cloud-files: three questions, one PowerShell started (was one each)', { starts: ps.made.length, st: CF.server.state() });
      ok(!CF.pending(a.get('C:/x/a.json')) && CF.pending(a.get('C:/x/cloud.png')) && !CF.pending(b.get('C:/x/b.json')) && !CF.pending(c.get('C:/x/c.json')), 'cloud-files: each answer goes to its own question (in order, noise lines and split chunks ignored)');
      const p0 = ps.made[0];
      ok(p0.opts.windowsHide && p0.args.includes('-EncodedCommand') && Buffer.from(p0.args[p0.args.indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le').includes('ReadLine()'), 'cloud-files: hidden, its loop script encoded (no quoting)');
      ok(JSON.stringify(p0.lines[2]) === '["C:/x/c.json"]', 'cloud-files: a path asked twice is sent once');
      await sleep(320);
      ok(p0.killed && !CF.server.state().running, 'cloud-files: it quits after its idle time');
      await CF.attributes(['C:/x/d.json'], { platform: 'win32', spawn: ps.spawn });
      ok(ps.made.length === 2, 'cloud-files: a question after that starts it again');
      CF.server.stop();

      // a silent server: the question asked the one-shot way (as before this round); two failures → one-shot for good
      CF.server.reset({ first: 80, answer: 80, idle: 1000 });
      const quiet = fakePs({ silent: true });
      const shots = [];
      const realExecFile = cp.execFile;
      cp.execFile = (exe, args, o, done) => { shots.push(args); return { stdin: { on() {}, end(t) { setImmediate(() => done(null, JSON.stringify(JSON.parse(t).map((p) => ({ path: p, attributes: 0x20 }))))); } } }; };
      try {
        const r1 = await CF.attributes(['C:/y/a.json'], { platform: 'win32', spawn: quiet.spawn });
        ok(!CF.pending(r1.get('C:/y/a.json')) && shots.length === 1 && CF.server.state().fails === 1, 'cloud-files: a server that doesn\'t answer → asked the one-shot way (the answer still arrives)', CF.server.state());
        await CF.attributes(['C:/y/b.json'], { platform: 'win32', spawn: quiet.spawn });
        const before = quiet.made.length;
        await CF.attributes(['C:/y/c.json'], { platform: 'win32', spawn: quiet.spawn });
        ok(CF.server.state().broken && quiet.made.length === before && shots.length === 3, 'cloud-files: after two failures, the one-shot way for the rest of the session (no more server starts)', { st: CF.server.state(), made: quiet.made.length, shots: shots.length });
        // dies mid-question
        CF.server.reset({ first: 300, answer: 300, idle: 1000 });
        const dying = fakePs({ dieOn: 1 });
        const d1 = await CF.attributes(['C:/z/1.json'], { platform: 'win32', spawn: dying.spawn });
        const d2 = await CF.attributes(['C:/z/2.json'], { platform: 'win32', spawn: dying.spawn });
        const d3 = await CF.attributes(['C:/z/3.json'], { platform: 'win32', spawn: dying.spawn });
        ok([d1, d2, d3].every((m, i) => m.get(`C:/z/${i + 1}.json`) === 0x20) && dying.made.length === 2, 'cloud-files: a server that quits mid-question: that one asked the one-shot way, the next starts a new server', { made: dying.made.length });
        // execFile given (synchard74, cloud-files-test): one call per batch, never the server
        CF.server.reset();
        const n0 = shots.length;
        await CF.attributes(['C:/w/1.json'], { platform: 'win32', execFile: cp.execFile, spawn: () => { throw Error('must not start the server'); } });
        ok(shots.length === n0 + 1, 'cloud-files: execFile given → the one-shot call, as before');
        const mac = await CF.attributes(['x'], { platform: 'darwin', spawn: () => { throw Error('must not start'); } });
        ok(mac.get('x') === 0, 'cloud-files: Mac / Linux ask nothing');
      } finally { cp.execFile = realExecFile; CF.server.reset(); }
    }

    // ---------- winpolish: drive types kept between starts ----------
    {
      delete require.cache[require.resolve('../winpolish')];
      const WP = require('../winpolish');
      const file = path.join(tmp, 'win-drives.json');
      let asked = 0;
      const ps = (exe, args, o, done) => { asked += 1; setImmediate(() => done(null, 'C Fixed\r\nD Fixed\r\nE Removable\r\nZ Network\r\n')); };
      const serials = { C: 11, D: 22, E: 33, Z: 44 };
      const serial = async (L) => serials[L] ?? null;
      const n1 = await WP.warmDrives({ file, platform: 'win32', execFile: ps, serial });
      const kept = JSON.parse(fs.readFileSync(file, 'utf8'));
      ok(asked === 1 && n1 === 4 && kept.drives.E.t === 'removable' && kept.drives.D.dev === 22, 'drives: the first start asks PowerShell once and keeps the answers with each drive\'s serial', kept);
      WP._drives.cache.clear();
      serials.E = 99; // another stick in E:
      const n2 = await WP.warmDrives({ file, platform: 'win32', execFile: ps, serial });
      ok(asked === 1 && n2 === 3 && WP._drives.cache.get('D') === 'fixed' && !WP._drives.cache.has('E'), 'drives: the next start starts no PowerShell; a drive whose serial changed isn\'t trusted (asked when needed)', [...WP._drives.cache]);
      fs.writeFileSync(file, JSON.stringify({ ...kept, at: Date.now() - 8 * 864e5 }));
      WP._drives.cache.clear();
      await WP.warmDrives({ file, platform: 'win32', execFile: ps, serial });
      ok(asked === 2, 'drives: answers a week old are asked again');
      ok(await WP.warmDrives({ file, platform: 'darwin', execFile: ps, serial }) === 0 && asked === 2, 'drives: nothing on a Mac');
      // the Recycle Bin check reads the cache as before
      WP._drives.cache.set('E', 'removable');
      ok(!WP.trashCheck('E:\\photos\\a.jpg', { platform: 'win32', env: { SystemDrive: 'C:' } }).ok && WP.trashCheck('D:\\a.txt', { platform: 'win32', env: { SystemDrive: 'C:' } }).ok, 'drives: the Recycle Bin check uses them (USB refused, a fixed drive fine)');
    }

    // ---------- gpu52: what the registry check checked is remembered ----------
    {
      const real = Object.getOwnPropertyDescriptor(process, 'platform');
      delete require.cache[require.resolve('../gpu52main')];
      const M = require('../gpu52main');
      const dir = fs.mkdtempSync(path.join(tmp, 'gpu'));
      const app = { commandLine: { appendSwitch() {}, hasSwitch: () => false, getSwitchValue: () => '' } };
      M.early(app, { settings: {}, dataDir: dir, platform: 'win32', argv: [] });
      const reg = (cmd, args, _o, cb) => { if (args[0] === 'query') cb(null, '    C:\\Hearth\\Hearth.exe    REG_SZ    GpuPreference=2;\r\n'); else cb(null, ''); };
      await M.winRegistry('C:\\Hearth\\Hearth.exe', 'auto', reg);
      const m = JSON.parse(fs.readFileSync(path.join(dir, 'gpu52.json'), 'utf8'));
      ok(m.win?.checked?.exe === 'C:\\Hearth\\Hearth.exe' && m.win.checked.power === 'auto' && Date.now() - m.win.checked.at < 5000, 'gpu52: the check is remembered (program, choice, when): the next starts skip reg.exe for a week', m.win);
      const src = fs.readFileSync(path.join(ROOT, 'gpu52main.js'), 'utf8');
      ok(/if \(!regFresh\(\)\) winRegistry/.test(src), 'gpu52: the start asks only when not fresh');
      Object.defineProperty(process, 'platform', real);
    }

    // ---------- updater: settle / bring back at the start, git asked once ----------
    {
      let gitCalls = 0;
      const realExecFile = cp.execFile;
      cp.execFile = function (file, args, ...rest) { if (/git/.test(String(file))) gitCalls += 1; return realExecFile.call(this, file, args, ...rest); };
      try {
        delete require.cache[require.resolve('../updatermain')];
        const U = require('../updatermain');
        const repo = fs.mkdtempSync(path.join(tmp, 'repo'));
        const g = (...a) => cp.execFileSync('git', ['-C', repo, ...a], { stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
        g('init', '-q', '-b', 'main');
        fs.writeFileSync(path.join(repo, 'config.json'), '{"agents":[]}\n'); fs.writeFileSync(path.join(repo, 'theme.css'), ':root{}\n');
        g('add', '.'); g('commit', '-q', '-m', 'one');
        const data = path.join(repo, 'data'); fs.mkdirSync(data);
        fs.writeFileSync(path.join(data, 'config.json'), '{"agents":[],"defaultsSeen":[]}\n'); fs.writeFileSync(path.join(data, 'theme.css'), ':root{}\n');
        const own = { config: path.join(data, 'config.json'), theme: path.join(data, 'theme.css') };
        const u = U.create({ dir: repo });
        gitCalls = 0;
        const s1 = await u.settle({ own });
        const first = gitCalls;
        gitCalls = 0;
        const s2 = await u.settle({ own });
        ok(first >= 2 && gitCalls === 0 && s1.ok && s2.ok && !s2.settled.length, `updater: settle asks git at the first start (${first}×), not at the next (0×) when nothing changed`, { s1, s2, gitCalls });
        fs.writeFileSync(path.join(repo, 'theme.css'), ':root{--x:1}\n');
        gitCalls = 0;
        const s3 = await u.settle({ own });
        ok(gitCalls >= 2 && s3.settled.includes('theme.css'), 'updater: a tracked file changed → asked again (and settled as before)', { s3, gitCalls });
        fs.writeFileSync(path.join(repo, 'x.txt'), 'x'); g('add', 'x.txt'); g('commit', '-q', '-m', 'two');
        gitCalls = 0; await u.settle({ own }); const afterCommit = gitCalls;
        ok(afterCommit >= 2, 'updater: a new HEAD (an update came in) → asked again', afterCommit);
        // bring back: a stash log that exists but was all handled
        fs.writeFileSync(path.join(repo, 'x.txt'), 'y'); g('stash', 'push', '-q', '-m', 'something else');
        gitCalls = 0; const b1 = await u.bringBack({ own }); const firstB = gitCalls;
        gitCalls = 0; const b2 = await u.bringBack({ own });
        ok(firstB === 1 && gitCalls === 0 && b1.ok && b2.ok, `updater: bring back reads the stash list once (${firstB}×), then not while the stash log is unchanged (0×)`, { firstB, gitCalls });
        fs.writeFileSync(path.join(repo, 'x.txt'), 'z'); g('stash', 'push', '-q', '-m', 'another');
        gitCalls = 0; await u.bringBack({ own });
        ok(gitCalls === 1, 'updater: a new stash → read again', gitCalls);
      } finally { cp.execFile = realExecFile; }
    }

    // ---------- chatmedia: asynchronous, same answers ----------
    {
      const M = require('../chatmediamain');
      const d = fs.mkdtempSync(path.join(tmp, 'media'));
      fs.mkdirSync(path.join(d, 'out', 'a'), { recursive: true }); fs.mkdirSync(path.join(d, 'node_modules'));
      fs.writeFileSync(path.join(d, 'out', 'a', 'poster.png'), 'x'); fs.writeFileSync(path.join(d, 'clip.mp4'), 'y'); fs.writeFileSync(path.join(d, 'node_modules', 'skip.png'), 'z');
      const realStatSync = fs.statSync; const realReaddirSync = fs.readdirSync; let syncCalls = 0;
      fs.statSync = (...a) => { syncCalls += 1; return realStatSync(...a); }; fs.readdirSync = (...a) => { syncCalls += 1; return realReaddirSync(...a); };
      let r;
      try { await M.find({ since: Date.now() - 60000, names: ['out/a/poster.png', 'clip.mp4', 'skip.png'] }, [d]); } finally { fs.statSync = realStatSync; fs.readdirSync = realReaddirSync; }
      ok(syncCalls === 0, 'chatmedia: no readdirSync / statSync on the main process (the walk and relative names; a full path from the other computer is still looked up by reachmain)', syncCalls);
      r = await M.find({ since: Date.now() - 60000, names: ['out/a/poster.png', 'sandbox:/mnt/data/clip.mp4', 'skip.png'] }, [d]);
      ok(r.recent.length === 2 && r.resolved['out/a/poster.png'] === path.join(d, 'out', 'a', 'poster.png') && r.resolved['sandbox:/mnt/data/clip.mp4'] === path.join(d, 'clip.mp4') && !r.resolved['skip.png'], 'chatmedia: the same files found (node_modules skipped)', r);
    }

    // ---------- the probe's process counter (its own Node: it patches modules) ----------
    {
      const code = `
        process.env.HEARTH_WINSIM = '1'; process.env.HEARTH_SPAWN_MS = '5'; process.env.HEARTH_SPAWN_LAT_MS = '150';
        const p = require(${JSON.stringify(path.join(ROOT, 'mainlag-probe.js'))});
        const cp = require('child_process'); const util = require('util'); const fs = require('fs');
        (async () => {
          const t0 = Date.now(); const r = await util.promisify(cp.execFile)(process.execPath, ['-e', 'process.stdout.write("hi")']); const lat = Date.now() - t0;
          await new Promise((res) => cp.exec('echo a', res));
          cp.spawnSync(process.execPath, ['-e', '0']);
          await fs.promises.stat(__filename || '.').catch(() => {}); fs.statSync('.');
          const t = await p.take({ label: 't' }); p.histogram.disable();
          console.log(JSON.stringify({ out: r.stdout, lat, n: t.spawns.n, by: t.spawns.byProg, fsSync: t.fsSync.n, fsAsync: t.fsAsync.n, sim: t.sim }));
        })();`;
      const r = cp.spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', timeout: 60000 });
      let j = null; try { j = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { j = null; }
      ok(j && j.out === 'hi' && j.n === 3 && j.lat >= 150, 'probe: execFile (promisified: { stdout }), exec and spawnSync counted once each; a child answers HEARTH_SPAWN_LAT_MS later', j || r.stderr);
      ok(j && j.fsSync >= 1 && j.fsAsync >= 1 && j.sim.winsim === true && j.sim.spawnMs === 5, 'probe: sync and async fs counted, the knobs reported', j?.sim);
    }
  } catch (err) { fail += 1; console.log(`✖ crashed: ${err.stack}`); }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`winperf78-test: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
