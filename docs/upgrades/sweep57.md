# sweep57 (round 57): the whole check suite, run again

Since round 51 each release ran only the checks of what changed. This stream ran the whole suite
(`node dev/run-checks.js --names all`: 459 checks, the LIBS it skips left out) on the round 56 branch
(12138e4) to find what had quietly broken.

**What ran.** 343 of 459 checks ran in a first pass: all 153 unit tests, all 18 game checks and 172 of
the app checks. The first hour ran 4 lanes side by side on a machine shared with four other streams
(load 28–38 on 4 CPUs), which made most timing-based results meaningless. After that, every app run
went through the shared lock (`flock /tmp/hearth-run.lock`, ≤ 5 checks per hold). With the lock shared
between five streams, the rest would have taken about 4 more hours, so the coordinator
stopped the sweep there. Every first-pass failure was re-run alone under the lock (unit tests at low
load) before it was classified.

**Numbers.** First pass: 302 / 343 passed (41 failed). After the fixes and the re-runs alone: 337 / 343
pass. The 6 still failing: 3 owned by other streams (capture-lab, gamefps54, gamelook: listed, not
touched), 2 timing measurements that failed twice (gameready-relaunch, readyspeed: class c) and 1 open
(labtype240: a held title draws too often at one size, not explained yet). **Not run yet: 109 checks** (`docs/upgrades/sweep57-todo.txt`, one name per line, for
round 58: `flock /tmp/hearth-run.lock node dev/run-checks.js --exact $(sed -n 1,5p docs/upgrades/sweep57-todo.txt) --out <dir>` and so on, five at a time).

Classes: **a** the app did something wrong (fixed at the root) · **b** the check was stale after an
intended change (updated to the new behaviour, guarding the same thing) · **c** timing under load only
(passed when re-run alone, or a timing measurement; noted, nothing changed).

| Check | Failure | Class | Cause | Fix |
|---|---|---|---|---|
| gameaudio | the doctor's "a sound slowed the picture" named no file ("a sound (5 MB)") | a | ▶ Play's `hearth-game://` files leave no Resource Timing entry (a custom scheme), the only place the page looked for the name | `tools/gameaudio-page.js` notes the sound files the game fetches (name, Content-Length, when) and names a decode from them |
| idlecpu | the main process ran 24 timers/min in every idle state (budget 20) | a | configsafe (round 55) watches four settings files, each with its own 10 s background timer | `main.js`: one timer checks all four (6/min) |
| costcoach | "Let Smart decide" not saved in config.json; then the check ran out of time | a | configsafe fills what the owner's config lacks from the repo defaults: Smart is stored as *no* `effort`, so the default `effort: high` came back on the next read (Smart never stuck, also from AI setup) | `configsafe-core.js` `unsetMarks()` / `effective()`: every save lists the default keys the owner removed in `_unset` (default agents by id, default parts like settings / theme); they are never filled back and `_unset` never reaches the window; `main.js` runs every config save through it; 5 new lines in `dev/configsafe-test.js` |
| abcompare | after a director edit the chip said "Before: Code run", not "Before: Claude's edit" | a | the edit's code run reached ◧ Before / after as a plain run ~1 s before the director call answered; on a slower machine it settled first | `tools/three-history.js`: a change made while a director call runs on that scene is noted as the director's turn from the start |
| flows | the Doctor flow's "past step", guess and Validate steps; then a throw | a + b | Codex's engine watch changed /doctor's all-clear from "both engines can work" to "no installation problems found": the Doctor flow always pre-picked **No** ("which one has the problem?"). With the fake Codex, /doctor also waits out its model-catalog check (30–55 s) | `flows-data.js` matches both wordings, question reads "Does the card say no problems were found?"; the check waits up to 90 s per /doctor step (timeout 600 s); `dev/flows-test.js`'s fake /doctor uses the new words |
| labcalm | the toolbar wrapped to two rows with the director docked at 1280; toolbar 11 > 10, totals 47 > 46 / 49 > 48 | a + b | ▶ Play (round 53, the game mode's one entry point) made the icons-only row 517 px in 510 px | `tools/three-lab.css` (narrow Lab only): groups 4 px closer, icon buttons and ▶ Run less side padding, scene name max 150 px → one row again. Budgets count ▶ Play: toolbar 10 → 11, empty / layers 46 → 47, director 48 → 49 (the one-row rule unchanged) |
| labboot | "8 switches went black (darkest 0)" | b | labcanvas56: layer canvases keep no frame; the check's swap probe read them outside a frame | `window.__labCanvas.fresh(cv)` (one line in the sandbox's check API) and the probe reads through it, as the page's own readers do |
| labframes, labframes-more, motion | frame number read as 0 / "draws nothing" (0 lit pixels) | b | same as labboot | read the layer canvas through `__labCanvas.fresh` |
| unit:code-flow-test | "no functions found in lazy-meta.js" | b | lazy-meta.js (round 56) is a generated data file, one object literal | a file headed "Written by `node dev/…`" still has to parse; it isn't asked for functions |
| chatcore | "the strip shows while you type" (3 of 3 under load) | c | the strip's fade-in starts at the first style pass after the focus; with frames 280 ms apart that was the check's own read | the read waits for it (up to 2 s) instead of a fixed 200 ms |
| chatcalm | a stopped reply showed Copy and ⋯ at rest | c | their fade-out still running under load | passed alone; unchanged |
| bgperf, bigscreen, board-presets, appcalm, commands-page, commands-page-runs, connections, creative, eyes-pins, gallery, grade | various (zoom layer, step-down, transition, a note's ×, a row not drawn yet, a select value, no preview target, a 240 s timeout…) | c | load 28–38 | all passed when re-run alone |
| gameinput, gameready, gamestream, gametex, labcanvas56, playbudget, presentready, shadowready | WebGL context not created, A/B verdicts, thumbnails / recordings at 3.6 fps | c | 7+ software-GPU Electron processes at once | all passed when re-run alone |
| gameready-relaunch | second launch not faster (shader wait 4 → 5 ms, first frame 603 → 662 ms) | c | the first launch already reads ~0 ms of compiles (the pair's shared cache is warm before it), so "faster" is noise; failed twice | noted for round 58 (the test's baseline) |
| readyspeed | Lab warm ≤ 0.85 × cold + 300 ms (13.5 s vs 6.9 s; the second warm run 6.7 s) | c | one slow warm run; failed twice on different steps of timing | noted |
| labtype240 | "still fit: within its budget": a held title at the preview's fit size drew 4.3 then 6 frames/s (budget 2.5; at 1280×720: 2) | open | failed twice, the second time alone under the lock: not load. Not found yet what wakes a still scene at fit size (a probe poll, the Lab's thumbnail reads replaying the layer since labcanvas56, or the once-a-second refresh) | **not fixed: first item for round 58** |
| unit:audio-test, unit:recall-test, unit:labpace-test, unit:datasafe-test | "faster than real time", "answers fast", µs budgets; datasafe's EBUSY window (3.5 s) ran out before the token-stats read | c | load | all passed at low load |
| capture-lab | "the moving Lab sends frames" | — | owned by **capturelab** | listed only |
| gamefps54 | "off: round 53's ▶ Play measured", "best: frames as fast as off" | — | frame-time steps owned by **framepace57** | listed only |
| gamelook | "best: the look's own CPU work is small" | — | frame-time step owned by **framepace57** | listed only |

Edits outside this stream's lane (all small): `tools/gameaudio-page.js` (gameaudio), `main.js` (config
watch timer, save hook), `configsafe-core.js` (configsafe), `tools/three-history.js` (timemachine),
`flows-data.js` (flows), `tools/three-lab.css` (labcalm), `tools/three-sandbox.html` (one line in the
check API, labcanvas56).

Tested after the fixes: every check above re-run alone under the lock (abcompare, timemachine,
director-tools, directorpreview, costcoach, undoall, router, options, idlecpu, powerwise, bgperf,
flows, labboot, labframes, labframes-more, motion, labcanvas56, labcalm, labdirect, labeasy, menucalm,
a11y, gameaudio, lazy) and unit: boot-test, datasafe-scan, winmac-test, chatsafe-scan, code-flow-test,
configsafe-test, flows-test, gamehooks55-test, abcompare-test, timemachine-test, powerwise-test,
errorcalm-scan, commandonly-scan, datasafe-test, sync-test, updatesafe-test, labchats54-test,
chatkeep-test, undoall-test, router-test.

## For the patch notes
- **Let Smart decide sticks now.** Picking Smart for an AI (AI setup, or the cost coach's "Let Smart
  decide") went back to Deep the next time Hearth read its settings. Any setting you clear now stays
  cleared.
- **The Doctor's quick check guesses right again.** When the engine check finds nothing wrong, the
  Doctor steps now pre-pick "Yes" instead of asking which engine has a problem.
- **Before / after names the director's edit.** After the Three Director changes your scene, the chip
  says "Before: Claude's edit" (it sometimes said "Code run").
- **The Lab toolbar stays on one row** with the director docked on a 1280-wide window (it wrapped
  since ▶ Play was added).
- **"A sound slowed the picture" names the file.** The ▶ Play doctor now says which sound (for example
  music.wav) instead of "a sound".
- **A little less background work when idle**: Hearth checks its settings files with one timer
  instead of four.
