# Jank watch (round 20): smoothness measured on your own computers, and a gentle hand when it slips

You asked: "keep packing upgrades! make it smoother always!" Every speed pass so far was measured here, headless, on
a software GPU. Your Mac and your PC have real GPUs and real habits, so Hearth now watches its own smoothness while you
use it, on each computer, and adapts a little when it slips. Type **`/smooth`** to see what it saw; its **📋 Copy for
Claude** button gives the next dev session the real numbers to work from.

Nothing is sent anywhere: the log stays in this computer's data folder (`kv/jank-log.json`, kept out of cloud sync on
purpose, since it's about this machine).

## What it costs
Observers only: no polling, nothing per frame. At idle it does nothing (smooth-app idle: 0 long frames, 0 DOM changes,
0 paints, as before). Measured in the test copy:

| What | Cost |
|---|---|
| A key press / click (busy signal + counting the input) | ≈ 1.8 µs |
| A drag / pointer move with a button held | ≈ 1 µs |
| The Lab preview's stats (twice a second while it shows) | ≈ 0.9 µs |
| Saving the log | at most every 5 min, only when something was recorded, never mid-gesture |
| Main-process loop sampler | 10 samples/s, only while the window is on screen and the computer awake |
| A short profile (when long frames keep coming) | 8 s of 1 ms sampling (~1–3 % CPU), at most every 3 min and 12 times a day |
| Log size | ≈ 1.2 KB per active hour, a week at most |
| Code at startup | jank.js 21 KB; the report (jank-report.js, 16 KB) loads on first `/smooth` |

A real finding from building it: Hearth's pages are `file://` pages, and Chromium leaves scripts from `file://` URLs
out of the Long Animation Frames attribution, so the browser alone can count long frames but can't say which code
made them. Hence the short profiles (item 10), which name the file, line and function.

## Upgrades
### Measuring, always on
1. **Long frames, watched all the time**: every frame over 50 ms is counted (Long Animation Frames; long tasks on an
   engine without them), with its length and worst case.
2. **Grouped by area**: chat, Lab, board, menus, dialogs, Commands page, apps, rail, Forge, and "start" for the frames
   before the first screen. The area comes from where you clicked or typed, or from what's on screen.
3. **Grouped by cause**: script and tasks, layout forced by a script, the frame's own style / layout / paint, other
   browser work.
4. **Input → paint for every click, tap and key** (Event Timing, one count per interaction at its slowest event), so
   p50 / p95 are honest: the fast ones count too, not only the slow ones.
5. **Dropped frames only while something moves**: a long frame counts its lost frames (at your display's refresh
   rate) when an animation runs or you scroll or drag; a long frame while nothing moves isn't a dropped frame.
6. **The Lab preview's real frame times** from its own stats: fps against its target (your display, or its cap),
   worst frame, drawing p95, when it lowered its resolution, how often Light mode was on.
7. **The main process's event-loop lag** (how late it answers), sampled only while Hearth is on screen and awake.
8. **GPU process crashes, a window's page crashing, a window not answering** (and answering again), with the reason.
9. **WebGL views losing their GPU context**: the Lab preview and any other WebGL view in the window.
10. **The code behind repeated long frames, named**: when 3 long frames come within 15 s, Hearth samples its own
    JavaScript for 8 s and names each long stretch by the app line it spent the most time under (file:line,
    function) and the handler it started from. At most every 3 minutes and 12 times a day; never while DevTools are
    open.
11. **A small rolling log on this computer**: hourly buckets for a week, the 12 costliest culprits per hour; saved at
    most every 5 minutes when idle, and when the window hides or closes. Never synced, never sent.
12. **This machine in the report**: Mac / Windows, the display's refresh rate and the GPU's name.

### Adapting live, gently
13. **"Busy now"**: while you type, drag or scroll (and 0.7 s after), `Jank.busy()` is true and `hearth:busy` fires
    on each change, for any part of the app to read.
14. **Background work waits for the gesture to end** (`Jank.calm()`), then resumes one job per idle moment, never all
    at once; every job has a deadline so nothing waits forever.
15. Features that load after the first screen wait while you're mid-gesture (≤ 4 s).
16. The weekly tidy waits (≤ 15 s).
17. The mood board's picture work (vibes, thumbnails) waits mid-drag (≤ 6 s).
18. Chat scene thumbnails wait (≤ 5 s).
19. The engine check at start waits (≤ 10 s).
20. **Cloud sync passes wait** while you type / drag / scroll (main process, ≤ 30 s), counted in the report.
21. **Light mode, suggested once**: if the Lab preview keeps dropping frames (40 of the last 60 half-seconds) on this
    computer, one toast offers 🪶 Light mode with a single button. Once, ever.
22. **A script that keeps causing long frames is flagged** in the report ("keeps doing it": 5+ in a day, or a third
    of all long frames).

### `/smooth`
23. **`/smooth`**: per area, inputs, input → paint p50 / p95, the slowest input, long frames (worst) and frames dropped
    while moving, for the last day.
24. **The 5 costliest culprits**: file:line and function, a plain name ("the chat view", "the mood board", "the Lab
    sequence"…), what started it (a click, a timer, an animation frame, a handler), how often, how long in all.
25. **Why frames ran long**, as shares: scripts, layout forced by scripts, style / layout / paint, other.
26. The Lab preview, the main process and GPU / crash lines.
27. **What was adapted**: background jobs held back while you worked (by kind), profiles taken, Light mode suggested.
28. **📋 Copy for Claude**: the summary a dev session needs (machine, per-area numbers, culprits with file:line and
    invoker, causes, Lab, main loop, GPU events, adaptations, a suggested first target and the smoothness rules).
29. **Last week / Last day** button on the report (`/smooth week`).
30. **`/smooth copy [week]`**: the summary for Claude straight to the clipboard.
31. **`/smooth profile [seconds]`**: "watching closely, do what feels slow now", then the long stretches it found,
    named; they join the report.
32. **`/smooth reset`**: forget the log (asks first).
33. **`/smooth off` / `/smooth on`**: stop measuring and holding anything back, or start again.
34. **Ctrl/⌘+K → "Smoothness report (jank watch)"**.
35. **`/jank`** works as another name for `/smooth`.
36. **Chats know about it**: the app map tells Claude and Astra that `/smooth` (and its Copy for Claude) is the answer
    when you say Hearth stutters.

## For developers
- `Jank.busy()`, `addEventListener('hearth:busy', e => e.detail.busy)`, `await Jank.calm(maxMs, label)` (label: how it
  shows in the report; resolves at once when calm), `Jank.later(fn, maxMs, label)`. From a module that may load before
  jank.js: `await (window.Jank?.calm?.(4000, 'my job') ?? Promise.resolve())`.
- `Jank.lab(statsMsg)` (tools/three.js), `Jank.gpu(what)`, `Jank.profile(ms)`, `Jank.data()`, `Jank.reset()`,
  `Jank.setOff(bool)`. Main side (jankmain.js): `jank:take` (loop lag + events since the last take), `jank:profile`,
  `jank:lines`, `jank:info`, `jank:busy`, `jank:off`; `syncmain.setHold(fn)`.
- A test copy (`HEARTH_TEST_SAVE_DIR`) never suggests Light mode or profiles by itself.

## Tested
`dev/checks/jankwatch.js` (all pass): two fixture scripts with known lines are written into the test copy; a timer,
a layout thrash and a slow click are induced during a profile: each is counted as a long frame and named
`board-jankfixture.js:2 jankBoardTimer` (board), `board-jankfixture.js:3 jankThrash`,
`tools/three-jankfixture.js:3 jankLabClick` (Lab, started from the click); the click is a slow chat input; typing
makes Jank.busy() true and a held job runs 0.71 s later; Lab stats, a GPU loss and the main loop lag reach the log;
`/smooth` shows the table, culprits with file:line, causes, Lab, adapted, GPU, with Copy for Claude and Last week;
`/smooth profile`, off / on / reset; no duplicate commands. Also `lazy`, `qa-commands`, `smooth-app` (idle unchanged).

## Not verified here
The real Mac / Windows GPUs (the point of it: run `/smooth` there after a day of use), a GPU process crash, and the
Light mode suggestion firing on its own (a test copy never suggests it). A hot loop that V8 optimized before a profile
started can show up as "browser work" instead of its line (seen with a synthetic busy loop); ordinary app code is named.
