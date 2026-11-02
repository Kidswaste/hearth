// (round 106, tmpclean106) Temp folders of a check run: each check gets its own temp root, removed when it ends, and a
// guard that names the /tmp/hearth-* folders a run made and didn't remove.
//
// Why: every run of dev/run-checks.js left /tmp/hearth-* folders behind (≈ 3 GB per release run, 17 GB piled up on the
// cloud test box). A blanket sweep of /tmp/hearth-* is wrong (a running check's folder looks the same as a stale one),
// so the run cleans what it makes, at the source:
//   - run-checks makes one run folder (<tmp>/hearth-run-XXXXXX) and, per check, a short root in it (…/001, …/002…). The
//     check runs with TMPDIR / TMP / TEMP / HEARTH_TMP set to that root, so whatever it (or the app it starts, Xvfb,
//     Chromium, a helper) makes with os.tmpdir() / mktemp lands there, and the root is removed when the check ends,
//     passed or failed. Its logs and screenshots go to /tmp/hearth-checks (--out), outside the root, and are kept.
//     The roots are short on purpose: Electron's socket paths live under TMPDIR (a long one breaks it, dev/longrun91.js).
//   - the guard: the /tmp/hearth-* folders before a check and after it (its root removed); a new one that isn't a
//     documented shared fixture (SHARED below) is a leak, named with the check that made it. The run lists them at the
//     end; the release group fails on any.
// Shared fixtures (SHARED) are kept on purpose: made once, reused by many checks, the same path each run (bounded: one
// copy each, never one per run). Nothing here removes a folder the run didn't make (old folders of other runs are the
// owner's call: you can't tell a live one from a stale one).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const BASE = os.tmpdir(); // the runner's own temp folder (/tmp): where the guard looks
// The shared, long-lived folders checks reuse on purpose (one copy each, the same path every run). Fixtures are made
// by run-checks (its FIX list: test songs / videos, the big profiles…) or by the tool named; logs live in hearth-checks.
const SHARED = new Map([
  ['hearth-checks', 'run-checks logs, screenshots and step pictures (--out); overwritten per check name'],
  ['hearth-test-videos', 'FIX: dev/make-test-videos.sh'], ['hearth-editor-videos', 'FIX: dev/make-editor-videos.js'],
  ['hearth-board-fixtures', 'FIX: dev/board-fixtures.sh'], ['hearth-capture-test', 'FIX: dev/capture-test.js --make'],
  ['hearth-chatlist-fixture', 'FIX: dev/make-chatlist-fixture.js (3,000 made-up chats)'],
  ['hearth-bigprofile70', 'FIX: dev/bigprofile.js (heavy owner-like profile)'], ['hearth-bigprofile72', 'FIX: dev/bigprofile.js --projects 40 (also perfguard)'],
  ['hearth-bigchat82', 'FIX: dev/bigprofile.js --giant 1'], ['hearth-bigchat84', 'FIX: dev/bigchat84-fixture.js'],
  ['hearth-projopen86', 'FIX: dev/projopen86-fixture.js'], ['hearth-bighome', 'FIX: dev/make-bighome-fixture.js'],
  ['hearth-datasafe-fixture', 'FIX: dev/datasafe-test.js --make-fixture'], ['hearth-gamemode', 'FIX: dev/make-game-fixture.js'],
  ['hearth-gameready-tools', 'FIX: npm gltfpack for Optimize for play'], ['hearth-pins-fixture', 'FIX: a Pinterest-like page'],
  ['hearth-asset-fixtures', 'dev/smoke.js / dev/fake-assets.js: real asset files'],
  ['hearth-sync72-bigprofile', 'dev/sync72-perf.js / perfguard: the sync engine\'s heavy profile'],
  ['hearth-perf93-fresh', 'perfguard: the heavy profile + one giant chat'], ['hearth-perfguard', 'perfguard\'s own logs when run by hand (--out)'],
  ['hearth-mediapipe', 'motion-in-real: the real MediaPipe files, placed by hand'],
  ['hearth-bigprofile-fixture', 'dev/make-bigprofile-fixture.js'],
]);
const isShared = (name) => SHARED.has(name) || /\.making$/.test(name); // (a fixture being made by another run)
// a run folder of ours or of another run at once (each removes its own; ours is checked by name)
const isRunRoot = (name) => /^hearth-run-[A-Za-z0-9]{6}$/.test(name);

// the hearth-* folders in /tmp now (folders only: a file is overwritten in place, never one per run)
function snapshot() {
  const s = new Set();
  let names = [];
  try { names = fs.readdirSync(BASE); } catch { return s; }
  for (const n of names) {
    if (!n.startsWith('hearth-')) continue;
    try { if (fs.lstatSync(path.join(BASE, n)).isDirectory()) s.add(n); } catch { /* gone meanwhile */ }
  }
  return s;
}
const kbOf = (p) => { const r = spawnSync('du', ['-sk', p], { encoding: 'utf8' }); return Number((r.stdout || '').split('\t')[0]) || 0; };
// another run at once (another checkout's checks or tests: a Node script in a dev/ folder that isn't this runner or
// its children): a folder that appears in /tmp meanwhile may be that run's, so it's named but doesn't fail the run.
// (Checked when a check starts and ends: this runner's own children are gone by then.)
const ppidOf = (pid) => { try { return Number(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').replace(/^.*\) /s, '').split(' ')[1]); } catch { return 0; } };
const mine = new Set(); // this runner and the processes that started it (flock, a shell)
for (let p = process.pid; p > 1 && !mine.has(p); p = ppidOf(p)) mine.add(p);
function others() {
  const out = [];
  let pids = []; try { pids = fs.readdirSync('/proc').filter((d) => /^\d+$/.test(d)); } catch { return out; }
  for (const pid of pids) {
    if (mine.has(Number(pid))) continue;
    let cmd = ''; try { cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').join(' '); } catch { continue; }
    const m = cmd.match(/(?:^|[\s/])dev\/[\w./-]+\.(?:js|sh)\b/);
    if (m && /\bnode\b|\bsh\b|electron/.test(cmd)) out.push(`${pid} ${m[0].trim()}`);
  }
  return out;
}
const rm = (p) => { try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); return ''; } catch (e) { return e.code || e.message; } };

function create() {
  const runDir = fs.mkdtempSync(path.join(BASE, 'hearth-run-'));
  const runName = path.basename(runDir);
  const start = snapshot();
  let i = 0;
  const leaks = []; // { check, name, kb }
  const held = []; // { check, kb }: what a check's root held when it ended (removed with it)
  const stuck = []; // { check, root, why }
  const seenOthers = new Set(); // other runs seen during this one
  const removeRun = () => { rm(runDir); };
  process.on('exit', removeRun);
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { removeRun(); process.exit(130); });
  return {
    runDir,
    base: BASE,
    // a fresh root for the next check: its env (TMPDIR & co.) and the bookkeeping to close it
    open(check) {
      const root = path.join(runDir, String(++i).padStart(3, '0'));
      fs.mkdirSync(root, { recursive: true });
      const before = snapshot();
      const busy0 = others();
      return {
        root,
        env: { TMPDIR: root, TMP: root, TEMP: root, HEARTH_TMP: root },
        // the check ended: remove its root, then name the /tmp/hearth-* folders it left
        close() {
          const kb = kbOf(root);
          if (kb > 4) held.push({ check, kb });
          const why = rm(root);
          if (why && fs.existsSync(root)) stuck.push({ check, root, why });
          const busy = [...busy0, ...others()];
          for (const o of busy) seenOthers.add(o);
          const now = [];
          for (const n of snapshot()) if (!before.has(n) && !isShared(n) && !isRunRoot(n)) now.push({ check, name: n, kb: kbOf(path.join(BASE, n)), maybeOther: busy.length > 0 });
          leaks.push(...now);
          return now;
        },
      };
    },
    // the run's end: remove the run folder, then the leaks still there (one removed meanwhile by its maker isn't one)
    finish() {
      const why = rm(runDir);
      const left = leaks.filter((l) => fs.existsSync(path.join(BASE, l.name)));
      // a folder that appeared outside any check (the fixtures step, between checks) and isn't shared
      const seen = new Set(left.map((l) => l.name));
      for (const n of snapshot()) if (!start.has(n) && !seen.has(n) && !isShared(n) && !(isRunRoot(n) && n !== runName)) left.push({ check: '(between checks)', name: n, kb: kbOf(path.join(BASE, n)), maybeOther: seenOthers.size > 0 });
      if (why && fs.existsSync(runDir) && !left.some((l) => l.name === runName)) left.push({ check: '(the run folder)', name: runName, kb: kbOf(runDir), why });
      // sure: no other run was going while it appeared (those fail the release group); maybe: another run was
      const sure = left.filter((l) => !l.maybeOther);
      return { left, sure, maybe: left.filter((l) => l.maybeOther), others: [...new Set([...seenOthers].map((o) => o.replace(/^\d+ /, '')))], held, stuck, heldKb: held.reduce((s, h) => s + h.kb, 0) };
    },
  };
}

module.exports = { create, snapshot, SHARED, isShared, BASE };
