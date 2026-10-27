# startfast73: a quicker start, and a Hearth that sleeps when you're away (round 73)

The owner says Hearth "feels slow overall" now that the hiccups are mostly gone. This stream measured a cold start on
the heavy owner-like profile (dev/bigprofile.js from round 70: 1,500 chats, 120 long ones, 50 Lab scenes, a full quest
journal and more), with CPU profiles of both processes. It cut the biggest costs it found and brought the Lab's idle
wakeups under budget. It also measured Hearth hidden in the tray, every process counted, and fixed the two a11y check
failures, which turned out to be real.

## How it is measured
- **`node dev/coldstart-report.js --data /tmp/hearth-bigprofile70 --keys --profile <dir>`** (extended). It cold-starts
  a copy of a data folder (`--data`). From the first screen on, it types a key in the chat box every 200 ms for 8 s
  (`--keys`) and reports the slowest key's handlers (Event Timing). Every launch also reports **settled**: the window's
  last long task, after 3 quiet seconds. `--profile` takes CPU profiles of **both** processes on the last launch. The
  main process is profiled by `dev/boot-probe.js` (`HEARTH_BOOT_CPUPROF`, an in-process profile from its first line).
  The window's main thread comes from the trace's V8 sampler, without its workers. Both are summed by phase with
  `dev/cpuprof-sum.js` (new). The probe now writes its IPC counts at most every 300 ms; a write per call had cost
  ≈ 20 ms of the measured start. With `HEARTH_BOOT_PROBE_BYTES=1` it counts kv reads per store (`kv:get ui-usage`…).
- **`dev/checks/idlecpu.js`** has a 7th setup, **hidden**: the Lab is used, then the main process hides the window, as
  the tray's close does. Every process counts. Budgets: the window wakes ≤ 0.3 times/s, the main process runs ≤ 2
  timers/min, and all processes together use ≤ 0.8 % of a CPU.
- Sync file calls in the main process at start: `HEARTH_LOOPLAG=prof HEARTH_SLOWFS_US=150` (a Windows-slow disk) and
  `power.test({ lag })` 12 s after the start, as bigprofile70 does.
- The machine is this shared 4-CPU box with software GL, with other streams running at the same time. Base (main
  3790ef2) and new runs were interleaved. Counts and bytes are exact; times move by ±30 %, so compare medians.

## Numbers (big profile, cold start, ms since the process started; medians, base n = 5, new n = 6)
| What | Before | After | |
|---|---:|---:|---|
| Window on screen | 533 | 531 | same |
| **First usable chat** (Hearth's ready mark: the chat and its box drawn, typing works) | 1,259 | **936** | −26 % |
| … of which waiting for the chats list (splash "chats") | 309 | **78** | −75 % |
| … the page loaded → first usable chat | 354 | **122** | −66 % |
| **Settled** (the window's last long task) | 1,656 | **1,183** | −29 % |
| Every feature loaded | 5,536 | 5,220 | −6 % |
| Keys typed from the first screen on: slowest handlers | 4–6 ms | 3–8 ms | same (typing was never blocked) |
| Window long tasks before the first usable chat | 50–107 ms (1–2) | 52–69 ms (0–1) | |
| **First-screen code** (what the window parses before its first frame) | 73 scripts · 2,043 KB · 29 sheets · 451 KB CSS | **70 · 1,857 KB · 28 · 423 KB** | −186 KB JS, −28 KB CSS |
| Data the window took in during its first 8 s (kv reads) | 3.1 MB (2.2 MB Lab scenes, 0.84 MB usage counts…) | Lab scenes' names only when Projects Home shows (a few KB) | |
| Projects Home suggestions (1,600 names) | 60 ms | 42 ms, in an idle moment | |

Idle (`idlecpu`, 10 s each, window wakeups per second / its CPU; budget 1.5, Lab 2):

| Setup | Before | After |
|---|---|---|
| Lab, still scene | 2.0–2.4/s (over budget in one run) · 0.3–0.5 % | **1.1–1.2/s** · 0.2–0.3 % |
| Lab, animated scene paused | 2.2/s (over budget) · 0.3–0.5 % | **1.0–1.3/s** · 0.2–0.5 % |
| Grid of 4 chats (the Lab parked behind) | 0.9–1.8/s (over budget in one run) · 0.1–0.2 % | **1.0–1.2/s** · 0.2 % |
| Chat / board / ◉ Activity | 0.1 / 0.7 / 0.2 per s | 0 / 0.6–0.7 / 0.2 per s |
| **Hidden in the tray, after the Lab** (new setup) | window 0.1/s · main 5.5 timers/min · all processes 0.36 % of a CPU | window **0–0.1/s** · main **0 timers/min** · all processes **0.18–0.27 %** |

## What was found
1. **The first screen waited ≈ 0.3 s for the chats list.** The store thread read and parsed every chat file
   (1,500 files, 140 MB with the long chats) to get each one's title and time. That happens at the first list of
   every start, before the chats list and the chat can be drawn.
2. **The Lab woke the window ≈ 7 times for each preview stats message**, about every 3 s even on a still, dozing
   picture. The stats line was rebuilt from new elements every time. The frame bar rewrote its words and title, and the
   quality chip rewrote its title with the same words. Each of these woke three page-wide observers (usage, a11y,
   cmdbar) and an a11y pass, on top of the message's own frame + timer. With the Lab parked behind a chat (the grid),
   the frame + timer still ran for a line nobody could see.
3. **Hidden in the tray, Hearth already mostly slept.** Most background timers skip or slow down while hidden
   (round 39). Two still ran: the hooks' 30 s clock, even with no time-based hook (the usual case), and the
   config/theme safety net, every 20 s.
4. **The first screen parsed code it doesn't draw:** the node view (nodes.js, 104 KB, and nodes.css, 28 KB) before the
   Lab, the prompt presets (30 KB) that are only read when the prompts are listed, the directors' /commands (21 KB,
   commands only), and every lazy command's argument hint plus every keys-sheet line's words (≈ 33 KB inside
   lazy-data.js).
5. **Projects Home read every Lab scene whole** (2.2 MB with their code) just for their names and times. On a big
   profile, taking that in held the window ≈ 0.1–0.2 s here, right when Home was the first screen. Finding its
   suggestions then worked out every name's key words again for each candidate group.
6. **a11y**: the Lab's Layers box could be focused (Tab) but said nothing about what it was (no role). The rail's
   ⋯ More button was renamed to "🐢 That was slow? It's in here" after a hiccup, so it no longer said "More" (that's
   why the check found no opener).

## Upgrades
### Startup
1. **The chats list is ready almost at once on a big history.** The list's rows (title, time, pin, model) are kept
   between starts in a small file only this computer uses (data/.cache/chat-list.json, never synced). A chat file is
   read again only when its size or times changed. The wait went from ≈ 0.3 s to ≈ 0.08 s, and the first usable chat
   comes ≈ 0.3 s sooner (`storework.js`, `store.js`).
2. **The node view loads right after the first frame**, before the Lab, instead of in front of it (lazy group `nodes`).
   A code block's Nodes button is there from the start and loads it when clicked.
3. **The prompt presets load the first time the prompts are listed** ("/" menu, /prompt…; group `promptlib`).
4. **The directors' /commands** (/director cost, undo, activity, mode, engine…) are listed from the start and load in
   an idle moment (group `directorcmds`).
5. **The lazy commands' argument hints and the keys-sheet lines' words** come with their descriptions, right after the
   first frame (lazy-meta.js). A line waiting for its words shows "…" for those few milliseconds.
6. **Projects Home reads only the Lab scenes' names and times** (a new `kv:pick` read on the store thread: a few KB
   instead of 2 MB). Its search still reads the scenes whole, since it searches their code.
7. **Home's suggestions are found in an idle moment**, and each name's key words are worked out once (60 → 42 ms with
   1,600 names, same suggestions).
8. **The first-screen budget is lowered to what this reached**: 70 scripts, 1,860 KB of code, 28 sheets, 424 KB of
   CSS (`dev/boot-test.js`; it was 73 / 2,050 / 29 / 451).

### Idle
9. **The Lab's stats line changes its words in place**, and the frame bar and the quality chip write their words /
   titles only when they change: no page-wide observer wakes for them any more. The Lab on screen went from 2.0–2.4 to
   1.0–1.3 wakeups/s (budget 2), so idlecpu passes again.
10. **Nothing is scheduled for the stats line while the Lab is parked behind a chat or the window is hidden.** The next
    message after it shows paints it, so a parked Lab no longer wakes the window twice per stats message.
11. **The hooks' 30 s clock runs only while a time-of-day / every-few-hours hook is on** (adding one starts it).
12. **The config / theme safety net checks once a minute while Hearth is hidden** (every 10 s on screen as before;
    the system's file watch reports changes first).
13. **Hidden in the tray after using the Lab, Hearth now uses ≈ 0.2 % of one CPU across all its processes.** The
    window wakes ≈ never, and the main process runs no timers in 10 s.

### Accessibility
14. **The Lab's Layers box says what it is** (a group named "Layers", with its keys) to screen readers and the a11y
    check.
15. **The rail's ⋯ More button keeps its name after a hiccup** ("More · 🐢 That was slow? It's in here"), so Esc and
    keyboard users still find it. a11y passes again.

### For the next streams (dev, not counted)
- `node dev/coldstart-report.js --data <profile> --keys --profile <dir>`: the start on a real-sized profile, with both
  processes' CPU per phase. `dev/cpuprof-sum.js` sums any .cpuprofile / trace by phase. `HEARTH_BOOT_PROBE_BYTES=1`
  names the big kv reads.
- idlecpu's `hidden` setup and its budgets (`hiddenWakeups`, `hiddenMainTimersPerMin`, `hiddenAllCpu`).
- `hub.kvPick(name, fields)`: a big list store's rows with only some fields (the store thread reads it), or null, in
  which case read it whole.
- `dev/store-thread-test.js` covers the kept list rows (a kept row is used, a changed file is read again) and `pick`.

## Not changed (reported)
- **The usage counts (ui-usage, 0.84 MB on the big profile) are read when the first screen is up.** Taking them in is
  ≈ 0.1 s here, just after the first usable chat. chatsteady73 owns that store's size and saves this round, so it was
  left alone. The counts could be read in an idle moment, or kept smaller.
- **native.js stays whole (160 KB of code).** Its sections share one closure (open chats, pending replies, views), so
  splitting off the rarely used parts (talking back, compact / summarize, the chat menu helpers) means exporting that
  state. The risk is not worth ≈ 10–20 KB. jam.js (45 KB) also stays: it registers /song at start on purpose
  (shared with the Lab's /song).
- **The main process at start has no large sync file work left that's safe to move.** Module loading is ≈ 45 ms
  before the window. The temp-file sweep (crashsafe: ≈ 100 folders, ≈ 25 ms on a Windows-slow disk) must finish
  before any store is read, so it stays synchronous. Drawing the app icon (≈ 40–60 ms) happens only on a first launch.
  The light / dark set (≈ 50 ms) happens only on a launch that hasn't learned it yet.
- **After the first usable chat, the feature groups take ≈ 1.5–2 s of the window's main thread over ≈ 4 s**
  (530 files, their CSS and style recalcs), one group per idle moment. No task is over ≈ 130 ms, and typing during it
  stays at a few ms per key. On a real GPU and CPU this is several times shorter.
- **The window's first frame on this machine** comes from software GL presenting (≈ 1.3–1.6 s, the same on both
  builds). It isn't Hearth's code, as round 70 also found.
- `labpace` fails its "a still scene draws ≈ once a second" step (3 draws/s against 2.5) on the base build too, under load
  here: the preview page's own pacing (tools/three-sandbox.html), not touched by this stream.
- `projects-lightweight` needs `HEARTH_LOOPLAG=1`, and run-checks doesn't set it (noted in round 72). Run by hand, it passes.

## Files
- Changed: `storework.js` (kept list rows, `pick`), `store.js` (`getKVPick`, the list's cache path), `main.js`
  (`kv:pick`; the config safety net while hidden), `preload.js` (`kvPick`), `lazy.js` (argument hints and keys words
  from lazy-meta.js), `lazy-data.js` / `lazy-meta.js` (generated; 3 new groups), `index.html` (3 files and nodes.css
  out of the first screen), `native.js` / `chat-cmds.js` (the Nodes button loads the node view), `notes.js` (presets
  read with the prompts), `tools/three.js` (stats line in place, nothing while parked / hidden), `tools/framebar.js`,
  `tools/three-layers.js` (role + name), `jank.js` (More keeps its name), `hooks.js`, `projects.js`,
  `projects-search.js`, `projects-home.js`, `projects-core.js`.
- Dev: `dev/coldstart-report.js`, `dev/boot-probe.js`, `dev/cpuprof-sum.js` (new), `dev/lazy-manifest.js`,
  `dev/boot-test.js` (budget), `dev/checks/idlecpu.js` (hidden), `dev/store-thread-test.js`; docs: `firstscreen.md`,
  `lazy-groups.md`.
- Outside the lane (small, self-contained): projects*.js (coldopen73's area: the scene-name read, Home's idle
  suggestions, suggest's per-name cache), `tools/three.js` / `tools/framebar.js` / `tools/three-layers.js` (Lab files:
  the stats line, frame bar words, a role), `jank.js` (one title), `hooks.js` (its clock).

## Tested
`node --check` on every touched file. Unit: `dev/boot-test.js` (2,908 checks, the new budget),
`dev/store-thread-test.js` (70: the kept list rows, pick), `dev/crashsafe-test.js`, `dev/datasafe-test.js` (104),
`dev/projects-test.js` (13; suggestions byte-identical to before on 1,600 random names). `node dev/lazy-manifest.js`
(✓ names 953, aliases 339, actions 1,402, keys 515, apps 51, tools 9, dups 0). App checks (`dev/run-checks.js
--exact`, under the run lock): **idlecpu ✓** (failed before on the Lab's wakeups; one run in between failed on the
main process at 1.1 % against 1 in one setup, load), **a11y ✓** (failed before: noRole, Esc), **lazy ✓**,
**chatperf ✓**, hooks ✓, framebar64 ✓, nodes-code ✓, nodes-lab ✓, nodes-shader ✓, flows ✓, chat-cmds ✓, labkeys ✓,
qa-commands ✓, commands-page ✓, projects ✓, projects-lightweight ✓ (by hand, with HEARTH_LOOPLAG=1); labpace ✖ on
base and new alike (above). By hand after the start: 515 keys-sheet lines with words (as before), 703 commands with
their argument hints, the 169 prompt presets and 12 categories, the node view in.

## For the patch notes
- **Hearth starts faster with a big history.** It now remembers the chats list between starts instead of reading
  every chat again, so the chats and your chat box are ready about a quarter sooner (here: 1.26 s → 0.94 s with
  1,500 chats).
- **Less to load before the first picture.** The node view, the prompt presets and some rarely used commands load
  right after the window appears instead of before it (about 9 % less code at startup). Everything still works from
  the first moment.
- **Projects Home opens lighter.** It no longer loads every Lab scene's code just to show their names, and its
  suggestions are worked out once the page is calm.
- **The Lab is quieter when you're not touching it.** Its little fps line no longer wakes the whole window every few
  seconds, and nothing runs for it while it's hidden behind a chat.
- **Hidden in the tray, Hearth now sleeps.** It uses about 0.2 % of one CPU across all its parts, with no timers
  ticking for nothing (a hooks clock and a settings check slowed down or stopped).
- Screen readers: the Lab's Layers box says what it is, and the ⋯ More button keeps its name after a hiccup.
