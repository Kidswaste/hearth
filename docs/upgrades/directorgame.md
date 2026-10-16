# ▶ Play-test: the Three Director plays your game (round 53, directorgame)

The owner can now say "play Clink for 30 seconds and tell me what feels off" and the Three Director does it in the
fewest steps: a one-line test plan in its reply, **one** tool call that starts Clink in its ▶ Play window, plays it and
measures it, then one short summary. Before this round no director tool reached the ▶ Play window at all; the nearest
was play-testing the Lab preview (three_input + a screenshot + the console + perf).

Nothing was added to the per-message prompt: the director's fixed part stays **2,127 tokens a step** (the three_do
line was reworded to name `play` in the same space); the how-to is `three_do help play` (≈ 250 tokens, only when asked).

## Measured
`node dev/directorgame-test.js` runs five typical play-tests (one chat message each) through the **real** hub side
(`tools/directorgame.js`) and page probe on a fake game (a vm "window" with Coin Run's rules, a scene with a camera,
`window.game`, frames at 60 Hz on a virtual clock, a stutter every 200 frames; variants where D does nothing or a jump
throws at game.js:42). Tokens = input over the task's steps: (fixed part + what the reply holds so far) per step,
arguments counted like results, text ≈ chars / 4, pictures ≈ w × h / 750; the fixed part measured with
`dev/promptdiet-measure.js`. The budgets are locked in the test.

| play-test | calls | steps | tokens (input over its steps) | its result | budget |
|---|---|---:|---:|---:|---:|
| play Clink for 30 s, tell me what feels off | play {secs: 30, script, perf: true} | 2 | 4,609 | 320 | 2 · 4,700 |
| does jumping work? | play {script} | 2 | 4,343 | 72 | 2 · 4,420 |
| something breaks when I jump | play {script} | 2 | 4,411 | 140 | 2 · 4,500 |
| walk forward and show me | play {script, shot: true} | 2 | 4,470 | 80 + 123 (picture) | 2 · 4,550 |
| why does it stutter while I play? | play {secs: 10, perf: true} | 2 | 4,574 | 314 | 2 · 4,650 |

Results: a 30 s run's summary ≈ 100 tokens (budget 130), gameperf's findings ≈ 220 (budget 260), one picture 123
(budget 130). For comparison, the nearest way before (the Lab preview, not the ▶ Play window: help games, three_input
with a 768 px screenshot, three_console, three_do perf), estimated with the same formula and the real text sizes:
"30 s, what feels off" 5 steps ≈ 13,400 tokens, "does jumping work?" 4 steps ≈ 10,200, "show me" 3 steps ≈ 7,300,
"why does it stutter" 4 steps ≈ 9,500, so about **55–65 % fewer tokens and half the steps**, on the real game window.

End to end (`dev/checks/directorgame.js`, fake Claude making real MCP calls, the HTML test game in a real ▶ Play window
under Xvfb): the play-test is **one tool call, 2 steps, ≈ 220 result tokens** with its picture; the game started in
3.6–5.4 s, its keys moved the player, no key reached Hearth's own window, and the window closed when the reply ended.

A real 30 s answer (fake game, D broken):
```
▶ Clink started (one canvas (3 of 3 layers) · page (ready)) · 60 Hz · ready in 0.3 s
▶ Clink · 32 s, 37 steps · fps 59 (60 Hz) · worst 60 ms · 9 stutters
player 0,0.4,0 → 31,0.4,16 (moved 35) · objects 214 · mouse captured · keys seen 21
steps ✓ 26/31 · ✗ 5 hold D 1 s: didn't move (×5)
state: score 0→1 (2 same)
errors: none
off: 9 stutters (worst 60 ms); hold D 1 s: didn't move (×5)
Clink: 60 fps on 60 Hz (100% on time, …), 2 stutters (shader 1, gc 1); 420 calls, 380,000 tris, pr 2
1. [drawcalls] … 4. [garbage, fix] new Vector3 every frame in update() (line 4) …
```

## Upgrades
### One call plays it
1. **`three_do play {game, script, secs, perf, shot}`**: starts the game in ▶ Play if it isn't playing (a Lab scene's
   name like "Clink", "last", an HTML file's path, or the scene open now), plays the script, answers. One tool call.
2. **A short input script in plain words**: `hold W 2 s, jump, look left 45, click, wait 1 s, press E, run forward 1 s,
   strafe left, W+D 1 s, jump x3, click 0.2 0.8` (commas, "then", new lines). An unknown step says which one and what
   it understands.
3. **secs repeats the script; no script plays a walk-about** (click to capture the mouse, then move every way, turn,
   jump) for secs: "play it for 30 s" needs no script.
4. **Timed where it's sent**: the holds and turns run on the main side, so a 2 s hold is 2 s even when Hearth's window
   sits behind the full-screen game (where its timers are slowed). Keys let go at the end, always.
### Answers with numbers, not pictures
5. **fps vs the screen's refresh, the worst frame, stutters** over the run.
6. **Where the player went** (from the game's state, an object named player / hero…, else the camera) and **each step
   judged**: a move moved, a jump rose, a look turned (✓ / ✗, repeated ones counted once).
7. **The game's state before → after**: what changed (score 0→1), the rest counted; read from `window.game`,
   `window.__game`, `window.hearthState()` or `window.__clink` (the game's own name); the test's own input left out.
8. **Errors with file:line, the line itself (±1) and the usual fix** (the director's 13 error kinds when the Lab is in,
   else a short set), the same error every frame counted once.
9. **"off:" in one line**: low fps, stutters, steps that did nothing, errors, keys that never reached the page, nothing
   moving, no position exposed (and how to expose it).
10. **perf: true** adds gameperf's findings (stutter causes, fixes with ids, ≈ 220 tokens) measured over the same run.
11. **shot: true**: ONE small picture (384 px, ≈ 120 tokens), only when asked.
12. **op: start | run | state | shot | perf | stop**: the game's state in ≈ 40 tokens, a picture, the perf findings, or
    stop, on the session already running (a second call doesn't start it again).
### Cheap to know
13. **No per-message growth**: the three_do line names `play {game, script}` in the same space (2,127 tokens a step,
    as before); `three_do help play` (also "help playtest", "help games", "help clink") has the how-to and the one-call
    recipe for "play it for 30 s and tell me what feels off".
### Safe
14. **Input only goes to the ▶ Play window** (found by its own hearth-game address on the main side), never to
    Hearth; Esc, ⌘ / Win, Ctrl+W, Alt+F4 are never sent (refused before anything starts).
15. **The owner's own game is read-only** for the director: its state, perf and a picture, no input, never closed.
16. **A play-test ends with the director's reply** (done, error or stopped), or 3 minutes after its last call.
### For you
17. **`/playtest [game] [script | 30s | stop]`**: the same run with its summary in the chat, no tokens
    (`/playtest Clink hold W 2 s, jump, look left`, `/playtest Clink 30s`); it leaves the game after.
18. A play call may run up to 3 minutes (90 s of input), and isn't allowed inside a batch (it runs on its own).

18 upgrades.

## Files
New: `tools/directorgame-core.js` (the script, the timed ops, the page probe, the summary), `tools/directorgame.js`
(hub side: `three_play`, the session, `/playtest`; lazy group `directorgame`), `directorgamemain.js` (main side:
`game:script`, `game:script-stop`, `game:shot`), `dev/directorgame-test.js`, `dev/checks/directorgame.js`.
Small edits: `mcp/three-mcp.js` (`play` in DO_CMDS + its help line, the three_do line reworded at the same size, help
alias), `mcp/three-guide.js` (the games topic names it; "help clink"), `bridge.js` (play not in a batch),
`gamebridge.js` (3 min for a play call), `main.js` (one lazyIpc line), `preload.js` (`hub.gameTest`), `lazy-data.js` /
`lazy-meta.js` (the group; META regenerated with `node dev/lazy-manifest.js`), `index.html` (the group's name in the
lazy-at list), `dev/run-checks.js` (unit list, `directorgame` group), `FEATURES.md`.

## Tested
- `node --check` on every touched file.
- `node dev/directorgame-test.js`: all passed (script, timeline, probe standalone, a run on the fake game, ✗ for a dead
  key, an error with line + fix, one picture only when asked, stop, the owner's game read-only, turn end, Esc refused,
  /playtest, the five budgets, the fixed part 2,127).
- `node dev/run-checks.js directorgame`: 5/5 (directorgame, directorgame-test, director-mcp-test, lazy, boot-test).
- Also run alone: see the report (directorfrugal, gamemode, gameperf, promptdiet, cache-test, director-mcp-test, lazy, boot-test).

## Not done (on purpose) / risks
- **Full mode** (`/director mode full`) lists tools instead of three_do, so `play` (like `perf`) is lean-mode only.
- **Where the player is** comes from what the game exposes: an HTML build that keeps everything in a module and no
  `window.game` gets fps, errors and state "none exposed"; the answer says how to expose `window.game = { x, y, z, … }`.
  Turns are judged only when a camera is found (a Lab scene's `__scenes`, or `window.scene` / `window.camera`).
- **The game window takes the screen** while the director plays it (that is ▶ Play); it closes with the reply.
- **Mouse look** sends real mouse moves with movementX/Y; a game that turns only with pointer lock needs the "click"
  first (the walk-about does it). Under Xvfb the pointer lock request is refused (no window manager), shown as an error.
- **A Lab scene that needs the live Lab** (camera, MIDI, live sound) plays through the Stage window, which this can't
  drive: the answer says to use three_do input in the preview instead.
- Numbers on the test machine are SwiftShader's (fps 3–4 in the real window): the budgets are on the fake game's tokens
  and steps, not on frame rates.

## For the patch notes
- **The Three Director can play your game.** Ask "play Clink for 30 seconds and tell me what feels off": it plans in
  one line, plays Clink in its ▶ Play window with real key presses and mouse moves, and tells you what it found: frame
  rate against your screen, stutters, where the player went, which inputs did nothing, the game's score / state before
  and after, and any error with its line and the usual fix.
- It does it in one step and a few hundred tokens: no screenshots unless it needs one (then one small picture), and
  the stutter causes from the performance doctor when asked.
- Short scripts in plain words: "hold W 2 s, jump, look left, click, wait 1 s, press E".
- Safe: its keys and clicks only go to the game window, never to Hearth; it never presses Esc or ⌘ keys, never touches a
  game you're playing yourself, and the game closes when its reply ends.
- `/playtest Clink hold W 2 s, jump` does the same for you, free.
