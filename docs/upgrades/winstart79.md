# winstart79 — engine discovery and the first ▶ Play, off the main thread (round 79)

Three leftovers from winperf78: the engine check looked in ≈ 250 places with synchronous file calls on Windows at
every check, the first ▶ Play of a start did its disk work on the main thread, and `engine-health-watch-test` failed.

## What shipped
1. **Engine discovery is kept and asynchronous** (`installs.js` `find()`, used by `engines.js` `checkEngine`). The copies
   found last time are kept in `data/engine-installs.json` (`found`, this computer only: keyed by the computer, PATH and
   the install folders' variables; `engine-installs.json` is already a local file for sync). Each check (start, every
   30 min, focus) first checks the kept copies (do they still exist?) and the date of every folder the last scan looked
   into (a new install — npm, the installer, a desktop app's new version folder — adds a file there, which changes the
   folder's date): about 40 `fs.promises.stat` calls on the owner's PC, none on the main thread.
2. **Looks again only when needed**: a kept copy gone, a folder changed, PATH changed, a week passed, or on purpose —
   `/doctor` (Hearth's "look again"), after an install / update / sign-in window, after the computer wakes (all of them
   pass `fresh`, as before).
3. **The full scan itself is asynchronous** (`scanAsync`): the same Windows / Mac / Linux scan code runs over a memo of
   answers; whatever it asked that isn't known yet is asked all at once with `fs.promises`, and it runs again until it
   asks nothing new. Same copies, same order (tested on a fake Windows disk with an owner-like PATH).
4. **Sign-in stays fresh**: never kept; every check still asks `auth status` / `login status`, so a sign-out shows at
   once (`robust-engine-test` passes unchanged).
5. **▶ Play builds its page without blocking** (`gamemodemain.js` `buildScene`): stamps, the last build's meta,
   removing the old build, pictures / song copied, the page written — all `fs.promises`.
6. **three.js read and written asynchronously** (`deploymain.js` `vendorThree`, also used by ⇪ Publish), a file already
   there with the same size not written again; where three.js lives is kept 5 minutes (`threeSources`).
7. **three.js stays in place between builds** of the same version: changing a scene and pressing ▶ Play again only
   rewrites the scene's own files (Defender no longer scans a fresh 1.3 MB copy each time).
8. **The Lab player's page is made once** per version of `tools/three-sandbox.html` and its libraries (`labPageOnce`).
9. **▶ Play warmed ahead**: 20 s after the start, only when a game was played in the last 2 weeks
   (`data/game-cache/last-play`, touched at each ▶ Play; `HEARTH_GAME_WARM=1/0` forces it), `warm()` loads ▶ Play's
   modules, makes its session (the persistent partition, its protocol and preloads), the player's page and reads the
   window's preloads — one small step at a time, skipped if a game starts meanwhile. `hub.game.state()` shows `warm`.
10. **First-Play timing** in `game.state().timing`: `session` (ms spent making the session at the click; 0 when warmed)
    and `warm`; the gamemode check reports build / window / load / session.
11. **`engine-health-watch-test` fixed**: stale wording, not a bug. codexcare58 (round 58) reworded the Doctor line to
    "couldn't check models right now" (and added a 'slow' line); the test still expected "could not verify now". The
    test now checks both lines.
12. **Checks**: `dev/winstart79-test.js` (in UNIT); `winperf78` gains `playTest.firstMs` and an `engineCheck` action
    with budgets, and runs with `HEARTH_GAME_WARM=1`; group `winstart79`.

## Before → after (winperf78, Windows simulation, heavy profile; base 3c9dfd5 vs this branch, same box, back to back)

| | before | after |
|---|---|---|
| ▶ Play: app sync fs calls | 62 | 37 (the rest: store / readyspeed reads, not the build) |
| ▶ Play: worst main-thread stall | 60 ms (293 ms in a first, colder run: the three.js read) | 0 ms |
| first ▶ Play, asked → page loaded | 387 ms (build 42, window 10, load 335) | 310–372 ms over two runs (session made ahead; the page load in the game's own process dominates, so on this Linux box the wall time is about the same — the gain is a free main thread) |
| warm-up at the start (its own steps) | — | modules 4 ms, session 3 ms, page 14 ms, preloads 2 ms |
| engine check (pinned fake engines) | 11 sync calls, 2 processes | 16 sync calls, 2 processes (the sign-in questions) |
| Windows engine scan (fake owner-like disk, `winstart79-test`) | 119 (Claude) + 135 (Codex) sync calls per check | 0 sync; a kept answer ≈ 40 async stats, a full scan ≈ 240 async |

Finding: on this box the session itself (`session.fromPartition`) takes ≈ 3–10 ms; the "≈ 300 ms" stall winperf78
attributed to it was mostly the synchronous three.js read + write inside the same ▶ Play (its CPU-profile block
`293 ms · wrapped mainlag-probe.js | 19 ms play`). Both are now off the click. On Windows the session's disk setup may
cost more; the warm-up covers it for anyone who plays games.

## Tested
- `winperf78` (opt-in, WINPERF78=1): passes on the branch; the base fails the new ▶ Play budget (fsSync 62 > 50).
- `perfguard` (PERFGUARD=1): first run on the branch flagged startup / project opens (+22–41 %, renderer-side culprits: chat-scenes.js labShown, scrollTop, showModal — code this stream did not touch; load average ≈ 3 on 4 CPUs); the base passed in the next slot (project warm open 355 ms vs 486 baseline: the box swings ±40 %), and the branch re-run passed: no regression (start → first usable chat 596 ms vs 564, project warm open 466 vs 486, sync stalls −12 % / +0 %).
- `gamemode`, `gpuplay76`, `lazy`, `unit:boot-test`, `unit:robust-engine-test`, `unit:engine-health-watch-test`,
  `unit:astra-engine-test`, `unit:winstart79-test`, `unit:engine-watch-test`, `unit:gamemode-test`,
  `unit:winpolish-test`, `unit:macpolish-test`, `unit:deploy-test`, `unit:winperf78-test`, `unit:winmac-test`,
  `unit:datasafe-scan`, `unit:errorcalm-scan`.
- `gamemode`: two of five branch runs failed "the merged canvas keeps drawing" (0 frames in 1.5 s under SwiftShader on a
  loaded box; the base also dropped to 4 frames); main-side first-Play timings are the same as the base.

## For Codex
- `engines.js` `checkEngine`: one line — `Installs.find(engine, { fresh })` instead of `Installs.candidates(engine)`
  (falls back to `candidates` if an older installs.js lacks `find`). Marked `(round 79, winstart79)`.
- `installs.js`: `candidates()` unchanged in behaviour (now `scanWith(engine, syncFs)`); new `find`, `scanAsync`,
  `scanWith`, `scanState`; `data().found` in engine-installs.json. `engine-watch.js` is untouched: its wake re-check
  (`fresh: true`) is what makes a wake look everywhere again.

## Risks
- A new copy installed in a folder the scan never looked into is found at the next `/doctor`, install window, wake or
  within a week (before: at the next check). Every usual install place (PATH, npm, nvm, Volta, scoop, winget, the apps'
  folders) is a folder the scan looks into, so its date changes on install.
- A folder whose date changes often (one on PATH that a program writes into) makes checks scan again — asynchronously,
  so it costs time on libuv's threads, not the main thread.
- three.js kept between builds is trusted by version + size; a three.js copy edited by hand with the same size would
  not be refreshed until the version changes (the build folder is Hearth's own cache).

## For the patch notes
- Hearth checks your Claude Code and Codex installs without pausing: it remembers where they are and only looks
  everywhere again when something changed, when you run /doctor, or after an install or update.
- If you signed out of Claude Code or Codex, Hearth still notices right away.
- ▶ Play opens without a hitch: if you played a game recently, Hearth gets ▶ Play ready in the background a little after
  it starts, and building the scene's page no longer freezes the app for a moment.
- Pressing ▶ Play again after changing a scene is quicker: three.js is no longer copied again every time.
