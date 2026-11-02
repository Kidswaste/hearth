# units105 (round 105): every unit test passes, and a release runs all of them

Round 104 ran the whole unit list (`node dev/run-checks.js unit`) for the first time in a while and found four tests
failing on the base (`258aff7`): `updatesafe-test`, `perfectloop-test`, `labpace-test` and `audio-test`, plus
`timemachine-test` and `synchard74-test` failing "under load". None of them were in a usual release run, so nobody saw
them. This stream found when each broke and why, fixed the app where the app was wrong, brought the tests up to date
where the test was wrong (saying why), and added a `release` group to `dev/run-checks.js` that runs the default app
list and every unit test.

How "when it broke" was found: each test was run on the trees of the commits that touched the code it tests
(`git archive <commit>` into a temp folder, the test run there), and the patch notes' rounds read off the commits.

| Test | Broke | Cause | Kind | Fix |
|---|---|---|---|---|
| `updatesafe-test` | round 78 (`0134df8`, winperf78) | the updater's one-call preflight took git's partial answer as "not a checkout" | **app bug** | `updatermain.js` |
| `perfectloop-test` | round 77 (`0614512`, labaudio77) | the loop helpers read the song's heard time (`songNow()`), the test's page never had it | stale test | the test's page gets `songNow` |
| `labpace-test` | never passed on this box (fails on round 33's own commit too) | a µs budget written for a box ≈ 1.5× faster | stale budget | the budget carried over by a measured factor, scaled by the box's speed now |
| `audio-test` | never passed on this box (the code is round 23's, unchanged) | the same box-speed gap (round 23 measured 3.0 s; the same code here 4.4–4.8 s) | slow code + wall-time budget | analysis ≈ 20 % faster (same bytes), the 4 s budget load-aware |
| `timemachine-test` | since it was written (round 21) | it used the real clock: in the last 17 minutes of a day the merge test thinned across midnight | **app bug** found + clock-dependent test | `three-history-core.js` holds keys a week; the test on a fixed clock |
| `synchard74-test` | not reproduced | — | — | already load-aware; passes 3/3 full runs at load ≈ 16 and 25/25 `diskfull` runs under load and around midnight |

## 1. updatesafe-test: "inside another project" (top priority: the updater)

**Failure**: `FAIL inside another project: never pulls that one (repo)`: Hearth's folder inside another git project
was told "not a checkout" (Connect…) instead of "inside another project".

**When**: round 78. `30a5c1e` passes (182/182), `0134df8` (winperf78: "preflight without a checkout asks git once")
fails. Every commit since fails the same way.

**Cause**: round 78 asks git the four preflight questions in one call
(`rev-parse --show-toplevel --show-prefix --absolute-git-dir --abbrev-ref HEAD`) and, when that call fails and there
is no `.git` in Hearth's folder, takes its failure as the answer to the first question too. That holds when git
printed nothing (not a git folder at all), but not when the outer project has no commit yet: git answers the top and
the prefix and fails only on `HEAD`. The answer was classified as "not a checkout", so Hearth offered Connect for a
folder that sits inside someone else's project instead of saying so (`repo-other`).

**Fix** (`updatermain.js` preflight): the shortcut is taken only when git printed nothing (`!all.out`); otherwise the
first question is asked on its own as before round 78. The round 78 saving (one git start on a non-checkout) stays.

**Round 104's updater changes, checked too.** Round 104 (emptyread104) changed the journal / pending notes, the theme
put-back and configsafe's state note, with no unit test for them. New tests (held = a folder in the note's place,
EISDIR, or `fs.readFileSync` throwing EBUSY for the owner's file) show those changes work:
- `updatesafe-test` (new block in 12): the journal held → status `held`, no fix offered; Finish and Go back change
  nothing and keep the owner's stash; Update refuses; the pending note held → `held`; both readable → fine.
- `configsafe-test` 10: the owner's `data/theme.css` held while a stash's theme clashes with an update's: not written,
  the stash kept (fails on round 103's tree).

…and found three more places of the same kind round 104 missed, now fixed (each fails on the base, passes now):
- **settle** (`updatermain.js`): it read the update journal with `readState` (unreadable = none), so a held journal
  (an update half done) let settle check the tracked config / theme out. Now: anything but "missing" stops it.
- **settle**: configsafe's `state.json` held read as "not handed back", so the older version's edits lost their one
  turn to win. Now: unreadable → nothing decided this start (`configsafe-core.stateStatus`, new).
- **a stash put back** (`updatesafe-core.intoData`): the same note held → the owner's files went into data as if not
  handed back. Now: the tracked files stay where the stash put them (`left`), the stash is kept, the next start decides.
- **bring back** (`updatermain.bringBack`): its note of stashes already handled (`ownback.json`) held read as "none
  handled", so every update stash was brought back again, over a file the owner had since put back the repo's way.
  Now: unreadable → nothing brought this start.

**Proof**: `updatesafe-test` 188/188 (was 181/182), `configsafe-test` all passed (its new block fails 5 ways on the
base), `emptyread104-test` 35/35, `datasafe-scan` pass (82 audited, 0 new).

## 2. perfectloop-test: `songNow is not defined`

**When**: round 77. `0614512~1` passes 18/18, `0614512` (labaudio77) fails 4 of them.

**Cause**: round 77 put the Lab's pictures on the song's clock as heard (`songNow()` in `tools/three-sandbox.html`);
the loop helpers (`loopSceneT`, `loopNowMs`) read it since. The test runs those helpers on a stand-in page built from
the sandbox's code and stubs what they call (`realNow`, `keyTime`…); `songNow` was never added. The app is right.

**Fix** (test): the stand-in page gets `songNow`, the element's time, which is exactly what the real `songNow()`
returns for a paused song (the test's song never plays; the audio clock itself is labaudio77-test's). 18/18.

## 3. labpace-test: "the signature of a 2000-object scene costs 1338 µs"

**When**: never passed on this box. Round 33's own commit (`17a3aaa`, page + test) fails here (500 objects: 360–428
µs, 2000: 1630–1913 µs), as does every later version (round 58 `c6fc05b`, round 60 `c3aa7e1`, round 74 `4dd32c0` /
`a4bf155`). playchurn81 already noted it failing on round 76's tree.

**Cause**: the budget `n × 0.6 + 20` µs is an absolute number for the box round 33 ran on, where its code measured 245
µs for 500 objects (docs/upgrades/labpace.md). The same code measures 360–428 µs here: this box (the one
`dev/perf-baseline.json` is recorded on, perfguard calibration ≈ 57 ms) is ≥ 1.47× slower. The code only got faster
since (0.62–0.70 µs an object now against round 33's 0.72–0.96). A CPU profile shows the time in reading the scene's
fields; batching the hash calls or reading the scratch buffer's bits directly changed nothing measurable, so there was
no slowness to fix. Holding the run lock (no app checks running) didn't change the numbers either: not load.

**Fix** (test): the budget is round 33's carried over by the measured 1.47 (0.88 µs an object + 29 µs, at a
calibration of 57 ms) and scaled by how much slower the box runs right now (`loadwait.calibMs` before and after the
timing, perfguard's benchmark, never below 1). Over that only while the box ran more than twice slower: "can't tell".
Today: 1310–1400 µs against 1793 µs; a regression back to round 33's cost at 2000 objects (1630–1913) is near or over
the line.

## 4. audio-test: "song: analysed in < 4 s"

**When**: never passed on this box. `tools/three-audio-core.js` and the test are unchanged since round 23
(`6605740`); round 23 measured the 108 s song in 3.0 s (docs/upgrades/labaudio.md). Here: 4.4–4.8 s.

**Profile**: CPU time ≈ wall time (4.4 s of 4.5 s): real work, not waiting. 45 % in the stream's frame (the FFT,
`Math.hypot` per bin, `log10`), 22 % in the extractor's frame, most of it one line: `10 ** (d / 20)` per bin (1,024
bins, 100 frames a second) turning dB back into magnitudes; 14 % the per-sample filters.

**Fix** (app, `tools/three-audio-core.js`): `Math.sqrt(a*a + b*b)` for `Math.hypot` (several times slower in V8),
`Math.exp(d × ln10 / 20)` for `10 ** (d / 20)`, the ring read in its two runs instead of a `%` per sample. The output is
the same byte for byte: three test songs (108 s, 40 s, 30 s) through `analyzeTrack` (594,880 + 220,000 + 165,000
feature bytes, the meta) and through the live path with spectrum and waveform (15,646 frames) are identical before and
after. The 108 s song: 4.7–4.9 s → 3.3–3.7 s CPU (≈ 20–25 %).

**Budget** (test): judged the way checks102 does: the wall time against `dev/loadwait.js` (`judge`: over by no more
than what the process waited for a CPU / the disk is the box's: "can't tell"), and the budget scaled by the box's
speed now (`calibMs` before and after, against the perf baseline's 57 ms, never below 1). On a quiet box the budget is
the same 4 s as round 23's; it is not loosened. The live check ("faster than real time ×20", 2 s) is judged the same
way.

## 5. timemachine-test: a merge that lost versions (only in the last 17 minutes of a day)

**When**: since the test was written (`351c698`, round 21): its clock was `Date.now()`. Round 104's full run happened
to cross midnight. Scanning the time of day (a preloaded fake clock): every start from 00:00 to 23:40 passes; from
≈ 23:43 to 24:00 it fails, either "merged versions (61)" or "no version lost its key: 15".

**Causes**:
- the test's: one computer thins its history at t0 + 1,000 s; near midnight that's tomorrow, so the minutes before
  are "this week" and thinned to one an hour. Fewer merged versions is then right, the `>= 100` was a clock accident.
- the app's (real): when thinning takes out every version on a key, `gc()` deletes the key. The other computer kept
  adding versions on that same key (its newest when the two last synced). The merge sees the key removed on one side
  and untouched on the other, so removes it; the other computer's new versions arrive without what they're rebuilt
  from, and `heal()` drops them. A scene edited on two computers around a thinning (midnight, or the 160-version cap)
  lost the other computer's versions of those minutes.

**Fix**:
- app (`tools/three-history-core.js`): a key whose last version thinning took out in the last week is held
  (`doc.held`: key → that version's time) and `gc()` keeps it; a week on, or once a version uses it again, it's let
  go. Older Hearths ignore the field; the merge carries it.
- test: a fixed clock (noon) for the old sections, and a new section 5b: thinning across midnight on one computer
  while the other adds 30 versions: all 30 come through the merge and rebuild (13–15 lost on the base), and a week
  later the held keys are let go. direction-test, scenesafe-test and storeack77-test (they use the core) pass.

## 6. synchard74-test: not reproduced

Round 104 saw `diskfull` fail once under load, then pass alone. Here: three whole runs with 6 busy processes on top
of the other sessions (load ≈ 16): 170/170, 168 + 2 "can't tell", 169 + 1 "can't tell"; 25 runs of `diskfull`,
`heldfile` and `readonly` with 8 busy processes: all passed; `diskfull` started at 23:50–23:59 (a fake clock): passed.
The scenario runs on the simulator's own clock and counts sync rounds, not time; its timing parts were already
load-aware ("can't tell"). Nothing changed; it stays in the release run, so a failure would be seen.

## The release run

`dev/run-checks.js` has a `release` group: the default app list (`qa`: qa-commands, qa-keys, qa-mac, polish, lazy,
fastboot) and every unit test (`unit`, 250): 256 checks. How to run it is in docs/windows-test-plan.md ("Before a
release") and in run-checks.js' header:

    HEARTH_THREE_DIR=/opt/cdn-cache/three@0.186.1/package flock /tmp/hearth-run.lock node dev/run-checks.js release

`dev/loadwait.js` gained `calibMs()` / `boxFactor()` (perfguard's calibration benchmark, sync, ≈ 0.3 s) for CPU-bound
timing tests: a busy box slows them without them ever waiting for a CPU (another process on the core's other
hyperthread), which `waited()` can't see.

Not in the unit list (so not in `release`): 53 `dev/*-test.js` files, mostly Codex's (quest-*, project-*,
workbench-*, codex-*, routine-*, vst-*…) and the creative-direction session's (direction-test, credits-test,
round67-test, finishline-test, moodqualities-test). They were never registered in `UNIT`; whether they belong in a
release run is theirs to say.

## Runs

Final, on this branch (box shared with other sessions; load average 0.4–2):
- Full unit list three times (`node dev/run-checks.js unit`, 250 tests each): **250/250, 250/250, 250/250** (24, 23,
  24 min), no "can't tell" line in any of them.
- Under the lock: `qa-commands qa-keys qa-mac polish lazy` ✓ 5/5; `fastboot unit:boot-test` ✓ 2/2: the whole
  `release` group's app part.
- Alone: updatesafe-test 188/188, configsafe-test all passed, emptyread104-test 35/35, datasafe-scan pass,
  perfectloop-test 18/18, labpace-test all passed, audio-test 29/29, timemachine-test all passed at every time of day
  scanned (00:00–23:58), direction-test, scenesafe-test 79/79, storeack77-test 187/187, synchard74-test 170/170
  (×3 at load ≈ 16).

## For Codex
No Codex-owned file was edited.

## For the patch notes
- **Updates**: when Hearth's folder sits inside another git project that has no saved version yet, the update button
  says so again, instead of offering to "connect" the wrong folder (since round 78).
- **Updates, more careful with busy files**: if a note Hearth keeps about updates is briefly locked by another
  program, Hearth now waits for the next start before tidying your settings or bringing back edits it kept for you,
  instead of guessing. Nothing of yours is overwritten.
- **Lab history on two computers**: if one computer tidied a scene's history (around midnight) while you kept working
  on the same scene on the other, the other computer's versions from those minutes could disappear from the history
  after syncing. They're kept now.
- **Songs analysed faster**: a song's features for the Lab are worked out about a fifth faster, with exactly the same
  results.
- **Behind the scenes**: every test Hearth has now runs before a release, and the speed tests know when the computer is
  just busy.
