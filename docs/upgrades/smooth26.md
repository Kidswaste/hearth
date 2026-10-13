# smooth26 (round 26): smoothness and weight after rounds 25–26

You asked for "a smooth 240 Hz at all times" and a light app. Rounds 25–26 added kinetic type, physics in a Worker,
camera input, the Lab preview's split kits, ⋯ AI setup and ◎ Missions. This pass measured them (and the everyday
stretches around them), then fixed what cost frames or woke the app for nothing. Nothing was removed or changed in
what you see, apart from "↑ Show earlier messages" now bringing them 60 at a time.

## How it was measured
- `node dev/perf-report.js` (startup ×3, idle, idle after visiting the tools, interactions).
- `dev/checks/smooth26.js` (new, in the `smooth` group): real input events under a timeline trace, in the Forgeheart
  look, with a busy Lab scene (a ⚛ physics layer and a 🅰 type layer) left behind a chat: the Lab hidden, wheeling a
  300-message chat, typing 60 letters, ⋯ AI setup ×5, ◎ Missions ×5, switching windows (chat → Lab → board ×2).
- `dev/checks/hz240.js` (the round 17 240 Hz check; fixed for round 26, see below), `dev/checks/labperf.js`
  (the Lab playing / paused / hidden / unfocused, 20 scene switches), `chatperf`, `jankwatch`.
- Small counting probes (exact counts, not timings): layout reads made by clicks, the frame "Show earlier" costs.
- Before = this branch's starting commit, run from a copy of it on the same machine, interleaved with the after runs.
  The machine is shared (4 CPUs, other streams' tests running, SwiftShader, 60 Hz Xvfb): timings move ±20–30 % between
  runs, so the counts (timer fires, forced layouts, layout reads) are the reliable numbers.

## Numbers (before → after)

| What | Before | After |
|---|---|---|
| **Idle after visiting the tools** (the Lab loaded, then off screen; perf-report, 4 s) | 9.1 ms busy/s · 8 timer fires, all from the Lab preview's stats timer | **2.9 ms busy/s · 0 from the preview** (the 7 left are one-shot timers of other tools) |
| Lab preview while parked (off screen, another window, the app hidden) | wakes 2×/s (stats), 4×/s more once a song is loaded (even paused) | **0×/s**; the stats restart when it's on screen, the song report while it plays |
| Layout reads made by an ordinary click anywhere in the app, once the Lab has loaded | **40 per 20 clicks** (a forced layout per click: the preview measured for "your usual frame size") | **0** |
| Opening ⋯ AI setup ×5 (smooth26): forced style / layout in script | 84 forced, 76.6 ms | **51 forced, 23.7 ms (−69 % time)** · work per input p95 24.6 → 21.2 ms, max 44.8 → 36.2 ms |
| ⋯ AI setup's first open | waits for its 18 KB to load (32 ms here) after the click | loaded while you point at ⋯: the click opens it at once |
| Switching windows ×6 (smooth26): forced style / layout | 57 forced, 80.7 ms (the board read styles mid-switch) | **43 forced, 44.3 ms (−45 %)** · work p95 157.7 → 140.7 ms |
| ◎ Missions ×5 (smooth26) | max input 52 ms; picker measured where it showed | max input 36.4 ms; measured hidden, placed, then shown (no flash); every close takes its 2 page listeners |
| "↑ Show earlier" on a 300-message chat (also when you scroll up to it) | all 260 earlier messages in one frame: 41 ms | **60 at a time: 15–26 ms a frame** (5 steps, the list keeps its place) |
| Wheeling the 300-message chat (hz240): longest task | 351.8 ms | 212.2 ms (the rest is the software compositor's commit, see Not fixed) |
| Lab (labperf): hidden draws / context leak / fps playing · paused | 0 / none / 13 · 16 fps | 0 / none / 13 · 17 fps (unchanged, as intended) |
| Startup (perf-report, median of 3) | ready 325.9 ms · FCP 482 ms · script 92.1 ms | ready 267.3 ms · FCP 375.8 ms · script 83 ms (no startup change was made: this is the shared CPU) |
| Idle, app open (5 s) | 2.3 ms busy/s · 3 one-shot timers · 0 rAF · 0 style recalcs | 2.2 ms busy/s · the same 3 · 0 · 0 |
| hz240 whole check (~1,010 real inputs) | inputs over 4.2 ms 744 · frames over 8.3 ms 548 · forced 593 | 798 · 572 · 558 (within this machine's noise; the stretches above are where the changes act) |
| First-screen JS / CSS (index.html) | 2,305.3 KB (77 files) / 427.6 KB (26 files) | 2,307.8 KB / 427.6 KB (+2.5 KB: the fixes and their comments) |

Weight of rounds 25–26 on the first screen: only `missions.js` (7.9 KB, the ◎ in every chat box). AI setup
(`options.js` + css, 18 KB) loads on first use (now on pointing at ⋯); type, physics and camera input load with the
Lab after the first screen; interop on first use; the preview's motion kit and 3D runtime when a scene asks.

## Upgrades

### Hidden things cost nothing
1. The Lab preview's stats timer sleeps while the Lab is off screen (parked): no wake-ups twice a second behind a chat,
   another tool or a hidden window; it starts again (counters reset) when the Lab is back. `tools/three-sandbox.html`
2. The preview's song position report runs only while the song plays: a loaded but paused song no longer wakes the page
   4 times a second (play / pause / end start and stop it). `tools/three-sandbox.html`

### No layout work in clicks, menus and switches
3. Clicks anywhere in the app no longer force a layout once the Lab has loaded: "your usual frame size" (assist) reads
   the size the Lab keeps instead of measuring the preview. `assist.js`
4. ⋯ AI setup builds without forcing a layout (it restored a scroll position of 0). `options.js`
5. Pointing at ⋯ in a chat loads AI setup in the background (after any gesture in progress), so the first click opens it
   at once. `native.js`
6. ◎ Missions' picker is measured hidden, placed, then shown: one layout, no frame at the wrong spot. `missions.js`
7. ◎ Missions' picker closes cleanly every way (a pick, opening it again, Esc, a click away): its two page-wide listeners
   no longer linger until the next click. `missions.js`
8. The ◎ button rewrites its label only when it changes, and a chat box built again lets its old ◎ go (no painter per
   rebuild kept forever). `missions.js`
9. Switching windows: the board no longer reads styles in the middle of the switch when it has no video playing.
   `board.js`
10. The "how important things look" pass (usage highlights) waits for an idle moment instead of landing in a frame of
    the click / menu / typing that triggered it, and ⋯ AI setup / ◎ Missions opening and closing no longer trigger it.
    `usage.js`
11. The jank watch no longer styles the page in the middle of a scroll or drag to ask whether something animates (the
    scroll says it). `jank.js`

### Long chats
12. "↑ Show earlier messages (N more)" and scrolling up to it bring 60 messages at a time (the last step brings the
    rest): the 260 earlier messages of a 300-message chat cost one 41 ms frame here, now 15–26 ms per step, and the
    list keeps its place. Jumping to an old message, search and `Native.showEarlier()` still bring them all. `native.js`

## For the next measurer (not counted)
- `dev/checks/smooth26.js` (new, `sh dev/run-checks.sh smooth26`, in the `smooth` group): the stretches above with
  per-stretch work, frames over 4.2 / 8.3 ms, forced layouts with the JS line, and page listeners before / after.
- `dev/checks/hz240.js` works again with the round 26 UI: the Commands page has no rail button (it opens by
  `activate`), and ⋯ opens AI setup, so its "menu" stretch right-clicks ⋯ for the old quick menu.

## Not fixed (measured, left as is)
- Wheeling a long chat still shows 200–330 ms tasks here; they are the compositor's commit on this machine's software
  GL (main-thread "Commit" ≈ 1.5 s over 40 wheel steps), not Hearth's scripts (≈ 2 ms per step) or styles. A real Mac
  GPU composites the scroll; worth a look with `/smooth` on the owner's machine.
- Typing: ≈ 0.5 ms of Hearth's own script per key; the rest is the text box's own editing and the jank watch's event
  timing on this slow machine. Nothing new from rounds 25–26 runs on a keystroke.
- First-screen weight candidates for a later pass (bigger moves than this stream should make while others edit these
  files): Flows (`flows*.js`, 128 KB, tied into progress / makes / resume at startup) and the Ctrl+; bar
  (`cmdbar*.js`, 90 KB, restores timers at start).
- Opening ⋯ asks the main process for connected apps every time (async, not in a frame).
