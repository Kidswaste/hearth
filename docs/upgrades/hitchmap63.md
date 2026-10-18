# Round 63: the hitch map — where Clink stutters at 240 Hz (hitchmap63)

The owner plays Clink in ▶ Play on a 240 Hz screen (4.2 ms a frame). The stats chip and the performance doctor say
*that* it stutters and *why*; this says **where**. Turn the recording on, play, and after the session Hearth shows a
top-down map of the play area coloured by frame time, a timeline of the session, and the worst spots listed with a
picture of the moment. Each spot can be jumped to (the Lab's scene put back there) or handed to the Three Director as a
task with the numbers.

**Off by default, and off costs nothing**: no script, listener, frame callback or helper of it in the game window (the
page's tag is added only when it's on; checked by dev/checks/hitchmap63.js). **On, it costs a few microseconds a frame**
(its own time is a helper of ▶ Play's budget: shown, watched, switched off by the watch like the others), and allocates
nothing per frame (one typed ring made once). Nothing goes into any prompt (0 tokens) unless you send a draft. The
game's own files are never touched.

New files: `tools/hitchmap-page.js` (the recorder, in the game window only while recording), `hitchmap-core.js` (pure:
the trace → heatmap, timeline, spots, words), `hitchmapmain.js` (main: the tag, spike pictures, the map built and saved),
`hitchmap.js` + `hitchmap.css` (hub, lazy group `gamemode`), `dev/hitchmap-test.js` (unit), `dev/checks/hitchmap63.js`.

## Upgrades
### Recording (in ▶ Play)
1. **Record the hitch map**: ▶ Play's right-click, Ctrl/⌘+K "Hitch map: record on / off", or `/playtest hitchmap on`.
   Off by default. Turned on while a game plays, it starts recording that game now.
2. **Per frame, only two things**: the frame's time and where the player and the camera were (the player from
   `window.game.player` / `hearthState`-style globals or an object named "player", else the camera). Into one typed ring made
   once (about 9 minutes at 240 Hz; older frames are overwritten).
3. **Clearly shown while it records**: the start hint says "● recording the hitch map", and the F chip starts with
   "● Hitch map 2:31".
4. **A picture of the worst moments**: when a frame takes 4× the usual (and at least 3 refreshes), Hearth takes that
   moment's picture and what the game saves, with playtest notes' capture (once, no per-frame capture). At most 4 a
   session, 2 s apart; after the first two, only a new worst one.
5. **It watches its own cost**: ▶ Play's budget counts it as a helper ("the hitch map"); if Hearth goes over its 2 % of a
   frame, it's the first to be switched off (the map is still built from what it recorded). It's never remembered off.
6. **GamePerf's causes** when the performance probe is attached (the doctor, the chip, the director's perf): each spot's
   hitches are put down to garbage collection, a shader compile, a texture upload, a long JS task…
### After the session
7. **The map is built when the session ends**: leaving, Ctrl/⌘+P back to editing, or turning it off. "▦ Hitch map of Clink:
   12 hitches · worst spot near x 6, z 0" with **Open the map**.
8. **Top-down heatmap of frame time** over the play area (the two axes the player moved along: x / z, or x / y for a 2D
   game), each cell coloured from "usual" to "2.5× the usual frame", cells with hitches outlined, the worst spots numbered.
9. **The timeline**: the worst and usual frame across the session, the screen's refresh line, the spots marked.
10. **The worst spots**, ranked by time lost there (each hitch's time over the usual frame): how many hitches, the worst,
    the usual frame there, the causes, the picture. Click a number on the map to pick its spot.
11. **Jump there**: the Lab's scene opens at that moment (its layers' `restoreState()` with what they saved at the spike,
    and their cameras), or the camera put back where it was, looking at the player. An HTML build gets `hearthRestore()`.
12. **Fix this**: the Three Director's box gets the spot as a task with the numbers (where, how many, worst, ms lost, the
    usual frame there and elsewhere, the causes, the game's state then) and the picture. Never sent: you press Enter.
13. **Saved per game** next to its playtest notes (`data/game-cache/<game>/hitch/`), one map per session, a session picker
    in the map, 20 maps a game (the oldest go to the Trash). **Clear…** moves them all to the Trash. Freeing "Optimized
    3D models" in Space leaves them alone.
### Chat
14. `/playtest hitchmap on | off`, `/playtest hitchmap` (the last map's spots, and the map opened), `/playtest hitchmap
    jump <n>`, `/playtest hitchmap fix <n>`, `/playtest hitchmap clear`, `/playtest hitchmap status` (what it costs now).
15. Ctrl/⌘+K: "▦ Hitch map".

15 upgrades.

## Cost (this machine: 4 shared CPUs, software GL, a 60 Hz test screen)
Measured by dev/checks/hitchmap63.js in the ▶ Play window, a Lab scene running ≈ 18–20 fps here:

| | Off (the default) | On (recording) |
|---|---|---|
| Hearth's script in the page | none (no tag, no `window.__hearthHitch`) | `/__hitchmap-page.js` once |
| ▶ Play budget's helpers | look, stream, audio, ready, watch (as before) | + "the hitch map" |
| Its own time a frame | 0 | **0.019–0.020 ms** by its own count, 0.0195–0.0198 ms by the budget watch (its worst 1 s window 0.04–0.05 ms) |
| Listeners on window / document | 20 | 21 (+ `visibilitychange`) |
| Frame callbacks | the page's own | + 1 (its own, the real `requestAnimationFrame`) |
| Garbage a frame booked to it | 0 | **≈ 27–33 B** (V8's sampling profiler; the budget watch beside it: ≈ 52 B) |

The ring is one `Float64Array` pair + one `Float32Array` made once (≈ 4 MB for 2^17 frames); per frame the recorder
stores two times and copies the player's and camera's positions with typed-array builtins (`set` / `copyWithin`), with
nothing computed: the gaps are worked out after the session; its flags are booleans and each number is read once. What
garbage is left is this slow machine running the frame callback unoptimised (its two clock reads boxed, as in the watch)
and the rare spike's event; a first version that computed the gap and the positions per frame read 250 B a frame here,
the second 70–150 B. On the owner's CPU the recorder is optimised within a second and
its time a frame is a few microseconds (the clock itself is in 5 µs steps). Off, gcchurn60's budget is unchanged (it
plays without the recorder: passed).

A session's map is ≈ 17–18 KB of JSON (40 × 40 cells, a 400-bucket timeline, 8 spots), built main-side in ≈ 50 ms for
2 minutes at 240 Hz; reading the ring at the end is one `executeJavaScript` (bounded at 1.1 s), once.

## Edits outside the new files
- `gamemodemain.js`: requires hitchmapmain (the page served and tagged after the budget's only when armed, `hitch` in the
  window's JSON, the close waits once for the map, the `game:hitch` / `game:hitch-spike` channels, `ended`).
- `game-preload.js`: the hint's "● recording the hitch map", "● Hitch map 2:31" first on the F chip (read with the chip's
  existing 2 s read), the `hearth-hitch` listener only while recording.
- `tools/playbudget-page.js`: helper id `hitch` (ALL / ORDER first / NAMES, `hooks()`); playbudgetmain's remembered IDS
  unchanged (never remembered per game).
- `playnotesmain.js`: `grab(wc)` (the capture + read, shared; `take()` uses it) and `toBin` exported.
- `playnotes.js`: `restore(source, { state, cams })` and `toDirector(source, text, picture)` split out of `jump` / `fix`
  (same behaviour), a camera may carry `look`; the director toast says "with the picture" only when there is one.
- `tools/gameperf-probe.js`: `slows()` (its kept slow frames with their page time; read once, after the session).
- `gamemode.js` (`hitch` in `game:play`, the right-click rows), `tools/directorgame.js` (`/playtest hitchmap …`),
  `preload.js` (`hub.game.hitch` / `onHitch`), `diskcalmmain.js` (game-cache folders with `hitch/` kept), `lazy-data.js`
  (gamemode group; META regenerated), `dev/run-checks.js` (group `hitchmap63`, unit `hitchmap-test`), `tools/game-api.md`.

## Tests
- `dev/hitchmap-test.js` (unit, 12): the ring (made once, wraps, oldest first, the gaps worked out afterwards), the spike
  and picture rules, the recorder itself in a pretend page (frames stepped by hand: the player from `window.game`, the
  camera from `__scenes`, a 120 ms spike → one event, the budget's pause / off, its listener gone, its frame callback
  stopped), decoding the page's base64, the axes (x / z, x / y for a 2D game), binning into the heatmap (known points in
  known cells), the timeline, worst-spot detection on fixture traces (a place that hitches every pass beats a bigger
  one-off elsewhere; a smooth game has none; a still camera: one spot), GamePerf's causes matched by time, the summary
  (pictures on their spots, jump: state vs camera with `look`, the director's draft, the lines), and the store on a
  throwaway folder (a spike's picture, the map built and saved per game, listed / read, a bad file name refused, the close
  waits once, 20 maps a game with the oldest's picture going too, the tag only when armed).
- `dev/checks/hitchmap63.js` (group `hitchmap63`), a Lab scene with a 450 ms stall each time the player passes x 6, z 0:
  - off: no script / global / helper / hint, no map made; on: hint, "● Hitch map 0:0x" on the F chip, the helper, one
    listener more, its time 0.020 ms a frame (its count) / 0.0198 ms (the budget), 27–33 B a frame of garbage (watch 52 B), 2 pictures;
  - Ctrl/⌘+P → "▦ Hitch map of Clink hitch" → the map (heatmap + timeline + 8 spots): **spot 1 at x 5.9, z −1.1** (5
    hitches, worst 450 ms, 1.6 s lost; the next spots ≤ 83 ms lost), its picture saved in `game-cache/lab-<id>/hitch/`;
  - Jump there → the Lab's layer got `restoreState()` with the angle saved at the spike (cos 0.99: at x 6, z 0);
  - Fix this → the director's box: "Hitch map from Clink hitch in ▶ Play (0:29 played, 60 Hz …) Worst spot #1 of 8, near
    x 5.9, z -1 … 4 hitches, worst 450 ms … 1600 ms lost … Fix this: …" with the picture, still unsent 1.5 s later;
  - `/playtest hitchmap` lists the spots; leaving rebuilds the map at the window's close (same session); `/playtest hitchmap off`.
- Under `flock /tmp/hearth-run.lock` (holds of ≤ 5), after merging claude/intelligent-galileo-yaiqem (rewards63) and
  origin/main: **hitchmap63, playnotes62, playbudget, gamefps54, gcchurn60, lazy, unit:boot-test passed**; **gamemode**
  failed once ("the merged canvas keeps drawing": 0 frames in 1.5 s at a load of ≈ 5, with the hitch map off) and passed
  alone right after: timing. `lazy-manifest.js` regenerated (passes its own compare). Unit: hitchmap-test, playnotes-test,
  playbudget-test, gameperf-test, diskcalm-test, directorgame-test pass.
- After the last merges (questwalk63, soundbank63, loopsong63): lazy-manifest regenerated, **lazy, unit:boot-test, hitchmap63 passed**.
  One hitchmap63 run of six failed "Fix this … and the picture" (the draft was in the box, its picture not attached
  within 6 s, under load); the next run passed. Noted, not a product failure seen otherwise.
- Fixed on the way: the check's "leaving" step closed the map before it had opened (the map then refreshed in place
  instead of toasting); the recorder's first versions boxed every number they computed (250 B, then 70–150 B a frame
  here) → builtins, booleans, each number read once (27–33 B).

## Risks
- **Where the player is** comes from what the game exposes (`window.game.player`, a `player` object in the scene…); a
  game that hides its player shows the camera's path instead (still a map of where it stutters, from the camera's view).
- **Jump there** needs the game's help like playtest notes: a Lab layer's `saveState()` / `restoreState()` (or an HTML
  build's `hearthRestore()`); without a picture at that spot, only the camera goes back, and a game that moves its camera
  every frame puts it back at once.
- **Pictures** are taken a frame or two after the spike (the moment right after), and the capture itself can be a small
  hitch of its own on a slow machine: at most 4 a session.
- A long session keeps its last ~9 minutes at 240 Hz (older frames overwritten); the map says how long it covers.
- Reading the ring at the end is one `executeJavaScript` of up to ~5 MB (once); a window closed by the system before
  that (a crash) leaves no map for that session.

## For the patch notes
- **Hitch map: find where Clink stutters.** Turn it on from ▶ Play's right-click ("Record the hitch map") or
  `/playtest hitchmap on`, then play as usual. The F chip shows "● Hitch map" while it records.
- When you come back (⌘P / Ctrl+P, or leaving), Hearth shows a top-down map of your level coloured by frame time, a
  timeline of the session, and the worst spots, with a picture of the worst moments.
- **Jump there** puts the Lab's scene back at that spot; **Fix this** hands it to the Three Director with the numbers and
  the picture, ready for you to send.
- Off by default, and off it adds nothing to your game. On, it costs a few microseconds a frame and Hearth's budget
  watch switches it off by itself if it ever costs the game frames.
- Maps are kept per game next to your playtest notes; `/playtest hitchmap` lists the last one's spots.
