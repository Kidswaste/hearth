# trimdrive60 (round 60)

The check `trim-drive` was failing since round 52, plus two check-runner issues around Codex's checks.

## What was wrong
- **▶ Play offline logged a main-process error.** ▶ Play builds a Lab scene's page with three.js next to it. Hearth
  downloads three.js once (from the same CDN the Lab uses) and keeps it in `data/deploy/three@<version>/`, and it
  already reused that copy offline. With no copy yet and no network, the download error was *thrown* out of the
  `game:play` handler, so Electron logged "Error occurred in handler for 'game:play': … Couldn't get three.js …
  fetch failed" in the main process, and the owner got a long technical toast.
- **trim-drive ran ▶ Play and ▣ Present to the end.** The drive runs every command. Given the local three.js copy,
  `/game`, `/play-here` and `/playtest` opened Play windows and `/present` started ▣ Present, which on this
  machine's software GPU decides to bake (≈ 0.4 fps). They kept running behind the rest of the drive, which then
  ran past its 900 s limit.
- **quest-review-live always opted in.** Its header's `node dev/smoke.js --eval "window.QUEST_LIVE_REVIEW=true" …`
  line was passed by `dev/run-checks.js` like any other header flag, so the runner always opted in to a real Astra
  review on the owner's account (and failed here: no Codex).
- **workbench-sketch-ai had no header line**, so run-checks started it without `--fake-meshy`.

## Upgrades
1. ▶ Play offline, before three.js was ever downloaded, answers with one plain message: "Hearth needs three.js for
   this and downloads it once, but this computer seems to be offline… Try again when you're online: after that it
   works offline too." No main-process error (`game:play` returns it as an answer; `gamemode.js` shows it).
2. The kept three.js copy (`data/deploy/three@<version>/`) is written whole (temp file + rename): a download cut
   short is never reused offline as a broken file.
3. A real download error (the CDN answering with an error) says so plainly and suggests trying again in a moment.
4. trim-drive: every command that opens ▶ Play or ▣ Present is now checked to **open and answer** (Play: the game
   window's state and an eval; Present: its state), then closed before the next command. The check now also fails
   if no command reached ▶ Play or ▣ Present, or one didn't answer or close (a stronger guard than before). It gets
   the local three.js copy through `HEARTH_THREE_DIR`, as the game checks do. 528 s now (limit 900 s).
5. dev/run-checks.js: opt-in checks. A check whose header has `// opt-in: NAME` runs only when `NAME` is set in the
   environment (`QUEST_LIVE_REVIEW=1 sh dev/run-checks.sh quest-review-live`); otherwise its line reads
   "skipped (opt-in: set NAME=1 to run it)" and the total says "(N opt-in skipped)".

## For Codex (their checks; no app files of theirs changed)
- `dev/checks/quest-review-live.js`: one header line added, `// opt-in: QUEST_LIVE_REVIEW` (the runner now skips it
  unless that's set; the `--eval` line stays and is used when it is).
- `dev/checks/workbench-sketch-ai.js`: one header line added,
  `//   node dev/smoke.js --fake-meshy --script dev/checks/workbench-sketch-ai.js` (passes now: 14 s).

## Present offline
▣ Present needs no download of its own: it presents the Lab's preview that is already running (three.js already
loaded there), so it was not part of the problem.

## Tests
- trim-drive ×2 (with the local three.js copy): passed 528 s and 521 s (1,203 commands; ▶ Play reached by /game,
  /play-here, /playtest; ▣ Present by /present twice; each answered and closed; no page or main-process errors).
- A scratch drive with **no** three.js copy and no network: ▶ Play and `/game` answer with the plain message, no
  main-process error, nothing left playing.
- A Node run of `deploymain` offline: the calm "offline" error first; then with a kept copy in `data/deploy`, the
  page is built from it with nothing missing.
- quest-review-live: skipped (opt-in). workbench-sketch-ai 14 s, gamemode 23 s, presentready 166 s, lazy 18 s,
  unit:boot-test: all pass. `node --check` on every touched JS file.

## Risks
- Only ▶ Play's handler turns the calm error into an answer; ⇪ Publish (deploy:build) offline still throws its (now
  plainer) error through its handler, as before.

## For the patch notes
- **▶ Play without internet says so plainly.** The first time a Lab scene plays, Hearth downloads three.js once and
  keeps it. If that first time happens offline, Play now shows one clear message ("try again when you're online:
  after that it works offline too") instead of a technical error.
- **The downloaded three.js copy can't be left broken.** It's saved whole or not at all, so an interrupted download
  never breaks ▶ Play later when you're offline.
- Behind the scenes: the big "press every button" check passes again, and now also makes sure ▶ Play and ▣ Present
  open, answer and close properly. Checks that would spend your real accounts only run when asked.
