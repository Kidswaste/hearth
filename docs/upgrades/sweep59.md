# sweep59 (round 59): the check sweep, finished

Round 58's sweep left 61 app checks unrun (`docs/upgrades/sweep58-todo.txt`). Since then 6 app checks were added
(`ctxloss`, `quest-focus`, `quest-map-tiles`, `quest-shelf-native`, `workbench-sketch-ai`, `workbench-visual`) and
3 unit tests (`quest-focus-test`, `vst-live-test`, `workbench-story-test`); 5 unit tests changed (`engine-watch-test`,
`creative-test`, `creative-export-test`, `vst-host-test`, `labpace-test`). This stream ran all of them on round 58's
branch (d818e36), app checks five at a time under the shared lock (`flock /tmp/hearth-run.lock`).

**What ran.** All 67 app checks and the 8 new or changed unit tests: with round 57's and 58's sweeps, every check in
`node dev/run-checks.js --names all` has now run at least once since round 56. One open item is left for next
round in `docs/upgrades/sweep59-todo.txt` (trim-drive).

**Numbers.** First pass: 61 / 67 app checks passed (6 failed: sequence-songpcm, tidy, trim-drive, whatsnew,
quest-review-live, workbench-sketch-ai). Every failure was run again alone. After the fixes: 64 / 67 pass; the 3
still failing are 2 Codex checks (listed below, not touched) and trim-drive (open, see the table).
Unit tests: 6 / 8 pass; the 2 that fail are not standalone tests (see the Codex list).
Required checks after the fixes: lazy, unit:boot-test, unit:datasafe-scan, unit:winmac-test (passes again since
codexcare58) and unit:chatsafe-scan pass.

Classes: **a** the app did something wrong (fixed at the root) · **b** the check was out of date after an
intended change (updated to the new behaviour and still guards the same thing) · **c** timing under load only.

| Check | Failure | Class | Cause | Fix |
|---|---|---|---|---|
| sequence-songpcm | the preview's exact frames all black (`[0,0,0]`, the tone at 3.5 s should be bright); once the export's frame in the silence was bright | a | two causes in the Lab page's exact frames (▤ Sequence frames, renders, exports). 1. Going offline left the layers' frame callbacks that were already waiting for a screen frame where they were (a dozing preview holds them up to 500 ms): an exact frame asked at once drew none of them and read the canvas's last screen frame. 2. `audio.*` skips reads less than 8 ms apart, so a frame asked right after the previous one drew with that frame's sound | `tools/three-sandbox.html`: `sqAdopt()` moves those waiting callbacks (layer queue, doze queue, parked queue) to the exact frames' queue when the page goes offline; each exact frame reads the sound anew (`lastUpdate = 0`); a frame past the song's ends hears silence instead of the last frame's sound. Failed 4 of 8 runs before, passed 5 of 5 after (4 in a row, then in the re-run batch) |
| tidy | "the rail ⋯ uses the icon set": the "Not in the rail" rows had no drawn icon | a | the Creative Playground starts off the rail (round 53), so the rail's ⋯ always lists it; it, Commands and "Put tools back in the rail…" had no icon from the set | `icons.js`: `commands` → command, `creative` → sparkle; `simplify.js`: the "Put tools back…" row gets the gear. Passes |
| whatsnew | "plain lines (no Markdown, no /commands)" | a | round 57's notes say "when /doctor finds nothing wrong": the digest removed only commands in backticks or brackets, so ✦ Since you were away showed "/doctor" | `whatsnew-core.js` `plain()`: a bare /command in a sentence reads as its plain word. Round 58's "`/material` on a layer…" note (it became a sentence with no subject) reworded in `docs/patch-notes/round-58.md`. Passes; unit:whatsnew-test passes |
| trim-drive | main-process error "Couldn't get three.js 0.186.1 … fetch failed" (from `game:play`) | open (test setup) | the drive runs every command, ▶ Play's too (since round 52); ▶ Play builds the scene's page with three.js, downloaded once, and this test machine has no network (the game checks get a local copy through `HEARTH_THREE_DIR`). Given that copy too, the drive then opens Play windows and a ▣ Present bake ("Baking a perfect show…" at 0.38 fps) and ran past its 900 s limit twice | **not fixed**: the runner change was tried and taken back (two time-outs instead of one error). In `docs/upgrades/sweep59-todo.txt`. The app answered the offline ▶ Play with its plain "try again when online" message |
| quest-review-live | "Couldn't find Codex on this PC" | — (Codex) | the check is opt-in (one real Astra review on the owner's account), but its header's `--eval "window.QUEST_LIVE_REVIEW=true"` is passed by `run-checks.js`, so the runner always opts in | **listed for the owner** (Codex's file): the header line should not carry the opt-in flag, or run-checks should leave it out |
| workbench-sketch-ai | "isolated fake provider configured" | — (Codex) | needs `dev/smoke.js --fake-meshy`, but its header has no `node dev/smoke.js … --fake-meshy` line, so run-checks starts it without the fake Meshy | **listed for the owner** (Codex's file): add `//   node dev/smoke.js --fake-meshy --script dev/checks/workbench-sketch-ai.js` to its header |
| unit:vst-live-test | "Set HEARTH_VST_PYTHON to the scoped test runtime" | — (Codex) | opt-in real-hardware test (Serum 2 / Vital on a Windows audio device) | not a test for this machine; listed |
| unit:creative-export-test | "Pass the smoke --save-dir" | — (Codex) | a helper the `creative` check calls with its save folder, not a standalone test (`creative` passes) | listed |

Also seen: seqsolid failed 2 of 3 runs right after `sqAdopt` landed (two different steps), on a busy machine. Settled
after: 4 runs on this branch and 4 runs of a throwaway copy without the `sqAdopt()` call, alternating under the lock:
4 / 4 and 4 / 4. `sqAdopt` doesn't raise its failure rate; the earlier failures were load (class c). Then
sequence-songpcm, sequence, sequence-smooth and labexport ran once more: 4 / 4.
For trim-drive, next round picks one: skip the commands that open ▶ Play / Present in
the drive (as it skips new-window), or give it the local three.js copy and a longer `--check-timeout`.

Edits outside this stream's lane (small): `tools/three-sandbox.html` (sequence: `sqAdopt`, 3 lines in `sqFrame`),
`icons.js` (2 ids), `simplify.js` (one icon), `whatsnew-core.js` (one replace), `docs/patch-notes/round-58.md` (one
line).

Tested after the fixes: sequence-songpcm (6×), sequence-render, sequence (2×), sequence-smooth (2×), labexport (2×),
seqsolid (7×, see above), tidy, whatsnew, trim-drive, lazy, unit: boot-test, datasafe-scan, winmac-test, chatsafe-scan,
whatsnew-test; `node --check` on every touched JS file and on the sandbox's page script.

## For the patch notes
- **Lab renders and exports match the music from the first frame.** An exact frame (a ▤ Sequence frame, a render, an
  export) asked right after another one could show the previous frame's picture or sound: a scene that lights up
  with the song could come out dark on its first frame, or bright in a silence. Each frame now draws the scene at
  its own time with its own sound, and after the song ends it hears silence.
- **The rail's ⋯ menu looks like the rest of it.** Creative Playground, Commands and "Put tools back in the rail…"
  now have their own drawn icons there.
- **✦ Since you were away shows no commands.** A note that mentioned "/doctor" now just says "doctor".
- Behind the scenes: the last checks left from the big sweep ran. Every check has now run at least once since
  round 56.
