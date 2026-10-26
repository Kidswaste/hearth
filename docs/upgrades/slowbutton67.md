# slowbutton67: 🐢 That was slow (round 67)

The owner reports hiccups of 1–2 s "every few seconds, about everywhere", and round 65 shipped fixes for them
(uilag65, mainhang65) without anyone knowing yet whether they worked. Until now the only way to report one was
typing /smooth, and the owner doesn't use commands. This stream adds a button you click right after a hiccup. It says,
in plain words, what that hiccup was. It also keeps a small daily count so you can tell whether an update helped.

## What shipped
1. **That was slow** is the first row of the rail's **⋯** (bottom left, on every screen), with the clock icon. Its
   tooltip says "Click right after a hiccup".
2. **The ⋯ turns amber after a hiccup of a second or more** and stays amber for 2 minutes. Its tooltip then reads
   "🐢 That was slow? It's in here". The amber goes away when the card opens, or at the first click or key press after
   those 2 minutes. No timer runs for this.
3. **Help menu › 🐢 That was slow…** (on the Mac the menu bar is always there; on Windows press Alt to show it).
4. **The card** says what the last hiccup was in one sentence: "The last hiccup: 1.4 s, while you were in the Lab
   (main process busy with your settings)." Under it are the details: which process was stuck and on what, the time,
   whether the Lab preview was drawing then and now, how many hiccups there were in the last 30 s and the worst one,
   and the main process's worst delay when the hiccup was elsewhere. It ends with one plain next step.
5. **The cause is picked from what saw the freeze, strongest witness first:** a main-process IPC handler that ran long
   (named, e.g. "your settings", "reading or saving app data", "the Sound desk"), then the main process answering the
   window late (with a background job that had just started, e.g. a cloud sync pass), then the graphics card resetting
   a drawing, then the Lab preview's slow frame, then the window's own frame (script / layout / paint), then a click
   that waited while the window was idle.
6. **📋 Copy report for Claude** puts a report on the clipboard: times, every sighting with its numbers, slow main
   handlers by channel, the loop-lag sampler, the daily counts and the machine. Nothing is sent anywhere.
7. **Hiccups over 500 ms today: N (yesterday: M)** shows on the card with a 7-day bar row. It is kept on this computer
   only (localStorage `jank.hiccups`, two weeks) and written only when a hiccup happens. One freeze seen from several
   sides (a long frame, the click that waited, the main process answering late) counts once. Freezes while Hearth
   starts (before its first screen is up) aren't counted.
8. **🪶 Light mode for the Lab** shows on the card when the hiccup was the Lab preview or the graphics card. **▶ Turn
   the watch back on** shows when the smoothness watch is off.
9. **Whole day…** opens the full smoothness report (the existing /smooth view).
10. A second way in: Ctrl/⌘+K "🐢 That was slow" and `/slow` (`/slow copy` copies straight away).

## How it stays free until clicked
- No new timer, observer, poll or profiler. jank.js's existing observers (Long Animation Frames, Event Timing,
  `webglcontextlost`, the Lab preview's stats message) also push what they already saw into a ring buffer of the last
  minute (at most 120 small objects). The card, its summariser and its CSS load on first use (lazy group
  `jankwatch`, with /smooth's report).
- Main process (jankmain.js):
  - `watchIpc(ipcMain)`, called from the top of main.js, times every IPC handler's synchronous part (two clock reads
    per call) and keeps those that ran 100 ms or more, by channel.
  - The window's existing "busy" messages now carry their send time, so a message that arrives 250 ms or more late
    shows the main process was stuck.
  - A cloud sync pass that starts gets noted.
  - GPU and page events are kept for the card without being consumed.
  - `hub.jank.recent()` returns all of this. Nothing in the main process runs until something is slow or the card
    asks.
- Main-process freezes of 500 ms or more go into the daily count when the card opens, and at the watch's usual save
  (`take()` now hands them over).

## Limits (honest)
- An `async` IPC handler is timed only up to its first `await`. A main-process freeze outside any IPC handler (a
  timer, a file watcher) is seen only if a "busy" message was waiting at the time, which is usually the case when you
  are clicking or typing through it. It is named only by a background job noted nearby. The loop-lag sampler's worst
  delay since the last save is shown as context.
- Hearth's own scripts are file:// URLs, which Chromium's Long Animation Frames leave unnamed. The card then says "the
  window busy running scripts" (the report says so too). /smooth profile can still name them on request.
- First-screen JS budget raised from 2,330 to 2,333 KB (the recorder has to run from the start). Stale comments in
  jank.js were shortened to make room. The reason is in docs/upgrades/firstscreen.md.

## Files
- New: `slowcard-core.js` (the summariser, pure), `slowcard.js` + `slowcard.css` (the card, lazy group `jankwatch`),
  `dev/slowcard-test.js` (16 unit checks, in `UNIT`), `dev/checks/slowbutton67.js`, and the `slowbutton67` group in
  dev/run-checks.js.
- Changed:
  - `jank.js`: the last-minute ring, the daily count, the amber ⋯, `Jank.slow()`, `Jank.openCard()`.
  - `jankmain.js`: `watchIpc`, the late-message stamp, `mark`, `recent`, `jank:recent`, and `jank:test-stall` (only in
    test copies).
  - `main.js`: one line at the top. `preload.js`: `jank.recent`, `jank.testStall`, and `busy` now sends its time.
  - `simplify.js`: the ⋯ row. `simplify.css`: the amber tint.
  - `nativefeel-core.js` / `nativefeelmain.js` / `nativefeel.js`: the Help menu row.
  - `lazy-data.js` + `lazy-meta.js` (manifest), `dev/boot-test.js` (budget). No Codex files touched.

## Tested
- `node dev/run-checks.js slowbutton67`: slowbutton67, unit:slowcard-test, jankwatch, tidy, lazy and unit:boot-test
  pass. The check, in a throwaway profile:
  - makes a 1.1 s window freeze: the ⋯ turns amber and it counts once;
  - makes a 1.5 s main-process freeze while the window reports busy: the handler is named, the message arrives about
    1.4 s late;
  - opens the card by real clicks on ⋯ › That was slow. It reads "The last hiccup: 1.5 s, while you were in Projects
    (main process busy with a test freeze (made on purpose))." and "Hiccups over 500 ms today: 2 (yesterday: 4)",
    with 7 bars;
  - copies the report (checks the text) and closes the card. /slow opens it too. No profile was taken, and the ring
    stays small.
- qa-commands passes (no duplicate command).
- unit:datasafe-scan and unit:winmac-test fail on files this stream didn't touch: `tools/quest-chat.js`,
  `cloud-files.js` and `sync-engine.js` (Codex's failing scans, sweep67's lane).

## For the patch notes
- **New: 🐢 That was slow.** When Hearth stutters or freezes, click the **⋯** at the bottom of the left rail, then
  **That was slow**. A small card says what the last hiccup was in plain words, for example "The last hiccup: 1.4 s,
  while you were in the Lab (main process busy with your settings)".
- After a freeze of a second or more, the **⋯ turns amber** for two minutes so you know where to click.
- On the card, **📋 Copy report for Claude** copies the details. Paste them into a Claude chat so the next update can
  fix exactly that. Nothing is sent anywhere by itself.
- The card also counts **hiccups over 500 ms today, next to yesterday's**, with a small bar for each of the last 7
  days. It's an easy way to see whether an update made Hearth smoother.
- It's also in the **Help** menu (on Windows, press Alt to show the menu bar).
- It costs nothing while you don't click it: it only reads what Hearth's smoothness watch already notes, and it never
  starts a recording that could freeze Hearth itself.
