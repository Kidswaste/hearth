# tests106 (round 106): the 53 tests nobody ran

Round 105 (units105) added a `release` group to `dev/run-checks.js` (qa + every unit test) and found 53
`dev/*-test.js` files in no list, so no release ever ran them. This stream ran each one under the shared lock
(`HEARTH_THREE_DIR=… flock /tmp/hearth-run.lock node dev/run-checks.js --exact unit:<name>`), twice, each with its
own `TMPDIR` so anything left in the temp folder could be seen, sorted them by owner, and put every one of them
somewhere in `run-checks.js` with a reason.

**Ownership** comes from the commit that added each file (author "Codex" = Codex's), its header and
`docs/upgrades/` (`round67-plan.md`: streams 1–5 of round 67 are the creative-direction session's). 46 are Codex's,
5 the creative-direction session's, 2 ours.

**Result**: 47 pass as they are; 3 fail (all Codex's files, the app is right in each); 1 needs real plugins; 2 aren't
plain Node tests (both pass when run the way they're meant to be). No Codex or creative-direction file was edited.

## What changed in `dev/run-checks.js` (lists only, plus what reads them)

- **`UNIT`**: + 51 names (every file below except the two "not a Node test"). The unit list is 302, `release` 308.
- **`KNOWN_FAIL`** (new): name → owner, cause, and a `match` regex. A known failure still runs in every release and
  shows on its own line (`!` … `known failure (Codex's…): <cause>`), but doesn't fail the run **only while it fails
  that way**: a different failure is a ✖ as usual, and a pass says "take it off KNOWN_FAIL". The summary counts them
  ("300/303 passed (3 known failures, KNOWN_FAIL)").
- **`UNIT_OPT_IN`** (new): a unit test that needs a real machine, for files whose header we can't edit (the header's
  `// opt-in: NAME` works as before). Its line says `skipped (opt-in: set HEARTH_VST_PYTHON to …)`.
- **`NOT_UNIT`** (new): a `dev/*-test.js` that isn't a plain Node test, with how it runs. A run of the whole unit
  list prints a `- … not run here: <how>` line for each.
- **New guard**: a run of the whole unit list (so `release`) fails with `✖ unit:unlisted` when a `dev/*-test.js` is
  in neither `UNIT` nor `NOT_UNIT`. A new test can't drop out of the release silently again.

`tmpclean106` is changing how each check gets a temp root; these edits stay out of the spawn code.

## All 53

Result = both runs (r1, r2) under the lock. "Left in tmp" = what one run leaves in the temp folder.

| File | Owner | Result | Cause | Action | Left in tmp |
|---|---|---|---|---|---|
| adaptive-feedback-test | Codex | pass | — | UNIT | — |
| codex-capabilities-test | Codex | pass | — | UNIT | `hearth-capabilities-*` 12 KB |
| codex-server-test | Codex | pass (9 s) | — | UNIT | `hearth-server-*` 680 KB |
| codex-usage-test | Codex | pass | — | UNIT | `hearth-usage-test-*` 12 KB |
| codex-workspace-test | Codex | pass | — | UNIT | `hearth-workspace-test-*` 12 KB |
| creative-export-test | Codex | not a Node test | a helper that reads the files the `creative` app check saved ("Pass the smoke --save-dir"); run as `node dev/smoke.js --save-dir <d> --script dev/checks/creative.js` then `node dev/creative-export-test.js <d>`: **passes** | NOT_UNIT | — |
| creative-test | Codex | pass | — | UNIT | — |
| credits-test | creative-direction | pass | — | UNIT | — |
| direction-test | creative-direction | pass | — | UNIT | — |
| engine-health-watch-test | Codex | pass | — | UNIT | — |
| engine-watch-test | Codex | pass | — | UNIT | — |
| finishline-test | creative-direction | pass | — | UNIT | — |
| gpu-canvas-test | Codex | pass | — | UNIT | `hearth-canvas-*` 12 KB |
| lazy-groups-test | ours (round 54, fixes54) | pass | — | UNIT | — |
| map-network-test | Codex | not a Node test | an Electron script (`require('electron')`); `xvfb-run -a /opt/hearth-electron/electron --no-sandbox dev/map-network-test.js`: **passes** (localhost only) | NOT_UNIT | its Electron profile `hearth-map-network-*` |
| map-session-test | Codex | pass | — | UNIT | — |
| moodqualities-test | creative-direction | pass | — | UNIT | — |
| offline-library-test | Codex | pass | — | UNIT | — |
| outing-guide-test | Codex | pass | — | UNIT | 3 folders `hearth-outing-*` 40 KB |
| playback-volume-test | Codex | **fails** | `MIDIMAP_ACTIONS is not defined`: stale test (below) | KNOWN_FAIL | `hearth-volume-unit-*` 8 KB |
| project-continuity-test | Codex | pass | — | UNIT | — |
| project-desk-test | Codex | pass | — | UNIT | — |
| project-index-test | Codex | pass (7 s) | — | UNIT | **`hearth-project-index-*` 53 MB** |
| project-workspace-test | Codex | pass | — | UNIT | — |
| quest-atlas-fit-test | Codex | pass | — | UNIT | — |
| quest-chat-service-test | Codex | **fails** (90 s) | "The quest planner took too long": stale test (below) | KNOWN_FAIL | — |
| quest-chat-test | Codex | pass | — | UNIT | — |
| quest-deck-test | Codex | pass | — | UNIT | — |
| quest-field-test | Codex | pass | — | UNIT | — |
| quest-focus-test | Codex | pass | — | UNIT | — |
| quest-life-test | Codex | pass | — | UNIT | — |
| quest-project-catalog-test | Codex | pass | — | UNIT | — |
| quest-proof-test | Codex | pass | — | UNIT | — |
| quest-review-test | Codex | pass | — | UNIT | `hearth-quest-engine-*` 352 KB |
| quest-workstation-test | Codex | pass | — | UNIT | — |
| quest-world-test | Codex | pass | — | UNIT | — |
| questguide-flp-test | Codex | **fails** | "save verifies tempo without a MIDI device": broken by Codex PR #34 (below) | KNOWN_FAIL | `hearth-flp-*` 28 KB |
| questguide-picker-ui-test | Codex | pass | — | UNIT | — |
| questguide-project-test | Codex | pass | — | UNIT | `hearth-project-guide-*` 32 KB |
| questguide-test | Codex | pass (5 s) | — | UNIT | `hearth-guide-*` 48 KB |
| round67-test | creative-direction | pass | — | UNIT | `hearth-r67-*` 76 KB |
| routine-accounting-test | Codex | pass | — | UNIT | — |
| routine-allowance-test | Codex | pass | — | UNIT | — |
| routine-controls-test | Codex | pass | — | UNIT | — |
| scene-recording-test | Codex | pass | — | UNIT | — |
| showsync-syndicated-test | Codex | pass | — | UNIT | — |
| showsync-venues-test | Codex | pass | — | UNIT | — |
| swarmlean-test | ours (round 33, swarmlean) | pass | — | UNIT; **fixed its leak** | was `swarmlean-test-*` + the shared `hearth-fake-engines`; now nothing |
| visual-feedback-test | Codex | pass | — | UNIT | — |
| vst-host-test | Codex | pass | — | UNIT | — |
| vst-live-test | Codex | needs a real machine | "Set HEARTH_VST_PYTHON": real Serum 2 / Vital on a Windows audio device (its header says opt-in, not in the `// opt-in:` form) | UNIT + UNIT_OPT_IN (`HEARTH_VST_PYTHON`) | — |
| workbench-story-test | Codex | pass | — | UNIT | — |
| workbench-test | Codex | pass | — | UNIT | — |

None of them uses the network: the URLs in them are fixtures or local servers (map-network-test serves its tiles
from localhost; showsync-* parse saved pages). None touches the data folder: every one that writes uses a
`mkdtemp` folder.

### The three failures

How "when it broke" was found: the test run on the tree of every commit that touched it or the code it tests, from the
commit that added it (`git archive <commit>` into a scratch folder).

1. **playback-volume-test** (Codex's test, Codex's `creative-vstmain.js`). Passes up to `219ddde`, fails from
   `0099bb6` (round 69, midilearn69, "Map my controller"). The test cuts `pool()`'s source out of
   `creative-vstmain.js` and runs it in a `vm` with a fixed set of globals (`STREAMED`, `EMBED_ACTIONS`…). Round 69
   added `MIDIMAP_ACTIONS` to the actions `pool()` routes; the test's context doesn't have it. The app is right
   (midilearn69-test covers the mapping). Fix (theirs): add `MIDIMAP_ACTIONS: []` (or the real list) to the vm context.
2. **quest-chat-service-test** (Codex's test and `tools/quest-chat.js`). Passes on `e3bc65a`, fails from `fa7e057`
   (round 67, sweep67: "a failed read is never empty"). Since then quest-chat reads its cache with
   `hub.kvGet(key, null, { status: true })` and uses / writes the cache only when the state is `ok` or `missing`
   (main.js `kv:get` with `o.status` returns `{ state, value }`). The test's `kvGet` stub returns the bare value, so
   the read looks unreadable: nothing is cached, the "identical context is free" call sends a second request nobody
   answers, and it waits out the planner's 90 s. The app is right (safety rule). Fix (theirs): the stub returns
   `{ state: v === undefined ? 'missing' : 'ok', value: v }` when `o.status` is set.
3. **questguide-flp-test** (Codex's test and `questguidemain.js`). Passes on `f5dd995`, fails from `a142105`
   (Codex PR #34, codex/clinky-quest-integration, merged 19 Oct, between rounds 65 and 66). That commit made `poll()`
   return early unless the current step's `app` is `'fl'` or the guide's `kind` is `'music'` ("project guides have
   event-driven checks"). The test starts a custom guide whose steps are `{ check: 'bpm' }` / `{ check: 'bass' }` with
   no `app`, so a saved .flp is never read. Started with `kind: 'music'`, the same test passes (tried on a scratch
   copy). Whether a custom guide with bpm / bass steps can happen in the app (then the guard is a bug: let `bpm` /
   `bass` checks through) or not (then the test should say `kind: 'music'`) is Codex's call.

### Temp folders

Measured with a `TMPDIR` per test (never by looking at the shared `/tmp`, which nothing here swept). 13 Codex tests
and round67-test leave their `mkdtemp` folder behind; together ≈ 54 MB a release run, 53 MB of it
`project-index-test`. Ours (swarmlean-test) is fixed. Two more things seen, for tmpclean106:
- `dev/fake-common.js` keeps fake engine state in a fixed `<tmp>/hearth-fake-engines` unless `FAKE_STATE` is set.
- `dev/smoke.js` didn't bring the app window up when `TMPDIR` was a long path (≈ 110 characters, the session
  scratch folder): "The app window never came up". The same run with the normal temp folder passed. Probably a
  socket path over the 108-byte limit; worth knowing before giving each check a deeper temp root.

## Runs

- r1 and r2: all 53, one by one under the lock: the same 47 pass both times, the same 3 fail the same way, vst-live
  needs `HEARTH_VST_PYTHON`, the two non-Node tests fail as plain Node (and pass run their way, once each).
- `release` after the change: see the end of this file.

## For Codex

No Codex file was edited. Your 46 tests now run in every release; 43 pass.
- **playback-volume-test** fails since round 69 (`0099bb6`): the vm context needs `MIDIMAP_ACTIONS`. Listed in
  `KNOWN_FAIL`.
- **quest-chat-service-test** fails since round 67 (`fa7e057`): the `kvGet` stub should answer `{ status: true }`
  reads with `{ state, value }`. Listed in `KNOWN_FAIL`.
- **questguide-flp-test** fails since your PR #34 (`a142105`): `poll()` skips a custom guide with bpm / bass steps;
  either the guard or the test's `kind`. Listed in `KNOWN_FAIL`.
- When one of these is fixed, take it off `KNOWN_FAIL` in `dev/run-checks.js` (a pass prints a reminder).
- **vst-live-test**: opt-in through `UNIT_OPT_IN` (`HEARTH_VST_PYTHON`). A `// opt-in: HEARTH_VST_PYTHON` first-line
  header would do the same from the file itself.
- **creative-export-test**, **map-network-test**: in `NOT_UNIT` with how they run. If you'd like them in `release`,
  creative-export-test could run the creative check itself, and map-network-test needs the runner to start Electron.
- **Temp folders left behind** by 13 tests (table above), 53 MB each run from **project-index-test**. An
  `fs.rmSync(dir, { recursive: true, force: true })` at the end of each would do.

## For the creative-direction session

None of your files was edited. All five of your tests (credits-test, direction-test, finishline-test,
moodqualities-test, round67-test) pass and now run in every release. round67-test leaves its `hearth-r67-*` folder
(76 KB) in the temp folder each run.

## For the patch notes

- **Behind the scenes**: about fifty more of Hearth's tests now run before every release, including the ones for
  quests, projects, the Sound desk and the Lab's direction tools. Three of them need updating by the people who wrote
  them and are listed until then: two are out of date with the app, the third may point at a small quest-helper
  issue (a custom guide's FL Studio tempo step not noticing a save), passed on to be looked at.
