# Background calm (round 16, bgperf): near-zero cost when nobody looks, lighter app windows, a faster big board

You asked: "focus on framerate and making things lightweight". This stream took the work Hearth does when you are
not touching it: every timer, watcher and poller in the window and in the main process, the app windows, the mood
board's pan / zoom and the cloud sync.

Measured before → after (headless copy, same machine, `node dev/bgperf-report.js` for whole-app CPU per process and
memory, `dev/checks/board-perf.js` with 200 items; this machine renders with SwiftShader on a shared CPU, so the
GPU numbers are software drawing and everything is noisy: compare the order of magnitude):
- **Idle, a chat open for 60 s, nobody touching it: 240 → 17 ms of CPU per second** for the whole app (graphics
  process 230 → 12, main process 2.7 → 1.3, the page 6.7 → 3.2). The cause: the blinking cursor in the chat box
  redrew the whole window twice a second, forever. Minimized, Hearth costs about 1 ms/s.
- **Three app windows open: 680 → 615 MB**; closed (hidden): three live pages kept for 5 minutes → at most two kept,
  the third freed after 20 s, all freed after 3 minutes (551 MB with three hidden before; 532 MB after 36 s, and back to
  ≈ 250 MB once parked). On this test machine a hidden window still kept the graphics process busy (2 s of CPU a
  second): freeing them sooner removes that entirely.
- **Board with 200 items, trackpad pan + pinch zoom: frame time p50 216–283 → 117 ms, p95 683–967 → 267 ms**
  (≈ 4 → 8.6 fps on the software renderer; on a real GPU this is the difference between hitches and none), style
  work while panning 1936 → 640 ms, layer building 2574 → 961 ms, paint 1493 → 274 ms, mid-gesture "settles" 90 → 48.
- Main process: config.json / theme.css were checked 5 times a second (2 files × every 400 ms): now the OS tells
  Hearth, with one calm check every 5 s as a safety net. Each message no longer reads config.json from disk nor looks
  for the Claude / Codex program again.
- Startup and the page's own idle (dev/perf-report.js) are unchanged by this stream (≈ 0 ms busy per second at idle).

## The idle window
1. **A steady cursor when you're away**: after 12 s without a key or a click, the chat box's cursor stops blinking
   (still shown, just steady); the next key brings the blink back. The whole window no longer redraws twice a second
   while you read or think (graphics process 230 → 12 ms/s). Nothing changes while you type.
2. `/background`: what Hearth does in the background right now (on screen / minimized, battery, sync pace, app
   windows on screen and hidden, replies running) and how much memory and CPU each part takes (main, pages,
   graphics, helpers).
3. "Background: what runs now, memory per part" in the Ctrl+K palette (same report).
4. The flows' "is a step hung?" check (every 5 s) now only runs while a flow runs; an idle Hearth has no 5 s wake-up.
5. A board clip that was playing (a selected video) stops when you switch to a chat or a tool, instead of decoding
   behind it.

## The main process (the part that talks to the disk and the engines)
6. config.json and theme.css edits from outside (an editor, sync) are noticed through the system's file events
   (re-armed when an editor replaces the file) instead of checking both files every 400 ms; still noticed within
   ≈ 0.1 s, a 5 s safety check covers drives without file events.
7. Every message read config.json from disk (sending, quick asks, settings): now one file stat, and a read only when
   the file changed.
8. Where Claude Code / Codex is installed is remembered: a message no longer searches PATH (and, on a Mac without the
   command on PATH, the desktop app's version folders) before it starts. A changed path in Settings → Engines, a new
   install choice, a missing file or 5 minutes look again.
9. Time limits of the agents' tool calls (up to 45 minutes for renders) end with the answer instead of lingering.
10. "What's playing" on a Mac (Lab → live sound): Spotify is asked every 1.5 s only while it plays and Hearth is on
    screen; paused, closed or Hearth minimized: every 5 s.

## Cloud sync
11. The calm sync check slows down when nothing changes: every minute while things move, then every 2, 3… up to 5
    minutes after quiet passes (your changes still sync within seconds: the folder watchers bring them).
12. On battery the calm check runs 3× less often, and changes wait for a longer quiet moment.
13. Minimized, the calm check runs at half pace.
14. Asleep or locked: no checks at all; one pass a few seconds after the computer wakes.
15. While a reply streams (its chat file is saved again and again), sync waits for a quieter moment (up to a minute
    instead of 20 s), so a long reply isn't scanned and copied a dozen times.
16. A pass where nothing moved no longer rewrites the sync state file (every file's fingerprint) each minute; the
    clocks in it are saved every 10 minutes. (Files were already compared by size + modified time first and only
    hashed when those changed.)

## App windows (Meshy, Suno, Figma…)
17. A hidden app window's page is muted (pages that ignore the pause, autoplay); shown again, it's unmuted.
18. At most 2 hidden app windows stay alive: hiding a third frees the oldest hidden one after 20 s (it reopens where
    it was, signed in).
19. Hidden app windows are freed after 3 minutes (was 5); with Hearth minimized or the computer asleep, after 1 minute.
    A page still playing sound always waits.
20. `/apps free` (or `/background free`) frees every hidden app window now.

## The mood board
21. Panning keeps the board as one ready-made layer between pans: a pan right after a pan repaints nothing. Only a zoom
    re-draws the pictures sharp at the new size, once, when you stop.
22. The board waits for the view to really stop (140 ms and two drawn frames) before tidying up: on a big board a slow
    frame no longer ended and restarted the move at every scroll step.
23. Frame titles keep their size on screen without restyling every item on the board at each stop (the setting now
    lives on the frames only).
24. The shimmer of items still loading pauses while you move without restyling every picture.

## Audit: every timer / watcher / poller (period → now)
Main process
- config.json + theme.css: `fs.watchFile` 400 ms × 2 → `fs.watch` (event) + 5 s stat safety net (#6).
- Sync (`syncmain.js`): calm check `setInterval` 60 s → self-pacing 1–5 min, ×3 battery, ×2 minimized, none asleep
  (#11–14); folder watchers `fs.watch` recursive, debounced 2.5 s local / 4 s cloud, at most 20 s (60 s while a reply
  streams or on battery, #15).
- Now playing: Mac `osascript` every 1.5 s → 1.5 / 5 s (#10); Windows: one PowerShell loop at 1.5 s, only while the
  Lab's "what's playing" is on (left).
- App windows: park timer per hidden window 5 min → 3 min / 1 min / 20 s (#18–19); Meshy job poll 4 s only while a job
  runs; download progress ≤ 2.5 updates/s; paste answer limit 15 s (one-shot).
- Engines: an idle-kill timer per running reply (50 min), network retry 3 s, quick checks 10 s, the install-window
  watcher while an install runs; MCP tool servers live only as long as their reply.
- Game bridge: one limit per tool call, 60 s–45 min → cleared on answer (#9).
- `fsapi` folder watchers (Video Review folders, Forge live build, Adobe): `fs.watch`, debounced 300 ms (events only).
- Window state save: debounced 500 ms (events only). Capture / render queue: timers only while recording / rendering.
Window (renderer)
- Flows hung check: 5 s always → only while a flow runs (#4).
- Progress bars: 250 ms only while a bar exists; recording clock 1 s only while recording; a busy chat's status line
  1 s only while it works; comp parts watcher and Studio render watch 3 s only while something works.
- Updater: 30 min, skipped while hidden. Sleeping websites: 60 s (one cheap pass). Video Review's list: 20 s, works
  only when visible. App suggestions: one 20 s timer after a view change.
- Lab (left to its stream, all cheap early-returns): remember the media position 5 s, preview-stall watcher 2 s,
  Present HUD 250 ms (only in Present), look cycling (only when on), key repeat 100 ms (only while held), motion
  sliders 33 ms (only when on), sequence guard / shuttles (only while used).
- Board: save debounce 400 ms, settle 140 ms + 2 frames, clip previews only while hovered / selected / on screen.
- Electron: the hub and app windows keep background throttling on (hidden pages: timers at most once a second, no
  animation frames, checked: 0 frames/s in hidden app windows); the Stage window keeps it off on purpose (steady frames
  for the Lab sketch).

## For developers
- `node dev/bgperf-report.js [--seconds 60] [--json out.json] [--probe]`: whole-app CPU per process type and memory
  (PSS) from /proc: idle, three app windows shown, then hidden (`--probe`: where idle GPU time goes, hidden pages'
  frame rate).
- `dev/checks/bgperf.js`: the steady cursor and its return on a key, the board layer kept after a pan / dropped after a
  zoom, `--inv` on frames only, the hidden cap, `/background`, `/apps free`.
- `dev/checks/board-perf.js` takes `window.BOARD_PERF_N` (200 for the numbers above).
- `bgmain.js` (main): `subscribe(fn)` gets `{ hidden, battery, asleep }` changes (sync, now playing and app windows use
  it); `engines.busy()` = replies running.

24 upgrades.
