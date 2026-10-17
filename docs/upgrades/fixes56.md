# fixes56 (round 56): game checks side by side, steadier checks under load, settings and chats kept safe, the budget on Lab scenes

## Shipped

### Game checks can run at the same time (dev tooling)
1. **Every smoke run has its own scratch folder** (`window.SMOKE_TMP`, a fresh `hearth-smoke-tmp-*` removed after;
   `--tmp <dir>` keeps one) and its own Chromium profile. gameready, gameready-relaunch, gamestream, gameaudio,
   gamefps54, playbudget, gametex, presentready, labplay55 and gamelook write their throwaway games there instead of
   fixed `/tmp/hearth-<name>` folders; gameready no longer uses the shared `/tmp/hearth-gameready-profile` (its
   `--profile-fresh` wiped a run that was still going). gamelook's game no longer goes into the shared ▶ Play fixture
   (`/tmp/hearth-gamemode/html`, now read only).
2. **The one cross-run test keeps its cache**: `dev/run-checks.js` gives gameready and gameready-relaunch one throwaway
   `--profile` / `--tmp` pair when both run (the shader disk cache of the first launch), removed after the relaunch.
   By hand: pass the same `--profile <dir> --tmp <dir>` to both smoke runs.
3. **A free debugging port** asked of the system (a random one could be another run's), and a run only takes the
   window of its own app copy: two runs can't read each other's page.
4. **A missing fixture is made once** when two runs start together (the other waits on a `.making` lock folder; one
   left by a run that died is taken after 15 minutes).

### Checks that failed only under load
5. **gamelook's "frame time not worse than off"** now compares the look on and stepped aside **in the same play**, in
   6 interleaved pairs of blocks (on/off, then off/on), skipping the frames right after each switch (the shadow maps
   made again). Stepped aside is playbudget's own switch (the look's hooks pass straight through, its shadow maps back
   at the game's own size: the picture "off" draws). Judged on: the game's `render()` CPU time (the look's hooks run
   inside it) on − off within 15 % / 0.5 ms, always; the mean frame gap on − off within 15 % / 2 ms unless the game is
   load-bound here (off under 25 fps: on this machine frame gaps are whole refreshes, 83 / 100 / 117 ms, and a first
   version using medians of gaps failed on a 16.7 ms jump); and the two separate plays (minutes apart; under a load of
   13 they read 100 vs 83 ms) still within 1.5× + 2 ms, so a look that slows the game even when stepped aside fails.
   Numbers (3 runs, load 10–12): render CPU on − off 0.01 / 0.01 / 0 ms (of ≈ 0.32), mean gap 4.8 / −0.3 / 6.3 ms
   (of 107 / 127 / 81).
6. **gamelook's "the look's own CPU work is small"** averages the looks after the first, whole-scene one (which keeps
   its own 5 ms bound), as its name says: under load that one read 3.9 ms and alone made a 4-look average 1.0 ms (the
   other three: 0.04 ms).
7. **gamelook's Lab-scene step** accepts the guard lowering the Best shadows back to the game's size when it measured
   frames missing the refresh (as its best step already did); the look still has to see the renderer, fix the colour,
   sharpen the texture and set the shadow (to > 512).
8. **gameready's "0 uploads"** (once read 2: the Best look's shadow guard, fixed at c09e048): see Tests for the 3 runs.

### Settings (configsafe)
9. **A default agent removed on the other computer stays removed.** Sync's config merge (`sync-merge.js`
   `applyPortable`) dropped this computer's `defaultsSeen` whenever the other computer's settings had none (a computer
   still on a version from before the move), so the default came back once. `defaultsSeen` now only grows: both
   computers' together.
10. **A stash that applies cleanly after the move goes into the data folder at once** (`updatesafe-core.js`
   `restoreSteps` → `intoData`): config.json / theme.css put back in the tracked files by the stash are kept byte for
   byte in `data/.configsafe`, config.json merged into `data/config.json` (bringConfig, the data copy's values
   winning), theme.css into `data/theme.css` only while that is still the repo's own (as the clash path does), then
   the tracked files go back to the repo's own and the stash is dropped. They used to stay in the tracked files until
   the next start. A data copy that can't be read decides nothing (the tracked file and the stash wait); after ↶ Go back
   to a version before the move (`handedBack`), the next start's settle still lets that version's edits win.
   A theme.css that came back beside a clash on config.json goes the same way.
11. **The "no file reads the tracked config.json / theme.css" scan is wider** (`dev/configsafe-test.js` §6): any path
    built from the app folder (join / resolve, template strings), require / import, fetch, `<link href>` / `src` in
    every .js / .mjs / .cjs / .html Hearth ships (540 files, round 55's chatsafe / playbudget files included); only
    `configsafe-core.js` names them. It found nothing new; it checks it still catches each kind.

### Chats keep their AI (chatsafe)
12. **`dev/chatsafe-scan.js`** (`unit:chatsafe-scan`, in the `chatsafe55` group): fails on any `x.agentId = …`
    (also `||=` / `??=`) and any copy `{ ...x, agentId: … }` / `Object.assign(x, { agentId })` that keeps the old id,
    across the renderer, the main side, the MCP servers and tools/, unless listed with the reason it isn't a chat being
    moved (a make's part, the AI setup sheet, voice state, a Meshy job, a routine, a file-access row, Quick start's
    picture). Chat creation, imports and the "Continue with…" / handoff copies make a new id and pass by themselves;
    "Bring back" writes no chat at all.
13. **Found and fixed**: a chat that names no AI took the id of whichever AI's view opened it (`native.js` render). Now
    only Claude's view (where the chats list shows such a chat) writes Claude's id down; opened under another AI it
    isn't taken there and opens in Claude's view instead (with no Claude set up at all: as before).

### ▶ Play's budget on a Lab scene (playbudget)
14. **The A/B under Getting ready's card works on Lab scenes.** On a Lab scene's ▶ Play page the merged layers'
    `render()` is only noted for the frame's composite (three-sandbox.html, round 52), so the A/B's back-to-back frames
    drew nothing and ran no game code: on ≈ off ≈ 0.15 ms, a helper costing 6 ms a frame was never caught before play
    (only later by the watch). The sandbox now exposes `__gmDrawNow()` (the composite, drawn now) and the A/B calls it
    after each frame: on the test scene, on 11.9 vs off 8.2 ms → the look off before the first frame, then on ≈ off.
    (Before the merge with shadowready, round 55's picture measurement toggled the shadow maps back and forth through
    real composites and left compiles / uploads in gameready's first 5 s of play in 3 runs of 5, so it was skipped on
    Lab pages. shadowready replaced it with a size choice that makes only the chosen + fallback maps under the card
    and seals them; that choice now runs on Lab pages through the same `__gmDrawNow()`, and gameready kept 0 compiles /
    uploads in its first 5 s in both runs after the merge. `__gmDrawNow()` draws with `gmComposite(false)`: the A/B's
    frames don't count as shown frames.)
15. **`dev/checks/playbudget.js` gains a Lab section**: the two test games as Lab scenes (one layer each): the A/B
    switches the look off before the first frame and Getting ready reports it, the watch switches it off while the
    other plays (said in plain words), both remembered by the scene's id, the next ▶ Play starts without it.

## Tests
- `node --check` on every touched file (check scripts as async bodies).
- unit: boot-test, datasafe-scan, winmac-test, configsafe-test (now 9 sections; the new §9: a clean stash after the
  move, and an unreadable data copy), labchats54-test, updater-test, updatesafe-test, chatkeep-test, chatsafe-scan,
  sync-test (3 new defaultsSeen steps), playbudget-test, errorcalm-scan, twocomputers-test: all pass.
- **Side by side**: two gamelook runs at once (separate scratch folders, profiles and ports): both ran every step to
  the end with no shared file (one step failed in both on the old median-of-gaps verdict, which led to item 5); two
  gameready runs at once also ran to the end in their own folders, next to other streams' locked runs of the old
  version on /tmp/hearth-gameready. At a load of 11–13 gameready's timing steps then miss (a play's first 5 s, the
  launch's wait): a load miss, not a clash (base c09e048 passes only alone too).
- gamelook ×3 (final verdict, load 10–12): pass, pass, pass.
- gameready ×3 under `flock /tmp/hearth-gameready.lock` (load 4–13): pass, pass, pass; "html: the game plays on the
  copy: 0 uploads" passed in every run of this round (14 of 14 runs, alone or side by side, including base and test variants). gameready-relaunch (paired by
  run-checks): pass. playbudget (with its Lab section, 24 steps): pass ×2.
- chatsafe55, chatkeep, updater, lazy: pass.
- After merging shadowready / playlatency / labcanvas56: gameready ×2, shadowready, playbudget, gamelook, playlatency,
  gamefps54 (gameready-based under the lock), labcanvas56, labplay55, lazy, and unit boot-test, chatsafe-scan,
  configsafe-test, sync-test, shadowready-test, playlatency-test, playbudget-test: all pass.

## For the patch notes
- **Settings you removed stay removed on both computers.** A built-in AI you removed on one computer could come back
  once on the other after it synced; it no longer does.
- **Updates tidy up right away.** When an update puts back something you had changed in Hearth's own settings files,
  it now goes straight into your settings folder instead of waiting for the next start.
- **Chats never change AI by accident.** An old chat that names no AI stays under Claude, wherever it is opened from,
  and a new safety check makes sure nothing in Hearth can move a chat to another AI.
- **▶ Play checks your Lab scenes before the first frame too.** While "Getting ready" shows, Hearth's quick
  with/without comparison now also works for Lab scenes, so a helper that would slow your scene is switched off before
  you start playing, not a few seconds in.
- Behind the scenes: Hearth's own game tests can now run side by side, and two of them are steadier on a busy machine.
