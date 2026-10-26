# bugbutton68: 🪲 Something broke (round 68)

The owner wrote "restart hearth pls it bugged" with no details. He doesn't use commands and finds bugs hard to
describe. Round 67 gave him a button for hiccups (🐢 That was slow). This round adds the same kind of button for
breakage. **🪲 Something broke** says in plain words what went wrong lately. It copies a redacted report for Claude in
one click, and it can restart Hearth or reload just the window from the same card.

## What shipped
1. **Something broke** is in the rail's **⋯** (bottom left, on every screen), right under "That was slow". It has a
   new bug icon. Its tooltip reads "What went wrong lately, Copy report for Claude, Restart Hearth".
2. **Help menu › 🪲 Something broke…** sits under "🐢 That was slow…". On the Mac the menu bar is always there; on
   Windows press Alt to show it.
3. **The card** starts with one sentence for the newest problem, when it happened and where you were. For example:
   "Something in the window broke, just now, in the Lab." Then come the counts since Hearth started, in words like
   "1 window error, 1 failed request and 1 program stopped". Then the list: the time, a plain sentence plus the
   (redacted) message, and the page that was on screen. The same problem again counts up (×3) instead of repeating.
   When nothing went wrong, it says "Nothing broke that Hearth could see since Hearth started 2 h ago."
4. **What it notices:**
   - errors in the window (uncaught errors and failed background steps)
   - error messages that were shown
   - replies that failed (with the AI's name)
   - the main process's own JS errors
   - requests from the window that failed, named in plain words where 🐢's list knows them ("reading or saving app
     data")
   - the graphics card's process stopping, and a WebGL view (the Lab preview) losing the graphics card
   - the window's page crashing, or the window not answering
   - a program Hearth runs stopping on its own: Claude's or Astra's engine program, Astra's app-server, the VST plugin
     host, the After Effects bridge, and Chromium's network and audio helpers
5. **📋 Copy report for Claude** puts the report on the clipboard. It has the version and system, the times, every
   problem with its kind, page, channel, program, exit code and the first 4 stack frames. Nothing is sent anywhere.
6. **↻ Restart Hearth** uses the existing restart: work is saved first and the quit counts as clean.
7. **Reload this page only** reloads the window alone. It goes through Freshen, so the screen, chats, drafts and the
   Lab scene come back. It is greyed out (the tooltip says why) while a reply is being written, a render or recording
   runs, or ▶ Play is open.
8. **After Hearth closed unexpectedly** (a crash, a forced quit, the computer turning off), the next start shows one
   note: **"Hearth closed unexpectedly last time"** with **🪲 See what happened**. If the window's page crashed and
   reloaded by itself, the note reads "Hearth's window crashed and came back". It shows once, through Hints, as a
   notice queued with the other notes.
9. **The saved report:** See what happened opens the card on what went wrong before the close. For example: "Hearth
   closed unexpectedly last time (last sign of life 17:39). Before that: 2 window errors and 1 program stopped", with
   the list. If nothing was recorded, it says that a forced quit or the computer turning off looks like this. The
   last 3 reports are kept, and the card links to the older ones ("Earlier: Hearth closed unexpectedly · Mon 17:39").
10. **Redacted everywhere** (on the card, in the copied report, on disk):
    - folders: only the Hearth folder's name and what's inside it are kept (`C:\Users\…\Hearth\tools\three.js:120` →
      `Hearth/tools/three.js:120`); any other folder becomes `[path]`, keeping only a program or code file's name
    - the computer's user name
    - keys, tokens and passwords (`sk-…`, `ghp_…`, Bearer, JWTs, `password=…`, `api_key: …`, long random strings)
    - e-mail addresses
    - web addresses beyond their host
    - quoted text long enough to be someone's words (chat text), and quoted prompt / message / text fields
11. Also in Ctrl/⌘+K ("🪲 Something broke: what went wrong lately"), and as `/broke` (`/broke copy` copies straight
    away).
12. Fix: on Windows, when After Effects couldn't be started, the bridge threw an uncaught main-process error (Electron's
    error box). That failure is now noted and listed on the card.

## How it stays free until something goes wrong
- No timer, poll or observer was added. Only listeners, which do nothing until an error happens:
  - Main process:
    - `process.on('uncaughtExceptionMonitor')`. It only observes, so Electron's own error box still shows as before.
    - `process.on('unhandledRejection')`. Electron's main process runs in "warn" mode, so its warning still prints;
      checked in a scratch Electron run.
    - `app` `child-process-gone` / `render-process-gone` / `unresponsive`.
    - jankmain's existing IPC wrapper now also hands over a handler that throws or rejects (one extra rejection
      handler per `ipcMain.handle` call). Electron still answers the window with the error.
  - Window: DevReportHooks already keeps every page error, rejection, error toast and failed reply. Its `note()` now
    passes each new one to `BugWatch.add` (one line). A `webglcontextlost` listener and a wrapper on `Jank.gpu` cover
    the graphics card.
- The ring holds at most 40 problems. A problem goes to `data/bugbutton/live.json` 400 ms after it happens (a burst is
  one write). The main process's own errors are written at once. Writes are atomic (crashsafe-core). The folder is
  local-only for sync.
- At start, safetynet's session marker says whether the last run ended unexpectedly. If it did, that run's
  `live.json` becomes a saved report, redacted again on the way. `saved.json` is read through datasafe-core: a file
  that is there but can't be read is never written over.
- The first screen is unchanged: still 72 scripts, 2,334 KB of the 2,336 KB budget. `bugwatch.js` is in the
  `errorcalm` lazy group (loaded right after the first frame); the card (`bugcard-core.js`, `bugcard.js`,
  `bugcard.css`) is in `jankwatch` (loaded on the first click, with 🐢's card). The first-screen files gained one line
  (devreport-hooks.js), one menu row (simplify.js), one icon (icons.js) and one menu action (nativefeel.js).

## Limits (honest)
- A hard crash of the whole app (native, out of memory, power loss) can't be described: the report then lists what
  went wrong *before* it. If nothing went wrong before, it says so.
- An `async` IPC handler registered with `ipcMain.on` is caught as an unhandled rejection (a main-process error), not
  as a failed request.
- Redaction is pattern-based. Unquoted chat text inside an error message would get through, but Hearth's errors don't
  carry it. Messages are cut to their first line (240 characters; 160 for toasts and replies).
- A failed request whose error is "file not found" (`ENOENT`) or a cancel is not listed. Hearth asks "is this file
  there?" this way all the time.
- Seen while testing: toasts sit above open dialogs, so a toast at the bottom right can cover the right end of a wide
  dialog's buttons. The card keeps 🐢's width so its Close stays clear. This affects other dialogs too: next round.

## Files
- New:
  - `bugcard-core.js`: redact, frames, entry, summarise, report (pure; Node + window).
  - `bugmain.js`: the main side.
  - `bugwatch.js`: the window's recorder and the note.
  - `bugcard.js` + `bugcard.css`: the card.
  - `dev/bugcard-test.js`: 16 unit checks, in `UNIT`.
  - `dev/checks/bugbutton68.js` and its fixture `dev/fixtures/bugbutton68/` (a fake crash marker and a last-run log).
  - The `bugbutton68` group in `dev/run-checks.js`.
- Changed (small, additive):
  - `main.js`: two lines.
  - `preload.js`: `hub.bug`.
  - `jankmain.js`: the IPC wrapper hands over failures.
  - `devreport-hooks.js`: one line.
  - `simplify.js`: the ⋯ row. `icons.js`: the `bug` icon.
  - `nativefeel-core.js` / `nativefeelmain.js` / `nativefeel.js`: the Help row.
  - `lazy-data.js` + `lazy-meta.js`: the groups and the manifest.
  - `sync-merge.js`: `bugbutton` is local-only.
  - `engines.js`: an engine program stopping on its own.
  - `aemain.js`: the After Effects bridge failing.
  - `dev/smoke.js`: errors marked "bugbutton68 (made on purpose)" aren't app errors.
- **For Codex:** two one-line, guarded additions in your files, each marked "(round 68, bugbutton68 — Claude's
  addition)":
  - `codex-server.js`: the app-server closing before Hearth closed it calls `bugmain.gone('Astra (its app-server)')`.
  - `creative-vstmain.js`: the plugin host's `close` while it's still the current host (`stop()` lets go of it first)
    calls `bugmain.gone('the plugin host (VST)')`.

  Neither changes behaviour.

## Tested
- `node dev/run-checks.js bugbutton68`: bugbutton68, unit:bugcard-test, slowbutton67, unit:slowcard-test, lazy,
  unit:boot-test, unit:datasafe-scan, unit:winmac-test and unit:errorcalm-scan.
- The check runs in a throwaway profile started from a fake crash marker (safetynet's `session.json` still "running")
  and a last-run log holding a key and a user folder:
  - The note "Hearth closed unexpectedly last time" shows, and it isn't offered twice. 🪲 See what happened (a real
    click) opens the saved report: "last sign of life 17:39", the VST host's exit code, the Lab error ×2, all
    redacted again.
  - It then makes four problems on purpose, each carrying a key, a password, a private folder or chat text: a real
    renderer throw, a main-process unhandled rejection, a failing request and a stopped program. All four are kept,
    with the page that was on screen, and all are redacted.
  - The card opens by real clicks on ⋯ › Something broke. Headline: "Something in the window broke, just now, in
    Projects." The counts, the list, the Earlier link, and Restart / Reload are there. Reload is greyed out while a
    reply is being written.
  - 📋 Copy report puts a report on the clipboard with no leaks. `/broke` opens the card too.
- The card was checked in a screenshot. The isolated runs used `flock /tmp/hearth-run.lock`.

## For the patch notes
- **New: 🪲 Something broke.** When Hearth acts up, click the **⋯** at the bottom of the left rail, then **Something
  broke** (right under "That was slow"). A small card says what went wrong lately in plain words, when it happened and
  which page you were on.
- On the card, **📋 Copy report for Claude** copies the details. Paste them into a Claude chat with a word about what
  you were doing, and the next update can fix exactly that. Nothing is sent anywhere by itself.
- The report never contains your chats, passwords or keys, or the names of your folders. Only Hearth's own folder
  shows.
- **↻ Restart Hearth** is right there on the card. **Reload this page only** reloads just the window and puts your
  screen, chats and Lab scene back. It waits while a reply is being written or a render is running.
- **If Hearth crashed or was force-closed**, the next start shows a small note, "Hearth closed unexpectedly last time".
  Click **🪲 See what happened** to see what went wrong before it closed. The last three are kept on this computer.
- It's also in the **Help** menu (on Windows, press Alt to show the menu bar).
- It costs nothing while nothing goes wrong: it only listens, and writes a small note when something breaks.
