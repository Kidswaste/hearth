# Power-wise (round 39, powerwise): awake only while it matters, quiet in the background, lighter on battery

You use Hearth on a Mac laptop and a Windows PC. This round is about how Hearth treats their power:
- It keeps the computer awake only while something long runs, and lets go the moment it ends.
- It does almost nothing while it sits in the background.
- On battery it goes lighter by itself.
- After a sleep it wakes up calmly.

Nothing new shows on screen unless something is being kept awake, and nothing is added to any prompt (0 tokens).

New files:
- `powerwise.js`: the pure core (UMD: the main process and the tests require it) plus the window part (`Power`).
- `powerwisemain.js`: the main side (powerSaveBlocker, the computer's state, holds for AI turns / downloads / updates, test hooks).
- `powerwise.css`: the ☕ indicator.
- `dev/powerwise-test.js` (UNIT) and `dev/checks/powerwise.js` (`sh dev/run-checks.sh powerwise`).

## Measured (before → after)
`dev/checks/powerwise.js` part 4 and a scratch copy of it run on this round's starting commit. Each run is a throwaway
copy under Xvfb. The Lab was opened (scene drawn) and left, then the window was hidden (`win.hide()`: the page is
`document.hidden`, background throttling on), 10 s to settle, then 60 s counted. Counters were installed before the
app's own scripts: every timer / interval / animation frame / idle callback that ran in the page, and every
`setTimeout` / `setInterval` callback in the main process plus `fs.watchFile` stat polls.

| Wakeups per minute | Before | After |
|---|---:|---:|
| **Hearth in the background, plugged in: the page** | **48** (the Lab's stall check 24 + its idle callbacks 12, the Lab's media memory 10, hooks 2, sleeping websites 1) | **1** |
| Same: the main process | 0 JS timers + **24 stat polls** (config.json / theme.css every 5 s) | **4–6** timers, **0** stat polls |
| **In the background on battery: the page** | 48 | **1** |
| Same: the main process | 24 stat polls | **2–4** timers |
| On screen, idle (a chat in front, the Lab opened earlier) | 81 | ≈ 50 (the Lab's park safety check every 10 s instead of 2 s while it's parked; the rest on the same pace) |
| While a reply streams with Hearth hidden: the token meter's repaints | ≈ 44 / min (8 a second at peaks) | 0 (one repaint when you're back) |
| A render / export / All formats / long AI turn / big download / update | the computer could sleep mid-render (nothing kept it awake) | kept awake for exactly that long, released at the end (0 ms later in the check) |
| After a wake | timers that came due during the sleep all ran at once; sync looked 3 s after the wake; the updater could check before the network was back | nothing for 20 s, then one timer every 4 s; sync waits 15 s; the updater waits ≥ 60 s |

The Lab preview's own page is labpace's: it doesn't draw while parked and asks for one frame in 2 s. It wasn't
changed here.

## Upgrades

### Awake only while it matters
1. **A render keeps the computer awake.** This covers Lab sequence renders, exports, footage cuts, saved loops and
   every job in the render queue. The computer won't sleep halfway through. The moment the last one ends (done, failed,
   cancelled or paused), it may sleep again.
2. **▦ All formats batches** keep it awake for the whole batch, not file by file.
3. **Recordings keep the screen on as well** (the screen-sleep blocker). Only recordings and Present do that.
4. **Present** (the Lab preview full screen) keeps the screen on while it lasts.
5. **The Stage window** (the Lab on a second screen) keeps the screen on while it's open.
6. **Long AI turns**: a reply still running after 45 s keeps the computer awake until it ends. This works with Claude or
   Astra, docked directors included. It ends on done, error or ■ Stop. Short answers never touch it.
7. **Big downloads** from website agents and app windows keep it awake. Anything over 50 MB holds at once. A download
   of unknown size holds once it has run 20 s.
8. **Hearth's own update** (⬆ Update) keeps it awake while it pulls and applies.
9. **The ☕ indicator** sits in the rail's status corner (next to ⇪ renders / the progress dot / sync) and shows only
   while Hearth keeps the computer awake. Hover says why: "Keeping your computer awake: rendering", "… rendering and an
   AI is working", "Keeping your screen on: recording".
10. **Click the ☕**: what's holding it and for how long, the power mode, and **Let the computer sleep anyway**. That
    releases at once; what runs keeps going until the computer sleeps.
11. **`/power`** (and Ctrl/⌘+K "Power: what keeps the computer awake, battery") says what keeps it awake, the power mode
    and the background checks' pace. `/power sleep` lets it sleep.
12. **Always released**:
    - the page that asked reloads, crashes or closes: its holds go;
    - every hold has a time limit (renders 12 h, recordings 6 h, Present 8 h, AI turns 3 h, downloads 4 h, updates 30 min);
    - quitting releases everything.

    Two needs at once still make one system blocker. When the kind changes (a recording ends during a render), the new
    kind starts before the old one stops, so there's never a gap.

### Quiet in the background
13. **The updater** checks only while Hearth is on screen, on the shared schedule. It used to wake every 30 min to see
    that the window was hidden.
14. **The Lab's stall check** (every 2 s) and **its media position memory** (every 5 s) stop while Hearth is hidden.
    While the Lab is parked behind a chat, the stall check (then only a safety net) runs every 10 s.
15. **Hooks' clock** (time-based ⚡ hooks) and **sleeping websites** run on the background schedule: half pace minimized
    or on battery, never more than a minute late for a hook, nothing while the computer sleeps.
16. **Chrome views' visibility check** (every 1.5 s per view) stops while Hearth is hidden. The visibility event covers it.
17. **config.json / theme.css safety net**: before, each file had a stat every 5 s, always (24 polls a minute). Now there's
    one calm check every 10 s on screen, 20 s minimized, none asleep. Edits still arrive within ≈ 0.1 s through the
    system's file events.
18. **Waiting tips** no longer re-check every 0.7 s while Hearth is in the background (Hints). They look again when you're back.
19. **The token meter** doesn't repaint while Hearth is hidden (it ticked up to 8 times a second during a streaming
    reply). It repaints once when you're back.
20. **Background throttling** is kept on for the hub window and app windows (checked). Only the Stage window and
    short-lived capture / test windows turn it off, on purpose.

### Lighter on battery
21. **On battery, lighter by itself**:
    - Full motion moves like Calm (ambient loops and glints stop). This isn't saved: plugged in, it's Full again.
    - Background checks run at half pace (the updater hourly, hooks / websites / config slower).
    - Sync's calm check is 3× calmer (as before).
22. **Battery saver / Low Power Mode**: the Mac's Low Power Mode (`pmset`) and Windows' battery saver
    (GetSystemPowerStatus) count too, even when plugged in, and go lighter still (a third of the pace). They are read on
    power events and when the window comes to the front, at most every 10 min, never on a timer.
23. **The Lab steps down for the saver too.** It already did on battery (60 fps at most, 85 % resolution). Renders stay
    full quality.
24. **No warm Lab page on battery.** labboot's preloaded preview isn't made; the Lab opens the usual way.
25. **One calm note the first time** (through Hints, never over your work): "On battery: Hearth goes lighter by itself…".
    Plugged in, everything is back at once.

### Sleep and wake
26. **Asleep (or locked): no background timer runs**, in the window or the main process. Nothing piles up to run later.
27. **After a wake, no burst**: timers wait 20 s for the network and the disk, then go one at a time, 4 s apart.
28. **The updater waits at least a minute after a wake**; **sync waits 15 s** (was 3 s), and changes the cloud drive
    brings in meanwhile wait for the same moment.
29. **A sleep the system didn't announce** (a timer firing far later than asked) is treated as a wake, the same calm way.
    Cut-off replies are the offline stream's (it already resumes them).

29 upgrades.

## Timer audit (period → now)
- Sync (syncmain.js): self-pacing 1–5 min, ×3 battery, ×2 minimized, none asleep (round 16) → also slower on the saver;
  wake pass 3 s → 15 s; watcher passes wait for the same moment after a wake.
- Updater (updater.js): 30 min `setInterval`, skipped while hidden (it still woke) → Power.every, on screen only, hourly
  on battery, ≥ 60 s after a wake.
- Engine health (engine-health.js): one-off checks at start; the ffmpeg-install watcher (3 s) only while an install
  runs → left.
- Chrome view (chromeview.js): 1.5 s poll per view → only while on screen. Hearth's Chrome idle quit (chromemain.js,
  75 s, only while Chrome runs) → left.
- Labboot warm page (tools/three-boot.js): one-off at start, parked, let go after 15 min → not on battery.
- Hints (hints.js): 0.7 s while something waits, even hidden → not while hidden.
- Safetynet (safetynet.js): saves are debounced on changes (event-driven), no interval → left.
- Hooks 30 s, sleeping websites 60 s, the Lab's media 5 s and stall 2 s → Power.every (see above).
- Main: config / theme `fs.watchFile` 5 s ×2 → one 10 s check on the schedule. Jank watch's lag sampler (100 ms) runs
  only on screen and awake (round 20) → left. Engines' batch / pulse timers only while a reply runs → left.
- Meter repaints → not while hidden. Progress bars, Activity, capture, recordings: only while something runs (round 16) → left.

## Tests
- `node dev/powerwise-test.js` (UNIT, 83 checks), on fake clocks, covers:
  - holds counted per reason, one blocker, the display kind only for Present / recordings, start-before-stop on a kind
    change, a double release, owners, time limits, let it sleep, quit, a blocker that throws;
  - the words;
  - the policy;
  - pmset / battery saver parsing;
  - the pace (battery / saver / hidden / skip / asleep / max);
  - the wake line-up (settle, one at a time, the updater's minute) and an unannounced sleep (timers an hour late, one
    at a time after the settle), while a hidden page's minute-late timer isn't mistaken for a sleep;
  - the main side through its IPC (a page reloading / crashing / closing, a #hash navigation, AI turns short / long /
    two / replaced, big / small downloads, an update that throws, battery / saver told to the window and bgmain, main
    timers paused asleep and waiting after a wake);
  - a lint that the timers stay on the schedule.
- `dev/checks/powerwise.js` (smoke, `--fake-engines`; Electron's blocker swapped for a recording stub, so nothing keeps
  the test machine awake) covers:
  - a render holds then releases;
  - the ☕ (words, place, size) shows and goes;
  - two renders and All formats;
  - a recording (display kind), recording + render, then the render alone;
  - a real long AI turn (fake engine) held past its threshold and released on ■ Stop, a turn released when done, a
    short turn never;
  - a big and a small download, the update, let it sleep, a time limit;
  - a page reload dropping its holds;
  - battery (data-power, Calm motion not saved, the window's and the main process' timers at half pace, bgmain / sync
    told, the note once), plugged back, the saver;
  - sleep / resume (nothing runs asleep, everything waits ≥ 15 s after, one at a time, the updater ≥ 60 s, main timers too);
  - the background wakeups budget (page ≤ 6 / min, main ≤ 12 / min and no stat polling, battery no worse).
- Also run: labpace, labadapt, offline, capture-pack, updater, sync, lightweight, lazy, unit:boot-test, fastboot
  (results in the final report).

## Edits outside this lane (small, additive)
- `main.js`: the first require, register, the AI-turn hook in engine:send, the Stage window's hold, the config safety
  net on the schedule.
- `preload.js`: `hub.power`.
- `index.html`: one script and one stylesheet.
- `bgmain.js`: the `saver` field and `_set`.
- `syncmain.js`: the saver and the wake settle.
- `updatermain.js`: the update hold.
- `appshell.js` / `appsmain.js`: one line each for downloads.
- `updater.js`, `hooks.js`, `renderer.js`, `chromeview.js`, `tools/three.js` (timers on the schedule, the Lab hears
  the saver), `tools/three-boot.js` (no warm page on battery), `hints.js`, `meter.js` (nothing while hidden),
  `look.js` (Full → Calm while lighter).
- `dev/run-checks.js`: the unit test and the `powerwise` group.

## Caveats
- The real powerSaveBlocker, Low Power Mode and battery saver weren't tried on a real Mac / PC here. The blocker is
  Electron's own; the saver checks are `pmset -g` and one PowerShell line (≈ 1 s, only on battery, on events).
- A blocker can't stop a lid close or a user-chosen sleep (the system decides); it stops the idle sleep.
- Chromium's battery API (the Lab's own signal) and the main process' battery state can disagree for a moment after
  plugging in. Either one makes the Lab lighter.
- The ☕ adds one small button to the rail's status corner, and only while something is kept awake.

## For the patch notes
- Hearth now keeps your computer awake while it renders, exports, makes All formats, records, presents, downloads
  something big, updates itself or an AI works on a long answer, and lets it sleep again the moment that's done.
- A tiny ☕ in the rail's bottom corner shows while it does ("Keeping your computer awake: rendering"). Click it to see
  why, or to let the computer sleep anyway. `/power` says the same.
- Recordings and Present (and the Stage window) also keep the screen on. Everything else lets the screen sleep as usual.
- In the background Hearth is far quieter: about 1 wake-up a minute in the window instead of ~48, and no more disk
  polling every few seconds.
- On battery (and with Low Power Mode or Windows battery saver) Hearth goes lighter by itself: calmer animations, slower
  background checks, a lighter Lab preview, no preloaded Lab. Plugged in, it's all back at once. A calm note tells you
  the first time.
- After your laptop wakes, Hearth waits a moment for the network, then picks things up one at a time. Sync and the
  updater no longer rush in.
- Caveat: tested with a simulated battery, sleep and blocker. Try it for real: start a long render on the Mac with the
  lid open and watch the ☕, unplug to see the lighter mode.
