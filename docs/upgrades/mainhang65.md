# mainhang65: the main process never hangs the app (round 65)

The owner: "the app hangs a lot and is laggy when scrolling/clicking/hovering" — "a hiccup every few seconds, about
everywhere, lasts for about a second or two … lagging for a few versions already". In Electron the whole app freezes
when the MAIN process is busy: every IPC call of the window (a chat opening, the list scrolling in rows, a hover asking
for a preview) waits behind it. This stream measures the main process on a big data folder and fixes what blocked it.
(The renderer's own long tasks — Sidequest's quest-journal / quest-atlas — are the other stream's.)

## How it is measured
- `mainlag-probe.js` (tests only: loaded by powerwisemain.js when a smoke run sets `HEARTH_LOOPLAG`; never in the
  owner's app): `perf_hooks.monitorEventLoopDelay` (10 ms resolution) from the first line of main.js, a 1 ms CPU profile
  of the main thread (inspector) cut into busy stretches with the app lines behind each, every `fs.*Sync` call by call
  site, IPC per channel (count, synchronous time), messages sent to pages. `HEARTH_SLOWFS_US=150` makes each sync fs
  call 150 µs slower: a Windows disk with Defender scanning (a stat ≈ 0.1–0.3 ms, a small read ≈ 0.3–1 ms there,
  against a few µs on Linux' tmpfs). Read with `hub.power.test({ lag: { label } })`.
- `dev/make-bighome-fixture.js`: 3,000 chats (+ 1,000 `.prev` copies), 600 attachments, 200 chats in the trash, a
  2,500-entry usage log, a 6,000-preset Sound bank index, 400 days of token stats, a 4,000-line work journal.
- `dev/checks/mainhang65.js` (`sh dev/run-checks.sh mainhang65`): startup (after the page is up), 30 s idle, everyday
  actions (12 chats opened and switched, the list searched / scrolled / hovered, the ✦ tracker and the board, a message
  to the fake engine, settings saved 4×, the daily backup), and sync with a cloud folder (the first pass reported, four
  everyday passes budgeted). Budget per phase: p99 < 50 ms, max < 200 ms.

## What was found (3,000 chats, Windows-slow disk)
| Phase | round 58 (d818e36) | round 64 (534dab0) | now |
|---|---|---|---|
| startup p99 / max | 16 / 243 ms¹ | 20 / 275 ms¹ | 11 / 13 ms |
| idle 30 s p99 / max | 11 / 17 ms | 12 / 42 ms | 12 / 51 ms |
| everyday actions + daily backup p99 / max | 15 / **1,425 ms** | 15 / **1,387 ms** | 14 / 102 ms |
| 4 sync passes p99 / max | – | 15 / 69 ms | 14 / 54 ms |

¹ the block was main.js loading its modules before the window existed (no window, no hang anyone sees); the check now
reports that apart.

1. **The daily backup froze the app for 1.4 s** (round 45 code, there since; bigger with every chat): its check after
   writing read and parsed every chat and settings file back with sync calls (4,013 `existsSync` + 4,013
   `readFileSync`), and the copy step made each file's folder with a sync `mkdir` (4,834 calls). Now the read-back uses
   `fs.promises.readFile` and gives way every ~8 ms while parsing, and each folder is made once, asynchronously. Same
   files checked, same zip. 1,387 ms → 102 ms max.
2. **Two copies (round 64) counted every chat with a stat each, twice, before the window** (`early()` and `gate()`),
   and the Start-menu shortcut check looked through the home folder, Desktop, Downloads, Documents and OneDrive for
   other Hearth folders, statting their chats, even in a copy that has chats (where the answer can't change anything).
   Now: a count without a stat (`countChats(…, { newest: false })`), counted only when the profile choice depends on it,
   `gate()` stops at the first chat (`anyChats()`), and other folders are searched only for a copy with no chats.
3. **Settings news the window already shows is let go** (renderer.js `configChanged`): every save of config.json comes
   back from the file watcher as "config changed", which redraws the rail, every surface, the layout and the whole
   chats list. A news identical to what was last drawn (same settings, same theme.css, and the window's settings
   unchanged since) changes nothing on screen and is now skipped; any other still redraws as before (saves made from the
   window rely on it). In this setup the redraw cost no long task (the list is virtualised), so this is a cheap guard,
   not the hiccup.
4. Sync passes: on 3,000 chats an everyday pass takes ~0.7 s, almost all of it waiting on the disk off the main thread;
   the main thread's longest stretch in a pass was 54–69 ms (path work + the state file). Not the hiccup here. On the
   owner's /smooth report, "sync pass ×1304" under "Adapted live" counts passes **held back while the owner was
   mid-gesture** (jank-report.js `adapted`: "held N background jobs until you paused"), not passes that ran slowly;
   the same for "weekly tidy ×62". The jank watch's own main-process cost is one native histogram (100 ms resolution);
   "profile (automatic)" samples the WINDOW's JS through its debugger for a few seconds, a few times a day.
5. Startup also showed `usage:stats` taking 724 ms once: the token stats are built from every chat the first time they
   are asked (once per install; the owner's are long built). Left as is.

## Not reproducible here (Windows only), noted for the next round
- Sync waits on the main thread when Windows holds a file (antivirus, OneDrive, the search indexer): `Atomics.wait`
  retries in datasafemain (config save: up to 0.6 s), store `chatNames` (0.4 s), fsapi `read` (0.3 s), scenesafe
  `readRetry` (0.3 s), crashsafe `writeAtomicSync` (0.4 s); `fsyncSync` on the main thread (config, token stats after
  each reply). Each is short alone but lands on the main thread exactly where Windows is slow. Moving them to the store
  thread / async is the next step if the owner's /smooth still shows main-process stalls.
- `winpolish` asks PowerShell (sync, up to 5 s) for a drive's type the first time something is deleted on that drive.
- The owner's main-process figure (p99 7.2 s, max 34 min over a week) includes stretches the computer was asleep (the
  34 minutes) — the jank watch pauses on 'suspend', but a Modern Standby laptop doesn't always say so.
- Linux only: Node's recursive `fs.watch` walks folders in JS with sync readdir / stat (native on Windows and the Mac):
  the sync's first pass and the folder watch's planning show ~0.9 s here; reported, not budgeted.

## Files
- New: `mainlag-probe.js` (tests only), `dev/make-bighome-fixture.js`, `dev/checks/mainhang65.js`.
- Changed: `backupautomain.js` (copy + verify off the main thread), `twocopies-core.js` (`countChats` options,
  `pickProfile` takes a count or a function), `twocopiesmain.js` (`anyChats`, lazy count), `appshell.js` (shortcut
  hold), `renderer.js` (`configChanged` skips identical news), `powerwisemain.js` (loads the probe in tests),
  `dev/run-checks.js` (fixture, env, the `mainhang65` group). No Codex files touched.

## For the patch notes
- **No more freeze during the daily backup.** With thousands of chats, Hearth's automatic backup check paused the whole
  app for a second or more; it now runs in the background without holding anything up.
- **Hearth starts a little faster with lots of chats**: it no longer looks at every chat file twice before the window
  opens.
- **Saving a setting no longer redraws everything when nothing changed.**
