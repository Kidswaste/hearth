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
  everyday passes budgeted). Budget per phase: p99 < 50 ms, max < 200 ms (a max over 200 ms counts when the main
  thread's profile shows a busy stretch ≥ 150 ms behind it: on the shared 4-CPU test machine a process also waits for
  a CPU with nothing of its own running). Round 64 fails it (everyday actions: max 1,561 ms, a 1,055 ms stretch in the
  backup); this round passes (max 87 ms).

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
3. Settings saves: every save of config.json comes back from the file watcher as "config changed" and redraws the
   rail, the surfaces, the layout and the chats list. Measured here: 4 saves, 4 redraws, no long task (the list is
   virtualised), so it is not the hiccup. A skip for news identical to what is drawn was tried and taken back:
   dev/checks/datasafe.js shows the held-settings recovery relies on that redraw.
4. Sync passes: on 3,000 chats an everyday pass takes ~0.7 s, almost all of it waiting on the disk off the main thread;
   the main thread's longest stretch in a pass was 54–69 ms (path work + the state file). Not the hiccup here. On the
   owner's /smooth report, "sync pass ×1304" under "Adapted live" counts passes **held back while the owner was
   mid-gesture** (jank-report.js `adapted`: "held N background jobs until you paused"), not passes that ran slowly;
   the same for "weekly tidy ×62". The jank watch's own main-process cost is one native histogram (100 ms resolution);
   "profile (automatic)" samples the WINDOW's JS through its debugger for a few seconds, a few times a day.
5. Startup also showed `usage:stats` taking 724 ms once: the token stats are built from every chat the first time they
   are asked (once per install; the owner's are long built). Left as is.

## Held files (second pass): no long sync waits on the main thread
Windows holds files for a moment (Defender, OneDrive, the search indexer). Hearth retried each held read / rename
with sync waits — on the main thread, the whole app froze meanwhile: 0.3 s per held read (`readRetry`, twice per kv
read: the file, then its .prev), 0.6 s per held settings save, 0.4 s per held atomic write / chats-folder listing.
- **On Electron's main thread a held file is retried for 50 ms at most in all** (5 + 10 + 15 + 20 ms), then reported
  held as before, and the callers' existing held paths take over (the last good copy, retries on a timer, the calm
  card): scenesafe-core `readRetry` (`waitFor` / `onUiThread`), crashsafe-core `writeAtomicSync`, store `chatNames`,
  fsapi `read`, the Sound bank's index rename. The store thread and Node keep the longer waits.
- **A held config.json rename** goes on on a timer (60…240 ms apart, as before) instead of on the spot; reads give the
  new settings meanwhile; the last resort (written in place) is unchanged.
- **A settings save made while config.json was held now lands before the window is told the file reads again**
  (datasafemain `landHeld`). Before, the recovery check could tell the window first, the window saved the file's
  settings, and the held save was dropped (dev/checks/datasafe.js failed 3 of 3 once the main thread no longer slept).
- **Token stats after every reply**: kept in memory while written off the main thread (crashsafe's async
  `writeAtomic`: temp file, flush, rename), one at a time, newest last; anything unwritten is written at quit. Before:
  read + fsync + rename on the main thread after each reply.
- **The drive-type question for the Recycle Bin check** (winpolish, a sync PowerShell call of 0.5–5 s the first time
  something on another drive is deleted): asked once for every drive in the background a minute after start on
  Windows (`warmDrives`); the sync call remains only for a drive plugged in later.
- Measured (mainhang65's new phase: settings, memory, notes, chat meta and the chats folder held ~15 s while saving
  settings 3×, listing chats, reading memory / notes, opening 9 chats, sending a message; test faults now read live,
  `HEARTH_FAULTS_LIVE`, and `rename: true` holds a save): **before p99 39 ms, max 611 ms (two 300 ms waits back to
  back) → after p99 31–40 ms, max 67–75 ms**; the held save lands once the file is free in both.
- Kept: the config write's own fsync stays sync (a settings save must be on the disk before it replaces the file, and
  its callers are sync); startup reads before the window keep the short cap too.

## Not reproducible here (Windows only)
- The owner's main-process figure (p99 7.2 s, max 34 min over a week) includes stretches the computer was asleep (the
  34 minutes) — the jank watch pauses on 'suspend', but a Modern Standby laptop doesn't always say so.
- Linux only: Node's recursive `fs.watch` walks folders in JS with sync readdir / stat (native on Windows and the Mac):
  the sync's first pass and the folder watch's planning show ~0.9 s here; reported, not budgeted.

## Files
- New: `mainlag-probe.js` (tests only), `dev/make-bighome-fixture.js`, `dev/checks/mainhang65.js`.
- Changed (second pass): `scenesafe-core.js`, `crashsafe-core.js`, `datasafemain.js`, `datasafe-core.js` (test faults:
  live, rename), `store.js`, `fsapi.js`, `soundbankmain.js`, `winpolish.js`, `main.js` (warmDrives).
- Changed: `backupautomain.js` (copy + verify off the main thread), `twocopies-core.js` (`countChats` options,
  `pickProfile` takes a count or a function), `twocopiesmain.js` (`anyChats`, lazy count), `appshell.js` (shortcut
  hold), `powerwisemain.js` (loads the probe in tests),
  `dev/run-checks.js` (fixture, env, the `mainhang65` group). No Codex files touched.

## For the patch notes
- **No more freeze during the daily backup.** With thousands of chats, Hearth's automatic backup check paused the whole
  app for a second or more; it now runs in the background without holding anything up.
- **Hearth starts a little faster with lots of chats**: it no longer looks at every chat file twice before the window
  opens.
- **No more freezes while Windows holds a file.** When your antivirus or OneDrive held Hearth's settings, memory or
  chats for a moment, the whole app could freeze for up to half a second each time; now Hearth tries again in the
  background and stays responsive. A setting you changed meanwhile is still saved once the file is free.
- **Replies finish without a hitch**: the token counter is saved in the background.
