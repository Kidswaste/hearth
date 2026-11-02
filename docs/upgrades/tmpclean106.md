# tmpclean106 (round 106): every check cleans up its own temp folders

The cloud test machine's disk kept filling up: every run of `node dev/run-checks.js` left `/tmp/hearth-*` folders
behind. A blanket sweep of `/tmp/hearth-*` is wrong (a running check's folder looks the same as a stale one), so this
stream fixes it at the source: what a check makes, the check (or the runner) removes, whether it passes or fails, and
the runner says so when something is left.

Nothing here deletes a folder this code didn't make. The ≈ 3,300 old `/tmp/hearth-*` folders (≈ 15.5 GB) from earlier
runs are left alone: some may belong to a live run, and clearing them is the owner's call (the inventory below says
what they are).

## 1. What leaked, and where

Inventory of `/tmp/hearth-*` on the test box at the start of this round (`du -sk` per folder, grouped by prefix;
shared fixtures left out):

| Prefix | Folders | Size | Made by | Why it stayed |
|---|---:|---:|---|---|
| `hearth-sync72-*` | 245 | 7.1 GB | `dev/sync72-test.js`, made when the file is **required** as a library (21 unit tests in the release group use it: merge105, emptyread104, keptaside94, syncsweep97…) | only `sync72-test`'s own `main()` removed it; a test that used it as a library never did |
| `hearth-smoke-*`, `-profile-*`, `-tmp-*` | 35 + 29 + 28 | 2.8 GB + 125 MB + 132 MB | `dev/smoke.js` (the app copy, its Chromium profile, the check's scratch folder) | removed only in the normal `finally`: the harness's own time limit (`process.exit`), a kill (Ctrl-C, run-checks' 30-min timeout) or an Electron helper still writing left them |
| `hearth-ib83-*` | 2 + 4 clouds + … | ≈ 1 GB | `dev/idleburst83.js` (app copies, profiles, `<profile>-cloud`) | the same: a run that died half-way |
| `hearth-lazy-*` | 6 | 469 MB | `dev/lazy-manifest.js` (an app copy per recording) | a recording that threw ("no result in the smoke output") skipped the remove |
| `hearth-sync72-perf-*` | 1 | 408 MB | `dev/sync72-perf.js` (the heavy profile copied twice) | killed half-way |
| `hearth-syncmedia73-*`, `hearth-offmain-cloud-*`, `-ws-*` | 8, 18, 14 | 384 MB, 153 MB, 33 MB | in-page checks (`dev/checks/syncmedia73.js`, `offmain.js`) writing a "cloud drive" at a hard-coded `/tmp/hearth-…-${Date.now()}` | nobody removed them, ever (one per run) |
| `hearth-syncscope79-50k-*`, `hearth-sync-test-*`, `hearth-synclat77-*`, `hearth-configsafe-*` | 1, 5, 10, 6 | 320, 266, 110, 75 MB | unit tests (`fs.mkdtempSync(os.tmpdir()…)`) | removed only on a pass |
| `hearth-datasafe-*` (6 kinds) | 686 | 72 MB | `dev/datasafe-test.js` | one folder per case, never removed |
| `hearth-sync-smoke-*`, `hearth-access-*`, `hearth-aicheck-*`, `hearth-labsync88-*`, `hearth-guardloss78-*`, `hearth-versions75-*`, … | 138, 854, 58, 78, 23, 24 | small (≈ 35 MB together) | in-page checks with a hard-coded `/tmp/hearth-…-${Date.now()}` | never removed |
| `hearth-term-*`, `hearth-post-*`, `hearth-backup-look*` | 473, 187, 29 | 14 MB | **the app** (`installs.js`, `publishmain.js`, `backupautomain.js`) making its own temp folders in `os.tmpdir()` while a check drove it | the app process is killed at the end of a check |

Not `hearth-*` but the same cause: ≈ 17,700 `/tmp/xvfb-run.*` (xvfb-run's own folder, left when smoke.js kills its
process group) and ≈ 16,000 `/tmp/scoped_dir*` (Chromium's), a few KB each.

**Before, per run**: a full release run (`node dev/run-checks.js release`, 257 checks) added ≈ 3 GB (the owner's
measure; the 21 library users of sync72-test alone ≈ 0.6 GB, plus every app check that failed or timed out ≈ 80–400 MB
each, plus the in-page clouds and unit test folders).

Measured this round for the unit tests: the `unit` group run with `HEARTH_TMP_KEEP=1` (the new helper keeps what it
made, as the old code did) left **479 MB** in its checks' temp roots: `labsync87-test` 346 MB (sync72-test's library
folder), `syncsweep97-test` 69 MB, `projsync76-test` 36 MB, `storeack77-test` 7 MB, `guardloss78-test` 4 MB, the rest
small. Without the per-check roots all of it would have stayed in `/tmp`. The app checks added the in-page cloud
folders on every run and 80–400 MB for each check that failed, timed out or was killed (smoke.js copies, lazy-manifest
copies).

## 2. What changed

### The runner: one temp root per check (`dev/run-checks.js`, `dev/tmp-guard.js`)
- A run makes one folder, `/tmp/hearth-run-XXXXXX`. Each check gets a short root in it (`…/001`, `…/002`, …) and runs
  with `TMPDIR`, `TMP`, `TEMP` and `HEARTH_TMP` set to it. Whatever the check, the app it starts, Xvfb, Chromium or a
  helper makes with `os.tmpdir()` / `mktemp` lands there, and the root is removed when the check ends, passed or
  failed. The roots are kept short on purpose: Electron's socket paths live under `TMPDIR`.
- Logs and screenshots stay outside the root, in `/tmp/hearth-checks` (`--out`), as before.
- The fixture makers and the `gameready` / `gameready-relaunch` profile pair use the run folder too.
- **The guard**: the `/tmp/hearth-*` folders before and after each check (its root removed). A new one that isn't a
  documented shared fixture is named on the check's line (`(left in /tmp: …)`) and again at the end of the run:
  `temp: N /tmp/hearth-* folder(s) left by this run`. The `release` group (or `--tmp-strict`) **fails** on any. The end
  of a run also says how much the checks' roots held when they ended (removed with them): what each check would have
  left without the root, so a test that doesn't clean up after itself still shows.
- The edits to `run-checks.js` are only the temp root and the guard (tests106 works on the unit list there).

### Shared fixtures: explicit, documented, bounded
`dev/tmp-guard.js`'s `SHARED` list names every `/tmp/hearth-*` folder checks reuse on purpose and what makes it: the
`FIX` fixtures in run-checks (`hearth-bigchat84`, `hearth-bigprofile72`, `hearth-bigprofile70`, `hearth-bigchat82`,
`hearth-projopen86`, test songs / videos…), `hearth-asset-fixtures` (smoke.js), `hearth-sync72-bigprofile` and
`hearth-perf93-fresh` (perfguard / sync72-perf), `hearth-mediapipe` (placed by hand), `hearth-checks` (logs). Each is
one folder at a fixed path, made once and reused: bounded by construction. The perf tools' fixture paths are now
fixed (`/tmp/hearth-sync72-bigprofile`, `/tmp/hearth-bigchat82`) instead of following `TMPDIR`, so a per-check root
never makes a second copy of a 300 MB profile.

### Every script cleans its own folders (`dev/tmp-own.js`)
For runs outside the runner (by hand, from another script), the sources clean up too:
- `dev/tmp-own.js`: `mkdtemp(prefix)` = `fs.mkdtempSync(path.join(os.tmpdir(), prefix))`, removed when the process
  ends however it ends: normally, `process.exit(1)` from a failed test, an uncaught error, or SIGINT / SIGTERM / SIGHUP.
  `--keep` or `HEARTH_TMP_KEEP=1` keeps them.
- Every `fs.mkdtempSync(path.join(os.tmpdir(), '…'))` in `dev/` (203 calls in 160 files) now goes through it, except
  in Codex's files (below), which the runner's root covers.
- `dev/smoke.js`: the app copy, profile and scratch folder go through it; Electron and Xvfb are killed **before** they
  are removed (`prependListener('exit', killAll)`), on the harness's time limit and on a kill too.
- `dev/sync72-test.js`'s library folder: removed when the requiring test ends.
- `dev/lazy-manifest.js`: its copies go even when a recording throws.
- `dev/idleburst83.js`: the `<profile>-cloud` folders are owned too.
- `dev/perfguard.js`: the A/B base worktree is removed (and pruned from git's list) on any exit, not only after a
  clean run; each launch's scratch folder is emptied but for its measurements file (the logs stay).
- `dev/checks/twocopies64.js` run by hand writes to `/tmp/hearth-checks/twocopies64` (one folder) instead of a new
  temp folder per run.
- In-page checks with a hard-coded `/tmp/hearth-…` scratch or "cloud drive" folder now use the run's scratch folder,
  `${window.SMOKE_TMP || '/tmp'}/hearth-…` (removed by smoke.js), as checkfix88 did for sync72: access-chat,
  access-astra, aicheck, aiundo, bugbash2, errorcalm, filewatch, guardloss78, hooks, labdrop61, labsync87, labsync88,
  offmain, projsync76, storeack77, sync, synchard74, syncmedia73, versions75 (one folder per run before), and
  attachlean, dragdrop, gpuload84, lab3d-models, labmaterials, labsmooth54, labstartfast, labtemplates, labtype240,
  packs, scenesafe (fixed names before).

Left as they are (bounded: one fixed folder or file, overwritten each run): screenshot folders and files a check keeps
for a person to look at (`/tmp/hearth-comp`, `hearth-makes`, `hearth-motion`, `hearth-live`, `hearth-scenes`,
`hearth-studio`, `hearth-bigscreen`, `/tmp/*.png`), `--save-dir` folders named in check headers, the test songs a
check writes once (`/tmp/hearth-*-check.wav`), and scripts outside the runner (`dev/journeys.sh`, `dev/data-checks.js`).

## 3. After

| Run | Result | Removed with the checks' temp roots | `/tmp/hearth-*` folders left |
|---|---|---:|---:|
| `release` (257 checks: qa + every unit test), 34 min | 254/257 (see below) | 7 MB | **0** |
| `--exact lazy sync72 chatwindow86 bigchat84` (`CHATWINDOW86=1 BIGCHAT84=1`), 7 min | 4/4 | 0 MB | **0** |
| `dev/smoke.js` by hand: a plain run, then a run killed (SIGTERM) half-way | passed / killed | — | **0** (the killed run's copy, profile and scratch folder went with it) |
| `unit` with `HEARTH_TMP_KEEP=1` (the "before" measure above) | 249/251 | 479 MB | 0 of its own |

A listing of `/tmp/hearth-*` before and after the release run matched the guard: nothing new but the folders of
another checkout's release run that was going at the same time (its smoke.js copies, still in use). Only the shared
fixtures and `/tmp/hearth-checks` remain from these runs.

**After, per run**: a release run leaves nothing in `/tmp` (was ≈ 3 GB); what its checks still make in their roots
(7 MB here) goes with each root.

The three release failures are not about temp folders (none of them touches one): `localanswers-test` fails on the
base too, run by hand (its "what changed today?" case reads the newest patch notes, round 105's); `assets-test` failed
once on a 1 ms timestamp tie in its ranking case and `bouncelog66-test` once on "saving silence" while another
checkout's unit tests were running; both pass when run again by hand. Not skipped, not changed here.

**Two runs at once.** Another checkout's run (old code) leaves its folders in `/tmp` while ours runs. The guard checks
whether another run is going when a check starts and ends (a Node script in a `dev/` folder that isn't this runner or
what started it, read from `/proc`); a folder that appears then is named as "maybe the other run's" and doesn't fail
the release group. During the `HEARTH_TMP_KEEP` measure above, 31 such folders (475 MB) appeared, all the other run's
(`hearth-lazy-*`, `hearth-smoke-*`, `hearth-sync72-*`, `hearth-datasafe-*` from tests ours wasn't running then).

## For Codex
No edits to Codex's files. Their temp folders are covered by the runner's per-check root when they run through
`dev/run-checks.js`; run by hand, these still make a folder in `/tmp` that a failed run leaves (worth moving to
`require('./tmp-own').mkdtemp(…)` when next touched): `dev/astra-smoke.js`, `dev/astra-connect-smoke.js`,
`dev/astra-quick-controls-smoke.js`, `dev/astra-workspace-smoke.js`, `dev/astra-engine-test.js`,
`dev/quest-review-test.js`; `dev/checks/projects.js` keeps its shots in `/tmp/hearth-projects` (one folder, bounded).

## For the patch notes
- **Behind the scenes**: the automatic checks now clean up after themselves. Each one works in its own temporary
  folder that is removed when it finishes, and a release check fails if any check leaves a folder behind. Test runs no
  longer fill up the test machine's disk (about 3 GB per full run before). Nothing changes in the app.
